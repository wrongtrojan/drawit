import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startSessionHost } from "@drawit/session";
import { invoke } from "./invoke.js";

let closeHost: (() => Promise<void>) | null = null;

afterEach(async () => {
  if (closeHost) await closeHost();
  closeHost = null;
  delete process.env.DRAWIT_HOME;
});

describe("mcp bridge", () => {
  it("creates a flowchart through the live session and rejects a stale text edit", async () => {
    const home = await mkdtemp(join(tmpdir(), "drawit-mcp-"));
    process.env.DRAWIT_HOME = home;
    const host = await startSessionHost({ home, replace: true });
    closeHost = host.close;
    const created = await invoke({ type: "create", title: "三节点流程" }, home);
    expect(created.ok).toBe(true);
    const added = await invoke({
      type: "apply",
      source: "mcp",
      expectedRevision: 0,
      operations: [
        { op: "addNodes", nodes: [{ type: "flowchart", kind: "terminator", id: "start", text: "开始" }, { type: "flowchart", kind: "process", id: "work", text: "处理", x: 220 }, { type: "flowchart", kind: "terminator", id: "end", text: "结束", x: 440 }] },
        { op: "connect", edges: [{ id: "e1", source: "start", target: "work" }, { id: "e2", source: "work", target: "end" }] },
      ],
    }, home);
    expect(added.ok).toBe(true);
    expect(added.document?.nodes).toHaveLength(3);
    expect(added.document?.edges).toHaveLength(2);
    const moved = await invoke({ type: "apply", source: "gui", expectedRevision: added.revision, operations: [{ op: "updateNodes", updates: [{ id: "work", patch: { x: 260, y: 180 } }] }] }, home);
    expect(moved.ok).toBe(true);
    const read = await invoke({ type: "get" }, home);
    expect(read.document?.nodes.find((node) => node.id === "work")?.x).toBe(260);
    const stale = await invoke({ type: "apply", source: "mcp", expectedRevision: added.revision, operations: [{ op: "updateNodes", updates: [{ id: "start", patch: { text: "过期" } }] }] }, home);
    expect(stale.ok).toBe(false);
    expect(stale.code).toBe("REVISION_CONFLICT");
    const review = await invoke({ type: "review" }, home);
    expect(review.ok).toBe(true);
    expect(review.revision).toBe(read.document?.revision === undefined ? moved.revision : review.revision);
    expect(review.pngBase64).toBeTruthy();
    expect(review.manifest && typeof review.manifest === "object" && "revision" in review.manifest ? review.manifest.revision : undefined).toBe(review.revision);
  });
});
