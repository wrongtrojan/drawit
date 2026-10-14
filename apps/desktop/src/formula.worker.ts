import { renderNodeInner } from "@drawit/render/browser";
import { renderEquationSvg } from "@drawit/render/equation";
import type { DiagramNode } from "@drawit/core";
self.onmessage = (event: MessageEvent<{ id: number; node: DiagramNode }>) => {
  try { self.postMessage({ id: event.data.id, markup: renderNodeInner(event.data.node, { equationRenderer: renderEquationSvg, onRenderError: () => { throw new Error("Invalid formula"); } }) }); }
  catch { self.postMessage({ id: event.data.id, error: "公式无法转换，请检查 LaTeX" }); }
};
