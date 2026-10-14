import type { DiagramNode, DiagramTheme, NodeStyle } from "./schema.js";
export const ACADEMIC = Object.freeze({ fontFamily: "Noto Sans SC", fontSize: 14, indexSize: 11, titleSize: 22, operatorSize: 24, grid: "#cbd5e1", ink: "#172033", titleInk: "#1e3a8a", blue: "#dbeafe", pink: "#fde2e4", green: "#dcfce7", neutral: "#f8fafc", gap: 60, cell: 40 });
export function resolveNodeStyle(node: DiagramNode, theme?: DiagramTheme): NodeStyle {
  const custom = { ...node.style };
  // Only the exact historical built-in default is migrated. Other explicit styles win.
  if (custom.fill === "#ffffff" && custom.stroke === "#1f2937" && custom.color === "#111827") { delete custom.fill; delete custom.stroke; delete custom.color; }
  if (custom.fontFamily === "Segoe UI, sans-serif") delete custom.fontFamily;
  const role = custom.role ?? "body", tone = custom.tone ?? "neutral";
  const font = theme?.fontFamily && theme.fontFamily !== "Segoe UI, sans-serif" ? theme.fontFamily : ACADEMIC.fontFamily;
  const bare = node.type === "equation" || role === "operator" || role === "variable";
  return { fill: role === "title" ? ACADEMIC.blue : ["matrix", "vector", "tensor"].includes(node.type) && (custom.tone || !theme?.nodeFill || theme.nodeFill === "#ffffff") ? ACADEMIC[tone] : theme?.nodeFill ?? "#ffffff", stroke: role === "title" ? "#bfdbfe" : theme?.nodeStroke && theme.nodeStroke !== "#1f2937" ? theme.nodeStroke : ACADEMIC.ink,
    strokeWidth: bare && !custom.stroke ? 0 : 1.5, fontFamily: font, fontSize: role === "title" ? ACADEMIC.titleSize : role === "operator" ? ACADEMIC.operatorSize : role === "caption" ? 11 : 14, color: role === "title" ? ACADEMIC.titleInk : ACADEMIC.ink, fontWeight: role === "title" ? 700 : 400, fontStyle: role === "variable" ? "italic" : "normal", cornerRadius: role === "title" ? 24 : 8, ...custom };
}
export function styledNodes(document: { nodes: DiagramNode[]; styles?: DiagramTheme }): DiagramNode[] { return document.nodes.map((node) => ({ ...node, style: resolveNodeStyle(node, document.styles) })); }
