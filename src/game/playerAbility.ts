import { FreeCamera, Matrix, Scene, Vector3 } from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import {
  CharacterState,
  MovementBlocker,
  Npc,
  isAliveState,
  isBrainwashState
} from "./types";
import { type GamePhase } from "./phases";
import type { PlayerMoveAxes } from "./playerMotion";

export type MoveKey = "forward" | "back" | "left" | "right";

export type PlayerAbilityConfig = {
  baseMoveSpeed: number;
  dashSpeedMultiplier: number;
  staminaMaxTenths: number;
  staminaDrainInterval: number;
  staminaRecoverInterval: number;
  noGunTouchContactRadius: number;
  evadeThreatNearRangeCells: number;
  evadeThreatVisionRangeCells: number;
};

export type PlayerStaminaHudState = {
  visible: boolean;
  current: number;
  max: number;
  brainwashed: boolean;
};

export type PlayerAbilityFrameSnapshot = {
  moveSpeed: number;
  threatenedNpcIds: ReadonlySet<string>;
  npcBlockers: MovementBlocker[];
  stamina: PlayerStaminaHudState;
};

export type PlayerAbilityFrameContext = {
  gamePhase: GamePhase;
  playerState: CharacterState;
  playerPosition: Vector3;
  camera: FreeCamera;
  scene: Scene;
  layout: GridLayout;
  npcs: Npc[];
};

export type PlayerAbilityController = {
  setMoveKey: (key: MoveKey, pressed: boolean) => void;
  setDashPressed: (pressed: boolean) => void;
  resetInput: () => void;
  resetState: () => void;
  getMoveAxes: () => PlayerMoveAxes;
  hasMoveInput: () => boolean;
  createFrameSnapshot: (
    context: PlayerAbilityFrameContext
  ) => PlayerAbilityFrameSnapshot;
  getStaminaHudState: (
    gamePhase: GamePhase,
    playerState: CharacterState
  ) => PlayerStaminaHudState;
  updateStamina: (
    delta: number,
    moving: boolean,
    gamePhase: GamePhase,
    playerState: CharacterState
  ) => void;
};

const isPlayerThreatState = (state: CharacterState) =>
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun";

const playerThreatProjectionWorld = Matrix.Identity();

export const canPlayerMove = (state: CharacterState) =>
  isAliveState(state) ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun";

export const createPlayerAbilityController = ({
  baseMoveSpeed,
  dashSpeedMultiplier,
  staminaMaxTenths,
  staminaDrainInterval,
  staminaRecoverInterval,
  noGunTouchContactRadius,
  evadeThreatNearRangeCells,
  evadeThreatVisionRangeCells
}: PlayerAbilityConfig): PlayerAbilityController => {
  const moveInput: Record<MoveKey, boolean> = {
    forward: false,
    back: false,
    left: false,
    right: false
  };
  let dashPressed = false;
  let staminaTenths = staminaMaxTenths;
  let staminaDrainTimer = 0;
  let staminaRecoverTimer = 0;

  const resetInput = () => {
    moveInput.forward = false;
    moveInput.back = false;
    moveInput.left = false;
    moveInput.right = false;
    dashPressed = false;
  };

  const resetState = () => {
    resetInput();
    staminaTenths = staminaMaxTenths;
    staminaDrainTimer = 0;
    staminaRecoverTimer = 0;
  };

  const getMoveAxes = (): PlayerMoveAxes => {
    let moveX = 0;
    let moveZ = 0;
    if (moveInput.forward) {
      moveZ += 1;
    }
    if (moveInput.back) {
      moveZ -= 1;
    }
    if (moveInput.right) {
      moveX += 1;
    }
    if (moveInput.left) {
      moveX -= 1;
    }
    return { moveX, moveZ };
  };

  const hasMoveInput = () => {
    const { moveX, moveZ } = getMoveAxes();
    return moveX !== 0 || moveZ !== 0;
  };

  const isDashActive = (
    gamePhase: GamePhase,
    playerState: CharacterState
  ) => {
    if (gamePhase !== "playing" || !dashPressed) {
      return false;
    }
    if (isBrainwashState(playerState)) {
      return true;
    }
    return staminaTenths > 0;
  };

  const getStaminaHudState = (
    gamePhase: GamePhase,
    playerState: CharacterState
  ): PlayerStaminaHudState => {
    const brainwashed = isBrainwashState(playerState);
    return {
      visible: gamePhase === "playing",
      current: brainwashed ? staminaMaxTenths : staminaTenths,
      max: staminaMaxTenths,
      brainwashed
    };
  };

  const collectThreatenedNpcIds = ({
    playerState,
    playerPosition,
    camera,
    scene,
    layout,
    npcs
  }: PlayerAbilityFrameContext) => {
    const threatenedNpcIds = new Set<string>();
    if (!isPlayerThreatState(playerState)) {
      return threatenedNpcIds;
    }

    const nearRange = layout.cellSize * evadeThreatNearRangeCells;
    const nearRangeSq = nearRange * nearRange;
    const onScreenRange = layout.cellSize * evadeThreatVisionRangeCells;
    const onScreenRangeSq = onScreenRange * onScreenRange;
    const engine = scene.getEngine();
    const viewport = camera.viewport.toGlobal(
      engine.getRenderWidth(),
      engine.getRenderHeight()
    );
    const transformMatrix = scene.getTransformMatrix();
    const cameraForward = camera.getDirection(new Vector3(0, 0, 1));

    for (let index = 0; index < npcs.length; index += 1) {
      const npc = npcs[index];
      if (!isAliveState(npc.state)) {
        continue;
      }

      const dx = npc.sprite.position.x - playerPosition.x;
      const dz = npc.sprite.position.z - playerPosition.z;
      const isNear = dx * dx + dz * dz <= nearRangeSq;
      let isOnScreen = false;

      if (!isNear) {
        const toNpc = npc.sprite.position.subtract(playerPosition);
        if (
          toNpc.lengthSquared() <= onScreenRangeSq &&
          Vector3.Dot(cameraForward, toNpc) > 0
        ) {
          const projected = Vector3.Project(
            npc.sprite.position,
            playerThreatProjectionWorld,
            transformMatrix,
            viewport
          );
          isOnScreen =
            projected.z >= 0 &&
            projected.z <= 1 &&
            projected.x >= viewport.x &&
            projected.x <= viewport.x + viewport.width &&
            projected.y >= viewport.y &&
            projected.y <= viewport.y + viewport.height;
        }
      }

      if (isNear || isOnScreen) {
        threatenedNpcIds.add(`npc_${index}`);
      }
    }

    return threatenedNpcIds;
  };

  return {
    setMoveKey: (key, pressed) => {
      moveInput[key] = pressed;
    },
    setDashPressed: (pressed) => {
      dashPressed = pressed;
    },
    resetInput,
    resetState,
    getMoveAxes,
    hasMoveInput,
    createFrameSnapshot: (context) => {
      const moveSpeed = isDashActive(context.gamePhase, context.playerState)
        ? baseMoveSpeed * dashSpeedMultiplier
        : baseMoveSpeed;
      const npcBlockers =
        context.playerState === "brainwash-complete-no-gun"
          ? [
              {
                position: context.playerPosition,
                radius: noGunTouchContactRadius,
                sourceId: "player"
              }
            ]
          : [];
      return {
        moveSpeed,
        threatenedNpcIds: collectThreatenedNpcIds(context),
        npcBlockers,
        stamina: getStaminaHudState(context.gamePhase, context.playerState)
      };
    },
    getStaminaHudState,
    updateStamina: (delta, moving, gamePhase, playerState) => {
      if (gamePhase !== "playing") {
        staminaDrainTimer = 0;
        staminaRecoverTimer = 0;
        return;
      }
      if (isBrainwashState(playerState)) {
        staminaTenths = staminaMaxTenths;
        staminaDrainTimer = 0;
        staminaRecoverTimer = 0;
        return;
      }

      const consumeStamina = dashPressed && staminaTenths > 0 && moving;
      const blockRecovery = dashPressed && staminaTenths <= 0 && moving;
      if (consumeStamina) {
        staminaRecoverTimer = 0;
        staminaDrainTimer += delta;
        while (
          staminaDrainTimer >= staminaDrainInterval &&
          staminaTenths > 0
        ) {
          staminaDrainTimer -= staminaDrainInterval;
          staminaTenths -= 1;
        }
        if (staminaTenths <= 0) {
          staminaTenths = 0;
          staminaDrainTimer = 0;
        }
        return;
      }

      staminaDrainTimer = 0;
      if (blockRecovery) {
        staminaRecoverTimer = 0;
        return;
      }
      if (staminaTenths >= staminaMaxTenths) {
        staminaTenths = staminaMaxTenths;
        staminaRecoverTimer = 0;
        return;
      }

      staminaRecoverTimer += delta;
      while (
        staminaRecoverTimer >= staminaRecoverInterval &&
        staminaTenths < staminaMaxTenths
      ) {
        staminaRecoverTimer -= staminaRecoverInterval;
        staminaTenths += 1;
      }
      if (staminaTenths >= staminaMaxTenths) {
        staminaTenths = staminaMaxTenths;
        staminaRecoverTimer = 0;
      }
    }
  };
};
