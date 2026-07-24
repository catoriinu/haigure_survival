import {
  Color3,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";
import type { StageSpatialContext } from "../world/stageSpatialContext";
import type { SpatialHit } from "../world/stageSpatialQueries";
import type { V2ActorSphere, V2BeamRequest } from "./combatTypes";

const SEGMENT_LENGTH_EPSILON = 1e-8;
const SURFACE_DISTANCE_EPSILON = 1e-6;
const HIT_DISTANCE_EPSILON = 1e-6;
const ACTOR_SPATIAL_CELL_SIZE = 1;
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
  actor: V2ActorSphere;
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

export type V2BeamSystemConfig = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  getActorSpheres(): readonly V2ActorSphere[];
  visual: V2BeamVisualConfig;
}>;

export type V2BeamImpactEvent = Readonly<{
  beamId: string;
  sourceId: string;
  hit: V2BeamSegmentHit;
}>;

export type V2BeamExpirationEvent = Readonly<{
  beamId: string;
  sourceId: string;
  position: Vector3;
}>;

export type V2BeamFrameEvents = Readonly<{
  impacts: readonly V2BeamImpactEvent[];
  expirations: readonly V2BeamExpirationEvent[];
}>;

export type V2ActiveBeamSnapshot = Readonly<{
  id: string;
  sourceId: string;
  position: Vector3;
  velocity: Vector3;
  remainingLifetime: number;
}>;

export interface V2BeamSystem {
  readonly activeCount: number;
  spawn(request: V2BeamRequest): string;
  update(deltaSeconds: number): V2BeamFrameEvents;
  getActiveBeams(): readonly V2ActiveBeamSnapshot[];
  clear(): void;
  dispose(): void;
}

type ActiveBeam = {
  id: string;
  sourceId: string;
  position: Vector3;
  velocity: Vector3;
  remainingLifetime: number;
  mesh: Mesh;
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
  if (value.length === 0) {
    throw new Error(`${label}は空文字列にできません`);
  }
};

const buildBlockerGeometry = (mesh: Mesh): BlockerGeometry => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices || indices.length === 0 || indices.length % 3 !== 0) {
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
  return {
    minimum: bounds.minimumWorld.clone(),
    maximum: bounds.maximumWorld.clone(),
    triangles
  };
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
  point: Vector3
): Mesh | null => {
  for (const blocker of blockers) {
    if (containsPoint(blocker, point)) {
      return blocker;
    }
  }
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
): V2BeamBlockerHit => ({
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
): V2BeamBlockerHit => ({
  kind: "blocker",
  point: from.clone(),
  normal: getStartHitNormal(from, to),
  distance: 0,
  mesh,
  startedInside: true
});

const castActorSphereSegment = (
  from: Vector3,
  to: Vector3,
  actor: V2ActorSphere
): V2BeamActorHit | null => {
  requireNonEmptyId("actor.id", actor.id);
  assertFiniteVector(`actor(${actor.id}).center`, actor.center);
  assertPositiveNumber(`actor(${actor.id}).radius`, actor.radius);

  const delta = to.subtract(from);
  const relativeStart = from.subtract(actor.center);
  const radiusSquared = actor.radius * actor.radius;
  const segmentLengthSquared = delta.lengthSquared();
  let fraction: number;

  if (relativeStart.lengthSquared() <= radiusSquared) {
    fraction = 0;
  } else if (segmentLengthSquared <= SEGMENT_LENGTH_EPSILON ** 2) {
    return null;
  } else {
    const projection = Vector3.Dot(relativeStart, delta);
    const constant = relativeStart.lengthSquared() - radiusSquared;
    const discriminant = projection * projection - segmentLengthSquared * constant;
    if (discriminant < 0) {
      return null;
    }
    fraction =
      (-projection - Math.sqrt(discriminant)) / segmentLengthSquared;
    if (fraction < 0 || fraction > 1) {
      return null;
    }
  }

  const point = from.add(delta.scale(fraction));
  const outward = point.subtract(actor.center);
  const normal =
    outward.lengthSquared() <= SEGMENT_LENGTH_EPSILON ** 2
      ? getStartHitNormal(from, to)
      : outward.normalize();
  return {
    kind: "actor",
    point,
    normal,
    distance: Math.sqrt(segmentLengthSquared) * fraction,
    actor
  };
};

const validateActorIds = (actors: readonly V2ActorSphere[]): void => {
  const actorIds = new Set<string>();
  for (const actor of actors) {
    requireNonEmptyId("actor.id", actor.id);
    if (actorIds.has(actor.id)) {
      throw new Error(`ビーム衝突標的IDが重複しています: ${actor.id}`);
    }
    actorIds.add(actor.id);
  }
};

type ActorSpatialIndex = Readonly<{
  query(from: Vector3, to: Vector3, sourceId: string): readonly V2ActorSphere[];
}>;

const actorCellKey = (x: number, y: number, z: number) => `${x}:${y}:${z}`;

const createActorSpatialIndex = (
  actors: readonly V2ActorSphere[]
): ActorSpatialIndex => {
  const cells = new Map<string, number[]>();
  let maximumRadius = 0;
  actors.forEach((actor, index) => {
    maximumRadius = Math.max(maximumRadius, actor.radius);
    const cellX = Math.floor(actor.center.x / ACTOR_SPATIAL_CELL_SIZE);
    const cellY = Math.floor(actor.center.y / ACTOR_SPATIAL_CELL_SIZE);
    const cellZ = Math.floor(actor.center.z / ACTOR_SPATIAL_CELL_SIZE);
    const key = actorCellKey(cellX, cellY, cellZ);
    const indices = cells.get(key) ?? [];
    indices.push(index);
    cells.set(key, indices);
  });

  return Object.freeze({
    query: (from, to, sourceId) => {
      const minimumCellX = Math.floor(
        (Math.min(from.x, to.x) - maximumRadius) / ACTOR_SPATIAL_CELL_SIZE
      );
      const maximumCellX = Math.floor(
        (Math.max(from.x, to.x) + maximumRadius) / ACTOR_SPATIAL_CELL_SIZE
      );
      const minimumCellY = Math.floor(
        (Math.min(from.y, to.y) - maximumRadius) / ACTOR_SPATIAL_CELL_SIZE
      );
      const maximumCellY = Math.floor(
        (Math.max(from.y, to.y) + maximumRadius) / ACTOR_SPATIAL_CELL_SIZE
      );
      const minimumCellZ = Math.floor(
        (Math.min(from.z, to.z) - maximumRadius) / ACTOR_SPATIAL_CELL_SIZE
      );
      const maximumCellZ = Math.floor(
        (Math.max(from.z, to.z) + maximumRadius) / ACTOR_SPATIAL_CELL_SIZE
      );
      const candidateIndices: number[] = [];
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
          for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
            candidateIndices.push(
              ...(cells.get(actorCellKey(cellX, cellY, cellZ)) ?? [])
            );
          }
        }
      }
      candidateIndices.sort((left, right) => left - right);
      return Object.freeze(
        candidateIndices.flatMap((index) =>
          actors[index].id === sourceId ? [] : [actors[index]]
        )
      );
    }
  });
};

/**
 * 前フレーム位置から新位置までを連続判定し、最初の壁または標的だけを返す。
 * 同距離では壁を優先し、壁面上の標的へビームが抜けることを防ぐ。
 * ゼロ長でも開始点が壁内または標的内なら距離0の命中、それ以外はnullとする。
 */
export const castV2BeamSegment = (
  stage: StageSpatialContext,
  from: Vector3,
  to: Vector3,
  actors: readonly V2ActorSphere[]
): V2BeamSegmentHit | null => {
  assertFiniteVector("beam.from", from);
  assertFiniteVector("beam.to", to);
  validateActorIds(actors);

  const containingBlocker = findContainingBlocker(
    stage.resources.beamBlockers,
    from
  );
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

  for (const actor of actors) {
    const actorHit = castActorSphereSegment(from, to, actor);
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
    from
  );
  if (containingBlocker) {
    return {
      occluded: true,
      point: from.clone(),
      normal: getStartHitNormal(from, to),
      distance: 0,
      mesh: containingBlocker,
      startedInside: true
    };
  }

  if (Vector3.DistanceSquared(from, to) <= SEGMENT_LENGTH_EPSILON ** 2) {
    return {
      occluded: false,
      point: null,
      normal: null,
      distance: null,
      mesh: null,
      startedInside: false
    };
  }

  const hit = stage.queries.castSightSegment(from, to);
  if (!hit) {
    return {
      occluded: false,
      point: null,
      normal: null,
      distance: null,
      mesh: null,
      startedInside: false
    };
  }
  return {
    occluded: true,
    point: hit.point.clone(),
    normal: hit.normal.clone(),
    distance: hit.distance,
    mesh: hit.mesh,
    startedInside: false
  };
};

const validateBeamRequest = (request: V2BeamRequest): void => {
  requireNonEmptyId("beam.sourceId", request.sourceId);
  assertFiniteVector("beam.origin", request.origin);
  assertFiniteVector("beam.direction", request.direction);
  if (request.direction.lengthSquared() <= SEGMENT_LENGTH_EPSILON ** 2) {
    throw new Error("beam.directionはゼロベクトルにできません");
  }
  assertPositiveNumber("beam.speed", request.speed);
  assertPositiveNumber("beam.maximumLifetime", request.maximumLifetime);
};

export const createV2BeamSystem = (
  config: V2BeamSystemConfig
): V2BeamSystem => {
  assertPositiveNumber("beam.visual.diameter", config.visual.diameter);
  assertUnitInterval("beam.visual.alpha", config.visual.alpha);
  assertFiniteNumber("beam.visual.color.r", config.visual.color.r);
  assertFiniteNumber("beam.visual.color.g", config.visual.color.g);
  assertFiniteNumber("beam.visual.color.b", config.visual.color.b);

  const material = new StandardMaterial("v2NormalBeamMaterial", config.scene);
  material.emissiveColor = config.visual.color.clone();
  material.diffuseColor = config.visual.color.clone();
  material.specularColor = Color3.Black();
  material.alpha = config.visual.alpha;

  const activeBeams = new Map<string, ActiveBeam>();
  let nextBeamSerial = 1;
  let disposed = false;

  const requireActiveSystem = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2BeamSystemは使用できません");
    }
  };

  const disposeBeam = (beam: ActiveBeam): void => {
    beam.mesh.dispose(false, false);
    activeBeams.delete(beam.id);
  };

  const system: V2BeamSystem = {
    get activeCount() {
      return activeBeams.size;
    },
    spawn: (request) => {
      requireActiveSystem();
      validateBeamRequest(request);

      const id = `v2-normal-beam-${nextBeamSerial}`;
      nextBeamSerial += 1;
      const mesh = MeshBuilder.CreateSphere(
        id,
        {
          diameter: config.visual.diameter,
          segments: 8
        },
        config.scene
      );
      mesh.material = material;
      mesh.isPickable = false;
      mesh.position.copyFrom(request.origin);

      activeBeams.set(id, {
        id,
        sourceId: request.sourceId,
        position: request.origin.clone(),
        velocity: request.direction.clone().normalize().scale(request.speed),
        remainingLifetime: request.maximumLifetime,
        mesh
      });
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
        return { impacts: [], expirations: [] };
      }

      const allActors = config.getActorSpheres();
      validateActorIds(allActors);
      const actorSpatialIndex = createActorSpatialIndex(allActors);
      const impacts: V2BeamImpactEvent[] = [];
      const expirations: V2BeamExpirationEvent[] = [];

      for (const beam of [...activeBeams.values()]) {
        const travelSeconds = Math.min(
          deltaSeconds,
          beam.remainingLifetime
        );
        const previousPosition = beam.position.clone();
        const nextPosition = previousPosition.add(
          beam.velocity.scale(travelSeconds)
        );
        const targetActors = actorSpatialIndex.query(
          previousPosition,
          nextPosition,
          beam.sourceId
        );
        const hit = castV2BeamSegment(
          config.stage,
          previousPosition,
          nextPosition,
          targetActors
        );

        if (hit) {
          beam.position.copyFrom(hit.point);
          beam.mesh.position.copyFrom(hit.point);
          impacts.push({
            beamId: beam.id,
            sourceId: beam.sourceId,
            hit
          });
          disposeBeam(beam);
          continue;
        }

        beam.position.copyFrom(nextPosition);
        beam.mesh.position.copyFrom(nextPosition);
        beam.remainingLifetime -= travelSeconds;
        if (beam.remainingLifetime <= SEGMENT_LENGTH_EPSILON) {
          expirations.push({
            beamId: beam.id,
            sourceId: beam.sourceId,
            position: beam.position.clone()
          });
          disposeBeam(beam);
        }
      }

      return { impacts, expirations };
    },
    getActiveBeams: () => {
      requireActiveSystem();
      return [...activeBeams.values()].map((beam) => ({
        id: beam.id,
        sourceId: beam.sourceId,
        position: beam.position.clone(),
        velocity: beam.velocity.clone(),
        remainingLifetime: beam.remainingLifetime
      }));
    },
    clear: () => {
      requireActiveSystem();
      for (const beam of [...activeBeams.values()]) {
        disposeBeam(beam);
      }
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      for (const beam of [...activeBeams.values()]) {
        disposeBeam(beam);
      }
      material.dispose();
      disposed = true;
    }
  };
  return system;
};
