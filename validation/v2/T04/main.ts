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
  initializeNavigationRuntime,
  type NavigationLocation,
  type NavigationPath,
  type NavigationSurfaceStep,
  type NavigationWorld
} from "../../../src/world/navigationWorld";
import { createNavigationAgent } from "../../../src/world/navigationAgent";
import {
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH
} from "../../../src/game/characterSprites";
import {
  SCHOOL_STAGE,
  type StageCatalogEntry
} from "../../../src/world/stageCatalog";
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
import { createStageSpawnSampler } from "../../../src/world/stageSpawnSampler";
import {
  createStageSpatialQueries,
  type StageVolume
} from "../../../src/world/stageSpatialQueries";
import { createV2AlertCoordinator } from "../../../src/v2/alertCoordinator";
import { createV2BitSystem } from "../../../src/v2/bitSystem";
import { createV2NpcSystem } from "../../../src/v2/npcSystem";
import {
  castV2BeamSegment,
  castV2SightSegment,
  createV2BeamSystem
} from "../../../src/v2/beamCollision";
import type { V2ActorSphere } from "../../../src/v2/combatTypes";

import "./style.css";

type ValidationCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

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
  navmeshUrl: "b02_school_blockout.navmesh.bin"
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
  targetMoveThreshold: 0.2,
  pathRefreshIntervalSeconds: 1,
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
    ? navigation.findPath(startLocation, destinationLocation, moverKind)
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
  projectPoint,
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
    queries: createStageSpatialQueries(targetScene, {
      movementColliders,
      groundColliders: normalColliders,
      beamBlockers: normalColliders,
      sightBlockers: normalColliders,
      volumes: []
    })
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
      projectPoint: (position: Vector3, maxDistance: number) =>
        source.navigation.projectPoint(position, maxDistance),
      findPath: (
        start: NavigationLocation,
        destination: NavigationLocation,
        moverKind: StageMoverKind
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
        return source.navigation.findPath(start, destination, moverKind);
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
  summary.dataset.state = "running";
  summary.textContent = "Recastを初期化し、NavMeshを生成しています。";
  metrics.replaceChildren();
  checkResults.replaceChildren();
  disposeNavigationRuntime();

  const checks: ValidationCheck[] = [];

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

    const bitWindowLink = createValidationLinkPair(
      "bit-window-validation",
      "bit_window",
      new Vector3(3.9, 0.25, -1.5),
      new Vector3(5.1, 0.25, -1.5)
    );
    const bitRoofLink = createValidationLinkPair(
      "bit-roof-validation",
      "bit_roof",
      new Vector3(-9.5, 0.25, -1.5),
      new Vector3(-9.5, 1.05, -1.5)
    );
    const cachedSurfaceBridgeLink = createValidationLinkPair(
      "bit-window-cache-bridge-validation",
      "bit_window",
      new Vector3(5.7, 0.25, -1.5),
      new Vector3(-6.7, 0.25, -1.5)
    );
    const linkCacheValidationLinks = [
      bitWindowLink,
      bitRoofLink,
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
    let directBitPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let firstPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let secondPathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let reversePathfindAttempts: readonly RecastPathfindAttempt[] = [];
    let directBitPath: NavigationPath | null = null;
    let firstCachedLinkPath: NavigationPath | null = null;
    let secondCachedLinkPath: NavigationPath | null = null;
    let reverseCachedLinkPath: NavigationPath | null = null;
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
        "player"
      );
      playerPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(playerPathfindStartIndex)
      );
      const npcPathfindStartIndex = recastPathfindAttempts.length;
      linkCacheValidationWorld.findPath(
        directStartLocation,
        directDestinationLocation,
        "npc"
      );
      npcPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(npcPathfindStartIndex)
      );
      const directBitPathfindStartIndex = recastPathfindAttempts.length;
      directBitPath = linkCacheValidationWorld.findPath(
        directStartLocation,
        directDestinationLocation,
        "bit"
      );
      directBitPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(directBitPathfindStartIndex)
      );
      const startLocation = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(3.5, 0, -1.5)
      );
      const destinationLocation = requireNavigationLocation(
        linkCacheValidationWorld,
        new Vector3(-6.3, 0, -1.5)
      );
      const firstPathfindStartIndex = recastPathfindAttempts.length;
      firstCachedLinkPath = linkCacheValidationWorld.findPath(
        startLocation,
        destinationLocation,
        "bit"
      );
      firstPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(firstPathfindStartIndex)
      );
      const secondPathfindStartIndex = recastPathfindAttempts.length;
      secondCachedLinkPath = linkCacheValidationWorld.findPath(
        startLocation,
        destinationLocation,
        "bit"
      );
      secondPathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(secondPathfindStartIndex)
      );
      const reversePathfindStartIndex = recastPathfindAttempts.length;
      reverseCachedLinkPath = linkCacheValidationWorld.findPath(
        destinationLocation,
        startLocation,
        "bit"
      );
      reversePathfindAttempts = Object.freeze(
        recastPathfindAttempts.slice(reversePathfindStartIndex)
      );
    } finally {
      queryPrototype.findPath = originalFindPath;
      linkCacheValidationWorld?.dispose();
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
    const directBitTransitionCount =
      directBitPath?.steps.filter((step) => step.kind === "transition").length ?? 0;
    const directSurfacePairKey = playerPathfindAttempts[0]
      ? `${playerPathfindAttempts[0].start}->${playerPathfindAttempts[0].destination}`
      : null;
    const directBitSurfacePathfindCount = directSurfacePairKey
      ? directBitPathfindAttempts.filter(
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
    const expectedCachedTransitionIds = [
      bitWindowLink.id,
      cachedSurfaceBridgeLink.id
    ];
    const expectedReverseCachedTransitionIds = [
      cachedSurfaceBridgeLink.id,
      bitWindowLink.id
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
    const firstCachedEndpointSurfaceSteps = getSurfaceStepsBetweenTransitions(
      firstCachedLinkPath,
      bitWindowLink.id,
      cachedSurfaceBridgeLink.id
    );
    const reverseCachedEndpointSurfaceSteps = getSurfaceStepsBetweenTransitions(
      reverseCachedLinkPath,
      cachedSurfaceBridgeLink.id,
      bitWindowLink.id
    );
    const reverseCachedSurfaceMatches =
      firstCachedEndpointSurfaceSteps.length > 0 &&
      firstCachedEndpointSurfaceSteps.length ===
        reverseCachedEndpointSurfaceSteps.length &&
      firstCachedEndpointSurfaceSteps.every((forwardStep, stepIndex) => {
        const reverseStep =
          reverseCachedEndpointSurfaceSteps[
            reverseCachedEndpointSurfaceSteps.length - 1 - stepIndex
          ];
        return (
          forwardStep.points.length === reverseStep.points.length &&
          forwardStep.points.every((forwardPoint, pointIndex) => {
            const reversePoint =
              reverseStep.points[reverseStep.points.length - 1 - pointIndex];
            return (
              forwardPoint.polygonRef === reversePoint.polygonRef &&
              Vector3.Distance(forwardPoint.position, reversePoint.position) <=
                1e-6
            );
          })
        );
      });
    checks.push({
      name: "特殊接続端点間経路の遅延・順不同キャッシュ",
      ok:
        hasExpectedCachedTransitions(firstCachedTransitionIds) &&
        hasExpectedCachedTransitions(secondCachedTransitionIds) &&
        hasExpectedReverseCachedTransitions(reverseCachedTransitionIds) &&
        cachedEndpointKeys.size === linkCacheValidationLinks.length * 2 &&
        constructionPathfindAttempts.length === 0 &&
        playerPathfindAttempts.length === 1 &&
        npcPathfindAttempts.length === 1 &&
        directBitPath !== null &&
        directBitTransitionCount === 0 &&
        directBitPathfindAttempts.length === 1 &&
        directBitSurfacePathfindCount === 1 &&
        firstEndpointSurfacePathfindAttempts.length > 0 &&
        secondEndpointSurfacePathfindAttempts.length === 0 &&
        reverseEndpointSurfacePathfindAttempts.length === 0 &&
        reverseCachedSurfaceMatches,
      detail: `endpoints=${cachedEndpointKeys.size} / build=${constructionPathfindAttempts.length} / normal=${playerPathfindAttempts.length},${npcPathfindAttempts.length} / directBit=${directBitPathfindAttempts.length}(direct=${directBitSurfacePathfindCount}, ${directBitTransitionCount}遷移) / endpoint=${firstEndpointSurfacePathfindAttempts.length},${secondEndpointSurfacePathfindAttempts.length},${reverseEndpointSurfacePathfindAttempts.length} / reversePoints=${reverseCachedSurfaceMatches} / transitions=${firstCachedTransitionIds.join(" > ") || "none"}`
    });

    const highProjectionLink = createValidationLinkPair(
      "bit-window-high-projection-validation",
      "bit_window",
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
        "bit"
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
      "bit-window-unsupported-projection-validation",
      "bit_window",
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
      "bit-window-direct-surface-shortcut-validation",
      "bit_window",
      new Vector3(3, 0.25, -1.5),
      new Vector3(3, 0.25, 1.5)
    );
    let directSurfaceShortcutWorld: NavigationWorld | null = null;
    let directSurfaceNpcPath: NavigationPath | null = null;
    let directSurfaceBitPath: NavigationPath | null = null;
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
      directSurfaceBitPath = findNavigationPath(
        directSurfaceShortcutWorld,
        routeStart,
        routeEnd,
        "bit"
      );
    } finally {
      directSurfaceShortcutWorld?.dispose();
    }
    const directSurfaceBitTransitions =
      directSurfaceBitPath?.steps.filter((step) => step.kind === "transition") ??
      [];
    checks.push({
      name: "通常面成立時のビットA*非実行",
      ok:
        directSurfaceNpcPath !== null &&
        directSurfaceNpcPath.steps.every((step) => step.kind === "surface") &&
        directSurfaceBitPath !== null &&
        directSurfaceBitPath.steps.every((step) => step.kind === "surface") &&
        directSurfaceBitTransitions.length === 0 &&
        Math.abs(
          directSurfaceBitPath.distance - directSurfaceNpcPath.distance
        ) <= 1e-6,
      detail: `npc=${directSurfaceNpcPath?.distance.toFixed(4) ?? "--"} / bit=${directSurfaceBitPath?.distance.toFixed(4) ?? "--"} / transitions=${directSurfaceBitTransitions.length}`
    });
    directSurfaceShortcutLink.endpointA.node.dispose();
    directSurfaceShortcutLink.endpointB.node.dispose();

    const linkedNavigationWorld = await createNavigationWorld(data, [
      bitWindowLink,
      bitRoofLink
    ]);
    pendingNavigationWorlds.push(linkedNavigationWorld);

    const windowOutside = new Vector3(3.9, 0, -1.5);
    const windowInside = new Vector3(5.1, 0, -1.5);
    const windowWithoutLink = findNavigationPath(
      navigationWorld,
      windowOutside,
      windowInside,
      "bit"
    );
    const windowBitForward = findNavigationPath(
      linkedNavigationWorld,
      windowOutside,
      windowInside,
      "bit"
    );
    const windowBitBackward = findNavigationPath(
      linkedNavigationWorld,
      windowInside,
      windowOutside,
      "bit"
    );
    const windowNpcForward = findNavigationPath(
      linkedNavigationWorld,
      windowOutside,
      windowInside,
      "npc"
    );
    const windowPlayerForward = findNavigationPath(
      linkedNavigationWorld,
      windowOutside,
      windowInside,
      "player"
    );
    const windowForwardTransitions =
      windowBitForward?.steps.filter((step) => step.kind === "transition") ?? [];
    const windowBackwardTransitions =
      windowBitBackward?.steps.filter((step) => step.kind === "transition") ?? [];
    checks.push({
      name: "bit_windowのビット専用双方向経路",
      ok:
        windowWithoutLink === null &&
        windowBitForward !== null &&
        windowBitBackward !== null &&
        windowNpcForward === null &&
        windowPlayerForward === null &&
        windowForwardTransitions.length === 1 &&
        windowBackwardTransitions.length === 1 &&
        windowForwardTransitions[0].link.id === bitWindowLink.id &&
        windowBackwardTransitions[0].link.id === bitWindowLink.id &&
        windowForwardTransitions[0].from === "A" &&
        windowBackwardTransitions[0].from === "B",
      detail: `bit=${windowForwardTransitions.length}/${windowBackwardTransitions.length}遷移 / npc=${windowNpcForward === null ? "不可" : "可"} / player=${windowPlayerForward === null ? "不可" : "可"}`
    });

    const roofGround = new Vector3(-9.5, 0, -1.5);
    const roofTop = new Vector3(-9.5, 0.8, -1.5);
    const roofWithoutLink = findNavigationPath(
      navigationWorld,
      roofGround,
      roofTop,
      "bit"
    );
    const roofBitForward = findNavigationPath(
      linkedNavigationWorld,
      roofGround,
      roofTop,
      "bit"
    );
    const roofBitBackward = findNavigationPath(
      linkedNavigationWorld,
      roofTop,
      roofGround,
      "bit"
    );
    const roofNpcForward = findNavigationPath(
      linkedNavigationWorld,
      roofGround,
      roofTop,
      "npc"
    );
    const roofForwardTransition = roofBitForward?.steps.find(
      (step) => step.kind === "transition"
    );
    const roofBackwardTransition = roofBitBackward?.steps.find(
      (step) => step.kind === "transition"
    );
    const roofEndpointMaximumY = Math.max(
      bitRoofLink.endpointA.position.y,
      bitRoofLink.endpointB.position.y
    );
    checks.push({
      name: "bit_roofの屋上接近・帰還固定経路",
      ok:
        roofWithoutLink === null &&
        roofForwardTransition?.link.id === bitRoofLink.id &&
        roofBackwardTransition?.link.id === bitRoofLink.id &&
        roofForwardTransition.from === "A" &&
        roofBackwardTransition.from === "B" &&
        roofNpcForward === null &&
        roofEndpointMaximumY === 1.05,
      detail: `up=${roofForwardTransition?.link.kind ?? "none"} / down=${roofBackwardTransition?.link.kind ?? "none"} / maxY=${roofEndpointMaximumY.toFixed(2)} / npc=${roofNpcForward === null ? "不可" : "可"}`
    });

    const transitionAgent = createNavigationAgent(
      linkedNavigationWorld,
      "bit",
      navigationAgentConfig
    );
    const windowOutsideLocation = requireNavigationLocation(
      linkedNavigationWorld,
      windowOutside
    );
    const windowInsideLocation = requireNavigationLocation(
      linkedNavigationWorld,
      windowInside
    );
    const transitionAgentStep = transitionAgent.update(
      windowOutsideLocation,
      windowInside,
      10,
      1
    );
    checks.push({
      name: "特殊接続入口でのtransition-required",
      ok:
        transitionAgentStep.state === "transition-required" &&
        transitionAgentStep.transition?.link.id === bitWindowLink.id &&
        transitionAgentStep.transition.from === "A" &&
        transitionAgentStep.transition.to === "B" &&
        Vector3.Distance(
          transitionAgentStep.location.position,
          windowOutsideLocation.position
        ) <= 1e-5 &&
        Vector3.Distance(
          transitionAgentStep.transition.entry.position,
          windowOutsideLocation.position
        ) <= 1e-5 &&
        Vector3.Distance(
          transitionAgentStep.transition.exit.position,
          windowInsideLocation.position
        ) <= 1e-5 &&
        Vector3.Distance(
          transitionAgentStep.location.position,
          windowInsideLocation.position
        ) >= 0.5,
      detail: `state=${transitionAgentStep.state} / link=${transitionAgentStep.transition?.link.id ?? "none"}`
    });
    transitionAgent.clear();

    const invalidWindowLink = createValidationLinkPair(
      "bit-window-one-way-validation",
      "bit_window",
      new Vector3(3.9, 0.25, -1.5),
      new Vector3(5.1, 0.25, -1.5),
      false
    );
    const invalidRoofLink = createValidationLinkPair(
      "bit-roof-one-way-validation",
      "bit_roof",
      new Vector3(-9.5, 0.25, -1.5),
      new Vector3(-9.5, 1.05, -1.5),
      false
    );
    let invalidWindowLinkMessage: string | null = null;
    try {
      const invalidWorld = await createNavigationWorld(data, [invalidWindowLink]);
      invalidWorld.dispose();
    } catch (error) {
      invalidWindowLinkMessage = error instanceof Error ? error.message : String(error);
    }
    let invalidRoofLinkMessage: string | null = null;
    try {
      const invalidWorld = await createNavigationWorld(data, [invalidRoofLink]);
      invalidWorld.dispose();
    } catch (error) {
      invalidRoofLinkMessage = error instanceof Error ? error.message : String(error);
    }
    checks.push({
      name: "bit_window・bit_roofの双方向必須契約",
      ok:
        invalidWindowLinkMessage?.includes("双方向必須") === true &&
        invalidWindowLinkMessage.includes(invalidWindowLink.id) &&
        invalidRoofLinkMessage?.includes("双方向必須") === true &&
        invalidRoofLinkMessage.includes(invalidRoofLink.id),
      detail: `window=${invalidWindowLinkMessage ?? "例外なし"} / roof=${invalidRoofLinkMessage ?? "例外なし"}`
    });

    linkedNavigationWorld.dispose();
    pendingNavigationWorlds.splice(
      pendingNavigationWorlds.indexOf(linkedNavigationWorld),
      1
    );
    for (const link of [
      bitWindowLink,
      bitRoofLink,
      invalidWindowLink,
      invalidRoofLink
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
      navigationAgentConfig
    );
    const initialAgentStep = cacheAgent.update(routeStartLocation, routeEnd, 0, 0);
    const cachedAgentStep = cacheAgent.update(
      routeStartLocation,
      routeEnd,
      0,
      0.25
    );
    const movedAgentTarget = routeEnd.add(new Vector3(0.3, 0, 0));
    const movedTargetAgentStep = cacheAgent.update(
      routeStartLocation,
      movedAgentTarget,
      0,
      0
    );
    checks.push({
      name: "3D経路追従の初回探索とキャッシュ",
      ok:
        initialAgentStep.pathRecalculated &&
        initialAgentStep.state === "moving" &&
        !cachedAgentStep.pathRecalculated,
      detail: `initial=${initialAgentStep.pathRecalculated} / cached=${cachedAgentStep.pathRecalculated}`
    });
    checks.push({
      name: "標的移動閾値による経路再計算",
      ok:
        movedTargetAgentStep.pathRecalculated &&
        movedTargetAgentStep.state === "moving",
      detail: `targetMove=${Vector3.Distance(routeEnd, movedAgentTarget).toFixed(3)} / recalculated=${movedTargetAgentStep.pathRecalculated}`
    });

    const unreachableAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      navigationAgentConfig
    );
    const unreachableTarget = new Vector3(-6.5, 0, -1.5);
    const unreachableInitial = unreachableAgent.update(
      routeStartLocation,
      unreachableTarget,
      1,
      0
    );
    const unreachableCached = unreachableAgent.update(
      routeStartLocation,
      unreachableTarget,
      1,
      0.5
    );
    const unreachableRetry = unreachableAgent.update(
      routeStartLocation,
      unreachableTarget,
      1,
      0.5
    );
    checks.push({
      name: "到達不能時の停止と期限後再探索",
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
      navigationAgentConfig
    );
    stuckAgent.update(routeStartLocation, routeEnd, 1, 0);
    const stuckWaiting = stuckAgent.update(routeStartLocation, routeEnd, 1, 0.3);
    const stuckRecalculated = stuckAgent.update(
      routeStartLocation,
      routeEnd,
      1,
      0.3
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
      navigationAgentConfig
    );
    const rampAgentStep = rampAgent.update(rampStartLocation, rampEnd, 0.75, 1);
    checks.push({
      name: "3D経路追従の斜面高度",
      ok:
        rampAgentStep.state === "moving" &&
        rampAgentStep.location.position.y > 0.02 &&
        rampAgentStep.location.position.y < rampEnd.y,
      detail: `positionY=${rampAgentStep.location.position.y.toFixed(4)} / targetY=${rampEnd.y.toFixed(4)}`
    });

    const waypointAgent = createNavigationAgent(
      navigationWorld,
      "npc",
      navigationAgentConfig
    );
    const waypointStep = waypointAgent.update(
      routeStartLocation,
      routeEnd,
      100,
      1
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
      100,
      1
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
      navigationAgentConfig
    );
    clearAgent.update(routeStartLocation, routeEnd, 0, 0);
    const beforeClear = clearAgent.update(routeStartLocation, routeEnd, 0, 0.1);
    clearAgent.clear();
    const afterClear = clearAgent.update(routeStartLocation, routeEnd, 0, 0);
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
        mesh: spawnVolumeMesh
      });
      const emptyMovementColliders = Object.freeze({
        player: Object.freeze([]),
        npc: Object.freeze([]),
        bit: Object.freeze([])
      });
      const spawnVolumeQueries = createStageSpatialQueries(spatialScene, {
        movementColliders: emptyMovementColliders,
        groundColliders: [],
        beamBlockers: [],
        sightBlockers: [],
        volumes: [spawnVolume]
      });
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
      const classificationQueries = createStageSpatialQueries(spatialScene, {
        movementColliders: {
          player: humanMovementClassificationColliders,
          npc: humanMovementClassificationColliders,
          bit: bitMovementClassificationColliders
        },
        groundColliders: normalClassificationColliders,
        beamBlockers: normalClassificationColliders,
        sightBlockers: normalClassificationColliders,
        volumes: []
      });
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
      const actorBeforeWall: V2ActorSphere = Object.freeze({
        id: "actor-before-wall",
        kind: "npc",
        center: new Vector3(1, 0, 0),
        radius: 0.2
      });
      const actorAfterWall: V2ActorSphere = Object.freeze({
        id: "actor-after-wall",
        kind: "npc",
        center: new Vector3(3, 0, 0),
        radius: 0.2
      });
      const actorOnWallSurface: V2ActorSphere = Object.freeze({
        id: "actor-on-wall-surface",
        kind: "npc",
        center: new Vector3(2, 0, 0),
        radius: 0.1
      });
      const actorFirstHit = castV2BeamSegment(
        beamWallStage,
        beamStart,
        beamEnd,
        [actorBeforeWall]
      );
      const wallFirstHit = castV2BeamSegment(
        beamWallStage,
        beamStart,
        beamEnd,
        [actorAfterWall]
      );
      const equalDistanceHit = castV2BeamSegment(
        beamWallStage,
        beamStart,
        beamEnd,
        [actorOnWallSurface]
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
      const playerActor: V2ActorSphere = Object.freeze({
        id: "player-radius-validation",
        kind: "player",
        center: playerCenter,
        radius: playerHorizontalRadius
      });
      const legacyOversizedPlayerActor: V2ActorSphere = Object.freeze({
        ...playerActor,
        radius: PLAYER_SPRITE_HEIGHT * 0.5
      });
      const playerRadiusHit = castV2BeamSegment(
        playerRadiusWallStage,
        beamStart,
        beamEnd,
        [playerActor]
      );
      const legacyRadiusHit = castV2BeamSegment(
        playerRadiusWallStage,
        beamStart,
        beamEnd,
        [legacyOversizedPlayerActor]
      );
      checks.push({
        name: "プレイヤー水平半径と壁優先衝突",
        ok:
          playerHorizontalRadius === 0.1 &&
          playerRadiusHit?.kind === "blocker" &&
          playerRadiusHit.mesh === playerRadiusWall &&
          legacyRadiusHit?.kind === "actor" &&
          legacyRadiusHit.actor.id === playerActor.id,
        detail: `radius=${playerHorizontalRadius.toFixed(6)} / hit=${playerRadiusHit?.kind ?? "--"} / legacyRadius=${legacyOversizedPlayerActor.radius.toFixed(6)} / legacyHit=${legacyRadiusHit?.kind ?? "--"}`
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
        []
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
        []
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
        getActorSpheres: () => [],
        visual: {
          diameter: 0.04,
          color: new Color3(1, 0.4, 0.1),
          alpha: 1
        }
      });
      const highSpeedBeamId = highSpeedBeamSystem.spawn({
        sourceId: "bit-fast",
        origin: beamStart,
        direction: Vector3.Right(),
        speed: 100,
        maximumLifetime: 1
      });
      const highSpeedEvents = highSpeedBeamSystem.update(0.1);
      checks.push({
        name: "前フレーム位置からの高速ビーム連続衝突",
        ok:
          highSpeedEvents.impacts.length === 1 &&
          highSpeedEvents.impacts[0].beamId === highSpeedBeamId &&
          highSpeedEvents.impacts[0].hit.kind === "blocker" &&
          highSpeedEvents.impacts[0].hit.mesh === beamWall &&
          highSpeedEvents.expirations.length === 0 &&
          highSpeedBeamSystem.activeCount === 0,
        detail: `impacts=${highSpeedEvents.impacts.length} / expirations=${highSpeedEvents.expirations.length} / active=${highSpeedBeamSystem.activeCount}`
      });
      highSpeedBeamSystem.dispose();

      const emptyBeamStage = createBeamValidationStage(spatialScene, []);
      const lifetimeBeamSystem = createV2BeamSystem({
        scene: spatialScene,
        stage: emptyBeamStage,
        getActorSpheres: () => [],
        visual: {
          diameter: 0.04,
          color: new Color3(0.2, 0.8, 1),
          alpha: 1
        }
      });
      const lifetimeBeamId = lifetimeBeamSystem.spawn({
        sourceId: "bit-lifetime",
        origin: beamStart,
        direction: Vector3.Right(),
        speed: 8,
        maximumLifetime: 0.25
      });
      const lifetimeEvents = lifetimeBeamSystem.update(1);
      const lifetimeExpiration = lifetimeEvents.expirations[0];
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
          lifetimeBeamSystem.activeCount === 0,
        detail: `impacts=${lifetimeEvents.impacts.length} / expirations=${lifetimeEvents.expirations.length} / positionX=${lifetimeExpiration?.position.x.toFixed(3) ?? "--"}`
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
        const schoolLoadStartedAt = performance.now();
        schoolContext = await loadStageSpatialContext(
          spatialScene,
          SCHOOL_VALIDATION_STAGE
        );
        schoolLoadMs = performance.now() - schoolLoadStartedAt;
        const schoolConstructionPathfindCount = schoolRecastPathfindCount;

        const playerSpawn = schoolContext.markers
          .requireSingle("player_spawn")
          .node.getAbsolutePosition();
        const expectedPlayerSpawn = new Vector3(0.375, 0, 0);
        const windowLinks = schoolContext.links.all.filter(
          (link) => link.kind === "bit_window"
        );
        const roofLinks = schoolContext.links.all.filter(
          (link) => link.kind === "bit_roof"
        );
        const resourceCountsOk =
          schoolContext.resources.visualMeshes.length === 472 &&
          schoolContext.resources.normalColliders.length === 185 &&
          schoolContext.resources.actorOnlyColliders.length === 82 &&
          schoolContext.resources.humanOnlyColliders.length === 58 &&
          schoolContext.resources.navSourceMeshes.length === 15 &&
          schoolContext.markers.all.length === 1 &&
          schoolContext.volumes.all.length === 3 &&
          schoolContext.links.all.length === 60 &&
          windowLinks.length === 58 &&
          roofLinks.length === 2 &&
          schoolContext.links.all.every((link) => link.bidirectional);
        checks.push({
          name: "学校GLBの厳格分類と3D意味Object",
          ok:
            schoolContext.metadata.stageId === "school" &&
            schoolContext.metadata.navProfileId === "school-humanoid-v1" &&
            resourceCountsOk &&
            Vector3.Distance(playerSpawn, expectedPlayerSpawn) <= 1e-5 &&
            schoolContext.boundary.contains(playerSpawn) &&
            schoolContext.volumes.getByRole("npc_spawn").length === 1 &&
            schoolContext.volumes.getByRole("bit_spawn").length === 1 &&
            schoolContext.volumes.getByRole("water").length === 1 &&
            schoolConstructionPathfindCount === 0,
          detail: `VIS=${schoolContext.resources.visualMeshes.length} / COL=${schoolContext.resources.normalColliders.length} / ActorOnly=${schoolContext.resources.actorOnlyColliders.length} / HumanOnly=${schoolContext.resources.humanOnlyColliders.length} / NAV=${schoolContext.resources.navSourceMeshes.length} / VOL=${schoolContext.volumes.all.length} / water=${schoolContext.volumes.getByRole("water").length} / LNK=${schoolContext.links.all.length}(window=${windowLinks.length},roof=${roofLinks.length}) / buildPathfind=${schoolConstructionPathfindCount} / spawn=(${playerSpawn.x.toFixed(3)}, ${playerSpawn.y.toFixed(3)}, ${playerSpawn.z.toFixed(3)})`
        });

        const stageDestination = blenderPointToBabylon(
          new Vector3(47.0, -6.5, 1.0)
        );
        const npcPathfindStartCount = schoolRecastPathfindCount;
        const schoolPath = findNavigationPath(
          schoolContext.navigation,
          playerSpawn,
          stageDestination,
          "npc"
        );
        const npcDirectPathfindCount =
          schoolRecastPathfindCount - npcPathfindStartCount;
        const playerPathfindStartCount = schoolRecastPathfindCount;
        const playerSchoolPath = findNavigationPath(
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
            npcDirectPathfindCount === 1 &&
            playerDirectPathfindCount === 1 &&
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
            const forwardPath = findNavigationPath(
              schoolNavigation,
              playerSpawn,
              point,
              "npc"
            );
            const backwardPath = findNavigationPath(
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
              [...normalColliderSet]
            ) &&
            setMatches(
              new Set(schoolContext.resources.sightBlockers),
              [...normalColliderSet]
            ),
          detail: `normal=${normalColliderSet.size} / ActorOnly=${actorOnlyColliderSet.size} / HumanOnly=${humanOnlyColliderSet.size} / player=${schoolContext.resources.movementColliders.player.length} / npc=${schoolContext.resources.movementColliders.npc.length} / bit=${schoolContext.resources.movementColliders.bit.length} / beam=${schoolContext.resources.beamBlockers.length} / sight=${schoolContext.resources.sightBlockers.length}`
        });

        const representativeWindowLink = windowLinks[0];
        const realWindowPlayerHit = schoolContext.queries.castMovementSegment(
          "player",
          representativeWindowLink.endpointA.position,
          representativeWindowLink.endpointB.position
        );
        const realWindowNpcHit = schoolContext.queries.castMovementSegment(
          "npc",
          representativeWindowLink.endpointA.position,
          representativeWindowLink.endpointB.position
        );
        const realWindowBitHit = schoolContext.queries.castMovementSegment(
          "bit",
          representativeWindowLink.endpointA.position,
          representativeWindowLink.endpointB.position
        );
        const realWindowBeamHit = schoolContext.queries.castBeamSegment(
          representativeWindowLink.endpointA.position,
          representativeWindowLink.endpointB.position
        );
        const realWindowSightHit = schoolContext.queries.castSightSegment(
          representativeWindowLink.endpointA.position,
          representativeWindowLink.endpointB.position
        );
        checks.push({
          name: "実bit_window開口の移動・光線分類",
          ok:
            realWindowPlayerHit?.mesh.name.startsWith(
              "COL_HumanOnly_Window_"
            ) === true &&
            realWindowNpcHit?.mesh === realWindowPlayerHit?.mesh &&
            realWindowBitHit === null &&
            realWindowBeamHit === null &&
            realWindowSightHit === null,
          detail: `link=${representativeWindowLink.id} / player=${realWindowPlayerHit?.mesh.name ?? "clear"} / npc=${realWindowNpcHit?.mesh.name ?? "clear"} / bit=${realWindowBitHit?.mesh.name ?? "clear"} / beam=${realWindowBeamHit?.mesh.name ?? "clear"} / sight=${realWindowSightHit?.mesh.name ?? "clear"}`
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

        const npcRandom = createSeededCountingRandom(0x5f3759df);
        const npcMovementBlocking = createMovementBlockingStage(
          schoolContext,
          "npc"
        );
        const npcSystem = createV2NpcSystem({
          scene: spatialScene,
          stage: npcMovementBlocking.stage,
          npcCount: 2,
          initialBrainwashedNpcCount: 2,
          random: npcRandom.random
        });
        const npcInitializationRandomCallCount = npcRandom.getCallCount();
        npcSystem.applyAlerts([
          {
            leaderId: "npc_0",
            targetId: "player",
            remainingSeconds: 5
          }
        ]);
        const npcTracking = npcSystem.getTrackingSnapshots();
        checks.push({
          name: "NPC発信者visualと受信者alertの分離",
          ok:
            npcTracking[0].targetId === null &&
            npcTracking[0].provenance === null &&
            npcTracking[1].targetId === "player" &&
            npcTracking[1].provenance === "alert" &&
            npcTracking[1].alertLeaderId === "npc_0" &&
            npcTracking[1].alertRemainingSeconds === 5,
          detail: npcTracking
            .map(
              (tracking) =>
                `${tracking.npcId}:${tracking.provenance ?? "none"}/${tracking.targetId ?? "none"}`
            )
            .join(" / ")
        });
        const npcBeforeBlockedMovement = npcSystem.getActorSpheres()[1];
        const npcNavigationStart =
          npcSystem.getTargetSnapshots()[1].footPosition;
        const npcMovementTarget = Object.freeze({
          id: "player",
          kind: "player" as const,
          footPosition: stageDestination.clone(),
          aimPosition: stageDestination.add(new Vector3(0, 0.3, 0)),
          collisionRadius: 0.1,
          alive: true,
          brainwashed: false
        });
        npcSystem.update(0.1, npcMovementTarget);
        const npcFirstPathfindCount = countPathfindAttemptsFrom(
          npcMovementBlocking.getPathfindAttempts(),
          "npc",
          npcNavigationStart
        );
        npcSystem.update(0.1, npcMovementTarget);
        const npcSecondPathfindCount = countPathfindAttemptsFrom(
          npcMovementBlocking.getPathfindAttempts(),
          "npc",
          npcNavigationStart
        );
        const npcAfterBlockedMovement = npcSystem.getActorSpheres()[1];
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
            npcSecondPathfindCount === npcFirstPathfindCount + 1 &&
            Vector3.Distance(
              npcAfterBlockedMovement.center,
              npcBeforeBlockedMovement.center
            ) <= 1e-6,
          detail: `attempts=${npcMovementAttempts.length} / pathfind=${npcFirstPathfindCount}->${npcSecondPathfindCount} / moved=${Vector3.Distance(npcAfterBlockedMovement.center, npcBeforeBlockedMovement.center).toExponential(2)}`
        });
        npcSystem.dispose();

        const multifloorNpcDestinations = [
          ["2F", upperFloorNavigationResults[0].projected!],
          ["3F", upperFloorNavigationResults[2].projected!],
          ["4F", upperFloorNavigationResults[4].projected!],
          ["屋上", upperFloorNavigationResults[6].projected!]
        ] as const;
        const multifloorNpcResults = multifloorNpcDestinations.map(
          ([label, destination], destinationIndex) => {
            const routeRandom = createSeededCountingRandom(
              0x6a09e667 + destinationIndex
            );
            const routeSystem = createV2NpcSystem({
              scene: spatialScene,
              stage: schoolContext!,
              npcCount: 2,
              initialBrainwashedNpcCount: 2,
              random: routeRandom.random
            });
            routeSystem.applyAlerts([
              {
                leaderId: "npc_0",
                targetId: "player",
                remainingSeconds: 600
              }
            ]);
            const start = routeSystem.getTargetSnapshots()[1].footPosition;
            const target = Object.freeze({
              id: "player",
              kind: "player" as const,
              footPosition: destination.position.clone(),
              aimPosition: destination.position.add(new Vector3(0, 0.3, 0)),
              collisionRadius: 0.1,
              alive: true,
              brainwashed: false
            });
            let reached = false;
            const visitedStaircases = new Set<"NW" | "NE" | "SW">();
            let updateCount = 0;
            while (!reached && updateCount < 2400) {
              routeSystem.update(0.25, target);
              updateCount += 1;
              const position =
                routeSystem.getTargetSnapshots()[1].footPosition;
              const containingStaircase = findContainingStaircase(position);
              if (containingStaircase !== null) {
                visitedStaircases.add(containingStaircase);
              }
              reached = Vector3.Distance(position, destination.position) <= 0.15;
            }
            const finalPosition =
              routeSystem.getTargetSnapshots()[1].footPosition;
            routeSystem.dispose();
            return {
              label,
              startedOnFirstFloor: Math.abs(start.y) <= 0.1,
              reached,
              visitedStaircases: [...visitedStaircases].sort(),
              updateCount,
              endpointError: Vector3.Distance(
                finalPosition,
                destination.position
              )
            };
          }
        );
        checks.push({
          name: "実V2NpcSystemの1Fから2F・3F・4F・屋上追跡",
          ok: multifloorNpcResults.every(
            (result) =>
              result.startedOnFirstFloor &&
              result.reached &&
              result.visitedStaircases.length > 0 &&
              (result.label !== "屋上" ||
                result.visitedStaircases.includes("NW")) &&
              result.endpointError <= 0.15
          ),
          detail: multifloorNpcResults
            .map(
              (result) =>
                `${result.label}:1F=${result.startedOnFirstFloor},reached=${result.reached},stairs=${result.visitedStaircases.join(",") || "none"},updates=${result.updateCount},error=${result.endpointError.toFixed(3)}`
            )
            .join(" / ")
        });

        const unreachableNpcRandom = createSeededCountingRandom(0x510e527f);
        const unreachableNpcSystem = createV2NpcSystem({
          scene: spatialScene,
          stage: schoolContext,
          npcCount: 2,
          initialBrainwashedNpcCount: 2,
          random: unreachableNpcRandom.random
        });
        unreachableNpcSystem.applyAlerts([
          {
            leaderId: "npc_0",
            targetId: "player",
            remainingSeconds: 10
          }
        ]);
        const unreachableNpcStart =
          unreachableNpcSystem.getTargetSnapshots()[1].footPosition;
        const unreachablePlayerTarget = Object.freeze({
          id: "player",
          kind: "player" as const,
          footPosition: new Vector3(100, 100, 100),
          aimPosition: new Vector3(100, 100.3, 100),
          collisionRadius: 0.1,
          alive: true,
          brainwashed: false
        });
        for (let updateIndex = 0; updateIndex < 4; updateIndex += 1) {
          unreachableNpcSystem.update(0.25, unreachablePlayerTarget);
        }
        const unreachableNpcEnd =
          unreachableNpcSystem.getTargetSnapshots()[1].footPosition;
        unreachableNpcSystem.dispose();
        checks.push({
          name: "実V2NpcSystemの到達不能時停止",
          ok:
            Vector3.Distance(unreachableNpcStart, unreachableNpcEnd) <= 1e-6,
          detail: `moved=${Vector3.Distance(unreachableNpcStart, unreachableNpcEnd).toExponential(2)}`
        });

        const npcFailureBaseline = countSceneResources(spatialScene);
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
        const npcThrownValue = captureThrownValue(() => {
          const unexpectedSystem = createV2NpcSystem({
            scene: spatialScene,
            stage: npcFailureStage,
            npcCount: 2,
            initialBrainwashedNpcCount: 2,
            random: npcFailureRandom.random
          });
          unexpectedSystem.dispose();
        });
        const npcFailureAfter = countSceneResources(spatialScene);
        checks.push({
          name: "NPC factory初期化失敗時の資源回収",
          ok:
            npcThrownValue === npcInjectedError &&
            npcFailureDisposalOrder.join("|") ===
              "sprite:npc_1|sprite:npc_0|manager:V2SchoolNpcSpriteManager" &&
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
        const bitSystem = createV2BitSystem(
          spatialScene,
          bitMovementBlocking.stage,
          {
            initialBitCount: 2,
            minimumSpawnDistance: 0.2,
            spawnMaxAttempts: 128,
            spawnProjectionMaxDistance: 0.75,
            minimumFlightHeight: 0.3,
            maximumFlightHeight: 0.3,
            random: bitRandom.random
          }
        );
        const bitInitializationRandomCallCount = bitRandom.getCallCount();
        const initialBitActors = bitSystem.getActorSpheres();
        const bitNavigationStart = initialBitActors[1].center.clone();
        const bitGround = schoolContext.queries.sampleGround(
          initialBitActors[0].center.add(new Vector3(0, 0.5, 0)),
          1.5
        );
        checks.push({
          name: "ビットの物理床相対高度",
          ok:
            bitGround !== null &&
            Math.abs(
              initialBitActors[0].center.y - bitGround.point.y - 0.3
            ) <= 1e-6,
          detail: `centerY=${initialBitActors[0].center.y.toFixed(4)} / groundY=${bitGround?.point.y.toFixed(4) ?? "--"}`
        });

        const distantPlayerTarget = Object.freeze({
          id: "player",
          kind: "player" as const,
          footPosition: stageDestination.clone(),
          aimPosition: stageDestination.add(new Vector3(0, 0.3, 0)),
          collisionRadius: 0.1,
          alive: true,
          brainwashed: false
        });
        forceNormalChase = true;
        bitSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: 0,
          targets: [distantPlayerTarget],
          externalAlerts: [
            {
              leaderId: "v2_bit_0",
              targetId: "player",
              remainingSeconds: 5
            }
          ]
        });
        const bitAlertStates = bitSystem.getTargetStates();
        const bitFirstPathfindCount = countPathfindAttemptsFrom(
          bitMovementBlocking.getPathfindAttempts(),
          "bit",
          bitNavigationStart
        );
        bitSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: 0.1,
          targets: [distantPlayerTarget],
          externalAlerts: []
        });
        const bitSecondPathfindCount = countPathfindAttemptsFrom(
          bitMovementBlocking.getPathfindAttempts(),
          "bit",
          bitNavigationStart
        );
        const bitAfterBlockedMovement = bitSystem.getActorSpheres()[1];
        const bitMovementAttempts = bitMovementBlocking.getAttempts();
        const bitChaseAttempt = bitMovementAttempts.find(
          (attempt) =>
            attempt.moverKind === "bit" &&
            Vector3.Distance(attempt.from, initialBitActors[1].center) <= 1e-6
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
            bitFirstPathfindCount >= 1 &&
            bitSecondPathfindCount === bitFirstPathfindCount + 1 &&
            Vector3.Distance(
              bitAfterBlockedMovement.center,
              initialBitActors[1].center
            ) <= 1e-6,
          detail: `mode=${bitAlertStates[1].mode} / attempts=${bitMovementAttempts.length} / pathfind=${bitFirstPathfindCount}->${bitSecondPathfindCount} / moved=${Vector3.Distance(bitAfterBlockedMovement.center, initialBitActors[1].center).toExponential(2)}`
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
              initialBitCount: 2,
              minimumSpawnDistance: 0.2,
              spawnMaxAttempts: 128,
              spawnProjectionMaxDistance: 0.75,
              minimumFlightHeight: 0.3,
              maximumFlightHeight: 0.3,
              random: bitFailureRandom.random
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
            initialBitCount: 1,
            minimumSpawnDistance: 0,
            spawnMaxAttempts: 128,
            spawnProjectionMaxDistance: 0.75,
            minimumFlightHeight: 0.3,
            maximumFlightHeight: 0.3,
            random: bitRandom.random
          }
        );
        const brainwashedNpcTarget = Object.freeze({
          id: "npc_brainwashed",
          kind: "npc" as const,
          footPosition: stageDestination.clone(),
          aimPosition: stageDestination.add(new Vector3(0, 0.2, 0)),
          collisionRadius: 0.1,
          alive: true,
          brainwashed: true
        });
        brainwashedTargetBitSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: 0,
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
          brainwashedTargetBitSystem.getTargetStates()[0];
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
            initialBitCount: 1,
            minimumSpawnDistance: 0,
            spawnMaxAttempts: 128,
            spawnProjectionMaxDistance: 0.75,
            minimumFlightHeight: 0.3,
            maximumFlightHeight: 0.3,
            random: bitRandom.random
          }
        );
        const visionBitCenter = visionBitSystem.getActorSpheres()[0].center;
        const ringTargets = Array.from({ length: 12 }, (_, index) => {
          const angle = (index / 12) * Math.PI * 2;
          const aimPosition = visionBitCenter.add(
            new Vector3(Math.cos(angle) * 0.15, 0, Math.sin(angle) * 0.15)
          );
          return Object.freeze({
            id: `vision_target_${index}`,
            kind: "npc" as const,
            footPosition: aimPosition.add(new Vector3(0, -0.2, 0)),
            aimPosition,
            collisionRadius: 0.1,
            alive: true,
            brainwashed: false
          });
        });
        visionBitSystem.update({
          deltaSeconds: 0,
          elapsedSeconds: 0,
          targets: ringTargets,
          externalAlerts: []
        });
        const acquiredVisionState = visionBitSystem.getTargetStates()[0];
        const acquiredTarget = ringTargets.find(
          (target) => target.id === acquiredVisionState.targetId
        );
        const aimedBitCenter = visionBitSystem.getActorSpheres()[0].center;
        const behindDirection = acquiredTarget
          ? acquiredTarget.aimPosition.subtract(aimedBitCenter).normalize()
          : Vector3.Forward();
        const behindAimPosition = aimedBitCenter.subtract(
          behindDirection.scale(0.15)
        );
        const behindTarget = Object.freeze({
          id: acquiredVisionState.targetId ?? "not-acquired",
          kind: "npc" as const,
          footPosition: behindAimPosition.add(new Vector3(0, -0.2, 0)),
          aimPosition: behindAimPosition,
          collisionRadius: 0.1,
          alive: true,
          brainwashed: false
        });
        visionBitSystem.update({
          deltaSeconds: 0,
          elapsedSeconds: 0,
          targets: [behindTarget],
          externalAlerts: []
        });
        const releasedVisionState = visionBitSystem.getTargetStates()[0];
        checks.push({
          name: "ビットvisual標的の扇形外解除",
          ok:
            acquiredVisionState.provenance === "visual" &&
            acquiredTarget !== undefined &&
            releasedVisionState.targetId === null &&
            releasedVisionState.provenance === null,
          detail: `acquired=${acquiredVisionState.targetId ?? "none"} / released=${releasedVisionState.targetId ?? "none"}`
        });
        visionBitSystem.dispose();

        schoolContext.dispose();
        schoolContext = null;
        const afterFirstDispose = countSceneResources(spatialScene);
        const reloadedContext = await loadStageSpatialContext(
          spatialScene,
          SCHOOL_VALIDATION_STAGE
        );
        const reloadedMetadataOk =
          reloadedContext.metadata.stageId === "school" &&
          reloadedContext.resources.visualMeshes.length === 472 &&
          reloadedContext.resources.normalColliders.length === 185 &&
          reloadedContext.resources.actorOnlyColliders.length === 82 &&
          reloadedContext.resources.humanOnlyColliders.length === 58 &&
          reloadedContext.resources.navSourceMeshes.length === 15 &&
          reloadedContext.volumes.getByRole("water").length === 1 &&
          reloadedContext.links.all.length === 60;
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
    summary.dataset.state = passedCount === checks.length ? "passed" : "failed";
    summary.textContent = `${passedCount} / ${checks.length} 項目がPASSしました。`;
    downloadButton.disabled = false;
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ name: "検証処理", ok: false, detail: message });
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
