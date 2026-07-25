import { Mesh, Scene, Vector3 } from "@babylonjs/core";

import {
  cloneNavigationLocation,
  createNavigationWorld,
  type NavigationLocation,
  type NavigationSurfaceStep,
  type NavigationWorld
} from "./navigationWorld";

declare const BIT_FLIGHT_ZONE_ID: unique symbol;
declare const BIT_FLIGHT_BAND_ID: unique symbol;
const BIT_FLIGHT_LOCATION_IDENTITY: unique symbol = Symbol(
  "BitFlightLocationIdentity"
);
const BIT_FLIGHT_ROUTE_IDENTITY: unique symbol = Symbol(
  "BitFlightRouteIdentity"
);

export type BitFlightZoneId = string & {
  readonly [BIT_FLIGHT_ZONE_ID]: "BitFlightZoneId";
};

export type BitFlightBandId = string & {
  readonly [BIT_FLIGHT_BAND_ID]: "BitFlightBandId";
};

export const BIT_FLIGHT_SPACE_KINDS = ["indoor", "outdoor"] as const;
export type BitFlightSpaceKind = (typeof BIT_FLIGHT_SPACE_KINDS)[number];

export const BIT_FLIGHT_TRANSITION_KINDS = [
  "vertical",
  "aperture",
  "surface-route",
  "boundary"
] as const;
export type BitFlightTransitionKind =
  (typeof BIT_FLIGHT_TRANSITION_KINDS)[number];

export const BIT_FLIGHT_AFFORDANCES = [
  "search-vantage",
  "indoor-access",
  "outdoor-access",
  "stair-route",
  "window-access"
] as const;
export type BitFlightAffordance =
  (typeof BIT_FLIGHT_AFFORDANCES)[number];

export type BitFlightBandRef = Readonly<{
  zoneId: BitFlightZoneId;
  bandId: BitFlightBandId;
}>;

export type BitFlightZone = Readonly<{
  id: BitFlightZoneId;
  spaceKind: BitFlightSpaceKind;
}>;

export type BitFlightBand = Readonly<{
  zoneId: BitFlightZoneId;
  id: BitFlightBandId;
  minimumCenterHeight: number;
  maximumCenterHeight: number;
}>;

export const BIT_FLIGHT_HEIGHT_MODES = ["band", "low-ceiling"] as const;
export type BitFlightHeightMode =
  (typeof BIT_FLIGHT_HEIGHT_MODES)[number];

export type BitFlightHeightSelection = Readonly<{
  center: Vector3;
  heightMode: BitFlightHeightMode;
}>;

export type BitFlightLocation = Readonly<{
  zoneId: BitFlightZoneId;
  bandId: BitFlightBandId;
  surface: NavigationLocation;
  safeCenterHeight: number;
  heightMode: BitFlightHeightMode;
  readonly [BIT_FLIGHT_LOCATION_IDENTITY]: BitFlightLocationIdentity;
}>;

export type BitFlightTransitionRegion = Readonly<{
  minimum: Vector3;
  maximum: Vector3;
  contains(point: Vector3): boolean;
  containsSegment(from: Vector3, to: Vector3): boolean;
}>;

export type BitFlightTransition = Readonly<{
  id: string;
  kind: BitFlightTransitionKind;
  from: BitFlightBandRef;
  to: BitFlightBandRef;
  bidirectional: boolean;
  affordances: readonly BitFlightAffordance[];
  fromPosition: Vector3;
  toPosition: Vector3;
  traversalPoints: readonly Vector3[];
  region: BitFlightTransitionRegion | null;
}>;

export type BitFlightTransitionTraversal = Readonly<{
  transition: BitFlightTransition;
  from: BitFlightBandRef;
  to: BitFlightBandRef;
  reversed: boolean;
}>;

export type BitFlightSurfaceRouteStep = Readonly<{
  kind: "surface";
  band: BitFlightBandRef;
  points: readonly BitFlightLocation[];
  distance: number;
}>;

export type BitFlightTransitionRouteStep = Readonly<{
  kind: "transition";
  traversal: BitFlightTransitionTraversal;
  entry: BitFlightLocation;
  exit: BitFlightLocation;
  points: readonly Vector3[];
  distance: number;
}>;

export type BitFlightRouteStep =
  | BitFlightSurfaceRouteStep
  | BitFlightTransitionRouteStep;

export type BitFlightRoute = Readonly<{
  steps: readonly BitFlightRouteStep[];
  destination: BitFlightLocation;
  distance: number;
  /** 経路生成時のpolicy追加費用を含む探索コスト。 */
  totalCost: number;
  readonly [BIT_FLIGHT_ROUTE_IDENTITY]?: BitFlightRouteIdentity;
}>;

export type BitFlightRoutePolicy = Readonly<{
  canUseTransition(traversal: BitFlightTransitionTraversal): boolean;
  canUseRouteStep(step: BitFlightRouteStep): boolean;
  additionalSurfaceCruiseHeights(
    step: BitFlightSurfaceRouteStep,
    band: BitFlightBand
  ): readonly number[];
  additionalTransitionCost(traversal: BitFlightTransitionTraversal): number;
}>;

export const BIT_FLIGHT_SHORTEST_ROUTE_POLICY: BitFlightRoutePolicy =
  Object.freeze({
    canUseTransition: () => true,
    canUseRouteStep: () => true,
    additionalSurfaceCruiseHeights: () => Object.freeze([]),
    additionalTransitionCost: () => 0
  });

export type BitFlightTransitionDefinition = Readonly<{
  id: string;
  kind: BitFlightTransitionKind;
  from: BitFlightBandRef;
  to: BitFlightBandRef;
  bidirectional: boolean;
  affordances: readonly BitFlightAffordance[];
  fromPosition: Vector3;
  toPosition: Vector3;
  traversalPoints: readonly Vector3[];
  region: BitFlightTransitionRegion | null;
  projectionDistance: number;
}>;

export type BitFlightNavMeshPayload = Readonly<{
  zoneId: BitFlightZoneId;
  bandId: BitFlightBandId;
  data: Uint8Array;
}>;

export type BitFlightNavigationDefinition = Readonly<{
  zones: readonly BitFlightZone[];
  bands: readonly BitFlightBand[];
  transitions: readonly BitFlightTransitionDefinition[];
}>;

export interface BitFlightNavigationWorld {
  readonly zones: readonly BitFlightZone[];
  readonly bands: readonly BitFlightBand[];
  readonly transitions: readonly BitFlightTransition[];
  getZone(id: BitFlightZoneId): BitFlightZone | null;
  getBand(ref: BitFlightBandRef): BitFlightBand | null;
  projectPointInBand(
    ref: BitFlightBandRef,
    position: Vector3,
    maxDistance: number
  ): BitFlightLocation | null;
  findLocationCandidates(
    position: Vector3,
    maxDistance: number
  ): readonly BitFlightLocation[];
  findRoute(
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ): BitFlightRoute | null;
  findSurfaceRoute(
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ): BitFlightRoute | null;
  findRouteThroughTransition(
    start: BitFlightLocation,
    traversal: BitFlightTransitionTraversal,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ): BitFlightRoute | null;
  assertPreparedRoute(
    currentLocation: BitFlightLocation,
    route: BitFlightRoute
  ): void;
  applyHeightSelection(
    location: BitFlightLocation,
    selection: BitFlightHeightSelection
  ): BitFlightLocation;
  constrainMovement(
    start: BitFlightLocation,
    destination: Vector3,
    heightMode: BitFlightHeightMode
  ): BitFlightLocation | null;
  randomPointAround(
    origin: BitFlightLocation,
    radius: number
  ): BitFlightLocation | null;
  getTransitionsFrom(
    ref: BitFlightBandRef
  ): readonly BitFlightTransitionTraversal[];
  createDebugMeshes(scene: Scene): readonly Mesh[];
  dispose(): void;
}

type ResolvedTransition = Readonly<{
  transition: BitFlightTransition;
  fromLocation: BitFlightLocation;
  toLocation: BitFlightLocation;
  projectionDistance: number;
  cacheable: boolean;
}>;

type BitFlightLocationIdentity = Readonly<{
  owner: symbol;
  bandKey: string;
}>;

type BitFlightRouteIdentity = Readonly<{
  owner: symbol;
  startKey: string;
}>;

type RouteNode = Readonly<{
  location: BitFlightLocation;
  transitionIndex: number | null;
  endpoint: "from" | "to" | null;
  cacheable: boolean;
}>;

type SurfaceRouteEdge = Readonly<{
  kind: "surface";
  fromIndex: number;
  toIndex: number;
  step: BitFlightSurfaceRouteStep;
  cost: number;
}>;

type TransitionRouteEdge = Readonly<{
  kind: "transition";
  fromIndex: number;
  toIndex: number;
  step: BitFlightTransitionRouteStep;
  cost: number;
}>;

type RouteEdge = SurfaceRouteEdge | TransitionRouteEdge;

const assertNonEmptyId = (label: string, value: string) => {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${label}には前後空白のない非空文字列が必要です。`);
  }
};

export const toBitFlightZoneId = (value: string): BitFlightZoneId => {
  assertNonEmptyId("飛行ゾーンID", value);
  return value as BitFlightZoneId;
};

export const toBitFlightBandId = (value: string): BitFlightBandId => {
  assertNonEmptyId("飛行帯ID", value);
  return value as BitFlightBandId;
};

export const createBitFlightBandRef = (
  zoneId: BitFlightZoneId,
  bandId: BitFlightBandId
): BitFlightBandRef => Object.freeze({ zoneId, bandId });

const createBandKey = (ref: BitFlightBandRef) =>
  JSON.stringify([ref.zoneId, ref.bandId]);

const sameBandRef = (left: BitFlightBandRef, right: BitFlightBandRef) =>
  left.zoneId === right.zoneId && left.bandId === right.bandId;

const assertFiniteVector = (label: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${label}には有限の3D座標が必要です。`);
  }
};

const assertNonNegativeFiniteNumber = (label: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}には0以上の有限値が必要です。`);
  }
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const cloneBandRef = (ref: BitFlightBandRef): BitFlightBandRef =>
  createBitFlightBandRef(ref.zoneId, ref.bandId);

const cloneBitFlightLocation = (
  location: BitFlightLocation
): BitFlightLocation =>
  Object.freeze({
    zoneId: location.zoneId,
    bandId: location.bandId,
    surface: cloneNavigationLocation(location.surface),
    safeCenterHeight: location.safeCenterHeight,
    heightMode: location.heightMode,
    [BIT_FLIGHT_LOCATION_IDENTITY]: location[BIT_FLIGHT_LOCATION_IDENTITY]
  });

export const getBitFlightWorldPosition = (
  location: BitFlightLocation
): Vector3 =>
  new Vector3(
    location.surface.position.x,
    location.safeCenterHeight,
    location.surface.position.z
  );

const calculateVectorPathDistance = (points: readonly Vector3[]) => {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += Vector3.Distance(points[index - 1], points[index]);
  }
  return distance;
};

const calculateLocationPathDistance = (
  points: readonly BitFlightLocation[]
) =>
  calculateVectorPathDistance(points.map((point) => getBitFlightWorldPosition(point)));

const createSurfaceRoutePoint = (
  identity: BitFlightLocationIdentity,
  band: BitFlightBand,
  surface: NavigationLocation,
  safeCenterHeight: number
): BitFlightLocation =>
  Object.freeze({
    zoneId: band.zoneId,
    bandId: band.id,
    surface: cloneNavigationLocation(surface),
    safeCenterHeight,
    heightMode:
      safeCenterHeight < band.minimumCenterHeight
        ? ("low-ceiling" as const)
        : ("band" as const),
    [BIT_FLIGHT_LOCATION_IDENTITY]: identity
  });

const createSurfaceRouteStep = (
  identity: BitFlightLocationIdentity,
  band: BitFlightBand,
  step: NavigationSurfaceStep,
  startHeight: number,
  destinationHeight: number
): BitFlightSurfaceRouteStep => {
  const surfacePoints =
    step.points.length === 1 && startHeight !== destinationHeight
      ? [step.points[0], step.points[0]]
      : step.points;
  const pointCount = surfacePoints.length;
  const points = Object.freeze(
    surfacePoints.map((surface, index) => {
      const ratio = pointCount <= 1 ? 0 : index / (pointCount - 1);
      const safeCenterHeight =
        startHeight + (destinationHeight - startHeight) * ratio;
      return createSurfaceRoutePoint(
        identity,
        band,
        surface,
        safeCenterHeight
      );
    })
  );
  return Object.freeze({
    kind: "surface",
    band: createBitFlightBandRef(band.zoneId, band.id),
    points,
    distance: calculateLocationPathDistance(points)
  });
};

const createCruiseSurfaceRouteStep = (
  identity: BitFlightLocationIdentity,
  band: BitFlightBand,
  step: NavigationSurfaceStep,
  startHeight: number,
  destinationHeight: number,
  cruiseHeight: number
): BitFlightSurfaceRouteStep => {
  const firstSurface = step.points[0];
  const lastSurface = step.points[step.points.length - 1];
  const points = Object.freeze([
    createSurfaceRoutePoint(identity, band, firstSurface, startHeight),
    createSurfaceRoutePoint(identity, band, firstSurface, cruiseHeight),
    ...step.points
      .slice(1, -1)
      .map((surface) =>
        createSurfaceRoutePoint(identity, band, surface, cruiseHeight)
      ),
    ...(step.points.length > 1
      ? [
          createSurfaceRoutePoint(
            identity,
            band,
            lastSurface,
            cruiseHeight
          )
        ]
      : []),
    createSurfaceRoutePoint(
      identity,
      band,
      lastSurface,
      destinationHeight
    )
  ]);
  return Object.freeze({
    kind: "surface",
    band: createBitFlightBandRef(band.zoneId, band.id),
    points,
    distance: calculateLocationPathDistance(points)
  });
};

const reverseNavigationSurfaceStep = (
  step: NavigationSurfaceStep
): NavigationSurfaceStep =>
  Object.freeze({
    kind: "surface",
    points: Object.freeze(
      [...step.points].reverse().map(cloneNavigationLocation)
    ),
    distance: step.distance
  });

const cloneBitFlightRouteStep = (
  step: BitFlightRouteStep
): BitFlightRouteStep => {
  if (step.kind === "surface") {
    return Object.freeze({
      kind: "surface" as const,
      band: cloneBandRef(step.band),
      points: Object.freeze(step.points.map(cloneBitFlightLocation)),
      distance: step.distance
    });
  }
  return Object.freeze({
    kind: "transition" as const,
    traversal: step.traversal,
    entry: cloneBitFlightLocation(step.entry),
    exit: cloneBitFlightLocation(step.exit),
    points: Object.freeze(step.points.map((point) => point.clone())),
    distance: step.distance
  });
};

export const cloneBitFlightRoute = (
  route: BitFlightRoute
): BitFlightRoute =>
  Object.freeze({
    steps: Object.freeze(route.steps.map(cloneBitFlightRouteStep)),
    destination: cloneBitFlightLocation(route.destination),
    distance: route.distance,
    totalCost: route.totalCost,
    [BIT_FLIGHT_ROUTE_IDENTITY]: route[BIT_FLIGHT_ROUTE_IDENTITY]
  });

class RecastBitFlightNavigationWorld implements BitFlightNavigationWorld {
  readonly zones: readonly BitFlightZone[];
  readonly bands: readonly BitFlightBand[];
  readonly transitions: readonly BitFlightTransition[];

  private readonly zonesById: ReadonlyMap<BitFlightZoneId, BitFlightZone>;
  private readonly bandsByKey: ReadonlyMap<string, BitFlightBand>;
  private readonly surfacesByBandKey: ReadonlyMap<string, NavigationWorld>;
  private readonly resolvedTransitions: readonly ResolvedTransition[];
  private readonly traversalsByBandKey: ReadonlyMap<
    string,
    readonly BitFlightTransitionTraversal[]
  >;
  private readonly endpointSurfaceStepCache = new Map<
    string,
    NavigationSurfaceStep | null
  >();
  private readonly locationOwner = Symbol("BitFlightNavigationWorld");
  private disposed = false;

  constructor(
    definition: BitFlightNavigationDefinition,
    surfacesByBandKey: ReadonlyMap<string, NavigationWorld>
  ) {
    this.zones = Object.freeze(
      definition.zones.map((zone) =>
        Object.freeze({ id: zone.id, spaceKind: zone.spaceKind })
      )
    );
    this.bands = Object.freeze(
      definition.bands.map((band) =>
        Object.freeze({
          zoneId: band.zoneId,
          id: band.id,
          minimumCenterHeight: band.minimumCenterHeight,
          maximumCenterHeight: band.maximumCenterHeight
        })
      )
    );
    this.zonesById = new Map(this.zones.map((zone) => [zone.id, zone]));
    this.bandsByKey = new Map(
      this.bands.map((band) => [
        createBandKey({ zoneId: band.zoneId, bandId: band.id }),
        band
      ])
    );
    this.surfacesByBandKey = surfacesByBandKey;
    this.resolvedTransitions = Object.freeze(
      definition.transitions.map((item) => this.resolveTransition(item))
    );
    this.transitions = Object.freeze(
      this.resolvedTransitions.map((item) => item.transition)
    );

    const traversalMap = new Map<string, BitFlightTransitionTraversal[]>();
    for (const transition of this.transitions) {
      const forward: BitFlightTransitionTraversal = Object.freeze({
        transition,
        from: cloneBandRef(transition.from),
        to: cloneBandRef(transition.to),
        reversed: false
      });
      const forwardKey = createBandKey(forward.from);
      const forwardItems = traversalMap.get(forwardKey) ?? [];
      forwardItems.push(forward);
      traversalMap.set(forwardKey, forwardItems);
      if (transition.bidirectional) {
        const reverse: BitFlightTransitionTraversal = Object.freeze({
          transition,
          from: cloneBandRef(transition.to),
          to: cloneBandRef(transition.from),
          reversed: true
        });
        const reverseKey = createBandKey(reverse.from);
        const reverseItems = traversalMap.get(reverseKey) ?? [];
        reverseItems.push(reverse);
        traversalMap.set(reverseKey, reverseItems);
      }
    }
    this.traversalsByBandKey = new Map(
      [...traversalMap].map(([key, value]) => [key, Object.freeze(value)])
    );
  }

  getZone(id: BitFlightZoneId) {
    this.assertActive();
    return this.zonesById.get(id) ?? null;
  }

  getBand(ref: BitFlightBandRef) {
    this.assertActive();
    return this.bandsByKey.get(createBandKey(ref)) ?? null;
  }

  projectPointInBand(
    ref: BitFlightBandRef,
    position: Vector3,
    maxDistance: number
  ) {
    this.assertActive();
    assertFiniteVector("飛行帯への投影元", position);
    assertNonNegativeFiniteNumber("飛行帯への投影最大距離", maxDistance);
    const band = this.requireBand(ref);
    if (
      position.y < band.minimumCenterHeight ||
      position.y > band.maximumCenterHeight
    ) {
      return null;
    }
    return this.projectSurfaceLocation(
      ref,
      position,
      position.y,
      maxDistance
    );
  }

  findLocationCandidates(position: Vector3, maxDistance: number) {
    this.assertActive();
    assertFiniteVector("飛行位置候補の検索元", position);
    assertNonNegativeFiniteNumber("飛行位置候補の検索距離", maxDistance);
    return Object.freeze(
      this.bands.flatMap((band) => {
        const location = this.projectPointInBand(
          { zoneId: band.zoneId, bandId: band.id },
          position,
          maxDistance
        );
        return location ? [location] : [];
      })
    );
  }

  findRoute(
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ) {
    this.assertActive();
    this.assertLocation("飛行経路始点", start);
    this.assertLocation("飛行経路終点", destination);
    const routeTransitions = this.createRouteTransitionCandidates(
      start,
      destination
    );
    const nodes: RouteNode[] = [
      {
        location: cloneBitFlightLocation(start),
        transitionIndex: null,
        endpoint: null,
        cacheable: false
      },
      {
        location: cloneBitFlightLocation(destination),
        transitionIndex: null,
        endpoint: null,
        cacheable: false
      }
    ];
    routeTransitions.forEach((transition, transitionIndex) => {
      nodes.push({
        location: cloneBitFlightLocation(transition.fromLocation),
        transitionIndex,
        endpoint: "from",
        cacheable: transition.cacheable
      });
      nodes.push({
        location: cloneBitFlightLocation(transition.toLocation),
        transitionIndex,
        endpoint: "to",
        cacheable: transition.cacheable
      });
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
      for (const edge of this.collectOutgoingEdges(
        nodes,
        routeTransitions,
        currentIndex,
        policy
      )) {
        if (visited[edge.toIndex]) {
          continue;
        }
        const candidateDistance = currentDistance + edge.cost;
        if (candidateDistance < distances[edge.toIndex]) {
          distances[edge.toIndex] = candidateDistance;
          previousEdges[edge.toIndex] = edge;
        }
      }
    }

    if (!Number.isFinite(distances[1])) {
      return null;
    }
    const reversedEdges: RouteEdge[] = [];
    let cursor = 1;
    while (cursor !== 0) {
      const edge = previousEdges[cursor];
      if (!edge) {
        throw new Error("飛行経路の復元に必要な辺がありません。");
      }
      reversedEdges.push(edge);
      cursor = edge.fromIndex;
    }
    const steps = Object.freeze(
      reversedEdges.reverse().map((edge) => edge.step)
    );
    return this.createPreparedRoute(start, destination, steps, distances[1]);
  }

  findSurfaceRoute(
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ) {
    this.assertActive();
    this.assertLocation("同帯飛行経路始点", start);
    this.assertLocation("同帯飛行経路終点", destination);
    if (!sameBandRef(start, destination)) {
      return null;
    }
    if (this.createLocationCacheKey(start) ===
        this.createLocationCacheKey(destination)) {
      return this.createPreparedRoute(
        start,
        destination,
        Object.freeze([]),
        0
      );
    }
    const step = this.findSurfaceStep(start, destination, policy);
    if (!step) {
      return null;
    }
    return this.createPreparedRoute(
      start,
      destination,
      Object.freeze([step]),
      step.distance
    );
  }

  findRouteThroughTransition(
    start: BitFlightLocation,
    traversal: BitFlightTransitionTraversal,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ) {
    this.assertActive();
    this.assertLocation("指定遷移経路始点", start);
    this.assertLocation("指定遷移経路終点", destination);
    const resolved = this.resolvedTransitions.find(
      (candidate) => candidate.transition === traversal.transition
    );
    if (!resolved) {
      throw new Error("指定遷移はこの飛行帯ナビゲーションの遷移ではありません。");
    }
    const expectedFrom = traversal.reversed
      ? resolved.transition.to
      : resolved.transition.from;
    const expectedTo = traversal.reversed
      ? resolved.transition.from
      : resolved.transition.to;
    if (
      !sameBandRef(traversal.from, expectedFrom) ||
      !sameBandRef(traversal.to, expectedTo) ||
      !sameBandRef(start, expectedFrom) ||
      !sameBandRef(destination, expectedTo) ||
      (traversal.reversed && !resolved.transition.bidirectional)
    ) {
      throw new Error("指定遷移の向きと経路の飛行帯が一致しません。");
    }
    if (!policy.canUseTransition(traversal)) {
      return null;
    }
    const additionalTransitionCost =
      policy.additionalTransitionCost(traversal);
    assertNonNegativeFiniteNumber(
      `飛行遷移${resolved.transition.id}の追加コスト`,
      additionalTransitionCost
    );

    let selected: Readonly<{
      route: BitFlightRoute;
      totalCost: number;
    }> | null = null;
    for (const candidate of this.createTransitionCandidatesForAnchors(
      resolved,
      Object.freeze([
        getBitFlightWorldPosition(start),
        getBitFlightWorldPosition(destination)
      ])
    )) {
      const entry = traversal.reversed
        ? candidate.toLocation
        : candidate.fromLocation;
      const exit = traversal.reversed
        ? candidate.fromLocation
        : candidate.toLocation;
      const steps: BitFlightRouteStep[] = [];
      if (
        this.createLocationCacheKey(start) !==
        this.createLocationCacheKey(entry)
      ) {
        const entryStep = this.findSurfaceStep(start, entry, policy);
        if (!entryStep) {
          continue;
        }
        steps.push(entryStep);
      }
      const transitionStep = this.createTransitionRouteStep(
        candidate,
        traversal
      );
      if (!policy.canUseRouteStep(transitionStep)) {
        continue;
      }
      steps.push(transitionStep);
      if (
        this.createLocationCacheKey(exit) !==
        this.createLocationCacheKey(destination)
      ) {
        const destinationStep = this.findSurfaceStep(
          exit,
          destination,
          policy
        );
        if (!destinationStep) {
          continue;
        }
        steps.push(destinationStep);
      }
      const distance = steps.reduce((sum, step) => sum + step.distance, 0);
      const totalCost = distance + additionalTransitionCost;
      const route = this.createPreparedRoute(
        start,
        destination,
        Object.freeze(steps),
        totalCost
      );
      if (!selected || totalCost < selected.totalCost) {
        selected = Object.freeze({ route, totalCost });
      }
    }
    return selected?.route ?? null;
  }

  assertPreparedRoute(
    currentLocation: BitFlightLocation,
    route: BitFlightRoute
  ) {
    this.assertActive();
    this.assertLocation("確定済み飛行経路始点", currentLocation);
    this.assertLocation("確定済み飛行経路終点", route.destination);
    const identity = route[BIT_FLIGHT_ROUTE_IDENTITY];
    if (
      identity?.owner !== this.locationOwner ||
      identity.startKey !== this.createLocationCacheKey(currentLocation)
    ) {
      throw new Error(
        "確定済み飛行経路はこのWorldの同一起点から作成された経路ではありません。"
      );
    }
  }

  applyHeightSelection(
    location: BitFlightLocation,
    selection: BitFlightHeightSelection
  ) {
    this.assertActive();
    this.assertLocation("高度変更元", location);
    assertFiniteVector("高度選択中心", selection.center);
    if (!BIT_FLIGHT_HEIGHT_MODES.includes(selection.heightMode)) {
      throw new Error("未登録の飛行高度モードです。");
    }
    if (
      selection.center.x !== location.surface.position.x ||
      selection.center.z !== location.surface.position.z
    ) {
      throw new Error("高度選択は同じNavMesh水平位置へ適用する必要があります。");
    }
    const band = this.requireBand(location);
    this.assertCenterHeight(
      "高度選択",
      band,
      selection.center.y,
      selection.heightMode
    );
    return Object.freeze({
      zoneId: location.zoneId,
      bandId: location.bandId,
      surface: cloneNavigationLocation(location.surface),
      safeCenterHeight: selection.center.y,
      heightMode: selection.heightMode,
      [BIT_FLIGHT_LOCATION_IDENTITY]: this.createLocationIdentity(location)
    });
  }

  constrainMovement(
    start: BitFlightLocation,
    destination: Vector3,
    heightMode: BitFlightHeightMode
  ) {
    this.assertActive();
    this.assertLocation("飛行移動始点", start);
    assertFiniteVector("飛行移動終点", destination);
    const band = this.requireBand(start);
    if (!BIT_FLIGHT_HEIGHT_MODES.includes(heightMode)) {
      throw new Error("飛行移動終点の高度モードが不正です。");
    }
    if (
      destination.y > band.maximumCenterHeight ||
      (heightMode === "band" &&
        destination.y < band.minimumCenterHeight) ||
      (heightMode === "low-ceiling" &&
        destination.y >= band.minimumCenterHeight)
    ) {
      return null;
    }
    const surface = this.requireSurface(start).constrainMovement(
      start.surface,
      destination
    );
    return surface
      ? Object.freeze({
          zoneId: start.zoneId,
          bandId: start.bandId,
          surface,
          safeCenterHeight: destination.y,
          heightMode,
          [BIT_FLIGHT_LOCATION_IDENTITY]: this.createLocationIdentity(start)
        })
      : null;
  }

  randomPointAround(origin: BitFlightLocation, radius: number) {
    this.assertActive();
    this.assertLocation("飛行ランダム点の中心", origin);
    assertNonNegativeFiniteNumber("飛行ランダム点の半径", radius);
    const surface = this.requireSurface(origin).randomPointAround(
      origin.surface,
      radius
    );
    return surface
      ? Object.freeze({
          zoneId: origin.zoneId,
          bandId: origin.bandId,
          surface,
          safeCenterHeight: origin.safeCenterHeight,
          heightMode: origin.heightMode,
          [BIT_FLIGHT_LOCATION_IDENTITY]: this.createLocationIdentity(origin)
        })
      : null;
  }

  getTransitionsFrom(ref: BitFlightBandRef) {
    this.assertActive();
    this.requireBand(ref);
    return this.traversalsByBandKey.get(createBandKey(ref)) ?? Object.freeze([]);
  }

  createDebugMeshes(scene: Scene) {
    this.assertActive();
    return Object.freeze(
      [...this.surfacesByBandKey.values()].map((surface) =>
        surface.createDebugMesh(scene)
      )
    );
  }

  dispose() {
    this.assertActive();
    this.disposed = true;
    this.endpointSurfaceStepCache.clear();
    for (const surface of this.surfacesByBandKey.values()) {
      surface.dispose();
    }
  }

  private createRouteTransitionCandidates(
    start: BitFlightLocation,
    destination: BitFlightLocation
  ): readonly ResolvedTransition[] {
    const anchors = Object.freeze([
      getBitFlightWorldPosition(start),
      getBitFlightWorldPosition(destination)
    ]);
    return Object.freeze(
      this.resolvedTransitions.flatMap((resolved) =>
        this.createTransitionCandidatesForAnchors(resolved, anchors)
      )
    );
  }

  private createTransitionCandidatesForAnchors(
    resolved: ResolvedTransition,
    anchors: readonly Vector3[]
  ): readonly ResolvedTransition[] {
    const candidates: ResolvedTransition[] = [resolved];
    if (
      resolved.transition.kind !== "vertical" ||
      !resolved.transition.region
    ) {
      return Object.freeze(candidates);
    }
    const candidateKeys = new Set([
      this.createResolvedTransitionLocationKey(resolved)
    ]);
    for (const anchor of anchors) {
      const candidate = this.createVerticalTransitionCandidate(
        resolved,
        anchor
      );
      if (!candidate) {
        continue;
      }
      const key = this.createResolvedTransitionLocationKey(candidate);
      if (candidateKeys.has(key)) {
        continue;
      }
      candidateKeys.add(key);
      candidates.push(candidate);
    }
    return Object.freeze(candidates);
  }

  private createVerticalTransitionCandidate(
    resolved: ResolvedTransition,
    anchor: Vector3
  ): ResolvedTransition | null {
    const region = resolved.transition.region;
    if (!region) {
      throw new Error("vertical遷移候補に安全領域がありません。");
    }
    const x = clamp(anchor.x, region.minimum.x, region.maximum.x);
    const z = clamp(anchor.z, region.minimum.z, region.maximum.z);
    const fromLocation = this.projectSurfaceLocation(
      resolved.transition.from,
      new Vector3(x, resolved.fromLocation.safeCenterHeight, z),
      resolved.fromLocation.safeCenterHeight,
      resolved.projectionDistance
    );
    const toLocation = this.projectSurfaceLocation(
      resolved.transition.to,
      new Vector3(x, resolved.toLocation.safeCenterHeight, z),
      resolved.toLocation.safeCenterHeight,
      resolved.projectionDistance
    );
    if (
      !fromLocation ||
      !toLocation ||
      !this.isLocationInsideTransitionRegion(fromLocation, region) ||
      !this.isLocationInsideTransitionRegion(toLocation, region) ||
      !region.containsSegment(
        getBitFlightWorldPosition(fromLocation),
        getBitFlightWorldPosition(toLocation)
      )
    ) {
      return null;
    }
    return Object.freeze({
      transition: resolved.transition,
      fromLocation,
      toLocation,
      projectionDistance: resolved.projectionDistance,
      cacheable: false
    });
  }

  private isLocationInsideTransitionRegion(
    location: BitFlightLocation,
    region: BitFlightTransitionRegion
  ) {
    const position = getBitFlightWorldPosition(location);
    return (
      position.x >= region.minimum.x &&
      position.x <= region.maximum.x &&
      position.y >= region.minimum.y &&
      position.y <= region.maximum.y &&
      position.z >= region.minimum.z &&
      position.z <= region.maximum.z &&
      region.contains(position)
    );
  }

  private createResolvedTransitionLocationKey(
    resolved: ResolvedTransition
  ) {
    return `${this.createLocationCacheKey(
      resolved.fromLocation
    )}:${this.createLocationCacheKey(
      resolved.toLocation
    )}`;
  }

  private createLocationCacheKey(location: BitFlightLocation) {
    return JSON.stringify([
      location.zoneId,
      location.bandId,
      location.surface.polygonRef,
      location.surface.position.x,
      location.surface.position.y,
      location.surface.position.z,
      location.safeCenterHeight,
      location.heightMode
    ]);
  }

  private createPreparedRoute(
    start: BitFlightLocation,
    destination: BitFlightLocation,
    steps: readonly BitFlightRouteStep[],
    totalCost: number
  ): BitFlightRoute {
    assertNonNegativeFiniteNumber("飛行経路探索コスト", totalCost);
    return Object.freeze({
      steps,
      destination: cloneBitFlightLocation(destination),
      distance: steps.reduce((sum, step) => sum + step.distance, 0),
      totalCost,
      [BIT_FLIGHT_ROUTE_IDENTITY]: Object.freeze({
        owner: this.locationOwner,
        startKey: this.createLocationCacheKey(start)
      })
    });
  }

  private collectOutgoingEdges(
    nodes: readonly RouteNode[],
    routeTransitions: readonly ResolvedTransition[],
    fromIndex: number,
    policy: BitFlightRoutePolicy
  ) {
    const edges: RouteEdge[] = [];
    for (let toIndex = 1; toIndex < nodes.length; toIndex += 1) {
      if (fromIndex === toIndex) {
        continue;
      }
      const surfaceEdge = this.createSurfaceEdge(
        nodes,
        fromIndex,
        toIndex,
        policy
      );
      if (surfaceEdge) {
        edges.push(surfaceEdge);
      }
    }

    const node = nodes[fromIndex];
    if (node.transitionIndex === null || node.endpoint === null) {
      return edges;
    }
    const resolved = routeTransitions[node.transitionIndex];
    const traversal =
      node.endpoint === "from"
        ? this.createTraversal(resolved.transition, false)
        : resolved.transition.bidirectional
          ? this.createTraversal(resolved.transition, true)
          : null;
    if (!traversal || !policy.canUseTransition(traversal)) {
      return edges;
    }
    const additionalCost = policy.additionalTransitionCost(traversal);
    assertNonNegativeFiniteNumber(
      `飛行遷移${resolved.transition.id}の追加コスト`,
      additionalCost
    );
    const toIndex =
      2 +
      node.transitionIndex * 2 +
      (node.endpoint === "from" ? 1 : 0);
    const step = this.createTransitionRouteStep(resolved, traversal);
    if (!policy.canUseRouteStep(step)) {
      return edges;
    }
    edges.push({
      kind: "transition",
      fromIndex,
      toIndex,
      step,
      cost: step.distance + additionalCost
    });
    return edges;
  }

  private createSurfaceEdge(
    nodes: readonly RouteNode[],
    fromIndex: number,
    toIndex: number,
    policy: BitFlightRoutePolicy
  ): SurfaceRouteEdge | null {
    const from = nodes[fromIndex].location;
    const to = nodes[toIndex].location;
    if (!sameBandRef(from, to)) {
      return null;
    }
    let navigationStep: NavigationSurfaceStep | null;
    const canCache =
      nodes[fromIndex].cacheable && nodes[toIndex].cacheable;
    if (canCache) {
      const fromKey = this.createLocationCacheKey(from);
      const toKey = this.createLocationCacheKey(to);
      const reverseCanonicalDirection = fromKey > toKey;
      const canonicalStart = reverseCanonicalDirection ? to : from;
      const canonicalDestination = reverseCanonicalDirection ? from : to;
      const key = reverseCanonicalDirection
        ? `${toKey}:${fromKey}`
        : `${fromKey}:${toKey}`;
      if (!this.endpointSurfaceStepCache.has(key)) {
        this.endpointSurfaceStepCache.set(
          key,
          this.findNavigationSurfaceStep(
            canonicalStart,
            canonicalDestination
          )
        );
      }
      const canonical = this.endpointSurfaceStepCache.get(key) ?? null;
      navigationStep =
        canonical && reverseCanonicalDirection
          ? reverseNavigationSurfaceStep(canonical)
          : canonical;
    } else {
      navigationStep = this.findNavigationSurfaceStep(from, to);
    }
    const step = navigationStep
      ? this.selectSurfaceStep(from, to, navigationStep, policy)
      : null;
    return step
      ? {
          kind: "surface",
          fromIndex,
          toIndex,
          step,
          cost: step.distance
        }
      : null;
  }

  private findSurfaceStep(
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ) {
    const navigationStep = this.findNavigationSurfaceStep(
      start,
      destination
    );
    return navigationStep
      ? this.selectSurfaceStep(
          start,
          destination,
          navigationStep,
          policy
        )
      : null;
  }

  private findNavigationSurfaceStep(
    start: BitFlightLocation,
    destination: BitFlightLocation
  ) {
    const surface = this.requireSurface(start);
    return surface.findSurfacePath(start.surface, destination.surface);
  }

  private selectSurfaceStep(
    start: BitFlightLocation,
    destination: BitFlightLocation,
    navigationStep: NavigationSurfaceStep,
    policy: BitFlightRoutePolicy
  ) {
    const identity = this.createLocationIdentity(start);
    const band = this.requireBand(start);
    const direct = createSurfaceRouteStep(
      identity,
      band,
      navigationStep,
      start.safeCenterHeight,
      destination.safeCenterHeight
    );
    if (policy.canUseRouteStep(direct)) {
      return direct;
    }

    const heightRange =
      band.maximumCenterHeight - band.minimumCenterHeight;
    const cruiseHeights = Object.freeze([
      band.minimumCenterHeight,
      band.minimumCenterHeight + heightRange * 0.25,
      band.minimumCenterHeight + heightRange * 0.5,
      band.minimumCenterHeight + heightRange * 0.75,
      band.maximumCenterHeight
    ]);
    let selected: BitFlightSurfaceRouteStep | null = null;
    for (const cruiseHeight of cruiseHeights) {
      const candidate = createCruiseSurfaceRouteStep(
        identity,
        band,
        navigationStep,
        start.safeCenterHeight,
        destination.safeCenterHeight,
        cruiseHeight
      );
      if (
        policy.canUseRouteStep(candidate) &&
        (!selected || candidate.distance < selected.distance)
      ) {
        selected = candidate;
      }
    }
    if (selected) {
      return selected;
    }

    const additionalCruiseHeights =
      policy.additionalSurfaceCruiseHeights(direct, band);
    const usedAdditionalCruiseHeights = new Set<number>();
    for (const cruiseHeight of additionalCruiseHeights) {
      if (
        !Number.isFinite(cruiseHeight) ||
        cruiseHeight >= band.minimumCenterHeight
      ) {
        throw new Error(
          "追加の帯内巡航高度には飛行帯下限未満の有限値が必要です。"
        );
      }
      if (usedAdditionalCruiseHeights.has(cruiseHeight)) {
        throw new Error("追加の帯内巡航高度が重複しています。");
      }
      usedAdditionalCruiseHeights.add(cruiseHeight);
      const candidate = createCruiseSurfaceRouteStep(
        identity,
        band,
        navigationStep,
        start.safeCenterHeight,
        destination.safeCenterHeight,
        cruiseHeight
      );
      if (
        policy.canUseRouteStep(candidate) &&
        (!selected || candidate.distance < selected.distance)
      ) {
        selected = candidate;
      }
    }
    return selected;
  }

  private createTraversal(
    transition: BitFlightTransition,
    reversed: boolean
  ): BitFlightTransitionTraversal {
    return Object.freeze({
      transition,
      from: cloneBandRef(reversed ? transition.to : transition.from),
      to: cloneBandRef(reversed ? transition.from : transition.to),
      reversed
    });
  }

  private createTransitionRouteStep(
    resolved: ResolvedTransition,
    traversal: BitFlightTransitionTraversal
  ): BitFlightTransitionRouteStep {
    const entry = traversal.reversed
      ? resolved.toLocation
      : resolved.fromLocation;
    const exit = traversal.reversed
      ? resolved.fromLocation
      : resolved.toLocation;
    const authoredPoints = traversal.reversed
      ? [...resolved.transition.traversalPoints].reverse()
      : resolved.transition.traversalPoints;
    const points = Object.freeze([
      getBitFlightWorldPosition(entry),
      ...authoredPoints.map((point) => point.clone()),
      getBitFlightWorldPosition(exit)
    ]);
    return Object.freeze({
      kind: "transition",
      traversal,
      entry: cloneBitFlightLocation(entry),
      exit: cloneBitFlightLocation(exit),
      points,
      distance: calculateVectorPathDistance(points)
    });
  }

  private resolveTransition(
    definition: BitFlightTransitionDefinition
  ): ResolvedTransition {
    const fromLocation = this.projectTransitionEndpoint(
      definition.id,
      "from",
      definition.from,
      definition.fromPosition,
      definition.projectionDistance
    );
    const toLocation = this.projectTransitionEndpoint(
      definition.id,
      "to",
      definition.to,
      definition.toPosition,
      definition.projectionDistance
    );
    const transition: BitFlightTransition = Object.freeze({
      id: definition.id,
      kind: definition.kind,
      from: cloneBandRef(definition.from),
      to: cloneBandRef(definition.to),
      bidirectional: definition.bidirectional,
      affordances: Object.freeze([...definition.affordances]),
      fromPosition: definition.fromPosition.clone(),
      toPosition: definition.toPosition.clone(),
      traversalPoints: Object.freeze(
        definition.traversalPoints.map((point) => point.clone())
      ),
      region: definition.region
        ? Object.freeze({
            minimum: definition.region.minimum.clone(),
            maximum: definition.region.maximum.clone(),
            contains: definition.region.contains,
            containsSegment: definition.region.containsSegment
          })
        : null
    });
    if (transition.region) {
      const routePoints = [
        getBitFlightWorldPosition(fromLocation),
        ...transition.traversalPoints,
        getBitFlightWorldPosition(toLocation)
      ];
      const outsidePointIndex = routePoints.findIndex(
        (point) => !transition.region!.contains(point)
      );
      const outsideSegmentEndIndex = routePoints.findIndex(
        (point, index) =>
          index > 0 &&
          !transition.region!.containsSegment(
            routePoints[index - 1],
            point
          )
      );
      if (outsidePointIndex >= 0 || outsideSegmentEndIndex >= 0) {
        const location =
          outsidePointIndex >= 0
            ? `point${outsidePointIndex}`
            : `segment${outsideSegmentEndIndex - 1}-${outsideSegmentEndIndex}`;
        const point =
          outsidePointIndex >= 0
            ? routePoints[outsidePointIndex]
            : routePoints[outsideSegmentEndIndex];
        throw new Error(
          `Volume遷移の基準経路が実Volume形状の外側です: ` +
            `${transition.id}/${location}/${point.toString()}`
        );
      }
    }
    return Object.freeze({
      transition,
      fromLocation,
      toLocation,
      projectionDistance: definition.projectionDistance,
      cacheable: true
    });
  }

  private projectTransitionEndpoint(
    transitionId: string,
    endpoint: "from" | "to",
    ref: BitFlightBandRef,
    authoredPosition: Vector3,
    projectionDistance: number
  ) {
    const band = this.requireBand(ref);
    const safeCenterHeight = Math.min(
      band.maximumCenterHeight,
      Math.max(band.minimumCenterHeight, authoredPosition.y)
    );
    const location = this.projectSurfaceLocation(
      ref,
      new Vector3(authoredPosition.x, safeCenterHeight, authoredPosition.z),
      safeCenterHeight,
      projectionDistance
    );
    if (!location) {
      throw new Error(
        `飛行遷移端点を飛行帯NavMeshへ投影できません: ` +
          `${transitionId}/${endpoint}/${ref.zoneId}/${ref.bandId}`
      );
    }
    return location;
  }

  private projectSurfaceLocation(
    ref: BitFlightBandRef,
    position: Vector3,
    safeCenterHeight: number,
    maxDistance: number
  ): BitFlightLocation | null {
    const surface = this.requireSurface(ref).projectPoint(position, maxDistance);
    return surface
      ? Object.freeze({
          zoneId: ref.zoneId,
          bandId: ref.bandId,
          surface,
          safeCenterHeight,
          heightMode: "band",
          [BIT_FLIGHT_LOCATION_IDENTITY]: this.createLocationIdentity(ref)
        })
      : null;
  }

  private requireBand(ref: BitFlightBandRef) {
    const band = this.bandsByKey.get(createBandKey(ref));
    if (!band) {
      throw new Error(`未登録の飛行帯です: ${ref.zoneId}/${ref.bandId}`);
    }
    return band;
  }

  private requireSurface(ref: BitFlightBandRef) {
    const surface = this.surfacesByBandKey.get(createBandKey(ref));
    if (!surface) {
      throw new Error(`飛行帯NavMeshがありません: ${ref.zoneId}/${ref.bandId}`);
    }
    return surface;
  }

  private assertLocation(label: string, location: BitFlightLocation) {
    const band = this.requireBand(location);
    assertFiniteVector(`${label}のNavMesh座標`, location.surface.position);
    if (!Number.isFinite(location.safeCenterHeight)) {
      throw new Error(`${label}の安全中心高度には有限値が必要です。`);
    }
    const identity = location[BIT_FLIGHT_LOCATION_IDENTITY];
    if (
      identity?.owner !== this.locationOwner ||
      identity.bandKey !== createBandKey(location)
    ) {
      throw new Error(`${label}はこの飛行帯ナビゲーションの位置ではありません。`);
    }
    this.assertCenterHeight(
      label,
      band,
      location.safeCenterHeight,
      location.heightMode
    );
  }

  private assertCenterHeight(
    label: string,
    band: BitFlightBand,
    safeCenterHeight: number,
    heightMode: BitFlightHeightMode
  ) {
    if (!BIT_FLIGHT_HEIGHT_MODES.includes(heightMode)) {
      throw new Error(`${label}の飛行高度モードが不正です。`);
    }
    if (safeCenterHeight > band.maximumCenterHeight) {
      throw new Error(`${label}の安全中心高度が飛行帯上限を超えています。`);
    }
    if (
      heightMode === "band" &&
      safeCenterHeight < band.minimumCenterHeight
    ) {
      throw new Error(`${label}の安全中心高度が飛行帯下限未満です。`);
    }
    if (
      heightMode === "low-ceiling" &&
      safeCenterHeight >= band.minimumCenterHeight
    ) {
      throw new Error(
        `${label}の低天井許可高度は飛行帯下限未満である必要があります。`
      );
    }
  }

  private createLocationIdentity(
    ref: BitFlightBandRef
  ): BitFlightLocationIdentity {
    return Object.freeze({
      owner: this.locationOwner,
      bandKey: createBandKey(ref)
    });
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("破棄済みのBitFlightNavigationWorldは使用できません。");
    }
  }
}

const validateDefinition = (definition: BitFlightNavigationDefinition) => {
  if (definition.zones.length === 0) {
    throw new Error("飛行ゾーンがありません。");
  }
  if (definition.bands.length === 0) {
    throw new Error("飛行帯がありません。");
  }

  const zonesById = new Map<BitFlightZoneId, BitFlightZone>();
  for (const zone of definition.zones) {
    assertNonEmptyId("飛行ゾーンID", zone.id);
    if (zonesById.has(zone.id)) {
      throw new Error(`飛行ゾーンIDが重複しています: ${zone.id}`);
    }
    if (!BIT_FLIGHT_SPACE_KINDS.includes(zone.spaceKind)) {
      throw new Error(`未登録の飛行空間種別です: ${zone.spaceKind}`);
    }
    zonesById.set(zone.id, zone);
  }

  const bandsByKey = new Map<string, BitFlightBand>();
  for (const band of definition.bands) {
    assertNonEmptyId("飛行帯ID", band.id);
    if (!zonesById.has(band.zoneId)) {
      throw new Error(
        `飛行帯が未登録ゾーンを参照しています: ${band.zoneId}/${band.id}`
      );
    }
    if (
      !Number.isFinite(band.minimumCenterHeight) ||
      !Number.isFinite(band.maximumCenterHeight) ||
      band.minimumCenterHeight > band.maximumCenterHeight
    ) {
      throw new Error(
        `飛行帯の中心高度範囲が不正です: ${band.zoneId}/${band.id}`
      );
    }
    const key = createBandKey({ zoneId: band.zoneId, bandId: band.id });
    if (bandsByKey.has(key)) {
      throw new Error(`飛行帯IDが重複しています: ${band.zoneId}/${band.id}`);
    }
    bandsByKey.set(key, band);
  }

  const transitionIds = new Set<string>();
  for (const transition of definition.transitions) {
    assertNonEmptyId("飛行遷移ID", transition.id);
    if (transitionIds.has(transition.id)) {
      throw new Error(`飛行遷移IDが重複しています: ${transition.id}`);
    }
    transitionIds.add(transition.id);
    if (!BIT_FLIGHT_TRANSITION_KINDS.includes(transition.kind)) {
      throw new Error(`未登録の飛行遷移方式です: ${transition.kind}`);
    }
    for (const ref of [transition.from, transition.to]) {
      if (!bandsByKey.has(createBandKey(ref))) {
        throw new Error(
          `飛行遷移が未登録帯を参照しています: ${transition.id} -> ${ref.zoneId}/${ref.bandId}`
        );
      }
    }
    if (sameBandRef(transition.from, transition.to)) {
      throw new Error(`飛行遷移のfrom/toは異なる帯が必要です: ${transition.id}`);
    }
    if (transition.affordances.length === 0) {
      throw new Error(`飛行遷移には意味タグが必要です: ${transition.id}`);
    }
    const affordances = new Set<BitFlightAffordance>();
    for (const affordance of transition.affordances) {
      if (!BIT_FLIGHT_AFFORDANCES.includes(affordance)) {
        throw new Error(
          `未登録の飛行遷移意味タグです: ${transition.id}/${affordance}`
        );
      }
      if (affordances.has(affordance)) {
        throw new Error(
          `飛行遷移意味タグが重複しています: ${transition.id}/${affordance}`
        );
      }
      affordances.add(affordance);
    }
    assertFiniteVector(`${transition.id}のfrom位置`, transition.fromPosition);
    assertFiniteVector(`${transition.id}のto位置`, transition.toPosition);
    transition.traversalPoints.forEach((point, index) =>
      assertFiniteVector(`${transition.id}の通過点${index}`, point)
    );
    if (transition.kind === "aperture") {
      if (transition.region !== null) {
        throw new Error(
          `aperture遷移には連続領域を指定できません: ${transition.id}`
        );
      }
    } else {
      if (transition.region === null) {
        throw new Error(
          `Volume遷移には連続領域が必要です: ${transition.id}`
        );
      }
      assertFiniteVector(
        `${transition.id}の遷移領域下限`,
        transition.region.minimum
      );
      assertFiniteVector(
        `${transition.id}の遷移領域上限`,
        transition.region.maximum
      );
      if (typeof transition.region.contains !== "function") {
        throw new Error(
          `飛行遷移領域には実形状の内包判定が必要です: ${transition.id}`
        );
      }
      if (typeof transition.region.containsSegment !== "function") {
        throw new Error(
          `飛行遷移領域には実形状の線分内包判定が必要です: ${transition.id}`
        );
      }
      if (
        transition.region.minimum.x > transition.region.maximum.x ||
        transition.region.minimum.y > transition.region.maximum.y ||
        transition.region.minimum.z > transition.region.maximum.z
      ) {
        throw new Error(`飛行遷移領域の上下限が不正です: ${transition.id}`);
      }
    }
    if (
      !Number.isFinite(transition.projectionDistance) ||
      transition.projectionDistance <= 0
    ) {
      throw new Error(
        `飛行遷移の投影距離には正数が必要です: ${transition.id}`
      );
    }
  }
};

export const createBitFlightNavigationWorld = async (
  definition: BitFlightNavigationDefinition,
  payloads: readonly BitFlightNavMeshPayload[]
): Promise<BitFlightNavigationWorld> => {
  validateDefinition(definition);
  const bandKeys = new Set(
    definition.bands.map((band) =>
      createBandKey({ zoneId: band.zoneId, bandId: band.id })
    )
  );
  const payloadsByKey = new Map<string, BitFlightNavMeshPayload>();
  for (const payload of payloads) {
    const key = createBandKey(payload);
    if (payloadsByKey.has(key)) {
      throw new Error(
        `ビット用NavMesh payloadが重複しています: ${payload.zoneId}/${payload.bandId}`
      );
    }
    if (!bandKeys.has(key)) {
      throw new Error(
        `GLBに存在しない飛行帯のNavMesh payloadです: ${payload.zoneId}/${payload.bandId}`
      );
    }
    if (payload.data.byteLength === 0) {
      throw new Error(
        `ビット用NavMesh payloadが空です: ${payload.zoneId}/${payload.bandId}`
      );
    }
    payloadsByKey.set(key, payload);
  }
  for (const band of definition.bands) {
    const key = createBandKey({ zoneId: band.zoneId, bandId: band.id });
    if (!payloadsByKey.has(key)) {
      throw new Error(
        `飛行帯に対応するNavMesh payloadがありません: ${band.zoneId}/${band.id}`
      );
    }
  }

  const surfacesByBandKey = new Map<string, NavigationWorld>();
  try {
    for (const band of definition.bands) {
      const key = createBandKey({ zoneId: band.zoneId, bandId: band.id });
      const payload = payloadsByKey.get(key)!;
      surfacesByBandKey.set(
        key,
        await createNavigationWorld(payload.data, Object.freeze([]))
      );
    }
    return new RecastBitFlightNavigationWorld(
      definition,
      surfacesByBandKey
    );
  } catch (error) {
    for (const surface of surfacesByBandKey.values()) {
      surface.dispose();
    }
    throw error;
  }
};
