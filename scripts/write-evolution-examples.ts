import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument, materializeNode, parseDocument, edgeSchema, type DiagramDocument } from "../packages/core/src/index.ts";
import { renderReviewPng } from "../packages/render/src/png.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "examples/evolution");
const reviews = resolve(process.env.DRAWIT_REVIEW_DIR ?? "/private/tmp/drawit-evolution-reviews");
await mkdir(output, { recursive: true }); await mkdir(reviews, { recursive: true });
const n = (type: string, id: string, x: number, y: number, fields: Record<string, unknown> = {}) => materializeNode({ type, id, x, y, ...fields }, id);
const e = (source: string, target: string, label: string, fields = {}) => edgeSchema.parse({ id: `${source}_${target}`, source, target, label, ...fields });
const documents: DiagramDocument[] = [];
function scene(name: string, title: string, nodes: DiagramDocument["nodes"], edges: DiagramDocument["edges"] = []) {
  const document = createDocument(title, name.replaceAll("-", "_"));
  document.canvas = { ...document.canvas, width: 1200, height: 740 };
  document.nodes = [n("text", "title", 40, 20, { text: title, width: 1100, height: 48, style: { fontSize: 24 } }), ...nodes]; document.edges = edges;
  documents.push(parseDocument(document));
}
for (const variant of ["short", "long"]) {
  const long = variant === "long";
  scene(`class-${variant}`, "用户与订单类图", [n("class", "user", 80, 140, { name: "User", attributes: ["+ id: string", "+ name: string"], methods: ["+ login(): boolean"], stereotype: long ? "entity" : "" }), n("class", "order", 440, 140, { name: "Order", attributes: ["+ id: string", "+ total: number"], methods: ["+ submit(): void"] }), ...(long ? [n("class", "admin", 800, 140, { name: "Admin", attributes: ["+ role: string"], methods: ["+ approve(order): void"] })] : [])], [e("user", "order", "关联 1:N"), ...(long ? [e("admin", "user", "继承", { waypoints: [{ x: 920, y: 460 }, { x: 200, y: 460 }], sourceHandle: "bottom", targetHandle: "bottom" })] : [])]);
  for (const type of ["entity", "relationship"]) scene(`${type}-${variant}`, type === "entity" ? "用户与订单实体" : "用户加入组织", [n("entity", "left", 80, 160, { name: "用户", attributes: ["用户ID（主键）", "姓名"] }), n("relationship", "relation", 460, 190, { name: type === "entity" ? "拥有" : "加入" }), n("entity", "right", 800, 160, { name: type === "entity" ? "订单" : "组织", attributes: ["ID（主键）", long ? "创建时间" : "名称"] }), ...(long ? [n("entity", "audit", 800, 430, { name: "审计记录", attributes: ["记录ID（主键）", "操作时间"] }), n("relationship", "records", 460, 440, { name: "产生" })] : [])], [e("left", "relation", type === "entity" ? "1" : "N", { arrowEnd: false }), e("relation", "right", "N", { arrowEnd: false }), ...(long ? [e("left", "records", "1", { arrowEnd: false }), e("records", "audit", "N", { arrowEnd: false })] : [])]);
  scene(`state-${variant}`, "任务状态机", [n("state", "initial", 40, 140, { kind: "initial", text: "开始" }), n("state", "ready", 260, 140, { kind: "state", text: "待执行" }), n("state", "running", 520, 140, { kind: "state", text: "执行中" }), n("state", "final", 820, 140, { kind: "final", text: "完成" }), ...(long ? [n("state", "failed", 520, 380, { kind: "state", text: "失败" })] : [])], [e("initial", "ready", "初始化"), e("ready", "running", "开始执行"), e("running", "final", "成功"), ...(long ? [e("running", "failed", "异常"), e("failed", "ready", "重试", { sourceHandle: "left", targetHandle: "bottom", waypoints: [{ x: 340, y: 416 }, { x: 340, y: 280 }] })] : [])]);
  scene(`swimlane-${variant}`, "跨职责审批流程", [n("swimlane", "requester", 60, 100, { title: "申请人", direction: "horizontal", width: 1080, height: 240 }), n("swimlane", "reviewer", 60, 380, { title: "审批人", direction: "horizontal", width: 1080, height: 240 }), n("flowchart", "apply", 100, 80, { parentId: "requester", text: "提交申请" }), n("flowchart", "decision", 400, 80, { parentId: "reviewer", kind: "decision", text: "批准？", height: 100 }), n("flowchart", "done", 780, 80, { parentId: "requester", kind: "terminator", text: "完成" }), ...(long ? [n("flowchart", "revise", 100, 120, { parentId: "reviewer", text: "填写修改意见" })] : [])], [e("apply", "decision", "提交"), e("decision", "done", "是"), ...(long ? [e("decision", "revise", "否", { sourceHandle: "bottom", targetHandle: "right", waypoints: [{ x: 545, y: 660 }, { x: 420, y: 660 }, { x: 420, y: 536 }] }), e("revise", "apply", "退回修改", { sourceHandle: "top", targetHandle: "bottom" })] : [])]);
  scene(`axis-${variant}`, long ? "二维坐标与区间" : "带刻度数轴", [n("axis", "x", 240, 450, { title: "x ∈ [-2, 2]", min: -2, max: 2, ticks: [-2,-1,0,1,2].map((value) => ({ value })), width: 520 }), ...(long ? [n("axis", "y", 436, 136, { title: "y", direction: "vertical", min: 0, max: 3, ticks: [0,1,2,3].map((value) => ({ value })), width: 140, height: 400 })] : [])]);
  scene(`tensor-${variant}`, "注意力的张量形状", [n("tensor", "x", 80, 160, { name: "x", shape: "[B, T, d]" }), n("tensor", "q", 440, 160, { name: "Q", shape: "[B, H, T, d_k]" }), ...(long ? [n("tensor", "attention", 800, 160, { name: "Attention", shape: "[B, H, T, T]" }), n("tensor", "output", 800, 430, { name: "输出", shape: "[B, T, d]" })] : [])], [e("x", "q", "线性投影"), ...(long ? [e("q", "attention", "计算注意力"), e("attention", "output", "合并多头")] : [])]);
  scene(`timeline-${variant}`, "发布里程碑", [n("timeline", "plan", 60, 170, { title: "发布节奏", milestones: [{ date: "2026-01-01", label: "发现" }, { date: "2026-02-01", label: long ? "方案评审并完成企业试点范围确认" : "评审" }, { date: "2026-03-01", label: "发布" }, ...(long ? [{ date: "2026-03-01", label: "上线后的质量复盘" }] : [])] })]);
}
scene("tree-quality", "重名节点的组织关系", [n("tree", "organization", 60, 120, { root: { label: "组织结构与负责人", children: [{ label: "产品与研发团队", children: [{ label: "负责人", children: [] }] }, { label: "运营与实施团队", children: [{ label: "负责人", children: [] }] }] } })]);
scene("graph-quality", "有标签的依赖路径", [n("graph", "path", 60, 120, { vertices: [{ id: "a", label: "数据输入与格式验证" }, { id: "b", label: "模型前向计算" }, { id: "c", label: "损失计算与参数更新" }], links: [{ source: "a", target: "b", label: "输入" }, { source: "b", target: "c", label: "梯度" }], directed: true })]);
scene("cells-quality", "长文本与矩阵高亮", [n("table", "table", 60, 120, { width: 300, height: 120, headers: ["问题", "下一步"], cells: [["企业试点没有完成，需要补齐部署和权限配置", "收缩试点范围；增加实施人员；完成账单功能"]] }), n("matrix", "matrix", 650, 120, { cells: [["长文本单元格需要在格内换行并保持可读", "b"], ["c", "d"]], highlightRows: [0], highlightCols: [], highlightCells: [[1,1]] })]);
for (const document of documents) {
  await writeFile(resolve(output, `${document.documentId}.drawit.json`), JSON.stringify(document, null, 2) + "\n");
  const review = await renderReviewPng(document);
  await writeFile(resolve(reviews, `${document.documentId}.png`), review.png);
}
console.error(`Wrote ${documents.length} semantic examples and PNG reviews to ${reviews}`);
