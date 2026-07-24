import { Vector3 } from "@babylonjs/core";
import type { NavigationLocation, NavigationWorld } from "./navigationWorld";
import type { StageBoundary } from "./stageSpatialContext";
import {
  createStageBoundaryContainsQuery,
  type StageVolume
} from "./stageSpatialQueries";

export type StageSpawnSamplerConfig = Readonly<{
  maxAttempts: number;
  projectionMaxDistance: number;
  random: () => number;
}>;

export interface StageSpawnSampler {
  samplePoint(): NavigationLocation;
  samplePoints(
    count: number,
    minimumDistance: number
  ): readonly NavigationLocation[];
}

type StageSpawnRegion = Readonly<{
  id: string;
  mesh: StageVolume["mesh"];
  contains(point: Vector3): boolean;
  excludes(point: Vector3): boolean;
}>;

type RejectionCounts = {
  outsideVolume: number;
  projectionFailed: number;
  projectedOutsideVolume: number;
  excluded: number;
  duplicate: number;
  minimumDistance: number;
};

const assertPositiveInteger = (name: string, value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}には1以上の整数が必要です。`);
  }
};

const assertPositiveFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}には0より大きい有限値が必要です。`);
  }
};

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const createRejectionCounts = (): RejectionCounts => ({
  outsideVolume: 0,
  projectionFailed: 0,
  projectedOutsideVolume: 0,
  excluded: 0,
  duplicate: 0,
  minimumDistance: 0
});

const formatRejectionCounts = (counts: RejectionCounts) =>
  [
    `volume外=${counts.outsideVolume}`,
    `NavMesh投影失敗=${counts.projectionFailed}`,
    `投影後volume外=${counts.projectedOutsideVolume}`,
    `除外領域=${counts.excluded}`,
    `重複=${counts.duplicate}`,
    `最小距離不足=${counts.minimumDistance}`
  ].join(" / ");

const createSpawnSampler = (
  region: StageSpawnRegion,
  navigation: NavigationWorld,
  config: StageSpawnSamplerConfig
): StageSpawnSampler => {
  assertPositiveInteger("maxAttempts", config.maxAttempts);
  assertPositiveFiniteNumber(
    "projectionMaxDistance",
    config.projectionMaxDistance
  );
  if (typeof config.random !== "function") {
    throw new Error("randomには0以上1未満を返す関数が必要です。");
  }

  region.mesh.computeWorldMatrix(true);
  const boundingBox = region.mesh.getBoundingInfo().boundingBox;
  const minimum = boundingBox.minimumWorld.clone();
  const maximum = boundingBox.maximumWorld.clone();
  assertFiniteVector("volumeのworld AABB最小点", minimum);
  assertFiniteVector("volumeのworld AABB最大点", maximum);

  const extent = maximum.subtract(minimum);
  assertPositiveFiniteNumber("volumeのworld AABB幅", extent.x);
  assertPositiveFiniteNumber("volumeのworld AABB高さ", extent.y);
  assertPositiveFiniteNumber("volumeのworld AABB奥行き", extent.z);

  const nextRandom = () => {
    const value = config.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `randomは0以上1未満の有限値を返す必要があります: ${value}`
      );
    }
    return value;
  };
  const sampleAabbPoint = () =>
    new Vector3(
      minimum.x + extent.x * nextRandom(),
      minimum.y + extent.y * nextRandom(),
      minimum.z + extent.z * nextRandom()
    );

  const samplePointInternal = (
    acceptedPoints: readonly NavigationLocation[],
    minimumDistance: number,
    pointNumber: number
  ) => {
    const rejectionCounts = createRejectionCounts();
    const minimumDistanceSquared = minimumDistance * minimumDistance;

    for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
      const candidate = sampleAabbPoint();
      if (!region.contains(candidate)) {
        rejectionCounts.outsideVolume += 1;
        continue;
      }

      const projected = navigation.projectPoint(
        candidate,
        config.projectionMaxDistance
      );
      if (!projected) {
        rejectionCounts.projectionFailed += 1;
        continue;
      }
      if (!region.contains(projected.position)) {
        rejectionCounts.projectedOutsideVolume += 1;
        continue;
      }
      if (region.excludes(projected.position)) {
        rejectionCounts.excluded += 1;
        continue;
      }

      let rejected = false;
      for (const acceptedPoint of acceptedPoints) {
        const distanceSquared = Vector3.DistanceSquared(
          projected.position,
          acceptedPoint.position
        );
        if (distanceSquared === 0) {
          rejectionCounts.duplicate += 1;
          rejected = true;
          break;
        }
        if (distanceSquared < minimumDistanceSquared) {
          rejectionCounts.minimumDistance += 1;
          rejected = true;
          break;
        }
      }
      if (!rejected) {
        return projected;
      }
    }

    throw new Error(
      `spawn領域「${region.id}」の${pointNumber}点目を` +
        `${config.maxAttempts}回以内に生成できませんでした。` +
        ` ${formatRejectionCounts(rejectionCounts)}`
    );
  };

  return {
    samplePoint: () => samplePointInternal([], 0, 1),
    samplePoints: (count, minimumDistance) => {
      assertPositiveInteger("count", count);
      assertNonNegativeFiniteNumber("minimumDistance", minimumDistance);
      const points: NavigationLocation[] = [];
      for (let index = 0; index < count; index += 1) {
        points.push(
          samplePointInternal(points, minimumDistance, index + 1)
        );
      }
      return Object.freeze(points);
    }
  };
};

export const createStageSpawnSampler = (
  volume: StageVolume,
  navigation: NavigationWorld,
  config: StageSpawnSamplerConfig
): StageSpawnSampler =>
  createSpawnSampler(
    {
      id: volume.id,
      mesh: volume.mesh,
      contains: createStageBoundaryContainsQuery(volume.mesh),
      excludes: () => false
    },
    navigation,
    config
  );

export const createStageBoundarySpawnSampler = (
  boundary: StageBoundary,
  navigation: NavigationWorld,
  config: StageSpawnSamplerConfig,
  excludes: (point: Vector3) => boolean
): StageSpawnSampler =>
  createSpawnSampler(
    {
      id: boundary.id,
      mesh: boundary.mesh,
      contains: boundary.contains,
      excludes
    },
    navigation,
    config
  );
