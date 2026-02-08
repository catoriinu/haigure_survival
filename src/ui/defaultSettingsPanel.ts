export type DefaultStartSettings = {
  startPlayerAsBrainwashCompleteGun: boolean;
  startAllNpcsAsHaigure: boolean;
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

  const playerRow = document.createElement("label");
  playerRow.className = "default-settings-panel__checkbox-row";
  const playerCheckbox = document.createElement("input");
  playerCheckbox.className = "default-settings-panel__checkbox";
  playerCheckbox.type = "checkbox";
  playerRow.appendChild(playerCheckbox);
  const playerLabel = document.createElement("span");
  playerLabel.className = "default-settings-panel__checkbox-label";
  playerLabel.textContent = "プレイヤーがハイグレ人間";
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
  npcLabel.textContent = "全NPCがハイグレ人間";
  npcRow.appendChild(npcLabel);
  root.appendChild(npcRow);

  const emit = () => {
    onChange({ ...settings });
  };

  const render = () => {
    playerCheckbox.checked = settings.startPlayerAsBrainwashCompleteGun;
    npcCheckbox.checked = settings.startAllNpcsAsHaigure;
  };

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
