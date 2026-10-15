import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { materializeNode, parseDocument, stylePresets, treeLayout, graphLayout, edgeSchema, type DiagramDocument } from "@drawit/core";
import { renderDocumentSvg, renderNodeInner, renderEdgePath } from "./svg.js";
import { renderReviewPng } from "./png.js";
const directory = new URL("../../../examples/scenarios/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".drawit.json"));
const scenarioNames = [...(await readFile(new URL("../../../docs/scenarios.md", import.meta.url), "utf8")).matchAll(/^### (.+)$/gm)].map((match) => match[1]!);
async function loadExample(file: string): Promise<DiagramDocument> {
  return parseDocument(JSON.parse(await readFile(new URL(file, directory), "utf8")));
}
describe("semantic scenario regressions", () => {
  it("pairs each scenario title with one example", () => {
    expect(scenarioNames).toHaveLength(16);
    expect(files.map((file) => file.replace(/\.drawit\.json$/, "")).sort()).toEqual([...scenarioNames].sort());
  });
  it("keeps arrow tangents on the last nonzero segment of aligned and waypoint routes", () => {
    const edge = edgeSchema.parse({ id: "edge", source: "a", target: "b", router: "orthogonal" });
    expect(renderEdgePath(edge, { x: 10, y: 20 }, { x: 10, y: 100 }, "bottom", "top")).toBe("M 10 20 L 10 60 L 10 100");
    expect(renderEdgePath({ ...edge, waypoints: [{ x: 10, y: 20 }, { x: 10, y: 100 }] }, { x: 10, y: 20 }, { x: 10, y: 100 }, "bottom", "top")).toBe("M 10 20 L 10 100");
  });
  it.each(files)("renders and round trips %s", async (file) => {
    const document = parseDocument(JSON.parse(await readFile(new URL(file, directory), "utf8")));
    expect(parseDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    const svg = renderDocumentSvg(document);
    expect(svg).not.toContain("NaN"); expect(svg).not.toContain("Infinity");
    const review = await renderReviewPng(document);
    expect(review.png.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(review.manifest.objects.map((item) => item.id)).toEqual(expect.arrayContaining(document.nodes.map((node) => node.id)));
  }, 15000);
  it("draws structural tree links even when child labels repeat", () => {
    const node = materializeNode({ type: "tree", root: { label: "root", children: [{ label: "a", children: [{ label: "same", children: [] }] }, { label: "b", children: [{ label: "same", children: [] }] }] } }, "tree");
    if (node.type !== "tree") throw new Error();
    const svg = renderNodeInner(node);
    for (const vertex of treeLayout(node).vertices.filter((item) => item.parentId)) expect(svg).toContain(`data-parent="${vertex.parentId}" data-child="${vertex.id}"`);
  });
  it("uses distinct role colors and partial score highlights in multi-head attention", async () => {
    const document = await loadExample("ai-mha.drawit.json");
    const svg = renderDocumentSvg(document);
    for (const name of ["query", "key", "value", "output"] as const) expect(svg).toContain(stylePresets[name].fill);
    expect(svg).toContain("头 1");
    expect(svg).toContain("头 2");
    expect(svg).toContain("sqrt");
    expect(svg).toContain("拼接");
    const scores = document.nodes.filter((node) => node.type === "matrix");
    expect(scores.length).toBeGreaterThan(0);
    for (const score of scores) {
      if (score.type !== "matrix") continue;
      const highlighted = score.highlightCells.length + score.highlightRows.length * (score.cells[0]?.length ?? 0) + score.highlightCols.length * score.cells.length;
      expect(highlighted).toBeGreaterThan(0);
      expect(highlighted).toBeLessThan(score.cells.length * (score.cells[0]?.length ?? 0));
    }
  });
  it("highlights one row, one column, and the result cell in matrix multiplication", async () => {
    const document = await loadExample("math-matrix.drawit.json");
    const svg = renderDocumentSvg(document);
    const matrices = document.nodes.filter((node) => node.type === "matrix");
    expect(matrices.some((node) => node.type === "matrix" && node.highlightRows.includes(0))).toBe(true);
    expect(matrices.some((node) => node.type === "matrix" && node.highlightCols.includes(0))).toBe(true);
    expect(matrices.some((node) => node.type === "matrix" && node.highlightCells.some(([row, column]) => row === 0 && column === 0 && node.cells[row]?.[column] === "58"))).toBe(true);
    expect(svg).toContain('data-cell="0,0"');
    expect(svg).toContain('fill="#93c5fd"');
    expect(svg).toContain('fill="#f9a8b3"');
    expect(svg).toContain('fill="#86efac"');
    expect(svg).toContain("58");
  });
  it("stops graph edges on the vertex boundary and renders their labels", () => {
    const node = materializeNode({ type: "graph", vertices: ["a", "b", "c"].map((id) => ({ id, label: id })), links: [{ source: "a", target: "b", label: "route" }, { source: "b", target: "c", label: "next" }] }, "graph");
    if (node.type !== "graph") throw new Error();
    const vertices = graphLayout(node).vertices;
    const svg = renderNodeInner(node);
    expect(svg).toContain(`M${vertices[0]!.x + vertices[0]!.width} ${vertices[0]!.y + vertices[0]!.height / 2} L${vertices[1]!.x} ${vertices[1]!.y + vertices[1]!.height / 2}`);
    expect(svg).toContain("route"); expect(svg).toContain("next");
  });
});
