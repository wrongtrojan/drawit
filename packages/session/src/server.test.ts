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
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolve(parsed);
      }
    };
    socket.on("message", onMessage);
    socket.send(JSON.stringify({ ...message, requestId, token: socket.token }));
    const timer = setTimeout(() => { socket.off("message", onMessage); reject(new Error("timeout")); }, 8000);
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
    await call(gui, { type: "subscribe" });
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

describe("session persistence", () => {
  it("recovers acknowledged unsaved content after host restart without reporting it saved", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-recovery-"));
    let host = await startSessionHost({ home }); let socket = await connect(host.port, host.token);
    try {
      const created = await call(socket, { type: "create", title: "recovery" });
      await call(socket, { type: "apply", expectedRevision: 0, operations: [{ op: "addNodes", nodes: [{ type: "text", id: "unsaved", text: "未保存内容" }] }] });
      socket.terminate(); await host.close();
      host = await startSessionHost({ home }); socket = await connect(host.port, host.token);
      const recovered = await call(socket, { type: "get" });
      expect(recovered).toMatchObject({ ok: true, dirty: true, revision: 1, document: { documentId: created.document!.documentId } });
      expect(recovered.document!.nodes[0]).toMatchObject({ id: "unsaved", text: "未保存内容" });
    } finally { socket.terminate(); await host.close(); }
  });
  it("completes an exact saved snapshot while keeping concurrent edits dirty and refuses reused tokens", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-snapshot-")); const host = await startSessionHost({ home }); const socket = await connect(host.port, host.token);
    try {
      const created = await call(socket, { type: "create", title: "快照保存" }); const id = created.document!.documentId;
      await call(socket, { type: "apply", expectedRevision: 0, operations: [{ op: "addNodes", nodes: [{ id: "stable", type: "text", text: "first" }] }] });
      const prepared = await call(socket, { type: "prepareSave", expectedDocumentId: id });
      await call(socket, { type: "apply", expectedRevision: 1, operations: [{ op: "updateNodes", updates: [{ id: "stable", patch: { text: "second" } }] }] });
      const saved = await call(socket, { type: "completeSave", snapshotId: prepared.snapshotId, expectedDocumentId: id });
      expect(saved).toMatchObject({ ok: true, revision: 2, savedRevision: 1, dirty: true });
      const { readDocumentFile } = await import("@drawit/core/node"); const disk = await readDocumentFile(saved.path!);
      expect(disk.revision).toBe(1); expect((disk.nodes[0] as { text: string }).text).toBe("first");
      expect(await call(socket, { type: "completeSave", snapshotId: prepared.snapshotId })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      const current = await call(socket, { type: "get" }); expect((current.document!.nodes[0] as { text: string }).text).toBe("second");
      expect(await call(socket, { type: "save", source: "gui", outputDirectory: "/outside" })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    } finally { socket.close(); await host.close(); }
  });
  it("requires save before switching and reopens stable ids without changing revision on save", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-save-"));
    const host = await startSessionHost({ home });
    const socket = await connect(host.port, host.token);
    try {
      const created = await call(socket, { type: "create", title: "保存回归" });
      const added = await call(socket, { type: "apply", expectedRevision: 0, operations: [{ op: "addNodes", nodes: [{ id: "stable", type: "table", headers: ["字段", "值"], cells: [["页号", "0x1"]] }] }] });
      expect(added.dirty).toBe(true);
      expect(await call(socket, { type: "create", title: "不应创建" })).toMatchObject({ ok: false, code: "TRANSACTION_FAILED" });
      const saved = await call(socket, { type: "save" });
      expect(saved).toMatchObject({ dirty: false, revision: 1 });
      await call(socket, { type: "create", title: "第二份" });
      const opened = await call(socket, { type: "open", documentId: created.document?.documentId });
      expect(opened.document?.nodes).toEqual(added.document?.nodes);
      expect(opened.revision).toBe(1);
      const removed = await call(socket, { type: "delete", documentId: created.document?.documentId });
      expect(removed.ok).toBe(true);
      expect(removed.documents?.some((item) => item.documentId === created.document?.documentId)).toBe(false);
      expect(removed.document?.documentId).not.toBe(created.document?.documentId);
    } finally { socket.terminate(); await host.close(); }
  });

  it("notifies about external files without replacing dirty memory until explicit reload", async () => {
    const { writeFile } = await import("node:fs/promises");
    const home = await mkdtemp(join(tmpdir(), "drawit-external-"));
    const host = await startSessionHost({ home });
    const socket = await connect(host.port, host.token);
    try {
      const initial = await call(socket, { type: "subscribe" });
      await call(socket, { type: "apply", expectedRevision: initial.revision, operations: [{ op: "updateDocument", patch: { title: "内存修改" } }] });
      const changed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("No external file notification")), 3000);
        socket.on("message", (data) => { const event = JSON.parse(String(data)); if (event.event === "externalChange") { clearTimeout(timer); resolve(); } });
      });
      const external = { ...initial.document!, title: "外部修改" };
      await writeFile(initial.path!, JSON.stringify(external));
      await changed;
      expect((await call(socket, { type: "get" })).document?.title).toBe("内存修改");
      const reloaded = await call(socket, { type: "reload", source: "gui" });
      expect(reloaded.document?.title).toBe("外部修改");
      expect(reloaded).toMatchObject({ revision: 2, dirty: false });
    } finally { socket.terminate(); await host.close(); }
  });
});
