import {
  Vector3,
  type Mesh,
  type Scene,
  type Sprite
} from "@babylonjs/core";

import {
  NPC_SPRITE_CENTER_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_WIDTH
} from "../game/characterSprites";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import {
  createNavigationAgent,
  type NavigationAgent,
  type NavigationAgentStepResult
} from "../world/navigationAgent";
import type {
  NavigationLocation,
  NavigationRouteCandidate,
  NavigationRoutePolicy,
  NavigationTransitionStep
} from "../world/navigationWorld";
import type { StageNavigationAreaCursor } from "../world/stageNavigationAreas";
import { createStageVolumeSpawnSampler } from "../world/stageSpawnSampler";
import type {
  StagePlayerSpawn,
  StageSpatialContext
} from "../world/stageSpatialContext";
import type {
  V2PursuitPhase,
  V2TargetNavigationAreaSnapshot
} from "./pursuitNavigation";
import {
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
  type V2AlarmTriggerEvent
} from "./alarmSystem";
import {
  createV2CharacterStateSystem,
  type V2CharacterImpactSource,
  type V2CharacterStateSnapshot,
  type V2CharacterStateSystem
} from "./characterStateSystem";
import {
  isV2AliveState,
  isV2BrainwashState,
  isV2HitState,
  selectV2TargetSelectionPersonality,
  type V2ActorSphere,
  type V2AlertRequest,
  type V2BeamRequest,
  type V2CharacterState,
  type V2HumanTargetSnapshot,
  type V2TargetSelectionPersonality,
  type V2TargetProvenance
} from "./combatTypes";
import {
  createV2HumanTargetSpatialIndex,
  type V2HumanTargetSpatialIndex
} from "./humanTargetSpatialIndex";
import {
  createV2PlanarSpatialIndex,
  type V2PlanarSpatialIndex
} from "./planarSpatialIndex";
import type { V2BeamCompletionEvent } from "./beamCollision";
import {
  cloneV2NpcTraversalState,
  createWalkingV2NpcTraversalState,
  isV2NpcElevatorTraversalState,
  isV2NpcTraversalWalkingEnabled,
  type V2NpcElevatorTraversalRoute,
  type V2PlayerElevatorTraversalSnapshot,
  type V2NpcTraversalNotification,
  type V2NpcTraversalRequest,
  type V2NpcTraversalResult,
  type V2NpcTraversalState
} from "./npcTraversal";
import type { V2PlayerGunFireEvent } from "./playerCombatSystem";
import { createV2FollowerFireDirection } from "./followerFireDirection";
import type { V2CharacterVisualRuntime } from "./v2CharacterVisualRuntime";

const NPC_SEARCH_SPEED = 0.2;
export const V2_NPC_CHASE_SPEED = 0.3;
const NPC_VISION_RANGE = 3;
const NPC_VISION_RANGE_SQUARED = NPC_VISION_RANGE * NPC_VISION_RANGE;
const NPC_VISUAL_LOCK_RANGE = 3.5;
const NPC_VISUAL_LOCK_RANGE_SQUARED =
  NPC_VISUAL_LOCK_RANGE * NPC_VISUAL_LOCK_RANGE;
const NPC_LAST_SEEN_MAXIMUM_PATH_DISTANCE = 5;
const NPC_VISION_COSINE = Math.cos((95 * Math.PI) / 180);
const NPC_WANDER_RADIUS = 2;
const NPC_WANDER_MAX_ATTEMPTS = 16;
const NPC_WANDER_WAIT_MIN_SECONDS = 0.5;
const NPC_WANDER_WAIT_MAX_SECONDS = 1.5;
const NPC_COLLISION_RADIUS = NPC_SPRITE_WIDTH * 0.5;
const NPC_HIT_RADII = Object.freeze(
  new Vector3(
    NPC_SPRITE_WIDTH * 0.5,
    NPC_SPRITE_HEIGHT * 0.5,
    NPC_SPRITE_WIDTH * 0.5
  )
);
const SPAWN_MINIMUM_DISTANCE = NPC_SPRITE_WIDTH * 1.75;
const SPAWN_PROJECTION_MAX_DISTANCE = 0.75;
const NAVIGATION_PROJECTION_MAX_DISTANCE = 0.75;
const PLACEMENT_PROJECTION_MAX_DISTANCE = 0.1;
const GROUND_PROBE_UPWARD_OFFSET = 0.5;
const GROUND_PROBE_DISTANCE = 1.5;
const NPC_INITIAL_GUN_CHANCE = 0.45;
const NPC_INITIAL_NO_GUN_CHANCE = 0.45;

export const V2_NPC_GUN_RANGE = 1.5;
export const V2_NPC_GUN_INTERVAL_MIN_SECONDS = 1.4;
export const V2_NPC_GUN_INTERVAL_MAX_SECONDS = 2.2;
export const V2_NPC_GUN_BEAM_SPEED = 1.58;
export const V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS = 20;
export const V2_NPC_CAPTURE_RADIUS = 0.27;
export const V2_NPC_CAPTURE_DURATION_SECONDS = 20;
export const V2_NPC_CAPTURE_BREAKAWAY_SECONDS = 2.5;
export const V2_NPC_CAPTURE_BREAKAWAY_SPEED = 0.27;
export const V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE = 4;
export const V2_NPC_PATH_REPLAN_DEADLINE_SECONDS = 2;
export const V2_NPC_DETAIL_PATH_REPLAN_DEADLINE_SECONDS = 1;
export const V2_NPC_COARSE_REFRESH_SECONDS = 2;
export const V2_NPC_DETAIL_ENTER_DISTANCE_METERS = 12;
export const V2_NPC_DETAIL_EXIT_DISTANCE_METERS = 18;
export const V2_NPC_COMMAND_MAXIMUM_DISTANCE_METERS = 3;
export const V2_NPC_FOLLOW_SPEED = 0.5;
export const V2_NPC_ALARM_SPEED = V2_NPC_FOLLOW_SPEED;
export const V2_NPC_LEAVE_SPEED = V2_NPC_CHASE_SPEED;
export const V2_NPC_FOLLOW_SEPARATION_METERS = 0.8;
export const V2_NPC_REST_SEPARATION_METERS = 0.8;
export const V2_NPC_GUN_STOP_DISTANCE_METERS = 0.8;
export const V2_NPC_GUN_RESUME_DISTANCE_METERS = 1;
export const V2_NPC_FOLLOW_STOP_DISTANCE_METERS = 1;
export const V2_NPC_FOLLOW_RESUME_DISTANCE_METERS = 1.2;
export const V2_NPC_FOLLOW_TRACKING_DISTANCE_METERS = 5;
export const V2_NPC_FOLLOW_SIGHT_DISTANCE_METERS = 12;
export const V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS = 5;
export const V2_NPC_LEAVE_MAXIMUM_SECONDS = 5;
export const V2_NPC_FOLLOWER_FIRE_DELAY_MIN_SECONDS = 0.3;
export const V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS = 0.8;
export const V2_NPC_FOLLOWER_FIRE_COOLDOWN_SECONDS = 0.6;
export const V2_NPC_CURRENT_TARGET_SIGHT_HERTZ = 5;
export const V2_NPC_PERSONALITY_RETARGET_HERTZ = 1;
export const V2_NPC_CURRENT_TARGET_SIGHT_MAXIMUM_PER_UPDATE = 20;
export const V2_NPC_PERSONALITY_RETARGET_MAXIMUM_PER_UPDATE = 4;
export const V2_NPC_AUTONOMOUS_THREAT_SIGHT_HERTZ = 3;
export const V2_NPC_AUTONOMOUS_THREAT_SIGHT_MAXIMUM_PER_UPDATE = 20;

const NPC_PERSONALITY_RETARGET_INTERVAL_SECONDS =
  1 / V2_NPC_PERSONALITY_RETARGET_HERTZ;
const NPC_EVADE_DISTANCE =
  V2_NPC_CAPTURE_BREAKAWAY_SPEED *
  V2_NPC_CAPTURE_BREAKAWAY_SECONDS;
const NPC_EVADE_ELEVATOR_DISTANCE =
  3 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_DETAIL_ENTER_DISTANCE =
  V2_NPC_DETAIL_ENTER_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_DETAIL_EXIT_DISTANCE =
  V2_NPC_DETAIL_EXIT_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_DETAIL_TARGET_MOVEMENT_THRESHOLD = 0.15;

type NpcNavigationReplanPriority = 0 | 1 | 2 | 3 | 4;

const NPC_GUN_RANGE_SQUARED = V2_NPC_GUN_RANGE * V2_NPC_GUN_RANGE;
const NPC_COMMAND_MAXIMUM_DISTANCE =
  V2_NPC_COMMAND_MAXIMUM_DISTANCE_METERS *
  BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_SEPARATION_DISTANCE =
  V2_NPC_FOLLOW_SEPARATION_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_REST_SEPARATION_DISTANCE =
  V2_NPC_REST_SEPARATION_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_GUN_STOP_DISTANCE =
  V2_NPC_GUN_STOP_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_GUN_RESUME_DISTANCE =
  V2_NPC_GUN_RESUME_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_GUN_REPOSITION_DISTANCE =
  NPC_GUN_RESUME_DISTANCE - NPC_GUN_STOP_DISTANCE;
const NPC_REST_SLOT_PROJECTION_DISTANCE =
  0.2 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_REST_SLOT_ARRIVAL_DISTANCE =
  0.1 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_REST_SLOT_RING_COUNT = 8;
const NPC_REST_SLOT_BASE_COUNT = 6;
const NPC_FOLLOW_FORMATION_PROJECTION_DISTANCE =
  0.2 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_FORMATION_STOP_DISTANCE =
  0.1 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_FORMATION_RESUME_DISTANCE =
  0.2 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_STOP_DISTANCE =
  V2_NPC_FOLLOW_STOP_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_RESUME_DISTANCE =
  V2_NPC_FOLLOW_RESUME_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_TRACKING_DISTANCE =
  V2_NPC_FOLLOW_TRACKING_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_SIGHT_DISTANCE =
  V2_NPC_FOLLOW_SIGHT_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_FOLLOW_LAST_DIRECTION_DISTANCE =
  1 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_LEAVE_DESTINATION_DISTANCE =
  3 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_LEAVE_ARRIVAL_DISTANCE =
  0.1 * BLENDER_METERS_TO_WORLD_UNITS;
const NPC_COMMAND_DISTANCE_EPSILON = 1e-6;
const NPC_LEAVE_DIRECTION_OFFSETS = Object.freeze([
  0,
  Math.PI / 6,
  -Math.PI / 6,
  Math.PI / 3,
  -Math.PI / 3,
  Math.PI / 2,
  -Math.PI / 2,
  Math.PI
]);

const NAVIGATION_AGENT_CONFIG = Object.freeze({
  projectionMaxDistance: NAVIGATION_PROJECTION_MAX_DISTANCE,
  waypointTolerance: 0.02,
  stuckDistanceThreshold: 0.005,
  stuckDurationSeconds: 1
});

const ALIVE_HUMANS_TARGET_POLICY = Object.freeze({
  kind: "alive-humans" as const
});

export type V2NpcNavigationBehavior =
  | "wander"
  | "follow"
  | "leave"
  | "pursue"
  | "evade"
  | "breakaway";

export type V2NpcNavigationRouteContext = Readonly<{
  npcId: string;
  behavior: V2NpcNavigationBehavior;
  speed: number;
  characterState: V2CharacterState;
  brainwashed: boolean;
  commandMode: V2NpcCommandMode;
  targetId: string | null;
  playerElevatorTraversal: V2PlayerElevatorTraversalSnapshot | null;
  targetProvenance: V2TargetProvenance | null;
  targetSelectionPersonality: V2TargetSelectionPersonality | null;
  targetSightClear: boolean;
  currentRouteKind: NavigationRouteCandidate["kind"] | null;
  currentRouteLinkId: string | null;
  traversalState: V2NpcTraversalState;
  location: NavigationLocation;
  stuckRevision: number;
  reservationResultRevision: number;
}>;

export type V2NpcSystemOptions = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  characterVisuals: V2CharacterVisualRuntime;
  npcCount: number;
  initialBrainwashedNpcCount: number;
  diagnosticsEnabled: boolean;
  random: () => number;
  spawnRandom: () => number;
  playerSpawn: StagePlayerSpawn;
  resolveTargetNavigationArea(
    target: V2HumanTargetSnapshot
  ): V2TargetNavigationAreaSnapshot;
  selectNavigationRoute(
    context: V2NpcNavigationRouteContext,
    candidates: readonly NavigationRouteCandidate[]
  ): NavigationRouteCandidate | null;
}>;

export type V2NpcTrackingSnapshot = Readonly<{
  npcId: string;
  targetId: string | null;
  provenance: V2TargetProvenance | null;
  targetSelectionPersonality: V2TargetSelectionPersonality | null;
  alertLeaderId: string | null;
  alertRemainingSeconds: number;
  commandMode: V2NpcCommandMode;
  temporaryGunActive: boolean;
  followerFirePhase: V2NpcFollowerFirePhase;
  traversalState: V2NpcTraversalState;
  pursuitPhase: V2PursuitPhase;
  evadeThreatIds: readonly string[];
}>;

export type V2NpcCommandKind = "follow" | "leave";

export type V2NpcCommandMode = "none" | "follow" | "leave";

export type V2NpcFollowerFirePhase =
  | "idle"
  | "scheduled"
  | "active"
  | "cooldown";

export type V2NpcCommandCandidate = Readonly<{
  npcId: string;
  aimPosition: Vector3;
  distanceMeters: number;
  aimAngleRadians: number;
  commandMode: V2NpcCommandMode;
}>;

export type V2NpcCommandQuery = Readonly<{
  playerTarget: V2HumanTargetSnapshot;
  cameraPosition: Vector3;
  cameraDirection: Vector3;
  isInCameraFrustum(position: Vector3): boolean;
}>;

export type V2NpcCaptureSnapshot = Readonly<{
  npcId: string;
  targetId: string;
  remainingSeconds: number;
}>;

export type V2NpcPlacementAssignment = Readonly<{
  id: string;
  footPosition: Vector3;
  formation: boolean;
}>;

export type V2NpcExternalThreat = Readonly<{
  sourceId: string;
  targetId: string;
  sourcePosition: Vector3;
  sightClear: boolean;
}>;

export type V2NpcBeamImpact = Readonly<{
  npcId: string;
  source: V2CharacterImpactSource;
}>;

export type V2NpcBeamSpawn = Readonly<{
  sourceId: string;
  beamId: string;
}>;

export type V2NpcStateChangeResult = Readonly<{
  npcId: string;
  accepted: boolean;
}>;

export const V2_NPC_EXECUTION_ROLES = [
  "target",
  "audience",
  "shooter"
] as const;
export type V2NpcExecutionRole =
  (typeof V2_NPC_EXECUTION_ROLES)[number];

export type V2NpcExecutionRoleAssignment = Readonly<{
  npcId: string;
  role: V2NpcExecutionRole;
}>;

export type V2NpcFrameView = Readonly<{
  targets: readonly V2HumanTargetSnapshot[];
  actorSpheres: readonly V2ActorSphere[];
  tracking: readonly V2NpcTrackingSnapshot[];
  captures: readonly V2NpcCaptureSnapshot[];
  threatenedTargetIds: readonly string[];
  pathRecalculationCount: number;
  waitingForPathCount: number;
  areaPursuitCount: number;
  coarsePursuitCount: number;
  detailPursuitCount: number;
  pursuitPromotionCount: number;
  pursuitDemotionCount: number;
  replanQueuedCount: number;
  replanCoalescedCount: number;
  replanMaximumWaitSeconds: number;
  currentTargetSightCheckCount: number;
  personalityRetargetQueryCount: number;
  sightRayCount: number;
  autonomousVisualTargetChangeCount: number;
  forcedTargetChangeCount: number;
  autonomousThreatSightCheckCount: number;
  autonomousThreatVisibleCount: number;
  autonomousThreatMaximumSourceCount: number;
  frameViewBuildSequence: number;
}>;

const EMPTY_V2_NPC_FRAME_VIEW: V2NpcFrameView = Object.freeze({
  targets: Object.freeze([]),
  actorSpheres: Object.freeze([]),
  tracking: Object.freeze([]),
  captures: Object.freeze([]),
  threatenedTargetIds: Object.freeze([]),
  pathRecalculationCount: 0,
  waitingForPathCount: 0,
  areaPursuitCount: 0,
  coarsePursuitCount: 0,
  detailPursuitCount: 0,
  pursuitPromotionCount: 0,
  pursuitDemotionCount: 0,
  replanQueuedCount: 0,
  replanCoalescedCount: 0,
  replanMaximumWaitSeconds: 0,
  currentTargetSightCheckCount: 0,
  personalityRetargetQueryCount: 0,
  sightRayCount: 0,
  autonomousVisualTargetChangeCount: 0,
  forcedTargetChangeCount: 0,
  autonomousThreatSightCheckCount: 0,
  autonomousThreatVisibleCount: 0,
  autonomousThreatMaximumSourceCount: 0,
  frameViewBuildSequence: 0
});

export interface V2NpcSystem {
  update(
    deltaSeconds: number,
    playerTarget: V2HumanTargetSnapshot,
    alarmTargetEvents: readonly V2AlarmTriggerEvent[]
  ): void;
  getFrameView(): V2NpcFrameView;
  getCommandCandidates(
    query: V2NpcCommandQuery
  ): readonly V2NpcCommandCandidate[];
  requestCommand(
    npcId: string,
    kind: V2NpcCommandKind,
    query: V2NpcCommandQuery
  ): boolean;
  cancelFollow(npcId: string): boolean;
  clearCommands(): void;
  notifyPlayerGunFire(event: V2PlayerGunFireEvent): void;
  notifyBeamsSpawned(spawns: readonly V2NpcBeamSpawn[]): void;
  notifyBeamCompletions(
    completions: readonly V2BeamCompletionEvent[]
  ): void;
  notifyPlayerImpactAccepted(): void;
  applyBeamImpacts(
    impacts: readonly V2NpcBeamImpact[]
  ): readonly V2NpcStateChangeResult[];
  prepareExecutionRoles(
    assignments: readonly V2NpcExecutionRoleAssignment[]
  ): void;
  enterFormationStates(
    npcIds: readonly string[]
  ): readonly V2NpcStateChangeResult[];
  drainBeamRequests(): readonly V2BeamRequest[];
  drainAlertRequests(): readonly V2AlertRequest[];
  drainTraversalRequests(): readonly V2NpcTraversalRequest[];
  applyTraversalResults(
    results: readonly V2NpcTraversalResult[]
  ): readonly V2NpcTraversalNotification[];
  getTraversalState(npcId: string): V2NpcTraversalState;
  getNpcPosition(npcId: string): Vector3;
  setNpcTransportPosition(npcId: string, position: Vector3): void;
  releaseTraversalForScriptedPhase(): void;
  setExternalThreats(threats: readonly V2NpcExternalThreat[]): void;
  setAutonomousThreatActors(actors: readonly V2ActorSphere[]): void;
  setPlayerElevatorTraversalSnapshot(
    snapshot: V2PlayerElevatorTraversalSnapshot | null
  ): void;
  setPlayerBlockedTargetIds(targetIds: readonly string[]): void;
  setVisibleNpcIds(npcIds: readonly string[]): void;
  setAiSuspended(suspended: boolean): void;
  placeNpcs(assignments: readonly V2NpcPlacementAssignment[]): void;
  dispose(): void;
}

type NpcAlarmTarget = {
  candidateId: string;
  targetId: string;
};

type NpcCapture = {
  targetId: string;
  remainingSeconds: number;
  lastTargetFootPosition: Vector3;
};

type NpcGunVisualPursuitMode = "live" | "last-seen";

type NpcCommandRuntime = {
  mode: V2NpcCommandMode;
  temporaryGunActive: boolean;
  followSightClear: boolean;
  followLostSightSeconds: number;
  followLastSeenFootPosition: Vector3 | null;
  readonly followLastSeenDirection: Vector3;
  readonly followFormationOffset: Vector3;
  followElevatorDestination: Vector3 | null;
  followElevatorDestinationAreaId: string | null;
  followElevatorLinkId: string | null;
  followMovementStopped: boolean;
  leaveDestination: NavigationLocation | null;
  leaveElapsedSeconds: number;
  followerFirePhase: V2NpcFollowerFirePhase;
  followerFireRemainingSeconds: number;
  followerFireDirection: Vector3 | null;
  followerBeamId: string | null;
  followerBeamRequestQueued: boolean;
  followerFireRandomState: number;
};

type NpcRuntime = {
  readonly id: string;
  readonly visual: ReturnType<V2CharacterVisualRuntime["createSprite"]>;
  readonly sprite: Sprite;
  readonly navigationAgent: NavigationAgent;
  readonly navigationRoutePolicy: NavigationRoutePolicy;
  readonly stateSystem: V2CharacterStateSystem;
  stateSnapshot: V2CharacterStateSnapshot;
  navigationLocation: NavigationLocation;
  navigationBehavior: V2NpcNavigationBehavior;
  navigationSpeed: number;
  navigationTargetPosition: Vector3;
  navigationPendingTargetPosition: Vector3 | null;
  navigationGoalRevision: number;
  navigationReplanRequestedAtSeconds: number | null;
  navigationReplanPriority: NpcNavigationReplanPriority;
  navigationRemainingPathDistance: number | null;
  navigationAgentCleared: boolean;
  navigationLastStuckRevision: number;
  selectedRouteKind: NavigationRouteCandidate["kind"] | null;
  selectedElevatorTransition: NavigationTransitionStep | null;
  footPosition: Vector3;
  readonly forward: Vector3;
  lastState: V2CharacterState;
  wanderDestination: NavigationLocation | null;
  wanderWaitSeconds: number;
  restSlot: NavigationLocation | null;
  restSlotAreaId: string | null;
  restSlotKey: string | null;
  restSlotReferenceDistance: number;
  resting: boolean;
  targetId: string | null;
  targetProvenance: V2TargetProvenance | null;
  targetSelectionPersonality: V2TargetSelectionPersonality | null;
  personalityRetargetCooldownSeconds: number;
  visualSightCheckPriority: boolean;
  gunVisualPursuitMode: NpcGunVisualPursuitMode | null;
  gunLastSeenFootPosition: Vector3 | null;
  gunLastSeenPathPlanned: boolean;
  visualTargetSightClear: boolean;
  evadeThreatId: string | null;
  evadeThreatSightClear: boolean;
  evadeThreatSetKey: string;
  evadeNavigationReplanPriority: NpcNavigationReplanPriority;
  readonly autonomousVisualThreats: Map<string, NpcEvadeThreat>;
  alertLeaderId: string | null;
  alertRemainingSeconds: number;
  pursuitPhase: V2PursuitPhase;
  pursuitTargetId: string | null;
  pursuitTargetAreaId: string | null;
  pursuitTargetAreaRevision: number;
  pursuitActorAreaCursor: StageNavigationAreaCursor;
  pursuitActorAreaPosition: Vector3;
  pursuitAnchor: Vector3;
  readonly pursuitCoarseRefreshOffsetSeconds: number;
  pursuitCoarseRefreshRemainingSeconds: number;
  readonly alarmTargetQueue: NpcAlarmTarget[];
  fireCooldownSeconds: number;
  capture: NpcCapture | null;
  breakawayRemainingSeconds: number;
  breakawayDestination: NavigationLocation | null;
  readonly command: NpcCommandRuntime;
  traversalState: V2NpcTraversalState;
  pendingNavigationTransition: NavigationTransitionStep | null;
  reservationResultRevision: number;
};

type NpcRestSlotOccupancy = {
  readonly ownerId: string;
  readonly position: Vector3;
  areaId: string | null;
};

type NpcRestSlotAreaOccupancy = {
  readonly entries: NpcRestSlotOccupancy[];
  readonly index: V2PlanarSpatialIndex<NpcRestSlotOccupancy>;
  readonly queryScratch: NpcRestSlotOccupancy[];
};

type ResolvedPlacement = Readonly<{
  npc: NpcRuntime;
  navigationLocation: NavigationLocation;
  footPosition: Vector3;
  formation: boolean;
}>;

type NpcElevatorStopTraversal = Readonly<{
  stopId: string;
  callMatId: string;
  callMatCenter: Vector3;
  waitLocation: NavigationLocation;
  oppositeLocation: NavigationLocation;
}>;

type NpcEvadeThreat = Readonly<{
  sourceId: string;
  sourceAimPosition: Vector3;
  sightClear: boolean;
  provenance: "direct" | "autonomous";
}>;

type NpcEvadeThreatsByTargetId = Map<
  string,
  Map<string, NpcEvadeThreat>
>;

const addNpcEvadeThreat = (
  threatsByTargetId: NpcEvadeThreatsByTargetId,
  targetId: string,
  threat: NpcEvadeThreat
) => {
  const threats = threatsByTargetId.get(targetId) ?? new Map();
  const existing = threats.get(threat.sourceId);
  if (
    existing?.provenance === "direct" &&
    threat.provenance === "autonomous"
  ) {
    return;
  }
  threats.set(threat.sourceId, threat);
  threatsByTargetId.set(targetId, threats);
};

type NpcSightResultCache = Map<string, boolean>;

type NpcScheduleResult = Readonly<{
  npcIds: ReadonlySet<string>;
  nextCursor: number;
}>;

type MutableNpcTargetSnapshot = {
  id: string;
  kind: "npc";
  footPosition: Vector3;
  aimPosition: Vector3;
  hitShape: {
    center: Vector3;
    radii: Vector3;
  };
  state: V2CharacterState;
  alive: boolean;
  brainwashed: boolean;
};

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const assertPositiveFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}には正の有限値が必要です。`);
  }
};

const assertNpcCount = (
  npcCount: number,
  initialBrainwashedNpcCount: number
) => {
  if (!Number.isInteger(npcCount) || npcCount < 0) {
    throw new Error("npcCountには0以上の整数が必要です。");
  }
  if (
    !Number.isInteger(initialBrainwashedNpcCount) ||
    initialBrainwashedNpcCount < 0 ||
    initialBrainwashedNpcCount > npcCount
  ) {
    throw new Error(
      "initialBrainwashedNpcCountには0以上npcCount以下の整数が必要です。"
    );
  }
};

const assertTargetSnapshot = (
  label: string,
  target: V2HumanTargetSnapshot
) => {
  if (target.id.length === 0) {
    throw new Error(`${label}のIDが空です。`);
  }
  assertFiniteVector(`${label}の足元`, target.footPosition);
  assertFiniteVector(`${label}の照準点`, target.aimPosition);
  assertFiniteVector(`${label}の命中形状中心`, target.hitShape.center);
  assertFiniteVector(`${label}の命中形状半径`, target.hitShape.radii);
  assertPositiveFiniteNumber(
    `${label}の命中形状X半径`,
    target.hitShape.radii.x
  );
  assertPositiveFiniteNumber(
    `${label}の命中形状Y半径`,
    target.hitShape.radii.y
  );
  assertPositiveFiniteNumber(
    `${label}の命中形状Z半径`,
    target.hitShape.radii.z
  );
  if (target.alive !== isV2AliveState(target.state)) {
    throw new Error(`${label}のaliveとstateが一致しません。`);
  }
  if (target.brainwashed !== isV2BrainwashState(target.state)) {
    throw new Error(`${label}のbrainwashedとstateが一致しません。`);
  }
};

const assertAlarmTargetEvent = (event: V2AlarmTriggerEvent) => {
  if (
    event.candidateId.length === 0 ||
    event.targetId.length === 0
  ) {
    throw new Error(
      "alarm target eventには非空のcandidateIdとtargetIdが必要です。"
    );
  }
  assertFiniteVector("alarm target eventの発火位置", event.position);
};

const toAimPosition = (footPosition: Vector3) =>
  new Vector3(
    footPosition.x,
    footPosition.y + NPC_SPRITE_CENTER_HEIGHT,
    footPosition.z
  );

const toElevatorEndpointKey = (
  linkId: string,
  endpoint: "A" | "B"
) => `${linkId}:${endpoint}`;

const cloneNavigationLocation = (
  location: NavigationLocation
): NavigationLocation =>
  Object.freeze({
    position: location.position.clone(),
    polygonRef: location.polygonRef
  });

const cloneNavigationTransition = (
  transition: NavigationTransitionStep
): NavigationTransitionStep =>
  Object.freeze({
    kind: "transition",
    link: transition.link,
    from: transition.from,
    to: transition.to,
    entry: cloneNavigationLocation(transition.entry),
    exit: cloneNavigationLocation(transition.exit),
    distance: transition.distance
  });

const clonePlayerElevatorTraversalSnapshot = (
  snapshot: V2PlayerElevatorTraversalSnapshot
): V2PlayerElevatorTraversalSnapshot =>
  Object.freeze({
    ...snapshot,
    destinationFloorPosition:
      snapshot.destinationFloorPosition.clone()
  });

const cloneTargetSnapshot = (
  target: V2HumanTargetSnapshot
): V2HumanTargetSnapshot =>
  Object.freeze({
    ...target,
    footPosition: target.footPosition.clone(),
    aimPosition: target.aimPosition.clone(),
    hitShape: Object.freeze({
      center: target.hitShape.center.clone(),
      radii: target.hitShape.radii.clone()
    })
  });

const createMutableNpcTargetSnapshot = (
  npc: NpcRuntime
): MutableNpcTargetSnapshot => {
  const state = npc.stateSnapshot.state;
  const aimPosition = toAimPosition(npc.footPosition);
  return {
    id: npc.id,
    kind: "npc" as const,
    footPosition: npc.footPosition.clone(),
    aimPosition,
    hitShape: {
      center: aimPosition.clone(),
      radii: NPC_HIT_RADII.clone()
    },
    state,
    alive: isV2AliveState(state),
    brainwashed: isV2BrainwashState(state)
  };
};

const freezeNpcTargetSnapshot = (
  snapshot: MutableNpcTargetSnapshot
): V2HumanTargetSnapshot => {
  Object.freeze(snapshot.hitShape);
  return Object.freeze(snapshot);
};

const createNpcTargetSnapshot = (
  npc: NpcRuntime
): V2HumanTargetSnapshot =>
  freezeNpcTargetSnapshot(createMutableNpcTargetSnapshot(npc));

const isCompletedCommandState = (state: V2CharacterState) =>
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun" ||
  state === "brainwash-complete-haigure";

const isCompletedBrainwashState = (state: V2CharacterState) =>
  isCompletedCommandState(state) ||
  state === "brainwash-complete-haigure-formation";

const isPlayerCommandState = (state: V2CharacterState) =>
  isV2AliveState(state) || isCompletedCommandState(state);

const isNpcCommandStateForPlayer = (
  npcState: V2CharacterState,
  playerState: V2CharacterState
) =>
  isV2AliveState(playerState)
    ? isV2AliveState(npcState)
    : isCompletedCommandState(playerState) &&
      isCompletedCommandState(npcState);

const isStoppedState = (state: V2CharacterState) =>
  isV2HitState(state) ||
  state === "brainwash-in-progress" ||
  state === "brainwash-complete-haigure" ||
  state === "brainwash-complete-haigure-formation";

const createFollowerFireRandomState = (
  npcId: string,
  sessionEntropy: number
) => {
  let state = 0x811c9dc5;
  const domain = `${npcId}:follower-fire:${sessionEntropy.toPrecision(17)}`;
  for (let index = 0; index < domain.length; index += 1) {
    state ^= domain.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }
  return state >>> 0;
};

const createFollowerFormationOffset = (npcId: string) => {
  const state = createFollowerFireRandomState(npcId, 0);
  const angle = (state / 0x1_0000_0000) * Math.PI * 2;
  return new Vector3(
    Math.cos(angle) * NPC_FOLLOW_SEPARATION_DISTANCE,
    0,
    Math.sin(angle) * NPC_FOLLOW_SEPARATION_DISTANCE
  );
};

const createNpcRestSlotAngle = (npcId: string) => {
  let state = 0x811c9dc5;
  const domain = `${npcId}:rest-slot`;
  for (let index = 0; index < domain.length; index += 1) {
    state ^= domain.charCodeAt(index);
    state = Math.imul(state, 0x01000193);
  }
  return ((state >>> 0) / 0x1_0000_0000) * Math.PI * 2;
};

const createNpcCommandRuntime = (
  npcId: string,
  sessionEntropy: number
): NpcCommandRuntime => ({
  mode: "none",
  temporaryGunActive: false,
  followSightClear: false,
  followLostSightSeconds: 0,
  followLastSeenFootPosition: null,
  followLastSeenDirection: Vector3.Zero(),
  followFormationOffset: createFollowerFormationOffset(npcId),
  followElevatorDestination: null,
  followElevatorDestinationAreaId: null,
  followElevatorLinkId: null,
  followMovementStopped: false,
  leaveDestination: null,
  leaveElapsedSeconds: 0,
  followerFirePhase: "idle",
  followerFireRemainingSeconds: 0,
  followerFireDirection: null,
  followerBeamId: null,
  followerBeamRequestQueued: false,
  followerFireRandomState: createFollowerFireRandomState(
    npcId,
    sessionEntropy
  )
});

class SchoolV2NpcSystem implements V2NpcSystem {
  private readonly stage: StageSpatialContext;
  private readonly npcs: NpcRuntime[];
  private readonly npcsById: Map<string, NpcRuntime>;
  private readonly random: () => number;
  private readonly diagnosticsEnabled: boolean;
  private readonly selectNavigationRoute: V2NpcSystemOptions["selectNavigationRoute"];
  private readonly doorIdByCollider: ReadonlyMap<Mesh, string>;
  private readonly elevatorHumanGateColliders: ReadonlySet<Mesh>;
  private readonly elevatorStopByLinkEndpoint: ReadonlyMap<
    string,
    NpcElevatorStopTraversal
  >;
  private readonly pendingAlertRequests: V2AlertRequest[] = [];
  private readonly pendingBeamRequests: V2BeamRequest[] = [];
  private readonly pendingTraversalRequests: V2NpcTraversalRequest[] = [];
  private frameView: V2NpcFrameView;
  private readonly grantedReplanNpcIds = new Set<string>();
  private readonly queuedReplanNpcs: NpcRuntime[] = [];
  private replanCoalescedCount = 0;
  private replanMaximumWaitSeconds = 0;
  private pursuitPromotionCount = 0;
  private pursuitDemotionCount = 0;
  private pathRecalculationCount = 0;
  private waitingForPathCount = 0;
  private currentTargetSightCheckCount = 0;
  private personalityRetargetQueryCount = 0;
  private sightRayCount = 0;
  private autonomousVisualTargetChangeCount = 0;
  private forcedTargetChangeCount = 0;
  private autonomousThreatSightCheckCount = 0;
  private autonomousThreatVisibleCount = 0;
  private autonomousThreatMaximumSourceCount = 0;
  private readonly resolveTargetNavigationArea: (
    target: V2HumanTargetSnapshot
  ) => V2TargetNavigationAreaSnapshot;
  private frameViewBuildSequence = 0;
  private currentTargetSightCredit = 1;
  private currentTargetSightCursor = 0;
  private personalityRetargetCredit = 0;
  private personalityRetargetCursor = 0;
  private autonomousThreatSightCredit = 1;
  private autonomousThreatSightCursor = 0;
  private externalThreats: readonly V2NpcExternalThreat[] =
    Object.freeze([]);
  private autonomousThreatActors: readonly V2ActorSphere[] =
    Object.freeze([]);
  private readonly autonomousThreatActorSpatialIndex =
    createV2PlanarSpatialIndex<V2ActorSphere>(
      (actor) => actor.center,
      NPC_VISION_RANGE
    );
  private readonly autonomousThreatActorQueryScratch: V2ActorSphere[] = [];
  private readonly restSlotOccupancyByAreaId =
    new Map<string, NpcRestSlotAreaOccupancy>();
  private readonly restSlotOccupancyByNpcId =
    new Map<string, NpcRestSlotOccupancy>();
  private readonly playerRestSlotOccupancy: NpcRestSlotOccupancy = {
    ownerId: "player",
    position: Vector3.Zero(),
    areaId: null
  };
  private restSlotOccupancyPrepared = false;
  private restSlotOccupancyPlayerTarget: V2HumanTargetSnapshot | null = null;
  private playerElevatorTraversalSource:
    | V2PlayerElevatorTraversalSnapshot
    | null = null;
  private playerElevatorTraversal: V2PlayerElevatorTraversalSnapshot | null =
    null;
  private playerBlockedTargetIds: readonly string[] = Object.freeze([]);
  private previousPlayerFootPosition: Vector3 | null = null;
  private readonly playerHorizontalDirection = Vector3.Zero();
  private traversalElapsedSeconds = 0;
  private aiSuspended = false;
  private disposed = false;

  constructor(options: V2NpcSystemOptions) {
    assertNpcCount(options.npcCount, options.initialBrainwashedNpcCount);
    if (typeof options.random !== "function") {
      throw new Error("randomには0以上1未満を返す関数が必要です。");
    }
    if (typeof options.spawnRandom !== "function") {
      throw new Error("spawnRandomには0以上1未満を返す関数が必要です。");
    }
    if (typeof options.selectNavigationRoute !== "function") {
      throw new Error("selectNavigationRouteには関数が必要です。");
    }

    this.stage = options.stage;
    this.random = options.random;
    this.diagnosticsEnabled = options.diagnosticsEnabled;
    this.selectNavigationRoute = options.selectNavigationRoute;
    this.resolveTargetNavigationArea = options.resolveTargetNavigationArea;
    if (typeof this.resolveTargetNavigationArea !== "function") {
      throw new Error("NPC追跡にはNavigation Area resolverが必要です。");
    }
    const doorIdByCollider = new Map<Mesh, string>();
    for (const door of options.stage.doorAssets.all) {
      if (door.doorClass !== "room" && door.doorClass !== "toilet_stall") {
        continue;
      }
      for (const panel of door.panels) {
        for (const collider of panel.colliderMeshes) {
          doorIdByCollider.set(collider, door.id);
        }
      }
    }
    this.doorIdByCollider = doorIdByCollider;
    this.elevatorHumanGateColliders = new Set(
      options.stage.elevatorAssets.all.flatMap((elevator) =>
        elevator.stops.map((stop) => stop.humanGate.collider)
      )
    );
    const elevatorStopByLinkEndpoint = new Map<
      string,
      NpcElevatorStopTraversal
    >();
    for (const elevator of options.stage.elevatorAssets.all) {
      for (const stop of elevator.stops) {
        const waitLocation = options.stage.navigation.projectPoint(
          stop.wait.node.getAbsolutePosition(),
          NAVIGATION_PROJECTION_MAX_DISTANCE
        );
        const oppositeEndpoint =
          stop.endpoint === "A"
            ? elevator.link.endpointB
            : elevator.link.endpointA;
        const oppositeLocation = options.stage.navigation.projectPoint(
          oppositeEndpoint.position,
          NAVIGATION_PROJECTION_MAX_DISTANCE
        );
        if (!waitLocation || !oppositeLocation) {
          throw new Error(
            `NPCエレベーター停止階をNavMeshへ投影できません: ${elevator.id}/${stop.id}`
          );
        }
        stop.callMat.mesh.computeWorldMatrix(true);
        elevatorStopByLinkEndpoint.set(
          toElevatorEndpointKey(elevator.link.id, stop.endpoint),
          Object.freeze({
            stopId: stop.id,
            callMatId: stop.callMat.id,
            callMatCenter:
              stop.callMat.mesh.getBoundingInfo().boundingBox.centerWorld.clone(),
            waitLocation: cloneNavigationLocation(waitLocation),
            oppositeLocation:
              cloneNavigationLocation(oppositeLocation)
          })
        );
      }
    }
    this.elevatorStopByLinkEndpoint = elevatorStopByLinkEndpoint;

    const spawnPoints = (() => {
      if (options.npcCount === 0) {
        return Object.freeze([]);
      }
      const sampler = createStageVolumeSpawnSampler(
        options.stage.volumes.getByRole("npc_spawn"),
        options.stage.navigation,
        {
          maxAttempts: options.npcCount * 64,
          projectionMaxDistance: SPAWN_PROJECTION_MAX_DISTANCE,
          random: options.spawnRandom
        }
      );
      const isCommonExcluded = (point: Vector3) => {
        const footPosition = this.resolveFootPosition(point);
        return (
          options.stage.queries.containsVolume(
            "no_enemy_spawn",
            footPosition
          ) ||
          options.stage.queries.containsVolume(
            "no_enemy_enter",
            footPosition
          ) ||
          options.stage.queries.containsVolume("hazard", footPosition) ||
          options.stage.queries.containsVolume("water", footPosition) ||
          options.stage.navigationAreas.portals.some((portal) =>
            portal.contains(footPosition)
          )
        );
      };
      const brainwashedPoints = sampler.samplePoints(
        options.initialBrainwashedNpcCount,
        SPAWN_MINIMUM_DISTANCE,
        Object.freeze([]),
        (point) =>
          isCommonExcluded(point) ||
          options.stage.queries.containsVolumeById(
            options.playerSpawn.exclusionVolume.id,
            this.resolveFootPosition(point)
          )
      );
      const normalPoints = sampler.samplePoints(
        options.npcCount - options.initialBrainwashedNpcCount,
        SPAWN_MINIMUM_DISTANCE,
        brainwashedPoints,
        isCommonExcluded
      );
      return Object.freeze([...brainwashedPoints, ...normalPoints]);
    })();

    const npcs: NpcRuntime[] = [];
    const cleanupActions: Array<() => void> = [];

    try {
      for (let index = 0; index < spawnPoints.length; index += 1) {
        const spawnPoint = spawnPoints[index];
        const id = `npc_${index}`;
        const initialState =
          index < options.initialBrainwashedNpcCount
          ? this.pickInitialBrainwashedState()
          : "normal";
        const stateSystem = createV2CharacterStateSystem({
          kind: "npc",
          initialState,
          random: () => this.nextRandom()
        });
        const visual = options.characterVisuals.createSprite(id, id);
        cleanupActions.push(() => visual.dispose());
        const sprite = visual.sprite;
        sprite.width = visual.width;
        sprite.height = visual.height;
        sprite.isPickable = false;
        visual.setState(initialState, false);
        sprite.color.a = 1;
        const footPosition = this.resolveFootPosition(spawnPoint.position);
        sprite.position.copyFrom(footPosition);
        sprite.position.y += visual.height / 2;
        visual.syncPresentation();
        const angle = this.nextRandom() * Math.PI * 2;
        const command = createNpcCommandRuntime(id, angle);
        let npc: NpcRuntime;
        const navigationRoutePolicy: NavigationRoutePolicy = Object.freeze({
          selectRoute: (candidates) => {
            const selected = this.selectNavigationRoute(
              this.createNavigationRouteContext(npc),
              candidates
            );
            npc.selectedRouteKind = selected?.kind ?? null;
            const elevatorTransition = selected?.path.steps.find(
              (
                step
              ): step is NavigationTransitionStep =>
                step.kind === "transition" &&
                step.link.kind === "elevator"
            );
            this.synchronizeApproachingElevatorRouteSelection(
              npc,
              elevatorTransition ?? null
            );
            npc.selectedElevatorTransition = elevatorTransition
              ? cloneNavigationTransition(elevatorTransition)
              : null;
            return selected;
          }
        });
        const navigationAgent = createNavigationAgent(
          options.stage.navigation,
          "npc",
          navigationRoutePolicy,
          NAVIGATION_AGENT_CONFIG
        );
        cleanupActions.push(() => navigationAgent.clear());
        npc = {
          id,
          visual,
          sprite,
          navigationAgent,
          navigationRoutePolicy,
          stateSystem,
          stateSnapshot: stateSystem.getSnapshot(),
          navigationLocation: cloneNavigationLocation(spawnPoint),
          navigationBehavior: "wander",
          navigationSpeed: NPC_SEARCH_SPEED,
          navigationTargetPosition: footPosition.clone(),
          navigationPendingTargetPosition: null,
          navigationGoalRevision: 0,
          navigationReplanRequestedAtSeconds: null,
          navigationReplanPriority: 4,
          navigationRemainingPathDistance: null,
          navigationAgentCleared: true,
          navigationLastStuckRevision: 0,
          selectedRouteKind: null,
          selectedElevatorTransition: null,
          footPosition,
          forward: new Vector3(Math.sin(angle), 0, Math.cos(angle)),
          lastState: initialState,
          wanderDestination: null,
          wanderWaitSeconds: this.nextWanderWait(),
          restSlot: null,
          restSlotAreaId: null,
          restSlotKey: null,
          restSlotReferenceDistance: 0,
          resting: false,
          targetId: null,
          targetProvenance: null,
          targetSelectionPersonality: isCompletedBrainwashState(
            initialState
          )
            ? selectV2TargetSelectionPersonality("npc", id)
            : null,
          personalityRetargetCooldownSeconds: 0,
          visualSightCheckPriority: true,
          gunVisualPursuitMode: null,
          gunLastSeenFootPosition: null,
          gunLastSeenPathPlanned: false,
          visualTargetSightClear: false,
          evadeThreatId: null,
          evadeThreatSightClear: false,
          evadeThreatSetKey: "",
          evadeNavigationReplanPriority: 4,
          autonomousVisualThreats: new Map(),
          alertLeaderId: null,
          alertRemainingSeconds: 0,
          pursuitPhase: "detail",
          pursuitTargetId: null,
          pursuitTargetAreaId: null,
          pursuitTargetAreaRevision: -1,
          pursuitActorAreaCursor:
            this.stage.navigationAreas.locate(footPosition),
          pursuitActorAreaPosition: footPosition.clone(),
          pursuitAnchor: footPosition.clone(),
          pursuitCoarseRefreshOffsetSeconds:
            ((index + 0.5) / Math.max(1, options.npcCount)) *
            V2_NPC_COARSE_REFRESH_SECONDS,
          pursuitCoarseRefreshRemainingSeconds:
            ((index + 0.5) / Math.max(1, options.npcCount)) *
            V2_NPC_COARSE_REFRESH_SECONDS,
          alarmTargetQueue: [],
          fireCooldownSeconds:
            initialState === "brainwash-complete-gun"
              ? this.nextInitialGunCooldown()
              : 0,
          capture: null,
          breakawayRemainingSeconds: 0,
          breakawayDestination: null,
          command,
          traversalState: createWalkingV2NpcTraversalState(),
          pendingNavigationTransition: null,
          reservationResultRevision: 0
        };
        npcs.push(npc);
      }
      this.npcs = npcs;
      this.npcsById = new Map(npcs.map((npc) => [npc.id, npc]));
      this.frameView = this.buildFrameView(Object.freeze([]));
      cleanupActions.length = 0;
    } catch (error) {
      for (let index = cleanupActions.length - 1; index >= 0; index -= 1) {
        cleanupActions[index]();
      }
      throw error;
    }
  }

  update(
    deltaSeconds: number,
    playerTarget: V2HumanTargetSnapshot,
    alarmTargetEvents: readonly V2AlarmTriggerEvent[]
  ) {
    this.assertActive();
    assertNonNegativeFiniteNumber("NPC更新deltaSeconds", deltaSeconds);
    this.traversalElapsedSeconds += deltaSeconds;
    if (!Number.isFinite(this.traversalElapsedSeconds)) {
      throw new Error("NPC traversal経過時間が有限値になりません。");
    }
    assertTargetSnapshot("プレイヤー標的", playerTarget);
    if (playerTarget.kind !== "player") {
      throw new Error("NPC更新へ渡す外部標的はplayerである必要があります。");
    }
    if (this.previousPlayerFootPosition) {
      const displacementX =
        playerTarget.footPosition.x - this.previousPlayerFootPosition.x;
      const displacementZ =
        playerTarget.footPosition.z - this.previousPlayerFootPosition.z;
      const displacementSquared =
        displacementX * displacementX + displacementZ * displacementZ;
      if (displacementSquared > 0) {
        const inverseLength = 1 / Math.sqrt(displacementSquared);
        this.playerHorizontalDirection.set(
          displacementX * inverseLength,
          0,
          displacementZ * inverseLength
        );
      }
      this.previousPlayerFootPosition.copyFrom(playerTarget.footPosition);
    } else {
      this.previousPlayerFootPosition = playerTarget.footPosition.clone();
    }
    for (const npc of this.npcs) {
      if (
        npc.command.mode !== "none" &&
        isV2BrainwashState(npc.stateSnapshot.state) !==
          isV2BrainwashState(playerTarget.state)
      ) {
        this.clearNpcCommand(npc, true);
      }
    }
    this.applyAlarmTargetEvents(alarmTargetEvents);
    this.pathRecalculationCount = 0;
    this.waitingForPathCount = 0;
    this.replanCoalescedCount = 0;
    this.replanMaximumWaitSeconds = 0;
    this.pursuitPromotionCount = 0;
    this.pursuitDemotionCount = 0;
    this.currentTargetSightCheckCount = 0;
    this.personalityRetargetQueryCount = 0;
    this.sightRayCount = 0;
    this.autonomousVisualTargetChangeCount = 0;
    this.forcedTargetChangeCount = 0;
    this.autonomousThreatSightCheckCount = 0;
    this.autonomousThreatVisibleCount = 0;
    this.autonomousThreatMaximumSourceCount = 0;
    this.restSlotOccupancyPrepared = false;

    for (const npc of this.npcs) {
      npc.personalityRetargetCooldownSeconds = Math.max(
        0,
        npc.personalityRetargetCooldownSeconds - deltaSeconds
      );
      const previousState = npc.lastState;
      const stateDeltaSeconds =
        npc.command.mode !== "none" &&
        npc.stateSnapshot.state === "brainwash-complete-haigure"
          ? 0
          : deltaSeconds;
      npc.stateSnapshot = npc.stateSystem.update(stateDeltaSeconds);
      const currentState = npc.stateSnapshot.state;
      this.assignTargetSelectionPersonality(npc, currentState);
      this.synchronizeStateMode(npc, previousState, currentState);
      npc.lastState = currentState;
      this.applySpriteVisualState(npc);
    }

    const visibleNpcs: NpcRuntime[] = [];
    const frameNpcTargets: MutableNpcTargetSnapshot[] = [];
    const playerFrameTarget = cloneTargetSnapshot(playerTarget);
    const mutableFrameTargets: V2HumanTargetSnapshot[] = [
      playerFrameTarget
    ];
    const targetsById = new Map<string, V2HumanTargetSnapshot>();
    targetsById.set(playerFrameTarget.id, playerFrameTarget);
    for (const npc of this.npcs) {
      if (!npc.sprite.isVisible) {
        continue;
      }
      const target = createMutableNpcTargetSnapshot(npc);
      visibleNpcs.push(npc);
      frameNpcTargets.push(target);
      mutableFrameTargets.push(target);
      targetsById.set(target.id, target);
    }
    const frameTargets: readonly V2HumanTargetSnapshot[] =
      Object.freeze(mutableFrameTargets);
    if (targetsById.size !== frameTargets.length) {
      throw new Error("NPC更新の標的IDが重複しています。");
    }

    const threatenedIds = new Set<string>();
    const threatSourcesByTargetId: NpcEvadeThreatsByTargetId =
      new Map();
    const capturedTargetIds = new Set<string>(
      this.playerBlockedTargetIds
    );

    for (const threat of this.externalThreats) {
      const target = targetsById.get(threat.targetId);
      if (!target) {
        throw new Error(
          `外部脅威の対象が現在frameに存在しません: ${threat.targetId}`
        );
      }
      if (!target.alive) {
        continue;
      }
      const targetNpc = this.npcsById.get(target.id);
      if (targetNpc?.command.mode !== "none") {
        continue;
      }
      threatenedIds.add(target.id);
      addNpcEvadeThreat(
        threatSourcesByTargetId,
        target.id,
        Object.freeze({
          sourceId: threat.sourceId,
          sourceAimPosition: threat.sourcePosition.clone(),
          sightClear: threat.sightClear,
          provenance: "direct" as const
        })
      );
    }

    if (this.aiSuspended) {
      for (const npc of this.npcs) {
        if (!npc.sprite.isVisible) {
          continue;
        }
        this.clearNavigationAgent(npc);
        if (npc.capture) {
          capturedTargetIds.add(npc.capture.targetId);
          this.registerCaptureThreat(
            npc,
            npc.capture.targetId,
            threatenedIds,
            threatSourcesByTargetId
          );
        }
      }
      this.finishFrame(threatenedIds, visibleNpcs, frameNpcTargets);
      return;
    }

    this.advanceAlarmTargetQueues(targetsById);
    const startedBreakawayNpcIds = this.advanceCaptures(
      deltaSeconds,
      targetsById,
      capturedTargetIds,
      threatenedIds,
      threatSourcesByTargetId
    );

    const targetSpatialIndex = createV2HumanTargetSpatialIndex(
      frameTargets,
      NPC_VISION_RANGE
    );
    this.prepareReplanPermissions();
    const commandNpcIds = this.prepareNpcCommands(
      playerFrameTarget
    );
    const autonomousCombatNpcs = this.collectAutonomousCombatNpcs(
      commandNpcIds
    );
    const autonomousThreatObservers =
      this.collectAutonomousThreatObservers(commandNpcIds);
    this.invalidateAutonomousVisualTargets(
      autonomousCombatNpcs,
      targetsById,
      capturedTargetIds
    );
    const currentTargetSightCandidates =
      this.collectCurrentTargetSightCandidates(
        autonomousCombatNpcs
      );
    const currentTargetSightNpcIds =
      this.scheduleCurrentTargetSightChecks(
        currentTargetSightCandidates,
        deltaSeconds
      );
    this.updateCommands(
      deltaSeconds,
      playerFrameTarget,
      currentTargetSightNpcIds
    );
    this.prepareRestSlotOccupancyCaches(playerFrameTarget);
    this.updateAutonomousVisualThreats(
      autonomousThreatObservers,
      targetSpatialIndex,
      deltaSeconds
    );
    for (const npc of autonomousThreatObservers) {
      if (
        npc.command.mode !== "none" ||
        !isV2AliveState(npc.stateSnapshot.state) ||
        isV2BrainwashState(npc.stateSnapshot.state)
      ) {
        npc.autonomousVisualThreats.clear();
        continue;
      }
      for (const threat of npc.autonomousVisualThreats.values()) {
        threatenedIds.add(npc.id);
        addNpcEvadeThreat(
          threatSourcesByTargetId,
          npc.id,
          threat
        );
      }
      this.autonomousThreatVisibleCount +=
        npc.autonomousVisualThreats.size;
      this.autonomousThreatMaximumSourceCount = Math.max(
        this.autonomousThreatMaximumSourceCount,
        npc.autonomousVisualThreats.size
      );
    }
    const personalityRetargetNpcIds =
      this.schedulePersonalityRetargetQueries(
        autonomousCombatNpcs,
        deltaSeconds
      );
    for (let npcIndex = 0; npcIndex < this.npcs.length; npcIndex += 1) {
      const npc = this.npcs[npcIndex];
      if (!npc.sprite.isVisible) {
        this.clearNavigationAgent(npc);
        continue;
      }
      if (
        commandNpcIds.has(npc.id) ||
        npc.command.mode !== "none"
      ) {
        continue;
      }
      const state = npc.stateSnapshot.state;
      if (
        state !== "brainwash-complete-gun" &&
        state !== "brainwash-complete-no-gun"
      ) {
        if (isStoppedState(state)) {
          this.clearNavigationAgent(npc);
        }
        continue;
      }
      if (npc.capture) {
        continue;
      }
      if (
        state === "brainwash-complete-no-gun" &&
        npc.breakawayRemainingSeconds > 0
      ) {
        if (!startedBreakawayNpcIds.has(npc.id)) {
          this.updateBreakaway(
            npc,
            deltaSeconds,
            this.hasReplanPermission(npcIndex)
          );
        }
        continue;
      }

      const target = this.selectCombatTarget(
        npc,
        state,
        targetSpatialIndex,
        targetsById,
        capturedTargetIds,
        currentTargetSightNpcIds.has(npc.id),
        personalityRetargetNpcIds.has(npc.id)
      );
      if (!target) {
        this.updateSearchingNpc(
          npc,
          playerFrameTarget,
          deltaSeconds,
          this.hasReplanPermission(npcIndex)
        );
        continue;
      }

      threatenedIds.add(target.id);
      addNpcEvadeThreat(
        threatSourcesByTargetId,
        target.id,
        Object.freeze({
          sourceId: npc.id,
          sourceAimPosition: toAimPosition(npc.footPosition),
          sightClear: npc.visualTargetSightClear,
          provenance: "direct" as const
        })
      );
      if (state === "brainwash-complete-gun") {
        this.updateGunNpc(
          npc,
          target,
          playerFrameTarget,
          deltaSeconds,
          this.hasReplanPermission(npcIndex)
        );
      } else {
        this.updateNoGunNpc(
          npc,
          target,
          deltaSeconds,
          this.hasReplanPermission(npcIndex),
          capturedTargetIds,
          threatenedIds,
          threatSourcesByTargetId
        );
      }
    }

    for (let npcIndex = 0; npcIndex < this.npcs.length; npcIndex += 1) {
      const npc = this.npcs[npcIndex];
      if (!npc.sprite.isVisible) {
        continue;
      }
      if (
        commandNpcIds.has(npc.id) ||
        npc.command.mode !== "none"
      ) {
        continue;
      }
      const state = npc.stateSnapshot.state;
      if (!isV2AliveState(state)) {
        continue;
      }
      const threatened = threatenedIds.has(npc.id);
      const aliveBehaviorState = threatened ? "evade" : "normal";
      npc.stateSystem.setAliveBehaviorState(aliveBehaviorState);
      if (state !== aliveBehaviorState) {
        npc.stateSnapshot = npc.stateSystem.getSnapshot();
        this.applySpriteVisualState(npc);
      }
      npc.lastState = npc.stateSnapshot.state;
      if (capturedTargetIds.has(npc.id)) {
        this.clearNavigationAgent(npc);
        npc.wanderDestination = null;
        this.clearRestSlot(npc);
        continue;
      }
      if (threatened) {
        const threats = threatSourcesByTargetId.get(npc.id);
        if (!threats || threats.size === 0) {
          throw new Error(`脅威元座標がありません: ${npc.id}`);
        }
        this.updateEvadingNpc(
          npc,
          Object.freeze([...threats.values()]),
          deltaSeconds,
          this.hasReplanPermission(npcIndex)
        );
      } else {
        this.updateSearchingNpc(
          npc,
          playerFrameTarget,
          deltaSeconds,
          this.hasReplanPermission(npcIndex)
        );
      }
    }

    this.finishFrame(threatenedIds, visibleNpcs, frameNpcTargets);
  }

  getFrameView() {
    this.assertActive();
    return this.frameView;
  }

  getCommandCandidates(query: V2NpcCommandQuery) {
    this.assertActive();
    assertTargetSnapshot("NPC指示プレイヤー", query.playerTarget);
    if (query.playerTarget.kind !== "player") {
      throw new Error("NPC指示元はplayerである必要があります。");
    }
    assertFiniteVector("NPC指示camera位置", query.cameraPosition);
    assertFiniteVector("NPC指示camera方向", query.cameraDirection);
    if (query.cameraDirection.lengthSquared() === 0) {
      throw new Error("NPC指示camera方向をゼロベクトルにできません。");
    }
    if (!isPlayerCommandState(query.playerTarget.state)) {
      return Object.freeze([]);
    }

    const cameraDirection = query.cameraDirection.clone().normalize();
    const candidates: V2NpcCommandCandidate[] = [];
    for (const npc of this.npcs) {
      if (
        !npc.sprite.isVisible ||
        !isNpcCommandStateForPlayer(
          npc.stateSnapshot.state,
          query.playerTarget.state
        )
      ) {
        continue;
      }
      const distance = Vector3.Distance(
        query.playerTarget.footPosition,
        npc.footPosition
      );
      if (
        distance >
        NPC_COMMAND_MAXIMUM_DISTANCE + NPC_COMMAND_DISTANCE_EPSILON
      ) {
        continue;
      }
      const aimPosition = toAimPosition(npc.footPosition);
      if (!query.isInCameraFrustum(aimPosition)) {
        continue;
      }
      if (
        this.stage.queries.castSightSegment(
          query.playerTarget.aimPosition,
          aimPosition
        ) !== null
      ) {
        continue;
      }
      const cameraToAim = aimPosition.subtract(query.cameraPosition);
      const aimAngleRadians =
        cameraToAim.lengthSquared() === 0
          ? 0
          : Math.acos(
              Math.max(
                -1,
                Math.min(
                  1,
                  Vector3.Dot(
                    cameraDirection,
                    cameraToAim.normalize()
                  )
                )
              )
            );
      candidates.push(
        Object.freeze({
          npcId: npc.id,
          aimPosition,
          distanceMeters: distance / BLENDER_METERS_TO_WORLD_UNITS,
          aimAngleRadians,
          commandMode: npc.command.mode
        })
      );
    }
    candidates.sort(
      (left, right) =>
        left.aimAngleRadians - right.aimAngleRadians ||
        left.distanceMeters - right.distanceMeters ||
        (left.npcId < right.npcId
          ? -1
          : left.npcId > right.npcId
            ? 1
            : 0)
    );
    return Object.freeze(candidates);
  }

  requestCommand(
    npcId: string,
    kind: V2NpcCommandKind,
    query: V2NpcCommandQuery
  ) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    if (kind !== "follow" && kind !== "leave") {
      throw new Error(`未登録のNPC指示種別です: ${kind}`);
    }
    const candidate = this.getCommandCandidates(query).find(
      (entry) => entry.npcId === npc.id
    );
    if (!candidate) {
      return false;
    }
    if (kind === "follow") {
      this.startFollow(npc, query.playerTarget);
    } else {
      const destination = this.createLeaveDestination(
        npc,
        query.playerTarget
      );
      if (!destination) {
        return false;
      }
      this.startLeave(npc, destination);
    }
    this.synchronizeSpriteVisual(npc);
    this.rebuildFrameViewPreservingThreats();
    return true;
  }

  cancelFollow(npcId: string) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    if (npc.command.mode !== "follow") {
      return false;
    }
    this.clearNpcCommand(npc, true);
    this.synchronizeSpriteVisual(npc);
    this.rebuildFrameViewPreservingThreats();
    return true;
  }

  clearCommands() {
    this.assertActive();
    for (const npc of this.npcs) {
      this.clearNpcCommand(npc, false);
      this.clearAutonomousState(npc);
      this.synchronizeSpriteVisual(npc);
    }
    this.previousPlayerFootPosition = null;
    this.playerHorizontalDirection.setAll(0);
    this.playerElevatorTraversalSource = null;
    this.playerElevatorTraversal = null;
    this.restSlotOccupancyByAreaId.clear();
    this.restSlotOccupancyByNpcId.clear();
    this.playerRestSlotOccupancy.areaId = null;
    this.restSlotOccupancyPrepared = false;
    this.restSlotOccupancyPlayerTarget = null;
    this.grantedReplanNpcIds.clear();
    this.queuedReplanNpcs.length = 0;
    this.rebuildFrameViewPreservingThreats();
  }

  notifyPlayerGunFire(event: V2PlayerGunFireEvent) {
    this.assertActive();
    assertFiniteVector("Follower同期射撃方向", event.direction);
    if (
      event.direction.lengthSquared() === 0 ||
      event.beamRequest.originKind !== "player-gun"
    ) {
      throw new Error(
        "Follower同期射撃には成立済みplayer-gun eventが必要です。"
      );
    }
    let changed = false;
    for (const npc of this.npcs) {
      if (
        npc.command.mode !== "follow" ||
        npc.command.followerFirePhase !== "idle" ||
        !isCompletedCommandState(npc.stateSnapshot.state)
      ) {
        continue;
      }
      npc.command.followerFirePhase = "scheduled";
      npc.command.followerFireRemainingSeconds =
        V2_NPC_FOLLOWER_FIRE_DELAY_MIN_SECONDS +
        this.nextFollowerFireRandom(npc) *
          (V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS -
            V2_NPC_FOLLOWER_FIRE_DELAY_MIN_SECONDS);
      npc.command.followerFireDirection =
        createV2FollowerFireDirection(
          event.direction,
          this.nextFollowerFireRandom(npc),
          this.nextFollowerFireRandom(npc)
        );
      npc.command.followerBeamId = null;
      npc.command.followerBeamRequestQueued = false;
      changed = true;
    }
    if (changed) {
      this.rebuildFrameViewPreservingThreats();
    }
  }

  notifyBeamsSpawned(spawns: readonly V2NpcBeamSpawn[]) {
    this.assertActive();
    let changed = false;
    for (const spawn of spawns) {
      if (spawn.beamId.length === 0) {
        throw new Error("Follower beam IDを空にできません。");
      }
      const npc = this.requireNpc(spawn.sourceId);
      if (
        npc.command.followerFirePhase !== "scheduled" ||
        !npc.command.followerBeamRequestQueued
      ) {
        continue;
      }
      npc.command.followerFirePhase = "active";
      npc.command.followerFireRemainingSeconds = 0;
      npc.command.followerFireDirection = null;
      npc.command.followerBeamId = spawn.beamId;
      npc.command.followerBeamRequestQueued = false;
      changed = true;
    }
    if (changed) {
      this.rebuildFrameViewPreservingThreats();
    }
  }

  notifyBeamCompletions(
    completions: readonly V2BeamCompletionEvent[]
  ) {
    this.assertActive();
    let changed = false;
    for (const completion of completions) {
      const npc = this.npcsById.get(completion.sourceId);
      if (
        !npc ||
        npc.command.followerFirePhase !== "active" ||
        npc.command.followerBeamId !== completion.beamId
      ) {
        continue;
      }
      if (npc.command.mode === "follow") {
        npc.command.followerFirePhase = "cooldown";
        npc.command.followerFireRemainingSeconds =
          V2_NPC_FOLLOWER_FIRE_COOLDOWN_SECONDS +
          completion.frameElapsedSeconds;
      } else {
        this.clearFollowerFireState(npc);
      }
      npc.command.followerBeamId = null;
      changed = true;
    }
    if (changed) {
      this.rebuildFrameViewPreservingThreats();
    }
  }

  notifyPlayerImpactAccepted() {
    this.assertActive();
    let changed = false;
    for (const npc of this.npcs) {
      if (
        npc.command.mode !== "follow" ||
        !isV2AliveState(npc.stateSnapshot.state)
      ) {
        continue;
      }
      this.clearNpcCommand(npc, true);
      this.synchronizeSpriteVisual(npc);
      changed = true;
    }
    if (changed) {
      this.rebuildFrameViewPreservingThreats();
    }
  }

  applyBeamImpacts(impacts: readonly V2NpcBeamImpact[]) {
    this.assertActive();
    const resolvedImpacts = impacts.map((impact) =>
      Object.freeze({
        npc: this.requireNpc(impact.npcId),
        source: impact.source
      })
    );
    const results: V2NpcStateChangeResult[] = [];
    let changed = false;
    for (const impact of resolvedImpacts) {
      const accepted = impact.npc.stateSystem.applyImpact(impact.source);
      results.push(
        Object.freeze({
          npcId: impact.npc.id,
          accepted
        })
      );
      if (!accepted) {
        continue;
      }
      changed = true;
      this.finishScriptedStateChange(impact.npc);
    }
    if (changed) {
      this.rebuildFrameViewPreservingThreats();
    }
    return Object.freeze(results);
  }

  prepareExecutionRoles(
    assignments: readonly V2NpcExecutionRoleAssignment[]
  ) {
    this.assertActive();
    const resolvedAssignments = assignments.map((assignment) => {
      if (!V2_NPC_EXECUTION_ROLES.includes(assignment.role)) {
        throw new Error(
          `未登録のNPC公開処刑役割です: ${assignment.role}`
        );
      }
      return Object.freeze({
        npc: this.requireNpc(assignment.npcId),
        role: assignment.role
      });
    });
    for (const assignment of resolvedAssignments) {
      if (
        assignment.role !== "target" &&
        isV2AliveState(assignment.npc.stateSnapshot.state)
      ) {
        const nextState =
          assignment.role === "shooter"
            ? "brainwash-complete-gun"
            : "brainwash-complete-haigure-formation";
        throw new Error(
          `alive対象を公開処刑用状態へ強制遷移できません: ` +
            `${assignment.npc.stateSnapshot.state} -> ${nextState}`
        );
      }
    }
    for (const assignment of resolvedAssignments) {
      if (assignment.role === "target") {
        assignment.npc.stateSystem.prepareExecutionTarget();
      } else if (assignment.role === "audience") {
        assignment.npc.stateSystem.prepareExecutionAudience();
      } else {
        assignment.npc.stateSystem.prepareExecutionShooter();
      }
      this.finishScriptedStateChange(assignment.npc);
    }
    if (resolvedAssignments.length > 0) {
      this.rebuildFrameViewPreservingThreats();
    }
  }

  enterFormationStates(npcIds: readonly string[]) {
    this.assertActive();
    const npcs = npcIds.map((npcId) => this.requireNpc(npcId));
    const results: V2NpcStateChangeResult[] = [];
    let changed = false;
    for (const npc of npcs) {
      const accepted = npc.stateSystem.enterFormationState();
      results.push(Object.freeze({ npcId: npc.id, accepted }));
      if (!accepted) {
        continue;
      }
      changed = true;
      this.finishScriptedStateChange(npc);
    }
    if (changed) {
      this.rebuildFrameViewPreservingThreats();
    }
    return Object.freeze(results);
  }

  drainBeamRequests() {
    this.assertActive();
    const requests = Object.freeze(
      this.pendingBeamRequests.map((request) =>
        Object.freeze({
          ...request,
          targetPolicy: request.targetPolicy,
          origin: request.origin.clone(),
          direction: request.direction.clone()
        })
      )
    );
    this.pendingBeamRequests.length = 0;
    return requests;
  }

  drainAlertRequests() {
    this.assertActive();
    const requests = Object.freeze(
      this.pendingAlertRequests.map((request) => Object.freeze({ ...request }))
    );
    this.pendingAlertRequests.length = 0;
    return requests;
  }

  drainTraversalRequests() {
    this.assertActive();
    const requests = Object.freeze(
      this.pendingTraversalRequests.map((request) => {
        if (!("entryLocation" in request)) {
          return Object.freeze({ ...request });
        }
        return Object.freeze({
          ...request,
          entryLocation: cloneNavigationLocation(request.entryLocation),
          exitLocation: cloneNavigationLocation(request.exitLocation)
        });
      })
    );
    this.pendingTraversalRequests.length = 0;
    return requests;
  }

  applyTraversalResults(results: readonly V2NpcTraversalResult[]) {
    this.assertActive();
    const notifications: V2NpcTraversalNotification[] = [];
    let frameViewChanged = false;
    for (const result of results) {
      const npc = this.requireNpc(result.npcId);
      if (result.kind === "door-opened") {
        this.requireDoorTraversalState(
          npc,
          "waiting-door-open",
          result.doorId
        );
        npc.traversalState = Object.freeze({
          kind: "passing-door",
          doorId: result.doorId
        });
        frameViewChanged = true;
        continue;
      }
      if (result.kind === "door-pass-detected") {
        this.requireDoorTraversalState(npc, "passing-door", result.doorId);
        this.pendingTraversalRequests.push(
          Object.freeze({
            kind: "door-pass-complete",
            npcId: npc.id,
            doorId: result.doorId
          })
        );
        npc.traversalState = createWalkingV2NpcTraversalState();
        frameViewChanged = true;
        continue;
      }

      this.requireElevatorTraversalIdentity(npc, result);
      if (result.kind === "elevator-call-accepted") {
        this.requireElevatorTraversalKind(
          npc,
          "waiting-elevator-call-input"
        );
        const elevatorRoute = this.createNpcElevatorTraversalRoute(npc);
        this.resetNavigationAgentForTraversalChange(npc);
        npc.selectedRouteKind = "link";
        npc.selectedElevatorTransition =
          cloneNavigationTransition(
            npc.pendingNavigationTransition!
          );
        npc.traversalState = Object.freeze({
          kind: "moving-to-elevator-wait",
          ...elevatorRoute
        });
        frameViewChanged = true;
        continue;
      }
      if (result.kind === "elevator-ready-for-boarding") {
        this.requireElevatorTraversalKind(
          npc,
          "waiting-elevator-call"
        );
        const elevatorRoute = this.createNpcElevatorTraversalRoute(npc);
        this.resetNavigationAgentForTraversalChange(npc);
        npc.traversalState = Object.freeze({
          kind: "approaching-elevator-board",
          ...elevatorRoute
        });
        frameViewChanged = true;
        continue;
      }
      if (result.kind === "elevator-boarded") {
        this.requireElevatorTraversalKind(
          npc,
          "waiting-elevator-board"
        );
        const elevatorRoute = this.createNpcElevatorTraversalRoute(npc);
        this.deferNavigationReplan(npc);
        npc.traversalState = Object.freeze({
          kind: "riding-elevator",
          ...elevatorRoute
        });
        npc.reservationResultRevision += 1;
        frameViewChanged = true;
        continue;
      }
      if (result.kind === "elevator-safety-evicted") {
        this.requireElevatorTraversalKind(
          npc,
          "riding-elevator"
        );
        assertFiniteVector(
          "NPC安全退避位置",
          result.location.position
        );
        this.resetNavigationAgentForTraversalChange(npc);
        npc.selectedRouteKind = null;
        npc.selectedElevatorTransition = null;
        npc.pendingNavigationTransition = null;
        npc.navigationLocation = cloneNavigationLocation(
          result.location
        );
        npc.footPosition = this.resolveFootPosition(
          result.location.position
        );
        this.relocateNavigationAreaCursor(npc);
        this.synchronizeSpritePosition(npc);
        npc.traversalState = createWalkingV2NpcTraversalState();
        npc.reservationResultRevision += 1;
        frameViewChanged = true;
        continue;
      }
      if (result.kind === "elevator-boarding-rejected") {
        if (
          npc.traversalState.kind !==
            "waiting-elevator-call" &&
          npc.traversalState.kind !==
            "approaching-elevator-board" &&
          npc.traversalState.kind !==
            "waiting-elevator-board"
        ) {
          throw new Error(
            `NPC乗車拒否前のtraversal状態が不正です: ${npc.id}/${npc.traversalState.kind}`
          );
        }
        this.resetNavigationAgentForTraversalChange(npc);
        npc.selectedRouteKind = null;
        npc.selectedElevatorTransition = null;
        npc.pendingNavigationTransition = null;
        npc.traversalState = createWalkingV2NpcTraversalState();
        npc.reservationResultRevision += 1;
        frameViewChanged = true;
        continue;
      }
      if (result.kind === "elevator-arrived") {
        this.requireElevatorTraversalKind(npc, "riding-elevator");
        const elevatorRoute = this.createNpcElevatorTraversalRoute(npc);
        this.deferNavigationReplan(npc);
        npc.traversalState = Object.freeze({
          kind: "leaving-elevator",
          ...elevatorRoute
        });
        frameViewChanged = true;
        continue;
      }

      this.requireElevatorTraversalKind(
        npc,
        "leaving-elevator"
      );
      const pendingTransition = npc.pendingNavigationTransition;
      if (!pendingTransition) {
        throw new Error(
          `NPCの降車完了対象transitionがありません: ${npc.id}`
        );
      }
      assertFiniteVector("NPC降車位置", result.location.position);
      npc.navigationAgent.completeTransition(result.location);
      npc.navigationLocation = cloneNavigationLocation(result.location);
      npc.footPosition = this.resolveFootPosition(result.location.position);
      this.relocateNavigationAreaCursor(npc);
      npc.pendingNavigationTransition = null;
      npc.traversalState = createWalkingV2NpcTraversalState();
      frameViewChanged = true;
    }
    if (frameViewChanged) {
      this.rebuildFrameViewPreservingThreats();
    }
    return Object.freeze(notifications);
  }

  getTraversalState(npcId: string) {
    this.assertActive();
    return cloneV2NpcTraversalState(
      this.requireNpc(npcId).traversalState
    );
  }

  getNpcPosition(npcId: string) {
    this.assertActive();
    return this.requireNpc(npcId).footPosition.clone();
  }

  setNpcTransportPosition(npcId: string, position: Vector3) {
    this.assertActive();
    assertFiniteVector("NPC搬送位置", position);
    const npc = this.requireNpc(npcId);
    npc.footPosition = position.clone();
    this.synchronizeSpritePosition(npc);
    this.rebuildFrameViewPreservingThreats();
  }

  releaseTraversalForScriptedPhase() {
    this.assertActive();
    this.pendingTraversalRequests.length = 0;
    for (const npc of this.npcs) {
      this.resetNavigationAgentForTraversalChange(npc);
      npc.selectedRouteKind = null;
      npc.selectedElevatorTransition = null;
      npc.pendingNavigationTransition = null;
      npc.traversalState = createWalkingV2NpcTraversalState();
    }
    this.rebuildFrameViewPreservingThreats();
  }

  private applyAlarmTargetEvents(events: readonly V2AlarmTriggerEvent[]) {
    if (events.length === 0) {
      return;
    }
    for (const event of events) {
      assertAlarmTargetEvent(event);
    }
    const influenceRadiusSquared =
      V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS *
      V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS;
    for (const npc of this.npcs) {
      const state = npc.stateSnapshot.state;
      if (
        !npc.sprite.isVisible ||
        npc.command.mode !== "none" ||
        (state !== "brainwash-complete-gun" &&
          state !== "brainwash-complete-no-gun")
      ) {
        continue;
      }
      let receivedAlarm = false;
      for (const event of events) {
        if (npc.id === event.targetId) {
          continue;
        }
        const offsetX = npc.footPosition.x - event.position.x;
        const offsetZ = npc.footPosition.z - event.position.z;
        if (
          offsetX * offsetX + offsetZ * offsetZ >
          influenceRadiusSquared
        ) {
          continue;
        }
        receivedAlarm = true;
        const queued = npc.alarmTargetQueue.find(
          (entry) => entry.targetId === event.targetId
        );
        if (!queued) {
          npc.alarmTargetQueue.push({
            candidateId: event.candidateId,
            targetId: event.targetId
          });
        }
      }
      if (!receivedAlarm) {
        continue;
      }
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      npc.capture = null;
      this.clearNavigationAgent(npc);
      this.clearTarget(npc);
      npc.visualSightCheckPriority = true;
    }
  }

  setExternalThreats(threats: readonly V2NpcExternalThreat[]) {
    this.assertActive();
    for (const threat of threats) {
      if (threat.sourceId.length === 0) {
        throw new Error("外部脅威の発生元IDを空にできません。");
      }
      if (threat.targetId.length === 0) {
        throw new Error("外部脅威の対象IDを空にできません。");
      }
      assertFiniteVector("外部脅威の発生元", threat.sourcePosition);
      if (typeof threat.sightClear !== "boolean") {
        throw new Error(
          "外部脅威の視線状態にはbooleanが必要です。"
        );
      }
    }
    this.externalThreats = Object.freeze(
      threats.map((threat) =>
        Object.freeze({
          sourceId: threat.sourceId,
          targetId: threat.targetId,
          sourcePosition: threat.sourcePosition.clone(),
          sightClear: threat.sightClear
        })
      )
    );
  }

  setAutonomousThreatActors(actors: readonly V2ActorSphere[]) {
    this.assertActive();
    for (const actor of actors) {
      if (actor.id.length === 0 || actor.kind !== "bit") {
        throw new Error(
          `自律視認脅威には非空IDのBITが必要です: ${actor.id}/${actor.kind}`
        );
      }
      assertFiniteVector("自律視認BIT中心", actor.center);
      assertPositiveFiniteNumber("自律視認BIT半径", actor.radius);
    }
    this.autonomousThreatActors = actors;
    if (actors.length === 0) {
      this.autonomousThreatActorSpatialIndex.rebuild(actors);
      this.autonomousThreatActorQueryScratch.length = 0;
    }
  }

  setPlayerElevatorTraversalSnapshot(
    snapshot: V2PlayerElevatorTraversalSnapshot | null
  ) {
    this.assertActive();
    if (snapshot === this.playerElevatorTraversalSource) {
      return;
    }
    this.playerElevatorTraversalSource = snapshot;
    if (snapshot === null) {
      this.playerElevatorTraversal = null;
      return;
    }
    if (
      snapshot.elevatorId.length === 0 ||
      snapshot.linkId.length === 0
    ) {
      throw new Error(
        "プレイヤーのエレベーター追跡snapshotには非空IDが必要です。"
      );
    }
    assertFiniteVector(
      "プレイヤーのエレベーター目的階位置",
      snapshot.destinationFloorPosition
    );
    this.playerElevatorTraversal =
      clonePlayerElevatorTraversalSnapshot(snapshot);
  }

  setPlayerBlockedTargetIds(targetIds: readonly string[]) {
    this.assertActive();
    const uniqueTargetIds = new Set<string>();
    for (const targetId of targetIds) {
      if (uniqueTargetIds.has(targetId)) {
        throw new Error(
          `プレイヤー停止対象NPC IDが重複しています: ${targetId}`
        );
      }
      this.requireNpc(targetId);
      uniqueTargetIds.add(targetId);
    }
    this.playerBlockedTargetIds = Object.freeze([...targetIds]);
  }

  setVisibleNpcIds(npcIds: readonly string[]) {
    this.assertActive();
    const visibleNpcIds = new Set<string>();
    for (const npcId of npcIds) {
      if (visibleNpcIds.has(npcId)) {
        throw new Error(`表示NPC IDが重複しています: ${npcId}`);
      }
      this.requireNpc(npcId);
      visibleNpcIds.add(npcId);
    }

    for (const npc of this.npcs) {
      const visible = visibleNpcIds.has(npc.id);
      npc.sprite.isVisible = visible;
      if (!visible) {
        this.clearNpcCommand(npc, false);
        this.clearAutonomousState(npc);
      }
      this.synchronizeSpriteVisual(npc);
    }
    for (const npc of this.npcs) {
      const capture = npc.capture;
      const capturedNpcId =
        capture && this.npcsById.has(capture.targetId)
          ? capture.targetId
          : null;
      if (
        capture &&
        capturedNpcId &&
        !visibleNpcIds.has(capturedNpcId)
      ) {
        this.releaseCaptureImmediately(npc);
      }
    }
    const threatenedTargetIds = Object.freeze(
      this.frameView.threatenedTargetIds.filter(
        (targetId) =>
          !this.npcsById.has(targetId) || visibleNpcIds.has(targetId)
      )
    );
    this.frameView = this.buildFrameView(threatenedTargetIds);
  }

  setAiSuspended(suspended: boolean) {
    this.assertActive();
    if (this.aiSuspended === suspended) {
      return;
    }
    this.aiSuspended = suspended;
    for (const npc of this.npcs) {
      if (suspended) {
        this.clearNpcCommand(npc, false);
        this.clearAutonomousState(npc);
        npc.visual.syncPresentation();
      }
      this.clearNavigationAgent(npc);
    }
    if (suspended) {
      this.previousPlayerFootPosition = null;
      this.playerHorizontalDirection.setAll(0);
      this.rebuildFrameViewPreservingThreats();
    }
  }

  placeNpcs(assignments: readonly V2NpcPlacementAssignment[]) {
    this.assertActive();
    if (assignments.length !== this.npcs.length) {
      throw new Error(
        `NPC配置指定数が一致しません: expected=${this.npcs.length}, actual=${assignments.length}`
      );
    }

    const assignmentIds = new Set<string>();
    const resolvedPlacements: ResolvedPlacement[] = [];
    for (const assignment of assignments) {
      if (assignment.id.length === 0) {
        throw new Error("NPC配置IDを空にできません。");
      }
      if (assignmentIds.has(assignment.id)) {
        throw new Error(`NPC配置IDが重複しています: ${assignment.id}`);
      }
      assignmentIds.add(assignment.id);
      assertFiniteVector(
        `NPC配置${assignment.id}の足元`,
        assignment.footPosition
      );
      const npc = this.requireNpc(assignment.id);
      if (
        assignment.formation &&
        !isV2BrainwashState(npc.stateSnapshot.state)
      ) {
        throw new Error(
          `aliveまたはhit NPCを集合状態へ配置できません: ${assignment.id}`
        );
      }
      const projected = this.stage.navigation.projectPoint(
        assignment.footPosition,
        PLACEMENT_PROJECTION_MAX_DISTANCE
      );
      if (
        !projected ||
        Vector3.Distance(projected.position, assignment.footPosition) >
          PLACEMENT_PROJECTION_MAX_DISTANCE
      ) {
        throw new Error(
          `NPC配置をNavMeshへ0.1以内で投影できません: ${assignment.id}`
        );
      }
      resolvedPlacements.push(
        Object.freeze({
          npc,
          navigationLocation: cloneNavigationLocation(projected),
          footPosition: this.resolveFootPosition(projected.position),
          formation: assignment.formation
        })
      );
    }

    for (const placement of resolvedPlacements) {
      const npc = placement.npc;
      this.clearNpcCommand(npc, false);
      this.resetNavigationAgentForTraversalChange(npc);
      npc.selectedRouteKind = null;
      npc.selectedElevatorTransition = null;
      npc.navigationLocation = placement.navigationLocation;
      npc.pendingNavigationTransition = null;
      npc.traversalState = createWalkingV2NpcTraversalState();
      this.removePendingTraversalRequestsForNpc(npc.id);
      npc.footPosition = placement.footPosition;
      this.relocateNavigationAreaCursor(npc);
      npc.wanderDestination = null;
      npc.wanderWaitSeconds = this.nextWanderWait();
      this.clearRestSlot(npc);
      npc.alarmTargetQueue.length = 0;
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      this.removePendingRequestsForNpc(npc.id);
      this.clearTarget(npc);
      if (placement.formation) {
        npc.stateSystem.enterFormationState();
        npc.stateSnapshot = npc.stateSystem.getSnapshot();
      }
      this.assignTargetSelectionPersonality(
        npc,
        npc.stateSnapshot.state
      );
      npc.visualSightCheckPriority = true;
      npc.lastState = npc.stateSnapshot.state;
      this.applySpriteVisualState(npc);
      this.synchronizeSpritePosition(npc);
    }
    this.frameView = this.buildFrameView(Object.freeze([]));
  }

  dispose() {
    this.assertActive();
    this.pendingAlertRequests.length = 0;
    this.pendingBeamRequests.length = 0;
    this.pendingTraversalRequests.length = 0;
    for (const npc of this.npcs) {
      this.clearNpcCommand(npc, false);
      this.clearAutonomousState(npc);
      npc.navigationAgent.clear();
      npc.selectedRouteKind = null;
      npc.selectedElevatorTransition = null;
      npc.pendingNavigationTransition = null;
      npc.traversalState = createWalkingV2NpcTraversalState();
      npc.visual.dispose();
    }
    this.npcs.length = 0;
    this.npcsById.clear();
    this.frameView = EMPTY_V2_NPC_FRAME_VIEW;
    this.externalThreats = Object.freeze([]);
    this.autonomousThreatActors = Object.freeze([]);
    this.autonomousThreatActorSpatialIndex.rebuild(Object.freeze([]));
    this.autonomousThreatActorQueryScratch.length = 0;
    this.restSlotOccupancyByAreaId.clear();
    this.restSlotOccupancyByNpcId.clear();
    this.restSlotOccupancyPrepared = false;
    this.restSlotOccupancyPlayerTarget = null;
    this.playerElevatorTraversalSource = null;
    this.playerElevatorTraversal = null;
    this.playerBlockedTargetIds = Object.freeze([]);
    this.grantedReplanNpcIds.clear();
    this.queuedReplanNpcs.length = 0;
    this.previousPlayerFootPosition = null;
    this.playerHorizontalDirection.setAll(0);
    this.traversalElapsedSeconds = 0;
    this.disposed = true;
  }

  private prepareReplanPermissions(): void {
    this.grantedReplanNpcIds.clear();
    this.queuedReplanNpcs.length = 0;
    for (const npc of this.npcs) {
      if (
        npc.navigationReplanRequestedAtSeconds !== null &&
        this.canExecuteNavigationReplan(npc)
      ) {
        this.queuedReplanNpcs.push(npc);
        if (this.diagnosticsEnabled) {
          this.replanMaximumWaitSeconds = Math.max(
            this.replanMaximumWaitSeconds,
            this.traversalElapsedSeconds -
              npc.navigationReplanRequestedAtSeconds
          );
        }
      }
    }
    if (this.queuedReplanNpcs.length === 0) {
      return;
    }
    this.queuedReplanNpcs.sort((left, right) =>
      left.navigationReplanPriority - right.navigationReplanPriority ||
      left.navigationReplanRequestedAtSeconds! -
        right.navigationReplanRequestedAtSeconds! ||
      left.id.localeCompare(right.id)
    );
    const grantedCount = Math.min(
      V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE,
      this.queuedReplanNpcs.length
    );
    for (let index = 0; index < grantedCount; index += 1) {
      const npc = this.queuedReplanNpcs[index];
      this.grantedReplanNpcIds.add(npc.id);
    }
  }

  private hasReplanPermission(npcIndex: number): boolean {
    return this.grantedReplanNpcIds.has(this.npcs[npcIndex].id);
  }

  private createNavigationRouteContext(
    npc: NpcRuntime
  ): V2NpcNavigationRouteContext {
    return Object.freeze({
      npcId: npc.id,
      behavior: npc.navigationBehavior,
      speed: npc.navigationSpeed,
      characterState: npc.stateSnapshot.state,
      brainwashed: isV2BrainwashState(npc.stateSnapshot.state),
      commandMode: npc.command.mode,
      targetId:
        npc.navigationBehavior === "follow"
          ? "player"
          : npc.navigationBehavior === "evade"
          ? npc.evadeThreatId
          : npc.targetId,
      playerElevatorTraversal:
        npc.navigationBehavior === "follow"
          ? this.playerElevatorTraversal
          : null,
      targetProvenance: npc.targetProvenance,
      targetSelectionPersonality: npc.targetSelectionPersonality,
      targetSightClear:
        npc.navigationBehavior === "evade"
          ? npc.evadeThreatSightClear
          : npc.visualTargetSightClear,
      currentRouteKind: npc.selectedRouteKind,
      currentRouteLinkId:
        npc.selectedElevatorTransition?.link.id ?? null,
      traversalState: cloneV2NpcTraversalState(npc.traversalState),
      location: cloneNavigationLocation(npc.navigationLocation),
      stuckRevision: npc.navigationAgent.stuckRevision,
      reservationResultRevision: npc.reservationResultRevision
    });
  }

  private synchronizeApproachingElevatorRouteSelection(
    npc: NpcRuntime,
    selectedTransition: NavigationTransitionStep | null
  ) {
    const state = npc.traversalState;
    if (state.kind !== "approaching-elevator-board") {
      return;
    }
    if (
      selectedTransition?.link.id === state.linkId &&
      selectedTransition.from === state.from &&
      selectedTransition.to === state.to
    ) {
      return;
    }
    const route = this.createNpcElevatorTraversalRoute(npc);
    this.pendingTraversalRequests.push(
      Object.freeze({
        kind: "elevator-reservation-cancel",
        npcId: npc.id,
        ...route
      })
    );
    npc.pendingNavigationTransition = null;
    npc.traversalState = createWalkingV2NpcTraversalState();
  }

  private createNpcElevatorTraversalRoute(
    npc: NpcRuntime
  ): V2NpcElevatorTraversalRoute {
    const transition = npc.pendingNavigationTransition;
    if (!transition || transition.link.kind !== "elevator") {
      throw new Error(
        `NPCのエレベーターtransitionがありません: ${npc.id}`
      );
    }
    return Object.freeze({
      linkId: transition.link.id,
      from: transition.from,
      to: transition.to,
      entryLocation: cloneNavigationLocation(transition.entry),
      exitLocation: cloneNavigationLocation(transition.exit)
    });
  }

  private requireNpcElevatorStopTraversal(
    linkId: string,
    from: "A" | "B"
  ) {
    const stop = this.elevatorStopByLinkEndpoint.get(
      toElevatorEndpointKey(linkId, from)
    );
    if (!stop) {
      throw new Error(
        `NPC用エレベーター停止階がありません: ${linkId}/${from}`
      );
    }
    return stop;
  }

  private collectNpcElevatorEvadeDestinations(npc: NpcRuntime) {
    const candidates: Array<
      Readonly<{
        stop: NpcElevatorStopTraversal;
        verticalDistance: number;
        distanceSquared: number;
      }>
    > = [];
    const maximumDistanceSquared =
      NPC_EVADE_ELEVATOR_DISTANCE *
      NPC_EVADE_ELEVATOR_DISTANCE;
    for (const stop of this.elevatorStopByLinkEndpoint.values()) {
      const offsetX = npc.footPosition.x - stop.callMatCenter.x;
      const offsetZ = npc.footPosition.z - stop.callMatCenter.z;
      const distanceSquared =
        offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared > maximumDistanceSquared) {
        continue;
      }
      const verticalDistance = Math.abs(
        npc.navigationLocation.position.y -
          stop.waitLocation.position.y
      );
      candidates.push(
        Object.freeze({
          stop,
          verticalDistance,
          distanceSquared
        })
      );
    }
    const minimumVerticalDistance = Math.min(
      ...candidates.map((candidate) => candidate.verticalDistance)
    );
    return Object.freeze(
      candidates
        .filter(
          (candidate) =>
            candidate.verticalDistance === minimumVerticalDistance
        )
        .sort(
          (left, right) =>
            left.distanceSquared - right.distanceSquared ||
            left.stop.stopId.localeCompare(right.stop.stopId)
        )
        .map((candidate) =>
          cloneNavigationLocation(candidate.stop.oppositeLocation)
        )
    );
  }

  private beginNpcElevatorCall(
    npc: NpcRuntime,
    transition: NavigationTransitionStep
  ) {
    npc.pendingNavigationTransition =
      cloneNavigationTransition(transition);
    const elevatorRoute = this.createNpcElevatorTraversalRoute(npc);
    npc.traversalState = Object.freeze({
      kind: "waiting-elevator-call-input",
      ...elevatorRoute
    });
    this.pendingTraversalRequests.push(
      Object.freeze({
        kind: "elevator-call",
        npcId: npc.id,
        ...elevatorRoute,
        requestedAtSeconds: this.traversalElapsedSeconds
      })
    );
  }

  private reconsiderWaitingElevatorCall(npc: NpcRuntime) {
    const state = npc.traversalState;
    if (
      state.kind !== "waiting-elevator-call-input" &&
      state.kind !== "waiting-elevator-call"
    ) {
      throw new Error(
        `呼出待機再評価対象NPCの状態が不正です: ${npc.id}/${state.kind}`
      );
    }
    const route = this.createNpcElevatorTraversalRoute(npc);
    const intendedTargetPosition =
      npc.navigationPendingTargetPosition ??
      npc.navigationTargetPosition;
    const projectedTarget = this.stage.navigation.projectPoint(
      intendedTargetPosition,
      NAVIGATION_PROJECTION_MAX_DISTANCE
    );
    const selectedPath = projectedTarget
      ? this.stage.navigation.findPath(
          npc.navigationLocation,
          projectedTarget,
          "npc",
          npc.navigationRoutePolicy
        )
      : null;
    const selectedTransition = selectedPath?.steps.find(
      (
        step
      ): step is NavigationTransitionStep =>
        step.kind === "transition" &&
        step.link.kind === "elevator"
    );
    if (
      selectedTransition?.link.id === state.linkId &&
      selectedTransition.from === state.from &&
      selectedTransition.to === state.to
    ) {
      this.acceptPendingNavigationTarget(npc);
      return;
    }
    this.pendingTraversalRequests.push(
      Object.freeze({
        kind: "elevator-call-cancel",
        npcId: npc.id,
        ...route
      })
    );
    this.acceptPendingNavigationTarget(npc);
    this.resetNavigationAgentForTraversalChange(npc);
    npc.selectedRouteKind = null;
    npc.selectedElevatorTransition = null;
    npc.pendingNavigationTransition = null;
    npc.traversalState = createWalkingV2NpcTraversalState();
    this.setNavigationIntent(
      npc,
      npc.navigationBehavior,
      npc.navigationSpeed,
      intendedTargetPosition
    );
  }

  private setNavigationIntent(
    npc: NpcRuntime,
    behavior: V2NpcNavigationBehavior,
    speed: number,
    targetPosition: Vector3
  ) {
    const behaviorChanged = npc.navigationBehavior !== behavior;
    npc.navigationBehavior = behavior;
    npc.navigationSpeed = speed;
    if (!this.canExecuteNavigationReplan(npc)) {
      this.deferNavigationReplan(npc);
      return;
    }
    const pendingTarget = npc.navigationPendingTargetPosition;
    const acceptedTarget = npc.navigationTargetPosition;
    const targetMovedEnough =
      Vector3.Distance(acceptedTarget, targetPosition) >=
      NPC_DETAIL_TARGET_MOVEMENT_THRESHOLD;
    if (behaviorChanged || npc.navigationAgentCleared || targetMovedEnough) {
      const priority: NpcNavigationReplanPriority =
        behavior === "evade"
          ? npc.evadeNavigationReplanPriority
          : behavior === "follow" || behavior === "leave"
            ? 0
          : behavior === "pursue"
            ? npc.pursuitPhase === "detail"
              ? 1
              : npc.pursuitPhase === "area"
                ? 2
                : 3
            : 4;
      if (pendingTarget) {
        if (!pendingTarget.equals(targetPosition)) {
          pendingTarget.copyFrom(targetPosition);
          if (this.diagnosticsEnabled) {
            this.replanCoalescedCount += 1;
          }
        }
        npc.navigationReplanPriority = Math.min(
          npc.navigationReplanPriority,
          priority
        ) as NpcNavigationReplanPriority;
      } else {
        npc.navigationPendingTargetPosition = targetPosition.clone();
        npc.navigationGoalRevision += 1;
        npc.navigationReplanPriority = priority;
        npc.navigationReplanRequestedAtSeconds =
          this.traversalElapsedSeconds;
      }
      npc.navigationAgentCleared = false;
      this.synchronizeRestSlotOccupancyForNpc(npc);
    } else if (pendingTarget && !pendingTarget.equals(targetPosition)) {
      pendingTarget.copyFrom(targetPosition);
      if (this.diagnosticsEnabled) {
        this.replanCoalescedCount += 1;
      }
    }
  }

  private updateNavigation(
    npc: NpcRuntime,
    behavior: V2NpcNavigationBehavior,
    targetPosition: Vector3,
    speed: number,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ): NavigationAgentStepResult {
    this.setNavigationIntent(
      npc,
      behavior,
      speed,
      targetPosition
    );
    if (
      (npc.traversalState.kind ===
        "waiting-elevator-call-input" ||
        npc.traversalState.kind ===
          "waiting-elevator-call") &&
      allowPathRecalculation
    ) {
      this.reconsiderWaitingElevatorCall(npc);
    }
    if (npc.traversalState.kind === "leaving-elevator") {
      this.updateNpcElevatorDisembarkMovement(
        npc,
        speed,
        deltaSeconds
      );
      return this.createTraversalWaitingStep(npc);
    }
    if (!isV2NpcTraversalWalkingEnabled(npc.traversalState)) {
      return this.createTraversalWaitingStep(npc);
    }
    const intendedTargetPosition =
      npc.navigationPendingTargetPosition ??
      npc.navigationTargetPosition;
    const resolvedTargetPosition =
      npc.traversalState.kind === "moving-to-elevator-call-mat" ||
      npc.traversalState.kind === "moving-to-elevator-wait"
        ? this.requireNpcElevatorStopTraversal(
            npc.traversalState.linkId,
            npc.traversalState.from
          ).waitLocation.position
        : intendedTargetPosition;
    const movement = npc.navigationAgent.update(
      npc.navigationLocation,
      resolvedTargetPosition,
      npc.navigationGoalRevision,
      speed,
      deltaSeconds,
      allowPathRecalculation
    );
    npc.navigationRemainingPathDistance =
      movement.remainingPathDistance;
    if (movement.pathRecalculated) {
      if (npc.navigationPendingTargetPosition) {
        npc.navigationTargetPosition.copyFrom(
          npc.navigationPendingTargetPosition
        );
        npc.navigationPendingTargetPosition = null;
      }
      npc.navigationReplanRequestedAtSeconds = null;
    }
    if (
      npc.navigationAgent.stuckRevision !==
      npc.navigationLastStuckRevision
    ) {
      npc.navigationLastStuckRevision =
        npc.navigationAgent.stuckRevision;
      this.requestNavigationReplan(npc, 0);
    }
    if (
      npc.traversalState.kind === "moving-to-elevator-call-mat" ||
      npc.traversalState.kind === "moving-to-elevator-wait"
    ) {
      const approachingCallMat =
        npc.traversalState.kind ===
        "moving-to-elevator-call-mat";
      if (
        movement.state === "unreachable" ||
        movement.state === "transition-required"
      ) {
        throw new Error(
          `NPCがエレベーター待機点へ到達できません: ${npc.id}/${npc.traversalState.linkId}`
        );
      }
      if (movement.state === "arrived") {
        if (!this.applyNavigationMovement(npc, movement.location)) {
          return Object.freeze({
            ...this.createTraversalWaitingStep(npc),
            pathRecalculated: movement.pathRecalculated,
            pathDistance: movement.pathDistance,
            remainingPathDistance: movement.remainingPathDistance
          });
        }
        if (approachingCallMat) {
          this.beginNpcElevatorCall(
            npc,
            npc.pendingNavigationTransition!
          );
          return Object.freeze({
            ...this.createTraversalWaitingStep(npc),
            pathRecalculated: movement.pathRecalculated,
            pathDistance: movement.pathDistance,
            remainingPathDistance: movement.remainingPathDistance
          });
        }
        const elevatorRoute = this.createNpcElevatorTraversalRoute(npc);
        this.resetNavigationAgentForTraversalChange(npc);
        npc.selectedRouteKind = "link";
        npc.selectedElevatorTransition =
          cloneNavigationTransition(
            npc.pendingNavigationTransition!
          );
        npc.traversalState = Object.freeze({
          kind: "waiting-elevator-call",
          ...elevatorRoute
        });
        return Object.freeze({
          ...this.createTraversalWaitingStep(npc),
          pathRecalculated: movement.pathRecalculated,
          pathDistance: movement.pathDistance,
          remainingPathDistance: movement.remainingPathDistance
        });
      }
      return movement;
    }
    if (
      movement.state !== "transition-required" ||
      movement.transition?.link.kind !== "elevator"
    ) {
      return movement;
    }
    if (!this.applyNavigationMovement(npc, movement.location)) {
      return Object.freeze({
        ...this.createTraversalWaitingStep(npc),
        pathRecalculated: movement.pathRecalculated,
        pathDistance: movement.pathDistance,
        remainingPathDistance: movement.remainingPathDistance
      });
    }
    const transition = movement.transition;
    if (npc.traversalState.kind === "approaching-elevator-board") {
      if (
        npc.traversalState.linkId !== transition.link.id ||
        npc.traversalState.from !== transition.from ||
        npc.traversalState.to !== transition.to
      ) {
        throw new Error(
          `NPCの乗車待ち経路がtransitionと一致しません: ${npc.id}/${transition.link.id}`
        );
      }
      npc.pendingNavigationTransition =
        cloneNavigationTransition(transition);
      const elevatorRoute = this.createNpcElevatorTraversalRoute(npc);
      this.pendingTraversalRequests.push(
        Object.freeze({
          kind: "elevator-board",
          npcId: npc.id,
          ...elevatorRoute,
          requestedAtSeconds: this.traversalElapsedSeconds
        })
      );
      npc.traversalState = Object.freeze({
        kind: "waiting-elevator-board",
        ...elevatorRoute
      });
      this.deferNavigationReplan(npc);
      return Object.freeze({
        ...this.createTraversalWaitingStep(npc),
        pathRecalculated: movement.pathRecalculated,
        pathDistance: movement.pathDistance,
        remainingPathDistance: movement.remainingPathDistance
      });
    }
    if (npc.traversalState.kind !== "walking") {
      return Object.freeze({
        ...this.createTraversalWaitingStep(npc),
        pathRecalculated: movement.pathRecalculated,
        pathDistance: movement.pathDistance,
        remainingPathDistance: movement.remainingPathDistance
      });
    }
    this.clearNavigationAgent(npc);
    npc.pendingNavigationTransition =
      cloneNavigationTransition(transition);
    npc.selectedRouteKind = "link";
    npc.selectedElevatorTransition =
      cloneNavigationTransition(transition);
    npc.traversalState = Object.freeze({
      kind: "moving-to-elevator-call-mat",
      ...this.createNpcElevatorTraversalRoute(npc)
    });
    return this.createTraversalWaitingStep(npc);
  }

  private updateNpcElevatorDisembarkMovement(
    npc: NpcRuntime,
    speed: number,
    deltaSeconds: number
  ) {
    const state = npc.traversalState;
    if (state.kind !== "leaving-elevator") {
      throw new Error(
        `NPC降車移動対象のtraversal状態が不正です: ${npc.id}/${state.kind}`
      );
    }
    const offset = state.exitLocation.position.subtract(
      npc.footPosition
    );
    const distance = offset.length();
    if (distance === 0) {
      return;
    }
    const movementDistance = Math.min(
      distance,
      speed * deltaSeconds
    );
    if (movementDistance === 0) {
      return;
    }
    const nextPosition = npc.footPosition.add(
      offset.scale(movementDistance / distance)
    );
    const nextFootPosition = this.resolveFootPosition(
      nextPosition
    );
    const movementHit = this.stage.queries.castMovementSegment(
      "npc",
      toAimPosition(npc.footPosition),
      toAimPosition(nextFootPosition)
    );
    if (movementHit) {
      return;
    }
    const horizontal = nextFootPosition.subtract(
      npc.footPosition
    );
    horizontal.y = 0;
    if (horizontal.lengthSquared() > 0) {
      npc.forward.copyFrom(horizontal.normalize());
    }
    npc.footPosition = nextFootPosition;
    this.synchronizeRestSlotOccupancyForNpc(npc);
    this.synchronizeSpritePosition(npc);
  }

  private createTraversalWaitingStep(
    npc: NpcRuntime
  ): NavigationAgentStepResult {
    return Object.freeze({
      location: cloneNavigationLocation(npc.navigationLocation),
      state: "waiting-for-path",
      pathRecalculated: false,
      pathDistance: null,
      remainingPathDistance: null,
      transition: null
    });
  }

  private clearNavigationAgent(npc: NpcRuntime) {
    if (isV2NpcElevatorTraversalState(npc.traversalState)) {
      return;
    }
    this.resetNavigationAgentForTraversalChange(npc);
    npc.selectedRouteKind = null;
    npc.selectedElevatorTransition = null;
  }

  private canExecuteNavigationReplan(npc: NpcRuntime): boolean {
    return (
      isV2NpcTraversalWalkingEnabled(npc.traversalState) ||
      npc.traversalState.kind === "waiting-elevator-call-input" ||
      npc.traversalState.kind === "waiting-elevator-call"
    );
  }

  private deferNavigationReplan(npc: NpcRuntime): void {
    npc.navigationAgentCleared = true;
    npc.navigationRemainingPathDistance = null;
    npc.navigationPendingTargetPosition = null;
    npc.navigationReplanRequestedAtSeconds = null;
    this.synchronizeRestSlotOccupancyForNpc(npc);
  }

  private resetNavigationAgentForTraversalChange(npc: NpcRuntime): void {
    npc.navigationAgent.clear();
    this.deferNavigationReplan(npc);
  }

  private acceptPendingNavigationTarget(npc: NpcRuntime): void {
    if (npc.navigationPendingTargetPosition) {
      npc.navigationTargetPosition.copyFrom(
        npc.navigationPendingTargetPosition
      );
    }
    npc.navigationPendingTargetPosition = null;
    npc.navigationReplanRequestedAtSeconds = null;
    npc.navigationAgentCleared = false;
    this.synchronizeRestSlotOccupancyForNpc(npc);
  }

  private requestNavigationReplan(
    npc: NpcRuntime,
    priority: NpcNavigationReplanPriority
  ): void {
    if (npc.navigationReplanRequestedAtSeconds === null) {
      npc.navigationGoalRevision += 1;
      npc.navigationReplanRequestedAtSeconds =
        this.traversalElapsedSeconds;
      npc.navigationReplanPriority = priority;
      npc.navigationPendingTargetPosition =
        npc.navigationTargetPosition.clone();
      return;
    }
    npc.navigationReplanPriority = Math.min(
      npc.navigationReplanPriority,
      priority
    ) as NpcNavigationReplanPriority;
  }

  private recordNavigationStep(
    movement: NavigationAgentStepResult
  ): void {
    if (!this.diagnosticsEnabled) {
      return;
    }
    if (movement.pathRecalculated) {
      this.pathRecalculationCount += 1;
    }
    if (movement.state === "waiting-for-path") {
      this.waitingForPathCount += 1;
    }
  }

  private collectAutonomousCombatNpcs(
    commandNpcIds: ReadonlySet<string>
  ) {
    const result: NpcRuntime[] = [];
    for (const npc of this.npcs) {
      const state = npc.stateSnapshot.state;
      if (
        !npc.sprite.isVisible ||
        commandNpcIds.has(npc.id) ||
        npc.command.mode !== "none" ||
        npc.alarmTargetQueue.length > 0 ||
        npc.capture !== null ||
        npc.breakawayRemainingSeconds > 0 ||
        (state !== "brainwash-complete-gun" &&
          state !== "brainwash-complete-no-gun")
      ) {
        continue;
      }
      this.requireTargetSelectionPersonality(npc);
      result.push(npc);
    }
    return Object.freeze(result);
  }

  private collectAutonomousThreatObservers(
    commandNpcIds: ReadonlySet<string>
  ) {
    const result: NpcRuntime[] = [];
    for (const npc of this.npcs) {
      if (
        !npc.sprite.isVisible ||
        commandNpcIds.has(npc.id) ||
        npc.command.mode !== "none" ||
        !isV2AliveState(npc.stateSnapshot.state) ||
        isV2BrainwashState(npc.stateSnapshot.state)
      ) {
        npc.autonomousVisualThreats.clear();
        continue;
      }
      result.push(npc);
    }
    return Object.freeze(result);
  }

  private updateAutonomousVisualThreats(
    observers: readonly NpcRuntime[],
    targetSpatialIndex: V2HumanTargetSpatialIndex,
    deltaSeconds: number
  ) {
    this.autonomousThreatSightCredit = Math.min(
      observers.length,
      this.autonomousThreatSightCredit +
        observers.length *
          deltaSeconds *
          V2_NPC_AUTONOMOUS_THREAT_SIGHT_HERTZ
    );
    const scheduledCount = Math.min(
      Math.floor(this.autonomousThreatSightCredit),
      V2_NPC_AUTONOMOUS_THREAT_SIGHT_MAXIMUM_PER_UPDATE,
      observers.length
    );
    const schedule = this.scheduleNpcIds(
      observers,
      scheduledCount,
      this.autonomousThreatSightCursor,
      []
    );
    this.autonomousThreatSightCredit -= schedule.npcIds.size;
    this.autonomousThreatSightCursor = schedule.nextCursor;
    if (schedule.npcIds.size === 0) {
      return;
    }
    this.autonomousThreatActorSpatialIndex.rebuild(
      this.autonomousThreatActors
    );
    for (const npcId of schedule.npcIds) {
      const npc = this.requireNpc(npcId);
      const hadVisualThreat = npc.autonomousVisualThreats.size > 0;
      npc.autonomousVisualThreats.clear();
      this.autonomousThreatSightCheckCount += 1;
      const origin = toAimPosition(npc.footPosition);
      for (const target of targetSpatialIndex.query(
        origin,
        NPC_VISION_RANGE
      )) {
        if (
          target.kind === "npc" &&
          isV2BrainwashState(target.state) &&
          this.isAutonomousThreatVisible(
            npc,
            origin,
            target.aimPosition
          )
        ) {
          npc.autonomousVisualThreats.set(
            target.id,
            Object.freeze({
              sourceId: target.id,
              sourceAimPosition: target.aimPosition.clone(),
              sightClear: true,
              provenance: "autonomous" as const
            })
          );
        }
      }
      for (const actor of this.autonomousThreatActorSpatialIndex.queryToRef(
        origin,
        NPC_VISION_RANGE,
        this.autonomousThreatActorQueryScratch
      )) {
        if (
          this.isAutonomousThreatVisible(
            npc,
            origin,
            actor.center
          )
        ) {
          npc.autonomousVisualThreats.set(
            actor.id,
            Object.freeze({
              sourceId: actor.id,
              sourceAimPosition: actor.center.clone(),
              sightClear: true,
              provenance: "autonomous" as const
            })
          );
        }
      }
      if (
        hadVisualThreat ||
        npc.autonomousVisualThreats.size > 0
      ) {
        npc.wanderDestination = null;
        this.clearNavigationAgent(npc);
      }
    }
  }

  private isAutonomousThreatVisible(
    npc: NpcRuntime,
    origin: Vector3,
    targetPosition: Vector3
  ) {
    const toTarget = targetPosition.subtract(origin);
    const distanceSquared = toTarget.lengthSquared();
    if (
      distanceSquared === 0 ||
      distanceSquared > NPC_VISION_RANGE_SQUARED
    ) {
      return false;
    }
    if (
      Vector3.Dot(npc.forward, toTarget) /
        Math.sqrt(distanceSquared) <
      NPC_VISION_COSINE
    ) {
      return false;
    }
    if (this.diagnosticsEnabled) {
      this.sightRayCount += 1;
    }
    return (
      this.stage.queries.castSightSegment(origin, targetPosition) ===
      null
    );
  }

  private collectCurrentTargetSightCandidates(
    autonomousCombatNpcs: readonly NpcRuntime[]
  ) {
    const result = [...autonomousCombatNpcs];
    for (const npc of this.npcs) {
      if (!npc.sprite.isVisible) {
        continue;
      }
      if (npc.command.mode === "follow") {
        result.push(npc);
        continue;
      }
      if (
        npc.command.mode === "none" &&
        npc.alarmTargetQueue.length > 0 &&
        npc.stateSnapshot.state === "brainwash-complete-gun"
      ) {
        result.push(npc);
      }
    }
    return Object.freeze(result);
  }

  private invalidateAutonomousVisualTargets(
    npcs: readonly NpcRuntime[],
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    capturedTargetIds: ReadonlySet<string>
  ) {
    for (const npc of npcs) {
      if (npc.targetProvenance !== "visual" || !npc.targetId) {
        continue;
      }
      const target = targetsById.get(npc.targetId);
      if (
        !target ||
        capturedTargetIds.has(target.id) ||
        !this.isTargetable(npc, target)
      ) {
        this.clearTarget(npc);
      }
    }
  }

  private scheduleCurrentTargetSightChecks(
    candidates: readonly NpcRuntime[],
    deltaSeconds: number
  ) {
    this.currentTargetSightCredit = Math.min(
      candidates.length,
      this.currentTargetSightCredit +
        candidates.length *
          deltaSeconds *
          V2_NPC_CURRENT_TARGET_SIGHT_HERTZ
    );
    const scheduledCount = Math.min(
      Math.floor(this.currentTargetSightCredit),
      V2_NPC_CURRENT_TARGET_SIGHT_MAXIMUM_PER_UPDATE,
      candidates.length
    );
    const priorityCandidates = candidates.filter(
      (npc) => npc.visualSightCheckPriority
    );
    const schedule = this.scheduleNpcIds(
      candidates,
      scheduledCount,
      this.currentTargetSightCursor,
      priorityCandidates
    );
    this.currentTargetSightCredit -= schedule.npcIds.size;
    this.currentTargetSightCursor = schedule.nextCursor;
    for (const npcId of schedule.npcIds) {
      this.requireNpc(npcId).visualSightCheckPriority = false;
    }
    return schedule.npcIds;
  }

  private schedulePersonalityRetargetQueries(
    candidates: readonly NpcRuntime[],
    deltaSeconds: number
  ) {
    const retargetCandidates = candidates.filter(
      (npc) =>
        this.requireTargetSelectionPersonality(npc) ===
          "nearest-visible" &&
        npc.targetProvenance === "visual" &&
        npc.targetId !== null
    );
    this.personalityRetargetCredit = Math.min(
      retargetCandidates.length,
      this.personalityRetargetCredit +
        retargetCandidates.length *
          deltaSeconds *
          V2_NPC_PERSONALITY_RETARGET_HERTZ
    );
    const eligibleRetargetCandidates = retargetCandidates.filter(
      (npc) => npc.personalityRetargetCooldownSeconds === 0
    );
    const perUpdateRateLimit = Math.min(
      Math.ceil(
        retargetCandidates.length *
          deltaSeconds *
          V2_NPC_PERSONALITY_RETARGET_HERTZ
      ),
      V2_NPC_PERSONALITY_RETARGET_MAXIMUM_PER_UPDATE
    );
    const scheduledCount = Math.min(
      Math.floor(this.personalityRetargetCredit),
      perUpdateRateLimit,
      eligibleRetargetCandidates.length
    );
    const schedule = this.scheduleNpcIds(
      eligibleRetargetCandidates,
      scheduledCount,
      this.personalityRetargetCursor,
      []
    );
    this.personalityRetargetCredit -= schedule.npcIds.size;
    this.personalityRetargetCursor = schedule.nextCursor;
    return schedule.npcIds;
  }

  private scheduleNpcIds(
    candidates: readonly NpcRuntime[],
    count: number,
    cursor: number,
    priorityCandidates: readonly NpcRuntime[]
  ): NpcScheduleResult {
    if (count === 0 || this.npcs.length === 0) {
      return Object.freeze({
        npcIds: new Set<string>(),
        nextCursor: cursor
      });
    }
    const candidateIds = new Set(candidates.map((npc) => npc.id));
    const priorityCandidateIds = new Set(
      priorityCandidates.map((npc) => npc.id)
    );
    const npcIds = new Set<string>();
    let nextCursor = cursor;
    const eligibleIdGroups =
      priorityCandidateIds.size > 0
        ? [priorityCandidateIds, candidateIds]
        : [candidateIds];
    for (const eligibleIds of eligibleIdGroups) {
      let visitedCount = 0;
      while (
        npcIds.size < count &&
        visitedCount < this.npcs.length
      ) {
        const npc = this.npcs[nextCursor];
        nextCursor = (nextCursor + 1) % this.npcs.length;
        visitedCount += 1;
        if (eligibleIds.has(npc.id)) {
          npcIds.add(npc.id);
        }
      }
      if (npcIds.size === count) {
        break;
      }
    }
    return Object.freeze({
      npcIds,
      nextCursor
    });
  }

  private startFollow(
    npc: NpcRuntime,
    playerTarget: V2HumanTargetSnapshot
  ) {
    this.clearNpcCommand(npc, true);
    this.clearAutonomousState(npc);
    npc.command.mode = "follow";
    npc.command.temporaryGunActive =
      npc.stateSnapshot.state === "brainwash-complete-no-gun" ||
      npc.stateSnapshot.state === "brainwash-complete-haigure";
    npc.command.followLostSightSeconds = 0;
    npc.command.followLastSeenFootPosition =
      playerTarget.footPosition.clone();
    if (this.playerHorizontalDirection.lengthSquared() > 0) {
      npc.command.followLastSeenDirection.copyFrom(
        this.playerHorizontalDirection
      );
    }
    npc.command.followMovementStopped =
      Vector3.Distance(npc.footPosition, playerTarget.footPosition) <=
      NPC_FOLLOW_STOP_DISTANCE;
    this.applySpriteVisualState(npc);
  }

  private startLeave(
    npc: NpcRuntime,
    destination: NavigationLocation
  ) {
    this.clearNpcCommand(npc, true);
    this.clearAutonomousState(npc);
    npc.command.mode = "leave";
    npc.command.leaveDestination = cloneNavigationLocation(destination);
    npc.command.leaveElapsedSeconds = 0;
    this.applySpriteVisualState(npc);
  }

  private createLeaveDestination(
    npc: NpcRuntime,
    playerTarget: V2HumanTargetSnapshot
  ) {
    const away = npc.footPosition.subtract(playerTarget.footPosition);
    away.y = 0;
    if (away.lengthSquared() === 0) {
      away.copyFrom(npc.forward);
      away.y = 0;
    }
    away.normalize();
    const currentDistanceSquared = Vector3.DistanceSquared(
      npc.footPosition,
      playerTarget.footPosition
    );
    let selected:
      | Readonly<{
          location: NavigationLocation;
          distanceSquared: number;
          sourceOrder: number;
        }>
      | null = null;
    this.setNavigationIntent(
      npc,
      "leave",
      V2_NPC_LEAVE_SPEED,
      playerTarget.footPosition
    );
    for (
      let sourceOrder = 0;
      sourceOrder < NPC_LEAVE_DIRECTION_OFFSETS.length;
      sourceOrder += 1
    ) {
      const angle = NPC_LEAVE_DIRECTION_OFFSETS[sourceOrder];
      const direction = new Vector3(
        away.x * Math.cos(angle) - away.z * Math.sin(angle),
        0,
        away.x * Math.sin(angle) + away.z * Math.cos(angle)
      );
      const candidate = npc.navigationLocation.position.add(
        direction.scale(NPC_LEAVE_DESTINATION_DISTANCE)
      );
      const projected = this.stage.navigation.projectPoint(
        candidate,
        NAVIGATION_PROJECTION_MAX_DISTANCE
      );
      if (
        !projected ||
        this.stage.navigation.findPath(
          npc.navigationLocation,
          projected,
          "npc",
          npc.navigationRoutePolicy
        ) === null
      ) {
        continue;
      }
      const distanceSquared = Vector3.DistanceSquared(
        projected.position,
        playerTarget.footPosition
      );
      if (
        distanceSquared <=
        currentDistanceSquared + NPC_COMMAND_DISTANCE_EPSILON
      ) {
        continue;
      }
      if (
        !selected ||
        distanceSquared >
          selected.distanceSquared + NPC_COMMAND_DISTANCE_EPSILON ||
        (Math.abs(distanceSquared - selected.distanceSquared) <=
          NPC_COMMAND_DISTANCE_EPSILON &&
          sourceOrder < selected.sourceOrder)
      ) {
        selected = Object.freeze({
          location: cloneNavigationLocation(projected),
          distanceSquared,
          sourceOrder
        });
      }
    }
    return selected?.location ?? null;
  }

  private clearAutonomousState(npc: NpcRuntime) {
    npc.autonomousVisualThreats.clear();
    npc.evadeThreatSetKey = "";
    npc.evadeThreatId = null;
    npc.evadeThreatSightClear = false;
    npc.evadeNavigationReplanPriority = 4;
    npc.alarmTargetQueue.length = 0;
    npc.capture = null;
    npc.breakawayRemainingSeconds = 0;
    npc.breakawayDestination = null;
    npc.wanderDestination = null;
    this.clearRestSlot(npc);
    this.removePendingRequestsForNpc(npc.id);
    this.clearTarget(npc);
    this.releaseCapturesForTarget(npc.id);
  }

  private removePendingRequestsForNpc(npcId: string) {
    for (
      let index = this.pendingAlertRequests.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (this.pendingAlertRequests[index].leaderId === npcId) {
        this.pendingAlertRequests.splice(index, 1);
      }
    }
    for (
      let index = this.pendingBeamRequests.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (this.pendingBeamRequests[index].sourceId === npcId) {
        this.pendingBeamRequests.splice(index, 1);
      }
    }
  }

  private clearFollowerFireState(npc: NpcRuntime) {
    if (
      npc.command.followerFirePhase === "scheduled" &&
      npc.command.followerBeamRequestQueued
    ) {
      this.removePendingRequestsForNpc(npc.id);
    }
    npc.command.followerFirePhase = "idle";
    npc.command.followerFireRemainingSeconds = 0;
    npc.command.followerFireDirection = null;
    npc.command.followerBeamId = null;
    npc.command.followerBeamRequestQueued = false;
  }

  private clearNpcCommand(
    npc: NpcRuntime,
    preserveActiveFollowerBeam: boolean
  ) {
    const retainActiveFollowerBeam =
      preserveActiveFollowerBeam &&
      npc.command.followerFirePhase === "active";
    npc.command.mode = "none";
    npc.command.temporaryGunActive = false;
    npc.command.followSightClear = false;
    npc.command.followLostSightSeconds = 0;
    npc.command.followLastSeenFootPosition = null;
    npc.command.followLastSeenDirection.setAll(0);
    npc.command.followElevatorDestination = null;
    npc.command.followElevatorDestinationAreaId = null;
    npc.command.followElevatorLinkId = null;
    npc.command.followMovementStopped = false;
    npc.command.leaveDestination = null;
    npc.command.leaveElapsedSeconds = 0;
    if (!retainActiveFollowerBeam) {
      this.clearFollowerFireState(npc);
    }
    this.clearNavigationAgent(npc);
    npc.wanderDestination = null;
    npc.visualSightCheckPriority = true;
    this.applySpriteVisualState(npc);
  }

  private prepareNpcCommands(
    playerTarget: V2HumanTargetSnapshot
  ) {
    const processedNpcIds = new Set<string>();
    for (const npc of this.npcs) {
      if (npc.command.mode === "none") {
        continue;
      }
      processedNpcIds.add(npc.id);
      if (
        !npc.sprite.isVisible ||
        isV2BrainwashState(npc.stateSnapshot.state) !==
          isV2BrainwashState(playerTarget.state)
      ) {
        this.clearNpcCommand(npc, true);
      }
    }
    return processedNpcIds;
  }

  private updateCommands(
    deltaSeconds: number,
    playerTarget: V2HumanTargetSnapshot,
    currentTargetSightNpcIds: ReadonlySet<string>
  ) {
    const playerElevatorTraversal = this.playerElevatorTraversal;
    const continuingPlayerElevatorTraversal =
      playerElevatorTraversal !== null &&
      playerElevatorTraversal.phase !== "cancelled"
        ? Object.freeze({
            snapshot: playerElevatorTraversal,
            destinationAreaId:
              this.stage.navigationAreas.locate(
                playerElevatorTraversal.destinationFloorPosition
              ).areaId
          })
        : null;
    let followerCount = 0;
    for (const npc of this.npcs) {
      if (npc.command.mode !== "follow") {
        continue;
      }
      if (
        playerElevatorTraversal?.phase === "cancelled" &&
        npc.command.followElevatorLinkId ===
          playerElevatorTraversal.linkId
      ) {
        npc.command.followElevatorDestination = null;
        npc.command.followElevatorDestinationAreaId = null;
        npc.command.followElevatorLinkId = null;
      }
      if (continuingPlayerElevatorTraversal !== null) {
        const traversal = continuingPlayerElevatorTraversal.snapshot;
        if (
          npc.command.followElevatorDestination === null ||
          npc.command.followElevatorLinkId !== traversal.linkId ||
          !npc.command.followElevatorDestination.equals(
            traversal.destinationFloorPosition
          )
        ) {
          npc.command.followElevatorDestination =
            traversal.destinationFloorPosition.clone();
          npc.command.followElevatorDestinationAreaId =
            continuingPlayerElevatorTraversal.destinationAreaId;
          npc.command.followElevatorLinkId = traversal.linkId;
        }
      }
      const elevatorDestination =
        npc.command.followElevatorDestination;
      const trackingPlayerTransport =
        elevatorDestination !== null &&
        (continuingPlayerElevatorTraversal !== null ||
          npc.pursuitActorAreaCursor.areaId !==
            npc.command.followElevatorDestinationAreaId ||
          this.horizontalDistance(
            npc.footPosition,
            elevatorDestination
          ) > NPC_FOLLOW_TRACKING_DISTANCE);
      if (elevatorDestination !== null && !trackingPlayerTransport) {
        npc.command.followElevatorDestination = null;
        npc.command.followElevatorDestinationAreaId = null;
        npc.command.followElevatorLinkId = null;
      }
      if (trackingPlayerTransport && elevatorDestination !== null) {
        npc.command.followSightClear = false;
        npc.command.followLostSightSeconds = 0;
        if (npc.command.followLastSeenFootPosition === null) {
          npc.command.followLastSeenFootPosition =
            elevatorDestination.clone();
        } else {
          npc.command.followLastSeenFootPosition.copyFrom(
            elevatorDestination
          );
        }
        npc.command.followMovementStopped = false;
        followerCount += 1;
        continue;
      }
      const playerDistance = Vector3.Distance(
        npc.footPosition,
        playerTarget.footPosition
      );
      if (playerDistance > NPC_FOLLOW_SIGHT_DISTANCE) {
        npc.command.followSightClear = false;
      }
      const followGraceWouldExpire =
        !npc.command.followSightClear &&
        playerDistance > NPC_FOLLOW_TRACKING_DISTANCE &&
        npc.command.followLostSightSeconds + deltaSeconds >=
          V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS;
      if (
        playerDistance <= NPC_FOLLOW_SIGHT_DISTANCE &&
        (currentTargetSightNpcIds.has(npc.id) ||
          followGraceWouldExpire)
      ) {
        if (this.diagnosticsEnabled) {
          this.currentTargetSightCheckCount += 1;
          this.sightRayCount += 1;
        }
        npc.command.followSightClear =
          this.stage.queries.castSightSegment(
            toAimPosition(npc.footPosition),
            playerTarget.aimPosition
          ) === null;
      }
      if (
        npc.command.followSightClear ||
        playerDistance <= NPC_FOLLOW_TRACKING_DISTANCE
      ) {
        npc.command.followLostSightSeconds = 0;
        npc.command.followLastSeenFootPosition =
          playerTarget.footPosition.clone();
        if (this.playerHorizontalDirection.lengthSquared() > 0) {
          npc.command.followLastSeenDirection.copyFrom(
            this.playerHorizontalDirection
          );
        }
        if (npc.command.followMovementStopped) {
          if (playerDistance > NPC_FOLLOW_RESUME_DISTANCE) {
            npc.command.followMovementStopped = false;
          }
        } else if (playerDistance <= NPC_FOLLOW_STOP_DISTANCE) {
          npc.command.followMovementStopped = true;
        }
      } else {
        npc.command.followLostSightSeconds += deltaSeconds;
        npc.command.followMovementStopped = false;
        if (
          npc.command.followLostSightSeconds >=
          V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS
        ) {
          this.clearNpcCommand(npc, true);
        }
      }
      if (npc.command.mode === "follow") {
        followerCount += 1;
      }
    }

    for (let npcIndex = 0; npcIndex < this.npcs.length; npcIndex += 1) {
      const npc = this.npcs[npcIndex];
      if (npc.command.mode === "follow") {
        this.updateFollowMovement(
          npc,
          followerCount,
          playerTarget,
          deltaSeconds,
          this.hasReplanPermission(npcIndex)
        );
        this.updateFollowerFire(npc, deltaSeconds);
      } else if (npc.command.mode === "leave") {
        this.updateLeaveMovement(
          npc,
          deltaSeconds,
          this.hasReplanPermission(npcIndex)
        );
      }
    }
  }

  private updateFollowMovement(
    npc: NpcRuntime,
    followerCount: number,
    playerTarget: V2HumanTargetSnapshot,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ) {
    let destination: Vector3 | null = null;
    let usesFormationAnchor = false;
    const lastSeen = npc.command.followLastSeenFootPosition;
    if (lastSeen) {
      const centralDestination = lastSeen.clone();
      if (npc.command.followLostSightSeconds > 0) {
        centralDestination.addInPlace(
          npc.command.followLastSeenDirection.scale(
            NPC_FOLLOW_LAST_DIRECTION_DISTANCE
          )
        );
      }
      if (followerCount > 1) {
        const requestedFormationDestination =
          centralDestination.add(npc.command.followFormationOffset);
        const projectedFormationDestination =
          this.stage.navigation.projectPoint(
            requestedFormationDestination,
            NAVIGATION_PROJECTION_MAX_DISTANCE
          );
        if (
          projectedFormationDestination &&
          Vector3.Distance(
            requestedFormationDestination,
            projectedFormationDestination.position
          ) <= NPC_FOLLOW_FORMATION_PROJECTION_DISTANCE
        ) {
          destination = projectedFormationDestination.position.clone();
          usesFormationAnchor = true;
        }
      }
      if (!destination) {
        destination = centralDestination;
      }
    }
    if (destination && usesFormationAnchor) {
      const formationDistance = Vector3.Distance(
        npc.footPosition,
        destination
      );
      if (npc.command.followMovementStopped) {
        if (formationDistance > NPC_FOLLOW_FORMATION_RESUME_DISTANCE) {
          npc.command.followMovementStopped = false;
        }
      } else if (formationDistance <= NPC_FOLLOW_FORMATION_STOP_DISTANCE) {
        npc.command.followMovementStopped = true;
      }
    }
    if (npc.command.followMovementStopped) {
      destination = null;
    }
    if (!destination) {
      this.clearNavigationAgent(npc);
      return;
    }
    const movement = this.updateNavigation(
      npc,
      "follow",
      destination,
      V2_NPC_FOLLOW_SPEED,
      deltaSeconds,
      allowPathRecalculation
    );
    this.recordNavigationStep(movement);
    if (movement.state === "waiting-for-path") {
      return;
    }
    this.applyNavigationMovement(npc, movement.location);
    const stopDistance = usesFormationAnchor
      ? NPC_FOLLOW_FORMATION_STOP_DISTANCE
      : NPC_FOLLOW_STOP_DISTANCE;
    const stopTarget = usesFormationAnchor
      ? destination
      : playerTarget.footPosition;
    if (
      npc.command.followLostSightSeconds === 0 &&
      Vector3.Distance(npc.footPosition, stopTarget) <= stopDistance
    ) {
      npc.command.followMovementStopped = true;
      this.clearNavigationAgent(npc);
    }
  }

  private updateLeaveMovement(
    npc: NpcRuntime,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ) {
    const movementSeconds = Math.min(
      deltaSeconds,
      V2_NPC_LEAVE_MAXIMUM_SECONDS -
        npc.command.leaveElapsedSeconds
    );
    npc.command.leaveElapsedSeconds += movementSeconds;
    const destination = npc.command.leaveDestination!;
    const movement = this.updateNavigation(
      npc,
      "leave",
      destination.position,
      V2_NPC_LEAVE_SPEED,
      movementSeconds,
      allowPathRecalculation
    );
    this.recordNavigationStep(movement);
    if (movement.state === "waiting-for-path") {
      if (
        npc.command.leaveElapsedSeconds >=
        V2_NPC_LEAVE_MAXIMUM_SECONDS
      ) {
        this.clearNpcCommand(npc, true);
      }
      return;
    }
    this.applyNavigationMovement(npc, movement.location);
    if (
      movement.state === "arrived" ||
      Vector3.Distance(
        npc.navigationLocation.position,
        destination.position
      ) <= NPC_LEAVE_ARRIVAL_DISTANCE
    ) {
      this.clearNpcCommand(npc, true);
      return;
    }
    if (
      npc.command.leaveElapsedSeconds >=
      V2_NPC_LEAVE_MAXIMUM_SECONDS
    ) {
      this.clearNpcCommand(npc, true);
    }
  }

  private updateFollowerFire(
    npc: NpcRuntime,
    deltaSeconds: number
  ) {
    if (npc.command.followerFirePhase === "cooldown") {
      npc.command.followerFireRemainingSeconds = Math.max(
        0,
        npc.command.followerFireRemainingSeconds - deltaSeconds
      );
      if (npc.command.followerFireRemainingSeconds === 0) {
        this.clearFollowerFireState(npc);
      }
      return;
    }
    if (
      npc.command.followerFirePhase !== "scheduled" ||
      npc.command.followerBeamRequestQueued
    ) {
      return;
    }
    npc.command.followerFireRemainingSeconds = Math.max(
      0,
      npc.command.followerFireRemainingSeconds - deltaSeconds
    );
    if (npc.command.followerFireRemainingSeconds > 0) {
      return;
    }
    this.pendingBeamRequests.push(
      Object.freeze({
        sourceId: npc.id,
        originKind: "npc-gun" as const,
        targetPolicy: ALIVE_HUMANS_TARGET_POLICY,
        origin: toAimPosition(npc.footPosition),
        direction: npc.command.followerFireDirection!.clone(),
        speed: V2_NPC_GUN_BEAM_SPEED,
        maximumLifetime: V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS
      })
    );
    npc.command.followerBeamRequestQueued = true;
  }

  private nextFollowerFireRandom(npc: NpcRuntime) {
    npc.command.followerFireRandomState =
      (Math.imul(
        npc.command.followerFireRandomState,
        1_664_525
      ) +
        1_013_904_223) >>>
      0;
    return (
      npc.command.followerFireRandomState /
      0x1_0000_0000
    );
  }

  private synchronizeStateMode(
    npc: NpcRuntime,
    previousState: V2CharacterState,
    currentState: V2CharacterState
  ) {
    if (previousState === currentState) {
      return;
    }
    this.clearRestSlot(npc);
    if (
      currentState !== "brainwash-complete-gun" &&
      currentState !== "brainwash-complete-no-gun"
    ) {
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      this.clearTarget(npc);
    }
    if (currentState === "brainwash-complete-gun") {
      npc.fireCooldownSeconds = this.nextInitialGunCooldown();
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      this.clearTarget(npc);
    }
    if (currentState === "brainwash-complete-no-gun") {
      npc.fireCooldownSeconds = 0;
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      this.clearTarget(npc);
    }
    if (isV2AliveState(currentState) && !isV2AliveState(previousState)) {
      npc.wanderDestination = null;
      npc.wanderWaitSeconds = this.nextWanderWait();
    }
  }

  private advanceAlarmTargetQueues(
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>
  ) {
    for (const npc of this.npcs) {
      for (let index = npc.alarmTargetQueue.length - 1; index >= 0; index -= 1) {
        const entry = npc.alarmTargetQueue[index];
        const target = targetsById.get(entry.targetId);
        if (
          !target ||
          target.id === npc.id ||
          isV2BrainwashState(target.state)
        ) {
          npc.alarmTargetQueue.splice(index, 1);
        }
      }
      if (npc.targetProvenance === "alert") {
        const first = npc.alarmTargetQueue[0];
        if (!first || first.targetId !== npc.targetId) {
          this.clearTarget(npc);
        }
      }
    }
  }

  private advanceCaptures(
    deltaSeconds: number,
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    capturedTargetIds: Set<string>,
    threatenedIds: Set<string>,
    threatSourcesByTargetId: NpcEvadeThreatsByTargetId
  ) {
    const startedBreakawayNpcIds = new Set<string>();
    for (const npc of this.npcs) {
      if (!npc.capture) {
        continue;
      }
      const target = targetsById.get(npc.capture.targetId);
      if (!target || !this.isTargetable(npc, target)) {
        this.releaseCaptureImmediately(npc);
        continue;
      }
      npc.capture.lastTargetFootPosition.copyFrom(target.footPosition);
      npc.capture.remainingSeconds -= deltaSeconds;
      if (npc.capture.remainingSeconds <= 0) {
        this.startBreakaway(npc, target.footPosition);
        startedBreakawayNpcIds.add(npc.id);
        continue;
      }
      capturedTargetIds.add(target.id);
      this.registerCaptureThreat(
        npc,
        target.id,
        threatenedIds,
        threatSourcesByTargetId
      );
    }
    return startedBreakawayNpcIds;
  }

  private registerCaptureThreat(
    npc: NpcRuntime,
    targetId: string,
    threatenedIds: Set<string>,
    threatSourcesByTargetId: NpcEvadeThreatsByTargetId
  ) {
    threatenedIds.add(npc.id);
    threatenedIds.add(targetId);
    addNpcEvadeThreat(
      threatSourcesByTargetId,
      targetId,
      Object.freeze({
        sourceId: npc.id,
        sourceAimPosition: toAimPosition(npc.footPosition),
        sightClear: true,
        provenance: "direct" as const
      })
    );
    const target = this.npcsById.get(targetId);
    if (target) {
      addNpcEvadeThreat(
        threatSourcesByTargetId,
        npc.id,
        Object.freeze({
          sourceId: target.id,
          sourceAimPosition: toAimPosition(target.footPosition),
          sightClear: true,
          provenance: "direct" as const
        })
      );
    }
  }

  private selectCombatTarget(
    npc: NpcRuntime,
    state: "brainwash-complete-gun" | "brainwash-complete-no-gun",
    targetSpatialIndex: V2HumanTargetSpatialIndex,
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    capturedTargetIds: ReadonlySet<string>,
    runCurrentTargetSightCheck: boolean,
    runPersonalityRetargetQuery: boolean
  ) {
    const alarmTarget = npc.alarmTargetQueue[0];
    if (alarmTarget) {
      const target = targetsById.get(alarmTarget.targetId);
      if (
        !target ||
        target.id === npc.id ||
        isV2BrainwashState(target.state)
      ) {
        throw new Error(
          `prune後のalarm targetが標的不能です: ${alarmTarget.targetId}`
        );
      }
      this.setTarget(
        npc,
        target.id,
        "alert",
        `alarm:${alarmTarget.candidateId}`,
        0
      );
      if (
        state === "brainwash-complete-gun" &&
        runCurrentTargetSightCheck
      ) {
        if (this.diagnosticsEnabled) {
          this.currentTargetSightCheckCount += 1;
          this.sightRayCount += 1;
        }
        npc.visualTargetSightClear =
          this.stage.queries.castSightSegment(
            toAimPosition(npc.footPosition),
            target.aimPosition
          ) === null;
      }
      return target;
    }

    const personality = this.requireTargetSelectionPersonality(npc);
    const sightResults: NpcSightResultCache | null =
      runCurrentTargetSightCheck ||
      runPersonalityRetargetQuery
        ? new Map()
        : null;
    let currentTarget: V2HumanTargetSnapshot | null = null;
    if (npc.targetProvenance === "visual" && npc.targetId) {
      currentTarget = targetsById.get(npc.targetId) ?? null;
      if (
        !currentTarget ||
        capturedTargetIds.has(currentTarget.id) ||
        !this.isTargetable(npc, currentTarget)
      ) {
        this.clearTarget(npc);
        currentTarget = null;
      } else if (runCurrentTargetSightCheck) {
        if (this.diagnosticsEnabled) {
          this.currentTargetSightCheckCount += 1;
        }
        const retained =
          state === "brainwash-complete-gun"
            ? this.retainGunVisualTarget(
                npc,
                currentTarget,
                sightResults!
              )
            : this.isVisuallyTargetable(
                npc,
                currentTarget,
                sightResults!
              );
        if (!retained) {
          this.clearTarget(npc);
          currentTarget = null;
        }
      }
    }

    if (
      currentTarget &&
      runPersonalityRetargetQuery &&
      personality === "nearest-visible"
    ) {
      npc.personalityRetargetCooldownSeconds =
        NPC_PERSONALITY_RETARGET_INTERVAL_SECONDS;
      if (this.diagnosticsEnabled) {
        this.personalityRetargetQueryCount += 1;
      }
      const nearestTarget = this.findNearestVisibleTarget(
        npc,
        targetSpatialIndex.query(
          toAimPosition(npc.footPosition),
          NPC_VISION_RANGE
        ),
        capturedTargetIds,
        "target-id",
        sightResults!
      );
      if (
        nearestTarget &&
        nearestTarget.id !== currentTarget.id
      ) {
        this.setAutonomousVisualTarget(npc, nearestTarget);
        if (state === "brainwash-complete-gun") {
          this.activateGunVisualTarget(npc, nearestTarget);
        }
        return nearestTarget;
      }
      if (
        !runCurrentTargetSightCheck &&
        sightResults!.has(currentTarget.id)
      ) {
        const retained =
          state === "brainwash-complete-gun"
            ? this.retainGunVisualTarget(
                npc,
                currentTarget,
                sightResults!
              )
            : this.isVisuallyTargetable(
                npc,
                currentTarget,
                sightResults!
              );
        if (!retained) {
          this.clearTarget(npc);
          currentTarget = null;
        }
      }
    }
    if (currentTarget) {
      return currentTarget;
    }
    if (!runCurrentTargetSightCheck) {
      return null;
    }

    const visibleTarget = this.findNearestVisibleTarget(
      npc,
      targetSpatialIndex.query(
        toAimPosition(npc.footPosition),
        NPC_VISION_RANGE
      ),
      capturedTargetIds,
      personality === "nearest-visible"
        ? "target-id"
        : "source-order",
      sightResults!
    );
    if (!visibleTarget) {
      this.clearTarget(npc);
      npc.visualSightCheckPriority = false;
      return null;
    }
    this.setAutonomousVisualTarget(npc, visibleTarget);
    if (state === "brainwash-complete-gun") {
      this.activateGunVisualTarget(npc, visibleTarget);
    }
    return visibleTarget;
  }

  private retainGunVisualTarget(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    sightResults: NpcSightResultCache
  ) {
    if (!this.isTargetable(npc, target)) {
      return false;
    }
    const origin = toAimPosition(npc.footPosition);
    const distanceSquared = Vector3.DistanceSquared(
      origin,
      target.aimPosition
    );
    const sightClear = this.castVisualTargetSight(
      origin,
      target,
      sightResults
    );
    npc.visualTargetSightClear = sightClear;
    if (sightClear) {
      if (distanceSquared > NPC_VISUAL_LOCK_RANGE_SQUARED) {
        return false;
      }
      if (npc.gunVisualPursuitMode !== "live") {
        this.clearNavigationAgent(npc);
      }
      npc.gunVisualPursuitMode = "live";
      npc.gunLastSeenFootPosition = target.footPosition.clone();
      npc.gunLastSeenPathPlanned = false;
      return true;
    }
    if (!npc.gunLastSeenFootPosition) {
      return false;
    }
    if (npc.gunVisualPursuitMode !== "last-seen") {
      this.clearNavigationAgent(npc);
      npc.gunLastSeenPathPlanned = false;
    }
    npc.gunVisualPursuitMode = "last-seen";
    return true;
  }

  private horizontalDistance(left: Vector3, right: Vector3) {
    return Math.hypot(left.x - right.x, left.z - right.z);
  }

  private clearRestSlot(npc: NpcRuntime) {
    npc.restSlot = null;
    npc.restSlotAreaId = null;
    npc.restSlotKey = null;
    npc.restSlotReferenceDistance = 0;
    npc.resting = false;
    this.synchronizeRestSlotOccupancyForNpc(npc);
  }

  private isNpcStoppedForRestSeparation(npc: NpcRuntime) {
    return (
      isStoppedState(npc.stateSnapshot.state) ||
      npc.capture !== null ||
      npc.command.followMovementStopped ||
      (npc.command.mode === "none" && npc.navigationAgentCleared) ||
      !isV2NpcTraversalWalkingEnabled(npc.traversalState)
    );
  }

  private requireRestSlotAreaOccupancy(
    areaId: string
  ): NpcRestSlotAreaOccupancy {
    let occupancy = this.restSlotOccupancyByAreaId.get(areaId);
    if (occupancy === undefined) {
      const entries: NpcRestSlotOccupancy[] = [];
      occupancy = {
        entries,
        index: createV2PlanarSpatialIndex<NpcRestSlotOccupancy>(
          (entry) => entry.position,
          NPC_REST_SEPARATION_DISTANCE
        ),
        queryScratch: []
      };
      this.restSlotOccupancyByAreaId.set(areaId, occupancy);
    }
    return occupancy;
  }

  private getRestSlotOccupancyForNpc(
    npc: NpcRuntime
  ): NpcRestSlotOccupancy {
    let occupancy = this.restSlotOccupancyByNpcId.get(npc.id);
    if (occupancy === undefined) {
      occupancy = {
        ownerId: npc.id,
        position: Vector3.Zero(),
        areaId: null
      };
      this.restSlotOccupancyByNpcId.set(npc.id, occupancy);
    }
    return occupancy;
  }

  private prepareRestSlotOccupancyCaches(
    playerTarget: V2HumanTargetSnapshot
  ): void {
    for (const areaOccupancy of this.restSlotOccupancyByAreaId.values()) {
      areaOccupancy.entries.length = 0;
    }
    for (const occupancy of this.restSlotOccupancyByNpcId.values()) {
      occupancy.areaId = null;
    }

    const playerArea = this.resolveTargetNavigationArea(playerTarget);
    const playerOccupancy = this.playerRestSlotOccupancy;
    playerOccupancy.position.copyFrom(playerTarget.footPosition);
    playerOccupancy.areaId = playerArea.areaId;
    this.requireRestSlotAreaOccupancy(
      playerArea.areaId
    ).entries.push(playerOccupancy);

    for (const npc of this.npcs) {
      const occupancy = this.getRestSlotOccupancyForNpc(npc);
      if (!npc.sprite.isVisible) {
        continue;
      }
      if (npc.restSlot && npc.restSlotAreaId !== null) {
        occupancy.position.copyFrom(npc.restSlot.position);
        occupancy.areaId = npc.restSlotAreaId;
      } else if (this.isNpcStoppedForRestSeparation(npc)) {
        occupancy.position.copyFrom(npc.footPosition);
        occupancy.areaId = npc.pursuitActorAreaCursor.areaId;
      } else {
        continue;
      }
      this.requireRestSlotAreaOccupancy(
        occupancy.areaId
      ).entries.push(occupancy);
    }

    for (const [areaId, areaOccupancy] of this.restSlotOccupancyByAreaId) {
      if (areaOccupancy.entries.length === 0) {
        this.restSlotOccupancyByAreaId.delete(areaId);
      } else {
        areaOccupancy.index.rebuild(areaOccupancy.entries);
      }
    }
    this.restSlotOccupancyPlayerTarget = playerTarget;
    this.restSlotOccupancyPrepared = true;
  }

  private removeRestSlotOccupancyEntry(
    areaOccupancy: NpcRestSlotAreaOccupancy,
    occupancy: NpcRestSlotOccupancy
  ): void {
    const index = areaOccupancy.entries.indexOf(occupancy);
    if (index < 0) {
      throw new Error(
        `NPC停止位置の占有索引に対象がありません: ${occupancy.ownerId}`
      );
    }
    for (
      let moveIndex = index;
      moveIndex < areaOccupancy.entries.length - 1;
      moveIndex += 1
    ) {
      areaOccupancy.entries[moveIndex] =
        areaOccupancy.entries[moveIndex + 1];
    }
    areaOccupancy.entries.length -= 1;
  }

  private updateRestSlotOccupancy(
    occupancy: NpcRestSlotOccupancy,
    areaId: string | null,
    position: Vector3
  ): void {
    if (!this.restSlotOccupancyPrepared) {
      return;
    }
    const previousAreaId = occupancy.areaId;
    if (
      previousAreaId === areaId &&
      (areaId === null || occupancy.position.equals(position))
    ) {
      return;
    }

    let previousAreaOccupancy: NpcRestSlotAreaOccupancy | null = null;
    if (previousAreaId !== null && previousAreaId !== areaId) {
      previousAreaOccupancy = this.requireRestSlotAreaOccupancy(
        previousAreaId
      );
      this.removeRestSlotOccupancyEntry(
        previousAreaOccupancy,
        occupancy
      );
    }

    occupancy.areaId = areaId;
    occupancy.position.copyFrom(position);
    let nextAreaOccupancy: NpcRestSlotAreaOccupancy | null = null;
    if (areaId !== null) {
      nextAreaOccupancy = this.requireRestSlotAreaOccupancy(areaId);
      if (previousAreaId !== areaId) {
        nextAreaOccupancy.entries.push(occupancy);
      }
      nextAreaOccupancy.index.rebuild(nextAreaOccupancy.entries);
    }
    if (
      previousAreaOccupancy !== null &&
      previousAreaOccupancy !== nextAreaOccupancy
    ) {
      if (previousAreaOccupancy.entries.length === 0) {
        this.restSlotOccupancyByAreaId.delete(previousAreaId as string);
      } else {
        previousAreaOccupancy.index.rebuild(
          previousAreaOccupancy.entries
        );
      }
    }
  }

  private synchronizeRestSlotOccupancyForNpc(npc: NpcRuntime): void {
    if (!this.restSlotOccupancyPrepared) {
      return;
    }
    const occupancy = this.getRestSlotOccupancyForNpc(npc);
    if (!npc.sprite.isVisible) {
      this.updateRestSlotOccupancy(occupancy, null, npc.footPosition);
    } else if (npc.restSlot && npc.restSlotAreaId !== null) {
      this.updateRestSlotOccupancy(
        occupancy,
        npc.restSlotAreaId,
        npc.restSlot.position
      );
    } else if (this.isNpcStoppedForRestSeparation(npc)) {
      this.updateRestSlotOccupancy(
        occupancy,
        npc.pursuitActorAreaCursor.areaId,
        npc.footPosition
      );
    } else {
      this.updateRestSlotOccupancy(occupancy, null, npc.footPosition);
    }
  }

  private isRestSlotPositionAvailable(
    npc: NpcRuntime,
    position: Vector3,
    occupancy: NpcRestSlotAreaOccupancy,
    separationThreshold: number,
    separationThresholdSquared: number
  ): boolean {
    for (const occupied of occupancy.index.queryToRef(
      position,
      separationThreshold,
      occupancy.queryScratch
    )) {
      if (occupied.ownerId === npc.id) {
        continue;
      }
      const offsetX = position.x - occupied.position.x;
      const offsetZ = position.z - occupied.position.z;
      if (
        offsetX * offsetX + offsetZ * offsetZ <
        separationThresholdSquared
      ) {
        return false;
      }
    }
    return true;
  }

  private reserveRestSlot(
    npc: NpcRuntime,
    slot: NavigationLocation,
    areaId: string,
    key: string,
    referencePosition: Vector3
  ) {
    npc.restSlot = cloneNavigationLocation(slot);
    npc.restSlotAreaId = areaId;
    npc.restSlotKey = key;
    npc.restSlotReferenceDistance = this.horizontalDistance(
      slot.position,
      referencePosition
    );
    npc.resting = false;
    this.synchronizeRestSlotOccupancyForNpc(npc);
    return cloneNavigationLocation(slot);
  }

  private selectRestSlot(
    npc: NpcRuntime,
    center: Vector3,
    areaId: string,
    key: string,
    playerTarget: V2HumanTargetSnapshot,
    minimumCenterDistance: number,
    maximumCenterDistance: number
  ) {
    if (
      !this.restSlotOccupancyPrepared ||
      this.restSlotOccupancyPlayerTarget !== playerTarget
    ) {
      this.prepareRestSlotOccupancyCaches(playerTarget);
    }
    const occupancy = this.requireRestSlotAreaOccupancy(areaId);
    const separationThreshold =
      NPC_REST_SEPARATION_DISTANCE - NPC_COMMAND_DISTANCE_EPSILON;
    const separationThresholdSquared =
      separationThreshold * separationThreshold;
    const tryCandidate = (candidate: Vector3) => {
      const projected = this.stage.navigation.projectPoint(
        candidate,
        NPC_REST_SLOT_PROJECTION_DISTANCE
      );
      if (
        !projected ||
        Vector3.Distance(projected.position, candidate) >
          NPC_REST_SLOT_PROJECTION_DISTANCE ||
        this.stage.navigationAreas.portals.some((portal) =>
          portal.contains(projected.position)
        )
      ) {
        return null;
      }
      if (
        this.stage.navigationAreas.locate(projected.position).areaId !== areaId
      ) {
        return null;
      }
      const centerDistance = this.horizontalDistance(
        projected.position,
        center
      );
      if (
        centerDistance + NPC_COMMAND_DISTANCE_EPSILON <
          minimumCenterDistance ||
        centerDistance >
          maximumCenterDistance + NPC_COMMAND_DISTANCE_EPSILON ||
        !this.isRestSlotPositionAvailable(
          npc,
          projected.position,
          occupancy,
          separationThreshold,
          separationThresholdSquared
        )
      ) {
        return null;
      }
      return cloneNavigationLocation(projected);
    };

    if (minimumCenterDistance === 0) {
      const centered = tryCandidate(center);
      if (centered) {
        return this.reserveRestSlot(
          npc,
          centered,
          areaId,
          key,
          center
        );
      }
    }

    const angleOffset = createNpcRestSlotAngle(npc.id);
    const firstRing = Math.max(
      1,
      Math.ceil(
        (minimumCenterDistance - NPC_COMMAND_DISTANCE_EPSILON) /
          NPC_REST_SEPARATION_DISTANCE
      )
    );
    for (
      let ring = firstRing;
      ring <= NPC_REST_SLOT_RING_COUNT;
      ring += 1
    ) {
      const radius = ring * NPC_REST_SEPARATION_DISTANCE;
      if (
        radius >
        maximumCenterDistance + NPC_COMMAND_DISTANCE_EPSILON
      ) {
        break;
      }
      const candidateCount = NPC_REST_SLOT_BASE_COUNT * ring;
      let selected: NavigationLocation | null = null;
      let selectedDistance = Number.POSITIVE_INFINITY;
      let selectedOrder = Number.POSITIVE_INFINITY;
      for (
        let sourceOrder = 0;
        sourceOrder < candidateCount;
        sourceOrder += 1
      ) {
        const angle =
          angleOffset +
          (sourceOrder / candidateCount) * Math.PI * 2;
        const candidate = new Vector3(
          center.x + Math.cos(angle) * radius,
          center.y,
          center.z + Math.sin(angle) * radius
        );
        const projected = tryCandidate(candidate);
        if (!projected) {
          continue;
        }
        const distance = this.horizontalDistance(
          npc.footPosition,
          projected.position
        );
        if (
          distance <
            selectedDistance - NPC_COMMAND_DISTANCE_EPSILON ||
          (Math.abs(distance - selectedDistance) <=
            NPC_COMMAND_DISTANCE_EPSILON &&
            sourceOrder < selectedOrder)
        ) {
          selected = projected;
          selectedDistance = distance;
          selectedOrder = sourceOrder;
        }
      }
      if (selected) {
        return this.reserveRestSlot(
          npc,
          selected,
          areaId,
          key,
          center
        );
      }
    }
    return null;
  }

  private resolveGunRestSlot(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    playerTarget: V2HumanTargetSnapshot
  ) {
    const targetArea = this.resolveTargetNavigationArea(target);
    const key =
      `gun:${target.id}:${targetArea.areaId}:` +
      `${targetArea.revision}`;
    let resumeFromExistingSlot = false;
    if (
      npc.restSlot &&
      npc.restSlotAreaId === targetArea.areaId &&
      npc.restSlotKey === key
    ) {
      const currentReferenceDistance = this.horizontalDistance(
        npc.restSlot.position,
        target.footPosition
      );
      if (
        currentReferenceDistance <=
        npc.restSlotReferenceDistance +
          NPC_GUN_REPOSITION_DISTANCE +
          NPC_COMMAND_DISTANCE_EPSILON
      ) {
        return npc.restSlot;
      }
      resumeFromExistingSlot = true;
    }
    this.clearRestSlot(npc);
    if (
      npc.pursuitActorAreaCursor.areaId !== targetArea.areaId ||
      (!resumeFromExistingSlot &&
        this.horizontalDistance(npc.footPosition, target.footPosition) >
          NPC_GUN_RESUME_DISTANCE + NPC_COMMAND_DISTANCE_EPSILON)
    ) {
      return null;
    }
    return this.selectRestSlot(
      npc,
      target.footPosition,
      targetArea.areaId,
      key,
      playerTarget,
      NPC_GUN_STOP_DISTANCE,
      Number.POSITIVE_INFINITY
    );
  }

  private updateGunNpc(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    playerTarget: V2HumanTargetSnapshot,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ) {
    if (
      npc.targetProvenance === "visual" &&
      npc.gunVisualPursuitMode === "last-seen"
    ) {
      this.clearRestSlot(npc);
      this.updateGunLastSeenPursuit(
        npc,
        deltaSeconds,
        allowPathRecalculation
      );
      return;
    }
    const restSlot = this.resolveGunRestSlot(
      npc,
      target,
      playerTarget
    );
    if (
      restSlot &&
      this.horizontalDistance(npc.footPosition, restSlot.position) <=
        NPC_REST_SLOT_ARRIVAL_DISTANCE
    ) {
      npc.resting = true;
      if (!npc.navigationAgentCleared) {
        this.clearNavigationAgent(npc);
      }
    } else {
      npc.resting = false;
      this.chaseTarget(
        npc,
        target,
        deltaSeconds,
        allowPathRecalculation,
        restSlot?.position ?? null
      );
      if (
        restSlot &&
        this.horizontalDistance(npc.footPosition, restSlot.position) <=
          NPC_REST_SLOT_ARRIVAL_DISTANCE
      ) {
        npc.resting = true;
        if (!npc.navigationAgentCleared) {
          this.clearNavigationAgent(npc);
        }
      }
    }
    const origin = toAimPosition(npc.footPosition);
    const toTarget = target.aimPosition.subtract(origin);
    const distanceSquared = toTarget.lengthSquared();
    const horizontalDirection = target.footPosition.subtract(
      npc.footPosition
    );
    horizontalDirection.y = 0;
    if (horizontalDirection.lengthSquared() > 0) {
      npc.forward.copyFrom(horizontalDirection.normalize());
    }
    if (
      distanceSquared === 0 ||
      distanceSquared > NPC_GUN_RANGE_SQUARED ||
      !npc.visualTargetSightClear
    ) {
      return;
    }
    npc.fireCooldownSeconds -= deltaSeconds;
    if (npc.fireCooldownSeconds > 0) {
      return;
    }
    const direction = toTarget.scale(1 / Math.sqrt(distanceSquared));
    this.pendingBeamRequests.push(
      Object.freeze({
        sourceId: npc.id,
        originKind: "npc-gun" as const,
        targetPolicy: ALIVE_HUMANS_TARGET_POLICY,
        origin,
        direction,
        speed: V2_NPC_GUN_BEAM_SPEED,
        maximumLifetime: V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS
      })
    );
    npc.fireCooldownSeconds = this.nextFireInterval();
  }

  private updateGunLastSeenPursuit(
    npc: NpcRuntime,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ) {
    const destination = npc.gunLastSeenFootPosition!;
    npc.wanderDestination = null;
    const movement = this.updateNavigation(
      npc,
      "pursue",
      destination,
      V2_NPC_CHASE_SPEED,
      deltaSeconds,
      allowPathRecalculation && !npc.gunLastSeenPathPlanned
    );
    this.recordNavigationStep(movement);
    if (movement.pathRecalculated) {
      if (
        movement.pathDistance === null ||
        movement.pathDistance >
          NPC_LAST_SEEN_MAXIMUM_PATH_DISTANCE
      ) {
        this.clearTarget(npc);
        return;
      }
      npc.gunLastSeenPathPlanned = true;
    }
    if (
      !npc.gunLastSeenPathPlanned ||
      movement.state === "waiting-for-path"
    ) {
      return;
    }
    if (
      movement.state === "unreachable" ||
      movement.state === "transition-required"
    ) {
      this.clearTarget(npc);
      return;
    }
    if (!this.applyNavigationMovement(npc, movement.location)) {
      this.clearTarget(npc);
      return;
    }
    if (movement.state === "arrived") {
      this.clearTarget(npc);
    }
  }

  private updateNoGunNpc(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    allowPathRecalculation: boolean,
    capturedTargetIds: Set<string>,
    threatenedIds: Set<string>,
    threatSourcesByTargetId: NpcEvadeThreatsByTargetId
  ) {
    this.clearRestSlot(npc);
    if (npc.alarmTargetQueue.length > 0) {
      this.chaseTarget(
        npc,
        target,
        deltaSeconds,
        allowPathRecalculation
      );
      return;
    }
    if (
      target.alive &&
      !capturedTargetIds.has(target.id) &&
      Vector3.Distance(npc.footPosition, target.footPosition) <=
        V2_NPC_CAPTURE_RADIUS
    ) {
      npc.capture = {
        targetId: target.id,
        remainingSeconds: V2_NPC_CAPTURE_DURATION_SECONDS,
        lastTargetFootPosition: target.footPosition.clone()
      };
      capturedTargetIds.add(target.id);
      this.clearNavigationAgent(npc);
      this.pendingAlertRequests.push(
        Object.freeze({
          leaderId: npc.id,
          targetId: target.id
        })
      );
      this.registerCaptureThreat(
        npc,
        target.id,
        threatenedIds,
        threatSourcesByTargetId
      );
      return;
    }
    this.chaseTarget(
      npc,
      target,
      deltaSeconds,
      allowPathRecalculation
    );
  }

  private chaseTarget(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    allowPathRecalculation: boolean,
    detailDestination: Vector3 | null = null
  ) {
    npc.wanderDestination = null;
    const targetArea = this.resolveTargetNavigationArea(target);
    const actorAreaId = npc.pursuitActorAreaCursor.areaId;
    const targetAreaChanged =
      npc.pursuitTargetId !== target.id ||
      npc.pursuitTargetAreaId !== targetArea.areaId ||
      npc.pursuitTargetAreaRevision !== targetArea.revision;
    if (targetAreaChanged) {
      npc.pursuitTargetId = target.id;
      npc.pursuitTargetAreaId = targetArea.areaId;
      npc.pursuitTargetAreaRevision = targetArea.revision;
      npc.pursuitAnchor.copyFrom(target.footPosition);
      npc.pursuitPhase =
        actorAreaId === targetArea.areaId ? "coarse" : "area";
      npc.pursuitCoarseRefreshRemainingSeconds =
        npc.pursuitCoarseRefreshOffsetSeconds;
      this.requestNavigationReplan(npc, 2);
    } else if (
      npc.pursuitPhase === "area" &&
      actorAreaId === targetArea.areaId
    ) {
      npc.pursuitPhase = "coarse";
      this.pursuitPromotionCount += 1;
      npc.pursuitAnchor.copyFrom(target.footPosition);
      npc.pursuitCoarseRefreshRemainingSeconds =
        npc.pursuitCoarseRefreshOffsetSeconds;
      this.requestNavigationReplan(npc, 2);
    } else if (
      npc.pursuitPhase === "coarse" &&
      npc.navigationRemainingPathDistance !== null &&
      npc.navigationRemainingPathDistance <=
        NPC_DETAIL_ENTER_DISTANCE
    ) {
      npc.pursuitPhase = "detail";
      this.pursuitPromotionCount += 1;
      this.requestNavigationReplan(npc, 1);
    } else if (npc.pursuitPhase === "detail") {
      const horizontalDistance = Math.hypot(
        npc.footPosition.x - target.footPosition.x,
        npc.footPosition.z - target.footPosition.z
      );
      if (
        horizontalDistance >= NPC_DETAIL_EXIT_DISTANCE ||
        (npc.navigationRemainingPathDistance !== null &&
          npc.navigationRemainingPathDistance >=
            NPC_DETAIL_EXIT_DISTANCE)
      ) {
        npc.pursuitPhase = "coarse";
        this.pursuitDemotionCount += 1;
        npc.pursuitAnchor.copyFrom(target.footPosition);
        npc.pursuitCoarseRefreshRemainingSeconds =
          npc.pursuitCoarseRefreshOffsetSeconds;
        this.requestNavigationReplan(npc, 3);
      }
    }
    if (npc.pursuitPhase === "coarse") {
      npc.pursuitCoarseRefreshRemainingSeconds -= deltaSeconds;
      if (npc.pursuitCoarseRefreshRemainingSeconds <= 0) {
        npc.pursuitCoarseRefreshRemainingSeconds +=
          V2_NPC_COARSE_REFRESH_SECONDS;
        if (!npc.pursuitAnchor.equals(target.footPosition)) {
          npc.pursuitAnchor.copyFrom(target.footPosition);
          this.requestNavigationReplan(npc, 3);
        }
      }
    }
    const destination =
      detailDestination ??
      (npc.pursuitPhase === "detail"
        ? target.footPosition
        : npc.pursuitAnchor);
    const movement = this.updateNavigation(
      npc,
      "pursue",
      destination,
      npc.targetProvenance === "alert"
        ? V2_NPC_ALARM_SPEED
        : V2_NPC_CHASE_SPEED,
      deltaSeconds,
      allowPathRecalculation
    );
    this.recordNavigationStep(movement);
    this.applyNavigationMovement(npc, movement.location);
  }

  private updateSearchingNpc(
    npc: NpcRuntime,
    playerTarget: V2HumanTargetSnapshot,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ) {
    const returningFromEvade = npc.evadeThreatSetKey.length > 0;
    npc.evadeThreatId = null;
    npc.evadeThreatSightClear = false;
    npc.evadeThreatSetKey = "";
    npc.evadeNavigationReplanPriority = 4;
    if (returningFromEvade) {
      npc.wanderDestination = null;
      npc.wanderWaitSeconds = 0;
      this.clearRestSlot(npc);
    }
    if (npc.targetId !== null) {
      this.clearTarget(npc);
    }
    npc.wanderWaitSeconds = Math.max(
      0,
      npc.wanderWaitSeconds - deltaSeconds
    );
    if (!npc.wanderDestination && npc.wanderWaitSeconds === 0) {
      npc.wanderDestination = this.createWanderDestination(
        npc,
        playerTarget
      );
      this.clearNavigationAgent(npc);
      if (!npc.wanderDestination) {
        npc.wanderWaitSeconds = this.nextWanderWait();
        return;
      }
    }
    if (!npc.wanderDestination) {
      return;
    }

    const movement = this.updateNavigation(
      npc,
      "wander",
      npc.wanderDestination.position,
      NPC_SEARCH_SPEED,
      deltaSeconds,
      allowPathRecalculation
    );
    this.recordNavigationStep(movement);
    if (movement.state === "waiting-for-path") {
      return;
    }
    const moved = this.applyNavigationMovement(npc, movement.location);
    if (
      !moved ||
      movement.state === "arrived" ||
      movement.state === "unreachable"
    ) {
      this.clearNavigationAgent(npc);
      npc.wanderDestination = null;
      npc.wanderWaitSeconds = this.nextWanderWait();
      npc.resting = moved && movement.state === "arrived";
    }
  }

  private updateEvadingNpc(
    npc: NpcRuntime,
    threats: readonly NpcEvadeThreat[],
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ) {
    const orderedThreats = [...threats].sort((left, right) => {
      const distanceDifference =
        Vector3.DistanceSquared(
          npc.footPosition,
          left.sourceAimPosition
        ) -
        Vector3.DistanceSquared(
          npc.footPosition,
          right.sourceAimPosition
        );
      return (
        distanceDifference ||
        left.sourceId.localeCompare(right.sourceId)
      );
    });
    const primaryThreat = orderedThreats[0];
    if (!primaryThreat) {
      throw new Error(`回避脅威集合が空です: ${npc.id}`);
    }
    npc.evadeNavigationReplanPriority = orderedThreats.some(
      (threat) => threat.provenance === "direct"
    )
      ? 0
      : 4;
    const threatSetKey = orderedThreats
      .map((threat) => threat.sourceId)
      .sort()
      .join("\u0000");
    if (npc.evadeThreatSetKey !== threatSetKey) {
      npc.wanderDestination = null;
      this.clearRestSlot(npc);
      this.clearNavigationAgent(npc);
    }
    npc.evadeThreatSetKey = threatSetKey;
    npc.evadeThreatId = primaryThreat.sourceId;
    npc.evadeThreatSightClear = primaryThreat.sightClear;
    npc.targetId = null;
    npc.targetProvenance = null;
    npc.gunVisualPursuitMode = null;
    npc.gunLastSeenFootPosition = null;
    npc.gunLastSeenPathPlanned = false;
    npc.visualTargetSightClear = false;
    npc.alertLeaderId = null;
    npc.alertRemainingSeconds = 0;
    if (!npc.wanderDestination) {
      npc.wanderDestination = this.selectNpcEvadeDestination(
        npc,
        orderedThreats
      );
      this.clearNavigationAgent(npc);
      if (!npc.wanderDestination) {
        return;
      }
    }
    const movement = this.updateNavigation(
      npc,
      "evade",
      npc.wanderDestination.position,
      V2_NPC_CHASE_SPEED,
      deltaSeconds,
      allowPathRecalculation
    );
    this.recordNavigationStep(movement);
    if (movement.state === "waiting-for-path") {
      return;
    }
    const moved = this.applyNavigationMovement(npc, movement.location);
    if (
      !moved ||
      movement.state === "arrived" ||
      movement.state === "unreachable"
    ) {
      this.clearNavigationAgent(npc);
      npc.wanderDestination = null;
    }
  }

  private selectNpcEvadeDestination(
    npc: NpcRuntime,
    threats: readonly NpcEvadeThreat[]
  ) {
    type ScoredDestination = Readonly<{
      location: NavigationLocation;
      nonDecreasingForAllThreats: boolean;
      minimumThreatDistance: number;
      primaryThreatDistance: number;
      pathDistance: number;
      sourceOrder: number;
    }>;
    const currentThreatDistances = threats.map((threat) =>
      Vector3.Distance(npc.footPosition, threat.sourceAimPosition)
    );
    const candidateLocations: Array<
      Readonly<{
        location: NavigationLocation;
        sourceOrder: number;
      }>
    > = [];
    for (let sourceOrder = 0; sourceOrder < 16; sourceOrder += 1) {
      const angle = (sourceOrder / 16) * Math.PI * 2;
      const candidate = npc.navigationLocation.position.add(
        new Vector3(
          Math.cos(angle) * NPC_WANDER_RADIUS,
          0,
          Math.sin(angle) * NPC_WANDER_RADIUS
        )
      );
      const location = this.stage.navigation.constrainMovement(
        npc.navigationLocation,
        candidate
      );
      if (location) {
        candidateLocations.push(
          Object.freeze({
            location,
            sourceOrder
          })
        );
      }
    }
    const elevatorDestinations =
      this.collectNpcElevatorEvadeDestinations(npc);
    for (
      let index = 0;
      index < elevatorDestinations.length;
      index += 1
    ) {
      candidateLocations.push(
        Object.freeze({
          location: elevatorDestinations[index],
          sourceOrder: 16 + index
        })
      );
    }
    let selected: ScoredDestination | null = null;
    for (const candidate of candidateLocations) {
      const threatDistances = threats.map((threat) =>
        Vector3.Distance(
          candidate.location.position,
          threat.sourceAimPosition
        )
      );
      const scored: ScoredDestination = Object.freeze({
        location: cloneNavigationLocation(candidate.location),
        nonDecreasingForAllThreats: threatDistances.every(
          (distance, index) =>
            distance + NPC_COMMAND_DISTANCE_EPSILON >=
            currentThreatDistances[index]
        ),
        minimumThreatDistance: Math.min(...threatDistances),
        primaryThreatDistance: threatDistances[0],
        pathDistance: Vector3.Distance(
          npc.navigationLocation.position,
          candidate.location.position
        ),
        sourceOrder: candidate.sourceOrder
      });
      if (
        !selected ||
        Number(scored.nonDecreasingForAllThreats) >
          Number(selected.nonDecreasingForAllThreats) ||
        (scored.nonDecreasingForAllThreats ===
          selected.nonDecreasingForAllThreats &&
          (scored.minimumThreatDistance >
            selected.minimumThreatDistance +
              NPC_COMMAND_DISTANCE_EPSILON ||
            (Math.abs(
              scored.minimumThreatDistance -
                selected.minimumThreatDistance
            ) <= NPC_COMMAND_DISTANCE_EPSILON &&
              (scored.primaryThreatDistance >
                selected.primaryThreatDistance +
                  NPC_COMMAND_DISTANCE_EPSILON ||
                (Math.abs(
                  scored.primaryThreatDistance -
                    selected.primaryThreatDistance
                ) <= NPC_COMMAND_DISTANCE_EPSILON &&
                  (scored.pathDistance <
                    selected.pathDistance -
                      NPC_COMMAND_DISTANCE_EPSILON ||
                    (Math.abs(
                      scored.pathDistance - selected.pathDistance
                    ) <= NPC_COMMAND_DISTANCE_EPSILON &&
                      scored.sourceOrder < selected.sourceOrder)))))))
      ) {
        selected = scored;
      }
    }
    return selected?.location ?? null;
  }

  private updateBreakaway(
    npc: NpcRuntime,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ) {
    npc.breakawayRemainingSeconds = Math.max(
      0,
      npc.breakawayRemainingSeconds - deltaSeconds
    );
    if (npc.breakawayDestination) {
      const movement = this.updateNavigation(
        npc,
        "breakaway",
        npc.breakawayDestination.position,
        V2_NPC_CAPTURE_BREAKAWAY_SPEED,
        deltaSeconds,
        allowPathRecalculation
      );
      this.recordNavigationStep(movement);
      if (movement.state !== "waiting-for-path") {
        const moved = this.applyNavigationMovement(npc, movement.location);
        if (
          !moved ||
          movement.state === "arrived" ||
          movement.state === "unreachable"
        ) {
          this.clearNavigationAgent(npc);
          npc.breakawayDestination = null;
        }
      }
    }
    if (npc.breakawayRemainingSeconds === 0) {
      this.clearNavigationAgent(npc);
      npc.breakawayDestination = null;
    }
  }

  private startBreakaway(npc: NpcRuntime, targetFootPosition: Vector3) {
    npc.capture = null;
    this.clearTarget(npc);
    npc.breakawayRemainingSeconds = V2_NPC_CAPTURE_BREAKAWAY_SECONDS;
    const away = npc.footPosition.subtract(targetFootPosition);
    away.y = 0;
    if (away.lengthSquared() === 0) {
      away.copyFrom(npc.forward).scaleInPlace(-1);
    } else {
      away.normalize();
    }
    const candidate = npc.navigationLocation.position.add(
      away.scale(NPC_EVADE_DISTANCE)
    );
    npc.breakawayDestination = this.stage.navigation.constrainMovement(
      npc.navigationLocation,
      candidate
    );
  }

  private findNearestVisibleTarget(
    npc: NpcRuntime,
    targets: readonly V2HumanTargetSnapshot[],
    excludedTargetIds: ReadonlySet<string>,
    tieBreak: "source-order" | "target-id",
    sightResults: NpcSightResultCache
  ) {
    const origin = toAimPosition(npc.footPosition);
    const candidates: Array<{
      target: V2HumanTargetSnapshot;
      distanceSquared: number;
      sourceOrder: number;
    }> = [];
    targets.forEach((target, sourceOrder) => {
      if (excludedTargetIds.has(target.id)) {
        return;
      }
      const distanceSquared = this.getVisualDistanceSquared(
        npc,
        target,
        origin
      );
      if (distanceSquared === null) {
        return;
      }
      candidates.push({ target, distanceSquared, sourceOrder });
    });
    candidates.sort(
      (left, right) =>
        left.distanceSquared - right.distanceSquared ||
        (tieBreak === "source-order"
          ? left.sourceOrder - right.sourceOrder
          : left.target.id < right.target.id
            ? -1
            : left.target.id > right.target.id
              ? 1
              : 0)
    );
    for (const candidate of candidates) {
      if (
        !this.castVisualTargetSight(
          origin,
          candidate.target,
          sightResults
        )
      ) {
        continue;
      }
      return candidate.target;
    }
    return null;
  }

  private isVisuallyTargetable(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    sightResults: NpcSightResultCache
  ) {
    const origin = toAimPosition(npc.footPosition);
    if (this.getVisualDistanceSquared(npc, target, origin) === null) {
      npc.visualTargetSightClear = false;
      return false;
    }
    const sightClear = this.castVisualTargetSight(
      origin,
      target,
      sightResults
    );
    npc.visualTargetSightClear = sightClear;
    return sightClear;
  }

  private castVisualTargetSight(
    origin: Vector3,
    target: V2HumanTargetSnapshot,
    sightResults: NpcSightResultCache
  ) {
    const cached = sightResults.get(target.id);
    if (cached !== undefined) {
      return cached;
    }
    if (this.diagnosticsEnabled) {
      this.sightRayCount += 1;
    }
    const sightClear =
      this.stage.queries.castSightSegment(
        origin,
        target.aimPosition
      ) === null;
    sightResults.set(target.id, sightClear);
    return sightClear;
  }

  private getVisualDistanceSquared(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    origin: Vector3
  ) {
    if (!this.isTargetable(npc, target)) {
      return null;
    }
    const toTarget = target.aimPosition.subtract(origin);
    const distanceSquared = toTarget.lengthSquared();
    if (
      distanceSquared === 0 ||
      distanceSquared > NPC_VISION_RANGE_SQUARED
    ) {
      return null;
    }
    const inverseDistance = 1 / Math.sqrt(distanceSquared);
    if (
      Vector3.Dot(npc.forward, toTarget) * inverseDistance <
      NPC_VISION_COSINE
    ) {
      return null;
    }
    return distanceSquared;
  }

  private isTargetable(npc: NpcRuntime, target: V2HumanTargetSnapshot) {
    return target.id !== npc.id && target.alive && !target.brainwashed;
  }

  private applyNavigationMovement(
    npc: NpcRuntime,
    nextLocation: NavigationLocation
  ) {
    const displacement = nextLocation.position.subtract(
      npc.navigationLocation.position
    );
    if (displacement.lengthSquared() === 0) {
      return true;
    }
    const previousFootPosition = npc.footPosition;
    const nextFootPosition = nextLocation.position.clone();
    const currentAimPosition = toAimPosition(npc.footPosition);
    const nextAimPosition = toAimPosition(nextFootPosition);
    const movementHit = this.stage.queries.castMovementSegment(
      "npc",
      currentAimPosition,
      nextAimPosition
    );
    if (movementHit) {
      const selectedElevatorTransition =
        npc.selectedElevatorTransition;
      if (
        npc.traversalState.kind === "walking" &&
        selectedElevatorTransition &&
        this.elevatorHumanGateColliders.has(movementHit.mesh) &&
        this.stage.queries.intersectsVolumeSegmentById(
          this.requireNpcElevatorStopTraversal(
            selectedElevatorTransition.link.id,
            selectedElevatorTransition.from
          ).callMatId,
          previousFootPosition,
          nextFootPosition
        )
      ) {
        this.resetNavigationAgentForTraversalChange(npc);
        npc.selectedElevatorTransition = null;
        this.beginNpcElevatorCall(
          npc,
          selectedElevatorTransition
        );
        return false;
      }
      this.clearNavigationAgent(npc);
      const doorId = this.doorIdByCollider.get(movementHit.mesh);
      if (doorId && npc.traversalState.kind === "walking") {
        npc.pendingNavigationTransition = null;
        npc.traversalState = Object.freeze({
          kind: "waiting-door-open",
          doorId
        });
        this.pendingTraversalRequests.push(
          Object.freeze({
            kind: "door-open",
            npcId: npc.id,
            doorId
          })
        );
      }
      return false;
    }
    const horizontal = new Vector3(displacement.x, 0, displacement.z);
    if (horizontal.lengthSquared() > 0) {
      npc.forward.copyFrom(horizontal.normalize());
    }
    npc.pursuitActorAreaCursor =
      this.stage.navigationAreas.advance(
        npc.pursuitActorAreaCursor,
        npc.pursuitActorAreaPosition,
        nextFootPosition
      );
    npc.pursuitActorAreaPosition.copyFrom(nextFootPosition);
    npc.navigationLocation = cloneNavigationLocation(nextLocation);
    npc.footPosition = nextFootPosition;
    this.tryBeginNpcElevatorCallFromMat(
      npc,
      previousFootPosition,
      nextFootPosition
    );
    return true;
  }

  private relocateNavigationAreaCursor(npc: NpcRuntime): void {
    npc.pursuitActorAreaCursor =
      this.stage.navigationAreas.locate(npc.footPosition);
    npc.pursuitActorAreaPosition.copyFrom(npc.footPosition);
  }

  private tryBeginNpcElevatorCallFromMat(
    npc: NpcRuntime,
    from: Vector3,
    to: Vector3
  ) {
    const transition = npc.selectedElevatorTransition;
    if (!transition || npc.traversalState.kind !== "walking") {
      return;
    }
    const stop = this.requireNpcElevatorStopTraversal(
      transition.link.id,
      transition.from
    );
    if (
      !this.stage.queries.intersectsVolumeSegmentById(
        stop.callMatId,
        from,
        to
      )
    ) {
      return;
    }
    this.resetNavigationAgentForTraversalChange(npc);
    npc.selectedElevatorTransition = null;
    this.beginNpcElevatorCall(npc, transition);
  }

  private resolveFootPosition(navigationPosition: Vector3) {
    const probeOrigin = navigationPosition.add(
      new Vector3(0, GROUND_PROBE_UPWARD_OFFSET, 0)
    );
    const ground = this.stage.queries.sampleGround(
      probeOrigin,
      GROUND_PROBE_DISTANCE
    );
    if (!ground) {
      throw new Error(
        `NPCのNavMesh位置に物理床がありません: (${navigationPosition.x}, ${navigationPosition.y}, ${navigationPosition.z})`
      );
    }
    return new Vector3(
      navigationPosition.x,
      ground.point.y,
      navigationPosition.z
    );
  }

  private setTarget(
    npc: NpcRuntime,
    targetId: string,
    provenance: V2TargetProvenance,
    alertLeaderId: string | null,
    alertRemainingSeconds: number
  ) {
    const changed =
      npc.targetId !== targetId ||
      npc.targetProvenance !== provenance;
    npc.targetId = targetId;
    npc.targetProvenance = provenance;
    npc.alertLeaderId = alertLeaderId;
    npc.alertRemainingSeconds = alertRemainingSeconds;
    npc.wanderDestination = null;
    if (changed) {
      this.clearRestSlot(npc);
      if (this.diagnosticsEnabled) {
        this.forcedTargetChangeCount += 1;
      }
      this.clearNavigationAgent(npc);
      npc.gunVisualPursuitMode = null;
      npc.gunLastSeenFootPosition = null;
      npc.gunLastSeenPathPlanned = false;
      npc.visualTargetSightClear = false;
    }
  }

  private assignTargetSelectionPersonality(
    npc: NpcRuntime,
    state: V2CharacterState
  ) {
    if (
      npc.targetSelectionPersonality !== null ||
      !isCompletedBrainwashState(state)
    ) {
      return;
    }
    npc.targetSelectionPersonality =
      selectV2TargetSelectionPersonality("npc", npc.id);
    npc.visualSightCheckPriority = true;
  }

  private requireTargetSelectionPersonality(npc: NpcRuntime) {
    const personality = npc.targetSelectionPersonality;
    if (personality === null) {
      throw new Error(
        `洗脳完了NPCに標的選択個性がありません: ${npc.id}`
      );
    }
    return personality;
  }

  private setAutonomousVisualTarget(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot
  ) {
    const targetIdChanged = npc.targetId !== target.id;
    npc.targetId = target.id;
    npc.targetProvenance = "visual";
    npc.alertLeaderId = null;
    npc.alertRemainingSeconds = 0;
    npc.wanderDestination = null;
    npc.visualSightCheckPriority = false;
    if (targetIdChanged) {
      this.clearRestSlot(npc);
      if (
        this.requireTargetSelectionPersonality(npc) ===
        "nearest-visible"
      ) {
        npc.personalityRetargetCooldownSeconds =
          NPC_PERSONALITY_RETARGET_INTERVAL_SECONDS;
      }
      if (this.diagnosticsEnabled) {
        this.autonomousVisualTargetChangeCount += 1;
      }
      npc.gunVisualPursuitMode = null;
      npc.gunLastSeenFootPosition = null;
      npc.gunLastSeenPathPlanned = false;
      npc.visualTargetSightClear = true;
    }
    return targetIdChanged;
  }

  private activateGunVisualTarget(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot
  ) {
    npc.gunVisualPursuitMode = "live";
    npc.gunLastSeenFootPosition = target.footPosition.clone();
    npc.gunLastSeenPathPlanned = false;
    npc.visualTargetSightClear = true;
    this.pendingAlertRequests.push(
      Object.freeze({
        leaderId: npc.id,
        targetId: target.id
      })
    );
  }

  private clearTarget(npc: NpcRuntime) {
    const hadTarget =
      npc.targetId !== null || npc.targetProvenance !== null;
    npc.targetId = null;
    npc.targetProvenance = null;
    npc.gunVisualPursuitMode = null;
    npc.gunLastSeenFootPosition = null;
    npc.gunLastSeenPathPlanned = false;
    npc.visualTargetSightClear = false;
    npc.alertLeaderId = null;
    npc.alertRemainingSeconds = 0;
    npc.pursuitPhase = "detail";
    npc.pursuitTargetId = null;
    npc.pursuitTargetAreaId = null;
    npc.pursuitTargetAreaRevision = -1;
    if (hadTarget) {
      npc.visualSightCheckPriority = true;
      this.clearRestSlot(npc);
      if (
        npc.stateSnapshot.state === "brainwash-complete-gun" ||
        npc.stateSnapshot.state === "brainwash-complete-no-gun"
      ) {
        npc.wanderDestination = null;
        npc.wanderWaitSeconds = 0;
      }
    }
    this.clearNavigationAgent(npc);
  }

  private releaseCapturesForTarget(targetId: string) {
    for (const npc of this.npcs) {
      if (npc.capture?.targetId === targetId) {
        this.releaseCaptureImmediately(npc);
      }
    }
  }

  private releaseCaptureImmediately(npc: NpcRuntime) {
    npc.capture = null;
    npc.breakawayRemainingSeconds = 0;
    npc.breakawayDestination = null;
    this.clearTarget(npc);
  }

  private finishScriptedStateChange(npc: NpcRuntime) {
    this.clearNpcCommand(npc, false);
    this.removePendingRequestsForNpc(npc.id);
    npc.stateSnapshot = npc.stateSystem.getSnapshot();
    this.assignTargetSelectionPersonality(
      npc,
      npc.stateSnapshot.state
    );
    npc.lastState = npc.stateSnapshot.state;
    this.synchronizeSpriteVisual(npc);
    this.clearNavigationAgent(npc);
    npc.wanderDestination = null;
    npc.wanderWaitSeconds = 0;
    npc.alarmTargetQueue.length = 0;
    npc.capture = null;
    npc.breakawayRemainingSeconds = 0;
    npc.breakawayDestination = null;
    this.clearTarget(npc);
    this.releaseCapturesForTarget(npc.id);
  }

  private applySpriteVisualState(npc: NpcRuntime) {
    const snapshot = npc.stateSnapshot;
    npc.visual.setState(
      snapshot.state,
      npc.command.temporaryGunActive
    );
    npc.sprite.color.a = 1;
  }

  private synchronizeSpriteVisual(npc: NpcRuntime) {
    this.applySpriteVisualState(npc);
    npc.visual.syncPresentation();
  }

  private synchronizeSpritePosition(npc: NpcRuntime) {
    npc.sprite.position.copyFrom(npc.footPosition);
    npc.sprite.position.y += npc.visual.height / 2;
    npc.visual.syncPresentation();
  }

  private finishFrame(
    threatenedIds: ReadonlySet<string>,
    visibleNpcs: readonly NpcRuntime[],
    frameNpcTargets: MutableNpcTargetSnapshot[]
  ) {
    for (const npc of visibleNpcs) {
      this.synchronizeSpritePosition(npc);
    }

    for (let index = 0; index < visibleNpcs.length; index += 1) {
      const npc = visibleNpcs[index];
      const target = frameNpcTargets[index];
      if (target.id !== npc.id) {
        throw new Error(
          `NPC frame snapshotの並びが一致しません: ${target.id}/${npc.id}`
        );
      }
      const state = npc.stateSnapshot.state;
      target.footPosition.copyFrom(npc.footPosition);
      target.aimPosition.copyFrom(npc.footPosition);
      target.aimPosition.y += NPC_SPRITE_CENTER_HEIGHT;
      target.hitShape.center.copyFrom(target.aimPosition);
      target.state = state;
      target.alive = isV2AliveState(state);
      target.brainwashed = isV2BrainwashState(state);
      freezeNpcTargetSnapshot(target);
    }

    const targets: readonly V2HumanTargetSnapshot[] =
      Object.freeze(frameNpcTargets);
    this.frameView = this.buildFrameViewFromTargets(
      visibleNpcs,
      targets,
      Object.freeze([...threatenedIds])
    );
  }

  private rebuildFrameViewPreservingThreats(): void {
    this.frameView = this.buildFrameView(
      this.frameView.threatenedTargetIds
    );
  }

  private buildFrameView(
    threatenedTargetIds: readonly string[]
  ): V2NpcFrameView {
    const visibleNpcs: NpcRuntime[] = [];
    const targets: V2HumanTargetSnapshot[] = [];
    for (const npc of this.npcs) {
      if (!npc.sprite.isVisible) {
        continue;
      }
      visibleNpcs.push(npc);
      targets.push(createNpcTargetSnapshot(npc));
    }
    return this.buildFrameViewFromTargets(
      visibleNpcs,
      Object.freeze(targets),
      threatenedTargetIds
    );
  }

  private buildFrameViewFromTargets(
    visibleNpcs: readonly NpcRuntime[],
    targets: readonly V2HumanTargetSnapshot[],
    threatenedTargetIds: readonly string[]
  ): V2NpcFrameView {
    if (this.diagnosticsEnabled) {
      this.frameViewBuildSequence += 1;
    }
    let actorSpheres: readonly V2ActorSphere[] | null = null;
    const tracking: V2NpcTrackingSnapshot[] = [];
    const captures: V2NpcCaptureSnapshot[] = [];
    let areaPursuitCount = 0;
    let coarsePursuitCount = 0;
    let detailPursuitCount = 0;
    for (const npc of visibleNpcs) {
      if (npc.targetId !== null) {
        if (npc.pursuitPhase === "area") {
          areaPursuitCount += 1;
        } else if (npc.pursuitPhase === "coarse") {
          coarsePursuitCount += 1;
        } else {
          detailPursuitCount += 1;
        }
      }
      tracking.push(
        Object.freeze({
          npcId: npc.id,
          targetId: npc.targetId,
          provenance: npc.targetProvenance,
          targetSelectionPersonality:
            npc.targetSelectionPersonality,
          alertLeaderId: npc.alertLeaderId,
          alertRemainingSeconds: npc.alertRemainingSeconds,
          commandMode: npc.command.mode,
          temporaryGunActive: npc.command.temporaryGunActive,
          followerFirePhase: npc.command.followerFirePhase,
          traversalState: cloneV2NpcTraversalState(
            npc.traversalState
          ),
          pursuitPhase: npc.pursuitPhase,
          evadeThreatIds: Object.freeze(
            npc.evadeThreatSetKey.length === 0
              ? []
              : npc.evadeThreatSetKey.split("\u0000")
          )
        })
      );
      if (npc.capture) {
        captures.push(
          Object.freeze({
            npcId: npc.id,
            targetId: npc.capture.targetId,
            remainingSeconds: npc.capture.remainingSeconds
          })
        );
      }
    }
    return Object.freeze({
      targets,
      get actorSpheres() {
        if (actorSpheres === null) {
          const spheres: V2ActorSphere[] = [];
          for (const target of targets) {
            spheres.push(
              Object.freeze({
                id: target.id,
                kind: "npc" as const,
                center: target.aimPosition.clone(),
                radius: NPC_COLLISION_RADIUS
              })
            );
          }
          actorSpheres = Object.freeze(spheres);
        }
        return actorSpheres;
      },
      tracking: Object.freeze(tracking),
      captures: Object.freeze(captures),
      threatenedTargetIds,
      pathRecalculationCount: this.pathRecalculationCount,
      waitingForPathCount: this.waitingForPathCount,
      areaPursuitCount,
      coarsePursuitCount,
      detailPursuitCount,
      pursuitPromotionCount: this.pursuitPromotionCount,
      pursuitDemotionCount: this.pursuitDemotionCount,
      replanQueuedCount: this.npcs.reduce(
        (count, npc) =>
          count +
          (npc.navigationReplanRequestedAtSeconds === null ||
            !this.canExecuteNavigationReplan(npc)
            ? 0
            : 1),
        0
      ),
      replanCoalescedCount: this.replanCoalescedCount,
      replanMaximumWaitSeconds: this.replanMaximumWaitSeconds,
      currentTargetSightCheckCount:
        this.currentTargetSightCheckCount,
      personalityRetargetQueryCount:
        this.personalityRetargetQueryCount,
      sightRayCount: this.sightRayCount,
      autonomousVisualTargetChangeCount:
        this.autonomousVisualTargetChangeCount,
      forcedTargetChangeCount: this.forcedTargetChangeCount,
      autonomousThreatSightCheckCount:
        this.autonomousThreatSightCheckCount,
      autonomousThreatVisibleCount:
        this.autonomousThreatVisibleCount,
      autonomousThreatMaximumSourceCount:
        this.autonomousThreatMaximumSourceCount,
      frameViewBuildSequence: this.frameViewBuildSequence
    });
  }

  private pickInitialBrainwashedState(): V2CharacterState {
    const roll = this.nextRandom();
    if (roll < NPC_INITIAL_GUN_CHANCE) {
      return "brainwash-complete-gun";
    }
    if (roll < NPC_INITIAL_GUN_CHANCE + NPC_INITIAL_NO_GUN_CHANCE) {
      return "brainwash-complete-no-gun";
    }
    return "brainwash-complete-haigure";
  }

  private nextRandom() {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `randomは0以上1未満の有限値を返す必要があります: ${value}`
      );
    }
    return value;
  }

  private nextWanderWait() {
    return (
      NPC_WANDER_WAIT_MIN_SECONDS +
      this.nextRandom() *
        (NPC_WANDER_WAIT_MAX_SECONDS - NPC_WANDER_WAIT_MIN_SECONDS)
    );
  }

  private nextFireInterval() {
    return (
      V2_NPC_GUN_INTERVAL_MIN_SECONDS +
      this.nextRandom() *
        (V2_NPC_GUN_INTERVAL_MAX_SECONDS -
          V2_NPC_GUN_INTERVAL_MIN_SECONDS)
    );
  }

  private nextInitialGunCooldown() {
    return this.nextFireInterval() * this.nextRandom();
  }

  private createWanderDestination(
    npc: NpcRuntime,
    playerTarget: V2HumanTargetSnapshot
  ) {
    const origin = npc.navigationLocation;
    for (let attempt = 0; attempt < NPC_WANDER_MAX_ATTEMPTS; attempt += 1) {
      const angle = this.nextRandom() * Math.PI * 2;
      const distance = Math.sqrt(this.nextRandom()) * NPC_WANDER_RADIUS;
      const candidate = new Vector3(
        origin.position.x + Math.cos(angle) * distance,
        origin.position.y,
        origin.position.z + Math.sin(angle) * distance
      );
      const projected = this.stage.navigation.constrainMovement(
        origin,
        candidate
      );
      if (
        projected &&
        Vector3.Distance(projected.position, candidate) <=
          NAVIGATION_PROJECTION_MAX_DISTANCE
      ) {
        const areaId = npc.pursuitActorAreaCursor.areaId;
        const key =
          `wander:${npc.id}:${npc.navigationGoalRevision}:` +
          `${attempt}:${projected.position.x.toPrecision(17)}:` +
          `${projected.position.y.toPrecision(17)}:` +
          `${projected.position.z.toPrecision(17)}`;
        const restSlot = this.selectRestSlot(
          npc,
          projected.position,
          areaId,
          key,
          playerTarget,
          0,
          Number.POSITIVE_INFINITY
        );
        if (restSlot) {
          return restSlot;
        }
      }
    }
    return null;
  }

  private requireDoorTraversalState(
    npc: NpcRuntime,
    kind: "waiting-door-open" | "passing-door",
    doorId: string
  ) {
    const state = npc.traversalState;
    if (state.kind !== kind || state.doorId !== doorId) {
      throw new Error(
        `NPC扉traversal結果が現在状態と一致しません: ${npc.id}/${kind}/${doorId}`
      );
    }
  }

  private removePendingTraversalRequestsForNpc(npcId: string) {
    for (
      let index = this.pendingTraversalRequests.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (this.pendingTraversalRequests[index].npcId === npcId) {
        this.pendingTraversalRequests.splice(index, 1);
      }
    }
  }

  private requireElevatorTraversalIdentity(
    npc: NpcRuntime,
    result: Extract<V2NpcTraversalResult, { linkId: string }>
  ) {
    const state = npc.traversalState;
    if (
      !isV2NpcElevatorTraversalState(state) ||
      state.linkId !== result.linkId ||
      state.from !== result.from ||
      state.to !== result.to
    ) {
      throw new Error(
        `NPCエレベーターtraversal結果が現在状態と一致しません: ${npc.id}/${result.linkId}`
      );
    }
    const transition = npc.pendingNavigationTransition;
    if (
      !transition ||
      transition.link.id !== result.linkId ||
      transition.from !== result.from ||
      transition.to !== result.to
    ) {
      throw new Error(
        `NPCエレベーターtransitionが結果と一致しません: ${npc.id}/${result.linkId}`
      );
    }
  }

  private requireElevatorTraversalKind(
    npc: NpcRuntime,
    kind:
      | "waiting-elevator-call"
      | "waiting-elevator-call-input"
      | "moving-to-elevator-wait"
      | "approaching-elevator-board"
      | "waiting-elevator-board"
      | "riding-elevator"
      | "leaving-elevator"
  ) {
    if (npc.traversalState.kind !== kind) {
      throw new Error(
        `NPCエレベーターtraversal状態が一致しません: ${npc.id}/${kind}`
      );
    }
  }

  private requireNpc(npcId: string) {
    const npc = this.npcsById.get(npcId);
    if (!npc) {
      throw new Error(`未登録のV2 NPC IDです: ${npcId}`);
    }
    return npc;
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("V2NpcSystemは破棄済みです。");
    }
  }
}

export const createV2NpcSystem = (
  options: V2NpcSystemOptions
): V2NpcSystem => new SchoolV2NpcSystem(options);
