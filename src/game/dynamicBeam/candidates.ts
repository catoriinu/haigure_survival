import { GridLayout } from "../../world/grid";
import { DynamicBeamCell, DynamicBeamSet } from "./types";

const getCellCenterXZ = (layout: GridLayout, row: number, col: number) => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  return {
    x: -halfWidth + layout.cellSize / 2 + col * layout.cellSize,
    z: -halfDepth + layout.cellSize / 2 + row * layout.cellSize
  };
};

const isDynamicBeamCell = (
  layout: GridLayout,
  zoneMap: string[][] | null,
  row: number,
  col: number
) =>
  zoneMap !== null &&
  layout.cells[row][col] === "floor" &&
  zoneMap[row][col] === "D";

export const buildDynamicBeamSets = (
  layout: GridLayout,
  zoneMap: string[][] | null
): DynamicBeamSet[] => {
  if (!zoneMap) {
    return [];
  }

  const visited = Array.from({ length: layout.rows }, () =>
    Array.from({ length: layout.columns }, () => false)
  );
  const sets: DynamicBeamSet[] = [];

  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.columns; col += 1) {
      if (visited[row][col]) {
        continue;
      }
      if (!isDynamicBeamCell(layout, zoneMap, row, col)) {
        continue;
      }

      const queue = [{ row, col }];
      visited[row][col] = true;
      const cells: DynamicBeamCell[] = [];
      let centerXSum = 0;
      let centerZSum = 0;

      while (queue.length > 0) {
        const current = queue.shift()!;
        const center = getCellCenterXZ(layout, current.row, current.col);
        cells.push({
          row: current.row,
          col: current.col,
          centerX: center.x,
          centerZ: center.z
        });
        centerXSum += center.x;
        centerZSum += center.z;

        const neighbors = [
          { row: current.row - 1, col: current.col },
          { row: current.row + 1, col: current.col },
          { row: current.row, col: current.col - 1 },
          { row: current.row, col: current.col + 1 }
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
          if (visited[neighbor.row][neighbor.col]) {
            continue;
          }
          if (!isDynamicBeamCell(layout, zoneMap, neighbor.row, neighbor.col)) {
            continue;
          }
          visited[neighbor.row][neighbor.col] = true;
          queue.push(neighbor);
        }
      }

      if (cells.length > 0) {
        sets.push({
          cells,
          centerX: centerXSum / cells.length,
          centerZ: centerZSum / cells.length
        });
      }
    }
  }

  return sets;
};
