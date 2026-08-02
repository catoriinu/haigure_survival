import type { Vector3 } from "@babylonjs/core";

import type { V2BeamOriginKind } from "./combatTypes";

export type V2GameplayAudioEvent =
  | Readonly<{
      kind: "bit-target";
      position: Vector3;
    }>
  | Readonly<{
      kind: "beam-shot";
      originKind: V2BeamOriginKind;
      position: Vector3;
    }>
  | Readonly<{
      kind: "character-hit";
      position: Vector3;
    }>
  | Readonly<{
      kind: "alarm";
      position: Vector3;
    }>;

export interface V2GameplayAudioEventQueue {
  enqueue(event: V2GameplayAudioEvent): void;
  drain(): readonly V2GameplayAudioEvent[];
  clear(): void;
  dispose(): void;
}

const EMPTY_V2_GAMEPLAY_AUDIO_EVENTS: readonly V2GameplayAudioEvent[] =
  Object.freeze([]);

export const createV2GameplayAudioEventQueue =
  (): V2GameplayAudioEventQueue => {
    let pendingEvents: V2GameplayAudioEvent[] = [];
    let disposed = false;

    const assertActive = (): void => {
      if (disposed) {
        throw new Error(
          "破棄済みのV2 gameplay audio event queueは使用できません。"
        );
      }
    };

    return Object.freeze({
      enqueue: (event: V2GameplayAudioEvent) => {
        assertActive();
        pendingEvents.push(event);
      },
      drain: () => {
        assertActive();
        if (pendingEvents.length === 0) {
          return EMPTY_V2_GAMEPLAY_AUDIO_EVENTS;
        }
        const events = pendingEvents;
        pendingEvents = [];
        return Object.freeze(events);
      },
      clear: () => {
        assertActive();
        if (pendingEvents.length > 0) {
          pendingEvents = [];
        }
      },
      dispose: () => {
        assertActive();
        if (pendingEvents.length > 0) {
          pendingEvents = [];
        }
        disposed = true;
      }
    });
  };
