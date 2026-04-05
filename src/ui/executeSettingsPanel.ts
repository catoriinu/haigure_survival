import {
  createSettingsPanelControls,
  createTitledSettingsPanelRoot,
  type SettingsPanel
} from "./settingsPanelShared";
import {
  executeMethodOptions,
  getExecuteCentralCharacterCount,
  getExecuteTargetNpcMax,
  getExecuteTargetNpcMin,
  normalizeExecuteSettings,
  usesBitExecutionMethod,
  type ExecuteSettings
} from "./executeSettings";

type ExecuteSettingsPanelOptions = {
  parent: HTMLElement;
  initialSettings: ExecuteSettings;
  onChange: (settings: ExecuteSettings) => void;
  onBeforeStartRequested?: () => void;
  onStartRequested: () => void;
  className?: string;
};

export type ExecuteSettingsPanel = SettingsPanel<ExecuteSettings> & {
  setStartEnabled: (enabled: boolean) => void;
};

export const createExecuteSettingsPanel = ({
  parent,
  initialSettings,
  onChange,
  onBeforeStartRequested,
  onStartRequested,
  className
}: ExecuteSettingsPanelOptions): ExecuteSettingsPanel => {
  const root = createTitledSettingsPanelRoot({
    blockClassName: "execute-settings-panel",
    className,
    titleText: "EXECUTE SETTINGS"
  });

  const settings: ExecuteSettings = normalizeExecuteSettings(initialSettings);
  let startEnabled = true;

  const methodRow = document.createElement("label");
  methodRow.className = "execute-settings-panel__row execute-settings-panel__row--select";
  const methodLabel = document.createElement("span");
  methodLabel.className = "execute-settings-panel__label";
  methodLabel.textContent = "処刑方法";
  methodRow.appendChild(methodLabel);
  const methodSelect = document.createElement("select");
  methodSelect.className = "execute-settings-panel__select";
  for (const optionValue of executeMethodOptions) {
    const option = document.createElement("option");
    option.value = optionValue.value;
    option.textContent = optionValue.label;
    methodSelect.appendChild(option);
  }
  methodRow.appendChild(methodSelect);
  root.appendChild(methodRow);

  const targetNpcRow = document.createElement("label");
  targetNpcRow.className = "execute-settings-panel__row";
  const targetNpcLabel = document.createElement("span");
  targetNpcLabel.className = "execute-settings-panel__label";
  targetNpcLabel.textContent = "処刑対象NPC(人)";
  targetNpcRow.appendChild(targetNpcLabel);
  const targetNpcInput = document.createElement("input");
  targetNpcInput.className = "execute-settings-panel__input";
  targetNpcInput.type = "number";
  targetNpcInput.step = "1";
  targetNpcRow.appendChild(targetNpcInput);
  root.appendChild(targetNpcRow);

  const surroundingNpcRow = document.createElement("label");
  surroundingNpcRow.className = "execute-settings-panel__row";
  const surroundingNpcLabel = document.createElement("span");
  surroundingNpcLabel.className = "execute-settings-panel__label";
  surroundingNpcLabel.textContent = "周囲のNPC(人)";
  surroundingNpcRow.appendChild(surroundingNpcLabel);
  const surroundingNpcInput = document.createElement("input");
  surroundingNpcInput.className = "execute-settings-panel__input";
  surroundingNpcInput.type = "number";
  surroundingNpcInput.min = "0";
  surroundingNpcInput.max = "99";
  surroundingNpcInput.step = "1";
  surroundingNpcRow.appendChild(surroundingNpcInput);
  root.appendChild(surroundingNpcRow);

  const surroundingBitRow = document.createElement("label");
  surroundingBitRow.className = "execute-settings-panel__row";
  const surroundingBitLabel = document.createElement("span");
  surroundingBitLabel.className = "execute-settings-panel__label";
  surroundingBitLabel.textContent = "周囲のビット(体)";
  surroundingBitRow.appendChild(surroundingBitLabel);
  const surroundingBitInput = document.createElement("input");
  surroundingBitInput.className = "execute-settings-panel__input";
  surroundingBitInput.type = "number";
  surroundingBitInput.min = "0";
  surroundingBitInput.max = "99";
  surroundingBitInput.step = "1";
  surroundingBitRow.appendChild(surroundingBitInput);
  root.appendChild(surroundingBitRow);

  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "execute-settings-panel__start-button";
  startButton.textContent = "処刑開始";
  startButton.addEventListener("click", () => {
    if (!startEnabled) {
      return;
    }
    onBeforeStartRequested?.();
    onStartRequested();
  });
  root.appendChild(startButton);

  const applyNormalized = (nextSettings: ExecuteSettings) => {
    const normalized = normalizeExecuteSettings(nextSettings);
    settings.method = normalized.method;
    settings.targetNpcCount = normalized.targetNpcCount;
    settings.surroundingNpcCount = normalized.surroundingNpcCount;
    settings.surroundingBitCount = normalized.surroundingBitCount;
  };

  const render = () => {
    const targetNpcMin = getExecuteTargetNpcMin(settings.method);
    const targetNpcMax = getExecuteTargetNpcMax(settings.method);
    const centralCharacterCount = getExecuteCentralCharacterCount(
      settings.method,
      settings.targetNpcCount
    );
    const bitEnabled = usesBitExecutionMethod(settings.method);
    methodSelect.value = settings.method;
    targetNpcInput.min = String(targetNpcMin);
    targetNpcInput.max = String(targetNpcMax);
    targetNpcInput.value = String(settings.targetNpcCount);
    surroundingNpcInput.min = String(centralCharacterCount);
    surroundingNpcInput.max = "99";
    surroundingNpcInput.value = String(settings.surroundingNpcCount);
    surroundingBitInput.min = bitEnabled ? String(centralCharacterCount) : "0";
    surroundingBitInput.max = "99";
    surroundingBitInput.value = String(settings.surroundingBitCount);
    surroundingBitInput.disabled = !bitEnabled;
    startButton.disabled = !startEnabled;
  };

  const { emit, setVisible, getSettings, setSettings } =
    createSettingsPanelControls({
      root,
      settings,
      applySettings: applyNormalized,
      render,
      onChange
    });

  const updateNumberInput = (
    input: HTMLInputElement,
    key: "targetNpcCount" | "surroundingNpcCount" | "surroundingBitCount"
  ) => {
    const parsed = Number(input.value);
    const nextValue = Number.isFinite(parsed) ? parsed : settings[key];
    applyNormalized({
      ...settings,
      [key]: nextValue
    });
    render();
    emit();
  };

  methodSelect.addEventListener("change", () => {
    applyNormalized({
      ...settings,
      method: methodSelect.value as ExecuteSettings["method"]
    });
    render();
    emit();
  });

  targetNpcInput.addEventListener("change", () => {
    updateNumberInput(targetNpcInput, "targetNpcCount");
  });
  targetNpcInput.addEventListener("blur", () => {
    updateNumberInput(targetNpcInput, "targetNpcCount");
  });
  surroundingNpcInput.addEventListener("change", () => {
    updateNumberInput(surroundingNpcInput, "surroundingNpcCount");
  });
  surroundingNpcInput.addEventListener("blur", () => {
    updateNumberInput(surroundingNpcInput, "surroundingNpcCount");
  });
  surroundingBitInput.addEventListener("change", () => {
    updateNumberInput(surroundingBitInput, "surroundingBitCount");
  });
  surroundingBitInput.addEventListener("blur", () => {
    updateNumberInput(surroundingBitInput, "surroundingBitCount");
  });

  render();
  parent.appendChild(root);

  return {
    root,
    setVisible,
    getSettings,
    setSettings,
    setStartEnabled: (enabled) => {
      startEnabled = enabled;
      render();
    }
  };
};
