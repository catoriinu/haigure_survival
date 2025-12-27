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
  collectFloorCells,
  createBeam,
  createBeamMaterial,
  createBit,
  createBitMaterials,
  createNpcManager,
  spawnBits,
  spawnNpcs,
  StageBounds,
  updateBeams,
  updateBits,
  updateNpcs
} from "./game/entities";
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
const npcCount = 9;
const npcs = spawnNpcs(layout, spawnableCells, npcManager, npcCount);

const bitMaterials = createBitMaterials(scene);
const beamMaterial = createBeamMaterial(scene);
const bits = spawnBits(scene, layout, spawnableCells, bitMaterials, 3);
const beams: Beam[] = [];

const bounds: StageBounds = {
  minX: -halfWidth,
  maxX: halfWidth,
  minZ: -halfDepth,
  maxZ: halfDepth,
  minY: 0,
  maxY: room.height
};
const alertSignal = { position: new Vector3(0, 0, 0), timer: 0 };
const bitSpawnInterval = 5;
const playerHitDuration = 3;
const playerHitFadeDuration = 1;
const playerHitRadius = playerWidth * 0.5;
const playerHitEffectDiameter = playerHeight * 1.2;
const playerHitFlickerInterval = 0.12;
const playerHitColorA = new Color3(1, 0.18, 0.74);
const playerHitColorB = new Color3(0.2, 0.96, 1);
const playerHitEffectAlpha = 0.45;

type PlayerState = "run" | "hit" | "down";
let playerState: PlayerState = "run";
let playerHitTimer = 0;
let playerFadeTimer = 0;
let playerHitById: string | null = null;
let playerHitEffect: Mesh | null = null;
let playerHitEffectMaterial: StandardMaterial | null = null;
let playerHitTime = 0;
let allDownTime: number | null = null;

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
const maxBitCount = 10;

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
    beam.mesh.dispose();
  }
  beams.length = 0;
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
  bitSpawnEnabled = false;
  clearBeams();
  assemblyElapsed = 0;
  setHudVisible(false);
  setTitleVisible(false);
  setStateInfo("press Enter to title");
  playerState = "down";
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
    npc.state = "down";
    npc.sprite.cellIndex = 2;
    npc.sprite.position.y = playerCenterHeight;
    if (npc.hitEffect) {
      npc.hitEffect.dispose();
      npc.hitEffect = null;
      npc.hitEffectMaterial = null;
    }
  }

  if (playerHitEffect) {
    playerHitEffect.dispose();
    playerHitEffect = null;
    playerHitEffectMaterial = null;
  }

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
  let aliveCount = playerState === "run" ? 1 : 0;
  for (const npc of npcs) {
    if (npc.state === "run") {
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

  retryInfo.style.display = playerState === "down" ? "block" : "none";
  if (playerState === "down") {
    const surviveText = `生存時間: ${playerHitTime.toFixed(1)}s`;
    retryInfo.textContent = `${surviveText}\npress R to retry\npress Enter to epilogue`;
  }
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

  if (playerState === "run") {
    for (const beam of beams) {
      if (!beam.active) {
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
      if (distanceSq <= playerHitRadius * playerHitRadius) {
        beam.active = false;
        beam.mesh.dispose();
        playerState = "hit";
        playerHitTimer = playerHitDuration;
        playerFadeTimer = 0;
        playerHitById = beam.sourceId;
        playerHitTime = elapsed;
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
        break;
      }
    }
  }

  if (playerState === "hit") {
    playerHitTimer -= delta;
    if (playerHitEffect) {
      playerHitEffect.position.copyFrom(centerPosition);
      if (playerHitEffectMaterial) {
        const phase =
          Math.floor(elapsed / playerHitFlickerInterval) % 2 === 0;
        const color = phase ? playerHitColorA : playerHitColorB;
        playerHitEffectMaterial.emissiveColor.copyFrom(color);
        playerHitEffectMaterial.diffuseColor.copyFrom(color);
        playerHitEffectMaterial.alpha = playerHitEffectAlpha;
      }
    }
    if (playerHitTimer <= 0) {
      playerState = "down";
      playerFadeTimer = playerHitFadeDuration;
    }
  }

  if (playerState === "down" && playerFadeTimer > 0) {
    playerFadeTimer = Math.max(0, playerFadeTimer - delta);
    if (playerHitEffect) {
      playerHitEffect.position.copyFrom(centerPosition);
    }
    if (playerHitEffectMaterial) {
      playerHitEffectMaterial.emissiveColor.copyFrom(playerHitColorA);
      playerHitEffectMaterial.diffuseColor.copyFrom(playerHitColorA);
      playerHitEffectMaterial.alpha =
        playerHitEffectAlpha * (playerFadeTimer / playerHitFadeDuration);
    }
    if (playerFadeTimer <= 0 && playerHitEffect) {
      playerHitEffect.dispose();
      playerHitEffect = null;
      playerHitEffectMaterial = null;
    }
  }

  camera.speed = playerState === "run" ? baseCameraSpeed : 0;
};

const resetGame = () => {
  playerState = "run";
  playerHitTimer = 0;
  playerFadeTimer = 0;
  playerHitById = null;
  playerHitTime = 0;
  allDownTime = null;
  assemblyElapsed = 0;
  bitSpawnEnabled = true;
  assemblyPlayerRoute = null;
  assemblyNpcRoutes = [];
  if (playerHitEffect) {
    playerHitEffect.dispose();
    playerHitEffect = null;
    playerHitEffectMaterial = null;
  }

  clearBeams();

  for (const bit of bits) {
    bit.root.dispose();
  }
  bits.length = 0;
  bits.push(...spawnBits(scene, layout, spawnableCells, bitMaterials, 1));
  bitIndex = bits.length;
  bitSpawnTimer = bitSpawnInterval;

  for (const npc of npcs) {
    npc.sprite.dispose();
    if (npc.hitEffect) {
      npc.hitEffect.dispose();
    }
  }
  npcs.length = 0;
  npcs.push(...spawnNpcs(layout, spawnableCells, npcManager, npcCount));

  alertSignal.timer = 0;
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
};

const startGame = () => {
  resetGame();
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
  gamePhase = "title";
  setTitleVisible(true);
  setHudVisible(false);
  setStateInfo(null);
  fadePhase = "none";
  fadeOpacity = 0;
  setFadeOpacity(0);
};

window.addEventListener("keydown", (event) => {
  if (event.code === "Enter") {
    if (gamePhase === "title") {
      startGame();
      return;
    }
    if (gamePhase === "playing" && playerState === "down") {
      gamePhase = "transition";
      setHudVisible(false);
      beginFadeOut(() => enterAssembly("instant"));
      return;
    }
    if (gamePhase === "assemblyHold") {
      returnToTitle();
    }
  }
});

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime() / 1000;
  if (gamePhase === "playing") {
    elapsedTime += delta;

    updateBeams(layout, beams, bounds, delta);
    updatePlayerState(delta, elapsedTime);
    updateNpcs(layout, floorCells, npcs, beams, delta, elapsedTime);

    let npcAlive = false;
    for (const npc of npcs) {
      if (npc.state !== "down") {
        npcAlive = true;
        break;
      }
    }

    if (playerState === "down" && !npcAlive) {
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
            createBit(scene, layout, spawnableCells, bitMaterials, bitIndex)
          );
          bitIndex += 1;
          bitSpawnTimer = bitSpawnInterval;
        }
      }

      const targets = [
        {
          id: "player",
          position: camera.position,
          alive: playerState === "run",
          state: playerState,
          hitById: playerHitById
        },
        ...npcs.map((npc, index) => ({
          id: `npc_${index}`,
          position: npc.sprite.position,
          alive: npc.state === "run",
          state: npc.state,
          hitById: npc.hitById
        }))
      ];
      updateBits(
        layout,
        bits,
        delta,
        elapsedTime,
        targets,
        bounds,
        alertSignal,
        (pos, dir, sourceId) => {
          beams.push(createBeam(scene, pos, dir, beamMaterial, sourceId));
        }
      );
    }
  }

  if (gamePhase === "assemblyMove" || gamePhase === "assemblyHold") {
    updateAssembly(delta);
  }

  updateFade(delta);
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
