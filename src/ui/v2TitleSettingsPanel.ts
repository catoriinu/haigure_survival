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
}>;

type EventSubscription = Readonly<{
  target: EventTarget;
  type: string;
  listener: EventListener;
}>;

const createSection = (
  title: string,
  uiId: string,
  placement: "stage" | "audio" | "main"
): HTMLElement => {
  const section = document.createElement("section");
  section.className = `v2-title-settings__section v2-title-settings__section--${placement}`;
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

const createRangeInput = (
  minimum: number,
  maximum: number,
  step: number,
  uiId: string
): HTMLInputElement => {
  const input = document.createElement("input");
  input.className = "v2-title-settings__range";
  input.type = "range";
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

const createOutput = (uiId: string): HTMLOutputElement => {
  const output = document.createElement("output");
  output.className = "v2-title-settings__output";
  output.dataset.ui = uiId;
  return output;
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
  voiceDirectories
}: V2TitleSettingsPanelOptions): V2TitleSettingsPanel => {
  const root = document.createElement("div");
  root.className = "v2-title-settings";
  root.dataset.ui = "v2-title-settings";
  root.dataset.schemaVersion = String(V2_TITLE_SETTINGS_SCHEMA_VERSION);

  const stageHost = document.createElement("div");
  stageHost.className = "v2-title-settings__stage-host";
  const audioHost = document.createElement("div");
  audioHost.className = "v2-title-settings__audio-host";
  const mainHost = document.createElement("div");
  mainHost.className = "v2-title-settings__main-host";
  const mainGrid = document.createElement("div");
  mainGrid.className = "v2-title-settings__main-grid";
  mainHost.append(mainGrid);
  root.append(stageHost, audioHost, mainHost);

  const populationSection = createSection("人口", "v2-settings-population", "main");
  const npcCountRow = createRow("NPC初期人数");
  const npcCount = createNumberInput(0, 99, 1, "v2-settings-npc-count");
  npcCountRow.valueHost.append(npcCount);
  const brainwashedPercentRow = createRow("NPC洗脳完了済み人数");
  brainwashedPercentRow.row.classList.add("v2-title-settings__row--range");
  const brainwashedPercent = createRangeInput(0, 100, 1, "v2-settings-brainwashed-percent");
  const brainwashedPercentValue = createOutput("v2-settings-brainwashed-percent-value");
  brainwashedPercentRow.valueHost.append(brainwashedPercent, brainwashedPercentValue);
  const playerBrainwashedRow = createRow("プレイヤーが洗脳完了済み");
  const playerBrainwashed = createCheckbox("v2-settings-player-brainwashed");
  playerBrainwashedRow.valueHost.append(playerBrainwashed);
  populationSection.append(npcCountRow.row, brainwashedPercentRow.row, playerBrainwashedRow.row);

  const bitSection = createSection("BIT", "v2-settings-bit", "main");
  const bitDisabledRow = createRow("BITを出現させない");
  const bitDisabled = createCheckbox("v2-settings-bit-disabled");
  bitDisabledRow.valueHost.append(bitDisabled);
  const bitIntervalRow = createRow("増援間隔（秒）");
  const bitInterval = createNumberInput(1, 99, 1, "v2-settings-bit-interval");
  bitIntervalRow.valueHost.append(bitInterval);
  const bitMaximumRow = createRow("最大数");
  const bitMaximum = createNumberInput(1, 50, 1, "v2-settings-bit-maximum");
  bitMaximumRow.valueHost.append(bitMaximum);
  bitSection.append(bitDisabledRow.row, bitIntervalRow.row, bitMaximumRow.row);

  const displaySection = createSection("表示", "v2-settings-display", "main");
  const eyeHeightRow = createRow("視点高さ");
  eyeHeightRow.row.classList.add("v2-title-settings__row--range");
  const eyeHeight = createRangeInput(0.5, 1.5, 0.05, "v2-settings-eye-height");
  const eyeHeightValue = createOutput("v2-settings-eye-height-value");
  eyeHeightRow.valueHost.append(eyeHeight, eyeHeightValue);
  const shadowsRow = createRow("影を表示する");
  const shadows = createCheckbox("v2-settings-ground-shadows");
  shadowsRow.valueHost.append(shadows);
  const verticalRow = createRow("キャラ画像の縦角度をカメラに追従");
  const vertical = createCheckbox("v2-settings-character-vertical");
  verticalRow.valueHost.append(vertical);
  displaySection.append(eyeHeightRow.row, shadowsRow.row, verticalRow.row);

  const brainwashSection = createSection("洗脳", "v2-settings-brainwash", "main");
  const instantRow = createRow("洗脳進行中を経ずに即洗脳");
  const instant = createCheckbox("v2-settings-instant-brainwash");
  instantRow.valueHost.append(instant);
  const touchRow = createRow("銃なしに触れたら洗脳");
  const touch = createCheckbox("v2-settings-no-gun-touch");
  touchRow.valueHost.append(touch);
  const poseRow = createRow("ポーズ");
  const poseValue = createOutput("v2-settings-ratio-h");
  poseRow.valueHost.append(poseValue);
  const gunRow = createRow("銃あり");
  gunRow.row.classList.add("v2-title-settings__row--range");
  const gunRatio = createRangeInput(0, 100, 1, "v2-settings-ratio-g");
  const gunValue = createOutput("v2-settings-ratio-g-value");
  gunRow.valueHost.append(gunRatio, gunValue);
  const noGunRow = createRow("銃なし");
  noGunRow.row.classList.add("v2-title-settings__row--range");
  const noGunRatio = createRangeInput(0, 100, 1, "v2-settings-ratio-n");
  const noGunValue = createOutput("v2-settings-ratio-n-value");
  noGunRow.valueHost.append(noGunRatio, noGunValue);
  brainwashSection.append(instantRow.row, touchRow.row, poseRow.row, gunRow.row, noGunRow.row);

  const characterSection = createSection("Character", "v2-settings-character", "main");
  const portraitRow = createRow("自キャラ");
  const portrait = document.createElement("select");
  portrait.className = "v2-title-settings__select";
  portrait.dataset.ui = "v2-settings-portrait";
  appendOptions(portrait, [
    Object.freeze({ value: "", label: "ランダム選択" }),
    Object.freeze({ value: V2_DEFAULT_PORTRAIT_DIRECTORY, label: "デフォルトスプライト" }),
    ...portraitDirectories.map((directory) => Object.freeze({ value: directory, label: directory }))
  ]);
  portraitRow.valueHost.append(portrait);
  const voiceRow = createRow("自ボイス");
  const voice = document.createElement("select");
  voice.className = "v2-title-settings__select";
  voice.dataset.ui = "v2-settings-voice";
  appendOptions(voice, [
    Object.freeze({ value: "", label: "ランダム選択" }),
    ...voiceDirectories.map((directory) => Object.freeze({ value: directory, label: directory }))
  ]);
  voiceRow.valueHost.append(voice);
  characterSection.append(portraitRow.row, voiceRow.row);
  mainGrid.append(populationSection, bitSection, displaySection, brainwashSection, characterSection);

  const schoolSection = createSection("学校", "v2-settings-school", "stage");
  const stageRow = createRow("ステージ");
  const stage = document.createElement("strong");
  stage.dataset.ui = "v2-settings-fixed-stage";
  stage.textContent = "学校";
  stageRow.valueHost.append(stage);
  const disorderRow = createRow("荒れ度");
  disorderRow.row.classList.add("v2-title-settings__row--range");
  const disorder = createRangeInput(0, 10, 1, "v2-settings-disorder");
  const disorderValue = createOutput("v2-settings-disorder-value");
  disorderRow.valueHost.append(disorder, disorderValue);
  const spawnRow = createRow("Player開始地点");
  const spawn = document.createElement("select");
  spawn.className = "v2-title-settings__select";
  spawn.dataset.ui = "v2-settings-player-spawn";
  appendOptions(spawn, [
    Object.freeze({ value: "random", label: "ランダム" }),
    ...SCHOOL_PLAYER_SPAWN_OPTIONS.map(({ id, label }) => Object.freeze({ value: id, label }))
  ]);
  spawnRow.valueHost.append(spawn);
  schoolSection.append(stageRow.row, disorderRow.row, spawnRow.row);
  stageHost.append(schoolSection);

  const audioSection = createSection("VOLUME", "v2-settings-audio", "audio");
  const audioOutputs = Object.freeze({
    voice: createOutput("v2-settings-audio-voice"),
    bgm: createOutput("v2-settings-audio-bgm"),
    se: createOutput("v2-settings-audio-se")
  });
  const audioButtons: HTMLButtonElement[] = [];
  const audioRows = Object.freeze({
    voice: createRow("VOICE"),
    bgm: createRow("BGM"),
    se: createRow("SE")
  });
  for (const key of ["voice", "bgm", "se"] as const) {
    const decrement = document.createElement("button");
    decrement.type = "button";
    decrement.className = "v2-title-settings__audio-button";
    decrement.dataset.audioAction = "decrement";
    decrement.dataset.audioChannel = key;
    decrement.textContent = "−";
    decrement.setAttribute("aria-label", `${key.toUpperCase()}を下げる`);
    const increment = document.createElement("button");
    increment.type = "button";
    increment.className = "v2-title-settings__audio-button";
    increment.dataset.audioAction = "increment";
    increment.dataset.audioChannel = key;
    increment.textContent = "+";
    increment.setAttribute("aria-label", `${key.toUpperCase()}を上げる`);
    const mute = document.createElement("button");
    mute.type = "button";
    mute.className = "v2-title-settings__audio-button v2-title-settings__audio-button--mute";
    mute.dataset.audioAction = "mute";
    mute.dataset.audioChannel = key;
    mute.textContent = "MUTE";
    mute.setAttribute("aria-label", `${key.toUpperCase()}をミュートする`);
    audioRows[key].valueHost.append(decrement, audioOutputs[key], increment, mute);
    audioButtons.push(decrement, increment, mute);
    audioSection.append(audioRows[key].row);
  }
  audioHost.append(audioSection);

  const modeButton = document.createElement("button");
  modeButton.type = "button";
  modeButton.className = "v2-title-settings__mode-placeholder";
  modeButton.dataset.ui = "title-instant-execution-toggle-button";
  modeButton.textContent = "いきなり公開処刑モードに変更";
  modeButton.disabled = true;
  const modeNote = document.createElement("span");
  modeNote.className = "v2-title-settings__mode-placeholder-note";
  modeNote.textContent = "（準備中）";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "v2-title-settings__reset";
  resetButton.dataset.ui = "v2-settings-reset-all";
  resetButton.textContent = "全設定をリセットする";
  mainHost.append(resetButton);
  root.append(modeButton, modeNote);

  let settings = store.get();
  const render = (nextSettings: V2TitleSettings): void => {
    settings = nextSettings;
    npcCount.value = String(settings.population.npcCount);
    brainwashedPercent.value = String(settings.population.initialBrainwashedNpcPercent);
    const brainwashedCount = Math.floor(
      settings.population.npcCount * settings.population.initialBrainwashedNpcPercent / 100
    );
    brainwashedPercentValue.value = `${settings.population.initialBrainwashedNpcPercent}%（${brainwashedCount}人）`;
    playerBrainwashed.checked = settings.population.startPlayerBrainwashed;
    bitDisabled.checked = settings.bit.disabled;
    bitInterval.value = String(settings.bit.reinforcementIntervalSeconds);
    bitMaximum.value = String(settings.bit.maximumCount);
    bitInterval.disabled = settings.bit.disabled;
    bitMaximum.disabled = settings.bit.disabled;
    for (const key of ["voice", "bgm", "se"] as const) {
      const value = settings.audio[key];
      audioOutputs[key].value = value === 0 ? "MUTE" : String(value);
    }
    eyeHeight.value = settings.display.eyeHeightScale.toFixed(2);
    eyeHeightValue.value = settings.display.eyeHeightScale.toFixed(2);
    shadows.checked = settings.display.showGroundShadows;
    vertical.checked = settings.display.enableCharacterSpriteVerticalAngle;
    instant.checked = settings.brainwash.instantBrainwash;
    touch.checked = settings.brainwash.brainwashOnNoGunTouch;
    gunRatio.value = String(settings.brainwash.gunPercent);
    gunValue.value = `${settings.brainwash.gunPercent}%`;
    noGunRatio.value = String(settings.brainwash.noGunPercent);
    noGunValue.value = `${settings.brainwash.noGunPercent}%`;
    poseValue.value = `${settings.brainwash.haigurePercent}%`;
    disorder.value = String(settings.school.roomDisorderLevel);
    disorderValue.value = String(settings.school.roomDisorderLevel);
    spawn.value = settings.school.playerSpawn;
    portrait.value = settings.character.portraitDirectory ?? "";
    voice.value = settings.character.voiceDirectory ?? "";
  };
  const save = (nextSettings: V2TitleSettings): void => {
    render(store.save(nextSettings));
  };
  const numberValue = (input: HTMLInputElement): number => input.valueAsNumber;
  const subscriptions: EventSubscription[] = [];
  const listen = (target: EventTarget, type: string, listener: EventListener): void => {
    target.addEventListener(type, listener);
    subscriptions.push(Object.freeze({ target, type, listener }));
  };

  listen(npcCount, "change", () => {
    save({ ...settings, population: { ...settings.population, npcCount: numberValue(npcCount) } });
  });
  listen(brainwashedPercent, "input", () => {
    save({
      ...settings,
      population: {
        ...settings.population,
        initialBrainwashedNpcPercent: numberValue(brainwashedPercent)
      }
    });
  });
  listen(playerBrainwashed, "change", () => {
    save({
      ...settings,
      population: { ...settings.population, startPlayerBrainwashed: playerBrainwashed.checked }
    });
  });
  listen(bitDisabled, "change", () => {
    save({ ...settings, bit: { ...settings.bit, disabled: bitDisabled.checked } });
  });
  for (const input of [bitInterval, bitMaximum]) {
    listen(input, "change", () => {
      save({
        ...settings,
        bit: {
          ...settings.bit,
          reinforcementIntervalSeconds: numberValue(bitInterval),
          maximumCount: numberValue(bitMaximum)
        }
      });
    });
  }
  listen(eyeHeight, "input", () => {
    save({ ...settings, display: { ...settings.display, eyeHeightScale: numberValue(eyeHeight) } });
  });
  listen(shadows, "change", () => {
    save({ ...settings, display: { ...settings.display, showGroundShadows: shadows.checked } });
  });
  listen(vertical, "change", () => {
    save({
      ...settings,
      display: { ...settings.display, enableCharacterSpriteVerticalAngle: vertical.checked }
    });
  });
  listen(instant, "change", () => {
    save({ ...settings, brainwash: { ...settings.brainwash, instantBrainwash: instant.checked } });
  });
  listen(touch, "change", () => {
    save({
      ...settings,
      brainwash: { ...settings.brainwash, brainwashOnNoGunTouch: touch.checked }
    });
  });
  listen(gunRatio, "input", () => {
    const gunPercent = numberValue(gunRatio);
    const noGunPercent = Math.min(settings.brainwash.noGunPercent, 100 - gunPercent);
    save({
      ...settings,
      brainwash: {
        ...settings.brainwash,
        gunPercent,
        noGunPercent,
        haigurePercent: 100 - gunPercent - noGunPercent
      }
    });
  });
  listen(noGunRatio, "input", () => {
    const noGunPercent = numberValue(noGunRatio);
    const gunPercent = Math.min(settings.brainwash.gunPercent, 100 - noGunPercent);
    save({
      ...settings,
      brainwash: {
        ...settings.brainwash,
        gunPercent,
        noGunPercent,
        haigurePercent: 100 - gunPercent - noGunPercent
      }
    });
  });
  listen(disorder, "input", () => {
    save({ ...settings, school: { ...settings.school, roomDisorderLevel: numberValue(disorder) } });
  });
  listen(spawn, "change", () => {
    save({
      ...settings,
      school: { ...settings.school, playerSpawn: spawn.value as V2PlayerSpawnSelection }
    });
  });
  listen(portrait, "change", () => {
    save({
      ...settings,
      character: { ...settings.character, portraitDirectory: portrait.value || null }
    });
  });
  listen(voice, "change", () => {
    save({
      ...settings,
      character: { ...settings.character, voiceDirectory: voice.value || null }
    });
  });
  for (const button of audioButtons) {
    listen(button, "click", () => {
      const channel = button.dataset.audioChannel as keyof V2TitleSettings["audio"];
      const action = button.dataset.audioAction;
      const current = settings.audio[channel];
      const next = action === "mute"
        ? 0
        : action === "increment"
          ? Math.min(10, current + 1)
          : Math.max(0, current - 1);
      save({ ...settings, audio: { ...settings.audio, [channel]: next } });
    });
  }
  listen(resetButton, "click", () => {
    render(store.reset());
  });

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
      for (const subscription of subscriptions) {
        subscription.target.removeEventListener(subscription.type, subscription.listener);
      }
      root.remove();
      disposed = true;
    }
  });
};
