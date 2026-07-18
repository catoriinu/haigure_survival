import { Vector3 } from "@babylonjs/core";

export type PlayerMoveAxes = Readonly<{
  moveX: number;
  moveZ: number;
}>;

export type PlayerMotionConfig = {
  moveInertiaAt60Fps: number;
  moveStopEpsilon: number;
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
  moveStopEpsilon
}: PlayerMotionConfig): PlayerMotionController => {
  const moveMomentum = Vector3.Zero();
  const requestedDisplacement = Vector3.Zero();
  const inputDisplacement = Vector3.Zero();
  const forward = Vector3.Zero();
  const right = Vector3.Zero();
  const moveDirection = Vector3.Zero();
  const moveStopEpsilonSq = moveStopEpsilon * moveStopEpsilon;
  let pendingFrameInertia = moveInertiaAt60Fps;

  const reset = () => {
    moveMomentum.set(0, 0, 0);
    requestedDisplacement.set(0, 0, 0);
    inputDisplacement.set(0, 0, 0);
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

      if (moveAxes.moveX !== 0 || moveAxes.moveZ !== 0) {
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
        requestedDisplacement.addInPlace(inputDisplacement);
      }

      requestedDisplacement.y = 0;
      if (requestedDisplacement.lengthSquared() <= moveStopEpsilonSq) {
        reset();
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
