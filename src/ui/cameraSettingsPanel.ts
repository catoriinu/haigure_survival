import {
  createSettingsPanelControls,
  createTitledSettingsPanelRoot,
  type SettingsPanel
} from "./settingsPanelShared";

export type CameraSettings = {
  heightCells: number;
};

type CameraSettingsPanelOptions = {
  parent: HTMLElement;
  initialSettings: CameraSettings;
  onChange: (settings: CameraSettings) => void;
  className?: string;
};

export type CameraSettingsPanel = SettingsPanel<CameraSettings>;

const formatHeightCells = (value: number) => value.toFixed(2);

export const createCameraSettingsPanel = ({
  parent,
  initialSettings,
  onChange,
  className
}: CameraSettingsPanelOptions): CameraSettingsPanel => {
  const root = createTitledSettingsPanelRoot({
    blockClassName: "camera-settings-panel",
    className,
    titleText: "CAMERA SETTINGS"
  });

  const settings: CameraSettings = {
    heightCells: initialSettings.heightCells
  };

  const heightRow = document.createElement("label");
  heightRow.className = "camera-settings-panel__slider-row";
  const heightLabel = document.createElement("span");
  heightLabel.className = "camera-settings-panel__label";
  heightLabel.textContent = "視点高さ";
  heightRow.appendChild(heightLabel);
  const heightValue = document.createElement("span");
  heightValue.className = "camera-settings-panel__slider-value";
  heightRow.appendChild(heightValue);
  const heightInput = document.createElement("input");
  heightInput.className = "camera-settings-panel__slider";
  heightInput.type = "range";
  heightInput.min = "0.5";
  heightInput.max = "1.5";
  heightInput.step = "0.05";
  heightRow.appendChild(heightInput);
  root.appendChild(heightRow);

  const render = () => {
    heightInput.value = String(settings.heightCells);
    heightValue.textContent = formatHeightCells(settings.heightCells);
  };

  const { emit, setVisible, getSettings, setSettings } =
    createSettingsPanelControls({
      root,
      settings,
      applySettings: (nextSettings) => {
        settings.heightCells = nextSettings.heightCells;
      },
      render,
      onChange
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
