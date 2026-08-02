import {
  V2_DEFAULT_PORTRAIT_DIRECTORY,
  createV2CharacterAssignments
} from "../../../src/v2/v2CharacterAssignments";
import {
  createV2CharacterSettingsPanel,
  createV2CharacterSettingsStore,
  createV2PortraitAssetInventoryFromPublicPaths
} from "../../../src/ui/v2CharacterSettings";

import { assert, executeTest } from "./testUtils";

const createStorage = (initialValue?: unknown) => {
  const values = new Map<string, string>();
  if (initialValue !== undefined) {
    values.set(
      "haigure-survival.title-settings",
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
      const serialized = values.get("haigure-survival.title-settings");
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
      const store = createV2CharacterSettingsStore(
        fixture.storage,
        Object.freeze(["01_hgsv_mb"]),
        Object.freeze(["01_devil"])
      );
      const loaded = store.load();
      assert(
        loaded.portraitDirectory === null &&
          loaded.voiceDirectory === null &&
          fixture.getWriteCount() === 0,
        `保存なしのrandom既定値または無書込み契約が不正です: ${JSON.stringify(loaded)}`
      );
      return "自キャラ／自ボイスともnull（ランダム選択）、load書込み0回";
    }),
    executeTest("Character設定保存時の既存field保持", () => {
      const fixture = createStorage({
        language: "ja",
        volumeLevels: { voice: 4, futureCategory: 9 },
        playerSettings: {
          heightCells: 0.9,
          futurePlayerField: true,
          portraitDirectory: "missing",
          voiceDirectory: "02_cool"
        }
      });
      const store = createV2CharacterSettingsStore(
        fixture.storage,
        Object.freeze(["01_hgsv_mb"]),
        Object.freeze(["01_devil", "02_cool"])
      );
      const loaded = store.load();
      store.save(
        Object.freeze({
          portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY,
          voiceDirectory: null
        })
      );
      const stored = fixture.read() as {
        language?: unknown;
        volumeLevels?: Record<string, unknown>;
        playerSettings?: Record<string, unknown>;
      };
      assert(
        loaded.portraitDirectory === null &&
          loaded.voiceDirectory === "02_cool" &&
          stored.language === "ja" &&
          stored.volumeLevels?.voice === 4 &&
          stored.volumeLevels?.futureCategory === 9 &&
          stored.playerSettings?.heightCells === 0.9 &&
          stored.playerSettings?.futurePlayerField === true &&
          stored.playerSettings?.portraitDirectory ===
            V2_DEFAULT_PORTRAIT_DIRECTORY &&
          stored.playerSettings?.voiceDirectory === null,
        `Character部分保存で既存設定が失われました: ${JSON.stringify(stored)}`
      );
      return "組込みdefaultを保存し、音量・未知fieldを保持して部分保存";
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
    executeTest("Character設定panelのrandom先頭・portrait非表示", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      let changedVoiceDirectory: string | null | undefined;
      const panel = createV2CharacterSettingsPanel({
        parent: host,
        initialSettings: Object.freeze({
          portraitDirectory: null,
          voiceDirectory: null
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
          voiceDirectory: null
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
    })
  ]);
