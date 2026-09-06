import type { StagePlayerSpawn } from "../world/stageSpatialContext";

export const SCHOOL_PLAYER_SPAWN_IDS = Object.freeze([
  "player-spawn-main",
  "player-spawn-gym-center",
  "player-spawn-gym-stage",
  "player-spawn-f02-classroom-02",
  "player-spawn-f03-classroom-02",
  "player-spawn-f04-classroom-02",
  "player-spawn-f02-toilet-wash-side",
  "player-spawn-f02-council-south",
  "player-spawn-f03-art-south",
  "player-spawn-f04-music-south",
  "player-spawn-roof-pool-west-stairs"
] as const);

export type SchoolPlayerSpawnId = (typeof SCHOOL_PLAYER_SPAWN_IDS)[number];
export type V2PlayerSpawnSelection = "random" | SchoolPlayerSpawnId;

export const SCHOOL_PLAYER_SPAWN_OPTIONS = Object.freeze([
  Object.freeze({ id: "player-spawn-main", label: "1階玄関" }),
  Object.freeze({ id: "player-spawn-gym-center", label: "体育館中央" }),
  Object.freeze({ id: "player-spawn-gym-stage", label: "体育館舞台上" }),
  Object.freeze({ id: "player-spawn-f02-classroom-02", label: "2階普通教室" }),
  Object.freeze({ id: "player-spawn-f03-classroom-02", label: "3階普通教室" }),
  Object.freeze({ id: "player-spawn-f04-classroom-02", label: "4階普通教室" }),
  Object.freeze({ id: "player-spawn-f02-toilet-wash-side", label: "2階トイレ" }),
  Object.freeze({ id: "player-spawn-f02-council-south", label: "2階生徒会室" }),
  Object.freeze({ id: "player-spawn-f03-art-south", label: "3階美術室" }),
  Object.freeze({ id: "player-spawn-f04-music-south", label: "4階音楽室" }),
  Object.freeze({ id: "player-spawn-roof-pool-west-stairs", label: "屋上プール西側階段付近" })
] as const satisfies readonly Readonly<{
  id: SchoolPlayerSpawnId;
  label: string;
}>[]);

const requireRandom = (random: () => number) => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `Player開始地点用randomは0以上1未満が必要です: ${value}`
    );
  }
  return value;
};

export const selectV2PlayerSpawn = (
  playerSpawns: readonly StagePlayerSpawn[],
  selection: V2PlayerSpawnSelection,
  random: () => number
): StagePlayerSpawn => {
  if (playerSpawns.length === 0) {
    throw new Error("Player開始地点候補がありません。");
  }
  if (typeof random !== "function") {
    throw new Error("Player開始地点用randomには関数が必要です。");
  }
  const byId = new Map<string, StagePlayerSpawn>();
  for (const playerSpawn of playerSpawns) {
    if (byId.has(playerSpawn.id)) {
      throw new Error(
        `Player開始地点IDが重複しています: ${playerSpawn.id}`
      );
    }
    byId.set(playerSpawn.id, playerSpawn);
  }
  const expectedIds = new Set<string>(SCHOOL_PLAYER_SPAWN_IDS);
  const unexpectedIds = [...byId.keys()].filter((id) => !expectedIds.has(id));
  if (unexpectedIds.length > 0) {
    throw new Error(
      `未承認のPlayer開始地点があります: ${unexpectedIds.join(", ")}`
    );
  }
  const ordered = SCHOOL_PLAYER_SPAWN_IDS.map((id) => {
    const playerSpawn = byId.get(id);
    if (!playerSpawn) {
      throw new Error(`承認済みPlayer開始地点がありません: ${id}`);
    }
    return playerSpawn;
  });
  if (selection !== "random") {
    return byId.get(selection)!;
  }
  return ordered[Math.floor(requireRandom(random) * ordered.length)];
};
