import { DrawitError, LIMITS, validateDocument, type DiagramDocument, type Issue } from "@drawit/core";
import { Resvg } from "@resvg/resvg-js";
import { renderEquationSvg } from "./equation.js";
import { renderDocumentSvg, reviewManifest } from "./svg.js";

export async function svgToPng(svg: string, width: number): Promise<Buffer> {
  const dimensions = /<svg[^>]*\bwidth="([0-9.]+)"[^>]*\bheight="([0-9.]+)"/.exec(svg);
  const naturalWidth = Number(dimensions?.[1]), naturalHeight = Number(dimensions?.[2]);
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0 || !Number.isFinite(width) || width <= 0) throw new DrawitError("EXPORT_FAILED", "Invalid SVG dimensions");
  const aspect = naturalHeight / naturalWidth;
  const boundedWidth = Math.floor(Math.min(width, LIMITS.renderSide, LIMITS.renderSide / aspect, Math.sqrt(LIMITS.renderPixels / aspect)));
  if (boundedWidth < 1) throw new DrawitError("EXPORT_FAILED", "SVG aspect ratio exceeds render budget");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: boundedWidth },
    font: { loadSystemFonts: true },
  });
  return Buffer.from(resvg.render().asPng());
}

export async function renderReviewPng(document: DiagramDocument, options: { maxBytes?: number; annotateIds?: boolean } = {}): Promise<{
  png: Buffer;
  manifest: ReturnType<typeof reviewManifest> & { warnings: Issue[] };
}> {
  const warnings = validateDocument(document).filter((issue) => issue.severity !== "error");
  const svg = renderRasterSvg(document, { annotateIds: options.annotateIds ?? true, padding: 32, onRenderError: (elementId) => warnings.push({ severity: "warning", code: "EQUATION_RENDER_FAILED", message: "Formula could not be rendered", elementId }) });
  const match = /width="([0-9.]+)"/.exec(svg);
  const natural = Number(match?.[1] ?? 800);
  let target = Math.min(1600, Math.max(320, natural));
  const maxBytes = options.maxBytes ?? 1_000_000;
  let png = await svgToPng(svg, target);
  while (png.length > maxBytes && target > 320) {
    target = Math.max(320, Math.round(target * 0.75));
    png = await svgToPng(svg, target);
    if (target === 320) break;
  }
  return { png, manifest: { ...reviewManifest(document), warnings } };
}

export function renderRasterSvg(document: DiagramDocument, options: Parameters<typeof renderDocumentSvg>[1] = {}): string {
  return renderDocumentSvg(document, { ...options, equationRenderer: renderEquationSvg });
}
