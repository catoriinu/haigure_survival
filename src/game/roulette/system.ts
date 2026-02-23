import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  createRouletteSpinProfile,
  sampleRouletteSpinAngle,
  sampleRouletteSpinLoopVolume
} from "./spinProfile";
import type {
  RouletteBitFireEntry,
  RouletteHitTarget,
  RoulettePhase,
  RouletteRoundStats,
  RouletteSnapshot,
  RouletteSpinProfile
} from "./types";

type RouletteCharacterSnapshot = Pick<RouletteSnapshot, "playerState" | "npcStates">;

type RouletteFireResult = {
  hitCount: number;
  playerHit: boolean;
};

type RouletteSystemDeps = {
  random: () => number;
  fireTimeFromSpinStart: number;
  bitFireEffectDuration: number;
  postHitWaitDuration: number;
  bitMinTurns: number;
  bitMaxTurns: number;
  clearHitEntries: () => void;
  clearBeamTargets: () => void;
  startSpinLoop: () => void;
  stopSpinLoop: () => void;
  setSpinLoopVolumeRatio: (ratio: number) => void;
  prepareParticipants: () => number;
  spawnBits: (baseSlots: number[]) => void;
  startBitsDespawn: () => boolean;
  areBitsDespawning: () => boolean;
  disposeAllBits: () => void;
  areBitSpawnsDone: () => boolean;
  beginFireEffects: (entries: RouletteBitFireEntry[]) => void;
  fireBits: (entries: RouletteBitFireEntry[]) => RouletteFireResult;
  updateHitEntries: (
    delta: number,
    shouldProcessOrb: (position: Vector3) => boolean
  ) => boolean;
  buildTargetFromSlot: (slot: number) => RouletteHitTarget;
  isTargetBrainwashed: (target: RouletteHitTarget) => boolean;
  isComplete: () => boolean;
  updateBitTransforms: (
    baseSlots: number[],
    offsetAngle: number,
    elapsed: number
  ) => void;
  captureCharacterSnapshot: () => RouletteCharacterSnapshot;
  applyCharacterSnapshot: (snapshot: RouletteCharacterSnapshot) => void;
  beginUndoTransition: (apply: () => void) => void;
  prepareUndoState: () => void;
};

export type RouletteSystem = {
  start(recordUndoSnapshot?: boolean): void;
  update(delta: number, shouldProcessOrb: (position: Vector3) => boolean): void;
  undo(): void;
  reset(): void;
  isEnded(): boolean;
  getStats(): RouletteRoundStats;
};

export const createRouletteSystem = (deps: RouletteSystemDeps): RouletteSystem => {
  let phase: RoulettePhase = "inactive";
  let slotCount = 0;
  let elapsed = 0;
  let bitOffsetAngle = 0;
  let spinElapsed = 0;
  let spinProfile: RouletteSpinProfile = createRouletteSpinProfile(() => 0);
  let spinTotalAngle = 0;
  let stopShift = 0;
  let phaseTimer = 0;
  let bitBaseSlots: number[] = [];
  let bitFireEntries: RouletteBitFireEntry[] = [];
  let undoHistory: RouletteSnapshot[] = [];
  let undoInProgress = false;
  let roundCount = 0;
  let noHitRoundCount = 0;
  let surviveCountAtBrainwash: number | null = null;

  const normalizeSlotIndex = (value: number) => {
    if (slotCount <= 0) {
      return 0;
    }
    return ((value % slotCount) + slotCount) % slotCount;
  };

  const captureSnapshot = (): RouletteSnapshot => {
    const snapshot = deps.captureCharacterSnapshot();
    return {
      playerState: snapshot.playerState,
      npcStates: [...snapshot.npcStates],
      rouletteRoundCount: roundCount,
      rouletteNoHitRoundCount: noHitRoundCount,
      rouletteSurviveCountAtBrainwash: surviveCountAtBrainwash
    };
  };

  const applySnapshot = (snapshot: RouletteSnapshot) => {
    roundCount = snapshot.rouletteRoundCount;
    noHitRoundCount = snapshot.rouletteNoHitRoundCount;
    surviveCountAtBrainwash = snapshot.rouletteSurviveCountAtBrainwash;
    deps.applyCharacterSnapshot({
      playerState: snapshot.playerState,
      npcStates: snapshot.npcStates
    });
  };

  const pickBitCount = () => {
    const participantCount = Math.max(1, slotCount);
    const baseMin = 1;
    const baseMax = Math.max(1, Math.floor(participantCount / 2));
    const bonus = noHitRoundCount;
    const minCount = Math.min(participantCount, baseMin + bonus);
    const maxCount = Math.min(participantCount, baseMax + bonus);
    return minCount + Math.floor(deps.random() * (maxCount - minCount + 1));
  };

  const pickBitSlots = (count: number) => {
    const slots = Array.from({ length: slotCount }, (_, index) => index);
    for (let index = slots.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(deps.random() * (index + 1));
      [slots[index], slots[swap]] = [slots[swap], slots[index]];
    }
    return slots.slice(0, count);
  };

  const spawnBits = () => {
    bitFireEntries = [];
    const bitCount = pickBitCount();
    bitBaseSlots = pickBitSlots(bitCount);
    bitOffsetAngle = 0;
    deps.spawnBits(bitBaseSlots);
    deps.updateBitTransforms(bitBaseSlots, bitOffsetAngle, elapsed);
  };

  const startSpin = () => {
    deps.stopSpinLoop();
    spinElapsed = 0;
    spinProfile = createRouletteSpinProfile(deps.random);
    stopShift = Math.floor(deps.random() * slotCount);
    const extraTurns =
      deps.bitMinTurns +
      Math.floor(deps.random() * (deps.bitMaxTurns - deps.bitMinTurns + 1));
    spinTotalAngle =
      Math.PI * 2 * extraTurns + ((Math.PI * 2) / slotCount) * stopShift;
    phase = "spinning";
    deps.startSpinLoop();
  };

  const beginRound = (
    recordUndoSnapshot: boolean,
    incrementRoundCount = true
  ) => {
    deps.clearHitEntries();
    deps.clearBeamTargets();
    phaseTimer = 0;
    if (incrementRoundCount) {
      roundCount += 1;
    }
    if (recordUndoSnapshot) {
      undoHistory.push(captureSnapshot());
    }
    if (deps.startBitsDespawn()) {
      phase = "despawn-wait";
      return;
    }
    spawnBits();
    phase = "spawn-wait";
  };

  const startFireEffects = () => {
    bitFireEntries = [];
    for (let index = 0; index < bitBaseSlots.length; index += 1) {
      const targetSlot = normalizeSlotIndex(bitBaseSlots[index] + stopShift);
      const target = deps.buildTargetFromSlot(targetSlot);
      if (deps.isTargetBrainwashed(target)) {
        continue;
      }
      bitFireEntries.push({
        bitIndex: index,
        target
      });
    }
    deps.beginFireEffects(bitFireEntries);
    if (bitFireEntries.length <= 0) {
      phase = "post-hit-wait";
      phaseTimer = deps.postHitWaitDuration;
      return;
    }
    phase = "fire-effect";
    phaseTimer = deps.bitFireEffectDuration;
  };

  const fireBits = () => {
    const result = deps.fireBits(bitFireEntries);
    bitFireEntries = [];
    if (result.playerHit && surviveCountAtBrainwash === null) {
      surviveCountAtBrainwash = roundCount;
    }
    if (result.hitCount <= 0) {
      noHitRoundCount += 1;
      phase = "post-hit-wait";
      phaseTimer = deps.postHitWaitDuration;
      return;
    }
    phase = "hit-sequence";
  };

  const reset = () => {
    deps.clearHitEntries();
    deps.clearBeamTargets();
    deps.stopSpinLoop();
    phase = "inactive";
    slotCount = 0;
    elapsed = 0;
    bitOffsetAngle = 0;
    spinElapsed = 0;
    spinProfile = createRouletteSpinProfile(() => 0);
    spinTotalAngle = 0;
    stopShift = 0;
    phaseTimer = 0;
    bitBaseSlots = [];
    bitFireEntries = [];
    undoHistory = [];
    undoInProgress = false;
    roundCount = 0;
    noHitRoundCount = 0;
    surviveCountAtBrainwash = null;
  };

  const start = (recordUndoSnapshot = true) => {
    reset();
    slotCount = deps.prepareParticipants();
    beginRound(recordUndoSnapshot);
  };

  const update = (
    delta: number,
    shouldProcessOrb: (position: Vector3) => boolean
  ) => {
    elapsed += delta;
    deps.updateBitTransforms(bitBaseSlots, bitOffsetAngle, elapsed);
    if (phase === "inactive" || phase === "ended") {
      return;
    }
    if (phase === "despawn-wait") {
      if (deps.areBitsDespawning()) {
        return;
      }
      deps.disposeAllBits();
      spawnBits();
      phase = "spawn-wait";
      return;
    }
    if (phase === "spawn-wait") {
      if (!deps.areBitSpawnsDone()) {
        return;
      }
      startSpin();
      return;
    }
    if (phase === "spinning") {
      spinElapsed = Math.min(spinProfile.duration, spinElapsed + delta);
      bitOffsetAngle = sampleRouletteSpinAngle(
        spinProfile,
        spinElapsed,
        spinTotalAngle
      );
      deps.setSpinLoopVolumeRatio(
        sampleRouletteSpinLoopVolume(spinProfile, spinElapsed)
      );
      if (spinElapsed >= spinProfile.duration) {
        bitOffsetAngle = spinTotalAngle;
        phase = "post-spin-wait";
        phaseTimer = Math.max(
          0,
          deps.fireTimeFromSpinStart -
            spinProfile.duration -
            deps.bitFireEffectDuration
        );
        deps.stopSpinLoop();
      }
      return;
    }
    if (phase === "post-spin-wait") {
      phaseTimer = Math.max(0, phaseTimer - delta);
      if (phaseTimer <= 0) {
        startFireEffects();
      }
      return;
    }
    if (phase === "fire-effect") {
      phaseTimer = Math.max(0, phaseTimer - delta);
      if (phaseTimer <= 0) {
        fireBits();
      }
      return;
    }
    if (phase === "hit-sequence") {
      if (!deps.updateHitEntries(delta, shouldProcessOrb)) {
        phase = "post-hit-wait";
        phaseTimer = deps.postHitWaitDuration;
      }
      return;
    }
    if (phase === "post-hit-wait") {
      phaseTimer = Math.max(0, phaseTimer - delta);
      if (phaseTimer > 0) {
        return;
      }
      if (deps.isComplete()) {
        phase = "ended";
        deps.stopSpinLoop();
        return;
      }
      beginRound(true);
    }
  };

  const undo = () => {
    if (undoInProgress) {
      return;
    }
    const snapshot = undoHistory.pop();
    if (!snapshot) {
      return;
    }
    undoInProgress = true;
    deps.stopSpinLoop();
    deps.beginUndoTransition(() => {
      deps.prepareUndoState();
      deps.clearHitEntries();
      deps.clearBeamTargets();
      applySnapshot(snapshot);
      elapsed = 0;
      bitOffsetAngle = 0;
      spinElapsed = 0;
      spinProfile = createRouletteSpinProfile(() => 0);
      spinTotalAngle = 0;
      stopShift = 0;
      phaseTimer = 0;
      bitBaseSlots = [];
      bitFireEntries = [];
      beginRound(false, false);
      undoInProgress = false;
    });
  };

  const isEnded = () => phase === "ended";

  const getStats = (): RouletteRoundStats => ({
    elapsed,
    roundCount,
    surviveCount: surviveCountAtBrainwash,
    noHitRoundCount
  });

  return {
    start,
    update,
    undo,
    reset,
    isEnded,
    getStats
  };
};
