import { Vector3 } from "@babylonjs/core";

import type {
  StageLocationAssetRegistry,
  StageMissionLocation
} from "../../../src/world/stageLocationAssets";
import type { V2CharacterState } from "../../../src/v2/combatTypes";
import {
  createV2MissionRuntime,
  type V2MissionNpcSnapshot,
  type V2MissionRuntime,
  type V2MissionUpdate,
  type V2MissionView
} from "../../../src/v2/missionRuntime";
import type {
  V2NpcCommandMode,
  V2NpcLocationMissionAssignment,
  V2NpcLocationMissionSnapshot,
  V2NpcStateTransitionEvent
} from "../../../src/v2/npcSystem";

import { assert, executeTest, type T06TestResult } from "../T06/testUtils";

type InvalidPlayerLocationCompletion = Extract<
  V2MissionView,
  {
    kind: "player-location";
    state: "completed";
    terminalReason: "target-brainwashed";
  }
>;
const MISSION_VIEW_REJECTS_INVALID_KIND_REASON: [
  InvalidPlayerLocationCompletion
] extends [never]
  ? true
  : false = true;

export type FixtureNpc = {
  id: string;
  state: V2CharacterState;
  footPosition: Vector3;
  commandMode: V2NpcCommandMode;
  targetId: string | null;
};

type StoredNpcMission = {
  assignment: V2NpcLocationMissionAssignment;
  state: V2NpcLocationMissionSnapshot["state"];
};

export type FixtureNpcPort = Readonly<{
  assignments: Map<string, StoredNpcMission>;
  conversionNpcIds: string[];
  conversionCalls: { count: number };
  assignLocationMission(
    npcId: string,
    assignment: V2NpcLocationMissionAssignment
  ): void;
  cancelLocationMission(npcId: string, missionId: string): boolean;
  convertHaigureNpcsToGun(): readonly string[];
}>;

export type MissionFixture = Readonly<{
  runtime: V2MissionRuntime;
  port: FixtureNpcPort;
  locations: StageLocationAssetRegistry;
}>;

export const createFixtureNpc = (
  id: string,
  x: number,
  state: V2CharacterState = "normal",
  commandMode: V2NpcCommandMode = "none",
  targetId: string | null = null
): FixtureNpc => ({
  id,
  state,
  footPosition: new Vector3(x, 0, 0),
  commandMode,
  targetId
});

const createFixtureMissionLocation = (
  id: string,
  x: number,
  containsAll: boolean
): StageMissionLocation =>
  Object.freeze({
    id,
    floorId: "f01" as const,
    displayName: `目的地 ${id}`,
    area: Object.freeze({ id: `area-${id}` }),
    volumeMesh: Object.freeze({ id: `volume-${id}` }),
    anchorNode: Object.freeze({ id: `anchor-${id}` }),
    navigationLocation: Object.freeze({
      position: new Vector3(x, 0, 0),
      polygonRef: Math.round(x * 100) + 1
    }),
    contains: (point: Vector3) =>
      containsAll || Math.abs(point.x - x) <= 0.02
  }) as unknown as StageMissionLocation;

export const createFixtureLocations = (
  containsAll = false
): StageLocationAssetRegistry => {
  const ids = [
    "gym",
    "f02-broadcast",
    "loc-a",
    "loc-b",
    "loc-c",
    "loc-d",
    "loc-e",
    "loc-f",
    "loc-g",
    "loc-h",
    "loc-i",
    "loc-j",
    "loc-k",
    "loc-l"
  ];
  const missionLocations = Object.freeze(
    ids.map((id, index) =>
      createFixtureMissionLocation(id, 10 + index * 2, containsAll)
    )
  );
  const byId = new Map(missionLocations.map((location) => [location.id, location]));
  return Object.freeze({
    floorMaps: Object.freeze([]),
    areas: Object.freeze([]),
    missionLocations,
    stairLandings: Object.freeze([]),
    elevatorLandings: Object.freeze([]),
    broadcastConsole: Object.freeze({ id: "broadcast-console" }),
    getFloorMap: () => null,
    getAreaById: () => null,
    getMissionLocationById: (id: string) => byId.get(id) ?? null,
    findArea: () => null
  }) as unknown as StageLocationAssetRegistry;
};

export const createSequenceRandom = (
  values: readonly number[]
): (() => number) => {
  let index = 0;
  return () => {
    if (index >= values.length) {
      throw new Error(`fixture乱数が不足しました: ${index}/${values.length}`);
    }
    const value = values[index];
    index += 1;
    return value;
  };
};

export const createMissionFixture = (options: Readonly<{
  containsAll?: boolean;
  playerRandom?: () => number;
  npcRandom?: () => number;
  broadcastRandom?: () => number;
}> = {}): MissionFixture => {
  const assignments = new Map<string, StoredNpcMission>();
  const conversionNpcIds: string[] = [];
  const conversionCalls = { count: 0 };
  const port: FixtureNpcPort = Object.freeze({
    assignments,
    conversionNpcIds,
    conversionCalls,
    assignLocationMission: (npcId, assignment) => {
      if (assignments.has(npcId)) {
        throw new Error(`fixture NPC Missionが重複しました: ${npcId}`);
      }
      assignments.set(npcId, {
        assignment,
        state: "moving"
      });
    },
    cancelLocationMission: (npcId, missionId) => {
      const stored = assignments.get(npcId);
      if (!stored) {
        return false;
      }
      if (stored.assignment.missionId !== missionId) {
        throw new Error(
          `fixture NPC Mission IDが不一致です: ${npcId}/${stored.assignment.missionId}/${missionId}`
        );
      }
      assignments.delete(npcId);
      return true;
    },
    convertHaigureNpcsToGun: () => {
      conversionCalls.count += 1;
      return Object.freeze([...conversionNpcIds]);
    }
  });
  const locations = createFixtureLocations(options.containsAll ?? false);
  return Object.freeze({
    runtime: createV2MissionRuntime({
      locations,
      playerRandom: options.playerRandom ?? (() => 0.9),
      npcRandom: options.npcRandom ?? (() => 0.1),
      broadcastRandom: options.broadcastRandom ?? (() => 0.1),
      npcPort: port
    }),
    port,
    locations
  });
};

export const createNpcSnapshots = (
  npcs: readonly FixtureNpc[],
  port: FixtureNpcPort
): readonly V2MissionNpcSnapshot[] =>
  Object.freeze(
    npcs.map((npc) => {
      const stored = port.assignments.get(npc.id);
      return Object.freeze({
        id: npc.id,
        state: npc.state,
        footPosition: npc.footPosition.clone(),
        commandMode: npc.commandMode,
        targetId: npc.targetId,
        locationMission:
          stored === undefined
            ? null
            : Object.freeze({
                missionId: stored.assignment.missionId,
                source: stored.assignment.source,
                locationId: stored.assignment.locationId,
                state: stored.state
              })
      });
    })
  );

export const updateFixture = (
  fixture: MissionFixture,
  options: Readonly<{
    deltaSeconds: number;
    phase?: V2MissionUpdate["phase"];
    playerState?: V2CharacterState;
    playerX?: number;
    npcs?: readonly FixtureNpc[];
    transitions?: readonly V2NpcStateTransitionEvent[];
  }>
) =>
  fixture.runtime.update(
    Object.freeze({
      deltaSeconds: options.deltaSeconds,
      phase: options.phase ?? "playing",
      playerState: options.playerState ?? "normal",
      playerFootPosition: new Vector3(options.playerX ?? 0, 0, 0),
      npcs: createNpcSnapshots(options.npcs ?? Object.freeze([]), fixture.port),
      npcStateTransitions: options.transitions ?? Object.freeze([])
    })
  );

const brainwashTransition = (
  npcId: string,
  sourceId: string,
  assisted: boolean
): V2NpcStateTransitionEvent =>
  Object.freeze({
    npcId,
    previousState: "hit-b",
    currentState: "brainwash-in-progress",
    hitSourceId: sourceId,
    hitOriginKind: sourceId === "player" ? "player-gun" : "npc-gun",
    playerNoGunAssisted: assisted
  });

export const runMissionRuntimeTests = async (): Promise<
  readonly T06TestResult[]
> =>
  Promise.all([
    executeTest("20秒schedulerと50%境界", () => {
      assert(
        MISSION_VIEW_REJECTS_INVALID_KIND_REASON,
        "V2MissionViewがkindに不正な終了理由を許可しています。"
      );
      const generated = createMissionFixture({
        playerRandom: createSequenceRandom([0.49, 0, 0])
      });
      assert(
        updateFixture(generated, { deltaSeconds: 19.99 }).playerMissions.length === 0,
        "20秒前にPlayer Missionが生成されました。"
      );
      const generatedFrame = updateFixture(generated, { deltaSeconds: 0.01 });
      assert(
        generatedFrame.playerMissions.some(
          (mission) => mission.state === "active" && mission.kind === "player-location"
        ),
        "50%抽選の当選でMissionが生成されません。"
      );
      generated.runtime.dispose();

      const rejected = createMissionFixture({ playerRandom: () => 0.5 });
      const rejectedFrame = updateFixture(rejected, { deltaSeconds: 20 });
      assert(
        rejectedFrame.playerMissions.length === 0,
        "50%境界値を当選扱いしました。"
      );
      rejected.runtime.dispose();
      return "20.00秒でtickし、0.49は当選・0.50は落選";
    }),
    executeTest("複数20秒tick跨ぎの開始時刻と期限", () => {
      let randomCall = 0;
      const fixture = createMissionFixture({
        playerRandom: () => {
          randomCall += 1;
          if (randomCall === 1) {
            return 0.1;
          }
          if (randomCall === 2 || randomCall === 3) {
            return 0;
          }
          return 0.9;
        }
      });
      updateFixture(fixture, { deltaSeconds: 200 });
      const mission = fixture.runtime.getMissions().find(
        (candidate) => candidate.kind === "player-location"
      );
      assert(mission !== undefined, "20秒tickのMissionが生成されません。");
      assert(
        mission.startedAtSeconds === 20 &&
          mission.deadlineAtSeconds === 140 &&
          mission.state === "failed" &&
          mission.terminalAtSeconds === 140 &&
          mission.terminalReason === "deadline",
        `跨ぎtickの時刻が不正です: ${JSON.stringify(mission)}`
      );
      fixture.runtime.dispose();
      return "delta=200でも20秒開始・140秒期限として時系列処理";
    }),
    executeTest("大deltaの過去tickは既存Missionを時系列保持", () => {
      let randomCall = 0;
      const fixture = createMissionFixture({
        playerRandom: () => {
          randomCall += 1;
          if (randomCall === 1) {
            return 0.1;
          }
          if (randomCall === 2 || randomCall === 3) {
            return 0;
          }
          return 0.1;
        }
      });
      updateFixture(fixture, { deltaSeconds: 20 });
      updateFixture(fixture, { deltaSeconds: 121 });
      const locationMissions = fixture.runtime
        .getMissions()
        .filter((mission) => mission.kind === "player-location");
      assert(
        locationMissions.length === 1,
        `期限前の過去tickで同種Missionが生成されました: ${JSON.stringify(locationMissions)}`
      );
      const mission = locationMissions[0];
      assert(
        mission.state === "failed" &&
          mission.startedAtSeconds === 20 &&
          mission.deadlineAtSeconds === 140 &&
          mission.terminalAtSeconds === 140 &&
          mission.terminalReason === "deadline",
        `大delta時のMission時系列が不正です: ${JSON.stringify(mission)}`
      );
      fixture.runtime.dispose();
      return "40～120秒tickでは既存Missionを保持し、140秒tickで期限失敗のみ";
    }),
    executeTest("無効候補除外後の比率再正規化", () => {
      const fixture = createMissionFixture({
        containsAll: true,
        playerRandom: createSequenceRandom([0.1, 0.99, 0])
      });
      const npcs = Object.freeze([createFixtureNpc("npc-a", 1)]);
      const frame = updateFixture(fixture, { deltaSeconds: 20, npcs });
      assert(
        frame.playerMissions.some(
          (mission) => mission.kind === "player-follower-acquire"
        ),
        "LocationとEscort無効後にFollower獲得へ再正規化されません。"
      );
      fixture.runtime.dispose();
      return "有効候補がFollower獲得だけなら重みroll 0.99でも必ず選択";
    }),
    executeTest("Player通常3件上限と重複防止", () => {
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([
          0.1, 0.1, 0.1,
          0.1, 0.1, 0.1,
          0.1, 0.9, 0.1,
          0.1, 0.1, 0.1
        ])
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 1),
        createFixtureNpc("npc-b", 2),
        createFixtureNpc("npc-c", 3),
        createFixtureNpc("npc-d", 4)
      ]);
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      let frame = updateFixture(fixture, { deltaSeconds: 20, npcs });
      const acquire = frame.playerMissions.find(
        (mission) =>
          mission.state === "active" && mission.kind === "player-follower-acquire"
      );
      if (!acquire || acquire.target.kind !== "actor") {
        throw new Error("Follower獲得対象がありません。");
      }
      const acquireActorId = acquire.target.actorId;
      const firstFollower = npcs.find((npc) => npc.id === acquireActorId)!;
      firstFollower.commandMode = "follow";
      fixture.runtime.notifyNpcCommandChanged(firstFollower.id, "follow");
      frame = updateFixture(fixture, { deltaSeconds: 20, npcs });
      frame = updateFixture(fixture, { deltaSeconds: 20, npcs });
      const active = frame.playerMissions.filter(
        (mission) => mission.state === "active" && mission.source === "normal"
      );
      assert(active.length <= 3, `Player Missionが3件を超えました: ${active.length}`);
      assert(
        new Set(active.map((mission) => mission.kind)).size === active.length,
        "同一種別のactive Missionが重複しました。"
      );
      const actorIds = active.flatMap((mission) =>
        mission.target.kind === "actor" || mission.target.kind === "actor-location"
          ? [mission.target.actorId]
          : []
      );
      const locationIds = active.flatMap((mission) =>
        mission.target.kind === "location" || mission.target.kind === "actor-location"
          ? [mission.target.locationId]
          : []
      );
      assert(new Set(actorIds).size === actorIds.length, "Actor対象が重複しました。");
      assert(
        new Set(locationIds).size === locationIds.length,
        "Location対象が重複しました。"
      );
      fixture.runtime.dispose();
      return `active=${active.length} / kind・Actor・Location重複なし`;
    }),
    executeTest("期限・通常H継続・phase離脱取消", () => {
      let deadlineRandomCall = 0;
      const fixture = createMissionFixture({
        playerRandom: () => {
          deadlineRandomCall += 1;
          if (deadlineRandomCall === 1) {
            return 0.1;
          }
          if (deadlineRandomCall === 2 || deadlineRandomCall === 3) {
            return 0;
          }
          return 0.9;
        }
      });
      updateFixture(fixture, { deltaSeconds: 20 });
      const beforeDeadline = updateFixture(fixture, {
        deltaSeconds: 119,
        playerState: "brainwash-complete-haigure"
      });
      assert(
        beforeDeadline.playerMissions.some((mission) => mission.state === "active"),
        "通常H中に既存Missionが取消されました。"
      );
      updateFixture(fixture, {
        deltaSeconds: 1,
        playerState: "brainwash-complete-haigure"
      });
      const history = fixture.runtime.getMissions();
      assert(
        history.some(
          (mission) => mission.state === "failed" && mission.terminalReason === "deadline"
        ),
        "120秒期限で失敗しません。"
      );
      fixture.runtime.dispose();

      const cancelled = createMissionFixture({
        playerRandom: createSequenceRandom([0.1, 0, 0])
      });
      updateFixture(cancelled, { deltaSeconds: 20 });
      updateFixture(cancelled, { deltaSeconds: 121, phase: "assembly" });
      assert(
        cancelled.runtime.getMissions().some(
          (mission) =>
            mission.state === "cancelled" && mission.terminalReason === "phase-ended"
        ),
        "期限超過と同時のplaying離脱でactive Missionが取消されません。"
      );
      cancelled.runtime.dispose();
      return "通常Hでも期限を継続し、120秒失敗・期限超過同frameでもphase離脱取消";
    }),
    executeTest("期限跨過は評価前失敗・期限ちょうどは成功優先", () => {
      const createSingleMissionRandom = () => {
        let callCount = 0;
        return () => {
          callCount += 1;
          if (callCount === 1) {
            return 0.1;
          }
          if (callCount === 2 || callCount === 3) {
            return 0;
          }
          return 0.9;
        };
      };

      const lateLocation = createMissionFixture({
        playerRandom: createSingleMissionRandom()
      });
      let frame = updateFixture(lateLocation, { deltaSeconds: 20 });
      const lateLocationMission = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-location" && mission.state === "active"
      );
      if (!lateLocationMission || lateLocationMission.target.kind !== "location") {
        throw new Error("期限跨過用Location Missionがありません。");
      }
      const lateLocationTarget = lateLocation.locations.getMissionLocationById(
        lateLocationMission.target.locationId
      )!;
      updateFixture(lateLocation, {
        deltaSeconds: 121,
        playerX: lateLocationTarget.navigationLocation.position.x
      });
      const lateLocationResult = lateLocation.runtime
        .getMissions()
        .find((mission) => mission.id === lateLocationMission.id);
      assert(
        lateLocationResult?.state === "failed" &&
          lateLocationResult.terminalReason === "deadline" &&
          lateLocationResult.terminalAtSeconds === 140,
        `期限後のVolume進入が成功しました: ${JSON.stringify(lateLocationResult)}`
      );
      lateLocation.runtime.dispose();

      const exactLocation = createMissionFixture({
        playerRandom: createSingleMissionRandom()
      });
      frame = updateFixture(exactLocation, { deltaSeconds: 20 });
      const exactLocationMission = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-location" && mission.state === "active"
      );
      if (!exactLocationMission || exactLocationMission.target.kind !== "location") {
        throw new Error("期限境界用Location Missionがありません。");
      }
      const exactLocationTarget = exactLocation.locations.getMissionLocationById(
        exactLocationMission.target.locationId
      )!;
      updateFixture(exactLocation, {
        deltaSeconds: 120,
        playerX: exactLocationTarget.navigationLocation.position.x
      });
      const exactLocationResult = exactLocation.runtime
        .getMissions()
        .find((mission) => mission.id === exactLocationMission.id);
      assert(
        exactLocationResult?.state === "completed" &&
          exactLocationResult.terminalReason === "arrived" &&
          exactLocationResult.terminalAtSeconds === 140,
        `期限ちょうどのVolume進入を成功優先にできません: ${JSON.stringify(exactLocationResult)}`
      );
      exactLocation.runtime.dispose();

      const lateTransition = createMissionFixture({
        playerRandom: createSingleMissionRandom()
      });
      const target = createFixtureNpc("npc-target", 1);
      const npcs = Object.freeze([target]);
      frame = updateFixture(lateTransition, {
        deltaSeconds: 20,
        playerState: "brainwash-complete-gun",
        npcs
      });
      const lateTransitionMission = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-brainwash-target" &&
          mission.state === "active"
      );
      if (!lateTransitionMission) {
        throw new Error("期限跨過用洗脳Missionがありません。");
      }
      target.state = "brainwash-in-progress";
      updateFixture(lateTransition, {
        deltaSeconds: 181,
        playerState: "brainwash-complete-gun",
        npcs,
        transitions: Object.freeze([
          brainwashTransition(target.id, "player", false)
        ])
      });
      const lateTransitionResult = lateTransition.runtime
        .getMissions()
        .find((mission) => mission.id === lateTransitionMission.id);
      assert(
        lateTransitionResult?.state === "failed" &&
          lateTransitionResult.terminalReason === "deadline" &&
          lateTransitionResult.terminalAtSeconds === 200,
        `期限後の洗脳イベントが成功しました: ${JSON.stringify(lateTransitionResult)}`
      );
      lateTransition.runtime.dispose();
      return "期限超過はVolume・イベント前にdeadline失敗、期限同時刻のVolumeは成功";
    }),
    executeTest("状況Mission期限切れは通常Player補充を抑止しない", () => {
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.9, 0.9, 0.1, 0, 0])
      });
      const first = createFixtureNpc(
        "npc-first",
        0.5,
        "brainwash-complete-gun",
        "follow",
        "player"
      );
      const other = createFixtureNpc("npc-other", 1);
      const npcs = Object.freeze([first, other]);
      fixture.runtime.notifyNpcCommandChanged(first.id, "follow");
      updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-gun",
        npcs
      });
      updateFixture(fixture, {
        deltaSeconds: 60,
        playerState: "brainwash-complete-gun",
        npcs
      });
      const missions = fixture.runtime.getMissions();
      assert(
        missions.some(
          (mission) =>
            mission.kind === "player-first-follower-escape" &&
            mission.state === "failed" &&
            mission.terminalReason === "deadline" &&
            mission.terminalAtSeconds === 45
        ),
        "状況Missionが45秒期限で失敗しません。"
      );
      assert(
        missions.some(
          (mission) =>
            mission.source === "normal" &&
            mission.assignee.kind === "player" &&
            mission.state === "active" &&
            mission.startedAtSeconds === 60
        ),
        "状況Mission期限切れが60秒tickの通常Player Mission補充を抑止しました。"
      );
      fixture.runtime.dispose();
      return "状況Missionが45秒で失敗しても60秒tickで通常Player Missionを補充";
    }),
    executeTest("放送Mission期限切れは通常NPC補充を抑止しない", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: () => 0.1,
        broadcastRandom: createSequenceRandom([0.1, 0.9])
      });
      const broadcastTarget = createFixtureNpc("npc-a", 0);
      const waitingNpc = createFixtureNpc("npc-b", 1, "normal", "follow");
      const npcs = Object.freeze([broadcastTarget, waitingNpc]);
      fixture.runtime.executeBroadcast(
        "gather-gym",
        Object.freeze({
          playerState: "normal",
          playerFootPosition: Vector3.Zero(),
          npcs: createNpcSnapshots(npcs, fixture.port)
        })
      );
      updateFixture(fixture, { deltaSeconds: 160, npcs });
      waitingNpc.commandMode = "none";
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      const missions = fixture.runtime.getMissions();
      assert(
        missions.some(
          (mission) =>
            mission.kind === "npc-location" &&
            mission.source === "broadcast" &&
            mission.state === "failed" &&
            mission.terminalReason === "deadline" &&
            mission.terminalAtSeconds === 180
        ),
        "放送Missionが180秒期限で失敗しません。"
      );
      assert(
        missions.some(
          (mission) =>
            mission.kind === "npc-location" &&
            mission.source === "normal" &&
            mission.state === "active" &&
            mission.startedAtSeconds === 180
        ),
        "放送Mission期限切れが180秒tickの通常NPC Mission補充を抑止しました。"
      );
      fixture.runtime.dispose();
      return "放送Missionが180秒で失敗しても同tickで通常NPC Missionを補充";
    }),
    executeTest("G攻撃・N阻止中第三者攻撃・第三者失敗", () => {
      const runCase = (
        sourceId: string,
        assisted: boolean,
        phase: V2MissionUpdate["phase"] = "playing"
      ) => {
        const fixture = createMissionFixture({
          playerRandom: createSequenceRandom([0.1, 0, 0])
        });
        const npcs = Object.freeze([createFixtureNpc("npc-target", 1)]);
        updateFixture(fixture, {
          deltaSeconds: 20,
          playerState: "brainwash-complete-gun",
          npcs
        });
        npcs[0].state = "brainwash-in-progress";
        updateFixture(fixture, {
          deltaSeconds: 0,
          phase,
          playerState: "brainwash-complete-gun",
          npcs,
          transitions: Object.freeze([
            brainwashTransition("npc-target", sourceId, assisted)
          ])
        });
        const result = fixture.runtime.getMissions().find(
          (mission) => mission.kind === "player-brainwash-target"
        );
        fixture.runtime.dispose();
        return result;
      };
      assert(runCase("player", false)?.state === "completed", "Player Gで未完了です。");
      assert(runCase("npc-helper", true)?.state === "completed", "N阻止補助で未完了です。");
      assert(
        runCase("player", false, "assembly")?.state === "completed",
        "洗脳遷移と同frameのphase離脱で成功Missionを取消しました。"
      );
      const thirdParty = runCase("npc-helper", false);
      assert(
        thirdParty?.state === "failed" &&
          thirdParty.terminalReason === "brainwashed-by-third-party",
        "阻止なし第三者攻撃が失敗になりません。"
      );
      return "Player GとN阻止補助は完了、同frame phase離脱でも成功優先、阻止なし第三者は失敗";
    }),
    executeTest("最初のFollower固定と45秒逃走条件", () => {
      const fixture = createMissionFixture();
      const first = createFixtureNpc(
        "npc-first",
        0.5,
        "brainwash-complete-gun",
        "none",
        "player"
      );
      const second = createFixtureNpc("npc-second", 0.6);
      fixture.runtime.notifyNpcCommandChanged(first.id, "follow");
      fixture.runtime.notifyNpcCommandChanged(second.id, "follow");
      let frame = updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-gun",
        npcs: Object.freeze([first, second])
      });
      assert(frame.firstFollowerId === first.id, "最初のFollowerが差し替わりました。");
      assert(
        frame.playerMissions.some(
          (mission) => mission.kind === "player-first-follower-escape"
        ),
        "追跡開始時に逃走Missionが始まりません。"
      );
      first.footPosition.x = 3;
      first.targetId = null;
      frame = updateFixture(fixture, {
        deltaSeconds: 5,
        playerState: "brainwash-complete-gun",
        npcs: Object.freeze([first, second])
      });
      assert(
        frame.playerMissions.some(
          (mission) =>
            mission.kind === "player-first-follower-escape" &&
            mission.state === "completed"
        ),
        "12m以上・非targetを5秒維持しても完了しません。"
      );
      fixture.runtime.dispose();
      return "最初のFollow対象を固定し、12m＋非target 5秒で逃走完了";
    })
  ]);
