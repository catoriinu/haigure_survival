import "../style.css";

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

import { SCHOOL_STAGE } from "../world/stageCatalog";
import {
  createSchoolRoomVariantSelections,
  createSchoolRuntimeRandom,
  createSchoolRuntimeSettings
} from "../world/schoolRuntimeSettings";
import { AudioManager } from "../audio/audio";
import {
  V2_AUDIO_ASSET_CATALOG,
  applyV2AudioVolumeLevels,
  createV2AudioVolumeSettingsStore,
  createV2GameplayAudioBridge,
  createV2VoiceRuntime,
  getV2VoiceProfileIds
} from "../audio/v2AudioRuntime";
import { createVolumePanel } from "../ui/volumePanel";
import {
  V2_PORTRAIT_ASSET_INVENTORY,
  createV2CharacterSettingsPanel,
  createV2CharacterSettingsStore
} from "../ui/v2CharacterSettings";
import {
  canV2RuntimePlayerFire,
  createV2RuntimeHudController
} from "../ui/v2RuntimeHud";
import { createV2MissionHudController } from "../ui/v2MissionHud";
import {
  createV2MinimapController,
  selectV2MinimapStructuralBlockers
} from "../ui/v2Minimap";
import {
  createSchoolStageDynamicRuntime,
  createSchoolStageDynamicSpatialInitializer,
  type SchoolStageDynamicRuntime
} from "../world/schoolStageDynamicRuntime";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../world/stageSpatialContext";
import {
  createV2PerformanceDiagnostics,
  readV2PerformanceScenario,
  V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS
} from "./performanceDiagnostics";
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
  dispatchV2RuntimeExecutionReplay,
  dispatchV2RuntimeInteractions,
  resolveV2BroadcastInteractionCandidate,
  resolveV2HorizontalSpeedScale,
  V2_BROADCAST_INTERACTION_DISTANCE,
  type V2RuntimeInteractionFeedback
} from "./runtimeInteraction";
import {
  createV2RuntimeSessionEventScope,
  transitionV2RuntimeSession
} from "./runtimeSessionLifecycle";
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

const V2_GAMEPLAY_HELP_TEXT =
  "操作説明\n" +
  "WASD: 移動  Shift: ダッシュ\n" +
  "F: 主操作  E: 副操作  C: 扉\n" +
  "G：銃あり  N：銃なし  H：ハイグレ\n" +
  "Enter: タイトルへ戻る";
const V2_GAMEPLAY_EXECUTION_HELP_TEXT =
  `${V2_GAMEPLAY_HELP_TEXT}\nR: リプレイ`;
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
    rampValidationTarget
  ].filter((scenario) => scenario !== null).length > 1
) {
  throw new Error(
    "performance、schoolStress、missionAcceptance、rampValidationは同時に実行できません。"
  );
}
const fixedRuntimeSeed =
  performanceScenario?.seed ??
  runtimeStressScenario?.seed ??
  (missionAcceptanceScenario === null && rampValidationTarget === null
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
const roomVariantLevel = resolveV2RoomVariantLevel(location.search);
const runtimePopulation = performanceScenario
  ? V2_PERFORMANCE_ACCEPTANCE_POPULATION
  : rampValidationTarget
    ? Object.freeze({
        npcCount: 0,
        initialBrainwashedNpcCount: 0,
        initialBitCount: 0,
        bitReinforcementIntervalSeconds: 10,
        maximumBitCount: 0
      })
    : runtimeStressScenario?.population ??
      V2_TEST_SURVIVAL_POPULATION;
const canvas = document.getElementById("renderCanvas") as unknown as HTMLCanvasElement;
const minimapCanvas = document.getElementById(
  "minimapCanvas"
) as unknown as HTMLCanvasElement;
const minimapReadout = document.getElementById("minimapReadout") as HTMLDivElement;
const statusInfo = document.getElementById("statusInfo") as HTMLDivElement;
const helpPanel = document.getElementById("helpPanel") as HTMLDivElement;
const staminaGauge = document.getElementById("staminaGauge") as HTMLDivElement;
const titleOverlay = document.getElementById("titleOverlay") as HTMLDivElement;
const titleHeading = document.getElementById("titleHeading") as HTMLDivElement;
const titleStartHint = document.getElementById("titleStartHint") as HTMLDivElement;
const titleMessage = document.getElementById("titleMessage") as HTMLDivElement;
const titleMode = document.getElementById("titleMode") as HTMLDivElement;
const titleVersion = document.getElementById("titleVersion") as HTMLDivElement;

if (performanceScenario) {
  canvas.style.width = "1920px";
  canvas.style.height = "1080px";
}
const engine = new Engine(canvas, true);

type V2RuntimeSession = Readonly<{
  dispose(): Promise<void>;
}>;

const createRuntimeSession = async (
  sessionSeed: number,
  requestSessionRebuild: () => void
): Promise<V2RuntimeSession> => {
const roomVariantSelections = createSchoolRoomVariantSelections(
  createSchoolRuntimeSettings(roomVariantLevel),
  sessionSeed
);
document.body.dataset.v2RuntimeSessionSeed = String(sessionSeed);
const scene = new Scene(engine);
const performanceDiagnostics = performanceScenario
  ? createV2PerformanceDiagnostics(
      engine,
      scene,
      performanceScenario,
      V2_PERFORMANCE_ACCEPTANCE_POPULATION
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
scene.collisionsEnabled = true;
scene.clearColor = new Color4(0.48, 0.72, 0.92, 1);

const camera = new FreeCamera("V2PlayerCamera", Vector3.Zero(), scene);
camera.minZ = 0.02;
camera.angularSensibility = 1500;
camera.speed = 0;
scene.activeCamera = camera;

const ambientLight = new HemisphericLight(
  "V2SchoolAmbientLight",
  new Vector3(0.35, 1, -0.25),
  scene
);
ambientLight.intensity = 0.9;
ambientLight.groundColor = new Color3(0.16, 0.2, 0.22);

titleHeading.textContent = "HAIGURE SURVIVAL V2";
titleStartHint.textContent = "";
titleMessage.textContent = "学校3D空間を読み込んでいます";
titleMode.textContent = "学校3Dサバイバル基盤";
titleVersion.textContent = "V2 3D SPATIAL RUNTIME";
titleOverlay.style.display = "flex";
minimapCanvas.style.display = "none";
minimapReadout.style.display = "none";
staminaGauge.style.display = "none";
statusInfo.style.display = "none";
helpPanel.style.display = "none";

const formatLoadError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const audioAssets = V2_AUDIO_ASSET_CATALOG;

const initializeRuntime = async () => {
  let ownedStage: StageSpatialContext | null = null;
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

  try {
    ownedStage = await loadStageSpatialContext(
      scene,
      SCHOOL_STAGE,
      {
        queryDiagnostics: stageQueryDiagnostics,
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(
            sessionSeed
          ),
        roomVariantSelections
      }
    );
    configureV2StageTransparentRenderingOrder(
      ownedStage.resources.visualMeshes
    );
    const playerSpawn = selectV2PlayerSpawn(
      ownedStage.playerSpawns.all,
      createSchoolRuntimeRandom(sessionSeed, "player-spawn")
    );
    document.body.dataset.v2PlayerSpawnId = playerSpawn.id;
    document.body.dataset.v2PlayerSpawnExclusionId =
      playerSpawn.exclusionVolume.id;
    ownedInput = createV2PlayerInput(window);
    const playerInput = ownedInput;
    ownedPlayer = createV2PlayerController({
      scene,
      camera,
      stage: ownedStage,
      playerSpawn,
      input: ownedInput
    });
    const playerController = ownedPlayer;
    ownedInput = null;
    const characterSettingsStore = createV2CharacterSettingsStore(
      localStorage,
      V2_PORTRAIT_ASSET_INVENTORY.directories,
      audioAssets.voiceDirectories
    );
    const characterSettings = characterSettingsStore.load();
    const characterAssignments = createV2CharacterAssignments({
      actorIds: Object.freeze([
        "player",
        ...Array.from(
          { length: runtimePopulation.npcCount },
          (_, index) => `npc_${index}`
        )
      ]),
      playerActorId: "player",
      voiceProfileIds: getV2VoiceProfileIds(),
      portraitDirectories: V2_PORTRAIT_ASSET_INVENTORY.directories,
      playerVoiceDirectory: characterSettings.voiceDirectory,
      playerPortraitDirectory: characterSettings.portraitDirectory,
      random: createSchoolRuntimeRandom(
        sessionSeed,
        "character-assignment"
      )
    });
    ownedCharacterVisuals = await createV2CharacterVisualRuntime({
      scene,
      assignments: characterAssignments,
      orientationMode:
        characterSettings.enableCharacterSpriteVerticalAngle
          ? "upright"
          : "camera-facing"
    });
    const characterVisuals = ownedCharacterVisuals;
    ownedSurvival = createV2SurvivalRuntime({
      scene,
      stage: ownedStage,
      playerSpawn,
      player: playerController,
      initialPlayerState:
        missionAcceptanceScenario === "haigure"
          ? "brainwash-complete-haigure"
          : "normal",
      characterVisuals,
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
      population: runtimePopulation,
      performanceDiagnostics,
      performanceWorkloadScenario: performanceScenario,
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
    if (V2_ALARM_FLOOR_VISUALIZATION_ENABLED) {
      ownedAlarmFloorVisual =
        createV2AlarmFloorVisualSystem(scene);
    }
    ownedDynamicRuntime = createSchoolStageDynamicRuntime({
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
    selectNavigationRoute = createSchoolNpcNavigationPolicy({
      seed: sessionSeed,
      elevatorAssets: ownedStage.elevatorAssets,
      dynamicRuntime: ownedDynamicRuntime,
      queries: ownedStage.queries,
      getHumanTargets: () =>
        survivalRuntime.getHumanTargets()
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
    const visualPreparation =
      ownedSurvival.prepareVisualResources();
    scene.render();
    await visualPreparation;
    return {
      stage: ownedStage,
      dynamicRuntime: ownedDynamicRuntime,
      traversalCoordinator: ownedTraversalCoordinator,
      input: playerInput,
      player: ownedPlayer,
      survival: ownedSurvival,
      characterVisuals,
      characterAssignments,
      characterSettings,
      characterSettingsStore,
      alarmFloorVisual: ownedAlarmFloorVisual,
      navigationPolicy: selectNavigationRoute
    };
  } catch (error) {
    console.error("V2実行環境の初期化に失敗しました。", error);
    titleStartHint.textContent = "読込エラー";
    titleMessage.textContent = formatLoadError(error);
    performanceDiagnostics?.dispose();
    ownedTraversalCoordinator?.dispose();
    ownedDynamicRuntime?.dispose();
    ownedAlarmFloorVisual?.dispose();
    ownedSurvival?.dispose();
    ownedCharacterVisuals?.dispose();
    selectNavigationRoute?.dispose();
    ownedPlayer?.dispose();
    ownedInput?.dispose();
    ownedStage?.dispose();
    delete window.__v2PerformanceDiagnostics;
    scene.dispose();
    throw error;
  }
};

const {
  stage,
  dynamicRuntime,
  traversalCoordinator,
  input,
  player,
  survival,
  characterVisuals,
  characterAssignments,
  characterSettings,
  characterSettingsStore,
  alarmFloorVisual,
  navigationPolicy
} =
  await initializeRuntime();

const eventScope = createV2RuntimeSessionEventScope();
let ownedRuntimeHud: ReturnType<
  typeof createV2RuntimeHudController
> | null = null;
let ownedMissionHud: ReturnType<
  typeof createV2MissionHudController
> | null = null;
let ownedMinimap: ReturnType<
  typeof createV2MinimapController
> | null = null;
let ownedAudio: AudioManager | null = null;
let ownedVolumePanel: ReturnType<
  typeof createVolumePanel
> | null = null;
let ownedCharacterSettingsPanel: ReturnType<
  typeof createV2CharacterSettingsPanel
> | null = null;
let ownedGameplayAudioBridge: ReturnType<
  typeof createV2GameplayAudioBridge
> | null = null;
let ownedVoiceRuntime: ReturnType<
  typeof createV2VoiceRuntime
> | null = null;
let ownedPlayerCharacterVisual: V2PlayerCharacterVisual | null = null;
let disposed = false;
const disposeRuntime = async () => {
  if (disposed) {
    return;
  }
  disposed = true;
  engine.stopRenderLoop();
  eventScope.dispose();
  ownedRuntimeHud?.dispose();
  ownedMissionHud?.dispose();
  ownedMinimap?.dispose();
  ownedPlayerCharacterVisual?.dispose();
  ownedCharacterSettingsPanel?.dispose();
  ownedVolumePanel?.dispose();
  ownedGameplayAudioBridge?.dispose();
  ownedVoiceRuntime?.dispose();
  const audioDisposal = ownedAudio?.dispose();
  performanceDiagnostics?.dispose();
  delete window.__v2PerformanceDiagnostics;
  delete document.body.dataset.v2PerformanceReport;
  delete document.body.dataset.v2RuntimeStressReport;
  delete document.body.dataset.v2NpcSpawnReport;
  delete document.body.dataset.v2MissionAcceptanceScenario;
  delete document.body.dataset.v2MissionAcceptancePlacement;
  delete document.body.dataset.v2MissionAcceptanceSnapshot;
  if (runtimeStressScenario) {
    delete document.documentElement.dataset.validationStatus;
  }
  traversalCoordinator.dispose();
  dynamicRuntime.dispose();
  alarmFloorVisual?.dispose();
  survival.dispose();
  characterVisuals.dispose();
  navigationPolicy.dispose();
  player.dispose();
  stage.dispose();
  scene.dispose();
  if (audioDisposal) {
    await audioDisposal;
  }
};

try {
camera.attachControl(canvas, true);
const runtimeHud = createV2RuntimeHudController({
  host: document.body,
  canvas,
  camera
});
ownedRuntimeHud = runtimeHud;
const missionHud = createV2MissionHudController({
  host: document.body
});
ownedMissionHud = missionHud;
if (stage.locationAssets === null) {
  throw new Error("学校V2 Runtimeにはlocation assetsが必要です。");
}
const locationAssets = stage.locationAssets;
const minimap = createV2MinimapController({
  canvas: minimapCanvas,
  readout: minimapReadout,
  camera,
  locationAssets,
  structuralBlockers: selectV2MinimapStructuralBlockers(
    stage.resources.humanNavigationSources
  ),
  queries: stage.queries
});
ownedMinimap = minimap;
const playerCharacterVisual = createV2PlayerCharacterVisual(
  characterVisuals
);
ownedPlayerCharacterVisual = playerCharacterVisual;
const audio = new AudioManager(camera);
ownedAudio = audio;
const audioVolumeStore =
  createV2AudioVolumeSettingsStore(localStorage);
let audioVolumeLevels = audioVolumeStore.load();
applyV2AudioVolumeLevels(audio, audioVolumeLevels);
const volumePanel = createVolumePanel({
  parent: titleOverlay,
  className: "volume-panel--title",
  initialLevels: { ...audioVolumeLevels },
  onChange: (category, level) => {
    audioVolumeLevels = audioVolumeStore.saveLevel(
      audioVolumeLevels,
      category,
      level
    );
    applyV2AudioVolumeLevels(audio, audioVolumeLevels);
  }
});
ownedVolumePanel = volumePanel;
const characterSettingsPanel = createV2CharacterSettingsPanel({
  parent: titleOverlay,
  initialSettings: characterSettings,
  portraitDirectories: V2_PORTRAIT_ASSET_INVENTORY.directories,
  voiceDirectories: audioAssets.voiceDirectories,
  onChange: (nextSettings) => {
    characterSettingsStore.save(nextSettings);
    requestSessionRebuild();
  }
});
ownedCharacterSettingsPanel = characterSettingsPanel;
const gameplayAudioBridge = createV2GameplayAudioBridge({
  audio,
  assets: audioAssets,
  getListenerPosition: () => player.getEyePosition()
});
ownedGameplayAudioBridge = gameplayAudioBridge;
const voiceRuntime = createV2VoiceRuntime({
  audio,
  random: Math.random,
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
const bgmUrl = audioAssets.selectBgmUrl(
  SCHOOL_STAGE.label,
  Math.random
);
let audioActivated = false;
canvas.tabIndex = 0;
titleMessage.textContent = "学校3D空間 読込完了";
titleStartHint.textContent = "左クリック：開始";
titleStartHint.style.display = "block";
titleMessage.style.display = "none";

let started = false;
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
  statusInfo.style.display = "block";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `箱山登坂検証 ${rampValidationTarget}\n` +
    "W: 登坂  Shift: ダッシュ";
}

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
    statusInfo.style.display = "block";
    helpPanel.style.display = "block";
    helpPanel.textContent = V2_GAMEPLAY_HELP_TEXT;
  }
  if (requestPointerLock) {
    canvas.focus();
    void (canvas as unknown as Element)
      .requestPointerLock()
      .catch((error: unknown) => {
        console.error("ポインターロックの要求に失敗しました。", error);
      });
  }
};

const updateGameplayHelp = (phase: ReturnType<typeof survival.getFrame>["phase"]) => {
  if (
    performanceScenario !== null ||
    runtimeStressScenario !== null ||
    rampValidationTarget !== null
  ) {
    return;
  }
  const nextText =
    phase === "execution" || phase === "execution-complete"
      ? V2_GAMEPLAY_EXECUTION_HELP_TEXT
      : V2_GAMEPLAY_HELP_TEXT;
  if (helpPanel.textContent !== nextText) {
    helpPanel.textContent = nextText;
  }
};

const handleCanvasClick: EventListener = () => {
  const wasStarted = started;
  const hadPointerLock =
    document.pointerLockElement ===
    (canvas as unknown as Element);
  startPlay(true);
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

const handlePointerLockChange: EventListener = () => {
  if (
    document.pointerLockElement !==
    (canvas as unknown as Element)
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
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = "block";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `性能受入計測\nseed ${performanceScenario.seed}\n` +
    `view ${performanceScenario.view}`;
}
if (runtimeStressScenario) {
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = "block";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `実学校stress ${runtimeStressScenario.profile}\n` +
    `seed ${runtimeStressScenario.seed}\n` +
    `NPC ${runtimeStressScenario.population.npcCount} / ` +
    `初期洗脳 ${runtimeStressScenario.population.initialBrainwashedNpcCount} / ` +
    `BIT ${runtimeStressScenario.population.initialBitCount}`;
  publishRuntimeStressReport("running", null);
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
    const actions = input.drainPressedActions();
    performanceDiagnostics?.beginFrame();
    if (performanceDiagnostics) {
      for (const kind of stageRayQueryKinds) {
        performanceDiagnostics.count(`ray.${kind}.queries`, 0);
        performanceDiagnostics.count(
          `ray.${kind}.candidates`,
          0
        );
        performanceDiagnostics.count(
          `ray.${kind}.intersections`,
          0
        );
        performanceDiagnostics.count(
          `ray.${kind}.indexed-triangles`,
          0
        );
        performanceDiagnostics.count(
          `ray.${kind}.exact-triangle-tests`,
          0
        );
      }
    }
    const delta = performanceScenario
      ? V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS / 1000
      : Math.min(engine.getDeltaTime() / 1000, 0.05);
    const traversalFrame = traversalCoordinator.update(delta);
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
    const playerFrame = performanceDiagnostics
      ? performanceDiagnostics.measure("player", () =>
          player.update(
            delta,
            started && survival.canPlayerMove(),
            horizontalSpeedScale
          )
        )
      : player.update(
          delta,
          started && survival.canPlayerMove(),
          horizontalSpeedScale
        );
    let survivalFrame = survival.getFrame();
    if (started) {
      elapsedSeconds += delta;
      survivalFrame = performanceDiagnostics
        ? performanceDiagnostics.measure(
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
    const executionReplayResult = dispatchV2RuntimeExecutionReplay({
      actions,
      frame: survivalFrame,
      survival
    });
    if (executionReplayResult === "execution-replayed") {
      survivalFrame = survival.getFrame();
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
      footPosition: currentPlayerTarget.footPosition,
      viewForward: characterViewForward,
      facingYaw: characterFacingYaw
    });
    updateGameplayHelp(survivalFrame.phase);
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
    const minimapActive = started && survivalFrame.phase === "playing";
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
        survivalFrame.mission.missionTargetActorIds,
      missionTargetLocationIds:
        survivalFrame.mission.missionTargetLocationIds
    });
    runtimeHud.update({
      active: interactionActive,
      frame: survivalFrame,
      broadcastCandidate,
      npcCandidates,
      doorCandidates,
      feedback: interactionFeedback
    });
    missionHud.update({
      mode: !started
        ? "hidden"
        : survivalFrame.phase === "playing"
          ? "missions"
          : survivalFrame.phase === "execution-complete"
            ? "results"
            : "hidden",
      frame: survivalFrame.mission
    });
    if (missionAcceptanceScenario !== null) {
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
            survivalFrame.mission.lastSchoolInstruction,
          assemblyVenueId: survivalFrame.assemblyVenueId,
          activeNpcNormalMissionCount:
            survivalFrame.mission.activeNpcMissions.filter(
              (mission) => mission.source === "normal"
            ).length,
          activeNpcBroadcastMissionCount:
            survivalFrame.mission.activeNpcMissions.filter(
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
            survivalFrame.mission.playerMissions
              .filter((mission) => mission.state === "active")
              .map((mission) => ({
                id: mission.id,
                kind: mission.kind,
                targetKind: mission.target.kind
              })),
          missionTargetActorIds:
            survivalFrame.mission.missionTargetActorIds,
          missionTargetLocationIds:
            survivalFrame.mission.missionTargetLocationIds,
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
    alarmFloorVisual?.update({
      frame: survivalFrame.alarm,
      playerFootPosition: currentPlayerTarget.footPosition,
      elapsedSeconds
    });
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
        performanceProgress?.status === "complete" &&
        !performanceReportPublished
      ) {
        document.body.dataset.v2PerformanceReport =
          JSON.stringify(performanceDiagnostics.getReport());
        performanceReportPublished = true;
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
    if (performanceDiagnostics) {
      performanceDiagnostics.measure("render", renderScene);
      performanceDiagnostics.finishFrame();
    } else {
      renderScene();
    }
  } catch (error) {
    engine.stopRenderLoop();
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

const handleReturnToTitleKey: EventListener = (event) => {
  if ((event as KeyboardEvent).code === "Enter" && started) {
    requestSessionRebuild();
  }
};
eventScope.listen(window, "keydown", handleReturnToTitleKey);

return Object.freeze({
  dispose: disposeRuntime
});
} catch (error) {
  console.error(
    "V2 Runtime sessionの構築に失敗しました。",
    error
  );
  titleStartHint.textContent = "読込エラー";
  titleMessage.textContent = formatLoadError(error);
  await disposeRuntime();
  throw error;
}
};

let activeSession: V2RuntimeSession | null = null;
let sessionTransition: Promise<void> | null = null;
let runtimeTerminated = false;

const showSessionLoading = () => {
  titleOverlay.style.display = "flex";
  titleStartHint.style.display = "none";
  titleMessage.style.display = "block";
  titleMessage.textContent = "学校3D空間を読み込んでいます";
  statusInfo.style.display = "none";
  helpPanel.style.display = "none";
  minimapCanvas.style.display = "none";
  minimapReadout.style.display = "none";
  minimapReadout.textContent = "";
};

const rebuildSession = () => {
  if (sessionTransition !== null || runtimeTerminated) {
    return;
  }
  sessionTransition = (async () => {
    const previousSession = activeSession;
    activeSession = null;
    activeSession = await transitionV2RuntimeSession({
      currentSession: previousSession,
      nextRuntimeSeed: nextRuntimeSessionSeed,
      isCancelled: () => runtimeTerminated,
      exitPointerLock: () => document.exitPointerLock(),
      showLoading: showSessionLoading,
      createSession: (sessionSeed) =>
        createRuntimeSession(sessionSeed, rebuildSession)
    });
  })()
    .catch((error: unknown) => {
      if (runtimeTerminated) {
        return;
      }
      console.error(
        "V2 Runtime sessionの再初期化に失敗しました。",
        error
      );
    })
    .finally(() => {
      sessionTransition = null;
    });
};

try {
  activeSession = await createRuntimeSession(
    nextRuntimeSessionSeed(),
    rebuildSession
  );
} catch {
  activeSession = null;
}

window.addEventListener(
  "beforeunload",
  () => {
    runtimeTerminated = true;
    const session = activeSession;
    activeSession = null;
    void session?.dispose();
    engine.dispose();
  },
  { once: true }
);
