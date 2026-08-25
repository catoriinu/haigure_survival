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
    executeTest("終了フローdispatcherのphase guard", () => {
      const cases = [
        dispatchV2RuntimeEndFlow(["retry"], { phase: "playing" }),
        dispatchV2RuntimeEndFlow(["advance-end-flow"], { phase: "playing" }),
        dispatchV2RuntimeEndFlow(["advance-end-flow"], { phase: "assembly" }),
        dispatchV2RuntimeEndFlow(["retry"], { phase: "execution" }),
        dispatchV2RuntimeEndFlow(["advance-end-flow"], { phase: "execution" }),
        dispatchV2RuntimeEndFlow(["retry"], { phase: "execution-complete" }),
        dispatchV2RuntimeEndFlow(["advance-end-flow"], { phase: "execution-complete" })
      ];
      const expected = [
        "retry-normal-session", "return-to-title", "return-to-title",
        "ignored", "ignored", "replay-execution", "return-to-title"
      ];
      assert(JSON.stringify(cases) === JSON.stringify(expected), cases.join("|"));
      return "通常playingはR retry／Enterタイトル、処刑中だけ無効";
    }),
    executeTest("Mission結果表示phase", () => {
      const actual = [
        resolveV2MissionHudMode(false, "playing"),
        resolveV2MissionHudMode(true, "playing"),
        resolveV2MissionHudMode(true, "assembly"),
        resolveV2MissionHudMode(true, "execution"),
        resolveV2MissionHudMode(true, "execution-complete")
      ];
      const expected = ["hidden", "missions", "results", "hidden", "results"];
      assert(JSON.stringify(actual) === JSON.stringify(expected), actual.join("|"));
      return "通常epilogueと公開処刑完了でresultsを表示";
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
