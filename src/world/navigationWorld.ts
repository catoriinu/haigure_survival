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

import {
  canStageMoverUseLink,
  type StageLinkEndpointName,
  type StageLinkPair,
  type StageMoverKind
} from "./stageLinks";
import { BLENDER_METERS_TO_WORLD_UNITS } from "./worldUnits";

export type NavigationLocation = Readonly<{
  position: Vector3;
  polygonRef: number;
}>;

export type NavigationSurfaceStep = Readonly<{
  kind: "surface";
  points: readonly NavigationLocation[];
  distance: number;
}>;

export type NavigationTransitionStep = Readonly<{
  kind: "transition";
  link: StageLinkPair;
  from: StageLinkEndpointName;
  to: StageLinkEndpointName;
  entry: NavigationLocation;
  exit: NavigationLocation;
  distance: number;
}>;

export type NavigationPathStep = NavigationSurfaceStep | NavigationTransitionStep;

export type NavigationPath = Readonly<{
  steps: readonly NavigationPathStep[];
  destination: NavigationLocation;
  distance: number;
}>;

export interface NavigationWorld {
  projectPoint(position: Vector3, maxDistance: number): NavigationLocation | null;
  findPath(
    start: NavigationLocation,
    destination: NavigationLocation,
    moverKind: StageMoverKind
  ): NavigationPath | null;
  constrainMovement(
    start: NavigationLocation,
    destination: Vector3
  ): NavigationLocation | null;
  randomPointAround(
    origin: NavigationLocation,
    radius: number
  ): NavigationLocation | null;
  createDebugMesh(scene: Scene): Mesh;
  dispose(): void;
}

type ResolvedStageLink = Readonly<{
  pair: StageLinkPair;
  endpointA: NavigationLocation;
  endpointB: NavigationLocation;
}>;

type RouteNode = Readonly<{
  location: NavigationLocation;
}>;

type RouteEdge = Readonly<{
  fromIndex: number;
  toIndex: number;
  step: NavigationPathStep;
  distance: number;
}>;

const queryHalfExtents = Object.freeze({ x: 0.5, y: 0.25, z: 0.5 });
const queryNodeCapacity = 4096;
const pathPolygonCapacity = 4096;
const straightPathPointCapacity = 4096;
const linkSurfaceMaximumVerticalDistance = 0.5;
const linkSurfaceEpsilon = 1e-5;

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

const assertNavigationLocation = (name: string, value: NavigationLocation) => {
  assertFiniteVector(`${name}の座標`, value.position);
  if (!Number.isInteger(value.polygonRef) || value.polygonRef <= 0) {
    throw new Error(`${name}には有効なNavMesh面IDが必要です。`);
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

const createNavigationLocation = (
  position: Vector3,
  polygonRef: number
): NavigationLocation => {
  const result = Object.freeze({ position: position.clone(), polygonRef });
  assertNavigationLocation("NavMesh位置", result);
  return result;
};

export const cloneNavigationLocation = (
  location: NavigationLocation
): NavigationLocation => {
  assertNavigationLocation("複製元のNavMesh位置", location);
  return createNavigationLocation(location.position, location.polygonRef);
};

const calculatePointDistance = (points: readonly NavigationLocation[]) => {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += Vector3.Distance(points[index - 1].position, points[index].position);
  }
  return distance;
};

const validateLinkPair = (pair: StageLinkPair) => {
  if (!Number.isFinite(pair.radiusMeters) || pair.radiusMeters <= 0) {
    throw new Error(`LNK_*の半径は正数が必要です: ${pair.id}`);
  }
  if (
    (pair.kind === "bit_window" || pair.kind === "bit_roof") &&
    !pair.bidirectional
  ) {
    throw new Error(`${pair.kind}は双方向必須です: ${pair.id}`);
  }
  if (Vector3.Distance(pair.endpointA.position, pair.endpointB.position) === 0) {
    throw new Error(`LNK_*のA/Bには異なる位置が必要です: ${pair.id}`);
  }
};

class RecastNavigationWorld implements NavigationWorld {
  private readonly navMesh: NavMesh;
  private readonly query: NavMeshQuery;
  private readonly filter: QueryFilter;
  private readonly resolvedLinks: readonly ResolvedStageLink[];
  private readonly debugMeshes = new Set<Mesh>();
  private disposed = false;

  constructor(
    navMesh: NavMesh,
    query: NavMeshQuery,
    filter: QueryFilter,
    links: readonly StageLinkPair[]
  ) {
    this.navMesh = navMesh;
    this.query = query;
    this.filter = filter;
    this.resolvedLinks = Object.freeze(
      links.map((pair) => {
        validateLinkPair(pair);
        return Object.freeze({
          pair,
          endpointA: this.projectLinkEndpoint(pair, "A"),
          endpointB: this.projectLinkEndpoint(pair, "B")
        });
      })
    );
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
    return Vector3.Distance(position, projected) <= maxDistance
      ? createNavigationLocation(projected, result.polyRef)
      : null;
  }

  findPath(
    start: NavigationLocation,
    destination: NavigationLocation,
    moverKind: StageMoverKind
  ) {
    this.assertActive();
    assertNavigationLocation("経路始点", start);
    assertNavigationLocation("経路終点", destination);

    const availableLinks = this.resolvedLinks.filter((link) =>
      canStageMoverUseLink(moverKind, link.pair.kind)
    );
    const nodes: RouteNode[] = [
      { location: cloneNavigationLocation(start) },
      { location: cloneNavigationLocation(destination) }
    ];
    for (const link of availableLinks) {
      nodes.push({ location: cloneNavigationLocation(link.endpointA) });
      nodes.push({ location: cloneNavigationLocation(link.endpointB) });
    }

    const edges: RouteEdge[] = [];
    for (let fromIndex = 0; fromIndex < nodes.length; fromIndex += 1) {
      for (let toIndex = 0; toIndex < nodes.length; toIndex += 1) {
        if (fromIndex === toIndex) {
          continue;
        }
        const step = this.findSurfaceStep(
          nodes[fromIndex].location,
          nodes[toIndex].location
        );
        if (step) {
          edges.push({
            fromIndex,
            toIndex,
            step,
            distance: step.distance
          });
        }
      }
    }

    availableLinks.forEach((link, linkIndex) => {
      const endpointAIndex = 2 + linkIndex * 2;
      const endpointBIndex = endpointAIndex + 1;
      const addTransition = (
        fromIndex: number,
        toIndex: number,
        from: StageLinkEndpointName,
        to: StageLinkEndpointName,
        entry: NavigationLocation,
        exit: NavigationLocation
      ) => {
        const distance = Vector3.Distance(
          from === "A" ? link.pair.endpointA.position : link.pair.endpointB.position,
          to === "A" ? link.pair.endpointA.position : link.pair.endpointB.position
        );
        const step: NavigationTransitionStep = Object.freeze({
          kind: "transition",
          link: link.pair,
          from,
          to,
          entry: cloneNavigationLocation(entry),
          exit: cloneNavigationLocation(exit),
          distance
        });
        edges.push({ fromIndex, toIndex, step, distance });
      };
      addTransition(
        endpointAIndex,
        endpointBIndex,
        "A",
        "B",
        link.endpointA,
        link.endpointB
      );
      if (link.pair.bidirectional) {
        addTransition(
          endpointBIndex,
          endpointAIndex,
          "B",
          "A",
          link.endpointB,
          link.endpointA
        );
      }
    });

    const distances = nodes.map(() => Number.POSITIVE_INFINITY);
    const previousEdges: Array<RouteEdge | null> = nodes.map(() => null);
    const visited = nodes.map(() => false);
    distances[0] = 0;
    for (let iteration = 0; iteration < nodes.length; iteration += 1) {
      let currentIndex = -1;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < nodes.length; index += 1) {
        if (!visited[index] && distances[index] < currentDistance) {
          currentIndex = index;
          currentDistance = distances[index];
        }
      }
      if (currentIndex < 0 || currentIndex === 1) {
        break;
      }
      visited[currentIndex] = true;
      for (const edge of edges) {
        if (edge.fromIndex !== currentIndex || visited[edge.toIndex]) {
          continue;
        }
        const candidateDistance = currentDistance + edge.distance;
        if (candidateDistance < distances[edge.toIndex]) {
          distances[edge.toIndex] = candidateDistance;
          previousEdges[edge.toIndex] = edge;
        }
      }
    }

    if (!Number.isFinite(distances[1])) {
      return null;
    }
    const reversedSteps: NavigationPathStep[] = [];
    let nodeIndex = 1;
    while (nodeIndex !== 0) {
      const edge = previousEdges[nodeIndex];
      if (!edge) {
        throw new Error("NavMesh経路グラフの復元に失敗しました。");
      }
      reversedSteps.push(edge.step);
      nodeIndex = edge.fromIndex;
    }
    const steps = Object.freeze(reversedSteps.reverse());
    return Object.freeze({
      steps,
      destination: cloneNavigationLocation(destination),
      distance: distances[1]
    });
  }

  constrainMovement(start: NavigationLocation, destination: Vector3) {
    this.assertActive();
    assertNavigationLocation("移動始点", start);
    assertFiniteVector("移動終点", destination);

    const result = this.query.moveAlongSurface(
      start.polygonRef,
      toRecastPosition(start.position),
      toRecastPosition(destination)
    );
    if (!result.success) {
      return null;
    }
    const polygonRef = result.visited[result.visited.length - 1] ?? start.polygonRef;
    return createNavigationLocation(toBabylonPosition(result.resultPosition), polygonRef);
  }

  randomPointAround(origin: NavigationLocation, radius: number) {
    this.assertActive();
    assertNavigationLocation("ランダム点の中心", origin);
    assertNonNegativeFiniteNumber("ランダム点の半径", radius);

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const result = this.query.findRandomPointAroundCircle(
        toRecastPosition(origin.position),
        radius,
        {
          startRef: origin.polygonRef,
          halfExtents: queryHalfExtents
        }
      );
      if (!result.success || result.randomPolyRef === 0) {
        return null;
      }

      const point = toBabylonPosition(result.randomPoint);
      if (Vector3.Distance(origin.position, point) <= radius) {
        return createNavigationLocation(point, result.randomPolyRef);
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

  private findSurfaceStep(
    start: NavigationLocation,
    destination: NavigationLocation
  ): NavigationSurfaceStep | null {
    const corridor = this.query.findPath(
      start.polygonRef,
      destination.polygonRef,
      toRecastPosition(start.position),
      toRecastPosition(destination.position),
      { maxPathPolys: pathPolygonCapacity }
    );
    try {
      if ((corridor.status & (Detour.DT_BUFFER_TOO_SMALL | Detour.DT_OUT_OF_NODES)) !== 0) {
        throw new Error("NavMesh経路探索が設定済みの探索上限を超えました。");
      }
      if (
        !corridor.success ||
        corridor.polys.size === 0 ||
        corridor.polys.get(corridor.polys.size - 1) !== destination.polygonRef
      ) {
        return null;
      }

      const straightPath = this.query.findStraightPath(
        toRecastPosition(start.position),
        toRecastPosition(destination.position),
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

        const points: NavigationLocation[] = [];
        for (let index = 0; index < straightPath.straightPathCount; index += 1) {
          const point = toBabylonPosition({
            x: straightPath.straightPath.get(index * 3),
            y: straightPath.straightPath.get(index * 3 + 1),
            z: straightPath.straightPath.get(index * 3 + 2)
          });
          const polygonRef =
            index === 0
              ? start.polygonRef
              : index === straightPath.straightPathCount - 1
                ? destination.polygonRef
                : straightPath.straightPathRefs.get(index) || start.polygonRef;
          points.push(createNavigationLocation(point, polygonRef));
        }
        const frozenPoints = Object.freeze(points);
        return Object.freeze({
          kind: "surface",
          points: frozenPoints,
          distance: calculatePointDistance(frozenPoints)
        });
      } finally {
        straightPath.straightPath.destroy();
        straightPath.straightPathFlags.destroy();
        straightPath.straightPathRefs.destroy();
      }
    } finally {
      corridor.polys.destroy();
    }
  }

  private projectLinkEndpoint(
    pair: StageLinkPair,
    endpointName: StageLinkEndpointName
  ) {
    const endpoint = endpointName === "A" ? pair.endpointA : pair.endpointB;
    assertFiniteVector(`LNK_${pair.id}_${endpointName}`, endpoint.position);
    const horizontalDistance = pair.radiusMeters * BLENDER_METERS_TO_WORLD_UNITS;
    const recastPosition = toRecastPosition(endpoint.position);
    const polygonResult = this.query.queryPolygons(
      recastPosition,
      {
        x: horizontalDistance,
        y: linkSurfaceMaximumVerticalDistance,
        z: horizontalDistance
      },
      { maxPolys: pathPolygonCapacity }
    );
    if (!polygonResult.success) {
      throw new Error(`LNK_*端点周辺のNavMesh面取得に失敗しました: ${pair.id}_${endpointName}`);
    }

    const candidates: Array<{
      location: NavigationLocation;
      verticalDistance: number;
      horizontalDistance: number;
    }> = [];
    for (const polygonRef of polygonResult.polyRefs) {
      const closest = this.query.closestPointOnPoly(polygonRef, recastPosition);
      if (!closest.success) {
        continue;
      }
      const position = toBabylonPosition(closest.closestPoint);
      const verticalDistance = endpoint.position.y - position.y;
      const planarDistance = Math.hypot(
        endpoint.position.x - position.x,
        endpoint.position.z - position.z
      );
      if (
        verticalDistance >= -linkSurfaceEpsilon &&
        verticalDistance <= linkSurfaceMaximumVerticalDistance + linkSurfaceEpsilon &&
        planarDistance <= horizontalDistance + linkSurfaceEpsilon
      ) {
        candidates.push({
          location: createNavigationLocation(position, polygonRef),
          verticalDistance: Math.max(0, verticalDistance),
          horizontalDistance: planarDistance
        });
      }
    }
    candidates.sort(
      (left, right) =>
        left.verticalDistance - right.verticalDistance ||
        left.horizontalDistance - right.horizontalDistance
    );
    const nearest = candidates[0];
    if (!nearest) {
      throw new Error(`LNK_*端点の直下にNavMesh面がありません: ${pair.id}_${endpointName}`);
    }
    return nearest.location;
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("破棄済みのNavigationWorldは使用できません。");
    }
  }
}

export const createNavigationWorld = async (
  navMeshData: Uint8Array,
  links: readonly StageLinkPair[]
): Promise<NavigationWorld> => {
  if (navMeshData.byteLength === 0) {
    throw new Error("NavMeshバイナリが空です。");
  }

  await initializeNavigationRuntime();
  const { navMesh } = importNavMesh(navMeshData);
  let filter: QueryFilter | null = null;
  let query: NavMeshQuery | null = null;
  try {
    filter = new QueryFilter();
    query = new NavMeshQuery(navMesh, {
      maxNodes: queryNodeCapacity,
      defaultQueryFilter: filter
    });
    return new RecastNavigationWorld(navMesh, query, filter, links);
  } catch (error) {
    query?.destroy();
    if (filter) {
      Raw.destroy(filter.raw);
    }
    navMesh.destroy();
    throw error;
  }
};
