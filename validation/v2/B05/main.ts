import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Logger,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";

import {
  DISTANCE_NAVIGATION_ROUTE_POLICY
} from "../../../src/world/navigationWorld";
import type {
  HumanNavRoomVariantSelection
} from "../../../src/world/humanNavTileBundle";
import { SCHOOL_STAGE } from "../../../src/world/stageCatalog";
import {
  STAGE_LOCATION_FLOOR_IDS,
  type StageLocationAssetRegistry,
  type StageLocationFloorId
} from "../../../src/world/stageLocationAssets";
import {
  SCHOOL_ALL_DISORDERED_ROOM_VARIANT_SELECTIONS,
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicSpatialInitializationDescriptor
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  createStageSpatialSession,
  loadStageStaticSpatialResources,
  type OwnedStageStaticSpatialResources,
  type StageSpatialSession
} from "../../../src/world/stageSpatialContext";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import {
  runLocationAssetLoaderRejectionAcceptance
} from "./locationAssetLoaderRejectionAcceptance";
import {
  runLocationAssetRegistryAcceptance
} from "./locationAssetRegistryAcceptance";

type CheckResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type B05Inventory = Readonly<{
  floorMaps: number;
  minimapBarriers: number;
  minimapPassages: number;
  areas: number;
  areaPieces: number;
  missionLocations: number;
  stairLandings: number;
  elevatorLandings: number;
  broadcastConsoles: number;
  normalReachableAnchors: number;
  disorderedReachableAnchors: number;
}>;

type B05ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly CheckResult[];
  inventory: B05Inventory | null;
  activeFloor: StageLocationFloorId;
}>;

type VisualCategory =
  | "map"
  | "areas"
  | "mission"
  | "stairs"
  | "elevators"
  | "broadcast";

type VisualEntry = Readonly<{
  mesh: Mesh;
  category: VisualCategory;
  floorIds: readonly StageLocationFloorId[];
  ownedByFixture: boolean;
}>;

type ReachabilityResult = Readonly<{
  projected: number;
  reachable: number;
}>;

declare global {
  interface Window {
    __B05_VALIDATION__: B05ValidationState;
  }
}

const EXPECTED_FLOOR_ORDERS = Object.freeze([1, 2, 3, 4, 5]);
const EXPECTED_AREA_PRIORITIES = Object.freeze([100, 200, 250, 300, 400]);
const EXPECTED_MISSION_LOCATION_COUNT = 25;
const DOOR_FIXTURE_SEED = 2;
const NAVIGATION_PROJECTION_DISTANCE =
  0.25 * BLENDER_METERS_TO_WORLD_UNITS;
const PLAYER_PROJECTION_DISTANCE =
  0.5 * BLENDER_METERS_TO_WORLD_UNITS;

const requireElement = <ElementType extends Element>(
  selector: string
): ElementType => {
  const element = document.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`B05検証UIの必須要素がありません: ${selector}`);
  }
  return element;
};

const canvas = requireElement<Element>(
  "#render-canvas"
) as unknown as HTMLCanvasElement;
const summary = requireElement<HTMLElement>("#summary");
const metrics = requireElement<HTMLDListElement>("#metrics");
const checkResults = requireElement<HTMLOListElement>("#check-results");
const runButton = requireElement<HTMLButtonElement>("#run-validation");
const floorCaption = requireElement<HTMLElement>("#floor-caption");
const floorButtons = Object.freeze(
  [...document.querySelectorAll<HTMLButtonElement>("[data-floor-id]")]
);
const categoryInputs = Object.freeze(
  [
    ...document.querySelectorAll<HTMLInputElement>(
      "[data-visual-category]"
    )
  ]
);

if (floorButtons.length !== STAGE_LOCATION_FLOOR_IDS.length) {
  throw new Error(
    `B05階タブ数が不正です: ${floorButtons.length}/` +
      `${STAGE_LOCATION_FLOOR_IDS.length}`
  );
}

const isFloorId = (value: string | undefined): value is StageLocationFloorId =>
  STAGE_LOCATION_FLOOR_IDS.includes(value as StageLocationFloorId);

const isVisualCategory = (
  value: string | undefined
): value is VisualCategory =>
  value === "map" ||
  value === "areas" ||
  value === "mission" ||
  value === "stairs" ||
  value === "elevators" ||
  value === "broadcast";

for (const button of floorButtons) {
  if (!isFloorId(button.dataset.floorId)) {
    throw new Error(`B05階タブIDが不正です: ${button.dataset.floorId ?? "なし"}`);
  }
}
for (const input of categoryInputs) {
  if (!isVisualCategory(input.dataset.visualCategory)) {
    throw new Error(
      `B05表示レイヤーIDが不正です: ` +
        `${input.dataset.visualCategory ?? "なし"}`
    );
  }
}

let activeFloor: StageLocationFloorId = "f01";
let validationRunning = false;
let validationHasRun = false;
let activeContext: StageSpatialSession | null = null;
let activeStatic: OwnedStageStaticSpatialResources | null = null;
let activeInventory: B05Inventory | null = null;
let visualEntries: VisualEntry[] = [];
let debugMaterials: StandardMaterial[] = [];

const browserErrors: string[] = [];
const browserWarnings: string[] = [];

window.__B05_VALIDATION__ = Object.freeze({
  status: "running",
  checks: Object.freeze([]),
  inventory: null,
  activeFloor
});
document.documentElement.dataset.validationStatus = "running";
document.body.dataset.activeFloor = activeFloor;

const formatIssue = (value: unknown) =>
  value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value);

const createCheck = (
  name: string,
  ok: boolean,
  detail: string
): CheckResult => Object.freeze({ name, ok, detail });

const renderChecks = (checks: readonly CheckResult[]) => {
  checkResults.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.dataset.state = check.ok ? "passed" : "failed";
      const heading = document.createElement("strong");
      heading.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name}`;
      const detail = document.createElement("span");
      detail.textContent = check.detail;
      item.append(heading, detail);
      return item;
    })
  );
};

const renderMetrics = (inventory: B05Inventory | null) => {
  if (!inventory) {
    metrics.replaceChildren();
    return;
  }
  const entries = [
    ["Floor Map", String(inventory.floorMaps)],
    ["Map Barrier", String(inventory.minimapBarriers)],
    ["Map Passage", String(inventory.minimapPassages)],
    ["論理Area / piece", `${inventory.areas} / ${inventory.areaPieces}`],
    ["Mission Location", String(inventory.missionLocations)],
    ["階段踊り場", String(inventory.stairLandings)],
    ["エレベーター乗場", String(inventory.elevatorLandings)],
    ["放送卓", String(inventory.broadcastConsoles)],
    [
      "通常版到達Anchor",
      `${inventory.normalReachableAnchors}/${inventory.missionLocations}`
    ],
    [
      "荒れ版到達Anchor",
      `${inventory.disorderedReachableAnchors}/${inventory.missionLocations}`
    ]
  ] as const;
  metrics.replaceChildren(
    ...entries.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const definition = document.createElement("dd");
      definition.textContent = value;
      return [term, definition];
    })
  );
};

const renderSummary = (
  status: B05ValidationState["status"],
  checks: readonly CheckResult[]
) => {
  const passed = checks.filter((check) => check.ok).length;
  summary.dataset.state = status;
  if (status === "running") {
    summary.textContent = "学校GLBとB05意味資産を検証しています。";
    return;
  }
  summary.textContent =
    `${passed} / ${checks.length} 項目がPASSしました。`;
};

const publishValidationState = (
  status: B05ValidationState["status"],
  checks: readonly CheckResult[],
  inventory: B05Inventory | null
) => {
  const frozenChecks = Object.freeze([...checks]);
  activeInventory = inventory;
  window.__B05_VALIDATION__ = Object.freeze({
    status,
    checks: frozenChecks,
    inventory,
    activeFloor
  });
  document.documentElement.dataset.validationStatus = status;
  renderChecks(frozenChecks);
  renderMetrics(inventory);
  renderSummary(status, frozenChecks);
};

const failCompletedValidation = (detail: string) => {
  if (document.documentElement.dataset.validationStatus !== "passed") {
    return;
  }
  const checks = Object.freeze([
    ...window.__B05_VALIDATION__.checks,
    createCheck("完了後ブラウザ異常監視", false, detail)
  ]);
  publishValidationState("failed", checks, activeInventory);
};

window.addEventListener("error", (event) => {
  const detail = formatIssue(event.error ?? event.message);
  browserErrors.push(detail);
  failCompletedValidation(`error: ${detail}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const detail = formatIssue(event.reason);
  browserErrors.push(detail);
  failCompletedValidation(`unhandledrejection: ${detail}`);
});
const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  const detail = values.map(formatIssue).join(" ");
  browserErrors.push(detail);
  failCompletedValidation(`console.error: ${detail}`);
  originalConsoleError(...values);
};
const originalConsoleWarn = console.warn.bind(console);
console.warn = (...values: unknown[]) => {
  const detail = values.map(formatIssue).join(" ");
  browserWarnings.push(detail);
  failCompletedValidation(`console.warn: ${detail}`);
  originalConsoleWarn(...values);
};

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.012, 0.03, 0.05, 1);

const camera = new ArcRotateCamera(
  "B05MapCamera",
  -Math.PI / 2,
  0.18,
  8,
  Vector3.Zero(),
  scene
);
camera.attachControl(canvas, true);
camera.lowerBetaLimit = 0.04;
camera.upperBetaLimit = Math.PI / 2.1;
camera.lowerRadiusLimit = 1;
camera.upperRadiusLimit = 30;
camera.wheelPrecision = 20;
camera.panningSensibility = 80;

const light = new HemisphericLight(
  "B05MapLight",
  new Vector3(-0.35, 1, -0.25),
  scene
);
light.intensity = 1.35;

const categoryInputById = new Map<VisualCategory, HTMLInputElement>();
for (const input of categoryInputs) {
  const category = input.dataset.visualCategory;
  if (!isVisualCategory(category)) {
    throw new Error(`B05表示レイヤーIDが不正です: ${category ?? "なし"}`);
  }
  categoryInputById.set(category, input);
}

const floorDisplayNames = new Map<StageLocationFloorId, string>([
  ["f01", "1F"],
  ["f02", "2F"],
  ["f03", "3F"],
  ["f04", "4F"],
  ["roof", "屋上"]
]);

const requireLocationAssets = (
  context: StageSpatialSession
): StageLocationAssetRegistry => {
  if (!context.locationAssets) {
    throw new Error("学校StageSpatialSessionにlocationAssetsがありません。");
  }
  return context.locationAssets;
};

const createDebugMaterial = (
  name: string,
  color: Color3,
  alpha = 1,
  wireframe = false
) => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(alpha < 1 ? 0.25 : 0.45);
  material.specularColor = Color3.Black();
  material.alpha = alpha;
  material.backFaceCulling = false;
  material.wireframe = wireframe;
  if (alpha < 1) {
    material.disableDepthWrite = true;
  }
  debugMaterials.push(material);
  return material;
};

const registerVisual = (
  mesh: Mesh,
  category: VisualCategory,
  floorIds: readonly StageLocationFloorId[],
  ownedByFixture: boolean
) => {
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  mesh.alwaysSelectAsActiveMesh = true;
  visualEntries.push(
    Object.freeze({
      mesh,
      category,
      floorIds: Object.freeze([...floorIds]),
      ownedByFixture
    })
  );
};

const resolveElevatorFloor = (
  context: StageSpatialSession,
  elevatorId: string
): StageLocationFloorId => {
  const locationAssets = requireLocationAssets(context);
  const elevator = context.elevatorAssets.getById(elevatorId);
  if (!elevator) {
    throw new Error(`Area pieceのelevator参照がありません: ${elevatorId}`);
  }
  const floorMap = locationAssets.floorMaps.find(
    (candidate) => candidate.order === elevator.initialStop.floorIndex
  );
  if (!floorMap) {
    throw new Error(
      `Elevator初期stopに対応するMap階がありません: ` +
        `${elevatorId}/${elevator.initialStop.floorIndex}`
    );
  }
  return floorMap.floorId;
};

const resolveBroadcastFloor = (
  locationAssets: StageLocationAssetRegistry
): StageLocationFloorId => {
  const floorId = locationAssets.broadcastConsole.floorId;
  if (!locationAssets.getFloorMap(floorId)) {
    throw new Error(`放送卓が未登録Map階を参照しています: ${floorId}`);
  }
  return floorId;
};

const prepareVisualization = (context: StageSpatialSession) => {
  const locationAssets = requireLocationAssets(context);
  const mapMaterial = createDebugMaterial(
    "B05_Map",
    Color3.FromHexString("#73dcff"),
    0.72
  );
  const priorityColors = new Map<number, Color3>([
    [400, Color3.FromHexString("#ad65ff")],
    [300, Color3.FromHexString("#38c9f0")],
    [250, Color3.FromHexString("#ffb13b")],
    [200, Color3.FromHexString("#52d27f")],
    [100, Color3.FromHexString("#8094a3")]
  ]);
  const areaMaterials = new Map<number, StandardMaterial>();
  const materialForAreaPriority = (priority: number) => {
    const existing = areaMaterials.get(priority);
    if (existing) {
      return existing;
    }
    const color = priorityColors.get(priority);
    if (!color) {
      throw new Error(`未登録のArea優先度です: ${priority}`);
    }
    const material = createDebugMaterial(
      `B05_Area_${priority}`,
      color,
      0.22
    );
    areaMaterials.set(priority, material);
    return material;
  };
  const missionMaterial = createDebugMaterial(
    "B05_MissionAnchor",
    Color3.FromHexString("#ff4ec7")
  );
  const stairMaterials = new Map([
    [
      "up",
      createDebugMaterial("B05_StairUp", Color3.FromHexString("#35ef89"))
    ],
    [
      "down",
      createDebugMaterial("B05_StairDown", Color3.FromHexString("#ff8a3d"))
    ],
    [
      "both",
      createDebugMaterial("B05_StairBoth", Color3.FromHexString("#ffe65e"))
    ]
  ] as const);
  const elevatorAvailableMaterial = createDebugMaterial(
    "B05_ElevatorAvailable",
    Color3.FromHexString("#21e4d3")
  );
  const elevatorUnavailableMaterial = createDebugMaterial(
    "B05_ElevatorUnavailable",
    Color3.FromHexString("#ff526c")
  );
  const broadcastMaterial = createDebugMaterial(
    "B05_BroadcastTarget",
    Color3.FromHexString("#fff56b"),
    0.9,
    true
  );

  for (const visualMesh of context.resources.visualMeshes) {
    visualMesh.setEnabled(false);
  }

  for (const floorMap of locationAssets.floorMaps) {
    floorDisplayNames.set(floorMap.floorId, floorMap.displayName);
    floorMap.mesh.material = mapMaterial;
    floorMap.mesh.isVisible = true;
    floorMap.mesh.visibility = 1;
    floorMap.mesh.renderingGroupId = 0;
    floorMap.mesh.enableEdgesRendering();
    floorMap.mesh.edgesWidth = 1.5;
    floorMap.mesh.edgesColor = new Color4(0.6, 0.93, 1, 0.95);
    registerVisual(floorMap.mesh, "map", [floorMap.floorId], false);
  }
  for (const barrier of locationAssets.minimapBarriers) {
    barrier.mesh.material = mapMaterial;
    barrier.mesh.isVisible = true;
    barrier.mesh.visibility = 1;
    barrier.mesh.renderingGroupId = 0;
    barrier.mesh.enableEdgesRendering();
    barrier.mesh.edgesWidth = 2.0;
    barrier.mesh.edgesColor = new Color4(0.02, 0.04, 0.06, 1);
    registerVisual(barrier.mesh, "map", [barrier.floorId], false);
  }
  for (const passage of locationAssets.minimapPassages) {
    passage.mesh.material = mapMaterial;
    passage.mesh.isVisible = true;
    passage.mesh.visibility = 1;
    passage.mesh.renderingGroupId = 1;
    passage.mesh.enableEdgesRendering();
    passage.mesh.edgesWidth = 2.0;
    passage.mesh.edgesColor = new Color4(1, 0.94, 0.5, 1);
    registerVisual(passage.mesh, "map", [passage.floorId], false);
  }

  for (const area of locationAssets.areas) {
    for (const piece of area.pieces) {
      const floorId =
        piece.floorBinding.kind === "fixed"
          ? piece.floorBinding.floorId
          : resolveElevatorFloor(context, piece.floorBinding.elevatorId);
      piece.mesh.material = materialForAreaPriority(area.priority);
      piece.mesh.isVisible = true;
      piece.mesh.visibility = 1;
      piece.mesh.renderingGroupId = 1;
      registerVisual(piece.mesh, "areas", [floorId], false);
    }
  }

  for (const location of locationAssets.missionLocations) {
    location.anchorNode.computeWorldMatrix(true);
    const marker = MeshBuilder.CreateSphere(
      `B05_Mission_${location.id}`,
      { diameter: 0.12, segments: 12 },
      scene
    );
    marker.position.copyFrom(location.anchorNode.getAbsolutePosition());
    marker.position.y += 0.09;
    marker.material = missionMaterial;
    marker.renderingGroupId = 2;
    registerVisual(marker, "mission", [location.floorId], true);
  }

  for (const landing of locationAssets.stairLandings) {
    landing.node.computeWorldMatrix(true);
    const marker = MeshBuilder.CreateCylinder(
      `B05_Stair_${landing.id}`,
      {
        diameter: landing.direction === "both" ? 0.16 : 0.15,
        height: 0.035,
        tessellation: landing.direction === "both" ? 6 : 3
      },
      scene
    );
    marker.position.copyFrom(landing.node.getAbsolutePosition());
    marker.position.y += 0.105;
    marker.rotation.y = landing.direction === "down" ? Math.PI : 0;
    marker.material = stairMaterials.get(landing.direction)!;
    marker.renderingGroupId = 2;
    registerVisual(marker, "stairs", [landing.floorId], true);
  }

  for (const landing of locationAssets.elevatorLandings) {
    landing.node.computeWorldMatrix(true);
    const marker = MeshBuilder.CreateCylinder(
      `B05_Elevator_${landing.id}`,
      {
        diameter: 0.16,
        height: 0.045,
        tessellation: landing.available ? 8 : 4
      },
      scene
    );
    marker.position.copyFrom(landing.node.getAbsolutePosition());
    marker.position.y += 0.12;
    marker.material = landing.available
      ? elevatorAvailableMaterial
      : elevatorUnavailableMaterial;
    marker.renderingGroupId = 2;
    registerVisual(marker, "elevators", [landing.floorId], true);
  }

  const broadcastFloor = resolveBroadcastFloor(locationAssets);
  const broadcastConsole = locationAssets.broadcastConsole;
  broadcastConsole.targetMesh.material = broadcastMaterial;
  broadcastConsole.targetMesh.isVisible = true;
  broadcastConsole.targetMesh.visibility = 1;
  broadcastConsole.targetMesh.renderingGroupId = 2;
  registerVisual(
    broadcastConsole.targetMesh,
    "broadcast",
    [broadcastFloor],
    false
  );
  broadcastConsole.markerNode.computeWorldMatrix(true);
  const broadcastMarker = MeshBuilder.CreateSphere(
    `B05_Broadcast_${broadcastConsole.id}`,
    { diameter: 0.14, segments: 12 },
    scene
  );
  broadcastMarker.position.copyFrom(
    broadcastConsole.markerNode.getAbsolutePosition()
  );
  broadcastMarker.position.y += 0.1;
  broadcastMarker.material = broadcastMaterial;
  broadcastMarker.renderingGroupId = 2;
  registerVisual(broadcastMarker, "broadcast", [broadcastFloor], true);
};

const updatePublishedFloor = () => {
  const currentState = window.__B05_VALIDATION__;
  window.__B05_VALIDATION__ = Object.freeze({
    ...currentState,
    activeFloor
  });
  document.body.dataset.activeFloor = activeFloor;
};

const frameActiveFloor = () => {
  if (!activeContext) {
    return;
  }
  const floorMap = requireLocationAssets(activeContext).getFloorMap(activeFloor);
  if (!floorMap) {
    throw new Error(`表示階のMapがありません: ${activeFloor}`);
  }
  floorMap.mesh.computeWorldMatrix(true);
  const bounds = floorMap.mesh.getBoundingInfo().boundingBox;
  const center = bounds.centerWorld.clone();
  const width = bounds.maximumWorld.x - bounds.minimumWorld.x;
  const depth = bounds.maximumWorld.z - bounds.minimumWorld.z;
  const span = Math.max(width, depth, 1);
  camera.alpha = -Math.PI / 2;
  camera.beta = 0.18;
  camera.setTarget(center);
  camera.radius = Math.max(3.5, span * 1.05);
  camera.lowerRadiusLimit = Math.max(1, span * 0.25);
  camera.upperRadiusLimit = Math.max(15, span * 2.5);
};

const refreshVisualization = (frameCamera: boolean) => {
  for (const entry of visualEntries) {
    const input = categoryInputById.get(entry.category);
    if (!input) {
      throw new Error(`表示レイヤー入力がありません: ${entry.category}`);
    }
    entry.mesh.setEnabled(
      input.checked && entry.floorIds.includes(activeFloor)
    );
  }
  for (const button of floorButtons) {
    const floorId = button.dataset.floorId;
    if (!isFloorId(floorId)) {
      throw new Error(`B05階タブIDが不正です: ${floorId ?? "なし"}`);
    }
    const selected = floorId === activeFloor;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.textContent = floorDisplayNames.get(floorId) ?? floorId;
  }
  floorCaption.textContent =
    `${floorDisplayNames.get(activeFloor) ?? activeFloor} 俯瞰`;
  updatePublishedFloor();
  if (frameCamera) {
    frameActiveFloor();
  }
};

const disposeVisualization = () => {
  for (const entry of visualEntries) {
    if (entry.ownedByFixture) {
      entry.mesh.dispose();
    }
  }
  visualEntries = [];
  activeContext?.dispose();
  activeContext = null;
  activeStatic?.dispose();
  activeStatic = null;
  for (const material of debugMaterials) {
    material.dispose();
  }
  debugMaterials = [];
};

const validateReachability = (
  context: StageSpatialSession
): ReachabilityResult => {
  const locationAssets = requireLocationAssets(context);
  const playerSpawn = context.playerSpawns.getById("player-spawn-main");
  if (!playerSpawn) {
    throw new Error("B05到達性検証のPlayer開始地点がありません。");
  }
  playerSpawn.marker.node.computeWorldMatrix(true);
  const start = context.navigation.projectPoint(
    playerSpawn.marker.node.getAbsolutePosition(),
    PLAYER_PROJECTION_DISTANCE
  );
  if (!start) {
    throw new Error("B05到達性検証のPlayer開始地点をNavMeshへ投影できません。");
  }

  let projected = 0;
  let reachable = 0;
  for (const location of locationAssets.missionLocations) {
    location.anchorNode.computeWorldMatrix(true);
    const destination = context.navigation.projectPoint(
      location.anchorNode.getAbsolutePosition(),
      NAVIGATION_PROJECTION_DISTANCE
    );
    if (!destination) {
      continue;
    }
    projected += 1;
    const path = context.navigation.findPath(
      start,
      destination,
      "player",
      DISTANCE_NAVIGATION_ROUTE_POLICY
    );
    if (path) {
      reachable += 1;
    }
  }
  return Object.freeze({ projected, reachable });
};

const validateRegistry = (
  context: StageSpatialSession,
  checks: CheckResult[]
) => {
  const locationAssets = requireLocationAssets(context);
  const areaPieces = locationAssets.areas.flatMap((area) => area.pieces);
  const floorIds = locationAssets.floorMaps.map((floorMap) => floorMap.floorId);
  const floorOrders = locationAssets.floorMaps.map((floorMap) => floorMap.order);
  const areaIds = locationAssets.areas.map((area) => area.id);
  const pieceIds = areaPieces.map((piece) => piece.id);
  const missionIds = locationAssets.missionLocations.map(
    (location) => location.id
  );
  const stairIds = locationAssets.stairLandings.map((landing) => landing.id);
  const elevatorIds = locationAssets.elevatorLandings.map(
    (landing) => landing.id
  );
  const unique = (values: readonly string[]) =>
    new Set(values).size === values.length;

  checks.push(
    createCheck(
      "学校Location意味資産registry",
      context.stage.locationAssetsMode === "required" &&
        context.metadata.schemaVersion === 3,
      `mode=${context.stage.locationAssetsMode} / ` +
        `schema=${context.metadata.schemaVersion}`
    ),
    createCheck(
      "5階層Map目録",
      locationAssets.floorMaps.length === 5 &&
        STAGE_LOCATION_FLOOR_IDS.every((floorId) =>
          floorIds.includes(floorId)
        ) &&
        EXPECTED_FLOOR_ORDERS.every(
          (order, index) => floorOrders[index] === order
        ) &&
        locationAssets.floorMaps.every(
          (floorMap) =>
            floorMap.displayName.length > 0 &&
            floorMap.mesh.getTotalVertices() > 0 &&
            locationAssets.getFloorMap(floorMap.floorId) === floorMap
        ),
      `count=${locationAssets.floorMaps.length} / ` +
        `floors=${floorIds.join(",")} / orders=${floorOrders.join(",")}`
    ),
    createCheck(
      "全5階のBarrier・Passage意味資産",
      locationAssets.minimapBarriers.length === 5 &&
        locationAssets.minimapPassages.length === 5 &&
        STAGE_LOCATION_FLOOR_IDS.every(
          (floorId) =>
            locationAssets.getMinimapBarriers(floorId).length > 0 &&
            locationAssets.getMinimapPassages(floorId).length > 0
        ) &&
        [...locationAssets.minimapBarriers, ...locationAssets.minimapPassages].every(
          (asset) => asset.mesh.getTotalVertices() > 0
        ),
      `barriers=${locationAssets.minimapBarriers.length} / ` +
        `passages=${locationAssets.minimapPassages.length}`
    ),
    createCheck(
      "53論理Areaと85 piece参照",
      locationAssets.areas.length === 53 &&
        areaPieces.length === 85 &&
        unique(areaIds) &&
        unique(pieceIds) &&
        locationAssets.areas.every(
          (area) =>
            area.displayName.length > 0 &&
            EXPECTED_AREA_PRIORITIES.includes(area.priority) &&
            area.pieces.length > 0 &&
            locationAssets.getAreaById(area.id) === area &&
            area.pieces.every(
              (piece) =>
                piece.areaId === area.id &&
                piece.mesh.getTotalVertices() > 0 &&
                (piece.floorBinding.kind === "fixed"
                  ? locationAssets.getFloorMap(piece.floorBinding.floorId) !==
                    null
                  : context.elevatorAssets.getById(
                      piece.floorBinding.elevatorId
                    ) !== null)
            )
        ),
      `areas=${locationAssets.areas.length} / pieces=${areaPieces.length} / ` +
        `priorities=${[
          ...new Set(locationAssets.areas.map((area) => area.priority))
        ]
          .sort((left, right) => left - right)
          .join(",")}`
    )
  );

  const missionReferencesValid = locationAssets.missionLocations.every(
    (location) => {
      location.anchorNode.computeWorldMatrix(true);
      const areaHit = locationAssets.findArea(
        location.anchorNode.getAbsolutePosition()
      );
      return (
        location.displayName.length > 0 &&
        location.volumeMesh.getTotalVertices() > 0 &&
        locationAssets.getFloorMap(location.floorId) !== null &&
        locationAssets.getAreaById(location.area.id) === location.area &&
        locationAssets.getMissionLocationById(location.id) === location &&
        areaHit?.area === location.area &&
        areaHit.floorId === location.floorId
      );
    }
  );
  checks.push(
    createCheck(
      "25 Mission Location参照",
      locationAssets.missionLocations.length ===
        EXPECTED_MISSION_LOCATION_COUNT &&
        unique(missionIds) &&
        missionReferencesValid,
      `count=${locationAssets.missionLocations.length} / ` +
        `unique=${unique(missionIds)} / references=${missionReferencesValid}`
    ),
    createCheck(
      "17階段踊り場",
      locationAssets.stairLandings.length === 17 &&
        unique(stairIds) &&
        locationAssets.stairLandings.every(
          (landing) =>
            locationAssets.getFloorMap(landing.floorId) !== null &&
            (landing.direction === "up" ||
              landing.direction === "down" ||
              landing.direction === "both")
        ),
      `count=${locationAssets.stairLandings.length} / ` +
        `directions=${locationAssets.stairLandings
          .map((landing) => landing.direction)
          .join(",")}`
    )
  );

  const expectedElevatorAvailability = new Map<
    StageLocationFloorId,
    boolean
  >([
    ["f01", true],
    ["f02", false],
    ["f03", false],
    ["f04", true]
  ]);
  const elevatorReferencesValid = locationAssets.elevatorLandings.every(
    (landing) => {
      const expectedAvailable = expectedElevatorAvailability.get(
        landing.floorId
      );
      const floorMap = locationAssets.getFloorMap(landing.floorId);
      return (
        expectedAvailable !== undefined &&
        landing.available === expectedAvailable &&
        (landing.stop !== null) === expectedAvailable &&
        context.elevatorAssets.getById(landing.elevatorId) !== null &&
        floorMap !== null &&
        (landing.stop === null || landing.stop.floorIndex === floorMap.order)
      );
    }
  );
  checks.push(
    createCheck(
      "4エレベーター乗場の利用可否・stop参照",
      locationAssets.elevatorLandings.length === 4 &&
        unique(elevatorIds) &&
        new Set(
          locationAssets.elevatorLandings.map((landing) => landing.floorId)
        ).size === 4 &&
        elevatorReferencesValid,
      `count=${locationAssets.elevatorLandings.length} / ` +
        `landings=${locationAssets.elevatorLandings
          .map(
            (landing) =>
              `${landing.floorId}:${landing.available ? "available" : "unavailable"}:` +
              `${landing.stop?.id ?? "stopなし"}`
          )
          .join(" | ")}`
    )
  );

  const broadcastConsole = locationAssets.broadcastConsole;
  const broadcastFloor = resolveBroadcastFloor(locationAssets);
  checks.push(
    createCheck(
      "放送卓Marker・正面Ray target",
      broadcastConsole.id.length > 0 &&
        broadcastConsole.displayName.length > 0 &&
        broadcastConsole.targetMesh.getTotalVertices() > 0 &&
        locationAssets.getFloorMap(broadcastFloor) !== null,
      `id=${broadcastConsole.id} / floor=${broadcastFloor} / ` +
        `target=${broadcastConsole.targetMesh.name}`
    ),
    createCheck(
      "Area被覆・同順位重複・厳格参照",
      true,
      "registry組立時のNavMesh全面被覆、正体積重複、未知role、参照欠落検証を通過"
    )
  );

  return Object.freeze({
    floorMaps: locationAssets.floorMaps.length,
    minimapBarriers: locationAssets.minimapBarriers.length,
    minimapPassages: locationAssets.minimapPassages.length,
    areas: locationAssets.areas.length,
    areaPieces: areaPieces.length,
    missionLocations: locationAssets.missionLocations.length,
    stairLandings: locationAssets.stairLandings.length,
    elevatorLandings: locationAssets.elevatorLandings.length,
    broadcastConsoles: 1
  });
};

const loadSchoolContext = async (
  targetScene: Scene,
  roomVariantSelections: readonly HumanNavRoomVariantSelection[]
) => {
  let staticResources: OwnedStageStaticSpatialResources | null = null;
  let context: StageSpatialSession | null = null;
  try {
    staticResources = await loadStageStaticSpatialResources(targetScene, SCHOOL_STAGE);
    context = await createStageSpatialSession(staticResources, {
      dynamicSpatialInitialization:
        createSchoolStageDynamicSpatialInitializationDescriptor(DOOR_FIXTURE_SEED),
      roomVariantSelections
    });
    return Object.freeze({ staticResources, context });
  } catch (error) {
    context?.dispose();
    staticResources?.dispose();
    throw error;
  }
};

const runValidation = async () => {
  if (validationRunning) {
    return;
  }
  validationRunning = true;
  if (validationHasRun) {
    browserErrors.length = 0;
    browserWarnings.length = 0;
  }
  validationHasRun = true;
  runButton.disabled = true;
  activeInventory = null;
  publishValidationState("running", [], null);
  disposeVisualization();

  const loggerErrorsAtStart = Logger.errorsCount;
  const checks: CheckResult[] = [];
  let inventoryBase:
    | Readonly<{
        floorMaps: number;
        minimapBarriers: number;
        minimapPassages: number;
        areas: number;
        areaPieces: number;
        missionLocations: number;
        stairLandings: number;
        elevatorLandings: number;
        broadcastConsoles: number;
      }>
    | null = null;
  let normalReachability: ReachabilityResult = Object.freeze({
    projected: 0,
    reachable: 0
  });
  let disorderedReachability: ReachabilityResult = Object.freeze({
    projected: 0,
    reachable: 0
  });

  try {
    checks.push(...(await runLocationAssetRegistryAcceptance()));
    checks.push(...(await runLocationAssetLoaderRejectionAcceptance()));
    const activeSchool = await loadSchoolContext(
      scene,
      SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
    );
    activeStatic = activeSchool.staticResources;
    activeContext = activeSchool.context;
    await scene.whenReadyAsync(true);
    inventoryBase = validateRegistry(activeContext, checks);
    normalReachability = validateReachability(activeContext);
    checks.push(
      createCheck(
        "通常版25 Anchor到達性",
        normalReachability.projected === EXPECTED_MISSION_LOCATION_COUNT &&
          normalReachability.reachable === EXPECTED_MISSION_LOCATION_COUNT,
        `projected=${normalReachability.projected}/` +
          `${EXPECTED_MISSION_LOCATION_COUNT} / reachable=` +
          `${normalReachability.reachable}/${EXPECTED_MISSION_LOCATION_COUNT}`
      )
    );

    const disorderedScene = new Scene(engine);
    let disorderedContext: StageSpatialSession | null = null;
    let disorderedStatic: OwnedStageStaticSpatialResources | null = null;
    try {
      const disorderedSchool = await loadSchoolContext(
        disorderedScene,
        SCHOOL_ALL_DISORDERED_ROOM_VARIANT_SELECTIONS
      );
      disorderedStatic = disorderedSchool.staticResources;
      disorderedContext = disorderedSchool.context;
      await disorderedScene.whenReadyAsync(true);
      disorderedReachability = validateReachability(disorderedContext);
      checks.push(
        createCheck(
          "荒れ版25 Anchor到達性",
          disorderedReachability.projected ===
            EXPECTED_MISSION_LOCATION_COUNT &&
            disorderedReachability.reachable ===
              EXPECTED_MISSION_LOCATION_COUNT,
          `projected=${disorderedReachability.projected}/` +
            `${EXPECTED_MISSION_LOCATION_COUNT} / reachable=` +
            `${disorderedReachability.reachable}/` +
            `${EXPECTED_MISSION_LOCATION_COUNT}`
        )
      );
    } finally {
      disorderedContext?.dispose();
      disorderedStatic?.dispose();
      disorderedScene.dispose();
    }

    prepareVisualization(activeContext);
    refreshVisualization(true);
  } catch (error) {
    checks.push(createCheck("B05検証処理", false, formatIssue(error)));
    disposeVisualization();
  }

  const loggerErrorCount = Logger.errorsCount - loggerErrorsAtStart;
  checks.push(
    createCheck(
      "ブラウザ・console・Babylon異常監視",
      browserErrors.length === 0 &&
        browserWarnings.length === 0 &&
        loggerErrorCount === 0,
      `Babylon Logger=${loggerErrorCount} / ` +
        `errors=${browserErrors.join(" | ") || "なし"} / ` +
        `warnings=${browserWarnings.join(" | ") || "なし"}`
    )
  );

  const inventory = inventoryBase
    ? Object.freeze({
        ...inventoryBase,
        normalReachableAnchors: normalReachability.reachable,
        disorderedReachableAnchors: disorderedReachability.reachable
      })
    : null;
  const status = checks.every((check) => check.ok) ? "passed" : "failed";
  publishValidationState(status, checks, inventory);
  validationRunning = false;
  runButton.disabled = false;
};

for (const button of floorButtons) {
  button.addEventListener("click", () => {
    const floorId = button.dataset.floorId;
    if (!isFloorId(floorId)) {
      throw new Error(`B05階タブIDが不正です: ${floorId ?? "なし"}`);
    }
    activeFloor = floorId;
    refreshVisualization(true);
  });
}
for (const input of categoryInputs) {
  input.addEventListener("change", () => refreshVisualization(false));
}
runButton.addEventListener("click", () => void runValidation());
window.addEventListener("resize", () => engine.resize());
window.addEventListener("beforeunload", () => disposeVisualization());

engine.runRenderLoop(() => scene.render());
refreshVisualization(false);
void runValidation();
