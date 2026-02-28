import { Vector3 } from "@babylonjs/core";
import { CharacterState, isHitState } from "../game/entities";
import { SpatialHandle, SpatialPlayOptions } from "./audio";
import type { VoiceManifest, VoiceStates } from "../runtimeAssets/types";

export type VoiceProfile = {
  id: string;
  states: VoiceStates;
};

export type VoiceActor = {
  profile: VoiceProfile;
  getPosition: () => Vector3;
  getState: () => CharacterState;
  lastState: CharacterState;
  voiceHandle: SpatialHandle | null;
  idleTimer: number;
};

export type VoiceAudio = {
  playVoice: (
    url: string,
    getPosition: () => Vector3,
    options: SpatialPlayOptions
  ) => SpatialHandle;
};

export const buildVoiceProfiles = (manifest: VoiceManifest) => {
  const profiles: VoiceProfile[] = [];
  for (const [id, states] of Object.entries(manifest)) {
    profiles.push({
      id,
      states
    });
  }
  return profiles;
};

const pickRandom = (items: string[]) => {
  if (items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
};

const resolveVoiceUrl = (basePath: string, path: string) =>
  `${basePath}/${path}`;

const rollIdleTimer = () => 8 + Math.random() * 8;
const isIdleVoiceState = (state: CharacterState) =>
  state === "normal" ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun";

export const createVoiceActor = (
  profile: VoiceProfile,
  getPosition: () => Vector3,
  getState: () => CharacterState
): VoiceActor => ({
  profile,
  getPosition,
  getState,
  lastState: getState(),
  voiceHandle: null,
  idleTimer: rollIdleTimer()
});

export const stopVoiceActor = (actor: VoiceActor) => {
  if (actor.voiceHandle) {
    actor.voiceHandle.stop();
    actor.voiceHandle = null;
  }
};

export const updateVoiceActor = (
  actor: VoiceActor,
  audio: VoiceAudio,
  voiceBasePath: string,
  delta: number,
  allowIdle: boolean,
  baseOptions: SpatialPlayOptions,
  loopOptions: SpatialPlayOptions
) => {
  const currentState = actor.getState();
  const previousState = actor.lastState;
  const states = actor.profile.states;
  const haigureState = states["brainwash-complete-haigure"];

  const playOneShot = (files: string[], onEnded?: () => void) => {
    const file = pickRandom(files);
    stopVoiceActor(actor);
    if (!file) {
      return;
    }
    actor.voiceHandle = audio.playVoice(
      resolveVoiceUrl(voiceBasePath, file),
      actor.getPosition,
      {
        ...baseOptions,
        onEnded: () => {
          actor.voiceHandle = null;
          if (onEnded) {
            onEnded();
          }
        }
      }
    );
  };

  const startLoop = (files: string[]) => {
    const file = pickRandom(files);
    stopVoiceActor(actor);
    if (!file) {
      return;
    }
    actor.voiceHandle = audio.playVoice(
      resolveVoiceUrl(voiceBasePath, file),
      actor.getPosition,
      loopOptions
    );
  };

  if (previousState !== currentState) {
    if (
      previousState === "brainwash-in-progress" ||
      previousState === "brainwash-complete-haigure" ||
      previousState === "brainwash-complete-haigure-formation"
    ) {
      stopVoiceActor(actor);
    }

    if (currentState === "brainwash-complete-haigure-formation") {
      startLoop(states["brainwash-complete-haigure-formation"]);
      actor.lastState = currentState;
      return;
    }

    if (currentState === "brainwash-in-progress") {
      startLoop(states["brainwash-in-progress"]);
    }

    if (currentState === "brainwash-complete-haigure") {
      playOneShot(haigureState.enter, () => {
        if (actor.getState() === "brainwash-complete-haigure") {
          startLoop(haigureState.loop);
        }
      });
    }

    if (currentState === "hit-a" && !isHitState(previousState)) {
      playOneShot(states["hit-a"]);
    }

    if (currentState === "evade" && previousState !== "evade") {
      playOneShot(states.evade);
    }
  }

  if (!isIdleVoiceState(currentState)) {
    actor.idleTimer = rollIdleTimer();
  }

  if (allowIdle && isIdleVoiceState(currentState)) {
    actor.idleTimer -= delta;
    if (actor.idleTimer <= 0 && !actor.voiceHandle) {
      if (currentState === "normal") {
        playOneShot(states.normal);
      } else if (currentState === "brainwash-complete-gun") {
        playOneShot(states["brainwash-complete-gun"]);
      } else {
        playOneShot(states["brainwash-complete-no-gun"]);
      }
      actor.idleTimer = rollIdleTimer();
    }
  }

  actor.lastState = currentState;
};
