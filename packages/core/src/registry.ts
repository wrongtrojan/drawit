import { componentGuidance, type ComponentGuidance } from "./componentGuidance.js";
import { z } from "zod/v4";
import { nodeSchema } from "./schema.js";
import { materializeNode } from "./document.js";
import { createId } from "./ids.js";
import type { DiagramNode, FlowchartKind, NodeType } from "./schema.js";

export type ComponentCategory = "shape" | "group" | "flow" | "sequence" | "data" | "model" | "math" | "time";

export interface ComponentDefinition extends ComponentGuidance {
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
  const referenceExamples: Record<string, unknown> = type === "message" ? { sourceId: "client", targetId: "server" } : type === "activation" ? { lifelineId: "server" } : type === "annotation" ? { targetId: "target" } : ["array", "stack", "queue"].includes(type) ? { highlightIndex: 0 } : {};
  const example = { ...materializeNode({ type, ...partial, ...referenceExamples }, "example") };
  const semanticFields = [...componentGuidance[type].semanticFields, ...(partial.style ? ["style"] : [])];
  return {
    ...componentGuidance[type], semanticFields, usage: id === "math.title" ? "顶部居中的浅蓝标题胶囊，text 保存标题文字。" : id === "math.operator" ? "公式对象之间的运算符，例如 =、+ 或乘号，无外框。" : componentGuidance[type].usage, propertySchema, requiredFields: semanticFields, example: Object.fromEntries(Object.entries(example).filter(([key]) => ["id", "type", ...semanticFields].includes(key))),
    id,
    type,
    category,
    label,
    keywords,
    create: (nodeId = createId("n")) => materializeNode({ type, ...partial }, nodeId),
  };
}

const flowchart = (kind: FlowchartKind, label: string, keywords: string[], partial: Record<string, unknown> = {}): ComponentDefinition =>
  define(`flowchart.${kind}`, "flowchart", "flow", label, keywords, { kind, text: label, ...partial });

export const componentRegistry: ComponentDefinition[] = [
  define("basic.rectangle", "rectangle", "shape", "矩形", ["rectangle", "rect", "矩形"], { text: "矩形" }),
  define("basic.roundedRectangle", "roundedRectangle", "shape", "圆角矩形", ["rounded", "圆角"], { text: "圆角" }),
  define("basic.ellipse", "ellipse", "shape", "椭圆", ["ellipse", "oval", "椭圆"], { text: "椭圆" }),
  define("basic.diamond", "diamond", "shape", "菱形", ["diamond", "菱形"], { text: "判断" }),
  define("basic.triangle", "triangle", "shape", "三角形", ["triangle", "三角形"], { text: "" }),
  define("basic.polygon", "polygon", "shape", "多边形", ["polygon", "多边形"], { text: "" }),
  define("basic.text", "text", "shape", "文本", ["text", "label", "文本"], { text: "文本" }),
  define("basic.note", "note", "shape", "注释", ["note", "注释"], { text: "注释" }),
  define("basic.container", "container", "group", "容器", ["container", "group", "容器"], { title: "容器" }),
  define("basic.image", "image", "shape", "图片", ["image", "图片"], {}),
  flowchart("terminator", "起止", ["terminator", "start", "end", "起止"]),
  flowchart("process", "处理", ["process", "处理"]),
  flowchart("decision", "判断", ["decision", "判断"], { width: 160, height: 100 }),
  flowchart("io", "输入输出", ["io", "input", "output", "输入"], { width: 180, height: 72 }),
  define("sequence.lifeline", "lifeline", "sequence", "生命线", ["sequence", "时序图", "参与者"], { text: "参与者" }),
  define("sequence.message", "message", "sequence", "消息", ["sequence", "时序图", "消息"], { sourceId: "client", targetId: "server", text: "请求" }),
  define("sequence.activation", "activation", "sequence", "激活条", ["sequence", "时序图", "激活"], { lifelineId: "server" }),
  define("domain.table", "table", "data", "表格", ["table", "表头", "合并", "页表"], {}),
  define("architecture.layer", "container", "group", "架构分层", ["architecture", "layer", "分层", "架构"], { title: "架构层", width: 600, height: 240 }),
  define("basic.callout", "annotation", "shape", "目标标注", ["callout", "标注", "箭头"], { text: "说明" }),
  define("domain.array", "array", "data", "数组", ["array", "数组"], { items: ["a0", "a1", "a2", "a3"] }),
  define("domain.stack", "stack", "data", "栈", ["stack", "栈"], { items: ["top", "mid", "bottom"] }),
  define("domain.queue", "queue", "data", "队列", ["queue", "队列"], { items: ["head", "a", "b", "tail"] }),
  define("uml.class", "class", "model", "类", ["class", "UML", "类图"], { name: "User", attributes: ["+ id: string"], methods: ["+ login(): void"], stereotype: "" }),
  define("er.entity", "entity", "model", "ER 实体", ["entity", "ER", "实体"], { name: "用户", attributes: ["id（主键）", "姓名"] }),
  define("er.relationship", "relationship", "model", "ER 联系", ["relationship", "ER", "联系"], { name: "拥有" }),
  define("domain.state", "state", "flow", "状态", ["state", "状态机"], { kind: "state", text: "待处理" }),
  define("domain.swimlane", "swimlane", "group", "泳道", ["swimlane", "流程", "职责"], { title: "负责人", direction: "horizontal" }),
  define("math.axis", "axis", "math", "数轴", ["axis", "数轴", "坐标系"], { title: "x", min: 0, max: 10, direction: "horizontal", ticks: [{ value: 0 }, { value: 5 }, { value: 10 }] }),
  define("domain.tensor", "tensor", "math", "张量", ["tensor", "AI", "形状"], { name: "x", shape: "[B, T, d]" }),
  define("domain.timeline", "timeline", "time", "里程碑", ["timeline", "时间线", "里程碑"], { title: "发布节奏", milestones: [{ date: "2026-01-01", label: "发现" }, { date: "2026-03-01", label: "发布" }] }),
  define("domain.tree", "tree", "data", "树", ["tree", "树"], {}),
  define("domain.graph", "graph", "data", "图", ["graph", "图"], {}),
  define("math.equation", "equation", "math", "公式", ["equation", "latex", "公式"], { latex: "E = mc^2" }),
  define("math.title", "text", "math", "标题胶囊", ["title", "学术", "标题"], { text: "图标题", width: 480, height: 48, style: { role: "title" } }),
  define("math.operator", "equation", "math", "运算符", ["operator", "运算符", "等号", "加法"], { latex: "=", width: 40, height: 48, style: { role: "operator" } }),
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
  default: { tone: "neutral", stroke: "#172033", color: "#172033" },
  muted: { fill: "#f1f5f9", stroke: "#94a3b8", color: "#334155" },
  emphasis: { fill: "#dbeafe", stroke: "#1d4ed8", color: "#1e3a8a" },
  query: { fill: "#dbeafe", stroke: "#1d4ed8", color: "#1e3a8a" },
  key: { fill: "#fef3c7", stroke: "#b45309", color: "#78350f" },
  value: { fill: "#dcfce7", stroke: "#15803d", color: "#14532d" },
  output: { fill: "#ede9fe", stroke: "#6d28d9", color: "#4c1d95" },
} as const;

export type StylePresetName = keyof typeof stylePresets;

export const plannedDiagramKinds = [
  { type: "class", label: "类图" }, { type: "entity", label: "ER 实体" }, { type: "relationship", label: "ER 联系" }, { type: "state", label: "状态图" },
  { type: "swimlane", label: "泳道图" }, { type: "axis", label: "数轴" }, { type: "tensor", label: "张量" }, { type: "timeline", label: "里程碑" },
];
export function unsupportedDiagramKinds() {
  return plannedDiagramKinds.filter((kind) => !componentRegistry.some((item) => item.type === kind.type)).map((kind) => ({ ...kind, guidance: "还没有该类型，不要用匿名矩形冒充。" }));
}
export function componentCatalog(includeSchema = false) {
  return componentRegistry.map(({ id, type, category, label, usage, semanticFields, compositionOrder, propertySchema, example, create }) => {
    const prerequisites = type === "message" || type === "activation" ? [
      { type: "lifeline", id: "client", text: "客户端", x: 80, y: 80 },
      { type: "lifeline", id: "server", text: "服务端", x: 360, y: 80 },
    ] : type === "annotation" ? [{ type: "rectangle", id: "target", text: "目标", x: 360, y: 80 }] : [];
    const nodeExample = type === "message" ? { ...example, y: 160 } : type === "activation" ? { ...example, y: 196 } : example;
    const geometry = create();
    return { id, type, category, label, usage, semanticFields, requiredFields: semanticFields, compositionOrder, example: nodeExample,
      exampleOperations: [{ op: "addNodes", nodes: [...prerequisites, nodeExample] }],
      ...(includeSchema ? { propertySchema, defaultGeometry: { width: geometry.width, height: geometry.height } } : {}),
    };
  });
}
