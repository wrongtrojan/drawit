import { z } from "zod/v4";

export const SCHEMA_VERSION = 1 as const;

export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/);

export const colorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|^[a-zA-Z]{1,20}$/);

export const handleSchema = z.enum(["top", "right", "bottom", "left"]);
export type HandleSide = z.infer<typeof handleSchema>;

export const nodeStyleSchema = z.object({
  fill: colorSchema.optional(),
  stroke: colorSchema.optional(),
  strokeWidth: z.number().min(0).max(24).optional(),
  color: colorSchema.optional(),
  fontSize: z.number().min(8).max(96).optional(),
  fontFamily: z.string().min(1).max(80).optional(),
  cornerRadius: z.number().min(0).max(200).optional(),
});
export type NodeStyle = z.infer<typeof nodeStyleSchema>;

const baseFields = {
  id: idSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().finite().max(8000),
  height: z.number().positive().finite().max(8000),
  parentId: idSchema.optional(),
  pinned: z.boolean().optional(),
  zIndex: z.number().int().min(-1000).max(1000).optional(),
  style: nodeStyleSchema.optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
};

const flowchartKindSchema = z.enum(["terminator", "process", "decision", "io"]);
export type FlowchartKind = z.infer<typeof flowchartKindSchema>;

export const treeValueSchema: z.ZodType<TreeValue> = z.lazy(() =>
  z.object({
    label: z.string(),
    children: z.array(treeValueSchema).default([]),
  }),
);

export interface TreeValue {
  label: string;
  children: TreeValue[];
}

const rectangleNodeSchema = z.object({
  type: z.literal("rectangle"),
  text: z.string().default(""),
  ...baseFields,
});
const roundedRectangleNodeSchema = z.object({
  type: z.literal("roundedRectangle"),
  text: z.string().default(""),
  ...baseFields,
});
const ellipseNodeSchema = z.object({
  type: z.literal("ellipse"),
  text: z.string().default(""),
  ...baseFields,
});
const diamondNodeSchema = z.object({
  type: z.literal("diamond"),
  text: z.string().default(""),
  ...baseFields,
});
const triangleNodeSchema = z.object({
  type: z.literal("triangle"),
  text: z.string().default(""),
  ...baseFields,
});
const polygonNodeSchema = z.object({
  type: z.literal("polygon"),
  text: z.string().default(""),
  points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(3),
  ...baseFields,
});
const textNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string().default(""),
  ...baseFields,
});
const noteNodeSchema = z.object({
  type: z.literal("note"),
  text: z.string().default(""),
  ...baseFields,
});
const containerNodeSchema = z.object({
  type: z.literal("container"),
  title: z.string().default(""),
  ...baseFields,
});
const imageNodeSchema = z.object({
  type: z.literal("image"),
  src: z.string().max(500_000),
  alt: z.string().default(""),
  ...baseFields,
});
const equationNodeSchema = z.object({
  type: z.literal("equation"),
  latex: z.string().max(4000),
  ...baseFields,
});
const matrixNodeSchema = z.object({
  type: z.literal("matrix"),
  cells: z.array(z.array(z.string())).min(1),
  bracket: z.enum(["none", "round", "square", "curly", "pipe"]).default("square"),
  spacing: z.number().min(0).max(80).default(8),
  highlightRows: z.array(z.number().int().nonnegative()).default([]),
  highlightCols: z.array(z.number().int().nonnegative()).default([]),
  highlightCells: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])).default([]),
  ...baseFields,
});
const vectorNodeSchema = z.object({
  type: z.literal("vector"),
  components: z.array(z.string()).min(1),
  orientation: z.enum(["row", "column"]).default("column"),
  ...baseFields,
});
const braceNodeSchema = z.object({
  type: z.literal("brace"),
  side: z.enum(["left", "right", "top", "bottom"]).default("left"),
  label: z.string().default(""),
  ...baseFields,
});
const annotationNodeSchema = z.object({
  type: z.literal("annotation"),
  text: z.string().default(""),
  targetId: idSchema.optional(),
  ...baseFields,
});
const flowchartNodeSchema = z.object({
  type: z.literal("flowchart"),
  kind: flowchartKindSchema,
  text: z.string().default(""),
  ...baseFields,
});
const arrayNodeSchema = z.object({
  type: z.literal("array"),
  items: z.array(z.string()).default([]),
  highlightIndex: z.number().int().nonnegative().optional(),
  ...baseFields,
});
const stackNodeSchema = z.object({
  type: z.literal("stack"),
  items: z.array(z.string()).default([]),
  highlightIndex: z.number().int().nonnegative().optional(),
  ...baseFields,
});
const queueNodeSchema = z.object({
  type: z.literal("queue"),
  items: z.array(z.string()).default([]),
  highlightIndex: z.number().int().nonnegative().optional(),
  ...baseFields,
});
const treeNodeSchema = z.object({
  type: z.literal("tree"),
  root: treeValueSchema,
  ...baseFields,
});
const graphVertexSchema = z.object({ id: idSchema, label: z.string() });
const graphNodeSchema = z.object({
  type: z.literal("graph"),
  vertices: z.array(graphVertexSchema).min(1),
  links: z.array(z.object({ source: z.string(), target: z.string(), label: z.string().optional() })).default([]),
  directed: z.boolean().default(true),
  ...baseFields,
});

export const nodeSchema = z.discriminatedUnion("type", [
  rectangleNodeSchema,
  roundedRectangleNodeSchema,
  ellipseNodeSchema,
  diamondNodeSchema,
  triangleNodeSchema,
  polygonNodeSchema,
  textNodeSchema,
  noteNodeSchema,
  containerNodeSchema,
  imageNodeSchema,
  equationNodeSchema,
  matrixNodeSchema,
  vectorNodeSchema,
  braceNodeSchema,
  annotationNodeSchema,
  flowchartNodeSchema,
  arrayNodeSchema,
  stackNodeSchema,
  queueNodeSchema,
  treeNodeSchema,
  graphNodeSchema,
]);
export type DiagramNode = z.infer<typeof nodeSchema>;
export type NodeType = DiagramNode["type"];

export const edgeRouterSchema = z.enum(["straight", "orthogonal", "curved", "bezier"]);
export type EdgeRouter = z.infer<typeof edgeRouterSchema>;

export const lineStyleSchema = z.enum(["solid", "dashed", "dotted"]);

export const edgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  sourceHandle: handleSchema.optional(),
  targetHandle: handleSchema.optional(),
  label: z.string().default(""),
  router: edgeRouterSchema.default("orthogonal"),
  arrowStart: z.boolean().default(false),
  arrowEnd: z.boolean().default(true),
  lineStyle: lineStyleSchema.default("solid"),
  color: colorSchema.optional(),
  width: z.number().min(0.5).max(16).optional(),
  waypoints: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type DiagramEdge = z.infer<typeof edgeSchema>;

export const canvasSchema = z.object({
  width: z.number().positive().max(20000),
  height: z.number().positive().max(20000),
  background: colorSchema.optional(),
  gridSize: z.number().positive().max(200).optional(),
});
export type CanvasSettings = z.infer<typeof canvasSchema>;

export const themeSchema = z.object({
  fontFamily: z.string().min(1).max(80).optional(),
  nodeFill: colorSchema.optional(),
  nodeStroke: colorSchema.optional(),
  edgeColor: colorSchema.optional(),
});
export type DiagramTheme = z.infer<typeof themeSchema>;

export const layoutDirectionSchema = z.enum(["TB", "LR", "BT", "RL"]);
export type LayoutDirection = z.infer<typeof layoutDirectionSchema>;

export const layoutConfigSchema = z.object({
  direction: layoutDirectionSchema.optional(),
  nodeSpacing: z.number().positive().max(400).optional(),
  rankSpacing: z.number().positive().max(400).optional(),
});
export type LayoutConfig = z.infer<typeof layoutConfigSchema>;

export const documentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  documentId: idSchema,
  revision: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  canvas: canvasSchema,
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  styles: themeSchema.optional(),
  layout: layoutConfigSchema.optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type DiagramDocument = z.infer<typeof documentSchema>;

export const NODE_FIELD_KEYS = [
  "id",
  "type",
  "x",
  "y",
  "width",
  "height",
  "parentId",
  "pinned",
  "zIndex",
  "style",
  "meta",
  "text",
  "title",
  "kind",
  "items",
  "highlightIndex",
  "latex",
  "cells",
  "bracket",
  "spacing",
  "highlightRows",
  "highlightCols",
  "highlightCells",
  "components",
  "orientation",
  "side",
  "label",
  "targetId",
  "points",
  "src",
  "alt",
  "vertices",
  "links",
  "directed",
  "root",
] as const;

export const EDGE_FIELD_KEYS = [
  "id",
  "source",
  "target",
  "sourceHandle",
  "targetHandle",
  "label",
  "router",
  "arrowStart",
  "arrowEnd",
  "lineStyle",
  "color",
  "width",
  "waypoints",
  "meta",
] as const;

export const DOCUMENT_FIELD_KEYS = [
  "schemaVersion",
  "documentId",
  "revision",
  "title",
  "canvas",
  "nodes",
  "edges",
  "styles",
  "layout",
  "meta",
] as const;
