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
  const sharedArea = Object.freeze({ id: "area-shared" }) as StageMissionLocation["area"];
  const missionLocations = Object.freeze(
    specs.map(([id, floorId, displayName], index) => {
      const area = containsAll
        ? sharedArea
        : (Object.freeze({ id: `area-${id}` }) as StageMissionLocation["area"]);
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
    areas: Object.freeze([]),
    missionLocations,
    stairLandings: Object.freeze([]),
    elevatorLandings: Object.freeze([]),
    broadcastConsole: Object.freeze({ id: "broadcast-console" }),
    getFloorMap: (floorId: StageMissionLocation["floorId"]) =>
      floorMapById.get(floorId) ?? null,
    getAreaById: () => null,
    getMissionLocationById: (id: string) => byId.get(id) ?? null,
    findArea: (point: Vector3) => {
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
    executeTest("20秒schedulerと50%境界", () => {
      assert(
        MISSION_VIEW_REJECTS_INVALID_KIND_REASON,
        "V2MissionViewがkindに不正な終了理由を許可しています。"
      );
      assert(
        FOLLOWER_ACQUIRE_REJECTS_ACTOR_TARGET,
        "Follower獲得MissionがActor targetを許可しています。"
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
    executeTest("Follower獲得人数とdistinct進捗", () => {
      const fixture = createMissionFixture({
        containsAll: true,
        playerRandom: createSequenceRandom([
          0.1, 0,
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
          0.1, 0,
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
    executeTest("Player LocationはArea進入で完了し階表示", () => {
      const fixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.1, 0, 0.17])
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
        playerRandom: createSequenceRandom([0.1, 0, 0])
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
        playerRandom: createSequenceRandom([0.1, 0, 0.99])
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
    executeTest("Follower護衛はArea、NPC LocationはAnchor Volume", () => {
      const escortFixture = createMissionFixture({
        playerRandom: createSequenceRandom([0.1, 0.99, 0.17])
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
      if (!escort || escort.target.kind !== "actor-location") {
        throw new Error("Follower護衛Missionがありません。");
      }
      assert(
        escort.target.locationId === "f03-art" &&
          escort.targetDisplayName === `${follower.id} → 3F 美術室`,
        `Follower護衛の階表示が不正です: ${escort.targetDisplayName}`
      );
      const escortLocation = escortFixture.locations.getMissionLocationById(
        escort.target.locationId
      )!;
      const areaEntryX = escortLocation.navigationLocation.position.x + 0.25;
      follower.footPosition.x = areaEntryX;
      frame = updateFixture(escortFixture, {
        deltaSeconds: 0,
        playerX: areaEntryX,
        npcs: Object.freeze([follower])
      });
      assert(
        frame.playerMissions.some(
          (mission) =>
            mission.id === escort.id &&
            mission.state === "completed" &&
            mission.terminalReason === "arrived"
        ),
        "PlayerとFollowerが同じ部屋Areaへ入っても護衛Missionが完了しません。"
      );
      escortFixture.runtime.dispose();

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
      return "護衛は双方のArea進入、NPC通常移動は従来Anchor Volume到達";
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
