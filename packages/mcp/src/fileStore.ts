import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DocumentController,
  DrawitError,
  createDocument,
  operationSchema,
  parseDocument,
  validateDocument,
} from "@drawit/core";
import { documentsDir, exportsDir, readDocumentFile, safeDocumentPath, safeExportPath, writeDocumentFile } from "@drawit/core/node";
import { layoutDocument } from "@drawit/layout";
import { renderDocumentSvg } from "@drawit/render";
import { renderRasterSvg, renderReviewPng, svgToPng } from "@drawit/render/png";
import type { SessionResponse } from "@drawit/session/protocol";

const activeDocuments = new Map<string, string>();
const queues = new Map<string, Promise<void>>();

async function load(home: string, documentId?: string): Promise<DocumentController> {
  await mkdir(documentsDir(home), { recursive: true });
  documentId ??= activeDocuments.get(home);
  const files = (await readdir(documentsDir(home))).filter((file) => file.endsWith(".drawit.json"));
  const fileName = documentId ? `${documentId}.drawit.json` : files[0];
  if (!fileName || !files.includes(fileName)) throw new DrawitError("NOT_FOUND", "No diagram is available. Create one or start the editor.");
  const id = fileName.replace(/\.drawit\.json$/, "");
  const path = safeDocumentPath(home, id);
  const controller = new DocumentController(await readDocumentFile(path), path);
  activeDocuments.set(home, id);
  return controller;
}

export function callFile(home: string, body: Record<string, unknown>): Promise<SessionResponse> {
  const response = (queues.get(home) ?? Promise.resolve()).then(() => dispatchFile(home, body));
  queues.set(home, response.then(() => undefined, () => undefined));
  return response;
}

async function dispatchFile(home: string, body: Record<string, unknown>): Promise<SessionResponse> {
  const requestId = String(body.requestId ?? "file");
  try {
    if (body.type === "openEditor" || body.type === "open") {
      return { type: "response", requestId, ok: false, code: "EDITOR_NOT_RUNNING", message: "The drawit editor is not running. Start it, then retry." };
    }
    if (body.type === "create") {
      const document = createDocument(typeof body.title === "string" && body.title.trim() ? body.title : "未命名图示");
      const path = safeDocumentPath(home, document.documentId);
      await writeDocumentFile(path, document);
      activeDocuments.set(home, document.documentId);
      return { type: "response", requestId, ok: true, document, revision: document.revision, dirty: false, path };
    }
    if (body.type === "list") {
      await mkdir(documentsDir(home), { recursive: true });
      const documents = [];
      for (const fileName of (await readdir(documentsDir(home))).filter((file) => file.endsWith(".drawit.json"))) {
        const document = parseDocument(JSON.parse(await readFile(join(documentsDir(home), fileName), "utf8")));
        documents.push({ documentId: document.documentId, title: document.title, revision: document.revision, fileName });
      }
      return { type: "response", requestId, ok: true, documents };
    }
    if (body.type === "import") {
      const document = parseDocument(body.json);
      const path = safeDocumentPath(home, document.documentId);
      await writeDocumentFile(path, document);
      activeDocuments.set(home, document.documentId);
      return { type: "response", requestId, ok: true, document, revision: document.revision, path };
    }
    const controller = await load(home, typeof body.documentId === "string" ? body.documentId : undefined);
    if (body.type === "get" || body.type === "subscribe") {
      const document = await controller.getSnapshot();
      return { type: "response", requestId, ok: true, document, revision: document.revision, view: { selection: [], viewport: { x: 0, y: 0, zoom: 1 } }, path: controller.path };
    }
    if (body.type === "validate") {
      const document = await controller.getSnapshot();
      const issues = validateDocument(document);
      return { type: "response", requestId, ok: true, revision: document.revision, issues };
    }
    if (body.type === "save") {
      const document = await controller.getSnapshot();
      const path = controller.path ?? safeDocumentPath(home, document.documentId);
      await writeDocumentFile(path, document);
      await controller.markSaved(path);
      return { type: "response", requestId, ok: true, revision: document.revision, path, dirty: false, document };
    }
    if (body.type === "render" || body.type === "review") {
      const document = await controller.getSnapshot();
      if (body.type === "review" || body.format === "png") {
        const rendered = body.type === "review" ? await renderReviewPng(document, { annotateIds: typeof body.annotateIds === "boolean" ? body.annotateIds : true }) : { png: await svgToPng(renderRasterSvg(document, { background: typeof body.background === "string" ? body.background : undefined }), 1200), manifest: undefined };
        const exportPath = typeof body.fileName === "string" ? safeExportPath(home, body.fileName.endsWith(".png") ? body.fileName : `${body.fileName}.png`) : undefined;
        if (exportPath) {
          await mkdir(exportsDir(home), { recursive: true });
          await writeFile(exportPath, rendered.png);
        }
        return { type: "response", requestId, ok: true, revision: document.revision, pngBase64: rendered.png.toString("base64"), mimeType: "image/png", manifest: rendered.manifest, exportPath };
      }
      const svg = renderDocumentSvg(document, { background: typeof body.background === "string" ? body.background : undefined });
      const exportPath = typeof body.fileName === "string" ? safeExportPath(home, body.fileName.endsWith(".svg") ? body.fileName : `${body.fileName}.svg`) : undefined;
      if (exportPath) {
        await mkdir(exportsDir(home), { recursive: true });
        await writeFile(exportPath, svg);
      }
      return { type: "response", requestId, ok: true, revision: document.revision, svg, exportPath };
    }
    if (body.type === "layout") {
      const document = await controller.getSnapshot();
      if (document.revision !== body.expectedRevision) return { type: "response", requestId, ok: false, code: "REVISION_CONFLICT", message: "Read the current revision before layout", currentRevision: document.revision };
      const laidOut = await layoutDocument(document, { direction: body.direction === "LR" || body.direction === "BT" || body.direction === "RL" ? body.direction : "TB", nodeSpacing: Number(body.nodeSpacing ?? 48), rankSpacing: Number(body.rankSpacing ?? 72) });
      if (laidOut.updates.length === 0) return { type: "response", requestId, ok: true, document, revision: document.revision, bounds: laidOut.bounds };
      const result = await controller.apply({ expectedRevision: Number(body.expectedRevision), source: "mcp", operations: [{ op: "updateNodes", updates: laidOut.updates }] });
      if (!result.ok) return { type: "response", requestId, ...result };
      const path = controller.path ?? safeDocumentPath(home, result.document.documentId);
      await writeDocumentFile(path, result.document);
      await controller.markSaved(path);
      return { type: "response", requestId, ok: true, document: result.document, revision: result.revision, operationId: result.operationId, warnings: result.warnings, bounds: laidOut.bounds, summary: result.summary };
    }
    const parsed = operationSchema.array().safeParse(body.operations ?? []);
    if (!parsed.success) throw new DrawitError("VALIDATION_ERROR", parsed.error.message);
    const operations = parsed.data;
    const request = { expectedRevision: Number(body.expectedRevision), operations, source: "mcp" as const };
    const result = body.type === "preview" ? await controller.preview(request) : await controller.apply(request);
    if (!result.ok) return { type: "response", requestId, ...result };
    if (body.type !== "preview") {
      const path = controller.path ?? safeDocumentPath(home, result.document.documentId);
      await writeDocumentFile(path, result.document);
      await controller.markSaved(path);
    }
    let pngBase64: string | undefined;
    if (body.type === "preview" && body.includeReviewImage) pngBase64 = (await renderReviewPng(result.document)).png.toString("base64");
    return { type: "response", requestId, ok: true, preview: body.type === "preview", document: result.document, revision: result.revision, operationId: result.operationId, warnings: result.warnings, summary: result.summary, pngBase64, mimeType: pngBase64 ? "image/png" : undefined };
  } catch (error) {
    const wrapped = error instanceof DrawitError ? error : new DrawitError("TRANSACTION_FAILED", error instanceof Error ? error.message : "File operation failed");
    return { type: "response", requestId, ok: false, code: wrapped.code, message: wrapped.message };
  }
}
