import type { DiagramEdge } from "@drawit/core";
import { renderEdgeSvg } from "@drawit/render/browser";
import type { Edge, EdgeProps } from "@xyflow/react";

export function ShapeEdge({ id, data, sourceX, sourceY, targetX, targetY }: EdgeProps<Edge<{ diagramEdge: DiagramEdge }>>) {
  if (!data) return null;
  return <g dangerouslySetInnerHTML={{ __html: renderEdgeSvg(data.diagramEdge, { x: sourceX, y: sourceY }, { x: targetX, y: targetY }, { markerId: `canvas-${id}`, interactive: true }) }} />;
}
