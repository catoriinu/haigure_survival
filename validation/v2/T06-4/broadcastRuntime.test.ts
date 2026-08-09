import {
  FreeCamera,
  MeshBuilder,
  NullEngine,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";

import { createV2MissionHudController } from "../../../src/ui/v2MissionHud";
import type { StageDoorInteractionCandidate } from "../../../src/world/stageDoorRuntime";
import type { StageBroadcastConsole } from "../../../src/world/stageLocationAssets";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import {
  resolveV2MissionAssemblyVenueId,
  type V2BroadcastCommand
} from "../../../src/v2/missionRuntime";
import type { V2NpcCommandCandidate } from "../../../src/v2/npcSystem";
import {
  dispatchV2RuntimeInteractions,
  resolveV2BroadcastInteractionCandidate,
  type V2BroadcastInteractionCandidate
} from "../../../src/v2/runtimeInteraction";

import {
  createFixtureNpc,
  createMissionFixture,
  createNpcSnapshots,
  createSequenceRandom,
  updateFixture,
  type FixtureNpc,
  type MissionFixture
} from "./missionRuntime.test";
import {
  assert,
  assertThrows,
  executeTest,
  type T06TestResult
} from "../T06/testUtils";

const executeBroadcast = (
  fixture: MissionFixture,
  command: V2BroadcastCommand,
  playerState: "normal" | "brainwash-complete-gun",
  npcs: readonly FixtureNpc[],
  playerX = 0
) =>
  fixture.runtime.executeBroadcast(
    command,
    Object.freeze({
      playerState,
      playerFootPosition: new Vector3(playerX, 0, 0),
      npcs: createNpcSnapshots(npcs, fixture.port)
    })
  );

const createBroadcastCandidate = (
  secondary: V2BroadcastInteractionCandidate["secondary"] = Object.freeze({
    command: "flee" as const,
    label: "みんな逃げて"
  })
): V2BroadcastInteractionCandidate =>
  Object.freeze({
    consoleId: "console",
    aimPosition: new Vector3(0, 0, 0.5),
    primary: Object.freeze({
      command: "gather-gym" as const,
      label: "体育館に集まって"
    }),
    secondary
  });

export const runBroadcastRuntimeTests = async (): Promise<
  readonly T06TestResult[]
> =>
  Promise.all([
    executeTest("体育館放送の個別50%・Follow対象・旧放送取消", () => {
      const fixture = createMissionFixture({
        broadcastRandom: createSequenceRandom([
          0.1, 0.9, 0.2,
          0.9, 0.9, 0.9
        ])
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 0, "normal", "follow"),
        createFixtureNpc("npc-b", 1),
        createFixtureNpc("npc-c", 2, "brainwash-complete-gun"),
        createFixtureNpc("npc-fixed", 3, "brainwash-in-progress")
      ]);
      executeBroadcast(fixture, "gather-gym", "normal", npcs);
      assert(
        [...fixture.port.assignments.keys()].join("|") === "npc-a|npc-c",
        `個別50%結果が不正です: ${[...fixture.port.assignments.keys()].join("|")}`
      );
      assert(
        [...fixture.port.assignments.values()].every(
          (stored) =>
            stored.assignment.source === "broadcast" &&
            stored.assignment.locationId === "gym"
        ),
        "体育館放送MissionのsourceまたはLocationが不正です。"
      );
      executeBroadcast(fixture, "gather-gym", "normal", npcs);
      assert(fixture.port.assignments.size === 0, "新放送で旧放送Missionを取消していません。");
      assert(
        fixture.runtime.getMissions().filter(
          (mission) =>
            mission.kind === "npc-location" && mission.source === "broadcast"
        ).every(
          (mission) =>
            mission.state === "cancelled" &&
            mission.terminalReason === "broadcast-replaced"
        ),
        "旧放送Missionの取消理由が不正です。"
      );
      fixture.runtime.dispose();
      return "ID順の対象ごとに1回抽選し、Followも対象・次回放送で全取消";
    }),
    executeTest("逃走放送は距離＋ID順の最大5体", () => {
      const fixture = createMissionFixture();
      const npcs = Object.freeze([
        createFixtureNpc("npc-c", 1, "brainwash-complete-gun"),
        createFixtureNpc("npc-b", 1, "brainwash-complete-no-gun"),
        createFixtureNpc("npc-a", 1, "brainwash-complete-gun"),
        createFixtureNpc("npc-d", 2, "brainwash-complete-gun"),
        createFixtureNpc("npc-e", 3, "brainwash-complete-no-gun"),
        createFixtureNpc("npc-f", 4, "brainwash-complete-gun"),
        createFixtureNpc("npc-h", 0.2, "brainwash-complete-haigure"),
        createFixtureNpc("npc-normal", 0.1, "normal")
      ]);
      executeBroadcast(fixture, "flee", "normal", npcs);
      const assigned = [...fixture.port.assignments.keys()];
      assert(
        assigned.join("|") === "npc-a|npc-b|npc-c|npc-d|npc-e",
        `逃走対象順が不正です: ${assigned.join("|")}`
      );
      assert(
        [...fixture.port.assignments.values()].every(
          (stored) => stored.assignment.locationId === "f02-broadcast"
        ),
        "逃走先が2F放送室ではありません。"
      );
      fixture.runtime.dispose();
      return "移動可能な洗脳完了NPCを距離、同距離ID順で5体選択";
    }),
    executeTest("ハイグレ人間化と最終指示・会場解決", () => {
      const fixture = createMissionFixture();
      fixture.port.conversionNpcIds.push("npc-h-a", "npc-h-b");
      executeBroadcast(
        fixture,
        "become-haigure-human",
        "brainwash-complete-gun",
        Object.freeze([])
      );
      assert(
        fixture.port.conversionCalls.count === 1,
        "HからGへの即時変換portが1回呼ばれていません。"
      );
      assert(
        resolveV2MissionAssemblyVenueId(fixture.runtime.getFrame()) ===
          "assembly-courtyard",
        "ハイグレ人間化後の会場指示が中庭ではありません。"
      );
      executeBroadcast(
        fixture,
        "gather-gym",
        "brainwash-complete-gun",
        Object.freeze([])
      );
      assert(
        resolveV2MissionAssemblyVenueId(fixture.runtime.getFrame()) ===
          "assembly-gym",
        "体育館放送後の会場指示が体育館ではありません。"
      );
      executeBroadcast(
        fixture,
        "flee",
        "normal",
        Object.freeze([])
      );
      assert(
        resolveV2MissionAssemblyVenueId(fixture.runtime.getFrame()) ===
          "assembly-courtyard",
        "逃走放送後の会場指示が中庭へ戻りません。"
      );
      fixture.runtime.dispose();
      return "H→G変換を1回実行し、体育館／中庭のRegistry IDを厳密解決";
    }),
    executeTest("ハイグレ人間化は変換対象の通常Missionを置換", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: () => 0.1
      });
      const npc = createFixtureNpc("npc-h", 0);
      const npcs = Object.freeze([npc]);
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      assert(
        fixture.port.assignments.has(npc.id),
        "変換前の通常NPC Missionがありません。"
      );
      npc.state = "brainwash-complete-haigure";
      fixture.port.conversionNpcIds.push(npc.id);
      executeBroadcast(
        fixture,
        "become-haigure-human",
        "brainwash-complete-gun",
        npcs
      );
      assert(
        !fixture.port.assignments.has(npc.id) &&
          fixture.runtime.getMissions().some(
            (mission) =>
              mission.kind === "npc-location" &&
              mission.source === "normal" &&
              mission.state === "cancelled" &&
              mission.terminalReason === "normal-replaced-by-broadcast"
          ),
        "H→G対象の通常NPC Missionを明示取消していません。"
      );
      fixture.runtime.dispose();
      return "変換portの返却NPC IDに対応する通常割当を取消";
    }),
    executeTest("Playing離脱後は偽の入力phaseで放送できない", () => {
      const fixture = createMissionFixture();
      updateFixture(fixture, { deltaSeconds: 0, phase: "assembly" });
      assertThrows(
        () =>
          executeBroadcast(
            fixture,
            "gather-gym",
            "normal",
            Object.freeze([])
          ),
        "Mission Runtime保持phaseが非Playingでも放送を受理しました。"
      );
      fixture.runtime.dispose();
      return "公開APIは保持中phaseを正本としてassembly後の放送を拒否";
    }),
    executeTest("放送は通常Missionを置換し180秒で期限切れ", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: () => 0.1,
        broadcastRandom: () => 0.1
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 0),
        createFixtureNpc("npc-b", 1),
        createFixtureNpc("npc-c", 2)
      ]);
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      executeBroadcast(fixture, "gather-gym", "normal", npcs);
      assert(
        fixture.runtime.getMissions().some(
          (mission) =>
            mission.kind === "npc-location" &&
            mission.source === "normal" &&
            mission.state === "cancelled" &&
            mission.terminalReason === "normal-replaced-by-broadcast"
        ),
        "通常NPC Missionを放送Missionへ置換していません。"
      );
      updateFixture(fixture, { deltaSeconds: 180, npcs });
      assert(
        fixture.runtime.getMissions().some(
          (mission) =>
            mission.kind === "npc-location" &&
            mission.source === "broadcast" &&
            mission.state === "failed" &&
            mission.terminalReason === "deadline"
        ),
        "放送Missionが180秒で期限失敗しません。"
      );
      fixture.runtime.dispose();
      return "通常割当を明示取消して放送へ置換し、180秒期限を継続";
    }),
    executeTest("放送卓3m・中央Ray・遮蔽条件", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera("T064BroadcastCamera", Vector3.Zero(), scene);
      camera.setTarget(new Vector3(0, 0, 1));
      scene.activeCamera = camera;
      const markerNode = new TransformNode("T064BroadcastMarker", scene);
      markerNode.position.z = 0.75;
      const targetMesh = MeshBuilder.CreateBox(
        "T064BroadcastTarget",
        { size: 0.1 },
        scene
      );
      targetMesh.position.z = 0.75;
      targetMesh.isVisible = false;
      targetMesh.isPickable = false;
      markerNode.computeWorldMatrix(true);
      targetMesh.computeWorldMatrix(true);
      const broadcastConsole = Object.freeze({
        id: "broadcast-console",
        floorId: "f02" as const,
        displayName: "放送卓",
        markerNode,
        targetMesh
      }) satisfies StageBroadcastConsole;
      const clearQueries = Object.freeze({
        castSightSegment: () => null
      }) as unknown as StageSpatialContext["queries"];
      const query = Object.freeze({
        phase: "playing" as const,
        playerState: "normal" as const,
        playerFootPosition: Vector3.Zero(),
        camera,
        broadcastConsole,
        queries: clearQueries
      });
      assert(
        resolveV2BroadcastInteractionCandidate(query) !== null,
        "3m境界・非表示非pickable正本targetの中央Rayを検出できません。"
      );
      markerNode.position.z = 0.751;
      markerNode.computeWorldMatrix(true);
      assert(
        resolveV2BroadcastInteractionCandidate(query) === null,
        "3m境界外で放送候補になりました。"
      );
      markerNode.position.z = 0.75;
      markerNode.computeWorldMatrix(true);
      const blocked = resolveV2BroadcastInteractionCandidate(
        Object.freeze({
          ...query,
          queries: Object.freeze({
            castSightSegment: () => Object.freeze({ kind: "blocker" })
          }) as unknown as StageSpatialContext["queries"]
        })
      );
      assert(blocked === null, "遮蔽越しに放送候補になりました。");
      scene.dispose();
      engine.dispose();
      return "3m境界を含み、targetMesh直接Ray＋視線clearだけを候補化";
    }),
    executeTest("放送F/EはNPCより優先し、C扉は独立", () => {
      const broadcasts: V2BroadcastCommand[] = [];
      const commands: string[] = [];
      const doors: string[] = [];
      const npcCandidate: V2NpcCommandCandidate = Object.freeze({
        npcId: "npc-a",
        aimPosition: Vector3.Zero(),
        distanceMeters: 0.5,
        aimAngleRadians: 0,
        commandMode: "none"
      });
      const doorCandidate = Object.freeze({
        door: Object.freeze({ id: "door-a" }),
        interactionPosition: Vector3.Zero(),
        angleRadians: 0,
        distanceMeters: 0.5
      }) as StageDoorInteractionCandidate;
      dispatchV2RuntimeInteractions({
        actions: Object.freeze([
          "interaction-primary",
          "interaction-secondary",
          "door-toggle"
        ]),
        frame: Object.freeze({
          phase: "playing" as const,
          playerCompletionUnlocked: false
        }),
        broadcastCandidate: createBroadcastCandidate(),
        npcCandidates: Object.freeze([npcCandidate]),
        doorCandidates: Object.freeze([doorCandidate]),
        survival: Object.freeze({
          requestBroadcast: (command: V2BroadcastCommand) => {
            broadcasts.push(command);
            return true;
          },
          requestNpcCommand: (npcId: string, kind: "follow" | "leave") => {
            commands.push(`${kind}:${npcId}`);
            return true;
          },
          selectPlayerCompletion: () => undefined
        }),
        doors: Object.freeze({
          requestDoorToggle: (doorId: string) => {
            doors.push(doorId);
            return Object.freeze({
              status: "started" as const,
              state: "opening" as const
            });
          }
        })
      });
      assert(
        broadcasts.join("|") === "gather-gym|flee" && commands.length === 0,
        `放送優先配送が不正です: broadcasts=${broadcasts.join("|")} / commands=${commands.join("|")}`
      );
      assert(doors.join("|") === "door-a", "放送候補中にC扉が停止しました。");

      dispatchV2RuntimeInteractions({
        actions: Object.freeze(["interaction-secondary"]),
        frame: Object.freeze({
          phase: "playing" as const,
          playerCompletionUnlocked: false
        }),
        broadcastCandidate: createBroadcastCandidate(null),
        npcCandidates: Object.freeze([npcCandidate]),
        doorCandidates: Object.freeze([]),
        survival: Object.freeze({
          requestBroadcast: () => {
            throw new Error("secondary無効時に放送を実行しました。");
          },
          requestNpcCommand: () => {
            throw new Error("secondary無効時にNPCへfallthroughしました。");
          },
          selectPlayerCompletion: () => undefined
        }),
        doors: Object.freeze({
          requestDoorToggle: () => {
            throw new Error("Door候補なしでC操作されました。");
          }
        })
      });
      return "F/Eは放送へ配送、無効Eもconsumeし、CだけDoorへ独立配送";
    }),
    executeTest("右上HUDの残り時間・完了4秒・取消非表示", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const hud = createV2MissionHudController({ host });
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.1, 0, 0])
      });
      let frame = updateFixture(fixture, { deltaSeconds: 20 });
      hud.update({ active: true, frame });
      const item = host.querySelector<HTMLElement>(
        '[data-v2-mission-hud-role="mission-item"]'
      );
      assert(item?.textContent?.includes("残り 120秒") === true, "残り時間を表示しません。");
      const activeMission = frame.playerMissions.find(
        (mission) => mission.state === "active"
      );
      if (!activeMission || activeMission.target.kind !== "location") {
        throw new Error("HUD用Location Missionがありません。");
      }
      const location = fixture.locations.getMissionLocationById(
        activeMission.target.locationId
      )!;
      frame = updateFixture(fixture, {
        deltaSeconds: 0,
        playerX: location.navigationLocation.position.x
      });
      hud.update({ active: true, frame });
      assert(host.textContent?.includes("完了") === true, "完了を表示しません。");
      frame = updateFixture(fixture, {
        deltaSeconds: 4,
        playerX: location.navigationLocation.position.x
      });
      hud.update({ active: true, frame });
      assert(
        host.querySelector('[data-v2-mission-hud-role="mission-item"]') === null,
        "完了表示が4秒後も残っています。"
      );
      hud.dispose();
      fixture.runtime.dispose();
      host.remove();
      return "active残り時間、完了表示、4秒後除去を右上一覧で同期";
    })
  ]);
