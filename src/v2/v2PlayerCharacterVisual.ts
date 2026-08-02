import { Vector3 } from "@babylonjs/core";

import type { V2CharacterState } from "./combatTypes";
import { createV2CharacterBackwardDirection } from "./v2CharacterFacing";
import type { V2CharacterVisualRuntime } from "./v2CharacterVisualRuntime";

const FIRST_PERSON_START_ANGLE_RADIANS = (55 * Math.PI) / 180;
const FIRST_PERSON_MAX_ANGLE_RADIANS = Math.PI / 2;
const FIRST_PERSON_MAX_HORIZONTAL_OFFSET = (1 / 3) * 0.14;
const FIRST_PERSON_MAX_VERTICAL_OFFSET = (1 / 3) * 0.17;

export type V2FirstPersonCharacterVisualFrame = Readonly<{
  visible: boolean;
  alpha: number;
  position: Vector3;
  cameraRenderOffset: Vector3;
}>;

export type V2FirstPersonCharacterVisualFrameOptions = Readonly<{
  active: boolean;
  footPosition: Vector3;
  viewForward: Vector3;
  facingYaw: number;
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
  facingYaw,
  spriteHeight
}: V2FirstPersonCharacterVisualFrameOptions):
  V2FirstPersonCharacterVisualFrame => {
  assertFiniteVector("プレイヤー画像の足元位置", footPosition);
  assertFiniteVector("プレイヤー画像の視線方向", viewForward);
  if (!Number.isFinite(facingYaw)) {
    throw new Error("プレイヤー画像のyawには有限値が必要です。");
  }
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
  const cameraRenderOffset = Vector3.Zero();
  if (alpha > 0) {
    const backward = createV2CharacterBackwardDirection(facingYaw);
    const horizontalOffset =
      FIRST_PERSON_MAX_HORIZONTAL_OFFSET * alpha;
    cameraRenderOffset.copyFrom(backward);
    cameraRenderOffset.scaleInPlace(horizontalOffset);
    position.addInPlace(backward.scale(horizontalOffset * 2));
    cameraRenderOffset.y =
      FIRST_PERSON_MAX_VERTICAL_OFFSET * alpha;
  }
  position.y += spriteHeight / 2;
  return Object.freeze({
    visible: alpha > 0,
    alpha,
    position,
    cameraRenderOffset
  });
};

export type V2PlayerCharacterVisualUpdate = Readonly<{
  active: boolean;
  state: V2CharacterState;
  footPosition: Vector3;
  viewForward: Vector3;
  facingYaw: number;
}>;

export interface V2PlayerCharacterVisual {
  update(update: V2PlayerCharacterVisualUpdate): void;
  getCameraRenderOffset(): Vector3;
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
  const cameraRenderOffset = Vector3.Zero();
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("V2プレイヤーCharacter表示は破棄済みです。");
    }
  };

  const clear = (): void => {
    sprite.isVisible = false;
    sprite.color.a = 0;
    cameraRenderOffset.setAll(0);
    handle.syncPresentation();
  };

  return Object.freeze({
    update: (update: V2PlayerCharacterVisualUpdate) => {
      assertActive();
      const { active, state, footPosition, viewForward, facingYaw } = update;
      handle.setState(state, false);
      const frame = resolveV2FirstPersonCharacterVisualFrame({
        active,
        footPosition,
        viewForward,
        facingYaw,
        spriteHeight: handle.height
      });
      sprite.position.copyFrom(frame.position);
      sprite.color.a = frame.alpha;
      sprite.isVisible = frame.visible;
      cameraRenderOffset.copyFrom(frame.cameraRenderOffset);
      handle.syncPresentation();
    },
    getCameraRenderOffset: () => {
      assertActive();
      return cameraRenderOffset.clone();
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
