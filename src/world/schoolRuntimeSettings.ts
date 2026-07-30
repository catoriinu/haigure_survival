import type { HumanNavRoomVariantSelection } from "./humanNavTileBundle";

export const SCHOOL_ROOM_DISORDER_LEVEL_MIN = 0;
export const SCHOOL_ROOM_DISORDER_LEVEL_MAX = 10;
export const SCHOOL_ROOM_DISORDER_LEVEL_DEFAULT = 2;

export const SCHOOL_ROOM_VARIANT_ROOM_IDS = Object.freeze([
  "f02-classroom-01",
  "f02-classroom-02",
  "f02-classroom-03",
  "f03-classroom-01",
  "f03-classroom-02",
  "f03-classroom-03",
  "f04-classroom-01",
  "f04-classroom-02",
  "f04-classroom-03",
  "f01-infirmary",
  "f01-library",
  "f01-staff-room",
  "f01-pc-room",
  "f02-council",
  "f02-broadcast",
  "f02-science",
  "f03-art",
  "f03-home-ec",
  "f04-ll",
  "f04-music"
] as const);

export const SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS = Object.freeze(
  SCHOOL_ROOM_VARIANT_ROOM_IDS.map((roomId) =>
    Object.freeze({
      roomId,
      variant: "normal" as const
    })
  )
);

export const SCHOOL_ALL_DISORDERED_ROOM_VARIANT_SELECTIONS = Object.freeze(
  SCHOOL_ROOM_VARIANT_ROOM_IDS.map((roomId) =>
    Object.freeze({
      roomId,
      variant: "disordered" as const
    })
  )
);

export const SCHOOL_RUNTIME_RANDOM_SERIES = [
  "core",
  "disorder",
  "door-initial",
  "door-behavior",
  "follower-fire"
] as const;

export type SchoolRuntimeRandomSeries =
  (typeof SCHOOL_RUNTIME_RANDOM_SERIES)[number];

export type SchoolRuntimeSettings = Readonly<{
  roomDisorderLevel: number;
}>;

export type SchoolRuntimeRandom = () => number;

export const DEFAULT_SCHOOL_RUNTIME_SETTINGS: SchoolRuntimeSettings =
  Object.freeze({
    roomDisorderLevel: SCHOOL_ROOM_DISORDER_LEVEL_DEFAULT
  });

const assertRoomDisorderLevel = (roomDisorderLevel: number) => {
  if (
    !Number.isInteger(roomDisorderLevel) ||
    roomDisorderLevel < SCHOOL_ROOM_DISORDER_LEVEL_MIN ||
    roomDisorderLevel > SCHOOL_ROOM_DISORDER_LEVEL_MAX
  ) {
    throw new Error("roomDisorderLevelには0以上10以下の整数が必要です。");
  }
};

const assertSeed = (seed: number) => {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error("学校Runtimeのseedには0以上の安全な整数が必要です。");
  }
};

const assertRoomIds = (roomIds: readonly string[]) => {
  const uniqueRoomIds = new Set<string>();
  roomIds.forEach((roomId, index) => {
    if (roomId.length === 0 || roomId.trim() !== roomId) {
      throw new Error(`部屋ID ${index} が不正です。`);
    }
    if (uniqueRoomIds.has(roomId)) {
      throw new Error(`部屋IDが重複しています: ${roomId}`);
    }
    uniqueRoomIds.add(roomId);
  });
};

const hashSeriesSeed = (
  seed: number,
  series: SchoolRuntimeRandomSeries
) => {
  let hash = 0x811c9dc5;
  const source = `${seed}:${series}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const createSchoolRuntimeSettings = (
  roomDisorderLevel = SCHOOL_ROOM_DISORDER_LEVEL_DEFAULT
): SchoolRuntimeSettings => {
  assertRoomDisorderLevel(roomDisorderLevel);
  return Object.freeze({ roomDisorderLevel });
};

export const createSchoolRuntimeRandom = (
  seed: number,
  series: SchoolRuntimeRandomSeries
): SchoolRuntimeRandom => {
  assertSeed(seed);
  if (!SCHOOL_RUNTIME_RANDOM_SERIES.includes(series)) {
    throw new Error(`未登録の学校Runtime乱数系列です: ${series}`);
  }

  let state = hashSeriesSeed(seed, series);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const calculateDisorderedRoomCount = (
  roomCount: number,
  settings: SchoolRuntimeSettings
) => {
  if (!Number.isInteger(roomCount) || roomCount < 0) {
    throw new Error("部屋数には0以上の整数が必要です。");
  }
  assertRoomDisorderLevel(settings.roomDisorderLevel);
  return Math.round(
    (roomCount * settings.roomDisorderLevel) /
      SCHOOL_ROOM_DISORDER_LEVEL_MAX
  );
};

export const selectDisorderedRoomIds = (
  roomIds: readonly string[],
  settings: SchoolRuntimeSettings,
  seed: number
): readonly string[] => {
  assertRoomIds(roomIds);
  const selectedRoomCount = calculateDisorderedRoomCount(
    roomIds.length,
    settings
  );
  const nextRandom = createSchoolRuntimeRandom(seed, "disorder");
  const shuffledIndices = roomIds.map((_roomId, index) => index);

  for (let index = shuffledIndices.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    const current = shuffledIndices[index];
    shuffledIndices[index] = shuffledIndices[swapIndex];
    shuffledIndices[swapIndex] = current;
  }

  const selectedIndices = new Set(
    shuffledIndices.slice(0, selectedRoomCount)
  );
  return Object.freeze(
    roomIds.filter((_roomId, index) => selectedIndices.has(index))
  );
};

export const createSchoolRoomVariantSelections = (
  settings: SchoolRuntimeSettings,
  seed: number
): readonly HumanNavRoomVariantSelection[] => {
  const disorderedRoomIds = new Set(
    selectDisorderedRoomIds(
      SCHOOL_ROOM_VARIANT_ROOM_IDS,
      settings,
      seed
    )
  );
  return Object.freeze(
    SCHOOL_ROOM_VARIANT_ROOM_IDS.map((roomId) =>
      Object.freeze({
        roomId,
        variant: disorderedRoomIds.has(roomId)
          ? ("disordered" as const)
          : ("normal" as const)
      })
    )
  );
};
