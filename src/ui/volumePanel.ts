import type { AudioCategory } from "../audio/audio";

export type VolumeLevels = Record<AudioCategory, number>;

type VolumePanelOptions = {
  parent: HTMLElement;
  initialLevels: VolumeLevels;
  onChange: (category: AudioCategory, level: number) => void;
  className?: string;
};

export type VolumePanel = {
  root: HTMLDivElement;
  setVisible: (visible: boolean) => void;
  setLevel: (category: AudioCategory, level: number) => void;
  getLevel: (category: AudioCategory) => number;
};

const volumeCategories: { id: AudioCategory; label: string }[] = [
  { id: "voice", label: "VOICE" },
  { id: "bgm", label: "BGM" },
  { id: "se", label: "SE" }
];

const clampLevel = (level: number) => Math.max(0, Math.min(10, level));

export const createVolumePanel = ({
  parent,
  initialLevels,
  onChange,
  className
}: VolumePanelOptions): VolumePanel => {
  const root = document.createElement("div");
  root.className = className ? `volume-panel ${className}` : "volume-panel";
  root.dataset.ui = "volume-panel";

  const title = document.createElement("div");
  title.className = "volume-panel__title";
  title.textContent = "VOLUME";
  root.appendChild(title);

  const levels: VolumeLevels = { ...initialLevels };
  const valueElements = new Map<AudioCategory, HTMLSpanElement>();

  const renderLevel = (category: AudioCategory) => {
    const value = valueElements.get(category)!;
    const level = levels[category];
    value.textContent = level === 0 ? "MUTE" : String(level);
  };

  const setLevel = (
    category: AudioCategory,
    level: number,
    notify: boolean
  ) => {
    const next = clampLevel(level);
    levels[category] = next;
    renderLevel(category);
    if (notify) {
      onChange(category, next);
    }
  };

  for (const category of volumeCategories) {
    const row = document.createElement("div");
    row.className = "volume-row";

    const label = document.createElement("span");
    label.className = "volume-label";
    label.textContent = category.label;
    row.appendChild(label);

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.className = "volume-btn";
    downButton.textContent = "-";
    downButton.addEventListener("click", () => {
      setLevel(category.id, levels[category.id] - 1, true);
    });
    row.appendChild(downButton);

    const value = document.createElement("span");
    value.className = "volume-value";
    valueElements.set(category.id, value);
    row.appendChild(value);

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "volume-btn";
    upButton.textContent = "+";
    upButton.addEventListener("click", () => {
      setLevel(category.id, levels[category.id] + 1, true);
    });
    row.appendChild(upButton);

    const muteButton = document.createElement("button");
    muteButton.type = "button";
    muteButton.className = "volume-btn volume-mute";
    muteButton.textContent = "MUTE";
    muteButton.addEventListener("click", () => {
      setLevel(category.id, 0, true);
    });
    row.appendChild(muteButton);

    root.appendChild(row);
    renderLevel(category.id);
  }

  parent.appendChild(root);

  return {
    root,
    setVisible: (visible) => {
      root.style.display = visible ? "" : "none";
    },
    setLevel: (category, level) => {
      setLevel(category, level, false);
    },
    getLevel: (category) => levels[category]
  };
};
