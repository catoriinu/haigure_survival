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

type InvalidFollowerAcquireActorTarget = Extract<
  V2MissionView,
  {
    kind: "player-follower-acquire";
    target: { kind: "actor" };
  }
>;
const FOLLOWER_ACQUIRE_REJECTS_ACTOR_TARGET: [
  InvalidFollowerAcquireActorTarget
] extends [never]
  ? true
  : false = true;
type InvalidBrainwashActorTarget = Extract<
  V2MissionView,
  {
    kind: "player-brainwash-target";
    target: { kind: "actor" };
  }
>;
const BRAINWASH_COUNT_REJECTS_ACTOR_TARGET: [
  InvalidBrainwashActorTarget
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
  floorId: StageMissionLocation["floorId"],
  displayName: string,
  x: number,
  containsAll: boolean,
  area: StageMissionLocation["area"]
): StageMissionLocation =>
  Object.freeze({
    id,
    floorId,
    displayName,
    area,
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
  const specs = [
    ["gym", "f01", "体育館"],
    ["f02-broadcast", "f02", "放送室"],
    ["f03-art", "f03", "美術室"],
    ["loc-b", "f01", "目的地 loc-b"],
    ["loc-c", "f01", "目的地 loc-c"],
    ["loc-d", "f01", "目的地 loc-d"],
    ["loc-e", "f01", "目的地 loc-e"],
    ["loc-f", "f01", "目的地 loc-f"],
    ["loc-g", "f01", "目的地 loc-g"],
    ["loc-h", "f01", "目的地 loc-h"],
    ["loc-i", "f01", "目的地 loc-i"],
    ["loc-j", "f01", "目的地 loc-j"],
    ["loc-k", "f01", "目的地 loc-k"],
    ["rooftop-poolside", "roof", "屋上プールサイド"]
  ] as const;
  const sharedArea = Object.freeze({
    id: "area-shared",
    displayName: "共有Area"
  }) as StageMissionLocation["area"];
  const missionLocations = Object.freeze(
    specs.map(([id, floorId, displayName], index) => {
      const area = containsAll
        ? sharedArea
        : (Object.freeze({
            id: `area-${id}`,
            displayName
          }) as StageMissionLocation["area"]);
      return createFixtureMissionLocation(
        id,
        floorId,
        displayName,
        10 + index * 2,
        containsAll,
        area
      );
    })
  );
  const byId = new Map(missionLocations.map((location) => [location.id, location]));
  const elevatorArea = Object.freeze({
    id: "area-elevator",
    displayName: "エレベーター"
  }) as StageMissionLocation["area"];
  const floorMaps = Object.freeze([
    Object.freeze({ id: "map-f01", floorId: "f01", displayName: "1F", order: 1 }),
    Object.freeze({ id: "map-f02", floorId: "f02", displayName: "2F", order: 2 }),
    Object.freeze({ id: "map-f03", floorId: "f03", displayName: "3F", order: 3 }),
    Object.freeze({ id: "map-f04", floorId: "f04", displayName: "4F", order: 4 }),
    Object.freeze({ id: "map-roof", floorId: "roof", displayName: "屋上", order: 5 })
  ]);
  const floorMapById = new Map(
    floorMaps.map((floorMap) => [floorMap.floorId, floorMap])
  );
  return Object.freeze({
    floorMaps,
    areas: Object.freeze([
      elevatorArea,
      ...missionLocations.map((location) => location.area)
    ]),
    missionLocations,
    stairLandings: Object.freeze([]),
    elevatorLandings: Object.freeze([]),
    broadcastConsole: Object.freeze({ id: "broadcast-console" }),
    getFloorMap: (floorId: StageMissionLocation["floorId"]) =>
      floorMapById.get(floorId) ?? null,
    getAreaById: () => null,
    getMissionLocationById: (id: string) => byId.get(id) ?? null,
    findArea: (point: Vector3) => {
      if (Math.abs(point.x + 10) <= 0.01) {
        return Object.freeze({
          area: elevatorArea,
          piece: Object.freeze({ id: "piece-area-elevator" }),
          floorId: null,
          elevatorId: "school-elevator"
        });
      }
      const location = containsAll
        ? missionLocations[0]
        : missionLocations.find(
            (candidate) =>
              Math.abs(
                point.x - candidate.navigationLocation.position.x
              ) <= 0.5
          );
      return location
        ? Object.freeze({
            area: location.area,
            piece: Object.freeze({ id: `piece-${location.area.id}` }),
            floorId: location.floorId,
            elevatorId: null
          })
        : null;
    }
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
    executeTest("開始直後1件と20秒schedulerの50%境界", () => {
      assert(
        MISSION_VIEW_REJECTS_INVALID_KIND_REASON,
        "V2MissionViewがkindに不正な終了理由を許可しています。"
      );
      assert(
        FOLLOWER_ACQUIRE_REJECTS_ACTOR_TARGET,
        "Follower獲得MissionがActor targetを許可しています。"
      );
      assert(
        BRAINWASH_COUNT_REJECTS_ACTOR_TARGET,
        "洗脳人数MissionがActor targetを許可しています。"
      );
      const generated = createMissionFixture({
        playerRandom: createSequenceRandom([0, 0, 0.49, 0.99])
      });
      const npcs = Object.freeze([createFixtureNpc("npc-a", 1)]);
      const initialFrame = updateFixture(generated, {
        deltaSeconds: 19.99,
        npcs
      });
      assert(
        initialFrame.playerMissions.length === 1 &&
          initialFrame.playerMissions[0].state === "active" &&
          initialFrame.playerMissions[0].startedAtSeconds === 0,
        "Playing開始直後にPlayer Missionが1件生成されません。"
      );
      const generatedFrame = updateFixture(generated, {
        deltaSeconds: 0.01,
        npcs
      });
      assert(
        generatedFrame.playerMissions.some(
          (mission) =>
            mission.state === "active" &&
            mission.kind === "player-follower-acquire"
        ),
        "20秒tickの50%当選で2件目が生成されません。"
      );
      generated.runtime.dispose();

      const rejected = createMissionFixture({
        playerRandom: createSequenceRandom([0, 0, 0.5])
      });
      const rejectedFrame = updateFixture(rejected, {
        deltaSeconds: 20,
        npcs
      });
      assert(
        rejectedFrame.playerMissions.length === 1,
        "50%境界値を当選扱いしました。"
      );
      rejected.runtime.dispose();
      return "Playing開始時は0秒開始で1件、20.00秒tickは0.49当選・0.50落選";
    }),
    executeTest("複数20秒tick跨ぎの開始時刻と期限", () => {
      let randomCall = 0;
      const fixture = createMissionFixture({
        playerRandom: () => {
          randomCall += 1;
          if (randomCall === 1) {
            return 0.1;
          }
          if (randomCall === 2) {
            return 0;
          }
          return 0.9;
        }
      });
      updateFixture(fixture, { deltaSeconds: 200 });
      const mission = fixture.runtime.getMissions().find(
        (candidate) => candidate.kind === "player-location"
      );
      assert(mission !== undefined, "開始直後のMissionが生成されません。");
      assert(
        mission.startedAtSeconds === 0 &&
          mission.deadlineAtSeconds === 120 &&
          mission.state === "failed" &&
          mission.terminalAtSeconds === 120 &&
          mission.terminalReason === "deadline",
        `跨ぎtickの時刻が不正です: ${JSON.stringify(mission)}`
      );
      fixture.runtime.dispose();
      return "delta=200でも0秒開始・120秒期限として時系列処理";
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
        locationMissions.length === 2,
        `期限前の過去tickで同種Missionが生成されました: ${JSON.stringify(locationMissions)}`
      );
      const mission = locationMissions[0];
      assert(
        mission.state === "failed" &&
          mission.startedAtSeconds === 0 &&
          mission.deadlineAtSeconds === 120 &&
          mission.terminalAtSeconds === 120 &&
          mission.terminalReason === "deadline",
        `大delta時のMission時系列が不正です: ${JSON.stringify(mission)}`
      );
      assert(
        locationMissions[1].state === "active" &&
          locationMissions[1].startedAtSeconds === 140,
        "期限終了後の140秒tickで同種Missionを補充しません。"
      );
      fixture.runtime.dispose();
      return "20～100秒tickは既存Missionを保持し、120秒期限後の140秒tickで補充";
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
    executeTest("Follower獲得人数とdistinct進捗", () => {
      const fixture = createMissionFixture({
        containsAll: true,
        playerRandom: createSequenceRandom([
          0,
          0.1, 0, 0,
          0.1, 0, 0.34,
          0.1, 0, 0.99
        ])
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 1),
        createFixtureNpc("npc-b", 2),
        createFixtureNpc("npc-c", 3),
        createFixtureNpc("npc-d", 4),
        createFixtureNpc("npc-e", 5),
        createFixtureNpc("npc-f", 6),
        createFixtureNpc("npc-g", 7)
      ]);
      const requireActiveAcquire = (deltaSeconds: number) => {
        const frame = updateFixture(fixture, { deltaSeconds, npcs });
        const mission = frame.playerMissions.find(
          (candidate) =>
            candidate.kind === "player-follower-acquire" &&
            candidate.state === "active"
        );
        if (!mission || mission.target.kind !== "follower-count") {
          throw new Error("Follower獲得人数Missionがありません。");
        }
        assert(
          frame.missionTargetActorIds.length === 0,
          "Follower獲得人数MissionがActor targetをミニマップへ渡しました。"
        );
        return mission;
      };
      const completeWith = (npc: FixtureNpc) => {
        npc.commandMode = "follow";
        fixture.runtime.notifyNpcCommandChanged(npc.id, "follow");
      };

      let mission = requireActiveAcquire(20);
      assert(
        mission.target.requiredCount === 1 &&
          mission.target.acquiredCount === 0,
        "最初のFollower獲得Missionが1人固定ではありません。"
      );
      completeWith(npcs[0]);

      mission = requireActiveAcquire(20);
      assert(mission.target.requiredCount === 1, "2回目の1人抽選が不正です。");
      completeWith(npcs[1]);

      mission = requireActiveAcquire(20);
      assert(mission.target.requiredCount === 2, "3回目の2人抽選が不正です。");
      completeWith(npcs[2]);
      let progress = fixture.runtime.getMissions().find(
        (candidate) => candidate.id === mission.id
      );
      assert(
        progress?.state === "active" &&
          progress.target.kind === "follower-count" &&
          progress.target.acquiredCount === 1,
        "1人目のFollow成功を進捗へ反映しません。"
      );
      npcs[2].commandMode = "none";
      fixture.runtime.notifyNpcCommandChanged(npcs[2].id, "leave");
      npcs[2].commandMode = "follow";
      fixture.runtime.notifyNpcCommandChanged(npcs[2].id, "follow");
      progress = fixture.runtime.getMissions().find(
        (candidate) => candidate.id === mission.id
      );
      assert(
        progress?.state === "active" &&
          progress.target.kind === "follower-count" &&
          progress.target.acquiredCount === 1,
        "Leave後の再Followを重複計上しました。"
      );
      completeWith(npcs[3]);
      const completedTwo = fixture.runtime.getMissions().find(
        (candidate) => candidate.id === mission.id
      );
      assert(
        completedTwo?.state === "completed" &&
          completedTwo.terminalReason === "follower-count-reached" &&
          completedTwo.target.kind === "follower-count" &&
          completedTwo.target.acquiredCount === 2,
        "異なる2人のFollow成功でMissionが完了しません。"
      );

      mission = requireActiveAcquire(20);
      assert(mission.target.requiredCount === 3, "4回目の3人抽選が不正です。");
      completeWith(npcs[4]);
      completeWith(npcs[5]);
      completeWith(npcs[6]);
      const completedThree = fixture.runtime.getMissions().find(
        (candidate) => candidate.id === mission.id
      );
      assert(
        completedThree?.state === "completed" &&
          completedThree.terminalReason === "follower-count-reached" &&
          completedThree.target.kind === "follower-count" &&
          completedThree.target.acquiredCount === 3,
        "異なる3人のFollow成功でMissionが完了しません。"
      );
      fixture.runtime.dispose();
      return "初回1人、以後1/2/3人を抽選し、distinct IDだけを不減算で計上";
    }),
    executeTest("Follower獲得人数はeligible数を上限とする", () => {
      const capped = createMissionFixture({
        containsAll: true,
        playerRandom: createSequenceRandom([
          0,
          0.1, 0, 0.99
        ])
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 1),
        createFixtureNpc("npc-b", 2),
        createFixtureNpc("npc-c", 3)
      ]);
      let frame = updateFixture(capped, { deltaSeconds: 20, npcs });
      const first = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-follower-acquire" && mission.state === "active"
      );
      if (!first || first.target.kind !== "follower-count") {
        throw new Error("初回Follower獲得Missionがありません。");
      }
      npcs[0].commandMode = "follow";
      capped.runtime.notifyNpcCommandChanged(npcs[0].id, "follow");
      frame = updateFixture(capped, { deltaSeconds: 20, npcs });
      const second = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-follower-acquire" && mission.state === "active"
      );
      assert(
        second?.target.kind === "follower-count" &&
          second.target.requiredCount === 2,
        "eligible 2人なのに2回目Missionが3人を要求しました。"
      );
      capped.runtime.dispose();

      const empty = createMissionFixture({
        containsAll: true,
        playerRandom: createSequenceRandom([0.1])
      });
      const followed = Object.freeze([
        createFixtureNpc("npc-existing-a", 1, "normal", "follow"),
        createFixtureNpc("npc-existing-b", 2, "normal", "follow")
      ]);
      frame = updateFixture(empty, { deltaSeconds: 20, npcs: followed });
      assert(
        !frame.playerMissions.some(
          (mission) => mission.kind === "player-follower-acquire"
        ),
        "eligible 0人でもFollower獲得Missionを生成しました。"
      );
      empty.runtime.dispose();
      return "2回目以降はmin(3, eligible数)を上限とし、0人なら候補外";
    }),
    executeTest("Player通常3件上限と重複防止", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.1
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
      if (!acquire || acquire.target.kind !== "follower-count") {
        throw new Error("Follower獲得人数Missionがありません。");
      }
      assert(
        acquire.target.requiredCount === 1 &&
          acquire.target.acquiredCount === 0,
        "最初のFollower獲得Missionが1人固定ではありません。"
      );
      const firstFollower = npcs[0];
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
        mission.target.kind === "actor" ? [mission.target.actorId] : []
      );
      const locationIds = active.flatMap((mission) =>
        mission.target.kind === "location" ? [mission.target.locationId] : []
      );
      assert(new Set(actorIds).size === actorIds.length, "Actor対象が重複しました。");
      assert(
        new Set(locationIds).size === locationIds.length,
        "Location対象が重複しました。"
      );
      fixture.runtime.dispose();
      return `active=${active.length} / kind・Actor・Location重複なし`;
    }),
    executeTest("Player LocationはArea進入で完了し階表示", () => {
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([0, 0.17])
      });
      let frame = updateFixture(fixture, { deltaSeconds: 20 });
      const mission = frame.playerMissions.find(
        (candidate) =>
          candidate.kind === "player-location" && candidate.state === "active"
      );
      if (!mission || mission.target.kind !== "location") {
        throw new Error("Player Location Missionがありません。");
      }
      assert(
        mission.target.locationId === "f03-art" &&
          mission.targetDisplayName === "3F 美術室",
        `固定階表示が不正です: ${mission.targetDisplayName}`
      );
      const location = fixture.locations.getMissionLocationById(
        mission.target.locationId
      )!;
      const areaEntryX = location.navigationLocation.position.x + 0.25;
      assert(
        !location.contains(new Vector3(areaEntryX, 0, 0)),
        "fixtureのArea進入点がAnchor Volume内です。"
      );
      frame = updateFixture(fixture, {
        deltaSeconds: 0,
        playerX: areaEntryX
      });
      assert(
        frame.playerMissions.some(
          (candidate) =>
            candidate.id === mission.id &&
            candidate.state === "completed" &&
            candidate.terminalReason === "arrived"
        ),
        "部屋Areaへ入ってもPlayer Location Missionが完了しません。"
      );
      fixture.runtime.dispose();

      const excluded = createMissionFixture({
        playerRandom: createSequenceRandom([0, 0])
      });
      const art = excluded.locations.getMissionLocationById("f03-art")!;
      frame = updateFixture(excluded, {
        deltaSeconds: 20,
        playerX: art.navigationLocation.position.x + 0.25
      });
      assert(
        frame.playerMissions.every(
          (candidate) =>
            candidate.target.kind !== "location" ||
            candidate.target.locationId !== art.id
        ),
        "現在いる部屋AreaをPlayer Location候補に含めました。"
      );
      excluded.runtime.dispose();

      const rooftop = createMissionFixture({
        playerRandom: createSequenceRandom([0, 0.99])
      });
      frame = updateFixture(rooftop, { deltaSeconds: 20 });
      const rooftopMission = frame.playerMissions.find(
        (candidate) => candidate.kind === "player-location"
      );
      assert(
        rooftopMission?.target.kind === "location" &&
          rooftopMission.target.locationId === "rooftop-poolside" &&
          rooftopMission.targetDisplayName === "屋上プールサイド",
        `屋上表示名へ階名を重複しました: ${rooftopMission?.targetDisplayName}`
      );
      rooftop.runtime.dispose();
      return "3F 美術室をArea進入で完了し、現在Area除外・屋上名非重複";
    }),
    executeTest("同行者護衛は240秒生存・3秒現在地、NPC LocationはAnchor Volume", () => {
      const escortFixture = createMissionFixture({
        playerRandom: createSequenceRandom([
          0.99,
          ...Array(12).fill(0.9)
        ])
      });
      const follower = createFixtureNpc("npc-first", 0.5, "normal", "follow");
      escortFixture.runtime.notifyNpcCommandChanged(follower.id, "follow");
      let frame = updateFixture(escortFixture, {
        deltaSeconds: 20,
        npcs: Object.freeze([follower])
      });
      const escort = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-follower-escort" && mission.state === "active"
      );
      if (!escort || escort.target.kind !== "actor") {
        throw new Error("同行者護衛Missionがありません。");
      }
      assert(
        escort.target.actorId === follower.id &&
          escort.title === "最初の同行者を護衛" &&
          escort.targetDisplayName === "（同行中）" &&
          !escort.title.includes(follower.id) &&
          !escort.targetDisplayName.includes(follower.id),
        `同行者護衛の初期表示が不正です: ${escort.title}/${escort.targetDisplayName}`
      );
      const escortLocation = escortFixture.locations.getMissionLocationById("f03-art")!;
      follower.footPosition.x = escortLocation.navigationLocation.position.x + 0.25;
      follower.commandMode = "none";
      escortFixture.runtime.notifyNpcCommandChanged(follower.id, "leave");
      frame = updateFixture(escortFixture, {
        deltaSeconds: 2,
        npcs: Object.freeze([follower])
      });
      assert(
        frame.playerMissions.some(
          (mission) =>
            mission.id === escort.id &&
            mission.state === "active" &&
            mission.targetDisplayName === "（同行中）"
        ),
        "Leave後3秒未満で護衛Missionが失敗または表示更新されました。"
      );
      frame = updateFixture(escortFixture, {
        deltaSeconds: 1,
        npcs: Object.freeze([follower])
      });
      assert(
        frame.playerMissions.some(
          (mission) =>
            mission.id === escort.id &&
            mission.state === "active" &&
            mission.targetDisplayName === "現在地：3F 美術室"
        ),
        "非同行の現在地が3秒周期で階・Area表示へ更新されません。"
      );
      follower.footPosition.x = 0;
      frame = updateFixture(escortFixture, {
        deltaSeconds: 3,
        npcs: Object.freeze([follower])
      });
      assert(
        frame.playerMissions.some(
          (mission) =>
            mission.id === escort.id &&
            mission.state === "active" &&
            mission.targetDisplayName === "現在地確認中"
        ),
        "Areaを解決できない現在地を座標推測せず明示できません。"
      );
      follower.footPosition.x = -10;
      frame = updateFixture(escortFixture, {
        deltaSeconds: 3,
        npcs: Object.freeze([follower])
      });
      assert(
        frame.playerMissions.some(
          (mission) =>
            mission.id === escort.id &&
            mission.state === "active" &&
            mission.targetDisplayName === "現在地：エレベーター"
        ),
        "エレベーターAreaの現在地表示が不正です。"
      );
      frame = updateFixture(escortFixture, {
        deltaSeconds: 231,
        npcs: Object.freeze([follower])
      });
      assert(
        escortFixture.runtime.getMissions().some(
          (mission) =>
            mission.id === escort.id &&
            mission.state === "completed" &&
            mission.terminalReason === "follower-survived" &&
            mission.terminalAtSeconds === 240
        ),
        `非同行でも未洗脳で生存した同行者護衛が240秒で完了しません: ${JSON.stringify(escortFixture.runtime.getMissions())}`
      );
      escortFixture.runtime.dispose();

      const lostFixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.99])
      });
      const lostFollower = createFixtureNpc("npc-lost", 0.5, "normal", "follow");
      lostFixture.runtime.notifyNpcCommandChanged(lostFollower.id, "follow");
      updateFixture(lostFixture, {
        deltaSeconds: 20,
        npcs: Object.freeze([lostFollower])
      });
      lostFollower.state = "hit-a";
      updateFixture(lostFixture, {
        deltaSeconds: 0,
        npcs: Object.freeze([lostFollower])
      });
      assert(
        lostFixture.runtime.getMissions().some(
          (mission) =>
            mission.kind === "player-follower-escort" &&
            mission.state === "failed" &&
            mission.terminalReason === "follower-lost"
        ),
        "同行者が被弾して生存状態を失っても護衛Missionが失敗しません。"
      );
      lostFixture.runtime.dispose();

      const detachedFixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.99])
      });
      const detachedFollower = createFixtureNpc("npc-detached", 0.5);
      detachedFixture.runtime.notifyNpcCommandChanged(detachedFollower.id, "follow");
      detachedFollower.commandMode = "none";
      detachedFixture.runtime.notifyNpcCommandChanged(detachedFollower.id, "leave");
      const detachedFrame = updateFixture(detachedFixture, {
        deltaSeconds: 20,
        npcs: Object.freeze([detachedFollower])
      });
      assert(
        detachedFrame.playerMissions.some(
          (mission) =>
            mission.kind === "player-follower-escort" &&
            mission.state === "active" &&
            mission.targetDisplayName === "現在地確認中"
        ),
        "現在非同行の最初の同行者を護衛Mission候補へ含めません。"
      );
      detachedFixture.runtime.dispose();

      const npcFixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: createSequenceRandom([0, 0.17])
      });
      const npc = createFixtureNpc("npc-location", 0);
      const npcs = Object.freeze([npc]);
      updateFixture(npcFixture, { deltaSeconds: 20, npcs });
      const npcMission = npcFixture.runtime.getMissions().find(
        (mission) =>
          mission.kind === "npc-location" &&
          mission.source === "normal" &&
          mission.state === "active"
      );
      if (!npcMission || npcMission.target.kind !== "location") {
        throw new Error("通常NPC Location Missionがありません。");
      }
      assert(
        npcMission.target.locationId === "f03-art" &&
          npcMission.targetDisplayName === "3F 美術室",
        `NPC Locationの階表示が不正です: ${npcMission.targetDisplayName}`
      );
      const npcLocation = npcFixture.locations.getMissionLocationById(
        npcMission.target.locationId
      )!;
      npc.footPosition.x = npcLocation.navigationLocation.position.x + 0.25;
      updateFixture(npcFixture, { deltaSeconds: 0, npcs });
      assert(
        npcFixture.runtime.getMissions().some(
          (mission) => mission.id === npcMission.id && mission.state === "active"
        ),
        "NPC Location MissionがAnchor Volume外のArea進入だけで完了しました。"
      );
      npc.footPosition.x = npcLocation.navigationLocation.position.x;
      updateFixture(npcFixture, { deltaSeconds: 0, npcs });
      assert(
        npcFixture.runtime.getMissions().some(
          (mission) =>
            mission.id === npcMission.id &&
            mission.state === "completed" &&
            mission.terminalReason === "arrived"
        ),
        "NPC Location MissionがAnchor Volume到達で完了しません。"
      );
      npcFixture.runtime.dispose();
      return "非同行でも生成・240秒生存完了、3秒Area/未解決/エレベーター表示、被弾失敗、NPC Volume";
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
        deltaSeconds: 99,
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
    executeTest("hit-aで未洗脳Mission失敗・GNH確定時に即時1件", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.1
      });
      const firstFollower = createFixtureNpc(
        "npc-first",
        0.5,
        "normal",
        "follow"
      );
      const other = createFixtureNpc("npc-other", 1);
      const npcs = Object.freeze([firstFollower, other]);
      fixture.runtime.notifyNpcCommandChanged(firstFollower.id, "follow");
      updateFixture(fixture, { deltaSeconds: 0, npcs });
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      let frame = updateFixture(fixture, { deltaSeconds: 20, npcs });
      const unbrainwashedMissionIds = frame.playerMissions
        .filter(
          (mission) =>
            mission.state === "active" &&
            (mission.kind === "player-location" ||
              mission.kind === "player-follower-acquire" ||
              mission.kind === "player-follower-escort")
        )
        .map((mission) => mission.id);
      assert(
        unbrainwashedMissionIds.length === 3,
        `hit-a前に未洗脳Missionを3件用意できません: ${JSON.stringify(frame.playerMissions)}`
      );

      frame = updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "hit-a",
        npcs
      });
      assert(
        unbrainwashedMissionIds.every((missionId) =>
          frame.playerMissions.some(
            (mission) =>
              mission.id === missionId &&
              mission.state === "failed" &&
              mission.terminalReason === "player-hit"
          )
        ) &&
          frame.playerMissions.every((mission) => mission.state !== "active"),
        "hit-a開始時に表示中の未洗脳Missionをすべて失敗へ更新しません。"
      );

      frame = updateFixture(fixture, {
        deltaSeconds: 4,
        playerState: "hit-b",
        npcs
      });
      assert(
        frame.playerMissions.length === 0,
        "hit-b中に4秒経過後もMissionを表示しました。"
      );
      frame = updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-in-progress",
        npcs
      });
      assert(
        frame.playerMissions.length === 0,
        "洗脳進行中にMissionを生成しました。"
      );

      frame = updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-gun",
        npcs
      });
      const brainwashedMissions = frame.playerMissions.filter(
        (mission) =>
          mission.state === "active" &&
          (mission.kind === "player-brainwash-target" ||
            mission.kind === "player-first-follower-brainwash")
      );
      assert(
        brainwashedMissions.length === 1 &&
          brainwashedMissions[0].startedAtSeconds === 44,
        `G確定時に洗脳済みMissionを即時1件生成しません: ${JSON.stringify(frame.playerMissions)}`
      );
      fixture.runtime.dispose();
      return "hit-aで未洗脳3件を失敗、hit-b/progress非表示、G確定時44秒に1件";
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
        deltaSeconds: 101,
        playerX: lateLocationTarget.navigationLocation.position.x
      });
      const lateLocationResult = lateLocation.runtime
        .getMissions()
        .find((mission) => mission.id === lateLocationMission.id);
      assert(
        lateLocationResult?.state === "failed" &&
          lateLocationResult.terminalReason === "deadline" &&
          lateLocationResult.terminalAtSeconds === 120,
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
        deltaSeconds: 100,
        playerX: exactLocationTarget.navigationLocation.position.x
      });
      const exactLocationResult = exactLocation.runtime
        .getMissions()
        .find((mission) => mission.id === exactLocationMission.id);
      assert(
        exactLocationResult?.state === "completed" &&
          exactLocationResult.terminalReason === "arrived" &&
          exactLocationResult.terminalAtSeconds === 120,
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
        deltaSeconds: 161,
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
          lateTransitionResult.terminalAtSeconds === 180,
        `期限後の洗脳イベントが成功しました: ${JSON.stringify(lateTransitionResult)}`
      );
      lateTransition.runtime.dispose();
      return "期限超過はVolume・イベント前にdeadline失敗、期限同時刻のVolumeは成功";
    }),
    executeTest("状況Mission期限切れは通常Player補充を抑止しない", () => {
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.9, 0.9, 0.9, 0.1, 0, 0])
      });
      const first = createFixtureNpc(
        "npc-first",
        0.5,
        "brainwash-complete-gun",
        "follow",
        "player"
      );
      const other = createFixtureNpc("npc-other", 1);
      const remaining = createFixtureNpc("npc-remaining", 2);
      const npcs = Object.freeze([first, other, remaining]);
      fixture.runtime.notifyNpcCommandChanged(first.id, "follow");
      updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-gun",
        npcs
      });
      other.state = "brainwash-in-progress";
      updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-gun",
        npcs,
        transitions: Object.freeze([
          brainwashTransition(other.id, "player", false)
        ])
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
    executeTest("洗脳人数は初回1・以後最大3、distinctと達成不能を判定", () => {
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([0, 0.1, 0, 0.99])
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 1),
        createFixtureNpc("npc-b", 2),
        createFixtureNpc("npc-c", 3),
        createFixtureNpc("npc-d", 4)
      ]);
      let frame = updateFixture(fixture, {
        deltaSeconds: 20,
        playerState: "brainwash-complete-gun",
        npcs
      });
      const first = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-brainwash-target" && mission.state === "active"
      );
      if (!first || first.target.kind !== "brainwash-count") {
        throw new Error("初回洗脳人数Missionがありません。");
      }
      assert(
        first.target.requiredCount === 1 &&
          first.target.brainwashedCount === 0 &&
          frame.missionTargetActorIds.length === 0,
        "初回洗脳人数Missionが1人固定またはActor targetなしではありません。"
      );
      npcs[0].state = "brainwash-in-progress";
      updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-gun",
        npcs,
        transitions: Object.freeze([brainwashTransition(npcs[0].id, "player", false)])
      });

      frame = updateFixture(fixture, {
        deltaSeconds: 20,
        playerState: "brainwash-complete-gun",
        npcs
      });
      const second = frame.playerMissions.find(
        (mission) =>
          mission.kind === "player-brainwash-target" && mission.state === "active"
      );
      if (!second || second.target.kind !== "brainwash-count") {
        throw new Error("2回目の洗脳人数Missionがありません。");
      }
      assert(
        second.target.requiredCount === 3 &&
          second.title === "3人洗脳する" &&
          !second.targetDisplayName.includes("npc-"),
        `2回目の3人目標またはID非表示が不正です: ${JSON.stringify(second)}`
      );

      npcs[1].state = "brainwash-in-progress";
      updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-gun",
        npcs,
        transitions: Object.freeze([
          brainwashTransition(npcs[1].id, "player", false),
          brainwashTransition(npcs[1].id, "player", false)
        ])
      });
      npcs[2].state = "brainwash-in-progress";
      updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-no-gun",
        npcs,
        transitions: Object.freeze([
          brainwashTransition(npcs[2].id, "npc-helper", true)
        ])
      });
      let progress = fixture.runtime.getMissions().find(
        (mission) => mission.id === second.id
      );
      assert(
        progress?.state === "active" &&
          progress.target.kind === "brainwash-count" &&
          progress.target.brainwashedCount === 2,
        "Player GとN補助の異なる2人だけをdistinct計上できません。"
      );

      npcs[3].state = "brainwash-in-progress";
      updateFixture(fixture, {
        deltaSeconds: 0,
        playerState: "brainwash-complete-no-gun",
        npcs,
        transitions: Object.freeze([
          brainwashTransition(npcs[3].id, "npc-helper", false)
        ])
      });
      progress = fixture.runtime.getMissions().find(
        (mission) => mission.id === second.id
      );
      assert(
        progress?.state === "failed" &&
          progress.terminalReason === "target-unavailable" &&
          progress.target.kind === "brainwash-count" &&
          progress.target.brainwashedCount === 2,
        "阻止なし第三者を非計上にして達成不能失敗へ遷移できません。"
      );
      fixture.runtime.dispose();
      return "初回1人・2回目3人、G/N distinct 2人、阻止なし第三者で達成不能失敗";
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
          thirdParty.terminalReason === "target-unavailable" &&
          thirdParty.target.kind === "brainwash-count" &&
          thirdParty.target.brainwashedCount === 0,
        "阻止なし第三者攻撃を人数へ数えず達成不能失敗にできません。"
      );
      return "Player GとN阻止補助は人数へ計上、同frame phase離脱でも成功優先、阻止なし第三者は非計上";
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
