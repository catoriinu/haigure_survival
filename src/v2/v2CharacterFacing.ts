import { Vector3 } from "@babylonjs/core";

const HORIZONTAL_DIRECTION_EPSILON_SQUARED = 0.000001;

const assertFiniteVector = (label: string, value: Vector3): void => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${label}には有限の3Dベクトルが必要です。`);
  }
};

export type V2CharacterFacingYawOptions = Readonly<{
  viewForward: Vector3;
  viewUp: Vector3;
  fallbackYaw: number;
}>;

export const resolveV2CharacterFacingYaw = ({
  viewForward,
  viewUp,
  fallbackYaw
}: V2CharacterFacingYawOptions): number => {
  assertFiniteVector("Character表示のカメラ前方", viewForward);
  assertFiniteVector("Character表示のカメラ上方", viewUp);
  if (!Number.isFinite(fallbackYaw)) {
    throw new Error("Character表示の予備yawには有限値が必要です。");
  }

  const horizontalForwardLengthSquared =
    viewForward.x * viewForward.x +
    viewForward.z * viewForward.z;
  if (
    horizontalForwardLengthSquared >
    HORIZONTAL_DIRECTION_EPSILON_SQUARED
  ) {
    return Math.atan2(viewForward.x, viewForward.z);
  }

  const horizontalUpLengthSquared =
    viewUp.x * viewUp.x + viewUp.z * viewUp.z;
  return horizontalUpLengthSquared >
    HORIZONTAL_DIRECTION_EPSILON_SQUARED
    ? Math.atan2(viewUp.x, viewUp.z)
    : fallbackYaw;
};

export const createV2CharacterBackwardDirection = (
  facingYaw: number
): Vector3 => {
  if (!Number.isFinite(facingYaw)) {
    throw new Error("Character表示のyawには有限値が必要です。");
  }
  return new Vector3(
    -Math.sin(facingYaw),
    0,
    -Math.cos(facingYaw)
  );
};
