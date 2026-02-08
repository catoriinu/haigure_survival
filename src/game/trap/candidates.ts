import { Vector3 } from "@babylonjs/core";
import { GridLayout } from "../../world/grid";
import { TrapCandidate } from "./types";

const getCellCenterXZ = (layout: GridLayout, row: number, col: number) => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  return {
    x: -halfWidth + layout.cellSize / 2 + col * layout.cellSize,
    z: -halfDepth + layout.cellSize / 2 + row * layout.cellSize
  };
};

export const buildTrapCandidates = (layout: GridLayout): TrapCandidate[] => {
  const candidates: TrapCandidate[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.columns; col += 1) {
      if (layout.cells[row][col] !== "floor") {
        continue;
      }
      const center = getCellCenterXZ(layout, row, col);
      candidates.push({
        kind: "floor",
        row,
        col,
        centerX: center.x,
        centerZ: center.z
      });
      if (row > 0 && layout.cells[row - 1][col] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "north",
          boundaryX: center.x,
          boundaryZ: center.z - layout.cellSize / 2,
          direction: new Vector3(0, 0, 1),
          rotationY: 0
        });
      }
      if (row < layout.rows - 1 && layout.cells[row + 1][col] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "south",
          boundaryX: center.x,
          boundaryZ: center.z + layout.cellSize / 2,
          direction: new Vector3(0, 0, -1),
          rotationY: Math.PI
        });
      }
      if (col > 0 && layout.cells[row][col - 1] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "west",
          boundaryX: center.x - layout.cellSize / 2,
          boundaryZ: center.z,
          direction: new Vector3(1, 0, 0),
          rotationY: -Math.PI / 2
        });
      }
      if (col < layout.columns - 1 && layout.cells[row][col + 1] === "wall") {
        candidates.push({
          kind: "wall",
          row,
          col,
          side: "east",
          boundaryX: center.x + layout.cellSize / 2,
          boundaryZ: center.z,
          direction: new Vector3(-1, 0, 0),
          rotationY: Math.PI / 2
        });
      }
    }
  }
  return candidates;
};
