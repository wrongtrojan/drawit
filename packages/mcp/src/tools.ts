import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import { componentCatalog, unsupportedDiagramKinds, nodeInputSchema, operationSchema } from "@drawit/core";
import { compactResult, invoke } from "./invoke.js";
import type { SessionResponse } from "@drawit/session/protocol";

const documentId = z.string().describe("Optional document id. Omit to use the diagram open in the editor.");
const expectedRevision = z.number().int().nonnegative().describe("Revision returned by the latest diagram_get or mutation. The call is rejected when it does not match.");

function text(payload: unknown, isError = typeof payload === "object" && payload !== null && "ok" in payload && payload.ok === false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], isError };
}

function withImage(response: SessionResponse, payload: unknown) {
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
  if (response.ok && response.pngBase64) {
    content.push({ type: "image", data: response.pngBase64, mimeType: response.mimeType ?? "image/png" });
  }
  content.push({ type: "text", text: JSON.stringify(payload) });
  return { content, isError: !response.ok };
}

export const SERVER_INSTRUCTIONS = "Read diagram_get or diagram_get_view before editing to obtain the current revision and object ids. Discover available semantic components and minimal examples with diagram_catalog. Every content mutation must use expectedRevision. A REVISION_CONFLICT or VALIDATION_ERROR leaves the diagram unchanged; reread and retry a local edit. After a batch or layout, call diagram_review_snapshot and inspect the PNG for overlap, clipping, canvas overflow, arrows, and labels. Tool success only means an image was generated, never visual approval. Use object ids from its manifest to patch locally and review again. Call diagram_save before creating or switching documents when dirty is true. diagram_open_editor cannot start the app and EDITOR_NOT_RUNNING changes no diagram.";

export function registerDrawitTools(server: McpServer): void {
  server.registerTool("diagram_catalog", {
    description: "Choose semantic components using human-readable usage, short semantic fields, directly submittable exampleOperations, and composition order from the shared registry. Lists unsupported diagram kinds; never impersonate them with anonymous rectangles. Detailed schemas are opt-in. Message and activation reference existing lifeline ids; table merge row 0 is the header. Does not modify anything.",
    inputSchema: z.object({ includeSchema: z.boolean().optional().describe("Include detailed field schemas and default geometry; default false keeps usage guidance compact.") }),
  }, async ({ includeSchema }) => text({ ok: true, components: componentCatalog(includeSchema), unsupported: unsupportedDiagramKinds() }));
  server.registerTool("diagram_save", {
    description: 'Save the active diagram without changing geometry or revision. dirty becomes false so you can create or switch documents. Example: {}. Failure leaves content unchanged.',
    inputSchema: z.object({ documentId: documentId.optional() }),
  }, async ({ documentId: id }) => {
    const response = await invoke({ type: "save", documentId: id });
    return text(compactResult(response), !response.ok);
  });
  server.registerTool(
    "diagram_create",
    {
      description: "Create a new drawit diagram and make it the active document. If the editor is running, it switches to this diagram. Does not modify any existing diagram. Example: {\"title\":\"Architecture\"}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({ title: z.string().min(1).max(200).describe("Diagram title") }),
    },
    async ({ title }) => text(compactResult(await invoke({ type: "create", title, source: "mcp" }))),
  );

  server.registerTool(
    "diagram_get",
    {
      description: "Read the structured diagram document. Use this before edits so you have the current revision and object ids. Does not modify the diagram.",
      inputSchema: z.object({ documentId: documentId.optional() }),
    },
    async ({ documentId: id }) => text(compactResult(await invoke({ type: "get", documentId: id }))),
  );

  server.registerTool(
    "diagram_get_view",
    {
      description: "Read the current canvas view: revision, nodes with absolute coordinates, edges, selection, and viewport. Does not modify the diagram.",
      inputSchema: z.object({ documentId: documentId.optional() }),
    },
    async ({ documentId: id }) => {
      const response = await invoke({ type: "get", documentId: id });
      const payload = compactResult(response);
      if (!response.ok) return text(payload, true);
      return text({ ok: true, documentId: payload.documentId, revision: payload.revision, ...((payload.view as object) ?? {}), warnings: payload.warnings });
    },
  );

  server.registerTool(
    "diagram_list",
    {
      description: "List diagrams stored in the local drawit documents directory. Does not modify anything.",
      inputSchema: z.object({}),
    },
    async () => text(compactResult(await invoke({ type: "list" }))),
  );

  server.registerTool(
    "diagram_open_editor",
    {
      description: "Focus the running drawit editor on a diagram. Fails with EDITOR_NOT_RUNNING when the desktop app is closed. Does not change object geometry. Example: {\"documentId\":\"doc_binary_search\"}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({ documentId: documentId.optional() }),
    },
    async ({ documentId: id }) => text(compactResult(await invoke({ type: "open", documentId: id }))),
  );

  server.registerTool(
    "diagram_add_nodes",
    {
      description: "Add one or more nodes to the active diagram. Requires expectedRevision. Fails with REVISION_CONFLICT if the diagram changed. New nodes need a type; id, position, and size are optional. Example: {\"expectedRevision\":0,\"nodes\":[{\"id\":\"start\",\"type\":\"flowchart\",\"kind\":\"terminator\",\"text\":\"Start\"}]}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        expectedRevision,
        nodes: z.array(nodeInputSchema).min(1).max(200),
      }),
    },
    async ({ documentId: id, expectedRevision: revision, nodes }) => text(compactResult(await invoke({ type: "apply", documentId: id, expectedRevision: revision, source: "mcp", operations: [{ op: "addNodes", nodes }] }))),
  );

  server.registerTool(
    "diagram_update_nodes",
    {
      description: "Patch existing nodes by id. Requires expectedRevision. Omitted patch fields stay unchanged. This cannot replace the whole document. Example: {\"expectedRevision\":1,\"updates\":[{\"id\":\"start\",\"patch\":{\"x\":100}}]}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        expectedRevision,
        updates: z.array(z.object({ id: z.string(), patch: z.record(z.string(), z.unknown()) })).min(1).max(200),
      }),
    },
    async ({ documentId: id, expectedRevision: revision, updates }) => text(compactResult(await invoke({ type: "apply", documentId: id, expectedRevision: revision, source: "mcp", operations: [{ op: "updateNodes", updates }] }))),
  );

  server.registerTool(
    "diagram_delete_elements",
    {
      description: "Delete nodes and edges by id. Deleting a node also deletes its descendant nodes and incident edges. Requires expectedRevision. Fails if an id does not exist, and then nothing is deleted. Example: {\"expectedRevision\":2,\"nodeIds\":[\"start\"]}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        expectedRevision,
        nodeIds: z.array(z.string()).default([]),
        edgeIds: z.array(z.string()).default([]),
      }),
    },
    async ({ documentId: id, expectedRevision: revision, nodeIds, edgeIds }) => text(compactResult(await invoke({ type: "apply", documentId: id, expectedRevision: revision, source: "mcp", operations: [{ op: "deleteElements", nodeIds, edgeIds }] }))),
  );

  server.registerTool(
    "diagram_connect_nodes",
    {
      description: "Create or update edges between existing nodes. An edge id that already exists is updated. Requires expectedRevision. Fails when a source or target node does not exist. Example: {\"expectedRevision\":1,\"edges\":[{\"source\":\"start\",\"target\":\"work\",\"label\":\"next\"}]}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        expectedRevision,
        edges: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
      }),
    },
    async ({ documentId: id, expectedRevision: revision, edges }) => text(compactResult(await invoke({ type: "apply", documentId: id, expectedRevision: revision, source: "mcp", operations: [{ op: "connect", edges }] }))),
  );

  server.registerTool(
    "diagram_apply_operations",
    {
      description: "Apply an ordered batch of addNodes, updateNodes, deleteElements, connect, updateDocument, group, ungroup, align, distribute, or snapToGrid operations as one transaction. Requires expectedRevision. If any operation fails, the diagram is left unchanged. Example: {\"expectedRevision\":1,\"operations\":[{\"op\":\"snapToGrid\",\"nodeIds\":[\"start\"]}]}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        expectedRevision,
        operations: z.array(operationSchema).min(1).max(200),
      }),
    },
    async ({ documentId: id, expectedRevision: revision, operations }) => text(compactResult(await invoke({ type: "apply", documentId: id, expectedRevision: revision, source: "mcp", operations }))),
  );

  server.registerTool(
    "diagram_preview_operations",
    {
      description: "Preview a batch without committing it. The revision does not change. Set includeReviewImage true to also receive a PNG of the uncommitted result for visual checking.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        expectedRevision,
        operations: z.array(operationSchema).min(1).max(200),
        includeReviewImage: z.boolean().optional(),
      }),
    },
    async ({ documentId: id, expectedRevision: revision, operations, includeReviewImage }) => {
      const response = await invoke({ type: "preview", documentId: id, expectedRevision: revision, source: "mcp", operations, includeReviewImage });
      return withImage(response, { ...compactResult(response), preview: true, committed: false });
    },
  );

  server.registerTool(
    "diagram_auto_layout",
    {
      description: "Run layered layout once. Directions are TB, LR, BT, and RL. Nodes with pinned true keep their coordinates. Requires expectedRevision. Does not run automatically after ordinary edits. Example: {\"expectedRevision\":1,\"direction\":\"LR\"}. REVISION_CONFLICT, VALIDATION_ERROR and EDITOR_NOT_RUNNING do not change document content. Save dirty content before switching.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        expectedRevision,
        direction: z.enum(["TB", "LR", "BT", "RL"]).default("TB"),
        nodeSpacing: z.number().positive().max(400).default(48),
        rankSpacing: z.number().positive().max(400).default(72),
      }),
    },
    async ({ documentId: id, expectedRevision: revision, direction, nodeSpacing, rankSpacing }) => text(compactResult(await invoke({ type: "layout", documentId: id, expectedRevision: revision, source: "mcp", direction, nodeSpacing, rankSpacing }))),
  );

  server.registerTool(
    "diagram_validate",
    {
      description: "Validate structure and visual quality. Errors include duplicate ids, missing endpoints, bad parents, and unsafe images. Warnings include overlap, overflow, and canvas overflow. Does not modify the diagram.",
      inputSchema: z.object({ documentId: documentId.optional() }),
    },
    async ({ documentId: id }) => text(compactResult(await invoke({ type: "validate", documentId: id }))),
  );

  server.registerTool(
    "diagram_render",
    {
      description: "Export the current diagram to SVG or PNG through the shared renderer. PNG is returned as an MCP image when it is small enough, and can also be written under the drawit exports directory when fileName is set. This is the user export path and does not stamp review ids.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        format: z.enum(["svg", "png"]),
        fileName: z.string().optional().describe("File name only, saved under the drawit exports directory."),
        background: z.string().optional(),
        scale: z.number().positive().max(4).optional(),
      }),
    },
    async ({ documentId: id, format, fileName, background, scale }) => {
      const response = await invoke({ type: "render", documentId: id, format, fileName, background, scale });
      return withImage(response, compactResult(response));
    },
  );

  server.registerTool(
    "diagram_review_snapshot",
    {
      description: "Render the current diagram to a PNG and return it as an image so you can judge whether the picture looks acceptable. Call it after creating, editing, or laying out a diagram. Inspect overlap, clipped text, nodes outside the canvas, crossed arrows, labels covering shapes, and cramped spacing. Success only means the image was produced, not that the diagram looks right. If it looks wrong, patch the object ids from the manifest and call this tool again. This tool does not modify the diagram. A client without vision still receives the manifest and warnings.",
      inputSchema: z.object({
        documentId: documentId.optional(),
        annotateIds: z.boolean().optional().describe("Draw small ids on the review image. Defaults to true."),
      }),
    },
    async ({ documentId: id, annotateIds }) => {
      const response = await invoke({ type: "review", documentId: id, annotateIds });
      const payload = compactResult(response);
      return withImage(response, {
        ...payload,
        guidance: "Look at the image. If spacing, overlap, clipping, or arrows look wrong, update the listed object ids and review again. Do not treat this response as visual approval.",
      });
    },
  );
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "drawit", version: "0.1.0" }, { instructions: SERVER_INSTRUCTIONS });
  registerDrawitTools(server);
  return server;
}
