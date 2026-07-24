import { Mesh, Ray, Scene, Vector3, VertexBuffer } from "@babylonjs/core";

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
  mesh: Mesh;
}>;

export type SpatialHit = Readonly<{
  point: Vector3;
  normal: Vector3;
  distance: number;
  mesh: Mesh;
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
  castBeamSegment(from: Vector3, to: Vector3): SpatialHit | null;
  castSightSegment(from: Vector3, to: Vector3): SpatialHit | null;
  sampleGround(origin: Vector3, maxDistance: number): SpatialHit | null;
  containsVolume(role: StageVolumeRole, point: Vector3): boolean;
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

type StaticMeshSpatialIndex = Readonly<{
  query(from: Vector3, to: Vector3): ReadonlySet<Mesh>;
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

  return Object.freeze({
    query: (from, to) => {
      const minimumCellX = Math.floor(
        Math.min(from.x, to.x) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellX = Math.floor(
        Math.max(from.x, to.x) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellY = Math.floor(
        Math.min(from.y, to.y) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellY = Math.floor(
        Math.max(from.y, to.y) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const minimumCellZ = Math.floor(
        Math.min(from.z, to.z) / STATIC_MESH_SPATIAL_CELL_SIZE
      );
      const maximumCellZ = Math.floor(
        Math.max(from.z, to.z) / STATIC_MESH_SPATIAL_CELL_SIZE
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
    }
  });
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

const createContainsPointQuery = (mesh: Mesh) => {
  const triangles = buildWorldTriangles(mesh);
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

export const createStageSpatialQueries = (
  scene: Scene,
  options: StageSpatialQueryOptions
): StageSpatialQueries => {
  const movementColliderIndices: Readonly<
    Record<StageMoverKind, StaticMeshSpatialIndex>
  > =
    Object.freeze({
      player: createStaticMeshSpatialIndex(options.movementColliders.player),
      npc: createStaticMeshSpatialIndex(options.movementColliders.npc),
      bit: createStaticMeshSpatialIndex(options.movementColliders.bit)
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

  return {
    castMovementSegment: (moverKind, from, to) =>
      castSegment(scene, movementColliderIndices[moverKind], from, to),
    castBeamSegment: (from, to) =>
      castSegment(scene, beamBlockerIndex, from, to),
    castSightSegment: (from, to) =>
      castSegment(scene, sightBlockerIndex, from, to),
    sampleGround: (origin, maxDistance) => {
      const groundEnd = origin.add(Vector3.Down().scale(maxDistance));
      const candidateSet = groundColliderIndex.query(origin, groundEnd);
      const picks = scene.multiPickWithRay(
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
    containsVolume: (role, point) =>
      volumesByRole.get(role)!.some((volume) =>
        containsByVolume.get(volume)!(point)
      )
  };
};

export const createStageBoundaryContainsQuery = (boundaryMesh: Mesh) =>
  createContainsPointQuery(boundaryMesh);
