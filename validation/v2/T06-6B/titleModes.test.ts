import { Vector3 } from "@babylonjs/core";

import { createV2TitleSettingsPanel } from "../../../src/ui/v2TitleSettingsPanel";
import {
  V2_DEFAULT_TITLE_SETTINGS,
  V2_INSTANT_EXECUTION_METHOD_IDS,
  V2_TITLE_SETTINGS_STORAGE_KEY,
  createV2InstantExecutionPopulation,
  createV2TitleSettingsStore,
  normalizeV2TitleSettings,
  type V2InstantExecutionMethod,
  type V2TitleSettingsStorage
} from "../../../src/v2TitleSettingsStore";
import {
  createV2SessionStartSnapshot,
  doV2SessionStartSnapshotsMatch
} from "../../../src/v2/titleSettingsSession";
import { createV2BroadcastRuntime } from "../../../src/v2/broadcastRuntime";
import { resolveV2SurvivalFeatureResources } from "../../../src/v2/survivalRuntime";
import type { V2MissionNpcSnapshot } from "../../../src/v2/missionRuntime";
import type { V2NpcLocationMissionAssignment } from "../../../src/v2/npcSystem";
import type { StageLocationAssetRegistry } from "../../../src/world/stageLocationAssets";
import { assert, executeTest } from "../T06/testUtils";

const CATALOGS = Object.freeze({
  portraitDirectories: Object.freeze(["default"]),
  voiceDirectories: Object.freeze(["voice"])
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
  return Object.freeze({ values, reads, writes, storage });
};

const settingsForMethod = (
  method: V2InstantExecutionMethod,
  targetNpcCount: number,
  surroundingNpcCount: number,
  surroundingBitCount: number
) => normalizeV2TitleSettings({
  ...V2_DEFAULT_TITLE_SETTINGS,
  execution: {
    method,
    targetNpcCount,
    surroundingNpcCount,
    surroundingBitCount
  }
}, CATALOGS).settings;

const createNpc = (
  id: string,
  state: V2MissionNpcSnapshot["state"],
  x: number
): V2MissionNpcSnapshot => Object.freeze({
  id,
  state,
  footPosition: new Vector3(x, 0, 0),
  commandMode: "none",
  targetId: null,
  locationMission: null
});

export const runTitleModeTests = async () => [
  await executeTest("schema正規化・未知field除去・既定値", () => {
    const normalized = normalizeV2TitleSettings({
      ...V2_DEFAULT_TITLE_SETTINGS,
      features: { missionEnabled: "yes", alarmEnabled: true, unknown: 1 },
      execution: {
        method: "unknown",
        targetNpcCount: 999,
        surroundingNpcCount: 999,
        surroundingBitCount: 999,
        unknown: true
      },
      unknown: true
    }, CATALOGS).settings;
    assert(normalized.features.missionEnabled, "Mission既定ONが失われました。");
    assert(normalized.features.alarmEnabled, "Alarm有効値を保持できません。");
    assert(normalized.execution.method === "player-bit", "未知方式を既定値へ戻せません。");
    assert(normalized.execution.targetNpcCount === 5, "Player対象方式の対象NPC上限が5ではありません。");
    assert(normalized.execution.surroundingNpcCount === 94, "NPC総数99上限が適用されません。");
    assert(normalized.execution.surroundingBitCount === 50, "BIT上限50が適用されません。");
    assert(!JSON.stringify(normalized).includes("unknown"), "未知fieldが残りました。");
    return "Mission ON／Alarm OFF既定、方式別上限、未知field 0件";
  }),
  await executeTest("V1キー不変・再起動復元・2種類reset", () => {
    const v1Key = "haigure-survival.title-settings";
    const memory = createStorage({ [v1Key]: "V1_SENTINEL" });
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    store.save({
      ...store.get(),
      features: { missionEnabled: false, alarmEnabled: true },
      execution: {
        method: "npc-player",
        targetNpcCount: 4,
        surroundingNpcCount: 20,
        surroundingBitCount: 30
      }
    });
    store.resetExecution();
    assert(!store.get().features.missionEnabled && store.get().features.alarmEnabled, "公開処刑resetが機能設定を変更しました。");
    assert(JSON.stringify(store.get().execution) === JSON.stringify(V2_DEFAULT_TITLE_SETTINGS.execution), "公開処刑4項目が既定値へ戻りません。");
    const restarted = createV2TitleSettingsStore(memory.storage, CATALOGS);
    assert(restarted.load().features.alarmEnabled, "再起動で保存値を復元できません。");
    restarted.reset();
    assert(JSON.stringify(restarted.get()) === JSON.stringify(V2_DEFAULT_TITLE_SETTINGS), "全resetが全設定を戻しません。");
    assert(!memory.reads.includes(v1Key) && !memory.writes.includes(v1Key), "V1キーへアクセスしました。");
    assert(memory.values.get(v1Key) === "V1_SENTINEL", "V1キーが変更されました。");
    return "公開処刑resetは4項目だけ、全resetは全項目、V1 read/write 0件";
  }),
  await executeTest("開始モード非保存・snapshot deep freeze", () => {
    const memory = createStorage();
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    const before = memory.writes.length;
    const normal = createV2SessionStartSnapshot({
      startMode: "normal",
      settings: store.get(),
      venueRandom: () => 0
    });
    const instant = createV2SessionStartSnapshot({
      startMode: "instant-public-execution",
      settings: store.get(),
      venueRandom: () => 0
    });
    assert(memory.writes.length === before, "開始モード作成時に保存が発生しました。");
    assert(!JSON.stringify(store.get()).includes("startMode"), "開始モードが保存schemaへ混入しました。");
    assert(!doV2SessionStartSnapshotsMatch(normal, instant), "開始モード差分を検出できません。");
    assert(Object.isFrozen(instant) && Object.isFrozen(instant.settings.execution) && Object.isFrozen(instant.instantPublicExecutionScenario!), "session snapshotがdeep freezeされていません。");
    return "normal／instantは非保存、開始差分あり、nested scenario frozen";
  }),
  ...await Promise.all(V2_INSTANT_EXECUTION_METHOD_IDS.map((method) =>
    executeTest(`5方式role・人口: ${method}`, () => {
      const playerTarget = method === "player-bit" || method === "player-npc";
      const settings = settingsForMethod(method, playerTarget ? 2 : 3, 11, 10);
      const snapshot = createV2SessionStartSnapshot({
        startMode: "instant-public-execution",
        settings,
        venueRandom: () => 0.25
      });
      const scenario = snapshot.instantPublicExecutionScenario!;
      const expectedRole = method === "npc-player" ? "shooter" : playerTarget ? "target" : "observer";
      assert(scenario.playerRole === expectedRole, `Player roleが不正です: ${scenario.playerRole}`);
      assert(scenario.targetActorIds.includes("player") === playerTarget, "Player対象構成が方式と一致しません。");
      assert(scenario.targetActorIds.length === settings.execution.targetNpcCount + (playerTarget ? 1 : 0), "中央対象数が不正です。");
      assert(snapshot.runtimePopulation.npcCount === settings.execution.targetNpcCount + settings.execution.surroundingNpcCount, "NPC総数が不正です。");
      const usesBit = method === "player-bit" || method === "npc-bit";
      const usesNpc = method === "player-npc" || method === "npc-npc";
      assert(snapshot.runtimePopulation.initialBitCount === (usesBit ? 10 : 0), "実BIT数が方式と一致しません。");
      assert(scenario.bitShooterIds.length === (usesBit ? 10 : 0), "BIT射手構成が不正です。");
      assert(scenario.npcShooterIds.length === (usesNpc ? 11 : 0), "NPC射手構成が不正です。");
      assert(scenario.audienceNpcIds.length === 11, "周囲NPC構成が不正です。");
      return `${expectedRole}、NPC ${snapshot.runtimePopulation.npcCount}、BIT ${snapshot.runtimePopulation.initialBitCount}`;
    })
  )),
  await executeTest("対象0／最大・会場決定性・R再演scenario", () => {
    const playerZero = settingsForMethod("player-bit", 0, 11, 10);
    const playerMaximum = settingsForMethod("player-bit", 99, 99, 99);
    const npcZero = settingsForMethod("npc-player", 0, 0, 0);
    assert(playerZero.execution.targetNpcCount === 0, "Player対象方式で対象NPC 0を保持できません。");
    assert(playerMaximum.execution.targetNpcCount === 5 && createV2InstantExecutionPopulation(playerMaximum.execution).npcCount === 99, "Player対象最大人口が不正です。");
    assert(npcZero.execution.targetNpcCount === 1, "NPC対象方式の中央対象最小1補正がありません。");
    const courtyard = createV2SessionStartSnapshot({ startMode: "instant-public-execution", settings: playerZero, venueRandom: () => 0.49 });
    const gym = createV2SessionStartSnapshot({ startMode: "instant-public-execution", settings: playerZero, venueRandom: () => 0.5 });
    const courtyardAgain = createV2SessionStartSnapshot({ startMode: "instant-public-execution", settings: playerZero, venueRandom: () => 0.49 });
    assert(courtyard.instantPublicExecutionScenario?.venueId === "assembly-courtyard", "校庭を決定できません。");
    assert(gym.instantPublicExecutionScenario?.venueId === "assembly-gym", "体育館を決定できません。");
    assert(doV2SessionStartSnapshotsMatch(courtyard, courtyardAgain), "同じ乱数系列でscenarioが一致しません。");
    const replayScenario = courtyard.instantPublicExecutionScenario;
    assert(replayScenario === courtyard.instantPublicExecutionScenario, "R再演参照が同一scenarioではありません。");
    return "0／中央6／NPC99／BIT50、校庭・体育館、同一scenario参照";
  }),
  await executeTest("非NPC射手方式は周囲NPC 0を保存・復元", () => {
    const cases = Object.freeze([
      Object.freeze({ method: "player-bit" as const, targetNpcCount: 0 }),
      Object.freeze({ method: "npc-bit" as const, targetNpcCount: 6 }),
      Object.freeze({ method: "npc-player" as const, targetNpcCount: 6 })
    ]);
    for (const executionCase of cases) {
      const memory = createStorage();
      const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
      store.load();
      store.save({
        ...store.get(),
        execution: {
          method: executionCase.method,
          targetNpcCount: executionCase.targetNpcCount,
          surroundingNpcCount: 0,
          surroundingBitCount: 50
        }
      });
      assert(
        store.get().execution.surroundingNpcCount === 0,
        `${executionCase.method}で周囲NPC 0を保存できません。`
      );
      const restarted = createV2TitleSettingsStore(memory.storage, CATALOGS);
      const restored = restarted.load();
      assert(
        restored.execution.surroundingNpcCount === 0,
        `${executionCase.method}で周囲NPC 0を再起動復元できません。`
      );
      const snapshot = createV2SessionStartSnapshot({
        startMode: "instant-public-execution",
        settings: restored,
        venueRandom: () => 0
      });
      assert(
        snapshot.runtimePopulation.npcCount === executionCase.targetNpcCount,
        `${executionCase.method}のNPC人口が対象NPC数と一致しません。`
      );
      assert(
        snapshot.instantPublicExecutionScenario?.audienceNpcIds.length === 0,
        `${executionCase.method}で観客0人scenarioを作成できません。`
      );
    }
    const playerNpc = settingsForMethod("player-npc", 0, 0, 0);
    const npcNpc = settingsForMethod("npc-npc", 6, 0, 0);
    assert(
      playerNpc.execution.surroundingNpcCount === 1,
      "player-npcのNPC射手最小1人補正がありません。"
    );
    assert(
      npcNpc.execution.surroundingNpcCount === 6,
      "npc-npcのNPC射手最小6人補正がありません。"
    );
    return "player-bit／npc-bit／npc-playerは0人、NPC射手2方式だけ対象人数まで補正";
  }),
  await executeTest("Mission／Alarm 4組合せの生成資源", () => {
    for (const missionEnabled of [false, true]) {
      for (const alarmEnabled of [false, true]) {
        const resources = resolveV2SurvivalFeatureResources({ missionEnabled, alarmEnabled });
        assert(resources.missionRuntime === missionEnabled, "Mission Runtime生成条件が不正です。");
        assert(resources.broadcastRuntime === !missionEnabled, "放送Runtime生成条件が不正です。");
        assert(resources.alarmCandidateProvider === alarmEnabled && resources.alarmSystem === alarmEnabled, "Alarm資源生成条件が不正です。");
      }
    }
    return "Mission Runtime／独立放送Runtime／Alarm provider・systemを4組合せで確認";
  }),
  await executeTest("Mission OFF用校内放送3命令・破棄", () => {
    const locationsById = new Map<string, Readonly<{
      id: string;
      navigationLocation: Readonly<{ position: Vector3; polygonRef: number }>;
    }>>([
      ["gym", Object.freeze({ id: "gym", navigationLocation: Object.freeze({ position: new Vector3(1, 0, 0), polygonRef: 1 }) })],
      ["f02-broadcast", Object.freeze({ id: "f02-broadcast", navigationLocation: Object.freeze({ position: new Vector3(2, 0, 0), polygonRef: 2 }) })]
    ]);
    const assignments: V2NpcLocationMissionAssignment[] = [];
    let completedState: string | null = null;
    const randomValues = [0.1, 0.9];
    const runtime = createV2BroadcastRuntime({
      locations: Object.freeze({ getMissionLocationById: (id: string) => locationsById.get(id) ?? null }) as unknown as StageLocationAssetRegistry,
      random: () => randomValues.shift() ?? 0.1,
      completedBrainwashedState: "brainwash-complete-gun",
      npcPort: Object.freeze({
        assignLocationMission: (_npcId: string, assignment: V2NpcLocationMissionAssignment) => assignments.push(assignment),
        cancelLocationMission: () => true,
        setCompletedBrainwashedNpcsState: (state: string) => {
          completedState = state;
          return Object.freeze(["npc_1"]);
        }
      }) as never
    });
    const npcs = Object.freeze([
      createNpc("npc_0", "normal", 2),
      createNpc("npc_1", "brainwash-complete-gun", 1)
    ]);
    runtime.execute("gather-gym", { playerState: "normal", playerFootPosition: Vector3.Zero(), npcs });
    assert(runtime.getAssemblyVenueId() === "assembly-gym" && assignments.length === 1, "体育館集合放送が不正です。");
    runtime.execute("flee", { playerState: "normal", playerFootPosition: Vector3.Zero(), npcs });
    assert(runtime.getAssemblyVenueId() === "assembly-courtyard" && assignments[assignments.length - 1]?.locationId === "f02-broadcast", "逃走放送が不正です。");
    runtime.execute("become-haigure-human", { playerState: "brainwash-complete-gun", playerFootPosition: Vector3.Zero(), npcs });
    assert(completedState === "brainwash-complete-gun", "ハイグレ人間化放送が不正です。");
    runtime.dispose();
    let rejected = false;
    try {
      runtime.getAssemblyVenueId();
    } catch {
      rejected = true;
    }
    assert(rejected, "破棄後に放送Runtimeへアクセスできました。");
    return "体育館集合／逃走／ハイグレ人間化、破棄後アクセス拒否";
  }),
  await executeTest("タイトルモード切替・公開処刑reset", () => {
    const host = document.querySelector<HTMLElement>("#settings-host");
    assert(host !== null, "設定UI hostがありません。");
    const memory = createStorage();
    const store = createV2TitleSettingsStore(memory.storage, CATALOGS);
    store.load();
    const modeChanges: string[] = [];
    const panel = createV2TitleSettingsPanel({
      parent: host,
      store,
      portraitDirectories: CATALOGS.portraitDirectories,
      voiceDirectories: CATALOGS.voiceDirectories,
      confirmEnableNoGunTouch: () => true,
      onNoGunTouchEnabled: () => {},
      startMode: "normal",
      onStartModeChanged: (nextMode) => {
        modeChanges.push(nextMode);
      }
    });
    const toggle = panel.root.querySelector<HTMLButtonElement>('[data-ui="title-instant-execution-toggle-button"]')!;
    assert(!toggle.disabled, "開始モードbuttonがdisabledです。");
    const normalText = panel.root.textContent ?? "";
    assert(
      normalText.includes("キャラクター") &&
        normalText.includes("ミッション") &&
        normalText.includes("アラーム") &&
        normalText.includes("プレイヤー開始地点") &&
        normalText.includes("音量") &&
        !normalText.includes("Character") &&
        !normalText.includes("Player開始地点") &&
        !normalText.includes("VOLUME"),
      "サバイバルモードのタイトル設定が日本語表記ではありません。"
    );
    assert(
      toggle.classList.contains("v2-title-settings__mode-button--instant") &&
        getComputedStyle(toggle).fontSize === "14px",
      "即時公開処刑へ切り替えるボタンの配色classまたは拡大fontがありません。"
    );
    const sectionTitle = panel.root.querySelector<HTMLElement>(".v2-title-settings__section-title")!;
    const settingsRow = panel.root.querySelector<HTMLElement>(".v2-title-settings__row")!;
    assert(
      getComputedStyle(sectionTitle).fontSize === "15px" &&
        getComputedStyle(settingsRow).fontSize === "13px",
      "タイトル設定の文字が1px拡大されていません。"
    );
    toggle.click();
    assert(modeChanges[0] === "instant-public-execution", "即時公開処刑モードへ切り替わりません。");
    assert(
      toggle.textContent === "サバイバルモードに変更" &&
        toggle.classList.contains("v2-title-settings__mode-button--survival"),
      "サバイバルモードへ戻る黄色ボタンになりません。"
    );
    const method = panel.root.querySelector<HTMLSelectElement>('[data-ui="v2-settings-execution-method"]')!;
    assert(
      Array.from(method.options).map((option) => option.textContent).join("|") ===
        "プレイヤーをビットが処刑|プレイヤーをNPCが処刑|NPCをビットが処刑|NPCをNPCが処刑|NPCをプレイヤーが処刑",
      "公開処刑5方式が指定どおり日本語化されていません。"
    );
    method.value = "npc-player";
    method.dispatchEvent(new Event("change", { bubbles: true }));
    panel.root.querySelector<HTMLButtonElement>('[data-ui="v2-settings-reset-execution"]')!.click();
    assert(store.get().execution.method === "player-bit", "UI公開処刑resetが4項目を戻しません。");
    assert(modeChanges.length === 1, "resetで開始モードが変わりました。");
    panel.dispose();
    return "日本語表記、1px拡大、赤／黄button、右側切替、公開処刑4項目reset";
  })
];
