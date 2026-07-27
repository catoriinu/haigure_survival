import {
  AbstractMesh,
  ArcRotateCamera,
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  Logger,
  Scene,
  Vector3
} from "@babylonjs/core";

import { SCHOOL_STAGE } from "../../../src/world/stageCatalog";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  type BitFlightBandRef,
  type BitFlightTransition
} from "../../../src/world/bitFlightNavigation";
import {
  BIT_FLIGHT_ENVELOPE_RADIUS_METERS,
  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
} from "../../../src/world/bitFlightSafety";
import {
  V2_PLAYER_BASE_EYE_HEIGHT,
  V2_PLAYER_MAX_EYE_HEIGHT_SCALE,
  createV2PlayerController
} from "../../../src/v2/playerController";
import type { V2PlayerInput } from "../../../src/v2/playerInput";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../../../src/world/stageSpatialContext";

type CheckResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly CheckResult[];
}>;

type SceneResourceCounts = Readonly<{
  meshes: number;
  materials: number;
  textures: number;
  transformNodes: number;
}>;

declare global {
  interface Window {
    __T02_VALIDATION__: ValidationState;
  }
}

const canvas = document.getElementById(
  "render-canvas"
) as unknown as HTMLCanvasElement;
const summary = document.getElementById("summary") as HTMLElement;
const results = document.getElementById("results") as HTMLOListElement;
const runButton = document.getElementById("run-validation") as HTMLButtonElement;

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.025, 0.045, 0.07, 1);

const camera = new ArcRotateCamera(
  "T02Camera",
  -Math.PI / 2.4,
  Math.PI / 3.1,
  8,
  new Vector3(1, 0, 0),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 3;
camera.upperRadiusLimit = 14;

const light = new HemisphericLight(
  "T02Light",
  new Vector3(-0.4, 1, -0.2),
  scene
);
light.intensity = 1.1;

const browserErrors: string[] = [];
const formatError = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);

window.addEventListener("error", (event) => {
  browserErrors.push(formatError(event.error ?? event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  browserErrors.push(`unhandledrejection: ${formatError(event.reason)}`);
});

const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  browserErrors.push(values.map(formatError).join(" "));
  originalConsoleError(...values);
};

let running = false;
let activeContext: StageSpatialContext | null = null;

const createCheck = (
  name: string,
  ok: boolean,
  detail: string
): CheckResult => ({ name, ok, detail });

const renderResults = (checks: readonly CheckResult[]) => {
  results.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.className = check.ok ? "pass" : "fail";
      item.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name} — ${check.detail}`;
      return item;
    })
  );
  const failedCount = checks.filter((check) => !check.ok).length;
  summary.textContent = `全${checks.length}項目 / PASS ${checks.length - failedCount} / FAIL ${failedCount}`;
};

const resolveAssetUrl = (relativeUrl: string) =>
  `${import.meta.env.BASE_URL}${relativeUrl}`;

const blenderPointToBabylon = (point: Vector3) =>
  new Vector3(
    -point.x * BLENDER_METERS_TO_WORLD_UNITS,
    point.z * BLENDER_METERS_TO_WORLD_UNITS,
    -point.y * BLENDER_METERS_TO_WORLD_UNITS
  );

const compareBlenderBounds = (
  mesh: AbstractMesh | undefined,
  minimum: Vector3,
  maximum: Vector3
) => {
  if (!mesh) {
    return { ok: false, detail: "Meshなし" };
  }
  const expectedPoints = [
    new Vector3(minimum.x, minimum.y, minimum.z),
    new Vector3(minimum.x, minimum.y, maximum.z),
    new Vector3(minimum.x, maximum.y, minimum.z),
    new Vector3(minimum.x, maximum.y, maximum.z),
    new Vector3(maximum.x, minimum.y, minimum.z),
    new Vector3(maximum.x, minimum.y, maximum.z),
    new Vector3(maximum.x, maximum.y, minimum.z),
    new Vector3(maximum.x, maximum.y, maximum.z)
  ].map(blenderPointToBabylon);
  const expectedMinimum = new Vector3(
    Math.min(...expectedPoints.map((point) => point.x)),
    Math.min(...expectedPoints.map((point) => point.y)),
    Math.min(...expectedPoints.map((point) => point.z))
  );
  const expectedMaximum = new Vector3(
    Math.max(...expectedPoints.map((point) => point.x)),
    Math.max(...expectedPoints.map((point) => point.y)),
    Math.max(...expectedPoints.map((point) => point.z))
  );
  mesh.computeWorldMatrix(true);
  const bounds = mesh.getBoundingInfo().boundingBox;
  const actualMinimum = bounds.minimumWorld;
  const actualMaximum = bounds.maximumWorld;
  return {
    ok:
      Vector3.Distance(actualMinimum, expectedMinimum) <= 1e-5 &&
      Vector3.Distance(actualMaximum, expectedMaximum) <= 1e-5,
    detail: `${actualMinimum.toString()}..${actualMaximum.toString()}`
  };
};

const fetchBinary = async (relativeUrl: string) => {
  const response = await fetch(resolveAssetUrl(relativeUrl), {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(
      `検証資産の取得に失敗しました: ${relativeUrl} (${response.status})`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
};

const calculateSha256 = async (data: Uint8Array) => {
  const bytes = Uint8Array.from(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
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
    2 * BLENDER_METERS_TO_WORLD_UNITS
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

const validatePlayerRampTraversal = (
  context: StageSpatialContext,
  label: string,
  startBlender: Vector3,
  endBlender: Vector3
) => {
  const spawnNode = context.markers.requireSingle("player_spawn").node;
  const originalSpawn = spawnNode.getAbsolutePosition().clone();
  const start = blenderPointToBabylon(startBlender);
  const end = blenderPointToBabylon(endBlender);
  const horizontalRoute = end.subtract(start);
  horizontalRoute.y = 0;
  const routeLength = horizontalRoute.length();
  const routeDirection = horizontalRoute.scale(1 / routeLength);
  const previousActiveCamera = scene.activeCamera;
  const testCamera = new FreeCamera(`${label}Camera`, start.clone(), scene);
  let moving = true;
  const input: V2PlayerInput = {
    getMoveAxes: () => ({ moveX: 0, moveZ: moving ? 1 : 0 }),
    isDashPressed: () => true,
    drainPressedActions: () => Object.freeze([]),
    reset: () => undefined,
    dispose: () => undefined
  };

  spawnNode.setAbsolutePosition(start);
  spawnNode.computeWorldMatrix(true);
  let controller: ReturnType<typeof createV2PlayerController> | null = null;
  let maximumProgress = 0;
  let maximumFootY = Number.NEGATIVE_INFINITY;
  let stayedInsideBoundary = true;
  let traversalError: unknown = null;
  try {
    controller = createV2PlayerController({
      scene,
      camera: testCamera,
      stage: context,
      input
    });
    testCamera.setTarget(
      new Vector3(end.x, testCamera.position.y, end.z)
    );
    maximumFootY = controller.getFootPosition().y;
    for (let frame = 0; frame < 240; frame += 1) {
      const playerFrame = controller.update(1 / 60, true);
      const horizontalOffset = playerFrame.footPosition.subtract(start);
      horizontalOffset.y = 0;
      const progress = Vector3.Dot(horizontalOffset, routeDirection);
      maximumProgress = Math.max(maximumProgress, progress);
      maximumFootY = Math.max(maximumFootY, playerFrame.footPosition.y);
      stayedInsideBoundary =
        stayedInsideBoundary && context.boundary.contains(playerFrame.footPosition);
      if (maximumProgress >= routeLength - 0.025) {
        moving = false;
      }
    }
  } catch (error) {
    traversalError = error;
    console.error(`${label} Ramp通過中に例外が発生しました。`, error);
  } finally {
    controller?.dispose();
    testCamera.dispose();
    scene.activeCamera = previousActiveCamera;
    spawnNode.setAbsolutePosition(originalSpawn);
    spawnNode.computeWorldMatrix(true);
  }

  const result = {
    label,
    ok:
      traversalError === null &&
      maximumProgress >= routeLength - 0.025 &&
      maximumFootY >= end.y - 0.005 &&
      stayedInsideBoundary,
    maximumProgress,
    routeLength,
    maximumFootY,
    expectedEndY: end.y,
    stayedInsideBoundary,
    errorMessage:
      traversalError === null ? null : formatError(traversalError)
  };
  return result;
};

const validatePlayerWaypointTraversal = (
  context: StageSpatialContext,
  label: string,
  waypointsBlender: readonly Vector3[],
  expectedHeightRangeBlender: readonly [number, number]
) => {
  if (waypointsBlender.length < 2) {
    throw new Error(`${label}のWaypointが2件未満です。`);
  }
  const spawnNode = context.markers.requireSingle("player_spawn").node;
  const originalSpawn = spawnNode.getAbsolutePosition().clone();
  const waypoints = waypointsBlender.map(blenderPointToBabylon);
  const previousActiveCamera = scene.activeCamera;
  const testCamera = new FreeCamera(`${label}Camera`, waypoints[0].clone(), scene);
  let moving = true;
  const input: V2PlayerInput = {
    getMoveAxes: () => ({ moveX: 0, moveZ: moving ? 1 : 0 }),
    isDashPressed: () => true,
    drainPressedActions: () => Object.freeze([]),
    reset: () => undefined,
    dispose: () => undefined
  };

  spawnNode.setAbsolutePosition(waypoints[0]);
  spawnNode.computeWorldMatrix(true);
  let controller: ReturnType<typeof createV2PlayerController> | null = null;
  let waypointIndex = 1;
  let highestFootY = Number.NEGATIVE_INFINITY;
  let lowestFootY = Number.POSITIVE_INFINITY;
  let stayedInsideBoundary = true;
  let traversalError: unknown = null;
  let finalFoot = waypoints[0].clone();
  try {
    controller = createV2PlayerController({
      scene,
      camera: testCamera,
      stage: context,
      input
    });
    for (let frame = 0; frame < 9000 && waypointIndex < waypoints.length; frame += 1) {
      const target = waypoints[waypointIndex];
      testCamera.setTarget(
        new Vector3(target.x, testCamera.position.y, target.z)
      );
      const playerFrame = controller.update(1 / 60, true);
      finalFoot = playerFrame.footPosition.clone();
      highestFootY = Math.max(highestFootY, finalFoot.y);
      lowestFootY = Math.min(lowestFootY, finalFoot.y);
      stayedInsideBoundary =
        stayedInsideBoundary && context.boundary.contains(finalFoot);
      const horizontalDistance = Math.hypot(
        target.x - finalFoot.x,
        target.z - finalFoot.z
      );
      const verticalDistance = Math.abs(target.y - finalFoot.y);
      if (horizontalDistance <= 0.08 && verticalDistance <= 0.035) {
        waypointIndex += 1;
      }
    }
    moving = false;
    for (let frame = 0; frame < 30; frame += 1) {
      const playerFrame = controller.update(1 / 60, true);
      finalFoot = playerFrame.footPosition.clone();
      stayedInsideBoundary =
        stayedInsideBoundary && context.boundary.contains(finalFoot);
    }
  } catch (error) {
    traversalError = error;
    console.error(`${label} Waypoint通過中に例外が発生しました。`, error);
  } finally {
    controller?.dispose();
    testCamera.dispose();
    scene.activeCamera = previousActiveCamera;
    spawnNode.setAbsolutePosition(originalSpawn);
    spawnNode.computeWorldMatrix(true);
  }

  const finalTarget = waypoints[waypoints.length - 1];
  const expectedMinimumFootY =
    expectedHeightRangeBlender[0] * BLENDER_METERS_TO_WORLD_UNITS;
  const expectedMaximumFootY =
    expectedHeightRangeBlender[1] * BLENDER_METERS_TO_WORLD_UNITS;
  const finalHorizontalError = Math.hypot(
    finalTarget.x - finalFoot.x,
    finalTarget.z - finalFoot.z
  );
  const finalVerticalError = Math.abs(finalTarget.y - finalFoot.y);
  return {
    label,
    ok:
      traversalError === null &&
      waypointIndex === waypoints.length &&
      highestFootY >= expectedMaximumFootY - 0.01 &&
      lowestFootY <= expectedMinimumFootY + 0.02 &&
      finalHorizontalError <= 0.15 &&
      finalVerticalError <= 0.04 &&
      stayedInsideBoundary,
    reachedWaypoints: waypointIndex,
    totalWaypoints: waypoints.length,
    highestFootY,
    lowestFootY,
    finalHorizontalError,
    finalVerticalError,
    stayedInsideBoundary,
    errorMessage: traversalError === null ? null : formatError(traversalError)
  };
};

const validatePlayerBarrierAttempt = (
  context: StageSpatialContext,
  label: string,
  startBlender: Vector3,
  endBlender: Vector3,
  barrierProgressBlender: number,
  minimumFootHeightBlender: number
) => {
  const spawnNode = context.markers.requireSingle("player_spawn").node;
  const originalSpawn = spawnNode.getAbsolutePosition().clone();
  const start = blenderPointToBabylon(startBlender);
  const end = blenderPointToBabylon(endBlender);
  const horizontalRoute = end.subtract(start);
  horizontalRoute.y = 0;
  const routeLength = horizontalRoute.length();
  const routeDirection = horizontalRoute.scale(1 / routeLength);
  const barrierProgress =
    barrierProgressBlender * BLENDER_METERS_TO_WORLD_UNITS;
  const minimumFootHeight =
    minimumFootHeightBlender * BLENDER_METERS_TO_WORLD_UNITS;
  const previousActiveCamera = scene.activeCamera;
  const testCamera = new FreeCamera(`${label}Camera`, start.clone(), scene);
  const input: V2PlayerInput = {
    getMoveAxes: () => ({ moveX: 0, moveZ: 1 }),
    isDashPressed: () => true,
    drainPressedActions: () => Object.freeze([]),
    reset: () => undefined,
    dispose: () => undefined
  };

  spawnNode.setAbsolutePosition(start);
  spawnNode.computeWorldMatrix(true);
  let controller: ReturnType<typeof createV2PlayerController> | null = null;
  let maximumProgress = 0;
  let minimumFootY = Number.POSITIVE_INFINITY;
  let finalFoot = start.clone();
  let stayedInsideBoundary = true;
  let traversalError: unknown = null;
  try {
    controller = createV2PlayerController({
      scene,
      camera: testCamera,
      stage: context,
      input
    });
    testCamera.setTarget(
      new Vector3(end.x, testCamera.position.y, end.z)
    );
    minimumFootY = controller.getFootPosition().y;
    for (let frame = 0; frame < 300; frame += 1) {
      const playerFrame = controller.update(1 / 60, true);
      finalFoot = playerFrame.footPosition.clone();
      const horizontalOffset = finalFoot.subtract(start);
      horizontalOffset.y = 0;
      maximumProgress = Math.max(
        maximumProgress,
        Vector3.Dot(horizontalOffset, routeDirection)
      );
      minimumFootY = Math.min(minimumFootY, finalFoot.y);
      stayedInsideBoundary =
        stayedInsideBoundary && context.boundary.contains(finalFoot);
    }
  } catch (error) {
    traversalError = error;
    console.error(`${label} Barrier突進中に例外が発生しました。`, error);
  } finally {
    controller?.dispose();
    testCamera.dispose();
    scene.activeCamera = previousActiveCamera;
    spawnNode.setAbsolutePosition(originalSpawn);
    spawnNode.computeWorldMatrix(true);
  }

  return {
    label,
    ok:
      traversalError === null &&
      maximumProgress >= barrierProgress * 0.25 &&
      maximumProgress < barrierProgress - 0.005 &&
      minimumFootY >= minimumFootHeight &&
      stayedInsideBoundary,
    maximumProgress,
    barrierProgress,
    minimumFootY,
    minimumFootHeight,
    finalFoot,
    stayedInsideBoundary,
    errorMessage: traversalError === null ? null : formatError(traversalError)
  };
};

const countSceneResources = (): SceneResourceCounts => {
  const sharedBrdfTexture = scene.environmentBRDFTexture;
  return {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.filter((texture) => texture !== sharedBrdfTexture)
      .length,
    transformNodes: scene.transformNodes.length
  };
};

const sceneResourceCountsEqual = (
  left: SceneResourceCounts,
  right: SceneResourceCounts
) =>
  left.meshes === right.meshes &&
  left.materials === right.materials &&
  left.textures === right.textures &&
  left.transformNodes === right.transformNodes;

const captureOwnedResources = (context: StageSpatialContext) => ({
  nodes: [
    ...context.resources.assetContainer.meshes,
    ...context.resources.assetContainer.transformNodes
  ],
  materials: [...context.resources.assetContainer.materials],
  textures: [...context.resources.assetContainer.textures]
});

const inspectDisposedResources = (
  captured: ReturnType<typeof captureOwnedResources>
) => ({
  liveNodes: captured.nodes.filter((node) => !node.isDisposed()),
  liveMaterials: captured.materials.filter((material) =>
    scene.materials.includes(material)
  ),
  liveTextures: captured.textures.filter(
    (texture) =>
      scene.textures.includes(texture) || texture.getInternalTexture() !== null
  )
});

const settleScene = async () => {
  await scene.whenReadyAsync(true);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await scene.whenReadyAsync(true);
};

const validateAssetHashes = async (checks: CheckResult[]) => {
  const [glbData, navmeshData, bitNavmeshData] = await Promise.all([
    fetchBinary(SCHOOL_STAGE.glbUrl),
    fetchBinary(SCHOOL_STAGE.navmeshUrl),
    fetchBinary(SCHOOL_STAGE.bitNavmeshUrl)
  ]);
  const [glbSha256, navmeshSha256, bitNavmeshSha256] = await Promise.all([
    calculateSha256(glbData),
    calculateSha256(navmeshData),
    calculateSha256(bitNavmeshData)
  ]);
  checks.push(
    createCheck(
      "学校GLB SHA-256",
      glbSha256 === SCHOOL_STAGE.glbSha256,
      `catalog=${SCHOOL_STAGE.glbSha256} / actual=${glbSha256}`
    ),
    createCheck(
      "学校NavMesh SHA-256",
      navmeshSha256 === SCHOOL_STAGE.navmeshSha256,
      `catalog=${SCHOOL_STAGE.navmeshSha256} / actual=${navmeshSha256}`
    ),
    createCheck(
      "学校ビット用NavMesh SHA-256",
      bitNavmeshSha256 === SCHOOL_STAGE.bitNavmeshSha256,
      `catalog=${SCHOOL_STAGE.bitNavmeshSha256} / actual=${bitNavmeshSha256}`
    )
  );
};

const validateLoadedContext = (
  context: StageSpatialContext,
  checks: CheckResult[]
) => {
  const playerSpawn = context.markers
    .requireSingle("player_spawn")
    .node.getAbsolutePosition();
  const expectedPlayerSpawn = new Vector3(0.375, 0, 0);
  const npcSpawnVolumes = context.volumes.getByRole("npc_spawn");
  const bitSpawnVolumes = context.volumes.getByRole("bit_spawn");
  const waterVolumes = context.volumes.getByRole("water");
  const bitTransitions = context.bitNavigation.transitions;
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
  const assemblyAnchors = context.markers.getByRole("assembly_anchor");
  const assemblyVolumes = context.volumes.getByRole("assembly");
  const assemblyVenueSummaries = context.assemblyVenues.all.map(
    (venue) =>
      `${venue.id}:${venue.volume.id}/${venue.assemblyPositions.length}/${venue.executionAudiencePositions.length}/${venue.executionTargetPositions.length}/w${venue.selectionWeight}`
  );
  const assemblyVenuesValid =
    context.assemblyVenues.all.length === 2 &&
    assemblyVenueSummaries.join("|") ===
      "assembly-courtyard:assembly-volume-courtyard/100/94/6/w1|assembly-gym:assembly-volume-gym/100/94/6/w1" &&
    context.assemblyVenues.all.every(
      (venue) =>
        venue.anchor.role === "assembly_anchor" &&
        venue.anchor.id === venue.id &&
        venue.volume.role === "assembly" &&
        Vector3.Distance(
          venue.center,
          venue.anchor.node.getAbsolutePosition()
        ) <= 1e-6
    );
  const unsafeBitTransitionSegments: string[] = [];
  for (const transition of bitTransitions) {
    const traversalPoints = [
      transition.fromPosition,
      ...transition.traversalPoints,
      transition.toPosition
    ];
    for (let pointIndex = 0; pointIndex < traversalPoints.length; pointIndex += 1) {
      const point = traversalPoints[pointIndex];
      const pointHit = context.queries.castMovementSphere(
        "bit",
        point,
        point,
        BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
      );
      if (pointHit) {
        unsafeBitTransitionSegments.push(
          `${transition.id}:point${pointIndex}:${pointHit.mesh.name}`
        );
      }
      if (pointIndex === 0) {
        continue;
      }
      const segmentHit = context.queries.castMovementSphere(
        "bit",
        traversalPoints[pointIndex - 1],
        point,
        BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
      );
      if (segmentHit) {
        unsafeBitTransitionSegments.push(
          `${transition.id}:segment${pointIndex - 1}-${pointIndex}:${segmentHit.mesh.name}`
        );
      }
    }
  }

  checks.push(
    createCheck(
      "学校メタデータ契約",
      context.stage === SCHOOL_STAGE &&
        context.metadata.schemaVersion === SCHOOL_STAGE.assetSchemaVersion &&
        context.metadata.stageId === SCHOOL_STAGE.id &&
        context.metadata.navProfileId === SCHOOL_STAGE.navProfileId &&
        context.metadata.bitNavProfileId === SCHOOL_STAGE.bitNavProfileId,
      `stage=${context.metadata.stageId} / schema=${context.metadata.schemaVersion} / navProfile=${context.metadata.navProfileId} / bitNavProfile=${context.metadata.bitNavProfileId}`
    ),
    createCheck(
      "学校GLBの厳格意味分類",
      context.resources.visualMeshes.length === 482 &&
        context.resources.normalColliders.length === 197 &&
        context.resources.actorOnlyColliders.length === 81 &&
        context.resources.humanOnlyColliders.length === 57 &&
        context.resources.navSourceMeshes.length === 19 &&
        context.resources.bitFlightNavSourceMeshes.length === 22 &&
        context.markers.all.length === 3 &&
        assemblyAnchors.length === 2 &&
        context.volumes.all.length === 5 &&
        assemblyVolumes.length === 2 &&
        assemblyVenuesValid &&
        context.links.all.length === 0 &&
        context.bitNavigation.zones.length === 4 &&
        context.bitNavigation.bands.length === 11 &&
        apertureTransitions.length === 57 &&
        verticalTransitions.length === 4 &&
        surfaceRouteTransitions.length === 10 &&
        boundaryTransitions.length === 1 &&
        bitTransitions.every((transition) => transition.bidirectional),
      `VIS=${context.resources.visualMeshes.length} / COL=${context.resources.normalColliders.length} / ActorOnly=${context.resources.actorOnlyColliders.length} / HumanOnly=${context.resources.humanOnlyColliders.length} / humanNAV=${context.resources.navSourceMeshes.length} / bitNAV=${context.resources.bitFlightNavSourceMeshes.length} / MRK=${context.markers.all.length}(assembly=${assemblyAnchors.length}) / VOL=${context.volumes.all.length}(assembly=${assemblyVolumes.length}) / venues=${assemblyVenueSummaries.join("|")} / humanLNK=${context.links.all.length} / zones=${context.bitNavigation.zones.length} / bands=${context.bitNavigation.bands.length} / transitions=${bitTransitions.length}(aperture=${apertureTransitions.length},vertical=${verticalTransitions.length},surface=${surfaceRouteTransitions.length},boundary=${boundaryTransitions.length})`
    ),
    createCheck(
      `全ビット飛行遷移の${BIT_FLIGHT_ENVELOPE_RADIUS_METERS.toFixed(2)}m安全包絡`,
      unsafeBitTransitionSegments.length === 0,
      unsafeBitTransitionSegments.length === 0
        ? `${bitTransitions.length}遷移の全端点・全線分で交差0件`
        : `${unsafeBitTransitionSegments.length}件: ${unsafeBitTransitionSegments.slice(0, 8).join(", ")}`
    ),
    createCheck(
      "3Dスポーン・境界・生成Volume",
      Vector3.Distance(playerSpawn, expectedPlayerSpawn) <= 1e-5 &&
        context.boundary.contains(playerSpawn) &&
        npcSpawnVolumes.length === 1 &&
        bitSpawnVolumes.length === 1 &&
        bitSpawnVolumes[0].bitFlightBand !== null &&
        waterVolumes.length === 1,
      `spawn=(${playerSpawn.x.toFixed(3)}, ${playerSpawn.y.toFixed(3)}, ${playerSpawn.z.toFixed(3)}) / boundary=${context.boundary.contains(playerSpawn)} / npc=${npcSpawnVolumes.length} / bit=${bitSpawnVolumes.length}:${bitSpawnVolumes[0]?.bitFlightBand?.zoneId ?? "帯なし"}/${bitSpawnVolumes[0]?.bitFlightBand?.bandId ?? "帯なし"} / water=${waterVolumes.length}`
    )
  );

  const visualMeshByName = new Map(
    context.resources.visualMeshes.map((mesh) => [mesh.name, mesh])
  );
  const expectedOpenDoorCenters = [
    [
      "VIS_NorthEntryDoor_Open_L",
      blenderPointToBabylon(new Vector3(1.725, 45.66, 1.15))
    ],
    [
      "VIS_NorthEntryDoor_Open_R",
      blenderPointToBabylon(new Vector3(6.075, 45.66, 1.15))
    ],
    [
      "VIS_GymDoor_Open_Courtyard_L",
      blenderPointToBabylon(new Vector3(33.56, 4.35, 1.2))
    ],
    [
      "VIS_GymDoor_Open_Courtyard_R",
      blenderPointToBabylon(new Vector3(33.56, 8.65, 1.2))
    ],
    [
      "VIS_NorthWingDoor_Open_Bridge_L",
      blenderPointToBabylon(new Vector3(38.5, 32.34, 1.2))
    ],
    [
      "VIS_NorthWingDoor_Open_Bridge_R",
      blenderPointToBabylon(new Vector3(44.3, 32.34, 1.2))
    ],
    [
      "VIS_NorthWingSouthEntryDoor_Open_L",
      blenderPointToBabylon(new Vector3(0.2, 31.54, 1.2))
    ],
    [
      "VIS_NorthWingSouthEntryDoor_Open_R",
      blenderPointToBabylon(new Vector3(6.3, 32.34, 1.2))
    ],
    [
      "VIS_GymDoor_Open_Bridge_L",
      blenderPointToBabylon(new Vector3(38.5, 26.66, 1.2))
    ],
    [
      "VIS_GymDoor_Open_Bridge_R",
      blenderPointToBabylon(new Vector3(44.3, 26.66, 1.2))
    ]
  ] as const;
  const openDoorResults = expectedOpenDoorCenters.map(
    ([name, expectedCenter]) => {
      const mesh = visualMeshByName.get(name);
      mesh?.computeWorldMatrix(true);
      const actualCenter = mesh?.getBoundingInfo().boundingBox.centerWorld;
      return {
        name,
        actualCenter,
        ok:
          actualCenter !== undefined &&
          Vector3.Distance(actualCenter, expectedCenter) <= 1e-5
      };
    }
  );
  const toiletDoorsRemoved = [
    "VIS_DoorLeaf_Toilet_M",
    "VIS_DoorLeaf_Toilet_F"
  ].every((name) => !visualMeshByName.has(name));
  checks.push(
    createCheck(
      "常時開放扉とトイレ開口の表示契約",
      toiletDoorsRemoved && openDoorResults.every((result) => result.ok),
      `トイレ扉削除=${toiletDoorsRemoved} / ${openDoorResults
        .map(
          (result) =>
            `${result.name}=${result.actualCenter?.toString() ?? "なし"}`
        )
        .join(" / ")}`
    )
  );

  const entryMeshByName = new Map(
    [
      ...context.resources.visualMeshes,
      ...context.resources.normalColliders
    ].map((mesh) => [mesh.name, mesh])
  );
  const entryBoundsExpectations = [
    ["VIS_EntryStep01", [1.0, -2.5, -0.3], [2.0, 2.5, -0.15]],
    ["VIS_EntryStep02", [0.0, -2.5, -0.15], [1.0, 2.5, 0.0]],
    ["COL_EntryRamp", [0.0, -2.5, -0.3], [2.0, 2.5, 0.0]],
    ["VIS_NorthEntryStep01", [2.4, 46.5, -0.3], [5.4, 47.5, -0.15]],
    ["VIS_NorthEntryStep02", [2.4, 45.5, -0.15], [5.4, 46.5, 0.0]],
    ["COL_NorthEntryRamp", [2.4, 45.5, -0.3], [5.4, 47.5, 0.0]],
    ["VIS_NorthWingSouthEntryStep01", [0.15, 30.5, -0.3], [5.4, 31.5, -0.15]],
    ["VIS_NorthWingSouthEntryStep02", [0.15, 31.5, -0.15], [5.4, 32.5, 0.0]],
    ["COL_NorthWingSouthEntryRamp", [0.15, 30.5, -0.3], [5.4, 32.5, 0.0]],
    ["VIS_NorthWingSouthEntryDoor_Open_L", [0.16, 30.74, 0.0], [0.24, 32.34, 2.4]],
    ["COL_BridgeSideRamp_West", [37.4, 26.5, -0.3], [39.4, 32.5, 0.0]],
    ["COL_BridgeSideRamp_East", [43.4, 26.5, -0.3], [45.4, 32.5, 0.0]],
    ["VIS_GymCourtyardEntryStep01", [31.4, 5.0, -0.3], [32.4, 8.0, -0.15]],
    ["VIS_GymCourtyardEntryStep02", [32.4, 5.0, -0.15], [33.4, 8.0, 0.0]],
    ["COL_GymCourtyardEntryRamp", [31.4, 5.0, -0.3], [33.4, 8.0, 0.0]]
  ] as const;
  const entryBoundsResults = entryBoundsExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        entryMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const bridgeSideRampsAreInvisible = [
    "VIS_NorthSouthEntryStep01",
    "VIS_NorthSouthEntryStep02",
    "VIS_BridgeSideRamp_West",
    "VIS_BridgeSideRamp_East"
  ].every((name) => !visualMeshByName.has(name));
  checks.push(
    createCheck(
      "学校出入口の共通2段・渡り廊下透明Ramp契約",
      entryBoundsResults.every((result) => result.ok) && bridgeSideRampsAreInvisible,
      `渡り廊下側面VISなし=${bridgeSideRampsAreInvisible} / ${entryBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")}`
    )
  );

  const playerRampTraversalResults = [
    validatePlayerRampTraversal(
      context,
      "北側校舎南口",
      new Vector3(2.7, 30.0, -0.3),
      new Vector3(2.7, 33.2, 0.0)
    ),
    validatePlayerRampTraversal(
      context,
      "渡り廊下西側",
      new Vector3(36.8, 29.5, -0.3),
      new Vector3(40.0, 29.5, 0.0)
    ),
    validatePlayerRampTraversal(
      context,
      "渡り廊下東側",
      new Vector3(46.0, 29.5, -0.3),
      new Vector3(42.8, 29.5, 0.0)
    )
  ];
  checks.push(
    createCheck(
      "実プレイヤーによる北側校舎南口・渡り廊下東西Ramp通過",
      playerRampTraversalResults.every((result) => result.ok),
      playerRampTraversalResults
        .map(
          (result) =>
            `${result.label}=` +
            `進行${result.maximumProgress.toFixed(3)}/${result.routeLength.toFixed(3)},` +
            `最高足元Y${result.maximumFootY.toFixed(3)}/${result.expectedEndY.toFixed(3)},` +
            `境界内=${result.stayedInsideBoundary},` +
            `エラー=${result.errorMessage ?? "なし"}`
        )
        .join(" / ")
    )
  );

  const schoolMeshByName = new Map(
    [
      ...context.resources.visualMeshes,
      ...context.resources.normalColliders
    ].map((mesh) => [mesh.name, mesh])
  );
  const makeRoundTripWaypoints = (waypoints: readonly Vector3[]) => [
    ...waypoints,
    ...waypoints.slice(0, -1).reverse()
  ];
  const westGymGalleryStairWaypoints = [
    new Vector3(38.0, -1.4, 0.0),
    new Vector3(38.0, -2.6, 0.0),
    new Vector3(35.7, -2.6, 0.15),
    new Vector3(35.4, -3.8, 0.15),
    new Vector3(35.4, -10.2, 2.55),
    new Vector3(35.4, -10.75, 2.55),
    new Vector3(34.2, -10.75, 2.55),
    new Vector3(34.2, -10.2, 2.55),
    new Vector3(34.2, -3.0, 5.25),
    new Vector3(34.2, -1.6, 5.25)
  ];
  const eastGymGalleryStairWaypoints = [
    new Vector3(54.8, -1.4, 0.0),
    new Vector3(54.8, -2.6, 0.0),
    new Vector3(57.1, -2.6, 0.15),
    new Vector3(57.4, -3.8, 0.15),
    new Vector3(57.4, -10.2, 2.55),
    new Vector3(57.4, -10.75, 2.55),
    new Vector3(58.6, -10.75, 2.55),
    new Vector3(58.6, -10.2, 2.55),
    new Vector3(58.6, -3.0, 5.25),
    new Vector3(58.6, -1.6, 5.25)
  ];
  const gymGalleryStairRoundTrips = [
    validatePlayerWaypointTraversal(
      context,
      "体育館西側固定開放口・U字袖階段往復",
      makeRoundTripWaypoints(westGymGalleryStairWaypoints),
      [0.0, 5.25]
    ),
    validatePlayerWaypointTraversal(
      context,
      "体育館東側固定開放口・U字袖階段往復",
      makeRoundTripWaypoints(eastGymGalleryStairWaypoints),
      [0.0, 5.25]
    )
  ];
  checks.push(
    createCheck(
      "実プレイヤーによる体育館東西固定開放口・U字袖階段往復",
      gymGalleryStairRoundTrips.every((result) => result.ok),
      gymGalleryStairRoundTrips
        .map(
          (result) =>
            `${result.label}:Waypoint=${result.reachedWaypoints}/${result.totalWaypoints},` +
            `最高足元Y=${result.highestFootY.toFixed(3)},` +
            `最低足元Y=${result.lowestFootY.toFixed(3)},` +
            `最終水平誤差=${result.finalHorizontalError.toFixed(3)},` +
            `最終垂直誤差=${result.finalVerticalError.toFixed(3)},` +
            `境界内=${result.stayedInsideBoundary},` +
            `エラー=${result.errorMessage ?? "なし"}`
        )
        .join(" / ")
    )
  );
  const gymSouthPassageRoundTrip = validatePlayerWaypointTraversal(
    context,
    "体育館南壁・南塀間通路往復",
    makeRoundTripWaypoints([
      new Vector3(34.2, -13.2, -0.3),
      new Vector3(46.4, -13.2, -0.3),
      new Vector3(58.6, -13.2, -0.3)
    ]),
    [-0.3, -0.3]
  );
  checks.push(
    createCheck(
      "南塀2m移設後の体育館南側通路を実プレイヤーで往復",
      gymSouthPassageRoundTrip.ok,
      `Waypoint=${gymSouthPassageRoundTrip.reachedWaypoints}/` +
        `${gymSouthPassageRoundTrip.totalWaypoints},` +
        `最終水平誤差=${gymSouthPassageRoundTrip.finalHorizontalError.toFixed(3)},` +
        `最終垂直誤差=${gymSouthPassageRoundTrip.finalVerticalError.toFixed(3)},` +
        `境界内=${gymSouthPassageRoundTrip.stayedInsideBoundary},` +
        `エラー=${gymSouthPassageRoundTrip.errorMessage ?? "なし"}`
    )
  );

  const westGymGalleryNorthRampWaypoints = [
    new Vector3(40.0, 25.8, 3.6),
    new Vector3(39.0, 25.8, 3.6),
    new Vector3(37.45, 25.8, 4.425),
    new Vector3(35.8, 25.8, 5.25),
    new Vector3(34.5, 25.8, 5.25)
  ];
  const eastGymGalleryNorthRampWaypoints = [
    new Vector3(42.8, 25.8, 3.6),
    new Vector3(43.8, 25.8, 3.6),
    new Vector3(45.35, 25.8, 4.425),
    new Vector3(47.0, 25.8, 5.25),
    new Vector3(47.4, 25.8, 5.25)
  ];
  const gymGalleryNorthRampRoundTrips = [
    validatePlayerWaypointTraversal(
      context,
      "体育館北西11段Ramp往復",
      makeRoundTripWaypoints(westGymGalleryNorthRampWaypoints),
      [3.6, 5.25]
    ),
    validatePlayerWaypointTraversal(
      context,
      "体育館北東11段Ramp往復",
      makeRoundTripWaypoints(eastGymGalleryNorthRampWaypoints),
      [3.6, 5.25]
    )
  ];
  checks.push(
    createCheck(
      "実プレイヤーによる体育館北側東西11段Ramp往復",
      gymGalleryNorthRampRoundTrips.every((result) => result.ok),
      gymGalleryNorthRampRoundTrips
        .map(
          (result) =>
            `${result.label}:Waypoint=${result.reachedWaypoints}/${result.totalWaypoints},` +
            `最高足元Y=${result.highestFootY.toFixed(3)},` +
            `最低足元Y=${result.lowestFootY.toFixed(3)},` +
            `最終水平誤差=${result.finalHorizontalError.toFixed(3)},` +
            `最終垂直誤差=${result.finalVerticalError.toFixed(3)},` +
            `境界内=${result.stayedInsideBoundary},` +
            `エラー=${result.errorMessage ?? "なし"}`
        )
        .join(" / ")
    )
  );

  const westGymStageRampWaypoints = [
    new Vector3(39.6, -9.8, 0.0),
    new Vector3(39.9, -9.8, 0.0),
    new Vector3(40.65, -9.8, 0.5),
    new Vector3(41.4, -9.8, 1.0),
    new Vector3(41.8, -9.8, 1.0)
  ];
  const eastGymStageRampWaypoints = [
    new Vector3(53.2, -9.8, 0.0),
    new Vector3(52.9, -9.8, 0.0),
    new Vector3(52.15, -9.8, 0.5),
    new Vector3(51.4, -9.8, 1.0),
    new Vector3(51.0, -9.8, 1.0)
  ];
  const gymStageRampRoundTrips = [
    validatePlayerWaypointTraversal(
      context,
      "体育館舞台西Ramp往復",
      makeRoundTripWaypoints(westGymStageRampWaypoints),
      [0.0, 1.0]
    ),
    validatePlayerWaypointTraversal(
      context,
      "体育館舞台東Ramp往復",
      makeRoundTripWaypoints(eastGymStageRampWaypoints),
      [0.0, 1.0]
    )
  ];
  checks.push(
    createCheck(
      "実プレイヤーによる体育館舞台東西Ramp往復",
      gymStageRampRoundTrips.every((result) => result.ok),
      gymStageRampRoundTrips
        .map(
          (result) =>
            `${result.label}:Waypoint=${result.reachedWaypoints}/${result.totalWaypoints},` +
            `最高足元Y=${result.highestFootY.toFixed(3)},` +
            `最低足元Y=${result.lowestFootY.toFixed(3)},` +
            `最終水平誤差=${result.finalHorizontalError.toFixed(3)},` +
            `最終垂直誤差=${result.finalVerticalError.toFixed(3)},` +
            `境界内=${result.stayedInsideBoundary},` +
            `エラー=${result.errorMessage ?? "なし"}`
        )
        .join(" / ")
    )
  );

  const gymGalleryCentralGuardAttempt = validatePlayerBarrierAttempt(
    context,
    "体育館北側中央低床手すり突進",
    new Vector3(41.4, 25.8, 3.6),
    new Vector3(41.4, 24.0, 3.6),
    0.8,
    3.55
  );
  const gymGalleryCentralGuardHit = context.queries.castMovementSegment(
    "player",
    blenderPointToBabylon(new Vector3(41.4, 25.8, 4.15)),
    blenderPointToBabylon(new Vector3(41.4, 24.0, 4.15))
  );
  checks.push(
    createCheck(
      "体育館北側中央低床手すりの実Collider転落防止",
      gymGalleryCentralGuardAttempt.ok &&
        gymGalleryCentralGuardHit?.mesh.name ===
          "COL_B03_GymGalleryGuards",
      `hit=${gymGalleryCentralGuardHit?.mesh.name ?? "clear"} / ` +
        `実Player進行=${gymGalleryCentralGuardAttempt.maximumProgress.toFixed(4)}/` +
        `${gymGalleryCentralGuardAttempt.barrierProgress.toFixed(4)} / ` +
        `最低足元Y=${gymGalleryCentralGuardAttempt.minimumFootY.toFixed(4)}/` +
        `${gymGalleryCentralGuardAttempt.minimumFootHeight.toFixed(4)} / ` +
        `境界内=${gymGalleryCentralGuardAttempt.stayedInsideBoundary} / ` +
        `エラー=${gymGalleryCentralGuardAttempt.errorMessage ?? "なし"}`
    )
  );
  const gymGalleryRearGuardResults = [
    {
      label: "西",
      from: new Vector3(35.4, -2.6, 0.7),
      to: new Vector3(33.9, -2.6, 0.7)
    },
    {
      label: "東",
      from: new Vector3(57.4, -2.6, 0.7),
      to: new Vector3(58.9, -2.6, 0.7)
    }
  ].map(({ label, from, to }) => {
    const fromWorld = blenderPointToBabylon(from);
    const toWorld = blenderPointToBabylon(to);
    return {
      label,
      player: context.queries.castMovementSegment("player", fromWorld, toWorld),
      npc: context.queries.castMovementSegment("npc", fromWorld, toWorld)
    };
  });
  checks.push(
    createCheck(
      "体育館左右袖階段の奥側手すりを壁際まで閉鎖",
      gymGalleryRearGuardResults.every(
        (result) =>
          result.player?.mesh.name === "COL_B03_GymGalleryGuards" &&
          result.npc?.mesh.name === "COL_B03_GymGalleryGuards"
      ),
      gymGalleryRearGuardResults
        .map(
          (result) =>
            `${result.label}:player=${result.player?.mesh.name ?? "clear"},` +
            `npc=${result.npc?.mesh.name ?? "clear"}`
        )
        .join(" / ")
    )
  );
  const gymGalleryCentralGuardGapFrom = blenderPointToBabylon(
    new Vector3(41.4, 25.8, 4.4)
  );
  const gymGalleryCentralGuardGapTo = blenderPointToBabylon(
    new Vector3(41.4, 24.0, 4.4)
  );
  const gymGalleryCentralGuardGapBeam =
    context.queries.castBeamSegment(
      gymGalleryCentralGuardGapFrom,
      gymGalleryCentralGuardGapTo
    );
  const gymGalleryCentralGuardGapSight =
    context.queries.castSightSegment(
      gymGalleryCentralGuardGapFrom,
      gymGalleryCentralGuardGapTo
    );
  checks.push(
    createCheck(
      "体育館手すりの上下横桟間はビーム・視線を不可視壁で塞がない",
      gymGalleryCentralGuardGapBeam === null &&
        gymGalleryCentralGuardGapSight === null,
      `beam=${gymGalleryCentralGuardGapBeam?.mesh.name ?? "clear"} / ` +
        `sight=${gymGalleryCentralGuardGapSight?.mesh.name ?? "clear"}`
    )
  );

  const schoolSideGymPortalResults = [
    {
      floor: "2F",
      from: new Vector3(41.4, 33.2, 4.6),
      to: new Vector3(41.4, 32.0, 4.6)
    },
    {
      floor: "3F",
      from: new Vector3(41.4, 33.2, 8.2),
      to: new Vector3(41.4, 32.0, 8.2)
    }
  ].map(({ floor, from, to }) => {
    const fromBabylon = blenderPointToBabylon(from);
    const toBabylon = blenderPointToBabylon(to);
    return {
      floor,
      player: context.queries.castMovementSegment(
        "player",
        fromBabylon,
        toBabylon
      ),
      npc: context.queries.castMovementSegment(
        "npc",
        fromBabylon,
        toBabylon
      )
    };
  });
  checks.push(
    createCheck(
      "2F・3F学校側portalの窓Collider無衝突",
      schoolSideGymPortalResults.every(
        (result) => result.player === null && result.npc === null
      ),
      schoolSideGymPortalResults
        .map(
          (result) =>
            `${result.floor}:player=${result.player?.mesh.name ?? "clear"},` +
            `npc=${result.npc?.mesh.name ?? "clear"}`
        )
        .join(" / ")
    )
  );

  const specialRoomBoundsExpectations = [
    ["VIS_Floor_SpecialRoom_West", [-12.6, 12.5, 0.0], [-3.5, 32.5, 0.03]],
    ["VIS_Floor_SpecialRoom01", [5.4, 36.5, 0.0], [23.4, 45.5, 0.03]],
    ["VIS_Floor_SpecialRoom02", [23.4, 36.5, 0.0], [41.4, 45.5, 0.03]]
  ] as const;
  const specialRoomBoundsResults = specialRoomBoundsExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        schoolMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const removedMergeObjects = [
    "VIS_Wall_ClassroomCross_3",
    "COL_Wall_ClassroomCross_3",
    "VIS_Floor_Classroom03"
  ];
  const castPlayerMovementSegment = (from: Vector3, to: Vector3) =>
    context.queries.castMovementSegment("player", from, to);
  const mergeLineHit = castPlayerMovementSegment(
    blenderPointToBabylon(new Vector3(-8.05, 17.5, 1.0)),
    blenderPointToBabylon(new Vector3(-8.05, 27.5, 1.0))
  );
  const southDividerHit = castPlayerMovementSegment(
    blenderPointToBabylon(new Vector3(-8.05, 11.5, 1.0)),
    blenderPointToBabylon(new Vector3(-8.05, 13.5, 1.0))
  );
  const northSpecialDividerHit = castPlayerMovementSegment(
    blenderPointToBabylon(new Vector3(22.5, 39.0, 1.0)),
    blenderPointToBabylon(new Vector3(24.3, 39.0, 1.0))
  );
  const mergedWestRoomsOnly =
    removedMergeObjects.every((name) => !schoolMeshByName.has(name)) &&
    mergeLineHit === null &&
    southDividerHit?.mesh.name === "COL_Wall_ClassroomCross_2" &&
    northSpecialDividerHit?.mesh.name === "COL_Wall_Special_Divider" &&
    specialRoomBoundsResults.every((result) => result.ok);
  checks.push(
    createCheck(
      "1階西側2教室だけを特別教室へ統合",
      mergedWestRoomsOnly,
      `削除=${removedMergeObjects
        .map((name) => `${name}:${!schoolMeshByName.has(name)}`)
        .join(",")} / 統合室中央=${mergeLineHit?.mesh.name ?? "clear"} / 南境界=${southDividerHit?.mesh.name ?? "なし"} / 北側既存境界=${northSpecialDividerHit?.mesh.name ?? "なし"} / ${specialRoomBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")}`
    )
  );

  const upperToiletPassageWallResults = [
    ["3F", 7.2, "COL_B03_InteriorWalls_F03"],
    ["4F", 10.8, "COL_B03_InteriorWalls_F04"]
  ].map(([floor, baseZ, expectedName]) => {
    const from = blenderPointToBabylon(
      new Vector3(5.0, 40.0, (baseZ as number) + 1.0)
    );
    const to = blenderPointToBabylon(
      new Vector3(5.8, 40.0, (baseZ as number) + 1.0)
    );
    return {
      floor,
      expectedName,
      player: context.queries.castMovementSegment("player", from, to),
      npc: context.queries.castMovementSegment("npc", from, to),
      beam: context.queries.castBeamSegment(from, to),
      sight: context.queries.castSightSegment(from, to)
    };
  });
  checks.push(
    createCheck(
      "3・4階トイレ側通路と特別教室の境界壁",
      upperToiletPassageWallResults.every((result) =>
        [result.player, result.npc, result.beam, result.sight].every(
          (hit) => hit?.mesh.name === result.expectedName
        )
      ),
      upperToiletPassageWallResults
        .map(
          (result) =>
            `${result.floor}:player=${result.player?.mesh.name ?? "clear"},` +
            `npc=${result.npc?.mesh.name ?? "clear"},` +
            `beam=${result.beam?.mesh.name ?? "clear"},` +
            `sight=${result.sight?.mesh.name ?? "clear"}`
        )
        .join(" / ")
    )
  );

  const perimeterColliderExpectations = [
    ["COL_Gate_MainClosed", [19.4, -14.625, -0.3], [25.4, -14.375, 1.7]],
    ["COL_Gate_UtilityClosed", [63.275, 44.5, -0.3], [63.525, 50.5, 1.7]],
    ["COL_Perimeter_East", [63.2, -14.5, -0.3], [63.6, 44.5, 1.7]],
    ["COL_Perimeter_EastNorth", [63.2, 50.5, -0.3], [63.6, 51.5, 1.7]],
    ["COL_Perimeter_NorthEast", [22.4, 51.3, -0.3], [63.4, 51.7, 1.7]],
    ["COL_Perimeter_NorthWest", [-18.6, 51.3, -0.3], [22.4, 51.7, 1.7]],
    ["COL_Perimeter_SouthEast", [25.4, -14.7, -0.3], [63.4, -14.3, 1.7]],
    ["COL_Perimeter_SouthWest", [-18.6, -14.7, -0.3], [19.4, -14.3, 1.7]],
    ["COL_Perimeter_West", [-18.8, -14.5, -0.3], [-18.4, 51.5, 1.7]],
    ["COL_SiteGround", [-18.6, -14.5, -0.6], [63.4, 51.5, -0.3]]
  ] as const;
  const perimeterColliderBoundsResults = perimeterColliderExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        schoolMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const perimeterBlockingSegments = [
    ["COL_Gate_MainClosed", [22.4, -15.0, 1.0], [22.4, -14.0, 1.0]],
    ["COL_Gate_UtilityClosed", [62.9, 47.5, 1.0], [63.9, 47.5, 1.0]],
    ["COL_Perimeter_East", [62.9, 16.0, 1.0], [63.9, 16.0, 1.0]],
    ["COL_Perimeter_EastNorth", [62.9, 51.0, 1.0], [63.9, 51.0, 1.0]],
    ["COL_Perimeter_NorthEast", [42.0, 50.9, 1.0], [42.0, 52.1, 1.0]],
    ["COL_Perimeter_NorthWest", [0.0, 50.9, 1.0], [0.0, 52.1, 1.0]],
    ["COL_Perimeter_SouthEast", [45.0, -15.1, 1.0], [45.0, -13.9, 1.0]],
    ["COL_Perimeter_SouthWest", [0.0, -15.1, 1.0], [0.0, -13.9, 1.0]],
    ["COL_Perimeter_West", [-19.2, 20.0, 1.0], [-18.0, 20.0, 1.0]]
  ] as const;
  const perimeterBlockingResults = perimeterBlockingSegments.map(
    ([expectedName, fromBlender, toBlender]) => {
      const from = blenderPointToBabylon(Vector3.FromArray(fromBlender));
      const to = blenderPointToBabylon(Vector3.FromArray(toBlender));
      return {
        expectedName,
        player: context.queries.castMovementSegment("player", from, to),
        npc: context.queries.castMovementSegment("npc", from, to),
        beam: context.queries.castBeamSegment(from, to),
        sight: context.queries.castSightSegment(from, to)
      };
    }
  );
  checks.push(
    createCheck(
      "閉鎖校門2件・外周塀7件のCollider不変",
      perimeterColliderBoundsResults.every((result) => result.ok) &&
        perimeterBlockingResults.every((result) =>
          [result.player, result.npc, result.beam, result.sight].every(
            (hit) => hit?.mesh.name === result.expectedName
          )
        ),
      `AABB=${perimeterColliderBoundsResults
        .map((result) => `${result.name}:${result.ok ? "一致" : result.detail}`)
        .join(",")} / 遮断=${perimeterBlockingResults
        .map(
          (result) =>
            `${result.expectedName}:` +
            [result.player, result.npc, result.beam, result.sight]
              .map((hit) => hit?.mesh.name ?? "clear")
              .join(",")
        )
        .join(" / ")}`
    )
  );

  const westSpecialRoomBoundsExpectations = [
    ["VIS_Wall_Lintel_SpecialRoomWest_Front", [-3.65, 13.1, 2.3], [-3.35, 14.3, 3.0]],
    ["COL_Wall_Lintel_SpecialRoomWest_Front", [-3.65, 13.1, 2.3], [-3.35, 14.3, 3.0]],
    ["VIS_Wall_SpecialRoomWest_CorridorClosed_South", [-3.65, 20.7, 0.0], [-3.35, 21.9, 3.0]],
    ["COL_Wall_SpecialRoomWest_CorridorClosed_South", [-3.65, 20.7, 0.0], [-3.35, 21.9, 3.0]],
    ["VIS_Wall_SpecialRoomWest_CorridorClosed_North", [-3.65, 23.1, 0.0], [-3.35, 24.3, 3.0]],
    ["COL_Wall_SpecialRoomWest_CorridorClosed_North", [-3.65, 23.1, 0.0], [-3.35, 24.3, 3.0]],
    ["VIS_Wall_Lintel_SpecialRoomWest_Rear", [-3.65, 30.7, 2.3], [-3.35, 31.9, 3.0]],
    ["COL_Wall_Lintel_SpecialRoomWest_Rear", [-3.65, 30.7, 2.3], [-3.35, 31.9, 3.0]],
    ["VIS_DoorLeaf_SpecialRoomWest_Front", [-3.71, 14.35, 0.0], [-3.61, 15.45, 2.3]],
    ["VIS_DoorLeaf_SpecialRoomWest_Rear", [-3.71, 29.55, 0.0], [-3.61, 30.65, 2.3]]
  ] as const;
  const westSpecialRoomBoundsResults = westSpecialRoomBoundsExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        schoolMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const retiredWestSpecialRoomObjects = [
    "VIS_DoorLeaf_Classroom2_Front",
    "VIS_DoorLeaf_Classroom2_Rear",
    "VIS_DoorLeaf_Classroom3_Front",
    "VIS_DoorLeaf_Classroom3_Rear",
    "VIS_Wall_Lintel_ClassroomDoor_03",
    "COL_Wall_Lintel_ClassroomDoor_03",
    "VIS_Wall_Lintel_ClassroomDoor_04",
    "COL_Wall_Lintel_ClassroomDoor_04",
    "VIS_Wall_Lintel_ClassroomDoor_05",
    "COL_Wall_Lintel_ClassroomDoor_05",
    "VIS_Wall_Lintel_ClassroomDoor_06",
    "COL_Wall_Lintel_ClassroomDoor_06"
  ];
  const castWestSpecialRoomOpening = (
    castSegment: StageSpatialContext["queries"]["castBeamSegment"],
    y: number
  ) =>
    castSegment(
      blenderPointToBabylon(new Vector3(-3.2, y, 1.0)),
      blenderPointToBabylon(new Vector3(-3.8, y, 1.0))
    );
  const westSpecialRoomDoorwayResults = [13.7, 31.3].map((y) => ({
    y,
    actor: castWestSpecialRoomOpening(castPlayerMovementSegment, y),
    beam: castWestSpecialRoomOpening(context.queries.castBeamSegment, y),
    sight: castWestSpecialRoomOpening(context.queries.castSightSegment, y)
  }));
  const westSpecialRoomClosedWallResults = [
    [21.3, "COL_Wall_SpecialRoomWest_CorridorClosed_South"],
    [23.7, "COL_Wall_SpecialRoomWest_CorridorClosed_North"]
  ].map(([y, expectedName]) => ({
    y,
    expectedName,
    actor: castWestSpecialRoomOpening(castPlayerMovementSegment, y as number),
    beam: castWestSpecialRoomOpening(context.queries.castBeamSegment, y as number),
    sight: castWestSpecialRoomOpening(context.queries.castSightSegment, y as number)
  }));
  checks.push(
    createCheck(
      "西側特別教室は前後2扉だけを開口",
      westSpecialRoomBoundsResults.every((result) => result.ok) &&
        retiredWestSpecialRoomObjects.every((name) => !schoolMeshByName.has(name)) &&
        westSpecialRoomDoorwayResults.every(
          (result) =>
            result.actor === null &&
            result.beam === null &&
            result.sight === null
        ) &&
        westSpecialRoomClosedWallResults.every(
          (result) =>
            result.actor?.mesh.name === result.expectedName &&
            result.beam?.mesh.name === result.expectedName &&
            result.sight?.mesh.name === result.expectedName
        ),
      `${westSpecialRoomBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")} / 旧Object削除=${retiredWestSpecialRoomObjects.every((name) => !schoolMeshByName.has(name))} / 開口=${westSpecialRoomDoorwayResults
        .map((result) => `${result.y}:actor=${result.actor?.mesh.name ?? "clear"},beam=${result.beam?.mesh.name ?? "clear"},sight=${result.sight?.mesh.name ?? "clear"}`)
        .join(" / ")} / 壁=${westSpecialRoomClosedWallResults
        .map((result) => `${result.y}:actor=${result.actor?.mesh.name ?? "なし"},beam=${result.beam?.mesh.name ?? "なし"},sight=${result.sight?.mesh.name ?? "なし"}`)
        .join(" / ")}`
    )
  );

  const fourFloorBoundsExpectations = [
    ["VIS_B03_Floor_F04", [-12.6, -7.0, 10.65], [47.4, 45.5, 10.8]],
    ["COL_B03_Floor_F04", [-12.6, -7.0, 10.65], [47.4, 45.5, 10.8]],
    ["VIS_Roof_North", [-12.6, 32.5, 14.4], [47.4, 45.5, 14.5]],
    ["COL_RooftopStairExitRamp", [-9.0, 38.9, 14.3], [-6.9, 40.7, 14.5]],
    ["VIS_RooftopFacilityWalls", [-12.6, 38.5, 14.5], [2.4, 45.5, 16.9]],
    ["VIS_RooftopFacilityRoofs", [-12.6, 38.5, 16.9], [2.4, 45.5, 17.0]],
    ["COL_RooftopFacilityShell", [-12.6, 38.5, 14.5], [2.4, 45.5, 17.0]],
    ["VIS_DoorLeaf_RooftopStairHouse_Open", [-9.04, 37.0, 14.5], [-8.96, 38.9, 16.7]],
    ["VIS_Floor_RooftopChangingRoom_M", [-6.6, 38.5, 14.5], [-2.1, 45.5, 14.53]],
    ["VIS_Floor_RooftopChangingRoom_F", [-2.1, 38.5, 14.5], [2.4, 45.5, 14.53]],
    ["BND_Stage", [-18.4, -14.3, -0.5], [63.2, 51.3, 19.0]]
  ] as const;
  const fourFloorBoundsResults = fourFloorBoundsExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        name === "BND_Stage"
          ? context.boundary.mesh
          : schoolMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const fourthFloorWindowCount = context.resources.visualMeshes.filter(
    (mesh) => mesh.name.startsWith("VIS_WindowFrame_F04_")
  ).length;
  const rooftopFoot = blenderPointToBabylon(
    new Vector3(-7.8, 37.8, 14.5)
  );
  const rooftopMaximumEye = rooftopFoot.add(
    new Vector3(
      0,
      V2_PLAYER_BASE_EYE_HEIGHT * V2_PLAYER_MAX_EYE_HEIGHT_SCALE,
      0
    )
  );
  checks.push(
    createCheck(
      "4階校舎・屋上階段室・更衣室・境界の3D契約",
      fourFloorBoundsResults.every((result) => result.ok) &&
        fourthFloorWindowCount === 18 &&
        context.boundary.contains(rooftopFoot) &&
        context.boundary.contains(rooftopMaximumEye),
      `4F窓=${fourthFloorWindowCount} / 屋上足元境界内=${context.boundary.contains(rooftopFoot)} / 最大視点境界内=${context.boundary.contains(rooftopMaximumEye)} / ${fourFloorBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")}`
    )
  );

  const roofGuardNorthStartX = 2.4;
  const roofGuardNorthEndX = 47.3;
  const roofGuardNorthY = 45.4;
  const roofGuardPostCount = Math.ceil(
    (roofGuardNorthEndX - roofGuardNorthStartX) / 1.1
  );
  const roofGuardPostSpacing =
    (roofGuardNorthEndX - roofGuardNorthStartX) / roofGuardPostCount;
  const roofGuardGapX =
    roofGuardNorthStartX + roofGuardPostSpacing * 6.5;
  const roofGuardPostX =
    roofGuardNorthStartX + roofGuardPostSpacing * 7;
  const castRoofGuardSegment = (
    x: number,
    z: number,
    castSegment: StageSpatialContext["queries"]["castBeamSegment"]
  ) =>
    castSegment(
      blenderPointToBabylon(new Vector3(x, roofGuardNorthY - 0.4, z)),
      blenderPointToBabylon(new Vector3(x, roofGuardNorthY + 0.4, z))
    );
  const roofGuardGapResults = {
    actor: castRoofGuardSegment(roofGuardGapX, 15.3, castPlayerMovementSegment),
    beam: castRoofGuardSegment(
      roofGuardGapX,
      15.3,
      context.queries.castBeamSegment
    ),
    sight: castRoofGuardSegment(
      roofGuardGapX,
      15.3,
      context.queries.castSightSegment
    )
  };
  const roofGuardLowerRailResults = {
    actor: castRoofGuardSegment(
      roofGuardGapX,
      15.05,
      castPlayerMovementSegment
    ),
    beam: castRoofGuardSegment(
      roofGuardGapX,
      15.05,
      context.queries.castBeamSegment
    ),
    sight: castRoofGuardSegment(
      roofGuardGapX,
      15.05,
      context.queries.castSightSegment
    )
  };
  const roofGuardPostResults = {
    actor: castRoofGuardSegment(
      roofGuardPostX,
      15.3,
      castPlayerMovementSegment
    ),
    beam: castRoofGuardSegment(
      roofGuardPostX,
      15.3,
      context.queries.castBeamSegment
    ),
    sight: castRoofGuardSegment(
      roofGuardPostX,
      15.3,
      context.queries.castSightSegment
    )
  };
  const roofGuardPlayerAttempt = validatePlayerBarrierAttempt(
    context,
    "屋上NorthOuter外向き突進",
    new Vector3(roofGuardGapX, 44.5, 14.5),
    new Vector3(roofGuardGapX, 46.5, 14.5),
    roofGuardNorthY - 44.5,
    14.4
  );
  const expectedRoofGuardName = "COL_RoofGuard_NorthOuter";
  checks.push(
    createCheck(
      "屋上NorthOuter柵の実形状・光線・転落防止",
      schoolMeshByName.has(expectedRoofGuardName) &&
        Object.values(roofGuardGapResults).every((result) => result === null) &&
        Object.values(roofGuardLowerRailResults).every(
          (result) => result?.mesh.name === expectedRoofGuardName
        ) &&
        Object.values(roofGuardPostResults).every(
          (result) => result?.mesh.name === expectedRoofGuardName
        ) &&
        roofGuardPlayerAttempt.ok,
      `支柱数=${roofGuardPostCount} / 間隔=${roofGuardPostSpacing.toFixed(6)} / 隙間x=${roofGuardGapX.toFixed(6)}:${Object.values(roofGuardGapResults)
        .map((result) => result?.mesh.name ?? "clear")
        .join(",")} / 下桟=${Object.values(roofGuardLowerRailResults)
        .map((result) => result?.mesh.name ?? "clear")
        .join(",")} / 支柱x=${roofGuardPostX.toFixed(6)}:${Object.values(roofGuardPostResults)
        .map((result) => result?.mesh.name ?? "clear")
        .join(",")} / 実Player進行=${roofGuardPlayerAttempt.maximumProgress.toFixed(4)}/${roofGuardPlayerAttempt.barrierProgress.toFixed(4)} / 最低足元Y=${roofGuardPlayerAttempt.minimumFootY.toFixed(4)}/${roofGuardPlayerAttempt.minimumFootHeight.toFixed(4)} / 境界内=${roofGuardPlayerAttempt.stayedInsideBoundary} / エラー=${roofGuardPlayerAttempt.errorMessage ?? "なし"}`
    )
  );

  const rooftopAscentWaypoints = [
    new Vector3(-11.4, 38.7, 0.0),
    new Vector3(-11.4, 44.3, 2.4),
    new Vector3(-7.8, 44.3, 2.4),
    new Vector3(-7.8, 39.8, 3.6),
    new Vector3(-7.8, 38.4, 3.6),
    new Vector3(-11.4, 38.4, 3.6),
    new Vector3(-11.4, 38.7, 3.6),
    new Vector3(-11.4, 44.3, 6.0),
    new Vector3(-7.8, 44.3, 6.0),
    new Vector3(-7.8, 39.8, 7.2),
    new Vector3(-7.8, 38.4, 7.2),
    new Vector3(-11.4, 38.4, 7.2),
    new Vector3(-11.4, 38.7, 7.2),
    new Vector3(-11.4, 44.3, 9.6),
    new Vector3(-7.8, 44.3, 9.6),
    new Vector3(-7.8, 39.8, 10.8),
    new Vector3(-7.8, 38.4, 10.8),
    new Vector3(-11.4, 38.4, 10.8),
    new Vector3(-11.4, 38.7, 10.8),
    new Vector3(-11.4, 44.3, 13.2),
    new Vector3(-7.8, 44.3, 13.2),
    new Vector3(-7.8, 39.8, 14.45),
    new Vector3(-7.8, 37.8, 14.5)
  ];
  const rooftopRoundTrip = validatePlayerWaypointTraversal(
    context,
    "北西階段1階・屋上往復",
    [
      ...rooftopAscentWaypoints,
      ...rooftopAscentWaypoints.slice(0, -1).reverse()
    ],
    [0.0, 14.5]
  );
  checks.push(
    createCheck(
      "実プレイヤーによる北西階段1階・屋上往復",
      rooftopRoundTrip.ok,
      `Waypoint=${rooftopRoundTrip.reachedWaypoints}/${rooftopRoundTrip.totalWaypoints} / 最高足元Y=${rooftopRoundTrip.highestFootY.toFixed(3)} / 最低足元Y=${rooftopRoundTrip.lowestFootY.toFixed(3)} / 最終水平誤差=${rooftopRoundTrip.finalHorizontalError.toFixed(3)} / 最終垂直誤差=${rooftopRoundTrip.finalVerticalError.toFixed(3)} / 境界内=${rooftopRoundTrip.stayedInsideBoundary} / エラー=${rooftopRoundTrip.errorMessage ?? "なし"}`
    )
  );

  const upperFloorAscentWaypoints = rooftopAscentWaypoints.slice(0, 17);
  const northeastAscentWaypoints = upperFloorAscentWaypoints.map(
    (point) => new Vector3(point.x + 54.0, point.y, point.z)
  );
  const southwestAscentWaypoints = upperFloorAscentWaypoints.map(
    (point) => new Vector3(32.9 - point.y, point.x + 9.1, point.z)
  );
  const northeastRoundTrip = validatePlayerWaypointTraversal(
    context,
    "北東階段1階・4階往復",
    [
      ...northeastAscentWaypoints,
      ...northeastAscentWaypoints.slice(0, -1).reverse()
    ],
    [0.0, 10.8]
  );
  const southwestRoundTrip = validatePlayerWaypointTraversal(
    context,
    "南西階段1階・4階往復",
    [
      ...southwestAscentWaypoints,
      ...southwestAscentWaypoints.slice(0, -1).reverse()
    ],
    [0.0, 10.8]
  );
  checks.push(
    createCheck(
      "実プレイヤーによる北東・南西階段1階・4階往復",
      northeastRoundTrip.ok && southwestRoundTrip.ok,
      [northeastRoundTrip, southwestRoundTrip]
        .map(
          (result) =>
            `${result.label}: Waypoint=${result.reachedWaypoints}/${result.totalWaypoints} / 最高足元Y=${result.highestFootY.toFixed(3)} / 最低足元Y=${result.lowestFootY.toFixed(3)} / 最終水平誤差=${result.finalHorizontalError.toFixed(3)} / 最終垂直誤差=${result.finalVerticalError.toFixed(3)} / 境界内=${result.stayedInsideBoundary} / エラー=${result.errorMessage ?? "なし"}`
        )
        .join(" || ")
    )
  );

  const transformStairPoint = (
    point: Vector3,
    stair: "NW" | "NE" | "SW"
  ) => {
    if (stair === "NW") {
      return point;
    }
    if (stair === "NE") {
      return new Vector3(point.x + 54.0, point.y, point.z);
    }
    return new Vector3(32.9 - point.y, point.x + 9.1, point.z);
  };
  const stairArrivalGuardExpectations = [
    ["NW", "2F", 3.6, "COL_StairGuard_NW_Upper"],
    ["NW", "3F", 7.2, "COL_StairGuardSystem_NW_2FTo3F"],
    ["NW", "4F", 10.8, "COL_StairGuardSystem_NW_3FTo4F"],
    ["NW", "屋上", 14.4, "COL_StairGuardSystem_NW_4FToRooftop"],
    ["NE", "2F", 3.6, "COL_StairGuard_NE_Upper"],
    ["NE", "3F", 7.2, "COL_StairGuardSystem_NE_2FTo3F"],
    ["NE", "4F", 10.8, "COL_StairGuardSystem_NE_3FTo4F"],
    ["SW", "2F", 3.6, "COL_StairGuard_SW_Upper"],
    ["SW", "3F", 7.2, "COL_StairGuardSystem_SW_2FTo3F"],
    ["SW", "4F", 10.8, "COL_StairGuardSystem_SW_3FTo4F"]
  ] as const;
  const stairArrivalGuardResults = stairArrivalGuardExpectations.map(
    ([stair, floor, arrivalZ, expectedName]) => {
      const from = blenderPointToBabylon(
        transformStairPoint(
          new Vector3(-8.5, 39.8, arrivalZ + 1.0),
          stair
        )
      );
      const to = blenderPointToBabylon(
        transformStairPoint(
          new Vector3(-9.3, 39.8, arrivalZ + 1.0),
          stair
        )
      );
      return {
        stair,
        floor,
        expectedName,
        player: context.queries.castMovementSegment("player", from, to),
        npc: context.queries.castMovementSegment("npc", from, to),
        bit: context.queries.castMovementSegment("bit", from, to),
        beam: context.queries.castBeamSegment(from, to),
        sight: context.queries.castSightSegment(from, to)
      };
    }
  );
  checks.push(
    createCheck(
      "全到達階の階段手すりによる転落防止",
      stairArrivalGuardResults.every(
        (result) =>
          schoolMeshByName.has(result.expectedName) &&
          [
            result.player,
            result.npc,
            result.bit,
            result.beam,
            result.sight
          ].every((hit) => hit?.mesh.name === result.expectedName)
      ),
      stairArrivalGuardResults
        .map(
          (result) =>
            `${result.stair}${result.floor}:${[
              result.player,
              result.npc,
              result.bit,
              result.beam,
              result.sight
            ]
              .map((hit) => hit?.mesh.name ?? "clear")
              .join(",")}`
        )
        .join(" / ")
    )
  );

  const northwestStorageBoundsExpectations = [
    ["VIS_StairStorageShell_NW", [-9.0, 38.9, 0.0], [-6.75, 43.1, 3.5]],
    ["COL_StairStorageShell_NW", [-9.0, 38.9, 0.0], [-6.75, 43.1, 3.5]],
    ["COL_StairRampUpper_NW", [-9.0, 38.9, 2.3], [-6.6, 43.1, 3.6]]
  ] as const;
  const northwestStorageBoundsResults = northwestStorageBoundsExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        schoolMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const openUpperStairVisuals = [
    "VIS_StairSystem_NW_2FTo3F",
    "VIS_StairSystem_NW_3FTo4F",
    "VIS_StairSystem_NW_4FToRooftop",
    "VIS_StairSystem_NE_2FTo3F",
    "VIS_StairSystem_NE_3FTo4F",
    "VIS_StairSystem_SW_2FTo3F",
    "VIS_StairSystem_SW_3FTo4F"
  ].map((name) => ({
    name,
    vertices: schoolMeshByName.get(name)?.getTotalVertices() ?? 0
  }));
  const retiredUpperStairClosures = [
    "COL_StairClosure_NE",
    "COL_StairClosure_SW"
  ];
  const storageCentralApproachHit = castPlayerMovementSegment(
    blenderPointToBabylon(new Vector3(-9.6, 38.5, 1.0)),
    blenderPointToBabylon(new Vector3(-9.6, 43.8, 1.0))
  );
  const storageWestWallHit = castPlayerMovementSegment(
    blenderPointToBabylon(new Vector3(-9.2, 41.0, 1.0)),
    blenderPointToBabylon(new Vector3(-8.8, 41.0, 1.0))
  );
  const storageSouthWallHit = castPlayerMovementSegment(
    blenderPointToBabylon(new Vector3(-7.8, 38.5, 1.0)),
    blenderPointToBabylon(new Vector3(-7.8, 39.3, 1.0))
  );
  const northwestStorageMaximumEyeHeight =
    V2_PLAYER_BASE_EYE_HEIGHT * V2_PLAYER_MAX_EYE_HEIGHT_SCALE;
  const storageMaximumEyeFoot = blenderPointToBabylon(
    new Vector3(-7.8, 40.0, 0.05)
  );
  const storageMaximumEyeHit = castPlayerMovementSegment(
    storageMaximumEyeFoot,
    storageMaximumEyeFoot.add(
      new Vector3(0, northwestStorageMaximumEyeHeight, 0)
    )
  );
  const storageHighCeilingHit = castPlayerMovementSegment(
    blenderPointToBabylon(new Vector3(-7.8, 40.0, 2.4)),
    blenderPointToBabylon(new Vector3(-7.8, 40.0, 3.4))
  );
  const northwestStorageRoundTrip = validatePlayerWaypointTraversal(
    context,
    "北西階段下倉庫往復",
    [
      new Vector3(-9.6, 38.5, 0.0),
      new Vector3(-9.6, 43.8, 0.0),
      new Vector3(-7.8, 43.8, 0.0),
      new Vector3(-7.8, 40.0, 0.0),
      new Vector3(-7.8, 43.8, 0.0),
      new Vector3(-9.6, 43.8, 0.0),
      new Vector3(-9.6, 38.5, 0.0)
    ],
    [0.0, 0.0]
  );
  checks.push(
    createCheck(
      "3階段の2階～4階開放構造と北西階段の1階倉庫",
      northwestStorageBoundsResults.every((result) => result.ok) &&
        openUpperStairVisuals.every((result) => result.vertices === 696) &&
        retiredUpperStairClosures.every(
          (name) => !schoolMeshByName.has(name)
        ) &&
        storageCentralApproachHit === null &&
        storageWestWallHit?.mesh.name === "COL_StairStorageShell_NW" &&
        storageSouthWallHit?.mesh.name === "COL_StairStorageShell_NW" &&
        storageMaximumEyeHit === null &&
        storageHighCeilingHit === null &&
        northwestStorageRoundTrip.ok,
      `${northwestStorageBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")} / 上階表示=${openUpperStairVisuals
        .map((result) => `${result.name}:${result.vertices}`)
        .join(",")} / 旧closure=${retiredUpperStairClosures
        .map((name) => `${name}:${!schoolMeshByName.has(name)}`)
        .join(",")} / 中央入口=${storageCentralApproachHit?.mesh.name ?? "clear"} / 西壁=${storageWestWallHit?.mesh.name ?? "なし"} / 南壁=${storageSouthWallHit?.mesh.name ?? "なし"} / 最大視点=${storageMaximumEyeHit?.mesh.name ?? "clear"} / 高天井帯=${storageHighCeilingHit?.mesh.name ?? "clear"} / Waypoint=${northwestStorageRoundTrip.reachedWaypoints}/${northwestStorageRoundTrip.totalWaypoints} / 境界内=${northwestStorageRoundTrip.stayedInsideBoundary} / エラー=${northwestStorageRoundTrip.errorMessage ?? "なし"}`
    )
  );

  const poolBoundsExpectations = [
    ["VIS_B03_PoolWater", [14.6, 36.2, 15.33], [34.2, 41.8, 15.35]],
    ["VIS_PoolDeckAccessStairs_West", [10.0, 37.8, 14.45], [12.4, 40.2, 15.65]],
    ["COL_PoolDeckAccessRamp_West", [10.0, 37.8, 14.45], [16.5, 40.2, 15.65]],
    ["VIS_PoolBasinStairs_West", [14.4, 37.8, 14.61], [16.5, 40.2, 15.65]],
    ["VIS_PoolBasinStairs_East", [32.3, 37.8, 14.61], [34.4, 40.2, 15.65]],
    ["COL_PoolBasinRamp_East", [32.3, 37.8, 14.56], [36.4, 40.2, 15.65]]
  ] as const;
  const poolBoundsResults = poolBoundsExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        schoolMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const poolTraversalWaypoints = [
    new Vector3(8.8, 39.0, 14.5),
    new Vector3(10.0, 39.0, 14.5),
    new Vector3(12.4, 39.0, 15.65),
    new Vector3(14.4, 39.0, 15.65),
    new Vector3(16.5, 39.0, 14.66),
    new Vector3(31.0, 39.0, 14.66),
    new Vector3(32.3, 39.0, 14.66),
    new Vector3(34.4, 39.0, 15.65),
    new Vector3(35.4, 39.0, 15.65)
  ];
  const poolRoundTrip = validatePlayerWaypointTraversal(
    context,
    "屋上床・プールサイド・プール内往復",
    [
      ...poolTraversalWaypoints,
      ...poolTraversalWaypoints.slice(0, -1).reverse()
    ],
    [14.5, 15.65]
  );
  const poolsideFoot = blenderPointToBabylon(
    new Vector3(13.4, 39.0, 15.65)
  );
  const poolsideMaximumEye = poolsideFoot.add(
    new Vector3(
      0,
      V2_PLAYER_BASE_EYE_HEIGHT * V2_PLAYER_MAX_EYE_HEIGHT_SCALE,
      0
    )
  );
  const waterVolume = waterVolumes[0];
  waterVolume.mesh.computeWorldMatrix(true);
  const waterBounds = waterVolume.mesh.getBoundingInfo().boundingBox;
  const waterCenter = waterBounds.centerWorld.clone();
  const pointAboveWater = new Vector3(
    waterCenter.x,
    waterBounds.maximumWorld.y + 0.05,
    waterCenter.z
  );
  checks.push(
    createCheck(
      "屋上プール3階段の形状と実プレイヤー往復",
      poolBoundsResults.every((result) => result.ok) &&
        poolRoundTrip.ok &&
        context.boundary.contains(poolsideFoot) &&
        context.boundary.contains(poolsideMaximumEye),
      `${poolBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")} / Waypoint=${poolRoundTrip.reachedWaypoints}/${poolRoundTrip.totalWaypoints} / 最高足元Y=${poolRoundTrip.highestFootY.toFixed(3)} / 最低足元Y=${poolRoundTrip.lowestFootY.toFixed(3)} / 足元境界内=${context.boundary.contains(poolsideFoot)} / 最大視点境界内=${context.boundary.contains(poolsideMaximumEye)} / 経路境界内=${poolRoundTrip.stayedInsideBoundary} / エラー=${poolRoundTrip.errorMessage ?? "なし"}`
    ),
    createCheck(
      "VOL_PoolWaterの内外判定",
      waterVolume.id === "pool-water" &&
        context.queries.containsVolume("water", waterCenter) &&
        !context.queries.containsVolume("water", pointAboveWater),
      `id=${waterVolume.id} / center=${context.queries.containsVolume("water", waterCenter)} / above=${context.queries.containsVolume("water", pointAboveWater)}`
    )
  );

  const toiletMeshByName = new Map(
    [
      ...context.resources.visualMeshes,
      ...context.resources.normalColliders
    ].map((mesh) => [mesh.name, mesh])
  );
  const toiletBoundsExpectations = [
    ["VIS_ToiletStallPartition_M_01", [-5.09, 43.25, 0.0], [-5.01, 45.35, 2.1]],
    ["COL_ToiletStallPartition_M_01", [-5.09, 43.25, 0.0], [-5.01, 45.35, 2.1]],
    ["VIS_ToiletStallPartition_M_02", [-3.69, 43.25, 0.0], [-3.61, 45.35, 2.1]],
    ["COL_ToiletStallPartition_M_02", [-3.69, 43.25, 0.0], [-3.61, 45.35, 2.1]],
    ["VIS_ToiletStallPartition_F_01", [-0.59, 43.25, 0.0], [-0.51, 45.35, 2.1]],
    ["COL_ToiletStallPartition_F_01", [-0.59, 43.25, 0.0], [-0.51, 45.35, 2.1]],
    ["VIS_ToiletStallPartition_F_02", [0.81, 43.25, 0.0], [0.89, 45.35, 2.1]],
    ["COL_ToiletStallPartition_F_02", [0.81, 43.25, 0.0], [0.89, 45.35, 2.1]],
    ["VIS_ToiletStallDoor_Open_M_01", [-5.13, 43.25, 0.0], [-5.09, 44.15, 1.8]],
    ["VIS_ToiletStallDoor_Open_M_02", [-3.73, 43.25, 0.0], [-3.69, 44.15, 1.8]],
    ["VIS_ToiletStallDoor_Open_M_03", [-2.33, 43.25, 0.0], [-2.29, 44.15, 1.8]],
    ["VIS_ToiletStallDoor_Open_F_01", [-0.63, 43.25, 0.0], [-0.59, 44.15, 1.8]],
    ["VIS_ToiletStallDoor_Open_F_02", [0.77, 43.25, 0.0], [0.81, 44.15, 1.8]],
    ["VIS_ToiletStallDoor_Open_F_03", [2.17, 43.25, 0.0], [2.21, 44.15, 1.8]]
  ] as const;
  const toiletBoundsResults = toiletBoundsExpectations.map(
    ([name, minimum, maximum]) => ({
      name,
      ...compareBlenderBounds(
        toiletMeshByName.get(name),
        Vector3.FromArray(minimum),
        Vector3.FromArray(maximum)
      )
    })
  );
  const expectedUrinalFixtureNames = [
    "VIS_B03_Prop_Urinal_01",
    "VIS_B03_Prop_Urinal_02",
    "VIS_B03_Prop_Urinal_03"
  ];
  const urinalFixturesPresent = expectedUrinalFixtureNames.every((name) =>
    toiletMeshByName.has(name)
  );
  checks.push(
    createCheck(
      "男女各3個室と男子小便器3基の契約",
      toiletBoundsResults.every((result) => result.ok) && urinalFixturesPresent,
      `${toiletBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")} / 小便器=${expectedUrinalFixtureNames
        .map((name) => `${name}:${toiletMeshByName.has(name)}`)
        .join(",")}`
    )
  );

  const castToiletFrontSegment = (
    x: number,
    baseZ: number,
    castSegment: StageSpatialContext["queries"]["castBeamSegment"]
  ) =>
    castSegment(
      blenderPointToBabylon(new Vector3(x, 38.0, baseZ + 1.0)),
      blenderPointToBabylon(new Vector3(x, 39.0, baseZ + 1.0))
    );
  const toiletFrontResults = [
    ["1F", 0.0, "COL_B03_Interior_Walls_F01_Toilets"],
    ["2F", 3.6, "COL_B03_Interior_Walls_F02_Toilets"],
    ["3F", 7.2, "COL_B03_Interior_Walls_F03_Toilets"],
    ["4F", 10.8, "COL_B03_Interior_Walls_F04_Toilets"]
  ].map(([floor, baseZ, expectedName]) => {
    const z = baseZ as number;
    const name = expectedName as string;
    const queryOpening = (x: number) => ({
      actor: castToiletFrontSegment(x, z, castPlayerMovementSegment),
      beam: castToiletFrontSegment(x, z, context.queries.castBeamSegment),
      sight: castToiletFrontSegment(x, z, context.queries.castSightSegment)
    });
    const maleOpening = queryOpening(-4.8);
    const femaleOpening = queryOpening(-0.3);
    const wall = queryOpening(-3.0);
    return {
      floor,
      expectedName: name,
      maleOpening,
      femaleOpening,
      wall
    };
  });
  const fourthFloorToiletCeilingFrom = blenderPointToBabylon(
    new Vector3(-4.8, 39.2, 13.6)
  );
  const fourthFloorToiletCeilingTo = blenderPointToBabylon(
    new Vector3(-4.8, 39.2, 14.45)
  );
  const fourthFloorToiletCeilingResults = {
    actor: castPlayerMovementSegment(
      fourthFloorToiletCeilingFrom,
      fourthFloorToiletCeilingTo
    ),
    beam: context.queries.castBeamSegment(
      fourthFloorToiletCeilingFrom,
      fourthFloorToiletCeilingTo
    ),
    sight: context.queries.castSightSegment(
      fourthFloorToiletCeilingFrom,
      fourthFloorToiletCeilingTo
    )
  };
  checks.push(
    createCheck(
      "全階トイレ正面壁・男女入口・4階天井",
      toiletFrontResults.every(
        (result) =>
          toiletMeshByName.has(result.expectedName) &&
          Object.values(result.maleOpening).every((hit) => hit === null) &&
          Object.values(result.femaleOpening).every((hit) => hit === null) &&
          Object.values(result.wall).every(
            (hit) => hit?.mesh.name === result.expectedName
          )
      ) &&
        Object.values(fourthFloorToiletCeilingResults).every(
          (hit) => hit?.mesh.name === "COL_B03_Ceiling_F04"
        ),
      `${toiletFrontResults
        .map(
          (result) =>
            `${result.floor}:男=${Object.values(result.maleOpening)
              .map((hit) => hit?.mesh.name ?? "clear")
              .join(",")},女=${Object.values(result.femaleOpening)
              .map((hit) => hit?.mesh.name ?? "clear")
              .join(",")},壁=${Object.values(result.wall)
              .map((hit) => hit?.mesh.name ?? "clear")
              .join(",")}`
        )
        .join(" / ")} / 4F天井=${Object.values(
        fourthFloorToiletCeilingResults
      )
        .map((hit) => hit?.mesh.name ?? "clear")
        .join(",")}`
    )
  );

  const boundaryRegressionPoints = [
    new Vector3(0, 0, 2.145),
    new Vector3(-9.55, 0.05, 2.2),
    new Vector3(-9.55, 0.05, 1.2),
    new Vector3(-13.15, 0.05, 2.2)
  ];
  const boundaryRegressionResults = boundaryRegressionPoints.map((point) =>
    context.boundary.contains(point)
  );
  const boundaryBounds = context.boundary.mesh.getBoundingInfo().boundingBox;
  const boundaryMinimum = boundaryBounds.minimumWorld;
  const boundaryMaximum = boundaryBounds.maximumWorld;
  const boundaryCenter = boundaryMinimum.add(boundaryMaximum).scale(0.5);
  const boundarySurfacePoints = [
    new Vector3(boundaryCenter.x, boundaryCenter.y, boundaryMaximum.z),
    new Vector3(boundaryMaximum.x, boundaryCenter.y, boundaryMaximum.z)
  ];
  const boundarySurfaceResults = boundarySurfacePoints.map((point) =>
    context.boundary.contains(point)
  );
  const boundaryOutsidePoints = [
    new Vector3(boundaryCenter.x, boundaryCenter.y, boundaryMaximum.z + 0.01),
    new Vector3(boundaryMinimum.x - 0.01, boundaryCenter.y, boundaryCenter.z)
  ];
  const boundaryOutsideResults = boundaryOutsidePoints.map((point) =>
    context.boundary.contains(point)
  );
  checks.push(
    createCheck(
      "BND南塀・体育館舞台ランプ誤判定回帰",
      boundaryRegressionResults.every(Boolean),
      `南塀=${boundaryRegressionResults[0]} / 西ランプ南側=${boundaryRegressionResults[1]} / 西ランプ北側=${boundaryRegressionResults[2]} / 東ランプ南側=${boundaryRegressionResults[3]}`
    ),
    createCheck(
      "BND表面点を内側として扱う",
      boundarySurfaceResults.every(Boolean),
      `南面中央=${boundarySurfaceResults[0]} / 南東共有稜線=${boundarySurfaceResults[1]}`
    ),
    createCheck(
      "BND代表内外点",
      context.boundary.contains(boundaryCenter) &&
        boundaryOutsideResults.every((contains) => !contains),
      `中央=${context.boundary.contains(boundaryCenter)} / 南外=${boundaryOutsideResults[0]} / 東外=${boundaryOutsideResults[1]}`
    )
  );

  const normalColliderSet = new Set(context.resources.normalColliders);
  const actorOnlyColliderSet = new Set(context.resources.actorOnlyColliders);
  const humanOnlyColliderSet = new Set(context.resources.humanOnlyColliders);
  const playerColliderSet = new Set(
    context.resources.movementColliders.player
  );
  const npcColliderSet = new Set(context.resources.movementColliders.npc);
  const bitColliderSet = new Set(context.resources.movementColliders.bit);
  const beamBlockerSet = new Set(context.resources.beamBlockers);
  const sightBlockerSet = new Set(context.resources.sightBlockers);
  const expectedPlayerAndNpcColliders = [
    ...normalColliderSet,
    ...actorOnlyColliderSet,
    ...humanOnlyColliderSet
  ];
  const expectedBitColliders = [
    ...normalColliderSet,
    ...actorOnlyColliderSet
  ];
  const setMatches = <T>(actual: ReadonlySet<T>, expected: readonly T[]) =>
    actual.size === expected.length && expected.every((value) => actual.has(value));
  checks.push(
    createCheck(
      "移動体別・beam・sight衝突集合",
      setMatches(playerColliderSet, expectedPlayerAndNpcColliders) &&
        setMatches(npcColliderSet, expectedPlayerAndNpcColliders) &&
        setMatches(bitColliderSet, expectedBitColliders) &&
        setMatches(beamBlockerSet, [...normalColliderSet]) &&
        setMatches(sightBlockerSet, [...normalColliderSet]),
      `player=${playerColliderSet.size} / npc=${npcColliderSet.size} / bit=${bitColliderSet.size} / beam=${beamBlockerSet.size} / sight=${sightBlockerSet.size} / normal=${normalColliderSet.size} / ActorOnly=${actorOnlyColliderSet.size} / HumanOnly=${humanOnlyColliderSet.size}`
    )
  );

  const representativeWindowTransition = apertureTransitions[0];
  if (!representativeWindowTransition) {
    throw new Error("代表ビット窓aperture遷移がありません。");
  }
  const windowForwardRoute = findBitTransitionRoute(
    context,
    representativeWindowTransition
  );
  const windowBackwardRoute = findBitTransitionRoute(
    context,
    representativeWindowTransition,
    true
  );
  const windowPlayerHit = context.queries.castMovementSegment(
    "player",
    representativeWindowTransition.fromPosition,
    representativeWindowTransition.toPosition
  );
  const windowNpcHit = context.queries.castMovementSegment(
    "npc",
    representativeWindowTransition.fromPosition,
    representativeWindowTransition.toPosition
  );
  const windowBitHit = context.queries.castMovementSegment(
    "bit",
    representativeWindowTransition.fromPosition,
    representativeWindowTransition.toPosition
  );
  const windowBeamHit = context.queries.castBeamSegment(
    representativeWindowTransition.fromPosition,
    representativeWindowTransition.toPosition
  );
  const windowSightHit = context.queries.castSightSegment(
    representativeWindowTransition.fromPosition,
    representativeWindowTransition.toPosition
  );
  const windowForwardTransitions =
    windowForwardRoute?.steps.filter((step) => step.kind === "transition") ?? [];
  const windowBackwardTransitions =
    windowBackwardRoute?.steps.filter((step) => step.kind === "transition") ?? [];
  checks.push(
    createCheck(
      "実ビット窓apertureの双方向経路・mover・beam・sight分類",
      windowPlayerHit?.mesh.name.startsWith("COL_HumanOnly_Window_") === true &&
        windowNpcHit?.mesh === windowPlayerHit.mesh &&
        windowBitHit === null &&
        windowBeamHit === null &&
        windowSightHit === null &&
        windowForwardTransitions.length === 1 &&
        windowForwardTransitions[0].traversal.transition ===
          representativeWindowTransition &&
        windowForwardTransitions[0].traversal.reversed === false &&
        windowBackwardTransitions.length === 1 &&
        windowBackwardTransitions[0].traversal.transition ===
          representativeWindowTransition &&
        windowBackwardTransitions[0].traversal.reversed === true,
      `transition=${representativeWindowTransition.id} / forward=${windowForwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"} / backward=${windowBackwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"} / player=${windowPlayerHit?.mesh.name ?? "clear"} / npc=${windowNpcHit?.mesh.name ?? "clear"} / bit=${windowBitHit?.mesh.name ?? "clear"} / beam=${windowBeamHit?.mesh.name ?? "clear"} / sight=${windowSightHit?.mesh.name ?? "clear"}`
    )
  );

  const rooftopBoundaryTransition = boundaryTransitions[0];
  if (!rooftopBoundaryTransition) {
    throw new Error("屋上boundary遷移がありません。");
  }
  const rooftopForwardRoute = findBitTransitionRoute(
    context,
    rooftopBoundaryTransition
  );
  const rooftopBackwardRoute = findBitTransitionRoute(
    context,
    rooftopBoundaryTransition,
    true
  );
  const rooftopForwardTransitions =
    rooftopForwardRoute?.steps.filter((step) => step.kind === "transition") ?? [];
  const rooftopBackwardTransitions =
    rooftopBackwardRoute?.steps.filter((step) => step.kind === "transition") ?? [];
  checks.push(
    createCheck(
      "4F・屋上外周boundaryの双方向経路",
      rooftopForwardTransitions.length === 1 &&
        rooftopForwardTransitions[0].traversal.transition ===
          rooftopBoundaryTransition &&
        rooftopForwardTransitions[0].traversal.reversed === false &&
        rooftopBackwardTransitions.length === 1 &&
        rooftopBackwardTransitions[0].traversal.transition ===
          rooftopBoundaryTransition &&
        rooftopBackwardTransitions[0].traversal.reversed === true,
      `transition=${rooftopBoundaryTransition.id} / forward=${rooftopForwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"} / backward=${rooftopBackwardTransitions.map((step) => step.traversal.transition.id).join(">") || "none"}`
    )
  );

  const chestPosition = playerSpawn.add(new Vector3(0, 0.2, 0));
  const outsidePosition = new Vector3(5.5, 0.2, 0);
  const actorWallHit = castPlayerMovementSegment(
    chestPosition,
    outsidePosition
  );
  const beamWallHit = context.queries.castBeamSegment(
    chestPosition,
    outsidePosition
  );
  const sightWallHit = context.queries.castSightSegment(
    chestPosition,
    outsidePosition
  );
  checks.push(
    createCheck(
      "学校実壁のactor・beam・sight遮蔽",
      actorWallHit !== null &&
        beamWallHit !== null &&
        sightWallHit !== null &&
        actorWallHit.mesh === beamWallHit.mesh &&
        beamWallHit.mesh === sightWallHit.mesh,
      `actor=${actorWallHit?.mesh.name ?? "なし"} / beam=${beamWallHit?.mesh.name ?? "なし"} / sight=${sightWallHit?.mesh.name ?? "なし"}`
    )
  );

  const maximumEyeHeight =
    V2_PLAYER_BASE_EYE_HEIGHT * V2_PLAYER_MAX_EYE_HEIGHT_SCALE;
  const footSurfaceClearance = 0.05 * BLENDER_METERS_TO_WORLD_UNITS;
  const landingCentersBlender = [
    new Vector3(-9.6, 44.3, 0),
    new Vector3(44.4, 44.3, 0),
    new Vector3(-11.4, -0.5, 0)
  ];
  const headroomResults = landingCentersBlender.map((center) => {
    const horizontalPosition = blenderPointToBabylon(center);
    const storageFoot = horizontalPosition.add(
      new Vector3(0, footSurfaceClearance, 0)
    );
    const storageMaximumEye = storageFoot.add(
      new Vector3(0, maximumEyeHeight, 0)
    );
    const landingFoot = horizontalPosition.add(
      new Vector3(
        0,
        2.4 * BLENDER_METERS_TO_WORLD_UNITS + footSurfaceClearance,
        0
      )
    );
    const landingMaximumEye = landingFoot.add(
      new Vector3(0, maximumEyeHeight, 0)
    );
    return {
      storageMaximumEyeHit: castPlayerMovementSegment(
        storageFoot,
        storageMaximumEye
      ),
      landingUndersideHit: castPlayerMovementSegment(
        landingFoot,
        storageFoot
      ),
      landingMaximumEyeHit: castPlayerMovementSegment(
        landingFoot,
        landingMaximumEye
      ),
      landingFootInBoundary: context.boundary.contains(landingFoot),
      landingMaximumEyeInBoundary:
        context.boundary.contains(landingMaximumEye)
    };
  });
  checks.push(
    createCheck(
      "3階段の倉庫・1F踊り場最大視点高",
      headroomResults.every(
        (result) =>
          result.storageMaximumEyeHit === null &&
          result.landingUndersideHit?.mesh.name.startsWith(
            "COL_StairLanding_"
          ) === true &&
          result.landingMaximumEyeHit === null &&
          result.landingFootInBoundary &&
          result.landingMaximumEyeInBoundary
      ),
      headroomResults
        .map(
          (result, index) =>
            `${["NW", "NE", "SW"][index]}=` +
            `倉庫:${result.storageMaximumEyeHit?.mesh.name ?? "clear"},` +
            `踊り場下面:${result.landingUndersideHit?.mesh.name ?? "なし"},` +
            `踊り場上:${result.landingMaximumEyeHit?.mesh.name ?? "clear"},` +
            `境界:足元=${result.landingFootInBoundary},最大視点=${result.landingMaximumEyeInBoundary}`
        )
        .join(" / ")
    )
  );

  const projectedSpawn = context.navigation.projectPoint(playerSpawn, 0.25);
  const projectedSpawnHorizontalError = projectedSpawn
    ? Math.hypot(
        projectedSpawn.position.x - playerSpawn.x,
        projectedSpawn.position.z - playerSpawn.z
      )
    : Number.POSITIVE_INFINITY;
  const projectedSpawnVerticalError = projectedSpawn
    ? Math.abs(projectedSpawn.position.y - playerSpawn.y)
    : Number.POSITIVE_INFINITY;
  checks.push(
    createCheck(
      "NavMesh復元とスポーン投影",
      projectedSpawn !== null &&
        projectedSpawnHorizontalError <= 1e-5 &&
        projectedSpawnVerticalError <= 0.02,
      projectedSpawn
        ? `projected=(${projectedSpawn.position.x.toFixed(3)}, ${projectedSpawn.position.y.toFixed(4)}, ${projectedSpawn.position.z.toFixed(3)}) / horizontalError=${projectedSpawnHorizontalError.toFixed(6)} / verticalError=${projectedSpawnVerticalError.toFixed(6)}`
        : "投影失敗"
    )
  );
};

const disposeAndInspect = async (
  context: StageSpatialContext,
  baseline: SceneResourceCounts,
  checks: CheckResult[],
  label: string
) => {
  const captured = captureOwnedResources(context);
  context.dispose();
  if (activeContext === context) {
    activeContext = null;
  }
  await settleScene();

  const liveResources = inspectDisposedResources(captured);
  const currentCounts = countSceneResources();
  checks.push(
    createCheck(
      `${label}: 所有資源の実体破棄`,
      liveResources.liveNodes.length === 0 &&
        liveResources.liveMaterials.length === 0 &&
        liveResources.liveTextures.length === 0,
      `node=${liveResources.liveNodes.length} / material=${liveResources.liveMaterials.length} / texture=${liveResources.liveTextures.length}`
    ),
    createCheck(
      `${label}: Scene資源残留なし`,
      sceneResourceCountsEqual(baseline, currentCounts),
      `baseline=${JSON.stringify(baseline)} / current=${JSON.stringify(currentCounts)}`
    )
  );
};

const runValidation = async () => {
  if (running) {
    return;
  }
  running = true;
  runButton.disabled = true;
  summary.textContent = "学校GLB・NavMesh・3D意味Objectを検証中";
  results.replaceChildren();
  browserErrors.length = 0;
  const loggerErrorsAtStart = Logger.errorsCount;
  const checks: CheckResult[] = [];
  window.__T02_VALIDATION__ = { status: "running", checks };

  try {
    if (activeContext) {
      activeContext.dispose();
      activeContext = null;
      await settleScene();
    }
    const baseline = countSceneResources();

    await validateAssetHashes(checks);

    activeContext = await loadStageSpatialContext(scene, SCHOOL_STAGE);
    await settleScene();
    validateLoadedContext(activeContext, checks);
    await disposeAndInspect(activeContext, baseline, checks, "初回読込");

    activeContext = await loadStageSpatialContext(scene, SCHOOL_STAGE);
    await settleScene();
    const reloadMetadataValid =
      activeContext.metadata.stageId === SCHOOL_STAGE.id &&
      activeContext.resources.visualMeshes.length === 482 &&
      activeContext.resources.normalColliders.length === 197 &&
      activeContext.resources.actorOnlyColliders.length === 81 &&
      activeContext.resources.humanOnlyColliders.length === 57 &&
      activeContext.resources.navSourceMeshes.length === 19 &&
      activeContext.resources.bitFlightNavSourceMeshes.length === 22 &&
      activeContext.markers.all.length === 3 &&
      activeContext.markers.getByRole("assembly_anchor").length === 2 &&
      activeContext.volumes.all.length === 5 &&
      activeContext.volumes.getByRole("assembly").length === 2 &&
      activeContext.assemblyVenues.all.length === 2 &&
      activeContext.assemblyVenues.all.every(
        (venue) =>
          venue.selectionWeight === 1 &&
          venue.assemblyPositions.length === 100 &&
          venue.executionAudiencePositions.length === 94 &&
          venue.executionTargetPositions.length === 6
      ) &&
      activeContext.volumes.getByRole("water").length === 1 &&
      activeContext.links.all.length === 0 &&
      activeContext.bitNavigation.zones.length === 4 &&
      activeContext.bitNavigation.bands.length === 11 &&
      activeContext.bitNavigation.transitions.length === 72;
    checks.push(
      createCheck(
        "学校コンテキスト再読込",
        reloadMetadataValid,
        `stage=${activeContext.metadata.stageId} / VIS=${activeContext.resources.visualMeshes.length} / COL=${activeContext.resources.normalColliders.length} / ActorOnly=${activeContext.resources.actorOnlyColliders.length} / HumanOnly=${activeContext.resources.humanOnlyColliders.length} / humanNAV=${activeContext.resources.navSourceMeshes.length} / bitNAV=${activeContext.resources.bitFlightNavSourceMeshes.length} / water=${activeContext.volumes.getByRole("water").length} / humanLNK=${activeContext.links.all.length} / bitTransitions=${activeContext.bitNavigation.transitions.length}`
      )
    );
    await disposeAndInspect(activeContext, baseline, checks, "再読込");
  } catch (error) {
    checks.push(createCheck("検証処理", false, formatError(error)));
    if (activeContext) {
      activeContext.dispose();
      activeContext = null;
    }
  } finally {
    await scene.whenReadyAsync(true);
    const loggerErrors = Logger.errorsCount - loggerErrorsAtStart;
    checks.push(
      createCheck(
        "ブラウザ・Babylonエラー監視",
        browserErrors.length === 0 && loggerErrors === 0,
        `Babylon Logger=${loggerErrors} / browser=${browserErrors.join(" | ") || "なし"}`
      )
    );
    const failed = checks.some((check) => !check.ok);
    window.__T02_VALIDATION__ = {
      status: failed ? "failed" : "passed",
      checks
    };
    renderResults(checks);
    running = false;
    runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => void runValidation());
window.addEventListener("resize", () => engine.resize());
window.addEventListener("beforeunload", () => {
  activeContext?.dispose();
});
engine.runRenderLoop(() => scene.render());

void runValidation();
