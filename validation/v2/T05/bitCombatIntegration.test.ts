import {
  Color4,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
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
  V2_BIT_MUZZLE_COLOR_BY_MODE,
  V2_BIT_MUZZLE_RED,
  V2_BIT_ROUTE_SAFETY_CACHE_MAX_ENTRIES,
  createV2BitSystem,
  resolveV2BitMuzzleColor,
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
import { V2_TRANSPARENT_ALPHA_INDEX_SPATIAL } from "../../../src/v2/v2TransparentRenderingOrder";
import type {
  BitSystemAcceptanceFixture
} from "./bitSystemAcceptance.test";
import {
  createFixtureBitLineSpawnRandom,
  createFixturePlayerSpawn,
  createFixtureSurfaceTriangles
} from "./spawnContractFixture";

const createFixtureNavigationAreas = () => {
  const area = Object.freeze({ id: "fixture-area", volumes: Object.freeze([]) });
  return Object.freeze({
    all: Object.freeze([area]),
    portals: Object.freeze([]),
    getById: (id: string) => (id === area.id ? area : null),
    locate: () => Object.freeze({ areaId: area.id, portalId: null }),
    advance: (cursor: Readonly<{ areaId: string; portalId: string | null }>) => cursor,
    dispose: () => {}
  });
};

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

const bitMuzzleAuditConfigBySystem = new WeakMap<
  V2BitSystem,
  Readonly<{
    scene: Scene;
    modeMuzzleColorEnabled: boolean;
  }>
>();

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
    getSurfaceTriangles: (ref: BitFlightBandRef) =>
      ref.zoneId === TEST_ZONE_ID && ref.bandId === TEST_BAND_ID
        ? createFixtureSurfaceTriangles(
            -100,
            100,
            -1,
            1,
            BAND_CENTER_HEIGHT
          )
        : Object.freeze([]),
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
  navigationOverride: BitFlightNavigationWorld | null = null,
  modeMuzzleColorEnabled = false
): CombatHarness => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const navigation =
    navigationOverride ?? createNavigation(rejectConstrainedMovement);
  const spawnWidth = Math.max(4, initialBitCount * 2);
  const spawn = MeshBuilder.CreateBox(
    `T05BitCombatSpawn_${initialBitCount}`,
    {
      width: spawnWidth,
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
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh: spawn
  });
  const playerSpawn = createFixturePlayerSpawn(
    `t05-bit-combat-player-spawn-${initialBitCount}`,
    spawn
  );
  const spatial = Object.freeze({
    bitNavigation: navigation,
    navigationAreas: createFixtureNavigationAreas(),
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
      containsVolumeById: () => false,
      dispose: () => {}
    })
  }) as unknown as StageSpatialContext;
  const random = createQueuedRandom(
    createInitialRandomValues(initialBitCount, createRedProfile)
  );
  const system = createV2BitSystem(scene, spatial, {
    combatEnabled: true,
    modeMuzzleColorEnabled,
    showGroundShadows: false,
    initialBitCount,
    reinforcementIntervalSeconds: 1_000_000,
    maximumBitCount: initialBitCount + 1,
    minimumSpawnDistance: 0,
    spawnMaxAttempts: 8,
    spawnProjectionMaxDistance: 0.35,
    random: random.random,
    spawnRandom: createFixtureBitLineSpawnRandom(
      initialBitCount,
      0x5405_0000 ^ initialBitCount
    ),
    playerSpawn,
    resolveTargetNavigationArea: (target: V2HumanTargetSnapshot) =>
      Object.freeze({
        targetId: target.id,
        areaId: "fixture-area",
        revision: 0,
        anchor: target.footPosition.clone()
      })
  });
  bitMuzzleAuditConfigBySystem.set(
    system,
    Object.freeze({ scene, modeMuzzleColorEnabled })
  );
  system.prepareForScriptedPhase();
  system.placeBits(
    system.getFrameView().actorSpheres.map((actor, index) =>
      Object.freeze({
        id: actor.id,
        centerPosition: new Vector3(
          -spawnWidth / 2 +
            (spawnWidth * (index + 1)) / (initialBitCount + 1),
          BAND_CENTER_HEIGHT,
          0
        )
      })
    )
  );

  return Object.freeze({
    scene,
    system,
    random,
    dispose: (systemAlreadyDisposed = false) => {
      bitMuzzleAuditConfigBySystem.delete(system);
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
      getSurfaceTriangles: (ref: BitFlightBandRef) => {
        const band = getBand(ref);
        return band
          ? createFixtureSurfaceTriangles(
              -10,
              10,
              -10,
              10,
              (band.minimumCenterHeight + band.maximumCenterHeight) / 2
            )
          : Object.freeze([]);
      },
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
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh: spawn
  });
  const playerSpawn = createFixturePlayerSpawn(
    "t05-red-bit-transition-player-spawn",
    spawn
  );
  const spatial = Object.freeze({
    bitNavigation: fixture.navigation,
    navigationAreas: createFixtureNavigationAreas(),
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
      containsVolumeById: () => false,
      dispose: () => {}
    })
  }) as unknown as StageSpatialContext;
  const random = createQueuedRandom(
    createInitialRandomValues(1, true)
  );
  const system = createV2BitSystem(fixture.scene, spatial, {
    combatEnabled: true,
    modeMuzzleColorEnabled: false,
    showGroundShadows: false,
    initialBitCount: 1,
    reinforcementIntervalSeconds: 10,
    maximumBitCount: 1,
    minimumSpawnDistance: 0,
    spawnMaxAttempts: 8,
    spawnProjectionMaxDistance: 0.35,
    random: random.random,
    spawnRandom: createFixtureBitLineSpawnRandom(1, 0x5405_0001),
    playerSpawn,
    resolveTargetNavigationArea: (target: V2HumanTargetSnapshot) =>
      Object.freeze({
        targetId: target.id,
        areaId: "fixture-area",
        revision: 0,
        anchor: target.footPosition.clone()
      })
  });
  system.prepareForScriptedPhase();
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

const auditBitMuzzleInstanceColors = (system: V2BitSystem): void => {
  const auditConfig = bitMuzzleAuditConfigBySystem.get(system);
  if (!auditConfig) {
    return;
  }
  for (const state of system.getFrameView().targetStates) {
    const muzzle = auditConfig.scene.getMeshByName(
      `${state.bitId}_muzzle`
    );
    if (!(muzzle instanceof InstancedMesh)) {
      throw new Error(`BIT先端球Instanceがありません: ${state.bitId}`);
    }
    const actual = muzzle.instancedBuffers.color;
    const expected = resolveV2BitMuzzleColor(
      state.mode,
      auditConfig.modeMuzzleColorEnabled,
      state.isRed
    );
    if (!(actual instanceof Color4) || !colorsApproximatelyEqual(actual, expected)) {
      throw new Error(
        `BIT先端球色がmodeと一致しません: ${state.bitId}/${state.mode}`
      );
    }
  }
};

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
  auditBitMuzzleInstanceColors(system);
};

const completePendingBitSpawnVisuals = (
  system: V2BitSystem,
  targets: readonly V2HumanTargetSnapshot[],
  externalAlerts: readonly V2ExternalAlert[] = EMPTY_ALERTS,
  startElapsedSeconds = 0
) => {
  let elapsedSeconds = startElapsedSeconds;
  for (const deltaSeconds of [0.5, 0.5, 0.5] as const) {
    elapsedSeconds += deltaSeconds;
    update(system, deltaSeconds, elapsedSeconds, targets, externalAlerts);
  }
  return elapsedSeconds;
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

const runStartupGraceSuspensionCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(1, () => false);
    const target = createTarget(
      "startup-grace-target",
      new Vector3(0, 0, 1)
    );
    try {
      const before = harness.system.getFrameView().actorSpheres[0].center;
      harness.system.setHostileActionsSuspended(true);
      update(
        harness.system,
        3,
        3,
        Object.freeze([target])
      );
      const suspendedView = harness.system.getFrameView();
      const suspendedActor = suspendedView.actorSpheres[0];
      const suspendedBeamCount = suspendedView.beamRequests.length;
      harness.system.setHostileActionsSuspended(false);
      harness.random.enqueue(0.5, 0.5);
      update(
        harness.system,
        1,
        4,
        Object.freeze([target])
      );
      const resumed = harness.system.getFrameView().targetStates[0];
      return Object.freeze({
        name: "開始猶予中はBITの移動・索敵・射撃を停止",
        ok:
          suspendedActor.center.equals(before) &&
          suspendedView.targetStates[0].targetId === null &&
          suspendedBeamCount === 0 &&
          resumed.targetId === target.id,
        detail:
          `stationary=${suspendedActor.center.equals(before)} / suspendedTarget=${suspendedView.targetStates[0].targetId ?? "none"} / beams=${suspendedBeamCount} / resumed=${resumed.targetId ?? "none"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitCurrentTargetSightScheduleCheck =
  (): BitCombatIntegrationCheck => {
    let sightBlocked = false;
    const harness = createHarness(1, () => sightBlocked);
    try {
      harness.system.setDiagnosticsEnabled(true);
      const origin =
        harness.system.getFrameView().actorSpheres[0].center;
      const target = createTarget(
        "target-selection-current-sight",
        origin.add(new Vector3(1, 0, 0))
      );
      const acquired = acquireMode(harness, 0.1, target);
      sightBlocked = true;
      update(
        harness.system,
        0.199,
        0.199,
        Object.freeze([target])
      );
      const beforeBoundary = harness.system.getFrameView();
      update(
        harness.system,
        0.002,
        0.201,
        Object.freeze([target])
      );
      const afterBoundary = harness.system.getFrameView();
      return Object.freeze({
        name: "BIT現在標的視線確認を5Hz境界で実行",
        ok:
          acquired.targetId === target.id &&
          acquired.mode === "chase" &&
          beforeBoundary.diagnostics.currentTargetSightCheckCount ===
            0 &&
          beforeBoundary.targetStates[0].targetId === target.id &&
          afterBoundary.diagnostics.currentTargetSightCheckCount ===
            1 &&
          afterBoundary.diagnostics.sightRays === 1 &&
          afterBoundary.targetStates[0].targetId === target.id,
        detail:
          `target=${acquired.targetId ?? "none"} / ` +
          `before=${beforeBoundary.diagnostics.currentTargetSightCheckCount} / ` +
          `after=${afterBoundary.diagnostics.currentTargetSightCheckCount} / ` +
          `rays=${afterBoundary.diagnostics.sightRays}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitTargetSelectionPersonalityCheck =
  (): BitCombatIntegrationCheck => {
    let blockedAlternative = true;
    let alternativeAimPosition = Vector3.Zero();
    const harness = createHarness(
      2,
      (_from, to) =>
        blockedAlternative &&
        Vector3.DistanceSquared(to, alternativeAimPosition) <= 1e-12
    );
    try {
      harness.system.setDiagnosticsEnabled(true);
      placeHarnessBitsAtSamePosition(harness);
      const generated = harness.system.getFrameView().targetStates;
      const generatedPersistent = generated.find(
        ({ bitId }) => bitId === "v2_bit_0"
      );
      const generatedNearest = generated.find(
        ({ bitId }) => bitId === "v2_bit_1"
      );
      const origin =
        harness.system.getFrameView().actorSpheres[0].center;
      const initialTarget = createTarget(
        "target-selection-initial",
        origin.add(new Vector3(0.5, 0, 0))
      );
      const movedInitialTarget = createTarget(
        initialTarget.id,
        origin.add(new Vector3(1, 0, 0))
      );
      const alternativeTarget = createTarget(
        "target-selection-alternative",
        origin.add(new Vector3(0.8, 0, 0))
      );
      alternativeAimPosition = alternativeTarget.aimPosition.clone();
      const initialTargets = Object.freeze([
        initialTarget,
        alternativeTarget
      ]);
      harness.random.enqueue(0.1, 0.5);
      update(harness.system, 0, 0, initialTargets);
      harness.random.enqueue(0.1, 0.5);
      update(harness.system, 0.1, 0.1, initialTargets);
      const acquired = harness.system.getFrameView().targetStates;
      const persistent = acquired.find(
        ({ bitId }) => bitId === "v2_bit_0"
      );
      const nearest = acquired.find(
        ({ bitId }) => bitId === "v2_bit_1"
      );

      const movedTargets = Object.freeze([
        movedInitialTarget,
        alternativeTarget
      ]);
      update(harness.system, 0.89, 0.99, movedTargets);
      const beforeAlternativeBoundary = harness.system.getFrameView();
      update(harness.system, 0.12, 1.11, movedTargets);
      const blockedQuery = harness.system.getFrameView();
      const blockedNearest = blockedQuery.targetStates.find(
        ({ bitId }) => bitId === "v2_bit_1"
      );

      blockedAlternative = false;
      update(harness.system, 1, 2.11, movedTargets);
      const switched = harness.system.getFrameView();
      const switchedPersistent = switched.targetStates.find(
        ({ bitId }) => bitId === "v2_bit_0"
      );
      const switchedNearest = switched.targetStates.find(
        ({ bitId }) => bitId === "v2_bit_1"
      );

      const alertLeader = createTarget(
        "target-selection-alert-leader",
        origin.add(new Vector3(8, 0, 0))
      );
      const forcedTarget = createTarget(
        "target-selection-forced",
        origin.add(new Vector3(9, 0, 0))
      );
      const forcedTargets = Object.freeze([
        movedInitialTarget,
        alternativeTarget,
        alertLeader,
        forcedTarget
      ]);
      const forcedAlerts = Object.freeze([
        Object.freeze({
          leaderId: alertLeader.id,
          targetId: forcedTarget.id,
          remainingSeconds: 15
        })
      ]);
      update(
        harness.system,
        0,
        2.11,
        forcedTargets,
        forcedAlerts
      );
      const forced = harness.system.getFrameView();
      update(
        harness.system,
        1.1,
        3.21,
        forcedTargets,
        forcedAlerts
      );
      const forcedHeld = harness.system.getFrameView();
      return Object.freeze({
        name:
          "BIT個性別1Hz切替・遮蔽・同一標的経路保持・強制優先",
        ok:
          generatedPersistent?.targetSelectionPersonality ===
            "persistent" &&
          generatedNearest?.targetSelectionPersonality ===
            "nearest-visible" &&
          generated.every(({ targetId }) => targetId === null) &&
          persistent?.targetSelectionPersonality === "persistent" &&
          nearest?.targetSelectionPersonality === "nearest-visible" &&
          persistent.targetId === initialTarget.id &&
          nearest.targetId === initialTarget.id &&
          beforeAlternativeBoundary.diagnostics
            .personalityRetargetQueryCount === 0 &&
          blockedQuery.diagnostics.personalityRetargetQueryCount ===
            1 &&
          blockedQuery.diagnostics
            .autonomousVisualTargetChangeCount === 0 &&
          blockedQuery.diagnostics.routePlans.chase === 0 &&
          blockedNearest?.targetId === initialTarget.id &&
          switched.diagnostics.personalityRetargetQueryCount === 1 &&
          switched.diagnostics.autonomousVisualTargetChangeCount ===
            1 &&
          switchedPersistent?.targetId === initialTarget.id &&
          switchedNearest?.targetId === alternativeTarget.id &&
          forced.targetStates.every(
            ({ targetId, provenance, mode }) =>
              targetId === forcedTarget.id &&
              provenance === "alert" &&
              mode === "alert-receive"
          ) &&
          forced.diagnostics.forcedTargetChangeCount === 2 &&
          forced.diagnostics.autonomousVisualTargetChangeCount === 0 &&
          forcedHeld.targetStates.every(
            ({ targetId, provenance, mode }) =>
              targetId === forcedTarget.id &&
              provenance === "alert" &&
              mode === "alert-receive"
          ) &&
          forcedHeld.diagnostics.forcedTargetChangeCount === 0 &&
          forcedHeld.diagnostics.personalityRetargetQueryCount === 0 &&
          forcedHeld.diagnostics.autonomousVisualTargetChangeCount ===
            0,
        detail:
          `generated=${generatedPersistent?.targetSelectionPersonality ?? "missing"}/` +
          `${generatedNearest?.targetSelectionPersonality ?? "missing"} / ` +
          `personality=${persistent?.targetSelectionPersonality ?? "missing"}/` +
          `${nearest?.targetSelectionPersonality ?? "missing"} / ` +
          `mode=${persistent?.mode ?? "missing"}/` +
          `${nearest?.mode ?? "missing"}->` +
          `${blockedNearest?.mode ?? "missing"} / ` +
          `beforeQuery=${beforeAlternativeBoundary.diagnostics.personalityRetargetQueryCount} / ` +
          `blocked=${blockedNearest?.targetId ?? "none"}:` +
          `${blockedQuery.diagnostics.personalityRetargetQueryCount} / ` +
          `switched=${switchedPersistent?.targetId ?? "none"}/` +
          `${switchedNearest?.targetId ?? "none"} / ` +
          `forced=${forced.diagnostics.forcedTargetChangeCount}/` +
          `${forcedHeld.targetStates[0].provenance ?? "none"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitTargetSelectionTieOrderCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(2);
    try {
      harness.system.setDiagnosticsEnabled(true);
      placeHarnessBitsAtSamePosition(harness);
      const origin =
        harness.system.getFrameView().actorSpheres[0].center;
      const sourceFirstTarget = createTarget(
        "target-selection-tie-z-source-first",
        origin.add(new Vector3(0.5, 0, 0.5))
      );
      const idFirstTarget = createTarget(
        "target-selection-tie-a-id-first",
        origin.add(new Vector3(0.5, 0, -0.5))
      );
      const targets = Object.freeze([
        sourceFirstTarget,
        idFirstTarget
      ]);

      harness.random.enqueue(0.1, 0.5);
      update(harness.system, 0, 0, targets);
      harness.random.enqueue(0.1, 0.5);
      update(harness.system, 0.1, 0.1, targets);
      const states = harness.system.getFrameView().targetStates;
      const persistent = states.find(
        ({ bitId }) => bitId === "v2_bit_0"
      );
      const nearest = states.find(
        ({ bitId }) => bitId === "v2_bit_1"
      );
      return Object.freeze({
        name:
          "BIT同距離候補をpersistentは入力順・nearestはID順で選択",
        ok:
          persistent?.targetSelectionPersonality === "persistent" &&
          persistent.targetId === sourceFirstTarget.id &&
          nearest?.targetSelectionPersonality ===
            "nearest-visible" &&
          nearest.targetId === idFirstTarget.id,
        detail:
          `persistent=${persistent?.targetId ?? "none"} / ` +
          `nearest=${nearest?.targetId ?? "none"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitCurrentAndAlternativeSightShareRayCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(2);
    try {
      harness.system.setDiagnosticsEnabled(true);
      placeHarnessBitsAtSamePosition(harness);
      const target = createTarget(
        "target-selection-shared-ray",
        new Vector3(0, BAND_CENTER_HEIGHT, 2)
      );
      const targets = Object.freeze([target]);
      harness.random.enqueue(
        ...Array.from({ length: 16 }, () => 0.1)
      );
      update(harness.system, 1, 1, targets);
      const acquired = harness.system
        .getFrameView()
        .targetStates.find(({ bitId }) => bitId === "v2_bit_1");
      const holdAccepted = harness.system.notifyBeamImpact(
        "v2_bit_0",
        "target-selection-shared-ray-hold"
      );
      update(harness.system, 1, 2, targets);
      const overlapped = harness.system.getFrameView();
      const retained = overlapped.targetStates.find(
        ({ bitId }) => bitId === "v2_bit_1"
      );
      return Object.freeze({
        name: "BIT現在標的5Hz・別候補1HzのRay共有",
        ok:
          acquired?.targetId === target.id &&
          acquired.targetSelectionPersonality ===
            "nearest-visible" &&
          acquired.mode === "chase" &&
          holdAccepted &&
          overlapped.diagnostics.currentTargetSightCheckCount === 1 &&
          overlapped.diagnostics.personalityRetargetQueryCount === 1 &&
          overlapped.diagnostics.sightRays === 1 &&
          overlapped.diagnostics.autonomousVisualTargetChangeCount ===
            0 &&
          retained?.targetId === target.id,
        detail:
          `current=${overlapped.diagnostics.currentTargetSightCheckCount} / ` +
          `alternative=${overlapped.diagnostics.personalityRetargetQueryCount} / ` +
          `rays=${overlapped.diagnostics.sightRays} / ` +
          `target=${retained?.targetId ?? "none"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitRetargetCooldownSurvivesCandidateSetShrinkCheck =
  (): BitCombatIntegrationCheck => {
    const bitCount = 10;
    const remainingBitId = "v2_bit_1";
    const nearestBitIds = Object.freeze([
      "v2_bit_1",
      "v2_bit_5",
      "v2_bit_7",
      "v2_bit_8",
      "v2_bit_9"
    ]);
    const routeDestinations: Vector3[] = [];
    let recordRouteDestinations = false;
    const baseNavigation = createNavigation();
    const trackedNavigation = Object.freeze({
      ...baseNavigation,
      findRoute: (
        start: BitFlightLocation,
        destination: BitFlightLocation,
        policy: BitFlightRoutePolicy
      ) => {
        if (recordRouteDestinations) {
          routeDestinations.push(
            getBitFlightWorldPosition(destination).clone()
          );
        }
        return baseNavigation.findRoute(
          start,
          destination,
          policy
        );
      }
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      bitCount,
      () => false,
      false,
      false,
      () => false,
      trackedNavigation
    );
    let holdsAccepted = true;
    const holdOtherBits = (phase: string) => {
      for (let index = 0; index < bitCount; index += 1) {
        const bitId = `v2_bit_${index}`;
        if (bitId === remainingBitId) {
          continue;
        }
        holdsAccepted =
          harness.system.notifyBeamImpact(
            bitId,
            `target-selection-shrink-${phase}-${bitId}`
          ) && holdsAccepted;
      }
    };
    try {
      harness.system.setDiagnosticsEnabled(true);
      placeHarnessBitsAtSamePosition(harness);
      const initialTarget = createTarget(
        "target-selection-shrink-initial",
        new Vector3(0, BAND_CENTER_HEIGHT, 2)
      );
      const movedInitialTarget = createTarget(
        initialTarget.id,
        new Vector3(0, BAND_CENTER_HEIGHT, 2)
      );
      const alternativeTarget = createTarget(
        "target-selection-shrink-alternative",
        new Vector3(0, BAND_CENTER_HEIGHT, 2.4)
      );
      const movedAlternativeTarget = createTarget(
        alternativeTarget.id,
        new Vector3(0.9, BAND_CENTER_HEIGHT, 1.5)
      );
      const initialTargets = Object.freeze([
        initialTarget,
        alternativeTarget
      ]);
      const movedTargets = Object.freeze([
        movedInitialTarget,
        movedAlternativeTarget
      ]);
      harness.random.enqueue(
        ...Array.from({ length: bitCount * 8 }, () => 0.1)
      );
      update(harness.system, 1, 1, initialTargets);
      const acquired = harness.system.getFrameView();
      update(harness.system, 1, 2, initialTargets);
      const firstRetargetRound = harness.system.getFrameView();

      recordRouteDestinations = true;
      holdOtherBits("immediate");
      update(harness.system, 0.01, 2.01, movedTargets);
      const immediatelyAfterShrink = harness.system.getFrameView();
      holdOtherBits("next-round");
      update(harness.system, 1, 3.01, movedTargets);
      const nextRetargetRound = harness.system.getFrameView();
      const routePlansDuringSwitch = routeDestinations.length;
      const switchedFlight = nextRetargetRound.flightStates.find(
        ({ bitId }) => bitId === remainingBitId
      );
      holdOtherBits("route-sync");
      update(harness.system, 0.01, 3.02, movedTargets);
      const routeSynchronized = harness.system.getFrameView();
      const latestRouteDestination =
        routeDestinations[routeDestinations.length - 1];
      const synchronizedTarget = routeSynchronized.targetStates.find(
        ({ bitId }) => bitId === remainingBitId
      );
      return Object.freeze({
        name:
          "BIT候補集合急減後の次回1Hz探索・経路予算接続",
        ok:
          holdsAccepted &&
          nearestBitIds.every((bitId) => {
            const state = acquired.targetStates.find(
              (candidate) => candidate.bitId === bitId
            );
            return (
              state?.targetSelectionPersonality ===
                "nearest-visible" &&
              state.targetId === initialTarget.id &&
              state.mode === "chase"
            );
          }) &&
          firstRetargetRound.diagnostics
            .personalityRetargetQueryCount === 4 &&
          immediatelyAfterShrink.diagnostics
            .personalityRetargetQueryCount === 0 &&
          immediatelyAfterShrink.diagnostics
            .autonomousVisualTargetChangeCount === 0 &&
          immediatelyAfterShrink.targetStates.find(
            ({ bitId }) => bitId === remainingBitId
          )?.targetId === initialTarget.id &&
          nextRetargetRound.diagnostics
            .personalityRetargetQueryCount === 1 &&
          nextRetargetRound.diagnostics
            .autonomousVisualTargetChangeCount === 1 &&
          nextRetargetRound.targetStates.find(
            ({ bitId }) => bitId === remainingBitId
          )?.targetId === alternativeTarget.id &&
          routePlansDuringSwitch === 0 &&
          switchedFlight?.routePurpose === "chase" &&
          routeSynchronized.diagnostics
            .personalityRetargetQueryCount === 0 &&
          nextRetargetRound.diagnostics.routePlans.chase +
            routeSynchronized.diagnostics.routePlans.chase ===
            1 &&
          routeDestinations.length === 1 &&
          latestRouteDestination !== undefined &&
          Vector3.DistanceSquared(
            latestRouteDestination,
            movedAlternativeTarget.aimPosition
          ) <= 1e-12 &&
          synchronizedTarget?.targetId === alternativeTarget.id,
        detail:
          `first=${firstRetargetRound.diagnostics.personalityRetargetQueryCount} / ` +
          `afterShrink=${immediatelyAfterShrink.diagnostics.personalityRetargetQueryCount}:` +
          `${immediatelyAfterShrink.targetStates.find(({ bitId }) => bitId === remainingBitId)?.targetId ?? "none"} / ` +
          `next=${nextRetargetRound.diagnostics.personalityRetargetQueryCount}:` +
          `${nextRetargetRound.targetStates.find(({ bitId }) => bitId === remainingBitId)?.targetId ?? "none"} / ` +
          `route=${switchedFlight?.routePurpose ?? "none"}->` +
          `${nextRetargetRound.diagnostics.routePlans.chase}+` +
          `${routeSynchronized.diagnostics.routePlans.chase},` +
          `duringSwitch=${routePlansDuringSwitch},` +
          `latest=${latestRouteDestination?.toString() ?? "none"}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitTargetlessPriorityDoesNotStarveCurrentSightChecks =
  (): BitCombatIntegrationCheck => {
    const bitCount = 30;
    const holderId = "v2_bit_0";
    const baseNavigation = createNavigation();
    const stationarySearchNavigation = Object.freeze({
      ...baseNavigation,
      randomPointAround: () => null
    }) as BitFlightNavigationWorld;
    const targetlessRayOrigins = new Set<string>();
    const expectedTargetlessRayOrigins = new Set<string>();
    let measurementHalf = 0;
    let firstHalfHolderSightRays = 0;
    let secondHalfHolderSightRays = 0;
    const harness = createHarness(
      bitCount,
      (from) => {
        const holderSightRay = from.x < 0;
        if (holderSightRay) {
          if (measurementHalf === 1) {
            firstHalfHolderSightRays += 1;
          } else if (measurementHalf === 2) {
            secondHalfHolderSightRays += 1;
          }
        } else {
          targetlessRayOrigins.add(from.x.toFixed(3));
        }
        return !holderSightRay;
      },
      false,
      false,
      () => false,
      stationarySearchNavigation
    );
    try {
      harness.system.setDiagnosticsEnabled(true);
      harness.system.placeBits(
        harness.system.getFrameView().actorSpheres.map(
          (actor, index) => {
            const centerPosition =
              index === 0
                ? new Vector3(-0.8, BAND_CENTER_HEIGHT, 0)
                : new Vector3(
                    0.1 + index * 0.02,
                    BAND_CENTER_HEIGHT,
                    0
                  );
            if (index > 0) {
              expectedTargetlessRayOrigins.add(
                centerPosition.x.toFixed(3)
              );
            }
            return Object.freeze({
              id: actor.id,
              centerPosition
            });
          }
        )
      );
      const target = createTarget(
        "target-selection-mixed-starvation",
        new Vector3(1.8, BAND_CENTER_HEIGHT, 0)
      );
      const targets = Object.freeze([target]);
      harness.random.enqueue(
        ...Array.from({ length: bitCount * 8 }, () => 0.1)
      );

      let elapsedSeconds = 0;
      update(harness.system, 0, elapsedSeconds, targets);
      for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
        elapsedSeconds += 1 / 60;
        update(
          harness.system,
          1 / 60,
          elapsedSeconds,
          targets
        );
      }
      const afterPriorityPass = harness.system.getFrameView();
      const targetlessPriorityCoveredAll =
        targetlessRayOrigins.size ===
          expectedTargetlessRayOrigins.size &&
        [...expectedTargetlessRayOrigins].every((origin) =>
          targetlessRayOrigins.has(origin)
        );

      let firstHalfCurrentChecks = 0;
      let firstHalfSightRays = 0;
      measurementHalf = 1;
      for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
        elapsedSeconds += 1 / 60;
        update(
          harness.system,
          1 / 60,
          elapsedSeconds,
          targets
        );
        const diagnostics =
          harness.system.getFrameView().diagnostics;
        firstHalfCurrentChecks +=
          diagnostics.currentTargetSightCheckCount;
        firstHalfSightRays += diagnostics.sightRays;
      }

      let secondHalfCurrentChecks = 0;
      let secondHalfSightRays = 0;
      measurementHalf = 2;
      for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
        elapsedSeconds += 1 / 60;
        update(
          harness.system,
          1 / 60,
          elapsedSeconds,
          targets
        );
        const diagnostics =
          harness.system.getFrameView().diagnostics;
        secondHalfCurrentChecks +=
          diagnostics.currentTargetSightCheckCount;
        secondHalfSightRays += diagnostics.sightRays;
      }
      measurementHalf = 0;
      const completed = harness.system.getFrameView();
      const holder = completed.targetStates.find(
        ({ bitId }) => bitId === holderId
      );
      const targetless = completed.targetStates.filter(
        ({ bitId }) => bitId !== holderId
      );
      return Object.freeze({
        name: "BIT targetless priority混在時も保持標的5Hzを継続",
        ok:
          afterPriorityPass.targetStates.find(
            ({ bitId }) => bitId === holderId
          )?.targetId === target.id &&
          targetlessPriorityCoveredAll &&
          holder?.targetId === target.id &&
          holder.targetSelectionPersonality === "persistent" &&
          targetless.every(({ targetId }) => targetId === null) &&
          firstHalfCurrentChecks >= 4 &&
          firstHalfCurrentChecks <= 6 &&
          secondHalfCurrentChecks >= 4 &&
          secondHalfCurrentChecks <= 6 &&
          firstHalfHolderSightRays === firstHalfCurrentChecks &&
          secondHalfHolderSightRays === secondHalfCurrentChecks &&
          firstHalfSightRays >= firstHalfHolderSightRays &&
          secondHalfSightRays >= secondHalfHolderSightRays,
        detail:
          `targetlessRayOrigins=${targetlessRayOrigins.size}/` +
          `${expectedTargetlessRayOrigins.size} / ` +
          `first=current:${firstHalfCurrentChecks},` +
          `holderRay:${firstHalfHolderSightRays},allRay:${firstHalfSightRays} / ` +
          `second=current:${secondHalfCurrentChecks},` +
          `holderRay:${secondHalfHolderSightRays},allRay:${secondHalfSightRays}`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitTargetSelectionSchedulerBudgetCheck =
  (): BitCombatIntegrationCheck => {
    const bitCount = 50;
    const measuredSightChecksByBitId = new Map<string, number>();
    let measuredBitIdBySightOrigin = new Map<string, string>();
    let trackMeasuredSightChecks = false;
    let unmatchedMeasuredSightCheckCount = 0;
    const toSightOriginKey = (position: Vector3) =>
      `${position.x}|${position.y}|${position.z}`;
    const harness = createHarness(bitCount, (from) => {
      if (trackMeasuredSightChecks) {
        const bitId =
          measuredBitIdBySightOrigin.get(
            toSightOriginKey(from)
          ) ?? null;
        if (bitId === null) {
          unmatchedMeasuredSightCheckCount += 1;
        } else {
          measuredSightChecksByBitId.set(
            bitId,
            (measuredSightChecksByBitId.get(bitId) ?? 0) + 1
          );
        }
      }
      return false;
    });
    try {
      harness.system.setDiagnosticsEnabled(true);
      const initialActors =
        harness.system.getFrameView().actorSpheres;
      harness.system.placeBits(
        initialActors.map(
          (actor, index) =>
            Object.freeze({
              id: actor.id,
              centerPosition: new Vector3(
                0,
                BAND_CENTER_HEIGHT,
                index * 4
              )
            })
        )
      );
      const initialTargetIdByBitId = new Map(
        initialActors.map(
          (actor, index) =>
            [
              actor.id,
              `target-selection-scheduler-budget-${index}`
            ] as const
        )
      );
      const targets = Object.freeze(
        initialActors.map((actor, index) =>
          createTarget(
            initialTargetIdByBitId.get(actor.id)!,
            new Vector3(
              0.5,
              BAND_CENTER_HEIGHT,
              index * 4
            )
          )
        )
      );
      harness.random.enqueue(
        ...Array.from({ length: bitCount * 8 }, () => 0.1)
      );
      let elapsedSeconds = 0;
      for (
        let updateIndex = 0;
        updateIndex < 6 &&
        harness.system
          .getFrameView().targetStates
          .some(({ targetId }) => targetId === null);
        updateIndex += 1
      ) {
        elapsedSeconds += 1;
        update(harness.system, 1, elapsedSeconds, targets);
      }
      const acquired = harness.system.getFrameView().targetStates;

      for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
        elapsedSeconds += 1 / 60;
        update(
          harness.system,
          1 / 60,
          elapsedSeconds,
          targets
        );
      }
      let maximumCurrentChecks = 0;
      let maximumAlternativeQueries = 0;
      let maximumChaseRoutePlans = 0;
      let maximumAutonomousChanges = 0;
      let totalCurrentChecks = 0;
      let totalAlternativeQueries = 0;
      let minimumIdentifiableBitCount = bitCount;
      for (let frameIndex = 0; frameIndex < 120; frameIndex += 1) {
        measuredBitIdBySightOrigin = new Map(
          harness.system
            .getFrameView()
            .actorSpheres.map(
              (actor) =>
                [toSightOriginKey(actor.center), actor.id] as const
            )
        );
        minimumIdentifiableBitCount = Math.min(
          minimumIdentifiableBitCount,
          measuredBitIdBySightOrigin.size
        );
        elapsedSeconds += 1 / 60;
        trackMeasuredSightChecks = true;
        update(
          harness.system,
          1 / 60,
          elapsedSeconds,
          targets
        );
        trackMeasuredSightChecks = false;
        const diagnostics =
          harness.system.getFrameView().diagnostics;
        totalCurrentChecks +=
          diagnostics.currentTargetSightCheckCount;
        totalAlternativeQueries +=
          diagnostics.personalityRetargetQueryCount;
        maximumCurrentChecks = Math.max(
          maximumCurrentChecks,
          diagnostics.currentTargetSightCheckCount
        );
        maximumAlternativeQueries = Math.max(
          maximumAlternativeQueries,
          diagnostics.personalityRetargetQueryCount
        );
        maximumChaseRoutePlans = Math.max(
          maximumChaseRoutePlans,
          diagnostics.routePlans.chase
        );
        maximumAutonomousChanges = Math.max(
          maximumAutonomousChanges,
          diagnostics.autonomousVisualTargetChangeCount
        );
      }
      elapsedSeconds += 1;
      update(harness.system, 1, elapsedSeconds, targets);
      const catchUpDiagnostics =
        harness.system.getFrameView().diagnostics;
      const nearestCount = acquired.filter(
        ({ targetSelectionPersonality }) =>
          targetSelectionPersonality === "nearest-visible"
      ).length;
      const expectedBitIds = new Set(
        acquired.map(({ bitId }) => bitId)
      );
      const measuredSightCheckCounts = [...expectedBitIds].map(
        (bitId) => measuredSightChecksByBitId.get(bitId) ?? 0
      );
      const minimumSightChecksPerBit = Math.min(
        ...measuredSightCheckCounts
      );
      const maximumSightChecksPerBit = Math.max(
        ...measuredSightCheckCounts
      );
      const measuredSeconds = 2;
      const expectedCurrentChecks =
        (bitCount * measuredSeconds) / 0.2;
      const expectedAlternativeQueries =
        nearestCount * measuredSeconds;
      const observedCurrentPeriodSeconds =
        (bitCount * measuredSeconds) / totalCurrentChecks;
      const observedAlternativePeriodSeconds =
        (nearestCount * measuredSeconds) /
        totalAlternativeQueries;
      return Object.freeze({
        name:
          "50 BIT標的選択5Hz・1Hzの全機公平性・catch-up上限",
        ok:
          acquired.length === bitCount &&
          acquired.every(
            ({ bitId, targetId, mode }) =>
              targetId === initialTargetIdByBitId.get(bitId) &&
              mode === "chase"
          ) &&
          nearestCount >= 4 &&
          maximumCurrentChecks <= 5 &&
          maximumAlternativeQueries <= 1 &&
          maximumChaseRoutePlans <= 4 &&
          maximumAutonomousChanges === 0 &&
          expectedBitIds.size === bitCount &&
          minimumIdentifiableBitCount === bitCount &&
          unmatchedMeasuredSightCheckCount === 0 &&
          measuredSightChecksByBitId.size === bitCount &&
          minimumSightChecksPerBit >= 9 &&
          maximumSightChecksPerBit <= 12 &&
          totalCurrentChecks >= expectedCurrentChecks - 5 &&
          totalCurrentChecks <= expectedCurrentChecks + 5 &&
          totalAlternativeQueries >=
            expectedAlternativeQueries - 4 &&
          totalAlternativeQueries <=
            expectedAlternativeQueries + 4 &&
          observedCurrentPeriodSeconds >= 0.19 &&
          observedCurrentPeriodSeconds <= 0.21 &&
          observedAlternativePeriodSeconds >= 0.9 &&
          observedAlternativePeriodSeconds <= 1.1 &&
          catchUpDiagnostics.currentTargetSightCheckCount <= 20 &&
          catchUpDiagnostics.personalityRetargetQueryCount <= 4 &&
          catchUpDiagnostics.routePlans.chase <= 4,
        detail:
          `acquired=${acquired.filter(({ bitId, targetId }) => targetId === initialTargetIdByBitId.get(bitId)).length}/` +
          `${bitCount},nearest=${nearestCount} / ` +
          `measured=current:${totalCurrentChecks}/${expectedCurrentChecks},` +
          `period:${observedCurrentPeriodSeconds.toFixed(3)}s,` +
          `alternative:${totalAlternativeQueries}/${expectedAlternativeQueries},` +
          `period:${observedAlternativePeriodSeconds.toFixed(3)}s,` +
          `actors:${measuredSightChecksByBitId.size}/${bitCount},` +
          `perActor:${minimumSightChecksPerBit}-${maximumSightChecksPerBit},` +
          `unmatched:${unmatchedMeasuredSightCheckCount} / ` +
          `steady=current:${maximumCurrentChecks}/5,` +
          `alternative:${maximumAlternativeQueries}/1,` +
          `route:${maximumChaseRoutePlans}/4 / ` +
          `catchUp=current:${catchUpDiagnostics.currentTargetSightCheckCount}/20,` +
          `alternative:${catchUpDiagnostics.personalityRetargetQueryCount}/4,` +
          `route:${catchUpDiagnostics.routePlans.chase}/4`
      });
    } finally {
      harness.dispose();
    }
  };

const runBitSimultaneousRetargetBudgetFairnessCheck =
  (): BitCombatIntegrationCheck => {
    const bitCount = 10;
    const routeRecords: Array<
      Readonly<{
        start: Vector3;
        destination: Vector3;
      }>
    > = [];
    let recordRoutes = false;
    const baseNavigation = createNavigation();
    const trackedNavigation = Object.freeze({
      ...baseNavigation,
      findRoute: (
        start: BitFlightLocation,
        destination: BitFlightLocation,
        policy: BitFlightRoutePolicy
      ) => {
        if (recordRoutes) {
          routeRecords.push(
            Object.freeze({
              start: getBitFlightWorldPosition(start).clone(),
              destination:
                getBitFlightWorldPosition(destination).clone()
            })
          );
        }
        return baseNavigation.findRoute(
          start,
          destination,
          policy
        );
      }
    }) as BitFlightNavigationWorld;
    const harness = createHarness(
      bitCount,
      () => false,
      false,
      false,
      () => false,
      trackedNavigation
    );
    try {
      harness.system.setDiagnosticsEnabled(true);
      const actors = harness.system.getFrameView().actorSpheres;
      harness.system.placeBits(
        actors.map((actor, index) =>
          Object.freeze({
            id: actor.id,
            centerPosition: new Vector3(
              0,
              BAND_CENTER_HEIGHT,
              index * 4
            )
          })
        )
      );
      const initialTargetIdByBitId = new Map(
        actors.map(
          (actor, index) =>
            [
              actor.id,
              `target-selection-fair-initial-${index}`
            ] as const
        )
      );
      const alternativeTargetIdByBitId = new Map(
        actors.map(
          (actor, index) =>
            [
              actor.id,
              `target-selection-fair-alternative-${index}`
            ] as const
        )
      );
      const initialTargets = Object.freeze(
        actors.map((actor, index) =>
          createTarget(
            initialTargetIdByBitId.get(actor.id)!,
            new Vector3(2.4, BAND_CENTER_HEIGHT, index * 4)
          )
        )
      );
      const alternativeTargets = Object.freeze(
        actors.map((actor, index) =>
          createTarget(
            alternativeTargetIdByBitId.get(actor.id)!,
            new Vector3(1.2, BAND_CENTER_HEIGHT, index * 4)
          )
        )
      );
      harness.random.enqueue(
        ...Array.from({ length: bitCount * 12 }, () => 0.1)
      );
      let elapsedSeconds = 1;
      update(
        harness.system,
        1,
        elapsedSeconds,
        initialTargets
      );
      const acquired = harness.system.getFrameView();
      const nearestBitIds = new Set(
        acquired.targetStates
          .filter(
            ({ targetSelectionPersonality }) =>
              targetSelectionPersonality === "nearest-visible"
          )
          .map(({ bitId }) => bitId)
      );
      const actorIndexByBitId = new Map(
        actors.map((actor, index) => [actor.id, index] as const)
      );
      const alternativeDestinationByBitId = new Map(
        actors.map(
          (actor, index) =>
            [
              actor.id,
              alternativeTargets[index].aimPosition
            ] as const
        )
      );
      const getAlternativeRouteBitId = (
        route: Readonly<{
          start: Vector3;
          destination: Vector3;
        }>
      ) => {
        for (const bitId of nearestBitIds) {
          const actorIndex = actorIndexByBitId.get(bitId)!;
          const alternativeDestination =
            alternativeDestinationByBitId.get(bitId)!;
          if (
            Math.abs(route.start.z - actorIndex * 4) <=
              POSITION_EPSILON &&
            Vector3.DistanceSquared(
              route.destination,
              alternativeDestination
            ) <=
              POSITION_EPSILON * POSITION_EPSILON
          ) {
            return bitId;
          }
        }
        return null;
      };
      const getAlternativeRouteCounts = () => {
        const counts = new Map<string, number>(
          [...nearestBitIds].map(
            (bitId) => [bitId, 0]
          )
        );
        for (const route of routeRecords) {
          const bitId = getAlternativeRouteBitId(route);
          if (bitId !== null) {
            counts.set(bitId, counts.get(bitId)! + 1);
          }
        }
        return counts;
      };
      const countAlternativeRoutes = (
        routes: readonly Readonly<{
          start: Vector3;
          destination: Vector3;
        }>[]
      ) =>
        routes.filter(
          (route) => getAlternativeRouteBitId(route) !== null
        ).length;
      const switchTargets = Object.freeze([
        ...initialTargets,
        ...alternativeTargets
      ]);
      let maximumRetargetQueries = 0;
      let maximumChaseRoutePlans = 0;
      let maximumAlternativeRoutePlans = 0;
      let totalVisualChanges = 0;
      let completedRounds = 0;
      const maximumRounds =
        Math.ceil(nearestBitIds.size / 4) + 2;
      let switchedBitIds = new Set<string>();
      recordRoutes = true;
      while (
        switchedBitIds.size < nearestBitIds.size &&
        completedRounds < maximumRounds
      ) {
        completedRounds += 1;
        elapsedSeconds += 1;
        const routeRecordCountBeforeUpdate = routeRecords.length;
        update(
          harness.system,
          1,
          elapsedSeconds,
          switchTargets
        );
        const view = harness.system.getFrameView();
        maximumRetargetQueries = Math.max(
          maximumRetargetQueries,
          view.diagnostics.personalityRetargetQueryCount
        );
        maximumChaseRoutePlans = Math.max(
          maximumChaseRoutePlans,
          view.diagnostics.routePlans.chase
        );
        maximumAlternativeRoutePlans = Math.max(
          maximumAlternativeRoutePlans,
          countAlternativeRoutes(
            routeRecords.slice(routeRecordCountBeforeUpdate)
          )
        );
        totalVisualChanges +=
          view.diagnostics.autonomousVisualTargetChangeCount;
        switchedBitIds = new Set(
          view.targetStates
            .filter(
              ({ bitId, targetId }) =>
                nearestBitIds.has(bitId) &&
                targetId ===
                  alternativeTargetIdByBitId.get(bitId)
            )
            .map(({ bitId }) => bitId)
        );
      }
      let alternativeRouteCounts =
        getAlternativeRouteCounts();
      let synchronizationUpdates = 0;
      const maximumSynchronizationUpdates =
        Math.ceil(bitCount / 4) + 2;
      let synchronized = harness.system.getFrameView();
      while (
        [...alternativeRouteCounts.values()].some(
          (count) => count === 0
        ) &&
        synchronizationUpdates < maximumSynchronizationUpdates
      ) {
        synchronizationUpdates += 1;
        elapsedSeconds += 0.01;
        const routeRecordCountBeforeUpdate = routeRecords.length;
        update(
          harness.system,
          0.01,
          elapsedSeconds,
          switchTargets
        );
        synchronized = harness.system.getFrameView();
        maximumChaseRoutePlans = Math.max(
          maximumChaseRoutePlans,
          synchronized.diagnostics.routePlans.chase
        );
        maximumAlternativeRoutePlans = Math.max(
          maximumAlternativeRoutePlans,
          countAlternativeRoutes(
            routeRecords.slice(routeRecordCountBeforeUpdate)
          )
        );
        alternativeRouteCounts =
          getAlternativeRouteCounts();
      }
      const alternativeRouteDetail =
        [...alternativeRouteCounts]
          .sort(([left], [right]) =>
            left.localeCompare(right)
          )
          .map(([bitId, count]) => `${bitId}:${count}`)
          .join(",");
      return Object.freeze({
        name:
          "BIT複数同時1Hz切替を探索4件・経路4件で公平完了",
        ok:
          acquired.targetStates.length === bitCount &&
          acquired.targetStates.every(
            ({ bitId, targetId, mode }) =>
              targetId === initialTargetIdByBitId.get(bitId) &&
              mode === "chase"
          ) &&
          nearestBitIds.size >= 4 &&
          switchedBitIds.size === nearestBitIds.size &&
          completedRounds <= maximumRounds &&
          maximumRetargetQueries <= 4 &&
          maximumChaseRoutePlans <= 4 &&
          maximumAlternativeRoutePlans <= 4 &&
          synchronizationUpdates <=
            maximumSynchronizationUpdates &&
          alternativeRouteCounts.size === nearestBitIds.size &&
          [...alternativeRouteCounts.values()].every(
            (count) => count === 1
          ) &&
          countAlternativeRoutes(routeRecords) ===
            nearestBitIds.size &&
          synchronized.targetStates.every(
            ({ bitId, targetId }) =>
              nearestBitIds.has(bitId)
                ? targetId ===
                  alternativeTargetIdByBitId.get(bitId)
                : targetId === initialTargetIdByBitId.get(bitId)
          ),
        detail:
          `nearest=${nearestBitIds.size} / ` +
          `switched=${switchedBitIds.size}/${nearestBitIds.size} / ` +
          `rounds=${completedRounds}/${maximumRounds} / ` +
          `max=query:${maximumRetargetQueries}/4,` +
          `route:${maximumChaseRoutePlans}/4,` +
          `alternativeRoute:${maximumAlternativeRoutePlans}/4 / ` +
          `routeSync=${synchronizationUpdates}/` +
          `${maximumSynchronizationUpdates}:` +
          `${alternativeRouteDetail} / ` +
          `visualChanges=${totalVisualChanges}`
      });
    } finally {
      harness.dispose();
    }
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
      completePendingBitSpawnVisuals(
        harness.system,
        targets,
        Object.freeze([alert])
      );
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
      update(harness.system, 0.1, 1.6, targets);
      update(harness.system, 0.1, 1.7, targets);

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
      const enrolledReceiverIds = new Set(
        harness.system
          .getFrameView().targetStates
          .filter((state) => state.mode === "alert-receive")
          .map((state) => state.bitId)
      );
      const firstRequests = harness.system.takeAlertRequests();
      const spawnCompletedElapsedSeconds = completePendingBitSpawnVisuals(
        harness.system,
        Object.freeze([firstTarget])
      );
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
      for (const receiver of startedStates.filter(
        (state) => state.mode === "alert-receive"
      )) {
        enrolledReceiverIds.add(receiver.bitId);
      }
      const receiverCount = enrolledReceiverIds.size;
      const freeState = startedStates.find(
        (state) =>
          state.mode === "search" && state.targetId === null
      );

      update(
        harness.system,
        0.1,
        spawnCompletedElapsedSeconds + 0.1,
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
        spawnCompletedElapsedSeconds + 0.2,
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
          `provenance=${afterConcurrentAttempt?.provenance ?? "none"} / ` +
          `leader=${leader.mode} / firstRequests=${firstRequests.length} / ` +
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
    let sightBlocked = false;
    const harness = createHarness(
      2,
      () => sightBlocked,
      false,
      false,
      (from, to) =>
        Math.abs(from.y - to.y) <= POSITION_EPSILON &&
        Vector3.Distance(from, to) >
          ALERT_SPAWN_RADIUS + POSITION_EPSILON
    );
    try {
      const initialActorIds = new Set(
        harness.system
          .getFrameView().actorSpheres
          .map((actor) => actor.id)
      );
      const origin = harness.system.getFrameView().flightStates[0].position;
      const target = createTarget(
        "internal-alert-range-target",
        origin.add(new Vector3(1, 0, 0))
      );
      const leader = acquireInternalAlert(harness, target, 2);
      sightBlocked = true;
      const spawnCompletedElapsedSeconds = completePendingBitSpawnVisuals(
        harness.system,
        Object.freeze([target])
      );
      const participantIds = harness.system
        .getFrameView().targetStates
        .filter(
          (state) =>
            state.mode === "alert-send" ||
            state.mode === "alert-receive"
        )
        .map((state) => state.bitId);
      const spawnedActorId = harness.system
        .getFrameView().actorSpheres
        .find((actor) => !initialActorIds.has(actor.id))?.id;
      const movedTarget = createTarget(
        target.id,
        origin.add(new Vector3(4.1, 0, 0))
      );
      update(
        harness.system,
        0,
        spawnCompletedElapsedSeconds,
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
          spawnedActorId !== undefined &&
          participantIds.includes(spawnedActorId) &&
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

const createCarpetHarness = (
  scatterRoll = 0.5,
  modeMuzzleColorEnabled = false
) => {
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
    },
    null,
    modeMuzzleColorEnabled
  );
  const origin = harness.system.getFrameView().flightStates[0].position;
  const target = createTarget(
    "carpet-integration-target",
    origin.add(new Vector3(2, 0, 0))
  );
  harness.random.enqueue(0.95, 0.5, 0.5, scatterRoll);
  update(harness.system, 0, 0, Object.freeze([target]));
  update(harness.system, 0, 0, Object.freeze([target]));
  const spawnCompletedElapsedSeconds = completePendingBitSpawnVisuals(
    harness.system,
    Object.freeze([target])
  );
  const state = harness.system.getFrameView().targetStates[0];
  movementSweeps.length = 0;
  return Object.freeze({
    harness,
    target,
    state,
    spawnCompletedElapsedSeconds,
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
      spawnCompletedElapsedSeconds,
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
        spawnCompletedElapsedSeconds + 0.5,
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
    const {
      harness,
      target,
      state,
      spawnCompletedElapsedSeconds
    } =
      createCarpetHarness(scatterRoll);
    try {
      const before = harness.system
        .getFrameView().flightStates
        .find((flight) => flight.bitId === state.bitId) ?? null;
      const deltaSeconds = 0.05;
      update(
        harness.system,
        deltaSeconds,
        spawnCompletedElapsedSeconds + deltaSeconds,
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
      const spawnCompletedElapsedSeconds = completePendingBitSpawnVisuals(
        harness.system,
        Object.freeze([target])
      );
      const lockedDirections = new Map<string, Vector3>();
      for (const bit of harness.system.getFrameView().targetStates) {
        if (bit.mode !== "carpet-leader") {
          continue;
        }
        const forward = getBitForward(harness, bit.bitId);
        if (forward) {
          lockedDirections.set(bit.bitId, forward);
        }
      }
      update(
        harness.system,
        V2_BIT_CARPET_FIRE_INTERVAL_SECONDS,
        spawnCompletedElapsedSeconds +
          V2_BIT_CARPET_FIRE_INTERVAL_SECONDS,
        Object.freeze([target])
      );
      const targetStates = harness.system.getFrameView().targetStates;
      for (const bit of targetStates) {
        if (lockedDirections.has(bit.bitId)) {
          continue;
        }
        const forward = getBitForward(harness, bit.bitId);
        if (forward) {
          lockedDirections.set(bit.bitId, forward);
        }
      }

      update(
        harness.system,
        V2_BIT_FIRE_TELEGRAPH_SECONDS,
        spawnCompletedElapsedSeconds +
          V2_BIT_CARPET_FIRE_INTERVAL_SECONDS +
          V2_BIT_FIRE_TELEGRAPH_SECONDS,
        Object.freeze([target])
      );
      const requests = harness.system.getFrameView().beamRequests;
      const lockedDirectionDots = requests.map((request) => {
        const lockedDirection =
          lockedDirections.get(request.sourceId) ?? null;
        return lockedDirection === null
          ? Number.NaN
          : Vector3.Dot(request.direction, lockedDirection);
      });
      const allDirectionsLocked =
        requests.length === 3 &&
        lockedDirectionDots.every(
          (dot) => dot >= 1 - POSITION_EPSILON
        );
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
          `dots=${lockedDirectionDots
            .map((dot) => dot.toFixed(6))
            .join(",")} / ` +
          `individual=${usesIndividualDirections}`
      });
    } finally {
      harness.dispose();
    }
  };

const runCarpetFormationFadeCheck =
  (): BitCombatIntegrationCheck => {
    const {
      harness,
      target,
      state,
      spawnCompletedElapsedSeconds
    } = createCarpetHarness();
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
            body instanceof InstancedMesh &&
            !body.isDisposed() &&
            Math.abs(body.instancedBuffers.color.a - 1) <=
              POSITION_EPSILON
        );

      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        spawnCompletedElapsedSeconds +
          CARPET_FOLLOWER_FADE_SECONDS / 2,
        Object.freeze([target])
      );
      const halfVisible = followerBodies.every(
        (body) =>
          body instanceof InstancedMesh &&
          !body.isDisposed() &&
          Math.abs(body.instancedBuffers.color.a - 0.5) <=
            POSITION_EPSILON
      );
      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        spawnCompletedElapsedSeconds + CARPET_FOLLOWER_FADE_SECONDS,
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
      spawnCompletedElapsedSeconds,
      setMovementBlocked
    } = createCarpetHarness();
    try {
      setMovementBlocked(true);
      update(
        harness.system,
        0.1,
        spawnCompletedElapsedSeconds + 0.1,
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
        spawnCompletedElapsedSeconds + 0.2,
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
  const {
    harness,
    target,
    state,
    spawnCompletedElapsedSeconds
  } = createCarpetHarness();
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
        spawnCompletedElapsedSeconds + elapsedSeconds,
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
  const {
    harness,
    target,
    state,
    spawnCompletedElapsedSeconds
  } = createCarpetHarness();
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
        spawnCompletedElapsedSeconds + elapsedSeconds,
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
    const {
      harness,
      target,
      state,
      spawnCompletedElapsedSeconds
    } = createCarpetHarness(0.5, true);
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
      const followerMuzzle = follower
        ? harness.scene.getMeshByName(`${follower.bitId}_muzzle`)
        : null;
      const materialCountBefore = harness.scene.materials.length;
      const followerColorBefore =
        followerMuzzle instanceof InstancedMesh
          ? followerMuzzle.instancedBuffers.color
          : null;
      const after = harness.system.getFrameView().targetStates;
      const leader = after.find(
        (candidate) => candidate.bitId === state.bitId
      );
      const remainingFollowers = after.filter(
        (candidate) => candidate.mode === "carpet-follower"
      );
      const visibleImmediately =
        followerBody instanceof InstancedMesh &&
        !followerBody.isDisposed() &&
        Math.abs(followerBody.instancedBuffers.color.a - 1) <=
          POSITION_EPSILON;
      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        spawnCompletedElapsedSeconds +
          CARPET_FOLLOWER_FADE_SECONDS / 2,
        Object.freeze([target])
      );
      const halfVisible =
        followerBody instanceof InstancedMesh &&
        !followerBody.isDisposed() &&
        Math.abs(followerBody.instancedBuffers.color.a - 0.5) <=
          POSITION_EPSILON &&
        followerMuzzle instanceof InstancedMesh &&
        !followerMuzzle.isDisposed() &&
        colorsApproximatelyEqual(
          followerMuzzle.instancedBuffers.color,
          new Color4(0.58, 0.25, 1, 0.5)
        ) &&
        harness.scene.materials.length === materialCountBefore;
      update(
        harness.system,
        CARPET_FOLLOWER_FADE_SECONDS / 2,
        spawnCompletedElapsedSeconds + CARPET_FOLLOWER_FADE_SECONDS,
        Object.freeze([target])
      );
      const disposedAfterFade =
        followerBody !== null &&
        followerBody.isDisposed() &&
        followerMuzzle !== null &&
        followerMuzzle.isDisposed() &&
        harness.scene.materials.length === materialCountBefore;
      return Object.freeze({
        name: "carpet follower被弾は論理即除外・表示1秒fadeでleaderは継続",
        ok:
          followers.length === 2 &&
          accepted &&
          after.length === before.length - 1 &&
          remainingFollowers.length === 1 &&
          leader?.mode === "carpet-leader" &&
          followerColorBefore instanceof Color4 &&
          colorsApproximatelyEqual(
            followerColorBefore,
            V2_BIT_MUZZLE_COLOR_BY_MODE["carpet-follower"]
          ) &&
          visibleImmediately &&
          halfVisible &&
          disposedAfterFade,
        detail:
          `before=${before.length} / after=${after.length} / ` +
          `followers=${followers.length}->${remainingFollowers.length} / ` +
          `leader=${leader?.mode ?? "missing"} / accepted=${accepted} / ` +
          `fade=${visibleImmediately}/${halfVisible}/${disposedAfterFade} / ` +
          `materials=${materialCountBefore}/${harness.scene.materials.length}`
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

const colorsApproximatelyEqual = (left: Color4, right: Color4): boolean =>
  Math.abs(left.r - right.r) <= 1.0e-6 &&
  Math.abs(left.g - right.g) <= 1.0e-6 &&
  Math.abs(left.b - right.b) <= 1.0e-6 &&
  Math.abs(left.a - right.a) <= 1.0e-6;

const runBitMuzzleColorContractCheck = (): BitCombatIntegrationCheck => {
  const disabled = createHarness(1, () => true);
  const red = createHarness(1, () => true, true);
  const enabled = createHarness(
    1,
    () => true,
    false,
    false,
    () => false,
    null,
    true
  );
  try {
    const modes: readonly V2BitMode[] = Object.freeze([
      "search",
      "chase",
      "fixed",
      "random",
      "alert-send",
      "alert-receive",
      "hold",
      "carpet-leader",
      "carpet-follower"
    ]);
    const expected = Object.freeze({
      search: new Color4(0, 0, 0, 1),
      chase: new Color4(0.18, 0.9, 0.28, 1),
      fixed: new Color4(0.2, 0.9, 0.95, 1),
      random: new Color4(0.95, 0.85, 0.2, 1),
      "alert-send": new Color4(1, 0.6, 0.15, 1),
      "alert-receive": new Color4(0.2, 0.45, 1, 1),
      hold: new Color4(1, 1, 1, 1),
      "carpet-leader": new Color4(1, 0.25, 0.9, 1),
      "carpet-follower": new Color4(0.58, 0.25, 1, 1)
    } satisfies Readonly<Record<V2BitMode, Color4>>);
    const black = expected.search;
    const disabledMuzzle = disabled.scene.getMeshByName(
      `${disabled.system.getFrameView().targetStates[0].bitId}_muzzle`
    );
    const enabledMuzzle = enabled.scene.getMeshByName(
      `${enabled.system.getFrameView().targetStates[0].bitId}_muzzle`
    );
    const redMuzzle = red.scene.getMeshByName(
      `${red.system.getFrameView().targetStates[0].bitId}_muzzle`
    );
    const disabledColor =
      disabledMuzzle instanceof InstancedMesh
        ? disabledMuzzle.instancedBuffers.color
        : null;
    const enabledColor =
      enabledMuzzle instanceof InstancedMesh
        ? enabledMuzzle.instancedBuffers.color
        : null;
    red.system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: Object.freeze([]),
      externalAlerts: EMPTY_ALERTS
    });
    const redColor =
      redMuzzle instanceof InstancedMesh
        ? redMuzzle.instancedBuffers.color
        : null;
    const bodySource = disabled.scene.getMeshByName("v2BitBodySource");
    const redBodySource = disabled.scene.getMeshByName("v2RedBitBodySource");
    const muzzleSource = disabled.scene.getMeshByName("v2BitMuzzleSource");
    const depthContract =
      bodySource instanceof Mesh &&
      redBodySource instanceof Mesh &&
      muzzleSource instanceof Mesh &&
      bodySource.hasVertexAlpha &&
      redBodySource.hasVertexAlpha &&
      muzzleSource.hasVertexAlpha &&
      bodySource.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
      redBodySource.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
      muzzleSource.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
      (bodySource.material as StandardMaterial).forceDepthWrite &&
      (redBodySource.material as StandardMaterial).forceDepthWrite &&
      (muzzleSource.material as StandardMaterial).forceDepthWrite;
    const disabledContract = modes.every((mode) =>
      colorsApproximatelyEqual(resolveV2BitMuzzleColor(mode, false, false), black)
    );
    const enabledContract = modes.every(
      (mode) =>
        colorsApproximatelyEqual(
          resolveV2BitMuzzleColor(mode, true, false),
          expected[mode]
        ) &&
        colorsApproximatelyEqual(V2_BIT_MUZZLE_COLOR_BY_MODE[mode], expected[mode])
    );
    disabled.system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: Object.freeze([]),
      externalAlerts: EMPTY_ALERTS
    });
    enabled.system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: Object.freeze([]),
      externalAlerts: EMPTY_ALERTS
    });
    const colorReferencesStable =
      disabledMuzzle instanceof InstancedMesh &&
      enabledMuzzle instanceof InstancedMesh &&
      disabledMuzzle.instancedBuffers.color === disabledColor &&
      enabledMuzzle.instancedBuffers.color === enabledColor;
    return Object.freeze({
      name: "BIT機体は空間距離順＋深度write・通常先端黒・赤BIT先端赤・デバッグ9色",
      ok:
        disabledColor instanceof Color4 &&
        enabledColor instanceof Color4 &&
        redColor instanceof Color4 &&
        colorsApproximatelyEqual(disabledColor, black) &&
        colorsApproximatelyEqual(enabledColor, black) &&
        colorsApproximatelyEqual(redColor, V2_BIT_MUZZLE_RED) &&
        disabledContract &&
        enabledContract &&
        colorReferencesStable &&
        depthContract,
      detail:
        `instance=${disabledColor instanceof Color4}/${enabledColor instanceof Color4} / ` +
        `disabled=${disabledContract} / enabled=${enabledContract} / ` +
        `red=${redColor instanceof Color4} / stable=${colorReferencesStable} / ` +
        `depth=${depthContract}`
    });
  } finally {
    disabled.dispose();
    red.dispose();
    enabled.dispose();
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

const runSingleBitRelocationCheck =
  (): BitCombatIntegrationCheck => {
    const harness = createHarness(1, () => true);
    try {
      const previousView = harness.system.getFrameView();
      const actor = previousView.actorSpheres[0];
      const requested = actor.center.add(new Vector3(0.4, 0, 0));
      const relocated = harness.system.relocateBit(
        actor.id,
        Object.freeze([requested])
      );
      const currentView = harness.system.getFrameView();
      const currentActor = currentView.actorSpheres[0];
      const flight = currentView.flightStates[0];
      return Object.freeze({
        name: "単一BIT搬送で安全帯位置と経路状態を同期再初期化",
        ok:
          currentView !== previousView &&
          relocated.equals(currentActor.center) &&
          Vector3.DistanceSquared(relocated, requested) <= 1e-12 &&
          flight.routePurpose === null &&
          flight.activeTransition === null &&
          flight.agentState === "idle",
        detail:
          `position=${relocated.toString()} / ` +
          `route=${flight.routePurpose} / transition=${flight.activeTransition?.id ?? "none"} / agent=${flight.agentState}`
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
      runStartupGraceSuspensionCheck(),
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
      runBitCurrentTargetSightScheduleCheck(),
      runBitTargetSelectionPersonalityCheck(),
      runBitTargetSelectionTieOrderCheck(),
      runBitCurrentAndAlternativeSightShareRayCheck(),
      runBitRetargetCooldownSurvivesCandidateSetShrinkCheck(),
      runBitTargetlessPriorityDoesNotStarveCurrentSightChecks(),
      runBitTargetSelectionSchedulerBudgetCheck(),
      runBitSimultaneousRetargetBudgetFairnessCheck(),
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
      runSingleBitRelocationCheck(),
      runLazyFlightStatesFrameViewCheck(),
      runFrameViewAndSharedGeometryCheck(),
      runBitMuzzleColorContractCheck()
    ]);
