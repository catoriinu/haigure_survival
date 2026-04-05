import "./style.css";
import {
  Engine,
  Scene,
  FreeCamera,
  Frustum,
  Matrix,
  Vector3,
  HemisphericLight,
  Color3,
  Color4,
  DynamicTexture,
  MirrorTexture,
  Plane,
  Ray,
  Sprite,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  VertexBuffer,
  VertexData
} from "@babylonjs/core";
import {
  Beam,
  BeamImpactOrb,
  BeamTrail,
  AlertRequest,
  ExternalAlert,
  Bit,
  Npc,
  BitSoundEvents,
  CharacterState,
  cellToWorld,
  collectFloorCells,
  worldToCell,
  createBeam,
  createTrapBeam,
  beginBeamRetract,
  createBitAt,
  createBeamMaterial,
  createBit,
  createBitMaterials,
  bitShadowFootprint,
  disposeBit,
  isAliveState,
  isBrainwashState,
  bitFireEffectDuration,
  npcHitColorA,
  npcHitColorB,
  npcHitDuration,
  npcHitEffectAlpha,
  npcHitLightIntensity,
  npcHitFadeDuration,
  npcHitFadeOrbConfig,
  npcHitFlickerInterval,
  noGunTouchBrainwashDuration,
  startBitFireEffect,
  stopBitFireEffect,
  updateBitSpawnEffect,
  updateBitFireEffect,
  startBitDespawn,
  updateBitDespawn,
  pickRandomCell,
  setNpcBrainwashInProgressTransitionConfig,
  setNpcBrainwashCompleteTransitionConfig,
  StageBounds,
  updateBeams,
  updateBits,
  updateNpcs
} from "./game/entities";
import { alignSpriteToGround } from "./game/spriteUtils";
import {
  createBeamHitRadii,
  isBeamHittingTarget,
  isBeamHittingTargetExcludingSource
} from "./game/beamCollision";
import {
  resolvePlayerBeamHits,
  type BeamHitCandidate
} from "./game/playerBeamHits";
import {
  HitFadeOrbConfig,
  HitSequenceConfig,
  calculateHitEffectDiameter,
  createHitSequenceState,
  resetHitSequenceState,
  startHitSequence,
  updateHitSequence
} from "./game/hitEffects";
import {
  AudioManager,
  SpatialHandle,
  SpatialPlayOptions,
  type AudioCategory
} from "./audio/audio";
import {
  getVoiceDirectories,
  getVoiceProfileIdByDirectory,
  voiceProfiles
} from "./audio/voice";
import { SfxDirector } from "./audio/sfxDirector";
import {
  createGameFlow,
  type AssemblyMode,
  type ExecutionBlockKind,
  type ExecutionConfig,
  type ExecutionTarget
} from "./game/flow";
import { createDynamicBeamSystem } from "./game/dynamicBeam/system";
import { createTrapSystem } from "./game/trap/system";
import { createAlarmSystem } from "./game/alarm/system";
import { createRouletteSystem } from "./game/roulette/system";
import { RouletteBitFireEntry, RouletteHitTarget } from "./game/roulette/types";
import {
  canReleaseAssemblyControl,
  shouldHidePlayerAvatarFromMainCamera,
  shouldShowFirstPersonBodyForPhase,
  shouldSyncPlayerAvatarToCamera,
  type GamePhase,
  usesPlayerEyeHeight
} from "./game/phases";
import {
  canPlayerMove,
  createPlayerAbilityController,
  type PlayerAbilityFrameSnapshot
} from "./game/playerAbility";
import { createPlayerMotionController } from "./game/playerMotion";
import { buildStageContext, disposeStageParts } from "./world/stageContext";
import { createZoneMapFromStageJson } from "./world/stageJson";
import {
  LABYRINTH_DYNAMIC_STAGE_ID,
  TRAP_STAGE_ID
} from "./world/stageIds";
import {
  loadStageJson,
  STAGE_CATALOG,
  type StageSelection
} from "./world/stageSelection";
import { createHud } from "./ui/hud";
import { setupInputHandlers } from "./ui/input";
import { createVolumePanel, type VolumeLevels } from "./ui/volumePanel";
import type { BitSpawnSettings } from "./ui/bitSpawnPanel";
import type { DefaultStartSettings } from "./ui/defaultSettingsPanel";
import type { BrainwashSettings } from "./ui/brainwashSettingsPanel";
import type { PlayerSettings } from "./ui/playerSettingsPanel";
import {
  buildDefaultPersistedTitleSettings,
  clearPersistedTitleSettings,
  loadPersistedTitleSettings,
  savePersistedTitleSettings,
  type TitleSettingsDefaults
} from "./ui/titleSettingsStorage";
import { createStageSelectControl } from "./ui/stageSelectControl";
import {
  getTitleSettingsAvailability,
  isRouletteStageId,
  normalizeRuntimeSettingsForStage,
  type RuntimeSettingsByStage
} from "./ui/titleStageRules";
import {
  createTitleSettingsSidebar,
  type TitleSettingsSidebarSettings
} from "./ui/titleSettingsSidebar";
import {
  PLAYER_SPRITE_CENTER_HEIGHT,
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH
} from "./game/characterSprites";
import {
  assignPortraitDirectories,
  getNoGunTouchBrainwashCellIndex,
  getPortraitCellIndex,
  getPortraitDirectories
} from "./game/portraitSprites";
import { createCharacterSceneController } from "./game/characterScene";
import {
  buildGridCellKey,
  ensureVectorListBufferSize,
  runRuntimeFramePhases,
  syncNpcTargetBuffer,
  syncNpcTargetBufferStates
} from "./game/runtimeFrame";
import {
  createGroundShadowManager,
  type GroundShadowHandle
} from "./game/groundShadows";
import type { TargetInfo } from "./game/types";
import {
  createTitleStartPreparationController,
  type TitleStartPreparationController,
  type TitleStartPreparationLoadingSession,
  type TitleStartPreparationRequest
} from "./game/titleStartPreparation";

const canvas =
  document.getElementById("renderCanvas") as unknown as HTMLCanvasElement;
const titleOverlayElement =
  document.getElementById("titleOverlay") as unknown as HTMLDivElement;
const titleMessageElement =
  document.getElementById("titleMessage") as unknown as HTMLDivElement;
const titleMessageStatusElement = document.createElement("span");
const titleMessageLabelElement = document.createElement("span");
const titleMessageDotsElement = document.createElement("span");
const titleMessageProgressElement = document.createElement("span");
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const defaultClearColor = scene.clearColor.clone();
const titleReadyMessage = "左クリック: 開始";
const titleLoadingMessageBase = "NOW LOADING";
const titleLoadingDotIntervalMs = 300;
const titleStartPreparationDebounceMs = 250;
const enableNoGunTouchBrainwashConfirmMessage =
  "「銃なしに触れたら洗脳」をオンにすると、ゲーム起動時の読み込み時間が長くなります。\nOKを押すと、オンにしてゲームを再起動します。よろしいですか？";
type CharacterAssignments = {
  playerVoiceId: string;
  npcVoiceIds: string[];
  playerPortraitDirectory: string;
  npcPortraitDirectories: string[];
};
type TitleLoadingSession = {
  setTotal: (count: number) => void;
  advance: () => void;
  finish: () => void;
};
type TitleStartPreparationRequestData = TitleStartPreparationRequest<
  CharacterAssignments,
  RuntimeSettingsByStage
>;
type BitGroundShadowHandles = {
  shape: GroundShadowHandle;
  circle: GroundShadowHandle;
};

let activeTitleLoadingSessionCount = 0;
let titleLoadingCompleted = 0;
let titleLoadingTotal = 0;
let titleLoadingDotCount = 0;
let titleLoadingDotTimerId: number | null = null;
titleMessageStatusElement.className = "title-message__status";
titleMessageDotsElement.className = "title-message__dots";
titleMessageProgressElement.className = "title-message__progress";
titleMessageLabelElement.textContent = titleLoadingMessageBase;
titleMessageProgressElement.style.display = "none";
titleMessageStatusElement.append(titleMessageLabelElement, titleMessageDotsElement);
titleMessageElement.replaceChildren(
  titleMessageStatusElement,
  titleMessageProgressElement
);
const buildTitleDots = () => ".".repeat(titleLoadingDotCount);
const buildTitleProgress = () =>
  `${titleLoadingCompleted} / ${titleLoadingTotal}`;
const syncTitleMessage = () => {
  if (activeTitleLoadingSessionCount > 0) {
    titleMessageLabelElement.textContent = titleLoadingMessageBase;
    titleMessageDotsElement.textContent = buildTitleDots();
    titleMessageDotsElement.style.display = "";
    titleMessageProgressElement.textContent = buildTitleProgress();
    titleMessageProgressElement.style.display = "";
    return;
  }
  titleMessageLabelElement.textContent = titleReadyMessage;
  titleMessageDotsElement.textContent = "";
  titleMessageDotsElement.style.display = "none";
  titleMessageProgressElement.textContent = "";
  titleMessageProgressElement.style.display = "none";
};
const startTitleLoadingDots = () => {
  if (titleLoadingDotTimerId !== null) {
    return;
  }
  titleLoadingDotCount = 0;
  titleLoadingDotTimerId = window.setInterval(() => {
    titleLoadingDotCount = (titleLoadingDotCount + 1) % 4;
    syncTitleMessage();
  }, titleLoadingDotIntervalMs);
};
const stopTitleLoadingDots = () => {
  if (titleLoadingDotTimerId !== null) {
    window.clearInterval(titleLoadingDotTimerId);
    titleLoadingDotTimerId = null;
  }
  titleLoadingDotCount = 0;
};
const shuffleIdsInPlace = (ids: string[]) => {
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const temp = ids[index];
    ids[index] = ids[swap];
    ids[swap] = temp;
  }
};
const pickRandomIdFromPool = (ids: readonly string[]) =>
  ids[Math.floor(Math.random() * ids.length)]!;
const buildCharacterAssignments = (
  npcCount: number,
  playerSettings: PlayerSettings
): CharacterAssignments => {
  const voiceIds = voiceProfiles.map((profile) => profile.id);
  const remainingVoiceIds = [...voiceIds];
  shuffleIdsInPlace(remainingVoiceIds);
  const fixedPlayerVoiceId =
    playerSettings.voiceDirectory !== null
      ? getVoiceProfileIdByDirectory(playerSettings.voiceDirectory)
      : null;
  const playerVoiceId = fixedPlayerVoiceId ?? remainingVoiceIds.shift()!;
  const npcVoiceSourceIds =
    fixedPlayerVoiceId === null
      ? remainingVoiceIds
      : remainingVoiceIds.filter((voiceId) => voiceId !== fixedPlayerVoiceId);
  const npcVoiceFallbackIds =
    fixedPlayerVoiceId === null ? voiceIds : [...npcVoiceSourceIds];
  const npcVoiceIds = Array.from(
    { length: npcCount },
    () =>
      npcVoiceSourceIds.length > 0
        ? npcVoiceSourceIds.shift()!
        : pickRandomIdFromPool(npcVoiceFallbackIds)
  );
  const portraitAssignments = assignPortraitDirectories([
    playerVoiceId,
    ...npcVoiceIds
  ]);
  const playerPortraitDirectory =
    playerSettings.portraitDirectory ?? portraitAssignments[0];
  return {
    playerVoiceId,
    npcVoiceIds,
    playerPortraitDirectory,
    npcPortraitDirectories: portraitAssignments.slice(1)
  };
};
const getCharacterAssignmentPortraitDirectories = (
  assignments: CharacterAssignments
) => [assignments.playerPortraitDirectory, ...assignments.npcPortraitDirectories];
const createTitleLoadingSession = (initialTotal = 0): TitleLoadingSession => {
  const wasInactive = activeTitleLoadingSessionCount === 0;
  activeTitleLoadingSessionCount += 1;
  titleLoadingCompleted = 0;
  titleLoadingTotal = initialTotal;
  if (wasInactive) {
    startTitleLoadingDots();
  }
  syncTitleMessage();
  let finished = false;
  return {
    setTotal: (count: number) => {
      if (finished || count < 0) {
        return;
      }
      titleLoadingTotal = count;
      titleLoadingCompleted = Math.min(titleLoadingCompleted, titleLoadingTotal);
      syncTitleMessage();
    },
    advance: () => {
      if (finished) {
        return;
      }
      titleLoadingCompleted = Math.min(
        titleLoadingCompleted + 1,
        titleLoadingTotal
      );
      syncTitleMessage();
    },
    finish: () => {
      if (finished) {
        return;
      }
      finished = true;
      activeTitleLoadingSessionCount = Math.max(
        activeTitleLoadingSessionCount - 1,
        0
      );
      if (activeTitleLoadingSessionCount === 0) {
        stopTitleLoadingDots();
        titleLoadingCompleted = 0;
        titleLoadingTotal = 0;
      }
      syncTitleMessage();
    }
  };
};
const advanceSessionForEach = async <T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  session: TitleLoadingSession
) => {
  await Promise.all(
    items.map(async (item) => {
      try {
        await worker(item);
      } finally {
        session.advance();
      }
    })
  );
};

const playerWidth = PLAYER_SPRITE_WIDTH;
const playerHeight = PLAYER_SPRITE_HEIGHT;
const playerCenterHeight = PLAYER_SPRITE_CENTER_HEIGHT;
// ミニマップ座標表示ボックスの表示切替。true=表示、false=非表示（デフォルト）
const minimapReadoutVisible = false;
// スタミナゲージの表示切替。true=表示（デフォルト）、false=非表示
const showStaminaGauge = true;
const portraitMaxWidthCells = 1;
const portraitMaxHeightCells = 2;
const worldLayerMask = 0x0fffffff;
const reflectionOnlyLayerMask = 0x10000000;
const firstPersonBodyLayerMask = 0x20000000;
const mainCameraOnlyLayerMask = 0x40000000;
const characterGroundShadowWidthRatio = 1.16;
const characterGroundShadowDepthRatio = 0.8;
const characterGroundShadowVisibility = 0.68;
const bitGroundShadowWidthScale = 1.35;
const bitGroundShadowDepthScale = 1.42;
const bitGroundShadowBaseVisibility = 0.7;
const bitGroundShadowMinVisibility = 0.22;
const bitGroundShadowScalePerHeight = 0.35;
const bitGroundShadowMaxScaleBonus = 0.7;
const bitGroundShadowVisibilityPerHeight = 0.25;
const bitGroundShadowMinForwardLengthSq = 0.0001;
const bitGroundShadowMinMorphBlend = 0;
const bitGroundShadowMaxMorphBlend = 1;
const characterFacingMinForwardLengthSq = 0.0001;
const firstPersonBodyBaseAlpha = 1;
const firstPersonBodyCropTopRatio = 0.3;
const firstPersonBodyNearRowStretch = 1.28;
const firstPersonBodyChestRowScreenYStart = -1.78;
const firstPersonBodyChestRowScreenYEnd = -0.78;
const firstPersonBodyChestRowHalfWidthStart = 0.9;
const firstPersonBodyChestRowHalfWidthEnd = 0.88;
const firstPersonBodyChestRowZStart = 0.2;
const firstPersonBodyChestRowZEnd = 0.21;
const firstPersonBodyFeetRowScreenYStart = -1.12;
const firstPersonBodyFeetRowScreenYEnd = 0.1;
const firstPersonBodyFeetRowHalfWidthStart = 0.66;
const firstPersonBodyFeetRowHalfWidthEnd = 0.57;
const firstPersonBodyFeetRowZStart = 0.41;
const firstPersonBodyFeetRowZEnd = 0.49;
const firstPersonViewOffsetStartAngleDegrees = 55;
const firstPersonViewOffsetMaxAngleDegrees = 90;
const firstPersonViewOffsetStartAngleRadians =
  (firstPersonViewOffsetStartAngleDegrees * Math.PI) / 180;
const firstPersonViewOffsetMaxAngleRadians =
  (firstPersonViewOffsetMaxAngleDegrees * Math.PI) / 180;
const firstPersonViewOffsetMaxDistanceScale = 0.14;
const firstPersonViewOffsetMaxHeightCells = 0.17;
const firstPersonLowEyeHeightSlideRatio = 0.6;
const firstPersonViewOffsetMinDirectionLengthSq = 0.0001;
const firstPersonViewOffsetWallPadding = 0.01;
const firstPersonPreviewUsePlayerSprite = true;

const defaultBitSpawnSettings: BitSpawnSettings = {
  bitSpawnInterval: 10,  // ビットの通常出現間隔（秒）。1〜99。デフォルトは10
  maxBitCount: 25,       // ビットの同時出現上限。1〜99。デフォルトは25
  disableBitSpawn: false // true で「ビットを出現させない」。デフォルトは false
};
const defaultDefaultStartSettings: DefaultStartSettings = {
  startPlayerAsBrainwashCompleteGun: false,
  // ステージ開始時のNPC人数。0〜99。デフォルトは11
  initialNpcCount: 11,
  // ステージ開始時に洗脳完了済みとして開始するNPC割合。0〜100%。デフォルトは0
  initialBrainwashedNpcPercent: 0
};
const defaultBrainwashSettings: BrainwashSettings = {
  instantBrainwash: false,
  brainwashOnNoGunTouch: false,
  // NPC洗脳完了後の行動遷移確率（表示値）。ポーズは100 - 銃あり - 銃なし
  npcBrainwashCompleteGunPercent: 45,
  npcBrainwashCompleteNoGunPercent: 45
};
const defaultPlayerSettings: PlayerSettings = {
  heightCells: 1.0,
  portraitDirectory: null,
  voiceDirectory: null,
  showGroundShadows: true,
  enableCharacterSpriteVerticalAngle: true
};
const TITLE_SETTINGS_STORAGE_KEY = "haigure-survival.title-settings";
const TITLE_SETTINGS_STORAGE_VERSION = 5;
const defaultVolumeLevels: VolumeLevels = {
  bgm: 5,
  se: 5,
  voice: 5
};
const portraitDirectories = getPortraitDirectories();
const portraitDirectorySet = new Set(portraitDirectories);
const voiceDirectories = getVoiceDirectories();
const voiceDirectorySet = new Set(voiceDirectories);
const titleSettingsDefaults: TitleSettingsDefaults = {
  volumeLevels: defaultVolumeLevels,
  stageId: STAGE_CATALOG[0].id,
  alarmTrapEnabled: false,
  playerSettings: defaultPlayerSettings,
  defaultStartSettings: defaultDefaultStartSettings,
  brainwashSettings: defaultBrainwashSettings,
  bitSpawnSettings: defaultBitSpawnSettings
};
const stageIds = new Set(STAGE_CATALOG.map((selection) => selection.id));
const persistedTitleSettings = loadPersistedTitleSettings(
  TITLE_SETTINGS_STORAGE_KEY,
  TITLE_SETTINGS_STORAGE_VERSION,
  titleSettingsDefaults,
  stageIds,
  portraitDirectorySet,
  voiceDirectorySet
);
const initialVolumeLevels: VolumeLevels = persistedTitleSettings
  ? { ...persistedTitleSettings.volumeLevels }
  : { ...defaultVolumeLevels };

let titleBitSpawnSettings: BitSpawnSettings = persistedTitleSettings
  ? { ...persistedTitleSettings.bitSpawnSettings }
  : { ...defaultBitSpawnSettings };
let titleDefaultStartSettings: DefaultStartSettings = {
  ...(persistedTitleSettings
    ? persistedTitleSettings.defaultStartSettings
    : defaultDefaultStartSettings)
};
let titleBrainwashSettings: BrainwashSettings = {
  ...(persistedTitleSettings
    ? persistedTitleSettings.brainwashSettings
    : defaultBrainwashSettings)
};
let titlePlayerSettings: PlayerSettings = {
  ...(persistedTitleSettings
    ? persistedTitleSettings.playerSettings
    : defaultPlayerSettings)
};
let runtimeBitSpawnInterval = defaultBitSpawnSettings.bitSpawnInterval;
let runtimeMaxBitCount = defaultBitSpawnSettings.maxBitCount;
let runtimeDefaultStartSettings: DefaultStartSettings = {
  ...defaultDefaultStartSettings
};
let runtimeBrainwashSettings: BrainwashSettings = {
  ...defaultBrainwashSettings
};
let titleAlarmTrapEnabled = persistedTitleSettings
  ? persistedTitleSettings.alarmTrapEnabled
  : false;
let runtimeAlarmTrapEnabled = false;
const buildNpcBrainwashCompleteTransitionConfig = (
  settings: BrainwashSettings
) => {
  const gunPercent = settings.npcBrainwashCompleteGunPercent;
  const noGunPercent = settings.npcBrainwashCompleteNoGunPercent;
  const posePercent = 100 - gunPercent - noGunPercent;
  const stayChance = posePercent / 100;
  const gunNoGunTotal = gunPercent + noGunPercent;
  const toGunChance = gunNoGunTotal === 0 ? 0 : gunPercent / gunNoGunTotal;
  return { stayChance, toGunChance };
};
const buildNpcBrainwashInProgressTransitionConfig = (
  settings: BrainwashSettings
) =>
  settings.instantBrainwash
    ? {
        decisionDelay: 0,
        stayChance: 0
      }
    : {
        decisionDelay: 10,
        stayChance: 0.5
      };
const buildRuntimeSettingsForStageId = (
  stageId: string
): RuntimeSettingsByStage =>
  normalizeRuntimeSettingsForStage({
    stageId,
    titleDefaultStartSettings,
    titleBrainwashSettings,
    titleBitSpawnSettings,
    titleAlarmTrapEnabled,
    defaultBrainwashSettings,
    defaultBitSpawnSettings
  });
const applyRuntimeSettings = (runtimeSettings: RuntimeSettingsByStage) => {
  runtimeDefaultStartSettings = runtimeSettings.runtimeDefaultStartSettings;
  runtimeBrainwashSettings = runtimeSettings.runtimeBrainwashSettings;
  runtimeBitSpawnInterval = runtimeSettings.runtimeBitSpawnInterval;
  runtimeMaxBitCount = runtimeSettings.runtimeMaxBitCount;
  runtimeAlarmTrapEnabled = runtimeSettings.runtimeAlarmTrapEnabled;
  setNpcBrainwashInProgressTransitionConfig(
    buildNpcBrainwashInProgressTransitionConfig(runtimeBrainwashSettings)
  );
  setNpcBrainwashCompleteTransitionConfig(
    buildNpcBrainwashCompleteTransitionConfig(runtimeBrainwashSettings)
  );
};
const hasNeverGameOverRisk = (
  stageId: string,
  defaultSettings: DefaultStartSettings,
  brainwashSettings: BrainwashSettings,
  bitSpawnSettings: BitSpawnSettings
) => {
  if (
    stageId === TRAP_STAGE_ID ||
    stageId === LABYRINTH_DYNAMIC_STAGE_ID ||
    isRouletteStageId(stageId)
  ) {
    return false;
  }
  if (defaultSettings.startPlayerAsBrainwashCompleteGun) {
    return false;
  }
  if (!bitSpawnSettings.disableBitSpawn) {
    return false;
  }
  const initialBrainwashedNpcCount = Math.floor(
    defaultSettings.initialNpcCount *
      defaultSettings.initialBrainwashedNpcPercent *
      0.01
  );
  if (initialBrainwashedNpcCount <= 0) {
    return true;
  }
  const hasGunRoute = brainwashSettings.npcBrainwashCompleteGunPercent > 0;
  const hasNoGunTouchRoute =
    brainwashSettings.npcBrainwashCompleteNoGunPercent > 0 &&
    brainwashSettings.brainwashOnNoGunTouch;
  return !(hasGunRoute || hasNoGunTouchRoute);
};

// プレイヤー1人 + NPC最大99人
const spriteManagerCapacity = 100;
const characterScene = createCharacterSceneController({
  scene,
  spriteManagerCapacity,
  playerWidth,
  playerHeight,
  portraitMaxWidthCells,
  portraitMaxHeightCells,
  loadPortraitIncludeNoGunTouch: () =>
    titleBrainwashSettings.brainwashOnNoGunTouch
});
const countUnloadedPortraitDirectoriesForAssignments = (
  assignments: CharacterAssignments
) =>
  characterScene.countUnloadedPortraitDirectories(
    getCharacterAssignmentPortraitDirectories(assignments)
  );
const ensurePortraitManagersIfNeeded = async (
  directories: string[],
  session?: TitleLoadingSession
) =>
  characterScene.ensurePortraitManagersIfNeeded(directories, session);

const initialStageSelectionId = persistedTitleSettings
  ? persistedTitleSettings.stageId
  : STAGE_CATALOG[0].id;
let stageSelection = STAGE_CATALOG.find(
  (selection) => selection.id === initialStageSelectionId
)!;
let stageSelectionRequestId = 0;
let stageSelectionInProgress = false;
let titleTransitionInProgress = false;
const buildStageSelectionLabel = (
  selection: StageSelection,
  loadedStageJson: Awaited<ReturnType<typeof loadStageJson>>
) => loadedStageJson?.meta.description ?? selection.label;
const buildTitleStartPreparationFingerprint = () =>
  JSON.stringify({
    stageId: stageSelection.id,
    alarmTrapEnabled: titleAlarmTrapEnabled,
    playerPortraitDirectory: titlePlayerSettings.portraitDirectory,
    playerVoiceDirectory: titlePlayerSettings.voiceDirectory,
    defaultStartSettings: titleDefaultStartSettings,
    brainwashSettings: titleBrainwashSettings,
    bitSpawnSettings: titleBitSpawnSettings
  });
const buildTitleStartPreparationRequest = (): TitleStartPreparationRequestData => {
  const runtimeSettings = buildRuntimeSettingsForStageId(stageSelection.id);
  const assignments = buildCharacterAssignments(
    runtimeSettings.runtimeDefaultStartSettings.initialNpcCount,
    titlePlayerSettings
  );
  return {
    fingerprint: buildTitleStartPreparationFingerprint(),
    loadingTotal: countUnloadedPortraitDirectoriesForAssignments(assignments),
    assignments,
    runtimeSettings
  };
};
const initialRuntimeSettings = buildRuntimeSettingsForStageId(stageSelection.id);
applyRuntimeSettings(initialRuntimeSettings);
const initialCharacterAssignments = buildCharacterAssignments(
  runtimeDefaultStartSettings.initialNpcCount,
  titlePlayerSettings
);
const initialLoadingSession = createTitleLoadingSession(
  STAGE_CATALOG.length +
    countUnloadedPortraitDirectoriesForAssignments(initialCharacterAssignments)
);
let stageJson: Awaited<ReturnType<typeof loadStageJson>>;
try {
  stageJson = await loadStageJson(stageSelection);
} finally {
  initialLoadingSession.advance();
}
let stageZoneMap = stageJson ? createZoneMapFromStageJson(stageJson) : null;
const stageSelectionsForMenu: StageSelection[] = Array.from(
  { length: STAGE_CATALOG.length }
) as StageSelection[];
await advanceSessionForEach(
  STAGE_CATALOG.filter((selection) => selection.id !== stageSelection.id),
  async (selection) => {
    const loadedStageJson = await loadStageJson(selection);
    const index = STAGE_CATALOG.findIndex(
      (candidate) => candidate.id === selection.id
    );
    stageSelectionsForMenu[index] = {
      ...selection,
      label: buildStageSelectionLabel(selection, loadedStageJson)
    };
  },
  initialLoadingSession
);
const selectedStageIndex = STAGE_CATALOG.findIndex(
  (selection) => selection.id === stageSelection.id
);
stageSelectionsForMenu[selectedStageIndex] = {
  ...stageSelection,
  label: buildStageSelectionLabel(stageSelection, stageJson)
};
let stageContext = buildStageContext(scene, stageJson);
let layout = stageContext.layout;
let stageStyle = stageContext.style;
let stageParts = stageContext.parts;
let stageColliderSet = new Set(stageParts.colliders);
let room = stageContext.room;
let assemblyArea = stageContext.assemblyArea;
let skipAssembly = stageContext.skipAssembly;
let halfWidth = room.width / 2;
let halfDepth = room.depth / 2;
let minimapCellSize = layout.cellSize;
let spawnPosition = new Vector3(0, 0, 0);
let floorCells = collectFloorCells(layout);
let spawnableCells = floorCells;
let bounds: StageBounds = {
  minX: -halfWidth,
  maxX: halfWidth,
  minZ: -halfDepth,
  maxZ: halfDepth,
  minY: 0,
  maxY: room.height
};

const buildSpawnForwardTowardCenter = (position: Vector3) => {
  const towardCenter = new Vector3(-position.x, 0, -position.z);
  if (towardCenter.lengthSquared() <= 0.0001) {
    return new Vector3(0, 0, 1);
  }
  return towardCenter.normalize();
};

const getPlayerSpawnMarker = () =>
  stageJson?.gameplay.markers.find(
    (marker) => marker.id === "spawn_player" && marker.type === "spawn"
  ) ?? null;

const hasPlayerSpawnTag = (tag: string) =>
  getPlayerSpawnMarker()?.tags?.includes(tag) === true;

const buildSpawnForwardFromMarker = () => {
  const marker = getPlayerSpawnMarker();
  const rotationY = marker?.rotY ?? 0;
  const radians = (rotationY * Math.PI) / 180;
  return new Vector3(Math.sin(radians), 0, Math.cos(radians)).normalize();
};

let spawnForward = new Vector3(0, 0, 1);
let portraitCellSize = layout.cellSize;
const getEyeHeight = () => layout.cellSize * titlePlayerSettings.heightCells;

const updateSpawnPoint = () => {
  const randomSpawnable = hasPlayerSpawnTag("random_spawnable");
  const randomFloor = hasPlayerSpawnTag("random_floor");
  const lookAtCenter = hasPlayerSpawnTag("look_at_center");
  const spawnCell =
    randomSpawnable
      ? pickRandomCell(spawnableCells)
      : randomFloor
        ? pickRandomCell(floorCells)
        : { row: layout.spawn.row, col: layout.spawn.col };
  spawnPosition = cellToWorld(layout, spawnCell, getEyeHeight());
  spawnForward = lookAtCenter
    ? buildSpawnForwardTowardCenter(spawnPosition)
    : buildSpawnForwardFromMarker();
};

const updateStageState = () => {
  layout = stageContext.layout;
  stageZoneMap = stageJson ? createZoneMapFromStageJson(stageJson) : null;
  stageStyle = stageContext.style;
  stageParts = stageContext.parts;
  stageColliderSet = new Set(stageParts.colliders);
  room = stageContext.room;
  scene.clearColor = stageContext.environment.skyColor ?? defaultClearColor.clone();
  assemblyArea = stageContext.assemblyArea;
  skipAssembly = stageContext.skipAssembly;
  halfWidth = room.width / 2;
  halfDepth = room.depth / 2;
  const minimapCellDivisor = Math.round(
    layout.cellSize / stageStyle.gridSpacingWorld
  );
  minimapCellSize = layout.cellSize / minimapCellDivisor;
  floorCells = collectFloorCells(layout);
  const noSpawnKeys = new Set(
    layout.noSpawnCells.map((cell) => `${cell.row},${cell.col}`)
  );
  spawnableCells = floorCells.filter(
    (cell) => !noSpawnKeys.has(`${cell.row},${cell.col}`)
  );
  updateSpawnPoint();
  bounds = {
    minX: -halfWidth,
    maxX: halfWidth,
    minZ: -halfDepth,
    maxZ: halfDepth,
    minY: 0,
    maxY: room.height
  };
  portraitCellSize = layout.cellSize;
};

updateStageState();
const camera = new FreeCamera(
  "camera",
  spawnPosition.clone(),
  scene
);
camera.setTarget(spawnPosition.add(spawnForward));
camera.attachControl(canvas, true);
camera.layerMask =
  worldLayerMask | firstPersonBodyLayerMask | mainCameraOnlyLayerMask;
camera.minZ = 0.02;
const baseCameraSpeed = 0.02;
const playerMoveSpeed = baseCameraSpeed * Math.sqrt(10);
const playerDashSpeedMultiplier = 1.7;
const playerStaminaMaxTenths = 150;
const playerStaminaDrainInterval = 0.1;
const playerStaminaRecoverInterval = 0.2;
const playerMoveInertiaAt60Fps = 0.9;
const playerMoveStopEpsilon = 0.00001;
camera.speed = 0;
camera.angularSensibility = 1500;
camera.keysUp = [87];
camera.keysDown = [83];
camera.keysLeft = [65];
camera.keysRight = [68];
camera.checkCollisions = false;
camera.inputs.removeByType("FreeCameraKeyboardMoveInput");
const playerCollisionMesh = new Mesh("playerCollision", scene);
playerCollisionMesh.isVisible = false;
playerCollisionMesh.isPickable = false;
playerCollisionMesh.checkCollisions = true;
playerCollisionMesh.ellipsoid = new Vector3(
  playerWidth * 0.5,
  playerHeight * 0.5,
  playerWidth * 0.5
);
playerCollisionMesh.ellipsoidOffset = new Vector3(0, playerHeight * 0.5, 0);
const reflectionCamera = new FreeCamera(
  "reflectionCamera",
  spawnPosition.clone(),
  scene
);
reflectionCamera.layerMask = worldLayerMask | reflectionOnlyLayerMask;
reflectionCamera.minZ = camera.minZ;
reflectionCamera.fov = camera.fov;
const playerEyeBasePosition = Vector3.Zero();
const playerEyeRenderOffset = Vector3.Zero();
const playerEyeRenderPosition = Vector3.Zero();
const playerAvatarWorldPosition = Vector3.Zero();
const firstPersonPreviewPlayerPosition = Vector3.Zero();
const firstPersonViewHorizontalForward = Vector3.Zero();
const playerMoveStartPosition = Vector3.Zero();
const playerMoveActualDisplacement = Vector3.Zero();
const firstPersonViewRay = new Ray(
  Vector3.Zero(),
  new Vector3(0, 0, 1),
  0
);
let renderCameraPositionApplied = false;
let playerAvatarRenderPositionApplied = false;
const playerMotion = createPlayerMotionController({
  moveInertiaAt60Fps: playerMoveInertiaAt60Fps,
  moveStopEpsilon: playerMoveStopEpsilon
});
const shouldSyncCameraToPlayerPosition = (phase: GamePhase) =>
  usesPlayerEyeHeight(phase) || phase === "execution";
const syncPlayerCollisionMeshFromEyePosition = (eyePosition: Vector3) => {
  playerCollisionMesh.position.set(
    eyePosition.x,
    eyePosition.y - getEyeHeight(),
    eyePosition.z
  );
};
const syncCameraBasePositionFromPlayer = () => {
  if (!shouldSyncCameraToPlayerPosition(gamePhase)) {
    return;
  }
  camera.position.copyFrom(playerEyeBasePosition);
  renderCameraPositionApplied = false;
};
const applyCameraSpawnTransform = () => {
  syncPlayerCollisionMeshFromEyePosition(spawnPosition);
  playerMotion.reset();
  camera.position.copyFrom(spawnPosition);
  camera.rotation = new Vector3(0, 0, 0);
  camera.setTarget(spawnPosition.add(spawnForward));
  capturePlayerEyeBasePosition();
};
const syncReflectionCamera = () => {
  reflectionCamera.position.copyFrom(camera.position);
  reflectionCamera.rotation.copyFrom(camera.rotation);
  reflectionCamera.fov = camera.fov;
  reflectionCamera.minZ = camera.minZ;
  reflectionCamera.maxZ = camera.maxZ;
};

const capturePlayerEyeBasePosition = () => {
  playerEyeBasePosition.set(
    playerCollisionMesh.position.x,
    playerCollisionMesh.position.y + getEyeHeight(),
    playerCollisionMesh.position.z
  );
  renderCameraPositionApplied = false;
};
syncPlayerCollisionMeshFromEyePosition(spawnPosition);
capturePlayerEyeBasePosition();

const restorePlayerEyeBasePosition = () => {
  if (!renderCameraPositionApplied || !shouldSyncCameraToPlayerPosition(gamePhase)) {
    return;
  }
  camera.position.copyFrom(playerEyeBasePosition);
  renderCameraPositionApplied = false;
};

const restorePlayerAvatarWorldPosition = () => {
  if (!playerAvatarRenderPositionApplied) {
    return;
  }
  playerAvatar.position.copyFrom(playerAvatarWorldPosition);
  playerAvatarRenderPositionApplied = false;
};

const syncFirstPersonPreviewPlayerPosition = (
  restoreWorldPosition: boolean
) => {
  if (restoreWorldPosition) {
    playerAvatarWorldPosition.copyFrom(playerAvatar.position);
    playerAvatarRenderPositionApplied = true;
  }
  firstPersonPreviewPlayerPosition.set(
    playerEyeBasePosition.x + playerEyeRenderOffset.x * 2,
    playerAvatar.height * 0.5,
    playerEyeBasePosition.z + playerEyeRenderOffset.z * 2
  );
  playerAvatar.position.copyFrom(firstPersonPreviewPlayerPosition);
  alignSpriteToGround(playerAvatar);
};

const clampFirstPersonViewOffsetLength = (
  direction: Vector3,
  desiredLength: number
) => {
  if (desiredLength <= 0.0001 || stageColliderSet.size === 0) {
    return desiredLength;
  }
  firstPersonViewRay.origin.copyFrom(playerEyeBasePosition);
  firstPersonViewRay.direction.copyFrom(direction);
  firstPersonViewRay.length = desiredLength;
  const hit = scene.pickWithRay(
    firstPersonViewRay,
    (mesh) => stageColliderSet.has(mesh as Mesh),
    true
  );
  if (!hit?.hit || hit.distance === undefined) {
    return desiredLength;
  }
  return Math.max(0, Math.min(desiredLength, hit.distance - firstPersonViewOffsetWallPadding));
};

const computeFirstPersonViewOffsetBlend = (downwardAngleRadians: number) => {
  const linearBlend =
    (downwardAngleRadians - firstPersonViewOffsetStartAngleRadians) /
    (firstPersonViewOffsetMaxAngleRadians - firstPersonViewOffsetStartAngleRadians);
  const clampedBlend = Math.max(0, Math.min(linearBlend, 1));
  return clampedBlend * clampedBlend * (3 - 2 * clampedBlend);
};

const computeFirstPersonViewOffset = () => {
  playerEyeRenderOffset.set(0, 0, 0);
  if (!shouldShowFirstPersonBodyForPhase(gamePhase)) {
    return playerEyeRenderOffset;
  }
  const forward = camera.getDirection(new Vector3(0, 0, 1));
  const downward = Math.max(0, -forward.y);
  const downwardAngleRadians = Math.asin(downward);
  const blend = computeFirstPersonViewOffsetBlend(downwardAngleRadians);
  if (blend <= 0) {
    return playerEyeRenderOffset;
  }
  const horizontalOffsetDirectionScale = -1;
  firstPersonViewHorizontalForward.set(
    forward.x * horizontalOffsetDirectionScale,
    0,
    forward.z * horizontalOffsetDirectionScale
  );
  if (
    firstPersonViewHorizontalForward.lengthSquared() <=
    firstPersonViewOffsetMinDirectionLengthSq
  ) {
    firstPersonViewHorizontalForward.set(
      Math.sin(camera.rotation.y) * horizontalOffsetDirectionScale,
      0,
      Math.cos(camera.rotation.y) * horizontalOffsetDirectionScale
    );
  }
  if (
    firstPersonViewHorizontalForward.lengthSquared() <=
    firstPersonViewOffsetMinDirectionLengthSq
  ) {
    return playerEyeRenderOffset;
  }
  firstPersonViewHorizontalForward.normalize();
  const desiredLength =
    layout.cellSize * firstPersonViewOffsetMaxDistanceScale * blend;
  const clampedLength = clampFirstPersonViewOffsetLength(
    firstPersonViewHorizontalForward,
    desiredLength
  );
  playerEyeRenderOffset.copyFrom(firstPersonViewHorizontalForward);
  playerEyeRenderOffset.scaleInPlace(clampedLength);
  playerEyeRenderOffset.y =
    layout.cellSize * firstPersonViewOffsetMaxHeightCells * blend;
  return playerEyeRenderOffset;
};

const shouldApplyLowEyeHeightAdjustment = () =>
  playerNoGunTouchBrainwashTimer <= 0 &&
  (playerState === "brainwash-in-progress" ||
    playerState === "brainwash-complete-haigure" ||
    playerState === "brainwash-complete-haigure-formation");

const computePlayerPortraitHeightAdjustmentY = () =>
  shouldApplyLowEyeHeightAdjustment()
    ? -playerEyeRenderOffset.y * (1 - firstPersonLowEyeHeightSlideRatio)
    : 0;

const applyRenderCameraPosition = () => {
  playerEyeRenderPosition.copyFrom(playerEyeBasePosition);
  if (!shouldShowFirstPersonBodyForPhase(gamePhase)) {
    renderCameraPositionApplied = false;
    return;
  }
  computeFirstPersonViewOffset();
  playerEyeRenderPosition.addInPlace(playerEyeRenderOffset);
  playerEyeRenderPosition.y += computePlayerPortraitHeightAdjustmentY();
  camera.position.copyFrom(playerEyeRenderPosition);
  renderCameraPositionApplied = playerEyeRenderOffset.lengthSquared() > 0;
};

const computeCharacterFacingYawFromViewMatrix = (
  viewMatrix: Matrix,
  fallbackYaw: number
) => {
  viewMatrix.invertToRef(characterFacingViewInverseMatrix);
  Vector3.TransformNormalFromFloatsToRef(
    0,
    0,
    scene.useRightHandedSystem ? -1 : 1,
    characterFacingViewInverseMatrix,
    characterFacingForward
  );
  const horizontalForwardLengthSq =
    characterFacingForward.x * characterFacingForward.x +
    characterFacingForward.z * characterFacingForward.z;
  if (horizontalForwardLengthSq > characterFacingMinForwardLengthSq) {
    return Math.atan2(characterFacingForward.x, characterFacingForward.z);
  }
  Vector3.TransformNormalFromFloatsToRef(
    0,
    1,
    0,
    characterFacingViewInverseMatrix,
    characterFacingUp
  );
  const horizontalUpLengthSq =
    characterFacingUp.x * characterFacingUp.x +
    characterFacingUp.z * characterFacingUp.z;
  return horizontalUpLengthSq > characterFacingMinForwardLengthSq
    ? Math.atan2(characterFacingUp.x, characterFacingUp.z)
    : fallbackYaw;
};

const applyCharacterFacingYaw = (yaw: number) => {
  characterScene.applyFacingYaw(yaw);
};

const applyCharacterMirrorFlip = (mirrored: boolean) => {
  characterScene.applyMirrorFlip(mirrored, playerAvatar, npcs);
};

const syncCharacterFacingYaw = () => {
  currentCharacterFacingYaw = computeCharacterFacingYawFromViewMatrix(
    camera.getViewMatrix(),
    currentCharacterFacingYaw
  );
  applyCharacterFacingYaw(currentCharacterFacingYaw);
};

const rebindVoiceActors = () => {
  characterScene.rebindVoices({
    playerPosition: () => playerEyeBasePosition,
    getPlayerState: () => playerState,
    npcs,
    getNpcState: (npc) =>
      executionNpcVoiceStateOverrides.get(npc.sprite.name) ?? npc.state
  });
};

const syncTitleCameraHeight = () => {
  const eyeHeight = getEyeHeight();
  spawnPosition.y = eyeHeight;
  if (gamePhase !== "title") {
    return;
  }
  const currentForward = camera.getDirection(new Vector3(0, 0, 1));
  const horizontalForward = new Vector3(
    currentForward.x,
    0,
    currentForward.z
  );
  if (horizontalForward.lengthSquared() <= 0.0001) {
    horizontalForward.copyFrom(spawnForward);
  } else {
    horizontalForward.normalize();
  }
  camera.position.y = eyeHeight;
  camera.setTarget(
    new Vector3(
      camera.position.x + horizontalForward.x,
      eyeHeight,
      camera.position.z + horizontalForward.z
    )
  );
};

const orbCullDistance = 5;
const orbCullDistanceSq = orbCullDistance * orbCullDistance;
const orbCullCenter = new Vector3(0, 0, 0);
const buildOrbCullingCheck = () => {
  orbCullCenter.set(
    camera.position.x,
    playerCenterHeight,
    camera.position.z
  );
  const frustumPlanes = Frustum.GetPlanes(
    camera.getTransformationMatrix()
  );
  return (position: Vector3) => {
    const dx = position.x - orbCullCenter.x;
    const dy = position.y - orbCullCenter.y;
    const dz = position.z - orbCullCenter.z;
    if (dx * dx + dy * dy + dz * dz > orbCullDistanceSq) {
      return false;
    }
    return Frustum.IsPointInFrustum(position, frustumPlanes);
  };
};

const audioManager = new AudioManager(camera);
const volumeBase: Record<AudioCategory, number> = {
  bgm: audioManager.getCategoryVolume("bgm"),
  se: audioManager.getCategoryVolume("se"),
  voice: audioManager.getCategoryVolume("voice")
};
const volumeLevels: VolumeLevels = { ...initialVolumeLevels };
const applyVolumeLevel = (category: AudioCategory, level: number) => {
  volumeLevels[category] = level;
  audioManager.setCategoryVolume(category, volumeBase[category] * (level / 10));
};
const saveTitleSettings = () => {
  savePersistedTitleSettings(TITLE_SETTINGS_STORAGE_KEY, {
    version: TITLE_SETTINGS_STORAGE_VERSION,
    volumeLevels: { ...volumeLevels },
    stageId: stageSelection.id,
    alarmTrapEnabled: titleAlarmTrapEnabled,
    playerSettings: { ...titlePlayerSettings },
    defaultStartSettings: { ...titleDefaultStartSettings },
    brainwashSettings: { ...titleBrainwashSettings },
    bitSpawnSettings: { ...titleBitSpawnSettings }
  });
};
const buildTitleSettingsSidebarSettings = (): TitleSettingsSidebarSettings => ({
  playerSettings: { ...titlePlayerSettings },
  defaultStartSettings: { ...titleDefaultStartSettings },
  brainwashSettings: { ...titleBrainwashSettings },
  bitSpawnSettings: { ...titleBitSpawnSettings }
});
const applyTitleSettingsSidebarSettings = (
  settings: TitleSettingsSidebarSettings
) => {
  titlePlayerSettings = { ...settings.playerSettings };
  titleDefaultStartSettings = { ...settings.defaultStartSettings };
  titleBrainwashSettings = { ...settings.brainwashSettings };
  titleBitSpawnSettings = { ...settings.bitSpawnSettings };
};
const titleVolumePanel = createVolumePanel({
  parent: document.body,
  initialLevels: volumeLevels,
  className: "volume-panel--title",
  onChange: (category, level) => {
    applyVolumeLevel(category, level);
    saveTitleSettings();
  }
});
const titleStageSelectControl = createStageSelectControl({
  parent: titleOverlayElement,
  stages: stageSelectionsForMenu,
  initialStageId: stageSelection.id,
  initialAlarmTrapEnabled: titleAlarmTrapEnabled,
  className: "stage-select-control--title-overlay",
  onChange: (stageId) => {
    const nextSelection = stageSelectionsForMenu.find(
      (selection) => selection.id === stageId
    )!;
    void applyStageSelection(nextSelection);
  },
  onAlarmTrapEnabledChange: (enabled) => {
    titleAlarmTrapEnabled = enabled;
    saveTitleSettings();
    if (gamePhase === "title" && !stageSelectionInProgress) {
      scheduleTitleStartPreparation();
    }
  }
});
const titleSettingsSidebar = createTitleSettingsSidebar({
  parent: document.body,
  initialSettings: buildTitleSettingsSidebarSettings(),
  portraitDirectories,
  voiceDirectories,
  initialStageId: stageSelection.id,
  onSettingsChange: (settings, event) => {
    applyTitleSettingsSidebarSettings(settings);
    saveTitleSettings();
    if (event.reason === "player-settings") {
      syncTitleCameraHeight();
    }
    if (event.shouldReload) {
      window.location.reload();
      return;
    }
    if (event.requiresStartPrepare && gamePhase === "title") {
      scheduleTitleStartPreparation();
    }
  },
  onResetRequested: () => {
    void resetTitleSettingsToDefault();
  },
  onConfirmEnableNoGunTouch: () =>
    window.confirm(enableNoGunTouchBrainwashConfirmMessage),
  shouldShowGameOverWarning: (stageId, settings) =>
    hasNeverGameOverRisk(
      stageId,
      settings.defaultStartSettings,
      settings.brainwashSettings,
      settings.bitSpawnSettings
    ),
  getAvailability: (stageId) => {
    const availability = getTitleSettingsAvailability(stageId);
    titleStageSelectControl.setAlarmTrapEditable(availability.alarmTrapEditable);
    return availability;
  },
  isTrapRoomStage: (stageId) => stageId === TRAP_STAGE_ID
});
const volumeCategories: AudioCategory[] = ["voice", "bgm", "se"];
const resetTitleSettingsToDefault = async () => {
  const defaults = buildDefaultPersistedTitleSettings(
    TITLE_SETTINGS_STORAGE_VERSION,
    titleSettingsDefaults
  );
  clearPersistedTitleSettings(TITLE_SETTINGS_STORAGE_KEY);
  for (const category of volumeCategories) {
    const level = defaults.volumeLevels[category];
    titleVolumePanel.setLevel(category, level);
    applyVolumeLevel(category, level);
  }
  const nextSidebarSettings: TitleSettingsSidebarSettings = {
    playerSettings: defaults.playerSettings,
    defaultStartSettings: defaults.defaultStartSettings,
    brainwashSettings: defaults.brainwashSettings,
    bitSpawnSettings: defaults.bitSpawnSettings
  };
  titleSettingsSidebar.setSettings(nextSidebarSettings);
  applyTitleSettingsSidebarSettings(nextSidebarSettings);
  syncTitleCameraHeight();
  titleStageSelectControl.setAlarmTrapEnabled(defaults.alarmTrapEnabled);
  const defaultSelection = STAGE_CATALOG.find(
    (selection) => selection.id === defaults.stageId
  )!;
  await applyStageSelection(defaultSelection);
  clearPersistedTitleSettings(TITLE_SETTINGS_STORAGE_KEY);
};
for (const category of volumeCategories) {
  applyVolumeLevel(category, volumeLevels[category]);
}
titleVolumePanel.setVisible(true);
titleStageSelectControl.setVisible(true);
titleSettingsSidebar.setVisible(true);
titleSettingsSidebar.syncWarning();
const isTitleUiTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    titleSettingsSidebar.isUiTarget(target) ||
    target.closest(
      "[data-ui=\"volume-panel\"], [data-ui=\"stage-select-control\"]"
    ) !== null
  );
};
const prepareTitleStartRequest = async (
  request: TitleStartPreparationRequestData,
  session?: TitleStartPreparationLoadingSession
) => {
  applyRuntimeSettings(request.runtimeSettings);
  await resetGame(session as TitleLoadingSession | undefined, request.assignments);
};
const scheduleTitleStartPreparation = () => {
  titleStartPreparation.schedule(buildTitleStartPreparationRequest());
};
const ensureTitleStartPreparationReady = async () => {
  const request = buildTitleStartPreparationRequest();
  const state = await titleStartPreparation.ensureReady(request);
  if (
    state.fingerprint !== request.fingerprint ||
    !state.assignments ||
    !state.runtimeSettings
  ) {
    return null;
  }
  return state;
};
const bgmFiles = import.meta.glob("/public/audio/bgm/*.mp3");
const resolveAssetUrl = (relativePath: string) =>
  `${import.meta.env.BASE_URL}${relativePath}`;
const publicAssetPathPrefix = "/public/";
const convertPublicPathToAssetUrl = (publicPath: string) =>
  resolveAssetUrl(publicPath.slice(publicAssetPathPrefix.length));
const bgmFilePaths = Object.keys(bgmFiles);
const bgmUrls = bgmFilePaths.map((path) => convertPublicPathToAssetUrl(path));
const pickRandomBgmUrl = () => {
  if (bgmUrls.length === 0) {
    return null;
  }
  return bgmUrls[Math.floor(Math.random() * bgmUrls.length)];
};
const getStageBgmUrl = (stageName: string) => {
  const filePath = `/public/audio/bgm/${stageName}.mp3`;
  if (bgmFiles[filePath]) {
    return resolveAssetUrl(`audio/bgm/${stageName}.mp3`);
  }
  return null;
};
const selectBgmUrl = (stageName: string | null) => {
  if (stageName) {
    const matched = getStageBgmUrl(stageName);
    if (matched) {
      return matched;
    }
  }
  return pickRandomBgmUrl();
};
const seFiles = import.meta.glob("/public/audio/se/*.mp3");
const seFilePaths = Object.keys(seFiles);
const seUrls = new Set(
  seFilePaths.map((path) => convertPublicPathToAssetUrl(path))
);
const isSeAvailable = (url: string) => seUrls.has(url);
const bitSeMove = resolveAssetUrl("audio/se/FlyingObject.mp3");
const bitSeAlert = resolveAssetUrl("audio/se/BeamShot_WavingPart.mp3");
const bitSeTarget = resolveAssetUrl("audio/se/aim.mp3");
const alarmSe = resolveAssetUrl("audio/se/alarm.mp3");
const bitSeBeamNonTarget = [
  resolveAssetUrl("audio/se/BeamShotR_DownLong.mp3"),
  resolveAssetUrl("audio/se/BeamShotR_Down.mp3"),
  resolveAssetUrl("audio/se/BeamShotR_DownShort.mp3")
];
const bitSeBeamTarget = [
  resolveAssetUrl("audio/se/BeamShotR_Up.mp3"),
  resolveAssetUrl("audio/se/BeamShotR_UpShort.mp3"),
  resolveAssetUrl("audio/se/BeamShotR_UpHighShort.mp3")
];
const hitSeVariants = [
  resolveAssetUrl("audio/se/BeamHit_Rev.mp3"),
  resolveAssetUrl("audio/se/BeamHit_RevLong.mp3"),
  resolveAssetUrl("audio/se/BeamHit_RevLongFast.mp3")
];
const seBaseOptions: SpatialPlayOptions = {
  volume: 0.95,
  maxDistance: 3.75,
  loop: false
};
const alarmSeOptions: SpatialPlayOptions = {
  volume: 0.95,
  maxDistance: 6,
  loop: false
};
const rouletteSpinLoopOptions: SpatialPlayOptions = {
  volume: seBaseOptions.volume,
  maxDistance: 3.75,
  loop: true
};
const alertLoopOptions: SpatialPlayOptions = {
  volume: 0.95,
  maxDistance: 3.75,
  loop: true
};
const beamSeOptions: SpatialPlayOptions = {
  volume: 0.8,
  maxDistance: 5,
  loop: false
};
const hitSeOptions: SpatialPlayOptions = {
  volume: 1,
  maxDistance: 5.42,
  loop: false
};
const voiceBaseOptions: SpatialPlayOptions = {
  volume: 0.72,
  maxDistance: 4.17,
  loop: false
};
const voiceLoopOptions: SpatialPlayOptions = {
  volume: 0.72,
  maxDistance: 4.17,
  loop: true
};
const beamSeFarDistance = 2.33;
const beamSeMidDistance = 1.33;

const sfxDirector = new SfxDirector(
  audioManager,
  () => playerEyeBasePosition,
  {
    bitMove: bitSeMove,
    bitAlert: bitSeAlert,
    bitTarget: bitSeTarget,
    beamNonTarget: bitSeBeamNonTarget,
    beamTarget: bitSeBeamTarget,
    hit: hitSeVariants
  },
  {
    base: seBaseOptions,
    alertLoop: alertLoopOptions,
    beam: beamSeOptions,
    hit: hitSeOptions
  },
  {
    far: beamSeFarDistance,
    mid: beamSeMidDistance
  },
  isSeAvailable
);

const bitSoundEvents: BitSoundEvents = {
  onMoveStart: (bit) => {
    sfxDirector.playBitMove(() => bit.root.position);
  },
  onAlert: (bit) => {
    startAlertLoop(bit);
  },
  onTargetPlayer: (bit) => {
    sfxDirector.playBitTarget(() => bit.root.position);
  },
  onBeamFire: (bit, targetingPlayer) => {
    sfxDirector.playBitBeam(() => bit.root.position, targetingPlayer);
  }
};

let alertSeHandle: SpatialHandle | null = null;
let alertSeLeaderId: string | null = null;
let rouletteSpinSeHandle: SpatialHandle | null = null;
const stopAlertLoop = () => {
  if (!alertSeHandle) {
    return;
  }
  alertSeHandle.stop();
  alertSeHandle = null;
  alertSeLeaderId = null;
};
const startAlertLoop = (bit: Bit) => {
  if (alertSeLeaderId === bit.id && alertSeHandle?.isActive()) {
    return;
  }
  if (alertSeHandle) {
    alertSeHandle.stop();
  }
  alertSeLeaderId = bit.id;
  alertSeHandle = sfxDirector.playAlertLoop(() => bit.root.position);
};
const stopRouletteSpinLoop = () => {
  if (!rouletteSpinSeHandle) {
    return;
  }
  rouletteSpinSeHandle.stop();
  rouletteSpinSeHandle = null;
};
const startRouletteSpinLoop = () => {
  if (rouletteSpinSeHandle?.isActive()) {
    return;
  }
  rouletteSpinSeHandle = audioManager.playSe(
    bitSeMove,
    () => {
      const sourceBit = bits[0];
      return sourceBit ? sourceBit.root.position : rouletteCenter;
    },
    rouletteSpinLoopOptions
  );
};
const isAlertBitMode = (mode: Bit["mode"]) =>
  mode === "alert-send" || mode === "alert-receive";

const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
light.intensity = 1.2;
scene.ambientColor = new Color3(0.45, 0.45, 0.45);
scene.collisionsEnabled = true;
let playerAvatar: Sprite;
const groundShadowManager = createGroundShadowManager(scene);
const bitGroundShadows = new Map<string, BitGroundShadowHandles>();
const characterFacingViewInverseMatrix = Matrix.Identity();
const characterFacingForward = Vector3.Zero();
const characterFacingUp = Vector3.Zero();
let currentCharacterFacingYaw = 0;
let currentReflectionCharacterFacingYaw = 0;
const npcs: Npc[] = [];
const npcTargetBuffer: TargetInfo[] = [];
const npcEvadeThreatsBuffer: Vector3[][] = [];
const activeBitGroundShadowIds = new Set<string>();
const activeDynamicBeamCells = new Set<number>();
const playerHitCenterPosition = Vector3.Zero();
const playerHitImpactDirection = Vector3.Zero();
const playerHitImpactPosition = Vector3.Zero();
let firstPersonBodyMesh: Mesh;
let firstPersonBodyMaterial: StandardMaterial;
let firstPersonBodyTexture: DynamicTexture | null = null;
let firstPersonBodySheetImage: HTMLImageElement | null = null;
let firstPersonBodySheetDirectory = "";
let firstPersonBodySheetCellWidth = 0;
let firstPersonBodySheetCellHeight = 0;
let firstPersonBodyLastCellIndex = -1;
const firstPersonBodyVertexPositions = new Float32Array(12);
const clampValue = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const lerpValue = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;
const stretchScreenYFromAnchor = (
  anchorScreenY: number,
  targetScreenY: number,
  stretch: number
) => anchorScreenY + (targetScreenY - anchorScreenY) * stretch;
const projectScreenYToLocal = (screenY: number, depth: number) =>
  screenY * depth * Math.tan(camera.fov * 0.5);
const projectHalfWidthToLocal = (halfWidth: number, depth: number) => {
  const aspect =
    scene.getEngine().getRenderWidth() /
    scene.getEngine().getRenderHeight();
  return halfWidth * depth * Math.tan(camera.fov * 0.5) * aspect;
};
const loadImageFromUrl = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });
const createFirstPersonBodyMesh = () => {
  firstPersonBodyMesh = new Mesh("playerBodyLayer", scene);
  const vertexData = new VertexData();
  vertexData.positions = Array.from(firstPersonBodyVertexPositions);
  vertexData.indices = [0, 1, 2, 0, 2, 3];
  vertexData.uvs = [
    0, 1,
    1, 1,
    1, 0,
    0, 0
  ];
  const normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  vertexData.normals = normals;
  vertexData.applyToMesh(firstPersonBodyMesh, true);
  firstPersonBodyMaterial = new StandardMaterial(
    "playerBodyLayerMaterial",
    scene
  );
  firstPersonBodyMaterial.disableLighting = true;
  firstPersonBodyMaterial.specularColor = Color3.Black();
  firstPersonBodyMaterial.backFaceCulling = false;
  firstPersonBodyMaterial.useAlphaFromDiffuseTexture = true;
  firstPersonBodyMaterial.alpha = 0;
  firstPersonBodyMesh.material = firstPersonBodyMaterial;
  firstPersonBodyMesh.parent = camera;
  firstPersonBodyMesh.renderingGroupId = 3;
  firstPersonBodyMesh.layerMask = firstPersonBodyLayerMask;
  firstPersonBodyMesh.isPickable = false;
  firstPersonBodyMesh.isVisible = false;
  firstPersonBodyMesh.alwaysSelectAsActiveMesh = true;
};
const updateFirstPersonBodyMeshGeometry = (visibility: number) => {
  const slideVisibility = visibility;
  const shapeVisibility = visibility * 0.28;
  const chestRowDepth = lerpValue(
    firstPersonBodyChestRowZStart,
    firstPersonBodyChestRowZEnd,
    shapeVisibility
  );
  const chestRowHalfWidth = projectHalfWidthToLocal(
    lerpValue(
      firstPersonBodyChestRowHalfWidthStart,
      firstPersonBodyChestRowHalfWidthEnd,
      shapeVisibility
    ),
    chestRowDepth
  );
  const feetRowScreenY = lerpValue(
    firstPersonBodyFeetRowScreenYStart,
    firstPersonBodyFeetRowScreenYEnd,
    slideVisibility
  );
  const chestRowScreenY = stretchScreenYFromAnchor(
    feetRowScreenY,
    lerpValue(
      firstPersonBodyChestRowScreenYStart,
      firstPersonBodyChestRowScreenYEnd,
      slideVisibility
    ),
    firstPersonBodyNearRowStretch
  );
  const chestRowY = projectScreenYToLocal(
    chestRowScreenY,
    chestRowDepth
  );
  const feetRowDepth = lerpValue(
    firstPersonBodyFeetRowZStart,
    firstPersonBodyFeetRowZEnd,
    shapeVisibility
  );
  const feetRowHalfWidth = projectHalfWidthToLocal(
    lerpValue(
      firstPersonBodyFeetRowHalfWidthStart,
      firstPersonBodyFeetRowHalfWidthEnd,
      shapeVisibility
    ),
    feetRowDepth
  );
  const feetRowY = projectScreenYToLocal(
    feetRowScreenY,
    feetRowDepth
  );
  firstPersonBodyVertexPositions[0] = -feetRowHalfWidth;
  firstPersonBodyVertexPositions[1] = feetRowY;
  firstPersonBodyVertexPositions[2] = feetRowDepth;
  firstPersonBodyVertexPositions[3] = feetRowHalfWidth;
  firstPersonBodyVertexPositions[4] = feetRowY;
  firstPersonBodyVertexPositions[5] = feetRowDepth;
  firstPersonBodyVertexPositions[6] = chestRowHalfWidth;
  firstPersonBodyVertexPositions[7] = chestRowY;
  firstPersonBodyVertexPositions[8] = chestRowDepth;
  firstPersonBodyVertexPositions[9] = -chestRowHalfWidth;
  firstPersonBodyVertexPositions[10] = chestRowY;
  firstPersonBodyVertexPositions[11] = chestRowDepth;
  firstPersonBodyMesh.updateVerticesData(
    VertexBuffer.PositionKind,
    firstPersonBodyVertexPositions
  );
  firstPersonBodyMesh.refreshBoundingInfo(true);
};
const disposeFirstPersonBodyTexture = () => {
  if (firstPersonBodyTexture) {
    firstPersonBodyTexture.dispose();
    firstPersonBodyTexture = null;
  }
};
const configureFirstPersonBodyTexture = (
  cellWidth: number,
  cellHeight: number
) => {
  disposeFirstPersonBodyTexture();
  const cropTopPx = Math.floor(cellHeight * firstPersonBodyCropTopRatio);
  const cropHeight = Math.max(1, cellHeight - cropTopPx);
  firstPersonBodyTexture = new DynamicTexture(
    "playerBodyLayerTexture",
    { width: cellWidth, height: cropHeight },
    scene,
    true
  );
  firstPersonBodyTexture.hasAlpha = true;
  firstPersonBodyTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
  firstPersonBodyTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
  firstPersonBodyMaterial.diffuseTexture = firstPersonBodyTexture;
  firstPersonBodyMaterial.emissiveTexture = firstPersonBodyTexture;
};
const redrawFirstPersonBodyTexture = (cellIndex: number) => {
  if (
    !firstPersonBodyTexture ||
    !firstPersonBodySheetImage ||
    cellIndex === firstPersonBodyLastCellIndex
  ) {
    return;
  }
  const cropTopPx = Math.floor(
    firstPersonBodySheetCellHeight * firstPersonBodyCropTopRatio
  );
  const cropHeight = firstPersonBodySheetCellHeight - cropTopPx;
  const destinationHeight = firstPersonBodyTexture.getSize().height;
  const ctx = firstPersonBodyTexture.getContext();
  ctx.clearRect(0, 0, firstPersonBodyTexture.getSize().width, destinationHeight);
  ctx.drawImage(
    firstPersonBodySheetImage,
    cellIndex * firstPersonBodySheetCellWidth,
    cropTopPx,
    firstPersonBodySheetCellWidth,
    cropHeight,
    0,
    0,
    firstPersonBodySheetCellWidth,
    destinationHeight
  );
  firstPersonBodyTexture.update(false);
  firstPersonBodyLastCellIndex = cellIndex;
};
const ensureFirstPersonBodySheet = async (directory: string) => {
  if (firstPersonBodySheetDirectory === directory && firstPersonBodySheetImage) {
    return;
  }
  const sheet = characterScene.getPortraitSpriteSheet(directory);
  const image = await loadImageFromUrl(sheet.url);
  firstPersonBodySheetDirectory = directory;
  firstPersonBodySheetImage = image;
  firstPersonBodySheetCellWidth = sheet.cellWidth;
  firstPersonBodySheetCellHeight = sheet.cellHeight;
  firstPersonBodyLastCellIndex = -1;
  configureFirstPersonBodyTexture(sheet.cellWidth, sheet.cellHeight);
};
const computeFirstPersonBodyVisibility = () => {
  if (!shouldShowFirstPersonBodyForPhase(gamePhase)) {
    return 0;
  }
  const forward = camera.getDirection(new Vector3(0, 0, 1));
  const floorUnderPlayerVisibleThreshold = Math.cos(camera.fov * 0.5);
  return clampValue(
    (-forward.y - floorUnderPlayerVisibleThreshold) /
      (1 - floorUnderPlayerVisibleThreshold),
    0,
    1
  );
};
const syncFirstPersonBodyVisibility = () => {
  if (firstPersonPreviewUsePlayerSprite) {
    firstPersonBodyMesh.isVisible = false;
    return;
  }
  if (
    !shouldShowFirstPersonBodyForPhase(gamePhase) ||
    !firstPersonBodyTexture ||
    !firstPersonBodySheetImage
  ) {
    firstPersonBodyMesh.isVisible = false;
    return;
  }
  const visibility = computeFirstPersonBodyVisibility();
  if (visibility <= 0) {
    firstPersonBodyMesh.isVisible = false;
    return;
  }
  firstPersonBodyMesh.isVisible = true;
  updateFirstPersonBodyMeshGeometry(visibility);
  firstPersonBodyMaterial.alpha = firstPersonBodyBaseAlpha;
};
createFirstPersonBodyMesh();

const refreshPortraitSizes = () => {
  characterScene.refreshPortraitSizes(playerAvatar, npcs, portraitCellSize);
};

const disposeBitGroundShadows = () => {
  for (const groundShadow of bitGroundShadows.values()) {
    groundShadowManager.disposeGroundShadow(groundShadow.shape);
    groundShadowManager.disposeGroundShadow(groundShadow.circle);
  }
  bitGroundShadows.clear();
};

const disposeAllGroundShadows = () => {
  characterScene.disposeCharacterGroundShadows();
  disposeBitGroundShadows();
};

const rebuildCharacters = async (
  session?: TitleLoadingSession,
  assignments?: CharacterAssignments
) => {
  const nextAssignments =
    assignments ??
    buildCharacterAssignments(
      runtimeDefaultStartSettings.initialNpcCount,
      titlePlayerSettings
    );
  playerAvatar = await characterScene.prepareCharacters({
    assignments: nextAssignments,
    playerAvatar,
    npcs,
    session,
    spawnPosition,
    layout,
    spawnableCells,
    initialNpcCount: runtimeDefaultStartSettings.initialNpcCount,
    initialBrainwashedNpcPercent:
      runtimeDefaultStartSettings.initialBrainwashedNpcPercent,
    portraitCellSize
  });
  await ensureFirstPersonBodySheet(characterScene.getPlayerPortraitDirectory());
};

playerAvatar = await characterScene.prepareCharacters({
  assignments: initialCharacterAssignments,
  playerAvatar: null,
  npcs,
  session: initialLoadingSession,
  spawnPosition,
  layout,
  spawnableCells,
  initialNpcCount: runtimeDefaultStartSettings.initialNpcCount,
  initialBrainwashedNpcPercent:
    runtimeDefaultStartSettings.initialBrainwashedNpcPercent,
  portraitCellSize
});
await ensureFirstPersonBodySheet(characterScene.getPlayerPortraitDirectory());
initialLoadingSession.finish();
const titleStartPreparation: TitleStartPreparationController<
  CharacterAssignments,
  RuntimeSettingsByStage
> = createTitleStartPreparationController({
  debounceMs: titleStartPreparationDebounceMs,
  createLoadingSession: (initialTotal) => createTitleLoadingSession(initialTotal),
  prepare: (request, session) => prepareTitleStartRequest(request, session)
});
titleStartPreparation.markReady({
  fingerprint: buildTitleStartPreparationFingerprint(),
  loadingTotal: 0,
  assignments: initialCharacterAssignments,
  runtimeSettings: initialRuntimeSettings
});

const clearStageReflectiveResources = () => {
  for (const reflectiveMaterial of stageParts.reflectiveMaterials) {
    reflectiveMaterial.dispose();
  }
  stageParts.reflectiveMaterials.length = 0;
  for (const reflectiveTexture of stageParts.reflectiveTextures) {
    reflectiveTexture.dispose();
  }
  stageParts.reflectiveTextures.length = 0;
  for (const reflectiveSurface of stageParts.reflectiveSurfaces) {
    reflectiveSurface.mesh.material = null;
  }
};
const createReflectionTexture = (
  name: string,
  mirrorPlane: Plane,
  blur: number,
  ratio: number,
  excludedMeshIds: ReadonlySet<number>
) => {
  const mirrorTexture = new MirrorTexture(name, { ratio }, scene);
  mirrorTexture.mirrorPlane = mirrorPlane;
  mirrorTexture.activeCamera = reflectionCamera;
  mirrorTexture.renderSprites = true;
  mirrorTexture.forceLayerMaskCheck = true;
  mirrorTexture.renderListPredicate = (mesh) =>
    !excludedMeshIds.has(mesh.uniqueId);
  mirrorTexture.onBeforeRenderObservable.add(() => {
    currentReflectionCharacterFacingYaw = computeCharacterFacingYawFromViewMatrix(
      scene.getViewMatrix(),
      currentReflectionCharacterFacingYaw
    );
    applyCharacterFacingYaw(currentReflectionCharacterFacingYaw);
    applyCharacterMirrorFlip(true);
  });
  mirrorTexture.onAfterRenderObservable.add(() => {
    applyCharacterFacingYaw(currentCharacterFacingYaw);
    applyCharacterMirrorFlip(false);
  });
  if (blur > 0) {
    mirrorTexture.adaptiveBlurKernel = blur;
  }
  return mirrorTexture;
};
const createReflectiveMaterial = (
  name: string,
  reflectionTexture: MirrorTexture,
  tint: Color3,
  amount: number
) => {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.specularColor = Color3.Black();
  reflectionTexture.level = amount;
  material.reflectionTexture = reflectionTexture;
  material.diffuseColor = tint.scale(1 - amount);
  material.emissiveColor = tint.scale((1 - amount) * 0.35);
  return material;
};
const syncStageReflectiveSurfaces = () => {
  clearStageReflectiveResources();
  if (stageParts.reflectiveSurfaces.length === 0) {
    return;
  }
  const excludedReflectiveMeshIds = new Set(
    stageParts.reflectiveSurfaces.map(
      (reflectiveSurface) => reflectiveSurface.mesh.uniqueId
    )
  );
  for (let index = 0; index < stageParts.reflectiveSurfaces.length; index += 1) {
    const reflectiveSurface = stageParts.reflectiveSurfaces[index];
    const reflectionTexture = createReflectionTexture(
      `mirrorReflectionTexture_${index}`,
      reflectiveSurface.mirrorPlane,
      reflectiveSurface.blur,
      1,
      excludedReflectiveMeshIds
    );
    stageParts.reflectiveTextures.push(reflectionTexture);
    const material = createReflectiveMaterial(
      `mirrorMaterial_${index}`,
      reflectionTexture,
      reflectiveSurface.tint,
      reflectiveSurface.amount
    );
    reflectiveSurface.mesh.material = material;
    stageParts.reflectiveMaterials.push(material);
  }
};
syncStageReflectiveSurfaces();

const bitMaterials = createBitMaterials(scene);
const redBitMaterials = createBitMaterials(scene);
redBitMaterials.body.diffuseColor = new Color3(0.7, 0.08, 0.08);
redBitMaterials.body.emissiveColor = new Color3(0.25, 0.04, 0.04);
redBitMaterials.nozzle.diffuseColor = new Color3(0.8, 0.15, 0.15);
redBitMaterials.nozzle.emissiveColor = new Color3(0.35, 0.08, 0.08);
const carpetBitMaterials = createBitMaterials(scene);
carpetBitMaterials.body.diffuseColor = new Color3(0.32, 0.32, 0.32);
carpetBitMaterials.body.emissiveColor = new Color3(0.08, 0.08, 0.08);
carpetBitMaterials.nozzle.diffuseColor = new Color3(0.22, 0.22, 0.22);
carpetBitMaterials.nozzle.emissiveColor = new Color3(0.1, 0.1, 0.1);

// 赤ビット（通常の3倍の性能を持つビット）の出現確率。0-1の確率で判定し、デフォルトは0.05
const redBitSpawnChance = 0.05;
const redBitStatMultiplier = 3;
const applyRedBit = (bit: Bit) => {
  bit.isRed = true;
  bit.statMultiplier = redBitStatMultiplier;
  bit.speed *= redBitStatMultiplier;
  bit.fireInterval /= redBitStatMultiplier;
  bit.fireTimer /= redBitStatMultiplier;
};
const createRandomBit = (index: number) => {
  const isRed = Math.random() < redBitSpawnChance;
  const materials = isRed ? redBitMaterials : bitMaterials;
  const bit = createBit(scene, layout, spawnableCells, materials, index);
  if (isRed) {
    applyRedBit(bit);
  }
  return bit;
};
const createSpawnedBitAt = (
  index: number,
  position: Vector3,
  direction?: Vector3
) => {
  const isRed = Math.random() < redBitSpawnChance;
  const materials = isRed ? redBitMaterials : bitMaterials;
  const bit = createBitAt(scene, layout, materials, index, position, direction);
  if (isRed) {
    applyRedBit(bit);
  }
  return bit;
};
const createCarpetFollowerBitAt = (
  index: number,
  position: Vector3,
  direction?: Vector3
) => createBitAt(scene, layout, carpetBitMaterials, index, position, direction);

const beamMaterial = createBeamMaterial(scene);
const bits = Array.from({ length: 3 }, (_, index) => createRandomBit(index));
const isRedBitSource = (sourceId: string | null) =>
  sourceId !== null &&
  bits.some((bit) => bit.id === sourceId && bit.isRed);
const isBitSource = (sourceId: string | null) =>
  sourceId !== null && bits.some((bit) => bit.id === sourceId);
const beams: Beam[] = [];
const beamTrails: BeamTrail[] = [];
const beamImpactOrbs: BeamImpactOrb[] = [];
const alarmTriggeredNpcIds = new Set<string>();
const bitAlertTargetedNpcIds = new Set<string>();

const trapSourceId = "trap";
const dynamicBeamSourceId = "dynamic_beam";
const isTrapStageSelected = () => stageSelection.id === TRAP_STAGE_ID;
const isDynamicStageSelected = () =>
  stageSelection.id === LABYRINTH_DYNAMIC_STAGE_ID;
const trapSystem = createTrapSystem({
  scene,
  beams,
  npcs,
  isTrapStageSelected,
  spawnTrapBeam: (position, direction) => {
    beams.push(
      createTrapBeam(
        scene,
        position,
        direction,
        beamMaterial,
        trapSourceId,
        layout.cellSize,
        layout,
        bounds
      )
    );
  },
  playTrapBeamSe: (position) => {
    const firePosition = position.clone();
    sfxDirector.playBeamNonTarget(() => firePosition);
  }
});
trapSystem.syncStageContext({ layout, bounds });
const dynamicBeamSystem = createDynamicBeamSystem({
  scene,
  isDynamicStageSelected,
  spawnDynamicBeam: (position, direction) => {
    beams.push(
      createTrapBeam(
        scene,
        position,
        direction,
        beamMaterial,
        dynamicBeamSourceId,
        layout.cellSize,
        layout,
        bounds,
        20
      )
    );
  },
  playDynamicBeamSe: (position) => {
    const firePosition = position.clone();
    sfxDirector.playBeamNonTarget(() => firePosition);
  }
});
dynamicBeamSystem.syncStageContext({
  layout,
  zoneMap: stageZoneMap
});
const alarmSystem = createAlarmSystem({
  scene,
  isAlarmEnabled: () => runtimeAlarmTrapEnabled,
  onTriggerAlarmCell: (_triggerTargetId, centerX, centerZ) => {
    if (!isSeAvailable(alarmSe)) {
      return;
    }
    const alarmPosition = new Vector3(centerX, playerCenterHeight, centerZ);
    audioManager.playSe(alarmSe, () => alarmPosition, alarmSeOptions);
  },
  onNpcTriggerAlarmCell: (npcId) => {
    alarmTriggeredNpcIds.add(npcId);
  }
});
alarmSystem.syncStageContext({
  layout,
  floorCells
});

const alertSignal = {
  leaderId: null as string | null,
  targetId: null as string | null,
  requiredCount: 0,
  receiverIds: [] as string[],
  gatheredIds: new Set<string>()
};
// プレイヤーが光線命中後に点滅状態を繰り返す継続時間（秒）。デフォルトは3
const playerHitDuration = 3;
// プレイヤーの点滅状態後、`hit-a`（光線命中：ハイレグ姿）のまま光がフェードする時間（秒）。デフォルトは1
const playerHitFadeDuration = 1;
const redHitDurationScale = 1;
// プレイヤー光線命中時の光の点滅の切り替え間隔（秒）。小さくしすぎると光の刺激が強いため要注意。デフォルトは0.12
const playerHitFlickerInterval = 0.12;
const playerHitColorA = new Color3(1, 0.18, 0.74);
const playerHitColorB = new Color3(0.2, 0.96, 1);
const playerHitEffectAlpha = 0.45;
const playerHitSpriteColorMix = 0.6;
const toPlayerSpriteFlickerColor = (color: Color3) =>
  new Color4(
    color.r + (1 - color.r) * playerHitSpriteColorMix,
    color.g + (1 - color.g) * playerHitSpriteColorMix,
    color.b + (1 - color.b) * playerHitSpriteColorMix,
    1
  );
const playerHitColorA4 = toPlayerSpriteFlickerColor(playerHitColorA);
const playerHitColorB4 = toPlayerSpriteFlickerColor(playerHitColorB);
const npcSpriteColorNormal = new Color4(1, 1, 1, 1);
const playerHitLightIntensity = 1.1;
const playerHitOrbDiameter = 0.04;
const playerHitOrbMinCount = 5;
const playerHitOrbMaxCount = 20;
const playerHitOrbSurfaceOffsetMin = 0.01;
const playerHitOrbSurfaceOffsetMax = 0.07;
const playerHitOrbSpeedMin = 0.04;
const playerHitOrbSpeedMax = 0.11;
const playerHitFadeOrbConfig: HitFadeOrbConfig = {
  minCount: playerHitOrbMinCount,
  maxCount: playerHitOrbMaxCount,
  diameter: playerHitOrbDiameter,
  surfaceOffsetMin: playerHitOrbSurfaceOffsetMin,
  surfaceOffsetMax: playerHitOrbSurfaceOffsetMax,
  speedMin: playerHitOrbSpeedMin,
  speedMax: playerHitOrbSpeedMax
};
const publicExecutionMaxSurvivors = 5;
const publicExecutionTransitionDelay = 1;
const publicExecutionSimultaneousChance = 0.3;
const publicExecutionBeamDelayMin = 2;
const publicExecutionBeamDelayMax = 10;

const playerNoGunTouchContactRadius = 0.5;
const playerEvadeThreatNearRangeCells = 3;
const playerEvadeThreatVisionRangeCells = 9;
const getSpriteBeamHitRadii = (sprite: Sprite) =>
  createBeamHitRadii(sprite.width, sprite.height);
const playerAbility = createPlayerAbilityController({
  baseMoveSpeed: playerMoveSpeed,
  dashSpeedMultiplier: playerDashSpeedMultiplier,
  staminaMaxTenths: playerStaminaMaxTenths,
  staminaDrainInterval: playerStaminaDrainInterval,
  staminaRecoverInterval: playerStaminaRecoverInterval,
  noGunTouchContactRadius: playerNoGunTouchContactRadius,
  evadeThreatNearRangeCells: playerEvadeThreatNearRangeCells,
  evadeThreatVisionRangeCells: playerEvadeThreatVisionRangeCells
});


type PlayerState = CharacterState;
type PublicExecutionScenario = ExecutionConfig;
type ExecutionHitEntry = {
  target: ExecutionTarget;
  sequence: ReturnType<typeof createHitSequenceState>;
  completed: boolean;
};
type ExecutionTargetState = {
  target: ExecutionTarget;
  key: string;
  completed: boolean;
  firePending: boolean;
  fireCountdown: number;
  fireEffectActive: boolean;
  fireEffectTimer: number;
  beamTargetPosition: Vector3;
  shooterBitIndices: number[];
  shooterNpcIndices: number[];
};
type RouletteHitEntry = {
  target: RouletteHitTarget;
  sequence: ReturnType<typeof createHitSequenceState>;
  completed: boolean;
};
let playerState: PlayerState = "normal";
const playerHitSequence = createHitSequenceState();
let playerHitDurationCurrent = playerHitDuration;
let playerHitFadeDurationCurrent = playerHitFadeDuration;
let playerNoGunTouchBrainwashTimer = 0;
let playerHitById: string | null = null;
let playerHitTime = 0;
let trapSurviveCountAtBrainwash: number | null = null;
let allDownTime: number | null = null;
let brainwashChoiceStarted = false;
let brainwashChoiceUnlocked = false;
let publicExecutionTriggerKey: string | null = null;
let publicExecutionTriggerTimer = 0;
let executionScenario: PublicExecutionScenario | null = null;
let executionWaitForFade = false;
const executionShooterTargetKeys = new Map<string, string>();
let executionTargetStates: ExecutionTargetState[] = [];
let executionHitEntries: ExecutionHitEntry[] = [];
let executionSimultaneousPattern = false;
let executionResolved = false;
let executionAllowPlayerMove = false;
let executionNpcShooterIndices: number[] = [];
const executionNpcVoiceStateOverrides = new Map<string, CharacterState>();
const executionCollisionPosition = new Vector3(0, 0, 0);
const rouletteFireTimeFromSpinStart = 9;
const roulettePostHitWaitDuration = 1;
const rouletteBitMinTurns = 3;
const rouletteBitMaxTurns = 6;
const rouletteBitBobSpeed = 1.2;
const rouletteBitBobHeight = 0.03;
const rouletteCenter = new Vector3(0, 0, 0);
const roulettePlayerPosition = new Vector3(0, 0, 0);
let rouletteCharacterRadius = 0;
let rouletteBitRadius = 0;
let rouletteHitEntries: RouletteHitEntry[] = [];
const rouletteBeamTargets = new Map<Beam, RouletteHitTarget>();
let rouletteSystem!: ReturnType<typeof createRouletteSystem>;

let gamePhase: GamePhase = "title";
const allDownTransitionDelay = 3;
let bitSpawnEnabled = true;

let elapsedTime = 0;
let bitSpawnTimer = runtimeBitSpawnInterval;
let bitIndex = bits.length;

const hud = createHud();
hud.setMinimapReadoutVisible(minimapReadoutVisible);
type HudPhaseState = {
  hudVisible: boolean;
  helpPanelText: string | null;
  crosshairVisible: boolean;
};
let hudPhaseOverride: HudPhaseState | null = null;

const setHudPhaseOverride = (state: HudPhaseState | null) => {
  hudPhaseOverride = state;
};

const updateHudPhaseOverride = (patch: Partial<HudPhaseState>) => {
  if (!hudPhaseOverride) {
    return;
  }
  hudPhaseOverride = { ...hudPhaseOverride, ...patch };
};
const applyStageSelection = async (selection: StageSelection) => {
  const requestId = stageSelectionRequestId + 1;
  stageSelectionRequestId = requestId;
  stageSelectionInProgress = true;
  titleStartPreparation.cancelScheduled();
  await titleStartPreparation.flush();
  stageSelection = selection;
  titleStartPreparation.invalidateReady();
  saveTitleSettings();
  titleStageSelectControl.setSelectedStageId(selection.id);
  titleSettingsSidebar.setStageId(selection.id);
  const runtimeSettings = buildRuntimeSettingsForStageId(selection.id);
  const nextCharacterAssignments = buildCharacterAssignments(
    runtimeSettings.runtimeDefaultStartSettings.initialNpcCount,
    titlePlayerSettings
  );
  const loadingSession = createTitleLoadingSession(
    1 + countUnloadedPortraitDirectoriesForAssignments(nextCharacterAssignments)
  );
  try {
    let loadedStageJson: Awaited<ReturnType<typeof loadStageJson>>;
    try {
      loadedStageJson = await loadStageJson(selection);
    } finally {
      loadingSession.advance();
    }
    if (requestId !== stageSelectionRequestId) {
      return;
    }
    if (gamePhase !== "title") {
      return;
    }
    stageJson = loadedStageJson;
    disposeAllGroundShadows();
    disposeStageParts(stageParts);
    stageContext = buildStageContext(scene, stageJson);
    updateStageState();
    syncStageReflectiveSurfaces();
    trapSystem.syncStageContext({ layout, bounds });
    trapSystem.resetRuntimeState();
    dynamicBeamSystem.syncStageContext({
      layout,
      zoneMap: stageZoneMap
    });
    dynamicBeamSystem.resetRuntimeState();
    alarmSystem.syncStageContext({
      layout,
      floorCells
    });
    alarmSystem.resetRuntimeState();
    applyCameraSpawnTransform();
    refreshPortraitSizes();
    rebuildGameFlow();
    if (gamePhase === "title") {
      const preparationRequest: TitleStartPreparationRequestData = {
        fingerprint: buildTitleStartPreparationFingerprint(),
        loadingTotal: 0,
        assignments: nextCharacterAssignments,
        runtimeSettings
      };
      await prepareTitleStartRequest(preparationRequest, loadingSession);
      if (requestId !== stageSelectionRequestId) {
        return;
      }
      if (gamePhase !== "title") {
        return;
      }
      titleStartPreparation.markReady(preparationRequest);
      hud.setTitleVisible(true);
      setHudPhaseOverride(null);
      gameFlow.resetFade();
    }
  } finally {
    if (requestId === stageSelectionRequestId) {
      stageSelectionInProgress = false;
    }
    loadingSession.finish();
  }
};
syncTitleMessage();

const clearBeams = () => {
  for (const beam of beams) {
    beam.tip.dispose();
    beam.mesh.dispose();
  }
  beams.length = 0;
  for (const trail of beamTrails) {
    trail.mesh.dispose();
  }
  beamTrails.length = 0;
  for (const orb of beamImpactOrbs) {
    orb.mesh.dispose();
  }
  beamImpactOrbs.length = 0;
};

const isCarpetFollower = (bit: Bit) =>
  bit.carpetLeaderId !== null && bit.carpetLeaderId !== bit.id;

const countNonFollowerBits = () => {
  let count = 0;
  for (const bit of bits) {
    if (!isCarpetFollower(bit)) {
      count += 1;
    }
  }
  return count;
};

const disposeAllBits = () => {
  for (const bit of bits) {
    disposeBit(bit);
  }
  bits.length = 0;
  disposeBitGroundShadows();
};

const removeCarpetFollowers = () => {
  const followerIds = new Set(
    bits
      .filter(
        (bit) => isCarpetFollower(bit)
      )
      .map((bit) => bit.id)
  );
  for (const bit of bits) {
    if (followerIds.has(bit.id)) {
      disposeBit(bit);
    }
  }
  for (let index = bits.length - 1; index >= 0; index -= 1) {
    if (followerIds.has(bits[index].id)) {
      bits.splice(index, 1);
    }
  }
};

const setBitSpawnEnabled = (enabled: boolean) => {
  bitSpawnEnabled = enabled;
};

const disposePlayerHitEffects = () => {
  resetHitSequenceState(playerHitSequence);
};

const disposeExecutionHitEffects = () => {
  for (const entry of executionHitEntries) {
    resetHitSequenceState(entry.sequence);
  }
  executionHitEntries = [];
};

const buildCharacterTargetKey = (
  target: { kind: "player" } | { kind: "npc"; npcIndex: number }
) => (target.kind === "player" ? "player" : `npc_${target.npcIndex}`);

const buildExecutionTargetKey = (target: ExecutionTarget) =>
  buildCharacterTargetKey(target);

const setExecutionTargetState = (
  target: ExecutionTarget,
  state: CharacterState
) => {
  if (target.kind === "player") {
    playerState = state;
    return;
  }
  const npc = npcs[target.npcIndex];
  npc.state = state;
  npc.sprite.cellIndex = getPortraitCellIndex(state);
};

const getExecutionTargetStateEntry = (key: string) =>
  executionTargetStates.find((state) => state.key === key) ?? null;

const getExecutionTargetEyePosition = (
  target: ExecutionTarget,
  out: Vector3
) => {
  const eyeHeight = getEyeHeight();
  if (target.kind === "player") {
    out.set(playerEyeBasePosition.x, eyeHeight, playerEyeBasePosition.z);
    return;
  }
  const sprite = npcs[target.npcIndex].sprite;
  out.set(sprite.position.x, eyeHeight, sprite.position.z);
};

const getExecutionTargetCenterPosition = (
  target: ExecutionTarget,
  out: Vector3
) => {
  if (target.kind === "player") {
    out.set(
      playerEyeBasePosition.x,
      playerAvatar.height * 0.5,
      playerEyeBasePosition.z
    );
    return;
  }
  out.copyFrom(npcs[target.npcIndex].sprite.position);
};

const isExecutionTargetInHitSequence = (key: string) =>
  executionHitEntries.some(
    (entry) => !entry.completed && buildExecutionTargetKey(entry.target) === key
  );

const getRandomExecutionBeamDelay = () =>
  publicExecutionBeamDelayMin +
  Math.random() * (publicExecutionBeamDelayMax - publicExecutionBeamDelayMin);

const assignExecutionShooters = <T,>(shooters: T[], targetCount: number) => {
  const assignments = Array.from({ length: targetCount }, () => [] as T[]);
  for (let index = 0; index < shooters.length; index += 1) {
    assignments[index % targetCount].push(shooters[index]);
  }
  return assignments;
};

const shuffleExecutionShooters = <T,>(shooters: T[]) => {
  const shuffled = [...shooters];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current!;
  }
  return shuffled;
};

const buildPlayerHitSequenceConfig = (
  effectName: string,
  hitDuration: number,
  fadeDuration: number
): HitSequenceConfig => {
  const effectDiameter = calculateHitEffectDiameter(
    playerAvatar.width,
    playerAvatar.height
  );
  return {
    hitDuration,
    fadeDuration,
    flickerInterval: playerHitFlickerInterval,
    colorA: playerHitColorA,
    colorB: playerHitColorB,
    effectAlpha: playerHitEffectAlpha,
    effectDiameter,
    lightIntensity: playerHitLightIntensity,
    lightRange: effectDiameter * 1.2,
    fadeOrbConfig: playerHitFadeOrbConfig,
    effectName,
    sideOrientation: Mesh.DOUBLESIDE,
    backFaceCulling: false
  };
};

const buildNpcHitSequenceConfig = (
  effectName: string,
  hitDuration: number,
  fadeDuration: number,
  sprite: Sprite
): HitSequenceConfig => {
  const effectDiameter = calculateHitEffectDiameter(
    sprite.width,
    sprite.height
  );
  return {
    hitDuration,
    fadeDuration,
    flickerInterval: npcHitFlickerInterval,
    colorA: npcHitColorA,
    colorB: npcHitColorB,
    effectAlpha: npcHitEffectAlpha,
    effectDiameter,
    lightIntensity: npcHitLightIntensity,
    lightRange: effectDiameter * 1.2,
    fadeOrbConfig: npcHitFadeOrbConfig,
    effectName
  };
};

const beginExecutionHit = (target: ExecutionTarget, hitScale: number) => {
  const key = buildExecutionTargetKey(target);
  if (isExecutionTargetInHitSequence(key)) {
    return;
  }
  const sequence = createHitSequenceState();
  getExecutionTargetCenterPosition(target, executionCollisionPosition);
  if (target.kind === "player") {
    startHitSequence(
      sequence,
      scene,
      executionCollisionPosition,
      buildPlayerHitSequenceConfig(
        `executionHitEffect_${key}`,
        playerHitDuration * hitScale,
        playerHitFadeDuration * hitScale
      )
    );
    playerState = "hit-a";
  } else {
    const sprite = npcs[target.npcIndex].sprite;
    startHitSequence(
      sequence,
      scene,
      executionCollisionPosition,
      buildNpcHitSequenceConfig(
        `executionHitEffect_${key}`,
        npcHitDuration * hitScale,
        npcHitFadeDuration * hitScale,
        sprite
      )
    );
    const npc = npcs[target.npcIndex];
    npc.state = "hit-a";
    npc.sprite.cellIndex = getPortraitCellIndex("hit-a");
  }
  executionHitEntries.push({
    target,
    sequence,
    completed: false
  });
};

const finalizeExecutionAfterAllTargetsCompleted = () => {
  if (executionScenario?.variant === "npc-survivor-player-block") {
    playerState = "brainwash-complete-haigure-formation";
    updateHudPhaseOverride({ crosshairVisible: false });
  }
  executionResolved = true;
};

const updateExecutionHitEntries = (
  delta: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  for (const entry of executionHitEntries) {
    const key = buildExecutionTargetKey(entry.target);
    getExecutionTargetCenterPosition(entry.target, executionCollisionPosition);
    if (entry.target.kind === "player") {
      updateHitSequence(
        entry.sequence,
        delta,
        executionCollisionPosition,
        buildPlayerHitSequenceConfig(
          `executionHitEffect_${key}`,
          playerHitDuration,
          playerHitFadeDuration
        ),
        (isColorA) => {
          playerState = isColorA ? "hit-a" : "hit-b";
        },
        () => {
          playerState = "hit-a";
        },
        () => {
          playerState = "brainwash-complete-haigure-formation";
          const targetState = getExecutionTargetStateEntry(key);
          if (targetState) {
            targetState.completed = true;
          }
          entry.completed = true;
        },
        shouldProcessOrb
      );
      continue;
    }

    const npc = npcs[entry.target.npcIndex];
    updateHitSequence(
      entry.sequence,
      delta,
      executionCollisionPosition,
      buildNpcHitSequenceConfig(
        `executionHitEffect_${key}`,
        npcHitDuration,
        npcHitFadeDuration,
        npc.sprite
      ),
      (isColorA) => {
        npc.state = isColorA ? "hit-a" : "hit-b";
        npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
      },
      () => {
        npc.state = "hit-a";
        npc.sprite.cellIndex = getPortraitCellIndex("hit-a");
      },
      () => {
        npc.state = "brainwash-complete-haigure-formation";
        npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
        const targetState = getExecutionTargetStateEntry(key);
        if (targetState) {
          targetState.completed = true;
        }
        entry.completed = true;
      },
      shouldProcessOrb
    );
  }
  executionHitEntries = executionHitEntries.filter((entry) => !entry.completed);
  if (
    !executionResolved &&
    executionTargetStates.length > 0 &&
    executionTargetStates.every((state) => state.completed)
  ) {
    finalizeExecutionAfterAllTargetsCompleted();
  }
};

const resetExecutionState = () => {
  disposeExecutionHitEffects();
  publicExecutionTriggerKey = null;
  publicExecutionTriggerTimer = 0;
  executionScenario = null;
  executionWaitForFade = false;
  executionShooterTargetKeys.clear();
  executionTargetStates = [];
  executionSimultaneousPattern = false;
  executionResolved = false;
  executionAllowPlayerMove = false;
  executionNpcShooterIndices = [];
  executionNpcVoiceStateOverrides.clear();
};

const isExecutionAutomaticVolley = (scenario: PublicExecutionScenario) =>
  scenario.variant !== "npc-survivor-player-block";

const isExecutionBitVolley = (scenario: PublicExecutionScenario) =>
  isExecutionAutomaticVolley(scenario) && !scenario.usesNpcVolley;

const isExecutionNpcVolley = (scenario: PublicExecutionScenario) =>
  isExecutionAutomaticVolley(scenario) && scenario.usesNpcVolley;

const getExecutionTriggerKey = (scenario: PublicExecutionScenario) =>
  `${scenario.variant}|${[...scenario.survivorTargets]
    .map((target) => {
      const key = buildExecutionTargetKey(target);
      return `${key}:${scenario.blockKindsByTargetKey[key]}`;
    })
    .sort()
    .join(",")}`;

const keepExecutionTargetEvadeUntilHit = () => {
  if (executionResolved) {
    return;
  }
  for (const targetState of executionTargetStates) {
    if (targetState.completed || isExecutionTargetInHitSequence(targetState.key)) {
      continue;
    }
    setExecutionTargetState(targetState.target, "evade");
  }
};

const applyExecutionNpcShooterPresentation = () => {
  for (const index of executionNpcShooterIndices) {
    const npc = npcs[index];
    npc.state = "brainwash-complete-gun";
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
    executionNpcVoiceStateOverrides.set(
      npc.sprite.name,
      "brainwash-complete-haigure-formation"
    );
  }
};

const findPublicExecutionCandidate = () => {
  const aliveNpcTargets: ExecutionTarget[] = [];
  for (let index = 0; index < npcs.length; index += 1) {
    if (isAliveState(npcs[index].state)) {
      aliveNpcTargets.push({ kind: "npc", npcIndex: index });
    }
  }
  const survivorTargets =
    isAliveState(playerState)
      ? [
          ...aliveNpcTargets.slice(
            0,
            Math.floor((aliveNpcTargets.length + 1) * 0.5)
          ),
          { kind: "player" } as const,
          ...aliveNpcTargets.slice(
            Math.floor((aliveNpcTargets.length + 1) * 0.5)
          )
        ]
      : aliveNpcTargets;

  if (
    survivorTargets.length <= 0 ||
    survivorTargets.length > publicExecutionMaxSurvivors
  ) {
    return null;
  }

  const blockKindsByTargetKey: Record<string, ExecutionBlockKind> = {};
  let hasPlayerBlockedSurvivor = false;
  for (const target of survivorTargets) {
    const key = buildExecutionTargetKey(target);
    if (target.kind === "player") {
      let blocked = false;
      for (const npc of npcs) {
        if (
          npc.state === "brainwash-complete-no-gun" &&
          npc.blockTargetId === "player"
        ) {
          blocked = true;
          blockKindsByTargetKey[key] = "npc";
          break;
        }
      }
      if (!blocked) {
        return null;
      }
      continue;
    }

    const survivorNpc = npcs[target.npcIndex];
    if (survivorNpc.blockedByPlayer) {
      blockKindsByTargetKey[key] = "player";
      hasPlayerBlockedSurvivor = true;
      continue;
    }

    let blocked = false;
    for (const npc of npcs) {
      if (
        npc.state === "brainwash-complete-no-gun" &&
        npc.blockTargetId === key
      ) {
        blocked = true;
        blockKindsByTargetKey[key] = "npc";
        break;
      }
    }
    if (!blocked) {
      return null;
    }
  }

  let variant: PublicExecutionScenario["variant"];
  let playerExecutionRole: PublicExecutionScenario["playerExecutionRole"];
  if (survivorTargets.some((target) => target.kind === "player")) {
    variant = "player-survivor";
    playerExecutionRole = "target";
  } else if (hasPlayerBlockedSurvivor) {
    variant = "npc-survivor-player-block";
    playerExecutionRole = "shooter";
  } else {
    variant = "npc-survivor-npc-block";
    playerExecutionRole = "observer";
  }

  return {
    variant,
    survivorTargets,
    blockKindsByTargetKey,
    playerExecutionRole,
    usesNpcVolley:
      variant !== "npc-survivor-player-block" &&
      bits.length < publicExecutionMaxSurvivors
  };
};

const buildExecutionTargetStates = (scenario: PublicExecutionScenario) => {
  executionShooterTargetKeys.clear();
  executionTargetStates = scenario.survivorTargets.map((target) => ({
    target,
    key: buildExecutionTargetKey(target),
    completed: false,
    firePending: false,
    fireCountdown: 0,
    fireEffectActive: false,
    fireEffectTimer: 0,
    beamTargetPosition: new Vector3(0, 0, 0),
    shooterBitIndices: [],
    shooterNpcIndices: []
  }));
  executionNpcShooterIndices = [];
  executionNpcVoiceStateOverrides.clear();
  executionSimultaneousPattern =
    isExecutionAutomaticVolley(scenario) &&
    Math.random() < publicExecutionSimultaneousChance;

  if (executionTargetStates.length <= 0) {
    return;
  }

  if (isExecutionBitVolley(scenario)) {
    const shooterBitIndices = bits.map((_, index) => index);
    const assignments = assignExecutionShooters(
      shooterBitIndices,
      executionTargetStates.length
    );
    for (let index = 0; index < executionTargetStates.length; index += 1) {
      const targetState = executionTargetStates[index];
      targetState.shooterBitIndices = assignments[index];
      for (const bitIndex of assignments[index]) {
        executionShooterTargetKeys.set(bits[bitIndex].id, targetState.key);
      }
    }
    return;
  }

  if (!isExecutionNpcVolley(scenario)) {
    return;
  }

  const survivorNpcIndexSet = new Set<number>();
  for (const target of scenario.survivorTargets) {
    if (target.kind === "npc") {
      survivorNpcIndexSet.add(target.npcIndex);
    }
  }
  const shooterNpcIndices = npcs
    .map((_, index) => index)
    .filter((index) => !survivorNpcIndexSet.has(index));
  const assignments = assignExecutionShooters(
    shuffleExecutionShooters(shooterNpcIndices),
    executionTargetStates.length
  );
  for (let index = 0; index < executionTargetStates.length; index += 1) {
    const targetState = executionTargetStates[index];
    targetState.shooterNpcIndices = assignments[index];
    for (const npcIndex of assignments[index]) {
      const shooterId = npcs[npcIndex].sprite.name;
      executionShooterTargetKeys.set(shooterId, targetState.key);
      if (!executionNpcVoiceStateOverrides.has(shooterId)) {
        executionNpcShooterIndices.push(npcIndex);
        executionNpcVoiceStateOverrides.set(
          shooterId,
          "brainwash-complete-haigure-formation"
        );
      }
    }
  }
};

const buildExecutionPlayerBeamHitCandidates = (): BeamHitCandidate[] =>
  executionTargetStates.flatMap((targetState) => {
    if (
      targetState.completed ||
      targetState.target.kind !== "npc" ||
      isExecutionTargetInHitSequence(targetState.key)
    ) {
      return [];
    }
    const npc = npcs[targetState.target.npcIndex];
    return [
      {
        targetId: targetState.key,
        targetPosition: npc.sprite.position,
        targetRadii: getSpriteBeamHitRadii(npc.sprite),
        canHit: () =>
          !targetState.completed && !isExecutionTargetInHitSequence(targetState.key),
        onHit: (beam, impactPosition) => {
          beginBeamRetract(beam, impactPosition);
          beginExecutionHit(targetState.target, 1);
        }
      }
    ];
  });

const enterPublicExecution = (scenario: PublicExecutionScenario) => {
  executionScenario = scenario;
  executionWaitForFade = true;
  executionResolved = false;
  executionAllowPlayerMove =
    scenario.variant === "npc-survivor-player-block" ||
    scenario.variant === "npc-survivor-npc-block";
  buildExecutionTargetStates(scenario);
  disposeExecutionHitEffects();
  if (!executionAllowPlayerMove) {
    playerAbility.resetInput();
    playerMotion.reset();
    camera.cameraDirection.set(0, 0, 0);
  }
  gameFlow.enterExecution(scenario);
  keepExecutionTargetEvadeUntilHit();
  if (isExecutionNpcVolley(scenario)) {
    applyExecutionNpcShooterPresentation();
  }
};

const startPublicExecutionTransition = (scenario: PublicExecutionScenario) => {
  publicExecutionTriggerKey = null;
  publicExecutionTriggerTimer = 0;
  gamePhase = "transition";
  setHudPhaseOverride(null);
  gameFlow.beginFadeOut(() => {
    removeCarpetFollowers();
    enterPublicExecution(scenario);
  });
};

const prepareExecutionCountdowns = () => {
  const sharedCountdown = executionSimultaneousPattern
    ? getRandomExecutionBeamDelay()
    : 0;
  for (const targetState of executionTargetStates) {
    if (targetState.completed) {
      continue;
    }
    targetState.firePending = true;
    targetState.fireCountdown = executionSimultaneousPattern
      ? sharedCountdown
      : getRandomExecutionBeamDelay();
    targetState.fireEffectActive = false;
    targetState.fireEffectTimer = 0;
  }
};

const startExecutionBitFireEffects = (targetState: ExecutionTargetState) => {
  for (const bitIndex of targetState.shooterBitIndices) {
    const bit = bits[bitIndex];
    bit.root.lookAt(targetState.beamTargetPosition);
    const muzzlePosition = bit.muzzle.getAbsolutePosition();
    const direction = targetState.beamTargetPosition.subtract(muzzlePosition);
    if (direction.lengthSquared() <= 0.0001) {
      continue;
    }
    bit.fireLockDirection.copyFrom(direction.normalize());
    startBitFireEffect(bit);
  }
};

const startExecutionNpcFireEffects = (targetState: ExecutionTargetState) => {
  for (const index of targetState.shooterNpcIndices) {
    const npc = npcs[index];
    npc.state = "brainwash-complete-gun";
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
  }
};

const startExecutionVolleyFireEffects = (targetState: ExecutionTargetState) => {
  if (executionScenario && isExecutionNpcVolley(executionScenario)) {
    startExecutionNpcFireEffects(targetState);
    return;
  }
  startExecutionBitFireEffects(targetState);
};

const updateExecutionBitFireEffects = (delta: number) => {
  for (const bit of bits) {
    updateBitFireEffect(bit, delta);
  }
};

const spawnExecutionNpcBeamVolley = (targetState: ExecutionTargetState) => {
  const eyeHeight = getEyeHeight();
  for (const index of targetState.shooterNpcIndices) {
    const npc = npcs[index];
    npc.state = "brainwash-complete-gun";
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
    const muzzlePosition = new Vector3(
      npc.sprite.position.x,
      eyeHeight,
      npc.sprite.position.z
    );
    const direction = targetState.beamTargetPosition.subtract(muzzlePosition);
    if (direction.lengthSquared() <= 0.0001) {
      continue;
    }
    const normalized = direction.normalize();
    beams.push(
      createBeam(
        scene,
        muzzlePosition.clone(),
        normalized,
        beamMaterial,
        npc.sprite.name
      )
    );
    const firePosition = muzzlePosition.clone();
    sfxDirector.playBeamNonTarget(() => firePosition);
  }
};

const spawnExecutionBitBeamVolley = (targetState: ExecutionTargetState) => {
  const targetingPlayer = targetState.target.kind === "player";
  for (const bitIndex of targetState.shooterBitIndices) {
    const bit = bits[bitIndex];
    const muzzlePosition = bit.muzzle.getAbsolutePosition();
    const direction = targetState.beamTargetPosition.subtract(muzzlePosition);
    if (direction.lengthSquared() <= 0.0001) {
      continue;
    }
    const normalized = direction.normalize();
    beams.push(
      createBeam(
        scene,
        muzzlePosition.clone(),
        normalized,
        beamMaterial,
        bit.id
      )
    );
    bitSoundEvents.onBeamFire(bit, targetingPlayer);
    stopBitFireEffect(bit);
  }
};

const spawnExecutionBeamVolley = (targetState: ExecutionTargetState) => {
  if (executionScenario && isExecutionNpcVolley(executionScenario)) {
    spawnExecutionNpcBeamVolley(targetState);
    return;
  }
  spawnExecutionBitBeamVolley(targetState);
};

const handleExecutionBeamCollisions = (scenario: PublicExecutionScenario) => {
  if (!isExecutionAutomaticVolley(scenario)) {
    return;
  }
  for (const beam of beams) {
    if (!beam.active || !beam.sourceId) {
      continue;
    }
    const targetKey = executionShooterTargetKeys.get(beam.sourceId);
    if (!targetKey) {
      continue;
    }
    const targetState = getExecutionTargetStateEntry(targetKey);
    if (!targetState || targetState.completed) {
      continue;
    }
    // 自動斉射ビームは割り当て済み target だけを判定し、spectator の
    // プレイヤーは遮蔽物として扱わない。
    const targetRadii =
      targetState.target.kind === "player"
        ? getSpriteBeamHitRadii(playerAvatar)
        : getSpriteBeamHitRadii(npcs[targetState.target.npcIndex].sprite);
    getExecutionTargetEyePosition(targetState.target, executionCollisionPosition);
    if (
      !isBeamHittingTargetExcludingSource(
        beam,
        beam.sourceId,
        targetKey,
        executionCollisionPosition,
        targetRadii
      )
    ) {
      continue;
    }
    const impactPosition = getBeamImpactPosition(beam);
    beginBeamRetract(beam, impactPosition);
    beginExecutionHit(targetState.target, 1);
  }
};

const updatePlayerMovement = (
  delta: number,
  allowMove: boolean,
  moveSpeed: number
) => {
  const movementYaw = computeCharacterFacingYawFromViewMatrix(
    camera.getViewMatrix(),
    currentCharacterFacingYaw
  );
  currentCharacterFacingYaw = movementYaw;
  const requestedDisplacement = playerMotion.update(
    playerAbility.getMoveAxes(),
    movementYaw,
    delta,
    allowMove,
    moveSpeed
  );
  playerMoveStartPosition.copyFrom(playerCollisionMesh.position);
  if (requestedDisplacement.lengthSquared() > 0.0000000001) {
    playerCollisionMesh.moveWithCollisions(requestedDisplacement);
  }
  playerMoveActualDisplacement.copyFrom(playerCollisionMesh.position);
  playerMoveActualDisplacement.subtractInPlace(playerMoveStartPosition);
  playerMotion.commit(playerMoveActualDisplacement);
};

const getBeamImpactPosition = (beam: Beam) =>
  beam.tip.position.add(
    Vector3.Normalize(beam.velocity).scale(beam.tipRadius)
  );

const updateExecutionScene = (
  delta: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  updateBeams(
    layout,
    beams,
    bounds,
    delta,
    beamTrails,
    beamImpactOrbs,
    shouldProcessOrb
  );
  gameFlow.updateExecution();
  updateExecutionHitEntries(delta, shouldProcessOrb);

  const scenario = executionScenario!;
  keepExecutionTargetEvadeUntilHit();
  if (isExecutionBitVolley(scenario)) {
    updateExecutionBitFireEffects(delta);
  }
  for (const targetState of executionTargetStates) {
    if (!targetState.fireEffectActive) {
      continue;
    }
    targetState.fireEffectTimer = Math.max(
      0,
      targetState.fireEffectTimer - delta
    );
    if (targetState.fireEffectTimer <= 0) {
      targetState.fireEffectActive = false;
      spawnExecutionBeamVolley(targetState);
    }
  }
  handleExecutionBeamCollisions(scenario);
  if (executionAllowPlayerMove) {
    updatePlayerMovement(delta, true, playerMoveSpeed);
  }
  if (executionResolved) {
    return;
  }

  if (executionWaitForFade && !gameFlow.isFading()) {
    executionWaitForFade = false;
    if (isExecutionAutomaticVolley(scenario)) {
      prepareExecutionCountdowns();
    }
  }

  for (const targetState of executionTargetStates) {
    if (
      !targetState.firePending ||
      targetState.completed ||
      targetState.fireEffectActive
    ) {
      continue;
    }
    targetState.fireCountdown -= delta;
    if (targetState.fireCountdown > 0) {
      continue;
    }
    targetState.firePending = false;
    getExecutionTargetEyePosition(
      targetState.target,
      targetState.beamTargetPosition
    );
    if (isExecutionNpcVolley(scenario)) {
      spawnExecutionBeamVolley(targetState);
      continue;
    }
    targetState.fireEffectActive = true;
    targetState.fireEffectTimer = bitFireEffectDuration;
    startExecutionVolleyFireEffects(targetState);
  }

  if (scenario.variant === "npc-survivor-player-block") {
    resolvePlayerBeamHits(beams, buildExecutionPlayerBeamHitCandidates());
    return;
  }
};

const buildRouletteTargetFromSlot = (slotIndex: number): RouletteHitTarget =>
  slotIndex === 0 ? { kind: "player" } : { kind: "npc", npcIndex: slotIndex - 1 };

const buildRouletteTargetKey = (target: RouletteHitTarget) =>
  target.kind === "player" ? "player" : `npc_${target.npcIndex}`;

const getRouletteTargetState = (target: RouletteHitTarget) =>
  target.kind === "player" ? playerState : npcs[target.npcIndex].state;

const setRouletteTargetState = (
  target: RouletteHitTarget,
  state: CharacterState
) => {
  if (target.kind === "player") {
    playerState = state;
    return;
  }
  npcs[target.npcIndex].state = state;
};

const getRouletteTargetEyePosition = (
  target: RouletteHitTarget
) => {
  const eyeHeight = getEyeHeight();
  if (target.kind === "player") {
    return new Vector3(roulettePlayerPosition.x, eyeHeight, roulettePlayerPosition.z);
  }
  const sprite = npcs[target.npcIndex].sprite;
  return new Vector3(sprite.position.x, eyeHeight, sprite.position.z);
};

const getRouletteTargetCenterPosition = (
  target: RouletteHitTarget
) => {
  if (target.kind === "player") {
    return new Vector3(
      roulettePlayerPosition.x,
      playerAvatar.height * 0.5,
      roulettePlayerPosition.z
    );
  }
  return npcs[target.npcIndex].sprite.position.clone();
};

const clearRouletteHitEntries = () => {
  for (const entry of rouletteHitEntries) {
    resetHitSequenceState(entry.sequence);
  }
  rouletteHitEntries = [];
};

const clearRouletteBeamTargets = () => {
  rouletteBeamTargets.clear();
};

const captureRouletteCharacterSnapshot = () => ({
  playerState,
  npcStates: npcs.map((npc) => npc.state)
});

const applyRouletteCharacterSnapshot = (snapshot: {
  playerState: CharacterState;
  npcStates: CharacterState[];
}) => {
  playerState = snapshot.playerState;
  playerHitById = null;
  playerHitTime = 0;
  playerNoGunTouchBrainwashTimer = 0;
  brainwashChoiceStarted = false;
  brainwashChoiceUnlocked = false;
  for (let index = 0; index < npcs.length; index += 1) {
    const npc = npcs[index];
    npc.state = snapshot.npcStates[index];
    npc.noGunTouchBrainwashTimer = 0;
    npc.sprite.color.copyFrom(npcSpriteColorNormal);
  }
};

const isRouletteComplete = () => {
  if (!isBrainwashState(playerState)) {
    return false;
  }
  for (const npc of npcs) {
    if (!isBrainwashState(npc.state)) {
      return false;
    }
  }
  return true;
};

const updateRouletteBitTransforms = (
  baseSlots: number[],
  offsetAngle: number,
  elapsed: number
) => {
  const slotCount = npcs.length + 1;
  if (slotCount <= 0 || bits.length === 0) {
    return;
  }
  const angleStep = (Math.PI * 2) / slotCount;
  const eyeHeight = getEyeHeight();
  for (let index = 0; index < bits.length; index += 1) {
    const bit = bits[index];
    const baseSlot = baseSlots[index];
    const angle = angleStep * baseSlot + offsetAngle;
    const bob =
      Math.sin(elapsed * rouletteBitBobSpeed + bit.floatOffset) *
      rouletteBitBobHeight;
    bit.root.position.set(
      rouletteCenter.x + Math.cos(angle) * rouletteBitRadius,
      eyeHeight + bob,
      rouletteCenter.z + Math.sin(angle) * rouletteBitRadius
    );
    bit.baseHeight = eyeHeight;
    bit.root.lookAt(rouletteCenter);
  }
};

const setRouletteSpinLoopVolumeRatio = (ratio: number) => {
  if (!rouletteSpinSeHandle?.isActive()) {
    return;
  }
  rouletteSpinSeHandle.setBaseVolume(
    rouletteSpinLoopOptions.volume * ratio
  );
};

const setupRouletteParticipants = () => {
  const slotCount = npcs.length + 1;
  const areaCenterX =
    -halfWidth + layout.cellSize * (assemblyArea.startCol + assemblyArea.width / 2);
  const areaCenterZ =
    -halfDepth + layout.cellSize * (assemblyArea.startRow + assemblyArea.height / 2);
  rouletteCenter.set(areaCenterX, playerCenterHeight, areaCenterZ);
  const maxRadius = Math.max(
    layout.cellSize * 1.6,
    Math.min(
      ((assemblyArea.width - 1) * layout.cellSize) / 2,
      ((assemblyArea.height - 1) * layout.cellSize) / 2
    )
  );
  rouletteCharacterRadius = Math.max(
    layout.cellSize * 1.1,
    Math.min(maxRadius * 0.65, layout.cellSize * 2.8)
  );
  rouletteBitRadius = Math.min(
    maxRadius,
    rouletteCharacterRadius + layout.cellSize * 1.4
  );
  if (rouletteBitRadius <= rouletteCharacterRadius) {
    rouletteBitRadius = rouletteCharacterRadius + layout.cellSize * 0.5;
  }

  const angleStep = (Math.PI * 2) / slotCount;
  const playerAngle = 0;
  const eyeHeight = getEyeHeight();
  roulettePlayerPosition.set(
    rouletteCenter.x + Math.cos(playerAngle) * rouletteCharacterRadius,
    eyeHeight,
    rouletteCenter.z + Math.sin(playerAngle) * rouletteCharacterRadius
  );
  syncPlayerCollisionMeshFromEyePosition(roulettePlayerPosition);
  playerMotion.reset();
  capturePlayerEyeBasePosition();
  syncCameraBasePositionFromPlayer();
  camera.setTarget(new Vector3(rouletteCenter.x, eyeHeight, rouletteCenter.z));
  camera.cameraDirection.set(0, 0, 0);
  playerAbility.resetInput();
  playerAvatar.isVisible = false;
  playerAvatar.position.set(
    roulettePlayerPosition.x,
    playerAvatar.height * 0.5,
    roulettePlayerPosition.z
  );
  playerState = "evade";
  playerHitById = null;
  playerNoGunTouchBrainwashTimer = 0;
  brainwashChoiceStarted = false;
  brainwashChoiceUnlocked = false;

  for (let index = 0; index < npcs.length; index += 1) {
    const slot = index + 1;
    const angle = angleStep * slot;
    const npc = npcs[index];
    npc.state = "evade";
    npc.sprite.position.set(
      rouletteCenter.x + Math.cos(angle) * rouletteCharacterRadius,
      npc.sprite.position.y,
      rouletteCenter.z + Math.sin(angle) * rouletteCharacterRadius
    );
    alignSpriteToGround(npc.sprite);
  }
  return slotCount;
};

const spawnRouletteBits = (baseSlots: number[]) => {
  const slotCount = npcs.length + 1;
  const eyeHeight = getEyeHeight();
  for (const slot of baseSlots) {
    const angle = (Math.PI * 2 * slot) / slotCount;
    const position = new Vector3(
      rouletteCenter.x + Math.cos(angle) * rouletteBitRadius,
      eyeHeight,
      rouletteCenter.z + Math.sin(angle) * rouletteBitRadius
    );
    const direction = rouletteCenter.subtract(position);
    const bit = createBitAt(
      scene,
      layout,
      bitMaterials,
      bitIndex,
      position,
      direction
    );
    bitIndex += 1;
    bit.mode = "hold";
    bits.push(bit);
  }
};

const startRouletteBitsDespawn = () => {
  if (bits.length <= 0) {
    return false;
  }
  for (const bit of bits) {
    startBitDespawn(bit);
  }
  return true;
};

const beginRouletteHit = (target: RouletteHitTarget) => {
  const sequence = createHitSequenceState();
  const targetCenter = getRouletteTargetCenterPosition(target);
  if (target.kind === "player" && playerHitTime <= 0) {
    playerHitTime = rouletteSystem.getStats().elapsed;
  }
  if (target.kind === "player") {
    startHitSequence(
      sequence,
      scene,
      targetCenter,
      buildPlayerHitSequenceConfig(
        `rouletteHitEffect_${buildRouletteTargetKey(target)}`,
        playerHitDuration,
        playerHitFadeDuration
      )
    );
  } else {
    const sprite = npcs[target.npcIndex].sprite;
    startHitSequence(
      sequence,
      scene,
      targetCenter,
      buildNpcHitSequenceConfig(
        `rouletteHitEffect_${buildRouletteTargetKey(target)}`,
        npcHitDuration,
        npcHitFadeDuration,
        sprite
      )
    );
  }
  setRouletteTargetState(target, "hit-a");
  rouletteHitEntries.push({
    target,
    sequence,
    completed: false
  });
  const hitPosition = targetCenter.clone();
  sfxDirector.playHit(() => hitPosition);
};

const startRouletteFireEffects = (entries: RouletteBitFireEntry[]) => {
  const entryByBitIndex = new Map(entries.map((entry) => [entry.bitIndex, entry]));
  for (let index = 0; index < bits.length; index += 1) {
    const bit = bits[index];
    const entry = entryByBitIndex.get(index);
    if (!entry) {
      stopBitFireEffect(bit);
      continue;
    }
    const targetPosition = getRouletteTargetEyePosition(entry.target);
    bit.root.lookAt(targetPosition);
    const muzzlePosition = bit.muzzle.getAbsolutePosition();
    const direction = targetPosition.subtract(muzzlePosition);
    if (direction.lengthSquared() > 0.0001) {
      bit.fireLockDirection.copyFrom(direction.normalize());
    }
    startBitFireEffect(bit);
  }
};

const fireRouletteBits = (entries: RouletteBitFireEntry[]) => {
  const startedHitTargets = new Set<string>();
  let playerHit = false;
  for (const entry of entries) {
    const bit = bits[entry.bitIndex];
    const targetPosition = getRouletteTargetEyePosition(entry.target);
    const muzzlePosition = bit.muzzle.getAbsolutePosition();
    const direction = targetPosition.subtract(muzzlePosition);
    if (direction.lengthSquared() <= 0.0001) {
      stopBitFireEffect(bit);
      continue;
    }
    const beam = createBeam(
      scene,
      muzzlePosition.clone(),
      direction.normalize(),
      beamMaterial,
      bit.id
    );
    beams.push(beam);
    rouletteBeamTargets.set(beam, entry.target);
    bitSoundEvents.onBeamFire(bit, entry.target.kind === "player");
    stopBitFireEffect(bit);
    const targetKey = buildRouletteTargetKey(entry.target);
    if (!startedHitTargets.has(targetKey)) {
      startedHitTargets.add(targetKey);
      beginRouletteHit(entry.target);
      if (entry.target.kind === "player") {
        playerHit = true;
      }
    }
  }
  return {
    hitCount: startedHitTargets.size,
    playerHit
  };
};

const updateRouletteBeamImpacts = () => {
  for (const beam of beams) {
    const target = rouletteBeamTargets.get(beam);
    if (!target) {
      continue;
    }
    if (!beam.active) {
      rouletteBeamTargets.delete(beam);
      continue;
    }
    const targetPosition = getRouletteTargetCenterPosition(target);
    const targetRadii =
      target.kind === "player"
        ? getSpriteBeamHitRadii(playerAvatar)
        : getSpriteBeamHitRadii(npcs[target.npcIndex].sprite);
    if (!isBeamHittingTarget(beam, targetPosition, targetRadii)) {
      continue;
    }
    const impactPosition = getBeamImpactPosition(beam);
    beginBeamRetract(beam, impactPosition);
    rouletteBeamTargets.delete(beam);
  }
};

const updateRouletteHitEntries = (
  delta: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  for (const entry of rouletteHitEntries) {
    const targetCenter = getRouletteTargetCenterPosition(entry.target);
    if (entry.target.kind === "player") {
      updateHitSequence(
        entry.sequence,
        delta,
        targetCenter,
        buildPlayerHitSequenceConfig(
          `rouletteHitEffect_${buildRouletteTargetKey(entry.target)}`,
          playerHitDuration,
          playerHitFadeDuration
        ),
        (isColorA) => {
          playerState = isColorA ? "hit-a" : "hit-b";
        },
        () => {
          playerState = "hit-a";
        },
        () => {
          playerState = "brainwash-complete-haigure";
          entry.completed = true;
        },
        shouldProcessOrb
      );
      continue;
    }
    const npc = npcs[entry.target.npcIndex];
    updateHitSequence(
      entry.sequence,
      delta,
      targetCenter,
      buildNpcHitSequenceConfig(
        `rouletteHitEffect_${buildRouletteTargetKey(entry.target)}`,
        npcHitDuration,
        npcHitFadeDuration,
        npc.sprite
      ),
      (isColorA) => {
        npc.state = isColorA ? "hit-a" : "hit-b";
      },
      () => {
        npc.state = "hit-a";
      },
      () => {
        npc.state = "brainwash-complete-haigure";
        entry.completed = true;
      },
      shouldProcessOrb
    );
  }
  rouletteHitEntries = rouletteHitEntries.filter((entry) => !entry.completed);
  return rouletteHitEntries.length > 0;
};

rouletteSystem = createRouletteSystem({
  random: Math.random,
  fireTimeFromSpinStart: rouletteFireTimeFromSpinStart,
  bitFireEffectDuration,
  postHitWaitDuration: roulettePostHitWaitDuration,
  bitMinTurns: rouletteBitMinTurns,
  bitMaxTurns: rouletteBitMaxTurns,
  clearHitEntries: clearRouletteHitEntries,
  clearBeamTargets: clearRouletteBeamTargets,
  startSpinLoop: startRouletteSpinLoop,
  stopSpinLoop: stopRouletteSpinLoop,
  setSpinLoopVolumeRatio: setRouletteSpinLoopVolumeRatio,
  prepareParticipants: setupRouletteParticipants,
  spawnBits: spawnRouletteBits,
  startBitsDespawn: startRouletteBitsDespawn,
  areBitsDespawning: () => bits.some((bit) => bit.despawnTimer > 0),
  disposeAllBits,
  areBitSpawnsDone: () => bits.every((bit) => bit.spawnPhase === "done"),
  beginFireEffects: startRouletteFireEffects,
  fireBits: fireRouletteBits,
  updateHitEntries: updateRouletteHitEntries,
  buildTargetFromSlot: buildRouletteTargetFromSlot,
  isTargetBrainwashed: (target) => isBrainwashState(getRouletteTargetState(target)),
  isComplete: isRouletteComplete,
  updateBitTransforms: updateRouletteBitTransforms,
  captureCharacterSnapshot: captureRouletteCharacterSnapshot,
  applyCharacterSnapshot: applyRouletteCharacterSnapshot,
  beginUndoTransition: (apply) => {
    gamePhase = "transition";
    setHudPhaseOverride(null);
    gameFlow.beginFadeOut(() => {
      apply();
      gamePhase = "roulette";
    });
  },
  prepareUndoState: () => {
    clearBeams();
    disposeAllBits();
  }
});

const startRouletteMode = () => {
  rouletteSystem.start(true);
  setHudPhaseOverride(null);
};

const undoRouletteRound = () => {
  if (gamePhase !== "roulette") {
    return;
  }
  if (gameFlow.isFading()) {
    return;
  }
  rouletteSystem.undo();
};

const updateRouletteScene = (
  delta: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  const eyeHeight = getEyeHeight();
  syncPlayerCollisionMeshFromEyePosition(roulettePlayerPosition);
  capturePlayerEyeBasePosition();
  syncCameraBasePositionFromPlayer();
  camera.cameraDirection.set(0, 0, 0);
  updateBeams(
    layout,
    beams,
    bounds,
    delta,
    beamTrails,
    beamImpactOrbs,
    shouldProcessOrb
  );
  for (const bit of bits) {
    if (bit.despawnTimer > 0) {
      updateBitDespawn(bit, delta);
      continue;
    }
    if (bit.spawnPhase !== "done") {
      updateBitSpawnEffect(bit, delta);
    }
    if (bit.fireEffectTimer > 0) {
      updateBitFireEffect(bit, delta);
    }
  }
  updateRouletteBeamImpacts();
  rouletteSystem.update(delta, shouldProcessOrb);
};

const createGameFlowInstance = () =>
  createGameFlow({
    layout,
    assemblyArea,
    camera,
    bits,
    npcs,
    playerAvatar,
    playerCenterHeight,
    getEyeHeight,
    hud,
    getGamePhase: () => gamePhase,
    setGamePhase: (phase) => {
      gamePhase = phase;
    },
    setPlayerState: (state) => {
      playerState = state;
    },
    clearBeams,
    stopAlertLoop,
    setBitSpawnEnabled,
    disposePlayerHitEffects,
    syncPlayerEyePosition: syncPlayerCollisionMeshFromEyePosition,
    setHudPhaseOverride
  });
let gameFlow = createGameFlowInstance();
const rebuildGameFlow = () => {
  gameFlow = createGameFlowInstance();
};
let assemblyControlReleaseRequiresFreshMovePress = false;
const enterAssemblyPhase = (mode: AssemblyMode) => {
  assemblyControlReleaseRequiresFreshMovePress = playerAbility.hasMoveInput();
  gameFlow.enterAssembly(mode);
};

hud.setTitleVisible(true);
setHudPhaseOverride(null);
gameFlow.resetFade();

const isInterruptibleBit = (bit: Bit) => {
  if (bit.spawnPhase !== "done") {
    return false;
  }
  if (bit.despawnTimer > 0) {
    return false;
  }
  if (isAlertBitMode(bit.mode) || bit.mode === "attack-carpet-bomb") {
    return false;
  }
  if (bit.mode === "hold") {
    return false;
  }
  if (bit.carpetLeaderId && bit.carpetLeaderId !== bit.id) {
    return false;
  }
  return true;
};

const applyAlertRequests = (
  requests: AlertRequest[],
  targets: { id: string; position: Vector3 }[],
  bits: Bit[]
): ExternalAlert | null => {
  for (const request of requests) {
    const target = targets.find(
      (candidate) => candidate.id === request.targetId
    )!;
    const candidates: { distanceSq: number; bit: Bit }[] = [];
    for (const bit of bits) {
      if (bit.id === request.blockerId) {
        continue;
      }
      if (!isInterruptibleBit(bit)) {
        continue;
      }
      const distanceSq = Vector3.DistanceSquared(
        bit.root.position,
        target.position
      );
      candidates.push({ distanceSq, bit });
    }
    candidates.sort((a, b) => a.distanceSq - b.distanceSq);
    const selected = candidates.slice(0, 4);
    const receiverIds = selected.map((candidate) => candidate.bit.id);
    if (receiverIds.length > 0) {
      return {
        leaderId: request.blockerId,
        targetId: request.blockerId,
        receiverIds
      };
    }
    return null;
  }
  return null;
};

const drawMinimap = () => {
  if (gamePhase !== "playing" && gamePhase !== "roulette") {
    return;
  }
  const rouletteMode = gamePhase === "roulette";
  const getNpcById = (npcId: string) => {
    if (!npcId.startsWith("npc_")) {
      return null;
    }
    const index = Number(npcId.slice(4));
    if (!Number.isInteger(index) || index < 0 || index >= npcs.length) {
      return null;
    }
    return npcs[index];
  };
  const pruneTrackedNpcIds = () => {
    for (const npcId of alarmTriggeredNpcIds) {
      const npc = getNpcById(npcId);
      if (!npc || !isAliveState(npc.state)) {
        alarmTriggeredNpcIds.delete(npcId);
      }
    }
    for (const npcId of bitAlertTargetedNpcIds) {
      const npc = getNpcById(npcId);
      if (!npc || !isAliveState(npc.state)) {
        bitAlertTargetedNpcIds.delete(npcId);
      }
    }
  };
  const collectTrackedNpcPositions = () => {
    const tracked = new Set<string>([
      ...alarmTriggeredNpcIds,
      ...bitAlertTargetedNpcIds
    ]);
    const positions: Vector3[] = [];
    for (const npcId of tracked) {
      const npc = getNpcById(npcId);
      if (!npc || !isAliveState(npc.state)) {
        continue;
      }
      positions.push(npc.sprite.position);
    }
    return positions;
  };
  pruneTrackedNpcIds();
  const trackedNpcPositions = isBrainwashState(playerState)
    ? collectTrackedNpcPositions()
    : [];
  let aliveCount = isAliveState(playerState) ? 1 : 0;
  for (const npc of npcs) {
    if (isAliveState(npc.state)) {
      aliveCount += 1;
    }
  }

  const canMove =
    !rouletteMode &&
    (isAliveState(playerState) ||
      playerState === "brainwash-complete-gun" ||
      playerState === "brainwash-complete-no-gun");
  const trapBeamCount = isTrapStageSelected() ? trapSystem.getBeamCount() : null;
  const trapSurviveCount =
    isTrapStageSelected() && brainwashChoiceStarted
      ? trapSurviveCountAtBrainwash ?? trapBeamCount
      : null;
  const rouletteStats = rouletteMode ? rouletteSystem.getStats() : null;
  const rouletteRoundCountValue = rouletteStats ? rouletteStats.roundCount : null;
  const rouletteSurviveCountValue =
    rouletteStats && isBrainwashState(playerState)
      ? rouletteStats.surviveCount
      : null;
  const showSurviveTime =
    brainwashChoiceStarted ||
    (rouletteMode && isBrainwashState(playerState));
  const surviveTime = showSurviveTime ? playerHitTime : null;
  const displayElapsedTime = rouletteStats ? rouletteStats.elapsed : elapsedTime;
  hud.drawMinimap({
    cameraPosition: playerEyeBasePosition,
    cameraForward: camera.getDirection(new Vector3(0, 0, 1)),
    cameraFov: camera.fov,
    layout,
    minimapCellSize,
    halfWidth,
    halfDepth,
    elapsedTime: displayElapsedTime,
    surviveTime,
    trapBeamCount,
    trapSurviveCount,
    rouletteRoundCount: rouletteRoundCountValue,
    rouletteSurviveCount: rouletteSurviveCountValue,
    aliveCount,
    trackedNpcPositions
  });
};

const buildPlayingHelpPanelText = () => {
  const canMove = canPlayerMove(playerState);
  if (brainwashChoiceStarted) {
    const promptLines: string[] = ["操作説明"];
    if (canMove) {
      promptLines.push("WASD: 移動", "Shift: ダッシュ");
    }
    if (brainwashChoiceUnlocked) {
      promptLines.push(
        "G: 銃ありで移動",
        "N: 銃なしで移動",
        "H: ハイグレポーズ"
      );
    }
    if (playerState === "brainwash-complete-gun") {
      promptLines.push("左クリック: 発射");
    }
    promptLines.push("R: リトライ", "Enter: エピローグへ");
    return promptLines.join("\n");
  }
  if (canMove) {
    return "操作説明\nWASD: 移動\nShift: ダッシュ";
  }
  return null;
};

const getBaseHudPhaseState = (): HudPhaseState => {
  if (gamePhase === "playing") {
    return {
      hudVisible: true,
      helpPanelText: buildPlayingHelpPanelText(),
      crosshairVisible: playerState === "brainwash-complete-gun"
    };
  }
  if (gamePhase === "roulette") {
    return {
      hudVisible: true,
      helpPanelText: "操作説明\nR: 1回分やりなおす\nEnter: タイトルへ",
      crosshairVisible: false
    };
  }
  return {
    hudVisible: false,
    helpPanelText: null,
    crosshairVisible: false
  };
};

const syncHudForPhase = () => {
  const hudState = hudPhaseOverride ?? getBaseHudPhaseState();
  const staminaState = playerAbility.getStaminaHudState(gamePhase, playerState);
  hud.setHudVisible(hudState.hudVisible);
  hud.setHelpPanelText(hudState.helpPanelText);
  hud.setCrosshairVisible(hudState.crosshairVisible);
  if (!showStaminaGauge) {
    hud.setStaminaGaugeVisible(false);
    return;
  }
  hud.setStaminaGaugeVisible(staminaState.visible);
  if (!staminaState.visible) {
    return;
  }
  hud.setStaminaGauge(
    staminaState.current,
    staminaState.max,
    staminaState.brainwashed
  );
};

const createPlayerAbilitySnapshot = (): PlayerAbilityFrameSnapshot =>
  playerAbility.createFrameSnapshot({
    gamePhase,
    playerState,
    playerPosition: playerEyeBasePosition,
    camera,
    scene,
    layout,
    npcs
  });

scene.onBeforeRenderObservable.add(() => {
  if (gamePhase === "playing" || gamePhase === "roulette") {
    drawMinimap();
  }
  syncHudForPhase();
});

const enterPlayerPostHitBrainwashState = () => {
  playerState = runtimeBrainwashSettings.instantBrainwash
    ? "brainwash-complete-haigure"
    : "brainwash-in-progress";
  if (!brainwashChoiceStarted) {
    brainwashChoiceStarted = true;
    brainwashChoiceUnlocked = true;
  }
};

const startPlayerNoGunTouchBrainwash = () => {
  if (!isAliveState(playerState)) {
    return;
  }
  if (playerNoGunTouchBrainwashTimer > 0) {
    return;
  }
  resetHitSequenceState(playerHitSequence);
  playerState = "hit-a";
  playerNoGunTouchBrainwashTimer = noGunTouchBrainwashDuration;
  playerHitTime = elapsedTime;
  playerHitById = null;
};

const updatePlayerState = (
  delta: number,
  elapsed: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  const playerCenterY = playerAvatar.height * 0.5;
  const playerHitRadii = getSpriteBeamHitRadii(playerAvatar);
  playerHitCenterPosition.set(
    playerEyeBasePosition.x,
    playerCenterY,
    playerEyeBasePosition.z
  );
  const hitEffectRadius =
    calculateHitEffectDiameter(playerAvatar.width, playerAvatar.height) / 2;
  const hitEffectRadiusSq = hitEffectRadius * hitEffectRadius;

  if (playerNoGunTouchBrainwashTimer > 0) {
    playerNoGunTouchBrainwashTimer = Math.max(
      0,
      playerNoGunTouchBrainwashTimer - delta
    );
    if (playerNoGunTouchBrainwashTimer <= 0) {
      enterPlayerPostHitBrainwashState();
    }
  }

  if (isAliveState(playerState)) {
    for (const beam of beams) {
      if (!beam.active) {
        continue;
      }
      if (beam.sourceId === "player") {
        continue;
      }
      if (isBeamHittingTarget(beam, playerHitCenterPosition, playerHitRadii)) {
        const hitScale = isRedBitSource(beam.sourceId)
          ? redHitDurationScale
          : 1;
        playerHitImpactDirection.copyFrom(beam.velocity);
        playerHitImpactDirection.normalize();
        playerHitImpactDirection.scaleInPlace(beam.tipRadius);
        playerHitImpactPosition.copyFrom(beam.tip.position);
        playerHitImpactPosition.addInPlace(playerHitImpactDirection);
        beginBeamRetract(beam, playerHitImpactPosition);
        playerState = "hit-a";
        playerHitById = beam.sourceId;
        playerHitTime = elapsed;
        if (isTrapStageSelected() && trapSurviveCountAtBrainwash === null) {
          trapSurviveCountAtBrainwash = trapSystem.getBeamCount();
        }
        playerHitDurationCurrent = playerHitDuration * hitScale;
        playerHitFadeDurationCurrent = playerHitFadeDuration * hitScale;
        startHitSequence(
          playerHitSequence,
          scene,
          playerHitCenterPosition,
          buildPlayerHitSequenceConfig(
            "playerHitEffect",
            playerHitDurationCurrent,
            playerHitFadeDurationCurrent
          )
        );
        const hitPosition = playerHitCenterPosition.clone();
        sfxDirector.playHit(() => hitPosition);
        break;
      }
    }
  }

  if (playerHitSequence.phase !== "none") {
    updateHitSequence(
      playerHitSequence,
      delta,
      playerHitCenterPosition,
      buildPlayerHitSequenceConfig(
        "playerHitEffect",
        playerHitDurationCurrent,
        playerHitFadeDurationCurrent
      ),
      (isColorA) => {
        playerState = isColorA ? "hit-a" : "hit-b";
      },
      () => {
        playerState = "hit-a";
      },
      () => {
        enterPlayerPostHitBrainwashState();
      },
      shouldProcessOrb,
      elapsed
    );
  }

  const shouldFlickerNpcSprite =
    playerHitSequence.phase === "flicker";
  for (const npc of npcs) {
    if (npc.state === "hit-a" || npc.state === "hit-b") {
      continue;
    }
    const dx = npc.sprite.position.x - playerHitCenterPosition.x;
    const dy = npc.sprite.position.y - playerHitCenterPosition.y;
    const dz = npc.sprite.position.z - playerHitCenterPosition.z;
    const inside = dx * dx + dy * dy + dz * dz <= hitEffectRadiusSq;
    if (shouldFlickerNpcSprite && inside) {
      const isColorA =
        Math.floor(elapsed / playerHitFlickerInterval) % 2 === 0;
      npc.sprite.color.copyFrom(
        isColorA ? playerHitColorA4 : playerHitColorB4
      );
    } else {
      npc.sprite.color.copyFrom(npcSpriteColorNormal);
    }
  }

};

const updateCharacterSpriteCells = () => {
  playerAvatar.cellIndex = getPortraitCellIndex(playerState);
  if (playerNoGunTouchBrainwashTimer > 0) {
    const progress =
      1 - playerNoGunTouchBrainwashTimer / noGunTouchBrainwashDuration;
    playerAvatar.cellIndex = getNoGunTouchBrainwashCellIndex(progress);
  }
  redrawFirstPersonBodyTexture(playerAvatar.cellIndex);
  for (const npc of npcs) {
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
    if (npc.noGunTouchBrainwashTimer > 0) {
      const progress =
        1 - npc.noGunTouchBrainwashTimer / noGunTouchBrainwashDuration;
      npc.sprite.cellIndex = getNoGunTouchBrainwashCellIndex(progress);
    }
  }
};

const syncBitGroundShadowHandles = () => {
  activeBitGroundShadowIds.clear();
  for (const bit of bits) {
    if (!bit.root.isEnabled()) {
      continue;
    }
    activeBitGroundShadowIds.add(bit.id);
    if (!bitGroundShadows.has(bit.id)) {
      bitGroundShadows.set(
        bit.id,
        {
          shape: groundShadowManager.createGroundShadow(
            `${bit.id}_shadow`,
            "bit"
          ),
          circle: groundShadowManager.createGroundShadow(
            `${bit.id}_shadow_circle`,
            "bit-circle"
          )
        }
      );
    }
  }
  for (const [bitId, groundShadow] of bitGroundShadows) {
    if (activeBitGroundShadowIds.has(bitId)) {
      continue;
    }
    groundShadowManager.disposeGroundShadow(groundShadow.shape);
    groundShadowManager.disposeGroundShadow(groundShadow.circle);
    bitGroundShadows.delete(bitId);
  }
};

const syncGroundShadows = () => {
  const showGroundShadows = titlePlayerSettings.showGroundShadows;
  characterScene.syncCharacterGroundShadows({
    playerAvatar,
    npcs,
    showGroundShadows,
    yaw: currentCharacterFacingYaw,
    visibility: characterGroundShadowVisibility,
    worldLayerMask,
    widthRatio: characterGroundShadowWidthRatio,
    depthRatio: characterGroundShadowDepthRatio
  });
  syncBitGroundShadowHandles();
  for (const bit of bits) {
    if (!bit.root.isEnabled()) {
      continue;
    }
    const groundShadow = bitGroundShadows.get(bit.id)!;
    const bodyVisibility = bit.body.visibility;
    const heightScale =
      1 +
      Math.min(
        bitGroundShadowMaxScaleBonus,
        bit.root.position.y * bitGroundShadowScalePerHeight
      );
    const forward = bit.root.getDirection(new Vector3(0, 0, 1));
    const horizontalForwardLengthSq =
      forward.x * forward.x + forward.z * forward.z;
    const yaw =
      horizontalForwardLengthSq > bitGroundShadowMinForwardLengthSq
        ? Math.atan2(forward.x, forward.z)
        : 0;
    const baseWidth =
      Math.max(bitShadowFootprint.bodyWidth, bitShadowFootprint.muzzleDiameter) *
      bitGroundShadowWidthScale;
    const baseDepth =
      (bitShadowFootprint.bodyLength * 0.5 +
        bitShadowFootprint.muzzleOffset +
        bitShadowFootprint.muzzleDiameter * 0.5) *
      bitGroundShadowDepthScale;
    const spawnVisibility =
      bit.spawnPhase === "fade-in" ? bit.spawnEffectMaterial!.alpha : bodyVisibility;
    const visibility =
      Math.max(
        bitGroundShadowMinVisibility,
        bitGroundShadowBaseVisibility -
          bit.root.position.y * bitGroundShadowVisibilityPerHeight
      ) * spawnVisibility;
    const carpetBombCircleBlend =
      bit.mode === "attack-carpet-bomb"
        ? Math.max(
            bitGroundShadowMinMorphBlend,
            Math.min(bitGroundShadowMaxMorphBlend, -forward.y)
          )
        : 0;
    const circleBlend =
      bit.spawnPhase !== "done" ? 1 : carpetBombCircleBlend;
    const circleDiameter = Math.sqrt(baseWidth * baseDepth);
    const blendedWidth =
      (baseWidth + (circleDiameter - baseWidth) * circleBlend) * heightScale;
    const blendedDepth =
      (baseDepth + (circleDiameter - baseDepth) * circleBlend) * heightScale;
    const visible =
      showGroundShadows && (bit.body.isVisible || bit.spawnPhase !== "done");
    groundShadowManager.syncGroundShadow(groundShadow.shape, {
      positionX: bit.root.position.x,
      positionZ: bit.root.position.z,
      width: blendedWidth,
      depth: blendedDepth,
      yaw,
      visibility: visibility * (1 - circleBlend),
      visible,
      layerMask: worldLayerMask
    });
    groundShadowManager.syncGroundShadow(groundShadow.circle, {
      positionX: bit.root.position.x,
      positionZ: bit.root.position.z,
      width: circleDiameter * heightScale,
      depth: circleDiameter * heightScale,
      yaw,
      visibility: visibility * circleBlend,
      visible,
      layerMask: worldLayerMask
    });
  }
};

const syncPlayerPresentation = () => {
  const useFirstPersonPreviewSprite =
    firstPersonPreviewUsePlayerSprite &&
    shouldShowFirstPersonBodyForPhase(gamePhase);
  const firstPersonBodyVisibility = computeFirstPersonBodyVisibility();
  playerAvatarRenderPositionApplied = false;
  if (shouldSyncPlayerAvatarToCamera(gamePhase)) {
    playerAvatar.isVisible = true;
    if (useFirstPersonPreviewSprite) {
      syncFirstPersonPreviewPlayerPosition(false);
    } else {
      playerAvatar.position.set(
        playerEyeBasePosition.x,
        playerAvatar.height * 0.5,
        playerEyeBasePosition.z
      );
      alignSpriteToGround(playerAvatar);
    }
  } else if (useFirstPersonPreviewSprite) {
    playerAvatar.isVisible = true;
    syncFirstPersonPreviewPlayerPosition(true);
  } else if (gamePhase === "transition") {
    playerAvatar.isVisible = false;
  }

  const verticalAngleEnabled =
    titlePlayerSettings.enableCharacterSpriteVerticalAngle;
  const useVerticalAnglePreviewForMainCamera =
    useFirstPersonPreviewSprite &&
    !verticalAngleEnabled &&
    firstPersonBodyVisibility > 0;
  const playerVisibleLayerMask = useFirstPersonPreviewSprite
    ? worldLayerMask
    : shouldHidePlayerAvatarFromMainCamera(gamePhase)
      ? reflectionOnlyLayerMask
      : worldLayerMask;
  const playerBillboardEnabled =
    verticalAngleEnabled || useVerticalAnglePreviewForMainCamera;
  const playerLayerMask = verticalAngleEnabled
    ? playerVisibleLayerMask
    : useVerticalAnglePreviewForMainCamera
      ? mainCameraOnlyLayerMask
      : playerVisibleLayerMask;
  const playerSpriteLayerMask =
    !verticalAngleEnabled && useFirstPersonPreviewSprite
      ? reflectionOnlyLayerMask
      : playerVisibleLayerMask;
  characterScene.syncBillboards({
    playerAvatar,
    npcs,
    playerBillboardEnabled,
    playerLayerMask,
    playerSpriteLayerMask,
    worldLayerMask,
    enabled: verticalAngleEnabled,
    yaw: currentCharacterFacingYaw
  });
  syncFirstPersonBodyVisibility();
};

const resetGame = async (
  session?: TitleLoadingSession,
  assignments?: CharacterAssignments
) => {
  alarmTriggeredNpcIds.clear();
  bitAlertTargetedNpcIds.clear();
  characterScene.stopAllVoices();
  trapSystem.syncStageContext({ layout, bounds });
  trapSystem.resetRuntimeState();
  dynamicBeamSystem.syncStageContext({
    layout,
    zoneMap: stageZoneMap
  });
  dynamicBeamSystem.resetRuntimeState();
  alarmSystem.syncStageContext({
    layout,
    floorCells
  });
  alarmSystem.resetRuntimeState();
  resetExecutionState();
  rouletteSystem.reset();
  playerState = runtimeDefaultStartSettings.startPlayerAsBrainwashCompleteGun
    ? "brainwash-complete-gun"
    : "normal";
  playerHitById = null;
  playerHitTime = 0;
  playerAbility.resetState();
  playerMotion.reset();
  trapSurviveCountAtBrainwash = null;
  playerHitDurationCurrent = playerHitDuration;
  playerHitFadeDurationCurrent = playerHitFadeDuration;
  playerNoGunTouchBrainwashTimer = 0;
  brainwashChoiceStarted =
    runtimeDefaultStartSettings.startPlayerAsBrainwashCompleteGun;
  brainwashChoiceUnlocked =
    runtimeDefaultStartSettings.startPlayerAsBrainwashCompleteGun;
  allDownTime = null;
  bitSpawnEnabled = true;
  stopAlertLoop();
  disposePlayerHitEffects();

  clearBeams();

  disposeAllBits();
  bitIndex = 0;
  if (runtimeMaxBitCount > 0) {
    bits.push(createRandomBit(bitIndex));
    bitIndex += 1;
  }
  bitSpawnTimer = runtimeBitSpawnInterval;
  updateSpawnPoint();

  for (const npc of npcs) {
    npc.sprite.dispose();
    if (npc.hitEffect) {
      npc.hitEffect.dispose();
    }
    if (npc.hitLight) {
      npc.hitLight.dispose();
    }
    for (const orb of npc.fadeOrbs) {
      orb.mesh.dispose();
    }
  }
  await rebuildCharacters(session, assignments);

  alertSignal.leaderId = null;
  alertSignal.targetId = null;
  alertSignal.requiredCount = 0;
  alertSignal.receiverIds = [];
  alertSignal.gatheredIds = new Set();
  elapsedTime = 0;
  applyCameraSpawnTransform();
  playerAvatar.isVisible = false;
  playerAvatar.position = new Vector3(
    spawnPosition.x,
    playerAvatar.height * 0.5,
    spawnPosition.z
  );
  rebuildGameFlow();
  rebindVoiceActors();
};

const startGame = async () => {
  if (titleTransitionInProgress) {
    return;
  }
  if (gamePhase === "title" && stageSelectionInProgress) {
    return;
  }
  titleTransitionInProgress = true;
  try {
    titleSettingsSidebar.setWarningEnabled(false);
    applyTitleSettingsSidebarSettings(titleSettingsSidebar.getSettings());
    titleAlarmTrapEnabled = titleStageSelectControl.getAlarmTrapEnabled();
    const preparedState = await ensureTitleStartPreparationReady();
    if (!preparedState?.runtimeSettings) {
      return;
    }
    applyRuntimeSettings(preparedState.runtimeSettings);
    rebindVoiceActors();
    const rouletteSelected = preparedState.runtimeSettings.rouletteSelected;
    const bgmUrl = selectBgmUrl(stageJson ? stageJson.meta.name : null);
    if (bgmUrl) {
      audioManager.startBgm(bgmUrl);
    }
    if (rouletteSelected) {
      startRouletteMode();
      gamePhase = "roulette";
    } else {
      gamePhase = "playing";
    }
    hud.setTitleVisible(false);
    titleVolumePanel.setVisible(false);
    titleStageSelectControl.setVisible(false);
    titleSettingsSidebar.setVisible(false);
    setHudPhaseOverride(null);
    gameFlow.resetFade();
    titleStartPreparation.invalidateReady();
    canvas.requestPointerLock();
  } finally {
    titleTransitionInProgress = false;
  }
};

const prepareTitleReturnPresentation = () => {
  characterScene.stopAllVoices();
  stopAlertLoop();
  stopRouletteSpinLoop();
  audioManager.stopBgm();
  resetExecutionState();
  rouletteSystem.reset();
  disposePlayerHitEffects();
  clearBeams();
  disposeAllBits();
  playerAbility.resetInput();
  playerMotion.reset();
  camera.cameraDirection.set(0, 0, 0);
  applyCameraSpawnTransform();
  playerAvatar.isVisible = false;
  for (const npc of npcs) {
    npc.sprite.isVisible = false;
  }
};

const returnToTitle = async () => {
  if (titleTransitionInProgress) {
    return;
  }
  titleTransitionInProgress = true;
  try {
    document.exitPointerLock();
    titleStartPreparation.invalidateReady();
    prepareTitleReturnPresentation();
    gamePhase = "title";
    titleSettingsSidebar.setWarningEnabled(true);
    hud.setTitleVisible(true);
    titleVolumePanel.setVisible(true);
    titleStageSelectControl.setVisible(true);
    titleSettingsSidebar.setVisible(true);
    setHudPhaseOverride(null);
    gameFlow.resetFade();
    syncTitleMessage();
    await ensureTitleStartPreparationReady();
  } finally {
    titleTransitionInProgress = false;
  }
};

const updateVoices = (delta: number) => {
  characterScene.updateVoices({
    delta,
    allowIdle: gamePhase === "playing",
    playerPosition: () => playerEyeBasePosition,
    getPlayerState: () => playerState,
    npcs,
    getNpcState: (npc) =>
      executionNpcVoiceStateOverrides.get(npc.sprite.name) ?? npc.state,
    audioManager,
    baseOptions: voiceBaseOptions,
    loopOptions: voiceLoopOptions
  });
};

setupInputHandlers({
  canvas,
  camera,
  getGamePhase: () => gamePhase,
  getPlayerState: () => playerState,
  isBrainwashState,
  getBrainwashChoiceStarted: () => brainwashChoiceStarted,
  getBrainwashChoiceUnlocked: () => brainwashChoiceUnlocked,
  isUiPointerTarget: isTitleUiTarget,
  onPointerLockRequest: () => {
    canvas.requestPointerLock();
  },
  onStartGame: () => {
    void startGame();
  },
  onEnterEpilogue: () => {
    gamePhase = "transition";
    setHudPhaseOverride(null);
    gameFlow.beginFadeOut(() => {
      removeCarpetFollowers();
      enterAssemblyPhase("instant");
    });
  },
  onReturnToTitle: () => {
    void returnToTitle();
  },
  onUndoRoulette: () => {
    undoRouletteRound();
  },
  onReplayExecution: () => {
    gamePhase = "transition";
    setHudPhaseOverride(null);
    gameFlow.beginFadeOut(() => {
      enterPublicExecution(executionScenario!);
    });
  },
  onSelectBrainwashOption: (state) => {
    playerState = state;
  },
  onMoveKey: (key, pressed) => {
    playerAbility.setMoveKey(key, pressed);
    if (!canReleaseAssemblyControl(gamePhase)) {
      return;
    }
    if (!pressed) {
      if (
        assemblyControlReleaseRequiresFreshMovePress &&
        !playerAbility.hasMoveInput()
      ) {
        assemblyControlReleaseRequiresFreshMovePress = false;
      }
      return;
    }
    if (assemblyControlReleaseRequiresFreshMovePress) {
      return;
    }
    gameFlow.releaseAssemblyPlayerControl();
  },
  onDashKey: (pressed) => {
    playerAbility.setDashPressed(pressed);
  },
  onPlayerFire: (origin, direction) => {
    beams.push(createBeam(scene, origin, direction, beamMaterial, "player"));
    const firePosition = origin.clone();
    sfxDirector.playBeamNonTarget(() => firePosition);
  }
});

engine.runRenderLoop(() => {
  restorePlayerEyeBasePosition();
  restorePlayerAvatarWorldPosition();
  const delta = engine.getDeltaTime() / 1000;
  capturePlayerEyeBasePosition();
  syncCameraBasePositionFromPlayer();
  trapSystem.update(delta, gamePhase);
  dynamicBeamSystem.update(delta, gamePhase);
  if (gamePhase === "playing") {
    elapsedTime += delta;

    const shouldProcessOrb = buildOrbCullingCheck();
    updateBeams(
      layout,
      beams,
      bounds,
      delta,
      beamTrails,
      beamImpactOrbs,
      shouldProcessOrb
    );
    trapSystem.updateNpcFreezeControl(delta, gamePhase);
    updatePlayerState(delta, elapsedTime, shouldProcessOrb);
    const playerAbilitySnapshot = createPlayerAbilitySnapshot();
    const playerThreatenedNpcIds =
      playerAbilitySnapshot.threatenedNpcIds;
    const npcBlockers = playerAbilitySnapshot.npcBlockers;
    const npcEvadeThreats = ensureVectorListBufferSize(
      npcEvadeThreatsBuffer,
      npcs.length
    );
    for (const bit of bits) {
      if (!bit.targetId) {
        continue;
      }
      if (!bit.targetId.startsWith("npc_")) {
        continue;
      }
      const targetIndex = Number(bit.targetId.slice(4));
      npcEvadeThreats[targetIndex]!.push(bit.root.position);
    }
    for (const threatenedNpcId of playerThreatenedNpcIds) {
      const targetIndex = Number(threatenedNpcId.slice(4));
      npcEvadeThreats[targetIndex]!.push(playerEyeBasePosition);
    }
    const npcTargets = syncNpcTargetBuffer({
      buffer: npcTargetBuffer,
      playerPosition: playerEyeBasePosition,
      playerState,
      playerHitById,
      npcs
    });
    alarmSystem.update(delta, gamePhase, npcTargets);
    activeDynamicBeamCells.clear();
    if (isDynamicStageSelected()) {
      for (const beam of beams) {
        if (!beam.active || beam.sourceId !== dynamicBeamSourceId) {
          continue;
        }
        const beamCell = worldToCell(layout, beam.startPosition);
        activeDynamicBeamCells.add(
          buildGridCellKey(layout.columns, beamCell.row, beamCell.col)
        );
      }
    }
    const npcUpdate = updateNpcs(
      layout,
      floorCells,
      npcs,
      beams,
      delta,
      elapsedTime,
      {
        targets: npcTargets,
        callbacks: {
          onNpcHit: (position) => {
            sfxDirector.playHit(() => position);
          },
          spawnNpcBeam: (position, direction, sourceId) => {
            beams.push(
              createBeam(scene, position, direction, beamMaterial, sourceId)
            );
            sfxDirector.playBeamNonTarget(() => position);
          }
        },
        effects: {
          isRedSource: isRedBitSource,
          impactOrbs: beamImpactOrbs,
          cameraPosition: playerEyeBasePosition,
          shouldProcessOrb
        },
        movement: {
          blockers: npcBlockers,
          evadeThreats: npcEvadeThreats,
          playerThreatenedNpcIds,
          shouldFreezeAliveMovement: trapSystem.shouldFreezeNpcMovement,
          isAliveNpcForbiddenCell: (cell) =>
            activeDynamicBeamCells.has(
              buildGridCellKey(layout.columns, cell.row, cell.col)
            )
        },
        alarms: {
          getAlarmTargetStack: (npcId) => alarmSystem.getAlarmTargetStack(npcId)
        },
        settings: {
          brainwashOnNoGunTouch: runtimeBrainwashSettings.brainwashOnNoGunTouch
        }
      }
    );
    if (npcUpdate.playerNoGunTouchBrainwashRequested) {
      startPlayerNoGunTouchBrainwash();
    }
    const playerBlockedByNpc =
      npcUpdate.playerBlocked && isAliveState(playerState);
    const canMove = canPlayerMove(playerState);
    const allowMove = canMove && !playerBlockedByNpc;
    const movingForStamina = allowMove && playerAbility.hasMoveInput();
    updatePlayerMovement(
      delta,
      allowMove,
      playerAbilitySnapshot.moveSpeed
    );
    capturePlayerEyeBasePosition();
    syncCameraBasePositionFromPlayer();
    playerAbility.updateStamina(delta, movingForStamina, gamePhase, playerState);

    const executionCandidate = findPublicExecutionCandidate();
    if (executionCandidate) {
      const candidateKey = getExecutionTriggerKey(executionCandidate);
      if (publicExecutionTriggerKey !== candidateKey) {
        publicExecutionTriggerKey = candidateKey;
        publicExecutionTriggerTimer = 0;
      }
      publicExecutionTriggerTimer += delta;
      if (publicExecutionTriggerTimer >= publicExecutionTransitionDelay) {
        startPublicExecutionTransition(executionCandidate);
      }
    } else {
      publicExecutionTriggerKey = null;
      publicExecutionTriggerTimer = 0;
    }

    let npcAlive = false;
    let noGunTouchBrainwashActive = playerNoGunTouchBrainwashTimer > 0;
    for (const npc of npcs) {
      if (isAliveState(npc.state)) {
        npcAlive = true;
      }
      if (npc.noGunTouchBrainwashTimer > 0) {
        noGunTouchBrainwashActive = true;
      }
      if (npcAlive && noGunTouchBrainwashActive) {
        break;
      }
    }

    if (
      gamePhase === "playing" &&
      isBrainwashState(playerState) &&
      !npcAlive &&
      !noGunTouchBrainwashActive
    ) {
      if (allDownTime === null) {
        allDownTime = elapsedTime;
      }
      if (elapsedTime - allDownTime >= allDownTransitionDelay) {
        for (const npc of npcs) {
          npc.sprite.color.copyFrom(npcSpriteColorNormal);
        }
        if (skipAssembly) {
          gamePhase = "transition";
          setHudPhaseOverride(null);
          gameFlow.beginFadeOut(() => {
            removeCarpetFollowers();
            enterAssemblyPhase("instant");
          });
        } else {
          removeCarpetFollowers();
          enterAssemblyPhase("move");
        }
      }
    } else {
      allDownTime = null;
    }

    if (gamePhase === "playing") {
      if (bitSpawnEnabled) {
        bitSpawnTimer -= delta;
        if (bitSpawnTimer <= 0 && countNonFollowerBits() < runtimeMaxBitCount) {
          bits.push(
            createRandomBit(bitIndex)
          );
          bitIndex += 1;
          bitSpawnTimer = runtimeBitSpawnInterval;
        }
      }

      syncNpcTargetBufferStates({
        buffer: npcTargets,
        playerState,
        playerHitById,
        npcs
      });
      const spawnAlertBit = (position: Vector3, direction: Vector3) => {
        if (countNonFollowerBits() >= runtimeMaxBitCount) {
          return null;
        }
        const bit = createSpawnedBitAt(bitIndex, position, direction);
        bitIndex += 1;
        return bit;
      };
      const spawnCarpetBit = (position: Vector3, direction: Vector3) => {
        const bit = createCarpetFollowerBitAt(bitIndex, position, direction);
        bitIndex += 1;
        return bit;
      };
      const externalAlert =
        alertSignal.leaderId === null
          ? applyAlertRequests(npcUpdate.alertRequests, npcTargets, bits)
          : null;
      updateBits(
        layout,
        bits,
        delta,
        elapsedTime,
        npcTargets,
        bounds,
        alertSignal,
        externalAlert,
        spawnAlertBit,
        spawnCarpetBit,
        (pos, dir, sourceId) => {
          beams.push(createBeam(scene, pos, dir, beamMaterial, sourceId));
        },
        bitSoundEvents
      );
      if (alertSignal.targetId?.startsWith("npc_")) {
        bitAlertTargetedNpcIds.add(alertSignal.targetId);
      }
      const alertLeader = bits.find(
        (bit) => bit.mode === "alert-send"
      ) ?? null;
      if (!alertLeader) {
        stopAlertLoop();
      } else if (
        alertSeLeaderId !== alertLeader.id ||
        !alertSeHandle?.isActive()
      ) {
        startAlertLoop(alertLeader);
      }

      const targetedIds = new Set<string>();
      for (const bit of bits) {
        if (bit.targetId) {
          targetedIds.add(bit.targetId);
        }
      }
      for (const threatenedNpcId of playerThreatenedNpcIds) {
        targetedIds.add(threatenedNpcId);
      }
      if (isAliveState(playerState)) {
        playerState =
          targetedIds.has("player") || npcUpdate.targetedIds.has("player")
            ? "evade"
            : "normal";
      }
      for (let index = 0; index < npcs.length; index += 1) {
        const npc = npcs[index];
        if (!isAliveState(npc.state)) {
          continue;
        }
        const npcId = `npc_${index}`;
        npc.state =
          targetedIds.has(npcId) || npcUpdate.targetedIds.has(npcId)
            ? "evade"
            : "normal";
      }
    }
  }
  runRuntimeFramePhases(gamePhase, {
    onPlaying: () => {},
    onRoulette: () => {
      const shouldProcessOrb = buildOrbCullingCheck();
      updateRouletteScene(delta, shouldProcessOrb);
    },
    onNonPlaying: () => {
      trapSystem.updateNpcFreezeControl(delta, gamePhase);
    },
    onExecution: () => {
      const shouldProcessOrb = buildOrbCullingCheck();
      updateExecutionScene(delta, shouldProcessOrb);
      capturePlayerEyeBasePosition();
      syncCameraBasePositionFromPlayer();
    },
    onAssembly: () => {
      gameFlow.updateAssembly(delta);
      capturePlayerEyeBasePosition();
    },
    onAssemblyFree: () => {
      updatePlayerMovement(delta, true, playerMoveSpeed);
      capturePlayerEyeBasePosition();
      syncCameraBasePositionFromPlayer();
    },
    onUsesPlayerEyeHeight: () => {
      capturePlayerEyeBasePosition();
      syncCameraBasePositionFromPlayer();
    }
  });
  updateCharacterSpriteCells();
  updateVoices(delta);
  audioManager.updateSpatial();
  applyRenderCameraPosition();
  syncCharacterFacingYaw();
  syncPlayerPresentation();
  syncGroundShadows();
  syncReflectionCamera();
  gameFlow.updateFade(delta);
  scene.render();
  restorePlayerEyeBasePosition();
  restorePlayerAvatarWorldPosition();
});

window.addEventListener("resize", () => {
  engine.resize();
});
