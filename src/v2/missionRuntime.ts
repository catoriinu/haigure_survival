import { Vector3 } from "@babylonjs/core";

import type {
  StageLocationAssetRegistry,
  StageMissionLocation
} from "../world/stageLocationAssets";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import type { V2CharacterState } from "./combatTypes";
import type {
  V2NpcCommandMode,
  V2NpcLocationMissionAssignment,
  V2NpcLocationMissionSnapshot,
  V2NpcStateTransitionEvent
} from "./npcSystem";

export const V2_MISSION_SCHEDULER_INTERVAL_SECONDS = 20;
export const V2_MISSION_TERMINAL_DISPLAY_SECONDS = 4;
export const V2_PLAYER_NORMAL_MISSION_MAXIMUM = 3;
export const V2_PLAYER_SITUATION_MISSION_MAXIMUM = 1;
export const V2_NPC_NORMAL_MISSION_MAXIMUM = 8;
export const V2_NPC_NORMAL_MISSIONS_PER_TICK = 2;

const PLAYER_LOCATION_DEADLINE_SECONDS = 120;
const PLAYER_FOLLOWER_ACQUIRE_DEADLINE_SECONDS = 120;
const PLAYER_FOLLOWER_ESCORT_DEADLINE_SECONDS = 240;
const PLAYER_BRAINWASH_DEADLINE_SECONDS = 180;
const PLAYER_FIRST_FOLLOWER_BRAINWASH_DEADLINE_SECONDS = 240;
const PLAYER_ESCAPE_DEADLINE_SECONDS = 45;
const NPC_LOCATION_DEADLINE_SECONDS = 180;
const BROADCAST_LOCATION_DEADLINE_SECONDS = 180;
const ESCAPE_DISTANCE = 12 * BLENDER_METERS_TO_WORLD_UNITS;
const ESCAPE_HOLD_SECONDS = 5;
const GYM_LOCATION_ID = "gym";
const BROADCAST_ROOM_LOCATION_ID = "f02-broadcast";
const PLAYER_ID = "player";

export const V2_REQUIRED_ASSEMBLY_VENUE_IDS = Object.freeze([
  "assembly-courtyard",
  "assembly-gym"
] as const);

export type V2MissionKind =
  | "player-location"
  | "player-follower-acquire"
  | "player-follower-escort"
  | "player-brainwash-target"
  | "player-first-follower-brainwash"
  | "player-first-follower-escape"
  | "npc-location";

export type V2MissionState =
  | "active"
  | "completed"
  | "failed"
  | "cancelled";

export type V2MissionSource = "normal" | "broadcast" | "situation";

export type V2MissionAssignee =
  | Readonly<{ kind: "player" }>
  | Readonly<{ kind: "npc"; npcId: string }>;

export type V2MissionTarget =
  | Readonly<{ kind: "actor"; actorId: string }>
  | Readonly<{ kind: "location"; locationId: string }>
  | Readonly<{
      kind: "actor-location";
      actorId: string;
      locationId: string;
    }>;

export type V2MissionCompletionReason =
  | "arrived"
  | "follow-established"
  | "target-brainwashed"
  | "escaped";

export type V2MissionFailureReason =
  | "deadline"
  | "follow-ended"
  | "target-unavailable"
  | "player-brainwash-started"
  | "brainwashed-by-third-party";

export type V2MissionCancellationReason =
  | "phase-ended"
  | "broadcast-replaced"
  | "normal-replaced-by-broadcast"
  | "player-brainwash-started";

export type V2MissionTerminalReason =
  | V2MissionCompletionReason
  | V2MissionFailureReason
  | V2MissionCancellationReason;

export type V2MissionOutcome =
  | Readonly<{
      state: "active";
      terminalAtSeconds: null;
      terminalReason: null;
    }>
  | Readonly<{
      state: "completed";
      terminalAtSeconds: number;
      terminalReason: V2MissionCompletionReason;
    }>
  | Readonly<{
      state: "failed";
      terminalAtSeconds: number;
      terminalReason: V2MissionFailureReason;
    }>
  | Readonly<{
      state: "cancelled";
      terminalAtSeconds: number;
      terminalReason: V2MissionCancellationReason;
    }>;

type V2PlayerMissionAssignee = Readonly<{ kind: "player" }>;
type V2NpcMissionAssignee = Readonly<{ kind: "npc"; npcId: string }>;
type V2ActorMissionTarget = Readonly<{ kind: "actor"; actorId: string }>;
type V2LocationMissionTarget = Readonly<{
  kind: "location";
  locationId: string;
}>;
type V2ActorLocationMissionTarget = Readonly<{
  kind: "actor-location";
  actorId: string;
  locationId: string;
}>;

export type V2MissionDefinition =
  | Readonly<{
      kind: "player-location";
      source: "normal";
      assignee: V2PlayerMissionAssignee;
      target: V2LocationMissionTarget;
    }>
  | Readonly<{
      kind: "player-follower-acquire";
      source: "normal";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "player-brainwash-target";
      source: "normal";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "player-first-follower-brainwash";
      source: "normal";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "player-follower-escort";
      source: "normal";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorLocationMissionTarget;
    }>
  | Readonly<{
      kind: "player-first-follower-escape";
      source: "situation";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "npc-location";
      source: "normal";
      assignee: V2NpcMissionAssignee;
      target: V2LocationMissionTarget;
    }>
  | Readonly<{
      kind: "npc-location";
      source: "broadcast";
      assignee: V2NpcMissionAssignee;
      target: V2LocationMissionTarget;
    }>;

type V2MissionSharedView = Readonly<{
  id: string;
  title: string;
  targetDisplayName: string;
  startedAtSeconds: number;
  deadlineAtSeconds: number;
}>;

type V2MissionAllowedOutcome<
  CompletionReason extends V2MissionCompletionReason,
  FailureReason extends V2MissionFailureReason,
  CancellationReason extends V2MissionCancellationReason
> =
  | Extract<V2MissionOutcome, { state: "active" }>
  | Readonly<{
      state: "completed";
      terminalAtSeconds: number;
      terminalReason: CompletionReason;
    }>
  | Readonly<{
      state: "failed";
      terminalAtSeconds: number;
      terminalReason: FailureReason;
    }>
  | Readonly<{
      state: "cancelled";
      terminalAtSeconds: number;
      terminalReason: CancellationReason;
    }>;

type V2MissionViewFor<
  Definition extends V2MissionDefinition,
  CompletionReason extends V2MissionCompletionReason,
  FailureReason extends V2MissionFailureReason,
  CancellationReason extends V2MissionCancellationReason
> = V2MissionSharedView &
  Definition &
  V2MissionAllowedOutcome<
    CompletionReason,
    FailureReason,
    CancellationReason
  >;

export type V2MissionView =
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-location" }>,
      "arrived",
      "deadline",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-follower-acquire" }>,
      "follow-established",
      "deadline" | "target-unavailable",
      "phase-ended" | "player-brainwash-started"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-follower-escort" }>,
      "arrived",
      "deadline" | "follow-ended",
      "phase-ended" | "player-brainwash-started"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-brainwash-target" }>,
      "target-brainwashed",
      "deadline" | "target-unavailable" | "brainwashed-by-third-party",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<
        V2MissionDefinition,
        { kind: "player-first-follower-brainwash" }
      >,
      "target-brainwashed",
      "deadline" | "target-unavailable" | "brainwashed-by-third-party",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-first-follower-escape" }>,
      "escaped",
      "deadline" | "target-unavailable" | "player-brainwash-started",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<
        V2MissionDefinition,
        { kind: "npc-location"; source: "normal" }
      >,
      "arrived",
      "deadline" | "target-unavailable",
      "phase-ended" | "normal-replaced-by-broadcast"
    >
  | V2MissionViewFor<
      Extract<
        V2MissionDefinition,
        { kind: "npc-location"; source: "broadcast" }
      >,
      "arrived",
      "deadline" | "target-unavailable",
      "phase-ended" | "broadcast-replaced"
    >;

export type V2SchoolInstruction = "courtyard" | "gym";

export type V2BroadcastCommand =
  | "gather-gym"
  | "flee"
  | "become-haigure-human";

export type V2MissionNpcSnapshot = Readonly<{
  id: string;
  state: V2CharacterState;
  footPosition: Vector3;
  commandMode: V2NpcCommandMode;
  targetId: string | null;
  locationMission: V2NpcLocationMissionSnapshot | null;
}>;

export type V2MissionUpdate = Readonly<{
  deltaSeconds: number;
  phase: "playing" | "assembly" | "execution" | "execution-complete";
  playerState: V2CharacterState;
  playerFootPosition: Vector3;
  npcs: readonly V2MissionNpcSnapshot[];
  npcStateTransitions: readonly V2NpcStateTransitionEvent[];
}>;

export type V2MissionFrame = Readonly<{
  elapsedSeconds: number;
  playerMissions: readonly V2MissionView[];
  activeNpcMissions: readonly V2MissionView[];
  missionTargetActorIds: readonly string[];
  missionTargetLocationIds: readonly string[];
  firstFollowerId: string | null;
  lastSchoolInstruction: V2SchoolInstruction;
}>;

export const resolveV2MissionAssemblyVenueId = (
  frame: Pick<V2MissionFrame, "lastSchoolInstruction">
): (typeof V2_REQUIRED_ASSEMBLY_VENUE_IDS)[number] =>
  frame.lastSchoolInstruction === "gym"
    ? V2_REQUIRED_ASSEMBLY_VENUE_IDS[1]
    : V2_REQUIRED_ASSEMBLY_VENUE_IDS[0];

export type V2MissionNpcPort = Readonly<{
  assignLocationMission(
    npcId: string,
    assignment: V2NpcLocationMissionAssignment
  ): void;
  cancelLocationMission(npcId: string, missionId: string): boolean;
  convertHaigureNpcsToGun(): readonly string[];
}>;

export type V2MissionRuntimeOptions = Readonly<{
  locations: StageLocationAssetRegistry;
  playerRandom: () => number;
  npcRandom: () => number;
  broadcastRandom: () => number;
  npcPort: V2MissionNpcPort;
}>;

export interface V2MissionRuntime {
  update(update: V2MissionUpdate): V2MissionFrame;
  notifyNpcCommandChanged(npcId: string, mode: V2NpcCommandMode): void;
  executeBroadcast(
    command: V2BroadcastCommand,
    update: Omit<
      V2MissionUpdate,
      "deltaSeconds" | "npcStateTransitions" | "phase"
    >
  ): void;
  getFrame(): V2MissionFrame;
  getMissions(): readonly V2MissionView[];
  dispose(): void;
}

type MutableMission = {
  id: string;
  kind: V2MissionKind;
  source: V2MissionSource;
  state: V2MissionState;
  assignee: V2MissionAssignee;
  target: V2MissionTarget;
  title: string;
  targetDisplayName: string;
  startedAtSeconds: number;
  deadlineAtSeconds: number;
  terminalAtSeconds: number | null;
  terminalReason: V2MissionTerminalReason | null;
};

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const isUnbrainwashedState = (state: V2CharacterState) =>
  state === "normal" || state === "evade";

const isCompletedBrainwashState = (state: V2CharacterState) =>
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun" ||
  state === "brainwash-complete-haigure";

const isMovementCapableState = (state: V2CharacterState) =>
  state === "normal" ||
  state === "evade" ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun";

const cloneMissionTarget = (target: V2MissionTarget): V2MissionTarget => {
  if (target.kind === "actor") {
    return Object.freeze({ kind: "actor", actorId: target.actorId });
  }
  if (target.kind === "location") {
    return Object.freeze({ kind: "location", locationId: target.locationId });
  }
  return Object.freeze({
    kind: "actor-location",
    actorId: target.actorId,
    locationId: target.locationId
  });
};

const COMPLETION_REASONS: readonly V2MissionCompletionReason[] =
  Object.freeze([
    "arrived",
    "follow-established",
    "target-brainwashed",
    "escaped"
  ]);
const FAILURE_REASONS: readonly V2MissionFailureReason[] = Object.freeze([
  "deadline",
  "follow-ended",
  "target-unavailable",
  "player-brainwash-started",
  "brainwashed-by-third-party"
]);
const CANCELLATION_REASONS: readonly V2MissionCancellationReason[] =
  Object.freeze([
    "phase-ended",
    "broadcast-replaced",
    "normal-replaced-by-broadcast",
    "player-brainwash-started"
  ]);

const isMissionTerminalReasonAllowed = (
  mission: Pick<MutableMission, "kind" | "source">,
  state: Exclude<V2MissionState, "active">,
  reason: V2MissionTerminalReason
) => {
  if (state === "completed") {
    return (
      ((mission.kind === "player-location" ||
        mission.kind === "player-follower-escort" ||
        mission.kind === "npc-location") &&
        reason === "arrived") ||
      (mission.kind === "player-follower-acquire" &&
        reason === "follow-established") ||
      ((mission.kind === "player-brainwash-target" ||
        mission.kind === "player-first-follower-brainwash") &&
        reason === "target-brainwashed") ||
      (mission.kind === "player-first-follower-escape" &&
        reason === "escaped")
    );
  }
  if (state === "failed") {
    if (reason === "deadline") {
      return true;
    }
    if (mission.kind === "player-follower-acquire") {
      return reason === "target-unavailable";
    }
    if (mission.kind === "player-follower-escort") {
      return reason === "follow-ended";
    }
    if (
      mission.kind === "player-brainwash-target" ||
      mission.kind === "player-first-follower-brainwash"
    ) {
      return (
        reason === "target-unavailable" ||
        reason === "brainwashed-by-third-party"
      );
    }
    if (mission.kind === "player-first-follower-escape") {
      return (
        reason === "target-unavailable" ||
        reason === "player-brainwash-started"
      );
    }
    return mission.kind === "npc-location" && reason === "target-unavailable";
  }
  if (reason === "phase-ended") {
    return true;
  }
  if (
    (mission.kind === "player-follower-acquire" ||
      mission.kind === "player-follower-escort") &&
    reason === "player-brainwash-started"
  ) {
    return true;
  }
  return (
    mission.kind === "npc-location" &&
    ((mission.source === "normal" &&
      reason === "normal-replaced-by-broadcast") ||
      (mission.source === "broadcast" && reason === "broadcast-replaced"))
  );
};

const freezeMission = (mission: MutableMission): V2MissionView => {
  if (
    (mission.state === "active" &&
      (mission.terminalAtSeconds !== null ||
        mission.terminalReason !== null)) ||
    (mission.state === "completed" &&
      (mission.terminalAtSeconds === null ||
        mission.terminalReason === null ||
        !COMPLETION_REASONS.includes(
          mission.terminalReason as V2MissionCompletionReason
        ))) ||
    (mission.state === "failed" &&
      (mission.terminalAtSeconds === null ||
        mission.terminalReason === null ||
        !FAILURE_REASONS.includes(
          mission.terminalReason as V2MissionFailureReason
        ))) ||
    (mission.state === "cancelled" &&
      (mission.terminalAtSeconds === null ||
        mission.terminalReason === null ||
        !CANCELLATION_REASONS.includes(
          mission.terminalReason as V2MissionCancellationReason
        )))
  ) {
    throw new Error(`Mission outcomeが不正です: ${mission.id}`);
  }
  const playerAssigned = mission.assignee.kind === "player";
  const locationTarget = mission.target.kind === "location";
  const actorTarget = mission.target.kind === "actor";
  const actorLocationTarget = mission.target.kind === "actor-location";
  const definitionValid =
    (mission.kind === "player-location" &&
      mission.source === "normal" &&
      playerAssigned &&
      locationTarget) ||
    ((mission.kind === "player-follower-acquire" ||
      mission.kind === "player-brainwash-target" ||
      mission.kind === "player-first-follower-brainwash") &&
      mission.source === "normal" &&
      playerAssigned &&
      actorTarget) ||
    (mission.kind === "player-follower-escort" &&
      mission.source === "normal" &&
      playerAssigned &&
      actorLocationTarget) ||
    (mission.kind === "player-first-follower-escape" &&
      mission.source === "situation" &&
      playerAssigned &&
      actorTarget) ||
    (mission.kind === "npc-location" &&
      (mission.source === "normal" || mission.source === "broadcast") &&
      !playerAssigned &&
      locationTarget);
  if (!definitionValid) {
    throw new Error(`Mission definitionが不正です: ${mission.id}`);
  }
  if (
    mission.state !== "active" &&
    !isMissionTerminalReasonAllowed(
      mission,
      mission.state,
      mission.terminalReason!
    )
  ) {
    throw new Error(
      `Mission kindと終了理由の組合せが不正です: ${mission.id}/${mission.kind}/${mission.state}/${mission.terminalReason}`
    );
  }
  return Object.freeze({
    ...mission,
    assignee:
      mission.assignee.kind === "player"
        ? Object.freeze({ kind: "player" as const })
        : Object.freeze({
            kind: "npc" as const,
            npcId: mission.assignee.npcId
          }),
    target: cloneMissionTarget(mission.target)
  }) as unknown as V2MissionView;
};

const targetActorId = (target: V2MissionTarget) =>
  target.kind === "actor" || target.kind === "actor-location"
    ? target.actorId
    : null;

const targetLocationId = (target: V2MissionTarget) =>
  target.kind === "location" || target.kind === "actor-location"
    ? target.locationId
    : null;

const validateRandom = (name: string, random: () => number) => {
  if (typeof random !== "function") {
    throw new Error(`${name}には乱数関数が必要です。`);
  }
  return () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`${name}は0以上1未満を返す必要があります。`);
    }
    return value;
  };
};

const pickRandom = <T>(values: readonly T[], random: () => number): T => {
  if (values.length === 0) {
    throw new Error("空の候補からMission対象を抽選できません。");
  }
  return values[Math.floor(random() * values.length)];
};

const requireLocation = (
  locations: StageLocationAssetRegistry,
  locationId: string
) => {
  const location = locations.getMissionLocationById(locationId);
  if (!location) {
    throw new Error(`未登録のMission Locationです: ${locationId}`);
  }
  return location;
};

const createNpcAssignment = (
  missionId: string,
  source: "normal" | "broadcast",
  location: StageMissionLocation
): V2NpcLocationMissionAssignment =>
  Object.freeze({
    missionId,
    source,
    locationId: location.id,
    destination: Object.freeze({
      position: location.navigationLocation.position.clone(),
      polygonRef: location.navigationLocation.polygonRef
    })
  });

export const resolveV2BroadcastCommands = (
  playerState: V2CharacterState
): Readonly<{
  primary: "gather-gym";
  secondary: "flee" | "become-haigure-human" | null;
}> =>
  Object.freeze({
    primary: "gather-gym" as const,
    secondary: isUnbrainwashedState(playerState)
      ? ("flee" as const)
      : isCompletedBrainwashState(playerState)
        ? ("become-haigure-human" as const)
        : null
  });

export const createV2MissionRuntime = ({
  locations,
  playerRandom,
  npcRandom,
  broadcastRandom,
  npcPort
}: V2MissionRuntimeOptions): V2MissionRuntime => {
  const nextPlayerRandom = validateRandom("player Mission random", playerRandom);
  const nextNpcRandom = validateRandom("NPC Mission random", npcRandom);
  const nextBroadcastRandom = validateRandom(
    "放送Mission random",
    broadcastRandom
  );
  requireLocation(locations, GYM_LOCATION_ID);
  requireLocation(locations, BROADCAST_ROOM_LOCATION_ID);

  const missions: MutableMission[] = [];
  let elapsedSeconds = 0;
  let nextSchedulerAtSeconds = V2_MISSION_SCHEDULER_INTERVAL_SECONDS;
  let missionSequence = 0;
  let firstFollowerId: string | null = null;
  let escapeMissionStarted = false;
  let escapeSafeSeconds = 0;
  let lastSchoolInstruction: V2SchoolInstruction = "courtyard";
  let phase: V2MissionUpdate["phase"] = "playing";
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2MissionRuntimeは使用できません。");
    }
  };

  const createMissionId = () => {
    missionSequence += 1;
    return `mission-${String(missionSequence).padStart(4, "0")}`;
  };

  const addMission = (
    kind: V2MissionKind,
    source: V2MissionSource,
    assignee: V2MissionAssignee,
    target: V2MissionTarget,
    title: string,
    targetDisplayName: string,
    deadlineSeconds: number,
    startedAtSeconds: number,
    id = createMissionId()
  ) => {
    const mission: MutableMission = {
      id,
      kind,
      source,
      state: "active",
      assignee,
      target,
      title,
      targetDisplayName,
      startedAtSeconds,
      deadlineAtSeconds: startedAtSeconds + deadlineSeconds,
      terminalAtSeconds: null,
      terminalReason: null
    };
    missions.push(mission);
    return mission;
  };

  const finishMission = (
    mission: MutableMission,
    state: Exclude<V2MissionState, "active">,
    reason: V2MissionTerminalReason,
    terminalAtSeconds = elapsedSeconds
  ) => {
    if (mission.state !== "active") {
      return;
    }
    if (!isMissionTerminalReasonAllowed(mission, state, reason)) {
      throw new Error(
        `Mission kindへ不正な終了理由が指定されました: ${mission.id}/${mission.kind}/${state}/${reason}`
      );
    }
    mission.state = state;
    mission.terminalAtSeconds = terminalAtSeconds;
    mission.terminalReason = reason;
    if (mission.assignee.kind === "npc") {
      if (!npcPort.cancelLocationMission(mission.assignee.npcId, mission.id)) {
        throw new Error(
          `NPC Location Mission割当を取消できません: ${mission.assignee.npcId}/${mission.id}`
        );
      }
    }
  };

  const activeMissions = () =>
    missions.filter((mission) => mission.state === "active");

  const activePlayerNormalMissions = () =>
    activeMissions().filter(
      (mission) =>
        mission.assignee.kind === "player" && mission.source === "normal"
    );

  const activeNpcNormalMissions = () =>
    activeMissions().filter(
      (mission) =>
        mission.assignee.kind === "npc" && mission.source === "normal"
    );

  const activeSituationMissions = () =>
    activeMissions().filter((mission) => mission.source === "situation");

  const activeTargetActorIds = () =>
    new Set(
      activeMissions()
        .map((mission) => targetActorId(mission.target))
        .filter((id): id is string => id !== null)
    );

  const activeTargetLocationIds = () =>
    new Set(
      activeMissions()
        .map((mission) => targetLocationId(mission.target))
        .filter((id): id is string => id !== null)
    );

  const availableLocations = (position: Vector3) => {
    const usedLocationIds = activeTargetLocationIds();
    return locations.missionLocations.filter(
      (location) =>
        !usedLocationIds.has(location.id) && !location.contains(position)
    );
  };

  const createPlayerLocationMission = (
    playerFootPosition: Vector3,
    startedAtSeconds: number
  ) => {
    const candidates = availableLocations(playerFootPosition);
    if (candidates.length === 0) {
      return false;
    }
    const location = pickRandom(candidates, nextPlayerRandom);
    addMission(
      "player-location",
      "normal",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "location", locationId: location.id }),
      "目的地へ移動",
      location.displayName,
      PLAYER_LOCATION_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const createFollowerAcquireMission = (
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    const usedActorIds = activeTargetActorIds();
    const candidates = npcs.filter(
      (npc) =>
        isUnbrainwashedState(npc.state) &&
        npc.commandMode !== "follow" &&
        !usedActorIds.has(npc.id)
    );
    if (candidates.length === 0) {
      return false;
    }
    const target = pickRandom(candidates, nextPlayerRandom);
    addMission(
      "player-follower-acquire",
      "normal",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: target.id }),
      "Followerを増やす",
      target.id,
      PLAYER_FOLLOWER_ACQUIRE_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const createFollowerEscortMission = (
    playerFootPosition: Vector3,
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    if (firstFollowerId === null) {
      return false;
    }
    const follower = npcs.find((npc) => npc.id === firstFollowerId);
    if (
      !follower ||
      follower.commandMode !== "follow" ||
      !isUnbrainwashedState(follower.state) ||
      activeTargetActorIds().has(follower.id)
    ) {
      return false;
    }
    const candidates = availableLocations(playerFootPosition);
    if (candidates.length === 0) {
      return false;
    }
    const location = pickRandom(candidates, nextPlayerRandom);
    addMission(
      "player-follower-escort",
      "normal",
      Object.freeze({ kind: "player" }),
      Object.freeze({
        kind: "actor-location",
        actorId: follower.id,
        locationId: location.id
      }),
      "最初のFollowerを護衛",
      `${follower.id} → ${location.displayName}`,
      PLAYER_FOLLOWER_ESCORT_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const createBrainwashTargetMission = (
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    const usedActorIds = activeTargetActorIds();
    const candidates = npcs.filter(
      (npc) => isUnbrainwashedState(npc.state) && !usedActorIds.has(npc.id)
    );
    if (candidates.length === 0) {
      return false;
    }
    const target = pickRandom(candidates, nextPlayerRandom);
    addMission(
      "player-brainwash-target",
      "normal",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: target.id }),
      "指定対象を洗脳",
      target.id,
      PLAYER_BRAINWASH_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const createFirstFollowerBrainwashMission = (
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    if (firstFollowerId === null || activeTargetActorIds().has(firstFollowerId)) {
      return false;
    }
    const follower = npcs.find((npc) => npc.id === firstFollowerId);
    if (!follower || !isUnbrainwashedState(follower.state)) {
      return false;
    }
    addMission(
      "player-first-follower-brainwash",
      "normal",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: follower.id }),
      "最初のFollowerを洗脳",
      follower.id,
      PLAYER_FIRST_FOLLOWER_BRAINWASH_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const schedulePlayerMission = (
    update: V2MissionUpdate,
    scheduledAtSeconds: number
  ) => {
    if (
      activePlayerNormalMissions().length >=
        V2_PLAYER_NORMAL_MISSION_MAXIMUM ||
      nextPlayerRandom() >= 0.5
    ) {
      return;
    }
    const activeKinds = new Set(
      activePlayerNormalMissions().map((mission) => mission.kind)
    );
    const usedActorIds = activeTargetActorIds();
    const hasAvailableLocation =
      availableLocations(update.playerFootPosition).length > 0;
    const hasFollowerAcquireTarget = update.npcs.some(
      (npc) =>
        isUnbrainwashedState(npc.state) &&
        npc.commandMode !== "follow" &&
        !usedActorIds.has(npc.id)
    );
    const firstFollower =
      firstFollowerId === null
        ? null
        : update.npcs.find((npc) => npc.id === firstFollowerId) ?? null;
    const canEscortFirstFollower =
      firstFollower !== null &&
      firstFollower.commandMode === "follow" &&
      isUnbrainwashedState(firstFollower.state) &&
      !usedActorIds.has(firstFollower.id) &&
      hasAvailableLocation;
    const hasBrainwashTarget = update.npcs.some(
      (npc) =>
        isUnbrainwashedState(npc.state) && !usedActorIds.has(npc.id)
    );
    const canBrainwashFirstFollower =
      firstFollower !== null &&
      isUnbrainwashedState(firstFollower.state) &&
      !usedActorIds.has(firstFollower.id);
    const weightedCandidates: Array<
      Readonly<{ weight: number; create(): boolean }>
    > = [];
    if (isUnbrainwashedState(update.playerState)) {
      if (
        !activeKinds.has("player-location") &&
        hasAvailableLocation
      ) {
        weightedCandidates.push(
          Object.freeze({
            weight: 50,
            create: () =>
              createPlayerLocationMission(
                update.playerFootPosition,
                scheduledAtSeconds
              )
          })
        );
      }
      if (
        !activeKinds.has("player-follower-acquire") &&
        hasFollowerAcquireTarget
      ) {
        weightedCandidates.push(
          Object.freeze({
            weight: 30,
            create: () =>
              createFollowerAcquireMission(update.npcs, scheduledAtSeconds)
          })
        );
      }
      if (
        !activeKinds.has("player-follower-escort") &&
        canEscortFirstFollower
      ) {
        weightedCandidates.push(
          Object.freeze({
            weight: 20,
            create: () =>
              createFollowerEscortMission(
                update.playerFootPosition,
                update.npcs,
                scheduledAtSeconds
              )
          })
        );
      }
    } else if (isCompletedBrainwashState(update.playerState)) {
      if (
        !activeKinds.has("player-brainwash-target") &&
        hasBrainwashTarget
      ) {
        weightedCandidates.push(
          Object.freeze({
            weight: 70,
            create: () =>
              createBrainwashTargetMission(update.npcs, scheduledAtSeconds)
          })
        );
      }
      if (
        !activeKinds.has("player-first-follower-brainwash") &&
        canBrainwashFirstFollower
      ) {
        weightedCandidates.push(
          Object.freeze({
            weight: 30,
            create: () =>
              createFirstFollowerBrainwashMission(
                update.npcs,
                scheduledAtSeconds
              )
          })
        );
      }
    }
    const totalWeight = weightedCandidates.reduce(
      (sum, candidate) => sum + candidate.weight,
      0
    );
    if (totalWeight === 0) {
      return;
    }
    let roll = nextPlayerRandom() * totalWeight;
    for (const candidate of weightedCandidates) {
      if (roll < candidate.weight) {
        if (!candidate.create()) {
          throw new Error("検証済みPlayer Mission候補を作成できません。");
        }
        return;
      }
      roll -= candidate.weight;
    }
  };

  const createNpcLocationMission = (
    npc: V2MissionNpcSnapshot,
    location: StageMissionLocation,
    source: "normal" | "broadcast",
    startedAtSeconds: number
  ) => {
    const id = createMissionId();
    const mission = addMission(
      "npc-location",
      source,
      Object.freeze({ kind: "npc", npcId: npc.id }),
      Object.freeze({ kind: "location", locationId: location.id }),
      source === "broadcast" ? "校内放送による移動" : "目的地へ移動",
      location.displayName,
      source === "broadcast"
        ? BROADCAST_LOCATION_DEADLINE_SECONDS
        : NPC_LOCATION_DEADLINE_SECONDS,
      startedAtSeconds,
      id
    );
    npcPort.assignLocationMission(
      npc.id,
      createNpcAssignment(mission.id, source, location)
    );
    return mission;
  };

  const scheduleNpcMissions = (
    update: V2MissionUpdate,
    scheduledAtSeconds: number
  ) => {
    const activeNormal = activeNpcNormalMissions();
    let remainingCapacity =
      V2_NPC_NORMAL_MISSION_MAXIMUM - activeNormal.length;
    const assignedNpcIds = new Set(
      activeMissions()
        .filter((mission) => mission.assignee.kind === "npc")
        .map((mission) =>
          mission.assignee.kind === "npc" ? mission.assignee.npcId : ""
        )
    );
    const candidates = update.npcs
      .filter(
        (npc) =>
          isMovementCapableState(npc.state) &&
          npc.commandMode !== "follow" &&
          !assignedNpcIds.has(npc.id)
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    for (
      let created = 0;
      created < V2_NPC_NORMAL_MISSIONS_PER_TICK &&
      remainingCapacity > 0 &&
      candidates.length > 0;
      created += 1
    ) {
      const npcIndex = Math.floor(nextNpcRandom() * candidates.length);
      const npc = candidates.splice(npcIndex, 1)[0];
      const locationCandidates = availableLocations(npc.footPosition);
      if (locationCandidates.length === 0) {
        continue;
      }
      const location = pickRandom(locationCandidates, nextNpcRandom);
      createNpcLocationMission(
        npc,
        location,
        "normal",
        scheduledAtSeconds
      );
      remainingCapacity -= 1;
    }
  };

  const processNpcStateTransitions = (
    transitions: readonly V2NpcStateTransitionEvent[]
  ) => {
    for (const transition of transitions) {
      if (transition.currentState !== "brainwash-in-progress") {
        continue;
      }
      for (const mission of activePlayerNormalMissions()) {
        const actorId = targetActorId(mission.target);
        if (
          actorId !== transition.npcId ||
          (mission.kind !== "player-brainwash-target" &&
            mission.kind !== "player-first-follower-brainwash")
        ) {
          continue;
        }
        const causedByPlayerGun =
          transition.hitSourceId === PLAYER_ID &&
          transition.hitOriginKind === "player-gun";
        const causedByAssistedThirdParty =
          transition.hitSourceId !== null &&
          transition.hitSourceId !== PLAYER_ID &&
          transition.hitOriginKind !== null &&
          transition.hitOriginKind !== "player-gun" &&
          transition.playerNoGunAssisted;
        if (causedByPlayerGun || causedByAssistedThirdParty) {
          finishMission(mission, "completed", "target-brainwashed");
        } else {
          finishMission(
            mission,
            "failed",
            "brainwashed-by-third-party"
          );
        }
      }
    }
  };

  const evaluateMissions = (update: V2MissionUpdate) => {
    const npcById = new Map(update.npcs.map((npc) => [npc.id, npc]));
    if (update.playerState === "brainwash-in-progress") {
      for (const mission of activePlayerNormalMissions()) {
        if (
          mission.kind === "player-follower-acquire" ||
          mission.kind === "player-follower-escort"
        ) {
          finishMission(mission, "cancelled", "player-brainwash-started");
        }
      }
      for (const mission of activeSituationMissions()) {
        finishMission(mission, "failed", "player-brainwash-started");
      }
    }

    for (const mission of [...activeMissions()]) {
      if (mission.kind === "player-location") {
        const locationId = targetLocationId(mission.target)!;
        if (requireLocation(locations, locationId).contains(update.playerFootPosition)) {
          finishMission(mission, "completed", "arrived");
        }
      } else if (mission.kind === "player-follower-escort") {
        const actorId = targetActorId(mission.target)!;
        const locationId = targetLocationId(mission.target)!;
        const follower = npcById.get(actorId);
        if (
          !follower ||
          !isUnbrainwashedState(follower.state)
        ) {
          finishMission(mission, "failed", "follow-ended");
        } else if (
          requireLocation(locations, locationId).contains(
            update.playerFootPosition
          ) &&
          requireLocation(locations, locationId).contains(
            follower.footPosition
          )
        ) {
          finishMission(mission, "completed", "arrived");
        }
      } else if (mission.kind === "player-follower-acquire") {
        const target = npcById.get(targetActorId(mission.target)!);
        if (!target || !isUnbrainwashedState(target.state)) {
          finishMission(mission, "failed", "target-unavailable");
        }
      } else if (
        mission.kind === "player-brainwash-target" ||
        mission.kind === "player-first-follower-brainwash"
      ) {
        const target = npcById.get(targetActorId(mission.target)!);
        if (!target) {
          finishMission(mission, "failed", "target-unavailable");
        }
      } else if (mission.kind === "player-first-follower-escape") {
        const target = npcById.get(targetActorId(mission.target)!);
        if (!target) {
          finishMission(mission, "failed", "target-unavailable");
        } else {
          const safe =
            Vector3.Distance(target.footPosition, update.playerFootPosition) >=
              ESCAPE_DISTANCE && target.targetId !== PLAYER_ID;
          escapeSafeSeconds = safe
            ? escapeSafeSeconds + update.deltaSeconds
            : 0;
          if (escapeSafeSeconds >= ESCAPE_HOLD_SECONDS) {
            finishMission(mission, "completed", "escaped");
          }
        }
      } else if (mission.kind === "npc-location") {
        const npc =
          mission.assignee.kind === "npc"
            ? npcById.get(mission.assignee.npcId)
            : null;
        const location = requireLocation(
          locations,
          targetLocationId(mission.target)!
        );
        if (!npc) {
          finishMission(mission, "failed", "target-unavailable");
        } else if (
          npc.locationMission?.missionId === mission.id &&
          location.contains(npc.footPosition)
        ) {
          finishMission(mission, "completed", "arrived");
        }
      }
    }
  };

  const finishExpiredMissions = (
    atSeconds: number,
    boundary: "strictly-past" | "at-or-past"
  ) => {
    let playerMissionFinished = false;
    let npcMissionFinished = false;
    for (const mission of [...activeMissions()]) {
      const expired =
        boundary === "strictly-past"
          ? atSeconds > mission.deadlineAtSeconds
          : atSeconds >= mission.deadlineAtSeconds;
      if (expired) {
        if (mission.source === "normal") {
          playerMissionFinished ||= mission.assignee.kind === "player";
          npcMissionFinished ||= mission.assignee.kind === "npc";
        }
        finishMission(
          mission,
          "failed",
          "deadline",
          mission.deadlineAtSeconds
        );
      }
    }
    return Object.freeze({ playerMissionFinished, npcMissionFinished });
  };

  const maybeStartEscapeMission = (update: V2MissionUpdate) => {
    if (
      escapeMissionStarted ||
      firstFollowerId === null ||
      update.playerState === "brainwash-in-progress" ||
      activeSituationMissions().length >= V2_PLAYER_SITUATION_MISSION_MAXIMUM
    ) {
      return;
    }
    const follower = update.npcs.find((npc) => npc.id === firstFollowerId);
    if (!follower || !isCompletedBrainwashState(follower.state)) {
      return;
    }
    if (follower.targetId !== PLAYER_ID) {
      return;
    }
    escapeMissionStarted = true;
    escapeSafeSeconds = 0;
    addMission(
      "player-first-follower-escape",
      "situation",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: follower.id }),
      "最初のFollowerから逃げる",
      follower.id,
      PLAYER_ESCAPE_DEADLINE_SECONDS,
      elapsedSeconds
    );
  };

  const cancelBroadcastMissions = () => {
    for (const mission of activeMissions()) {
      if (mission.source === "broadcast") {
        finishMission(mission, "cancelled", "broadcast-replaced");
      }
    }
  };

  const cancelNormalNpcMission = (npcId: string) => {
    for (const mission of activeNpcNormalMissions()) {
      if (mission.assignee.kind === "npc" && mission.assignee.npcId === npcId) {
        finishMission(
          mission,
          "cancelled",
          "normal-replaced-by-broadcast"
        );
      }
    }
  };

  const buildFrame = (): V2MissionFrame => {
    const visiblePlayerMissions = missions
      .filter(
        (mission) =>
          mission.assignee.kind === "player" &&
          mission.state !== "cancelled" &&
          (mission.state === "active" ||
            (mission.terminalAtSeconds !== null &&
              elapsedSeconds - mission.terminalAtSeconds <
                V2_MISSION_TERMINAL_DISPLAY_SECONDS))
      )
      .map(freezeMission);
    const npcMissions = activeMissions()
      .filter((mission) => mission.assignee.kind === "npc")
      .map(freezeMission);
    const playerActiveMissions = visiblePlayerMissions.filter(
      (mission) => mission.state === "active"
    );
    return Object.freeze({
      elapsedSeconds,
      playerMissions: Object.freeze(visiblePlayerMissions),
      activeNpcMissions: Object.freeze(npcMissions),
      missionTargetActorIds: Object.freeze(
        playerActiveMissions
          .map((mission) => targetActorId(mission.target))
          .filter((id): id is string => id !== null)
      ),
      missionTargetLocationIds: Object.freeze(
        playerActiveMissions
          .map((mission) => targetLocationId(mission.target))
          .filter((id): id is string => id !== null)
      ),
      firstFollowerId,
      lastSchoolInstruction
    });
  };

  let frame = buildFrame();

  return {
    update: (update) => {
      assertActive();
      assertNonNegativeFiniteNumber("Mission deltaSeconds", update.deltaSeconds);
      elapsedSeconds += update.deltaSeconds;
      phase = update.phase;
      if (phase !== "playing") {
        processNpcStateTransitions(update.npcStateTransitions);
        for (const mission of activeMissions()) {
          finishMission(mission, "cancelled", "phase-ended");
        }
        frame = buildFrame();
        return frame;
      }

      while (nextSchedulerAtSeconds < elapsedSeconds) {
        const scheduledAtSeconds = nextSchedulerAtSeconds;
        const expired = finishExpiredMissions(
          scheduledAtSeconds,
          "at-or-past"
        );
        if (!expired.playerMissionFinished) {
          schedulePlayerMission(update, scheduledAtSeconds);
        }
        if (!expired.npcMissionFinished) {
          scheduleNpcMissions(update, scheduledAtSeconds);
        }
        nextSchedulerAtSeconds += V2_MISSION_SCHEDULER_INTERVAL_SECONDS;
      }

      const playerNormalBefore = activePlayerNormalMissions().length;
      const npcNormalBefore = activeNpcNormalMissions().length;
      const expiredBeforeEvaluation = finishExpiredMissions(
        elapsedSeconds,
        "strictly-past"
      );
      processNpcStateTransitions(update.npcStateTransitions);
      evaluateMissions(update);
      maybeStartEscapeMission(update);
      const suppressPlayerScheduling =
        expiredBeforeEvaluation.playerMissionFinished ||
        activePlayerNormalMissions().length < playerNormalBefore;
      const suppressNpcScheduling =
        expiredBeforeEvaluation.npcMissionFinished ||
        activeNpcNormalMissions().length < npcNormalBefore;
      if (nextSchedulerAtSeconds === elapsedSeconds) {
        const scheduledAtSeconds = nextSchedulerAtSeconds;
        const expired = finishExpiredMissions(
          scheduledAtSeconds,
          "at-or-past"
        );
        if (
          !suppressPlayerScheduling &&
          !expired.playerMissionFinished
        ) {
          schedulePlayerMission(update, scheduledAtSeconds);
        }
        if (!suppressNpcScheduling && !expired.npcMissionFinished) {
          scheduleNpcMissions(update, scheduledAtSeconds);
        }
        nextSchedulerAtSeconds += V2_MISSION_SCHEDULER_INTERVAL_SECONDS;
      }
      finishExpiredMissions(elapsedSeconds, "at-or-past");
      frame = buildFrame();
      return frame;
    },
    notifyNpcCommandChanged: (npcId, mode) => {
      assertActive();
      if (mode === "follow") {
        if (firstFollowerId === null) {
          firstFollowerId = npcId;
        }
        for (const mission of activePlayerNormalMissions()) {
          if (
            mission.kind === "player-follower-acquire" &&
            targetActorId(mission.target) === npcId
          ) {
            finishMission(mission, "completed", "follow-established");
          }
        }
      } else if (mode === "leave") {
        for (const mission of activePlayerNormalMissions()) {
          if (
            mission.kind === "player-follower-escort" &&
            targetActorId(mission.target) === npcId
          ) {
            finishMission(mission, "failed", "follow-ended");
          }
        }
      }
      frame = buildFrame();
    },
    executeBroadcast: (command, update) => {
      assertActive();
      if (phase !== "playing") {
        throw new Error("校内放送はplaying中だけ実行できます。");
      }
      const allowed = resolveV2BroadcastCommands(update.playerState);
      if (command !== allowed.primary && command !== allowed.secondary) {
        throw new Error(
          `現在のPlayer状態では校内放送を実行できません: ${update.playerState}/${command}`
        );
      }
      cancelBroadcastMissions();
      if (command === "gather-gym") {
        lastSchoolInstruction = "gym";
        const location = requireLocation(locations, GYM_LOCATION_ID);
        for (const npc of [...update.npcs].sort((left, right) =>
          left.id.localeCompare(right.id)
        )) {
          if (!isMovementCapableState(npc.state) || nextBroadcastRandom() >= 0.5) {
            continue;
          }
          cancelNormalNpcMission(npc.id);
          createNpcLocationMission(
            npc,
            location,
            "broadcast",
            elapsedSeconds
          );
        }
      } else if (command === "flee") {
        lastSchoolInstruction = "courtyard";
        const location = requireLocation(locations, BROADCAST_ROOM_LOCATION_ID);
        const targets = update.npcs
          .filter(
            (npc) =>
              isMovementCapableState(npc.state) &&
              isCompletedBrainwashState(npc.state)
          )
          .map((npc) =>
            Object.freeze({
              npc,
              distanceSquared: Vector3.DistanceSquared(
                npc.footPosition,
                update.playerFootPosition
              )
            })
          )
          .sort(
            (left, right) =>
              left.distanceSquared - right.distanceSquared ||
              left.npc.id.localeCompare(right.npc.id)
          )
          .slice(0, 5);
        for (const target of targets) {
          cancelNormalNpcMission(target.npc.id);
          createNpcLocationMission(
            target.npc,
            location,
            "broadcast",
            elapsedSeconds
          );
        }
      } else {
        lastSchoolInstruction = "courtyard";
        for (const npcId of npcPort.convertHaigureNpcsToGun()) {
          cancelNormalNpcMission(npcId);
        }
      }
      frame = buildFrame();
    },
    getFrame: () => {
      assertActive();
      return frame;
    },
    getMissions: () => {
      assertActive();
      return Object.freeze(missions.map(freezeMission));
    },
    dispose: () => {
      assertActive();
      for (const mission of activeMissions()) {
        finishMission(mission, "cancelled", "phase-ended");
      }
      missions.length = 0;
      disposed = true;
    }
  };
};
