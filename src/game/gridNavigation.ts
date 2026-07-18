import type { GridLayout } from "../world/grid";
import type { FloorCell } from "./types";

export type ReachableMap = {
  distances: number[][];
  prevRow: number[][];
  prevCol: number[][];
};

export const isFloorCell = (layout: GridLayout, cell: FloorCell) =>
  cell.row >= 0 &&
  cell.row < layout.rows &&
  cell.col >= 0 &&
  cell.col < layout.columns &&
  layout.cells[cell.row][cell.col] === "floor";

export const getFloorNeighborCells = (
  layout: GridLayout,
  cell: FloorCell
) => {
  const candidates = [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 }
  ];
  return candidates.filter((candidate) => isFloorCell(layout, candidate));
};

export const buildReachableMap = (
  layout: GridLayout,
  startCell: FloorCell,
  maxDistance: number,
  stopCell: FloorCell | null = null
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
    if (stopCell && row === stopCell.row && col === stopCell.col) {
      break;
    }
    const nextDistance = distances[row][col] + 1;
    if (nextDistance > maxDistance) {
      continue;
    }
    for (const neighbor of getFloorNeighborCells(layout, { row, col })) {
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

export const buildPathFromPredecessors = (
  startCell: FloorCell,
  goalCell: FloorCell,
  prevRow: number[][],
  prevCol: number[][]
) => {
  const path: FloorCell[] = [];
  let row = goalCell.row;
  let col = goalCell.col;

  while (row !== startCell.row || col !== startCell.col) {
    path.push({ row, col });
    const nextRow = prevRow[row][col];
    const nextCol = prevCol[row][col];
    row = nextRow;
    col = nextCol;
  }

  path.reverse();
  return path;
};

export const findShortestFloorPath = (
  layout: GridLayout,
  startCell: FloorCell,
  goalCell: FloorCell
) => {
  if (!isFloorCell(layout, startCell) || !isFloorCell(layout, goalCell)) {
    return null;
  }
  if (startCell.row === goalCell.row && startCell.col === goalCell.col) {
    return [];
  }

  const reachable = buildReachableMap(
    layout,
    startCell,
    Number.POSITIVE_INFINITY,
    goalCell
  );
  if (reachable.distances[goalCell.row][goalCell.col] === -1) {
    return null;
  }
  return buildPathFromPredecessors(
    startCell,
    goalCell,
    reachable.prevRow,
    reachable.prevCol
  );
};
