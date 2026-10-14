import type { DiagramEdge, HandleSide } from "./schema.js";

export const EDGE_STUB = 20;

export type RoutePoint = { x: number; y: number };

function sideHorizontal(side: HandleSide | undefined): boolean {
  return side === "left" || side === "right";
}

function stubPoint(point: RoutePoint, side: HandleSide | undefined, distance: number): RoutePoint {
  if (!side) return point;
  switch (side) {
    case "left":
      return { x: point.x - distance, y: point.y };
    case "right":
      return { x: point.x + distance, y: point.y };
    case "top":
      return { x: point.x, y: point.y - distance };
    case "bottom":
      return { x: point.x, y: point.y + distance };
  }
}

export function dedupeRoutePoints(points: RoutePoint[]): RoutePoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y);
}

function pathLength(points: RoutePoint[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
}

function alignedOrthogonal(
  source: RoutePoint,
  target: RoutePoint,
  sourceSide: HandleSide | undefined,
  targetSide: HandleSide | undefined,
): RoutePoint[] | null {
  const dx = Math.abs(source.x - target.x);
  const dy = Math.abs(source.y - target.y);
  if (dx < 0.5 && dy > 0.5 && !sideHorizontal(sourceSide) && !sideHorizontal(targetSide)) {
    const midY = (source.y + target.y) / 2;
    return dedupeRoutePoints([source, { x: source.x, y: midY }, target]);
  }
  if (dy < 0.5 && dx > 0.5 && sideHorizontal(sourceSide) && sideHorizontal(targetSide)) {
    const midX = (source.x + target.x) / 2;
    return dedupeRoutePoints([source, { x: midX, y: source.y }, { x: midX, y: target.y }, target]);
  }
  return null;
}

function orthogonalWithStub(
  source: RoutePoint,
  target: RoutePoint,
  sourceSide: HandleSide | undefined,
  targetSide: HandleSide | undefined,
): RoutePoint[] {
  const aligned = alignedOrthogonal(source, target, sourceSide, targetSide);
  if (aligned) return aligned;

  const s = stubPoint(source, sourceSide, EDGE_STUB);
  const t = stubPoint(target, targetSide, EDGE_STUB);
  const hv: RoutePoint[] = [source, s, { x: t.x, y: s.y }, t, target];
  const vh: RoutePoint[] = [source, s, { x: s.x, y: t.y }, t, target];
  return dedupeRoutePoints(pathLength(hv) <= pathLength(vh) ? hv : vh);
}

export function routeEdgePoints(
  edge: Pick<DiagramEdge, "router" | "waypoints" | "sourceHandle" | "targetHandle">,
  source: RoutePoint,
  target: RoutePoint,
  sourceSide?: HandleSide,
  targetSide?: HandleSide,
): RoutePoint[] {
  if (edge.waypoints && edge.waypoints.length > 0) {
    return dedupeRoutePoints([source, ...edge.waypoints, target]);
  }
  const router = edge.router ?? "orthogonal";
  if (router === "straight") return [source, target];
  if (router === "orthogonal") {
    return orthogonalWithStub(source, target, sourceSide ?? edge.sourceHandle, targetSide ?? edge.targetHandle);
  }
  if (router === "curved") {
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2 - 30;
    return [source, { x: midX, y: midY }, target];
  }
  return [source, target];
}

export function routePolylineD(points: RoutePoint[]): string {
  const distinct = dedupeRoutePoints(points);
  if (distinct.length < 2) return "";
  return `M ${distinct.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
}
