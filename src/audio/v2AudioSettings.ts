import type { AudioCategory, AudioManager } from "./audio";
import {
  isV2TitleSettingsRecord,
  readV2TitleSettingsRoot,
  writeV2TitleSettingsSection,
  type V2TitleSettingsStorage
} from "../v2TitleSettingsStore";

export type V2AudioVolumeLevels = Readonly<Record<AudioCategory, number>>;

export const V2_DEFAULT_AUDIO_VOLUME_LEVELS: V2AudioVolumeLevels =
  Object.freeze({
    voice: 5,
    bgm: 5,
    se: 5,
  });

const V2_AUDIO_CATEGORY_BASE_GAINS: Readonly<Record<AudioCategory, number>> =
  Object.freeze({
    bgm: 0.325,
    se: 0.9,
    voice: 1,
  });

const AUDIO_CATEGORIES: readonly AudioCategory[] = Object.freeze([
  "voice",
  "bgm",
  "se",
]);

const assertVolumeLevel = (level: number): void => {
  if (!Number.isInteger(level) || level < 0 || level > 10) {
    throw new Error(`音量レベルは0以上10以下の整数が必要です: ${level}`);
  }
};

export const resolveV2AudioCategoryGain = (
  category: AudioCategory,
  level: number,
): number => {
  assertVolumeLevel(level);
  return V2_AUDIO_CATEGORY_BASE_GAINS[category] * (level / 10);
};

export type V2AudioVolumeTarget = Pick<AudioManager, "setCategoryVolume">;

export const applyV2AudioVolumeLevels = (
  target: V2AudioVolumeTarget,
  levels: V2AudioVolumeLevels,
): void => {
  for (const category of AUDIO_CATEGORIES) {
    target.setCategoryVolume(
      category,
      resolveV2AudioCategoryGain(category, levels[category]),
    );
  }
};

export type V2AudioVolumeSettingsStore = Readonly<{
  load(): V2AudioVolumeLevels;
  save(levels: V2AudioVolumeLevels): void;
  saveLevel(
    levels: V2AudioVolumeLevels,
    category: AudioCategory,
    level: number,
  ): V2AudioVolumeLevels;
}>;

const normalizeStoredVolumeLevel = (
  value: unknown,
  fallback: number,
): Readonly<{ value: number; changed: boolean }> => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Object.freeze({ value: fallback, changed: true });
  }
  const normalized = Math.max(0, Math.min(10, Math.round(value)));
  return Object.freeze({
    value: normalized,
    changed: normalized !== value,
  });
};

const writeVolumeLevels = (
  storage: V2TitleSettingsStorage,
  root: Record<string, unknown>,
  levels: V2AudioVolumeLevels,
): void => {
  writeV2TitleSettingsSection(storage, root, "volumeLevels", {
    voice: levels.voice,
    bgm: levels.bgm,
    se: levels.se
  });
};

const assertVolumeLevels = (levels: V2AudioVolumeLevels): void => {
  for (const category of AUDIO_CATEGORIES) {
    assertVolumeLevel(levels[category]);
  }
};

export const createV2AudioVolumeSettingsStore = (
  storage: V2TitleSettingsStorage,
): V2AudioVolumeSettingsStore => ({
  load: () => {
    const storedSettings = readV2TitleSettingsRoot(storage);
    if (!storedSettings.stored) {
      return { ...V2_DEFAULT_AUDIO_VOLUME_LEVELS };
    }
    const storedVolumeLevels = isV2TitleSettingsRecord(
      storedSettings.root.volumeLevels,
    )
      ? storedSettings.root.volumeLevels
      : {};
    const voice = normalizeStoredVolumeLevel(
      storedVolumeLevels.voice,
      V2_DEFAULT_AUDIO_VOLUME_LEVELS.voice,
    );
    const bgm = normalizeStoredVolumeLevel(
      storedVolumeLevels.bgm,
      V2_DEFAULT_AUDIO_VOLUME_LEVELS.bgm,
    );
    const se = normalizeStoredVolumeLevel(
      storedVolumeLevels.se,
      V2_DEFAULT_AUDIO_VOLUME_LEVELS.se,
    );
    const levels: V2AudioVolumeLevels = {
      voice: voice.value,
      bgm: bgm.value,
      se: se.value,
    };
    if (
      storedSettings.changed ||
      !isV2TitleSettingsRecord(storedSettings.root.volumeLevels) ||
      voice.changed ||
      bgm.changed ||
      se.changed
    ) {
      writeVolumeLevels(storage, storedSettings.root, levels);
    }
    return levels;
  },
  save: (levels) => {
    assertVolumeLevels(levels);
    const storedSettings = readV2TitleSettingsRoot(storage);
    writeVolumeLevels(storage, storedSettings.root, levels);
  },
  saveLevel: (levels, category, level) => {
    assertVolumeLevels(levels);
    assertVolumeLevel(level);
    const nextLevels: V2AudioVolumeLevels = {
      ...levels,
      [category]: level,
    };
    const storedSettings = readV2TitleSettingsRoot(storage);
    writeVolumeLevels(storage, storedSettings.root, nextLevels);
    return nextLevels;
  },
});
