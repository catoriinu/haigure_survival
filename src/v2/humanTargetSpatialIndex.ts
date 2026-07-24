import type { Vector3 } from "@babylonjs/core";

import type { V2HumanTargetSnapshot } from "./combatTypes";

export type V2HumanTargetSpatialIndex = Readonly<{
  query(position: Vector3, radius: number): readonly V2HumanTargetSnapshot[];
}>;

const cellKey = (x: number, z: number) => `${x}:${z}`;

export const createV2HumanTargetSpatialIndex = (
  targets: readonly V2HumanTargetSnapshot[],
  cellSize: number
): V2HumanTargetSpatialIndex => {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error("標的空間索引のcellSizeには正の有限値が必要です。");
  }

  const cells = new Map<string, number[]>();
  targets.forEach((target, index) => {
    const cellX = Math.floor(target.aimPosition.x / cellSize);
    const cellZ = Math.floor(target.aimPosition.z / cellSize);
    const key = cellKey(cellX, cellZ);
    const indices = cells.get(key) ?? [];
    indices.push(index);
    cells.set(key, indices);
  });

  return Object.freeze({
    query: (position, radius) => {
      if (!Number.isFinite(radius) || radius < 0) {
        throw new Error("標的空間索引の検索半径には0以上の有限値が必要です。");
      }
      const minimumCellX = Math.floor((position.x - radius) / cellSize);
      const maximumCellX = Math.floor((position.x + radius) / cellSize);
      const minimumCellZ = Math.floor((position.z - radius) / cellSize);
      const maximumCellZ = Math.floor((position.z + radius) / cellSize);
      const candidateIndices: number[] = [];
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
          candidateIndices.push(...(cells.get(cellKey(cellX, cellZ)) ?? []));
        }
      }
      candidateIndices.sort((left, right) => left - right);
      return Object.freeze(candidateIndices.map((index) => targets[index]));
    }
  });
};
