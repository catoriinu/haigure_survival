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
import type { StageSpatialSession } from "../../../src/world/stageSpatialContext";
import {
  resolveV2MissionAssemblyVenueId,
  type V2BroadcastCommand,
  type V2MissionFrame,
  type V2MissionView
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

const createHudFrame = (
  elapsedSeconds: number,
  playerMissions: readonly V2MissionView[]
): V2MissionFrame =>
  Object.freeze({
    elapsedSeconds,
    playerMissions: Object.freeze([...playerMissions]),
    activeNpcMissions: Object.freeze([]),
    missionTargetActorIds: Object.freeze([]),
    missionTargetLocationIds: Object.freeze([]),
    firstFollowerId: null,
    lastSchoolInstruction: "courtyard",
    playerMissionResults: Object.freeze({
      unbrainwashed: Object.freeze({ completed: 0, failed: 0 }),
      brainwashed: Object.freeze({ completed: 0, failed: 0 })
    })
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
        fixture.port.conversionCalls.count === 1 &&
          fixture.port.conversionStates.join("|") ===
            "brainwash-complete-gun",
        "洗脳完了NPC全員をGへ変更するportが1回呼ばれていません。"
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
      return "洗脳完了NPC全員のG変更を1回実行し、体育館／中庭のRegistry IDを厳密解決";
    }),
    executeTest("銃なし接触洗脳ON時のハイグレ人間化はNへ変更", () => {
      const fixture = createMissionFixture({
        completedBrainwashedBroadcastState: "brainwash-complete-no-gun"
      });
      fixture.port.conversionNpcIds.push("npc-h");
      executeBroadcast(
        fixture,
        "become-haigure-human",
        "brainwash-complete-gun",
        Object.freeze([])
      );
      assert(
        fixture.port.conversionStates.join("|") ===
          "brainwash-complete-no-gun",
        "設定snapshotがN変更先へ接続されていません。"
      );
      fixture.runtime.dispose();
      return "brainwashOnNoGunTouch相当のsnapshotで洗脳完了NPCをNへ変更";
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
      return "全洗脳完了NPC変更portの返却IDに対応する通常割当を取消";
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
      }) as unknown as StageSpatialSession["queries"];
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
          }) as unknown as StageSpatialSession["queries"]
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
      const feedback = dispatchV2RuntimeInteractions({
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
      assert(
        feedback.length === 3 &&
          feedback[0]?.kind === "broadcast-command-started" &&
          feedback[0].option === "primary" &&
          feedback[1]?.kind === "broadcast-command-started" &&
          feedback[1].option === "secondary" &&
          feedback[2]?.kind === "door-toggle-started",
        `放送F/E/C成功Feedbackの順序が不正です: ${JSON.stringify(feedback)}`
      );

      const rejected = dispatchV2RuntimeInteractions({
        actions: Object.freeze(["interaction-primary"]),
        frame: Object.freeze({
          phase: "playing" as const,
          playerCompletionUnlocked: false
        }),
        broadcastCandidate: createBroadcastCandidate(),
        npcCandidates: Object.freeze([npcCandidate]),
        doorCandidates: Object.freeze([]),
        survival: Object.freeze({
          requestBroadcast: () => false,
          requestNpcCommand: () => {
            throw new Error("放送拒否時にNPCへfallthroughしました。");
          },
          selectPlayerCompletion: () => undefined
        }),
        doors: Object.freeze({
          requestDoorToggle: () => {
            throw new Error("Door候補なしでC操作されました。");
          }
        })
      });
      assert(rejected.length === 0, "拒否された放送で成功Feedbackを返しました。");

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
      return "F/E成功Feedback、拒否は0件、無効Eもconsumeし、CだけDoorへ独立配送";
    }),
    executeTest("右上HUDの単一panel・複数Mission・表示文言", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const hud = createV2MissionHudController({ host });
      const root = host.querySelector<HTMLElement>(
        '[data-v2-mission-hud="root"]'
      );
      if (root === null) {
        throw new Error("Mission HUD rootがありません。");
      }
      hud.update({ mode: "missions", frame: createHudFrame(20, Object.freeze([])) });
      assert(
        root.hidden && root.style.display === "none" && root.childElementCount === 0,
        "Mission 0件でpanelまたは子要素が表示されました。"
      );
      assert(
        root.querySelector('[data-v2-mission-hud-role="heading"]') === null &&
          root.querySelector('[data-v2-mission-hud-role="mission-list"]') === null,
        "Mission 0件でheadingまたはlistが残りました。"
      );

      const locationMission = Object.freeze({
        id: "hud-location",
        kind: "player-location" as const,
        source: "normal" as const,
        playerCondition: "unbrainwashed" as const,
        state: "active" as const,
        assignee: Object.freeze({ kind: "player" as const }),
        target: Object.freeze({
          kind: "location" as const,
          locationId: "location-art-room"
        }),
        title: "目的地へ移動",
        targetDisplayName: "3F 美術室",
        startedAtSeconds: 20,
        deadlineAtSeconds: 140,
        terminalAtSeconds: null,
        terminalReason: null
      }) satisfies V2MissionView;
      const followerMission = Object.freeze({
        id: "hud-follower-count",
        kind: "player-follower-acquire" as const,
        source: "normal" as const,
        playerCondition: "unbrainwashed" as const,
        state: "active" as const,
        assignee: Object.freeze({ kind: "player" as const }),
        target: Object.freeze({
          kind: "follower-count" as const,
          acquiredCount: 1,
          requiredCount: 2,
          candidateLocationDisplayName: "候補の現在地：2F 図書室"
        }),
        title: "Followerを増やす",
        targetDisplayName: "Follower 2人",
        startedAtSeconds: 20,
        deadlineAtSeconds: 140,
        terminalAtSeconds: null,
        terminalReason: null
      }) satisfies V2MissionView;
      const cancelledMission = Object.freeze({
        ...followerMission,
        id: "hud-cancelled",
        state: "cancelled" as const,
        terminalAtSeconds: 21,
        terminalReason: "phase-ended" as const
      }) satisfies V2MissionView;
      hud.update({
        mode: "missions",
        frame: createHudFrame(
          20,
          Object.freeze([
            locationMission,
            followerMission,
            cancelledMission
          ])
        )
      });

      const heading = root.querySelector<HTMLElement>(
        '[data-v2-mission-hud-role="heading"]'
      );
      const list = root.querySelector<HTMLElement>(
        '[data-v2-mission-hud-role="mission-list"]'
      );
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          '[data-v2-mission-hud-role="mission-item"]'
        )
      );
      assert(
        !root.hidden &&
          root.style.width.includes("350px") &&
          root.style.background !== "" &&
          root.style.border !== "" &&
          root.style.borderRadius !== "" &&
          root.style.boxShadow !== "",
        "Mission 1件以上でrootが単一panelになっていません。"
      );
      assert(
        heading?.textContent === "ミッション" &&
          root.querySelectorAll('[data-v2-mission-hud-role="heading"]').length === 1 &&
          list !== null &&
          root.querySelectorAll('[data-v2-mission-hud-role="mission-list"]').length === 1,
        "MISSION headingまたはMission listが一意ではありません。"
      );
      assert(
        items.length === 2 && items.every((item) => item.parentElement === list),
        "表示Missionが同一list直下に並ばないか、取消Missionが表示されました。"
      );
      assert(
        items.every(
          (item) =>
            item.style.background === "" &&
            item.style.border === "" &&
            item.style.borderRadius === "" &&
            item.style.boxShadow === ""
        ) && list?.style.gap !== "",
        "Mission itemに個別panel装飾または区切り線が残っています。"
      );
      assert(
        items.every(
          (item) =>
            item.querySelector<HTMLElement>(
              '[data-v2-mission-hud-role="mission-title"]'
            )?.style.whiteSpace === "nowrap"
        ),
        "Mission見出しが縮小パネル内で1行固定になっていません。"
      );

      const followerItem = root.querySelector<HTMLElement>(
        '[data-v2-mission-id="hud-follower-count"]'
      );
      const locationItem = root.querySelector<HTMLElement>(
        '[data-v2-mission-id="hud-location"]'
      );
      assert(
        followerItem?.querySelector('[data-v2-mission-hud-role="mission-title"]')
          ?.textContent === "新しい同行者を2人同行させる" &&
          followerItem?.querySelector('[data-v2-mission-hud-role="mission-meta"]')
            ?.textContent === "同行 1 / 2　失敗まで 120秒\n候補の現在地：2F 図書室",
        `同行者進捗文言が不正です: ${followerItem?.textContent ?? "null"}`
      );
      assert(
        locationItem?.querySelector('[data-v2-mission-hud-role="mission-title"]')
          ?.textContent === "3F 美術室へ行く" &&
          locationItem?.querySelector('[data-v2-mission-hud-role="mission-meta"]')
            ?.textContent === "失敗まで 120秒",
        `Location文言が不正です: ${locationItem?.textContent ?? "null"}`
      );

      const escortMission = Object.freeze({
        id: "hud-escort",
        kind: "player-follower-escort" as const,
        source: "normal" as const,
        playerCondition: "unbrainwashed" as const,
        state: "active" as const,
        assignee: Object.freeze({ kind: "player" as const }),
        target: Object.freeze({ kind: "actor" as const, actorId: "npc-secret-escort" }),
        title: "最初の同行者を守り切る",
        targetDisplayName: "（同行中）",
        startedAtSeconds: 20,
        deadlineAtSeconds: 140,
        terminalAtSeconds: null,
        terminalReason: null
      }) satisfies V2MissionView;
      const brainwashMission = Object.freeze({
        id: "hud-brainwash-count",
        kind: "player-brainwash-target" as const,
        source: "normal" as const,
        playerCondition: "brainwashed" as const,
        state: "active" as const,
        assignee: Object.freeze({ kind: "player" as const }),
        target: Object.freeze({
          kind: "brainwash-count" as const,
          brainwashedCount: 1,
          requiredCount: 3,
          candidateLocationDisplayName: "候補の現在地：1F 美術室"
        }),
        title: "3人洗脳する",
        targetDisplayName: "進捗 1/3人",
        startedAtSeconds: 20,
        deadlineAtSeconds: 200,
        terminalAtSeconds: null,
        terminalReason: null
      }) satisfies V2MissionView;
      hud.update({
        mode: "missions",
        frame: createHudFrame(20, Object.freeze([escortMission, brainwashMission]))
      });
      assert(
        root.textContent?.includes("最初の同行者を守り切る") === true &&
          root.textContent.includes("（同行中）") &&
          root.textContent.includes("3人洗脳する") &&
          root.textContent.includes("洗脳 1 / 3") &&
          root.textContent.includes("達成まで 120秒") &&
          root.textContent.includes("失敗まで 180秒") &&
          root.textContent.includes("候補の現在地：1F 美術室") &&
          !root.textContent.includes("npc-secret-escort") &&
          !root.textContent.includes("Follower"),
        `同行者護衛または洗脳人数のIDなし日本語表示が不正です: ${root.textContent}`
      );

      const orderBeforeResult = Array.from(
        root.querySelectorAll<HTMLElement>(
          '[data-v2-mission-hud-role="mission-item"]'
        )
      ).map((item) => item.dataset.v2MissionId);
      const completedBrainwashMission = Object.freeze({
        ...brainwashMission,
        state: "completed" as const,
        target: Object.freeze({
          kind: "brainwash-count" as const,
          brainwashedCount: 3,
          requiredCount: 3,
          candidateLocationDisplayName: "候補の現在地：1F 美術室"
        }),
        terminalAtSeconds: 24,
        terminalReason: "brainwash-count-reached" as const
      }) satisfies V2MissionView;
      hud.update({
        mode: "missions",
        frame: createHudFrame(
          24,
          Object.freeze([escortMission, completedBrainwashMission])
        )
      });
      const orderDuringResult = Array.from(
        root.querySelectorAll<HTMLElement>(
          '[data-v2-mission-hud-role="mission-item"]'
        )
      ).map((item) => item.dataset.v2MissionId);
      assert(
        JSON.stringify(orderDuringResult) === JSON.stringify(orderBeforeResult),
        "完了色へ変化したMissionが4秒表示中に並び替わりました。"
      );
      hud.update({
        mode: "missions",
        frame: createHudFrame(28, Object.freeze([escortMission]))
      });
      assert(
        root.querySelector('[data-v2-mission-hud-role="mission-item"]')
          ?.getAttribute("data-v2-mission-id") === escortMission.id,
        "結果表示消滅後に残存Missionを並べ直しません。"
      );

      const completedFollowerMission = Object.freeze({
        ...followerMission,
        state: "completed" as const,
        target: Object.freeze({
          kind: "follower-count" as const,
          acquiredCount: 2,
          requiredCount: 2,
          candidateLocationDisplayName: "候補の現在地：2F 図書室"
        }),
        terminalAtSeconds: 24,
        terminalReason: "follower-count-reached" as const
      }) satisfies V2MissionView;
      hud.update({
        mode: "missions",
        frame: createHudFrame(24, Object.freeze([completedFollowerMission]))
      });
      assert(
        root.querySelector('[data-v2-mission-hud-role="mission-meta"]')
          ?.textContent === "完了　同行 2 / 2\n候補の現在地：2F 図書室",
        "Follower完了進捗を表示しません。"
      );
      hud.update({ mode: "missions", frame: createHudFrame(28, Object.freeze([])) });
      assert(
        root.hidden && root.style.display === "none" && root.childElementCount === 0,
        "最後のMission消滅後にpanelが非表示になりません。"
      );
      hud.update({
        mode: "results",
        frame: Object.freeze({
          ...createHudFrame(28, Object.freeze([])),
          playerMissionResults: Object.freeze({
            unbrainwashed: Object.freeze({ completed: 3, failed: 1 }),
            brainwashed: Object.freeze({ completed: 2, failed: 4 })
          })
        })
      });
      assert(
        root.querySelector('[data-v2-mission-hud-role="heading"]')?.textContent ===
          "ミッション結果" &&
          root.textContent?.includes("未洗脳時　完了 3　失敗 1") === true &&
          root.textContent.includes("洗脳済み時　完了 2　失敗 4"),
        `ゲームオーバーMission結果が不正です: ${root.textContent}`
      );
      hud.dispose();
      host.remove();
      return "0件非表示、単一panel、同行人数・候補現在地・階付きLocation・結果を表示";
    }),
    executeTest("右上HUDの残り時間・完了4秒・取消非表示", () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      const hud = createV2MissionHudController({ host });
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.1, 0, 0, 0])
      });
      let frame = updateFixture(fixture, { deltaSeconds: 20 });
      hud.update({ mode: "missions", frame });
      const item = host.querySelector<HTMLElement>(
        '[data-v2-mission-hud-role="mission-item"]'
      );
      assert(
        item?.textContent?.includes("失敗まで 160秒") === true,
        "失敗までの残り時間を表示しません。"
      );
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
      hud.update({ mode: "missions", frame });
      assert(host.textContent?.includes("完了") === true, "完了を表示しません。");
      frame = updateFixture(fixture, {
        deltaSeconds: 4,
        playerX: location.navigationLocation.position.x
      });
      hud.update({ mode: "missions", frame });
      assert(
        host.querySelector(`[data-v2-mission-id="${activeMission.id}"]`) === null &&
          host.querySelector('[data-v2-mission-hud-role="mission-item"]') !== null,
        "完了表示が4秒後に新しいMissionへ入れ替わりません。"
      );
      const root = host.querySelector<HTMLElement>(
        '[data-v2-mission-hud="root"]'
      );
      assert(
        root?.hidden === false && root.childElementCount > 0,
        "完了表示が消えた後の常時Mission panelが表示されません。"
      );
      hud.dispose();
      fixture.runtime.dispose();
      host.remove();
      return "失敗までの時間、完了表示、4秒後の新Mission入替を右上一覧で同期";
    })
  ]);
