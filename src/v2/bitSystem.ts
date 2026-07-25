import {
  Color3,
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
  type BitFlightExplorationHistory,
  type BitFlightTransitionHistory
} from "../world/bitFlightTactics";
import type { StageSpatialContext } from "../world/stageSpatialContext";
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
  V2TargetProvenance
} from "./combatTypes";
import { isV2HitState } from "./combatTypes";
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

const SEARCH_SPEED = 0.25;
const SEARCH_VERTICAL_SPEED = 0.06;
const SEARCH_RADIUS = 2.4;
const SEARCH_RETRY_SECONDS = 0.5;
const SEARCH_SEGMENT_SECONDS_MIN = 1.2;
const SEARCH_SEGMENT_SECONDS_MAX = 2.4;
const SEARCH_TRANSITION_CHANCE = 0.25;
const SEARCH_NEAR_TRANSITION_DISTANCE = 0.75;
const SEARCH_TRANSITION_CANDIDATE_LIMIT = 1;
const SEARCH_TRANSITION_FORCE_AFTER_SURFACE_PLANS = 3;
const SEARCH_ROUTE_PLAN_BUDGET_PER_UPDATE = 4;
const CHASE_ROUTE_PLAN_BUDGET_PER_UPDATE = 4;
const ESCAPE_ROUTE_PLAN_BUDGET_PER_UPDATE = 4;
const SEARCH_OBSERVATION_INTERVAL_SECONDS = 1;
const SEARCH_OBSERVATION_RADIUS = 0.8;
const SEARCH_EXPLORED_DESTINATION_PENALTY = 1.5;
const SEARCH_ORDINARY_TRANSITION_PENALTY = 0.4;
const TRANSITION_IMMEDIATE_RETURN_PENALTY = 8;
const TARGET_ROUTE_REFRESH_SECONDS = 0.5;
const TARGET_ROUTE_MOVE_THRESHOLD = 0.2;
const TARGET_BAND_VERTICAL_TOLERANCE = 0.1;
const TARGET_BAND_PROJECTION_TOLERANCE = 0.01;
const TARGET_SIGHT_CHECK_INTERVAL_SECONDS = 0.1;
const TARGET_SIGHT_CHECK_MAXIMUM_SHARE_PER_UPDATE = 1 / 3;
const TARGET_LOST_TIMEOUT_SECONDS = 18;
const TARGET_LOST_MAXIMUM_DISTANCE = 2.6;
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

export type V2BitSystemConfig = Readonly<{
  initialBitCount: number;
  minimumSpawnDistance: number;
  spawnMaxAttempts: number;
  spawnProjectionMaxDistance: number;
  combatEnabled: boolean;
  random: () => number;
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

export interface V2BitSystem {
  update(input: V2BitSystemUpdateInput): void;
  getActorSpheres(): readonly V2ActorSphere[];
  getBeamRequests(): readonly V2BeamRequest[];
  takeAlertRequests(): readonly V2AlertRequest[];
  getTargetStates(): readonly V2BitTargetState[];
  getFlightStates(): readonly V2BitFlightState[];
  notifyBeamImpact(sourceId: string, targetId: string): boolean;
  prepareForScriptedPhase(): void;
  setAiSuspended(suspended: boolean): void;
  setVisible(visible: boolean): void;
  placeBits(assignments: readonly V2BitPlacementAssignment[]): void;
  dispose(): void;
}

type ActiveAlert = {
  leaderId: string;
  targetId: string;
  remainingSeconds: number;
  receiverIds: Set<string> | null;
  gatheredIds: Set<string>;
  internalBitAlert: boolean;
};

type RuntimeBit = {
  id: string;
  root: TransformNode;
  body: Mesh;
  muzzle: Mesh;
  profile: V2BitCombatProfile;
  flightAgent: BitFlightAgent;
  navigationLocation: BitFlightLocation | null;
  routePurpose: V2BitRoutePurpose | null;
  routeDestination: BitFlightLocation | null;
  routeRefreshSeconds: number;
  searchSegmentSeconds: number;
  searchSurfaceSpeed: number;
  searchRetrySeconds: number;
  hasAttemptedSearchRoute: boolean;
  searchTransitionCursor: number;
  searchSurfacePlansSinceTransitionAttempt: number;
  lastExplorationRecordSeconds: number;
  transitionHistory: BitFlightTransitionHistory;
  activeTransition: BitFlightTransitionTraversal | null;
  bobPhase: number;
  mode: V2BitMode;
  targetId: string | null;
  targetProvenance: V2TargetProvenance | null;
  alertLeaderId: string | null;
  lastSeenAimPosition: Vector3 | null;
  lastSeenDestination: BitFlightLocation | null;
  lastChasePlanTargetId: string | null;
  pendingEscapeThreatPosition: Vector3 | null;
  sightTargetId: string | null;
  sightTargetVisible: boolean;
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
};

type FadingCarpetFollower = {
  root: TransformNode;
  body: Mesh;
  muzzle: Mesh;
  remainingSeconds: number;
};

type SpawnRegion = Readonly<{
  volume: StageVolume;
  band: BitFlightBand;
  contains: (point: Vector3) => boolean;
  minimum: Vector3;
  maximum: Vector3;
}>;

type SafeRouteCandidate<T> = Readonly<{
  value: T;
  destination: BitFlightLocation;
  route: BitFlightRoute;
  totalCost: number;
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
  if (typeof config.random !== "function") {
    throw new Error("randomには0以上1未満を返す関数が必要です。");
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
    muzzle.diffuseColor = new Color3(1, 0.18, 0.74);
    muzzle.emissiveColor = new Color3(0.7, 0.06, 0.42);
    muzzle.specularColor = Color3.Black();

    return { body, redBody, muzzle };
  } catch (error) {
    muzzle?.dispose();
    redBody?.dispose();
    body?.dispose();
    throw error;
  }
};

const createBitVisual = (
  scene: Scene,
  materials: Readonly<{
    body: StandardMaterial;
    redBody: StandardMaterial;
    muzzle: StandardMaterial;
  }>,
  id: string,
  isRed: boolean
) => {
  let root: TransformNode | null = null;
  let body: Mesh | null = null;
  let muzzle: Mesh | null = null;
  try {
    root = new TransformNode(id, scene);
    body = MeshBuilder.CreateCylinder(
      `${id}_body`,
      {
        diameterTop: 0,
        diameterBottom: BIT_BODY_DIAMETER,
        height: BIT_BODY_HEIGHT,
        tessellation: 24
      },
      scene
    );
    body.parent = root;
    body.rotation.x = Math.PI / 2;
    body.material = isRed ? materials.redBody : materials.body;
    body.isPickable = false;

    muzzle = MeshBuilder.CreateSphere(
      `${id}_muzzle`,
      { diameter: BIT_MUZZLE_DIAMETER, segments: 16 },
      scene
    );
    muzzle.parent = root;
    muzzle.position.z = BIT_MUZZLE_OFFSET;
    muzzle.material = materials.muzzle;
    muzzle.isPickable = false;

    return { root, body, muzzle };
  } catch (error) {
    muzzle?.dispose(false, false);
    body?.dispose(false, false);
    root?.dispose(false);
    throw error;
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

const getRouteStepPositions = (step: BitFlightRouteStep) =>
  step.kind === "surface"
    ? step.points.map(getBitFlightWorldPosition)
    : step.points;

const isRouteStepSafe = (
  step: BitFlightRouteStep,
  safety: BitFlightSafety
) => {
  const points = getRouteStepPositions(step);
  if (points.length === 0 || !safety.isCenterSafe(points[0])) {
    return false;
  }
  for (let index = 1; index < points.length; index += 1) {
    if (safety.findMovementCollision(points[index - 1], points[index])) {
      return false;
    }
  }
  return true;
};

export const createV2BitSystem = (
  scene: Scene,
  spatial: StageSpatialContext,
  config: V2BitSystemConfig
): V2BitSystem => {
  assertConfig(config);

  const navigation = spatial.bitNavigation;
  const safety = createBitFlightSafety(spatial.queries);
  const explorationHistory: BitFlightExplorationHistory =
    createBitFlightExplorationHistory();

  const nextRandom = () => {
    const value = config.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`randomは0以上1未満の有限値を返す必要があります: ${value}`);
    }
    return value;
  };
  const randomRange = (minimum: number, maximum: number) =>
    minimum + nextRandom() * (maximum - minimum);

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
      if (safety.isCenterSafe(getBitFlightWorldPosition(selectedLocation))) {
        return selectedLocation;
      }
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
        volume.mesh.computeWorldMatrix(true);
        const bounds = volume.mesh.getBoundingInfo().boundingBox;
        return Object.freeze({
          volume,
          band,
          contains: createStageBoundaryContainsQuery(volume.mesh),
          minimum: bounds.minimumWorld.clone(),
          maximum: bounds.maximumWorld.clone()
        });
      })
    );

  const spawnRegions = createSpawnRegions();

  const sampleSpawnLocations = (
    count: number,
    minimumDistance: number
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
        const region =
          spawnRegions[Math.floor(nextRandom() * spawnRegions.length)];
        const extent = region.maximum.subtract(region.minimum);
        const rawPoint = new Vector3(
          region.minimum.x + extent.x * nextRandom(),
          region.minimum.y + extent.y * nextRandom(),
          region.minimum.z + extent.z * nextRandom()
        );
        if (!region.contains(rawPoint)) {
          continue;
        }
        const height = randomRange(
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
        const projectedInsideProbe = new Vector3(
          candidate.surface.position.x,
          rawPoint.y,
          candidate.surface.position.z
        );
        if (!region.contains(projectedInsideProbe)) {
          continue;
        }
        const worldPosition = getBitFlightWorldPosition(candidate);
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
              spatial.queries.containsVolume("water", point)
          )
        ) {
          continue;
        }
        if (
          accepted.some(
            (location) => {
              const distanceSquared = Vector3.DistanceSquared(
                getBitFlightWorldPosition(location),
                worldPosition
              );
              return (
                distanceSquared === 0 ||
                distanceSquared < minimumDistanceSquared
              );
            }
          )
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
  const bits: RuntimeBit[] = [];
  const fadingCarpetFollowers: FadingCarpetFollower[] = [];
  const activeAlerts = new Map<string, ActiveAlert>();
  const closedInternalAlertKeys = new Set<string>();
  let frameBeamRequests: readonly V2BeamRequest[] = Object.freeze([]);
  let pendingAlertRequests: V2AlertRequest[] = [];
  let nextBitIndex = 0;
  let searchRoutePlanCursor = 0;
  let chaseRoutePlanCursor = 0;
  let escapeRoutePlanCursor = 0;
  let sightCheckCursor = 0;
  let sightCheckCredit = 1;
  let allowedSearchRoutePlanIds = new Set<string>();
  let allowedChaseRoutePlanIds = new Set<string>();
  let allowedEscapeRoutePlanIds = new Set<string>();
  let remainingUnassignedEscapeRoutePlans = 0;
  let aiSuspended = false;

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
    const ordered = Array.from(
      { length: bits.length },
      (_, offset) => bits[(normalizedCursor + offset) % bits.length]
    );
    const priority = ordered.filter(
      (bit) => isEligible(bit) && isPriority(bit)
    );
    const regular = ordered.filter(
      (bit) => isEligible(bit) && !isPriority(bit)
    );
    const selected = [...priority, ...regular].slice(0, budget);
    const lastSelected = selected[selected.length - 1];
    return Object.freeze({
      ids: new Set(selected.map((bit) => bit.id)),
      nextCursor: lastSelected
        ? (bits.indexOf(lastSelected) + 1) % bits.length
        : normalizedCursor
    });
  };

  const createRuntimeBit = (
    navigationLocation: BitFlightLocation,
    mode: V2BitMode = "search",
    inheritedProfile: V2BitCombatProfile | null = null
  ) => {
    const position = getBitFlightWorldPosition(navigationLocation);
    assertFiniteVector("ビットの飛行位置", position);
    if (!safety.isCenterSafe(position)) {
      throw new Error("ビット初期位置に0.54m安全包絡が収まりません。");
    }
    const id = `v2_bit_${nextBitIndex}`;
    nextBitIndex += 1;
    const profile =
      inheritedProfile ??
      (config.combatEnabled
        ? createV2BitCombatProfile(nextRandom)
        : V2_STANDARD_BIT_COMBAT_PROFILE);
    const visual = createBitVisual(
      scene,
      materials,
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
        ...visual,
        profile,
        flightAgent,
        navigationLocation,
        routePurpose: null,
        routeDestination: null,
        routeRefreshSeconds: 0,
        searchSegmentSeconds: 0,
        searchSurfaceSpeed: profile.searchSpeed,
        searchRetrySeconds: 0,
        hasAttemptedSearchRoute: false,
        searchTransitionCursor: 0,
        searchSurfacePlansSinceTransitionAttempt: 0,
        lastExplorationRecordSeconds: Number.NEGATIVE_INFINITY,
        transitionHistory: createBitFlightTransitionHistory(),
        activeTransition: null,
        bobPhase: nextRandom() * Math.PI * 2,
        mode,
        targetId: null,
        targetProvenance: null,
        alertLeaderId: null,
        lastSeenAimPosition: null,
        lastSeenDestination: null,
        lastChasePlanTargetId: null,
        pendingEscapeThreatPosition: null,
        sightTargetId: null,
        sightTargetVisible: false,
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
        carpetAimSeconds: 0
      };
      bit.root.position.copyFrom(position);
      bit.root.lookAt(bit.root.position.add(initialDirection));
      bits.push(bit);
      return bit;
    } catch (error) {
      flightAgent?.dispose();
      visual.root.dispose(false);
      throw error;
    }
  };

  try {
    for (const location of sampleSpawnLocations(
      config.initialBitCount,
      config.minimumSpawnDistance
    )) {
      createRuntimeBit(location);
    }
  } catch (error) {
    for (let index = bits.length - 1; index >= 0; index -= 1) {
      bits[index].flightAgent.dispose();
      bits[index].root.dispose(false);
    }
    bits.length = 0;
    materials.muzzle.dispose();
    materials.redBody.dispose();
    materials.body.dispose();
    throw error;
  }

  const isTargetable = (target: V2HumanTargetSnapshot) =>
    target.alive && !target.brainwashed;

  const buildAlertKey = (leaderId: string, targetId: string) =>
    `${leaderId}\u0000${targetId}`;

  const isSightClear = (from: Vector3, to: Vector3) =>
    spatial.queries.castSightSegment(from, to) === null;

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

  const canSeeTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) =>
    isTargetable(target) &&
    isInsideVision(bit, target) &&
    isSightClear(bit.root.position, target.aimPosition);

  const getAssignedTargetVisibility = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    refreshSight: boolean
  ) => {
    if (!isInsideVision(bit, target)) {
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

  const findVisibleTarget = (
    bit: RuntimeBit,
    targets: readonly V2HumanTargetSnapshot[]
  ) => {
    let closest: V2HumanTargetSnapshot | null = null;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      if (!canSeeTarget(bit, target)) {
        continue;
      }
      const distanceSquared = Vector3.DistanceSquared(
        bit.root.position,
        target.aimPosition
      );
      if (distanceSquared < closestDistanceSquared) {
        closest = target;
        closestDistanceSquared = distanceSquared;
      }
    }
    return closest;
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
      const candidate = new Vector3(base.x, base.y + bob, base.z);
      return safety.findMovementCollision(base, candidate)
        ? base
        : candidate;
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
    return safety.findMovementCollision(base, candidate) ? base : candidate;
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
    if (!safety.findMovementCollision(bit.root.position, destination)) {
      bit.root.position.copyFrom(destination);
    }
  };

  const selectSafeRoute = <T>(
    start: BitFlightLocation,
    candidates: readonly Readonly<{
      value: T;
      destination: BitFlightLocation;
      costBias: number;
    }>[],
    policy: BitFlightRoutePolicy,
    findCandidateRoute: (
      origin: BitFlightLocation,
      candidate: Readonly<{
        value: T;
        destination: BitFlightLocation;
        costBias: number;
      }>,
      safePolicy: BitFlightRoutePolicy
    ) => BitFlightRoute | null = (origin, candidate, safePolicy) =>
      navigation.findRoute(origin, candidate.destination, safePolicy)
  ): SafeRouteCandidate<T> | null => {
    let selected: SafeRouteCandidate<T> | null = null;
    const safePolicy: BitFlightRoutePolicy = Object.freeze({
      canUseTransition: (traversal) =>
        policy.canUseTransition(traversal),
      canUseRouteStep: (step) =>
        policy.canUseRouteStep(step) && isRouteStepSafe(step, safety),
      additionalTransitionCost: (traversal) =>
        policy.additionalTransitionCost(traversal),
      additionalSurfaceCruiseHeights: (step, band) =>
        Object.freeze([
          ...policy.additionalSurfaceCruiseHeights(step, band),
          ...safety.findLowCeilingCruiseHeights(step, band)
        ])
    });
    for (const candidate of candidates) {
      const route = findCandidateRoute(
        start,
        candidate,
        safePolicy
      );
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
    bit.routeRefreshSeconds = 0;
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
        selected.route
      )
    ) {
      bit.routePurpose = null;
      bit.routeDestination = null;
      bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      return false;
    }
    bit.routePurpose = purpose;
    bit.routeDestination = cloneTargetLocation(selected.destination);
    bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
    return true;
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
    const previousLocation = bit.navigationLocation;
    const previousRootPosition = bit.root.position.clone();
    const snapshot = bit.flightAgent.update(speed, deltaSeconds);
    updateTransitionHistory(
      bit,
      snapshot.transition,
      snapshot.location,
      elapsedSeconds
    );
    if (!snapshot.position) {
      return snapshot.state;
    }

    const allowBob =
      snapshot.transition === null &&
      bit.mode !== "carpet-leader" &&
      bit.mode !== "carpet-follower";
    let destination = snapshot.location
      ? getBobbedPosition(
          bit,
          snapshot.location,
          elapsedSeconds,
          allowBob
        )
      : snapshot.position.clone();
    let collision = safety.findMovementCollision(
      previousRootPosition,
      destination
    );
    if (collision && snapshot.location) {
      destination = snapshot.position.clone();
      collision = safety.findMovementCollision(
        previousRootPosition,
        destination
      );
    }
    if (collision) {
      bit.flightAgent.clear();
      bit.navigationLocation = previousLocation;
      bit.routePurpose = null;
      bit.routeDestination = null;
      bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      return "blocked";
    }

    bit.root.position.copyFrom(destination);
    bit.navigationLocation = snapshot.location;
    if (snapshot.facingDirection && snapshot.facingDirection.lengthSquared() > 0) {
      bit.root.lookAt(bit.root.position.add(snapshot.facingDirection));
    }
    if (
      snapshot.state === "arrived" ||
      snapshot.state === "unreachable" ||
      snapshot.state === "blocked"
    ) {
      if (snapshot.state !== "arrived") {
        bit.routePurpose = null;
        bit.routeDestination = null;
        bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      }
    }
    return snapshot.state;
  };

  const buildTargetLocationCandidates = (
    targetPosition: Vector3
  ): readonly Readonly<{
    destination: BitFlightLocation;
    projectionError: number;
  }>[] => {
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
          projectionError: Math.hypot(
            location.surface.position.x - targetPosition.x,
            location.surface.position.z - targetPosition.z
          )
        })
      ];
    });
    const minimumProjectionError = Math.min(
      ...projectedCandidates.map((candidate) => candidate.projectionError)
    );
    return Object.freeze(
      projectedCandidates.filter(
        (candidate) =>
          candidate.projectionError <=
          minimumProjectionError + TARGET_BAND_PROJECTION_TOLERANCE
      )
    );
  };

  const selectTargetDestination = (
    bit: RuntimeBit,
    targetPosition: Vector3
  ) => {
    if (!bit.navigationLocation) {
      return null;
    }
    return selectSafeRoute(
      bit.navigationLocation,
      buildTargetLocationCandidates(targetPosition).map((candidate) =>
        Object.freeze({
          value: candidate.destination,
          destination: candidate.destination,
          costBias: candidate.projectionError
        })
      ),
      BIT_FLIGHT_SHORTEST_ROUTE_POLICY
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

  const startCarpetFollowerFade = (follower: RuntimeBit) => {
    follower.flightAgent.dispose();
    bits.splice(bits.indexOf(follower), 1);
    follower.body.visibility = 1;
    follower.muzzle.visibility = 1;
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
      follower.body.visibility = visibility;
      follower.muzzle.visibility = visibility;
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
    for (let index = bits.length - 1; index >= 0; index -= 1) {
      const candidate = bits[index];
      if (
        candidate.mode !== "carpet-follower" ||
        candidate.carpetLeaderId !== leader.id
      ) {
        continue;
      }
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
    clearRoute(bit);
    bit.targetId = target.id;
    bit.targetProvenance = "visual";
    bit.alertLeaderId = null;
    bit.lastSeenAimPosition = target.aimPosition.clone();
    bit.lastSeenDestination = null;
    bit.lastChasePlanTargetId = null;
    bit.targetLostSeconds = 0;
    bit.sightTargetId = target.id;
    bit.sightTargetVisible = true;
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

  const setAlertTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    leaderId: string
  ) => {
    if (bit.mode === "carpet-leader") {
      removeCarpetFollowers(bit);
      bit.carpetLeaderId = null;
      bit.carpetOffset = 0;
      bit.carpetPassSeconds = 0;
    }
    clearRoute(bit);
    bit.targetId = target.id;
    bit.targetProvenance = "alert";
    bit.alertLeaderId = leaderId;
    bit.lastSeenAimPosition = target.aimPosition.clone();
    bit.lastSeenDestination = null;
    bit.lastChasePlanTargetId = null;
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
      const angle = nextRandom() * Math.PI * 2;
      const radius = Math.sqrt(nextRandom()) * ALERT_SPAWN_RADIUS;
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
        safety.findMovementCollision(leaderPosition, spawnPosition)
      ) {
        continue;
      }
      const receiver = createRuntimeBit(location);
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
        const destinationPoint = getTraversalDestinationPosition(traversal);
        const destination = findSafeLocation(
          traversal.to,
          destinationPoint,
          destinationPoint.y
        );
        return destination
          ? [Object.freeze({
              value: traversal,
              destination,
              costBias: 0
            })]
          : [];
      });
    const selected = selectSafeRoute(
      bit.navigationLocation,
      candidates,
      policy,
      (origin, candidate, safePolicy) =>
        navigation.findRouteThroughTransition(
          origin,
          candidate.value,
          candidate.destination,
          safePolicy
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
    bit.alertLeaderId = null;
    bit.lastSeenAimPosition = null;
    bit.lastSeenDestination = null;
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
        (alert.receiverIds !== null &&
          !alert.receiverIds.has(bit.id))
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

  const createSearchSurfaceDestination = (
    bit: RuntimeBit,
    movementSpeed: number
  ): Readonly<{
    destination: BitFlightLocation;
    surfaceSpeed: number;
  }> | null => {
    const current = bit.navigationLocation;
    if (!current) {
      return null;
    }
    const band = navigation.getBand(current);
    if (!band) {
      throw new Error("探索中の飛行帯がありません。");
    }
    const movementRoll = nextRandom();
    const isVertical = movementRoll >= 0.65 && movementRoll < 0.8;
    const isDiagonal = movementRoll >= 0.8;
    const horizontal = isVertical
      ? current
      : navigation.randomPointAround(current, SEARCH_RADIUS);
    if (!horizontal) {
      return null;
    }

    let preferredHeight = current.safeCenterHeight;
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
          surfaceSpeed: isVertical
            ? movementSpeed *
              (SEARCH_VERTICAL_SPEED / SEARCH_SPEED)
            : movementSpeed
        })
      : null;
  };

  const planSearchRoute = (
    bit: RuntimeBit,
    elapsedSeconds: number,
    movementSpeed: number
  ) => {
    const current = bit.navigationLocation;
    if (!current) {
      return false;
    }
    const policy = createBitFlightSearchRoutePolicy({
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
    const surfaceCandidates: Array<
      Readonly<{
        value: Readonly<{
          traversal: BitFlightTransitionTraversal | null;
          surfaceSpeed: number;
        }>;
        destination: BitFlightLocation;
        costBias: number;
      }>
    > = [];
    const surfaceCandidate = createSearchSurfaceDestination(
      bit,
      movementSpeed
    );
    if (surfaceCandidate) {
      surfaceCandidates.push(
        Object.freeze({
          value: Object.freeze({
            traversal: null,
            surfaceSpeed: surfaceCandidate.surfaceSpeed
          }),
          destination: surfaceCandidate.destination,
          costBias: 0
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
        const destinationPoint = getTraversalDestinationPosition(traversal);
        const destination = findSafeLocation(
          traversal.to,
          destinationPoint,
          destinationPoint.y
        );
        if (destination) {
          transitionCandidates.push(
            Object.freeze({
              value: Object.freeze({
                traversal,
                surfaceSpeed: movementSpeed
              }),
              destination,
              costBias: 0
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
    const selected =
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
      );
    if (!selected || !assignRoute(bit, selected, "search")) {
      return false;
    }
    bit.searchSurfaceSpeed = selected.value.surfaceSpeed;
    bit.searchSegmentSeconds = randomRange(
      SEARCH_SEGMENT_SECONDS_MIN,
      SEARCH_SEGMENT_SECONDS_MAX
    );
    return true;
  };

  const updateSearch = (
    bit: RuntimeBit,
    deltaSeconds: number,
    elapsedSeconds: number,
    movementSpeed = bit.profile.searchSpeed
  ) => {
    bit.mode = "search";
    if (
      bit.pendingEscapeThreatPosition &&
      !tryPlanPendingEscape(bit, elapsedSeconds)
    ) {
      syncStationaryPosition(bit, elapsedSeconds, true);
      return;
    }
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
    bit.searchRetrySeconds = Math.max(
      0,
      bit.searchRetrySeconds - deltaSeconds
    );
    bit.searchSegmentSeconds = Math.max(
      0,
      bit.searchSegmentSeconds - deltaSeconds
    );

    if (
      bit.routePurpose === "escape" ||
      bit.routePurpose === "search"
    ) {
      const surfaceSpeed =
        bit.routePurpose === "search"
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
      if (state === "arrived" || state === "blocked" || state === "unreachable") {
        clearRoute(bit);
        bit.searchRetrySeconds = SEARCH_RETRY_SECONDS;
      } else if (
        bit.routePurpose === "escape" &&
        state === "surface"
      ) {
        return;
      } else if (bit.searchSegmentSeconds > 0) {
        return;
      } else if (bit.navigationLocation) {
        clearRoute(bit);
      }
    }

    if (
      bit.navigationLocation &&
      bit.searchRetrySeconds === 0 &&
      allowedSearchRoutePlanIds.has(bit.id)
    ) {
      bit.hasAttemptedSearchRoute = true;
      if (!planSearchRoute(bit, elapsedSeconds, movementSpeed)) {
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
    deltaSeconds: number,
    elapsedSeconds: number,
    surfaceSpeedOverride: number | null = null
  ) => {
    bit.mode = "chase";
    bit.routeRefreshSeconds = Math.max(
      0,
      bit.routeRefreshSeconds - deltaSeconds
    );
    if (bit.activeTransition) {
      advanceAgent(
        bit,
        surfaceSpeedOverride ?? bit.profile.chaseSpeed,
        deltaSeconds,
        elapsedSeconds
      );
      return;
    }
    if (!bit.navigationLocation) {
      return;
    }

    const hasChaseRoute =
      bit.routePurpose === "chase" && bit.routeDestination !== null;
    const shouldRefresh =
      bit.routeRefreshSeconds === 0 &&
      (!hasChaseRoute ||
        Vector3.Distance(
          getBitFlightWorldPosition(bit.routeDestination!),
          targetPosition
        ) > TARGET_ROUTE_MOVE_THRESHOLD);
    if (shouldRefresh && allowedChaseRoutePlanIds.has(bit.id)) {
      bit.lastChasePlanTargetId = bit.targetId;
      const selected = selectTargetDestination(bit, targetPosition);
      if (selected) {
        assignRoute(
          bit,
          selected,
          "chase"
        );
        bit.lastSeenDestination = selected.destination;
      } else {
        clearRoute(bit);
        bit.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      }
    }

    if (bit.routePurpose === "chase") {
      const surfaceSpeedThreshold = config.combatEnabled
        ? FIRE_RANGE
        : bit.profile.visionRange;
      const targetDistance = Vector3.Distance(
        bit.root.position,
        targetPosition
      );
      const speed =
        surfaceSpeedOverride ??
        (targetDistance > surfaceSpeedThreshold
          ? bit.profile.searchSpeed
          : bit.profile.chaseSpeed);
      advanceAgent(bit, speed, deltaSeconds, elapsedSeconds);
    } else {
      syncStationaryPosition(bit, elapsedSeconds, true);
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
        safety.findMovementCollision(
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
        leader.profile
      );
      follower.targetId = leader.targetId;
      follower.targetProvenance = leader.targetProvenance;
      follower.alertLeaderId = leader.alertLeaderId;
      follower.lastSeenAimPosition = targetAimPosition.clone();
      follower.lastSeenDestination = destination;
      follower.carpetLeaderId = leader.id;
      follower.carpetOffset = offsets[index];
      follower.lockedDirection.copyFrom(direction);
      follower.carpetAimStartDirection.copyFrom(direction);
      follower.carpetAimSeconds = CARPET_AIM_TURN_SECONDS;
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
      const selected = selectSameBandTargetDestination(leader, targetPosition);
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
        const selected = selectSameBandTargetDestination(
          leader,
          targetPosition
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
    const followers = bits.filter(
      (candidate) =>
        candidate.mode === "carpet-follower" &&
        candidate.carpetLeaderId === leader.id
    );
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
    const leaderBlocked = safety.findMovementCollision(
      leader.root.position,
      proposedLeaderRoot
    );
    const followerBlocked = followers.some((follower, index) =>
      safety.findMovementCollision(
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
    bit.alertLeaderId = null;
    bit.lastSeenAimPosition = target.aimPosition.clone();
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
    activeAlerts.delete(alertKey);
    closedInternalAlertKeys.add(alertKey);
    for (const bit of bits) {
      const isLeader =
        bit.id === alert.leaderId && bit.mode === "alert-send";
      const isReceiver =
        alert.receiverIds?.has(bit.id) === true &&
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
        : bits.find(
              (candidate) => candidate.id === bit.alertLeaderId
            )?.root.position ??
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
    allowedChaseRoutePlanIds.add(bit.id);
    updateChaseRoute(
      bit,
      leaderPosition,
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
      alert.receiverIds !== null &&
      alert.gatheredIds.size >= alert.receiverIds.size;
    if (!alert || gathered || bit.modeTimerSeconds === 0) {
      if (alertKey !== null) {
        activeAlerts.delete(alertKey);
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
      updateSearch(
        bit,
        deltaSeconds,
        elapsedSeconds,
        bit.profile.randomAttackSpeed
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

  return {
    update: ({ deltaSeconds, elapsedSeconds, targets, externalAlerts }) => {
      assertNonNegativeFiniteNumber("ビット更新deltaSeconds", deltaSeconds);
      assertNonNegativeFiniteNumber("ビット更新elapsedSeconds", elapsedSeconds);
      updateFadingCarpetFollowers(deltaSeconds);
      const targetsById = new Map(
        targets.map((target) => [target.id, target] as const)
      );
      const sightCheckEligibleCount = bits.filter(
        (bit) => bit.mode !== "carpet-follower"
      ).length;
      sightCheckCredit = Math.min(
        sightCheckEligibleCount,
        sightCheckCredit +
          sightCheckEligibleCount *
            (deltaSeconds / TARGET_SIGHT_CHECK_INTERVAL_SECONDS)
      );
      const maximumSightChecks =
        sightCheckEligibleCount === 0
          ? 0
          : Math.max(
              1,
              Math.ceil(
                sightCheckEligibleCount *
                  TARGET_SIGHT_CHECK_MAXIMUM_SHARE_PER_UPDATE
              )
            );
      const sightCheckSelection = selectRoundRobinBitIds(
        sightCheckCursor,
        Math.min(Math.floor(sightCheckCredit), maximumSightChecks),
        (bit) => bit.mode !== "carpet-follower",
        () => false
      );
      const allowedSightCheckIds = sightCheckSelection.ids;
      sightCheckCursor = sightCheckSelection.nextCursor;
      sightCheckCredit -= allowedSightCheckIds.size;
      const searchPlanSelection = selectRoundRobinBitIds(
        searchRoutePlanCursor,
        SEARCH_ROUTE_PLAN_BUDGET_PER_UPDATE,
        (bit) =>
          (bit.mode === "search" || bit.mode === "random") &&
          (bit.mode === "random" || bit.targetId === null) &&
          bit.navigationLocation !== null &&
          bit.pendingEscapeThreatPosition === null &&
          bit.searchRetrySeconds <= deltaSeconds &&
          (bit.routePurpose === null ||
            (bit.routePurpose === "search" &&
              bit.searchSegmentSeconds <= deltaSeconds)),
        (bit) => !bit.hasAttemptedSearchRoute
      );
      allowedSearchRoutePlanIds = searchPlanSelection.ids;
      searchRoutePlanCursor = searchPlanSelection.nextCursor;
      const chasePlanSelection = selectRoundRobinBitIds(
        chaseRoutePlanCursor,
        CHASE_ROUTE_PLAN_BUDGET_PER_UPDATE,
        (bit) => {
          if (
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
          if (bit.mode === "carpet-leader") {
            return (
              bit.carpetLeaderId === null ||
              bit.routeDestination === null ||
              Vector3.Distance(
                getBitFlightWorldPosition(bit.routeDestination),
                target.aimPosition
              ) > TARGET_ROUTE_MOVE_THRESHOLD
            );
          }
          return (
            bit.routePurpose !== "chase" ||
            bit.routeDestination === null ||
            Vector3.Distance(
              getBitFlightWorldPosition(bit.routeDestination),
              target.aimPosition
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
      const maximumVisionRange = bits.reduce(
        (maximum, bit) =>
          Math.max(maximum, bit.profile.visionRange),
        0
      );
      const targetSpatialIndex = createV2HumanTargetSpatialIndex(
        targets,
        Math.max(1, maximumVisionRange)
      );

      const incomingAlertKeys = new Set<string>();
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
        if (current) {
          current.remainingSeconds = Math.max(
            current.remainingSeconds,
            alert.remainingSeconds
          );
        } else {
          activeAlerts.set(alertKey, {
            leaderId: alert.leaderId,
            targetId: alert.targetId,
            remainingSeconds: alert.remainingSeconds,
            receiverIds: null,
            gatheredIds: new Set<string>(),
            internalBitAlert: false
          });
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
          activeAlerts.delete(alertKey);
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
        const leader = bits.find(
          (bit) => bit.id === alert.leaderId
        );
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
        bit.attackCooldownSeconds = Math.max(
          0,
          bit.attackCooldownSeconds - deltaSeconds
        );
        bit.carpetCooldownSeconds = Math.max(
          0,
          bit.carpetCooldownSeconds - deltaSeconds
        );
        if (aiSuspended) {
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
          updateSearch(bit, deltaSeconds, elapsedSeconds);
          continue;
        }

        const assignedTarget =
          bit.targetId === null ? null : targetsById.get(bit.targetId) ?? null;
        let targetVisible = false;
        let chasePosition: Vector3 | null = null;
        const retainsLockedAttack =
          bit.mode === "fixed" || bit.mode === "random";

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
          targetVisible = getAssignedTargetVisibility(
            bit,
            assignedTarget,
            allowedSightCheckIds.has(bit.id)
          );
          if (targetVisible) {
            bit.lastSeenAimPosition = assignedTarget.aimPosition.clone();
            bit.targetLostSeconds = 0;
            chasePosition = assignedTarget.aimPosition;
          } else if (bit.targetProvenance === "visual") {
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
              lastSeenDistance > TARGET_LOST_MAXIMUM_DISTANCE
            ) {
              abandonTarget(bit, elapsedSeconds);
              chasePosition = null;
            }
          } else {
            chasePosition = assignedTarget.aimPosition;
          }
        } else if (
          bit.targetId !== null &&
          bit.targetProvenance === "visual" &&
          bit.lastSeenAimPosition
        ) {
          bit.sightTargetVisible = false;
          bit.targetLostSeconds += deltaSeconds;
          chasePosition = bit.lastSeenAimPosition;
          if (
            bit.targetLostSeconds >= TARGET_LOST_TIMEOUT_SECONDS ||
            Vector3.Distance(bit.root.position, bit.lastSeenAimPosition) >
              TARGET_LOST_MAXIMUM_DISTANCE
          ) {
            abandonTarget(bit, elapsedSeconds);
            chasePosition = null;
          }
        } else if (bit.targetId !== null) {
          abandonTarget(bit, elapsedSeconds);
        }

        if (bit.targetId === null) {
          const visibleTarget = allowedSightCheckIds.has(bit.id)
            ? findVisibleTarget(
                bit,
                targetSpatialIndex.query(
                  bit.root.position,
                  bit.profile.visionRange
                )
              )
            : null;
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
          updateSearch(bit, deltaSeconds, elapsedSeconds);
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
            for (const follower of bits) {
              if (
                follower.mode === "carpet-follower" &&
                follower.carpetLeaderId === bit.id
              ) {
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
          }
          if (
            bit.carpetPassSeconds >=
            V2_BIT_CARPET_PASS_DURATION_SECONDS
          ) {
            abandonTarget(bit, elapsedSeconds);
          }
          continue;
        } else {
          if (
            config.combatEnabled &&
            bit.mode === "chase" &&
            Vector3.Distance(
              bit.root.position,
              currentTarget?.aimPosition ?? chasePosition
            ) > TARGET_LOST_MAXIMUM_DISTANCE
          ) {
            abandonTarget(bit, elapsedSeconds);
            continue;
          }
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
          updateChaseRoute(
            bit,
            chasePosition,
            deltaSeconds,
            elapsedSeconds
          );
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
          activeAlerts.delete(alertKey);
          if (alert.internalBitAlert) {
            closedInternalAlertKeys.add(alertKey);
          }
        }
      }
      frameBeamRequests = Object.freeze(beamRequests);
    },
    getActorSpheres: () =>
      Object.freeze(
        bits.map((bit) =>
          Object.freeze({
            id: bit.id,
            kind: "bit" as const,
            center: bit.root.position.clone(),
            radius: BIT_ACTOR_RADIUS
          })
        )
      ),
    getBeamRequests: () => frameBeamRequests,
    takeAlertRequests: () => {
      const requests = Object.freeze(pendingAlertRequests);
      pendingAlertRequests = [];
      return requests;
    },
    getTargetStates: () =>
      Object.freeze(
        bits.map((bit) =>
          Object.freeze({
            bitId: bit.id,
            mode: bit.mode,
            isRed: bit.profile.isRed,
            statMultiplier: bit.profile.statMultiplier,
            modeTimerSeconds: bit.modeTimerSeconds,
            attackCooldownSeconds: bit.attackCooldownSeconds,
            carpetCooldownSeconds: bit.carpetCooldownSeconds,
            targetId: bit.targetId,
            provenance: bit.targetProvenance,
            alertLeaderId: bit.alertLeaderId
          })
        )
      ),
    getFlightStates: () =>
      Object.freeze(
        bits.map((bit) => {
          const location = bit.navigationLocation;
          const agentState = bit.flightAgent.getSnapshot().state;
          const activeTransition = bit.activeTransition;
          return Object.freeze({
            bitId: bit.id,
            zoneId: location?.zoneId ?? null,
            bandId: location?.bandId ?? null,
            position: bit.root.position.clone(),
            safeCenterHeight: location?.safeCenterHeight ?? null,
            heightMode: location?.heightMode ?? null,
            routePurpose: bit.routePurpose,
            activeTransition: activeTransition
              ? Object.freeze({
                  id: activeTransition.transition.id,
                  kind: activeTransition.transition.kind,
                  reversed: activeTransition.reversed
                })
              : null,
            agentState
          });
        })
      ),
    notifyBeamImpact: (sourceId, targetId) => {
      const source = bits.find((bit) => bit.id === sourceId);
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
      return true;
    },
    prepareForScriptedPhase: () => {
      disposeFadingCarpetFollowers();
      for (let index = bits.length - 1; index >= 0; index -= 1) {
        const bit = bits[index];
        if (bit.mode !== "carpet-follower") {
          continue;
        }
        bit.flightAgent.dispose();
        bit.root.dispose(false);
        bits.splice(index, 1);
      }
      for (const bit of bits) {
        clearRoute(bit);
        bit.mode = "search";
        bit.targetId = null;
        bit.targetProvenance = null;
        bit.alertLeaderId = null;
        bit.lastSeenAimPosition = null;
        bit.lastSeenDestination = null;
        bit.lastChasePlanTargetId = null;
        bit.pendingEscapeThreatPosition = null;
        bit.sightTargetId = null;
        bit.sightTargetVisible = false;
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
      }
      activeAlerts.clear();
      closedInternalAlertKeys.clear();
      frameBeamRequests = Object.freeze([]);
      pendingAlertRequests = [];
    },
    setAiSuspended: (suspended) => {
      aiSuspended = suspended;
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
        const bit = bits.find(
          (candidate) => candidate.id === assignment.id
        );
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
        bit.routeRefreshSeconds = 0;
        bit.activeTransition = null;
        bit.lastChasePlanTargetId = null;
        bit.root.position.copyFrom(
          getBitFlightWorldPosition(location)
        );
        bit.root.computeWorldMatrix(true);
      }
    },
    dispose: () => {
      disposeFadingCarpetFollowers();
      for (let index = bits.length - 1; index >= 0; index -= 1) {
        bits[index].flightAgent.dispose();
        bits[index].root.dispose(false);
      }
      bits.length = 0;
      activeAlerts.clear();
      closedInternalAlertKeys.clear();
      explorationHistory.clear();
      frameBeamRequests = Object.freeze([]);
      pendingAlertRequests = [];
      materials.body.dispose();
      materials.redBody.dispose();
      materials.muzzle.dispose();
    }
  };
};
