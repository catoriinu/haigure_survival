import { Vector3 } from "@babylonjs/core";

import type { V2CharacterState } from "./combatTypes";
import type { V2CharacterVisualRuntime } from "./v2CharacterVisualRuntime";

const FIRST_PERSON_START_ANGLE_RADIANS = (55 * Math.PI) / 180;
const FIRST_PERSON_MAX_ANGLE_RADIANS = Math.PI / 2;
const FIRST_PERSON_MAX_FORWARD_OFFSET = 0.04;
const HORIZONTAL_DIRECTION_EPSILON_SQUARED = 0.000001;

export type V2FirstPersonCharacterVisualFrame = Readonly<{
  visible: boolean;
  alpha: number;
  position: Vector3;
}>;

export type V2FirstPersonCharacterVisualFrameOptions = Readonly<{
  active: boolean;
  footPosition: Vector3;
  viewForward: Vector3;
  spriteHeight: number;
}>;

const assertFiniteVector = (label: string, value: Vector3): void => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${label}には有限の3Dベクトルが必要です。`);
  }
};

const assertPositiveFiniteNumber = (label: string, value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}には0より大きい有限値が必要です。`);
  }
};

const smoothstep = (value: number): number =>
  value * value * (3 - 2 * value);

export const resolveV2FirstPersonCharacterVisualFrame = ({
  active,
  footPosition,
  viewForward,
  spriteHeight
}: V2FirstPersonCharacterVisualFrameOptions):
  V2FirstPersonCharacterVisualFrame => {
  assertFiniteVector("プレイヤー画像の足元位置", footPosition);
  assertFiniteVector("プレイヤー画像の視線方向", viewForward);
  assertPositiveFiniteNumber("プレイヤー画像の高さ", spriteHeight);
  const normalizedForward = viewForward.clone();
  if (normalizedForward.lengthSquared() === 0) {
    throw new Error("プレイヤー画像の視線方向をゼロベクトルにできません。");
  }
  normalizedForward.normalize();
  const downwardAngle = Math.asin(
    Math.max(0, Math.min(1, -normalizedForward.y))
  );
  const linearBlend = Math.max(
    0,
    Math.min(
      1,
      (downwardAngle - FIRST_PERSON_START_ANGLE_RADIANS) /
        (FIRST_PERSON_MAX_ANGLE_RADIANS -
          FIRST_PERSON_START_ANGLE_RADIANS)
    )
  );
  const alpha = active ? smoothstep(linearBlend) : 0;
  const position = footPosition.clone();
  const horizontalForward = new Vector3(
    normalizedForward.x,
    0,
    normalizedForward.z
  );
  if (
    alpha > 0 &&
    horizontalForward.lengthSquared() >
      HORIZONTAL_DIRECTION_EPSILON_SQUARED
  ) {
    horizontalForward.normalize();
    position.addInPlace(
      horizontalForward.scale(
        FIRST_PERSON_MAX_FORWARD_OFFSET * alpha
      )
    );
  }
  position.y += spriteHeight / 2;
  return Object.freeze({
    visible: alpha > 0,
    alpha,
    position
  });
};

export type V2PlayerCharacterVisualUpdate = Readonly<{
  active: boolean;
  state: V2CharacterState;
  footPosition: Vector3;
  viewForward: Vector3;
}>;

export interface V2PlayerCharacterVisual {
  update(update: V2PlayerCharacterVisualUpdate): void;
  clear(): void;
  dispose(): void;
}

export const createV2PlayerCharacterVisual = (
  characterVisuals: V2CharacterVisualRuntime
): V2PlayerCharacterVisual => {
  const handle = characterVisuals.createSprite(
    "player",
    "V2PlayerCharacterSprite"
  );
  const sprite = handle.sprite;
  sprite.isPickable = false;
  sprite.isVisible = false;
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("V2プレイヤーCharacter表示は破棄済みです。");
    }
  };

  const clear = (): void => {
    sprite.isVisible = false;
    sprite.color.a = 0;
  };

  return Object.freeze({
    update: (update: V2PlayerCharacterVisualUpdate) => {
      assertActive();
      const { active, state, footPosition, viewForward } = update;
      handle.setState(state, false);
      const frame = resolveV2FirstPersonCharacterVisualFrame({
        active,
        footPosition,
        viewForward,
        spriteHeight: handle.height
      });
      sprite.position.copyFrom(frame.position);
      sprite.color.a = frame.alpha;
      sprite.isVisible = frame.visible;
    },
    clear: () => {
      assertActive();
      clear();
    },
    dispose: () => {
      assertActive();
      clear();
      handle.dispose();
      disposed = true;
    }
  });
};
