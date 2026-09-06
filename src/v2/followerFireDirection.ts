import { Vector3 } from "@babylonjs/core";

export const V2_FOLLOWER_FIRE_SPREAD_DEGREES = 3;

const V2_FOLLOWER_FIRE_SPREAD_RADIANS =
  (V2_FOLLOWER_FIRE_SPREAD_DEGREES * Math.PI) / 180;

const requireUnitRandom = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`${name}には0以上1未満の有限値が必要です。`);
  }
};

export const createV2FollowerFireDirection = (
  sourceDirection: Vector3,
  yawRandom: number,
  pitchRandom: number
) => {
  if (
    !Number.isFinite(sourceDirection.x) ||
    !Number.isFinite(sourceDirection.y) ||
    !Number.isFinite(sourceDirection.z) ||
    sourceDirection.lengthSquared() === 0
  ) {
    throw new Error(
      "Follower射撃拡散の基準方向には有限の非ゼロベクトルが必要です。"
    );
  }
  requireUnitRandom("Follower射撃yaw乱数", yawRandom);
  requireUnitRandom("Follower射撃pitch乱数", pitchRandom);

  const normalized = sourceDirection.clone().normalize();
  const yaw =
    Math.atan2(normalized.x, normalized.z) +
    (yawRandom * 2 - 1) * V2_FOLLOWER_FIRE_SPREAD_RADIANS;
  const pitch =
    Math.asin(normalized.y) +
    (pitchRandom * 2 - 1) * V2_FOLLOWER_FIRE_SPREAD_RADIANS;
  const horizontalScale = Math.cos(pitch);
  return new Vector3(
    Math.sin(yaw) * horizontalScale,
    Math.sin(pitch),
    Math.cos(yaw) * horizontalScale
  ).normalize();
};
