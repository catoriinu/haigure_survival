import {
  Color3,
  Color4,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";

import {
  createBitFlightAgent,
  type BitFlightAgent,
  type BitFlightAgentState
} from "../world/bitFlightAgent";
import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  getBitFlightWorldPosition,
  type BitFlightBandId,
  type BitFlightBand,
  type BitFlightBandRef,
  type BitFlightHeightMode,
  type BitFlightLocation,
  type BitFlightRoute,
  type BitFlightRoutePolicy,
  type BitFlightRouteStep,
  type BitFlightTransitionKind,
  type BitFlightZoneId,
  type BitFlightTransitionTraversal
} from "../world/bitFlightNavigation";
import {
  BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS,
  createBitFlightSafety,
  type BitFlightSafety
} from "../world/bitFlightSafety";
import {
  BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS,
  createBitFlightEscapeRoutePolicy,
  createBitFlightExplorationHistory,
  createBitFlightSearchRoutePolicy,
  createBitFlightTransitionHistory,
  type BitFlightExplorationSample,
  type BitFlightExplorationHistory,
  type BitFlightTransitionHistory
} from "../world/bitFlightTactics";
import {
  createNavigationSurfaceVolumeSampler
} from "../world/navigationSurfaceVolumeSampler";
import type {
  StagePlayerSpawn,
  StageSpatialContext
} from "../world/stageSpatialContext";
import type { StageNavigationAreaCursor } from "../world/stageNavigationAreas";
import {
  createStageBoundaryContainsQuery,
  type StageVolume
} from "../world/stageSpatialQueries";
import type {
  V2ActorSphere,
  V2AlertRequest,
  V2BeamRequest,
  V2ExternalAlert,
  V2HumanTargetSnapshot,
  V2TargetSelectionPersonality,
  V2TargetProvenance
} from "./combatTypes";
import {
  isV2HitState,
  selectV2TargetSelectionPersonality
} from "./combatTypes";
import type {
  V2PursuitPhase,
  V2TargetNavigationAreaSnapshot
} from "./pursuitNavigation";
import {
  V2_BIT_ALERT_DURATION_SECONDS,
  V2_BIT_ATTACK_COOLDOWN_SECONDS,
  V2_BIT_CARPET_PASS_DURATION_SECONDS,
  V2_BIT_CHASE_DURATION_SECONDS,
  V2_BIT_FIRE_TELEGRAPH_SECONDS,
  V2_BIT_FIXED_DURATION_SECONDS,
  V2_BIT_RANDOM_DURATION_SECONDS,
  V2_BIT_RED_HOLD_SECONDS,
  V2_STANDARD_BIT_COMBAT_PROFILE,
  createV2BitCombatProfile,
  randomV2BitFireInterval,
  selectV2BitCombatMode,
  selectV2BitPostAlertMode,
  type V2BitCombatMode,
  type V2BitCombatProfile,
  type V2BitPostAlertMode
} from "./bitCombatProfile";
import { createV2HumanTargetSpatialIndex } from "./humanTargetSpatialIndex";

const BIT_BODY_HEIGHT = 0.15;
const BIT_BODY_DIAMETER = 0.12;
const BIT_MUZZLE_DIAMETER = 0.03;
const BIT_MUZZLE_OFFSET = BIT_BODY_HEIGHT / 2 + 0.02;
const BIT_ACTOR_RADIUS = BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS;
const BIT_SPAWN_FADE_SECONDS = 0.5;
const BIT_SPAWN_HOLD_SECONDS = 0.5;
const BIT_SPAWN_SHRINK_SECONDS = 0.5;
const BIT_SPAWN_SPHERE_START_DIAMETER = 0.22;
const BIT_SPAWN_SPHERE_END_DIAMETER = 0.04;
const BIT_SPAWN_SPHERE_END_SCALE =
  BIT_SPAWN_SPHERE_END_DIAMETER /
  BIT_SPAWN_SPHERE_START_DIAMETER;

const PROFILE_SEARCH_SPEED_REFERENCE = 0.25;
const NORMAL_PATROL_SPEED = 0.3;
const SEARCH_VERTICAL_SPEED = 0.06;
const NORMAL_PATROL_RADIUS = 3;
const RANDOM_ATTACK_SEARCH_RADIUS = 2.4;
const SEARCH_RETRY_SECONDS = 0.5;
const RANDOM_ATTACK_ROUTE_SECONDS_MIN = 1.2;
const RANDOM_ATTACK_ROUTE_SECONDS_MAX = 2.4;
const NORMAL_PATROL_CANDIDATE_COUNT = 4;
const NORMAL_PATROL_ROUTE_CANDIDATE_LIMIT = 3;
const NORMAL_PATROL_MINIMUM_HORIZONTAL_DISTANCE = 1.2;
const NORMAL_PATROL_RESERVATION_RADIUS = 1;
const NORMAL_PATROL_REVERSE_PENALTY = 2;
const SEARCH_TRANSITION_CHANCE = 0.25;
const SEARCH_NEAR_TRANSITION_DISTANCE = 0.75;
const SEARCH_TRANSITION_CANDIDATE_LIMIT = 1;
const SEARCH_TRANSITION_FORCE_AFTER_SURFACE_PLANS = 3;
const SEARCH_ROUTE_PLAN_BUDGET_PER_UPDATE = 4;
const CHASE_ROUTE_PLAN_BUDGET_PER_UPDATE = 4;
const ESCAPE_ROUTE_PLAN_BUDGET_PER_UPDATE = 3;
const SEARCH_OBSERVATION_INTERVAL_SECONDS = 1;
const SEARCH_OBSERVATION_RADIUS = 0.8;
const SEARCH_EXPLORED_DESTINATION_PENALTY = 1.5;
const SEARCH_ORDINARY_TRANSITION_PENALTY = 0.4;
const BRUTE_FORCE_START_SECONDS = 40;
const BRUTE_FORCE_CHECK_INTERVAL_SECONDS = 10;
const BRUTE_FORCE_START_CHANCE = 0.25;
const BRUTE_FORCE_LOCAL_CANDIDATE_COUNT = 3;
const BRUTE_FORCE_FRONTIER_CANDIDATE_COUNT = 1;
const BRUTE_FORCE_TRANSITION_CANDIDATE_COUNT = 1;
const BRUTE_FORCE_SURFACE_ROUTE_CANDIDATE_LIMIT = 3;
const BRUTE_FORCE_FRONTIER_STEP = 1;
const BRUTE_FORCE_FRONTIER_DIAGONAL_STEP =
  BRUTE_FORCE_FRONTIER_STEP * Math.SQRT1_2;
const BRUTE_FORCE_FRONTIER_OFFSETS = Object.freeze([
  new Vector3(BRUTE_FORCE_FRONTIER_STEP, 0, 0),
  new Vector3(-BRUTE_FORCE_FRONTIER_STEP, 0, 0),
  new Vector3(0, 0, BRUTE_FORCE_FRONTIER_STEP),
  new Vector3(0, 0, -BRUTE_FORCE_FRONTIER_STEP),
  new Vector3(
    BRUTE_FORCE_FRONTIER_DIAGONAL_STEP,
    0,
    BRUTE_FORCE_FRONTIER_DIAGONAL_STEP
  ),
  new Vector3(
    -BRUTE_FORCE_FRONTIER_DIAGONAL_STEP,
    0,
    BRUTE_FORCE_FRONTIER_DIAGONAL_STEP
  ),
  new Vector3(
    BRUTE_FORCE_FRONTIER_DIAGONAL_STEP,
    0,
    -BRUTE_FORCE_FRONTIER_DIAGONAL_STEP
  ),
  new Vector3(
    -BRUTE_FORCE_FRONTIER_DIAGONAL_STEP,
    0,
    -BRUTE_FORCE_FRONTIER_DIAGONAL_STEP
  )
]);
const TRANSITION_IMMEDIATE_RETURN_PENALTY = 8;
const TARGET_ROUTE_REFRESH_SECONDS = 0.5;
const TARGET_ROUTE_MOVE_THRESHOLD = 0.2;
const TARGET_BAND_VERTICAL_TOLERANCE = 0.1;
const TARGET_BAND_PROJECTION_TOLERANCE = 0.01;
const TARGET_LOCATION_CANDIDATE_CACHE_MAX_ENTRIES = 4_096;
export const V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES = 4_096;
const TARGET_SIGHT_CHECK_INTERVAL_SECONDS = 0.2;
const TARGET_SIGHT_CHECK_MAXIMUM_PER_UPDATE = 20;
const TARGET_PERSONALITY_RETARGET_INTERVAL_SECONDS = 1;
const TARGET_PERSONALITY_RETARGET_MAXIMUM_PER_UPDATE = 4;
const TARGET_LOST_TIMEOUT_SECONDS = 18;
const TARGET_LOST_DISTANCE_MARGIN = 0.5;
const CHASE_WINDOW_CONGESTION_COST = 0.75;
const CHASE_WINDOW_FAILURE_COST = 6;
const CHASE_WINDOW_FAILURE_PENALTY_SECONDS = 3;
const ESCAPE_DESIRED_DISTANCE_GAIN = 0.8;
const ESCAPE_VISIBLE_DESTINATION_PENALTY = 2;
const ESCAPE_DISTANCE_GAIN_PENALTY = 2;
const FIRE_RANGE = 1.2;
const BEAM_SPEED = 1.58;
const BEAM_MAXIMUM_LIFETIME = 20;
const BOB_AMPLITUDE = 0.03;
const CARPET_FORMATION_SPACING = 0.25;
const CARPET_PROJECTION_TOLERANCE = 0.04;
const CARPET_WALL_COOLDOWN_SECONDS = 2.5;
const CARPET_TARGET_HEIGHT_OFFSET = 1.2;
const CARPET_HEIGHT_SPEED = 0.35;
const CARPET_AIM_SCATTER_RADIANS = 0.35;
const CARPET_TURN_RATE = Math.PI * 0.35;
const CARPET_STEER_STRENGTH = 0.18;
const CARPET_AIM_TURN_SECONDS = 1;
const CARPET_AIM_BLEND = 0.2;
const CARPET_FOLLOWER_FADE_SECONDS = 1;
const LEGACY_CARPET_MODE_CHANCE = 0.1;
const LEGACY_ALERT_CARPET_MODE_CHANCE = 0.2;
const ALERT_GATHER_TARGET_COUNT = 4;
const EXTERNAL_ALERT_RECEIVER_LIMIT = 4;
const ALERT_GATHER_RADIUS = 0.5;
const ALERT_SPAWN_RADIUS = 0.2;
const ALERT_SPAWN_MAX_ATTEMPTS = 8;
const LOCATION_PROJECTION_DISTANCE = 0.75;
const HEIGHT_PROBE_DISTANCE = 5;
const HEIGHT_SAMPLE_COUNT = 9;

const BIT_FLIGHT_AGENT_CONFIG = Object.freeze({
  waypointTolerance: 0.03
});

export type V2BitMode =
  | "search"
  | "chase"
  | "fixed"
  | "random"
  | "alert-send"
  | "alert-receive"
  | "hold"
  | "carpet-leader"
  | "carpet-follower";

const V2_BIT_MUZZLE_BLACK = new Color4(0, 0, 0, 1);
export const V2_BIT_MUZZLE_COLOR_BY_MODE = Object.freeze({
  search: V2_BIT_MUZZLE_BLACK,
  chase: new Color4(0.18, 0.9, 0.28, 1),
  fixed: new Color4(0.2, 0.9, 0.95, 1),
  random: new Color4(0.95, 0.85, 0.2, 1),
  "alert-send": new Color4(1, 0.6, 0.15, 1),
  "alert-receive": new Color4(0.2, 0.45, 1, 1),
  hold: new Color4(1, 1, 1, 1),
  "carpet-leader": new Color4(1, 0.25, 0.9, 1),
  "carpet-follower": new Color4(0.58, 0.25, 1, 1)
} satisfies Readonly<Record<V2BitMode, Color4>>);

export const resolveV2BitMuzzleColor = (
  mode: V2BitMode,
  modeMuzzleColorEnabled: boolean
): Color4 =>
  (modeMuzzleColorEnabled
    ? V2_BIT_MUZZLE_COLOR_BY_MODE[mode]
    : V2_BIT_MUZZLE_BLACK
  ).clone();

type V2BitSpawnPhase = "fade-in" | "hold" | "shrink" | "done";

export type V2BitSystemConfig = Readonly<{
  initialBitCount: number;
  reinforcementIntervalSeconds: number;
  maximumBitCount: number;
  minimumSpawnDistance: number;
  spawnMaxAttempts: number;
  spawnProjectionMaxDistance: number;
  combatEnabled: boolean;
  modeMuzzleColorEnabled: boolean;
  random: () => number;
  spawnRandom: () => number;
  playerSpawn: StagePlayerSpawn;
  resolveTargetNavigationArea: (
    target: V2HumanTargetSnapshot
  ) => V2TargetNavigationAreaSnapshot;
}>;

export type V2BitSystemUpdateInput = Readonly<{
  deltaSeconds: number;
  elapsedSeconds: number;
  targets: readonly V2HumanTargetSnapshot[];
  externalAlerts: readonly V2ExternalAlert[];
}>;

export type V2BitTargetState = Readonly<{
  bitId: string;
  mode: V2BitMode;
  isRed: boolean;
  statMultiplier: number;
  modeTimerSeconds: number;
  attackCooldownSeconds: number;
  carpetCooldownSeconds: number;
  targetSelectionPersonality: V2TargetSelectionPersonality;
  targetId: string | null;
  provenance: V2TargetProvenance | null;
  alertLeaderId: string | null;
}>;

export type V2BitPlacementAssignment = Readonly<{
  id: string;
  centerPosition: Vector3;
}>;

export type V2BitRoutePurpose = "search" | "chase" | "escape";

export type V2BitFlightState = Readonly<{
  bitId: string;
  zoneId: BitFlightZoneId | null;
  bandId: BitFlightBandId | null;
  position: Vector3;
  safeCenterHeight: number | null;
  heightMode: BitFlightHeightMode | null;
  routePurpose: V2BitRoutePurpose | null;
  activeTransition: Readonly<{
    id: string;
    kind: BitFlightTransitionKind;
    reversed: boolean;
  }> | null;
  agentState: BitFlightAgentState;
}>;

export type V2BitSystemDiagnostics = Readonly<{
  enabled: boolean;
  routePlans: Readonly<{
    search: number;
    chase: number;
    escape: number;
  }>;
  routePlanMilliseconds: Readonly<{
    search: number;
    chase: number;
    escape: number;
  }>;
  sightRays: number;
  currentTargetSightCheckCount: number;
  personalityRetargetQueryCount: number;
  autonomousVisualTargetChangeCount: number;
  forcedTargetChangeCount: number;
  sphereSweeps: number;
  sphereSweepMilliseconds: number;
  beamRequests: number;
  areaPursuitCount: number;
  detailPursuitCount: number;
  routeSafetyCache: V2BitRouteSafetyCacheDiagnostics;
}>;

export type V2BitRouteSafetyCacheEntryDiagnostics = Readonly<{
  size: number;
  hits: number;
  misses: number;
  recomputations: number;
  evictions: number;
}>;

export type V2BitRouteSafetyCacheDiagnostics = Readonly<{
  maximumEntriesPerMap: number;
  routeStepDescriptors: Readonly<{
    created: number;
    reused: number;
  }>;
  routeSteps: V2BitRouteSafetyCacheEntryDiagnostics;
  routeCenters: V2BitRouteSafetyCacheEntryDiagnostics;
  routeSegments: V2BitRouteSafetyCacheEntryDiagnostics;
  lowCeilingCruiseHeights: V2BitRouteSafetyCacheEntryDiagnostics;
}>;

export type V2BitFrameView = Readonly<{
  actorSpheres: readonly V2ActorSphere[];
  populationBitCount: number;
  beamRequests: readonly V2BeamRequest[];
  targetStates: readonly V2BitTargetState[];
  flightStates: readonly V2BitFlightState[];
  diagnostics: V2BitSystemDiagnostics;
}>;

type V2BitFlightStateSource = Readonly<{
  actor: V2ActorSphere;
  zoneId: BitFlightZoneId | null;
  bandId: BitFlightBandId | null;
  safeCenterHeight: number | null;
  heightMode: BitFlightHeightMode | null;
  routePurpose: V2BitRoutePurpose | null;
  activeTransitionId: string | null;
  activeTransitionKind: BitFlightTransitionKind | null;
  activeTransitionReversed: boolean;
  agentState: BitFlightAgentState;
}>;

export interface V2BitSystem {
  update(input: V2BitSystemUpdateInput): void;
  takeAlertRequests(): readonly V2AlertRequest[];
  getFrameView(): V2BitFrameView;
  setDiagnosticsEnabled(enabled: boolean): void;
  notifyBeamImpact(sourceId: string, targetId: string): boolean;
  prepareForScriptedPhase(): void;
  setAiSuspended(suspended: boolean): void;
  setHostileActionsSuspended(suspended: boolean): void;
  setVisible(visible: boolean): void;
  placeBits(assignments: readonly V2BitPlacementAssignment[]): void;
  relocateBit(bitId: string, candidates: readonly Vector3[]): Vector3;
  dispose(): void;
}

type ActiveAlert = {
  leaderId: string;
  targetId: string;
  remainingSeconds: number;
  receiverIds: Set<string>;
  gatheredIds: Set<string>;
  internalBitAlert: boolean;
};

type SearchRouteKind = "normal" | "random" | "brute-force";
type ChaseRouteUpdateState =
  | "moving"
  | "arrived"
  | "replan"
  | "unreachable";

type SearchSurfaceDestination = Readonly<{
  destination: BitFlightLocation;
  surfaceSpeed: number;
  isVertical: boolean;
}>;

type BruteForceRouteCandidate = SafeRouteInputCandidate<
  Readonly<{ surfaceSpeed: number }>
>;

type NormalPatrolLeg = SafeRouteCandidate<
  Readonly<{ surfaceSpeed: number }>
> &
  Readonly<{
  origin: BitFlightLocation;
  }>;

type RuntimeBit = {
  id: string;
  readonly populationKind: "normal" | "alert" | "carpet-follower";
  root: TransformNode;
  body: InstancedMesh;
  muzzle: InstancedMesh;
  profile: V2BitCombatProfile;
  flightAgent: BitFlightAgent;
  navigationLocation: BitFlightLocation | null;
  routePurpose: V2BitRoutePurpose | null;
  routeDestination: BitFlightLocation | null;
  activeRoute: BitFlightRoute | null;
  spatialReplanPending: boolean;
  routeRefreshSeconds: number;
  searchRouteKind: SearchRouteKind | null;
  normalPatrolOrigin: BitFlightLocation | null;
  queuedNormalPatrolLeg: NormalPatrolLeg | null;
  randomAttackRouteSeconds: number;
  searchSurfaceSpeed: number;
  searchRetrySeconds: number;
  hasAttemptedSearchRoute: boolean;
  searchTransitionCursor: number;
  searchSurfacePlansSinceTransitionAttempt: number;
  bruteForceActive: boolean;
  bruteForceNextCheckSeconds: number;
  bruteForcePhaseCursor: number;
  bruteForceFrontierCursor: number;
  bruteForceTransitionCursor: number;
  bruteForceFailedTransitionCandidateCount: number;
  lastExplorationRecordSeconds: number;
  transitionHistory: BitFlightTransitionHistory;
  activeTransition: BitFlightTransitionTraversal | null;
  bobPhase: number;
  mode: V2BitMode;
  renderedMuzzleColorMode: V2BitMode | null;
  targetSelectionPersonality: V2TargetSelectionPersonality;
  targetId: string | null;
  targetProvenance: V2TargetProvenance | null;
  visualSightCheckPriority: boolean;
  alertLeaderId: string | null;
  lastSeenAimPosition: Vector3 | null;
  lastSeenDestination: BitFlightLocation | null;
  lastChasePlanTargetId: string | null;
  pursuitPhase: V2PursuitPhase;
  pursuitTargetId: string | null;
  pursuitTargetAreaId: string | null;
  pursuitTargetAreaRevision: number;
  pursuitActorAreaCursor: StageNavigationAreaCursor | null;
  pursuitActorAreaPosition: Vector3 | null;
  pursuitAnchor: Vector3 | null;
  chaseWindowTransitionId: string | null;
  failedChaseWindowTransitionId: string | null;
  failedChaseWindowPenaltySeconds: number;
  pendingEscapeThreatPosition: Vector3 | null;
  sightTargetId: string | null;
  sightTargetVisible: boolean;
  personalityRetargetCooldownSeconds: number;
  targetLostSeconds: number;
  modeTimerSeconds: number;
  attackCooldownSeconds: number;
  carpetCooldownSeconds: number;
  fireSeconds: number;
  fireTelegraphSeconds: number;
  fireLockDirection: Vector3;
  lockedDirection: Vector3;
  postAlertMode: V2BitPostAlertMode | null;
  holdReturnMode: V2BitMode | null;
  holdTargetId: string | null;
  holdTimerSeconds: number;
  lastHoldTargetId: string | null;
  carpetPassSeconds: number;
  carpetLeaderId: string | null;
  carpetOffset: number;
  carpetAimStartDirection: Vector3;
  carpetAimSeconds: number;
  spawnPhase: V2BitSpawnPhase;
  spawnTimerSeconds: number;
  spawnEffect: Mesh | null;
  spawnEffectMaterial: StandardMaterial | null;
};

type FadingCarpetFollower = {
  root: TransformNode;
  body: InstancedMesh;
  muzzle: InstancedMesh;
  remainingSeconds: number;
};

type SpawnRegion = Readonly<{
  volume: StageVolume;
  band: BitFlightBand;
  contains: (point: Vector3) => boolean;
}>;

type SafeRouteCandidate<T> = Readonly<{
  value: T;
  destination: BitFlightLocation;
  route: BitFlightRoute;
  totalCost: number;
}>;

declare const SAFE_ROUTE_COST_BIAS: unique symbol;
type SafeRouteCostBias = number & {
  readonly [SAFE_ROUTE_COST_BIAS]: true;
};

const ZERO_SAFE_ROUTE_COST_BIAS = 0 as SafeRouteCostBias;

const measureHorizontalProjectionError = (
  projected: Vector3,
  original: Vector3
) =>
  Math.hypot(
    projected.x - original.x,
    projected.z - original.z
  ) as SafeRouteCostBias;

type SafeRouteInputCandidate<T> = Readonly<{
  value: T;
  destination: BitFlightLocation;
  /**
   * 実利用値は投影座標との差を表すMath.hypot、または0。
   * いずれも有限かつ非負であり、経路候補の順序付けにだけ加算する。
   */
  costBias: SafeRouteCostBias;
}>;

const assertNonNegativeInteger = (name: string, value: number) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name}には0以上の整数が必要です。`);
  }
};

const assertPositiveInteger = (name: string, value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}には1以上の整数が必要です。`);
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

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const assertConfig = (config: V2BitSystemConfig) => {
  assertNonNegativeInteger("initialBitCount", config.initialBitCount);
  assertNonNegativeInteger("maximumBitCount", config.maximumBitCount);
  if (config.initialBitCount > config.maximumBitCount) {
    throw new Error("initialBitCountはmaximumBitCount以下が必要です。");
  }
  assertPositiveFiniteNumber(
    "reinforcementIntervalSeconds",
    config.reinforcementIntervalSeconds
  );
  assertNonNegativeFiniteNumber(
    "minimumSpawnDistance",
    config.minimumSpawnDistance
  );
  assertPositiveInteger("spawnMaxAttempts", config.spawnMaxAttempts);
  assertPositiveFiniteNumber(
    "spawnProjectionMaxDistance",
    config.spawnProjectionMaxDistance
  );
  if (typeof config.combatEnabled !== "boolean") {
    throw new Error("combatEnabledにはbooleanが必要です。");
  }
  if (typeof config.modeMuzzleColorEnabled !== "boolean") {
    throw new Error("modeMuzzleColorEnabledにはbooleanが必要です。");
  }
  if (typeof config.random !== "function") {
    throw new Error("randomには0以上1未満を返す関数が必要です。");
  }
  if (typeof config.spawnRandom !== "function") {
    throw new Error("spawnRandomには0以上1未満を返す関数が必要です。");
  }
  if (typeof config.resolveTargetNavigationArea !== "function") {
    throw new Error(
      "resolveTargetNavigationAreaには標的Area snapshot解決関数が必要です。"
    );
  }
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const sameBand = (
  left: BitFlightBandRef,
  right: BitFlightBandRef
) => left.zoneId === right.zoneId && left.bandId === right.bandId;

const cloneTargetLocation = (location: BitFlightLocation) => location;

const getTraversalEntryPosition = (
  traversal: BitFlightTransitionTraversal
) =>
  traversal.reversed
    ? traversal.transition.toPosition
    : traversal.transition.fromPosition;

const getTraversalDestinationPosition = (
  traversal: BitFlightTransitionTraversal
) =>
  traversal.reversed
    ? traversal.transition.fromPosition
    : traversal.transition.toPosition;

const getTraversalEntryEvaluationPosition = (
  traversal: BitFlightTransitionTraversal,
  origin: Vector3
) => {
  const entry = getTraversalEntryPosition(traversal);
  const region = traversal.transition.region;
  if (traversal.transition.kind !== "vertical" || !region) {
    return entry;
  }
  return new Vector3(
    clamp(origin.x, region.minimum.x, region.maximum.x),
    entry.y,
    clamp(origin.z, region.minimum.z, region.maximum.z)
  );
};

const createSharedMaterials = (scene: Scene) => {
  let body: StandardMaterial | null = null;
  let redBody: StandardMaterial | null = null;
  let muzzle: StandardMaterial | null = null;
  try {
    body = new StandardMaterial("v2BitBodyMaterial", scene);
    body.diffuseColor = new Color3(0.08, 0.08, 0.09);
    body.specularColor = new Color3(0.35, 0.35, 0.4);

    redBody = new StandardMaterial("v2RedBitBodyMaterial", scene);
    redBody.diffuseColor = new Color3(0.72, 0.04, 0.06);
    redBody.emissiveColor = new Color3(0.24, 0.01, 0.01);
    redBody.specularColor = new Color3(0.55, 0.18, 0.18);

    muzzle = new StandardMaterial("v2BitMuzzleMaterial", scene);
    muzzle.diffuseColor = Color3.White();
    muzzle.emissiveColor = Color3.Black();
    muzzle.specularColor = Color3.Black();

    return { body, redBody, muzzle };
  } catch (error) {
    muzzle?.dispose();
    redBody?.dispose();
    body?.dispose();
    throw error;
  }
};

const createSharedVisualSources = (
  scene: Scene,
  materials: Readonly<{
    body: StandardMaterial;
    redBody: StandardMaterial;
    muzzle: StandardMaterial;
  }>
) => {
  let body: Mesh | null = null;
  let redBody: Mesh | null = null;
  let muzzle: Mesh | null = null;
  try {
    body = MeshBuilder.CreateCylinder(
      "v2BitBodySource",
      {
        diameterTop: 0,
        diameterBottom: BIT_BODY_DIAMETER,
        height: BIT_BODY_HEIGHT,
        tessellation: 24
      },
      scene
    );
    body.rotation.x = Math.PI / 2;
    body.material = materials.body;
    body.isPickable = false;
    body.isVisible = false;
    body.hasVertexAlpha = true;
    body.registerInstancedBuffer("color", 4);

    redBody = new Mesh("v2RedBitBodySource", scene);
    body.geometry!.applyToMesh(redBody);
    redBody.rotation.x = Math.PI / 2;
    redBody.material = materials.redBody;
    redBody.isPickable = false;
    redBody.isVisible = false;
    redBody.hasVertexAlpha = true;
    redBody.registerInstancedBuffer("color", 4);

    muzzle = MeshBuilder.CreateSphere(
      "v2BitMuzzleSource",
      { diameter: BIT_MUZZLE_DIAMETER, segments: 16 },
      scene
    );
    muzzle.position.z = BIT_MUZZLE_OFFSET;
    muzzle.material = materials.muzzle;
    muzzle.isPickable = false;
    muzzle.isVisible = false;
    muzzle.hasVertexAlpha = true;
    muzzle.registerInstancedBuffer("color", 4);

    return Object.freeze({ body, redBody, muzzle });
  } catch (error) {
    muzzle?.dispose(false, false);
    redBody?.dispose(false, false);
    body?.dispose(false, false);
    throw error;
  }
};

const createBitSpawnVisual = (
  scene: Scene,
  root: TransformNode,
  id: string,
  blackBodyMaterial: StandardMaterial
) => {
  let effect: Mesh | null = null;
  let material: StandardMaterial | null = null;
  try {
    effect = MeshBuilder.CreateSphere(
      `${id}_spawn`,
      {
        diameter: BIT_SPAWN_SPHERE_START_DIAMETER,
        segments: 24
      },
      scene
    );
    effect.parent = root;
    effect.isPickable = false;

    material = new StandardMaterial(`${id}_spawn_material`, scene);
    material.diffuseColor.copyFrom(blackBodyMaterial.diffuseColor);
    material.emissiveColor.copyFrom(blackBodyMaterial.emissiveColor);
    material.specularColor.copyFrom(blackBodyMaterial.specularColor);
    material.alpha = 0;
    effect.material = material;
    return { effect, material };
  } catch (error) {
    effect?.dispose(false, false);
    material?.dispose();
    throw error;
  }
};

const createBitVisual = (
  scene: Scene,
  sources: Readonly<{
    body: Mesh;
    redBody: Mesh;
    muzzle: Mesh;
  }>,
  blackBodyMaterial: StandardMaterial,
  id: string,
  isRed: boolean
) => {
  let root: TransformNode | null = null;
  let body: InstancedMesh | null = null;
  let muzzle: InstancedMesh | null = null;
  let spawnEffect: Mesh | null = null;
  let spawnEffectMaterial: StandardMaterial | null = null;
  try {
    root = new TransformNode(id, scene);
    body = (isRed ? sources.redBody : sources.body).createInstance(
      `${id}_body`
    );
    body.parent = root;
    body.isPickable = false;
    body.isVisible = false;
    body.scaling.set(0, 0, 0);
    body.instancedBuffers.color = new Color4(1, 1, 1, 1);

    muzzle = sources.muzzle.createInstance(`${id}_muzzle`);
    muzzle.parent = root;
    muzzle.isPickable = false;
    muzzle.isVisible = false;
    muzzle.scaling.set(0, 0, 0);

    const spawnVisual = createBitSpawnVisual(
      scene,
      root,
      id,
      blackBodyMaterial
    );
    spawnEffect = spawnVisual.effect;
    spawnEffectMaterial = spawnVisual.material;

    return {
      root,
      body,
      muzzle,
      spawnEffect,
      spawnEffectMaterial
    };
  } catch (error) {
    spawnEffect?.dispose(false, false);
    spawnEffectMaterial?.dispose();
    muzzle?.dispose(false, false);
    body?.dispose(false, false);
    root?.dispose(false);
    throw error;
  }
};

const isBitSpawnPending = (bit: RuntimeBit) =>
  bit.spawnPhase !== "done";

const disposeBitSpawnVisual = (bit: RuntimeBit) => {
  if (bit.spawnEffect !== null) {
    bit.spawnEffect.dispose(false, false);
    bit.spawnEffect = null;
  }
  if (bit.spawnEffectMaterial !== null) {
    bit.spawnEffectMaterial.dispose();
    bit.spawnEffectMaterial = null;
  }
};

const finalizeBitSpawnVisual = (bit: RuntimeBit) => {
  if (bit.spawnPhase === "done") {
    return;
  }
  disposeBitSpawnVisual(bit);
  bit.spawnPhase = "done";
  bit.spawnTimerSeconds = 0;
  bit.body.isVisible = true;
  bit.body.scaling.set(1, 1, 1);
  bit.muzzle.isVisible = true;
  bit.muzzle.scaling.set(1, 1, 1);
};

const updateBitSpawnVisual = (bit: RuntimeBit, deltaSeconds: number) => {
  bit.spawnTimerSeconds += deltaSeconds;
  if (bit.spawnPhase === "fade-in") {
    const progress = Math.min(
      1,
      bit.spawnTimerSeconds / BIT_SPAWN_FADE_SECONDS
    );
    bit.spawnEffectMaterial!.alpha = progress;
    if (progress === 1) {
      bit.spawnPhase = "hold";
      bit.spawnTimerSeconds = 0;
      bit.body.isVisible = true;
      bit.body.scaling.set(1, 1, 1);
    }
    return;
  }
  if (bit.spawnPhase === "hold") {
    if (bit.spawnTimerSeconds >= BIT_SPAWN_HOLD_SECONDS) {
      bit.spawnPhase = "shrink";
      bit.spawnTimerSeconds = 0;
    }
    return;
  }
  const progress = Math.min(
    1,
    bit.spawnTimerSeconds / BIT_SPAWN_SHRINK_SECONDS
  );
  const sphereScale =
    1 - (1 - BIT_SPAWN_SPHERE_END_SCALE) * progress;
  bit.spawnEffect!.scaling.set(
    sphereScale,
    sphereScale,
    sphereScale
  );
  bit.spawnEffect!.position.z = BIT_MUZZLE_OFFSET * progress;
  if (progress === 1) {
    bit.muzzle.isVisible = true;
    bit.muzzle.scaling.set(1, 1, 1);
    bit.spawnPhase = "done";
    bit.spawnTimerSeconds = 0;
    disposeBitSpawnVisual(bit);
  }
};

const normalizeHorizontal = (direction: Vector3) => {
  const horizontal = new Vector3(direction.x, 0, direction.z);
  return horizontal.lengthSquared() > 0
    ? horizontal.normalize()
    : Vector3.Forward();
};

const routeContainsTransition = (route: BitFlightRoute) =>
  route.steps.some((step) => step.kind === "transition");

const getFirstWindowAccessTransitionId = (
  route: BitFlightRoute
) => {
  const step = route.steps.find(
    (step) =>
      step.kind === "transition" &&
      step.traversal.transition.affordances.includes(
        "window-access"
      )
  );
  return step?.kind === "transition"
    ? step.traversal.transition.id
    : null;
};

const getRouteStepPositions = (step: BitFlightRouteStep) =>
  step.kind === "surface"
    ? Object.freeze(step.points.map(getBitFlightWorldPosition))
    : step.points;

const createRouteSafetyPointKey = (point: Vector3) =>
  JSON.stringify([point.x, point.y, point.z]);

type RouteStepSafetyDescriptor = Readonly<{
  points: readonly Vector3[];
  key: string;
  centerKey: string | null;
  segmentKeys: readonly (string | null)[];
}>;

const createRouteSafetySegmentKeyFromPointKeys = (
  fromKey: string,
  toKey: string
) =>
  fromKey < toKey
    ? `${fromKey}|${toKey}`
    : `${toKey}|${fromKey}`;

const createRouteStepSafetyDescriptor = (
  step: BitFlightRouteStep,
  routePoints: readonly Vector3[] = getRouteStepPositions(step)
): RouteStepSafetyDescriptor => {
  const points = routePoints;
  const pointKeys = Object.freeze(
    points.map(createRouteSafetyPointKey)
  );
  const forwardPointsKey = pointKeys.join("|");
  const reversePointsKey = [...pointKeys].reverse().join("|");
  const geometryKey =
    forwardPointsKey < reversePointsKey
      ? forwardPointsKey
      : reversePointsKey;
  return Object.freeze({
    points,
    key:
      `${step.kind}|` +
      (step.kind === "surface"
        ? `${step.band.zoneId}|${step.band.bandId}|`
        : `${step.traversal.transition.id}|`) +
      geometryKey,
    centerKey: pointKeys[0] ?? null,
    segmentKeys: Object.freeze(
      points.slice(1).map((to, index) => {
        const from = points[index];
        return from.equals(to)
          ? null
          : createRouteSafetySegmentKeyFromPointKeys(
              pointKeys[index],
              pointKeys[index + 1]
            );
      })
    )
  });
};

type MutableRouteSafetyCacheEntryDiagnostics = {
  hits: number;
  misses: number;
  recomputations: number;
  evictions: number;
};

const createMutableRouteSafetyCacheEntryDiagnostics =
  (): MutableRouteSafetyCacheEntryDiagnostics => ({
    hits: 0,
    misses: 0,
    recomputations: 0,
    evictions: 0
  });

const EMPTY_ROUTE_SAFETY_CACHE_ENTRY_DIAGNOSTICS =
  Object.freeze<V2BitRouteSafetyCacheEntryDiagnostics>({
    size: 0,
    hits: 0,
    misses: 0,
    recomputations: 0,
    evictions: 0
  });

const EMPTY_ROUTE_SAFETY_CACHE_DIAGNOSTICS =
  Object.freeze<V2BitRouteSafetyCacheDiagnostics>({
    maximumEntriesPerMap: V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES,
    routeStepDescriptors: Object.freeze({
      created: 0,
      reused: 0
    }),
    routeSteps: EMPTY_ROUTE_SAFETY_CACHE_ENTRY_DIAGNOSTICS,
    routeCenters: EMPTY_ROUTE_SAFETY_CACHE_ENTRY_DIAGNOSTICS,
    routeSegments: EMPTY_ROUTE_SAFETY_CACHE_ENTRY_DIAGNOSTICS,
    lowCeilingCruiseHeights:
      EMPTY_ROUTE_SAFETY_CACHE_ENTRY_DIAGNOSTICS
  });

export const createV2BitSystem = (
  scene: Scene,
  spatial: StageSpatialContext,
  config: V2BitSystemConfig
): V2BitSystem => {
  assertConfig(config);

  let diagnosticsEnabled = false;
  let diagnosticSearchRoutePlans = 0;
  let diagnosticChaseRoutePlans = 0;
  let diagnosticEscapeRoutePlans = 0;
  let diagnosticSearchRoutePlanMilliseconds = 0;
  let diagnosticChaseRoutePlanMilliseconds = 0;
  let diagnosticEscapeRoutePlanMilliseconds = 0;
  let diagnosticSightRays = 0;
  let diagnosticCurrentTargetSightChecks = 0;
  let diagnosticPersonalityRetargetQueries = 0;
  let diagnosticAutonomousVisualTargetChanges = 0;
  let diagnosticForcedTargetChanges = 0;
  let diagnosticSphereSweeps = 0;
  let diagnosticSphereSweepMilliseconds = 0;
  let diagnosticRouteStepDescriptorsCreated = 0;
  let diagnosticRouteStepDescriptorsReused = 0;
  let frameDiagnostics: V2BitSystemDiagnostics = Object.freeze({
    enabled: false,
    routePlans: Object.freeze({ search: 0, chase: 0, escape: 0 }),
    routePlanMilliseconds: Object.freeze({
      search: 0,
      chase: 0,
      escape: 0
    }),
    sightRays: 0,
    currentTargetSightCheckCount: 0,
    personalityRetargetQueryCount: 0,
    autonomousVisualTargetChangeCount: 0,
    forcedTargetChangeCount: 0,
    sphereSweeps: 0,
    sphereSweepMilliseconds: 0,
    beamRequests: 0,
    areaPursuitCount: 0,
    detailPursuitCount: 0,
    routeSafetyCache: EMPTY_ROUTE_SAFETY_CACHE_DIAGNOSTICS
  });
  const navigation = spatial.bitNavigation;
  let observedSpatialRevision = spatial.queries.revision;
  const routeStepSafetyDescriptorByStep =
    new WeakMap<BitFlightRouteStep, RouteStepSafetyDescriptor>();
  const describeRouteStep = (step: BitFlightRouteStep) => {
    const cached = routeStepSafetyDescriptorByStep.get(step);
    if (cached) {
      if (diagnosticsEnabled) {
        diagnosticRouteStepDescriptorsReused += 1;
      }
      return cached;
    }
    const descriptor = createRouteStepSafetyDescriptor(step);
    routeStepSafetyDescriptorByStep.set(step, descriptor);
    if (diagnosticsEnabled) {
      diagnosticRouteStepDescriptorsCreated += 1;
    }
    return descriptor;
  };
  const safety = createBitFlightSafety(
    Object.freeze({
      ...spatial.queries,
      castMovementSphere: (
        ...args: Parameters<typeof spatial.queries.castMovementSphere>
      ) => {
        const startedAt = diagnosticsEnabled ? performance.now() : 0;
        const collision =
          spatial.queries.castMovementSphere(...args);
        if (diagnosticsEnabled) {
          diagnosticSphereSweeps += 1;
          diagnosticSphereSweepMilliseconds +=
            performance.now() - startedAt;
        }
        return collision;
      }
    })
  );
  const routeStepSafetyByKey = new Map<string, boolean>();
  const routeCenterSafetyByKey = new Map<string, boolean>();
  const routeSegmentSafetyByKey = new Map<string, boolean>();
  const lowCeilingCruiseHeightsByRouteStepKey = new Map<
    string,
    readonly number[]
  >();
  const routeStepSafetyAccessOrder = new Map<string, true>();
  const routeStepSafetyDiagnostics =
    createMutableRouteSafetyCacheEntryDiagnostics();
  const routeCenterSafetyDiagnostics =
    createMutableRouteSafetyCacheEntryDiagnostics();
  const routeSegmentSafetyDiagnostics =
    createMutableRouteSafetyCacheEntryDiagnostics();
  const lowCeilingCruiseHeightDiagnostics =
    createMutableRouteSafetyCacheEntryDiagnostics();
  const targetLocationCandidatesByPositionKey = new Map<
    string,
    readonly Readonly<{
      destination: BitFlightLocation;
      projectionError: SafeRouteCostBias;
    }>[]
  >();
  const safeDestinationByTraversalKey = new Map<
    string,
    BitFlightLocation | null
  >();
  const explorationHistory: BitFlightExplorationHistory =
    createBitFlightExplorationHistory();

  const touchRouteStepSafetyKey = (key: string) => {
    routeStepSafetyAccessOrder.delete(key);
    routeStepSafetyAccessOrder.set(key, true);
    if (
      routeStepSafetyAccessOrder.size >
      V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES
    ) {
      const evictedKey =
        routeStepSafetyAccessOrder.keys().next().value!;
      routeStepSafetyAccessOrder.delete(evictedKey);
      if (routeStepSafetyByKey.delete(evictedKey) && diagnosticsEnabled) {
        routeStepSafetyDiagnostics.evictions += 1;
      }
      if (
        lowCeilingCruiseHeightsByRouteStepKey.delete(evictedKey) &&
        diagnosticsEnabled
      ) {
        lowCeilingCruiseHeightDiagnostics.evictions += 1;
      }
    }
  };
  const touchRouteCenterSafetyKey = (
    key: string,
    value: boolean
  ) => {
    routeCenterSafetyByKey.delete(key);
    routeCenterSafetyByKey.set(key, value);
    if (
      routeCenterSafetyByKey.size >
      V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES
    ) {
      const evictedKey =
        routeCenterSafetyByKey.keys().next().value!;
      routeCenterSafetyByKey.delete(evictedKey);
      if (diagnosticsEnabled) {
        routeCenterSafetyDiagnostics.evictions += 1;
      }
    }
  };
  const touchRouteSegmentSafetyKey = (
    key: string,
    value: boolean
  ) => {
    routeSegmentSafetyByKey.delete(key);
    routeSegmentSafetyByKey.set(key, value);
    if (
      routeSegmentSafetyByKey.size >
      V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES
    ) {
      const evictedKey =
        routeSegmentSafetyByKey.keys().next().value!;
      routeSegmentSafetyByKey.delete(evictedKey);
      if (diagnosticsEnabled) {
        routeSegmentSafetyDiagnostics.evictions += 1;
      }
    }
  };
  const touchRouteSafetyComponents = (
    descriptor: RouteStepSafetyDescriptor
  ) => {
    if (descriptor.centerKey !== null) {
      const centerSafety =
        routeCenterSafetyByKey.get(descriptor.centerKey);
      if (centerSafety !== undefined) {
        touchRouteCenterSafetyKey(
          descriptor.centerKey,
          centerSafety
        );
      }
    }
    for (const segmentKey of descriptor.segmentKeys) {
      if (segmentKey === null) {
        continue;
      }
      const segmentSafety = routeSegmentSafetyByKey.get(segmentKey);
      if (segmentSafety !== undefined) {
        touchRouteSegmentSafetyKey(segmentKey, segmentSafety);
      }
    }
  };
  const getRouteStepSafety = (
    descriptor: RouteStepSafetyDescriptor
  ) => {
    const value = routeStepSafetyByKey.get(descriptor.key);
    if (value === undefined) {
      if (diagnosticsEnabled) {
        routeStepSafetyDiagnostics.misses += 1;
      }
      return undefined;
    }
    if (diagnosticsEnabled) {
      routeStepSafetyDiagnostics.hits += 1;
    }
    touchRouteStepSafetyKey(descriptor.key);
    touchRouteSafetyComponents(descriptor);
    return value;
  };
  const setRouteStepSafety = (key: string, value: boolean) => {
    routeStepSafetyByKey.set(key, value);
    touchRouteStepSafetyKey(key);
  };
  const getRouteCenterSafety = (key: string) => {
    const value = routeCenterSafetyByKey.get(key);
    if (value === undefined) {
      if (diagnosticsEnabled) {
        routeCenterSafetyDiagnostics.misses += 1;
      }
      return undefined;
    }
    if (diagnosticsEnabled) {
      routeCenterSafetyDiagnostics.hits += 1;
    }
    touchRouteCenterSafetyKey(key, value);
    return value;
  };
  const setRouteCenterSafety = (key: string, value: boolean) => {
    touchRouteCenterSafetyKey(key, value);
  };
  const getRouteSegmentSafety = (key: string) => {
    const value = routeSegmentSafetyByKey.get(key);
    if (value === undefined) {
      if (diagnosticsEnabled) {
        routeSegmentSafetyDiagnostics.misses += 1;
      }
      return undefined;
    }
    if (diagnosticsEnabled) {
      routeSegmentSafetyDiagnostics.hits += 1;
    }
    touchRouteSegmentSafetyKey(key, value);
    return value;
  };
  const setRouteSegmentSafety = (key: string, value: boolean) => {
    touchRouteSegmentSafetyKey(key, value);
  };
  const getLowCeilingCruiseHeights = (
    descriptor: RouteStepSafetyDescriptor
  ) => {
    const value =
      lowCeilingCruiseHeightsByRouteStepKey.get(descriptor.key);
    if (value === undefined) {
      if (diagnosticsEnabled) {
        lowCeilingCruiseHeightDiagnostics.misses += 1;
      }
      return undefined;
    }
    if (diagnosticsEnabled) {
      lowCeilingCruiseHeightDiagnostics.hits += 1;
    }
    touchRouteStepSafetyKey(descriptor.key);
    touchRouteSafetyComponents(descriptor);
    return value;
  };
  const setLowCeilingCruiseHeights = (
    key: string,
    value: readonly number[]
  ) => {
    lowCeilingCruiseHeightsByRouteStepKey.set(key, value);
    touchRouteStepSafetyKey(key);
  };
  const createRouteSafetyCacheEntryDiagnostics = (
    size: number,
    diagnostics: MutableRouteSafetyCacheEntryDiagnostics
  ): V2BitRouteSafetyCacheEntryDiagnostics =>
    Object.freeze({
      size,
      hits: diagnostics.hits,
      misses: diagnostics.misses,
      recomputations: diagnostics.recomputations,
      evictions: diagnostics.evictions
    });
  const createRouteSafetyCacheDiagnostics =
    (): V2BitRouteSafetyCacheDiagnostics =>
      diagnosticsEnabled
        ? Object.freeze({
            maximumEntriesPerMap:
              V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES,
            routeStepDescriptors: Object.freeze({
              created: diagnosticRouteStepDescriptorsCreated,
              reused: diagnosticRouteStepDescriptorsReused
            }),
            routeSteps: createRouteSafetyCacheEntryDiagnostics(
              routeStepSafetyByKey.size,
              routeStepSafetyDiagnostics
            ),
            routeCenters: createRouteSafetyCacheEntryDiagnostics(
              routeCenterSafetyByKey.size,
              routeCenterSafetyDiagnostics
            ),
            routeSegments: createRouteSafetyCacheEntryDiagnostics(
              routeSegmentSafetyByKey.size,
              routeSegmentSafetyDiagnostics
            ),
            lowCeilingCruiseHeights:
              createRouteSafetyCacheEntryDiagnostics(
                lowCeilingCruiseHeightsByRouteStepKey.size,
                lowCeilingCruiseHeightDiagnostics
              )
          })
        : EMPTY_ROUTE_SAFETY_CACHE_DIAGNOSTICS;
  const resetRouteSafetyCacheDiagnostics = () => {
    diagnosticRouteStepDescriptorsCreated = 0;
    diagnosticRouteStepDescriptorsReused = 0;
    for (const diagnostics of [
      routeStepSafetyDiagnostics,
      routeCenterSafetyDiagnostics,
      routeSegmentSafetyDiagnostics,
      lowCeilingCruiseHeightDiagnostics
    ]) {
      diagnostics.hits = 0;
      diagnostics.misses = 0;
      diagnostics.recomputations = 0;
      diagnostics.evictions = 0;
    }
  };

  const resetDiagnostics = () => {
    diagnosticSearchRoutePlans = 0;
    diagnosticChaseRoutePlans = 0;
    diagnosticEscapeRoutePlans = 0;
    diagnosticSearchRoutePlanMilliseconds = 0;
    diagnosticChaseRoutePlanMilliseconds = 0;
    diagnosticEscapeRoutePlanMilliseconds = 0;
    diagnosticSightRays = 0;
    diagnosticCurrentTargetSightChecks = 0;
    diagnosticPersonalityRetargetQueries = 0;
    diagnosticAutonomousVisualTargetChanges = 0;
    diagnosticForcedTargetChanges = 0;
    diagnosticSphereSweeps = 0;
    diagnosticSphereSweepMilliseconds = 0;
  };
  const measureRoutePlan = <T>(
    purpose: V2BitRoutePurpose,
    operation: () => T
  ) => {
    const startedAt = diagnosticsEnabled ? performance.now() : 0;
    const result = operation();
    if (diagnosticsEnabled) {
      const duration = performance.now() - startedAt;
      if (purpose === "search") {
        diagnosticSearchRoutePlans += 1;
        diagnosticSearchRoutePlanMilliseconds += duration;
      } else if (purpose === "chase") {
        diagnosticChaseRoutePlans += 1;
        diagnosticChaseRoutePlanMilliseconds += duration;
      } else {
        diagnosticEscapeRoutePlans += 1;
        diagnosticEscapeRoutePlanMilliseconds += duration;
      }
    }
    return result;
  };
  const findMovementCollision = (from: Vector3, to: Vector3) =>
    from.equals(to) ? null : safety.findMovementCollision(from, to);
  const isRouteStepSafeCached = (
    descriptor: RouteStepSafetyDescriptor
  ) => {
    if (descriptor.centerKey === null) {
      return false;
    }
    const points = descriptor.points;
    let firstPointIsSafe =
      getRouteCenterSafety(descriptor.centerKey);
    if (firstPointIsSafe === undefined) {
      firstPointIsSafe = safety.isCenterSafe(points[0]);
      if (diagnosticsEnabled) {
        routeCenterSafetyDiagnostics.recomputations += 1;
      }
      setRouteCenterSafety(
        descriptor.centerKey,
        firstPointIsSafe
      );
    }
    if (!firstPointIsSafe) {
      return false;
    }
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      const segmentKey = descriptor.segmentKeys[index - 1];
      if (segmentKey === null) {
        continue;
      }
      let segmentIsSafe = getRouteSegmentSafety(segmentKey);
      if (segmentIsSafe === undefined) {
        segmentIsSafe =
          safety.findMovementCollision(from, to) === null;
        if (diagnosticsEnabled) {
          routeSegmentSafetyDiagnostics.recomputations += 1;
        }
        setRouteSegmentSafety(segmentKey, segmentIsSafe);
      }
      if (!segmentIsSafe) {
        return false;
      }
    }
    return true;
  };

  const nextRandom = () => {
    const value = config.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`randomは0以上1未満の有限値を返す必要があります: ${value}`);
    }
    return value;
  };
  const nextSpawnRandom = () => {
    const value = config.spawnRandom();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `spawnRandomは0以上1未満の有限値を返す必要があります: ${value}`
      );
    }
    return value;
  };
  const randomRange = (minimum: number, maximum: number) =>
    minimum + nextRandom() * (maximum - minimum);
  const spawnRandomRange = (minimum: number, maximum: number) =>
    minimum + nextSpawnRandom() * (maximum - minimum);

  const findSafeLocation = (
    ref: BitFlightBandRef,
    horizontalPosition: Vector3,
    preferredCenterHeight: number,
    projectionDistance = LOCATION_PROJECTION_DISTANCE
  ): BitFlightLocation | null => {
    const band = navigation.getBand(ref);
    if (!band) {
      throw new Error(`未登録の飛行帯です: ${ref.zoneId}/${ref.bandId}`);
    }
    const preferred = clamp(
      preferredCenterHeight,
      band.minimumCenterHeight,
      band.maximumCenterHeight
    );
    const heights: number[] = [preferred];
    for (let index = 0; index < HEIGHT_SAMPLE_COUNT; index += 1) {
      heights.push(
        band.minimumCenterHeight +
          ((band.maximumCenterHeight - band.minimumCenterHeight) * index) /
            (HEIGHT_SAMPLE_COUNT - 1)
      );
    }

    const usedHeights = new Set<number>();
    for (const height of heights) {
      if (usedHeights.has(height)) {
        continue;
      }
      usedHeights.add(height);
      const projected = navigation.projectPointInBand(
        ref,
        new Vector3(horizontalPosition.x, height, horizontalPosition.z),
        projectionDistance
      );
      if (!projected) {
        continue;
      }
      const center = getBitFlightWorldPosition(projected);
      if (!safety.isCenterSafe(center)) {
        continue;
      }
      const selected = safety.selectBandCenterHeight(
        band,
        center,
        preferred,
        HEIGHT_PROBE_DISTANCE
      );
      if (!selected) {
        continue;
      }
      const selectedLocation = navigation.applyHeightSelection(
        projected,
        Object.freeze({
          center: selected.center,
          heightMode: "band" as const
        })
      );
      return selectedLocation;
    }

    const baseLocation = navigation.projectPointInBand(
      ref,
      new Vector3(
        horizontalPosition.x,
        band.minimumCenterHeight,
        horizontalPosition.z
      ),
      projectionDistance
    );
    if (!baseLocation) {
      return null;
    }
    const selected = safety.selectLowCeilingCenterHeight(
      band,
      baseLocation.surface.position,
      preferred,
      HEIGHT_PROBE_DISTANCE
    );
    if (selected?.usedLowCeilingAllowance) {
      return navigation.applyHeightSelection(
        baseLocation,
        Object.freeze({
          center: selected.center,
          heightMode: "low-ceiling" as const
        })
      );
    }
    return null;
  };

  const getSafeTraversalDestination = (
    traversal: BitFlightTransitionTraversal
  ) => {
    const traversalKey =
      `${traversal.transition.id}|${traversal.reversed}`;
    if (!safeDestinationByTraversalKey.has(traversalKey)) {
      const destinationPoint =
        getTraversalDestinationPosition(traversal);
      safeDestinationByTraversalKey.set(
        traversalKey,
        findSafeLocation(
          traversal.to,
          destinationPoint,
          destinationPoint.y
        )
      );
    }
    return safeDestinationByTraversalKey.get(traversalKey) ?? null;
  };

  const bruteForceTransitionDestinations = (() => {
    const destinations: BitFlightLocation[] = [];
    const traversalKeys = new Set<string>();
    for (const band of navigation.bands) {
      for (const traversal of navigation.getTransitionsFrom({
        zoneId: band.zoneId,
        bandId: band.id
      })) {
        const traversalKey =
          `${traversal.transition.id}|${traversal.reversed}`;
        if (traversalKeys.has(traversalKey)) {
          continue;
        }
        traversalKeys.add(traversalKey);
        const destination = getSafeTraversalDestination(traversal);
        if (destination) {
          destinations.push(destination);
        }
      }
    }
    return Object.freeze(destinations);
  })();

  const createSpawnRegions = (): readonly SpawnRegion[] =>
    Object.freeze(
      spatial.volumes.getByRole("bit_spawn").map((volume) => {
        if (!volume.bitFlightBand) {
          throw new Error(`bit_spawnに飛行帯指定がありません: ${volume.id}`);
        }
        const band = navigation.getBand(volume.bitFlightBand);
        if (!band) {
          throw new Error(
            `bit_spawnが未登録飛行帯を参照しています: ${volume.id}`
          );
        }
        return Object.freeze({
          volume,
          band,
          contains: createStageBoundaryContainsQuery(volume.mesh)
        });
      })
    );

  const spawnRegions = createSpawnRegions();
  const spawnRegionByVolumeId = new Map(
    spawnRegions.map((region) => [region.volume.id, region])
  );
  const spawnSurfaceSampler = createNavigationSurfaceVolumeSampler(
    spawnRegions.map((region) =>
      Object.freeze({
        volume: region.volume,
        triangles: navigation.getSurfaceTriangles({
          zoneId: region.band.zoneId,
          bandId: region.band.id
        })
      })
    )
  );

  const sampleSpawnLocations = (
    count: number,
    minimumDistance: number,
    occupiedWorldPositions: readonly Vector3[] = Object.freeze([])
  ): readonly BitFlightLocation[] => {
    if (count === 0) {
      return Object.freeze([]);
    }
    if (spawnRegions.length === 0) {
      throw new Error("bit_spawnがありません。");
    }
    const accepted: BitFlightLocation[] = [];
    const minimumDistanceSquared = minimumDistance * minimumDistance;
    for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
      let selected: BitFlightLocation | null = null;
      for (let attempt = 0; attempt < config.spawnMaxAttempts; attempt += 1) {
        const surfaceSample = spawnSurfaceSampler.sample(nextSpawnRandom);
        const region = spawnRegionByVolumeId.get(surfaceSample.volumeId)!;
        const rawPoint = surfaceSample.point;
        const height = spawnRandomRange(
          region.band.minimumCenterHeight,
          region.band.maximumCenterHeight
        );
        const candidate = findSafeLocation(
          {
            zoneId: region.band.zoneId,
            bandId: region.band.id
          },
          rawPoint,
          height,
          config.spawnProjectionMaxDistance
        );
        if (!candidate) {
          continue;
        }
        const worldPosition = getBitFlightWorldPosition(candidate);
        if (!region.contains(worldPosition)) {
          continue;
        }
        const floor = spatial.queries.sampleGround(
          worldPosition,
          HEIGHT_PROBE_DISTANCE
        );
        const exclusionPoints = floor
          ? [worldPosition, floor.point]
          : [worldPosition];
        if (
          exclusionPoints.some(
            (point) =>
              spatial.queries.containsVolume("no_enemy_spawn", point) ||
              spatial.queries.containsVolume("no_enemy_enter", point) ||
              spatial.queries.containsVolume("hazard", point) ||
              spatial.queries.containsVolume("water", point) ||
              spatial.queries.containsVolumeById(
                config.playerSpawn.exclusionVolume.id,
                point
              )
          )
        ) {
          continue;
        }
        if (
          [
            ...occupiedWorldPositions,
            ...accepted.map(getBitFlightWorldPosition)
          ].some((position) => {
            const distanceSquared = Vector3.DistanceSquared(
              position,
              worldPosition
            );
            return (
              distanceSquared === 0 ||
              distanceSquared < minimumDistanceSquared
            );
          })
        ) {
          continue;
        }
        selected = candidate;
        break;
      }
      if (!selected) {
        throw new Error(
          `bit_spawnの${pointIndex + 1}点目を` +
            `${config.spawnMaxAttempts}回以内に生成できませんでした。`
        );
      }
      accepted.push(selected);
    }
    return Object.freeze(accepted);
  };

  const materials = createSharedMaterials(scene);
  const visualSources = (() => {
    try {
      return createSharedVisualSources(scene, materials);
    } catch (error) {
      materials.muzzle.dispose();
      materials.redBody.dispose();
      materials.body.dispose();
      throw error;
    }
  })();
  const bits: RuntimeBit[] = [];
  const bitsById = new Map<string, RuntimeBit>();
  const carpetFollowersByLeaderId = new Map<string, Set<RuntimeBit>>();
  const fadingCarpetFollowers: FadingCarpetFollower[] = [];
  const activeAlerts = new Map<string, ActiveAlert>();
  const externalAlertKeyByTargetId = new Map<string, string>();
  const closedInternalAlertKeys = new Set<string>();
  let frameBeamRequests: readonly V2BeamRequest[] = Object.freeze([]);
  let pendingAlertRequests: V2AlertRequest[] = [];
  let nextBitIndex = 0;
  let searchRoutePlanCursor = 0;
  let chaseRoutePlanCursor = 0;
  let escapeRoutePlanCursor = 0;
  let sightCheckCursor = 0;
  let sightCheckCredit = 1;
  let personalityRetargetCursor = 0;
  let personalityRetargetCredit = 0;
  let allowedSearchRoutePlanIds = new Set<string>();
  let allowedChaseRoutePlanIds = new Set<string>();
  let allowedEscapeRoutePlanIds = new Set<string>();
  let remainingUnassignedEscapeRoutePlans = 0;
  let reinforcementElapsedSeconds = 0;
  let aiSuspended = false;
  let hostileActionsSuspended = false;
  const spawnBlockedBitIdsForUpdate = new Set<string>();
  let frameView: V2BitFrameView | null = null;
  let recentExplorationSamplesForUpdate:
    | readonly BitFlightExplorationSample[]
    | null = null;

  const invalidateFrameViews = () => {
    frameView = null;
  };

  const syncBitMuzzleColor = (bit: RuntimeBit) => {
    const renderedMode = config.modeMuzzleColorEnabled
      ? bit.mode
      : "search";
    if (bit.renderedMuzzleColorMode === renderedMode) {
      return;
    }
    bit.muzzle.instancedBuffers.color = resolveV2BitMuzzleColor(
      renderedMode,
      config.modeMuzzleColorEnabled
    );
    bit.renderedMuzzleColorMode = renderedMode;
  };

  const isBitReadyForAi = (bit: RuntimeBit) =>
    !isBitSpawnPending(bit) &&
    !spawnBlockedBitIdsForUpdate.has(bit.id);

  const getPopulationBitCount = () =>
    bits.reduce(
      (count, bit) =>
        count + (bit.populationKind === "carpet-follower" ? 0 : 1),
      0
    );

  const selectRoundRobinBitIds = (
    cursor: number,
    budget: number,
    isEligible: (bit: RuntimeBit) => boolean,
    isPriority: (bit: RuntimeBit) => boolean
  ) => {
    if (bits.length === 0) {
      return Object.freeze({
        ids: new Set<string>(),
        nextCursor: 0
      });
    }
    const normalizedCursor = cursor % bits.length;
    const selectedIds = new Set<string>();
    let lastSelectedIndex: number | null = null;
    for (const priorityPass of [true, false] as const) {
      for (let offset = 0; offset < bits.length; offset += 1) {
        if (selectedIds.size >= budget) {
          break;
        }
        const index = (normalizedCursor + offset) % bits.length;
        const bit = bits[index];
        if (
          !selectedIds.has(bit.id) &&
          isEligible(bit) &&
          isPriority(bit) === priorityPass
        ) {
          selectedIds.add(bit.id);
          lastSelectedIndex = index;
        }
      }
    }
    return Object.freeze({
      ids: selectedIds,
      nextCursor: lastSelectedIndex !== null
        ? (lastSelectedIndex + 1) % bits.length
        : normalizedCursor
    });
  };

  const createRuntimeBit = (
    navigationLocation: BitFlightLocation,
    populationKind: RuntimeBit["populationKind"],
    mode: V2BitMode = "search",
    inheritedProfile: V2BitCombatProfile | null = null
  ) => {
    const position = getBitFlightWorldPosition(navigationLocation);
    assertFiniteVector("ビットの飛行位置", position);
    if (!safety.isCenterSafe(position)) {
      throw new Error("ビット初期位置に0.54m安全包絡が収まりません。");
    }
    const bitIndex = nextBitIndex;
    const id = `v2_bit_${bitIndex}`;
    nextBitIndex += 1;
    const profile =
      inheritedProfile ??
      (config.combatEnabled
        ? createV2BitCombatProfile(nextRandom)
        : V2_STANDARD_BIT_COMBAT_PROFILE);
    const visual = createBitVisual(
      scene,
      visualSources,
      materials.body,
      id,
      profile.isRed
    );
    let flightAgent: BitFlightAgent | null = null;
    try {
      flightAgent = createBitFlightAgent(
        navigation,
        safety,
        BIT_FLIGHT_AGENT_CONFIG
      );
      const initialAngle = nextRandom() * Math.PI * 2;
      const initialDirection = new Vector3(
        Math.cos(initialAngle),
        0,
        Math.sin(initialAngle)
      );
      const bit: RuntimeBit = {
        id,
        populationKind,
        ...visual,
        profile,
        flightAgent,
        navigationLocation,
        routePurpose: null,
        routeDestination: null,
        activeRoute: null,
        spatialReplanPending: false,
        routeRefreshSeconds: 0,
        searchRouteKind: null,
        normalPatrolOrigin: null,
        queuedNormalPatrolLeg: null,
        randomAttackRouteSeconds: 0,
        searchSurfaceSpeed: profile.searchSpeed,
        searchRetrySeconds: 0,
        hasAttemptedSearchRoute: false,
        searchTransitionCursor: bitIndex,
        searchSurfacePlansSinceTransitionAttempt: 0,
        bruteForceActive: false,
        bruteForceNextCheckSeconds: BRUTE_FORCE_START_SECONDS,
        bruteForcePhaseCursor: bitIndex,
        bruteForceFrontierCursor: bitIndex,
        bruteForceTransitionCursor: bitIndex,
        bruteForceFailedTransitionCandidateCount: 0,
        lastExplorationRecordSeconds: Number.NEGATIVE_INFINITY,
        transitionHistory: createBitFlightTransitionHistory(),
        activeTransition: null,
        bobPhase: nextRandom() * Math.PI * 2,
        mode,
        renderedMuzzleColorMode: null,
        targetSelectionPersonality:
          selectV2TargetSelectionPersonality("bit", id),
        targetId: null,
        targetProvenance: null,
        visualSightCheckPriority: true,
        alertLeaderId: null,
        lastSeenAimPosition: null,
        lastSeenDestination: null,
        lastChasePlanTargetId: null,
        pursuitPhase: "detail",
        pursuitTargetId: null,
        pursuitTargetAreaId: null,
        pursuitTargetAreaRevision: 0,
        pursuitActorAreaCursor: null,
        pursuitActorAreaPosition: null,
        pursuitAnchor: null,
        chaseWindowTransitionId: null,
        failedChaseWindowTransitionId: null,
        failedChaseWindowPenaltySeconds: 0,
        pendingEscapeThreatPosition: null,
        sightTargetId: null,
        sightTargetVisible: false,
        personalityRetargetCooldownSeconds: 0,
        targetLostSeconds: 0,
        modeTimerSeconds: 0,
        attackCooldownSeconds: 0,
        carpetCooldownSeconds: 0,
        fireSeconds: randomV2BitFireInterval(
          "chase",
          profile,
          nextRandom
        ),
        fireTelegraphSeconds: 0,
        fireLockDirection: initialDirection.clone(),
        lockedDirection: initialDirection.clone(),
        postAlertMode: null,
        holdReturnMode: null,
        holdTargetId: null,
        holdTimerSeconds: 0,
        lastHoldTargetId: null,
        carpetPassSeconds: 0,
        carpetLeaderId: null,
        carpetOffset: 0,
        carpetAimStartDirection: initialDirection.clone(),
        carpetAimSeconds: 0,
        spawnPhase: "fade-in",
        spawnTimerSeconds: 0
      };
      bit.root.position.copyFrom(position);
      bit.root.lookAt(bit.root.position.add(initialDirection));
      bits.push(bit);
      bitsById.set(bit.id, bit);
      syncBitMuzzleColor(bit);
      invalidateFrameViews();
      return bit;
    } catch (error) {
      flightAgent?.dispose();
      visual.spawnEffect.dispose(false, false);
      visual.spawnEffectMaterial.dispose();
      visual.root.dispose(false);
      throw error;
    }
  };

  const disposeRuntimeBit = (bit: RuntimeBit) => {
    bit.flightAgent.dispose();
    disposeBitSpawnVisual(bit);
    bit.root.dispose(false);
  };

  try {
    for (const location of sampleSpawnLocations(
      config.initialBitCount,
      config.minimumSpawnDistance
    )) {
      createRuntimeBit(location, "normal");
    }
  } catch (error) {
    for (let index = bits.length - 1; index >= 0; index -= 1) {
      disposeRuntimeBit(bits[index]);
    }
    bits.length = 0;
    bitsById.clear();
    visualSources.muzzle.dispose(false, false);
    visualSources.redBody.dispose(false, false);
    visualSources.body.dispose(false, false);
    materials.muzzle.dispose();
    materials.redBody.dispose();
    materials.body.dispose();
    throw error;
  }

  const isTargetable = (target: V2HumanTargetSnapshot) =>
    target.alive && !target.brainwashed;

  const buildAlertKey = (leaderId: string, targetId: string) =>
    `${leaderId}\u0000${targetId}`;

  const removeActiveAlert = (alertKey: string) => {
    const alert = activeAlerts.get(alertKey);
    if (!alert) {
      return null;
    }
    activeAlerts.delete(alertKey);
    if (
      !alert.internalBitAlert &&
      externalAlertKeyByTargetId.get(alert.targetId) ===
        alertKey
    ) {
      externalAlertKeyByTargetId.delete(alert.targetId);
    }
    return alert;
  };

  const isSightClear = (from: Vector3, to: Vector3) => {
    if (diagnosticsEnabled) {
      diagnosticSightRays += 1;
    }
    return spatial.queries.castSightSegment(from, to) === null;
  };

  const isInsideVision = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) => {
    const toTarget = target.aimPosition.subtract(bit.root.position);
    const distanceSquared = toTarget.lengthSquared();
    if (
      distanceSquared >
      bit.profile.visionRange * bit.profile.visionRange
    ) {
      return false;
    }
    if (distanceSquared === 0) {
      return true;
    }
    const forward = bit.root.getDirection(Vector3.Forward()).normalize();
    return (
      Vector3.Dot(forward, toTarget) / Math.sqrt(distanceSquared) >=
      bit.profile.visionCosine
    );
  };

  const getAssignedTargetVisibility = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    refreshSight: boolean
  ) => {
    if (refreshSight && diagnosticsEnabled) {
      diagnosticCurrentTargetSightChecks += 1;
    }
    if (bit.mode !== "chase" && !isInsideVision(bit, target)) {
      if (bit.sightTargetId === target.id) {
        bit.sightTargetVisible = false;
      }
      return false;
    }
    if (refreshSight) {
      bit.sightTargetId = target.id;
      bit.sightTargetVisible = isSightClear(
        bit.root.position,
        target.aimPosition
      );
    }
    return (
      bit.sightTargetId === target.id &&
      bit.sightTargetVisible
    );
  };

  const getChaseAbandonDistance = (bit: RuntimeBit) =>
    bit.profile.visionRange + TARGET_LOST_DISTANCE_MARGIN;

  const findVisibleTarget = (
    bit: RuntimeBit,
    targets: readonly V2HumanTargetSnapshot[],
    tieBreak: "source-order" | "id",
    sharedTargetVisibility: Readonly<{
      targetId: string;
      visible: boolean;
    }> | null = null
  ) => {
    const rankedTargets = targets
      .map((target, sourceIndex) => ({
        target,
        sourceIndex,
        distanceSquared: Vector3.DistanceSquared(
          bit.root.position,
          target.aimPosition
        )
      }))
      .filter(
        ({ target }) =>
          isTargetable(target) && isInsideVision(bit, target)
      )
      .sort((left, right) => {
        const distanceOrder =
          left.distanceSquared - right.distanceSquared;
        if (distanceOrder !== 0) {
          return distanceOrder;
        }
        if (tieBreak === "source-order") {
          return left.sourceIndex - right.sourceIndex;
        }
        return left.target.id < right.target.id
          ? -1
          : left.target.id > right.target.id
            ? 1
            : 0;
      });
    for (const { target } of rankedTargets) {
      const visible =
        sharedTargetVisibility?.targetId === target.id
          ? sharedTargetVisibility.visible
          : isSightClear(bit.root.position, target.aimPosition);
      if (visible) {
        return target;
      }
    }
    return null;
  };

  const pointBitAt = (bit: RuntimeBit, aimPosition: Vector3) => {
    if (Vector3.DistanceSquared(bit.root.position, aimPosition) > 0) {
      bit.root.lookAt(aimPosition);
    }
  };

  const getBobbedPosition = (
    bit: RuntimeBit,
    location: BitFlightLocation,
    elapsedSeconds: number,
    allowBob: boolean
  ) => {
    const base = getBitFlightWorldPosition(location);
    if (!allowBob) {
      return base;
    }
    const band = navigation.getBand(location);
    if (!band) {
      throw new Error("現在飛行位置の飛行帯がありません。");
    }
    const bob =
      Math.sin(elapsedSeconds * 0.9 + bit.bobPhase) * BOB_AMPLITUDE;
    if (location.heightMode === "low-ceiling") {
      return new Vector3(base.x, base.y + bob, base.z);
    }
    const candidate = new Vector3(
      base.x,
      clamp(
        base.y + bob,
        band.minimumCenterHeight,
        band.maximumCenterHeight
      ),
      base.z
    );
    return candidate;
  };

  const syncStationaryPosition = (
    bit: RuntimeBit,
    elapsedSeconds: number,
    allowBob: boolean
  ) => {
    if (!bit.navigationLocation) {
      return;
    }
    const destination = getBobbedPosition(
      bit,
      bit.navigationLocation,
      elapsedSeconds,
      allowBob
    );
    if (!findMovementCollision(bit.root.position, destination)) {
      bit.root.position.copyFrom(destination);
      return;
    }
    const base = getBitFlightWorldPosition(bit.navigationLocation);
    if (
      !destination.equals(base) &&
      !findMovementCollision(bit.root.position, base)
    ) {
      bit.root.position.copyFrom(base);
    }
  };

  const selectSafeRoute = <T>(
    start: BitFlightLocation,
    candidates: readonly SafeRouteInputCandidate<T>[],
    policy: BitFlightRoutePolicy,
    findCandidateRoute: (
      origin: BitFlightLocation,
      candidate: SafeRouteInputCandidate<T>,
      safePolicy: BitFlightRoutePolicy
    ) => BitFlightRoute | null = (origin, candidate, safePolicy) =>
      navigation.findRoute(origin, candidate.destination, safePolicy)
  ): SafeRouteCandidate<T> | null => {
    let selected: SafeRouteCandidate<T> | null = null;
    const startWorldPosition = getBitFlightWorldPosition(start);
    const lazySafetyPolicy: BitFlightRoutePolicy = Object.freeze({
      canUseTransition: (traversal) =>
        policy.canUseTransition(traversal),
      canUseRouteStep: (step) => {
        if (!policy.canUseRouteStep(step)) {
          return false;
        }
        const descriptor = describeRouteStep(step);
        return getRouteStepSafety(descriptor) !== false;
      },
      additionalTransitionCost: (traversal) =>
        policy.additionalTransitionCost(traversal),
      additionalSurfaceCruiseHeights: (step, band) => {
        const descriptor = describeRouteStep(step);
        let lowCeilingCruiseHeights =
          getLowCeilingCruiseHeights(descriptor);
        if (lowCeilingCruiseHeights === undefined) {
          lowCeilingCruiseHeights =
            safety.findLowCeilingCruiseHeights(step, band);
          if (diagnosticsEnabled) {
            lowCeilingCruiseHeightDiagnostics.recomputations += 1;
          }
          setLowCeilingCruiseHeights(
            descriptor.key,
            lowCeilingCruiseHeights
          );
        }
        return Object.freeze([
          ...policy.additionalSurfaceCruiseHeights(step, band),
          ...lowCeilingCruiseHeights
        ]);
      }
    });
    for (const candidate of candidates) {
      /*
       * BitFlightRoute.totalCostは距離と非負のpolicy追加費用の和なので、
       * 始終点の直線距離とcostBiasの和が候補総費用のadmissible lower boundになる。
       * 選択規則はstrict <のため、同値も既選択候補を維持して評価を省略できる。
       */
      if (
        selected &&
        Vector3.Distance(
          startWorldPosition,
          getBitFlightWorldPosition(candidate.destination)
        ) +
          candidate.costBias >=
          selected.totalCost
      ) {
        continue;
      }
      let route: BitFlightRoute | null = null;
      while (true) {
        const plannedRoute = findCandidateRoute(
          start,
          candidate,
          lazySafetyPolicy
        );
        if (!plannedRoute) {
          break;
        }
        let routeIsSafe = true;
        for (const step of plannedRoute.steps) {
          const descriptor = describeRouteStep(step);
          let stepIsSafe = getRouteStepSafety(descriptor);
          if (stepIsSafe === undefined) {
            stepIsSafe = isRouteStepSafeCached(descriptor);
            if (diagnosticsEnabled) {
              routeStepSafetyDiagnostics.recomputations += 1;
            }
            setRouteStepSafety(descriptor.key, stepIsSafe);
          }
          if (!stepIsSafe) {
            routeIsSafe = false;
            break;
          }
        }
        if (routeIsSafe) {
          route = plannedRoute;
          break;
        }
      }
      if (!route) {
        continue;
      }
      const totalCost = route.totalCost + candidate.costBias;
      if (!selected || totalCost < selected.totalCost) {
        selected = Object.freeze({
          value: candidate.value,
          destination: candidate.destination,
          route,
          totalCost
        });
      }
    }
    return selected;
  };

  const clearRoute = (bit: RuntimeBit) => {
    bit.flightAgent.clear();
    bit.routePurpose = null;
    bit.routeDestination = null;
    bit.activeRoute = null;
    bit.spatialReplanPending = false;
    bit.routeRefreshSeconds = 0;
    bit.chaseWindowTransitionId = null;
    bit.searchRouteKind = null;
    bit.normalPatrolOrigin = null;
    bit.queuedNormalPatrolLeg = null;
    bit.randomAttackRouteSeconds = 0;
    bit.bruteForceFailedTransitionCandidateCount = 0;
  };

  const assignRoute = (
    bit: RuntimeBit,
    selected: SafeRouteCandidate<unknown>,
    purpose: V2BitRoutePurpose
  ) => {
    if (!bit.navigationLocation) {
      return false;
    }
    if (
      bit.mode === "carpet-leader" &&
      (routeContainsTransition(selected.route) ||
        !sameBand(bit.navigationLocation, selected.destination))
    ) {
      convertCarpetToChase(bit);
    }
    if (
      !bit.flightAgent.setPreparedRoute(
        bit.navigationLocation,
        selected.route,
        "verified"
      )
    ) {
      bit.routePurpose = null;
      bit.routeDestination = null;
      bit.activeRoute = null;
      bit.spatialReplanPending = false;
      bit.chaseWindowTransitionId = null;
      bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      return false;
    }
    bit.routePurpose = purpose;
    bit.routeDestination = cloneTargetLocation(selected.destination);
    bit.activeRoute = selected.route;
    bit.spatialReplanPending = false;
    bit.chaseWindowTransitionId =
      purpose === "chase"
        ? getFirstWindowAccessTransitionId(selected.route)
        : null;
    bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
    return true;
  };

  const clearDynamicSpatialCaches = () => {
    routeStepSafetyByKey.clear();
    routeCenterSafetyByKey.clear();
    routeSegmentSafetyByKey.clear();
    lowCeilingCruiseHeightsByRouteStepKey.clear();
    routeStepSafetyAccessOrder.clear();
    targetLocationCandidatesByPositionKey.clear();
    safeDestinationByTraversalKey.clear();
  };

  const isRemainingRouteStepSafeForCurrentRevision = (
    step: BitFlightRouteStep,
    points: readonly Vector3[]
  ) => {
    const descriptor = createRouteStepSafetyDescriptor(
      step,
      points
    );
    let safe = getRouteStepSafety(descriptor);
    if (safe === undefined) {
      safe = isRouteStepSafeCached(descriptor);
      if (diagnosticsEnabled) {
        routeStepSafetyDiagnostics.recomputations += 1;
      }
      setRouteStepSafety(descriptor.key, safe);
    }
    return safe;
  };

  const isActiveRouteProgressSafeForCurrentRevision = (
    bit: RuntimeBit
  ) => {
    if (!bit.activeRoute) {
      return true;
    }
    const progress = bit.flightAgent.getSnapshot();
    const routeStepIndex = progress.routeStepIndex;
    const activeStep = bit.activeRoute.steps[routeStepIndex];
    if (activeStep === undefined) {
      return true;
    }
    if (progress.position === null) {
      throw new Error(
        `BIT ${bit.id}のactive route進行位置がありません。`
      );
    }
    const remainingPoints =
      activeStep.kind === "surface"
        ? activeStep.points
            .slice(progress.surfacePointIndex)
            .map(getBitFlightWorldPosition)
        : activeStep.points.slice(
            progress.transitionPointIndex
          );
    return isRemainingRouteStepSafeForCurrentRevision(
      activeStep,
      Object.freeze([
        progress.position.clone(),
        ...remainingPoints
      ])
    );
  };

  const requestSpatialRouteReplan = (bit: RuntimeBit) => {
    const transition = bit.flightAgent.getSnapshot().transition;
    if (transition) {
      bit.flightAgent.clear();
      bit.activeRoute = null;
      bit.spatialReplanPending = true;
      bit.routeRefreshSeconds = 0;
      bit.searchRetrySeconds = 0;
      return;
    }
    clearRoute(bit);
    bit.searchRetrySeconds = 0;
    bit.hasAttemptedSearchRoute = false;
    bit.lastChasePlanTargetId = null;
  };

  const syncDynamicSpatialRevision = () => {
    const revision = spatial.queries.revision;
    if (revision === observedSpatialRevision) {
      return;
    }
    observedSpatialRevision = revision;
    clearDynamicSpatialCaches();
    for (const bit of bits) {
      if (
        bit.activeRoute &&
        !isActiveRouteProgressSafeForCurrentRevision(bit)
      ) {
        requestSpatialRouteReplan(bit);
        continue;
      }
      if (
        bit.flightAgent.getState() === "unreachable" ||
        (bit.routePurpose === null && bit.searchRetrySeconds > 0)
      ) {
        requestSpatialRouteReplan(bit);
      }
    }
  };

  const updateTransitionHistory = (
    bit: RuntimeBit,
    nextTransition: BitFlightTransitionTraversal | null,
    nextLocation: BitFlightLocation | null,
    elapsedSeconds: number
  ) => {
    const previous = bit.activeTransition;
    if (
      previous &&
      (!nextTransition ||
        nextTransition.transition.id !== previous.transition.id ||
        nextTransition.reversed !== previous.reversed)
    ) {
      const completedAtDestination =
        (nextLocation !== null &&
          sameBand(nextLocation, previous.to)) ||
        (nextTransition !== null &&
          sameBand(nextTransition.from, previous.to));
      if (completedAtDestination) {
        bit.transitionHistory.record(previous, elapsedSeconds);
      }
    }
    bit.activeTransition = nextTransition;
  };

  const advanceAgent = (
    bit: RuntimeBit,
    speed: number,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    const previousRootPosition = bit.root.position.clone();
    const previousTransition = bit.activeTransition;
    const snapshot = bit.flightAgent.update(
      speed,
      deltaSeconds,
      previousRootPosition,
      (candidate) => {
        if (!candidate.position) {
          throw new Error("移動後のBIT飛行位置がありません。");
        }
        const allowBob =
          candidate.transition === null &&
          bit.mode !== "carpet-leader" &&
          bit.mode !== "carpet-follower";
        return candidate.location
          ? getBobbedPosition(
              bit,
              candidate.location,
              elapsedSeconds,
              allowBob
            )
          : candidate.position;
      }
    );
    if (snapshot.movementBlocked) {
      if (snapshot.transition === null) {
        bit.routePurpose = null;
        bit.routeDestination = null;
        bit.activeRoute = null;
        bit.spatialReplanPending = false;
        bit.chaseWindowTransitionId = null;
      }
      bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      return "blocked";
    }
    updateTransitionHistory(
      bit,
      snapshot.transition,
      snapshot.location,
      elapsedSeconds
    );
    if (!snapshot.rootPosition) {
      return snapshot.state;
    }

    bit.root.position.copyFrom(snapshot.rootPosition);
    bit.navigationLocation = snapshot.location;
    const completedFlightTransition =
      previousTransition !== null &&
      snapshot.transition === null;
    if (completedFlightTransition) {
      bit.pursuitActorAreaCursor =
        spatial.navigationAreas.locate(bit.root.position);
      bit.pursuitActorAreaPosition = bit.root.position.clone();
    } else if (
      snapshot.transition === null &&
      bit.pursuitActorAreaCursor !== null &&
      bit.pursuitActorAreaPosition !== null &&
      !bit.pursuitActorAreaPosition.equals(bit.root.position)
    ) {
      bit.pursuitActorAreaCursor =
        spatial.navigationAreas.advance(
          bit.pursuitActorAreaCursor,
          bit.pursuitActorAreaPosition,
          bit.root.position
        );
      bit.pursuitActorAreaPosition.copyFrom(bit.root.position);
    }
    if (snapshot.facingDirection && snapshot.facingDirection.lengthSquared() > 0) {
      bit.root.lookAt(bit.root.position.add(snapshot.facingDirection));
    }
    const completedSpatialReplanClear =
      bit.spatialReplanPending && snapshot.state === "idle";
    if (completedSpatialReplanClear) {
      bit.routePurpose = null;
      bit.routeDestination = null;
      bit.activeRoute = null;
      bit.spatialReplanPending = false;
      bit.chaseWindowTransitionId = null;
      bit.routeRefreshSeconds = 0;
      bit.searchRetrySeconds = 0;
      bit.hasAttemptedSearchRoute = false;
      bit.lastChasePlanTargetId = null;
    }
    if (
      snapshot.state === "idle" ||
      snapshot.state === "arrived" ||
      snapshot.state === "unreachable" ||
      snapshot.state === "blocked"
    ) {
      bit.activeRoute = null;
      if (
        snapshot.state !== "arrived" &&
        !completedSpatialReplanClear
      ) {
        bit.routePurpose = null;
        bit.routeDestination = null;
        bit.spatialReplanPending = false;
        bit.chaseWindowTransitionId = null;
        bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      }
    }
    return snapshot.state;
  };

  const buildTargetLocationCandidates = (
    targetPosition: Vector3
  ): readonly Readonly<{
    destination: BitFlightLocation;
    projectionError: SafeRouteCostBias;
  }>[] => {
    const cacheKey = createRouteSafetyPointKey(targetPosition);
    const cached = targetLocationCandidatesByPositionKey.get(cacheKey);
    if (cached) {
      targetLocationCandidatesByPositionKey.delete(cacheKey);
      targetLocationCandidatesByPositionKey.set(cacheKey, cached);
      return cached;
    }
    const verticalDistances = navigation.bands.map((band) =>
      targetPosition.y < band.minimumCenterHeight
        ? band.minimumCenterHeight - targetPosition.y
        : targetPosition.y > band.maximumCenterHeight
          ? targetPosition.y - band.maximumCenterHeight
          : 0
    );
    const minimumVerticalDistance = Math.min(...verticalDistances);
    const projectedCandidates = navigation.bands.flatMap((band, index) => {
      if (
        verticalDistances[index] >
        minimumVerticalDistance + TARGET_BAND_VERTICAL_TOLERANCE
      ) {
        return [];
      }
      const location = findSafeLocation(
        { zoneId: band.zoneId, bandId: band.id },
        targetPosition,
        targetPosition.y
      );
      if (!location) {
        return [];
      }
      return [
        Object.freeze({
          destination: location,
          projectionError: measureHorizontalProjectionError(
            location.surface.position,
            targetPosition
          )
        })
      ];
    });
    const minimumProjectionError = Math.min(
      ...projectedCandidates.map((candidate) => candidate.projectionError)
    );
    const candidates = Object.freeze(
      projectedCandidates.filter(
        (candidate) =>
          candidate.projectionError <=
          minimumProjectionError + TARGET_BAND_PROJECTION_TOLERANCE
      )
    );
    targetLocationCandidatesByPositionKey.set(cacheKey, candidates);
    if (
      targetLocationCandidatesByPositionKey.size >
      TARGET_LOCATION_CANDIDATE_CACHE_MAX_ENTRIES
    ) {
      const oldestKey =
        targetLocationCandidatesByPositionKey.keys().next().value;
      if (oldestKey !== undefined) {
        targetLocationCandidatesByPositionKey.delete(oldestKey);
      }
    }
    return candidates;
  };

  const selectTargetDestination = (
    bit: RuntimeBit,
    targetPosition: Vector3
  ) => {
    if (!bit.navigationLocation) {
      return null;
    }
    const chasePolicy: BitFlightRoutePolicy = Object.freeze({
      canUseTransition: (traversal) =>
        BIT_FLIGHT_SHORTEST_ROUTE_POLICY.canUseTransition(
          traversal
        ),
      canUseRouteStep: (step) =>
        BIT_FLIGHT_SHORTEST_ROUTE_POLICY.canUseRouteStep(step),
      additionalSurfaceCruiseHeights: (step, band) =>
        BIT_FLIGHT_SHORTEST_ROUTE_POLICY.additionalSurfaceCruiseHeights(
          step,
          band
        ),
      additionalTransitionCost: (traversal) => {
        const transition = traversal.transition;
        if (!transition.affordances.includes("window-access")) {
          return 0;
        }
        const failureCost =
          bit.failedChaseWindowPenaltySeconds > 0 &&
          bit.failedChaseWindowTransitionId === transition.id
            ? CHASE_WINDOW_FAILURE_COST
            : 0;
        const congestionCount = bits.filter(
          (candidate) =>
            candidate.id !== bit.id &&
            candidate.mode === "chase" &&
            candidate.targetId === bit.targetId &&
            candidate.chaseWindowTransitionId === transition.id
        ).length;
        return (
          failureCost +
          congestionCount * CHASE_WINDOW_CONGESTION_COST
        );
      }
    });
    return selectSafeRoute(
      bit.navigationLocation,
      buildTargetLocationCandidates(targetPosition).map((candidate) =>
        Object.freeze({
          value: candidate.destination,
          destination: candidate.destination,
          costBias: candidate.projectionError
        })
      ),
      chasePolicy
    );
  };

  const selectSameBandTargetDestination = (
    bit: RuntimeBit,
    targetPosition: Vector3
  ) => {
    if (!bit.navigationLocation) {
      return null;
    }
    return selectSafeRoute(
      bit.navigationLocation,
      buildTargetLocationCandidates(targetPosition)
        .filter((candidate) =>
          sameBand(bit.navigationLocation!, candidate.destination)
        )
        .map((candidate) =>
          Object.freeze({
            value: candidate.destination,
            destination: candidate.destination,
            costBias: candidate.projectionError
          })
        ),
      BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
      (origin, candidate, safePolicy) =>
        navigation.findSurfaceRoute(
          origin,
          candidate.destination,
          safePolicy
        )
    );
  };

  const registerCarpetFollower = (
    leader: RuntimeBit,
    follower: RuntimeBit
  ) => {
    const followers =
      carpetFollowersByLeaderId.get(leader.id) ?? new Set<RuntimeBit>();
    followers.add(follower);
    carpetFollowersByLeaderId.set(leader.id, followers);
  };

  const unregisterRuntimeBit = (bit: RuntimeBit) => {
    bits.splice(bits.indexOf(bit), 1);
    bitsById.delete(bit.id);
    if (bit.mode === "carpet-follower") {
      const followers = carpetFollowersByLeaderId.get(bit.carpetLeaderId!);
      followers!.delete(bit);
      if (followers!.size === 0) {
        carpetFollowersByLeaderId.delete(bit.carpetLeaderId!);
      }
    }
    invalidateFrameViews();
  };

  const startCarpetFollowerFade = (follower: RuntimeBit) => {
    finalizeBitSpawnVisual(follower);
    follower.flightAgent.dispose();
    unregisterRuntimeBit(follower);
    fadingCarpetFollowers.push({
      root: follower.root,
      body: follower.body,
      muzzle: follower.muzzle,
      remainingSeconds: CARPET_FOLLOWER_FADE_SECONDS
    });
  };

  const updateFadingCarpetFollowers = (deltaSeconds: number) => {
    for (
      let index = fadingCarpetFollowers.length - 1;
      index >= 0;
      index -= 1
    ) {
      const follower = fadingCarpetFollowers[index];
      follower.remainingSeconds = Math.max(
        0,
        follower.remainingSeconds - deltaSeconds
      );
      const visibility =
        follower.remainingSeconds / CARPET_FOLLOWER_FADE_SECONDS;
      follower.body.instancedBuffers.color = new Color4(
        1,
        1,
        1,
        visibility
      );
      const muzzleColor = follower.muzzle.instancedBuffers.color as Color4;
      follower.muzzle.instancedBuffers.color = new Color4(
        muzzleColor.r,
        muzzleColor.g,
        muzzleColor.b,
        visibility
      );
      if (follower.remainingSeconds === 0) {
        follower.root.dispose(false);
        fadingCarpetFollowers.splice(index, 1);
      }
    }
  };

  const disposeFadingCarpetFollowers = () => {
    for (const follower of fadingCarpetFollowers) {
      follower.root.dispose(false);
    }
    fadingCarpetFollowers.length = 0;
  };

  const removeCarpetFollowers = (leader: RuntimeBit) => {
    const followers = carpetFollowersByLeaderId.get(leader.id);
    if (!followers) {
      return;
    }
    for (const candidate of [...followers]) {
      startCarpetFollowerFade(candidate);
    }
  };

  const convertCarpetToChase = (leader: RuntimeBit) => {
    removeCarpetFollowers(leader);
    leader.mode = "chase";
    leader.modeTimerSeconds = config.combatEnabled
      ? V2_BIT_CHASE_DURATION_SECONDS
      : 0;
    leader.carpetLeaderId = null;
    leader.carpetOffset = 0;
    leader.carpetPassSeconds = 0;
    leader.lastChasePlanTargetId = null;
    clearRoute(leader);
  };

  const abortCarpetAtObstacle = (leader: RuntimeBit) => {
    removeCarpetFollowers(leader);
    clearRoute(leader);
    leader.mode = "search";
    leader.targetId = null;
    leader.targetProvenance = null;
    leader.visualSightCheckPriority = true;
    leader.alertLeaderId = null;
    leader.lastSeenAimPosition = null;
    leader.lastSeenDestination = null;
    leader.lastChasePlanTargetId = null;
    leader.pendingEscapeThreatPosition = null;
    leader.sightTargetId = null;
    leader.sightTargetVisible = false;
    leader.targetLostSeconds = 0;
    leader.modeTimerSeconds = 0;
    leader.fireTelegraphSeconds = 0;
    leader.postAlertMode = null;
    leader.carpetPassSeconds = 0;
    leader.carpetLeaderId = null;
    leader.carpetOffset = 0;
    leader.carpetCooldownSeconds = CARPET_WALL_COOLDOWN_SECONDS;
    leader.hasAttemptedSearchRoute = false;
  };

  const getCombatModeDuration = (
    mode: V2BitCombatMode
  ): number =>
    mode === "chase"
      ? V2_BIT_CHASE_DURATION_SECONDS
      : mode === "fixed"
        ? V2_BIT_FIXED_DURATION_SECONDS
        : mode === "random"
          ? V2_BIT_RANDOM_DURATION_SECONDS
          : mode === "alert-send"
            ? V2_BIT_ALERT_DURATION_SECONDS
            : V2_BIT_CHASE_DURATION_SECONDS;

  const getBeamMode = (
    mode: V2BitMode
  ): "chase" | "fixed" | "random" | "carpet" =>
    mode === "fixed"
      ? "fixed"
      : mode === "random"
        ? "random"
        : mode === "carpet-leader" || mode === "carpet-follower"
          ? "carpet"
          : "chase";

  const activateCombatMode = (
    bit: RuntimeBit,
    mode: V2BitCombatMode,
    target: V2HumanTargetSnapshot
  ) => {
    const activeMode =
      mode === "carpet-leader" && bit.carpetCooldownSeconds > 0
        ? "chase"
        : mode;
    bit.mode = activeMode;
    bit.modeTimerSeconds = getCombatModeDuration(activeMode);
    bit.attackCooldownSeconds = Math.max(
      0,
      bit.attackCooldownSeconds
    );
    const direction = target.aimPosition.subtract(bit.root.position);
    if (direction.lengthSquared() > 0) {
      bit.lockedDirection.copyFrom(direction.normalize());
    }
    bit.fireTelegraphSeconds = 0;
    const fireInterval = randomV2BitFireInterval(
      getBeamMode(activeMode),
      bit.profile,
      nextRandom
    );
    bit.fireSeconds =
      activeMode === "carpet-leader"
        ? fireInterval * nextRandom()
        : fireInterval * 0.3;
    bit.postAlertMode = null;
    bit.carpetPassSeconds = 0;
  };

  const setVisualTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) => {
    if (
      diagnosticsEnabled &&
      (bit.targetId !== target.id ||
        bit.targetProvenance !== "visual")
    ) {
      diagnosticAutonomousVisualTargetChanges += 1;
    }
    clearRoute(bit);
    bit.targetId = target.id;
    bit.targetProvenance = "visual";
    bit.visualSightCheckPriority = false;
    bit.alertLeaderId = null;
    bit.lastSeenAimPosition = target.aimPosition.clone();
    bit.lastSeenDestination = null;
    bit.lastChasePlanTargetId = null;
    bit.chaseWindowTransitionId = null;
    bit.failedChaseWindowTransitionId = null;
    bit.failedChaseWindowPenaltySeconds = 0;
    bit.targetLostSeconds = 0;
    bit.sightTargetId = target.id;
    bit.sightTargetVisible = true;
    bit.personalityRetargetCooldownSeconds =
      TARGET_PERSONALITY_RETARGET_INTERVAL_SECONDS;
    bit.pendingEscapeThreatPosition = null;
    if (!config.combatEnabled) {
      bit.mode =
        nextRandom() < LEGACY_CARPET_MODE_CHANCE &&
        bit.carpetCooldownSeconds === 0
          ? "carpet-leader"
          : "chase";
      pendingAlertRequests.push(
        Object.freeze({
          leaderId: bit.id,
          targetId: target.id
        })
      );
      return;
    }
    const mode = selectV2BitCombatMode(bit.profile, nextRandom);
    if (
      mode === "alert-send" &&
      !startInternalAlert(bit, target)
    ) {
      activateCombatMode(bit, "chase", target);
      return;
    }
    if (mode !== "alert-send") {
      activateCombatMode(bit, mode, target);
    }
  };

  const retargetAutonomousVisualTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) => {
    bit.visualSightCheckPriority = false;
    if (bit.targetId === target.id) {
      bit.lastSeenAimPosition = target.aimPosition.clone();
      bit.targetLostSeconds = 0;
      bit.sightTargetId = target.id;
      bit.sightTargetVisible = true;
      return;
    }
    if (diagnosticsEnabled) {
      diagnosticAutonomousVisualTargetChanges += 1;
    }
    bit.targetId = target.id;
    bit.lastSeenAimPosition = target.aimPosition.clone();
    bit.targetLostSeconds = 0;
    bit.sightTargetId = target.id;
    bit.sightTargetVisible = true;
  };

  const setAlertTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    leaderId: string
  ) => {
    if (
      diagnosticsEnabled &&
      (bit.targetId !== target.id ||
        bit.targetProvenance !== "alert")
    ) {
      diagnosticForcedTargetChanges += 1;
    }
    if (bit.mode === "carpet-leader") {
      removeCarpetFollowers(bit);
      bit.carpetLeaderId = null;
      bit.carpetOffset = 0;
      bit.carpetPassSeconds = 0;
    }
    clearRoute(bit);
    bit.targetId = target.id;
    bit.targetProvenance = "alert";
    bit.visualSightCheckPriority = false;
    bit.alertLeaderId = leaderId;
    bit.lastSeenAimPosition = target.aimPosition.clone();
    bit.lastSeenDestination = null;
    bit.lastChasePlanTargetId = null;
    bit.chaseWindowTransitionId = null;
    bit.failedChaseWindowTransitionId = null;
    bit.failedChaseWindowPenaltySeconds = 0;
    bit.targetLostSeconds = 0;
    bit.sightTargetId = target.id;
    bit.sightTargetVisible = false;
    bit.pendingEscapeThreatPosition = null;
    if (!config.combatEnabled) {
      bit.mode =
        nextRandom() < LEGACY_ALERT_CARPET_MODE_CHANCE &&
        bit.carpetCooldownSeconds === 0
          ? "carpet-leader"
          : "chase";
      return;
    }
    bit.postAlertMode = selectV2BitPostAlertMode(nextRandom);
    bit.mode = "alert-receive";
    bit.modeTimerSeconds = V2_BIT_ALERT_DURATION_SECONDS;
    bit.fireTelegraphSeconds = 0;
  };

  const isExternalAlertReceiverCandidate = (
    bit: RuntimeBit,
    leaderId: string,
    assignedReceiverIds: ReadonlySet<string>
  ) =>
    bit.id !== leaderId &&
    isBitReadyForAi(bit) &&
    !assignedReceiverIds.has(bit.id) &&
    bit.mode !== "alert-send" &&
    bit.mode !== "alert-receive" &&
    bit.mode !== "hold" &&
    bit.mode !== "carpet-leader" &&
    bit.mode !== "carpet-follower";

  const selectExternalAlertReceivers = (
    leaderId: string,
    target: V2HumanTargetSnapshot,
    assignedReceiverIds: ReadonlySet<string>
  ) =>
    bits
      .filter((bit) =>
        isExternalAlertReceiverCandidate(
          bit,
          leaderId,
          assignedReceiverIds
        )
      )
      .sort(
        (left, right) =>
          Vector3.DistanceSquared(
            left.root.position,
            target.aimPosition
          ) -
          Vector3.DistanceSquared(
            right.root.position,
            target.aimPosition
          )
      )
      .slice(0, EXTERNAL_ALERT_RECEIVER_LIMIT);

  function startInternalAlert(
    leader: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) {
    if (
      Array.from(activeAlerts.values()).some(
        (alert) => alert.internalBitAlert
      )
    ) {
      return false;
    }
    const existingCandidates = bits
      .filter(
        (candidate) =>
          candidate.id !== leader.id &&
          isBitReadyForAi(candidate) &&
          candidate.mode !== "alert-send" &&
          candidate.mode !== "alert-receive" &&
          candidate.mode !== "carpet-follower" &&
          candidate.attackCooldownSeconds === 0
      )
      .sort(
        (left, right) =>
          Vector3.DistanceSquared(
            left.root.position,
            leader.root.position
          ) -
          Vector3.DistanceSquared(
            right.root.position,
            leader.root.position
          )
      )
      .slice(0, ALERT_GATHER_TARGET_COUNT);
    const spawnedReceiver = trySpawnInternalAlertReceiver(leader);
    const existingReceiverLimit = spawnedReceiver
      ? ALERT_GATHER_TARGET_COUNT - 1
      : ALERT_GATHER_TARGET_COUNT;
    const receivers = existingCandidates.slice(
      0,
      existingReceiverLimit
    );
    if (spawnedReceiver) {
      receivers.unshift(spawnedReceiver);
    }
    if (receivers.length === 0) {
      return false;
    }

    const alertKey = buildAlertKey(leader.id, target.id);
    const receiverIds = new Set(
      receivers.map((receiver) => receiver.id)
    );
    activeAlerts.set(alertKey, {
      leaderId: leader.id,
      targetId: target.id,
      remainingSeconds: V2_BIT_ALERT_DURATION_SECONDS,
      receiverIds,
      gatheredIds: new Set<string>(),
      internalBitAlert: true
    });
    activateCombatMode(leader, "alert-send", target);
    for (const receiver of receivers) {
      setAlertTarget(receiver, target, leader.id);
    }
    pendingAlertRequests.push(
      Object.freeze({
        leaderId: leader.id,
        targetId: target.id
      })
    );
    return true;
  }

  function trySpawnInternalAlertReceiver(
    leader: RuntimeBit
  ): RuntimeBit | null {
    if (getPopulationBitCount() >= config.maximumBitCount) {
      return null;
    }
    const leaderLocation = leader.navigationLocation;
    if (!leaderLocation) {
      return null;
    }
    const leaderPosition = getBitFlightWorldPosition(leaderLocation);
    const maximumAttempts = Math.min(
      config.spawnMaxAttempts,
      ALERT_SPAWN_MAX_ATTEMPTS
    );
    for (
      let attempt = 0;
      attempt < maximumAttempts;
      attempt += 1
    ) {
      const angle = nextSpawnRandom() * Math.PI * 2;
      const radius = Math.sqrt(nextSpawnRandom()) * ALERT_SPAWN_RADIUS;
      const desiredPosition = leaderPosition.add(
        new Vector3(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        )
      );
      const location = navigation.constrainMovement(
        leaderLocation,
        desiredPosition,
        leaderLocation.heightMode
      );
      if (
        !location ||
        !sameBand(leaderLocation, location)
      ) {
        continue;
      }
      const spawnPosition = getBitFlightWorldPosition(location);
      if (
        Vector3.Distance(leaderPosition, spawnPosition) >
          ALERT_SPAWN_RADIUS ||
        !safety.isCenterSafe(spawnPosition) ||
        findMovementCollision(leaderPosition, spawnPosition) ||
        spatial.queries.containsVolumeById(
          config.playerSpawn.exclusionVolume.id,
          spawnPosition
        )
      ) {
        continue;
      }
      const receiver = createRuntimeBit(location, "alert");
      const leaderForward = normalizeHorizontal(
        leader.root.getDirection(Vector3.Forward())
      );
      receiver.root.lookAt(
        receiver.root.position.add(leaderForward)
      );
      receiver.lockedDirection.copyFrom(leaderForward);
      receiver.fireLockDirection.copyFrom(leaderForward);
      return receiver;
    }
    return null;
  }

  const planEscape = (
    bit: RuntimeBit,
    threatPosition: Vector3,
    elapsedSeconds: number
  ) => {
    if (!bit.navigationLocation) {
      bit.routePurpose = "escape";
      return;
    }
    const policy = createBitFlightEscapeRoutePolicy({
      origin: bit.root.position,
      threatPosition,
      isLineOfSightBlocked: (destination) =>
        !isSightClear(destination, threatPosition),
      desiredDistanceGain: ESCAPE_DESIRED_DISTANCE_GAIN,
      visibleDestinationPenalty: ESCAPE_VISIBLE_DESTINATION_PENALTY,
      insufficientDistanceGainPenaltyPerWorldUnit:
        ESCAPE_DISTANCE_GAIN_PENALTY,
      transitionHistory: bit.transitionHistory,
      nowSeconds: elapsedSeconds,
      immediateReturnPenalty: TRANSITION_IMMEDIATE_RETURN_PENALTY,
      returnSuppressionSeconds:
        BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS
    });
    const candidates = navigation
      .getTransitionsFrom(bit.navigationLocation)
      .flatMap((traversal) => {
        const destination =
          getSafeTraversalDestination(traversal);
        return destination
          ? [Object.freeze({
              value: traversal,
              destination,
              costBias: ZERO_SAFE_ROUTE_COST_BIAS
            })]
          : [];
      });
    const selected = measureRoutePlan("escape", () =>
      selectSafeRoute(
        bit.navigationLocation!,
        candidates,
        policy,
        (origin, candidate, safePolicy) =>
          navigation.findRouteThroughTransition(
            origin,
            candidate.value,
            candidate.destination,
            safePolicy
          )
      )
    );
    if (selected) {
      assignRoute(bit, selected, "escape");
    } else {
      clearRoute(bit);
      bit.searchRetrySeconds = SEARCH_RETRY_SECONDS;
    }
  };

  const tryPlanPendingEscape = (
    bit: RuntimeBit,
    elapsedSeconds: number
  ) => {
    const threatPosition = bit.pendingEscapeThreatPosition;
    if (!threatPosition) {
      return true;
    }
    if (allowedEscapeRoutePlanIds.has(bit.id)) {
      allowedEscapeRoutePlanIds.delete(bit.id);
    } else {
      if (remainingUnassignedEscapeRoutePlans === 0) {
        return false;
      }
      remainingUnassignedEscapeRoutePlans -= 1;
    }
    bit.pendingEscapeThreatPosition = null;
    planEscape(bit, threatPosition, elapsedSeconds);
    return true;
  };

  const abandonTarget = (
    bit: RuntimeBit,
    elapsedSeconds: number
  ) => {
    const endedAttack =
      bit.mode === "chase" ||
      bit.mode === "fixed" ||
      bit.mode === "random" ||
      bit.mode === "carpet-leader";
    const threatPosition =
      bit.lastSeenAimPosition?.clone() ?? bit.root.position.clone();
    if (bit.mode === "carpet-leader") {
      convertCarpetToChase(bit);
    } else {
      clearRoute(bit);
    }
    bit.targetId = null;
    bit.targetProvenance = null;
    bit.visualSightCheckPriority = true;
    bit.alertLeaderId = null;
    bit.lastSeenAimPosition = null;
    bit.lastSeenDestination = null;
    bit.chaseWindowTransitionId = null;
    bit.failedChaseWindowTransitionId = null;
    bit.failedChaseWindowPenaltySeconds = 0;
    bit.targetLostSeconds = 0;
    bit.sightTargetId = null;
    bit.sightTargetVisible = false;
    bit.mode = "search";
    bit.modeTimerSeconds = 0;
    bit.fireTelegraphSeconds = 0;
    bit.postAlertMode = null;
    bit.holdReturnMode = null;
    bit.holdTargetId = null;
    bit.holdTimerSeconds = 0;
    bit.carpetPassSeconds = 0;
    if (config.combatEnabled && endedAttack) {
      bit.attackCooldownSeconds = V2_BIT_ATTACK_COOLDOWN_SECONDS;
    }
    bit.hasAttemptedSearchRoute = false;
    bit.pendingEscapeThreatPosition = threatPosition;
    tryPlanPendingEscape(bit, elapsedSeconds);
  };

  const selectAlertTarget = (
    bit: RuntimeBit,
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>
  ) => {
    let closest: Readonly<{
      target: V2HumanTargetSnapshot;
      leaderId: string;
    }> | null = null;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const alert of activeAlerts.values()) {
      if (
        alert.leaderId === bit.id ||
        !alert.receiverIds.has(bit.id)
      ) {
        continue;
      }
      const target = targetsById.get(alert.targetId);
      if (!target || !isTargetable(target)) {
        continue;
      }
      const distanceSquared = Vector3.DistanceSquared(
        bit.root.position,
        target.aimPosition
      );
      if (distanceSquared < closestDistanceSquared) {
        closest = Object.freeze({ target, leaderId: alert.leaderId });
        closestDistanceSquared = distanceSquared;
      }
    }
    return closest;
  };

  const createSearchRoutePolicy = (
    bit: RuntimeBit,
    elapsedSeconds: number
  ) =>
    createBitFlightSearchRoutePolicy({
      explorationHistory,
      transitionHistory: bit.transitionHistory,
      nowSeconds: elapsedSeconds,
      observationRadius: SEARCH_OBSERVATION_RADIUS,
      exploredDestinationPenalty: SEARCH_EXPLORED_DESTINATION_PENALTY,
      ordinaryTransitionPenalty: SEARCH_ORDINARY_TRANSITION_PENALTY,
      immediateReturnPenalty: TRANSITION_IMMEDIATE_RETURN_PENALTY,
      returnSuppressionSeconds:
        BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS
    });

  const createSearchSurfaceDestination = (
    origin: BitFlightLocation,
    horizontalSpeed: number,
    verticalSpeed: number,
    radius: number,
    movementRoll: number
  ): SearchSurfaceDestination | null => {
    const band = navigation.getBand(origin);
    if (!band) {
      throw new Error("探索中の飛行帯がありません。");
    }
    const isVertical = movementRoll >= 0.65 && movementRoll < 0.8;
    const isDiagonal = movementRoll >= 0.8;
    const horizontal = isVertical
      ? origin
      : navigation.randomPointAround(origin, radius);
    if (!horizontal) {
      return null;
    }

    let preferredHeight = origin.safeCenterHeight;
    if (isVertical) {
      const direction = nextRandom() < 0.65 ? -1 : 1;
      preferredHeight += direction * randomRange(0.08, 0.22);
    } else if (isDiagonal) {
      const direction = nextRandom() < 0.5 ? -1 : 1;
      preferredHeight += direction * randomRange(0.2, 0.45);
    } else {
      preferredHeight += randomRange(-0.18, 0.18);
    }
    const destination = findSafeLocation(
      { zoneId: band.zoneId, bandId: band.id },
      horizontal.surface.position,
      preferredHeight
    );
    return destination
      ? Object.freeze({
          destination,
          surfaceSpeed: isVertical ? verticalSpeed : horizontalSpeed,
          isVertical
        })
      : null;
  };

  const getHorizontalDistance = (
    left: BitFlightLocation,
    right: BitFlightLocation
  ) => {
    const leftPosition = getBitFlightWorldPosition(left);
    const rightPosition = getBitFlightWorldPosition(right);
    return Math.hypot(
      rightPosition.x - leftPosition.x,
      rightPosition.z - leftPosition.z
    );
  };

  const getNormalPatrolReservations = (owner: RuntimeBit) => {
    const reservations: BitFlightLocation[] = [];
    for (const bit of bits) {
      if (
        bit.id === owner.id ||
        bit.searchRouteKind !== "normal"
      ) {
        continue;
      }
      if (
        bit.routePurpose === "search" &&
        bit.routeDestination !== null
      ) {
        reservations.push(bit.routeDestination);
      }
      if (bit.queuedNormalPatrolLeg) {
        reservations.push(
          bit.queuedNormalPatrolLeg.destination
        );
      }
    }
    return reservations;
  };

  const createRankedNormalPatrolDestinations = (
    bit: RuntimeBit,
    origin: BitFlightLocation,
    previousOrigin: BitFlightLocation | null,
    elapsedSeconds: number,
    movementRoll = nextRandom()
  ) => {
    const horizontalSpeed =
      NORMAL_PATROL_SPEED * bit.profile.statMultiplier;
    const verticalSpeed =
      SEARCH_VERTICAL_SPEED * bit.profile.statMultiplier;
    const reservations = getNormalPatrolReservations(bit);
    const candidates: Array<
      SafeRouteInputCandidate<
        Readonly<{ surfaceSpeed: number }>
      > &
        Readonly<{
          conflictsReservation: boolean;
          horizontalDistance: number;
          minimumReservationDistance: number;
          recentlyExplored: boolean;
          isVertical: boolean;
        }>
    > = [];
    const candidateKeys = new Set<string>();
    for (
      let attempt = 0;
      attempt < NORMAL_PATROL_CANDIDATE_COUNT;
      attempt += 1
    ) {
      const surface = createSearchSurfaceDestination(
        origin,
        horizontalSpeed,
        verticalSpeed,
        NORMAL_PATROL_RADIUS,
        movementRoll
      );
      if (!surface) {
        continue;
      }
      const destinationPosition = getBitFlightWorldPosition(
        surface.destination
      );
      const candidateKey = JSON.stringify([
        surface.destination.zoneId,
        surface.destination.bandId,
        destinationPosition.x,
        destinationPosition.y,
        destinationPosition.z
      ]);
      if (candidateKeys.has(candidateKey)) {
        continue;
      }
      candidateKeys.add(candidateKey);
      const horizontalDistance = getHorizontalDistance(
        origin,
        surface.destination
      );
      let minimumReservationDistance = Number.POSITIVE_INFINITY;
      for (const reservation of reservations) {
        if (!sameBand(surface.destination, reservation)) {
          continue;
        }
        minimumReservationDistance = Math.min(
          minimumReservationDistance,
          getHorizontalDistance(surface.destination, reservation)
        );
      }
      const conflictsReservation =
        minimumReservationDistance <
        NORMAL_PATROL_RESERVATION_RADIUS;
      const recentlyExplored = explorationHistory.hasRecentObservation(
        surface.destination,
        destinationPosition,
        SEARCH_OBSERVATION_RADIUS,
        elapsedSeconds
      );
      let reversePenalty = 0;
      if (previousOrigin) {
        const previousPosition =
          getBitFlightWorldPosition(previousOrigin);
        const originPosition = getBitFlightWorldPosition(origin);
        const incomingX = originPosition.x - previousPosition.x;
        const incomingZ = originPosition.z - previousPosition.z;
        const outgoingX = destinationPosition.x - originPosition.x;
        const outgoingZ = destinationPosition.z - originPosition.z;
        const incomingLength = Math.hypot(incomingX, incomingZ);
        const outgoingLength = Math.hypot(outgoingX, outgoingZ);
        if (incomingLength > 0 && outgoingLength > 0) {
          const directionDot =
            (incomingX * outgoingX + incomingZ * outgoingZ) /
            (incomingLength * outgoingLength);
          reversePenalty =
            Math.max(0, -directionDot) *
            NORMAL_PATROL_REVERSE_PENALTY;
        }
      }
      const shortDistancePenalty = surface.isVertical
        ? 0
        : Math.max(
            0,
            NORMAL_PATROL_MINIMUM_HORIZONTAL_DISTANCE -
              horizontalDistance
          ) * 2;
      const longDistancePreference = surface.isVertical
        ? 0
        : Math.max(
            0,
            NORMAL_PATROL_RADIUS - horizontalDistance
          ) * 1.25;
      const basePenalty =
        (recentlyExplored
          ? SEARCH_EXPLORED_DESTINATION_PENALTY
          : 0) +
        reversePenalty +
        shortDistancePenalty +
        longDistancePreference;
      candidates.push(
        Object.freeze({
          value: Object.freeze({
            surfaceSpeed: surface.surfaceSpeed
          }),
          destination: surface.destination,
          costBias: basePenalty as SafeRouteCostBias,
          conflictsReservation,
          horizontalDistance,
          minimumReservationDistance,
          recentlyExplored,
          isVertical: surface.isVertical
        })
      );
    }

    let ranked = candidates;
    const unreserved = ranked.filter(
      (candidate) => !candidate.conflictsReservation
    );
    const allCandidatesConflict = unreserved.length === 0;
    if (!allCandidatesConflict) {
      ranked = unreserved;
    }
    const sufficientlyLong = ranked.filter(
      (candidate) =>
        candidate.isVertical ||
        candidate.horizontalDistance >=
          NORMAL_PATROL_MINIMUM_HORIZONTAL_DISTANCE
    );
    if (sufficientlyLong.length > 0) {
      ranked = sufficientlyLong;
    }
    const maximumReservationDistance = allCandidatesConflict
      ? Math.max(
          ...ranked.map(
            (candidate) => candidate.minimumReservationDistance
          )
        )
      : Number.POSITIVE_INFINITY;
    return ranked
      .map((candidate) => {
        const reservationPenalty =
          allCandidatesConflict &&
          Number.isFinite(maximumReservationDistance)
            ? (maximumReservationDistance -
                candidate.minimumReservationDistance) *
              100
            : 0;
        return Object.freeze({
          ...candidate,
          costBias:
            (candidate.costBias + reservationPenalty) as SafeRouteCostBias
        });
      })
      .sort((left, right) => {
        const penaltyDifference =
          left.costBias - right.costBias;
        if (penaltyDifference !== 0) {
          return penaltyDifference;
        }
        return right.horizontalDistance - left.horizontalDistance;
      });
  };

  const selectNormalPatrolLeg = (
    bit: RuntimeBit,
    origin: BitFlightLocation,
    previousOrigin: BitFlightLocation | null,
    elapsedSeconds: number
  ): NormalPatrolLeg | null => {
    const policy = createSearchRoutePolicy(bit, elapsedSeconds);
    const surfaceCandidates =
      createRankedNormalPatrolDestinations(
        bit,
        origin,
        previousOrigin,
        elapsedSeconds
      ).slice(0, NORMAL_PATROL_ROUTE_CANDIDATE_LIMIT);
    const originPosition = getBitFlightWorldPosition(origin);
    const transitions = navigation
      .getTransitionsFrom(origin)
      .filter(
        (traversal) =>
          bit.transitionHistory.getImmediateReturnPenalty(
            traversal,
            elapsedSeconds,
            BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS,
            TRANSITION_IMMEDIATE_RETURN_PENALTY
          ) === 0
      )
      .sort((left, right) => {
        const policyDifference =
          policy.additionalTransitionCost(left) -
          policy.additionalTransitionCost(right);
        if (policyDifference !== 0) {
          return policyDifference;
        }
        return (
          Vector3.Distance(
            originPosition,
            getTraversalEntryEvaluationPosition(
              left,
              originPosition
            )
          ) -
          Vector3.Distance(
            originPosition,
            getTraversalEntryEvaluationPosition(
              right,
              originPosition
            )
          )
        );
      });
    const nearestDiscreteTransitionDistance = transitions.reduce(
      (nearest, traversal) =>
        traversal.transition.kind === "vertical"
          ? nearest
          : Math.min(
              nearest,
              Vector3.Distance(
                originPosition,
                getTraversalEntryEvaluationPosition(
                  traversal,
                  originPosition
                )
              )
            ),
      Number.POSITIVE_INFINITY
    );
    const transitionCandidates: Array<
      SafeRouteInputCandidate<
        Readonly<{
          traversal: BitFlightTransitionTraversal;
          surfaceSpeed: number;
        }>
      >
    > = [];
    const shouldAttemptTransition =
      transitions.length > 0 &&
      (nearestDiscreteTransitionDistance <=
        SEARCH_NEAR_TRANSITION_DISTANCE ||
        bit.searchSurfacePlansSinceTransitionAttempt >=
          SEARCH_TRANSITION_FORCE_AFTER_SURFACE_PLANS ||
        nextRandom() < SEARCH_TRANSITION_CHANCE);
    if (shouldAttemptTransition) {
      const cursor = bit.searchTransitionCursor % transitions.length;
      const candidateCount = Math.min(
        SEARCH_TRANSITION_CANDIDATE_LIMIT,
        transitions.length
      );
      for (let offset = 0; offset < candidateCount; offset += 1) {
        const traversal = transitions[(cursor + offset) % transitions.length];
        const traversalDestination =
          getSafeTraversalDestination(traversal);
        if (!traversalDestination) {
          continue;
        }
        const destinationZone = navigation.getZone(
          traversal.to.zoneId
        );
        if (!destinationZone) {
          throw new Error(
            `探索遷移先ゾーンがありません: ${traversal.to.zoneId}`
          );
        }
        const continueInside =
          destinationZone.spaceKind === "indoor" &&
          traversal.transition.affordances.some(
            (affordance) =>
              affordance === "window-access" ||
              affordance === "indoor-access"
          );
        let destination = traversalDestination;
        let surfaceSpeed =
          NORMAL_PATROL_SPEED * bit.profile.statMultiplier;
        let costBias = ZERO_SAFE_ROUTE_COST_BIAS;
        if (continueInside) {
          const interiorCandidate =
            createRankedNormalPatrolDestinations(
              bit,
              traversalDestination,
              origin,
              elapsedSeconds,
              0
            ).find(
              (candidate) =>
                !candidate.recentlyExplored &&
                candidate.horizontalDistance >=
                  NORMAL_PATROL_MINIMUM_HORIZONTAL_DISTANCE
            );
          if (!interiorCandidate) {
            continue;
          }
          destination = interiorCandidate.destination;
          surfaceSpeed = interiorCandidate.value.surfaceSpeed;
          costBias = interiorCandidate.costBias;
        }
        transitionCandidates.push(
          Object.freeze({
            value: Object.freeze({
              traversal,
              surfaceSpeed
            }),
            destination,
            costBias
          })
        );
      }
      bit.searchTransitionCursor =
        (cursor + candidateCount) % transitions.length;
      bit.searchSurfacePlansSinceTransitionAttempt = 0;
    } else {
      bit.searchSurfacePlansSinceTransitionAttempt += 1;
    }
    const transitionSelected = selectSafeRoute(
      origin,
      transitionCandidates,
      policy,
      (start, candidate, safePolicy) =>
        navigation.findRouteThroughTransition(
          start,
          candidate.value.traversal,
          candidate.destination,
          safePolicy
        )
    );
    const surfaceSelected = transitionSelected
      ? null
      : selectSafeRoute(
          origin,
          surfaceCandidates,
          policy,
          (start, candidate, safePolicy) =>
            navigation.findSurfaceRoute(
              start,
              candidate.destination,
              safePolicy
            )
        );
    const selected = transitionSelected ?? surfaceSelected;
    if (!selected) {
      return null;
    }
    return Object.freeze({
      origin,
      value: Object.freeze({
        surfaceSpeed: selected.value.surfaceSpeed
      }),
      destination: selected.destination,
      route: selected.route,
      totalCost: selected.totalCost
    });
  };

  const planNormalPatrolLeg = (
    bit: RuntimeBit,
    elapsedSeconds: number
  ) => {
    const planningQueuedLeg =
      bit.routePurpose === "search" &&
      bit.searchRouteKind === "normal" &&
      bit.routeDestination !== null;
    if (bit.routePurpose !== null && !planningQueuedLeg) {
      return false;
    }
    const origin = planningQueuedLeg
      ? bit.routeDestination!
      : bit.navigationLocation;
    if (!origin) {
      return false;
    }
    const previousOrigin = planningQueuedLeg
      ? bit.normalPatrolOrigin
      : null;
    const selected = measureRoutePlan("search", () =>
      selectNormalPatrolLeg(
        bit,
        origin,
        previousOrigin,
        elapsedSeconds
      )
    );
    if (!selected) {
      return false;
    }
    if (planningQueuedLeg) {
      bit.queuedNormalPatrolLeg = selected;
      return true;
    }
    if (!assignRoute(bit, selected, "search")) {
      return false;
    }
    bit.searchRouteKind = "normal";
    bit.normalPatrolOrigin = selected.origin;
    bit.searchSurfaceSpeed = selected.value.surfaceSpeed;
    return true;
  };

  const promoteQueuedNormalPatrolLeg = (bit: RuntimeBit) => {
    const queued = bit.queuedNormalPatrolLeg;
    if (!queued) {
      return false;
    }
    bit.queuedNormalPatrolLeg = null;
    if (!assignRoute(bit, queued, "search")) {
      clearRoute(bit);
      return false;
    }
    bit.searchRouteKind = "normal";
    bit.normalPatrolOrigin = queued.origin;
    bit.searchSurfaceSpeed = queued.value.surfaceSpeed;
    return true;
  };

  const planRandomAttackRoute = (
    bit: RuntimeBit,
    elapsedSeconds: number,
    movementSpeed: number
  ) => {
    const current = bit.navigationLocation;
    if (!current) {
      return false;
    }
    const policy = createSearchRoutePolicy(bit, elapsedSeconds);
    const surfaceCandidates: Array<
      Readonly<{
        value: Readonly<{
          traversal: BitFlightTransitionTraversal | null;
          surfaceSpeed: number;
        }>;
        destination: BitFlightLocation;
        costBias: SafeRouteCostBias;
      }>
    > = [];
    const surfaceCandidate = createSearchSurfaceDestination(
      current,
      movementSpeed,
      movementSpeed *
        (SEARCH_VERTICAL_SPEED / PROFILE_SEARCH_SPEED_REFERENCE),
      RANDOM_ATTACK_SEARCH_RADIUS,
      nextRandom()
    );
    if (surfaceCandidate) {
      surfaceCandidates.push(
        Object.freeze({
          value: Object.freeze({
            traversal: null,
            surfaceSpeed: surfaceCandidate.surfaceSpeed
          }),
          destination: surfaceCandidate.destination,
          costBias: ZERO_SAFE_ROUTE_COST_BIAS
        })
      );
    }

    const transitions = navigation
      .getTransitionsFrom(current)
      .filter(
        (traversal) =>
          bit.transitionHistory.getImmediateReturnPenalty(
            traversal,
            elapsedSeconds,
            BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS,
            TRANSITION_IMMEDIATE_RETURN_PENALTY
          ) === 0
      )
      .sort((left, right) => {
        const policyDifference =
          policy.additionalTransitionCost(left) -
          policy.additionalTransitionCost(right);
        if (policyDifference !== 0) {
          return policyDifference;
        }
        return (
          Vector3.Distance(
            bit.root.position,
            getTraversalEntryEvaluationPosition(left, bit.root.position)
          ) -
          Vector3.Distance(
            bit.root.position,
            getTraversalEntryEvaluationPosition(right, bit.root.position)
          )
        );
      });
    const nearestDiscreteTransitionDistance = transitions.reduce(
      (nearest, traversal) =>
        traversal.transition.kind === "vertical"
          ? nearest
          : Math.min(
              nearest,
              Vector3.Distance(
                bit.root.position,
                getTraversalEntryEvaluationPosition(
                  traversal,
                  bit.root.position
                )
              )
            ),
      Number.POSITIVE_INFINITY
    );
    const transitionCandidates: typeof surfaceCandidates = [];
    const shouldAttemptTransition =
      transitions.length > 0 &&
      (nearestDiscreteTransitionDistance <=
        SEARCH_NEAR_TRANSITION_DISTANCE ||
        bit.searchSurfacePlansSinceTransitionAttempt >=
          SEARCH_TRANSITION_FORCE_AFTER_SURFACE_PLANS ||
        nextRandom() < SEARCH_TRANSITION_CHANCE);
    if (shouldAttemptTransition) {
      const cursor = bit.searchTransitionCursor % transitions.length;
      const candidateCount = Math.min(
        SEARCH_TRANSITION_CANDIDATE_LIMIT,
        transitions.length
      );
      for (let offset = 0; offset < candidateCount; offset += 1) {
        const traversal = transitions[(cursor + offset) % transitions.length];
        const destination = getSafeTraversalDestination(traversal);
        if (destination) {
          transitionCandidates.push(
            Object.freeze({
              value: Object.freeze({
                traversal,
                surfaceSpeed: movementSpeed
              }),
              destination,
              costBias: ZERO_SAFE_ROUTE_COST_BIAS
            })
          );
        }
      }
      bit.searchTransitionCursor =
        (cursor + candidateCount) % transitions.length;
      bit.searchSurfacePlansSinceTransitionAttempt = 0;
    } else {
      bit.searchSurfacePlansSinceTransitionAttempt += 1;
    }
    const selected = measureRoutePlan(
      "search",
      () =>
        selectSafeRoute(
          current,
          transitionCandidates,
          policy,
          (origin, candidate, safePolicy) =>
            navigation.findRouteThroughTransition(
              origin,
              candidate.value.traversal!,
              candidate.destination,
              safePolicy
            )
        ) ??
        selectSafeRoute(
          current,
          surfaceCandidates,
          policy,
          (origin, candidate, safePolicy) =>
            navigation.findSurfaceRoute(
              origin,
              candidate.destination,
              safePolicy
            )
        )
    );
    if (!selected || !assignRoute(bit, selected, "search")) {
      return false;
    }
    bit.searchRouteKind = "random";
    bit.searchSurfaceSpeed = selected.value.surfaceSpeed;
    bit.randomAttackRouteSeconds = randomRange(
      RANDOM_ATTACK_ROUTE_SECONDS_MIN,
      RANDOM_ATTACK_ROUTE_SECONDS_MAX
    );
    return true;
  };

  const planBruteForceRoute = (
    bit: RuntimeBit,
    elapsedSeconds: number
  ) => {
    const current = bit.navigationLocation;
    if (!current) {
      return false;
    }
    const currentPosition = getBitFlightWorldPosition(current);
    const candidateByKey = new Map<
      string,
      BruteForceRouteCandidate
    >();
    const addCandidate = (
      destination: BitFlightLocation,
      surfaceSpeed: number
    ) => {
      const position = getBitFlightWorldPosition(destination);
      if (
        Vector3.DistanceSquared(currentPosition, position) <= 0.0025 ||
        explorationHistory.hasRecentObservation(
          destination,
          position,
          SEARCH_OBSERVATION_RADIUS,
          elapsedSeconds
        )
      ) {
        return;
      }
      const key = JSON.stringify([
        destination.zoneId,
        destination.bandId,
        position.x,
        position.y,
        position.z
      ]);
      candidateByKey.set(
        key,
        Object.freeze({
          value: Object.freeze({ surfaceSpeed }),
          destination,
          costBias: ZERO_SAFE_ROUTE_COST_BIAS
        })
      );
    };
    const planningTransitionCandidate =
      bruteForceTransitionDestinations.length > 0 &&
      bit.bruteForcePhaseCursor % 2 === 1;
    let transitionCandidateCount = 0;
    if (planningTransitionCandidate) {
      transitionCandidateCount = Math.min(
        BRUTE_FORCE_TRANSITION_CANDIDATE_COUNT,
        bruteForceTransitionDestinations.length
      );
      const destination =
        bruteForceTransitionDestinations[
          bit.bruteForceTransitionCursor %
            bruteForceTransitionDestinations.length
        ];
      addCandidate(
        destination,
        NORMAL_PATROL_SPEED * bit.profile.statMultiplier
      );
      bit.bruteForceTransitionCursor =
        (bit.bruteForceTransitionCursor +
          transitionCandidateCount) %
        bruteForceTransitionDestinations.length;
    } else {
      for (
        let attempt = 0;
        attempt < BRUTE_FORCE_LOCAL_CANDIDATE_COUNT;
        attempt += 1
      ) {
        const surface = createSearchSurfaceDestination(
          current,
          NORMAL_PATROL_SPEED * bit.profile.statMultiplier,
          SEARCH_VERTICAL_SPEED * bit.profile.statMultiplier,
          NORMAL_PATROL_RADIUS,
          nextRandom()
        );
        if (surface) {
          addCandidate(surface.destination, surface.surfaceSpeed);
        }
      }
      recentExplorationSamplesForUpdate ??=
        explorationHistory.getRecentSamples(elapsedSeconds);
      const recentSamples = recentExplorationSamplesForUpdate;
      for (
        let candidateIndex = 0;
        candidateIndex < BRUTE_FORCE_FRONTIER_CANDIDATE_COUNT &&
        recentSamples.length > 0;
        candidateIndex += 1
      ) {
        const cursor =
          bit.bruteForceFrontierCursor + candidateIndex;
        const sample =
          recentSamples[cursor % recentSamples.length];
        const offset =
          BRUTE_FORCE_FRONTIER_OFFSETS[
            cursor % BRUTE_FORCE_FRONTIER_OFFSETS.length
          ];
        const seed = sample.position.add(offset);
        const destination = findSafeLocation(
          sample.band,
          seed,
          seed.y
        );
        if (destination) {
          addCandidate(
            destination,
            NORMAL_PATROL_SPEED * bit.profile.statMultiplier
          );
        }
      }
    }
    if (!planningTransitionCandidate) {
      bit.bruteForceFrontierCursor +=
        BRUTE_FORCE_FRONTIER_CANDIDATE_COUNT;
    }
    bit.bruteForcePhaseCursor += 1;
    const candidates = [...candidateByKey.values()]
      .sort(
        (left, right) =>
          Vector3.DistanceSquared(
            currentPosition,
            getBitFlightWorldPosition(left.destination)
          ) -
          Vector3.DistanceSquared(
            currentPosition,
            getBitFlightWorldPosition(right.destination)
          )
      )
      .slice(
        0,
        planningTransitionCandidate
          ? BRUTE_FORCE_TRANSITION_CANDIDATE_COUNT
          : BRUTE_FORCE_SURFACE_ROUTE_CANDIDATE_LIMIT
      );
    const policy = createSearchRoutePolicy(bit, elapsedSeconds);
    const selected = measureRoutePlan("search", () =>
      selectSafeRoute(current, candidates, policy)
    );
    if (!selected) {
      if (planningTransitionCandidate) {
        bit.bruteForceFailedTransitionCandidateCount +=
          transitionCandidateCount;
      }
      if (
        bruteForceTransitionDestinations.length === 0 ||
        bit.bruteForceFailedTransitionCandidateCount >=
          bruteForceTransitionDestinations.length
      ) {
        bit.bruteForceActive = false;
        bit.bruteForceFailedTransitionCandidateCount = 0;
      }
      return false;
    }
    if (planningTransitionCandidate) {
      bit.bruteForceFailedTransitionCandidateCount = 0;
    }
    if (!assignRoute(bit, selected, "search")) {
      return false;
    }
    bit.searchRouteKind = "brute-force";
    bit.searchSurfaceSpeed = selected.value.surfaceSpeed;
    return true;
  };

  const recordExplorationPosition = (
    bit: RuntimeBit,
    elapsedSeconds: number
  ) => {
    if (
      bit.navigationLocation &&
      elapsedSeconds - bit.lastExplorationRecordSeconds >=
        SEARCH_OBSERVATION_INTERVAL_SECONDS
    ) {
      explorationHistory.recordLocation(
        bit.navigationLocation,
        elapsedSeconds
      );
      bit.lastExplorationRecordSeconds = elapsedSeconds;
    }
  };

  const updateBruteForceSchedule = (
    bit: RuntimeBit,
    elapsedSeconds: number
  ) => {
    if (elapsedSeconds < bit.bruteForceNextCheckSeconds) {
      return;
    }
    const elapsedCheckIntervals =
      Math.floor(
        (elapsedSeconds - BRUTE_FORCE_START_SECONDS) /
          BRUTE_FORCE_CHECK_INTERVAL_SECONDS
      ) + 1;
    bit.bruteForceNextCheckSeconds =
      BRUTE_FORCE_START_SECONDS +
      elapsedCheckIntervals *
        BRUTE_FORCE_CHECK_INTERVAL_SECONDS;
    if (
      bit.bruteForceActive ||
      bit.routePurpose === "escape" ||
      bit.activeTransition !== null
    ) {
      return;
    }
    if (nextRandom() < BRUTE_FORCE_START_CHANCE) {
      clearRoute(bit);
      bit.bruteForceActive = true;
      bit.searchRetrySeconds = 0;
    }
  };

  const updateNormalSearch = (
    bit: RuntimeBit,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    bit.mode = "search";
    if (
      bit.pendingEscapeThreatPosition &&
      !tryPlanPendingEscape(bit, elapsedSeconds)
    ) {
      syncStationaryPosition(bit, elapsedSeconds, true);
      return;
    }
    recordExplorationPosition(bit, elapsedSeconds);
    bit.searchRetrySeconds = Math.max(
      0,
      bit.searchRetrySeconds - deltaSeconds
    );
    updateBruteForceSchedule(bit, elapsedSeconds);

    if (
      bit.routePurpose === "escape" ||
      bit.routePurpose === "search"
    ) {
      const routePurpose = bit.routePurpose;
      const activeSearchRouteKind = bit.searchRouteKind;
      const surfaceSpeed =
        routePurpose === "search"
          ? bit.searchSurfaceSpeed
          : bit.profile.searchSpeed;
      const state = advanceAgent(
        bit,
        surfaceSpeed,
        deltaSeconds,
        elapsedSeconds
      );
      if (state === "transition" || state === "clearing-transition") {
        return;
      }
      if (
        state === "unreachable" ||
        (state === "blocked" && bit.activeTransition === null)
      ) {
        clearRoute(bit);
        bit.searchRetrySeconds = SEARCH_RETRY_SECONDS;
      } else if (state === "arrived") {
        if (bit.navigationLocation) {
          explorationHistory.recordLocation(
            bit.navigationLocation,
            elapsedSeconds
          );
          bit.lastExplorationRecordSeconds = elapsedSeconds;
        }
        if (
          activeSearchRouteKind === "normal" &&
          !bit.bruteForceActive &&
          promoteQueuedNormalPatrolLeg(bit)
        ) {
          return;
        }
        clearRoute(bit);
        bit.searchRetrySeconds = 0;
      } else if (state === "blocked") {
        return;
      } else if (
        routePurpose === "escape" &&
        state === "surface"
      ) {
        return;
      }
    }

    if (
      bit.navigationLocation &&
      bit.searchRetrySeconds === 0 &&
      allowedSearchRoutePlanIds.has(bit.id)
    ) {
      bit.hasAttemptedSearchRoute = true;
      const planned = bit.bruteForceActive
        ? planBruteForceRoute(bit, elapsedSeconds)
        : planNormalPatrolLeg(bit, elapsedSeconds);
      if (!planned) {
        bit.searchRetrySeconds = SEARCH_RETRY_SECONDS;
      }
    }
    if (bit.routePurpose === null) {
      syncStationaryPosition(bit, elapsedSeconds, true);
    }
  };

  const updateRandomAttackMovement = (
    bit: RuntimeBit,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    recordExplorationPosition(bit, elapsedSeconds);
    bit.searchRetrySeconds = Math.max(
      0,
      bit.searchRetrySeconds - deltaSeconds
    );
    bit.randomAttackRouteSeconds = Math.max(
      0,
      bit.randomAttackRouteSeconds - deltaSeconds
    );
    if (bit.routePurpose === "search") {
      const state = advanceAgent(
        bit,
        bit.searchSurfaceSpeed,
        deltaSeconds,
        elapsedSeconds
      );
      if (state === "transition" || state === "clearing-transition") {
        return;
      }
      if (
        state === "arrived" ||
        state === "unreachable" ||
        (state === "blocked" && bit.activeTransition === null)
      ) {
        clearRoute(bit);
        bit.searchRetrySeconds = SEARCH_RETRY_SECONDS;
      } else if (state === "blocked") {
        return;
      } else if (bit.randomAttackRouteSeconds === 0) {
        clearRoute(bit);
      }
    }
    if (
      bit.navigationLocation &&
      bit.searchRetrySeconds === 0 &&
      allowedSearchRoutePlanIds.has(bit.id)
    ) {
      bit.hasAttemptedSearchRoute = true;
      if (
        !planRandomAttackRoute(
          bit,
          elapsedSeconds,
          bit.profile.randomAttackSpeed
        )
      ) {
        bit.searchRetrySeconds = SEARCH_RETRY_SECONDS;
      }
    }
    if (bit.routePurpose === null) {
      syncStationaryPosition(bit, elapsedSeconds, true);
    }
  };

  const updateChaseRoute = (
    bit: RuntimeBit,
    targetPosition: Vector3,
    targetAreaSnapshot: V2TargetNavigationAreaSnapshot | null,
    deltaSeconds: number,
    elapsedSeconds: number,
    surfaceSpeedOverride: number | null = null
  ): ChaseRouteUpdateState => {
    bit.mode = "chase";
    let navigationTargetPosition = targetPosition;
    if (targetAreaSnapshot !== null) {
      if (
        bit.pursuitActorAreaCursor === null ||
        bit.pursuitActorAreaPosition === null
      ) {
        bit.pursuitActorAreaCursor =
          spatial.navigationAreas.locate(bit.root.position);
        bit.pursuitActorAreaPosition = bit.root.position.clone();
      }
      const actorAreaId = bit.pursuitActorAreaCursor.areaId;
      const targetAreaChanged =
        bit.pursuitTargetId !== targetAreaSnapshot.targetId ||
        bit.pursuitTargetAreaId !== targetAreaSnapshot.areaId ||
        bit.pursuitTargetAreaRevision !== targetAreaSnapshot.revision;
      if (targetAreaChanged) {
        bit.pursuitTargetId = targetAreaSnapshot.targetId;
        bit.pursuitTargetAreaId = targetAreaSnapshot.areaId;
        bit.pursuitTargetAreaRevision = targetAreaSnapshot.revision;
        bit.pursuitPhase =
          actorAreaId === targetAreaSnapshot.areaId
            ? "detail"
            : "area";
        bit.pursuitAnchor = targetAreaSnapshot.anchor.clone();
        bit.routeRefreshSeconds = 0;
      } else if (
        bit.pursuitPhase === "area" &&
        actorAreaId === targetAreaSnapshot.areaId
      ) {
        bit.pursuitPhase = "detail";
        bit.routeRefreshSeconds = 0;
      }
      navigationTargetPosition =
        bit.pursuitPhase === "area"
          ? bit.pursuitAnchor!
          : targetPosition;
    }
    bit.routeRefreshSeconds = Math.max(
      0,
      bit.routeRefreshSeconds - deltaSeconds
    );
    const evaluateMovementState = (
      state: ReturnType<typeof advanceAgent>,
      plannedWindowTransitionId: string | null
    ): ChaseRouteUpdateState => {
      const arrivalDistance = Vector3.Distance(
        bit.root.position,
        navigationTargetPosition
      );
      const failedBeforeTarget =
        state === "blocked" ||
        state === "unreachable" ||
        (state === "arrived" && arrivalDistance > FIRE_RANGE);
      if (failedBeforeTarget) {
        if (plannedWindowTransitionId !== null) {
          bit.failedChaseWindowTransitionId =
            plannedWindowTransitionId;
          bit.failedChaseWindowPenaltySeconds =
            CHASE_WINDOW_FAILURE_PENALTY_SECONDS;
        }
        clearRoute(bit);
        if (bit.lastChasePlanTargetId !== bit.targetId) {
          bit.routeRefreshSeconds = 0;
          return "replan";
        }
        if (plannedWindowTransitionId !== null) {
          bit.routeRefreshSeconds = 0;
          return "replan";
        }
        return "unreachable";
      }
      return state === "arrived" ? "arrived" : "moving";
    };
    if (bit.activeTransition) {
      const plannedWindowTransitionId =
        bit.chaseWindowTransitionId;
      const state = advanceAgent(
        bit,
        surfaceSpeedOverride ?? bit.profile.chaseSpeed,
        deltaSeconds,
        elapsedSeconds
      );
      return evaluateMovementState(
        state,
        plannedWindowTransitionId
      );
    }
    if (!bit.navigationLocation) {
      return "unreachable";
    }

    const hasChaseRoute =
      bit.routePurpose === "chase" && bit.routeDestination !== null;
    const shouldRefresh =
      bit.routeRefreshSeconds === 0 &&
      (!hasChaseRoute ||
        Vector3.Distance(
          getBitFlightWorldPosition(bit.routeDestination!),
          navigationTargetPosition
        ) > TARGET_ROUTE_MOVE_THRESHOLD);
    if (shouldRefresh && allowedChaseRoutePlanIds.has(bit.id)) {
      bit.lastChasePlanTargetId = bit.targetId;
      const selected = measureRoutePlan(
        "chase",
        () => selectTargetDestination(bit, navigationTargetPosition)
      );
      if (selected) {
        if (!assignRoute(
          bit,
          selected,
          "chase"
        )) {
          return "unreachable";
        }
        bit.lastSeenDestination = selected.destination;
      } else {
        clearRoute(bit);
        bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
        return "unreachable";
      }
    }

    if (bit.routePurpose === "chase") {
      const surfaceSpeedThreshold = config.combatEnabled
        ? FIRE_RANGE
        : bit.profile.visionRange;
      const targetDistance = Vector3.Distance(
        bit.root.position,
        navigationTargetPosition
      );
      const speed =
        surfaceSpeedOverride ??
        (targetDistance > surfaceSpeedThreshold
          ? bit.profile.searchSpeed
          : bit.profile.chaseSpeed);
      const plannedWindowTransitionId =
        bit.chaseWindowTransitionId;
      const state = advanceAgent(
        bit,
        speed,
        deltaSeconds,
        elapsedSeconds
      );
      return evaluateMovementState(
        state,
        plannedWindowTransitionId
      );
    } else {
      syncStationaryPosition(bit, elapsedSeconds, true);
      return "moving";
    }
  };

  const projectCarpetLocation = (
    origin: BitFlightLocation,
    desiredPosition: Vector3
  ) => {
    const band = navigation.getBand(origin);
    if (!band) {
      throw new Error("カーペット移動中の飛行帯がありません。");
    }
    const heightMode =
      desiredPosition.y < band.minimumCenterHeight
        ? origin.heightMode
        : ("band" as const);
    const projected = navigation.constrainMovement(
      origin,
      desiredPosition,
      heightMode
    );
    if (
      !projected ||
      !sameBand(origin, projected) ||
      Vector3.Distance(
        getBitFlightWorldPosition(projected),
        desiredPosition
      ) > CARPET_PROJECTION_TOLERANCE
    ) {
      return null;
    }
    return projected;
  };

  const getCarpetTargetHeight = (
    origin: BitFlightLocation,
    targetAimPosition: Vector3
  ) => {
    const band = navigation.getBand(origin);
    if (!band) {
      return null;
    }
    return clamp(
      targetAimPosition.y + CARPET_TARGET_HEIGHT_OFFSET,
      band.minimumCenterHeight,
      band.maximumCenterHeight
    );
  };

  const rotateCarpetDirection = (
    direction: Vector3,
    radians: number
  ) => {
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return new Vector3(
      direction.x * cosine - direction.z * sine,
      0,
      direction.x * sine + direction.z * cosine
    ).normalize();
  };

  const steerCarpetDirection = (
    current: Vector3,
    desired: Vector3,
    deltaSeconds: number
  ) => {
    const dot = clamp(Vector3.Dot(current, desired), -1, 1);
    if (dot <= 0) {
      return current;
    }
    const angle = Math.acos(dot);
    if (angle <= 0.0001) {
      return current;
    }
    const maximumStep = CARPET_TURN_RATE * deltaSeconds;
    const interpolation = Math.min(1, maximumStep / angle);
    const sine = Math.sin(angle);
    const startScale =
      Math.sin((1 - interpolation) * angle) / sine;
    const endScale = Math.sin(interpolation * angle) / sine;
    const turned = current
      .scale(startScale)
      .add(desired.scale(endScale));
    const blended = Vector3.Lerp(
      current,
      turned,
      CARPET_STEER_STRENGTH
    );
    blended.y = 0;
    return blended.lengthSquared() > 0.0001
      ? blended.normalize()
      : current;
  };

  const tryCreateCarpetFollowers = (
    leader: RuntimeBit,
    destination: BitFlightLocation,
    targetAimPosition: Vector3,
    direction: Vector3
  ) => {
    if (
      !leader.navigationLocation ||
      !sameBand(leader.navigationLocation, destination)
    ) {
      leader.mode = "chase";
      return false;
    }
    const right = new Vector3(-direction.z, 0, direction.x);
    const offsets = [
      -CARPET_FORMATION_SPACING,
      CARPET_FORMATION_SPACING
    ] as const;
    const followerLocations: BitFlightLocation[] = [];
    for (const offset of offsets) {
      const desiredPosition = getBitFlightWorldPosition(
        leader.navigationLocation
      ).add(right.scale(offset));
      const projected = projectCarpetLocation(
        leader.navigationLocation,
        desiredPosition
      );
      if (
        !projected ||
        findMovementCollision(
          leader.root.position,
          getBitFlightWorldPosition(projected)
        )
      ) {
        leader.mode = "chase";
        return false;
      }
      followerLocations.push(projected);
    }
    for (let index = 0; index < offsets.length; index += 1) {
      const follower = createRuntimeBit(
        followerLocations[index],
        "carpet-follower",
        "carpet-follower",
        leader.profile
      );
      if (
        diagnosticsEnabled &&
        (follower.targetId !== leader.targetId ||
          follower.targetProvenance !== leader.targetProvenance)
      ) {
        diagnosticForcedTargetChanges += 1;
      }
      follower.targetId = leader.targetId;
      follower.targetProvenance = leader.targetProvenance;
      follower.visualSightCheckPriority = false;
      follower.alertLeaderId = leader.alertLeaderId;
      follower.lastSeenAimPosition = targetAimPosition.clone();
      follower.lastSeenDestination = destination;
      follower.carpetLeaderId = leader.id;
      follower.carpetOffset = offsets[index];
      follower.lockedDirection.copyFrom(direction);
      follower.carpetAimStartDirection.copyFrom(direction);
      follower.carpetAimSeconds = CARPET_AIM_TURN_SECONDS;
      registerCarpetFollower(leader, follower);
      const fireInterval = randomV2BitFireInterval(
        "carpet",
        follower.profile,
        nextRandom
      );
      follower.fireSeconds = fireInterval * nextRandom();
      syncStationaryPosition(follower, 0, false);
    }
    leader.carpetLeaderId = leader.id;
    return true;
  };

  const updateCarpet = (
    leader: RuntimeBit,
    targetPosition: Vector3,
    targetAimPosition: Vector3,
    deltaSeconds: number
  ) => {
    if (!leader.navigationLocation) {
      abortCarpetAtObstacle(leader);
      return;
    }
    if (
      leader.carpetLeaderId !== null &&
      [...(carpetFollowersByLeaderId.get(leader.id) ?? [])].some(
        (follower) => !isBitReadyForAi(follower)
      )
    ) {
      return;
    }
    if (
      leader.carpetLeaderId === null &&
      !allowedChaseRoutePlanIds.has(leader.id)
    ) {
      return;
    }
    const targetHasSameBandCandidate = buildTargetLocationCandidates(
      targetPosition
    ).some((candidate) =>
      sameBand(leader.navigationLocation!, candidate.destination)
    );
    if (!targetHasSameBandCandidate) {
      convertCarpetToChase(leader);
      return;
    }
    const carpetTargetHeight = getCarpetTargetHeight(
      leader.navigationLocation,
      targetAimPosition
    );
    if (carpetTargetHeight === null) {
      abortCarpetAtObstacle(leader);
      return;
    }
    leader.routeRefreshSeconds = Math.max(
      0,
      leader.routeRefreshSeconds - deltaSeconds
    );
    if (leader.carpetLeaderId === null) {
      const selected = measureRoutePlan(
        "chase",
        () => selectSameBandTargetDestination(leader, targetPosition)
      );
      if (
        !selected ||
        routeContainsTransition(selected.route) ||
        !sameBand(leader.navigationLocation, selected.destination)
      ) {
        convertCarpetToChase(leader);
        return;
      }
      const targetDirection = normalizeHorizontal(
        getBitFlightWorldPosition(selected.destination).subtract(
          leader.root.position
        )
      );
      const initialAimDirection = leader.root
        .getDirection(Vector3.Forward())
        .normalize();
      const scatterRadians =
        (nextRandom() - 0.5) * CARPET_AIM_SCATTER_RADIANS;
      const initialDirection = rotateCarpetDirection(
        targetDirection,
        scatterRadians
      );
      leader.lockedDirection.copyFrom(initialDirection);
      leader.carpetAimStartDirection.copyFrom(initialAimDirection);
      leader.carpetAimSeconds = 0;
      leader.lastSeenDestination = selected.destination;
      leader.lastChasePlanTargetId = leader.targetId;
      leader.routeDestination = selected.destination;
      leader.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      if (
        !tryCreateCarpetFollowers(
          leader,
          selected.destination,
          targetAimPosition,
          initialDirection
        )
      ) {
        convertCarpetToChase(leader);
        return;
      }
      return;
    } else {
      const shouldRefresh =
        leader.routeRefreshSeconds === 0 &&
        (leader.routeDestination === null ||
          Vector3.Distance(
            getBitFlightWorldPosition(leader.routeDestination),
            targetPosition
          ) > TARGET_ROUTE_MOVE_THRESHOLD);
      if (
        shouldRefresh &&
        allowedChaseRoutePlanIds.has(leader.id)
      ) {
        const selected = measureRoutePlan(
          "chase",
          () =>
            selectSameBandTargetDestination(
              leader,
              targetPosition
            )
        );
        if (!selected) {
          abortCarpetAtObstacle(leader);
          return;
        }
        leader.lastSeenDestination = selected.destination;
        leader.lastChasePlanTargetId = leader.targetId;
        leader.routeDestination = selected.destination;
        leader.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      }
    }

    const toTarget = new Vector3(
      targetPosition.x - leader.root.position.x,
      0,
      targetPosition.z - leader.root.position.z
    );
    let direction = normalizeHorizontal(leader.lockedDirection);
    let passDot = 0;
    if (toTarget.lengthSquared() > 0.0001) {
      const targetDirection = toTarget.normalize();
      passDot = Vector3.Dot(direction, toTarget);
      if (passDot >= 0) {
        direction = steerCarpetDirection(
          direction,
          targetDirection,
          deltaSeconds
        );
        leader.lockedDirection.copyFrom(direction);
        passDot = Vector3.Dot(direction, toTarget);
      }
    }
    if (passDot < 0) {
      leader.carpetPassSeconds += deltaSeconds;
    } else {
      leader.carpetPassSeconds = 0;
    }

    const stepDistance =
      leader.profile.carpetSpeed * deltaSeconds;
    const currentLeaderPosition = getBitFlightWorldPosition(
      leader.navigationLocation
    );
    const proposedLeaderPosition = currentLeaderPosition.add(
      direction.scale(stepDistance)
    );
    proposedLeaderPosition.y += clamp(
      carpetTargetHeight - currentLeaderPosition.y,
      -CARPET_HEIGHT_SPEED * deltaSeconds,
      CARPET_HEIGHT_SPEED * deltaSeconds
    );
    const proposedLeaderLocation = projectCarpetLocation(
      leader.navigationLocation,
      proposedLeaderPosition
    );
    if (!proposedLeaderLocation) {
      abortCarpetAtObstacle(leader);
      return;
    }

    const right = new Vector3(-direction.z, 0, direction.x);
    const followers = [
      ...(carpetFollowersByLeaderId.get(leader.id) ?? [])
    ];
    const followerDestinations: BitFlightLocation[] = [];
    for (const follower of followers) {
      if (!follower.navigationLocation) {
        abortCarpetAtObstacle(leader);
        return;
      }
      const desiredPosition = getBitFlightWorldPosition(
        proposedLeaderLocation
      ).add(right.scale(follower.carpetOffset));
      const projected = projectCarpetLocation(
        follower.navigationLocation,
        desiredPosition
      );
      if (!projected) {
        abortCarpetAtObstacle(leader);
        return;
      }
      followerDestinations.push(projected);
    }

    const proposedLeaderRoot =
      getBitFlightWorldPosition(proposedLeaderLocation);
    const leaderBlocked = findMovementCollision(
      leader.root.position,
      proposedLeaderRoot
    );
    const followerBlocked = followers.some((follower, index) =>
      findMovementCollision(
        follower.root.position,
        getBitFlightWorldPosition(followerDestinations[index])
      )
    );
    if (leaderBlocked || followerBlocked) {
      abortCarpetAtObstacle(leader);
      return;
    }

    leader.navigationLocation = proposedLeaderLocation;
    leader.root.position.copyFrom(proposedLeaderRoot);
    leader.pursuitActorAreaCursor = null;
    leader.pursuitActorAreaPosition = null;
    const tiltedAimDirection = new Vector3(
      direction.x,
      -1,
      direction.z
    ).normalize();
    const carpetAimDirection = Vector3.Lerp(
      new Vector3(0, -1, 0),
      tiltedAimDirection,
      CARPET_AIM_BLEND
    ).normalize();
    leader.carpetAimSeconds = Math.min(
      CARPET_AIM_TURN_SECONDS,
      leader.carpetAimSeconds + deltaSeconds
    );
    const aimProgress =
      leader.carpetAimSeconds / CARPET_AIM_TURN_SECONDS;
    const leaderAimDirection = Vector3.Lerp(
      leader.carpetAimStartDirection,
      carpetAimDirection,
      aimProgress
    ).normalize();
    pointBitAt(
      leader,
      leader.root.position.add(leaderAimDirection)
    );
    for (let index = 0; index < followers.length; index += 1) {
      const follower = followers[index];
      follower.navigationLocation = followerDestinations[index];
      follower.lockedDirection.copyFrom(direction);
      follower.root.position.copyFrom(
        getBitFlightWorldPosition(followerDestinations[index])
      );
      follower.pursuitActorAreaCursor = null;
      follower.pursuitActorAreaPosition = null;
      pointBitAt(
        follower,
        follower.root.position.add(carpetAimDirection)
      );
    }
  };

  const emitBeamWhenReady = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    beamRequests: V2BeamRequest[],
    originKind:
      | "bit-chase"
      | "bit-fixed"
      | "bit-random"
      | "bit-carpet",
    requestedDirection: Vector3,
    requireTargetInRange: boolean
  ) => {
    if (bit.attackCooldownSeconds > 0) {
      return;
    }
    if (bit.fireTelegraphSeconds > 0) {
      bit.fireTelegraphSeconds = Math.max(
        0,
        bit.fireTelegraphSeconds - deltaSeconds
      );
      if (bit.fireTelegraphSeconds > 0) {
        return;
      }
      bit.root.computeWorldMatrix(true);
      const origin = bit.muzzle.getAbsolutePosition();
      beamRequests.push(
        Object.freeze({
          sourceId: bit.id,
          originKind,
          targetPolicy: Object.freeze({
            kind: "alive-humans" as const
          }),
          origin: origin.clone(),
          direction: bit.fireLockDirection.clone(),
          speed: BEAM_SPEED,
          maximumLifetime: BEAM_MAXIMUM_LIFETIME
        })
      );
      bit.fireSeconds = randomV2BitFireInterval(
        getBeamMode(bit.mode),
        bit.profile,
        nextRandom
      );
      return;
    }

    bit.fireSeconds = Math.max(0, bit.fireSeconds - deltaSeconds);
    if (
      bit.fireSeconds > 0 ||
      (requireTargetInRange &&
        Vector3.Distance(bit.root.position, target.aimPosition) >
          FIRE_RANGE)
    ) {
      return;
    }
    if (requestedDirection.lengthSquared() === 0) {
      return;
    }
    bit.fireLockDirection.copyFrom(requestedDirection.normalize());
    bit.fireTelegraphSeconds = V2_BIT_FIRE_TELEGRAPH_SECONDS;
  };

  const enterPostAlertMode = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) => {
    const nextMode =
      bit.postAlertMode ?? selectV2BitPostAlertMode(nextRandom);
    bit.targetProvenance = "visual";
    bit.visualSightCheckPriority = false;
    bit.alertLeaderId = null;
    bit.lastSeenAimPosition = target.aimPosition.clone();
    bit.personalityRetargetCooldownSeconds =
      TARGET_PERSONALITY_RETARGET_INTERVAL_SECONDS;
    activateCombatMode(bit, nextMode, target);
  };

  const returnAlertReceiverToSearch = (
    bit: RuntimeBit,
    applyCooldown: boolean
  ) => {
    clearRoute(bit);
    bit.mode = "search";
    bit.targetId = null;
    bit.targetProvenance = null;
    bit.visualSightCheckPriority = true;
    bit.alertLeaderId = null;
    bit.lastSeenAimPosition = null;
    bit.lastSeenDestination = null;
    bit.lastChasePlanTargetId = null;
    bit.targetLostSeconds = 0;
    bit.sightTargetId = null;
    bit.sightTargetVisible = false;
    bit.modeTimerSeconds = 0;
    bit.fireTelegraphSeconds = 0;
    bit.postAlertMode = null;
    bit.hasAttemptedSearchRoute = false;
    if (applyCooldown) {
      bit.attackCooldownSeconds = V2_BIT_ATTACK_COOLDOWN_SECONDS;
    }
  };

  const cancelInternalAlert = (alertKey: string) => {
    const alert = activeAlerts.get(alertKey);
    if (!alert?.internalBitAlert) {
      return;
    }
    removeActiveAlert(alertKey);
    closedInternalAlertKeys.add(alertKey);
    for (const bit of bits) {
      const isLeader =
        bit.id === alert.leaderId && bit.mode === "alert-send";
      const isReceiver =
        alert.receiverIds.has(bit.id) &&
        bit.mode === "alert-receive" &&
        bit.alertLeaderId === alert.leaderId &&
        bit.targetId === alert.targetId;
      if (isLeader || isReceiver) {
        returnAlertReceiverToSearch(bit, true);
      }
    }
  };

  const updateAlertReceive = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    targetVisible: boolean,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    bit.modeTimerSeconds = Math.max(
      0,
      bit.modeTimerSeconds - deltaSeconds
    );
    const alertKey =
      bit.alertLeaderId === null
        ? null
        : buildAlertKey(bit.alertLeaderId, target.id);
    const alert =
      alertKey === null ? null : activeAlerts.get(alertKey) ?? null;
    const leaderPosition =
      bit.alertLeaderId === null
        ? null
        : bitsById.get(bit.alertLeaderId)?.root.position ??
          targetsById.get(bit.alertLeaderId)?.aimPosition ??
          null;
    if (
      !alert ||
      !leaderPosition ||
      bit.modeTimerSeconds === 0
    ) {
      returnAlertReceiverToSearch(bit, true);
      return;
    }
    if (
      targetVisible ||
      Vector3.Distance(bit.root.position, leaderPosition) <=
        ALERT_GATHER_RADIUS
    ) {
      alert.gatheredIds.add(bit.id);
      enterPostAlertMode(bit, target);
      return;
    }
    updateChaseRoute(
      bit,
      leaderPosition,
      null,
      deltaSeconds,
      elapsedSeconds,
      bit.profile.searchSpeed * 5
    );
    bit.mode = "alert-receive";
    pointBitAt(bit, leaderPosition);
  };

  const updateAlertSend = (
    bit: RuntimeBit,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    bit.modeTimerSeconds = Math.max(
      0,
      bit.modeTimerSeconds - deltaSeconds
    );
    syncStationaryPosition(bit, elapsedSeconds, false);
    bit.root.lookAt(bit.root.position.add(Vector3.Up()));
    const alertKey =
      bit.targetId === null
        ? null
        : buildAlertKey(bit.id, bit.targetId);
    const alert =
      alertKey === null ? null : activeAlerts.get(alertKey) ?? null;
    const gathered =
      alert !== null &&
      alert.gatheredIds.size >= alert.receiverIds.size;
    if (!alert || gathered || bit.modeTimerSeconds === 0) {
      if (alertKey !== null) {
        removeActiveAlert(alertKey);
        closedInternalAlertKeys.add(alertKey);
      }
      const forward = bit.root
        .getDirection(Vector3.Forward())
        .clone();
      forward.y = 0;
      if (forward.lengthSquared() > 0) {
        bit.root.lookAt(
          bit.root.position.add(forward.normalize())
        );
      }
      returnAlertReceiverToSearch(
        bit,
        !gathered && bit.modeTimerSeconds === 0
      );
    }
  };

  const updateFixedAttack = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    elapsedSeconds: number,
    beamRequests: V2BeamRequest[]
  ) => {
    bit.modeTimerSeconds = Math.max(
      0,
      bit.modeTimerSeconds - deltaSeconds
    );
    syncStationaryPosition(bit, elapsedSeconds, false);
    const direction = bit.profile.isRed
      ? target.aimPosition.subtract(bit.root.position)
      : bit.lockedDirection;
    pointBitAt(bit, bit.root.position.add(direction));
    emitBeamWhenReady(
      bit,
      target,
      deltaSeconds,
      beamRequests,
      "bit-fixed",
      direction,
      false
    );
  };

  const updateRandomAttack = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    elapsedSeconds: number,
    beamRequests: V2BeamRequest[]
  ) => {
    bit.modeTimerSeconds = Math.max(
      0,
      bit.modeTimerSeconds - deltaSeconds
    );
    const telegraphing = bit.fireTelegraphSeconds > 0;
    if (telegraphing) {
      syncStationaryPosition(bit, elapsedSeconds, false);
    } else {
      updateRandomAttackMovement(
        bit,
        deltaSeconds,
        elapsedSeconds
      );
    }
    bit.mode = "random";
    const direction = bit.root
      .getDirection(Vector3.Forward())
      .normalize();
    emitBeamWhenReady(
      bit,
      target,
      deltaSeconds,
      beamRequests,
      "bit-random",
      direction,
      false
    );
  };

  const updateHold = (
    bit: RuntimeBit,
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    syncStationaryPosition(bit, elapsedSeconds, false);
    const target =
      bit.holdTargetId === null
        ? null
        : targetsById.get(bit.holdTargetId) ?? null;
    if (bit.profile.isRed) {
      bit.holdTimerSeconds = Math.max(
        0,
        bit.holdTimerSeconds - deltaSeconds
      );
    }
    const shouldRelease =
      !target ||
      !isV2HitState(target.state) ||
      (bit.profile.isRed && bit.holdTimerSeconds === 0);
    if (!shouldRelease) {
      return;
    }
    bit.mode = bit.holdReturnMode ?? "search";
    bit.holdReturnMode = null;
    bit.holdTargetId = null;
    bit.holdTimerSeconds = 0;
    bit.fireTelegraphSeconds = 0;
    if (!target || !isTargetable(target)) {
      abandonTarget(bit, elapsedSeconds);
    }
  };

  const getFrameView = () => {
    if (frameView === null) {
      const activeBits = bits.filter(
        (bit) => !isBitSpawnPending(bit)
      );
      const actorSpheres = Object.freeze(
        activeBits.map((bit) =>
          Object.freeze({
            id: bit.id,
            kind: "bit" as const,
            center: bit.root.position.clone(),
            radius: BIT_ACTOR_RADIUS
          })
        )
      );
      const targetStates = Object.freeze(
        activeBits.map((bit) =>
          Object.freeze({
            bitId: bit.id,
            mode: bit.mode,
            isRed: bit.profile.isRed,
            statMultiplier: bit.profile.statMultiplier,
            modeTimerSeconds: bit.modeTimerSeconds,
            attackCooldownSeconds: bit.attackCooldownSeconds,
            carpetCooldownSeconds: bit.carpetCooldownSeconds,
            targetSelectionPersonality:
              bit.targetSelectionPersonality,
            targetId: bit.targetId,
            provenance: bit.targetProvenance,
            alertLeaderId: bit.alertLeaderId
          })
        )
      );
      const flightStateSources: readonly V2BitFlightStateSource[] =
        activeBits.map((bit, index) => {
          const location = bit.navigationLocation;
          const activeTransition = bit.activeTransition;
          return {
            actor: actorSpheres[index],
            zoneId: location?.zoneId ?? null,
            bandId: location?.bandId ?? null,
            safeCenterHeight: location?.safeCenterHeight ?? null,
            heightMode: location?.heightMode ?? null,
            routePurpose: bit.routePurpose,
            activeTransitionId:
              activeTransition?.transition.id ?? null,
            activeTransitionKind:
              activeTransition?.transition.kind ?? null,
            activeTransitionReversed:
              activeTransition?.reversed ?? false,
            agentState: bit.flightAgent.getState()
          };
        });
      let flightStates: readonly V2BitFlightState[] | null = null;
      frameView = Object.freeze({
        actorSpheres,
        populationBitCount: getPopulationBitCount(),
        beamRequests: frameBeamRequests,
        targetStates,
        get flightStates() {
          flightStates ??= Object.freeze(
            flightStateSources.map((source) =>
              Object.freeze({
                bitId: source.actor.id,
                zoneId: source.zoneId,
                bandId: source.bandId,
                position: source.actor.center.clone(),
                safeCenterHeight: source.safeCenterHeight,
                heightMode: source.heightMode,
                routePurpose: source.routePurpose,
                activeTransition:
                  source.activeTransitionId !== null
                    ? Object.freeze({
                        id: source.activeTransitionId,
                        kind: source.activeTransitionKind!,
                        reversed:
                          source.activeTransitionReversed
                      })
                    : null,
                agentState: source.agentState
              })
            )
          );
          return flightStates;
        },
        diagnostics: frameDiagnostics
      });
    }
    return frameView;
  };

  const spawnTimedReinforcement = () => {
    const location = sampleSpawnLocations(
      1,
      config.minimumSpawnDistance,
      bits.map((bit) => bit.root.position)
    )[0];
    createRuntimeBit(location, "normal");
  };

  return {
    update: ({ deltaSeconds, elapsedSeconds, targets, externalAlerts }) => {
      assertNonNegativeFiniteNumber("ビット更新deltaSeconds", deltaSeconds);
      assertNonNegativeFiniteNumber("ビット更新elapsedSeconds", elapsedSeconds);
      invalidateFrameViews();
      recentExplorationSamplesForUpdate = null;
      resetDiagnostics();
      const actionsSuspended = aiSuspended || hostileActionsSuspended;
      syncDynamicSpatialRevision();
      updateFadingCarpetFollowers(deltaSeconds);
      spawnBlockedBitIdsForUpdate.clear();
      for (const bit of bits) {
        if (!isBitSpawnPending(bit)) {
          continue;
        }
        spawnBlockedBitIdsForUpdate.add(bit.id);
        if (!aiSuspended) {
          updateBitSpawnVisual(bit, deltaSeconds);
        }
      }
      const targetsById = new Map(
        targets.map((target) => [target.id, target] as const)
      );
      for (const bit of bits) {
        if (!isBitReadyForAi(bit)) {
          continue;
        }
        bit.personalityRetargetCooldownSeconds = Math.max(
          0,
          bit.personalityRetargetCooldownSeconds - deltaSeconds
        );
      }
      const isSightCheckEligible = (bit: RuntimeBit) =>
        !actionsSuspended &&
        isBitReadyForAi(bit) &&
        bit.mode !== "carpet-follower" &&
        bit.mode !== "hold" &&
        !(
          bit.mode === "search" &&
          bit.attackCooldownSeconds > deltaSeconds
        );
      let sightCheckEligibleCount = 0;
      for (const bit of bits) {
        if (isSightCheckEligible(bit)) {
          sightCheckEligibleCount += 1;
        }
      }
      sightCheckCredit = Math.min(
        sightCheckEligibleCount,
        sightCheckCredit +
          sightCheckEligibleCount *
            (deltaSeconds / TARGET_SIGHT_CHECK_INTERVAL_SECONDS)
      );
      const sightCheckSelection = selectRoundRobinBitIds(
        sightCheckCursor,
        Math.min(
          Math.floor(sightCheckCredit),
          TARGET_SIGHT_CHECK_MAXIMUM_PER_UPDATE
        ),
        isSightCheckEligible,
        (bit) => bit.visualSightCheckPriority
      );
      const allowedSightCheckIds = sightCheckSelection.ids;
      sightCheckCursor = sightCheckSelection.nextCursor;
      sightCheckCredit -= allowedSightCheckIds.size;
      const isPersonalityRetargetCandidate = (bit: RuntimeBit) => {
        if (
          actionsSuspended ||
          !isBitReadyForAi(bit) ||
          bit.targetSelectionPersonality !== "nearest-visible" ||
          bit.mode !== "chase" ||
          bit.targetProvenance !== "visual" ||
          bit.targetId === null
        ) {
          return false;
        }
        const target = targetsById.get(bit.targetId);
        return target !== undefined && isTargetable(target);
      };
      const isPersonalityRetargetEligible = (bit: RuntimeBit) =>
        isPersonalityRetargetCandidate(bit) &&
        bit.personalityRetargetCooldownSeconds === 0;
      let personalityRetargetCandidateCount = 0;
      for (const bit of bits) {
        if (isPersonalityRetargetCandidate(bit)) {
          personalityRetargetCandidateCount += 1;
        }
      }
      personalityRetargetCredit = Math.min(
        personalityRetargetCandidateCount,
        personalityRetargetCredit +
          personalityRetargetCandidateCount *
            (deltaSeconds /
              TARGET_PERSONALITY_RETARGET_INTERVAL_SECONDS)
      );
      const personalityRetargetMaximumForUpdate = Math.min(
        Math.ceil(
          personalityRetargetCandidateCount *
            (deltaSeconds /
              TARGET_PERSONALITY_RETARGET_INTERVAL_SECONDS)
        ),
        TARGET_PERSONALITY_RETARGET_MAXIMUM_PER_UPDATE
      );
      const personalityRetargetSelection =
        selectRoundRobinBitIds(
          personalityRetargetCursor,
          Math.min(
            Math.floor(personalityRetargetCredit),
            personalityRetargetMaximumForUpdate
          ),
          isPersonalityRetargetEligible,
          () => false
        );
      const allowedPersonalityRetargetIds =
        personalityRetargetSelection.ids;
      personalityRetargetCursor =
        personalityRetargetSelection.nextCursor;
      personalityRetargetCredit -=
        allowedPersonalityRetargetIds.size;
      const searchPlanSelection = selectRoundRobinBitIds(
        searchRoutePlanCursor,
        SEARCH_ROUTE_PLAN_BUDGET_PER_UPDATE,
        (bit) =>
          isBitReadyForAi(bit) &&
          bit.navigationLocation !== null &&
          bit.pendingEscapeThreatPosition === null &&
          bit.searchRetrySeconds <= deltaSeconds &&
          (bit.mode === "search"
            ? bit.targetId === null &&
              (bit.routePurpose === null ||
                (bit.routePurpose === "search" &&
                  bit.searchRouteKind === "normal" &&
                  bit.normalPatrolOrigin !== null &&
                  bit.routeDestination !== null &&
                  sameBand(
                    bit.normalPatrolOrigin,
                    bit.routeDestination
                  ) &&
                  bit.queuedNormalPatrolLeg === null &&
                  bit.activeTransition === null))
            : bit.mode === "random" &&
              (bit.routePurpose === null ||
                (bit.routePurpose === "search" &&
                  bit.searchRouteKind === "random" &&
                  bit.randomAttackRouteSeconds <= deltaSeconds))),
        (bit) => !bit.hasAttemptedSearchRoute
      );
      allowedSearchRoutePlanIds = searchPlanSelection.ids;
      searchRoutePlanCursor = searchPlanSelection.nextCursor;
      const chasePlanSelection = selectRoundRobinBitIds(
        chaseRoutePlanCursor,
        CHASE_ROUTE_PLAN_BUDGET_PER_UPDATE,
        (bit) => {
          if (
            !isBitReadyForAi(bit) ||
            (bit.mode !== "chase" &&
              bit.mode !== "carpet-leader" &&
              bit.mode !== "alert-receive") ||
            bit.targetId === null ||
            bit.navigationLocation === null ||
            bit.activeTransition !== null ||
            bit.routeRefreshSeconds > deltaSeconds
          ) {
            return false;
          }
          const target = targetsById.get(bit.targetId);
          if (!target || !isTargetable(target)) {
            return false;
          }
          const chaseTargetPosition =
            bit.mode === "alert-receive" && bit.alertLeaderId !== null
              ? bitsById.get(bit.alertLeaderId)?.root.position ??
                targetsById.get(bit.alertLeaderId)?.aimPosition ??
                null
              : target.aimPosition;
          if (chaseTargetPosition === null) {
            return false;
          }
          if (bit.mode === "carpet-leader") {
            return (
              bit.carpetLeaderId === null ||
              bit.routeDestination === null ||
              Vector3.Distance(
                getBitFlightWorldPosition(bit.routeDestination),
                chaseTargetPosition
              ) > TARGET_ROUTE_MOVE_THRESHOLD
            );
          }
          return (
            bit.routePurpose !== "chase" ||
            bit.routeDestination === null ||
            Vector3.Distance(
              getBitFlightWorldPosition(bit.routeDestination),
              chaseTargetPosition
            ) > TARGET_ROUTE_MOVE_THRESHOLD
          );
        },
        (bit) => bit.lastChasePlanTargetId !== bit.targetId
      );
      allowedChaseRoutePlanIds = chasePlanSelection.ids;
      chaseRoutePlanCursor = chasePlanSelection.nextCursor;
      const escapePlanSelection = selectRoundRobinBitIds(
        escapeRoutePlanCursor,
        ESCAPE_ROUTE_PLAN_BUDGET_PER_UPDATE,
        (bit) =>
          isBitReadyForAi(bit) &&
          bit.mode === "search" &&
          bit.targetId === null &&
          bit.pendingEscapeThreatPosition !== null,
        () => false
      );
      allowedEscapeRoutePlanIds = escapePlanSelection.ids;
      escapeRoutePlanCursor = escapePlanSelection.nextCursor;
      remainingUnassignedEscapeRoutePlans =
        ESCAPE_ROUTE_PLAN_BUDGET_PER_UPDATE -
        allowedEscapeRoutePlanIds.size;
      const targetSpatialIndex = createV2HumanTargetSpatialIndex(
        targets,
        V2_STANDARD_BIT_COMBAT_PROFILE.visionRange
      );

      const incomingAlertKeys = new Set<string>();
      const incomingExternalAlertsByTarget = new Map<
        string,
        Readonly<{
          leaderId: string;
          remainingSeconds: number;
        }>
      >();
      for (const alert of externalAlerts) {
        if (
          alert.leaderId.length === 0 ||
          alert.targetId.length === 0 ||
          alert.leaderId === alert.targetId
        ) {
          throw new Error(
            "外部alertには異なる非空のleaderIdとtargetIdが必要です。"
          );
        }
        assertNonNegativeFiniteNumber(
          `外部alert(${alert.leaderId})の残り時間`,
          alert.remainingSeconds
        );
        if (alert.remainingSeconds === 0) {
          continue;
        }
        const alertKey = buildAlertKey(alert.leaderId, alert.targetId);
        incomingAlertKeys.add(alertKey);
        if (closedInternalAlertKeys.has(alertKey)) {
          continue;
        }
        const current = activeAlerts.get(alertKey);
        if (current?.internalBitAlert) {
          current.remainingSeconds = Math.max(
            current.remainingSeconds,
            alert.remainingSeconds
          );
          continue;
        }
        const currentIncoming = incomingExternalAlertsByTarget.get(
          alert.targetId
        );
        incomingExternalAlertsByTarget.set(
          alert.targetId,
          Object.freeze({
            leaderId:
              currentIncoming?.leaderId ?? alert.leaderId,
            remainingSeconds: Math.max(
              currentIncoming?.remainingSeconds ?? 0,
              alert.remainingSeconds
            )
          })
        );
      }
      const assignedExternalAlertReceiverIds = new Set<string>();
      for (const activeAlert of activeAlerts.values()) {
        if (activeAlert.internalBitAlert) {
          continue;
        }
        for (const receiverId of activeAlert.receiverIds) {
          assignedExternalAlertReceiverIds.add(receiverId);
        }
      }
      for (const [
        targetId,
        incoming
      ] of incomingExternalAlertsByTarget) {
        const currentAlertKey =
          externalAlertKeyByTargetId.get(targetId);
        const current =
          currentAlertKey === undefined
            ? null
            : activeAlerts.get(currentAlertKey) ?? null;
        if (current) {
          current.remainingSeconds = Math.max(
            current.remainingSeconds,
            incoming.remainingSeconds
          );
          continue;
        }
        const target = targetsById.get(targetId);
        if (!target || !isTargetable(target)) {
          continue;
        }
        const receivers = selectExternalAlertReceivers(
          incoming.leaderId,
          target,
          assignedExternalAlertReceiverIds
        );
        if (receivers.length === 0) {
          continue;
        }
        const receiverIds = new Set(
          receivers.map((receiver) => receiver.id)
        );
        const alertKey = buildAlertKey(
          incoming.leaderId,
          targetId
        );
        activeAlerts.set(alertKey, {
          leaderId: incoming.leaderId,
          targetId,
          remainingSeconds: incoming.remainingSeconds,
          receiverIds,
          gatheredIds: new Set<string>(),
          internalBitAlert: false
        });
        externalAlertKeyByTargetId.set(targetId, alertKey);
        for (const receiver of receivers) {
          assignedExternalAlertReceiverIds.add(receiver.id);
          setAlertTarget(receiver, target, incoming.leaderId);
        }
      }
      for (const alertKey of closedInternalAlertKeys) {
        if (!incomingAlertKeys.has(alertKey)) {
          closedInternalAlertKeys.delete(alertKey);
        }
      }

      for (const [alertKey, alert] of activeAlerts) {
        const target = targetsById.get(alert.targetId);
        if (!target || !isTargetable(target)) {
          removeActiveAlert(alertKey);
          if (alert.internalBitAlert) {
            closedInternalAlertKeys.add(alertKey);
          }
        }
      }
      const outOfRangeInternalAlertKeys: string[] = [];
      for (const [alertKey, alert] of activeAlerts) {
        if (!alert.internalBitAlert) {
          continue;
        }
        const leader = bitsById.get(alert.leaderId);
        const target = targetsById.get(alert.targetId);
        if (
          leader &&
          target &&
          Vector3.DistanceSquared(
            leader.root.position,
            target.aimPosition
          ) >
            (leader.profile.visionRange * 1.5) ** 2
        ) {
          outOfRangeInternalAlertKeys.push(alertKey);
        }
      }
      for (const alertKey of outOfRangeInternalAlertKeys) {
        cancelInternalAlert(alertKey);
      }

      const beamRequests: V2BeamRequest[] = [];
      pendingAlertRequests = [];
      for (const bit of [...bits]) {
        if (!isBitReadyForAi(bit)) {
          continue;
        }
        bit.attackCooldownSeconds = Math.max(
          0,
          bit.attackCooldownSeconds - deltaSeconds
        );
        bit.carpetCooldownSeconds = Math.max(
          0,
          bit.carpetCooldownSeconds - deltaSeconds
        );
        bit.failedChaseWindowPenaltySeconds = Math.max(
          0,
          bit.failedChaseWindowPenaltySeconds - deltaSeconds
        );
        if (bit.failedChaseWindowPenaltySeconds === 0) {
          bit.failedChaseWindowTransitionId = null;
        }
        if (actionsSuspended) {
          syncStationaryPosition(bit, elapsedSeconds, false);
          continue;
        }
        if (bit.mode === "carpet-follower") {
          continue;
        }
        if (bit.mode === "hold") {
          updateHold(bit, targetsById, deltaSeconds, elapsedSeconds);
          continue;
        }
        if (
          bit.mode === "search" &&
          bit.attackCooldownSeconds > 0
        ) {
          updateNormalSearch(bit, deltaSeconds, elapsedSeconds);
          continue;
        }

        const assignedTarget =
          bit.targetId === null ? null : targetsById.get(bit.targetId) ?? null;
        let targetVisible = false;
        let assignedTargetSightChecked = false;
        let chasePosition: Vector3 | null = null;
        const retainsLockedAttack =
          bit.mode === "fixed" || bit.mode === "random";
        const usesChaseAbandonRules = bit.mode === "chase";

        if (assignedTarget && !isTargetable(assignedTarget)) {
          if (retainsLockedAttack) {
            chasePosition =
              bit.lastSeenAimPosition ?? assignedTarget.aimPosition;
          } else {
            abandonTarget(bit, elapsedSeconds);
          }
        } else if (
          assignedTarget &&
          bit.targetProvenance === "alert" &&
          (bit.alertLeaderId === null ||
            !activeAlerts.has(
              buildAlertKey(bit.alertLeaderId, assignedTarget.id)
            ))
        ) {
          if (retainsLockedAttack) {
            chasePosition = assignedTarget.aimPosition;
          } else {
            const endedAlertReceive =
              bit.mode === "alert-receive";
            abandonTarget(bit, elapsedSeconds);
            if (endedAlertReceive) {
              bit.attackCooldownSeconds =
                V2_BIT_ATTACK_COOLDOWN_SECONDS;
            }
          }
        } else if (assignedTarget) {
          assignedTargetSightChecked =
            allowedSightCheckIds.has(bit.id);
          if (assignedTargetSightChecked) {
            bit.visualSightCheckPriority = false;
          }
          targetVisible = getAssignedTargetVisibility(
            bit,
            assignedTarget,
            assignedTargetSightChecked
          );
          if (targetVisible) {
            bit.lastSeenAimPosition = assignedTarget.aimPosition.clone();
            bit.targetLostSeconds = 0;
            chasePosition = assignedTarget.aimPosition;
            if (
              usesChaseAbandonRules &&
              Vector3.Distance(
                bit.root.position,
                assignedTarget.aimPosition
              ) > getChaseAbandonDistance(bit)
            ) {
              abandonTarget(bit, elapsedSeconds);
              chasePosition = null;
            }
          } else if (usesChaseAbandonRules) {
            bit.targetLostSeconds += deltaSeconds;
            chasePosition = bit.lastSeenAimPosition;
            const lastSeenDistance = bit.lastSeenAimPosition
              ? Vector3.Distance(
                  bit.root.position,
                  bit.lastSeenAimPosition
                )
              : Number.POSITIVE_INFINITY;
            if (
              bit.targetLostSeconds >= TARGET_LOST_TIMEOUT_SECONDS ||
              lastSeenDistance > getChaseAbandonDistance(bit)
            ) {
              abandonTarget(bit, elapsedSeconds);
              chasePosition = null;
            }
          } else if (bit.targetProvenance === "visual") {
            chasePosition =
              bit.lastSeenAimPosition ?? assignedTarget.aimPosition;
          } else {
            chasePosition = assignedTarget.aimPosition;
          }
        } else if (bit.targetId !== null) {
          abandonTarget(bit, elapsedSeconds);
        }
        const sharedAssignedTargetVisibility =
          assignedTarget && assignedTargetSightChecked
            ? Object.freeze({
                targetId: assignedTarget.id,
                visible: targetVisible
              })
            : null;

        if (
          allowedPersonalityRetargetIds.has(bit.id) &&
          bit.targetSelectionPersonality === "nearest-visible" &&
          bit.mode === "chase" &&
          bit.targetProvenance === "visual" &&
          bit.targetId !== null
        ) {
          if (diagnosticsEnabled) {
            diagnosticPersonalityRetargetQueries += 1;
          }
          bit.personalityRetargetCooldownSeconds =
            TARGET_PERSONALITY_RETARGET_INTERVAL_SECONDS;
          const visibleTarget = findVisibleTarget(
            bit,
            targetSpatialIndex.query(
              bit.root.position,
              bit.profile.visionRange
            ),
            "id",
            sharedAssignedTargetVisibility
          );
          if (visibleTarget) {
            retargetAutonomousVisualTarget(bit, visibleTarget);
            targetVisible = true;
            chasePosition = visibleTarget.aimPosition;
          }
        }

        if (bit.targetId === null) {
          const canRunVisualTargetSearch =
            allowedSightCheckIds.has(bit.id);
          const visibleTarget = canRunVisualTargetSearch
            ? findVisibleTarget(
                bit,
                targetSpatialIndex.query(
                  bit.root.position,
                  bit.profile.visionRange
                ),
                bit.targetSelectionPersonality ===
                  "nearest-visible"
                  ? "id"
                  : "source-order",
                sharedAssignedTargetVisibility
              )
            : null;
          if (canRunVisualTargetSearch) {
            bit.visualSightCheckPriority = false;
          }
          if (visibleTarget) {
            setVisualTarget(bit, visibleTarget);
            targetVisible = true;
            chasePosition = visibleTarget.aimPosition;
          } else {
            const alertTarget = selectAlertTarget(bit, targetsById);
            if (alertTarget) {
              setAlertTarget(
                bit,
                alertTarget.target,
                alertTarget.leaderId
              );
              targetVisible = false;
              chasePosition = alertTarget.target.aimPosition;
            }
          }
        }

        const currentTarget =
          bit.targetId === null ? null : targetsById.get(bit.targetId) ?? null;
        if (bit.targetId === null || !chasePosition) {
          updateNormalSearch(bit, deltaSeconds, elapsedSeconds);
          continue;
        }

        if (bit.mode === "alert-receive" && currentTarget) {
          updateAlertReceive(
            bit,
            currentTarget,
            targetsById,
            targetVisible,
            deltaSeconds,
            elapsedSeconds
          );
          continue;
        }
        if (bit.mode === "alert-send" && currentTarget) {
          updateAlertSend(
            bit,
            deltaSeconds,
            elapsedSeconds
          );
          continue;
        }
        if (bit.mode === "fixed" && currentTarget) {
          updateFixedAttack(
            bit,
            currentTarget,
            deltaSeconds,
            elapsedSeconds,
            beamRequests
          );
          if (bit.modeTimerSeconds === 0) {
            abandonTarget(bit, elapsedSeconds);
          }
          continue;
        }
        if (bit.mode === "random" && currentTarget) {
          updateRandomAttack(
            bit,
            currentTarget,
            deltaSeconds,
            elapsedSeconds,
            beamRequests
          );
          if (bit.modeTimerSeconds === 0) {
            abandonTarget(bit, elapsedSeconds);
          }
          continue;
        }

        if (bit.mode === "carpet-leader") {
          updateCarpet(
            bit,
            chasePosition,
            currentTarget?.aimPosition ?? chasePosition,
            deltaSeconds
          );
          if (bit.mode !== "carpet-leader") {
            continue;
          }
          const carpetFollowers =
            carpetFollowersByLeaderId.get(bit.id) ?? [];
          if (
            [...carpetFollowers].some(
              (follower) => !isBitReadyForAi(follower)
            )
          ) {
            continue;
          }
          if (currentTarget) {
            emitBeamWhenReady(
              bit,
              currentTarget,
              deltaSeconds,
              beamRequests,
              "bit-carpet",
              bit.root
                .getDirection(Vector3.Forward())
                .normalize(),
              false
            );
            for (const follower of carpetFollowers) {
              emitBeamWhenReady(
                follower,
                currentTarget,
                deltaSeconds,
                beamRequests,
                "bit-carpet",
                follower.root
                  .getDirection(Vector3.Forward())
                  .normalize(),
                false
              );
            }
          }
          if (
            bit.carpetPassSeconds >=
            V2_BIT_CARPET_PASS_DURATION_SECONDS
          ) {
            abandonTarget(bit, elapsedSeconds);
          }
          continue;
        } else {
          if (config.combatEnabled) {
            bit.modeTimerSeconds = Math.max(
              0,
              bit.modeTimerSeconds - deltaSeconds
            );
            if (bit.modeTimerSeconds === 0) {
              abandonTarget(bit, elapsedSeconds);
              continue;
            }
          }
          const chaseRouteState = updateChaseRoute(
            bit,
            chasePosition,
            currentTarget === null
              ? null
              : config.resolveTargetNavigationArea(currentTarget),
            deltaSeconds,
            elapsedSeconds
          );
          if (
            chaseRouteState === "unreachable" ||
            (chaseRouteState === "arrived" && !targetVisible)
          ) {
            abandonTarget(bit, elapsedSeconds);
            continue;
          }
          if (!bit.activeTransition) {
            pointBitAt(
              bit,
              currentTarget?.aimPosition ?? chasePosition
            );
          }
          if (currentTarget && targetVisible) {
            emitBeamWhenReady(
              bit,
              currentTarget,
              deltaSeconds,
              beamRequests,
              "bit-chase",
              currentTarget.aimPosition.subtract(bit.root.position),
              true
            );
          }
        }
      }

      for (const [alertKey, alert] of activeAlerts) {
        alert.remainingSeconds -= deltaSeconds;
        if (alert.remainingSeconds <= 0) {
          removeActiveAlert(alertKey);
          if (alert.internalBitAlert) {
            closedInternalAlertKeys.add(alertKey);
          }
        }
      }
      if (!aiSuspended) {
        if (getPopulationBitCount() >= config.maximumBitCount) {
          reinforcementElapsedSeconds = 0;
        } else {
          reinforcementElapsedSeconds += deltaSeconds;
          if (
            reinforcementElapsedSeconds >=
            config.reinforcementIntervalSeconds
          ) {
            spawnTimedReinforcement();
            reinforcementElapsedSeconds = 0;
          }
        }
      }
      frameBeamRequests = Object.freeze(beamRequests);
      if (diagnosticsEnabled) {
        let areaPursuitCount = 0;
        let detailPursuitCount = 0;
        for (const bit of bits) {
          if (bit.targetId === null) {
            continue;
          }
          if (bit.pursuitPhase === "area") {
            areaPursuitCount += 1;
          } else {
            detailPursuitCount += 1;
          }
        }
        frameDiagnostics = Object.freeze({
          enabled: true,
          routePlans: Object.freeze({
            search: diagnosticSearchRoutePlans,
            chase: diagnosticChaseRoutePlans,
            escape: diagnosticEscapeRoutePlans
          }),
          routePlanMilliseconds: Object.freeze({
            search: diagnosticSearchRoutePlanMilliseconds,
            chase: diagnosticChaseRoutePlanMilliseconds,
            escape: diagnosticEscapeRoutePlanMilliseconds
          }),
          sightRays: diagnosticSightRays,
          currentTargetSightCheckCount:
            diagnosticCurrentTargetSightChecks,
          personalityRetargetQueryCount:
            diagnosticPersonalityRetargetQueries,
          autonomousVisualTargetChangeCount:
            diagnosticAutonomousVisualTargetChanges,
          forcedTargetChangeCount:
            diagnosticForcedTargetChanges,
          sphereSweeps: diagnosticSphereSweeps,
          sphereSweepMilliseconds:
            diagnosticSphereSweepMilliseconds,
          beamRequests: beamRequests.length,
          areaPursuitCount,
          detailPursuitCount,
          routeSafetyCache: createRouteSafetyCacheDiagnostics()
        });
      }
      for (const bit of bits) {
        syncBitMuzzleColor(bit);
      }
    },
    getFrameView,
    takeAlertRequests: () => {
      const requests = Object.freeze(pendingAlertRequests);
      pendingAlertRequests = [];
      return requests;
    },
    setDiagnosticsEnabled: (enabled) => {
      diagnosticsEnabled = enabled;
      resetDiagnostics();
      resetRouteSafetyCacheDiagnostics();
      frameDiagnostics = Object.freeze({
        enabled,
        routePlans: Object.freeze({ search: 0, chase: 0, escape: 0 }),
        routePlanMilliseconds: Object.freeze({
          search: 0,
          chase: 0,
          escape: 0
        }),
        sightRays: 0,
        currentTargetSightCheckCount: 0,
        personalityRetargetQueryCount: 0,
        autonomousVisualTargetChangeCount: 0,
        forcedTargetChangeCount: 0,
        sphereSweeps: 0,
        sphereSweepMilliseconds: 0,
        beamRequests: 0,
        areaPursuitCount: 0,
        detailPursuitCount: 0,
        routeSafetyCache: createRouteSafetyCacheDiagnostics()
      });
      invalidateFrameViews();
    },
    notifyBeamImpact: (sourceId, targetId) => {
      const source = bitsById.get(sourceId);
      if (!source) {
        return false;
      }
      if (source.mode === "carpet-follower") {
        startCarpetFollowerFade(source);
        return true;
      }
      const bit = source;
      if (bit.lastHoldTargetId === targetId) {
        return false;
      }
      invalidateFrameViews();
      if (bit.mode === "carpet-leader") {
        removeCarpetFollowers(bit);
      }
      bit.holdReturnMode = bit.mode;
      bit.mode = "hold";
      bit.holdTargetId = targetId;
      bit.holdTimerSeconds = bit.profile.isRed
        ? V2_BIT_RED_HOLD_SECONDS
        : 0;
      bit.lastHoldTargetId = targetId;
      bit.fireTelegraphSeconds = 0;
      clearRoute(bit);
      syncBitMuzzleColor(bit);
      return true;
    },
    prepareForScriptedPhase: () => {
      invalidateFrameViews();
      disposeFadingCarpetFollowers();
      for (const bit of bits) {
        finalizeBitSpawnVisual(bit);
      }
      spawnBlockedBitIdsForUpdate.clear();
      for (let index = bits.length - 1; index >= 0; index -= 1) {
        const bit = bits[index];
        if (bit.mode !== "carpet-follower") {
          continue;
        }
        disposeRuntimeBit(bit);
        unregisterRuntimeBit(bit);
      }
      for (const bit of bits) {
        clearRoute(bit);
        bit.mode = "search";
        bit.targetId = null;
        bit.targetProvenance = null;
        bit.visualSightCheckPriority = true;
        bit.alertLeaderId = null;
        bit.lastSeenAimPosition = null;
        bit.lastSeenDestination = null;
        bit.lastChasePlanTargetId = null;
        bit.pendingEscapeThreatPosition = null;
        bit.sightTargetId = null;
        bit.sightTargetVisible = false;
        bit.personalityRetargetCooldownSeconds = 0;
        bit.targetLostSeconds = 0;
        bit.modeTimerSeconds = 0;
        bit.attackCooldownSeconds = 0;
        bit.carpetCooldownSeconds = 0;
        bit.fireTelegraphSeconds = 0;
        bit.postAlertMode = null;
        bit.holdReturnMode = null;
        bit.holdTargetId = null;
        bit.holdTimerSeconds = 0;
        bit.lastHoldTargetId = null;
        bit.carpetPassSeconds = 0;
        bit.carpetLeaderId = null;
        bit.carpetOffset = 0;
        bit.hasAttemptedSearchRoute = false;
        bit.searchRetrySeconds = 0;
        bit.bruteForceActive = false;
        bit.bruteForceNextCheckSeconds =
          BRUTE_FORCE_START_SECONDS;
        bit.bruteForceFailedTransitionCandidateCount = 0;
        syncBitMuzzleColor(bit);
      }
      activeAlerts.clear();
      externalAlertKeyByTargetId.clear();
      closedInternalAlertKeys.clear();
      frameBeamRequests = Object.freeze([]);
      pendingAlertRequests = [];
    },
    setAiSuspended: (suspended) => {
      aiSuspended = suspended;
    },
    setHostileActionsSuspended: (suspended) => {
      hostileActionsSuspended = suspended;
    },
    setVisible: (visible) => {
      for (const bit of bits) {
        bit.root.setEnabled(visible);
      }
      for (const follower of fadingCarpetFollowers) {
        follower.root.setEnabled(visible);
      }
    },
    placeBits: (assignments) => {
      if (assignments.length !== bits.length) {
        throw new Error(
          `bit配置指定数が一致しません: expected=${bits.length}, actual=${assignments.length}`
        );
      }
      const assignmentIds = new Set<string>();
      const resolved = assignments.map((assignment) => {
        if (assignmentIds.has(assignment.id)) {
          throw new Error(
            `bit配置IDが重複しています: ${assignment.id}`
          );
        }
        assignmentIds.add(assignment.id);
        assertFiniteVector(
          `bit配置(${assignment.id})`,
          assignment.centerPosition
        );
        const bit = bitsById.get(assignment.id);
        if (!bit) {
          throw new Error(
            `bit配置対象が存在しません: ${assignment.id}`
          );
        }
        const location = navigation
          .findLocationCandidates(
            assignment.centerPosition,
            LOCATION_PROJECTION_DISTANCE
          )
          .filter((candidate) =>
            safety.isCenterSafe(
              getBitFlightWorldPosition(candidate)
            )
          )
          .sort(
            (left, right) =>
              Vector3.DistanceSquared(
                getBitFlightWorldPosition(left),
                assignment.centerPosition
              ) -
              Vector3.DistanceSquared(
                getBitFlightWorldPosition(right),
                assignment.centerPosition
              )
          )[0];
        if (!location) {
          throw new Error(
            `bit配置位置を安全な飛行帯へ投影できません: ${assignment.id}`
          );
        }
        return Object.freeze({ bit, location });
      });

      for (const { bit, location } of resolved) {
        bit.flightAgent.dispose();
        bit.flightAgent = createBitFlightAgent(
          navigation,
          safety,
          BIT_FLIGHT_AGENT_CONFIG
        );
        bit.navigationLocation = location;
        bit.routePurpose = null;
        bit.routeDestination = null;
        bit.activeRoute = null;
        bit.spatialReplanPending = false;
        bit.routeRefreshSeconds = 0;
        bit.searchRouteKind = null;
        bit.normalPatrolOrigin = null;
        bit.queuedNormalPatrolLeg = null;
        bit.randomAttackRouteSeconds = 0;
        bit.searchRetrySeconds = 0;
        bit.hasAttemptedSearchRoute = false;
        bit.bruteForceActive = false;
        bit.bruteForceNextCheckSeconds =
          BRUTE_FORCE_START_SECONDS;
        bit.bruteForceFailedTransitionCandidateCount = 0;
        bit.activeTransition = null;
        bit.lastChasePlanTargetId = null;
        bit.root.position.copyFrom(
          getBitFlightWorldPosition(location)
        );
        bit.pursuitActorAreaCursor = null;
        bit.pursuitActorAreaPosition = null;
        bit.root.computeWorldMatrix(true);
      }
      invalidateFrameViews();
    },
    relocateBit: (bitId, candidates) => {
      const bit = bitsById.get(bitId);
      if (!bit) {
        throw new Error(`BIT搬送対象が存在しません: ${bitId}`);
      }
      if (candidates.length === 0) {
        throw new Error(`BIT搬送候補がありません: ${bitId}`);
      }
      const resolved = candidates
        .flatMap((candidate, candidateIndex) => {
          assertFiniteVector(`BIT搬送候補(${bitId})`, candidate);
          return navigation
            .findLocationCandidates(
              candidate,
              LOCATION_PROJECTION_DISTANCE
            )
            .filter((location) =>
              safety.isCenterSafe(
                getBitFlightWorldPosition(location)
              )
            )
            .map((location) =>
              Object.freeze({
                candidateIndex,
                projectionDistanceSquared:
                  Vector3.DistanceSquared(
                    getBitFlightWorldPosition(location),
                    candidate
                  ),
                location
              })
            );
        })
        .sort(
          (left, right) =>
            left.candidateIndex - right.candidateIndex ||
            left.projectionDistanceSquared -
              right.projectionDistanceSquared
        )[0];
      if (!resolved) {
        throw new Error(
          `BIT搬送候補を安全な飛行帯へ投影できません: ${bitId}`
        );
      }
      bit.flightAgent.dispose();
      bit.flightAgent = createBitFlightAgent(
        navigation,
        safety,
        BIT_FLIGHT_AGENT_CONFIG
      );
      bit.navigationLocation = resolved.location;
      bit.routePurpose = null;
      bit.routeDestination = null;
      bit.activeRoute = null;
      bit.spatialReplanPending = false;
      bit.routeRefreshSeconds = 0;
      bit.searchRouteKind = null;
      bit.normalPatrolOrigin = null;
      bit.queuedNormalPatrolLeg = null;
      bit.randomAttackRouteSeconds = 0;
      bit.searchRetrySeconds = 0;
      bit.hasAttemptedSearchRoute = false;
      bit.bruteForceActive = false;
      bit.bruteForceNextCheckSeconds =
        BRUTE_FORCE_START_SECONDS;
      bit.bruteForceFailedTransitionCandidateCount = 0;
      bit.activeTransition = null;
      bit.lastChasePlanTargetId = null;
      bit.root.position.copyFrom(
        getBitFlightWorldPosition(resolved.location)
      );
      bit.pursuitActorAreaCursor = null;
      bit.pursuitActorAreaPosition = null;
      bit.root.computeWorldMatrix(true);
      invalidateFrameViews();
      return bit.root.position.clone();
    },
    dispose: () => {
      invalidateFrameViews();
      routeStepSafetyByKey.clear();
      routeCenterSafetyByKey.clear();
      routeSegmentSafetyByKey.clear();
      lowCeilingCruiseHeightsByRouteStepKey.clear();
      routeStepSafetyAccessOrder.clear();
      targetLocationCandidatesByPositionKey.clear();
      safeDestinationByTraversalKey.clear();
      spawnBlockedBitIdsForUpdate.clear();
      disposeFadingCarpetFollowers();
      for (let index = bits.length - 1; index >= 0; index -= 1) {
        disposeRuntimeBit(bits[index]);
      }
      bits.length = 0;
      bitsById.clear();
      carpetFollowersByLeaderId.clear();
      activeAlerts.clear();
      externalAlertKeyByTargetId.clear();
      closedInternalAlertKeys.clear();
      explorationHistory.clear();
      frameBeamRequests = Object.freeze([]);
      pendingAlertRequests = [];
      visualSources.muzzle.dispose(false, false);
      visualSources.redBody.dispose(false, false);
      visualSources.body.dispose(false, false);
      materials.body.dispose();
      materials.redBody.dispose();
      frameDiagnostics = Object.freeze({
        enabled: diagnosticsEnabled,
        routePlans: Object.freeze({ search: 0, chase: 0, escape: 0 }),
        routePlanMilliseconds: Object.freeze({
          search: 0,
          chase: 0,
          escape: 0
        }),
        sightRays: 0,
        currentTargetSightCheckCount: 0,
        personalityRetargetQueryCount: 0,
        autonomousVisualTargetChangeCount: 0,
        forcedTargetChangeCount: 0,
        sphereSweeps: 0,
        sphereSweepMilliseconds: 0,
        beamRequests: 0,
        areaPursuitCount: 0,
        detailPursuitCount: 0,
        routeSafetyCache: createRouteSafetyCacheDiagnostics()
      });
      materials.muzzle.dispose();
    }
  };
};
