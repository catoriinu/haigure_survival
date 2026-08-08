import { Vector3 } from "@babylonjs/core";

import type { SpatialPlayOptions } from "./audio";
import { SfxDirector, type SfxAudio } from "./sfxDirector";
import type { V2AudioAssetCatalog } from "./v2AudioAssets";

export * from "./v2AudioAssets";
export * from "./v2AudioSettings";
export * from "./v2VoiceRuntime";

const V2_SE_BASE_OPTIONS: SpatialPlayOptions = Object.freeze({
  volume: 0.95,
  maxDistance: 3.75,
  loop: false,
});
const V2_SE_ALERT_LOOP_OPTIONS: SpatialPlayOptions = Object.freeze({
  volume: 0.95,
  maxDistance: 3.75,
  loop: true,
});
const V2_SE_BEAM_OPTIONS: SpatialPlayOptions = Object.freeze({
  volume: 0.8,
  maxDistance: 5,
  loop: false,
});
const V2_SE_HIT_OPTIONS: SpatialPlayOptions = Object.freeze({
  volume: 1,
  maxDistance: 5.42,
  loop: false,
});
const V2_SE_ALARM_OPTIONS: SpatialPlayOptions = Object.freeze({
  volume: 0.95,
  maxDistance: 6,
  loop: false,
});

export type V2GameplayAudioBridgeEvent =
  | Readonly<{
      kind: "bit-target";
      position: Vector3;
    }>
  | Readonly<{
      kind: "beam-shot";
      originKind: string;
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

export type V2GameplayAudioBridge = Readonly<{
  dispatch(events: readonly V2GameplayAudioBridgeEvent[]): void;
  dispose(): void;
}>;

export type V2GameplayAudioBridgeOptions = Readonly<{
  audio: SfxAudio;
  assets: V2AudioAssetCatalog;
  getListenerPosition: () => Vector3;
}>;

export const createV2GameplayAudioBridge = ({
  audio,
  assets,
  getListenerPosition,
}: V2GameplayAudioBridgeOptions): V2GameplayAudioBridge => {
  const bitMove = assets.resolveAssetUrl("audio/se/FlyingObject.mp3");
  const bitAlert = assets.resolveAssetUrl("audio/se/BeamShot_WavingPart.mp3");
  const bitTarget = assets.resolveAssetUrl("audio/se/aim.mp3");
  const alarm = assets.resolveAssetUrl("audio/se/alarm.mp3");
  const sfxDirector = new SfxDirector(
    audio,
    getListenerPosition,
    {
      bitMove,
      bitAlert,
      bitTarget,
      beamNonTarget: [
        assets.resolveAssetUrl("audio/se/BeamShotR_DownLong.mp3"),
        assets.resolveAssetUrl("audio/se/BeamShotR_Down.mp3"),
        assets.resolveAssetUrl("audio/se/BeamShotR_DownShort.mp3"),
      ],
      beamTarget: [
        assets.resolveAssetUrl("audio/se/BeamShotR_Up.mp3"),
        assets.resolveAssetUrl("audio/se/BeamShotR_UpShort.mp3"),
        assets.resolveAssetUrl("audio/se/BeamShotR_UpHighShort.mp3"),
      ],
      hit: [
        assets.resolveAssetUrl("audio/se/BeamHit_Rev.mp3"),
        assets.resolveAssetUrl("audio/se/BeamHit_RevLong.mp3"),
        assets.resolveAssetUrl("audio/se/BeamHit_RevLongFast.mp3"),
      ],
    },
    {
      base: V2_SE_BASE_OPTIONS,
      alertLoop: V2_SE_ALERT_LOOP_OPTIONS,
      beam: V2_SE_BEAM_OPTIONS,
      hit: V2_SE_HIT_OPTIONS,
    },
    {
      far: 2.33,
      mid: 1.33,
    },
    assets.isSeAvailable,
  );
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2GameplayAudioBridgeは使用できません。");
    }
  };

  return Object.freeze({
    dispatch: (events) => {
      assertActive();
      for (const event of events) {
        const position = event.position;
        if (event.kind === "bit-target") {
          sfxDirector.playBitTarget(() => position);
        } else if (event.kind === "beam-shot") {
          sfxDirector.playBeamNonTarget(() => position);
        } else if (event.kind === "character-hit") {
          sfxDirector.playHit(() => position);
        } else if (event.kind === "alarm") {
          if (assets.isSeAvailable(alarm)) {
            audio.playSe(alarm, () => position, V2_SE_ALARM_OPTIONS);
          }
        } else {
          const exhaustive: never = event;
          throw new Error(`未対応のV2音声イベントです: ${String(exhaustive)}`);
        }
      }
    },
    dispose: () => {
      assertActive();
      disposed = true;
    },
  });
};
