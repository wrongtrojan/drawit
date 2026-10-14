import { watch } from "node:fs";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import {
  DocumentController,
  DrawitError,
  asDrawitError,
  createBinarySearchExample,
  createDocument,
  operationSchema,
  parseDocument,
  validateDocument,
  type DiagramDocument,
} from "@drawit/core";
import { documentsDir, exportsDir, readDocumentFile, safeDocumentPath, safeExportPath, writeDocumentFile } from "@drawit/core/node";
import { layoutDocument } from "@drawit/layout";
import { renderDocumentSvg } from "@drawit/render";
import { renderRasterSvg, renderReviewPng, svgToPng } from "@drawit/render/png";
import type { ClientMessage, SessionEvent, SessionResponse, ViewState } from "./protocol.js";

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readJsonDir(home: string): Promise<Array<{ documentId: string; title: string; revision: number; fileName: string }>> {
  const directory = documentsDir(home);
  await mkdir(directory, { recursive: true });
  const files = (await readdir(directory)).filter((file) => file.endsWith(".drawit.json"));
  const documents = [];
  for (const fileName of files) {
    try {
      const document = await readDocumentFile(join(directory, fileName));
      documents.push({ documentId: document.documentId, title: document.title, revision: document.revision, fileName });
    } catch (error) {
      console.error(`Skipping unreadable diagram ${fileName}: ${error instanceof Error ? error.message : "invalid"}`);
    }
  }
  return documents;
}

export interface SessionHandle {
  port: number;
  token: string;
  home: string;
  close: () => Promise<void>;
}

export async function startSessionHost(options: { home: string; port?: number; replace?: boolean }): Promise<SessionHandle> {
  await mkdir(options.home, { recursive: true });
  await mkdir(documentsDir(options.home), { recursive: true });
  await mkdir(exportsDir(options.home), { recursive: true });
  const sessionFile = join(options.home, "session.json");
  try {
    const existing = JSON.parse(await readFile(sessionFile, "utf8")) as { pid?: number };
    if (existing.pid && pidAlive(existing.pid) && existing.pid !== process.pid) {
      if (!options.replace) throw new DrawitError("TRANSACTION_FAILED", "A drawit session is already running");
      process.kill(existing.pid);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    if (error instanceof DrawitError) throw error;
  }

  const token = randomBytes(32).toString("hex");
  const server = new WebSocketServer({ host: "127.0.0.1", port: options.port ?? 0 });
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await writeFile(sessionFile, JSON.stringify({ port, token, pid: process.pid }, null, 2));

  const listed = await readJsonDir(options.home);
  const initial = listed.find((item) => item.documentId === "doc_binary_search") ?? listed[0];
  let controller: DocumentController;
  if (!initial) {
    const example = createBinarySearchExample();
    const path = safeDocumentPath(options.home, example.documentId);
    await writeDocumentFile(path, example);
    controller = new DocumentController(example, path);
  } else {
    const path = join(documentsDir(options.home), initial.fileName);
    controller = new DocumentController(await readDocumentFile(path), path);
  }

  const view: ViewState = { selection: [], viewport: { x: 0, y: 0, zoom: 1 } };
  const sockets = new Set<WebSocket>();
  const allSockets = new Set<WebSocket>();
  const send = (socket: WebSocket, payload: SessionResponse | SessionEvent) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  };
  const broadcast = (payload: SessionEvent) => {
    for (const socket of sockets) send(socket, payload);
  };
  const historyFlags = () => {
    const history = controller.peekHistory();
    return { canUndo: history.undo, canRedo: history.redo };
  };

  let savedDocumentJson = JSON.stringify(await controller.getSnapshot());
  controller.subscribe((document, record, dirty) => {
    view.selection = view.selection.filter((id) => document.nodes.some((node) => node.id === id) || document.edges.some((edge) => edge.id === id));
    if (!dirty) savedDocumentJson = JSON.stringify(document);
    broadcast({
      type: "event",
      event: "revision",
      document,
      record,
      warnings: validateDocument(document).filter((issue) => issue.severity !== "error"),
      dirty,
      path: controller.path,
      ...historyFlags(),
    });
  });

  const fail = (requestId: string, error: unknown): SessionResponse => {
    const wrapped = asDrawitError(error);
    return { type: "response", requestId, ok: false, code: wrapped.code, message: wrapped.message, issues: Array.isArray(wrapped.details) ? wrapped.details : undefined };
  };

  const snapshotResponse = async (requestId: string, extra: Partial<SessionResponse> = {}): Promise<SessionResponse> => {
    const document = await controller.getSnapshot();
    return {
      type: "response",
      requestId,
      ok: true,
      document,
      revision: document.revision,
      dirty: await controller.isDirty(),
      path: controller.path,
      warnings: validateDocument(document).filter((issue) => issue.severity !== "error"),
      view,
      ...historyFlags(),
      ...extra,
    };
  };

  server.on("connection", (socket) => {
    // Only authenticated clients receive document broadcasts.
    allSockets.add(socket);
    socket.on("close", () => { sockets.delete(socket); allSockets.delete(socket); });
    socket.on("message", (data) => {
      void handle(socket, data.toString()).catch((error) => {
        console.error(error instanceof Error ? error.message : "session request failed");
      });
    });
  });

  async function handle(socket: WebSocket, raw: string): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (!message.requestId) return;
    if (message.token !== token) {
      send(socket, { type: "response", requestId: message.requestId, ok: false, code: "PATH_FORBIDDEN", message: "Invalid session token" });
      return;
    }
    try {
      sockets.add(socket);
      send(socket, await enqueueDispatch(message));
    } catch (error) {
      send(socket, fail(message.requestId, error));
    }
  }

  // Serialize complete requests, including save IO and document switches.
  // The controller retains its own single-writer queue for content operations.
  let requestTail: Promise<void> = Promise.resolve();
  function enqueueDispatch(message: ClientMessage): Promise<SessionResponse> {
    const response = requestTail.then(() => dispatch(message));
    requestTail = response.then(() => undefined, () => undefined);
    return response;
  }

  let closed = false;
  const watcher = watch(documentsDir(options.home), (_event, fileName) => {
    if (closed) return;
    const check = requestTail.then(async () => {
      if (closed) return;
      const current = await controller.getSnapshot();
      if (String(fileName) !== `${current.documentId}.drawit.json`) return;
      try {
        const disk = await readDocumentFile(safeDocumentPath(options.home, current.documentId));
        if (JSON.stringify(disk) === savedDocumentJson) return;
      } catch { /* Deleted or invalid external file also needs attention. */ }
      broadcast({ type: "event", event: "externalChange", path: controller.path });
    });
    requestTail = check.catch((error) => console.error(String(error)));
  });

  async function ensureDocument(documentId?: string): Promise<void> {
    if (!documentId) return;
    const current = await controller.getSnapshot();
    if (current.documentId === documentId) return;
    if (await controller.isDirty()) {
      throw new DrawitError("TRANSACTION_FAILED", "Save the open diagram before switching documents");
    }
    const path = safeDocumentPath(options.home, documentId);
    const document = await readDocumentFile(path);
    await controller.replace(document, path, "mcp");
    view.selection = [];
  }

  async function dispatch(message: ClientMessage): Promise<SessionResponse> {
    switch (message.type) {
      case "get":
      case "subscribe":
        await ensureDocument(message.documentId);
        return snapshotResponse(message.requestId);
      case "create": {
        if (await controller.isDirty()) throw new DrawitError("TRANSACTION_FAILED", "Save the open diagram before creating another one");
        const document = createDocument(message.title?.trim() || "未命名图示");
        const path = safeDocumentPath(options.home, document.documentId);
        await writeDocumentFile(path, document);
        const result = await controller.replace(document, path, message.source ?? "gui");
        return { type: "response", requestId: message.requestId, ok: true, document: result.document, revision: result.revision, operationId: result.operationId, dirty: false, path, ...historyFlags() };
      }
      case "open": {
        const current = await controller.getSnapshot();
        if (!message.documentId || message.documentId === current.documentId) {
          return snapshotResponse(message.requestId);
        }
        if (await controller.isDirty()) {
          throw new DrawitError("TRANSACTION_FAILED", "Save the open diagram before switching documents");
        }
        const path = safeDocumentPath(options.home, message.documentId);
        const document = await readDocumentFile(path);
        const result = await controller.replace(document, path, message.source ?? "gui");
        view.selection = [];
        return { type: "response", requestId: message.requestId, ok: true, document: result.document, revision: result.revision, operationId: result.operationId, dirty: false, path, view, ...historyFlags() };
      }
      case "import": {
        if (await controller.isDirty()) throw new DrawitError("TRANSACTION_FAILED", "Save the open diagram before importing another one");
        const document = parseDocument(message.json);
        const path = safeDocumentPath(options.home, document.documentId);
        await writeDocumentFile(path, document);
        const result = await controller.replace(document, path, message.source ?? "gui");
        return { type: "response", requestId: message.requestId, ok: true, document: result.document, revision: result.revision, dirty: false, path, ...historyFlags() };
      }
      case "reload": {
        const current = await controller.getSnapshot();
        const path = safeDocumentPath(options.home, current.documentId);
        const document = await readDocumentFile(path);
        if (document.documentId !== current.documentId) throw new DrawitError("VALIDATION_ERROR", "External file changed the document id");
        document.revision = Math.max(current.revision, document.revision) + 1;
        await writeDocumentFile(path, document);
        await controller.replace(document, path, message.source ?? "gui");
        view.selection = [];
        return snapshotResponse(message.requestId);
      }
      case "save": {
        await ensureDocument(message.documentId);
        const document = await controller.getSnapshot();
        const path = controller.path ?? safeDocumentPath(options.home, document.documentId);
        await writeDocumentFile(path, document);
        await controller.markSaved(path);
        savedDocumentJson = JSON.stringify(document);
        broadcast({ type: "event", event: "saved", document, dirty: false, path, warnings: validateDocument(document).filter((issue) => issue.severity !== "error"), ...historyFlags() });
        return { type: "response", requestId: message.requestId, ok: true, document, revision: document.revision, dirty: false, path };
      }
      case "list":
        return { type: "response", requestId: message.requestId, ok: true, documents: await readJsonDir(options.home) };
      case "setView":
        view.selection = message.selection ?? [];
        if (message.viewport) view.viewport = message.viewport;
        broadcast({ type: "event", event: "view", view });
        return { type: "response", requestId: message.requestId, ok: true, view, revision: (await controller.getSnapshot()).revision };
      case "validate": {
        await ensureDocument(message.documentId);
        const document = await controller.getSnapshot();
        const issues = validateDocument(document);
        return { type: "response", requestId: message.requestId, ok: true, revision: document.revision, issues, warnings: issues.filter((issue) => issue.severity !== "error") };
      }
      case "log":
        return { type: "response", requestId: message.requestId, ok: true, records: await controller.getRecords(), revision: (await controller.getSnapshot()).revision };
      case "apply":
      case "preview":
      case "undo":
      case "redo":
      case "layout":
        return mutate(message);
      case "render":
        return render(message);
      case "review":
        return review(message);
      default:
        throw new DrawitError("VALIDATION_ERROR", `Unknown request: ${message.type}`);
    }
  }

  async function mutate(message: ClientMessage): Promise<SessionResponse> {
    await ensureDocument(message.documentId);
    const source = message.source ?? "mcp";
    if (message.type === "undo" || message.type === "redo") {
      if (message.expectedRevision === undefined) throw new DrawitError("VALIDATION_ERROR", "expectedRevision is required");
      const result = message.type === "undo" ? await controller.undo(message.expectedRevision, source) : await controller.redo(message.expectedRevision, source);
      const flags = historyFlags();
      if (!result.ok) return { type: "response", requestId: message.requestId, ...result, ...flags };
      return { type: "response", requestId: message.requestId, ok: true, document: result.document, revision: result.revision, operationId: result.operationId, warnings: result.warnings, summary: result.summary, dirty: await controller.isDirty(), path: controller.path, ...flags };
    }
    if (message.type === "layout") {
      if (message.expectedRevision === undefined) throw new DrawitError("VALIDATION_ERROR", "expectedRevision is required");
      const document = await controller.getSnapshot();
      if (document.revision !== message.expectedRevision) return { type: "response", requestId: message.requestId, ok: false, code: "REVISION_CONFLICT", message: "Read the current revision before layout", currentRevision: document.revision };
      const laidOut = await layoutDocument(document, {
        direction: message.direction ?? document.layout?.direction ?? "TB",
        nodeSpacing: message.nodeSpacing ?? document.layout?.nodeSpacing ?? 48,
        rankSpacing: message.rankSpacing ?? document.layout?.rankSpacing ?? 72,
      });
      if (laidOut.updates.length === 0) {
        return { type: "response", requestId: message.requestId, ok: true, document, revision: document.revision, bounds: laidOut.bounds, summary: { updatedNodeIds: [] }, dirty: await controller.isDirty() };
      }
      const result = await controller.apply({
        expectedRevision: message.expectedRevision,
        source,
        operations: [{ op: "updateNodes", updates: laidOut.updates }],
      });
      if (!result.ok) return { type: "response", requestId: message.requestId, ...result, ...historyFlags() };
      return { type: "response", requestId: message.requestId, ok: true, document: result.document, revision: result.revision, operationId: result.operationId, warnings: result.warnings, summary: result.summary, bounds: laidOut.bounds, dirty: true, path: controller.path, ...historyFlags() };
    }
    const parsed = operationSchema.array().safeParse(message.operations ?? []);
    if (!parsed.success) throw new DrawitError("VALIDATION_ERROR", parsed.error.message);
    if (message.expectedRevision === undefined) throw new DrawitError("VALIDATION_ERROR", "expectedRevision is required");
    const request = { expectedRevision: message.expectedRevision, operations: parsed.data, source };
    const result = message.type === "preview" ? await controller.preview(request) : await controller.apply(request);
    const flags = historyFlags();
    if (!result.ok) return { type: "response", requestId: message.requestId, ...result, ...flags };
    let pngBase64: string | undefined;
    if (message.type === "preview" && message.includeReviewImage) {
      const rendered = await renderReviewPng(result.document);
      pngBase64 = rendered.png.toString("base64");
    }
    return {
      type: "response",
      requestId: message.requestId,
      ok: true,
      preview: message.type === "preview",
      document: result.document,
      revision: result.revision,
      operationId: result.operationId,
      warnings: result.warnings,
      summary: result.summary,
      dirty: message.type === "preview" ? await controller.isDirty() : true,
      path: controller.path,
      pngBase64,
      mimeType: pngBase64 ? "image/png" : undefined,
      ...flags,
    };
  }

  async function render(message: ClientMessage): Promise<SessionResponse> {
    await ensureDocument(message.documentId);
    const document = await controller.getSnapshot();
    const background = message.background;
    const svg = message.format === "svg" ? renderDocumentSvg(document, { background, padding: 24 }) : renderRasterSvg(document, { background, padding: 24 });
    if (message.format === "svg") {
      const exportPath = message.fileName ? safeExportPath(options.home, message.fileName.endsWith(".svg") ? message.fileName : `${message.fileName}.svg`) : undefined;
      if (exportPath) await writeFile(exportPath, svg);
      return { type: "response", requestId: message.requestId, ok: true, revision: document.revision, svg, exportPath };
    }
    const width = Math.min(4096, Math.max(1, (Number(/width="([0-9.]+)"/.exec(svg)?.[1] ?? 800) * (message.scale ?? 2))));
    const png = await svgToPng(svg, width);
    const exportPath = message.fileName ? safeExportPath(options.home, message.fileName.endsWith(".png") ? message.fileName : `${message.fileName}.png`) : undefined;
    if (exportPath) await writeFile(exportPath, png);
    return { type: "response", requestId: message.requestId, ok: true, revision: document.revision, pngBase64: png.toString("base64"), mimeType: "image/png", exportPath };
  }

  async function review(message: ClientMessage): Promise<SessionResponse> {
    await ensureDocument(message.documentId);
    const document = await controller.getSnapshot();
    const rendered = await renderReviewPng(document, { annotateIds: message.annotateIds ?? true });
    return {
      type: "response",
      requestId: message.requestId,
      ok: true,
      revision: document.revision,
      pngBase64: rendered.png.toString("base64"),
      mimeType: "image/png",
      manifest: rendered.manifest,
      warnings: rendered.manifest.warnings,
    };
  }

  return {
    port,
    token,
    home: options.home,
    close: () =>
      new Promise((resolve) => {
        closed = true;
        watcher.close();
        for (const socket of allSockets) socket.terminate();
        server.close(() => {
          void rm(sessionFile, { force: true }).finally(() => resolve());
        });
      }),
  };
}

export type { DiagramDocument };
