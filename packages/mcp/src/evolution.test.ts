import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { componentCatalog } from "@drawit/core";
import { startSessionHost } from "@drawit/session";
import { invoke } from "./invoke.js";
describe("semantic catalog bridge", () => {
  it("submits discovered class and swimlane semantics to the live editor and saves stable ids", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-evolution-mcp-"));
    const host = await startSessionHost({ home });
    try {
      await invoke({ type: "create", title: "目录指导的图" }, home);
      const component = componentCatalog().find((item) => item.type === "class")!;
      const result = await invoke({ type: "apply", expectedRevision: 0, operations: component.exampleOperations }, home);
      expect(result).toMatchObject({ ok: true, revision: 1 });
      const before = result.document;
      const stale = await invoke({ type: "apply", expectedRevision: 0, operations: component.exampleOperations }, home);
      expect(stale).toMatchObject({ ok: false, code: "REVISION_CONFLICT" });
      expect((await invoke({ type: "get" }, home)).document).toEqual(before);
      expect(await invoke({ type: "save" }, home)).toMatchObject({ ok: true, dirty: false, revision: 1 });
      await invoke({ type: "create", title: "泳道" }, home);
      const lane = await invoke({ type: "apply", expectedRevision: 0, operations: [{ op: "addNodes", nodes: [{ type: "swimlane", id: "lane", title: "审批人", direction: "horizontal" }, { type: "state", id: "step", parentId: "lane", x: 80, y: 60, kind: "state", text: "审批" }] }] }, home);
      expect(lane.ok).toBe(true); expect(lane.document?.nodes[1]?.parentId).toBe("lane");
      await invoke({ type: "save" }, home);
      const review = await invoke({ type: "review" }, home); expect(review.pngBase64).toBeTruthy();
    } finally { await host.close(); }
  });
  it("rejects unsupported offline node types with VALIDATION_ERROR and leaves the file unchanged", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-unknown-"));
    await invoke({ type: "create", title: "不能冒充" }, home);
    const before = (await invoke({ type: "get" }, home)).document;
    const result = await invoke({ type: "apply", expectedRevision: 0, operations: [{ op: "addNodes", nodes: [{ type: "invented", text: "伪图元" }] }] }, home);
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect((await invoke({ type: "get" }, home)).document).toEqual(before);
  });
});
