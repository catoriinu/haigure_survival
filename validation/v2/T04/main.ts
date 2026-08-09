import {
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  type SpriteManager
} from "@babylonjs/core";
import { exportNavMesh, NavMeshQuery } from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

import {
  createNavigationWorld,
  DISTANCE_NAVIGATION_ROUTE_POLICY,
  initializeNavigationRuntime,
  type NavigationLocation,
  type NavigationPath,
  type NavigationRouteCandidate,
  type NavigationRoutePolicy,
  type NavigationSurfaceStep,
  type NavigationWorld
} from "../../../src/world/navigationWorld";
import {
  createDynamicStageSpatialVariants,
  type DynamicStageSpatialActiveSet
} from "../../../src/world/dynamicStageSpatialVariants";
import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  getBitFlightWorldPosition,
  type BitFlightBandRef,
  type BitFlightRoutePolicy,
  type BitFlightTransition
} from "../../../src/world/bitFlightNavigation";
import {
  createBitFlightAgent,
  type BitFlightAgentState
} from "../../../src/world/bitFlightAgent";
import {
  BIT_FLIGHT_ENVELOPE_RADIUS_METERS,
  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
  createBitFlightSafety,
  type BitFlightSafety
} from "../../../src/world/bitFlightSafety";
import {
  createNavigationAgent,
  type NavigationAgentState
} from "../../../src/world/navigationAgent";
import {
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH
} from "../../../src/game/characterSprites";
import {
  SCHOOL_STAGE,
  type StageCatalogEntry
} from "../../../src/world/stageCatalog";
import {
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicSpatialInitializer
} from "../../../src/world/schoolStageDynamicRuntime";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import type {
  StageLinkKind,
  StageLinkPair,
  StageMoverKind
} from "../../../src/world/stageLinks";
import {
  createStageSpawnSampler,
  createStageVolumeSpawnSampler,
  type StageVolumeSpawnSampler
} from "../../../src/world/stageSpawnSampler";
import {
  createStageBoundaryContainsQuery,
  createStageSpatialQueries,
  type StageVolume
} from "../../../src/world/stageSpatialQueries";
import {
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS
} from "../../../src/v2/alarmSystem";
import { createV2AlertCoordinator } from "../../../src/v2/alertCoordinator";
import { createV2BitSystem } from "../../../src/v2/bitSystem";
import {
  V2_NPC_CAPTURE_RADIUS,
  createV2NpcSystem,
  type V2NpcNavigationRouteContext
} from "../../../src/v2/npcSystem";
import { createDefaultV2CharacterVisualRuntime } from "../characterVisualFixture";
import { createV2TargetNavigationAreaTracker } from "../../../src/v2/pursuitNavigation";
import {
  castV2BeamSegment,
  castV2SightSegment,
  createV2BeamSystem
} from "../../../src/v2/beamCollision";
import {
  isV2AliveState,
  isV2BrainwashState,
  type V2BeamTargetPolicy,
  type V2CharacterState,
  type V2HumanKind,
  type V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import { runDynamicStageSpatialAcceptance } from "./dynamicStageSpatialAcceptance";
import { runDynamicInteractionAcceptance } from "./dynamicInteractionAcceptance";
import { runDynamicAssetRegistryAcceptance } from "./dynamicAssetRegistryAcceptance";
import { runHumanNavTileAcceptance } from "./humanNavTileAcceptance";

import "./style.css";

type ValidationCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const ALIVE_HUMANS_BEAM_POLICY: V2BeamTargetPolicy = Object.freeze({
  kind: "alive-humans"
});

const SURFACE_ONLY_NAVIGATION_ROUTE_POLICY: NavigationRoutePolicy =
  Object.freeze({
    selectRoute: (candidates) =>
      candidates.find((candidate) => candidate.kind === "surface") ??
      null
  });

const selectDistanceNavigationRoute = (
  _context: V2NpcNavigationRouteContext,
  candidates: readonly NavigationRouteCandidate[]
) => DISTANCE_NAVIGATION_ROUTE_POLICY.selectRoute(candidates);

const selectSurfaceNavigationRoute = (
  _context: V2NpcNavigationRouteContext,
  candidates: readonly NavigationRouteCandidate[]
) =>
  SURFACE_ONLY_NAVIGATION_ROUTE_POLICY.selectRoute(candidates);

const createHumanTargetFixture = (
  id: string,
  kind: V2HumanKind,
  footPosition: Vector3,
  aimPosition: Vector3,
  state: V2CharacterState = "normal"
): V2HumanTargetSnapshot =>
  Object.freeze({
    id,
    kind,
    footPosition,
    aimPosition,
    hitShape: Object.freeze({
      center: footPosition.add(new Vector3(0, PLAYER_SPRITE_HEIGHT * 0.5, 0)),
      radii: new Vector3(
        PLAYER_SPRITE_WIDTH * 0.5,
        PLAYER_SPRITE_HEIGHT * 0.5,
        PLAYER_SPRITE_WIDTH * 0.5
      )
    }),
    state,
    alive: isV2AliveState(state),
    brainwashed: isV2BrainwashState(state)
  });

const createTargetNavigationAreaSnapshot = (
  target: V2HumanTargetSnapshot,
  areaId: string,
  revision = 0
) =>
  Object.freeze({
    targetId: target.id,
    areaId,
    revision,
    anchor: target.footPosition.clone()
  });

const resolveTargetNavigationAreaSnapshot = (
  stage: StageSpatialContext,
  target: V2HumanTargetSnapshot
) =>
  createTargetNavigationAreaSnapshot(
    target,
    stage.navigationAreas.locate(target.footPosition).areaId
  );

const createBeamTargetFixture = (
  id: string,
  kind: V2HumanKind,
  center: Vector3,
  radii: Vector3
): V2HumanTargetSnapshot =>
  Object.freeze({
    id,
    kind,
    footPosition: center.add(new Vector3(0, -radii.y, 0)),
    aimPosition: center.clone(),
    hitShape: Object.freeze({
      center,
      radii
    }),
    state: "normal",
    alive: true,
    brainwashed: false
  });

type NavigationRuntime = Readonly<{
  navigationWorld: NavigationWorld;
  restoredNavigationWorld: NavigationWorld;
  pathMeshes: readonly Mesh[];
  data: Uint8Array;
}>;

type NavGeometry = Readonly<{
  positions: readonly number[];
  indices: readonly number[];
}>;

type SceneResourceCounts = Readonly<{
  meshes: number;
  materials: number;
  transformNodes: number;
  textures: number;
  spriteManagers: number;
}>;

const SCHOOL_VALIDATION_STAGE: StageCatalogEntry = Object.freeze({
  ...SCHOOL_STAGE,
  glbUrl: "b02_school_blockout.glb",
  navmeshUrl: "b02_school_blockout.navmesh.bin",
  bitNavmeshUrl: "b02_school_blockout.bit-flight.navmesh.bin",
  roomVariantNavmesh: Object.freeze({
    mode: "required",
    url: "b02_school_blockout.room-variants.navmesh.bin",
    sha256: "4b5a584b9ba15dba73d55924b91320475d51ee8dcfc951a06822e08bedd52e43"
  })
});

const blenderPointToBabylon = (point: Vector3) =>
  new Vector3(
    -point.x * BLENDER_METERS_TO_WORLD_UNITS,
    point.z * BLENDER_METERS_TO_WORLD_UNITS,
    -point.y * BLENDER_METERS_TO_WORLD_UNITS
  );

const canvas = document.getElementById("render-canvas") as unknown as HTMLCanvasElement;
const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults = document.querySelector<HTMLOListElement>("#check-results");
const runButton = document.querySelector<HTMLButtonElement>("#run-validation");
const downloadButton = document.querySelector<HTMLButtonElement>("#download-navmesh");

if (!canvas || !summary || !metrics || !checkResults || !runButton || !downloadButton) {
  throw new Error("T04検証UIの必須要素がありません。");
}

const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor.set(0.025, 0.07, 0.052, 1);

const camera = new ArcRotateCamera(
  "T04Camera",
  -Math.PI / 2.4,
  Math.PI / 3.1,
  8,
  new Vector3(1, 0, 0),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 3;
camera.upperRadiusLimit = 14;

const light = new HemisphericLight("T04Light", new Vector3(0.4, 1, -0.2), scene);
light.intensity = 0.9;

const sourceMaterial = new StandardMaterial("NavSourceMaterial", scene);
sourceMaterial.diffuseColor = new Color3(0.16, 0.34, 0.27);
sourceMaterial.specularColor = Color3.Black();

const blockerMaterial = new StandardMaterial("NavBlockerMaterial", scene);
blockerMaterial.diffuseColor = new Color3(0.5, 0.2, 0.18);
blockerMaterial.specularColor = Color3.Black();

const createGround = (name: string, width: number, height: number, position: Vector3) => {
  const mesh = MeshBuilder.CreateGround(name, { width, height }, scene);
  mesh.position.copyFrom(position);
  mesh.material = sourceMaterial;
  return mesh;
};

createGround("NAV_Walkable_LowerSouth", 4, 1.95, new Vector3(2, 0, -1.025));
createGround("NAV_Walkable_LowerNorth", 4, 1.95, new Vector3(2, 0, 1.025));
createGround("NAV_Walkable_Doorway", 0.45, 0.1, new Vector3(0.575, 0, 0));
createGround("NAV_Walkable_DisconnectedIsland", 1, 1, new Vector3(-6.5, 0, -1.5));
createGround("NAV_Walkable_StackedLower", 1, 1, new Vector3(-9.5, 0, -1.5));
createGround("NAV_Walkable_StackedUpper", 1, 1, new Vector3(-9.5, 0.8, -1.5));
createGround("NAV_Walkable_WindowIsland", 1, 1, new Vector3(5.5, 0, -1.5));

const createValidationLinkPair = (
  id: string,
  kind: StageLinkKind,
  endpointAPosition: Vector3,
  endpointBPosition: Vector3,
  bidirectional = true
): StageLinkPair => {
  const endpointANode = new TransformNode(`LNK_${id}_A`, scene);
  const endpointBNode = new TransformNode(`LNK_${id}_B`, scene);
  endpointANode.position.copyFrom(endpointAPosition);
  endpointBNode.position.copyFrom(endpointBPosition);
  return Object.freeze({
    id,
    kind,
    bidirectional,
    radiusMeters: 0.54,
    endpointA: Object.freeze({
      endpoint: "A" as const,
      position: endpointAPosition.clone(),
      node: endpointANode
    }),
    endpointB: Object.freeze({
      endpoint: "B" as const,
      position: endpointBPosition.clone(),
      node: endpointBNode
    })
  });
};

const rampLength = Math.hypot(1, 0.25);
const ramp = createGround("NAV_Walkable_Ramp", rampLength, 0.5, new Vector3(-0.5, 0.125, -1.75));
ramp.rotation.z = -Math.atan2(0.25, 1);
createGround("NAV_Walkable_UpperFloor", 1, 0.5, new Vector3(-1.5, 0.25, -1.75));

const createBarrier = (name: string, width: number, centerX: number) => {
  const mesh = MeshBuilder.CreateBox(name, { width, height: 0.6, depth: 0.1 }, scene);
  mesh.position.set(centerX, 0.3, 0);
  mesh.material = blockerMaterial;
};

createBarrier("NAV_Blocker_WallWest", 3.2, 2.4);
createBarrier("NAV_Blocker_WallEast", 0.35, 0.175);

const createNavigationGeometry = (): NavGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];

  const appendWalkableQuad = (
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    minY: number,
    maxY: number
  ) => {
    const vertexOffset = positions.length / 3;
    positions.push(
      minX, minY, minZ,
      maxX, maxY, minZ,
      maxX, maxY, maxZ,
      minX, minY, maxZ
    );
    indices.push(
      vertexOffset, vertexOffset + 3, vertexOffset + 2,
      vertexOffset, vertexOffset + 2, vertexOffset + 1
    );
  };

  appendWalkableQuad(-4, 0, -2, -0.05, 0, 0);
  appendWalkableQuad(-4, 0, 0.05, 2, 0, 0);
  appendWalkableQuad(-0.8, -0.35, -0.05, 0.05, 0, 0);
  appendWalkableQuad(0, 1, -2, -1.5, 0, 0.25);
  appendWalkableQuad(1, 2, -2, -1.5, 0.25, 0.25);
  appendWalkableQuad(6, 7, -2, -1, 0, 0);
  appendWalkableQuad(9, 10, -2, -1, 0, 0);
  appendWalkableQuad(9, 10, -2, -1, 0.8, 0.8);
  appendWalkableQuad(-6, -5, -2, -1, 0, 0);

  return { positions, indices };
};

const navGeometry = createNavigationGeometry();
const navParameters = {
  cs: 0.025,
  ch: 0.0125,
  walkableSlopeAngle: 45,
  walkableHeight: 34,
  walkableClimb: 3,
  walkableRadius: 4,
  maxEdgeLen: 12,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1
};

const navigationAgentConfig = Object.freeze({
  projectionMaxDistance: 0.1,
  waypointTolerance: 0.001,
  stuckDistanceThreshold: 0.01,
  stuckDurationSeconds: 0.5
});

let navigationRuntime: NavigationRuntime | null = null;

const disposeNavigationRuntime = () => {
  if (!navigationRuntime) {
    return;
  }
  navigationRuntime.pathMeshes.forEach((mesh) => mesh.dispose());
  navigationRuntime.navigationWorld.dispose();
  navigationRuntime.restoredNavigationWorld.dispose();
  navigationRuntime = null;
};

const pathsEqual = (left: readonly Vector3[], right: readonly Vector3[]) =>
  left.length === right.length &&
  left.every((point, index) => Vector3.Distance(point, right[index]) <= 1e-5);

const getNavigationPathPoints = (
  path: NavigationPath | null
): readonly Vector3[] =>
  path
    ? Object.freeze(
        path.steps.flatMap((step) =>
          step.kind === "surface"
            ? step.points.map((location) => location.position)
            : []
        )
      )
    : Object.freeze([]);

const measurePathDistance = (points: readonly Vector3[]) =>
  points.slice(1).reduce(
    (distance, point, index) =>
      distance + Vector3.Distance(points[index], point),
    0
  );

const blenderBoundsToBabylon = (minimum: Vector3, maximum: Vector3) => {
  const first = blenderPointToBabylon(minimum);
  const second = blenderPointToBabylon(maximum);
  return {
    minimum: new Vector3(
      Math.min(first.x, second.x),
      Math.min(first.y, second.y),
      Math.min(first.z, second.z)
    ),
    maximum: new Vector3(
      Math.max(first.x, second.x),
      Math.max(first.y, second.y),
      Math.max(first.z, second.z)
    )
  };
};

const segmentIntersectsBounds = (
  start: Vector3,
  end: Vector3,
  bounds: Readonly<{ minimum: Vector3; maximum: Vector3 }>
) => {
  let minimumParameter = 0;
  let maximumParameter = 1;
  for (const axis of ["x", "y", "z"] as const) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) <= Number.EPSILON) {
      if (
        start[axis] < bounds.minimum[axis] ||
        start[axis] > bounds.maximum[axis]
      ) {
        return false;
      }
      continue;
    }
    let entry = (bounds.minimum[axis] - start[axis]) / delta;
    let exit = (bounds.maximum[axis] - start[axis]) / delta;
    if (entry > exit) {
      [entry, exit] = [exit, entry];
    }
    minimumParameter = Math.max(minimumParameter, entry);
    maximumParameter = Math.min(maximumParameter, exit);
    if (minimumParameter > maximumParameter) {
      return false;
    }
  }
  return true;
};

const pathPassesBounds = (
  points: readonly Vector3[],
  bounds: Readonly<{ minimum: Vector3; maximum: Vector3 }>
) =>
  points.some(
    (point, index) =>
      index > 0 && segmentIntersectsBounds(points[index - 1], point, bounds)
  );

const findNavigationPath = (
  navigation: NavigationWorld,
  start: Vector3,
  destination: Vector3,
  moverKind: "player" | "npc" | "bit" = "npc",
  projectionMaxDistance = 0.1
) => {
  const startLocation = navigation.projectPoint(start, projectionMaxDistance);
  const destinationLocation = navigation.projectPoint(
    destination,
    projectionMaxDistance
  );
  return startLocation && destinationLocation
    ? navigation.findPath(
        startLocation,
        destinationLocation,
        moverKind,
        DISTANCE_NAVIGATION_ROUTE_POLICY
      )
    : null;
};

const findSurfaceNavigationPath = (
  navigation: NavigationWorld,
  start: Vector3,
  destination: Vector3,
  moverKind: "player" | "npc" = "npc",
  projectionMaxDistance = 0.1
) => {
  const startLocation = navigation.projectPoint(
    start,
    projectionMaxDistance
  );
  const destinationLocation = navigation.projectPoint(
    destination,
    projectionMaxDistance
  );
  return startLocation && destinationLocation
    ? navigation.findPath(
        startLocation,
        destinationLocation,
        moverKind,
        SURFACE_ONLY_NAVIGATION_ROUTE_POLICY
      )
    : null;
};

const requireNavigationLocation = (
  navigation: NavigationWorld,
  position: Vector3,
  maxDistance = 0.1
): NavigationLocation => {
  const location = navigation.projectPoint(position, maxDistance);
  if (!location) {
    throw new Error(`検証位置をNavMeshへ投影できません: ${position.toString()}`);
  }
  return location;
};

type NavigationAgentRouteAcceptance = Readonly<{
  deltaSeconds: number;
  pathPointCount: number;
  maximumSurfacePathPointCount: number;
  onlyUsesSurfaceSteps: boolean;
  finalState: NavigationAgentState;
  reached: boolean;
  updateCount: number;
  updateLimit: number;
  horizontalMovementDistanceViolationCount: number;
  maximumHorizontalMovementDistance: number;
  maximumHorizontalMovementDistanceExcess: number;
  endpointError: number;
}>;

const schoolNpcNavigationAgentConfig = Object.freeze({
  projectionMaxDistance: 0.75,
  waypointTolerance: 0.02,
  stuckDistanceThreshold: 0.005,
  stuckDurationSeconds: 1
});
const schoolNpcChaseSpeed = 0.3;
const navigationPathPointCapacity = 4096;

const executeNavigationAgentRouteAcceptance = (
  navigation: NavigationWorld,
  start: Vector3,
  destination: Vector3,
  deltaSeconds: number
): NavigationAgentRouteAcceptance => {
  const path = findNavigationPath(
    navigation,
    start,
    destination,
    "npc",
    schoolNpcNavigationAgentConfig.projectionMaxDistance
  );
  const pathPoints = getNavigationPathPoints(path);
  const maximumSurfacePathPointCount =
    path?.steps.reduce(
      (maximum, step) =>
        step.kind === "surface"
          ? Math.max(maximum, step.points.length)
          : maximum,
      0
    ) ?? 0;
  const projectedDestination = navigation.projectPoint(
    destination,
    schoolNpcNavigationAgentConfig.projectionMaxDistance
  );
  let location = requireNavigationLocation(
    navigation,
    start,
    schoolNpcNavigationAgentConfig.projectionMaxDistance
  );
  const agent = createNavigationAgent(
    navigation,
    "npc",
    DISTANCE_NAVIGATION_ROUTE_POLICY,
    schoolNpcNavigationAgentConfig
  );
  const movementBudget = schoolNpcChaseSpeed * deltaSeconds;
  const updateLimit =
    path === null
      ? 1
      : Math.ceil(path.distance / movementBudget) + pathPoints.length + 256;
  let finalState: NavigationAgentState = "moving";
  let updateCount = 0;
  let horizontalMovementDistanceViolationCount = 0;
  let maximumHorizontalMovementDistance = 0;
  let maximumHorizontalMovementDistanceExcess = 0;
  try {
    while (finalState === "moving" && updateCount < updateLimit) {
      const previousPosition = location.position;
      const result = agent.update(
        location,
        destination,
        0,
        schoolNpcChaseSpeed,
        deltaSeconds,
        true
      );
      const horizontalMovementDistance = Math.hypot(
        result.location.position.x - previousPosition.x,
        result.location.position.z - previousPosition.z
      );
      maximumHorizontalMovementDistance = Math.max(
        maximumHorizontalMovementDistance,
        horizontalMovementDistance
      );
      maximumHorizontalMovementDistanceExcess = Math.max(
        maximumHorizontalMovementDistanceExcess,
        horizontalMovementDistance - movementBudget
      );
      if (
        horizontalMovementDistance >
        movementBudget +
          schoolNpcNavigationAgentConfig.waypointTolerance +
          1e-6
      ) {
        horizontalMovementDistanceViolationCount += 1;
      }
      location = result.location;
      finalState = result.state;
      updateCount += 1;
    }
  } finally {
    agent.clear();
  }
  const endpointError = projectedDestination
    ? Vector3.Distance(location.position, projectedDestination.position)
    : Number.POSITIVE_INFINITY;
  return Object.freeze({
    deltaSeconds,
    pathPointCount: pathPoints.length,
    maximumSurfacePathPointCount,
    onlyUsesSurfaceSteps:
      path !== null && path.steps.every((step) => step.kind === "surface"),
    finalState,
    reached:
      finalState === "arrived" &&
      endpointError <= schoolNpcNavigationAgentConfig.waypointTolerance + 1e-6,
    updateCount,
    updateLimit,
    horizontalMovementDistanceViolationCount,
    maximumHorizontalMovementDistance,
    maximumHorizontalMovementDistanceExcess,
    endpointError
  });
};

const projectBitTransitionEndpoint = (
  context: StageSpatialContext,
  transition: BitFlightTransition,
  endpoint: "from" | "to"
) => {
  const ref: BitFlightBandRef =
    endpoint === "from" ? transition.from : transition.to;
  const authoredPosition =
    endpoint === "from"
      ? transition.fromPosition
      : transition.toPosition;
  const band = context.bitNavigation.getBand(ref);
  if (!band) {
    throw new Error(
      `飛行遷移${transition.id}の${endpoint}飛行帯がありません。`
    );
  }
  const position = authoredPosition.clone();
  position.y = Math.min(
    band.maximumCenterHeight,
    Math.max(band.minimumCenterHeight, position.y)
  );
  const location = context.bitNavigation.projectPointInBand(
    ref,
    position,
    3 * BLENDER_METERS_TO_WORLD_UNITS
  );
  if (!location) {
    throw new Error(
      `飛行遷移${transition.id}の${endpoint}端点を投影できません。`
    );
  }
  return location;
};

const findBitTransitionRoute = (
  context: StageSpatialContext,
  transition: BitFlightTransition,
  reversed = false
) => {
  const from = projectBitTransitionEndpoint(
    context,
    transition,
    reversed ? "to" : "from"
  );
  const to = projectBitTransitionEndpoint(
    context,
    transition,
    reversed ? "from" : "to"
  );
  return context.bitNavigation.findRoute(
    from,
    to,
    BIT_FLIGHT_SHORTEST_ROUTE_POLICY
  );
};

type BitTransitionAgentAcceptance = Readonly<{
  transitionId: string;
  reversed: boolean;
  targetTraversalUnique: boolean;
  routeAccepted: boolean;
  arrived: boolean;
  passedTargetTransition: boolean;
  finalBandMatches: boolean;
  allTicksSafe: boolean;
  updateCount: number;
  finalState: BitFlightAgentState;
}>;

const didBitTransitionAgentPass = (
  result: BitTransitionAgentAcceptance
) =>
  result.targetTraversalUnique &&
  result.routeAccepted &&
  result.arrived &&
  result.passedTargetTransition &&
  result.finalBandMatches &&
  result.allTicksSafe;

const describeBitTransitionAgentFailure = (
  result: BitTransitionAgentAcceptance
) =>
  `${result.transitionId}:${result.reversed ? "reverse" : "forward"}` +
  `(state=${result.finalState},unique=${result.targetTraversalUnique},` +
  `route=${result.routeAccepted},` +
  `transition=${result.passedTargetTransition},` +
  `band=${result.finalBandMatches},safe=${result.allTicksSafe},` +
  `ticks=${result.updateCount})`;

const executeBitTransitionAgentAcceptance = (
  context: StageSpatialContext,
  safety: BitFlightSafety,
  transition: BitFlightTransition,
  reversed: boolean
): BitTransitionAgentAcceptance => {
  const start = projectBitTransitionEndpoint(
    context,
    transition,
    reversed ? "to" : "from"
  );
  const destination = projectBitTransitionEndpoint(
    context,
    transition,
    reversed ? "from" : "to"
  );
  const expectedDestination = reversed ? transition.from : transition.to;
  const agent = createBitFlightAgent(
    context.bitNavigation,
    safety,
    Object.freeze({ waypointTolerance: 0.001 })
  );
  let passedTargetTransition = false;
  let allTicksSafe = safety.isCenterSafe(
    getBitFlightWorldPosition(start)
  );
  let rootPosition = getBitFlightWorldPosition(start);
  let updateCount = 0;
  let finalSnapshot = agent.getSnapshot();
  try {
    const policy: BitFlightRoutePolicy = Object.freeze({
      canUseTransition: (traversal) =>
        traversal.transition.id === transition.id &&
        traversal.reversed === reversed,
      canUseRouteStep: () => true,
      additionalSurfaceCruiseHeights: () => Object.freeze([]),
      additionalTransitionCost: () => 0
    });
    const matchingTraversals = context.bitNavigation
      .getTransitionsFrom(start)
      .filter(
        (traversal) =>
          traversal.transition.id === transition.id &&
          traversal.reversed === reversed
      );
    const targetTraversalUnique = matchingTraversals.length === 1;
    const preparedRoute = targetTraversalUnique
      ? context.bitNavigation.findRouteThroughTransition(
          start,
          matchingTraversals[0],
          destination,
          policy
        )
      : null;
    const routeAccepted =
      preparedRoute !== null &&
      agent.setPreparedRoute(start, preparedRoute, "verify");
    finalSnapshot = agent.getSnapshot();
    while (
      routeAccepted &&
      finalSnapshot.state !== "arrived" &&
      finalSnapshot.state !== "blocked" &&
      finalSnapshot.state !== "unreachable" &&
      updateCount < 60
    ) {
      const updateResult = agent.update(
        2 * BLENDER_METERS_TO_WORLD_UNITS,
        1,
        rootPosition,
        (candidate) => {
          if (!candidate.position) {
            throw new Error("更新後のBIT飛行位置がありません。");
          }
          return candidate.position;
        }
      );
      finalSnapshot = updateResult;
      if (updateResult.rootPosition) {
        rootPosition = updateResult.rootPosition;
      }
      updateCount += 1;
      if (
        (finalSnapshot.transition?.transition.id === transition.id &&
          finalSnapshot.transition.reversed === reversed) ||
        (finalSnapshot.location?.zoneId ===
          expectedDestination.zoneId &&
          finalSnapshot.location.bandId ===
            expectedDestination.bandId)
      ) {
        passedTargetTransition = true;
      }
      if (finalSnapshot.position) {
        allTicksSafe =
          allTicksSafe &&
          safety.isCenterSafe(finalSnapshot.position);
      }
    }
    return Object.freeze({
      transitionId: transition.id,
      reversed,
      targetTraversalUnique,
      routeAccepted,
      arrived: finalSnapshot.state === "arrived",
      passedTargetTransition,
      finalBandMatches:
        finalSnapshot.location?.zoneId === expectedDestination.zoneId &&
        finalSnapshot.location.bandId === expectedDestination.bandId,
      allTicksSafe,
      updateCount,
      finalState: finalSnapshot.state
    });
  } finally {
    agent.dispose();
  }
};

const countSceneResources = (targetScene: Scene): SceneResourceCounts => ({
  meshes: targetScene.meshes.length,
  materials: targetScene.materials.length,
  transformNodes: targetScene.transformNodes.length,
  textures: targetScene.textures.filter(
    (texture) => texture !== targetScene.environmentBRDFTexture
  ).length,
  spriteManagers: targetScene.spriteManagers?.length ?? 0
});

const sceneResourceCountsEqual = (
  left: SceneResourceCounts,
  right: SceneResourceCounts
) =>
  left.meshes === right.meshes &&
  left.materials === right.materials &&
  left.transformNodes === right.transformNodes &&
  left.textures === right.textures &&
  left.spriteManagers === right.spriteManagers;

const createProjectionNavigationStub = (
  projectPoint: NavigationWorld["projectPoint"]
): NavigationWorld => ({
  getSurfaceTriangles: () => Object.freeze([]),
  projectPoint,
  findSurfacePath: () => {
    throw new Error(
      "spawn sampler検証ではfindSurfacePathを呼び出しません。"
    );
  },
  findPath: () => {
    throw new Error("spawn sampler検証ではfindPathを呼び出しません。");
  },
  constrainMovement: () => {
    throw new Error("spawn sampler検証ではconstrainMovementを呼び出しません。");
  },
  randomPointAround: () => {
    throw new Error("spawn sampler検証ではrandomPointAroundを呼び出しません。");
  },
  createDebugMesh: () => {
    throw new Error("spawn sampler検証ではcreateDebugMeshを呼び出しません。");
  },
  dispose: () => {}
});

const cloneFixtureNavigationLocation = (
  location: NavigationLocation
): NavigationLocation =>
  Object.freeze({
    position: location.position.clone(),
    polygonRef: location.polygonRef
  });

const createNavigationAgentConstraintStub = (
  projectedTarget: NavigationLocation,
  constrainedLocation: NavigationLocation,
  onConstrainDestination: (destination: Vector3) => void
): NavigationWorld =>
  Object.freeze({
    getSurfaceTriangles: () => Object.freeze([]),
    projectPoint: () => cloneFixtureNavigationLocation(projectedTarget),
    findSurfacePath: (
      start: NavigationLocation,
      destination: NavigationLocation
    ) =>
      Object.freeze({
        kind: "surface" as const,
        points: Object.freeze([
          cloneFixtureNavigationLocation(start),
          cloneFixtureNavigationLocation(destination)
        ]),
        distance: Vector3.Distance(start.position, destination.position)
      }),
    findPath: (
      start: NavigationLocation,
      destination: NavigationLocation
    ) => {
      const surfaceStep = Object.freeze({
        kind: "surface" as const,
        points: Object.freeze([
          cloneFixtureNavigationLocation(start),
          cloneFixtureNavigationLocation(destination)
        ]),
        distance: Vector3.Distance(start.position, destination.position)
      });
      return Object.freeze({
        steps: Object.freeze([surfaceStep]),
        destination: cloneFixtureNavigationLocation(destination),
        distance: surfaceStep.distance
      });
    },
    constrainMovement: (
      _start: NavigationLocation,
      destination: Vector3
    ) => {
      onConstrainDestination(destination.clone());
      return cloneFixtureNavigationLocation(constrainedLocation);
    },
    randomPointAround: () => {
      throw new Error(
        "NavigationAgent移動拘束検証ではrandomPointAroundを呼び出しません。"
      );
    },
    createDebugMesh: () => {
      throw new Error(
        "NavigationAgent移動拘束検証ではcreateDebugMeshを呼び出しません。"
      );
    },
    dispose: () => {}
  });

const createRandomSequence = (values: readonly number[]) => {
  let callCount = 0;
  return {
    random: () => {
      if (callCount >= values.length) {
        throw new Error("spawn sampler検証用乱数列を使い切りました。");
      }
      const value = values[callCount];
      callCount += 1;
      return value;
    },
    getCallCount: () => callCount
  };
};

const createSeededCountingRandom = (
  initialState: number,
  injectedFailure: Readonly<{
    call: number;
    error: Error;
    beforeThrow?: () => void;
  }> | null = null
) => {
  let state = initialState >>> 0;
  let callCount = 0;
  return {
    random: () => {
      callCount += 1;
      if (injectedFailure && callCount === injectedFailure.call) {
        injectedFailure.beforeThrow?.();
        throw injectedFailure.error;
      }
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    getCallCount: () => callCount
  };
};

const createAreaTargetedSpawnRandom = (
  sampler: Pick<StageVolumeSpawnSampler, "areas" | "totalArea">,
  targetVolumeId: string,
  valuesPerSample: number,
  random: () => number
) => {
  if (!Number.isInteger(valuesPerSample) || valuesPerSample < 2) {
    throw new Error("spawn乱数1標本あたりの値数が不正です。");
  }
  let areaBeforeTarget = 0;
  const targetArea = sampler.areas.find((area) => {
    if (area.volumeId === targetVolumeId) {
      return true;
    }
    areaBeforeTarget += area.area;
    return false;
  });
  if (!targetArea) {
    throw new Error(`対象spawn Volumeがありません: ${targetVolumeId}`);
  }
  let valueIndex = 0;
  return () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `spawn fixture乱数は0以上1未満の有限値が必要です: ${value}`
      );
    }
    const componentIndex = valueIndex % valuesPerSample;
    valueIndex += 1;
    if (componentIndex !== 0) {
      return value;
    }
    return (
      (areaBeforeTarget + targetArea.area * value) /
      sampler.totalArea
    );
  };
};

const captureThrownValue = (action: () => void): unknown => {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
};

const captureThrownMessage = (action: () => void) => {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const createFixtureSpatialQueries = (
  targetScene: Scene,
  activeSet: DynamicStageSpatialActiveSet,
  volumes: readonly StageVolume[]
) => {
  const dynamicVariants = createDynamicStageSpatialVariants(activeSet);
  const queries = createStageSpatialQueries(targetScene, dynamicVariants, {
    volumes
  });
  targetScene.onDisposeObservable.addOnce(() => {
    queries.dispose();
    dynamicVariants.dispose();
  });
  return queries;
};

const createBeamValidationStage = (
  targetScene: Scene,
  normalColliders: readonly Mesh[],
  actorOnlyColliders: readonly Mesh[] = []
): StageSpatialContext => {
  const movementColliders = Object.freeze({
    player: Object.freeze([...normalColliders, ...actorOnlyColliders]),
    npc: Object.freeze([...normalColliders, ...actorOnlyColliders]),
    bit: Object.freeze([...normalColliders, ...actorOnlyColliders])
  });
  return {
    resources: {
      beamBlockers: normalColliders,
      sightBlockers: normalColliders
    },
    worldBoundary: null,
    queries: createFixtureSpatialQueries(
      targetScene,
      {
        movementColliders,
        groundColliders: normalColliders,
        beamBlockers: normalColliders,
        sightBlockers: normalColliders,
        bitObstacles: movementColliders.bit
      },
      []
    )
  } as unknown as StageSpatialContext;
};

type MovementAttempt = Readonly<{
  moverKind: StageMoverKind;
  from: Vector3;
  to: Vector3;
}>;

type PathfindAttempt = Readonly<{
  moverKind: StageMoverKind;
  start: NavigationLocation;
}>;

const countPathfindAttemptsFrom = (
  attempts: readonly PathfindAttempt[],
  moverKind: StageMoverKind,
  startPosition: Vector3
) =>
  attempts.filter(
    (attempt) =>
      attempt.moverKind === moverKind &&
      (attempt.start.position.x - startPosition.x) ** 2 +
        (attempt.start.position.z - startPosition.z) ** 2 <=
        1e-12
  ).length;

const createMovementBlockingStage = (
  source: StageSpatialContext,
  blockedMover: StageMoverKind
) => {
  const attempts: MovementAttempt[] = [];
  const pathfindAttempts: PathfindAttempt[] = [];
  const stage: StageSpatialContext = Object.freeze({
    ...source,
    navigation: Object.freeze({
      getSurfaceTriangles: () => source.navigation.getSurfaceTriangles(),
      projectPoint: (position: Vector3, maxDistance: number) =>
        source.navigation.projectPoint(position, maxDistance),
      findSurfacePath: (
        start: NavigationLocation,
        destination: NavigationLocation
      ) => source.navigation.findSurfacePath(start, destination),
      findPath: (
        start: NavigationLocation,
        destination: NavigationLocation,
        moverKind: StageMoverKind,
        routePolicy: NavigationRoutePolicy
      ) => {
        pathfindAttempts.push(
          Object.freeze({
            moverKind,
            start: Object.freeze({
              position: start.position.clone(),
              polygonRef: start.polygonRef
            })
          })
        );
        return source.navigation.findPath(
          start,
          destination,
          moverKind,
          routePolicy
        );
      },
      constrainMovement: (
        start: NavigationLocation,
        destination: Vector3
      ) => source.navigation.constrainMovement(start, destination),
      randomPointAround: (origin: NavigationLocation, radius: number) =>
        source.navigation.randomPointAround(origin, radius),
      createDebugMesh: (targetScene: Scene) =>
        source.navigation.createDebugMesh(targetScene),
      dispose: () => source.navigation.dispose()
    }),
    queries: Object.freeze({
      ...source.queries,
      castMovementSegment: (
        moverKind: StageMoverKind,
        from: Vector3,
        to: Vector3
      ) => {
        const horizontalDistanceSquared =
          (to.x - from.x) ** 2 + (to.z - from.z) ** 2;
        if (
          moverKind !== blockedMover ||
          horizontalDistanceSquared <= 1e-12
        ) {
          return source.queries.castMovementSegment(moverKind, from, to);
        }
        attempts.push(
          Object.freeze({
            moverKind,
            from: from.clone(),
            to: to.clone()
          })
        );
        return Object.freeze({
          point: from.add(to).scale(0.5),
          normal: from.subtract(to).normalize(),
          distance: Vector3.Distance(from, to) * 0.5,
          mesh: source.resources.normalColliders[0]
        });
      },
      castMovementSphere: (
        moverKind: StageMoverKind,
        from: Vector3,
        to: Vector3,
        radius: number
      ) => {
        const horizontalDistanceSquared =
          (to.x - from.x) ** 2 + (to.z - from.z) ** 2;
        if (
          moverKind !== blockedMover ||
          horizontalDistanceSquared <= 1e-12
        ) {
          return source.queries.castMovementSphere(
            moverKind,
            from,
            to,
            radius
          );
        }
        attempts.push(
          Object.freeze({
            moverKind,
            from: from.clone(),
            to: to.clone()
          })
        );
        const center = from.add(to).scale(0.5);
        return Object.freeze({
          point: center.clone(),
          center,
          normal: from.subtract(to).normalize(),
          distance: Vector3.Distance(from, to) * 0.5,
          fraction: 0.5,
          mesh: source.resources.normalColliders[0]
        });
      }
    })
  });
  return Object.freeze({
    stage,
    getAttempts: () => Object.freeze([...attempts]),
    getPathfindAttempts: () => Object.freeze([...pathfindAttempts])
  });
};

const createPathMesh = (name: string, path: readonly Vector3[], color: Color3) => {
  const elevated = path.map((point) => point.add(new Vector3(0, 0.015, 0)));
  const mesh = MeshBuilder.CreateLines(name, { points: elevated }, scene);
  mesh.color = color;
  return mesh;
};

const renderChecks = (checks: readonly ValidationCheck[]) => {
  checkResults.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.dataset.ok = String(check.ok);
      const title = document.createElement("strong");
      title.textContent = `${check.ok ? "PASS" : "FAIL"} ${check.name}`;
      const detail = document.createElement("span");
      detail.textContent = check.detail;
      item.append(title, detail);
      return item;
    })
  );
};

const setMetric = (label: string, value: string) => {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  metrics.append(term, description);
};

const runValidation = async () => {
  runButton.disabled = true;
  downloadButton.disabled = true;
  document.documentElement.dataset.validationStatus = "running";
  summary.dataset.state = "running";
  summary.textContent = "Recastを初期化し、NavMeshを生成しています。";
  metrics.replaceChildren();
  checkResults.replaceChildren();
  disposeNavigationRuntime();

  const checks: ValidationCheck[] = [];
  checks.push(...runDynamicStageSpatialAcceptance());
  checks.push(...runDynamicAssetRegistryAcceptance());
  checks.push(...runDynamicInteractionAcceptance());
  checks.push(...(await runHumanNavTileAcceptance()));

  const alertCoordinator = createV2AlertCoordinator({ alertDuration: 2 });
  alertCoordinator.publish([{ leaderId: "bit-1", targetId: "player" }]);
  alertCoordinator.update(0.75);
  const activeAlert = alertCoordinator.getActiveAlerts()[0];
  alertCoordinator.publish([{ leaderId: "bit-1", targetId: "player" }]);
  const refreshedAlert = alertCoordinator.getActiveAlerts()[0];
  alertCoordinator.update(2);
  checks.push({
    name: "3D actor alertの期限更新と再発行",
    ok:
      activeAlert?.leaderId === "bit-1" &&
      activeAlert.targetId === "player" &&
      Math.abs(activeAlert.remainingSeconds - 1.25) <= 1e-9 &&
      refreshedAlert?.remainingSeconds === 2 &&
      alertCoordinator.getActiveAlerts().length === 0,
    detail: `remaining=${activeAlert?.remainingSeconds ?? "none"} / refreshed=${refreshedAlert?.remainingSeconds ?? "none"}`
  });

  const invalidAlertMessage = captureThrownMessage(() => {
    alertCoordinator.publish([{ leaderId: "same", targetId: "same" }]);
  });
  checks.push({
    name: "alert leaderとtargetの同一ID拒否",
    ok: invalidAlertMessage?.includes("異なる必要") === true,
    detail: invalidAlertMessage ?? "例外なし"
  });
  const pendingNavigationWorlds: NavigationWorld[] = [];

  try {
    const initializationStartedAt = performance.now();
    await initializeNavigationRuntime();
    const initializationMs = performance.now() - initializationStartedAt;
    checks.push({
      name: "Recast初期化",
      ok: true,
      detail: `recast-navigation 0.43.1 / ${initializationMs.toFixed(2)} ms`
    });

    const bakeStartedAt = performance.now();
    const generationResult = generateSoloNavMesh(
      navGeometry.positions,
      navGeometry.indices,
      navParameters
    );
    const bakeMs = performance.now() - bakeStartedAt;
    if (!generationResult.success) {
      throw new Error(generationResult.error);
    }

    let data: Uint8Array;
    try {
      data = exportNavMesh(generationResult.navMesh);
    } finally {
      generationResult.navMesh.destroy();
    }

    const navigationWorld = await createNavigationWorld(data, []);
    pendingNavigationWorlds.push(navigationWorld);
    navigationWorld.createDebugMesh(scene);

    const routeStart = new Vector3(3, 0, -1.5);
    const routeEnd = new Vector3(3, 0, 1.5);
    const routeResult = findNavigationPath(navigationWorld, routeStart, routeEnd);
    const routePath = getNavigationPathPoints(routeResult);
    const routeMinX = Math.min(...routePath.map((point) => point.x));
    checks.push({
      name: "壁を抜けず扉へ迂回",
      ok: routeResult !== null && routePath.length >= 3 && routeMinX < 0.95,
      detail: `${routePath.length}点 / minX=${routeMinX.toFixed(4)} / ${routeResult?.distance.toFixed(4) ?? "--"} wu`
    });

    const rampStart = new Vector3(0.25, 0, -1.75);
    const rampEnd = new Vector3(-1.5, 0.25, -1.75);
    const rampResult = findNavigationPath(navigationWorld, rampStart, rampEnd);
    const rampPath = getNavigationPathPoints(rampResult);
    const rampHeight =
      rampPath.length > 0
        ? rampPath[rampPath.length - 1].y
        : Number.NEGATIVE_INFINITY;
    checks.push({
      name: "連続ランプの3D経路",
      ok: rampResult !== null && rampPath.length >= 2 && rampHeight >= 0.2,
      detail: `${rampPath.length}点 / endY=${rampHeight.toFixed(4)}`
    });

    const restoreStartedAt = performance.now();
    const restoredNavigationWorld = await createNavigationWorld(data, []);
    pendingNavigationWorlds.push(restoredNavigationWorld);
    const restoreMs = performance.now() - restoreStartedAt;
    const restoredRoutePath = getNavigationPathPoints(
      findNavigationPath(restoredNavigationWorld, routeStart, routeEnd)
    );
    const restoredRampPath = getNavigationPathPoints(
      findNavigationPath(restoredNavigationWorld, rampStart, rampEnd)
    );
    checks.push({
      name: "NavMeshバイナリ往復",
      ok:
        data.byteLength > 0 &&
        pathsEqual(routePath, restoredRoutePath) &&
        pathsEqual(rampPath, restoredRampPath),
      detail: `${data.byteLength} bytes / 復元 ${restoreMs.toFixed(2)} ms`
    });

    const unreachableResult = findNavigationPath(
      navigationWorld,
      new Vector3(3, 0, -1.5),
      new Vector3(8, 0, 8)
    );
    checks.push({
      name: "NavMesh外の到達不能地点",
      ok: unreachableResult === null,
      detail: `${getNavigationPathPoints(unreachableResult).length}点`
    });

    const disconnectedIslandResult = findNavigationPath(
      navigationWorld,
      new Vector3(3, 0, -1.5),
      new Vector3(-6.5, 0, -1.5)
    );
    checks.push({
      name: "切断されたNavMesh島",
      ok: disconnectedIslandResult === null,
      detail: `${getNavigationPathPoints(disconnectedIslandResult).length}点`
    });

    const genericTeleportLink = createValidationLinkPair(
      "generic-teleport-validation",
      "teleport",
      new Vector3(3.9, 0.25, -1.5),
      new Vector3(-6.7, 0.25, -1.5)
    );
    let genericLinkWorld: NavigationWorld | null = null;
    let genericPlayerPath: NavigationPath | null = null;
    let genericNpcPath: NavigationPath | null = null;
    try {
      genericLinkWorld = await createNavigationWorld(data, [genericTeleportLink]);
      genericPlayerPath = findNavigationPath(
        genericLinkWorld,
        new Vector3(3.5, 0, -1.5),
        new Vector3(-6.3, 0, -1.5),
        "player"
      );
      genericNpcPath = findNavigationPath(
        genericLinkWorld,
        new Vector3(3.5, 0, -1.5),
        new Vector3(-6.3, 0, -1.5),
        "npc"
      );
    } finally {
      genericLinkWorld?.dispose();
      genericTeleportLink.endpointA.node.dispose();
      genericTeleportLink.endpointB.node.dispose();
    }
    const genericPlayerTransitions =
      genericPlayerPath?.steps.filter((step) => step.kind === "transition") ?? [];
    const genericNpcTransitions =
      genericNpcPath?.steps.filter((step) => step.kind === "transition") ?? [];
    checks.push({
      name: "player・NPCの汎用特殊リンク経路",
      ok:
        genericPlayerTransitions.length === 1 &&
        genericNpcTransitions.length === 1 &&
        genericPlayerTransitions[0].link.id === genericTeleportLink.id &&
        genericNpcTransitions[0].link.id === genericTeleportLink.id,
      detail: `player=${genericPlayerTransitions.map((step) => step.link.kind).join(",") || "none"} / npc=${genericNpcTransitions.map((step) => step.link.kind).join(",") || "none"}`
    });

    const stackedLowerStart = new Vector3(-9.2, 0, -1.8);
    const stackedLowerEnd = new Vector3(-9.8, 0, -1.2);
    const stackedUpperStart = new Vector3(-9.2, 0.8, -1.8);
    const stackedUpperEnd = new Vector3(-9.8, 0.8, -1.2);
    const stackedLowerPath = findNavigationPath(
      navigationWorld,
      stackedLowerStart,
      stackedLowerEnd
    );
    const stackedUpperPath = findNavigationPath(
      navigationWorld,
      stackedUpperStart,
      stackedUpperEnd
    );
    const stackedCrossFloorPath = findNavigationPath(
      navigationWorld,
      stackedLowerStart,
      stackedUpperEnd
    );
    const lowerProjected = navigationWorld.projectPoint(stackedLowerStart, 0.1);
    const upperProjected = navigationWorld.projectPoint(stackedUpperStart, 0.1);
    const lowerConstrained = lowerProjected
      ? navigationWorld.constrainMovement(lowerProjected, stackedLowerEnd)
      : null;
    const upperConstrained = upperProjected
      ? navigationWorld.constrainMovement(upperProjected, stackedUpperEnd)
      : null;
    const lowerRandom = lowerProjected
      ? navigationWorld.randomPointAround(lowerProjected, 0.4)
      : null;
    const upperRandom = upperProjected
      ? navigationWorld.randomPointAround(upperProjected, 0.4)
      : null;
    checks.push({
      name: "重複する上下床の分離",
      ok:
        stackedLowerPath !== null &&
        stackedUpperPath !== null &&
        stackedCrossFloorPath === null &&
        lowerProjected !== null &&
        upperProjected !== null &&
        upperProjected.position.y - lowerProjected.position.y >= 0.7 &&
        upperProjected.polygonRef !== lowerProjected.polygonRef &&
        lowerConstrained !== null &&
        upperConstrained !== null &&
        lowerRandom !== null &&
        upperRandom !== null &&
        Math.abs(lowerConstrained.position.y - lowerProjected.position.y) <= 0.02 &&
        Math.abs(upperConstrained.position.y - upperProjected.position.y) <= 0.02 &&
        Math.abs(lowerRandom.position.y - lowerProjected.position.y) <= 0.02 &&
        Math.abs(upperRandom.position.y - upperProjected.position.y) <= 0.02,
      detail: `lowerY=${lowerProjected?.position.y.toFixed(4) ?? "--"} / upperY=${upperProjected?.position.y.toFixed(4) ?? "--"} / constrain=${lowerConstrained?.position.y.toFixed(4) ?? "--"}/${upperConstrained?.position.y.toFixed(4) ?? "--"} / random=${lowerRandom?.position.y.toFixed(4) ?? "--"}/${upperRandom?.position.y.toFixed(4) ?? "--"} / cross=${getNavigationPathPoints(stackedCrossFloorPath).length}点`
    });

    const primaryTeleportLink = createValidationLinkPair(
      "primary-teleport-validation",
      "teleport",
      new Vector3(3.9, 0.25, -1.5),
      new Vector3(5.1, 0.25, -1.5)
    );
    const elevatedTeleportLink = createValidationLinkPair(
      "elevated-teleport-validation",
      "teleport",
      new Vector3(-9.5, 0.25, -1.5),
      new Vector3(-9.5, 1.05, -1.5)
    );
    const cacheEntryTeleportLink = createValidationLinkPair(
      "teleport-cache-entry-validation",
      "teleport",
      new Vector3(-6.7, 0.25, -1.5),
      new Vector3(3, 0.25, -1.5)
    );
    const cachedSurfaceBridgeLink = createValidationLinkPair(
      "teleport-cache-bridge-validation",
      "teleport",
      new Vector3(3, 0.25, 1.5),
      new Vector3(5.5, 0.25, -1.5)
    );
    const linkCacheValidationLinks = [
      cacheEntryTeleportLink,
      elevatedTeleportLink,
      cachedSurfaceBridgeLink
    ];
    const queryPrototype = NavMeshQuery.prototype;
    const originalFindPath = queryPrototype.findPath;
    type RecastPathfindAttempt = Readonly<{
      start: string;
      destination: string;
    }>;
    const createPathfindPointKey = (
      polygonRef: number,
      position: Readonly<{ x: number; y: number; z: number }>
    ) =>
      `${polygonRef}:${position.x.toFixed(6)},${position.y.toFixed(6)},${position.z.toFixed(6)}`;
    const recastPathfindAttempts: RecastPathfindAttempt[] = [];
    let constructionPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let playerPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let npcPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let repeatedDirectPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let samePolygonPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let samePositionPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let disconnectedPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let firstPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let secondPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let reversePathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let repeatedReversePathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let nativeForwardPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let nativeReversePathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let repeatedDirectPath: NavigationPath | null = null;
    let samePolygonSurfaceStep: NavigationSurfaceStep | null = null;
    let samePositionSurfaceStep: NavigationSurfaceStep | null = null;
    let disconnectedSurfaceStep: NavigationSurfaceStep | null = null;
    let samePolygonStart: NavigationLocation | null = null;
    let samePolygonDestination: NavigationLocation | null = null;
    let equivalentPositionDestination: NavigationLocation | null = null;
    let firstCachedLinkPath: NavigationPath | null = null;
    let secondCachedLinkPath: NavigationPath | null = null;
    let reverseCachedLinkPath: NavigationPath | null = null;
    let repeatedReverseCachedLinkPath: NavigationPath | null = null;
    let nativeForwardSurfaceStep: NavigationSurfaceStep | null = null;
    let nativeReverseSurfaceStep: NavigationSurfaceStep | null = null;
    let cachedEndpointKeys = new Set<string>();
    let linkCacheValidationWorld: NavigationWorld | null = null;
    queryPrototype.findPath = function (
      this: NavMeshQuery,
      ...args: Parameters<NavMeshQuery["findPath"]>
    ) {
      recastPathfindAttempts.push(
        Object.freeze({
          start: createPathfindPointKey(args[0], args[2]),
          destination: createPathfindPointKey(args[1], args[3])
        })
      );
      return originalFindPath.apply(this, args);
    };
    try {
      linkCacheValidationWorld = await createNavigationWorld(
        data,
        linkCacheValidationLinks
      );
      constructionPathfindAttempts = Object.freeze([
        ...recastPathfindAttempts
      ]);
      cachedEndpointKeys = new Set(
        linkCacheValidationLinks.flatMap((link) =>
          [link.endpointA.position, link.endpointB.position].map((position) => {
            const location = requireNavigationLocation(
              linkCacheValidationWorld!,
              position,
              0.3
            );
            return createPathfindPointKey(location.polygonRef, {
              x: -location.position.x,
              y: location.position.y,
              z: location.position.z
            });
          })
        )
      );
      const directStartLocation = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(2.8, 0, -1.5)
      );
      const directDestinationLocation = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(3.2, 0, -1.5)
      );
      const playerPathfindStartIndex = recastPathfindAttempts.length;
      linkCacheValidationWorld.findPath(
        directStartLocation,
        directDestinationLocation,
        "player",
        DISTANCE_NAVIGATION_ROUTE_POLICY
      );
      playerPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(playerPathfindStartIndex)
      );
      const npcPathfindStartIndex = recastPathfindAttempts.length;
      linkCacheValidationWorld.findPath(
        directStartLocation,
        directDestinationLocation,
        "npc",
        DISTANCE_NAVIGATION_ROUTE_POLICY
      );
      npcPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(npcPathfindStartIndex)
      );
      const repeatedDirectPathfindStartIndex = recastPathfindAttempts.length;
      repeatedDirectPath = linkCacheValidationWorld.findPath(
        directStartLocation,
        directDestinationLocation,
        "npc",
        DISTANCE_NAVIGATION_ROUTE_POLICY
      );
      repeatedDirectPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(repeatedDirectPathfindStartIndex)
      );
      samePolygonStart = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(3, 0, -1.5)
      );
      samePolygonDestination = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(3.01, 0, -1.5)
      );
      const samePolygonPathfindStartIndex = recastPathfindAttempts.length;
      samePolygonSurfaceStep =
        linkCacheValidationWorld.findSurfacePath(
          samePolygonStart,
          samePolygonDestination
        );
      samePolygonPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(samePolygonPathfindStartIndex)
      );
      equivalentPositionDestination = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(3.00005, 0, -1.5)
      );
      const samePositionPathfindStartIndex = recastPathfindAttempts.length;
      samePositionSurfaceStep =
        linkCacheValidationWorld.findSurfacePath(
          samePolygonStart,
          equivalentPositionDestination
        );
      samePositionPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(samePositionPathfindStartIndex)
      );
      const disconnectedDestination = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(-6.5, 0, -1.5)
      );
      const disconnectedPathfindStartIndex = recastPathfindAttempts.length;
      disconnectedSurfaceStep =
        linkCacheValidationWorld.findSurfacePath(
          samePolygonStart,
          disconnectedDestination
        );
      disconnectedPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(disconnectedPathfindStartIndex)
      );
      const startLocation = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(-6.3, 0, -1.5)
      );
      const destinationLocation = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(5.3, 0, -1.5)
      );
      const firstPathfindStartIndex = recastPathfindAttempts.length;
      firstCachedLinkPath = linkCacheValidationWorld.findPath(
        startLocation,
        destinationLocation,
        "npc",
        DISTANCE_NAVIGATION_ROUTE_POLICY
      );
      firstPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(firstPathfindStartIndex)
      );
      const secondPathfindStartIndex = recastPathfindAttempts.length;
      secondCachedLinkPath = linkCacheValidationWorld.findPath(
        startLocation,
        destinationLocation,
        "npc",
        DISTANCE_NAVIGATION_ROUTE_POLICY
      );
      secondPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(secondPathfindStartIndex)
      );
      const reversePathfindStartIndex = recastPathfindAttempts.length;
      reverseCachedLinkPath = linkCacheValidationWorld.findPath(
        destinationLocation,
        startLocation,
        "npc",
        DISTANCE_NAVIGATION_ROUTE_POLICY
      );
      reversePathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(reversePathfindStartIndex)
      );
      const repeatedReversePathfindStartIndex = recastPathfindAttempts.length;
      repeatedReverseCachedLinkPath = linkCacheValidationWorld.findPath(
        destinationLocation,
        startLocation,
        "npc",
        DISTANCE_NAVIGATION_ROUTE_POLICY
      );
      repeatedReversePathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(repeatedReversePathfindStartIndex)
      );
      const nativeForwardStart = requireNavigationLocation(
        linkCacheValidationWorld,
        cacheEntryTeleportLink.endpointB.position,
        0.3
      );
      const nativeForwardDestination = requireNavigationLocation(
        linkCacheValidationWorld,
        cachedSurfaceBridgeLink.endpointA.position,
        0.3
      );
      const nativeForwardPathfindStartIndex = recastPathfindAttempts.length;
      nativeForwardSurfaceStep = linkCacheValidationWorld.findSurfacePath(
        nativeForwardStart,
        nativeForwardDestination
      );
      nativeForwardPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(nativeForwardPathfindStartIndex)
      );
      const nativeReverseStart = requireNavigationLocation(
        linkCacheValidationWorld,
        cachedSurfaceBridgeLink.endpointA.position,
        0.3
      );
      const nativeReverseDestination = requireNavigationLocation(
        linkCacheValidationWorld,
        cacheEntryTeleportLink.endpointB.position,
        0.3
      );
      const nativeReversePathfindStartIndex = recastPathfindAttempts.length;
      nativeReverseSurfaceStep = linkCacheValidationWorld.findSurfacePath(
        nativeReverseStart,
        nativeReverseDestination
      );
      nativeReversePathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(nativeReversePathfindStartIndex)
      );
    } finally {
      queryPrototype.findPath = originalFindPath;
      linkCacheValidationWorld?.dispose();
      cacheEntryTeleportLink.endpointA.node.dispose();
      cacheEntryTeleportLink.endpointB.node.dispose();
      cachedSurfaceBridgeLink.endpointA.node.dispose();
      cachedSurfaceBridgeLink.endpointB.node.dispose();
    }
    const getEndpointSurfacePathfindAttempts = (
      attempts: readonly RecastPathfindAttempt[]
    ) =>
      attempts.filter(
        (attempt) =>
          cachedEndpointKeys.has(attempt.start) &&
          cachedEndpointKeys.has(attempt.destination)
      );
    const getSurfaceStepsBetweenTransitions = (
      path: NavigationPath | null,
      firstLinkId: string,
      secondLinkId: string
    ) => {
      if (!path) {
        return [];
      }
      const firstTransitionIndex = path.steps.findIndex(
        (step) => step.kind === "transition" && step.link.id === firstLinkId
      );
      const secondTransitionIndex = path.steps.findIndex(
        (step, index) =>
          index > firstTransitionIndex &&
          step.kind === "transition" &&
          step.link.id === secondLinkId
      );
      return firstTransitionIndex >= 0 && secondTransitionIndex > firstTransitionIndex
        ? path.steps
            .slice(firstTransitionIndex + 1, secondTransitionIndex)
            .filter(
              (step): step is NavigationSurfaceStep => step.kind === "surface"
            )
        : [];
    };
    const repeatedDirectTransitionCount =
      repeatedDirectPath?.steps.filter((step) => step.kind === "transition")
        .length ?? 0;
    const samePolygonSurfaceStepMatches =
      samePolygonStart !== null &&
      samePolygonDestination !== null &&
      samePolygonStart.polygonRef === samePolygonDestination.polygonRef &&
      samePolygonSurfaceStep?.points.length === 2 &&
      samePolygonSurfaceStep.points[0].polygonRef ===
        samePolygonStart.polygonRef &&
      samePolygonSurfaceStep.points[1].polygonRef ===
        samePolygonDestination.polygonRef &&
      Vector3.Distance(
        samePolygonSurfaceStep.points[0].position,
        samePolygonStart.position
      ) <= 1e-9 &&
      Vector3.Distance(
        samePolygonSurfaceStep.points[1].position,
        samePolygonDestination.position
      ) <= 1e-9 &&
      Math.abs(
        samePolygonSurfaceStep.distance -
          Vector3.Distance(
            samePolygonStart.position,
            samePolygonDestination.position
          )
      ) <= 1e-9;
    const samePositionSurfaceStepMatches =
      samePolygonStart !== null &&
      equivalentPositionDestination !== null &&
      Vector3.Distance(
        samePolygonStart.position,
        equivalentPositionDestination.position
      ) > 0 &&
      Vector3.Distance(
        samePolygonStart.position,
        equivalentPositionDestination.position
      ) < 1 / 16_384 &&
      samePositionSurfaceStep?.points.length === 1 &&
      samePositionSurfaceStep.points[0].polygonRef ===
        samePolygonStart.polygonRef &&
      Vector3.Distance(
        samePositionSurfaceStep.points[0].position,
        samePolygonStart.position
      ) <= 1e-9 &&
      samePositionSurfaceStep.distance === 0;
    const directSurfacePairKey = playerPathfindAttempts[0]
      ? `${playerPathfindAttempts[0].start}->${playerPathfindAttempts[0].destination}`
      : null;
    const repeatedDirectSurfacePathfindCount = directSurfacePairKey
      ? repeatedDirectPathfindAttempts.filter(
          (attempt) =>
            `${attempt.start}->${attempt.destination}` === directSurfacePairKey
        ).length
      : 0;
    const firstCachedTransitionIds =
      firstCachedLinkPath?.steps.flatMap((step) =>
        step.kind === "transition" ? [step.link.id] : []
      ) ?? [];
    const secondCachedTransitionIds =
      secondCachedLinkPath?.steps.flatMap((step) =>
        step.kind === "transition" ? [step.link.id] : []
      ) ?? [];
    const reverseCachedTransitionIds =
      reverseCachedLinkPath?.steps.flatMap((step) =>
        step.kind === "transition" ? [step.link.id] : []
      ) ?? [];
    const repeatedReverseCachedTransitionIds =
      repeatedReverseCachedLinkPath?.steps.flatMap((step) =>
        step.kind === "transition" ? [step.link.id] : []
      ) ?? [];
    const expectedCachedTransitionIds = [
      cacheEntryTeleportLink.id,
      cachedSurfaceBridgeLink.id
    ];
    const expectedReverseCachedTransitionIds = [
      cachedSurfaceBridgeLink.id,
      cacheEntryTeleportLink.id
    ];
    const hasExpectedCachedTransitions = (ids: readonly string[]) =>
      ids.length === expectedCachedTransitionIds.length &&
      ids.every((id, index) => id === expectedCachedTransitionIds[index]);
    const hasExpectedReverseCachedTransitions = (ids: readonly string[]) =>
      ids.length === expectedReverseCachedTransitionIds.length &&
      ids.every(
        (id, index) => id === expectedReverseCachedTransitionIds[index]
      );
    const firstEndpointSurfacePathfindAttempts =
      getEndpointSurfacePathfindAttempts(firstPathfindAttempts);
    const secondEndpointSurfacePathfindAttempts =
      getEndpointSurfacePathfindAttempts(secondPathfindAttempts);
    const reverseEndpointSurfacePathfindAttempts =
      getEndpointSurfacePathfindAttempts(reversePathfindAttempts);
    const repeatedReverseEndpointSurfacePathfindAttempts =
      getEndpointSurfacePathfindAttempts(repeatedReversePathfindAttempts);
    const nativeForwardEndpointSurfacePathfindAttempts =
      getEndpointSurfacePathfindAttempts(nativeForwardPathfindAttempts);
    const nativeReverseEndpointSurfacePathfindAttempts =
      getEndpointSurfacePathfindAttempts(nativeReversePathfindAttempts);
    const firstCachedEndpointSurfaceSteps = getSurfaceStepsBetweenTransitions(
      firstCachedLinkPath,
      cacheEntryTeleportLink.id,
      cachedSurfaceBridgeLink.id
    );
    const reverseCachedEndpointSurfaceSteps = getSurfaceStepsBetweenTransitions(
      reverseCachedLinkPath,
      cachedSurfaceBridgeLink.id,
      cacheEntryTeleportLink.id
    );
    const repeatedReverseCachedEndpointSurfaceSteps =
      getSurfaceStepsBetweenTransitions(
        repeatedReverseCachedLinkPath,
        cachedSurfaceBridgeLink.id,
        cacheEntryTeleportLink.id
      );
    const forwardCachedSurfaceStep = firstCachedEndpointSurfaceSteps[0] ?? null;
    const reverseCachedSurfaceStep =
      reverseCachedEndpointSurfaceSteps[0] ?? null;
    const repeatedReverseCachedSurfaceStep =
      repeatedReverseCachedEndpointSurfaceSteps[0] ?? null;
    const reverseCoordinatesMatch =
      forwardCachedSurfaceStep !== null &&
      reverseCachedSurfaceStep !== null &&
      forwardCachedSurfaceStep.points.length ===
        reverseCachedSurfaceStep.points.length &&
      forwardCachedSurfaceStep.points.every((forwardPoint, pointIndex) => {
        const reversePoint =
          reverseCachedSurfaceStep.points[
            reverseCachedSurfaceStep.points.length - 1 - pointIndex
          ];
        return (
          Vector3.Distance(forwardPoint.position, reversePoint.position) <= 1e-6
        );
      });
    const directionDependentPolygonRefs =
      forwardCachedSurfaceStep !== null &&
      reverseCachedSurfaceStep !== null &&
      forwardCachedSurfaceStep.points.length ===
        reverseCachedSurfaceStep.points.length &&
      forwardCachedSurfaceStep.points.length >= 3 &&
      forwardCachedSurfaceStep.points.slice(1, -1).some(
        (forwardPoint, pointIndex) =>
          forwardPoint.polygonRef !==
          reverseCachedSurfaceStep.points[
            reverseCachedSurfaceStep.points.length - 2 - pointIndex
          ].polygonRef
      );
    const forwardCachedSurfaceMatchesNative =
      forwardCachedSurfaceStep !== null &&
      nativeForwardSurfaceStep !== null &&
      forwardCachedSurfaceStep.points.length ===
        nativeForwardSurfaceStep.points.length &&
      forwardCachedSurfaceStep.points.every((cachedPoint, pointIndex) => {
        const nativePoint = nativeForwardSurfaceStep.points[pointIndex];
        return (
          cachedPoint.polygonRef === nativePoint.polygonRef &&
          Vector3.Distance(cachedPoint.position, nativePoint.position) <= 1e-6
        );
      });
    const reverseCachedSurfaceMatchesNative =
      reverseCachedSurfaceStep !== null &&
      nativeReverseSurfaceStep !== null &&
      reverseCachedSurfaceStep.points.length ===
        nativeReverseSurfaceStep.points.length &&
      reverseCachedSurfaceStep.points.every((cachedPoint, pointIndex) => {
        const nativePoint = nativeReverseSurfaceStep.points[pointIndex];
        return (
          cachedPoint.polygonRef === nativePoint.polygonRef &&
          Vector3.Distance(cachedPoint.position, nativePoint.position) <= 1e-6
        );
      });
    const repeatedReverseCacheMatches =
      reverseCachedSurfaceStep !== null &&
      repeatedReverseCachedSurfaceStep !== null &&
      reverseCachedSurfaceStep.points.length ===
        repeatedReverseCachedSurfaceStep.points.length &&
      reverseCachedSurfaceStep.points.every((cachedPoint, pointIndex) => {
        const repeatedPoint =
          repeatedReverseCachedSurfaceStep.points[pointIndex];
        return (
          cachedPoint.polygonRef === repeatedPoint.polygonRef &&
          Vector3.Distance(cachedPoint.position, repeatedPoint.position) <= 1e-6
        );
      });
    checks.push({
      name: "特殊接続の連結成分グラフ・有向surfaceキャッシュ",
      ok:
        hasExpectedCachedTransitions(firstCachedTransitionIds) &&
        hasExpectedCachedTransitions(secondCachedTransitionIds) &&
        hasExpectedReverseCachedTransitions(reverseCachedTransitionIds) &&
        hasExpectedReverseCachedTransitions(
          repeatedReverseCachedTransitionIds
        ) &&
        cachedEndpointKeys.size === linkCacheValidationLinks.length * 2 &&
        constructionPathfindAttempts.length === 0 &&
        playerPathfindAttempts.length === 3 &&
        npcPathfindAttempts.length === 3 &&
        repeatedDirectPath !== null &&
        repeatedDirectTransitionCount === 0 &&
        repeatedDirectPathfindAttempts.length === 3 &&
        repeatedDirectSurfacePathfindCount === 1 &&
        samePolygonPathfindAttempts.length === 0 &&
        samePositionPathfindAttempts.length === 0 &&
        disconnectedPathfindAttempts.length === 0 &&
        samePolygonSurfaceStepMatches &&
        samePositionSurfaceStepMatches &&
        disconnectedSurfaceStep === null &&
        firstEndpointSurfacePathfindAttempts.length === 1 &&
        secondEndpointSurfacePathfindAttempts.length === 0 &&
        reverseEndpointSurfacePathfindAttempts.length === 1 &&
        repeatedReverseEndpointSurfacePathfindAttempts.length === 0 &&
        nativeForwardEndpointSurfacePathfindAttempts.length === 1 &&
        nativeReverseEndpointSurfacePathfindAttempts.length === 1 &&
        reverseCoordinatesMatch &&
        directionDependentPolygonRefs &&
        forwardCachedSurfaceMatchesNative &&
        reverseCachedSurfaceMatchesNative &&
        repeatedReverseCacheMatches,
      detail: `endpoints=${cachedEndpointKeys.size} / build=${constructionPathfindAttempts.length} / normal=${playerPathfindAttempts.length},${npcPathfindAttempts.length} / repeatedDirect=${repeatedDirectPathfindAttempts.length}(direct=${repeatedDirectSurfacePathfindCount}, ${repeatedDirectTransitionCount}遷移) / fast=${samePolygonPathfindAttempts.length},${samePositionPathfindAttempts.length},${disconnectedPathfindAttempts.length}(${samePolygonSurfaceStepMatches}/${samePositionSurfaceStepMatches}/${disconnectedSurfaceStep === null}) / endpoint=${firstEndpointSurfacePathfindAttempts.length},${secondEndpointSurfacePathfindAttempts.length},${reverseEndpointSurfacePathfindAttempts.length},${repeatedReverseEndpointSurfacePathfindAttempts.length},native=${nativeForwardEndpointSurfacePathfindAttempts.length},${nativeReverseEndpointSurfacePathfindAttempts.length} / points=${forwardCachedSurfaceStep?.points.length ?? 0} / reverse=${reverseCoordinatesMatch},refs=${directionDependentPolygonRefs},native=${forwardCachedSurfaceMatchesNative}/${reverseCachedSurfaceMatchesNative},cached=${repeatedReverseCacheMatches} / transitions=${firstCachedTransitionIds.join(" > ") || "none"}`
    });

    const highProjectionLink = createValidationLinkPair(
      "teleport-high-projection-validation",
      "teleport",
      new Vector3(-9.5, 2, -1.5),
      new Vector3(-6.5, 2, -1.5)
    );
    let highProjectionWorld: NavigationWorld | null = null;
    let highProjectionPath: NavigationPath | null = null;
    try {
      highProjectionWorld = await createNavigationWorld(data, [
        highProjectionLink
      ]);
      highProjectionPath = findNavigationPath(
        highProjectionWorld,
        new Vector3(-9.5, 0.8, -1.5),
        new Vector3(-6.5, 0, -1.5),
        "npc"
      );
    } finally {
      highProjectionWorld?.dispose();
    }
    const highProjectionTransition = highProjectionPath?.steps.find(
      (step) => step.kind === "transition"
    );
    const expectedHighProjectionTransitionDistance = highProjectionTransition
      ? Vector3.Distance(
          highProjectionTransition.entry.position,
          highProjectionLink.endpointA.position
        ) +
        Vector3.Distance(
          highProjectionLink.endpointA.position,
          highProjectionLink.endpointB.position
        ) +
        Vector3.Distance(
          highProjectionLink.endpointB.position,
          highProjectionTransition.exit.position
        )
      : Number.NaN;
    const highProjectionStepDistance =
      highProjectionPath?.steps.reduce((sum, step) => sum + step.distance, 0) ??
      Number.NaN;
    const unsupportedProjectionLink = createValidationLinkPair(
      "teleport-unsupported-projection-validation",
      "teleport",
      new Vector3(-8, 2, -1.5),
      new Vector3(-6.5, 2, -1.5)
    );
    let unsupportedProjectionMessage: string | null = null;
    try {
      const invalidWorld = await createNavigationWorld(data, [
        unsupportedProjectionLink
      ]);
      invalidWorld.dispose();
    } catch (error) {
      unsupportedProjectionMessage =
        error instanceof Error ? error.message : String(error);
    }
    checks.push({
      name: "高所LNK端点の下向き投影と3区間距離",
      ok:
        highProjectionTransition !== undefined &&
        Math.abs(highProjectionTransition.entry.position.y - 0.8) <= 0.02 &&
        Math.abs(highProjectionTransition.exit.position.y) <= 0.02 &&
        highProjectionLink.endpointA.position.y -
          highProjectionTransition.entry.position.y >
          0.5 &&
        highProjectionLink.endpointB.position.y -
          highProjectionTransition.exit.position.y >
          0.5 &&
        Math.abs(
          highProjectionTransition.distance -
            expectedHighProjectionTransitionDistance
        ) <= 1e-6 &&
        highProjectionPath !== null &&
        Math.abs(highProjectionPath.distance - highProjectionStepDistance) <=
          1e-6 &&
        unsupportedProjectionMessage?.includes("直下にNavMesh面がありません") ===
          true,
      detail: `entryY=${highProjectionTransition?.entry.position.y.toFixed(4) ?? "--"} / exitY=${highProjectionTransition?.exit.position.y.toFixed(4) ?? "--"} / transition=${highProjectionTransition?.distance.toFixed(4) ?? "--"}/${Number.isFinite(expectedHighProjectionTransitionDistance) ? expectedHighProjectionTransitionDistance.toFixed(4) : "--"} / unsupported=${unsupportedProjectionMessage ?? "例外なし"}`
    });
    highProjectionLink.endpointA.node.dispose();
    highProjectionLink.endpointB.node.dispose();
    unsupportedProjectionLink.endpointA.node.dispose();
    unsupportedProjectionLink.endpointB.node.dispose();

    const directSurfaceShortcutLink = createValidationLinkPair(
      "teleport-direct-surface-shortcut-validation",
      "teleport",
      new Vector3(3, 0.25, -1.5),
      new Vector3(3, 0.25, 1.5)
    );
    let directSurfaceShortcutWorld: NavigationWorld | null = null;
    let directSurfaceNpcPath: NavigationPath | null = null;
    let directSurfacePlayerPath: NavigationPath | null = null;
    let directSurfaceOnlyPath: NavigationPath | null = null;
    try {
      directSurfaceShortcutWorld = await createNavigationWorld(data, [
        directSurfaceShortcutLink
      ]);
      directSurfaceNpcPath = findNavigationPath(
        directSurfaceShortcutWorld,
        routeStart,
        routeEnd,
        "npc"
      );
      directSurfacePlayerPath = findNavigationPath(
        directSurfaceShortcutWorld,
        routeStart,
        routeEnd,
        "player"
      );
      directSurfaceOnlyPath = findSurfaceNavigationPath(
        directSurfaceShortcutWorld,
        routeStart,
        routeEnd,
        "npc"
      );
    } finally {
      directSurfaceShortcutWorld?.dispose();
    }
    const directSurfacePlayerTransitions =
      directSurfacePlayerPath?.steps.filter(
        (step) => step.kind === "transition"
      ) ??
      [];
    const directSurfaceOnlyTransitions =
      directSurfaceOnlyPath?.steps.filter(
        (step) => step.kind === "transition"
      ) ?? [];
    checks.push({
      name: "通常面と特殊接続を列挙してpolicyで選択",
      ok:
        directSurfaceNpcPath !== null &&
        directSurfacePlayerPath !== null &&
        directSurfacePlayerTransitions.length === 1 &&
        directSurfaceOnlyPath !== null &&
        directSurfaceOnlyPath.steps.every(
          (step) => step.kind === "surface"
        ) &&
        directSurfaceOnlyTransitions.length === 0 &&
        directSurfaceNpcPath.distance <
          directSurfaceOnlyPath.distance &&
        Math.abs(
          directSurfacePlayerPath.distance - directSurfaceNpcPath.distance
        ) <= 1e-6,
      detail: `distance=${directSurfaceNpcPath?.distance.toFixed(4) ?? "--"} / surface=${directSurfaceOnlyPath?.distance.toFixed(4) ?? "--"} / player=${directSurfacePlayerPath?.distance.toFixed(4) ?? "--"} / transitions=${directSurfacePlayerTransitions.length}/${directSurfaceOnlyTransitions.length}`
    });
    directSurfaceShortcutLink.endpointA.node.dispose();
    directSurfaceShortcutLink.endpointB.node.dispose();

    const linkedNavigationWorld = await createNavigationWorld(data, [
      primaryTeleportLink,
      elevatedTeleportLink
    ]);
    pendingNavigationWorlds.push(linkedNavigationWorld);

    const primaryLinkStart = new Vector3(3.9, 0, -1.5);
    const primaryLinkEnd = new Vector3(5.1, 0, -1.5);
    const primaryWithoutLink = findNavigationPath(
      navigationWorld,
      primaryLinkStart,
      primaryLinkEnd,
      "npc"
    );
    const primaryNpcForward = findNavigationPath(
      linkedNavigationWorld,
      primaryLinkStart,
      primaryLinkEnd,
      "npc"
    );
    const primaryNpcBackward = findNavigationPath(
      linkedNavigationWorld,
      primaryLinkEnd,
      primaryLinkStart,
      "npc"
    );
    const primaryPlayerForward = findNavigationPath(
      linkedNavigationWorld,
      primaryLinkStart,
      primaryLinkEnd,
      "player"
    );
    const primaryForwardTransitions =
      primaryNpcForward?.steps.filter((step) => step.kind === "transition") ?? [];
    const primaryBackwardTransitions =
      primaryNpcBackward?.steps.filter((step) => step.kind === "transition") ?? [];
    const primaryPlayerTransitions =
      primaryPlayerForward?.steps.filter((step) => step.kind === "transition") ?? [];
    checks.push({
      name: "汎用teleportのplayer・NPC双方向経路",
      ok:
        primaryWithoutLink === null &&
        primaryNpcForward !== null &&
        primaryNpcBackward !== null &&
        primaryPlayerForward !== null &&
        primaryForwardTransitions.length === 1 &&
        primaryBackwardTransitions.length === 1 &&
        primaryPlayerTransitions.length === 1 &&
        primaryForwardTransitions[0].link.id === primaryTeleportLink.id &&
        primaryBackwardTransitions[0].link.id === primaryTeleportLink.id &&
        primaryPlayerTransitions[0].link.id === primaryTeleportLink.id &&
        primaryForwardTransitions[0].from === "A" &&
        primaryBackwardTransitions[0].from === "B",
      detail: `npc=${primaryForwardTransitions.length}/${primaryBackwardTransitions.length}遷移 / player=${primaryPlayerTransitions.length}遷移`
    });

    const lowerIsland = new Vector3(-9.5, 0, -1.5);
    const upperIsland = new Vector3(-9.5, 0.8, -1.5);
    const elevatedWithoutLink = findNavigationPath(
      navigationWorld,
      lowerIsland,
      upperIsland,
      "npc"
    );
    const elevatedNpcForward = findNavigationPath(
      linkedNavigationWorld,
      lowerIsland,
      upperIsland,
      "npc"
    );
    const elevatedNpcBackward = findNavigationPath(
      linkedNavigationWorld,
      upperIsland,
      lowerIsland,
      "npc"
    );
    const elevatedPlayerForward = findNavigationPath(
      linkedNavigationWorld,
      lowerIsland,
      upperIsland,
      "player"
    );
    const elevatedForwardTransition = elevatedNpcForward?.steps.find(
      (step) => step.kind === "transition"
    );
    const elevatedBackwardTransition = elevatedNpcBackward?.steps.find(
      (step) => step.kind === "transition"
    );
    const elevatedPlayerTransition = elevatedPlayerForward?.steps.find(
      (step) => step.kind === "transition"
    );
    const elevatedEndpointMaximumY = Math.max(
      elevatedTeleportLink.endpointA.position.y,
      elevatedTeleportLink.endpointB.position.y
    );
    checks.push({
      name: "高さの異なるNavMesh島を結ぶ汎用teleport",
      ok:
        elevatedWithoutLink === null &&
        elevatedForwardTransition?.link.id === elevatedTeleportLink.id &&
        elevatedBackwardTransition?.link.id === elevatedTeleportLink.id &&
        elevatedPlayerTransition?.link.id === elevatedTeleportLink.id &&
        elevatedForwardTransition.from === "A" &&
        elevatedBackwardTransition.from === "B" &&
        elevatedEndpointMaximumY === 1.05,
      detail: `up=${elevatedForwardTransition?.link.kind ?? "none"} / down=${elevatedBackwardTransition?.link.kind ?? "none"} / player=${elevatedPlayerTransition?.link.kind ?? "none"} / maxY=${elevatedEndpointMaximumY.toFixed(2)}`
    });

    const transitionAgent = createNavigationAgent(
      linkedNavigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    const primaryStartLocation = requireNavigationLocation(
      linkedNavigationWorld,
      primaryLinkStart
    );
    const primaryEndLocation = requireNavigationLocation(
      linkedNavigationWorld,
      primaryLinkEnd
    );
    const transitionAgentStep = transitionAgent.update(
      primaryStartLocation,
      primaryLinkEnd,
      0,
      10,
      1,
      true
    );
    checks.push({
      name: "特殊接続入口でのtransition-required",
      ok:
        transitionAgentStep.state === "transition-required" &&
        transitionAgentStep.transition?.link.id === primaryTeleportLink.id &&
        transitionAgentStep.transition.from === "A" &&
        transitionAgentStep.transition.to === "B" &&
        Vector3.Distance(
          transitionAgentStep.location.position,
          primaryStartLocation.position
        ) <= 1e-5 &&
        Vector3.Distance(
          transitionAgentStep.transition.entry.position,
          primaryStartLocation.position
        ) <= 1e-5 &&
        Vector3.Distance(
          transitionAgentStep.transition.exit.position,
          primaryEndLocation.position
        ) <= 1e-5 &&
        Vector3.Distance(
          transitionAgentStep.location.position,
          primaryEndLocation.position
        ) >= 0.5,
      detail: `state=${transitionAgentStep.state} / link=${transitionAgentStep.transition?.link.id ?? "none"}`
    });
    if (!transitionAgentStep.transition) {
      throw new Error("特殊接続完了検証に必要なtransitionがありません。");
    }
    transitionAgent.completeTransition(transitionAgentStep.transition.exit);
    const transitionCompletedStep = transitionAgent.update(
      transitionAgentStep.transition.exit,
      primaryLinkEnd,
      0,
      10,
      1,
      false
    );
    const duplicateCompletionMessage = captureThrownMessage(() =>
      transitionAgent.completeTransition(transitionAgentStep.transition!.exit)
    );
    checks.push({
      name: "completeTransition後の残経路再開",
      ok:
        transitionCompletedStep.state !== "transition-required" &&
        transitionCompletedStep.transition === null &&
        duplicateCompletionMessage?.includes("完了対象") === true,
      detail: `state=${transitionCompletedStep.state} / duplicate=${duplicateCompletionMessage ?? "none"}`
    });
    transitionAgent.clear();

    const oneWayTeleportLink = createValidationLinkPair(
      "one-way-teleport-validation",
      "teleport",
      new Vector3(3.9, 0.25, -1.5),
      new Vector3(5.1, 0.25, -1.5),
      false
    );
    let oneWayTeleportWorld: NavigationWorld | null = null;
    let oneWayForward: NavigationPath | null = null;
    let oneWayBackward: NavigationPath | null = null;
    try {
      oneWayTeleportWorld = await createNavigationWorld(data, [
        oneWayTeleportLink
      ]);
      oneWayForward = findNavigationPath(
        oneWayTeleportWorld,
        primaryLinkStart,
        primaryLinkEnd,
        "npc"
      );
      oneWayBackward = findNavigationPath(
        oneWayTeleportWorld,
        primaryLinkEnd,
        primaryLinkStart,
        "npc"
      );
    } finally {
      oneWayTeleportWorld?.dispose();
    }
    const oneWayForwardTransitions =
      oneWayForward?.steps.filter((step) => step.kind === "transition") ?? [];
    checks.push({
      name: "汎用teleportの片方向接続",
      ok:
        oneWayForwardTransitions.length === 1 &&
        oneWayForwardTransitions[0].link.id === oneWayTeleportLink.id &&
        oneWayForwardTransitions[0].from === "A" &&
        oneWayBackward === null,
      detail: `forward=${oneWayForwardTransitions.map((step) => step.link.id).join(">") || "none"} / backward=${oneWayBackward === null ? "不可" : "可"}`
    });

    linkedNavigationWorld.dispose();
    pendingNavigationWorlds.splice(
      pendingNavigationWorlds.indexOf(linkedNavigationWorld),
      1
    );
    for (const link of [
      primaryTeleportLink,
      elevatedTeleportLink,
      oneWayTeleportLink
    ]) {
      link.endpointA.node.dispose();
      link.endpointB.node.dispose();
    }

    const projectedPoint = navigationWorld.projectPoint(new Vector3(3, 0.1, -1.5), 0.2);
    const queryOrigin = requireNavigationLocation(
      navigationWorld,
      new Vector3(3, 0, -1.5)
    );
    const constrainedPoint = navigationWorld.constrainMovement(
      queryOrigin,
      new Vector3(3, 0, 1.5)
    );
    const randomPoint = navigationWorld.randomPointAround(queryOrigin, 0.5);
    const randomDistance = randomPoint
      ? Vector3.Distance(randomPoint.position, queryOrigin.position)
      : Number.POSITIVE_INFINITY;
    checks.push({
      name: "本番NavigationWorld問い合わせ",
      ok:
        projectedPoint !== null &&
        Math.abs(projectedPoint.position.y) <= 0.02 &&
        constrainedPoint !== null &&
        constrainedPoint.position.z < 0 &&
        randomPoint !== null &&
        randomDistance <= 0.5 + 1e-5,
      detail: `projectY=${projectedPoint?.position.y.toFixed(4) ?? "--"} / constrainZ=${constrainedPoint?.position.z.toFixed(4) ?? "--"} / random=${Number.isFinite(randomDistance) ? randomDistance.toFixed(4) : "--"}`
    });

    const routeStartLocation = requireNavigationLocation(
      navigationWorld,
      routeStart
    );
    const rampStartLocation = requireNavigationLocation(
      navigationWorld,
      rampStart
    );
    const cacheAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    const initialAgentStep = cacheAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      0,
      0,
      true
    );
    const cachedAgentStep = cacheAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      0,
      0.25,
      true
    );
    const progressedAgentStep = cacheAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      1,
      0.1,
      false
    );
    const movedAgentTarget = routeEnd.add(new Vector3(0.3, 0, 0));
    const movedTargetAgentStep = cacheAgent.update(
      progressedAgentStep.location,
      movedAgentTarget,
      1,
      0,
      0,
      true
    );
    checks.push({
      name: "3D経路追従の初回探索とキャッシュ",
      ok:
        initialAgentStep.pathRecalculated &&
        initialAgentStep.state === "moving" &&
        !cachedAgentStep.pathRecalculated &&
        initialAgentStep.remainingPathDistance !== null &&
        progressedAgentStep.remainingPathDistance !== null &&
        progressedAgentStep.remainingPathDistance <
          initialAgentStep.remainingPathDistance,
      detail: `initial=${initialAgentStep.pathRecalculated} / cached=${cachedAgentStep.pathRecalculated} / remaining=${initialAgentStep.remainingPathDistance?.toFixed(3) ?? "none"}->${progressedAgentStep.remainingPathDistance?.toFixed(3) ?? "none"}`
    });
    checks.push({
      name: "goal revisionによる経路再計算",
      ok:
        movedTargetAgentStep.pathRecalculated &&
        movedTargetAgentStep.state === "moving",
      detail: `targetMove=${Vector3.Distance(routeEnd, movedAgentTarget).toFixed(3)} / recalculated=${movedTargetAgentStep.pathRecalculated}`
    });

    const unreachableAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    const unreachableTarget = new Vector3(-6.5, 0, -1.5);
    const unreachableInitial = unreachableAgent.update(
      routeStartLocation,
      unreachableTarget,
      0,
      1,
      0,
      true
    );
    const unreachableCached = unreachableAgent.update(
      routeStartLocation,
      unreachableTarget,
      0,
      1,
      0.5,
      true
    );
    const unreachableRetry = unreachableAgent.update(
      routeStartLocation,
      unreachableTarget,
      1,
      1,
      0.5,
      true
    );
    checks.push({
      name: "到達不能時の停止とrevision変更後再探索",
      ok:
        unreachableInitial.state === "unreachable" &&
        Vector3.Distance(
          unreachableInitial.location.position,
          routeStartLocation.position
        ) <= 1e-6 &&
        !unreachableCached.pathRecalculated &&
        Vector3.Distance(
          unreachableCached.location.position,
          routeStartLocation.position
        ) <= 1e-6 &&
        unreachableRetry.pathRecalculated &&
        unreachableRetry.state === "unreachable" &&
        Vector3.Distance(
          unreachableRetry.location.position,
          routeStartLocation.position
        ) <= 1e-6,
      detail: `initial=${unreachableInitial.pathRecalculated} / cached=${unreachableCached.pathRecalculated} / retry=${unreachableRetry.pathRecalculated}`
    });

    const stuckAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    stuckAgent.update(routeStartLocation, routeEnd, 0, 1, 0, true);
    const stuckWaiting = stuckAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      1,
      0.3,
      true
    );
    const stuckRecalculated = stuckAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      1,
      0.3,
      true
    );
    checks.push({
      name: "移動停止判定による経路再計算",
      ok:
        !stuckWaiting.pathRecalculated &&
        stuckRecalculated.pathRecalculated,
      detail: `waiting=${stuckWaiting.pathRecalculated} / stuck=${stuckRecalculated.pathRecalculated}`
    });

    const rampAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    const rampAgentStep = rampAgent.update(
      rampStartLocation,
      rampEnd,
      0,
      0.75,
      1,
      true
    );
    checks.push({
      name: "3D経路追従の斜面高度",
      ok:
        rampAgentStep.state === "moving" &&
        rampAgentStep.location.position.y > 0.02 &&
        rampAgentStep.location.position.y < rampEnd.y,
      detail: `positionY=${rampAgentStep.location.position.y.toFixed(4)} / targetY=${rampEnd.y.toFixed(4)}`
    });

    const reportedTileBoundaryStart = Object.freeze({
      position: new Vector3(
        -8.849987983703613,
        0.4749617874622345,
        2.0998854637145996
      ),
      polygonRef: 6326784
    });
    const reportedTileBoundaryWaypoint = Object.freeze({
      position: new Vector3(-8.850000381469727, 0.5, 2.125),
      polygonRef: 6327296
    });
    const reportedTileBoundaryConstrained = Object.freeze({
      position: new Vector3(
        -8.850000381469727,
        0.5,
        2.10345458984375
      ),
      polygonRef: 6327296
    });
    const reportedTileBoundaryDesired = new Vector3(
      -8.849989745654112,
      0.47852017779347616,
      2.103454701053599
    );
    const observedTileBoundaryDestination = {
      value: null as Vector3 | null
    };
    const reportedTileBoundaryWorld = createNavigationAgentConstraintStub(
      reportedTileBoundaryWaypoint,
      reportedTileBoundaryConstrained,
      (destination) => {
        observedTileBoundaryDestination.value = destination;
      }
    );
    const reportedTileBoundaryAgent = createNavigationAgent(
      reportedTileBoundaryWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      schoolNpcNavigationAgentConfig
    );
    const reportedTileBoundaryDeltaSeconds = 0.0168;
    const reportedTileBoundaryMovementBudget =
      schoolNpcChaseSpeed * reportedTileBoundaryDeltaSeconds;
    const reportedTileBoundaryStep = reportedTileBoundaryAgent.update(
      reportedTileBoundaryStart,
      reportedTileBoundaryWaypoint.position,
      0,
      schoolNpcChaseSpeed,
      reportedTileBoundaryDeltaSeconds,
      true
    );
    const reportedTileBoundaryFullDistance = Vector3.Distance(
      reportedTileBoundaryStart.position,
      reportedTileBoundaryStep.location.position
    );
    const reportedTileBoundaryHorizontalDistance = Math.hypot(
      reportedTileBoundaryStep.location.position.x -
        reportedTileBoundaryStart.position.x,
      reportedTileBoundaryStep.location.position.z -
        reportedTileBoundaryStart.position.z
    );
    const reportedTileBoundaryDesiredError =
      observedTileBoundaryDestination.value === null
        ? Number.POSITIVE_INFINITY
        : Vector3.Distance(
            observedTileBoundaryDestination.value,
            reportedTileBoundaryDesired
          );
    checks.push({
      name: "tiled NavMesh境界のY snapを水平移動超過と誤判定しない",
      ok:
        reportedTileBoundaryStep.state === "moving" &&
        reportedTileBoundaryStep.pathRecalculated &&
        reportedTileBoundaryStep.location.polygonRef ===
          reportedTileBoundaryConstrained.polygonRef &&
        Vector3.Distance(
          reportedTileBoundaryStep.location.position,
          reportedTileBoundaryConstrained.position
        ) <= 1e-12 &&
        reportedTileBoundaryDesiredError <= 1e-11 &&
        reportedTileBoundaryFullDistance >
          reportedTileBoundaryMovementBudget +
            schoolNpcNavigationAgentConfig.waypointTolerance &&
        reportedTileBoundaryHorizontalDistance <=
          reportedTileBoundaryMovementBudget + 1e-12,
      detail:
        `delta=${reportedTileBoundaryDeltaSeconds} / ` +
        `budget=${reportedTileBoundaryMovementBudget.toFixed(9)} / ` +
        `full=${reportedTileBoundaryFullDistance.toFixed(9)} / ` +
        `horizontal=${reportedTileBoundaryHorizontalDistance.toFixed(9)} / ` +
        `desiredError=${reportedTileBoundaryDesiredError.toExponential(2)} / ` +
        `polygon=${reportedTileBoundaryStart.polygonRef}->${reportedTileBoundaryStep.location.polygonRef}`
    });

    const horizontalOverrunLocation = Object.freeze({
      position: new Vector3(
        reportedTileBoundaryStart.position.x +
          reportedTileBoundaryMovementBudget +
          schoolNpcNavigationAgentConfig.waypointTolerance +
          0.001,
        reportedTileBoundaryStart.position.y,
        reportedTileBoundaryStart.position.z
      ),
      polygonRef: reportedTileBoundaryStart.polygonRef
    });
    const horizontalOverrunWorld = createNavigationAgentConstraintStub(
      reportedTileBoundaryWaypoint,
      horizontalOverrunLocation,
      () => {}
    );
    const horizontalOverrunMessage = captureThrownMessage(() => {
      const horizontalOverrunAgent = createNavigationAgent(
        horizontalOverrunWorld,
        "npc",
        DISTANCE_NAVIGATION_ROUTE_POLICY,
        schoolNpcNavigationAgentConfig
      );
      horizontalOverrunAgent.update(
        reportedTileBoundaryStart,
        reportedTileBoundaryWaypoint.position,
        0,
        schoolNpcChaseSpeed,
        reportedTileBoundaryDeltaSeconds,
        true
      );
    });
    checks.push({
      name: "NavMesh水平移動予算の実超過拒否",
      ok:
        horizontalOverrunMessage?.includes(
          "NavMesh移動拘束結果が指定水平移動距離を超えました。"
        ) === true,
      detail: horizontalOverrunMessage ?? "例外なし"
    });

    const waypointAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    const waypointStep = waypointAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      100,
      1,
      true
    );
    const routeEndpoint = routePath[routePath.length - 1];
    checks.push({
      name: "移動予算内の複数経路点通過",
      ok:
        routePath.length >= 3 &&
        waypointStep.state === "arrived" &&
        Vector3.Distance(waypointStep.location.position, routeEndpoint) <= 1e-5,
      detail: `${routePath.length}点 / endpointError=${Vector3.Distance(waypointStep.location.position, routeEndpoint).toExponential(2)}`
    });

    const projectedTargetAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    const floatingTarget = routeEnd.add(new Vector3(0, 0.05, 0));
    const floatingTargetProjection = navigationWorld.projectPoint(
      floatingTarget,
      navigationAgentConfig.projectionMaxDistance
    );
    const projectedTargetStep = projectedTargetAgent.update(
      routeStartLocation,
      floatingTarget,
      0,
      100,
      1,
      true
    );
    checks.push({
      name: "NavMesh投影標的への到着",
      ok:
        floatingTargetProjection !== null &&
        projectedTargetStep.state === "arrived" &&
        Vector3.Distance(
          projectedTargetStep.location.position,
          floatingTargetProjection.position
        ) <=
          1e-5,
      detail: `rawY=${floatingTarget.y.toFixed(4)} / projectedY=${floatingTargetProjection?.position.y.toFixed(4) ?? "--"} / state=${projectedTargetStep.state}`
    });

    const clearAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      DISTANCE_NAVIGATION_ROUTE_POLICY,
      navigationAgentConfig
    );
    clearAgent.update(routeStartLocation, routeEnd, 0, 0, 0, true);
    const beforeClear = clearAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      0,
      0.1,
      true
    );
    clearAgent.clear();
    const afterClear = clearAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      0,
      0,
      true
    );
    checks.push({
      name: "3D経路追従状態のclear",
      ok: !beforeClear.pathRecalculated && afterClear.pathRecalculated,
      detail: `before=${beforeClear.pathRecalculated} / after=${afterClear.pathRecalculated}`
    });

    let schoolLoadMs = 0;
    const spatialEngine = new NullEngine();
    const spatialScene = new Scene(spatialEngine);
    try {
      const spawnVolumeMesh = MeshBuilder.CreateBox(
        "VOL_NpcSpawn_SamplerValidation",
        { size: 4 },
        spatialScene
      );
      spawnVolumeMesh.position.set(3, 1, -2);
      const spawnVolume: StageVolume = Object.freeze({
        id: "sampler-validation",
        role: "npc_spawn",
        playerSpawnId: null,
        npcSpawnBiasWeight: null,
        bitFlightBand: null,
        navigationAreaId: null,
        mesh: spawnVolumeMesh
      });
      const emptyMovementColliders = Object.freeze({
        player: Object.freeze([]),
        npc: Object.freeze([]),
        bit: Object.freeze([])
      });
      const spawnVolumeQueries = createFixtureSpatialQueries(
        spatialScene,
        {
          movementColliders: emptyMovementColliders,
          groundColliders: [],
          beamBlockers: [],
          sightBlockers: [],
          bitObstacles: []
        },
        [spawnVolume]
      );
      const projectToGround = (position: Vector3) =>
        Object.freeze({
          position: new Vector3(position.x, 0, position.z),
          polygonRef: 1
        });

      const singleRandom = createRandomSequence([0.5, 0.75, 0.5]);
      let singleProjectionMaxDistance = Number.NaN;
      const singleSampler = createStageSpawnSampler(
        spawnVolume,
        createProjectionNavigationStub((position, maxDistance) => {
          singleProjectionMaxDistance = maxDistance;
          return projectToGround(position);
        }),
        {
          maxAttempts: 1,
          projectionMaxDistance: 2,
          random: singleRandom.random
        }
      );
      const singleSpawnPoint = singleSampler.samplePoint();
      checks.push({
        name: "3D spawn volume内のNavMesh投影点",
        ok:
          spawnVolumeQueries.containsVolume(
            "npc_spawn",
            singleSpawnPoint.position
          ) &&
          Vector3.Distance(singleSpawnPoint.position, new Vector3(3, 0, -2)) <=
            1e-6 &&
          singleProjectionMaxDistance === 2 &&
          singleRandom.getCallCount() === 3,
        detail: `point=(${singleSpawnPoint.position.x.toFixed(3)}, ${singleSpawnPoint.position.y.toFixed(3)}, ${singleSpawnPoint.position.z.toFixed(3)}) / projection=${singleProjectionMaxDistance}`
      });

      const multipleRandom = createRandomSequence([
        0.25, 0.5, 0.25,
        0.75, 0.5, 0.75,
        0.25, 0.5, 0.75
      ]);
      const multipleSampler = createStageSpawnSampler(
        spawnVolume,
        createProjectionNavigationStub((position) => projectToGround(position)),
        {
          maxAttempts: 1,
          projectionMaxDistance: 2,
          random: multipleRandom.random
        }
      );
      const multipleSpawnPoints = multipleSampler.samplePoints(3, 2);
      const pairDistances = [
        Vector3.Distance(
          multipleSpawnPoints[0].position,
          multipleSpawnPoints[1].position
        ),
        Vector3.Distance(
          multipleSpawnPoints[0].position,
          multipleSpawnPoints[2].position
        ),
        Vector3.Distance(
          multipleSpawnPoints[1].position,
          multipleSpawnPoints[2].position
        )
      ];
      checks.push({
        name: "複数spawn点の最小3D距離",
        ok:
          multipleSpawnPoints.every((point) =>
            spawnVolumeQueries.containsVolume("npc_spawn", point.position)
          ) &&
          pairDistances.every((distance) => distance >= 2 - 1e-6),
        detail: pairDistances.map((distance) => distance.toFixed(3)).join(" / ")
      });

      const duplicateRandom = createRandomSequence([
        0.25, 0.5, 0.25,
        0.25, 0.5, 0.25,
        0.75, 0.5, 0.75
      ]);
      const duplicateSampler = createStageSpawnSampler(
        spawnVolume,
        createProjectionNavigationStub((position) => projectToGround(position)),
        {
          maxAttempts: 2,
          projectionMaxDistance: 2,
          random: duplicateRandom.random
        }
      );
      const duplicateCheckedPoints = duplicateSampler.samplePoints(2, 0);
      checks.push({
        name: "同一spawn候補の再利用拒否",
        ok:
          duplicateRandom.getCallCount() === 9 &&
          Vector3.Distance(
            duplicateCheckedPoints[0].position,
            duplicateCheckedPoints[1].position
          ) > 0,
        detail: `randomCalls=${duplicateRandom.getCallCount()} / distance=${Vector3.Distance(duplicateCheckedPoints[0].position, duplicateCheckedPoints[1].position).toFixed(3)}`
      });

      const projectionFailureRandom = createRandomSequence([
        0.5, 0.5, 0.5,
        0.5, 0.5, 0.5
      ]);
      const projectionFailureSampler = createStageSpawnSampler(
        spawnVolume,
        createProjectionNavigationStub(() => null),
        {
          maxAttempts: 2,
          projectionMaxDistance: 2,
          random: projectionFailureRandom.random
        }
      );
      const projectionFailureMessage = captureThrownMessage(() => {
        projectionFailureSampler.samplePoint();
      });
      checks.push({
        name: "NavMesh投影失敗の厳格例外",
        ok:
          projectionFailureMessage?.includes("sampler-validation") === true &&
          projectionFailureMessage.includes("NavMesh投影失敗=2"),
        detail: projectionFailureMessage ?? "例外なし"
      });

      const invalidRandomSampler = createStageSpawnSampler(
        spawnVolume,
        createProjectionNavigationStub((position) => projectToGround(position)),
        {
          maxAttempts: 1,
          projectionMaxDistance: 2,
          random: () => 1
        }
      );
      const invalidRandomMessage = captureThrownMessage(() => {
        invalidRandomSampler.samplePoint();
      });
      checks.push({
        name: "spawn乱数範囲の厳格検証",
        ok: invalidRandomMessage?.includes("0以上1未満") === true,
        detail: invalidRandomMessage ?? "例外なし"
      });
      spawnVolumeMesh.dispose();

      const actorOnlyWindow = MeshBuilder.CreateBox(
        "COL_ActorOnly_Window_Validation",
        { size: 0.4 },
        spatialScene
      );
      const humanOnlyWindow = MeshBuilder.CreateBox(
        "COL_HumanOnly_Window_Validation",
        { size: 0.4 },
        spatialScene
      );
      const normalWall = MeshBuilder.CreateBox(
        "COL_Wall_Validation",
        { size: 0.4 },
        spatialScene
      );
      const lowCeiling = MeshBuilder.CreateBox(
        "COL_Ceiling_LowValidation",
        { width: 1, height: 0.1, depth: 1 },
        spatialScene
      );
      actorOnlyWindow.position.x = 0;
      humanOnlyWindow.position.x = 1;
      normalWall.position.x = 2;
      lowCeiling.position.set(4, 0.5, 0);
      [actorOnlyWindow, humanOnlyWindow, normalWall, lowCeiling].forEach(
        (mesh) => mesh.computeWorldMatrix(true)
      );
      const normalClassificationColliders = [normalWall, lowCeiling];
      const actorClassificationColliders = [actorOnlyWindow];
      const humanClassificationColliders = [humanOnlyWindow];
      const humanMovementClassificationColliders = [
        ...normalClassificationColliders,
        ...actorClassificationColliders,
        ...humanClassificationColliders
      ];
      const bitMovementClassificationColliders = [
        ...normalClassificationColliders,
        ...actorClassificationColliders
      ];
      const classificationQueries = createFixtureSpatialQueries(
        spatialScene,
        {
          movementColliders: {
            player: humanMovementClassificationColliders,
            npc: humanMovementClassificationColliders,
            bit: bitMovementClassificationColliders
          },
          groundColliders: normalClassificationColliders,
          beamBlockers: normalClassificationColliders,
          sightBlockers: normalClassificationColliders,
          bitObstacles: bitMovementClassificationColliders
        },
        []
      );
      const classificationStart = new Vector3(-2, 0, 0);
      const classificationEnd = new Vector3(4, 0, 0);
      const actorOnlyHits = ["player", "npc", "bit"] as const;
      const closedWindowHits = actorOnlyHits.map((moverKind) =>
        classificationQueries.castMovementSegment(
          moverKind,
          classificationStart,
          new Vector3(0.5, 0, 0)
        )
      );
      const humanWindowPlayerHit = classificationQueries.castMovementSegment(
        "player",
        new Vector3(0.5, 0, 0),
        new Vector3(1.5, 0, 0)
      );
      const humanWindowNpcHit = classificationQueries.castMovementSegment(
        "npc",
        new Vector3(0.5, 0, 0),
        new Vector3(1.5, 0, 0)
      );
      const humanWindowBitHit = classificationQueries.castMovementSegment(
        "bit",
        new Vector3(0.5, 0, 0),
        new Vector3(1.5, 0, 0)
      );
      const beamThroughWindowHit = classificationQueries.castBeamSegment(
        classificationStart,
        classificationEnd
      );
      const sightThroughWindowHit = classificationQueries.castSightSegment(
        classificationStart,
        classificationEnd
      );
      checks.push({
        name: "閉じた窓の全移動体遮断と光線透過",
        ok:
          closedWindowHits.every((hit) => hit?.mesh === actorOnlyWindow) &&
          beamThroughWindowHit?.mesh === normalWall &&
          sightThroughWindowHit?.mesh === normalWall,
        detail: `movement=${closedWindowHits.map((hit) => hit?.mesh.name ?? "--").join("/")} / beam=${beamThroughWindowHit?.mesh.name ?? "--"} / sight=${sightThroughWindowHit?.mesh.name ?? "--"}`
      });
      checks.push({
        name: "HumanOnly窓の人間遮断とビット通過",
        ok:
          humanWindowPlayerHit?.mesh === humanOnlyWindow &&
          humanWindowNpcHit?.mesh === humanOnlyWindow &&
          humanWindowBitHit === null,
        detail: `player=${humanWindowPlayerHit?.mesh.name ?? "--"} / npc=${humanWindowNpcHit?.mesh.name ?? "--"} / bit=${humanWindowBitHit?.mesh.name ?? "none"}`
      });
      const ceilingHit = classificationQueries.castMovementSegment(
        "bit",
        new Vector3(4, 0.1, 0),
        new Vector3(4, 0.8, 0)
      );
      const outdoorCeilingHit = classificationQueries.castMovementSegment(
        "bit",
        new Vector3(6, 0.1, 0),
        new Vector3(6, 0.8, 0)
      );
      checks.push({
        name: "低い天井と天井なし屋外の問い合わせ",
        ok:
          ceilingHit?.mesh === lowCeiling &&
          ceilingHit.normal.y < 0 &&
          Math.abs(ceilingHit.point.y - 0.45) <= 1e-4 &&
          outdoorCeilingHit === null,
        detail: `ceiling=${ceilingHit?.point.y.toFixed(3) ?? "none"} / normalY=${ceilingHit?.normal.y.toFixed(3) ?? "none"} / outdoor=${outdoorCeilingHit?.mesh.name ?? "none"}`
      });
      actorOnlyWindow.dispose();
      humanOnlyWindow.dispose();
      normalWall.dispose();
      lowCeiling.dispose();

      const beamWall = MeshBuilder.CreateBox(
        "COL_Wall_BeamCollisionValidation",
        { size: 0.2 },
        spatialScene
      );
      beamWall.position.x = 2;
      const beamWallStage = createBeamValidationStage(
        spatialScene,
        [beamWall]
      );
      const beamStart = Vector3.Zero();
      const beamEnd = new Vector3(4, 0, 0);
      const actorBeforeWall = createBeamTargetFixture(
        "actor-before-wall",
        "npc",
        new Vector3(1, 0, 0),
        new Vector3(0.2, 0.2, 0.2)
      );
      const actorAfterWall = createBeamTargetFixture(
        "actor-after-wall",
        "npc",
        new Vector3(3, 0, 0),
        new Vector3(0.2, 0.2, 0.2)
      );
      const actorOnWallSurface = createBeamTargetFixture(
        "actor-on-wall-surface",
        "npc",
        new Vector3(2, 0, 0),
        new Vector3(0.1, 0.1, 0.1)
      );
      const actorFirstHit = castV2BeamSegment(
        beamWallStage,
        beamStart,
        beamEnd,
        [actorBeforeWall],
        "fixture-beam",
        ALIVE_HUMANS_BEAM_POLICY
      );
      const wallFirstHit = castV2BeamSegment(
        beamWallStage,
        beamStart,
        beamEnd,
        [actorAfterWall],
        "fixture-beam",
        ALIVE_HUMANS_BEAM_POLICY
      );
      const equalDistanceHit = castV2BeamSegment(
        beamWallStage,
        beamStart,
        beamEnd,
        [actorOnWallSurface],
        "fixture-beam",
        ALIVE_HUMANS_BEAM_POLICY
      );
      checks.push({
        name: "通常ビームの標的・壁の最近傍判定",
        ok:
          actorFirstHit?.kind === "actor" &&
          actorFirstHit.actor.id === actorBeforeWall.id &&
          wallFirstHit?.kind === "blocker" &&
          wallFirstHit.mesh === beamWall &&
          equalDistanceHit?.kind === "blocker" &&
          equalDistanceHit.mesh === beamWall,
        detail: `actorFirst=${actorFirstHit?.kind ?? "--"} / wallFirst=${wallFirstHit?.kind ?? "--"} / equal=${equalDistanceHit?.kind ?? "--"}`
      });

      const playerRadiusWallThickness = 0.01;
      const playerRadiusWall = MeshBuilder.CreateBox(
        "COL_Wall_PlayerRadiusValidation",
        {
          width: playerRadiusWallThickness,
          height: 1,
          depth: 1
        },
        spatialScene
      );
      playerRadiusWall.position.x = 2;
      const playerRadiusWallStage = createBeamValidationStage(
        spatialScene,
        [playerRadiusWall]
      );
      const playerHorizontalRadius = PLAYER_SPRITE_WIDTH * 0.5;
      const playerCenter = new Vector3(
        playerRadiusWall.position.x +
          playerRadiusWallThickness * 0.5 +
          playerHorizontalRadius,
        0,
        0
      );
      const playerActor = createBeamTargetFixture(
        "player-radius-validation",
        "player",
        playerCenter,
        new Vector3(
          playerHorizontalRadius,
          PLAYER_SPRITE_HEIGHT * 0.5,
          playerHorizontalRadius
        )
      );
      const legacyOversizedPlayerActor = createBeamTargetFixture(
        playerActor.id,
        playerActor.kind,
        playerCenter,
        new Vector3(
          PLAYER_SPRITE_HEIGHT * 0.5,
          PLAYER_SPRITE_HEIGHT * 0.5,
          PLAYER_SPRITE_HEIGHT * 0.5
        )
      );
      const playerRadiusHit = castV2BeamSegment(
        playerRadiusWallStage,
        beamStart,
        beamEnd,
        [playerActor],
        "fixture-beam",
        ALIVE_HUMANS_BEAM_POLICY
      );
      const legacyRadiusHit = castV2BeamSegment(
        playerRadiusWallStage,
        beamStart,
        beamEnd,
        [legacyOversizedPlayerActor],
        "fixture-beam",
        ALIVE_HUMANS_BEAM_POLICY
      );
      checks.push({
        name: "プレイヤー水平半径と壁優先衝突",
        ok:
          playerHorizontalRadius === 0.1 &&
          playerRadiusHit?.kind === "blocker" &&
          playerRadiusHit.mesh === playerRadiusWall &&
          legacyRadiusHit?.kind === "actor" &&
          legacyRadiusHit.actor.id === playerActor.id,
        detail: `radius=${playerHorizontalRadius.toFixed(6)} / hit=${playerRadiusHit?.kind ?? "--"} / legacyRadius=${legacyOversizedPlayerActor.hitShape.radii.x.toFixed(6)} / legacyHit=${legacyRadiusHit?.kind ?? "--"}`
      });
      playerRadiusWall.dispose();

      const beamWindow = MeshBuilder.CreateBox(
        "COL_ActorOnly_Window_BeamCollisionValidation",
        { size: 0.2 },
        spatialScene
      );
      beamWindow.position.x = 1;
      const beamWindowStage = createBeamValidationStage(
        spatialScene,
        [],
        [beamWindow]
      );
      const windowBeamHit = castV2BeamSegment(
        beamWindowStage,
        beamStart,
        new Vector3(1.5, 0, 0),
        [],
        "fixture-beam",
        ALIVE_HUMANS_BEAM_POLICY
      );
      const windowSightHit = castV2SightSegment(
        beamWindowStage,
        beamStart,
        new Vector3(1.5, 0, 0)
      );
      const normalWallBeamHit = castV2BeamSegment(
        beamWallStage,
        beamStart,
        beamEnd,
        [],
        "fixture-beam",
        ALIVE_HUMANS_BEAM_POLICY
      );
      const normalWallSightHit = castV2SightSegment(
        beamWallStage,
        beamStart,
        beamEnd
      );
      checks.push({
        name: "ActorOnly窓の透過と通常壁のビーム・視線遮蔽",
        ok:
          windowBeamHit === null &&
          !windowSightHit.occluded &&
          normalWallBeamHit?.kind === "blocker" &&
          normalWallBeamHit.mesh === beamWall &&
          normalWallSightHit.occluded &&
          normalWallSightHit.mesh === beamWall,
        detail: `windowBeam=${windowBeamHit?.kind ?? "none"} / windowSight=${windowSightHit.occluded} / wallBeam=${normalWallBeamHit?.kind ?? "--"} / wallSight=${normalWallSightHit.occluded}`
      });

      const highSpeedBeamSystem = createV2BeamSystem({
        scene: spatialScene,
        stage: beamWallStage,
        getHumanTargets: () => [],
        random: () => 0.5,
        getOrbVisibilityPredicate: () => () => true
      });
      const highSpeedBeamId = highSpeedBeamSystem.spawn({
        sourceId: "bit-fast",
        originKind: "bit-chase",
        targetPolicy: ALIVE_HUMANS_BEAM_POLICY,
        origin: beamStart,
        direction: Vector3.Right(),
        speed: 100,
        maximumLifetime: 1
      });
      const highSpeedEvents = highSpeedBeamSystem.update(0.1);
      const highSpeedImpactSnapshot =
        highSpeedBeamSystem.getActiveBeams()[0];
      const highSpeedRetractionEvents = highSpeedBeamSystem.update(0.1);
      checks.push({
        name: "前フレーム位置からの高速ビーム連続衝突",
        ok:
          highSpeedEvents.impacts.length === 1 &&
          highSpeedEvents.impacts[0].beamId === highSpeedBeamId &&
          highSpeedEvents.impacts[0].hit.kind === "blocker" &&
          highSpeedEvents.impacts[0].hit.mesh === beamWall &&
          highSpeedEvents.expirations.length === 0 &&
          highSpeedImpactSnapshot.phase === "retracting" &&
          highSpeedRetractionEvents.impacts.length === 0 &&
          highSpeedRetractionEvents.expirations.length === 0 &&
          highSpeedBeamSystem.activeCount === 0,
        detail: `impacts=${highSpeedEvents.impacts.length} / expirations=${highSpeedEvents.expirations.length} / phase=${highSpeedImpactSnapshot?.phase ?? "--"} / retractImpacts=${highSpeedRetractionEvents.impacts.length} / active=${highSpeedBeamSystem.activeCount}`
      });
      highSpeedBeamSystem.dispose();

      const emptyBeamStage = createBeamValidationStage(spatialScene, []);
      const lifetimeBeamSystem = createV2BeamSystem({
        scene: spatialScene,
        stage: emptyBeamStage,
        getHumanTargets: () => [],
        random: () => 0.5,
        getOrbVisibilityPredicate: () => () => true
      });
      const lifetimeBeamId = lifetimeBeamSystem.spawn({
        sourceId: "bit-lifetime",
        originKind: "bit-chase",
        targetPolicy: ALIVE_HUMANS_BEAM_POLICY,
        origin: beamStart,
        direction: Vector3.Right(),
        speed: 8,
        maximumLifetime: 0.25
      });
      const lifetimeEvents = lifetimeBeamSystem.update(1);
      const lifetimeExpiration = lifetimeEvents.expirations[0];
      const lifetimeExpirationSnapshot =
        lifetimeBeamSystem.getActiveBeams()[0];
      const lifetimeRetractionEvents = lifetimeBeamSystem.update(0.25);
      checks.push({
        name: "通常ビームの寿命終端イベント",
        ok:
          lifetimeEvents.impacts.length === 0 &&
          lifetimeEvents.expirations.length === 1 &&
          lifetimeExpiration.beamId === lifetimeBeamId &&
          lifetimeExpiration.sourceId === "bit-lifetime" &&
          Vector3.Distance(
            lifetimeExpiration.position,
            new Vector3(2, 0, 0)
          ) <= 1e-6 &&
          lifetimeExpirationSnapshot.phase === "retracting" &&
          lifetimeRetractionEvents.impacts.length === 0 &&
          lifetimeRetractionEvents.expirations.length === 0 &&
          lifetimeBeamSystem.activeCount === 0,
        detail: `impacts=${lifetimeEvents.impacts.length} / expirations=${lifetimeEvents.expirations.length} / positionX=${lifetimeExpiration?.position.x.toFixed(3) ?? "--"} / phase=${lifetimeExpirationSnapshot?.phase ?? "--"} / active=${lifetimeBeamSystem.activeCount}`
      });
      lifetimeBeamSystem.dispose();
      beamWindow.dispose();
      beamWall.dispose();

      const baselineResources = countSceneResources(spatialScene);
      let schoolContext: StageSpatialContext | null = null;
      const schoolQueryPrototype = NavMeshQuery.prototype;
      const originalSchoolFindPath = schoolQueryPrototype.findPath;
      let schoolRecastPathfindCount = 0;
      schoolQueryPrototype.findPath = function (
        this: NavMeshQuery,
        ...args: Parameters<NavMeshQuery["findPath"]>
      ) {
        schoolRecastPathfindCount += 1;
        return originalSchoolFindPath.apply(this, args);
      };
      try {
        let navigationAreaLocateCount = 0;
        let navigationAreaAdvanceCount = 0;
        let navigationAreaTransitionCount = 0;
        const schoolLoadStartedAt = performance.now();
        schoolContext = await loadStageSpatialContext(
          spatialScene,
          SCHOOL_VALIDATION_STAGE,
          {
            initializeDynamicSpatial:
              createSchoolStageDynamicSpatialInitializer(0),
            roomVariantSelections:
              SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS,
            queryDiagnostics: {
              recordRayQuery: () => undefined,
              recordNavigationAreaQuery: (kind, _portalCount, transitioned) => {
                if (kind === "locate") {
                  navigationAreaLocateCount += 1;
                } else {
                  navigationAreaAdvanceCount += 1;
                }
                navigationAreaTransitionCount += transitioned ? 1 : 0;
              }
            }
          }
        );
        schoolLoadMs = performance.now() - schoolLoadStartedAt;
        const schoolConstructionPathfindCount = schoolRecastPathfindCount;
        const loadedSchoolContext = schoolContext;

        const mainPlayerSpawn = schoolContext.playerSpawns.getById(
          "player-spawn-main"
        );
        if (!mainPlayerSpawn) {
          throw new Error("T04 fixtureのPlayer開始地点がありません。");
        }
        const playerSpawn =
          mainPlayerSpawn.marker.node.getAbsolutePosition();
        const expectedPlayerSpawn = new Vector3(0.375, 0, 0);
        const navigationAreaIds = schoolContext.navigationAreas.all.map(
          (area) => area.id
        );
        const groundAreaLocation =
          schoolContext.navigationAreas.locate(playerSpawn);
        const firstAreaPortalLocation =
          schoolContext.navigationAreas.advance(
            groundAreaLocation,
            playerSpawn,
            new Vector3(
              0,
              3.575 * BLENDER_METERS_TO_WORLD_UNITS,
              0
            )
          );
        const upperAreaCenter = schoolContext.navigationAreas
          .getById("school-upper-01")!
          .volumes[0].mesh.getBoundingInfo().boundingBox.centerWorld;
        const upperAreaLocation =
          schoolContext.navigationAreas.locate(upperAreaCenter);
        const highSpeedUpperAreaLocation =
          schoolContext.navigationAreas.advance(
            groundAreaLocation,
            playerSpawn,
            upperAreaCenter
          );
        const locateCountBeforeContinuousUpdates =
          navigationAreaLocateCount;
        let continuousAreaCursor = groundAreaLocation;
        for (let updateIndex = 0; updateIndex < 1_000; updateIndex += 1) {
          continuousAreaCursor = schoolContext.navigationAreas.advance(
            continuousAreaCursor,
            playerSpawn,
            playerSpawn
          );
        }
        const continuousUpdatesDidNotLocate =
          navigationAreaLocateCount ===
          locateCountBeforeContinuousUpdates;
        const lazyAreaTracker = createV2TargetNavigationAreaTracker(
          schoolContext.navigationAreas
        );
        const groundTrackedTarget = createHumanTargetFixture(
          "area-tracker-player",
          "player",
          playerSpawn.clone(),
          playerSpawn.add(new Vector3(0, PLAYER_SPRITE_HEIGHT, 0))
        );
        const upperTrackedTarget = createHumanTargetFixture(
          "area-tracker-player",
          "player",
          upperAreaCenter.clone(),
          upperAreaCenter.add(new Vector3(0, PLAYER_SPRITE_HEIGHT, 0))
        );
        const portalTrackedPosition = new Vector3(
          0,
          3.575 * BLENDER_METERS_TO_WORLD_UNITS,
          0
        );
        const portalTrackedTarget = createHumanTargetFixture(
          "area-tracker-player",
          "player",
          portalTrackedPosition,
          portalTrackedPosition.add(
            new Vector3(0, PLAYER_SPRITE_HEIGHT, 0)
          )
        );
        lazyAreaTracker.beginFrame(Object.freeze([groundTrackedTarget]));
        const trackedGround = lazyAreaTracker.resolve(
          groundTrackedTarget.id
        );
        lazyAreaTracker.beginFrame(Object.freeze([groundTrackedTarget]));
        lazyAreaTracker.beginFrame(Object.freeze([portalTrackedTarget]));
        const trackedInsidePortal = lazyAreaTracker.resolve(
          portalTrackedTarget.id
        );
        lazyAreaTracker.beginFrame(Object.freeze([upperTrackedTarget]));
        const trackedAfterUnreferencedMove = lazyAreaTracker.resolve(
          upperTrackedTarget.id
        );
        lazyAreaTracker.relocate(
          upperTrackedTarget.id,
          playerSpawn
        );
        lazyAreaTracker.beginTransport(
          upperTrackedTarget.id,
          playerSpawn
        );
        const elevatorMidpoint = Vector3.Lerp(
          playerSpawn,
          upperAreaCenter,
          0.5
        );
        lazyAreaTracker.updateTransportPosition(
          upperTrackedTarget.id,
          elevatorMidpoint
        );
        const elevatorTrackedTarget = createHumanTargetFixture(
          upperTrackedTarget.id,
          "player",
          elevatorMidpoint,
          elevatorMidpoint.add(
            new Vector3(0, PLAYER_SPRITE_HEIGHT, 0)
          )
        );
        lazyAreaTracker.beginFrame(
          Object.freeze([elevatorTrackedTarget])
        );
        const trackedDuringTransport = lazyAreaTracker.resolve(
          elevatorTrackedTarget.id
        );
        lazyAreaTracker.relocate(
          elevatorTrackedTarget.id,
          upperAreaCenter
        );
        lazyAreaTracker.beginFrame(Object.freeze([upperTrackedTarget]));
        const trackedAfterDisembark = lazyAreaTracker.resolve(
          upperTrackedTarget.id
        );
        lazyAreaTracker.dispose();
        checks.push({
          name: "学校Navigation Area／Portal作者契約",
          ok:
            navigationAreaIds.length === 5 &&
            schoolContext.navigationAreas.portals.length === 4 &&
            groundAreaLocation.areaId === "school-ground" &&
            firstAreaPortalLocation.areaId === "school-ground" &&
            firstAreaPortalLocation.portalId ===
              "navigation-area-portal-01" &&
            upperAreaLocation.areaId === "school-upper-01" &&
            upperAreaLocation.portalId === null &&
            highSpeedUpperAreaLocation.areaId === "school-upper-01" &&
            continuousUpdatesDidNotLocate &&
            navigationAreaAdvanceCount === 1_004 &&
            navigationAreaTransitionCount === 2 &&
            continuousAreaCursor.areaId === "school-ground" &&
            trackedGround.areaId === "school-ground" &&
            trackedInsidePortal.areaId === "school-ground" &&
            trackedAfterUnreferencedMove.areaId === "school-upper-01" &&
            trackedDuringTransport.areaId === "school-ground" &&
            trackedAfterDisembark.areaId === "school-upper-01",
          detail: `areas=${navigationAreaIds.join(",")} / portals=${schoolContext.navigationAreas.portals.length} / ground=${groundAreaLocation.areaId} / boundary=${firstAreaPortalLocation.areaId}:${firstAreaPortalLocation.portalId ?? "none"} / upper=${upperAreaLocation.areaId} / highSpeed=${highSpeedUpperAreaLocation.areaId} / continuous=${navigationAreaAdvanceCount} / locate=${navigationAreaLocateCount} / lazy=${trackedGround.areaId}->${trackedInsidePortal.areaId}->${trackedAfterUnreferencedMove.areaId} / transport=${trackedDuringTransport.areaId}->${trackedAfterDisembark.areaId}`
        });
        const bitTransitions = schoolContext.bitNavigation.transitions;
        const apertureTransitions = bitTransitions.filter(
          (transition) => transition.kind === "aperture"
        );
        const verticalTransitions = bitTransitions.filter(
          (transition) => transition.kind === "vertical"
        );
        const surfaceRouteTransitions = bitTransitions.filter(
          (transition) => transition.kind === "surface-route"
        );
        const boundaryTransitions = bitTransitions.filter(
          (transition) => transition.kind === "boundary"
        );
        const bitSpawnVolumes =
          schoolContext.volumes.getByRole("bit_spawn");
        const playerSpawnExclusions = schoolContext.volumes.getByRole(
          "player_spawn_exclusion"
        );
        const assemblyAnchors =
          schoolContext.markers.getByRole("assembly_anchor");
        const assemblyVolumes =
          schoolContext.volumes.getByRole("assembly");
        const assemblyVenueSummaries = schoolContext.assemblyVenues.all.map(
          (venue) =>
            `${venue.id}:${venue.volume.id}/${venue.assemblyPositions.length}/${venue.executionAudiencePositions.length}/${venue.executionTargetPositions.length}/w${venue.selectionWeight}`
        );
        const assemblyVenuesOk =
          schoolContext.assemblyVenues.all.length === 2 &&
          assemblyVenueSummaries.join("|") ===
            "assembly-courtyard:assembly-volume-courtyard/100/94/6/w1|assembly-gym:assembly-volume-gym/100/94/6/w1" &&
          schoolContext.assemblyVenues.all.every(
            (venue) =>
              venue.anchor.role === "assembly_anchor" &&
              venue.anchor.id === venue.id &&
              venue.volume.role === "assembly" &&
              Vector3.Distance(
                venue.center,
                venue.anchor.node.getAbsolutePosition()
              ) <= 1e-6
          );
        const roomVariantSelectionOk =
          schoolContext.roomVariants?.variants.length === 40 &&
          schoolContext.roomVariants.tileVolumes.length === 20 &&
          schoolContext.roomVariantSelection.length === 20 &&
          schoolContext.roomVariantSelection.every(
            (selection) => selection.variant === "normal"
          );
        const resourceCountsOk =
          schoolContext.resources.visualMeshes.length === 618 &&
          schoolContext.resources.normalColliders.length === 276 &&
          schoolContext.resources.actorOnlyColliders.length === 81 &&
          schoolContext.resources.humanOnlyColliders.length === 59 &&
          schoolContext.resources.beamSightOnlyColliders.length === 1 &&
          schoolContext.resources.beamSightOnlyColliders[0]?.name ===
            "COL_BeamSightOnly_B03_Interior_F01_Infirmary_Curtains" &&
          schoolContext.resources.humanNavigationSources.length === 39 &&
          schoolContext.resources.bitFlightNavSourceMeshes.length === 22 &&
          schoolContext.markers.all.length === 289 &&
          assemblyAnchors.length === 2 &&
          schoolContext.volumes.all.length === 228 &&
          schoolContext.navigationAreas.all.length === 5 &&
          schoolContext.navigationAreas.portals.length === 4 &&
          assemblyVolumes.length === 2 &&
          roomVariantSelectionOk &&
          schoolContext.doorAssets.all.length === 67 &&
          schoolContext.elevatorAssets.all.length === 1 &&
          schoolContext.links.all.length === 1 &&
          schoolContext.bitNavigation.zones.length === 4 &&
          schoolContext.bitNavigation.bands.length === 11 &&
          apertureTransitions.length === 57 &&
          verticalTransitions.length === 4 &&
          surfaceRouteTransitions.length === 10 &&
          boundaryTransitions.length === 1 &&
          schoolContext.worldBoundary?.id === "world-limit" &&
          bitTransitions.every((transition) => transition.bidirectional);
        checks.push({
          name: "学校GLBの厳格分類と3D意味Object",
          ok:
            schoolContext.metadata.stageId === "school" &&
            schoolContext.metadata.navProfileId ===
              "school-humanoid-room-variants-v2" &&
            schoolContext.metadata.bitNavProfileId ===
              SCHOOL_VALIDATION_STAGE.bitNavProfileId &&
            resourceCountsOk &&
            assemblyVenuesOk &&
            Vector3.Distance(playerSpawn, expectedPlayerSpawn) <= 1e-5 &&
            schoolContext.boundary.contains(playerSpawn) &&
            schoolContext.playerSpawns.all.length === 11 &&
            playerSpawnExclusions.length === 11 &&
            schoolContext.volumes.getByRole("npc_spawn").length === 5 &&
            bitSpawnVolumes.length === 11 &&
            bitSpawnVolumes.every(
              (volume) => volume.bitFlightBand !== null
            ) &&
            schoolContext.volumes.getByRole("water").length === 1 &&
            schoolConstructionPathfindCount === 0,
          detail: `VIS=${schoolContext.resources.visualMeshes.length} / COL=${schoolContext.resources.normalColliders.length} / ActorOnly=${schoolContext.resources.actorOnlyColliders.length} / HumanOnly=${schoolContext.resources.humanOnlyColliders.length} / BeamSightOnly=${schoolContext.resources.beamSightOnlyColliders.length}:${schoolContext.resources.beamSightOnlyColliders[0]?.name ?? "なし"} / humanNAV=${schoolContext.resources.humanNavigationSources.length} / bitNAV=${schoolContext.resources.bitFlightNavSourceMeshes.length} / MRK=${schoolContext.markers.all.length}(assembly=${assemblyAnchors.length}) / VOL=${schoolContext.volumes.all.length}(assembly=${assemblyVolumes.length},water=${schoolContext.volumes.getByRole("water").length}) / roomVariants=${schoolContext.roomVariants?.variants.length ?? 0}/${schoolContext.roomVariants?.tileVolumes.length ?? 0}/selected=${schoolContext.roomVariantSelection.length} / doors=${schoolContext.doorAssets.all.length} / elevators=${schoolContext.elevatorAssets.all.length} / venues=${assemblyVenueSummaries.join("|")} / humanLNK=${schoolContext.links.all.length} / zones=${schoolContext.bitNavigation.zones.length} / bands=${schoolContext.bitNavigation.bands.length} / transitions=${bitTransitions.length}(aperture=${apertureTransitions.length},vertical=${verticalTransitions.length},surface=${surfaceRouteTransitions.length},boundary=${boundaryTransitions.length}) / buildPathfind=${schoolConstructionPathfindCount} / spawn=(${playerSpawn.x.toFixed(3)}, ${playerSpawn.y.toFixed(3)}, ${playerSpawn.z.toFixed(3)})`
        });

        const schoolBitSafety = createBitFlightSafety(
          schoolContext.queries
        );
        const transitionAgentResults: BitTransitionAgentAcceptance[] = [];
        const orderedBitTransitions = Object.freeze([
          ...bitTransitions.filter(
            (transition) => transition.kind !== "aperture"
          ),
          ...bitTransitions.filter(
            (transition) => transition.kind === "aperture"
          )
        ]);
        await new Promise<void>((resolve) =>
          setTimeout(() => resolve(), 0)
        );
        for (const transition of orderedBitTransitions) {
          for (const reversed of [false, true]) {
            transitionAgentResults.push(
              executeBitTransitionAgentAcceptance(
                schoolContext,
                schoolBitSafety,
                transition,
                reversed
              )
            );
            const currentNonWindowResults =
              transitionAgentResults.filter((result) => {
                const completedTransition = bitTransitions.find(
                  (candidate) =>
                    candidate.id === result.transitionId
                );
                return completedTransition?.kind !== "aperture";
              });
            summary.textContent =
              `学校ビット遷移を実測しています。` +
              `${transitionAgentResults.length}/${bitTransitions.length * 2}` +
              ` / 非窓PASS=${currentNonWindowResults.filter(
                didBitTransitionAgentPass
              ).length}/${currentNonWindowResults.length}`;
            await new Promise<void>((resolve) =>
              setTimeout(() => resolve(), 0)
            );
          }
        }
        const nonWindowTransitionAgentResults =
          transitionAgentResults.filter((result) => {
            const transition = bitTransitions.find(
              (candidate) => candidate.id === result.transitionId
            );
            return transition?.kind !== "aperture";
          });
        const windowTransitionAgentResults =
          transitionAgentResults.filter((result) => {
            const transition = bitTransitions.find(
              (candidate) => candidate.id === result.transitionId
            );
            return transition?.kind === "aperture";
          });
        const nonWindowTransitionPasses =
          nonWindowTransitionAgentResults.filter(
            didBitTransitionAgentPass
          );
        const windowTransitionPasses =
          windowTransitionAgentResults.filter(didBitTransitionAgentPass);
        checks.push({
          name: "学校非窓15遷移の実飛行Agent双方向受入",
          ok:
            nonWindowTransitionAgentResults.length === 30 &&
            nonWindowTransitionPasses.length === 30,
          detail:
            `pass=${nonWindowTransitionPasses.length}/` +
            `${nonWindowTransitionAgentResults.length} / ` +
            `failures=${nonWindowTransitionAgentResults
              .filter((result) => !didBitTransitionAgentPass(result))
              .slice(0, 4)
              .map(describeBitTransitionAgentFailure)
              .join(", ") || "none"}`
        });
        checks.push({
          name: "学校57窓遷移の実飛行Agent双方向受入（現行1.20m開口ブロッカー）",
          ok:
            windowTransitionAgentResults.length === 114 &&
            windowTransitionPasses.length === 114,
          detail:
            `pass=${windowTransitionPasses.length}/` +
            `${windowTransitionAgentResults.length} / ` +
            `現行開口半幅0.60m > 必要安全包絡半径${BIT_FLIGHT_ENVELOPE_RADIUS_METERS.toFixed(2)}m / ` +
            `failures=${windowTransitionAgentResults
              .filter((result) => !didBitTransitionAgentPass(result))
              .slice(0, 4)
              .map(describeBitTransitionAgentFailure)
              .join(", ") || "none"}`
        });

        const stageDestination = blenderPointToBabylon(
          new Vector3(47.0, -6.5, 1.0)
        );
        const npcPathfindStartCount = schoolRecastPathfindCount;
        const schoolPath = findSurfaceNavigationPath(
          schoolContext.navigation,
          playerSpawn,
          stageDestination,
          "npc"
        );
        const npcDirectPathfindCount =
          schoolRecastPathfindCount - npcPathfindStartCount;
        const playerPathfindStartCount = schoolRecastPathfindCount;
        const playerSchoolPath = findSurfaceNavigationPath(
          schoolContext.navigation,
          playerSpawn,
          stageDestination,
          "player"
        );
        const playerDirectPathfindCount =
          schoolRecastPathfindCount - playerPathfindStartCount;
        const projectedStageDestination = schoolContext.navigation.projectPoint(
          stageDestination,
          0.1
        );
        const schoolPathPoints = getNavigationPathPoints(schoolPath);
        const schoolPathEndpoint =
          schoolPathPoints[schoolPathPoints.length - 1] ?? null;
        const schoolPathEndpointError = schoolPathEndpoint && projectedStageDestination
          ? Vector3.Distance(
              schoolPathEndpoint,
              projectedStageDestination.position
            )
          : Number.POSITIVE_INFINITY;
        const chestPosition = playerSpawn.add(new Vector3(0, 0.2, 0));
        const outsidePosition = new Vector3(5.5, 0.2, 0);
        const actorWallHit = schoolContext.queries.castMovementSegment(
          "player",
          chestPosition,
          outsidePosition
        );
        const beamWallHit = schoolContext.queries.castBeamSegment(
          chestPosition,
          outsidePosition
        );
        const sightWallHit = schoolContext.queries.castSightSegment(
          chestPosition,
          outsidePosition
        );
        checks.push({
          name: "学校NavMesh完全経路と実壁遮蔽",
          ok:
            schoolPath !== null &&
            playerSchoolPath !== null &&
            projectedStageDestination !== null &&
            schoolPathEndpointError <= 1e-5 &&
            npcDirectPathfindCount === 3 &&
            playerDirectPathfindCount === 3 &&
            actorWallHit !== null &&
            beamWallHit !== null &&
            sightWallHit !== null &&
            actorWallHit.mesh === beamWallHit.mesh &&
            beamWallHit.mesh === sightWallHit.mesh,
          detail: `${schoolPathPoints.length}点 / endpointError=${Number.isFinite(schoolPathEndpointError) ? schoolPathEndpointError.toExponential(2) : "--"} / pathfind=npc:${npcDirectPathfindCount},player:${playerDirectPathfindCount} / blocker=${beamWallHit?.mesh.name ?? "--"}`
        });

        const stairBounds = Object.freeze({
          NW: blenderBoundsToBabylon(
            new Vector3(-12.0, 38.0, 0.2),
            new Vector3(-7.0, 44.8, 10.7)
          ),
          NE: blenderBoundsToBabylon(
            new Vector3(42.0, 38.0, 0.2),
            new Vector3(47.0, 44.8, 10.7)
          ),
          SW: blenderBoundsToBabylon(
            new Vector3(-12.0, -3.0, 0.2),
            new Vector3(-5.0, 2.0, 10.7)
          )
        });
        const findContainingStaircase = (position: Vector3) =>
          (Object.entries(stairBounds) as readonly [
            "NW" | "NE" | "SW",
            Readonly<{ minimum: Vector3; maximum: Vector3 }>
          ][]).find(
            ([, bounds]) =>
              position.x >= bounds.minimum.x &&
              position.x <= bounds.maximum.x &&
              position.y >= bounds.minimum.y &&
              position.y <= bounds.maximum.y &&
              position.z >= bounds.minimum.z &&
              position.z <= bounds.maximum.z
          )?.[0] ?? null;
        const upperFloorRepresentatives = [
          ["2F床", new Vector3(-2.0, 15.0, 3.6)],
          ["2F階段", new Vector3(-11.4, 38.7, 3.6)],
          ["3F床", new Vector3(-2.0, 15.0, 7.2)],
          ["3F階段", new Vector3(-11.4, 38.7, 7.2)],
          ["4F床", new Vector3(-2.0, 15.0, 10.8)],
          ["4F階段", new Vector3(-11.4, 38.7, 10.8)],
          ["屋上", new Vector3(-5.5, 39.5, 14.4)],
          ["プールサイド", new Vector3(12.0, 39.0, 15.65)],
          ["プール底", new Vector3(23.4, 39.0, 14.61)]
        ] as const;
        const schoolNavigation = schoolContext.navigation;
        const forbiddenInitialSpawnSurfaceRepresentatives = [
          ["2F渡り廊下屋根", new Vector3(41.4, 29.5, 7.05)],
          ["屋上階段室屋根", new Vector3(-9.6, 42.2, 17.0)],
          ["男子更衣室屋根", new Vector3(-4.35, 42.0, 17.0)],
          ["女子更衣室屋根", new Vector3(0.15, 42.0, 17.0)]
        ] as const;
        const forbiddenInitialSpawnSurfaceResults =
          forbiddenInitialSpawnSurfaceRepresentatives.map(
            ([label, blenderPoint]) => ({
              label,
              projected: schoolNavigation.projectPoint(
                blenderPointToBabylon(blenderPoint),
                0.1
              )
            })
          );
        checks.push({
          name: "初期NPC生成対象外屋根の人物Nav面除外",
          ok: forbiddenInitialSpawnSurfaceResults.every(
            (result) => result.projected === null
          ),
          detail: forbiddenInitialSpawnSurfaceResults
            .map(
              (result) =>
                `${result.label}=${result.projected?.position.toString() ?? "null"}`
            )
            .join(" / ")
        });

        const retainedGymRoofRouteRepresentatives = [
          ["校舎屋上", new Vector3(-5.5, 39.5, 14.4)],
          ["体育館屋上", new Vector3(41.4, 24.0, 9.6)],
          ["3F接続床", new Vector3(41.4, 33.4, 7.2)],
          ["体育館屋上Ramp", new Vector3(41.4, 29.5, 8.4)]
        ] as const;
        const retainedGymRoofRouteResults =
          retainedGymRoofRouteRepresentatives.map(([label, blenderPoint]) => ({
            label,
            point: blenderPointToBabylon(blenderPoint),
            projected: schoolNavigation.projectPoint(
              blenderPointToBabylon(blenderPoint),
              0.1
            )
          }));
        const thirdFloorGymRoofStart = retainedGymRoofRouteResults[2];
        const thirdFloorGymRoofDestination = retainedGymRoofRouteResults[1];
        const thirdFloorGymRoofForwardPath = findNavigationPath(
          schoolNavigation,
          thirdFloorGymRoofStart.point,
          thirdFloorGymRoofDestination.point,
          "npc"
        );
        const thirdFloorGymRoofBackwardPath = findNavigationPath(
          schoolNavigation,
          thirdFloorGymRoofDestination.point,
          thirdFloorGymRoofStart.point,
          "npc"
        );
        const thirdFloorGymRoofForwardPoints = getNavigationPathPoints(
          thirdFloorGymRoofForwardPath
        );
        const thirdFloorGymRoofBackwardPoints = getNavigationPathPoints(
          thirdFloorGymRoofBackwardPath
        );
        const gymRoofRampBounds = blenderBoundsToBabylon(
          new Vector3(39.4, 26.5, 7.1),
          new Vector3(43.4, 32.5, 9.7)
        );
        const thirdFloorGymRoofForwardEndpointError =
          thirdFloorGymRoofDestination.projected &&
          thirdFloorGymRoofForwardPoints.length > 0
            ? Vector3.Distance(
                thirdFloorGymRoofForwardPoints[
                  thirdFloorGymRoofForwardPoints.length - 1
                ],
                thirdFloorGymRoofDestination.projected.position
              )
            : Number.POSITIVE_INFINITY;
        const thirdFloorGymRoofBackwardEndpointError =
          thirdFloorGymRoofStart.projected &&
          thirdFloorGymRoofBackwardPoints.length > 0
            ? Vector3.Distance(
                thirdFloorGymRoofBackwardPoints[
                  thirdFloorGymRoofBackwardPoints.length - 1
                ],
                thirdFloorGymRoofStart.projected.position
              )
            : Number.POSITIVE_INFINITY;
        checks.push({
          name: "校舎屋上・体育館屋上・3F屋上Rampの人物Nav維持",
          ok:
            retainedGymRoofRouteResults.every(
              (result) => result.projected !== null
            ) &&
            thirdFloorGymRoofForwardPath !== null &&
            thirdFloorGymRoofBackwardPath !== null &&
            thirdFloorGymRoofForwardPath.steps.every(
              (step) => step.kind === "surface"
            ) &&
            thirdFloorGymRoofBackwardPath.steps.every(
              (step) => step.kind === "surface"
            ) &&
            pathPassesBounds(
              thirdFloorGymRoofForwardPoints,
              gymRoofRampBounds
            ) &&
            pathPassesBounds(
              thirdFloorGymRoofBackwardPoints,
              gymRoofRampBounds
            ) &&
            thirdFloorGymRoofForwardEndpointError <= 1e-5 &&
            thirdFloorGymRoofBackwardEndpointError <= 1e-5,
          detail:
            retainedGymRoofRouteResults
              .map(
                (result) =>
                  `${result.label}=${result.projected?.position.toString() ?? "null"}`
              )
              .join(" / ") +
            ` / path=${thirdFloorGymRoofForwardPoints.length}/${thirdFloorGymRoofBackwardPoints.length}点` +
            ` / ramp=${pathPassesBounds(thirdFloorGymRoofForwardPoints, gymRoofRampBounds)}/${pathPassesBounds(thirdFloorGymRoofBackwardPoints, gymRoofRampBounds)}` +
            ` / error=${Number.isFinite(thirdFloorGymRoofForwardEndpointError) ? thirdFloorGymRoofForwardEndpointError.toExponential(1) : "--"}/${Number.isFinite(thirdFloorGymRoofBackwardEndpointError) ? thirdFloorGymRoofBackwardEndpointError.toExponential(1) : "--"}`
        });
        const correctedGroundRouteCases = [
          {
            label: "体育館南壁・南塀間",
            start: new Vector3(34.2, -13.2, -0.3),
            destination: new Vector3(58.6, -13.2, -0.3),
            requiredMinimum: new Vector3(45.6, -13.3, -0.5),
            requiredMaximum: new Vector3(47.2, -12.4, -0.1)
          },
          {
            label: "主玄関6台ロッカー間",
            start: new Vector3(-1.2, -6.6, 0.0),
            destination: new Vector3(-1.2, -3.0, 0.0),
            requiredMinimum: new Vector3(-1.70, -5.15, -0.2),
            requiredMaximum: new Vector3(-0.70, -4.65, 0.2)
          }
        ] as const;
        const correctedGroundRouteResults = correctedGroundRouteCases.map(
          (route) => {
            const start = blenderPointToBabylon(route.start);
            const destination = blenderPointToBabylon(route.destination);
            const projectedStart = schoolNavigation.projectPoint(start, 0.1);
            const projectedDestination = schoolNavigation.projectPoint(
              destination,
              0.1
            );
            const requiredBounds = blenderBoundsToBabylon(
              route.requiredMinimum,
              route.requiredMaximum
            );
            const actorResults = (["player", "npc"] as const).map((actorKind) => {
              const forwardPath = findNavigationPath(
                schoolNavigation,
                start,
                destination,
                actorKind
              );
              const backwardPath = findNavigationPath(
                schoolNavigation,
                destination,
                start,
                actorKind
              );
              const forwardPoints = getNavigationPathPoints(forwardPath);
              const backwardPoints = getNavigationPathPoints(backwardPath);
              return {
                actorKind,
                forwardPath,
                backwardPath,
                forwardPoints,
                backwardPoints,
                forwardPassesRequired:
                  pathPassesBounds(forwardPoints, requiredBounds),
                backwardPassesRequired:
                  pathPassesBounds(backwardPoints, requiredBounds),
                forwardEndpointError:
                  projectedDestination && forwardPoints.length > 0
                    ? Vector3.Distance(
                        forwardPoints[forwardPoints.length - 1],
                        projectedDestination.position
                      )
                    : Number.POSITIVE_INFINITY,
                backwardEndpointError:
                  projectedStart && backwardPoints.length > 0
                    ? Vector3.Distance(
                        backwardPoints[backwardPoints.length - 1],
                        projectedStart.position
                      )
                    : Number.POSITIVE_INFINITY
              };
            });
            return {
              label: route.label,
              projectedStart,
              projectedDestination,
              actorResults
            };
          }
        );
        checks.push({
          name: "南側通路・6台ロッカー間のPlayer/NPC双方向Nav経路",
          ok: correctedGroundRouteResults.every(
            (route) =>
              route.projectedStart !== null &&
              route.projectedDestination !== null &&
              route.actorResults.every(
                (result) =>
                  result.forwardPath !== null &&
                  result.backwardPath !== null &&
                  result.forwardPath.steps.every(
                    (step) => step.kind === "surface"
                  ) &&
                  result.backwardPath.steps.every(
                    (step) => step.kind === "surface"
                  ) &&
                  result.forwardPassesRequired &&
                  result.backwardPassesRequired &&
                  result.forwardEndpointError <= 1e-5 &&
                  result.backwardEndpointError <= 1e-5
              )
          ),
          detail: correctedGroundRouteResults
            .map(
              (route) =>
                `${route.label}:` +
                route.actorResults
                  .map(
                    (result) =>
                      `${result.actorKind}=` +
                      `${result.forwardPoints.length}/${result.backwardPoints.length}点,` +
                      `通過=${result.forwardPassesRequired}/${result.backwardPassesRequired},` +
                      `誤差=${Number.isFinite(result.forwardEndpointError) ? result.forwardEndpointError.toExponential(1) : "--"}/` +
                      `${Number.isFinite(result.backwardEndpointError) ? result.backwardEndpointError.toExponential(1) : "--"}`
                  )
                  .join(";")
            )
            .join(" / ")
        });
        const roofGuardNorthStartX = 2.4;
        const roofGuardNorthEndX = 47.3;
        const roofGuardPostCount = Math.ceil(
          (roofGuardNorthEndX - roofGuardNorthStartX) / 1.1
        );
        const roofGuardPostSpacing =
          (roofGuardNorthEndX - roofGuardNorthStartX) /
          roofGuardPostCount;
        const roofGuardGapX =
          roofGuardNorthStartX + roofGuardPostSpacing * 6.5;
        const roofGuardNorthY = 45.4;
        const roofInsidePoint = blenderPointToBabylon(
          new Vector3(roofGuardGapX, 44.5, 14.5)
        );
        const roofOutsidePoint = blenderPointToBabylon(
          new Vector3(roofGuardGapX, 46.5, 14.5)
        );
        const roofGuardLinePoint = blenderPointToBabylon(
          new Vector3(roofGuardGapX, roofGuardNorthY, 14.5)
        );
        const projectedRoofInside = schoolNavigation.projectPoint(
          roofInsidePoint,
          0.1
        );
        const projectedRoofOutside = schoolNavigation.projectPoint(
          roofOutsidePoint,
          0.1
        );
        const constrainedRoofMovement = projectedRoofInside
          ? schoolNavigation.constrainMovement(
              projectedRoofInside,
              roofOutsidePoint
            )
          : null;
        checks.push({
          name: "屋上NorthOuter外点のNav投影拒否・内側拘束",
          ok:
            projectedRoofInside !== null &&
            projectedRoofOutside === null &&
            constrainedRoofMovement !== null &&
            constrainedRoofMovement.position.z >=
              roofGuardLinePoint.z - 1e-5,
          detail:
            `支柱数=${roofGuardPostCount} / 間隔=${roofGuardPostSpacing.toFixed(6)} / ` +
            `隙間x=${roofGuardGapX.toFixed(6)} / ` +
            `内点=${projectedRoofInside?.position.toString() ?? "null"} / ` +
            `外点=${projectedRoofOutside?.position.toString() ?? "null"} / ` +
            `拘束=${constrainedRoofMovement?.position.toString() ?? "null"} / ` +
            `柵線Z=${roofGuardLinePoint.z.toFixed(6)}`
        });
        const projectedPlayerSpawn = schoolNavigation.projectPoint(playerSpawn, 0.1);
        const upperFloorNavigationResults = upperFloorRepresentatives.map(
          ([label, blenderPoint]) => {
            const point = blenderPointToBabylon(blenderPoint);
            const projected = schoolNavigation.projectPoint(point, 0.1);
            const forwardPath = findSurfaceNavigationPath(
              schoolNavigation,
              playerSpawn,
              point,
              "npc"
            );
            const backwardPath = findSurfaceNavigationPath(
              schoolNavigation,
              point,
              playerSpawn,
              "npc"
            );
            const forwardPoints = getNavigationPathPoints(forwardPath);
            const backwardPoints = getNavigationPathPoints(backwardPath);
            return {
              label,
              projected,
              forwardPath,
              backwardPath,
              forwardEndpointError:
                projected && forwardPoints.length > 0
                  ? Vector3.Distance(
                      forwardPoints[forwardPoints.length - 1],
                      projected.position
                    )
                  : Number.POSITIVE_INFINITY,
              backwardEndpointError:
                projectedPlayerSpawn && backwardPoints.length > 0
                  ? Vector3.Distance(
                      backwardPoints[backwardPoints.length - 1],
                      projectedPlayerSpawn.position
                    )
                  : Number.POSITIVE_INFINITY
            };
          }
        );
        checks.push({
          name: "北西階段による全階・屋上・プールのNPC双方向経路",
          ok: upperFloorNavigationResults.every(
            (result) =>
              result.projected !== null &&
              result.forwardPath !== null &&
              result.backwardPath !== null &&
              result.forwardPath.steps.every((step) => step.kind === "surface") &&
              result.backwardPath.steps.every((step) => step.kind === "surface") &&
              result.forwardEndpointError <= 1e-5 &&
              result.backwardEndpointError <= 1e-5
          ),
          detail: upperFloorNavigationResults
            .map(
              (result) =>
                `${result.label}:projected=${result.projected?.position.y.toFixed(3) ?? "null"},` +
                `path=${result.forwardPath === null ? "null" : `${getNavigationPathPoints(result.forwardPath).length}点`}/${result.backwardPath === null ? "null" : `${getNavigationPathPoints(result.backwardPath).length}点`},` +
                `error=${Number.isFinite(result.forwardEndpointError) ? result.forwardEndpointError.toExponential(1) : "--"}/${Number.isFinite(result.backwardEndpointError) ? result.backwardEndpointError.toExponential(1) : "--"}`
            )
            .join(" / ")
        });

        const nodeCapacityRegressionStart = blenderPointToBabylon(
          new Vector3(14, -1, -0.25)
        );
        const nodeCapacityRegressionDestination = blenderPointToBabylon(
          new Vector3(22, 35, 15.7)
        );
        const projectedNodeCapacityRegressionStart =
          schoolNavigation.projectPoint(
            nodeCapacityRegressionStart,
            schoolNpcNavigationAgentConfig.projectionMaxDistance
          );
        const projectedNodeCapacityRegressionDestination =
          schoolNavigation.projectPoint(
            nodeCapacityRegressionDestination,
            schoolNpcNavigationAgentConfig.projectionMaxDistance
          );
        const nodeCapacityRegressionForward =
          findSurfaceNavigationPath(
          schoolNavigation,
          nodeCapacityRegressionStart,
          nodeCapacityRegressionDestination,
          "npc",
          schoolNpcNavigationAgentConfig.projectionMaxDistance
        );
        const nodeCapacityRegressionBackward =
          findSurfaceNavigationPath(
          schoolNavigation,
          nodeCapacityRegressionDestination,
          nodeCapacityRegressionStart,
          "npc",
          schoolNpcNavigationAgentConfig.projectionMaxDistance
        );
        const nodeCapacityRegressionForwardPoints =
          getNavigationPathPoints(nodeCapacityRegressionForward);
        const nodeCapacityRegressionBackwardPoints =
          getNavigationPathPoints(nodeCapacityRegressionBackward);
        const nodeCapacityRegressionForwardError =
          projectedNodeCapacityRegressionDestination &&
          nodeCapacityRegressionForwardPoints.length > 0
            ? Vector3.Distance(
                nodeCapacityRegressionForwardPoints[
                  nodeCapacityRegressionForwardPoints.length - 1
                ],
                projectedNodeCapacityRegressionDestination.position
              )
            : Number.POSITIVE_INFINITY;
        const nodeCapacityRegressionBackwardError =
          projectedNodeCapacityRegressionStart &&
          nodeCapacityRegressionBackwardPoints.length > 0
            ? Vector3.Distance(
                nodeCapacityRegressionBackwardPoints[
                  nodeCapacityRegressionBackwardPoints.length - 1
                ],
                projectedNodeCapacityRegressionStart.position
              )
            : Number.POSITIVE_INFINITY;
        checks.push({
          name: "固定グリッドNavMeshの有向node容量回帰",
          ok:
            projectedNodeCapacityRegressionStart !== null &&
            projectedNodeCapacityRegressionDestination !== null &&
            nodeCapacityRegressionForward !== null &&
            nodeCapacityRegressionBackward !== null &&
            nodeCapacityRegressionForward.steps.every(
              (step) => step.kind === "surface"
            ) &&
            nodeCapacityRegressionBackward.steps.every(
              (step) => step.kind === "surface"
            ) &&
            nodeCapacityRegressionForwardPoints.length > 0 &&
            nodeCapacityRegressionForwardPoints.length <=
              navigationPathPointCapacity &&
            nodeCapacityRegressionBackwardPoints.length > 0 &&
            nodeCapacityRegressionBackwardPoints.length <=
              navigationPathPointCapacity &&
            nodeCapacityRegressionForwardError <= 1e-5 &&
            nodeCapacityRegressionBackwardError <= 1e-5,
          detail:
            `forward=${nodeCapacityRegressionForwardPoints.length}点/` +
            `${Number.isFinite(nodeCapacityRegressionForwardError) ? nodeCapacityRegressionForwardError.toExponential(2) : "--"} / ` +
            `backward=${nodeCapacityRegressionBackwardPoints.length}点/` +
            `${Number.isFinite(nodeCapacityRegressionBackwardError) ? nodeCapacityRegressionBackwardError.toExponential(2) : "--"}`
        });

        const foldedRampChaseStart = blenderPointToBabylon(
          new Vector3(32.833, 37.0, 14.7)
        );
        const gymBridgeChaseTarget = blenderPointToBabylon(
          new Vector3(39.88, 35.312, 3.61)
        );
        const foldedRampChasePath = findNavigationPath(
          schoolNavigation,
          foldedRampChaseStart,
          gymBridgeChaseTarget,
          "npc",
          schoolNpcNavigationAgentConfig.projectionMaxDistance
        );
        const foldedRampChasePathPoints =
          getNavigationPathPoints(foldedRampChasePath);
        const foldedRampBounds = blenderBoundsToBabylon(
          new Vector3(9.9, 37.7, 14.4),
          new Vector3(16.6, 40.3, 15.8)
        );
        const foldedRampPathPoints = foldedRampChasePathPoints.filter(
          (point) =>
            point.x >= foldedRampBounds.minimum.x &&
            point.x <= foldedRampBounds.maximum.x &&
            point.y >= foldedRampBounds.minimum.y &&
            point.y <= foldedRampBounds.maximum.y &&
            point.z >= foldedRampBounds.minimum.z &&
            point.z <= foldedRampBounds.maximum.z
        );
        const expectedFoldedRampHeights = [
          14.8,
          15.25,
          15.7,
          14.75,
          14.65
        ].map((height) => height * BLENDER_METERS_TO_WORLD_UNITS);
        const foldedRampHeightTolerance =
          0.005 * BLENDER_METERS_TO_WORLD_UNITS;
        const matchedFoldedRampHeightCount =
          expectedFoldedRampHeights.filter((expectedHeight) =>
            foldedRampPathPoints.some(
              (point) =>
                Math.abs(point.y - expectedHeight) <=
                foldedRampHeightTolerance
            )
          ).length;
        const foldedRampMaximumSurfacePointCount =
          foldedRampChasePath?.steps.reduce(
            (maximum, step) =>
              step.kind === "surface"
                ? Math.max(maximum, step.points.length)
                : maximum,
            0
          ) ?? 0;
        checks.push({
          name: "屋上プール折れ斜路の全NavMesh境界高度点",
          ok:
            foldedRampChasePath !== null &&
            foldedRampChasePath.steps.every(
              (step) => step.kind === "surface"
            ) &&
            foldedRampChasePathPoints.length > 0 &&
            foldedRampChasePathPoints.length <= navigationPathPointCapacity &&
            foldedRampMaximumSurfacePointCount <=
              navigationPathPointCapacity &&
            matchedFoldedRampHeightCount ===
              expectedFoldedRampHeights.length,
          detail:
            `path=${foldedRampChasePathPoints.length}点 / ` +
            `surfaceMax=${foldedRampMaximumSurfacePointCount}点 / ` +
            `ramp=${foldedRampPathPoints.length}点 / ` +
            `height=${matchedFoldedRampHeightCount}/${expectedFoldedRampHeights.length} / ` +
            `observed=${[
              ...new Set(
                foldedRampPathPoints.map((point) =>
                  (
                    point.y / BLENDER_METERS_TO_WORLD_UNITS
                  ).toFixed(4)
                )
              )
            ].join(",") || "none"}`
        });

        const foldedRampAgentResults = [1 / 60, 0.05].map(
          (deltaSeconds) =>
            executeNavigationAgentRouteAcceptance(
              schoolNavigation,
              foldedRampChaseStart,
              gymBridgeChaseTarget,
              deltaSeconds
            )
        );
        checks.push({
          name: "屋上NPCから2F渡り廊下への実速度NavMesh追跡",
          ok: foldedRampAgentResults.every(
            (result) =>
              result.onlyUsesSurfaceSteps &&
              result.pathPointCount > 0 &&
              result.pathPointCount <= navigationPathPointCapacity &&
              result.maximumSurfacePathPointCount <=
                navigationPathPointCapacity &&
              result.horizontalMovementDistanceViolationCount === 0 &&
              result.reached &&
              result.updateCount < result.updateLimit
          ),
          detail: foldedRampAgentResults
            .map(
              (result) =>
                `delta=${result.deltaSeconds.toFixed(5)}:` +
                `state=${result.finalState},reached=${result.reached},` +
                `updates=${result.updateCount}/${result.updateLimit},` +
                `path=${result.pathPointCount},surfaceMax=${result.maximumSurfacePathPointCount},` +
                `horizontalOver=${result.horizontalMovementDistanceViolationCount},` +
                `maxHorizontalMove=${result.maximumHorizontalMovementDistance.toFixed(6)},` +
                `maxHorizontalExcess=${result.maximumHorizontalMovementDistanceExcess.toFixed(6)},` +
                `error=${result.endpointError.toExponential(2)}`
            )
            .join(" / ")
        });

        const upperSpecialRoomRoutes = [
          ["3F", 7.2, 11.5, 40.75],
          ["4F", 10.8, 9.3, 40.0]
        ].map(([floor, baseZ, destinationX, destinationY]) => {
          const z = baseZ as number;
          const start = blenderPointToBabylon(new Vector3(3.9, 40.0, z));
          const destination = blenderPointToBabylon(
            new Vector3(
              destinationX as number,
              destinationY as number,
              z
            )
          );
          const requiredDoorBounds = blenderBoundsToBabylon(
            new Vector3(6.0, 36.25, z - 0.2),
            new Vector3(7.2, 36.75, z + 0.2)
          );
          const wallBounds = blenderBoundsToBabylon(
            new Vector3(5.25, 36.5, z),
            new Vector3(5.55, 45.5, z + 3.0)
          );
          const playerPath = findNavigationPath(
            schoolNavigation,
            start,
            destination,
            "player"
          );
          const npcPath = findNavigationPath(
            schoolNavigation,
            start,
            destination,
            "npc"
          );
          const playerPoints = getNavigationPathPoints(playerPath);
          const npcPoints = getNavigationPathPoints(npcPath);
          const projectedDestination = schoolNavigation.projectPoint(
            destination,
            0.1
          );
          let agentLocation = requireNavigationLocation(
            schoolNavigation,
            start
          );
          const agent = createNavigationAgent(
            schoolNavigation,
            "npc",
            DISTANCE_NAVIGATION_ROUTE_POLICY,
            navigationAgentConfig
          );
          const agentPoints = [agentLocation.position.clone()];
          let agentState = "moving";
          let transitionRequired = false;
          for (
            let updateIndex = 0;
            updateIndex < 400 && agentState === "moving";
            updateIndex += 1
          ) {
            const result = agent.update(
              agentLocation,
              destination,
              0,
              0.5,
              0.1,
              true
            );
            agentLocation = result.location;
            agentState = result.state;
            transitionRequired =
              transitionRequired || result.state === "transition-required";
            agentPoints.push(agentLocation.position.clone());
          }
          agent.clear();
          return {
            floor,
            playerPath,
            npcPath,
            playerPoints,
            npcPoints,
            agentPoints,
            agentState,
            transitionRequired,
            directLineCrossesWall: segmentIntersectsBounds(
              start,
              destination,
              wallBounds
            ),
            playerPassesDoor: pathPassesBounds(
              playerPoints,
              requiredDoorBounds
            ),
            npcPassesDoor: pathPassesBounds(npcPoints, requiredDoorBounds),
            agentPassesDoor: pathPassesBounds(
              agentPoints,
              requiredDoorBounds
            ),
            playerCrossesWall: pathPassesBounds(playerPoints, wallBounds),
            npcCrossesWall: pathPassesBounds(npcPoints, wallBounds),
            agentCrossesWall: pathPassesBounds(agentPoints, wallBounds),
            playerEndpointError:
              projectedDestination && playerPoints.length > 0
                ? Vector3.Distance(
                    playerPoints[playerPoints.length - 1],
                    projectedDestination.position
                  )
                : Number.POSITIVE_INFINITY,
            npcEndpointError:
              projectedDestination && npcPoints.length > 0
                ? Vector3.Distance(
                    npcPoints[npcPoints.length - 1],
                    projectedDestination.position
                  )
                : Number.POSITIVE_INFINITY,
            agentEndpointError: projectedDestination
              ? Vector3.Distance(
                  agentLocation.position,
                  projectedDestination.position
                )
              : Number.POSITIVE_INFINITY
          };
        });
        checks.push({
          name: "3・4階トイレ側通路から特別教室正規扉へのsurface経路",
          ok: upperSpecialRoomRoutes.every(
            (result) =>
              result.directLineCrossesWall &&
              result.playerPath !== null &&
              result.npcPath !== null &&
              result.playerPath.steps.every(
                (step) => step.kind === "surface"
              ) &&
              result.npcPath.steps.every((step) => step.kind === "surface") &&
              result.playerPassesDoor &&
              result.npcPassesDoor &&
              result.agentPassesDoor &&
              !result.playerCrossesWall &&
              !result.npcCrossesWall &&
              !result.agentCrossesWall &&
              result.agentState === "arrived" &&
              !result.transitionRequired &&
              result.playerEndpointError <= 1e-5 &&
              result.npcEndpointError <= 1e-5 &&
              result.agentEndpointError <= 0.001
          ),
          detail: upperSpecialRoomRoutes
            .map(
              (result) =>
                `${result.floor}:path=${result.playerPoints.length}/${result.npcPoints.length},` +
                `door=${result.playerPassesDoor}/${result.npcPassesDoor}/${result.agentPassesDoor},` +
                `wall=${result.directLineCrossesWall}:${result.playerCrossesWall}/${result.npcCrossesWall}/${result.agentCrossesWall},` +
                `agent=${result.agentState},transition=${result.transitionRequired},` +
                `error=${Number.isFinite(result.playerEndpointError) ? result.playerEndpointError.toExponential(1) : "--"}/${Number.isFinite(result.npcEndpointError) ? result.npcEndpointError.toExponential(1) : "--"}/${Number.isFinite(result.agentEndpointError) ? result.agentEndpointError.toExponential(1) : "--"}`
            )
            .join(" / ")
        });

        const multiFloorStairs = [
          {
            label: "北西階段",
            passageCenters: [
              new Vector3(-9.6, 43.7, 2.4),
              new Vector3(-9.6, 43.7, 6.0),
              new Vector3(-9.6, 43.7, 9.6)
            ],
            floors: [
              ["1F", new Vector3(-11.4, 38.7, 0.0)],
              ["2F", new Vector3(-11.4, 38.7, 3.6)],
              ["3F", new Vector3(-11.4, 38.7, 7.2)],
              ["4F", new Vector3(-11.4, 38.7, 10.8)]
            ]
          },
          {
            label: "北東階段",
            passageCenters: [
              new Vector3(45.0, 43.7, 2.4),
              new Vector3(45.0, 43.7, 6.0),
              new Vector3(45.0, 43.7, 9.6)
            ],
            floors: [
              ["1F", new Vector3(43.2, 38.3, 0.0)],
              ["2F", new Vector3(43.2, 38.3, 3.6)],
              ["3F", new Vector3(43.2, 38.3, 7.2)],
              ["4F", new Vector3(43.2, 38.3, 10.8)]
            ]
          },
          {
            label: "南西階段",
            passageCenters: [
              new Vector3(-10.8, -1.3, 2.4),
              new Vector3(-10.8, -1.3, 6.0),
              new Vector3(-10.8, -1.3, 9.6)
            ],
            floors: [
              ["1F", new Vector3(-5.4, 1.3, 0.0)],
              ["2F", new Vector3(-5.4, 1.3, 3.6)],
              ["3F", new Vector3(-5.4, 1.3, 7.2)],
              ["4F", new Vector3(-5.4, 1.3, 10.8)]
            ]
          }
        ] as const;
        const multiFloorStairResults = multiFloorStairs.flatMap((stair) =>
          stair.floors.slice(1).map(([destinationFloor, destinationPoint], index) => {
            const [startFloor, startPoint] = stair.floors[index];
            const start = blenderPointToBabylon(startPoint);
            const destination = blenderPointToBabylon(destinationPoint);
            const projectedStart = schoolNavigation.projectPoint(start, 0.1);
            const projectedDestination = schoolNavigation.projectPoint(
              destination,
              0.1
            );
            const forwardPath = findNavigationPath(
              schoolNavigation,
              start,
              destination,
              "npc"
            );
            const backwardPath = findNavigationPath(
              schoolNavigation,
              destination,
              start,
              "npc"
            );
            const forwardPoints = getNavigationPathPoints(forwardPath);
            const backwardPoints = getNavigationPathPoints(backwardPath);
            const passageCenter = stair.passageCenters[index];
            const passageBounds = blenderBoundsToBabylon(
              passageCenter.subtract(new Vector3(0.8, 0.8, 0.2)),
              passageCenter.add(new Vector3(0.8, 0.8, 0.2))
            );
            return {
              label: `${stair.label}${startFloor}↔${destinationFloor}`,
              projectedStart,
              projectedDestination,
              forwardPath,
              backwardPath,
              forwardPointCount: forwardPoints.length,
              backwardPointCount: backwardPoints.length,
              forwardPassesRequiredPassage: pathPassesBounds(
                forwardPoints,
                passageBounds
              ),
              backwardPassesRequiredPassage: pathPassesBounds(
                backwardPoints,
                passageBounds
              ),
              forwardDistanceBlender:
                measurePathDistance(forwardPoints) /
                BLENDER_METERS_TO_WORLD_UNITS,
              backwardDistanceBlender:
                measurePathDistance(backwardPoints) /
                BLENDER_METERS_TO_WORLD_UNITS,
              forwardEndpointError:
                projectedDestination && forwardPoints.length > 0
                  ? Vector3.Distance(
                      forwardPoints[forwardPoints.length - 1],
                      projectedDestination.position
                    )
                  : Number.POSITIVE_INFINITY,
              backwardEndpointError:
                projectedStart && backwardPoints.length > 0
                  ? Vector3.Distance(
                      backwardPoints[backwardPoints.length - 1],
                      projectedStart.position
                    )
                  : Number.POSITIVE_INFINITY
            };
          })
        );
        const retiredUpperStairClosures = new Set([
          "COL_StairClosure_NE",
          "COL_StairClosure_SW"
        ]);
        const remainingUpperStairClosures =
          schoolContext.resources.normalColliders.filter((mesh) =>
            retiredUpperStairClosures.has(mesh.name)
          );
        checks.push({
          name: "3階段の1F～4F隣接階双方向完全経路",
          ok:
            remainingUpperStairClosures.length === 0 &&
            multiFloorStairResults.every(
              (result) =>
                result.projectedStart !== null &&
                result.projectedDestination !== null &&
                result.forwardPath !== null &&
                result.backwardPath !== null &&
                result.forwardPath.steps.every(
                  (step) => step.kind === "surface"
                ) &&
                result.backwardPath.steps.every(
                  (step) => step.kind === "surface"
                ) &&
                result.forwardPassesRequiredPassage &&
                result.backwardPassesRequiredPassage &&
                result.forwardDistanceBlender <= 25 &&
                result.backwardDistanceBlender <= 25 &&
                result.forwardEndpointError <= 1e-5 &&
                result.backwardEndpointError <= 1e-5
            ),
          detail:
            `旧closure=${remainingUpperStairClosures.map((mesh) => mesh.name).join(",") || "0件"} / ` +
            multiFloorStairResults
              .map(
                (result) =>
                  `${result.label}:projected=${result.projectedStart !== null}/${result.projectedDestination !== null},` +
                  `path=${result.forwardPointCount}/${result.backwardPointCount},` +
                  `passage=${result.forwardPassesRequiredPassage}/${result.backwardPassesRequiredPassage},` +
                  `distance=${result.forwardDistanceBlender.toFixed(2)}/${result.backwardDistanceBlender.toFixed(2)}m,` +
                  `error=${Number.isFinite(result.forwardEndpointError) ? result.forwardEndpointError.toExponential(1) : "--"}/${Number.isFinite(result.backwardEndpointError) ? result.backwardEndpointError.toExponential(1) : "--"}`
              )
              .join(" / ")
        });

        const normalColliderSet = new Set(
          schoolContext.resources.normalColliders
        );
        const actorOnlyColliderSet = new Set(
          schoolContext.resources.actorOnlyColliders
        );
        const humanOnlyColliderSet = new Set(
          schoolContext.resources.humanOnlyColliders
        );
        const beamSightOnlyColliderSet = new Set(
          schoolContext.resources.beamSightOnlyColliders
        );
        const expectedPlayerAndNpcColliders = [
          ...normalColliderSet,
          ...actorOnlyColliderSet,
          ...humanOnlyColliderSet
        ];
        const expectedBitColliders = [
          ...normalColliderSet,
          ...actorOnlyColliderSet
        ];
        const setMatches = <T>(
          actual: ReadonlySet<T>,
          expected: readonly T[]
        ) =>
          actual.size === expected.length &&
          expected.every((value) => actual.has(value));
        checks.push({
          name: "実学校Colliderのmover・beam・sight分類",
          ok:
            setMatches(
              new Set(schoolContext.resources.movementColliders.player),
              expectedPlayerAndNpcColliders
            ) &&
            setMatches(
              new Set(schoolContext.resources.movementColliders.npc),
              expectedPlayerAndNpcColliders
            ) &&
            setMatches(
              new Set(schoolContext.resources.movementColliders.bit),
              expectedBitColliders
            ) &&
            setMatches(
              new Set(schoolContext.resources.beamBlockers),
              [...normalColliderSet, ...beamSightOnlyColliderSet]
            ) &&
            setMatches(
              new Set(schoolContext.resources.sightBlockers),
              [...normalColliderSet, ...beamSightOnlyColliderSet]
            ),
          detail: `normal=${normalColliderSet.size} / ActorOnly=${actorOnlyColliderSet.size} / HumanOnly=${humanOnlyColliderSet.size} / BeamSightOnly=${beamSightOnlyColliderSet.size} / player=${schoolContext.resources.movementColliders.player.length} / npc=${schoolContext.resources.movementColliders.npc.length} / bit=${schoolContext.resources.movementColliders.bit.length} / beam=${schoolContext.resources.beamBlockers.length} / sight=${schoolContext.resources.sightBlockers.length}`
        });

        const curtainRayFrom = blenderPointToBabylon(
          new Vector3(-11.0, 6.0, 1.5)
        );
        const curtainRayTo = blenderPointToBabylon(
          new Vector3(-11.0, 7.0, 1.5)
        );
        const curtainPlayerHit = schoolContext.queries.castMovementSegment(
          "player",
          curtainRayFrom,
          curtainRayTo
        );
        const curtainNpcHit = schoolContext.queries.castMovementSegment(
          "npc",
          curtainRayFrom,
          curtainRayTo
        );
        const curtainBitHit = schoolContext.queries.castMovementSegment(
          "bit",
          curtainRayFrom,
          curtainRayTo
        );
        const curtainBeamHit = schoolContext.queries.castBeamSegment(
          curtainRayFrom,
          curtainRayTo
        );
        const curtainSightHit = schoolContext.queries.castSightSegment(
          curtainRayFrom,
          curtainRayTo
        );
        const expectedCurtainBlockerName =
          "COL_BeamSightOnly_B03_Interior_F01_Infirmary_Curtains";
        checks.push({
          name: "実保健室カーテンのmover透過・beam・sight遮蔽",
          ok:
            curtainPlayerHit === null &&
            curtainNpcHit === null &&
            curtainBitHit === null &&
            curtainBeamHit?.mesh.name === expectedCurtainBlockerName &&
            curtainSightHit?.mesh.name === expectedCurtainBlockerName,
          detail: `player=${curtainPlayerHit?.mesh.name ?? "clear"} / npc=${curtainNpcHit?.mesh.name ?? "clear"} / bit=${curtainBitHit?.mesh.name ?? "clear"} / beam=${curtainBeamHit?.mesh.name ?? "clear"} / sight=${curtainSightHit?.mesh.name ?? "clear"}`
        });

        const representativeWindowTransition = apertureTransitions[0];
        if (!representativeWindowTransition) {
          throw new Error("代表ビット窓aperture遷移がありません。");
        }
        const windowForwardRoute = findBitTransitionRoute(
          schoolContext,
          representativeWindowTransition
        );
        const windowBackwardRoute = findBitTransitionRoute(
          schoolContext,
          representativeWindowTransition,
          true
        );
        const realWindowPlayerHit = schoolContext.queries.castMovementSegment(
          "player",
          representativeWindowTransition.fromPosition,
          representativeWindowTransition.toPosition
        );
        const realWindowNpcHit = schoolContext.queries.castMovementSegment(
          "npc",
          representativeWindowTransition.fromPosition,
          representativeWindowTransition.toPosition
        );
        const realWindowBitHit = schoolContext.queries.castMovementSegment(
          "bit",
          representativeWindowTransition.fromPosition,
          representativeWindowTransition.toPosition
        );
        const realWindowBeamHit = schoolContext.queries.castBeamSegment(
          representativeWindowTransition.fromPosition,
          representativeWindowTransition.toPosition
        );
        const realWindowSightHit = schoolContext.queries.castSightSegment(
          representativeWindowTransition.fromPosition,
          representativeWindowTransition.toPosition
        );
        const windowForwardTransitions =
          windowForwardRoute?.steps.filter(
            (step) => step.kind === "transition"
          ) ?? [];
        const windowBackwardTransitions =
          windowBackwardRoute?.steps.filter(
            (step) => step.kind === "transition"
          ) ?? [];
        checks.push({
          name: "実ビット窓apertureの双方向経路・移動・光線分類",
          ok:
            realWindowPlayerHit?.mesh.name.startsWith(
              "COL_HumanOnly_Window_"
            ) === true &&
            realWindowNpcHit?.mesh === realWindowPlayerHit?.mesh &&
            realWindowBitHit === null &&
            realWindowBeamHit === null &&
            realWindowSightHit === null &&
            windowForwardTransitions.length === 1 &&
            windowForwardTransitions[0].traversal.transition ===
              representativeWindowTransition &&
            windowForwardTransitions[0].traversal.reversed === false &&
            windowBackwardTransitions.length === 1 &&
            windowBackwardTransitions[0].traversal.transition ===
              representativeWindowTransition &&
            windowBackwardTransitions[0].traversal.reversed === true,
          detail: `transition=${representativeWindowTransition.id} / forward=${windowForwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"} / backward=${windowBackwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"} / player=${realWindowPlayerHit?.mesh.name ?? "clear"} / npc=${realWindowNpcHit?.mesh.name ?? "clear"} / bit=${realWindowBitHit?.mesh.name ?? "clear"} / beam=${realWindowBeamHit?.mesh.name ?? "clear"} / sight=${realWindowSightHit?.mesh.name ?? "clear"}`
        });

        const rooftopBoundaryTransition = boundaryTransitions[0];
        if (!rooftopBoundaryTransition) {
          throw new Error("屋上boundary遷移がありません。");
        }
        const rooftopForwardRoute = findBitTransitionRoute(
          schoolContext,
          rooftopBoundaryTransition
        );
        const rooftopBackwardRoute = findBitTransitionRoute(
          schoolContext,
          rooftopBoundaryTransition,
          true
        );
        const rooftopForwardTransitions =
          rooftopForwardRoute?.steps.filter(
            (step) => step.kind === "transition"
          ) ?? [];
        const rooftopBackwardTransitions =
          rooftopBackwardRoute?.steps.filter(
            (step) => step.kind === "transition"
          ) ?? [];
        checks.push({
          name: "4F・屋上外周boundaryの双方向経路",
          ok:
            rooftopForwardTransitions.length === 1 &&
            rooftopForwardTransitions[0].traversal.transition ===
              rooftopBoundaryTransition &&
            rooftopForwardTransitions[0].traversal.reversed === false &&
            rooftopBackwardTransitions.length === 1 &&
            rooftopBackwardTransitions[0].traversal.transition ===
              rooftopBoundaryTransition &&
            rooftopBackwardTransitions[0].traversal.reversed === true,
          detail: `transition=${rooftopBoundaryTransition.id} / forward=${rooftopForwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"} / backward=${rooftopBackwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"}`
        });

        const waterVolume = schoolContext.volumes.getByRole("water")[0];
        waterVolume.mesh.computeWorldMatrix(true);
        const waterBounds = waterVolume.mesh.getBoundingInfo().boundingBox;
        const waterCenter = waterBounds.centerWorld.clone();
        const pointAboveWater = new Vector3(
          waterCenter.x,
          waterBounds.maximumWorld.y + 0.05,
          waterCenter.z
        );
        checks.push({
          name: "学校水域の読込・内外判定",
          ok:
            waterVolume.id === "pool-water" &&
            schoolContext.queries.containsVolume("water", waterCenter) &&
            !schoolContext.queries.containsVolume("water", pointAboveWater),
          detail: `id=${waterVolume.id} / center=${schoolContext.queries.containsVolume("water", waterCenter)} / above=${schoolContext.queries.containsVolume("water", pointAboveWater)}`
        });

        const npcSpawnVolume = schoolContext.volumes.getById(
          "npc-spawn-f01-stage"
        );
        if (!npcSpawnVolume) {
          throw new Error("T04 fixtureの1階NPC spawn Volumeがありません。");
        }
        const npcSpawnSurfaceSampler = createStageVolumeSpawnSampler(
          schoolContext.volumes.getByRole("npc_spawn"),
          schoolContext.navigation,
          {
            maxAttempts: 1,
            projectionMaxDistance: 0.75,
            random: () => 0.5
          }
        );
        const npcRandom = createSeededCountingRandom(0x5f3759df);
        const npcSpawnRandomSource = createSeededCountingRandom(0x3c6ef372);
        const npcSpawnRandom = createAreaTargetedSpawnRandom(
          npcSpawnSurfaceSampler,
          npcSpawnVolume.id,
          3,
          npcSpawnRandomSource.random
        );
        const npcMovementBlocking = createMovementBlockingStage(
          schoolContext,
          "npc"
        );
        const npcCharacterVisuals =
          await createDefaultV2CharacterVisualRuntime(spatialScene, [
            "player",
            "npc_0",
            "npc_1"
          ]);
        const npcSystem = createV2NpcSystem({
          scene: spatialScene,
          stage: npcMovementBlocking.stage,
          characterVisuals: npcCharacterVisuals,
          npcCount: 2,
          initialBrainwashedNpcCount: 2,
          diagnosticsEnabled: true,
          random: npcRandom.random,
          spawnRandom: npcSpawnRandom,
          playerSpawn: npcMovementBlocking.stage.playerSpawns.all[0],
          resolveTargetNavigationArea: (target) =>
            resolveTargetNavigationAreaSnapshot(loadedSchoolContext, target),
          selectNavigationRoute: selectSurfaceNavigationRoute
        });
        const npcInitializationRandomCallCount = npcRandom.getCallCount();
        const alarmCandidateId = "alarm-t04-tracking";
        const alarmPosition = npcSystem
          .getFrameView()
          .targets[1]
          .footPosition.add(new Vector3(0.5, 0, 0));
        const alarmRadiusSquared =
          V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS *
          V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS;
        const expectedAlarmReceiverIds = new Set(
          npcSystem
            .getFrameView()
            .targets
            .filter(
              (target) =>
                target.state === "brainwash-complete-gun" ||
                target.state === "brainwash-complete-no-gun"
            )
            .filter((target) => {
              const offsetX =
                target.footPosition.x - alarmPosition.x;
              const offsetZ =
                target.footPosition.z - alarmPosition.z;
              return (
                offsetX * offsetX + offsetZ * offsetZ <=
                alarmRadiusSquared
              );
            })
            .map((target) => target.id)
        );
        const npcAlarmTarget = createHumanTargetFixture(
          "player",
          "player",
          alarmPosition.clone(),
          alarmPosition.add(new Vector3(0, 0.3, 0))
        );
        const npcMovementTarget = createHumanTargetFixture(
          "player",
          "player",
          stageDestination.clone(),
          stageDestination.add(new Vector3(0, 0.3, 0))
        );
        npcSystem.update(
          0,
          npcAlarmTarget,
          Object.freeze([
            {
              candidateId: alarmCandidateId,
              targetId: "player",
              position: alarmPosition
            }
          ])
        );
        const npcTracking = npcSystem.getFrameView().tracking;
        checks.push({
          name: "Alarm発火時の完成NPC優先追跡",
          ok:
            expectedAlarmReceiverIds.size > 0 &&
            npcTracking.every((tracking) =>
              expectedAlarmReceiverIds.has(tracking.npcId)
                ? tracking.targetId === "player" &&
                  tracking.provenance === "alert" &&
                  tracking.alertLeaderId ===
                    `alarm:${alarmCandidateId}` &&
                  tracking.alertRemainingSeconds === 0
                : tracking.targetId === null &&
                  tracking.provenance === null
            ),
          detail: npcTracking
            .map(
              (tracking) =>
                `${tracking.npcId}:${tracking.provenance ?? "none"}/${tracking.targetId ?? "none"}`
            )
            .join(" / ")
        });
        const npcBeforeBlockedMovement =
          npcSystem.getFrameView().actorSpheres[1];
        const npcNavigationStart =
          npcSystem.getFrameView().targets[1].footPosition;
        npcSystem.update(
          0.1,
          npcMovementTarget,
          Object.freeze([])
        );
        const npcFirstPathfindCount = countPathfindAttemptsFrom(
          npcMovementBlocking.getPathfindAttempts(),
          "npc",
          npcNavigationStart
        );
        npcSystem.update(
          0.1,
          npcMovementTarget,
          Object.freeze([])
        );
        const npcSecondPathfindCount = countPathfindAttemptsFrom(
          npcMovementBlocking.getPathfindAttempts(),
          "npc",
          npcNavigationStart
        );
        const npcAfterBlockedMovement =
          npcSystem.getFrameView().actorSpheres[1];
        const npcMovementAttempts = npcMovementBlocking.getAttempts();
        const npcChaseAttempt = npcMovementAttempts.find(
          (attempt) =>
            attempt.moverKind === "npc" &&
            Vector3.Distance(attempt.from, npcBeforeBlockedMovement.center) <=
              1e-6
        );
        checks.push({
          name: "NPC実移動のmover別Collider停止",
          ok:
            npcChaseAttempt !== undefined &&
            npcFirstPathfindCount >= 1 &&
            npcSecondPathfindCount === npcFirstPathfindCount &&
            Vector3.Distance(
              npcAfterBlockedMovement.center,
              npcBeforeBlockedMovement.center
            ) <= 1e-6,
          detail: `spawn=${npcSpawnVolume.id} / attempts=${npcMovementAttempts.length} / pathfind=${npcFirstPathfindCount}->${npcSecondPathfindCount} / moved=${Vector3.Distance(npcAfterBlockedMovement.center, npcBeforeBlockedMovement.center).toExponential(2)}`
        });
        npcSystem.dispose();
        npcCharacterVisuals.dispose();

        const firstFloorNpcStage = Object.freeze({
          ...schoolContext,
          boundary: Object.freeze({
            id: "stage" as const,
            mesh: npcSpawnVolume.mesh,
            contains: createStageBoundaryContainsQuery(npcSpawnVolume.mesh)
          })
        });
        const multifloorNpcDestinations = [
          ["2F", upperFloorNavigationResults[0].projected!],
          ["3F", upperFloorNavigationResults[2].projected!],
          ["4F", upperFloorNavigationResults[4].projected!],
          ["屋上", upperFloorNavigationResults[6].projected!]
        ] as const;
        const multifloorNpcCharacterVisuals =
          await createDefaultV2CharacterVisualRuntime(spatialScene, [
            "player",
            "npc_0",
            "npc_1"
          ]);
        const multifloorNpcResults = multifloorNpcDestinations.map(
          ([label, destination], destinationIndex) => {
            const routeRandom = createSeededCountingRandom(
              0x6a09e667 + destinationIndex
            );
            const routeSpawnRandomSource = createSeededCountingRandom(
              0xbb67ae85
            );
            const routeSpawnRandom = createAreaTargetedSpawnRandom(
              npcSpawnSurfaceSampler,
              npcSpawnVolume.id,
              3,
              routeSpawnRandomSource.random
            );
            const routeSystem = createV2NpcSystem({
              scene: spatialScene,
              stage: firstFloorNpcStage,
              characterVisuals: multifloorNpcCharacterVisuals,
              npcCount: 2,
              initialBrainwashedNpcCount: 2,
              diagnosticsEnabled: true,
              random: routeRandom.random,
              spawnRandom: routeSpawnRandom,
              playerSpawn: firstFloorNpcStage.playerSpawns.all[0],
              resolveTargetNavigationArea: (target) =>
                resolveTargetNavigationAreaSnapshot(
                  firstFloorNpcStage,
                  target
                ),
              selectNavigationRoute: selectSurfaceNavigationRoute
            });
            const routeNpcStart =
              routeSystem.getFrameView().targets[1].footPosition;
            const startedInFirstFloorSpawn =
              createStageBoundaryContainsQuery(npcSpawnVolume.mesh)(
                routeNpcStart
              );
            const routeAlarmPosition = routeNpcStart.add(
              new Vector3(0.5, 0, 0)
            );
            const targetAtAlarm = createHumanTargetFixture(
              "player",
              "player",
              routeAlarmPosition.clone(),
              routeAlarmPosition.add(new Vector3(0, 0.3, 0))
            );
            routeSystem.update(
              0,
              targetAtAlarm,
              Object.freeze([
                {
                  candidateId: `alarm-t04-route-${destinationIndex}`,
                  targetId: "player",
                position: routeAlarmPosition
              }
            ])
            );
            const start = routeNpcStart;
            const target = createHumanTargetFixture(
              "player",
              "player",
              destination.position.clone(),
              destination.position.add(new Vector3(0, 0.3, 0))
            );
            let reached = false;
            const visitedStaircases = new Set<"NW" | "NE" | "SW">();
            let groundProbeFailureCount = 0;
            let groundSampleCount = 0;
            let staircaseGroundSampleCount = 0;
            let maximumGroundError = 0;
            let updateCount = 0;
            while (!reached && updateCount < 2400) {
              routeSystem.update(
                0.25,
                target,
                Object.freeze([])
              );
              updateCount += 1;
              const position =
                routeSystem.getFrameView().targets[1].footPosition;
              const containingStaircase = findContainingStaircase(position);
              if (containingStaircase !== null) {
                visitedStaircases.add(containingStaircase);
              }
              const ground = schoolContext!.queries.sampleGround(
                position.add(new Vector3(0, 0.5, 0)),
                1.5
              );
              if (!ground) {
                groundProbeFailureCount += 1;
              } else {
                groundSampleCount += 1;
                maximumGroundError = Math.max(
                  maximumGroundError,
                  Math.abs(position.y - ground.point.y)
                );
                if (containingStaircase !== null) {
                  staircaseGroundSampleCount += 1;
                }
              }
              reached =
                Vector3.Distance(position, destination.position) <=
                V2_NPC_CAPTURE_RADIUS + 1e-6;
            }
            const finalPosition =
              routeSystem.getFrameView().targets[1].footPosition;
            routeSystem.dispose();
            return {
              label,
              startedOnFirstFloor: Math.abs(start.y) <= 0.1,
              startedInFirstFloorSpawn,
              reached,
              visitedStaircases: [...visitedStaircases].sort(),
              updateCount,
              groundProbeFailureCount,
              groundSampleCount,
              staircaseGroundSampleCount,
              maximumGroundError,
              endpointError: Vector3.Distance(
                finalPosition,
                destination.position
              )
            };
          }
        );
        multifloorNpcCharacterVisuals.dispose();
        checks.push({
          name: "実V2NpcSystemの1Fから2F・3F・4F・屋上追跡",
          ok: multifloorNpcResults.every(
            (result) =>
              result.startedOnFirstFloor &&
              result.startedInFirstFloorSpawn &&
              result.reached &&
              result.visitedStaircases.length > 0 &&
              (result.label !== "屋上" ||
                result.visitedStaircases.includes("NW")) &&
              result.endpointError <= V2_NPC_CAPTURE_RADIUS + 1e-6
          ),
          detail: multifloorNpcResults
            .map(
              (result) =>
                `${result.label}:1F=${result.startedOnFirstFloor}/${result.startedInFirstFloorSpawn},reached=${result.reached},stairs=${result.visitedStaircases.join(",") || "none"},updates=${result.updateCount},error=${result.endpointError.toFixed(3)}`
            )
            .join(" / ")
        });
        checks.push({
          name: "実V2NpcSystemの物理階段面への接地追従",
          ok: multifloorNpcResults.every(
            (result) =>
              result.groundProbeFailureCount === 0 &&
              result.groundSampleCount === result.updateCount &&
              result.staircaseGroundSampleCount > 0 &&
              result.maximumGroundError <= 0.035
          ),
          detail: multifloorNpcResults
            .map(
              (result) =>
                `${result.label}:samples=${result.groundSampleCount}/${result.updateCount},stairs=${result.staircaseGroundSampleCount},fail=${result.groundProbeFailureCount},maxError=${result.maximumGroundError.toExponential(2)}`
            )
            .join(" / ")
        });

        const unreachableNpcRandom = createSeededCountingRandom(0x510e527f);
        const unreachableNpcCharacterVisuals =
          await createDefaultV2CharacterVisualRuntime(spatialScene, [
            "player",
            "npc_0",
            "npc_1"
          ]);
        const unreachableNpcSystem = createV2NpcSystem({
          scene: spatialScene,
          stage: schoolContext,
          characterVisuals: unreachableNpcCharacterVisuals,
          npcCount: 2,
          initialBrainwashedNpcCount: 2,
          diagnosticsEnabled: true,
          random: unreachableNpcRandom.random,
          spawnRandom: unreachableNpcRandom.random,
          playerSpawn: schoolContext.playerSpawns.all[0],
          resolveTargetNavigationArea: (target) =>
            Object.freeze({
              ...createTargetNavigationAreaSnapshot(
                target,
                "school-ground"
              ),
              revision: target.footPosition.x > 10 ? 1 : 0
            }),
          selectNavigationRoute: selectSurfaceNavigationRoute
        });
        const unreachableNpcStart =
          unreachableNpcSystem.getFrameView().targets[1].footPosition;
        const unreachableAlarmPosition = unreachableNpcStart.add(
          new Vector3(0.5, 0, 0)
        );
        const unreachableTargetAtAlarm = createHumanTargetFixture(
          "player",
          "player",
          unreachableAlarmPosition.clone(),
          unreachableAlarmPosition.add(new Vector3(0, 0.3, 0))
        );
        unreachableNpcSystem.update(
          0,
          unreachableTargetAtAlarm,
          Object.freeze([
            {
              candidateId: "alarm-t04-unreachable",
              targetId: "player",
              position: unreachableAlarmPosition
            }
          ])
        );
        const unreachablePlayerTarget = createHumanTargetFixture(
          "player",
          "player",
          new Vector3(100, 100, 100),
          new Vector3(100, 100.3, 100)
        );
        for (let updateIndex = 0; updateIndex < 4; updateIndex += 1) {
          unreachableNpcSystem.update(
            0.25,
            unreachablePlayerTarget,
            Object.freeze([])
          );
        }
        const unreachableNpcEnd =
          unreachableNpcSystem.getFrameView().targets[1].footPosition;
        unreachableNpcSystem.dispose();
        unreachableNpcCharacterVisuals.dispose();
        checks.push({
          name: "実V2NpcSystemの到達不能時停止",
          ok:
            Vector3.Distance(unreachableNpcStart, unreachableNpcEnd) <= 1e-6,
          detail: `moved=${Vector3.Distance(unreachableNpcStart, unreachableNpcEnd).toExponential(2)}`
        });

        const npcFailureBaseline = countSceneResources(spatialScene);
        const npcFailureCharacterVisuals =
          await createDefaultV2CharacterVisualRuntime(spatialScene, [
            "player",
            "npc_0",
            "npc_1"
          ]);
        const npcInjectedError = new Error(
          "T04 NPC factory初期化失敗注入"
        );
        const npcFailureStage = schoolContext;
        const npcFailureDisposalOrder: string[] = [];
        const npcFailureRandom = createSeededCountingRandom(0x5f3759df, {
          call: npcInitializationRandomCallCount,
          error: npcInjectedError,
          beforeThrow: () => {
            const spriteManagers = spatialScene.spriteManagers!;
            const spriteManager = spriteManagers[
              spriteManagers.length - 1
            ] as SpriteManager;
            for (const sprite of spriteManager.sprites) {
              sprite.onDisposeObservable.add(() => {
                npcFailureDisposalOrder.push(`sprite:${sprite.name}`);
              });
            }
            spriteManager.onDisposeObservable.add(() => {
              npcFailureDisposalOrder.push(`manager:${spriteManager.name}`);
            });
          }
        });
        const npcFailureSpawnRandomSource =
          createSeededCountingRandom(0x3c6ef372);
        const npcFailureSpawnRandom = createAreaTargetedSpawnRandom(
          npcSpawnSurfaceSampler,
          npcSpawnVolume.id,
          3,
          npcFailureSpawnRandomSource.random
        );
        const npcThrownValue = captureThrownValue(() => {
          const unexpectedSystem = createV2NpcSystem({
            scene: spatialScene,
            stage: npcFailureStage,
            characterVisuals: npcFailureCharacterVisuals,
            npcCount: 2,
            initialBrainwashedNpcCount: 2,
            diagnosticsEnabled: true,
            random: npcFailureRandom.random,
            spawnRandom: npcFailureSpawnRandom,
            playerSpawn: npcFailureStage.playerSpawns.all[0],
            resolveTargetNavigationArea: (target) =>
              createTargetNavigationAreaSnapshot(target, "school-ground"),
            selectNavigationRoute: selectSurfaceNavigationRoute
          });
          unexpectedSystem.dispose();
        });
        npcFailureCharacterVisuals.dispose();
        const npcFailureAfter = countSceneResources(spatialScene);
        checks.push({
          name: "NPC factory初期化失敗時の資源回収",
          ok:
            npcThrownValue === npcInjectedError &&
            npcFailureDisposalOrder.join("|") ===
              "sprite:npc_1|sprite:npc_0|manager:V2CharacterVisual_00_default" &&
            sceneResourceCountsEqual(npcFailureBaseline, npcFailureAfter),
          detail: `throwCall=${npcFailureRandom.getCallCount()}/${npcInitializationRandomCallCount} / sameError=${npcThrownValue === npcInjectedError} / dispose=${npcFailureDisposalOrder.join(" > ")} / baseline=${JSON.stringify(npcFailureBaseline)} / after=${JSON.stringify(npcFailureAfter)}`
        });

        const bitSeededRandom = createSeededCountingRandom(0x9e3779b9);
        let forceNormalChase = false;
        const bitRandom = Object.freeze({
          random: () => {
            if (forceNormalChase) {
              forceNormalChase = false;
              return 0.5;
            }
            return bitSeededRandom.random();
          },
          getCallCount: bitSeededRandom.getCallCount
        });
        const bitMovementBlocking = createMovementBlockingStage(
          schoolContext,
          "bit"
        );
        const initialBitSpawnCompletionSeconds = 1.5;
        const completeInitialBitSpawn = (
          system: ReturnType<typeof createV2BitSystem>
        ) => {
          // 出現演出中のBITはframe viewへ公開されないため、既定の1.5秒を完了させる。
          for (const elapsedSeconds of [
            0.5,
            1.0,
            initialBitSpawnCompletionSeconds
          ]) {
            system.update({
              deltaSeconds: 0.5,
              elapsedSeconds,
              targets: [],
              externalAlerts: []
            });
          }
        };
        const bitSystem = createV2BitSystem(
          spatialScene,
          bitMovementBlocking.stage,
          {
            combatEnabled: false,
            initialBitCount: 2,
            reinforcementIntervalSeconds: 10,
            maximumBitCount: 2,
            minimumSpawnDistance: 0.2,
            spawnMaxAttempts: 128,
            spawnProjectionMaxDistance: 0.75,
            random: bitRandom.random,
            spawnRandom: bitRandom.random,
            playerSpawn: bitMovementBlocking.stage.playerSpawns.all[0],
            resolveTargetNavigationArea: (target) =>
              resolveTargetNavigationAreaSnapshot(
                loadedSchoolContext,
                target
              )
          }
        );
        const bitInitializationRandomCallCount = bitRandom.getCallCount();
        completeInitialBitSpawn(bitSystem);
        const bitSpawnRegions = schoolContext.volumes
          .getByRole("bit_spawn")
          .map((volume) =>
            Object.freeze({
              volume,
              contains: createStageBoundaryContainsQuery(volume.mesh)
            })
          );
        const observeBitSpawn = (
          actor: ReturnType<typeof bitSystem.getFrameView>["actorSpheres"][number],
          flightState: ReturnType<
            typeof bitSystem.getFrameView
          >["flightStates"][number] | undefined
        ) => {
          const band =
            flightState?.zoneId && flightState.bandId
              ? loadedSchoolContext.bitNavigation.getBand({
                  zoneId: flightState.zoneId,
                  bandId: flightState.bandId
                })
              : null;
          const region = flightState
            ? bitSpawnRegions.find(
                (candidate) =>
                  candidate.volume.bitFlightBand?.zoneId ===
                    flightState.zoneId &&
                  candidate.volume.bitFlightBand.bandId ===
                    flightState.bandId &&
                  candidate.contains(actor.center)
              ) ?? null
            : null;
          const centerInBand =
            band !== null &&
            actor.center.y >= band.minimumCenterHeight &&
            actor.center.y <= band.maximumCenterHeight;
          const safeCenterHeightInBand =
            band !== null &&
            flightState?.safeCenterHeight !== null &&
            flightState?.safeCenterHeight !== undefined &&
            flightState.safeCenterHeight >= band.minimumCenterHeight &&
            flightState.safeCenterHeight <= band.maximumCenterHeight;
          return Object.freeze({
            actor,
            flightState,
            band,
            region,
            centerInBand,
            safeCenterHeightInBand
          });
        };
        const initialBitFrame = bitSystem.getFrameView();
        const initialBitActors = initialBitFrame.actorSpheres;
        const initialBitSpawnObservations = initialBitActors.map((actor) =>
          observeBitSpawn(
            actor,
            initialBitFrame.flightStates.find(
              (flightState) => flightState.bitId === actor.id
            )
          )
        );
        const bitNavigationStart = initialBitActors[1].center.clone();
        checks.push({
          name: "ビットspawnの明示飛行帯・安全中心高度",
          ok:
            initialBitSpawnObservations.every(
              (observation) =>
                observation.region !== null &&
                observation.centerInBand &&
                observation.safeCenterHeightInBand &&
                bitMovementBlocking.stage.queries.castMovementSphere(
                  "bit",
                  observation.actor.center,
                  observation.actor.center,
                  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
                ) === null
            ),
          detail: initialBitSpawnObservations
            .map(
              (observation) =>
                `${observation.actor.id}:${observation.region?.volume.id ?? "none"}/${observation.flightState?.bandId ?? "none"}` +
                ` center=${observation.actor.center.y.toFixed(4)}` +
                ` safe=${observation.flightState?.safeCenterHeight?.toFixed(4) ?? "none"}` +
                ` band=${observation.band ? `${observation.band.minimumCenterHeight.toFixed(4)}..${observation.band.maximumCenterHeight.toFixed(4)}` : "none"}`
            )
            .join(" / ")
        });

        const distantPlayerTarget = createHumanTargetFixture(
          "player",
          "player",
          stageDestination.clone(),
          stageDestination.add(new Vector3(0, 0.3, 0))
        );
        forceNormalChase = true;
        bitSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: initialBitSpawnCompletionSeconds + 0.1,
          targets: [distantPlayerTarget],
          externalAlerts: [
            {
              leaderId: "v2_bit_0",
              targetId: "player",
              remainingSeconds: 5
            }
          ]
        });
        const bitAlertStates = bitSystem.getFrameView().targetStates;
        const blockedMovementTarget = createHumanTargetFixture(
          "player",
          "player",
          initialBitActors[0].center.clone(),
          initialBitActors[0].center.clone()
        );
        const bitFirstMovementAttemptCount =
          bitMovementBlocking.getAttempts().length;
        let bitBlockedUpdateCount = 0;
        while (
          bitBlockedUpdateCount < 20 &&
          !bitMovementBlocking.getAttempts().some(
            (attempt) =>
              attempt.moverKind === "bit" &&
              Math.hypot(
                attempt.from.x - initialBitActors[1].center.x,
                attempt.from.z - initialBitActors[1].center.z
              ) <= 1e-6
          )
        ) {
          bitBlockedUpdateCount += 1;
          bitSystem.update({
            deltaSeconds: 0.1,
            elapsedSeconds:
              initialBitSpawnCompletionSeconds +
              (bitBlockedUpdateCount + 1) * 0.1,
            targets: [blockedMovementTarget],
            externalAlerts: []
          });
        }
        const bitSecondMovementAttemptCount =
          bitMovementBlocking.getAttempts().length;
        const bitAfterBlockedFrame = bitSystem.getFrameView();
        const bitAfterBlockedMovement =
          bitAfterBlockedFrame.actorSpheres[1];
        const bitAfterBlockedObservation = observeBitSpawn(
          bitAfterBlockedMovement,
          bitAfterBlockedFrame.flightStates.find(
            (flightState) =>
              flightState.bitId === bitAfterBlockedMovement.id
          )
        );
        const bitBlockedHorizontalDistance = Math.hypot(
          bitAfterBlockedMovement.center.x -
            initialBitActors[1].center.x,
          bitAfterBlockedMovement.center.z -
            initialBitActors[1].center.z
        );
        const bitBlockedVerticalDistance = Math.abs(
          bitAfterBlockedMovement.center.y -
            initialBitActors[1].center.y
        );
        const bitMovementAttempts = bitMovementBlocking.getAttempts();
        const bitChaseAttempt = bitMovementAttempts.find(
          (attempt) =>
            attempt.moverKind === "bit" &&
            Math.hypot(
              attempt.from.x - initialBitActors[1].center.x,
              attempt.from.z - initialBitActors[1].center.z
            ) <= 1e-6
        );
        const bitBlockedCenterSafe = schoolBitSafety.isCenterSafe(
          bitAfterBlockedMovement.center
        );
        checks.push({
          name: "ビット発信者visualと受信者alertの分離",
          ok:
            bitAlertStates[0].provenance !== "alert" &&
            bitAlertStates[0].alertLeaderId === null &&
            bitAlertStates[1].targetId === "player" &&
            bitAlertStates[1].mode === "chase" &&
            bitAlertStates[1].provenance === "alert" &&
            bitAlertStates[1].alertLeaderId === "v2_bit_0",
          detail: bitAlertStates
            .map(
              (state) =>
                `${state.bitId}:${state.provenance ?? "none"}/${state.targetId ?? "none"}`
            )
            .join(" / ")
        });
        checks.push({
          name: "通常ビット実移動のmover別Collider停止",
          ok:
            bitChaseAttempt !== undefined &&
            bitAlertStates[1].mode === "chase" &&
            bitSecondMovementAttemptCount >= bitFirstMovementAttemptCount &&
            bitBlockedHorizontalDistance <= 1e-6 &&
            bitAfterBlockedObservation.region !== null &&
            bitAfterBlockedObservation.safeCenterHeightInBand &&
            bitBlockedCenterSafe,
          detail: `mode=${bitAlertStates[1].mode} / spawn=${bitAfterBlockedObservation.region?.volume.id ?? "none"}/${bitAfterBlockedObservation.flightState?.bandId ?? "none"} / attempts=${bitFirstMovementAttemptCount}->${bitSecondMovementAttemptCount} / updates=${bitBlockedUpdateCount} / chaseAttempt=${bitChaseAttempt !== undefined} / horizontal=${bitBlockedHorizontalDistance.toExponential(2)} / vertical=${bitBlockedVerticalDistance.toExponential(2)} / safeHeightInBand=${bitAfterBlockedObservation.safeCenterHeightInBand} / safe=${bitBlockedCenterSafe}`
        });
        bitSystem.dispose();

        const bitFailureBaseline = countSceneResources(spatialScene);
        const bitInjectedError = new Error(
          "T04 bit factory初期化失敗注入"
        );
        const bitFailureStage = schoolContext;
        const bitFailureDisposalOrder: string[] = [];
        const bitFailureRandom = createSeededCountingRandom(0x9e3779b9, {
          call: bitInitializationRandomCallCount,
          error: bitInjectedError,
          beforeThrow: () => {
            const bitRoots = spatialScene.transformNodes.filter(
              (node) => /^v2_bit_\d+$/.test(node.name)
            );
            const bitMaterials = spatialScene.materials.filter(
              (material) =>
                material.name === "v2BitBodyMaterial" ||
                material.name === "v2BitMuzzleMaterial"
            );
            for (const root of bitRoots) {
              root.onDisposeObservable.add(() => {
                bitFailureDisposalOrder.push(`root:${root.name}`);
              });
            }
            for (const material of bitMaterials) {
              material.onDisposeObservable.add(() => {
                bitFailureDisposalOrder.push(`material:${material.name}`);
              });
            }
          }
        });
        const bitThrownValue = captureThrownValue(() => {
          const unexpectedSystem = createV2BitSystem(
            spatialScene,
            bitFailureStage,
            {
              combatEnabled: false,
              initialBitCount: 2,
              reinforcementIntervalSeconds: 10,
              maximumBitCount: 2,
              minimumSpawnDistance: 0.2,
              spawnMaxAttempts: 128,
              spawnProjectionMaxDistance: 0.75,
              random: bitFailureRandom.random,
              spawnRandom: bitFailureRandom.random,
              playerSpawn: bitFailureStage.playerSpawns.all[0],
              resolveTargetNavigationArea: (target) =>
                resolveTargetNavigationAreaSnapshot(
                  loadedSchoolContext,
                  target
                )
            }
          );
          unexpectedSystem.dispose();
        });
        const bitFailureAfter = countSceneResources(spatialScene);
        checks.push({
          name: "ビットfactory初期化失敗時の資源回収",
          ok:
            bitThrownValue === bitInjectedError &&
            bitFailureDisposalOrder.join("|") ===
              "root:v2_bit_1|root:v2_bit_0|material:v2BitMuzzleMaterial|material:v2BitBodyMaterial" &&
            sceneResourceCountsEqual(bitFailureBaseline, bitFailureAfter),
          detail: `throwCall=${bitFailureRandom.getCallCount()}/${bitInitializationRandomCallCount} / sameError=${bitThrownValue === bitInjectedError} / dispose=${bitFailureDisposalOrder.join(" > ")} / baseline=${JSON.stringify(bitFailureBaseline)} / after=${JSON.stringify(bitFailureAfter)}`
        });

        const brainwashedTargetBitSystem = createV2BitSystem(
          spatialScene,
          schoolContext,
          {
            combatEnabled: false,
            initialBitCount: 1,
            reinforcementIntervalSeconds: 10,
            maximumBitCount: 1,
            minimumSpawnDistance: 0,
            spawnMaxAttempts: 128,
            spawnProjectionMaxDistance: 0.75,
            random: bitRandom.random,
            spawnRandom: bitRandom.random,
            playerSpawn: schoolContext.playerSpawns.all[0],
            resolveTargetNavigationArea: (target) =>
              resolveTargetNavigationAreaSnapshot(
                loadedSchoolContext,
                target
              )
          }
        );
        completeInitialBitSpawn(brainwashedTargetBitSystem);
        const brainwashedNpcTarget = createHumanTargetFixture(
          "npc_brainwashed",
          "npc",
          stageDestination.clone(),
          stageDestination.add(new Vector3(0, 0.2, 0)),
          "brainwash-complete-no-gun"
        );
        brainwashedTargetBitSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: initialBitSpawnCompletionSeconds + 0.1,
          targets: [brainwashedNpcTarget],
          externalAlerts: [
            {
              leaderId: "npc_0",
              targetId: "npc_brainwashed",
              remainingSeconds: 5
            }
          ]
        });
        const brainwashedTargetState =
          brainwashedTargetBitSystem.getFrameView().targetStates[0];
        checks.push({
          name: "ビットの洗脳済みNPC標的除外",
          ok:
            brainwashedTargetState.targetId === null &&
            brainwashedTargetState.provenance === null,
          detail: `${brainwashedTargetState.provenance ?? "none"}/${brainwashedTargetState.targetId ?? "none"}`
        });
        brainwashedTargetBitSystem.dispose();

        const visionBitSystem = createV2BitSystem(
          spatialScene,
          schoolContext,
          {
            combatEnabled: false,
            initialBitCount: 1,
            reinforcementIntervalSeconds: 10,
            maximumBitCount: 1,
            minimumSpawnDistance: 0,
            spawnMaxAttempts: 128,
            spawnProjectionMaxDistance: 0.75,
            random: bitRandom.random,
            spawnRandom: bitRandom.random,
            playerSpawn: schoolContext.playerSpawns.all[0],
            resolveTargetNavigationArea: (target) =>
              resolveTargetNavigationAreaSnapshot(
                loadedSchoolContext,
                target
              )
          }
        );
        completeInitialBitSpawn(visionBitSystem);
        const visionBitCenter =
          visionBitSystem.getFrameView().actorSpheres[0].center;
        const ringTargets = Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2;
          const aimPosition = visionBitCenter.add(
            new Vector3(Math.cos(angle) * 0.15, 0, Math.sin(angle) * 0.15)
          );
          return createHumanTargetFixture(
            `vision_target_${index}`,
            "npc",
            aimPosition.add(new Vector3(0, -0.2, 0)),
            aimPosition
          );
        });
        visionBitSystem.update({
          deltaSeconds: 0.2,
          elapsedSeconds: 1.7,
          targets: ringTargets,
          externalAlerts: []
        });
        const acquiredVisionState =
          visionBitSystem.getFrameView().targetStates[0];
        const acquiredTarget = ringTargets.find(
          (target) => target.id === acquiredVisionState.targetId
        );
        const aimedBitCenter =
          visionBitSystem.getFrameView().actorSpheres[0].center;
        const behindDirection = acquiredTarget
          ? acquiredTarget.aimPosition.subtract(aimedBitCenter).normalize()
          : Vector3.Forward();
        const behindAimPosition = aimedBitCenter.subtract(
          behindDirection.scale(0.15)
        );
        const behindTarget = createHumanTargetFixture(
          acquiredVisionState.targetId ?? "not-acquired",
          "npc",
          behindAimPosition.add(new Vector3(0, -0.2, 0)),
          behindAimPosition
        );
        visionBitSystem.update({
          deltaSeconds: 0.2,
          elapsedSeconds: 1.9,
          targets: [behindTarget],
          externalAlerts: []
        });
        const releasedVisionState =
          visionBitSystem.getFrameView().targetStates[0];
        checks.push({
          name: "ビットvisual標的の扇形外last-seen追跡",
          ok:
            acquiredVisionState.provenance === "visual" &&
            acquiredTarget !== undefined &&
            releasedVisionState.targetId === acquiredVisionState.targetId &&
            releasedVisionState.provenance === "visual",
          detail: `acquired=${acquiredVisionState.targetId ?? "none"} / retained=${releasedVisionState.targetId ?? "none"}`
        });
        visionBitSystem.dispose();

        schoolContext.dispose();
        schoolContext = null;
        const afterFirstDispose = countSceneResources(spatialScene);
        const reloadedContext = await loadStageSpatialContext(
          spatialScene,
          SCHOOL_VALIDATION_STAGE,
          {
            initializeDynamicSpatial:
              createSchoolStageDynamicSpatialInitializer(0),
            roomVariantSelections:
              SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
          }
        );
        const reloadedMetadataOk =
          reloadedContext.metadata.stageId === "school" &&
          reloadedContext.resources.visualMeshes.length === 618 &&
          reloadedContext.resources.normalColliders.length === 276 &&
          reloadedContext.resources.actorOnlyColliders.length === 81 &&
          reloadedContext.resources.humanOnlyColliders.length === 59 &&
          reloadedContext.resources.beamSightOnlyColliders.length === 1 &&
          reloadedContext.resources.beamSightOnlyColliders[0]?.name ===
            "COL_BeamSightOnly_B03_Interior_F01_Infirmary_Curtains" &&
          reloadedContext.resources.humanNavigationSources.length === 39 &&
          reloadedContext.resources.bitFlightNavSourceMeshes.length === 22 &&
          reloadedContext.markers.all.length === 289 &&
          reloadedContext.markers.getByRole("assembly_anchor").length === 2 &&
          reloadedContext.volumes.all.length === 228 &&
          reloadedContext.navigationAreas.all.length === 5 &&
          reloadedContext.navigationAreas.portals.length === 4 &&
          reloadedContext.volumes.getByRole("assembly").length === 2 &&
          reloadedContext.assemblyVenues.all.length === 2 &&
          reloadedContext.assemblyVenues.all.every(
            (venue) =>
              venue.selectionWeight === 1 &&
              venue.assemblyPositions.length === 100 &&
              venue.executionAudiencePositions.length === 94 &&
              venue.executionTargetPositions.length === 6
          ) &&
          reloadedContext.volumes.getByRole("water").length === 1 &&
          reloadedContext.worldBoundary?.id === "world-limit" &&
          reloadedContext.roomVariants?.variants.length === 40 &&
          reloadedContext.roomVariants.tileVolumes.length === 20 &&
          reloadedContext.roomVariantSelection.length === 20 &&
          reloadedContext.roomVariantSelection.every(
            (selection) => selection.variant === "normal"
          ) &&
          reloadedContext.doorAssets.all.length === 67 &&
          reloadedContext.elevatorAssets.all.length === 1 &&
          reloadedContext.links.all.length === 1 &&
          reloadedContext.bitNavigation.zones.length === 4 &&
          reloadedContext.bitNavigation.bands.length === 11 &&
          reloadedContext.bitNavigation.transitions.length === 72;
        reloadedContext.dispose();
        const afterSecondDispose = countSceneResources(spatialScene);
        checks.push({
          name: "学校資源の破棄と再読込",
          ok:
            reloadedMetadataOk &&
            sceneResourceCountsEqual(baselineResources, afterFirstDispose) &&
            sceneResourceCountsEqual(baselineResources, afterSecondDispose),
          detail: `baseline=${JSON.stringify(baselineResources)} / first=${JSON.stringify(afterFirstDispose)} / second=${JSON.stringify(afterSecondDispose)}`
        });
      } finally {
        schoolQueryPrototype.findPath = originalSchoolFindPath;
        schoolContext?.dispose();
      }
    } finally {
      spatialScene.dispose();
      spatialEngine.dispose();
    }

    const pathMeshes = [
      createPathMesh("DoorRoute", routePath, new Color3(1, 0.82, 0.18)),
      createPathMesh("RampRoute", rampPath, new Color3(0.2, 0.72, 1))
    ];

    navigationRuntime = {
      navigationWorld,
      restoredNavigationWorld,
      pathMeshes,
      data
    };
    pendingNavigationWorlds.length = 0;

    setMetric("初期化", `${initializationMs.toFixed(2)} ms`);
    setMetric("ベイク", `${bakeMs.toFixed(2)} ms`);
    setMetric("復元", `${restoreMs.toFixed(2)} ms`);
    setMetric("学校読込", `${schoolLoadMs.toFixed(2)} ms`);
    setMetric("バイナリ", `${data.byteLength} bytes`);
    setMetric("入力三角形", `${navGeometry.indices.length / 3}`);

    const passedCount = checks.filter((check) => check.ok).length;
    const validationStatus =
      passedCount === checks.length ? "passed" : "failed";
    document.documentElement.dataset.validationStatus =
      validationStatus;
    summary.dataset.state = validationStatus;
    summary.textContent = `${passedCount} / ${checks.length} 項目がPASSしました。`;
    downloadButton.disabled = false;
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ name: "検証処理", ok: false, detail: message });
    document.documentElement.dataset.validationStatus = "failed";
    summary.dataset.state = "failed";
    summary.textContent = "NavMesh技術検証に失敗しました。";
  } finally {
    pendingNavigationWorlds.forEach((navigationWorld) => navigationWorld.dispose());
    renderChecks(checks);
    runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => {
  void runValidation();
});

downloadButton.addEventListener("click", () => {
  if (!navigationRuntime) {
    return;
  }
  const copy = new Uint8Array(navigationRuntime.data);
  const blob = new Blob([copy], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "t04_recast_spike.navmesh.bin";
  anchor.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("resize", () => engine.resize());
window.addEventListener("beforeunload", () => disposeNavigationRuntime());

engine.runRenderLoop(() => scene.render());
void runValidation();
