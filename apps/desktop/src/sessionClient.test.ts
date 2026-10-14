import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument } from "@drawit/core";
import { EditorSocket, RevisionGate } from "./sessionClient.js";
class FakeSocket {
  readyState = 0; onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  send(value: string) { this.sent.push(value); }
  emit(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
afterEach(() => vi.useRealTimers());
describe("editor connection lifecycle", () => {
  it("rejects interrupted writes, clears timers and ignores stale connections", async () => {
    vi.useFakeTimers(); const sockets: FakeSocket[] = [];
    const client = new EditorSocket(() => { const socket = new FakeSocket(); sockets.push(socket); return socket as unknown as WebSocket; });
    const connected = client.connect(1000, "token"); sockets[0]!.open(); await connected;
    const write = client.request({ type: "apply" }); const rejected = expect(write).rejects.toThrow("写入结果未知");
    client.close(); await rejected; expect(client.pendingCount).toBe(0); expect(vi.getTimerCount()).toBe(0);
    const next = client.connect(1001, "token"); sockets[1]!.open(); await next;
    const callback = vi.fn(); client.onEvent = callback;
    sockets[0]!.emit({ type: "event", event: "saved" }); expect(callback).not.toHaveBeenCalled();
    sockets[1]!.emit({ type: "event", event: "saved" }); expect(callback).toHaveBeenCalledOnce(); client.close();
  });
  it("cleans completed and timed out requests without replaying a write", async () => {
    vi.useFakeTimers(); const socket = new FakeSocket(); const client = new EditorSocket(() => socket as unknown as WebSocket, 100);
    const connection = client.connect(1000, "token"); socket.open(); await connection;
    const get = client.request({ type: "get" }); socket.emit({ type: "response", requestId: JSON.parse(socket.sent[0]!).requestId, ok: true }); await get;
    expect(vi.getTimerCount()).toBe(0);
    const write = client.request({ type: "apply" }); const rejected = expect(write).rejects.toThrow("结果未知");
    await vi.advanceTimersByTimeAsync(101); await rejected; expect(client.pendingCount).toBe(0); expect(socket.sent).toHaveLength(2); client.close();
  });
  it("contains malformed messages and cancels a pending connection", async () => {
    const socket = new FakeSocket(); const client = new EditorSocket(() => socket as unknown as WebSocket);
    client.onProtocolError = vi.fn(); const connecting = client.connect(1000, "token"); const rejected = expect(connecting).rejects.toThrow("取消");
    socket.emit(null); expect(client.onProtocolError).toHaveBeenCalledOnce(); client.close(); await rejected;
  });
});
it("rejects old revisions, document epochs and hosts but allows an authoritative reconnect", () => {
  const gate = new RevisionGate(); const a = createDocument("A", "a"), b = createDocument("B", "b"); a.revision = 10;
  expect(gate.accept({ sessionId: "host", documentEpoch: 1, document: a }, true)).toBe(true);
  expect(gate.accept({ sessionId: "host", documentEpoch: 1, document: { ...a, revision: 9 } })).toBe(false);
  expect(gate.accept({ sessionId: "host", documentEpoch: 2, document: b })).toBe(true);
  expect(gate.accept({ sessionId: "host", documentEpoch: 1, document: a })).toBe(false);
  expect(gate.accept({ sessionId: "old", documentEpoch: 3, document: a })).toBe(false);
  expect(gate.accept({ sessionId: "new", documentEpoch: 0, document: b }, true)).toBe(true);
});
