import {
  isV2AliveState,
  isV2BrainwashState,
  isV2PlayerCompletionState,
  type V2BeamOriginKind,
  type V2CharacterState,
  type V2HumanKind,
  type V2PlayerCompletionState
} from "./combatTypes";

export const V2_HIT_FLICKER_DURATION_SECONDS = 3;
export const V2_HIT_FLICKER_INTERVAL_SECONDS = 0.12;
export const V2_HIT_FADE_DURATION_SECONDS = 1;
export const V2_NPC_BRAINWASH_DECISION_SECONDS = 10;
export const V2_NPC_HAIGURE_DECISION_SECONDS = 10;
export const V2_NPC_BRAINWASH_STAY_CHANCE = 0.5;
export const V2_NPC_HAIGURE_STAY_CHANCE = 0.1;
export const V2_NPC_GUN_CHANCE_AFTER_HAIGURE = 0.5;

export type V2CharacterImpactSource = Readonly<{
  sourceId: string;
  originKind: V2BeamOriginKind;
}>;

export type V2HitSequencePhase = "none" | "flicker" | "fade";

export type V2AliveBehaviorState = "normal" | "evade";

export type V2CharacterStateSnapshot = Readonly<{
  kind: V2HumanKind;
  state: V2CharacterState;
  stateElapsedSeconds: number;
  hitPhase: V2HitSequencePhase;
  hitPhaseElapsedSeconds: number;
  hitPhaseRemainingSeconds: number;
  hitSourceId: string | null;
  hitOriginKind: V2BeamOriginKind | null;
  playerCompletionUnlocked: boolean;
}>;

export type V2CharacterStateSystemOptions = Readonly<{
  kind: V2HumanKind;
  initialState: V2CharacterState;
  random: () => number;
}>;

export interface V2CharacterStateSystem {
  update(deltaSeconds: number): V2CharacterStateSnapshot;
  applyImpact(source: V2CharacterImpactSource): boolean;
  setAliveBehaviorState(state: V2AliveBehaviorState): boolean;
  enterFormationState(): boolean;
  prepareExecutionTarget(): void;
  prepareExecutionAudience(): void;
  prepareExecutionShooter(): void;
  selectPlayerCompletion(state: V2PlayerCompletionState): void;
  getSnapshot(): V2CharacterStateSnapshot;
}

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const assertImpactSource = (source: V2CharacterImpactSource) => {
  if (source.sourceId.length === 0) {
    throw new Error("命中元IDを空にできません。");
  }
};

const createInitialHitPhase = (
  initialState: V2CharacterState
): V2HitSequencePhase =>
  initialState === "hit-a" || initialState === "hit-b"
    ? "flicker"
    : "none";

export const createV2CharacterStateSystem = ({
  kind,
  initialState,
  random
}: V2CharacterStateSystemOptions): V2CharacterStateSystem => {
  if (typeof random !== "function") {
    throw new Error("character state randomには関数が必要です。");
  }

  let state = initialState;
  let stateElapsedSeconds = 0;
  let hitPhase = createInitialHitPhase(initialState);
  let hitPhaseElapsedSeconds = 0;
  let hitPhaseRemainingSeconds =
    hitPhase === "flicker" ? V2_HIT_FLICKER_DURATION_SECONDS : 0;
  let hitSourceId: string | null = null;
  let hitOriginKind: V2BeamOriginKind | null = null;
  let playerCompletionUnlocked =
    kind === "player" && isV2PlayerCompletionState(initialState);

  const nextRandom = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("character state randomは0以上1未満を返す必要があります。");
    }
    return value;
  };

  const setState = (nextState: V2CharacterState) => {
    state = nextState;
    stateElapsedSeconds = 0;
  };

  const setScriptedExecutionState = (
    nextState:
      | "brainwash-complete-gun"
      | "brainwash-complete-haigure-formation"
  ) => {
    if (isV2AliveState(state)) {
      throw new Error(
        `alive対象を公開処刑用状態へ強制遷移できません: ${state} -> ${nextState}`
      );
    }
    setState(nextState);
    hitPhase = "none";
    hitPhaseElapsedSeconds = 0;
    hitPhaseRemainingSeconds = 0;
    hitSourceId = null;
    hitOriginKind = null;
    playerCompletionUnlocked = false;
  };

  const getSnapshot = (): V2CharacterStateSnapshot =>
    Object.freeze({
      kind,
      state,
      stateElapsedSeconds,
      hitPhase,
      hitPhaseElapsedSeconds,
      hitPhaseRemainingSeconds,
      hitSourceId,
      hitOriginKind,
      playerCompletionUnlocked
    });

  const updateFlicker = (availableSeconds: number) => {
    const consumedSeconds = Math.min(
      availableSeconds,
      hitPhaseRemainingSeconds
    );
    hitPhaseElapsedSeconds += consumedSeconds;
    hitPhaseRemainingSeconds -= consumedSeconds;
    stateElapsedSeconds += consumedSeconds;
    state =
      Math.floor(
        hitPhaseElapsedSeconds / V2_HIT_FLICKER_INTERVAL_SECONDS
      ) %
        2 ===
      0
        ? "hit-a"
        : "hit-b";
    if (hitPhaseRemainingSeconds <= 0) {
      hitPhase = "fade";
      hitPhaseElapsedSeconds = 0;
      hitPhaseRemainingSeconds = V2_HIT_FADE_DURATION_SECONDS;
      state = "hit-a";
    }
    return consumedSeconds;
  };

  const updateFade = (availableSeconds: number) => {
    const consumedSeconds = Math.min(
      availableSeconds,
      hitPhaseRemainingSeconds
    );
    hitPhaseElapsedSeconds += consumedSeconds;
    hitPhaseRemainingSeconds -= consumedSeconds;
    stateElapsedSeconds += consumedSeconds;
    state = "hit-a";
    if (hitPhaseRemainingSeconds <= 0) {
      hitPhase = "none";
      hitPhaseElapsedSeconds = 0;
      hitPhaseRemainingSeconds = 0;
      setState("brainwash-in-progress");
      if (kind === "player") {
        playerCompletionUnlocked = true;
      }
    }
    return consumedSeconds;
  };

  const updateNpcBrainwashInProgress = (availableSeconds: number) => {
    const remainingUntilDecision =
      V2_NPC_BRAINWASH_DECISION_SECONDS - stateElapsedSeconds;
    const consumedSeconds = Math.min(
      availableSeconds,
      remainingUntilDecision
    );
    stateElapsedSeconds += consumedSeconds;
    if (stateElapsedSeconds >= V2_NPC_BRAINWASH_DECISION_SECONDS) {
      if (nextRandom() < V2_NPC_BRAINWASH_STAY_CHANCE) {
        stateElapsedSeconds = 0;
      } else {
        setState("brainwash-complete-haigure");
      }
    }
    return consumedSeconds;
  };

  const updateNpcHaigure = (availableSeconds: number) => {
    const remainingUntilDecision =
      V2_NPC_HAIGURE_DECISION_SECONDS - stateElapsedSeconds;
    const consumedSeconds = Math.min(
      availableSeconds,
      remainingUntilDecision
    );
    stateElapsedSeconds += consumedSeconds;
    if (stateElapsedSeconds >= V2_NPC_HAIGURE_DECISION_SECONDS) {
      if (nextRandom() < V2_NPC_HAIGURE_STAY_CHANCE) {
        stateElapsedSeconds = 0;
      } else {
        setState(
          nextRandom() < V2_NPC_GUN_CHANCE_AFTER_HAIGURE
            ? "brainwash-complete-gun"
            : "brainwash-complete-no-gun"
        );
      }
    }
    return consumedSeconds;
  };

  return {
    update: (deltaSeconds) => {
      assertNonNegativeFiniteNumber(
        "character state deltaSeconds",
        deltaSeconds
      );
      let remainingSeconds = deltaSeconds;
      while (remainingSeconds > 0) {
        if (hitPhase === "flicker") {
          remainingSeconds -= updateFlicker(remainingSeconds);
          continue;
        }
        if (hitPhase === "fade") {
          remainingSeconds -= updateFade(remainingSeconds);
          continue;
        }
        if (kind === "npc" && state === "brainwash-in-progress") {
          remainingSeconds -= updateNpcBrainwashInProgress(remainingSeconds);
          continue;
        }
        if (kind === "npc" && state === "brainwash-complete-haigure") {
          remainingSeconds -= updateNpcHaigure(remainingSeconds);
          continue;
        }
        stateElapsedSeconds += remainingSeconds;
        remainingSeconds = 0;
      }
      return getSnapshot();
    },
    applyImpact: (source) => {
      assertImpactSource(source);
      if (!isV2AliveState(state)) {
        return false;
      }
      state = "hit-a";
      stateElapsedSeconds = 0;
      hitPhase = "flicker";
      hitPhaseElapsedSeconds = 0;
      hitPhaseRemainingSeconds = V2_HIT_FLICKER_DURATION_SECONDS;
      hitSourceId = source.sourceId;
      hitOriginKind = source.originKind;
      if (kind === "player") {
        playerCompletionUnlocked = false;
      }
      return true;
    },
    setAliveBehaviorState: (nextState) => {
      if (!isV2AliveState(state)) {
        return false;
      }
      if (state !== nextState) {
        setState(nextState);
      }
      return true;
    },
    enterFormationState: () => {
      if (!isV2BrainwashState(state)) {
        return false;
      }
      if (state !== "brainwash-complete-haigure-formation") {
        setState("brainwash-complete-haigure-formation");
      }
      hitPhase = "none";
      hitPhaseElapsedSeconds = 0;
      hitPhaseRemainingSeconds = 0;
      return true;
    },
    prepareExecutionTarget: () => {
      setState("evade");
      hitPhase = "none";
      hitPhaseElapsedSeconds = 0;
      hitPhaseRemainingSeconds = 0;
      hitSourceId = null;
      hitOriginKind = null;
      playerCompletionUnlocked = false;
    },
    prepareExecutionAudience: () => {
      setScriptedExecutionState(
        "brainwash-complete-haigure-formation"
      );
    },
    prepareExecutionShooter: () => {
      setScriptedExecutionState("brainwash-complete-gun");
    },
    selectPlayerCompletion: (nextState) => {
      if (kind !== "player") {
        throw new Error("NPCはプレイヤー洗脳完了状態を選択できません。");
      }
      if (!playerCompletionUnlocked) {
        throw new Error("プレイヤー洗脳完了状態はまだ選択できません。");
      }
      setState(nextState);
      hitPhase = "none";
      hitPhaseElapsedSeconds = 0;
      hitPhaseRemainingSeconds = 0;
    },
    getSnapshot
  };
};
