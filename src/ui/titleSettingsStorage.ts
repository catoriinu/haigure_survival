import type { BitSpawnSettings } from "./bitSpawnPanel";
import type { BrainwashSettings } from "./brainwashSettingsPanel";
import type { DefaultStartSettings } from "./defaultSettingsPanel";
import {
  executeMethodOptions,
  normalizeExecuteSettings,
  type ExecuteSettings
} from "./executeSettings";
import type { PlayerSettings } from "./playerSettingsPanel";
import type { VolumeLevels } from "./volumePanel";

export type PersistedTitleSettings = {
  version: number;
  volumeLevels: VolumeLevels;
  stageId: string;
  alarmTrapEnabled: boolean;
  playerSettings: PlayerSettings;
  defaultStartSettings: DefaultStartSettings;
  brainwashSettings: BrainwashSettings;
  bitSpawnSettings: BitSpawnSettings;
  executeSettings: ExecuteSettings;
};

export type TitleSettingsDefaults = {
  volumeLevels: VolumeLevels;
  stageId: string;
  alarmTrapEnabled: boolean;
  playerSettings: PlayerSettings;
  defaultStartSettings: DefaultStartSettings;
  brainwashSettings: BrainwashSettings;
  bitSpawnSettings: BitSpawnSettings;
  executeSettings: ExecuteSettings;
};

const clampInteger = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

const readClampedInteger = (
  source: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  fallback: number
) => {
  const rawValue = source[key];
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return { value: fallback, changed: true };
  }
  const value = clampInteger(rawValue, min, max);
  return { value, changed: value !== rawValue };
};

const readNumber = (
  source: Record<string, unknown>,
  key: string,
  fallback: number
) => {
  const rawValue = source[key];
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
    return { value: fallback, changed: true };
  }
  return { value: rawValue, changed: false };
};

const readBoolean = (
  source: Record<string, unknown>,
  key: string,
  fallback: boolean
) => {
  const rawValue = source[key];
  if (typeof rawValue !== "boolean") {
    return { value: fallback, changed: true };
  }
  return { value: rawValue, changed: false };
};

const readObject = (source: Record<string, unknown>, key: string) => {
  const rawValue = source[key];
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return { value: rawValue as Record<string, unknown>, changed: false };
  }
  return { value: {}, changed: true };
};

const readNullableDirectory = (
  source: Record<string, unknown>,
  key: string,
  validDirectories: ReadonlySet<string>,
  fallback: string | null
) => {
  const rawValue = source[key];
  if (rawValue === null) {
    return { value: null, changed: false };
  }
  if (typeof rawValue !== "string" || !validDirectories.has(rawValue)) {
    return { value: fallback, changed: true };
  }
  return { value: rawValue, changed: false };
};

const executeMethodSet = new Set(
  executeMethodOptions.map((option) => option.value)
);

const readExecuteMethod = (
  source: Record<string, unknown>,
  key: string,
  fallback: ExecuteSettings["method"]
) => {
  const rawValue = source[key];
  if (typeof rawValue !== "string" || !executeMethodSet.has(rawValue)) {
    return { value: fallback, changed: true };
  }
  return { value: rawValue as ExecuteSettings["method"], changed: false };
};

const normalizeBrainwashPercentPair = (
  gunPercent: number,
  noGunPercent: number
) => {
  const overflow = gunPercent + noGunPercent - 100;
  if (overflow <= 0) {
    return { gunPercent, noGunPercent, changed: false };
  }
  return {
    gunPercent,
    noGunPercent: noGunPercent - overflow,
    changed: true
  };
};

export const buildDefaultPersistedTitleSettings = (
  version: number,
  defaults: TitleSettingsDefaults
): PersistedTitleSettings => ({
  version,
  volumeLevels: { ...defaults.volumeLevels },
  stageId: defaults.stageId,
  alarmTrapEnabled: defaults.alarmTrapEnabled,
  playerSettings: { ...defaults.playerSettings },
  defaultStartSettings: { ...defaults.defaultStartSettings },
  brainwashSettings: { ...defaults.brainwashSettings },
  bitSpawnSettings: { ...defaults.bitSpawnSettings },
  executeSettings: { ...defaults.executeSettings }
});

export const normalizePersistedTitleSettings = (
  raw: unknown,
  version: number,
  defaults: TitleSettingsDefaults,
  stageIds: ReadonlySet<string>,
  portraitDirectories: ReadonlySet<string>,
  voiceDirectories: ReadonlySet<string>
) => {
  const defaultSettings = buildDefaultPersistedTitleSettings(version, defaults);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { settings: defaultSettings, changed: true };
  }
  const source = raw as Record<string, unknown>;
  const sourceVersion = source.version;
  const isCurrentVersion = sourceVersion === version;
  const isLegacyVersion = sourceVersion === version - 1;
  const isLegacyCameraSettingsVersion = sourceVersion === 2;
  if (!isCurrentVersion && !isLegacyVersion) {
    return { settings: defaultSettings, changed: true };
  }

  let changed = isLegacyVersion;
  const stageId =
    typeof source.stageId === "string" && stageIds.has(source.stageId)
      ? source.stageId
      : defaultSettings.stageId;
  if (stageId !== source.stageId) {
    changed = true;
  }

  const volumeObject = readObject(source, "volumeLevels");
  changed ||= volumeObject.changed;
  const volumeVoice = readClampedInteger(
    volumeObject.value,
    "voice",
    0,
    10,
    defaultSettings.volumeLevels.voice
  );
  const volumeBgm = readClampedInteger(
    volumeObject.value,
    "bgm",
    0,
    10,
    defaultSettings.volumeLevels.bgm
  );
  const volumeSe = readClampedInteger(
    volumeObject.value,
    "se",
    0,
    10,
    defaultSettings.volumeLevels.se
  );
  changed ||= volumeVoice.changed || volumeBgm.changed || volumeSe.changed;
  const volumeLevels: VolumeLevels = {
    voice: volumeVoice.value,
    bgm: volumeBgm.value,
    se: volumeSe.value
  };

  const alarmTrapEnabledValue = readBoolean(
    source,
    "alarmTrapEnabled",
    defaultSettings.alarmTrapEnabled
  );
  changed ||= alarmTrapEnabledValue.changed;

  const playerSettingsObject = isLegacyCameraSettingsVersion
    ? readObject(source, "cameraSettings")
    : readObject(source, "playerSettings");
  changed ||= playerSettingsObject.changed;
  const playerHeightCellsValue = readNumber(
    playerSettingsObject.value,
    "heightCells",
    defaultSettings.playerSettings.heightCells
  );
  changed ||= playerHeightCellsValue.changed;
  const playerPortraitDirectoryValue = isLegacyCameraSettingsVersion
    ? { value: defaultSettings.playerSettings.portraitDirectory, changed: true }
    : readNullableDirectory(
        playerSettingsObject.value,
        "portraitDirectory",
        portraitDirectories,
        defaultSettings.playerSettings.portraitDirectory
      );
  const playerVoiceDirectoryValue = isLegacyCameraSettingsVersion
    ? { value: defaultSettings.playerSettings.voiceDirectory, changed: true }
    : readNullableDirectory(
        playerSettingsObject.value,
        "voiceDirectory",
        voiceDirectories,
        defaultSettings.playerSettings.voiceDirectory
      );
  const enableCharacterSpriteVerticalAngleValue = readBoolean(
    playerSettingsObject.value,
    "enableCharacterSpriteVerticalAngle",
    defaultSettings.playerSettings.enableCharacterSpriteVerticalAngle
  );
  const showGroundShadowsValue = readBoolean(
    playerSettingsObject.value,
    "showGroundShadows",
    defaultSettings.playerSettings.showGroundShadows
  );
  changed ||=
    playerPortraitDirectoryValue.changed ||
    playerVoiceDirectoryValue.changed ||
    showGroundShadowsValue.changed ||
    enableCharacterSpriteVerticalAngleValue.changed;
  const playerSettings: PlayerSettings = {
    heightCells: playerHeightCellsValue.value,
    portraitDirectory: playerPortraitDirectoryValue.value,
    voiceDirectory: playerVoiceDirectoryValue.value,
    showGroundShadows: showGroundShadowsValue.value,
    enableCharacterSpriteVerticalAngle:
      enableCharacterSpriteVerticalAngleValue.value
  };

  const defaultSettingsObject = readObject(source, "defaultStartSettings");
  changed ||= defaultSettingsObject.changed;
  const startPlayerAsBrainwashCompleteGunValue = readBoolean(
    defaultSettingsObject.value,
    "startPlayerAsBrainwashCompleteGun",
    defaultSettings.defaultStartSettings.startPlayerAsBrainwashCompleteGun
  );
  const initialNpcCountValue = readClampedInteger(
    defaultSettingsObject.value,
    "initialNpcCount",
    0,
    99,
    defaultSettings.defaultStartSettings.initialNpcCount
  );
  const initialBrainwashedNpcPercentValue = readClampedInteger(
    defaultSettingsObject.value,
    "initialBrainwashedNpcPercent",
    0,
    100,
    defaultSettings.defaultStartSettings.initialBrainwashedNpcPercent
  );
  changed ||=
    startPlayerAsBrainwashCompleteGunValue.changed ||
    initialNpcCountValue.changed ||
    initialBrainwashedNpcPercentValue.changed;
  const defaultStartSettings: DefaultStartSettings = {
    startPlayerAsBrainwashCompleteGun:
      startPlayerAsBrainwashCompleteGunValue.value,
    initialNpcCount: initialNpcCountValue.value,
    initialBrainwashedNpcPercent: initialBrainwashedNpcPercentValue.value
  };

  const brainwashSettingsObject = readObject(source, "brainwashSettings");
  changed ||= brainwashSettingsObject.changed;
  const instantBrainwashValue = readBoolean(
    brainwashSettingsObject.value,
    "instantBrainwash",
    defaultSettings.brainwashSettings.instantBrainwash
  );
  const brainwashOnNoGunTouchValue = readBoolean(
    brainwashSettingsObject.value,
    "brainwashOnNoGunTouch",
    defaultSettings.brainwashSettings.brainwashOnNoGunTouch
  );
  const npcBrainwashCompleteGunPercentValue = readClampedInteger(
    brainwashSettingsObject.value,
    "npcBrainwashCompleteGunPercent",
    0,
    100,
    defaultSettings.brainwashSettings.npcBrainwashCompleteGunPercent
  );
  const npcBrainwashCompleteNoGunPercentValue = readClampedInteger(
    brainwashSettingsObject.value,
    "npcBrainwashCompleteNoGunPercent",
    0,
    100,
    defaultSettings.brainwashSettings.npcBrainwashCompleteNoGunPercent
  );
  changed ||=
    instantBrainwashValue.changed ||
    brainwashOnNoGunTouchValue.changed ||
    npcBrainwashCompleteGunPercentValue.changed ||
    npcBrainwashCompleteNoGunPercentValue.changed;
  const normalizedPercentPair = normalizeBrainwashPercentPair(
    npcBrainwashCompleteGunPercentValue.value,
    npcBrainwashCompleteNoGunPercentValue.value
  );
  changed ||= normalizedPercentPair.changed;
  const brainwashSettings: BrainwashSettings = {
    instantBrainwash: instantBrainwashValue.value,
    brainwashOnNoGunTouch: brainwashOnNoGunTouchValue.value,
    npcBrainwashCompleteGunPercent: normalizedPercentPair.gunPercent,
    npcBrainwashCompleteNoGunPercent: normalizedPercentPair.noGunPercent
  };

  const bitSpawnSettingsObject = readObject(source, "bitSpawnSettings");
  changed ||= bitSpawnSettingsObject.changed;
  const bitSpawnIntervalValue = readClampedInteger(
    bitSpawnSettingsObject.value,
    "bitSpawnInterval",
    1,
    99,
    defaultSettings.bitSpawnSettings.bitSpawnInterval
  );
  const maxBitCountValue = readClampedInteger(
    bitSpawnSettingsObject.value,
    "maxBitCount",
    1,
    99,
    defaultSettings.bitSpawnSettings.maxBitCount
  );
  const disableBitSpawnValue = readBoolean(
    bitSpawnSettingsObject.value,
    "disableBitSpawn",
    defaultSettings.bitSpawnSettings.disableBitSpawn
  );
  changed ||=
    bitSpawnIntervalValue.changed ||
    maxBitCountValue.changed ||
    disableBitSpawnValue.changed;
  const bitSpawnSettings: BitSpawnSettings = {
    bitSpawnInterval: bitSpawnIntervalValue.value,
    maxBitCount: maxBitCountValue.value,
    disableBitSpawn: disableBitSpawnValue.value
  };

  const executeSettingsObject = readObject(source, "executeSettings");
  changed ||= executeSettingsObject.changed;
  const executeMethodValue = readExecuteMethod(
    executeSettingsObject.value,
    "method",
    defaultSettings.executeSettings.method
  );
  const targetNpcCountValue = readClampedInteger(
    executeSettingsObject.value,
    "targetNpcCount",
    0,
    99,
    defaultSettings.executeSettings.targetNpcCount
  );
  const surroundingNpcCountValue = readClampedInteger(
    executeSettingsObject.value,
    "surroundingNpcCount",
    0,
    99,
    defaultSettings.executeSettings.surroundingNpcCount
  );
  const surroundingBitCountValue = readClampedInteger(
    executeSettingsObject.value,
    "surroundingBitCount",
    0,
    99,
    defaultSettings.executeSettings.surroundingBitCount
  );
  changed ||=
    executeMethodValue.changed ||
    targetNpcCountValue.changed ||
    surroundingNpcCountValue.changed ||
    surroundingBitCountValue.changed;
  const executeSettings = normalizeExecuteSettings({
    method: executeMethodValue.value,
    targetNpcCount: targetNpcCountValue.value,
    surroundingNpcCount: surroundingNpcCountValue.value,
    surroundingBitCount: surroundingBitCountValue.value
  });
  changed ||=
    executeSettings.method !== executeMethodValue.value ||
    executeSettings.targetNpcCount !== targetNpcCountValue.value ||
    executeSettings.surroundingNpcCount !== surroundingNpcCountValue.value ||
    executeSettings.surroundingBitCount !== surroundingBitCountValue.value;

  return {
    settings: {
      version,
      volumeLevels,
      stageId,
      alarmTrapEnabled: alarmTrapEnabledValue.value,
      playerSettings,
      defaultStartSettings,
      brainwashSettings,
      bitSpawnSettings,
      executeSettings
    },
    changed
  };
};

export const savePersistedTitleSettings = (
  storageKey: string,
  settings: PersistedTitleSettings
) => {
  localStorage.setItem(storageKey, JSON.stringify(settings));
};

export const clearPersistedTitleSettings = (storageKey: string) => {
  localStorage.removeItem(storageKey);
};

export const loadPersistedTitleSettings = (
  storageKey: string,
  version: number,
  defaults: TitleSettingsDefaults,
  stageIds: ReadonlySet<string>,
  portraitDirectories: ReadonlySet<string>,
  voiceDirectories: ReadonlySet<string>
) => {
  const stored = localStorage.getItem(storageKey);
  if (stored === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    const defaultSettings = buildDefaultPersistedTitleSettings(version, defaults);
    savePersistedTitleSettings(storageKey, defaultSettings);
    return defaultSettings;
  }
  const normalized = normalizePersistedTitleSettings(
    parsed,
    version,
    defaults,
    stageIds,
    portraitDirectories,
    voiceDirectories
  );
  if (normalized.changed) {
    savePersistedTitleSettings(storageKey, normalized.settings);
  }
  return normalized.settings;
};
