import { nodeConnectionBox, type DiagramNode } from "@drawit/core";
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
        <Handle key={side} id={side} type="source" position={positionFor(side)} style={handleStyle(node, side)} />
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

function handleStyle(node: DiagramNode, side: "top" | "right" | "bottom" | "left"): { left: number; top: number; right: string; bottom: string; transform: string } {
  const box = nodeConnectionBox(node);
  return { left: box.x + (side === "left" ? 0 : side === "right" ? box.width : box.width / 2), top: box.y + (side === "top" ? 0 : side === "bottom" ? box.height : box.height / 2), right: "auto", bottom: "auto", transform: "translate(-50%, -50%)" };
}
