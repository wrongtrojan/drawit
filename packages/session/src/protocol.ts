import type { DiagramDocument, DiagramOperation, Issue, OperationRecord } from "@drawit/core";
import { idSchema, LIMITS } from "@drawit/core";
import { z } from "zod/v4";

export const clientMessageSchema = z.object({
  requestId: z.string().min(1).max(100), token: z.string().min(1).max(128),
  type: z.enum(["get", "subscribe", "create", "open", "import", "reload", "save", "list", "setView", "validate", "log", "apply", "preview", "undo", "redo", "layout", "render", "review"]),
  title: z.string().min(1).max(200).optional(), documentId: idSchema.optional(), expectedDocumentId: idSchema.optional(),
  expectedRevision: z.number().int().nonnegative().safe().optional(), operations: z.array(z.unknown()).max(200).optional(), source: z.enum(["gui", "mcp"]).optional(),
  selection: z.array(idSchema).max(LIMITS.nodes + LIMITS.edges).optional(),
  viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(.01).max(4) }).optional(),
  json: z.unknown().optional(), direction: z.enum(["TB", "LR", "BT", "RL"]).optional(), nodeSpacing: z.number().positive().max(400).optional(), rankSpacing: z.number().positive().max(400).optional(),
  format: z.enum(["svg", "png"]).optional(), fileName: z.string().min(1).max(180).optional(), background: z.string().max(20).optional(), scale: z.number().positive().max(4).optional(),
  annotateIds: z.boolean().optional(), includeReviewImage: z.boolean().optional(),
}).strict();

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewState {
  selection: string[];
  viewport: Viewport;
}

export interface SessionHello {
  port: number;
  token: string;
  pid: number;
}

export interface ClientMessage {
  requestId: string;
  token: string;
  type: string;
  title?: string;
  documentId?: string;
  expectedRevision?: number;
  expectedDocumentId?: string;
  operations?: DiagramOperation[];
  source?: "gui" | "mcp";
  selection?: string[];
  viewport?: Viewport;
  json?: unknown;
  direction?: "TB" | "LR" | "BT" | "RL";
  nodeSpacing?: number;
  rankSpacing?: number;
  format?: "svg" | "png";
  fileName?: string;
  background?: string;
  scale?: number;
  annotateIds?: boolean;
  includeReviewImage?: boolean;
}

export interface SessionResponse {
  sessionId?: string;
  documentEpoch?: number;
  type: "response";
  requestId: string;
  ok: boolean;
  code?: string;
  message?: string;
  currentRevision?: number;
  issues?: Issue[];
  document?: DiagramDocument;
  revision?: number;
  operationId?: string;
  warnings?: Issue[];
  summary?: unknown;
  dirty?: boolean;
  path?: string | null;
  documents?: Array<{ documentId: string; title: string; revision: number; fileName: string }>;
  view?: ViewState;
  svg?: string;
  pngBase64?: string;
  mimeType?: string;
  exportPath?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  manifest?: unknown;
  records?: OperationRecord[];
  preview?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}

export interface SessionEvent {
  sessionId?: string;
  documentEpoch?: number;
  type: "event";
  event: "revision" | "view" | "saved" | "externalChange";
  document?: DiagramDocument;
  record?: OperationRecord | null;
  warnings?: Issue[];
  dirty?: boolean;
  path?: string | null;
  view?: ViewState;
  canUndo?: boolean;
  canRedo?: boolean;
}
