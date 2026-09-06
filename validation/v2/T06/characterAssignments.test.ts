import {
  V2_DEFAULT_PORTRAIT_DIRECTORY,
  createV2CharacterAssignments
} from "../../../src/v2/v2CharacterAssignments";
import {
  createV2CharacterSettingsPanel,
  createV2CharacterSettingsStore,
  createV2PortraitAssetInventoryFromPublicPaths
} from "../../../src/ui/v2CharacterSettings";
import {
  createSchoolRuntimeRandom
} from "../../../src/world/schoolRuntimeSettings";
import {
  V2_DEFAULT_TITLE_SETTINGS,
  V2_TITLE_SETTINGS_STORAGE_KEY,
  createV2TitleSettingsStore
} from "../../../src/v2TitleSettingsStore";

import { assert, executeTest } from "./testUtils";

const createStorage = (initialValue?: unknown) => {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set(
      V2_TITLE_SETTINGS_STORAGE_KEY,
      JSON.stringify(initialValue)
    );
  }
  let writeCount = 0;
  return Object.freeze({
    storage: Object.freeze({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        writeCount += 1;
        values.set(key, value);
      }
    }),
    read: () => {
      const serialized = values.get(V2_TITLE_SETTINGS_STORAGE_KEY);
      return serialized === undefined
        ? null
        : (JSON.parse(serialized) as Record<string, unknown>);
    },
    getWriteCount: () => writeCount
  });
};

export const runCharacterAssignmentTests = async () =>
  Promise.all([
    executeTest("Character割当のplayer先頭・NPC ID順", () => {
      const assignments = createV2CharacterAssignments({
        actorIds: Object.freeze([
          "npc-10",
          "player",
          "npc-02",
          "npc-01"
        ]),
        playerActorId: "player",
        voiceProfileIds: Object.freeze(["01", "02", "03", "04"]),
        portraitDirectories: Object.freeze([
          "01_hgsv_mb",
          "02_hgsv_mb",
          "03_hgsv_mb",
          "04_hgsv_mb",
          "15_hakase"
        ]),
        playerVoiceDirectory: "03_loli",
        playerPortraitDirectory: "15_hakase",
        random: () => 0
      });
      assert(
        assignments.map((assignment) => assignment.actorId).join(",") ===
          "player,npc-01,npc-02,npc-10",
        `actor割当順が不正です: ${assignments
          .map((assignment) => assignment.actorId)
          .join(",")}`
      );
      assert(
        assignments.map((assignment) => assignment.voiceProfileId).join(",") ===
          "03,02,04,01",
        `固定自ボイスとNPC未使用VOICE順が不正です: ${assignments
          .map((assignment) => assignment.voiceProfileId)
          .join(",")}`
      );
      assert(
        assignments[0].portraitDirectory === "15_hakase" &&
          assignments
            .slice(1)
            .every(
              (assignment) =>
                assignment.portraitDirectory.slice(0, 2) ===
                assignment.voiceProfileId
            ),
        "固定自キャラoverrideまたはVOICE先頭2桁portrait一致が不正です。"
      );
      return "player→npc-01→npc-02→npc-10、固定VOICE 03、固定portrait 15";
    }),
    executeTest("VOICE未使用優先・超過random・固定ID除外", () => {
      const assignments = createV2CharacterAssignments({
        actorIds: Object.freeze([
          "player",
          "npc-01",
          "npc-02",
          "npc-03",
          "npc-04",
          "npc-05",
          "npc-06"
        ]),
        playerActorId: "player",
        voiceProfileIds: Object.freeze(["01", "02", "03", "04"]),
        portraitDirectories: Object.freeze([
          "01_hgsv_mb",
          "02_hgsv_mb",
          "03_hgsv_mb",
          "04_hgsv_mb"
        ]),
        playerVoiceDirectory: "03_loli",
        playerPortraitDirectory: null,
        random: () => 0
      });
      const npcVoiceIds = assignments
        .slice(1)
        .map((assignment) => assignment.voiceProfileId);
      assert(
        new Set(npcVoiceIds.slice(0, 3)).size === 3 &&
          npcVoiceIds.every((voiceId) => voiceId !== "03") &&
          npcVoiceIds.slice(3).every((voiceId) => voiceId === "01"),
        `固定VOICE除外または超過randomが不正です: ${npcVoiceIds.join(",")}`
      );
      return "NPC先頭3人は未使用ID、超過3人は固定03を除くpoolからrandom";
    }),
    executeTest("portrait 0件の組込み00_default割当", () => {
      const assignments = createV2CharacterAssignments({
        actorIds: Object.freeze(["npc-01", "player"]),
        playerActorId: "player",
        voiceProfileIds: Object.freeze(["01", "02"]),
        portraitDirectories: Object.freeze([]),
        playerVoiceDirectory: null,
        playerPortraitDirectory: null,
        random: () => 0
      });
      assert(
        assignments.every(
          (assignment) =>
            assignment.portraitDirectory === V2_DEFAULT_PORTRAIT_DIRECTORY
        ),
        `portrait 0件で組込みdirectoryへ統一されません: ${assignments
          .map((assignment) => assignment.portraitDirectory)
          .join(",")}`
      );
      return "player／NPCを組込み00_defaultへ割当";
    }),
    executeTest("画像ありのplayer組込みdefault固定", () => {
      const assignments = createV2CharacterAssignments({
        actorIds: Object.freeze(["npc-01", "player"]),
        playerActorId: "player",
        voiceProfileIds: Object.freeze(["01", "02"]),
        portraitDirectories: Object.freeze([
          "01_hgsv_mb",
          "02_hgsv_mb"
        ]),
        playerVoiceDirectory: null,
        playerPortraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY,
        random: () => 0
      });
      assert(
        assignments[0]?.portraitDirectory ===
          V2_DEFAULT_PORTRAIT_DIRECTORY &&
          assignments[1]?.portraitDirectory === "01_hgsv_mb",
        `playerだけを組込みdefaultへ固定できません: ${assignments
          .map((assignment) => assignment.portraitDirectory)
          .join(",")}`
      );
      return "playerは00_default、NPCは実画像01_hgsv_mb";
    }),
    executeTest("portrait inventoryのdirectory列挙", () => {
      const inventory = createV2PortraitAssetInventoryFromPublicPaths(
        Object.freeze([
          "/public/picture/chara/02_hgsv_mb/normal.png",
          "/public/picture/chara/01_hgsv_mb/hit-a.webp",
          "/public/picture/chara/02_hgsv_mb/hit-b.png"
        ])
      );
      assert(
        inventory.directories.join(",") === "01_hgsv_mb,02_hgsv_mb",
        `portrait directoryの重複除去・安定sortが不正です: ${inventory.directories.join(",")}`
      );
      return "3 fileから2 directoryを安定sortして列挙";
    }),
    executeTest("Character設定のrandom既定値", () => {
      const fixture = createStorage();
      const settingsStore = createV2TitleSettingsStore(
        fixture.storage,
        { portraitDirectories: [V2_DEFAULT_PORTRAIT_DIRECTORY, "01_hgsv_mb"], voiceDirectories: ["01_devil"] }
      );
      settingsStore.load();
      const store = createV2CharacterSettingsStore(
        settingsStore,
        Object.freeze(["01_hgsv_mb"]),
        Object.freeze(["01_devil"])
      );
      const loaded = store.load();
      assert(
        loaded.portraitDirectory === null &&
          loaded.voiceDirectory === null &&
          loaded.enableCharacterSpriteVerticalAngle === true &&
          fixture.getWriteCount() === 0,
        `保存なしのrandom既定値または無書込み契約が不正です: ${JSON.stringify(loaded)}`
      );
      return "自キャラ／自ボイスはrandom、地面垂直表示true、load書込み0回";
    }),
    executeTest("Character縦角度の既存設定正規化・false保持", () => {
      const missingFixture = createStorage({
        ...V2_DEFAULT_TITLE_SETTINGS,
        display: {
          eyeHeightScale: 1.2,
          showGroundShadows: true
        },
        character: {
          portraitDirectory: null,
          voiceDirectory: null,
          futureCharacterField: "remove"
        }
      });
      const missingSettingsStore = createV2TitleSettingsStore(
        missingFixture.storage,
        { portraitDirectories: [V2_DEFAULT_PORTRAIT_DIRECTORY, "01_hgsv_mb"], voiceDirectories: ["01_devil"] }
      );
      const missingStore = createV2CharacterSettingsStore(
        missingSettingsStore,
        Object.freeze(["01_hgsv_mb"]),
        Object.freeze(["01_devil"])
      );
      missingSettingsStore.load();
      const normalized = missingStore.load();
      const normalizedRoot = missingFixture.read() as {
        display?: Record<string, unknown>;
        character?: Record<string, unknown>;
      };
      const falseFixture = createStorage({
        ...V2_DEFAULT_TITLE_SETTINGS,
        display: {
          ...V2_DEFAULT_TITLE_SETTINGS.display,
          enableCharacterSpriteVerticalAngle: false
        },
        character: {
          portraitDirectory: null,
          voiceDirectory: null
        }
      });
      const falseSettingsStore = createV2TitleSettingsStore(
        falseFixture.storage,
        { portraitDirectories: [V2_DEFAULT_PORTRAIT_DIRECTORY, "01_hgsv_mb"], voiceDirectories: ["01_devil"] }
      );
      const falseStore = createV2CharacterSettingsStore(
        falseSettingsStore,
        Object.freeze(["01_hgsv_mb"]),
        Object.freeze(["01_devil"])
      );
      falseSettingsStore.load();
      const loadedFalse = falseStore.load();
      assert(
        normalized.enableCharacterSpriteVerticalAngle === true &&
          normalizedRoot.display
            ?.enableCharacterSpriteVerticalAngle === true &&
          normalizedRoot.character?.futureCharacterField === undefined &&
          missingFixture.getWriteCount() === 1 &&
          loadedFalse.enableCharacterSpriteVerticalAngle === false &&
          falseFixture.getWriteCount() === 0,
        `縦角度の正規化またはfalse保持が不正です: ${JSON.stringify({
          normalized,
          normalizedRoot,
          loadedFalse
        })}`
      );
      return "未設定だけtrueへ1回正規化し、保存済みfalseを保持、未知fieldを削除";
    }),
    executeTest("Character設定保存時の既存field保持", () => {
      const fixture = createStorage({
        ...V2_DEFAULT_TITLE_SETTINGS,
        audio: { voice: 4, bgm: 3, se: 2, futureCategory: 9 },
        character: {
          portraitDirectory: "missing",
          voiceDirectory: "02_cool"
        },
        futureField: true
      });
      const settingsStore = createV2TitleSettingsStore(
        fixture.storage,
        { portraitDirectories: [V2_DEFAULT_PORTRAIT_DIRECTORY, "01_hgsv_mb"], voiceDirectories: ["01_devil", "02_cool"] }
      );
      settingsStore.load();
      const store = createV2CharacterSettingsStore(
        settingsStore,
        Object.freeze(["01_hgsv_mb"]),
        Object.freeze(["01_devil", "02_cool"])
      );
      const loaded = store.load();
      store.save(
        Object.freeze({
          portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY,
          voiceDirectory: null,
          enableCharacterSpriteVerticalAngle: false
        })
      );
      const stored = fixture.read() as {
        audio?: Record<string, unknown>;
        character?: Record<string, unknown>;
        display?: Record<string, unknown>;
        futureField?: unknown;
      };
      assert(
          loaded.portraitDirectory === null &&
          loaded.voiceDirectory === "02_cool" &&
          stored.audio?.voice === 4 &&
          stored.audio?.futureCategory === undefined &&
          stored.futureField === undefined &&
          stored.character?.portraitDirectory ===
            V2_DEFAULT_PORTRAIT_DIRECTORY &&
          stored.character?.voiceDirectory === null &&
          stored.display?.enableCharacterSpriteVerticalAngle === false,
        `Character部分保存で既存設定が失われました: ${JSON.stringify(stored)}`
      );
      return "組込みdefaultと縦角度falseを保存し、音量を保持、未知fieldを削除";
    }),
    executeTest("Character割当の再生成境界", () => {
      const options = Object.freeze({
        actorIds: Object.freeze(["player", "npc-01", "npc-02"]),
        playerActorId: "player",
        voiceProfileIds: Object.freeze(["01", "02", "03"]),
        portraitDirectories: Object.freeze([
          "01_hgsv_mb",
          "02_hgsv_mb",
          "03_hgsv_mb"
        ]),
        playerVoiceDirectory: null,
        playerPortraitDirectory: null
      });
      const firstSession = createV2CharacterAssignments({
        ...options,
        random: () => 0
      });
      const startedSession = firstSession;
      const replayedExecution = startedSession;
      const nextSession = createV2CharacterAssignments({
        ...options,
        random: () => 0.999
      });
      assert(
        firstSession === startedSession &&
          startedSession === replayedExecution &&
          firstSession[0]?.voiceProfileId !==
            nextSession[0]?.voiceProfileId,
        "開始クリック／公開処刑Rで割当が再生成されたか、新sessionで再生成されません。"
      );
      return "開始・公開処刑Rは同一割当を再利用し、新session生成だけ再抽選";
    }),
    executeTest("Character割当のsession seed決定性と独立系列", () => {
      const options = Object.freeze({
        actorIds: Object.freeze([
          "player",
          "npc-01",
          "npc-02",
          "npc-03",
          "npc-04"
        ]),
        playerActorId: "player",
        voiceProfileIds: Object.freeze(["01", "02", "03", "04"]),
        portraitDirectories: Object.freeze([
          "01_hgsv_mb",
          "02_hgsv_mb",
          "03_hgsv_mb",
          "04_hgsv_mb"
        ]),
        playerVoiceDirectory: null,
        playerPortraitDirectory: null
      });
      const createAssignments = (seed: number) =>
        createV2CharacterAssignments({
          ...options,
          random: createSchoolRuntimeRandom(
            seed,
            "character-assignment"
          )
        });
      const first = createAssignments(0x5430_0601);
      const repeated = createAssignments(0x5430_0601);
      const next = createAssignments(0x5430_0602);
      const signature = (assignments: typeof first) =>
        assignments
          .map(
            (assignment) =>
              `${assignment.actorId}:${assignment.voiceProfileId}:${assignment.portraitDirectory}`
          )
          .join("|");
      assert(
        signature(first) === signature(repeated) &&
          signature(first) !== signature(next),
        "Character割当がsession seedで再現されないか、異なるseedでも固定されています。"
      );
      return "同一session seedは同一割当、異なるseedは別割当";
    }),
    executeTest("Character設定panelのrandom先頭・portrait非表示", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      let changedVoiceDirectory: string | null | undefined;
      const panel = createV2CharacterSettingsPanel({
        parent: host,
        initialSettings: Object.freeze({
          portraitDirectory: null,
          voiceDirectory: null,
          enableCharacterSpriteVerticalAngle: true
        }),
        portraitDirectories: Object.freeze([]),
        voiceDirectories: Object.freeze(["01_devil", "02_cool"]),
        onChange: (settings) => {
          changedVoiceDirectory = settings.voiceDirectory;
        }
      });
      try {
        const portraitRow = panel.root.querySelector(
          '[data-ui="v2-player-portrait-select-row"]'
        );
        const voiceSelect = panel.root.querySelector<HTMLSelectElement>(
          '[data-ui="v2-player-voice-select"]'
        );
        assert(
          portraitRow === null &&
            voiceSelect !== null &&
            voiceSelect.options[0]?.textContent === "ランダム選択" &&
            voiceSelect.value === "" &&
            panel.root.classList.contains("title-right-panels"),
          "portrait 0件非表示、random先頭、右下panel classのいずれかが不正です。"
        );
        voiceSelect.value = "02_cool";
        voiceSelect.dispatchEvent(new Event("change"));
        assert(
          changedVoiceDirectory === "02_cool" &&
            panel.getSettings().voiceDirectory === "02_cool",
          "自ボイスselect変更が即時通知されません。"
        );
        return "自キャラrow非表示、右下自ボイスselectはrandom先頭から02へ即時変更";
      } finally {
        panel.dispose();
        host.remove();
      }
    }),
    executeTest("Character設定panelの組込みdefault選択", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      let changedPortraitDirectory: string | null | undefined;
      const panel = createV2CharacterSettingsPanel({
        parent: host,
        initialSettings: Object.freeze({
          portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY,
          voiceDirectory: null,
          enableCharacterSpriteVerticalAngle: true
        }),
        portraitDirectories: Object.freeze([
          "01_hgsv_mb",
          "02_hgsv_mb"
        ]),
        voiceDirectories: Object.freeze(["01_devil"]),
        onChange: (settings) => {
          changedPortraitDirectory = settings.portraitDirectory;
        }
      });
      try {
        const portraitSelect = panel.root.querySelector<HTMLSelectElement>(
          '[data-ui="v2-player-portrait-select"]'
        );
        assert(
          portraitSelect !== null &&
            [...portraitSelect.options]
              .map((option) => option.textContent)
              .join(",") ===
              "ランダム選択,デフォルトスプライト,01_hgsv_mb,02_hgsv_mb" &&
            portraitSelect.value === V2_DEFAULT_PORTRAIT_DIRECTORY,
          "自キャラselectの組込みdefault順または選択状態が不正です。"
        );
        portraitSelect.value = "02_hgsv_mb";
        portraitSelect.dispatchEvent(new Event("change"));
        assert(
          changedPortraitDirectory === "02_hgsv_mb" &&
            panel.getSettings().portraitDirectory === "02_hgsv_mb",
          "自キャラselectの実画像変更が即時通知されません。"
        );
        return "random→default→実画像の順で表示し、defaultと実画像を選択可能";
      } finally {
        panel.dispose();
        host.remove();
      }
    }),
    executeTest("Character設定panelの地面垂直表示切替", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      let changedVerticalAngle: boolean | undefined;
      const panel = createV2CharacterSettingsPanel({
        parent: host,
        initialSettings: Object.freeze({
          portraitDirectory: null,
          voiceDirectory: null,
          enableCharacterSpriteVerticalAngle: true
        }),
        portraitDirectories: Object.freeze([]),
        voiceDirectories: Object.freeze([]),
        onChange: (settings) => {
          changedVerticalAngle =
            settings.enableCharacterSpriteVerticalAngle;
        }
      });
      try {
        const checkbox = panel.root.querySelector<HTMLInputElement>(
          '[data-ui="v2-character-sprite-vertical-angle-checkbox"]'
        );
        const row = panel.root.querySelector<HTMLElement>(
          '[data-ui="v2-character-sprite-vertical-angle-row"]'
        );
        assert(
          checkbox !== null &&
            checkbox.checked &&
            row?.textContent === "キャラ画像を地面に垂直表示",
          "地面垂直表示checkboxの既定状態または説明が不正です。"
        );
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change"));
        assert(
          changedVerticalAngle === false &&
            panel.getSettings().enableCharacterSpriteVerticalAngle === false,
          "地面垂直表示checkboxの変更が即時通知されません。"
        );
        panel.setSettings(
          Object.freeze({
            portraitDirectory: null,
            voiceDirectory: null,
            enableCharacterSpriteVerticalAngle: true
          })
        );
        assert(
          checkbox.checked,
          "setSettingsで地面垂直表示checkboxが更新されません。"
        );
        return "既定true、checkbox false通知、setSettings true反映";
      } finally {
        panel.dispose();
        host.remove();
      }
    })
  ]);
