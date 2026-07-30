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
import { BIT_FLIGHT_NAVIGATION_LINKS } from "./navigationWorldInternal";
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

export type NavigationRouteCandidate = Readonly<{
  kind: "surface" | "link";
  path: NavigationPath;
}>;

export type NavigationRoutePolicy = Readonly<{
  selectRoute(
    candidates: readonly NavigationRouteCandidate[]
  ): NavigationRouteCandidate | null;
}>;

export const DISTANCE_NAVIGATION_ROUTE_POLICY: NavigationRoutePolicy =
  Object.freeze({
    selectRoute: (candidates) => {
      let selected: NavigationRouteCandidate | null = null;
      for (const candidate of candidates) {
        if (
          !selected ||
          candidate.path.distance < selected.path.distance ||
          (candidate.path.distance === selected.path.distance &&
            candidate.kind === "surface" &&
            selected.kind === "link")
        ) {
          selected = candidate;
        }
      }
      return selected;
    }
  });

export interface NavigationWorld {
  projectPoint(position: Vector3, maxDistance: number): NavigationLocation | null;
  findSurfacePath(
    start: NavigationLocation,
    destination: NavigationLocation
  ): NavigationSurfaceStep | null;
  findPath(
    start: NavigationLocation,
    destination: NavigationLocation,
    moverKind: StageMoverKind,
    routePolicy: NavigationRoutePolicy
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

type LinkEndpointRouteNode = Readonly<{
  location: NavigationLocation;
  linkEndpointIndex: number;
}>;

type RouteEdge = Readonly<{
  fromIndex: number;
  toIndex: number;
  transition: NavigationTransitionStep | null;
  distance: number;
}>;

const queryHalfExtents = Object.freeze({ x: 0.5, y: 0.25, z: 0.5 });
const queryNodeCapacity = 65535;
const pathPolygonCapacity = 32768;
const straightPathPointCapacity = 4096;
const straightPathCornersOnly = 0;
const linkSurfaceEpsilon = 0.025;
const straightPathPointEqualityThreshold = 1 / 16_384;

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

const cloneNavigationSurfaceStep = (
  step: NavigationSurfaceStep
): NavigationSurfaceStep =>
  Object.freeze({
    kind: "surface",
    points: Object.freeze(step.points.map(cloneNavigationLocation)),
    distance: step.distance
  });

const createDirectedLinkEndpointPairKey = (
  fromEndpointIndex: number,
  toEndpointIndex: number,
  endpointCount: number
) => fromEndpointIndex * endpointCount + toEndpointIndex;

const calculateNavMeshMinimumY = (navMesh: NavMesh) => {
  const [positions] = getNavMeshPositionsAndIndices(navMesh);
  let minimumY = Number.POSITIVE_INFINITY;
  for (let index = 1; index < positions.length; index += 3) {
    minimumY = Math.min(minimumY, positions[index]);
  }
  if (!Number.isFinite(minimumY)) {
    throw new Error("NavMeshの高さ範囲を取得できません。");
  }
  return minimumY;
};

const calculateNavMeshPolygonComponents = (navMesh: NavMesh) => {
  const adjacentPolygonRefs = new Map<number, number[]>();
  for (let tileIndex = 0; tileIndex < navMesh.getMaxTiles(); tileIndex += 1) {
    const tile = navMesh.getTile(tileIndex);
    const header = tile.header();
    if (!header) {
      continue;
    }
    const polygonRefBase = navMesh.getPolyRefBase(tile);
    for (let polygonIndex = 0; polygonIndex < header.polyCount(); polygonIndex += 1) {
      const polygonRef = polygonRefBase + polygonIndex;
      const adjacent = adjacentPolygonRefs.get(polygonRef) ?? [];
      let linkIndex = tile.polys(polygonIndex).firstLink();
      while (linkIndex !== Detour.DT_NULL_LINK) {
        const link = tile.links(linkIndex);
        if (link.ref() !== 0) {
          adjacent.push(link.ref());
        }
        linkIndex = link.next();
      }
      adjacentPolygonRefs.set(polygonRef, adjacent);
    }
  }

  const componentByPolygonRef = new Map<number, number>();
  let nextComponent = 0;
  for (const polygonRef of adjacentPolygonRefs.keys()) {
    if (componentByPolygonRef.has(polygonRef)) {
      continue;
    }
    const pending = [polygonRef];
    componentByPolygonRef.set(polygonRef, nextComponent);
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const adjacent of adjacentPolygonRefs.get(current) ?? []) {
        if (
          !adjacentPolygonRefs.has(adjacent) ||
          componentByPolygonRef.has(adjacent)
        ) {
          continue;
        }
        componentByPolygonRef.set(adjacent, nextComponent);
        pending.push(adjacent);
      }
    }
    nextComponent += 1;
  }
  return componentByPolygonRef;
};

const validateLinkPair = (pair: StageLinkPair) => {
  if (!Number.isFinite(pair.radiusMeters) || pair.radiusMeters <= 0) {
    throw new Error(`LNK_*の半径は正数が必要です: ${pair.id}`);
  }
  if (Vector3.Distance(pair.endpointA.position, pair.endpointB.position) === 0) {
    throw new Error(`LNK_*のA/Bには異なる位置が必要です: ${pair.id}`);
  }
};

class RecastNavigationWorld implements NavigationWorld {
  private readonly navMesh: NavMesh;
  private readonly query: NavMeshQuery;
  private readonly filter: QueryFilter;
  private readonly straightPathOptions: number;
  private readonly navMeshMinimumY: number;
  private readonly polygonComponentByRef: ReadonlyMap<number, number>;
  private readonly resolvedLinks: readonly ResolvedStageLink[];
  private readonly linkEndpoints: readonly NavigationLocation[];
  private readonly linkEndpointCount: number;
  private readonly linkEndpointSurfaceStepCache = new Map<
    number,
    NavigationSurfaceStep | null
  >;
  private readonly debugMeshes = new Set<Mesh>();
  private disposed = false;

  constructor(
    navMesh: NavMesh,
    query: NavMeshQuery,
    filter: QueryFilter,
    links: readonly StageLinkPair[],
    straightPathOptions: number
  ) {
    this.navMesh = navMesh;
    this.query = query;
    this.filter = filter;
    this.straightPathOptions = straightPathOptions;
    this.navMeshMinimumY = calculateNavMeshMinimumY(navMesh);
    this.polygonComponentByRef = calculateNavMeshPolygonComponents(navMesh);
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
    this.linkEndpoints = Object.freeze(
      this.resolvedLinks.flatMap((link) => [link.endpointA, link.endpointB])
    );
    this.linkEndpointCount = this.linkEndpoints.length;
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

  findSurfacePath(
    start: NavigationLocation,
    destination: NavigationLocation
  ) {
    this.assertActive();
    assertNavigationLocation("経路始点", start);
    assertNavigationLocation("経路終点", destination);
    const step = this.findSurfaceStep(start, destination);
    return step ? cloneNavigationSurfaceStep(step) : null;
  }

  findPath(
    start: NavigationLocation,
    destination: NavigationLocation,
    moverKind: StageMoverKind,
    routePolicy: NavigationRoutePolicy
  ) {
    this.assertActive();
    assertNavigationLocation("経路始点", start);
    assertNavigationLocation("経路終点", destination);

    const candidates: NavigationRouteCandidate[] = [];
    const selectRoute = () => {
      if (candidates.length === 0) {
        return null;
      }
      const frozenCandidates = Object.freeze([...candidates]);
      const selected = routePolicy.selectRoute(frozenCandidates);
      if (selected === null) {
        return null;
      }
      if (!frozenCandidates.includes(selected)) {
        throw new Error(
          "NavigationRoutePolicyは提示された候補またはnullを返す必要があります。"
        );
      }
      return selected.path;
    };
    const directSurfaceStep = this.findSurfaceStep(start, destination);
    if (directSurfaceStep) {
      const step = cloneNavigationSurfaceStep(directSurfaceStep);
      candidates.push(
        Object.freeze({
          kind: "surface",
          path: Object.freeze({
            steps: Object.freeze([step]),
            destination: cloneNavigationLocation(destination),
            distance: step.distance
          })
        })
      );
    }
    const availableLinks = this.resolvedLinks.flatMap((link, linkIndex) =>
      canStageMoverUseLink(moverKind, link.pair.kind)
        ? [
            {
              link,
              endpointAIndex: linkIndex * 2,
              endpointBIndex: linkIndex * 2 + 1
            }
          ]
        : []
    );
    if (availableLinks.length === 0) {
      return selectRoute();
    }

    const linkEndpointNodes: LinkEndpointRouteNode[] = [];
    for (const { link, endpointAIndex, endpointBIndex } of availableLinks) {
      linkEndpointNodes.push({
        location: cloneNavigationLocation(link.endpointA),
        linkEndpointIndex: endpointAIndex
      });
      linkEndpointNodes.push({
        location: cloneNavigationLocation(link.endpointB),
        linkEndpointIndex: endpointBIndex
      });
    }
    const nodes: RouteNode[] = [
      { location: cloneNavigationLocation(start) },
      { location: cloneNavigationLocation(destination) },
      ...linkEndpointNodes
    ];
    const nodeComponents = nodes.map((node) => {
      const component = this.polygonComponentByRef.get(node.location.polygonRef);
      if (component === undefined) {
        throw new Error(
          `NavMesh面の連結成分を取得できません: ${node.location.polygonRef}`
        );
      }
      return component;
    });

    const createSurfaceEdge = (
      fromIndex: number,
      toIndex: number
    ): RouteEdge | null => {
      if (nodeComponents[fromIndex] !== nodeComponents[toIndex]) {
        return null;
      }
      return Object.freeze({
        fromIndex,
        toIndex,
        transition: null,
        distance: Vector3.Distance(
          nodes[fromIndex].location.position,
          nodes[toIndex].location.position
        )
      });
    };

    const transitionEdgesByFromIndex = new Map<number, RouteEdge[]>();
    availableLinks.forEach(({ link }, linkIndex) => {
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
        const rawFrom =
          from === "A" ? link.pair.endpointA.position : link.pair.endpointB.position;
        const rawTo =
          to === "A" ? link.pair.endpointA.position : link.pair.endpointB.position;
        const distance =
          Vector3.Distance(entry.position, rawFrom) +
          Vector3.Distance(rawFrom, rawTo) +
          Vector3.Distance(rawTo, exit.position);
        const step: NavigationTransitionStep = Object.freeze({
          kind: "transition",
          link: link.pair,
          from,
          to,
          entry: cloneNavigationLocation(entry),
          exit: cloneNavigationLocation(exit),
          distance
        });
        const edges = transitionEdgesByFromIndex.get(fromIndex) ?? [];
        edges.push(
          Object.freeze({ fromIndex, toIndex, transition: step, distance })
        );
        transitionEdgesByFromIndex.set(fromIndex, edges);
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

    const collectOutgoingEdges = (fromIndex: number) => {
      const edges: RouteEdge[] = [];
      if (fromIndex === 0) {
        for (let toIndex = 2; toIndex < nodes.length; toIndex += 1) {
          const edge = createSurfaceEdge(0, toIndex);
          if (edge) {
            edges.push(edge);
          }
        }
        return edges;
      }
      if (fromIndex < 2) {
        return edges;
      }

      const destinationEdge = createSurfaceEdge(fromIndex, 1);
      if (destinationEdge) {
        edges.push(destinationEdge);
      }
      for (let toIndex = 2; toIndex < nodes.length; toIndex += 1) {
        if (fromIndex === toIndex) {
          continue;
        }
        const edge = createSurfaceEdge(fromIndex, toIndex);
        if (edge) {
          edges.push(edge);
        }
      }
      edges.push(
        ...(transitionEdgesByFromIndex.get(fromIndex) ?? [])
      );
      return edges;
    };

    {
      const routeStateCount = nodes.length * 2;
      const createRouteStateIndex = (
        nodeIndex: number,
        usedTransition: boolean
      ) => nodeIndex * 2 + (usedTransition ? 1 : 0);
      const startStateIndex = createRouteStateIndex(0, false);
      const destinationStateIndex = createRouteStateIndex(1, true);
      const distances = Array.from(
        { length: routeStateCount },
        () => Number.POSITIVE_INFINITY
      );
      const previousStates: Array<
        Readonly<{
          edge: RouteEdge;
          fromStateIndex: number;
        }> | null
      > = Array.from({ length: routeStateCount }, () => null);
      const visited = Array.from(
        { length: routeStateCount },
        () => false
      );
      distances[startStateIndex] = 0;
      for (
        let iteration = 0;
        iteration < routeStateCount;
        iteration += 1
      ) {
        let currentStateIndex = -1;
        let currentDistance = Number.POSITIVE_INFINITY;
        for (
          let candidateStateIndex = 0;
          candidateStateIndex < routeStateCount;
          candidateStateIndex += 1
        ) {
          if (
            !visited[candidateStateIndex] &&
            distances[candidateStateIndex] < currentDistance
          ) {
            currentStateIndex = candidateStateIndex;
            currentDistance = distances[candidateStateIndex];
          }
        }
        if (
          currentStateIndex < 0 ||
          currentStateIndex === destinationStateIndex
        ) {
          break;
        }
        visited[currentStateIndex] = true;
        const currentNodeIndex = Math.floor(
          currentStateIndex / 2
        );
        const usedTransition = currentStateIndex % 2 === 1;
        for (const edge of collectOutgoingEdges(currentNodeIndex)) {
          const nextStateIndex = createRouteStateIndex(
            edge.toIndex,
            usedTransition || edge.transition !== null
          );
          if (visited[nextStateIndex]) {
            continue;
          }
          const candidateDistance =
            distances[currentStateIndex] + edge.distance;
          if (
            candidateDistance < distances[nextStateIndex]
          ) {
            distances[nextStateIndex] = candidateDistance;
            previousStates[nextStateIndex] = Object.freeze({
              edge,
              fromStateIndex: currentStateIndex
            });
          }
        }
      }

      if (Number.isFinite(distances[destinationStateIndex])) {
        const reversedEdges: RouteEdge[] = [];
      let routeStateIndex = destinationStateIndex;
      while (routeStateIndex !== startStateIndex) {
        const previous = previousStates[routeStateIndex];
        if (!previous) {
          throw new Error(
            "NavMesh経路グラフの復元に失敗しました。"
          );
        }
        reversedEdges.push(previous.edge);
        routeStateIndex = previous.fromStateIndex;
      }
      const steps: NavigationPathStep[] = [];
      for (const edge of reversedEdges.reverse()) {
        if (edge.transition) {
          steps.push(edge.transition);
          continue;
        }
        let surfaceStep: NavigationSurfaceStep | null;
        if (edge.fromIndex >= 2 && edge.toIndex >= 2) {
          surfaceStep = this.getLinkEndpointSurfaceStep(
            linkEndpointNodes[edge.fromIndex - 2]
              .linkEndpointIndex,
            linkEndpointNodes[edge.toIndex - 2]
              .linkEndpointIndex
          );
        } else {
          surfaceStep = this.findSurfaceStep(
            nodes[edge.fromIndex].location,
            nodes[edge.toIndex].location
          );
        }
        if (!surfaceStep) {
          throw new Error(
            "NavMesh連結成分内のsurface経路を復元できません。"
          );
        }
        steps.push(cloneNavigationSurfaceStep(surfaceStep));
      }
      const frozenSteps = Object.freeze(steps);
      const actualDistance = frozenSteps.reduce(
        (sum, step) => sum + step.distance,
        0
      );
        candidates.push(
          Object.freeze({
            kind: "link",
            path: Object.freeze({
              steps: frozenSteps,
              destination: cloneNavigationLocation(destination),
              distance: actualDistance
            })
          })
        );
      }
    }
    return selectRoute();
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
    this.linkEndpointSurfaceStepCache.clear();
    this.query.destroy();
    Raw.destroy(this.filter.raw);
    this.navMesh.destroy();
  }

  private findSurfaceStep(
    start: NavigationLocation,
    destination: NavigationLocation
  ): NavigationSurfaceStep | null {
    const startComponent = this.polygonComponentByRef.get(
      start.polygonRef
    );
    const destinationComponent = this.polygonComponentByRef.get(
      destination.polygonRef
    );
    if (
      startComponent !== undefined &&
      destinationComponent !== undefined
    ) {
      if (startComponent !== destinationComponent) {
        return null;
      }
      if (start.polygonRef === destination.polygonRef) {
        const positionsAreEquivalent =
          Vector3.DistanceSquared(
            start.position,
            destination.position
          ) <
          straightPathPointEqualityThreshold *
            straightPathPointEqualityThreshold;
        const points = Object.freeze(
          positionsAreEquivalent
            ? [cloneNavigationLocation(start)]
            : [
                cloneNavigationLocation(start),
                cloneNavigationLocation(destination)
              ]
        );
        return Object.freeze({
          kind: "surface",
          points,
          distance: calculatePointDistance(points)
        });
      }
    }

    const corridor = this.query.findPath(
      start.polygonRef,
      destination.polygonRef,
      toRecastPosition(start.position),
      toRecastPosition(destination.position),
      { maxPathPolys: pathPolygonCapacity }
    );
    try {
      if ((corridor.status & Detour.DT_OUT_OF_NODES) !== 0) {
        throw new Error("NavMesh経路探索が設定済みのノード上限を超えました。");
      }
      if ((corridor.status & Detour.DT_BUFFER_TOO_SMALL) !== 0) {
        throw new Error("NavMesh経路探索が設定済みの経路出力上限を超えました。");
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
        {
          maxStraightPathPoints: straightPathPointCapacity,
          straightPathOptions: this.straightPathOptions
        }
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

  private getLinkEndpointSurfaceStep(
    fromEndpointIndex: number,
    toEndpointIndex: number
  ): NavigationSurfaceStep | null {
    const key = createDirectedLinkEndpointPairKey(
      fromEndpointIndex,
      toEndpointIndex,
      this.linkEndpointCount
    );
    if (!this.linkEndpointSurfaceStepCache.has(key)) {
      this.linkEndpointSurfaceStepCache.set(
        key,
        this.findSurfaceStep(
          this.linkEndpoints[fromEndpointIndex],
          this.linkEndpoints[toEndpointIndex]
        )
      );
    }
    return this.linkEndpointSurfaceStepCache.get(key) ?? null;
  }

  private projectLinkEndpoint(
    pair: StageLinkPair,
    endpointName: StageLinkEndpointName
  ) {
    const endpoint = endpointName === "A" ? pair.endpointA : pair.endpointB;
    assertFiniteVector(`LNK_${pair.id}_${endpointName}`, endpoint.position);
    const horizontalDistance = pair.radiusMeters * BLENDER_METERS_TO_WORLD_UNITS;
    const recastPosition = toRecastPosition(endpoint.position);
    const verticalRange = endpoint.position.y - this.navMeshMinimumY;
    if (verticalRange < -linkSurfaceEpsilon) {
      throw new Error(
        `LNK_*端点の直下にNavMesh面がありません: ${pair.id}_${endpointName} ` +
          `(endpointY=${endpoint.position.y}, navMeshMinimumY=${this.navMeshMinimumY})`
      );
    }
    const polygonResult = this.query.queryPolygons(
      {
        x: recastPosition.x,
        y: endpoint.position.y - Math.max(0, verticalRange) / 2,
        z: recastPosition.z
      },
      {
        x: horizontalDistance,
        y: Math.max(linkSurfaceEpsilon, verticalRange / 2 + linkSurfaceEpsilon),
        z: horizontalDistance
      },
      { maxPolys: pathPolygonCapacity }
    );
    if (
      !polygonResult.success ||
      (polygonResult.status & Detour.DT_BUFFER_TOO_SMALL) !== 0
    ) {
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
        left.horizontalDistance - right.horizontalDistance ||
        left.location.polygonRef - right.location.polygonRef
    );
    const nearest = candidates[0];
    if (!nearest) {
      throw new Error(
        `LNK_*端点の直下にNavMesh面がありません: ${pair.id}_${endpointName} ` +
          `(endpoint=${endpoint.position.toString()}, candidates=${polygonResult.polyRefs.length})`
      );
    }
    return nearest.location;
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("破棄済みのNavigationWorldは使用できません。");
    }
  }
}

export const createNavigationWorldFromNavMesh = (
  navMesh: NavMesh,
  links: readonly StageLinkPair[]
): NavigationWorld => {
  let filter: QueryFilter | null = null;
  let query: NavMeshQuery | null = null;
  try {
    filter = new QueryFilter();
    query = new NavMeshQuery(navMesh, {
      maxNodes: queryNodeCapacity,
      defaultQueryFilter: filter
    });
    return new RecastNavigationWorld(
      navMesh,
      query,
      filter,
      links,
      links === BIT_FLIGHT_NAVIGATION_LINKS
        ? straightPathCornersOnly
        : Detour.DT_STRAIGHTPATH_ALL_CROSSINGS
    );
  } catch (error) {
    query?.destroy();
    if (filter) {
      Raw.destroy(filter.raw);
    }
    navMesh.destroy();
    throw error;
  }
};

export const createNavigationWorld = async (
  navMeshData: Uint8Array,
  links: readonly StageLinkPair[]
): Promise<NavigationWorld> => {
  if (navMeshData.byteLength === 0) {
    throw new Error("NavMeshバイナリが空です。");
  }

  await initializeNavigationRuntime();
  const { navMesh } = importNavMesh(navMeshData);
  return createNavigationWorldFromNavMesh(navMesh, links);
};
