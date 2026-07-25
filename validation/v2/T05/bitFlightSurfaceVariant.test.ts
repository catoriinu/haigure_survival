import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
  type Mesh
} from "@babylonjs/core";
import { exportNavMesh } from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

import { createBitFlightAgent } from "../../../src/world/bitFlightAgent";
import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  createBitFlightBandRef,
  createBitFlightNavigationWorld,
  getBitFlightWorldPosition,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightBand,
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
import {
  createStageSpatialQueries,
  type StageSpatialQueries
} from "../../../src/world/stageSpatialQueries";

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

const bakePayload = (geometry: NavGeometry): BitFlightNavMeshPayload => {
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
      zoneId,
      bandId,
      data: exportNavMesh(result.navMesh)
    });
  } finally {
    result.navMesh.destroy();
  }
};

const createFixture = async (
  geometry: NavGeometry,
  createColliders: (scene: Scene) => FixtureColliders
): Promise<SurfaceVariantFixture> => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const colliders = createColliders(scene);
  colliders.movement.forEach((collider) =>
    collider.computeWorldMatrix(true)
  );
  const queries = createStageSpatialQueries(scene, {
    movementColliders: Object.freeze({
      player: Object.freeze([]),
      npc: Object.freeze([]),
      bit: Object.freeze([...colliders.movement])
    }),
    groundColliders: Object.freeze([...colliders.ground]),
    beamBlockers: Object.freeze([]),
    sightBlockers: Object.freeze([]),
    volumes: Object.freeze([])
  });
  const world = await createBitFlightNavigationWorld(
    definition,
    Object.freeze([bakePayload(geometry)])
  );
  return Object.freeze({
    engine,
    scene,
    world,
    queries,
    safety: createBitFlightSafety(queries)
  });
};

const disposeFixture = (fixture: SurfaceVariantFixture) => {
  fixture.queries.dispose();
  fixture.world.dispose();
  fixture.scene.dispose();
  fixture.engine.dispose();
};

const projectRequired = (
  world: BitFlightNavigationWorld,
  x: number,
  z: number
) => {
  const location = world.projectPointInBand(
    bandRef,
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

const followRoute = (
  fixture: SurfaceVariantFixture,
  start: BitFlightLocation,
  route: BitFlightRoute
) => {
  const agent = createBitFlightAgent(fixture.world, fixture.safety, {
    waypointTolerance: 0.001
  });
  try {
    const accepted = agent.setPreparedRoute(start, route);
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
      snapshot = agent.update(1, 0.1);
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
      snapshot = agent.update(1, 0.1);
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

    return Object.freeze(results);
  };
