import {
  Color3,
  Color4,
  PointLight,
  Scene,
  Sprite,
  SpriteManager,
  Vector3
} from "@babylonjs/core";
import { CELL_SCALE, GridLayout } from "../world/grid";
import {
  Beam,
  BeamImpactOrb,
  AlertRequest,
  FloorCell,
  MovementBlocker,
  Npc,
  TargetInfo,
  isAliveState,
  isHitState
} from "./types";
import {
  cellToWorld,
  pickRandomCell,
  pickRandomHorizontalDirection
} from "./gridUtils";
import { findTargetById } from "./targetUtils";
import { isBeamHittingTarget } from "./beamCollision";
import {
  createHitEffectMesh,
  createHitFadeOrbs,
  HitFadeOrbConfig,
  updateHitFadeOrbs
} from "./hitEffects";
import { beginBeamRetract } from "./beams";
import {
  CHARACTER_SPRITE_CELL_SIZE,
  NPC_SPRITE_CENTER_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_WIDTH,
  createDefaultCharacterSpritesheet
} from "./characterSprites";
const npcSearchSpeed = 0.2;
const npcEvadeSpeed = 0.25;
const npcChaseSpeed = 0.3;
const npcMovePower = 12 * CELL_SCALE;
const npcEvadeRetargetInterval = 1;
const redHitDurationScale = 1;
export const npcHitDuration = 3;
export const npcHitFadeDuration = 1;
export const npcHitRadius = NPC_SPRITE_WIDTH * 0.5;
export const npcHitEffectDiameter = NPC_SPRITE_HEIGHT * 1.2;
export const npcHitFlickerInterval = 0.12;
export const npcHitColorA = new Color3(1, 0.18, 0.74);
export const npcHitColorB = new Color3(0.2, 0.96, 1);
export const npcHitEffectAlpha = 0.45;
const npcHitSpriteColorMix = 0.6;
const toSpriteFlickerColor = (color: Color3) =>
  new Color4(
    color.r + (1 - color.r) * npcHitSpriteColorMix,
    color.g + (1 - color.g) * npcHitSpriteColorMix,
    color.b + (1 - color.b) * npcHitSpriteColorMix,
    1
  );
const npcHitColorA4 = toSpriteFlickerColor(npcHitColorA);
const npcHitColorB4 = toSpriteFlickerColor(npcHitColorB);
const npcSpriteColorNormal = new Color4(1, 1, 1, 1);
export const npcHitLightIntensity = 1.1;
export const npcHitLightRange = npcHitEffectDiameter * 1.2;
const npcHitEffectRadius = npcHitEffectDiameter * 0.85;
const npcHitEffectRadiusSq = npcHitEffectRadius * npcHitEffectRadius;
const npcBrainwashDecisionDelay = 10;
const npcBrainwashStayChance = 0.5;
const npcBrainwashVisionRange = 3;
const npcBrainwashVisionRangeSq = npcBrainwashVisionRange * npcBrainwashVisionRange;
const npcBrainwashVisionCos = Math.cos((95 * Math.PI) / 180);
const npcBrainwashLoseRange = 2.5;
const npcBrainwashLoseRangeSq = npcBrainwashLoseRange * npcBrainwashLoseRange;
const npcBrainwashFireRange = 1.5;
const npcBrainwashFireRangeSq = npcBrainwashFireRange * npcBrainwashFireRange;
const npcBrainwashFireIntervalMin = 1.4;
const npcBrainwashFireIntervalMax = 2.2;
const npcBrainwashBlockRadius = NPC_SPRITE_WIDTH * 0.7;
const npcBrainwashBlockDuration = 20;
const npcBrainwashBreakAwayDuration = 2.5;
const npcBrainwashBreakAwaySpeed = 0.27;
const npcTargetArrivalDistance = 0.025;
const hitFadeOrbMinCount = 5;
const hitFadeOrbMaxCount = 20;
const hitFadeOrbDiameter = 0.02;
const hitFadeOrbSurfaceOffsetMin = 0.005;
const hitFadeOrbSurfaceOffsetMax = 0.03;
const hitFadeOrbSpeedMin = 0.02;
const hitFadeOrbSpeedMax = 0.05;
export const npcHitFadeOrbConfig: HitFadeOrbConfig = {
  minCount: hitFadeOrbMinCount,
  maxCount: hitFadeOrbMaxCount,
  diameter: hitFadeOrbDiameter,
  surfaceOffsetMin: hitFadeOrbSurfaceOffsetMin,
  surfaceOffsetMax: hitFadeOrbSurfaceOffsetMax,
  speedMin: hitFadeOrbSpeedMin,
  speedMax: hitFadeOrbSpeedMax
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

const pickRandomNeighborCell = (layout: GridLayout, cell: FloorCell) => {
  const neighbors = getNeighborCells(layout, cell);
  return neighbors[Math.floor(Math.random() * neighbors.length)];
};

const pickNeighborCellClosestTo = (
  layout: GridLayout,
  cell: FloorCell,
  targetPosition: Vector3
) => {
  const neighbors = getNeighborCells(layout, cell);
  let bestCell = neighbors[0];
  let bestDistanceSq = Vector3.DistanceSquared(
    cellToWorld(layout, bestCell, NPC_SPRITE_CENTER_HEIGHT),
    targetPosition
  );

  for (let index = 1; index < neighbors.length; index += 1) {
    const candidate = neighbors[index];
    const distanceSq = Vector3.DistanceSquared(
      cellToWorld(layout, candidate, NPC_SPRITE_CENTER_HEIGHT),
      targetPosition
    );
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestCell = candidate;
    }
  }

  return bestCell;
};

const worldToCell = (layout: GridLayout, position: Vector3): FloorCell => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  return {
    row: Math.floor((position.z + halfDepth) / layout.cellSize),
    col: Math.floor((position.x + halfWidth) / layout.cellSize)
  };
};

type ReachableMap = {
  distances: number[][];
  prevRow: number[][];
  prevCol: number[][];
};

type ReachableCell = {
  cell: FloorCell;
  distance: number;
};

const buildReachableMap = (
  layout: GridLayout,
  startCell: FloorCell,
  maxDistance: number
): ReachableMap => {
  const distances = Array.from({ length: layout.rows }, () =>
    Array.from({ length: layout.columns }, () => -1)
  );
  const prevRow = Array.from({ length: layout.rows }, () =>
    Array.from({ length: layout.columns }, () => -1)
  );
  const prevCol = Array.from({ length: layout.rows }, () =>
    Array.from({ length: layout.columns }, () => -1)
  );
  const queueRow = [startCell.row];
  const queueCol = [startCell.col];
  distances[startCell.row][startCell.col] = 0;
  let head = 0;

  while (head < queueRow.length) {
    const row = queueRow[head];
    const col = queueCol[head];
    head += 1;
    const nextDistance = distances[row][col] + 1;
    if (nextDistance > maxDistance) {
      continue;
    }
    const neighbors = getNeighborCells(layout, { row, col });
    for (const neighbor of neighbors) {
      if (distances[neighbor.row][neighbor.col] !== -1) {
        continue;
      }
      distances[neighbor.row][neighbor.col] = nextDistance;
      prevRow[neighbor.row][neighbor.col] = row;
      prevCol[neighbor.row][neighbor.col] = col;
      queueRow.push(neighbor.row);
      queueCol.push(neighbor.col);
    }
  }

  return { distances, prevRow, prevCol };
};

const collectReachableCells = (
  layout: GridLayout,
  distances: number[][]
) => {
  const reachable: ReachableCell[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.columns; col += 1) {
      const distance = distances[row][col];
      if (distance > 0) {
        reachable.push({ cell: { row, col }, distance });
      }
    }
  }
  return reachable;
};

const pickWeightedCell = (
  candidates: ReachableCell[],
  maxDistance: number
) => {
  let totalWeight = 0;
  const weights = new Array(candidates.length).fill(0);
  for (let index = 0; index < candidates.length; index += 1) {
    const distance = candidates[index].distance;
    const weight = 1 + ((distance - 1) / (maxDistance - 1)) * 2;
    weights[index] = weight;
    totalWeight += weight;
  }
  let roll = Math.random() * totalWeight;
  for (let index = 0; index < candidates.length; index += 1) {
    const weight = weights[index];
    if (roll <= weight) {
      return candidates[index].cell;
    }
    roll -= weight;
  }
  return candidates[candidates.length - 1].cell;
};

const pickEvadeCell = (
  layout: GridLayout,
  candidates: ReachableCell[],
  threats: Vector3[]
) => {
  let sumX = 0;
  let sumZ = 0;
  for (const threat of threats) {
    sumX += threat.x;
    sumZ += threat.z;
  }
  const centerX = sumX / threats.length;
  const centerZ = sumZ / threats.length;
  let bestDistanceSq = -Infinity;
  const bestCells: FloorCell[] = [];

  for (const candidate of candidates) {
    const position = cellToWorld(layout, candidate.cell, NPC_SPRITE_CENTER_HEIGHT);
    const dx = position.x - centerX;
    const dz = position.z - centerZ;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestCells.length = 0;
      bestCells.push(candidate.cell);
    } else if (distanceSq === bestDistanceSq) {
      bestCells.push(candidate.cell);
    }
  }

  return bestCells[Math.floor(Math.random() * bestCells.length)];
};

const buildPathFromPrev = (
  startCell: FloorCell,
  goalCell: FloorCell,
  prevRow: number[][],
  prevCol: number[][]
) => {
  const path: FloorCell[] = [];
  let row = goalCell.row;
  let col = goalCell.col;
  path.push({ row, col });
  while (row !== startCell.row || col !== startCell.col) {
    const nextRow = prevRow[row][col];
    const nextCol = prevCol[row][col];
    row = nextRow;
    col = nextCol;
    path.push({ row, col });
  }
  path.reverse();
  return path;
};

const buildPathWaypoints = (layout: GridLayout, path: FloorCell[]) => {
  const waypoints: Vector3[] = [];
  for (let index = 1; index < path.length; index += 1) {
    waypoints.push(cellToWorld(layout, path[index], NPC_SPRITE_CENTER_HEIGHT));
  }
  return waypoints;
};

const hasWallOnLine = (
  layout: GridLayout,
  start: Vector3,
  end: Vector3
) => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const startX = (start.x + halfWidth) / layout.cellSize;
  const startZ = (start.z + halfDepth) / layout.cellSize;
  const endX = (end.x + halfWidth) / layout.cellSize;
  const endZ = (end.z + halfDepth) / layout.cellSize;
  let cellX = Math.floor(startX);
  let cellZ = Math.floor(startZ);
  const endCellX = Math.floor(endX);
  const endCellZ = Math.floor(endZ);
  const dx = endX - startX;
  const dz = endZ - startZ;
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  const nextBoundaryX = dx > 0 ? cellX + 1 : cellX;
  const nextBoundaryZ = dz > 0 ? cellZ + 1 : cellZ;
  let tMaxX = dx === 0 ? Infinity : (nextBoundaryX - startX) / dx;
  let tMaxZ = dz === 0 ? Infinity : (nextBoundaryZ - startZ) / dz;

  while (true) {
    if (layout.cells[cellZ][cellX] !== "floor") {
      return true;
    }
    if (cellX === endCellX && cellZ === endCellZ) {
      break;
    }
    if (tMaxX < tMaxZ) {
      tMaxX += tDeltaX;
      cellX += stepX;
    } else {
      tMaxZ += tDeltaZ;
      cellZ += stepZ;
    }
  }

  return false;
};

const moveNpcToTarget = (
  npc: Npc,
  target: Vector3,
  speed: number,
  delta: number
) => {
  const toTarget = target.subtract(npc.sprite.position);
  toTarget.y = 0;
  const distance = Math.hypot(toTarget.x, toTarget.z);
  if (distance < npcTargetArrivalDistance) {
    npc.sprite.position.x = target.x;
    npc.sprite.position.z = target.z;
    return true;
  }
  const direction = toTarget.normalize();
  npc.moveDirection.copyFrom(direction);
  npc.sprite.position.addInPlace(direction.scale(speed * delta));
  return false;
};

const moveNpcAlongPath = (npc: Npc, speed: number, delta: number) => {
  if (npc.pathIndex < npc.path.length) {
    const target = npc.path[npc.pathIndex];
    const arrived = moveNpcToTarget(npc, target, speed, delta);
    if (!arrived) {
      return false;
    }
    npc.pathIndex += 1;
    if (npc.pathIndex < npc.path.length) {
      return false;
    }
    return true;
  }

  return moveNpcToTarget(npc, npc.target, speed, delta);
};

const isNpcAtDestination = (npc: Npc) => {
  if (npc.pathIndex < npc.path.length) {
    return false;
  }
  const toTarget = npc.target.subtract(npc.sprite.position);
  toTarget.y = 0;
  const distance = Math.hypot(toTarget.x, toTarget.z);
  return distance < npcTargetArrivalDistance;
};

const setNpcDestination = (
  layout: GridLayout,
  npc: Npc,
  originCell: FloorCell,
  destinationCell: FloorCell,
  prevRow: number[][],
  prevCol: number[][]
) => {
  npc.goalCell = destinationCell;
  npc.target = cellToWorld(layout, destinationCell, NPC_SPRITE_CENTER_HEIGHT);
  npc.pathIndex = 0;
  if (hasWallOnLine(layout, npc.sprite.position, npc.target)) {
    const path = buildPathFromPrev(originCell, destinationCell, prevRow, prevCol);
    npc.path = buildPathWaypoints(layout, path);
  } else {
    npc.path = [];
  }
};

const pickNeighborCellClosestToAvoid = (
  layout: GridLayout,
  cell: FloorCell,
  targetPosition: Vector3,
  avoidCell: FloorCell
) => {
  const neighbors = getNeighborCells(layout, cell).filter(
    (candidate) => candidate.row !== avoidCell.row || candidate.col !== avoidCell.col
  );
  if (neighbors.length === 0) {
    return cell;
  }
  let bestCell = neighbors[0];
  let bestDistanceSq = Vector3.DistanceSquared(
    cellToWorld(layout, bestCell, NPC_SPRITE_CENTER_HEIGHT),
    targetPosition
  );

  for (let index = 1; index < neighbors.length; index += 1) {
    const candidate = neighbors[index];
    const distanceSq = Vector3.DistanceSquared(
      cellToWorld(layout, candidate, NPC_SPRITE_CENTER_HEIGHT),
      targetPosition
    );
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestCell = candidate;
    }
  }

  return bestCell;
};

const pickNeighborCellInDirection = (
  layout: GridLayout,
  cell: FloorCell,
  direction: Vector3
) => {
  const neighbors = getNeighborCells(layout, cell);
  const base = cellToWorld(layout, cell, NPC_SPRITE_CENTER_HEIGHT);
  let bestCell = neighbors[0];
  let bestDot = -Infinity;

  for (const candidate of neighbors) {
    const candidatePosition = cellToWorld(
      layout,
      candidate,
      NPC_SPRITE_CENTER_HEIGHT
    );
    const toCandidate = candidatePosition.subtract(base);
    toCandidate.y = 0;
    const length = toCandidate.length();
    if (length > 0) {
      const dot =
        (toCandidate.x * direction.x + toCandidate.z * direction.z) / length;
      if (dot > bestDot) {
        bestDot = dot;
        bestCell = candidate;
      }
    }
  }

  return bestCell;
};

export const promoteHaigureNpc = (npc: Npc) => {
  const toGun = Math.random() < 0.5;
  npc.state = toGun
    ? "brainwash-complete-gun"
    : "brainwash-complete-no-gun";
  npc.brainwashTimer = 0;
  npc.brainwashMode = "search";
  npc.brainwashTargetId = null;
  npc.wanderTimer = 1 + Math.random() * 2;
  npc.wanderDirection = pickRandomHorizontalDirection();
  npc.moveDirection.copyFrom(npc.wanderDirection);
  npc.blockTimer = 0;
  npc.blockTargetId = null;
  npc.breakAwayTimer = 0;
  npc.breakAwayDirection = pickRandomHorizontalDirection();
  if (npc.state === "brainwash-complete-gun") {
    npc.fireInterval =
      npcBrainwashFireIntervalMin +
      Math.random() *
        (npcBrainwashFireIntervalMax - npcBrainwashFireIntervalMin);
    npc.fireTimer = npc.fireInterval * Math.random();
  }
};

const findVisibleNpcTarget = (npc: Npc, targets: TargetInfo[]) => {
  const forward =
    npc.moveDirection.lengthSquared() > 0.0001
      ? npc.moveDirection
      : npc.wanderDirection;
  let bestTarget: TargetInfo | null = null;
  let bestDistanceSq = 0;

  for (const target of targets) {
    if (!target.alive) {
      continue;
    }
    const toTarget = target.position.subtract(npc.sprite.position);
    const distanceSq = toTarget.lengthSquared();
    if (distanceSq > npcBrainwashVisionRangeSq) {
      continue;
    }
    const distance = Math.sqrt(distanceSq);
    const dot =
      (forward.x * toTarget.x +
        forward.y * toTarget.y +
        forward.z * toTarget.z) /
      distance;
    if (dot < npcBrainwashVisionCos) {
      continue;
    }
    if (!bestTarget || distanceSq < bestDistanceSq) {
      bestTarget = target;
      bestDistanceSq = distanceSq;
    }
  }

  return bestTarget;
};

export const createNpcManager = (
  scene: Scene,
  capacity: number,
  spriteSheetUrl?: string
) =>
  new SpriteManager(
    "npcManager",
    spriteSheetUrl ?? createDefaultCharacterSpritesheet(),
    capacity,
    { width: CHARACTER_SPRITE_CELL_SIZE, height: CHARACTER_SPRITE_CELL_SIZE },
    scene
  );

export const spawnNpcs = (
  layout: GridLayout,
  floorCells: FloorCell[],
  getManager: (voiceId: string, index: number) => SpriteManager,
  voiceIds: string[]
) => {
  const npcs: Npc[] = [];
  const count = voiceIds.length;

  for (let index = 0; index < count; index += 1) {
    const cell = pickRandomCell(floorCells);
    const position = cellToWorld(layout, cell, NPC_SPRITE_CENTER_HEIGHT);
    const voiceId = voiceIds[index];
    const sprite = new Sprite(
      `npc_${index}`,
      getManager(voiceId, index)
    );
    sprite.position = position;
    sprite.width = NPC_SPRITE_WIDTH;
    sprite.height = NPC_SPRITE_HEIGHT;
    sprite.isPickable = false;
    sprite.cellIndex = 0;
    const wanderDirection = pickRandomHorizontalDirection();
    const fireInterval =
      npcBrainwashFireIntervalMin +
      Math.random() * (npcBrainwashFireIntervalMax - npcBrainwashFireIntervalMin);

    npcs.push({
      sprite,
      state: "normal",
      voiceId,
      cell,
      goalCell: cell,
      target: position.clone(),
      speed: npcSearchSpeed,
      hitTimer: 0,
      fadeTimer: 0,
      hitFadeDuration: npcHitFadeDuration,
      hitById: null,
      hitEffect: null,
      hitEffectMaterial: null,
      hitLight: null,
      fadeOrbs: [],
      brainwashTimer: 0,
      brainwashMode: "search",
      brainwashTargetId: null,
      wanderDirection,
      wanderTimer: 1 + Math.random() * 2,
      moveDirection: wanderDirection.clone(),
      path: [],
      pathIndex: 0,
      evadeTimer: 0,
      fireTimer: fireInterval * Math.random(),
      fireInterval,
      blockTimer: 0,
      blockTargetId: null,
      breakAwayTimer: 0,
      breakAwayDirection: pickRandomHorizontalDirection(),
      blockedByPlayer: false,
      alertState: "none",
      alertReturnBrainwashMode: null,
      alertReturnTargetId: null
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
  elapsed: number,
  targets: TargetInfo[],
  onNpcHit: (position: Vector3) => void,
  spawnNpcBeam: (position: Vector3, direction: Vector3, sourceId: string) => void,
  isRedSource: (sourceId: string | null) => boolean,
  impactOrbs: BeamImpactOrb[],
  blockers: MovementBlocker[],
  evadeThreats: Vector3[][],
  cameraPosition: Vector3,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  const aliveTargets = targets.filter((target) => target.alive);
  const activeBlockers: MovementBlocker[] = [...blockers];
  let playerBlocked = false;
  const targetedIds = new Set<string>();
  const alertRequests: AlertRequest[] = [];
  const restoreNpcFromAlert = (npc: Npc) => {
    const returnMode = npc.alertReturnBrainwashMode;
    const returnTargetId = npc.alertReturnTargetId;
    npc.alertReturnBrainwashMode = null;
    npc.alertReturnTargetId = null;
    npc.alertState = "none";
    if (returnMode) {
      const target = returnTargetId
        ? findTargetById(aliveTargets, returnTargetId)
        : null;
      if (target || returnMode === "search") {
        npc.brainwashMode = returnMode;
        npc.brainwashTargetId = target ? target.id : null;
        return;
      }
    }
    npc.brainwashMode = "search";
    npc.brainwashTargetId = null;
  };
  const npcThreatsFromNpcs = npcs.map(() => [] as Vector3[]);
  for (const npc of npcs) {
    if (npc.brainwashMode !== "chase" || !npc.brainwashTargetId) {
      continue;
    }
    const target = findTargetById(aliveTargets, npc.brainwashTargetId);
    if (!target || !target.id.startsWith("npc_")) {
      continue;
    }
    const targetIndex = Number(target.id.slice(4));
    npcThreatsFromNpcs[targetIndex].push(npc.sprite.position);
  }

  for (const npc of npcs) {
    if (npc.state !== "brainwash-complete-no-gun") {
      continue;
    }
    if (npc.breakAwayTimer > 0) {
      continue;
    }
    if (!npc.blockTargetId) {
      continue;
    }
    const blockedTarget = findTargetById(targets, npc.blockTargetId);
    if (!blockedTarget || !blockedTarget.alive) {
      npc.blockTargetId = null;
      npc.blockTimer = 0;
      continue;
    }
    activeBlockers.push({
      position: blockedTarget.position,
      radius: npcBrainwashBlockRadius,
      sourceId: npc.sprite.name
    });
    if (blockedTarget.id === "player") {
      playerBlocked = true;
    }
  }

  for (const npc of npcs) {
    const npcId = npc.sprite.name;
    npc.sprite.position.y = NPC_SPRITE_CENTER_HEIGHT;
    npc.cell = worldToCell(layout, npc.sprite.position);
    const npcIndex = Number(npcId.slice(4));
    if (npc.state === "brainwash-complete-gun") {
      npc.sprite.cellIndex = 3;
    }
    if (
      (npc.state === "brainwash-complete-gun" ||
        npc.state === "brainwash-complete-no-gun") &&
      npc.alertState === "receive" &&
      npc.brainwashTargetId
    ) {
      const alertTarget = findTargetById(targets, npc.brainwashTargetId);
      if (!alertTarget || !alertTarget.alive) {
        restoreNpcFromAlert(npc);
        continue;
      }
    }

    if (isAliveState(npc.state)) {
      for (const beam of beams) {
        if (!beam.active) {
          continue;
        }
          if (beam.sourceId === npcId) {
            continue;
          }
          if (isBeamHittingTarget(beam, npc.sprite.position, npcHitRadius)) {
            const hitScale = isRedSource(beam.sourceId)
              ? redHitDurationScale
              : 1;
          const impactPosition = beam.tip.position.add(
            Vector3.Normalize(beam.velocity).scale(beam.tipRadius)
          );
          beginBeamRetract(beam, impactPosition);
          npc.state = "hit-a";
          npc.sprite.cellIndex = 1;
          npc.hitTimer = npcHitDuration * hitScale;
            npc.hitFadeDuration = npcHitFadeDuration * hitScale;
            npc.fadeTimer = 0;
            npc.hitById = beam.sourceId;
            const scene = npc.sprite.manager.scene;
            const { mesh: effect, material } = createHitEffectMesh(scene, {
              name: `npcHit_${npc.sprite.name}`,
              diameter: npcHitEffectDiameter,
              color: npcHitColorA,
              alpha: npcHitEffectAlpha
            });
            effect.position.copyFrom(npc.sprite.position);
            npc.hitEffect = effect;
            npc.hitEffectMaterial = material;
            const hitLight = new PointLight(
              `npcHitLight_${npc.sprite.name}`,
              npc.sprite.position.clone(),
              scene
            );
            hitLight.diffuse = npcHitColorA.clone();
            hitLight.specular = npcHitColorA.clone();
            hitLight.intensity = npcHitLightIntensity;
            hitLight.range = npcHitLightRange;
            npc.hitLight = hitLight;
            onNpcHit(npc.sprite.position);
            break;
          }
      }
    }

    if (isHitState(npc.state)) {
      npc.hitTimer -= delta;
      if (npc.hitTimer > 0) {
        const dx = cameraPosition.x - npc.sprite.position.x;
        const dy = cameraPosition.y - npc.sprite.position.y;
        const dz = cameraPosition.z - npc.sprite.position.z;
        const isCameraInside =
          dx * dx + dy * dy + dz * dz <= npcHitEffectRadiusSq;
        if (npc.hitEffect) {
          npc.hitEffect.position.copyFrom(npc.sprite.position);
        }
        if (npc.hitLight) {
          npc.hitLight.position.copyFrom(npc.sprite.position);
        }
        const phase =
          Math.floor(elapsed / npcHitFlickerInterval) % 2 === 0;
        const color = phase ? npcHitColorA : npcHitColorB;
        const spriteColor = isCameraInside
          ? phase
            ? npcHitColorA4
            : npcHitColorB4
          : npcSpriteColorNormal;
        npc.sprite.color.copyFrom(spriteColor);
        if (npc.hitEffectMaterial) {
          npc.hitEffectMaterial.emissiveColor.copyFrom(color);
          npc.hitEffectMaterial.diffuseColor.copyFrom(color);
          npc.hitEffectMaterial.alpha = npcHitEffectAlpha;
        }
        if (npc.hitLight) {
          npc.hitLight.diffuse.copyFrom(color);
          npc.hitLight.specular.copyFrom(color);
          npc.hitLight.intensity = npcHitLightIntensity;
        }
        npc.state = phase ? "hit-a" : "hit-b";
        continue;
      }

      if (npc.fadeTimer === 0) {
        npc.fadeTimer = npc.hitFadeDuration;
        npc.sprite.cellIndex = 2;
        npc.sprite.color.copyFrom(npcSpriteColorNormal);
        if (shouldProcessOrb(npc.sprite.position)) {
          npc.fadeOrbs = createHitFadeOrbs(
            npc.sprite.manager.scene,
            npc.sprite.position.clone(),
            npc.hitEffectMaterial!,
            npcHitEffectDiameter / 2,
            npcHitFadeOrbConfig
          );
        } else {
          npc.fadeOrbs = [];
        }
      }
      npc.state = "hit-a";

      npc.fadeTimer = Math.max(0, npc.fadeTimer - delta);
      if (npc.hitEffect) {
        npc.hitEffect.position.copyFrom(npc.sprite.position);
      }
      if (npc.hitLight) {
        npc.hitLight.position.copyFrom(npc.sprite.position);
      }
      if (npc.hitEffectMaterial) {
        npc.hitEffectMaterial.emissiveColor.copyFrom(npcHitColorA);
        npc.hitEffectMaterial.diffuseColor.copyFrom(npcHitColorA);
        npc.hitEffectMaterial.alpha =
          npcHitEffectAlpha * (npc.fadeTimer / npc.hitFadeDuration);
      }
      const fadeScale = npc.fadeTimer / npc.hitFadeDuration;
      if (npc.hitLight) {
        npc.hitLight.diffuse.copyFrom(npcHitColorA);
        npc.hitLight.specular.copyFrom(npcHitColorA);
        npc.hitLight.intensity = npcHitLightIntensity * fadeScale;
      }
        updateHitFadeOrbs(npc.fadeOrbs, delta, fadeScale, shouldProcessOrb);
        if (npc.fadeTimer <= 0) {
          npc.state = "brainwash-in-progress";
          npc.brainwashTimer = 0;
          npc.brainwashMode = "search";
          npc.brainwashTargetId = null;
          npc.goalCell = npc.cell;
          npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
          npc.path = [];
          npc.pathIndex = 0;
          npc.blockTimer = 0;
          npc.blockTargetId = null;
          npc.breakAwayTimer = 0;
        npc.alertState = "none";
        npc.alertReturnBrainwashMode = null;
        npc.alertReturnTargetId = null;
        if (npc.hitEffect) {
          npc.hitEffect.dispose();
          npc.hitEffect = null;
          npc.hitEffectMaterial = null;
        }
        if (npc.hitLight) {
          npc.hitLight.dispose();
          npc.hitLight = null;
        }
        npc.sprite.color.copyFrom(npcSpriteColorNormal);
        for (const orb of npc.fadeOrbs) {
          orb.mesh.dispose();
        }
        npc.fadeOrbs = [];
      }
      continue;
    }

    if (npc.state === "brainwash-in-progress") {
      npc.brainwashTimer += delta;
      if (npc.brainwashTimer >= npcBrainwashDecisionDelay) {
        if (Math.random() < npcBrainwashStayChance) {
          npc.brainwashTimer = 0;
        } else {
          npc.state = "brainwash-complete-haigure";
          npc.brainwashTimer = 0;
        }
      }
      continue;
    }

    if (npc.state === "brainwash-complete-haigure") {
      npc.brainwashTimer += delta;
      if (npc.brainwashTimer >= npcBrainwashDecisionDelay) {
        promoteHaigureNpc(npc);
      }
      continue;
    }

    if (npc.state === "brainwash-complete-haigure-formation") {
      continue;
    }

    if (isAliveState(npc.state)) {
      let blocked = false;
      let blockedByPlayer = false;
      for (const blocker of activeBlockers) {
        const dx = npc.sprite.position.x - blocker.position.x;
        const dz = npc.sprite.position.z - blocker.position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq <= blocker.radius * blocker.radius) {
          blocked = true;
          blockedByPlayer = blocker.sourceId === "player";
          break;
        }
      }
      if (blockedByPlayer && !npc.blockedByPlayer) {
        alertRequests.push({ targetId: npcId, blockerId: "player" });
      }
      if (npc.alertState !== "receive") {
        npc.alertState = blockedByPlayer ? "send" : "none";
      }
      npc.blockedByPlayer = blockedByPlayer;
      if (blocked) {
        continue;
      }

      const moveSpeed = npc.state === "evade" ? npcEvadeSpeed : npc.speed;
      const originCell = npc.cell;
      const destinationArrived = isNpcAtDestination(npc);
      if (npc.state === "evade") {
        npc.evadeTimer = Math.max(0, npc.evadeTimer - delta);
        if (npc.evadeTimer <= 0 || destinationArrived) {
          const reachableMap = buildReachableMap(
            layout,
            originCell,
            npcMovePower
          );
          const candidates = collectReachableCells(
            layout,
            reachableMap.distances
          );
          const threats = [
            ...npcThreatsFromNpcs[npcIndex],
            ...evadeThreats[npcIndex]
          ];
          const destination =
            threats.length > 0
              ? pickEvadeCell(layout, candidates, threats)
              : pickWeightedCell(candidates, npcMovePower);
          setNpcDestination(
            layout,
            npc,
            originCell,
            destination,
            reachableMap.prevRow,
            reachableMap.prevCol
          );
          npc.evadeTimer = npcEvadeRetargetInterval;
          if (destinationArrived) {
            continue;
          }
        }
      } else if (destinationArrived) {
        const reachableMap = buildReachableMap(
          layout,
          originCell,
          npcMovePower
        );
        const candidates = collectReachableCells(
          layout,
          reachableMap.distances
        );
        const destination = pickWeightedCell(candidates, npcMovePower);
        setNpcDestination(
          layout,
          npc,
          originCell,
          destination,
          reachableMap.prevRow,
          reachableMap.prevCol
        );
        continue;
      }

      moveNpcAlongPath(npc, moveSpeed, delta);
      continue;
    }

    const brainwashTargets = aliveTargets.filter(
      (target) => target.id !== npcId
    );

    if (npc.state === "brainwash-complete-no-gun") {
      if (npc.blockTargetId) {
        if (npc.alertState !== "receive") {
          npc.alertState = "send";
        }
        const blockedTarget = findTargetById(targets, npc.blockTargetId);
        if (!blockedTarget || !blockedTarget.alive) {
          npc.blockTargetId = null;
          npc.blockTimer = 0;
          if (npc.alertState === "send") {
            npc.alertState = "none";
          }
        } else {
          npc.blockTimer += delta;
          if (npc.blockTimer >= npcBrainwashBlockDuration) {
            const away = npc.sprite.position.subtract(blockedTarget.position);
            away.y = 0;
            npc.breakAwayDirection =
              away.lengthSquared() > 0.0001
                ? away.normalize()
                : pickRandomHorizontalDirection();
            npc.breakAwayTimer = npcBrainwashBreakAwayDuration;
            npc.blockTimer = 0;
            npc.blockTargetId = null;
            if (npc.alertState === "send") {
              npc.alertState = "none";
            }
            npc.brainwashMode = "search";
            npc.brainwashTargetId = null;
            npc.cell = pickNeighborCellInDirection(
              layout,
              npc.cell,
              npc.breakAwayDirection
            );
            npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
          }
        }
        continue;
      }

      if (npc.breakAwayTimer > 0) {
        if (npc.alertState === "send") {
          npc.alertState = "none";
        }
        npc.breakAwayTimer = Math.max(0, npc.breakAwayTimer - delta);
        let toTarget = npc.target.subtract(npc.sprite.position);
        toTarget.y = 0;
        let distance = Math.hypot(toTarget.x, toTarget.z);
        if (distance < npcTargetArrivalDistance) {
          npc.cell = pickNeighborCellInDirection(
            layout,
            npc.cell,
            npc.breakAwayDirection
          );
          npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
          toTarget = npc.target.subtract(npc.sprite.position);
          toTarget.y = 0;
          distance = Math.hypot(toTarget.x, toTarget.z);
        }
        if (distance >= 0.001) {
          const direction = toTarget.normalize();
          npc.moveDirection.copyFrom(direction);
          npc.sprite.position.addInPlace(
            direction.scale(npcBrainwashBreakAwaySpeed * delta)
          );
        }
        if (npc.breakAwayTimer <= 0) {
          npc.brainwashMode = "search";
          npc.brainwashTargetId = null;
        }
        continue;
      }
    }

    let currentTarget = findTargetById(targets, npc.brainwashTargetId);
    if (!currentTarget || !currentTarget.alive || currentTarget.id === npcId) {
      currentTarget = null;
    }

    if (npc.brainwashMode === "search") {
      if (brainwashTargets.length > 0) {
        const visibleTarget = findVisibleNpcTarget(npc, brainwashTargets);
        if (visibleTarget) {
          npc.brainwashMode = "chase";
          npc.brainwashTargetId = visibleTarget.id;
          currentTarget = visibleTarget;
        }
      }
    } else if (!currentTarget) {
      npc.brainwashMode = "search";
      npc.brainwashTargetId = null;
    } else {
      const distanceSq = Vector3.DistanceSquared(
        npc.sprite.position,
        currentTarget.position
      );
      if (distanceSq > npcBrainwashLoseRangeSq) {
        npc.brainwashMode = "search";
        npc.brainwashTargetId = null;
        currentTarget = null;
      }
    }

    if (
      (npc.state === "brainwash-complete-gun" ||
        npc.state === "brainwash-complete-no-gun") &&
      npc.brainwashMode === "chase" &&
      currentTarget
    ) {
      targetedIds.add(currentTarget.id);
    }

    let toTarget = npc.target.subtract(npc.sprite.position);
    toTarget.y = 0;
    let distance = Math.hypot(toTarget.x, toTarget.z);

    if (distance < npcTargetArrivalDistance) {
      if (npc.brainwashMode === "chase" && currentTarget) {
        if (npc.state === "brainwash-complete-gun") {
          const targetCell = worldToCell(layout, currentTarget.position);
          npc.cell = pickNeighborCellClosestToAvoid(
            layout,
            npc.cell,
            currentTarget.position,
            targetCell
          );
        } else {
          npc.cell = pickNeighborCellClosestTo(
            layout,
            npc.cell,
            currentTarget.position
          );
        }
      } else {
        npc.cell = pickRandomNeighborCell(layout, npc.cell);
      }
      npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
      toTarget = npc.target.subtract(npc.sprite.position);
      toTarget.y = 0;
      distance = Math.hypot(toTarget.x, toTarget.z);
    }

    if (distance >= 0.001) {
      const direction = toTarget.normalize();
      npc.moveDirection.copyFrom(direction);
      const moveSpeed =
        npc.brainwashMode === "chase" ? npcChaseSpeed : npc.speed;
      const move = direction.scale(moveSpeed * delta);
      npc.sprite.position.addInPlace(move);
    }

    if (npc.state === "brainwash-complete-gun") {
      if (npc.brainwashMode === "chase" && currentTarget) {
        const distanceSq = Vector3.DistanceSquared(
          npc.sprite.position,
          currentTarget.position
        );
        if (distanceSq <= npcBrainwashFireRangeSq) {
          npc.fireTimer -= delta;
          if (npc.fireTimer <= 0) {
            const fireDirection = currentTarget.position.subtract(
              npc.sprite.position
            );
            if (fireDirection.lengthSquared() > 0.0001) {
              spawnNpcBeam(
                npc.sprite.position.clone(),
                fireDirection.normalize(),
                npcId
              );
            }
            npc.fireInterval =
              npcBrainwashFireIntervalMin +
              Math.random() *
                (npcBrainwashFireIntervalMax - npcBrainwashFireIntervalMin);
            npc.fireTimer = npc.fireInterval;
          }
        }
      }
      continue;
    }

    if (npc.state === "brainwash-complete-no-gun") {
      if (npc.brainwashMode === "chase" && currentTarget) {
        const distanceSq = Vector3.DistanceSquared(
          npc.sprite.position,
          currentTarget.position
        );
        if (distanceSq <= npcBrainwashBlockRadius * npcBrainwashBlockRadius) {
          if (npc.alertState !== "receive") {
            npc.alertState = "send";
          }
          npc.blockTargetId = currentTarget.id;
          npc.blockTimer = 0;
          alertRequests.push({
            targetId: currentTarget.id,
            blockerId: npcId
          });
        }
      }
    }
  }

  return { playerBlocked, targetedIds, alertRequests };
};
