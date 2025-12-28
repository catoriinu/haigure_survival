import "./style.css";
import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  HemisphericLight,
  Color3,
  Sprite,
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
  createNpcManager,
  isAliveState,
  isBrainwashState,
  isHitState,
  promoteHaigureNpc,
  spawnNpcs,
  StageBounds,
  updateBeams,
  updateBits,
  updateNpcs
} from "./game/entities";
import { isBeamHittingTarget } from "./game/beamCollision";
import {
  createHitEffectMesh,
  createHitFadeOrbs,
  HitFadeOrb,
  HitFadeOrbConfig,
  updateHitFadeOrbs
} from "./game/hitEffects";
import { AudioManager, SpatialHandle, SpatialPlayOptions } from "./audio/audio";
import {
  createVoiceActor,
  stopVoiceActor,
  updateVoiceActor,
  voiceProfiles,
  VoiceActor
} from "./audio/voice";
import { SfxDirector } from "./audio/sfxDirector";
import { createGameFlow, type GamePhase } from "./game/flow";
import { createGridLayout } from "./world/grid";
import { createStageFromGrid } from "./world/stage";
import { createHud } from "./ui/hud";
import { setupInputHandlers } from "./ui/input";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const layout = createGridLayout();
const unitScale = 0.5;
const room = {
  width: layout.columns * layout.cellSize,
  depth: layout.rows * layout.cellSize,
  height: layout.height
};
const playerWidth = 2.2 * unitScale;
const playerHeight = 3.3 * unitScale;
const playerCenterHeight = playerHeight / 2;
const eyeHeight = playerHeight * 0.75;
const halfWidth = room.width / 2;
const halfDepth = room.depth / 2;
const spawnPosition = new Vector3(
  -halfWidth + layout.cellSize / 2 + layout.spawn.col * layout.cellSize,
  eyeHeight,
  -halfDepth + layout.cellSize / 2 + layout.spawn.row * layout.cellSize
);
const spawnForward = new Vector3(1, 0, 0);
const camera = new FreeCamera(
  "camera",
  spawnPosition.clone(),
  scene
);
camera.setTarget(spawnPosition.add(spawnForward));
camera.attachControl(canvas, true);
const baseCameraSpeed = 0.25 * unitScale;
const playerMoveSpeed = baseCameraSpeed * Math.sqrt(10);
camera.speed = 0;
camera.angularSensibility = 1500;
camera.keysUp = [87];
camera.keysDown = [83];
camera.keysLeft = [65];
camera.keysRight = [68];
camera.checkCollisions = true;
camera.ellipsoid = new Vector3(0.5 * unitScale, playerHeight * 0.4, 0.5 * unitScale);
camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

const audioManager = new AudioManager(camera);
const bgmUrl = "/audio/bgm/研究所劇伴MP3.mp3";
const bitSeMove = "/audio/se/FlyingObject.mp3";
const bitSeAlert = "/audio/se/BeamShot_WavingPart.mp3";
const bitSeTarget = "/audio/se/銃火器・構える02.mp3";
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
  maxDistance: 45 * unitScale,
  loop: false
};
const alertLoopOptions: SpatialPlayOptions = {
  volume: 0.95,
  maxDistance: 45 * unitScale,
  loop: true
};
const beamSeOptions: SpatialPlayOptions = {
  volume: 0.8,
  maxDistance: 60 * unitScale,
  loop: false
};
const hitSeOptions: SpatialPlayOptions = {
  volume: 1,
  maxDistance: 65 * unitScale,
  loop: false
};
const voiceBaseOptions: SpatialPlayOptions = {
  volume: 0.72,
  maxDistance: 50 * unitScale,
  loop: false
};
const voiceLoopOptions: SpatialPlayOptions = {
  volume: 0.72,
  maxDistance: 50 * unitScale,
  loop: true
};
const beamSeFarDistance = 28 * unitScale;
const beamSeMidDistance = 16 * unitScale;

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
  }
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

let playerVoiceId = "00";
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
  const ids = [...voiceIdPool];
  shuffleVoiceIds(ids);
  playerVoiceId = ids.shift()!;
  const playerProfile = pickVoiceProfileById(playerVoiceId);
  playerVoiceActor = createVoiceActor(
    playerProfile,
    () => camera.position,
    () => playerState
  );
  npcVoiceActors = npcs.map((npc) => {
    npc.voiceId = ids.length > 0 ? ids.shift()! : pickRandomVoiceId();
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

createStageFromGrid(scene, layout, {
  floorColor: new Color3(0.55, 0.2, 0.75),
  ceilingColor: new Color3(0.88, 0.88, 0.88),
  wallBaseColor: new Color3(0.88, 0.88, 0.88),
  floorGridColor: new Color3(0.07, 0.07, 0.07),
  wallGridColor: new Color3(0.07, 0.07, 0.07),
  gridSpacingWorld: 2 * unitScale,
  gridCellsPerTexture: 8,
  gridLineWidthPx: 3,
  gridTextureSize: 512,
  enableCollisions: true
});

const floorCells = collectFloorCells(layout);
const noSpawnKeys = new Set(
  layout.noSpawnCells.map((cell) => `${cell.row},${cell.col}`)
);
const spawnableCells = floorCells.filter(
  (cell) => !noSpawnKeys.has(`${cell.row},${cell.col}`)
);
const npcManager = createNpcManager(scene, 32);
const playerAvatar = new Sprite("playerAvatar", npcManager);
playerAvatar.width = playerWidth;
playerAvatar.height = playerHeight;
playerAvatar.isPickable = false;
playerAvatar.cellIndex = 0;
playerAvatar.isVisible = false;
playerAvatar.position = new Vector3(
  spawnPosition.x,
  playerCenterHeight,
  spawnPosition.z
);
const npcCount = 11;
const npcs = spawnNpcs(layout, spawnableCells, npcManager, npcCount);

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
const beams: Beam[] = [];
const beamTrails: BeamTrail[] = [];
const beamImpactOrbs: BeamImpactOrb[] = [];

const bounds: StageBounds = {
  minX: -halfWidth,
  maxX: halfWidth,
  minZ: -halfDepth,
  maxZ: halfDepth,
  minY: 0,
  maxY: room.height
};
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
const redHitDurationScale = 0.25;
const playerHitRadius = playerWidth * 0.5;
const playerHitEffectDiameter = (playerHeight / unitScale) * 1.2;
const playerHitFlickerInterval = 0.12;
const playerHitColorA = new Color3(1, 0.18, 0.74);
const playerHitColorB = new Color3(0.2, 0.96, 1);
const playerHitEffectAlpha = 0.45;
const playerHitOrbDiameter = 0.22;
const playerHitOrbMinCount = 5;
const playerHitOrbMaxCount = 20;
const playerHitOrbSurfaceOffsetMin = 0.05;
const playerHitOrbSurfaceOffsetMax = 0.4;
const playerHitOrbSpeedMin = 0.25;
const playerHitOrbSpeedMax = 0.65;
const playerHitFadeOrbConfig: HitFadeOrbConfig = {
  minCount: playerHitOrbMinCount,
  maxCount: playerHitOrbMaxCount,
  diameter: playerHitOrbDiameter,
  surfaceOffsetMin: playerHitOrbSurfaceOffsetMin,
  surfaceOffsetMax: playerHitOrbSurfaceOffsetMax,
  speedMin: playerHitOrbSpeedMin,
  speedMax: playerHitOrbSpeedMax
};

const playerBlockRadius = playerWidth * 0.5 + 1.1 * unitScale;

type MoveKey = "forward" | "back" | "left" | "right";
const playerMoveInput: Record<MoveKey, boolean> = {
  forward: false,
  back: false,
  left: false,
  right: false
};

type PlayerState = CharacterState;
let playerState: PlayerState = "normal";
let playerHitTimer = 0;
let playerFadeTimer = 0;
let playerHitById: string | null = null;
let playerHitEffect: Mesh | null = null;
let playerHitEffectMaterial: StandardMaterial | null = null;
let playerHitTime = 0;
let playerHitOrbs: HitFadeOrb[] = [];
let playerHitFadeDurationCurrent = playerHitFadeDuration;
let allDownTime: number | null = null;
let brainwashChoiceStarted = false;
let brainwashChoiceUnlocked = false;

let gamePhase: GamePhase = "title";
const allDownTransitionDelay = 3;
let bitSpawnEnabled = true;

let elapsedTime = 0;
let bitSpawnTimer = bitSpawnInterval;
let bitIndex = bits.length;
const maxBitCount = 25;

const hud = createHud();

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
  if (playerHitEffect) {
    playerHitEffect.dispose();
    playerHitEffect = null;
    playerHitEffectMaterial = null;
  }
  for (const orb of playerHitOrbs) {
    orb.mesh.dispose();
  }
  playerHitOrbs = [];
};

const gameFlow = createGameFlow({
  layout,
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
    layout,
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

const updatePlayerState = (delta: number, elapsed: number) => {
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
        playerHitTimer = playerHitDuration * hitScale;
        playerFadeTimer = 0;
        playerHitById = beam.sourceId;
        playerHitTime = elapsed;
        playerHitFadeDurationCurrent = playerHitFadeDuration * hitScale;
        const { mesh: effect, material } = createHitEffectMesh(scene, {
          name: "playerHitEffect",
          diameter: playerHitEffectDiameter,
          color: playerHitColorA,
          alpha: playerHitEffectAlpha,
          sideOrientation: Mesh.DOUBLESIDE,
          backFaceCulling: false
        });
        effect.position.copyFrom(centerPosition);
        playerHitEffect = effect;
        playerHitEffectMaterial = material;
        const hitPosition = centerPosition.clone();
        sfxDirector.playHit(() => hitPosition);
        break;
      }
    }
  }

  if (isHitState(playerState)) {
    playerHitTimer -= delta;
    if (playerHitTimer > 0) {
      const phase =
        Math.floor(elapsed / playerHitFlickerInterval) % 2 === 0;
      const color = phase ? playerHitColorA : playerHitColorB;
      playerState = phase ? "hit-a" : "hit-b";
      if (playerHitEffect) {
        playerHitEffect.position.copyFrom(centerPosition);
        if (playerHitEffectMaterial) {
          playerHitEffectMaterial.emissiveColor.copyFrom(color);
          playerHitEffectMaterial.diffuseColor.copyFrom(color);
          playerHitEffectMaterial.alpha = playerHitEffectAlpha;
        }
      }
    } else {
      if (playerFadeTimer === 0) {
        playerFadeTimer = playerHitFadeDurationCurrent;
        playerHitOrbs = createHitFadeOrbs(
          scene,
          centerPosition.clone(),
          playerHitEffectMaterial!,
          playerHitEffectDiameter / 2,
          playerHitFadeOrbConfig
        );
      }
      playerState = "hit-a";
      playerFadeTimer = Math.max(0, playerFadeTimer - delta);
      if (playerHitEffect) {
        playerHitEffect.position.copyFrom(centerPosition);
        if (playerHitEffectMaterial) {
          playerHitEffectMaterial.emissiveColor.copyFrom(playerHitColorA);
          playerHitEffectMaterial.diffuseColor.copyFrom(playerHitColorA);
          playerHitEffectMaterial.alpha =
            playerHitEffectAlpha *
            (playerFadeTimer / playerHitFadeDurationCurrent);
        }
      }
      updateHitFadeOrbs(playerHitOrbs, delta);
      if (playerFadeTimer <= 0) {
        playerState = "brainwash-in-progress";
        if (!brainwashChoiceStarted) {
          brainwashChoiceStarted = true;
          brainwashChoiceUnlocked = true;
        }
        if (playerHitEffect) {
          playerHitEffect.dispose();
          playerHitEffect = null;
          playerHitEffectMaterial = null;
        }
        for (const orb of playerHitOrbs) {
          orb.mesh.dispose();
        }
        playerHitOrbs = [];
      }
    }
  }

};

const resetGame = () => {
  stopAllVoices();
  playerState = "normal";
  playerHitTimer = 0;
  playerFadeTimer = 0;
  playerHitById = null;
  playerHitTime = 0;
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
    for (const orb of npc.fadeOrbs) {
      orb.mesh.dispose();
    }
  }
  npcs.length = 0;
  npcs.push(...spawnNpcs(layout, spawnableCells, npcManager, npcCount));

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
  assignVoiceActors();
};

const startGame = () => {
  resetGame();
  audioManager.startBgm(bgmUrl);
  gamePhase = "playing";
  hud.setTitleVisible(false);
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

    updateBeams(layout, beams, bounds, delta, beamTrails, beamImpactOrbs);
    updatePlayerState(delta, elapsedTime);
    const npcBlockers =
      playerState === "brainwash-complete-no-gun"
        ? [{ position: camera.position, radius: playerBlockRadius, sourceId: "player" }]
        : [];
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
      npcBlockers
    );
    const playerBlockedByNpc =
      npcUpdate.playerBlocked && isAliveState(playerState);
    const canMove =
      isAliveState(playerState) ||
      playerState === "brainwash-complete-gun" ||
      playerState === "brainwash-complete-no-gun";
    const allowMove = canMove && !playerBlockedByNpc;
    if (allowMove) {
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
    }

    let npcAlive = false;
    for (const npc of npcs) {
      if (isAliveState(npc.state)) {
        npcAlive = true;
        break;
      }
    }

    if (isBrainwashState(playerState) && !npcAlive) {
      if (allDownTime === null) {
        allDownTime = elapsedTime;
      }
      if (elapsedTime - allDownTime >= allDownTransitionDelay) {
        removeCarpetFollowers();
        gameFlow.enterAssembly("move");
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

  if (gamePhase === "assemblyMove" || gamePhase === "assemblyHold") {
    gameFlow.updateAssembly(delta);
  }

  updateVoices(delta);
  gameFlow.updateFade(delta);
  audioManager.updateSpatial();
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
