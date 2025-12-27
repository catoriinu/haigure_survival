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
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  return new Vector3(
    -halfWidth + layout.cellSize / 2 + cell.col * layout.cellSize,
    y,
    -halfDepth + layout.cellSize / 2 + cell.row * layout.cellSize
  );
};

export const pickRandomCell = (cells: FloorCell[]) =>
  cells[Math.floor(Math.random() * cells.length)];

export const pickRandomHorizontalDirection = () => {
  const angle = Math.random() * Math.PI * 2;
  return new Vector3(Math.cos(angle), 0, Math.sin(angle));
};
