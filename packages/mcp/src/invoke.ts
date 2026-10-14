import { absolutePosition, projectSemanticNode, operationSchema } from "@drawit/core";
import { drawitHome } from "@drawit/core/node";
import type { SessionResponse } from "@drawit/session/protocol";
import { callFile } from "./fileStore.js";
import { callSession } from "./sessionClient.js";

export async function invoke(body: Record<string, unknown>, home = drawitHome()): Promise<SessionResponse> {
  const live = await callSession(body, home);
  if (live) return live;
  if (body.type === "open") return callFile(home, { ...body, type: "openEditor" });
  return callFile(home, body);
}

export function compactResult(response: SessionResponse, includeDocument = false): Record<string, unknown> {
  if (!response.ok) {
    return { ok: false, code: response.code, message: response.message, currentRevision: response.currentRevision, issues: response.issues };
  }
  const document = response.document;
  return {
    ok: true,
    documentId: document?.documentId,
    revision: response.revision ?? document?.revision,
    operationId: response.operationId,
    summary: response.summary,
    warnings: response.warnings,
    dirty: response.dirty,
    path: response.path,
    preview: response.preview,
    bounds: response.bounds,
    exportPath: response.exportPath,
    documents: response.documents,
    issues: response.issues,
    records: response.records,
    manifest: response.manifest,
    svg: response.svg,
    document: includeDocument ? document : undefined,
    view: document
      ? {
          selection: response.view?.selection ?? [],
          viewport: response.view?.viewport ?? { x: 0, y: 0, zoom: 1 },
          nodes: document.nodes.map((node) => {
            const absolute = absolutePosition(document.nodes, node.id);
            return { ...node, renderedWidth: projectSemanticNode(document.nodes, node).width, renderedHeight: projectSemanticNode(document.nodes, node).height, absoluteX: absolute.x, absoluteY: absolute.y };
          }),
          edges: document.edges,
        }
      : response.view,
  };
}

export { operationSchema };
