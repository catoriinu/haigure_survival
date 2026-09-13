import { Vector3 } from "@babylonjs/core";

import type { StageAssemblyVenue } from "../world/stageSpatialContext";

const requireCount = (
  count: number,
  capacity: number,
  layoutName: string
) => {
  if (!Number.isInteger(count) || count < 1 || count > capacity) {
    throw new Error(
      `${layoutName}人数は1以上${capacity}以下の整数が必要です: ${count}`
    );
  }
};

const createReducedLayout = (
  center: Vector3,
  authoredPositions: readonly Vector3[],
  count: number,
  layoutName: string
): readonly Vector3[] => {
  const capacity = authoredPositions.length;
  if (capacity === 0) {
    throw new Error(`${layoutName}作者座標が空です`);
  }
  requireCount(count, capacity, layoutName);
  if (count === capacity) {
    return Object.freeze(
      authoredPositions.map((position) => position.clone())
    );
  }
  if (count === 1) {
    return Object.freeze([center.clone()]);
  }

  const maximumAuthorRadius = Math.max(
    ...authoredPositions.map((position) =>
      Math.hypot(position.x - center.x, position.z - center.z)
    )
  );
  if (!Number.isFinite(maximumAuthorRadius) || maximumAuthorRadius <= 0) {
    throw new Error(`${layoutName}作者座標の最大半径には正数が必要です`);
  }
  const radius = maximumAuthorRadius * Math.sqrt(count / capacity);
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * 2 * index / count;
      return new Vector3(
        center.x + radius * Math.cos(angle),
        center.y,
        center.z + radius * Math.sin(angle)
      );
    })
  );
};

const createFullRadiusCircularLayout = (
  center: Vector3,
  authoredPositions: readonly Vector3[],
  count: number,
  layoutName: string
): readonly Vector3[] => {
  const maximumAuthorRadius = Math.max(
    ...authoredPositions.map((position) =>
      Math.hypot(position.x - center.x, position.z - center.z)
    )
  );
  if (!Number.isFinite(maximumAuthorRadius) || maximumAuthorRadius <= 0) {
    throw new Error(`${layoutName}作者座標の最大半径には正数が必要です`);
  }
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const angle = Math.PI * 2 * index / count;
      return new Vector3(
        center.x + maximumAuthorRadius * Math.cos(angle),
        center.y,
        center.z + maximumAuthorRadius * Math.sin(angle)
      );
    })
  );
};

export const selectAssemblyVenueByWeight = (
  venues: readonly StageAssemblyVenue[],
  randomUnit: number
): StageAssemblyVenue => {
  if (venues.length === 0) {
    throw new Error("選択可能な集合会場がありません");
  }
  if (
    !Number.isFinite(randomUnit) ||
    randomUnit < 0 ||
    randomUnit >= 1
  ) {
    throw new Error(`乱数には0以上1未満の有限数が必要です: ${randomUnit}`);
  }

  let totalWeight = 0;
  for (const venue of venues) {
    if (
      !Number.isFinite(venue.selectionWeight) ||
      venue.selectionWeight <= 0
    ) {
      throw new Error(
        `集合会場の選択weightには正数が必要です: ${venue.id}`
      );
    }
    totalWeight += venue.selectionWeight;
  }
  if (!Number.isFinite(totalWeight)) {
    throw new Error("集合会場の選択weight合計が有限数ではありません");
  }

  const threshold = randomUnit * totalWeight;
  let cumulativeWeight = 0;
  for (const venue of venues) {
    cumulativeWeight += venue.selectionWeight;
    if (threshold < cumulativeWeight) {
      return venue;
    }
  }
  throw new Error("集合会場の重み付き選択結果を確定できません");
};

export const createAssemblyPositions = (
  venue: StageAssemblyVenue,
  count: number
): readonly Vector3[] =>
  createReducedLayout(
    venue.center,
    venue.assemblyPositions,
    count,
    "集合配置"
  );

export const createExecutionAudiencePositions = (
  venue: StageAssemblyVenue,
  count: number
): readonly Vector3[] => {
  const authoredCapacity = venue.executionAudiencePositions.length;
  const maximumAudienceCount =
    venue.assemblyPositions.length - 1;
  requireCount(
    count,
    maximumAudienceCount,
    "公開処刑観客配置"
  );
  return count <= authoredCapacity
    ? createReducedLayout(
        venue.center,
        venue.executionAudiencePositions,
        count,
        "公開処刑観客配置"
      )
    : createFullRadiusCircularLayout(
        venue.center,
        venue.executionAudiencePositions,
        count,
        "公開処刑観客配置"
      );
};

export const createExecutionTargetPositions = (
  venue: StageAssemblyVenue,
  count: number
): readonly Vector3[] =>
  createReducedLayout(
    venue.center,
    venue.executionTargetPositions,
    count,
    "公開処刑対象配置"
  );
