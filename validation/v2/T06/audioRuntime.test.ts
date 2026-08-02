import {
  FreeCamera,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  AudioManager,
  type SpatialHandle,
  type SpatialPlayOptions
} from "../../../src/audio/audio";
import {
  V2_TITLE_SETTINGS_STORAGE_KEY,
  applyV2AudioVolumeLevels,
  createV2AudioAssetCatalogFromPublicPaths,
  createV2AudioVolumeSettingsStore,
  createV2GameplayAudioBridge,
  createV2VoiceRuntimeForAssetCatalog,
  resolveV2AudioCategoryGain,
  type V2AudioAssetCatalog,
  type V2AudioVolumeLevels
} from "../../../src/audio/v2AudioRuntime";
import type {
  V2CharacterState,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import type { V2CharacterAssignments } from "../../../src/v2/v2CharacterAssignments";
import {
  createV2GameplayAudioEventQueue
} from "../../../src/v2/gameplayAudioEventQueue";

import { assert, assertThrows, executeTest } from "./testUtils";

const SE_PUBLIC_PATHS = Object.freeze([
  "/public/audio/se/FlyingObject.mp3",
  "/public/audio/se/BeamShot_WavingPart.mp3",
  "/public/audio/se/aim.mp3",
  "/public/audio/se/BeamShotR_DownLong.mp3",
  "/public/audio/se/BeamShotR_Down.mp3",
  "/public/audio/se/BeamShotR_DownShort.mp3",
  "/public/audio/se/BeamShotR_Up.mp3",
  "/public/audio/se/BeamShotR_UpShort.mp3",
  "/public/audio/se/BeamShotR_UpHighShort.mp3",
  "/public/audio/se/BeamHit_Rev.mp3",
  "/public/audio/se/BeamHit_RevLong.mp3",
  "/public/audio/se/BeamHit_RevLongFast.mp3",
  "/public/audio/se/alarm.mp3"
]);

const createSpatialHandle = (): SpatialHandle => {
  let active = true;
  return {
    stop: () => {
      active = false;
    },
    isActive: () => active,
    setBaseVolume: () => {}
  };
};

const createSnapshot = (
  state: V2CharacterState,
  id = "player"
): V2HumanTargetSnapshot => {
  const footPosition = Vector3.Zero();
  const aimPosition = new Vector3(0, 1, 0);
  return Object.freeze({
    id,
    kind: id === "player" ? ("player" as const) : ("npc" as const),
    footPosition,
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: new Vector3(0.1, 0.2, 0.1)
    }),
    state,
    alive: state === "normal" || state === "evade",
    brainwashed:
      state.startsWith("brainwash-")
  });
};

const PLAYER_CHARACTER_ASSIGNMENTS: V2CharacterAssignments = Object.freeze([
  Object.freeze({
    actorId: "player",
    voiceProfileId: "01",
    portraitDirectory: "01_hgsv_mb"
  })
]);

const createVoiceAssetCatalog = (): V2AudioAssetCatalog =>
  Object.freeze({
    bgmUrls: Object.freeze([]),
    voiceDirectories: Object.freeze(["01_devil"]),
    resolveAssetUrl: (relativePath: string) => `/fixture/${relativePath}`,
    resolveVoiceUrl: (relativePath: string) =>
      `/fixture/audio/voice/${relativePath}`,
    isSeAvailable: () => true,
    isVoiceFileAvailable: () => true,
    selectBgmUrl: () => null
  });

export const runAudioRuntimeTests = async () =>
  Promise.all([
    executeTest("Gameplay Audio eventの一回drain", () => {
      const queue = createV2GameplayAudioEventQueue();
      const initialEmpty = queue.drain();
      queue.enqueue(
        Object.freeze({
          kind: "bit-target" as const,
          position: new Vector3(1, 0, 0)
        })
      );
      queue.enqueue(
        Object.freeze({
          kind: "beam-shot" as const,
          originKind: "player-gun" as const,
          position: new Vector3(2, 0, 0)
        })
      );
      queue.enqueue(
        Object.freeze({
          kind: "character-hit" as const,
          position: new Vector3(3, 0, 0)
        })
      );
      queue.enqueue(
        Object.freeze({
          kind: "alarm" as const,
          position: new Vector3(4, 0, 0)
        })
      );
      const first = queue.drain();
      const second = queue.drain();
      const third = queue.drain();
      assert(
        first.map((event) => event.kind).join(",") ===
          "bit-target,beam-shot,character-hit,alarm" &&
          Object.isFrozen(first) &&
          initialEmpty === second &&
          second === third &&
          second.length === 0,
        `一回drain後にイベントが残っています: first=${first.length}, second=${second.length}`
      );
      queue.dispose();
      return "4種を所有配列で1回取得し、空drainは同一singleton";
    }),
    executeTest("Gameplay Audio eventのclear・dispose", () => {
      const queue = createV2GameplayAudioEventQueue();
      queue.enqueue(
        Object.freeze({
          kind: "alarm" as const,
          position: Vector3.Zero()
        })
      );
      queue.clear();
      assert(
        queue.drain().length === 0,
        "clear後に未消費イベントが残っています。"
      );
      queue.enqueue(
        Object.freeze({
          kind: "character-hit" as const,
          position: Vector3.Zero()
        })
      );
      queue.dispose();
      assertThrows(
        () => queue.drain(),
        "dispose後のdrainが拒否されません。"
      );
      assertThrows(
        () =>
          queue.enqueue(
            Object.freeze({
              kind: "alarm" as const,
              position: Vector3.Zero()
            })
          ),
        "dispose後のenqueueが拒否されません。"
      );
      return "clearで未消費0件、dispose後の再利用を拒否";
    }),
    executeTest("正規化4種SEイベントの一回配送", () => {
      const played: Array<
        Readonly<{
          url: string;
          position: Vector3;
          options: SpatialPlayOptions;
        }>
      > = [];
      const dispatchedPositions: Vector3[] = [];
      const assets = createV2AudioAssetCatalogFromPublicPaths({
        baseUrl: "/fixture/",
        bgmPublicPaths: Object.freeze([]),
        sePublicPaths: SE_PUBLIC_PATHS,
        voicePublicPaths: Object.freeze([])
      });
      const bridge = createV2GameplayAudioBridge({
        audio: Object.freeze({
          playSe: (
            url: string,
            getPosition: () => Vector3,
            options: SpatialPlayOptions
          ) => {
            const position = getPosition();
            dispatchedPositions.push(position);
            played.push(
              Object.freeze({
                url,
                position: position.clone(),
                options
              })
            );
            return createSpatialHandle();
          }
        }),
        assets,
        getListenerPosition: () => Vector3.Zero()
      });
      try {
        const events = Object.freeze([
            Object.freeze({
              kind: "bit-target" as const,
              position: new Vector3(1, 0, 0)
            }),
            Object.freeze({
              kind: "beam-shot" as const,
              originKind: "player-gun",
              position: new Vector3(2, 0, 0)
            }),
            Object.freeze({
              kind: "character-hit" as const,
              position: new Vector3(3, 0, 0)
            }),
            Object.freeze({
              kind: "alarm" as const,
              position: new Vector3(4, 0, 0)
            })
          ]);
        bridge.dispatch(events);
        bridge.dispatch(Object.freeze([]));
        assert(
          played.length === 4,
          `4イベントが${played.length}回のSE再生になりました。`
        );
        assert(
          played[0].url.endsWith("/aim.mp3") &&
            played[1].url.includes("/BeamShotR_Down") &&
            played[2].url.includes("/BeamHit_Rev") &&
            played[3].url.endsWith("/alarm.mp3"),
          `SE種別とassetの対応が不正です: ${played
            .map((entry) => entry.url)
            .join(" | ")}`
        );
        assert(
          played.every(
            (entry, index) => entry.position.x === index + 1
          ) &&
            dispatchedPositions.every(
              (position, index) => position === events[index]?.position
            ),
          "SEイベントのworld位置が配送中に失われました。"
        );
        return "4種を各1回配送し、queue所有positionを二重cloneせず保持";
      } finally {
        bridge.dispose();
      }
    }),
    executeTest("Audio bridge破棄後の再配送拒否", () => {
      const assets = createV2AudioAssetCatalogFromPublicPaths({
        baseUrl: "/fixture/",
        bgmPublicPaths: Object.freeze([]),
        sePublicPaths: Object.freeze([]),
        voicePublicPaths: Object.freeze([])
      });
      const bridge = createV2GameplayAudioBridge({
        audio: Object.freeze({
          playSe: () => createSpatialHandle()
        }),
        assets,
        getListenerPosition: () => Vector3.Zero()
      });
      bridge.dispose();
      assertThrows(
        () => bridge.dispatch(Object.freeze([])),
        "破棄済みAudio bridgeのdispatchが拒否されません。"
      );
      return "dispose後のdispatchを例外として拒否";
    }),
    executeTest("VOICE状態遷移・ハイグレenter→loop", () => {
      const played: Array<
        Readonly<{
          url: string;
          loop: boolean;
          onEnded?: () => void;
          handle: SpatialHandle;
        }>
      > = [];
      const runtime = createV2VoiceRuntimeForAssetCatalog(
        {
          audio: Object.freeze({
            playVoice: (
              url: string,
              _getPosition: () => Vector3,
              options: SpatialPlayOptions
            ) => {
              const handle = createSpatialHandle();
              played.push(
                Object.freeze({
                  url,
                  loop: options.loop,
                  onEnded: options.onEnded,
                  handle
                })
              );
              return handle;
            }
          }),
          random: () => 0,
          assignments: PLAYER_CHARACTER_ASSIGNMENTS,
          baseOptions: Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: false
          }),
          loopOptions: Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: true
          })
        },
        createVoiceAssetCatalog()
      );
      try {
        runtime.update(0, true, Object.freeze([createSnapshot("normal")]));
        runtime.update(
          0,
          true,
          Object.freeze([createSnapshot("brainwash-in-progress")])
        );
        runtime.update(
          0,
          true,
          Object.freeze([createSnapshot("brainwash-complete-haigure")])
        );
        assert(
          played.length === 2 &&
            played[0].loop &&
            !played[1].loop &&
            played[1].onEnded !== undefined,
          `VOICE遷移のenter前再生列が不正です: ${played
            .map((entry) => `${entry.loop}:${entry.url}`)
            .join(" | ")}`
        );
        played[1].onEnded?.();
        const playedAfterEnter = [...played];
        assert(
          playedAfterEnter.length === 3 && playedAfterEnter[2].loop,
          "ハイグレenter終了後にloopへ接続されません。"
        );
        runtime.stopAll();
        assert(
          !playedAfterEnter[2].handle.isActive(),
          "VOICE stopAll後もloop handleがactiveです。"
        );
        return "洗脳中loop→ハイグレenter one-shot→ハイグレloopを接続";
      } finally {
        runtime.dispose();
      }
    }),
    executeTest("VOICE idle条件と停止中抑止", () => {
      let playCount = 0;
      const runtime = createV2VoiceRuntimeForAssetCatalog(
        {
          audio: Object.freeze({
            playVoice: () => {
              playCount += 1;
              return createSpatialHandle();
            }
          }),
          random: () => 0,
          assignments: PLAYER_CHARACTER_ASSIGNMENTS,
          baseOptions: Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: false
          }),
          loopOptions: Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: true
          })
        },
        createVoiceAssetCatalog()
      );
      try {
        const snapshots = Object.freeze([createSnapshot("normal")]);
        runtime.update(0, false, snapshots);
        runtime.update(16, false, snapshots);
        assert(
          playCount === 0,
          "allowIdle=falseでidle VOICEが再生されました。"
        );
        runtime.update(8, true, snapshots);
        const playCountAfterIdle = Number(playCount);
        assert(
          playCountAfterIdle === 1,
          `allowIdle=trueの期限到達でidle VOICEが1回再生されません: ${playCountAfterIdle}`
        );
        return "停止中0回、許可後のidle期限到達で1回再生";
      } finally {
        runtime.dispose();
      }
    }),
    executeTest("VOICEの明示Character割当", () => {
      const playedUrls: string[] = [];
      const playedPositions: Array<() => Vector3> = [];
      const runtime = createV2VoiceRuntimeForAssetCatalog(
        {
          audio: Object.freeze({
            playVoice: (url: string, getPosition: () => Vector3) => {
              playedUrls.push(url);
              playedPositions.push(getPosition);
              return createSpatialHandle();
            }
          }),
          random: () => 0,
          assignments: Object.freeze([
            Object.freeze({
              actorId: "npc-01",
              voiceProfileId: "02",
              portraitDirectory: "02_hgsv_mb"
            }),
            Object.freeze({
              actorId: "player",
              voiceProfileId: "01",
              portraitDirectory: "01_hgsv_mb"
            })
          ]),
          baseOptions: Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: false
          }),
          loopOptions: Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: true
          })
        },
        createVoiceAssetCatalog()
      );
      try {
        runtime.update(
          0,
          false,
          Object.freeze([
            createSnapshot("normal", "player"),
            createSnapshot("normal", "npc-01")
          ])
        );
        const playerHitSnapshot = createSnapshot("hit-a", "player");
        const npcHitSnapshot = createSnapshot("hit-a", "npc-01");
        runtime.update(
          0,
          false,
          Object.freeze([
            playerHitSnapshot,
            npcHitSnapshot
          ])
        );
        assert(
          playedUrls.length === 2 &&
            playedUrls[0].includes("/02_cool/") &&
            playedUrls[1].includes("/01_devil/") &&
            playedPositions[0]?.() === npcHitSnapshot.aimPosition &&
            playedPositions[1]?.() === playerHitSnapshot.aimPosition,
          `明示したactor→VOICE profileの対応が失われました: ${playedUrls.join(" | ")}`
        );
        return "明示割当順で再生し、最新snapshot位置をcopyせず参照";
      } finally {
        runtime.dispose();
      }
    }),
    executeTest("VOICE／BGM／SE音量0～10とMUTE", () => {
      const applied: Array<readonly [string, number]> = [];
      const levels: V2AudioVolumeLevels = Object.freeze({
        voice: 0,
        bgm: 10,
        se: 5
      });
      applyV2AudioVolumeLevels(
        Object.freeze({
          setCategoryVolume: (category: string, gain: number) => {
            applied.push(Object.freeze([category, gain]));
          }
        }) as Parameters<typeof applyV2AudioVolumeLevels>[0],
        levels
      );
      assert(
        resolveV2AudioCategoryGain("voice", 0) === 0 &&
          resolveV2AudioCategoryGain("bgm", 10) === 0.325 &&
          resolveV2AudioCategoryGain("se", 5) === 0.45,
        "音量levelからcategory gainへの変換が不正です。"
      );
      assert(
        JSON.stringify(applied) ===
          JSON.stringify([
            ["voice", 0],
            ["bgm", 0.325],
            ["se", 0.45]
          ]),
        `AudioManagerへの即時反映値が不正です: ${JSON.stringify(applied)}`
      );
      assertThrows(
        () => resolveV2AudioCategoryGain("voice", 11),
        "音量level 11が拒否されません。"
      );
      return "level 0をMUTE、10を既存base gain、5を50%として即時反映";
    }),
    executeTest("保存設定なしの既定音量は全category 0", () => {
      const store = createV2AudioVolumeSettingsStore({
        getItem: () => null,
        setItem: () => {
          throw new Error("保存設定なしのloadで書込みが発生しました。");
        }
      });
      const loaded = store.load();
      assert(
        loaded.voice === 0 && loaded.bgm === 0 && loaded.se === 0,
        `保存設定なしの既定音量が0ではありません: ${JSON.stringify(loaded)}`
      );
      return "VOICE／BGM／SEの既定値はすべて0";
    }),
    executeTest("音量保存と既存タイトル設定の保持", () => {
      const values = new Map<string, string>();
      values.set(
        V2_TITLE_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          language: "ja",
          volumeLevels: {
            voice: 4,
            bgm: 3,
            se: 2,
            futureCategory: 9
          }
        })
      );
      const store = createV2AudioVolumeSettingsStore({
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        }
      });
      const loaded = store.load();
      const muted = store.saveLevel(loaded, "voice", 0);
      const serialized = values.get(V2_TITLE_SETTINGS_STORAGE_KEY);
      const stored = serialized
        ? (JSON.parse(serialized) as {
            language?: unknown;
            volumeLevels?: Record<string, unknown>;
          })
        : null;
      assert(
        loaded.voice === 4 && loaded.bgm === 3 && loaded.se === 2,
        `保存済み3 categoryの読込値が不正です: ${JSON.stringify(loaded)}`
      );
      assert(
        muted.voice === 0 &&
          stored?.language === "ja" &&
          stored.volumeLevels?.voice === 0 &&
          stored.volumeLevels?.futureCategory === 9,
        `MUTE保存時に既存設定が失われました: ${serialized ?? "なし"}`
      );
      return "VOICEを0へ保存し、他category・未知field・既存タイトル設定を保持";
    }),
    executeTest("AudioManager disposeの全音声停止・Context終了", async () => {
      type FakeAudioNode = Readonly<{
        gain: { value: number };
        pan: { value: number };
        connect(destination: unknown): unknown;
        disconnect(): void;
        getDisconnectCount(): number;
      }>;

      const audioInstances: FakeAudioElement[] = [];
      const audioNodes: FakeAudioNode[] = [];
      const contexts: FakeAudioContext[] = [];

      const createAudioNode = (): FakeAudioNode => {
        let disconnectCount = 0;
        const node = Object.freeze({
          gain: { value: 1 },
          pan: { value: 0 },
          connect: (destination: unknown) => destination,
          disconnect: () => {
            disconnectCount += 1;
          },
          getDisconnectCount: () => disconnectCount
        });
        audioNodes.push(node);
        return node;
      };

      class FakeAudioElement extends EventTarget {
        preload = "";
        loop = false;
        src = "";
        currentTime = 0;
        error: MediaError | null = null;
        playCount = 0;
        pauseCount = 0;
        loadCount = 0;

        constructor() {
          super();
          audioInstances.push(this);
        }

        get currentSrc() {
          return this.src;
        }

        play() {
          this.playCount += 1;
          return Promise.resolve();
        }

        pause() {
          this.pauseCount += 1;
        }

        removeAttribute(name: string) {
          if (name === "src") {
            this.src = "";
          }
        }

        load() {
          this.loadCount += 1;
        }
      }

      class FakeAudioContext {
        state: AudioContextState = "suspended";
        readonly destination = Object.freeze({});
        resumeCount = 0;
        closeCount = 0;

        constructor() {
          contexts.push(this);
        }

        createGain() {
          return createAudioNode();
        }

        createStereoPanner() {
          return createAudioNode();
        }

        createMediaElementSource(_audio: FakeAudioElement) {
          return createAudioNode();
        }

        resume() {
          this.resumeCount += 1;
          this.state = "running";
          return Promise.resolve();
        }

        close() {
          this.closeCount += 1;
          this.state = "closed";
          return Promise.resolve();
        }
      }

      const originalAudio = window.Audio;
      const originalAudioContext = window.AudioContext;
      Object.defineProperty(window, "Audio", {
        configurable: true,
        writable: true,
        value: FakeAudioElement
      });
      Object.defineProperty(window, "AudioContext", {
        configurable: true,
        writable: true,
        value: FakeAudioContext
      });

      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06AudioDisposeCamera",
        Vector3.Zero(),
        scene
      );
      try {
        const manager = new AudioManager(camera);
        manager.startBgm("/fixture/bgm.mp3");
        const seHandle = manager.playSe(
          "/fixture/se.mp3",
          () => new Vector3(1, 0, 0),
          Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: false
          })
        );
        const voiceHandle = manager.playVoice(
          "/fixture/voice.wav",
          () => new Vector3(2, 0, 0),
          Object.freeze({
            volume: 1,
            maxDistance: 5,
            loop: true
          })
        );
        await manager.dispose();

        assert(
          contexts.length === 1 &&
            contexts[0].closeCount === 1 &&
            contexts[0].state === "closed",
          "AudioContextがdisposeで1回closeされません。"
        );
        assert(
          audioInstances.length === 49 &&
            audioInstances.reduce(
              (total, audio) => total + audio.playCount,
              0
            ) === 3,
          `BGM／SE／VOICEの生成・再生数が不正です: audio=${audioInstances.length}`
        );
        assert(
          audioInstances.every(
            (audio) =>
              audio.pauseCount >= 1 &&
              audio.loadCount === 1 &&
              audio.src === "" &&
              audio.currentTime === 0
          ),
          "dispose後にpause・src除去・load・再生位置resetされていない音声があります。"
        );
        assert(
          audioNodes.length > 0 &&
            audioNodes.every((node) => node.getDisconnectCount() === 1),
          "dispose後にWeb Audio nodeのdisconnect漏れがあります。"
        );
        assertThrows(
          () => seHandle.isActive(),
          "dispose後もSE handleを参照できました。"
        );
        assertThrows(
          () => voiceHandle.isActive(),
          "dispose後もVOICE handleを参照できました。"
        );
        assertThrows(
          () => manager.getCategoryVolume("bgm"),
          "dispose後もAudioManagerを参照できました。"
        );
        return "BGM＋32 SE＋16 VOICEを停止・切断し、AudioContextを1回close";
      } finally {
        Object.defineProperty(window, "Audio", {
          configurable: true,
          writable: true,
          value: originalAudio
        });
        Object.defineProperty(window, "AudioContext", {
          configurable: true,
          writable: true,
          value: originalAudioContext
        });
        scene.dispose();
        engine.dispose();
      }
    })
  ]);
