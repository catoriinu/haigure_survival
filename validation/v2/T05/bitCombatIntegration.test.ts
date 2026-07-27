import {
  InstancedMesh,
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND
} from "../../../src/world/bitFlightAgent";
import {
  createBitFlightBandRef,
  getBitFlightWorldPosition,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightBand,
  type BitFlightBandRef,
  type BitFlightHeightMode,
  type BitFlightHeightSelection,
  type BitFlightLocation,
  type BitFlightNavigationWorld,
  type BitFlightRoute,
  type BitFlightRoutePolicy,
  type BitFlightTransition,
  type BitFlightTransitionTraversal
} from "../../../src/world/bitFlightNavigation";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import type { StageVolume } from "../../../src/world/stageSpatialQueries";
import {
  V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES,
  createV2BitSystem,
  type V2BitFlightState,
  type V2BitMode,
  type V2BitSystem
} from "../../../src/v2/bitSystem";
import {
  V2_BIT_ATTACK_COOLDOWN_SECONDS,
  V2_BIT_CARPET_FIRE_INTERVAL_SECONDS,
  V2_BIT_CARPET_PASS_DURATION_SECONDS,
  V2_BIT_FIRE_TELEGRAPH_SECONDS,
  V2_BIT_RANDOM_DURATION_SECONDS,
  V2_STANDARD_BIT_COMBAT_PROFILE
} from "../../../src/v2/bitCombatProfile";
import type {
  V2ExternalAlert,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import type {
  BitSystemAcceptanceFixture
} from "./bitSystemAcceptance.test";

export type BitCombatIntegrationCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type QueuedRandom = Readonly<{
  random(): number;
  enqueue(...values: readonly number[]): void;
}>;

type CombatHarness = Readonly<{
  scene: Scene;
  system: V2BitSystem;
  random: QueuedRandom;
  dispose(systemAlreadyDisposed?: boolean): void;
}>;

const BAND_CENTER_HEIGHT = 1.4;
const BASE_SEARCH_SPEED = 0.25;
const BASE_CHASE_SPEED = 0.22;
const FIRE_RANGE = 1.2;
const TARGET_LOST_MAXIMUM_DISTANCE =
  V2_STANDARD_BIT_COMBAT_PROFILE.visionRange + 0.5;
const ALERT_SPAWN_RADIUS = 0.2;
const RANDOM_ATTACK_SPEED = 0.28;
const RED_VERTICAL_SEARCH_SPEED = 0.18;
const NORMAL_PATROL_EXPECTED_RANDOM_POINT_CALLS = 4;
const BRUTE_FORCE_EXPECTED_RANDOM_POINT_CALLS = 3;
const CARPET_HEIGHT_SPEED = 0.35;
const CARPET_TARGET_HEIGHT_OFFSET = 1.2;
const CARPET_SCATTER_RADIANS = 0.35;
const CARPET_TURN_RATE = Math.PI * 0.35;
const CARPET_STEER_STRENGTH = 0.18;
const CARPET_AIM_BLEND = 0.2;
const CARPET_FOLLOWER_FADE_SECONDS = 1;
const POSITION_EPSILON = 1e-6;
const TICK_SECONDS = 0.01;
const EMPTY_TARGETS: readonly V2HumanTargetSnapshot[] = Object.freeze([]);
const EMPTY_ALERTS: readonly V2ExternalAlert[] = Object.freeze([]);

const TEST_ZONE_ID = toBitFlightZoneId("t05-bit-combat-zone");
const TEST_BAND_ID = toBitFlightBandId("t05-bit-combat-band");
const TEST_BAND_REF = createBitFlightBandRef(
  TEST_ZONE_ID,
  TEST_BAND_ID
);
const TEST_BAND: BitFlightBand = Object.freeze({
  zoneId: TEST_ZONE_ID,
  id: TEST_BAND_ID,
  minimumCenterHeight: 1,
  maximumCenterHeight: 1.8
});

const createQueuedRandom = (
  initialValues: readonly number[] = Object.freeze([])
): QueuedRandom => {
  const queue = [...initialValues];
  return Object.freeze({
    random: () => queue.shift() ?? 0.5,
    enqueue: (...values) => {
      queue.push(...values);
    }
  });
};

const createLocation = (
  position: Vector3,
  heightMode: BitFlightHeightMode = "band",
  band: BitFlightBandRef = TEST_BAND_REF
): BitFlightLocation =>
  Object.freeze({
    zoneId: band.zoneId,
    bandId: band.bandId,
    surface: Object.freeze({
      position: new Vector3(
        position.x,
        BAND_CENTER_HEIGHT,
        position.z
      ),
      polygonRef: 1
    }),
    safeCenterHeight: position.y,
    heightMode
  }) as unknown as BitFlightLocation;

const cloneLocation = (location: BitFlightLocation) =>
  createLocation(
    getBitFlightWorldPosition(location),
    location.heightMode,
    location
  );

const createRoute = (
  start: BitFlightLocation,
  destination: BitFlightLocation,
  policy: BitFlightRoutePolicy
): BitFlightRoute | null => {
  const distance = Vector3.Distance(
    getBitFlightWorldPosition(start),
    getBitFlightWorldPosition(destination)
  );
  if (distance <= POSITION_EPSILON) {
    return Object.freeze({
      steps: Object.freeze([]),
      destination: cloneLocation(destination),
      distance: 0,
      totalCost: 0
    });
  }
  const step = Object.freeze({
    kind: "surface" as const,
    band: TEST_BAND_REF,
    points: Object.freeze([
      cloneLocation(start),
      cloneLocation(destination)
    ]),
    distance
  });
  policy.additionalSurfaceCruiseHeights(step, TEST_BAND);
  if (!policy.canUseRouteStep(step)) {
    return null;
  }
  return Object.freeze({
    steps: Object.freeze([step]),
    destination: cloneLocation(destination),
    distance,
    totalCost: distance
  });
};

const createNavigation = (
  rejectConstrainedMovement = false
): BitFlightNavigationWorld => {
  const project = (position: Vector3) =>
    createLocation(
      new Vector3(
        position.x,
        Math.min(
          TEST_BAND.maximumCenterHeight,
          Math.max(TEST_BAND.minimumCenterHeight, position.y)
        ),
        position.z
      )
    );
  const findRoute = (
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ) => createRoute(start, destination, policy);

  return Object.freeze({
    zones: Object.freeze([
      Object.freeze({ id: TEST_ZONE_ID, spaceKind: "indoor" as const })
    ]),
    bands: Object.freeze([TEST_BAND]),
    transitions: Object.freeze([]),
    getZone: (id: typeof TEST_ZONE_ID) =>
      id === TEST_ZONE_ID
        ? Object.freeze({
            id: TEST_ZONE_ID,
            spaceKind: "indoor" as const
          })
        : null,
    getBand: (ref: BitFlightBandRef) =>
      ref.zoneId === TEST_ZONE_ID && ref.bandId === TEST_BAND_ID
        ? TEST_BAND
        : null,
    projectPointInBand: (
      ref: BitFlightBandRef,
      position: Vector3
    ) =>
      ref.zoneId === TEST_ZONE_ID && ref.bandId === TEST_BAND_ID
        ? project(position)
        : null,
    findLocationCandidates: (position: Vector3) =>
      Object.freeze([project(position)]),
    findRoute,
    findSurfaceRoute: findRoute,
    findRouteThroughTransition: (
      start: BitFlightLocation,
      _traversal: BitFlightTransitionTraversal,
      destination: BitFlightLocation,
      policy: BitFlightRoutePolicy
    ) => findRoute(start, destination, policy),
    assertPreparedRoute: () => {},
    applyHeightSelection: (
      location: BitFlightLocation,
      selection: BitFlightHeightSelection
    ) =>
      createLocation(
        new Vector3(
          location.surface.position.x,
          selection.center.y,
          location.surface.position.z
        ),
        selection.heightMode
      ),
    constrainMovement: (
      _start: BitFlightLocation,
      destination: Vector3,
      heightMode: BitFlightHeightMode
    ) =>
      rejectConstrainedMovement
        ? null
        : createLocation(destination, heightMode),
    randomPointAround: (
      origin: BitFlightLocation,
      radius: number
    ) => {
      const position = getBitFlightWorldPosition(origin);
      return createLocation(
        position.add(new Vector3(radius, 0, 0))
      );
    },
    getTransitionsFrom: (
      _ref: BitFlightBandRef
    ): readonly BitFlightTransitionTraversal[] => Object.freeze([]),
    createDebugMeshes: () => Object.freeze([]),
    dispose: () => {}
  }) as BitFlightNavigationWorld;
};

const ROUTE_CANDIDATE_PROJECTION_OFFSET = 1 / 128;
const ROUTE_CANDIDATE_TIE_BAND_ID = toBitFlightBandId(
  "t05-bit-route-candidate-tie-band"
);
const ROUTE_CANDIDATE_BETTER_BAND_ID = toBitFlightBandId(
  "t05-bit-route-candidate-better-band"
);
const ROUTE_CANDIDATE_TIE_BAND_REF = createBitFlightBandRef(
  TEST_ZONE_ID,
  ROUTE_CANDIDATE_TIE_BAND_ID
);
const ROUTE_CANDIDATE_BETTER_BAND_REF = createBitFlightBandRef(
  TEST_ZONE_ID,
  ROUTE_CANDIDATE_BETTER_BAND_ID
);

type RouteCandidateNavigationFixture = Readonly<{
  navigation: BitFlightNavigationWorld;
  resetMeasurements(): void;
  getFindRouteCounts(): Readonly<{
    first: number;
    tied: number;
    better: number;
  }>;
  getPreparedRoutes(): readonly BitFlightRoute[];
  getExpectedFirstRoute(): BitFlightRoute | null;
  getExpectedBetterRoute(): BitFlightRoute | null;
}>;

const createRouteCandidateNavigationFixture = (
  includeBetterCandidate: boolean
): RouteCandidateNavigationFixture => {
  const base = createNavigation();
  const createCandidateBand = (
    ref: BitFlightBandRef
  ): BitFlightBand =>
    Object.freeze({
      zoneId: ref.zoneId,
      id: ref.bandId,
      minimumCenterHeight: TEST_BAND.minimumCenterHeight,
      maximumCenterHeight: TEST_BAND.maximumCenterHeight
    });
  const tiedBand = createCandidateBand(ROUTE_CANDIDATE_TIE_BAND_REF);
  const betterBand = createCandidateBand(
    ROUTE_CANDIDATE_BETTER_BAND_REF
  );
  const bands = Object.freeze([
    TEST_BAND,
    tiedBand,
    ...(includeBetterCandidate ? [betterBand] : [])
  ]);
  let firstFindRouteCount = 0;
  let tiedFindRouteCount = 0;
  let betterFindRouteCount = 0;
  let expectedFirstRoute: BitFlightRoute | null = null;
  let expectedBetterRoute: BitFlightRoute | null = null;
  const preparedRoutes: BitFlightRoute[] = [];
  const getBand = (ref: BitFlightBandRef) =>
    bands.find(
      (band) =>
        band.zoneId === ref.zoneId && band.id === ref.bandId
    ) ?? null;
  const projectPointInBand = (
    ref: BitFlightBandRef,
    position: Vector3
  ) => {
    const band = getBand(ref)!;
    const horizontalOffset =
      ref.bandId === ROUTE_CANDIDATE_TIE_BAND_ID
        ? -ROUTE_CANDIDATE_PROJECTION_OFFSET
        : ref.bandId === ROUTE_CANDIDATE_BETTER_BAND_ID
          ? 0
          : ROUTE_CANDIDATE_PROJECTION_OFFSET;
    return createLocation(
      new Vector3(
        position.x + horizontalOffset,
        Math.min(
          band.maximumCenterHeight,
          Math.max(band.minimumCenterHeight, position.y)
        ),
        position.z
      ),
      "band",
      ref
    );
  };
  const findRoute = (
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ) => {
    if (destination.bandId === TEST_BAND_ID) {
      firstFindRouteCount += 1;
    } else if (
      destination.bandId === ROUTE_CANDIDATE_TIE_BAND_ID
    ) {
      tiedFindRouteCount += 1;
    } else {
      betterFindRouteCount += 1;
    }
    const route = createRoute(start, destination, policy);
    if (destination.bandId === TEST_BAND_ID) {
      expectedFirstRoute = route;
    } else if (
      destination.bandId === ROUTE_CANDIDATE_BETTER_BAND_ID
    ) {
      expectedBetterRoute = route;
    }
    return route;
  };
  const navigation = Object.freeze({
    ...base,
    bands,
    getBand,
    projectPointInBand,
    findLocationCandidates: (position: Vector3) =>
      Object.freeze(
        bands.map((band) =>
          projectPointInBand(
            { zoneId: band.zoneId, bandId: band.id },
            position
          )
        )
      ),
    findRoute,
    findSurfaceRoute: findRoute,
    findRouteThroughTransition: (
      start: BitFlightLocation,
      _traversal: BitFlightTransitionTraversal,
      destination: BitFlightLocation,
      policy: BitFlightRoutePolicy
    ) => findRoute(start, destination, policy),
    assertPreparedRoute: (
      _currentLocation: BitFlightLocation,
      route: BitFlightRoute
    ) => {
      preparedRoutes.push(route);
    },
    applyHeightSelection: (
      location: BitFlightLocation,
      selection: BitFlightHeightSelection
    ) =>
      createLocation(
        new Vector3(
          location.surface.position.x,
          selection.center.y,
          location.surface.position.z
        ),
        selection.heightMode,
        location
      ),
    constrainMovement: (
      start: BitFlightLocation,
      destination: Vector3,
      heightMode: BitFlightHeightMode
    ) => createLocation(destination, heightMode, start),
    randomPointAround: (
      origin: BitFlightLocation,
      radius: number
    ) =>
      createLocation(
        getBitFlightWorldPosition(origin).add(
          new Vector3(radius, 0, 0)
        ),
        origin.heightMode,
        origin
      )
  }) as BitFlightNavigationWorld;

  return Object.freeze({
    navigation,
    resetMeasurements: () => {
      firstFindRouteCount = 0;
      tiedFindRouteCount = 0;
      betterFindRouteCount = 0;
      expectedFirstRoute = null;
      expectedBetterRoute = null;
      preparedRoutes.length = 0;
    },
    getFindRouteCounts: () =>
      Object.freeze({
        first: firstFindRouteCount,
        tied: tiedFindRouteCount,
        better: betterFindRouteCount
      }),
    getPreparedRoutes: () => Object.freeze([...preparedRoutes]),
    getExpectedFirstRoute: () => expectedFirstRoute,
    getExpectedBetterRoute: () => expectedBetterRoute
  });
};

const createInitialRandomValues = (
  initialBitCount: number,
  createRedProfile = false
): readonly number[] => {
  const values: number[] = [];
  for (let index = 0; index < initialBitCount; index += 1) {
    values.push(
      0.5,
      (index + 1) / (initialBitCount + 1),
      0.5,
      0.5,
      0.5
    );
  }
  for (let index = 0; index < initialBitCount; index += 1) {
    values.push(
      createRedProfile ? 0 : 0.5,
      0,
      0,
      0.5
    );
  }
  return Object.freeze(values);
};

const createHarness = (
  initialBitCount = 1,
  isSightBlocked: (
    from: Vector3,
    to: Vector3
  ) => boolean = () => false,
  createRedProfile = false,
  rejectConstrainedMovement = false,
  onMovementSweep: (
    from: Vector3,
    to: Vector3
  ) => boolean = () => false,
  navigationOverride: BitFlightNavigationWorld | null = null
): CombatHarness => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const navigation =
    navigationOverride ?? createNavigation(rejectConstrainedMovement);
  const spawn = MeshBuilder.CreateBox(
    `T05BitCombatSpawn_${initialBitCount}`,
    {
      width: Math.max(4, initialBitCount * 2),
      height: 0.1,
      depth: 0.1
    },
    scene
  );
  spawn.position.y = BAND_CENTER_HEIGHT;
  spawn.computeWorldMatrix(true);
  const volume: StageVolume = Object.freeze({
    id: `t05-bit-combat-spawn-${initialBitCount}`,
    role: "bit_spawn",
    bitFlightBand: TEST_BAND_REF,
    mesh: spawn
  });
  const spatial = Object.freeze({
    bitNavigation: navigation,
    volumes: Object.freeze({
      all: Object.freeze([volume]),
      getById: (id: string) => (id === volume.id ? volume : null),
      getByRole: (role: StageVolume["role"]) =>
        role === "bit_spawn"
          ? Object.freeze([volume])
          : Object.freeze([])
    }),
    worldBoundary: null,
    queries: Object.freeze({
      castMovementSegment: () => null,
      castMovementSphere: (
        _kind: string,
        from: Vector3,
        to: Vector3
      ) => {
        return onMovementSweep(from, to)
          ? Object.freeze({})
          : null;
      },
      castBeamSegment: () => null,
      castSightSegment: (from: Vector3, to: Vector3) =>
        isSightBlocked(from, to)
          ? Object.freeze({ blocked: true })
          : null,
      sampleGround: () => null,
      containsVolume: () => false,
      dispose: () => {}
    })
  }) as unknown as StageSpatialContext;
  const random = createQueuedRandom(
    createInitialRandomValues(initialBitCount, createRedProfile)
  );
  const system = createV2BitSystem(scene, spatial, {
    combatEnabled: true,
    initialBitCount,
    minimumSpawnDistance: 0,
    spawnMaxAttempts: 8,
    spawnProjectionMaxDistance: 0.35,
    random: random.random
  });

  return Object.freeze({
    scene,
    system,
    random,
    dispose: (systemAlreadyDisposed = false) => {
      if (!systemAlreadyDisposed) {
        system.dispose();
      }
      spawn.dispose(false, false);
      scene.dispose();
      engine.dispose();
    }
  });
};

const placeHarnessBitsAtSamePosition = (
  harness: CombatHarness,
  position = new Vector3(0, BAND_CENTER_HEIGHT, 0)
) => {
  harness.system.placeBits(
    harness.system.getFrameView().actorSpheres.map((actor) =>
      Object.freeze({
        id: actor.id,
        centerPosition: position
      })
    )
  );
};

const runNormalPatrolReachContractCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    const radii: number[] = [];
    let randomPointCallCount = 0;
    const navigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: (
        origin: BitFlightLocation,
        radius: number
      ) => {
        radii.push(radius);
        randomPointCallCount += 1;
        const direction = randomPointCallCount <= 12 ? 1 : -1;
        return createLocation(
          getBitFlightWorldPosition(origin).add(
            new Vector3(direction * radius, 0, 0)
          ),
          origin.heightMode,
          origin
        );
      }
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      1,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.random.enqueue(0.2, 0.5, 0.5, 0.5, 0.5);
      update(harness.system, 0, 0, EMPTY_TARGETS);
      const planned = harness.system.getFrameView().flightStates[0];
      let afterFiveSeconds = planned;
      let afterElevenSeconds = planned;
      for (let tick = 1; tick <= 210; tick += 1) {
        update(
          harness.system,
          0.1,
          tick * 0.1,
          EMPTY_TARGETS
        );
        if (tick === 50) {
          afterFiveSeconds =
            harness.system.getFrameView().flightStates[0];
        }
        if (tick === 110) {
          afterElevenSeconds =
            harness.system.getFrameView().flightStates[0];
        }
      }
      const afterTwentyOneSeconds =
        harness.system.getFrameView().flightStates[0];
      const horizontalProgress =
        afterFiveSeconds.position.x - planned.position.x;
      const continuedProgress =
        afterElevenSeconds.position.x - planned.position.x;
      const thirdLegProgress =
        afterTwentyOneSeconds.position.x - planned.position.x;
      return Object.freeze({
        name: "通常探索は半径3.0・速度0.3でO→A→B→Cへ継続",
        ok:
          radii.length >= 4 &&
          radii.slice(0, 4).every(
            (radius) => Math.abs(radius - 3) <= POSITION_EPSILON
          ) &&
          planned.routePurpose === "search" &&
          afterFiveSeconds.routePurpose === "search" &&
          afterFiveSeconds.agentState === "surface" &&
          horizontalProgress >= 1.49 &&
          horizontalProgress <= 1.51 &&
          afterElevenSeconds.routePurpose === "search" &&
          afterElevenSeconds.agentState === "surface" &&
          continuedProgress >= 3.28 &&
          continuedProgress <= 3.32 &&
          afterTwentyOneSeconds.routePurpose === "search" &&
          afterTwentyOneSeconds.agentState === "surface" &&
          thirdLegProgress >= 6.28 &&
          thirdLegProgress <= 6.34,
        detail:
          `radii=${radii.slice(0, 4).join(",")} / ` +
          `calls=${randomPointCallCount} / ` +
          `progress=${horizontalProgress.toFixed(6)}/${continuedProgress.toFixed(6)}/${thirdLegProgress.toFixed(6)} / ` +
          `state=${afterFiveSeconds.agentState}/${afterElevenSeconds.agentState}/${afterTwentyOneSeconds.agentState}`
      });
    } finally {
      harness.dispose();
    }
  };

const runNormalPatrolDetourLifetimeCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    let randomPointCallCount = 0;
    const findDetourRoute = (
      start: BitFlightLocation,
      destination: BitFlightLocation,
      policy: BitFlightRoutePolicy
    ): BitFlightRoute | null => {
      const startPosition = getBitFlightWorldPosition(start);
      const destinationPosition =
        getBitFlightWorldPosition(destination);
      const waypoint = createLocation(
        startPosition.add(new Vector3(0, 0, 1.5)),
        start.heightMode,
        start
      );
      const distance =
        Vector3.Distance(
          startPosition,
          getBitFlightWorldPosition(waypoint)
        ) +
        Vector3.Distance(
          getBitFlightWorldPosition(waypoint),
          destinationPosition
        );
      const step = Object.freeze({
        kind: "surface" as const,
        band: TEST_BAND_REF,
        points: Object.freeze([
          cloneLocation(start),
          waypoint,
          cloneLocation(destination)
        ]),
        distance
      });
      policy.additionalSurfaceCruiseHeights(step, TEST_BAND);
      if (!policy.canUseRouteStep(step)) {
        return null;
      }
      return Object.freeze({
        steps: Object.freeze([step]),
        destination: cloneLocation(destination),
        distance,
        totalCost: distance
      });
    };
    const navigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: (
        origin: BitFlightLocation,
        radius: number
      ) => {
        randomPointCallCount += 1;
        return createLocation(
          getBitFlightWorldPosition(origin).add(
            new Vector3(radius, 0, 0)
          ),
          origin.heightMode,
          origin
        );
      },
      findRoute: findDetourRoute,
      findSurfaceRoute: findDetourRoute
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      1,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.random.enqueue(0.2, 0.5, 0.5, 0.5, 0.5);
      update(harness.system, 0, 0, EMPTY_TARGETS);
      for (let tick = 1; tick <= 120; tick += 1) {
        update(
          harness.system,
          0.1,
          tick * 0.1,
          EMPTY_TARGETS
        );
      }
      const state = harness.system.getFrameView().flightStates[0];
      return Object.freeze({
        name: "通常探索は12秒継続する迂回経路を時間だけで破棄しない",
        ok:
          state.routePurpose === "search" &&
          state.agentState === "surface" &&
          state.position.x >= 1.8 &&
          state.position.x <= 2 &&
          randomPointCallCount >= 8,
        detail:
          `position=${state.position.x.toFixed(3)},${state.position.z.toFixed(3)} / ` +
          `state=${state.agentState}/${state.routePurpose ?? "none"} / ` +
          `candidateCalls=${randomPointCallCount}`
      });
    } finally {
      harness.dispose();
    }
  };

const runNormalPatrolReservationCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    let randomPointCallCount = 0;
    const candidateOffsets = Object.freeze([
      3,
      3,
      3,
      3,
      3,
      -3,
      2,
      -2,
      3,
      3,
      3,
      3,
      9,
      -3,
      3,
      -2
    ]);
    const navigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: (
        origin: BitFlightLocation,
        _radius: number
      ) => {
        const callIndex = randomPointCallCount;
        randomPointCallCount += 1;
        const offset = candidateOffsets[callIndex] ?? 3;
        return createLocation(
          getBitFlightWorldPosition(origin).add(
            new Vector3(offset, 0, 0)
          ),
          origin.heightMode,
          origin
        );
      }
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      2,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.random.enqueue(
        0.2,
        0.5,
        0.5,
        0.5,
        0.5,
        0.2,
        0.5,
        0.5,
        0.5,
        0.5
      );
      update(harness.system, 0, 0, EMPTY_TARGETS);
      for (let tick = 1; tick <= 110; tick += 1) {
        update(
          harness.system,
          0.1,
          tick * 0.1,
          EMPTY_TARGETS
        );
      }
      const states = harness.system.getFrameView().flightStates;
      const separation = Math.abs(
        states[0].position.x - states[1].position.x
      );
      return Object.freeze({
        name: "同帯予約1.0でA・先読みBを分散し到達後も継続",
        ok:
          states.length === 2 &&
          states.every(
            (state) =>
              state.routePurpose === "search" &&
              state.agentState === "surface"
          ) &&
          states[0].position.x >= 3.28 &&
          states[1].position.x <= -3.28 &&
          separation >= 6.56,
        detail:
          `x=${states.map((state) => state.position.x.toFixed(3)).join("/")} / ` +
          `separation=${separation.toFixed(3)} / ` +
          `candidateCalls=${randomPointCallCount}`
      });
    } finally {
      harness.dispose();
    }
  };

const runNormalPatrolReservationBestEffortCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    const navigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: (
        origin: BitFlightLocation,
        radius: number
      ) =>
        createLocation(
          getBitFlightWorldPosition(origin).add(
            new Vector3(radius, 0, 0)
          ),
          origin.heightMode,
          origin
        )
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      2,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      update(harness.system, 0, 0, EMPTY_TARGETS);
      update(harness.system, 1, 1, EMPTY_TARGETS);
      const states = harness.system.getFrameView().flightStates;
      return Object.freeze({
        name: "予約半径内しか候補がない場合もbest-effortで停止しない",
        ok:
          states.length === 2 &&
          states.every(
            (state) =>
              state.routePurpose === "search" &&
              state.agentState === "surface" &&
              state.position.x >= 0.29 &&
              state.position.x <= 0.31
          ),
        detail:
          `states=${states.map((state) =>
            `${state.position.x.toFixed(3)}/${state.routePurpose ?? "none"}`
          ).join(",")}`
      });
    } finally {
      harness.dispose();
    }
  };

const runNormalPatrolReversePenaltyCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    const offsets = Object.freeze([
      3,
      3,
      3,
      3,
      -3,
      3,
      -2,
      2
    ]);
    let randomPointCallCount = 0;
    const navigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: (
        origin: BitFlightLocation,
        _radius: number
      ) => {
        const offset = offsets[randomPointCallCount] ?? 3;
        randomPointCallCount += 1;
        return createLocation(
          getBitFlightWorldPosition(origin).add(
            new Vector3(offset, 0, 0)
          ),
          origin.heightMode,
          origin
        );
      }
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      1,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.random.enqueue(0.2, 0.5, 0.5, 0.5, 0.5);
      update(harness.system, 0, 0, EMPTY_TARGETS);
      for (let tick = 1; tick <= 110; tick += 1) {
        update(
          harness.system,
          0.1,
          tick * 0.1,
          EMPTY_TARGETS
        );
      }
      const state = harness.system.getFrameView().flightStates[0];
      return Object.freeze({
        name: "先読み候補が同距離なら直前区間への逆戻りを減点",
        ok:
          state.routePurpose === "search" &&
          state.agentState === "surface" &&
          state.position.x >= 3.28 &&
          state.position.x <= 3.32 &&
          randomPointCallCount >= 8,
        detail:
          `x=${state.position.x.toFixed(3)} / ` +
          `calls=${randomPointCallCount} / ` +
          `state=${state.routePurpose ?? "none"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBruteForceScheduleBoundaryCheck =
  (): BitCombatIntegrationCheck => {
    const runCase = (roll: number) => {
      const baseNavigation = createNavigation();
      let randomPointCallCount = 0;
      const navigation = Object.freeze({
        ...baseNavigation,
        randomPointAround: (
          _origin: BitFlightLocation,
          _radius: number
        ) => {
          randomPointCallCount += 1;
          return null;
        }
      }) as BitFlightNavigationWorld;
      const harness = createHarness(
        1,
        () => false,
        false,
        false,
        () => false,
        navigation
      );
      try {
        placeHarnessBitsAtSamePosition(harness);
        harness.system.setDiagnosticsEnabled(true);
        harness.random.enqueue(roll);
        update(harness.system, 0, 40, EMPTY_TARGETS);
        return Object.freeze({
          randomPointCallCount,
          routePurpose:
            harness.system.getFrameView().flightStates[0]
              ?.routePurpose ?? null,
          searchRoutePlans:
            harness.system.getFrameView().diagnostics.routePlans.search
        });
      } finally {
        harness.dispose();
      }
    };
    const accepted = runCase(0.249);
    const rejected = runCase(0.25);
    return Object.freeze({
      name: "40秒時点の総当たり開始を10秒周期・25%境界で判定",
      ok:
        accepted.randomPointCallCount ===
          BRUTE_FORCE_EXPECTED_RANDOM_POINT_CALLS &&
        rejected.randomPointCallCount ===
          NORMAL_PATROL_EXPECTED_RANDOM_POINT_CALLS &&
        accepted.routePurpose === "search" &&
        rejected.routePurpose === null &&
        accepted.searchRoutePlans === 1 &&
        rejected.searchRoutePlans === 1,
      detail:
        `accepted=${accepted.randomPointCallCount}/${accepted.routePurpose}/${accepted.searchRoutePlans} / ` +
        `rejected=${rejected.randomPointCallCount}/${rejected.routePurpose}/${rejected.searchRoutePlans}`
    });
  };

const runBruteForceScheduleIntervalCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    let randomPointCallCount = 0;
    const navigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: () => {
        randomPointCallCount += 1;
        return null;
      }
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      1,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.random.enqueue(
        0.5,
        0.25,
        0.5,
        0.5,
        0.249,
        0.5,
        0.5,
        0.5
      );
      update(harness.system, 0, 39, EMPTY_TARGETS);
      const beforeStart =
        harness.system.getFrameView().flightStates[0].routePurpose;
      update(harness.system, 1, 40, EMPTY_TARGETS);
      const rejectedAtStart =
        harness.system.getFrameView().flightStates[0].routePurpose;
      update(harness.system, 9.9, 49.9, EMPTY_TARGETS);
      const beforeNextBoundary =
        harness.system.getFrameView().flightStates[0].routePurpose;
      update(harness.system, 0.5, 50, EMPTY_TARGETS);
      const acceptedAtNextBoundary =
        harness.system.getFrameView().flightStates[0].routePurpose;
      return Object.freeze({
        name: "総当たり抽選は40秒開始・不成立後50秒まで再抽選しない",
        ok:
          beforeStart === null &&
          rejectedAtStart === null &&
          beforeNextBoundary === null &&
          acceptedAtNextBoundary === "search" &&
          randomPointCallCount === 15,
        detail:
          `states=${beforeStart ?? "none"}/${rejectedAtStart ?? "none"}/${beforeNextBoundary ?? "none"}/${acceptedAtNextBoundary ?? "none"} / ` +
          `candidateCalls=${randomPointCallCount}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBruteForceFleetPlanningBudgetCheck =
  (): BitCombatIntegrationCheck => {
    const bitCount = 50;
    const baseNavigation = createNavigation();
    const navigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: () => null
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      bitCount,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.system.setDiagnosticsEnabled(true);
      const firstUpdateRolls: number[] = [];
      for (let index = 0; index < bitCount; index += 1) {
        firstUpdateRolls.push(0.2);
        if (index < 4) {
          firstUpdateRolls.push(
            0.5,
            0.5,
            0.5
          );
        }
      }
      harness.random.enqueue(...firstUpdateRolls);
      const routePlanCounts: number[] = [];
      for (let updateIndex = 0; updateIndex < 13; updateIndex += 1) {
        update(
          harness.system,
          0,
          40 + updateIndex * 0.01,
          EMPTY_TARGETS
        );
        routePlanCounts.push(
          harness.system.getFrameView().diagnostics.routePlans.search
        );
      }
      const plannedBitCount =
        harness.system.getFrameView().flightStates.filter(
          (state) => state.routePurpose === "search"
        ).length;
      const maximumPlansPerUpdate = Math.max(...routePlanCounts);
      update(harness.system, 1, 41, EMPTY_TARGETS);
      const uniqueMovedPositions = new Set(
        harness.system.getFrameView().flightStates.map((state) =>
          [
            state.position.x.toFixed(3),
            state.position.y.toFixed(3),
            state.position.z.toFixed(3)
          ].join(",")
        )
      ).size;
      return Object.freeze({
        name: "50機の総当たりを4件以下・13更新以内で分散計画",
        ok:
          routePlanCounts
            .slice(0, -1)
            .every((count) => count === 4) &&
          routePlanCounts[routePlanCounts.length - 1] === 2 &&
          maximumPlansPerUpdate <= 4 &&
          plannedBitCount === bitCount &&
          uniqueMovedPositions >= 8,
        detail:
          `plans=${routePlanCounts.join(",")} / ` +
          `max=${maximumPlansPerUpdate} / ` +
          `planned=${plannedBitCount}/${bitCount} / ` +
          `positions=${uniqueMovedPositions}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBruteForceCandidatePagingCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    const traversals: readonly BitFlightTransitionTraversal[] =
      Object.freeze(
        Array.from({ length: 9 }, (_, index) => {
          const destination = new Vector3(
            index + 1,
            BAND_CENTER_HEIGHT,
            0
          );
          return Object.freeze({
            transition: Object.freeze({
              id: `t05-brute-page-${index}`,
              kind: "aperture" as const,
              from: TEST_BAND_REF,
              to: TEST_BAND_REF,
              bidirectional: false,
              affordances: Object.freeze([]),
              fromPosition: new Vector3(
                0,
                BAND_CENTER_HEIGHT,
                0
              ),
              toPosition: destination,
              traversalPoints: Object.freeze([
                new Vector3(0, BAND_CENTER_HEIGHT, 0),
                destination
              ]),
              region: null
            }),
            from: TEST_BAND_REF,
            to: TEST_BAND_REF,
            reversed: false
          });
        })
      );
    const attemptedDestinationXs: number[] = [];
    const attemptedDestinations: Vector3[] = [];
    const navigation = Object.freeze({
      ...baseNavigation,
      transitions: Object.freeze(
        traversals.map((traversal) => traversal.transition)
      ),
      getTransitionsFrom: () => traversals,
      randomPointAround: () => null,
      findSurfaceRoute: () => null,
      findRoute: (
        start: BitFlightLocation,
        destination: BitFlightLocation
      ) => {
        const destinationX =
          getBitFlightWorldPosition(destination).x;
        attemptedDestinationXs.push(destinationX);
        attemptedDestinations.push(
          getBitFlightWorldPosition(destination)
        );
        if (destinationX < 9) {
          return null;
        }
        const distance = Vector3.Distance(
          getBitFlightWorldPosition(start),
          getBitFlightWorldPosition(destination)
        );
        return Object.freeze({
          steps: Object.freeze([]),
          destination: cloneLocation(destination),
          distance,
          totalCost: distance
        });
      }
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      1,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.system.setDiagnosticsEnabled(true);
      harness.random.enqueue(0.249, 0.5, 0.5, 0.5);
      const routePurposes: Array<
        V2BitFlightState["routePurpose"]
      > = [];
      for (
        let updateIndex = 0;
        updateIndex < 17;
        updateIndex += 1
      ) {
        update(
          harness.system,
          updateIndex === 0 ? 0 : 0.5,
          40 + updateIndex * 0.5,
          EMPTY_TARGETS
        );
        routePurposes.push(
          harness.system.getFrameView().flightStates[0].routePurpose
        );
      }
      const attemptsBeforeNinth = [...attemptedDestinationXs];
      update(harness.system, 0.5, 48.5, EMPTY_TARGETS);
      routePurposes.push(
        harness.system.getFrameView().flightStates[0].routePurpose
      );
      const attemptedFirstEightTransitions = new Set(
        attemptsBeforeNinth.filter(
          (destinationX) =>
            destinationX >= 1 && destinationX <= 8
        )
      );
      const firstEightFrontierDirections = new Set(
        attemptedDestinations
          .filter((_destination, index) => index % 2 === 0)
          .slice(0, 8)
          .map(
            (destination) =>
              `${destination.x.toFixed(3)},${destination.z.toFixed(3)}`
          )
      );
      return Object.freeze({
        name: "総当たり遷移は前半8件失敗後も9件目を計画",
        ok:
          routePurposes
            .slice(0, 17)
            .every((purpose) => purpose === null) &&
          attemptedFirstEightTransitions.size === 8 &&
          firstEightFrontierDirections.size === 8 &&
          attemptedDestinationXs[
            attemptedDestinationXs.length - 1
          ] === 9 &&
          routePurposes[17] === "search",
        detail:
          `before9=${attemptsBeforeNinth.join(",")} / ` +
          `all=${attemptedDestinationXs.join(",")} / ` +
          `frontier=${[...firstEightFrontierDirections].join("|")} / ` +
          `states=${routePurposes.map((purpose) => purpose ?? "none").join(",")}`
      });
    } finally {
      harness.dispose();
    }
  };

const runWindowCursorAndInteriorContinuationCheck =
  (): BitCombatIntegrationCheck => {
    const indoorZoneId = toBitFlightZoneId(
      "t05-bit-window-indoor-zone"
    );
    const indoorBandId = toBitFlightBandId(
      "t05-bit-window-indoor-band"
    );
    const indoorBandRef = createBitFlightBandRef(
      indoorZoneId,
      indoorBandId
    );
    const indoorBand: BitFlightBand = Object.freeze({
      zoneId: indoorZoneId,
      id: indoorBandId,
      minimumCenterHeight: 1,
      maximumCenterHeight: 1.8
    });
    const transitions = Object.freeze(
      Array.from({ length: 4 }, (_, index) =>
        Object.freeze({
          id: `t05-window-${index}`,
          kind: "aperture" as const,
          from: TEST_BAND_REF,
          to: indoorBandRef,
          bidirectional: false,
          affordances: Object.freeze(["window-access" as const]),
          fromPosition: new Vector3(
            0,
            BAND_CENTER_HEIGHT,
            index * 0.1
          ),
          toPosition: new Vector3(
            0.2,
            BAND_CENTER_HEIGHT,
            index * 0.1
          ),
          traversalPoints: Object.freeze([
            new Vector3(0, BAND_CENTER_HEIGHT, index * 0.1),
            new Vector3(0.2, BAND_CENTER_HEIGHT, index * 0.1)
          ]),
          region: null
        })
      )
    );
    const traversals: readonly BitFlightTransitionTraversal[] =
      Object.freeze(
        transitions.map((transition) =>
          Object.freeze({
            transition,
            from: TEST_BAND_REF,
            to: indoorBandRef,
            reversed: false
          })
        )
      );
    const planned: Array<
      Readonly<{
        transitionId: string;
        destination: Vector3;
        exit: Vector3;
      }>
    > = [];
    const getBand = (ref: BitFlightBandRef) =>
      ref.zoneId === TEST_ZONE_ID && ref.bandId === TEST_BAND_ID
        ? TEST_BAND
        : ref.zoneId === indoorZoneId &&
            ref.bandId === indoorBandId
          ? indoorBand
          : null;
    const projectPointInBand = (
      ref: BitFlightBandRef,
      position: Vector3
    ) => {
      const band = getBand(ref);
      return band
        ? createLocation(
            new Vector3(
              position.x,
              Math.min(
                band.maximumCenterHeight,
                Math.max(band.minimumCenterHeight, position.y)
              ),
              position.z
            ),
            "band",
            ref
          )
        : null;
    };
    const createPreparedRoute = (
      start: BitFlightLocation,
      destination: BitFlightLocation
    ): BitFlightRoute => {
      const distance = Vector3.Distance(
        getBitFlightWorldPosition(start),
        getBitFlightWorldPosition(destination)
      );
      return Object.freeze({
        steps: Object.freeze([]),
        destination: cloneLocation(destination),
        distance,
        totalCost: distance
      });
    };
    const navigation = Object.freeze({
      zones: Object.freeze([
        Object.freeze({
          id: TEST_ZONE_ID,
          spaceKind: "outdoor" as const
        }),
        Object.freeze({
          id: indoorZoneId,
          spaceKind: "indoor" as const
        })
      ]),
      bands: Object.freeze([TEST_BAND, indoorBand]),
      transitions,
      getZone: (id: typeof TEST_ZONE_ID) =>
        id === TEST_ZONE_ID
          ? Object.freeze({
              id: TEST_ZONE_ID,
              spaceKind: "outdoor" as const
            })
          : id === indoorZoneId
            ? Object.freeze({
                id: indoorZoneId,
                spaceKind: "indoor" as const
              })
            : null,
      getBand,
      projectPointInBand,
      findLocationCandidates: (position: Vector3) =>
        Object.freeze([
          projectPointInBand(TEST_BAND_REF, position)!,
          projectPointInBand(indoorBandRef, position)!
        ]),
      findRoute: (
        start: BitFlightLocation,
        destination: BitFlightLocation
      ) => createPreparedRoute(start, destination),
      findSurfaceRoute: () => null,
      findRouteThroughTransition: (
        start: BitFlightLocation,
        traversal: BitFlightTransitionTraversal,
        destination: BitFlightLocation
      ) => {
        planned.push(
          Object.freeze({
            transitionId: traversal.transition.id,
            destination:
              getBitFlightWorldPosition(destination),
            exit: traversal.transition.toPosition.clone()
          })
        );
        return createPreparedRoute(start, destination);
      },
      assertPreparedRoute: () => {},
      applyHeightSelection: (
        location: BitFlightLocation,
        selection: BitFlightHeightSelection
      ) =>
        createLocation(
          new Vector3(
            location.surface.position.x,
            selection.center.y,
            location.surface.position.z
          ),
          selection.heightMode,
          location
        ),
      constrainMovement: (
        start: BitFlightLocation,
        destination: Vector3,
        heightMode: BitFlightHeightMode
      ) => createLocation(destination, heightMode, start),
      randomPointAround: (
        origin: BitFlightLocation,
        radius: number
      ) =>
        origin.zoneId === TEST_ZONE_ID
          ? null
          : createLocation(
              getBitFlightWorldPosition(origin).add(
                new Vector3(Math.min(radius, 2), 0, 0)
              ),
              origin.heightMode,
              origin
            ),
      getTransitionsFrom: (ref: BitFlightBandRef) =>
        ref.zoneId === TEST_ZONE_ID && ref.bandId === TEST_BAND_ID
          ? traversals
          : Object.freeze([]),
      createDebugMeshes: () => Object.freeze([]),
      dispose: () => {}
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      4,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      harness.system.setDiagnosticsEnabled(true);
      update(harness.system, 0, 0, EMPTY_TARGETS);
      const uniqueTransitionIds = new Set(
        planned.map((entry) => entry.transitionId)
      );
      const continuedInside = planned.every(
        (entry) =>
          Math.hypot(
            entry.destination.x - entry.exit.x,
            entry.destination.z - entry.exit.z
          ) >= 1.2
      );
      return Object.freeze({
        name: "生成番号カーソルで4窓へ分散し屋内安全点まで同一経路化",
        ok:
          planned.length === 4 &&
          uniqueTransitionIds.size === 4 &&
          continuedInside &&
          harness.system.getFrameView().diagnostics.routePlans.search ===
            4,
        detail:
          `transitions=${[...uniqueTransitionIds].join(",")} / ` +
          `depths=${planned.map((entry) =>
            Math.hypot(
              entry.destination.x - entry.exit.x,
              entry.destination.z - entry.exit.z
            ).toFixed(3)
          ).join(",")} / ` +
          `plans=${harness.system.getFrameView().diagnostics.routePlans.search}`
      });
    } finally {
      harness.dispose();
    }
  };

const runRedVerticalSearchSpeedCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(1, () => false, true);
    try {
      harness.random.enqueue(
        0.7,
        0,
        0.999,
        0,
        0.999,
        0,
        0.999,
        0,
        0.999,
        0.5
      );
      update(harness.system, 0, 0, EMPTY_TARGETS);
      const before = harness.system.getFrameView().flightStates[0];
      update(harness.system, 1, 1, EMPTY_TARGETS);
      const after = harness.system.getFrameView().flightStates[0];
      const beforeHeight = before.safeCenterHeight;
      const afterHeight = after.safeCenterHeight;
      const verticalMovement =
        beforeHeight === null || afterHeight === null
          ? Number.NaN
          : Math.abs(afterHeight - beforeHeight);
      const horizontalMovement = Math.hypot(
        after.position.x - before.position.x,
        after.position.z - before.position.z
      );
      const targetState = harness.system.getFrameView().targetStates[0];
      return Object.freeze({
        name: "combat有効の赤bitは純vertical探索を0.18m/sで実行",
        ok:
          targetState.isRed &&
          after.routePurpose === "search" &&
          after.agentState === "surface" &&
          horizontalMovement <= POSITION_EPSILON &&
          Math.abs(
            verticalMovement - RED_VERTICAL_SEARCH_SPEED
          ) <= POSITION_EPSILON,
        detail:
          `red=${targetState.isRed} / ` +
          `state=${after.agentState}/${after.routePurpose ?? "none"} / ` +
          `vertical=${Number.isFinite(verticalMovement) ? verticalMovement.toFixed(6) : "none"}/` +
          `${RED_VERTICAL_SEARCH_SPEED.toFixed(6)} / ` +
          `horizontal=${horizontalMovement.toExponential(2)}`
      });
    } finally {
      harness.dispose();
    }
  };

const runRedTransitionSpeedCheck = (
  fixture: BitSystemAcceptanceFixture
): BitCombatIntegrationCheck => {
  const spawn = MeshBuilder.CreateBox(
    "T05RedBitTransitionSpawn",
    { width: 0.04, height: 0.1, depth: 0.04 },
    fixture.scene
  );
  spawn.position.copyFrom(
    fixture.pointInBand(fixture.concourseRef, 0, 0)
  );
  spawn.computeWorldMatrix(true);
  const volume: StageVolume = Object.freeze({
    id: "t05-red-bit-transition-spawn",
    role: "bit_spawn",
    bitFlightBand: fixture.concourseRef,
    mesh: spawn
  });
  const spatial = Object.freeze({
    bitNavigation: fixture.navigation,
    volumes: Object.freeze({
      all: Object.freeze([volume]),
      getById: (id: string) => (id === volume.id ? volume : null),
      getByRole: (role: StageVolume["role"]) =>
        role === "bit_spawn"
          ? Object.freeze([volume])
          : Object.freeze([])
    }),
    worldBoundary: null,
    queries: Object.freeze({
      castMovementSegment: () => null,
      castMovementSphere: () => null,
      castBeamSegment: () => null,
      castSightSegment: () => Object.freeze({ blocked: true }),
      sampleGround: () => null,
      containsVolume: () => false,
      dispose: () => {}
    })
  }) as unknown as StageSpatialContext;
  const random = createQueuedRandom(
    createInitialRandomValues(1, true)
  );
  const system = createV2BitSystem(fixture.scene, spatial, {
    combatEnabled: true,
    initialBitCount: 1,
    minimumSpawnDistance: 0,
    spawnMaxAttempts: 8,
    spawnProjectionMaxDistance: 0.35,
    random: random.random
  });
  try {
    const target = createTarget(
      "red-transition-target",
      fixture.pointInBand(fixture.mezzanineRef, 0, 0)
    );
    const leader = createTarget(
      "red-transition-leader",
      fixture.pointInBand(fixture.mezzanineRef, 0, 0)
    );
    const targets = Object.freeze([leader, target]);
    random.enqueue(0.1, 0.5);
    update(
      system,
      0,
      0,
      targets,
      Object.freeze([
        Object.freeze({
          leaderId: leader.id,
          targetId: target.id,
          remainingSeconds: 10
        })
      ])
    );
    const beforeTransition = system.getFrameView().flightStates[0];
    update(system, 1, 1, targets);
    const activeTransition = system.getFrameView().flightStates[0];
    update(system, 0.1, 1.1, EMPTY_TARGETS);
    const clearingTransition = system.getFrameView().flightStates[0];
    const targetState = system.getFrameView().targetStates[0];
    const transitionMovement = Vector3.Distance(
      beforeTransition.position,
      activeTransition.position
    );
    const clearingMovement = Vector3.Distance(
      activeTransition.position,
      clearingTransition.position
    );
    const expectedTransitionMovement =
      BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND;
    const expectedClearingMovement =
      BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND * 0.1;
    return Object.freeze({
      name: "赤bitも共通transitionとclearingを固定1m/sで実行",
      ok:
        targetState.isRed &&
        activeTransition.agentState === "transition" &&
        activeTransition.activeTransition?.id ===
          "atrium-lift-volume" &&
        clearingTransition.agentState === "clearing-transition" &&
        clearingTransition.activeTransition?.id ===
          "atrium-lift-volume" &&
        Math.abs(
          transitionMovement - expectedTransitionMovement
        ) <= POSITION_EPSILON &&
        Math.abs(
          clearingMovement - expectedClearingMovement
        ) <= POSITION_EPSILON,
      detail:
        `red=${targetState.isRed} / ` +
        `transition=${transitionMovement.toFixed(6)}/` +
        `${expectedTransitionMovement.toFixed(6)} / ` +
        `clearing=${clearingMovement.toFixed(6)}/` +
        `${expectedClearingMovement.toFixed(6)} / ` +
        `state=${activeTransition.agentState}->${clearingTransition.agentState}`
    });
  } finally {
    system.dispose();
    spawn.dispose(false, false);
  }
};

const createTarget = (
  id: string,
  aimPosition: Vector3
): V2HumanTargetSnapshot =>
  Object.freeze({
    id,
    kind: "npc" as const,
    footPosition: aimPosition.add(new Vector3(0, -0.2, 0)),
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: new Vector3(0.1, 0.2, 0.1)
    }),
    state: "normal" as const,
    alive: true,
    brainwashed: false
  });

const update = (
  system: V2BitSystem,
  deltaSeconds: number,
  elapsedSeconds: number,
  targets: readonly V2HumanTargetSnapshot[],
  externalAlerts: readonly V2ExternalAlert[] = EMPTY_ALERTS
) => {
  system.update({
    deltaSeconds,
    elapsedSeconds,
    targets,
    externalAlerts
  });
};

const acquireMode = (
  harness: CombatHarness,
  modeRoll: number,
  target: V2HumanTargetSnapshot
) => {
  harness.random.enqueue(modeRoll, 0.5);
  update(harness.system, 0, 0, Object.freeze([target]));
  return harness.system.getFrameView().targetStates[0];
};

const acquireInternalAlert = (
  harness: CombatHarness,
  target: V2HumanTargetSnapshot,
  expectedReceiverCount: number
) => {
  harness.random.enqueue(
    0.85,
    ...Array.from(
      { length: 7 + expectedReceiverCount },
      () => 0.5
    )
  );
  update(harness.system, 0, 0, Object.freeze([target]));
  return harness.system.getFrameView().targetStates[0];
};

const getLeaderState = (system: V2BitSystem) =>
  system
    .getFrameView().targetStates
    .find((state) => state.mode === "carpet-leader") ?? null;

const getBitForward = (
  harness: CombatHarness,
  bitId: string
) => {
  const root = harness.scene.getTransformNodeByName(bitId);
  if (!root) {
    return null;
  }
  root.computeWorldMatrix(true);
  return root.getDirection(Vector3.Forward()).normalize();
};

const runRouteCandidateLowerBoundPruningCheck =
  (): BitCombatIntegrationCheck => {
    const tieFixture = createRouteCandidateNavigationFixture(false);
    const tieHarness = createHarness(
      1,
      () => false,
      false,
      false,
      () => false,
      tieFixture.navigation
    );
    let tieOk = false;
    let tieDetail = "";
    try {
      const initialActor =
        tieHarness.system.getFrameView().actorSpheres[0];
      const target = createTarget(
        "route-candidate-tie-target",
        initialActor.center.clone()
      );
      const targets = Object.freeze([target]);
      tieHarness.random.enqueue(0.1, 0.5);
      update(tieHarness.system, 0, 0, targets);
      tieFixture.resetMeasurements();
      update(tieHarness.system, 0, 0, targets);
      const counts = tieFixture.getFindRouteCounts();
      const preparedRoutes = tieFixture.getPreparedRoutes();
      const expectedFirstRoute = tieFixture.getExpectedFirstRoute();
      tieOk =
        counts.first === 1 &&
        counts.tied === 0 &&
        counts.better === 0 &&
        expectedFirstRoute !== null &&
        preparedRoutes.length === 1 &&
        preparedRoutes[0] === expectedFirstRoute;
      tieDetail =
        `calls=${counts.first}/${counts.tied}/${counts.better} / ` +
        `prepared=${preparedRoutes.length} / ` +
        `firstIdentity=${preparedRoutes[0] === expectedFirstRoute}`;
    } finally {
      tieHarness.dispose();
    }

    const betterFixture =
      createRouteCandidateNavigationFixture(true);
    const betterHarness = createHarness(
      1,
      () => false,
      false,
      false,
      () => false,
      betterFixture.navigation
    );
    let betterOk = false;
    let betterDetail = "";
    try {
      const initialActor =
        betterHarness.system.getFrameView().actorSpheres[0];
      const target = createTarget(
        "route-candidate-better-target",
        initialActor.center.clone()
      );
      const targets = Object.freeze([target]);
      betterHarness.random.enqueue(0.1, 0.5);
      update(betterHarness.system, 0, 0, targets);
      betterFixture.resetMeasurements();
      update(betterHarness.system, 0, 0, targets);
      const counts = betterFixture.getFindRouteCounts();
      const preparedRoutes = betterFixture.getPreparedRoutes();
      const expectedBetterRoute =
        betterFixture.getExpectedBetterRoute();
      betterOk =
        counts.first === 1 &&
        counts.tied === 0 &&
        counts.better === 1 &&
        expectedBetterRoute !== null &&
        preparedRoutes.length === 1 &&
        preparedRoutes[0] === expectedBetterRoute;
      betterDetail =
        `calls=${counts.first}/${counts.tied}/${counts.better} / ` +
        `prepared=${preparedRoutes.length} / ` +
        `betterIdentity=${preparedRoutes[0] === expectedBetterRoute}`;
    } finally {
      betterHarness.dispose();
    }

    return Object.freeze({
      name:
        "経路候補lower boundは同値tieを維持し改善可能候補だけ評価",
      ok: tieOk && betterOk,
      detail: `tie[${tieDetail}] / better[${betterDetail}]`
    });
  };

const runChaseWindowCongestionCostCheck =
  (): BitCombatIntegrationCheck => {
    const baseNavigation = createNavigation();
    const createWindowTransition = (
      id: string,
      x: number
    ): BitFlightTransition =>
      Object.freeze({
        id,
        kind: "aperture" as const,
        from: TEST_BAND_REF,
        to: TEST_BAND_REF,
        bidirectional: true,
        affordances: Object.freeze(["window-access" as const]),
        fromPosition: new Vector3(x, BAND_CENTER_HEIGHT, 0),
        toPosition: new Vector3(x, BAND_CENTER_HEIGHT, 0),
        traversalPoints: Object.freeze([
          new Vector3(x, BAND_CENTER_HEIGHT, 0)
        ]),
        region: null
      });
    const firstWindow = createWindowTransition(
      "chase-window-a",
      0.25
    );
    const secondWindow = createWindowTransition(
      "chase-window-b",
      -0.25
    );
    const createTraversal = (
      transition: BitFlightTransition
    ): BitFlightTransitionTraversal =>
      Object.freeze({
        transition,
        from: TEST_BAND_REF,
        to: TEST_BAND_REF,
        reversed: false
      });
    const firstTraversal = createTraversal(firstWindow);
    const secondTraversal = createTraversal(secondWindow);
    const preparedWindowIds: string[] = [];
    const createWindowRoute = (
      start: BitFlightLocation,
      destination: BitFlightLocation,
      traversal: BitFlightTransitionTraversal,
      policy: BitFlightRoutePolicy
    ): BitFlightRoute | null => {
      if (!policy.canUseTransition(traversal)) {
        return null;
      }
      const distance = Vector3.Distance(
        getBitFlightWorldPosition(start),
        getBitFlightWorldPosition(destination)
      );
      const step = Object.freeze({
        kind: "transition" as const,
        traversal,
        entry: cloneLocation(start),
        exit: cloneLocation(destination),
        points: Object.freeze([
          getBitFlightWorldPosition(start),
          getBitFlightWorldPosition(destination)
        ]),
        distance
      });
      if (!policy.canUseRouteStep(step)) {
        return null;
      }
      return Object.freeze({
        steps: Object.freeze([step]),
        destination: cloneLocation(destination),
        distance,
        totalCost:
          distance + policy.additionalTransitionCost(traversal)
      });
    };
    const findWindowRoute = (
      start: BitFlightLocation,
      destination: BitFlightLocation,
      policy: BitFlightRoutePolicy
    ) => {
      const firstRoute = createWindowRoute(
        start,
        destination,
        firstTraversal,
        policy
      );
      const secondRoute = createWindowRoute(
        start,
        destination,
        secondTraversal,
        policy
      );
      if (!firstRoute) {
        return secondRoute;
      }
      if (!secondRoute) {
        return firstRoute;
      }
      return firstRoute.totalCost <= secondRoute.totalCost
        ? firstRoute
        : secondRoute;
    };
    const navigation = Object.freeze({
      ...baseNavigation,
      transitions: Object.freeze([firstWindow, secondWindow]),
      findRoute: findWindowRoute,
      assertPreparedRoute: (
        _currentLocation: BitFlightLocation,
        route: BitFlightRoute
      ) => {
        const step = route.steps.find(
          (candidate) => candidate.kind === "transition"
        );
        if (step?.kind === "transition") {
          preparedWindowIds.push(step.traversal.transition.id);
        }
      },
      getTransitionsFrom: () =>
        Object.freeze([firstTraversal, secondTraversal])
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      2,
      () => false,
      false,
      false,
      () => false,
      navigation
    );
    try {
      placeHarnessBitsAtSamePosition(harness);
      const origin =
        harness.system.getFrameView().flightStates[0].position;
      const target = createTarget(
        "chase-window-congestion-target",
        origin.add(new Vector3(1, 0, 0))
      );
      harness.random.enqueue(
        ...Array.from({ length: 100 }, () => 0.1)
      );
      update(
        harness.system,
        0,
        0,
        Object.freeze([target])
      );
      update(
        harness.system,
        0,
        0,
        Object.freeze([target])
      );
      update(
        harness.system,
        0.1,
        0.1,
        Object.freeze([target])
      );
      update(
        harness.system,
        0.1,
        0.2,
        Object.freeze([target])
      );
      return Object.freeze({
        name:
          "同一標的CHASEは利用中window-accessへsoft costを付け別窓へ分散",
        ok:
          preparedWindowIds.length === 2 &&
          preparedWindowIds[0] === firstWindow.id &&
          preparedWindowIds[1] === secondWindow.id,
        detail: `prepared=${preparedWindowIds.join("->")}`
      });
    } finally {
      harness.dispose();
    }
  };

const runAlertRequestModeCheck = (): BitCombatIntegrationCheck => {
  const cases = Object.freeze([
    Object.freeze({ label: "chase", roll: 0.1, expected: 0 }),
    Object.freeze({ label: "fixed", roll: 0.5, expected: 0 }),
    Object.freeze({ label: "random", roll: 0.7, expected: 0 }),
    Object.freeze({ label: "alert-send", roll: 0.85, expected: 1 }),
    Object.freeze({ label: "carpet-leader", roll: 0.95, expected: 0 })
  ]);
  const details: string[] = [];
  let ok = true;

  for (const testCase of cases) {
    const harness = createHarness(2);
    try {
      const origin = harness.system.getFrameView().flightStates[0].position;
      const target = createTarget(
        `alert-request-${testCase.label}`,
        origin.add(new Vector3(1, 0, 0))
      );
      const state =
        testCase.label === "alert-send"
          ? acquireInternalAlert(harness, target, 2)
          : acquireMode(harness, testCase.roll, target);
      const requests = harness.system.takeAlertRequests();
      const caseOk =
        state.mode === testCase.label &&
        requests.length === testCase.expected;
      ok = ok && caseOk;
      details.push(
        `${testCase.label}: mode=${state.mode}, requests=${requests.length}/${testCase.expected}`
      );
    } finally {
      harness.dispose();
    }
  }

  return Object.freeze({
    name: "alert requestはalert-sendを選んだビットだけが送信",
    ok,
    detail: details.join(" / ")
  });
};

const runAlertAssemblyCompletionCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(
      3,
      (from) => from.x > -0.5
    );
    try {
      const initialStates = harness.system.getFrameView().flightStates;
      const leaderPosition = initialStates[0].position;
      const target = createTarget(
        "alert-assembly-target",
        leaderPosition.add(new Vector3(0.4, 0, 0))
      );
      const targets = Object.freeze([target]);
      const leader = acquireInternalAlert(harness, target, 3);
      const request = harness.system.takeAlertRequests()[0];
      if (!request) {
        return Object.freeze({
          name: "alert受信数と全receiver到着でleaderが探索へ復帰",
          ok: false,
          detail: "alert-sendからalert requestが生成されませんでした。"
        });
      }
      const alert = Object.freeze({
        ...request,
        remainingSeconds: 15
      });
      update(harness.system, 0, 0, targets, Object.freeze([alert]));
      const receiving = harness.system
        .getFrameView().targetStates
        .filter((state) => state.mode === "alert-receive");

      const assignments = harness.system.getFrameView().actorSpheres.map(
        (actor, index) =>
          Object.freeze({
            id: actor.id,
            centerPosition:
              index === 0
                ? leaderPosition
                : leaderPosition.add(
                    new Vector3(index === 1 ? 0.3 : -0.3, 0, 0)
                  )
          })
      );
      harness.system.placeBits(Object.freeze(assignments));
      update(harness.system, 0.1, 0.1, targets);
      update(harness.system, 0.1, 0.2, targets);

      const completedStates = harness.system.getFrameView().targetStates;
      const completedLeader = completedStates.find(
        (state) => state.bitId === leader.bitId
      );
      const remainingReceivers = completedStates.filter(
        (state) => state.mode === "alert-receive"
      ).length;
      return Object.freeze({
        name: "alert受信数と全receiver到着でleaderが探索へ復帰",
        ok:
          receiving.length === 2 &&
          remainingReceivers === 0 &&
          completedLeader?.mode === "search" &&
          completedLeader.targetId === null,
        detail:
          `receivers=${receiving.length}/2 / ` +
          `remaining=${remainingReceivers} / ` +
          `leader=${completedLeader?.mode ?? "missing"} / ` +
          `target=${completedLeader?.targetId ?? "none"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runAlertTimeoutCheck = (): BitCombatIntegrationCheck => {
  const harness = createHarness(2);
  try {
    const origin = harness.system.getFrameView().flightStates[0].position;
    const target = createTarget(
      "alert-timeout-target",
      origin.add(new Vector3(1, 0, 0))
    );
    const state = acquireInternalAlert(harness, target, 2);
    update(
      harness.system,
      15,
      15,
      Object.freeze([target])
    );
    const timedOut = harness.system.getFrameView().targetStates[0];
    return Object.freeze({
      name: "alert-send leaderは15秒上限で攻撃せず探索へ復帰",
      ok:
        state.mode === "alert-send" &&
        timedOut.mode === "search" &&
        timedOut.targetId === null,
      detail:
        `before=${state.mode} / after=${timedOut.mode} / ` +
        `target=${timedOut.targetId ?? "none"}`
    });
  } finally {
    harness.dispose();
  }
};

const runInternalAlertSpawnAndGlobalSingleCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(5);
    try {
      const initialActors = harness.system.getFrameView().actorSpheres;
      const initialActorIds = new Set(
        initialActors.map((actor) => actor.id)
      );
      const leaderActor = initialActors[0];
      const leaderNode = harness.scene.getTransformNodeByName(
        leaderActor.id
      );
      const initialLeaderForward =
        leaderNode?.getDirection(Vector3.Forward()).clone() ?? null;
      if (initialLeaderForward) {
        initialLeaderForward.y = 0;
        initialLeaderForward.normalize();
      }
      const firstTarget = createTarget(
        "internal-alert-first-target",
        leaderActor.center.add(new Vector3(0.4, 0, 0))
      );
      const leader = acquireInternalAlert(
        harness,
        firstTarget,
        4
      );
      const firstRequests = harness.system.takeAlertRequests();
      const startedActors = harness.system.getFrameView().actorSpheres;
      const startedStates = harness.system.getFrameView().targetStates;
      const spawnedActor = startedActors.find(
        (actor) => !initialActorIds.has(actor.id)
      );
      const spawnedNode = spawnedActor
        ? harness.scene.getTransformNodeByName(spawnedActor.id)
        : null;
      const spawnedForward =
        spawnedNode?.getDirection(Vector3.Forward()).clone() ?? null;
      if (spawnedForward) {
        spawnedForward.y = 0;
        spawnedForward.normalize();
      }
      const receiverCount = startedStates.filter(
        (state) => state.mode === "alert-receive"
      ).length;
      const freeState = startedStates.find(
        (state) =>
          state.mode === "search" && state.targetId === null
      );

      update(
        harness.system,
        0.1,
        0.1,
        Object.freeze([firstTarget])
      );
      const freeFlight = freeState
        ? harness.system
            .getFrameView().flightStates
            .find((state) => state.bitId === freeState.bitId)
        : null;
      const secondTarget = createTarget(
        "internal-alert-second-target",
        (freeFlight?.position ?? leaderActor.center).add(
          new Vector3(0.4, 0, 0)
        )
      );
      harness.random.enqueue(0.85, 0.5);
      update(
        harness.system,
        0.1,
        0.2,
        Object.freeze([firstTarget, secondTarget])
      );
      const afterConcurrentAttempt = freeState
        ? harness.system
            .getFrameView().targetStates
            .find((state) => state.bitId === freeState.bitId)
        : null;
      const concurrentRequests =
        harness.system.takeAlertRequests();
      const orientationMatches =
        initialLeaderForward !== null &&
        spawnedForward !== null &&
        Vector3.Dot(initialLeaderForward, spawnedForward) >=
          1 - POSITION_EPSILON;
      const spawnDistance = spawnedActor
        ? Vector3.Distance(
            leaderActor.center,
            spawnedActor.center
          )
        : Number.POSITIVE_INFINITY;
      return Object.freeze({
        name:
          "内部alertは0.2m内に1体spawnし最大4receiver・同時1件",
        ok:
          leader.mode === "alert-send" &&
          firstRequests.length === 1 &&
          startedActors.length === initialActors.length + 1 &&
          receiverCount === 4 &&
          spawnDistance <= ALERT_SPAWN_RADIUS + POSITION_EPSILON &&
          orientationMatches &&
          afterConcurrentAttempt?.mode !== "alert-send" &&
          afterConcurrentAttempt?.mode !== "alert-receive" &&
          afterConcurrentAttempt?.provenance === "visual" &&
          concurrentRequests.length === 0,
        detail:
          `actors=${initialActors.length}->${startedActors.length} / ` +
          `receivers=${receiverCount}/4 / ` +
          `spawnDistance=${Number.isFinite(spawnDistance) ? spawnDistance.toFixed(6) : "none"}/` +
          `${ALERT_SPAWN_RADIUS.toFixed(1)} / ` +
          `orientation=${orientationMatches} / ` +
          `concurrent=${afterConcurrentAttempt?.mode ?? "missing"} / ` +
          `requests=${concurrentRequests.length}`
      });
    } finally {
      harness.dispose();
    }
  };

const runInternalAlertSpawnFailureFallbackCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(
      5,
      () => false,
      false,
      true
    );
    try {
      const initialActors = harness.system.getFrameView().actorSpheres;
      const leaderPosition = initialActors[0].center;
      const target = createTarget(
        "internal-alert-spawn-failure-target",
        leaderPosition.add(new Vector3(0.4, 0, 0))
      );
      harness.random.enqueue(
        0.85,
        ...Array.from({ length: 21 }, () => 0.5)
      );
      update(
        harness.system,
        0,
        0,
        Object.freeze([target])
      );
      const afterActors = harness.system.getFrameView().actorSpheres;
      const afterStates = harness.system.getFrameView().targetStates;
      const leader = afterStates[0];
      const receiverCount = afterStates.filter(
        (state) => state.mode === "alert-receive"
      ).length;
      const requests = harness.system.takeAlertRequests();
      return Object.freeze({
        name:
          "内部alertの安全spawn失敗時は既存近傍4体へfallback",
        ok:
          leader.mode === "alert-send" &&
          afterActors.length === initialActors.length &&
          receiverCount === 4 &&
          requests.length === 1,
        detail:
          `actors=${initialActors.length}->${afterActors.length} / ` +
          `receivers=${receiverCount}/4 / ` +
          `leader=${leader.mode} / requests=${requests.length}`
      });
    } finally {
      harness.dispose();
    }
  };

const runInternalAlertRangeCancellationCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(2);
    try {
      const origin = harness.system.getFrameView().flightStates[0].position;
      const target = createTarget(
        "internal-alert-range-target",
        origin.add(new Vector3(1, 0, 0))
      );
      const leader = acquireInternalAlert(harness, target, 2);
      const participantIds = harness.system
        .getFrameView().targetStates
        .filter(
          (state) =>
            state.mode === "alert-send" ||
            state.mode === "alert-receive"
        )
        .map((state) => state.bitId);
      const movedTarget = createTarget(
        target.id,
        origin.add(new Vector3(4.1, 0, 0))
      );
      update(
        harness.system,
        0,
        0,
        Object.freeze([movedTarget])
      );
      const cancelledStates = harness.system
        .getFrameView().targetStates
        .filter((state) => participantIds.includes(state.bitId));
      const allCancelled = cancelledStates.every(
        (state) =>
          state.mode === "search" &&
          state.targetId === null &&
          Math.abs(
            state.attackCooldownSeconds -
              V2_BIT_ATTACK_COOLDOWN_SECONDS
          ) <= POSITION_EPSILON
      );
      return Object.freeze({
        name:
          "内部alertはleader視認距離1.5倍超で全alert役をCD付き探索へ戻す",
        ok:
          leader.mode === "alert-send" &&
          participantIds.length === 3 &&
          cancelledStates.length === participantIds.length &&
          allCancelled,
        detail:
          `participants=${participantIds.length} / ` +
          `cancelled=${cancelledStates.length} / ` +
          `states=${cancelledStates
            .map(
              (state) =>
                `${state.mode}:${state.attackCooldownSeconds.toFixed(2)}`
            )
            .join(",")}`
      });
    } finally {
      harness.dispose();
    }
  };

const runAlertReceiveSurfaceSpeedCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(1, () => true);
    try {
      const origin = harness.system.getFrameView().flightStates[0].position;
      const leader = createTarget(
        "external-alert-speed-leader",
        origin.add(new Vector3(1, 0, 0))
      );
      const target = createTarget(
        "external-alert-speed-target",
        origin.add(new Vector3(2, 0, 0))
      );
      const targets = Object.freeze([leader, target]);
      const alert = Object.freeze({
        leaderId: leader.id,
        targetId: target.id,
        remainingSeconds: 10
      });
      update(
        harness.system,
        0,
        0,
        targets,
        Object.freeze([alert])
      );
      const beforeState = harness.system.getFrameView().targetStates[0];
      const beforeFlight = harness.system.getFrameView().flightStates[0];
      update(
        harness.system,
        0.1,
        0.1,
        targets,
        Object.freeze([alert])
      );
      const afterState = harness.system.getFrameView().targetStates[0];
      const afterFlight = harness.system.getFrameView().flightStates[0];
      const movement = Math.hypot(
        afterFlight.position.x - beforeFlight.position.x,
        afterFlight.position.z - beforeFlight.position.z
      );
      const expectedMovement = BASE_SEARCH_SPEED * 5 * 0.1;
      return Object.freeze({
        name:
          "alert-receiveのsurface移動は各profileのsearchSpeedの5倍",
        ok:
          beforeState.mode === "alert-receive" &&
          afterState.mode === "alert-receive" &&
          afterFlight.agentState === "surface" &&
          Math.abs(movement - expectedMovement) <=
            POSITION_EPSILON,
        detail:
          `mode=${beforeState.mode}->${afterState.mode} / ` +
          `state=${afterFlight.agentState} / ` +
          `movement=${movement.toFixed(6)}/${expectedMovement.toFixed(6)}`
      });
    } finally {
      harness.dispose();
    }
  };

const runChaseSurfaceSpeedAndRangeCheck =
  (): BitCombatIntegrationCheck => {
    const measureMovement = (
      distance: number
    ): Readonly<{
      mode: V2BitMode;
      movement: number;
    }> => {
      const harness = createHarness(1);
      try {
        const origin = harness.system.getFrameView().flightStates[0].position;
        const target = createTarget(
          `chase-speed-${distance}`,
          origin.add(new Vector3(distance, 0, 0))
        );
        acquireMode(harness, 0.1, target);
        const before = harness.system.getFrameView().flightStates[0].position;
        update(
          harness.system,
          0.4,
          0.4,
          Object.freeze([target])
        );
        const after = harness.system.getFrameView().flightStates[0].position;
        return Object.freeze({
          mode: harness.system.getFrameView().targetStates[0].mode,
          movement: Math.hypot(
            after.x - before.x,
            after.z - before.z
          )
        });
      } finally {
        harness.dispose();
      }
    };

    const outsideFireRange = measureMovement(2);
    const insideFireRange = measureMovement(1);
    const cutoffHarness = createHarness(1);
    try {
      const origin =
        cutoffHarness.system.getFrameView().flightStates[0].position;
      const target = createTarget(
        "chase-range-cutoff",
        origin.add(new Vector3(2.5, 0, 0))
      );
      const acquired = acquireMode(cutoffHarness, 0.1, target);
      const movedTarget = createTarget(
        target.id,
        origin.add(
          new Vector3(
            TARGET_LOST_MAXIMUM_DISTANCE + 0.01,
            0,
            0
          )
        )
      );
      update(
        cutoffHarness.system,
        0,
        0,
        Object.freeze([movedTarget])
      );
      const abandoned = cutoffHarness.system.getFrameView().targetStates[0];
      const fovHarness = createHarness(1);
      const fovOrigin =
        fovHarness.system.getFrameView().flightStates[0].position;
      const initiallyVisible = createTarget(
        "chase-fov-lock",
        fovOrigin.add(new Vector3(1, 0, 0))
      );
      const fovAcquired = acquireMode(
        fovHarness,
        0.1,
        initiallyVisible
      );
      update(
        fovHarness.system,
        0,
        0,
        Object.freeze([
          createTarget(
            initiallyVisible.id,
            fovOrigin.add(new Vector3(-1, 0, 0))
          )
        ])
      );
      const retainedOutsideFov =
        fovHarness.system.getFrameView().targetStates[0];
      const expectedOutsideMovement = BASE_SEARCH_SPEED * 0.4;
      const expectedInsideMovement = BASE_CHASE_SPEED * 0.4;
      try {
        return Object.freeze({
          name:
            "combat chaseは1.2外／内の速度を分け、FOV外保持・視認距離+0.5で解除",
          ok:
            outsideFireRange.mode === "chase" &&
            insideFireRange.mode === "chase" &&
            Math.abs(
              outsideFireRange.movement -
                expectedOutsideMovement
            ) <= POSITION_EPSILON &&
            Math.abs(
              insideFireRange.movement -
                expectedInsideMovement
            ) <= POSITION_EPSILON &&
            fovAcquired.mode === "chase" &&
            retainedOutsideFov.mode === "chase" &&
            retainedOutsideFov.targetId === initiallyVisible.id &&
            acquired.mode === "chase" &&
            abandoned.mode === "search" &&
            abandoned.targetId === null &&
            Math.abs(
              abandoned.attackCooldownSeconds -
                V2_BIT_ATTACK_COOLDOWN_SECONDS
            ) <= POSITION_EPSILON,
          detail:
            `outside(${FIRE_RANGE})=${outsideFireRange.movement.toFixed(6)}/` +
            `${expectedOutsideMovement.toFixed(6)} / ` +
            `inside=${insideFireRange.movement.toFixed(6)}/` +
            `${expectedInsideMovement.toFixed(6)} / ` +
            `fov=${fovAcquired.mode}->${retainedOutsideFov.mode} / ` +
            `cutoff=${TARGET_LOST_MAXIMUM_DISTANCE.toFixed(2)}:` +
            `${acquired.mode}->${abandoned.mode}:` +
            `${abandoned.attackCooldownSeconds.toFixed(2)}s`
        });
      } finally {
        fovHarness.dispose();
      }
    } finally {
      cutoffHarness.dispose();
    }
  };

const runAttackCooldownCheck = (): BitCombatIntegrationCheck => {
  const harness = createHarness();
  try {
    const origin = harness.system.getFrameView().flightStates[0].position;
    const target = createTarget(
      "attack-cooldown-target",
      origin.add(new Vector3(1, 0, 0))
    );
    const targets = Object.freeze([target]);
    const acquired = acquireMode(harness, 0.5, target);
    update(harness.system, 10, 10, targets);
    const started = harness.system.getFrameView().targetStates[0];
    harness.random.enqueue(0.5, 0.5);
    update(harness.system, 1, 11, targets);
    const during = harness.system.getFrameView().targetStates[0];
    return Object.freeze({
      name: "攻撃CD中は再捕捉せずモード時間も進行しない",
      ok:
        acquired.mode === "fixed" &&
        started.mode === "search" &&
        started.targetId === null &&
        Math.abs(
          started.attackCooldownSeconds -
            V2_BIT_ATTACK_COOLDOWN_SECONDS
        ) <= POSITION_EPSILON &&
        during.mode === "search" &&
        during.targetId === null &&
        during.modeTimerSeconds === 0 &&
        Math.abs(
          during.attackCooldownSeconds -
            (V2_BIT_ATTACK_COOLDOWN_SECONDS - 1)
        ) <= POSITION_EPSILON,
      detail:
        `acquired=${acquired.mode} / ` +
        `start=${started.mode}:${started.attackCooldownSeconds.toFixed(2)}s / ` +
        `during=${during.mode}:${during.attackCooldownSeconds.toFixed(2)}s / ` +
        `target=${during.targetId ?? "none"} / ` +
        `modeTimer=${during.modeTimerSeconds.toFixed(2)}s`
    });
  } finally {
    harness.dispose();
  }
};

const runRandomAttackSpeedCheck = (): BitCombatIntegrationCheck => {
  const harness = createHarness();
  try {
    const before = harness.system.getFrameView().flightStates[0].position;
    const target = createTarget(
      "random-speed-target",
      before.add(new Vector3(1, 0, 0))
    );
    const state = acquireMode(harness, 0.7, target);
    update(
      harness.system,
      0.5,
      0.5,
      Object.freeze([target])
    );
    const after = harness.system.getFrameView().flightStates[0].position;
    const horizontalDistance = Math.hypot(
      after.x - before.x,
      after.z - before.z
    );
    const expectedDistance = RANDOM_ATTACK_SPEED * 0.5;
    const afterState = harness.system.getFrameView().targetStates[0];
    return Object.freeze({
      name: "random攻撃移動はrandomAttackSpeedを使用",
      ok:
        state.mode === "random" &&
        afterState.mode === "random" &&
        Math.abs(
          afterState.modeTimerSeconds -
            (V2_BIT_RANDOM_DURATION_SECONDS - 0.5)
        ) <= POSITION_EPSILON &&
        Math.abs(horizontalDistance - expectedDistance) <=
          POSITION_EPSILON,
      detail:
        `mode=${afterState.mode} / ` +
        `distance=${horizontalDistance.toFixed(6)}/` +
        `${expectedDistance.toFixed(6)} / ` +
        `timer=${afterState.modeTimerSeconds.toFixed(2)}s`
    });
  } finally {
    harness.dispose();
  }
};

const createCarpetHarness = (scatterRoll = 0.5) => {
  const movementSweeps: {
    from: Vector3;
    to: Vector3;
  }[] = [];
  let movementBlocked = false;
  const harness = createHarness(
    1,
    () => false,
    false,
    false,
    (from, to) => {
      movementSweeps.push({
        from: from.clone(),
        to: to.clone()
      });
      return (
        movementBlocked &&
        Math.hypot(to.x - from.x, to.z - from.z) >
          POSITION_EPSILON &&
        Math.abs(to.y - from.y) > POSITION_EPSILON
      );
    }
  );
  const origin = harness.system.getFrameView().flightStates[0].position;
  const target = createTarget(
    "carpet-integration-target",
    origin.add(new Vector3(2, 0, 0))
  );
  harness.random.enqueue(0.95, 0.5, 0.5, scatterRoll);
  update(harness.system, 0, 0, Object.freeze([target]));
  update(harness.system, 0, 0, Object.freeze([target]));
  const state = harness.system.getFrameView().targetStates[0];
  movementSweeps.length = 0;
  return Object.freeze({
    harness,
    target,
    state,
    movementSweeps,
    setMovementBlocked: (blocked: boolean) => {
      movementBlocked = blocked;
    }
  });
};

const runCarpetThreeDimensionalSweepAndAimCheck =
  (): BitCombatIntegrationCheck => {
    const {
      harness,
      target,
      state,
      movementSweeps
    } = createCarpetHarness();
    try {
      const beforeFlights = harness.system.getFrameView().flightStates;
      const beforeById = new Map(
        beforeFlights.map((flight) => [flight.bitId, flight] as const)
      );
      const leaderBefore = beforeById.get(state.bitId) ?? null;
      const initialLeaderAim = getBitForward(harness, state.bitId);

      update(
        harness.system,
        0.5,
        0.5,
        Object.freeze([target])
      );

      const afterFlights = harness.system.getFrameView().flightStates;
      const afterTargets = harness.system.getFrameView().targetStates;
      const afterById = new Map(
        afterFlights.map((flight) => [flight.bitId, flight] as const)
      );
      const leaderAfter = afterById.get(state.bitId) ?? null;
      const expectedTargetHeight = Math.min(
        TEST_BAND.maximumCenterHeight,
        Math.max(
          TEST_BAND.minimumCenterHeight,
          target.aimPosition.y + CARPET_TARGET_HEIGHT_OFFSET
        )
      );
      const expectedHeight =
        leaderBefore === null
          ? Number.NaN
          : Math.min(
              expectedTargetHeight,
              leaderBefore.position.y + CARPET_HEIGHT_SPEED * 0.5
            );
      const heightMatches =
        afterFlights.length === 3 &&
        afterFlights.every(
          (flight) =>
            Math.abs(flight.position.y - expectedHeight) <=
              POSITION_EPSILON &&
            Math.abs(
              (flight.safeCenterHeight ?? Number.NaN) -
                expectedHeight
            ) <= POSITION_EPSILON
        );
      const hasNoBob =
        afterFlights.length === 3 &&
        Math.max(...afterFlights.map((flight) => flight.position.y)) -
          Math.min(...afterFlights.map((flight) => flight.position.y)) <=
          POSITION_EPSILON;
      const sweptInThreeDimensions =
        movementSweeps.filter((sweep) => {
          const horizontalDistance = Math.hypot(
            sweep.to.x - sweep.from.x,
            sweep.to.z - sweep.from.z
          );
          return (
            horizontalDistance > POSITION_EPSILON &&
            Math.abs(sweep.to.y - sweep.from.y) > POSITION_EPSILON
          );
        }).length >= 3;

      const movementDirection =
        leaderBefore && leaderAfter
          ? new Vector3(
              leaderAfter.position.x - leaderBefore.position.x,
              0,
              leaderAfter.position.z - leaderBefore.position.z
            ).normalize()
          : null;
      const carpetAim =
        movementDirection === null
          ? null
          : Vector3.Lerp(
              new Vector3(0, -1, 0),
              new Vector3(
                movementDirection.x,
                -1,
                movementDirection.z
              ).normalize(),
              CARPET_AIM_BLEND
            ).normalize();
      const expectedLeaderAim =
        initialLeaderAim && carpetAim
          ? Vector3.Lerp(
              initialLeaderAim,
              carpetAim,
              0.5
            ).normalize()
          : null;
      const actualLeaderAim = getBitForward(harness, state.bitId);
      const leaderAimMatches =
        expectedLeaderAim !== null &&
        actualLeaderAim !== null &&
        Vector3.Dot(expectedLeaderAim, actualLeaderAim) >=
          1 - POSITION_EPSILON;
      const followerIds = afterTargets
        .filter((candidate) => candidate.mode === "carpet-follower")
        .map((candidate) => candidate.bitId);
      const followerAimMatches =
        carpetAim !== null &&
        followerIds.length === 2 &&
        followerIds.every((id) => {
          const forward = getBitForward(harness, id);
          return (
            forward !== null &&
            Vector3.Dot(carpetAim, forward) >= 1 - POSITION_EPSILON
          );
        });
      const followerFlights = followerIds
        .map((id) => afterById.get(id) ?? null)
        .filter((flight) => flight !== null);
      const formationMatches =
        leaderAfter !== null &&
        followerFlights.length === 2 &&
        followerFlights.every(
          (flight) =>
            Math.abs(
              Vector3.Distance(
                leaderAfter.position,
                flight.position
              ) - 0.25
            ) <= POSITION_EPSILON
        ) &&
        Math.abs(
          Vector3.Distance(
            followerFlights[0].position,
            followerFlights[1].position
          ) - 0.5
        ) <= POSITION_EPSILON;

      return Object.freeze({
        name: "carpet全3機は3D sweepで高度追従しleaderだけ1秒aim遷移",
        ok:
          state.mode === "carpet-leader" &&
          heightMatches &&
          hasNoBob &&
          sweptInThreeDimensions &&
          formationMatches &&
          leaderAimMatches &&
          followerAimMatches,
        detail:
          `height=${afterFlights
            .map((flight) => flight.position.y.toFixed(3))
            .join(",")}/${expectedHeight.toFixed(3)} / ` +
          `3dSweeps=${movementSweeps.length} / ` +
          `formation=${formationMatches} / ` +
          `aim=${leaderAimMatches}/${followerAimMatches}`
      });
    } finally {
      harness.dispose();
    }
  };

const runCarpetScatterSteeringCheck =
  (): BitCombatIntegrationCheck => {
    const scatterRoll = 1 - POSITION_EPSILON;
    const { harness, target, state } =
      createCarpetHarness(scatterRoll);
    try {
      const before = harness.system
        .getFrameView().flightStates
        .find((flight) => flight.bitId === state.bitId) ?? null;
      const deltaSeconds = 0.05;
      update(
        harness.system,
        deltaSeconds,
        deltaSeconds,
        Object.freeze([target])
      );
      const after = harness.system
        .getFrameView().flightStates
        .find((flight) => flight.bitId === state.bitId) ?? null;
      const actualAngle =
        before && after
          ? Math.atan2(
              after.position.z - before.position.z,
              after.position.x - before.position.x
            )
          : Number.NaN;
      const scatterAngle =
        (scatterRoll - 0.5) * CARPET_SCATTER_RADIANS;
      const turnStep = Math.min(
        scatterAngle,
        CARPET_TURN_RATE * deltaSeconds
      );
      const currentDirection = new Vector3(
        Math.cos(scatterAngle),
        0,
        Math.sin(scatterAngle)
      );
      const turnedDirection = new Vector3(
        Math.cos(scatterAngle - turnStep),
        0,
        Math.sin(scatterAngle - turnStep)
      );
      const expectedDirection = Vector3.Lerp(
        currentDirection,
        turnedDirection,
        CARPET_STEER_STRENGTH
      ).normalize();
      const expectedAngle = Math.atan2(
        expectedDirection.z,
        expectedDirection.x
      );

      return Object.freeze({
        name: "carpet開始scatterと旋回は0.35rad・π×0.35・strength0.18",
        ok:
          state.mode === "carpet-leader" &&
          Number.isFinite(actualAngle) &&
          Math.abs(actualAngle - expectedAngle) <= POSITION_EPSILON &&
          actualAngle > 0 &&
          actualAngle < scatterAngle,
        detail:
          `angle=${actualAngle.toFixed(6)}/` +
          `${expectedAngle.toFixed(6)}rad / ` +
          `scatter=${scatterAngle.toFixed(6)}rad`
      });
    } finally {
      harness.dispose();
    }
  };

const runCarpetBeamDirectionLockCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness();
    try {
      const origin = harness.system.getFrameView().flightStates[0].position;
      const target = createTarget(
        "carpet-direction-lock-target",
        origin.add(new Vector3(2, 0, 0))
      );
      harness.random.enqueue(
        0.95,
        0.5,
        0,
        0.5,
        0.5,
        0.5,
        0.5,
        0.5,
        0,
        0.5,
        0.5,
        0.5,
        0.5,
        0
      );
      update(harness.system, 0, 0, Object.freeze([target]));
      update(harness.system, 0, 0, Object.freeze([target]));
      const targetStates = harness.system.getFrameView().targetStates;
      const lockedDirections = new Map<string, Vector3>();
      for (const bit of targetStates) {
        const forward = getBitForward(harness, bit.bitId);
        if (forward) {
          lockedDirections.set(bit.bitId, forward);
        }
      }

      update(
        harness.system,
        V2_BIT_FIRE_TELEGRAPH_SECONDS,
        V2_BIT_FIRE_TELEGRAPH_SECONDS,
        Object.freeze([target])
      );
      const requests = harness.system.getFrameView().beamRequests;
      const allDirectionsLocked =
        requests.length === 3 &&
        requests.every((request) => {
          const lockedDirection =
            lockedDirections.get(request.sourceId) ?? null;
          return (
            lockedDirection !== null &&
            Vector3.Dot(request.direction, lockedDirection) >=
              1 - POSITION_EPSILON
          );
        });
      const directions = [...lockedDirections.values()];
      const usesIndividualDirections =
        directions.length === 3 &&
        directions.some((direction, index) =>
          directions.some(
            (candidate, candidateIndex) =>
              index !== candidateIndex &&
              Vector3.Dot(direction, candidate) < 0.99
          )
        );

      return Object.freeze({
        name: "carpet beamはleader/follower個別aimをtelegraph開始時にlock",
        ok:
          targetStates.length === 3 &&
          allDirectionsLocked &&
          usesIndividualDirections,
        detail:
          `bits=${targetStates.length} / beams=${requests.length} / ` +
          `locked=${allDirectionsLocked} / ` +
          `individual=${usesIndividualDirections}`
      });
    } finally {
      harness.dispose();
    }
  };

const runCarpetFormationFadeCheck =
  (): BitCombatIntegrationCheck => {
    const { harness, target, state } = createCarpetHarness();
    try {
      const followers = harness.system
        .getFrameView().targetStates
        .filter((candidate) => candidate.mode === "carpet-follower");
      const accepted = harness.system.notifyBeamImpact(
        state.bitId,
        target.id
      );
      const followerBodies = followers
        .map((follower) =>
          harness.scene.getMeshByName(`${follower.bitId}_body`)
        )
        .filter((body) => body !== null);
      const immediateCounts = [
        harness.system.getFrameView().targetStates.length,
        harness.system.getFrameView().flightStates.length,
        harness.system.getFrameView().actorSpheres.length
      ];
      const visibleImmediately =
        followerBodies.length === 2 &&
        followerBodies.every(
          (body) =>
            !body.isDisposed() &&
            Math.abs(body.visibility - 1) <= POSITION_EPSILON
        );

      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        Object.freeze([target])
      );
      const halfVisible = followerBodies.every(
        (body) =>
          !body.isDisposed() &&
          Math.abs(body.visibility - 0.5) <= POSITION_EPSILON
      );
      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        CARPET_FOLLOWER_FADE_SECONDS,
        Object.freeze([target])
      );
      const disposedAfterFade = followerBodies.every((body) =>
        body.isDisposed()
      );

      return Object.freeze({
        name: "carpet編隊終了時は公開3系統から即除外し表示だけ1秒fade",
        ok:
          followers.length === 2 &&
          accepted &&
          immediateCounts.every((count) => count === 1) &&
          visibleImmediately &&
          halfVisible &&
          disposedAfterFade,
        detail:
          `followers=${followers.length} / ` +
          `counts=${immediateCounts.join(",")} / ` +
          `visible=${visibleImmediately}/${halfVisible}/` +
          `${disposedAfterFade}`
      });
    } finally {
      harness.dispose();
    }
  };

const runCarpetObstacleAbortCooldownCheck =
  (): BitCombatIntegrationCheck => {
    const {
      harness,
      target,
      state,
      setMovementBlocked
    } = createCarpetHarness();
    try {
      setMovementBlocked(true);
      update(
        harness.system,
        0.1,
        0.1,
        Object.freeze([target])
      );
      const afterAbort = harness.system
        .getFrameView().targetStates
        .find((candidate) => candidate.bitId === state.bitId) ?? null;
      const logicalCountsAfterAbort = [
        harness.system.getFrameView().targetStates.length,
        harness.system.getFrameView().flightStates.length,
        harness.system.getFrameView().actorSpheres.length
      ];

      setMovementBlocked(false);
      harness.random.enqueue(0.95, 0.5);
      update(
        harness.system,
        0.1,
        0.2,
        Object.freeze([target])
      );
      const afterRetry = harness.system
        .getFrameView().targetStates
        .find((candidate) => candidate.bitId === state.bitId) ?? null;

      return Object.freeze({
        name: "carpet障害物中断はsearch・2.5秒CDとなりCD中再抽選はchase",
        ok:
          afterAbort?.mode === "search" &&
          afterAbort.attackCooldownSeconds === 0 &&
          Math.abs(
            afterAbort.carpetCooldownSeconds - 2.5
          ) <= POSITION_EPSILON &&
          logicalCountsAfterAbort.every((count) => count === 1) &&
          afterRetry?.mode === "chase" &&
          Math.abs(
            afterRetry.carpetCooldownSeconds - 2.4
          ) <= POSITION_EPSILON,
        detail:
          `abort=${afterAbort?.mode ?? "missing"} / ` +
          `attackCD=${afterAbort?.attackCooldownSeconds.toFixed(2) ?? "n/a"} / ` +
          `carpetCD=${afterAbort?.carpetCooldownSeconds.toFixed(2) ?? "n/a"} / ` +
          `counts=${logicalCountsAfterAbort.join(",")} / ` +
          `retry=${afterRetry?.mode ?? "missing"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runCarpetFirstFireCheck = (): BitCombatIntegrationCheck => {
  const { harness, target, state } = createCarpetHarness();
  try {
    const followerIds = new Set(
      harness.system
        .getFrameView().targetStates
        .filter((candidate) => candidate.mode === "carpet-follower")
        .map((candidate) => candidate.bitId)
    );
    const firstFireSeconds = new Map<string, number>();
    const maximumFirstFireSeconds =
      V2_BIT_CARPET_FIRE_INTERVAL_SECONDS +
      V2_BIT_FIRE_TELEGRAPH_SECONDS +
      TICK_SECONDS;
    let elapsedSeconds = 0;
    while (
      elapsedSeconds <= maximumFirstFireSeconds + TICK_SECONDS &&
      firstFireSeconds.size < followerIds.size
    ) {
      elapsedSeconds += TICK_SECONDS;
      update(
        harness.system,
        TICK_SECONDS,
        elapsedSeconds,
        Object.freeze([target])
      );
      for (const request of harness.system.getFrameView().beamRequests) {
        if (
          followerIds.has(request.sourceId) &&
          !firstFireSeconds.has(request.sourceId)
        ) {
          firstFireSeconds.set(request.sourceId, elapsedSeconds);
        }
      }
    }
    const latestFirstFire = Math.max(
      0,
      ...firstFireSeconds.values()
    );
    return Object.freeze({
      name: "carpet follower初弾位相は0..0.25秒",
      ok:
        state.mode === "carpet-leader" &&
        followerIds.size === 2 &&
        firstFireSeconds.size === followerIds.size &&
        latestFirstFire <= maximumFirstFireSeconds,
      detail:
        `followers=${followerIds.size} / fired=${firstFireSeconds.size} / ` +
        `first=${[...firstFireSeconds.values()]
          .map((value) => value.toFixed(2))
          .join(",") || "none"}s / ` +
        `beamDeadline=${maximumFirstFireSeconds.toFixed(2)}s`
    });
  } finally {
    harness.dispose();
  }
};

const runCarpetPassCheck = (): BitCombatIntegrationCheck => {
  const { harness, target, state } = createCarpetHarness();
  try {
    const leaderId = state.bitId;
    let elapsedSeconds = 0;
    let passedAt: number | null = null;
    let releasedAt: number | null = null;
    let retainedUntilThreeSeconds = true;
    while (elapsedSeconds < 9 && releasedAt === null) {
      elapsedSeconds += 0.05;
      update(
        harness.system,
        0.05,
        elapsedSeconds,
        Object.freeze([target])
      );
      const leaderFlight = harness.system
        .getFrameView().flightStates
        .find((candidate) => candidate.bitId === leaderId);
      const leaderTarget = harness.system
        .getFrameView().targetStates
        .find((candidate) => candidate.bitId === leaderId);
      if (
        passedAt === null &&
        leaderFlight &&
        leaderFlight.position.x > target.aimPosition.x + 0.02
      ) {
        passedAt = elapsedSeconds;
      }
      if (
        passedAt !== null &&
        elapsedSeconds < passedAt + V2_BIT_CARPET_PASS_DURATION_SECONDS &&
        leaderTarget?.mode !== "carpet-leader"
      ) {
        retainedUntilThreeSeconds = false;
      }
      if (
        passedAt !== null &&
        leaderTarget?.mode !== "carpet-leader"
      ) {
        releasedAt = elapsedSeconds;
      }
    }
    const durationAfterPass =
      passedAt === null || releasedAt === null
        ? null
        : releasedAt - passedAt;
    return Object.freeze({
      name: "carpetは対象を通過し後方化から3秒後に解除",
      ok:
        passedAt !== null &&
        releasedAt !== null &&
        retainedUntilThreeSeconds &&
        durationAfterPass !== null &&
        durationAfterPass >=
          V2_BIT_CARPET_PASS_DURATION_SECONDS - 0.05 &&
        durationAfterPass <=
          V2_BIT_CARPET_PASS_DURATION_SECONDS + 0.1,
      detail:
        `passedAt=${passedAt?.toFixed(2) ?? "none"}s / ` +
        `releasedAt=${releasedAt?.toFixed(2) ?? "none"}s / ` +
        `afterPass=${durationAfterPass?.toFixed(2) ?? "none"}s / ` +
        `retained=${retainedUntilThreeSeconds}`
    });
  } finally {
    harness.dispose();
  }
};

const runCarpetFollowerImpactCheck =
  (): BitCombatIntegrationCheck => {
    const { harness, target, state } = createCarpetHarness();
    try {
      const before = harness.system.getFrameView().targetStates;
      const followers = before.filter(
        (candidate) => candidate.mode === "carpet-follower"
      );
      const follower = followers[0];
      const accepted = follower
        ? harness.system.notifyBeamImpact(follower.bitId, target.id)
        : false;
      const followerBody = follower
        ? harness.scene.getMeshByName(`${follower.bitId}_body`)
        : null;
      const after = harness.system.getFrameView().targetStates;
      const leader = after.find(
        (candidate) => candidate.bitId === state.bitId
      );
      const remainingFollowers = after.filter(
        (candidate) => candidate.mode === "carpet-follower"
      );
      const visibleImmediately =
        followerBody !== null &&
        !followerBody.isDisposed() &&
        Math.abs(followerBody.visibility - 1) <= POSITION_EPSILON;
      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        Object.freeze([target])
      );
      const halfVisible =
        followerBody !== null &&
        !followerBody.isDisposed() &&
        Math.abs(followerBody.visibility - 0.5) <= POSITION_EPSILON;
      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        CARPET_FOLLOWER_FADE_SECONDS,
        Object.freeze([target])
      );
      const disposedAfterFade =
        followerBody !== null && followerBody.isDisposed();
      return Object.freeze({
        name: "carpet follower被弾は論理即除外・表示1秒fadeでleaderは継続",
        ok:
          followers.length === 2 &&
          accepted &&
          after.length === before.length - 1 &&
          remainingFollowers.length === 1 &&
          leader?.mode === "carpet-leader" &&
          visibleImmediately &&
          halfVisible &&
          disposedAfterFade,
        detail:
          `before=${before.length} / after=${after.length} / ` +
          `followers=${followers.length}->${remainingFollowers.length} / ` +
          `leader=${leader?.mode ?? "missing"} / accepted=${accepted} / ` +
          `fade=${visibleImmediately}/${halfVisible}/${disposedAfterFade}`
      });
    } finally {
      harness.dispose();
    }
  };

const runExternalAlertModeEligibilityCheck =
  (): BitCombatIntegrationCheck => {
    const eligibleCases = Object.freeze([
      Object.freeze({ mode: "chase" as const, roll: 0.1 }),
      Object.freeze({ mode: "fixed" as const, roll: 0.5 }),
      Object.freeze({ mode: "random" as const, roll: 0.7 })
    ]);
    const details: string[] = [];
    let eligibleModesOk = true;
    for (const testCase of eligibleCases) {
      const harness = createHarness(1);
      try {
        const origin =
          harness.system.getFrameView().actorSpheres[0].center;
        const visualTarget = createTarget(
          `external-alert-interrupt-${testCase.mode}-visual`,
          origin.add(new Vector3(1, 0, 0))
        );
        const before = acquireMode(
          harness,
          testCase.roll,
          visualTarget
        );
        const alertLeader = createTarget(
          `external-alert-interrupt-${testCase.mode}-leader`,
          origin.add(new Vector3(8, 0, 0))
        );
        const alertTarget = createTarget(
          `external-alert-interrupt-${testCase.mode}-target`,
          origin.add(new Vector3(9, 0, 0))
        );
        update(
          harness.system,
          0,
          0,
          Object.freeze([
            visualTarget,
            alertLeader,
            alertTarget
          ]),
          Object.freeze([
            Object.freeze({
              leaderId: alertLeader.id,
              targetId: alertTarget.id,
              remainingSeconds: 15
            })
          ])
        );
        const after = harness.system.getFrameView().targetStates[0];
        const caseOk =
          before.mode === testCase.mode &&
          after.mode === "alert-receive" &&
          after.targetId === alertTarget.id &&
          after.alertLeaderId === alertLeader.id;
        eligibleModesOk = eligibleModesOk && caseOk;
        details.push(
          `${testCase.mode}:${before.mode}->${after.mode},` +
            `target=${after.targetId ?? "none"}`
        );
      } finally {
        harness.dispose();
      }
    }

    const holdHarness = createHarness(1);
    let holdOk = false;
    try {
      const actor = holdHarness.system.getFrameView().actorSpheres[0];
      const holdTarget = Object.freeze({
        ...createTarget(
          "external-alert-hold-target",
          actor.center.add(new Vector3(1, 0, 0))
        ),
        state: "hit-a" as const
      });
      acquireMode(holdHarness, 0.1, holdTarget);
      const impactAccepted = holdHarness.system.notifyBeamImpact(
        actor.id,
        holdTarget.id
      );
      const alertLeader = createTarget(
        "external-alert-hold-leader",
        actor.center.add(new Vector3(8, 0, 0))
      );
      const alertTarget = createTarget(
        "external-alert-hold-interrupt-target",
        actor.center.add(new Vector3(9, 0, 0))
      );
      update(
        holdHarness.system,
        0,
        0,
        Object.freeze([holdTarget, alertLeader, alertTarget]),
        Object.freeze([
          Object.freeze({
            leaderId: alertLeader.id,
            targetId: alertTarget.id,
            remainingSeconds: 15
          })
        ])
      );
      const after = holdHarness.system.getFrameView().targetStates[0];
      holdOk =
        impactAccepted &&
        after.mode === "hold" &&
        after.targetId === holdTarget.id;
      details.push(
        `hold:${impactAccepted}/${after.mode},` +
          `target=${after.targetId ?? "none"}`
      );
    } finally {
      holdHarness.dispose();
    }

    const carpetHarness = createHarness(1);
    let carpetOk = false;
    try {
      const actor =
        carpetHarness.system.getFrameView().actorSpheres[0];
      const visualTarget = createTarget(
        "external-alert-carpet-visual",
        actor.center.add(new Vector3(1, 0, 0))
      );
      const before = acquireMode(
        carpetHarness,
        0.95,
        visualTarget
      );
      const alertLeader = createTarget(
        "external-alert-carpet-leader",
        actor.center.add(new Vector3(8, 0, 0))
      );
      const alertTarget = createTarget(
        "external-alert-carpet-target",
        actor.center.add(new Vector3(9, 0, 0))
      );
      update(
        carpetHarness.system,
        0,
        0,
        Object.freeze([
          visualTarget,
          alertLeader,
          alertTarget
        ]),
        Object.freeze([
          Object.freeze({
            leaderId: alertLeader.id,
            targetId: alertTarget.id,
            remainingSeconds: 15
          })
        ])
      );
      const after = carpetHarness.system
        .getFrameView().targetStates
        .find((state) => state.bitId === actor.id);
      carpetOk =
        before.mode === "carpet-leader" &&
        after?.mode === "carpet-leader" &&
        after.targetId === visualTarget.id &&
        carpetHarness.system
          .getFrameView().targetStates
          .every((state) => state.mode !== "alert-receive");
      details.push(
        `carpet:${before.mode}->${after?.mode ?? "missing"},` +
          `target=${after?.targetId ?? "none"}`
      );
    } finally {
      carpetHarness.dispose();
    }

    const alertHarness = createHarness(1);
    let activeAlertOk = false;
    try {
      const actor =
        alertHarness.system.getFrameView().actorSpheres[0];
      const firstLeader = createTarget(
        "external-alert-active-first-leader",
        actor.center.add(new Vector3(8, 0, 0))
      );
      const firstTarget = createTarget(
        "external-alert-active-first-target",
        actor.center.add(new Vector3(9, 0, 0))
      );
      update(
        alertHarness.system,
        0,
        0,
        Object.freeze([firstLeader, firstTarget]),
        Object.freeze([
          Object.freeze({
            leaderId: firstLeader.id,
            targetId: firstTarget.id,
            remainingSeconds: 15
          })
        ])
      );
      const before = alertHarness.system.getFrameView().targetStates[0];
      const secondLeader = createTarget(
        "external-alert-active-second-leader",
        actor.center.add(new Vector3(10, 0, 0))
      );
      const secondTarget = createTarget(
        "external-alert-active-second-target",
        actor.center.add(new Vector3(11, 0, 0))
      );
      update(
        alertHarness.system,
        0,
        0,
        Object.freeze([
          firstLeader,
          firstTarget,
          secondLeader,
          secondTarget
        ]),
        Object.freeze([
          Object.freeze({
            leaderId: secondLeader.id,
            targetId: secondTarget.id,
            remainingSeconds: 15
          })
        ])
      );
      const after = alertHarness.system.getFrameView().targetStates[0];
      activeAlertOk =
        before.mode === "alert-receive" &&
        after.mode === "alert-receive" &&
        after.targetId === firstTarget.id &&
        after.alertLeaderId === firstLeader.id;
      details.push(
        `alert:${before.mode}->${after.mode},` +
          `target=${after.targetId ?? "none"}`
      );
    } finally {
      alertHarness.dispose();
    }

    return Object.freeze({
      name:
        "外部Alertはchase・fixed・randomを割り込みhold・carpet・alert-receive中を除外",
      ok: eligibleModesOk && holdOk && carpetOk && activeAlertOk,
      detail: details.join(" / ")
    });
  };

const runAlertChaseRouteBudgetFairnessCheck =
  (): BitCombatIntegrationCheck => {
    const bitCount = 50;
    const routePlanBudget = 4;
    const harness = createHarness(bitCount, () => true);
    try {
      harness.system.setDiagnosticsEnabled(true);
      const target = createTarget(
        "alert-budget-target",
        new Vector3(201, BAND_CENTER_HEIGHT, 0)
      );
      const firstLeader = createTarget(
        "alert-budget-first-leader",
        new Vector3(200, BAND_CENTER_HEIGHT, 0)
      );
      const secondLeader = createTarget(
        "alert-budget-second-leader",
        new Vector3(199, BAND_CENTER_HEIGHT, 0)
      );
      const targets = Object.freeze([
        firstLeader,
        secondLeader,
        target
      ]);
      const expectedReceiverIds = new Set(
        [...harness.system.getFrameView().actorSpheres]
          .sort(
            (left, right) =>
              Vector3.DistanceSquared(
                left.center,
                target.aimPosition
              ) -
              Vector3.DistanceSquared(
                right.center,
                target.aimPosition
              )
          )
          .slice(0, routePlanBudget)
          .map((actor) => actor.id)
      );
      update(
        harness.system,
        0,
        0,
        targets,
        Object.freeze([
          Object.freeze({
            leaderId: firstLeader.id,
            targetId: target.id,
            remainingSeconds: 15
          }),
          Object.freeze({
            leaderId: secondLeader.id,
            targetId: target.id,
            remainingSeconds: 15
          })
        ])
      );
      const receivedStates = harness.system
        .getFrameView().targetStates
        .filter((state) => state.mode === "alert-receive");
      const receivedIds = new Set(
        receivedStates.map((state) => state.bitId)
      );
      const nearestFourReceived =
        receivedIds.size === expectedReceiverIds.size &&
        [...expectedReceiverIds].every((id) => receivedIds.has(id));
      const representativeLeaderPreserved = receivedStates.every(
        (state) =>
          state.alertLeaderId === firstLeader.id &&
          state.targetId === target.id
      );
      update(
        harness.system,
        0,
        0,
        targets,
        Object.freeze([
          Object.freeze({
            leaderId: secondLeader.id,
            targetId: target.id,
            remainingSeconds: 15
          })
        ])
      );
      const chasePlans =
        harness.system.getFrameView().diagnostics.routePlans.chase;
      const plannedIds = new Set(
        harness.system
          .getFrameView().flightStates
          .filter((state) => state.routePurpose === "chase")
          .map((state) => state.bitId)
      );
      const afterRepeatedLeader = harness.system
        .getFrameView().targetStates
        .filter((state) => state.mode === "alert-receive");
      return Object.freeze({
        name:
          "同一標的の外部Alertは複数leaderでも近い4機だけ・追跡計画1更新4件",
        ok:
          receivedStates.length === routePlanBudget &&
          nearestFourReceived &&
          representativeLeaderPreserved &&
          chasePlans === routePlanBudget &&
          plannedIds.size === routePlanBudget &&
          [...expectedReceiverIds].every((id) => plannedIds.has(id)) &&
          afterRepeatedLeader.length === routePlanBudget,
        detail:
          `received=${receivedStates.length}/${routePlanBudget} / ` +
          `nearest=${nearestFourReceived} / ` +
          `representative=${representativeLeaderPreserved} / ` +
          `planned=${plannedIds.size}/${routePlanBudget} / ` +
          `plans=${chasePlans}/${routePlanBudget} / ` +
          `repeated=${afterRepeatedLeader.length}/${routePlanBudget}`
      });
    } finally {
      harness.dispose();
    }
  };

const runEscapeRouteBudgetFairnessCheck =
  (): BitCombatIntegrationCheck => {
    const bitCount = 99;
    const routePlanBudget = 3;
    const maximumWaitUpdates = Math.ceil(bitCount / routePlanBudget);
    const harness = createHarness(bitCount, () => true);
    try {
      harness.system.setDiagnosticsEnabled(true);
      const alertGroups = Object.freeze(
        Array.from({ length: Math.ceil(bitCount / 4) }, (_, index) => {
          const target = createTarget(
            `escape-budget-target-${index}`,
            new Vector3(
              200 + index * 0.01,
              BAND_CENTER_HEIGHT,
              0
            )
          );
          const leader = createTarget(
            `escape-budget-leader-${index}`,
            new Vector3(
              199 + index * 0.01,
              BAND_CENTER_HEIGHT,
              0
            )
          );
          return Object.freeze({ leader, target });
        })
      );
      const targets = Object.freeze(
        alertGroups.flatMap(({ leader, target }) => [
          leader,
          target
        ])
      );
      const alerts = Object.freeze(
        alertGroups.map(({ leader, target }) =>
          Object.freeze({
            leaderId: leader.id,
            targetId: target.id,
            remainingSeconds: 15
          })
        )
      );
      update(
        harness.system,
        0,
        0,
        targets,
        alerts
      );
      const receivedCount = harness.system
        .getFrameView().targetStates
        .filter((state) => state.mode === "alert-receive").length;
      const unavailableTargets = Object.freeze(
        alertGroups.flatMap(({ leader, target }) => [
          leader,
          Object.freeze({
            ...target,
            alive: false
          })
        ])
      );
      const plansPerUpdate: number[] = [];
      for (
        let updateIndex = 1;
        updateIndex <= maximumWaitUpdates;
        updateIndex += 1
      ) {
        update(
          harness.system,
          TICK_SECONDS,
          updateIndex * TICK_SECONDS,
          unavailableTargets
        );
        plansPerUpdate.push(
          harness.system.getFrameView().diagnostics.routePlans.escape
        );
      }
      const plannedCount = plansPerUpdate.reduce(
        (sum, count) => sum + count,
        0
      );
      return Object.freeze({
        name: "一斉標的喪失の逃走計画は99機でも1更新3件・33更新以内",
        ok:
          receivedCount === bitCount &&
          plannedCount === bitCount &&
          plansPerUpdate.every(
            (count) => count >= 0 && count <= routePlanBudget
          ),
        detail:
          `received=${receivedCount}/${bitCount} / ` +
          `planned=${plannedCount}/${bitCount} / ` +
          `perUpdate=${plansPerUpdate.join(",")} / ` +
          `latest=${plansPerUpdate.length}/${maximumWaitUpdates}`
      });
    } finally {
      harness.dispose();
    }
  };

const runRouteSafetyCacheLruCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(1, () => true);
    let systemDisposed = false;
    try {
      harness.system.setDiagnosticsEnabled(true);
      const bitId = harness.system.getFrameView().actorSpheres[0].id;
      const createScenarioTargets = (routeIndex: number) => {
        const origin = new Vector3(
          routeIndex * 4,
          BAND_CENTER_HEIGHT,
          0
        );
        return Object.freeze({
          origin,
          leader: createTarget(
            "route-cache-leader",
            origin.add(new Vector3(1, 0, 0))
          ),
          target: createTarget(
            "route-cache-target",
            origin.add(new Vector3(2, 0, 0))
          )
        });
      };
      const firstScenario = createScenarioTargets(0);
      update(
        harness.system,
        0,
        0,
        Object.freeze([
          firstScenario.leader,
          firstScenario.target
        ]),
        Object.freeze([
          Object.freeze({
            leaderId: firstScenario.leader.id,
            targetId: firstScenario.target.id,
            remainingSeconds: 15
          })
        ])
      );
      const exerciseRoute = (routeIndex: number) => {
        const scenario = createScenarioTargets(routeIndex);
        harness.system.placeBits([
          Object.freeze({
            id: bitId,
            centerPosition: scenario.origin
          })
        ]);
        update(
          harness.system,
          0,
          routeIndex + 1,
          Object.freeze([scenario.leader, scenario.target])
        );
        return harness.system.getFrameView().diagnostics
          .routeSafetyCache;
      };

      for (
        let routeIndex = 0;
        routeIndex < V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES;
        routeIndex += 1
      ) {
        exerciseRoute(routeIndex);
      }
      const filled = harness.system.getFrameView().diagnostics
        .routeSafetyCache;
      const filledAtCapacity = [
        filled.routeSteps,
        filled.routeCenters,
        filled.routeSegments,
        filled.lowCeilingCruiseHeights
      ].every(
        (entry) =>
          entry.size === V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES
      );

      const beforeRecentTouch = filled;
      const afterRecentTouch = exerciseRoute(0);
      const recentTouchUsedCachedResults =
        afterRecentTouch.routeSteps.recomputations ===
          beforeRecentTouch.routeSteps.recomputations &&
        afterRecentTouch.routeCenters.recomputations ===
          beforeRecentTouch.routeCenters.recomputations &&
        afterRecentTouch.routeSegments.recomputations ===
          beforeRecentTouch.routeSegments.recomputations &&
        afterRecentTouch.lowCeilingCruiseHeights.recomputations ===
          beforeRecentTouch.lowCeilingCruiseHeights.recomputations;

      const afterOverflow = exerciseRoute(
        V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES
      );
      const afterRecentRevisit = exerciseRoute(0);
      const recentEntrySurvivedEviction =
        afterRecentRevisit.routeSteps.recomputations ===
          afterOverflow.routeSteps.recomputations &&
        afterRecentRevisit.routeCenters.recomputations ===
          afterOverflow.routeCenters.recomputations &&
        afterRecentRevisit.routeSegments.recomputations ===
          afterOverflow.routeSegments.recomputations &&
        afterRecentRevisit.lowCeilingCruiseHeights.recomputations ===
          afterOverflow.lowCeilingCruiseHeights.recomputations;

      const beforeEvictedRevisit = afterRecentRevisit;
      const afterEvictedRevisit = exerciseRoute(1);
      const evictedEntryWasRecomputed =
        afterEvictedRevisit.routeSteps.recomputations ===
          beforeEvictedRevisit.routeSteps.recomputations + 1 &&
        afterEvictedRevisit.routeCenters.recomputations ===
          beforeEvictedRevisit.routeCenters.recomputations + 1 &&
        afterEvictedRevisit.routeSegments.recomputations ===
          beforeEvictedRevisit.routeSegments.recomputations + 1 &&
        afterEvictedRevisit.lowCeilingCruiseHeights.recomputations ===
          beforeEvictedRevisit.lowCeilingCruiseHeights.recomputations +
            1;
      const boundedAfterEviction = [
        afterEvictedRevisit.routeSteps,
        afterEvictedRevisit.routeCenters,
        afterEvictedRevisit.routeSegments,
        afterEvictedRevisit.lowCeilingCruiseHeights
      ].every(
        (entry) =>
          entry.size <= V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES &&
          entry.evictions >= 1
      );

      harness.system.dispose();
      systemDisposed = true;
      const disposed = harness.system.getFrameView().diagnostics
        .routeSafetyCache;
      const disposeClearedCaches = [
        disposed.routeSteps,
        disposed.routeCenters,
        disposed.routeSegments,
        disposed.lowCeilingCruiseHeights
      ].every((entry) => entry.size === 0);

      return Object.freeze({
        name:
          "BIT正確座標経路安全cacheを4,096件LRUで連動破棄・再計算",
        ok:
          filled.maximumEntriesPerMap ===
            V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES &&
          filledAtCapacity &&
          recentTouchUsedCachedResults &&
          recentEntrySurvivedEviction &&
          evictedEntryWasRecomputed &&
          boundedAfterEviction &&
          disposeClearedCaches,
        detail:
          `capacity=${filled.maximumEntriesPerMap} / ` +
          `sizes=${afterEvictedRevisit.routeSteps.size},` +
          `${afterEvictedRevisit.routeCenters.size},` +
          `${afterEvictedRevisit.routeSegments.size},` +
          `${afterEvictedRevisit.lowCeilingCruiseHeights.size} / ` +
          `evictions=${afterEvictedRevisit.routeSteps.evictions},` +
          `${afterEvictedRevisit.routeCenters.evictions},` +
          `${afterEvictedRevisit.routeSegments.evictions},` +
          `${afterEvictedRevisit.lowCeilingCruiseHeights.evictions} / ` +
          `recent=${recentTouchUsedCachedResults}/${recentEntrySurvivedEviction} / ` +
          `recomputed=${evictedEntryWasRecomputed} / ` +
          `disposed=${disposeClearedCaches}`
      });
    } finally {
      harness.dispose(systemDisposed);
    }
  };

const runRouteStepDescriptorIdentityReuseCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(1, () => true);
    try {
      harness.system.setDiagnosticsEnabled(true);
      const origin = new Vector3(0, BAND_CENTER_HEIGHT, 0);
      const leader = createTarget(
        "route-descriptor-leader",
        origin.add(new Vector3(1, 0, 0))
      );
      const target = createTarget(
        "route-descriptor-target",
        origin.add(new Vector3(2, 0, 0))
      );
      update(
        harness.system,
        0,
        0,
        Object.freeze([leader, target]),
        Object.freeze([
          Object.freeze({
            leaderId: leader.id,
            targetId: target.id,
            remainingSeconds: 15
          })
        ])
      );
      update(
        harness.system,
        0,
        1,
        Object.freeze([leader, target])
      );
      const diagnostics = harness.system.getFrameView().diagnostics;
      const descriptors =
        diagnostics.routeSafetyCache.routeStepDescriptors;
      return Object.freeze({
        name:
          "同一BitFlightRouteStep identityの安全記述子をpolicy・最終検証で共有",
        ok:
          diagnostics.routePlans.chase === 1 &&
          descriptors.created === 1 &&
          descriptors.reused === 2,
        detail:
          `chase=${diagnostics.routePlans.chase} / ` +
          `descriptor=${descriptors.created}/${descriptors.reused}`
      });
    } finally {
      harness.dispose();
    }
  };

const runFrameViewAndSharedGeometryCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(4, () => true);
    try {
      const actorsBefore = harness.system.getFrameView().actorSpheres;
      const targetStatesBefore = harness.system.getFrameView().targetStates;
      const flightStatesBefore = harness.system.getFrameView().flightStates;
      const sameFrameViewsAreStable =
        actorsBefore === harness.system.getFrameView().actorSpheres &&
        targetStatesBefore === harness.system.getFrameView().targetStates &&
        flightStatesBefore === harness.system.getFrameView().flightStates;
      const bodies = targetStatesBefore
        .map((state) =>
          harness.scene.getMeshByName(`${state.bitId}_body`)
        )
        .filter(
          (mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh
        );
      const muzzles = targetStatesBefore
        .map((state) =>
          harness.scene.getMeshByName(`${state.bitId}_muzzle`)
        )
        .filter(
          (mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh
        );
      const normalBodySource =
        harness.scene.getMeshByName("v2BitBodySource");
      const redBodySource =
        harness.scene.getMeshByName("v2RedBitBodySource");
      const muzzleSource =
        harness.scene.getMeshByName("v2BitMuzzleSource");
      const sharedGeometry =
        normalBodySource instanceof Mesh &&
        redBodySource instanceof Mesh &&
        normalBodySource.geometry === redBodySource.geometry;
      const sharedInstances =
        bodies.length === 4 &&
        muzzles.length === 4 &&
        bodies.every((body) => body.sourceMesh === normalBodySource) &&
        muzzles.every((muzzle) => muzzle.sourceMesh === muzzleSource);

      harness.system.setDiagnosticsEnabled(true);
      update(harness.system, 0, 0, EMPTY_TARGETS);
      const diagnostics = harness.system.getFrameView().diagnostics;
      const nextActors = harness.system.getFrameView().actorSpheres;
      const previousViewStayedImmutable =
        actorsBefore.length === 4 &&
        actorsBefore.every((actor) =>
          Number.isFinite(actor.center.lengthSquared())
        );
      return Object.freeze({
        name: "BIT frame viewを同一更新内で再利用し本体・先端を共有Instance化",
        ok:
          sameFrameViewsAreStable &&
          nextActors !== actorsBefore &&
          previousViewStayedImmutable &&
          sharedGeometry &&
          sharedInstances &&
          diagnostics.enabled &&
          diagnostics.routePlans.search <= 4 &&
          diagnostics.beamRequests ===
            harness.system.getFrameView().beamRequests.length,
        detail:
          `frameViews=${sameFrameViewsAreStable}/${nextActors !== actorsBefore} / ` +
          `instances=${bodies.length}/${muzzles.length} / ` +
          `geometry=${sharedGeometry} / ` +
          `diagnostics=${diagnostics.enabled}/` +
          `${diagnostics.routePlans.search}/` +
          `${diagnostics.sightRays}/` +
          `${diagnostics.sphereSweeps}/` +
          `${diagnostics.beamRequests}`
      });
    } finally {
      harness.dispose();
    }
  };

const runLazyFlightStatesFrameViewCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(1, () => true);
    try {
      const previousView = harness.system.getFrameView();
      const flightStatesDescriptor = Object.getOwnPropertyDescriptor(
        previousView,
        "flightStates"
      );
      const previousActor = previousView.actorSpheres[0];
      const previousPosition = previousActor.center.clone();
      const nextPosition = previousPosition.add(
        new Vector3(0.4, 0, 0)
      );
      if (
        typeof flightStatesDescriptor?.get !== "function" ||
        flightStatesDescriptor.value !== undefined
      ) {
        return Object.freeze({
          name: "BIT flightStatesをFrame View内で遅延1回構築",
          ok: false,
          detail: "未アクセスflightStatesがgetterではありません。"
        });
      }

      harness.system.placeBits([
        Object.freeze({
          id: previousActor.id,
          centerPosition: nextPosition
        })
      ]);
      const currentView = harness.system.getFrameView();
      const previousFlights = previousView.flightStates;
      const repeatedPreviousFlights = previousView.flightStates;
      const currentFlights = currentView.flightStates;
      const previousViewStayedImmutable =
        previousFlights.length === 1 &&
        Vector3.DistanceSquared(
          previousFlights[0].position,
          previousPosition
        ) <= 1e-12;
      const currentViewChanged =
        currentFlights.length === 1 &&
        Vector3.DistanceSquared(
          currentFlights[0].position,
          previousPosition
        ) > 1e-12;
      return Object.freeze({
        name: "BIT flightStatesをFrame View内で遅延1回構築",
        ok:
          previousFlights === repeatedPreviousFlights &&
          currentView !== previousView &&
          currentFlights !== previousFlights &&
          previousViewStayedImmutable &&
          currentViewChanged &&
          Object.isFrozen(previousFlights) &&
          previousFlights.every(Object.isFrozen),
        detail:
          `lazy=${typeof flightStatesDescriptor.get === "function"} / ` +
          `same=${previousFlights === repeatedPreviousFlights} / ` +
          `old=${previousViewStayedImmutable} / ` +
          `next=${currentViewChanged}`
      });
    } finally {
      harness.dispose();
    }
  };

export const runBitCombatIntegrationTests =
  (
    fixture: BitSystemAcceptanceFixture
  ): readonly BitCombatIntegrationCheck[] =>
    Object.freeze([
      runNormalPatrolReachContractCheck(),
      runNormalPatrolDetourLifetimeCheck(),
      runNormalPatrolReservationCheck(),
      runNormalPatrolReservationBestEffortCheck(),
      runNormalPatrolReversePenaltyCheck(),
      runBruteForceScheduleBoundaryCheck(),
      runBruteForceScheduleIntervalCheck(),
      runBruteForceFleetPlanningBudgetCheck(),
      runBruteForceCandidatePagingCheck(),
      runWindowCursorAndInteriorContinuationCheck(),
      runRedVerticalSearchSpeedCheck(),
      runRedTransitionSpeedCheck(fixture),
      runRouteCandidateLowerBoundPruningCheck(),
      runChaseWindowCongestionCostCheck(),
      runAlertRequestModeCheck(),
      runAlertAssemblyCompletionCheck(),
      runAlertTimeoutCheck(),
      runInternalAlertSpawnAndGlobalSingleCheck(),
      runInternalAlertSpawnFailureFallbackCheck(),
      runInternalAlertRangeCancellationCheck(),
      runAlertReceiveSurfaceSpeedCheck(),
      runChaseSurfaceSpeedAndRangeCheck(),
      runAttackCooldownCheck(),
      runRandomAttackSpeedCheck(),
      runCarpetThreeDimensionalSweepAndAimCheck(),
      runCarpetScatterSteeringCheck(),
      runCarpetBeamDirectionLockCheck(),
      runCarpetFormationFadeCheck(),
      runCarpetObstacleAbortCooldownCheck(),
      runCarpetFirstFireCheck(),
      runCarpetPassCheck(),
      runCarpetFollowerImpactCheck(),
      runExternalAlertModeEligibilityCheck(),
      runAlertChaseRouteBudgetFairnessCheck(),
      runEscapeRouteBudgetFairnessCheck(),
      runRouteStepDescriptorIdentityReuseCheck(),
      runRouteSafetyCacheLruCheck(),
      runLazyFlightStatesFrameViewCheck(),
      runFrameViewAndSharedGeometryCheck()
    ]);
