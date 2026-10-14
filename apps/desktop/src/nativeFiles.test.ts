// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createDocument } from "@drawit/core";
import { saveDocument, exportDocument, type NativeInvoke } from "./nativeFiles.js";
it("cancels folder selection without a write or session save", async () => {
  const request = vi.fn(); const invoke = vi.fn(async () => null) as NativeInvoke;
  expect(await saveDocument({ request }, "doc", false, invoke)).toEqual({ cancelled: true }); expect(request).not.toHaveBeenCalled();
});
it("writes only a bound snapshot, then completes the internal copy without clearing later edits", async () => {
  const document = createDocument("save", "doc"); document.revision = 7;
  const request = vi.fn(async (body) => body.type === "prepareSave" ? { type: "response" as const, requestId: "prepare", ok: true, document, snapshotId: "snapshot" } : { type: "response" as const, requestId: "complete", ok: true, document: { ...document, revision: 8 }, savedRevision: 7, dirty: true });
  const invoke = vi.fn(async (command) => command === "drawit_choose_directory" ? { handle: "opaque", path: "/selected" } : { path: "/selected/doc.drawit.json", revision: 7 }) as NativeInvoke;
  const result = await saveDocument({ request }, "doc", true, invoke);
  expect(result.response).toMatchObject({ savedRevision: 7, dirty: true });
  const payload = (invoke as any).mock.calls[1][1]; expect(payload.handle).toBe("opaque"); expect(payload).not.toHaveProperty("path"); expect(JSON.parse(payload.payload)).toEqual(document);
  expect(request.mock.calls[1]![0]).toEqual({ type: "completeSave", expectedDocumentId: "doc", snapshotId: "snapshot" });
});
it("does not mark saved after an external write failure and releases the prepared snapshot", async () => {
  const request = vi.fn(async (body) => ({ type: "response" as const, requestId: "test", ok: true, document: createDocument("save", "doc"), snapshotId: "snapshot" }));
  const invoke = vi.fn(async (command) => { if (command === "drawit_choose_directory") return { handle: "opaque" }; throw new Error("permission denied"); }) as NativeInvoke;
  await expect(saveDocument({ request }, "doc", false, invoke)).rejects.toThrow("permission denied");
  expect(request.mock.calls.map(([body]) => body.type)).toEqual(["prepareSave", "cancelSave"]);
});
it("exports through an opaque native handle without exposing a session output path", async () => {
  const request = vi.fn(async (_body: Record<string, unknown>) => ({ type: "response" as const, requestId: "render", ok: true, revision: 3, svg: "<svg/>" }));
  const invoke = vi.fn(async (command) => command === "drawit_choose_directory" ? { handle: "opaque" } : { path: "/selected/doc.svg", revision: 3 }) as NativeInvoke;
  await exportDocument({ request }, "doc", "svg", invoke);
  expect(request.mock.calls[0]![0]).toEqual({ type: "render", expectedDocumentId: "doc", format: "svg" });
});
