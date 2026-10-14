import { nodeConnectionBox, type DiagramNode } from "@drawit/core";
import { renderNodeInner } from "@drawit/render/browser";
import { useEffect, useState } from "react";
import { formulas } from "./formulaClient.js";
import { reportError } from "./diagnostics.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";

type ShapeData = { diagramNode: DiagramNode };

export function ShapeNode({ data, selected }: NodeProps<Node<ShapeData>>) {
  return <ErrorBoundary scope="node" nodeId={data.diagramNode.id} resetKey={JSON.stringify(data.diagramNode)}><ShapeContent data={data} selected={selected} /></ErrorBoundary>;
}

function ShapeContent({ data, selected }: { data: ShapeData; selected?: boolean }) {
  const node = data.diagramNode;
  const [formula, setFormula] = useState<{ key: string; markup: string } | null>(null);
  const [error, setError] = useState(false);
  const key = JSON.stringify(node);
  useEffect(() => {
    if (node.type !== "equation") return;
    let cancelled = false; setError(false);
    void formulas.render(node).then((markup) => { if (!cancelled) setFormula({ key, markup }); }, (reason) => { if (!cancelled) { setError(true); reportError(reason, undefined, { nodeId: node.id }); } });
    return () => { cancelled = true; };
  }, [key]);
  return (
    <div className={`shape-node ${selected ? "is-selected" : ""}`}>
      <NodeResizer isVisible={selected} minWidth={48} minHeight={32} />
      {error ? <div className="error-recovery node" role="alert">公式无法转换；可在属性中修改 LaTeX。</div> : <svg viewBox={`0 0 ${node.width} ${node.height}`} width="100%" height="100%" dangerouslySetInnerHTML={{ __html: node.type === "equation" && formula?.key === key ? formula.markup : renderNodeInner(node) }} />}
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
