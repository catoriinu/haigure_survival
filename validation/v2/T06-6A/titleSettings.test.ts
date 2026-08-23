import {
  SCHOOL_PLAYER_SPAWN_IDS,
  selectV2PlayerSpawn
} from "../../../src/v2/schoolSpawnSelection";
import {
  V2_DEFAULT_TITLE_SETTINGS,
  V2_TITLE_SETTINGS_STORAGE_KEY,
  createV2SurvivalPopulationFromTitleSettings,
  createV2TitleSettingsStore,
  hasV2NeverGameOverRisk,
  normalizeV2TitleSettings,
  type V2TitleSettingsStorage
} from "../../../src/v2TitleSettingsStore";
import { createV2TitleSettingsPanel } from "../../../src/ui/v2TitleSettingsPanel";
import { V2_DEFAULT_PORTRAIT_DIRECTORY } from "../../../src/v2/v2CharacterAssignments";
import {
  createV2SessionStartSnapshot,
  doV2SessionStartSnapshotsMatch
} from "../../../src/v2/titleSettingsSession";
import type { V2HumanTargetSnapshot } from "../../../src/v2/combatTypes";
import { selectV2PlayerNoGunTouchTargetIds } from "../../../src/v2/survivalRuntime";
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
    assert(V2_DEFAULT_TITLE_SETTINGS.display.eyeHeightScale === 1.15, "視点高さ既定値が1.15ではありません。");
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
    return "視点高さ1.15／0.05刻み、NPC・BIT境界、G/N/H=100、人数切り捨て";
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
  await executeTest("組込みデフォルトスプライトの保存・再起動", () => {
    const catalogsWithoutBuiltInPortrait = Object.freeze({
      portraitDirectories: Object.freeze(["01_hgsv_mb"]),
      voiceDirectories: CATALOGS.voiceDirectories
    });
    const memory = createStorage();
    const store = createV2TitleSettingsStore(
      memory.storage,
      catalogsWithoutBuiltInPortrait
    );
    store.load();
    store.save({
      ...store.get(),
      character: {
        ...store.get().character,
        portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
      }
    });
    assert(
      store.get().character.portraitDirectory ===
        V2_DEFAULT_PORTRAIT_DIRECTORY,
      "組込みデフォルトスプライトが保存時にnullへ正規化されました。"
    );
    const restarted = createV2TitleSettingsStore(
      memory.storage,
      catalogsWithoutBuiltInPortrait
    );
    assert(
      restarted.load().character.portraitDirectory ===
        V2_DEFAULT_PORTRAIT_DIRECTORY,
      "組込みデフォルトスプライトを再起動後に復元できません。"
    );
    return "カタログ外の00_defaultをcanonical保存して再起動復元";
  }),
  await executeTest("snapshot深い不変性・開始後非反映", () => {
    const memory = createStorage();
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    const snapshot = createV2SessionStartSnapshot({
      startMode: "normal",
      settings: store.get(),
      venueRandom: () => 0
    });
    store.save({ ...store.get(), population: { ...store.get().population, npcCount: 1 } });
    assert(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.settings.population) && Object.isFrozen(snapshot.runtimePopulation), "snapshotがdeep freezeされていません。");
    assert(snapshot.settings.population.npcCount === 50 && snapshot.runtimePopulation.npcCount === 50, "開始後変更がsnapshotへ反映されました。");
    return "root／nested／runtimePopulation frozen、開始後変更非反映";
  }),
  await executeTest("開始時snapshot差分判定", () => {
    const build = (npcCount: number) => createV2SessionStartSnapshot({
      startMode: "normal",
      settings: {
        ...V2_DEFAULT_TITLE_SETTINGS,
        population: { ...V2_DEFAULT_TITLE_SETTINGS.population, npcCount }
      },
      venueRandom: () => 0
    });
    const active = build(50);
    const same = build(50);
    const changed = build(23);
    assert(
      doV2SessionStartSnapshotsMatch(active, same),
      "同一設定を差分ありと判定しました。"
    );
    assert(
      !doV2SessionStartSnapshotsMatch(active, changed),
      "変更設定を差分なしと判定しました。"
    );
    return "同一snapshotは再構築不要、変更snapshotだけ開始時再構築";
  }),
  await executeTest("承認済み11開始地点とrandom", () => {
    const spawns = SCHOOL_PLAYER_SPAWN_IDS.map((id) => Object.freeze({ id }) as StagePlayerSpawn);
    for (const id of SCHOOL_PLAYER_SPAWN_IDS) {
      assert(selectV2PlayerSpawn(spawns, id, () => { throw new Error("正式ID選択で乱数を消費しました。"); }).id === id, `${id}を選択できません。`);
    }
    assert(selectV2PlayerSpawn(spawns, "random", () => 0).id === SCHOOL_PLAYER_SPAWN_IDS[0], "random選択が不正です。");
    return "正式11 ID＋randomを選択";
  }),
  await executeTest("V1相当のゲームオーバー不能警告条件", () => {
    const riskSettings = {
      ...V2_DEFAULT_TITLE_SETTINGS,
      population: {
        npcCount: 50,
        initialBrainwashedNpcPercent: 0,
        startPlayerBrainwashed: false
      },
      bit: { ...V2_DEFAULT_TITLE_SETTINGS.bit, disabled: true }
    };
    assert(hasV2NeverGameOverRisk(riskSettings), "洗脳手段0件で警告されません。");
    assert(
      !hasV2NeverGameOverRisk({
        ...riskSettings,
        population: { ...riskSettings.population, startPlayerBrainwashed: true }
      }),
      "初期洗脳済みプレイヤーでも警告されます。"
    );
    assert(
      !hasV2NeverGameOverRisk({
        ...riskSettings,
        bit: { ...riskSettings.bit, disabled: false }
      }),
      "BIT有効でも警告されます。"
    );
    const withInitialNpc = {
      ...riskSettings,
      population: {
        ...riskSettings.population,
        initialBrainwashedNpcPercent: 20
      }
    };
    assert(
      !hasV2NeverGameOverRisk(withInitialNpc),
      "初期洗脳済みNPCの銃あり経路を認識しません。"
    );
    const noGunOnly = {
      ...withInitialNpc,
      brainwash: {
        ...withInitialNpc.brainwash,
        gunPercent: 0,
        noGunPercent: 100,
        haigurePercent: 0,
        brainwashOnNoGunTouch: false
      }
    };
    assert(
      hasV2NeverGameOverRisk(noGunOnly),
      "銃なしのみ＋接触OFFで警告されません。"
    );
    assert(
      !hasV2NeverGameOverRisk({
        ...noGunOnly,
        brainwash: { ...noGunOnly.brainwash, brainwashOnNoGunTouch: true }
      }),
      "銃なしのみ＋接触ONでも警告されます。"
    );
    return "V1のPlayer／BIT／初期NPC／銃あり／銃なし接触条件を固定学校へ適用";
  }),
  await executeTest("銃なしプレイヤーから未洗脳NPCへの接触選択", () => {
    const createNpc = (
      id: string,
      position: Vector3,
      alive: boolean,
      brainwashed = !alive
    ): V2HumanTargetSnapshot => Object.freeze({
      id,
      kind: "npc" as const,
      footPosition: position,
      aimPosition: position.add(new Vector3(0, 0.85, 0)),
      hitShape: Object.freeze({
        center: position.add(new Vector3(0, 0.85, 0)),
        radii: new Vector3(0.2, 0.85, 0.2)
      }),
      state: alive ? "normal" as const : "brainwash-in-progress" as const,
      alive,
      brainwashed
    });
    const playerPosition = Vector3.Zero();
    const targets = Object.freeze([
      createNpc("near", new Vector3(0.26, 0, 0), true),
      createNpc("far", new Vector3(0.28, 0, 0), true),
      createNpc("brainwashed-alive", new Vector3(0.1, 0, 0), true, true),
      createNpc("not-alive", new Vector3(0.1, 0, 0), false)
    ]);
    assert(
      JSON.stringify(selectV2PlayerNoGunTouchTargetIds(
        true,
        "brainwash-complete-no-gun",
        playerPosition,
        targets
      )) === JSON.stringify(["near"]),
      "接触半径内の未洗脳NPCだけを選択できません。"
    );
    assert(
      selectV2PlayerNoGunTouchTargetIds(
        false,
        "brainwash-complete-no-gun",
        playerPosition,
        targets
      ).length === 0 &&
      selectV2PlayerNoGunTouchTargetIds(
        true,
        "brainwash-complete-gun",
        playerPosition,
        targets
      ).length === 0,
      "設定OFFまたは銃ありプレイヤーで接触洗脳対象が出ました。"
    );
    return "接触ON＋銃なしPlayer＋半径0.27m内のalive未洗脳NPCだけを選択";
  }),
  await executeTest("タイトルUI・変更保存・reset・Pointer Lock非取得", () => {
    const host = document.querySelector<HTMLElement>("#settings-host");
    assert(host !== null, "設定UI hostがありません。");
    const memory = createStorage();
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    const writesBeforeUi = memory.writes.length;
    let confirmNoGunTouch = false;
    let noGunTouchReloadCount = 0;
    const panel = createV2TitleSettingsPanel({
      parent: host,
      store,
      portraitDirectories: CATALOGS.portraitDirectories,
      voiceDirectories: CATALOGS.voiceDirectories,
      confirmEnableNoGunTouch: () => confirmNoGunTouch,
      onNoGunTouchEnabled: () => {
        noGunTouchReloadCount += 1;
      },
      startMode: "normal",
      onStartModeChanged: () => {}
    });
    const npcInput = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-npc-count"]')!;
    npcInput.value = "23";
    npcInput.dispatchEvent(new Event("change", { bubbles: true }));
    assert(
      store.get().population.npcCount === 23 &&
        memory.writes.length === writesBeforeUi + 1,
      "UI変更が1回保存されません。"
    );
    const bitDisabled = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-bit-disabled"]')!;
    bitDisabled.checked = true;
    bitDisabled.dispatchEvent(new Event("change", { bubbles: true }));
    const bitInterval = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-bit-interval"]')!;
    const bitMaximum = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-bit-maximum"]')!;
    assert(
      bitInterval.disabled &&
        bitMaximum.disabled &&
        bitInterval.closest("label")?.classList.contains("v2-title-settings__row--disabled") === true &&
        bitMaximum.closest("label")?.classList.contains("v2-title-settings__row--disabled") === true,
      "BIT依存の無効行がdisabled＋灰色表示状態になりません。"
    );
    const initialBrainwashed = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-brainwashed-percent"]')!;
    initialBrainwashed.value = "0";
    initialBrainwashed.dispatchEvent(new Event("input", { bubbles: true }));
    const warning = panel.root.querySelector<HTMLElement>('[data-ui="v2-settings-gameover-warning"]')!;
    assert(!warning.hidden, "洗脳手段がない設定でV1相当警告が表示されません。");
    const noGunRatio = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-ratio-n"]')!;
    noGunRatio.value = "80";
    noGunRatio.dispatchEvent(new Event("input", { bubbles: true }));
    assert(
      store.get().brainwash.gunPercent === 20 &&
        store.get().brainwash.noGunPercent === 80 &&
        store.get().brainwash.haigurePercent === 0,
      "銃なしslider変更時に銃ありを調整できません。"
    );
    panel.root
      .querySelector<HTMLButtonElement>(
        '[data-audio-channel="voice"][data-audio-action="increment"]'
      )!
      .click();
    assert(store.get().audio.voice === 6, "VOICEの＋操作が保存されません。");
    panel.root
      .querySelector<HTMLButtonElement>(
        '[data-audio-channel="voice"][data-audio-action="mute"]'
      )!
      .click();
    assert(
      store.get().audio.voice === 0 &&
        panel.root.querySelector<HTMLOutputElement>(
          '[data-ui="v2-settings-audio-voice"]'
        )!.value === "MUTE",
      "VOICEのMUTE操作が保存・表示されません。"
    );
    panel.root.querySelector<HTMLButtonElement>('[data-ui="v2-settings-reset-all"]')!.click();
    assert(store.get().population.npcCount === 50, "UI全resetが保存されません。");
    assert(document.pointerLockElement === null, "設定操作中にPointer Lockを取得しました。");
    assert(panel.root.querySelectorAll("section").length === 9, "T06-6B追加後のsemantic sectionが9個ではありません。");
    assert(panel.root.querySelector<HTMLElement>('[data-ui="v2-settings-fixed-stage"]')!.textContent === "学校", "固定学校表示がありません。");
    assert(panel.root.querySelector<HTMLElement>(".v2-title-settings__stage-host") !== null, "学校設定が左上hostへ分離されていません。");
    assert(panel.root.querySelector<HTMLElement>(".v2-title-settings__stage-host h2")?.textContent === "ステージ", "左上設定名がステージではありません。");
    assert(panel.root.querySelector<HTMLElement>(".v2-title-settings__audio-host") !== null, "音量設定が左下hostへ分離されていません。");
    for (const uiId of [
      "v2-settings-brainwashed-percent",
      "v2-settings-eye-height",
      "v2-settings-disorder",
      "v2-settings-ratio-g",
      "v2-settings-ratio-n"
    ]) {
      assert(panel.root.querySelector<HTMLInputElement>(`[data-ui="${uiId}"]`)?.type === "range", `${uiId}がsliderではありません。`);
    }
    const brainwashText = panel.root.querySelector<HTMLElement>('[data-ui="v2-settings-brainwash"]')!.textContent ?? "";
    assert(brainwashText.includes("ポーズ") && brainwashText.includes("銃あり") && brainwashText.includes("銃なし") && !brainwashText.includes("G比率"), "V1相当の洗脳完了表示名ではありません。");
    assert(panel.root.querySelectorAll<HTMLButtonElement>('[data-audio-channel]').length === 9, "V1相当の音量操作ボタンがありません。");
    const modeButton = panel.root.querySelector<HTMLButtonElement>('[data-ui="title-instant-execution-toggle-button"]')!;
    assert(!modeButton.disabled && modeButton.textContent === "いきなり公開処刑モードに変更", "実動作する公開処刑modeボタンがありません。");
    const noGunTouch = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-no-gun-touch"]')!;
    noGunTouch.checked = true;
    noGunTouch.dispatchEvent(new Event("change", { bubbles: true }));
    assert(!noGunTouch.checked && !store.get().brainwash.brainwashOnNoGunTouch, "確認取消後も銃なし接触洗脳がONです。");
    assert(noGunTouchReloadCount === 0, "確認取消時に再読み込みを要求しました。");
    confirmNoGunTouch = true;
    noGunTouch.checked = true;
    noGunTouch.dispatchEvent(new Event("change", { bubbles: true }));
    assert(noGunTouch.checked && store.get().brainwash.brainwashOnNoGunTouch, "確認後に銃なし接触洗脳が保存されません。");
    assert(Number(noGunTouchReloadCount) === 1, "確認後の画像合成用再読み込み要求が1回ではありません。");
    panel.dispose();
    return "V1操作部品、独立配置、銃なし接触確認、実動作modeボタン、変更保存、Pointer Lockなし";
  })
];
import { Vector3 } from "@babylonjs/core";
