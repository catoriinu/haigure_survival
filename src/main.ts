import "./style.css";
import {
  Engine,
  Scene,
  FreeCamera,
  Frustum,
  Vector3,
  HemisphericLight,
  Color3,
  Color4,
  Sprite,
  SpriteManager,
  Mesh,
  MeshBuilder
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
  applyNpcDefaultHaigureState,
  pickRandomCell,
  setNpcBrainwashInProgressTransitionConfig,
  setNpcBrainwashCompleteTransitionConfig,
  spawnNpcs,
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
  createVoiceActor,
  stopVoiceActor,
  updateVoiceActor,
  buildVoiceProfiles,
  VoiceActor
} from "./audio/voice";
import { SfxDirector } from "./audio/sfxDirector";
import { createGameFlow, type GamePhase, type ExecutionConfig } from "./game/flow";
import { createDynamicBeamSystem } from "./game/dynamicBeam/system";
import { createTrapSystem } from "./game/trap/system";
import { createAlarmSystem } from "./game/alarm/system";
import { createRouletteSystem } from "./game/roulette/system";
import { RouletteBitFireEntry, RouletteHitTarget } from "./game/roulette/types";
import { buildStageContext, disposeStageParts } from "./world/stageContext";
import { createZoneMapFromStageJson } from "./world/stageJson";
import {
  LABYRINTH_DYNAMIC_STAGE_ID,
  TRAP_STAGE_ID
} from "./world/stageIds";
import {
  buildStageCatalog,
  loadStageJson,
  type StageSelection
} from "./world/stageSelection";
import { createHud } from "./ui/hud";
import { setupInputHandlers } from "./ui/input";
import { createVolumePanel, type VolumeLevels } from "./ui/volumePanel";
import {
  createBitSpawnPanel,
  type BitSpawnSettings
} from "./ui/bitSpawnPanel";
import {
  createDefaultSettingsPanel,
  type DefaultStartSettings
} from "./ui/defaultSettingsPanel";
import {
  createBrainwashSettingsPanel,
  type BrainwashSettings
} from "./ui/brainwashSettingsPanel";
import {
  buildDefaultPersistedTitleSettings,
  clearPersistedTitleSettings,
  loadPersistedTitleSettings,
  savePersistedTitleSettings,
  type TitleSettingsDefaults
} from "./ui/titleSettingsStorage";
import { createTrapRoomRecommendControl } from "./ui/trapRoomRecommendControl";
import { createStageSelectControl } from "./ui/stageSelectControl";
import {
  getTitleSettingsAvailability,
  isRouletteStageId,
  normalizeRuntimeSettingsForStage
} from "./ui/titleStageRules";
import {
  PLAYER_EYE_HEIGHT,
  PLAYER_SPRITE_CENTER_HEIGHT,
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH
} from "./game/characterSprites";
import {
  assignPortraitDirectories,
  configurePortraitAssets,
  calculatePortraitSpriteSize,
  getNoGunTouchBrainwashCellIndex,
  getPortraitCellIndex,
  getPortraitDirectories,
  loadPortraitSpriteSheet,
  type PortraitSpriteSheet
} from "./game/portraitSprites";
import {
  buildAssetUrl,
  loadBgmFileNames,
  loadGameConfig,
  loadSeFileNames,
  loadPortraitDirectories,
  loadVoiceManifest
} from "./runtimeAssets/loadConfig";

const canvas =
  document.getElementById("renderCanvas") as unknown as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const defaultClearColor = scene.clearColor.clone();

const playerWidth = PLAYER_SPRITE_WIDTH;
const playerHeight = PLAYER_SPRITE_HEIGHT;
const playerCenterHeight = PLAYER_SPRITE_CENTER_HEIGHT;
const eyeHeight = PLAYER_EYE_HEIGHT;
// ミニマップ座標表示ボックスの表示切替。true=表示、false=非表示（デフォルト）
const minimapReadoutVisible = false;
const portraitMaxWidthCells = 1;
const portraitMaxHeightCells = 2;
const gameConfig = await loadGameConfig();
const bgmFileNames = await loadBgmFileNames();
const seFileNames = await loadSeFileNames();
const portraitDirectoriesFromAssets = await loadPortraitDirectories();
const stageCatalog = buildStageCatalog(gameConfig);
const voiceManifest = await loadVoiceManifest(gameConfig);
const voiceProfiles = buildVoiceProfiles(voiceManifest);
configurePortraitAssets({
  directories: portraitDirectoriesFromAssets
});

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
const TITLE_SETTINGS_STORAGE_KEY = "haigure-survival.title-settings";
const TITLE_SETTINGS_STORAGE_VERSION = 1;
const defaultVolumeLevels: VolumeLevels = {
  bgm: 5,
  se: 5,
  voice: 5
};
const titleSettingsDefaults: TitleSettingsDefaults = {
  volumeLevels: defaultVolumeLevels,
  stageId: stageCatalog[0].id,
  alarmTrapEnabled: false,
  defaultStartSettings: defaultDefaultStartSettings,
  brainwashSettings: defaultBrainwashSettings,
  bitSpawnSettings: defaultBitSpawnSettings
};
const stageIds = new Set(stageCatalog.map((selection) => selection.id));
const persistedTitleSettings = loadPersistedTitleSettings(
  TITLE_SETTINGS_STORAGE_KEY,
  TITLE_SETTINGS_STORAGE_VERSION,
  titleSettingsDefaults,
  stageIds
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

const portraitDirectories = getPortraitDirectories();
const portraitSpriteSheets = new Map<string, PortraitSpriteSheet>();
const portraitSpriteSheetPromises = new Map<
  string,
  Promise<PortraitSpriteSheet>
>();
const portraitManagers = new Map<string, SpriteManager>();
const portraitManagerPromises = new Map<string, Promise<SpriteManager>>();
// プレイヤー1人 + NPC最大99人
const spriteManagerCapacity = 100;
const loadPortraitSpriteSheetOnce = (directory: string) => {
  const cachedPromise = portraitSpriteSheetPromises.get(directory);
  if (cachedPromise) {
    return cachedPromise;
  }
  const promise = loadPortraitSpriteSheet(directory).then((sheet) => {
    portraitSpriteSheets.set(directory, sheet);
    return sheet;
  });
  portraitSpriteSheetPromises.set(directory, promise);
  return promise;
};
const ensurePortraitManager = async (directory: string) => {
  const cachedManager = portraitManagers.get(directory);
  if (cachedManager) {
    return cachedManager;
  }
  const cachedPromise = portraitManagerPromises.get(directory);
  if (cachedPromise) {
    return cachedPromise;
  }
  const promise = (async () => {
    const sheet = await loadPortraitSpriteSheetOnce(directory);
    const manager = new SpriteManager(
      `portrait_${directory}`,
      sheet.url,
      spriteManagerCapacity,
      { width: sheet.cellWidth, height: sheet.cellHeight },
      scene
    );
    portraitManagers.set(directory, manager);
    return manager;
  })();
  portraitManagerPromises.set(directory, promise);
  try {
    return await promise;
  } finally {
    portraitManagerPromises.delete(directory);
  }
};
const ensurePortraitManagers = async (directories: string[]) => {
  const uniqueDirectories = Array.from(new Set(directories));
  await Promise.all(
    uniqueDirectories.map(async (directory) => {
      await ensurePortraitManager(directory);
    })
  );
};

const initialStageSelectionId = persistedTitleSettings
  ? persistedTitleSettings.stageId
  : stageCatalog[0].id;
let stageSelection = stageCatalog.find(
  (selection) => selection.id === initialStageSelectionId
)!;
let stageSelectionRequestId = 0;
let stageSelectionInProgress = false;
let titleTransitionInProgress = false;
let stageJson = await loadStageJson(stageSelection);
let stageZoneMap = stageJson ? createZoneMapFromStageJson(stageJson) : null;
const stageSelectionsForMenu: StageSelection[] = await Promise.all(
  stageCatalog.map(async (selection) => {
    const loadedStageJson =
      selection.id === stageSelection.id
        ? stageJson
        : await loadStageJson(selection);
    return {
      ...selection,
      label: loadedStageJson!.meta.description!
    };
  })
);
let stageContext = buildStageContext(scene, stageJson);
let layout = stageContext.layout;
let stageStyle = stageContext.style;
let stageParts = stageContext.parts;
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
  spawnPosition = cellToWorld(layout, spawnCell, eyeHeight);
  spawnForward = lookAtCenter
    ? buildSpawnForwardTowardCenter(spawnPosition)
    : buildSpawnForwardFromMarker();
};

const updateStageState = () => {
  layout = stageContext.layout;
  stageZoneMap = stageJson ? createZoneMapFromStageJson(stageJson) : null;
  stageStyle = stageContext.style;
  stageParts = stageContext.parts;
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
camera.minZ = 0.02;
const baseCameraSpeed = 0.02;
const playerMoveSpeed = baseCameraSpeed * Math.sqrt(10);
camera.speed = 0;
camera.angularSensibility = 1500;
camera.keysUp = [87];
camera.keysDown = [83];
camera.keysLeft = [65];
camera.keysRight = [68];
camera.checkCollisions = true;
camera.ellipsoid = new Vector3(
  playerWidth * 0.5,
  playerHeight * 0.5,
  playerWidth * 0.5
);
camera.inputs.removeByType("FreeCameraKeyboardMoveInput");
const applyCameraSpawnTransform = () => {
  camera.position.copyFrom(spawnPosition);
  camera.rotation = new Vector3(0, 0, 0);
  camera.setTarget(spawnPosition.add(spawnForward));
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
    defaultStartSettings: { ...titleDefaultStartSettings },
    brainwashSettings: { ...titleBrainwashSettings },
    bitSpawnSettings: { ...titleBitSpawnSettings }
  });
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
const titleRightPanels = document.createElement("div");
titleRightPanels.className = "title-right-panels";
document.body.appendChild(titleRightPanels);
const titleOverlayElement =
  document.getElementById("titleOverlay") as unknown as HTMLDivElement;
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
  }
});
const titleGameOverWarning = document.createElement("div");
titleGameOverWarning.className = "title-gameover-warning";
titleGameOverWarning.textContent =
  "※現在の設定ではゲームオーバーにならない可能性があります。設定の変更を推奨します。";
titleRightPanels.appendChild(titleGameOverWarning);
const titleSettingsCombinedPanel = document.createElement("div");
titleSettingsCombinedPanel.className = "title-settings-combined-panel";
titleRightPanels.appendChild(titleSettingsCombinedPanel);
let titleGameOverWarningEnabled = true;
const updateTitleGameOverWarning = () => {
  if (!titleGameOverWarningEnabled) {
    titleGameOverWarning.style.display = "none";
    return;
  }
  const shouldWarn = hasNeverGameOverRisk(
    stageSelection.id,
    titleDefaultStartSettings,
    titleBrainwashSettings,
    titleBitSpawnSettings
  );
  titleGameOverWarning.style.display = shouldWarn ? "block" : "none";
};
const titleDefaultSettingsPanel = createDefaultSettingsPanel({
  parent: titleSettingsCombinedPanel,
  initialSettings: titleDefaultStartSettings,
  className: "default-settings-panel--title",
  onChange: (settings) => {
    titleDefaultStartSettings = settings;
    updateTitleGameOverWarning();
    saveTitleSettings();
  }
});
const titleBrainwashSettingsPanel = createBrainwashSettingsPanel({
  parent: titleSettingsCombinedPanel,
  initialSettings: titleBrainwashSettings,
  className: "brainwash-settings-panel--title",
  onChange: (settings) => {
    titleBrainwashSettings = settings;
    updateTitleGameOverWarning();
    saveTitleSettings();
  }
});
const titleBitSpawnPanel = createBitSpawnPanel({
  parent: titleSettingsCombinedPanel,
  initialSettings: titleBitSpawnSettings,
  className: "bit-spawn-panel--title",
  onChange: (settings) => {
    titleBitSpawnSettings = settings;
    updateTitleGameOverWarning();
    saveTitleSettings();
  }
});
const setTitleSettingsPanelsVisible = (visible: boolean) => {
  titleSettingsCombinedPanel.style.display = visible ? "flex" : "none";
  titleDefaultSettingsPanel.setVisible(visible);
  titleBrainwashSettingsPanel.setVisible(visible);
  titleBitSpawnPanel.setVisible(visible);
};
const trapRoomRecommendControl = createTrapRoomRecommendControl({
  parent: titleRightPanels,
  onApply: () => {
    titleBrainwashSettingsPanel.setSettings({
      ...titleBrainwashSettingsPanel.getSettings(),
      npcBrainwashCompleteGunPercent: 0,
      npcBrainwashCompleteNoGunPercent: 0
    });
    titleBitSpawnPanel.setSettings({
      ...titleBitSpawnPanel.getSettings(),
      disableBitSpawn: true
    });
  }
});
const titleResetSettingsButton = document.createElement("button");
titleResetSettingsButton.type = "button";
titleResetSettingsButton.className = "title-reset-settings-button";
titleResetSettingsButton.dataset.ui = "title-reset-settings-button";
titleResetSettingsButton.textContent = "全てデフォルトに戻す";
titleRightPanels.appendChild(titleResetSettingsButton);
const updateTrapRoomRecommendButtonVisibility = () => {
  trapRoomRecommendControl.setVisible(stageSelection.id === TRAP_STAGE_ID);
};
const updateTitleSettingsAvailabilityByStage = () => {
  const availability = getTitleSettingsAvailability(stageSelection.id);
  titleDefaultSettingsPanel.setNpcCountOnlyMode(availability.npcCountOnly);
  titleBrainwashSettingsPanel.setEnabled(availability.brainwashEnabled);
  titleBitSpawnPanel.setEnabled(availability.bitSpawnEnabled);
  titleStageSelectControl.setAlarmTrapEditable(availability.alarmTrapEditable);
};
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
  titleDefaultSettingsPanel.setSettings(defaults.defaultStartSettings);
  titleBrainwashSettingsPanel.setSettings(defaults.brainwashSettings);
  titleBitSpawnPanel.setSettings(defaults.bitSpawnSettings);
  titleStageSelectControl.setAlarmTrapEnabled(defaults.alarmTrapEnabled);
  const defaultSelection = stageCatalog.find(
    (selection) => selection.id === defaults.stageId
  )!;
  await applyStageSelection(defaultSelection);
  clearPersistedTitleSettings(TITLE_SETTINGS_STORAGE_KEY);
};
titleResetSettingsButton.addEventListener("click", () => {
  void resetTitleSettingsToDefault();
});
for (const category of volumeCategories) {
  applyVolumeLevel(category, volumeLevels[category]);
}
titleVolumePanel.setVisible(true);
titleStageSelectControl.setVisible(true);
setTitleSettingsPanelsVisible(true);
updateTrapRoomRecommendButtonVisibility();
updateTitleSettingsAvailabilityByStage();
updateTitleGameOverWarning();
const isTitleUiTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.closest(
      "[data-ui=\"volume-panel\"], [data-ui=\"stage-select-control\"], [data-ui=\"default-settings-panel\"], [data-ui=\"brainwash-settings-panel\"], [data-ui=\"bit-spawn-panel\"], [data-ui=\"trap-room-recommend-button\"], [data-ui=\"title-reset-settings-button\"]"
    ) !== null
  );
};
const toBgmUrl = (fileName: string) => buildAssetUrl("audio", "bgm", fileName);
const toSeUrl = (fileName: string) => buildAssetUrl("audio", "se", fileName);
const voiceBasePath = buildAssetUrl("audio", "voice");
const bgmByStage = gameConfig.audio.bgm.byStage;
const bgmFileNameSet = new Set(bgmFileNames);
const pickRandomBgmUrl = () => {
  if (bgmFileNames.length === 0) {
    return null;
  }
  const fileName = bgmFileNames[Math.floor(Math.random() * bgmFileNames.length)];
  return toBgmUrl(fileName);
};
const getStageBgmUrl = (stageId: string) => {
  const fileName = bgmByStage[stageId];
  if (fileName && bgmFileNameSet.has(fileName)) {
    return toBgmUrl(fileName);
  }
  return null;
};
const selectBgmUrl = (stageId: string | null) => {
  if (stageId) {
    const matched = getStageBgmUrl(stageId);
    if (matched) {
      return matched;
    }
  }
  return pickRandomBgmUrl();
};
const seConfig = gameConfig.audio.se;
const bitSeMove = toSeUrl(seConfig.bitMove);
const bitSeAlert = toSeUrl(seConfig.bitAlert);
const bitSeTarget = toSeUrl(seConfig.bitTarget);
const alarmSe = toSeUrl(seConfig.alarm);
const bitSeBeamNonTarget = seConfig.beamNonTarget.map((fileName) =>
  toSeUrl(fileName)
);
const bitSeBeamTarget = seConfig.beamTarget.map((fileName) =>
  toSeUrl(fileName)
);
const hitSeVariants = seConfig.hit.map((fileName) => toSeUrl(fileName));
const seUrls = new Set(seFileNames.map((fileName) => toSeUrl(fileName)));
const isSeAvailable = (url: string) => seUrls.has(url);
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
const beamSeFarDistance = 10 / 3;
const beamSeMidDistance = 5 / 3;

const sfxDirector = new SfxDirector(
  audioManager,
  () => camera.position,
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

const voiceIdPool = voiceProfiles
  .map((profile) => profile.id)
  .sort((a, b) => a.localeCompare(b));
const pickVoiceProfileById = (id: string) =>
  voiceProfiles.find((profile) => profile.id === id)!;
const shuffleVoiceIds = (ids: string[]) => {
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const temp = ids[index];
    ids[index] = ids[swap];
    ids[swap] = temp;
  }
};
const pickRandomVoiceId = () =>
  voiceIdPool[Math.floor(Math.random() * voiceIdPool.length)];
const allocateVoiceIds = (count: number) => {
  const ids = [...voiceIdPool];
  shuffleVoiceIds(ids);
  const playerId = ids.shift()!;
  const npcIds = Array.from(
    { length: count },
    () => (ids.length > 0 ? ids.shift()! : pickRandomVoiceId())
  );
  return { playerId, npcIds };
};

let playerVoiceId = "00";
let npcVoiceIds: string[] = [];
let playerVoiceActor: VoiceActor | null = null;
let npcVoiceActors: VoiceActor[] = [];

const stopAllVoices = () => {
  if (playerVoiceActor) {
    stopVoiceActor(playerVoiceActor);
  }
  for (const actor of npcVoiceActors) {
    stopVoiceActor(actor);
  }
  playerVoiceActor = null;
  npcVoiceActors = [];
};

const assignVoiceActors = () => {
  stopAllVoices();
  const playerProfile = pickVoiceProfileById(playerVoiceId);
  playerVoiceActor = createVoiceActor(
    playerProfile,
    () => camera.position,
    () => playerState
  );
  npcVoiceActors = npcs.map((npc) => {
    const profile = pickVoiceProfileById(npc.voiceId);
    return createVoiceActor(
      profile,
      () => npc.sprite.position,
      () =>
        executionNpcVoiceStateOverrides.get(npc.sprite.name) ?? npc.state
    );
  });
};

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
const npcs: Npc[] = [];
let playerPortraitDirectory = "";
let npcPortraitDirectories: string[] = [];
const portraitScaleCache = new Map<string, { width: number; height: number }>();
const getPortraitManagerByDirectory = (directory: string) =>
  portraitManagers.get(directory)!;
const getNpcPortraitManager = (directory: string, _index: number) =>
  getPortraitManagerByDirectory(directory);
const createPlayerAvatar = (manager: SpriteManager) => {
  const avatar = new Sprite("playerAvatar", manager);
  avatar.width = playerWidth;
  avatar.height = playerHeight;
  avatar.isPickable = false;
  avatar.cellIndex = 0;
  avatar.isVisible = false;
  return avatar;
};

const computePortraitSpriteSize = (directory: string) => {
  const cached = portraitScaleCache.get(directory);
  if (cached) {
    return cached;
  }
  const sheet = portraitSpriteSheets.get(directory)!;
  const size = calculatePortraitSpriteSize(
    sheet.imageWidth,
    sheet.imageHeight,
    portraitCellSize,
    portraitMaxWidthCells,
    portraitMaxHeightCells
  );
  portraitScaleCache.set(directory, size);
  return size;
};

const applyPortraitSize = (sprite: Sprite, directory: string) => {
  const size = computePortraitSpriteSize(directory);
  sprite.width = size.width;
  sprite.height = size.height;
};

const applyPortraitSizesToAll = () => {
  applyPortraitSize(playerAvatar, playerPortraitDirectory);
  alignSpriteToGround(playerAvatar);
  for (const npc of npcs) {
    applyPortraitSize(npc.sprite, npc.portraitDirectory);
    alignSpriteToGround(npc.sprite);
  }
};

const refreshPortraitSizes = () => {
  portraitScaleCache.clear();
  applyPortraitSizesToAll();
};

const assignVoiceIds = (npcCount: number) => {
  const { playerId, npcIds } = allocateVoiceIds(npcCount);
  playerVoiceId = playerId;
  npcVoiceIds = npcIds;
  const assignments = assignPortraitDirectories([
    playerVoiceId,
    ...npcVoiceIds
  ]);
  playerPortraitDirectory = assignments[0];
  npcPortraitDirectories = assignments.slice(1);
  portraitScaleCache.clear();
};
const getAssignedPortraitDirectories = () => [
  playerPortraitDirectory,
  ...npcPortraitDirectories
];

const createCharacters = () => {
  playerAvatar = createPlayerAvatar(
    getPortraitManagerByDirectory(playerPortraitDirectory)
  );
  playerAvatar.position = new Vector3(
    spawnPosition.x,
    playerAvatar.height * 0.5,
    spawnPosition.z
  );
  npcs.push(
    ...spawnNpcs(
      layout,
      spawnableCells,
      getNpcPortraitManager,
      npcVoiceIds,
      npcPortraitDirectories
    )
  );
  const initialBrainwashedNpcCount = Math.floor(
    runtimeDefaultStartSettings.initialNpcCount *
      runtimeDefaultStartSettings.initialBrainwashedNpcPercent *
      0.01
  );
  const shuffledNpcs = [...npcs];
  for (let index = shuffledNpcs.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const temp = shuffledNpcs[index];
    shuffledNpcs[index] = shuffledNpcs[swap];
    shuffledNpcs[swap] = temp;
  }
  for (let index = 0; index < initialBrainwashedNpcCount; index += 1) {
    applyNpcDefaultHaigureState(shuffledNpcs[index]);
  }
  applyPortraitSizesToAll();
};

const rebuildCharacters = async () => {
  assignVoiceIds(runtimeDefaultStartSettings.initialNpcCount);
  await ensurePortraitManagers(getAssignedPortraitDirectories());
  playerAvatar.dispose();
  npcs.length = 0;
  createCharacters();
};

assignVoiceIds(runtimeDefaultStartSettings.initialNpcCount);
await ensurePortraitManagers(getAssignedPortraitDirectories());
createCharacters();

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
    sfxDirector.playBeam(() => firePosition, false);
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
    sfxDirector.playBeam(() => firePosition, false);
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
const publicExecutionTransitionDelay = 1;
const publicExecutionBeamDelayMin = 2;
const publicExecutionBeamDelayMax = 10;
const executionHitFadeDuration = playerHitFadeDuration;

const playerBlockRadius = playerWidth;
const getSpriteBeamHitRadii = (sprite: Sprite) =>
  createBeamHitRadii(sprite.width, sprite.height);

type MoveKey = "forward" | "back" | "left" | "right";
const playerMoveInput: Record<MoveKey, boolean> = {
  forward: false,
  back: false,
  left: false,
  right: false
};

const resetPlayerMoveInput = () => {
  playerMoveInput.forward = false;
  playerMoveInput.back = false;
  playerMoveInput.left = false;
  playerMoveInput.right = false;
};


type PlayerState = CharacterState;
type PublicExecutionScenario = ExecutionConfig;
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
let executionFireCountdown = 0;
let executionFirePending = false;
let executionFireEffectActive = false;
let executionFireEffectTimer = 0;
const executionFireTargetPosition = new Vector3(0, 0, 0);
let executionVolleyFired = false;
let executionResolved = false;
let executionAllowPlayerMove = false;
let executionNpcShooterIndices: number[] = [];
const executionNpcShooterIds = new Set<string>();
const executionNpcVoiceStateOverrides = new Map<string, CharacterState>();
const executionHitSequence = createHitSequenceState();
let executionHitDurationCurrent = playerHitDuration;
let executionHitFadeDurationCurrent = executionHitFadeDuration;
let executionHitTargetKind: "player" | "npc" | null = null;
let executionHitNpcIndex: number | null = null;
const executionHitTargetPosition = new Vector3(0, 0, 0);
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
const buildTitleText = () => "左クリック: 開始";
const applyStageSelection = async (selection: StageSelection) => {
  const requestId = stageSelectionRequestId + 1;
  stageSelectionRequestId = requestId;
  stageSelectionInProgress = true;
  stageSelection = selection;
  saveTitleSettings();
  titleStageSelectControl.setSelectedStageId(selection.id);
  updateTrapRoomRecommendButtonVisibility();
  updateTitleSettingsAvailabilityByStage();
  updateTitleGameOverWarning();
  hud.setTitleText(buildTitleText());
  const loadedStageJson = await loadStageJson(selection);
  if (requestId !== stageSelectionRequestId) {
    return;
  }
  if (gamePhase !== "title") {
    stageSelectionInProgress = false;
    return;
  }
  stageJson = loadedStageJson;
  disposeStageParts(stageParts);
  stageContext = buildStageContext(scene, stageJson);
  updateStageState();
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
    await resetGame();
    if (requestId !== stageSelectionRequestId) {
      return;
    }
    if (gamePhase !== "title") {
      stageSelectionInProgress = false;
      return;
    }
    hud.setTitleVisible(true);
    hud.setHudVisible(false);
    hud.setStateInfo(null);
    gameFlow.resetFade();
  }
  stageSelectionInProgress = false;
};
hud.setTitleText(buildTitleText());

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
  resetHitSequenceState(executionHitSequence);
};

const updateExecutionHitTargetPosition = () => {
  if (executionHitTargetKind === "player") {
    executionHitTargetPosition.set(
      camera.position.x,
      playerAvatar.height * 0.5,
      camera.position.z
    );
    return;
  }
  if (executionHitTargetKind === "npc" && executionHitNpcIndex !== null) {
    executionHitTargetPosition.copyFrom(
      npcs[executionHitNpcIndex].sprite.position
    );
  }
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

const beginExecutionHit = (
  targetKind: "player" | "npc",
  npcIndex: number | null,
  hitScale: number
) => {
  if (executionHitSequence.phase !== "none") {
    return;
  }
  executionHitTargetKind = targetKind;
  executionHitNpcIndex = npcIndex;
  updateExecutionHitTargetPosition();
  if (targetKind === "player") {
    executionHitDurationCurrent = playerHitDuration * hitScale;
    executionHitFadeDurationCurrent = playerHitFadeDuration * hitScale;
    startHitSequence(
      executionHitSequence,
      scene,
      executionHitTargetPosition,
      buildPlayerHitSequenceConfig(
        "executionHitEffect",
        executionHitDurationCurrent,
        executionHitFadeDurationCurrent
      )
    );
    playerState = "hit-a";
    return;
  }
  executionHitDurationCurrent = npcHitDuration * hitScale;
  executionHitFadeDurationCurrent = npcHitFadeDuration * hitScale;
  startHitSequence(
    executionHitSequence,
    scene,
    executionHitTargetPosition,
    buildNpcHitSequenceConfig(
      "executionHitEffect",
      executionHitDurationCurrent,
      executionHitFadeDurationCurrent,
      npcs[npcIndex!].sprite
    )
  );
  const npc = npcs[npcIndex!];
  npc.state = "hit-a";
  npc.sprite.cellIndex = 1;
};

const updateExecutionHitEffect = (
  delta: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  if (executionHitSequence.phase === "none") {
    return;
  }
  updateExecutionHitTargetPosition();
  const config =
    executionHitTargetKind === "player"
      ? buildPlayerHitSequenceConfig(
          "executionHitEffect",
          executionHitDurationCurrent,
          executionHitFadeDurationCurrent
        )
      : buildNpcHitSequenceConfig(
          "executionHitEffect",
          executionHitDurationCurrent,
          executionHitFadeDurationCurrent,
          npcs[executionHitNpcIndex!].sprite
        );
  updateHitSequence(
    executionHitSequence,
    delta,
    executionHitTargetPosition,
    config,
    (isColorA) => {
      if (executionHitTargetKind === "player") {
        playerState = isColorA ? "hit-a" : "hit-b";
        return;
      }
      const npc = npcs[executionHitNpcIndex!];
      npc.state = isColorA ? "hit-a" : "hit-b";
    },
    () => {
      if (executionHitTargetKind === "player") {
        playerState = "hit-a";
        return;
      }
      const npc = npcs[executionHitNpcIndex!];
      npc.state = "hit-a";
      npc.sprite.cellIndex = 2;
    },
    () => {
      if (executionHitTargetKind === "player") {
        playerState = "brainwash-complete-haigure-formation";
      } else {
        const npc = npcs[executionHitNpcIndex!];
        npc.state = "brainwash-complete-haigure-formation";
        npc.sprite.cellIndex = 2;
      }
      executionResolved = true;
      executionHitTargetKind = null;
      executionHitNpcIndex = null;
    },
    shouldProcessOrb
  );
};

const resetExecutionState = () => {
  publicExecutionTriggerKey = null;
  publicExecutionTriggerTimer = 0;
  executionScenario = null;
  executionWaitForFade = false;
  executionFireCountdown = 0;
  executionFirePending = false;
  executionFireEffectActive = false;
  executionFireEffectTimer = 0;
  executionVolleyFired = false;
  executionResolved = false;
  executionAllowPlayerMove = false;
  executionNpcShooterIndices = [];
  executionNpcShooterIds.clear();
  executionNpcVoiceStateOverrides.clear();
  executionHitTargetKind = null;
  executionHitNpcIndex = null;
  executionHitDurationCurrent = playerHitDuration;
  executionHitFadeDurationCurrent = executionHitFadeDuration;
  disposeExecutionHitEffects();
};

const isExecutionBitVolley = (scenario: PublicExecutionScenario) =>
  scenario.variant === "player-survivor" ||
  scenario.variant === "npc-survivor-npc-block";

const isExecutionNpcVolley = (scenario: PublicExecutionScenario) =>
  isExecutionBitVolley(scenario) && bits.length === 0;

const getExecutionTriggerKey = (scenario: PublicExecutionScenario) => {
  if (scenario.variant === "player-survivor") {
    return "player-survivor";
  }
  return `${scenario.variant}:${scenario.survivorNpcIndex}`;
};

const keepExecutionTargetEvadeUntilHit = (
  scenario: PublicExecutionScenario
) => {
  if (executionResolved || executionHitSequence.phase !== "none") {
    return;
  }
  if (scenario.variant === "player-survivor") {
    playerState = "evade";
    return;
  }
  const survivorNpc = npcs[scenario.survivorNpcIndex];
  survivorNpc.state = "evade";
  survivorNpc.sprite.cellIndex = getPortraitCellIndex("evade");
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
  const aliveNpcIndices: number[] = [];
  for (let index = 0; index < npcs.length; index += 1) {
    if (isAliveState(npcs[index].state)) {
      aliveNpcIndices.push(index);
    }
  }
  const playerAlive = isAliveState(playerState);
  const aliveCount = aliveNpcIndices.length + (playerAlive ? 1 : 0);
  if (aliveCount !== 1) {
    return null;
  }
  if (playerAlive) {
    for (const npc of npcs) {
      if (
        npc.state === "brainwash-complete-no-gun" &&
        npc.blockTargetId === "player"
      ) {
        return { variant: "player-survivor" } as const;
      }
    }
    return null;
  }

  const survivorNpcIndex = aliveNpcIndices[0];
  const survivorNpc = npcs[survivorNpcIndex];
  if (survivorNpc.blockedByPlayer) {
    return {
      variant: "npc-survivor-player-block",
      survivorNpcIndex
    } as const;
  }

  const targetId = `npc_${survivorNpcIndex}`;
  for (const npc of npcs) {
    if (
      npc.state === "brainwash-complete-no-gun" &&
      npc.blockTargetId === targetId
    ) {
      return { variant: "npc-survivor-npc-block", survivorNpcIndex } as const;
    }
  }
  return null;
};

const enterPublicExecution = (scenario: PublicExecutionScenario) => {
  executionScenario = scenario;
  executionWaitForFade = true;
  executionFireCountdown = 0;
  executionFirePending = false;
  executionFireEffectActive = false;
  executionFireEffectTimer = 0;
  executionVolleyFired = false;
  executionResolved = false;
  executionAllowPlayerMove = scenario.variant === "npc-survivor-player-block";
  executionNpcShooterIndices = [];
  executionNpcShooterIds.clear();
  executionNpcVoiceStateOverrides.clear();
  if (isExecutionNpcVolley(scenario)) {
    for (let index = 0; index < npcs.length; index += 1) {
      if (
        scenario.variant === "npc-survivor-npc-block" &&
        index === scenario.survivorNpcIndex
      ) {
        continue;
      }
      executionNpcShooterIndices.push(index);
      executionNpcShooterIds.add(npcs[index].sprite.name);
    }
  }
  executionHitTargetKind = null;
  executionHitNpcIndex = null;
  executionHitDurationCurrent = playerHitDuration;
  executionHitFadeDurationCurrent = executionHitFadeDuration;
  disposeExecutionHitEffects();
  if (!executionAllowPlayerMove) {
    resetPlayerMoveInput();
    camera.cameraDirection.set(0, 0, 0);
  }
  gameFlow.enterExecution(scenario);
  keepExecutionTargetEvadeUntilHit(scenario);
  if (isExecutionNpcVolley(scenario)) {
    applyExecutionNpcShooterPresentation();
  }
};

const startPublicExecutionTransition = (scenario: PublicExecutionScenario) => {
  publicExecutionTriggerKey = null;
  publicExecutionTriggerTimer = 0;
  gamePhase = "transition";
  hud.setHudVisible(false);
  gameFlow.beginFadeOut(() => {
    removeCarpetFollowers();
    enterPublicExecution(scenario);
  });
};

const setExecutionAimPosition = (
  scenario: PublicExecutionScenario,
  out: Vector3
) => {
  if (scenario.variant === "player-survivor") {
    out.set(camera.position.x, eyeHeight, camera.position.z);
    return;
  }
  const survivorNpc = npcs[scenario.survivorNpcIndex];
  out.set(
    survivorNpc.sprite.position.x,
    eyeHeight,
    survivorNpc.sprite.position.z
  );
};

const startExecutionBitFireEffects = (targetPosition: Vector3) => {
  for (const bit of bits) {
    bit.root.lookAt(targetPosition);
    const muzzlePosition = bit.muzzle.getAbsolutePosition();
    const direction = targetPosition.subtract(muzzlePosition);
    if (direction.lengthSquared() <= 0.0001) {
      continue;
    }
    bit.fireLockDirection.copyFrom(direction.normalize());
    startBitFireEffect(bit);
  }
};

const startExecutionNpcFireEffects = () => {
  for (const index of executionNpcShooterIndices) {
    const npc = npcs[index];
    npc.state = "brainwash-complete-gun";
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
  }
};

const startExecutionVolleyFireEffects = (
  scenario: PublicExecutionScenario,
  targetPosition: Vector3
) => {
  if (isExecutionNpcVolley(scenario)) {
    startExecutionNpcFireEffects();
    return;
  }
  startExecutionBitFireEffects(targetPosition);
};

const updateExecutionBitFireEffects = (delta: number) => {
  for (const bit of bits) {
    updateBitFireEffect(bit, delta);
  }
};

const updateExecutionVolleyFireEffects = (
  scenario: PublicExecutionScenario,
  delta: number
) => {
  if (isExecutionNpcVolley(scenario)) {
    return;
  }
  updateExecutionBitFireEffects(delta);
};

const spawnExecutionNpcBeamVolley = (
  targetPosition: Vector3,
  targetingPlayer: boolean
) => {
  for (const index of executionNpcShooterIndices) {
    const npc = npcs[index];
    npc.state = "brainwash-complete-gun";
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
    const muzzlePosition = new Vector3(
      npc.sprite.position.x,
      eyeHeight,
      npc.sprite.position.z
    );
    const direction = targetPosition.subtract(muzzlePosition);
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
    sfxDirector.playBeam(() => firePosition, targetingPlayer);
  }
};

const spawnExecutionBeamVolley = (
  scenario: PublicExecutionScenario,
  targetPosition: Vector3
) => {
  if (isExecutionNpcVolley(scenario)) {
    spawnExecutionNpcBeamVolley(
      targetPosition,
      scenario.variant === "player-survivor"
    );
    return;
  }
  const targetingPlayer = scenario.variant === "player-survivor";
  for (const bit of bits) {
    const muzzlePosition = bit.muzzle.getAbsolutePosition();
    const direction = targetPosition.subtract(muzzlePosition);
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

const handleExecutionBeamCollisions = (scenario: PublicExecutionScenario) => {
  if (!isExecutionBitVolley(scenario)) {
    return;
  }
  if (!executionVolleyFired) {
    return;
  }
  const skipNpcIndex =
    scenario.variant === "player-survivor" ? -1 : scenario.survivorNpcIndex;
  const playerHitRadii = getSpriteBeamHitRadii(playerAvatar);
  const survivorNpc =
    scenario.variant === "player-survivor"
      ? null
      : npcs[scenario.survivorNpcIndex];
  const survivorNpcHitRadii = survivorNpc
    ? getSpriteBeamHitRadii(survivorNpc.sprite)
    : null;
  for (const beam of beams) {
    if (!beam.active) {
      continue;
    }
    if (isExecutionNpcVolley(scenario)) {
      if (!beam.sourceId || !executionNpcShooterIds.has(beam.sourceId)) {
        continue;
      }
    } else if (!isBitSource(beam.sourceId)) {
      continue;
    }

    let hitTarget = false;
    let hitAny = false;

    if (scenario.variant === "player-survivor") {
      executionCollisionPosition.set(
        camera.position.x,
        eyeHeight,
        camera.position.z
      );
      if (
        isBeamHittingTargetExcludingSource(
          beam,
          beam.sourceId,
          "player",
          executionCollisionPosition,
          playerHitRadii
        )
      ) {
        hitAny = true;
        hitTarget = true;
      }
    } else {
      executionCollisionPosition.set(
        survivorNpc!.sprite.position.x,
        eyeHeight,
        survivorNpc!.sprite.position.z
      );
      if (
        isBeamHittingTargetExcludingSource(
          beam,
          beam.sourceId,
          `npc_${scenario.survivorNpcIndex}`,
          executionCollisionPosition,
          survivorNpcHitRadii!
        )
      ) {
        hitAny = true;
        hitTarget = true;
      }
    }

    if (
      !hitAny &&
      scenario.variant === "npc-survivor-npc-block"
    ) {
      executionCollisionPosition.set(
        playerAvatar.position.x,
        eyeHeight,
        playerAvatar.position.z
      );
      if (
        isBeamHittingTargetExcludingSource(
          beam,
          beam.sourceId,
          "player",
          executionCollisionPosition,
          playerHitRadii
        )
      ) {
        hitAny = true;
      }
    }

    if (!hitAny) {
      for (let index = 0; index < npcs.length; index += 1) {
        if (index === skipNpcIndex) {
          continue;
        }
        const npc = npcs[index];
        const npcId = npc.sprite.name;
        const npcHitRadii = getSpriteBeamHitRadii(npc.sprite);
        executionCollisionPosition.set(
          npc.sprite.position.x,
          eyeHeight,
          npc.sprite.position.z
        );
        if (
          isBeamHittingTargetExcludingSource(
            beam,
            beam.sourceId,
            npcId,
            executionCollisionPosition,
            npcHitRadii
          )
        ) {
          hitAny = true;
          break;
        }
      }
    }

    if (!hitAny) {
      continue;
    }

    const impactPosition = getBeamImpactPosition(beam);
    beginBeamRetract(beam, impactPosition);
    if (hitTarget && executionHitSequence.phase === "none") {
      if (scenario.variant === "player-survivor") {
        beginExecutionHit("player", null, 1);
      } else {
        beginExecutionHit("npc", scenario.survivorNpcIndex, 1);
      }
    }
  }
};

const updatePlayerMovement = (delta: number, allowMove: boolean) => {
  if (!allowMove) {
    return;
  }
  let moveX = 0;
  let moveZ = 0;
  if (playerMoveInput.forward) {
    moveZ += 1;
  }
  if (playerMoveInput.back) {
    moveZ -= 1;
  }
  if (playerMoveInput.right) {
    moveX += 1;
  }
  if (playerMoveInput.left) {
    moveX -= 1;
  }
  if (moveX !== 0 || moveZ !== 0) {
    const forward = camera.getDirection(new Vector3(0, 0, 1));
    forward.y = 0;
    const right = camera.getDirection(new Vector3(1, 0, 0));
    right.y = 0;
    const moveDirection = new Vector3(0, 0, 0);
    if (moveZ !== 0 && forward.lengthSquared() > 0.0001) {
      moveDirection.addInPlace(forward.scale(moveZ));
    }
    if (moveX !== 0 && right.lengthSquared() > 0.0001) {
      moveDirection.addInPlace(right.scale(moveX));
    }
    if (moveDirection.lengthSquared() > 0.0001) {
      camera.cameraDirection.addInPlace(
        moveDirection.scale(playerMoveSpeed * delta)
      );
    }
  }
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
  updateExecutionHitEffect(delta, shouldProcessOrb);

  const scenario = executionScenario!;
  keepExecutionTargetEvadeUntilHit(scenario);
  if (executionFireEffectActive) {
    executionFireEffectTimer = Math.max(
      0,
      executionFireEffectTimer - delta
    );
    updateExecutionVolleyFireEffects(scenario, delta);
    if (executionFireEffectTimer <= 0) {
      executionFireEffectActive = false;
      executionVolleyFired = true;
      spawnExecutionBeamVolley(scenario, executionFireTargetPosition);
    }
  }
  handleExecutionBeamCollisions(scenario);
  if (executionResolved) {
    return;
  }
  if (executionHitSequence.phase !== "none") {
    return;
  }

  if (executionAllowPlayerMove) {
    updatePlayerMovement(delta, true);
  }

  if (executionWaitForFade && !gameFlow.isFading()) {
    executionWaitForFade = false;
    if (isExecutionBitVolley(scenario)) {
      executionFireCountdown =
        publicExecutionBeamDelayMin +
        Math.random() *
          (publicExecutionBeamDelayMax - publicExecutionBeamDelayMin);
      executionFirePending = true;
    }
  }

  if (executionFirePending) {
    executionFireCountdown -= delta;
    if (executionFireCountdown <= 0) {
      executionFirePending = false;
      setExecutionAimPosition(scenario, executionFireTargetPosition);
      if (isExecutionNpcVolley(scenario)) {
        executionVolleyFired = true;
        spawnExecutionBeamVolley(scenario, executionFireTargetPosition);
      } else {
        executionFireEffectActive = true;
        executionFireEffectTimer = bitFireEffectDuration;
        startExecutionVolleyFireEffects(scenario, executionFireTargetPosition);
      }
    }
  }

  if (scenario.variant === "npc-survivor-player-block") {
    const survivorNpc = npcs[scenario.survivorNpcIndex];
    const targetPosition = survivorNpc.sprite.position;
    const targetHitRadii = getSpriteBeamHitRadii(survivorNpc.sprite);
    for (const beam of beams) {
      if (!beam.active) {
        continue;
      }
      if (beam.sourceId !== "player") {
        continue;
      }
      if (isBeamHittingTarget(beam, targetPosition, targetHitRadii)) {
        const impactPosition = getBeamImpactPosition(beam);
        beginBeamRetract(beam, impactPosition);
        beginExecutionHit("npc", scenario.survivorNpcIndex, 1);
        playerState = "brainwash-complete-haigure-formation";
        executionAllowPlayerMove = false;
        resetPlayerMoveInput();
        camera.cameraDirection.set(0, 0, 0);
        hud.setCrosshairVisible(false);
        break;
      }
    }
    return;
  }

  if (isExecutionBitVolley(scenario)) {
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
  roulettePlayerPosition.set(
    rouletteCenter.x + Math.cos(playerAngle) * rouletteCharacterRadius,
    eyeHeight,
    rouletteCenter.z + Math.sin(playerAngle) * rouletteCharacterRadius
  );
  camera.position.copyFrom(roulettePlayerPosition);
  camera.setTarget(new Vector3(rouletteCenter.x, eyeHeight, rouletteCenter.z));
  camera.cameraDirection.set(0, 0, 0);
  resetPlayerMoveInput();
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
    gameFlow.beginFadeOut(() => {
      apply();
      gamePhase = "roulette";
      hud.setStateInfo(null);
    });
  },
  prepareUndoState: () => {
    clearBeams();
    disposeAllBits();
  }
});

const startRouletteMode = () => {
  rouletteSystem.start(true);
  hud.setStateInfo(null);
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
  camera.position.set(roulettePlayerPosition.x, eyeHeight, roulettePlayerPosition.z);
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
    eyeHeight,
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
    disposePlayerHitEffects
  });
let gameFlow = createGameFlowInstance();
const rebuildGameFlow = () => {
  gameFlow = createGameFlowInstance();
};

hud.setHudVisible(false);
hud.setTitleVisible(true);
hud.setStateInfo(null);
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
  let retryText: string | null = null;
  if (rouletteMode) {
    retryText = "操作説明\nR: 1回分やりなおす\nEnter: タイトルへ";
  } else if (brainwashChoiceStarted) {
    const promptLines: string[] = ["操作説明"];
    if (canMove) {
      promptLines.push("WASD: 移動");
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
    retryText = promptLines.join("\n");
  } else if (canMove) {
    retryText = "操作説明\nWASD: 移動";
  }

  hud.drawMinimap({
    cameraPosition: camera.position,
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
    retryText,
    showCrosshair: playerState === "brainwash-complete-gun",
    trackedNpcPositions
  });
};

scene.onBeforeRenderObservable.add(() => {
  if (gamePhase === "playing" || gamePhase === "roulette") {
    camera.position.y = eyeHeight;
    drawMinimap();
  }
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
  const centerPosition = new Vector3(
    camera.position.x,
    playerCenterY,
    camera.position.z
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
      if (isBeamHittingTarget(beam, centerPosition, playerHitRadii)) {
        const hitScale = isRedBitSource(beam.sourceId)
          ? redHitDurationScale
          : 1;
        const impactPosition = beam.tip.position.add(
          Vector3.Normalize(beam.velocity).scale(beam.tipRadius)
        );
        beginBeamRetract(beam, impactPosition);
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
          centerPosition,
          buildPlayerHitSequenceConfig(
            "playerHitEffect",
            playerHitDurationCurrent,
            playerHitFadeDurationCurrent
          )
        );
        const hitPosition = centerPosition.clone();
        sfxDirector.playHit(() => hitPosition);
        break;
      }
    }
  }

  if (playerHitSequence.phase !== "none") {
    updateHitSequence(
      playerHitSequence,
      delta,
      centerPosition,
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
    const dx = npc.sprite.position.x - centerPosition.x;
    const dy = npc.sprite.position.y - centerPosition.y;
    const dz = npc.sprite.position.z - centerPosition.z;
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
  for (const npc of npcs) {
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
    if (npc.noGunTouchBrainwashTimer > 0) {
      const progress =
        1 - npc.noGunTouchBrainwashTimer / noGunTouchBrainwashDuration;
      npc.sprite.cellIndex = getNoGunTouchBrainwashCellIndex(progress);
    }
  }
};

const resetGame = async () => {
  alarmTriggeredNpcIds.clear();
  bitAlertTargetedNpcIds.clear();
  stopAllVoices();
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
  await rebuildCharacters();

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
  assignVoiceActors();
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
    titleGameOverWarningEnabled = false;
    titleGameOverWarning.style.display = "none";
    titleDefaultStartSettings = titleDefaultSettingsPanel.getSettings();
    titleBrainwashSettings = titleBrainwashSettingsPanel.getSettings();
    titleBitSpawnSettings = titleBitSpawnPanel.getSettings();
    titleAlarmTrapEnabled = titleStageSelectControl.getAlarmTrapEnabled();
    const runtimeSettings = normalizeRuntimeSettingsForStage({
      stageId: stageSelection.id,
      titleDefaultStartSettings,
      titleBrainwashSettings,
      titleBitSpawnSettings,
      titleAlarmTrapEnabled,
      defaultBrainwashSettings,
      defaultBitSpawnSettings
    });
    const rouletteSelected = runtimeSettings.rouletteSelected;
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
    await resetGame();
    const bgmUrl = selectBgmUrl(stageSelection.id);
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
    setTitleSettingsPanelsVisible(false);
    trapRoomRecommendControl.setVisible(false);
    titleResetSettingsButton.style.display = "none";
    titleGameOverWarning.style.display = "none";
    hud.setHudVisible(true);
    hud.setStateInfo(null);
    gameFlow.resetFade();
    canvas.requestPointerLock();
  } finally {
    titleTransitionInProgress = false;
  }
};

const returnToTitle = async () => {
  if (titleTransitionInProgress) {
    return;
  }
  titleTransitionInProgress = true;
  try {
    document.exitPointerLock();
    await resetGame();
    audioManager.stopBgm();
    gamePhase = "title";
    titleGameOverWarningEnabled = true;
    hud.setTitleVisible(true);
    titleVolumePanel.setVisible(true);
    titleStageSelectControl.setVisible(true);
    setTitleSettingsPanelsVisible(true);
    updateTrapRoomRecommendButtonVisibility();
    titleResetSettingsButton.style.display = "";
    updateTitleGameOverWarning();
    hud.setHudVisible(false);
    hud.setStateInfo(null);
    gameFlow.resetFade();
  } finally {
    titleTransitionInProgress = false;
  }
};

const updateVoices = (delta: number) => {
  if (!playerVoiceActor) {
    return;
  }
  const allowIdle = gamePhase === "playing";
  updateVoiceActor(
    playerVoiceActor,
    audioManager,
    voiceBasePath,
    delta,
    allowIdle,
    voiceBaseOptions,
    voiceLoopOptions
  );
  for (const actor of npcVoiceActors) {
    updateVoiceActor(
      actor,
      audioManager,
      voiceBasePath,
      delta,
      allowIdle,
      voiceBaseOptions,
      voiceLoopOptions
    );
  }
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
    hud.setHudVisible(false);
    gameFlow.beginFadeOut(() => {
      removeCarpetFollowers();
      gameFlow.enterAssembly("instant");
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
    hud.setHudVisible(false);
    gameFlow.beginFadeOut(() => {
      enterPublicExecution(executionScenario!);
    });
  },
  onSelectBrainwashOption: (state) => {
    playerState = state;
  },
  onMoveKey: (key, pressed) => {
    playerMoveInput[key] = pressed;
  },
  onPlayerFire: (origin, direction) => {
    beams.push(createBeam(scene, origin, direction, beamMaterial, "player"));
    const firePosition = origin.clone();
    sfxDirector.playBeam(() => firePosition, false);
  }
});

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime() / 1000;
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
    const npcBlockers =
      playerState === "brainwash-complete-no-gun"
        ? [{ position: camera.position, radius: playerBlockRadius, sourceId: "player" }]
        : [];
    const npcEvadeThreats = npcs.map(() => [] as Vector3[]);
    for (const bit of bits) {
      if (!bit.targetId) {
        continue;
      }
      if (!bit.targetId.startsWith("npc_")) {
        continue;
      }
      const targetIndex = Number(bit.targetId.slice(4));
      npcEvadeThreats[targetIndex].push(bit.root.position);
    }
    const aimRay = camera.getForwardRay();
    const aimDirection = aimRay.direction.normalize();
    let aimedNpcIndex = -1;
    let aimedNpcDistance = Infinity;
    for (let index = 0; index < npcs.length; index += 1) {
      const npc = npcs[index];
      if (!isAliveState(npc.state)) {
        continue;
      }
      const toCenter = aimRay.origin.subtract(npc.sprite.position);
      const b = Vector3.Dot(toCenter, aimDirection);
      const npcAimRadius = npc.sprite.width * 0.5;
      const c =
        Vector3.Dot(toCenter, toCenter) - npcAimRadius * npcAimRadius;
      const discriminant = b * b - c;
      if (discriminant < 0) {
        continue;
      }
      const sqrt = Math.sqrt(discriminant);
      let t = -b - sqrt;
      if (t < 0) {
        t = -b + sqrt;
      }
      if (t < 0) {
        continue;
      }
      if (t < aimedNpcDistance) {
        aimedNpcDistance = t;
        aimedNpcIndex = index;
      }
    }
    if (aimedNpcIndex >= 0) {
      npcEvadeThreats[aimedNpcIndex].push(camera.position);
    }
    const npcTargets = [
      {
        id: "player",
        position: camera.position,
        alive: isAliveState(playerState),
        state: playerState,
        hitById: playerHitById
      },
      ...npcs.map((npc, index) => ({
        id: `npc_${index}`,
        position: npc.sprite.position,
        alive: isAliveState(npc.state),
        state: npc.state,
        hitById: npc.hitById
      }))
    ];
    alarmSystem.update(delta, gamePhase, npcTargets);
    const activeDynamicBeamCells = new Set<string>();
    if (isDynamicStageSelected()) {
      for (const beam of beams) {
        if (!beam.active || beam.sourceId !== dynamicBeamSourceId) {
          continue;
        }
        const beamCell = worldToCell(layout, beam.startPosition);
        activeDynamicBeamCells.add(`${beamCell.row},${beamCell.col}`);
      }
    }
    const npcUpdate = updateNpcs(
      layout,
      floorCells,
      npcs,
      beams,
      delta,
      elapsedTime,
      npcTargets,
      (position) => {
        sfxDirector.playHit(() => position);
      },
      (position, direction, sourceId, targetingPlayer) => {
        beams.push(createBeam(scene, position, direction, beamMaterial, sourceId));
        sfxDirector.playBeam(() => position, targetingPlayer);
      },
      isRedBitSource,
      beamImpactOrbs,
      npcBlockers,
      npcEvadeThreats,
      camera.position,
      shouldProcessOrb,
      trapSystem.shouldFreezeNpcMovement,
      (cell) => activeDynamicBeamCells.has(`${cell.row},${cell.col}`),
      (npcId) => alarmSystem.getAlarmTargetStack(npcId),
      runtimeBrainwashSettings.brainwashOnNoGunTouch
    );
    if (npcUpdate.playerNoGunTouchBrainwashRequested) {
      startPlayerNoGunTouchBrainwash();
    }
    const playerBlockedByNpc =
      npcUpdate.playerBlocked && isAliveState(playerState);
    const canMove =
      isAliveState(playerState) ||
      playerState === "brainwash-complete-gun" ||
      playerState === "brainwash-complete-no-gun";
    const allowMove = canMove && !playerBlockedByNpc;
    updatePlayerMovement(delta, allowMove);

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
          hud.setHudVisible(false);
          gameFlow.beginFadeOut(() => {
            removeCarpetFollowers();
            gameFlow.enterAssembly("instant");
          });
        } else {
          removeCarpetFollowers();
          gameFlow.enterAssembly("move");
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

      const targets = [
        {
          id: "player",
          position: camera.position,
          alive: isAliveState(playerState),
          state: playerState,
          hitById: playerHitById
        },
        ...npcs.map((npc, index) => ({
          id: `npc_${index}`,
          position: npc.sprite.position,
          alive: isAliveState(npc.state),
          state: npc.state,
          hitById: npc.hitById
        }))
      ];
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
          ? applyAlertRequests(npcUpdate.alertRequests, targets, bits)
          : null;
      updateBits(
        layout,
        bits,
        delta,
        elapsedTime,
        targets,
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
  if (gamePhase === "roulette") {
    const shouldProcessOrb = buildOrbCullingCheck();
    updateRouletteScene(delta, shouldProcessOrb);
  }
  if (gamePhase !== "playing") {
    trapSystem.updateNpcFreezeControl(delta, gamePhase);
  }

  if (gamePhase === "execution") {
    const shouldProcessOrb = buildOrbCullingCheck();
    updateExecutionScene(delta, shouldProcessOrb);
  }

  if (gamePhase === "assemblyMove" || gamePhase === "assemblyHold") {
    gameFlow.updateAssembly(delta);
  }

  updateCharacterSpriteCells();
  updateVoices(delta);
  gameFlow.updateFade(delta);
  audioManager.updateSpatial();
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
