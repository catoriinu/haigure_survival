import { Vector3 } from "@babylonjs/core";
import { CharacterState, isHitState } from "../game/entities";
import { SpatialHandle, SpatialPlayOptions } from "./audio";
import voiceManifest from "./voiceManifest.json";

type VoiceTags = {
  a: string[];
  b: string[];
  c: string[];
  tag110: string[];
  tag410: string[];
  tag410Lineup: string[];
};

export type VoiceProfile = {
  id: string;
  folder: string;
  tags: VoiceTags;
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

const buildVoiceProfiles = () => {
  const byFolder = new Map<string, VoiceProfile>();

  for (const path of voiceManifest) {
    const parts = path.split("/");
    const folder = parts[parts.length - 2];
    const file = parts[parts.length - 1];
    const id = folder.slice(0, 2);
    let profile = byFolder.get(folder);
    if (!profile) {
      profile = {
        id,
        folder,
        tags: {
          a: [],
          b: [],
          c: [],
          tag110: [],
          tag410: [],
          tag410Lineup: []
        }
      };
      byFolder.set(folder, profile);
    }

    if (file.includes("_410ハイグレ揃")) {
      profile.tags.tag410Lineup.push(path);
    } else if (file.includes("_410")) {
      profile.tags.tag410.push(path);
    }
    if (file.includes("_110")) {
      profile.tags.tag110.push(path);
    }
    if (file.includes("_A")) {
      profile.tags.a.push(path);
    }
    if (file.includes("_B")) {
      profile.tags.b.push(path);
    }
    if (file.includes("_C")) {
      profile.tags.c.push(path);
    }
  }

  return Array.from(byFolder.values());
};

export const voiceProfiles = buildVoiceProfiles();

const pickRandom = (items: string[]) =>
  items[Math.floor(Math.random() * items.length)]!;

const rollIdleTimer = () => 8 + Math.random() * 8;

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
  delta: number,
  allowIdle: boolean,
  baseOptions: SpatialPlayOptions,
  loopOptions: SpatialPlayOptions
) => {
  const currentState = actor.getState();
  const previousState = actor.lastState;
  const tags = actor.profile.tags;

  const playOneShot = (file: string, onEnded?: () => void) => {
    stopVoiceActor(actor);
    actor.voiceHandle = audio.playVoice(
      file,
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

  const startLoop = (file: string) => {
    stopVoiceActor(actor);
    actor.voiceHandle = audio.playVoice(
      file,
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
      startLoop(pickRandom(tags.tag410Lineup));
      actor.lastState = currentState;
      return;
    }

    if (currentState === "brainwash-in-progress") {
      startLoop(pickRandom(tags.tag110));
    }

    if (
      currentState === "brainwash-complete-gun" ||
      currentState === "brainwash-complete-no-gun"
    ) {
      playOneShot(pickRandom(tags.a));
    }

    if (currentState === "brainwash-complete-haigure") {
      playOneShot(pickRandom(tags.a), () => {
        if (actor.getState() === "brainwash-complete-haigure") {
          startLoop(pickRandom(tags.tag410));
        }
      });
    }

    if (currentState === "hit-a" && !isHitState(previousState)) {
      playOneShot(pickRandom(tags.c));
    }

    if (currentState === "evade" && previousState !== "evade") {
      playOneShot(pickRandom(tags.b));
    }
  }

  if (currentState !== "normal") {
    actor.idleTimer = rollIdleTimer();
  }

  if (allowIdle && currentState === "normal") {
    actor.idleTimer -= delta;
    if (actor.idleTimer <= 0 && !actor.voiceHandle) {
      playOneShot(pickRandom(tags.b));
      actor.idleTimer = rollIdleTimer();
    }
  }

  actor.lastState = currentState;
};
