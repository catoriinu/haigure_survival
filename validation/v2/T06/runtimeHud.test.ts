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
import {
  createV2RuntimeHudController
} from "../../../src/ui/v2RuntimeHud";

import { assert, assertThrows, executeTest } from "./testUtils";

const createNpcCandidate = (): V2NpcCommandCandidate =>
  Object.freeze({
    npcId: "npc-first",
    aimPosition: Vector3.Zero(),
    distanceMeters: 0.5,
    aimAngleRadians: 0,
    commandMode: "none"
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
            playerCompletionUnlocked: true
          }),
          npcCandidates: Object.freeze([createNpcCandidate()]),
          doorCandidates: Object.freeze([doorCandidate])
        });
        assert(
          !getRole(host, "npc-target").hidden &&
            !getRole(host, "door-target").hidden,
          "先頭NPCまたは扉候補のhighlightが表示されません。"
        );
        assert(
          !getRole(host, "completion-guide").hidden &&
            !getRole(host, "crosshair").hidden &&
            !getRole(host, "fire-guide").hidden,
          "解放済みgun状態の案内・照準・射撃案内が同期しません。"
        );

        hud.update({
          active: true,
          frame: Object.freeze({
            phase: "playing" as const,
            playerState: "brainwash-complete-no-gun" as const,
            playerCompletionUnlocked: true
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([])
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
            playerState: "brainwash-complete-gun" as const,
            playerCompletionUnlocked: true
          }),
          npcCandidates: Object.freeze([createNpcCandidate()]),
          doorCandidates: Object.freeze([doorCandidate])
        });
        assert(
          countVisibleHudRoots(host) === 0,
          "Pointer Lock解除相当のinactive更新でHUDが消えません。"
        );
        return "候補・解放・gun/no-gun・inactive・clearをDOMへ同期";
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
            playerCompletionUnlocked: false
          }),
          npcCandidates: Object.freeze([]),
          doorCandidates: Object.freeze([doorCandidate])
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
