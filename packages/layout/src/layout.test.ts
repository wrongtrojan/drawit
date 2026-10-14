import { createDocument, parseDocument } from "@drawit/core";
import { describe, expect, it } from "vitest";
import { layoutDocument } from "./index.js";

describe("layout", () => {
  it("places a chain from top to bottom and keeps pinned nodes", async () => {
    const document = parseDocument({
      ...createDocument("布局"),
      nodes: [
        { id: "a", type: "rectangle", text: "A", x: 0, y: 0, width: 120, height: 48 },
        { id: "b", type: "rectangle", text: "B", x: 0, y: 0, width: 120, height: 48 },
        { id: "c", type: "rectangle", text: "C", x: 40, y: 40, width: 120, height: 48, pinned: true },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ],
    });
    const result = await layoutDocument(document, { direction: "TB", nodeSpacing: 40, rankSpacing: 60 });
    const byId = new Map(result.updates.map((update) => [update.id, update.patch]));
    expect((byId.get("b")?.y ?? 0) > (byId.get("a")?.y ?? 0)).toBe(true);
    expect(byId.has("c")).toBe(false);
    expect(result.bounds.width).toBeGreaterThan(0);
  });
});

it("keeps pinned swimlanes intact and places children past the header", async () => {
  const { materializeNode } = await import("@drawit/core");
  const document = createDocument("泳道布局");
  document.nodes = [materializeNode({ type: "swimlane", id: "lane", pinned: true, x: 100, y: 100 }, "lane"), materializeNode({ type: "flowchart", id: "step", parentId: "lane", x: 80, y: 60 }, "step")];
  const layout = await layoutDocument(document, { direction: "LR", nodeSpacing: 48, rankSpacing: 72 });
  expect(layout.updates.some((update) => update.id === "lane")).toBe(false);
  const step = layout.updates.find((update) => update.id === "step");
  expect(step?.patch.x).toBeGreaterThanOrEqual(72);
});
