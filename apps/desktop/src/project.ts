import { absolutePosition, projectSemanticNode, isContainerNode, edgeEndpoints, createId, styledNodes, type DiagramDocument, type DiagramEdge, type DiagramNode, type DiagramOperation } from "@drawit/core";
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
  const visual = styledNodes(document);
  return orderNodes(visual.map((node) => projectSemanticNode(visual, node))).map((node) => ({
    id: node.id,
    type: "drawit",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    parentId: node.parentId,
    zIndex: (node.zIndex ?? 0) * 10 + (isContainerNode(node) ? 0 : 5),
    selected: selection.includes(node.id),
    data: { diagramNode: node },
    style: { width: node.width, height: node.height },
  }));
}

export function toFlowEdges(document: DiagramDocument, selection: string[]): Edge[] {
  const annotations: DiagramEdge[] = document.nodes.flatMap((node) => node.type === "annotation" && node.targetId ? [{ id: `annotation_${node.id}`, source: node.id, target: node.targetId, label: "", router: "straight", arrowStart: false, arrowEnd: true, lineStyle: "dashed" }] : []);
  return [...document.edges, ...annotations].map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edgeEndpoints(document.nodes, edge)?.sourceHandle,
    targetHandle: edgeEndpoints(document.nodes, edge)?.targetHandle,
    label: edge.label || undefined,
    selected: selection.includes(edge.id),
    type: "drawit",
    animated: false,
    zIndex: 2,
    selectable: !annotations.some((item) => item.id === edge.id),
    markerEnd: edge.arrowEnd ? { type: "arrowclosed" as never, color: edge.color ?? "#334155" } : undefined,
    markerStart: edge.arrowStart ? { type: "arrowclosed" as never, color: edge.color ?? "#334155" } : undefined,
    style: { stroke: edge.color ?? "#334155", strokeWidth: edge.width ?? 1.5, strokeDasharray: edge.lineStyle === "dashed" ? "6 4" : edge.lineStyle === "dotted" ? "1.5 3" : undefined },
    data: { diagramEdge: { ...edge, sourceHandle: edgeEndpoints(document.nodes, edge)?.sourceHandle, targetHandle: edgeEndpoints(document.nodes, edge)?.targetHandle } },
  }));
}

export function captureElements(document: DiagramDocument, ids: string[]): DiagramDocument {
  const selected = new Set(ids);
  for (const edge of document.edges) if (selected.has(edge.id)) { selected.add(edge.source); selected.add(edge.target); }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of document.nodes) {
      if (node.parentId && selected.has(node.parentId) && !selected.has(node.id)) {
        selected.add(node.id);
        changed = true;
      }
    }
  }
  // Include the lifelines needed to restore semantic references after paste.
  for (const node of document.nodes.filter((node) => selected.has(node.id))) {
    if (node.type === "message") { selected.add(node.sourceId); selected.add(node.targetId); }
    if (node.type === "activation") selected.add(node.lifelineId);
  }
  const nodes = document.nodes.filter((node) => selected.has(node.id)).map((node) => {
    const copy = structuredClone(node);
    if (copy.parentId && !selected.has(copy.parentId)) {
      Object.assign(copy, absolutePosition(document.nodes, copy.id));
      delete copy.parentId;
    }
    if (copy.type === "annotation" && copy.targetId && !selected.has(copy.targetId)) delete copy.targetId;
    return copy;
  });
  const edges = document.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target));
  return { ...structuredClone(document), nodes, edges: structuredClone(edges) };
}

export function pasteElements(clipboard: DiagramDocument, offset = 24): DiagramOperation[] {
  const idMap = new Map(clipboard.nodes.map((node) => [node.id, createId("n")]));
  const copies = clipboard.nodes.map((node) => {
    const copy = structuredClone(node);
    copy.id = idMap.get(node.id)!;
    if (copy.parentId && idMap.has(copy.parentId)) copy.parentId = idMap.get(copy.parentId);
    else { delete copy.parentId; copy.x += offset; copy.y += offset; }
    if (copy.type === "annotation" && copy.targetId) copy.targetId = idMap.get(copy.targetId);
    if (copy.type === "message") { copy.sourceId = idMap.get(copy.sourceId)!; copy.targetId = idMap.get(copy.targetId)!; }
    if (copy.type === "activation") copy.lifelineId = idMap.get(copy.lifelineId)!;
    return copy;
  });
  const edges = clipboard.edges.map((edge) => ({
    ...edge, id: createId("e"), source: idMap.get(edge.source)!, target: idMap.get(edge.target)!,
    waypoints: edge.waypoints?.map((point) => ({ x: point.x + offset, y: point.y + offset })),
  }));
  const operations: DiagramOperation[] = [];
  if (copies.length) operations.push({ op: "addNodes", nodes: copies });
  if (edges.length) operations.push({ op: "connect", edges });
  return operations;
}

export function duplicateElements(document: DiagramDocument, ids: string[], offset = 24): DiagramOperation[] {
  return pasteElements(captureElements(document, ids), offset);
}
