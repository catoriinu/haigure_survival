import {
  createSettingsPanelControls,
  createTitledSettingsPanelRoot,
  type SettingsPanel
} from "./settingsPanelShared";
import type { PlayerSettings } from "./playerSettingsPanel";

export type VisualSettings = Pick<
  PlayerSettings,
  "showGroundShadows" | "enableCharacterSpriteVerticalAngle"
>;

type VisualSettingsPanelOptions = {
  parent: HTMLElement;
  initialSettings: VisualSettings;
  onChange: (settings: VisualSettings) => void;
  className?: string;
};

export type VisualSettingsPanel = SettingsPanel<VisualSettings>;

export const createVisualSettingsPanel = ({
  parent,
  initialSettings,
  onChange,
  className
}: VisualSettingsPanelOptions): VisualSettingsPanel => {
  const root = createTitledSettingsPanelRoot({
    blockClassName: "visual-settings-panel",
    className,
    titleText: "VISUAL SETTINGS"
  });

  const settings: VisualSettings = { ...initialSettings };

  const groundShadowRow = document.createElement("label");
  groundShadowRow.className = "visual-settings-panel__checkbox-row";
  const groundShadowCheckbox = document.createElement("input");
  groundShadowCheckbox.className = "visual-settings-panel__checkbox";
  groundShadowCheckbox.type = "checkbox";
  groundShadowRow.appendChild(groundShadowCheckbox);
  const groundShadowLabel = document.createElement("span");
  groundShadowLabel.className = "visual-settings-panel__checkbox-label";
  groundShadowLabel.textContent = "影を表示する";
  groundShadowRow.appendChild(groundShadowLabel);
  root.appendChild(groundShadowRow);

  const verticalAngleRow = document.createElement("label");
  verticalAngleRow.className = "visual-settings-panel__checkbox-row";
  const verticalAngleCheckbox = document.createElement("input");
  verticalAngleCheckbox.className = "visual-settings-panel__checkbox";
  verticalAngleCheckbox.type = "checkbox";
  verticalAngleRow.appendChild(verticalAngleCheckbox);
  const verticalAngleLabel = document.createElement("span");
  verticalAngleLabel.className = "visual-settings-panel__checkbox-label";
  verticalAngleLabel.textContent = "キャラ画像の縦角度をカメラに追従";
  verticalAngleRow.appendChild(verticalAngleLabel);
  root.appendChild(verticalAngleRow);

  const render = () => {
    groundShadowCheckbox.checked = settings.showGroundShadows;
    verticalAngleCheckbox.checked = settings.enableCharacterSpriteVerticalAngle;
  };

  const { emit, setVisible, getSettings, setSettings } =
    createSettingsPanelControls({
      root,
      settings,
      applySettings: (nextSettings) => {
        settings.showGroundShadows = nextSettings.showGroundShadows;
        settings.enableCharacterSpriteVerticalAngle =
          nextSettings.enableCharacterSpriteVerticalAngle;
      },
      render,
      onChange
    });

  groundShadowCheckbox.addEventListener("change", () => {
    settings.showGroundShadows = groundShadowCheckbox.checked;
    emit();
  });

  verticalAngleCheckbox.addEventListener("change", () => {
    settings.enableCharacterSpriteVerticalAngle = verticalAngleCheckbox.checked;
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
