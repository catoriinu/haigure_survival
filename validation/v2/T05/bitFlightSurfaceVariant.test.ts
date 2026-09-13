import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
  type Mesh
} from "@babylonjs/core";
import { exportNavMesh, NavMeshQuery } from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

import { createBitFlightAgent } from "../../../src/world/bitFlightAgent";
import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  createBitFlightBandRef,
  createBitFlightNavigationWorld,
  getBitFlightWorldPosition,
  prepareBitFlightNavigationRouteCaches,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightBand,
  type BitFlightBandRef,
  type BitFlightLocation,
  type BitFlightNavMeshPayload,
  type BitFlightNavigationDefinition,
  type BitFlightNavigationWorld,
  type BitFlightRoute,
  type BitFlightRoutePolicy,
  type BitFlightRouteStep,
  type BitFlightSurfaceRouteStep
} from "../../../src/world/bitFlightNavigation";
import {
  BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS,
  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
  createBitFlightSafety,
  type BitFlightSafety
} from "../../../src/world/bitFlightSafety";
import { initializeNavigationRuntime } from "../../../src/world/navigationWorld";
import type { StageSpatialQueries } from "../../../src/world/stageSpatialQueries";
import {
  createDynamicStageSpatialQueryFixture,
  type DynamicStageSpatialQueryFixture
} from "./stageSpatialQueryFixture";

export type BitFlightSurfaceVariantTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type NavGeometry = Readonly<{
  positions: readonly number[];
  indices: readonly number[];
}>;

type SurfaceVariantFixture = Readonly<{
  engine: NullEngine;
  scene: Scene;
  world: BitFlightNavigationWorld;
  spatial: DynamicStageSpatialQueryFixture;
  queries: StageSpatialQueries;
  safety: BitFlightSafety;
}>;

type FixtureColliders = Readonly<{
  movement: readonly Mesh[];
  ground: readonly Mesh[];
}>;

type PolicyEvaluation = Readonly<{
  heights: readonly number[];
  safe: boolean;
}>;

const zoneId = toBitFlightZoneId("altitude-variant-volume");
const bandId = toBitFlightBandId("multi-height-band");
const bandRef = createBitFlightBandRef(zoneId, bandId);
const navSurfaceHeight = 0.4;
const band: BitFlightBand = Object.freeze({
  zoneId,
  id: bandId,
  minimumCenterHeight: 0.3,
  maximumCenterHeight: 1.1
});
const definition: BitFlightNavigationDefinition = Object.freeze({
  zones: Object.freeze([
    Object.freeze({
      id: zoneId,
      spaceKind: "indoor" as const
    })
  ]),
  bands: Object.freeze([band]),
  transitions: Object.freeze([])
});
const equalCostAlternateBandId = toBitFlightBandId(
  "equal-cost-alternate-band"
);
const equalCostAlternateBandRef = createBitFlightBandRef(
  zoneId,
  equalCostAlternateBandId
);
const equalCostAlternateBand: BitFlightBand = Object.freeze({
  zoneId,
  id: equalCostAlternateBandId,
  minimumCenterHeight: band.minimumCenterHeight,
  maximumCenterHeight: band.maximumCenterHeight
});
const equalCostTransitionDefinition: BitFlightNavigationDefinition =
  Object.freeze({
    zones: definition.zones,
    bands: Object.freeze([band, equalCostAlternateBand]),
    transitions: Object.freeze([
      Object.freeze({
        id: "equal-cost-enter-alternate",
        kind: "aperture" as const,
        from: bandRef,
        to: equalCostAlternateBandRef,
        bidirectional: false,
        affordances: Object.freeze(["indoor-access"] as const),
        fromPosition: new Vector3(-1, navSurfaceHeight, 0),
        toPosition: new Vector3(-1, navSurfaceHeight, 0),
        traversalPoints: Object.freeze([]),
        region: null,
        projectionDistance: 0.5
      }),
      Object.freeze({
        id: "equal-cost-return-primary",
        kind: "aperture" as const,
        from: equalCostAlternateBandRef,
        to: bandRef,
        bidirectional: false,
        affordances: Object.freeze(["indoor-access"] as const),
        fromPosition: new Vector3(1, navSurfaceHeight, 0),
        toPosition: new Vector3(1, navSurfaceHeight, 0),
        traversalPoints: Object.freeze([]),
        region: null,
        projectionDistance: 0.5
      })
    ])
  });
const directedCacheAlternateBandId = toBitFlightBandId(
  "directed-cache-alternate-band"
);
const directedCacheAlternateBandRef = createBitFlightBandRef(
  zoneId,
  directedCacheAlternateBandId
);
const directedCacheAlternateBand: BitFlightBand = Object.freeze({
  zoneId,
  id: directedCacheAlternateBandId,
  minimumCenterHeight: band.minimumCenterHeight,
  maximumCenterHeight: band.maximumCenterHeight
});
const directedEndpointCacheDefinition: BitFlightNavigationDefinition =
  Object.freeze({
    zones: definition.zones,
    bands: Object.freeze([band, directedCacheAlternateBand]),
    transitions: Object.freeze([
      Object.freeze({
        id: "directed-cache-west",
        kind: "aperture" as const,
        from: bandRef,
        to: directedCacheAlternateBandRef,
        bidirectional: true,
        affordances: Object.freeze(["indoor-access"] as const),
        fromPosition: new Vector3(-2, navSurfaceHeight, 0),
        toPosition: new Vector3(-2, navSurfaceHeight, 0),
        traversalPoints: Object.freeze([]),
        region: null,
        projectionDistance: 0.5
      }),
      Object.freeze({
        id: "directed-cache-east",
        kind: "aperture" as const,
        from: bandRef,
        to: directedCacheAlternateBandRef,
        bidirectional: true,
        affordances: Object.freeze(["indoor-access"] as const),
        fromPosition: new Vector3(2, navSurfaceHeight, 0),
        toPosition: new Vector3(2, navSurfaceHeight, 0),
        traversalPoints: Object.freeze([]),
        region: null,
        projectionDistance: 0.5
      })
    ])
  });
const navParameters = Object.freeze({
  cs: 0.05,
  ch: 0.025,
  walkableSlopeAngle: 45,
  walkableHeight: 18,
  walkableClimb: 2,
  walkableRadius: 2,
  maxEdgeLen: 24,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1
});

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-5
) => Math.abs(actual - expected) <= tolerance;

const createPlaneGeometry = (): NavGeometry =>
  Object.freeze({
    positions: Object.freeze([
      -2.5,
      navSurfaceHeight,
      -2.5,
      2.5,
      navSurfaceHeight,
      -2.5,
      2.5,
      navSurfaceHeight,
      2.5,
      -2.5,
      navSurfaceHeight,
      2.5
    ]),
    indices: Object.freeze([0, 3, 2, 0, 2, 1])
  });

const appendRectangle = (
  positions: number[],
  indices: number[],
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number
) => {
  const offset = positions.length / 3;
  positions.push(
    minimumX,
    navSurfaceHeight,
    minimumZ,
    maximumX,
    navSurfaceHeight,
    minimumZ,
    maximumX,
    navSurfaceHeight,
    maximumZ,
    minimumX,
    navSurfaceHeight,
    maximumZ
  );
  indices.push(
    offset,
    offset + 3,
    offset + 2,
    offset,
    offset + 2,
    offset + 1
  );
};

const createBlockedGeometry = (): NavGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  appendRectangle(positions, indices, -2.5, -0.6, -2.5, 2.5);
  appendRectangle(positions, indices, 0.6, 2.5, -2.5, 2.5);
  appendRectangle(positions, indices, -0.6, 0.6, -2.5, -1);
  appendRectangle(positions, indices, -0.6, 0.6, 1, 2.5);
  return Object.freeze({
    positions: Object.freeze(positions),
    indices: Object.freeze(indices)
  });
};

const bakePayload = (
  geometry: NavGeometry,
  targetBandRef: BitFlightBandRef = bandRef
): BitFlightNavMeshPayload => {
  const result = generateSoloNavMesh(
    geometry.positions,
    geometry.indices,
    navParameters
  );
  if (!result.success) {
    throw new Error(result.error);
  }
  try {
    return Object.freeze({
      zoneId: targetBandRef.zoneId,
      bandId: targetBandRef.bandId,
      data: exportNavMesh(result.navMesh)
    });
  } finally {
    result.navMesh.destroy();
  }
};

const createFixture = async (
  geometry: NavGeometry,
  createColliders: (scene: Scene) => FixtureColliders,
  navigationDefinition: BitFlightNavigationDefinition = definition,
  payloadBandRefs: readonly BitFlightBandRef[] = Object.freeze([bandRef])
): Promise<SurfaceVariantFixture> => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const colliders = createColliders(scene);
  colliders.movement.forEach((collider) =>
    collider.computeWorldMatrix(true)
  );
  const movementColliders = Object.freeze({
    player: Object.freeze([]),
    npc: Object.freeze([]),
    bit: Object.freeze([...colliders.movement])
  });
  const spatial = createDynamicStageSpatialQueryFixture(
    scene,
    {
      movementColliders,
      groundColliders: Object.freeze([...colliders.ground]),
      beamBlockers: Object.freeze([]),
      sightBlockers: Object.freeze([]),
      bitObstacles: movementColliders.bit
    },
    { volumes: Object.freeze([]) }
  );
  const queries = spatial.queries;
  const world = await createBitFlightNavigationWorld(
    navigationDefinition,
    Object.freeze(
      payloadBandRefs.map((payloadBandRef) =>
        bakePayload(geometry, payloadBandRef)
      )
    )
  );
  return Object.freeze({
    engine,
    scene,
    world,
    spatial,
    queries,
    safety: createBitFlightSafety(queries)
  });
};

const disposeFixture = (fixture: SurfaceVariantFixture) => {
  fixture.spatial.dispose();
  fixture.world.dispose();
  fixture.scene.dispose();
  fixture.engine.dispose();
};

const projectRequired = (
  world: BitFlightNavigationWorld,
  x: number,
  z: number,
  targetBandRef: BitFlightBandRef = bandRef
) => {
  const location = world.projectPointInBand(
    targetBandRef,
    new Vector3(x, navSurfaceHeight, z),
    0.5
  );
  if (!location) {
    throw new Error(`fixture位置を飛行帯へ投影できません: ${x}/${z}`);
  }
  return location;
};

const getSurfaceStepPositions = (step: BitFlightSurfaceRouteStep) =>
  Object.freeze(step.points.map(getBitFlightWorldPosition));

const isSurfaceStepSafe = (
  safety: BitFlightSafety,
  step: BitFlightSurfaceRouteStep
) => {
  const points = getSurfaceStepPositions(step);
  if (points.some((point) => !safety.isCenterSafe(point))) {
    return false;
  }
  for (let index = 1; index < points.length; index += 1) {
    if (safety.findMovementCollision(points[index - 1], points[index])) {
      return false;
    }
  }
  return true;
};

const createSafetyPolicy = (
  safety: BitFlightSafety,
  evaluations: PolicyEvaluation[]
): BitFlightRoutePolicy =>
  Object.freeze({
    canUseTransition: () => true,
    canUseRouteStep: (step: BitFlightRouteStep) => {
      if (step.kind === "transition") {
        return true;
      }
      const safe = isSurfaceStepSafe(safety, step);
      evaluations.push(
        Object.freeze({
          heights: Object.freeze(
            step.points.map((point) => point.safeCenterHeight)
          ),
          safe
        })
      );
      return safe;
    },
    additionalSurfaceCruiseHeights: (step, stepBand) =>
      safety.findLowCeilingCruiseHeights(step, stepBand),
    additionalTransitionCost: () => 0
  });

const requireRoute = (route: BitFlightRoute | null) => {
  if (!route) {
    throw new Error("安全なfixture経路を作成できませんでした。");
  }
  return route;
};

const requireOnlySurfaceStep = (route: BitFlightRoute) => {
  if (route.steps.length !== 1 || route.steps[0].kind !== "surface") {
    throw new Error("fixture経路は1本の帯内経路である必要があります。");
  }
  return route.steps[0];
};

const updateAgent = (
  agent: ReturnType<typeof createBitFlightAgent>,
  surfaceSpeedWorldUnitsPerSecond: number,
  deltaSeconds: number
) => {
  const previousRootPosition = agent.getSnapshot().position;
  if (!previousRootPosition) {
    throw new Error("更新前のBIT飛行位置がありません。");
  }
  return agent.update(
    surfaceSpeedWorldUnitsPerSecond,
    deltaSeconds,
    previousRootPosition,
    (candidate) => {
      if (!candidate.position) {
        throw new Error("更新後のBIT飛行位置がありません。");
      }
      return candidate.position;
    }
  );
};

const followRoute = (
  fixture: SurfaceVariantFixture,
  start: BitFlightLocation,
  route: BitFlightRoute
) => {
  const agent = createBitFlightAgent(fixture.world, fixture.safety, {
    waypointTolerance: 0.001
  });
  try {
    const accepted = agent.setPreparedRoute(start, route, "verify");
    let snapshot = agent.getSnapshot();
    let allCentersSafe =
      snapshot.position === null ||
      fixture.safety.isCenterSafe(snapshot.position);
    let updateCount = 0;
    while (
      accepted &&
      snapshot.state !== "arrived" &&
      snapshot.state !== "blocked" &&
      snapshot.state !== "unreachable" &&
      updateCount < 100
    ) {
      snapshot = updateAgent(agent, 1, 0.1);
      allCentersSafe =
        allCentersSafe &&
        (snapshot.position === null ||
          fixture.safety.isCenterSafe(snapshot.position));
      updateCount += 1;
    }
    const destination = getBitFlightWorldPosition(route.destination);
    const remainingDistance = snapshot.position
      ? Vector3.Distance(snapshot.position, destination)
      : Number.POSITIVE_INFINITY;
    return Object.freeze({
      accepted,
      arrived: snapshot.state === "arrived",
      allCentersSafe,
      updateCount,
      remainingDistance
    });
  } finally {
    agent.dispose();
  }
};

const followDynamicRoute = (
  fixture: SurfaceVariantFixture,
  start: BitFlightLocation,
  destination: BitFlightLocation
) => {
  const agent = createBitFlightAgent(fixture.world, fixture.safety, {
    waypointTolerance: 0.001
  });
  try {
    const accepted = agent.setRoute(
      start,
      destination,
      BIT_FLIGHT_SHORTEST_ROUTE_POLICY
    );
    let snapshot = agent.getSnapshot();
    let minimumHeight =
      snapshot.position?.y ?? Number.POSITIVE_INFINITY;
    let allCentersSafe =
      snapshot.position === null ||
      fixture.safety.isCenterSafe(snapshot.position);
    let updateCount = 0;
    while (
      accepted &&
      snapshot.state !== "arrived" &&
      snapshot.state !== "blocked" &&
      snapshot.state !== "unreachable" &&
      updateCount < 100
    ) {
      snapshot = updateAgent(agent, 1, 0.1);
      minimumHeight = Math.min(
        minimumHeight,
        snapshot.position?.y ?? Number.POSITIVE_INFINITY
      );
      allCentersSafe =
        allCentersSafe &&
        (snapshot.position === null ||
          fixture.safety.isCenterSafe(snapshot.position));
      updateCount += 1;
    }
    const destinationPosition = getBitFlightWorldPosition(destination);
    const remainingDistance = snapshot.position
      ? Vector3.Distance(snapshot.position, destinationPosition)
      : Number.POSITIVE_INFINITY;
    return Object.freeze({
      accepted,
      arrived: snapshot.state === "arrived",
      allCentersSafe,
      updateCount,
      minimumHeight,
      remainingDistance
    });
  } finally {
    agent.dispose();
  }
};

const followPreparedRouteAtRuntimeRate = (
  fixture: SurfaceVariantFixture,
  start: BitFlightLocation,
  route: BitFlightRoute,
  surfaceSpeedWorldUnitsPerSecond: number
) => {
  const agent = createBitFlightAgent(fixture.world, fixture.safety, {
    waypointTolerance: 0.03
  });
  try {
    const accepted = agent.setPreparedRoute(start, route, "verify");
    let snapshot = agent.getSnapshot();
    let updateCount = 0;
    while (
      accepted &&
      snapshot.state !== "arrived" &&
      snapshot.state !== "blocked" &&
      snapshot.state !== "unreachable" &&
      updateCount < 5_000
    ) {
      snapshot = updateAgent(
        agent,
        surfaceSpeedWorldUnitsPerSecond,
        1 / 60
      );
      updateCount += 1;
    }
    return Object.freeze({
      accepted,
      state: snapshot.state,
      updateCount
    });
  } finally {
    agent.dispose();
  }
};

const requireSurfaceStepForBand = (
  route: BitFlightRoute,
  targetBandRef: BitFlightBandRef
) => {
  const steps = route.steps.filter(
    (
      step
    ): step is Extract<BitFlightRouteStep, { kind: "surface" }> =>
      step.kind === "surface" &&
      step.band.zoneId === targetBandRef.zoneId &&
      step.band.bandId === targetBandRef.bandId
  );
  if (steps.length !== 1) {
    throw new Error(
      `指定飛行帯のsurface stepが1本ではありません: ${steps.length}`
    );
  }
  return steps[0];
};

const surfaceStepMatches = (
  actual: BitFlightSurfaceRouteStep,
  expected: BitFlightSurfaceRouteStep
) =>
  actual.points.length === expected.points.length &&
  actual.points.every((point, index) => {
    const expectedPoint = expected.points[index];
    return (
      point.surface.polygonRef === expectedPoint.surface.polygonRef &&
      Vector3.Distance(
        point.surface.position,
        expectedPoint.surface.position
      ) <= 1e-6
    );
  });

const executeTest = async (
  name: string,
  operation: () => Promise<Readonly<{ ok: boolean; detail: string }>>
): Promise<BitFlightSurfaceVariantTestResult> => {
  try {
    return Object.freeze({ name, ...(await operation()) });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const createPartialHeightColliders = (
  scene: Scene
): FixtureColliders => {
  const collider = MeshBuilder.CreateBox(
    "PartialHeightObstacle",
    { width: 0.3, height: 0.65, depth: 0.8 },
    scene
  );
  collider.position.set(0, 0.325, 0);
  return Object.freeze({
    movement: Object.freeze([collider]),
    ground: Object.freeze([])
  });
};

const createFullHeightColliders = (
  scene: Scene
): FixtureColliders => {
  const collider = MeshBuilder.CreateBox(
    "FullHeightObstacle",
    { width: 0.4, height: 2.2, depth: 1.2 },
    scene
  );
  collider.position.set(0, 1.1, 0);
  return Object.freeze({
    movement: Object.freeze([collider]),
    ground: Object.freeze([])
  });
};

const createLowCeilingColliders = (
  scene: Scene
): FixtureColliders => {
  const lowerFloor = MeshBuilder.CreateBox(
    "LowCeilingLowerFloor",
    { width: 2.5, height: 0.1, depth: 5 },
    scene
  );
  lowerFloor.position.set(-1.25, -0.05, 0);
  const raisedFloor = MeshBuilder.CreateBox(
    "LowCeilingRaisedFloor",
    { width: 2.5, height: 0.1, depth: 5 },
    scene
  );
  raisedFloor.position.set(1.25, -0.01, 0);
  const ceiling = MeshBuilder.CreateBox(
    "LowCeilingObstacle",
    { width: 1.2, height: 1.06, depth: 1.2 },
    scene
  );
  ceiling.position.set(0, 0.91, 0);
  return Object.freeze({
    movement: Object.freeze([lowerFloor, raisedFloor, ceiling]),
    ground: Object.freeze([lowerFloor, raisedFloor])
  });
};

const createThinFullHeightWallColliders = (
  scene: Scene
): FixtureColliders => {
  const floor = MeshBuilder.CreateBox(
    "ThinWallFloor",
    { width: 5, height: 0.1, depth: 5 },
    scene
  );
  floor.position.set(0, -0.05, 0);
  const wall = MeshBuilder.CreateBox(
    "ThinFullHeightWall",
    { width: 0.08, height: 1.6, depth: 1.2 },
    scene
  );
  wall.position.set(0, 0.8, 0);
  return Object.freeze({
    movement: Object.freeze([floor, wall]),
    ground: Object.freeze([floor])
  });
};

export const runBitFlightSurfaceVariantTests =
  async (): Promise<readonly BitFlightSurfaceVariantTestResult[]> => {
    await initializeNavigationRuntime();
    const results: BitFlightSurfaceVariantTestResult[] = [];

    results.push(
      await executeTest(
        "同帯直達下限はpolicyを1回だけ評価し同cost遷移より先に確定する",
        async () => {
          const fixture = await createFixture(
            createPlaneGeometry(),
            () =>
              Object.freeze({
                movement: Object.freeze([]),
                ground: Object.freeze([])
              }),
            equalCostTransitionDefinition,
            Object.freeze([bandRef, equalCostAlternateBandRef])
          );
          try {
            const start = projectRequired(fixture.world, -2, 0);
            const destination = projectRequired(fixture.world, 2, 0);
            const startPosition = getBitFlightWorldPosition(start);
            const destinationPosition =
              getBitFlightWorldPosition(destination);
            const directDistance = Vector3.Distance(
              startPosition,
              destinationPosition
            );
            const policyEvents: string[] = [];
            const directRoute = requireRoute(
              fixture.world.findRoute(
                start,
                destination,
                Object.freeze({
                  canUseTransition: (traversal) => {
                    policyEvents.push(
                      `can-transition:${traversal.transition.id}`
                    );
                    return true;
                  },
                  canUseRouteStep: (step) => {
                    policyEvents.push(
                      step.kind === "surface"
                        ? `can-step:surface:${step.band.zoneId}/${step.band.bandId}`
                        : `can-step:transition:${step.traversal.transition.id}`
                    );
                    return true;
                  },
                  additionalSurfaceCruiseHeights: () => {
                    policyEvents.push("additional-surface-height");
                    return Object.freeze([]);
                  },
                  additionalTransitionCost: (traversal) => {
                    policyEvents.push(
                      `additional-transition:${traversal.transition.id}`
                    );
                    return 0;
                  }
                })
              )
            );
            const directStep = requireOnlySurfaceStep(directRoute);

            const alternatePolicyEvaluations: string[] = [];
            const equalCostAlternateRoute = requireRoute(
              fixture.world.findRoute(
                start,
                destination,
                Object.freeze({
                  canUseTransition: () => true,
                  canUseRouteStep: (step) => {
                    if (
                      step.kind !== "surface" ||
                      step.band.zoneId !== bandRef.zoneId ||
                      step.band.bandId !== bandRef.bandId
                    ) {
                      return true;
                    }
                    const first = getBitFlightWorldPosition(step.points[0]);
                    const last = getBitFlightWorldPosition(
                      step.points[step.points.length - 1]
                    );
                    const allowed =
                      (first.x === startPosition.x &&
                        first.z === startPosition.z &&
                        last.x === -1 &&
                        last.z === 0) ||
                      (first.x === 1 &&
                        first.z === 0 &&
                        last.x === destinationPosition.x &&
                        last.z === destinationPosition.z);
                    alternatePolicyEvaluations.push(
                      `${step.band.bandId}:${first.x}/${first.y}/${first.z}>` +
                        `${last.x}/${last.y}/${last.z}:${allowed}`
                    );
                    return allowed;
                  },
                  additionalSurfaceCruiseHeights: () => Object.freeze([]),
                  additionalTransitionCost: () => 0
                })
              )
            );
            const alternateTransitionIds =
              equalCostAlternateRoute.steps.flatMap((step) =>
                step.kind === "transition"
                  ? [step.traversal.transition.id]
                  : []
              );
            return {
              ok:
                policyEvents.length === 1 &&
                policyEvents[0] ===
                  `can-step:surface:${bandRef.zoneId}/${bandRef.bandId}` &&
                directRoute.steps.length === 1 &&
                directStep.distance === directDistance &&
                directRoute.distance === directDistance &&
                directRoute.totalCost === directDistance &&
                alternateTransitionIds.join(",") ===
                  "equal-cost-enter-alternate,equal-cost-return-primary" &&
                approximately(
                  equalCostAlternateRoute.distance,
                  directDistance
                ) &&
                approximately(
                  equalCostAlternateRoute.totalCost,
                  directDistance
                ),
              detail:
                `events=${policyEvents.join(",")} / ` +
                `direct=${directStep.distance}/${directRoute.distance}/` +
                `${directRoute.totalCost} / ` +
                `alternate=${alternateTransitionIds.join(">")}/` +
                `${equalCostAlternateRoute.distance}/` +
                `${equalCostAlternateRoute.totalCost} / ` +
                `alternatePolicy=${alternatePolicyEvaluations.join(",")}`
            };
          } finally {
            disposeFixture(fixture);
          }
        }
      )
    );

    results.push(
      await executeTest(
        "部分高障害物では同じ2D経路の高高度候補を選びAgentが到着する",
        async () => {
          const fixture = await createFixture(
            createPlaneGeometry(),
            createPartialHeightColliders
          );
          try {
            const start = projectRequired(fixture.world, -2, 0);
            const destination = projectRequired(fixture.world, 2, 0);
            const evaluations: PolicyEvaluation[] = [];
            const route = requireRoute(
              fixture.world.findRoute(
                start,
                destination,
                createSafetyPolicy(fixture.safety, evaluations)
              )
            );
            const surfaceStep = requireOnlySurfaceStep(route);
            const heights = surfaceStep.points.map(
              (point) => point.safeCenterHeight
            );
            const directWasFirst =
              evaluations.length === 6 &&
              evaluations[0].safe === false &&
              evaluations[0].heights.every((height) =>
                approximately(height, navSurfaceHeight)
              );
            const selectedHighCruise =
              heights.length >= 4 &&
              approximately(heights[0], navSurfaceHeight) &&
              approximately(heights[heights.length - 1], navSurfaceHeight) &&
              heights
                .slice(1, -1)
                .every((height) => approximately(height, 0.9));
            const routeIsSafe = isSurfaceStepSafe(
              fixture.safety,
              surfaceStep
            );
            const agentResult = followRoute(fixture, start, route);
            return {
              ok:
                directWasFirst &&
                selectedHighCruise &&
                routeIsSafe &&
                agentResult.accepted &&
                agentResult.arrived &&
                agentResult.allCentersSafe &&
                agentResult.remainingDistance <= 0.001,
              detail:
                `evaluations=${evaluations
                  .map(
                    (evaluation) =>
                      `${evaluation.heights
                        .map((height) => height.toFixed(2))
                        .join("/")}:${evaluation.safe ? "safe" : "blocked"}`
                  )
                  .join(", ")} / selected=${heights
                  .map((height) => height.toFixed(2))
                  .join(" > ")} / agent=${agentResult.arrived ? "arrived" : "not-arrived"}`
            };
          } finally {
            disposeFixture(fixture);
          }
        }
      )
    );

    results.push(
      await executeTest(
        "全高障害物はNavMesh障害として水平迂回し高度候補を増やさない",
        async () => {
          const fixture = await createFixture(
            createBlockedGeometry(),
            createFullHeightColliders
          );
          try {
            const start = projectRequired(fixture.world, -2, 0);
            const destination = projectRequired(fixture.world, 2, 0);
            const evaluations: PolicyEvaluation[] = [];
            const route = requireRoute(
              fixture.world.findSurfaceRoute(
                start,
                destination,
                createSafetyPolicy(fixture.safety, evaluations)
              )
            );
            const surfaceStep = requireOnlySurfaceStep(route);
            const points = getSurfaceStepPositions(surfaceStep);
            const maximumDetour = Math.max(
              ...points.map((point) => Math.abs(point.z))
            );
            const routeIsSafe = isSurfaceStepSafe(
              fixture.safety,
              surfaceStep
            );
            const agentResult = followRoute(fixture, start, route);
            return {
              ok:
                evaluations.length === 1 &&
                evaluations[0].safe &&
                maximumDetour >= 1 &&
                routeIsSafe &&
                agentResult.accepted &&
                agentResult.arrived &&
                agentResult.allCentersSafe &&
                agentResult.remainingDistance <= 0.001,
              detail:
                `policyCalls=${evaluations.length} / max|z|=${maximumDetour.toFixed(3)} / ` +
                `points=${points.length} / agent=${agentResult.arrived ? "arrived" : "not-arrived"}`
            };
          } finally {
            disposeFixture(fixture);
          }
        }
      )
    );

    results.push(
      await executeTest(
        "複数polygonの中間点は許容距離内でも強制snapせず実速度で追従する",
        async () => {
          const fixture = await createFixture(
            createBlockedGeometry(),
            createFullHeightColliders
          );
          const surfaceSpeed = 0.25;
          const deltaSeconds = 1 / 60;
          const movementBudget = surfaceSpeed * deltaSeconds;
          // Recastの面内拘束による微小補正だけを許可し、0.03の中間点snapは許可しない。
          const navigationConstraintTolerance = 0.001;
          const agent = createBitFlightAgent(
            fixture.world,
            fixture.safety,
            { waypointTolerance: 0.03 }
          );
          try {
            const start = projectRequired(fixture.world, -2, 0);
            const destination = projectRequired(fixture.world, 2, 0);
            const route = requireRoute(
              fixture.world.findSurfaceRoute(
                start,
                destination,
                BIT_FLIGHT_SHORTEST_ROUTE_POLICY
              )
            );
            const surfaceStep = requireOnlySurfaceStep(route);
            const polygonRefs = new Set(
              surfaceStep.points.map((point) => point.surface.polygonRef)
            );
            const accepted = agent.setPreparedRoute(start, route, "verify");
            let snapshot = agent.getSnapshot();
            let previousPosition = snapshot.position?.clone() ?? null;
            let maximumSurfaceFrameMovement = 0;
            let surfaceFrameCount = 0;
            let updateCount = 0;
            while (
              accepted &&
              snapshot.state !== "arrived" &&
              snapshot.state !== "blocked" &&
              snapshot.state !== "unreachable" &&
              updateCount < 5_000
            ) {
              snapshot = updateAgent(agent, surfaceSpeed, deltaSeconds);
              if (
                previousPosition !== null &&
                snapshot.position !== null &&
                snapshot.state === "surface"
              ) {
                maximumSurfaceFrameMovement = Math.max(
                  maximumSurfaceFrameMovement,
                  Vector3.Distance(previousPosition, snapshot.position)
                );
                surfaceFrameCount += 1;
              }
              previousPosition = snapshot.position?.clone() ?? null;
              updateCount += 1;
            }
            return {
              ok:
                surfaceStep.points.length >= 4 &&
                polygonRefs.size >= 3 &&
                accepted &&
                snapshot.state === "arrived" &&
                surfaceFrameCount > 0 &&
                maximumSurfaceFrameMovement <=
                  movementBudget + navigationConstraintTolerance,
              detail:
                `points=${surfaceStep.points.length} / ` +
                `polygons=${polygonRefs.size} / ` +
                `state=${snapshot.state}:${updateCount} / ` +
                `maxSurfaceMove=${maximumSurfaceFrameMovement.toFixed(9)} / ` +
                `budget=${movementBudget.toFixed(9)}+` +
                `${navigationConstraintTolerance.toFixed(9)}`
            };
          } finally {
            agent.dispose();
            disposeFixture(fixture);
          }
        }
      )
    );

    results.push(
      await executeTest(
        "薄い全高壁では低天井巡航の根拠を認めない",
        async () => {
          const fixture = await createFixture(
            createPlaneGeometry(),
            createThinFullHeightWallColliders
          );
          try {
            const start = projectRequired(fixture.world, -2, 0);
            const destination = projectRequired(fixture.world, 2, 0);
            const unrestrictedRoute = requireRoute(
              fixture.world.findSurfaceRoute(
                start,
                destination,
                BIT_FLIGHT_SHORTEST_ROUTE_POLICY
              )
            );
            const unrestrictedStep =
              requireOnlySurfaceStep(unrestrictedRoute);
            const additionalHeights =
              fixture.safety.findLowCeilingCruiseHeights(
                unrestrictedStep,
                band
              );
            const evaluations: PolicyEvaluation[] = [];
            const safeRoute = fixture.world.findRoute(
              start,
              destination,
              createSafetyPolicy(fixture.safety, evaluations)
            );
            return {
              ok:
                additionalHeights.length === 0 &&
                evaluations.length === 6 &&
                evaluations.every(
                  (evaluation) => !evaluation.safe
                ) &&
                safeRoute === null,
              detail:
                `additional=${additionalHeights.length} / ` +
                `evaluations=${evaluations.length} / route=${safeRoute ? "found" : "none"}`
            };
          } finally {
            disposeFixture(fixture);
          }
        }
      )
    );

    results.push(
      await executeTest(
        "通常高度間の低天井区間を下限未満で往復しAgentが到着する",
        async () => {
          const fixture = await createFixture(
            createPlaneGeometry(),
            createLowCeilingColliders
          );
          try {
            const start = projectRequired(fixture.world, -2, 0);
            const destination = projectRequired(fixture.world, 2, 0);
            const evaluations: PolicyEvaluation[] = [];
            const route = requireRoute(
              fixture.world.findRoute(
                start,
                destination,
                createSafetyPolicy(fixture.safety, evaluations)
              )
            );
            const surfaceStep = requireOnlySurfaceStep(route);
            const expectedCruiseHeight =
              0.04 +
              BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS +
              BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS;
            const usesLowCeilingCruise =
              surfaceStep.points[0].heightMode === "band" &&
              surfaceStep.points[
                surfaceStep.points.length - 1
              ].heightMode === "band" &&
              surfaceStep.points
                .slice(1, -1)
                .every(
                  (point) =>
                    point.heightMode === "low-ceiling" &&
                    point.safeCenterHeight <
                      band.minimumCenterHeight
                );
            const usesMaximumPhysicalFloor =
              surfaceStep.points
                .slice(1, -1)
                .every((point) =>
                  approximately(
                    point.safeCenterHeight,
                    expectedCruiseHeight
                  )
                );
            const standardCandidatesBlocked =
              evaluations.length === 7 &&
              evaluations.slice(0, 6).every(
                (evaluation) => !evaluation.safe
              ) &&
              evaluations[6].safe;
            const forward = followDynamicRoute(
              fixture,
              start,
              destination
            );
            const reverse = followDynamicRoute(
              fixture,
              destination,
              start
            );
            return {
              ok:
                standardCandidatesBlocked &&
                usesLowCeilingCruise &&
                usesMaximumPhysicalFloor &&
                forward.accepted &&
                forward.arrived &&
                forward.allCentersSafe &&
                forward.minimumHeight < band.minimumCenterHeight &&
                forward.remainingDistance <= 0.001 &&
                reverse.accepted &&
                reverse.arrived &&
                reverse.allCentersSafe &&
                reverse.minimumHeight < band.minimumCenterHeight &&
                reverse.remainingDistance <= 0.001,
              detail:
                `evaluations=${evaluations
                  .map(
                    (evaluation) =>
                      `${evaluation.heights
                        .map((height) => height.toFixed(3))
                        .join("/")}:${evaluation.safe ? "safe" : "blocked"}`
                  )
                  .join(", ")} / forwardMin=${forward.minimumHeight.toFixed(3)} / ` +
                `forward=${forward.accepted}/${forward.arrived}/${forward.allCentersSafe}/` +
                `${forward.remainingDistance.toFixed(6)} / ` +
                `reverseMin=${reverse.minimumHeight.toFixed(3)} / ` +
                `reverse=${reverse.accepted}/${reverse.arrived}/${reverse.allCentersSafe}/` +
                `${reverse.remainingDistance.toFixed(6)}`
            };
          } finally {
            disposeFixture(fixture);
          }
        }
      )
    );

    results.push(
      await executeTest(
        "同じNavMesh始終点の高度違いは経路形状を共有しDetour再探索しない",
        async () => {
          const queryPrototype = NavMeshQuery.prototype;
          const originalFindPath = queryPrototype.findPath;
          let recastPathfindCount = 0;
          queryPrototype.findPath = function (
            this: NavMeshQuery,
            ...args: Parameters<NavMeshQuery["findPath"]>
          ) {
            recastPathfindCount += 1;
            return originalFindPath.apply(this, args);
          };
          let fixture: SurfaceVariantFixture | null = null;
          try {
            fixture = await createFixture(
              createBlockedGeometry(),
              createFullHeightColliders
            );
            const start = projectRequired(fixture.world, -2, 0);
            const destination = projectRequired(fixture.world, 2, 0);
            const baselineRoute = requireRoute(
              fixture.world.findSurfaceRoute(
                start,
                destination,
                BIT_FLIGHT_SHORTEST_ROUTE_POLICY
              )
            );
            const raisedStartPosition =
              getBitFlightWorldPosition(start);
            raisedStartPosition.y = 0.7;
            const raisedDestinationPosition =
              getBitFlightWorldPosition(destination);
            raisedDestinationPosition.y = 0.9;
            const raisedStart = fixture.world.applyHeightSelection(
              start,
              Object.freeze({
                center: raisedStartPosition,
                heightMode: "band" as const
              })
            );
            const raisedDestination =
              fixture.world.applyHeightSelection(
                destination,
                Object.freeze({
                  center: raisedDestinationPosition,
                  heightMode: "band" as const
                })
              );
            const raisedRoute = requireRoute(
              fixture.world.findSurfaceRoute(
                raisedStart,
                raisedDestination,
                BIT_FLIGHT_SHORTEST_ROUTE_POLICY
              )
            );
            const baselineStep = requireOnlySurfaceStep(baselineRoute);
            const raisedStep = requireOnlySurfaceStep(raisedRoute);
            const baselineSurfacePoints = baselineStep.points.map(
              (point) => point.surface
            );
            const raisedSurfacePoints = raisedStep.points.map(
              (point) => point.surface
            );
            const expectedPlanarPoints = Object.freeze([
              Object.freeze({ x: -2, z: 0 }),
              Object.freeze({
                x: -0.6500000953674316,
                z: 1.1500000953674316
              }),
              Object.freeze({
                x: 0.6499999761581421,
                z: 1.1500000953674316
              }),
              Object.freeze({ x: 2, z: 0 })
            ]);
            const baselineMatchesFixture =
              baselineSurfacePoints.length ===
                expectedPlanarPoints.length &&
              baselineSurfacePoints.every(
                (point, index) =>
                  approximately(
                    point.position.x,
                    expectedPlanarPoints[index].x
                  ) &&
                  approximately(
                    point.position.z,
                    expectedPlanarPoints[index].z
                  )
              );
            const raisedMatchesBaseline =
              raisedSurfacePoints.length ===
                baselineSurfacePoints.length &&
              raisedSurfacePoints.every(
                (point, index) =>
                  point.polygonRef ===
                    baselineSurfacePoints[index].polygonRef &&
                  Vector3.Distance(
                    point.position,
                    baselineSurfacePoints[index].position
                  ) <= 1e-9
              );
            return {
              ok:
                recastPathfindCount === 1 &&
                baselineMatchesFixture &&
                raisedMatchesBaseline &&
                approximately(
                  baselineStep.points[0].safeCenterHeight,
                  navSurfaceHeight
                ) &&
                approximately(
                  raisedStep.points[0].safeCenterHeight,
                  raisedStart.safeCenterHeight
                ) &&
                approximately(
                  raisedStep.points[
                    raisedStep.points.length - 1
                  ].safeCenterHeight,
                  raisedDestination.safeCenterHeight
                ),
              detail:
                `findPath=${recastPathfindCount} / ` +
                `points=${baselineSurfacePoints.length}/` +
                `${raisedSurfacePoints.length} / ` +
                `fixture=${baselineMatchesFixture} / ` +
                `shared=${raisedMatchesBaseline}`
            };
          } finally {
            queryPrototype.findPath = originalFindPath;
            if (fixture) {
              disposeFixture(fixture);
            }
          }
        }
      )
    );

    results.push(
      await executeTest(
        "恒久endpoint surface cacheは正逆を個別探索し方向依存polygonRefを保持する",
        async () => {
          const queryPrototype = NavMeshQuery.prototype;
          const originalFindPath = queryPrototype.findPath;
          const pathfindDirections: Array<readonly [number, number]> = [];
          let fixture: SurfaceVariantFixture | null = null;
          queryPrototype.findPath = function (
            this: NavMeshQuery,
            ...args: Parameters<NavMeshQuery["findPath"]>
          ) {
            pathfindDirections.push(Object.freeze([args[0], args[1]]));
            return originalFindPath.apply(this, args);
          };
          try {
            fixture = await createFixture(
              createBlockedGeometry(),
              createFullHeightColliders,
              directedEndpointCacheDefinition,
              Object.freeze([bandRef, directedCacheAlternateBandRef])
            );
            const primaryWest = projectRequired(fixture.world, -2.2, 0);
            const primaryEast = projectRequired(fixture.world, 2.2, 0);
            const alternateWest = projectRequired(
              fixture.world,
              -2,
              0,
              directedCacheAlternateBandRef
            );
            const alternateEast = projectRequired(
              fixture.world,
              2,
              0,
              directedCacheAlternateBandRef
            );
            const westPolygonRef = alternateWest.surface.polygonRef;
            const eastPolygonRef = alternateEast.surface.polygonRef;
            prepareBitFlightNavigationRouteCaches(fixture.world);
            const forwardEndpointPathfindCount =
              pathfindDirections.filter(
                ([startRef, destinationRef]) =>
                  startRef === westPolygonRef &&
                  destinationRef === eastPolygonRef
              ).length;
            const reverseEndpointPathfindCount =
              pathfindDirections.filter(
                ([startRef, destinationRef]) =>
                  startRef === eastPolygonRef &&
                  destinationRef === westPolygonRef
              ).length;
            const nativeForwardStep = requireOnlySurfaceStep(
              requireRoute(
                fixture.world.findSurfaceRoute(
                  alternateWest,
                  alternateEast,
                  BIT_FLIGHT_SHORTEST_ROUTE_POLICY
                )
              )
            );
            const nativeReverseStep = requireOnlySurfaceStep(
              requireRoute(
                fixture.world.findSurfaceRoute(
                  alternateEast,
                  alternateWest,
                  BIT_FLIGHT_SHORTEST_ROUTE_POLICY
                )
              )
            );
            const reverseCoordinatesMatch =
              nativeForwardStep.points.length ===
                nativeReverseStep.points.length &&
              nativeForwardStep.points.every((forwardPoint, index) => {
                const reversePoint =
                  nativeReverseStep.points[
                    nativeReverseStep.points.length - 1 - index
                  ];
                return (
                  Vector3.Distance(
                    forwardPoint.surface.position,
                    reversePoint.surface.position
                  ) <= 1e-6
                );
              });
            const directionDependentPolygonRefs =
              nativeForwardStep.points.length >= 3 &&
              nativeForwardStep.points.slice(1, -1).some(
                (forwardPoint, index) =>
                  forwardPoint.surface.polygonRef !==
                  nativeReverseStep.points[
                    nativeReverseStep.points.length - 2 - index
                  ].surface.polygonRef
              );

            const cacheRoutePolicy: BitFlightRoutePolicy = Object.freeze({
              ...BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
              canUseRouteStep: (step) => {
                if (
                  step.kind !== "surface" ||
                  step.band.bandId === directedCacheAlternateBandId
                ) {
                  return true;
                }
                const positions = getSurfaceStepPositions(step);
                return (
                  positions.every((position) => position.x <= -1.5) ||
                  positions.every((position) => position.x >= 1.5)
                );
              }
            });
            const forwardRoute = requireRoute(
              fixture.world.findRoute(
                primaryWest,
                primaryEast,
                cacheRoutePolicy
              )
            );
            const reverseRoute = requireRoute(
              fixture.world.findRoute(
                primaryEast,
                primaryWest,
                cacheRoutePolicy
              )
            );
            const pathfindCountAfterFirstPass = pathfindDirections.length;
            const repeatedForwardRoute = requireRoute(
              fixture.world.findRoute(
                primaryWest,
                primaryEast,
                cacheRoutePolicy
              )
            );
            const repeatedReverseRoute = requireRoute(
              fixture.world.findRoute(
                primaryEast,
                primaryWest,
                cacheRoutePolicy
              )
            );

            const cachedForwardStep = requireSurfaceStepForBand(
              forwardRoute,
              directedCacheAlternateBandRef
            );
            const cachedReverseStep = requireSurfaceStepForBand(
              reverseRoute,
              directedCacheAlternateBandRef
            );
            const repeatedCachedForwardStep = requireSurfaceStepForBand(
              repeatedForwardRoute,
              directedCacheAlternateBandRef
            );
            const repeatedCachedReverseStep = requireSurfaceStepForBand(
              repeatedReverseRoute,
              directedCacheAlternateBandRef
            );
            const forwardMatchesNative = surfaceStepMatches(
              cachedForwardStep,
              nativeForwardStep
            );
            const reverseMatchesNative = surfaceStepMatches(
              cachedReverseStep,
              nativeReverseStep
            );
            const repeatedCacheStable =
              surfaceStepMatches(
                repeatedCachedForwardStep,
                cachedForwardStep
              ) &&
              surfaceStepMatches(
                repeatedCachedReverseStep,
                cachedReverseStep
              ) &&
              pathfindDirections.length === pathfindCountAfterFirstPass;
            const runtimeRateResults = [
              followPreparedRouteAtRuntimeRate(
                fixture,
                primaryWest,
                forwardRoute,
                0.25
              ),
              followPreparedRouteAtRuntimeRate(
                fixture,
                primaryEast,
                reverseRoute,
                0.25
              ),
              followPreparedRouteAtRuntimeRate(
                fixture,
                primaryWest,
                forwardRoute,
                0.75
              ),
              followPreparedRouteAtRuntimeRate(
                fixture,
                primaryEast,
                reverseRoute,
                0.75
              )
            ];
            return {
              ok:
                reverseCoordinatesMatch &&
                directionDependentPolygonRefs &&
                forwardEndpointPathfindCount > 0 &&
                reverseEndpointPathfindCount > 0 &&
                forwardMatchesNative &&
                reverseMatchesNative &&
                repeatedCacheStable &&
                runtimeRateResults.every(
                  (result) => result.accepted && result.state === "arrived"
                ),
              detail:
                `points=${nativeForwardStep.points.length}/` +
                `${nativeReverseStep.points.length} / ` +
                `directedRefs=${directionDependentPolygonRefs} / ` +
                `findPath=${forwardEndpointPathfindCount}/` +
                `${reverseEndpointPathfindCount} / ` +
                `native=${forwardMatchesNative}/${reverseMatchesNative} / ` +
                `cache=${repeatedCacheStable} / ` +
                `agent=${runtimeRateResults
                  .map(
                    (result) =>
                      `${result.state}:${result.updateCount}`
                  )
                  .join(",")}`
            };
          } finally {
            queryPrototype.findPath = originalFindPath;
            if (fixture) {
              disposeFixture(fixture);
            }
          }
        }
      )
    );

    return Object.freeze(results);
  };
