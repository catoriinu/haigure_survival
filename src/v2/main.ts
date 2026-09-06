import {
  Color3,
  Color4,
  Engine,
  Frustum,
  FreeCamera,
  HemisphericLight,
  Ray,
  Scene,
  Vector3
} from "@babylonjs/core";
import type { AbstractMesh } from "@babylonjs/core";

import {
  SCHOOL_STAGE,
  createStageCatalogFingerprint
} from "../world/stageCatalog";
import {
  createSchoolRoomVariantSelections,
  createSchoolRuntimeRandom,
  createSchoolRuntimeSettings
} from "../world/schoolRuntimeSettings";
import { AudioManager } from "../audio/audio";
import {
  V2_AUDIO_ASSET_CATALOG,
  applyV2AudioVolumeLevels,
  createV2GameplayAudioBridge,
  createV2VoiceRuntime,
  getV2VoiceProfileIds
} from "../audio/v2AudioRuntime";
import { V2_PORTRAIT_ASSET_INVENTORY } from "../ui/v2CharacterSettings";
import { createV2TitleSettingsPanel } from "../ui/v2TitleSettingsPanel";
import { createV2TitleLayoutController } from "../ui/v2TitleLayoutController";
import { createTitleOverlayController } from "../ui/titleOverlayController";
import {
  createBrowserV2TitleSettingsStore,
  V2_DEFAULT_TITLE_SETTINGS,
  type V2TitleSettingsRuntimePopulation
} from "../v2TitleSettingsStore";
import {
  canV2RuntimePlayerFire,
  createV2RuntimeHudController
} from "../ui/v2RuntimeHud";
import { createV2MissionHudController } from "../ui/v2MissionHud";
import { createV2PlayerStatusHud } from "../ui/v2PlayerStatusHud";
import { createV2MinimapController } from "../ui/v2Minimap";
import {
  createSchoolStageDynamicRuntime,
  createSchoolStageDynamicSpatialInitializationDescriptor,
  type SchoolStageDynamicRuntime
} from "../world/schoolStageDynamicRuntime";
import { ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS } from "../world/stageElevatorRuntime";
import {
  createStageSpatialSession,
  getStageSpatialOwnershipDiagnostics,
  loadStageStaticSpatialResources,
  type OwnedStageStaticSpatialResources,
  type StageSpatialSession
} from "../world/stageSpatialContext";
import {
  createV2PerformanceDiagnostics,
  createV2SeededRandom,
  readV2PerformanceScenario,
  V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS
} from "./performanceDiagnostics";
import { V2_DEBUG_MODE } from "./debugMode";
import {
  createV2PerformanceStressWorkload,
  type V2StressInput
} from "./performanceStressWorkload";
import {
  createV2AlarmFloorVisualSystem,
  V2_ALARM_FLOOR_VISUALIZATION_ENABLED,
  type V2AlarmFloorVisualSystem
} from "./alarmFloorVisualSystem";
import {
  createV2PlayerController,
  type V2PlayerController
} from "./playerController";
import {
  createV2PlayerCharacterVisual,
  type V2PlayerCharacterVisual
} from "./v2PlayerCharacterVisual";
import {
  createV2PlayerInput,
  type V2PlayerInput
} from "./playerInput";
import {
  dispatchV2RuntimeInteractions,
  resolveV2BroadcastInteractionCandidate,
  resolveV2HorizontalSpeedScale,
  V2_BROADCAST_INTERACTION_DISTANCE,
  type V2RuntimeInteractionFeedback
} from "./runtimeInteraction";
import { dispatchV2RuntimeEndFlow } from "./runtimeEndFlow";
import { resolveV2MissionHudMode } from "./runtimePresentation";
import {
  createV2RuntimeSessionEventScope,
  transitionV2RuntimeSession
} from "./runtimeSessionLifecycle";
import {
  acquireV2ConstructionOwner,
  installV2RuntimeApplicationTermination
} from "./runtimeApplicationLifecycle";
import { createV2RuntimeConstructionRollbackStack } from "./runtimeConstructionRollback";
import {
  assertV2RuntimeConstructionActive,
  replaceV2StageStaticResourceSlot
} from "./stageSessionLifecycle";
import {
  createV2SessionStartSnapshot,
  doV2SessionStartSnapshotsMatch,
  selectV2FailedSessionRetryRequest,
  type V2SessionStartSnapshot,
  type V2TitleStartMode
} from "./titleSettingsSession";
import {
  createV2SurvivalRuntime,
  V2_PERFORMANCE_ACCEPTANCE_POPULATION,
  V2_TEST_SURVIVAL_POPULATION,
  type V2MinimapActorSnapshot,
  type V2SurvivalRuntime
} from "./survivalRuntime";
import { createV2CharacterAssignments } from "./v2CharacterAssignments";
import { resolveV2CharacterFacingYaw } from "./v2CharacterFacing";
import {
  createV2CharacterVisualRuntime,
  type V2CharacterVisualRuntime
} from "./v2CharacterVisualRuntime";
import { configureV2StageTransparentRenderingOrder } from "./v2StageTransparentRenderingOrder";
import {
  createSchoolStageActorPort,
  createSchoolStageTraversalCoordinator,
  type SchoolStageTraversalCoordinator
} from "./schoolStageTraversalCoordinator";
import {
  createSchoolNpcNavigationPolicy,
  type SchoolNpcNavigationPolicy
} from "./schoolNpcNavigationPolicy";
import {
  readV2RuntimeStressScenario,
  type V2RuntimeStressReport
} from "./runtimeStressScenario";
import { resolveV2RoomVariantLevel } from "./roomVariantVisualReview";
import { selectV2PlayerSpawn } from "./schoolSpawnSelection";
import {
  markV2PageUnloading,
  markV2StartupPhase
} from "./startupDiagnostics";

const V2_GAMEPLAY_BASE_HELP_TEXT =
  "操作説明\n" +
  "WASD: 移動  Shift: ダッシュ";
const EMPTY_NPC_COMMAND_CANDIDATES: ReturnType<
  V2SurvivalRuntime["getNpcCommandCandidates"]
> = Object.freeze([]);
const EMPTY_DOOR_INTERACTION_CANDIDATES: ReturnType<
  SchoolStageDynamicRuntime["doors"]["getDoorInteractionCandidates"]
> = Object.freeze([]);
const EMPTY_RUNTIME_INTERACTION_FEEDBACK: readonly V2RuntimeInteractionFeedback[] =
  Object.freeze([]);
const EMPTY_MINIMAP_MISSION_TARGET_IDS: readonly string[] = Object.freeze([]);
const EMPTY_MINIMAP_ACTORS: readonly V2MinimapActorSnapshot[] = Object.freeze(
  []
);

const performanceScenario =
  readV2PerformanceScenario(location.search);
const runtimeStressScenario =
  readV2RuntimeStressScenario(location.search);
const schoolVisualAcceptanceScenario = (() => {
  const parameters = new URLSearchParams(location.search);
  const requested = parameters.get("schoolVisualAcceptance");
  if (requested === null) {
    return null;
  }
  if (requested !== "B06-1") {
    throw new Error(
      "schoolVisualAcceptanceにはB06-1が必要です。"
    );
  }
  const seed = Number(parameters.get("seed") ?? "20260812");
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(
      "schoolVisualAcceptanceのseedには0以上の安全な整数が必要です。"
    );
  }
  return Object.freeze({ id: requested, seed });
})();
const missionAcceptanceScenario = (() => {
  const requested = new URLSearchParams(location.search).get(
    "missionAcceptance"
  );
  if (requested === null || requested === "normal" || requested === "haigure") {
    return requested;
  }
  throw new Error(
    "missionAcceptanceにはnormalまたはhaigureが必要です。"
  );
})();
const elevatorNpcAcceptanceScenario = (() => {
  const parameters = new URLSearchParams(location.search);
  const requested = parameters.get("elevatorAcceptance");
  if (requested === null) {
    return null;
  }
  if (requested !== "T06-4P-2") {
    throw new Error(
      "elevatorAcceptanceにはT06-4P-2が必要です。"
    );
  }
  const seed = Number(parameters.get("seed") ?? "20260821");
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(
      "elevatorAcceptanceのseedには0以上の安全な整数が必要です。"
    );
  }
  const followerCount = Number(parameters.get("followers") ?? "5");
  if (
    !Number.isSafeInteger(followerCount) ||
    followerCount < 1 ||
    followerCount > 5
  ) {
    throw new Error(
      "elevatorAcceptanceのfollowersには1以上5以下の整数が必要です。"
    );
  }
  return Object.freeze({ id: requested, seed, followerCount });
})();
const rampValidationTarget = (() => {
  const requested = new URLSearchParams(location.search).get(
    "rampValidation"
  );
  if (requested === null || requested === "gym" || requested === "school") {
    return requested;
  }
  throw new Error("rampValidationにはgymまたはschoolが必要です。");
})();
if (
  [
    performanceScenario,
    runtimeStressScenario,
    missionAcceptanceScenario,
    elevatorNpcAcceptanceScenario,
    rampValidationTarget
  ].filter((scenario) => scenario !== null).length > 1
) {
  throw new Error(
    "performance、schoolStress、missionAcceptance、elevatorAcceptance、rampValidationは同時に実行できません。"
  );
}
if (
  schoolVisualAcceptanceScenario !== null &&
  [
    performanceScenario,
    runtimeStressScenario,
    missionAcceptanceScenario,
    elevatorNpcAcceptanceScenario,
    rampValidationTarget
  ].some((scenario) => scenario !== null)
) {
  throw new Error(
    "schoolVisualAcceptanceは他の受入シナリオと同時に実行できません。"
  );
}
const fixedRuntimeSeed =
  performanceScenario?.seed ??
  runtimeStressScenario?.seed ??
  schoolVisualAcceptanceScenario?.seed ??
  elevatorNpcAcceptanceScenario?.seed ??
  (missionAcceptanceScenario === null &&
  rampValidationTarget === null
    ? null
    : 0);
const nextRuntimeSessionSeed = () => {
  if (fixedRuntimeSeed !== null) {
    return fixedRuntimeSeed;
  }
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  return entropy[0];
};
const canvas = document.getElementById("renderCanvas") as unknown as HTMLCanvasElement;
const minimapCanvas = document.getElementById(
  "minimapCanvas"
) as unknown as HTMLCanvasElement;
const minimapReadout = document.getElementById("minimapReadout") as HTMLDivElement;
const statusInfo = document.getElementById("statusInfo") as HTMLDivElement;
const helpPanel = document.getElementById("helpPanel") as HTMLDivElement;
helpPanel.dataset.debugMode = String(V2_DEBUG_MODE);
const staminaGauge = document.getElementById("staminaGauge") as HTMLDivElement;
const titleOverlay = document.getElementById("titleOverlay") as HTMLDivElement;
const titleCenterBlock = document.getElementById("titleCenterBlock") as HTMLDivElement;
const titleHeading = document.getElementById("titleHeading") as HTMLDivElement;
const titleVersion = document.getElementById("titleVersion") as HTMLDivElement;
const enableNoGunTouchBrainwashConfirmMessage =
  "「銃なしに触れたら洗脳」をオンにすると、ゲーム起動時の読み込み時間が長くなります。\n" +
  "OKを押すと、オンにしてゲームを再読み込みします。よろしいですか？";
const audioAssets = V2_AUDIO_ASSET_CATALOG;
const titleSettingsStore = createBrowserV2TitleSettingsStore({
  portraitDirectories: V2_PORTRAIT_ASSET_INVENTORY.directories,
  voiceDirectories: audioAssets.voiceDirectories
});
titleSettingsStore.load();
let titleStartMode: V2TitleStartMode = "normal";
const titleOverlayController = createTitleOverlayController({
  defaultModeMessage: "サバイバルモード",
  instantModeMessage: "いきなり公開処刑",
  startHintMessage: "左クリック：開始",
  loadingMessageBase: "NOW LOADING",
  loadingDotIntervalMs: 300
});

const createSessionStartSnapshot = (
  sessionSeed: number
): V2SessionStartSnapshot => {
  const storedSettings = performanceScenario === null
    ? titleSettingsStore.get()
    : performanceScenario.profile === "normal"
      ? V2_DEFAULT_TITLE_SETTINGS
      : {
          ...V2_DEFAULT_TITLE_SETTINGS,
          school: { ...V2_DEFAULT_TITLE_SETTINGS.school, roomDisorderLevel: 10 },
          features: {
            ...V2_DEFAULT_TITLE_SETTINGS.features,
            alarmEnabled: performanceScenario.profile === "stress"
          }
        };
  const roomVariantReviewRequested = new URLSearchParams(location.search).has(
    "roomVariantReview"
  );
  const settings = roomVariantReviewRequested
    ? {
        ...storedSettings,
        school: {
          ...storedSettings.school,
          roomDisorderLevel: resolveV2RoomVariantLevel(location.search)
        }
      }
    : storedSettings;
  const fixturePopulation: V2TitleSettingsRuntimePopulation | null = performanceScenario !== null &&
    performanceScenario.profile !== "normal"
    ? V2_PERFORMANCE_ACCEPTANCE_POPULATION
    : rampValidationTarget
      ? Object.freeze({
          npcCount: 0,
          initialBrainwashedNpcCount: 0,
          initialBitCount: 0,
          bitReinforcementIntervalSeconds: 10,
          maximumBitCount: 0
        })
      : runtimeStressScenario?.population ?? null;
  return createV2SessionStartSnapshot({
    startMode: titleStartMode,
    settings,
    venueRandom: createSchoolRuntimeRandom(
      sessionSeed,
      "instant-execution-venue"
    ),
    ...(fixturePopulation === null ? {} : { runtimePopulation: fixturePopulation })
  });
};

if (performanceScenario) {
  canvas.style.width = "1920px";
  canvas.style.height = "1080px";
}
const engine = new Engine(canvas, true);
markV2StartupPhase("engine-created");
const scene = new Scene(engine);
scene.collisionsEnabled = true;
scene.clearColor = new Color4(0.48, 0.72, 0.92, 1);
const ambientLight = new HemisphericLight(
  "V2SchoolAmbientLight",
  new Vector3(0.35, 1, -0.25),
  scene
);
ambientLight.intensity = 0.9;
ambientLight.groundColor = new Color3(0.16, 0.2, 0.22);
let ownedStageStatic: OwnedStageStaticSpatialResources | null = null;
let runtimeConstructionEpoch = 0;
let stageStaticLoadCount = 0;
let stageStaticIdentity = 0;
let nextDynamicSessionIdentity = 1;
const disposedDynamicSessionIdentities: number[] = [];
const dynamicSessionDisposeInvocationIdentities: number[] = [];
const DYNAMIC_OWNER_CATEGORIES = Object.freeze([
  "actor", "room-active-set", "mission", "timer", "reservation",
  "passenger", "input", "hud", "audio", "observer", "subscription",
  "query", "human-navigation-world"
] as const);
type DynamicOwnerCategory = (typeof DYNAMIC_OWNER_CATEGORIES)[number];
const disposedDynamicOwnerResiduals: Array<Readonly<{
  generation: number;
  residual: readonly DynamicOwnerCategory[];
}>> = [];
const countSceneResources = () => Object.freeze({
  meshes: scene.meshes.length,
  materials: scene.materials.length,
  textures: scene.textures.length,
  cameras: scene.cameras.length,
  lights: scene.lights.length
});
let staticOnlyBaseline: ReturnType<typeof countSceneResources> | null = null;
let staticOnlyBaselineMatchCount = 0;
let staticOnlyBaselineMismatchCount = 0;
const recordStaticOnlyBaseline = () => {
  const current = countSceneResources();
  if (staticOnlyBaseline === null) {
    staticOnlyBaseline = current;
    staticOnlyBaselineMatchCount += 1;
    return;
  }
  if (JSON.stringify(current) === JSON.stringify(staticOnlyBaseline)) {
    staticOnlyBaselineMatchCount += 1;
  } else {
    staticOnlyBaselineMismatchCount += 1;
  }
};

const getOrLoadStageStatic = async (isCancelled: () => boolean) => {
  const requestedFingerprint = createStageCatalogFingerprint(SCHOOL_STAGE);
  const previous = ownedStageStatic;
  await replaceV2StageStaticResourceSlot(
    {
      get: () => ownedStageStatic,
      set: (value) => {
        ownedStageStatic = value;
      }
    },
    requestedFingerprint,
    async () => {
      const loaded = await loadStageStaticSpatialResources(scene, SCHOOL_STAGE);
      stageStaticLoadCount += 1;
      stageStaticIdentity += 1;
      return loaded;
    },
    isCancelled
  );
  if (ownedStageStatic === null) {
    throw new Error("Stage静的資源slotへload結果が設定されませんでした。");
  }
  if (ownedStageStatic !== previous) {
    document.body.dataset.v2StageStaticLoadCount = String(stageStaticLoadCount);
  }
  document.body.dataset.v2StageCatalogFingerprint = ownedStageStatic.fingerprint;
  return ownedStageStatic;
};

let dispatchTitleSettingsRebuild = () => {};
const appTitleSettingsPanel = createV2TitleSettingsPanel({
  parent: titleOverlay,
  store: titleSettingsStore,
  portraitDirectories: V2_PORTRAIT_ASSET_INVENTORY.directories,
  voiceDirectories: audioAssets.voiceDirectories,
  confirmEnableNoGunTouch: () =>
    window.confirm(enableNoGunTouchBrainwashConfirmMessage),
  onNoGunTouchEnabled: () => dispatchTitleSettingsRebuild(),
  startMode: titleStartMode,
  onStartModeChanged: (mode) => {
    titleStartMode = mode;
    titleOverlayController.setInstantExecutionMode(
      mode === "instant-public-execution"
    );
  }
});
const appTitleLayoutController = createV2TitleLayoutController({
  overlay: titleOverlay,
  center: titleCenterBlock,
  settingsRoot: appTitleSettingsPanel.root,
  settingsViewport: appTitleSettingsPanel.layoutElements.mainHost,
  settingsContent: appTitleSettingsPanel.layoutElements.mainContent
});

type V2RuntimeSession = Readonly<{
  deactivate(): Promise<void>;
  disposeSynchronously(): void;
  dispose(): Promise<void>;
  getOwnershipDiagnostics(): Readonly<{
    generation: number;
    active: readonly DynamicOwnerCategory[];
  }>;
}>;

type V2RuntimeSessionRebuildOptions = Readonly<{
  startAfterCreate: boolean;
  preservePointerLock: boolean;
  retrySnapshot: V2SessionStartSnapshot | null;
  retrySeed: number | null;
}>;

let constructingRuntimeRollback: (() => void) | null = null;

const formatLoadError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const createRuntimeSession = async (
  sessionSeed: number,
  sessionStartSnapshot: V2SessionStartSnapshot,
  requestSessionRebuild: (
    options?: V2RuntimeSessionRebuildOptions
  ) => void,
  startImmediately: boolean
): Promise<V2RuntimeSession> => {
const constructionEpoch = runtimeConstructionEpoch;
const assertConstructionActive = () =>
  assertV2RuntimeConstructionActive(
    () => runtimeTerminated || constructionEpoch !== runtimeConstructionEpoch
  );
const dynamicSessionIdentity = nextDynamicSessionIdentity;
nextDynamicSessionIdentity += 1;
document.body.dataset.v2DynamicSessionIdentity = String(dynamicSessionIdentity);
document.body.dataset.v2SessionStartSnapshot = JSON.stringify(sessionStartSnapshot);
const acquiredDynamicOwners = new Set<DynamicOwnerCategory>();
let constructionResidualReported = false;
const recordConstructionResidual = () => {
  if (constructionResidualReported) {
    return;
  }
  constructionResidualReported = true;
  disposedDynamicOwnerResiduals.push(Object.freeze({
    generation: dynamicSessionIdentity,
    residual: Object.freeze([...acquiredDynamicOwners]),
  }));
};
const acquireDynamicOwner = (category: DynamicOwnerCategory) => {
  if (acquiredDynamicOwners.has(category)) {
    throw new Error(`V2動的ownerの重複取得です: ${category}`);
  }
  acquiredDynamicOwners.add(category);
};
const releaseDynamicOwner = (category: DynamicOwnerCategory) => {
  if (!acquiredDynamicOwners.delete(category)) {
    throw new Error(`V2動的ownerの未取得releaseです: ${category}`);
  }
};
const releaseDynamicOwnerIfAcquired = (category: DynamicOwnerCategory) => {
  if (acquiredDynamicOwners.has(category)) {
    releaseDynamicOwner(category);
  }
};
markV2StartupPhase("runtime-session-creating");
const settingsSnapshot = sessionStartSnapshot.settings;
titleOverlayController.setInstantExecutionMode(
  sessionStartSnapshot.startMode === "instant-public-execution"
);
titleOverlayController.clearError();
const loadingSession = titleOverlayController.createLoadingSession(6);
const roomVariantSelections = createSchoolRoomVariantSelections(
  createSchoolRuntimeSettings(settingsSnapshot.school.roomDisorderLevel),
  sessionSeed
);
document.body.dataset.v2RuntimeSessionSeed = String(sessionSeed);
const performanceDiagnostics = performanceScenario
  ? createV2PerformanceDiagnostics(
      engine,
      scene,
      performanceScenario,
      sessionStartSnapshot.runtimePopulation
    )
  : null;
if (performanceDiagnostics) {
  window.__v2PerformanceDiagnostics =
    performanceDiagnostics;
}
const stageRayQueryKinds = [
  "movement",
  "beam",
  "sight",
  "ground"
] as const;
const stageQueryDiagnostics = performanceDiagnostics
  ? Object.freeze({
      recordRayQuery: (
        kind: "movement" | "beam" | "sight" | "ground",
        candidateMeshCount: number,
        directIntersectionCount: number
      ) => {
        performanceDiagnostics.count(`ray.${kind}.queries`);
        performanceDiagnostics.count(
          `ray.${kind}.candidates`,
          candidateMeshCount
        );
        performanceDiagnostics.count(
          `ray.${kind}.intersections`,
          directIntersectionCount
        );
      },
      recordRayTriangleQuery: (
        kind: "movement" | "beam" | "sight" | "ground",
        indexedTriangleCount: number,
        exactTriangleTestCount: number
      ) => {
        performanceDiagnostics.count(
          `ray.${kind}.indexed-triangles`,
          indexedTriangleCount
        );
        performanceDiagnostics.count(
          `ray.${kind}.exact-triangle-tests`,
          exactTriangleTestCount
        );
      },
      recordNavigationAreaQuery: (
        kind: "locate" | "advance",
        testedPortalCount: number,
        transitioned: boolean,
        durationMilliseconds: number
      ) => {
        performanceDiagnostics.count(`area.${kind}.queries`);
        performanceDiagnostics.count(
          `area.${kind}.portal-tests`,
          testedPortalCount
        );
        performanceDiagnostics.count(
          `area.${kind}.transitions`,
          transitioned ? 1 : 0
        );
        performanceDiagnostics.count(
          `area.${kind}.milliseconds`,
          durationMilliseconds
        );
      }
    })
  : undefined;
const camera = new FreeCamera("V2PlayerCamera", Vector3.Zero(), scene);
camera.minZ = 0.02;
camera.angularSensibility = 1500;
camera.speed = 0;
scene.activeCamera = camera;

titleHeading.textContent = "HAIGURE SURVIVAL V2";
titleVersion.textContent = "ver.2.0.0";
titleOverlay.style.display = "grid";
minimapCanvas.style.display = "none";
minimapReadout.style.display = "none";
staminaGauge.style.display = "none";
statusInfo.style.display = "none";
helpPanel.style.display = "none";

const initializeRuntime = async () => {
  let ownedStage: StageSpatialSession | null = null;
  let ownedDynamicRuntime: SchoolStageDynamicRuntime | null =
    null;
  let ownedTraversalCoordinator:
    | SchoolStageTraversalCoordinator
    | null = null;
  let ownedInput: V2PlayerInput | null = null;
  let ownedPlayer: V2PlayerController | null = null;
  let ownedSurvival: V2SurvivalRuntime | null = null;
  let ownedAlarmFloorVisual: V2AlarmFloorVisualSystem | null =
    null;
  let ownedCharacterVisuals: V2CharacterVisualRuntime | null =
    null;
  let selectNavigationRoute: SchoolNpcNavigationPolicy | null =
    null;
  const constructionRollback = createV2RuntimeConstructionRollbackStack();
  if (performanceDiagnostics !== null) {
    constructionRollback.register("performance", () => {
      performanceDiagnostics.dispose();
      delete window.__v2PerformanceDiagnostics;
    });
  }
  constructionRollback.register("camera", () => {
    camera.detachControl();
    camera.dispose();
  });
  const rollbackInitializationSynchronously = () => {
    if (constructingRuntimeRollback === rollbackInitializationSynchronously) {
      constructingRuntimeRollback = null;
    }
    constructionRollback.rollback();
    delete window.__v2PerformanceDiagnostics;
  };
  constructingRuntimeRollback = rollbackInitializationSynchronously;

  try {
    markV2StartupPhase("school-stage-loading");
    const dynamicSpatialInitialization =
      createSchoolStageDynamicSpatialInitializationDescriptor(sessionSeed);
    const staticResources = await getOrLoadStageStatic(
      () => runtimeTerminated || constructionEpoch !== runtimeConstructionEpoch
    );
    assertConstructionActive();
    ownedStage = await acquireV2ConstructionOwner({
      label: "Stage spatial session",
      isCancelled: () =>
        runtimeTerminated || constructionEpoch !== runtimeConstructionEpoch,
      create: () => createStageSpatialSession(staticResources, {
        queryDiagnostics: stageQueryDiagnostics,
        dynamicSpatialInitialization,
        roomVariantSelections
      }),
      dispose: (stage) => stage.dispose()
    });
    acquireDynamicOwner("room-active-set");
    acquireDynamicOwner("query");
    acquireDynamicOwner("human-navigation-world");
    constructionRollback.register("stage", () => {
      const stage = ownedStage;
      ownedStage = null;
      stage?.dispose();
      releaseDynamicOwnerIfAcquired("human-navigation-world");
      releaseDynamicOwnerIfAcquired("query");
      releaseDynamicOwnerIfAcquired("room-active-set");
    });
    markV2StartupPhase("school-stage-loaded");
    loadingSession.advance();
    if (ownedStage.worldBoundary === null) {
      throw new Error("学校ステージのworld boundaryがありません");
    }
    ownedStage.worldBoundary.mesh.computeWorldMatrix(true);
    camera.maxZ =
      ownedStage.worldBoundary.mesh.getBoundingInfo().boundingBox.extendSizeWorld.length() *
      2.2;
    configureV2StageTransparentRenderingOrder(
      ownedStage.resources.visualMeshes
    );
    const playerSpawn = selectV2PlayerSpawn(
      ownedStage.playerSpawns.all,
      settingsSnapshot.school.playerSpawn,
      createSchoolRuntimeRandom(sessionSeed, "player-spawn")
    );
    document.body.dataset.v2PlayerSpawnId = playerSpawn.id;
    document.body.dataset.v2PlayerSpawnExclusionId =
      playerSpawn.exclusionVolume.id;
    ownedInput = createV2PlayerInput(window);
    acquireDynamicOwner("input");
    constructionRollback.register("player-input", () => {
      const player = ownedPlayer;
      ownedPlayer = null;
      if (player !== null) {
        player.dispose();
      } else {
        const input = ownedInput;
        ownedInput = null;
        input?.dispose();
      }
      releaseDynamicOwnerIfAcquired("input");
    });
    const playerInput = ownedInput;
    ownedPlayer = createV2PlayerController({
      scene,
      camera,
      stage: ownedStage,
      playerSpawn,
      input: ownedInput,
      dashMode: V2_DEBUG_MODE ? "unlimited" : "stamina",
      eyeHeightScale: settingsSnapshot.display.eyeHeightScale
    });
    const playerController = ownedPlayer;
    ownedInput = null;
    const characterAssignments = createV2CharacterAssignments({
      actorIds: Object.freeze([
        "player",
        ...Array.from(
          { length: sessionStartSnapshot.runtimePopulation.npcCount },
          (_, index) => `npc_${index}`
        )
      ]),
      playerActorId: "player",
      voiceProfileIds: getV2VoiceProfileIds(),
      portraitDirectories: V2_PORTRAIT_ASSET_INVENTORY.directories,
      playerVoiceDirectory: settingsSnapshot.character.voiceDirectory,
      playerPortraitDirectory: settingsSnapshot.character.portraitDirectory,
      random: createSchoolRuntimeRandom(
        sessionSeed,
        "character-assignment"
      )
    });
    markV2StartupPhase("character-visuals-loading");
    ownedCharacterVisuals = await acquireV2ConstructionOwner({
      label: "Character visual",
      isCancelled: () =>
        runtimeTerminated || constructionEpoch !== runtimeConstructionEpoch,
      create: () => createV2CharacterVisualRuntime({
        scene,
        assignments: characterAssignments,
        showGroundShadows: settingsSnapshot.display.showGroundShadows,
        includeNoGunTouchBlendFrames:
          settingsSnapshot.brainwash.brainwashOnNoGunTouch,
        orientationMode:
          settingsSnapshot.display.enableCharacterSpriteVerticalAngle
            ? "upright"
            : "camera-facing"
      }),
      dispose: (visuals) => visuals.dispose()
    });
    constructionRollback.register("character-visual", () => {
      const characterVisuals = ownedCharacterVisuals;
      ownedCharacterVisuals = null;
      characterVisuals?.dispose();
    });
    markV2StartupPhase("character-visuals-loaded");
    loadingSession.advance();
    const characterVisuals = ownedCharacterVisuals;
    ownedSurvival = createV2SurvivalRuntime({
      scene,
      stage: ownedStage,
      playerSpawn,
      player: playerController,
      initialPlayerState:
        missionAcceptanceScenario === "haigure"
          ? "brainwash-complete-haigure"
          : settingsSnapshot.population.startPlayerBrainwashed
            ? "brainwash-complete-gun"
            : "normal",
      characterVisuals,
      showGroundShadows: settingsSnapshot.display.showGroundShadows,
      random: createSchoolRuntimeRandom(sessionSeed, "core"),
      npcSpawnRandom: createSchoolRuntimeRandom(
        sessionSeed,
        "npc-spawn"
      ),
      bitSpawnRandom: createSchoolRuntimeRandom(
        sessionSeed,
        "bit-spawn"
      ),
      playerMissionRandom: createSchoolRuntimeRandom(
        sessionSeed,
        "mission-player"
      ),
      npcMissionRandom: createSchoolRuntimeRandom(
        sessionSeed,
        "mission-npc"
      ),
      broadcastMissionRandom: createSchoolRuntimeRandom(
        sessionSeed,
        "mission-broadcast"
      ),
      getOrbVisibilityPredicate: () => {
        const playerCenter = playerController
          .getFootPosition()
          .add(playerController.getEyePosition())
          .scale(0.5);
        const activeCamera = scene.activeCamera;
        if (!activeCamera) {
          throw new Error(
            "オーブ表示判定にはSceneのactive cameraが必要です"
          );
        }
        const frustumPlanes = Frustum.GetPlanes(
          activeCamera.getTransformationMatrix()
        );
        return (position: Vector3) =>
          Vector3.DistanceSquared(position, playerCenter) <= 25 &&
          Frustum.IsPointInFrustum(position, frustumPlanes);
      },
      population: sessionStartSnapshot.runtimePopulation,
      features: settingsSnapshot.features,
      startupScenario:
        sessionStartSnapshot.instantPublicExecutionScenario,
      brainwashSettings: Object.freeze({
        instantBrainwash: settingsSnapshot.brainwash.instantBrainwash,
        brainwashOnNoGunTouch:
          settingsSnapshot.brainwash.brainwashOnNoGunTouch,
        gunPercent: settingsSnapshot.brainwash.gunPercent,
        noGunPercent: settingsSnapshot.brainwash.noGunPercent
      }),
      performanceDiagnostics,
      performanceWorkloadScenario: performanceScenario?.profile === "fixed-4200"
        ? performanceScenario
        : null,
      releaseStageTraversalForScriptedPhase: () => {
        if (ownedTraversalCoordinator === null) {
          throw new Error(
            "実学校traversal coordinatorの初期化前にphase解放が要求されました。"
          );
        }
        ownedTraversalCoordinator.releaseForScriptedPhase();
      },
      selectNavigationRoute: (context, candidates) => {
        if (selectNavigationRoute === null) {
          throw new Error(
            "実学校NPC経路policyの初期化前に経路選択が要求されました。"
          );
        }
        return selectNavigationRoute(context, candidates);
      }
    });
    acquireDynamicOwner("actor");
    acquireDynamicOwner("mission");
    acquireDynamicOwner("timer");
    constructionRollback.register("survival", () => {
      const survival = ownedSurvival;
      ownedSurvival = null;
      survival?.dispose();
      releaseDynamicOwnerIfAcquired("timer");
      releaseDynamicOwnerIfAcquired("mission");
      releaseDynamicOwnerIfAcquired("actor");
    });
    markV2StartupPhase("survival-runtime-created");
    loadingSession.advance();
    const survivalRuntime = ownedSurvival;
    const initialNpcTargets = Object.freeze(
      survivalRuntime
        .getHumanTargets()
        .filter((target) => target.kind === "npc")
        .sort((left, right) => left.id.localeCompare(right.id))
    );
    const activeNpcSpawnBiases = Object.freeze(
      playerSpawn.npcSpawnBiasVolumes.map((volume) =>
        Object.freeze({
          id: volume.id,
          playerSpawnId: volume.playerSpawnId!,
          weight: volume.npcSpawnBiasWeight!
        })
      )
    );
    const roundSpawnCoordinate = (value: number) =>
      Math.round(value * 1_000_000) / 1_000_000;
    document.body.dataset.v2NpcSpawnReport = JSON.stringify({
      sessionSeed,
      playerSpawnId: playerSpawn.id,
      activeBiases: activeNpcSpawnBiases,
      npcCount: initialNpcTargets.length,
      initialBrainwashedNpcCount:
        initialNpcTargets.filter((target) => target.brainwashed).length,
      npcInsideActiveBiasCount: initialNpcTargets.filter((target) =>
        playerSpawn.npcSpawnBiasVolumes.some((volume) =>
          ownedStage!.queries.containsVolumeById(
            volume.id,
            target.footPosition
          )
        )
      ).length,
      initialBrainwashedInsideActiveBiasCount: initialNpcTargets.filter(
        (target) =>
          target.brainwashed &&
          playerSpawn.npcSpawnBiasVolumes.some((volume) =>
            ownedStage!.queries.containsVolumeById(
              volume.id,
              target.footPosition
            )
          )
      ).length,
      signature: initialNpcTargets.map((target) =>
        Object.freeze({
          id: target.id,
          state: target.state,
          position: Object.freeze([
            roundSpawnCoordinate(target.footPosition.x),
            roundSpawnCoordinate(target.footPosition.y),
            roundSpawnCoordinate(target.footPosition.z)
          ])
        })
      )
    });
    if (
      settingsSnapshot.features.alarmEnabled &&
      V2_ALARM_FLOOR_VISUALIZATION_ENABLED
    ) {
      ownedAlarmFloorVisual =
        createV2AlarmFloorVisualSystem(scene);
      constructionRollback.register("alarm-floor-visual", () => {
        const alarmFloorVisual = ownedAlarmFloorVisual;
        ownedAlarmFloorVisual = null;
        alarmFloorVisual?.dispose();
      });
    }
    ownedDynamicRuntime = createSchoolStageDynamicRuntime({
      initialization: dynamicSpatialInitialization,
      staticActiveSet: ownedStage.staticSpatialActiveSet,
      doorAssets: ownedStage.doorAssets,
      elevatorAssets: ownedStage.elevatorAssets,
      dynamicVariants: ownedStage.dynamicVariants,
      queries: ownedStage.queries,
      actors: createSchoolStageActorPort(
        playerController,
        survivalRuntime,
        ownedStage
      )
    });
    acquireDynamicOwner("reservation");
    acquireDynamicOwner("passenger");
    constructionRollback.register("dynamic-runtime", () => {
      const dynamicRuntime = ownedDynamicRuntime;
      ownedDynamicRuntime = null;
      dynamicRuntime?.dispose();
      releaseDynamicOwnerIfAcquired("passenger");
      releaseDynamicOwnerIfAcquired("reservation");
    });
    selectNavigationRoute = createSchoolNpcNavigationPolicy({
      seed: sessionSeed,
      elevatorAssets: ownedStage.elevatorAssets,
      dynamicRuntime: ownedDynamicRuntime,
      queries: ownedStage.queries,
      getHumanTargets: () =>
        survivalRuntime.getHumanTargets()
    });
    constructionRollback.register("navigation-policy", () => {
      const navigationPolicy = selectNavigationRoute;
      selectNavigationRoute = null;
      navigationPolicy?.dispose();
    });
    ownedTraversalCoordinator =
      createSchoolStageTraversalCoordinator({
        stage: ownedStage,
        runtime: ownedDynamicRuntime,
        survival: survivalRuntime,
        player: playerController,
        doorCloseRandom: createSchoolRuntimeRandom(
          sessionSeed,
          "door-behavior"
        )
      });
    constructionRollback.register("traversal", () => {
      const traversal = ownedTraversalCoordinator;
      ownedTraversalCoordinator = null;
      traversal?.dispose();
    });
    survivalRuntime.activateStartupScenario();
    if (runtimeStressScenario) {
      const initialFrame = survivalRuntime.getFrame();
      if (
        initialFrame.npcCount !==
          runtimeStressScenario.population.npcCount ||
        initialFrame.brainwashedNpcCount !==
          runtimeStressScenario.population
            .initialBrainwashedNpcCount ||
        initialFrame.bitCount !==
          runtimeStressScenario.population.initialBitCount
      ) {
        throw new Error(
          "実学校stressの初期人口が要求値と一致しません。"
        );
      }
    }
    await scene.whenReadyAsync();
    assertConstructionActive();
    markV2StartupPhase("scene-ready");
    loadingSession.advance();
    const visualPreparation =
      ownedSurvival.prepareVisualResources();
    scene.render();
    await visualPreparation;
    assertConstructionActive();
    markV2StartupPhase("visual-resources-ready");
    loadingSession.advance();
    return {
      stage: ownedStage,
      dynamicRuntime: ownedDynamicRuntime,
      traversalCoordinator: ownedTraversalCoordinator,
      input: playerInput,
      player: ownedPlayer,
      survival: ownedSurvival,
      characterVisuals,
      characterAssignments,
      alarmFloorVisual: ownedAlarmFloorVisual,
      navigationPolicy: selectNavigationRoute
    };
  } catch (error) {
    if (!runtimeTerminated) {
      console.error("V2実行環境の初期化に失敗しました。", error);
    }
    rollbackInitializationSynchronously();
    recordConstructionResidual();
    throw error;
  }
};

let initializedRuntime: Awaited<ReturnType<typeof initializeRuntime>>;
try {
  initializedRuntime = await initializeRuntime();
  assertConstructionActive();
} catch (error) {
  if (!runtimeTerminated) {
    loadingSession.finish();
    titleOverlayController.setError(formatLoadError(error));
  }
  throw error;
}
const {
  stage,
  dynamicRuntime,
  traversalCoordinator,
  input,
  player,
  survival,
  characterVisuals,
  characterAssignments,
  alarmFloorVisual,
  navigationPolicy
} = initializedRuntime;

const eventScope = createV2RuntimeSessionEventScope();
acquireDynamicOwner("observer");
acquireDynamicOwner("subscription");
let ownedRuntimeHud: ReturnType<
  typeof createV2RuntimeHudController
> | null = null;
let ownedMissionHud: ReturnType<
  typeof createV2MissionHudController
> | null = null;
let ownedPlayerStatusHud: ReturnType<
  typeof createV2PlayerStatusHud
> | null = null;
let ownedPerformanceStressWorkload: ReturnType<typeof createV2PerformanceStressWorkload> | null = null;
let ownedMinimap: ReturnType<
  typeof createV2MinimapController
> | null = null;
let ownedAudio: AudioManager | null = null;
let ownedGameplayAudioBridge: ReturnType<
  typeof createV2GameplayAudioBridge
> | null = null;
let ownedVoiceRuntime: ReturnType<
  typeof createV2VoiceRuntime
> | null = null;
let ownedPlayerCharacterVisual: V2PlayerCharacterVisual | null = null;
let ownedSchoolVisualAcceptanceBridge: HTMLTextAreaElement | null = null;
let started = false;
let deactivated = false;
let disposed = false;
let audioDisposalPromise: Promise<void> | null = null;
let audioDisposeStarted = false;
let disposalReported = false;
const deactivateRuntimeSynchronously = () => {
  if (deactivated) {
    return;
  }
  deactivated = true;
  started = false;
  engine.stopRenderLoop();
  input.reset();
  eventScope.dispose();
  releaseDynamicOwner("subscription");
  releaseDynamicOwner("observer");
  ownedRuntimeHud?.clear();
  ownedMissionHud?.clear();
  ownedPlayerStatusHud?.clear();
  ownedMinimap?.clear();
  ownedVoiceRuntime?.stopAll();
  ownedAudio?.stopBgm();
};
const deactivateRuntime = async () => deactivateRuntimeSynchronously();
const disposeRuntimeSynchronously = () => {
  dynamicSessionDisposeInvocationIdentities.push(dynamicSessionIdentity);
  if (disposed) {
    return;
  }
  disposed = true;
  disposedDynamicSessionIdentities.push(dynamicSessionIdentity);
  if (
    document.body.dataset.v2DynamicSessionIdentity ===
    String(dynamicSessionIdentity)
  ) {
    delete document.body.dataset.v2DynamicSessionIdentity;
  }
  deactivateRuntimeSynchronously();
  ownedRuntimeHud?.dispose();
  ownedMissionHud?.dispose();
  ownedPlayerStatusHud?.dispose();
  ownedMinimap?.dispose();
  releaseDynamicOwnerIfAcquired("hud");
  ownedPlayerCharacterVisual?.dispose();
  ownedGameplayAudioBridge?.dispose();
  ownedVoiceRuntime?.dispose();
  ownedSchoolVisualAcceptanceBridge?.remove();
  if (ownedAudio !== null) {
    audioDisposalPromise = ownedAudio.dispose();
    audioDisposeStarted = true;
  }
  releaseDynamicOwnerIfAcquired("audio");
  const disposedWorkloadReport = ownedPerformanceStressWorkload?.getReport() ?? null;
  if (performanceDiagnostics !== null) {
    const status = performanceDiagnostics.getProgress().status;
    if (status === "collecting" || status === "draining") {
      performanceDiagnostics.abort("session-disposed");
    }
    window.dispatchEvent(new CustomEvent("v2-performance-report", {
      detail: { report: performanceDiagnostics.getReport(), workload: disposedWorkloadReport }
    }));
    performanceDiagnostics.dispose();
  }
  ownedPerformanceStressWorkload?.dispose();
  delete window.__v2PerformanceDiagnostics;
  delete document.body.dataset.v2PerformanceReport;
  delete document.body.dataset.v2PerformanceStressWorkload;
  delete document.body.dataset.v2PerformanceContext;
  delete document.body.dataset.v2RuntimeStressReport;
  delete document.body.dataset.v2NpcSpawnReport;
  delete document.body.dataset.v2MissionAcceptanceScenario;
  delete document.body.dataset.v2MissionAcceptancePlacement;
  delete document.body.dataset.v2MissionAcceptanceSnapshot;
  delete document.body.dataset.v2ElevatorNpcAcceptanceReport;
  delete document.body.dataset.v2SchoolVisualAcceptance;
  delete document.body.dataset.v2FeatureResources;
  delete window.__v2SchoolVisualAcceptance;
  if (runtimeStressScenario || elevatorNpcAcceptanceScenario) {
    delete document.documentElement.dataset.validationStatus;
  }
  traversalCoordinator.dispose();
  dynamicRuntime.dispose();
  releaseDynamicOwner("passenger");
  releaseDynamicOwner("reservation");
  alarmFloorVisual?.dispose();
  survival.dispose();
  releaseDynamicOwner("timer");
  releaseDynamicOwner("mission");
  releaseDynamicOwner("actor");
  characterVisuals.dispose();
  navigationPolicy.dispose();
  player.dispose();
  releaseDynamicOwner("input");
  stage.dispose();
  releaseDynamicOwner("human-navigation-world");
  releaseDynamicOwner("query");
  releaseDynamicOwner("room-active-set");
  camera.detachControl();
  camera.dispose();
  if (!disposalReported) {
    disposalReported = true;
    disposedDynamicOwnerResiduals.push(
      Object.freeze({
        generation: dynamicSessionIdentity,
        residual: Object.freeze([...acquiredDynamicOwners])
      })
    );
  }
  if (constructingRuntimeRollback === disposeRuntimeSynchronously) {
    constructingRuntimeRollback = null;
  }
};
const disposeRuntime = async () => {
  disposeRuntimeSynchronously();
  if (audioDisposeStarted) {
    await audioDisposalPromise;
  }
};
constructingRuntimeRollback = disposeRuntimeSynchronously;

try {
camera.attachControl(canvas, true);
if (schoolVisualAcceptanceScenario !== null) {
  const visualStageMeshes = new Set<AbstractMesh>(stage.resources.visualMeshes);
  const buildVisualAcceptanceSnapshot = () => {
    const footPosition = player.getFootPosition();
    const eyePosition = player.getEyePosition();
    const forward = camera.getForwardRay().direction;
    const centerPick = scene.pick(
      engine.getRenderWidth() / 2,
      engine.getRenderHeight() / 2,
      (mesh) => visualStageMeshes.has(mesh)
    );
    const pickedPoint = centerPick?.pickedPoint ?? null;
    return Object.freeze({
      footPosition: Object.freeze([
        footPosition.x,
        footPosition.y,
        footPosition.z
      ] as const),
      eyePosition: Object.freeze([
        eyePosition.x,
        eyePosition.y,
        eyePosition.z
      ] as const),
      forward: Object.freeze([
        forward.x,
        forward.y,
        forward.z
      ] as const),
      rotation: Object.freeze([
        camera.rotation.x,
        camera.rotation.y,
        camera.rotation.z
      ] as const),
      fov: camera.fov,
      minZ: camera.minZ,
      maxZ: camera.maxZ,
      centerPick:
        centerPick?.hit === true && centerPick.pickedMesh !== null
          ? Object.freeze({
              meshName: centerPick.pickedMesh.name,
              point:
                pickedPoint === null
                  ? null
                  : Object.freeze([
                      pickedPoint.x,
                      pickedPoint.y,
                      pickedPoint.z
                    ] as const)
            })
          : null,
      renderSize: Object.freeze([
        engine.getRenderWidth(),
        engine.getRenderHeight()
      ] as const)
    });
  };
  const visualAcceptanceController = Object.freeze({
    setPose: ({
      footPosition,
      lookAtPosition,
      fov
    }: V2SchoolVisualAcceptancePose) => {
      const poseValues = [
        ...footPosition,
        ...lookAtPosition,
        fov
      ];
      if (poseValues.some((value) => !Number.isFinite(value))) {
        throw new Error(
          "学校Visual受入の座標とFOVには有限値が必要です。"
        );
      }
      if (fov <= 0 || fov >= Math.PI) {
        throw new Error(
          "学校Visual受入のFOVは0より大きくPI未満が必要です。"
        );
      }
      const foot = Vector3.FromArray(footPosition);
      const lookAt = Vector3.FromArray(lookAtPosition);
      player.placeAt(foot, lookAt);
      camera.setTarget(lookAt);
      camera.fov = fov;
      scene.render();
      const snapshot = buildVisualAcceptanceSnapshot();
      helpPanel.textContent =
        `学校Visual受入 ${schoolVisualAcceptanceScenario.id}\n` +
        `seed ${schoolVisualAcceptanceScenario.seed}\n` +
        `QA座標 X ${snapshot.footPosition[0].toFixed(3)}  ` +
        `Y ${snapshot.footPosition[1].toFixed(3)}  ` +
        `Z ${snapshot.footPosition[2].toFixed(3)}\n` +
        `forward ${snapshot.forward.map((value) => value.toFixed(6)).join(", ")}\n` +
        `FOV ${snapshot.fov.toFixed(6)}`;
      return snapshot;
    },
    getSnapshot: buildVisualAcceptanceSnapshot
  });
  window.__v2SchoolVisualAcceptance = visualAcceptanceController;
  const bridge = document.createElement("textarea");
  bridge.id = "v2SchoolVisualAcceptanceBridge";
  bridge.tabIndex = -1;
  bridge.setAttribute("aria-hidden", "true");
  bridge.style.position = "fixed";
  bridge.style.width = "1px";
  bridge.style.height = "1px";
  bridge.style.opacity = "0";
  bridge.style.pointerEvents = "none";
  bridge.style.inset = "0 auto auto 0";
  eventScope.listen(bridge, "input", () => {
    if (bridge.value.length === 0) {
      throw new Error(
        "学校Visual受入bridgeにはcommandが必要です。"
      );
    }
    const command = JSON.parse(
      bridge.value
    ) as V2SchoolVisualAcceptancePose;
    bridge.dataset.result = JSON.stringify(
      visualAcceptanceController.setPose(command)
    );
  });
  document.body.append(bridge);
  ownedSchoolVisualAcceptanceBridge = bridge;
  document.body.dataset.v2SchoolVisualAcceptance =
    schoolVisualAcceptanceScenario.id;
}
const runtimeHud = createV2RuntimeHudController({
  host: document.body,
  canvas,
  camera
});
ownedRuntimeHud = runtimeHud;
const playerStatusHud = createV2PlayerStatusHud({
  host: document.body,
  staminaGauge
});
ownedPlayerStatusHud = playerStatusHud;
const missionHud = sessionStartSnapshot.startMode === "normal" &&
  settingsSnapshot.features.missionEnabled
  ? createV2MissionHudController({ host: document.body })
  : null;
ownedMissionHud = missionHud;
acquireDynamicOwner("hud");
document.body.dataset.v2FeatureResources = JSON.stringify({
  ...survival.getFeatureResources(),
  missionHud: missionHud !== null,
  alarmFloorVisual: alarmFloorVisual !== null
});
if (stage.locationAssets === null) {
  throw new Error("学校V2 Runtimeにはlocation assetsが必要です。");
}
const locationAssets = stage.locationAssets;
const minimap = createV2MinimapController({
  canvas: minimapCanvas,
  readout: minimapReadout,
  camera,
  locationAssets,
  queries: stage.queries
});
ownedMinimap = minimap;
const playerCharacterVisual = createV2PlayerCharacterVisual(
  characterVisuals
);
ownedPlayerCharacterVisual = playerCharacterVisual;
const performanceStressWorkload = performanceScenario?.profile === "stress"
  ? createV2PerformanceStressWorkload({ stage, dynamicRuntime, survival, player, camera,
    replayInputs: window.__v2PerformanceStressReplayInputs ?? null })
  : null;
ownedPerformanceStressWorkload = performanceStressWorkload;
const audio = new AudioManager(camera);
ownedAudio = audio;
acquireDynamicOwner("audio");
const audioVolumeLevels = settingsSnapshot.audio;
applyV2AudioVolumeLevels(audio, audioVolumeLevels);
const audioRandom = performanceScenario === null
  ? Math.random
  : createV2SeededRandom(sessionSeed);
const gameplayAudioBridge = createV2GameplayAudioBridge({
  audio,
  assets: audioAssets,
  getListenerPosition: () => player.getEyePosition()
});
ownedGameplayAudioBridge = gameplayAudioBridge;
const voiceRuntime = createV2VoiceRuntime({
  audio,
  random: audioRandom,
  assignments: characterAssignments,
  baseOptions: Object.freeze({
    volume: 0.72,
    maxDistance: 4.17,
    loop: false
  }),
  loopOptions: Object.freeze({
    volume: 0.72,
    maxDistance: 4.17,
    loop: true
  })
});
ownedVoiceRuntime = voiceRuntime;
loadingSession.advance();
const bgmUrl = audioAssets.selectBgmUrl(
  SCHOOL_STAGE.label,
  audioRandom
);
let audioActivated = false;
canvas.tabIndex = 0;
loadingSession.finish();

let statusTimer = 0;
let elapsedSeconds = 0;
let playerElevatorMoving = false;
let characterFacingYaw = 0;
const logicalRenderCameraPosition = Vector3.Zero();
const cameraRenderOffset = Vector3.Zero();
const cameraForwardAxis = Vector3.Forward(scene.useRightHandedSystem);
const cameraUpAxis = Vector3.Up();
const characterViewForward = Vector3.Zero();
const characterViewUp = Vector3.Zero();
const playerGunDirection = Vector3.Zero();
let performanceReportPublished = false;
const publishPerformanceReport = () => {
  // dispose中のabortもfinalizeのPromiseを解決する。旧sessionの遅延公開を止める。
  if (disposed || performanceDiagnostics === null) return;
  const report = performanceDiagnostics.getReport();
  const workload = performanceStressWorkload?.getReport() ?? null;
  if (workload !== null) {
    document.body.dataset.v2PerformanceStressWorkload = JSON.stringify(workload);
  }
  document.body.dataset.v2PerformanceReport = JSON.stringify(report);
  window.dispatchEvent(new CustomEvent("v2-performance-report", { detail: { report, workload } }));
};
const runtimeStressStartedAt = runtimeStressScenario
  ? performance.now()
  : null;
const runtimeStressInitialFrame = runtimeStressScenario
  ? survival.getFrame()
  : null;
const runtimeStressInitialBrainwashedNpcCount =
  runtimeStressInitialFrame?.brainwashedNpcCount ?? 0;
let runtimeStressFrameCount = 0;
let runtimeStressStatus: V2RuntimeStressReport["status"] =
  "running";
let missionAcceptanceLookAtPosition: Vector3 | null = null;

type ElevatorNpcAcceptancePhase =
  | "positioning"
  | "commanding"
  | "gathering"
  | "calling"
  | "boarding"
  | "riding"
  | "disembarking"
  | "autonomous"
  | "passed";

const elevatorNpcAcceptanceAsset = (() => {
  if (elevatorNpcAcceptanceScenario === null) {
    return null;
  }
  if (stage.elevatorAssets.all.length !== 1) {
    throw new Error(
      `エレベーターNPC受入には実学校エレベーター1基が必要です: ${stage.elevatorAssets.all.length}`
    );
  }
  return stage.elevatorAssets.all[0]!;
})();
const elevatorNpcAcceptanceRuntime =
  elevatorNpcAcceptanceAsset === null
    ? null
    : dynamicRuntime.getElevator(elevatorNpcAcceptanceAsset.id);
const elevatorNpcAcceptanceDepartureStop = (() => {
  if (elevatorNpcAcceptanceAsset === null) {
    return null;
  }
  const stop = elevatorNpcAcceptanceAsset.stops.find(
    (candidate) => candidate !== elevatorNpcAcceptanceAsset.initialStop
  );
  if (!stop) {
    throw new Error(
      "エレベーターNPC受入の初期停止階と異なる出発階がありません。"
    );
  }
  return stop;
})();
const elevatorNpcAcceptanceFollowerIds: readonly string[] = (() => {
  if (
    elevatorNpcAcceptanceScenario === null ||
    elevatorNpcAcceptanceDepartureStop === null
  ) {
    return Object.freeze([]);
  }
  elevatorNpcAcceptanceDepartureStop.callMat.mesh.computeWorldMatrix(
    true
  );
  const callMatBounds =
    elevatorNpcAcceptanceDepartureStop.callMat.mesh.getBoundingInfo()
      .boundingBox;
  const callMatProjection = stage.navigation.projectPoint(
    callMatBounds.centerWorld,
    Math.max(
      callMatBounds.extendSizeWorld.x,
      callMatBounds.extendSizeWorld.y,
      callMatBounds.extendSizeWorld.z
    )
  );
  if (callMatProjection === null) {
    throw new Error(
      "エレベーターNPC受入の初期呼出マットをNavMeshへ投影できません。"
    );
  }
  const ids = survival
    .getHumanTargets()
    .filter(
      (target) =>
        target.kind === "npc" &&
        !target.brainwashed &&
        target.state === "normal"
    )
    .map((target) => {
      const start = stage.navigation.projectPoint(
        target.footPosition,
        0.1
      );
      if (start === null) {
        throw new Error(
          `エレベーターNPC受入の同行候補をNavMeshへ投影できません: ${target.id}`
        );
      }
      const path = stage.navigation.findSurfacePath(
        start,
        callMatProjection
      );
      return Object.freeze({
        id: target.id,
        distance: path?.distance ?? Number.POSITIVE_INFINITY
      });
    })
    .filter((target) => Number.isFinite(target.distance))
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        left.id.localeCompare(right.id)
    )
    .map((target) => target.id)
    .slice(0, elevatorNpcAcceptanceScenario.followerCount);
  if (ids.length !== elevatorNpcAcceptanceScenario.followerCount) {
    throw new Error(
      `エレベーターNPC受入の同行者が不足しています: ${ids.length}/${elevatorNpcAcceptanceScenario.followerCount}`
    );
  }
  return Object.freeze(ids);
})();
let elevatorNpcAcceptancePhase: ElevatorNpcAcceptancePhase =
  "positioning";
let elevatorNpcAcceptanceFromStopId: string | null = null;
let elevatorNpcAcceptanceDestinationStopId: string | null = null;
let elevatorNpcAcceptanceFirstPassengerAtSeconds: number | null = null;
let elevatorNpcAcceptanceClosingAtSeconds: number | null = null;
let elevatorNpcAcceptanceMaximumCommittedActorCount = 0;
let elevatorNpcAcceptanceMaximumPassengerCount = 0;
let elevatorNpcAcceptancePlayerCompleted = false;
let elevatorNpcAcceptancePreviousSignature: string | null = null;
let elevatorNpcAcceptanceCommandIndex = 0;
let elevatorNpcAcceptanceAutonomousNpcId: string | null = null;
let elevatorNpcAcceptanceAutonomousMissionId: string | null = null;
const elevatorNpcAcceptanceAutonomousFixedNpcId = "npc_7";
const elevatorNpcAcceptanceAutonomousLocationId = "f04-music";
const elevatorNpcAcceptanceFollowCommandIds = new Set<string>();
const elevatorNpcAcceptanceRidingFollowerIds = new Set<string>();
const elevatorNpcAcceptanceLeavingFollowerIds = new Set<string>();
const elevatorNpcAcceptanceAutonomousRidingIds = new Set<string>();
const elevatorNpcAcceptanceAutonomousArrivedIds = new Set<string>();
const elevatorNpcAcceptanceTransitions: Array<
  Readonly<{
    elapsedSeconds: number;
    phase: ElevatorNpcAcceptancePhase;
    carState: string;
    carDoorState: string;
    currentStopId: string | null;
    reservationIds: readonly string[];
    passengerIds: readonly string[];
    followerTraversal: readonly string[];
  }>
> = [];

const requireElevatorAcceptanceMeshCenter = (
  label: string,
  mesh: AbstractMesh
) => {
  mesh.computeWorldMatrix(true);
  const center = mesh.getBoundingInfo().boundingBox.centerWorld.clone();
  if (
    !Number.isFinite(center.x) ||
    !Number.isFinite(center.y) ||
    !Number.isFinite(center.z)
  ) {
    throw new Error(`${label}の正本中心座標が有限値ではありません。`);
  }
  return center;
};

const publishElevatorNpcAcceptanceReport = (
  status: "running" | "passed",
  elevatorSnapshot: ReturnType<
    NonNullable<typeof elevatorNpcAcceptanceRuntime>["getSnapshot"]
  >
) => {
  if (elevatorNpcAcceptanceScenario === null) {
    return;
  }
  const survivalFrame = survival.getFrame();
  const departureDelaySeconds =
    elevatorNpcAcceptanceFirstPassengerAtSeconds === null ||
    elevatorNpcAcceptanceClosingAtSeconds === null
      ? null
      : elevatorNpcAcceptanceClosingAtSeconds -
        elevatorNpcAcceptanceFirstPassengerAtSeconds;
  document.body.dataset.v2ElevatorNpcAcceptanceReport = JSON.stringify({
    status,
    scenario: elevatorNpcAcceptanceScenario.id,
    seed: elevatorNpcAcceptanceScenario.seed,
    population: {
      npcCount: survivalFrame.npcCount,
      brainwashedNpcCount: survivalFrame.brainwashedNpcCount,
      bitCount: survivalFrame.bitCount
    },
    hostileActionsSuspended: true,
    followerIds: elevatorNpcAcceptanceFollowerIds,
    followCommandAcceptedIds: [
      ...elevatorNpcAcceptanceFollowCommandIds
    ].sort(),
    phase: elevatorNpcAcceptancePhase,
    fromStopId: elevatorNpcAcceptanceFromStopId,
    destinationStopId: elevatorNpcAcceptanceDestinationStopId,
    firstPassengerAtSeconds:
      elevatorNpcAcceptanceFirstPassengerAtSeconds,
    closingAtSeconds: elevatorNpcAcceptanceClosingAtSeconds,
    departureDelaySeconds,
    expectedDepartureDelaySeconds:
      ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS,
    maximumCommittedActorCount:
      elevatorNpcAcceptanceMaximumCommittedActorCount,
    maximumPassengerCount:
      elevatorNpcAcceptanceMaximumPassengerCount,
    elevator: {
      id: elevatorSnapshot.id,
      elapsedSeconds: elevatorSnapshot.elapsedSeconds,
      carState: elevatorSnapshot.carState,
      carDoorState: elevatorSnapshot.carDoorState,
      currentStopId: elevatorSnapshot.currentStopId,
      targetStopId: elevatorSnapshot.targetStopId,
      dwellRemainingSeconds:
        elevatorSnapshot.dwellRemainingSeconds,
      reservationIds: elevatorSnapshot.reservations.map(
        (reservation) => reservation.actorId
      ),
      passengers: elevatorSnapshot.passengers.map((passenger) => ({
        actorId: passenger.actorId,
        state: passenger.state
      }))
    },
    followerTraversal: elevatorNpcAcceptanceFollowerIds.map(
      (npcId) => ({
        npcId,
        kind: survival.getNpcTraversalState(npcId).kind,
        position: survival.getNpcPosition(npcId).asArray()
      })
    ),
    ridingFollowerIds: [...elevatorNpcAcceptanceRidingFollowerIds].sort(),
    leavingFollowerIds: [...elevatorNpcAcceptanceLeavingFollowerIds].sort(),
    autonomousScenario: {
      npcId: elevatorNpcAcceptanceAutonomousNpcId,
      locationId: elevatorNpcAcceptanceAutonomousLocationId,
      missionId: elevatorNpcAcceptanceAutonomousMissionId
    },
    autonomousRidingIds: [
      ...elevatorNpcAcceptanceAutonomousRidingIds
    ].sort(),
    autonomousArrivedIds: [
      ...elevatorNpcAcceptanceAutonomousArrivedIds
    ].sort(),
    transitions: elevatorNpcAcceptanceTransitions
  });
  document.documentElement.dataset.validationStatus = status;
};

if (missionAcceptanceScenario !== null) {
  const broadcastConsole = locationAssets.broadcastConsole;
  broadcastConsole.markerNode.computeWorldMatrix(true);
  broadcastConsole.targetMesh.computeWorldMatrix(true);
  const markerPosition = broadcastConsole.markerNode
    .getAbsolutePosition()
    .clone();
  const lookAtPosition = broadcastConsole.targetMesh
    .getBoundingInfo()
    .boundingBox.centerWorld.clone();
  const approachDirection = markerPosition.subtract(lookAtPosition);
  approachDirection.y = 0;
  if (approachDirection.lengthSquared() === 0) {
    throw new Error(
      "Mission受入の放送卓Markerとtargetから接近方向を決定できません。"
    );
  }
  approachDirection.normalize();
  const projectedCandidates = [1, -1]
    .map((directionSign) =>
      stage.navigation.projectPoint(
        markerPosition.add(
          approachDirection.scale(
            directionSign *
              V2_BROADCAST_INTERACTION_DISTANCE *
              0.7
          )
        ),
        V2_BROADCAST_INTERACTION_DISTANCE
      )
    )
    .filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null
    );
  let footPosition: Vector3 | null = null;
  for (const candidate of projectedCandidates) {
    player.placeAt(candidate.position, lookAtPosition);
    camera.setTarget(lookAtPosition);
    camera.getViewMatrix(true);
    const initialFrame = survival.getFrame();
    if (
      resolveV2BroadcastInteractionCandidate({
        phase: initialFrame.phase,
        playerState: initialFrame.playerState,
        playerFootPosition: player.getFootPosition(),
        camera,
        broadcastConsole,
        queries: stage.queries
      }) !== null
    ) {
      footPosition = player.getFootPosition();
      break;
    }
  }
  if (footPosition === null) {
    throw new Error(
      "Mission受入で正本Marker 3m内かつ正面Ray直視となる放送卓位置を取得できません。"
    );
  }
  missionAcceptanceLookAtPosition = lookAtPosition;
  camera.setTarget(lookAtPosition);
  document.body.dataset.v2MissionAcceptanceScenario =
    missionAcceptanceScenario;
  document.body.dataset.v2MissionAcceptancePlacement = JSON.stringify({
    consoleId: broadcastConsole.id,
    footPosition: footPosition.asArray(),
    lookAtPosition: lookAtPosition.asArray()
  });
}

if (rampValidationTarget) {
  const colliderName =
    rampValidationTarget === "gym"
      ? "COL_B03_GymRoofEscapeCrateRamp"
      : "COL_B03_SchoolRoofEscapeCrateRamp";
  const rampCollider = stage.resources.normalColliders.find(
    (mesh) => mesh.name === colliderName
  );
  if (!rampCollider) {
    throw new Error(`箱山登坂検証対象がありません: ${colliderName}`);
  }
  rampCollider.computeWorldMatrix(true);
  const bounds = rampCollider.getBoundingInfo().boundingBox;
  const placement =
    rampValidationTarget === "gym"
      ? Object.freeze({
          start: new Vector3(
            bounds.minimumWorld.x - 0.05,
            bounds.minimumWorld.y + 0.005,
            bounds.centerWorld.z
          ),
          end: new Vector3(
            bounds.maximumWorld.x - 0.025,
            bounds.maximumWorld.y,
            bounds.centerWorld.z
          )
        })
      : Object.freeze({
          start: new Vector3(
            bounds.maximumWorld.x + 0.05,
            bounds.minimumWorld.y - 0.02,
            bounds.centerWorld.z
          ),
          end: new Vector3(
            bounds.minimumWorld.x + 0.025,
            bounds.maximumWorld.y,
            bounds.centerWorld.z
          )
        });
  document.body.dataset.rampValidationPlacement = JSON.stringify({
    target: rampValidationTarget,
    bounds: {
      minimum: bounds.minimumWorld.asArray(),
      maximum: bounds.maximumWorld.asArray()
    },
    start: placement.start.asArray(),
    end: placement.end.asArray(),
    supportHits: scene
      .multiPickWithRay(
        new Ray(
          placement.start.add(new Vector3(0, 0.2, 0)),
          Vector3.Down(),
          0.4
        ),
        (mesh) =>
          stage.resources.normalColliders.some(
            (collider) => collider === mesh
          )
      )
      ?.map((hit) => ({
        mesh: hit.pickedMesh?.name ?? null,
        point: hit.pickedPoint?.asArray() ?? null,
        normal: hit.getNormal(true, false)?.asArray() ?? null
      })) ?? []
  });
  player.placeAt(placement.start, placement.end);
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = V2_DEBUG_MODE ? "block" : "none";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `箱山登坂検証 ${rampValidationTarget}\n` +
    "W: 登坂  Shift: ダッシュ";
}

const positionElevatorNpcAcceptanceActors = () => {
  if (
    elevatorNpcAcceptanceScenario === null ||
    elevatorNpcAcceptanceAsset === null ||
    elevatorNpcAcceptanceRuntime === null
  ) {
    return;
  }
  survival.setHostileActionsSuspended(true);
  selectElevatorNpcAcceptanceAutonomousCandidate();
  startElevatorNpcAcceptanceAutonomousMission();
  elevatorNpcAcceptancePhase = "commanding";
  publishElevatorNpcAcceptanceReport(
    "running",
    elevatorNpcAcceptanceRuntime.getSnapshot()
  );
};

const selectElevatorNpcAcceptanceAutonomousCandidate = () => {
  if (
    elevatorNpcAcceptanceAsset === null ||
    elevatorNpcAcceptanceRuntime === null
  ) {
    return;
  }
  const autonomousCandidate = survival
    .getHumanTargets()
    .find(
      (target) =>
        target.id === elevatorNpcAcceptanceAutonomousFixedNpcId &&
        target.kind === "npc" &&
        (target.state === "brainwash-complete-gun" ||
          target.state === "brainwash-complete-no-gun") &&
        target.brainwashed &&
        !elevatorNpcAcceptanceFollowerIds.includes(target.id)
    );
  if (
    !autonomousCandidate ||
    survival.previewNpcLocationMissionRoute(
      autonomousCandidate.id,
      elevatorNpcAcceptanceAutonomousLocationId
    ) !== "link"
  ) {
    throw new Error(
      `固定自律NPCが4Fへのエレベーター経路を選びません: ${elevatorNpcAcceptanceAutonomousFixedNpcId}`
    );
  }
  elevatorNpcAcceptanceAutonomousNpcId = autonomousCandidate.id;
};

const startElevatorNpcAcceptanceAutonomousMission = () => {
  if (elevatorNpcAcceptanceAutonomousNpcId === null) {
    throw new Error(
      "エレベーターNPC受入の自律NPC候補が選択されていません。"
    );
  }
  const mission = survival.requestNpcLocationMission(
    elevatorNpcAcceptanceAutonomousNpcId,
    elevatorNpcAcceptanceAutonomousLocationId
  );
  elevatorNpcAcceptanceAutonomousMissionId = mission.id;
};

const positionElevatorNpcAcceptancePlayer = () => {
  if (
    elevatorNpcAcceptanceAsset === null ||
    elevatorNpcAcceptanceRuntime === null ||
    elevatorNpcAcceptanceDepartureStop === null
  ) {
    return;
  }
  const fromStop = elevatorNpcAcceptanceDepartureStop;
  const destinationStop = elevatorNpcAcceptanceAsset.initialStop;
  const callMatCenter = requireElevatorAcceptanceMeshCenter(
    "エレベーターNPC受入の呼出マット",
    fromStop.callMat.mesh
  );
  fromStop.callMat.mesh.computeWorldMatrix(true);
  const callMatExtent = fromStop.callMat.mesh.getBoundingInfo()
    .boundingBox.extendSizeWorld;
  const projectedCallMat = stage.navigation.projectPoint(
    callMatCenter,
    Math.max(callMatExtent.x, callMatExtent.y, callMatExtent.z)
  );
  if (
    projectedCallMat === null ||
    !stage.queries.containsVolumeById(
      fromStop.callMat.id,
      projectedCallMat.position
    )
  ) {
    throw new Error(
      `エレベーターNPC受入の呼出マットにNavMesh位置がありません: ${fromStop.callMat.id}`
    );
  }

  player.setTransportFootPosition(projectedCallMat.position);
  survival.relocateTargetNavigationArea(
    "player",
    projectedCallMat.position
  );
  elevatorNpcAcceptanceFromStopId = fromStop.id;
  elevatorNpcAcceptanceDestinationStopId = destinationStop.id;
};

const updateElevatorNpcAcceptanceBeforeTraversal = () => {
  if (
    elevatorNpcAcceptanceScenario === null ||
    elevatorNpcAcceptanceAsset === null ||
    elevatorNpcAcceptanceRuntime === null
  ) {
    return;
  }
  if (elevatorNpcAcceptancePhase === "positioning") {
    positionElevatorNpcAcceptanceActors();
    return;
  }
  if (elevatorNpcAcceptancePhase === "commanding") {
    const npcId =
      elevatorNpcAcceptanceFollowerIds[
        elevatorNpcAcceptanceCommandIndex
      ]!;
    const target = survival
      .getHumanTargets()
      .find((candidate) => candidate.id === npcId)!;
    const commandPosition = stage.navigation.projectPoint(
      target.footPosition,
      0.03
    );
    if (commandPosition === null) {
      throw new Error(
        `エレベーターNPC受入の指示位置をNavMeshへ投影できません: ${npcId}`
      );
    }
    player.setTransportFootPosition(commandPosition.position);
    survival.relocateTargetNavigationArea(
      "player",
      commandPosition.position
    );
    camera.setTarget(target.aimPosition);
    camera.getViewMatrix(true);
    if (
      !survival
        .getNpcCommandCandidates()
        .some((candidate) => candidate.npcId === npcId)
    ) {
      throw new Error(
        `エレベーターNPC受入の同行指示候補になりません: ${npcId}`
      );
    }
    if (!survival.requestNpcCommand(npcId, "follow")) {
      throw new Error(
        `エレベーターNPC受入のFollow指示が拒否されました: ${npcId}`
      );
    }
    elevatorNpcAcceptanceFollowCommandIds.add(npcId);
    elevatorNpcAcceptanceCommandIndex += 1;
    if (
      elevatorNpcAcceptanceCommandIndex <
      elevatorNpcAcceptanceFollowerIds.length
    ) {
      return;
    }
    elevatorNpcAcceptancePhase = "autonomous";
    return;
  }
  if (elevatorNpcAcceptancePhase === "gathering") {
    const playerTraversal =
      traversalCoordinator.getPlayerElevatorTraversalSnapshot();
    if (playerTraversal?.phase !== "reserved") {
      return;
    }
    elevatorNpcAcceptanceAsset.car.passengerOriginNode.computeWorldMatrix(
      true
    );
    player.setTransportFootPosition(
      elevatorNpcAcceptanceAsset.car.passengerOriginNode
        .getAbsolutePosition()
        .clone()
    );
    elevatorNpcAcceptancePhase = "boarding";
    return;
  }

  const playerTraversal =
    traversalCoordinator.getPlayerElevatorTraversalSnapshot();
  const elevatorSnapshot = elevatorNpcAcceptanceRuntime.getSnapshot();
  if (
    elevatorNpcAcceptancePhase === "calling" &&
    playerTraversal?.phase === "reserved"
  ) {
    elevatorNpcAcceptanceAsset.car.passengerOriginNode.computeWorldMatrix(
      true
    );
    player.setTransportFootPosition(
      elevatorNpcAcceptanceAsset.car.passengerOriginNode
        .getAbsolutePosition()
        .clone()
    );
    elevatorNpcAcceptancePhase = "boarding";
    return;
  }
  if (
    (elevatorNpcAcceptancePhase === "boarding" ||
      elevatorNpcAcceptancePhase === "riding") &&
    playerTraversal?.phase === "riding"
  ) {
    elevatorNpcAcceptancePhase = "riding";
    const playerPassenger = elevatorSnapshot.passengers.find(
      (passenger) => passenger.actorId === "player"
    );
    if (
      playerPassenger?.state === "arrived" &&
      elevatorSnapshot.currentStopId ===
        elevatorNpcAcceptanceDestinationStopId &&
      elevatorSnapshot.carDoorState === "open"
    ) {
      const destinationStop = elevatorNpcAcceptanceAsset.stops.find(
        (stop) => stop.id === elevatorNpcAcceptanceDestinationStopId
      );
      if (!destinationStop) {
        throw new Error(
          `エレベーターNPC受入の降車停止階がありません: ${elevatorNpcAcceptanceDestinationStopId}`
        );
      }
      destinationStop.wait.node.computeWorldMatrix(true);
      player.setTransportFootPosition(
        destinationStop.wait.node.getAbsolutePosition().clone()
      );
      elevatorNpcAcceptancePhase = "disembarking";
    }
  }
};

const updateElevatorNpcAcceptanceAfterTraversal = () => {
  if (
    elevatorNpcAcceptanceScenario === null ||
    elevatorNpcAcceptanceRuntime === null
  ) {
    return;
  }
  const elevatorSnapshot = elevatorNpcAcceptanceRuntime.getSnapshot();
  const committedActorCount =
    elevatorSnapshot.reservations.length +
    elevatorSnapshot.passengers.length;
  elevatorNpcAcceptanceMaximumCommittedActorCount = Math.max(
    elevatorNpcAcceptanceMaximumCommittedActorCount,
    committedActorCount
  );
  elevatorNpcAcceptanceMaximumPassengerCount = Math.max(
    elevatorNpcAcceptanceMaximumPassengerCount,
    elevatorSnapshot.passengers.length
  );
  if (
    elevatorNpcAcceptanceFirstPassengerAtSeconds === null &&
    elevatorSnapshot.passengers.length > 0
  ) {
    elevatorNpcAcceptanceFirstPassengerAtSeconds =
      elevatorSnapshot.elapsedSeconds;
  }
  if (
    elevatorNpcAcceptanceFirstPassengerAtSeconds !== null &&
    elevatorNpcAcceptanceClosingAtSeconds === null &&
    elevatorSnapshot.carDoorState === "closing"
  ) {
    elevatorNpcAcceptanceClosingAtSeconds =
      elevatorSnapshot.elapsedSeconds;
  }
  const followerTraversal = elevatorNpcAcceptanceFollowerIds.map(
    (npcId) => {
      const kind = survival.getNpcTraversalState(npcId).kind;
      if (kind === "riding-elevator") {
        elevatorNpcAcceptanceRidingFollowerIds.add(npcId);
      }
      if (kind === "leaving-elevator") {
        elevatorNpcAcceptanceLeavingFollowerIds.add(npcId);
      }
      return `${npcId}:${kind}`;
    }
  );
  for (const passenger of elevatorSnapshot.passengers) {
    if (
      passenger.actorId === "player" ||
      elevatorNpcAcceptanceFollowerIds.includes(passenger.actorId)
    ) {
      continue;
    }
    elevatorNpcAcceptanceAutonomousRidingIds.add(passenger.actorId);
    if (passenger.state === "arrived") {
      elevatorNpcAcceptanceAutonomousArrivedIds.add(passenger.actorId);
    }
  }
  if (
    traversalCoordinator.getPlayerElevatorTraversalSnapshot()?.phase ===
    "completed"
  ) {
    elevatorNpcAcceptancePlayerCompleted = true;
  }
  if (
    elevatorNpcAcceptancePhase === "autonomous" &&
    elevatorNpcAcceptanceAutonomousNpcId !== null &&
    elevatorNpcAcceptanceAutonomousArrivedIds.has(
      elevatorNpcAcceptanceAutonomousNpcId
    ) &&
    !elevatorSnapshot.passengers.some(
      (passenger) =>
        passenger.actorId === elevatorNpcAcceptanceAutonomousNpcId
    ) &&
    survival.getNpcTraversalState(
      elevatorNpcAcceptanceAutonomousNpcId
    ).kind === "walking"
  ) {
    positionElevatorNpcAcceptancePlayer();
    elevatorNpcAcceptanceFirstPassengerAtSeconds = null;
    elevatorNpcAcceptanceClosingAtSeconds = null;
    elevatorNpcAcceptancePhase = "gathering";
  }
  const signature = [
    elevatorNpcAcceptancePhase,
    elevatorSnapshot.carState,
    elevatorSnapshot.carDoorState,
    elevatorSnapshot.currentStopId,
    elevatorSnapshot.reservations
      .map((reservation) => reservation.actorId)
      .join(","),
    elevatorSnapshot.passengers
      .map((passenger) => `${passenger.actorId}:${passenger.state}`)
      .join(","),
    followerTraversal.join(",")
  ].join("|");
  if (signature !== elevatorNpcAcceptancePreviousSignature) {
    elevatorNpcAcceptancePreviousSignature = signature;
    elevatorNpcAcceptanceTransitions.push(
      Object.freeze({
        elapsedSeconds: elevatorSnapshot.elapsedSeconds,
        phase: elevatorNpcAcceptancePhase,
        carState: elevatorSnapshot.carState,
        carDoorState: elevatorSnapshot.carDoorState,
        currentStopId: elevatorSnapshot.currentStopId,
        reservationIds: Object.freeze(
          elevatorSnapshot.reservations.map(
            (reservation) => reservation.actorId
          )
        ),
        passengerIds: Object.freeze(
          elevatorSnapshot.passengers.map(
            (passenger) => passenger.actorId
          )
        ),
        followerTraversal: Object.freeze(followerTraversal)
      })
    );
  }
  const departureDelaySeconds =
    elevatorNpcAcceptanceFirstPassengerAtSeconds === null ||
    elevatorNpcAcceptanceClosingAtSeconds === null
      ? null
      : elevatorNpcAcceptanceClosingAtSeconds -
        elevatorNpcAcceptanceFirstPassengerAtSeconds;
  const partyDisembarked =
    elevatorNpcAcceptancePhase === "disembarking" &&
    elevatorNpcAcceptancePlayerCompleted &&
    elevatorNpcAcceptanceRidingFollowerIds.size ===
      elevatorNpcAcceptanceFollowerIds.length &&
    elevatorNpcAcceptanceLeavingFollowerIds.size ===
      elevatorNpcAcceptanceFollowerIds.length &&
    elevatorSnapshot.reservations.length === 0 &&
    elevatorSnapshot.passengers.length === 0;
  if (
    partyDisembarked &&
    elevatorNpcAcceptanceFollowCommandIds.size ===
      elevatorNpcAcceptanceFollowerIds.length &&
    elevatorNpcAcceptanceRidingFollowerIds.size ===
      elevatorNpcAcceptanceFollowerIds.length &&
    elevatorNpcAcceptanceAutonomousNpcId !== null &&
    elevatorNpcAcceptanceAutonomousMissionId !== null &&
    elevatorNpcAcceptanceAutonomousRidingIds.has(
      elevatorNpcAcceptanceAutonomousNpcId
    ) &&
    elevatorNpcAcceptanceAutonomousArrivedIds.has(
      elevatorNpcAcceptanceAutonomousNpcId
    ) &&
    !elevatorSnapshot.passengers.some(
      (passenger) => passenger.actorId === "player"
    ) &&
    !elevatorSnapshot.reservations.some(
      (reservation) => reservation.actorId === "player"
    ) &&
    departureDelaySeconds !== null &&
    Math.abs(
      departureDelaySeconds - ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS
    ) <= 0.051 &&
    elevatorNpcAcceptanceMaximumCommittedActorCount <= 6
  ) {
    elevatorNpcAcceptancePhase = "passed";
  }
  publishElevatorNpcAcceptanceReport(
    elevatorNpcAcceptancePhase === "passed" ? "passed" : "running",
    elevatorSnapshot
  );
};

const publishRuntimeStressReport = (
  status: V2RuntimeStressReport["status"],
  error: string | null
) => {
  if (
    runtimeStressScenario === null ||
    runtimeStressStartedAt === null
  ) {
    return;
  }
  const currentFrame = survival.getFrame();
  const report: V2RuntimeStressReport = Object.freeze({
    status,
    profile: runtimeStressScenario.profile,
    seed: runtimeStressScenario.seed,
    durationSeconds: runtimeStressScenario.durationSeconds,
    wallElapsedSeconds:
      (performance.now() - runtimeStressStartedAt) / 1000,
    simulationElapsedSeconds: elapsedSeconds,
    frameCount: runtimeStressFrameCount,
    population: runtimeStressScenario.population,
    initialNpcCount:
      runtimeStressInitialFrame?.npcCount ?? 0,
    initialBrainwashedNpcCount:
      runtimeStressInitialBrainwashedNpcCount,
    initialBitCount:
      runtimeStressInitialFrame?.bitCount ?? 0,
    currentNpcCount: currentFrame.npcCount,
    currentBrainwashedNpcCount:
      currentFrame.brainwashedNpcCount,
    currentBitCount: currentFrame.bitCount,
    phase: currentFrame.phase,
    spatialRevision: stage.queries.revision,
    error
  });
  document.body.dataset.v2RuntimeStressReport =
    JSON.stringify(report);
  document.documentElement.dataset.validationStatus =
    status;
};

const configurePerformanceView = () => {
  if (!performanceScenario) {
    return;
  }
  const courtyardVenue = stage.assemblyVenues.all.find(
    (venue) =>
      venue.anchor.node.name ===
      "MRK_AssemblyAnchor_Courtyard"
  );
  if (!courtyardVenue) {
    throw new Error(
      "性能シナリオ用の校庭集合会場がありません。"
    );
  }
  const footPosition = player.getFootPosition();
  const courtyardDirection =
    courtyardVenue.center.subtract(footPosition);
  courtyardDirection.y = 0;
  if (courtyardDirection.lengthSquared() === 0) {
    throw new Error(
      "性能シナリオの校庭方向を決定できません。"
    );
  }
  const lookAtPosition =
    performanceScenario.view === "courtyard"
      ? footPosition.add(courtyardDirection)
      : footPosition.subtract(courtyardDirection);
  player.placeAt(footPosition, lookAtPosition);
};

const canvasElement = canvas as unknown as Element;
let pointerLockRequestPending = false;

const isPointerLockExitCooldownError = (
  error: unknown
): error is DOMException =>
  error instanceof DOMException &&
  error.name === "SecurityError" &&
  error.message.includes(
    "immediately after the user has exited the lock"
  );

const requestCanvasPointerLock = () => {
  if (
    document.pointerLockElement === canvasElement ||
    pointerLockRequestPending
  ) {
    return;
  }
  pointerLockRequestPending = true;
  canvas.focus();
  void canvasElement
    .requestPointerLock()
    .catch((error: unknown) => {
      if (isPointerLockExitCooldownError(error)) {
        return;
      }
      console.error(
        "ポインターロックの要求に失敗しました。",
        error
      );
    })
    .finally(() => {
      pointerLockRequestPending = false;
    });
};

const startPlay = (requestPointerLock: boolean) => {
  if (!audioActivated) {
    audioActivated = true;
    if (bgmUrl !== null) {
      audio.startBgm(bgmUrl);
    }
  }
  if (!started) {
    started = true;
    titleOverlay.style.display = "none";
    statusInfo.style.display = V2_DEBUG_MODE ? "block" : "none";
    helpPanel.style.display = "block";
    helpPanel.textContent = V2_GAMEPLAY_BASE_HELP_TEXT;
  }
  if (requestPointerLock) {
    requestCanvasPointerLock();
  }
};

const updateGameplayHelp = (frame: ReturnType<typeof survival.getFrame>) => {
  if (
    V2_DEBUG_MODE && (
      performanceScenario?.profile === "fixed-4200" ||
      runtimeStressScenario !== null ||
      rampValidationTarget !== null ||
      elevatorNpcAcceptanceScenario !== null ||
      schoolVisualAcceptanceScenario !== null
    )
  ) {
    return;
  }
  let nextText = V2_GAMEPLAY_BASE_HELP_TEXT;
  if (sessionStartSnapshot.startMode === "instant-public-execution") {
    nextText += "\nR: リプレイ  Enter: タイトルへ戻る";
  } else if (frame.phase === "playing") {
    if (frame.playerCompletionUnlocked) {
      nextText += "\nG：銃あり  N：銃なし  H：ハイグレ";
    }
    nextText += "\nR: リトライ  Enter: タイトルへ戻る";
  } else if (frame.phase === "assembly") {
    nextText += "\nEnter: タイトルへ戻る";
  } else if (frame.phase === "execution-complete") {
    nextText += "\nR: リプレイ  Enter: タイトルへ戻る";
  }
  if (!V2_DEBUG_MODE) {
    const unbrainwashedNpcCount = frame.npcHudCounts.unbrainwashed;
    nextText += `\nNPC内訳 未洗脳者 ${unbrainwashedNpcCount}人  ` +
      `洗脳済み ${frame.npcCount - unbrainwashedNpcCount}人\n` +
      `ビット ${frame.bitCount}体`;
  }
  if (helpPanel.textContent !== nextText) {
    helpPanel.textContent = nextText;
  }
};

const requiresSettingsRebuild = () => !doV2SessionStartSnapshotsMatch(
  sessionStartSnapshot,
  createSessionStartSnapshot(sessionSeed)
);
const syncTitleStartHint = () => {
  titleOverlayController.setStartHintMessage(
    requiresSettingsRebuild()
      ? "左クリック：開始\n（開始前に設定反映を行います）"
      : "左クリック：開始"
  );
};
eventScope.listen(titleOverlay, "input", syncTitleStartHint);
eventScope.listen(titleOverlay, "change", syncTitleStartHint);
eventScope.listen(titleOverlay, "click", syncTitleStartHint);
syncTitleStartHint();

const handleCanvasClick: EventListener = () => {
  const wasStarted = started;
  const hadPointerLock =
    document.pointerLockElement === canvasElement;
  if (
    !wasStarted &&
    requiresSettingsRebuild()
  ) {
    requestCanvasPointerLock();
    requestSessionRebuild(
      Object.freeze({
        startAfterCreate: true,
        preservePointerLock: true,
        retrySnapshot: null,
        retrySeed: null
      })
    );
    return;
  }
  startPlay(!hadPointerLock);
  const frame = survival.getFrame();
  if (
    wasStarted &&
    hadPointerLock &&
    canV2RuntimePlayerFire(frame)
  ) {
    camera.getDirectionToRef(cameraForwardAxis, playerGunDirection);
    survival.requestPlayerGunFire(playerGunDirection);
  }
};

eventScope.listen(canvas, "click", handleCanvasClick);

if (startImmediately) {
  startPlay(false);
}

const handlePointerLockChange: EventListener = () => {
  if (
    document.pointerLockElement !==
    canvasElement
  ) {
    input.reset();
    runtimeHud.clear();
  }
};
eventScope.listen(
  document,
  "pointerlockchange",
  handlePointerLockChange
);
eventScope.listen(window, "blur", () => {
  input.reset();
});

if (performanceScenario) {
  configurePerformanceView();
  if (performanceScenario.profile === "fixed-4200") {
    started = true;
    titleOverlay.style.display = "none";
    statusInfo.style.display = V2_DEBUG_MODE ? "block" : "none";
    helpPanel.style.display = "block";
  }
  document.body.dataset.v2PerformanceContext = JSON.stringify({
    catalogFingerprint: createStageCatalogFingerprint(SCHOOL_STAGE),
    sessionSeed,
    snapshot: sessionStartSnapshot,
    roomVariantSelections,
    camera: { position: camera.position.asArray(), rotation: camera.rotation.asArray(), fov: camera.fov },
    features: survival.getFeatureResources(),
    initialFrame: survival.getFrame(),
    materialMode: import.meta.env.DEV ? "local-catalog" : "distribution-default",
    characterAssignments,
    defaultPortraitActorCount: characterAssignments.filter((assignment) => assignment.portraitDirectory === "00_default").length,
    bgmUrl,
    bgmCount: audioAssets.bgmUrls.length,
    voiceDirectoryCount: audioAssets.voiceDirectories.length,
    portraitDirectoryCount: V2_PORTRAIT_ASSET_INVENTORY.directories.length,
    portraitFileCount: [...V2_PORTRAIT_ASSET_INVENTORY.filesByDirectory.values()]
      .reduce((sum, files) => sum + files.size, 0)
  });
  helpPanel.textContent =
    `性能受入計測\nseed ${performanceScenario.seed}\n` +
    `view ${performanceScenario.view}`;
}
if (runtimeStressScenario) {
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = V2_DEBUG_MODE ? "block" : "none";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `実学校stress ${runtimeStressScenario.profile}\n` +
    `seed ${runtimeStressScenario.seed}\n` +
    `NPC ${runtimeStressScenario.population.npcCount} / ` +
    `初期洗脳 ${runtimeStressScenario.population.initialBrainwashedNpcCount} / ` +
    `BIT ${runtimeStressScenario.population.initialBitCount}`;
  publishRuntimeStressReport("running", null);
}
if (schoolVisualAcceptanceScenario) {
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = V2_DEBUG_MODE ? "block" : "none";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `学校Visual受入 ${schoolVisualAcceptanceScenario.id}\n` +
    `seed ${schoolVisualAcceptanceScenario.seed}\n` +
    "座標・向き・FOVを証拠JSONへ固定";
}
if (elevatorNpcAcceptanceScenario) {
  const initialFrame = survival.getFrame();
  if (
    initialFrame.npcCount !== V2_TEST_SURVIVAL_POPULATION.npcCount ||
    initialFrame.brainwashedNpcCount !==
      V2_TEST_SURVIVAL_POPULATION.initialBrainwashedNpcCount ||
    initialFrame.bitCount !==
      V2_TEST_SURVIVAL_POPULATION.initialBitCount
  ) {
    throw new Error(
      "エレベーターNPC受入の初期人口が通常ゲーム設定と一致しません。"
    );
  }
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = V2_DEBUG_MODE ? "block" : "none";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `エレベーターNPC受入 ${elevatorNpcAcceptanceScenario.id}\n` +
    `seed ${elevatorNpcAcceptanceScenario.seed}\n` +
    `Player＋同行者${elevatorNpcAcceptanceScenario.followerCount}人 / ` +
    "通常人口を維持して自動実行";
}

const renderScene = () => {
  playerCharacterVisual.getCameraRenderOffsetToRef(cameraRenderOffset);
  logicalRenderCameraPosition.copyFrom(camera.position);
  camera.position.addInPlace(cameraRenderOffset);
  try {
    scene.render();
  } finally {
    camera.position.copyFrom(logicalRenderCameraPosition);
  }
};

engine.runRenderLoop(() => {
  try {
    const frameDiagnostics = started ? performanceDiagnostics : null;
    frameDiagnostics?.beginFrame();
    const actions = input.drainPressedActions();
    if (frameDiagnostics) {
      for (const kind of stageRayQueryKinds) {
        frameDiagnostics.count(`ray.${kind}.queries`, 0);
        frameDiagnostics.count(
          `ray.${kind}.candidates`,
          0
        );
        frameDiagnostics.count(
          `ray.${kind}.intersections`,
          0
        );
        frameDiagnostics.count(
          `ray.${kind}.indexed-triangles`,
          0
        );
        frameDiagnostics.count(
          `ray.${kind}.exact-triangle-tests`,
          0
        );
      }
    }
    const delta = performanceScenario?.profile === "fixed-4200"
      ? V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS / 1000
      : Math.min(engine.getDeltaTime() / 1000, 0.05);
    updateElevatorNpcAcceptanceBeforeTraversal();
    const traversalFrame = frameDiagnostics
      ? frameDiagnostics.measure("traversal", () => traversalCoordinator.update(delta))
      : traversalCoordinator.update(delta);
    const playerElevatorTraversal =
      traversalCoordinator.getPlayerElevatorTraversalSnapshot();
    const nextPlayerElevatorMoving =
      playerElevatorTraversal?.phase === "riding" &&
      traversalFrame.runtimeSnapshot.elevators.some(
        (elevator) =>
          elevator.id === playerElevatorTraversal.elevatorId &&
          elevator.carState === "moving" &&
          elevator.carDoorState === "closed"
      );
    if (started && nextPlayerElevatorMoving && !playerElevatorMoving) {
      survival.notifyPlayerElevatorStartedMoving();
    }
    playerElevatorMoving = nextPlayerElevatorMoving;
    const horizontalSpeedScale = resolveV2HorizontalSpeedScale(
      stage.queries.containsVolume(
        "water",
        player.getFootPosition()
      )
    );
    if (
      started &&
      actions.includes("release-assembly-control")
    ) {
      survival.releaseAssemblyPlayerControl();
    }
    let survivalFrame = survival.getFrame();
    const dashContext = {
      gameplayActive: started && survivalFrame.phase === "playing",
      playerState: survivalFrame.playerState
    };
    const playerFrame = frameDiagnostics
      ? frameDiagnostics.measure("player", () =>
          player.update(
            delta,
            started && survival.canPlayerMove(),
            horizontalSpeedScale,
            dashContext
          )
        )
      : player.update(
          delta,
          started && survival.canPlayerMove(),
          horizontalSpeedScale,
          dashContext
        );
    if (started) {
      elapsedSeconds += delta;
      survivalFrame = frameDiagnostics
        ? frameDiagnostics.measure(
            "survival",
            () =>
              survival.update(
                delta,
                elapsedSeconds,
                playerElevatorTraversal,
                traversalFrame.runtimeSnapshot.elevators
              )
          )
        : survival.update(
            delta,
            elapsedSeconds,
            playerElevatorTraversal,
            traversalFrame.runtimeSnapshot.elevators
          );
    }
    if (performanceStressWorkload !== null && frameDiagnostics !== null &&
        frameDiagnostics.getProgress().status !== "complete") {
      frameDiagnostics.measure("diagnostics", () =>
        performanceStressWorkload.update(frameDiagnostics.getProgress().elapsedSeconds)
      );
    }
    updateElevatorNpcAcceptanceAfterTraversal();
    const endFlowDecision = started
      ? dispatchV2RuntimeEndFlow(
          actions,
          survivalFrame,
          sessionStartSnapshot.startMode
        )
      : "ignored";
    if (endFlowDecision === "replay-execution") {
      if (sessionStartSnapshot.startMode === "instant-public-execution") {
        audio.stopAllSe();
        survival.replayExecution();
        voiceRuntime.resetForReplay();
      } else {
        survival.replayExecution();
      }
      survivalFrame = survival.getFrame();
    } else if (endFlowDecision === "retry-normal-session") {
      started = false;
      input.reset();
      requestSessionRebuild(
        Object.freeze({
          startAfterCreate: true,
          preservePointerLock: false,
          retrySnapshot: sessionStartSnapshot,
          retrySeed: null
        })
      );
    } else if (endFlowDecision === "return-to-title") {
      started = false;
      input.reset();
      requestSessionRebuild();
    }
    if (missionAcceptanceLookAtPosition !== null) {
      camera.setTarget(missionAcceptanceLookAtPosition);
    }
    const currentPlayerTarget = survival.getHumanTargets()[0];
    camera.getDirectionToRef(cameraForwardAxis, characterViewForward);
    camera.getDirectionToRef(cameraUpAxis, characterViewUp);
    characterFacingYaw = resolveV2CharacterFacingYaw({
      viewForward: characterViewForward,
      viewUp: characterViewUp,
      fallbackYaw: characterFacingYaw
    });
    characterVisuals.setFacingYaw(characterFacingYaw);
    playerCharacterVisual.update({
      active: started,
      state: survivalFrame.playerState,
      noGunTouchBrainwashProgress:
        survivalFrame.playerNoGunTouchBrainwashProgress,
      footPosition: currentPlayerTarget.footPosition,
      viewForward: characterViewForward,
      facingYaw: characterFacingYaw
    });
    updateGameplayHelp(survivalFrame);
    let presentationSectionStartedAt = frameDiagnostics?.beginSection("interaction") ?? 0;
    const interactionActive =
      started &&
      document.pointerLockElement ===
        (canvas as unknown as Element);
    const npcCandidates = interactionActive
      ? survival.getNpcCommandCandidates()
      : EMPTY_NPC_COMMAND_CANDIDATES;
    const doorCandidates = interactionActive
      ? dynamicRuntime.doors.getDoorInteractionCandidates({
          origin: currentPlayerTarget.aimPosition,
          forward: characterViewForward
        })
      : EMPTY_DOOR_INTERACTION_CANDIDATES;
    const broadcastCandidate = interactionActive
      ? resolveV2BroadcastInteractionCandidate({
          phase: survivalFrame.phase,
          playerState: survivalFrame.playerState,
          playerFootPosition: currentPlayerTarget.footPosition,
          camera,
          broadcastConsole: locationAssets.broadcastConsole,
          queries: stage.queries
        })
      : null;
    let interactionFeedback: readonly V2RuntimeInteractionFeedback[] =
      EMPTY_RUNTIME_INTERACTION_FEEDBACK;
    if (interactionActive) {
      interactionFeedback = dispatchV2RuntimeInteractions({
        actions,
        frame: survivalFrame,
        broadcastCandidate,
        npcCandidates,
        doorCandidates,
        survival,
        doors: dynamicRuntime.doors
      });
      survivalFrame = survival.getFrame();
    }
    frameDiagnostics?.finishSection("interaction", presentationSectionStartedAt);
    const minimapActive = started && survivalFrame.phase === "playing";
    presentationSectionStartedAt = frameDiagnostics?.beginSection("minimap") ?? 0;
    minimap.update({
      active: minimapActive,
      elapsedSeconds,
      playerGrounded: playerFrame.verticalState.grounded,
      playerFootPosition: currentPlayerTarget.footPosition,
      playerEyePosition: currentPlayerTarget.aimPosition,
      forward: characterViewForward,
      up: characterViewUp,
      actors: minimapActive
        ? survival.getMinimapActors()
        : EMPTY_MINIMAP_ACTORS,
      elevators: dynamicRuntime.getSnapshot().elevators,
      missionTargetActorIds:
        survivalFrame.mission?.missionTargetActorIds ?? Object.freeze([]),
      missionTargetLocationIds:
        survivalFrame.mission?.missionTargetLocationIds ?? Object.freeze([])
    });
    frameDiagnostics?.finishSection("minimap", presentationSectionStartedAt);
    presentationSectionStartedAt = frameDiagnostics?.beginSection("runtime-hud") ?? 0;
    runtimeHud.update({
      active: interactionActive,
      frame: survivalFrame,
      broadcastCandidate,
      npcCandidates,
      doorCandidates,
      feedback: interactionFeedback
    });
    playerStatusHud.update({
      active: started,
      frame: survivalFrame,
      stamina: playerFrame.stamina
    });
    characterVisuals.updateNoGunRestraint(
      started && survivalFrame.phase === "playing"
        ? survivalFrame.noGunRestrainedTargetIds
        : [],
      elapsedSeconds
    );
    frameDiagnostics?.finishSection("runtime-hud", presentationSectionStartedAt);
    if (missionHud !== null && survivalFrame.mission !== null) {
      presentationSectionStartedAt = frameDiagnostics?.beginSection("mission-hud") ?? 0;
      missionHud.update({
        mode: resolveV2MissionHudMode(
          started,
          survivalFrame.phase,
          sessionStartSnapshot.startMode,
          settingsSnapshot.features.missionEnabled
        ),
        frame: survivalFrame.mission
      });
      frameDiagnostics?.finishSection("mission-hud", presentationSectionStartedAt);
    }
    if (missionAcceptanceScenario !== null) {
      if (survivalFrame.mission === null) {
        throw new Error("Mission受入fixtureではMissionが有効である必要があります。");
      }
      const acceptanceMissionFrame = survivalFrame.mission;
      const acceptanceConsole = locationAssets.broadcastConsole;
      const acceptanceRay = camera.getForwardRay();
      const acceptanceIntersection = acceptanceRay.intersectsMesh(
        acceptanceConsole.targetMesh,
        false
      );
      const acceptanceAimPosition = acceptanceIntersection.pickedPoint;
      const acceptanceSightHit =
        acceptanceAimPosition === null
          ? null
          : stage.queries.castSightSegment(
              camera.globalPosition,
              acceptanceAimPosition
            );
      const npcStateCounts: Record<string, number> = {};
      for (const target of survival.getHumanTargets()) {
        if (target.kind !== "npc") {
          continue;
        }
        npcStateCounts[target.state] =
          (npcStateCounts[target.state] ?? 0) + 1;
      }
      const missionHudRoot = document.querySelector<HTMLElement>(
        '[data-v2-mission-hud="root"]'
      );
      const missionHistory = survival.getMissions();
      document.body.dataset.v2MissionAcceptanceSnapshot =
        JSON.stringify({
          scenario: missionAcceptanceScenario,
          started,
          phase: survivalFrame.phase,
          playerState: survivalFrame.playerState,
          pointerLockId:
            document.pointerLockElement instanceof HTMLElement
              ? document.pointerLockElement.id
              : null,
          broadcastCandidate:
            broadcastCandidate === null
              ? null
              : {
                  consoleId: broadcastCandidate.consoleId,
                  primary: broadcastCandidate.primary.command,
                  secondary:
                    broadcastCandidate.secondary?.command ?? null
                },
          broadcastDiagnostics: {
            distance: Vector3.Distance(
              currentPlayerTarget.footPosition,
              acceptanceConsole.markerNode.getAbsolutePosition()
            ),
            cameraPosition: camera.globalPosition.asArray(),
            rayDirection: acceptanceRay.direction.asArray(),
            rayHit: acceptanceIntersection.hit,
            targetPoint: acceptanceAimPosition?.asArray() ?? null,
            targetBounds: {
              minimum: acceptanceConsole.targetMesh
                .getBoundingInfo()
                .boundingBox.minimumWorld.asArray(),
              maximum: acceptanceConsole.targetMesh
                .getBoundingInfo()
                .boundingBox.maximumWorld.asArray()
            },
            sightBlocker:
              acceptanceSightHit === null
                ? null
                : {
                    meshName: acceptanceSightHit.mesh.name,
                    point: acceptanceSightHit.point.asArray(),
                    distance: acceptanceSightHit.distance
                  }
          },
          lastSchoolInstruction:
            acceptanceMissionFrame.lastSchoolInstruction,
          assemblyVenueId: survivalFrame.assemblyVenueId,
          activeNpcNormalMissionCount:
            acceptanceMissionFrame.activeNpcMissions.filter(
              (mission) => mission.source === "normal"
            ).length,
          activeNpcBroadcastMissionCount:
            acceptanceMissionFrame.activeNpcMissions.filter(
              (mission) => mission.source === "broadcast"
            ).length,
          broadcastMissionCount: missionHistory.filter(
            (mission) => mission.source === "broadcast"
          ).length,
          cancelledBroadcastMissionCount: missionHistory.filter(
            (mission) =>
              mission.source === "broadcast" &&
              mission.state === "cancelled"
          ).length,
          activePlayerMissionDescriptors:
            acceptanceMissionFrame.playerMissions
              .filter((mission) => mission.state === "active")
              .map((mission) => ({
                id: mission.id,
                kind: mission.kind,
                targetKind: mission.target.kind
              })),
          missionTargetActorIds:
            acceptanceMissionFrame.missionTargetActorIds,
          missionTargetLocationIds:
            acceptanceMissionFrame.missionTargetLocationIds,
          missionHudItemCount: document.querySelectorAll(
            '[data-v2-mission-hud-role="mission-item"]'
          ).length,
          missionHudVisible:
            missionHudRoot !== null && !missionHudRoot.hidden,
          npcCandidateCount: npcCandidates.length,
          doorCandidateCount: doorCandidates.length,
          npcStateCounts,
          minimapReadout: minimapReadout.textContent ?? ""
        });
    }
    presentationSectionStartedAt = frameDiagnostics?.beginSection("audio") ?? 0;
    const audioEvents = survival.drainAudioEvents();
    if (audioActivated) {
      gameplayAudioBridge.dispatch(audioEvents);
      voiceRuntime.update(
        delta,
        survivalFrame.phase === "playing",
        survival.getHumanTargets()
      );
      audio.updateSpatial();
    }
    frameDiagnostics?.finishSection("audio", presentationSectionStartedAt);
    frameDiagnostics?.count("scenario.audio-active", audioActivated ? 1 : 0);
    presentationSectionStartedAt = frameDiagnostics?.beginSection("alarm-visual") ?? 0;
    alarmFloorVisual?.update({
      frame: survivalFrame.alarm,
      playerFootPosition: currentPlayerTarget.footPosition,
      elapsedSeconds
    });
    frameDiagnostics?.finishSection("alarm-visual", presentationSectionStartedAt);
    if (runtimeStressScenario) {
      runtimeStressFrameCount += 1;
      if (
        runtimeStressStatus === "running" &&
        runtimeStressStartedAt !== null &&
        (performance.now() - runtimeStressStartedAt) / 1000 >=
          runtimeStressScenario.durationSeconds
      ) {
        runtimeStressStatus = "passed";
        publishRuntimeStressReport(runtimeStressStatus, null);
      }
    }
    statusTimer += delta;
    if (statusTimer >= 0.1) {
      statusTimer = 0;
      const foot = currentPlayerTarget.footPosition;
      const performanceProgress =
        performanceDiagnostics?.getProgress();
      if (
        performanceDiagnostics &&
        performanceProgress?.status === "draining" &&
        !performanceReportPublished
      ) {
        performanceReportPublished = true;
        void performanceDiagnostics.finalize().then(publishPerformanceReport);
      }
      const performanceText = performanceProgress
        ? `\nPERF ${performanceProgress.status} ` +
          `${performanceProgress.elapsedSeconds.toFixed(1)}s  ` +
          `${performanceProgress.renderWidth}x` +
          `${performanceProgress.renderHeight}`
        : "";
      statusInfo.textContent =
        `学校3D空間\n` +
        `X ${foot.x.toFixed(3)}  Y ${foot.y.toFixed(3)}  Z ${foot.z.toFixed(3)}\n` +
        `${playerFrame.verticalState.grounded ? "接地" : "空中"}\n` +
        `フェーズ ${survivalFrame.phase}  ` +
        `状態 ${survivalFrame.playerState}\n` +
        `集合地点 ${survivalFrame.assemblyVenueId}\n` +
        `NPC ${survivalFrame.npcCount}  BIT ${survivalFrame.bitCount}  ` +
        `BEAM ${survivalFrame.activeBeamCount}\n` +
        `NPC内訳 未洗脳 ${survivalFrame.npcHudCounts.unbrainwashed}  ` +
        `ハイグレ ${survivalFrame.npcHudCounts.haigure}  ` +
        `gun ${survivalFrame.npcHudCounts.gun}  ` +
        `no-gun ${survivalFrame.npcHudCounts.noGun}\n` +
        `視認 ${survivalFrame.visualTargetCount}  ` +
        `警戒対象 ${survivalFrame.alertTargetCount}  ` +
        `共有 ${survivalFrame.activeAlertCount}\n` +
        `プレイヤー標的 NPC ${survivalFrame.npcPlayerTargetCount}  ` +
        `BIT ${survivalFrame.bitPlayerTargetCount}\n` +
        `警報 稼働 ${survivalFrame.activeAlarmCount}  ` +
        `点滅 ${survivalFrame.alarmBlinkCount}  ` +
        `発報 ${survivalFrame.alarmTriggerCount}\n` +
        `着弾 壁 ${survivalFrame.blockerImpactCount}  ` +
        `標的 ${survivalFrame.actorImpactCount}` +
        performanceText;
      if (runtimeStressScenario) {
        publishRuntimeStressReport(runtimeStressStatus, null);
      }
    }
    if (frameDiagnostics) {
      frameDiagnostics.measure("render", renderScene);
      frameDiagnostics.finishFrame(elapsedSeconds);
    } else {
      renderScene();
    }
  } catch (error) {
    engine.stopRenderLoop();
    const performanceStatus = performanceDiagnostics?.getProgress().status;
    if (performanceStatus === "collecting" || performanceStatus === "draining") {
      performanceDiagnostics!.abort(formatLoadError(error));
    }
    publishPerformanceReport();
    minimap.clear();
    runtimeStressStatus = "failed";
    publishRuntimeStressReport(
      runtimeStressStatus,
      formatLoadError(error)
    );
    console.error("V2ゲーム更新中に例外が発生したため、更新を停止しました。", error);
    throw error;
  }
});

const resize = () => engine.resize();
eventScope.listen(window, "resize", resize);

if (
  !stage || !dynamicRuntime || !survival || !input || !ownedRuntimeHud ||
  !ownedAudio || eventScope.getSubscriptionCount() === 0 ||
  DYNAMIC_OWNER_CATEGORIES.some(
    (category) => !acquiredDynamicOwners.has(category)
  )
) {
  throw new Error("V2動的owner ledgerの取得前提が成立しません。");
}

return Object.freeze({
  deactivate: deactivateRuntime,
  disposeSynchronously: disposeRuntimeSynchronously,
  dispose: disposeRuntime,
  getOwnershipDiagnostics: () => Object.freeze({
    generation: dynamicSessionIdentity,
    active: Object.freeze([...acquiredDynamicOwners])
  })
});
} catch (error) {
  if (!runtimeTerminated) {
    console.error(
      "V2 Runtime sessionの構築に失敗しました。",
      error
    );
    loadingSession.finish();
    titleOverlayController.setError(formatLoadError(error));
  }
  await disposeRuntime();
  throw error;
}
};

let activeSession: V2RuntimeSession | null = null;
let sessionTransition: Promise<void> | null = null;
let runtimeTerminated = false;
let failedSessionRequest: Readonly<{
  seed: number;
  snapshot: V2SessionStartSnapshot;
}> | null = null;

const showSessionLoading = () => {
  titleOverlay.style.display = "grid";
  statusInfo.style.display = "none";
  helpPanel.style.display = "none";
  minimapCanvas.style.display = "none";
  minimapReadout.style.display = "none";
  minimapReadout.textContent = "";
};

const rebuildSession = (
  options: V2RuntimeSessionRebuildOptions = Object.freeze({
    startAfterCreate: false,
    preservePointerLock: false,
    retrySnapshot: null,
    retrySeed: null
  })
) => {
  if (sessionTransition !== null || runtimeTerminated) {
    return;
  }
  let requestedSeed: number | null = null;
  let requestedSnapshot: V2SessionStartSnapshot | null = null;
  sessionTransition = (async () => {
    const previousSession = activeSession;
    activeSession = null;
    activeSession = await transitionV2RuntimeSession({
      currentSession: previousSession,
      nextRuntimeSeed: () => options.retrySeed ?? nextRuntimeSessionSeed(),
      isCancelled: () => runtimeTerminated,
      exitPointerLock: () => {
        if (!options.preservePointerLock) {
          document.exitPointerLock();
        }
      },
      showLoading: showSessionLoading,
      afterCurrentDispose: recordStaticOnlyBaseline,
      createSession: (sessionSeed) => {
        requestedSeed = sessionSeed;
        requestedSnapshot =
          options.retrySnapshot === null
            ? createSessionStartSnapshot(sessionSeed)
            : options.retrySnapshot;
        return createRuntimeSession(
          sessionSeed,
          requestedSnapshot,
          rebuildSession,
          options.startAfterCreate
        );
      }
    });
    failedSessionRequest = null;
  })()
    .catch((error: unknown) => {
      if (runtimeTerminated) {
        return;
      }
      console.error(
        "V2 Runtime sessionの再初期化に失敗しました。",
        error
      );
      if (requestedSeed !== null && requestedSnapshot !== null) {
        failedSessionRequest = Object.freeze({
          seed: requestedSeed,
          snapshot: requestedSnapshot
        });
      }
      document.exitPointerLock();
      titleOverlay.style.display = "grid";
      titleOverlayController.setError(
        `${formatLoadError(error)}\nタイトル画面をクリックすると再試行します。`
      );
    })
    .finally(() => {
      sessionTransition = null;
    });
};

dispatchTitleSettingsRebuild = () => {
  if (activeSession !== null) {
    rebuildSession();
  }
};

installV2RuntimeApplicationTermination({
  eventTarget: window,
  markTerminated: () => {
    runtimeTerminated = true;
    runtimeConstructionEpoch += 1;
  },
  stopRenderLoop: () => engine.stopRenderLoop(),
  markPageUnloading: markV2PageUnloading,
  takeConstructionRollback: () => {
    const rollback = constructingRuntimeRollback;
    constructingRuntimeRollback = null;
    return activeSession === null ? rollback : null;
  },
  takeDynamicSession: () => {
    const session = activeSession;
    activeSession = null;
    return session;
  },
  disposeApplicationUi: () => {
    canvas.removeEventListener("click", handleFailedSessionRetry);
    try {
      appTitleLayoutController.dispose();
    } finally {
      appTitleSettingsPanel.dispose();
    }
  },
  takeStaticResources: () => {
    const staticResources = ownedStageStatic;
    ownedStageStatic = null;
    return staticResources;
  },
  disposeAmbientLight: () => ambientLight.dispose(),
  disposeScene: () => scene.dispose(),
  disposeEngine: () => engine.dispose()
});

canvas.addEventListener("click", handleFailedSessionRetry);

const initialSessionSeed = nextRuntimeSessionSeed();
const initialSnapshot = createSessionStartSnapshot(initialSessionSeed);
try {
  const initialSession = await createRuntimeSession(
    initialSessionSeed,
    initialSnapshot,
    rebuildSession,
    false
  );
  if (runtimeTerminated) {
    await initialSession.dispose();
  } else {
    activeSession = initialSession;
    markV2StartupPhase("runtime-session-ready");
  }
} catch (error) {
  if (!runtimeTerminated) {
    activeSession = null;
    failedSessionRequest = Object.freeze({
      seed: initialSessionSeed,
      snapshot: initialSnapshot
    });
    titleOverlayController.setError(
      `${formatLoadError(error)}\nタイトル画面をクリックすると再試行します。`
    );
  }
}

function handleFailedSessionRetry() {
  if (
    activeSession !== null ||
    sessionTransition !== null ||
    runtimeTerminated ||
    failedSessionRequest === null
  ) {
    return;
  }
  const failed = failedSessionRequest;
  const retry = selectV2FailedSessionRetryRequest(
    failed,
    createSessionStartSnapshot,
    nextRuntimeSessionSeed
  );
  rebuildSession(
    Object.freeze({
      startAfterCreate: true,
      preservePointerLock: false,
      retrySnapshot: retry.snapshot,
      retrySeed: retry.seed
    })
  );
}

type V2SchoolVisualAcceptancePose = Readonly<{
  footPosition: readonly [number, number, number];
  lookAtPosition: readonly [number, number, number];
  fov: number;
}>;

type V2SchoolVisualAcceptanceSnapshot = Readonly<{
  footPosition: readonly [number, number, number];
  eyePosition: readonly [number, number, number];
  forward: readonly [number, number, number];
  rotation: readonly [number, number, number];
  fov: number;
  minZ: number;
  maxZ: number;
  centerPick: Readonly<{
    meshName: string;
    point: readonly [number, number, number] | null;
  }> | null;
  renderSize: readonly [number, number];
}>;

declare global {
  interface Window {
    __v2PerformanceStressReplayInputs?: readonly V2StressInput[] | null;
    __v2SchoolVisualAcceptance?: Readonly<{
      setPose(
        pose: V2SchoolVisualAcceptancePose
      ): V2SchoolVisualAcceptanceSnapshot;
      getSnapshot(): V2SchoolVisualAcceptanceSnapshot;
    }>;
    __v2StaticReuseDiagnostics?: () => Readonly<{
      staticLoadCount: number;
      glbParseCount: number;
      staticIdentity: number;
      dynamicIdentity: number | null;
      sessionSeed: number | null;
      sessionStartSnapshot: string | null;
      transitionInProgress: boolean;
      runtimeTerminated: boolean;
      disposedDynamicIdentities: readonly number[];
      dynamicDisposeInvocationIdentities: readonly number[];
      humanNavigationWorldCount: number;
      staticDecodedHumanBundleOwnerCount: number;
      staticBitNavigationOwnerCount: number;
      staticOnlyBaseline: ReturnType<typeof countSceneResources> | null;
      staticOnlyBaselineMatchCount: number;
      staticOnlyBaselineMismatchCount: number;
      dynamicOwners: Readonly<{
        generation: number | null;
        active: readonly string[];
        disposedResiduals: readonly Readonly<{
          generation: number;
          residual: readonly string[];
        }>[];
      }>;
      scene: Readonly<{
        meshes: number;
        materials: number;
        textures: number;
        cameras: number;
        lights: number;
      }>;
    }>;
  }
}

window.__v2StaticReuseDiagnostics = () => {
  const ownership = getStageSpatialOwnershipDiagnostics();
  return Object.freeze({
  staticLoadCount: stageStaticLoadCount,
  glbParseCount: ownership.glbParseCount,
  staticIdentity: stageStaticIdentity,
  dynamicIdentity:
    document.body.dataset.v2DynamicSessionIdentity === undefined
      ? null
      : Number(document.body.dataset.v2DynamicSessionIdentity),
  sessionSeed:
    document.body.dataset.v2RuntimeSessionSeed === undefined
      ? null
      : Number(document.body.dataset.v2RuntimeSessionSeed),
  sessionStartSnapshot:
    document.body.dataset.v2SessionStartSnapshot ?? null,
  transitionInProgress: sessionTransition !== null,
  runtimeTerminated,
  disposedDynamicIdentities: Object.freeze([
    ...disposedDynamicSessionIdentities
  ]),
  dynamicDisposeInvocationIdentities: Object.freeze([
    ...dynamicSessionDisposeInvocationIdentities
  ]),
  humanNavigationWorldCount: ownership.sessionHumanNavigationWorldOwnerCount,
  staticDecodedHumanBundleOwnerCount:
    ownership.staticDecodedHumanBundleOwnerCount,
  staticBitNavigationOwnerCount: ownership.staticBitNavigationOwnerCount,
  staticOnlyBaseline,
  staticOnlyBaselineMatchCount,
  staticOnlyBaselineMismatchCount,
  dynamicOwners: Object.freeze({
    generation: activeSession?.getOwnershipDiagnostics().generation ?? null,
    active: activeSession?.getOwnershipDiagnostics().active ?? Object.freeze([]),
    disposedResiduals: Object.freeze([...disposedDynamicOwnerResiduals])
  }),
  scene: countSceneResources()
  });
};
