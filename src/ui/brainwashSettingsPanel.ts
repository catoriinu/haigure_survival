export type BrainwashSettings = {
  instantBrainwash: boolean;
  npcBrainwashCompleteGunPercent: number;
  npcBrainwashCompleteNoGunPercent: number;
};

type BrainwashSettingsPanelOptions = {
  parent: HTMLElement;
  initialSettings: BrainwashSettings;
  onChange: (settings: BrainwashSettings) => void;
  className?: string;
};

export type BrainwashSettingsPanel = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  getSettings: () => BrainwashSettings;
  setSettings: (nextSettings: BrainwashSettings) => void;
};

const clampInteger = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

const clampPercent = (value: number) => clampInteger(value, 0, 100);

const calculatePosePercent = (settings: BrainwashSettings) =>
  100 -
  settings.npcBrainwashCompleteGunPercent -
  settings.npcBrainwashCompleteNoGunPercent;

const applyBrainwashSliderChange = (
  settings: BrainwashSettings,
  key:
    | "npcBrainwashCompleteGunPercent"
    | "npcBrainwashCompleteNoGunPercent",
  rawValue: number
) => {
  const clamped = clampPercent(rawValue);
  if (key === "npcBrainwashCompleteGunPercent") {
    settings.npcBrainwashCompleteGunPercent = clamped;
    const overflow =
      settings.npcBrainwashCompleteGunPercent +
      settings.npcBrainwashCompleteNoGunPercent -
      100;
    if (overflow > 0) {
      settings.npcBrainwashCompleteNoGunPercent -= overflow;
    }
    return;
  }
  settings.npcBrainwashCompleteNoGunPercent = clamped;
  const overflow =
    settings.npcBrainwashCompleteGunPercent +
    settings.npcBrainwashCompleteNoGunPercent -
    100;
  if (overflow > 0) {
    settings.npcBrainwashCompleteGunPercent -= overflow;
  }
};

export const createBrainwashSettingsPanel = ({
  parent,
  initialSettings,
  onChange,
  className
}: BrainwashSettingsPanelOptions): BrainwashSettingsPanel => {
  const root = document.createElement("div");
  root.className = className
    ? `brainwash-settings-panel ${className}`
    : "brainwash-settings-panel";
  root.dataset.ui = "brainwash-settings-panel";

  const title = document.createElement("div");
  title.className = "brainwash-settings-panel__title";
  title.textContent = "BRAINWASH SETTINGS";
  root.appendChild(title);

  const settings: BrainwashSettings = { ...initialSettings };

  const instantBrainwashRow = document.createElement("label");
  instantBrainwashRow.className = "brainwash-settings-panel__checkbox-row";
  const instantBrainwashCheckbox = document.createElement("input");
  instantBrainwashCheckbox.className = "brainwash-settings-panel__checkbox";
  instantBrainwashCheckbox.type = "checkbox";
  instantBrainwashRow.appendChild(instantBrainwashCheckbox);
  const instantBrainwashLabel = document.createElement("span");
  instantBrainwashLabel.className = "brainwash-settings-panel__checkbox-label";
  instantBrainwashLabel.textContent = "光線命中後、即洗脳";
  instantBrainwashRow.appendChild(instantBrainwashLabel);
  root.appendChild(instantBrainwashRow);

  const poseRow = document.createElement("div");
  poseRow.className = "brainwash-settings-panel__slider-row";
  const poseLabel = document.createElement("span");
  poseLabel.className = "brainwash-settings-panel__label";
  poseLabel.textContent = "ポーズ";
  poseRow.appendChild(poseLabel);
  const poseValue = document.createElement("span");
  poseValue.className = "brainwash-settings-panel__slider-value";
  poseRow.appendChild(poseValue);
  const poseHint = document.createElement("span");
  poseHint.className = "brainwash-settings-panel__slider-hint";
  poseHint.textContent = "自動";
  poseRow.appendChild(poseHint);
  root.appendChild(poseRow);

  const gunRow = document.createElement("label");
  gunRow.className = "brainwash-settings-panel__slider-row";
  const gunLabel = document.createElement("span");
  gunLabel.className = "brainwash-settings-panel__label";
  gunLabel.textContent = "銃あり";
  gunRow.appendChild(gunLabel);
  const gunValue = document.createElement("span");
  gunValue.className = "brainwash-settings-panel__slider-value";
  gunRow.appendChild(gunValue);
  const gunInput = document.createElement("input");
  gunInput.className = "brainwash-settings-panel__slider";
  gunInput.type = "range";
  gunInput.min = "0";
  gunInput.max = "100";
  gunInput.step = "1";
  gunRow.appendChild(gunInput);
  root.appendChild(gunRow);

  const noGunRow = document.createElement("label");
  noGunRow.className = "brainwash-settings-panel__slider-row";
  const noGunLabel = document.createElement("span");
  noGunLabel.className = "brainwash-settings-panel__label";
  noGunLabel.textContent = "銃なし";
  noGunRow.appendChild(noGunLabel);
  const noGunValue = document.createElement("span");
  noGunValue.className = "brainwash-settings-panel__slider-value";
  noGunRow.appendChild(noGunValue);
  const noGunInput = document.createElement("input");
  noGunInput.className = "brainwash-settings-panel__slider";
  noGunInput.type = "range";
  noGunInput.min = "0";
  noGunInput.max = "100";
  noGunInput.step = "1";
  noGunRow.appendChild(noGunInput);
  root.appendChild(noGunRow);

  const emit = () => {
    onChange({ ...settings });
  };

  const updateBrainwashSlider = (
    key:
      | "npcBrainwashCompleteGunPercent"
      | "npcBrainwashCompleteNoGunPercent",
    input: HTMLInputElement
  ) => {
    applyBrainwashSliderChange(settings, key, Number(input.value));
    render();
    emit();
  };

  const render = () => {
    const posePercent = calculatePosePercent(settings);
    instantBrainwashCheckbox.checked = settings.instantBrainwash;
    poseValue.textContent = `${posePercent}%`;
    gunValue.textContent = `${settings.npcBrainwashCompleteGunPercent}%`;
    noGunValue.textContent = `${settings.npcBrainwashCompleteNoGunPercent}%`;
    gunInput.value = String(settings.npcBrainwashCompleteGunPercent);
    noGunInput.value = String(settings.npcBrainwashCompleteNoGunPercent);
  };

  instantBrainwashCheckbox.addEventListener("change", () => {
    settings.instantBrainwash = instantBrainwashCheckbox.checked;
    emit();
  });
  gunInput.addEventListener("input", () => {
    updateBrainwashSlider("npcBrainwashCompleteGunPercent", gunInput);
  });
  noGunInput.addEventListener("input", () => {
    updateBrainwashSlider("npcBrainwashCompleteNoGunPercent", noGunInput);
  });

  applyBrainwashSliderChange(
    settings,
    "npcBrainwashCompleteGunPercent",
    settings.npcBrainwashCompleteGunPercent
  );
  render();
  parent.appendChild(root);

  return {
    root,
    setVisible: (visible) => {
      root.style.display = visible ? "" : "none";
    },
    getSettings: () => ({ ...settings }),
    setSettings: (nextSettings) => {
      settings.instantBrainwash = nextSettings.instantBrainwash;
      settings.npcBrainwashCompleteGunPercent =
        nextSettings.npcBrainwashCompleteGunPercent;
      settings.npcBrainwashCompleteNoGunPercent =
        nextSettings.npcBrainwashCompleteNoGunPercent;
      applyBrainwashSliderChange(
        settings,
        "npcBrainwashCompleteGunPercent",
        settings.npcBrainwashCompleteGunPercent
      );
      render();
      emit();
    }
  };
};
