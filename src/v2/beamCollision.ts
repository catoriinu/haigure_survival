import {
  Color3,
  Color4,
  InstancedMesh,
  Material,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import type { StageSpatialContext } from "../world/stageSpatialContext";
import type { SpatialHit } from "../world/stageSpatialQueries";
import type {
  V2BeamOriginKind,
  V2BeamRequest,
  V2BeamTargetPolicy,
  V2HumanTargetSnapshot
} from "./combatTypes";
import {
  V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR,
  V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH
} from "./v2TransparentRenderingOrder";

export const V2_NORMAL_BEAM_MAX_BODY_LENGTH = 0.75;
export const V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS = 0.2;
export const V2_NORMAL_BEAM_BODY_DIAMETER = 0.018;
export const V2_NORMAL_BEAM_FRONT_DIAMETER = 0.0144;
export const V2_NORMAL_BEAM_BACK_DIAMETER = 0.054;
export const V2_NORMAL_BEAM_TIP_DIAMETER = 0.075;
export const V2_NORMAL_BEAM_TRAIL_LIFETIME_SECONDS = 0.3;
export const V2_NORMAL_BEAM_BLOCKER_IMPACT_LIFETIME_SECONDS = 1.6;
export const V2_BEAM_VISUAL_POOL_KINDS = [
  "body",
  "tip",
  "trail",
  "blocker-impact"
] as const;

const SEGMENT_LENGTH_EPSILON = 1e-8;
const HIT_DISTANCE_EPSILON = 1e-6;
const HUMAN_TARGET_SPATIAL_CELL_SIZE = 1;
const BEAM_TRAIL_DIAMETER_MIN = 0.01;
const BEAM_TRAIL_DIAMETER_MAX = 0.05;
const BEAM_TRAIL_INTERVAL_MIN_SECONDS = 0.025;
const BEAM_TRAIL_INTERVAL_MAX_SECONDS = 0.085;
const BEAM_TRAIL_DRAG = 8.5;
const BEAM_TRAIL_MIN_SCALE = 0.08;
const BEAM_TRAIL_FADE_IN_DURATION_SECONDS = 0.05;
const BEAM_BLOCKER_IMPACT_COUNT_MIN = 2;
const BEAM_BLOCKER_IMPACT_COUNT_MAX = 5;
const BEAM_BLOCKER_IMPACT_DIAMETER = 0.02;
const BEAM_BLOCKER_IMPACT_MIN_SCALE = 0.08;
const BEAM_BLOCKER_IMPACT_SPEED_MIN = 0.03;
const BEAM_BLOCKER_IMPACT_SPEED_MAX = 0.075;
const BEAM_BLOCKER_IMPACT_BOUNCE_JITTER = 1.35;
const BEAM_BLOCKER_IMPACT_BOUNCE_LIFT = 0.7;
const BEAM_EFFECT_COLOR = new Color3(1, 0.18, 0.74);
const BEAM_EFFECT_ALPHA = 0.55;
const BEAM_ORIGIN_KINDS: readonly V2BeamOriginKind[] = Object.freeze([
  "bit-chase",
  "bit-fixed",
  "bit-random",
  "bit-carpet",
  "npc-gun",
  "player-gun",
  "execution-bit",
  "execution-npc",
  "execution-player"
]);

export type V2BeamBlockerHit = Readonly<{
  kind: "blocker";
  point: Vector3;
  normal: Vector3;
  distance: number;
  mesh: Mesh;
  startedInside: boolean;
}>;

export type V2BeamActorHit = Readonly<{
  kind: "actor";
  point: Vector3;
  normal: Vector3;
  distance: number;
  actor: V2HumanTargetSnapshot;
}>;

export type V2BeamSegmentHit = V2BeamBlockerHit | V2BeamActorHit;

export type V2SightSegmentResult =
  | Readonly<{
      occluded: false;
      point: null;
      normal: null;
      distance: null;
      mesh: null;
      startedInside: false;
    }>
  | Readonly<{
      occluded: true;
      point: Vector3;
      normal: Vector3;
      distance: number;
      mesh: Mesh;
      startedInside: boolean;
    }>;

export type V2BeamCollisionDiagnostics = Readonly<{
  recordStartContainment(
    candidateMeshCount: number,
    triangulatedMeshCount: number
  ): void;
}>;

export type V2BeamVisualPoolKind =
  (typeof V2_BEAM_VISUAL_POOL_KINDS)[number];

export type V2BeamVisualPoolKindSnapshot = Readonly<{
  capacity: number;
  inUse: number;
  available: number;
}>;

export type V2BeamVisualPoolSnapshot = Readonly<
  Record<V2BeamVisualPoolKind, V2BeamVisualPoolKindSnapshot>
>;

export type V2BeamSystemConfig = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  getHumanTargets(): readonly V2HumanTargetSnapshot[];
  random(): number;
  getOrbVisibilityPredicate(): (position: Vector3) => boolean;
  collisionDiagnostics?: V2BeamCollisionDiagnostics;
}>;

export type V2BeamImpactEvent = Readonly<{
  beamId: string;
  sourceId: string;
  originKind: V2BeamOriginKind;
  targetPolicy: V2BeamTargetPolicy;
  hit: V2BeamSegmentHit;
}>;

export type V2BeamExpirationEvent = Readonly<{
  beamId: string;
  sourceId: string;
  originKind: V2BeamOriginKind;
  targetPolicy: V2BeamTargetPolicy;
  position: Vector3;
}>;

export type V2BeamWorldBoundaryExitEvent = Readonly<{
  beamId: string;
  sourceId: string;
  originKind: V2BeamOriginKind;
  targetPolicy: V2BeamTargetPolicy;
  position: Vector3;
}>;

export type V2BeamCompletionEvent = Readonly<{
  beamId: string;
  sourceId: string;
  originKind: V2BeamOriginKind;
  targetPolicy: V2BeamTargetPolicy;
  frameElapsedSeconds: number;
}>;

export type V2BeamFrameEvents = Readonly<{
  impacts: readonly V2BeamImpactEvent[];
  expirations: readonly V2BeamExpirationEvent[];
  worldBoundaryExits: readonly V2BeamWorldBoundaryExitEvent[];
  completions: readonly V2BeamCompletionEvent[];
}>;

export type V2BeamPhase =
  | "advancing"
  | "retracting"
  | "world-boundary-fading";

export type V2ActiveBeamSnapshot = Readonly<{
  id: string;
  sourceId: string;
  originKind: V2BeamOriginKind;
  targetPolicy: V2BeamTargetPolicy;
  phase: V2BeamPhase;
  position: Vector3;
  tailPosition: Vector3;
  velocity: Vector3;
  bodyLength: number;
  remainingLifetime: number;
}>;

export interface V2BeamSystem {
  readonly activeCount: number;
  prepareVisualResources(): Promise<void>;
  spawn(request: V2BeamRequest): string;
  update(deltaSeconds: number): V2BeamFrameEvents;
  getActiveBeams(): readonly V2ActiveBeamSnapshot[];
  getVisualPoolSnapshot(): V2BeamVisualPoolSnapshot;
  clear(): void;
  dispose(): void;
}

type ActiveBeam = {
  id: string;
  sourceId: string;
  originKind: V2BeamOriginKind;
  targetPolicy: V2BeamTargetPolicy;
  phase: V2BeamPhase;
  position: Vector3;
  direction: Vector3;
  speed: number;
  remainingLifetime: number;
  bodyLength: number;
  retractLeadRemaining: number;
  boundaryFadeRemainingSeconds: number;
  trailTimer: number;
  checkStartContainment: boolean;
  bodyMesh: InstancedMesh;
  tipMesh: InstancedMesh;
};

type TrailVisual = {
  ownerBeamId: string;
  mesh: InstancedMesh;
  velocity: Vector3;
  remainingSeconds: number;
  ageSeconds: number;
  diameter: number;
  boundaryFadeRemainingSeconds: number | null;
  boundaryFadeStartAlpha: number | null;
  boundaryFadeStartScale: number | null;
};

type BlockerImpactVisual = {
  mesh: InstancedMesh;
  velocity: Vector3;
  remainingSeconds: number;
};

const assertFiniteNumber = (label: string, value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}は有限値である必要があります: ${value}`);
  }
};

const assertFiniteVector = (label: string, value: Vector3): void => {
  assertFiniteNumber(`${label}.x`, value.x);
  assertFiniteNumber(`${label}.y`, value.y);
  assertFiniteNumber(`${label}.z`, value.z);
};

const assertPositiveNumber = (label: string, value: number): void => {
  assertFiniteNumber(label, value);
  if (value <= 0) {
    throw new Error(`${label}は0より大きい必要があります: ${value}`);
  }
};

const requireNonEmptyId = (label: string, value: string): void => {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${label}には前後空白のない非空IDが必要です`);
  }
};

const cloneHumanTarget = (
  target: V2HumanTargetSnapshot
): V2HumanTargetSnapshot =>
  Object.freeze({
    id: target.id,
    kind: target.kind,
    footPosition: target.footPosition.clone(),
    aimPosition: target.aimPosition.clone(),
    hitShape: Object.freeze({
      center: target.hitShape.center.clone(),
      radii: target.hitShape.radii.clone()
    }),
    state: target.state,
    alive: target.alive,
    brainwashed: target.brainwashed
  });

const validateHumanTarget = (target: V2HumanTargetSnapshot): void => {
  requireNonEmptyId("beam target.id", target.id);
  if (target.kind !== "player" && target.kind !== "npc") {
    throw new Error(`ビーム標的kindはplayerまたはnpcに限ります: ${target.id}`);
  }
  assertFiniteVector(`beam target(${target.id}).footPosition`, target.footPosition);
  assertFiniteVector(`beam target(${target.id}).aimPosition`, target.aimPosition);
  assertFiniteVector(
    `beam target(${target.id}).hitShape.center`,
    target.hitShape.center
  );
  assertPositiveNumber(
    `beam target(${target.id}).hitShape.radii.x`,
    target.hitShape.radii.x
  );
  assertPositiveNumber(
    `beam target(${target.id}).hitShape.radii.y`,
    target.hitShape.radii.y
  );
  assertPositiveNumber(
    `beam target(${target.id}).hitShape.radii.z`,
    target.hitShape.radii.z
  );
  if (typeof target.alive !== "boolean") {
    throw new Error(`beam target(${target.id}).aliveにはbooleanが必要です`);
  }
  if (typeof target.brainwashed !== "boolean") {
    throw new Error(
      `beam target(${target.id}).brainwashedにはbooleanが必要です`
    );
  }
};

const validateHumanTargetIds = (
  targets: readonly V2HumanTargetSnapshot[]
): void => {
  const targetIds = new Set<string>();
  for (const target of targets) {
    validateHumanTarget(target);
    if (targetIds.has(target.id)) {
      throw new Error(`ビーム衝突標的IDが重複しています: ${target.id}`);
    }
    targetIds.add(target.id);
  }
};

const cloneTargetPolicy = (
  targetPolicy: V2BeamTargetPolicy
): V2BeamTargetPolicy => {
  if (targetPolicy.kind === "alive-humans") {
    return Object.freeze({ kind: "alive-humans" });
  }
  if (
    targetPolicy.kind !== "execution-assigned" &&
    targetPolicy.kind !== "execution-manual"
  ) {
    throw new Error(
      `未登録のビームtargetPolicyです: ${String(
        (targetPolicy as { kind: unknown }).kind
      )}`
    );
  }

  const targetIds = new Set<string>();
  for (const targetId of targetPolicy.targetIds) {
    requireNonEmptyId("beam.targetPolicy.targetIds[]", targetId);
    if (targetIds.has(targetId)) {
      throw new Error(
        `beam.targetPolicy.targetIdsが重複しています: ${targetId}`
      );
    }
    targetIds.add(targetId);
  }
  return Object.freeze({
    kind: targetPolicy.kind,
    targetIds: Object.freeze([...targetPolicy.targetIds])
  });
};

const assertBeamOriginKind = (originKind: V2BeamOriginKind): void => {
  if (!BEAM_ORIGIN_KINDS.includes(originKind)) {
    throw new Error(`未登録のビームoriginKindです: ${String(originKind)}`);
  }
};

const getStartHitNormal = (from: Vector3, to: Vector3): Vector3 => {
  const reverseDirection = from.subtract(to);
  if (reverseDirection.lengthSquared() <= SEGMENT_LENGTH_EPSILON ** 2) {
    return Vector3.Up();
  }
  return reverseDirection.normalize();
};

const toBlockerHit = (
  hit: SpatialHit,
  startedInside: boolean
): V2BeamBlockerHit =>
  Object.freeze({
    kind: "blocker",
    point: hit.point.clone(),
    normal: hit.normal.clone(),
    distance: hit.distance,
    mesh: hit.mesh,
    startedInside
  });

const createStartBlockerHit = (
  mesh: Mesh,
  from: Vector3,
  to: Vector3
): V2BeamBlockerHit =>
  Object.freeze({
    kind: "blocker",
    point: from.clone(),
    normal: getStartHitNormal(from, to),
    distance: 0,
    mesh,
    startedInside: true
  });

const castHumanEllipsoidSegment = (
  from: Vector3,
  to: Vector3,
  target: V2HumanTargetSnapshot
): V2BeamActorHit | null => {
  const { center, radii } = target.hitShape;
  const scaledStart = new Vector3(
    (from.x - center.x) / radii.x,
    (from.y - center.y) / radii.y,
    (from.z - center.z) / radii.z
  );
  const scaledDelta = new Vector3(
    (to.x - from.x) / radii.x,
    (to.y - from.y) / radii.y,
    (to.z - from.z) / radii.z
  );
  const quadratic = scaledDelta.lengthSquared();
  const linear = 2 * Vector3.Dot(scaledStart, scaledDelta);
  const constant = scaledStart.lengthSquared() - 1;
  let fraction: number;

  if (constant <= SEGMENT_LENGTH_EPSILON) {
    fraction = 0;
  } else if (quadratic <= SEGMENT_LENGTH_EPSILON ** 2) {
    return null;
  } else {
    const discriminant = linear * linear - 4 * quadratic * constant;
    if (discriminant < -SEGMENT_LENGTH_EPSILON) {
      return null;
    }
    const root = Math.sqrt(Math.max(0, discriminant));
    const first = (-linear - root) / (2 * quadratic);
    const second = (-linear + root) / (2 * quadratic);
    const intersections = [first, second].filter(
      (candidate) =>
        candidate >= -SEGMENT_LENGTH_EPSILON &&
        candidate <= 1 + SEGMENT_LENGTH_EPSILON
    );
    if (intersections.length === 0) {
      return null;
    }
    fraction = Math.min(...intersections);
    fraction = Math.min(1, Math.max(0, fraction));
  }

  const delta = to.subtract(from);
  const point = from.add(delta.scale(fraction));
  const relative = point.subtract(center);
  const gradient = new Vector3(
    relative.x / (radii.x * radii.x),
    relative.y / (radii.y * radii.y),
    relative.z / (radii.z * radii.z)
  );
  const normal =
    gradient.lengthSquared() <= SEGMENT_LENGTH_EPSILON ** 2
      ? getStartHitNormal(from, to)
      : gradient.normalize();
  return Object.freeze({
    kind: "actor",
    point,
    normal,
    distance: delta.length() * fraction,
    actor: cloneHumanTarget(target)
  });
};

const isTargetAllowedByPolicy = (
  target: V2HumanTargetSnapshot,
  sourceId: string,
  targetPolicy: V2BeamTargetPolicy
): boolean => {
  if (!target.alive || target.id === sourceId) {
    return false;
  }
  if (targetPolicy.kind === "alive-humans") {
    return true;
  }
  return targetPolicy.targetIds.includes(target.id);
};

type HumanTargetSpatialIndex = Readonly<{
  query(
    from: Vector3,
    to: Vector3
  ): readonly V2HumanTargetSnapshot[];
}>;

const humanTargetCellKey = (x: number, y: number, z: number) =>
  `${x}:${y}:${z}`;

const createHumanTargetSpatialIndex = (
  targets: readonly V2HumanTargetSnapshot[]
): HumanTargetSpatialIndex => {
  const cells = new Map<string, number[]>();
  let maximumRadius = 0;
  targets.forEach((target, index) => {
    maximumRadius = Math.max(
      maximumRadius,
      target.hitShape.radii.x,
      target.hitShape.radii.y,
      target.hitShape.radii.z
    );
    const center = target.hitShape.center;
    const cellX = Math.floor(center.x / HUMAN_TARGET_SPATIAL_CELL_SIZE);
    const cellY = Math.floor(center.y / HUMAN_TARGET_SPATIAL_CELL_SIZE);
    const cellZ = Math.floor(center.z / HUMAN_TARGET_SPATIAL_CELL_SIZE);
    const key = humanTargetCellKey(cellX, cellY, cellZ);
    const indices = cells.get(key);
    if (indices) {
      indices.push(index);
    } else {
      cells.set(key, [index]);
    }
  });

  return Object.freeze({
    query: (from, to) => {
      const minimumCellX = Math.floor(
        (Math.min(from.x, to.x) - maximumRadius) /
          HUMAN_TARGET_SPATIAL_CELL_SIZE
      );
      const maximumCellX = Math.floor(
        (Math.max(from.x, to.x) + maximumRadius) /
          HUMAN_TARGET_SPATIAL_CELL_SIZE
      );
      const minimumCellY = Math.floor(
        (Math.min(from.y, to.y) - maximumRadius) /
          HUMAN_TARGET_SPATIAL_CELL_SIZE
      );
      const maximumCellY = Math.floor(
        (Math.max(from.y, to.y) + maximumRadius) /
          HUMAN_TARGET_SPATIAL_CELL_SIZE
      );
      const minimumCellZ = Math.floor(
        (Math.min(from.z, to.z) - maximumRadius) /
          HUMAN_TARGET_SPATIAL_CELL_SIZE
      );
      const maximumCellZ = Math.floor(
        (Math.max(from.z, to.z) + maximumRadius) /
          HUMAN_TARGET_SPATIAL_CELL_SIZE
      );
      const candidateIndices: number[] = [];
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
          for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
            const indices = cells.get(
              humanTargetCellKey(cellX, cellY, cellZ)
            );
            if (indices) {
              candidateIndices.push(...indices);
            }
          }
        }
      }
      candidateIndices.sort((left, right) => left - right);
      return Object.freeze(
        candidateIndices.map((index) => targets[index])
      );
    }
  });
};

const castValidatedV2BeamSegment = (
  stage: StageSpatialContext,
  from: Vector3,
  to: Vector3,
  targets: readonly V2HumanTargetSnapshot[],
  sourceId: string,
  targetPolicy: V2BeamTargetPolicy,
  checkStartContainment: boolean,
  diagnostics: V2BeamCollisionDiagnostics | undefined
): V2BeamSegmentHit | null => {
  const containingBlocker = checkStartContainment
    ? stage.queries.findContainingBlocker("beam", from)
    : null;
  if (checkStartContainment) {
    diagnostics?.recordStartContainment(
      containingBlocker === null ? 0 : 1,
      0
    );
  }
  let nearestHit: V2BeamSegmentHit | null = containingBlocker
    ? createStartBlockerHit(containingBlocker, from, to)
    : null;

  const segmentLength = Vector3.Distance(from, to);
  if (segmentLength > SEGMENT_LENGTH_EPSILON && !nearestHit) {
    const blockerHit = stage.queries.castBeamSegment(from, to);
    if (blockerHit) {
      nearestHit = toBlockerHit(blockerHit, false);
    }
  }

  for (const target of targets) {
    if (!isTargetAllowedByPolicy(target, sourceId, targetPolicy)) {
      continue;
    }
    const actorHit = castHumanEllipsoidSegment(from, to, target);
    if (
      actorHit &&
      (!nearestHit ||
        actorHit.distance < nearestHit.distance - HIT_DISTANCE_EPSILON)
    ) {
      nearestHit = actorHit;
    }
  }
  return nearestHit;
};

/**
 * 前フレーム位置から新位置までを連続判定し、最初の壁または生存中の人間だけを返す。
 * sourceId自身とtargetPolicy対象外を除き、同距離では壁を優先する。
 */
export const castV2BeamSegment = (
  stage: StageSpatialContext,
  from: Vector3,
  to: Vector3,
  targets: readonly V2HumanTargetSnapshot[],
  sourceId: string,
  targetPolicy: V2BeamTargetPolicy
): V2BeamSegmentHit | null => {
  assertFiniteVector("beam.from", from);
  assertFiniteVector("beam.to", to);
  requireNonEmptyId("beam.sourceId", sourceId);
  validateHumanTargetIds(targets);
  const validatedPolicy = cloneTargetPolicy(targetPolicy);
  return castValidatedV2BeamSegment(
    stage,
    from,
    to,
    targets,
    sourceId,
    validatedPolicy,
    true,
    undefined
  );
};

/**
 * 通常視線を`sightBlockers`だけで判定する。ActorOnly窓はこの集合に
 * 含まれないため、視線を遮らない。
 * ゼロ長は開始点が遮蔽物内の場合だけ遮蔽として扱う。
 */
export const castV2SightSegment = (
  stage: StageSpatialContext,
  from: Vector3,
  to: Vector3
): V2SightSegmentResult => {
  assertFiniteVector("sight.from", from);
  assertFiniteVector("sight.to", to);

  const containingBlocker = stage.queries.findContainingBlocker(
    "sight",
    from
  );
  if (containingBlocker) {
    return Object.freeze({
      occluded: true,
      point: from.clone(),
      normal: getStartHitNormal(from, to),
      distance: 0,
      mesh: containingBlocker,
      startedInside: true
    });
  }

  if (Vector3.DistanceSquared(from, to) <= SEGMENT_LENGTH_EPSILON ** 2) {
    return Object.freeze({
      occluded: false,
      point: null,
      normal: null,
      distance: null,
      mesh: null,
      startedInside: false
    });
  }

  const hit = stage.queries.castSightSegment(from, to);
  if (!hit) {
    return Object.freeze({
      occluded: false,
      point: null,
      normal: null,
      distance: null,
      mesh: null,
      startedInside: false
    });
  }
  return Object.freeze({
    occluded: true,
    point: hit.point.clone(),
    normal: hit.normal.clone(),
    distance: hit.distance,
    mesh: hit.mesh,
    startedInside: false
  });
};

const validateBeamRequest = (
  request: V2BeamRequest
): V2BeamTargetPolicy => {
  requireNonEmptyId("beam.sourceId", request.sourceId);
  assertBeamOriginKind(request.originKind);
  const targetPolicy = cloneTargetPolicy(request.targetPolicy);
  assertFiniteVector("beam.origin", request.origin);
  assertFiniteVector("beam.direction", request.direction);
  if (request.direction.lengthSquared() <= SEGMENT_LENGTH_EPSILON ** 2) {
    throw new Error("beam.directionはゼロベクトルにできません");
  }
  assertPositiveNumber("beam.speed", request.speed);
  assertPositiveNumber("beam.maximumLifetime", request.maximumLifetime);
  return targetPolicy;
};

const createBeamBodyRotation = (direction: Vector3): Quaternion => {
  const up = Vector3.Up();
  const dot = Math.min(1, Math.max(-1, Vector3.Dot(up, direction)));
  if (dot >= 1 - SEGMENT_LENGTH_EPSILON) {
    return Quaternion.Identity();
  }
  if (dot <= -1 + SEGMENT_LENGTH_EPSILON) {
    return Quaternion.RotationAxis(Vector3.Right(), Math.PI);
  }
  const axis = Vector3.Cross(up, direction).normalize();
  return Quaternion.RotationAxis(axis, Math.acos(dot));
};

class V2BeamDepthProxyMaterial extends StandardMaterial {
  protected override _hasAlphaChannel(): boolean {
    return true;
  }
}

type BeamVisualPoolPair = Readonly<{
  mesh: InstancedMesh;
  depthMesh: InstancedMesh;
}>;

type BeamVisualPoolBucket = {
  source: Mesh;
  depthSource: Mesh;
  available: BeamVisualPoolPair[];
  instances: Set<BeamVisualPoolPair>;
  inUse: Map<InstancedMesh, BeamVisualPoolPair>;
  nextSerial: number;
};

type BeamVisualPool = Readonly<{
  acquire(kind: V2BeamVisualPoolKind, ownerId: string): InstancedMesh;
  release(kind: V2BeamVisualPoolKind, mesh: InstancedMesh): void;
  setOpacity(
    kind: V2BeamVisualPoolKind,
    mesh: InstancedMesh,
    opacity: number
  ): void;
  prepare(): Promise<void>;
  getSnapshot(): V2BeamVisualPoolSnapshot;
  clear(): void;
  dispose(): void;
}>;

const createBeamVisualPool = (scene: Scene): BeamVisualPool => {
  const visualMaterial = new StandardMaterial(
    "v2NormalBeamMaterial",
    scene
  );
  visualMaterial.emissiveColor = BEAM_EFFECT_COLOR.clone();
  visualMaterial.diffuseColor = BEAM_EFFECT_COLOR.clone();
  visualMaterial.specularColor = Color3.Black();
  visualMaterial.alpha = BEAM_EFFECT_ALPHA;
  visualMaterial.backFaceCulling = false;
  visualMaterial.transparencyMode = Material.MATERIAL_ALPHABLEND;

  const depthMaterial = new V2BeamDepthProxyMaterial(
    "v2NormalBeamDepthMaterial",
    scene
  );
  depthMaterial.emissiveColor = BEAM_EFFECT_COLOR.clone();
  depthMaterial.diffuseColor = BEAM_EFFECT_COLOR.clone();
  depthMaterial.specularColor = Color3.Black();
  depthMaterial.alpha = BEAM_EFFECT_ALPHA;
  depthMaterial.backFaceCulling = false;
  depthMaterial.transparencyMode =
    Material.MATERIAL_ALPHATESTANDBLEND;
  depthMaterial.alphaCutOff = 0.1;
  depthMaterial.disableColorWrite = true;
  depthMaterial.forceDepthWrite = true;

  const bodySource = MeshBuilder.CreateCylinder(
    "v2NormalBeamPoolSource-body",
    {
      height: 1,
      diameterTop: V2_NORMAL_BEAM_FRONT_DIAMETER,
      diameterBottom: V2_NORMAL_BEAM_BACK_DIAMETER,
      tessellation: 12,
      sideOrientation: Mesh.DOUBLESIDE
    },
    scene
  );
  const bodyPositions = bodySource.getVerticesData(VertexBuffer.PositionKind)!;
  const bodyColors: number[] = [];
  for (let index = 0; index < bodyPositions.length; index += 3) {
    const y = bodyPositions[index + 1];
    const alpha = y >= -1 / 6 ? 1 : Math.max(0, (y + 0.5) * 3);
    bodyColors.push(1, 1, 1, alpha);
  }
  bodySource.setVerticesData(VertexBuffer.ColorKind, bodyColors, false, 4);
  bodySource.useVertexColors = true;
  bodySource.hasVertexAlpha = true;
  const tipSource = MeshBuilder.CreateSphere(
    "v2NormalBeamPoolSource-tip",
    {
      diameter: V2_NORMAL_BEAM_TIP_DIAMETER,
      segments: 12
    },
    scene
  );
  const trailSource = MeshBuilder.CreateSphere(
    "v2NormalBeamPoolSource-trail",
    {
      diameter: 1,
      segments: 10
    },
    scene
  );
  const blockerImpactSource = MeshBuilder.CreateSphere(
    "v2NormalBeamPoolSource-blocker-impact",
    {
      diameter: BEAM_BLOCKER_IMPACT_DIAMETER,
      segments: 10
    },
    scene
  );
  const sources: Readonly<Record<V2BeamVisualPoolKind, Mesh>> =
    Object.freeze({
      body: bodySource,
      tip: tipSource,
      trail: trailSource,
      "blocker-impact": blockerImpactSource
    });
  const buckets = {} as Record<V2BeamVisualPoolKind, BeamVisualPoolBucket>;
  for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
    const source = sources[kind];
    const depthSource = source.clone(
      `v2NormalBeamPoolDepthSource-${kind}`,
      null,
      false,
      false
    );
    source.registerInstancedBuffer(VertexBuffer.ColorInstanceKind, 4);
    source.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
    source.material = visualMaterial;
    source.isPickable = false;
    source.isVisible = false;
    source.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
    depthSource.registerInstancedBuffer(
      VertexBuffer.ColorInstanceKind,
      4
    );
    depthSource.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
    depthSource.material = depthMaterial;
    depthSource.isPickable = false;
    depthSource.isVisible = false;
    depthSource.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;
    buckets[kind] = {
      source,
      depthSource,
      available: [],
      instances: new Set(),
      inUse: new Map(),
      nextSerial: 1
    };
  }

  let disposed = false;
  let preparationPromise: Promise<void> | null = null;
  const pool: BeamVisualPool = {
    acquire: (kind, ownerId) => {
      const bucket = buckets[kind];
      let pair = bucket.available.pop();
      if (!pair) {
        const serial = bucket.nextSerial++;
        const mesh = bucket.source.createInstance(
          `v2NormalBeamPool-${kind}-${serial}`
        );
        const depthMesh = bucket.depthSource.createInstance(
          `v2NormalBeamPoolDepth-${kind}-${serial}`
        );
        pair = Object.freeze({ mesh, depthMesh });
        bucket.instances.add(pair);
      }
      const { mesh, depthMesh } = pair;
      bucket.inUse.set(mesh, pair);
      mesh.name = `${ownerId}-${kind}`;
      mesh.position.setAll(0);
      mesh.rotation.setAll(0);
      mesh.rotationQuaternion = null;
      mesh.scaling.setAll(1);
      mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
      mesh.isPickable = false;
      mesh.isVisible = true;
      mesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
      mesh.setEnabled(true);
      depthMesh.name = `${ownerId}-${kind}-depth`;
      depthMesh.parent = mesh;
      depthMesh.position.setAll(0);
      depthMesh.rotation.setAll(0);
      depthMesh.rotationQuaternion = null;
      depthMesh.scaling.setAll(1);
      depthMesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
      depthMesh.isPickable = false;
      depthMesh.isVisible = true;
      depthMesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;
      depthMesh.setEnabled(true);
      return mesh;
    },
    release: (kind, mesh) => {
      const bucket = buckets[kind];
      const pair = bucket.inUse.get(mesh)!;
      bucket.inUse.delete(mesh);
      pair.depthMesh.setEnabled(false);
      pair.depthMesh.isVisible = false;
      pair.depthMesh.parent = null;
      pair.depthMesh.instancedBuffers.instanceColor = new Color4(
        1,
        1,
        1,
        1
      );
      mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
      mesh.scaling.setAll(1);
      mesh.setEnabled(false);
      mesh.isVisible = false;
      bucket.available.push(pair);
    },
    setOpacity: (kind, mesh, opacity) => {
      const pair = buckets[kind].inUse.get(mesh)!;
      const color = new Color4(1, 1, 1, opacity);
      mesh.instancedBuffers.instanceColor = color;
      pair.depthMesh.instancedBuffers.instanceColor = color.clone();
    },
    prepare: () => {
      if (preparationPromise === null) {
        const compilationPromises: Promise<void>[] = [];
        for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
          const bucket = buckets[kind];
          compilationPromises.push(
            visualMaterial.forceCompilationAsync(bucket.source, {
              useInstances: true
            }),
            depthMaterial.forceCompilationAsync(bucket.depthSource, {
              useInstances: true
            })
          );
        }
        preparationPromise = Promise.all(compilationPromises).then(
          () => undefined
        );
      }
      return preparationPromise;
    },
    getSnapshot: () => {
      const snapshot = {} as Record<
        V2BeamVisualPoolKind,
        V2BeamVisualPoolKindSnapshot
      >;
      for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
        const bucket = buckets[kind];
        snapshot[kind] = Object.freeze({
          capacity: bucket.instances.size,
          inUse: bucket.inUse.size,
          available: bucket.available.length
        });
      }
      return Object.freeze(snapshot);
    },
    clear: () => {
      for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
        const bucket = buckets[kind];
        for (const mesh of [...bucket.inUse.keys()]) {
          pool.release(kind, mesh);
        }
      }
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
        const bucket = buckets[kind];
        for (const pair of [...bucket.instances]) {
          pair.depthMesh.parent = null;
          pair.depthMesh.dispose(false, false);
          pair.mesh.dispose(false, false);
        }
        bucket.instances.clear();
        bucket.inUse.clear();
        bucket.available.length = 0;
        bucket.source.dispose(false, false);
        bucket.depthSource.dispose(false, false);
      }
      visualMaterial.dispose();
      depthMaterial.dispose();
      disposed = true;
    }
  };
  return Object.freeze(pool);
};

export const createV2BeamSystem = (
  config: V2BeamSystemConfig
): V2BeamSystem => {
  if (typeof config.getHumanTargets !== "function") {
    throw new Error(
      "V2BeamSystemのgetHumanTargetsには関数が必要です"
    );
  }
  if (typeof config.random !== "function") {
    throw new Error("V2BeamSystemのrandomには関数が必要です");
  }
  if (typeof config.getOrbVisibilityPredicate !== "function") {
    throw new Error(
      "V2BeamSystemのgetOrbVisibilityPredicateには関数が必要です"
    );
  }
  if (
    config.stage.worldBoundary !== null &&
    typeof config.stage.worldBoundary?.findExitPoint !== "function"
  ) {
    throw new Error(
      "StageSpatialContext.worldBoundaryにはStageWorldBoundaryまたはnullが必要です"
    );
  }
  const visualPool = createBeamVisualPool(config.scene);
  const activeBeams = new Map<string, ActiveBeam>();
  const trailVisuals = new Set<TrailVisual>();
  const blockerImpactVisuals = new Set<BlockerImpactVisual>();
  let observedSpatialRevision = config.stage.queries.revision;
  let nextBeamSerial = 1;
  let disposed = false;

  const requireActiveSystem = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2BeamSystemは使用できません");
    }
  };

  const nextRandom = (): number => {
    const value = config.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("V2BeamSystemのrandomは0以上1未満を返す必要があります");
    }
    return value;
  };
  const randomInRange = (minimum: number, maximum: number): number =>
    minimum + nextRandom() * (maximum - minimum);
  const randomInteger = (minimum: number, maximum: number): number =>
    minimum + Math.floor(nextRandom() * (maximum - minimum + 1));

  const getBodyFrontPosition = (beam: ActiveBeam): Vector3 =>
    beam.phase === "retracting"
      ? beam.position.subtract(
          beam.direction.scale(beam.retractLeadRemaining)
        )
      : beam.position.subtract(
          beam.direction.scale(V2_NORMAL_BEAM_TIP_DIAMETER)
        );
  const getTailPosition = (beam: ActiveBeam): Vector3 =>
    getBodyFrontPosition(beam).subtract(
      beam.direction.scale(beam.bodyLength)
    );

  const updateBeamVisual = (beam: ActiveBeam): void => {
    beam.tipMesh.position.copyFrom(
      beam.position.subtract(
        beam.direction.scale(V2_NORMAL_BEAM_TIP_DIAMETER / 2)
      )
    );
    const opacity =
      beam.phase === "world-boundary-fading"
        ? Math.max(
            0,
            beam.boundaryFadeRemainingSeconds /
              V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS
          )
        : 1;
    visualPool.setOpacity("tip", beam.tipMesh, opacity);
    beam.tipMesh.setEnabled(beam.phase !== "retracting");
    if (beam.bodyLength <= SEGMENT_LENGTH_EPSILON) {
      beam.bodyMesh.setEnabled(false);
      return;
    }
    const front = getBodyFrontPosition(beam);
    const tail = getTailPosition(beam);
    beam.bodyMesh.setEnabled(true);
    beam.bodyMesh.position.copyFrom(tail.add(front).scale(0.5));
    beam.bodyMesh.scaling.set(1, beam.bodyLength, 1);
    visualPool.setOpacity("body", beam.bodyMesh, opacity);
  };

  const releaseBeam = (
    beam: ActiveBeam,
    completion?: Readonly<{
      events: V2BeamCompletionEvent[];
      frameElapsedSeconds: number;
    }>
  ): void => {
    if (completion) {
      completion.events.push(
        Object.freeze({
          beamId: beam.id,
          sourceId: beam.sourceId,
          originKind: beam.originKind,
          targetPolicy: beam.targetPolicy,
          frameElapsedSeconds: completion.frameElapsedSeconds
        })
      );
    }
    visualPool.release("body", beam.bodyMesh);
    visualPool.release("tip", beam.tipMesh);
    activeBeams.delete(beam.id);
  };

  const releaseTrailVisual = (trailVisual: TrailVisual): void => {
    visualPool.release("trail", trailVisual.mesh);
    trailVisuals.delete(trailVisual);
  };

  const releaseBlockerImpactVisual = (
    impactVisual: BlockerImpactVisual
  ): void => {
    visualPool.release("blocker-impact", impactVisual.mesh);
    blockerImpactVisuals.delete(impactVisual);
  };

  const createTrailVisual = (
    beam: ActiveBeam,
    beamPosition: Vector3,
    bodyLength: number,
    shouldRenderOrb: (position: Vector3) => boolean
  ): TrailVisual | null => {
    const trailRange = bodyLength / 2;
    const trailAdvance = randomInRange(0, trailRange);
    const trailRatio = trailAdvance / V2_NORMAL_BEAM_MAX_BODY_LENGTH;
    const trailRadius =
      V2_NORMAL_BEAM_BACK_DIAMETER / 2 +
      (V2_NORMAL_BEAM_FRONT_DIAMETER / 2 -
        V2_NORMAL_BEAM_BACK_DIAMETER / 2) *
        trailRatio;
    const angle = nextRandom() * Math.PI * 2;
    const distance = Math.sqrt(nextRandom()) * trailRadius;
    const basis =
      Math.abs(beam.direction.y) < 0.99 ? Vector3.Up() : Vector3.Right();
    const tangent = Vector3.Cross(beam.direction, basis).normalize();
    const bitangent = Vector3.Cross(tangent, beam.direction).normalize();
    const offset = tangent
      .scale(Math.cos(angle) * distance)
      .add(bitangent.scale(Math.sin(angle) * distance));
    const position = beamPosition
      .subtract(
        beam.direction.scale(
          V2_NORMAL_BEAM_TIP_DIAMETER + bodyLength
        )
      )
      .add(beam.direction.scale(trailAdvance))
      .add(offset);
    if (!shouldRenderOrb(position)) {
      return null;
    }
    const diameter = randomInRange(
      BEAM_TRAIL_DIAMETER_MIN,
      BEAM_TRAIL_DIAMETER_MAX
    );
    const mesh = visualPool.acquire("trail", beam.id);
    mesh.position.copyFrom(position);
    mesh.scaling.setAll(diameter);
    visualPool.setOpacity("trail", mesh, 0);
    const trailVisual: TrailVisual = {
      ownerBeamId: beam.id,
      mesh,
      velocity: beam.direction.scale(beam.speed * 0.5),
      remainingSeconds: V2_NORMAL_BEAM_TRAIL_LIFETIME_SECONDS,
      ageSeconds: 0,
      diameter,
      boundaryFadeRemainingSeconds: null,
      boundaryFadeStartAlpha: null,
      boundaryFadeStartScale: null
    };
    trailVisuals.add(trailVisual);
    return trailVisual;
  };

  const createBlockerImpactVisuals = (
    beamId: string,
    position: Vector3,
    incomingDirection: Vector3,
    surfaceNormal: Vector3,
    shouldRenderOrb: (position: Vector3) => boolean
  ): void => {
    if (!shouldRenderOrb(position)) {
      return;
    }
    const normal = surfaceNormal.clone().normalize();
    const incoming = incomingDirection.clone().normalize();
    const reflected = incoming
      .subtract(normal.scale(2 * Vector3.Dot(incoming, normal)))
      .normalize();
    const count = randomInteger(
      BEAM_BLOCKER_IMPACT_COUNT_MIN,
      BEAM_BLOCKER_IMPACT_COUNT_MAX
    );
    for (let index = 0; index < count; index += 1) {
      const theta = nextRandom() * Math.PI * 2;
      const y = nextRandom() * 2 - 1;
      const horizontal = Math.sqrt(1 - y * y);
      const jitter = new Vector3(
        horizontal * Math.cos(theta),
        y,
        horizontal * Math.sin(theta)
      ).scale(BEAM_BLOCKER_IMPACT_BOUNCE_JITTER);
      const direction = reflected
        .add(jitter)
        .add(
          normal.scale(
            BEAM_BLOCKER_IMPACT_BOUNCE_LIFT *
              (0.7 + nextRandom() * 0.6)
          )
        )
        .normalize();
      const speed = randomInRange(
        BEAM_BLOCKER_IMPACT_SPEED_MIN,
        BEAM_BLOCKER_IMPACT_SPEED_MAX
      );
      const mesh = visualPool.acquire("blocker-impact", beamId);
      mesh.position.copyFrom(position);
      blockerImpactVisuals.add({
        mesh,
        velocity: direction.scale(speed),
        remainingSeconds:
          V2_NORMAL_BEAM_BLOCKER_IMPACT_LIFETIME_SECONDS
      });
    }
  };

  const clearResources = (): void => {
    for (const beam of [...activeBeams.values()]) {
      releaseBeam(beam);
    }
    for (const trailVisual of [...trailVisuals]) {
      releaseTrailVisual(trailVisual);
    }
    for (const impactVisual of [...blockerImpactVisuals]) {
      releaseBlockerImpactVisual(impactVisual);
    }
    visualPool.clear();
  };

  const updateTrailVisuals = (
    candidates: readonly TrailVisual[],
    deltaSeconds: number,
    shouldRenderOrb: (position: Vector3) => boolean
  ): void => {
    for (const trailVisual of candidates) {
      if (!trailVisuals.has(trailVisual)) {
        continue;
      }
      if (!shouldRenderOrb(trailVisual.mesh.position)) {
        releaseTrailVisual(trailVisual);
        continue;
      }
      if (trailVisual.boundaryFadeRemainingSeconds !== null) {
        trailVisual.boundaryFadeRemainingSeconds -= deltaSeconds;
        if (
          trailVisual.boundaryFadeRemainingSeconds <=
          SEGMENT_LENGTH_EPSILON
        ) {
          releaseTrailVisual(trailVisual);
          continue;
        }
        const boundaryFade =
          trailVisual.boundaryFadeRemainingSeconds /
          V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS;
        trailVisual.mesh.scaling.setAll(
          trailVisual.boundaryFadeStartScale!
        );
        visualPool.setOpacity(
          "trail",
          trailVisual.mesh,
          trailVisual.boundaryFadeStartAlpha! * boundaryFade
        );
        continue;
      }
      trailVisual.remainingSeconds -= deltaSeconds;
      trailVisual.ageSeconds += deltaSeconds;
      if (trailVisual.remainingSeconds <= SEGMENT_LENGTH_EPSILON) {
        releaseTrailVisual(trailVisual);
        continue;
      }
      const velocityDecay = Math.exp(
        -BEAM_TRAIL_DRAG * deltaSeconds
      );
      trailVisual.mesh.position.addInPlace(
        trailVisual.velocity.scale(
          (1 - velocityDecay) / BEAM_TRAIL_DRAG
        )
      );
      trailVisual.velocity.scaleInPlace(velocityDecay);
      const trailScale =
        trailVisual.remainingSeconds /
        V2_NORMAL_BEAM_TRAIL_LIFETIME_SECONDS;
      if (trailScale <= BEAM_TRAIL_MIN_SCALE) {
        releaseTrailVisual(trailVisual);
        continue;
      }
      const fadeIn = Math.min(
        1,
        trailVisual.ageSeconds / BEAM_TRAIL_FADE_IN_DURATION_SECONDS
      );
      trailVisual.mesh.scaling.setAll(trailVisual.diameter * trailScale);
      visualPool.setOpacity("trail", trailVisual.mesh, fadeIn);
    }
  };

  const advanceTrailTimer = (
    beam: ActiveBeam,
    elapsedSeconds: number,
    segmentStartPosition: Vector3,
    segmentStartBodyLength: number,
    shouldRenderOrb: (position: Vector3) => boolean
  ): void => {
    let elapsedAtCursor = 0;
    let timeUntilTrail = beam.trailTimer;
    while (
      elapsedAtCursor + timeUntilTrail <=
      elapsedSeconds + SEGMENT_LENGTH_EPSILON
    ) {
      const generationElapsedSeconds = Math.min(
        elapsedSeconds,
        elapsedAtCursor + timeUntilTrail
      );
      const generationPosition = segmentStartPosition.add(
        beam.direction.scale(
          beam.speed * generationElapsedSeconds
        )
      );
      const generationBodyLength = Math.min(
        V2_NORMAL_BEAM_MAX_BODY_LENGTH,
        segmentStartBodyLength +
          beam.speed * generationElapsedSeconds
      );
      const trailVisual = createTrailVisual(
        beam,
        generationPosition,
        generationBodyLength,
        shouldRenderOrb
      );
      const remainingAfterGeneration =
        elapsedSeconds - generationElapsedSeconds;
      if (
        trailVisual &&
        remainingAfterGeneration > SEGMENT_LENGTH_EPSILON
      ) {
        updateTrailVisuals(
          [trailVisual],
          remainingAfterGeneration,
          shouldRenderOrb
        );
      }
      elapsedAtCursor = generationElapsedSeconds;
      timeUntilTrail = randomInRange(
        BEAM_TRAIL_INTERVAL_MIN_SECONDS,
        BEAM_TRAIL_INTERVAL_MAX_SECONDS
      );
    }
    beam.trailTimer = Math.max(
      0,
      timeUntilTrail - (elapsedSeconds - elapsedAtCursor)
    );
  };

  const beginTrailBoundaryFade = (
    beamId: string,
    elapsedFadeSeconds: number
  ): void => {
    const remainingFadeSeconds = Math.max(
      0,
      V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS - elapsedFadeSeconds
    );
    for (const trailVisual of [...trailVisuals]) {
      if (trailVisual.ownerBeamId !== beamId) {
        continue;
      }
      trailVisual.boundaryFadeRemainingSeconds = remainingFadeSeconds;
      if (remainingFadeSeconds <= SEGMENT_LENGTH_EPSILON) {
        releaseTrailVisual(trailVisual);
      } else {
        trailVisual.velocity.setAll(0);
        const currentAlpha = Number(
          trailVisual.mesh.instancedBuffers.instanceColor?.a ?? 1
        );
        trailVisual.boundaryFadeStartAlpha = currentAlpha;
        trailVisual.boundaryFadeStartScale =
          trailVisual.mesh.scaling.x;
        visualPool.setOpacity(
          "trail",
          trailVisual.mesh,
          currentAlpha *
            (remainingFadeSeconds /
              V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS)
        );
      }
    }
  };

  const updateBlockerImpactVisuals = (
    deltaSeconds: number,
    shouldRenderOrb: (position: Vector3) => boolean
  ): void => {
    for (const impactVisual of [...blockerImpactVisuals]) {
      if (!shouldRenderOrb(impactVisual.mesh.position)) {
        releaseBlockerImpactVisual(impactVisual);
        continue;
      }
      impactVisual.remainingSeconds -= deltaSeconds;
      if (impactVisual.remainingSeconds <= SEGMENT_LENGTH_EPSILON) {
        releaseBlockerImpactVisual(impactVisual);
        continue;
      }
      impactVisual.mesh.position.addInPlace(
        impactVisual.velocity.scale(deltaSeconds)
      );
      const scale =
        impactVisual.remainingSeconds /
        V2_NORMAL_BEAM_BLOCKER_IMPACT_LIFETIME_SECONDS;
      if (scale <= BEAM_BLOCKER_IMPACT_MIN_SCALE) {
        releaseBlockerImpactVisual(impactVisual);
        continue;
      }
      impactVisual.mesh.scaling.setAll(scale);
    }
  };

  const system: V2BeamSystem = {
    get activeCount() {
      return activeBeams.size;
    },
    prepareVisualResources: () => {
      requireActiveSystem();
      return visualPool.prepare();
    },
    spawn: (request) => {
      requireActiveSystem();
      const targetPolicy = validateBeamRequest(request);

      const id = `v2-normal-beam-${nextBeamSerial}`;
      nextBeamSerial += 1;
      const bodyMesh = visualPool.acquire("body", id);
      const tipMesh = visualPool.acquire("tip", id);

      const direction = request.direction.clone().normalize();
      bodyMesh.rotationQuaternion = createBeamBodyRotation(direction);
      const beam: ActiveBeam = {
        id,
        sourceId: request.sourceId,
        originKind: request.originKind,
        targetPolicy,
        phase: "advancing",
        position: request.origin.clone(),
        direction,
        speed: request.speed,
        remainingLifetime: request.maximumLifetime,
        bodyLength: 0,
        retractLeadRemaining: 0,
        boundaryFadeRemainingSeconds: 0,
        trailTimer: nextRandom() * BEAM_TRAIL_INTERVAL_MAX_SECONDS,
        checkStartContainment: true,
        bodyMesh,
        tipMesh
      };
      activeBeams.set(id, beam);
      updateBeamVisual(beam);
      return id;
    },
    update: (deltaSeconds) => {
      requireActiveSystem();
      assertFiniteNumber("beam.deltaSeconds", deltaSeconds);
      if (deltaSeconds < 0) {
        throw new Error(
          `beam.deltaSecondsは0以上である必要があります: ${deltaSeconds}`
        );
      }
      if (deltaSeconds === 0) {
        return Object.freeze({
          impacts: Object.freeze([]),
          expirations: Object.freeze([]),
          worldBoundaryExits: Object.freeze([]),
          completions: Object.freeze([])
        });
      }
      const spatialRevision = config.stage.queries.revision;
      if (spatialRevision !== observedSpatialRevision) {
        observedSpatialRevision = spatialRevision;
        for (const beam of activeBeams.values()) {
          beam.checkStartContainment = true;
        }
      }

      const shouldRenderOrb = config.getOrbVisibilityPredicate();
      if (typeof shouldRenderOrb !== "function") {
        throw new Error(
          "getOrbVisibilityPredicateは位置判定関数を返す必要があります"
        );
      }
      const shouldRenderOrbInWorld = (position: Vector3): boolean =>
        (config.stage.worldBoundary === null ||
          config.stage.worldBoundary.contains(position)) &&
        shouldRenderOrb(position);
      const frameStartTrailVisuals = [...trailVisuals];
      const boundaryExitTrailOwners = new Set<string>();
      updateBlockerImpactVisuals(deltaSeconds, shouldRenderOrbInWorld);
      const targets = config.getHumanTargets();
      validateHumanTargetIds(targets);
      const targetSpatialIndex = createHumanTargetSpatialIndex(targets);
      const impacts: V2BeamImpactEvent[] = [];
      const expirations: V2BeamExpirationEvent[] = [];
      const worldBoundaryExits: V2BeamWorldBoundaryExitEvent[] = [];
      const completions: V2BeamCompletionEvent[] = [];

      for (const beam of [...activeBeams.values()]) {
        if (beam.phase === "world-boundary-fading") {
          const completionElapsedSeconds =
            beam.boundaryFadeRemainingSeconds;
          beam.boundaryFadeRemainingSeconds = Math.max(
            0,
            beam.boundaryFadeRemainingSeconds - deltaSeconds
          );
          if (
            beam.boundaryFadeRemainingSeconds <= SEGMENT_LENGTH_EPSILON
          ) {
            releaseBeam(beam, {
              events: completions,
              frameElapsedSeconds: Math.min(
                deltaSeconds,
                completionElapsedSeconds
              )
            });
          } else {
            updateBeamVisual(beam);
          }
          continue;
        }
        if (beam.phase === "retracting") {
          const completionElapsedSeconds =
            beam.bodyLength / beam.speed;
          const shrinkDistance = beam.speed * deltaSeconds;
          beam.bodyLength = Math.max(
            0,
            beam.bodyLength - shrinkDistance
          );
          beam.retractLeadRemaining = Math.max(
            0,
            beam.retractLeadRemaining - shrinkDistance
          );
          if (beam.bodyLength <= SEGMENT_LENGTH_EPSILON) {
            releaseBeam(beam, {
              events: completions,
              frameElapsedSeconds: Math.min(
                deltaSeconds,
                completionElapsedSeconds
              )
            });
          } else {
            updateBeamVisual(beam);
          }
          continue;
        }

        const travelSeconds = Math.min(
          deltaSeconds,
          beam.remainingLifetime
        );
        const travelDistance = beam.speed * travelSeconds;
        const previousPosition = beam.position.clone();
        const previousBodyLength = beam.bodyLength;
        const nextPosition = previousPosition.add(
          beam.direction.scale(travelDistance)
        );
        const boundaryExitPoint =
          config.stage.worldBoundary === null
            ? null
            : config.stage.worldBoundary.findExitPoint(
                previousPosition,
                nextPosition
              );
        const boundaryDistance = boundaryExitPoint
          ? Vector3.Distance(previousPosition, boundaryExitPoint)
          : null;
        const candidateTargets = targetSpatialIndex.query(
          previousPosition,
          boundaryExitPoint ?? nextPosition
        );
        const hit = castValidatedV2BeamSegment(
          config.stage,
          previousPosition,
          boundaryExitPoint ?? nextPosition,
          candidateTargets,
          beam.sourceId,
          beam.targetPolicy,
          beam.checkStartContainment,
          config.collisionDiagnostics
        );
        beam.checkStartContainment = false;

        if (
          hit &&
          (boundaryDistance === null ||
            hit.distance < boundaryDistance - HIT_DISTANCE_EPSILON)
        ) {
          beam.position.copyFrom(hit.point);
          beam.bodyLength = Math.min(
            V2_NORMAL_BEAM_MAX_BODY_LENGTH,
            beam.bodyLength + hit.distance
          );
          beam.remainingLifetime = Math.max(
            0,
            beam.remainingLifetime - hit.distance / beam.speed
          );
          advanceTrailTimer(
            beam,
            hit.distance / beam.speed,
            previousPosition,
            previousBodyLength,
            shouldRenderOrbInWorld
          );
          beam.phase = "retracting";
          beam.retractLeadRemaining =
            V2_NORMAL_BEAM_TIP_DIAMETER;
          updateBeamVisual(beam);
          impacts.push(
            Object.freeze({
              beamId: beam.id,
              sourceId: beam.sourceId,
              originKind: beam.originKind,
              targetPolicy: beam.targetPolicy,
              hit
            })
          );
          if (hit.kind === "blocker") {
            createBlockerImpactVisuals(
              beam.id,
              hit.point,
              beam.direction,
              hit.normal,
              shouldRenderOrbInWorld
            );
          }
          if (beam.bodyLength <= SEGMENT_LENGTH_EPSILON) {
            releaseBeam(beam, {
              events: completions,
              frameElapsedSeconds: Math.min(
                deltaSeconds,
                hit.distance / beam.speed
              )
            });
          }
          continue;
        }

        if (
          boundaryExitPoint &&
          boundaryDistance !== null &&
          boundaryDistance <= travelDistance + HIT_DISTANCE_EPSILON
        ) {
          beam.position.copyFrom(boundaryExitPoint);
          beam.bodyLength = Math.min(
            V2_NORMAL_BEAM_MAX_BODY_LENGTH,
            beam.bodyLength + boundaryDistance
          );
          const exitTravelSeconds = boundaryDistance / beam.speed;
          beam.remainingLifetime = Math.max(
            0,
            beam.remainingLifetime - exitTravelSeconds
          );
          advanceTrailTimer(
            beam,
            exitTravelSeconds,
            previousPosition,
            previousBodyLength,
            shouldRenderOrbInWorld
          );
          const elapsedFadeSeconds = Math.max(
            0,
            deltaSeconds - exitTravelSeconds
          );
          updateTrailVisuals(
            frameStartTrailVisuals.filter(
              (trailVisual) => trailVisual.ownerBeamId === beam.id
            ),
            exitTravelSeconds,
            shouldRenderOrbInWorld
          );
          boundaryExitTrailOwners.add(beam.id);
          beam.phase = "world-boundary-fading";
          beam.boundaryFadeRemainingSeconds = Math.max(
            0,
            V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS - elapsedFadeSeconds
          );
          beginTrailBoundaryFade(beam.id, elapsedFadeSeconds);
          worldBoundaryExits.push(
            Object.freeze({
              beamId: beam.id,
              sourceId: beam.sourceId,
              originKind: beam.originKind,
              targetPolicy: beam.targetPolicy,
              position: boundaryExitPoint.clone()
            })
          );
          if (
            beam.boundaryFadeRemainingSeconds <= SEGMENT_LENGTH_EPSILON
          ) {
            releaseBeam(beam, {
              events: completions,
              frameElapsedSeconds: Math.min(
                deltaSeconds,
                exitTravelSeconds +
                  V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS
              )
            });
          } else {
            updateBeamVisual(beam);
          }
          continue;
        }

        beam.position.copyFrom(nextPosition);
        beam.bodyLength = Math.min(
          V2_NORMAL_BEAM_MAX_BODY_LENGTH,
          beam.bodyLength + travelDistance
        );
        beam.remainingLifetime -= travelSeconds;
        advanceTrailTimer(
          beam,
          travelSeconds,
          previousPosition,
          previousBodyLength,
          shouldRenderOrbInWorld
        );
        if (beam.remainingLifetime <= SEGMENT_LENGTH_EPSILON) {
          beam.remainingLifetime = 0;
          beam.phase = "retracting";
          beam.retractLeadRemaining =
            V2_NORMAL_BEAM_TIP_DIAMETER;
          updateBeamVisual(beam);
          expirations.push(
            Object.freeze({
              beamId: beam.id,
              sourceId: beam.sourceId,
              originKind: beam.originKind,
              targetPolicy: beam.targetPolicy,
              position: beam.position.clone()
            })
          );
          if (beam.bodyLength <= SEGMENT_LENGTH_EPSILON) {
            releaseBeam(beam, {
              events: completions,
              frameElapsedSeconds: travelSeconds
            });
          }
        } else {
          updateBeamVisual(beam);
        }
      }
      updateTrailVisuals(
        frameStartTrailVisuals.filter(
          (trailVisual) =>
            !boundaryExitTrailOwners.has(trailVisual.ownerBeamId)
        ),
        deltaSeconds,
        shouldRenderOrbInWorld
      );

      return Object.freeze({
        impacts: Object.freeze(impacts),
        expirations: Object.freeze(expirations),
        worldBoundaryExits: Object.freeze(worldBoundaryExits),
        completions: Object.freeze(completions)
      });
    },
    getActiveBeams: () => {
      requireActiveSystem();
      return Object.freeze(
        [...activeBeams.values()].map((beam) =>
          Object.freeze({
            id: beam.id,
            sourceId: beam.sourceId,
            originKind: beam.originKind,
            targetPolicy: beam.targetPolicy,
            phase: beam.phase,
            position: beam.position.clone(),
            tailPosition: getTailPosition(beam),
            velocity:
              beam.phase === "advancing"
                ? beam.direction.scale(beam.speed)
                : Vector3.Zero(),
            bodyLength: beam.bodyLength,
            remainingLifetime: beam.remainingLifetime
          })
        )
      );
    },
    getVisualPoolSnapshot: () => {
      requireActiveSystem();
      return visualPool.getSnapshot();
    },
    clear: () => {
      requireActiveSystem();
      clearResources();
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      clearResources();
      visualPool.dispose();
      disposed = true;
    }
  };
  return system;
};
