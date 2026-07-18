import { Vector3 } from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import { cellToWorld } from "./gridUtils";
import { NPC_SPRITE_CENTER_HEIGHT } from "./characterSprites";
import { pickWeightedOneIndex } from "./random/weighted";
import { FloorCell, Npc } from "./types";

export const npcTargetArrivalDistance = 0.025;

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

export const pickRandomNeighborCell = (
  layout: GridLayout,
  cell: FloorCell
) => {
  const neighbors = getNeighborCells(layout, cell);
  return neighbors[Math.floor(Math.random() * neighbors.length)];
};

export const pickNeighborCellClosestTo = (
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

type ReachableMap = {
  distances: number[][];
  prevRow: number[][];
  prevCol: number[][];
};

type ReachableCell = {
  cell: FloorCell;
  distance: number;
};

export const buildReachableMap = (
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

export const collectReachableCells = (
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

export const pickWeightedCell = (
  candidates: ReachableCell[],
  maxDistance: number
) => {
  const weights = candidates.map(
    (candidate) => 1 + ((candidate.distance - 1) / (maxDistance - 1)) * 2
  );
  const pickedIndex = pickWeightedOneIndex(weights);
  return candidates[pickedIndex].cell;
};

export const pickEvadeCell = (
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
    const position = cellToWorld(
      layout,
      candidate.cell,
      NPC_SPRITE_CENTER_HEIGHT
    );
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
    waypoints.push(
      cellToWorld(layout, path[index], NPC_SPRITE_CENTER_HEIGHT)
    );
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

export const moveNpcAlongPath = (
  npc: Npc,
  speed: number,
  delta: number
) => {
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

export const isNpcAtDestination = (npc: Npc) => {
  if (npc.pathIndex < npc.path.length) {
    return false;
  }
  const toTarget = npc.target.subtract(npc.sprite.position);
  toTarget.y = 0;
  const distance = Math.hypot(toTarget.x, toTarget.z);
  return distance < npcTargetArrivalDistance;
};

export const setNpcDestination = (
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

export const pickNeighborCellClosestToAvoid = (
  layout: GridLayout,
  cell: FloorCell,
  targetPosition: Vector3,
  avoidCell: FloorCell
) => {
  const neighbors = getNeighborCells(layout, cell).filter(
    (candidate) =>
      candidate.row !== avoidCell.row || candidate.col !== avoidCell.col
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

export const pickNeighborCellInDirection = (
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
