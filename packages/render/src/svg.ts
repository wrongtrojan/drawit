import {
  absoluteBox, edgeLabelPosition, edgeEndpoints,
  isContainerNode, gridLayout, treeLayout, graphLayout, labelHeight,
  projectSemanticNode,
  absolutePosition,
  contentBounds,
  nodePlainText,
  resolveNodeStyle, styledNodes, ACADEMIC,
  wrapText,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramNode,
  type HandleSide,
  type TreeValue,
} from "@drawit/core";

export interface RenderOptions {
  background?: string;
  padding?: number;
  annotateIds?: boolean;
  equationMode?: "text";
  onRenderError?: (nodeId: string) => void;
  equationRenderer?: (node: Extract<DiagramNode, { type: "equation" }>) => string;
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

function textBlock(text: string, x: number, y: number, width: number, height: number, size: number, fill: string, family: string): string {
  if (family === "Noto Sans SC") family += ", Noto Sans";
  const lines = wrapText(text, size, Math.max(8, width));
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


function localShape(node: DiagramNode, fill: string, stroke: string, strokeWidth: number): string {
  const { width, height } = node;
  if (node.style?.role === "title") return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="24" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  if ((node.type === "equation" || node.style?.role === "operator" || node.style?.role === "variable") && strokeWidth === 0) return "";
  switch (node.type) {
    case "lifeline":
      return `<rect x="1" y="1" width="${width - 2}" height="42" rx="4" fill="${fill}" stroke="${stroke}"/><line x1="${width / 2}" y1="44" x2="${width / 2}" y2="${height}" stroke="${stroke}" stroke-dasharray="6 4"/>`;
    case "message": {
      const reverse = node.meta?.renderReverse;
      const start = reverse ? width : 0;
      const end = reverse ? 0 : width;
      const arrow = node.messageKind === "async" ? "fill=\"none\"" : `fill="${stroke}"`;
      if (node.meta?.renderSelf) return `<path d="M0 20 H${width} V${height - 2} H0" fill="none" stroke="${stroke}"/><path d="M8 ${height - 6} L0 ${height - 2} L8 ${height + 2}" fill="none" stroke="${stroke}"/>`;
      return `<line x1="${start}" y1="${height - 4}" x2="${end}" y2="${height - 4}" stroke="${stroke}" ${node.messageKind === "return" ? 'stroke-dasharray="5 4"' : ""}/><path d="M${end + (reverse ? 9 : -9)} ${height - 8} L${end} ${height - 4} L${end + (reverse ? 9 : -9)} ${height}" ${arrow} stroke="${stroke}"/>`;
    }
    case "activation":
      return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="${fill}" stroke="${stroke}"/>`;
    case "table": case "matrix": case "vector": case "array": case "stack": case "queue": case "tree": case "graph": case "axis": case "timeline":
      return "";
    case "relationship":
      return localShape({ ...node, type: "diamond", text: node.name }, fill, stroke, strokeWidth);
    case "state":
      return node.kind === "state" ? localShape({ ...node, type: "roundedRectangle" }, fill, stroke, strokeWidth) : "";
    case "swimlane":
      return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="${fill}" stroke="${stroke}"/>`;
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

function gridBody(node: Extract<DiagramNode, { type: "matrix" | "table" | "vector" | "array" | "stack" | "queue" }>, fill: string, stroke: string, textColor: string, family: string, options: RenderOptions): string {
  const grid = gridLayout(node);
  const parts: string[] = [];
  let y = grid.padY;
  grid.rows.forEach((row, r) => {
    let x = grid.padX;
    row.forEach((value, c) => {
      const cellWidth = grid.widths[c]!;
      const merge = node.type === "table" ? node.merges.find((item) => r >= item.row && r < item.row + item.rowSpan && c >= item.column && c < item.column + item.columnSpan) : undefined;
      if (!merge || (merge.row === r && merge.column === c)) {
        const width = grid.widths.slice(c, c + (merge?.columnSpan ?? 1)).reduce((sum, value) => sum + value, 0);
        const height = grid.heights.slice(r, r + (merge?.rowSpan ?? 1)).reduce((sum, value) => sum + value, 0);
        const hot = node.type === "matrix" ? node.highlightRows.includes(r) || node.highlightCols.includes(c) || node.highlightCells.some(([a, b]) => a === r && b === c) : "highlightIndex" in node && node.highlightIndex === (node.type === "stack" ? r : c);
        const mathematical = node.type === "matrix" || node.type === "vector";
        const palette = { blue: "#93c5fd", pink: "#f9a8b3", green: "#86efac", neutral: "#cbd5e1" };
        const cellFill = hot ? palette[node.style?.tone ?? "neutral"] : node.type === "table" && r === 0 ? "#e2e8f0" : fill;
        parts.push(`<rect data-cell="${r},${c}" x="${x}" y="${y}" width="${width}" height="${height}" fill="${cellFill}" stroke="${mathematical ? ACADEMIC.grid : stroke}" stroke-width="1"/>`);
        if (mathematical && node.cellFormat === "math" && options.equationRenderer) {
          try { parts.push(`<g transform="translate(${x} ${y})">${options.equationRenderer({ id: `${node.id}_${r}_${c}`, type: "equation", latex: value, x: 0, y: 0, width, height, style: node.style })}</g>`); }
          catch { options.onRenderError?.(node.id); parts.push(textBlock("?", x + 8, y + 8, width - 16, height - 16, fontSize(node), "#991b1b", family)); }
        } else parts.push(textBlock(value, x + 8, y + 8, width - 16, height - 16, fontSize(node), textColor, family));
      }
      x += cellWidth;
    });
    y += grid.heights[r]!;
  });
  if (node.type === "matrix" || node.type === "vector") {
    if (node.bracket !== "none") {
      const top = grid.padY, bottom = top + grid.bodyHeight, middle = (top + bottom) / 2;
      for (const right of [false, true]) {
        const x = right ? grid.padX + grid.bodyWidth + 6 : grid.padX - 6, sign = right ? 1 : -1;
        const path = node.bracket === "square" ? `M${x} ${top} h${sign * 8} V${bottom} h${-sign * 8}` : node.bracket === "pipe" ? `M${x} ${top} V${bottom}` : node.bracket === "round" ? `M${x} ${top} C${x + sign * 14} ${top + 12} ${x + sign * 14} ${bottom - 12} ${x} ${bottom}` : `M${x} ${top} q${sign * 10} 0 ${sign * 10} 10 V${middle - 10} q0 10 ${sign * 8} 10 q${-sign * 8} 0 ${-sign * 8} 10 V${bottom - 10} q0 10 ${-sign * 10} 10`;
        parts.push(`<path data-bracket="${right ? "right" : "left"}" d="${path}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`);
      }
    }
    let rowY = grid.padY;
    node.rowLabels.forEach((label, r) => { if (r < grid.heights.length) { parts.push(textBlock(label, 0, rowY, Math.max(8, grid.padX - (node.bracket === "none" ? 8 : 24)), grid.heights[r]!, 11, "#475569", family)); rowY += grid.heights[r]!; } });
    let columnX = grid.padX;
    node.columnLabels.forEach((label, c) => { if (c < grid.widths.length) { parts.push(textBlock(label, columnX, 0, grid.widths[c]!, 20, 11, "#475569", family)); columnX += grid.widths[c]!; } });
    if (node.dimensionLabel) parts.push(textBlock(node.dimensionLabel, grid.padX + grid.bodyWidth + 24, grid.padY, node.width - grid.padX - grid.bodyWidth - 24, grid.bodyHeight, 11, "#475569", family));
  }
  return parts.join("");
}

function vertexBody(vertex: { id: string; label: string; x: number; y: number; width: number; height: number }, fill: string, stroke: string, textColor: string, family: string, size: number): string {
  return `<g data-vertex-id="${escapeXml(vertex.id)}"><rect x="${vertex.x}" y="${vertex.y}" width="${vertex.width}" height="${vertex.height}" rx="8" fill="${fill}" stroke="${stroke}"/>${textBlock(vertex.label, vertex.x + 8, vertex.y + 8, vertex.width - 16, vertex.height - 16, size, textColor, family)}</g>`;
}
function treeBody(node: Extract<DiagramNode, { type: "tree" }>, fill: string, stroke: string, textColor: string, family: string): string {
  const layout = treeLayout(node);
  const links = layout.vertices.flatMap((vertex) => {
    const parent = layout.vertices.find((item) => item.id === vertex.parentId);
    return parent ? [`<line data-parent="${parent.id}" data-child="${vertex.id}" x1="${parent.x + parent.width / 2}" y1="${parent.y + parent.height}" x2="${vertex.x + vertex.width / 2}" y2="${vertex.y}" stroke="${stroke}"/>`] : [];
  });
  return links.join("") + layout.vertices.map((vertex) => vertexBody(vertex, fill, stroke, textColor, family, fontSize(node))).join("");
}
function graphBody(node: Extract<DiagramNode, { type: "graph" }>, fill: string, stroke: string, textColor: string, family: string): string {
  const { vertices } = graphLayout(node);
  const point = (a: typeof vertices[number], b: typeof vertices[number]) => {
    const dx = b.x + b.width / 2 - a.x - a.width / 2;
    const dy = b.y + b.height / 2 - a.y - a.height / 2;
    const t = Math.min(dx ? a.width / 2 / Math.abs(dx) : Infinity, dy ? a.height / 2 / Math.abs(dy) : Infinity);
    return { x: a.x + a.width / 2 + dx * t, y: a.y + a.height / 2 + dy * t };
  };
  const links = node.links.map((link, index) => {
    const source = vertices.find((value) => value.id === link.source);
    const target = vertices.find((value) => value.id === link.target);
    if (!source || !target) return "";
    const self = source.id === target.id;
    const start = self ? { x: source.x + source.width, y: source.y + 8 } : point(source, target);
    const end = self ? { x: source.x + source.width, y: source.y + source.height - 8 } : point(target, source);
    const marker = `graph-${node.id}-${index}`;
    const d = self ? `M${start.x} ${start.y} C${start.x + 64} ${start.y}, ${end.x + 64} ${end.y}, ${end.x} ${end.y}` : `M${start.x} ${start.y} L${end.x} ${end.y}`;
    const x = self ? start.x + 64 : (start.x + end.x) / 2;
    const y = self ? (start.y + end.y) / 2 : (start.y + end.y) / 2 - 8;
    return `<defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="${stroke}"/></marker></defs><path data-source="${escapeXml(link.source)}" data-target="${escapeXml(link.target)}" d="${d}" fill="none" stroke="${stroke}"${node.directed ? ` marker-end="url(#${marker})"` : ""}/>${link.label ? `<rect x="${x - 55}" y="${y - 14}" width="110" height="20" fill="${fill}"/>${textBlock(link.label, x - 55, y - 16, 110, 20, 12, textColor, family)}` : ""}`;
  });
  return links.join("") + vertices.map((vertex) => vertexBody(vertex, fill, stroke, textColor, family, fontSize(node))).join("");
}

function semanticBody(node: DiagramNode, fill: string, stroke: string, textColor: string, family: string): string | null {
  const size = fontSize(node);
  if (node.type === "class" || node.type === "entity") {
    const sections = [[...(node.type === "class" && node.stereotype ? [`«${node.stereotype}»`] : []), node.name], node.attributes, ...(node.type === "class" ? [node.methods] : [])];
    let y = 8;
    return sections.map((section, index) => {
      let body = index ? `<line x1="1" y1="${y}" x2="${node.width - 1}" y2="${y}" stroke="${stroke}"/>` : "";
      for (const value of section) { const height = labelHeight(value, node.width, size); body += textBlock(value, 8, y, node.width - 16, height, size, textColor, family); y += height; }
      if (!section.length) y += 20;
      return body;
    }).join("");
  }
  if (node.type === "tensor") {
    const nameHeight = labelHeight(node.name, node.width, size + 2);
    return textBlock(node.name, 8, 8, node.width - 16, nameHeight, size + 2, textColor, family) + textBlock(node.shape, 8, nameHeight + 16, node.width - 16, node.height - nameHeight - 24, size, textColor, family);
  }
  if (node.type === "state" && node.kind !== "state") {
    const cx = node.width / 2, cy = Math.min(24, node.height / 3);
    return `${node.kind === "final" ? `<circle cx="${cx}" cy="${cy}" r="16" fill="${fill}" stroke="${stroke}"/>` : ""}<circle cx="${cx}" cy="${cy}" r="10" fill="${stroke}"/>${textBlock(node.text, 4, cy + 18, node.width - 8, node.height - cy - 20, size, textColor, family)}`;
  }
  if (node.type === "swimlane") {
    const vertical = node.direction === "vertical";
    return `<rect x="1" y="1" width="${vertical ? node.width - 2 : 48}" height="${vertical ? 42 : node.height - 2}" fill="#e2e8f0" stroke="${stroke}"/>` + (vertical ? textBlock(node.title, 4, 4, node.width - 8, 34, size, textColor, family) : `<g transform="translate(0 ${node.height}) rotate(-90)">${textBlock(node.title, 4, 4, node.height - 8, 38, size, textColor, family)}</g>`);
  }
  if (node.type === "axis") {
    const vertical = node.direction === "vertical";
    const x1 = vertical ? node.width / 2 : 36, y1 = vertical ? node.height - 36 : node.height / 2;
    const x2 = vertical ? x1 : node.width - 24, y2 = vertical ? 40 : y1;
    let body = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}"/><path d="${vertical ? `M${x2 - 5} ${y2 + 8} L${x2} ${y2} L${x2 + 5} ${y2 + 8}` : `M${x2 - 8} ${y2 - 5} L${x2} ${y2} L${x2 - 8} ${y2 + 5}`}" fill="none" stroke="${stroke}"/>`;
    for (const tick of node.ticks) {
      const ratio = (tick.value - node.min) / (node.max - node.min);
      const x = x1 + ratio * (x2 - x1), y = y1 + ratio * (y2 - y1);
      body += `<line x1="${vertical ? x - 5 : x}" y1="${vertical ? y : y - 5}" x2="${vertical ? x + 5 : x}" y2="${vertical ? y : y + 5}" stroke="${stroke}"/>`;
      body += textBlock(tick.label ?? String(tick.value), vertical ? x - 72 : x - 40, vertical ? y - 14 : y + 8, 64, 28, size, textColor, family);
    }
    return body + textBlock(node.title, vertical ? 4 : Math.max(4, node.width - 180), 2, vertical ? node.width - 8 : Math.min(172, node.width - 8), 30, size, textColor, family);
  }
  if (node.type === "timeline") {
    const entries = node.milestones.map((value, index) => ({ ...value, index })).sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
    const step = (node.width - 32) / Math.max(1, entries.length);
    let body = textBlock(node.title, 8, 4, node.width - 16, 30, size + 2, textColor, family) + `<line x1="16" y1="86" x2="${node.width - 16}" y2="86" stroke="${stroke}"/>`;
    entries.forEach((entry, index) => {
      const x = 16 + step * (index + .5);
      body += `<circle cx="${x}" cy="86" r="5" fill="${stroke}"/>` + textBlock(entry.date, x - step / 2 + 8, 40, step - 16, 30, size, textColor, family) + textBlock(entry.label, x - step / 2 + 8, 104, step - 16, node.height - 112, size, textColor, family);
    });
    return body;
  }
  return null;
}

export function renderNodeInner(node: DiagramNode, options: RenderOptions = {}): string {
  node = { ...node, style: resolveNodeStyle(node) };
  node = projectSemanticNode([node], node);
  const fill = color(node.style?.fill, isContainerNode(node) ? "#f8fafc" : node.type === "text" ? "transparent" : "#ffffff");
  const stroke = color(node.style?.stroke, "#1f2937");
  const textColor = color(node.style?.color, "#111827");
  const family = node.style?.fontFamily ?? ACADEMIC.fontFamily;
  const strokeWidth = node.style?.strokeWidth ?? 1.5;
  const parts = [localShape(node, fill, stroke, strokeWidth)];
  const semantic = semanticBody(node, fill, stroke, textColor, family);
  if (semantic !== null) { parts.push(semantic); } else if (node.type === "image" && node.src.startsWith("data:image/")) {
    parts.push(`<image href="${escapeXml(node.src)}" x="0" y="0" width="${node.width}" height="${node.height}"/>`);
  } else if (node.type === "equation" || (node.type === "text" && node.style?.role === "variable")) {
    const equation = node.type === "equation" ? node : { ...node, type: "equation" as const, latex: node.text };
    if (options.equationRenderer) {
      try { parts.push(options.equationRenderer(equation)); }
      catch { options.onRenderError?.(node.id); parts.push(textBlock("公式无法转换", 8, 8, node.width - 16, node.height - 16, 12, "#991b1b", family)); }
    } else if (options.equationMode === "text") {
      parts.push(textBlock(equation.latex, 8, 8, node.width - 16, node.height - 16, fontSize(node), textColor, family));
    } else {
      parts.push(textBlock("公式正在加载", 8, 8, node.width - 16, node.height - 16, 12, "#64748b", family));
    }
  } else if (node.type === "table") {
    parts.push(gridBody(node, fill, stroke, textColor, family, options));
  } else if (node.type === "lifeline") {
    parts.push(textBlock(node.text, 6, 4, node.width - 12, 34, fontSize(node), textColor, family));
  } else if (node.type === "message") {
    parts.push(textBlock(node.text, 4, 0, node.width - 8, node.height - 8, fontSize(node), textColor, family));
  } else if (node.type === "activation") {
    // An activation has no textual body.
  } else if (node.type === "matrix") {
    parts.push(gridBody(node, fill, stroke, textColor, family, options));
  } else if (node.type === "vector") {
    parts.push(gridBody(node, fill, stroke, textColor, family, options));
  } else if (node.type === "array" || node.type === "queue") {
    parts.push(gridBody(node, fill, stroke, textColor, family, options));
  } else if (node.type === "stack") {
    parts.push(gridBody(node, fill, stroke, textColor, family, options));
  } else if (node.type === "tree") {
    parts.push(treeBody(node, fill, stroke, textColor, family));
  } else if (node.type === "graph") {
    parts.push(graphBody(node, fill, stroke, textColor, family));
  } else if (node.type === "container") {
    parts.push(`<text x="12" y="20" font-size="13" font-family="${escapeXml(family)}" fill="${textColor}">${escapeXml(node.title)}</text>`);
  } else if (node.type === "brace") {
    parts.push(textBlock(node.label, 0, 0, node.width, node.height, 13, textColor, family));
  } else {
    const text = nodePlainText(node);
    const top = node.type === "note" ? 16 : 8;
    parts.push(textBlock(text, 8, top, node.width - 16, node.height - top - 8, fontSize(node), textColor, family));
  }
  return `<g font-weight="${node.style?.fontWeight ?? 400}" font-style="${node.style?.fontStyle ?? "normal"}">${parts.join("")}</g>`;
}

export function renderEdgePath(edge: DiagramEdge, source: { x: number; y: number }, target: { x: number; y: number }, sourceSide: HandleSide | undefined, targetSide: HandleSide | undefined): string {
  const polyline = (points: { x: number; y: number }[]) => {
    // Zero-length terminal segments can give SVG arrowheads the wrong tangent.
    const distinct = points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y);
    return `M ${distinct.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
  };
  if (edge.waypoints && edge.waypoints.length > 0) {
    return polyline([source, ...edge.waypoints, target]);
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
    return polyline([source, { x: midX, y: source.y }, { x: midX, y: target.y }, target]);
  }
  return polyline([source, { x: source.x, y: midY }, { x: target.x, y: midY }, target]);
}

export function renderEdgeSvg(edge: DiagramEdge, source: { x: number; y: number }, target: { x: number; y: number }, options: { markerId: string; family?: string; defaultColor?: string; interactive?: boolean }): string {
  const stroke = color(edge.color, options.defaultColor ?? "#334155");
  const markerId = escapeXml(options.markerId);
  const path = renderEdgePath(edge, source, target, edge.sourceHandle, edge.targetHandle);
  const dash = edge.lineStyle === "dashed" ? "6 4" : edge.lineStyle === "dotted" ? "1.5 3" : "";
  const markers = `<defs><marker id="${markerId}" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z" fill="${stroke}"/></marker><marker id="${markerId}-start" markerWidth="10" markerHeight="8" refX="1" refY="4" orient="auto"><path d="M10 0 L0 4 L10 8 Z" fill="${stroke}"/></marker></defs>`;
  const markerEnd = edge.arrowEnd ? ` marker-end="url(#${markerId})"` : "";
  const markerStart = edge.arrowStart ? ` marker-start="url(#${markerId}-start)"` : "";
  const labelPoint = edgeLabelPosition(edge, source, target);
  const label = edge.label ? `<text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" font-size="12" font-family="${escapeXml(options.family ?? "Segoe UI, sans-serif")}" fill="${stroke}">${escapeXml(edge.label)}</text>` : "";
  const interaction = options.interactive ? `<path d="${path}" fill="none" stroke="transparent" stroke-width="20" class="react-flow__edge-interaction"/>` : "";
  return `${markers}<path d="${path}" class="react-flow__edge-path" style="fill:none;stroke:${stroke};stroke-width:${edge.width ?? 1.5};stroke-dasharray:${dash || "none"}" fill="none" stroke="${stroke}" stroke-width="${edge.width ?? 1.5}"${dash ? ` stroke-dasharray="${dash}"` : ""}${markerEnd}${markerStart}/>${interaction}${label}`;
}

export function renderDocumentSvg(document: DiagramDocument, options: RenderOptions = {}): string {
  document = { ...document, nodes: styledNodes(document) };
  const padding = options.padding ?? 24;
  const bounds = contentBounds(document.nodes.map((node) => projectSemanticNode(document.nodes, node)), document.canvas, document.edges);
  const background = color(options.background ?? document.canvas.background, "#ffffff");
  const family = document.styles?.fontFamily && document.styles.fontFamily !== "Segoe UI, sans-serif" ? document.styles.fontFamily : ACADEMIC.fontFamily;
  const edgeColor = color(document.styles?.edgeColor, "#334155");
  const projected = document.nodes.map((node) => projectSemanticNode(document.nodes, node));
  const nodes = [...projected].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const markupFor = (node: DiagramNode) => {
    const origin = absolutePosition(projected, node.id);
    return `<g transform="translate(${origin.x - bounds.x + padding} ${origin.y - bounds.y + padding})">${renderNodeInner(node, options)}</g>`;
  };
  const containers = nodes.filter(isContainerNode);
  const depth = (node: DiagramNode) => {
    let count = 0; let current = node;
    while (current.parentId && count < nodes.length) { current = nodes.find((item) => item.id === current.parentId)!; if (!current) break; count++; }
    return count;
  };
  const containerMarkup = containers.sort((a, b) => depth(a) - depth(b)).map(markupFor).join("");
  const nodeMarkup = nodes.filter((node) => !isContainerNode(node)).map(markupFor).join("");
  const labels = options.annotateIds
    ? nodes
        .map((node) => {
          const origin = absolutePosition(projected, node.id);
          return `<text x="${origin.x - bounds.x + padding}" y="${origin.y - bounds.y + padding - 4}" font-size="10" fill="#64748b">${escapeXml(node.id)}</text>`;
        })
        .join("")
    : "";
  const annotationEdges: DiagramEdge[] = document.nodes.flatMap((node) => node.type === "annotation" && node.targetId ? [{
    id: `annotation_${node.id}`, source: node.id, target: node.targetId, label: "", router: "straight" as const, arrowStart: false, arrowEnd: true, lineStyle: "dashed" as const,
  }] : []);
  const edges = [...document.edges, ...annotationEdges]
    .map((edge, index) => {
      const sourceNode = projected.find((node) => node.id === edge.source);
      const targetNode = projected.find((node) => node.id === edge.target);
      if (!sourceNode || !targetNode) return "";
      const endpoints = edgeEndpoints(projected, edge)!;
      const source = { x: endpoints.source.x - bounds.x + padding, y: endpoints.source.y - bounds.y + padding };
      const target = { x: endpoints.target.x - bounds.x + padding, y: endpoints.target.y - bounds.y + padding };
      const translated = { ...edge, sourceHandle: endpoints.sourceHandle, targetHandle: endpoints.targetHandle, waypoints: edge.waypoints?.map((point) => ({ x: point.x - bounds.x + padding, y: point.y - bounds.y + padding })) };
      return renderEdgeSvg(translated, source, target, { markerId: `m${index}`, family, defaultColor: edgeColor });
    })
    .join("");
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#334155"/></marker></defs><rect width="100%" height="100%" fill="${background}"/>${containerMarkup}${edges}${nodeMarkup}${labels}</svg>`;
}

export function reviewManifest(document: DiagramDocument) {
  const projected = document.nodes.map((node) => projectSemanticNode(document.nodes, node));
  const bounds = contentBounds(document.nodes.map((node) => projectSemanticNode(document.nodes, node)), document.canvas, document.edges);
  return {
    documentId: document.documentId,
    revision: document.revision,
    bounds,
    objects: [
      ...projected.map((node) => {
        const box = absoluteBox(projected, node);
        return { id: node.id, kind: "node" as const, type: node.type, ...box };
      }),
      ...document.edges.map((edge) => ({ id: edge.id, kind: "edge" as const, type: edge.router, x: 0, y: 0, width: 0, height: 0 })),
    ],
  };
}
