import { z } from "zod/v4";
import { materializeNode } from "./document.js";
import { DrawitError } from "./errors.js";
import { absoluteBox, absolutePosition } from "./geometry.js";
import { createId } from "./ids.js";
import {
  canvasSchema,
  edgeSchema,
  handleSchema,
  idSchema,
  layoutConfigSchema,
  lineStyleSchema,
  nodeSchema,
  nodeStyleSchema,
  themeSchema,
  treeValueSchema,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramNode,
} from "./schema.js";

export interface ChangeSummary {
  addedNodeIds: string[];
  updatedNodeIds: string[];
  deletedNodeIds: string[];
  addedEdgeIds: string[];
  updatedEdgeIds: string[];
  deletedEdgeIds: string[];
}

export function emptySummary(): ChangeSummary {
  return {
    addedNodeIds: [],
    updatedNodeIds: [],
    deletedNodeIds: [],
    addedEdgeIds: [],
    updatedEdgeIds: [],
    deletedEdgeIds: [],
  };
}

export const nodePatchSchema = z
  .object({
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().max(8000).optional(),
    height: z.number().positive().max(8000).optional(),
    parentId: idSchema.nullable().optional(),
    pinned: z.boolean().optional(),
    zIndex: z.number().int().min(-1000).max(1000).optional(),
    style: nodeStyleSchema.optional(),
    text: z.string().optional(),
    title: z.string().optional(),
    kind: z.enum(["terminator", "process", "decision", "io"]).optional(),
    items: z.array(z.string()).optional(),
    highlightIndex: z.number().int().nonnegative().nullable().optional(),
    latex: z.string().max(4000).optional(),
    cells: z.array(z.array(z.string())).optional(),
    bracket: z.enum(["none", "round", "square", "curly", "pipe"]).optional(),
    spacing: z.number().min(0).max(80).optional(),
    highlightRows: z.array(z.number().int().nonnegative()).optional(),
    highlightCols: z.array(z.number().int().nonnegative()).optional(),
    highlightCells: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])).optional(),
    components: z.array(z.string()).optional(),
    orientation: z.enum(["row", "column"]).optional(),
    side: z.enum(["left", "right", "top", "bottom"]).optional(),
    label: z.string().optional(),
    targetId: idSchema.nullable().optional(),
    points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).optional(),
    src: z.string().max(500_000).optional(),
    alt: z.string().optional(),
    vertices: z.array(z.object({ id: idSchema, label: z.string() })).optional(),
    links: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })).optional(),
    directed: z.boolean().optional(),
    root: treeValueSchema.optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type NodePatch = z.infer<typeof nodePatchSchema>;

export const nodeInputSchema = nodePatchSchema
  .extend({
    id: idSchema.optional(),
    type: z.string().min(1),
  })
  .strict();

export const edgeInputSchema = z
  .object({
    id: idSchema.optional(),
    source: idSchema,
    target: idSchema,
    sourceHandle: handleSchema.optional(),
    targetHandle: handleSchema.optional(),
    label: z.string().optional(),
    router: z.enum(["straight", "orthogonal", "curved", "bezier"]).optional(),
    arrowStart: z.boolean().optional(),
    arrowEnd: z.boolean().optional(),
    lineStyle: lineStyleSchema.optional(),
    color: z.string().optional(),
    width: z.number().min(0.5).max(16).optional(),
    waypoints: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addNodes"), nodes: z.array(nodeInputSchema).min(1).max(200) }),
  z.object({
    op: z.literal("updateNodes"),
    updates: z.array(z.object({ id: idSchema, patch: nodePatchSchema }).strict()).min(1).max(200),
  }),
  z.object({
    op: z.literal("deleteElements"),
    nodeIds: z.array(idSchema).max(200).default([]),
    edgeIds: z.array(idSchema).max(200).default([]),
  }),
  z.object({ op: z.literal("connect"), edges: z.array(edgeInputSchema).min(1).max(200) }),
  z.object({
    op: z.literal("updateDocument"),
    patch: z
      .object({
        title: z.string().min(1).max(200).optional(),
        canvas: canvasSchema.partial().optional(),
        styles: themeSchema.optional(),
        layout: layoutConfigSchema.optional(),
      })
      .strict(),
  }),
  z.object({
    op: z.literal("group"),
    nodeIds: z.array(idSchema).min(1).max(200),
    containerId: idSchema.optional(),
    title: z.string().max(200).optional(),
  }),
  z.object({ op: z.literal("ungroup"), containerId: idSchema }),
]);
export type DiagramOperation = z.infer<typeof operationSchema>;

function requireNode(document: DiagramDocument, id: string): DiagramNode {
  const node = document.nodes.find((item) => item.id === id);
  if (!node) throw new DrawitError("NOT_FOUND", `Node not found: ${id}`);
  return node;
}

function assertIdAvailable(document: DiagramDocument, id: string): void {
  if (document.nodes.some((node) => node.id === id) || document.edges.some((edge) => edge.id === id)) {
    throw new DrawitError("VALIDATION_ERROR", `Duplicate id: ${id}`);
  }
}

function addNodes(document: DiagramDocument, nodes: z.infer<typeof nodeInputSchema>[], summary: ChangeSummary): void {
  for (const input of nodes) {
    const id = input.id ?? createId("n");
    assertIdAvailable(document, id);
    const node = materializeNode(input, id);
    document.nodes.push(node);
    summary.addedNodeIds.push(node.id);
    if (document.nodes.length > 500) {
      throw new DrawitError("VALIDATION_ERROR", "A diagram cannot contain more than 500 nodes");
    }
  }
}

function updateNodes(
  document: DiagramDocument,
  updates: { id: string; patch: NodePatch }[],
  summary: ChangeSummary,
): void {
  for (const update of updates) {
    const index = document.nodes.findIndex((node) => node.id === update.id);
    if (index < 0) throw new DrawitError("NOT_FOUND", `Node not found: ${update.id}`);
    const current = document.nodes[index];
    if (!current) throw new DrawitError("NOT_FOUND", `Node not found: ${update.id}`);
    const next: Record<string, unknown> = { ...current };
    const parentChanges = update.patch.parentId !== undefined && (update.patch.parentId ?? undefined) !== current.parentId;
    if (parentChanges && update.patch.x === undefined && update.patch.y === undefined) {
      const absolute = absolutePosition(document.nodes, current.id);
      const parentId = update.patch.parentId;
      const origin = parentId ? absolutePosition(document.nodes, parentId) : { x: 0, y: 0 };
      next.x = absolute.x - origin.x;
      next.y = absolute.y - origin.y;
    }
    for (const [key, value] of Object.entries(update.patch)) {
      if (value === undefined) continue;
      if (key === "style") {
        next.style = { ...(current.style ?? {}), ...(value as NodePatch["style"]) };
        continue;
      }
      if (key === "meta") {
        next.meta = { ...(current.meta ?? {}), ...(value as Record<string, unknown>) };
        continue;
      }
      if ((key === "parentId" || key === "targetId" || key === "highlightIndex") && value === null) {
        delete next[key];
        continue;
      }
      next[key] = value;
    }
    next.id = current.id;
    next.type = current.type;
    try {
      document.nodes[index] = nodeSchema.parse(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid node update";
      throw new DrawitError("VALIDATION_ERROR", message);
    }
    summary.updatedNodeIds.push(update.id);
  }
}

function deleteElements(document: DiagramDocument, nodeIds: string[], edgeIds: string[], summary: ChangeSummary): void {
  if (nodeIds.length === 0 && edgeIds.length === 0) {
    throw new DrawitError("VALIDATION_ERROR", "deleteElements requires at least one id");
  }
  for (const id of nodeIds) requireNode(document, id);
  for (const id of edgeIds) {
    if (!document.edges.some((edge) => edge.id === id)) {
      throw new DrawitError("NOT_FOUND", `Edge not found: ${id}`);
    }
  }
  const removeNodes = new Set(nodeIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of document.nodes) {
      if (node.parentId && removeNodes.has(node.parentId) && !removeNodes.has(node.id)) {
        removeNodes.add(node.id);
        grew = true;
      }
    }
  }
  const removeEdges = new Set(edgeIds);
  for (const edge of document.edges) {
    if (removeNodes.has(edge.source) || removeNodes.has(edge.target)) removeEdges.add(edge.id);
  }
  document.nodes = document.nodes.filter((node) => !removeNodes.has(node.id));
  document.edges = document.edges.filter((edge) => !removeEdges.has(edge.id));
  summary.deletedNodeIds.push(...removeNodes);
  summary.deletedEdgeIds.push(...removeEdges);
}

function connect(document: DiagramDocument, edges: z.infer<typeof edgeInputSchema>[], summary: ChangeSummary): void {
  for (const input of edges) {
    const id = input.id ?? createId("e");
    const existingIndex = document.edges.findIndex((edge) => edge.id === id);
    const existing = existingIndex >= 0 ? document.edges[existingIndex] : undefined;
    const merged = {
      router: "orthogonal" as const,
      arrowEnd: true,
      arrowStart: false,
      label: "",
      lineStyle: "solid" as const,
      ...(existing ?? {}),
      ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
      id,
    };
    let edge: DiagramEdge;
    try {
      edge = edgeSchema.parse(merged);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid edge";
      throw new DrawitError("VALIDATION_ERROR", message);
    }
    if (!document.nodes.some((node) => node.id === edge.source) || !document.nodes.some((node) => node.id === edge.target)) {
      throw new DrawitError("VALIDATION_ERROR", `Edge ${edge.id} references a missing node`);
    }
    if (existingIndex >= 0) {
      document.edges[existingIndex] = edge;
      summary.updatedEdgeIds.push(edge.id);
    } else {
      assertIdAvailable(document, edge.id);
      document.edges.push(edge);
      summary.addedEdgeIds.push(edge.id);
      if (document.edges.length > 1000) {
        throw new DrawitError("VALIDATION_ERROR", "A diagram cannot contain more than 1000 edges");
      }
    }
  }
}

function updateDocument(document: DiagramDocument, patch: { title?: string; canvas?: object; styles?: object; layout?: object }): void {
  if (patch.title !== undefined) document.title = patch.title;
  if (patch.canvas) document.canvas = canvasSchema.parse({ ...document.canvas, ...patch.canvas });
  if (patch.styles) document.styles = themeSchema.parse({ ...(document.styles ?? {}), ...patch.styles });
  if (patch.layout) document.layout = layoutConfigSchema.parse({ ...(document.layout ?? {}), ...patch.layout });
}

function groupNodes(
  document: DiagramDocument,
  nodeIds: string[],
  containerId: string | undefined,
  title: string | undefined,
  summary: ChangeSummary,
): void {
  const unique = [...new Set(nodeIds)];
  const selected = unique.map((id) => requireNode(document, id));
  if (selected.some((node) => node.parentId)) {
    throw new DrawitError("VALIDATION_ERROR", "Only top-level nodes can be grouped");
  }
  const boxes = selected.map((node) => absoluteBox(document.nodes, node));
  const padding = 28;
  const minX = Math.min(...boxes.map((box) => box.x)) - padding;
  const minY = Math.min(...boxes.map((box) => box.y)) - padding;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + padding;
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + padding;
  const id = containerId ?? createId("g");
  assertIdAvailable(document, id);
  document.nodes.push(
    nodeSchema.parse({
      id,
      type: "container",
      title: title ?? "分组",
      x: minX,
      y: minY,
      width: Math.max(80, maxX - minX),
      height: Math.max(80, maxY - minY),
    }),
  );
  summary.addedNodeIds.push(id);
  for (const node of selected) {
    const absolute = absoluteBox(document.nodes, node);
    node.parentId = id;
    node.x = absolute.x - minX;
    node.y = absolute.y - minY;
    summary.updatedNodeIds.push(node.id);
  }
}

function ungroup(document: DiagramDocument, containerId: string, summary: ChangeSummary): void {
  const container = requireNode(document, containerId);
  if (container.type !== "container") {
    throw new DrawitError("VALIDATION_ERROR", `Node ${containerId} is not a container`);
  }
  const children = document.nodes.filter((node) => node.parentId === containerId);
  const placed = children.map((child) => ({ id: child.id, absolute: absolutePosition(document.nodes, child.id) }));
  const nextParent = container.parentId;
  const origin = nextParent ? absolutePosition(document.nodes, nextParent) : { x: 0, y: 0 };
  const removedEdges = document.edges.filter((edge) => edge.source === containerId || edge.target === containerId).map((edge) => edge.id);
  document.nodes = document.nodes.filter((node) => node.id !== containerId);
  document.edges = document.edges.filter((edge) => edge.source !== containerId && edge.target !== containerId);
  summary.deletedNodeIds.push(containerId);
  summary.deletedEdgeIds.push(...removedEdges);
  for (const item of placed) {
    const child = document.nodes.find((node) => node.id === item.id);
    if (!child) continue;
    if (nextParent) child.parentId = nextParent;
    else delete child.parentId;
    child.x = item.absolute.x - origin.x;
    child.y = item.absolute.y - origin.y;
    summary.updatedNodeIds.push(child.id);
  }
}

export function applyOperationsToDraft(document: DiagramDocument, operations: DiagramOperation[]): ChangeSummary {
  if (operations.length === 0) {
    throw new DrawitError("VALIDATION_ERROR", "At least one operation is required");
  }
  const summary = emptySummary();
  for (const operation of operations) {
    switch (operation.op) {
      case "addNodes":
        addNodes(document, operation.nodes, summary);
        break;
      case "updateNodes":
        updateNodes(document, operation.updates, summary);
        break;
      case "deleteElements":
        deleteElements(document, operation.nodeIds, operation.edgeIds, summary);
        break;
      case "connect":
        connect(document, operation.edges, summary);
        break;
      case "updateDocument":
        updateDocument(document, operation.patch);
        break;
      case "group":
        groupNodes(document, operation.nodeIds, operation.containerId, operation.title, summary);
        break;
      case "ungroup":
        ungroup(document, operation.containerId, summary);
        break;
    }
  }
  return summary;
}

export function summarizeChanges(summary: ChangeSummary): string {
  const parts = [
    summary.addedNodeIds.length ? `added ${summary.addedNodeIds.length} nodes` : "",
    summary.updatedNodeIds.length ? `updated ${summary.updatedNodeIds.length} nodes` : "",
    summary.deletedNodeIds.length ? `deleted ${summary.deletedNodeIds.length} nodes` : "",
    summary.addedEdgeIds.length ? `added ${summary.addedEdgeIds.length} edges` : "",
    summary.updatedEdgeIds.length ? `updated ${summary.updatedEdgeIds.length} edges` : "",
    summary.deletedEdgeIds.length ? `deleted ${summary.deletedEdgeIds.length} edges` : "",
  ].filter(Boolean);
  return parts.join(", ") || "updated document";
}
