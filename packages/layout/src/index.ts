import { contentBounds, projectSemanticNode, type DiagramDocument, type DiagramNode, type LayoutDirection } from "@drawit/core";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs";

const elk = new ELK();

const directions: Record<LayoutDirection, string> = {
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
};

export interface LayoutRequest {
  direction: LayoutDirection;
  nodeSpacing: number;
  rankSpacing: number;
}

export interface LayoutUpdate {
  id: string;
  patch: { x?: number; y?: number; width?: number; height?: number };
}

async function layoutLevel(nodes: DiagramNode[], document: DiagramDocument, request: LayoutRequest): Promise<Map<string, { x: number; y: number }>> {
  const parent = document.nodes.find((item) => item.id === nodes[0]?.parentId);
  const padding = parent?.type === "swimlane" ? (parent.direction === "horizontal" ? "[top=24,left=72,bottom=24,right=24]" : "[top=64,left=24,bottom=24,right=24]") : "[top=32,left=24,bottom=24,right=24]";
  const ids = new Set(nodes.map((node) => node.id));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": directions[request.direction],
      "elk.spacing.nodeNode": String(request.nodeSpacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(request.rankSpacing),
      "elk.padding": padding,
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: node.pinned ? { "elk.position": `(${node.x},${node.y})` } : undefined,
    })),
    edges: document.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };
  const laidOut = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const child of laidOut.children ?? []) {
    const original = nodes.find((node) => node.id === child.id);
    if (!original || child.x === undefined || child.y === undefined) continue;
    positions.set(original.id, original.pinned ? { x: original.x, y: original.y } : { x: child.x, y: child.y });
  }
  return positions;
}

export async function layoutDocument(document: DiagramDocument, request: LayoutRequest): Promise<{ updates: LayoutUpdate[]; bounds: ReturnType<typeof contentBounds> }> {
  const updates: LayoutUpdate[] = [];
  const levels = new Map<string, DiagramNode[]>();
  for (const stored of document.nodes) {
    const node = projectSemanticNode(document.nodes, stored);
    const key = node.parentId ?? "";
    const list = levels.get(key) ?? [];
    list.push(node);
    levels.set(key, list);
  }
  for (const [parentId, nodes] of levels) {
    if (nodes.length === 0) continue;
    const positions = await layoutLevel(nodes, document, request);
    let maxX = 0;
    let maxY = 0;
    for (const node of nodes) {
      const position = positions.get(node.id);
      if (!position || node.pinned) {
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
        continue;
      }
      if (position.x !== node.x || position.y !== node.y) {
        updates.push({ id: node.id, patch: { x: position.x, y: position.y } });
      }
      maxX = Math.max(maxX, position.x + node.width);
      maxY = Math.max(maxY, position.y + node.height);
    }
    if (parentId) {
      const parent = document.nodes.find((node) => node.id === parentId);
      if (parent && !parent.pinned && (maxX + 24 > parent.width || maxY + 24 > parent.height)) {
        updates.push({
          id: parent.id,
          patch: { width: Math.max(parent.width, maxX + 24), height: Math.max(parent.height, maxY + 24) },
        });
      }
    }
  }
  const preview = structuredClone(document);
  for (const update of updates) {
    const node = preview.nodes.find((item) => item.id === update.id);
    if (!node) continue;
    if (update.patch.x !== undefined) node.x = update.patch.x;
    if (update.patch.y !== undefined) node.y = update.patch.y;
    if (update.patch.width !== undefined) node.width = update.patch.width;
    if (update.patch.height !== undefined) node.height = update.patch.height;
  }
  return { updates, bounds: contentBounds(preview.nodes, preview.canvas) };
}
