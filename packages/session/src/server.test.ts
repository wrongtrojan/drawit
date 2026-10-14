import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startSessionHost } from "./server.js";
import type { SessionEvent, SessionResponse } from "./protocol.js";

function connect(port: number, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.token = token;
  });
}

declare module "ws" {
  interface WebSocket {
    token?: string;
  }
}

function call(socket: WebSocket, message: Record<string, unknown>): Promise<SessionResponse> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString()) as SessionResponse | SessionEvent;
      if (parsed.type === "response" && parsed.requestId === requestId) {
        socket.off("message", onMessage);
        resolve(parsed);
      }
    };
    socket.on("message", onMessage);
    socket.send(JSON.stringify({ ...message, requestId, token: socket.token }));
    setTimeout(() => reject(new Error("timeout")), 8000);
  });
}

describe("session host", () => {
  it("syncs two clients and rejects a stale write", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-session-"));
    const host = await startSessionHost({ home, port: 0, replace: true });
    const gui = await connect(host.port, host.token);
    const agent = await connect(host.port, host.token);
    const seen: SessionEvent[] = [];
    gui.on("message", (data) => {
      const parsed = JSON.parse(data.toString()) as SessionEvent;
      if (parsed.type === "event" && parsed.event === "revision") seen.push(parsed);
    });
    const created = await call(agent, { type: "create", title: "同步测试", source: "mcp" });
    expect(created.ok).toBe(true);
    const added = await call(agent, {
      type: "apply",
      source: "mcp",
      expectedRevision: 0,
      operations: [
        { op: "addNodes", nodes: [{ type: "rectangle", id: "a", text: "A", x: 40, y: 40 }, { type: "rectangle", id: "b", text: "B", x: 240, y: 40 }, { type: "rectangle", id: "c", text: "C", x: 440, y: 40 }] },
        { op: "connect", edges: [{ id: "ab", source: "a", target: "b" }, { id: "bc", source: "b", target: "c" }] },
      ],
    });
    expect(added.ok).toBe(true);
    expect(added.revision).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.some((event) => event.document?.nodes.length === 3)).toBe(true);
    const moved = await call(gui, {
      type: "apply",
      source: "gui",
      expectedRevision: 1,
      operations: [{ op: "updateNodes", updates: [{ id: "b", patch: { x: 300, y: 120 } }] }],
    });
    expect(moved.ok).toBe(true);
    const read = await call(agent, { type: "get" });
    const node = read.document?.nodes.find((item) => item.id === "b");
    expect(node?.x).toBe(300);
    expect(node?.y).toBe(120);
    const stale = await call(agent, {
      type: "apply",
      source: "mcp",
      expectedRevision: 1,
      operations: [{ op: "updateNodes", updates: [{ id: "a", patch: { text: "过期" } }] }],
    });
    expect(stale.ok).toBe(false);
    expect(stale.code).toBe("REVISION_CONFLICT");
    const current = await call(agent, { type: "get" });
    expect(current.document?.nodes.find((item) => item.id === "a")?.type).toBe("rectangle");
    expect(current.document?.nodes.find((item) => item.id === "a") && (current.document?.nodes.find((item) => item.id === "a") as { text?: string }).text).not.toBe("过期");
    gui.close();
    agent.close();
    await host.close();
  });
});
