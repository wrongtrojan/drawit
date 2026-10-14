import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { absoluteBox, createDocument, edgeSchema, materializeNode, parseDocument, validateDocument } from "@drawit/core";
import { renderDocumentSvg } from "./index.js";
import { embedDiagramFonts } from "./fonts.js";
import { svgToPng } from "./png.js";
const directory = new URL("../../../examples/academic/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".drawit.json"));
describe("academic exports", () => {
  it.each(files)("keeps semantic content, formula paths and bounds in %s", async (file) => {
    const document = parseDocument(JSON.parse(await readFile(new URL(file, directory), "utf8")));
    const errors: string[] = []; const svg = renderDocumentSvg(document, { onRenderError: (id) => errors.push(id) });
    expect(errors).toEqual([]); expect(svg).not.toContain("foreignObject"); expect(svg).not.toMatch(/NaN|Infinity/); expect(svg).toContain('rx="26"');
    expect(validateDocument(document).filter((issue) => issue.severity === "error")).toEqual([]);
    for (const node of document.nodes) { const box = absoluteBox(document.nodes, node); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(document.canvas.width); expect(box.y + box.height).toBeLessThanOrEqual(document.canvas.height); }
    expect(parseDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
    const actual = await svgToPng(svg, document.canvas.width + 64, { loadSystemFonts: false });
    const baseline = await readFile(new URL(file.replace(".drawit.json", ".png"), directory));
    expect(actual.equals(baseline)).toBe(true);
  });
  it("embeds small font subsets and OFL while keeping editable text", async () => {
    const document = createDocument("font"); document.nodes = [materializeNode({ type: "text", text: "中文 dₖ 数学" }, "label")];
    const svg = await embedDiagramFonts(renderDocumentSvg(document));
    expect(svg).toContain("data:font/ttf;base64,"); expect(svg).toContain("SIL OPEN FONT LICENSE"); expect(svg).toContain("中文 dₖ 数学"); expect(svg.length).toBeLessThan(120000);
    expect((await svgToPng(svg, 800)).subarray(0, 4).toString("hex")).toBe("89504e47");
  });
  it("includes waypoints, curved control points and outside labels in export bounds", () => {
    const document = createDocument("outside"); document.canvas = { width: 400, height: 300 };
    document.nodes = [materializeNode({ type: "rectangle", x: 0, y: 0 }, "a"), materializeNode({ type: "rectangle", x: 240, y: 200 }, "b")];
    document.edges = [edgeSchema.parse({ id: "route", source: "a", target: "b", label: "外侧标签", waypoints: [{ x: -300, y: -200 }, { x: 700, y: -200 }] })];
    const svg = renderDocumentSvg(document); const dimensions = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;
    expect(Number(dimensions[1])).toBeGreaterThan(1048); expect(Number(dimensions[2])).toBeGreaterThan(548);
  });
});
