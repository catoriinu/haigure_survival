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
  const [glbData, navmeshData] = await Promise.all([
    fetchBinary(SCHOOL_STAGE.glbUrl),
    fetchBinary(SCHOOL_STAGE.navmeshUrl)
  ]);
  const [glbSha256, navmeshSha256] = await Promise.all([
    calculateSha256(glbData),
    calculateSha256(navmeshData)
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

  checks.push(
    createCheck(
      "学校メタデータ契約",
      context.stage === SCHOOL_STAGE &&
        context.metadata.schemaVersion === SCHOOL_STAGE.assetSchemaVersion &&
        context.metadata.stageId === SCHOOL_STAGE.id &&
        context.metadata.navProfileId === SCHOOL_STAGE.navProfileId,
      `stage=${context.metadata.stageId} / schema=${context.metadata.schemaVersion} / navProfile=${context.metadata.navProfileId}`
    ),
    createCheck(
      "学校GLBの厳格意味分類",
      context.resources.visualMeshes.length === 309 &&
        context.resources.normalColliders.length === 160 &&
        context.resources.actorOnlyColliders.length === 0 &&
        context.resources.navSourceMeshes.length === 8 &&
        context.markers.all.length === 1 &&
        context.volumes.all.length === 2,
      `VIS=${context.resources.visualMeshes.length} / COL=${context.resources.normalColliders.length} / ActorOnly=${context.resources.actorOnlyColliders.length} / NAV=${context.resources.navSourceMeshes.length} / MRK=${context.markers.all.length} / VOL=${context.volumes.all.length}`
    ),
    createCheck(
      "3Dスポーン・境界・生成Volume",
      Vector3.Distance(playerSpawn, expectedPlayerSpawn) <= 1e-5 &&
        context.boundary.contains(playerSpawn) &&
        npcSpawnVolumes.length === 1 &&
        bitSpawnVolumes.length === 1,
      `spawn=(${playerSpawn.x.toFixed(3)}, ${playerSpawn.y.toFixed(3)}, ${playerSpawn.z.toFixed(3)}) / boundary=${context.boundary.contains(playerSpawn)} / npc=${npcSpawnVolumes.length} / bit=${bitSpawnVolumes.length}`
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
    ["VIS_Wall_Lintel_NorthWingSouthEntry", [0.15, 32.35, 2.4], [5.4, 32.65, 3.0]],
    ["COL_Wall_Lintel_NorthWingSouthEntry", [0.15, 32.35, 2.4], [5.4, 32.65, 3.0]],
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
  const mergeLineHit = context.queries.castActorSegment(
    blenderPointToBabylon(new Vector3(-8.05, 17.5, 1.0)),
    blenderPointToBabylon(new Vector3(-8.05, 27.5, 1.0))
  );
  const southDividerHit = context.queries.castActorSegment(
    blenderPointToBabylon(new Vector3(-8.05, 11.5, 1.0)),
    blenderPointToBabylon(new Vector3(-8.05, 13.5, 1.0))
  );
  const northSpecialDividerHit = context.queries.castActorSegment(
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

  const fourFloorBoundsExpectations = [
    ["VIS_4F_NorthVolume", [-12.6, 32.5, 9.6], [47.4, 45.5, 12.6]],
    ["COL_4F_NorthVolume", [-12.6, 32.5, 9.6], [47.4, 45.5, 12.6]],
    ["VIS_4F_WestVolume", [-12.6, -3.5, 9.6], [0.0, 32.5, 12.6]],
    ["COL_4F_WestVolume", [-12.6, -3.5, 9.6], [0.0, 32.5, 12.6]],
    ["VIS_Roof_North", [-12.6, 32.5, 12.6], [47.4, 45.5, 12.7]],
    ["COL_RooftopStairExitRamp", [-9.0, 38.9, 12.5], [-6.9, 40.7, 12.7]],
    ["VIS_RooftopFacilityWalls", [-12.6, 38.5, 12.7], [2.4, 45.5, 15.1]],
    ["VIS_RooftopFacilityRoofs", [-12.6, 38.5, 15.1], [2.4, 45.5, 15.2]],
    ["COL_RooftopFacilityShell", [-12.6, 38.5, 12.7], [2.4, 45.5, 15.2]],
    ["VIS_DoorLeaf_RooftopStairHouse_Open", [-9.04, 37.0, 12.7], [-8.96, 38.9, 14.9]],
    ["VIS_Floor_RooftopChangingRoom_M", [-6.6, 38.5, 12.7], [-2.1, 45.5, 12.73]],
    ["VIS_Floor_RooftopChangingRoom_F", [-2.1, 38.5, 12.7], [2.4, 45.5, 12.73]],
    ["BND_Stage", [-18.4, -12.3, -0.5], [63.2, 51.3, 16.0]]
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
    (mesh) => mesh.name.startsWith("VIS_WindowGuide_4F_")
  ).length;
  const rooftopFoot = blenderPointToBabylon(
    new Vector3(-7.8, 37.8, 12.7)
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

  const rooftopAscentWaypoints = [
    new Vector3(-11.4, 38.7, 0.0),
    new Vector3(-11.4, 44.3, 2.4),
    new Vector3(-7.8, 44.3, 2.4),
    new Vector3(-7.8, 39.8, 3.6),
    new Vector3(-11.4, 39.8, 3.6),
    new Vector3(-11.4, 44.3, 5.1),
    new Vector3(-7.8, 44.3, 5.1),
    new Vector3(-7.8, 39.8, 6.6),
    new Vector3(-11.4, 39.8, 6.6),
    new Vector3(-11.4, 44.3, 8.1),
    new Vector3(-7.8, 44.3, 8.1),
    new Vector3(-7.8, 39.8, 9.6),
    new Vector3(-11.4, 39.8, 9.6),
    new Vector3(-11.4, 44.3, 11.1),
    new Vector3(-7.8, 44.3, 11.1),
    new Vector3(-7.8, 39.8, 12.65),
    new Vector3(-7.8, 37.8, 12.7)
  ];
  const rooftopRoundTrip = validatePlayerWaypointTraversal(
    context,
    "北西階段1階・屋上往復",
    [
      ...rooftopAscentWaypoints,
      ...rooftopAscentWaypoints.slice(0, -1).reverse()
    ],
    [0.0, 12.7]
  );
  checks.push(
    createCheck(
      "実プレイヤーによる北西階段1階・屋上往復",
      rooftopRoundTrip.ok,
      `Waypoint=${rooftopRoundTrip.reachedWaypoints}/${rooftopRoundTrip.totalWaypoints} / 最高足元Y=${rooftopRoundTrip.highestFootY.toFixed(3)} / 最低足元Y=${rooftopRoundTrip.lowestFootY.toFixed(3)} / 最終水平誤差=${rooftopRoundTrip.finalHorizontalError.toFixed(3)} / 最終垂直誤差=${rooftopRoundTrip.finalVerticalError.toFixed(3)} / 境界内=${rooftopRoundTrip.stayedInsideBoundary} / エラー=${rooftopRoundTrip.errorMessage ?? "なし"}`
    )
  );

  const poolBoundsExpectations = [
    ["VIS_PoolWaterPlaceholder", [14.6, 36.2, 13.53], [34.2, 41.8, 13.57]],
    ["VIS_PoolDeckAccessStairs_West", [10.0, 37.8, 12.65], [12.4, 40.2, 13.85]],
    ["COL_PoolDeckAccessRamp_West", [10.0, 37.8, 12.65], [16.5, 40.2, 13.85]],
    ["VIS_PoolBasinStairs_West", [14.4, 37.8, 12.81], [16.5, 40.2, 13.85]],
    ["VIS_PoolBasinStairs_East", [32.3, 37.8, 12.81], [34.4, 40.2, 13.85]],
    ["COL_PoolBasinRamp_East", [32.3, 37.8, 12.76], [36.4, 40.2, 13.85]]
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
    new Vector3(8.8, 39.0, 12.7),
    new Vector3(10.0, 39.0, 12.7),
    new Vector3(12.4, 39.0, 13.85),
    new Vector3(14.4, 39.0, 13.85),
    new Vector3(16.5, 39.0, 12.86),
    new Vector3(31.0, 39.0, 12.86),
    new Vector3(32.3, 39.0, 12.86),
    new Vector3(34.4, 39.0, 13.85),
    new Vector3(35.4, 39.0, 13.85)
  ];
  const poolRoundTrip = validatePlayerWaypointTraversal(
    context,
    "屋上床・プールサイド・プール内往復",
    [
      ...poolTraversalWaypoints,
      ...poolTraversalWaypoints.slice(0, -1).reverse()
    ],
    [12.7, 13.85]
  );
  const poolsideFoot = blenderPointToBabylon(
    new Vector3(13.4, 39.0, 13.85)
  );
  const poolsideMaximumEye = poolsideFoot.add(
    new Vector3(
      0,
      V2_PLAYER_BASE_EYE_HEIGHT * V2_PLAYER_MAX_EYE_HEIGHT_SCALE,
      0
    )
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
  const urinalFixturesAbsent = [
    ...context.resources.visualMeshes,
    ...context.resources.normalColliders
  ].every((mesh) => !mesh.name.includes("Urinal"));
  checks.push(
    createCheck(
      "男女各3個室と男子小便器予約帯の契約",
      toiletBoundsResults.every((result) => result.ok) && urinalFixturesAbsent,
      `${toiletBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")} / 小便器予約帯のみ=${urinalFixturesAbsent}`
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
  const actorColliderSet = new Set(context.resources.actorColliders);
  const beamBlockerSet = new Set(context.resources.beamBlockers);
  const sightBlockerSet = new Set(context.resources.sightBlockers);
  checks.push(
    createCheck(
      "actor・beam・sight衝突集合",
      actorColliderSet.size === normalColliderSet.size &&
        beamBlockerSet.size === normalColliderSet.size &&
        sightBlockerSet.size === normalColliderSet.size &&
        context.resources.normalColliders.every(
          (mesh) =>
            actorColliderSet.has(mesh) &&
            beamBlockerSet.has(mesh) &&
            sightBlockerSet.has(mesh)
        ),
      `actor=${actorColliderSet.size} / beam=${beamBlockerSet.size} / sight=${sightBlockerSet.size} / normal=${normalColliderSet.size}`
    )
  );

  const chestPosition = playerSpawn.add(new Vector3(0, 0.2, 0));
  const outsidePosition = new Vector3(5.5, 0.2, 0);
  const actorWallHit = context.queries.castActorSegment(
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
      storageMaximumEyeHit: context.queries.castActorSegment(
        storageFoot,
        storageMaximumEye
      ),
      landingUndersideHit: context.queries.castActorSegment(
        landingFoot,
        storageFoot
      ),
      landingMaximumEyeHit: context.queries.castActorSegment(
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
      "3階段の倉庫・踊り場最大視点高",
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
        projectedSpawn.x - playerSpawn.x,
        projectedSpawn.z - playerSpawn.z
      )
    : Number.POSITIVE_INFINITY;
  const projectedSpawnVerticalError = projectedSpawn
    ? Math.abs(projectedSpawn.y - playerSpawn.y)
    : Number.POSITIVE_INFINITY;
  checks.push(
    createCheck(
      "NavMesh復元とスポーン投影",
      projectedSpawn !== null &&
        projectedSpawnHorizontalError <= 1e-5 &&
        projectedSpawnVerticalError <= 0.02,
      projectedSpawn
        ? `projected=(${projectedSpawn.x.toFixed(3)}, ${projectedSpawn.y.toFixed(4)}, ${projectedSpawn.z.toFixed(3)}) / horizontalError=${projectedSpawnHorizontalError.toFixed(6)} / verticalError=${projectedSpawnVerticalError.toFixed(6)}`
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
      activeContext.resources.visualMeshes.length === 309 &&
      activeContext.resources.normalColliders.length === 160;
    checks.push(
      createCheck(
        "学校コンテキスト再読込",
        reloadMetadataValid,
        `stage=${activeContext.metadata.stageId} / VIS=${activeContext.resources.visualMeshes.length} / COL=${activeContext.resources.normalColliders.length}`
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
