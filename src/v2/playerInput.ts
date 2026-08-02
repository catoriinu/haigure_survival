export type V2PlayerMoveAxes = Readonly<{
  moveX: number;
  moveZ: number;
}>;

export type V2PlayerAction =
  | "npc-follow"
  | "npc-leave"
  | "door-toggle"
  | "select-gun"
  | "select-no-gun"
  | "select-haigure"
  | "retry";

export type V2PlayerInput = {
  getMoveAxes(): V2PlayerMoveAxes;
  isDashPressed(): boolean;
  drainPressedActions(): readonly V2PlayerAction[];
  reset(): void;
  dispose(): void;
};

const MOVE_CODES = ["KeyW", "KeyA", "KeyS", "KeyD"] as const;
const DASH_CODES = ["ShiftLeft", "ShiftRight"] as const;
const CONTROL_CODES = new Set<string>([...MOVE_CODES, ...DASH_CODES]);
const ACTION_BY_CODE = new Map<string, V2PlayerAction>([
  ["KeyF", "npc-follow"],
  ["KeyE", "npc-leave"],
  ["KeyC", "door-toggle"],
  ["KeyG", "select-gun"],
  ["KeyN", "select-no-gun"],
  ["KeyH", "select-haigure"],
  ["KeyR", "retry"]
]);

export const createV2PlayerInput = (target: Window): V2PlayerInput => {
  const pressedCodes = new Set<string>();
  const pressedActions: V2PlayerAction[] = [];
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2PlayerInputは使用できません。");
    }
  };

  const reset = () => {
    assertActive();
    pressedCodes.clear();
    pressedActions.length = 0;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (CONTROL_CODES.has(event.code)) {
      pressedCodes.add(event.code);
    }
    const action = ACTION_BY_CODE.get(event.code);
    if (action && !event.repeat) {
      pressedActions.push(action);
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (CONTROL_CODES.has(event.code)) {
      pressedCodes.delete(event.code);
    }
  };

  const onBlur = () => {
    pressedCodes.clear();
    pressedActions.length = 0;
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
    drainPressedActions: () => {
      assertActive();
      const actions = Object.freeze([...pressedActions]);
      pressedActions.length = 0;
      return actions;
    },
    reset,
    dispose: () => {
      assertActive();
      disposed = true;
      pressedCodes.clear();
      pressedActions.length = 0;
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    }
  };
};
