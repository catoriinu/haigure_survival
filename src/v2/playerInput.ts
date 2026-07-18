export type V2PlayerMoveAxes = Readonly<{
  moveX: number;
  moveZ: number;
}>;

export type V2PlayerInput = {
  getMoveAxes(): V2PlayerMoveAxes;
  isDashPressed(): boolean;
  reset(): void;
  dispose(): void;
};

const MOVE_CODES = ["KeyW", "KeyA", "KeyS", "KeyD"] as const;
const DASH_CODES = ["ShiftLeft", "ShiftRight"] as const;
const CONTROL_CODES = new Set<string>([...MOVE_CODES, ...DASH_CODES]);

export const createV2PlayerInput = (target: Window): V2PlayerInput => {
  const pressedCodes = new Set<string>();
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2PlayerInputは使用できません。");
    }
  };

  const reset = () => {
    assertActive();
    pressedCodes.clear();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (CONTROL_CODES.has(event.code)) {
      pressedCodes.add(event.code);
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (CONTROL_CODES.has(event.code)) {
      pressedCodes.delete(event.code);
    }
  };

  const onBlur = () => {
    pressedCodes.clear();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    getMoveAxes: () => {
      assertActive();
      return {
        moveX:
          Number(pressedCodes.has("KeyD")) -
          Number(pressedCodes.has("KeyA")),
        moveZ:
          Number(pressedCodes.has("KeyW")) -
          Number(pressedCodes.has("KeyS"))
      };
    },
    isDashPressed: () => {
      assertActive();
      return (
        pressedCodes.has("ShiftLeft") || pressedCodes.has("ShiftRight")
      );
    },
    reset,
    dispose: () => {
      assertActive();
      disposed = true;
      pressedCodes.clear();
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    }
  };
};
