import { Vector3 } from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import { FloorCell } from "./types";

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

export const cellToWorld = (
  layout: GridLayout,
  cell: FloorCell,
  y: number
) => {
  return new Vector3(
    layout.worldOrigin.x +
      layout.columnDirection.x * cell.col * layout.cellSize +
      layout.rowDirection.x * cell.row * layout.cellSize,
    y,
    layout.worldOrigin.z +
      layout.columnDirection.z * cell.col * layout.cellSize +
      layout.rowDirection.z * cell.row * layout.cellSize
  );
};

const worldOffsetToCell = (layout: GridLayout, position: Vector3) => {
  const offsetX = position.x - layout.worldOrigin.x;
  const offsetZ = position.z - layout.worldOrigin.z;
  return {
    row: Math.floor(
      (offsetX * layout.rowDirection.x + offsetZ * layout.rowDirection.z) /
        layout.cellSize +
        0.5
    ),
    col: Math.floor(
      (offsetX * layout.columnDirection.x +
        offsetZ * layout.columnDirection.z) /
        layout.cellSize +
        0.5
    )
  };
};

export const worldToCell = (
  layout: GridLayout,
  position: Vector3
): FloorCell => worldOffsetToCell(layout, position);

export const worldToCellClamped = (
  layout: GridLayout,
  position: Vector3
): FloorCell => {
  const cell = worldOffsetToCell(layout, position);
  return {
    row: Math.max(0, Math.min(layout.rows - 1, cell.row)),
    col: Math.max(0, Math.min(layout.columns - 1, cell.col))
  };
};

export const pickRandomCell = (cells: FloorCell[]) =>
  cells[Math.floor(Math.random() * cells.length)];

export const pickRandomHorizontalDirection = () => {
  const angle = Math.random() * Math.PI * 2;
  return new Vector3(Math.cos(angle), 0, Math.sin(angle));
};
