import type { AudioCategory, AudioManager } from "./audio";

export type V2AudioVolumeLevels = Readonly<Record<AudioCategory, number>>;

export const V2_DEFAULT_AUDIO_VOLUME_LEVELS: V2AudioVolumeLevels =
  Object.freeze({
    voice: 5,
    bgm: 5,
    se: 5,
  });

export const V2_TITLE_SETTINGS_STORAGE_KEY = "haigure-survival.title-settings";

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

type V2AudioSettingsStorage = Pick<Storage, "getItem" | "setItem">;

export type V2AudioVolumeSettingsStore = Readonly<{
  load(): V2AudioVolumeLevels;
  save(levels: V2AudioVolumeLevels): void;
  saveLevel(
    levels: V2AudioVolumeLevels,
    category: AudioCategory,
    level: number,
  ): V2AudioVolumeLevels;
}>;

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const readSettingsRoot = (
  storage: V2AudioSettingsStorage,
): Readonly<{
  root: Record<string, unknown>;
  stored: boolean;
  changed: boolean;
}> => {
  const serialized = storage.getItem(V2_TITLE_SETTINGS_STORAGE_KEY);
  if (serialized === null) {
    return Object.freeze({ root: {}, stored: false, changed: false });
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isJsonRecord(parsed)) {
      return Object.freeze({ root: parsed, stored: true, changed: false });
    }
    return Object.freeze({ root: {}, stored: true, changed: true });
  } catch {
    return Object.freeze({ root: {}, stored: true, changed: true });
  }
};

const writeVolumeLevels = (
  storage: V2AudioSettingsStorage,
  root: Record<string, unknown>,
  levels: V2AudioVolumeLevels,
): void => {
  const currentVolumeLevels = isJsonRecord(root.volumeLevels)
    ? root.volumeLevels
    : {};
  storage.setItem(
    V2_TITLE_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...root,
      volumeLevels: {
        ...currentVolumeLevels,
        voice: levels.voice,
        bgm: levels.bgm,
        se: levels.se,
      },
    }),
  );
};

const assertVolumeLevels = (levels: V2AudioVolumeLevels): void => {
  for (const category of AUDIO_CATEGORIES) {
    assertVolumeLevel(levels[category]);
  }
};

export const createV2AudioVolumeSettingsStore = (
  storage: V2AudioSettingsStorage,
): V2AudioVolumeSettingsStore => ({
  load: () => {
    const storedSettings = readSettingsRoot(storage);
    if (!storedSettings.stored) {
      return { ...V2_DEFAULT_AUDIO_VOLUME_LEVELS };
    }
    const storedVolumeLevels = isJsonRecord(storedSettings.root.volumeLevels)
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
      !isJsonRecord(storedSettings.root.volumeLevels) ||
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
    const storedSettings = readSettingsRoot(storage);
    writeVolumeLevels(storage, storedSettings.root, levels);
  },
  saveLevel: (levels, category, level) => {
    assertVolumeLevels(levels);
    assertVolumeLevel(level);
    const nextLevels: V2AudioVolumeLevels = {
      ...levels,
      [category]: level,
    };
    const storedSettings = readSettingsRoot(storage);
    writeVolumeLevels(storage, storedSettings.root, nextLevels);
    return nextLevels;
  },
});
