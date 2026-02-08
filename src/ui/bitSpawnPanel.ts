export type BitSpawnSettings = {
  bitSpawnInterval: number;
  maxBitCount: number;
  disableBitSpawn: boolean;
};

type BitSpawnPanelOptions = {
  parent: HTMLElement;
  initialSettings: BitSpawnSettings;
  onChange: (settings: BitSpawnSettings) => void;
  className?: string;
};

export type BitSpawnPanel = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  getSettings: () => BitSpawnSettings;
};

const clampInteger = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

export const createBitSpawnPanel = ({
  parent,
  initialSettings,
  onChange,
  className
}: BitSpawnPanelOptions): BitSpawnPanel => {
  const root = document.createElement("div");
  root.className = className ? `bit-spawn-panel ${className}` : "bit-spawn-panel";
  root.dataset.ui = "bit-spawn-panel";

  const title = document.createElement("div");
  title.className = "bit-spawn-panel__title";
  title.textContent = "BIT SETTINGS";
  root.appendChild(title);

  const settings: BitSpawnSettings = { ...initialSettings };

  const intervalRow = document.createElement("label");
  intervalRow.className = "bit-spawn-panel__row";
  const intervalLabel = document.createElement("span");
  intervalLabel.className = "bit-spawn-panel__label";
  intervalLabel.textContent = "出現間隔(秒)";
  intervalRow.appendChild(intervalLabel);
  const intervalInput = document.createElement("input");
  intervalInput.className = "bit-spawn-panel__input";
  intervalInput.type = "number";
  intervalInput.min = "1";
  intervalInput.max = "99";
  intervalInput.step = "1";
  intervalRow.appendChild(intervalInput);
  root.appendChild(intervalRow);

  const maxCountRow = document.createElement("label");
  maxCountRow.className = "bit-spawn-panel__row";
  const maxCountLabel = document.createElement("span");
  maxCountLabel.className = "bit-spawn-panel__label";
  maxCountLabel.textContent = "最大数";
  maxCountRow.appendChild(maxCountLabel);
  const maxCountInput = document.createElement("input");
  maxCountInput.className = "bit-spawn-panel__input";
  maxCountInput.type = "number";
  maxCountInput.min = "1";
  maxCountInput.max = "99";
  maxCountInput.step = "1";
  maxCountRow.appendChild(maxCountInput);
  root.appendChild(maxCountRow);

  const disableRow = document.createElement("label");
  disableRow.className = "bit-spawn-panel__checkbox-row";
  const disableCheckbox = document.createElement("input");
  disableCheckbox.className = "bit-spawn-panel__checkbox";
  disableCheckbox.type = "checkbox";
  disableRow.appendChild(disableCheckbox);
  const disableLabel = document.createElement("span");
  disableLabel.className = "bit-spawn-panel__checkbox-label";
  disableLabel.textContent = "ビットを出現させない";
  disableRow.appendChild(disableLabel);
  root.appendChild(disableRow);

  const emit = () => {
    onChange({ ...settings });
  };

  const applyDisabledState = () => {
    const disabled = settings.disableBitSpawn;
    intervalInput.disabled = disabled;
    maxCountInput.disabled = disabled;
  };

  const updateNumberSetting = (
    key: "bitSpawnInterval" | "maxBitCount",
    input: HTMLInputElement
  ) => {
    const parsed = Number(input.value);
    const fallback = settings[key];
    const next = Number.isFinite(parsed)
      ? clampInteger(parsed, 1, 99)
      : fallback;
    settings[key] = next;
    input.value = String(next);
    emit();
  };

  const render = () => {
    intervalInput.value = String(clampInteger(settings.bitSpawnInterval, 1, 99));
    maxCountInput.value = String(clampInteger(settings.maxBitCount, 1, 99));
    disableCheckbox.checked = settings.disableBitSpawn;
    applyDisabledState();
  };

  intervalInput.addEventListener("change", () => {
    updateNumberSetting("bitSpawnInterval", intervalInput);
  });
  intervalInput.addEventListener("blur", () => {
    updateNumberSetting("bitSpawnInterval", intervalInput);
  });
  maxCountInput.addEventListener("change", () => {
    updateNumberSetting("maxBitCount", maxCountInput);
  });
  maxCountInput.addEventListener("blur", () => {
    updateNumberSetting("maxBitCount", maxCountInput);
  });
  disableCheckbox.addEventListener("change", () => {
    settings.disableBitSpawn = disableCheckbox.checked;
    applyDisabledState();
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
