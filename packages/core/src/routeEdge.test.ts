import { describe, expect, it } from "vitest";
import { EDGE_STUB, routeEdgePoints, routePolylineD } from "./routeEdge.js";

describe("routeEdgePoints", () => {
  it("keeps a midpoint on aligned vertical orthogonal routes", () => {
    const edge = { router: "orthogonal" as const, sourceHandle: "bottom" as const, targetHandle: "top" as const };
    expect(routePolylineD(routeEdgePoints(edge, { x: 10, y: 20 }, { x: 10, y: 100 }))).toBe("M 10 20 L 10 60 L 10 100");
  });

  it("extends stubs before turning for horizontal-to-vertical handles", () => {
    const edge = { router: "orthogonal" as const, sourceHandle: "right" as const, targetHandle: "top" as const };
    const points = routeEdgePoints(edge, { x: 0, y: 0 }, { x: 100, y: 80 });
    expect(points[1]).toEqual({ x: EDGE_STUB, y: 0 });
    expect(points.at(-2)).toEqual({ x: 100, y: 80 - EDGE_STUB });
  });

  it("honors user waypoints", () => {
    const edge = { router: "orthogonal" as const, waypoints: [{ x: 10, y: 20 }, { x: 10, y: 100 }], sourceHandle: "bottom" as const, targetHandle: "top" as const };
    expect(routePolylineD(routeEdgePoints(edge, { x: 10, y: 20 }, { x: 10, y: 100 }))).toBe("M 10 20 L 10 100");
  });
});
