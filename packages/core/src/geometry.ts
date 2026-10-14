import { contentSize, gridLayout } from "./contentLayout.js";
import type { DiagramNode } from "./schema.js";
import type { DiagramEdge } from "./schema.js";
import { measureText } from "./text.js";

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

export function visualBodyBox(node: DiagramNode): Box {
  if (node.type === "matrix" || node.type === "vector") { const grid = gridLayout(node); return { x: grid.padX, y: grid.padY, width: grid.bodyWidth, height: grid.bodyHeight }; }
  return nodeConnectionBox({ ...node, ...contentSize(node) });
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

export function contentBounds(nodes: DiagramNode[], canvas: { width: number; height: number }, edges: DiagramEdge[] = []): Box {
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
  for (const edge of edges) {
    const endpoints = edgeEndpoints(nodes, edge); if (!endpoints) continue;
    const { source, target, sourceHandle, targetHandle } = endpoints;
    const points = [source, target, ...(edge.waypoints ?? [])];
    if (!edge.waypoints?.length && edge.router === "curved") points.push({ x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 - 30 });
    if (!edge.waypoints?.length && edge.router === "bezier") {
      const distance = Math.max(40, Math.abs(target.x - source.x) / 2);
      for (const [point, side] of [[source, sourceHandle], [target, targetHandle]] as const) points.push({ x: point.x + (side === "left" ? -distance : side === "right" ? distance : 0), y: point.y + (side === "top" ? -distance : side === "bottom" ? distance : 0) });
    }
    const margin = (edge.width ?? 1.5) * 5;
    for (const point of points) { minX = Math.min(minX, point.x - margin); minY = Math.min(minY, point.y - margin); maxX = Math.max(maxX, point.x + margin); maxY = Math.max(maxY, point.y + margin); }
    if (edge.label) { const point = edgeLabelPosition(edge, source, target), width = measureText(edge.label, 12); minX = Math.min(minX, point.x - width / 2); maxX = Math.max(maxX, point.x + width / 2); minY = Math.min(minY, point.y - 16); maxY = Math.max(maxY, point.y + 4); }
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// Semantic endpoints determine horizontal placement; stored y/height remain editable.
export function projectSemanticNode(nodes: DiagramNode[], node: DiagramNode): DiagramNode {
  const size = contentSize(node);
  node = { ...node, width: size.width, height: size.height };
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

export function edgeLabelPosition(edge: import("./schema.js").DiagramEdge, source: { x: number; y: number }, target: { x: number; y: number }) {
  let points = [source, ...(edge.waypoints ?? []), target];
  if (!edge.waypoints?.length && edge.router === "orthogonal") {
    const horizontal = [edge.sourceHandle, edge.targetHandle].some((side) => side === "left" || side === "right");
    const x = (source.x + target.x) / 2, y = (source.y + target.y) / 2;
    points = horizontal ? [source, { x, y: source.y }, { x, y: target.y }, target] : [source, { x: source.x, y }, { x: target.x, y }, target];
  }
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  let remaining = lengths.reduce((sum, value) => sum + value, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (!length) continue;
    if (remaining > length) { remaining -= length; continue; }
    const a = points[index]!, b = points[index + 1]!;
    return { x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length - (edge.router === "curved" ? 21 : 6) };
  }
  return { x: source.x, y: source.y - 6 };
}

export function nodeConnectionBox(node: DiagramNode): Box {
  if (node.type === "state" && node.kind !== "state") {
    const radius = node.kind === "initial" ? 10 : 16;
    return { x: node.width / 2 - radius, y: Math.min(24, node.height / 3) - radius, width: radius * 2, height: radius * 2 };
  }
  return { x: 0, y: 0, width: node.width, height: node.height };
}

export function edgeEndpoints(nodes: DiagramNode[], edge: import("./schema.js").DiagramEdge) {
  const byId = nodeMap(nodes);
  const source = byId.get(edge.source), target = byId.get(edge.target);
  if (!source || !target) return null;
  const connection = (node: DiagramNode) => {
    const origin = absolutePosition(nodes, node.id);
    const box = nodeConnectionBox(projectSemanticNode(nodes, node));
    return { ...box, x: origin.x + box.x, y: origin.y + box.y };
  };
  const a = connection(source), b = connection(target);
  const side = (from: Box, to: Box): import("./schema.js").HandleSide => {
    const dx = to.x + to.width / 2 - from.x - from.width / 2;
    const dy = to.y + to.height / 2 - from.y - from.height / 2;
    return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "bottom" : "top";
  };
  const point = (box: Box, handle: import("./schema.js").HandleSide) => ({ x: box.x + (handle === "left" ? 0 : handle === "right" ? box.width : box.width / 2), y: box.y + (handle === "top" ? 0 : handle === "bottom" ? box.height : box.height / 2) });
  const sourceHandle = edge.sourceHandle ?? side(a, b), targetHandle = edge.targetHandle ?? side(b, a);
  return { source: point(a, sourceHandle), target: point(b, targetHandle), sourceHandle, targetHandle };
}
