import {
  SCHOOL_PLAYER_SPAWN_IDS,
  type V2PlayerSpawnSelection
} from "./v2/schoolSpawnSelection";
import { V2_DEFAULT_PORTRAIT_DIRECTORY } from "./v2/v2CharacterAssignments";

export const V2_TITLE_SETTINGS_STORAGE_KEY =
  "haigure-survival-v2.title-settings";
export const V2_TITLE_SETTINGS_SCHEMA_VERSION = 1 as const;

export type V2TitleSettingsStorage = Pick<Storage, "getItem" | "setItem">;

export const V2_INSTANT_EXECUTION_METHOD_IDS = Object.freeze([
  "player-bit",
  "player-npc",
  "npc-bit",
  "npc-npc",
  "npc-player"
] as const);

export type V2InstantExecutionMethod =
  (typeof V2_INSTANT_EXECUTION_METHOD_IDS)[number];

export type V2InstantExecutionSettings = Readonly<{
  method: V2InstantExecutionMethod;
  targetNpcCount: number;
  surroundingNpcCount: number;
  surroundingBitCount: number;
}>;

export type V2TitleSettings = Readonly<{
  version: typeof V2_TITLE_SETTINGS_SCHEMA_VERSION;
  population: Readonly<{
    npcCount: number;
    initialBrainwashedNpcPercent: number;
    startPlayerBrainwashed: boolean;
  }>;
  bit: Readonly<{
    disabled: boolean;
    reinforcementIntervalSeconds: number;
    maximumCount: number;
  }>;
  audio: Readonly<{ bgm: number; se: number; voice: number }>;
  display: Readonly<{
    eyeHeightScale: number;
    showGroundShadows: boolean;
    enableCharacterSpriteVerticalAngle: boolean;
  }>;
  brainwash: Readonly<{
    instantBrainwash: boolean;
    brainwashOnNoGunTouch: boolean;
    gunPercent: number;
    noGunPercent: number;
    haigurePercent: number;
  }>;
  school: Readonly<{
    roomDisorderLevel: number;
    playerSpawn: V2PlayerSpawnSelection;
  }>;
  character: Readonly<{
    portraitDirectory: string | null;
    voiceDirectory: string | null;
  }>;
  features: Readonly<{
    missionEnabled: boolean;
    alarmEnabled: boolean;
  }>;
  execution: V2InstantExecutionSettings;
}>;

export type V2TitleSettingsRuntimePopulation = Readonly<{
  npcCount: number;
  initialBrainwashedNpcCount: number;
  initialBitCount: number;
  bitReinforcementIntervalSeconds: number;
  maximumBitCount: number;
}>;

export const V2_DEFAULT_TITLE_SETTINGS: V2TitleSettings = Object.freeze({
  version: V2_TITLE_SETTINGS_SCHEMA_VERSION,
  population: Object.freeze({
    npcCount: 50,
    initialBrainwashedNpcPercent: 20,
    startPlayerBrainwashed: false
  }),
  bit: Object.freeze({
    disabled: false,
    reinforcementIntervalSeconds: 10,
    maximumCount: 25
  }),
  audio: Object.freeze({ bgm: 5, se: 5, voice: 5 }),
  display: Object.freeze({
    eyeHeightScale: 1.15,
    showGroundShadows: true,
    enableCharacterSpriteVerticalAngle: true
  }),
  brainwash: Object.freeze({
    instantBrainwash: false,
    brainwashOnNoGunTouch: false,
    gunPercent: 45,
    noGunPercent: 45,
    haigurePercent: 10
  }),
  school: Object.freeze({
    roomDisorderLevel: 2,
    playerSpawn: "random"
  }),
  character: Object.freeze({
    portraitDirectory: null,
    voiceDirectory: null
  }),
  features: Object.freeze({
    missionEnabled: true,
    alarmEnabled: false
  }),
  execution: Object.freeze({
    method: "player-bit",
    targetNpcCount: 0,
    surroundingNpcCount: 11,
    surroundingBitCount: 10
  })
});

export const hasV2NeverGameOverRisk = (
  settings: V2TitleSettings
): boolean => {
  if (settings.population.startPlayerBrainwashed || !settings.bit.disabled) {
    return false;
  }
  const initialBrainwashedNpcCount = Math.floor(
    settings.population.npcCount *
      settings.population.initialBrainwashedNpcPercent /
      100
  );
  if (initialBrainwashedNpcCount <= 0) {
    return true;
  }
  const hasGunRoute = settings.brainwash.gunPercent > 0;
  const hasNoGunTouchRoute =
    settings.brainwash.noGunPercent > 0 &&
    settings.brainwash.brainwashOnNoGunTouch;
  return !(hasGunRoute || hasNoGunTouchRoute);
};

export type V2TitleSettingsCatalogs = Readonly<{
  portraitDirectories: readonly string[];
  voiceDirectories: readonly string[];
}>;

export type V2TitleSettingsNormalization = Readonly<{
  settings: V2TitleSettings;
  changed: boolean;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (
  source: Record<string, unknown>,
  key: string
): Record<string, unknown> =>
  isRecord(source[key]) ? source[key] : {};

const normalizeInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback;

const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const normalizeEyeHeightScale = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return V2_DEFAULT_TITLE_SETTINGS.display.eyeHeightScale;
  }
  const clamped = Math.max(0.5, Math.min(1.5, value));
  return Math.round(Math.round(clamped / 0.05) * 0.05 * 100) / 100;
};

const normalizeDirectory = (
  value: unknown,
  validDirectories: ReadonlySet<string>
): string | null =>
  typeof value === "string" && validDirectories.has(value) ? value : null;

const normalizeSpawnSelection = (value: unknown): V2PlayerSpawnSelection =>
  value === "random" ||
  (typeof value === "string" &&
    (SCHOOL_PLAYER_SPAWN_IDS as readonly string[]).includes(value))
    ? (value as V2PlayerSpawnSelection)
    : "random";

const normalizeExecutionMethod = (
  value: unknown
): V2InstantExecutionMethod =>
  typeof value === "string" &&
  (V2_INSTANT_EXECUTION_METHOD_IDS as readonly string[]).includes(value)
    ? (value as V2InstantExecutionMethod)
    : V2_DEFAULT_TITLE_SETTINGS.execution.method;

export const normalizeV2InstantExecutionSettings = (
  raw: unknown
): V2InstantExecutionSettings => {
  const source = isRecord(raw) ? raw : {};
  const method = normalizeExecutionMethod(source.method);
  const playerTargetMethod = method === "player-bit" || method === "player-npc";
  const targetNpcCount = normalizeInteger(
    source.targetNpcCount,
    playerTargetMethod ? 0 : 1,
    playerTargetMethod ? 5 : 6,
    playerTargetMethod ? 0 : 1
  );
  const centralTargetCount = targetNpcCount + (playerTargetMethod ? 1 : 0);
  const usesNpcShooters = method === "player-npc" || method === "npc-npc";
  const minimumSurroundingNpcCount = usesNpcShooters
    ? centralTargetCount
    : 0;
  const surroundingNpcCount = normalizeInteger(
    source.surroundingNpcCount,
    minimumSurroundingNpcCount,
    99 - targetNpcCount,
    Math.max(
      minimumSurroundingNpcCount,
      Math.min(99 - targetNpcCount, V2_DEFAULT_TITLE_SETTINGS.execution.surroundingNpcCount)
    )
  );
  const usesBitShooters = method === "player-bit" || method === "npc-bit";
  const surroundingBitCount = normalizeInteger(
    source.surroundingBitCount,
    usesBitShooters ? centralTargetCount : 0,
    50,
    usesBitShooters
      ? Math.max(
          centralTargetCount,
          V2_DEFAULT_TITLE_SETTINGS.execution.surroundingBitCount
        )
      : V2_DEFAULT_TITLE_SETTINGS.execution.surroundingBitCount
  );
  return Object.freeze({
    method,
    targetNpcCount,
    surroundingNpcCount,
    surroundingBitCount
  });
};

const buildCanonicalSettings = (
  source: Record<string, unknown>,
  catalogs: V2TitleSettingsCatalogs
): V2TitleSettings => {
  const population = readRecord(source, "population");
  const bit = readRecord(source, "bit");
  const audio = readRecord(source, "audio");
  const display = readRecord(source, "display");
  const brainwash = readRecord(source, "brainwash");
  const school = readRecord(source, "school");
  const character = readRecord(source, "character");
  const features = readRecord(source, "features");
  const execution = readRecord(source, "execution");

  const gunPercent = normalizeInteger(
    brainwash.gunPercent,
    0,
    100,
    V2_DEFAULT_TITLE_SETTINGS.brainwash.gunPercent
  );
  const requestedNoGunPercent = normalizeInteger(
    brainwash.noGunPercent,
    0,
    100,
    V2_DEFAULT_TITLE_SETTINGS.brainwash.noGunPercent
  );
  const noGunPercent = Math.min(requestedNoGunPercent, 100 - gunPercent);

  return Object.freeze({
    version: V2_TITLE_SETTINGS_SCHEMA_VERSION,
    population: Object.freeze({
      npcCount: normalizeInteger(population.npcCount, 0, 99, 50),
      initialBrainwashedNpcPercent: normalizeInteger(
        population.initialBrainwashedNpcPercent,
        0,
        100,
        20
      ),
      startPlayerBrainwashed: normalizeBoolean(
        population.startPlayerBrainwashed,
        false
      )
    }),
    bit: Object.freeze({
      disabled: normalizeBoolean(bit.disabled, false),
      reinforcementIntervalSeconds: normalizeInteger(
        bit.reinforcementIntervalSeconds,
        1,
        99,
        10
      ),
      maximumCount: normalizeInteger(bit.maximumCount, 1, 50, 25)
    }),
    audio: Object.freeze({
      bgm: normalizeInteger(audio.bgm, 0, 10, 5),
      se: normalizeInteger(audio.se, 0, 10, 5),
      voice: normalizeInteger(audio.voice, 0, 10, 5)
    }),
    display: Object.freeze({
      eyeHeightScale: normalizeEyeHeightScale(display.eyeHeightScale),
      showGroundShadows: normalizeBoolean(display.showGroundShadows, true),
      enableCharacterSpriteVerticalAngle: normalizeBoolean(
        display.enableCharacterSpriteVerticalAngle,
        true
      )
    }),
    brainwash: Object.freeze({
      instantBrainwash: normalizeBoolean(brainwash.instantBrainwash, false),
      brainwashOnNoGunTouch: normalizeBoolean(
        brainwash.brainwashOnNoGunTouch,
        false
      ),
      gunPercent,
      noGunPercent,
      haigurePercent: 100 - gunPercent - noGunPercent
    }),
    school: Object.freeze({
      roomDisorderLevel: normalizeInteger(school.roomDisorderLevel, 0, 10, 2),
      playerSpawn: normalizeSpawnSelection(school.playerSpawn)
    }),
    character: Object.freeze({
      portraitDirectory: normalizeDirectory(
        character.portraitDirectory,
        new Set([
          V2_DEFAULT_PORTRAIT_DIRECTORY,
          ...catalogs.portraitDirectories
        ])
      ),
      voiceDirectory: normalizeDirectory(
        character.voiceDirectory,
        new Set(catalogs.voiceDirectories)
      )
    }),
    features: Object.freeze({
      missionEnabled: normalizeBoolean(features.missionEnabled, true),
      alarmEnabled: normalizeBoolean(features.alarmEnabled, false)
    }),
    execution: normalizeV2InstantExecutionSettings(execution)
  });
};

export const normalizeV2TitleSettings = (
  raw: unknown,
  catalogs: V2TitleSettingsCatalogs
): V2TitleSettingsNormalization => {
  if (!isRecord(raw) || raw.version !== V2_TITLE_SETTINGS_SCHEMA_VERSION) {
    return Object.freeze({
      settings: V2_DEFAULT_TITLE_SETTINGS,
      changed: true
    });
  }
  const settings = buildCanonicalSettings(raw, catalogs);
  return Object.freeze({
    settings,
    changed: JSON.stringify(raw) !== JSON.stringify(settings)
  });
};

export const createV2TitleSettingsStore = (
  storage: V2TitleSettingsStorage,
  catalogs: V2TitleSettingsCatalogs
) => {
  let current = V2_DEFAULT_TITLE_SETTINGS;
  const persist = (settings: V2TitleSettings): void => {
    storage.setItem(V2_TITLE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  };
  const load = (): V2TitleSettings => {
    const serialized = storage.getItem(V2_TITLE_SETTINGS_STORAGE_KEY);
    if (serialized === null) {
      current = V2_DEFAULT_TITLE_SETTINGS;
      return current;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(serialized);
    } catch {
      raw = null;
    }
    const normalized = normalizeV2TitleSettings(raw, catalogs);
    current = normalized.settings;
    if (normalized.changed) {
      persist(current);
    }
    return current;
  };
  const save = (settings: V2TitleSettings): V2TitleSettings => {
    const normalized = normalizeV2TitleSettings(settings, catalogs);
    current = normalized.settings;
    persist(current);
    return current;
  };
  return Object.freeze({
    load,
    get: (): V2TitleSettings => current,
    save,
    update: (updater: (settings: V2TitleSettings) => V2TitleSettings) =>
      save(updater(current)),
    reset: (): V2TitleSettings => {
      current = V2_DEFAULT_TITLE_SETTINGS;
      persist(current);
      return current;
    },
    resetExecution: (): V2TitleSettings =>
      save({
        ...current,
        execution: V2_DEFAULT_TITLE_SETTINGS.execution
      })
  });
};

export const createBrowserV2TitleSettingsStore = (
  catalogs: V2TitleSettingsCatalogs
): V2TitleSettingsStore =>
  createV2TitleSettingsStore(window.localStorage, catalogs);

export type V2TitleSettingsStore = ReturnType<
  typeof createV2TitleSettingsStore
>;

export const createV2SurvivalPopulationFromTitleSettings = (
  settings: V2TitleSettings
): V2TitleSettingsRuntimePopulation =>
  Object.freeze({
    npcCount: settings.population.npcCount,
    initialBrainwashedNpcCount: Math.floor(
      settings.population.npcCount *
        settings.population.initialBrainwashedNpcPercent /
        100
    ),
    initialBitCount: settings.bit.disabled ? 0 : 1,
    bitReinforcementIntervalSeconds:
      settings.bit.reinforcementIntervalSeconds,
    maximumBitCount: settings.bit.disabled ? 0 : settings.bit.maximumCount
  });

export const createV2InstantExecutionPopulation = (
  settings: V2InstantExecutionSettings
): V2TitleSettingsRuntimePopulation => {
  const usesBitShooters =
    settings.method === "player-bit" || settings.method === "npc-bit";
  const bitCount = usesBitShooters ? settings.surroundingBitCount : 0;
  return Object.freeze({
    npcCount: settings.targetNpcCount + settings.surroundingNpcCount,
    initialBrainwashedNpcCount: 0,
    initialBitCount: bitCount,
    bitReinforcementIntervalSeconds:
      V2_DEFAULT_TITLE_SETTINGS.bit.reinforcementIntervalSeconds,
    maximumBitCount: bitCount
  });
};
