import { Vector3 } from "@babylonjs/core";

import type { AudioManager, SpatialHandle, SpatialPlayOptions } from "./audio";
import {
  assertV2AudioUnitRandom,
  pickV2AudioRandom,
  V2_AUDIO_ASSET_CATALOG,
  type V2AudioAssetCatalog,
} from "./v2AudioAssets";
import voiceManifest from "./voiceManifest.json";
import type {
  V2CharacterState,
  V2HumanTargetSnapshot,
} from "../v2/combatTypes";

type V2VoiceHaigureState = Readonly<{
  enter: readonly string[];
  loop: readonly string[];
}>;

type V2VoiceStates = Readonly<{
  normal: readonly string[];
  evade: readonly string[];
  "hit-a": readonly string[];
  "hit-b": readonly string[];
  "brainwash-in-progress": readonly string[];
  "brainwash-complete-gun": readonly string[];
  "brainwash-complete-no-gun": readonly string[];
  "brainwash-complete-haigure": V2VoiceHaigureState;
  "brainwash-complete-haigure-formation": readonly string[];
}>;

type V2VoiceManifest = Readonly<Record<string, V2VoiceStates>>;

export type V2VoiceProfile = Readonly<{
  id: string;
  states: V2VoiceStates;
}>;

const V2_VOICE_PROFILES: readonly V2VoiceProfile[] = Object.freeze(
  Object.entries(voiceManifest as V2VoiceManifest)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, states]) => Object.freeze({ id, states })),
);

export type V2VoiceAudio = Pick<AudioManager, "playVoice">;

export type V2VoiceRuntimeOptions = Readonly<{
  audio: V2VoiceAudio;
  random: () => number;
  baseOptions: SpatialPlayOptions;
  loopOptions: SpatialPlayOptions;
}>;

export type V2VoiceRuntime = Readonly<{
  update(
    deltaSeconds: number,
    allowIdle: boolean,
    snapshots: readonly V2HumanTargetSnapshot[],
  ): void;
  stopAll(): void;
  dispose(): void;
}>;

type V2VoiceActor = {
  id: string;
  profile: V2VoiceProfile;
  position: Vector3;
  currentState: V2CharacterState;
  lastState: V2CharacterState;
  voiceHandle: SpatialHandle | null;
  idleTimer: number;
  playbackToken: number;
};

const isV2VoiceIdleState = (state: V2CharacterState): boolean =>
  state === "normal" ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun";

const isV2VoiceHitState = (state: V2CharacterState): boolean =>
  state === "hit-a" || state === "hit-b";

const compareSnapshotId = (
  left: V2HumanTargetSnapshot,
  right: V2HumanTargetSnapshot,
): number => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

const createV2VoiceRuntimeInternal = (
  { audio, random, baseOptions, loopOptions }: V2VoiceRuntimeOptions,
  assets: V2AudioAssetCatalog,
): V2VoiceRuntime => {
  if (baseOptions.loop) {
    throw new Error("V2 VOICEのbaseOptions.loopはfalseが必要です。");
  }
  if (!loopOptions.loop) {
    throw new Error("V2 VOICEのloopOptions.loopはtrueが必要です。");
  }
  let actors: Map<string, V2VoiceActor> | null = null;
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2VoiceRuntimeは使用できません。");
    }
  };

  const nextRandom = (): number => {
    const value = random();
    assertV2AudioUnitRandom(value);
    return value;
  };

  const rollIdleTimer = (): number => 8 + nextRandom() * 8;

  const initializeActors = (
    snapshots: readonly V2HumanTargetSnapshot[],
  ): Map<string, V2VoiceActor> => {
    if (snapshots.length === 0) {
      throw new Error("V2 VOICEの初回snapshotにはactorが必要です。");
    }
    const sortedSnapshots = [...snapshots].sort(compareSnapshotId);
    const initialized = new Map<string, V2VoiceActor>();
    for (let index = 0; index < sortedSnapshots.length; index += 1) {
      const snapshot = sortedSnapshots[index];
      if (initialized.has(snapshot.id)) {
        throw new Error(`V2 VOICEのactor IDが重複しています: ${snapshot.id}`);
      }
      const profile = V2_VOICE_PROFILES[index % V2_VOICE_PROFILES.length];
      if (!profile) {
        throw new Error("V2 VOICE manifestにprofileがありません。");
      }
      initialized.set(snapshot.id, {
        id: snapshot.id,
        profile,
        position: snapshot.aimPosition.clone(),
        currentState: snapshot.state,
        lastState: snapshot.state,
        voiceHandle: null,
        idleTimer: rollIdleTimer(),
        playbackToken: 0,
      });
    }
    return initialized;
  };

  const stopActor = (actor: V2VoiceActor): void => {
    actor.playbackToken += 1;
    actor.voiceHandle?.stop();
    actor.voiceHandle = null;
  };

  const pickAvailableVoiceFile = (
    candidates: readonly string[],
  ): string | null =>
    pickV2AudioRandom(candidates.filter(assets.isVoiceFileAvailable), random);

  const startLoop = (
    actor: V2VoiceActor,
    candidates: readonly string[],
  ): void => {
    const file = pickAvailableVoiceFile(candidates);
    stopActor(actor);
    if (file === null) {
      return;
    }
    actor.playbackToken += 1;
    actor.voiceHandle = audio.playVoice(
      assets.resolveVoiceUrl(file),
      () => actor.position,
      loopOptions,
    );
  };

  const playOneShot = (
    actor: V2VoiceActor,
    candidates: readonly string[],
    onEnded?: () => void,
  ): void => {
    const file = pickAvailableVoiceFile(candidates);
    stopActor(actor);
    if (file === null) {
      onEnded?.();
      return;
    }
    actor.playbackToken += 1;
    const playbackToken = actor.playbackToken;
    actor.voiceHandle = audio.playVoice(
      assets.resolveVoiceUrl(file),
      () => actor.position,
      {
        ...baseOptions,
        onEnded: () => {
          if (actor.playbackToken !== playbackToken) {
            return;
          }
          actor.voiceHandle = null;
          onEnded?.();
        },
      },
    );
  };

  const updateActor = (
    actor: V2VoiceActor,
    deltaSeconds: number,
    allowIdle: boolean,
  ): void => {
    if (actor.voiceHandle && !actor.voiceHandle.isActive()) {
      actor.voiceHandle = null;
    }
    const currentState = actor.currentState;
    const previousState = actor.lastState;
    const states = actor.profile.states;
    const haigureState = states["brainwash-complete-haigure"];

    if (previousState !== currentState) {
      if (
        previousState === "brainwash-in-progress" ||
        previousState === "brainwash-complete-haigure" ||
        previousState === "brainwash-complete-haigure-formation"
      ) {
        stopActor(actor);
      }

      if (currentState === "brainwash-complete-haigure-formation") {
        startLoop(actor, states["brainwash-complete-haigure-formation"]);
        actor.lastState = currentState;
        return;
      }

      if (currentState === "brainwash-in-progress") {
        startLoop(actor, states["brainwash-in-progress"]);
      }

      if (currentState === "brainwash-complete-haigure") {
        playOneShot(actor, haigureState.enter, () => {
          if (actor.currentState === "brainwash-complete-haigure") {
            startLoop(actor, haigureState.loop);
          }
        });
      }

      if (currentState === "hit-a" && !isV2VoiceHitState(previousState)) {
        playOneShot(actor, states["hit-a"]);
      }

      if (currentState === "evade" && previousState !== "evade") {
        playOneShot(actor, states.evade);
      }
      if (isV2VoiceIdleState(currentState)) {
        actor.idleTimer = rollIdleTimer();
      }
    }

    if (allowIdle && isV2VoiceIdleState(currentState)) {
      actor.idleTimer -= deltaSeconds;
      if (actor.idleTimer <= 0 && actor.voiceHandle === null) {
        if (currentState === "normal") {
          playOneShot(actor, states.normal);
        } else if (currentState === "brainwash-complete-gun") {
          playOneShot(actor, states["brainwash-complete-gun"]);
        } else {
          playOneShot(actor, states["brainwash-complete-no-gun"]);
        }
        actor.idleTimer = rollIdleTimer();
      }
    }

    actor.lastState = currentState;
  };

  const stopAllActors = (): void => {
    if (actors === null) {
      return;
    }
    for (const actor of actors.values()) {
      stopActor(actor);
    }
  };

  return Object.freeze({
    update: (deltaSeconds, allowIdle, snapshots) => {
      assertActive();
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
        throw new Error(
          `V2 VOICEのdeltaSecondsは0以上の有限値が必要です: ${deltaSeconds}`,
        );
      }
      if (actors === null) {
        actors = initializeActors(snapshots);
      }
      const snapshotsById = new Map<string, V2HumanTargetSnapshot>();
      for (const snapshot of snapshots) {
        if (snapshotsById.has(snapshot.id)) {
          throw new Error(`V2 VOICEのactor IDが重複しています: ${snapshot.id}`);
        }
        snapshotsById.set(snapshot.id, snapshot);
      }
      if (snapshotsById.size !== actors.size) {
        throw new Error(
          "V2 VOICEのactor集合は初回snapshotから変更できません。",
        );
      }
      for (const actor of actors.values()) {
        const snapshot = snapshotsById.get(actor.id);
        if (!snapshot) {
          throw new Error(`V2 VOICEのactor snapshotがありません: ${actor.id}`);
        }
        actor.position.copyFrom(snapshot.aimPosition);
        actor.currentState = snapshot.state;
        updateActor(actor, deltaSeconds, allowIdle);
      }
    },
    stopAll: () => {
      assertActive();
      stopAllActors();
    },
    dispose: () => {
      assertActive();
      stopAllActors();
      actors?.clear();
      actors = null;
      disposed = true;
    },
  });
};

export const createV2VoiceRuntime = (
  options: V2VoiceRuntimeOptions,
): V2VoiceRuntime =>
  createV2VoiceRuntimeInternal(options, V2_AUDIO_ASSET_CATALOG);

export const createV2VoiceRuntimeForAssetCatalog = (
  options: V2VoiceRuntimeOptions,
  assets: V2AudioAssetCatalog,
): V2VoiceRuntime => createV2VoiceRuntimeInternal(options, assets);
