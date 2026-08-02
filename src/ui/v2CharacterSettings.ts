import { V2_TITLE_SETTINGS_STORAGE_KEY } from "../audio/v2AudioSettings";
import { V2_DEFAULT_PORTRAIT_DIRECTORY } from "../v2/v2CharacterAssignments";
import { createTitledSettingsPanelRoot } from "./settingsPanelShared";

export type V2CharacterSettings = Readonly<{
  portraitDirectory: string | null;
  voiceDirectory: string | null;
  enableCharacterSpriteVerticalAngle: boolean;
}>;

export const V2_DEFAULT_CHARACTER_SETTINGS: V2CharacterSettings =
  Object.freeze({
    portraitDirectory: null,
    voiceDirectory: null,
    enableCharacterSpriteVerticalAngle: true,
  });

export type V2PortraitAssetInventory = Readonly<{
  directories: readonly string[];
}>;

export const createV2PortraitAssetInventoryFromPublicPaths = (
  publicPaths: readonly string[],
): V2PortraitAssetInventory => {
  const directories = new Set<string>();
  for (const publicPath of publicPaths) {
    const match =
      /^\/public\/picture\/chara\/([^/]+)\/[^/]+$/.exec(publicPath);
    if (match === null) {
      throw new Error(
        `V2 portrait assetは/public/picture/chara/<directory>/配下が必要です: ${publicPath}`,
      );
    }
    directories.add(match[1] as string);
  }
  return Object.freeze({
    directories: Object.freeze([...directories].sort()),
  });
};

const detectedPortraitFiles = import.meta.glob(
  "/public/picture/chara/*/*.{png,jpg,jpeg,webp,gif,bmp,avif,svg}",
);

export const V2_PORTRAIT_ASSET_INVENTORY =
  createV2PortraitAssetInventoryFromPublicPaths(
    Object.keys(detectedPortraitFiles),
  );

type V2CharacterSettingsStorage = Pick<Storage, "getItem" | "setItem">;

export type V2CharacterSettingsStore = Readonly<{
  load(): V2CharacterSettings;
  save(settings: V2CharacterSettings): void;
}>;

const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readSettingsRoot = (
  storage: V2CharacterSettingsStorage,
): Readonly<{
  root: Record<string, unknown>;
  stored: boolean;
  changed: boolean;
}> => {
  const serialized = storage.getItem(V2_TITLE_SETTINGS_STORAGE_KEY);
  if (serialized === null) {
    return Object.freeze({ root: {}, stored: false, changed: false });
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isJsonRecord(parsed)) {
      return Object.freeze({ root: parsed, stored: true, changed: false });
    }
    return Object.freeze({ root: {}, stored: true, changed: true });
  } catch {
    return Object.freeze({ root: {}, stored: true, changed: true });
  }
};

const normalizeDirectory = (
  value: unknown,
  validDirectories: ReadonlySet<string>,
): Readonly<{ value: string | null; changed: boolean }> => {
  if (value === null) {
    return Object.freeze({ value: null, changed: false });
  }
  if (typeof value === "string" && validDirectories.has(value)) {
    return Object.freeze({ value, changed: false });
  }
  return Object.freeze({ value: null, changed: true });
};

const normalizeCharacterSpriteVerticalAngle = (
  value: unknown,
): Readonly<{ value: boolean; changed: boolean }> => {
  if (value === undefined) {
    return Object.freeze({ value: true, changed: true });
  }
  if (typeof value !== "boolean") {
    throw new Error(
      "enableCharacterSpriteVerticalAngleにはbooleanが必要です。",
    );
  }
  return Object.freeze({ value, changed: false });
};

const writeSettings = (
  storage: V2CharacterSettingsStorage,
  root: Record<string, unknown>,
  settings: V2CharacterSettings,
): void => {
  const playerSettings = isJsonRecord(root.playerSettings)
    ? root.playerSettings
    : {};
  storage.setItem(
    V2_TITLE_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...root,
      playerSettings: {
        ...playerSettings,
        portraitDirectory: settings.portraitDirectory,
        voiceDirectory: settings.voiceDirectory,
        enableCharacterSpriteVerticalAngle:
          settings.enableCharacterSpriteVerticalAngle,
      },
    }),
  );
};

const assertDirectorySelection = (
  label: string,
  directory: string | null,
  validDirectories: ReadonlySet<string>,
): void => {
  if (directory !== null && !validDirectories.has(directory)) {
    throw new Error(`${label}のdirectoryがありません: ${directory}`);
  }
};

export const createV2CharacterSettingsStore = (
  storage: V2CharacterSettingsStorage,
  portraitDirectories: readonly string[],
  voiceDirectories: readonly string[],
): V2CharacterSettingsStore => {
  const portraitDirectorySet = new Set(
    portraitDirectories.length > 0
      ? [V2_DEFAULT_PORTRAIT_DIRECTORY, ...portraitDirectories]
      : portraitDirectories,
  );
  const voiceDirectorySet = new Set(voiceDirectories);
  return Object.freeze({
    load: () => {
      const storedSettings = readSettingsRoot(storage);
      if (!storedSettings.stored) {
        return { ...V2_DEFAULT_CHARACTER_SETTINGS };
      }
      const playerSettings = isJsonRecord(storedSettings.root.playerSettings)
        ? storedSettings.root.playerSettings
        : {};
      const portraitDirectory = normalizeDirectory(
        playerSettings.portraitDirectory,
        portraitDirectorySet,
      );
      const voiceDirectory = normalizeDirectory(
        playerSettings.voiceDirectory,
        voiceDirectorySet,
      );
      const enableCharacterSpriteVerticalAngle =
        normalizeCharacterSpriteVerticalAngle(
          playerSettings.enableCharacterSpriteVerticalAngle,
        );
      const settings = Object.freeze({
        portraitDirectory: portraitDirectory.value,
        voiceDirectory: voiceDirectory.value,
        enableCharacterSpriteVerticalAngle:
          enableCharacterSpriteVerticalAngle.value,
      });
      if (
        storedSettings.changed ||
        !isJsonRecord(storedSettings.root.playerSettings) ||
        portraitDirectory.changed ||
        voiceDirectory.changed ||
        enableCharacterSpriteVerticalAngle.changed
      ) {
        writeSettings(storage, storedSettings.root, settings);
      }
      return settings;
    },
    save: (settings) => {
      assertDirectorySelection(
        "自キャラ",
        settings.portraitDirectory,
        portraitDirectorySet,
      );
      assertDirectorySelection(
        "自ボイス",
        settings.voiceDirectory,
        voiceDirectorySet,
      );
      const storedSettings = readSettingsRoot(storage);
      writeSettings(storage, storedSettings.root, settings);
    },
  });
};

export type V2CharacterSettingsPanel = Readonly<{
  root: HTMLDivElement;
  getSettings(): V2CharacterSettings;
  setSettings(settings: V2CharacterSettings): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}>;

export type V2CharacterSettingsPanelOptions = Readonly<{
  parent: HTMLElement;
  initialSettings: V2CharacterSettings;
  portraitDirectories: readonly string[];
  voiceDirectories: readonly string[];
  onChange(settings: V2CharacterSettings): void;
}>;

const appendDirectoryOptions = (
  select: HTMLSelectElement,
  directories: readonly string[],
  defaultOptionValue: string | null,
): void => {
  const randomOption = document.createElement("option");
  randomOption.value = "";
  randomOption.textContent = "ランダム選択";
  select.appendChild(randomOption);
  if (defaultOptionValue !== null) {
    const defaultOption = document.createElement("option");
    defaultOption.value = defaultOptionValue;
    defaultOption.textContent = "デフォルトスプライト";
    select.appendChild(defaultOption);
  }
  for (const directory of directories) {
    const option = document.createElement("option");
    option.value = directory;
    option.textContent = directory;
    select.appendChild(option);
  }
};

const createDirectoryRow = (
  labelText: string,
  uiId: string,
  directories: readonly string[],
  defaultOptionValue: string | null,
): Readonly<{
  row: HTMLLabelElement;
  select: HTMLSelectElement;
}> => {
  const row = document.createElement("label");
  row.className = "player-settings-panel__row";
  row.dataset.ui = `${uiId}-row`;
  const label = document.createElement("span");
  label.className = "player-settings-panel__label";
  label.textContent = labelText;
  const select = document.createElement("select");
  select.className = "player-settings-panel__select";
  select.dataset.ui = uiId;
  appendDirectoryOptions(select, directories, defaultOptionValue);
  row.append(label, select);
  return Object.freeze({ row, select });
};

export const createV2CharacterSettingsPanel = ({
  parent,
  initialSettings,
  portraitDirectories,
  voiceDirectories,
  onChange,
}: V2CharacterSettingsPanelOptions): V2CharacterSettingsPanel => {
  const portraitDirectorySet = new Set(
    portraitDirectories.length > 0
      ? [V2_DEFAULT_PORTRAIT_DIRECTORY, ...portraitDirectories]
      : portraitDirectories,
  );
  const voiceDirectorySet = new Set(voiceDirectories);
  assertDirectorySelection(
    "自キャラ",
    initialSettings.portraitDirectory,
    portraitDirectorySet,
  );
  assertDirectorySelection(
    "自ボイス",
    initialSettings.voiceDirectory,
    voiceDirectorySet,
  );
  let settings: V2CharacterSettings = Object.freeze({ ...initialSettings });

  const root = document.createElement("div");
  root.className = "title-right-panels";
  root.dataset.ui = "v2-character-settings";
  const panel = createTitledSettingsPanelRoot({
    blockClassName: "player-settings-panel",
    titleText: "PLAYER SETTINGS",
    uiId: "v2-character-settings-panel",
  });
  root.appendChild(panel);

  const portrait = createDirectoryRow(
    "自キャラ",
    "v2-player-portrait-select",
    portraitDirectories,
    V2_DEFAULT_PORTRAIT_DIRECTORY,
  );
  if (portraitDirectories.length > 0) {
    panel.appendChild(portrait.row);
  }
  const voice = createDirectoryRow(
    "自ボイス",
    "v2-player-voice-select",
    voiceDirectories,
    null,
  );
  if (voiceDirectories.length > 0) {
    panel.appendChild(voice.row);
  }

  const verticalAngleRow = document.createElement("label");
  verticalAngleRow.className = "player-settings-panel__checkbox-row";
  verticalAngleRow.dataset.ui =
    "v2-character-sprite-vertical-angle-row";
  const verticalAngleCheckbox = document.createElement("input");
  verticalAngleCheckbox.className = "player-settings-panel__checkbox";
  verticalAngleCheckbox.type = "checkbox";
  verticalAngleCheckbox.dataset.ui =
    "v2-character-sprite-vertical-angle-checkbox";
  const verticalAngleLabel = document.createElement("span");
  verticalAngleLabel.className = "player-settings-panel__checkbox-label";
  verticalAngleLabel.textContent = "キャラ画像を地面に垂直表示";
  verticalAngleRow.append(verticalAngleCheckbox, verticalAngleLabel);
  panel.appendChild(verticalAngleRow);

  const render = (): void => {
    portrait.select.value = settings.portraitDirectory ?? "";
    voice.select.value = settings.voiceDirectory ?? "";
    verticalAngleCheckbox.checked =
      settings.enableCharacterSpriteVerticalAngle;
  };
  const emit = (): void => onChange(Object.freeze({ ...settings }));
  const handlePortraitChange = (): void => {
    settings = Object.freeze({
      ...settings,
      portraitDirectory: portrait.select.value || null,
    });
    render();
    emit();
  };
  const handleVoiceChange = (): void => {
    settings = Object.freeze({
      ...settings,
      voiceDirectory: voice.select.value || null,
    });
    render();
    emit();
  };
  const handleVerticalAngleChange = (): void => {
    settings = Object.freeze({
      ...settings,
      enableCharacterSpriteVerticalAngle: verticalAngleCheckbox.checked,
    });
    render();
    emit();
  };
  portrait.select.addEventListener("change", handlePortraitChange);
  voice.select.addEventListener("change", handleVoiceChange);
  verticalAngleCheckbox.addEventListener(
    "change",
    handleVerticalAngleChange,
  );
  render();
  parent.appendChild(root);

  let disposed = false;
  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2 Character設定panelは使用できません。");
    }
  };

  return Object.freeze({
    root,
    getSettings: () => {
      assertActive();
      return Object.freeze({ ...settings });
    },
    setSettings: (nextSettings) => {
      assertActive();
      assertDirectorySelection(
        "自キャラ",
        nextSettings.portraitDirectory,
        portraitDirectorySet,
      );
      assertDirectorySelection(
        "自ボイス",
        nextSettings.voiceDirectory,
        voiceDirectorySet,
      );
      settings = Object.freeze({ ...nextSettings });
      render();
    },
    setVisible: (visible) => {
      assertActive();
      root.style.display = visible ? "flex" : "none";
    },
    dispose: () => {
      assertActive();
      portrait.select.removeEventListener("change", handlePortraitChange);
      voice.select.removeEventListener("change", handleVoiceChange);
      verticalAngleCheckbox.removeEventListener(
        "change",
        handleVerticalAngleChange,
      );
      root.remove();
      disposed = true;
    },
  });
};
