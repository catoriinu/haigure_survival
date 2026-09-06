import {
  FreeCamera,
  MeshBuilder,
  NullEngine,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";

import type { StageDoorInteractionCandidate } from "../../../src/world/stageDoorRuntime";
import type { V2NpcCommandCandidate } from "../../../src/v2/npcSystem";
import { V2_PLAYER_BASE_EYE_HEIGHT } from "../../../src/v2/playerController";
import type { V2BroadcastInteractionCandidate } from "../../../src/v2/runtimeInteraction";
import {
  canV2RuntimePlayerFire,
  createV2RuntimeHudController as createV2RuntimeHudControllerBase,
  type V2RuntimeHudFrame
} from "../../../src/ui/v2RuntimeHud";

import { assert, assertThrows, executeTest } from "./testUtils";

const createV2RuntimeHudController = (
  options: Parameters<typeof createV2RuntimeHudControllerBase>[0]
) => {
  const controller = createV2RuntimeHudControllerBase(options);
  return Object.freeze({
    update: (
      update: Omit<
        Parameters<typeof controller.update>[0],
        "broadcastCandidate"
      >
    ) =>
      controller.update(
        Object.freeze({ ...update, broadcastCandidate: null })
      ),
    clear: controller.clear,
    dispose: controller.dispose
  });
};

const createNpcCandidate = (
  commandMode: V2NpcCommandCandidate["commandMode"] = "none",
  npcId = "npc-first"
): V2NpcCommandCandidate =>
  Object.freeze({
    npcId,
    aimPosition: Vector3.Zero(),
    distanceMeters: 0.5,
    aimAngleRadians: 0,
    commandMode
  });

const getRole = (host: HTMLElement, role: string) => {
  const element = host.querySelector<HTMLElement>(
    `[data-v2-runtime-hud-role="${role}"]`
  );
  if (!element) {
    throw new Error(`HUD roleがありません: ${role}`);
  }
  return element;
};

const countVisibleHudRoots = (host: HTMLElement) =>
  [
    "npc-target",
    "door-target",
    "completion-guide",
    "crosshair",
    "fire-guide"
  ].filter((role) => !getRole(host, role).hidden).length;

export const runRuntimeHudTests = async () =>
  Promise.all([
    executeTest("候補・状態別HUD同期と即時clear", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06HudCamera",
        new Vector3(0, 0, -5),
        scene
      );
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;
      const host = document.createElement("div");
      const canvas = document.createElement("canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => new DOMRect(100, 50, 800, 450)
      });
      host.appendChild(canvas);
      document.body.appendChild(host);

      const doorNode = new TransformNode("T06HudDoor", scene);
      const sweepMesh = MeshBuilder.CreateBox(
        "T06HudDoorSweep",
        { size: 0.1 },
        scene
      );
      const doorCandidate = Object.freeze({
        door: Object.freeze({
          id: "door-first",
          doorClass: "room" as const,
          node: doorNode,
          panels: Object.freeze([]),
          sweepId: "door-first-sweep",
          sweepMesh,
          elevatorId: null,
          stopId: null
        }),
        interactionPosition: Vector3.Zero(),
        angleRadians: 0,
        distanceMeters: 0.5
      }) satisfies StageDoorInteractionCandidate;
      const hud = createV2RuntimeHudController({
        host,
        canvas,
        camera
      });
      try {
        scene.render();
        hud.update({
          active: true,
          frame: Object.freeze({
            phase: "playing" as const,
            playerState: "brainwash-complete-gun" as const,
            playerCompletionUnlocked: true,
            executionPlayerRole: null
          }),
          npcCandidates: Object.freeze([createNpcCandidate()]),
          doorCandidates: Object.freeze([doorCandidate]),
          feedback: Object.freeze([])
        });
        assert(
          !getRole(host, "npc-target").hidden &&
            !getRole(host, "door-target").hidden,
          "先頭NPCまたは扉候補のhighlightが表示されません。"
        );
        assert(
            !getRole(host, "completion-guide").hidden &&
            !getRole(host, "crosshair").hidden &&
            getRole(host, "fire-guide").hidden &&
            getRole(host, "completion-guide").textContent ===
              "G：銃あり 左クリック：発射  N：銃なし  H：ハイグレポーズ",
          "解放済みgun状態の下部統合案内・照準・単独発射案内非表示が同期しません。"
        );

        hud.update({
          active: true,
          frame: Object.freeze({
            phase: "playing" as const,
            playerState: "brainwash-complete-no-gun" as const,
            playerCompletionUnlocked: true,
            executionPlayerRole: null
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([]),
          feedback: Object.freeze([])
        });
        assert(
          getRole(host, "npc-target").hidden &&
            getRole(host, "door-target").hidden,
          "候補消失後にhighlightが残っています。"
        );
        assert(
          !getRole(host, "completion-guide").hidden &&
            getRole(host, "crosshair").hidden &&
            getRole(host, "fire-guide").hidden,
          "no-gun状態で照準または射撃案内が残っています。"
        );

        hud.clear();
        const visibleAfterClear = countVisibleHudRoots(host);
        assert(
          visibleAfterClear === 0,
          `clear後に${visibleAfterClear}要素が表示中です。`
        );

        hud.update({
          active: false,
          frame: Object.freeze({
            phase: "playing" as const,
            playerState: "normal" as const,
            playerCompletionUnlocked: false,
            executionPlayerRole: null
          }),
          npcCandidates: Object.freeze([createNpcCandidate()]),
          doorCandidates: Object.freeze([doorCandidate]),
          feedback: Object.freeze([])
        });
        assert(
          countVisibleHudRoots(host) === 0,
          "Pointer Lock解除相当のinactive更新でHUDが消えません。"
        );

        hud.update({
          active: false,
          frame: Object.freeze({
            phase: "playing" as const,
            playerState: "brainwash-complete-no-gun" as const,
            playerCompletionUnlocked: true,
            executionPlayerRole: null
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([]),
          feedback: Object.freeze([])
        });
        assert(
          countVisibleHudRoots(host) === 0 &&
            host.querySelector('[data-v2-runtime-hud-role="retry-guide"]') === null,
          "Pointer Lock解除後または中央HUDにR案内が残っています。"
        );

        hud.update({
          active: false,
          frame: Object.freeze({
            phase: "execution-complete" as const,
            playerState: "brainwash-complete-gun" as const,
            playerCompletionUnlocked: false,
            executionPlayerRole: "shooter" as const
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([]),
          feedback: Object.freeze([])
        });
        assert(
          countVisibleHudRoots(host) === 0,
          "公開処刑完了状態の中央HUDにR案内が表示されました。"
        );

        hud.update({
          active: true,
          frame: Object.freeze({
            phase: "execution" as const,
            playerState: "normal" as const,
            playerCompletionUnlocked: false,
            executionPlayerRole: "shooter" as const
          }),
          npcCandidates: Object.freeze([createNpcCandidate()]),
          doorCandidates: Object.freeze([doorCandidate]),
          feedback: Object.freeze([])
        });
        assert(
          countVisibleHudRoots(host) === 2 &&
            !getRole(host, "crosshair").hidden &&
            !getRole(host, "fire-guide").hidden &&
            getRole(host, "fire-guide").textContent ===
              "左クリック：発射" &&
            getRole(host, "fire-guide").style.top ===
              getRole(host, "completion-guide").style.top &&
            getRole(host, "npc-target").hidden &&
            getRole(host, "door-target").hidden &&
            canV2RuntimePlayerFire(
              Object.freeze({
                phase: "execution" as const,
                playerState: "normal" as const,
                playerCompletionUnlocked: false,
                executionPlayerRole: "shooter" as const
              })
            ),
          "公開処刑射手の照準と画面下部の発射案内だけが表示されません。"
        );

        for (const executionPlayerRole of [
          "target",
          "observer"
        ] as const) {
          hud.update({
            active: true,
            frame: Object.freeze({
              phase: "execution" as const,
              playerState: "brainwash-complete-gun" as const,
              playerCompletionUnlocked: false,
              executionPlayerRole
            }),
            npcCandidates: Object.freeze([createNpcCandidate()]),
            doorCandidates: Object.freeze([doorCandidate]),
            feedback: Object.freeze([])
          });
          assert(
            countVisibleHudRoots(host) === 0 &&
              !canV2RuntimePlayerFire(
                Object.freeze({
                  phase: "execution" as const,
                  playerState: "brainwash-complete-gun" as const,
                  playerCompletionUnlocked: false,
                  executionPlayerRole
                })
              ),
            `公開処刑${executionPlayerRole}に照準または対象markerが表示されました。`
          );
        }

        hud.update({
          active: false,
          frame: Object.freeze({
            phase: "execution" as const,
            playerState: "normal" as const,
            playerCompletionUnlocked: false,
            executionPlayerRole: "shooter" as const
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([]),
          feedback: Object.freeze([])
        });
        assert(
          countVisibleHudRoots(host) === 0,
          "Pointer Lock解除中の公開処刑射手に照準が表示されました。"
        );
        return "候補・状態案内・公開処刑射手照準・inactive・中央R案内なし・clearをDOMへ同期";
      } finally {
        hud.dispose();
        host.remove();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("Playerモードの色・切替発光と残光解除", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06HudPlayerModeCamera",
        new Vector3(0, 0, -5),
        scene
      );
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;
      const host = document.createElement("div");
      const canvas = document.createElement("canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => new DOMRect(0, 0, 800, 450)
      });
      host.appendChild(canvas);
      document.body.appendChild(host);
      const hud = createV2RuntimeHudController({ host, canvas, camera });
      try {
        scene.render();
        const guide = getRole(host, "completion-guide");
        const colors = {
          gun: "rgb(156, 255, 87)",
          "no-gun": "rgb(97, 232, 255)",
          haigure: "rgb(255, 209, 102)"
        } as const;
        const options = (["gun", "no-gun", "haigure"] as const).map((mode) => {
          const label = guide.querySelector<HTMLElement>(
            `span[data-v2-runtime-hud-mode="${mode}"]`
          );
          assert(label !== null, `${mode}の操作案内がありません。`);
          return { mode, label };
        });
        const update = (
          playerState: V2RuntimeHudFrame["playerState"],
          active = true
        ) => hud.update({
          active,
          frame: Object.freeze({
            phase: "playing" as const,
            playerState,
            playerCompletionUnlocked: true,
            executionPlayerRole: null
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([]),
          feedback: Object.freeze([])
        });
        const assertMode = (mode: keyof typeof colors) => {
          assert(
            !guide.hidden && guide.dataset.v2RuntimeHudMode === mode &&
              guide.style.color === colors[mode] &&
              guide.style.borderColor === colors[mode],
            `${mode}の表示・選択モード・枠色が一致しません。`
          );
          for (const option of options) {
            assert(
              option.label.style.color === (
                option.mode === mode ? colors[mode] : "rgb(245, 245, 245)"
              ),
              `${mode}選択中の${option.mode}案内色が不正です。`
            );
          }
        };
        const assertNoFeedback = (context: string) => assert(
          guide.dataset.v2RuntimeHudFeedback === undefined &&
            guide.style.animation === "",
          `${context}で発光が残っています。`
        );

        update("brainwash-complete-gun");
        assertMode("gun");
        assertNoFeedback("初回表示");
        update("brainwash-complete-gun");
        assertNoFeedback("初回と同じモードの継続");

        update("brainwash-complete-no-gun");
        assertMode("no-gun");
        const noGunFeedback = guide.dataset.v2RuntimeHudFeedback;
        const noGunAnimation = guide.style.animation;
        assert(
          noGunFeedback !== undefined && noGunAnimation.includes("180ms"),
          "gunからno-gunへの切替で180ms発光がありません。"
        );
        for (let frame = 0; frame < 3; frame += 1) {
          update("brainwash-complete-no-gun");
        }
        assert(
          guide.dataset.v2RuntimeHudFeedback === noGunFeedback &&
            guide.style.animation === noGunAnimation,
          "同一モードの連続更新で発光を再開始しました。"
        );

        update("brainwash-in-progress");
        assertMode("haigure");
        const haigureFeedback = guide.dataset.v2RuntimeHudFeedback;
        const haigureAnimation = guide.style.animation;
        assert(
          haigureFeedback !== undefined && haigureFeedback !== noGunFeedback &&
            haigureAnimation.includes("180ms") && haigureAnimation !== noGunAnimation,
          "no-gunから洗脳進行への切替で新しい発光がありません。"
        );
        for (const state of [
          "brainwash-complete-haigure",
          "brainwash-complete-haigure-formation"
        ] as const) {
          update(state);
          assertMode("haigure");
          assert(
            guide.dataset.v2RuntimeHudFeedback === haigureFeedback &&
              guide.style.animation === haigureAnimation,
            `${state}を洗脳進行とは別モードとして再発光しました。`
          );
        }

        hud.clear();
        assert(guide.hidden, "clear後に操作案内が表示されています。");
        assertNoFeedback("clear後");
        update("brainwash-complete-no-gun");
        assertMode("no-gun");
        assertNoFeedback("clear後の初回表示");
        update("brainwash-complete-gun");
        assertMode("gun");
        assert(
          guide.dataset.v2RuntimeHudFeedback !== undefined &&
            guide.style.animation.includes("180ms"),
          "clear後のモード切替が発光しません。"
        );
        update("brainwash-complete-gun", false);
        assert(guide.hidden, "inactive後に操作案内が表示されています。");
        assertNoFeedback("inactive後");
        update("brainwash-in-progress");
        assertMode("haigure");
        assertNoFeedback("inactive後の初回表示");
        return "3色と非選択色・枠色、180ms切替発光、同一モード維持、clear/inactive解除";
      } finally {
        hud.dispose();
        host.remove();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("NPC mode色とF／E／C成功Feedback", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06HudFeedbackCamera",
        new Vector3(0, 0, -5),
        scene
      );
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;
      const host = document.createElement("div");
      const canvas = document.createElement("canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => new DOMRect(0, 0, 800, 450)
      });
      host.appendChild(canvas);
      document.body.appendChild(host);
      const doorCandidate = Object.freeze({
        door: Object.freeze({ id: "door-feedback" }) as
          StageDoorInteractionCandidate["door"],
        interactionPosition: Vector3.Zero(),
        angleRadians: 0,
        distanceMeters: 0.5
      });
      const frame = Object.freeze({
        phase: "playing" as const,
        playerState: "normal" as const,
        playerCompletionUnlocked: false,
        executionPlayerRole: null
      });
      const hud = createV2RuntimeHudController({
        host,
        canvas,
        camera
      });
      try {
        scene.render();
        const updateNpc = (
          commandMode: V2NpcCommandCandidate["commandMode"],
          feedback: Parameters<typeof hud.update>[0]["feedback"],
          npcId = "npc-first"
        ) =>
          hud.update({
            active: true,
            frame,
            npcCandidates: Object.freeze([
              createNpcCandidate(commandMode, npcId)
            ]),
            doorCandidates: Object.freeze([]),
            feedback
          });
        const npcMarker = getRole(host, "npc-target");
        updateNpc("none", Object.freeze([]));
        assert(
          String(npcMarker.dataset.v2RuntimeHudColor) === "#61e8ff",
          "未指示NPCが水色ではありません。"
        );
        updateNpc("leave", Object.freeze([]));
        assert(
          String(npcMarker.dataset.v2RuntimeHudColor) === "#61e8ff",
          "Leave NPCが水色ではありません。"
        );
        updateNpc(
          "none",
          Object.freeze([
            Object.freeze({
              kind: "npc-command-changed" as const,
              npcId: "npc-first",
              commandMode: "follow" as const
            })
          ])
        );
        const firstAnimation = npcMarker.style.animation;
        assert(
          String(npcMarker.dataset.v2RuntimeHudColor) === "#9cff57" &&
            firstAnimation.includes("180ms") &&
            npcMarker.dataset.v2RuntimeHudFeedback !== undefined,
          "Follow成功時に黄緑または180ms発光が適用されません。"
        );
        updateNpc(
          "follow",
          Object.freeze([
            Object.freeze({
              kind: "npc-command-changed" as const,
              npcId: "npc-first",
              commandMode: "leave" as const
            })
          ])
        );
        assert(
          String(npcMarker.dataset.v2RuntimeHudColor) === "#61e8ff" &&
            npcMarker.style.animation !== firstAnimation,
          "連続成功時に色変更または発光再始動が行われません。"
        );
        updateNpc("none", Object.freeze([]), "npc-second");
        assert(
          npcMarker.style.animation === "" &&
            npcMarker.dataset.v2RuntimeHudFeedback === undefined,
          "NPC候補ID変更後に発光が残っています。"
        );

        hud.update({
          active: true,
          frame,
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([doorCandidate]),
          feedback: Object.freeze([
            Object.freeze({
              kind: "door-toggle-started" as const,
              doorId: "door-feedback",
              state: "opening" as const
            })
          ])
        });
        const doorMarker = getRole(host, "door-target");
        assert(
          String(doorMarker.dataset.v2RuntimeHudColor) === "#ffd166" &&
            doorMarker.style.animation.includes("180ms"),
          "扉開閉開始時に黄色の180ms発光が適用されません。"
        );
        hud.clear();
        assert(
          doorMarker.hidden &&
            doorMarker.style.animation === "" &&
            doorMarker.dataset.v2RuntimeHudFeedback === undefined,
          "clear後に扉Feedbackが残っています。"
        );
        return "none／leave水色、follow黄緑、成功時180ms発光、対象変更・clear残留0";
      } finally {
        hud.dispose();
        host.remove();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("放送F/Eの最終押下色・180ms発光・対象変更reset", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06BroadcastHudFeedbackCamera",
        new Vector3(0, 0, -5),
        scene
      );
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;
      const host = document.createElement("div");
      const canvas = document.createElement("canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => new DOMRect(0, 0, 800, 450)
      });
      host.appendChild(canvas);
      document.body.appendChild(host);
      const hud = createV2RuntimeHudControllerBase({ host, canvas, camera });
      const frame = Object.freeze({
        phase: "playing" as const,
        playerState: "brainwash-complete-gun" as const,
        playerCompletionUnlocked: true,
        executionPlayerRole: null
      });
      const candidate = (consoleId: string): V2BroadcastInteractionCandidate =>
        Object.freeze({
          consoleId,
          aimPosition: Vector3.Zero(),
          primary: Object.freeze({
            command: "gather-gym" as const,
            label: "体育館に集まって"
          }),
          secondary: Object.freeze({
            command: "become-haigure-human" as const,
            label: "みんなハイグレ人間になろう"
          })
        });
      const update = (
        broadcastCandidate: V2BroadcastInteractionCandidate,
        feedback: Parameters<typeof hud.update>[0]["feedback"]
      ) =>
        hud.update({
          active: true,
          frame,
          broadcastCandidate,
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([]),
          feedback
        });
      try {
        scene.render();
        const first = candidate("console-first");
        const marker = getRole(host, "broadcast-target");
        update(first, Object.freeze([]));
        assert(
          String(marker.dataset.v2RuntimeHudColor) === "#d98cff",
          "放送HUDの未押下色が紫ではありません。"
        );
        update(
          first,
          Object.freeze([
            Object.freeze({
              kind: "broadcast-command-started" as const,
              consoleId: first.consoleId,
              command: "gather-gym" as const,
              option: "primary" as const
            })
          ])
        );
        const primaryAnimation = marker.style.animation;
        assert(
          String(marker.dataset.v2RuntimeHudColor) === "#9cff57" &&
            primaryAnimation.includes("180ms"),
          "放送F成功時に緑または180ms発光が適用されません。"
        );
        update(first, Object.freeze([]));
        assert(
          String(marker.dataset.v2RuntimeHudColor) === "#9cff57",
          "Feedback消費後に最後のF押下色を保持しません。"
        );
        update(
          first,
          Object.freeze([
            Object.freeze({
              kind: "broadcast-command-started" as const,
              consoleId: first.consoleId,
              command: "become-haigure-human" as const,
              option: "secondary" as const
            })
          ])
        );
        assert(
          String(marker.dataset.v2RuntimeHudColor) === "#61e8ff" &&
            marker.style.animation !== primaryAnimation,
          "放送E成功時に水色または発光再始動が適用されません。"
        );
        update(candidate("console-second"), Object.freeze([]));
        assert(
          String(marker.dataset.v2RuntimeHudColor) === "#d98cff" &&
            marker.style.animation === "" &&
            marker.dataset.v2RuntimeHudFeedback === undefined,
          "放送卓対象変更後に最終押下色または発光が残っています。"
        );
        return "未押下紫、F緑、E水色、成功時180ms発光、対象変更でreset";
      } finally {
        hud.dispose();
        host.remove();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("扉HUDを床原点でなく扉中央高へ投影", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06DoorHudCamera",
        new Vector3(0, V2_PLAYER_BASE_EYE_HEIGHT, -0.15),
        scene
      );
      camera.minZ = 0.01;
      camera.setTarget(
        new Vector3(0, V2_PLAYER_BASE_EYE_HEIGHT, 0)
      );
      scene.activeCamera = camera;
      const host = document.createElement("div");
      const canvas = document.createElement("canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => new DOMRect(100, 50, 800, 450)
      });
      host.appendChild(canvas);
      document.body.appendChild(host);

      const doorNode = new TransformNode("T06DoorHudRoot", scene);
      const sweepMesh = MeshBuilder.CreateBox(
        "T06DoorHudSweep",
        { size: 0.1 },
        scene
      );
      sweepMesh.position.set(0, 0.275, 0);
      const doorCandidate = Object.freeze({
        door: Object.freeze({
          id: "door-eye-height",
          doorClass: "room" as const,
          node: doorNode,
          panels: Object.freeze([]),
          sweepId: "door-eye-height-sweep",
          sweepMesh,
          elevatorId: null,
          stopId: null
        }),
        interactionPosition: new Vector3(0, 0.275, 0),
        angleRadians: 0,
        distanceMeters: 0.6
      }) satisfies StageDoorInteractionCandidate;
      const hud = createV2RuntimeHudController({
        host,
        canvas,
        camera
      });
      try {
        scene.render();
        hud.update({
          active: true,
          frame: Object.freeze({
            phase: "playing" as const,
            playerState: "normal" as const,
            playerCompletionUnlocked: false,
            executionPlayerRole: null
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([doorCandidate]),
          feedback: Object.freeze([])
        });
        const doorMarker = getRole(host, "door-target");
        assert(
          !doorMarker.hidden &&
            doorMarker.style.left.length > 0 &&
            doorMarker.style.top.length > 0,
          "水平視点で取っ手位置のC promptが表示されません。"
        );
        return "現在の取っ手world位置をC promptへ投影";
      } finally {
        hud.dispose();
        host.remove();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("同一HUD frameのDOM差分更新", async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06HudStableFrameCamera",
        new Vector3(0, 0, -5),
        scene
      );
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;
      const host = document.createElement("div");
      const canvas = document.createElement("canvas");
      Object.defineProperty(canvas, "getBoundingClientRect", {
        configurable: true,
        value: () => new DOMRect(0, 0, 800, 450)
      });
      host.appendChild(canvas);
      document.body.appendChild(host);
      const hud = createV2RuntimeHudController({ host, canvas, camera });
      const frame = Object.freeze({
        phase: "playing" as const,
        playerState: "brainwash-complete-gun" as const,
        playerCompletionUnlocked: false,
        executionPlayerRole: null
      });
      const update = Object.freeze({
        active: true,
        frame,
        npcCandidates: Object.freeze([createNpcCandidate()]),
        doorCandidates: Object.freeze([]),
        feedback: Object.freeze([])
      });
      const hudRoot = host.querySelector<HTMLElement>(
        '[data-v2-runtime-hud="root"]'
      );
      if (hudRoot === null) {
        throw new Error("DOM差分更新検証用HUD rootがありません。");
      }
      let mutationCount = 0;
      const observer = new MutationObserver(() => {
        mutationCount += 1;
      });
      try {
        scene.render();
        hud.update(update);
        await Promise.resolve();
        observer.observe(hudRoot, {
          attributes: true,
          subtree: true,
          attributeFilter: [
            "hidden",
            "style",
            "data-v2-runtime-hud-color",
            "data-v2-runtime-hud-feedback"
          ]
        });
        hud.update(update);
        await Promise.resolve();
        assert(
          mutationCount === 0,
          `同一HUD frameの2回目updateで${mutationCount}件のDOM属性変更が発生しました。`
        );
        return "同一候補・状態・座標の2回目updateはDOM属性変更0件";
      } finally {
        observer.disconnect();
        hud.dispose();
        host.remove();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("HUD disposeの所有DOM解放と再利用拒否", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "T06HudDisposeCamera",
        new Vector3(0, 0, -5),
        scene
      );
      const host = document.createElement("div");
      const canvas = document.createElement("canvas");
      host.appendChild(canvas);
      document.body.appendChild(host);
      const hud = createV2RuntimeHudController({
        host,
        canvas,
        camera
      });
      try {
        assert(
          host.querySelectorAll('[data-v2-runtime-hud="root"]').length ===
            1,
          "HUD所有rootが1件ではありません。"
        );
        hud.dispose();
        assert(
          host.querySelectorAll('[data-v2-runtime-hud="root"]').length ===
            0,
          "HUD dispose後に所有rootが残っています。"
        );
        assertThrows(
          () => hud.clear(),
          "HUD dispose後のclearが拒否されません。"
        );
        return "所有root 1→0、破棄済みcontrollerの操作を拒否";
      } finally {
        host.remove();
        scene.dispose();
        engine.dispose();
      }
    })
  ]);
