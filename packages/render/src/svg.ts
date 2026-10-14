import {
  absoluteBox,
  absolutePosition,
  contentBounds,
  nodePlainText,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramNode,
  type HandleSide,
  type TreeValue,
} from "@drawit/core";
import katex from "katex";

export interface RenderOptions {
  background?: string;
  padding?: number;
  annotateIds?: boolean;
  equationMode?: "html" | "text";
}

export function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function color(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$/.test(value) ? value : fallback;
}

function fontSize(node: DiagramNode): number {
  return node.style?.fontSize ?? 14;
}

function wrap(text: string, size: number, width: number): string[] {
  const max = Math.max(1, Math.floor(width / Math.max(1, size * 0.56)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let rest = paragraph;
    if (!rest) {
      lines.push("");
      continue;
    }
    while (rest.length > max) {
      let at = rest.lastIndexOf(" ", max);
      if (at <= 0) at = max;
      lines.push(rest.slice(0, at).trimEnd());
      rest = rest.slice(at).trimStart();
    }
    lines.push(rest);
  }
  return lines.length > 0 ? lines : [""];
}

function textBlock(text: string, x: number, y: number, width: number, height: number, size: number, fill: string, family: string): string {
  const lines = wrap(text, size, Math.max(8, width));
  const block = lines.length * size * 1.25;
  let cursor = y + Math.max(size, (height - block) / 2 + size);
  return lines
    .map((line) => {
      const element = `<text x="${x + width / 2}" y="${cursor.toFixed(1)}" text-anchor="middle" font-size="${size}" font-family="${escapeXml(family)}" fill="${fill}">${escapeXml(line)}</text>`;
      cursor += size * 1.25;
      return element;
    })
    .join("");
}

function points(pairs: Array<[number, number]>): string {
  return pairs.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function renderKatexHtml(latex: string): string {
  return katex.renderToString(latex, { throwOnError: false, trust: false, output: "html" });
}

function localShape(node: DiagramNode, fill: string, stroke: string, strokeWidth: number): string {
  const { width, height } = node;
  switch (node.type) {
    case "roundedRectangle":
      return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${node.style?.cornerRadius ?? 12}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "ellipse":
      return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2 - 1}" ry="${height / 2 - 1}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "diamond":
      return `<polygon points="${points([[width / 2, 1], [width - 1, height / 2], [width / 2, height - 1], [1, height / 2]])}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "triangle":
      return `<polygon points="${points([[width / 2, 1], [width - 1, height - 1], [1, height - 1]])}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "polygon":
      return `<polygon points="${points(node.points.map((point) => [point.x * width, point.y * height]))}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "text":
      return `<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>`;
    case "note":
      return `<path d="M1 1 H${width - 18} L${width - 1} 18 V${height - 1} H1 Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "container":
      return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="6 4"/>`;
    case "flowchart":
      if (node.kind === "terminator") return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      if (node.kind === "decision") return `<polygon points="${points([[width / 2, 1], [width - 1, height / 2], [width / 2, height - 1], [1, height / 2]])}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      if (node.kind === "io") return `<polygon points="${points([[18, 1], [width - 1, 1], [width - 18, height - 1], [1, height - 1]])}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
      return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "brace":
      return node.side === "top" || node.side === "bottom"
        ? `<path d="M8 ${height / 2} C8 8, ${width / 2 - 12} 8, ${width / 2} 8 C${width / 2 + 12} 8, ${width - 8} 8, ${width - 8} ${height / 2}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
        : `<path d="M${width / 2} 8 C8 8, 8 ${height / 2 - 12}, 8 ${height / 2} C8 ${height / 2 + 12}, 8 ${height - 8}, ${width / 2} ${height - 8}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
    case "annotation":
      return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="3 3"/>`;
    default:
      return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
  }
}

function matrixBody(node: Extract<DiagramNode, { type: "matrix" }>, textColor: string, family: string): string {
  const rows = node.cells.length;
  const cols = node.cells[0]?.length ?? 1;
  const pad = 18;
  const innerW = Math.max(1, node.width - pad * 2);
  const innerH = Math.max(1, node.height - 16);
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const highlight = new Set(node.highlightCells.map(([row, col]) => `${row}:${col}`));
  const parts: string[] = [];
  node.cells.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const x = pad + colIndex * cellW;
      const y = 8 + rowIndex * cellH;
      const hot = highlight.has(`${rowIndex}:${colIndex}`) || node.highlightRows.includes(rowIndex) || node.highlightCols.includes(colIndex);
      if (hot) parts.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="#fde68a"/>`);
      parts.push(textBlock(cell, x, y, cellW, cellH, Math.min(16, fontSize(node)), textColor, family));
    });
  });
  const bracket = node.bracket === "round" ? "(" : node.bracket === "curly" ? "{" : node.bracket === "pipe" ? "|" : "[";
  const close = node.bracket === "round" ? ")" : node.bracket === "curly" ? "}" : node.bracket === "pipe" ? "|" : "]";
  if (node.bracket !== "none") {
    parts.push(`<text x="6" y="${node.height / 2}" font-size="28" fill="${textColor}">${bracket}</text>`);
    parts.push(`<text x="${node.width - 16}" y="${node.height / 2}" font-size="28" fill="${textColor}">${close}</text>`);
  }
  return parts.join("");
}

function cellsBody(labels: string[], vertical: boolean, width: number, height: number, highlight: number | undefined, textColor: string, family: string): string {
  const count = Math.max(1, labels.length);
  const parts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = vertical ? 8 : (width / count) * index;
    const y = vertical ? (height / count) * index : 8;
    const cellW = vertical ? width - 16 : width / count;
    const cellH = vertical ? height / count : height - 16;
    const hot = highlight === index;
    parts.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${hot ? "#fde68a" : "transparent"}" stroke="#94a3b8"/>`);
    parts.push(textBlock(labels[index] ?? "", x, y, cellW, cellH, 14, textColor, family));
  }
  return parts.join("");
}

function treeBody(root: TreeValue, width: number, height: number, textColor: string, family: string): string {
  const placed: Array<{ label: string; x: number; y: number; parent?: { x: number; y: number } }> = [];
  let cursor = 0;
  const walk = (node: TreeValue, depth: number, parent?: { x: number; y: number }): { x: number } => {
    if (node.children.length === 0) {
      const x = cursor;
      cursor += 1;
      placed.push({ label: node.label, x, y: depth, parent });
      return { x };
    }
    const children = node.children.map((child) => walk(child, depth + 1));
    const x = ((children[0]?.x ?? 0) + (children[children.length - 1]?.x ?? 0)) / 2;
    placed.push({ label: node.label, x, y: depth, parent });
    const self = { x, y: depth };
    for (const child of placed) {
      if (node.children.some((item) => item.label === child.label) && child.parent === undefined && child.y === depth + 1) child.parent = self;
    }
    return { x };
  };
  walk(root, 0);
  const maxDepth = Math.max(1, ...placed.map((item) => item.y));
  const maxX = Math.max(1, cursor - 1);
  const parts: string[] = [];
  const coords = placed.map((item) => ({
    ...item,
    cx: 28 + (item.x / maxX) * Math.max(1, width - 56),
    cy: 24 + (item.y / maxDepth) * Math.max(1, height - 48),
  }));
  for (const item of coords) {
    if (!item.parent) continue;
    const parent = coords.find((candidate) => candidate.x === item.parent?.x && candidate.y === item.parent?.y);
    if (parent) parts.push(`<line x1="${parent.cx}" y1="${parent.cy}" x2="${item.cx}" y2="${item.cy}" stroke="#64748b"/>`);
  }
  for (const item of coords) {
    parts.push(`<circle cx="${item.cx}" cy="${item.cy}" r="14" fill="#ffffff" stroke="#1f2937"/>`);
    parts.push(`<text x="${item.cx}" y="${item.cy + 4}" text-anchor="middle" font-size="11" font-family="${escapeXml(family)}" fill="${textColor}">${escapeXml(item.label)}</text>`);
  }
  return parts.join("");
}

function graphBody(node: Extract<DiagramNode, { type: "graph" }>, textColor: string, family: string): string {
  const radius = Math.max(16, Math.min(node.width, node.height) / 2 - 28);
  const centers = new Map<string, { x: number; y: number }>();
  node.vertices.forEach((vertex, index) => {
    const angle = -Math.PI / 2 + (index / node.vertices.length) * Math.PI * 2;
    centers.set(vertex.id, { x: node.width / 2 + Math.cos(angle) * radius, y: node.height / 2 + Math.sin(angle) * radius });
  });
  const parts: string[] = [];
  for (const link of node.links) {
    const source = centers.get(link.source);
    const target = centers.get(link.target);
    if (!source || !target) continue;
    parts.push(`<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#334155" marker-end="${node.directed ? "url(#graph-arrow)" : ""}"/>`);
  }
  for (const vertex of node.vertices) {
    const center = centers.get(vertex.id);
    if (!center) continue;
    parts.push(`<circle cx="${center.x}" cy="${center.y}" r="16" fill="#ffffff" stroke="#1f2937"/>`);
    parts.push(`<text x="${center.x}" y="${center.y + 4}" text-anchor="middle" font-size="11" font-family="${escapeXml(family)}" fill="${textColor}">${escapeXml(vertex.label)}</text>`);
  }
  return parts.join("");
}

export function renderNodeInner(node: DiagramNode, options: RenderOptions = {}): string {
  const fill = color(node.style?.fill, node.type === "container" ? "#f8fafc" : node.type === "text" ? "transparent" : "#ffffff");
  const stroke = color(node.style?.stroke, "#1f2937");
  const textColor = color(node.style?.color, "#111827");
  const family = node.style?.fontFamily ?? "Segoe UI, sans-serif";
  const strokeWidth = node.style?.strokeWidth ?? 1.5;
  const parts = [localShape(node, fill, stroke, strokeWidth)];
  if (node.type === "image" && node.src.startsWith("data:image/")) {
    parts.push(`<image href="${escapeXml(node.src)}" x="0" y="0" width="${node.width}" height="${node.height}"/>`);
  } else if (node.type === "equation") {
    if (options.equationMode === "text") {
      parts.push(textBlock(node.latex, 8, 8, node.width - 16, node.height - 16, fontSize(node), textColor, family));
    } else {
      const html = renderKatexHtml(node.latex);
      parts.push(`<foreignObject x="8" y="8" width="${Math.max(1, node.width - 16)}" height="${Math.max(1, node.height - 16)}"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:100%;font-size:${fontSize(node)}px;">${html}</div></foreignObject>`);
    }
  } else if (node.type === "matrix") {
    parts.push(matrixBody(node, textColor, family));
  } else if (node.type === "vector") {
    parts.push(cellsBody(node.components, node.orientation !== "row", node.width, node.height, undefined, textColor, family));
  } else if (node.type === "array" || node.type === "queue") {
    parts.push(cellsBody(node.items, false, node.width, node.height, node.highlightIndex, textColor, family));
  } else if (node.type === "stack") {
    parts.push(cellsBody(node.items, true, node.width, node.height, node.highlightIndex, textColor, family));
  } else if (node.type === "tree") {
    parts.push(treeBody(node.root, node.width, node.height, textColor, family));
  } else if (node.type === "graph") {
    parts.push(graphBody(node, textColor, family));
  } else if (node.type === "container") {
    parts.push(`<text x="12" y="20" font-size="13" font-family="${escapeXml(family)}" fill="${textColor}">${escapeXml(node.title)}</text>`);
  } else if (node.type === "brace") {
    parts.push(textBlock(node.label, 0, 0, node.width, node.height, 13, textColor, family));
  } else {
    const text = nodePlainText(node);
    const top = node.type === "note" ? 16 : 8;
    parts.push(textBlock(text, 8, top, node.width - 16, node.height - top - 8, fontSize(node), textColor, family));
  }
  return parts.join("");
}

function handlePoint(node: DiagramNode, handle: HandleSide | undefined, other: { x: number; y: number }): { x: number; y: number } {
  const box = { x: 0, y: 0, width: node.width, height: node.height };
  const center = { x: node.width / 2, y: node.height / 2 };
  const side = handle ?? (Math.abs(other.x - center.x) > Math.abs(other.y - center.y) ? (other.x > center.x ? "right" : "left") : other.y > center.y ? "bottom" : "top");
  if (side === "top") return { x: box.width / 2, y: 0 };
  if (side === "bottom") return { x: box.width / 2, y: box.height };
  if (side === "left") return { x: 0, y: box.height / 2 };
  return { x: box.width, y: box.height / 2 };
}

function edgePath(edge: DiagramEdge, source: { x: number; y: number }, target: { x: number; y: number }, sourceSide: HandleSide | undefined, targetSide: HandleSide | undefined): string {
  if (edge.waypoints && edge.waypoints.length > 0) {
    const points = [source, ...edge.waypoints, target];
    return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
  }
  if (edge.router === "straight") return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
  if (edge.router === "curved") {
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2 - 30;
    return `M ${source.x} ${source.y} Q ${midX} ${midY} ${target.x} ${target.y}`;
  }
  if (edge.router === "bezier") {
    const dx = Math.max(40, Math.abs(target.x - source.x) / 2);
    const c1 = sourceSide === "left" || sourceSide === "right" ? { x: source.x + (sourceSide === "right" ? dx : -dx), y: source.y } : { x: source.x, y: source.y + (sourceSide === "bottom" ? dx : -dx) };
    const c2 = targetSide === "left" || targetSide === "right" ? { x: target.x + (targetSide === "right" ? dx : -dx), y: target.y } : { x: target.x, y: target.y + (targetSide === "bottom" ? dx : -dx) };
    return `M ${source.x} ${source.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`;
  }
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  if (sourceSide === "left" || sourceSide === "right" || targetSide === "left" || targetSide === "right") {
    return `M ${source.x} ${source.y} L ${midX} ${source.y} L ${midX} ${target.y} L ${target.x} ${target.y}`;
  }
  return `M ${source.x} ${source.y} L ${source.x} ${midY} L ${target.x} ${midY} L ${target.x} ${target.y}`;
}

export function renderDocumentSvg(document: DiagramDocument, options: RenderOptions = {}): string {
  const padding = options.padding ?? 24;
  const bounds = contentBounds(document.nodes, document.canvas);
  const background = color(options.background ?? document.canvas.background, "#ffffff");
  const family = document.styles?.fontFamily ?? "Segoe UI, sans-serif";
  const edgeColor = color(document.styles?.edgeColor, "#334155");
  const markers = document.edges
    .map((edge, index) => {
      const stroke = color(edge.color, edgeColor);
      return `<marker id="m${index}" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z" fill="${stroke}"/></marker>`;
    })
    .join("");
  const nodes = [...document.nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const nodeMarkup = nodes
    .map((node) => {
      const origin = absolutePosition(document.nodes, node.id);
      return `<g transform="translate(${origin.x - bounds.x + padding} ${origin.y - bounds.y + padding})">${renderNodeInner(node, options)}</g>`;
    })
    .join("");
  const labels = options.annotateIds
    ? nodes
        .map((node) => {
          const origin = absolutePosition(document.nodes, node.id);
          return `<text x="${origin.x - bounds.x + padding}" y="${origin.y - bounds.y + padding - 4}" font-size="10" fill="#64748b">${escapeXml(node.id)}</text>`;
        })
        .join("")
    : "";
  const edges = document.edges
    .map((edge, index) => {
      const sourceNode = document.nodes.find((node) => node.id === edge.source);
      const targetNode = document.nodes.find((node) => node.id === edge.target);
      if (!sourceNode || !targetNode) return "";
      const sourceOrigin = absolutePosition(document.nodes, sourceNode.id);
      const targetOrigin = absolutePosition(document.nodes, targetNode.id);
      const sourceAbs = { x: sourceOrigin.x + sourceNode.width / 2, y: sourceOrigin.y + sourceNode.height / 2 };
      const targetAbs = { x: targetOrigin.x + targetNode.width / 2, y: targetOrigin.y + targetNode.height / 2 };
      const sourceLocal = handlePoint(sourceNode, edge.sourceHandle, { x: targetAbs.x - sourceOrigin.x, y: targetAbs.y - sourceOrigin.y });
      const targetLocal = handlePoint(targetNode, edge.targetHandle, { x: sourceAbs.x - targetOrigin.x, y: sourceAbs.y - targetOrigin.y });
      const source = { x: sourceOrigin.x + sourceLocal.x - bounds.x + padding, y: sourceOrigin.y + sourceLocal.y - bounds.y + padding };
      const target = { x: targetOrigin.x + targetLocal.x - bounds.x + padding, y: targetOrigin.y + targetLocal.y - bounds.y + padding };
      const stroke = color(edge.color, edgeColor);
      const dash = edge.lineStyle === "dashed" ? "6 4" : edge.lineStyle === "dotted" ? "1.5 3" : "";
      const path = edgePath(edge, source, target, edge.sourceHandle, edge.targetHandle);
      const markerEnd = edge.arrowEnd ? ` marker-end="url(#m${index})"` : "";
      const markerStart = edge.arrowStart ? ` marker-start="url(#m${index})"` : "";
      const label = edge.label
        ? `<text x="${(source.x + target.x) / 2}" y="${(source.y + target.y) / 2 - 6}" text-anchor="middle" font-size="12" font-family="${escapeXml(family)}" fill="${stroke}">${escapeXml(edge.label)}</text>`
        : "";
      return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${edge.width ?? 1.5}"${dash ? ` stroke-dasharray="${dash}"` : ""}${markerEnd}${markerStart}/>${label}`;
    })
    .join("");
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${markers}<marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#334155"/></marker></defs><rect width="100%" height="100%" fill="${background}"/>${edges}${nodeMarkup}${labels}</svg>`;
}

export function reviewManifest(document: DiagramDocument) {
  const bounds = contentBounds(document.nodes, document.canvas);
  return {
    documentId: document.documentId,
    revision: document.revision,
    bounds,
    objects: [
      ...document.nodes.map((node) => {
        const box = absoluteBox(document.nodes, node);
        return { id: node.id, kind: "node" as const, type: node.type, ...box };
      }),
      ...document.edges.map((edge) => ({ id: edge.id, kind: "edge" as const, type: edge.router, x: 0, y: 0, width: 0, height: 0 })),
    ],
  };
}
