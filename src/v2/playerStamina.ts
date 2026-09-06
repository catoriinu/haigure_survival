import {
  isV2BrainwashState,
  type V2CharacterState
} from "./combatTypes";

export const V2_PLAYER_DASH_SPEED_MULTIPLIER = 2;
export const V2_PLAYER_STAMINA_MAX_TENTHS = 150;
export const V2_PLAYER_STAMINA_DRAIN_INTERVAL_SECONDS = 0.1;
export const V2_PLAYER_STAMINA_RECOVER_INTERVAL_SECONDS = 0.2;

export type V2PlayerDashMode = "stamina" | "unlimited";

export type V2PlayerStaminaSnapshot = Readonly<{
  currentTenths: number;
  maximumTenths: number;
  brainwashed: boolean;
}>;

export type V2PlayerDashFrame = Readonly<{
  active: boolean;
  stamina: V2PlayerStaminaSnapshot | null;
}>;

export type V2PlayerDashFrameContext = Readonly<{
  delta: number;
  gameplayActive: boolean;
  playerState: V2CharacterState;
  dashPressed: boolean;
  moving: boolean;
}>;

export type V2PlayerDashController = {
  update(context: V2PlayerDashFrameContext): V2PlayerDashFrame;
  reset(): void;
};

export const createV2PlayerDashController = (
  mode: V2PlayerDashMode
): V2PlayerDashController => {
  let staminaTenths = V2_PLAYER_STAMINA_MAX_TENTHS;
  let drainTimer = 0;
  let recoverTimer = 0;

  const reset = () => {
    staminaTenths = V2_PLAYER_STAMINA_MAX_TENTHS;
    drainTimer = 0;
    recoverTimer = 0;
  };

  const buildStaminaSnapshot = (
    brainwashed: boolean
  ): V2PlayerStaminaSnapshot =>
    Object.freeze({
      currentTenths: brainwashed
        ? V2_PLAYER_STAMINA_MAX_TENTHS
        : staminaTenths,
      maximumTenths: V2_PLAYER_STAMINA_MAX_TENTHS,
      brainwashed
    });

  return {
    update: ({
      delta,
      gameplayActive,
      playerState,
      dashPressed,
      moving
    }) => {
      if (mode === "unlimited") {
        return Object.freeze({ active: dashPressed, stamina: null });
      }

      const brainwashed = isV2BrainwashState(playerState);
      if (!gameplayActive) {
        drainTimer = 0;
        recoverTimer = 0;
        return Object.freeze({
          active: false,
          stamina: buildStaminaSnapshot(brainwashed)
        });
      }
      if (brainwashed) {
        staminaTenths = V2_PLAYER_STAMINA_MAX_TENTHS;
        drainTimer = 0;
        recoverTimer = 0;
        return Object.freeze({
          active: dashPressed,
          stamina: buildStaminaSnapshot(true)
        });
      }

      const dashActive = dashPressed && staminaTenths > 0;
      const consumeStamina = dashActive && moving;
      const blockRecovery = dashPressed && staminaTenths <= 0 && moving;
      if (consumeStamina) {
        recoverTimer = 0;
        drainTimer += delta;
        while (
          drainTimer >= V2_PLAYER_STAMINA_DRAIN_INTERVAL_SECONDS &&
          staminaTenths > 0
        ) {
          drainTimer -= V2_PLAYER_STAMINA_DRAIN_INTERVAL_SECONDS;
          staminaTenths -= 1;
        }
        if (staminaTenths <= 0) {
          staminaTenths = 0;
          drainTimer = 0;
        }
      } else {
        drainTimer = 0;
        if (blockRecovery) {
          recoverTimer = 0;
        } else if (staminaTenths >= V2_PLAYER_STAMINA_MAX_TENTHS) {
          staminaTenths = V2_PLAYER_STAMINA_MAX_TENTHS;
          recoverTimer = 0;
        } else {
          recoverTimer += delta;
          while (
            recoverTimer >= V2_PLAYER_STAMINA_RECOVER_INTERVAL_SECONDS &&
            staminaTenths < V2_PLAYER_STAMINA_MAX_TENTHS
          ) {
            recoverTimer -= V2_PLAYER_STAMINA_RECOVER_INTERVAL_SECONDS;
            staminaTenths += 1;
          }
          if (staminaTenths >= V2_PLAYER_STAMINA_MAX_TENTHS) {
            staminaTenths = V2_PLAYER_STAMINA_MAX_TENTHS;
            recoverTimer = 0;
          }
        }
      }

      return Object.freeze({
        active: dashActive,
        stamina: buildStaminaSnapshot(false)
      });
    },
    reset
  };
};
