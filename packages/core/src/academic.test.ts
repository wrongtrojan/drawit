import { describe, expect, it } from "vitest";
import { absoluteBox, createDocument, DocumentController, gridLayout, materializeNode, operationSchema, parseDocument, resolveNodeStyle, validateDocument, visualBodyBox } from "./index.js";

describe("academic geometry and transactional row arrangement", () => {
  it("grows short cells uniformly and includes exterior labels in bounds", () => {
    const node = materializeNode({ type: "matrix", width: 1, height: 1, cells: [["1", "2"], ["3", "4"]], rowLabels: ["0", "1"], columnLabels: ["0", "1"], dimensionLabel: "2 × 2" }, "a");
    if (node.type !== "matrix") throw new Error();
    const grid = gridLayout(node);
    expect(grid.widths).toEqual([40, 40]); expect(grid.heights).toEqual([40, 40]);
    expect(grid.padX).toBeGreaterThan(28); expect(grid.padY).toBe(24); expect(grid.width).toBeGreaterThan(136);
    const long = gridLayout({ ...node, cells: [["很长的中文说明，不应通过减小字号硬塞"], ["x"]], rowLabels: [], columnLabels: [] });
    expect(long.widths[0]).toBeGreaterThan(40); expect(long.heights[0]).toBeGreaterThan(40);
    const projected = { ...node, ...gridLayout(node) };
    expect(gridLayout(projected)).toEqual(gridLayout(node));
    const wide = { ...node, cells: [["1", "不同长度的说明"], ["2", "x"]], rowLabels: [], columnLabels: [] };
    expect(gridLayout({ ...wide, ...gridLayout(wide) })).toEqual(gridLayout(wide));
  });
  it("keeps custom styles and semantic data while projecting defaults", () => {
    const node = materializeNode({ type: "matrix", style: { fill: "#123456", fontFamily: "Custom", fontSize: 18 } }, "custom");
    expect(resolveNodeStyle(node)).toMatchObject({ fill: "#123456", fontFamily: "Custom", fontSize: 18, strokeWidth: 1.5 });
    expect(node.style).toEqual({ fill: "#123456", fontFamily: "Custom", fontSize: 18 });
    expect(resolveNodeStyle(materializeNode({ type: "text", style: { role: "title" } }, "title"))).toMatchObject({ fill: "#dbeafe", fontSize: 22, fontWeight: 700 });
  });
  it("aligns bodies in the requested order, counts decorations, and supports undo", async () => {
    const document = createDocument("row"); document.nodes = [materializeNode({ type: "matrix", id: "a", cells: [["1"], ["2"]], columnLabels: ["i"], dimensionLabel: "2 × 1", x: 10 }, "a"), materializeNode({ type: "equation", id: "eq", latex: "+", width: 40, height: 48, style: { role: "operator" } }, "eq"), materializeNode({ type: "vector", id: "b", orientation: "column", components: ["1", "2"] }, "b")];
    const controller = new DocumentController(document);
    expect((await controller.apply({ source: "gui", expectedRevision: 0, operations: [operationSchema.parse({ op: "arrangeRow", nodeIds: ["b", "eq", "a"], startX: 40, centerY: 200 })] })).ok).toBe(true);
    const after = await controller.getSnapshot(); const row = ["b", "eq", "a"].map((id) => after.nodes.find((node) => node.id === id)!);
    row.forEach((node) => { const body = visualBodyBox(node); expect(node.y + body.y + body.height / 2).toBeCloseTo(200); });
    for (let i = 1; i < row.length; i++) { const a = absoluteBox(after.nodes, row[i - 1]!); expect(row[i]!.x - a.x - a.width).toBeCloseTo(60); }
    await controller.undo(1, "gui"); expect((await controller.getSnapshot()).nodes).toEqual(document.nodes);
  });
  it("uses a pinned anchor and rolls back conflicting anchors or mixed parents", async () => {
    const document = createDocument("anchors"); document.nodes = [materializeNode({ type: "rectangle", x: 100, y: 100, pinned: true }, "a"), materializeNode({ type: "rectangle", x: 900, y: 20 }, "b")];
    const controller = new DocumentController(document); const op = operationSchema.parse({ op: "arrangeRow", nodeIds: ["a", "b"] });
    expect((await controller.apply({ expectedRevision: 0, source: "gui", operations: [op] })).ok).toBe(true);
    expect((await controller.getSnapshot()).nodes[0]).toEqual(document.nodes[0]);
    await controller.apply({ expectedRevision: 1, source: "gui", operations: [{ op: "updateNodes", updates: [{ id: "b", patch: { pinned: true, x: 900 } }] }] });
    const before = await controller.getSnapshot();
    expect((await controller.apply({ expectedRevision: 2, source: "gui", operations: [op] })).ok).toBe(false);
    expect(await controller.getSnapshot()).toEqual(before);
    const mixed = createDocument("mixed"); mixed.nodes = [materializeNode({ type: "container" }, "p"), materializeNode({ type: "text", parentId: "p" }, "a"), materializeNode({ type: "text" }, "b")];
    const other = new DocumentController(mixed);
    expect((await other.apply({ expectedRevision: 0, source: "mcp", operations: [op] })).ok).toBe(false);
    expect(await other.getSnapshot()).toEqual(mixed);
  });
});

describe("seeded operation sequences", () => {
  it.each([17, 43, 109, 20261014])("preserves invariants and rollback for seed %i", async (seed) => {
    let state = seed >>> 0; const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    const controller = new DocumentController(createDocument("generated")); let nextId = 0;
    for (let step = 0; step < 300; step++) {
      const before = await controller.getSnapshot(); const node = before.nodes[Math.floor(random() * before.nodes.length)]; const choice = Math.floor(random() * 10);
      let raw: unknown;
      if (!node || choice === 0) raw = { op: "addNodes", nodes: [{ type: "rectangle", id: `n_${nextId++}`, x: Math.floor(random() * 700), y: Math.floor(random() * 500), text: `step ${step}` }] };
      else if (choice === 1) raw = { op: "deleteElements", nodeIds: [node.id], edgeIds: [] };
      else if (choice === 2) raw = { op: "updateNodes", updates: [{ id: node.id, patch: { x: Math.floor(random() * 600), y: Math.floor(random() * 500) } }] };
      else if (choice === 3) raw = { op: "addNodes", nodes: [{ ...node, id: `copy_${nextId++}`, parentId: undefined }] };
      else if (choice === 4 && before.nodes.length > 1) raw = { op: "connect", edges: [{ id: `e_${nextId++}`, source: node.id, target: before.nodes.find((item) => item.id !== node.id)!.id }] };
      else if (choice === 5) raw = { op: "group", nodeIds: [node.id], containerId: `g_${nextId++}`, title: "group" };
      else if (choice === 6 && node.type === "container") raw = { op: "ungroup", containerId: node.id };
      else if (choice === 7) raw = { op: "updateNodes", updates: [{ id: node.id, patch: { parentId: node.id } }] };
      else if (choice === 8) raw = { op: "snapToGrid", nodeIds: [node.id], gridSize: 20 };
      else raw = { op: "updateNodes", updates: [{ id: node.id, patch: { parentId: null } }] };
      const result = await controller.apply({ expectedRevision: before.revision, source: "mcp", operations: [operationSchema.parse(raw)] });
      const after = await controller.getSnapshot();
      if (!result.ok) expect(after).toEqual(before); else expect(after.revision).toBe(before.revision + 1);
      expect(validateDocument(after).filter((issue) => issue.severity === "error")).toEqual([]);
      expect(parseDocument(JSON.parse(JSON.stringify(after)))).toEqual(after);
      if (result.ok && step % 13 === 0) {
        await controller.undo(after.revision, "gui"); const undone = await controller.getSnapshot(); expect(undone.nodes).toEqual(before.nodes); expect(undone.edges).toEqual(before.edges);
        await controller.redo(undone.revision, "gui"); const redone = await controller.getSnapshot(); expect(redone.nodes).toEqual(after.nodes); expect(redone.edges).toEqual(after.edges);
      }
    }
  });
});
