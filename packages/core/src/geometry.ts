import type { DiagramNode } from "./schema.js";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function nodeMap(nodes: DiagramNode[]): Map<string, DiagramNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function absolutePosition(nodes: DiagramNode[], id: string): { x: number; y: number } {
  const byId = nodeMap(nodes);
  let x = 0;
  let y = 0;
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const projected = projectSemanticNode(nodes, current);
    x += projected.x;
    y += projected.y;
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return { x, y };
}

export function absoluteBox(nodes: DiagramNode[], node: DiagramNode): Box {
  const origin = absolutePosition(nodes, node.id);
  const projected = projectSemanticNode(nodes, node);
  return { x: origin.x, y: origin.y, width: projected.width, height: projected.height };
}

export function intersectionArea(a: Box, b: Box): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

export function isAncestor(nodes: DiagramNode[], ancestorId: string, nodeId: string): boolean {
  const byId = nodeMap(nodes);
  let current = byId.get(nodeId);
  const seen = new Set<string>();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (seen.has(current.id)) return false;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return false;
}

export function contentBounds(nodes: DiagramNode[], canvas: { width: number; height: number }): Box {
  let minX = 0;
  let minY = 0;
  let maxX = canvas.width;
  let maxY = canvas.height;
  for (const node of nodes) {
    const box = absoluteBox(nodes, node);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// Semantic endpoints determine horizontal placement; stored y/height remain editable.
export function projectSemanticNode(nodes: DiagramNode[], node: DiagramNode): DiagramNode {
  if (node.type === "activation") {
    const line = nodes.find((item) => item.id === node.lifelineId);
    return line ? { ...node, x: line.x + (line.width - node.width) / 2 } : node;
  }
  if (node.type === "message") {
    const source = nodes.find((item) => item.id === node.sourceId);
    const target = nodes.find((item) => item.id === node.targetId);
    if (!source || !target) return node;
    const start = source.x + source.width / 2;
    const end = target.x + target.width / 2;
    return { ...node, x: Math.min(start, end), width: Math.max(48, Math.abs(end - start)), meta: { ...node.meta, renderReverse: start > end, renderSelf: source.id === target.id } };
  }
  return node;
}
