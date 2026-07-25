import { Vector3, type Mesh, type Scene } from "@babylonjs/core";

import {
  BIT_FLIGHT_SHORTEST_ROUTE_POLICY,
  createBitFlightBandRef,
  getBitFlightWorldPosition,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightLocation,
  type BitFlightNavigationWorld,
  type BitFlightRoute,
  type BitFlightTransition
} from "../../../src/world/bitFlightNavigation";
import {
  BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND,
  createBitFlightAgent
} from "../../../src/world/bitFlightAgent";
import {
  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
  type BitFlightSafety
} from "../../../src/world/bitFlightSafety";

export type BitFlightAgentTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): BitFlightAgentTestResult => {
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

const zoneA = toBitFlightZoneId("open-volume");
const zoneB = toBitFlightZoneId("inner-volume");
const bandA = toBitFlightBandId("lower-air");
const bandB = toBitFlightBandId("upper-air");
const refA = createBitFlightBandRef(zoneA, bandA);
const refB = createBitFlightBandRef(zoneB, bandB);

const createLocation = (
  zoneId: typeof zoneA,
  bandId: typeof bandA,
  position: Vector3,
  heightMode: BitFlightLocation["heightMode"] = "band"
) =>
  Object.freeze({
    zoneId,
    bandId,
    surface: Object.freeze({
      position: position.clone(),
      polygonRef: 1
    }),
    safeCenterHeight: position.y,
    heightMode
  }) as unknown as BitFlightLocation;

const start = createLocation(zoneA, bandA, new Vector3(0, 0, 0));
const entry = createLocation(zoneA, bandA, new Vector3(0.5, 0, 0));
const exit = createLocation(zoneB, bandB, new Vector3(0.5, 0.5, 0.5));
const destination = createLocation(zoneB, bandB, new Vector3(1, 0.5, 0.5));

const transition: BitFlightTransition = Object.freeze({
  id: "narrow-opening",
  kind: "aperture",
  from: refA,
  to: refB,
  bidirectional: true,
  affordances: Object.freeze(["indoor-access"] as const),
  fromPosition: entry.surface.position.clone(),
  toPosition: exit.surface.position.clone(),
  traversalPoints: Object.freeze([]),
  region: null
});

const routeAcrossBands: BitFlightRoute = Object.freeze({
  steps: Object.freeze([
    Object.freeze({
      kind: "surface" as const,
      band: refA,
      points: Object.freeze([start, entry]),
      distance: 0.5
    }),
    Object.freeze({
      kind: "transition" as const,
      traversal: Object.freeze({
        transition,
        from: refA,
        to: refB,
        reversed: false
      }),
      entry,
      exit,
      points: Object.freeze([
        entry.surface.position.clone(),
        new Vector3(0.5, 0.5, 0),
        exit.surface.position.clone()
      ]),
      distance: 1
    }),
    Object.freeze({
      kind: "surface" as const,
      band: refB,
      points: Object.freeze([exit, destination]),
      distance: 0.5
    })
  ]),
  destination,
  distance: 2
});

const routeWithinBand: BitFlightRoute = Object.freeze({
  steps: Object.freeze([
    Object.freeze({
      kind: "surface" as const,
      band: refB,
      points: Object.freeze([exit, destination]),
      distance: 0.5
    })
  ]),
  destination,
  distance: 0.5
});

const lowCeilingDestination = createLocation(
  zoneA,
  bandA,
  new Vector3(0.25, -0.1, 0),
  "low-ceiling"
);
const routeIntoLowCeiling: BitFlightRoute = Object.freeze({
  steps: Object.freeze([
    Object.freeze({
      kind: "surface" as const,
      band: refA,
      points: Object.freeze([start, lowCeilingDestination]),
      distance: Vector3.Distance(
        start.surface.position,
        lowCeilingDestination.surface.position
      )
    })
  ]),
  destination: lowCeilingDestination,
  distance: 0.3
});

const sameHorizontalDestination = createLocation(
  zoneA,
  bandA,
  new Vector3(0, 0.2, 0)
);
const routeVerticallyWithinBand: BitFlightRoute = Object.freeze({
  steps: Object.freeze([
    Object.freeze({
      kind: "surface" as const,
      band: refA,
      points: Object.freeze([start, sameHorizontalDestination]),
      distance: Vector3.Distance(
        start.surface.position,
        sameHorizontalDestination.surface.position
      )
    })
  ]),
  destination: sameHorizontalDestination,
  distance: 0.2
});

const nearSnapDestination = createLocation(
  zoneA,
  bandA,
  new Vector3(0.05, 0, 0)
);
const routeNearSurfaceSnap: BitFlightRoute = Object.freeze({
  steps: Object.freeze([
    Object.freeze({
      kind: "surface" as const,
      band: refA,
      points: Object.freeze([start, nearSnapDestination]),
      distance: 0.05
    })
  ]),
  destination: nearSnapDestination,
  distance: 0.05
});

const alternateEntry = createLocation(
  zoneA,
  bandA,
  new Vector3(0.5, 0, 1)
);
const alternateExit = createLocation(
  zoneB,
  bandB,
  new Vector3(0.5, 0.5, 1.5)
);
const alternateTransition: BitFlightTransition = Object.freeze({
  ...transition,
  id: "alternate-opening",
  fromPosition: alternateEntry.surface.position.clone(),
  toPosition: alternateExit.surface.position.clone()
});
const routeAcrossBandsAlternate: BitFlightRoute = Object.freeze({
  steps: Object.freeze([
    Object.freeze({
      kind: "surface" as const,
      band: refA,
      points: Object.freeze([start, alternateEntry]),
      distance: Vector3.Distance(
        start.surface.position,
        alternateEntry.surface.position
      )
    }),
    Object.freeze({
      kind: "transition" as const,
      traversal: Object.freeze({
        transition: alternateTransition,
        from: refA,
        to: refB,
        reversed: false
      }),
      entry: alternateEntry,
      exit: alternateExit,
      points: Object.freeze([
        alternateEntry.surface.position.clone(),
        new Vector3(0.5, 0.5, 1),
        alternateExit.surface.position.clone()
      ]),
      distance: 1
    }),
    Object.freeze({
      kind: "surface" as const,
      band: refB,
      points: Object.freeze([alternateExit, destination]),
      distance: Vector3.Distance(
        alternateExit.surface.position,
        destination.surface.position
      )
    })
  ]),
  destination,
  distance: 4
});

type AgentFixture = Readonly<{
  agent: ReturnType<typeof createBitFlightAgent>;
  selectRoute(route: BitFlightRoute | null): void;
  getFindRouteCount(): number;
  getConstrainMovementCount(): number;
  getSweepCount(): number;
}>;

const createAgentFixture = (
  initialRoutes: readonly BitFlightRoute[] = Object.freeze([
    routeAcrossBands
  ]),
  isMovementBlocked: (from: Vector3, to: Vector3) => boolean = () => false,
  waypointTolerance = 1e-6
): AgentFixture => {
  let selectedRoutes = [...initialRoutes];
  let findRouteCount = 0;
  let constrainMovementCount = 0;
  let sweepCount = 0;
  const safety: BitFlightSafety = {
    envelopeRadius: BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
    findMovementCollision: (from, to) => {
      sweepCount += 1;
      return isMovementBlocked(from, to)
        ? ({} as ReturnType<BitFlightSafety["findMovementCollision"]>)
        : null;
    },
    isCenterSafe: (center) => !isMovementBlocked(center, center),
    inspectVerticalClearance: () => {
      throw new Error("agent単体テストでは高度問い合わせを使用しません。");
    },
    selectBandCenterHeight: () => {
      throw new Error("agent単体テストでは高度選択を使用しません。");
    },
    selectLowCeilingCenterHeight: () => {
      throw new Error("agent単体テストでは低天井高度選択を使用しません。");
    },
    findLowCeilingCruiseHeights: () => Object.freeze([])
  };
  const fakeWorld: BitFlightNavigationWorld = {
    zones: Object.freeze([]),
    bands: Object.freeze([]),
    transitions: Object.freeze([transition]),
    getZone: () => null,
    getBand: (ref) =>
      Object.freeze({
        zoneId: ref.zoneId,
        id: ref.bandId,
        minimumCenterHeight: 0,
        maximumCenterHeight: 1
      }),
    projectPointInBand: () => null,
    findLocationCandidates: () => Object.freeze([]),
    findRoute: (_start, _destination, policy) => {
      findRouteCount += 1;
      return (
        selectedRoutes.find((route) =>
          route.steps.every((step) => policy.canUseRouteStep(step))
        ) ?? null
      );
    },
    findSurfaceRoute: () => null,
    findRouteThroughTransition: () => null,
    assertPreparedRoute: () => undefined,
    applyHeightSelection: () => {
      throw new Error("agent単体テストでは高度選択を適用しません。");
    },
    constrainMovement: (current, targetPosition, heightMode) => {
      constrainMovementCount += 1;
      return createLocation(
        current.zoneId as typeof zoneA,
        current.bandId as typeof bandA,
        targetPosition,
        heightMode
      );
    },
    randomPointAround: () => null,
    getTransitionsFrom: () => Object.freeze([]),
    createDebugMeshes: (_scene: Scene): readonly Mesh[] => Object.freeze([]),
    dispose: () => undefined
  };
  return Object.freeze({
    agent: createBitFlightAgent(
      fakeWorld,
      safety,
      {
        waypointTolerance
      }
    ),
    selectRoute: (route: BitFlightRoute | null) => {
      selectedRoutes = route ? [route] : [];
    },
    getFindRouteCount: () => findRouteCount,
    getConstrainMovementCount: () => constrainMovementCount,
    getSweepCount: () => sweepCount
  });
};

export const runBitFlightAgentTests =
  (): readonly BitFlightAgentTestResult[] => {
    const results: BitFlightAgentTestResult[] = [];

    results.push(
      executeTest("遷移速度は物理1m/s相当", () => ({
        ok: BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND === 0.25,
        detail: `${BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND.toFixed(3)} world units/s`
      }))
    );

    results.push(
      executeTest("帯内経路をNavMesh拘束して遷移へ接続", () => {
        const fixture = createAgentFixture();
        try {
          const routeAccepted = fixture.agent.setRoute(
            start,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          const snapshot = fixture.agent.update(0.5, 1);
          return {
            ok:
              routeAccepted &&
              snapshot.state === "transition" &&
              snapshot.location === null &&
              snapshot.transition?.transition.id === "narrow-opening" &&
              fixture.getConstrainMovementCount() > 0 &&
              fixture.getSweepCount() > 0,
            detail: `accepted=${routeAccepted} / state=${snapshot.state} / transition=${snapshot.transition?.transition.id ?? "none"} / constrained=${fixture.getConstrainMovementCount()} / sweeps=${fixture.getSweepCount()}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("危険辺を除外して別の完全経路を選択", () => {
        const fixture = createAgentFixture(
          Object.freeze([
            routeAcrossBands,
            routeAcrossBandsAlternate
          ]),
          (from, to) =>
            from.x === 0.5 &&
            from.z === 0 &&
            to.x === 0.5 &&
            to.z === 0 &&
            from.y !== to.y
        );
        try {
          const routeAccepted = fixture.agent.setRoute(
            start,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          const snapshot = fixture.agent.update(0.5, 1);
          return {
            ok:
              routeAccepted &&
              snapshot.state === "surface" &&
              snapshot.routeStepCount === 3 &&
              fixture.getFindRouteCount() === 1 &&
              fixture.getSweepCount() > 0,
            detail: `accepted=${routeAccepted} / state=${snapshot.state} / steps=${snapshot.routeStepCount} / findRoute=${fixture.getFindRouteCount()} / sweeps=${fixture.getSweepCount()}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("通常帯から低天井許可位置へ移動して保持", () => {
        const fixture = createAgentFixture(
          Object.freeze([routeIntoLowCeiling])
        );
        try {
          const routeAccepted = fixture.agent.setRoute(
            start,
            lowCeilingDestination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          const snapshot = fixture.agent.update(0.5, 1);
          return {
            ok:
              routeAccepted &&
              snapshot.state === "arrived" &&
              snapshot.location?.heightMode === "low-ceiling" &&
              snapshot.location.safeCenterHeight ===
                lowCeilingDestination.safeCenterHeight &&
              snapshot.position?.equals(
                getBitFlightWorldPosition(lowCeilingDestination)
              ) === true,
            detail: `accepted=${routeAccepted} / state=${snapshot.state} / mode=${snapshot.location?.heightMode ?? "none"} / height=${snapshot.location?.safeCenterHeight ?? "none"}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("同一XZの高度変更も帯内速度で補間", () => {
        const fixture = createAgentFixture(
          Object.freeze([routeVerticallyWithinBand])
        );
        try {
          const routeAccepted = fixture.agent.setRoute(
            start,
            sameHorizontalDestination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          const snapshot = fixture.agent.update(0.06, 0.1);
          const position = snapshot.position;
          return {
            ok:
              routeAccepted &&
              snapshot.state === "surface" &&
              position !== null &&
              Math.abs(position.x) < 1e-6 &&
              Math.abs(position.y - 0.006) < 1e-6 &&
              Math.abs(position.z) < 1e-6,
            detail: `accepted=${routeAccepted} / state=${snapshot.state} / position=${position?.toString() ?? "none"}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("帯内許容距離snap直前も安全包絡を検査", () => {
        let blockSnap = false;
        const fixture = createAgentFixture(
          Object.freeze([routeNearSurfaceSnap]),
          (from, to) =>
            blockSnap &&
            from.x >= 0.029 &&
            to.x === nearSnapDestination.surface.position.x,
          0.03
        );
        try {
          const routeAccepted = fixture.agent.setRoute(
            start,
            nearSnapDestination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          blockSnap = true;
          const snapshot = fixture.agent.update(0.03, 1);
          return {
            ok:
              routeAccepted &&
              snapshot.state === "blocked" &&
              snapshot.position !== null &&
              Math.abs(snapshot.position.x - 0.03) < 1e-6,
            detail: `accepted=${routeAccepted} / state=${snapshot.state} / position=${snapshot.position?.toString() ?? "none"}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("遷移許容距離snap直前も安全包絡を検査", () => {
        let blockSnap = false;
        const fixture = createAgentFixture(
          Object.freeze([routeAcrossBands]),
          (from, to) =>
            blockSnap &&
            from.x === 0.5 &&
            from.z === 0 &&
            from.y >= 0.47 &&
            to.x === 0.5 &&
            to.y === 0.5 &&
            to.z === 0,
          0.03
        );
        try {
          const routeAccepted = fixture.agent.setRoute(
            start,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          fixture.agent.update(0.5, 1);
          blockSnap = true;
          const snapshot = fixture.agent.update(0.5, 1.9);
          return {
            ok:
              routeAccepted &&
              snapshot.state === "blocked" &&
              snapshot.position !== null &&
              Math.abs(snapshot.position.y - 0.475) < 1e-6,
            detail: `accepted=${routeAccepted} / state=${snapshot.state} / position=${snapshot.position?.toString() ?? "none"}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("遷移中は固定速度・進行方向向き", () => {
        const fixture = createAgentFixture();
        try {
          fixture.agent.setRoute(
            start,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          fixture.agent.update(0.5, 1);
          const snapshot = fixture.agent.update(0.5, 1);
          const positionY = snapshot.position?.y ?? Number.NaN;
          const facingY = snapshot.facingDirection?.y ?? Number.NaN;
          return {
            ok:
              Math.abs(positionY - 0.25) < 1e-6 &&
              Math.abs(facingY - 1) < 1e-6,
            detail: `positionY=${positionY.toFixed(6)} / facingY=${facingY.toFixed(6)}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("遷移中clearは近い遷移端へ安全離脱", () => {
        const fixture = createAgentFixture();
        try {
          fixture.agent.setRoute(
            start,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          fixture.agent.update(0.5, 1);
          fixture.agent.update(0.5, 1);
          const middleSnapshot = fixture.agent.update(0.5, 1);
          fixture.agent.clear();
          const clearingSnapshot = fixture.agent.getSnapshot();
          const completedSnapshot = fixture.agent.update(0.5, 2);
          return {
            ok:
              Math.abs((middleSnapshot.position?.y ?? Number.NaN) - 0.5) <
                1e-6 &&
              clearingSnapshot.state === "clearing-transition" &&
              completedSnapshot.state === "idle" &&
              completedSnapshot.location?.zoneId === zoneB &&
              completedSnapshot.location.bandId === bandB,
            detail: `middleY=${middleSnapshot.position?.y.toFixed(6) ?? "none"} / clearing=${clearingSnapshot.state} / completed=${completedSnapshot.state} / band=${completedSnapshot.location?.bandId ?? "none"}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("遷移安全離脱中の二重clearは状態と終端を変更しない", () => {
        const fixture = createAgentFixture();
        try {
          fixture.agent.setRoute(
            start,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          fixture.agent.update(0.5, 1);
          fixture.agent.update(0.5, 1);
          fixture.agent.update(0.5, 1);
          fixture.agent.clear();
          const firstClearSnapshot = fixture.agent.getSnapshot();
          fixture.agent.clear();
          const secondClearSnapshot = fixture.agent.getSnapshot();
          const completedSnapshot = fixture.agent.update(0.5, 2);
          return {
            ok:
              firstClearSnapshot.state === "clearing-transition" &&
              secondClearSnapshot.state === "clearing-transition" &&
              firstClearSnapshot.position?.equals(
                secondClearSnapshot.position!
              ) === true &&
              completedSnapshot.state === "idle" &&
              completedSnapshot.location?.zoneId === zoneB &&
              completedSnapshot.location.bandId === bandB,
            detail:
              `first=${firstClearSnapshot.state}/${firstClearSnapshot.position?.toString() ?? "none"} / ` +
              `second=${secondClearSnapshot.state}/${secondClearSnapshot.position?.toString() ?? "none"} / ` +
              `completed=${completedSnapshot.state}/${completedSnapshot.location?.bandId ?? "none"}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("経路再設定後に到着位置を更新", () => {
        const fixture = createAgentFixture();
        try {
          fixture.agent.setRoute(
            start,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          fixture.agent.clear();
          fixture.selectRoute(routeWithinBand);
          const routeAccepted = fixture.agent.setRoute(
            exit,
            destination,
            BIT_FLIGHT_SHORTEST_ROUTE_POLICY
          );
          const snapshot = fixture.agent.update(0.5, 1);
          return {
            ok:
              routeAccepted &&
              snapshot.state === "arrived" &&
              snapshot.location?.zoneId === destination.zoneId &&
              snapshot.position?.equals(destination.surface.position) === true &&
              fixture.getFindRouteCount() === 2,
            detail: `accepted=${routeAccepted} / state=${snapshot.state} / findRoute=${fixture.getFindRouteCount()} / position=${snapshot.position?.toString() ?? "none"}`
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("非有限deltaSecondsを拒否", () => {
        const fixture = createAgentFixture();
        try {
          let message: string | null = null;
          try {
            fixture.agent.update(0.5, Number.NaN);
          } catch (error) {
            message = error instanceof Error ? error.message : String(error);
          }
          return {
            ok: message?.includes("deltaSeconds") === true,
            detail: message ?? "例外なし"
          };
        } finally {
          fixture.agent.dispose();
        }
      })
    );

    results.push(
      executeTest("破棄済みagentの使用を拒否", () => {
        const fixture = createAgentFixture();
        fixture.agent.dispose();
        let message: string | null = null;
        try {
          fixture.agent.getSnapshot();
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        return {
          ok: message?.includes("破棄済み") === true,
          detail: message ?? "例外なし"
        };
      })
    );

    return Object.freeze(results);
  };
