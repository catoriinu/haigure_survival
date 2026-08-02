import type { Vector3 } from "@babylonjs/core";

export type V2PlanarSpatialIndex<T> = Readonly<{
  query(position: Vector3, radius: number): readonly T[];
}>;

const cellKey = (x: number, z: number) => `${x}:${z}`;

export const createV2PlanarSpatialIndex = <T>(
  items: readonly T[],
  getPosition: (item: T) => Vector3,
  cellSize: number
): V2PlanarSpatialIndex<T> => {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error("平面空間索引のcellSizeには正の有限値が必要です。");
  }

  const cells = new Map<string, number[]>();
  items.forEach((item, index) => {
    const position = getPosition(item);
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new Error("平面空間索引の要素位置には有限の3D座標が必要です。");
    }
    const key = cellKey(
      Math.floor(position.x / cellSize),
      Math.floor(position.z / cellSize)
    );
    const indices = cells.get(key) ?? [];
    indices.push(index);
    cells.set(key, indices);
  });

  return Object.freeze({
    query: (position, radius) => {
      if (
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)
      ) {
        throw new Error("平面空間索引の検索位置には有限の3D座標が必要です。");
      }
      if (!Number.isFinite(radius) || radius < 0) {
        throw new Error("平面空間索引の検索半径には0以上の有限値が必要です。");
      }
      const minimumCellX = Math.floor((position.x - radius) / cellSize);
      const maximumCellX = Math.floor((position.x + radius) / cellSize);
      const minimumCellZ = Math.floor((position.z - radius) / cellSize);
      const maximumCellZ = Math.floor((position.z + radius) / cellSize);
      const candidateIndices: number[] = [];
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
          const indices = cells.get(cellKey(cellX, cellZ));
          if (!indices) {
            continue;
          }
          for (const index of indices) {
            candidateIndices.push(index);
          }
        }
      }
      candidateIndices.sort((left, right) => left - right);
      return Object.freeze(
        candidateIndices.map((index) => items[index])
      );
    }
  });
};
