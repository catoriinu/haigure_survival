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
  createCameraSettingsPanel,
  type CameraSettings
} from "./cameraSettingsPanel";
import {
  createDefaultSettingsPanel,
  type DefaultStartSettings
} from "./defaultSettingsPanel";
import { createTrapRoomRecommendControl } from "./trapRoomRecommendControl";

export type TitleSettingsSidebarSettings = {
  defaultStartSettings: DefaultStartSettings;
  brainwashSettings: BrainwashSettings;
  cameraSettings: CameraSettings;
  bitSpawnSettings: BitSpawnSettings;
};

export type TitleSettingsSidebarChangeReason =
  | "default-settings"
  | "brainwash-settings"
  | "camera-settings"
  | "bit-spawn-settings"
  | "trap-room-recommend";

export type TitleSettingsSidebarChangeEvent = {
  reason: TitleSettingsSidebarChangeReason;
  shouldReload: boolean;
};

type TitleSettingsSidebarOptions = {
  parent: HTMLElement;
  initialSettings: TitleSettingsSidebarSettings;
  initialStageId: string;
  onSettingsChange: (
    settings: TitleSettingsSidebarSettings,
    event: TitleSettingsSidebarChangeEvent
  ) => void;
  onResetRequested: () => void;
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
};

const warningMessage =
  "※現在の設定ではゲームオーバーにならない可能性があります。設定の変更を推奨します。";

const cloneSettings = (
  settings: TitleSettingsSidebarSettings
): TitleSettingsSidebarSettings => ({
  defaultStartSettings: { ...settings.defaultStartSettings },
  brainwashSettings: { ...settings.brainwashSettings },
  cameraSettings: { ...settings.cameraSettings },
  bitSpawnSettings: { ...settings.bitSpawnSettings }
});

export const createTitleSettingsSidebar = ({
  parent,
  initialSettings,
  initialStageId,
  onSettingsChange,
  onResetRequested,
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

  const syncWarning = () => {
    const shouldShow =
      visible &&
      warningEnabled &&
      shouldShowGameOverWarning(stageId, cloneSettings(settings));
    warning.style.display = shouldShow ? "block" : "none";
  };

  const emitSettingsChange = (
    reason: TitleSettingsSidebarChangeReason,
    shouldReload = false
  ) => {
    if (suppressSettingsChange) {
      return;
    }
    syncWarning();
    onSettingsChange(cloneSettings(settings), {
      reason,
      shouldReload
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

  const defaultSettingsPanel = createDefaultSettingsPanel({
    parent: settingsContainer,
    initialSettings: settings.defaultStartSettings,
    className: "default-settings-panel--title",
    onChange: (nextSettings) => {
      settings.defaultStartSettings = { ...nextSettings };
      emitSettingsChange("default-settings");
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
      emitSettingsChange("brainwash-settings", shouldReload);
    }
  });

  const bitSpawnPanel = createBitSpawnPanel({
    parent: settingsContainer,
    initialSettings: settings.bitSpawnSettings,
    className: "bit-spawn-panel--title",
    onChange: (nextSettings) => {
      settings.bitSpawnSettings = { ...nextSettings };
      emitSettingsChange("bit-spawn-settings");
    }
  });

  const cameraSettingsPanel = createCameraSettingsPanel({
    parent: settingsContainer,
    initialSettings: settings.cameraSettings,
    className: "camera-settings-panel--title",
    onChange: (nextSettings) => {
      settings.cameraSettings = { ...nextSettings };
      emitSettingsChange("camera-settings");
    }
  });

  const trapRoomRecommendControl = createTrapRoomRecommendControl({
    parent: root,
    onApply: () => {
      const nextSettings: TitleSettingsSidebarSettings = {
        defaultStartSettings: { ...settings.defaultStartSettings },
        brainwashSettings: {
          ...settings.brainwashSettings,
          npcBrainwashCompleteGunPercent: 0,
          npcBrainwashCompleteNoGunPercent: 0
        },
        cameraSettings: { ...settings.cameraSettings },
        bitSpawnSettings: {
          ...settings.bitSpawnSettings,
          disableBitSpawn: true
        }
      };
      withSuppressedSettingsChange(() => {
        brainwashSettingsPanel.setSettings(nextSettings.brainwashSettings);
        bitSpawnPanel.setSettings(nextSettings.bitSpawnSettings);
      });
      settings.brainwashSettings = { ...nextSettings.brainwashSettings };
      settings.bitSpawnSettings = { ...nextSettings.bitSpawnSettings };
      emitSettingsChange("trap-room-recommend");
    }
  });

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "title-reset-settings-button";
  resetButton.dataset.ui = "title-reset-settings-button";
  resetButton.textContent = "全てデフォルトに戻す";
  resetButton.addEventListener("click", onResetRequested);
  root.appendChild(resetButton);

  const syncStageDerivedUi = () => {
    const availability = getAvailability(stageId);
    defaultSettingsPanel.setNpcCountOnlyMode(availability.npcCountOnly);
    brainwashSettingsPanel.setEnabled(availability.brainwashEnabled);
    bitSpawnPanel.setEnabled(availability.bitSpawnEnabled);
    trapRoomRecommendControl.setVisible(visible && isTrapRoomStage(stageId));
  };

  const setVisible = (nextVisible: boolean) => {
    visible = nextVisible;
    root.style.display = visible ? "flex" : "none";
    syncStageDerivedUi();
    syncWarning();
  };

  const setSettings = (nextSettings: TitleSettingsSidebarSettings) => {
    const copiedSettings = cloneSettings(nextSettings);
    withSuppressedSettingsChange(() => {
      defaultSettingsPanel.setSettings(copiedSettings.defaultStartSettings);
      brainwashSettingsPanel.setSettings(copiedSettings.brainwashSettings);
      bitSpawnPanel.setSettings(copiedSettings.bitSpawnSettings);
      cameraSettingsPanel.setSettings(copiedSettings.cameraSettings);
    });
    settings.defaultStartSettings = { ...copiedSettings.defaultStartSettings };
    settings.brainwashSettings = { ...copiedSettings.brainwashSettings };
    settings.bitSpawnSettings = { ...copiedSettings.bitSpawnSettings };
    settings.cameraSettings = { ...copiedSettings.cameraSettings };
    syncWarning();
  };

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
      target instanceof HTMLElement ? root.contains(target) : false
  };
};
