import type { Vector3 } from "@babylonjs/core";

export type V2PlanarSpatialIndex<T> = Readonly<{
  rebuild(items: readonly T[]): void;
  queryToRef(position: Vector3, radius: number, result: T[]): T[];
}>;

const compareSourceIndices = (left: number, right: number): number =>
  left - right;

export const createV2PlanarSpatialIndex = <T>(
  getPosition: (item: T) => Vector3,
  cellSize: number
): V2PlanarSpatialIndex<T> => {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error("平面空間索引のcellSizeには正の有限値が必要です。");
  }

  const cellsByX = new Map<number, Map<number, number[]>>();
  const unusedColumns: Map<number, number[]>[] = [];
  const unusedBuckets: number[][] = [];
  const candidateIndices: number[] = [];
  let indexedItems: readonly T[] = Object.freeze([]);

  const releaseCells = (): void => {
    for (const column of cellsByX.values()) {
      for (const bucket of column.values()) {
        bucket.length = 0;
        unusedBuckets.push(bucket);
      }
      column.clear();
      unusedColumns.push(column);
    }
    cellsByX.clear();
  };

  return Object.freeze({
    rebuild: (items) => {
      releaseCells();
      indexedItems = items;
      for (let index = 0; index < items.length; index += 1) {
        const position = getPosition(items[index]);
        if (
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.y) ||
          !Number.isFinite(position.z)
        ) {
          throw new Error("平面空間索引の要素位置には有限の3D座標が必要です。");
        }
        const cellX = Math.floor(position.x / cellSize);
        const cellZ = Math.floor(position.z / cellSize);
        let column = cellsByX.get(cellX);
        if (column === undefined) {
          column = unusedColumns.pop() ?? new Map<number, number[]>();
          cellsByX.set(cellX, column);
        }
        let bucket = column.get(cellZ);
        if (bucket === undefined) {
          bucket = unusedBuckets.pop() ?? [];
          column.set(cellZ, bucket);
        }
        bucket.push(index);
      }
    },
    queryToRef: (position, radius, result) => {
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
      result.length = 0;
      candidateIndices.length = 0;
      const minimumCellX = Math.floor((position.x - radius) / cellSize);
      const maximumCellX = Math.floor((position.x + radius) / cellSize);
      const minimumCellZ = Math.floor((position.z - radius) / cellSize);
      const maximumCellZ = Math.floor((position.z + radius) / cellSize);
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        const column = cellsByX.get(cellX);
        if (column === undefined) {
          continue;
        }
        for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
          const bucket = column.get(cellZ);
          if (bucket === undefined) {
            continue;
          }
          for (const index of bucket) {
            candidateIndices.push(index);
          }
        }
      }
      candidateIndices.sort(compareSourceIndices);
      for (const index of candidateIndices) {
        result.push(indexedItems[index]);
      }
      return result;
    }
  });
};
