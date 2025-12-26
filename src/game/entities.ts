import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  Sprite,
  SpriteManager,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import { GridLayout } from "../world/grid";

export type FloorCell = {
  row: number;
  col: number;
};

export type NpcState = "run" | "hit" | "down";

export type Npc = {
  sprite: Sprite;
  state: NpcState;
  cell: FloorCell;
  target: Vector3;
  speed: number;
  hitTimer: number;
  fadeTimer: number;
  hitById: string | null;
  hitEffect: Mesh | null;
  hitEffectMaterial: StandardMaterial | null;
};

export type BitMode =
  | "search"
  | "attack-chase"
  | "attack-fixed"
  | "attack-random"
  | "alert"
  | "hold";

export type Bit = {
  id: string;
  root: TransformNode;
  muzzle: Mesh;
  mode: BitMode;
  targetId: string | null;
  lockedDirection: Vector3;
  holdDirection: Vector3;
  modeTimer: number;
  speed: number;
  wanderDirection: Vector3;
  wanderTimer: number;
  fireTimer: number;
  fireInterval: number;
  floatOffset: number;
  baseHeight: number;
};

export type Beam = {
  mesh: Mesh;
  velocity: Vector3;
  length: number;
  active: boolean;
  sourceId: string | null;
};

export type TargetInfo = {
  id: string;
  position: Vector3;
  alive: boolean;
  state: NpcState;
  hitById: string | null;
};

export type AlertSignal = {
  position: Vector3;
  timer: number;
};

export type BitMaterials = {
  body: StandardMaterial;
  nozzle: StandardMaterial;
};

export type StageBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
};

const npcCellSize = 128;
const npcFrameCount = 3;
const npcSpriteWidth = 2.2;
const npcSpriteHeight = 3.3;
const npcSpriteCenterHeight = npcSpriteHeight / 2;
const bitVisionRange = 48;
const bitVisionCos = Math.cos(Math.PI / 2.5);
const bitChaseFireRange = 10;
const bitChaseLoseRange = 20;
const bitFixedLoseRange = 24;
const bitChaseDuration = 10;
const bitFixedDuration = 10;
const bitAlertDuration = 3;
const bitRandomDuration = 10;
const bitAlertListenRange = 22;
const npcHitDuration = 3;
const npcHitFadeDuration = 1;
const npcHitRadius = npcSpriteWidth * 0.5;
const npcHitEffectDiameter = npcSpriteHeight * 1.2;
const npcHitFlickerInterval = 0.12;
const npcHitColorA = new Color3(1, 0.18, 0.74);
const npcHitColorB = new Color3(0.2, 0.96, 1);
const npcHitEffectAlpha = 0.45;

const createNpcSpritesheet = () => {
  const canvas = document.createElement("canvas");
  canvas.width = npcCellSize * npcFrameCount;
  canvas.height = npcCellSize;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const drawFrame = (index: number, color: string, accent: string) => {
    const offsetX = index * npcCellSize;
    ctx.fillStyle = color;
    ctx.fillRect(offsetX, 0, npcCellSize, npcCellSize);
    ctx.fillStyle = accent;
    ctx.fillRect(offsetX + 24, 22, 80, 84);
    ctx.fillStyle = "#111111";
    ctx.fillRect(offsetX + 42, 44, 12, 12);
    ctx.fillRect(offsetX + 74, 44, 12, 12);
  };

  drawFrame(0, "#3b5fbf", "#f1f1f1");
  drawFrame(1, "#d4a21f", "#f8f2c2");
  drawFrame(2, "#5c5c5c", "#c7c7c7");

  return canvas.toDataURL("image/png");
};

export const collectFloorCells = (layout: GridLayout): FloorCell[] => {
  const cells: FloorCell[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.columns; col += 1) {
      if (layout.cells[row][col] === "floor") {
        cells.push({ row, col });
      }
    }
  }
  return cells;
};

const cellToWorld = (layout: GridLayout, cell: FloorCell, y: number) => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  return new Vector3(
    -halfWidth + layout.cellSize / 2 + cell.col * layout.cellSize,
    y,
    -halfDepth + layout.cellSize / 2 + cell.row * layout.cellSize
  );
};

const getNeighborCells = (layout: GridLayout, cell: FloorCell) => {
  const neighbors: FloorCell[] = [];
  const candidates = [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 }
  ];

  for (const candidate of candidates) {
    if (
      candidate.row >= 0 &&
      candidate.row < layout.rows &&
      candidate.col >= 0 &&
      candidate.col < layout.columns &&
      layout.cells[candidate.row][candidate.col] === "floor"
    ) {
      neighbors.push(candidate);
    }
  }

  return neighbors;
};

const pickRandomCell = (cells: FloorCell[]) =>
  cells[Math.floor(Math.random() * cells.length)];

const getNearestTarget = (position: Vector3, targets: TargetInfo[]) => {
  let best = targets[0];
  let bestDistanceSq = Vector3.DistanceSquared(position, best.position);

  for (let index = 1; index < targets.length; index += 1) {
    const distanceSq = Vector3.DistanceSquared(
      position,
      targets[index].position
    );
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      best = targets[index];
    }
  }

  return { target: best, distanceSq: bestDistanceSq };
};

const findTargetById = (targets: TargetInfo[], id: string | null) =>
  id ? targets.find((target) => target.id === id) ?? null : null;

const findVisibleTarget = (bit: Bit, targets: TargetInfo[]) => {
  const forward = bit.root.getDirection(new Vector3(0, 0, 1));
  let bestTarget: TargetInfo | null = null;
  let bestDistanceSq = 0;
  const rangeSq = bitVisionRange * bitVisionRange;

  for (const target of targets) {
    if (!target.alive) {
      continue;
    }
    const toTarget = target.position.subtract(bit.root.position);
    const distanceSq = toTarget.lengthSquared();
    if (distanceSq > rangeSq) {
      continue;
    }
    const distance = Math.sqrt(distanceSq);
    const dot =
      (forward.x * toTarget.x + forward.y * toTarget.y + forward.z * toTarget.z) /
      distance;
    if (dot < bitVisionCos) {
      continue;
    }
    if (!bestTarget || distanceSq < bestDistanceSq) {
      bestTarget = target;
      bestDistanceSq = distanceSq;
    }
  }

  return bestTarget;
};

const chooseAttackMode = (): BitMode => {
  const roll = Math.random();
  if (roll < 0.45) {
    return "attack-chase";
  }
  if (roll < 0.7) {
    return "attack-fixed";
  }
  if (roll < 0.85) {
    return "attack-random";
  }
  return "alert";
};

const setBitMode = (
  bit: Bit,
  mode: BitMode,
  target: TargetInfo | null,
  alertSignal: AlertSignal
) => {
  bit.mode = mode;
  bit.targetId = target ? target.id : null;

  if (mode === "attack-chase") {
    bit.fireInterval = 2.0 + Math.random() * 0.8;
    bit.fireTimer = bit.fireInterval;
    bit.modeTimer = bitChaseDuration;
    return;
  }

  if (mode === "attack-fixed") {
    if (target) {
      const locked = target.position.subtract(bit.root.position);
      locked.y = 0;
      bit.lockedDirection = locked.normalize();
    }
    bit.fireInterval = 1.0 + Math.random() * 0.6;
    bit.fireTimer = bit.fireInterval;
    bit.modeTimer = bitFixedDuration;
    return;
  }

  if (mode === "attack-random") {
    bit.fireInterval = 0.4 + Math.random() * 0.4;
    bit.fireTimer = bit.fireInterval * 0.5;
    bit.modeTimer = bitRandomDuration;
    return;
  }

  if (mode === "alert") {
    if (target) {
      alertSignal.position.copyFrom(target.position);
      alertSignal.timer = bitAlertDuration;
    }
    bit.fireInterval = 0;
    bit.fireTimer = 0;
    bit.modeTimer = bitAlertDuration;
    return;
  }

  bit.fireInterval = 0;
  bit.fireTimer = 0;
  bit.modeTimer = 0;
};

export const createNpcManager = (
  scene: Scene,
  capacity: number,
  spriteSheetUrl?: string
) =>
  new SpriteManager(
    "npcManager",
    spriteSheetUrl ?? createNpcSpritesheet(),
    capacity,
    { width: npcCellSize, height: npcCellSize },
    scene
  );

export const spawnNpcs = (
  layout: GridLayout,
  floorCells: FloorCell[],
  manager: SpriteManager,
  count: number
) => {
  const npcs: Npc[] = [];

  for (let index = 0; index < count; index += 1) {
    const cell = pickRandomCell(floorCells);
    const position = cellToWorld(layout, cell, npcSpriteCenterHeight);
    const sprite = new Sprite(`npc_${index}`, manager);
    sprite.position = position;
    sprite.width = npcSpriteWidth;
    sprite.height = npcSpriteHeight;
    sprite.isPickable = false;
    sprite.cellIndex = 0;

    npcs.push({
      sprite,
      state: "run",
      cell,
      target: position.clone(),
      speed: 2.4,
      hitTimer: 0,
      fadeTimer: 0,
      hitById: null,
      hitEffect: null,
      hitEffectMaterial: null
    });
  }

  return npcs;
};

export const updateNpcs = (
  layout: GridLayout,
  floorCells: FloorCell[],
  npcs: Npc[],
  beams: Beam[],
  delta: number,
  elapsed: number
) => {
  for (const npc of npcs) {
    npc.sprite.position.y = npcSpriteCenterHeight;

    if (npc.state === "run") {
      for (const beam of beams) {
        if (!beam.active) {
          continue;
        }
        const direction = Vector3.Normalize(beam.velocity);
        const halfLength = beam.length / 2;
        const toNpc = npc.sprite.position.subtract(beam.mesh.position);
        const projection =
          toNpc.x * direction.x +
          toNpc.y * direction.y +
          toNpc.z * direction.z;
        const clamped = Math.max(-halfLength, Math.min(halfLength, projection));
        const closest = beam.mesh.position.add(direction.scale(clamped));
        const distanceSq = Vector3.DistanceSquared(
          npc.sprite.position,
          closest
        );
        if (distanceSq <= npcHitRadius * npcHitRadius) {
          beam.active = false;
          beam.mesh.dispose();
          npc.state = "hit";
          npc.sprite.cellIndex = 1;
          npc.hitTimer = npcHitDuration;
          npc.fadeTimer = 0;
          npc.hitById = beam.sourceId;
          const scene = npc.sprite.manager.scene;
          const effect = MeshBuilder.CreateSphere(
            `npcHit_${npc.sprite.name}`,
            { diameter: npcHitEffectDiameter, segments: 18 },
            scene
          );
          effect.isPickable = false;
          const material = new StandardMaterial(
            `npcHitMat_${npc.sprite.name}`,
            scene
          );
          material.alpha = npcHitEffectAlpha;
          material.emissiveColor = npcHitColorA.clone();
          material.diffuseColor = npcHitColorA.clone();
          effect.material = material;
          effect.position.copyFrom(npc.sprite.position);
          npc.hitEffect = effect;
          npc.hitEffectMaterial = material;
          break;
        }
      }
    }

    if (npc.state === "hit") {
      npc.hitTimer -= delta;
      if (npc.hitEffect) {
        npc.hitEffect.position.copyFrom(npc.sprite.position);
        if (npc.hitEffectMaterial) {
          const phase =
            Math.floor(elapsed / npcHitFlickerInterval) % 2 === 0;
          const color = phase ? npcHitColorA : npcHitColorB;
          npc.hitEffectMaterial.emissiveColor.copyFrom(color);
          npc.hitEffectMaterial.diffuseColor.copyFrom(color);
          npc.hitEffectMaterial.alpha = npcHitEffectAlpha;
        }
      }
      if (npc.hitTimer <= 0) {
        npc.state = "down";
        npc.sprite.cellIndex = 2;
        npc.fadeTimer = npcHitFadeDuration;
      }
      continue;
    }

    if (npc.state === "down") {
      if (npc.fadeTimer > 0) {
        npc.fadeTimer = Math.max(0, npc.fadeTimer - delta);
        if (npc.hitEffect) {
          npc.hitEffect.position.copyFrom(npc.sprite.position);
        }
        if (npc.hitEffectMaterial) {
          npc.hitEffectMaterial.emissiveColor.copyFrom(npcHitColorA);
          npc.hitEffectMaterial.diffuseColor.copyFrom(npcHitColorA);
          npc.hitEffectMaterial.alpha =
            npcHitEffectAlpha * (npc.fadeTimer / npcHitFadeDuration);
        }
        if (npc.fadeTimer <= 0 && npc.hitEffect) {
          npc.hitEffect.dispose();
          npc.hitEffect = null;
          npc.hitEffectMaterial = null;
        }
      }
      continue;
    }

    const toTarget = npc.target.subtract(npc.sprite.position);
    toTarget.y = 0;
    const distance = Math.hypot(toTarget.x, toTarget.z);

    if (distance < 0.3) {
      const neighbors = getNeighborCells(layout, npc.cell);
      npc.cell = neighbors[Math.floor(Math.random() * neighbors.length)];
      npc.target = cellToWorld(layout, npc.cell, npcSpriteCenterHeight);
      continue;
    }

    const move = toTarget.normalize().scale(npc.speed * delta);
    npc.sprite.position.addInPlace(move);
  }
};

export const createBitMaterials = (scene: Scene): BitMaterials => {
  const body = new StandardMaterial("bitBodyMaterial", scene);
  body.diffuseColor = new Color3(0.2, 0.2, 0.2);
  body.emissiveColor = new Color3(0.04, 0.04, 0.04);

  const nozzle = new StandardMaterial("bitNozzleMaterial", scene);
  nozzle.diffuseColor = new Color3(0.12, 0.12, 0.12);
  nozzle.emissiveColor = new Color3(0.06, 0.06, 0.06);

  return { body, nozzle };
};

export const createBeamMaterial = (scene: Scene) => {
  const material = new StandardMaterial("beamMaterial", scene);
  material.emissiveColor = new Color3(0.95, 0.25, 0.25);
  material.diffuseColor = new Color3(0.95, 0.25, 0.25);
  return material;
};

const createBitRoot = (
  scene: Scene,
  materials: BitMaterials,
  index: number
) => {
  const root = new TransformNode(`bit_${index}`, scene);
  const bodyHeight = 1.8;
  const body = MeshBuilder.CreateCylinder(
    `bitBody_${index}`,
    {
      diameterTop: 0,
      diameterBottom: 1.4,
      height: bodyHeight,
      tessellation: 24
    },
    scene
  );
  body.parent = root;
  body.material = materials.body;
  body.rotation.x = Math.PI / 2;

  const muzzle = MeshBuilder.CreateSphere(
    `bitMuzzle_${index}`,
    { diameter: 0.45, segments: 16 },
    scene
  );
  muzzle.parent = root;
  muzzle.position.z = bodyHeight / 2 + 0.25;
  muzzle.material = materials.nozzle;

  return { root, muzzle };
};

export const createBit = (
  scene: Scene,
  layout: GridLayout,
  floorCells: FloorCell[],
  materials: BitMaterials,
  index: number
): Bit => {
  const cell = pickRandomCell(floorCells);
  const baseHeight = 3 + Math.random() * 2.5;
  const position = cellToWorld(layout, cell, baseHeight);
  const { root, muzzle } = createBitRoot(scene, materials, index);
  root.position = position;

  const directionAngle = Math.random() * Math.PI * 2;
  const wanderDirection = new Vector3(
    Math.cos(directionAngle),
    Math.random() * 0.6 - 0.3,
    Math.sin(directionAngle)
  );

  return {
    id: root.name,
    root,
    muzzle,
    mode: "search",
    targetId: null,
    lockedDirection: new Vector3(0, 0, 1),
    holdDirection: new Vector3(0, 0, 1),
    modeTimer: 0,
    speed: 2.4,
    wanderDirection,
    wanderTimer: 1 + Math.random() * 2,
    fireTimer: 0.6 + Math.random() * 1.2,
    fireInterval: 1.1 + Math.random() * 1.4,
    floatOffset: Math.random() * Math.PI * 2,
    baseHeight
  };
};

export const spawnBits = (
  scene: Scene,
  layout: GridLayout,
  floorCells: FloorCell[],
  materials: BitMaterials,
  count: number
) => {
  const bits: Bit[] = [];
  for (let index = 0; index < count; index += 1) {
    bits.push(createBit(scene, layout, floorCells, materials, index));
  }
  return bits;
};

export const createBeam = (
  scene: Scene,
  position: Vector3,
  direction: Vector3,
  material: StandardMaterial,
  sourceId: string | null
): Beam => {
  const beamLength = 4.8;
  const beam = MeshBuilder.CreateCylinder(
    "beam",
    { diameter: 0.18, height: beamLength, tessellation: 12 },
    scene
  );
  beam.material = material;
  beam.isPickable = false;

  const rotation = new Quaternion();
  Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, rotation);
  beam.rotationQuaternion = rotation;
  beam.position = position.add(direction.scale(beamLength / 2));

  return {
    mesh: beam,
    velocity: direction.scale(19),
    length: beamLength,
    active: true,
    sourceId
  };
};

export const updateBits = (
  layout: GridLayout,
  bits: Bit[],
  delta: number,
  elapsed: number,
  targets: TargetInfo[],
  bounds: StageBounds,
  alertSignal: AlertSignal,
  spawnBeam: (position: Vector3, direction: Vector3, sourceId: string) => void
) => {
  const minX = bounds.minX + layout.cellSize;
  const maxX = bounds.maxX - layout.cellSize;
  const minZ = bounds.minZ + layout.cellSize;
  const maxZ = bounds.maxZ - layout.cellSize;
  const minY = bounds.minY + 1.6;
  const maxY = bounds.maxY - 1.4;
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const avoidRadius = 3;
  const avoidRadiusSq = avoidRadius * avoidRadius;
  const isFloorAt = (x: number, z: number) => {
    const col = Math.floor((x + halfWidth) / layout.cellSize);
    const row = Math.floor((z + halfDepth) / layout.cellSize);
    if (row < 0 || row >= layout.rows || col < 0 || col >= layout.columns) {
      return false;
    }
    return layout.cells[row][col] === "floor";
  };

  if (alertSignal.timer > 0) {
    alertSignal.timer = Math.max(0, alertSignal.timer - delta);
  }

  const aliveTargets = targets.filter((target) => target.alive);

  for (const bit of bits) {
    let moveDirection = bit.wanderDirection;
    let aimDirection = bit.wanderDirection.clone();
    let canFire = false;
    let moveSpeed = bit.speed;
    const hitTarget = targets.find(
      (target) => target.hitById === bit.id && target.state === "hit"
    );

    if (hitTarget && bit.mode !== "hold") {
      bit.mode = "hold";
      bit.targetId = hitTarget.id;
      bit.holdDirection = bit.root.getDirection(new Vector3(0, 0, 1));
    } else if (!hitTarget && bit.mode === "hold") {
      setBitMode(bit, "search", null, alertSignal);
    }

    if (bit.mode === "hold") {
      moveDirection = new Vector3(0, 0, 0);
      aimDirection = bit.holdDirection.clone();
      canFire = false;
    } else if (bit.mode === "search") {
      bit.wanderTimer -= delta;
      if (bit.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        bit.wanderDirection = new Vector3(
          Math.cos(angle),
          Math.random() * 0.6 - 0.3,
          Math.sin(angle)
        );
        bit.wanderTimer = 1.5 + Math.random() * 2.5;
      }
      moveDirection = bit.wanderDirection;
      aimDirection = bit.wanderDirection.clone();
      moveSpeed = 3;

      const visibleTarget = findVisibleTarget(bit, aliveTargets);
      if (visibleTarget) {
        setBitMode(bit, chooseAttackMode(), visibleTarget, alertSignal);
        continue;
      }
    } else if (bit.mode === "alert") {
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }

      bit.wanderTimer -= delta;
      if (bit.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        bit.wanderDirection = new Vector3(
          Math.cos(angle),
          Math.random() * 0.6 - 0.3,
          Math.sin(angle)
        );
        bit.wanderTimer = 1.5 + Math.random() * 2.5;
      }
      moveDirection = bit.wanderDirection;
      aimDirection = bit.wanderDirection.clone();

      const visibleTarget = findVisibleTarget(bit, aliveTargets);
      if (visibleTarget) {
        alertSignal.position.copyFrom(visibleTarget.position);
        alertSignal.timer = bitAlertDuration;
      }
    } else if (bit.mode === "attack-chase") {
      moveSpeed = 1.8;
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }
      if (aliveTargets.length === 0) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }
      const { target, distanceSq } = getNearestTarget(
        bit.root.position,
        aliveTargets
      );
      const distance = Math.sqrt(distanceSq);
      if (distance > bitChaseLoseRange) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }
      moveDirection = target.position.subtract(bit.root.position).normalize();
      aimDirection = target.position.subtract(bit.root.position).normalize();
      canFire = distance <= bitChaseFireRange;
    } else if (bit.mode === "attack-fixed") {
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }
      const lockedTarget = findTargetById(aliveTargets, bit.targetId);
      if (!lockedTarget) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }
      const distanceSq = Vector3.DistanceSquared(
        bit.root.position,
        lockedTarget.position
      );
      const distance = Math.sqrt(distanceSq);
      if (distance > bitFixedLoseRange || distance < avoidRadius) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }
      moveDirection = new Vector3(0, 0, 0);
      const targetDirection = lockedTarget.position
        .subtract(bit.root.position)
        .normalize();
      const lockedDirection = bit.lockedDirection.clone();
      lockedDirection.y = 0;
      aimDirection = new Vector3(
        lockedDirection.x,
        targetDirection.y,
        lockedDirection.z
      ).normalize();
      canFire = true;
    } else if (bit.mode === "attack-random") {
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        setBitMode(bit, "search", null, alertSignal);
        continue;
      }
      bit.wanderTimer -= delta;
      if (bit.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        bit.wanderDirection = new Vector3(
          Math.cos(angle),
          Math.random() * 0.6 - 0.3,
          Math.sin(angle)
        );
        bit.wanderTimer = 1.2 + Math.random() * 1.8;
      }
      moveDirection = bit.wanderDirection;
      aimDirection = bit.wanderDirection.clone();
      canFire = true;
    }

    if (
      bit.mode !== "hold" &&
      (bit.mode === "search" || bit.mode === "alert") &&
      alertSignal.timer > 0
    ) {
      const toAlert = alertSignal.position.subtract(bit.root.position);
      toAlert.y = 0;
      const distance = toAlert.length();
      if (distance > 0.001 && distance < bitAlertListenRange) {
        const pull = toAlert.scale(1 / distance);
        moveDirection = moveDirection.add(pull.scale(0.6)).normalize();
        aimDirection = moveDirection.clone();
      }
    }

    if (bit.mode !== "attack-fixed" && bit.mode !== "hold") {
      const avoidVector = new Vector3(0, 0, 0);
      for (const target of aliveTargets) {
        const dx = bit.root.position.x - target.position.x;
        const dz = bit.root.position.z - target.position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < avoidRadiusSq) {
          const distance = Math.sqrt(distanceSq);
          const invDistance = distance === 0 ? 1 : 1 / distance;
          const strength = (avoidRadius - distance) / avoidRadius;
          avoidVector.x += dx * invDistance * strength;
          avoidVector.z += dz * invDistance * strength;
        }
      }

      if (avoidVector.length() > 0.001) {
        moveDirection = moveDirection.add(avoidVector).normalize();
        aimDirection = moveDirection.clone();
      }
    }

    const moveStep = moveDirection.scale(moveSpeed * delta);
    const nextX = bit.root.position.x + moveStep.x;
    const nextZ = bit.root.position.z + moveStep.z;

    if (isFloorAt(nextX, bit.root.position.z)) {
      bit.root.position.x = nextX;
    } else {
      bit.wanderDirection.x *= -1;
    }

    if (isFloorAt(bit.root.position.x, nextZ)) {
      bit.root.position.z = nextZ;
    } else {
      bit.wanderDirection.z *= -1;
    }

    bit.baseHeight += moveStep.y;

    if (bit.root.position.x < minX) {
      bit.root.position.x = minX;
      bit.wanderDirection.x *= -1;
    }
    if (bit.root.position.x > maxX) {
      bit.root.position.x = maxX;
      bit.wanderDirection.x *= -1;
    }
    if (bit.root.position.z < minZ) {
      bit.root.position.z = minZ;
      bit.wanderDirection.z *= -1;
    }
    if (bit.root.position.z > maxZ) {
      bit.root.position.z = maxZ;
      bit.wanderDirection.z *= -1;
    }

    for (const target of aliveTargets) {
      const dx = bit.root.position.x - target.position.x;
      const dz = bit.root.position.z - target.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < avoidRadiusSq && bit.mode !== "attack-fixed") {
        const distance = Math.sqrt(distanceSq);
        const invDistance = distance === 0 ? 1 : 1 / distance;
        bit.root.position.x = target.position.x + dx * invDistance * avoidRadius;
        bit.root.position.z = target.position.z + dz * invDistance * avoidRadius;
      }
    }

    if (bit.baseHeight < minY) {
      bit.baseHeight = minY;
      bit.wanderDirection.y *= -1;
    }
    if (bit.baseHeight > maxY) {
      bit.baseHeight = maxY;
      bit.wanderDirection.y *= -1;
    }

    const bob = Math.sin(elapsed * 0.9 + bit.floatOffset) * 0.6;
    const clampedBase = Math.min(
      Math.max(bit.baseHeight, minY - bob),
      maxY - bob
    );
    bit.baseHeight = clampedBase;
    bit.root.position.y = bit.baseHeight + bob;

    if (aimDirection.length() > 0.001) {
      bit.root.lookAt(bit.root.position.add(aimDirection));
    }

    if (bit.fireInterval > 0) {
      bit.fireTimer -= delta;
      if (bit.fireTimer <= 0 && canFire) {
        const muzzlePosition = bit.muzzle.getAbsolutePosition();
        const beamDirection = bit.root.getDirection(new Vector3(0, 0, 1));
        if (beamDirection.length() > 0.001) {
          spawnBeam(muzzlePosition, beamDirection.normalize(), bit.id);
        }
        bit.fireTimer = bit.fireInterval;
      }
    }

  }
};

export const updateBeams = (
  layout: GridLayout,
  beams: Beam[],
  bounds: StageBounds,
  delta: number
) => {
  const margin = 6;
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const survivors: Beam[] = [];
  const isFloorAt = (x: number, z: number) => {
    const col = Math.floor((x + halfWidth) / layout.cellSize);
    const row = Math.floor((z + halfDepth) / layout.cellSize);
    if (row < 0 || row >= layout.rows || col < 0 || col >= layout.columns) {
      return false;
    }
    return layout.cells[row][col] === "floor";
  };

  for (const beam of beams) {
    if (!beam.active) {
      continue;
    }
    const direction = Vector3.Normalize(beam.velocity);
    beam.mesh.position.addInPlace(beam.velocity.scale(delta));
    const front = beam.mesh.position.add(
      direction.scale(beam.length / 2)
    );

    if (
      front.y <= bounds.minY ||
      front.y >= bounds.maxY ||
      !isFloorAt(front.x, front.z)
    ) {
      beam.mesh.dispose();
      beam.active = false;
      continue;
    }

    if (
      beam.mesh.position.x < bounds.minX - margin ||
      beam.mesh.position.x > bounds.maxX + margin ||
      beam.mesh.position.z < bounds.minZ - margin ||
      beam.mesh.position.z > bounds.maxZ + margin ||
      beam.mesh.position.y < bounds.minY - margin ||
      beam.mesh.position.y > bounds.maxY + margin
    ) {
      beam.mesh.dispose();
      beam.active = false;
      continue;
    }

    survivors.push(beam);
  }

  beams.length = 0;
  beams.push(...survivors);
};
