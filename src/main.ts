import "./style.css";
import {
  Engine,
  Scene,
  FreeCamera,
  Vector3,
  HemisphericLight,
  Color3,
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

const drawMinimap = () => {
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
  timeInfo.style.display = allDownTime === null ? "block" : "none";
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
    if (allDownTime !== null) {
      retryInfo.textContent = `${surviveText}\n全滅時間: ${allDownTime.toFixed(
        1
      )}s\npress R to retry\npress Esc to title`;
    } else {
      retryInfo.textContent = `${surviveText}\npress R to retry`;
    }
  }
};

scene.onBeforeRenderObservable.add(() => {
  camera.position.y = eyeHeight;
  drawMinimap();
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
  if (playerHitEffect) {
    playerHitEffect.dispose();
    playerHitEffect = null;
    playerHitEffectMaterial = null;
  }

  for (const beam of beams) {
    beam.mesh.dispose();
  }
  beams.length = 0;

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
};

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR" && playerState === "down") {
    resetGame();
    return;
  }
  if (event.code === "Escape" && allDownTime !== null) {
    resetGame();
  }
});

engine.runRenderLoop(() => {
  const delta = engine.getDeltaTime() / 1000;
  elapsedTime += delta;

  updateBeams(layout, beams, bounds, delta);
  updatePlayerState(delta, elapsedTime);
  updateNpcs(layout, floorCells, npcs, beams, delta, elapsedTime);
  if (allDownTime === null) {
    let npcAlive = false;
    for (const npc of npcs) {
      if (npc.state !== "down") {
        npcAlive = true;
        break;
      }
    }
    if (playerState === "down" && !npcAlive) {
      allDownTime = elapsedTime;
    }
  }

  bitSpawnTimer -= delta;
  if (bitSpawnTimer <= 0 && bits.length < maxBitCount) {
    bits.push(createBit(scene, layout, spawnableCells, bitMaterials, bitIndex));
    bitIndex += 1;
    bitSpawnTimer = bitSpawnInterval;
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
  updateBits(layout, bits, delta, elapsedTime, targets, bounds, alertSignal, (pos, dir, sourceId) => {
    beams.push(createBeam(scene, pos, dir, beamMaterial, sourceId));
  });
  scene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
