export { escapeXml, renderNodeInner, renderEdgeSvg, renderEdgePath, reviewManifest } from "./svg.js";
import { renderDocumentSvg as renderSvg, type RenderOptions } from "./svg.js";
import { renderEquationSvg } from "./equation.js";
import type { DiagramDocument } from "@drawit/core";
export function renderDocumentSvg(document: DiagramDocument, options: RenderOptions = {}): string { return renderSvg(document, { ...options, equationRenderer: renderEquationSvg }); }
export type { RenderOptions } from "./svg.js";
