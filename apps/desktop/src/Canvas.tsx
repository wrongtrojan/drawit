import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  ConnectionMode,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { DiagramDocument } from "@drawit/core";
import { toFlowEdges, toFlowNodes } from "./project.js";
import { ShapeEdge } from "./ShapeEdge.js";
import { ShapeNode } from "./ShapeNode.js";

const edgeTypes = { drawit: ShapeEdge };
const nodeTypes = { drawit: ShapeNode };

interface CanvasProps {
  document: DiagramDocument;
  selection: string[];
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onConnect: (connection: Connection) => void;
  onSelection: (ids: string[]) => void;
  onInit: (instance: ReactFlowInstance) => void;
  readOnly?: boolean;
}

export function Canvas({ document, selection, onMove, onResize, onConnect, onSelection, onInit, readOnly }: CanvasProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const dragging = useRef(new Set<string>());
  const resizing = useRef(new Set<string>());

  useEffect(() => {
    setNodes((current) => {
      const next = toFlowNodes(document, selection);
      if (dragging.current.size === 0 && resizing.current.size === 0) return next;
      return next.map((node) => {
        if (!dragging.current.has(node.id) && !resizing.current.has(node.id)) return node;
        const previous = current.find((item) => item.id === node.id);
        return previous ? { ...node, position: dragging.current.has(node.id) ? previous.position : node.position, ...(resizing.current.has(node.id) ? { width: previous.width, height: previous.height, style: previous.style } : {}) } : node;
      });
    });
    setEdges(toFlowEdges(document, selection));
  }, [document, selection]);

  const onNodesChange = (changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
    for (const change of changes) {
      if (change.type === "position" && change.dragging && change.position) dragging.current.add(change.id);
      if (change.type === "position" && change.dragging === false && change.position) {
        dragging.current.delete(change.id);
        const node = document.nodes.find((item) => item.id === change.id);
        if (node && (Math.abs(node.x - change.position.x) > 0.5 || Math.abs(node.y - change.position.y) > 0.5)) {
          onMove(change.id, change.position.x, change.position.y);
        }
      }
      if (change.type === "dimensions" && change.resizing) resizing.current.add(change.id);
      if (change.type === "dimensions" && change.resizing === false && change.dimensions && resizing.current.has(change.id)) {
        resizing.current.delete(change.id);
        const node = document.nodes.find((item) => item.id === change.id);
        if (node && (Math.abs(node.width - change.dimensions.width) > 0.5 || Math.abs(node.height - change.dimensions.height) > 0.5)) {
          onResize(change.id, change.dimensions.width, change.dimensions.height);
        }
      }
    }
  };

  const onSelect = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
    onSelection([...selectedNodes.map((node) => node.id), ...selectedEdges.map((edge) => edge.id)]);
  }, [onSelection]);

  return (
    <ReactFlow
      nodes={nodes}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={(changes) => setEdges((current) => applyEdgeChanges(changes, current))}
      onConnect={onConnect}
      connectionMode={ConnectionMode.Loose}
      onSelectionChange={onSelect}
      onInit={onInit}
      fitView
      selectionOnDrag
      panOnDrag={[1, 2]}
      multiSelectionKeyCode={["Control", "Meta"]}
      deleteKeyCode={null}
      disableKeyboardA11y
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={document.canvas.gridSize ?? 20} />
    </ReactFlow>
  );
}
