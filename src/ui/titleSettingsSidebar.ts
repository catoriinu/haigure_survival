import type { TitleSettingsAvailability } from "./titleStageRules";
import {
  createBitSpawnPanel,
  type BitSpawnSettings
} from "./bitSpawnPanel";
import {
  createBrainwashSettingsPanel,
  type BrainwashSettings
} from "./brainwashSettingsPanel";
import {
  createDefaultSettingsPanel,
  type DefaultStartSettings
} from "./defaultSettingsPanel";
import {
  createExecuteSettingsPanel
} from "./executeSettingsPanel";
import {
  type ExecuteSettings
} from "./executeSettings";
import {
  createPlayerSettingsPanel,
  type PlayerSettings
} from "./playerSettingsPanel";
import { createVisualSettingsPanel } from "./visualSettingsPanel";
import { createTrapRoomRecommendControl } from "./trapRoomRecommendControl";

export type TitleSettingsSidebarSettings = {
  playerSettings: PlayerSettings;
  defaultStartSettings: DefaultStartSettings;
  brainwashSettings: BrainwashSettings;
  bitSpawnSettings: BitSpawnSettings;
  executeSettings: ExecuteSettings;
};

export type TitleSettingsSidebarChangeReason =
  | "player-settings"
  | "visual-settings"
  | "default-settings"
  | "brainwash-settings"
  | "bit-spawn-settings"
  | "execute-settings"
  | "trap-room-recommend";

export type TitleSettingsSidebarChangeEvent = {
  reason: TitleSettingsSidebarChangeReason;
  shouldReload: boolean;
  requiresStartPrepare: boolean;
};

type TitleSettingsSidebarOptions = {
  parent: HTMLElement;
  initialSettings: TitleSettingsSidebarSettings;
  portraitDirectories: readonly string[];
  voiceDirectories: readonly string[];
  initialStageId: string;
  onSettingsChange: (
    settings: TitleSettingsSidebarSettings,
    event: TitleSettingsSidebarChangeEvent
  ) => void;
  onResetRequested: () => void;
  onResetExecuteSettingsRequested: () => void;
  onInstantModeChange: (enabled: boolean) => void;
  onBeforeStartInstantExecution?: () => void;
  onStartInstantExecution: () => void;
  onConfirmEnableNoGunTouch: () => boolean;
  shouldShowGameOverWarning: (
    stageId: string,
    settings: TitleSettingsSidebarSettings
  ) => boolean;
  getAvailability: (stageId: string) => TitleSettingsAvailability;
  isTrapRoomStage: (stageId: string) => boolean;
};

export type TitleSettingsSidebar = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  setStageId: (stageId: string) => void;
  setWarningEnabled: (enabled: boolean) => void;
  syncWarning: () => void;
  getSettings: () => TitleSettingsSidebarSettings;
  setSettings: (settings: TitleSettingsSidebarSettings) => void;
  isUiTarget: (target: EventTarget | null) => boolean;
  getInstantExecutionMode: () => boolean;
};

const warningMessage =
  "※現在の設定ではゲームオーバーにならない可能性があります。設定の変更を推奨します。";

const cloneSettings = (
  settings: TitleSettingsSidebarSettings
): TitleSettingsSidebarSettings => ({
  playerSettings: { ...settings.playerSettings },
  defaultStartSettings: { ...settings.defaultStartSettings },
  brainwashSettings: { ...settings.brainwashSettings },
  bitSpawnSettings: { ...settings.bitSpawnSettings },
  executeSettings: { ...settings.executeSettings }
});

export const createTitleSettingsSidebar = ({
  parent,
  initialSettings,
  portraitDirectories,
  voiceDirectories,
  initialStageId,
  onSettingsChange,
  onResetRequested,
  onResetExecuteSettingsRequested,
  onInstantModeChange,
  onBeforeStartInstantExecution,
  onStartInstantExecution,
  onConfirmEnableNoGunTouch,
  shouldShowGameOverWarning,
  getAvailability,
  isTrapRoomStage
}: TitleSettingsSidebarOptions): TitleSettingsSidebar => {
  const root = document.createElement("div");
  root.className = "title-right-panels";
  parent.appendChild(root);

  const warning = document.createElement("div");
  warning.className = "title-gameover-warning";
  warning.textContent = warningMessage;
  root.appendChild(warning);

  const settingsContainer = document.createElement("div");
  settingsContainer.className = "title-settings-combined-panel";
  root.appendChild(settingsContainer);

  const settings = cloneSettings(initialSettings);
  let stageId = initialStageId;
  let visible = true;
  let warningEnabled = true;
  let suppressSettingsChange = false;
  let instantExecutionMode = false;

  const syncWarning = () => {
    const shouldShow =
      visible &&
      warningEnabled &&
      !instantExecutionMode &&
      shouldShowGameOverWarning(stageId, cloneSettings(settings));
    warning.style.display = shouldShow ? "block" : "none";
  };

  const emitSettingsChange = (
    reason: TitleSettingsSidebarChangeReason,
    shouldReload = false,
    requiresStartPrepare = false
  ) => {
    if (suppressSettingsChange) {
      return;
    }
    syncWarning();
    onSettingsChange(cloneSettings(settings), {
      reason,
      shouldReload,
      requiresStartPrepare
    });
  };

  const withSuppressedSettingsChange = (action: () => void) => {
    suppressSettingsChange = true;
    try {
      action();
    } finally {
      suppressSettingsChange = false;
    }
  };

  const playerSettingsPanel = createPlayerSettingsPanel({
    parent: settingsContainer,
    initialSettings: settings.playerSettings,
    portraitDirectories,
    voiceDirectories,
    className: "player-settings-panel--title",
    onChange: (nextSettings) => {
      const requiresStartPrepare =
        settings.playerSettings.portraitDirectory !==
          nextSettings.portraitDirectory ||
        settings.playerSettings.voiceDirectory !== nextSettings.voiceDirectory;
      settings.playerSettings = {
        ...settings.playerSettings,
        ...nextSettings
      };
      emitSettingsChange("player-settings", false, requiresStartPrepare);
    }
  });

  const visualSettingsPanel = createVisualSettingsPanel({
    parent: settingsContainer,
    initialSettings: settings.playerSettings,
    className: "visual-settings-panel--title",
    onChange: (nextSettings) => {
      settings.playerSettings = {
        ...settings.playerSettings,
        ...nextSettings
      };
      emitSettingsChange("visual-settings");
    }
  });

  const defaultSettingsPanel = createDefaultSettingsPanel({
    parent: settingsContainer,
    initialSettings: settings.defaultStartSettings,
    className: "default-settings-panel--title",
    onChange: (nextSettings) => {
      settings.defaultStartSettings = { ...nextSettings };
      emitSettingsChange("default-settings", false, true);
    }
  });

  const brainwashSettingsPanel = createBrainwashSettingsPanel({
    parent: settingsContainer,
    initialSettings: settings.brainwashSettings,
    className: "brainwash-settings-panel--title",
    onBeforeEnableNoGunTouch: onConfirmEnableNoGunTouch,
    onChange: (nextSettings) => {
      const shouldReload =
        nextSettings.brainwashOnNoGunTouch &&
        !settings.brainwashSettings.brainwashOnNoGunTouch;
      settings.brainwashSettings = { ...nextSettings };
      emitSettingsChange(
        "brainwash-settings",
        shouldReload,
        !shouldReload
      );
    }
  });

  const bitSpawnPanel = createBitSpawnPanel({
    parent: settingsContainer,
    initialSettings: settings.bitSpawnSettings,
    className: "bit-spawn-panel--title",
    onChange: (nextSettings) => {
      settings.bitSpawnSettings = { ...nextSettings };
      emitSettingsChange("bit-spawn-settings", false, true);
    }
  });

  const executeSettingsPanel = createExecuteSettingsPanel({
    parent: settingsContainer,
    initialSettings: settings.executeSettings,
    className: "execute-settings-panel--title",
    onChange: (nextSettings) => {
      settings.executeSettings = { ...nextSettings };
      emitSettingsChange("execute-settings");
    },
    onBeforeStartRequested: () => {
      onBeforeStartInstantExecution?.();
    },
    onStartRequested: () => {
      onStartInstantExecution();
    }
  });

  const trapRoomRecommendControl = createTrapRoomRecommendControl({
    parent: root,
    onApply: () => {
      const nextSettings: TitleSettingsSidebarSettings = {
        playerSettings: { ...settings.playerSettings },
        defaultStartSettings: { ...settings.defaultStartSettings },
        brainwashSettings: {
          ...settings.brainwashSettings,
          npcBrainwashCompleteGunPercent: 0,
          npcBrainwashCompleteNoGunPercent: 0
        },
        bitSpawnSettings: {
          ...settings.bitSpawnSettings,
          disableBitSpawn: true
        },
        executeSettings: { ...settings.executeSettings }
      };
      withSuppressedSettingsChange(() => {
        brainwashSettingsPanel.setSettings(nextSettings.brainwashSettings);
        bitSpawnPanel.setSettings(nextSettings.bitSpawnSettings);
      });
      settings.brainwashSettings = { ...nextSettings.brainwashSettings };
      settings.bitSpawnSettings = { ...nextSettings.bitSpawnSettings };
      emitSettingsChange("trap-room-recommend", false, true);
    }
  });

  const buttonRow = document.createElement("div");
  buttonRow.className = "title-settings-button-row";
  root.appendChild(buttonRow);

  const instantExecutionToggleButton = document.createElement("button");
  instantExecutionToggleButton.type = "button";
  instantExecutionToggleButton.className =
    "title-instant-execution-toggle-button";
  instantExecutionToggleButton.dataset.ui = "title-instant-execution-toggle-button";
  instantExecutionToggleButton.addEventListener("click", () => {
    instantExecutionMode = !instantExecutionMode;
    syncInstantExecutionUi();
    syncStageDerivedUi();
    syncWarning();
    onInstantModeChange(instantExecutionMode);
  });
  buttonRow.appendChild(instantExecutionToggleButton);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "title-reset-settings-button";
  resetButton.dataset.ui = "title-reset-settings-button";
  resetButton.addEventListener("click", () => {
    if (instantExecutionMode) {
      onResetExecuteSettingsRequested();
      return;
    }
    onResetRequested();
  });
  buttonRow.appendChild(resetButton);

  const syncInstantExecutionUi = () => {
    root.classList.toggle(
      "title-right-panels--instant-execution",
      instantExecutionMode
    );
    defaultSettingsPanel.setVisible(!instantExecutionMode);
    brainwashSettingsPanel.setVisible(!instantExecutionMode);
    bitSpawnPanel.setVisible(!instantExecutionMode);
    executeSettingsPanel.setVisible(instantExecutionMode);
    instantExecutionToggleButton.textContent = instantExecutionMode
      ? "通常モードに戻る"
      : "いきなり公開処刑モード";
    resetButton.textContent = instantExecutionMode
      ? "公開処刑設定のみデフォルトに戻す"
      : "全てデフォルトに戻す";
  };

  const syncStageDerivedUi = () => {
    const availability = getAvailability(stageId);
    defaultSettingsPanel.setNpcCountOnlyMode(availability.npcCountOnly);
    brainwashSettingsPanel.setEnabled(availability.brainwashEnabled);
    bitSpawnPanel.setEnabled(availability.bitSpawnEnabled);
    trapRoomRecommendControl.setVisible(
      visible && !instantExecutionMode && isTrapRoomStage(stageId)
    );
  };

  const setVisible = (nextVisible: boolean) => {
    visible = nextVisible;
    root.style.display = visible ? "flex" : "none";
    syncInstantExecutionUi();
    syncStageDerivedUi();
    syncWarning();
  };

  const setSettings = (nextSettings: TitleSettingsSidebarSettings) => {
    const copiedSettings = cloneSettings(nextSettings);
    withSuppressedSettingsChange(() => {
      playerSettingsPanel.setSettings(copiedSettings.playerSettings);
      visualSettingsPanel.setSettings(copiedSettings.playerSettings);
      defaultSettingsPanel.setSettings(copiedSettings.defaultStartSettings);
      brainwashSettingsPanel.setSettings(copiedSettings.brainwashSettings);
      bitSpawnPanel.setSettings(copiedSettings.bitSpawnSettings);
      executeSettingsPanel.setSettings(copiedSettings.executeSettings);
    });
    settings.playerSettings = { ...copiedSettings.playerSettings };
    settings.defaultStartSettings = { ...copiedSettings.defaultStartSettings };
    settings.brainwashSettings = { ...copiedSettings.brainwashSettings };
    settings.bitSpawnSettings = { ...copiedSettings.bitSpawnSettings };
    settings.executeSettings = { ...copiedSettings.executeSettings };
    syncInstantExecutionUi();
    syncWarning();
  };

  syncInstantExecutionUi();
  syncStageDerivedUi();
  syncWarning();

  return {
    root,
    setVisible,
    setStageId: (nextStageId) => {
      stageId = nextStageId;
      syncStageDerivedUi();
      syncWarning();
    },
    setWarningEnabled: (enabled) => {
      warningEnabled = enabled;
      syncWarning();
    },
    syncWarning,
    getSettings: () => cloneSettings(settings),
    setSettings,
    isUiTarget: (target) =>
      target instanceof HTMLElement ? root.contains(target) : false,
    getInstantExecutionMode: () => instantExecutionMode
  };
};
