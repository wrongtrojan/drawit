import { createBinarySearchExample } from "@drawit/core";
import { describe, expect, it } from "vitest";
import { renderReviewPng } from "./png.js";
import { renderDocumentSvg } from "./svg.js";

describe("renderer", () => {
  it("writes vector svg for the example diagram", () => {
    const svg = renderDocumentSvg(createBinarySearchExample());
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain("<svg");
    expect(svg).toContain("开始");
    expect(svg).toContain("<path");
  });

  it("returns an inline png review image for the current revision", async () => {
    const document = createBinarySearchExample();
    const review = await renderReviewPng(document, { maxBytes: 800 });
    expect(review.png.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(review.manifest.revision).toBe(document.revision);
    expect(review.manifest.documentId).toBe(document.documentId);
    expect(review.png.length).toBeGreaterThan(8);
  }, 15000);
});

it("rasterizes fractions as SVG paths while retaining LaTeX in user SVG", async () => {
  const { createDocument, materializeNode } = await import("@drawit/core");
  const { renderRasterSvg } = await import("./png.js");
  const document = createDocument("公式");
  document.nodes = [materializeNode({ type: "equation", id: "bayes", latex: "P(H|D)=\\frac{P(D|H)P(H)}{P(D)}" }, "bayes")];
  const raster = renderRasterSvg(document);
  expect(raster).not.toContain("foreignObject");
  expect(raster).toContain("<path");
  expect(raster).toContain("<title>P(H|D)");
  expect(renderDocumentSvg(document)).toContain("foreignObject");
  const png = await renderReviewPng(document);
  expect(png.png.subarray(0, 4).toString("hex")).toBe("89504e47");
});

it.each(["sequence", "architecture", "class"])("round trips and reviews the %s semantic fixture", async (name) => {
  const { readFile } = await import("node:fs/promises");
  const { parseDocument, validateDocument } = await import("@drawit/core");
  const document = parseDocument(JSON.parse(await readFile(new URL(`../../../examples/${name}.drawit.json`, import.meta.url), "utf8")));
  expect(parseDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
  expect(validateDocument(document).filter((issue) => issue.severity === "error")).toHaveLength(0);
  const review = await renderReviewPng(document);
  expect(review.manifest.objects.map((item) => item.id)).toEqual(expect.arrayContaining(document.nodes.map((item) => item.id)));
  expect(review.png.length).toBeGreaterThan(100);
}, 15000);
