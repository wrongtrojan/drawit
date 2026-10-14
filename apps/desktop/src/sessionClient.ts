import type { SessionEvent, SessionResponse } from "@drawit/session/protocol";

export class EditorSocket {
  private socket: WebSocket | null = null;
  private pending = new Map<string, (value: SessionResponse) => void>();
  private token = "";
  onEvent: ((event: SessionEvent) => void) | null = null;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(port: number, token: string): Promise<void> {
    this.token = token;
    if (this.socket) this.socket.close();
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("无法连接绘图会话"));
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as SessionResponse | SessionEvent;
        if (message.type === "response") {
          this.pending.get(message.requestId)?.(message);
          this.pending.delete(message.requestId);
        } else {
          this.onEvent?.(message);
        }
      };
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
      };
      this.socket = socket;
    });
  }

  request(body: Record<string, unknown>): Promise<SessionResponse> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error("绘图会话未连接"));
        return;
      }
      this.pending.set(requestId, resolve);
      this.socket.send(JSON.stringify({ ...body, requestId, token: this.token }));
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error("绘图会话超时"));
        }
      }, 15000);
    });
  }
}

export async function discoverSession(): Promise<{ port: number; token: string }> {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (command: string) => Promise<{ port: number; token: string }> } }).__TAURI_INTERNALS__;
  if (tauri?.invoke) {
    return tauri.invoke("drawit_session");
  }
  const response = await fetch("/__drawit/session");
  if (!response.ok) throw new Error("绘图会话尚未就绪");
  return response.json() as Promise<{ port: number; token: string }>;
}
