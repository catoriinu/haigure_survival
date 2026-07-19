import {
  AbstractMesh,
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  Logger,
  Scene,
  Vector3
} from "@babylonjs/core";

import { SCHOOL_STAGE } from "../../../src/world/stageCatalog";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import {
  V2_PLAYER_BASE_EYE_HEIGHT,
  V2_PLAYER_MAX_EYE_HEIGHT_SCALE
} from "../../../src/v2/playerController";
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
      context.resources.visualMeshes.length === 274 &&
        context.resources.normalColliders.length === 147 &&
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
    ["VIS_NorthSouthEntryStep01", [37.4, 26.5, -0.3], [38.4, 32.5, -0.15]],
    ["VIS_NorthSouthEntryStep02", [38.4, 26.5, -0.15], [39.4, 32.5, 0.0]],
    ["COL_NorthSouthEntryRamp", [37.4, 26.5, -0.3], [39.4, 32.5, 0.0]],
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
  checks.push(
    createCheck(
      "学校出入口の共通2段・連続Ramp契約",
      entryBoundsResults.every((result) => result.ok),
      entryBoundsResults
        .map((result) => `${result.name}=${result.ok ? "一致" : result.detail}`)
        .join(" / ")
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
      activeContext.resources.visualMeshes.length === 274 &&
      activeContext.resources.normalColliders.length === 147;
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
