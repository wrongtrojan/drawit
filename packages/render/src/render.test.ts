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
  });
});
