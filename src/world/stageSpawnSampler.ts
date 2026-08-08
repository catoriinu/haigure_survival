import { Vector3 } from "@babylonjs/core";
import type { NavigationLocation, NavigationWorld } from "./navigationWorld";
import {
  createNavigationSurfaceVolumeChannelSampler,
  createNavigationSurfaceVolumeSampler,
  calculateNavigationSurfaceVolumeIntersectionArea,
  isVolumeFullyContainedByConvexVolume,
  type NavigationSurfaceVolumeChannelArea,
  type NavigationSurfaceVolumeArea
} from "./navigationSurfaceVolumeSampler";
import type { StageBoundary } from "./stageSpatialContext";
import {
  createStageBoundaryContainsQuery,
  NPC_SPAWN_BIAS_WEIGHT_MAXIMUM,
  NPC_SPAWN_BIAS_WEIGHT_MINIMUM,
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

export interface StageVolumeSpawnSampler {
  readonly areas: readonly NavigationSurfaceVolumeArea[];
  readonly totalArea: number;
  samplePoints(
    count: number,
    minimumDistance: number,
    acceptedPoints: readonly NavigationLocation[],
    excludes: (point: Vector3) => boolean
  ): readonly NavigationLocation[];
}

export interface StageNpcSpawnSampler {
  readonly channels: readonly NavigationSurfaceVolumeChannelArea[];
  readonly totalWeight: number;
  samplePoints(
    count: number,
    minimumDistance: number,
    acceptedPoints: readonly NavigationLocation[],
    excludes: (point: Vector3) => boolean
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

export const createStageVolumeSpawnSampler = (
  volumes: readonly StageVolume[],
  navigation: NavigationWorld,
  config: StageSpawnSamplerConfig
): StageVolumeSpawnSampler => {
  assertPositiveInteger("maxAttempts", config.maxAttempts);
  assertPositiveFiniteNumber(
    "projectionMaxDistance",
    config.projectionMaxDistance
  );
  if (typeof config.random !== "function") {
    throw new Error("randomには0以上1未満を返す関数が必要です。");
  }
  const surfaceTriangles = navigation.getSurfaceTriangles();
  const surfaceSampler = createNavigationSurfaceVolumeSampler(
    volumes.map((volume) =>
      Object.freeze({
        volume,
        triangles: surfaceTriangles
      })
    )
  );
  const containsByVolumeId = new Map(
    volumes.map((volume) => [
      volume.id,
      createStageBoundaryContainsQuery(volume.mesh)
    ])
  );

  const sampler: StageVolumeSpawnSampler = {
    areas: surfaceSampler.areas,
    totalArea: surfaceSampler.totalArea,
    samplePoints: (
      count: number,
      minimumDistance: number,
      acceptedPoints: readonly NavigationLocation[],
      excludes: (point: Vector3) => boolean
    ) => {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error("countには0以上の整数が必要です。");
      }
      assertNonNegativeFiniteNumber("minimumDistance", minimumDistance);
      if (typeof excludes !== "function") {
        throw new Error("excludesには位置判定関数が必要です。");
      }
      const points: NavigationLocation[] = [];
      const allAccepted = [...acceptedPoints];
      const minimumDistanceSquared = minimumDistance * minimumDistance;
      for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
        let selected: NavigationLocation | null = null;
        for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
          const sample = surfaceSampler.sample(config.random);
          const point = sample.point;
          const projected = navigation.projectPoint(
            point,
            config.projectionMaxDistance
          );
          if (
            !projected ||
            !containsByVolumeId.get(sample.volumeId)!(projected.position) ||
            excludes(projected.position)
          ) {
            continue;
          }
          if (
            allAccepted.some((accepted) => {
              const distanceSquared = Vector3.DistanceSquared(
                projected.position,
                accepted.position
              );
              return (
                distanceSquared === 0 ||
                distanceSquared < minimumDistanceSquared
              );
            })
          ) {
            continue;
          }
          selected = projected;
          break;
        }
        if (!selected) {
          throw new Error(
            `spawn Volumeの${pointIndex + 1}点目を` +
              `${config.maxAttempts}回以内に生成できませんでした。`
          );
        }
        points.push(selected);
        allAccepted.push(selected);
      }
      return Object.freeze(points);
    }
  };
  return Object.freeze(sampler);
};

export const createStageNpcSpawnSampler = (
  baseVolumes: readonly StageVolume[],
  biasVolumes: readonly StageVolume[],
  playerSpawnId: string,
  navigation: NavigationWorld,
  config: StageSpawnSamplerConfig
): StageNpcSpawnSampler => {
  assertPositiveInteger("maxAttempts", config.maxAttempts);
  assertPositiveFiniteNumber(
    "projectionMaxDistance",
    config.projectionMaxDistance
  );
  if (typeof config.random !== "function") {
    throw new Error("randomには0以上1未満を返す関数が必要です。");
  }
  if (playerSpawnId.length === 0 || playerSpawnId.trim() !== playerSpawnId) {
    throw new Error("playerSpawnIdには非空文字列が必要です。");
  }
  if (baseVolumes.length === 0) {
    throw new Error("npc_spawn Volumeがありません。");
  }
  if (biasVolumes.length === 0) {
    throw new Error(
      `選択player_spawnに対応するnpc_spawn_biasがありません: ${playerSpawnId}`
    );
  }

  const orderedBaseVolumes = Object.freeze(
    [...baseVolumes].sort((left, right) => left.id.localeCompare(right.id))
  );
  const orderedBiasVolumes = Object.freeze(
    [...biasVolumes].sort((left, right) => left.id.localeCompare(right.id))
  );
  for (const volume of orderedBaseVolumes) {
    if (volume.role !== "npc_spawn") {
      throw new Error(
        `基礎NPC spawn Volumeのroleがnpc_spawnではありません: ${volume.id}/${volume.role}`
      );
    }
  }
  for (const volume of orderedBiasVolumes) {
    if (
      volume.role !== "npc_spawn_bias" ||
      volume.playerSpawnId !== playerSpawnId
    ) {
      throw new Error(
        `npc_spawn_biasのplayer_spawn対応が不正です: ${volume.id}/${volume.role}/${volume.playerSpawnId ?? "null"}/${playerSpawnId}`
      );
    }
    if (
      volume.npcSpawnBiasWeight === null ||
      !Number.isFinite(volume.npcSpawnBiasWeight) ||
      volume.npcSpawnBiasWeight < NPC_SPAWN_BIAS_WEIGHT_MINIMUM ||
      volume.npcSpawnBiasWeight > NPC_SPAWN_BIAS_WEIGHT_MAXIMUM
    ) {
      throw new Error(
        `npc_spawn_bias weightは${NPC_SPAWN_BIAS_WEIGHT_MINIMUM}以上` +
          `${NPC_SPAWN_BIAS_WEIGHT_MAXIMUM}以下が必要です: ${volume.id}/${volume.npcSpawnBiasWeight}`
      );
    }
    const containingBaseVolumes = orderedBaseVolumes.filter((baseVolume) =>
      isVolumeFullyContainedByConvexVolume(volume, baseVolume)
    );
    if (containingBaseVolumes.length !== 1) {
      throw new Error(
        `npc_spawn_biasは単一npc_spawn Volumeへ完全内包する必要があります: ${volume.id}/${containingBaseVolumes.length}件`
      );
    }
  }

  const surfaceTriangles = navigation.getSurfaceTriangles();
  for (let leftIndex = 0; leftIndex < orderedBiasVolumes.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < orderedBiasVolumes.length;
      rightIndex += 1
    ) {
      const overlapArea = calculateNavigationSurfaceVolumeIntersectionArea(
        Object.freeze([
          orderedBiasVolumes[leftIndex],
          orderedBiasVolumes[rightIndex]
        ]),
        surfaceTriangles
      );
      if (overlapArea > 1e-10) {
        throw new Error(
          `同じplayer_spawnのnpc_spawn_biasがbaked NavMesh上で正面積重複しています: ${playerSpawnId}/${orderedBiasVolumes[leftIndex].id}/${orderedBiasVolumes[rightIndex].id}/${overlapArea}`
        );
      }
    }
  }

  const channelSampler = createNavigationSurfaceVolumeChannelSampler(
    Object.freeze([
      Object.freeze({
        id: "npc-spawn-base",
        weight: 1,
        sources: Object.freeze(
          orderedBaseVolumes.map((volume) =>
            Object.freeze({ volume, triangles: surfaceTriangles })
          )
        )
      }),
      ...orderedBiasVolumes.map((volume) =>
        Object.freeze({
          id: `npc-spawn-bias:${volume.id}`,
          weight: volume.npcSpawnBiasWeight!,
          sources: Object.freeze([
            Object.freeze({ volume, triangles: surfaceTriangles })
          ])
        })
      )
    ])
  );
  const sourceContainsByVolumeId = new Map(
    [...orderedBaseVolumes, ...orderedBiasVolumes].map((volume) => [
      volume.id,
      createStageBoundaryContainsQuery(volume.mesh)
    ])
  );
  const baseContains = orderedBaseVolumes.map((volume) =>
    createStageBoundaryContainsQuery(volume.mesh)
  );

  return Object.freeze({
    channels: channelSampler.channels,
    totalWeight: channelSampler.totalWeight,
    samplePoints: (
      count: number,
      minimumDistance: number,
      acceptedPoints: readonly NavigationLocation[],
      excludes: (point: Vector3) => boolean
    ) => {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error("countには0以上の整数が必要です。");
      }
      assertNonNegativeFiniteNumber("minimumDistance", minimumDistance);
      if (typeof excludes !== "function") {
        throw new Error("excludesには位置判定関数が必要です。");
      }
      const points: NavigationLocation[] = [];
      const allAccepted = [...acceptedPoints];
      const minimumDistanceSquared = minimumDistance * minimumDistance;
      for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
        let selected: NavigationLocation | null = null;
        for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
          const sample = channelSampler.sample(config.random);
          const projected = navigation.projectPoint(
            sample.point,
            config.projectionMaxDistance
          );
          if (
            !projected ||
            !sourceContainsByVolumeId.get(sample.volumeId)!(
              projected.position
            ) ||
            !baseContains.some((contains) => contains(projected.position)) ||
            excludes(projected.position)
          ) {
            continue;
          }
          if (
            allAccepted.some((accepted) => {
              const distanceSquared = Vector3.DistanceSquared(
                projected.position,
                accepted.position
              );
              return (
                distanceSquared === 0 ||
                distanceSquared < minimumDistanceSquared
              );
            })
          ) {
            continue;
          }
          selected = projected;
          break;
        }
        if (!selected) {
          throw new Error(
            `bias付きspawn Volumeの${pointIndex + 1}点目を` +
              `${config.maxAttempts}回以内に生成できませんでした。`
          );
        }
        points.push(selected);
        allAccepted.push(selected);
      }
      return Object.freeze(points);
    }
  });
};
