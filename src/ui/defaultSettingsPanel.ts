import {
  createSettingsPanelControls,
  createTitledSettingsPanelRoot,
  type SettingsPanel
} from "./settingsPanelShared";

export type DefaultStartSettings = {
  startPlayerAsBrainwashCompleteGun: boolean;
  initialNpcCount: number;
  initialBrainwashedNpcPercent: number;
};

type DefaultSettingsPanelOptions = {
  parent: HTMLElement;
  initialSettings: DefaultStartSettings;
  onChange: (settings: DefaultStartSettings) => void;
  className?: string;
};

export type DefaultSettingsPanel = SettingsPanel<DefaultStartSettings> & {
  setNpcCountOnlyMode: (enabled: boolean) => void;
};

const clampInteger = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));
const clampPercent = (value: number) => clampInteger(value, 0, 100);

export const createDefaultSettingsPanel = ({
  parent,
  initialSettings,
  onChange,
  className
}: DefaultSettingsPanelOptions): DefaultSettingsPanel => {
  const root = createTitledSettingsPanelRoot({
    blockClassName: "default-settings-panel",
    className,
    titleText: "DEFAULT SETTINGS"
  });

  const settings: DefaultStartSettings = { ...initialSettings };
  let npcCountOnlyMode = false;

  const npcCountRow = document.createElement("label");
  npcCountRow.className = "default-settings-panel__row";
  const npcCountLabel = document.createElement("span");
  npcCountLabel.className = "default-settings-panel__label";
  npcCountLabel.textContent = "NPC初期人数";
  npcCountRow.appendChild(npcCountLabel);
  const npcCountInput = document.createElement("input");
  npcCountInput.className = "default-settings-panel__input";
  npcCountInput.type = "number";
  npcCountInput.min = "0";
  npcCountInput.max = "99";
  npcCountInput.step = "1";
  npcCountRow.appendChild(npcCountInput);
  root.appendChild(npcCountRow);

  const brainwashedNpcGroup = document.createElement("div");
  brainwashedNpcGroup.className = "default-settings-panel__brainwashed-group";
  const brainwashedNpcLabel = document.createElement("div");
  brainwashedNpcLabel.className = "default-settings-panel__brainwashed-label";
  brainwashedNpcGroup.appendChild(brainwashedNpcLabel);
  const brainwashedNpcSlider = document.createElement("input");
  brainwashedNpcSlider.className = "default-settings-panel__brainwashed-slider";
  brainwashedNpcSlider.type = "range";
  brainwashedNpcSlider.min = "0";
  brainwashedNpcSlider.max = "100";
  brainwashedNpcSlider.step = "1";
  brainwashedNpcGroup.appendChild(brainwashedNpcSlider);
  root.appendChild(brainwashedNpcGroup);

  const playerRow = document.createElement("label");
  playerRow.className = "default-settings-panel__checkbox-row";
  const playerCheckbox = document.createElement("input");
  playerCheckbox.className = "default-settings-panel__checkbox";
  playerCheckbox.type = "checkbox";
  playerRow.appendChild(playerCheckbox);
  const playerLabel = document.createElement("span");
  playerLabel.className = "default-settings-panel__checkbox-label";
  playerLabel.textContent = "プレイヤーが洗脳完了済み";
  playerRow.appendChild(playerLabel);
  root.appendChild(playerRow);

  const calculateInitialBrainwashedNpcCount = () =>
    Math.floor(
      settings.initialNpcCount * settings.initialBrainwashedNpcPercent * 0.01
    );

  const updateNpcCount = () => {
    const parsed = Number(npcCountInput.value);
    const fallback = settings.initialNpcCount;
    const next = Number.isFinite(parsed)
      ? clampInteger(parsed, 0, 99)
      : fallback;
    settings.initialNpcCount = next;
    render();
    emit();
  };

  const updateInitialBrainwashedNpcPercent = () => {
    settings.initialBrainwashedNpcPercent = clampPercent(
      Number(brainwashedNpcSlider.value)
    );
    render();
    emit();
  };

  const applyNpcCountOnlyMode = () => {
    npcCountInput.disabled = false;
    brainwashedNpcSlider.disabled = npcCountOnlyMode;
    playerCheckbox.disabled = npcCountOnlyMode;
  };

  const render = () => {
    npcCountInput.value = String(clampInteger(settings.initialNpcCount, 0, 99));
    brainwashedNpcLabel.textContent = `NPC洗脳完了済み人数 ${calculateInitialBrainwashedNpcCount()}人`;
    brainwashedNpcSlider.value = String(
      clampPercent(settings.initialBrainwashedNpcPercent)
    );
    playerCheckbox.checked = settings.startPlayerAsBrainwashCompleteGun;
    applyNpcCountOnlyMode();
  };

  const { emit, setVisible, getSettings, setSettings } =
    createSettingsPanelControls({
      root,
      settings,
      applySettings: (nextSettings) => {
        settings.startPlayerAsBrainwashCompleteGun =
          nextSettings.startPlayerAsBrainwashCompleteGun;
        settings.initialNpcCount = clampInteger(nextSettings.initialNpcCount, 0, 99);
        settings.initialBrainwashedNpcPercent = clampPercent(
          nextSettings.initialBrainwashedNpcPercent
        );
      },
      render,
      onChange
    });

  npcCountInput.addEventListener("change", () => {
    updateNpcCount();
  });
  npcCountInput.addEventListener("blur", () => {
    updateNpcCount();
  });
  brainwashedNpcSlider.addEventListener("input", () => {
    updateInitialBrainwashedNpcPercent();
  });

  playerCheckbox.addEventListener("change", () => {
    settings.startPlayerAsBrainwashCompleteGun = playerCheckbox.checked;
    render();
    emit();
  });

  settings.initialBrainwashedNpcPercent = clampPercent(
    settings.initialBrainwashedNpcPercent
  );
  render();
  parent.appendChild(root);

  return {
    root,
    setVisible,
    getSettings,
    setSettings,
    setNpcCountOnlyMode: (enabled) => {
      npcCountOnlyMode = enabled;
      applyNpcCountOnlyMode();
    }
  };
};
