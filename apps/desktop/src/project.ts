import { createId, type DiagramDocument, type DiagramEdge, type DiagramNode, type DiagramOperation } from "@drawit/core";
import type { Edge, Node } from "@xyflow/react";

export function orderNodes(nodes: DiagramNode[]): DiagramNode[] {
  const pending = [...nodes];
  const placed = new Set<string>();
  const ordered: DiagramNode[] = [];
  while (pending.length > 0) {
    const index = pending.findIndex((node) => !node.parentId || placed.has(node.parentId));
    if (index < 0) {
      ordered.push(...pending);
      break;
    }
    const [node] = pending.splice(index, 1);
    if (!node) break;
    ordered.push(node);
    placed.add(node.id);
  }
  return ordered;
}

export function toFlowNodes(document: DiagramDocument, selection: string[]): Node[] {
  return orderNodes(document.nodes).map((node) => ({
    id: node.id,
    type: "drawit",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    parentId: node.parentId,
    zIndex: node.zIndex ?? 0,
    selected: selection.includes(node.id),
    data: { diagramNode: node },
    style: { width: node.width, height: node.height },
  }));
}

export function toFlowEdges(document: DiagramDocument, selection: string[]): Edge[] {
  return document.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    label: edge.label || undefined,
    selected: selection.includes(edge.id),
    type: edge.waypoints && edge.waypoints.length > 0 ? "drawit" : edge.router === "straight" ? "straight" : edge.router === "orthogonal" ? "smoothstep" : "default",
    animated: false,
    style: { stroke: edge.color ?? "#334155", strokeWidth: edge.width ?? 1.5 },
    data: { diagramEdge: edge },
  }));
}

export function duplicateElements(document: DiagramDocument, ids: string[]): DiagramOperation[] {
  const selected = new Set(ids);
  const nodes = document.nodes.filter((node) => selected.has(node.id));
  const idMap = new Map(nodes.map((node) => [node.id, createId("n")]));
  const copies = nodes.map((node) => {
    const copy = structuredClone(node) as DiagramNode & { id: string };
    copy.id = idMap.get(node.id) ?? copy.id;
    copy.x += 24;
    copy.y += 24;
    if (copy.parentId && idMap.has(copy.parentId)) copy.parentId = idMap.get(copy.parentId);
    else delete copy.parentId;
    return copy;
  });
  const edges = document.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
  const edgeCopies: Array<Omit<DiagramEdge, "id"> & { id?: string }> = edges.map((edge) => ({
    ...edge,
    id: createId("e"),
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
  }));
  const operations: DiagramOperation[] = [];
  if (copies.length > 0) operations.push({ op: "addNodes", nodes: copies });
  if (edgeCopies.length > 0) operations.push({ op: "connect", edges: edgeCopies });
  return operations;
}
