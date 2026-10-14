import { mkdir, writeFile } from "node:fs/promises";
import { createDocument, DocumentController, materializeNode, absoluteBox, operationSchema, type DiagramDocument } from "../packages/core/src/index.ts";
import { renderDocumentSvg } from "../packages/render/src/index.ts";
import { embedDiagramFonts } from "../packages/render/src/fonts.ts";
import { renderRasterSvg, svgToPng } from "../packages/render/src/png.ts";

const root = new URL("../examples/academic/", import.meta.url); await mkdir(root, { recursive: true });
const matrix = (id: string, cells: string[][], tone: "blue" | "pink" | "green", dimensionLabel = "", extra = {}) => ({ type: "matrix", id, width: 1, height: 1, cells, dimensionLabel, style: { tone }, ...extra });
const operator = (id: string, latex: string) => ({ type: "equation", id, latex, width: 36, height: 48, style: { role: "operator" } });
const math = (id: string, latex: string, y: number, width: number) => ({ type: "equation", id, latex, x: 40, y, width: width - 80, height: 64, style: { fontSize: 18 } });
const caption = (id: string, text: string, x: number, y: number, width: number) => ({ type: "text", id, text, x, y, width, height: 32, style: { role: "caption" } });
async function row(document: DiagramDocument, inputs: Record<string, unknown>[], names: string[], y: number) {
  const controller = new DocumentController(document);
  const result = await controller.apply({ expectedRevision: document.revision, source: "system", operations: [{ op: "addNodes", nodes: inputs }, operationSchema.parse({ op: "arrangeRow", nodeIds: inputs.map((node) => node.id), startX: 40, centerY: y })] });
  if (!result.ok) throw new Error(result.message);
  const after = result.document;
  inputs.forEach((input, index) => { if (!names[index]) return; const node = after.nodes.find((item) => item.id === input.id)!; const box = absoluteBox(after.nodes, node); const width = Math.max(box.width, 116); after.nodes.push(materializeNode(caption(`${node.id}_label`, names[index]!, box.x + (box.width - width) / 2, box.y - 50, width), `${node.id}_label`)); });
  return after;
}
async function output(name: string, title: string, document: DiagramDocument, footer: Record<string, unknown>[] = []) {
  document.nodes.push(...footer.map((input) => materializeNode(input, String(input.id))));
  const boxes = document.nodes.map((node) => absoluteBox(document.nodes, node));
  document.canvas.width = Math.ceil(Math.max(760, ...boxes.map((box) => box.x + box.width + 40)));
  document.canvas.height = Math.ceil(Math.max(400, ...boxes.map((box) => box.y + box.height + 40)));
  document.nodes.push(materializeNode({ type: "text", id: "title", text: title, x: (document.canvas.width - 520) / 2, y: 28, width: 520, height: 48, style: { role: "title" } }, "title"));
  document.documentId = `doc_${name.replaceAll("-", "_")}`; document.revision = 0;
  await writeFile(new URL(`${name}.drawit.json`, root), JSON.stringify(document, null, 2) + "\n");
  await writeFile(new URL(`${name}.svg`, root), await embedDiagramFonts(renderDocumentSvg(document)));
  await writeFile(new URL(`${name}.png`, root), await svgToPng(renderRasterSvg(document), document.canvas.width + 64, { loadSystemFonts: false }));
  console.error(`${name}: ${document.canvas.width} × ${document.canvas.height}`);
}

const symbols = (letter: string) => Array.from({ length: 3 }, (_, i) => Array.from({ length: 4 }, (_, j) => `${letter}_{${i}${j}}`));
let pe = await row(createDocument("Position Encoding"), [matrix("embedding", symbols("x"), "blue", "3 × 4", { cellFormat: "math", rowLabels: ["0", "1", "2"], columnLabels: ["0", "1", "2", "3"] }), operator("plus", "+"), matrix("position", symbols("p"), "pink", "3 × 4", { cellFormat: "math", rowLabels: ["0", "1", "2"], columnLabels: ["0", "1", "2", "3"] }), operator("equal", "="), matrix("encoded", symbols("z"), "green", "3 × 4", { cellFormat: "math", rowLabels: ["0", "1", "2"], columnLabels: ["0", "1", "2", "3"] })], ["Token embedding X", "", "Position encoding P", "", "Encoded input Z"], 238);
await output("position-encoding", "Position Encoding", pe, [math("definition", "P_{i,2j}=\\sin(i/10000^{2j/d}),\\quad P_{i,2j+1}=\\cos(i/10000^{2j/d})", 350, 1300), caption("note", "位置 i 与通道 j 在格外标注；按对应位置相加，形状保持 T × d。", 40, 430, 1200)]);

let norm = await row(createDocument("Layer Norm"), [matrix("input", symbols("x"), "blue", "T × d", { cellFormat: "math", highlightRows: [1] }), operator("normalize", "\\longrightarrow"), matrix("normalized", symbols("\\hat{x}"), "pink", "T × d", { cellFormat: "math", highlightRows: [1] }), operator("affine", "\\longrightarrow"), matrix("output", symbols("y"), "green", "T × d", { cellFormat: "math", highlightRows: [1] })], ["Input X", "Normalize each token", "Normalized X̂", "Affine: γ, β", "Output Y"], 240);
await output("layer-norm", "Layer Norm", norm, [math("normalization", "\\hat{x}_{ij}=\\frac{x_{ij}-\\mu_i}{\\sqrt{\\sigma_i^2+\\epsilon}},\\quad y_{ij}=\\gamma_j\\hat{x}_{ij}+\\beta_j", 370, 1400), math("statistics", "\\mu_i=\\frac{1}{d}\\sum_{j=1}^d x_{ij},\\qquad \\sigma_i^2=\\frac{1}{d}\\sum_{j=1}^d(x_{ij}-\\mu_i)^2", 460, 1400), caption("note", "高亮行是一个 token；统计沿特征维 d 进行，不跨 token 或 batch。", 40, 550, 1300)]);

let product = await row(createDocument("矩阵乘法"), [matrix("a", [["1", "2", "3"], ["4", "5", "6"]], "blue", "2 × 3", { highlightRows: [0], rowLabels: ["i=1", "i=2"], columnLabels: ["1", "2", "3"] }), operator("times", "\\times"), matrix("b", [["7", "8"], ["9", "10"], ["11", "12"]], "pink", "3 × 2", { highlightCols: [0], rowLabels: ["1", "2", "3"], columnLabels: ["j=1", "j=2"] }), operator("equals", "="), matrix("c", [["58", "64"], ["139", "154"]], "green", "2 × 2", { highlightCells: [[0, 0]], rowLabels: ["1", "2"], columnLabels: ["1", "2"] })], ["A", "", "B", "", "C = AB"], 230);
await output("matrix-multiplication", "矩阵乘法 · Matrix Multiplication", product, [math("sum", "c_{11}=\\sum_{k=1}^{3}a_{1k}b_{k1}=1\\times7+2\\times9+3\\times11=58", 360, 1200), caption("note", "蓝色第 1 行与粉色第 1 列做内积，得到绿色结果格；中间维 3 一致。", 40, 440, 1100)]);
await writeFile(new URL("../examples/math-matrix.drawit.json", import.meta.url), JSON.stringify({ ...product, documentId: "math-matrix", title: "矩阵乘法" }, null, 2) + "\n");

let attention = await row(createDocument("Scaled Dot-Product Attention"), [matrix("q", [["1", "0", "1"], ["0", "1", "1"]], "blue", "2 × 3"), operator("dot", "\\times"), matrix("kt", [["1", "0"], ["0", "1"], ["1", "1"]], "pink", "3 × 2"), operator("eq", "="), matrix("scores", [["2", "1"], ["1", "2"]], "pink", "2 × 2")], ["Queries Q", "", "Keys Kᵀ", "", "Scores QKᵀ"], 225);
attention = await row(attention, [matrix("weights", [["0.64", "0.36"], ["0.36", "0.64"]], "blue", "2 × 2", { highlightRows: [0] }), operator("dotv", "\\times"), matrix("v", [["1", "0", "0"], ["0", "1", "0"]], "pink", "2 × 3"), operator("eqv", "="), matrix("result", [["0.64", "0.36", "0"], ["0.36", "0.64", "0"]], "green", "2 × 3")], ["A = softmax(QKᵀ / √3)", "", "Values V", "", "Output O = AV"], 465);
await output("scaled-attention", "Scaled Dot-Product Attention", attention, [math("definition", "\\operatorname{Attention}(Q,K,V)=\\operatorname{softmax}\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V", 585, 1300), caption("note", "dₖ = 3；softmax 按每个 query 的 key 维归一化。数值保留两位小数，每行权重之和为 1。", 40, 660, 1200)]);

let residual = await row(createDocument("残差块"), [{ type: "tensor", id: "x", name: "输入 X", shape: "T × d", width: 150, height: 88, style: { tone: "blue", fill: "#dbeafe" } }, { type: "tensor", id: "f", name: "变换 F(X)", shape: "T × d", width: 190, height: 88, style: { tone: "pink", fill: "#fde2e4" } }, operator("add", "+"), { type: "tensor", id: "y", name: "输出 Y", shape: "T × d", width: 150, height: 88, style: { tone: "green", fill: "#dcfce7" } }], ["", "", "Add", ""], 250);
residual.edges = [{ id: "xf", source: "x", target: "f", router: "straight" }, { id: "fa", source: "f", target: "add", router: "straight" }, { id: "ay", source: "add", target: "y", router: "straight" }, { id: "skip", source: "x", target: "add", sourceHandle: "top", targetHandle: "top", router: "orthogonal", waypoints: [{ x: 115, y: 140 }, { x: 518, y: 140 }], label: "identity" }].map((edge) => ({ label: "", ...edge })) as DiagramDocument["edges"];
// Materialize edge defaults through the normal parser before rendering.
const { parseDocument } = await import("../packages/core/src/index.ts"); residual = parseDocument(residual);
await output("residual-block", "残差块 · Residual Block", residual, [math("definition", "Y=X+F(X)", 355, 950), caption("note", "捷径是恒等映射；相加两端形状相同。维度变化时必须显式添加投影。", 40, 435, 850)]);

let gnn = await row(createDocument("GNN 消息传递"), [{ type: "graph", id: "graph", vertices: [{ id: "u1", label: "u₁" }, { id: "u2", label: "u₂" }, { id: "v", label: "v" }], links: [{ source: "u1", target: "v", label: "message" }, { source: "u2", target: "v", label: "message" }], directed: true, width: 330, height: 200, style: { fill: "#dbeafe" } }, operator("aggregate", "\\longrightarrow"), { type: "vector", id: "messages", components: ["m_1", "m_2", "m_3"], orientation: "column", width: 1, height: 1, cellFormat: "math", dimensionLabel: "dₘ", style: { tone: "pink" } }, operator("update", "\\longrightarrow"), { type: "vector", id: "updated", components: ["h_1'", "h_2'", "h_3'"], orientation: "column", width: 1, height: 1, cellFormat: "math", dimensionLabel: "dₕ", style: { tone: "green" } }], ["邻居 u₁、u₂ → 中心 v", "Aggregate", "聚合消息 mᵥ", "Update", "新状态 hᵥ′"], 255);
await output("gnn-message-passing", "GNN · Message Passing", gnn, [math("aggregate_formula", "m_v=\\sum_{u\\in\\mathcal{N}(v)}\\phi(h_u,h_v,e_{uv}),\\qquad h'_v=\\psi(h_v,m_v)", 420, 1300), caption("note", "sum 聚合与邻居顺序无关；消息函数 φ 和更新函数 ψ 在所有节点间共享。", 40, 500, 1200)]);
