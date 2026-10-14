import { documentSchema } from "@drawit/core";
import type { SessionEvent, SessionResponse } from "@drawit/session/protocol";
import { z } from "zod/v4";

const envelope = z.union([
  z.object({ type: z.literal("response"), requestId: z.string(), ok: z.boolean(), document: documentSchema.optional(), revision: z.number().int().nonnegative().optional() }).passthrough(),
  z.object({ type: z.literal("event"), event: z.enum(["revision", "view", "saved", "externalChange"]), document: documentSchema.optional(), view: z.object({ selection: z.array(z.string()), viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive() }) }).optional() }).passthrough(),
]);
type Pending = { resolve: (value: SessionResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class EditorSocket {
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private token = "";
  private generation = 0;
  private cancelConnect: (() => void) | null = null;
  onDisconnect: (() => void) | null = null;
  onEvent: ((event: SessionEvent) => void) | null = null;
  onProtocolError: ((error: Error) => void) | null = null;
  constructor(private makeSocket = (url: string) => new WebSocket(url), private timeoutMs = 15000) {}
  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN; }
  get pendingCount(): number { return this.pending.size; }

  close(): void {
    this.generation++;
    this.cancelConnect?.(); this.cancelConnect = null;
    const old = this.socket; this.socket = null;
    old?.close();
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error("本机会话已断开；写入结果未知，请重新读取")); }
    this.pending.clear();
  }

  async connect(port: number, token: string): Promise<void> {
    this.close(); this.token = token;
    const generation = this.generation;
    await new Promise<void>((resolve, reject) => {
      const socket = this.makeSocket(`ws://127.0.0.1:${port}`);
      this.socket = socket;
      const active = () => this.socket === socket && generation === this.generation;
      const timer = setTimeout(() => { if (active()) { this.close(); reject(new Error("连接绘图会话超时")); } }, this.timeoutMs);
      this.cancelConnect = () => { clearTimeout(timer); reject(new Error("连接已取消")); };
      socket.onopen = () => { clearTimeout(timer); if (active()) { this.cancelConnect = null; resolve(); } else { socket.close(); reject(new Error("连接已取消")); } };
      socket.onerror = () => { clearTimeout(timer); reject(new Error("无法连接绘图会话")); };
      socket.onmessage = (event) => {
        if (!active()) return;
        try {
          const parsed = envelope.safeParse(JSON.parse(String(event.data)));
          if (!parsed.success) throw new Error("会话返回了无效消息");
          const message = parsed.data as SessionResponse | SessionEvent;
          if (message.type === "response") {
            const item = this.pending.get(message.requestId);
            if (item) { clearTimeout(item.timer); this.pending.delete(message.requestId); item.resolve(message); }
          } else this.onEvent?.(message);
        } catch (error) { this.onProtocolError?.(error instanceof Error ? error : new Error("无效会话消息")); }
      };
      socket.onclose = () => {
        clearTimeout(timer);
        if (!active()) return;
        this.close(); reject(new Error("本机会话已断开")); this.onDisconnect?.();
      };
    });
  }

  request(body: Record<string, unknown>): Promise<SessionResponse> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.socket) { reject(new Error("绘图会话未连接")); return; }
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error("绘图会话超时；写入结果未知，请重新读取")); }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ ...body, requestId, token: this.token })); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }
}

export class RevisionGate {
  private sessionId?: string;
  private epoch = -1;
  private documentId?: string;
  private revision = -1;
  accept(value: Pick<SessionResponse, "document" | "sessionId" | "documentEpoch" | "revision">, authoritative = false): boolean {
    const document = value.document;
    if (authoritative) { this.sessionId = value.sessionId; this.epoch = value.documentEpoch ?? 0; this.documentId = document?.documentId; this.revision = document?.revision ?? -1; return true; }
    if (this.sessionId && value.sessionId !== this.sessionId) return false;
    const epoch = value.documentEpoch ?? this.epoch;
    if (epoch < this.epoch) return false;
    if (epoch === this.epoch && document && this.documentId && document.documentId !== this.documentId) return false;
    const revision = document?.revision ?? value.revision;
    if (epoch === this.epoch && revision !== undefined && revision < this.revision) return false;
    if (document) { this.sessionId = value.sessionId; this.epoch = epoch; this.documentId = document.documentId; this.revision = document.revision; }
    return true;
  }
}

export async function discoverSession(): Promise<{ port: number; token: string }> {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (command: string) => Promise<{ port: number; token: string }> } }).__TAURI_INTERNALS__;
  const value = tauri?.invoke ? await tauri.invoke("drawit_session") : await fetch("/__drawit/session", { signal: AbortSignal.timeout(5000) }).then((response) => { if (!response.ok) throw new Error("绘图会话尚未就绪"); return response.json(); });
  return z.object({ port: z.number().int().min(1).max(65535), token: z.string().min(16).max(128) }).parse(value);
}
