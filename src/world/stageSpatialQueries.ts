import { Mesh, Ray, Scene, Vector3, VertexBuffer } from "@babylonjs/core";

import type { BitFlightBandRef } from "./bitFlightNavigation";
import type { StageMoverKind } from "./stageLinks";

export const STAGE_VOLUME_ROLES = [
  "npc_spawn",
  "bit_spawn",
  "assembly",
  "no_enemy_spawn",
  "no_enemy_enter",
  "no_combat",
  "hazard",
  "water"
] as const;

export type StageVolumeRole = (typeof STAGE_VOLUME_ROLES)[number];

export type StageVolume = Readonly<{
  id: string;
  role: StageVolumeRole;
  bitFlightBand: BitFlightBandRef | null;
  mesh: Mesh;
}>;

export type SpatialHit = Readonly<{
  point: Vector3;
  normal: Vector3;
  distance: number;
  mesh: Mesh;
}>;

export type SpatialSphereSweepHit = SpatialHit &
  Readonly<{
    center: Vector3;
    fraction: number;
  }>;

export type StageMovementColliderSets = Readonly<
  Record<StageMoverKind, readonly Mesh[]>
>;

export interface StageSpatialQueries {
  castMovementSegment(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3
  ): SpatialHit | null;
  castMovementSphere(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3,
    radius: number
  ): SpatialSphereSweepHit | null;
  castBeamSegment(from: Vector3, to: Vector3): SpatialHit | null;
  castSightSegment(from: Vector3, to: Vector3): SpatialHit | null;
  sampleGround(origin: Vector3, maxDistance: number): SpatialHit | null;
  containsVolume(role: StageVolumeRole, point: Vector3): boolean;
  dispose(): void;
}

export type StageSpatialQueryOptions = Readonly<{
  movementColliders: StageMovementColliderSets;
  groundColliders: readonly Mesh[];
  beamBlockers: readonly Mesh[];
  sightBlockers: readonly Mesh[];
  volumes: readonly StageVolume[];
}>;

const SURFACE_DISTANCE_EPSILON = 1e-6;
const INSIDE_SOLID_ANGLE_THRESHOLD = Math.PI * 2;
const STATIC_MESH_SPATIAL_CELL_SIZE = 2;
const SWEEP_TIME_EPSILON = 1e-9;
const SWEEP_DISTANCE_EPSILON = 1e-9;
const KNOWN_SAFE_CENTER_CACHE_MAX_ENTRIES = 16_384;

type StaticMeshSpatialIndex = Readonly<{
  query(from: Vector3, to: Vector3, padding?: number): ReadonlySet<Mesh>;
  dispose(): void;
}>;

const spatialCellKey = (x: number, y: number, z: number) => `${x}:${y}:${z}`;

const createStaticMeshSpatialIndex = (
  meshes: readonly Mesh[]
): StaticMeshSpatialIndex => {
  const cells = new Map<string, Mesh[]>();
  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const minimum = bounds.minimumWorld;
    const maximum = bounds.maximumWorld;
    const minimumCellX = Math.floor(minimum.x / STATIC_MESH_SPATIAL_CELL_SIZE);
    const maximumCellX = Math.floor(maximum.x / STATIC_MESH_SPATIAL_CELL_SIZE);
    const minimumCellY = Math.floor(minimum.y / STATIC_MESH_SPATIAL_CELL_SIZE);
    const maximumCellY = Math.floor(maximum.y / STATIC_MESH_SPATIAL_CELL_SIZE);
    const minimumCellZ = Math.floor(minimum.z / STATIC_MESH_SPATIAL_CELL_SIZE);
    const maximumCellZ = Math.floor(maximum.z / STATIC_MESH_SPATIAL_CELL_SIZE);
    for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
      for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
        for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
          const key = spatialCellKey(cellX, cellY, cellZ);
          const cell = cells.get(key) ?? [];
          cell.push(mesh);
          cells.set(key, cell);
        }
      }
    }
  }

  const index: StaticMeshSpatialIndex = {
    query: (from, to, padding = 0) => {
      const minimumCellX = Math.floor(
        (Math.min(from.x, to.x) - padding) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellX = Math.floor(
        (Math.max(from.x, to.x) + padding) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellY = Math.floor(
        (Math.min(from.y, to.y) - padding) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellY = Math.floor(
        (Math.max(from.y, to.y) + padding) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellZ = Math.floor(
        (Math.min(from.z, to.z) - padding) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellZ = Math.floor(
        (Math.max(from.z, to.z) + padding) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const candidates = new Set<Mesh>();
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
          for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
            const cell =
              cells.get(spatialCellKey(cellX, cellY, cellZ)) ?? [];
            for (const mesh of cell) {
              candidates.add(mesh);
            }
          }
        }
      }
      return candidates;
    },
    dispose: () => {
      cells.clear();
    }
  };
  return Object.freeze(index);
};

const toSpatialHit = (
  pickedPoint: Vector3,
  pickedNormal: Vector3,
  distance: number,
  pickedMesh: Mesh
): SpatialHit => ({
  point: pickedPoint.clone(),
  normal: pickedNormal.clone(),
  distance,
  mesh: pickedMesh
});

const castSegment = (
  scene: Scene,
  spatialIndex: StaticMeshSpatialIndex,
  from: Vector3,
  to: Vector3
): SpatialHit | null => {
  const distance = Vector3.Distance(from, to);
  if (distance === 0) {
    return null;
  }

  const direction = to.subtract(from).scaleInPlace(1 / distance);
  const candidateSet = spatialIndex.query(from, to);
  const pick = scene.pickWithRay(
    new Ray(from, direction, distance),
    (mesh) => mesh instanceof Mesh && candidateSet.has(mesh),
    false
  );
  if (!pick?.hit || !(pick.pickedMesh instanceof Mesh) || !pick.pickedPoint) {
    return null;
  }

  const normal = pick.getNormal(true, true);
  if (!normal) {
    throw new Error(`空間問い合わせで面法線を取得できません: ${pick.pickedMesh.name}`);
  }
  return toSpatialHit(pick.pickedPoint, normal, pick.distance, pick.pickedMesh);
};

type WorldTriangle = readonly [Vector3, Vector3, Vector3];

const buildWorldTriangles = (mesh: Mesh): readonly WorldTriangle[] => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices || indices.length % 3 !== 0) {
    throw new Error(`閉じた三角形Meshが必要です: ${mesh.name}`);
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
  return triangles;
};

type IndexedWorldTriangle = Readonly<{
  mesh: Mesh;
  triangle: WorldTriangle;
  triangleIndex: number;
  minimumX: number;
  minimumY: number;
  minimumZ: number;
  maximumX: number;
  maximumY: number;
  maximumZ: number;
}>;

type StaticTriangleSpatialIndex = Readonly<{
  query(
    from: Vector3,
    to: Vector3,
    padding: number,
    allowedMeshes: ReadonlySet<Mesh>
  ): ReadonlyMap<Mesh, readonly IndexedWorldTriangle[]>;
  dispose(): void;
}>;

type KnownSafeCenterCache = Readonly<{
  has(
    moverKind: StageMoverKind,
    radius: number,
    position: Vector3
  ): boolean;
  add(
    moverKind: StageMoverKind,
    radius: number,
    position: Vector3
  ): void;
  dispose(): void;
}>;

const exactNumberKey = (value: number) =>
  Object.is(value, -0) ? "-0" : value.toString();

const knownSafeCenterKey = (
  moverKind: StageMoverKind,
  radius: number,
  position: Vector3
) =>
  `${moverKind}|${exactNumberKey(radius)}|${exactNumberKey(position.x)}|` +
  `${exactNumberKey(position.y)}|${exactNumberKey(position.z)}`;

const createKnownSafeCenterCache = (): KnownSafeCenterCache => {
  const entries = new Map<string, true>();
  const cache: KnownSafeCenterCache = {
    has: (moverKind, radius, position) => {
      const key = knownSafeCenterKey(moverKind, radius, position);
      if (!entries.has(key)) {
        return false;
      }
      entries.delete(key);
      entries.set(key, true);
      return true;
    },
    add: (moverKind, radius, position) => {
      const key = knownSafeCenterKey(moverKind, radius, position);
      if (entries.has(key)) {
        entries.delete(key);
      }
      entries.set(key, true);
      if (entries.size > KNOWN_SAFE_CENTER_CACHE_MAX_ENTRIES) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) {
          entries.delete(oldestKey);
        }
      }
    },
    dispose: () => {
      entries.clear();
    }
  };
  return Object.freeze(cache);
};

const createStaticTriangleSpatialIndex = (
  trianglesByMesh: ReadonlyMap<Mesh, readonly WorldTriangle[]>
): StaticTriangleSpatialIndex => {
  const cells = new Map<string, IndexedWorldTriangle[]>();
  for (const [mesh, triangles] of trianglesByMesh) {
    triangles.forEach((triangle, triangleIndex) => {
      const firstEdge = triangle[1].subtract(triangle[0]);
      const secondEdge = triangle[2].subtract(triangle[0]);
      const toleranceX =
        2 *
        SURFACE_DISTANCE_EPSILON *
        (Math.abs(firstEdge.x) + Math.abs(secondEdge.x));
      const toleranceY =
        2 *
        SURFACE_DISTANCE_EPSILON *
        (Math.abs(firstEdge.y) + Math.abs(secondEdge.y));
      const toleranceZ =
        2 *
        SURFACE_DISTANCE_EPSILON *
        (Math.abs(firstEdge.z) + Math.abs(secondEdge.z));
      const minimumX =
        Math.min(triangle[0].x, triangle[1].x, triangle[2].x) -
        toleranceX;
      const minimumY =
        Math.min(triangle[0].y, triangle[1].y, triangle[2].y) -
        toleranceY;
      const minimumZ =
        Math.min(triangle[0].z, triangle[1].z, triangle[2].z) -
        toleranceZ;
      const maximumX =
        Math.max(triangle[0].x, triangle[1].x, triangle[2].x) +
        toleranceX;
      const maximumY =
        Math.max(triangle[0].y, triangle[1].y, triangle[2].y) +
        toleranceY;
      const maximumZ =
        Math.max(triangle[0].z, triangle[1].z, triangle[2].z) +
        toleranceZ;
      const indexedTriangle: IndexedWorldTriangle = Object.freeze({
        mesh,
        triangle,
        triangleIndex,
        minimumX,
        minimumY,
        minimumZ,
        maximumX,
        maximumY,
        maximumZ
      });
      const minimumCellX = Math.floor(
        minimumX / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellX = Math.floor(
        maximumX / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellY = Math.floor(
        minimumY / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellY = Math.floor(
        maximumY / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellZ = Math.floor(
        minimumZ / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellZ = Math.floor(
        maximumZ / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
          for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
            const key = spatialCellKey(cellX, cellY, cellZ);
            const cell = cells.get(key) ?? [];
            cell.push(indexedTriangle);
            cells.set(key, cell);
          }
        }
      }
    });
  }

  const index: StaticTriangleSpatialIndex = {
    query: (from, to, padding, allowedMeshes) => {
      const minimumX =
        Math.min(from.x, to.x) - padding - SWEEP_DISTANCE_EPSILON;
      const minimumY =
        Math.min(from.y, to.y) - padding - SWEEP_DISTANCE_EPSILON;
      const minimumZ =
        Math.min(from.z, to.z) - padding - SWEEP_DISTANCE_EPSILON;
      const maximumX =
        Math.max(from.x, to.x) + padding + SWEEP_DISTANCE_EPSILON;
      const maximumY =
        Math.max(from.y, to.y) + padding + SWEEP_DISTANCE_EPSILON;
      const maximumZ =
        Math.max(from.z, to.z) + padding + SWEEP_DISTANCE_EPSILON;
      const minimumCellX = Math.floor(
        minimumX / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellX = Math.floor(
        maximumX / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellY = Math.floor(
        minimumY / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellY = Math.floor(
        maximumY / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellZ = Math.floor(
        minimumZ / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellZ = Math.floor(
        maximumZ / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const seen = new Set<IndexedWorldTriangle>();
      const candidatesByMesh = new Map<Mesh, IndexedWorldTriangle[]>();
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
        for (let cellY = minimumCellY; cellY <= maximumCellY; cellY += 1) {
          for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
            const cell =
              cells.get(spatialCellKey(cellX, cellY, cellZ)) ?? [];
            for (const candidate of cell) {
              if (
                seen.has(candidate) ||
                !allowedMeshes.has(candidate.mesh)
              ) {
                continue;
              }
              seen.add(candidate);
              if (
                candidate.maximumX < minimumX ||
                candidate.minimumX > maximumX ||
                candidate.maximumY < minimumY ||
                candidate.minimumY > maximumY ||
                candidate.maximumZ < minimumZ ||
                candidate.minimumZ > maximumZ
              ) {
                continue;
              }
              const meshCandidates =
                candidatesByMesh.get(candidate.mesh) ?? [];
              meshCandidates.push(candidate);
              candidatesByMesh.set(candidate.mesh, meshCandidates);
            }
          }
        }
      }
      return candidatesByMesh;
    },
    dispose: () => {
      cells.clear();
    }
  };
  return Object.freeze(index);
};

type SphereSweepCandidate = Readonly<{
  center: Vector3;
  point: Vector3;
  normal: Vector3;
  fraction: number;
}>;

const clampSweepFraction = (fraction: number) =>
  Math.min(1, Math.max(0, fraction));

const isSweepFraction = (fraction: number) =>
  fraction >= -SWEEP_TIME_EPSILON &&
  fraction <= 1 + SWEEP_TIME_EPSILON;

const solveQuadratic = (
  quadratic: number,
  linear: number,
  constant: number
): readonly number[] => {
  if (Math.abs(quadratic) <= SWEEP_DISTANCE_EPSILON) {
    if (Math.abs(linear) <= SWEEP_DISTANCE_EPSILON) {
      return Object.freeze([]);
    }
    return Object.freeze([-constant / linear]);
  }
  const discriminant = linear * linear - 4 * quadratic * constant;
  if (discriminant < -SWEEP_DISTANCE_EPSILON) {
    return Object.freeze([]);
  }
  const squareRoot = Math.sqrt(Math.max(0, discriminant));
  const first = (-linear - squareRoot) / (2 * quadratic);
  const second = (-linear + squareRoot) / (2 * quadratic);
  return first <= second
    ? Object.freeze([first, second])
    : Object.freeze([second, first]);
};

const createContactNormal = (
  center: Vector3,
  point: Vector3,
  triangleNormal: Vector3,
  movement: Vector3
) => {
  const offset = center.subtract(point);
  if (offset.lengthSquared() > SWEEP_DISTANCE_EPSILON) {
    return offset.normalize();
  }
  const normal = triangleNormal.clone();
  if (Vector3.Dot(normal, movement) > 0) {
    normal.scaleInPlace(-1);
  }
  return normal;
};

const isPointInTriangle = (
  point: Vector3,
  first: Vector3,
  second: Vector3,
  third: Vector3
) => {
  const edgeFirst = second.subtract(first);
  const edgeSecond = third.subtract(first);
  const relative = point.subtract(first);
  const dotFirstFirst = Vector3.Dot(edgeFirst, edgeFirst);
  const dotFirstSecond = Vector3.Dot(edgeFirst, edgeSecond);
  const dotSecondSecond = Vector3.Dot(edgeSecond, edgeSecond);
  const dotRelativeFirst = Vector3.Dot(relative, edgeFirst);
  const dotRelativeSecond = Vector3.Dot(relative, edgeSecond);
  const denominator =
    dotFirstFirst * dotSecondSecond - dotFirstSecond * dotFirstSecond;
  if (Math.abs(denominator) <= SWEEP_DISTANCE_EPSILON) {
    return false;
  }
  const firstCoordinate =
    (dotSecondSecond * dotRelativeFirst -
      dotFirstSecond * dotRelativeSecond) /
    denominator;
  const secondCoordinate =
    (dotFirstFirst * dotRelativeSecond -
      dotFirstSecond * dotRelativeFirst) /
    denominator;
  return (
    firstCoordinate >= -SURFACE_DISTANCE_EPSILON &&
    secondCoordinate >= -SURFACE_DISTANCE_EPSILON &&
    firstCoordinate + secondCoordinate <= 1 + SURFACE_DISTANCE_EPSILON
  );
};

const collectFaceSweepCandidates = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  triangle: WorldTriangle,
  candidates: SphereSweepCandidate[]
) => {
  const [first, second, third] = triangle;
  const triangleNormal = Vector3.Cross(
    second.subtract(first),
    third.subtract(first)
  );
  if (triangleNormal.lengthSquared() <= SWEEP_DISTANCE_EPSILON) {
    return;
  }
  triangleNormal.normalize();
  const startDistance = Vector3.Dot(from.subtract(first), triangleNormal);
  const movementDistance = Vector3.Dot(movement, triangleNormal);
  if (Math.abs(movementDistance) <= SWEEP_DISTANCE_EPSILON) {
    return;
  }
  for (const signedRadius of [radius, -radius]) {
    const rawFraction =
      (signedRadius - startDistance) / movementDistance;
    if (!isSweepFraction(rawFraction)) {
      continue;
    }
    const fraction = clampSweepFraction(rawFraction);
    const center = from.add(movement.scale(fraction));
    const point = center.subtract(triangleNormal.scale(signedRadius));
    if (!isPointInTriangle(point, first, second, third)) {
      continue;
    }
    candidates.push({
      center,
      point,
      normal:
        signedRadius >= 0
          ? triangleNormal.clone()
          : triangleNormal.scale(-1),
      fraction
    });
  }
};

const collectEdgeSweepCandidates = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  edgeStart: Vector3,
  edgeEnd: Vector3,
  triangleNormal: Vector3,
  candidates: SphereSweepCandidate[]
) => {
  const edge = edgeEnd.subtract(edgeStart);
  const edgeLengthSquared = edge.lengthSquared();
  if (edgeLengthSquared <= SWEEP_DISTANCE_EPSILON) {
    return;
  }
  const startRelative = from.subtract(edgeStart);
  const startProjection =
    Vector3.Dot(startRelative, edge) / edgeLengthSquared;
  const movementProjection =
    Vector3.Dot(movement, edge) / edgeLengthSquared;
  const perpendicularStart = startRelative.subtract(
    edge.scale(startProjection)
  );
  const perpendicularMovement = movement.subtract(
    edge.scale(movementProjection)
  );
  const roots = solveQuadratic(
    perpendicularMovement.lengthSquared(),
    2 * Vector3.Dot(perpendicularStart, perpendicularMovement),
    perpendicularStart.lengthSquared() - radius * radius
  );
  for (const rawFraction of roots) {
    if (!isSweepFraction(rawFraction)) {
      continue;
    }
    const fraction = clampSweepFraction(rawFraction);
    const edgeFraction =
      startProjection + movementProjection * fraction;
    if (
      edgeFraction < -SURFACE_DISTANCE_EPSILON ||
      edgeFraction > 1 + SURFACE_DISTANCE_EPSILON
    ) {
      continue;
    }
    const center = from.add(movement.scale(fraction));
    const point = edgeStart.add(
      edge.scale(Math.min(1, Math.max(0, edgeFraction)))
    );
    candidates.push({
      center,
      point,
      normal: createContactNormal(
        center,
        point,
        triangleNormal,
        movement
      ),
      fraction
    });
  }
};

const collectVertexSweepCandidates = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  vertex: Vector3,
  triangleNormal: Vector3,
  candidates: SphereSweepCandidate[]
) => {
  const relative = from.subtract(vertex);
  const roots = solveQuadratic(
    movement.lengthSquared(),
    2 * Vector3.Dot(relative, movement),
    relative.lengthSquared() - radius * radius
  );
  for (const rawFraction of roots) {
    if (!isSweepFraction(rawFraction)) {
      continue;
    }
    const fraction = clampSweepFraction(rawFraction);
    const center = from.add(movement.scale(fraction));
    candidates.push({
      center,
      point: vertex.clone(),
      normal: createContactNormal(
        center,
        vertex,
        triangleNormal,
        movement
      ),
      fraction
    });
  }
};

const findInitialSphereTriangleContact = (
  center: Vector3,
  movement: Vector3,
  radius: number,
  triangle: WorldTriangle
): SphereSweepCandidate | null => {
  const projectedPoint = Vector3.Zero();
  Vector3.ProjectOnTriangleToRef(center, ...triangle, projectedPoint);
  if (
    Vector3.DistanceSquared(center, projectedPoint) >
    radius * radius + SWEEP_DISTANCE_EPSILON
  ) {
    return null;
  }
  const triangleNormal = Vector3.Cross(
    triangle[1].subtract(triangle[0]),
    triangle[2].subtract(triangle[0])
  );
  if (triangleNormal.lengthSquared() <= SWEEP_DISTANCE_EPSILON) {
    return null;
  }
  triangleNormal.normalize();
  return {
    center: center.clone(),
    point: projectedPoint.clone(),
    normal: createContactNormal(
      center,
      projectedPoint,
      triangleNormal,
      movement
    ),
    fraction: 0
  };
};

const findSphereTriangleSweep = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  triangle: WorldTriangle
): SphereSweepCandidate | null => {
  const initialContact = findInitialSphereTriangleContact(
    from,
    movement,
    radius,
    triangle
  );
  if (initialContact) {
    return initialContact;
  }
  if (movement.lengthSquared() <= SWEEP_DISTANCE_EPSILON) {
    return null;
  }

  const [first, second, third] = triangle;
  const triangleNormal = Vector3.Cross(
    second.subtract(first),
    third.subtract(first)
  );
  if (triangleNormal.lengthSquared() <= SWEEP_DISTANCE_EPSILON) {
    return null;
  }
  triangleNormal.normalize();
  const candidates: SphereSweepCandidate[] = [];
  collectFaceSweepCandidates(
    from,
    movement,
    radius,
    triangle,
    candidates
  );
  collectEdgeSweepCandidates(
    from,
    movement,
    radius,
    first,
    second,
    triangleNormal,
    candidates
  );
  collectEdgeSweepCandidates(
    from,
    movement,
    radius,
    second,
    third,
    triangleNormal,
    candidates
  );
  collectEdgeSweepCandidates(
    from,
    movement,
    radius,
    third,
    first,
    triangleNormal,
    candidates
  );
  collectVertexSweepCandidates(
    from,
    movement,
    radius,
    first,
    triangleNormal,
    candidates
  );
  collectVertexSweepCandidates(
    from,
    movement,
    radius,
    second,
    triangleNormal,
    candidates
  );
  collectVertexSweepCandidates(
    from,
    movement,
    radius,
    third,
    triangleNormal,
    candidates
  );
  candidates.sort((left, right) => left.fraction - right.fraction);
  return candidates[0] ?? null;
};

const calculateSolidAngle = (
  point: Vector3,
  [first, second, third]: WorldTriangle
) => {
  const ax = first.x - point.x;
  const ay = first.y - point.y;
  const az = first.z - point.z;
  const bx = second.x - point.x;
  const by = second.y - point.y;
  const bz = second.z - point.z;
  const cx = third.x - point.x;
  const cy = third.y - point.y;
  const cz = third.z - point.z;
  const firstLength = Math.hypot(ax, ay, az);
  const secondLength = Math.hypot(bx, by, bz);
  const thirdLength = Math.hypot(cx, cy, cz);
  const numerator =
    ax * (by * cz - bz * cy) +
    ay * (bz * cx - bx * cz) +
    az * (bx * cy - by * cx);
  const denominator =
    firstLength * secondLength * thirdLength +
    (ax * bx + ay * by + az * bz) * thirdLength +
    (bx * cx + by * cy + bz * cz) * firstLength +
    (cx * ax + cy * ay + cz * az) * secondLength;
  return 2 * Math.atan2(numerator, denominator);
};

const createContainsPointQueryFromTriangles = (
  triangles: readonly WorldTriangle[]
) => {
  const projectedPoint = Vector3.Zero();
  return (point: Vector3): boolean => {
    let solidAngle = 0;
    for (const triangle of triangles) {
      const distanceToSurface = Vector3.ProjectOnTriangleToRef(
        point,
        ...triangle,
        projectedPoint
      );
      if (distanceToSurface <= SURFACE_DISTANCE_EPSILON) {
        return true;
      }
      solidAngle += calculateSolidAngle(point, triangle);
    }
    return Math.abs(solidAngle) > INSIDE_SOLID_ANGLE_THRESHOLD;
  };
};

const createContainsPointQuery = (mesh: Mesh) =>
  createContainsPointQueryFromTriangles(buildWorldTriangles(mesh));

const segmentIntersectsTriangleBoundary = (
  from: Vector3,
  to: Vector3,
  [first, second, third]: WorldTriangle
) => {
  const movement = to.subtract(from);
  const firstEdge = second.subtract(first);
  const secondEdge = third.subtract(first);
  const cross = Vector3.Cross(movement, secondEdge);
  const determinant = Vector3.Dot(firstEdge, cross);
  if (Math.abs(determinant) <= SURFACE_DISTANCE_EPSILON) {
    return false;
  }
  const inverseDeterminant = 1 / determinant;
  const fromFirst = from.subtract(first);
  const firstCoordinate =
    Vector3.Dot(fromFirst, cross) * inverseDeterminant;
  if (
    firstCoordinate < -SURFACE_DISTANCE_EPSILON ||
    firstCoordinate > 1 + SURFACE_DISTANCE_EPSILON
  ) {
    return false;
  }
  const secondCross = Vector3.Cross(fromFirst, firstEdge);
  const secondCoordinate =
    Vector3.Dot(movement, secondCross) * inverseDeterminant;
  if (
    secondCoordinate < -SURFACE_DISTANCE_EPSILON ||
    firstCoordinate + secondCoordinate >
      1 + SURFACE_DISTANCE_EPSILON
  ) {
    return false;
  }
  const fraction =
    Vector3.Dot(secondEdge, secondCross) * inverseDeterminant;
  return (
    fraction > SURFACE_DISTANCE_EPSILON &&
    fraction < 1 - SURFACE_DISTANCE_EPSILON
  );
};

const createContainsSegmentQueryFromTriangles = (
  triangles: readonly WorldTriangle[]
) => {
  const contains = createContainsPointQueryFromTriangles(triangles);
  return (from: Vector3, to: Vector3): boolean => {
    if (!contains(from) || !contains(to)) {
      return false;
    }
    return !triangles.some((triangle) =>
      segmentIntersectsTriangleBoundary(from, to, triangle)
    );
  };
};

const findNearestTrianglePoint = (
  point: Vector3,
  triangles: readonly WorldTriangle[]
) => {
  const projectedPoint = Vector3.Zero();
  let nearest:
    | Readonly<{ point: Vector3; triangle: WorldTriangle; distanceSquared: number }>
    | null = null;
  for (const triangle of triangles) {
    Vector3.ProjectOnTriangleToRef(point, ...triangle, projectedPoint);
    const distanceSquared = Vector3.DistanceSquared(point, projectedPoint);
    if (!nearest || distanceSquared < nearest.distanceSquared) {
      nearest = {
        point: projectedPoint.clone(),
        triangle,
        distanceSquared
      };
    }
  }
  return nearest;
};

const castSphere = (
  moverKind: StageMoverKind,
  spatialIndex: StaticMeshSpatialIndex,
  triangleSpatialIndex: StaticTriangleSpatialIndex,
  allowedMeshes: ReadonlySet<Mesh>,
  knownSafeCenterCache: KnownSafeCenterCache,
  trianglesByMesh: ReadonlyMap<Mesh, readonly WorldTriangle[]>,
  containsByMesh: ReadonlyMap<Mesh, (point: Vector3) => boolean>,
  from: Vector3,
  to: Vector3,
  radius: number
): SpatialSphereSweepHit | null => {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("球包絡の半径には正の有限値が必要です。");
  }
  const movement = to.subtract(from);
  const movementDistance = movement.length();
  const candidateMeshes = spatialIndex.query(from, to, radius);
  const startIsKnownSafe = knownSafeCenterCache.has(
    moverKind,
    radius,
    from
  );
  const candidateTrianglesByMesh = triangleSpatialIndex.query(
    from,
    to,
    radius,
    allowedMeshes
  );
  let nearest:
    | Readonly<{ candidate: SphereSweepCandidate; mesh: Mesh }>
    | null = null;

  for (const mesh of candidateMeshes) {
    const triangles = trianglesByMesh.get(mesh);
    const contains = containsByMesh.get(mesh);
    if (!triangles || !contains) {
      throw new Error(`移動Colliderの空間データがありません: ${mesh.name}`);
    }
    let candidate: SphereSweepCandidate | null = null;
    let candidateTriangleIndex = Number.POSITIVE_INFINITY;
    for (const indexedTriangle of candidateTrianglesByMesh.get(mesh) ?? []) {
      const triangleCandidate = findSphereTriangleSweep(
        from,
        movement,
        radius,
        indexedTriangle.triangle
      );
      if (
        triangleCandidate &&
        (!candidate ||
          triangleCandidate.fraction < candidate.fraction ||
          (triangleCandidate.fraction === candidate.fraction &&
            indexedTriangle.triangleIndex < candidateTriangleIndex))
      ) {
        candidate = triangleCandidate;
        candidateTriangleIndex = indexedTriangle.triangleIndex;
      }
    }

    if (!candidate && !startIsKnownSafe && contains(from)) {
      const nearestPoint = findNearestTrianglePoint(from, triangles);
      if (!nearestPoint) {
        throw new Error(`移動Colliderに三角形がありません: ${mesh.name}`);
      }
      const triangleNormal = Vector3.Cross(
        nearestPoint.triangle[1].subtract(nearestPoint.triangle[0]),
        nearestPoint.triangle[2].subtract(nearestPoint.triangle[0])
      ).normalize();
      candidate = {
        center: from.clone(),
        point: nearestPoint.point,
        normal: createContactNormal(
          from,
          nearestPoint.point,
          triangleNormal,
          movement
        ),
        fraction: 0
      };
    }

    if (
      candidate &&
      (!nearest || candidate.fraction < nearest.candidate.fraction)
    ) {
      nearest = { candidate, mesh };
    }
  }

  if (!nearest) {
    knownSafeCenterCache.add(moverKind, radius, from);
    knownSafeCenterCache.add(moverKind, radius, to);
    return null;
  }
  return {
    point: nearest.candidate.point.clone(),
    normal: nearest.candidate.normal.clone(),
    distance: movementDistance * nearest.candidate.fraction,
    mesh: nearest.mesh,
    center: nearest.candidate.center.clone(),
    fraction: nearest.candidate.fraction
  };
};

export const createStageSpatialQueries = (
  scene: Scene,
  options: StageSpatialQueryOptions
): StageSpatialQueries => {
  let activeScene: Scene | null = scene;
  const requireActiveScene = () => {
    if (!activeScene) {
      throw new Error("破棄済みのStageSpatialQueriesは使用できません。");
    }
    return activeScene;
  };
  const movementColliderIndices: Readonly<
    Record<StageMoverKind, StaticMeshSpatialIndex>
  > =
    Object.freeze({
      player: createStaticMeshSpatialIndex(options.movementColliders.player),
      npc: createStaticMeshSpatialIndex(options.movementColliders.npc),
      bit: createStaticMeshSpatialIndex(options.movementColliders.bit)
    });
  const movementColliderMeshes = new Set<Mesh>([
    ...options.movementColliders.player,
    ...options.movementColliders.npc,
    ...options.movementColliders.bit
  ]);
  const movementTrianglesByMesh = new Map<
    Mesh,
    readonly WorldTriangle[]
  >();
  const movementContainsByMesh = new Map<
    Mesh,
    (point: Vector3) => boolean
  >();
  for (const mesh of movementColliderMeshes) {
    const triangles = buildWorldTriangles(mesh);
    movementTrianglesByMesh.set(mesh, triangles);
    movementContainsByMesh.set(
      mesh,
      createContainsPointQueryFromTriangles(triangles)
    );
  }
  const movementTriangleIndex = createStaticTriangleSpatialIndex(
    movementTrianglesByMesh
  );
  const knownSafeCenterCache = createKnownSafeCenterCache();
  const movementColliderMeshSets: Readonly<
    Record<StageMoverKind, Set<Mesh>>
  > = Object.freeze({
    player: new Set(options.movementColliders.player),
    npc: new Set(options.movementColliders.npc),
    bit: new Set(options.movementColliders.bit)
  });
  const groundColliderIndex = createStaticMeshSpatialIndex(
    options.groundColliders
  );
  const beamBlockerIndex = createStaticMeshSpatialIndex(options.beamBlockers);
  const sightBlockerIndex = createStaticMeshSpatialIndex(options.sightBlockers);
  const volumesByRole = new Map<StageVolumeRole, StageVolume[]>(
    STAGE_VOLUME_ROLES.map((role) => [role, []])
  );
  const containsByVolume = new Map<StageVolume, (point: Vector3) => boolean>();
  for (const volume of options.volumes) {
    volumesByRole.get(volume.role)!.push(volume);
    containsByVolume.set(volume, createContainsPointQuery(volume.mesh));
  }

  const queries: StageSpatialQueries = {
    castMovementSegment: (moverKind, from, to) =>
      castSegment(
        requireActiveScene(),
        movementColliderIndices[moverKind],
        from,
        to
      ),
    castMovementSphere: (moverKind, from, to, radius) => {
      requireActiveScene();
      return castSphere(
        moverKind,
        movementColliderIndices[moverKind],
        movementTriangleIndex,
        movementColliderMeshSets[moverKind],
        knownSafeCenterCache,
        movementTrianglesByMesh,
        movementContainsByMesh,
        from,
        to,
        radius
      );
    },
    castBeamSegment: (from, to) =>
      castSegment(requireActiveScene(), beamBlockerIndex, from, to),
    castSightSegment: (from, to) =>
      castSegment(requireActiveScene(), sightBlockerIndex, from, to),
    sampleGround: (origin, maxDistance) => {
      const currentScene = requireActiveScene();
      const groundEnd = origin.add(Vector3.Down().scale(maxDistance));
      const candidateSet = groundColliderIndex.query(origin, groundEnd);
      const picks = currentScene.multiPickWithRay(
        new Ray(origin, Vector3.Down(), maxDistance),
        (mesh) => mesh instanceof Mesh && candidateSet.has(mesh)
      );
      if (!picks) {
        return null;
      }

      const groundPicks = picks
        .filter(
          (pick) =>
            pick.hit && pick.pickedMesh instanceof Mesh && Boolean(pick.pickedPoint)
        )
        .map((pick) => ({ pick, normal: pick.getNormal(true, true) }))
        .filter(
          (candidate): candidate is typeof candidate & { normal: Vector3 } =>
            Boolean(candidate.normal && candidate.normal.y > 0)
        )
        .sort((left, right) => left.pick.distance - right.pick.distance);
      const nearest = groundPicks[0];
      if (
        !nearest ||
        !nearest.pick.pickedPoint ||
        !(nearest.pick.pickedMesh instanceof Mesh)
      ) {
        return null;
      }
      return toSpatialHit(
        nearest.pick.pickedPoint,
        nearest.normal,
        nearest.pick.distance,
        nearest.pick.pickedMesh
      );
    },
    containsVolume: (role, point) => {
      requireActiveScene();
      return volumesByRole.get(role)!.some((volume) =>
        containsByVolume.get(volume)!(point)
      );
    },
    dispose: () => {
      requireActiveScene();
      activeScene = null;
      for (const index of Object.values(movementColliderIndices)) {
        index.dispose();
      }
      movementTriangleIndex.dispose();
      knownSafeCenterCache.dispose();
      for (const meshSet of Object.values(movementColliderMeshSets)) {
        meshSet.clear();
      }
      groundColliderIndex.dispose();
      beamBlockerIndex.dispose();
      sightBlockerIndex.dispose();
      movementTrianglesByMesh.clear();
      movementContainsByMesh.clear();
      volumesByRole.clear();
      containsByVolume.clear();
    }
  };
  return Object.freeze(queries);
};

export const createStageBoundaryContainsQuery = (boundaryMesh: Mesh) =>
  createContainsPointQuery(boundaryMesh);

export const createStageVolumeContainsSegmentQuery = (volumeMesh: Mesh) =>
  createContainsSegmentQueryFromTriangles(buildWorldTriangles(volumeMesh));
