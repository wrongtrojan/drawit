import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import type { DiagramNode } from "@drawit/core";
import { escapeXml } from "./svg.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const math = mathjax.document("", {
  InputJax: new TeX({ packages: AllPackages.filter((name) => !["html", "require", "autoload"].includes(name)), maxBuffer: 4000, maxMacros: 1000 }),
  OutputJax: new SVG({ fontCache: "none" }),
});

// MathJax produces path-based SVG so resvg needs neither HTML nor web fonts.
export function renderEquationSvg(node: Extract<DiagramNode, { type: "equation" }>): string {
  const element = math.convert(node.latex, { display: true });
  const svg = adaptor.outerHTML(element);
  const start = svg.indexOf("<svg");
  const end = svg.lastIndexOf("</svg>");
  if (start < 0 || end < 0) throw new Error(`Cannot render equation ${node.id}`);
  const inner = svg.slice(start, end + 6);
  const viewBox = /viewBox="([^"]+)"/.exec(inner)?.[1];
  if (!viewBox) throw new Error(`Missing equation bounds for ${node.id}`);
  const [, , w = 1, h = 1] = viewBox.split(/\s+/).map(Number);
  const fontSize = node.style?.fontSize ?? 14;
  const naturalW = w / 1000 * fontSize;
  const naturalH = h / 1000 * fontSize;
  const scale = Math.min(1, Math.max(1, node.width - 16) / naturalW, Math.max(1, node.height - 16) / naturalH);
  const width = naturalW * scale;
  const height = naturalH * scale;
  const body = inner.slice(inner.indexOf(">") + 1, inner.lastIndexOf("</svg>"));
  const color = node.style?.color ?? "#111827";
  return `<svg x="${(node.width - width) / 2}" y="${(node.height - height) / 2}" width="${width}" height="${height}" viewBox="${viewBox}" color="${escapeXml(color)}"><title>${escapeXml(node.latex)}</title>${body}</svg>`;
}
