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
  MeshBuilder,
  StandardMaterial
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
  createBeam,
  createTrapBeam,
  beginBeamRetract,
  createBitAt,
  createBeamMaterial,
  createBit,
  createBitMaterials,
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
  npcHitRadius,
  startBitFireEffect,
  stopBitFireEffect,
  updateBitFireEffect,
  promoteHaigureNpc,
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
  voiceProfiles,
  VoiceActor
} from "./audio/voice";
import { SfxDirector } from "./audio/sfxDirector";
import { createGameFlow, type GamePhase, type ExecutionConfig } from "./game/flow";
import { buildStageContext, disposeStageParts } from "./world/stageContext";
import {
  createStageSelector,
  loadStageJson,
  STAGE_CATALOG,
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
  PLAYER_EYE_HEIGHT,
  PLAYER_SPRITE_CENTER_HEIGHT,
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH
} from "./game/characterSprites";
import {
  assignPortraitDirectories,
  calculatePortraitSpriteSize,
  getPortraitCellIndex,
  getPortraitDirectories,
  loadPortraitSpriteSheet,
  type PortraitSpriteSheet
} from "./game/portraitSprites";

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
const defaultBitSpawnSettings: BitSpawnSettings = {
  bitSpawnInterval: 10,  // ビットの通常出現間隔（秒）。1〜99。デフォルトは10
  maxBitCount: 25,       // ビットの同時出現上限。1〜99。デフォルトは25
  disableBitSpawn: false // true で「ビットを出現させない」。デフォルトは false
};
const defaultDefaultStartSettings: DefaultStartSettings = {
  startPlayerAsBrainwashCompleteGun: false,
  startAllNpcsAsHaigure: false,
  // ステージ開始時のNPC人数。0〜99。デフォルトは11
  initialNpcCount: 11
};
const defaultBrainwashSettings: BrainwashSettings = {
  instantBrainwash: false,
  // NPC洗脳完了後の行動遷移確率（表示値）。ポーズは100 - 銃あり - 銃なし
  npcBrainwashCompleteGunPercent: 45,
  npcBrainwashCompleteNoGunPercent: 45
};
let titleBitSpawnSettings: BitSpawnSettings = { ...defaultBitSpawnSettings };
let titleDefaultStartSettings: DefaultStartSettings = {
  ...defaultDefaultStartSettings
};
let titleBrainwashSettings: BrainwashSettings = {
  ...defaultBrainwashSettings
};
let runtimeBitSpawnInterval = defaultBitSpawnSettings.bitSpawnInterval;
let runtimeMaxBitCount = defaultBitSpawnSettings.maxBitCount;
let runtimeDefaultStartSettings: DefaultStartSettings = {
  ...defaultDefaultStartSettings
};
let runtimeBrainwashSettings: BrainwashSettings = {
  ...defaultBrainwashSettings
};
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
  defaultSettings: DefaultStartSettings,
  brainwashSettings: BrainwashSettings,
  bitSpawnSettings: BitSpawnSettings
) => {
  if (defaultSettings.startPlayerAsBrainwashCompleteGun) {
    return false;
  }
  if (!bitSpawnSettings.disableBitSpawn) {
    return false;
  }
  if (!defaultSettings.startAllNpcsAsHaigure) {
    return true;
  }
  if (defaultSettings.initialNpcCount <= 0) {
    return true;
  }
  return (
    brainwashSettings.npcBrainwashCompleteGunPercent === 0 &&
    brainwashSettings.npcBrainwashCompleteNoGunPercent === 0
  );
};

const portraitDirectories = getPortraitDirectories();
const portraitSpriteSheets = new Map<string, PortraitSpriteSheet>();
await Promise.all(
  portraitDirectories.map(async (directory) => {
    const sheet = await loadPortraitSpriteSheet(directory);
    portraitSpriteSheets.set(directory, sheet);
  })
);
const portraitManagers = new Map<string, SpriteManager>();
// プレイヤー1人 + NPC最大99人
const spriteManagerCapacity = 100;
for (const directory of portraitDirectories) {
  const sheet = portraitSpriteSheets.get(directory)!;
  portraitManagers.set(
    directory,
    new SpriteManager(
      `portrait_${directory}`,
      sheet.url,
      spriteManagerCapacity,
      { width: sheet.cellWidth, height: sheet.cellHeight },
      scene
    )
  );
}

const stageSelector = createStageSelector(STAGE_CATALOG);
let stageSelection = stageSelector.getCurrent();
let stageSelectionRequestId = 0;
let stageSelectionInProgress = false;
let stageJson = await loadStageJson(stageSelection);
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

const buildFixedSpawnForward = (selection: StageSelection) =>
  selection.id === "city_center"
    ? new Vector3(0, 0, -1)
    : new Vector3(0, 0, 1);

const buildArenaSpawnForward = (position: Vector3) => {
  const towardCenter = new Vector3(-position.x, 0, -position.z);
  if (towardCenter.lengthSquared() <= 0.0001) {
    return new Vector3(0, 0, 1);
  }
  return towardCenter.normalize();
};

let spawnForward = new Vector3(0, 0, 1);
let portraitCellSize = layout.cellSize;

const updateSpawnPoint = () => {
  const spawnCell =
    stageSelection.id === "arena"
      ? pickRandomCell(spawnableCells)
      : { row: layout.spawn.row, col: layout.spawn.col };
  spawnPosition = cellToWorld(layout, spawnCell, eyeHeight);
  spawnForward =
    stageSelection.id === "arena"
      ? buildArenaSpawnForward(spawnPosition)
      : buildFixedSpawnForward(stageSelection);
};

const updateStageState = () => {
  layout = stageContext.layout;
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
const volumeLevels: VolumeLevels = {
  bgm: 5,
  se: 5,
  voice: 5
};
const applyVolumeLevel = (category: AudioCategory, level: number) => {
  volumeLevels[category] = level;
  audioManager.setCategoryVolume(category, volumeBase[category] * (level / 10));
};
const titleVolumePanel = createVolumePanel({
  parent: document.body,
  initialLevels: volumeLevels,
  className: "volume-panel--title",
  onChange: (category, level) => {
    applyVolumeLevel(category, level);
  }
});
const titleRightPanels = document.createElement("div");
titleRightPanels.className = "title-right-panels";
document.body.appendChild(titleRightPanels);
const titleGameOverWarning = document.createElement("div");
titleGameOverWarning.className = "title-gameover-warning";
titleGameOverWarning.textContent =
  "※現在の設定ではゲームオーバーにならない可能性があります。設定の変更を推奨します。";
titleRightPanels.appendChild(titleGameOverWarning);
const updateTitleGameOverWarning = () => {
  const shouldWarn = hasNeverGameOverRisk(
    titleDefaultStartSettings,
    titleBrainwashSettings,
    titleBitSpawnSettings
  );
  titleGameOverWarning.style.display = shouldWarn ? "block" : "none";
};
const titleDefaultSettingsPanel = createDefaultSettingsPanel({
  parent: titleRightPanels,
  initialSettings: titleDefaultStartSettings,
  className: "default-settings-panel--title",
  onChange: (settings) => {
    titleDefaultStartSettings = settings;
    updateTitleGameOverWarning();
  }
});
const titleBrainwashSettingsPanel = createBrainwashSettingsPanel({
  parent: titleRightPanels,
  initialSettings: titleBrainwashSettings,
  className: "brainwash-settings-panel--title",
  onChange: (settings) => {
    titleBrainwashSettings = settings;
    updateTitleGameOverWarning();
  }
});
const titleBitSpawnPanel = createBitSpawnPanel({
  parent: titleRightPanels,
  initialSettings: titleBitSpawnSettings,
  className: "bit-spawn-panel--title",
  onChange: (settings) => {
    titleBitSpawnSettings = settings;
    updateTitleGameOverWarning();
  }
});
const volumeCategories: AudioCategory[] = ["voice", "bgm", "se"];
for (const category of volumeCategories) {
  applyVolumeLevel(category, volumeLevels[category]);
}
titleVolumePanel.setVisible(true);
titleDefaultSettingsPanel.setVisible(true);
titleBrainwashSettingsPanel.setVisible(true);
titleBitSpawnPanel.setVisible(true);
updateTitleGameOverWarning();
const isTitleUiTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.closest(
      "[data-ui=\"volume-panel\"], [data-ui=\"default-settings-panel\"], [data-ui=\"brainwash-settings-panel\"], [data-ui=\"bit-spawn-panel\"]"
    ) !== null
  );
};
const bgmFiles = import.meta.glob("/public/audio/bgm/*.mp3");
const bgmFilePaths = Object.keys(bgmFiles);
const bgmUrls = bgmFilePaths.map((path) => path.replace("/public", ""));
const pickRandomBgmUrl = () => {
  if (bgmUrls.length === 0) {
    return null;
  }
  return bgmUrls[Math.floor(Math.random() * bgmUrls.length)];
};
const getStageBgmUrl = (stageName: string) => {
  const filePath = `/public/audio/bgm/${stageName}.mp3`;
  if (bgmFiles[filePath]) {
    return `/audio/bgm/${stageName}.mp3`;
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
const seUrls = new Set(seFilePaths.map((path) => path.replace("/public", "")));
const isSeAvailable = (url: string) => seUrls.has(url);
const bitSeMove = "/audio/se/FlyingObject.mp3";
const bitSeAlert = "/audio/se/BeamShot_WavingPart.mp3";
const bitSeTarget = "/audio/se/aim.mp3";
const bitSeBeamNonTarget = [
  "/audio/se/BeamShotR_DownLong.mp3",
  "/audio/se/BeamShotR_Down.mp3",
  "/audio/se/BeamShotR_DownShort.mp3"
];
const bitSeBeamTarget = [
  "/audio/se/BeamShotR_Up.mp3",
  "/audio/se/BeamShotR_UpShort.mp3",
  "/audio/se/BeamShotR_UpHighShort.mp3"
];
const hitSeVariants = [
  "/audio/se/BeamHit_Rev.mp3",
  "/audio/se/BeamHit_RevLong.mp3",
  "/audio/se/BeamHit_RevLongFast.mp3"
];
const seBaseOptions: SpatialPlayOptions = {
  volume: 0.95,
  maxDistance: 3.75,
  loop: false
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

const voiceIdPool = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12"
];
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
  if (runtimeDefaultStartSettings.startAllNpcsAsHaigure) {
    for (const npc of npcs) {
      applyNpcDefaultHaigureState(npc);
    }
  }
  applyPortraitSizesToAll();
};

const rebuildCharacters = () => {
  assignVoiceIds(runtimeDefaultStartSettings.initialNpcCount);
  playerAvatar.dispose();
  npcs.length = 0;
  createCharacters();
};

assignVoiceIds(runtimeDefaultStartSettings.initialNpcCount);
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
  const bit = createBitAt(scene, materials, index, position, direction);
  if (isRed) {
    applyRedBit(bit);
  }
  return bit;
};
const createCarpetFollowerBitAt = (
  index: number,
  position: Vector3,
  direction?: Vector3
) => createBitAt(scene, carpetBitMaterials, index, position, direction);

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

type TrapWallSide = "north" | "south" | "west" | "east";
type TrapFloorCandidate = {
  kind: "floor";
  row: number;
  col: number;
  centerX: number;
  centerZ: number;
};
type TrapWallCandidate = {
  kind: "wall";
  row: number;
  col: number;
  side: TrapWallSide;
  boundaryX: number;
  boundaryZ: number;
  direction: Vector3;
  rotationY: number;
};
type TrapCandidate = TrapFloorCandidate | TrapWallCandidate;
type TrapPhase = "inactive" | "charging" | "waiting_clear" | "interval";
const trapStageId = "arena_trap_room";
const trapSourceId = "trap";
const trapWarningDuration = 5;
const trapIntervalDuration = 2;
const trapBlinkIntervalStart = 0.8;
const trapBlinkIntervalEnd = 0.08;
const trapBlinkEaseExponent = 1.35;
const trapWallCellCount = 3;
const trapFloorWarningYOffset = 0.002;
const trapWallWarningInset = 0.001;
const trapBeamSpawnInset = 0.01;
const trapNpcStopDelayMax = 6.0;
const trapNpcStopDelayStep = 0.1;
const trapTelegraphMaterial = new StandardMaterial(
  "trapTelegraphMaterial",
  scene
);
trapTelegraphMaterial.diffuseColor = new Color3(1, 0.18, 0.74);
trapTelegraphMaterial.emissiveColor = new Color3(1, 0.18, 0.74);
trapTelegraphMaterial.specularColor = Color3.Black();
trapTelegraphMaterial.alpha = 0.9;
trapTelegraphMaterial.backFaceCulling = false;
let trapCandidates: TrapCandidate[] = [];
let trapSelectedCandidates: TrapCandidate[] = [];
let trapTelegraphMeshes: Mesh[] = [];
let trapPhase: TrapPhase = "inactive";
let trapPhaseTimer = 0;
let trapBlinkTimer = 0;
let trapBlinkVisible = false;
let trapVolleyCount = 1;
let trapNpcFreezeWindowActive = false;
let trapNpcFreezeElapsed = 0;
const trapNpcStopDelayById = new Map<string, number>();

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
const playerHitRadius = playerWidth * 0.5;
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

const isTrapStageSelected = () => stageSelection.id === trapStageId;

const setTrapTelegraphVisible = (visible: boolean) => {
  const visibility = visible ? 1 : 0;
  for (const mesh of trapTelegraphMeshes) {
    mesh.visibility = visibility;
  }
};

const clearTrapTelegraphMeshes = () => {
  for (const mesh of trapTelegraphMeshes) {
    mesh.dispose();
  }
  trapTelegraphMeshes = [];
  trapSelectedCandidates = [];
  trapBlinkVisible = false;
};

const resetTrapRuntimeState = () => {
  clearTrapTelegraphMeshes();
  trapPhase = "inactive";
  trapPhaseTimer = 0;
  trapBlinkTimer = 0;
  trapBlinkVisible = false;
  trapVolleyCount = 1;
  trapNpcFreezeWindowActive = false;
  trapNpcFreezeElapsed = 0;
  trapNpcStopDelayById.clear();
};

const getCellCenterXZ = (row: number, col: number) => ({
  x: -halfWidth + layout.cellSize / 2 + col * layout.cellSize,
  z: -halfDepth + layout.cellSize / 2 + row * layout.cellSize
});

const buildTrapCandidatesForStage = (): TrapCandidate[] => {
  if (!isTrapStageSelected()) {
    return [];
  }
  const candidates: TrapCandidate[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.columns; col += 1) {
      if (layout.cells[row][col] !== "floor") {
        continue;
      }
      const center = getCellCenterXZ(row, col);
      candidates.push({
        kind: "floor",
        row,
        col,
        centerX: center.x,
        centerZ: center.z
      });
      if (row > 0 && layout.cells[row - 1][col] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "north",
          boundaryX: center.x,
          boundaryZ: center.z - layout.cellSize / 2,
          direction: new Vector3(0, 0, 1),
          rotationY: 0
        });
      }
      if (row < layout.rows - 1 && layout.cells[row + 1][col] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "south",
          boundaryX: center.x,
          boundaryZ: center.z + layout.cellSize / 2,
          direction: new Vector3(0, 0, -1),
          rotationY: Math.PI
        });
      }
      if (col > 0 && layout.cells[row][col - 1] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "west",
          boundaryX: center.x - layout.cellSize / 2,
          boundaryZ: center.z,
          direction: new Vector3(1, 0, 0),
          rotationY: -Math.PI / 2
        });
      }
      if (col < layout.columns - 1 && layout.cells[row][col + 1] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "east",
          boundaryX: center.x + layout.cellSize / 2,
          boundaryZ: center.z,
          direction: new Vector3(-1, 0, 0),
          rotationY: Math.PI / 2
        });
      }
    }
  }
  return candidates;
};

const syncTrapStageContext = () => {
  trapCandidates = buildTrapCandidatesForStage();
};

const createTrapTelegraphMesh = (candidate: TrapCandidate) => {
  if (candidate.kind === "floor") {
    const floorMesh = MeshBuilder.CreateGround(
      `trapTelegraphFloor_${candidate.row}_${candidate.col}`,
      { width: layout.cellSize, height: layout.cellSize },
      scene
    );
    floorMesh.position.set(
      candidate.centerX,
      trapFloorWarningYOffset,
      candidate.centerZ
    );
    floorMesh.material = trapTelegraphMaterial;
    floorMesh.isPickable = false;
    return floorMesh;
  }
  const wallMesh = MeshBuilder.CreatePlane(
    `trapTelegraphWall_${candidate.row}_${candidate.col}_${candidate.side}`,
    {
      width: layout.cellSize,
      height: layout.cellSize * trapWallCellCount,
      sideOrientation: Mesh.DOUBLESIDE
    },
    scene
  );
  wallMesh.position.set(
    candidate.boundaryX + candidate.direction.x * trapWallWarningInset,
    (layout.cellSize * trapWallCellCount) / 2,
    candidate.boundaryZ + candidate.direction.z * trapWallWarningInset
  );
  wallMesh.rotation.y = candidate.rotationY;
  wallMesh.material = trapTelegraphMaterial;
  wallMesh.isPickable = false;
  return wallMesh;
};

const pickTrapCandidates = (count: number): TrapCandidate[] => {
  if (count <= 0) {
    return [];
  }
  const selected = [...trapCandidates];
  for (let index = 0; index < count; index += 1) {
    const swapIndex =
      index + Math.floor(Math.random() * (selected.length - index));
    const current = selected[index];
    selected[index] = selected[swapIndex];
    selected[swapIndex] = current;
  }
  return selected.slice(0, count);
};

const countTrapBeamsInFlight = () =>
  beams.filter((beam) => beam.group === "trap").length;

const isTrapNpcFreezeWindow = () =>
  trapPhase === "charging" || countTrapBeamsInFlight() > 0;

const assignTrapNpcStopDelays = () => {
  trapNpcStopDelayById.clear();
  const maxStep = Math.floor(trapNpcStopDelayMax / trapNpcStopDelayStep);
  for (const npc of npcs) {
    const step = Math.floor(Math.random() * (maxStep + 1));
    const delay = Number((step * trapNpcStopDelayStep).toFixed(1));
    trapNpcStopDelayById.set(npc.sprite.name, delay);
  }
};

const beginTrapNpcFreezeWindow = () => {
  trapNpcFreezeWindowActive = true;
  trapNpcFreezeElapsed = 0;
  assignTrapNpcStopDelays();
};

const updateTrapNpcMovementControl = (delta: number) => {
  const shouldApply =
    gamePhase === "playing" &&
    isTrapStageSelected() &&
    isTrapNpcFreezeWindow();
  if (!shouldApply) {
    trapNpcFreezeWindowActive = false;
    trapNpcFreezeElapsed = 0;
    trapNpcStopDelayById.clear();
    return;
  }
  if (!trapNpcFreezeWindowActive) {
    beginTrapNpcFreezeWindow();
  }
  trapNpcFreezeElapsed += delta;
};

const shouldFreezeTrapNpcMovement = (npc: Npc, npcId: string) =>
  trapNpcFreezeWindowActive &&
  (npc.state === "normal" || npc.state === "evade") &&
  trapNpcFreezeElapsed + 0.0001 >= trapNpcStopDelayById.get(npcId)!;

const startTrapChargingPhase = () => {
  clearTrapTelegraphMeshes();
  if (trapCandidates.length === 0) {
    trapPhase = "inactive";
    return;
  }
  const countLimit =
    (trapVolleyCount * (trapVolleyCount + 1)) / 2;
  const selectionCount = Math.min(trapCandidates.length, countLimit);
  trapSelectedCandidates = pickTrapCandidates(selectionCount);
  for (const candidate of trapSelectedCandidates) {
    trapTelegraphMeshes.push(createTrapTelegraphMesh(candidate));
  }
  trapBlinkVisible = true;
  setTrapTelegraphVisible(true);
  trapBlinkTimer = 0;
  trapPhaseTimer = 0;
  trapPhase = "charging";
  beginTrapNpcFreezeWindow();
};

const fireTrapVolley = () => {
  if (trapSelectedCandidates.length === 0) {
    return;
  }
  for (const candidate of trapSelectedCandidates) {
    if (candidate.kind === "floor") {
      beams.push(
        createTrapBeam(
          scene,
          new Vector3(candidate.centerX, bounds.minY + 0.001, candidate.centerZ),
          new Vector3(0, 1, 0),
          beamMaterial,
          trapSourceId,
          layout.cellSize,
          layout,
          bounds
        )
      );
      continue;
    }
    for (let level = 0; level < trapWallCellCount; level += 1) {
      beams.push(
        createTrapBeam(
          scene,
          new Vector3(
            candidate.boundaryX + candidate.direction.x * trapBeamSpawnInset,
            layout.cellSize * (0.5 + level),
            candidate.boundaryZ + candidate.direction.z * trapBeamSpawnInset
          ),
          candidate.direction,
          beamMaterial,
          trapSourceId,
          layout.cellSize,
          layout,
          bounds
        )
      );
    }
  }
  trapVolleyCount += 1;
};

const updateTrapSystem = (delta: number) => {
  if (gamePhase !== "playing" || !isTrapStageSelected()) {
    if (trapPhase !== "inactive" || trapTelegraphMeshes.length > 0) {
      resetTrapRuntimeState();
    }
    return;
  }

  if (trapPhase === "inactive") {
    startTrapChargingPhase();
    return;
  }

  if (trapPhase === "charging") {
    trapPhaseTimer += delta;
    const progress = Math.min(1, trapPhaseTimer / trapWarningDuration);
    const blend = Math.pow(progress, trapBlinkEaseExponent);
    const blinkInterval =
      trapBlinkIntervalStart +
      (trapBlinkIntervalEnd - trapBlinkIntervalStart) * blend;
    trapBlinkTimer += delta;
    while (trapBlinkTimer >= blinkInterval) {
      trapBlinkTimer -= blinkInterval;
      trapBlinkVisible = !trapBlinkVisible;
      setTrapTelegraphVisible(trapBlinkVisible);
    }
    if (trapPhaseTimer >= trapWarningDuration) {
      fireTrapVolley();
      clearTrapTelegraphMeshes();
      trapPhase = "waiting_clear";
    }
    return;
  }

  if (trapPhase === "waiting_clear") {
    if (countTrapBeamsInFlight() === 0) {
      trapPhase = "interval";
      trapPhaseTimer = trapIntervalDuration;
    }
    return;
  }

  if (trapPhase === "interval") {
    trapPhaseTimer -= delta;
    if (trapPhaseTimer <= 0) {
      startTrapChargingPhase();
    }
  }
};

type PlayerState = CharacterState;
type PublicExecutionScenario = ExecutionConfig;
let playerState: PlayerState = "normal";
const playerHitSequence = createHitSequenceState();
let playerHitDurationCurrent = playerHitDuration;
let playerHitFadeDurationCurrent = playerHitFadeDuration;
let playerHitById: string | null = null;
let playerHitTime = 0;
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

let gamePhase: GamePhase = "title";
const allDownTransitionDelay = 3;
let bitSpawnEnabled = true;

let elapsedTime = 0;
let bitSpawnTimer = runtimeBitSpawnInterval;
let bitIndex = bits.length;

const hud = createHud();
hud.setMinimapReadoutVisible(minimapReadoutVisible);
const buildTitleText = (selection: StageSelection) =>
  `左クリック: 開始\n右クリック: ステージ選択\nステージ: ${selection.label}`;
const applyStageSelection = async (selection: StageSelection) => {
  const requestId = stageSelectionRequestId + 1;
  stageSelectionRequestId = requestId;
  stageSelectionInProgress = true;
  stageSelection = selection;
  hud.setTitleText(buildTitleText(selection));
  const loadedStageJson = await loadStageJson(selection);
  if (requestId !== stageSelectionRequestId) {
    return;
  }
  stageSelectionInProgress = false;
  if (gamePhase !== "title") {
    return;
  }
  stageJson = loadedStageJson;
  disposeStageParts(stageParts);
  stageContext = buildStageContext(scene, stageJson);
  updateStageState();
  syncTrapStageContext();
  resetTrapRuntimeState();
  applyCameraSpawnTransform();
  refreshPortraitSizes();
  rebuildGameFlow();
  if (gamePhase === "title") {
    resetGame();
    hud.setTitleVisible(true);
    hud.setHudVisible(false);
    hud.setStateInfo(null);
    gameFlow.resetFade();
  }
};
hud.setTitleText(buildTitleText(stageSelection));

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
      if (bit.spawnEffect) {
        bit.spawnEffect.dispose();
      }
      if (bit.spawnEffectMaterial) {
        bit.spawnEffectMaterial.dispose();
      }
      const muzzleMaterial = bit.muzzle.material as StandardMaterial;
      muzzleMaterial.dispose();
      bit.root.dispose();
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
  targetPosition: Vector3
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
    sfxDirector.playBeamNonTarget(() => firePosition);
  }
};

const spawnExecutionBeamVolley = (
  scenario: PublicExecutionScenario,
  targetPosition: Vector3
) => {
  if (isExecutionNpcVolley(scenario)) {
    spawnExecutionNpcBeamVolley(targetPosition);
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
          playerHitRadius
        )
      ) {
        hitAny = true;
        hitTarget = true;
      }
    } else {
      const survivorNpc = npcs[scenario.survivorNpcIndex];
      executionCollisionPosition.set(
        survivorNpc.sprite.position.x,
        eyeHeight,
        survivorNpc.sprite.position.z
      );
      if (
        isBeamHittingTargetExcludingSource(
          beam,
          beam.sourceId,
          `npc_${scenario.survivorNpcIndex}`,
          executionCollisionPosition,
          npcHitRadius
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
          playerHitRadius
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
            npcHitRadius
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
    for (const beam of beams) {
      if (!beam.active) {
        continue;
      }
      if (beam.sourceId !== "player") {
        continue;
      }
      if (isBeamHittingTarget(beam, targetPosition, npcHitRadius)) {
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
  npcs: Npc[],
  bits: Bit[]
): ExternalAlert | null => {
  for (const request of requests) {
    const target = targets.find(
      (candidate) => candidate.id === request.targetId
    )!;
    const candidates: (
      | { type: "npc"; distanceSq: number; npc: Npc }
      | { type: "bit"; distanceSq: number; bit: Bit }
    )[] = [];
    for (const npc of npcs) {
      const npcId = npc.sprite.name;
      if (npcId === request.blockerId) {
        continue;
      }
      if (
        npc.state !== "brainwash-complete-gun" &&
        npc.state !== "brainwash-complete-no-gun" &&
        npc.state !== "brainwash-complete-haigure"
      ) {
        continue;
      }
      const distanceSq = Vector3.DistanceSquared(
        npc.sprite.position,
        target.position
      );
      candidates.push({ type: "npc", distanceSq, npc });
    }
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
      candidates.push({ type: "bit", distanceSq, bit });
    }
    candidates.sort((a, b) => a.distanceSq - b.distanceSq);
    const selected = candidates.slice(0, 4);
    const receiverIds: string[] = [];
    for (const candidate of selected) {
      if (candidate.type === "npc") {
        const npc = candidate.npc;
        if (npc.state === "brainwash-complete-haigure") {
          promoteHaigureNpc(npc);
        }
        if (npc.alertState !== "receive") {
          npc.alertReturnBrainwashMode = npc.brainwashMode;
          npc.alertReturnTargetId = npc.brainwashTargetId;
        }
        npc.alertState = "receive";
        npc.brainwashMode = "chase";
        npc.brainwashTargetId = request.blockerId;
        npc.blockTimer = 0;
        npc.blockTargetId = null;
        npc.breakAwayTimer = 0;
        continue;
      }
      receiverIds.push(candidate.bit.id);
    }
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
  if (gamePhase !== "playing") {
    return;
  }
  let aliveCount = isAliveState(playerState) ? 1 : 0;
  for (const npc of npcs) {
    if (isAliveState(npc.state)) {
      aliveCount += 1;
    }
  }

  const canMove =
    isAliveState(playerState) ||
    playerState === "brainwash-complete-gun" ||
    playerState === "brainwash-complete-no-gun";
  const surviveTime = brainwashChoiceStarted ? playerHitTime : null;
  let retryText: string | null = null;
  if (brainwashChoiceStarted) {
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
    elapsedTime,
    surviveTime,
    aliveCount,
    retryText,
    showCrosshair: playerState === "brainwash-complete-gun"
  });
};

scene.onBeforeRenderObservable.add(() => {
  if (gamePhase === "playing") {
    camera.position.y = eyeHeight;
    drawMinimap();
  }
});

const updatePlayerState = (
  delta: number,
  elapsed: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  const playerCenterY = playerAvatar.height * 0.5;
  const centerPosition = new Vector3(
    camera.position.x,
    playerCenterY,
    camera.position.z
  );
  const hitEffectRadius =
    calculateHitEffectDiameter(playerAvatar.width, playerAvatar.height) / 2;
  const hitEffectRadiusSq = hitEffectRadius * hitEffectRadius;

  if (isAliveState(playerState)) {
    for (const beam of beams) {
      if (!beam.active) {
        continue;
      }
      if (beam.sourceId === "player") {
        continue;
      }
      if (isBeamHittingTarget(beam, centerPosition, playerHitRadius)) {
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
        playerState = runtimeBrainwashSettings.instantBrainwash
          ? "brainwash-complete-haigure"
          : "brainwash-in-progress";
        if (!brainwashChoiceStarted) {
          brainwashChoiceStarted = true;
          brainwashChoiceUnlocked = true;
        }
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
  for (const npc of npcs) {
    npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
  }
};

const resetGame = () => {
  stopAllVoices();
  syncTrapStageContext();
  resetTrapRuntimeState();
  resetExecutionState();
  playerState = runtimeDefaultStartSettings.startPlayerAsBrainwashCompleteGun
    ? "brainwash-complete-gun"
    : "normal";
  playerHitById = null;
  playerHitTime = 0;
  playerHitDurationCurrent = playerHitDuration;
  playerHitFadeDurationCurrent = playerHitFadeDuration;
  brainwashChoiceStarted =
    runtimeDefaultStartSettings.startPlayerAsBrainwashCompleteGun;
  brainwashChoiceUnlocked =
    runtimeDefaultStartSettings.startPlayerAsBrainwashCompleteGun;
  allDownTime = null;
  bitSpawnEnabled = true;
  stopAlertLoop();
  disposePlayerHitEffects();

  clearBeams();

  for (const bit of bits) {
    if (bit.spawnEffect) {
      bit.spawnEffect.dispose();
    }
    if (bit.spawnEffectMaterial) {
      bit.spawnEffectMaterial.dispose();
    }
    const muzzleMaterial = bit.muzzle.material as StandardMaterial;
    muzzleMaterial.dispose();
    bit.root.dispose();
  }
  bits.length = 0;
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
  rebuildCharacters();

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

const startGame = () => {
  if (gamePhase === "title" && stageSelectionInProgress) {
    return;
  }
  titleDefaultStartSettings = titleDefaultSettingsPanel.getSettings();
  runtimeDefaultStartSettings = { ...titleDefaultStartSettings };
  titleBrainwashSettings = titleBrainwashSettingsPanel.getSettings();
  runtimeBrainwashSettings = { ...titleBrainwashSettings };
  setNpcBrainwashInProgressTransitionConfig(
    buildNpcBrainwashInProgressTransitionConfig(runtimeBrainwashSettings)
  );
  setNpcBrainwashCompleteTransitionConfig(
    buildNpcBrainwashCompleteTransitionConfig(runtimeBrainwashSettings)
  );
  titleBitSpawnSettings = titleBitSpawnPanel.getSettings();
  runtimeBitSpawnInterval = titleBitSpawnSettings.bitSpawnInterval;
  runtimeMaxBitCount = titleBitSpawnSettings.disableBitSpawn
    ? 0
    : titleBitSpawnSettings.maxBitCount;
  resetGame();
  const bgmUrl = selectBgmUrl(stageJson ? stageJson.meta.name : null);
  if (bgmUrl) {
    audioManager.startBgm(bgmUrl);
  }
  gamePhase = "playing";
  hud.setTitleVisible(false);
  titleVolumePanel.setVisible(false);
  titleDefaultSettingsPanel.setVisible(false);
  titleBrainwashSettingsPanel.setVisible(false);
  titleBitSpawnPanel.setVisible(false);
  titleGameOverWarning.style.display = "none";
  hud.setHudVisible(true);
  hud.setStateInfo(null);
  gameFlow.resetFade();
  canvas.requestPointerLock();
};

const returnToTitle = () => {
  document.exitPointerLock();
  resetGame();
  audioManager.stopBgm();
  gamePhase = "title";
  hud.setTitleVisible(true);
  titleVolumePanel.setVisible(true);
  titleDefaultSettingsPanel.setVisible(true);
  titleBrainwashSettingsPanel.setVisible(true);
  titleBitSpawnPanel.setVisible(true);
  updateTitleGameOverWarning();
  hud.setHudVisible(false);
  hud.setStateInfo(null);
  gameFlow.resetFade();
};

const updateVoices = (delta: number) => {
  if (!playerVoiceActor) {
    return;
  }
  const allowIdle = gamePhase === "playing";
  updateVoiceActor(
    playerVoiceActor,
    audioManager,
    delta,
    allowIdle,
    voiceBaseOptions,
    voiceLoopOptions
  );
  for (const actor of npcVoiceActors) {
    updateVoiceActor(
      actor,
      audioManager,
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
    startGame();
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
    returnToTitle();
  },
  onReplayExecution: () => {
    gamePhase = "transition";
    hud.setHudVisible(false);
    gameFlow.beginFadeOut(() => {
      enterPublicExecution(executionScenario!);
    });
  },
  onSelectStage: () => {
    const nextSelection = stageSelector.next();
    void applyStageSelection(nextSelection);
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
    sfxDirector.playBeamNonTarget(() => firePosition);
  }
});

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime() / 1000;
  updateTrapSystem(delta);
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
    updateTrapNpcMovementControl(delta);
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
      const c = Vector3.Dot(toCenter, toCenter) - npcHitRadius * npcHitRadius;
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
      (position, direction, sourceId) => {
        beams.push(createBeam(scene, position, direction, beamMaterial, sourceId));
        sfxDirector.playBeamNonTarget(() => position);
      },
      isRedBitSource,
      beamImpactOrbs,
      npcBlockers,
      npcEvadeThreats,
      camera.position,
      shouldProcessOrb,
      shouldFreezeTrapNpcMovement
    );
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
    for (const npc of npcs) {
      if (isAliveState(npc.state)) {
        npcAlive = true;
        break;
      }
    }

    if (gamePhase === "playing" && isBrainwashState(playerState) && !npcAlive) {
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
          ? applyAlertRequests(npcUpdate.alertRequests, targets, npcs, bits)
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
  if (gamePhase !== "playing") {
    updateTrapNpcMovementControl(delta);
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
