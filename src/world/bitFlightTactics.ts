import { Vector3 } from "@babylonjs/core";

import {
  getBitFlightWorldPosition,
  type BitFlightBandRef,
  type BitFlightLocation,
  type BitFlightNavigationWorld,
  type BitFlightRoute,
  type BitFlightRoutePolicy,
  type BitFlightTransitionTraversal
} from "./bitFlightNavigation";

export const BIT_FLIGHT_EXPLORATION_RETENTION_SECONDS = 60;
export const BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS = 3;

export type BitFlightExplorationSample = Readonly<{
  band: BitFlightBandRef;
  position: Vector3;
  observedAtSeconds: number;
}>;

export interface BitFlightExplorationHistory {
  record(
    band: BitFlightBandRef,
    position: Vector3,
    observedAtSeconds: number
  ): void;
  recordLocation(
    location: BitFlightLocation,
    observedAtSeconds: number
  ): void;
  hasRecentObservation(
    band: BitFlightBandRef,
    position: Vector3,
    radius: number,
    nowSeconds: number
  ): boolean;
  getRecentSamples(nowSeconds: number): readonly BitFlightExplorationSample[];
  clear(): void;
}

export type BitFlightTransitionUsage = Readonly<{
  transitionId: string;
  from: BitFlightBandRef;
  to: BitFlightBandRef;
  completedAtSeconds: number;
}>;

export interface BitFlightTransitionHistory {
  record(
    traversal: BitFlightTransitionTraversal,
    completedAtSeconds: number
  ): void;
  getImmediateReturnPenalty(
    traversal: BitFlightTransitionTraversal,
    nowSeconds: number,
    suppressionSeconds: number,
    maximumPenalty: number
  ): number;
  getLastUsage(): BitFlightTransitionUsage | null;
  clear(): void;
}

export type BitFlightSearchPolicyConfig = Readonly<{
  explorationHistory: BitFlightExplorationHistory;
  transitionHistory: BitFlightTransitionHistory;
  nowSeconds: number;
  observationRadius: number;
  exploredDestinationPenalty: number;
  ordinaryTransitionPenalty: number;
  immediateReturnPenalty: number;
  returnSuppressionSeconds: number;
}>;

export type BitFlightSearchTransitionEvaluation = Readonly<{
  destinationWasExplored: boolean;
  providesSearchAccess: boolean;
  explorationPenalty: number;
  affordancePenalty: number;
  immediateReturnPenalty: number;
  totalCost: number;
}>;

export type BitFlightRouteCandidate<T> = Readonly<{
  value: T;
  location: BitFlightLocation;
  costBias: number;
}>;

export type BitFlightRouteSelection<T> = Readonly<{
  candidate: BitFlightRouteCandidate<T>;
  route: BitFlightRoute;
  totalCost: number;
}>;

export type BitFlightEscapePolicyConfig = Readonly<{
  origin: Vector3;
  threatPosition: Vector3;
  isLineOfSightBlocked(
    destination: Vector3,
    traversal: BitFlightTransitionTraversal
  ): boolean;
  desiredDistanceGain: number;
  visibleDestinationPenalty: number;
  insufficientDistanceGainPenaltyPerWorldUnit: number;
  transitionHistory: BitFlightTransitionHistory;
  nowSeconds: number;
  immediateReturnPenalty: number;
  returnSuppressionSeconds: number;
}>;

export type BitFlightEscapeTransitionEvaluation = Readonly<{
  destination: Vector3;
  lineOfSightBlocked: boolean;
  currentThreatDistance: number;
  destinationThreatDistance: number;
  distanceGain: number;
  visibilityPenalty: number;
  distanceGainPenalty: number;
  immediateReturnPenalty: number;
  totalCost: number;
}>;

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

const cloneBandRef = (band: BitFlightBandRef): BitFlightBandRef =>
  Object.freeze({ zoneId: band.zoneId, bandId: band.bandId });

const sameBand = (left: BitFlightBandRef, right: BitFlightBandRef) =>
  left.zoneId === right.zoneId && left.bandId === right.bandId;

const cloneExplorationSample = (
  sample: BitFlightExplorationSample
): BitFlightExplorationSample =>
  Object.freeze({
    band: cloneBandRef(sample.band),
    position: sample.position.clone(),
    observedAtSeconds: sample.observedAtSeconds
  });

const BIT_FLIGHT_EXPLORATION_SPATIAL_BUCKET_SIZE = 0.5;

const getExplorationSpatialBucketCoordinate = (value: number) =>
  Math.floor(value / BIT_FLIGHT_EXPLORATION_SPATIAL_BUCKET_SIZE);

const getExplorationSpatialBucketKey = (
  x: number,
  y: number,
  z: number
) => `${x},${y},${z}`;

const getExplorationSpatialBucketKeyForPosition = (position: Vector3) =>
  getExplorationSpatialBucketKey(
    getExplorationSpatialBucketCoordinate(position.x),
    getExplorationSpatialBucketCoordinate(position.y),
    getExplorationSpatialBucketCoordinate(position.z)
  );

class SharedBitFlightExplorationHistory
  implements BitFlightExplorationHistory
{
  private samplesByBand = new Map<
    string,
    Map<string, BitFlightExplorationSample>
  >();
  private lastPrunedAtSeconds: number | null = null;

  private static bandKey(band: BitFlightBandRef) {
    return JSON.stringify([band.zoneId, band.bandId]);
  }

  record(
    band: BitFlightBandRef,
    position: Vector3,
    observedAtSeconds: number
  ) {
    assertFiniteVector("飛行探索記録位置", position);
    assertNonNegativeFiniteNumber("飛行探索記録時刻", observedAtSeconds);
    const bandKey = SharedBitFlightExplorationHistory.bandKey(band);
    const spatialBucketKey =
      getExplorationSpatialBucketKeyForPosition(position);
    const bandSamples =
      this.samplesByBand.get(bandKey) ??
      new Map<string, BitFlightExplorationSample>();
    const current = bandSamples.get(spatialBucketKey);
    if (current && current.observedAtSeconds > observedAtSeconds) {
      return;
    }
    const sample = Object.freeze({
      band: cloneBandRef(band),
      position: position.clone(),
      observedAtSeconds
    });
    bandSamples.set(spatialBucketKey, sample);
    this.samplesByBand.set(bandKey, bandSamples);
  }

  recordLocation(
    location: BitFlightLocation,
    observedAtSeconds: number
  ) {
    this.record(
      { zoneId: location.zoneId, bandId: location.bandId },
      getBitFlightWorldPosition(location),
      observedAtSeconds
    );
  }

  hasRecentObservation(
    band: BitFlightBandRef,
    position: Vector3,
    radius: number,
    nowSeconds: number
  ) {
    assertFiniteVector("飛行探索照会位置", position);
    assertNonNegativeFiniteNumber("飛行探索照会半径", radius);
    this.prune(nowSeconds);
    const radiusSquared = radius * radius;
    const bandSamples = this.samplesByBand.get(
      SharedBitFlightExplorationHistory.bandKey(band)
    );
    if (!bandSamples) {
      return false;
    }
    const minimumX = getExplorationSpatialBucketCoordinate(
      position.x - radius
    );
    const maximumX = getExplorationSpatialBucketCoordinate(
      position.x + radius
    );
    const minimumY = getExplorationSpatialBucketCoordinate(
      position.y - radius
    );
    const maximumY = getExplorationSpatialBucketCoordinate(
      position.y + radius
    );
    const minimumZ = getExplorationSpatialBucketCoordinate(
      position.z - radius
    );
    const maximumZ = getExplorationSpatialBucketCoordinate(
      position.z + radius
    );
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        for (let z = minimumZ; z <= maximumZ; z += 1) {
          const sample = bandSamples.get(
            getExplorationSpatialBucketKey(x, y, z)
          );
          if (
            sample &&
            Vector3.DistanceSquared(sample.position, position) <=
              radiusSquared
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  getRecentSamples(nowSeconds: number) {
    this.prune(nowSeconds);
    return Object.freeze(
      [...this.samplesByBand.values()].flatMap((bandSamples) =>
        [...bandSamples.values()].map(cloneExplorationSample)
      )
    );
  }

  clear() {
    this.samplesByBand.clear();
    this.lastPrunedAtSeconds = null;
  }

  private prune(nowSeconds: number) {
    assertNonNegativeFiniteNumber("飛行探索現在時刻", nowSeconds);
    if (this.lastPrunedAtSeconds === nowSeconds) {
      return;
    }
    this.lastPrunedAtSeconds = nowSeconds;
    for (const [bandKey, bandSamples] of this.samplesByBand) {
      for (const [spatialBucketKey, sample] of bandSamples) {
        if (
          nowSeconds - sample.observedAtSeconds >
          BIT_FLIGHT_EXPLORATION_RETENTION_SECONDS
        ) {
          bandSamples.delete(spatialBucketKey);
        }
      }
      if (bandSamples.size === 0) {
        this.samplesByBand.delete(bandKey);
      }
    }
  }
}

class RecentBitFlightTransitionHistory
  implements BitFlightTransitionHistory
{
  private lastUsage: BitFlightTransitionUsage | null = null;

  record(
    traversal: BitFlightTransitionTraversal,
    completedAtSeconds: number
  ) {
    assertNonNegativeFiniteNumber("飛行遷移完了時刻", completedAtSeconds);
    this.lastUsage = Object.freeze({
      transitionId: traversal.transition.id,
      from: cloneBandRef(traversal.from),
      to: cloneBandRef(traversal.to),
      completedAtSeconds
    });
  }

  getImmediateReturnPenalty(
    traversal: BitFlightTransitionTraversal,
    nowSeconds: number,
    suppressionSeconds: number,
    maximumPenalty: number
  ) {
    assertNonNegativeFiniteNumber("飛行遷移評価時刻", nowSeconds);
    assertNonNegativeFiniteNumber(
      "飛行遷移往復抑止時間",
      suppressionSeconds
    );
    assertNonNegativeFiniteNumber(
      "飛行遷移往復最大ペナルティ",
      maximumPenalty
    );
    const usage = this.lastUsage;
    if (
      !usage ||
      usage.transitionId !== traversal.transition.id ||
      !sameBand(usage.from, traversal.to) ||
      !sameBand(usage.to, traversal.from)
    ) {
      return 0;
    }
    const elapsedSeconds = nowSeconds - usage.completedAtSeconds;
    if (
      elapsedSeconds < 0 ||
      elapsedSeconds >= suppressionSeconds ||
      suppressionSeconds === 0
    ) {
      return 0;
    }
    return maximumPenalty * (1 - elapsedSeconds / suppressionSeconds);
  }

  getLastUsage() {
    return this.lastUsage
      ? Object.freeze({
          transitionId: this.lastUsage.transitionId,
          from: cloneBandRef(this.lastUsage.from),
          to: cloneBandRef(this.lastUsage.to),
          completedAtSeconds: this.lastUsage.completedAtSeconds
        })
      : null;
  }

  clear() {
    this.lastUsage = null;
  }
}

const getTraversalDestination = (
  traversal: BitFlightTransitionTraversal
) =>
  traversal.reversed
    ? traversal.transition.fromPosition.clone()
    : traversal.transition.toPosition.clone();

const validateSearchPolicyConfig = (
  config: BitFlightSearchPolicyConfig
) => {
  assertNonNegativeFiniteNumber("探索遷移評価時刻", config.nowSeconds);
  assertNonNegativeFiniteNumber(
    "探索済み判定半径",
    config.observationRadius
  );
  assertNonNegativeFiniteNumber(
    "探索済み遷移ペナルティ",
    config.exploredDestinationPenalty
  );
  assertNonNegativeFiniteNumber(
    "通常遷移ペナルティ",
    config.ordinaryTransitionPenalty
  );
  assertNonNegativeFiniteNumber(
    "即時往復ペナルティ",
    config.immediateReturnPenalty
  );
  assertNonNegativeFiniteNumber(
    "即時往復抑止時間",
    config.returnSuppressionSeconds
  );
};

export const evaluateBitFlightSearchTransition = (
  traversal: BitFlightTransitionTraversal,
  config: BitFlightSearchPolicyConfig
): BitFlightSearchTransitionEvaluation => {
  validateSearchPolicyConfig(config);
  const destination = getTraversalDestination(traversal);
  const destinationWasExplored =
    config.explorationHistory.hasRecentObservation(
      traversal.to,
      destination,
      config.observationRadius,
      config.nowSeconds
    );
  const providesSearchAccess =
    traversal.transition.affordances.includes("search-vantage") ||
    traversal.transition.affordances.includes("window-access");
  const explorationPenalty = destinationWasExplored
    ? config.exploredDestinationPenalty
    : 0;
  const affordancePenalty = providesSearchAccess
    ? 0
    : config.ordinaryTransitionPenalty;
  const immediateReturnPenalty =
    config.transitionHistory.getImmediateReturnPenalty(
      traversal,
      config.nowSeconds,
      config.returnSuppressionSeconds,
      config.immediateReturnPenalty
    );
  return Object.freeze({
    destinationWasExplored,
    providesSearchAccess,
    explorationPenalty,
    affordancePenalty,
    immediateReturnPenalty,
    totalCost:
      explorationPenalty + affordancePenalty + immediateReturnPenalty
  });
};

export const createBitFlightSearchRoutePolicy = (
  config: BitFlightSearchPolicyConfig
): BitFlightRoutePolicy => {
  validateSearchPolicyConfig(config);
  return Object.freeze({
    canUseTransition: () => true,
    canUseRouteStep: () => true,
    additionalSurfaceCruiseHeights: () => Object.freeze([]),
    additionalTransitionCost: (traversal) =>
      evaluateBitFlightSearchTransition(traversal, config).totalCost
  });
};

export const selectLowestCostBitFlightRoute = <T>(
  navigationWorld: BitFlightNavigationWorld,
  start: BitFlightLocation,
  candidates: readonly BitFlightRouteCandidate<T>[],
  policy: BitFlightRoutePolicy
): BitFlightRouteSelection<T> | null => {
  let selected: BitFlightRouteSelection<T> | null = null;
  for (const candidate of candidates) {
    assertNonNegativeFiniteNumber(
      "飛行経路候補の固定コスト",
      candidate.costBias
    );
    const route = navigationWorld.findRoute(
      start,
      candidate.location,
      policy
    );
    if (!route) {
      continue;
    }
    const totalCost = route.totalCost + candidate.costBias;
    if (!selected || totalCost < selected.totalCost) {
      selected = Object.freeze({ candidate, route, totalCost });
    }
  }
  return selected;
};

const validateEscapePolicyConfig = (
  config: BitFlightEscapePolicyConfig
) => {
  assertFiniteVector("逃走開始位置", config.origin);
  assertFiniteVector("逃走元脅威位置", config.threatPosition);
  assertNonNegativeFiniteNumber(
    "逃走希望距離増分",
    config.desiredDistanceGain
  );
  assertNonNegativeFiniteNumber(
    "視認継続ペナルティ",
    config.visibleDestinationPenalty
  );
  assertNonNegativeFiniteNumber(
    "距離不足単位ペナルティ",
    config.insufficientDistanceGainPenaltyPerWorldUnit
  );
  assertNonNegativeFiniteNumber("逃走評価時刻", config.nowSeconds);
  assertNonNegativeFiniteNumber(
    "逃走即時往復ペナルティ",
    config.immediateReturnPenalty
  );
  assertNonNegativeFiniteNumber(
    "逃走即時往復抑止時間",
    config.returnSuppressionSeconds
  );
};

export const evaluateBitFlightEscapeTransition = (
  traversal: BitFlightTransitionTraversal,
  config: BitFlightEscapePolicyConfig
): BitFlightEscapeTransitionEvaluation => {
  validateEscapePolicyConfig(config);
  const destination = getTraversalDestination(traversal);
  const lineOfSightBlocked = config.isLineOfSightBlocked(
    destination.clone(),
    traversal
  );
  const currentThreatDistance = Vector3.Distance(
    config.origin,
    config.threatPosition
  );
  const destinationThreatDistance = Vector3.Distance(
    destination,
    config.threatPosition
  );
  const distanceGain =
    destinationThreatDistance - currentThreatDistance;
  const visibilityPenalty = lineOfSightBlocked
    ? 0
    : config.visibleDestinationPenalty;
  const distanceGainPenalty =
    Math.max(0, config.desiredDistanceGain - distanceGain) *
    config.insufficientDistanceGainPenaltyPerWorldUnit;
  const immediateReturnPenalty =
    config.transitionHistory.getImmediateReturnPenalty(
      traversal,
      config.nowSeconds,
      config.returnSuppressionSeconds,
      config.immediateReturnPenalty
    );
  return Object.freeze({
    destination,
    lineOfSightBlocked,
    currentThreatDistance,
    destinationThreatDistance,
    distanceGain,
    visibilityPenalty,
    distanceGainPenalty,
    immediateReturnPenalty,
    totalCost:
      visibilityPenalty + distanceGainPenalty + immediateReturnPenalty
  });
};

export const createBitFlightEscapeRoutePolicy = (
  config: BitFlightEscapePolicyConfig
): BitFlightRoutePolicy => {
  validateEscapePolicyConfig(config);
  return Object.freeze({
    canUseTransition: () => true,
    canUseRouteStep: () => true,
    additionalSurfaceCruiseHeights: () => Object.freeze([]),
    additionalTransitionCost: (traversal) =>
      evaluateBitFlightEscapeTransition(traversal, config).totalCost
  });
};

export const createBitFlightExplorationHistory =
  (): BitFlightExplorationHistory =>
    new SharedBitFlightExplorationHistory();

export const createBitFlightTransitionHistory =
  (): BitFlightTransitionHistory =>
    new RecentBitFlightTransitionHistory();
