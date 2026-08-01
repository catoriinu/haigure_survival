import {
  MeshBuilder,
  NullEngine,
  Quaternion,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";

import {
  getDoorInteractionCandidates,
  type StageDoorInteractionCandidate
} from "../../../src/world/stageDoorRuntime";
import type { StageDoorAsset } from "../../../src/world/stageDynamicAssets";
import { V2_PLAYER_BASE_EYE_HEIGHT } from "../../../src/v2/playerController";
import type { V2PlayerCompletionState } from "../../../src/v2/combatTypes";
import type { V2NpcCommandCandidate } from "../../../src/v2/npcSystem";
import { createV2PlayerInput } from "../../../src/v2/playerInput";
import {
  V2_NORMAL_HORIZONTAL_SPEED_SCALE,
  V2_WATER_HORIZONTAL_SPEED_SCALE,
  dispatchV2RuntimeInteractions,
  resolveV2HorizontalSpeedScale,
  type V2RuntimeInteractionDoorPort,
  type V2RuntimeInteractionSurvivalPort
} from "../../../src/v2/runtimeInteraction";

import { assert, executeTest } from "./testUtils";

const createNpcCandidate = (npcId: string): V2NpcCommandCandidate =>
  Object.freeze({
    npcId,
    aimPosition: new Vector3(0, 1, 0),
    distanceMeters: 0.5,
    aimAngleRadians: 0,
    commandMode: "none"
  });

const createDoorCandidate = (
  doorId: string
): StageDoorInteractionCandidate =>
  Object.freeze({
    door: Object.freeze({ id: doorId }) as
      StageDoorInteractionCandidate["door"],
    interactionPosition: Vector3.Zero(),
    angleRadians: 0,
    distanceMeters: 0.5
  });

type InteractionCalls = Readonly<{
  commands: string[];
  selections: V2PlayerCompletionState[];
  doorIds: string[];
  survival: V2RuntimeInteractionSurvivalPort;
  doors: V2RuntimeInteractionDoorPort;
}>;

const createInteractionCalls = (): InteractionCalls => {
  const commands: string[] = [];
  const selections: V2PlayerCompletionState[] = [];
  const doorIds: string[] = [];
  return Object.freeze({
    commands,
    selections,
    doorIds,
    survival: Object.freeze({
      requestNpcCommand: (npcId: string, kind: "follow" | "leave") => {
        commands.push(`${kind}:${npcId}`);
        return true;
      },
      selectPlayerCompletion: (state: V2PlayerCompletionState) => {
        selections.push(state);
      }
    }),
    doors: Object.freeze({
      requestDoorToggle: (doorId: string) => {
        doorIds.push(doorId);
        return Object.freeze({
          status: "started" as const,
          state: "opening" as const
        });
      }
    })
  });
};

const playingFrame = Object.freeze({
  phase: "playing" as const,
  playerCompletionUnlocked: true
});

export const runRuntimeInteractionTests = async () =>
  Promise.all([
    executeTest("現在の取っ手位置を眼位置基準で扉候補へ取得", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const doorNode = new TransformNode("T06DoorRoot", scene);
      doorNode.position.z = 0.15;
      const sweepMesh = MeshBuilder.CreateBox(
        "T06DoorSweep",
        { size: 0.1 },
        scene
      );
      const panelNode = new TransformNode("T06DoorPanel", scene);
      panelNode.parent = doorNode;
      const openPoseNode = new TransformNode("T06DoorOpenPose", scene);
      openPoseNode.parent = doorNode;
      const handleMesh = MeshBuilder.CreateBox(
        "VIS_DoorPanel_Handle_T06",
        { size: 0.05 },
        scene
      );
      handleMesh.parent = panelNode;
      handleMesh.position.set(0, V2_PLAYER_BASE_EYE_HEIGHT, 0);
      const colliderMesh = MeshBuilder.CreateBox(
        "COL_DoorPanel_T06",
        { size: 0.05 },
        scene
      );
      colliderMesh.parent = panelNode;
      const door = Object.freeze({
        id: "door-floor-root",
        doorClass: "room" as const,
        node: doorNode,
        panels: Object.freeze([
          Object.freeze({
            id: "door-floor-root-panel",
            doorId: "door-floor-root",
            node: panelNode,
            openPoseNode,
            visualMeshes: Object.freeze([handleMesh]),
            interactionAnchorMesh: handleMesh,
            colliderMeshes: Object.freeze([colliderMesh]),
            closedTransform: Object.freeze({
              position: Vector3.Zero(),
              rotation: Quaternion.Identity(),
              scaling: Vector3.One()
            }),
            openTransform: Object.freeze({
              position: Vector3.Zero(),
              rotation: Quaternion.Identity(),
              scaling: Vector3.One()
            }),
            motion: Object.freeze({
              kind: "slide" as const,
              axis: Vector3.Right(),
              distance: 0
            })
          })
        ]),
        sweepId: "door-floor-root-sweep",
        sweepMesh,
        elevatorId: null,
        stopId: null
      }) satisfies StageDoorAsset;
      try {
        const forward = Vector3.Forward();
        const eyeCandidates = getDoorInteractionCandidates(
          Object.freeze([door]),
          Object.freeze({
            origin: new Vector3(0, V2_PLAYER_BASE_EYE_HEIGHT, 0),
            forward
          })
        );
        const offsetEyeCandidates = getDoorInteractionCandidates(
          Object.freeze([door]),
          Object.freeze({
            origin: new Vector3(0, V2_PLAYER_BASE_EYE_HEIGHT, -0.3),
            forward
          })
        );
        assert(
          eyeCandidates[0]?.door.id === door.id &&
            offsetEyeCandidates[0]?.door.id === door.id &&
            offsetEyeCandidates[0].interactionPosition.equals(
              handleMesh.getBoundingInfo().boundingBox.centerWorld
            ),
          `取っ手基準の扉候補が不正です: eye=${eyeCandidates.length}, offset=${offsetEyeCandidates.length}`
        );
        return "閉状態の取っ手world中央を眼位置基準で候補へ取得";
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("入力drainからRuntimeへの一回配送", () => {
      const input = createV2PlayerInput(window);
      const calls = createInteractionCalls();
      try {
        const press = (code: string, repeat = false) => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { code, repeat })
          );
        };
        press("KeyF");
        press("KeyF", true);
        press("KeyE");
        press("KeyC");
        press("KeyG");
        press("KeyN");
        press("KeyH");
        const firstDrain = input.drainPressedActions();
        const secondDrain = input.drainPressedActions();
        press("KeyF");
        input.reset();
        const afterReset = input.drainPressedActions();
        dispatchV2RuntimeInteractions({
          actions: firstDrain,
          frame: playingFrame,
          npcCandidates: Object.freeze([
            createNpcCandidate("npc-first")
          ]),
          doorCandidates: Object.freeze([
            createDoorCandidate("door-first")
          ]),
          survival: calls.survival,
          doors: calls.doors
        });
        dispatchV2RuntimeInteractions({
          actions: secondDrain,
          frame: playingFrame,
          npcCandidates: Object.freeze([
            createNpcCandidate("npc-first")
          ]),
          doorCandidates: Object.freeze([
            createDoorCandidate("door-first")
          ]),
          survival: calls.survival,
          doors: calls.doors
        });
        assert(
          firstDrain.length === 6 &&
            secondDrain.length === 0 &&
            afterReset.length === 0,
          `入力drain/resetが一回消費になっていません: first=${firstDrain.length}, second=${secondDrain.length}, reset=${afterReset.length}`
        );
        assert(
          calls.commands.length === 2 &&
            calls.doorIds.length === 1 &&
            calls.selections.length === 3,
          `drain後の配送件数が不正です: NPC=${calls.commands.length}, door=${calls.doorIds.length}, select=${calls.selections.length}`
        );
        return "repeatを除く6 actionを初回だけ配送、2回目とreset後は0件";
      } finally {
        input.dispose();
      }
    }),
    executeTest("F／E／Cの一回配送と先頭候補固定", () => {
      const calls = createInteractionCalls();
      dispatchV2RuntimeInteractions({
        actions: Object.freeze([
          "npc-follow",
          "npc-follow",
          "npc-leave",
          "door-toggle",
          "door-toggle"
        ]),
        frame: playingFrame,
        npcCandidates: Object.freeze([
          createNpcCandidate("npc-first"),
          createNpcCandidate("npc-second")
        ]),
        doorCandidates: Object.freeze([
          createDoorCandidate("door-first"),
          createDoorCandidate("door-second")
        ]),
        survival: calls.survival,
        doors: calls.doors
      });
      assert(
        JSON.stringify(calls.commands) ===
          JSON.stringify([
            "follow:npc-first",
            "follow:npc-first",
            "leave:npc-first"
          ]),
        `NPC actionの配送が不正です: ${JSON.stringify(calls.commands)}`
      );
      assert(
        JSON.stringify(calls.doorIds) ===
          JSON.stringify(["door-first", "door-first"]),
        `扉actionの配送が不正です: ${JSON.stringify(calls.doorIds)}`
      );
      return "各pressを一度ずつ、安定ソート済み配列の先頭候補だけへ配送";
    }),
    executeTest("候補なしのF／E／C無配送", () => {
      const calls = createInteractionCalls();
      dispatchV2RuntimeInteractions({
        actions: Object.freeze([
          "npc-follow",
          "npc-leave",
          "door-toggle"
        ]),
        frame: playingFrame,
        npcCandidates: Object.freeze([]),
        doorCandidates: Object.freeze([]),
        survival: calls.survival,
        doors: calls.doors
      });
      assert(
        calls.commands.length === 0 && calls.doorIds.length === 0,
        "候補なしでNPCまたは扉へactionが配送されました。"
      );
      return "候補なしではrequest APIを呼び出さない";
    }),
    executeTest("G／N／Hのphase・解放guard", () => {
      const calls = createInteractionCalls();
      const actions = Object.freeze([
        "select-gun" as const,
        "select-no-gun" as const,
        "select-haigure" as const
      ]);
      dispatchV2RuntimeInteractions({
        actions,
        frame: Object.freeze({
          phase: "playing" as const,
          playerCompletionUnlocked: false
        }),
        npcCandidates: Object.freeze([]),
        doorCandidates: Object.freeze([]),
        survival: calls.survival,
        doors: calls.doors
      });
      dispatchV2RuntimeInteractions({
        actions,
        frame: Object.freeze({
          phase: "assembly" as const,
          playerCompletionUnlocked: true
        }),
        npcCandidates: Object.freeze([]),
        doorCandidates: Object.freeze([]),
        survival: calls.survival,
        doors: calls.doors
      });
      assert(
        calls.selections.length === 0,
        "未解放またはplaying外で状態選択が配送されました。"
      );
      return "解放前とplaying終了後の選択を0件へ抑止";
    }),
    executeTest("G→N→H→Gの連続再選択", () => {
      const calls = createInteractionCalls();
      dispatchV2RuntimeInteractions({
        actions: Object.freeze([
          "select-gun",
          "select-no-gun",
          "select-haigure",
          "select-gun"
        ]),
        frame: playingFrame,
        npcCandidates: Object.freeze([]),
        doorCandidates: Object.freeze([]),
        survival: calls.survival,
        doors: calls.doors
      });
      const expected: readonly V2PlayerCompletionState[] = Object.freeze([
        "brainwash-complete-gun",
        "brainwash-complete-no-gun",
        "brainwash-complete-haigure",
        "brainwash-complete-gun"
      ]);
      assert(
        JSON.stringify(calls.selections) === JSON.stringify(expected),
        `連続再選択の配送順が不正です: ${JSON.stringify(calls.selections)}`
      );
      return "同一dispatch内でも4操作を入力順に配送";
    }),
    executeTest("水Volume内外の水平速度倍率", () => {
      const transitions = [false, true, true, false, true, false].map(
        resolveV2HorizontalSpeedScale
      );
      assert(
        V2_NORMAL_HORIZONTAL_SPEED_SCALE === 1 &&
          V2_WATER_HORIZONTAL_SPEED_SCALE === 0.5,
        "通常または水中の速度倍率定数が不正です。"
      );
      assert(
        JSON.stringify(transitions) ===
          JSON.stringify([1, 0.5, 0.5, 1, 0.5, 1]),
        `水中出入りの倍率列が不正です: ${JSON.stringify(transitions)}`
      );
      return "外=1.0 / 入水・滞在=0.5 / 退出・再配置相当=1.0";
    })
  ]);
