import { Vector3 } from "@babylonjs/core";
import { createNavigationAgent } from "../../../src/world/navigationAgent";
import {
  DISTANCE_NAVIGATION_ROUTE_POLICY,
  type NavigationWorld
} from "../../../src/world/navigationWorld";

export const runNavigationEdgeMovementTests = (navigation: NavigationWorld) => {
  // 報告座標以外も、実NavMeshの共有辺を学校全体から均等に選ぶ。
  const edges = new Map<string, { a: Vector3; b: Vector3; count: number }>();
  for (const triangle of navigation.getSurfaceTriangles()) {
    for (const [a, b] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]]) {
      const key = [a.asArray().join(","), b.asArray().join(",")].sort().join("/");
      const edge = edges.get(key);
      if (edge) {
        edge.count += 1;
      } else {
        edges.set(key, { a, b, count: 1 });
      }
    }
  }
  const sharedEdges = [...edges.values()].filter((edge) =>
    edge.count === 2 && Vector3.Distance(edge.a, edge.b) > 0.02
  );
  const sampledEdges = Array.from({ length: 128 }, (_, index) =>
    sharedEdges[Math.floor(index * sharedEdges.length / 128)]
  );
  let edgeFailures = 0;
  let maximumEdgeError = 0;
  for (const edge of sampledEdges) {
    for (const direction of [-1, 1]) {
      const midpoint = Vector3.Lerp(edge.a, edge.b, 0.5);
      const projectedStart = navigation.projectPoint(midpoint, 0.01)!;
      const endpoint = midpoint.add(edge.b.subtract(edge.a).normalize().scale(direction * 0.0033));
      const result = navigation.constrainMovement(projectedStart, endpoint)!;
      const error = Math.hypot(result.position.x - endpoint.x, result.position.z - endpoint.z);
      maximumEdgeError = Math.max(maximumEdgeError, error);
      if (error > 1e-6) edgeFailures += 1;
    }
  }
  const from = new Vector3(1.0583237409591675, 2.7125000953674316, -1.0699940919876099);
  const desired = new Vector3(1.0611534669646818, from.y, -1.0716919290627487);
  const start = navigation.projectPoint(from, 0.01)!;
  const moved = navigation.constrainMovement(start, desired)!;
  const requested = Vector3.Distance(from, desired);
  const actual = Vector3.Distance(from, moved.position);
  const destinationError = Vector3.Distance(desired, moved.position);
  const agent = createNavigationAgent(navigation, "npc", DISTANCE_NAVIGATION_ROUTE_POLICY, {
    projectionMaxDistance: 0.1,
    waypointTolerance: 0.02,
    stuckDistanceThreshold: 0.001,
    stuckDurationSeconds: 1
  });
  const goal = from.add(desired.subtract(from).scale(16));
  let location = start;
  let maximumStep = 0;
  let state = "moving";
  for (let tick = 0; tick < 60 && state !== "arrived"; tick += 1) {
    const step = agent.update(location, goal, 0, 0.33, 0.01, true);
    maximumStep = Math.max(maximumStep, Vector3.Distance(location.position, step.location.position));
    location = step.location;
    state = step.state;
  }
  return [
    {
      name: "学校全体128共有辺の双方向微小移動",
      ok: sharedEdges.length >= 128 && edgeFailures === 0,
      detail: `256方向、失敗=${edgeFailures}, 最大水平終点誤差=${maximumEdgeError}`
    },
    {
      name: "報告座標の共有辺微小移動で外壁へ押し戻されない",
      ok: actual <= requested + 1e-6 && destinationError <= 1e-6,
      detail: `要求=${requested}, 実移動=${actual}, 終点誤差=${destinationError}`
    },
    {
      name: "共有辺に沿うNPC連続移動が予算内で到着する",
      ok: state === "arrived" && maximumStep <= 0.003301 && Vector3.Distance(location.position, goal) <= 0.02,
      detail: `state=${state}, 最大移動=${maximumStep}, 残距離=${Vector3.Distance(location.position, goal)}`
    }
  ];
};
