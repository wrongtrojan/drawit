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
    x += current.x;
    y += current.y;
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return { x, y };
}

export function absoluteBox(nodes: DiagramNode[], node: DiagramNode): Box {
  const origin = absolutePosition(nodes, node.id);
  return { x: origin.x, y: origin.y, width: node.width, height: node.height };
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
