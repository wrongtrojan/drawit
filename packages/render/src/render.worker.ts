import { parentPort } from "node:worker_threads";
import { renderDocumentSvg } from "./index.js";
import { renderReviewPng, svgToPng } from "./png.js";
import { asDrawitError, type DiagramDocument } from "@drawit/core";
import type { RenderOptions } from "./svg.js";
import { embedDiagramFonts } from "./fonts.js";
export type RenderTask = { id: number; kind: "svg" | "png" | "review"; document: DiagramDocument; options?: RenderOptions; width?: number };
parentPort?.on("message", async (task: RenderTask) => {
  try {
    const result = task.kind === "review" ? await renderReviewPng(task.document, { annotateIds: task.options?.annotateIds }) : task.kind === "svg" ? { svg: await embedDiagramFonts(renderDocumentSvg(task.document, task.options)) } : { png: await svgToPng(renderDocumentSvg(task.document, task.options), task.width ?? 1200) };
    parentPort!.postMessage({ id: task.id, result });
  } catch (error) { const wrapped = asDrawitError(error, "EXPORT_FAILED"); parentPort!.postMessage({ id: task.id, error: { code: wrapped.code, message: wrapped.message } }); }
});
