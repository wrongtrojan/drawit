import type { DiagramNode, TreeValue } from "./schema.js";
import { wrapText } from "./text.js";

export const textWidth = (value: string, size = 14): number => Math.max(0, ...value.split(/\r?\n/).map((line) => Array.from(line).reduce((sum, char) => sum + size * (char.codePointAt(0)! >= 0x2e80 ? 1 : .56), 0)));
export const labelWidth = (value: string, size = 14): number => Math.max(64, Math.min(240, textWidth(value, size) + 24));
export const labelHeight = (value: string, width: number, size = 14): number => Math.max(36, wrapText(value, size, Math.max(8, width - 16)).length * size * 1.25 + 16);

export type GridNode = Extract<DiagramNode, { type: "matrix" | "table" | "vector" | "array" | "stack" | "queue" }>;
export function gridLayout(node: GridNode) {
  const size = node.style?.fontSize ?? 14;
  const rows = node.type === "matrix" ? node.cells : node.type === "table" ? [node.headers, ...node.cells] : node.type === "vector" ? (node.orientation === "column" ? node.components.map((item) => [item]) : [node.components]) : node.type === "stack" ? node.items.map((item) => [item]) : [node.items];
  const columns = Math.max(1, rows[0]?.length ?? 0);
  const padX = node.type === "matrix" ? 18 : 0;
  const padY = node.type === "matrix" ? 8 : 0;
  const widths = Array.from({ length: columns }, (_, c) => Math.max(64, ...rows.map((row) => labelWidth(row[c] ?? "", size))));
  const baseWidth = widths.reduce((sum, value) => sum + value, 0);
  const width = Math.max(node.width, baseWidth + padX * 2);
  const extraWidth = (width - padX * 2 - baseWidth) / columns;
  widths.forEach((value, c) => widths[c] = value + extraWidth);
  const heights = rows.map((row) => Math.max(36, ...row.map((value, c) => labelHeight(value, widths[c] ?? 64, size))));
  if (!heights.length) heights.push(36);
  const baseHeight = heights.reduce((sum, value) => sum + value, 0);
  const height = Math.max(node.height, baseHeight + padY * 2);
  heights.forEach((value, r) => heights[r] = value + (height - padY * 2 - baseHeight) / heights.length);
  return { rows, widths, heights, width, height, padX, padY };
}

export interface InternalVertex { id: string; label: string; x: number; y: number; width: number; height: number; parentId?: string }
export function treeLayout(node: Extract<DiagramNode, { type: "tree" }>) {
  const vertices: InternalVertex[] = [];
  const size = node.style?.fontSize ?? 14;
  const spans = new Map<TreeValue, number>();
  const measure = (value: TreeValue): number => {
    const span = Math.max(labelWidth(value.label, size), value.children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, value.children.length - 1) * 24);
    spans.set(value, span); return span;
  };
  const total = measure(node.root);
  const levelHeights: number[] = [];
  const collect = (value: TreeValue, depth: number) => { levelHeights[depth] = Math.max(levelHeights[depth] ?? 0, labelHeight(value.label, labelWidth(value.label, size), size)); value.children.forEach((child) => collect(child, depth + 1)); };
  collect(node.root, 0);
  const levelY = levelHeights.map((_, depth) => 12 + levelHeights.slice(0, depth).reduce((sum, height) => sum + height + 48, 0));
  const place = (value: TreeValue, id: string, left: number, depth: number, parentId?: string) => {
    const width = labelWidth(value.label, size);
    vertices.push({ id, label: value.label, parentId, x: left + spans.get(value)! / 2 - width / 2, y: levelY[depth]!, width, height: labelHeight(value.label, width, size) });
    const childrenWidth = value.children.reduce((sum, child) => sum + spans.get(child)!, 0) + Math.max(0, value.children.length - 1) * 24;
    let cursor = left + (spans.get(value)! - childrenWidth) / 2;
    value.children.forEach((child, index) => { place(child, `${id}_${index}`, cursor, depth + 1, id); cursor += spans.get(child)! + 24; });
  };
  place(node.root, "root", 12, 0);
  return { vertices, width: Math.max(node.width, total + 24), height: Math.max(node.height, (levelY.at(-1) ?? 12) + (levelHeights.at(-1) ?? 36) + 12) };
}

export function graphLayout(node: Extract<DiagramNode, { type: "graph" }>) {
  const size = node.style?.fontSize ?? 14;
  const widths = node.vertices.map((value) => labelWidth(value.label, size));
  const maxWidth = Math.max(...widths);
  const maxHeight = Math.max(...node.vertices.map((value, i) => labelHeight(value.label, widths[i]!, size)));
  const incoming = new Map(node.vertices.map((value) => [value.id, 0]));
  for (const link of node.links) incoming.set(link.target, (incoming.get(link.target) ?? 0) + 1);
  const rank = new Map(node.vertices.map((value) => [value.id, 0]));
  const queue = node.vertices.filter((value) => !incoming.get(value.id)).map((value) => value.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!; visited++;
    for (const link of node.links.filter((item) => item.source === id)) {
      rank.set(link.target, Math.max(rank.get(link.target) ?? 0, rank.get(id)! + 1));
      incoming.set(link.target, incoming.get(link.target)! - 1);
      if (!incoming.get(link.target)) queue.push(link.target);
    }
  }
  const layered = node.directed && visited === node.vertices.length && node.links.length > 0;
  const cols = layered ? Math.max(...rank.values()) + 1 : Math.ceil(Math.sqrt(node.vertices.length));
  const ranks = Array.from({ length: cols }, () => 0);
  const vertices = node.vertices.map((value, index) => {
    const col = layered ? rank.get(value.id)! : index % cols;
    const row = layered ? (ranks[col] = (ranks[col] ?? 0) + 1) - 1 : Math.floor(index / cols);
    return { ...value, x: 16 + col * (maxWidth + 72), y: 16 + row * (maxHeight + 64), width: widths[index]!, height: labelHeight(value.label, widths[index]!, size) };
  });
  return { vertices, width: Math.max(node.width, ...vertices.map((value) => value.x + value.width + (node.links.some((link) => link.source === value.id && link.target === value.id) ? 120 : 16))), height: Math.max(node.height, ...vertices.map((value) => value.y + value.height + 16)) };
}

export function contentSize(node: DiagramNode): { width: number; height: number } {
  if (["matrix", "table", "vector", "array", "stack", "queue"].includes(node.type)) return gridLayout(node as GridNode);
  if (node.type === "tree") return treeLayout(node);
  if (node.type === "graph") return graphLayout(node);
  if (node.type === "class" || node.type === "entity") {
    const size = node.style?.fontSize ?? 14;
    const labels = [...(node.type === "class" && node.stereotype ? [node.stereotype] : []), node.name, ...node.attributes, ...(node.type === "class" ? node.methods : [])];
    const width = Math.max(node.width, ...labels.map((label) => labelWidth(label, size)));
    const height = labels.reduce((sum, label) => sum + labelHeight(label, width, size), 0) + (node.type === "class" ? 48 : 20);
    return { width, height: Math.max(node.height, height) };
  }
  if (node.type === "axis" && node.direction === "vertical") return { width: Math.max(node.width, 140), height: Math.max(node.height, 360) };
  if (node.type === "tensor") {
    const size = node.style?.fontSize ?? 14;
    const width = Math.max(node.width, labelWidth(node.name, size + 2), labelWidth(node.shape, size));
    return { width, height: Math.max(node.height, labelHeight(node.name, width, size + 2) + labelHeight(node.shape, width, size) + 24) };
  }
  if (node.type === "timeline") {
    const width = Math.max(node.width, node.milestones.length * 200 + 32);
    const height = Math.max(node.height, 120 + Math.max(36, ...node.milestones.map((item) => labelHeight(item.label, 184, node.style?.fontSize ?? 14))));
    return { width, height };
  }
  return node;
}
