import type { DiagramNode } from "@drawit/core";
import { renderNodeInner } from "@drawit/render";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";

type ShapeData = { diagramNode: DiagramNode };

export function ShapeNode({ data, selected }: NodeProps<Node<ShapeData>>) {
  const node = data.diagramNode;
  return (
    <div className={`shape-node ${selected ? "is-selected" : ""}`}>
      <NodeResizer isVisible={selected} minWidth={48} minHeight={32} />
      <svg viewBox={`0 0 ${node.width} ${node.height}`} width="100%" height="100%" dangerouslySetInnerHTML={{ __html: renderNodeInner(node) }} />
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Handle key={side} id={side} type="source" position={positionFor(side)} style={handleStyle(side)} />
      ))}
    </div>
  );
}

function positionFor(side: "top" | "right" | "bottom" | "left"): Position {
  if (side === "top") return Position.Top;
  if (side === "right") return Position.Right;
  if (side === "bottom") return Position.Bottom;
  return Position.Left;
}

function handleStyle(side: "top" | "right" | "bottom" | "left"): { left?: string; top?: string } {
  if (side === "top") return { left: "50%" };
  if (side === "bottom") return { left: "50%" };
  if (side === "left") return { top: "50%" };
  return { top: "50%" };
}
