import {
  V2_TITLE_SETTINGS_SCHEMA_VERSION,
  type V2TitleSettings,
  type V2TitleSettingsStore
} from "../v2TitleSettingsStore";
import {
  SCHOOL_PLAYER_SPAWN_OPTIONS,
  type V2PlayerSpawnSelection
} from "../v2/schoolSpawnSelection";
import { V2_DEFAULT_PORTRAIT_DIRECTORY } from "../v2/v2CharacterAssignments";

export type V2TitleSettingsPanel = Readonly<{
  root: HTMLDivElement;
  render(settings: V2TitleSettings): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}>;

export type V2TitleSettingsPanelOptions = Readonly<{
  parent: HTMLElement;
  store: V2TitleSettingsStore;
  portraitDirectories: readonly string[];
  voiceDirectories: readonly string[];
  onSettingsChange(settings: V2TitleSettings): void;
}>;

const createSection = (title: string, uiId: string): HTMLElement => {
  const section = document.createElement("section");
  section.className = "v2-title-settings__section";
  section.dataset.ui = uiId;
  const heading = document.createElement("h2");
  heading.className = "v2-title-settings__section-title";
  heading.textContent = title;
  section.append(heading);
  return section;
};

const createRow = (labelText: string): Readonly<{
  row: HTMLLabelElement;
  valueHost: HTMLSpanElement;
}> => {
  const row = document.createElement("label");
  row.className = "v2-title-settings__row";
  const label = document.createElement("span");
  label.className = "v2-title-settings__label";
  label.textContent = labelText;
  const valueHost = document.createElement("span");
  valueHost.className = "v2-title-settings__value";
  row.append(label, valueHost);
  return Object.freeze({ row, valueHost });
};

const createNumberInput = (
  minimum: number,
  maximum: number,
  step: number,
  uiId: string
): HTMLInputElement => {
  const input = document.createElement("input");
  input.className = "v2-title-settings__number";
  input.type = "number";
  input.min = String(minimum);
  input.max = String(maximum);
  input.step = String(step);
  input.dataset.ui = uiId;
  return input;
};

const createCheckbox = (uiId: string): HTMLInputElement => {
  const input = document.createElement("input");
  input.className = "v2-title-settings__checkbox";
  input.type = "checkbox";
  input.dataset.ui = uiId;
  return input;
};

const appendOptions = (
  select: HTMLSelectElement,
  options: readonly Readonly<{ value: string; label: string }>[]
): void => {
  for (const entry of options) {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    select.append(option);
  }
};

export const createV2TitleSettingsPanel = ({
  parent,
  store,
  portraitDirectories,
  voiceDirectories,
  onSettingsChange
}: V2TitleSettingsPanelOptions): V2TitleSettingsPanel => {
  const root = document.createElement("div");
  root.className = "v2-title-settings";
  root.dataset.ui = "v2-title-settings";
  root.dataset.schemaVersion = String(V2_TITLE_SETTINGS_SCHEMA_VERSION);
  const grid = document.createElement("div");
  grid.className = "v2-title-settings__grid";
  root.append(grid);

  const populationSection = createSection("人口", "v2-settings-population");
  const npcCountRow = createRow("NPC人数");
  const npcCount = createNumberInput(0, 99, 1, "v2-settings-npc-count");
  npcCountRow.valueHost.append(npcCount);
  const brainwashedPercentRow = createRow("初期洗脳済み率");
  const brainwashedPercent = createNumberInput(
    0,
    100,
    1,
    "v2-settings-brainwashed-percent"
  );
  brainwashedPercentRow.valueHost.append(brainwashedPercent, "%");
  const playerBrainwashedRow = createRow("Player初期洗脳済み");
  const playerBrainwashed = createCheckbox("v2-settings-player-brainwashed");
  playerBrainwashedRow.valueHost.append(playerBrainwashed);
  populationSection.append(
    npcCountRow.row,
    brainwashedPercentRow.row,
    playerBrainwashedRow.row
  );

  const bitSection = createSection("BIT", "v2-settings-bit");
  const bitDisabledRow = createRow("BIT無効化");
  const bitDisabled = createCheckbox("v2-settings-bit-disabled");
  bitDisabledRow.valueHost.append(bitDisabled);
  const bitIntervalRow = createRow("増援間隔（秒）");
  const bitInterval = createNumberInput(1, 99, 1, "v2-settings-bit-interval");
  bitIntervalRow.valueHost.append(bitInterval);
  const bitMaximumRow = createRow("最大数");
  const bitMaximum = createNumberInput(1, 50, 1, "v2-settings-bit-maximum");
  bitMaximumRow.valueHost.append(bitMaximum);
  bitSection.append(bitDisabledRow.row, bitIntervalRow.row, bitMaximumRow.row);

  const audioSection = createSection("音量", "v2-settings-audio");
  const audioInputs = Object.freeze({
    bgm: createNumberInput(0, 10, 1, "v2-settings-audio-bgm"),
    se: createNumberInput(0, 10, 1, "v2-settings-audio-se"),
    voice: createNumberInput(0, 10, 1, "v2-settings-audio-voice")
  });
  for (const [key, label] of [
    ["bgm", "BGM"],
    ["se", "SE"],
    ["voice", "VOICE"]
  ] as const) {
    const row = createRow(label);
    row.valueHost.append(audioInputs[key]);
    audioSection.append(row.row);
  }

  const displaySection = createSection("表示", "v2-settings-display");
  const eyeHeightRow = createRow("視点高さ");
  const eyeHeight = createNumberInput(0.5, 1.5, 0.05, "v2-settings-eye-height");
  eyeHeightRow.valueHost.append(eyeHeight);
  const shadowsRow = createRow("地面影");
  const shadows = createCheckbox("v2-settings-ground-shadows");
  shadowsRow.valueHost.append(shadows);
  const verticalRow = createRow("Characterを地面に垂直表示");
  const vertical = createCheckbox("v2-settings-character-vertical");
  verticalRow.valueHost.append(vertical);
  displaySection.append(eyeHeightRow.row, shadowsRow.row, verticalRow.row);

  const brainwashSection = createSection("洗脳", "v2-settings-brainwash");
  const instantRow = createRow("即時洗脳");
  const instant = createCheckbox("v2-settings-instant-brainwash");
  instantRow.valueHost.append(instant);
  const touchRow = createRow("銃なし接触洗脳");
  const touch = createCheckbox("v2-settings-no-gun-touch");
  touchRow.valueHost.append(touch);
  const ratioInputs = Object.freeze({
    gun: createNumberInput(0, 100, 1, "v2-settings-ratio-g"),
    noGun: createNumberInput(0, 100, 1, "v2-settings-ratio-n")
  });
  const gunRow = createRow("G比率");
  gunRow.valueHost.append(ratioInputs.gun, "%");
  const noGunRow = createRow("N比率");
  noGunRow.valueHost.append(ratioInputs.noGun, "%");
  const haigureRow = createRow("H比率（残余）");
  const haigureValue = document.createElement("output");
  haigureValue.dataset.ui = "v2-settings-ratio-h";
  haigureRow.valueHost.append(haigureValue);
  brainwashSection.append(
    instantRow.row,
    touchRow.row,
    gunRow.row,
    noGunRow.row,
    haigureRow.row
  );

  const schoolSection = createSection("学校", "v2-settings-school");
  const stageRow = createRow("ステージ");
  const stage = document.createElement("strong");
  stage.dataset.ui = "v2-settings-fixed-stage";
  stage.textContent = "学校";
  stageRow.valueHost.append(stage);
  const disorderRow = createRow("荒れ度");
  const disorder = createNumberInput(0, 10, 1, "v2-settings-disorder");
  disorderRow.valueHost.append(disorder);
  const spawnRow = createRow("Player開始地点");
  const spawn = document.createElement("select");
  spawn.className = "v2-title-settings__select";
  spawn.dataset.ui = "v2-settings-player-spawn";
  appendOptions(spawn, [
    Object.freeze({ value: "random", label: "ランダム" }),
    ...SCHOOL_PLAYER_SPAWN_OPTIONS.map(({ id, label }) =>
      Object.freeze({ value: id, label })
    )
  ]);
  spawnRow.valueHost.append(spawn);
  schoolSection.append(stageRow.row, disorderRow.row, spawnRow.row);

  const characterSection = createSection("Character", "v2-settings-character");
  const portraitRow = createRow("自キャラ");
  const portrait = document.createElement("select");
  portrait.className = "v2-title-settings__select";
  portrait.dataset.ui = "v2-settings-portrait";
  appendOptions(portrait, [
    Object.freeze({ value: "", label: "ランダム選択" }),
    Object.freeze({
      value: V2_DEFAULT_PORTRAIT_DIRECTORY,
      label: "デフォルトスプライト"
    }),
    ...portraitDirectories.map((directory) =>
      Object.freeze({ value: directory, label: directory })
    )
  ]);
  portraitRow.valueHost.append(portrait);
  const voiceRow = createRow("自ボイス");
  const voice = document.createElement("select");
  voice.className = "v2-title-settings__select";
  voice.dataset.ui = "v2-settings-voice";
  appendOptions(voice, [
    Object.freeze({ value: "", label: "ランダム選択" }),
    ...voiceDirectories.map((directory) =>
      Object.freeze({ value: directory, label: directory })
    )
  ]);
  voiceRow.valueHost.append(voice);
  characterSection.append(portraitRow.row, voiceRow.row);

  grid.append(
    populationSection,
    bitSection,
    audioSection,
    displaySection,
    brainwashSection,
    schoolSection,
    characterSection
  );

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "v2-title-settings__reset";
  resetButton.dataset.ui = "v2-settings-reset-all";
  resetButton.textContent = "全設定リセット";
  root.append(resetButton);

  let settings = store.get();
  const render = (nextSettings: V2TitleSettings): void => {
    settings = nextSettings;
    npcCount.value = String(settings.population.npcCount);
    brainwashedPercent.value = String(
      settings.population.initialBrainwashedNpcPercent
    );
    playerBrainwashed.checked = settings.population.startPlayerBrainwashed;
    bitDisabled.checked = settings.bit.disabled;
    bitInterval.value = String(settings.bit.reinforcementIntervalSeconds);
    bitMaximum.value = String(settings.bit.maximumCount);
    bitInterval.disabled = settings.bit.disabled;
    bitMaximum.disabled = settings.bit.disabled;
    audioInputs.bgm.value = String(settings.audio.bgm);
    audioInputs.se.value = String(settings.audio.se);
    audioInputs.voice.value = String(settings.audio.voice);
    eyeHeight.value = settings.display.eyeHeightScale.toFixed(2);
    shadows.checked = settings.display.showGroundShadows;
    vertical.checked = settings.display.enableCharacterSpriteVerticalAngle;
    instant.checked = settings.brainwash.instantBrainwash;
    touch.checked = settings.brainwash.brainwashOnNoGunTouch;
    ratioInputs.gun.value = String(settings.brainwash.gunPercent);
    ratioInputs.noGun.value = String(settings.brainwash.noGunPercent);
    haigureValue.value = `${settings.brainwash.haigurePercent}%`;
    disorder.value = String(settings.school.roomDisorderLevel);
    spawn.value = settings.school.playerSpawn;
    portrait.value = settings.character.portraitDirectory ?? "";
    voice.value = settings.character.voiceDirectory ?? "";
  };
  const save = (nextSettings: V2TitleSettings): void => {
    const saved = store.save(nextSettings);
    render(saved);
    onSettingsChange(saved);
  };
  const numberValue = (input: HTMLInputElement): number =>
    input.valueAsNumber;
  const handleChange = (): void => {
    save({
      ...settings,
      population: {
        npcCount: numberValue(npcCount),
        initialBrainwashedNpcPercent: numberValue(brainwashedPercent),
        startPlayerBrainwashed: playerBrainwashed.checked
      },
      bit: {
        disabled: bitDisabled.checked,
        reinforcementIntervalSeconds: numberValue(bitInterval),
        maximumCount: numberValue(bitMaximum)
      },
      audio: {
        bgm: numberValue(audioInputs.bgm),
        se: numberValue(audioInputs.se),
        voice: numberValue(audioInputs.voice)
      },
      display: {
        eyeHeightScale: numberValue(eyeHeight),
        showGroundShadows: shadows.checked,
        enableCharacterSpriteVerticalAngle: vertical.checked
      },
      brainwash: {
        instantBrainwash: instant.checked,
        brainwashOnNoGunTouch: touch.checked,
        gunPercent: numberValue(ratioInputs.gun),
        noGunPercent: numberValue(ratioInputs.noGun),
        haigurePercent: 0
      },
      school: {
        roomDisorderLevel: numberValue(disorder),
        playerSpawn: spawn.value as V2PlayerSpawnSelection
      },
      character: {
        portraitDirectory: portrait.value || null,
        voiceDirectory: voice.value || null
      }
    });
  };
  const controls: readonly HTMLElement[] = Object.freeze([
    npcCount,
    brainwashedPercent,
    playerBrainwashed,
    bitDisabled,
    bitInterval,
    bitMaximum,
    audioInputs.bgm,
    audioInputs.se,
    audioInputs.voice,
    eyeHeight,
    shadows,
    vertical,
    instant,
    touch,
    ratioInputs.gun,
    ratioInputs.noGun,
    disorder,
    spawn,
    portrait,
    voice
  ]);
  for (const control of controls) {
    control.addEventListener("change", handleChange);
  }
  const handleReset = (): void => {
    const reset = store.reset();
    render(reset);
    onSettingsChange(reset);
  };
  resetButton.addEventListener("click", handleReset);
  render(settings);
  parent.append(root);

  let disposed = false;
  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2タイトル設定panelは使用できません。");
    }
  };
  return Object.freeze({
    root,
    render: (nextSettings) => {
      assertActive();
      render(nextSettings);
    },
    setVisible: (visible) => {
      assertActive();
      root.style.display = visible ? "block" : "none";
    },
    dispose: () => {
      assertActive();
      for (const control of controls) {
        control.removeEventListener("change", handleChange);
      }
      resetButton.removeEventListener("click", handleReset);
      root.remove();
      disposed = true;
    }
  });
};
