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
  createNavigationAgent,
  type NavigationAgent
} from "../world/navigationAgent";
import type { NavigationLocation } from "../world/navigationWorld";
import { createStageBoundarySpawnSampler } from "../world/stageSpawnSampler";
import type { StageSpatialContext } from "../world/stageSpatialContext";
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
const BIT_ACTOR_RADIUS = BIT_MUZZLE_OFFSET + BIT_MUZZLE_DIAMETER / 2;

const VISION_RANGE = 2.67;
const VISION_COSINE = Math.cos((100 * Math.PI) / 180);
const SEARCH_SPEED = 0.25;
const CHASE_SPEED = 0.22;
const CARPET_SPEED = 0.75;
const SEARCH_RADIUS = 2.4;
const SEARCH_RETRY_SECONDS = 0.5;
const FIRE_RANGE = 1.2;
const FIRE_INTERVAL_MIN = 2.4;
const FIRE_INTERVAL_MAX = 3.2;
const BEAM_SPEED = 1.58;
const BEAM_MAXIMUM_LIFETIME = 20;
const BOB_AMPLITUDE = 0.03;
const CARPET_FORMATION_SPACING = 0.25;
const CARPET_MODE_CHANCE = 0.1;
const ALERT_CARPET_MODE_CHANCE = 0.2;
const GROUND_PROBE_UPWARD_OFFSET = 0.5;
const GROUND_PROBE_DISTANCE = 1.5;
const CARPET_PROJECTION_TOLERANCE = 0.04;

const NAVIGATION_AGENT_CONFIG = Object.freeze({
  projectionMaxDistance: 0.5,
  targetMoveThreshold: 0.2,
  pathRefreshIntervalSeconds: 0.5,
  waypointTolerance: 0.03,
  stuckDistanceThreshold: 0.01,
  stuckDurationSeconds: 0.75
});

export type V2BitMode = "search" | "chase" | "carpet-leader" | "carpet-follower";

export type V2BitSystemConfig = Readonly<{
  initialBitCount: number;
  minimumSpawnDistance: number;
  spawnMaxAttempts: number;
  spawnProjectionMaxDistance: number;
  minimumFlightHeight: number;
  maximumFlightHeight: number;
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

export interface V2BitSystem {
  update(input: V2BitSystemUpdateInput): void;
  getActorSpheres(): readonly V2ActorSphere[];
  getBeamRequests(): readonly V2BeamRequest[];
  takeAlertRequests(): readonly V2AlertRequest[];
  getTargetStates(): readonly V2BitTargetState[];
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
  navigationAgent: NavigationAgent;
  navigationLocation: NavigationLocation;
  groundOffsetY: number;
  flightHeight: number;
  bobPhase: number;
  mode: V2BitMode;
  targetId: string | null;
  targetProvenance: V2TargetProvenance | null;
  alertLeaderId: string | null;
  wanderTarget: NavigationLocation | null;
  wanderRetrySeconds: number;
  fireSeconds: number;
  carpetLeaderId: string | null;
  carpetOffset: number;
};

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
  assertPositiveFiniteNumber("minimumFlightHeight", config.minimumFlightHeight);
  assertPositiveFiniteNumber("maximumFlightHeight", config.maximumFlightHeight);
  if (config.minimumFlightHeight > config.maximumFlightHeight) {
    throw new Error(
      "minimumFlightHeightはmaximumFlightHeight以下で指定してください。"
    );
  }
  if (typeof config.random !== "function") {
    throw new Error("randomには0以上1未満を返す関数が必要です。");
  }
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

export const createV2BitSystem = (
  scene: Scene,
  spatial: StageSpatialContext,
  config: V2BitSystemConfig
): V2BitSystem => {
  assertConfig(config);

  const nextRandom = () => {
    const value = config.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`randomは0以上1未満の有限値を返す必要があります: ${value}`);
    }
    return value;
  };
  const randomRange = (minimum: number, maximum: number) =>
    minimum + nextRandom() * (maximum - minimum);

  const resolveGroundY = (navigationPosition: Vector3) => {
    const probeOrigin = navigationPosition.add(
      new Vector3(0, GROUND_PROBE_UPWARD_OFFSET, 0)
    );
    const ground = spatial.queries.sampleGround(
      probeOrigin,
      GROUND_PROBE_DISTANCE
    );
    if (!ground) {
      throw new Error(
        `ビットのNavMesh位置に物理床がありません: (${navigationPosition.x}, ${navigationPosition.y}, ${navigationPosition.z})`
      );
    }
    return ground.point.y;
  };

  const buildFlightPosition = (
    navigationPosition: Vector3,
    flightHeight: number,
    groundOffsetY: number
  ) =>
    new Vector3(
      navigationPosition.x,
      navigationPosition.y + groundOffsetY + flightHeight,
      navigationPosition.z
    );

  const resolveGroundOffsetY = (navigationPosition: Vector3) =>
    resolveGroundY(navigationPosition) - navigationPosition.y;

  const projectCarpetPosition = (
    origin: NavigationLocation,
    desiredPosition: Vector3
  ) => {
    const projected = spatial.navigation.constrainMovement(
      origin,
      desiredPosition
    );
    if (
      !projected ||
      Vector3.Distance(projected.position, desiredPosition) >
        CARPET_PROJECTION_TOLERANCE
    ) {
      return null;
    }
    return projected;
  };

  const spawnSampler = createStageBoundarySpawnSampler(
    spatial.boundary,
    spatial.navigation,
    {
      maxAttempts: config.spawnMaxAttempts,
      projectionMaxDistance: config.spawnProjectionMaxDistance,
      random: nextRandom
    },
    (point) =>
      spatial.queries.containsVolume("no_enemy_spawn", point) ||
      spatial.queries.containsVolume("no_enemy_enter", point) ||
      spatial.queries.containsVolume("hazard", point) ||
      spatial.queries.containsVolume("water", point)
  );
  const materials = createSharedMaterials(scene);
  const bits: RuntimeBit[] = [];
  const activeAlerts = new Map<string, ActiveAlert>();
  let frameBeamRequests: readonly V2BeamRequest[] = Object.freeze([]);
  let pendingAlertRequests: V2AlertRequest[] = [];
  let nextBitIndex = 0;

  const createRuntimeBit = (
    navigationLocation: NavigationLocation,
    flightHeight: number,
    mode: V2BitMode = "search"
  ) => {
    assertFiniteVector("ビットのNavMesh位置", navigationLocation.position);
    const id = `v2_bit_${nextBitIndex}`;
    nextBitIndex += 1;
    const visual = createBitVisual(scene, materials, id);
    let navigationAgent: NavigationAgent | null = null;
    try {
      const initialAngle = nextRandom() * Math.PI * 2;
      const initialDirection = new Vector3(
        Math.cos(initialAngle),
        0,
        Math.sin(initialAngle)
      );
      navigationAgent = createNavigationAgent(
        spatial.navigation,
        "bit",
        NAVIGATION_AGENT_CONFIG
      );
      const bit: RuntimeBit = {
        id,
        ...visual,
        navigationAgent,
        navigationLocation,
        groundOffsetY: resolveGroundOffsetY(navigationLocation.position),
        flightHeight,
        bobPhase: nextRandom() * Math.PI * 2,
        mode,
        targetId: null,
        targetProvenance: null,
        alertLeaderId: null,
        wanderTarget: null,
        wanderRetrySeconds: 0,
        fireSeconds: randomRange(FIRE_INTERVAL_MIN, FIRE_INTERVAL_MAX),
        carpetLeaderId: null,
        carpetOffset: 0
      };
      bit.root.position.copyFrom(
        buildFlightPosition(
          navigationLocation.position,
          flightHeight,
          bit.groundOffsetY
        )
      );
      bit.root.lookAt(bit.root.position.add(initialDirection));
      bits.push(bit);
      return bit;
    } catch (error) {
      navigationAgent?.clear();
      visual.root.dispose(false);
      throw error;
    }
  };

  try {
    const spawnPoints =
      config.initialBitCount === 0
        ? []
        : spawnSampler.samplePoints(
            config.initialBitCount,
            config.minimumSpawnDistance
          );
    for (const point of spawnPoints) {
      createRuntimeBit(
        point,
        randomRange(config.minimumFlightHeight, config.maximumFlightHeight)
      );
    }
  } catch (error) {
    for (let index = bits.length - 1; index >= 0; index -= 1) {
      bits[index].navigationAgent.clear();
      bits[index].root.dispose(false);
    }
    bits.length = 0;
    materials.muzzle.dispose();
    materials.body.dispose();
    throw error;
  }

  const isTargetable = (target: V2HumanTargetSnapshot) =>
    target.alive && !target.brainwashed;

  const findTargetable = (
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    targetId: string | null
  ) => {
    if (targetId === null) {
      return null;
    }
    const target = targetsById.get(targetId);
    return target && isTargetable(target) ? target : null;
  };

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

  const canRetainVisualTarget = (
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
      if (!isTargetable(target)) {
        continue;
      }
      const toTarget = target.aimPosition.subtract(bit.root.position);
      const distanceSquared = toTarget.lengthSquared();
      if (
        distanceSquared > VISION_RANGE * VISION_RANGE ||
        distanceSquared >= closestDistanceSquared
      ) {
        continue;
      }
      if (!isInsideVision(bit, target)) {
        continue;
      }
      if (!isSightClear(bit.root.position, target.aimPosition)) {
        continue;
      }
      closest = target;
      closestDistanceSquared = distanceSquared;
    }
    return closest;
  };

  const clearTarget = (bit: RuntimeBit) => {
    if (bit.mode === "carpet-leader") {
      removeCarpetFollowers(bit);
    }
    bit.targetId = null;
    bit.targetProvenance = null;
    bit.alertLeaderId = null;
    bit.mode = "search";
    bit.navigationAgent.clear();
    bit.wanderTarget = null;
  };

  const setVisualTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot
  ) => {
    bit.targetId = target.id;
    bit.targetProvenance = "visual";
    bit.alertLeaderId = null;
    bit.mode = nextRandom() < CARPET_MODE_CHANCE ? "carpet-leader" : "chase";
    bit.navigationAgent.clear();
    bit.wanderTarget = null;
    pendingAlertRequests.push(
      Object.freeze({ leaderId: bit.id, targetId: target.id })
    );
  };

  const setAlertTarget = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    leaderId: string
  ) => {
    bit.targetId = target.id;
    bit.targetProvenance = "alert";
    bit.alertLeaderId = leaderId;
    bit.mode =
      nextRandom() < ALERT_CARPET_MODE_CHANCE ? "carpet-leader" : "chase";
    bit.navigationAgent.clear();
    bit.wanderTarget = null;
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
      const target = findTargetable(targetsById, alert.targetId);
      if (!target) {
        continue;
      }
      const distanceSquared = Vector3.DistanceSquared(
        bit.navigationLocation.position,
        target.footPosition
      );
      if (distanceSquared < closestDistanceSquared) {
        closest = Object.freeze({ target, leaderId: alert.leaderId });
        closestDistanceSquared = distanceSquared;
      }
    }
    return closest;
  };

  const syncRootPosition = (bit: RuntimeBit, elapsedSeconds: number) => {
    const bob = Math.sin(elapsedSeconds * 0.9 + bit.bobPhase) * BOB_AMPLITUDE;
    bit.root.position.copyFrom(
      buildFlightPosition(
        bit.navigationLocation.position,
        bit.flightHeight + bob,
        bit.groundOffsetY
      )
    );
  };

  const applyNavigationMovement = (
    bit: RuntimeBit,
    nextLocation: NavigationLocation,
    elapsedSeconds: number
  ) => {
    const bob = Math.sin(elapsedSeconds * 0.9 + bit.bobPhase) * BOB_AMPLITUDE;
    const nextGroundOffsetY =
      nextLocation.polygonRef === bit.navigationLocation.polygonRef
        ? bit.groundOffsetY
        : resolveGroundOffsetY(nextLocation.position);
    const nextRootPosition = buildFlightPosition(
      nextLocation.position,
      bit.flightHeight + bob,
      nextGroundOffsetY
    );
    if (
      spatial.queries.castMovementSegment(
        "bit",
        bit.root.position,
        nextRootPosition
      ) !== null
    ) {
      bit.navigationAgent.clear();
      return false;
    }
    bit.navigationLocation = nextLocation;
    bit.groundOffsetY = nextGroundOffsetY;
    bit.root.position.copyFrom(nextRootPosition);
    return true;
  };

  const pointBitAt = (bit: RuntimeBit, aimPosition: Vector3) => {
    const direction = aimPosition.subtract(bit.root.position);
    if (direction.lengthSquared() > 0) {
      bit.root.lookAt(aimPosition);
    }
  };

  const updateSearch = (
    bit: RuntimeBit,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    bit.mode = "search";
    bit.wanderRetrySeconds = Math.max(
      0,
      bit.wanderRetrySeconds - deltaSeconds
    );
    if (!bit.wanderTarget && bit.wanderRetrySeconds === 0) {
      bit.wanderTarget = spatial.navigation.randomPointAround(
        bit.navigationLocation,
        SEARCH_RADIUS
      );
      if (!bit.wanderTarget) {
        bit.wanderRetrySeconds = SEARCH_RETRY_SECONDS;
      }
    }
    if (!bit.wanderTarget) {
      syncRootPosition(bit, elapsedSeconds);
      return;
    }

    const previous = bit.navigationLocation.position.clone();
    const step = bit.navigationAgent.update(
      bit.navigationLocation,
      bit.wanderTarget.position,
      SEARCH_SPEED,
      deltaSeconds
    );
    const moved = applyNavigationMovement(bit, step.location, elapsedSeconds);
    const movement = bit.navigationLocation.position.subtract(previous);
    if (movement.lengthSquared() > 0) {
      bit.root.lookAt(bit.root.position.add(normalizeHorizontal(movement)));
    }
    if (!moved || step.state !== "moving") {
      bit.wanderTarget = null;
      bit.navigationAgent.clear();
      bit.wanderRetrySeconds = SEARCH_RETRY_SECONDS;
    }
  };

  const updateChase = (
    bit: RuntimeBit,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    bit.mode = "chase";
    const step = bit.navigationAgent.update(
      bit.navigationLocation,
      target.footPosition,
      CHASE_SPEED,
      deltaSeconds
    );
    applyNavigationMovement(bit, step.location, elapsedSeconds);
    pointBitAt(bit, target.aimPosition);
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
      candidate.root.dispose(false);
      bits.splice(index, 1);
    }
  };

  const convertCarpetToChase = (leader: RuntimeBit) => {
    removeCarpetFollowers(leader);
    leader.mode = "chase";
    leader.carpetLeaderId = null;
    leader.carpetOffset = 0;
    leader.navigationAgent.clear();
  };

  const tryCreateCarpetFollowers = (
    leader: RuntimeBit,
    target: V2HumanTargetSnapshot,
    elapsedSeconds: number
  ) => {
    const direction = normalizeHorizontal(
      target.footPosition.subtract(leader.navigationLocation.position)
    );
    const right = new Vector3(-direction.z, 0, direction.x);
    const offsets = [
      -CARPET_FORMATION_SPACING,
      CARPET_FORMATION_SPACING
    ] as const;
    const followerLocations: NavigationLocation[] = [];
    for (const offset of offsets) {
      const desiredPosition = leader.navigationLocation.position.add(
        right.scale(offset)
      );
      const projectedPosition = projectCarpetPosition(
        leader.navigationLocation,
        desiredPosition
      );
      if (!projectedPosition) {
        leader.mode = "chase";
        return false;
      }
      followerLocations.push(projectedPosition);
    }
    const proposedRoots = followerLocations.map((location) =>
      buildFlightPosition(
        location.position,
        leader.flightHeight,
        resolveGroundOffsetY(location.position)
      )
    );
    if (
      proposedRoots.some(
        (position) =>
          spatial.queries.castMovementSegment(
            "bit",
            leader.root.position,
            position
          ) !== null
      )
    ) {
      leader.mode = "chase";
      return false;
    }

    for (let index = 0; index < offsets.length; index += 1) {
      const offset = offsets[index];
      const follower = createRuntimeBit(
        followerLocations[index],
        leader.flightHeight,
        "carpet-follower"
      );
      follower.targetId = leader.targetId;
      follower.targetProvenance = leader.targetProvenance;
      follower.alertLeaderId = leader.alertLeaderId;
      follower.carpetLeaderId = leader.id;
      follower.carpetOffset = offset;
      syncRootPosition(follower, elapsedSeconds);
      pointBitAt(follower, target.aimPosition);
    }
    leader.carpetLeaderId = leader.id;
    return true;
  };

  const updateCarpet = (
    leader: RuntimeBit,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    elapsedSeconds: number
  ) => {
    if (leader.carpetLeaderId === null) {
      if (!tryCreateCarpetFollowers(leader, target, elapsedSeconds)) {
        updateChase(leader, target, deltaSeconds, elapsedSeconds);
        return;
      }
    }

    const direction = normalizeHorizontal(
      target.footPosition.subtract(leader.navigationLocation.position)
    );
    const distance = Vector3.Distance(
      new Vector3(
        leader.navigationLocation.position.x,
        target.footPosition.y,
        leader.navigationLocation.position.z
      ),
      target.footPosition
    );
    const stepDistance = Math.min(CARPET_SPEED * deltaSeconds, distance);
    const proposedNavigationPosition = leader.navigationLocation.position.add(
      direction.scale(stepDistance)
    );
    const projectedNavigationPosition = projectCarpetPosition(
      leader.navigationLocation,
      proposedNavigationPosition
    );
    if (!projectedNavigationPosition) {
      convertCarpetToChase(leader);
      updateChase(leader, target, deltaSeconds, elapsedSeconds);
      return;
    }
    const right = new Vector3(-direction.z, 0, direction.x);
    const followers = bits.filter(
      (candidate) =>
        candidate.mode === "carpet-follower" &&
        candidate.carpetLeaderId === leader.id
    );
    const leaderGroundOffsetY =
      projectedNavigationPosition.polygonRef ===
      leader.navigationLocation.polygonRef
        ? leader.groundOffsetY
        : resolveGroundOffsetY(projectedNavigationPosition.position);
    const proposedRoot = buildFlightPosition(
      projectedNavigationPosition.position,
      leader.flightHeight,
      leaderGroundOffsetY
    );
    const followerNavigationDestinations: NavigationLocation[] = [];
    const followerRootDestinations: Vector3[] = [];
    const followerGroundOffsetsY: number[] = [];
    for (const follower of followers) {
      const desiredPosition = projectedNavigationPosition.position.add(
        right.scale(follower.carpetOffset)
      );
      const projectedPosition = projectCarpetPosition(
        follower.navigationLocation,
        desiredPosition
      );
      if (!projectedPosition) {
        convertCarpetToChase(leader);
        updateChase(leader, target, deltaSeconds, elapsedSeconds);
        return;
      }
      followerNavigationDestinations.push(projectedPosition);
      const followerGroundOffsetY =
        projectedPosition.polygonRef === follower.navigationLocation.polygonRef
          ? follower.groundOffsetY
          : resolveGroundOffsetY(projectedPosition.position);
      followerGroundOffsetsY.push(followerGroundOffsetY);
      followerRootDestinations.push(
        buildFlightPosition(
          projectedPosition.position,
          follower.flightHeight,
          followerGroundOffsetY
        )
      );
    }
    const leaderBlocked =
      spatial.queries.castMovementSegment(
        "bit",
        leader.root.position,
        proposedRoot
      ) !== null;
    const followerBlocked = followers.some(
      (follower, index) =>
        spatial.queries.castMovementSegment(
          "bit",
          follower.root.position,
          followerRootDestinations[index]
        ) !== null
    );
    if (leaderBlocked || followerBlocked) {
      convertCarpetToChase(leader);
      updateChase(leader, target, deltaSeconds, elapsedSeconds);
      return;
    }

    leader.navigationLocation = projectedNavigationPosition;
    leader.groundOffsetY = leaderGroundOffsetY;
    syncRootPosition(leader, elapsedSeconds);
    pointBitAt(leader, target.aimPosition);
    for (let index = 0; index < followers.length; index += 1) {
      const follower = followers[index];
      follower.navigationLocation = followerNavigationDestinations[index];
      follower.groundOffsetY = followerGroundOffsetsY[index];
      syncRootPosition(follower, elapsedSeconds);
      pointBitAt(follower, target.aimPosition);
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
        if (!findTargetable(targetsById, alert.targetId)) {
          activeAlerts.delete(alertKey);
        }
      }

      const beamRequests: V2BeamRequest[] = [];
      pendingAlertRequests = [];
      for (const bit of [...bits]) {
        if (bit.mode === "carpet-follower") {
          continue;
        }

        let target = findTargetable(targetsById, bit.targetId);
        if (
          target &&
          bit.targetProvenance === "visual" &&
          !canRetainVisualTarget(bit, target)
        ) {
          clearTarget(bit);
          target = null;
        } else if (
          target &&
          bit.targetProvenance === "alert" &&
          (bit.alertLeaderId === null ||
            !activeAlerts.has(buildAlertKey(bit.alertLeaderId, target.id)))
        ) {
          clearTarget(bit);
          target = null;
        } else if (!target && bit.targetId !== null) {
          clearTarget(bit);
        }

        if (!target) {
          const visibleTarget = findVisibleTarget(
            bit,
            targetSpatialIndex.query(bit.root.position, VISION_RANGE)
          );
          if (visibleTarget) {
            setVisualTarget(bit, visibleTarget);
            target = visibleTarget;
          } else {
            const alertTarget = selectAlertTarget(bit, targetsById);
            if (alertTarget) {
              setAlertTarget(
                bit,
                alertTarget.target,
                alertTarget.leaderId
              );
              target = alertTarget.target;
            }
          }
        }

        if (!target) {
          if (bit.mode === "carpet-leader") {
            convertCarpetToChase(bit);
          }
          updateSearch(bit, deltaSeconds, elapsedSeconds);
          continue;
        }

        if (bit.mode === "carpet-leader") {
          updateCarpet(bit, target, deltaSeconds, elapsedSeconds);
        } else {
          updateChase(bit, target, deltaSeconds, elapsedSeconds);
        }
        emitBeamWhenReady(bit, target, deltaSeconds, beamRequests);
        if (bit.mode === "carpet-leader") {
          for (const follower of bits) {
            if (
              follower.mode === "carpet-follower" &&
              follower.carpetLeaderId === bit.id
            ) {
              emitBeamWhenReady(
                follower,
                target,
                deltaSeconds,
                beamRequests
              );
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
    dispose: () => {
      for (const bit of bits) {
        bit.root.dispose(false);
      }
      bits.length = 0;
      activeAlerts.clear();
      frameBeamRequests = Object.freeze([]);
      pendingAlertRequests = [];
      materials.body.dispose();
      materials.muzzle.dispose();
    }
  };
};
