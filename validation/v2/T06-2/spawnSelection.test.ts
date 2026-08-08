import {
  SCHOOL_PLAYER_SPAWN_IDS,
  selectV2PlayerSpawn
} from "../../../src/v2/schoolSpawnSelection";
import {
  createSchoolRuntimeRandom
} from "../../../src/world/schoolRuntimeSettings";
import type { StagePlayerSpawn } from "../../../src/world/stageSpatialContext";
import {
  assert,
  captureThrownMessage,
  executeTest
} from "./testUtils";

const createPlayerSpawnStub = (id: string): StagePlayerSpawn =>
  Object.freeze({ id }) as StagePlayerSpawn;

const createApprovedSpawns = () =>
  Object.freeze(
    SCHOOL_PLAYER_SPAWN_IDS.map((id) => createPlayerSpawnStub(id))
  );

const testCanonicalUniformSelection = () => {
  const reversed = Object.freeze([...createApprovedSpawns()].reverse());
  let randomCallCount = 0;
  const selectedIds = SCHOOL_PLAYER_SPAWN_IDS.map((_id, index) =>
    selectV2PlayerSpawn(reversed, () => {
      randomCallCount += 1;
      return (index + 0.5) / SCHOOL_PLAYER_SPAWN_IDS.length;
    }).id
  );

  assert(
    selectedIds.join("|") === SCHOOL_PLAYER_SPAWN_IDS.join("|"),
    `一様抽選の区間対応が固定11 ID順ではありません: ${selectedIds.join(",")}`
  );
  assert(
    randomCallCount === SCHOOL_PLAYER_SPAWN_IDS.length,
    `開始地点抽選は1候補につき乱数を1回だけ消費してください: ${randomCallCount}`
  );
  return `ids=${selectedIds.length} / randomCalls=${randomCallCount}`;
};

const testIndependentRandomSeries = () => {
  const seed = 0x0620_2006;
  const playerSeriesA = createSchoolRuntimeRandom(seed, "player-spawn");
  const playerSeriesB = createSchoolRuntimeRandom(seed, "player-spawn");
  const characterSeries = createSchoolRuntimeRandom(
    seed,
    "character-assignment"
  );
  const coreSeries = createSchoolRuntimeRandom(seed, "core");
  const npcSeries = createSchoolRuntimeRandom(seed, "npc-spawn");
  const bitSeries = createSchoolRuntimeRandom(seed, "bit-spawn");

  for (let index = 0; index < 128; index += 1) {
    coreSeries();
    characterSeries();
    npcSeries();
    bitSeries();
  }

  const spawns = createApprovedSpawns();
  const selectedA = selectV2PlayerSpawn(spawns, playerSeriesA).id;
  const selectedB = selectV2PlayerSpawn(spawns, playerSeriesB).id;
  assert(
    selectedA === selectedB,
    `他系列の消費で開始地点系列が変化しました: ${selectedA}/${selectedB}`
  );

  const playerProbe = createSchoolRuntimeRandom(seed, "player-spawn");
  const playerSequence = Array.from({ length: 8 }, () => playerProbe());
  const independentFirstValues = [
    createSchoolRuntimeRandom(seed, "core")(),
    createSchoolRuntimeRandom(seed, "character-assignment")(),
    createSchoolRuntimeRandom(seed, "npc-spawn")(),
    createSchoolRuntimeRandom(seed, "bit-spawn")()
  ];
  assert(
    independentFirstValues.every((value) => value !== playerSequence[0]),
    "開始地点系列がCharacter/core/NPC/BIT系列と同一の初期値です。"
  );
  return `seed=${seed} / selected=${selectedA}`;
};

const testStrictApprovedSet = () => {
  const approved = createApprovedSpawns();
  const missingMessage = captureThrownMessage(() =>
    selectV2PlayerSpawn(approved.slice(1), () => 0)
  );
  const extraMessage = captureThrownMessage(() =>
    selectV2PlayerSpawn(
      Object.freeze([
        ...approved,
        createPlayerSpawnStub("player-spawn-unapproved")
      ]),
      () => 0
    )
  );
  const duplicateMessage = captureThrownMessage(() =>
    selectV2PlayerSpawn(
      Object.freeze([...approved, approved[0]]),
      () => 0
    )
  );
  const invalidRandomMessage = captureThrownMessage(() =>
    selectV2PlayerSpawn(approved, () => 1)
  );

  assert(
    missingMessage?.includes("承認済みPlayer開始地点がありません") === true,
    `欠落をfail-fastできませんでした: ${missingMessage ?? "例外なし"}`
  );
  assert(
    extraMessage?.includes("未承認のPlayer開始地点があります") === true,
    `余剰をfail-fastできませんでした: ${extraMessage ?? "例外なし"}`
  );
  assert(
    duplicateMessage?.includes("Player開始地点IDが重複しています") === true,
    `重複をfail-fastできませんでした: ${duplicateMessage ?? "例外なし"}`
  );
  assert(
    invalidRandomMessage?.includes("0以上1未満") === true,
    `乱数範囲をfail-fastできませんでした: ${invalidRandomMessage ?? "例外なし"}`
  );
  return "missing/extra/duplicate/randomをすべて厳格拒否";
};

export const runSpawnSelectionTests = async () =>
  Object.freeze([
    await executeTest("固定11 IDの一様・入力順非依存抽選", testCanonicalUniformSelection),
    await executeTest("session seed内の開始地点専用独立乱数列", testIndependentRandomSeries),
    await executeTest("開始地点の欠落・余剰・重複fail-fast", testStrictApprovedSet)
  ]);
