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
  MeshBuilder,
  StandardMaterial
} from "@babylonjs/core";
import {
  Beam,
  BeamImpactOrb,
  BeamTrail,
  Bit,
  BitSoundEvents,
  CharacterState,
  collectFloorCells,
  createBeam,
  createBitAt,
  createBeamImpactOrbs,
  createBeamMaterial,
  createBit,
  createBitMaterials,
  createNpcManager,
  isAliveState,
  isBrainwashState,
  isHitState,
  spawnNpcs,
  StageBounds,
  updateBeams,
  updateBits,
  updateNpcs
} from "./game/entities";
import { createAudioManager, SpatialHandle, SpatialPlayOptions } from "./audio/audio";
import {
  createVoiceActor,
  stopVoiceActor,
  updateVoiceActor,
  voiceProfiles,
  VoiceActor
} from "./audio/voice";
import { createGridLayout } from "./world/grid";
import { createStageFromGrid } from "./world/stage";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const layout = createGridLayout();
const room = {
  width: layout.columns * layout.cellSize,
  depth: layout.rows * layout.cellSize,
  height: layout.height
};
const playerWidth = 2.2;
const playerHeight = 3.3;
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
const assemblyRoom = {
  startCol: 8,
  startRow: 8,
  width: 4,
  height: 4
};
const assemblyMaxColumns = 5;
const assemblySpacingX = 6;
const assemblySpacingZ = 4;
const assemblyCenter = new Vector3(
  -halfWidth +
    layout.cellSize * (assemblyRoom.startCol + assemblyRoom.width / 2),
  playerCenterHeight,
  -halfDepth +
    layout.cellSize * (assemblyRoom.startRow + assemblyRoom.height / 2)
);
const createAssemblyTargets = (totalCount: number) => {
  const columns = Math.min(assemblyMaxColumns, totalCount);
  const rows = Math.ceil(totalCount / columns);
  const totalWidth = (columns - 1) * assemblySpacingX;
  const totalDepth = (rows - 1) * assemblySpacingZ;
  const slots: Vector3[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      if (slots.length >= totalCount) {
        break;
      }
      slots.push(
        new Vector3(
          assemblyCenter.x - totalWidth / 2 + col * assemblySpacingX,
          playerCenterHeight,
          assemblyCenter.z - totalDepth / 2 + row * assemblySpacingZ
        )
      );
    }
  }

  const playerIndex = Math.floor((columns - 1) / 2);
  const playerTarget = slots[playerIndex];
  const npcTargets = slots.filter((_, index) => index !== playerIndex);
  return { playerTarget, npcTargets };
};
let assemblyPlayerTarget = assemblyCenter.clone();
let assemblyNpcTargets: Vector3[] = [];

const camera = new FreeCamera(
  "camera",
  spawnPosition,
  scene
);
camera.setTarget(spawnPosition.add(spawnForward));
camera.attachControl(canvas, true);
const baseCameraSpeed = 0.25;
camera.speed = baseCameraSpeed;
camera.angularSensibility = 1500;
camera.keysUp = [87];
camera.keysDown = [83];
camera.keysLeft = [65];
camera.keysRight = [68];
camera.checkCollisions = true;
camera.ellipsoid = new Vector3(0.5, playerHeight * 0.4, 0.5);

canvas.addEventListener("click", () => {
  canvas.requestPointerLock();
});

const audioManager = createAudioManager(camera);
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
  maxDistance: 45,
  loop: false
};
const alertLoopOptions: SpatialPlayOptions = {
  volume: 0.95,
  maxDistance: 45,
  loop: true
};
const beamSeOptions: SpatialPlayOptions = {
  volume: 0.8,
  maxDistance: 60,
  loop: false
};
const hitSeOptions: SpatialPlayOptions = {
  volume: 1,
  maxDistance: 65,
  loop: false
};
const voiceBaseOptions: SpatialPlayOptions = {
  volume: 0.72,
  maxDistance: 50,
  loop: false
};
const voiceLoopOptions: SpatialPlayOptions = {
  volume: 0.72,
  maxDistance: 50,
  loop: true
};
const beamSeFarDistance = 28;
const beamSeMidDistance = 16;

const pickVariantByDistance = (distance: number, variants: string[]) => {
  if (distance >= beamSeFarDistance) {
    return variants[0];
  }
  if (distance >= beamSeMidDistance) {
    return variants[1];
  }
  return variants[2];
};

const pickRandomVariant = (variants: string[]) =>
  variants[Math.floor(Math.random() * variants.length)];

const createHitFadeOrbs = (
  center: Vector3,
  material: StandardMaterial,
  effectRadius: number
) => {
  const count =
    playerHitOrbMinCount +
    Math.floor(
      Math.random() * (playerHitOrbMaxCount - playerHitOrbMinCount + 1)
    );
  const orbs: HitFadeOrb[] = [];

  for (let index = 0; index < count; index += 1) {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const base = Math.sqrt(1 - u * u);
    const direction = new Vector3(
      base * Math.cos(theta),
      u,
      base * Math.sin(theta)
    );
    const offset =
      playerHitOrbSurfaceOffsetMin +
      Math.random() *
        (playerHitOrbSurfaceOffsetMax - playerHitOrbSurfaceOffsetMin);
    const position = center.add(direction.scale(effectRadius + offset));
    const orb = MeshBuilder.CreateSphere(
      "playerHitOrb",
      { diameter: playerHitOrbDiameter, segments: 10 },
      scene
    );
    orb.material = material;
    orb.isPickable = false;
    orb.position.copyFrom(position);
    const speed =
      playerHitOrbSpeedMin +
      Math.random() * (playerHitOrbSpeedMax - playerHitOrbSpeedMin);
    const velocity = direction.scale(speed);
    orbs.push({ mesh: orb, velocity });
  }

  return orbs;
};

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
    audioManager.playSe(bitSeMove, () => bit.root.position, seBaseOptions);
  },
  onAlert: (bit) => {
    startAlertLoop(bit);
  },
  onTargetPlayer: (bit) => {
    audioManager.playSe(bitSeTarget, () => bit.root.position, seBaseOptions);
  },
  onBeamFire: (bit, targetingPlayer) => {
    const distance = Vector3.Distance(camera.position, bit.root.position);
    const variants = targetingPlayer ? bitSeBeamTarget : bitSeBeamNonTarget;
    const file = pickVariantByDistance(distance, variants);
    audioManager.playSe(file, () => bit.root.position, beamSeOptions);
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
  alertSeHandle = audioManager.playSe(
    bitSeAlert,
    () => bit.root.position,
    alertLoopOptions
  );
};

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
  gridSpacingWorld: 2,
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
const playerHitEffectDiameter = playerHeight * 1.2;
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

type HitFadeOrb = {
  mesh: Mesh;
  velocity: Vector3;
};
const playerBlockRadius = playerWidth * 0.5 + 1.1;

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
let brainwashChoiceTimer = 0;
let brainwashChoiceUnlocked = false;

type GamePhase =
  | "title"
  | "playing"
  | "transition"
  | "assemblyMove"
  | "assemblyHold";
let gamePhase: GamePhase = "title";
const allDownTransitionDelay = 3;
const assemblyMoveSpeed = 3.2;
const assemblyArriveDistance = 0.2;
const assemblyOrbitRadius = 12;
const assemblyOrbitSpeed = 0.7;
const assemblyOrbitHeight = 4;
let assemblyElapsed = 0;
let bitSpawnEnabled = true;
const fadeDuration = 0.8;
let fadeOpacity = 0;
let fadePhase: "none" | "out" | "in" = "none";
let fadeNext: (() => void) | null = null;

let elapsedTime = 0;
let bitSpawnTimer = bitSpawnInterval;
let bitIndex = bits.length;
const maxBitCount = 25;

const minimapCanvas = document.getElementById(
  "minimapCanvas"
) as HTMLCanvasElement;
const minimapInfo = document.getElementById(
  "minimapInfo"
) as HTMLDivElement;
const timeInfo = document.getElementById("timeInfo") as HTMLDivElement;
const aliveInfo = document.getElementById("aliveInfo") as HTMLDivElement;
const retryInfo = document.getElementById("retryInfo") as HTMLDivElement;
const titleScreen = document.getElementById("titleScreen") as HTMLDivElement;
const stateInfo = document.getElementById("stateInfo") as HTMLDivElement;
const fadeOverlay = document.getElementById("fadeOverlay") as HTMLDivElement;
const crosshair = document.getElementById("crosshair") as HTMLDivElement;
const minimapContext = minimapCanvas.getContext(
  "2d"
) as CanvasRenderingContext2D;
const minimap = {
  cells: 11,
  cellPixels: 12,
  fanRadius: 30,
  fanHalfAngle: Math.PI / 7
};
const minimapSize = minimap.cells * minimap.cellPixels;
minimapCanvas.width = minimapSize;
minimapCanvas.height = minimapSize;

const setHudVisible = (visible: boolean) => {
  const display = visible ? "block" : "none";
  minimapCanvas.style.display = display;
  minimapInfo.style.display = display;
  timeInfo.style.display = display;
  aliveInfo.style.display = display;
  retryInfo.style.display = "none";
  crosshair.style.display = "none";
};

const setTitleVisible = (visible: boolean) => {
  titleScreen.style.display = visible ? "flex" : "none";
};

const setStateInfo = (text: string | null) => {
  if (text) {
    stateInfo.textContent = text;
    stateInfo.style.display = "block";
  } else {
    stateInfo.textContent = "";
    stateInfo.style.display = "none";
  }
};

const setFadeOpacity = (value: number) => {
  fadeOverlay.style.opacity = value.toFixed(2);
};

type GridCell = {
  row: number;
  col: number;
};

const cellToWorld = (cell: GridCell, y: number) =>
  new Vector3(
    -halfWidth + layout.cellSize / 2 + cell.col * layout.cellSize,
    y,
    -halfDepth + layout.cellSize / 2 + cell.row * layout.cellSize
  );

const worldToCell = (position: Vector3): GridCell => ({
  row: Math.floor((position.z + halfDepth) / layout.cellSize),
  col: Math.floor((position.x + halfWidth) / layout.cellSize)
});

const buildShortestPath = (start: GridCell, goal: GridCell) => {
  const visited = Array.from({ length: layout.rows }, () =>
    Array.from({ length: layout.columns }, () => false)
  );
  const prevRow = Array.from({ length: layout.rows }, () =>
    Array.from({ length: layout.columns }, () => -1)
  );
  const prevCol = Array.from({ length: layout.rows }, () =>
    Array.from({ length: layout.columns }, () => -1)
  );
  const queueRow: number[] = [];
  const queueCol: number[] = [];
  let head = 0;

  visited[start.row][start.col] = true;
  queueRow.push(start.row);
  queueCol.push(start.col);

  while (head < queueRow.length) {
    const row = queueRow[head];
    const col = queueCol[head];
    head += 1;
    if (row === goal.row && col === goal.col) {
      break;
    }

    const neighbors = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 }
    ];
    for (const neighbor of neighbors) {
      if (
        neighbor.row < 0 ||
        neighbor.row >= layout.rows ||
        neighbor.col < 0 ||
        neighbor.col >= layout.columns
      ) {
        continue;
      }
      if (layout.cells[neighbor.row][neighbor.col] !== "floor") {
        continue;
      }
      if (visited[neighbor.row][neighbor.col]) {
        continue;
      }
      visited[neighbor.row][neighbor.col] = true;
      prevRow[neighbor.row][neighbor.col] = row;
      prevCol[neighbor.row][neighbor.col] = col;
      queueRow.push(neighbor.row);
      queueCol.push(neighbor.col);
    }
  }

  const path: GridCell[] = [];
  let row = goal.row;
  let col = goal.col;
  path.push({ row, col });
  while (row !== start.row || col !== start.col) {
    const prevR = prevRow[row][col];
    const prevC = prevCol[row][col];
    row = prevR;
    col = prevC;
    path.push({ row, col });
  }
  path.reverse();
  return path;
};

type AssemblyRoute = {
  waypoints: Vector3[];
  index: number;
};

let assemblyPlayerRoute: AssemblyRoute | null = null;
let assemblyNpcRoutes: AssemblyRoute[] = [];

const buildAssemblyRoute = (start: Vector3, goal: Vector3): AssemblyRoute => {
  const startCell = worldToCell(start);
  const goalCell = worldToCell(goal);
  const cellPath = buildShortestPath(startCell, goalCell);
  const waypoints: Vector3[] = [
    new Vector3(start.x, playerCenterHeight, start.z)
  ];
  for (let index = 1; index < cellPath.length; index += 1) {
    waypoints.push(cellToWorld(cellPath[index], playerCenterHeight));
  }
  waypoints.push(new Vector3(goal.x, playerCenterHeight, goal.z));
  return { waypoints, index: 0 };
};

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

const moveSpriteToTarget = (
  sprite: Sprite,
  target: Vector3,
  speed: number,
  delta: number
) => {
  const toTarget = target.subtract(sprite.position);
  toTarget.y = 0;
  const distance = Math.hypot(toTarget.x, toTarget.z);
  if (distance <= assemblyArriveDistance) {
    sprite.position.x = target.x;
    sprite.position.y = target.y;
    sprite.position.z = target.z;
    return true;
  }
  const step = Math.min(distance, speed * delta);
  sprite.position.x += (toTarget.x / distance) * step;
  sprite.position.z += (toTarget.z / distance) * step;
  sprite.position.y = target.y;
  return false;
};

const moveSpriteAlongRoute = (
  sprite: Sprite,
  route: AssemblyRoute,
  speed: number,
  delta: number
) => {
  while (route.index < route.waypoints.length) {
    const arrived = moveSpriteToTarget(
      sprite,
      route.waypoints[route.index],
      speed,
      delta
    );
    if (!arrived) {
      return false;
    }
    route.index += 1;
  }
  return true;
};

const updateBitsOrbit = (delta: number) => {
  if (bits.length === 0) {
    return;
  }
  assemblyElapsed += delta;
  const angleStep = (Math.PI * 2) / bits.length;
  const bobSpeed = 1.2;
  for (let index = 0; index < bits.length; index += 1) {
    const bit = bits[index];
    const angle = assemblyElapsed * assemblyOrbitSpeed + angleStep * index;
    const x = assemblyCenter.x + Math.cos(angle) * assemblyOrbitRadius;
    const z = assemblyCenter.z + Math.sin(angle) * assemblyOrbitRadius;
    const bob = Math.sin(assemblyElapsed * bobSpeed + bit.floatOffset) * 0.4;
    bit.root.position.x = x;
    bit.root.position.y = assemblyOrbitHeight + bob;
    bit.root.position.z = z;
    bit.baseHeight = assemblyOrbitHeight;
    bit.root.lookAt(assemblyCenter);
  }
};

const enterAssembly = (mode: "move" | "instant") => {
  stopAlertLoop();
  bitSpawnEnabled = false;
  clearBeams();
  assemblyElapsed = 0;
  setHudVisible(false);
  setTitleVisible(false);
  setStateInfo("press Enter to title");
  playerState = "brainwash-complete-haigure-formation";
  const playerStartPosition = new Vector3(
    camera.position.x,
    playerCenterHeight,
    camera.position.z
  );
  playerAvatar.isVisible = true;
  playerAvatar.cellIndex = 2;
  playerAvatar.position.copyFrom(playerStartPosition);

  const assemblyTargets = createAssemblyTargets(npcs.length + 1);
  assemblyPlayerTarget = assemblyTargets.playerTarget;
  assemblyNpcTargets = assemblyTargets.npcTargets;

  for (const npc of npcs) {
    npc.state = "brainwash-complete-haigure-formation";
    npc.sprite.cellIndex = 2;
    npc.sprite.position.y = playerCenterHeight;
    if (npc.hitEffect) {
      npc.hitEffect.dispose();
      npc.hitEffect = null;
      npc.hitEffectMaterial = null;
    }
    for (const orb of npc.fadeOrbs) {
      orb.mesh.dispose();
    }
    npc.fadeOrbs = [];
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

  if (mode === "instant") {
    assemblyPlayerRoute = null;
    assemblyNpcRoutes = [];
    playerAvatar.position.copyFrom(assemblyPlayerTarget);
    for (let index = 0; index < npcs.length; index += 1) {
      npcs[index].sprite.position.copyFrom(assemblyNpcTargets[index]);
    }
    gamePhase = "assemblyHold";
    return;
  }

  assemblyPlayerRoute = buildAssemblyRoute(
    playerAvatar.position,
    assemblyPlayerTarget
  );
  assemblyNpcRoutes = npcs.map((npc, index) =>
    buildAssemblyRoute(npc.sprite.position, assemblyNpcTargets[index])
  );
  gamePhase = "assemblyMove";
};

const updateAssembly = (delta: number) => {
  updateBitsOrbit(delta);
  camera.position.x = playerAvatar.position.x;
  camera.position.z = playerAvatar.position.z;
  camera.position.y = eyeHeight;
  if (gamePhase !== "assemblyMove") {
    return;
  }
  const playerRoute = assemblyPlayerRoute!;
  let allArrived = moveSpriteAlongRoute(
    playerAvatar,
    playerRoute,
    assemblyMoveSpeed,
    delta
  );
  for (let index = 0; index < npcs.length; index += 1) {
    const npcRoute = assemblyNpcRoutes[index];
    const arrived = moveSpriteAlongRoute(
      npcs[index].sprite,
      npcRoute,
      assemblyMoveSpeed,
      delta
    );
    allArrived = allArrived && arrived;
  }
  if (allArrived) {
    gamePhase = "assemblyHold";
  }
};

const beginFadeOut = (next: () => void) => {
  fadePhase = "out";
  fadeOpacity = 0;
  fadeNext = next;
  setFadeOpacity(fadeOpacity);
};

const updateFade = (delta: number) => {
  if (fadePhase === "none") {
    return;
  }
  const step = delta / fadeDuration;
  if (fadePhase === "out") {
    fadeOpacity = Math.min(1, fadeOpacity + step);
    setFadeOpacity(fadeOpacity);
    if (fadeOpacity >= 1) {
      if (fadeNext) {
        const next = fadeNext;
        fadeNext = null;
        next();
      }
      fadePhase = "in";
    }
    return;
  }
  fadeOpacity = Math.max(0, fadeOpacity - step);
  setFadeOpacity(fadeOpacity);
  if (fadeOpacity <= 0) {
    fadePhase = "none";
  }
};

setHudVisible(false);
setTitleVisible(true);
setStateInfo(null);
setFadeOpacity(0);

const drawMinimap = () => {
  if (gamePhase !== "playing") {
    return;
  }
  const halfCells = Math.floor(minimap.cells / 2);
  const centerCol = Math.floor(
    (camera.position.x + halfWidth) / layout.cellSize
  );
  const centerRow = Math.floor(
    (camera.position.z + halfDepth) / layout.cellSize
  );
  const infoX = Math.round(camera.position.x * 10) / 10;
  const infoZ = Math.round(camera.position.z * 10) / 10;
  minimapInfo.textContent = `X:${infoX}  Z:${infoZ}\nCell:${centerRow},${centerCol}`;
  timeInfo.textContent = `Time: ${elapsedTime.toFixed(1)}s`;
  let aliveCount = isAliveState(playerState) ? 1 : 0;
  for (const npc of npcs) {
    if (isAliveState(npc.state)) {
      aliveCount += 1;
    }
  }
  aliveInfo.textContent = `Alive: ${aliveCount}`;

  minimapContext.clearRect(0, 0, minimapSize, minimapSize);

  const forward = camera.getDirection(new Vector3(0, 0, 1));
  const theta = Math.atan2(forward.z, forward.x);
  const rotation = -Math.PI / 2 - theta;
  const centerX = halfCells * minimap.cellPixels + minimap.cellPixels / 2;
  const centerY = halfCells * minimap.cellPixels + minimap.cellPixels / 2;

  minimapContext.save();
  minimapContext.translate(centerX, centerY);
  minimapContext.rotate(rotation);
  minimapContext.translate(-centerX, -centerY);

  for (let rowOffset = -halfCells; rowOffset <= halfCells; rowOffset += 1) {
    for (let colOffset = -halfCells; colOffset <= halfCells; colOffset += 1) {
      const row = centerRow + rowOffset;
      const col = centerCol + colOffset;
      const isFloor =
        row >= 0 &&
        row < layout.rows &&
        col >= 0 &&
        col < layout.columns &&
        layout.cells[row][col] === "floor";

      minimapContext.fillStyle = isFloor ? "#a57bc4" : "#1b1b1b";
      minimapContext.fillRect(
        (colOffset + halfCells) * minimap.cellPixels,
        (halfCells - rowOffset) * minimap.cellPixels,
        minimap.cellPixels,
        minimap.cellPixels
      );
    }
  }

  minimapContext.restore();

  const angle = -Math.PI / 2;
  minimapContext.beginPath();
  minimapContext.moveTo(centerX, centerY);
  minimapContext.arc(
    centerX,
    centerY,
    minimap.fanRadius,
    angle - minimap.fanHalfAngle,
    angle + minimap.fanHalfAngle
  );
  minimapContext.closePath();
  minimapContext.fillStyle = "rgba(245, 245, 245, 0.25)";
  minimapContext.fill();
  minimapContext.strokeStyle = "rgba(20, 20, 20, 0.6)";
  minimapContext.lineWidth = 1;
  minimapContext.stroke();

  const markerSize = Math.max(4, Math.floor(minimap.cellPixels * 0.4));
  const markerOffset = (minimap.cellPixels - markerSize) / 2;
  minimapContext.fillStyle = "#f5f5f5";
  minimapContext.fillRect(
    halfCells * minimap.cellPixels + markerOffset,
    halfCells * minimap.cellPixels + markerOffset,
    markerSize,
    markerSize
  );

  minimapContext.strokeStyle = "#000000";
  minimapContext.lineWidth = 2;
  minimapContext.strokeRect(0, 0, minimapSize, minimapSize);

  retryInfo.style.display = brainwashChoiceStarted ? "block" : "none";
  if (brainwashChoiceStarted) {
    const surviveText = `生存時間: ${playerHitTime.toFixed(1)}s`;
    let promptText = `${surviveText}\npress R to retry\npress Enter to epilogue`;
    if (brainwashChoiceUnlocked) {
      promptText +=
        "\npress G to move with gun\npress N to move without gun\npress H to haigure";
    }
    retryInfo.textContent = promptText;
  }

  crosshair.style.display =
    playerState === "brainwash-complete-gun" ? "block" : "none";
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
      const direction = Vector3.Normalize(beam.velocity);
      const halfLength = beam.length / 2;
      const toPlayer = centerPosition.subtract(beam.mesh.position);
      const projection =
        toPlayer.x * direction.x +
        toPlayer.y * direction.y +
        toPlayer.z * direction.z;
      const clamped = Math.max(-halfLength, Math.min(halfLength, projection));
      const closest = beam.mesh.position.add(direction.scale(clamped));
      const distanceSq = Vector3.DistanceSquared(centerPosition, closest);
      const tipPosition = beam.tip.getAbsolutePosition();
      const tipRadius = playerHitRadius + beam.tipRadius;
      const tipDistanceSq = Vector3.DistanceSquared(
        centerPosition,
        tipPosition
      );
      if (
        distanceSq <= playerHitRadius * playerHitRadius ||
        tipDistanceSq <= tipRadius * tipRadius
      ) {
        const hitScale = isRedBitSource(beam.sourceId)
          ? redHitDurationScale
          : 1;
        beam.active = false;
        beam.tip.dispose();
        beam.mesh.dispose();
        playerState = "hit-a";
        playerHitTimer = playerHitDuration * hitScale;
        playerFadeTimer = 0;
        playerHitById = beam.sourceId;
        playerHitTime = elapsed;
        playerHitFadeDurationCurrent = playerHitFadeDuration * hitScale;
        const effect = MeshBuilder.CreateSphere(
          "playerHitEffect",
          {
            diameter: playerHitEffectDiameter,
            segments: 18,
            sideOrientation: Mesh.DOUBLESIDE
          },
          scene
        );
        effect.isPickable = false;
        const material = new StandardMaterial("playerHitMaterial", scene);
        material.alpha = playerHitEffectAlpha;
        material.emissiveColor = playerHitColorA.clone();
        material.diffuseColor = playerHitColorA.clone();
        material.backFaceCulling = false;
        effect.material = material;
        effect.position.copyFrom(centerPosition);
        playerHitEffect = effect;
        playerHitEffectMaterial = material;
        const hitSe = pickRandomVariant(hitSeVariants);
        const hitPosition = centerPosition.clone();
        audioManager.playSe(hitSe, () => hitPosition, hitSeOptions);
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
          centerPosition.clone(),
          playerHitEffectMaterial!,
          playerHitEffectDiameter / 2
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
      for (const orb of playerHitOrbs) {
        orb.mesh.position.addInPlace(orb.velocity.scale(delta));
      }
      if (playerFadeTimer <= 0) {
        playerState = "brainwash-in-progress";
        if (!brainwashChoiceStarted) {
          brainwashChoiceStarted = true;
          brainwashChoiceTimer = 0;
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
  brainwashChoiceTimer = 0;
  brainwashChoiceUnlocked = false;
  allDownTime = null;
  assemblyElapsed = 0;
  bitSpawnEnabled = true;
  assemblyPlayerRoute = null;
  assemblyNpcRoutes = [];
  stopAlertLoop();
  if (playerHitEffect) {
    playerHitEffect.dispose();
    playerHitEffect = null;
    playerHitEffectMaterial = null;
  }
  for (const orb of playerHitOrbs) {
    orb.mesh.dispose();
  }
  playerHitOrbs = [];

  clearBeams();

  for (const bit of bits) {
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
  setTitleVisible(false);
  setHudVisible(true);
  setStateInfo(null);
  fadePhase = "none";
  fadeOpacity = 0;
  setFadeOpacity(0);
  canvas.requestPointerLock();
};

const returnToTitle = () => {
  resetGame();
  audioManager.stopBgm();
  gamePhase = "title";
  setTitleVisible(true);
  setHudVisible(false);
  setStateInfo(null);
  fadePhase = "none";
  fadeOpacity = 0;
  setFadeOpacity(0);
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

window.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    if (gamePhase === "playing" && isBrainwashState(playerState)) {
      gamePhase = "transition";
      setHudVisible(false);
      beginFadeOut(() => enterAssembly("instant"));
      return;
    }
    if (gamePhase === "assemblyMove" || gamePhase === "assemblyHold") {
      returnToTitle();
    }
  }

  if (event.code === "KeyR") {
    if (gamePhase === "playing" && brainwashChoiceStarted) {
      startGame();
    }
  }

  if (gamePhase === "playing" && brainwashChoiceUnlocked) {
    if (event.code === "KeyG") {
      playerState = "brainwash-complete-gun";
      return;
    }
    if (event.code === "KeyN") {
      playerState = "brainwash-complete-no-gun";
      return;
    }
    if (event.code === "KeyH") {
      playerState = "brainwash-complete-haigure";
    }
  }
});

window.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }
  if (gamePhase === "title") {
    startGame();
    return;
  }
  if (gamePhase !== "playing") {
    return;
  }
  if (playerState !== "brainwash-complete-gun") {
    return;
  }
  const ray = camera.getForwardRay();
  const direction = ray.direction.normalize();
  if (direction.length() < 0.001) {
    return;
  }
  const origin = ray.origin.add(direction.scale(1.2));
  beams.push(createBeam(scene, origin, direction, beamMaterial, "player"));
  const beamSe = pickRandomVariant(bitSeBeamNonTarget);
  const firePosition = origin.clone();
  audioManager.playSe(beamSe, () => firePosition, beamSeOptions);
});

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime() / 1000;
  if (gamePhase === "playing") {
    elapsedTime += delta;

    if (brainwashChoiceStarted && !brainwashChoiceUnlocked) {
      brainwashChoiceTimer += delta;
      if (brainwashChoiceTimer >= 10) {
        brainwashChoiceUnlocked = true;
      }
    }

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
        const hitSe = pickRandomVariant(hitSeVariants);
        audioManager.playSe(hitSe, () => position, hitSeOptions);
      },
      (position, direction, sourceId) => {
        beams.push(createBeam(scene, position, direction, beamMaterial, sourceId));
        const beamSe = pickRandomVariant(bitSeBeamNonTarget);
        audioManager.playSe(beamSe, () => position, beamSeOptions);
      },
      isRedBitSource,
      beamImpactOrbs,
      npcBlockers
    );
    const playerBlockedByNpc = npcUpdate.playerBlocked;
    const canMove =
      isAliveState(playerState) ||
      playerState === "brainwash-complete-gun" ||
      playerState === "brainwash-complete-no-gun";
    camera.speed =
      canMove && !playerBlockedByNpc ? baseCameraSpeed : 0;

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
        enterAssembly("move");
      }
    }

    if (gamePhase === "playing") {
      if (bitSpawnEnabled) {
        bitSpawnTimer -= delta;
        if (bitSpawnTimer <= 0 && bits.length < maxBitCount) {
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
      let carpetSpawned = 0;
      const spawnCarpetBit = (position: Vector3, direction: Vector3) => {
        if (bits.length + carpetSpawned >= maxBitCount) {
          return null;
        }
        const bit = createSpawnedBitAt(bitIndex, position, direction);
        bitIndex += 1;
        carpetSpawned += 1;
        return bit;
      };
      updateBits(
        layout,
        bits,
        delta,
        elapsedTime,
        targets,
        bounds,
        alertSignal,
        npcUpdate.alertRequests,
        spawnCarpetBit,
        (pos, dir, sourceId) => {
          beams.push(createBeam(scene, pos, dir, beamMaterial, sourceId));
        },
        bitSoundEvents
      );
      const alertLeaderId = alertSignal.leaderId;
      if (!alertLeaderId) {
        stopAlertLoop();
      } else if (
        alertSeLeaderId !== alertLeaderId ||
        !alertSeHandle?.isActive()
      ) {
        const leader = bits.find((bit) => bit.id === alertLeaderId) ?? null;
        if (leader) {
          startAlertLoop(leader);
        } else {
          stopAlertLoop();
        }
      }

      const targetedIds = new Set<string>();
      for (const bit of bits) {
        if (bit.targetId) {
          targetedIds.add(bit.targetId);
        }
      }
      if (isAliveState(playerState)) {
        playerState = targetedIds.has("player") ? "evade" : "normal";
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
    updateAssembly(delta);
  }

  updateVoices(delta);
  updateFade(delta);
  audioManager.updateSpatial();
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
