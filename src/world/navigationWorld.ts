import {
  Color3,
  Mesh,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexData
} from "@babylonjs/core";
import {
  Detour,
  NavMeshQuery,
  QueryFilter,
  Raw,
  getNavMeshPositionsAndIndices,
  importNavMesh,
  init,
  type NavMesh
} from "recast-navigation";

export type NavigationPath = Readonly<{
  points: readonly Vector3[];
  distance: number;
}>;

export interface NavigationWorld {
  projectPoint(position: Vector3, maxDistance: number): Vector3 | null;
  findPath(start: Vector3, destination: Vector3): NavigationPath | null;
  constrainMovement(start: Vector3, destination: Vector3): Vector3 | null;
  randomPointAround(origin: Vector3, radius: number): Vector3 | null;
  createDebugMesh(scene: Scene): Mesh;
  dispose(): void;
}

const queryHalfExtents = Object.freeze({ x: 0.5, y: 0.25, z: 0.5 });
const queryNodeCapacity = 4096;
const pathPolygonCapacity = 4096;
const straightPathPointCapacity = 4096;

let recastInitialization: Promise<void> | null = null;

export const initializeNavigationRuntime = () => {
  if (!recastInitialization) {
    recastInitialization = init();
  }
  return recastInitialization;
};

const assertFiniteVector = (name: string, value: Vector3) => {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const toRecastPosition = (position: Vector3) => ({
  x: -position.x,
  y: position.y,
  z: position.z
});

const toBabylonPosition = (position: Readonly<{ x: number; y: number; z: number }>) => {
  const result = new Vector3(-position.x, position.y, position.z);
  assertFiniteVector("Recastの問い合わせ結果", result);
  return result;
};

const calculatePathDistance = (points: readonly Vector3[]) => {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += Vector3.Distance(points[index - 1], points[index]);
  }
  return distance;
};

class RecastNavigationWorld implements NavigationWorld {
  private readonly navMesh: NavMesh;
  private readonly query: NavMeshQuery;
  private readonly filter: QueryFilter;
  private readonly debugMeshes = new Set<Mesh>();
  private disposed = false;

  constructor(navMesh: NavMesh, query: NavMeshQuery, filter: QueryFilter) {
    this.navMesh = navMesh;
    this.query = query;
    this.filter = filter;
  }

  projectPoint(position: Vector3, maxDistance: number) {
    this.assertActive();
    assertFiniteVector("投影元", position);
    assertNonNegativeFiniteNumber("投影最大距離", maxDistance);

    const result = this.query.findClosestPoint(toRecastPosition(position), {
      halfExtents: { x: maxDistance, y: maxDistance, z: maxDistance }
    });
    if (!result.success || result.polyRef === 0) {
      return null;
    }

    const projected = toBabylonPosition(result.point);
    return Vector3.Distance(position, projected) <= maxDistance ? projected : null;
  }

  findPath(start: Vector3, destination: Vector3) {
    this.assertActive();
    assertFiniteVector("経路始点", start);
    assertFiniteVector("経路終点", destination);

    const startPolygon = this.query.findNearestPoly(toRecastPosition(start), {
      halfExtents: queryHalfExtents
    });
    const destinationPolygon = this.query.findNearestPoly(toRecastPosition(destination), {
      halfExtents: queryHalfExtents
    });
    if (
      !startPolygon.success ||
      startPolygon.nearestRef === 0 ||
      !destinationPolygon.success ||
      destinationPolygon.nearestRef === 0
    ) {
      return null;
    }

    const corridor = this.query.findPath(
      startPolygon.nearestRef,
      destinationPolygon.nearestRef,
      startPolygon.nearestPoint,
      destinationPolygon.nearestPoint,
      { maxPathPolys: pathPolygonCapacity }
    );
    try {
      if (
        (corridor.status & (Detour.DT_BUFFER_TOO_SMALL | Detour.DT_OUT_OF_NODES)) !== 0
      ) {
        throw new Error("NavMesh経路探索が設定済みの探索上限を超えました。");
      }
      if (
        !corridor.success ||
        corridor.polys.size === 0 ||
        corridor.polys.get(corridor.polys.size - 1) !== destinationPolygon.nearestRef
      ) {
        return null;
      }

      const straightPath = this.query.findStraightPath(
        startPolygon.nearestPoint,
        destinationPolygon.nearestPoint,
        corridor.polys,
        { maxStraightPathPoints: straightPathPointCapacity }
      );
      try {
        if ((straightPath.status & Detour.DT_BUFFER_TOO_SMALL) !== 0) {
          throw new Error("NavMesh直線経路が設定済みの出力上限を超えました。");
        }
        if (
          !straightPath.success ||
          straightPath.straightPathCount === 0 ||
          straightPath.straightPathRefs.get(straightPath.straightPathCount - 1) !== 0
        ) {
          return null;
        }

        const points: Vector3[] = [];
        for (let index = 0; index < straightPath.straightPathCount; index += 1) {
          points.push(
            toBabylonPosition({
              x: straightPath.straightPath.get(index * 3),
              y: straightPath.straightPath.get(index * 3 + 1),
              z: straightPath.straightPath.get(index * 3 + 2)
            })
          );
        }
        return {
          points,
          distance: calculatePathDistance(points)
        };
      } finally {
        straightPath.straightPath.destroy();
        straightPath.straightPathFlags.destroy();
        straightPath.straightPathRefs.destroy();
      }
    } finally {
      corridor.polys.destroy();
    }
  }

  constrainMovement(start: Vector3, destination: Vector3) {
    this.assertActive();
    assertFiniteVector("移動始点", start);
    assertFiniteVector("移動終点", destination);

    const recastStart = toRecastPosition(start);
    const startPolygon = this.query.findNearestPoly(recastStart, {
      halfExtents: queryHalfExtents
    });
    if (!startPolygon.success || startPolygon.nearestRef === 0) {
      return null;
    }

    const result = this.query.moveAlongSurface(
      startPolygon.nearestRef,
      startPolygon.nearestPoint,
      toRecastPosition(destination)
    );
    return result.success ? toBabylonPosition(result.resultPosition) : null;
  }

  randomPointAround(origin: Vector3, radius: number) {
    this.assertActive();
    assertFiniteVector("ランダム点の中心", origin);
    assertNonNegativeFiniteNumber("ランダム点の半径", radius);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const result = this.query.findRandomPointAroundCircle(
        toRecastPosition(origin),
        radius,
        { halfExtents: queryHalfExtents }
      );
      if (!result.success || result.randomPolyRef === 0) {
        return null;
      }

      const point = toBabylonPosition(result.randomPoint);
      if (Vector3.Distance(origin, point) <= radius) {
        return point;
      }
    }
    return null;
  }

  createDebugMesh(scene: Scene) {
    this.assertActive();

    const [recastPositions, indices] = getNavMeshPositionsAndIndices(this.navMesh);
    const positions = recastPositions.slice();
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] = -positions[index];
    }

    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;

    const debugMesh = new Mesh("NavigationWorldDebugMesh", scene);
    vertexData.applyToMesh(debugMesh);
    debugMesh.position.y = 0.006;

    const material = new StandardMaterial("NavigationWorldDebugMaterial", scene);
    material.diffuseColor = new Color3(0.1, 0.72, 0.53);
    material.emissiveColor = new Color3(0.03, 0.2, 0.14);
    material.alpha = 0.45;
    material.backFaceCulling = false;
    debugMesh.material = material;

    this.debugMeshes.add(debugMesh);
    return debugMesh;
  }

  dispose() {
    this.assertActive();
    this.disposed = true;
    this.debugMeshes.forEach((mesh) => mesh.dispose(false, true));
    this.debugMeshes.clear();
    this.query.destroy();
    Raw.destroy(this.filter.raw);
    this.navMesh.destroy();
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("破棄済みのNavigationWorldは使用できません。");
    }
  }
}

export const createNavigationWorld = async (navMeshData: Uint8Array): Promise<NavigationWorld> => {
  if (navMeshData.byteLength === 0) {
    throw new Error("NavMeshバイナリが空です。");
  }

  await initializeNavigationRuntime();
  const { navMesh } = importNavMesh(navMeshData);
  let filter: QueryFilter | null = null;
  try {
    filter = new QueryFilter();
    const query = new NavMeshQuery(navMesh, {
      maxNodes: queryNodeCapacity,
      defaultQueryFilter: filter
    });
    return new RecastNavigationWorld(navMesh, query, filter);
  } catch (error) {
    if (filter) {
      Raw.destroy(filter.raw);
    }
    navMesh.destroy();
    throw error;
  }
};
