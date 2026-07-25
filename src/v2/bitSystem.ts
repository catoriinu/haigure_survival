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
  calculateBitFlightRouteCost,
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
import { createV2HumanTargetSpatialIndex } from "./humanTargetSpatialIndex";

const BIT_BODY_HEIGHT = 0.15;
const BIT_BODY_DIAMETER = 0.12;
const BIT_MUZZLE_DIAMETER = 0.03;
const BIT_MUZZLE_OFFSET = BIT_BODY_HEIGHT / 2 + 0.02;
const BIT_ACTOR_RADIUS = BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS;

const VISION_RANGE = 2.67;
const VISION_COSINE = Math.cos((100 * Math.PI) / 180);
const SEARCH_SPEED = 0.25;
const SEARCH_VERTICAL_SPEED = 0.06;
const CHASE_SPEED = 0.22;
const CHASE_OUT_OF_RANGE_SPEED = 0.25;
const CARPET_SPEED = 0.75;
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
const TARGET_LOST_TIMEOUT_SECONDS = 18;
const TARGET_LOST_MAXIMUM_DISTANCE = 2.6;
const ESCAPE_DESIRED_DISTANCE_GAIN = 0.8;
const ESCAPE_VISIBLE_DESTINATION_PENALTY = 2;
const ESCAPE_DISTANCE_GAIN_PENALTY = 2;
const FIRE_RANGE = 1.2;
const FIRE_INTERVAL_MIN = 2.4;
const FIRE_INTERVAL_MAX = 3.2;
const BEAM_SPEED = 1.58;
const BEAM_MAXIMUM_LIFETIME = 20;
const BOB_AMPLITUDE = 0.03;
const CARPET_FORMATION_SPACING = 0.25;
const CARPET_MODE_CHANCE = 0.1;
const ALERT_CARPET_MODE_CHANCE = 0.2;
const CARPET_PROJECTION_TOLERANCE = 0.04;
const LOCATION_PROJECTION_DISTANCE = 0.75;
const HEIGHT_PROBE_DISTANCE = 5;
const HEIGHT_SAMPLE_COUNT = 9;

const BIT_FLIGHT_AGENT_CONFIG = Object.freeze({
  waypointTolerance: 0.03
});

export type V2BitMode =
  | "search"
  | "chase"
  | "carpet-leader"
  | "carpet-follower";

export type V2BitSystemConfig = Readonly<{
  initialBitCount: number;
  minimumSpawnDistance: number;
  spawnMaxAttempts: number;
  spawnProjectionMaxDistance: number;
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
  targetId: string | null;
  provenance: V2TargetProvenance | null;
  alertLeaderId: string | null;
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
  dispose(): void;
}

type ActiveAlert = {
  leaderId: string;
  targetId: string;
  remainingSeconds: number;
};

type RuntimeBit = {
  id: string;
  root: TransformNode;
  body: Mesh;
  muzzle: Mesh;
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
  targetLostSeconds: number;
  fireSeconds: number;
  carpetLeaderId: string | null;
  carpetOffset: number;
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
  let muzzle: StandardMaterial | null = null;
  try {
    body = new StandardMaterial("v2BitBodyMaterial", scene);
    body.diffuseColor = new Color3(0.08, 0.08, 0.09);
    body.specularColor = new Color3(0.35, 0.35, 0.4);

    muzzle = new StandardMaterial("v2BitMuzzleMaterial", scene);
    muzzle.diffuseColor = new Color3(1, 0.18, 0.74);
    muzzle.emissiveColor = new Color3(0.7, 0.06, 0.42);
    muzzle.specularColor = Color3.Black();

    return { body, muzzle };
  } catch (error) {
    muzzle?.dispose();
    body?.dispose();
    throw error;
  }
};

const createBitVisual = (
  scene: Scene,
  materials: Readonly<{ body: StandardMaterial; muzzle: StandardMaterial }>,
  id: string
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
    body.material = materials.body;
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
  const activeAlerts = new Map<string, ActiveAlert>();
  let frameBeamRequests: readonly V2BeamRequest[] = Object.freeze([]);
  let pendingAlertRequests: V2AlertRequest[] = [];
  let nextBitIndex = 0;
  let searchRoutePlanCursor = 0;
  let chaseRoutePlanCursor = 0;
  let escapeRoutePlanCursor = 0;
  let allowedSearchRoutePlanIds = new Set<string>();
  let allowedChaseRoutePlanIds = new Set<string>();
  let allowedEscapeRoutePlanIds = new Set<string>();
  let remainingUnassignedEscapeRoutePlans = 0;

  const selectRoundRobinRoutePlanIds = (
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
    mode: V2BitMode = "search"
  ) => {
    const position = getBitFlightWorldPosition(navigationLocation);
    assertFiniteVector("ビットの飛行位置", position);
    if (!safety.isCenterSafe(position)) {
      throw new Error("ビット初期位置に0.54m安全包絡が収まりません。");
    }
    const id = `v2_bit_${nextBitIndex}`;
    nextBitIndex += 1;
    const visual = createBitVisual(scene, materials, id);
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
        flightAgent,
        navigationLocation,
        routePurpose: null,
        routeDestination: null,
        routeRefreshSeconds: 0,
        searchSegmentSeconds: 0,
        searchSurfaceSpeed: SEARCH_SPEED,
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
        targetLostSeconds: 0,
        fireSeconds: randomRange(FIRE_INTERVAL_MIN, FIRE_INTERVAL_MAX),
        carpetLeaderId: null,
        carpetOffset: 0
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
    if (distanceSquared > VISION_RANGE * VISION_RANGE) {
      return false;
    }
    if (distanceSquared === 0) {
      return true;
    }
    const forward = bit.root.getDirection(Vector3.Forward()).normalize();
    return (
      Vector3.Dot(forward, toTarget) / Math.sqrt(distanceSquared) >=
      VISION_COSINE
    );
  };

  const canSeeTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) =>
    isTargetable(target) &&
    isInsideVision(bit, target) &&
    isSightClear(bit.root.position, target.aimPosition);

  const findVisibleTarget = (
    bit: RuntimeBit,
    targets: readonly V2HumanTargetSnapshot[]
  ) => {
    let closest: V2HumanTargetSnapshot | null = null;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      if (!isTargetable(target) || !canSeeTarget(bit, target)) {
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
      const totalCost =
        calculateBitFlightRouteCost(route, policy) + candidate.costBias;
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

  const removeCarpetFollowers = (leader: RuntimeBit) => {
    for (let index = bits.length - 1; index >= 0; index -= 1) {
      const candidate = bits[index];
      if (
        candidate.mode !== "carpet-follower" ||
        candidate.carpetLeaderId !== leader.id
      ) {
        continue;
      }
      candidate.flightAgent.dispose();
      candidate.root.dispose(false);
      bits.splice(index, 1);
    }
  };

  const convertCarpetToChase = (leader: RuntimeBit) => {
    removeCarpetFollowers(leader);
    leader.mode = "chase";
    leader.carpetLeaderId = null;
    leader.carpetOffset = 0;
    leader.lastChasePlanTargetId = null;
    clearRoute(leader);
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
    bit.pendingEscapeThreatPosition = null;
    bit.mode = nextRandom() < CARPET_MODE_CHANCE ? "carpet-leader" : "chase";
    pendingAlertRequests.push(
      Object.freeze({ leaderId: bit.id, targetId: target.id })
    );
  };

  const setAlertTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    leaderId: string
  ) => {
    clearRoute(bit);
    bit.targetId = target.id;
    bit.targetProvenance = "alert";
    bit.alertLeaderId = leaderId;
    bit.lastSeenAimPosition = target.aimPosition.clone();
    bit.lastSeenDestination = null;
    bit.lastChasePlanTargetId = null;
    bit.targetLostSeconds = 0;
    bit.pendingEscapeThreatPosition = null;
    bit.mode =
      nextRandom() < ALERT_CARPET_MODE_CHANCE ? "carpet-leader" : "chase";
  };

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
    bit.mode = "search";
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
      if (alert.leaderId === bit.id) {
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
    bit: RuntimeBit
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
            ? SEARCH_VERTICAL_SPEED
            : SEARCH_SPEED
        })
      : null;
  };

  const planSearchRoute = (
    bit: RuntimeBit,
    elapsedSeconds: number
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
    const surfaceCandidate = createSearchSurfaceDestination(bit);
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
                surfaceSpeed: SEARCH_SPEED
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
          : SEARCH_SPEED;
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
      if (!planSearchRoute(bit, elapsedSeconds)) {
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
    elapsedSeconds: number
  ) => {
    bit.mode = "chase";
    bit.routeRefreshSeconds = Math.max(
      0,
      bit.routeRefreshSeconds - deltaSeconds
    );
    if (bit.activeTransition) {
      advanceAgent(bit, CHASE_SPEED, deltaSeconds, elapsedSeconds);
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
      const speed =
        Vector3.Distance(bit.root.position, targetPosition) > VISION_RANGE
          ? CHASE_OUT_OF_RANGE_SPEED
          : CHASE_SPEED;
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

  const tryCreateCarpetFollowers = (
    leader: RuntimeBit,
    destination: BitFlightLocation,
    targetAimPosition: Vector3
  ) => {
    if (
      !leader.navigationLocation ||
      !sameBand(leader.navigationLocation, destination)
    ) {
      leader.mode = "chase";
      return false;
    }
    const direction = normalizeHorizontal(
      getBitFlightWorldPosition(destination).subtract(leader.root.position)
    );
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
        "carpet-follower"
      );
      follower.targetId = leader.targetId;
      follower.targetProvenance = leader.targetProvenance;
      follower.alertLeaderId = leader.alertLeaderId;
      follower.lastSeenAimPosition = targetAimPosition.clone();
      follower.lastSeenDestination = destination;
      follower.carpetLeaderId = leader.id;
      follower.carpetOffset = offsets[index];
      syncStationaryPosition(follower, 0, false);
      pointBitAt(follower, targetAimPosition);
    }
    leader.carpetLeaderId = leader.id;
    return true;
  };

  const updateCarpet = (
    leader: RuntimeBit,
    targetPosition: Vector3,
    targetAimPosition: Vector3,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    if (!leader.navigationLocation) {
      convertCarpetToChase(leader);
      return;
    }
    leader.routeRefreshSeconds = Math.max(
      0,
      leader.routeRefreshSeconds - deltaSeconds
    );
    const requiresRoutePlan =
      leader.routeRefreshSeconds === 0 &&
      (!leader.routeDestination ||
        leader.carpetLeaderId === null ||
        Vector3.Distance(
          getBitFlightWorldPosition(leader.routeDestination),
          targetPosition
        ) > TARGET_ROUTE_MOVE_THRESHOLD);
    if (requiresRoutePlan) {
      if (!allowedChaseRoutePlanIds.has(leader.id)) {
        syncStationaryPosition(leader, elapsedSeconds, false);
        pointBitAt(leader, targetAimPosition);
        return;
      }
      const selected = selectSameBandTargetDestination(leader, targetPosition);
      if (
        !selected ||
        routeContainsTransition(selected.route) ||
        !sameBand(leader.navigationLocation, selected.destination)
      ) {
        convertCarpetToChase(leader);
        return;
      }
      leader.lastChasePlanTargetId = leader.targetId;
      leader.routeDestination = selected.destination;
      leader.routeRefreshSeconds = TARGET_ROUTE_REFRESH_SECONDS;
      leader.lastSeenDestination = selected.destination;
    }
    const destination = leader.routeDestination;
    if (!destination || !sameBand(leader.navigationLocation, destination)) {
      convertCarpetToChase(leader);
      return;
    }
    if (
      leader.carpetLeaderId === null &&
      !tryCreateCarpetFollowers(leader, destination, targetAimPosition)
    ) {
      convertCarpetToChase(leader);
      return;
    }

    const direction = normalizeHorizontal(
      getBitFlightWorldPosition(destination).subtract(leader.root.position)
    );
    const distance = Vector3.Distance(
      new Vector3(
        leader.root.position.x,
        getBitFlightWorldPosition(destination).y,
        leader.root.position.z
      ),
      getBitFlightWorldPosition(destination)
    );
    const stepDistance = Math.min(CARPET_SPEED * deltaSeconds, distance);
    const proposedLeaderPosition = getBitFlightWorldPosition(
      leader.navigationLocation
    ).add(direction.scale(stepDistance));
    const proposedLeaderLocation = projectCarpetLocation(
      leader.navigationLocation,
      proposedLeaderPosition
    );
    if (!proposedLeaderLocation) {
      convertCarpetToChase(leader);
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
        convertCarpetToChase(leader);
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
        convertCarpetToChase(leader);
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
      convertCarpetToChase(leader);
      return;
    }

    leader.navigationLocation = proposedLeaderLocation;
    leader.root.position.copyFrom(proposedLeaderRoot);
    pointBitAt(leader, targetAimPosition);
    for (let index = 0; index < followers.length; index += 1) {
      const follower = followers[index];
      follower.navigationLocation = followerDestinations[index];
      follower.root.position.copyFrom(
        getBitFlightWorldPosition(followerDestinations[index])
      );
      pointBitAt(follower, targetAimPosition);
    }
  };

  const emitBeamWhenReady = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    beamRequests: V2BeamRequest[]
  ) => {
    bit.fireSeconds -= deltaSeconds;
    if (
      bit.fireSeconds > 0 ||
      Vector3.Distance(bit.root.position, target.aimPosition) > FIRE_RANGE
    ) {
      return;
    }
    bit.root.computeWorldMatrix(true);
    const origin = bit.muzzle.getAbsolutePosition();
    const direction = target.aimPosition.subtract(origin);
    if (direction.lengthSquared() === 0) {
      return;
    }
    beamRequests.push(
      Object.freeze({
        sourceId: bit.id,
        origin: origin.clone(),
        direction: direction.normalize(),
        speed: BEAM_SPEED,
        maximumLifetime: BEAM_MAXIMUM_LIFETIME
      })
    );
    bit.fireSeconds = randomRange(FIRE_INTERVAL_MIN, FIRE_INTERVAL_MAX);
  };

  return {
    update: ({ deltaSeconds, elapsedSeconds, targets, externalAlerts }) => {
      assertNonNegativeFiniteNumber("ビット更新deltaSeconds", deltaSeconds);
      assertNonNegativeFiniteNumber("ビット更新elapsedSeconds", elapsedSeconds);
      const targetsById = new Map(
        targets.map((target) => [target.id, target] as const)
      );
      const searchPlanSelection = selectRoundRobinRoutePlanIds(
        searchRoutePlanCursor,
        SEARCH_ROUTE_PLAN_BUDGET_PER_UPDATE,
        (bit) =>
          bit.mode === "search" &&
          bit.targetId === null &&
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
      const chasePlanSelection = selectRoundRobinRoutePlanIds(
        chaseRoutePlanCursor,
        CHASE_ROUTE_PLAN_BUDGET_PER_UPDATE,
        (bit) => {
          if (
            (bit.mode !== "chase" && bit.mode !== "carpet-leader") ||
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
      const escapePlanSelection = selectRoundRobinRoutePlanIds(
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
      const targetSpatialIndex = createV2HumanTargetSpatialIndex(
        targets,
        VISION_RANGE
      );

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
        const current = activeAlerts.get(alertKey);
        if (!current || current.remainingSeconds < alert.remainingSeconds) {
          activeAlerts.set(alertKey, {
            leaderId: alert.leaderId,
            targetId: alert.targetId,
            remainingSeconds: alert.remainingSeconds
          });
        }
      }

      for (const [alertKey, alert] of activeAlerts) {
        const target = targetsById.get(alert.targetId);
        if (!target || !isTargetable(target)) {
          activeAlerts.delete(alertKey);
        }
      }

      const beamRequests: V2BeamRequest[] = [];
      pendingAlertRequests = [];
      for (const bit of [...bits]) {
        if (bit.mode === "carpet-follower") {
          continue;
        }

        const assignedTarget =
          bit.targetId === null ? null : targetsById.get(bit.targetId) ?? null;
        let targetVisible = false;
        let chasePosition: Vector3 | null = null;

        if (assignedTarget && !isTargetable(assignedTarget)) {
          abandonTarget(bit, elapsedSeconds);
        } else if (
          assignedTarget &&
          bit.targetProvenance === "alert" &&
          (bit.alertLeaderId === null ||
            !activeAlerts.has(
              buildAlertKey(bit.alertLeaderId, assignedTarget.id)
            ))
        ) {
          abandonTarget(bit, elapsedSeconds);
        } else if (assignedTarget) {
          targetVisible = canSeeTarget(bit, assignedTarget);
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
          const visibleTarget = findVisibleTarget(
            bit,
            targetSpatialIndex.query(bit.root.position, VISION_RANGE)
          );
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
              targetVisible = canSeeTarget(bit, alertTarget.target);
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

        if (bit.mode === "carpet-leader") {
          updateCarpet(
            bit,
            chasePosition,
            currentTarget?.aimPosition ?? chasePosition,
            deltaSeconds,
            elapsedSeconds
          );
        } else {
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
        }
        if (currentTarget && targetVisible) {
          emitBeamWhenReady(bit, currentTarget, deltaSeconds, beamRequests);
          if (bit.mode === "carpet-leader") {
            for (const follower of bits) {
              if (
                follower.mode === "carpet-follower" &&
                follower.carpetLeaderId === bit.id
              ) {
                emitBeamWhenReady(
                  follower,
                  currentTarget,
                  deltaSeconds,
                  beamRequests
                );
              }
            }
          }
        }
      }

      for (const [alertKey, alert] of activeAlerts) {
        alert.remainingSeconds -= deltaSeconds;
        if (alert.remainingSeconds <= 0) {
          activeAlerts.delete(alertKey);
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
    dispose: () => {
      for (let index = bits.length - 1; index >= 0; index -= 1) {
        bits[index].flightAgent.dispose();
        bits[index].root.dispose(false);
      }
      bits.length = 0;
      activeAlerts.clear();
      explorationHistory.clear();
      frameBeamRequests = Object.freeze([]);
      pendingAlertRequests = [];
      materials.body.dispose();
      materials.muzzle.dispose();
    }
  };
};
