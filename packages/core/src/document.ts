import { DrawitError } from "./errors.js";
import { checkInputBudget } from "./limits.js";
import { ACADEMIC } from "./academic.js";
import { createId, isRecord } from "./ids.js";
import {
  DOCUMENT_FIELD_KEYS,
  EDGE_FIELD_KEYS,
  NODE_FIELD_KEYS,
  SCHEMA_VERSION,
  type DiagramDocument,
  type DiagramNode,
  type NodeType,
  documentSchema,
  nodeSchema, nodeTypeSchema,
} from "./schema.js";
import { validateDocument } from "./validate.js";

const SIZES: Record<NodeType, { width: number; height: number }> = {
  rectangle: { width: 160, height: 64 },
  roundedRectangle: { width: 160, height: 64 },
  ellipse: { width: 150, height: 64 },
  diamond: { width: 150, height: 90 },
  triangle: { width: 140, height: 90 },
  polygon: { width: 140, height: 90 },
  text: { width: 140, height: 40 },
  note: { width: 180, height: 120 },
  container: { width: 320, height: 220 },
  image: { width: 160, height: 120 },
  equation: { width: 220, height: 72 },
  matrix: { width: 116, height: 96 },
  vector: { width: 96, height: 96 },
  brace: { width: 36, height: 140 },
  annotation: { width: 160, height: 48 },
  flowchart: { width: 170, height: 72 },
  array: { width: 280, height: 72 },
  stack: { width: 120, height: 220 },
  queue: { width: 300, height: 80 },
  tree: { width: 280, height: 180 },
  graph: { width: 260, height: 200 },
  table: { width: 360, height: 180 },
  lifeline: { width: 140, height: 360 },
  message: { width: 220, height: 36 },
  activation: { width: 20, height: 100 },
  class: { width: 240, height: 180 }, entity: { width: 220, height: 160 },
  relationship: { width: 180, height: 100 }, state: { width: 160, height: 72 },
  swimlane: { width: 720, height: 220 }, axis: { width: 420, height: 100 },
  tensor: { width: 200, height: 88 }, timeline: { width: 720, height: 200 },
};

const PLACEHOLDER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function defaultsFor(type: string): Record<string, unknown> {
  if (!(type in SIZES)) return { x: 80, y: 80, width: 160, height: 64, text: "" };
  const size = SIZES[type as NodeType];
  const common = { x: 80, y: 80, width: size.width, height: size.height, text: "" };
  switch (type) {
    case "message":
      return { ...common, y: 160 };
    case "activation":
      return { ...common, y: 196 };
    case "table":
      return { ...common, headers: ["名称", "值"], cells: [["条目", "内容"]], merges: [] };
    case "lifeline":
      return { ...common, text: "参与者" };
    case "polygon":
      return {
        ...common,
        points: [
          { x: 0.5, y: 0 },
          { x: 1, y: 0.25 },
          { x: 1, y: 0.75 },
          { x: 0.5, y: 1 },
          { x: 0, y: 0.75 },
          { x: 0, y: 0.25 },
        ],
      };
    case "container":
      return { x: 80, y: 80, width: size.width, height: size.height, title: "容器" };
    case "image":
      return { ...common, src: PLACEHOLDER_PNG, alt: "" };
    case "equation":
      return { x: 80, y: 80, width: size.width, height: size.height, latex: "E = mc^2" };
    case "matrix":
      return {
        x: 80,
        y: 80,
        width: size.width,
        height: size.height,
        cells: [
          ["a", "b"],
          ["c", "d"],
        ],
      };
    case "vector":
      return { x: 80, y: 80, width: size.width, height: size.height, components: ["x", "y"] };
    case "brace":
      return { x: 80, y: 80, width: size.width, height: size.height, label: "" };
    case "flowchart":
      return { ...common, kind: "process" };
    case "array":
    case "stack":
    case "queue":
      return { x: 80, y: 80, width: size.width, height: size.height, items: ["1", "2", "3"] };
    case "tree":
      return {
        x: 80,
        y: 80,
        width: size.width,
        height: size.height,
        root: { label: "root", children: [{ label: "L", children: [{ label: "叶子", children: [] }] }, { label: "R", children: [{ label: "叶子", children: [] }] }] },
      };
    case "graph":
      return {
        x: 80,
        y: 80,
        width: size.width,
        height: size.height,
        vertices: [
          { id: "v1", label: "A" },
          { id: "v2", label: "B" },
        ],
        links: [{ source: "v1", target: "v2" }],
      };
    default:
      return common;
  }
}

export function materializeNode(input: Record<string, unknown>, fallbackId: string): DiagramNode {
  const type = input.type;
  if (typeof type !== "string") {
    throw new DrawitError("VALIDATION_ERROR", "Node type is required");
  }
  if (!nodeTypeSchema.safeParse(type).success) throw new DrawitError("VALIDATION_ERROR", `Unsupported node type: ${type}. Read diagram_catalog for supported components.`);
  const defaults = defaultsFor(type as NodeType);
  const id = typeof input.id === "string" ? input.id : fallbackId;
  try {
    return nodeSchema.parse({ ...defaults, ...defined(input), id, type });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid node";
    throw new DrawitError("VALIDATION_ERROR", message);
  }
}

function absorb(raw: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const known = new Set<string>(keys);
  const meta = isRecord(raw.meta) ? { ...raw.meta } : {};
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "meta") continue;
    if (known.has(key)) body[key] = value;
    else meta[key] = value;
  }
  if (Object.keys(meta).length > 0) body.meta = meta;
  return body;
}

export function parseDocument(input: unknown): DiagramDocument {
  try { checkInputBudget(input); } catch (error) { throw new DrawitError("VALIDATION_ERROR", String(error)); }
  if (!isRecord(input)) {
    throw new DrawitError("VALIDATION_ERROR", "Document must be a JSON object");
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new DrawitError(
      "SCHEMA_INCOMPATIBLE",
      `Unsupported schemaVersion: ${String(input.schemaVersion)}. This build reads schemaVersion ${SCHEMA_VERSION}.`,
    );
  }
  const body = absorb(input, DOCUMENT_FIELD_KEYS);
  if (Array.isArray(input.nodes)) {
    body.nodes = input.nodes.map((node) => (isRecord(node) ? absorb(node, NODE_FIELD_KEYS) : node));
  }
  if (Array.isArray(input.edges)) {
    body.edges = input.edges.map((edge) => (isRecord(edge) ? absorb(edge, EDGE_FIELD_KEYS) : edge));
  }
  let document: DiagramDocument;
  try {
    document = documentSchema.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid document";
    throw new DrawitError("VALIDATION_ERROR", message);
  }
  const errors = validateDocument(document).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new DrawitError("VALIDATION_ERROR", errors.map((item) => item.message).join("; "), errors);
  }
  return document;
}

export function createDocument(title = "未命名图示", documentId = createId("doc_")): DiagramDocument {
  return parseDocument({
    schemaVersion: SCHEMA_VERSION,
    documentId,
    revision: 0,
    title,
    canvas: { width: 1400, height: 900, background: "#ffffff", gridSize: 20 },
    nodes: [],
    edges: [],
    styles: { fontFamily: ACADEMIC.fontFamily, nodeFill: "#ffffff", nodeStroke: ACADEMIC.ink, edgeColor: ACADEMIC.ink },
  });
}

export function cloneDocument(document: DiagramDocument): DiagramDocument {
  return structuredClone(document);
}
