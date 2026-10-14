import { absoluteBox, intersectionArea, isAncestor, nodeMap } from "./geometry.js";
import type { DiagramDocument, DiagramNode, TreeValue } from "./schema.js";
import { textBlockHeight, wrapText } from "./text.js";

export interface Issue {
  severity: "error" | "warning" | "suggestion";
  code: string;
  message: string;
  elementId?: string;
}

const SAFE_RASTER = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

function issue(severity: Issue["severity"], code: string, message: string, elementId?: string): Issue {
  return elementId ? { severity, code, message, elementId } : { severity, code, message };
}

export function nodePlainText(node: DiagramNode): string {
  switch (node.type) {
    case "container":
      return node.title;
    case "equation":
      return node.latex;
    case "brace":
      return node.label;
    case "table":
      return [node.headers.join(" "), ...node.cells.map((row) => row.join(" "))].join("\n");
    case "activation":
      return "";
    case "matrix":
      return node.cells.map((row) => row.join(" ")).join("\n");
    case "vector":
      return node.components.join(" ");
    case "array":
    case "stack":
    case "queue":
      return node.items.join(" ");
    case "tree":
      return flattenTree(node.root);
    case "graph":
      return node.vertices.map((vertex) => vertex.label).join(" ");
    case "image":
      return node.alt;
    case "lifeline":
    case "message":
    case "annotation":
    case "flowchart":
    case "rectangle":
    case "roundedRectangle":
    case "ellipse":
    case "diamond":
    case "triangle":
    case "polygon":
    case "text":
    case "note":
      return node.text;
  }
}

function flattenTree(node: TreeValue): string {
  return [node.label, ...node.children.map((child) => flattenTree(child))].join(" ");
}

function imageUnsafe(src: string): boolean {
  if (src.length > 500_000) return true;
  if (SAFE_RASTER.test(src)) return false;
  if (src.startsWith("data:image/svg+xml")) {
    const lower = src.toLowerCase();
    return lower.includes("script") || lower.includes("onload") || lower.includes("onerror");
  }
  return true;
}

export function validateDocument(document: DiagramDocument): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const node of document.nodes) {
    if (seen.has(node.id)) {
      issues.push(issue("error", "DUPLICATE_ID", `Duplicate id: ${node.id}`, node.id));
    }
    seen.add(node.id);
    if (node.type === "image" && imageUnsafe(node.src)) {
      issues.push(issue("error", "UNSAFE_IMAGE", `Image ${node.id} must be an inline PNG, JPEG, GIF, WEBP, or SVG data URL`, node.id));
    }
    if (node.type === "matrix") {
      const columns = node.cells[0]?.length ?? 0;
      if (columns === 0 || node.cells.some((row) => row.length !== columns)) {
        issues.push(issue("error", "INVALID_MATRIX", `Matrix ${node.id} must be rectangular and non-empty`, node.id));
      }
    }
    if (node.type === "graph") {
      const vertexIds = new Set<string>();
      for (const vertex of node.vertices) {
        if (vertexIds.has(vertex.id)) {
          issues.push(issue("error", "DUPLICATE_ID", `Duplicate vertex id ${vertex.id} in ${node.id}`, node.id));
        }
        vertexIds.add(vertex.id);
      }
      for (const link of node.links) {
        if (!vertexIds.has(link.source) || !vertexIds.has(link.target)) {
          issues.push(issue("error", "INVALID_GRAPH", `Graph ${node.id} has a link to a missing vertex`, node.id));
        }
      }
    }
  }
  for (const edge of document.edges) {
    if (seen.has(edge.id)) {
      issues.push(issue("error", "DUPLICATE_ID", `Duplicate id: ${edge.id}`, edge.id));
    }
    seen.add(edge.id);
  }

  const byId = nodeMap(document.nodes);
  for (const node of document.nodes) {
    if (node.type === "annotation" && node.targetId && !byId.has(node.targetId)) {
      issues.push(issue("error", "MISSING_ENDPOINT", `Annotation ${node.id} references a missing target`, node.id));
    }
    if (node.type === "message" || node.type === "activation") {
      const refs = node.type === "message" ? [node.sourceId, node.targetId] : [node.lifelineId];
      for (const id of refs) {
        const target = byId.get(id);
        if (!target || target.type !== "lifeline" || target.parentId !== node.parentId) {
          issues.push(issue("error", "INVALID_SEQUENCE", `${node.id} must reference lifelines in the same container`, node.id));
        } else if (node.y < target.y + 44 || node.y + node.height > target.y + target.height) {
          issues.push(issue("warning", "SEQUENCE_OUTSIDE_LIFELINE", `${node.id} extends outside lifeline ${id}`, node.id));
        }
      }
    }
    if (node.type === "table") {
      if (node.cells.some((row) => row.length !== node.headers.length)) {
        issues.push(issue("error", "INVALID_TABLE", `Table ${node.id} rows must match its headers`, node.id));
      }
      const occupied = new Set<string>();
      for (const merge of node.merges) {
        if (merge.row + merge.rowSpan > node.cells.length + 1 || merge.column + merge.columnSpan > node.headers.length) {
          issues.push(issue("error", "INVALID_TABLE_MERGE", `Merge in ${node.id} extends outside the table (row 0 is the header)`, node.id));
          continue;
        }
        for (let row = merge.row; row < merge.row + merge.rowSpan; row++) {
          for (let column = merge.column; column < merge.column + merge.columnSpan; column++) {
            const key = `${row}:${column}`;
            if (occupied.has(key)) issues.push(issue("error", "INVALID_TABLE_MERGE", `Merges in ${node.id} overlap`, node.id));
            occupied.add(key);
          }
        }
      }
    }
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) {
      issues.push(issue("error", "MISSING_PARENT", `Node ${node.id} references missing parent ${node.parentId}`, node.id));
      continue;
    }
    if (parent.type !== "container") {
      issues.push(issue("error", "PARENT_NOT_CONTAINER", `Parent ${parent.id} of ${node.id} must be a container`, node.id));
    }
    const seenWalk = new Set<string>();
    let cursor: DiagramNode | undefined = node;
    while (cursor?.parentId) {
      if (seenWalk.has(cursor.id)) {
        issues.push(issue("error", "PARENT_CYCLE", `Parent cycle includes ${node.id}`, node.id));
        break;
      }
      seenWalk.add(cursor.id);
      cursor = byId.get(cursor.parentId);
    }
    if (parent.type === "container") {
      const outside =
        node.x < -1 || node.y < -1 || node.x + node.width > parent.width + 1 || node.y + node.height > parent.height + 1;
      if (outside) {
        issues.push(issue("warning", "CHILD_OUTSIDE_PARENT", `Node ${node.id} extends outside container ${parent.id}`, node.id));
      }
    }
  }

  for (const edge of document.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      issues.push(issue("error", "MISSING_ENDPOINT", `Edge ${edge.id} references a missing node`, edge.id));
    }
  }

  for (const node of document.nodes) {
    const box = absoluteBox(document.nodes, node);
    const canvas = document.canvas;
    if (box.x < -1 || box.y < -1 || box.x + box.width > canvas.width + 1 || box.y + box.height > canvas.height + 1) {
      issues.push(issue("warning", "OUT_OF_CANVAS", `Node ${node.id} is outside the canvas`, node.id));
    }
    const text = nodePlainText(node).trim();
    if (text && node.type !== "image" && node.type !== "graph" && node.type !== "tree") {
      const fontSize = node.style?.fontSize ?? 14;
      const lines = wrapText(text, fontSize, Math.max(8, node.width - 16));
      if (textBlockHeight(lines.length, fontSize) > node.height - 12) {
        issues.push(issue("warning", "TEXT_OVERFLOW", `Text in ${node.id} may overflow its box`, node.id));
      }
    }
  }

  for (let i = 0; i < document.nodes.length; i += 1) {
    const left = document.nodes[i];
    if (!left) continue;
    for (let j = i + 1; j < document.nodes.length; j += 1) {
      const right = document.nodes[j];
      if (!right) continue;
      if (isAncestor(document.nodes, left.id, right.id) || isAncestor(document.nodes, right.id, left.id)) continue;
      const a = absoluteBox(document.nodes, left);
      const b = absoluteBox(document.nodes, right);
      const overlap = intersectionArea(a, b);
      const referencedLines = (node: DiagramNode): string[] => node.type === "message" ? [node.sourceId, node.targetId] : node.type === "activation" ? [node.lifelineId] : node.type === "lifeline" ? [node.id] : [];
      const leftLines = referencedLines(left);
      const rightLines = referencedLines(right);
      if (left.type !== right.type && leftLines.some((id) => rightLines.includes(id))) continue;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      const ratio = smaller === 0 ? 0 : overlap / smaller;
      if (ratio > 0.15) {
        issues.push(issue("warning", "OVERLAP", `Nodes ${left.id} and ${right.id} overlap`, left.id));
      } else if (ratio > 0.02) {
        issues.push(issue("suggestion", "SLIGHT_OVERLAP", `Nodes ${left.id} and ${right.id} slightly overlap`, left.id));
      }
    }
  }

  for (const edge of document.edges) {
    if (!edge.label.trim()) continue;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    const sourceBox = absoluteBox(document.nodes, source);
    const targetBox = absoluteBox(document.nodes, target);
    const mid = {
      x: (sourceBox.x + sourceBox.width / 2 + targetBox.x + targetBox.width / 2) / 2,
      y: (sourceBox.y + sourceBox.height / 2 + targetBox.y + targetBox.height / 2) / 2,
    };
    for (const node of document.nodes) {
      if (node.id === source.id || node.id === target.id) continue;
      const box = absoluteBox(document.nodes, node);
      const inside = mid.x >= box.x && mid.x <= box.x + box.width && mid.y >= box.y && mid.y <= box.y + box.height;
      if (inside) {
        issues.push(issue("warning", "EDGE_LABEL_OVERLAP", `Label of ${edge.id} may cover ${node.id}`, edge.id));
        break;
      }
    }
  }

  return issues;
}
