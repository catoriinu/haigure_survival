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
  Vector3,
  type SpriteManager
} from "@babylonjs/core";
import { exportNavMesh } from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

import {
  createNavigationWorld,
  initializeNavigationRuntime,
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
  const actorColliders = [...normalColliders, ...actorOnlyColliders];
  return {
    resources: {
      beamBlockers: normalColliders,
      sightBlockers: normalColliders
    },
    queries: createStageSpatialQueries(
      targetScene,
      actorColliders,
      normalColliders,
      normalColliders,
      []
    )
  } as unknown as StageSpatialContext;
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

    const navigationWorld = await createNavigationWorld(data);
    pendingNavigationWorlds.push(navigationWorld);
    navigationWorld.createDebugMesh(scene);

    const routeStart = new Vector3(3, 0, -1.5);
    const routeEnd = new Vector3(3, 0, 1.5);
    const routeResult = navigationWorld.findPath(routeStart, routeEnd);
    const routePath = routeResult?.points ?? [];
    const routeMinX = Math.min(...routePath.map((point) => point.x));
    checks.push({
      name: "壁を抜けず扉へ迂回",
      ok: routeResult !== null && routePath.length >= 3 && routeMinX < 0.95,
      detail: `${routePath.length}点 / minX=${routeMinX.toFixed(4)} / ${routeResult?.distance.toFixed(4) ?? "--"} wu`
    });

    const rampStart = new Vector3(0.25, 0, -1.75);
    const rampEnd = new Vector3(-1.5, 0.25, -1.75);
    const rampResult = navigationWorld.findPath(rampStart, rampEnd);
    const rampPath = rampResult?.points ?? [];
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
    const restoredNavigationWorld = await createNavigationWorld(data);
    pendingNavigationWorlds.push(restoredNavigationWorld);
    const restoreMs = performance.now() - restoreStartedAt;
    const restoredRoutePath = restoredNavigationWorld.findPath(routeStart, routeEnd)?.points ?? [];
    const restoredRampPath = restoredNavigationWorld.findPath(rampStart, rampEnd)?.points ?? [];
    checks.push({
      name: "NavMeshバイナリ往復",
      ok:
        data.byteLength > 0 &&
        pathsEqual(routePath, restoredRoutePath) &&
        pathsEqual(rampPath, restoredRampPath),
      detail: `${data.byteLength} bytes / 復元 ${restoreMs.toFixed(2)} ms`
    });

    const unreachableResult = navigationWorld.findPath(
      new Vector3(3, 0, -1.5),
      new Vector3(8, 0, 8)
    );
    checks.push({
      name: "NavMesh外の到達不能地点",
      ok: unreachableResult === null,
      detail: `${unreachableResult?.points.length ?? 0}点`
    });

    const disconnectedIslandResult = navigationWorld.findPath(
      new Vector3(3, 0, -1.5),
      new Vector3(-6.5, 0, -1.5)
    );
    checks.push({
      name: "切断されたNavMesh島",
      ok: disconnectedIslandResult === null,
      detail: `${disconnectedIslandResult?.points.length ?? 0}点`
    });

    const stackedLowerStart = new Vector3(-9.2, 0, -1.8);
    const stackedLowerEnd = new Vector3(-9.8, 0, -1.2);
    const stackedUpperStart = new Vector3(-9.2, 0.8, -1.8);
    const stackedUpperEnd = new Vector3(-9.8, 0.8, -1.2);
    const stackedLowerPath = navigationWorld.findPath(stackedLowerStart, stackedLowerEnd);
    const stackedUpperPath = navigationWorld.findPath(stackedUpperStart, stackedUpperEnd);
    const stackedCrossFloorPath = navigationWorld.findPath(stackedLowerStart, stackedUpperEnd);
    const lowerProjected = navigationWorld.projectPoint(stackedLowerStart, 0.1);
    const upperProjected = navigationWorld.projectPoint(stackedUpperStart, 0.1);
    checks.push({
      name: "重複する上下床の分離",
      ok:
        stackedLowerPath !== null &&
        stackedUpperPath !== null &&
        stackedCrossFloorPath === null &&
        lowerProjected !== null &&
        upperProjected !== null &&
        upperProjected.y - lowerProjected.y >= 0.7,
      detail: `lowerY=${lowerProjected?.y.toFixed(4) ?? "--"} / upperY=${upperProjected?.y.toFixed(4) ?? "--"} / cross=${stackedCrossFloorPath?.points.length ?? 0}点`
    });

    const projectedPoint = navigationWorld.projectPoint(new Vector3(3, 0.1, -1.5), 0.2);
    const constrainedPoint = navigationWorld.constrainMovement(
      new Vector3(3, 0, -1.5),
      new Vector3(3, 0, 1.5)
    );
    const randomPoint = navigationWorld.randomPointAround(new Vector3(3, 0, -1.5), 0.5);
    const randomDistance = randomPoint
      ? Vector3.Distance(randomPoint, new Vector3(3, 0, -1.5))
      : Number.POSITIVE_INFINITY;
    checks.push({
      name: "本番NavigationWorld問い合わせ",
      ok:
        projectedPoint !== null &&
        Math.abs(projectedPoint.y) <= 0.02 &&
        constrainedPoint !== null &&
        constrainedPoint.z < 0 &&
        randomPoint !== null &&
        randomDistance <= 0.5 + 1e-5,
      detail: `projectY=${projectedPoint?.y.toFixed(4) ?? "--"} / constrainZ=${constrainedPoint?.z.toFixed(4) ?? "--"} / random=${Number.isFinite(randomDistance) ? randomDistance.toFixed(4) : "--"}`
    });

    const cacheAgent = createNavigationAgent(
      navigationWorld,
      navigationAgentConfig
    );
    const initialAgentStep = cacheAgent.update(routeStart, routeEnd, 0, 0);
    const cachedAgentStep = cacheAgent.update(routeStart, routeEnd, 0, 0.25);
    const movedAgentTarget = routeEnd.add(new Vector3(0.3, 0, 0));
    const movedTargetAgentStep = cacheAgent.update(
      routeStart,
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
      navigationAgentConfig
    );
    const unreachableTarget = new Vector3(-6.5, 0, -1.5);
    const unreachableInitial = unreachableAgent.update(
      routeStart,
      unreachableTarget,
      1,
      0
    );
    const unreachableCached = unreachableAgent.update(
      routeStart,
      unreachableTarget,
      1,
      0.5
    );
    const unreachableRetry = unreachableAgent.update(
      routeStart,
      unreachableTarget,
      1,
      0.5
    );
    checks.push({
      name: "到達不能時の停止と期限後再探索",
      ok:
        unreachableInitial.state === "unreachable" &&
        Vector3.Distance(unreachableInitial.position, routeStart) <= 1e-6 &&
        !unreachableCached.pathRecalculated &&
        Vector3.Distance(unreachableCached.position, routeStart) <= 1e-6 &&
        unreachableRetry.pathRecalculated &&
        unreachableRetry.state === "unreachable" &&
        Vector3.Distance(unreachableRetry.position, routeStart) <= 1e-6,
      detail: `initial=${unreachableInitial.pathRecalculated} / cached=${unreachableCached.pathRecalculated} / retry=${unreachableRetry.pathRecalculated}`
    });

    const stuckAgent = createNavigationAgent(
      navigationWorld,
      navigationAgentConfig
    );
    stuckAgent.update(routeStart, routeEnd, 1, 0);
    const stuckWaiting = stuckAgent.update(routeStart, routeEnd, 1, 0.3);
    const stuckRecalculated = stuckAgent.update(routeStart, routeEnd, 1, 0.3);
    checks.push({
      name: "移動停止判定による経路再計算",
      ok:
        !stuckWaiting.pathRecalculated &&
        stuckRecalculated.pathRecalculated,
      detail: `waiting=${stuckWaiting.pathRecalculated} / stuck=${stuckRecalculated.pathRecalculated}`
    });

    const rampAgent = createNavigationAgent(
      navigationWorld,
      navigationAgentConfig
    );
    const rampAgentStep = rampAgent.update(rampStart, rampEnd, 0.75, 1);
    checks.push({
      name: "3D経路追従の斜面高度",
      ok:
        rampAgentStep.state === "moving" &&
        rampAgentStep.position.y > 0.02 &&
        rampAgentStep.position.y < rampEnd.y,
      detail: `positionY=${rampAgentStep.position.y.toFixed(4)} / targetY=${rampEnd.y.toFixed(4)}`
    });

    const waypointAgent = createNavigationAgent(
      navigationWorld,
      navigationAgentConfig
    );
    const waypointStep = waypointAgent.update(routeStart, routeEnd, 100, 1);
    const routeEndpoint = routePath[routePath.length - 1];
    checks.push({
      name: "移動予算内の複数経路点通過",
      ok:
        routePath.length >= 3 &&
        waypointStep.state === "arrived" &&
        Vector3.Distance(waypointStep.position, routeEndpoint) <= 1e-5,
      detail: `${routePath.length}点 / endpointError=${Vector3.Distance(waypointStep.position, routeEndpoint).toExponential(2)}`
    });

    const projectedTargetAgent = createNavigationAgent(
      navigationWorld,
      navigationAgentConfig
    );
    const floatingTarget = routeEnd.add(new Vector3(0, 0.05, 0));
    const floatingTargetProjection = navigationWorld.projectPoint(
      floatingTarget,
      navigationAgentConfig.projectionMaxDistance
    );
    const projectedTargetStep = projectedTargetAgent.update(
      routeStart,
      floatingTarget,
      100,
      1
    );
    checks.push({
      name: "NavMesh投影標的への到着",
      ok:
        floatingTargetProjection !== null &&
        projectedTargetStep.state === "arrived" &&
        Vector3.Distance(projectedTargetStep.position, floatingTargetProjection) <=
          1e-5,
      detail: `rawY=${floatingTarget.y.toFixed(4)} / projectedY=${floatingTargetProjection?.y.toFixed(4) ?? "--"} / state=${projectedTargetStep.state}`
    });

    const clearAgent = createNavigationAgent(
      navigationWorld,
      navigationAgentConfig
    );
    clearAgent.update(routeStart, routeEnd, 0, 0);
    const beforeClear = clearAgent.update(routeStart, routeEnd, 0, 0.1);
    clearAgent.clear();
    const afterClear = clearAgent.update(routeStart, routeEnd, 0, 0);
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
      const spawnVolumeQueries = createStageSpatialQueries(
        spatialScene,
        [],
        [],
        [],
        [spawnVolume]
      );
      const projectToGround = (position: Vector3) =>
        new Vector3(position.x, 0, position.z);

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
          spawnVolumeQueries.containsVolume("npc_spawn", singleSpawnPoint) &&
          Vector3.Distance(singleSpawnPoint, new Vector3(3, 0, -2)) <= 1e-6 &&
          singleProjectionMaxDistance === 2 &&
          singleRandom.getCallCount() === 3,
        detail: `point=(${singleSpawnPoint.x.toFixed(3)}, ${singleSpawnPoint.y.toFixed(3)}, ${singleSpawnPoint.z.toFixed(3)}) / projection=${singleProjectionMaxDistance}`
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
        Vector3.Distance(multipleSpawnPoints[0], multipleSpawnPoints[1]),
        Vector3.Distance(multipleSpawnPoints[0], multipleSpawnPoints[2]),
        Vector3.Distance(multipleSpawnPoints[1], multipleSpawnPoints[2])
      ];
      checks.push({
        name: "複数spawn点の最小3D距離",
        ok:
          multipleSpawnPoints.every((point) =>
            spawnVolumeQueries.containsVolume("npc_spawn", point)
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
            duplicateCheckedPoints[0],
            duplicateCheckedPoints[1]
          ) > 0,
        detail: `randomCalls=${duplicateRandom.getCallCount()} / distance=${Vector3.Distance(duplicateCheckedPoints[0], duplicateCheckedPoints[1]).toFixed(3)}`
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
      const normalWall = MeshBuilder.CreateBox(
        "COL_Wall_Validation",
        { size: 0.4 },
        spatialScene
      );
      actorOnlyWindow.position.x = 0;
      normalWall.position.x = 2;
      const classificationQueries = createStageSpatialQueries(
        spatialScene,
        [actorOnlyWindow, normalWall],
        [normalWall],
        [normalWall],
        []
      );
      const classificationStart = new Vector3(-2, 0, 0);
      const classificationEnd = new Vector3(4, 0, 0);
      const actorOnlyHit = classificationQueries.castActorSegment(
        classificationStart,
        classificationEnd
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
        name: "ActorOnly窓の移動遮蔽と光線透過",
        ok:
          actorOnlyHit?.mesh === actorOnlyWindow &&
          beamThroughWindowHit?.mesh === normalWall &&
          sightThroughWindowHit?.mesh === normalWall,
        detail: `actor=${actorOnlyHit?.mesh.name ?? "--"} / beam=${beamThroughWindowHit?.mesh.name ?? "--"} / sight=${sightThroughWindowHit?.mesh.name ?? "--"}`
      });
      actorOnlyWindow.dispose();
      normalWall.dispose();

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
      try {
        const schoolLoadStartedAt = performance.now();
        schoolContext = await loadStageSpatialContext(
          spatialScene,
          SCHOOL_VALIDATION_STAGE
        );
        schoolLoadMs = performance.now() - schoolLoadStartedAt;

        const playerSpawn = schoolContext.markers
          .requireSingle("player_spawn")
          .node.getAbsolutePosition();
        const expectedPlayerSpawn = new Vector3(0.375, 0, 0);
        const resourceCountsOk =
          schoolContext.resources.visualMeshes.length === 309 &&
          schoolContext.resources.normalColliders.length === 160 &&
          schoolContext.resources.actorOnlyColliders.length === 0 &&
          schoolContext.resources.navSourceMeshes.length === 8 &&
          schoolContext.markers.all.length === 1 &&
          schoolContext.volumes.all.length === 2;
        checks.push({
          name: "学校GLBの厳格分類と3D意味Object",
          ok:
            schoolContext.metadata.stageId === "school" &&
            schoolContext.metadata.navProfileId === "school-humanoid-v1" &&
            resourceCountsOk &&
            Vector3.Distance(playerSpawn, expectedPlayerSpawn) <= 1e-5 &&
            schoolContext.boundary.contains(playerSpawn) &&
            schoolContext.volumes.getByRole("npc_spawn").length === 1 &&
            schoolContext.volumes.getByRole("bit_spawn").length === 1,
          detail: `VIS=${schoolContext.resources.visualMeshes.length} / COL=${schoolContext.resources.normalColliders.length} / NAV=${schoolContext.resources.navSourceMeshes.length} / spawn=(${playerSpawn.x.toFixed(3)}, ${playerSpawn.y.toFixed(3)}, ${playerSpawn.z.toFixed(3)})`
        });

        const stageDestination = new Vector3(-11.35, 0.25, 1.625);
        const schoolPath = schoolContext.navigation.findPath(
          playerSpawn,
          stageDestination
        );
        const projectedStageDestination = schoolContext.navigation.projectPoint(
          stageDestination,
          0.1
        );
        const schoolPathEndpoint = schoolPath
          ? schoolPath.points[schoolPath.points.length - 1]
          : null;
        const schoolPathEndpointError = schoolPathEndpoint && projectedStageDestination
          ? Vector3.Distance(schoolPathEndpoint, projectedStageDestination)
          : Number.POSITIVE_INFINITY;
        const chestPosition = playerSpawn.add(new Vector3(0, 0.2, 0));
        const outsidePosition = new Vector3(5.5, 0.2, 0);
        const actorWallHit = schoolContext.queries.castActorSegment(
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
            projectedStageDestination !== null &&
            schoolPathEndpointError <= 1e-5 &&
            actorWallHit !== null &&
            beamWallHit !== null &&
            sightWallHit !== null &&
            actorWallHit.mesh === beamWallHit.mesh &&
            beamWallHit.mesh === sightWallHit.mesh,
          detail: `${schoolPath?.points.length ?? 0}点 / endpointError=${Number.isFinite(schoolPathEndpointError) ? schoolPathEndpointError.toExponential(2) : "--"} / blocker=${beamWallHit?.mesh.name ?? "--"}`
        });

        const upperFloorRepresentatives = [
          ["2F床", new Vector3(10.0, 39.0, 3.6)],
          ["2F階段", new Vector3(-11.4, 39.8, 3.6)],
          ["3F床", new Vector3(10.0, 39.0, 6.6)],
          ["3F階段", new Vector3(-11.4, 39.8, 6.6)],
          ["4F床", new Vector3(10.0, 39.0, 9.6)],
          ["4F階段", new Vector3(-11.4, 39.8, 9.6)],
          ["屋上", new Vector3(-7.8, 37.8, 12.7)],
          ["プールサイド", new Vector3(13.4, 39.0, 13.85)],
          ["プール底", new Vector3(24.4, 39.0, 12.86)]
        ] as const;
        const schoolNavigation = schoolContext.navigation;
        const upperFloorNavigationResults = upperFloorRepresentatives.map(
          ([label, blenderPoint]) => {
            const point = blenderPointToBabylon(blenderPoint);
            return {
              label,
              projected: schoolNavigation.projectPoint(point, 0.1),
              path: schoolNavigation.findPath(playerSpawn, point)
            };
          }
        );
        checks.push({
          name: "上階・屋上をNPC用NavMeshから除外",
          ok: upperFloorNavigationResults.every(
            (result) => result.projected === null && result.path === null
          ),
          detail: upperFloorNavigationResults
            .map(
              (result) =>
                `${result.label}:projected=${result.projected?.toString() ?? "null"},` +
                `path=${result.path === null ? "null" : `${result.path.points.length}点`}`
            )
            .join(" / ")
        });

        const npcRandom = createSeededCountingRandom(0x5f3759df);
        const npcSystem = createV2NpcSystem({
          scene: spatialScene,
          stage: schoolContext,
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
        npcSystem.dispose();

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

        const bitRandom = createSeededCountingRandom(0x9e3779b9);
        const bitSystem = createV2BitSystem(
          spatialScene,
          schoolContext,
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
        checks.push({
          name: "ビット発信者visualと受信者alertの分離",
          ok:
            bitAlertStates[0].provenance !== "alert" &&
            bitAlertStates[0].alertLeaderId === null &&
            bitAlertStates[1].targetId === "player" &&
            bitAlertStates[1].provenance === "alert" &&
            bitAlertStates[1].alertLeaderId === "v2_bit_0",
          detail: bitAlertStates
            .map(
              (state) =>
                `${state.bitId}:${state.provenance ?? "none"}/${state.targetId ?? "none"}`
            )
            .join(" / ")
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
          reloadedContext.resources.visualMeshes.length === 309 &&
          reloadedContext.resources.normalColliders.length === 160;
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
