import { parseDocument } from "./document.js";
import { SCHEMA_VERSION } from "./schema.js";

export function createBinarySearchExample() {
  return parseDocument({
    schemaVersion: SCHEMA_VERSION,
    documentId: "doc_binary_search",
    revision: 0,
    title: "二分查找",
    canvas: { width: 1400, height: 900, background: "#ffffff", gridSize: 20 },
    styles: { fontFamily: "Segoe UI, sans-serif", nodeFill: "#ffffff", nodeStroke: "#1f2937", edgeColor: "#334155" },
    nodes: [
      { id: "n_start", type: "flowchart", kind: "terminator", text: "开始", x: 460, y: 40, width: 160, height: 56 },
      { id: "n_init", type: "flowchart", kind: "process", text: "low, high = 边界", x: 430, y: 150, width: 220, height: 64 },
      { id: "n_loop", type: "flowchart", kind: "decision", text: "low <= high ?", x: 430, y: 270, width: 220, height: 110 },
      { id: "n_mid", type: "flowchart", kind: "process", text: "mid = (low + high) / 2", x: 410, y: 440, width: 260, height: 64 },
      { id: "n_cmp", type: "flowchart", kind: "decision", text: "a[mid] == target ?", x: 420, y: 560, width: 240, height: 110 },
      { id: "n_found", type: "flowchart", kind: "terminator", text: "返回 mid", x: 80, y: 760, width: 160, height: 56 },
      { id: "n_adjust", type: "flowchart", kind: "process", text: "缩小区间", x: 700, y: 756, width: 180, height: 64 },
      { id: "n_miss", type: "flowchart", kind: "terminator", text: "返回 -1", x: 980, y: 292, width: 160, height: 56 },
    ],
    edges: [
      { id: "e_start", source: "n_start", target: "n_init", sourceHandle: "bottom", targetHandle: "top" },
      { id: "e_init", source: "n_init", target: "n_loop", sourceHandle: "bottom", targetHandle: "top" },
      { id: "e_yes_loop", source: "n_loop", target: "n_mid", label: "yes", sourceHandle: "bottom", targetHandle: "top" },
      { id: "e_no_loop", source: "n_loop", target: "n_miss", label: "no", sourceHandle: "right", targetHandle: "left" },
      { id: "e_mid", source: "n_mid", target: "n_cmp", sourceHandle: "bottom", targetHandle: "top" },
      { id: "e_found", source: "n_cmp", target: "n_found", label: "yes", sourceHandle: "left", targetHandle: "top" },
      { id: "e_adjust", source: "n_cmp", target: "n_adjust", label: "no", sourceHandle: "right", targetHandle: "top" },
      { id: "e_back", source: "n_adjust", target: "n_loop", sourceHandle: "top", targetHandle: "right" },
    ],
  });
}
