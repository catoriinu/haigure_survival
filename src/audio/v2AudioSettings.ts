import type { AudioCategory, AudioManager } from "./audio";
import type { V2TitleSettingsStore } from "../v2TitleSettingsStore";

export type V2AudioVolumeLevels = Readonly<Record<AudioCategory, number>>;

export const V2_DEFAULT_AUDIO_VOLUME_LEVELS: V2AudioVolumeLevels =
  Object.freeze({ voice: 5, bgm: 5, se: 5 });

const V2_AUDIO_CATEGORY_BASE_GAINS: Readonly<Record<AudioCategory, number>> =
  Object.freeze({ bgm: 0.325, se: 0.9, voice: 1 });

const AUDIO_CATEGORIES: readonly AudioCategory[] = Object.freeze([
  "voice",
  "bgm",
  "se"
]);

const assertVolumeLevel = (level: number): void => {
  if (!Number.isInteger(level) || level < 0 || level > 10) {
    throw new Error(`音量レベルは0以上10以下の整数が必要です: ${level}`);
  }
};

export const resolveV2AudioCategoryGain = (
  category: AudioCategory,
  level: number
): number => {
  assertVolumeLevel(level);
  return V2_AUDIO_CATEGORY_BASE_GAINS[category] * (level / 10);
};

export type V2AudioVolumeTarget = Pick<AudioManager, "setCategoryVolume">;

export const applyV2AudioVolumeLevels = (
  target: V2AudioVolumeTarget,
  levels: V2AudioVolumeLevels
): void => {
  for (const category of AUDIO_CATEGORIES) {
    target.setCategoryVolume(
      category,
      resolveV2AudioCategoryGain(category, levels[category])
    );
  }
};

export type V2AudioVolumeSettingsStore = Readonly<{
  load(): V2AudioVolumeLevels;
  save(levels: V2AudioVolumeLevels): void;
  saveLevel(
    levels: V2AudioVolumeLevels,
    category: AudioCategory,
    level: number
  ): V2AudioVolumeLevels;
}>;

const assertVolumeLevels = (levels: V2AudioVolumeLevels): void => {
  for (const category of AUDIO_CATEGORIES) {
    assertVolumeLevel(levels[category]);
  }
};

const readLevels = (settingsStore: V2TitleSettingsStore): V2AudioVolumeLevels => {
  const { audio } = settingsStore.get();
  return Object.freeze({ bgm: audio.bgm, se: audio.se, voice: audio.voice });
};

export const createV2AudioVolumeSettingsStore = (
  settingsStore: V2TitleSettingsStore
): V2AudioVolumeSettingsStore =>
  Object.freeze({
    load: () => readLevels(settingsStore),
    save: (levels) => {
      assertVolumeLevels(levels);
      settingsStore.update((settings) => ({
        ...settings,
        audio: { ...levels }
      }));
    },
    saveLevel: (levels, category, level) => {
      assertVolumeLevels(levels);
      assertVolumeLevel(level);
      const nextLevels: V2AudioVolumeLevels = Object.freeze({
        ...levels,
        [category]: level
      });
      settingsStore.update((settings) => ({
        ...settings,
        audio: { ...nextLevels }
      }));
      return nextLevels;
    }
  });
