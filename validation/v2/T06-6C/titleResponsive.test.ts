import {
  V2_DEFAULT_PORTRAIT_DIRECTORY
} from "../../../src/v2/v2CharacterAssignments";
import {
  createV2TitleSettingsStore,
  type V2TitleSettingsStorage
} from "../../../src/v2TitleSettingsStore";
import {
  createV2TitleLayoutController,
  resolveV2TitleLayoutMode
} from "../../../src/ui/v2TitleLayoutController";
import { createV2TitleSettingsPanel } from "../../../src/ui/v2TitleSettingsPanel";
import { dispatchV2RuntimeEndFlow } from "../../../src/v2/runtimeEndFlow";
import { resolveV2MissionHudMode } from "../../../src/v2/runtimePresentation";
import type { V2TitleStartMode } from "../../../src/v2/titleSettingsSession";
import { assert, executeTest, type T06TestResult } from "../T06/testUtils";

const waitForLayout = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const createMemoryStorage = (): V2TitleSettingsStorage => {
  const values = new Map<string, string>();
  return Object.freeze({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  });
};

export const runT06_6CTests = async (): Promise<readonly T06TestResult[]> => {
  const overlay = document.getElementById("titleOverlay") as HTMLDivElement;
  const center = document.getElementById("titleCenterBlock") as HTMLDivElement;
  const store = createV2TitleSettingsStore(createMemoryStorage(), {
    portraitDirectories: Object.freeze([V2_DEFAULT_PORTRAIT_DIRECTORY]),
    voiceDirectories: Object.freeze(["default"])
  });
  store.load();
  let startMode: V2TitleStartMode = "normal";
  const panel = createV2TitleSettingsPanel({
    parent: overlay,
    store,
    portraitDirectories: Object.freeze([V2_DEFAULT_PORTRAIT_DIRECTORY]),
    voiceDirectories: Object.freeze(["default"]),
    confirmEnableNoGunTouch: () => true,
    onNoGunTouchEnabled: () => {},
    startMode,
    onStartModeChanged: (mode) => {
      startMode = mode;
    }
  });
  const controller = createV2TitleLayoutController({
    overlay,
    center,
    settingsRoot: panel.root,
    settingsViewport: panel.layoutElements.mainHost,
    settingsContent: panel.layoutElements.mainContent
  });
  await waitForLayout();

  const results = await Promise.all([
    executeTest("基準viewportのlayout mode", () => {
      const actual = [
        resolveV2TitleLayoutMode(1920, 1080),
        resolveV2TitleLayoutMode(1280, 720),
        resolveV2TitleLayoutMode(1024, 600),
        resolveV2TitleLayoutMode(800, 600),
        resolveV2TitleLayoutMode(640, 480),
        resolveV2TitleLayoutMode(480, 360)
      ];
      const expected = ["wide", "wide", "compact", "compact", "stacked", "stacked"];
      assert(JSON.stringify(actual) === JSON.stringify(expected), actual.join("|"));
      return actual.join(" → ");
    }),
    executeTest("通常開始の終了フローは全phaseの既存操作を保つ", () => {
      const cases = [
        ["playing", "retry-normal-session", "return-to-title"],
        ["assembly", "ignored", "return-to-title"],
        ["execution", "ignored", "ignored"],
        ["execution-complete", "replay-execution", "return-to-title"]
      ] as const;
      for (const [phase, expectedRetry, expectedEnter] of cases) {
        const retry = dispatchV2RuntimeEndFlow(["retry"], { phase }, "normal");
        const enter = dispatchV2RuntimeEndFlow(["advance-end-flow"], { phase }, "normal");
        assert(
          retry === expectedRetry && enter === expectedEnter,
          `通常開始 ${phase}: R=${retry}／Enter=${enter}`
        );
      }
      return "通常開始の4phaseでR／Enterの8通りを確認";
    }),
    executeTest("即時公開処刑は処刑中と完了後にR再生／Enterタイトルを受け付ける", () => {
      for (const phase of ["execution", "execution-complete"] as const) {
        const retry = dispatchV2RuntimeEndFlow(["retry"], { phase }, "instant-public-execution");
        const enter = dispatchV2RuntimeEndFlow(["advance-end-flow"], { phase }, "instant-public-execution");
        assert(
          retry === "replay-execution" && enter === "return-to-title",
          `即時公開処刑 ${phase}: R=${retry}／Enter=${enter}`
        );
      }
      return "即時公開処刑のexecution／execution-completeでR／Enterの4通りを確認";
    }),
    executeTest("Mission HUDは開始mode・有効設定・開始状態・全phaseに従う", () => {
      const phases = ["playing", "assembly", "execution", "execution-complete"] as const;
      const hidden = ["hidden", "hidden", "hidden", "hidden"] as const;
      const cases = [
        ["normal", true, true, ["missions", "results", "results", "results"]],
        ["normal", true, false, hidden],
        ["normal", false, true, hidden],
        ["normal", false, false, hidden],
        ["instant-public-execution", true, true, hidden],
        ["instant-public-execution", true, false, hidden],
        ["instant-public-execution", false, true, hidden],
        ["instant-public-execution", false, false, hidden]
      ] as const;
      for (const [mode, missionEnabled, started, expected] of cases) {
        const actual = phases.map((phase) =>
          resolveV2MissionHudMode(started, phase, mode, missionEnabled)
        );
        assert(
          JSON.stringify(actual) === JSON.stringify(expected),
          `mode=${mode}／Mission=${missionEnabled}／started=${started}: ${actual.join("|")}`
        );
      }
      return "2mode×Mission ON/OFF×開始前後×4phaseの32通りを確認";
    }),
    executeTest("設定DOMとfocusを再生成しない", () => {
      const npcInput = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-npc-count"]')!;
      const modeButton = panel.layoutElements.modeButton;
      npcInput.value = "17";
      npcInput.dispatchEvent(new Event("change"));
      modeButton.click();
      const executionSelect = panel.root.querySelector<HTMLSelectElement>(
        '[data-ui="v2-settings-execution-method"]'
      )!;
      executionSelect.focus();
      const before = npcInput;
      controller.refresh();
      const after = panel.root.querySelector<HTMLInputElement>('[data-ui="v2-settings-npc-count"]')!;
      assert(
        before === after && after.value === "17" &&
          document.activeElement === executionSelect &&
          startMode === "instant-public-execution",
        "値、mode、focus、DOM identityのいずれかが失われました。"
      );
      return "値17・即時公開処刑・focus・DOM identityを維持";
    }),
    executeTest("右上は必要時の警告だけを表示", () => {
      const warning = panel.root.querySelector<HTMLElement>('[data-ui="v2-settings-gameover-warning"]')!;
      assert(
        warning.parentElement === panel.layoutElements.statusHost &&
          panel.root.querySelector('[data-ui="v2-settings-saved-status"]') === null,
        "保存済み表示が残っているか、警告の配置が不正です。"
      );
      return "保存済みDOMなし／警告だけをstatus hostへ配置";
    }),
    executeTest("現在viewportの横overflowと操作寸法", () => {
      const controls = [...panel.root.querySelectorAll<HTMLElement>("input, select, button")]
        .filter((element) => !element.closest("[hidden]"));
      const minimumHeight = Math.min(...controls.map((element) => element.getBoundingClientRect().height));
      const minimumExpectedHeight = controller.getMode() === "wide" ? 16 : 32;
      assert(
        overlay.scrollWidth <= overlay.clientWidth + 1 &&
          panel.root.scrollWidth <= panel.root.clientWidth + 1 &&
          minimumHeight >= minimumExpectedHeight,
        `overlay=${overlay.scrollWidth}/${overlay.clientWidth}, settings=${panel.root.scrollWidth}/${panel.root.clientWidth}, minHeight=${minimumHeight}`
      );
      return `layout=${controller.getMode()} / horizontal overflow 0 / 最小操作高${minimumHeight}px`;
    })
  ]);

  return Object.freeze(results);
};
