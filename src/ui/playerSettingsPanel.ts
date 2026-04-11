import {
  createSettingsPanelControls,
  createTitledSettingsPanelRoot,
  type SettingsPanel
} from "./settingsPanelShared";

export type PlayerSettings = {
  heightCells: number;
  portraitDirectory: string | null;
  voiceDirectory: string | null;
  showGroundShadows: boolean;
  enableCharacterSpriteVerticalAngle: boolean;
};

type PlayerSettingsPanelState = Pick<
  PlayerSettings,
  "heightCells" | "portraitDirectory" | "voiceDirectory"
>;

type PlayerSettingsPanelOptions = {
  parent: HTMLElement;
  initialSettings: PlayerSettingsPanelState;
  portraitDirectories: readonly string[];
  voiceDirectories: readonly string[];
  onChange: (settings: PlayerSettingsPanelState) => void;
  className?: string;
};

export type PlayerSettingsPanel = SettingsPanel<PlayerSettingsPanelState>;

const randomOptionValue = "";

const formatHeightCells = (value: number) => value.toFixed(2);

const normalizeDirectorySelection = (
  directory: string | null,
  validDirectories: ReadonlySet<string>
) => (directory !== null && validDirectories.has(directory) ? directory : null);

export const createPlayerSettingsPanel = ({
  parent,
  initialSettings,
  portraitDirectories,
  voiceDirectories,
  onChange,
  className
}: PlayerSettingsPanelOptions): PlayerSettingsPanel => {
  const root = createTitledSettingsPanelRoot({
    blockClassName: "player-settings-panel",
    className,
    titleText: "PLAYER SETTINGS"
  });
  const shouldShowPortraitSelect = portraitDirectories.length > 0;
  const shouldShowVoiceSelect = voiceDirectories.length > 0;

  const portraitDirectorySet = new Set(portraitDirectories);
  const voiceDirectorySet = new Set(voiceDirectories);
  const settings: PlayerSettingsPanelState = {
    heightCells: initialSettings.heightCells,
    portraitDirectory: normalizeDirectorySelection(
      initialSettings.portraitDirectory,
      portraitDirectorySet
    ),
    voiceDirectory: normalizeDirectorySelection(
      initialSettings.voiceDirectory,
      voiceDirectorySet
    )
  };

  const portraitRow = document.createElement("label");
  portraitRow.className = "player-settings-panel__row";
  const portraitLabel = document.createElement("span");
  portraitLabel.className = "player-settings-panel__label";
  portraitLabel.textContent = "自キャラ";
  portraitRow.appendChild(portraitLabel);
  const portraitSelect = document.createElement("select");
  portraitSelect.className = "player-settings-panel__select";
  portraitRow.appendChild(portraitSelect);
  if (shouldShowPortraitSelect) {
    root.appendChild(portraitRow);
  }

  const voiceRow = document.createElement("label");
  voiceRow.className = "player-settings-panel__row";
  const voiceLabel = document.createElement("span");
  voiceLabel.className = "player-settings-panel__label";
  voiceLabel.textContent = "自ボイス";
  voiceRow.appendChild(voiceLabel);
  const voiceSelect = document.createElement("select");
  voiceSelect.className = "player-settings-panel__select";
  voiceRow.appendChild(voiceSelect);
  if (shouldShowVoiceSelect) {
    root.appendChild(voiceRow);
  }

  const heightRow = document.createElement("label");
  heightRow.className = "player-settings-panel__slider-row";
  const heightLabel = document.createElement("span");
  heightLabel.className = "player-settings-panel__label";
  heightLabel.textContent = "視点高さ";
  heightRow.appendChild(heightLabel);
  const heightValue = document.createElement("span");
  heightValue.className = "player-settings-panel__slider-value";
  heightRow.appendChild(heightValue);
  const heightInput = document.createElement("input");
  heightInput.className = "player-settings-panel__slider";
  heightInput.type = "range";
  heightInput.min = "0.5";
  heightInput.max = "1.5";
  heightInput.step = "0.05";
  heightRow.appendChild(heightInput);
  root.appendChild(heightRow);

  const fillSelectOptions = (
    select: HTMLSelectElement,
    directories: readonly string[]
  ) => {
    select.replaceChildren();
    const randomOption = document.createElement("option");
    randomOption.value = randomOptionValue;
    randomOption.textContent = "ランダム選択";
    select.appendChild(randomOption);
    for (const directory of directories) {
      const option = document.createElement("option");
      option.value = directory;
      option.textContent = directory;
      select.appendChild(option);
    }
  };

  fillSelectOptions(portraitSelect, portraitDirectories);
  fillSelectOptions(voiceSelect, voiceDirectories);

  const render = () => {
    portraitSelect.value = settings.portraitDirectory ?? randomOptionValue;
    voiceSelect.value = settings.voiceDirectory ?? randomOptionValue;
    heightInput.value = String(settings.heightCells);
    heightValue.textContent = formatHeightCells(settings.heightCells);
  };

  const { emit, setVisible, getSettings, setSettings } =
    createSettingsPanelControls({
      root,
      settings,
      applySettings: (nextSettings) => {
        settings.heightCells = nextSettings.heightCells;
        settings.portraitDirectory = normalizeDirectorySelection(
          nextSettings.portraitDirectory,
          portraitDirectorySet
        );
        settings.voiceDirectory = normalizeDirectorySelection(
          nextSettings.voiceDirectory,
          voiceDirectorySet
        );
      },
      render,
      onChange
    });

  portraitSelect.addEventListener("change", () => {
    settings.portraitDirectory = portraitSelect.value || null;
    render();
    emit();
  });

  voiceSelect.addEventListener("change", () => {
    settings.voiceDirectory = voiceSelect.value || null;
    render();
    emit();
  });

  heightInput.addEventListener("input", () => {
    settings.heightCells = Number(heightInput.value);
    render();
    emit();
  });

  render();
  parent.appendChild(root);

  return {
    root,
    setVisible,
    getSettings,
    setSettings
  };
};
