export type DefaultStartSettings = {
  startPlayerAsBrainwashCompleteGun: boolean;
  startAllNpcsAsHaigure: boolean;
  initialNpcCount: number;
};

type DefaultSettingsPanelOptions = {
  parent: HTMLElement;
  initialSettings: DefaultStartSettings;
  onChange: (settings: DefaultStartSettings) => void;
  className?: string;
};

export type DefaultSettingsPanel = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  getSettings: () => DefaultStartSettings;
};

const clampInteger = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

export const createDefaultSettingsPanel = ({
  parent,
  initialSettings,
  onChange,
  className
}: DefaultSettingsPanelOptions): DefaultSettingsPanel => {
  const root = document.createElement("div");
  root.className = className
    ? `default-settings-panel ${className}`
    : "default-settings-panel";
  root.dataset.ui = "default-settings-panel";

  const title = document.createElement("div");
  title.className = "default-settings-panel__title";
  title.textContent = "DEFAULT SETTINGS";
  root.appendChild(title);

  const settings: DefaultStartSettings = { ...initialSettings };

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

  const npcRow = document.createElement("label");
  npcRow.className = "default-settings-panel__checkbox-row";
  const npcCheckbox = document.createElement("input");
  npcCheckbox.className = "default-settings-panel__checkbox";
  npcCheckbox.type = "checkbox";
  npcRow.appendChild(npcCheckbox);
  const npcLabel = document.createElement("span");
  npcLabel.className = "default-settings-panel__checkbox-label";
  npcLabel.textContent = "全NPCが洗脳完了済み";
  npcRow.appendChild(npcLabel);
  root.appendChild(npcRow);

  const emit = () => {
    onChange({ ...settings });
  };

  const updateNpcCount = () => {
    const parsed = Number(npcCountInput.value);
    const fallback = settings.initialNpcCount;
    const next = Number.isFinite(parsed)
      ? clampInteger(parsed, 0, 99)
      : fallback;
    settings.initialNpcCount = next;
    npcCountInput.value = String(next);
    emit();
  };

  const render = () => {
    npcCountInput.value = String(clampInteger(settings.initialNpcCount, 0, 99));
    playerCheckbox.checked = settings.startPlayerAsBrainwashCompleteGun;
    npcCheckbox.checked = settings.startAllNpcsAsHaigure;
  };

  npcCountInput.addEventListener("change", () => {
    updateNpcCount();
  });
  npcCountInput.addEventListener("blur", () => {
    updateNpcCount();
  });

  playerCheckbox.addEventListener("change", () => {
    settings.startPlayerAsBrainwashCompleteGun = playerCheckbox.checked;
    if (settings.startPlayerAsBrainwashCompleteGun) {
      settings.startAllNpcsAsHaigure = false;
    }
    render();
    emit();
  });

  npcCheckbox.addEventListener("change", () => {
    settings.startAllNpcsAsHaigure = npcCheckbox.checked;
    if (settings.startAllNpcsAsHaigure) {
      settings.startPlayerAsBrainwashCompleteGun = false;
    }
    render();
    emit();
  });

  render();
  parent.appendChild(root);

  return {
    root,
    setVisible: (visible) => {
      root.style.display = visible ? "" : "none";
    },
    getSettings: () => ({ ...settings })
  };
};
