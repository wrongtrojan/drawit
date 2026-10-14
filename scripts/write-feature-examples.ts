import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument, materializeNode, parseDocument, edgeSchema } from "../packages/core/src/index.ts";
import { renderReviewPng } from "../packages/render/src/png.ts";

function node(type: string, id: string, x: number, y: number, width: number, height: number, fields: Record<string, unknown> = {}) {
  return materializeNode({ type, id, x, y, width, height, ...fields }, id);
}
const title = (text: string) => node("text", "title", 40, 20, 760, 40, { text, style: { fontSize: 24 } });
const edge = (id: string, source: string, target: string) => edgeSchema.parse({ id, source, target, router: "orthogonal" });
const cases = [
  { id: "sequence-short", title: "请求与响应", width: 800, height: 500, nodes: [title("请求与响应"), node("lifeline", "client", 80, 100, 140, 320, { text: "客户端" }), node("lifeline", "server", 480, 100, 140, 320, { text: "服务端" }), node("message", "request", 0, 180, 400, 36, { sourceId: "client", targetId: "server", text: "请求" }), node("activation", "active", 0, 216, 20, 100, { lifelineId: "server" }), node("message", "response", 0, 300, 400, 36, { sourceId: "server", targetId: "client", text: "响应", messageKind: "return" })], edges: [] },
  { id: "sequence-long", title: "登录请求时序", width: 850, height: 580, nodes: [title("登录请求时序"), ...[["client", "客户端", 60], ["api", "API", 300], ["database", "数据库", 540]].map(([id, text, x]) => node("lifeline", String(id), Number(x), 90, 140, 440, { text })), node("message", "login", 0, 160, 240, 36, { sourceId: "client", targetId: "api", text: "登录请求" }), node("activation", "api-active", 0, 196, 20, 238, { lifelineId: "api" }), node("message", "query", 0, 250, 240, 36, { sourceId: "api", targetId: "database", text: "查询用户" }), node("activation", "database-active", 0, 286, 20, 70, { lifelineId: "database" }), node("message", "user", 0, 320, 240, 36, { sourceId: "database", targetId: "api", text: "用户信息", messageKind: "return" }), node("message", "ok", 0, 400, 240, 36, { sourceId: "api", targetId: "client", text: "响应 200", messageKind: "return" })], edges: [] },
  { id: "table-short", title: "页表", width: 1000, height: 460, nodes: [title("页表"), node("table", "page-table", 60, 110, 540, 180, { headers: ["虚拟页", "状态", "物理页 / 去向"], cells: [["0x1", "在内存", "0x8A"], ["0x2", "缺页", "磁盘"]] }), node("annotation", "fault-note", 710, 175, 180, 80, { text: "0x2 缺页，不能计算物理地址", targetId: "page-table" }), node("equation", "address", 80, 340, 600, 72, { latex: "\\mathrm{PA}=\\mathtt{0x8A000}+\\mathtt{0x234}=\\mathtt{0x8A234}" })], edges: [] },
  { id: "table-long", title: "第三季度指标", width: 900, height: 420, nodes: [title("第三季度指标"), node("table", "quarter-table", 60, 110, 760, 210, { headers: ["季度", "指标", "计划", "实际"], cells: [["第三季度", "收入", "100 万", "86 万"], ["", "完成率", "100%", "86%"]], merges: [{ row: 1, column: 0, rowSpan: 2, columnSpan: 1 }] })], edges: [] },
  { id: "architecture-short", title: "三层架构", width: 1050, height: 680, nodes: [title("三层架构"), ...[["ui", "界面层", "view", "编辑器", 90], ["application", "应用层", "logic", "Session Host", 280], ["storage", "数据层", "file", "工程文件", 470]].flatMap(([id, label, child, text, y]) => [node("container", String(id), 70, Number(y), 630, 140, { title: label }), node("roundedRectangle", String(child), 180, 52, 240, 64, { text, parentId: id })]), node("annotation", "local", 800, 315, 190, 80, { text: "本机会话\n单写队列", targetId: "logic" })], edges: [edge("view-logic", "view", "logic"), edge("logic-file", "logic", "file")] },
  { id: "architecture-long", title: "drawit 架构", width: 1200, height: 760, nodes: [title("drawit 架构"), node("container", "clients", 70, 100, 1060, 150, { title: "客户端层" }), node("roundedRectangle", "desktop", 70, 55, 260, 64, { text: "桌面编辑器", parentId: "clients" }), node("roundedRectangle", "agent", 730, 55, 260, 64, { text: "Agent / MCP", parentId: "clients" }), node("container", "session-layer", 70, 320, 1060, 150, { title: "应用层" }), node("roundedRectangle", "controller", 400, 55, 260, 64, { text: "Session Host\nDocumentController", parentId: "session-layer" }), node("container", "storage-layer", 70, 540, 1060, 150, { title: "持久化层" }), node("roundedRectangle", "document", 400, 55, 260, 64, { text: "DiagramDocument\n本地 JSON", parentId: "storage-layer" })], edges: [edge("desktop-controller", "desktop", "controller"), edge("agent-controller", "agent", "controller"), edge("controller-document", "controller", "document")] },
];
const output = resolve(dirname(fileURLToPath(import.meta.url)), "../examples");
const reviews = resolve("/private/tmp/drawit-feature-reviews");
await mkdir(output, { recursive: true }); await mkdir(reviews, { recursive: true });
for (const sample of cases) {
  const document = createDocument(sample.title, `doc_${sample.id.replaceAll("-", "_")}`);
  Object.assign(document, { canvas: { ...document.canvas, width: sample.width, height: sample.height }, nodes: sample.nodes, edges: sample.edges });
  const parsed = parseDocument(document);
  await writeFile(resolve(output, `${sample.id}.drawit.json`), JSON.stringify(parsed, null, 2) + "\n");
  const review = await renderReviewPng(parsed);
  await writeFile(resolve(reviews, `${sample.id}.png`), review.png);
}
console.error(`Wrote ${cases.length} examples and review PNGs to ${reviews}`);
