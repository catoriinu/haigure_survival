import {
  Color3,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  Quaternion,
  Ray,
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

export const V2_NORMAL_BEAM_MAX_BODY_LENGTH = 0.75;
export const V2_NORMAL_BEAM_IMPACT_VISUAL_DURATION_SECONDS = 0.12;
export const V2_BEAM_VISUAL_POOL_KINDS = [
  "body",
  "tip",
  "impact"
] as const;

const SEGMENT_LENGTH_EPSILON = 1e-8;
const SURFACE_DISTANCE_EPSILON = 1e-6;
const HIT_DISTANCE_EPSILON = 1e-6;
const HUMAN_TARGET_SPATIAL_CELL_SIZE = 1;
const BLOCKER_SPATIAL_CELL_SIZE = 2;
const IMPACT_VISUAL_DIAMETER_MULTIPLIER = 2.5;
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
const CONTAINMENT_RAY_DIRECTION = new Vector3(
  0.7385489459,
  0.4615930912,
  0.4938376187
).normalize();

type WorldTriangle = readonly [Vector3, Vector3, Vector3];

type BlockerGeometry = Readonly<{
  minimum: Vector3;
  maximum: Vector3;
  triangles: readonly WorldTriangle[];
}>;

const blockerGeometryCache = new WeakMap<Mesh, BlockerGeometry>();

type BlockerBoundsCandidate = Readonly<{
  mesh: Mesh;
  minimum: Vector3;
  maximum: Vector3;
}>;

type BlockerSpatialIndex = Readonly<{
  query(point: Vector3): readonly BlockerBoundsCandidate[];
}>;

const blockerSpatialIndexCache = new WeakMap<
  readonly Mesh[],
  BlockerSpatialIndex
>();

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

export type V2BeamVisualConfig = Readonly<{
  diameter: number;
  color: Color3;
  alpha: number;
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
  visual: V2BeamVisualConfig;
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

export type V2BeamFrameEvents = Readonly<{
  impacts: readonly V2BeamImpactEvent[];
  expirations: readonly V2BeamExpirationEvent[];
}>;

export type V2BeamPhase = "advancing" | "retracting";

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
  checkStartContainment: boolean;
  bodyMesh: InstancedMesh;
  tipMesh: InstancedMesh;
};

type ImpactVisual = {
  mesh: InstancedMesh;
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

const assertUnitInterval = (label: string, value: number): void => {
  assertFiniteNumber(label, value);
  if (value < 0 || value > 1) {
    throw new Error(`${label}は0以上1以下である必要があります: ${value}`);
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

const buildBlockerGeometry = (mesh: Mesh): BlockerGeometry => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (
    !positions ||
    !indices ||
    indices.length === 0 ||
    indices.length % 3 !== 0
  ) {
    throw new Error(`ビーム遮蔽Meshに三角形形状がありません: ${mesh.name}`);
  }

  const world = mesh.computeWorldMatrix(true);
  const triangles: WorldTriangle[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    triangles.push([
      Vector3.TransformCoordinates(
        Vector3.FromArray(positions, indices[index] * 3),
        world
      ),
      Vector3.TransformCoordinates(
        Vector3.FromArray(positions, indices[index + 1] * 3),
        world
      ),
      Vector3.TransformCoordinates(
        Vector3.FromArray(positions, indices[index + 2] * 3),
        world
      )
    ]);
  }

  const bounds = mesh.getBoundingInfo().boundingBox;
  return Object.freeze({
    minimum: bounds.minimumWorld.clone(),
    maximum: bounds.maximumWorld.clone(),
    triangles: Object.freeze(triangles)
  });
};

const getBlockerGeometry = (mesh: Mesh): BlockerGeometry => {
  const cached = blockerGeometryCache.get(mesh);
  if (cached) {
    return cached;
  }
  const geometry = buildBlockerGeometry(mesh);
  blockerGeometryCache.set(mesh, geometry);
  return geometry;
};

const isInsideBounds = (
  point: Vector3,
  minimum: Vector3,
  maximum: Vector3
): boolean =>
  point.x >= minimum.x - SURFACE_DISTANCE_EPSILON &&
  point.x <= maximum.x + SURFACE_DISTANCE_EPSILON &&
  point.y >= minimum.y - SURFACE_DISTANCE_EPSILON &&
  point.y <= maximum.y + SURFACE_DISTANCE_EPSILON &&
  point.z >= minimum.z - SURFACE_DISTANCE_EPSILON &&
  point.z <= maximum.z + SURFACE_DISTANCE_EPSILON;

const blockerSpatialCellKey = (x: number, y: number, z: number) =>
  `${x}:${y}:${z}`;

const createBlockerSpatialIndex = (
  blockers: readonly Mesh[]
): BlockerSpatialIndex => {
  const cells = new Map<string, BlockerBoundsCandidate[]>();
  for (const mesh of blockers) {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const candidate = Object.freeze({
      mesh,
      minimum: bounds.minimumWorld.clone(),
      maximum: bounds.maximumWorld.clone()
    });
    const minimumCellX = Math.floor(
      (candidate.minimum.x - SURFACE_DISTANCE_EPSILON) /
        BLOCKER_SPATIAL_CELL_SIZE
    );
    const maximumCellX = Math.floor(
      (candidate.maximum.x + SURFACE_DISTANCE_EPSILON) /
        BLOCKER_SPATIAL_CELL_SIZE
    );
    const minimumCellY = Math.floor(
      (candidate.minimum.y - SURFACE_DISTANCE_EPSILON) /
        BLOCKER_SPATIAL_CELL_SIZE
    );
    const maximumCellY = Math.floor(
      (candidate.maximum.y + SURFACE_DISTANCE_EPSILON) /
        BLOCKER_SPATIAL_CELL_SIZE
    );
    const minimumCellZ = Math.floor(
      (candidate.minimum.z - SURFACE_DISTANCE_EPSILON) /
        BLOCKER_SPATIAL_CELL_SIZE
    );
    const maximumCellZ = Math.floor(
      (candidate.maximum.z + SURFACE_DISTANCE_EPSILON) /
        BLOCKER_SPATIAL_CELL_SIZE
    );
    for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
      for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
        for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
          const key = blockerSpatialCellKey(cellX, cellY, cellZ);
          const cell = cells.get(key) ?? [];
          cell.push(candidate);
          cells.set(key, cell);
        }
      }
    }
  }
  return Object.freeze({
    query: (point: Vector3) => {
      const cellX = Math.floor(point.x / BLOCKER_SPATIAL_CELL_SIZE);
      const cellY = Math.floor(point.y / BLOCKER_SPATIAL_CELL_SIZE);
      const cellZ = Math.floor(point.z / BLOCKER_SPATIAL_CELL_SIZE);
      return (
        cells.get(blockerSpatialCellKey(cellX, cellY, cellZ)) ??
        Object.freeze([])
      );
    }
  });
};

const getBlockerSpatialIndex = (
  blockers: readonly Mesh[]
): BlockerSpatialIndex => {
  const cached = blockerSpatialIndexCache.get(blockers);
  if (cached) {
    return cached;
  }
  const index = createBlockerSpatialIndex(blockers);
  blockerSpatialIndexCache.set(blockers, index);
  return index;
};

const prepareBlockerSpatialIndices = (
  beamBlockers: readonly Mesh[],
  sightBlockers: readonly Mesh[]
): void => {
  const useSharedIndex =
    beamBlockers.length === sightBlockers.length &&
    beamBlockers.every(
      (blocker, index) => blocker === sightBlockers[index]
    );
  if (!useSharedIndex) {
    getBlockerSpatialIndex(beamBlockers);
    getBlockerSpatialIndex(sightBlockers);
    return;
  }
  const sharedIndex =
    blockerSpatialIndexCache.get(beamBlockers) ??
    blockerSpatialIndexCache.get(sightBlockers) ??
    createBlockerSpatialIndex(beamBlockers);
  blockerSpatialIndexCache.set(beamBlockers, sharedIndex);
  blockerSpatialIndexCache.set(sightBlockers, sharedIndex);
};

const containsPoint = (mesh: Mesh, point: Vector3): boolean => {
  const geometry = getBlockerGeometry(mesh);
  if (!isInsideBounds(point, geometry.minimum, geometry.maximum)) {
    return false;
  }

  const ray = new Ray(point, CONTAINMENT_RAY_DIRECTION, Number.MAX_VALUE);
  const distances: number[] = [];
  for (const triangle of geometry.triangles) {
    const intersection = ray.intersectsTriangle(...triangle);
    if (!intersection || intersection.distance < -SURFACE_DISTANCE_EPSILON) {
      continue;
    }
    if (Math.abs(intersection.distance) <= SURFACE_DISTANCE_EPSILON) {
      return true;
    }
    distances.push(intersection.distance);
  }

  distances.sort((left, right) => left - right);
  let uniqueIntersections = 0;
  let previousDistance = Number.NEGATIVE_INFINITY;
  for (const distance of distances) {
    if (distance - previousDistance > SURFACE_DISTANCE_EPSILON) {
      uniqueIntersections += 1;
      previousDistance = distance;
    }
  }
  return uniqueIntersections % 2 === 1;
};

const findContainingBlocker = (
  blockers: readonly Mesh[],
  point: Vector3,
  diagnostics: V2BeamCollisionDiagnostics | undefined
): Mesh | null => {
  const candidates = getBlockerSpatialIndex(blockers).query(point);
  let triangulatedMeshCount = 0;
  for (const candidate of candidates) {
    if (
      !isInsideBounds(point, candidate.minimum, candidate.maximum)
    ) {
      continue;
    }
    const geometryWasCached = blockerGeometryCache.has(candidate.mesh);
    const isContaining = containsPoint(candidate.mesh, point);
    if (!geometryWasCached) {
      triangulatedMeshCount += 1;
    }
    if (isContaining) {
      diagnostics?.recordStartContainment(
        candidates.length,
        triangulatedMeshCount
      );
      return candidate.mesh;
    }
  }
  diagnostics?.recordStartContainment(
    candidates.length,
    triangulatedMeshCount
  );
  return null;
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
    ? findContainingBlocker(
        stage.resources.beamBlockers,
        from,
        diagnostics
      )
    : null;
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

  const containingBlocker = findContainingBlocker(
    stage.resources.sightBlockers,
    from,
    undefined
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

type BeamVisualPoolBucket = {
  source: Mesh;
  available: InstancedMesh[];
  instances: Set<InstancedMesh>;
  inUse: Set<InstancedMesh>;
  nextSerial: number;
};

type BeamVisualPool = Readonly<{
  acquire(kind: V2BeamVisualPoolKind, ownerId: string): InstancedMesh;
  release(kind: V2BeamVisualPoolKind, mesh: InstancedMesh): void;
  prepare(): Promise<void>;
  getSnapshot(): V2BeamVisualPoolSnapshot;
  clear(): void;
  dispose(): void;
}>;

const createBeamVisualPool = (
  scene: Scene,
  visual: V2BeamVisualConfig
): BeamVisualPool => {
  const material = new StandardMaterial("v2NormalBeamMaterial", scene);
  material.emissiveColor = visual.color.clone();
  material.diffuseColor = visual.color.clone();
  material.specularColor = Color3.Black();
  material.alpha = visual.alpha;

  const bodySource = MeshBuilder.CreateCylinder(
    "v2NormalBeamPoolSource-body",
    {
      height: 1,
      diameter: visual.diameter,
      tessellation: 8
    },
    scene
  );
  const tipSource = MeshBuilder.CreateSphere(
    "v2NormalBeamPoolSource-tip",
    {
      diameter: visual.diameter,
      segments: 8
    },
    scene
  );
  const impactSource = MeshBuilder.CreateSphere(
    "v2NormalBeamPoolSource-impact",
    {
      diameter: visual.diameter * IMPACT_VISUAL_DIAMETER_MULTIPLIER,
      segments: 8
    },
    scene
  );
  const sources: Readonly<Record<V2BeamVisualPoolKind, Mesh>> =
    Object.freeze({
      body: bodySource,
      tip: tipSource,
      impact: impactSource
    });
  const buckets = {} as Record<V2BeamVisualPoolKind, BeamVisualPoolBucket>;
  for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
    const source = sources[kind];
    source.material = material;
    source.isPickable = false;
    source.isVisible = false;
    buckets[kind] = {
      source,
      available: [],
      instances: new Set(),
      inUse: new Set(),
      nextSerial: 1
    };
  }

  let disposed = false;
  let preparationPromise: Promise<void> | null = null;
  const pool: BeamVisualPool = {
    acquire: (kind, ownerId) => {
      const bucket = buckets[kind];
      const mesh =
        bucket.available.pop() ??
        bucket.source.createInstance(
          `v2NormalBeamPool-${kind}-${bucket.nextSerial++}`
        );
      bucket.instances.add(mesh);
      bucket.inUse.add(mesh);
      mesh.name = `${ownerId}-${kind}`;
      mesh.position.setAll(0);
      mesh.rotation.setAll(0);
      mesh.rotationQuaternion = null;
      mesh.scaling.setAll(1);
      mesh.isPickable = false;
      mesh.isVisible = true;
      mesh.setEnabled(true);
      return mesh;
    },
    release: (kind, mesh) => {
      const bucket = buckets[kind];
      bucket.inUse.delete(mesh);
      mesh.setEnabled(false);
      mesh.isVisible = false;
      bucket.available.push(mesh);
    },
    prepare: () => {
      preparationPromise ??= material
        .forceCompilationAsync(buckets.body.source, {
          useInstances: true
        })
        .then(() => undefined);
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
        for (const mesh of [...bucket.inUse]) {
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
        for (const mesh of [...bucket.instances]) {
          mesh.dispose(false, false);
        }
        bucket.instances.clear();
        bucket.inUse.clear();
        bucket.available.length = 0;
        bucket.source.dispose(false, false);
      }
      material.dispose();
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
  assertPositiveNumber("beam.visual.diameter", config.visual.diameter);
  assertUnitInterval("beam.visual.alpha", config.visual.alpha);
  assertFiniteNumber("beam.visual.color.r", config.visual.color.r);
  assertFiniteNumber("beam.visual.color.g", config.visual.color.g);
  assertFiniteNumber("beam.visual.color.b", config.visual.color.b);
  prepareBlockerSpatialIndices(
    config.stage.resources.beamBlockers,
    config.stage.resources.sightBlockers
  );

  const visualPool = createBeamVisualPool(config.scene, config.visual);
  const activeBeams = new Map<string, ActiveBeam>();
  const impactVisuals = new Set<ImpactVisual>();
  let nextBeamSerial = 1;
  let disposed = false;

  const requireActiveSystem = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2BeamSystemは使用できません");
    }
  };

  const getTailPosition = (beam: ActiveBeam): Vector3 =>
    beam.position.subtract(beam.direction.scale(beam.bodyLength));

  const updateBeamVisual = (beam: ActiveBeam): void => {
    beam.tipMesh.position.copyFrom(beam.position);
    if (beam.bodyLength <= SEGMENT_LENGTH_EPSILON) {
      beam.bodyMesh.setEnabled(false);
      return;
    }
    const tail = getTailPosition(beam);
    beam.bodyMesh.setEnabled(true);
    beam.bodyMesh.position.copyFrom(tail.add(beam.position).scale(0.5));
    beam.bodyMesh.scaling.set(1, beam.bodyLength, 1);
  };

  const releaseBeam = (beam: ActiveBeam): void => {
    visualPool.release("body", beam.bodyMesh);
    visualPool.release("tip", beam.tipMesh);
    activeBeams.delete(beam.id);
  };

  const releaseImpactVisual = (impactVisual: ImpactVisual): void => {
    visualPool.release("impact", impactVisual.mesh);
    impactVisuals.delete(impactVisual);
  };

  const createBlockerImpactVisual = (
    beamId: string,
    position: Vector3
  ): void => {
    const mesh = visualPool.acquire("impact", beamId);
    mesh.position.copyFrom(position);
    impactVisuals.add({
      mesh,
      remainingSeconds: V2_NORMAL_BEAM_IMPACT_VISUAL_DURATION_SECONDS
    });
  };

  const clearResources = (): void => {
    for (const beam of [...activeBeams.values()]) {
      releaseBeam(beam);
    }
    for (const impactVisual of [...impactVisuals]) {
      releaseImpactVisual(impactVisual);
    }
    visualPool.clear();
  };

  const updateImpactVisuals = (deltaSeconds: number): void => {
    for (const impactVisual of [...impactVisuals]) {
      impactVisual.remainingSeconds -= deltaSeconds;
      if (impactVisual.remainingSeconds <= SEGMENT_LENGTH_EPSILON) {
        releaseImpactVisual(impactVisual);
      }
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
          expirations: Object.freeze([])
        });
      }

      updateImpactVisuals(deltaSeconds);
      const targets = config.getHumanTargets();
      validateHumanTargetIds(targets);
      const targetSpatialIndex = createHumanTargetSpatialIndex(targets);
      const impacts: V2BeamImpactEvent[] = [];
      const expirations: V2BeamExpirationEvent[] = [];

      for (const beam of [...activeBeams.values()]) {
        if (beam.phase === "retracting") {
          beam.bodyLength = Math.max(
            0,
            beam.bodyLength - beam.speed * deltaSeconds
          );
          if (beam.bodyLength <= SEGMENT_LENGTH_EPSILON) {
            releaseBeam(beam);
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
        const nextPosition = previousPosition.add(
          beam.direction.scale(travelDistance)
        );
        const candidateTargets = targetSpatialIndex.query(
          previousPosition,
          nextPosition
        );
        const hit = castValidatedV2BeamSegment(
          config.stage,
          previousPosition,
          nextPosition,
          candidateTargets,
          beam.sourceId,
          beam.targetPolicy,
          beam.checkStartContainment,
          config.collisionDiagnostics
        );
        beam.checkStartContainment = false;

        if (hit) {
          beam.position.copyFrom(hit.point);
          beam.bodyLength = Math.min(
            V2_NORMAL_BEAM_MAX_BODY_LENGTH,
            beam.bodyLength + hit.distance
          );
          beam.remainingLifetime = Math.max(
            0,
            beam.remainingLifetime - hit.distance / beam.speed
          );
          beam.phase = "retracting";
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
            createBlockerImpactVisual(beam.id, hit.point);
          }
          if (beam.bodyLength <= SEGMENT_LENGTH_EPSILON) {
            releaseBeam(beam);
          }
          continue;
        }

        beam.position.copyFrom(nextPosition);
        beam.bodyLength = Math.min(
          V2_NORMAL_BEAM_MAX_BODY_LENGTH,
          beam.bodyLength + travelDistance
        );
        beam.remainingLifetime -= travelSeconds;
        updateBeamVisual(beam);
        if (beam.remainingLifetime <= SEGMENT_LENGTH_EPSILON) {
          beam.remainingLifetime = 0;
          beam.phase = "retracting";
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
            releaseBeam(beam);
          }
        }
      }

      return Object.freeze({
        impacts: Object.freeze(impacts),
        expirations: Object.freeze(expirations)
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
