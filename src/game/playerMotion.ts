import { Vector3 } from "@babylonjs/core";

export type PlayerMoveAxes = Readonly<{
  moveX: number;
  moveZ: number;
}>;

export type PlayerMotionConfig = {
  moveInertiaAt60Fps: number;
  moveStopEpsilon: number;
  collisionEpsilon: number;
};

export type PlayerMotionController = {
  reset: () => void;
  update: (
    moveAxes: PlayerMoveAxes,
    horizontalFacingYaw: number,
    delta: number,
    allowMove: boolean,
    moveSpeed: number
  ) => Vector3;
  commit: (actualDisplacement: Vector3) => void;
};

export const createPlayerMotionController = ({
  moveInertiaAt60Fps,
  moveStopEpsilon,
  collisionEpsilon
}: PlayerMotionConfig): PlayerMotionController => {
  const moveMomentum = Vector3.Zero();
  const requestedDisplacement = Vector3.Zero();
  const inputDisplacement = Vector3.Zero();
  const deferredDisplacement = Vector3.Zero();
  const forward = Vector3.Zero();
  const right = Vector3.Zero();
  const moveDirection = Vector3.Zero();
  const moveStopEpsilonSq = moveStopEpsilon * moveStopEpsilon;
  const collisionEpsilonSq = collisionEpsilon * collisionEpsilon;
  let deferredMoveAxisX = 0;
  let deferredMoveAxisZ = 0;
  let hasDeferredMoveAxes = false;
  let pendingFrameInertia = moveInertiaAt60Fps;

  const clearDeferredDisplacement = () => {
    deferredDisplacement.set(0, 0, 0);
    deferredMoveAxisX = 0;
    deferredMoveAxisZ = 0;
    hasDeferredMoveAxes = false;
  };

  const reset = () => {
    moveMomentum.set(0, 0, 0);
    requestedDisplacement.set(0, 0, 0);
    inputDisplacement.set(0, 0, 0);
    clearDeferredDisplacement();
    pendingFrameInertia = moveInertiaAt60Fps;
  };

  return {
    reset,
    update: (moveAxes, horizontalFacingYaw, delta, allowMove, moveSpeed) => {
      if (!allowMove) {
        reset();
        return requestedDisplacement;
      }

      pendingFrameInertia = Math.pow(moveInertiaAt60Fps, delta * 60);
      requestedDisplacement.copyFrom(moveMomentum);
      moveDirection.set(0, 0, 0);
      const hasMoveAxes = moveAxes.moveX !== 0 || moveAxes.moveZ !== 0;
      let hasMoveInput = false;
      let normalizedMoveAxisX = 0;
      let normalizedMoveAxisZ = 0;

      if (hasMoveAxes) {
        const moveAxisLength = Math.hypot(moveAxes.moveX, moveAxes.moveZ);
        normalizedMoveAxisX = moveAxes.moveX / moveAxisLength;
        normalizedMoveAxisZ = moveAxes.moveZ / moveAxisLength;
        forward.set(
          Math.sin(horizontalFacingYaw),
          0,
          Math.cos(horizontalFacingYaw)
        );
        right.set(
          Math.cos(horizontalFacingYaw),
          0,
          -Math.sin(horizontalFacingYaw)
        );
        if (moveAxes.moveZ !== 0) {
          moveDirection.addInPlace(forward.scale(moveAxes.moveZ));
        }
        if (moveAxes.moveX !== 0) {
          moveDirection.addInPlace(right.scale(moveAxes.moveX));
        }
        inputDisplacement.copyFrom(moveDirection);
        inputDisplacement.scaleInPlace(moveSpeed * delta);
        hasMoveInput = inputDisplacement.lengthSquared() > 0;
      }
      if (hasMoveInput) {
        if (
          hasDeferredMoveAxes &&
          (Math.abs(normalizedMoveAxisX - deferredMoveAxisX) >
            Number.EPSILON ||
            Math.abs(normalizedMoveAxisZ - deferredMoveAxisZ) >
              Number.EPSILON)
        ) {
          clearDeferredDisplacement();
        }
        deferredDisplacement.addInPlace(inputDisplacement);
        requestedDisplacement.addInPlace(deferredDisplacement);
      } else {
        clearDeferredDisplacement();
      }

      requestedDisplacement.y = 0;
      // Babylonが破棄する小変位は入力中だけ次frameへ持ち越し、
      // 衝突判定へ一度渡した変位や入力停止後の変位は再利用しない。
      if (
        !hasMoveInput &&
        requestedDisplacement.lengthSquared() <= moveStopEpsilonSq
      ) {
        reset();
      } else if (
        requestedDisplacement.lengthSquared() <= collisionEpsilonSq
      ) {
        if (hasMoveInput) {
          deferredDisplacement.copyFrom(requestedDisplacement);
          deferredMoveAxisX = normalizedMoveAxisX;
          deferredMoveAxisZ = normalizedMoveAxisZ;
          hasDeferredMoveAxes = true;
        }
        requestedDisplacement.set(0, 0, 0);
      } else {
        clearDeferredDisplacement();
      }
      return requestedDisplacement;
    },
    commit: (actualDisplacement) => {
      moveMomentum.set(actualDisplacement.x, 0, actualDisplacement.z);
      moveMomentum.scaleInPlace(pendingFrameInertia);
      if (moveMomentum.lengthSquared() <= moveStopEpsilonSq) {
        moveMomentum.set(0, 0, 0);
      }
    }
  };
};
