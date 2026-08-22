import {
  SCHOOL_PLAYER_SPAWN_IDS,
  selectV2PlayerSpawn
} from "../../../src/v2/schoolSpawnSelection";
import {
  V2_DEFAULT_TITLE_SETTINGS,
  V2_TITLE_SETTINGS_STORAGE_KEY,
  createV2SurvivalPopulationFromTitleSettings,
  createV2TitleSettingsSnapshot,
  createV2TitleSettingsStore,
  normalizeV2TitleSettings,
  type V2TitleSettingsStorage
} from "../../../src/v2TitleSettingsStore";
import { createV2TitleSettingsPanel } from "../../../src/ui/v2TitleSettingsPanel";
import type { StagePlayerSpawn } from "../../../src/world/stageSpatialContext";
import { assert, executeTest } from "../T06/testUtils";

const CATALOGS = Object.freeze({
  portraitDirectories: Object.freeze(["default", "hero"]),
  voiceDirectories: Object.freeze(["01_voice"])
});

const createStorage = (initial: Readonly<Record<string, string>> = {}) => {
  const values = new Map(Object.entries(initial));
  const reads: string[] = [];
  const writes: string[] = [];
  const storage: V2TitleSettingsStorage = {
    getItem: (key) => {
      reads.push(key);
      return values.get(key) ?? null;
    },
    setItem: (key, value) => {
      writes.push(key);
      values.set(key, value);
    }
  };
  return Object.freeze({ storage, values, reads, writes });
};

export const runTitleSettingsTests = async () => [
  await executeTest("既定値・境界値・派生人口", () => {
    assert(V2_DEFAULT_TITLE_SETTINGS.display.eyeHeightScale === 1.2, "視点高さ既定値が1.20ではありません。");
    const normalized = normalizeV2TitleSettings({
      ...V2_DEFAULT_TITLE_SETTINGS,
      population: { npcCount: 99.7, initialBrainwashedNpcPercent: 66.6, startPlayerBrainwashed: true },
      bit: { disabled: true, reinforcementIntervalSeconds: 200, maximumCount: 99 },
      display: { ...V2_DEFAULT_TITLE_SETTINGS.display, eyeHeightScale: 1.23 },
      brainwash: { ...V2_DEFAULT_TITLE_SETTINGS.brainwash, gunPercent: 80, noGunPercent: 50 },
      school: { roomDisorderLevel: -2, playerSpawn: "invalid" },
      character: { portraitDirectory: "missing", voiceDirectory: "01_voice" },
      unknown: true
    }, CATALOGS).settings;
    assert(normalized.population.npcCount === 99, "NPC上限正規化が不正です。");
    assert(normalized.population.initialBrainwashedNpcPercent === 67, "初期洗脳率の整数化が不正です。");
    assert(normalized.bit.maximumCount === 50, "BIT最大数上限が不正です。");
    assert(normalized.display.eyeHeightScale === 1.25, "視点高さ0.05刻みが不正です。");
    assert(normalized.brainwash.gunPercent + normalized.brainwash.noGunPercent + normalized.brainwash.haigurePercent === 100, "G/N/H合計が100ではありません。");
    assert(normalized.school.playerSpawn === "random", "開始地点不正IDがrandomへ正規化されません。");
    const population = createV2SurvivalPopulationFromTitleSettings(normalized);
    assert(population.initialBrainwashedNpcCount === Math.floor(99 * 67 / 100), "初期洗脳人数が切り捨てではありません。");
    assert(population.initialBitCount === 0 && population.maximumBitCount === 0, "BIT無効時人口が0ではありません。");
    return "視点高さ1.20／0.05刻み、NPC・BIT境界、G/N/H=100、人数切り捨て";
  }),
  await executeTest("version不一致・未知field・canonical保存", () => {
    const memory = createStorage({
      [V2_TITLE_SETTINGS_STORAGE_KEY]: JSON.stringify({ version: 2, population: { npcCount: 1 }, unknown: "x" })
    });
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    const loaded = store.load();
    assert(JSON.stringify(loaded) === JSON.stringify(V2_DEFAULT_TITLE_SETTINGS), "version不一致が全resetされません。");
    assert(memory.writes.length === 1, "version不一致のcanonical即時保存がありません。");
    assert(!memory.values.get(V2_TITLE_SETTINGS_STORAGE_KEY)!.includes("unknown"), "未知fieldが削除されません。");
    return "version 2→全既定値、未知field削除、即時保存";
  }),
  await executeTest("V1保存キー完全分離", () => {
    const v1Key = "haigure-survival.title-settings";
    const sentinel = "V1_SENTINEL";
    const memory = createStorage({ [v1Key]: sentinel });
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    store.save({ ...store.get(), population: { ...store.get().population, npcCount: 12 } });
    store.reset();
    assert(!memory.reads.includes(v1Key), "V1キーを読みました。");
    assert(!memory.writes.includes(v1Key), "V1キーを書きました。");
    assert(memory.values.get(v1Key) === sentinel, "V1 sentinelが変更されました。");
    return "load/save/resetでV1キーread/write/delete 0件";
  }),
  await executeTest("再起動・変更ごとの保存・全reset", () => {
    const memory = createStorage();
    const first = createV2TitleSettingsStore(memory.storage, CATALOGS);
    first.load();
    first.save({ ...first.get(), school: { ...first.get().school, roomDisorderLevel: 10 } });
    const restarted = createV2TitleSettingsStore(memory.storage, CATALOGS);
    assert(restarted.load().school.roomDisorderLevel === 10, "再起動で保存値が復元されません。");
    restarted.reset();
    assert(restarted.get().school.roomDisorderLevel === 2, "全resetで既定値に戻りません。");
    assert(memory.writes.length === 2, "変更とresetが各1回保存されていません。");
    return "変更1回・reset1回を保存し、再起動復元";
  }),
  await executeTest("snapshot深い不変性・開始後非反映", () => {
    const memory = createStorage();
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    const snapshot = store.createSnapshot();
    store.save({ ...store.get(), population: { ...store.get().population, npcCount: 1 } });
    assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.population) && Object.isFrozen(snapshot.runtimePopulation), "snapshotがdeep freezeされていません。");
    assert(snapshot.population.npcCount === 50 && snapshot.runtimePopulation.npcCount === 50, "開始後変更がsnapshotへ反映されました。");
    return "root／nested／runtimePopulation frozen、開始後変更非反映";
  }),
  await executeTest("承認済み11開始地点とrandom", () => {
    const spawns = SCHOOL_PLAYER_SPAWN_IDS.map((id) => Object.freeze({ id }) as StagePlayerSpawn);
    for (const id of SCHOOL_PLAYER_SPAWN_IDS) {
      assert(selectV2PlayerSpawn(spawns, id, () => { throw new Error("正式ID選択で乱数を消費しました。"); }).id === id, `${id}を選択できません。`);
    }
    assert(selectV2PlayerSpawn(spawns, "random", () => 0).id === SCHOOL_PLAYER_SPAWN_IDS[0], "random選択が不正です。");
    return "正式11 ID＋randomを選択";
  }),
  await executeTest("タイトルUI・変更保存・reset・Pointer Lock非取得", () => {
    const host = document.querySelector<HTMLElement>("#settings-host");
    assert(host !== null, "設定UI hostがありません。");
    const memory = createStorage();
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    const changes = { count: 0 };
    const getChangeCount = () => changes.count;
    const panel = createV2TitleSettingsPanel({
      parent: host,
      store,
      portraitDirectories: CATALOGS.portraitDirectories,
      voiceDirectories: CATALOGS.voiceDirectories,
      onSettingsChange: () => { changes.count += 1; }
    });
    const npcInput = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-npc-count"]')!;
    npcInput.value = "23";
    npcInput.dispatchEvent(new Event("change", { bubbles: true }));
    assert(store.get().population.npcCount === 23 && getChangeCount() === 1, "UI変更が1回保存されません。");
    panel.root.querySelector<HTMLButtonElement>('[data-ui="v2-settings-reset-all"]')!.click();
    assert(store.get().population.npcCount === 50 && getChangeCount() === 2, "UI全resetが保存されません。");
    assert(document.pointerLockElement === null, "設定操作中にPointer Lockを取得しました。");
    assert(panel.root.querySelectorAll("section").length === 7, "semantic sectionが7個ではありません。");
    assert(panel.root.querySelector<HTMLElement>('[data-ui="v2-settings-fixed-stage"]')!.textContent === "学校", "固定学校表示がありません。");
    panel.dispose();
    return "7 section、固定学校、変更保存、全reset、Pointer Lockなし";
  })
];
