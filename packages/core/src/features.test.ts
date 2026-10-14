import { describe, expect, it } from "vitest";
import { componentCatalog, createDocument, DocumentController, materializeNode, parseDocument, projectSemanticNode, operationSchema } from "./index.js";
import { join, resolve } from "node:path";
import { drawitHome } from "./home.js";

const line = (id: string, x: number) => materializeNode({ type: "lifeline", id, x, y: 40 }, id);
describe("semantic components and explicit arrangement", () => {
  it("catalog examples materialize and survive JSON round trips with semantic fields", () => {
    for (const component of componentCatalog(true)) {
      const document = createDocument("目录");
      document.nodes = component.exampleOperations[0]!.nodes.map((node) => materializeNode(node, String(node.id)));
      expect(parseDocument(JSON.parse(JSON.stringify(document))).nodes[0]).toEqual(document.nodes[0]);
      expect(component.propertySchema).toHaveProperty("properties");
    }
  });
  it("rejects missing sequence endpoints and overlapping table merges atomically", async () => {
    const controller = new DocumentController(createDocument("事务"));
    const result = await controller.apply({ source: "mcp", expectedRevision: 0, operations: [
      { op: "addNodes", nodes: [{ type: "text", id: "title", text: "标题" }, { type: "message", sourceId: "missing", targetId: "missing" }] },
    ] });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect((await controller.getSnapshot()).nodes).toHaveLength(0);
    const invalidMerge = await controller.apply({ source: "mcp", expectedRevision: 0, operations: [{ op: "addNodes", nodes: [{ type: "table", headers: ["A", "B"], cells: [["1", "2"]], merges: [{ row: 0, column: 0, rowSpan: 1, columnSpan: 2 }, { row: 0, column: 1, rowSpan: 1, columnSpan: 1 }] }] }] });
    expect(invalidMerge).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
  it("places semantic messages between lifelines and removes their dependents", async () => {
    const document = createDocument("时序");
    document.nodes = [line("client", 40), line("server", 300), materializeNode({ type: "message", id: "request", sourceId: "client", targetId: "server", y: 120 }, "request"), materializeNode({ type: "activation", id: "active", lifelineId: "server", y: 140 }, "active")];
    const projected = projectSemanticNode(document.nodes, document.nodes[2]!);
    expect(projected.x).toBe(110); expect(projected.width).toBe(260);
    const controller = new DocumentController(document);
    const result = await controller.apply({ source: "gui", expectedRevision: 0, operations: [{ op: "deleteElements", nodeIds: ["server"], edgeIds: [] }] });
    expect(result.ok).toBe(true);
    expect((await controller.getSnapshot()).nodes.map((node) => node.id)).toEqual(["client"]);
  });
  it("aligns absolute positions across containers, distributes gaps, and snaps explicitly", async () => {
    const document = createDocument("排列");
    document.nodes = [materializeNode({ type: "container", id: "group", x: 100, y: 100, width: 500, height: 300 }, "group"), materializeNode({ type: "rectangle", id: "a", parentId: "group", x: 13, y: 13 }, "a"), materializeNode({ type: "rectangle", id: "b", x: 413, y: 153 }, "b"), materializeNode({ type: "rectangle", id: "c", x: 813, y: 233 }, "c")];
    const controller = new DocumentController(document);
    const operations = [{ op: "align", nodeIds: ["a", "b", "c"], axis: "top" }, { op: "distribute", nodeIds: ["a", "b", "c"], axis: "horizontal" }, { op: "snapToGrid", nodeIds: ["a", "b", "c"], gridSize: 20 }].map((op) => operationSchema.parse(op));
    const result = await controller.apply({ source: "gui", expectedRevision: 0, operations });
    expect(result.ok).toBe(true);
    const after = await controller.getSnapshot();
    expect(after.nodes.find((node) => node.id === "a")?.y).toBe(20);
    expect(after.nodes.find((node) => node.id === "b")?.y).toBe(120);
    expect(after.nodes.find((node) => node.id === "b")?.x).toBe(460);
    expect((await controller.undo(1, "gui")).ok).toBe(true);
    expect((await controller.getSnapshot()).nodes).toEqual(document.nodes);
  });
  it("chooses native data roots and honors DRAWIT_HOME", () => {
    expect(drawitHome("darwin", {}, "/user")).toBe(join("/user", "Library", "Application Support", "drawit"));
    expect(drawitHome("linux", { XDG_DATA_HOME: "/data" }, "/user")).toBe(join("/data", "drawit"));
    expect(drawitHome("linux", { XDG_DATA_HOME: "relative" }, "/user")).toBe(join("/user", ".local", "share", "drawit"));
    expect(drawitHome("win32", { APPDATA: "/roaming" }, "/user")).toBe(join("/roaming", "drawit"));
    expect(drawitHome("darwin", { DRAWIT_HOME: "/custom" }, "/user")).toBe(resolve("/custom"));
  });
});
