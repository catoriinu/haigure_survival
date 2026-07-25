import { Vector3, type Mesh, type Scene } from "@babylonjs/core";

import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  createBitFlightBandRef,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightAffordance,
  type BitFlightBandId,
  type BitFlightBandRef,
  type BitFlightLocation,
  type BitFlightNavigationWorld,
  type BitFlightRoute,
  type BitFlightTransition,
  type BitFlightTransitionTraversal,
  type BitFlightZoneId
} from "../../../src/world/bitFlightNavigation";
import {
  BIT_FLIGHT_EXPLORATION_RETENTION_SECONDS,
  BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS,
  createBitFlightEscapeRoutePolicy,
  createBitFlightExplorationHistory,
  createBitFlightSearchRoutePolicy,
  createBitFlightTransitionHistory,
  evaluateBitFlightEscapeTransition,
  evaluateBitFlightSearchTransition,
  selectLowestCostBitFlightRoute
} from "../../../src/world/bitFlightTactics";

export type BitFlightTacticsTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): BitFlightTacticsTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const zoneOpen = toBitFlightZoneId("open-volume");
const zoneInner = toBitFlightZoneId("inner-volume");
const bandLow = toBitFlightBandId("low-air");
const bandMiddle = toBitFlightBandId("middle-air");
const bandHigh = toBitFlightBandId("high-air");
const lowRef = createBitFlightBandRef(zoneOpen, bandLow);
const middleRef = createBitFlightBandRef(zoneInner, bandMiddle);
const highRef = createBitFlightBandRef(zoneInner, bandHigh);

const createLocation = (
  zoneId: BitFlightZoneId,
  bandId: BitFlightBandId,
  position: Vector3
) =>
  Object.freeze({
    zoneId,
    bandId,
    surface: Object.freeze({
      position: position.clone(),
      polygonRef: 1
    }),
    safeCenterHeight: position.y
  }) as unknown as BitFlightLocation;

const createTraversal = (
  id: string,
  from: BitFlightBandRef,
  to: BitFlightBandRef,
  destination: Vector3,
  affordances: readonly BitFlightAffordance[]
): BitFlightTransitionTraversal => {
  const transition: BitFlightTransition = Object.freeze({
    id,
    kind: "vertical",
    from,
    to,
    bidirectional: true,
    affordances: Object.freeze([...affordances]),
    fromPosition: new Vector3(0, 1, 0),
    toPosition: destination.clone(),
    traversalPoints: Object.freeze([]),
    region: Object.freeze({
      minimum: new Vector3(-1, 0, -1),
      maximum: new Vector3(1, 8, 1),
      contains: (point: Vector3) =>
        point.x >= -1 &&
        point.x <= 1 &&
        point.y >= 0 &&
        point.y <= 8 &&
        point.z >= -1 &&
        point.z <= 1,
      containsSegment: (start: Vector3, end: Vector3) =>
        [start, end].every(
          (point) =>
            point.x >= -1 &&
            point.x <= 1 &&
            point.y >= 0 &&
            point.y <= 8 &&
            point.z >= -1 &&
            point.z <= 1
        )
    })
  });
  return Object.freeze({
    transition,
    from,
    to,
    reversed: false
  });
};

const reverseTraversal = (
  traversal: BitFlightTransitionTraversal
): BitFlightTransitionTraversal =>
  Object.freeze({
    transition: traversal.transition,
    from: traversal.to,
    to: traversal.from,
    reversed: true
  });

const createSurfaceRoute = (
  destination: BitFlightLocation,
  distance: number
): BitFlightRoute =>
  Object.freeze({
    steps: Object.freeze([
      Object.freeze({
        kind: "surface" as const,
        band: Object.freeze({
          zoneId: destination.zoneId,
          bandId: destination.bandId
        }),
        points: Object.freeze([destination]),
        distance
      })
    ]),
    destination,
    distance
  });

const createSearchFixture = () => {
  const history = createBitFlightExplorationHistory();
  history.record(middleRef, new Vector3(2, 3, 4), 100);
  const knownVantage = createTraversal(
    "known-vantage",
    lowRef,
    middleRef,
    new Vector3(2, 3, 4),
    ["search-vantage"]
  );
  const newAccess = createTraversal(
    "new-access",
    lowRef,
    highRef,
    new Vector3(8, 7, 0),
    ["window-access"]
  );
  const ordinaryAccess = createTraversal(
    "ordinary-access",
    lowRef,
    highRef,
    new Vector3(5, 7, 0),
    ["indoor-access"]
  );
  const transitionHistory = createBitFlightTransitionHistory();
  const config = Object.freeze({
    explorationHistory: history,
    transitionHistory,
    nowSeconds: 101,
    observationRadius: 0.5,
    exploredDestinationPenalty: 20,
    ordinaryTransitionPenalty: 5,
    immediateReturnPenalty: 30,
    returnSuppressionSeconds:
      BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS
  });
  return Object.freeze({
    history,
    knownVantage,
    newAccess,
    ordinaryAccess,
    transitionHistory,
    config
  });
};

const createEscapeFixture = () => {
  const farHidden = createTraversal(
    "far-hidden",
    lowRef,
    highRef,
    new Vector3(6, 7, 0),
    ["outdoor-access"]
  );
  const nearVisible = createTraversal(
    "near-visible",
    lowRef,
    middleRef,
    new Vector3(2, 3, 0),
    ["outdoor-access"]
  );
  const config = Object.freeze({
    origin: new Vector3(1, 1, 0),
    threatPosition: new Vector3(0, 1, 0),
    isLineOfSightBlocked: (destination: Vector3) => destination.x >= 5,
    desiredDistanceGain: 3,
    visibleDestinationPenalty: 10,
    insufficientDistanceGainPenaltyPerWorldUnit: 2,
    transitionHistory: createBitFlightTransitionHistory(),
    nowSeconds: 200,
    immediateReturnPenalty: 30,
    returnSuppressionSeconds:
      BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS
  });
  return Object.freeze({ farHidden, nearVisible, config });
};

export const runBitFlightTacticsTests =
  (): readonly BitFlightTacticsTestResult[] => {
    const results: BitFlightTacticsTestResult[] = [];

    results.push(
      executeTest("共有3D探索履歴を60秒間保持", () => {
        const history = createBitFlightExplorationHistory();
        history.record(middleRef, new Vector3(2, 3, 4), 0);
        const retained = history.hasRecentObservation(
          middleRef,
          new Vector3(2, 3, 4),
          0.01,
          BIT_FLIGHT_EXPLORATION_RETENTION_SECONDS
        );
        return {
          ok: retained,
          detail: `retainedAt=${BIT_FLIGHT_EXPLORATION_RETENTION_SECONDS}s / result=${retained}`
        };
      })
    );

    results.push(
      executeTest("探索履歴をゾーン・飛行帯ごとに分離", () => {
        const history = createBitFlightExplorationHistory();
        history.record(middleRef, new Vector3(2, 3, 4), 0);
        const mixed = history.hasRecentObservation(
          highRef,
          new Vector3(2, 3, 4),
          0.01,
          BIT_FLIGHT_EXPLORATION_RETENTION_SECONDS
        );
        return {
          ok: !mixed,
          detail: `recorded=${middleRef.zoneId}/${middleRef.bandId} / queried=${highRef.zoneId}/${highRef.bandId} / mixed=${mixed}`
        };
      })
    );

    results.push(
      executeTest("60秒を過ぎた探索履歴を破棄", () => {
        const history = createBitFlightExplorationHistory();
        history.record(middleRef, new Vector3(2, 3, 4), 0);
        const remaining = history.getRecentSamples(
          BIT_FLIGHT_EXPLORATION_RETENTION_SECONDS + 0.001
        ).length;
        return {
          ok: remaining === 0,
          detail: `remaining=${remaining}`
        };
      })
    );

    results.push(
      executeTest("探索済み見晴らし遷移へ再訪コストを付与", () => {
        const fixture = createSearchFixture();
        const evaluation = evaluateBitFlightSearchTransition(
          fixture.knownVantage,
          fixture.config
        );
        return {
          ok:
            evaluation.destinationWasExplored &&
            evaluation.totalCost === 20,
          detail: `explored=${evaluation.destinationWasExplored} / cost=${evaluation.totalCost}`
        };
      })
    );

    results.push(
      executeTest("未探索領域への探索向け遷移を高評価", () => {
        const fixture = createSearchFixture();
        const evaluation = evaluateBitFlightSearchTransition(
          fixture.newAccess,
          fixture.config
        );
        return {
          ok:
            !evaluation.destinationWasExplored &&
            evaluation.providesSearchAccess &&
            evaluation.totalCost === 0,
          detail: `explored=${evaluation.destinationWasExplored} / access=${evaluation.providesSearchAccess} / cost=${evaluation.totalCost}`
        };
      })
    );

    results.push(
      executeTest("通常遷移と探索向け遷移を区別", () => {
        const fixture = createSearchFixture();
        const evaluation = evaluateBitFlightSearchTransition(
          fixture.ordinaryAccess,
          fixture.config
        );
        return {
          ok:
            !evaluation.providesSearchAccess &&
            evaluation.totalCost === 5,
          detail: `access=${evaluation.providesSearchAccess} / cost=${evaluation.totalCost}`
        };
      })
    );

    results.push(
      executeTest("遷移直後の逆戻りへ時間減衰ペナルティを付与", () => {
        const fixture = createSearchFixture();
        fixture.transitionHistory.record(fixture.newAccess, 100);
        const evaluation = evaluateBitFlightSearchTransition(
          reverseTraversal(fixture.newAccess),
          fixture.config
        );
        return {
          ok: Math.abs(evaluation.immediateReturnPenalty - 20) < 1e-9,
          detail: `penalty=${evaluation.immediateReturnPenalty.toFixed(6)}`
        };
      })
    );

    results.push(
      executeTest("抑止時間後に逆戻りペナルティを解除", () => {
        const fixture = createSearchFixture();
        fixture.transitionHistory.record(fixture.newAccess, 100);
        const evaluation = evaluateBitFlightSearchTransition(
          reverseTraversal(fixture.newAccess),
          Object.freeze({
            ...fixture.config,
            nowSeconds:
              100 + BIT_FLIGHT_TRANSITION_RETURN_SUPPRESSION_SECONDS
          })
        );
        return {
          ok: evaluation.immediateReturnPenalty === 0,
          detail: `penalty=${evaluation.immediateReturnPenalty.toFixed(6)}`
        };
      })
    );

    results.push(
      executeTest("追跡入口を到達可能な完全経路コストで選択", () => {
        const start = createLocation(
          zoneOpen,
          bandLow,
          new Vector3(0, 1, 0)
        );
        const longCandidate = createLocation(
          zoneInner,
          bandMiddle,
          new Vector3(10, 3, 0)
        );
        const shortCandidate = createLocation(
          zoneInner,
          bandHigh,
          new Vector3(4, 7, 0)
        );
        const unreachableCandidate = createLocation(
          zoneInner,
          bandHigh,
          new Vector3(99, 7, 0)
        );
        const fakeWorld: BitFlightNavigationWorld = {
          zones: Object.freeze([]),
          bands: Object.freeze([]),
          transitions: Object.freeze([]),
          getZone: () => null,
          getBand: () => null,
          projectPointInBand: () => null,
          findLocationCandidates: () => Object.freeze([]),
          findRoute: (_origin, candidate) => {
            if (candidate.surface.position.x === 99) {
              return null;
            }
            return candidate.surface.position.x === 10
              ? createSurfaceRoute(candidate, 10)
              : createSurfaceRoute(candidate, 4);
          },
          findSurfaceRoute: () => null,
          findRouteThroughTransition: () => null,
          assertPreparedRoute: () => undefined,
          applyHeightSelection: () => {
            throw new Error("tactics単体テストでは高度選択を適用しません。");
          },
          constrainMovement: () => null,
          randomPointAround: () => null,
          getTransitionsFrom: () => Object.freeze([]),
          createDebugMeshes: (
            _scene: Scene
          ): readonly Mesh[] => Object.freeze([]),
          dispose: () => undefined
        };
        const selection = selectLowestCostBitFlightRoute(
          fakeWorld,
          start,
          Object.freeze([
            Object.freeze({
              value: "visually-detected-entry",
              location: longCandidate,
              costBias: 0
            }),
            Object.freeze({
              value: "reachable-alternate-entry",
              location: shortCandidate,
              costBias: 0
            }),
            Object.freeze({
              value: "unreachable-entry",
              location: unreachableCandidate,
              costBias: 0
            })
          ]),
          BIT_FLIGHT_SHORTEST_ROUTE_POLICY
        );
        return {
          ok:
            selection?.candidate.value === "reachable-alternate-entry" &&
            selection.totalCost === 4,
          detail: `selected=${selection?.candidate.value ?? "none"} / cost=${selection?.totalCost ?? "none"}`
        };
      })
    );

    results.push(
      executeTest("視線を切って距離を稼ぐ遷移を高評価", () => {
        const fixture = createEscapeFixture();
        const farEvaluation = evaluateBitFlightEscapeTransition(
          fixture.farHidden,
          fixture.config
        );
        return {
          ok:
            farEvaluation.lineOfSightBlocked &&
            farEvaluation.distanceGain >= fixture.config.desiredDistanceGain &&
            farEvaluation.totalCost === 0,
          detail: `blocked=${farEvaluation.lineOfSightBlocked} / gain=${farEvaluation.distanceGain.toFixed(3)} / cost=${farEvaluation.totalCost.toFixed(3)}`
        };
      })
    );

    results.push(
      executeTest("視認継続と距離不足を逃走コストへ反映", () => {
        const fixture = createEscapeFixture();
        const farEvaluation = evaluateBitFlightEscapeTransition(
          fixture.farHidden,
          fixture.config
        );
        const nearEvaluation = evaluateBitFlightEscapeTransition(
          fixture.nearVisible,
          fixture.config
        );
        return {
          ok:
            !nearEvaluation.lineOfSightBlocked &&
            nearEvaluation.visibilityPenalty === 10 &&
            nearEvaluation.totalCost > farEvaluation.totalCost,
          detail: `visibleCost=${nearEvaluation.totalCost.toFixed(3)} / hiddenCost=${farEvaluation.totalCost.toFixed(3)}`
        };
      })
    );

    results.push(
      executeTest("公開逃走ポリシーへ遷移評価を反映", () => {
        const fixture = createEscapeFixture();
        const policy = createBitFlightEscapeRoutePolicy(fixture.config);
        const hiddenCost = policy.additionalTransitionCost(
          fixture.farHidden
        );
        const visibleCost = policy.additionalTransitionCost(
          fixture.nearVisible
        );
        return {
          ok: hiddenCost < visibleCost,
          detail: `hidden=${hiddenCost.toFixed(3)} / visible=${visibleCost.toFixed(3)}`
        };
      })
    );

    results.push(
      executeTest("公開探索ポリシーへ共有履歴を反映", () => {
        const fixture = createSearchFixture();
        const policy = createBitFlightSearchRoutePolicy(fixture.config);
        const newCost = policy.additionalTransitionCost(fixture.newAccess);
        const knownCost = policy.additionalTransitionCost(
          fixture.knownVantage
        );
        return {
          ok: newCost < knownCost,
          detail: `new=${newCost.toFixed(3)} / known=${knownCost.toFixed(3)}`
        };
      })
    );

    return Object.freeze(results);
  };
