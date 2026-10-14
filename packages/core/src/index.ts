export { DocumentController } from "./controller.js";
export type { ApplyFailure, ApplyRequest, ApplyResult, ApplySuccess, ChangeSource, OperationRecord } from "./controller.js";
export { cloneDocument, createDocument, materializeNode, parseDocument } from "./document.js";
export { DrawitError, asDrawitError, errorCodes } from "./errors.js";
export type { ErrorCode } from "./errors.js";
export { createBinarySearchExample } from "./example.js";
export { absoluteBox, absolutePosition, edgeLabelPosition, edgeEndpoints, nodeConnectionBox, visualBodyBox, contentBounds, intersectionArea, projectSemanticNode } from "./geometry.js";
export type { Box } from "./geometry.js";
export { createId } from "./ids.js";
export { applyOperationsToDraft, emptySummary, operationSchema, nodeInputSchema, summarizeChanges } from "./operations.js";
export type { ChangeSummary, DiagramOperation, NodePatch } from "./operations.js";
export { componentById, componentCatalog, unsupportedDiagramKinds, componentRegistry, searchComponents, stylePresets } from "./registry.js";
export type { ComponentCategory, ComponentDefinition, StylePresetName } from "./registry.js";
export {
  SCHEMA_VERSION,
  idSchema,
  documentSchema,
  edgeSchema,
  nodeSchema, nodeTypeSchema, isContainerNode,
} from "./schema.js";
export type {
  CanvasSettings,
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  DiagramTheme,
  EdgeRouter,
  FlowchartKind,
  HandleSide,
  LayoutConfig,
  LayoutDirection,
  NodeStyle,
  NodeType,
  TreeValue,
} from "./schema.js";
export { nodePlainText, validateDocument } from "./validate.js";
export type { Issue } from "./validate.js";

export { wrapText } from "./text.js";

export { contentSize, gridLayout, treeLayout, graphLayout, labelHeight, labelWidth } from "./contentLayout.js";
export { LIMITS, checkInputBudget } from "./limits.js";
export { ACADEMIC, resolveNodeStyle, styledNodes } from "./academic.js";
