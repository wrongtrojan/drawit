import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { componentCatalog, contentSize, createDocument, DocumentController, materializeNode, nodeInputSchema, operationSchema, parseDocument, treeLayout, graphLayout, gridLayout, absolutePosition, unsupportedDiagramKinds, edgeEndpoints, edgeSchema } from "./index.js";
import { readDocumentFile, writeDocumentFile } from "./node.js";

const types = ["class", "entity", "relationship", "state", "swimlane", "axis", "tensor", "timeline"];
describe("semantic types", () => {
  it("connects initial and final states to their visible symbols", () => {
    const nodes = [materializeNode({ type: "state", kind: "initial", x: 40, y: 140 }, "a"), materializeNode({ type: "state", kind: "final", x: 400, y: 140 }, "b")];
    const endpoints = edgeEndpoints(nodes, edgeSchema.parse({ id: "edge", source: "a", target: "b" }))!;
    expect(endpoints.source).toEqual({ x: 130, y: 164 });
    expect(endpoints.target).toEqual({ x: 464, y: 164 });
  });
  it.each(types)("creates, patches and saves %s with stable semantic fields and ids", async (type) => {
    const component = componentCatalog().find((item) => item.type === type)!;
    expect(component.usage).toBeTruthy(); expect(component.semanticFields.length).toBeGreaterThan(0);
    const controller = new DocumentController(createDocument(type));
    const added = await controller.apply({ expectedRevision: 0, source: "mcp", operations: component.exampleOperations.map((operation) => operationSchema.parse(operation)) });
    expect(added.ok).toBe(true);
    const document = await controller.getSnapshot();
    const patch = type === "state" ? { text: "新的状态" } : ["swimlane", "axis", "timeline"].includes(type) ? { title: "新标题" } : { name: "新名称" };
    const updated = await controller.apply({ expectedRevision: 1, source: "gui", operations: [{ op: "updateNodes", updates: [{ id: document.nodes[0]!.id, patch }] }] });
    expect(updated.ok).toBe(true);
    const current = await controller.getSnapshot();
    const path = join(await mkdtemp(join(tmpdir(), "drawit-semantic-")), `${type}.drawit.json`);
    await writeDocumentFile(path, current);
    expect(await readDocumentFile(path)).toEqual(current);
    const stale = await controller.apply({ expectedRevision: 1, source: "mcp", operations: [{ op: "updateDocument", patch: { title: "过期" } }] });
    expect(stale).toMatchObject({ ok: false, code: "REVISION_CONFLICT" });
    expect(await controller.getSnapshot()).toEqual(current);
  });
  it("catalog examples are directly submittable, including sequence prerequisites", async () => {
    for (const component of componentCatalog()) {
      const controller = new DocumentController(createDocument("目录"));
      const result = await controller.apply({ expectedRevision: 0, source: "mcp", operations: component.exampleOperations.map((operation) => operationSchema.parse(operation)) });
      expect(result.ok, component.id).toBe(true);
      expect(component).not.toHaveProperty("propertySchema");
      for (const field of component.semanticFields) expect(component.example, `${component.id}.${field}`).toHaveProperty(field);
    }
    expect(unsupportedDiagramKinds()).toEqual([]);
  });
  it("rejects unknown types and invalid axis/timeline transactions without partial changes", async () => {
    expect(nodeInputSchema.safeParse({ type: "invented", name: "fake" }).success).toBe(false);
    expect(() => materializeNode({ type: "invented" }, "fake")).toThrow("Unsupported node type");
    for (const input of [{ type: "axis", min: 2, max: 1 }, { type: "axis", min: 0, max: 10, ticks: [{ value: 12 }] }, { type: "timeline", milestones: [{ date: "2026-02-30", label: "不存在" }] }]) {
      const controller = new DocumentController(createDocument("回滚"));
      const operations = operationSchema.array().parse([{ op: "addNodes", nodes: [{ type: "text", text: "不能留下" }, input] }]);
      const result = await controller.apply({ expectedRevision: 0, source: "mcp", operations });
      expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
      expect((await controller.getSnapshot()).nodes).toEqual([]);
    }
  });
  it("supports swimlane parent coordinates, reparenting and deletion", async () => {
    const document = createDocument("泳道");
    document.nodes = [materializeNode({ type: "swimlane", id: "lane", x: 100, y: 200 }, "lane"), materializeNode({ type: "flowchart", id: "step", x: 80, y: 60, parentId: "lane" }, "step")];
    expect(absolutePosition(document.nodes, "step")).toEqual({ x: 180, y: 260 });
    expect(parseDocument(document)).toEqual(document);
    const controller = new DocumentController(document);
    await controller.apply({ expectedRevision: 0, source: "gui", operations: [{ op: "updateNodes", updates: [{ id: "step", patch: { parentId: null } }] }] });
    expect(absolutePosition((await controller.getSnapshot()).nodes, "step")).toEqual({ x: 180, y: 260 });
  });
  it("keeps repeated tree labels attached to their structural parent", () => {
    const tree = materializeNode({ type: "tree", root: { label: "总览", children: [{ label: "甲", children: [{ label: "重名", children: [] }] }, { label: "乙", children: [{ label: "重名", children: [] }] }] } }, "tree");
    if (tree.type !== "tree") throw new Error();
    const leaves = treeLayout(tree).vertices.filter((vertex) => vertex.label === "重名");
    expect(leaves.map((vertex) => vertex.parentId)).toEqual(["root_0", "root_1"]);
    expect(new Set(leaves.map((vertex) => vertex.id)).size).toBe(2);
  });
  it("uses increasing ranks for a directed path and grows long cells and many vertices", () => {
    const graph = materializeNode({ type: "graph", vertices: ["a", "b", "c"].map((id) => ({ id, label: id })), links: [{ source: "a", target: "b", label: "输入" }, { source: "b", target: "c", label: "输出" }] }, "graph");
    if (graph.type !== "graph") throw new Error();
    const placed = graphLayout(graph).vertices;
    expect(placed[0]!.x).toBeLessThan(placed[1]!.x); expect(placed[1]!.x).toBeLessThan(placed[2]!.x);
    const table = materializeNode({ type: "table", width: 100, height: 40, headers: ["说明"], cells: [["非常长的单元格内容".repeat(15)]] }, "table");
    if (table.type !== "table") throw new Error();
    expect(gridLayout(table).height).toBeGreaterThan(table.height);
    expect(contentSize(table).width).toBeGreaterThan(table.width);
  });
});
