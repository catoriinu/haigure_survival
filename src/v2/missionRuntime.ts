import { Vector3 } from "@babylonjs/core";

import type {
  StageLocationAssetRegistry,
  StageMissionLocation
} from "../world/stageLocationAssets";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import { isV2AliveState, type V2CharacterState } from "./combatTypes";
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

const PLAYER_LOCATION_DEADLINE_SECONDS = 180;
const PLAYER_MISSION_SECONDS_PER_TARGET = 60;
const PLAYER_FOLLOWER_ESCORT_DEADLINE_SECONDS = 120;
const PLAYER_FIRST_FOLLOWER_BRAINWASH_DEADLINE_SECONDS = 240;
const PLAYER_FIRST_FOLLOWER_JOIN_DEADLINE_SECONDS = 120;
const PLAYER_ACTION_MISSION_DEADLINE_SECONDS = 180;
const PLAYER_ESCAPE_DEADLINE_SECONDS = 45;
const NPC_LOCATION_DEADLINE_SECONDS = 180;
const BROADCAST_LOCATION_DEADLINE_SECONDS = 180;
const ESCAPE_DISTANCE = 12 * BLENDER_METERS_TO_WORLD_UNITS;
const ESCAPE_HOLD_SECONDS = 5;
const ESCORT_LOCATION_REFRESH_SECONDS = 3;
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
  | "player-first-follower-join"
  | "player-elevator-use"
  | "player-school-broadcast"
  | "player-last-unbrainwashed"
  | "player-first-follower-escape"
  | "npc-location";

export type V2MissionState =
  | "active"
  | "completed"
  | "failed"
  | "cancelled";

export type V2MissionSource = "normal" | "broadcast" | "situation";
export type V2PlayerMissionCondition = "unbrainwashed" | "brainwashed";

export type V2MissionAssignee =
  | Readonly<{ kind: "player" }>
  | Readonly<{ kind: "npc"; npcId: string }>;

export type V2MissionTarget =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "actor"; actorId: string }>
  | Readonly<{ kind: "location"; locationId: string }>
  | Readonly<{
      kind: "follower-count";
      acquiredCount: number;
      requiredCount: number;
      candidateLocationDisplayName: string;
    }>
  | Readonly<{
      kind: "brainwash-count";
      brainwashedCount: number;
      requiredCount: number;
      candidateLocationDisplayName: string;
    }>;

export type V2MissionCompletionReason =
  | "arrived"
  | "follower-count-reached"
  | "follower-survived"
  | "brainwash-count-reached"
  | "target-brainwashed"
  | "first-follower-joined"
  | "elevator-used"
  | "school-broadcast-sent"
  | "escaped";

export type V2MissionFailureReason =
  | "deadline"
  | "follower-lost"
  | "target-unavailable"
  | "player-hit"
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
type V2FollowerCountMissionTarget = Readonly<{
  kind: "follower-count";
  acquiredCount: number;
  requiredCount: number;
  candidateLocationDisplayName: string;
}>;
type V2BrainwashCountMissionTarget = Readonly<{
  kind: "brainwash-count";
  brainwashedCount: number;
  requiredCount: number;
  candidateLocationDisplayName: string;
}>;
type V2NoMissionTarget = Readonly<{ kind: "none" }>;
export type V2MissionDefinition =
  | Readonly<{
      kind: "player-location";
      source: "normal";
      playerCondition: "unbrainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2LocationMissionTarget;
    }>
  | Readonly<{
      kind: "player-follower-acquire";
      source: "normal";
      playerCondition: "unbrainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2FollowerCountMissionTarget;
    }>
  | Readonly<{
      kind: "player-brainwash-target";
      source: "normal";
      playerCondition: "brainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2BrainwashCountMissionTarget;
    }>
  | Readonly<{
      kind: "player-first-follower-brainwash";
      source: "normal";
      playerCondition: "brainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "player-follower-escort";
      source: "normal";
      playerCondition: "unbrainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "player-first-follower-join";
      source: "normal";
      playerCondition: "brainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "player-elevator-use";
      source: "normal";
      playerCondition: V2PlayerMissionCondition;
      assignee: V2PlayerMissionAssignee;
      target: V2NoMissionTarget;
    }>
  | Readonly<{
      kind: "player-school-broadcast";
      source: "normal";
      playerCondition: V2PlayerMissionCondition;
      assignee: V2PlayerMissionAssignee;
      target: V2LocationMissionTarget;
    }>
  | Readonly<{
      kind: "player-last-unbrainwashed";
      source: "situation";
      playerCondition: "unbrainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2NoMissionTarget;
    }>
  | Readonly<{
      kind: "player-first-follower-escape";
      source: "situation";
      playerCondition: "brainwashed";
      assignee: V2PlayerMissionAssignee;
      target: V2ActorMissionTarget;
    }>
  | Readonly<{
      kind: "npc-location";
      source: "normal";
      playerCondition: null;
      assignee: V2NpcMissionAssignee;
      target: V2LocationMissionTarget;
    }>
  | Readonly<{
      kind: "npc-location";
      source: "broadcast";
      playerCondition: null;
      assignee: V2NpcMissionAssignee;
      target: V2LocationMissionTarget;
    }>;

type V2MissionSharedView = Readonly<{
  id: string;
  title: string;
  targetDisplayName: string;
  startedAtSeconds: number;
  deadlineAtSeconds: number | null;
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
      "deadline" | "player-hit",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-follower-acquire" }>,
      "follower-count-reached",
      "deadline" | "player-hit" | "target-unavailable",
      "phase-ended" | "player-brainwash-started"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-first-follower-join" }>,
      "first-follower-joined",
      "deadline" | "target-unavailable",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-elevator-use" }>,
      "elevator-used",
      "deadline" | "player-hit",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-school-broadcast" }>,
      "school-broadcast-sent",
      "deadline" | "player-hit",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-last-unbrainwashed" }>,
      never,
      "player-brainwash-started",
      "phase-ended"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-follower-escort" }>,
      "follower-survived",
      "follower-lost" | "player-hit",
      "phase-ended" | "player-brainwash-started"
    >
  | V2MissionViewFor<
      Extract<V2MissionDefinition, { kind: "player-brainwash-target" }>,
      "brainwash-count-reached",
      "deadline" | "target-unavailable",
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
  playerMissionResults: Readonly<{
    unbrainwashed: Readonly<{ completed: number; failed: number }>;
    brainwashed: Readonly<{ completed: number; failed: number }>;
  }>;
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
  notifyPlayerElevatorStartedMoving(): void;
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
  playerCondition: V2PlayerMissionCondition | null;
  state: V2MissionState;
  assignee: V2MissionAssignee;
  target: V2MissionTarget;
  title: string;
  targetDisplayName: string;
  startedAtSeconds: number;
  deadlineAtSeconds: number | null;
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

const isPlayerBrainwashSequenceState = (state: V2CharacterState) =>
  state === "hit-a" ||
  state === "hit-b" ||
  state === "brainwash-in-progress";

const resolvePlayerMissionCondition = (
  state: V2CharacterState
): V2PlayerMissionCondition | null =>
  isUnbrainwashedState(state)
    ? "unbrainwashed"
    : isCompletedBrainwashState(state)
      ? "brainwashed"
      : null;

const isMovementCapableState = (state: V2CharacterState) =>
  state === "normal" ||
  state === "evade" ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun";

const cloneMissionTarget = (target: V2MissionTarget): V2MissionTarget => {
  if (target.kind === "none") {
    return Object.freeze({ kind: "none" });
  }
  if (target.kind === "actor") {
    return Object.freeze({ kind: "actor", actorId: target.actorId });
  }
  if (target.kind === "location") {
    return Object.freeze({ kind: "location", locationId: target.locationId });
  }
  if (target.kind === "brainwash-count") {
    return Object.freeze({
      kind: "brainwash-count",
      brainwashedCount: target.brainwashedCount,
      requiredCount: target.requiredCount,
      candidateLocationDisplayName: target.candidateLocationDisplayName
    });
  }
  return Object.freeze({
    kind: "follower-count",
    acquiredCount: target.acquiredCount,
    requiredCount: target.requiredCount,
    candidateLocationDisplayName: target.candidateLocationDisplayName
  });
};

const COMPLETION_REASONS: readonly V2MissionCompletionReason[] =
  Object.freeze([
    "arrived",
    "follower-count-reached",
    "follower-survived",
    "brainwash-count-reached",
    "target-brainwashed",
    "first-follower-joined",
    "elevator-used",
    "school-broadcast-sent",
    "escaped"
  ]);
const FAILURE_REASONS: readonly V2MissionFailureReason[] = Object.freeze([
  "deadline",
  "follower-lost",
  "target-unavailable",
  "player-hit",
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
  mission: Pick<MutableMission, "kind" | "source" | "playerCondition">,
  state: Exclude<V2MissionState, "active">,
  reason: V2MissionTerminalReason
) => {
  if (state === "completed") {
    return (
      ((mission.kind === "player-location" || mission.kind === "npc-location") &&
        reason === "arrived") ||
      (mission.kind === "player-follower-acquire" &&
        reason === "follower-count-reached") ||
      (mission.kind === "player-follower-escort" &&
        reason === "follower-survived") ||
      (mission.kind === "player-brainwash-target" &&
        reason === "brainwash-count-reached") ||
      (mission.kind === "player-first-follower-brainwash" &&
        reason === "target-brainwashed") ||
      (mission.kind === "player-first-follower-join" &&
        reason === "first-follower-joined") ||
      (mission.kind === "player-elevator-use" && reason === "elevator-used") ||
      (mission.kind === "player-school-broadcast" &&
        reason === "school-broadcast-sent") ||
      (mission.kind === "player-first-follower-escape" &&
        reason === "escaped")
    );
  }
  if (state === "failed") {
    if (reason === "player-hit") {
      return (
        mission.kind === "player-location" ||
        mission.kind === "player-follower-acquire" ||
        mission.kind === "player-follower-escort" ||
        ((mission.kind === "player-elevator-use" ||
          mission.kind === "player-school-broadcast") &&
          mission.playerCondition === "unbrainwashed")
      );
    }
    if (reason === "deadline") {
      return (
        mission.kind !== "player-follower-escort" &&
        mission.kind !== "player-last-unbrainwashed"
      );
    }
    if (mission.kind === "player-follower-escort") {
      return reason === "follower-lost";
    }
    if (mission.kind === "player-follower-acquire") {
      return reason === "target-unavailable";
    }
    if (mission.kind === "player-brainwash-target") {
      return reason === "target-unavailable";
    }
    if (mission.kind === "player-first-follower-brainwash") {
      return (
        reason === "target-unavailable" ||
        reason === "brainwashed-by-third-party"
      );
    }
    if (mission.kind === "player-first-follower-join") {
      return reason === "target-unavailable";
    }
    if (mission.kind === "player-last-unbrainwashed") {
      return reason === "player-brainwash-started";
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
  const noTarget = mission.target.kind === "none";
  const followerCountTarget =
    mission.target.kind === "follower-count" &&
    Number.isInteger(mission.target.acquiredCount) &&
    mission.target.acquiredCount >= 0 &&
    Number.isInteger(mission.target.requiredCount) &&
    mission.target.requiredCount >= 1 &&
    mission.target.requiredCount <= 3 &&
    mission.target.acquiredCount <= mission.target.requiredCount &&
    mission.target.candidateLocationDisplayName.length > 0;
  const brainwashCountTarget =
    mission.target.kind === "brainwash-count" &&
    Number.isInteger(mission.target.brainwashedCount) &&
    mission.target.brainwashedCount >= 0 &&
    Number.isInteger(mission.target.requiredCount) &&
    mission.target.requiredCount >= 1 &&
    mission.target.requiredCount <= 3 &&
    mission.target.brainwashedCount <= mission.target.requiredCount &&
    mission.target.candidateLocationDisplayName.length > 0;
  const definitionValid =
    (mission.kind === "player-location" &&
      mission.source === "normal" &&
      mission.playerCondition === "unbrainwashed" &&
      playerAssigned &&
      locationTarget) ||
    (mission.kind === "player-follower-acquire" &&
      mission.source === "normal" &&
      mission.playerCondition === "unbrainwashed" &&
      playerAssigned &&
      followerCountTarget) ||
    (mission.kind === "player-brainwash-target" &&
      mission.source === "normal" &&
      mission.playerCondition === "brainwashed" &&
      playerAssigned &&
      brainwashCountTarget) ||
    (mission.kind === "player-first-follower-brainwash" &&
      mission.source === "normal" &&
      mission.playerCondition === "brainwashed" &&
      playerAssigned &&
      actorTarget) ||
    (mission.kind === "player-follower-escort" &&
      mission.source === "normal" &&
      mission.playerCondition === "unbrainwashed" &&
      playerAssigned &&
      actorTarget) ||
    (mission.kind === "player-first-follower-join" &&
      mission.source === "normal" &&
      mission.playerCondition === "brainwashed" &&
      playerAssigned &&
      actorTarget) ||
    (mission.kind === "player-elevator-use" &&
      mission.source === "normal" &&
      mission.playerCondition !== null &&
      playerAssigned &&
      noTarget) ||
    (mission.kind === "player-school-broadcast" &&
      mission.source === "normal" &&
      mission.playerCondition !== null &&
      playerAssigned &&
      locationTarget) ||
    (mission.kind === "player-last-unbrainwashed" &&
      mission.source === "situation" &&
      mission.playerCondition === "unbrainwashed" &&
      playerAssigned &&
      noTarget &&
      mission.deadlineAtSeconds === null) ||
    (mission.kind === "player-first-follower-escape" &&
      mission.source === "situation" &&
      mission.playerCondition === "brainwashed" &&
      playerAssigned &&
      actorTarget) ||
    (mission.kind === "npc-location" &&
      (mission.source === "normal" || mission.source === "broadcast") &&
      mission.playerCondition === null &&
      !playerAssigned &&
      locationTarget);
  if (!definitionValid) {
    throw new Error(`Mission definitionが不正です: ${mission.id}`);
  }
  if (
    mission.kind === "player-follower-acquire" &&
    mission.target.kind === "follower-count" &&
    ((mission.state === "active" &&
      mission.target.acquiredCount >= mission.target.requiredCount) ||
      (mission.state === "completed" &&
        mission.target.acquiredCount !== mission.target.requiredCount))
  ) {
    throw new Error(`Follower獲得Missionの進捗が不正です: ${mission.id}`);
  }
  if (
    mission.kind === "player-brainwash-target" &&
    mission.target.kind === "brainwash-count" &&
    ((mission.state === "active" &&
      mission.target.brainwashedCount >= mission.target.requiredCount) ||
      (mission.state === "completed" &&
        mission.target.brainwashedCount !== mission.target.requiredCount))
  ) {
    throw new Error(`洗脳人数Missionの進捗が不正です: ${mission.id}`);
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
  target.kind === "actor" ? target.actorId : null;

const targetLocationId = (target: V2MissionTarget) =>
  target.kind === "location" ? target.locationId : null;

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

const formatMissionLocationDisplayName = (
  locations: StageLocationAssetRegistry,
  location: StageMissionLocation
) => {
  if (location.floorId === "roof") {
    return location.displayName;
  }
  const floorMap = locations.getFloorMap(location.floorId);
  if (!floorMap) {
    throw new Error(
      `Mission Locationのfloor_mapがありません: ${location.id}/${location.floorId}`
    );
  }
  return `${floorMap.displayName} ${location.displayName}`;
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
  let initialPlayerMissionPending = true;
  let postBrainwashPlayerMissionPending = false;
  let previousPlayerState: V2CharacterState | null = null;
  let missionSequence = 0;
  let followerAcquireMissionCount = 0;
  const acquiredFollowerIdsByMissionId = new Map<string, Set<string>>();
  const displayCandidateNpcIdByMissionId = new Map<string, string>();
  let brainwashTargetMissionCount = 0;
  const eligibleBrainwashNpcIdsByMissionId = new Map<string, Set<string>>();
  const brainwashedNpcIdsByMissionId = new Map<string, Set<string>>();
  const nextEscortLocationRefreshAtSecondsByMissionId = new Map<string, number>();
  let firstFollowerId: string | null = null;
  let escapeMissionStarted = false;
  let escapeSafeSeconds = 0;
  let lastUnbrainwashedMissionStarted = false;
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
    playerCondition: V2PlayerMissionCondition | null,
    assignee: V2MissionAssignee,
    target: V2MissionTarget,
    title: string,
    targetDisplayName: string,
    deadlineSeconds: number | null,
    startedAtSeconds: number,
    id = createMissionId()
  ) => {
    const mission: MutableMission = {
      id,
      kind,
      source,
      playerCondition,
      state: "active",
      assignee,
      target,
      title,
      targetDisplayName,
      startedAtSeconds,
      deadlineAtSeconds:
        deadlineSeconds === null ? null : startedAtSeconds + deadlineSeconds,
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
    if (mission.kind === "player-follower-acquire") {
      acquiredFollowerIdsByMissionId.delete(mission.id);
    }
    if (mission.kind === "player-brainwash-target") {
      eligibleBrainwashNpcIdsByMissionId.delete(mission.id);
      brainwashedNpcIdsByMissionId.delete(mission.id);
    }
    displayCandidateNpcIdByMissionId.delete(mission.id);
    if (mission.kind === "player-follower-escort") {
      nextEscortLocationRefreshAtSecondsByMissionId.delete(mission.id);
    }
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

  const isInsideMissionLocationArea = (
    location: StageMissionLocation,
    position: Vector3
  ) => locations.findArea(position)?.area.id === location.area.id;

  const availablePlayerLocations = (position: Vector3) => {
    const usedLocationIds = activeTargetLocationIds();
    return locations.missionLocations.filter(
      (location) =>
        !usedLocationIds.has(location.id) &&
        !isInsideMissionLocationArea(location, position)
    );
  };

  const availableNpcLocations = (position: Vector3) => {
    const usedLocationIds = activeTargetLocationIds();
    return locations.missionLocations.filter(
      (location) =>
        !usedLocationIds.has(location.id) && !location.contains(position)
    );
  };

  const eligibleFollowerAcquireNpcs = (
    npcs: readonly V2MissionNpcSnapshot[]
  ) =>
    npcs.filter(
      (npc) =>
        isUnbrainwashedState(npc.state) && npc.commandMode !== "follow"
    );

  const eligibleBrainwashNpcs = (npcs: readonly V2MissionNpcSnapshot[]) => {
    const usedActorIds = activeTargetActorIds();
    return npcs.filter(
      (npc) => isV2AliveState(npc.state) && !usedActorIds.has(npc.id)
    );
  };

  const formatNpcLocation = (
    npc: V2MissionNpcSnapshot,
    prefix: "現在地：" | "候補の現在地："
  ) => {
    const hit = locations.findArea(npc.footPosition);
    if (hit === null) {
      return `${prefix}確認中`;
    }
    if (hit.elevatorId !== null) {
      return `${prefix}エレベーター`;
    }
    if (hit.floorId === null) {
      throw new Error(`固定location_areaにfloorがありません: ${hit.area.id}`);
    }
    const floorMap = locations.getFloorMap(hit.floorId);
    if (floorMap === null) {
      throw new Error(
        `Mission候補の現在地floor_mapがありません: ${hit.area.id}/${hit.floorId}`
      );
    }
    return `${prefix}${floorMap.displayName} ${hit.area.displayName}`;
  };

  const formatFollowerLocation = (follower: V2MissionNpcSnapshot) => {
    if (follower.commandMode === "follow") {
      return "（同行中）";
    }
    return formatNpcLocation(follower, "現在地：");
  };

  const createPlayerLocationMission = (
    playerFootPosition: Vector3,
    startedAtSeconds: number
  ) => {
    const candidates = availablePlayerLocations(playerFootPosition);
    if (candidates.length === 0) {
      return false;
    }
    const location = pickRandom(candidates, nextPlayerRandom);
    addMission(
      "player-location",
      "normal",
      "unbrainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "location", locationId: location.id }),
      "目的地へ移動",
      formatMissionLocationDisplayName(locations, location),
      PLAYER_LOCATION_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const createFollowerAcquireMission = (
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    const eligibleNpcs = eligibleFollowerAcquireNpcs(npcs);
    if (eligibleNpcs.length === 0) {
      return false;
    }
    const requiredCount =
      followerAcquireMissionCount === 0
        ? 1
        : Math.floor(
            nextPlayerRandom() * Math.min(3, eligibleNpcs.length)
          ) + 1;
    const displayCandidate = pickRandom(eligibleNpcs, nextPlayerRandom);
    const mission = addMission(
      "player-follower-acquire",
      "normal",
      "unbrainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({
        kind: "follower-count",
        acquiredCount: 0,
        requiredCount,
        candidateLocationDisplayName: formatNpcLocation(
          displayCandidate,
          "候補の現在地："
        )
      }),
      `新しい同行者を${requiredCount}人同行させる`,
      `進捗 0/${requiredCount}人`,
      requiredCount * PLAYER_MISSION_SECONDS_PER_TARGET,
      startedAtSeconds
    );
    followerAcquireMissionCount += 1;
    acquiredFollowerIdsByMissionId.set(mission.id, new Set<string>());
    displayCandidateNpcIdByMissionId.set(mission.id, displayCandidate.id);
    return true;
  };

  const createFollowerEscortMission = (
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    if (firstFollowerId === null) {
      return false;
    }
    const follower = npcs.find((npc) => npc.id === firstFollowerId);
    if (
      !follower ||
      !isV2AliveState(follower.state) ||
      activeTargetActorIds().has(follower.id)
    ) {
      return false;
    }
    const mission = addMission(
      "player-follower-escort",
      "normal",
      "unbrainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: follower.id }),
      "最初の同行者を護衛",
      formatFollowerLocation(follower),
      PLAYER_FOLLOWER_ESCORT_DEADLINE_SECONDS,
      startedAtSeconds
    );
    nextEscortLocationRefreshAtSecondsByMissionId.set(
      mission.id,
      startedAtSeconds + ESCORT_LOCATION_REFRESH_SECONDS
    );
    return true;
  };

  const createBrainwashTargetMission = (
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    const candidates = eligibleBrainwashNpcs(npcs);
    if (candidates.length === 0) {
      return false;
    }
    const requiredCount =
      brainwashTargetMissionCount === 0
        ? 1
        : Math.floor(nextPlayerRandom() * Math.min(3, candidates.length)) + 1;
    const displayCandidate = pickRandom(candidates, nextPlayerRandom);
    const mission = addMission(
      "player-brainwash-target",
      "normal",
      "brainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({
        kind: "brainwash-count",
        brainwashedCount: 0,
        requiredCount,
        candidateLocationDisplayName: formatNpcLocation(
          displayCandidate,
          "候補の現在地："
        )
      }),
      `${requiredCount}人洗脳する`,
      `進捗 0/${requiredCount}人`,
      requiredCount * PLAYER_MISSION_SECONDS_PER_TARGET,
      startedAtSeconds
    );
    brainwashTargetMissionCount += 1;
    eligibleBrainwashNpcIdsByMissionId.set(
      mission.id,
      new Set(candidates.map((candidate) => candidate.id))
    );
    brainwashedNpcIdsByMissionId.set(mission.id, new Set<string>());
    displayCandidateNpcIdByMissionId.set(mission.id, displayCandidate.id);
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
      "brainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: follower.id }),
      "最初の同行者を洗脳",
      "最初の同行者",
      PLAYER_FIRST_FOLLOWER_BRAINWASH_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const createFirstFollowerJoinMission = (
    npcs: readonly V2MissionNpcSnapshot[],
    startedAtSeconds: number
  ) => {
    if (firstFollowerId === null || activeTargetActorIds().has(firstFollowerId)) {
      return false;
    }
    const follower = npcs.find((npc) => npc.id === firstFollowerId);
    if (
      !follower ||
      !isCompletedBrainwashState(follower.state) ||
      follower.commandMode === "follow"
    ) {
      return false;
    }
    addMission(
      "player-first-follower-join",
      "normal",
      "brainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: follower.id }),
      "最初の同行者と同行する",
      formatNpcLocation(follower, "現在地："),
      PLAYER_FIRST_FOLLOWER_JOIN_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const hasCompletedPlayerMissionKind = (kind: V2MissionKind) =>
    missions.some(
      (mission) =>
        mission.assignee.kind === "player" &&
        mission.kind === kind &&
        mission.state === "completed"
    );

  const createPlayerElevatorMission = (
    playerCondition: V2PlayerMissionCondition,
    startedAtSeconds: number
  ) => {
    if (hasCompletedPlayerMissionKind("player-elevator-use")) {
      return false;
    }
    addMission(
      "player-elevator-use",
      "normal",
      playerCondition,
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "none" }),
      "エレベーターを利用する",
      "扉が閉じて動き出すまで",
      PLAYER_ACTION_MISSION_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const createPlayerSchoolBroadcastMission = (
    playerCondition: V2PlayerMissionCondition,
    startedAtSeconds: number
  ) => {
    if (hasCompletedPlayerMissionKind("player-school-broadcast")) {
      return false;
    }
    const location = requireLocation(locations, BROADCAST_ROOM_LOCATION_ID);
    addMission(
      "player-school-broadcast",
      "normal",
      playerCondition,
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "location", locationId: location.id }),
      "2F 放送室で全校放送をする",
      formatMissionLocationDisplayName(locations, location),
      PLAYER_ACTION_MISSION_DEADLINE_SECONDS,
      startedAtSeconds
    );
    return true;
  };

  const schedulePlayerMission = (
    update: V2MissionUpdate,
    scheduledAtSeconds: number,
    guaranteed = false
  ) => {
    if (
      activePlayerNormalMissions().length >=
        V2_PLAYER_NORMAL_MISSION_MAXIMUM ||
      (!guaranteed && nextPlayerRandom() >= 0.5)
    ) {
      return false;
    }
    const activeKinds = new Set(
      activePlayerNormalMissions().map((mission) => mission.kind)
    );
    const usedActorIds = activeTargetActorIds();
    const hasAvailableLocation =
      availablePlayerLocations(update.playerFootPosition).length > 0;
    const hasFollowerAcquireTarget =
      eligibleFollowerAcquireNpcs(update.npcs).length > 0;
    const firstFollower =
      firstFollowerId === null
        ? null
        : update.npcs.find((npc) => npc.id === firstFollowerId) ?? null;
    const canEscortFirstFollower =
      firstFollower !== null &&
      isV2AliveState(firstFollower.state) &&
      !usedActorIds.has(firstFollower.id);
    const hasBrainwashTarget = eligibleBrainwashNpcs(update.npcs).length > 0;
    const canBrainwashFirstFollower =
      firstFollower !== null &&
      isUnbrainwashedState(firstFollower.state) &&
      !usedActorIds.has(firstFollower.id);
    const canJoinFirstFollower =
      firstFollower !== null &&
      isCompletedBrainwashState(firstFollower.state) &&
      firstFollower.commandMode !== "follow" &&
      !usedActorIds.has(firstFollower.id);
    const canUseElevator =
      !activeKinds.has("player-elevator-use") &&
      !hasCompletedPlayerMissionKind("player-elevator-use");
    const canUseSchoolBroadcast =
      !activeKinds.has("player-school-broadcast") &&
      !hasCompletedPlayerMissionKind("player-school-broadcast");
    const playerCondition = resolvePlayerMissionCondition(update.playerState);
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
                update.npcs,
                scheduledAtSeconds
              )
          })
        );
      }
      if (canUseElevator) {
        weightedCandidates.push(
          Object.freeze({
            weight: 10,
            create: () =>
              createPlayerElevatorMission("unbrainwashed", scheduledAtSeconds)
          })
        );
      }
      if (canUseSchoolBroadcast) {
        weightedCandidates.push(
          Object.freeze({
            weight: 10,
            create: () =>
              createPlayerSchoolBroadcastMission(
                "unbrainwashed",
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
      if (
        !activeKinds.has("player-first-follower-join") &&
        canJoinFirstFollower
      ) {
        weightedCandidates.push(
          Object.freeze({
            weight: 10,
            create: () =>
              createFirstFollowerJoinMission(update.npcs, scheduledAtSeconds)
          })
        );
      }
      if (canUseElevator) {
        weightedCandidates.push(
          Object.freeze({
            weight: 10,
            create: () =>
              createPlayerElevatorMission("brainwashed", scheduledAtSeconds)
          })
        );
      }
      if (canUseSchoolBroadcast) {
        weightedCandidates.push(
          Object.freeze({
            weight: 10,
            create: () =>
              createPlayerSchoolBroadcastMission(
                "brainwashed",
                scheduledAtSeconds
              )
          })
        );
      }
    }
    if (playerCondition === null && weightedCandidates.length > 0) {
      throw new Error(`Player Mission状態を分類できません: ${update.playerState}`);
    }
    const totalWeight = weightedCandidates.reduce(
      (sum, candidate) => sum + candidate.weight,
      0
    );
    if (totalWeight === 0) {
      return false;
    }
    let roll = nextPlayerRandom() * totalWeight;
    for (const candidate of weightedCandidates) {
      if (roll < candidate.weight) {
        if (!candidate.create()) {
          throw new Error("検証済みPlayer Mission候補を作成できません。");
        }
        return true;
      }
      roll -= candidate.weight;
    }
    throw new Error("Player Missionの重み付き抽選結果を解決できません。");
  };

  const failUnbrainwashedPlayerMissionsForHit = () => {
    for (const mission of activePlayerNormalMissions()) {
      if (mission.playerCondition === "unbrainwashed") {
        finishMission(mission, "failed", "player-hit");
      }
    }
    for (const mission of activeSituationMissions()) {
      finishMission(mission, "failed", "player-brainwash-started");
    }
  };

  const maybeStartLastUnbrainwashedMission = (update: V2MissionUpdate) => {
    if (
      lastUnbrainwashedMissionStarted ||
      !isUnbrainwashedState(update.playerState) ||
      update.npcs.some((npc) => isV2AliveState(npc.state)) ||
      activeSituationMissions().length >= V2_PLAYER_SITUATION_MISSION_MAXIMUM
    ) {
      return;
    }
    lastUnbrainwashedMissionStarted = true;
    addMission(
      "player-last-unbrainwashed",
      "situation",
      "unbrainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "none" }),
      "あなたは最後の未洗脳者。希望を背負って生き残れ",
      "時間制限なし",
      null,
      elapsedSeconds
    );
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
      null,
      Object.freeze({ kind: "npc", npcId: npc.id }),
      Object.freeze({ kind: "location", locationId: location.id }),
      source === "broadcast" ? "校内放送による移動" : "目的地へ移動",
      formatMissionLocationDisplayName(locations, location),
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
      const locationCandidates = availableNpcLocations(npc.footPosition);
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

  const recordBrainwashProgress = (
    mission: MutableMission,
    npcId: string
  ) => {
    if (
      mission.kind !== "player-brainwash-target" ||
      mission.target.kind !== "brainwash-count"
    ) {
      throw new Error(`洗脳人数Missionの定義が不正です: ${mission.id}`);
    }
    const eligibleNpcIds = eligibleBrainwashNpcIdsByMissionId.get(mission.id);
    const brainwashedNpcIds = brainwashedNpcIdsByMissionId.get(mission.id);
    if (!eligibleNpcIds || !brainwashedNpcIds) {
      throw new Error(`洗脳人数Missionの進捗がありません: ${mission.id}`);
    }
    if (!eligibleNpcIds.has(npcId) || brainwashedNpcIds.has(npcId)) {
      return;
    }
    brainwashedNpcIds.add(npcId);
    const brainwashedCount = brainwashedNpcIds.size;
    const requiredCount = mission.target.requiredCount;
    mission.target = Object.freeze({
      kind: "brainwash-count",
      brainwashedCount,
      requiredCount,
      candidateLocationDisplayName: mission.target.candidateLocationDisplayName
    });
    mission.targetDisplayName = `進捗 ${brainwashedCount}/${requiredCount}人`;
    if (brainwashedCount >= requiredCount) {
      finishMission(mission, "completed", "brainwash-count-reached");
    }
  };

  const refreshCountMissionDisplayCandidate = (
    mission: MutableMission,
    candidates: readonly V2MissionNpcSnapshot[]
  ) => {
    if (
      mission.target.kind !== "follower-count" &&
      mission.target.kind !== "brainwash-count"
    ) {
      throw new Error(`人数Missionの対象が不正です: ${mission.id}`);
    }
    if (candidates.length === 0) {
      displayCandidateNpcIdByMissionId.delete(mission.id);
      return;
    }
    const sortedCandidates = [...candidates].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    const currentCandidateId = displayCandidateNpcIdByMissionId.get(mission.id);
    const candidate =
      currentCandidateId === undefined
        ? pickRandom(sortedCandidates, nextPlayerRandom)
        : sortedCandidates.find((npc) => npc.id === currentCandidateId) ??
          pickRandom(sortedCandidates, nextPlayerRandom);
    displayCandidateNpcIdByMissionId.set(mission.id, candidate.id);
    const candidateLocationDisplayName = formatNpcLocation(
      candidate,
      "候補の現在地："
    );
    if (mission.target.candidateLocationDisplayName === candidateLocationDisplayName) {
      return;
    }
    mission.target =
      mission.target.kind === "follower-count"
        ? Object.freeze({
            kind: "follower-count" as const,
            acquiredCount: mission.target.acquiredCount,
            requiredCount: mission.target.requiredCount,
            candidateLocationDisplayName
          })
        : Object.freeze({
            kind: "brainwash-count" as const,
            brainwashedCount: mission.target.brainwashedCount,
            requiredCount: mission.target.requiredCount,
            candidateLocationDisplayName
          });
  };

  const processNpcStateTransitions = (
    transitions: readonly V2NpcStateTransitionEvent[]
  ) => {
    for (const transition of transitions) {
      if (
        transition.currentState !== "hit-a" &&
        transition.currentState !== "brainwash-in-progress"
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
      const activeSpecificActorIds = activeTargetActorIds();
      for (const mission of activePlayerNormalMissions()) {
        if (mission.kind === "player-brainwash-target") {
          if (
            transition.currentState === "hit-a" &&
            (causedByPlayerGun || causedByAssistedThirdParty) &&
            !activeSpecificActorIds.has(transition.npcId)
          ) {
            recordBrainwashProgress(mission, transition.npcId);
          }
          continue;
        }
        const actorId = targetActorId(mission.target);
        if (
          actorId !== transition.npcId ||
          mission.kind !== "player-first-follower-brainwash" ||
          transition.currentState !== "brainwash-in-progress"
        ) {
          continue;
        }
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
      for (const mission of activeSituationMissions()) {
        finishMission(mission, "failed", "player-brainwash-started");
      }
    }

    for (const mission of [...activeMissions()]) {
      if (mission.kind === "player-location") {
        const locationId = targetLocationId(mission.target)!;
        if (
          isInsideMissionLocationArea(
            requireLocation(locations, locationId),
            update.playerFootPosition
          )
        ) {
          finishMission(mission, "completed", "arrived");
        }
      } else if (mission.kind === "player-follower-acquire") {
        if (mission.target.kind !== "follower-count") {
          throw new Error(`同行人数Missionの定義が不正です: ${mission.id}`);
        }
        const acquiredNpcIds = acquiredFollowerIdsByMissionId.get(mission.id);
        if (!acquiredNpcIds) {
          throw new Error(`同行人数Missionの進捗がありません: ${mission.id}`);
        }
        const specificActorIds = activeTargetActorIds();
        const remainingCandidates = eligibleFollowerAcquireNpcs(update.npcs).filter(
          (npc) =>
            !acquiredNpcIds.has(npc.id) && !specificActorIds.has(npc.id)
        );
        if (
          acquiredNpcIds.size + remainingCandidates.length <
          mission.target.requiredCount
        ) {
          finishMission(mission, "failed", "target-unavailable");
        } else {
          refreshCountMissionDisplayCandidate(mission, remainingCandidates);
        }
      } else if (mission.kind === "player-follower-escort") {
        const actorId = targetActorId(mission.target)!;
        const follower = npcById.get(actorId);
        if (!follower || !isV2AliveState(follower.state)) {
          finishMission(mission, "failed", "follower-lost");
        } else {
          const nextRefreshAtSeconds =
            nextEscortLocationRefreshAtSecondsByMissionId.get(mission.id);
          if (nextRefreshAtSeconds === undefined) {
            throw new Error(`護衛Missionの現在地更新時刻がありません: ${mission.id}`);
          }
          if (elapsedSeconds >= nextRefreshAtSeconds) {
            mission.targetDisplayName = formatFollowerLocation(follower);
            nextEscortLocationRefreshAtSecondsByMissionId.set(
              mission.id,
              elapsedSeconds + ESCORT_LOCATION_REFRESH_SECONDS
            );
          }
        }
      } else if (mission.kind === "player-brainwash-target") {
        if (mission.target.kind !== "brainwash-count") {
          throw new Error(`洗脳人数Missionの定義が不正です: ${mission.id}`);
        }
        const eligibleNpcIds = eligibleBrainwashNpcIdsByMissionId.get(mission.id);
        const brainwashedNpcIds = brainwashedNpcIdsByMissionId.get(mission.id);
        if (!eligibleNpcIds || !brainwashedNpcIds) {
          throw new Error(`洗脳人数Missionの進捗がありません: ${mission.id}`);
        }
        const specificActorIds = activeTargetActorIds();
        const remainingCandidates = [...eligibleNpcIds].flatMap((npcId) => {
          if (brainwashedNpcIds.has(npcId) || specificActorIds.has(npcId)) {
            return [];
          }
          const npc = npcById.get(npcId);
          return npc !== undefined && isV2AliveState(npc.state) ? [npc] : [];
        });
        if (
          brainwashedNpcIds.size + remainingCandidates.length <
          mission.target.requiredCount
        ) {
          finishMission(mission, "failed", "target-unavailable");
        } else {
          refreshCountMissionDisplayCandidate(mission, remainingCandidates);
        }
      } else if (mission.kind === "player-first-follower-brainwash") {
        const target = npcById.get(targetActorId(mission.target)!);
        if (!target) {
          finishMission(mission, "failed", "target-unavailable");
        }
      } else if (mission.kind === "player-first-follower-join") {
        const target = npcById.get(targetActorId(mission.target)!);
        if (!target || !isCompletedBrainwashState(target.state)) {
          finishMission(mission, "failed", "target-unavailable");
        } else {
          mission.targetDisplayName = formatNpcLocation(target, "現在地：");
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
      const deadlineAtSeconds = mission.deadlineAtSeconds;
      if (deadlineAtSeconds === null) {
        continue;
      }
      const expired =
        boundary === "strictly-past"
          ? atSeconds > deadlineAtSeconds
          : atSeconds >= deadlineAtSeconds;
      if (expired) {
        if (mission.source === "normal") {
          playerMissionFinished ||= mission.assignee.kind === "player";
          npcMissionFinished ||= mission.assignee.kind === "npc";
        }
        if (mission.kind === "player-follower-escort") {
          finishMission(
            mission,
            "completed",
            "follower-survived",
            deadlineAtSeconds
          );
        } else {
          finishMission(
            mission,
            "failed",
            "deadline",
            deadlineAtSeconds
          );
        }
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
      "brainwashed",
      Object.freeze({ kind: "player" }),
      Object.freeze({ kind: "actor", actorId: follower.id }),
      "最初の同行者から逃げる",
      "最初の同行者",
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

  const recordFollowerAcquireProgress = (
    mission: MutableMission,
    npcId: string
  ) => {
    if (
      mission.kind !== "player-follower-acquire" ||
      mission.target.kind !== "follower-count"
    ) {
      throw new Error(`Follower獲得Missionの定義が不正です: ${mission.id}`);
    }
    const acquiredNpcIds = acquiredFollowerIdsByMissionId.get(mission.id);
    if (!acquiredNpcIds) {
      throw new Error(`Follower獲得Missionの進捗がありません: ${mission.id}`);
    }
    if (acquiredNpcIds.has(npcId)) {
      return;
    }
    acquiredNpcIds.add(npcId);
    const acquiredCount = acquiredNpcIds.size;
    const requiredCount = mission.target.requiredCount;
    mission.target = Object.freeze({
      kind: "follower-count",
      acquiredCount,
      requiredCount,
      candidateLocationDisplayName: mission.target.candidateLocationDisplayName
    });
    mission.targetDisplayName = `進捗 ${acquiredCount}/${requiredCount}人`;
    if (acquiredCount >= requiredCount) {
      finishMission(mission, "completed", "follower-count-reached");
    }
  };

  const hasVisiblePlayerTerminalResult = () =>
    missions.some(
      (mission) =>
        mission.assignee.kind === "player" &&
        (mission.state === "completed" || mission.state === "failed") &&
        mission.terminalAtSeconds !== null &&
        elapsedSeconds - mission.terminalAtSeconds <
          V2_MISSION_TERMINAL_DISPLAY_SECONDS
    );

  const ensurePlayerMissionFloor = (update: V2MissionUpdate) => {
    if (
      activePlayerNormalMissions().length > 0 ||
      hasVisiblePlayerTerminalResult() ||
      postBrainwashPlayerMissionPending ||
      resolvePlayerMissionCondition(update.playerState) === null
    ) {
      return false;
    }
    return schedulePlayerMission(update, elapsedSeconds, true);
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
    const countResults = (condition: V2PlayerMissionCondition) =>
      Object.freeze({
        completed: missions.filter(
          (mission) =>
            mission.assignee.kind === "player" &&
            mission.playerCondition === condition &&
            mission.state === "completed"
        ).length,
        failed: missions.filter(
          (mission) =>
            mission.assignee.kind === "player" &&
            mission.playerCondition === condition &&
            mission.state === "failed"
        ).length
      });
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
      lastSchoolInstruction,
      playerMissionResults: Object.freeze({
        unbrainwashed: countResults("unbrainwashed"),
        brainwashed: countResults("brainwashed")
      })
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
        previousPlayerState = update.playerState;
        frame = buildFrame();
        return frame;
      }

      const playerBrainwashSequenceStarted =
        previousPlayerState !== null &&
        isUnbrainwashedState(previousPlayerState) &&
        isPlayerBrainwashSequenceState(update.playerState);
      if (playerBrainwashSequenceStarted) {
        failUnbrainwashedPlayerMissionsForHit();
        postBrainwashPlayerMissionPending = true;
      }

      let guaranteedPlayerMissionCreated = false;
      if (
        initialPlayerMissionPending &&
        (isUnbrainwashedState(update.playerState) ||
          isCompletedBrainwashState(update.playerState))
      ) {
        guaranteedPlayerMissionCreated = schedulePlayerMission(
          update,
          elapsedSeconds - update.deltaSeconds,
          true
        );
        if (guaranteedPlayerMissionCreated) {
          initialPlayerMissionPending = false;
        }
      }

      while (nextSchedulerAtSeconds < elapsedSeconds) {
        const scheduledAtSeconds = nextSchedulerAtSeconds;
        const expired = finishExpiredMissions(
          scheduledAtSeconds,
          "at-or-past"
        );
        if (
          !initialPlayerMissionPending &&
          !postBrainwashPlayerMissionPending &&
          !expired.playerMissionFinished &&
          (activePlayerNormalMissions().length > 0 ||
            !hasVisiblePlayerTerminalResult())
        ) {
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
      maybeStartLastUnbrainwashedMission(update);
      maybeStartEscapeMission(update);
      if (
        postBrainwashPlayerMissionPending &&
        isCompletedBrainwashState(update.playerState)
      ) {
        guaranteedPlayerMissionCreated = schedulePlayerMission(
          update,
          elapsedSeconds,
          true
        );
        if (guaranteedPlayerMissionCreated) {
          postBrainwashPlayerMissionPending = false;
        }
      }
      const suppressPlayerScheduling =
        guaranteedPlayerMissionCreated ||
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
          !expired.playerMissionFinished &&
          (activePlayerNormalMissions().length > 0 ||
            !hasVisiblePlayerTerminalResult())
        ) {
          schedulePlayerMission(update, scheduledAtSeconds);
        }
        if (!suppressNpcScheduling && !expired.npcMissionFinished) {
          scheduleNpcMissions(update, scheduledAtSeconds);
        }
        nextSchedulerAtSeconds += V2_MISSION_SCHEDULER_INTERVAL_SECONDS;
      }
      finishExpiredMissions(elapsedSeconds, "at-or-past");
      ensurePlayerMissionFloor(update);
      previousPlayerState = update.playerState;
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
          if (mission.kind === "player-follower-acquire") {
            recordFollowerAcquireProgress(mission, npcId);
          } else if (
            mission.kind === "player-first-follower-join" &&
            targetActorId(mission.target) === npcId
          ) {
            finishMission(mission, "completed", "first-follower-joined");
          }
        }
      }
      frame = buildFrame();
    },
    notifyPlayerElevatorStartedMoving: () => {
      assertActive();
      if (phase !== "playing") {
        return;
      }
      for (const mission of activePlayerNormalMissions()) {
        if (mission.kind === "player-elevator-use") {
          finishMission(mission, "completed", "elevator-used");
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
      for (const mission of activePlayerNormalMissions()) {
        if (mission.kind === "player-school-broadcast") {
          finishMission(mission, "completed", "school-broadcast-sent");
        }
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
