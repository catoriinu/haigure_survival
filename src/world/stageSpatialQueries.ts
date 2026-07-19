import { Mesh, Ray, Scene, Vector3, VertexBuffer } from "@babylonjs/core";

import type { StageMoverKind } from "./stageLinks";

export const STAGE_VOLUME_ROLES = [
  "npc_spawn",
  "bit_spawn",
  "assembly",
  "no_enemy_spawn",
  "no_enemy_enter",
  "no_combat",
  "hazard"
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
  meshSet: ReadonlySet<Mesh>,
  from: Vector3,
  to: Vector3
): SpatialHit | null => {
  const distance = Vector3.Distance(from, to);
  if (distance === 0) {
    return null;
  }

  const direction = to.subtract(from).scaleInPlace(1 / distance);
  const pick = scene.pickWithRay(
    new Ray(from, direction, distance),
    (mesh) => mesh instanceof Mesh && meshSet.has(mesh),
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
  const movementColliderSets: Readonly<Record<StageMoverKind, ReadonlySet<Mesh>>> =
    Object.freeze({
      player: new Set(options.movementColliders.player),
      npc: new Set(options.movementColliders.npc),
      bit: new Set(options.movementColliders.bit)
    });
  const groundColliderSet = new Set(options.groundColliders);
  const beamBlockerSet = new Set(options.beamBlockers);
  const sightBlockerSet = new Set(options.sightBlockers);
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
      castSegment(scene, movementColliderSets[moverKind], from, to),
    castBeamSegment: (from, to) => castSegment(scene, beamBlockerSet, from, to),
    castSightSegment: (from, to) => castSegment(scene, sightBlockerSet, from, to),
    sampleGround: (origin, maxDistance) => {
      const picks = scene.multiPickWithRay(
        new Ray(origin, Vector3.Down(), maxDistance),
        (mesh) => mesh instanceof Mesh && groundColliderSet.has(mesh)
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
