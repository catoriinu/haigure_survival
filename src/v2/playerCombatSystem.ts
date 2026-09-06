import { Vector3 } from "@babylonjs/core";

import {
  PLAYER_SPRITE_CENTER_HEIGHT,
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH
} from "../game/characterSprites";
import {
  createV2CharacterStateSystem,
  type V2CharacterImpactSource,
  type V2AliveBehaviorState,
  type V2CharacterStateSnapshot
} from "./characterStateSystem";
import {
  isV2AliveState,
  isV2BrainwashState,
  type V2BeamRequest,
  type V2CharacterState,
  type V2HumanTargetSnapshot,
  type V2PlayerCompletionState
} from "./combatTypes";

export const V2_PLAYER_GUN_BEAM_SPEED = 1.58;
export const V2_PLAYER_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS = 20;
export const V2_PLAYER_GUN_BEAM_ORIGIN_OFFSET = 0.1;

export type V2PlayerCombatSystemOptions = Readonly<{
  playerId: string;
  initialState: V2CharacterState;
  instantBrainwash: boolean;
  random: () => number;
}>;

export type V2PlayerGunFireEvent = Readonly<{
  direction: Vector3;
  beamRequest: V2BeamRequest;
}>;

export interface V2PlayerCombatSystem {
  update(deltaSeconds: number): V2CharacterStateSnapshot;
  applyImpact(source: V2CharacterImpactSource): boolean;
  applyNoGunTouchBrainwash(source: V2CharacterImpactSource): boolean;
  setAliveBehaviorState(state: V2AliveBehaviorState): boolean;
  selectCompletion(state: V2PlayerCompletionState): void;
  enterFormationState(): boolean;
  prepareExecutionTarget(): void;
  prepareExecutionAudience(): void;
  prepareExecutionShooter(): void;
  prepareInstantExecutionAudience(): void;
  prepareInstantExecutionShooter(): void;
  createTargetSnapshot(
    footPosition: Vector3,
    aimPosition: Vector3
  ): V2HumanTargetSnapshot;
  requestGunFire(
    eyePosition: Vector3,
    direction: Vector3
  ): V2PlayerGunFireEvent | null;
  getStateSnapshot(): V2CharacterStateSnapshot;
}

const ALIVE_HUMANS_TARGET_POLICY = Object.freeze({
  kind: "alive-humans" as const
});

const PLAYER_HIT_RADII = Object.freeze(
  new Vector3(
    PLAYER_SPRITE_WIDTH * 0.5,
    PLAYER_SPRITE_HEIGHT * 0.5,
    PLAYER_SPRITE_WIDTH * 0.5
  )
);

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

export const createV2PlayerCombatSystem = ({
  playerId,
  initialState,
  instantBrainwash,
  random
}: V2PlayerCombatSystemOptions): V2PlayerCombatSystem => {
  if (playerId.length === 0) {
    throw new Error("playerIdを空にできません。");
  }

  const stateSystem = createV2CharacterStateSystem({
    kind: "player",
    initialState,
    instantBrainwash,
    npcCompletionPercentages: null,
    random
  });

  return {
    update: (deltaSeconds) => stateSystem.update(deltaSeconds),
    applyImpact: (source) => stateSystem.applyImpact(source),
    applyNoGunTouchBrainwash: (source) =>
      stateSystem.applyNoGunTouchBrainwash(source),
    setAliveBehaviorState: (state) =>
      stateSystem.setAliveBehaviorState(state),
    selectCompletion: (state) =>
      stateSystem.selectPlayerCompletion(state),
    enterFormationState: () => stateSystem.enterFormationState(),
    prepareExecutionTarget: () =>
      stateSystem.prepareExecutionTarget(),
    prepareExecutionAudience: () =>
      stateSystem.prepareExecutionAudience(),
    prepareExecutionShooter: () =>
      stateSystem.prepareExecutionShooter(),
    prepareInstantExecutionAudience: () =>
      stateSystem.prepareInstantExecutionAudience(),
    prepareInstantExecutionShooter: () =>
      stateSystem.prepareInstantExecutionShooter(),
    createTargetSnapshot: (footPosition, aimPosition) => {
      assertFiniteVector("プレイヤー足元", footPosition);
      assertFiniteVector("プレイヤー照準点", aimPosition);
      const state = stateSystem.getSnapshot().state;
      const center = new Vector3(
        footPosition.x,
        footPosition.y + PLAYER_SPRITE_CENTER_HEIGHT,
        footPosition.z
      );
      return Object.freeze({
        id: playerId,
        kind: "player" as const,
        footPosition: footPosition.clone(),
        aimPosition: aimPosition.clone(),
        hitShape: Object.freeze({
          center,
          radii: PLAYER_HIT_RADII.clone()
        }),
        state,
        alive: isV2AliveState(state),
        brainwashed: isV2BrainwashState(state)
      });
    },
    requestGunFire: (eyePosition, direction) => {
      if (
        stateSystem.getSnapshot().state !==
        "brainwash-complete-gun"
      ) {
        return null;
      }
      assertFiniteVector("プレイヤー光線原点", eyePosition);
      assertFiniteVector("プレイヤー光線方向", direction);
      if (direction.lengthSquared() === 0) {
        throw new Error("プレイヤー光線方向をゼロベクトルにできません。");
      }
      const normalizedDirection = direction.clone().normalize();
      const beamRequest = Object.freeze({
        sourceId: playerId,
        originKind: "player-gun" as const,
        targetPolicy: ALIVE_HUMANS_TARGET_POLICY,
        origin: eyePosition.add(
          normalizedDirection.scale(V2_PLAYER_GUN_BEAM_ORIGIN_OFFSET)
        ),
        direction: normalizedDirection.clone(),
        speed: V2_PLAYER_GUN_BEAM_SPEED,
        maximumLifetime: V2_PLAYER_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS
      });
      return Object.freeze({
        direction: normalizedDirection,
        beamRequest
      });
    },
    getStateSnapshot: () => stateSystem.getSnapshot()
  };
};
