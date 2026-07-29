import {
  Matrix,
  Mesh,
  Ray,
  Scene,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import type { BitFlightBandRef } from "./bitFlightNavigation";
import {
  registerDynamicStageSpatialSnapshotResource,
  type DynamicStageSpatialSnapshot,
  type DynamicStageSpatialVariants
} from "./dynamicStageSpatialVariants";
import { STAGE_MOVER_KINDS, type StageMoverKind } from "./stageLinks";

export const STAGE_VOLUME_ROLES = [
  "npc_spawn",
  "bit_spawn",
  "assembly",
  "no_enemy_spawn",
  "no_enemy_enter",
  "no_combat",
  "hazard",
  "water",
  "door_sweep",
  "elevator_call_mat",
  "elevator_threshold",
  "elevator_car_occupancy"
] as const;

export type StageVolumeRole = (typeof STAGE_VOLUME_ROLES)[number];

export type StageVolume = Readonly<{
  id: string;
  role: StageVolumeRole;
  bitFlightBand: BitFlightBandRef | null;
  mesh: Mesh;
}>;

export type StageCharacterEllipsoid = Readonly<{
  center: Vector3;
  radii: Vector3;
}>;

export type StageSpatialBlockerKind = "beam" | "sight";

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

export type StageSpatialRayQueryKind =
  | "movement"
  | "beam"
  | "sight"
  | "ground";

export type StageSpatialQueryDiagnostics = Readonly<{
  recordRayQuery(
    kind: StageSpatialRayQueryKind,
    candidateMeshCount: number,
    directIntersectionCount: number
  ): void;
  recordRayTriangleQuery?(
    kind: StageSpatialRayQueryKind,
    indexedTriangleCount: number,
    exactTriangleTestCount: number
  ): void;
  recordSphereSweep?(
    moverKind: StageMoverKind,
    visitedNodeCount: number,
    indexedTriangleCount: number,
    exactTriangleTestCount: number,
    knownSafeCenterHit: boolean,
    initialContactProjectionCount: number,
    contactCandidateMaterializationCount: number,
    selectedSceneOrder: number,
    selectedTriangleIndex: number
  ): void;
}>;

export interface StageSpatialQueries {
  readonly revision: number;
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
  containsVolumeById(id: string, point: Vector3): boolean;
  intersectsVolumeById(
    id: string,
    ellipsoid: StageCharacterEllipsoid
  ): boolean;
  findContainingBlocker(
    kind: StageSpatialBlockerKind,
    point: Vector3
  ): Mesh | null;
  dispose(): void;
}

export type StageSpatialQueryOptions = Readonly<{
  volumes: readonly StageVolume[];
  diagnostics?: StageSpatialQueryDiagnostics;
}>;

const SURFACE_DISTANCE_EPSILON = 1e-6;
const INSIDE_SOLID_ANGLE_THRESHOLD = Math.PI * 2;
const STATIC_MESH_SPATIAL_CELL_SIZE = 2;
const STATIC_TRIANGLE_BVH_LEAF_CAPACITY = 8;
const SWEEP_TIME_EPSILON = 1e-9;
const SWEEP_DISTANCE_EPSILON = 1e-9;
const KNOWN_SAFE_CENTER_CACHE_MAX_ENTRIES = 16_384;
const GROUND_SAMPLE_CACHE_MAX_ENTRIES = 65_536;

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const assertCharacterEllipsoid = (
  ellipsoid: StageCharacterEllipsoid
) => {
  assertFiniteVector("人物楕円体の中心", ellipsoid.center);
  assertFiniteVector("人物楕円体の半径", ellipsoid.radii);
  if (
    ellipsoid.radii.x <= 0 ||
    ellipsoid.radii.y <= 0 ||
    ellipsoid.radii.z <= 0
  ) {
    throw new Error("人物楕円体の各半径には正の有限値が必要です。");
  }
};

type StaticMeshSpatialIndex = Readonly<{
  query(from: Vector3, to: Vector3, padding?: number): readonly Mesh[];
  dispose(): void;
}>;

const spatialCellKey = (x: number, y: number, z: number) => `${x}:${y}:${z}`;

const createStaticMeshSpatialIndex = (
  meshes: readonly Mesh[],
  sceneOrderByMesh: ReadonlyMap<Mesh, number>
): StaticMeshSpatialIndex => {
  const cells = new Map<string, Mesh[]>();
  const orderByMesh = new Map<Mesh, number>();
  meshes.forEach((mesh) => {
    orderByMesh.set(mesh, sceneOrderByMesh.get(mesh)!);
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
  });

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
      return Object.freeze(
        [...candidates].sort(
          (left, right) =>
            orderByMesh.get(left)! - orderByMesh.get(right)!
        )
      );
    },
    dispose: () => {
      cells.clear();
      orderByMesh.clear();
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

const cloneSpatialHit = (hit: SpatialHit): SpatialHit =>
  toSpatialHit(hit.point, hit.normal, hit.distance, hit.mesh);

type WorldTriangle = readonly [Vector3, Vector3, Vector3];

const buildWorldTrianglesAtMatrix = (
  mesh: Mesh,
  world: Matrix
): readonly WorldTriangle[] => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices || indices.length % 3 !== 0) {
    throw new Error(`閉じた三角形Meshが必要です: ${mesh.name}`);
  }
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

const buildWorldTriangles = (mesh: Mesh): readonly WorldTriangle[] =>
  buildWorldTrianglesAtMatrix(
    mesh,
    mesh.computeWorldMatrix(true)
  );

type IndexedWorldTriangle = Readonly<{
  sceneOrder: number;
  mesh: Mesh;
  triangle: WorldTriangle;
  triangleIndex: number;
  worldVertexNormals:
    | readonly [Vector3, Vector3, Vector3]
    | null;
  normal: Vector3 | null;
  planeConstant: number;
  firstEdge: Vector3;
  secondEdge: Vector3;
  thirdEdge: Vector3;
  faceSecondEdge: Vector3;
  firstEdgeLengthSquared: number;
  secondEdgeLengthSquared: number;
  thirdEdgeLengthSquared: number;
  faceFirstDot: number;
  faceMixedDot: number;
  faceSecondDot: number;
  faceDenominator: number;
  minimumX: number;
  minimumY: number;
  minimumZ: number;
  maximumX: number;
  maximumY: number;
  maximumZ: number;
}>;

type TriangleBvhNode = Readonly<{
  minimumX: number;
  minimumY: number;
  minimumZ: number;
  maximumX: number;
  maximumY: number;
  maximumZ: number;
  triangles: readonly IndexedWorldTriangle[] | null;
  left: TriangleBvhNode | null;
  right: TriangleBvhNode | null;
}>;

type TriangleCandidateVisitState = {
  visitedNodeCount: number;
  indexedTriangleCount: number;
};

type StaticTriangleSpatialIndex = Readonly<{
  query(
    from: Vector3,
    to: Vector3,
    padding: number,
    allowedMeshes: ReadonlySet<Mesh>
  ): Readonly<{
    candidatesByMesh: ReadonlyMap<Mesh, readonly IndexedWorldTriangle[]>;
    orderedMeshes: readonly Mesh[];
    visitedNodeCount: number;
    indexedTriangleCount: number;
  }>;
  visitMovementSphereCandidates<T>(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3,
    padding: number,
    state: TriangleCandidateVisitState,
    context: T,
    visitor: (context: T, candidate: IndexedWorldTriangle) => void
  ): void;
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

const compareIndexedTriangleOrder = (
  left: IndexedWorldTriangle,
  right: IndexedWorldTriangle
) =>
  left.sceneOrder - right.sceneOrder ||
  left.triangleIndex - right.triangleIndex;

const getTriangleCentroidAxis = (
  triangle: IndexedWorldTriangle,
  axis: 0 | 1 | 2
) => {
  if (axis === 0) {
    return triangle.minimumX + triangle.maximumX;
  }
  if (axis === 1) {
    return triangle.minimumY + triangle.maximumY;
  }
  return triangle.minimumZ + triangle.maximumZ;
};

const createTriangleBvh = (
  triangles: readonly IndexedWorldTriangle[]
): TriangleBvhNode | null => {
  if (triangles.length === 0) {
    return null;
  }
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (const triangle of triangles) {
    minimumX = Math.min(minimumX, triangle.minimumX);
    minimumY = Math.min(minimumY, triangle.minimumY);
    minimumZ = Math.min(minimumZ, triangle.minimumZ);
    maximumX = Math.max(maximumX, triangle.maximumX);
    maximumY = Math.max(maximumY, triangle.maximumY);
    maximumZ = Math.max(maximumZ, triangle.maximumZ);
  }
  if (triangles.length <= STATIC_TRIANGLE_BVH_LEAF_CAPACITY) {
    return Object.freeze({
      minimumX,
      minimumY,
      minimumZ,
      maximumX,
      maximumY,
      maximumZ,
      triangles: Object.freeze(
        [...triangles].sort(compareIndexedTriangleOrder)
      ),
      left: null,
      right: null
    });
  }
  const extentX = maximumX - minimumX;
  const extentY = maximumY - minimumY;
  const extentZ = maximumZ - minimumZ;
  let splitAxis: 0 | 1 | 2 = 0;
  let splitExtent = extentX;
  if (extentY > splitExtent) {
    splitAxis = 1;
    splitExtent = extentY;
  }
  if (extentZ > splitExtent) {
    splitAxis = 2;
  }
  const orderedTriangles = [...triangles].sort(
    (left, right) =>
      getTriangleCentroidAxis(left, splitAxis) -
        getTriangleCentroidAxis(right, splitAxis) ||
      compareIndexedTriangleOrder(left, right)
  );
  const middle = Math.floor(orderedTriangles.length / 2);
  return Object.freeze({
    minimumX,
    minimumY,
    minimumZ,
    maximumX,
    maximumY,
    maximumZ,
    triangles: null,
    left: createTriangleBvh(orderedTriangles.slice(0, middle)),
    right: createTriangleBvh(orderedTriangles.slice(middle))
  });
};

const createStaticTriangleSpatialIndex = (
  trianglesByMesh: ReadonlyMap<Mesh, readonly WorldTriangle[]>,
  sceneOrderByMesh: ReadonlyMap<Mesh, number>,
  movementMeshes: Readonly<Record<StageMoverKind, ReadonlySet<Mesh>>>
): StaticTriangleSpatialIndex => {
  const orderByMesh = new Map<Mesh, number>();
  const indexedTriangles: IndexedWorldTriangle[] = [];
  for (const [mesh, triangles] of trianglesByMesh) {
    const sceneOrder = sceneOrderByMesh.get(mesh)!;
    orderByMesh.set(mesh, sceneOrder);
    const meshNormals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const meshIndices = mesh.getIndices();
    if (!meshIndices) {
      throw new Error(`三角形Meshのindexがありません: ${mesh.name}`);
    }
    const normalWorld = mesh.computeWorldMatrix(true).clone();
    normalWorld.setTranslationFromFloats(0, 0, 0);
    if (mesh.nonUniformScaling) {
      normalWorld.invert();
      normalWorld.transpose();
    }
    triangles.forEach((triangle, triangleIndex) => {
      const firstEdge = triangle[1].subtract(triangle[0]);
      const faceSecondEdge = triangle[2].subtract(triangle[0]);
      const secondEdge = triangle[2].subtract(triangle[1]);
      const thirdEdge = triangle[0].subtract(triangle[2]);
      const triangleNormal = Vector3.Cross(firstEdge, faceSecondEdge);
      const normal =
        triangleNormal.lengthSquared() <= SWEEP_DISTANCE_EPSILON
          ? null
          : triangleNormal.normalize();
      const planeConstant =
        normal === null
          ? 0
          : -(
              normal.x * triangle[0].x +
              normal.y * triangle[0].y +
              normal.z * triangle[0].z
            );
      const faceFirstDot = Vector3.Dot(firstEdge, firstEdge);
      const faceMixedDot = Vector3.Dot(firstEdge, faceSecondEdge);
      const faceSecondDot = Vector3.Dot(
        faceSecondEdge,
        faceSecondEdge
      );
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
      const indexOffset = triangleIndex * 3;
      const worldVertexNormals =
        meshNormals === null
          ? null
          : ([
              Vector3.TransformNormal(
                Vector3.FromArray(
                  meshNormals,
                  meshIndices[indexOffset] * 3
                ),
                normalWorld
              ),
              Vector3.TransformNormal(
                Vector3.FromArray(
                  meshNormals,
                  meshIndices[indexOffset + 1] * 3
                ),
                normalWorld
              ),
              Vector3.TransformNormal(
                Vector3.FromArray(
                  meshNormals,
                  meshIndices[indexOffset + 2] * 3
                ),
                normalWorld
              )
            ] as const);
      const indexedTriangle: IndexedWorldTriangle = Object.freeze({
        sceneOrder,
        mesh,
        triangle,
        triangleIndex,
        worldVertexNormals,
        normal,
        planeConstant,
        firstEdge,
        secondEdge,
        thirdEdge,
        faceSecondEdge,
        firstEdgeLengthSquared: firstEdge.lengthSquared(),
        secondEdgeLengthSquared: secondEdge.lengthSquared(),
        thirdEdgeLengthSquared: thirdEdge.lengthSquared(),
        faceFirstDot,
        faceMixedDot,
        faceSecondDot,
        faceDenominator:
          faceFirstDot * faceSecondDot - faceMixedDot * faceMixedDot,
        minimumX,
        minimumY,
        minimumZ,
        maximumX,
        maximumY,
        maximumZ
      });
      indexedTriangles.push(indexedTriangle);
    });
  }
  let allTrianglesRoot = createTriangleBvh(indexedTriangles);
  const movementRoots: Record<
    StageMoverKind,
    TriangleBvhNode | null
  > = {
    player: createTriangleBvh(
      indexedTriangles.filter((triangle) =>
        movementMeshes.player.has(triangle.mesh)
      )
    ),
    npc: createTriangleBvh(
      indexedTriangles.filter((triangle) =>
        movementMeshes.npc.has(triangle.mesh)
      )
    ),
    bit: createTriangleBvh(
      indexedTriangles.filter((triangle) =>
        movementMeshes.bit.has(triangle.mesh)
      )
    )
  };
  const generalTraversalStack: TriangleBvhNode[] = [];
  const movementTraversalStacks: Record<
    StageMoverKind,
    TriangleBvhNode[]
  > = {
    player: [],
    npc: [],
    bit: []
  };
  const nodeInterval: SweepInterval = {
    minimum: -SWEEP_TIME_EPSILON,
    maximum: 1 + SWEEP_TIME_EPSILON
  };

  const index: StaticTriangleSpatialIndex = {
    query: (from, to, padding, allowedMeshes) => {
      const movement = to.subtract(from);
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
      const candidatesByMesh = new Map<Mesh, IndexedWorldTriangle[]>();
      let visitedNodeCount = 0;
      let indexedTriangleCount = 0;
      generalTraversalStack.length = 0;
      if (allTrianglesRoot) {
        generalTraversalStack.push(allTrianglesRoot);
      }
      while (generalTraversalStack.length > 0) {
        const node = generalTraversalStack.pop()!;
        visitedNodeCount += 1;
        if (
          !segmentIntersectsExpandedBounds(
            from,
            movement,
            padding,
            node.minimumX,
            node.minimumY,
            node.minimumZ,
            node.maximumX,
            node.maximumY,
            node.maximumZ,
            nodeInterval
          )
        ) {
          continue;
        }
        if (!node.triangles) {
          if (node.right) {
            generalTraversalStack.push(node.right);
          }
          if (node.left) {
            generalTraversalStack.push(node.left);
          }
          continue;
        }
        for (const candidate of node.triangles) {
          if (!allowedMeshes.has(candidate.mesh)) {
            continue;
          }
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
          indexedTriangleCount += 1;
          const meshCandidates =
            candidatesByMesh.get(candidate.mesh) ?? [];
          meshCandidates.push(candidate);
          candidatesByMesh.set(candidate.mesh, meshCandidates);
        }
      }
      return Object.freeze({
        candidatesByMesh,
        orderedMeshes: Object.freeze(
          [...candidatesByMesh.keys()].sort(
            (left, right) =>
              orderByMesh.get(left)! - orderByMesh.get(right)!
          )
        ),
        visitedNodeCount,
        indexedTriangleCount
      });
    },
    visitMovementSphereCandidates: (
      moverKind,
      from,
      to,
      padding,
      state,
      context,
      visitor
    ) => {
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
      const movement = to.subtract(from);
      state.visitedNodeCount = 0;
      state.indexedTriangleCount = 0;
      const traversalStack = movementTraversalStacks[moverKind];
      traversalStack.length = 0;
      const root = movementRoots[moverKind];
      if (root) {
        traversalStack.push(root);
      }
      while (traversalStack.length > 0) {
        const node = traversalStack.pop()!;
        state.visitedNodeCount += 1;
        if (
          !segmentIntersectsExpandedBounds(
            from,
            movement,
            padding,
            node.minimumX,
            node.minimumY,
            node.minimumZ,
            node.maximumX,
            node.maximumY,
            node.maximumZ,
            nodeInterval
          )
        ) {
          continue;
        }
        if (!node.triangles) {
          if (node.right) {
            traversalStack.push(node.right);
          }
          if (node.left) {
            traversalStack.push(node.left);
          }
          continue;
        }
        for (const candidate of node.triangles) {
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
          state.indexedTriangleCount += 1;
          visitor(context, candidate);
        }
      }
    },
    dispose: () => {
      allTrianglesRoot = null;
      for (const moverKind of STAGE_MOVER_KINDS) {
        movementRoots[moverKind] = null;
        movementTraversalStacks[moverKind].length = 0;
      }
      generalTraversalStack.length = 0;
      orderByMesh.clear();
      indexedTriangles.length = 0;
    }
  };
  return Object.freeze(index);
};

type IndexedRayHit = Readonly<{
  point: Vector3;
  normal: Vector3;
  distance: number;
  mesh: Mesh;
  triangleIndex: number;
}>;

const findNearestIndexedRayHit = (
  ray: Ray,
  movement: Vector3,
  triangles: readonly IndexedWorldTriangle[],
  interval: SweepInterval
) => {
  let exactTriangleTestCount = 0;
  let nearest: IndexedRayHit | null = null;
  for (const indexedTriangle of triangles) {
    if (
      !segmentIntersectsExpandedTriangleBounds(
        ray.origin,
        movement,
        0,
        indexedTriangle,
        interval
      )
    ) {
      continue;
    }
    exactTriangleTestCount += 1;
    const intersection = ray.intersectsTriangle(
      ...indexedTriangle.triangle
    );
    if (
      !intersection ||
      intersection.distance < 0 ||
      (nearest &&
        (intersection.distance > nearest.distance ||
          (intersection.distance === nearest.distance &&
            indexedTriangle.triangleIndex >= nearest.triangleIndex)))
    ) {
      continue;
    }
    const normals = indexedTriangle.worldVertexNormals;
    if (!normals) {
      throw new Error(
        `空間問い合わせで面法線を取得できません: ${indexedTriangle.mesh.name}`
      );
    }
    const firstWeight = intersection.bu!;
    const secondWeight = intersection.bv!;
    const thirdWeight = 1 - firstWeight - secondWeight;
    const normal = new Vector3(
      normals[0].x * firstWeight +
        normals[1].x * secondWeight +
        normals[2].x * thirdWeight,
      normals[0].y * firstWeight +
        normals[1].y * secondWeight +
        normals[2].y * thirdWeight,
      normals[0].z * firstWeight +
        normals[1].z * secondWeight +
        normals[2].z * thirdWeight
    );
    if (Vector3.Dot(normal, ray.direction) > 0) {
      normal.negateInPlace();
    }
    normal.normalize();
    nearest = Object.freeze({
      point: ray.origin.add(
        ray.direction.scale(intersection.distance)
      ),
      normal,
      distance: intersection.distance,
      mesh: indexedTriangle.mesh,
      triangleIndex: indexedTriangle.triangleIndex
    });
  }
  return Object.freeze({ nearest, exactTriangleTestCount });
};

const castIndexedSegment = (
  queryKind: StageSpatialRayQueryKind,
  spatialIndex: StaticTriangleSpatialIndex,
  allowedMeshes: ReadonlySet<Mesh>,
  from: Vector3,
  to: Vector3,
  diagnostics: StageSpatialQueryDiagnostics | undefined,
  acceptMeshHit: ((hit: IndexedRayHit) => boolean) | null = null
): SpatialHit | null => {
  const distance = Vector3.Distance(from, to);
  if (distance === 0) {
    diagnostics?.recordRayQuery(queryKind, 0, 0);
    diagnostics?.recordRayTriangleQuery?.(queryKind, 0, 0);
    return null;
  }
  const direction = to.subtract(from).scaleInPlace(1 / distance);
  const movement = to.subtract(from);
  const ray = new Ray(from, direction, distance);
  const triangleQuery = spatialIndex.query(
    from,
    to,
    0,
    allowedMeshes
  );
  const interval: SweepInterval = {
    minimum: -SWEEP_TIME_EPSILON,
    maximum: 1 + SWEEP_TIME_EPSILON
  };
  let exactTriangleTestCount = 0;
  let nearest: IndexedRayHit | null = null;
  for (const mesh of triangleQuery.orderedMeshes) {
    const meshResult = findNearestIndexedRayHit(
      ray,
      movement,
      triangleQuery.candidatesByMesh.get(mesh) ?? [],
      interval
    );
    exactTriangleTestCount += meshResult.exactTriangleTestCount;
    const hit = meshResult.nearest;
    if (
      !hit ||
      (acceptMeshHit && !acceptMeshHit(hit)) ||
      (nearest && hit.distance >= nearest.distance)
    ) {
      continue;
    }
    nearest = hit;
  }
  diagnostics?.recordRayQuery(
    queryKind,
    triangleQuery.orderedMeshes.length,
    0
  );
  diagnostics?.recordRayTriangleQuery?.(
    queryKind,
    triangleQuery.indexedTriangleCount,
    exactTriangleTestCount
  );
  return nearest
    ? toSpatialHit(
        nearest.point,
        nearest.normal,
        nearest.distance,
        nearest.mesh
      )
    : null;
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

type QuadraticRoots = {
  first: number;
  second: number;
  count: 0 | 1 | 2;
};

type SweepInterval = {
  minimum: number;
  maximum: number;
};

type SphereSweepScratch = {
  movement: Vector3;
  roots: QuadraticRoots;
  interval: SweepInterval;
  projectedPoint: Vector3;
  from: Vector3 | null;
  radius: number;
  movementLengthSquared: number;
  candidateVisitState: TriangleCandidateVisitState;
  exactTriangleTestCount: number;
  nearestCandidate: SphereSweepCandidate | null;
  nearestMesh: Mesh | null;
  nearestSceneOrder: number;
  nearestTriangleIndex: number;
  initialContactProjectionCount: number;
  contactCandidateMaterializationCount: number;
};

const createSphereSweepScratch = (): SphereSweepScratch => ({
  movement: Vector3.Zero(),
  roots: { first: 0, second: 0, count: 0 },
  interval: {
    minimum: -SWEEP_TIME_EPSILON,
    maximum: 1 + SWEEP_TIME_EPSILON
  },
  projectedPoint: Vector3.Zero(),
  from: null,
  radius: 0,
  movementLengthSquared: 0,
  candidateVisitState: {
    visitedNodeCount: 0,
    indexedTriangleCount: 0
  },
  exactTriangleTestCount: 0,
  nearestCandidate: null,
  nearestMesh: null,
  nearestSceneOrder: Number.POSITIVE_INFINITY,
  nearestTriangleIndex: Number.POSITIVE_INFINITY,
  initialContactProjectionCount: 0,
  contactCandidateMaterializationCount: 0
});

const writeQuadraticRoots = (
  quadratic: number,
  linear: number,
  constant: number,
  roots: QuadraticRoots
) => {
  if (Math.abs(quadratic) <= SWEEP_DISTANCE_EPSILON) {
    if (Math.abs(linear) <= SWEEP_DISTANCE_EPSILON) {
      roots.count = 0;
      return;
    }
    roots.first = -constant / linear;
    roots.count = 1;
    return;
  }
  const discriminant = linear * linear - 4 * quadratic * constant;
  if (discriminant < -SWEEP_DISTANCE_EPSILON) {
    roots.count = 0;
    return;
  }
  const squareRoot = Math.sqrt(Math.max(0, discriminant));
  const first = (-linear - squareRoot) / (2 * quadratic);
  const second = (-linear + squareRoot) / (2 * quadratic);
  if (first <= second) {
    roots.first = first;
    roots.second = second;
  } else {
    roots.first = second;
    roots.second = first;
  }
  roots.count = 2;
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
  pointX: number,
  pointY: number,
  pointZ: number,
  indexedTriangle: IndexedWorldTriangle
) => {
  const first = indexedTriangle.triangle[0];
  const relativeX = pointX - first.x;
  const relativeY = pointY - first.y;
  const relativeZ = pointZ - first.z;
  const dotRelativeFirst =
    relativeX * indexedTriangle.firstEdge.x +
    relativeY * indexedTriangle.firstEdge.y +
    relativeZ * indexedTriangle.firstEdge.z;
  const dotRelativeSecond =
    relativeX * indexedTriangle.faceSecondEdge.x +
    relativeY * indexedTriangle.faceSecondEdge.y +
    relativeZ * indexedTriangle.faceSecondEdge.z;
  if (
    Math.abs(indexedTriangle.faceDenominator) <=
    SWEEP_DISTANCE_EPSILON
  ) {
    return false;
  }
  const firstCoordinate =
    (indexedTriangle.faceSecondDot * dotRelativeFirst -
      indexedTriangle.faceMixedDot * dotRelativeSecond) /
    indexedTriangle.faceDenominator;
  const secondCoordinate =
    (indexedTriangle.faceFirstDot * dotRelativeSecond -
      indexedTriangle.faceMixedDot * dotRelativeFirst) /
    indexedTriangle.faceDenominator;
  return (
    firstCoordinate >= -SURFACE_DISTANCE_EPSILON &&
    secondCoordinate >= -SURFACE_DISTANCE_EPSILON &&
    firstCoordinate + secondCoordinate <= 1 + SURFACE_DISTANCE_EPSILON
  );
};

const selectEarlierSweepCandidate = (
  selected: SphereSweepCandidate | null,
  candidate: SphereSweepCandidate
) =>
  !selected || candidate.fraction < selected.fraction
    ? candidate
    : selected;

const collectFaceSweepCandidate = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  indexedTriangle: IndexedWorldTriangle,
  selected: SphereSweepCandidate | null,
  scratch: SphereSweepScratch
) => {
  const triangleNormal = indexedTriangle.normal;
  if (!triangleNormal) {
    return selected;
  }
  const first = indexedTriangle.triangle[0];
  const startDistance =
    (from.x - first.x) * triangleNormal.x +
    (from.y - first.y) * triangleNormal.y +
    (from.z - first.z) * triangleNormal.z;
  const movementDistance = Vector3.Dot(movement, triangleNormal);
  if (Math.abs(movementDistance) <= SWEEP_DISTANCE_EPSILON) {
    return selected;
  }
  let bestFraction = selected?.fraction ?? Number.POSITIVE_INFINITY;
  let bestSignedRadius = radius;
  let hasFaceCandidate = false;
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const signedRadius = sideIndex === 0 ? radius : -radius;
    const rawFraction =
      (signedRadius - startDistance) / movementDistance;
    if (!isSweepFraction(rawFraction)) {
      continue;
    }
    const fraction = clampSweepFraction(rawFraction);
    if (fraction >= bestFraction) {
      continue;
    }
    const centerX = from.x + movement.x * fraction;
    const centerY = from.y + movement.y * fraction;
    const centerZ = from.z + movement.z * fraction;
    const pointX = centerX - triangleNormal.x * signedRadius;
    const pointY = centerY - triangleNormal.y * signedRadius;
    const pointZ = centerZ - triangleNormal.z * signedRadius;
    if (!isPointInTriangle(pointX, pointY, pointZ, indexedTriangle)) {
      continue;
    }
    bestFraction = fraction;
    bestSignedRadius = signedRadius;
    hasFaceCandidate = true;
  }
  if (!hasFaceCandidate) {
    return selected;
  }
  const center = new Vector3(
    from.x + movement.x * bestFraction,
    from.y + movement.y * bestFraction,
    from.z + movement.z * bestFraction
  );
  const point = new Vector3(
    center.x - triangleNormal.x * bestSignedRadius,
    center.y - triangleNormal.y * bestSignedRadius,
    center.z - triangleNormal.z * bestSignedRadius
  );
  scratch.contactCandidateMaterializationCount += 1;
  return {
    center,
    point,
    normal:
      bestSignedRadius >= 0
        ? triangleNormal.clone()
        : triangleNormal.scale(-1),
    fraction: bestFraction
  };
};

const collectEdgeSweepCandidate = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  edgeStart: Vector3,
  edge: Vector3,
  edgeLengthSquared: number,
  triangleNormal: Vector3,
  roots: QuadraticRoots,
  selected: SphereSweepCandidate | null,
  scratch: SphereSweepScratch
) => {
  if (edgeLengthSquared <= SWEEP_DISTANCE_EPSILON) {
    return selected;
  }
  const startRelativeX = from.x - edgeStart.x;
  const startRelativeY = from.y - edgeStart.y;
  const startRelativeZ = from.z - edgeStart.z;
  const startProjection =
    (startRelativeX * edge.x +
      startRelativeY * edge.y +
      startRelativeZ * edge.z) /
    edgeLengthSquared;
  const movementProjection =
    Vector3.Dot(movement, edge) / edgeLengthSquared;
  const perpendicularStartX =
    startRelativeX - edge.x * startProjection;
  const perpendicularStartY =
    startRelativeY - edge.y * startProjection;
  const perpendicularStartZ =
    startRelativeZ - edge.z * startProjection;
  const perpendicularMovementX =
    movement.x - edge.x * movementProjection;
  const perpendicularMovementY =
    movement.y - edge.y * movementProjection;
  const perpendicularMovementZ =
    movement.z - edge.z * movementProjection;
  writeQuadraticRoots(
    perpendicularMovementX * perpendicularMovementX +
      perpendicularMovementY * perpendicularMovementY +
      perpendicularMovementZ * perpendicularMovementZ,
    2 *
      (perpendicularStartX * perpendicularMovementX +
        perpendicularStartY * perpendicularMovementY +
        perpendicularStartZ * perpendicularMovementZ),
    perpendicularStartX * perpendicularStartX +
      perpendicularStartY * perpendicularStartY +
      perpendicularStartZ * perpendicularStartZ -
      radius * radius,
    roots
  );
  for (let rootIndex = 0; rootIndex < roots.count; rootIndex += 1) {
    const rawFraction =
      rootIndex === 0 ? roots.first : roots.second;
    if (!isSweepFraction(rawFraction)) {
      continue;
    }
    const fraction = clampSweepFraction(rawFraction);
    if (selected && fraction >= selected.fraction) {
      break;
    }
    const edgeFraction =
      startProjection + movementProjection * fraction;
    if (
      edgeFraction < -SURFACE_DISTANCE_EPSILON ||
      edgeFraction > 1 + SURFACE_DISTANCE_EPSILON
    ) {
      continue;
    }
    const clampedEdgeFraction = Math.min(
      1,
      Math.max(0, edgeFraction)
    );
    const center = new Vector3(
      from.x + movement.x * fraction,
      from.y + movement.y * fraction,
      from.z + movement.z * fraction
    );
    const point = new Vector3(
      edgeStart.x + edge.x * clampedEdgeFraction,
      edgeStart.y + edge.y * clampedEdgeFraction,
      edgeStart.z + edge.z * clampedEdgeFraction
    );
    scratch.contactCandidateMaterializationCount += 1;
    selected = selectEarlierSweepCandidate(selected, {
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
    break;
  }
  return selected;
};

const collectVertexSweepCandidate = (
  from: Vector3,
  movement: Vector3,
  movementLengthSquared: number,
  radius: number,
  vertex: Vector3,
  triangleNormal: Vector3,
  roots: QuadraticRoots,
  selected: SphereSweepCandidate | null,
  scratch: SphereSweepScratch
) => {
  const relativeX = from.x - vertex.x;
  const relativeY = from.y - vertex.y;
  const relativeZ = from.z - vertex.z;
  writeQuadraticRoots(
    movementLengthSquared,
    2 *
      (relativeX * movement.x +
        relativeY * movement.y +
        relativeZ * movement.z),
    relativeX * relativeX +
      relativeY * relativeY +
      relativeZ * relativeZ -
      radius * radius,
    roots
  );
  for (let rootIndex = 0; rootIndex < roots.count; rootIndex += 1) {
    const rawFraction =
      rootIndex === 0 ? roots.first : roots.second;
    if (!isSweepFraction(rawFraction)) {
      continue;
    }
    const fraction = clampSweepFraction(rawFraction);
    if (selected && fraction >= selected.fraction) {
      break;
    }
    const center = new Vector3(
      from.x + movement.x * fraction,
      from.y + movement.y * fraction,
      from.z + movement.z * fraction
    );
    scratch.contactCandidateMaterializationCount += 1;
    selected = selectEarlierSweepCandidate(selected, {
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
    break;
  }
  return selected;
};

const findInitialSphereTriangleContact = (
  center: Vector3,
  movement: Vector3,
  radius: number,
  indexedTriangle: IndexedWorldTriangle,
  scratch: SphereSweepScratch
): SphereSweepCandidate | null => {
  const triangleNormal = indexedTriangle.normal;
  if (!triangleNormal) {
    return null;
  }
  const expansion = radius + SWEEP_DISTANCE_EPSILON;
  if (
    center.x < indexedTriangle.minimumX - expansion ||
    center.x > indexedTriangle.maximumX + expansion ||
    center.y < indexedTriangle.minimumY - expansion ||
    center.y > indexedTriangle.maximumY + expansion ||
    center.z < indexedTriangle.minimumZ - expansion ||
    center.z > indexedTriangle.maximumZ + expansion
  ) {
    return null;
  }
  scratch.initialContactProjectionCount += 1;
  Vector3.ProjectOnTriangleToRef(
    center,
    ...indexedTriangle.triangle,
    scratch.projectedPoint
  );
  if (
    Vector3.DistanceSquared(center, scratch.projectedPoint) >
    radius * radius + SWEEP_DISTANCE_EPSILON
  ) {
    return null;
  }
  scratch.contactCandidateMaterializationCount += 1;
  return {
    center: center.clone(),
    point: scratch.projectedPoint.clone(),
    normal: createContactNormal(
      center,
      scratch.projectedPoint,
      triangleNormal,
      movement
    ),
    fraction: 0
  };
};

const clipSweepIntervalAxis = (
  origin: number,
  movement: number,
  minimum: number,
  maximum: number,
  interval: SweepInterval
) => {
  if (movement === 0) {
    return origin >= minimum && origin <= maximum;
  }
  const inverseMovement = 1 / movement;
  const first = (minimum - origin) * inverseMovement;
  const second = (maximum - origin) * inverseMovement;
  interval.minimum = Math.max(interval.minimum, Math.min(first, second));
  interval.maximum = Math.min(interval.maximum, Math.max(first, second));
  return interval.minimum <= interval.maximum + SWEEP_TIME_EPSILON;
};

const segmentIntersectsExpandedBounds = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  minimumX: number,
  minimumY: number,
  minimumZ: number,
  maximumX: number,
  maximumY: number,
  maximumZ: number,
  interval: SweepInterval
) => {
  const expansion = radius + SWEEP_DISTANCE_EPSILON;
  interval.minimum = -SWEEP_TIME_EPSILON;
  interval.maximum = 1 + SWEEP_TIME_EPSILON;
  return (
    clipSweepIntervalAxis(
      from.x,
      movement.x,
      minimumX - expansion,
      maximumX + expansion,
      interval
    ) &&
    clipSweepIntervalAxis(
      from.y,
      movement.y,
      minimumY - expansion,
      maximumY + expansion,
      interval
    ) &&
    clipSweepIntervalAxis(
      from.z,
      movement.z,
      minimumZ - expansion,
      maximumZ + expansion,
      interval
    )
  );
};

const segmentIntersectsExpandedTriangleBounds = (
  from: Vector3,
  movement: Vector3,
  radius: number,
  indexedTriangle: IndexedWorldTriangle,
  interval: SweepInterval
) =>
  segmentIntersectsExpandedBounds(
    from,
    movement,
    radius,
    indexedTriangle.minimumX,
    indexedTriangle.minimumY,
    indexedTriangle.minimumZ,
    indexedTriangle.maximumX,
    indexedTriangle.maximumY,
    indexedTriangle.maximumZ,
    interval
  );

const findSphereTriangleSweep = (
  from: Vector3,
  movement: Vector3,
  movementLengthSquared: number,
  radius: number,
  indexedTriangle: IndexedWorldTriangle,
  scratch: SphereSweepScratch,
  checkInitialContact: boolean
): SphereSweepCandidate | null => {
  if (checkInitialContact) {
    const initialContact = findInitialSphereTriangleContact(
      from,
      movement,
      radius,
      indexedTriangle,
      scratch
    );
    if (initialContact) {
      return initialContact;
    }
  }
  if (movementLengthSquared <= SWEEP_DISTANCE_EPSILON) {
    return null;
  }

  const triangleNormal = indexedTriangle.normal;
  if (!triangleNormal) {
    return null;
  }
  const [first, second, third] = indexedTriangle.triangle;
  let selected: SphereSweepCandidate | null = null;
  selected = collectFaceSweepCandidate(
    from,
    movement,
    radius,
    indexedTriangle,
    selected,
    scratch
  );
  selected = collectEdgeSweepCandidate(
    from,
    movement,
    radius,
    first,
    indexedTriangle.firstEdge,
    indexedTriangle.firstEdgeLengthSquared,
    triangleNormal,
    scratch.roots,
    selected,
    scratch
  );
  selected = collectEdgeSweepCandidate(
    from,
    movement,
    radius,
    second,
    indexedTriangle.secondEdge,
    indexedTriangle.secondEdgeLengthSquared,
    triangleNormal,
    scratch.roots,
    selected,
    scratch
  );
  selected = collectEdgeSweepCandidate(
    from,
    movement,
    radius,
    third,
    indexedTriangle.thirdEdge,
    indexedTriangle.thirdEdgeLengthSquared,
    triangleNormal,
    scratch.roots,
    selected,
    scratch
  );
  selected = collectVertexSweepCandidate(
    from,
    movement,
    movementLengthSquared,
    radius,
    first,
    triangleNormal,
    scratch.roots,
    selected,
    scratch
  );
  selected = collectVertexSweepCandidate(
    from,
    movement,
    movementLengthSquared,
    radius,
    second,
    triangleNormal,
    scratch.roots,
    selected,
    scratch
  );
  selected = collectVertexSweepCandidate(
    from,
    movement,
    movementLengthSquared,
    radius,
    third,
    triangleNormal,
    scratch.roots,
    selected,
    scratch
  );
  return selected;
};

const visitKnownSafeSphereCandidate = (
  scratch: SphereSweepScratch,
  indexedTriangle: IndexedWorldTriangle
) => {
  const from = scratch.from!;
  if (
    !segmentIntersectsExpandedTriangleBounds(
      from,
      scratch.movement,
      scratch.radius,
      indexedTriangle,
      scratch.interval
    )
  ) {
    return;
  }
  const triangleNormal = indexedTriangle.normal;
  if (triangleNormal) {
    const startPlaneDistance =
      triangleNormal.x * from.x +
      triangleNormal.y * from.y +
      triangleNormal.z * from.z +
      indexedTriangle.planeConstant;
    const endPlaneDistance =
      startPlaneDistance +
      triangleNormal.x * scratch.movement.x +
      triangleNormal.y * scratch.movement.y +
      triangleNormal.z * scratch.movement.z;
    const expandedRadius =
      scratch.radius + SWEEP_DISTANCE_EPSILON;
    if (
      (startPlaneDistance > expandedRadius &&
        endPlaneDistance > expandedRadius) ||
      (startPlaneDistance < -expandedRadius &&
        endPlaneDistance < -expandedRadius)
    ) {
      return;
    }
  }
  scratch.exactTriangleTestCount += 1;
  const candidate = findSphereTriangleSweep(
    from,
    scratch.movement,
    scratch.movementLengthSquared,
    scratch.radius,
    indexedTriangle,
    scratch,
    false
  );
  if (!candidate) {
    return;
  }
  if (
    scratch.nearestCandidate &&
    (candidate.fraction > scratch.nearestCandidate.fraction ||
      (candidate.fraction === scratch.nearestCandidate.fraction &&
        (indexedTriangle.sceneOrder > scratch.nearestSceneOrder ||
          (indexedTriangle.sceneOrder === scratch.nearestSceneOrder &&
            indexedTriangle.triangleIndex >=
              scratch.nearestTriangleIndex))))
  ) {
    return;
  }
  scratch.nearestCandidate = candidate;
  scratch.nearestMesh = indexedTriangle.mesh;
  scratch.nearestSceneOrder = indexedTriangle.sceneOrder;
  scratch.nearestTriangleIndex = indexedTriangle.triangleIndex;
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
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (const triangle of triangles) {
    for (const vertex of triangle) {
      minimumX = Math.min(minimumX, vertex.x);
      minimumY = Math.min(minimumY, vertex.y);
      minimumZ = Math.min(minimumZ, vertex.z);
      maximumX = Math.max(maximumX, vertex.x);
      maximumY = Math.max(maximumY, vertex.y);
      maximumZ = Math.max(maximumZ, vertex.z);
    }
  }
  const projectedPoint = Vector3.Zero();
  return (point: Vector3): boolean => {
    if (
      point.x < minimumX - SURFACE_DISTANCE_EPSILON ||
      point.x > maximumX + SURFACE_DISTANCE_EPSILON ||
      point.y < minimumY - SURFACE_DISTANCE_EPSILON ||
      point.y > maximumY + SURFACE_DISTANCE_EPSILON ||
      point.z < minimumZ - SURFACE_DISTANCE_EPSILON ||
      point.z > maximumZ + SURFACE_DISTANCE_EPSILON
    ) {
      return false;
    }
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

const createIntersectsEllipsoidQueryFromTriangles = (
  triangles: readonly WorldTriangle[],
  containsPoint: (point: Vector3) => boolean
) => {
  const scaledFirst = Vector3.Zero();
  const scaledSecond = Vector3.Zero();
  const scaledThird = Vector3.Zero();
  const projectedPoint = Vector3.Zero();
  const origin = Vector3.Zero();
  return (ellipsoid: StageCharacterEllipsoid): boolean => {
    if (containsPoint(ellipsoid.center)) {
      return true;
    }
    for (const triangle of triangles) {
      scaledFirst.set(
        (triangle[0].x - ellipsoid.center.x) /
          ellipsoid.radii.x,
        (triangle[0].y - ellipsoid.center.y) /
          ellipsoid.radii.y,
        (triangle[0].z - ellipsoid.center.z) /
          ellipsoid.radii.z
      );
      scaledSecond.set(
        (triangle[1].x - ellipsoid.center.x) /
          ellipsoid.radii.x,
        (triangle[1].y - ellipsoid.center.y) /
          ellipsoid.radii.y,
        (triangle[1].z - ellipsoid.center.z) /
          ellipsoid.radii.z
      );
      scaledThird.set(
        (triangle[2].x - ellipsoid.center.x) /
          ellipsoid.radii.x,
        (triangle[2].y - ellipsoid.center.y) /
          ellipsoid.radii.y,
        (triangle[2].z - ellipsoid.center.z) /
          ellipsoid.radii.z
      );
      const distance = Vector3.ProjectOnTriangleToRef(
        origin,
        scaledFirst,
        scaledSecond,
        scaledThird,
        projectedPoint
      );
      if (distance <= 1 + SURFACE_DISTANCE_EPSILON) {
        return true;
      }
    }
    return false;
  };
};

export const intersectsCharacterEllipsoidWithMeshAtWorldMatrix = (
  mesh: Mesh,
  world: Matrix,
  ellipsoid: StageCharacterEllipsoid
): boolean => {
  assertCharacterEllipsoid(ellipsoid);
  const triangles = buildWorldTrianglesAtMatrix(mesh, world);
  const containsPoint =
    createContainsPointQueryFromTriangles(triangles);
  return createIntersectsEllipsoidQueryFromTriangles(
    triangles,
    containsPoint
  )(ellipsoid);
};

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
    | Readonly<{
        point: Vector3;
        triangle: WorldTriangle;
        triangleIndex: number;
        distanceSquared: number;
      }>
    | null = null;
  for (
    let triangleIndex = 0;
    triangleIndex < triangles.length;
    triangleIndex += 1
  ) {
    const triangle = triangles[triangleIndex];
    Vector3.ProjectOnTriangleToRef(point, ...triangle, projectedPoint);
    const distanceSquared = Vector3.DistanceSquared(point, projectedPoint);
    if (!nearest || distanceSquared < nearest.distanceSquared) {
      nearest = {
        point: projectedPoint.clone(),
        triangle,
        triangleIndex,
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
  sceneOrderByMesh: ReadonlyMap<Mesh, number>,
  scratch: SphereSweepScratch,
  from: Vector3,
  to: Vector3,
  radius: number,
  diagnostics: StageSpatialQueryDiagnostics | undefined
): SpatialSphereSweepHit | null => {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("球包絡の半径には正の有限値が必要です。");
  }
  to.subtractToRef(from, scratch.movement);
  const movementLengthSquared = scratch.movement.lengthSquared();
  const movementDistance = Math.sqrt(movementLengthSquared);
  const startIsKnownSafe = knownSafeCenterCache.has(
    moverKind,
    radius,
    from
  );
  scratch.initialContactProjectionCount = 0;
  scratch.contactCandidateMaterializationCount = 0;
  if (movementDistance === 0 && startIsKnownSafe) {
    diagnostics?.recordSphereSweep?.(
      moverKind,
      0,
      0,
      0,
      true,
      0,
      0,
      -1,
      -1
    );
    return null;
  }
  let visitedNodeCount = 0;
  let indexedTriangleCount = 0;
  let exactTriangleTestCount = 0;
  let nearestCandidate: SphereSweepCandidate | null = null;
  let nearestMesh: Mesh | null = null;
  let nearestSceneOrder = Number.POSITIVE_INFINITY;
  let nearestTriangleIndex = Number.POSITIVE_INFINITY;
  if (startIsKnownSafe) {
    scratch.from = from;
    scratch.radius = radius;
    scratch.movementLengthSquared = movementLengthSquared;
    scratch.exactTriangleTestCount = 0;
    scratch.nearestCandidate = null;
    scratch.nearestMesh = null;
    scratch.nearestSceneOrder = Number.POSITIVE_INFINITY;
    scratch.nearestTriangleIndex = Number.POSITIVE_INFINITY;
    triangleSpatialIndex.visitMovementSphereCandidates(
      moverKind,
      from,
      to,
      radius,
      scratch.candidateVisitState,
      scratch,
      visitKnownSafeSphereCandidate
    );
    visitedNodeCount = scratch.candidateVisitState.visitedNodeCount;
    indexedTriangleCount =
      scratch.candidateVisitState.indexedTriangleCount;
    exactTriangleTestCount = scratch.exactTriangleTestCount;
    nearestCandidate = scratch.nearestCandidate;
    nearestMesh = scratch.nearestMesh;
    nearestSceneOrder = scratch.nearestSceneOrder;
    nearestTriangleIndex = scratch.nearestTriangleIndex;
    scratch.from = null;
  } else {
    const triangleQuery = triangleSpatialIndex.query(
      from,
      to,
      radius,
      allowedMeshes
    );
    visitedNodeCount = triangleQuery.visitedNodeCount;
    indexedTriangleCount = triangleQuery.indexedTriangleCount;
    const candidateMeshes = spatialIndex.query(from, to, radius);
    for (const mesh of candidateMeshes) {
      const triangles = trianglesByMesh.get(mesh);
      const contains = containsByMesh.get(mesh);
      if (!triangles || !contains) {
        throw new Error(
          `移動Colliderの空間データがありません: ${mesh.name}`
        );
      }
      let candidate: SphereSweepCandidate | null = null;
      let candidateTriangleIndex = Number.POSITIVE_INFINITY;
      for (
        const indexedTriangle of
          triangleQuery.candidatesByMesh.get(mesh) ?? []
      ) {
        if (
          !segmentIntersectsExpandedTriangleBounds(
            from,
            scratch.movement,
            radius,
            indexedTriangle,
            scratch.interval
          )
        ) {
          continue;
        }
        exactTriangleTestCount += 1;
        const triangleCandidate = findSphereTriangleSweep(
          from,
          scratch.movement,
          movementLengthSquared,
          radius,
          indexedTriangle,
          scratch,
          true
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

      if (!candidate && contains(from)) {
        const nearestPoint = findNearestTrianglePoint(from, triangles);
        if (!nearestPoint) {
          throw new Error(
            `移動Colliderに三角形がありません: ${mesh.name}`
          );
        }
        const triangleNormal = Vector3.Cross(
          nearestPoint.triangle[1].subtract(nearestPoint.triangle[0]),
          nearestPoint.triangle[2].subtract(nearestPoint.triangle[0])
        ).normalize();
        scratch.contactCandidateMaterializationCount += 1;
        candidate = {
          center: from.clone(),
          point: nearestPoint.point,
          normal: createContactNormal(
            from,
            nearestPoint.point,
            triangleNormal,
            scratch.movement
          ),
          fraction: 0
        };
        candidateTriangleIndex = nearestPoint.triangleIndex;
      }

      if (
        candidate &&
        (!nearestCandidate ||
          candidate.fraction < nearestCandidate.fraction)
      ) {
        nearestCandidate = candidate;
        nearestMesh = mesh;
        nearestSceneOrder = sceneOrderByMesh.get(mesh)!;
        nearestTriangleIndex = candidateTriangleIndex;
      }
    }
  }

  diagnostics?.recordSphereSweep?.(
    moverKind,
    visitedNodeCount,
    indexedTriangleCount,
    exactTriangleTestCount,
    startIsKnownSafe,
    scratch.initialContactProjectionCount,
    scratch.contactCandidateMaterializationCount,
    nearestMesh ? nearestSceneOrder : -1,
    nearestMesh ? nearestTriangleIndex : -1
  );
  if (!nearestCandidate || !nearestMesh) {
    knownSafeCenterCache.add(moverKind, radius, from);
    knownSafeCenterCache.add(moverKind, radius, to);
    return null;
  }
  return {
    point: nearestCandidate.point.clone(),
    normal: nearestCandidate.normal.clone(),
    distance: movementDistance * nearestCandidate.fraction,
    mesh: nearestMesh,
    center: nearestCandidate.center.clone(),
    fraction: nearestCandidate.fraction
  };
};

type StageSpatialRevisionResources = Readonly<{
  movementColliderIndices: Readonly<
    Record<StageMoverKind, StaticMeshSpatialIndex>
  >;
  movementColliderMeshSets: Readonly<
    Record<StageMoverKind, ReadonlySet<Mesh>>
  >;
  groundColliderMeshes: ReadonlySet<Mesh>;
  beamBlockerMeshes: ReadonlySet<Mesh>;
  sightBlockerMeshes: ReadonlySet<Mesh>;
  blockerIndices: Readonly<
    Record<StageSpatialBlockerKind, StaticMeshSpatialIndex>
  >;
  movementTrianglesByMesh: ReadonlyMap<
    Mesh,
    readonly WorldTriangle[]
  >;
  movementContainsByMesh: ReadonlyMap<
    Mesh,
    (point: Vector3) => boolean
  >;
  containsByVolume: ReadonlyMap<
    StageVolume,
    (point: Vector3) => boolean
  >;
  intersectsEllipsoidByVolume: ReadonlyMap<
    StageVolume,
    (ellipsoid: StageCharacterEllipsoid) => boolean
  >;
  containsByBlocker: ReadonlyMap<
    Mesh,
    (point: Vector3) => boolean
  >;
  triangleSpatialIndex: StaticTriangleSpatialIndex;
  knownSafeCenterCache: KnownSafeCenterCache;
  sphereSweepScratch: SphereSweepScratch;
  groundSampleCache: Map<
    string,
    Readonly<{ hit: SpatialHit | null }>
  >;
  dispose(): void;
}>;

const createStageSpatialRevisionResources = (
  snapshot: DynamicStageSpatialSnapshot,
  sceneOrderByMesh: ReadonlyMap<Mesh, number>,
  volumes: readonly StageVolume[]
): StageSpatialRevisionResources => {
  const movementColliderIndices: Readonly<
    Record<StageMoverKind, StaticMeshSpatialIndex>
  > =
    Object.freeze({
      player: createStaticMeshSpatialIndex(
        snapshot.movementColliders.player,
        sceneOrderByMesh
      ),
      npc: createStaticMeshSpatialIndex(
        snapshot.movementColliders.npc,
        sceneOrderByMesh
      ),
      bit: createStaticMeshSpatialIndex(
        snapshot.movementColliders.bit,
        sceneOrderByMesh
      )
    });
  const movementColliderMeshes = new Set<Mesh>([
    ...snapshot.movementColliders.player,
    ...snapshot.movementColliders.npc,
    ...snapshot.movementColliders.bit
  ]);
  const movementColliderMeshSets: Readonly<
    Record<StageMoverKind, ReadonlySet<Mesh>>
  > = Object.freeze({
    player: new Set(snapshot.movementColliders.player),
    npc: new Set(snapshot.movementColliders.npc),
    bit: new Set(snapshot.movementColliders.bit)
  });
  const groundColliderMeshes = new Set(snapshot.groundColliders);
  const beamBlockerMeshes = new Set(snapshot.beamBlockers);
  const sightBlockerMeshes = new Set(snapshot.sightBlockers);
  const blockerIndices = Object.freeze({
    beam: createStaticMeshSpatialIndex(
      snapshot.beamBlockers,
      sceneOrderByMesh
    ),
    sight: createStaticMeshSpatialIndex(
      snapshot.sightBlockers,
      sceneOrderByMesh
    )
  });
  const movementTrianglesByMesh = new Map<
    Mesh,
    readonly WorldTriangle[]
  >();
  const movementContainsByMesh = new Map<
    Mesh,
    (point: Vector3) => boolean
  >();
  const worldTrianglesByMesh = new Map<
    Mesh,
    readonly WorldTriangle[]
  >();
  const getWorldTriangles = (mesh: Mesh) => {
    const existing = worldTrianglesByMesh.get(mesh);
    if (existing) {
      return existing;
    }
    const triangles = buildWorldTriangles(mesh);
    worldTrianglesByMesh.set(mesh, triangles);
    return triangles;
  };
  const containsByVolume = new Map<
    StageVolume,
    (point: Vector3) => boolean
  >();
  const intersectsEllipsoidByVolume = new Map<
    StageVolume,
    (ellipsoid: StageCharacterEllipsoid) => boolean
  >();
  for (const volume of volumes) {
    const triangles = getWorldTriangles(volume.mesh);
    const containsPoint =
      createContainsPointQueryFromTriangles(triangles);
    containsByVolume.set(volume, containsPoint);
    intersectsEllipsoidByVolume.set(
      volume,
      createIntersectsEllipsoidQueryFromTriangles(
        triangles,
        containsPoint
      )
    );
  }
  for (const mesh of movementColliderMeshes) {
    const triangles = getWorldTriangles(mesh);
    movementTrianglesByMesh.set(mesh, triangles);
    movementContainsByMesh.set(
      mesh,
      createContainsPointQueryFromTriangles(triangles)
    );
  }
  const allTriangleMeshes = new Set<Mesh>([
    ...movementColliderMeshes,
    ...groundColliderMeshes,
    ...beamBlockerMeshes,
    ...sightBlockerMeshes
  ]);
  for (const mesh of allTriangleMeshes) {
    getWorldTriangles(mesh);
  }
  const containsByBlocker = new Map<
    Mesh,
    (point: Vector3) => boolean
  >();
  for (const mesh of new Set([
    ...beamBlockerMeshes,
    ...sightBlockerMeshes
  ])) {
    containsByBlocker.set(
      mesh,
      createContainsPointQueryFromTriangles(
        getWorldTriangles(mesh)
      )
    );
  }
  const triangleSpatialIndex = createStaticTriangleSpatialIndex(
    worldTrianglesByMesh,
    sceneOrderByMesh,
    movementColliderMeshSets
  );
  const knownSafeCenterCache = createKnownSafeCenterCache();
  const sphereSweepScratch = createSphereSweepScratch();
  const groundSampleCache = new Map<
    string,
    Readonly<{ hit: SpatialHit | null }>
  >();

  return Object.freeze({
    movementColliderIndices,
    movementColliderMeshSets,
    groundColliderMeshes,
    beamBlockerMeshes,
    sightBlockerMeshes,
    blockerIndices,
    movementTrianglesByMesh,
    movementContainsByMesh,
    containsByVolume,
    intersectsEllipsoidByVolume,
    containsByBlocker,
    triangleSpatialIndex,
    knownSafeCenterCache,
    sphereSweepScratch,
    groundSampleCache,
    dispose: () => {
      for (const index of Object.values(movementColliderIndices)) {
        index.dispose();
      }
      for (const index of Object.values(blockerIndices)) {
        index.dispose();
      }
      triangleSpatialIndex.dispose();
      knownSafeCenterCache.dispose();
      groundSampleCache.clear();
      movementTrianglesByMesh.clear();
      movementContainsByMesh.clear();
      containsByVolume.clear();
      intersectsEllipsoidByVolume.clear();
      containsByBlocker.clear();
      worldTrianglesByMesh.clear();
    }
  });
};

export const createStageSpatialQueries = (
  scene: Scene,
  dynamicVariants: DynamicStageSpatialVariants,
  options: StageSpatialQueryOptions
): StageSpatialQueries => {
  let activeScene: Scene | null = scene;
  const requireActiveScene = () => {
    if (!activeScene) {
      throw new Error("破棄済みのStageSpatialQueriesは使用できません。");
    }
    return activeScene;
  };
  const sceneOrderByMesh = new Map(
    scene.meshes.map(
      (mesh, index) => [mesh as Mesh, index] as const
    )
  );
  const volumesByRole = new Map<StageVolumeRole, StageVolume[]>(
    STAGE_VOLUME_ROLES.map((role) => [role, []])
  );
  const volumesById = new Map<string, StageVolume>();
  for (const volume of options.volumes) {
    if (volumesById.has(volume.id)) {
      throw new Error(`Stage Volume IDが重複しています: ${volume.id}`);
    }
    volumesById.set(volume.id, volume);
    volumesByRole.get(volume.role)!.push(volume);
  }
  const revisionResource =
    registerDynamicStageSpatialSnapshotResource(
      dynamicVariants,
      (snapshot) => {
        const resources = createStageSpatialRevisionResources(
          snapshot,
          sceneOrderByMesh,
          options.volumes
        );
        return Object.freeze({
          value: resources,
          dispose: resources.dispose
        });
      }
    );
  let lastSnapshotRevision = dynamicVariants.revision;
  const withRevisionResources = <T>(
    callback: (resources: StageSpatialRevisionResources) => T
  ): T => {
    requireActiveScene();
    const snapshot = dynamicVariants.getSnapshot();
    lastSnapshotRevision = snapshot.revision;
    return revisionResource.use(snapshot, callback);
  };

  const queries: StageSpatialQueries = {
    get revision() {
      requireActiveScene();
      lastSnapshotRevision = dynamicVariants.revision;
      return lastSnapshotRevision;
    },
    castMovementSegment: (moverKind, from, to) => {
      return withRevisionResources((resources) =>
        castIndexedSegment(
          "movement",
          resources.triangleSpatialIndex,
          resources.movementColliderMeshSets[moverKind],
          from,
          to,
          options.diagnostics
        )
      );
    },
    castMovementSphere: (moverKind, from, to, radius) => {
      return withRevisionResources((resources) =>
        castSphere(
          moverKind,
          resources.movementColliderIndices[moverKind],
          resources.triangleSpatialIndex,
          resources.movementColliderMeshSets[moverKind],
          resources.knownSafeCenterCache,
          resources.movementTrianglesByMesh,
          resources.movementContainsByMesh,
          sceneOrderByMesh,
          resources.sphereSweepScratch,
          from,
          to,
          radius,
          options.diagnostics
        )
      );
    },
    castBeamSegment: (from, to) => {
      return withRevisionResources((resources) =>
        castIndexedSegment(
          "beam",
          resources.triangleSpatialIndex,
          resources.beamBlockerMeshes,
          from,
          to,
          options.diagnostics
        )
      );
    },
    castSightSegment: (from, to) => {
      return withRevisionResources((resources) =>
        castIndexedSegment(
          "sight",
          resources.triangleSpatialIndex,
          resources.sightBlockerMeshes,
          from,
          to,
          options.diagnostics
        )
      );
    },
    sampleGround: (origin, maxDistance) => {
      return withRevisionResources((resources) => {
        const cacheKey =
          `${exactNumberKey(origin.x)}|${exactNumberKey(origin.y)}|` +
          `${exactNumberKey(origin.z)}|${exactNumberKey(maxDistance)}`;
        const cached = resources.groundSampleCache.get(cacheKey);
        if (cached) {
          resources.groundSampleCache.delete(cacheKey);
          resources.groundSampleCache.set(cacheKey, cached);
          options.diagnostics?.recordRayQuery("ground", 0, 0);
          return cached.hit ? cloneSpatialHit(cached.hit) : null;
        }
        const groundEnd = origin.add(Vector3.Down().scale(maxDistance));
        const hit = castIndexedSegment(
          "ground",
          resources.triangleSpatialIndex,
          resources.groundColliderMeshes,
          origin,
          groundEnd,
          options.diagnostics,
          (candidate) => candidate.normal.y > 0
        );
        resources.groundSampleCache.set(
          cacheKey,
          Object.freeze({ hit })
        );
        if (
          resources.groundSampleCache.size >
          GROUND_SAMPLE_CACHE_MAX_ENTRIES
        ) {
          const oldestKey =
            resources.groundSampleCache.keys().next().value;
          if (oldestKey !== undefined) {
            resources.groundSampleCache.delete(oldestKey);
          }
        }
        return hit ? cloneSpatialHit(hit) : null;
      });
    },
    containsVolume: (role, point) => {
      return withRevisionResources((resources) =>
        volumesByRole.get(role)!.some((volume) =>
          resources.containsByVolume.get(volume)!(point)
        )
      );
    },
    containsVolumeById: (id, point) => {
      requireActiveScene();
      const volume = volumesById.get(id);
      if (!volume) {
        throw new Error(`未登録のStage Volume IDです: ${id}`);
      }
      assertFiniteVector(`Stage Volume ${id}の包含判定点`, point);
      return withRevisionResources((resources) =>
        resources.containsByVolume.get(volume)!(point)
      );
    },
    intersectsVolumeById: (id, ellipsoid) => {
      requireActiveScene();
      const volume = volumesById.get(id);
      if (!volume) {
        throw new Error(`未登録のStage Volume IDです: ${id}`);
      }
      assertCharacterEllipsoid(ellipsoid);
      return withRevisionResources((resources) =>
        resources.intersectsEllipsoidByVolume.get(volume)!(ellipsoid)
      );
    },
    findContainingBlocker: (kind, point) => {
      assertFiniteVector(`${kind} blockerの包含判定点`, point);
      return withRevisionResources((resources) => {
        const blockers = resources.blockerIndices[kind].query(
          point,
          point
        );
        for (const blocker of blockers) {
          if (resources.containsByBlocker.get(blocker)!(point)) {
            return blocker;
          }
        }
        return null;
      });
    },
    dispose: () => {
      requireActiveScene();
      activeScene = null;
      revisionResource.dispose();
      volumesByRole.clear();
      volumesById.clear();
      sceneOrderByMesh.clear();
    }
  };
  return Object.freeze(queries);
};

export const createStageBoundaryContainsQuery = (boundaryMesh: Mesh) =>
  createContainsPointQuery(boundaryMesh);

export const createStageVolumeContainsSegmentQuery = (volumeMesh: Mesh) =>
  createContainsSegmentQueryFromTriangles(buildWorldTriangles(volumeMesh));
