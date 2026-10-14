import { z } from "zod/v4";
import { nodeSchema } from "./schema.js";
import { materializeNode } from "./document.js";
import { createId } from "./ids.js";
import type { DiagramNode, FlowchartKind, NodeType } from "./schema.js";

export type ComponentCategory = "basic" | "math" | "domain";

export interface ComponentDefinition {
  id: string;
  type: NodeType;
  category: ComponentCategory;
  label: string;
  keywords: string[];
  propertySchema: Record<string, unknown>;
  requiredFields: string[];
  example: Record<string, unknown>;
  create: (id?: string) => DiagramNode;
}

function define(
  id: string,
  type: NodeType,
  category: ComponentCategory,
  label: string,
  keywords: string[],
  partial: Record<string, unknown>,
): ComponentDefinition {
  const schema = nodeSchema.options.find((option) => option.shape.type.value === type)!;
  const propertySchema = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  const required = (propertySchema.required as string[]).filter((key) => !["id", "type", "x", "y", "width", "height"].includes(key));
  const referenceExamples: Record<string, unknown> = type === "message" ? { sourceId: "client", targetId: "server" } : type === "activation" ? { lifelineId: "server" } : {};
  const example = { ...materializeNode({ type, ...partial, ...referenceExamples }, "example") };
  return {
    propertySchema, requiredFields: required, example,
    id,
    type,
    category,
    label,
    keywords,
    create: (nodeId = createId("n")) => materializeNode({ type, ...partial }, nodeId),
  };
}

const flowchart = (kind: FlowchartKind, label: string, keywords: string[], partial: Record<string, unknown> = {}): ComponentDefinition =>
  define(`flowchart.${kind}`, "flowchart", "domain", label, keywords, { kind, text: label, ...partial });

export const componentRegistry: ComponentDefinition[] = [
  define("basic.rectangle", "rectangle", "basic", "矩形", ["rectangle", "rect", "矩形"], { text: "矩形" }),
  define("basic.roundedRectangle", "roundedRectangle", "basic", "圆角矩形", ["rounded", "圆角"], { text: "圆角" }),
  define("basic.ellipse", "ellipse", "basic", "椭圆", ["ellipse", "oval", "椭圆"], { text: "椭圆" }),
  define("basic.diamond", "diamond", "basic", "菱形", ["diamond", "菱形"], { text: "判断" }),
  define("basic.triangle", "triangle", "basic", "三角形", ["triangle", "三角形"], { text: "" }),
  define("basic.polygon", "polygon", "basic", "多边形", ["polygon", "多边形"], { text: "" }),
  define("basic.text", "text", "basic", "文本", ["text", "label", "文本"], { text: "文本" }),
  define("basic.note", "note", "basic", "注释", ["note", "注释"], { text: "注释" }),
  define("basic.container", "container", "basic", "容器", ["container", "group", "容器"], { title: "容器" }),
  define("basic.image", "image", "basic", "图片", ["image", "图片"], {}),
  flowchart("terminator", "起止", ["terminator", "start", "end", "起止"]),
  flowchart("process", "处理", ["process", "处理"]),
  flowchart("decision", "判断", ["decision", "判断"], { width: 160, height: 100 }),
  flowchart("io", "输入输出", ["io", "input", "output", "输入"], { width: 180, height: 72 }),
  define("sequence.lifeline", "lifeline", "domain", "生命线", ["sequence", "时序图", "参与者"], { text: "参与者" }),
  define("sequence.message", "message", "domain", "消息", ["sequence", "时序图", "消息"], { sourceId: "client", targetId: "server", text: "请求" }),
  define("sequence.activation", "activation", "domain", "激活条", ["sequence", "时序图", "激活"], { lifelineId: "server" }),
  define("domain.table", "table", "domain", "表格", ["table", "表头", "合并", "页表"], {}),
  define("architecture.layer", "container", "domain", "架构分层", ["architecture", "layer", "分层", "架构"], { title: "架构层", width: 600, height: 240 }),
  define("basic.callout", "annotation", "basic", "目标标注", ["callout", "标注", "箭头"], { text: "说明" }),
  define("domain.array", "array", "domain", "数组", ["array", "数组"], { items: ["a0", "a1", "a2", "a3"] }),
  define("domain.stack", "stack", "domain", "栈", ["stack", "栈"], { items: ["top", "mid", "bottom"] }),
  define("domain.queue", "queue", "domain", "队列", ["queue", "队列"], { items: ["head", "a", "b", "tail"] }),
  define("domain.tree", "tree", "domain", "树", ["tree", "树"], {}),
  define("domain.graph", "graph", "domain", "图", ["graph", "图"], {}),
  define("math.equation", "equation", "math", "公式", ["equation", "latex", "公式"], { latex: "E = mc^2" }),
  define("math.matrix", "matrix", "math", "矩阵", ["matrix", "矩阵"], {}),
  define("math.vector", "vector", "math", "向量", ["vector", "向量"], {}),
  define("math.brace", "brace", "math", "括号", ["brace", "括号"], { label: "n" }),
  define("math.annotation", "annotation", "math", "公式注释", ["annotation", "注释"], { text: "说明" }),
];

export function searchComponents(query: string): ComponentDefinition[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return componentRegistry;
  return componentRegistry.filter((item) =>
    [item.label, item.type, item.id, ...item.keywords].join(" ").toLowerCase().includes(needle),
  );
}

export function componentById(id: string): ComponentDefinition | undefined {
  return componentRegistry.find((item) => item.id === id);
}

export const stylePresets = {
  default: { fill: "#ffffff", stroke: "#1f2937", color: "#111827" },
  muted: { fill: "#f1f5f9", stroke: "#94a3b8", color: "#334155" },
  emphasis: { fill: "#dbeafe", stroke: "#1d4ed8", color: "#1e3a8a" },
} as const;

export type StylePresetName = keyof typeof stylePresets;

export function componentCatalog() {
  return componentRegistry.map(({ id, type, category, label, keywords, propertySchema, requiredFields, example }) => ({
    id, type, category, label, scenarios: keywords, propertySchema, requiredFields, example,
    defaultGeometry: { width: example.width, height: example.height },
  }));
}
