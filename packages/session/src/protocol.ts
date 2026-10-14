import type { DiagramDocument, DiagramOperation, Issue, OperationRecord } from "@drawit/core";

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
