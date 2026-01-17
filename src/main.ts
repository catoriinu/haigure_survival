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
  collectFloorCells,
  createBeam,
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
  npcHitEffectDiameter,
  npcHitLightIntensity,
  npcHitLightRange,
  npcHitFadeDuration,
  npcHitFadeOrbConfig,
  npcHitFlickerInterval,
  npcHitRadius,
  startBitFireEffect,
  stopBitFireEffect,
  updateBitFireEffect,
  promoteHaigureNpc,
  spawnNpcs,
  StageBounds,
  updateBeams,
  updateBits,
  updateNpcs
} from "./game/entities";
import { isBeamHittingTarget } from "./game/beamCollision";
import {
  HitFadeOrbConfig,
  HitSequenceConfig,
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

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const defaultClearColor = scene.clearColor.clone();

const playerWidth = PLAYER_SPRITE_WIDTH;
const playerHeight = PLAYER_SPRITE_HEIGHT;
const playerCenterHeight = PLAYER_SPRITE_CENTER_HEIGHT;
const eyeHeight = PLAYER_EYE_HEIGHT;
const npcCount = 12;
const portraitMaxWidthCells = 1;
const portraitMaxHeightCells = 2;

const portraitDirectories = getPortraitDirectories();
const portraitSpriteSheets = new Map<string, PortraitSpriteSheet>();
await Promise.all(
  portraitDirectories.map(async (directory) => {
    const sheet = await loadPortraitSpriteSheet(directory);
    portraitSpriteSheets.set(directory, sheet);
  })
);
const portraitManagers = new Map<string, SpriteManager>();
const spriteManagerCapacity = npcCount + 1;
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

const buildSpawnForward = (selection: StageSelection) =>
  selection.id === "city_center"
    ? new Vector3(0, 0, -1)
    : new Vector3(0, 0, 1);

let spawnForward = buildSpawnForward(stageSelection);
let portraitCellSize = layout.cellSize;

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
  spawnPosition = new Vector3(
    -halfWidth + layout.cellSize / 2 + layout.spawn.col * layout.cellSize,
    eyeHeight,
    -halfDepth + layout.cellSize / 2 + layout.spawn.row * layout.cellSize
  );
  spawnForward = buildSpawnForward(stageSelection);
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
const volumeCategories: AudioCategory[] = ["voice", "bgm", "se"];
for (const category of volumeCategories) {
  applyVolumeLevel(category, volumeLevels[category]);
}
titleVolumePanel.setVisible(true);
const isVolumePanelTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest("[data-ui=\"volume-panel\"]") !== null;
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
      () => npc.state
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
let portraitAssignments = new Map<string, string>();
const portraitScaleCache = new Map<string, { width: number; height: number }>();
const getPortraitManagerByVoiceId = (voiceId: string) => {
  const directory = portraitAssignments.get(voiceId)!;
  return portraitManagers.get(directory)!;
};
const createPlayerAvatar = (manager: SpriteManager) => {
  const avatar = new Sprite("playerAvatar", manager);
  avatar.width = playerWidth;
  avatar.height = playerHeight;
  avatar.isPickable = false;
  avatar.cellIndex = 0;
  avatar.isVisible = false;
  return avatar;
};

const computePortraitSpriteSize = (voiceId: string) => {
  const cached = portraitScaleCache.get(voiceId);
  if (cached) {
    return cached;
  }
  const directory = portraitAssignments.get(voiceId)!;
  const sheet = portraitSpriteSheets.get(directory)!;
  const size = calculatePortraitSpriteSize(
    sheet.imageWidth,
    sheet.imageHeight,
    portraitCellSize,
    portraitMaxWidthCells,
    portraitMaxHeightCells
  );
  portraitScaleCache.set(voiceId, size);
  return size;
};

const applyPortraitSize = (sprite: Sprite, voiceId: string) => {
  const size = computePortraitSpriteSize(voiceId);
  sprite.width = size.width;
  sprite.height = size.height;
};

const applyPortraitSizesToAll = () => {
  applyPortraitSize(playerAvatar, playerVoiceId);
  for (const npc of npcs) {
    applyPortraitSize(npc.sprite, npc.voiceId);
  }
};

const refreshPortraitSizes = () => {
  portraitScaleCache.clear();
  applyPortraitSizesToAll();
};

const assignVoiceIds = () => {
  const { playerId, npcIds } = allocateVoiceIds(npcCount);
  playerVoiceId = playerId;
  npcVoiceIds = npcIds;
  portraitAssignments = assignPortraitDirectories([playerVoiceId, ...npcVoiceIds]);
  portraitScaleCache.clear();
};

const createCharacters = () => {
  playerAvatar = createPlayerAvatar(
    getPortraitManagerByVoiceId(playerVoiceId)
  );
  playerAvatar.position = new Vector3(
    spawnPosition.x,
    playerCenterHeight,
    spawnPosition.z
  );
  npcs.push(
    ...spawnNpcs(
      layout,
      spawnableCells,
      getPortraitManagerByVoiceId,
      npcVoiceIds
    )
  );
  applyPortraitSizesToAll();
};

const rebuildCharacters = () => {
  assignVoiceIds();
  playerAvatar.dispose();
  npcs.length = 0;
  createCharacters();
};

assignVoiceIds();
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

const alertSignal = {
  leaderId: null as string | null,
  targetId: null as string | null,
  requiredCount: 0,
  receiverIds: [] as string[],
  gatheredIds: new Set<string>()
};
const bitSpawnInterval = 10;
const playerHitDuration = 3;
const playerHitFadeDuration = 1;
const redHitDurationScale = 1;
const playerHitRadius = playerWidth * 0.5;
const playerHitEffectDiameter = playerHeight * 1.5;
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
const playerHitLightRange = playerHitEffectDiameter * 1.2;
const playerHitEffectRadius = playerHitEffectDiameter / 2;
const playerHitEffectRadiusSq = playerHitEffectRadius * playerHitEffectRadius;
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
let bitSpawnTimer = bitSpawnInterval;
let bitIndex = bits.length;
const maxBitCount = 25;

const hud = createHud();
const buildTitleText = (selection: StageSelection) =>
  `left click to start\nright click to select stage\nstage: ${selection.label}`;
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
  camera.position.copyFrom(spawnPosition);
  camera.rotation = new Vector3(0, 0, 0);
  camera.setTarget(spawnPosition.add(spawnForward));
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
      playerCenterHeight,
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
): HitSequenceConfig => ({
  hitDuration,
  fadeDuration,
  flickerInterval: playerHitFlickerInterval,
  colorA: playerHitColorA,
  colorB: playerHitColorB,
  effectAlpha: playerHitEffectAlpha,
  effectDiameter: playerHitEffectDiameter,
  lightIntensity: playerHitLightIntensity,
  lightRange: playerHitLightRange,
  fadeOrbConfig: playerHitFadeOrbConfig,
  effectName,
  sideOrientation: Mesh.DOUBLESIDE,
  backFaceCulling: false
});

const buildNpcHitSequenceConfig = (
  effectName: string,
  hitDuration: number,
  fadeDuration: number
): HitSequenceConfig => ({
  hitDuration,
  fadeDuration,
  flickerInterval: npcHitFlickerInterval,
  colorA: npcHitColorA,
  colorB: npcHitColorB,
  effectAlpha: npcHitEffectAlpha,
  effectDiameter: npcHitEffectDiameter,
  lightIntensity: npcHitLightIntensity,
  lightRange: npcHitLightRange,
  fadeOrbConfig: npcHitFadeOrbConfig,
  effectName
});

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
      executionHitFadeDurationCurrent
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
          executionHitFadeDurationCurrent
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
  executionHitTargetKind = null;
  executionHitNpcIndex = null;
  executionHitDurationCurrent = playerHitDuration;
  executionHitFadeDurationCurrent = executionHitFadeDuration;
  disposeExecutionHitEffects();
};

const isExecutionBitVolley = (scenario: PublicExecutionScenario) =>
  scenario.variant === "player-survivor" ||
  scenario.variant === "npc-survivor-npc-block";

const getExecutionTriggerKey = (scenario: PublicExecutionScenario) => {
  if (scenario.variant === "player-survivor") {
    return "player-survivor";
  }
  return `${scenario.variant}:${scenario.survivorNpcIndex}`;
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

const updateExecutionBitFireEffects = (delta: number) => {
  for (const bit of bits) {
    updateBitFireEffect(bit, delta);
  }
};

const spawnExecutionBeamVolley = (
  scenario: PublicExecutionScenario,
  targetPosition: Vector3
) => {
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
    if (!isBitSource(beam.sourceId)) {
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
        isBeamHittingTarget(
          beam,
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
        isBeamHittingTarget(
          beam,
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
        isBeamHittingTarget(
          beam,
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
        executionCollisionPosition.set(
          npc.sprite.position.x,
          eyeHeight,
          npc.sprite.position.z
        );
        if (
          isBeamHittingTarget(
            beam,
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
    updateExecutionBitFireEffects(delta);
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
      executionFireEffectActive = true;
      executionFireEffectTimer = bitFireEffectDuration;
      setExecutionAimPosition(scenario, executionFireTargetPosition);
      startExecutionBitFireEffects(executionFireTargetPosition);
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

  let retryText: string | null = null;
  if (brainwashChoiceStarted) {
    const surviveText = `生存時間: ${playerHitTime.toFixed(1)}s`;
    let promptText = `${surviveText}\npress R to retry\npress Enter to epilogue`;
    if (brainwashChoiceUnlocked) {
      promptText +=
        "\npress G to move with gun\npress N to move without gun\npress H to haigure";
    }
    retryText = promptText;
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
  const centerPosition = new Vector3(
    camera.position.x,
    playerCenterHeight,
    camera.position.z
  );

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
        playerState = "brainwash-in-progress";
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
    const inside = dx * dx + dy * dy + dz * dz <= playerHitEffectRadiusSq;
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
  resetExecutionState();
  playerState = "normal";
  playerHitById = null;
  playerHitTime = 0;
  playerHitDurationCurrent = playerHitDuration;
  playerHitFadeDurationCurrent = playerHitFadeDuration;
  brainwashChoiceStarted = false;
  brainwashChoiceUnlocked = false;
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
  bits.push(createRandomBit(bitIndex));
  bitIndex += 1;
  bitSpawnTimer = bitSpawnInterval;

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
  camera.position.copyFrom(spawnPosition);
  camera.rotation = new Vector3(0, 0, 0);
  camera.setTarget(spawnPosition.add(spawnForward));
  playerAvatar.isVisible = false;
  playerAvatar.position = new Vector3(
    spawnPosition.x,
    playerCenterHeight,
    spawnPosition.z
  );
  rebuildGameFlow();
  assignVoiceActors();
};

const startGame = () => {
  if (gamePhase === "title" && stageSelectionInProgress) {
    return;
  }
  resetGame();
  const bgmUrl = selectBgmUrl(stageJson ? stageJson.meta.name : null);
  if (bgmUrl) {
    audioManager.startBgm(bgmUrl);
  }
  gamePhase = "playing";
  hud.setTitleVisible(false);
  titleVolumePanel.setVisible(false);
  hud.setHudVisible(true);
  hud.setStateInfo(null);
  gameFlow.resetFade();
  canvas.requestPointerLock();
};

const returnToTitle = () => {
  resetGame();
  audioManager.stopBgm();
  gamePhase = "title";
  hud.setTitleVisible(true);
  titleVolumePanel.setVisible(true);
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
  isUiPointerTarget: isVolumePanelTarget,
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
      shouldProcessOrb
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
        if (bitSpawnTimer <= 0 && countNonFollowerBits() < maxBitCount) {
          bits.push(
            createRandomBit(bitIndex)
          );
          bitIndex += 1;
          bitSpawnTimer = bitSpawnInterval;
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
        if (countNonFollowerBits() >= maxBitCount) {
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
