import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import schoolGlbUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.glb?url";
import schoolNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin?url";
import schoolBitNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin?url";
import schoolRoomVariantNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin?url";
import {
  BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND
} from "../../../src/world/bitFlightAgent";
import {
  encodeBitFlightNavBundle
} from "../../../src/world/bitFlightNavBundle";
import {
  BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS
} from "../../../src/world/bitFlightSafety";
import {
  createBitFlightNavigationWorld,
  type BitFlightBand,
  type BitFlightBandRef,
  type BitFlightNavMeshPayload,
  type BitFlightNavigationDefinition,
  type BitFlightNavigationWorld
} from "../../../src/world/bitFlightNavigation";
import {
  SCHOOL_STAGE,
  type StageCatalogEntry
} from "../../../src/world/stageCatalog";
import {
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicSpatialInitializer
} from "../../../src/world/schoolStageDynamicRuntime";
import { createStageNpcSpawnSampler } from "../../../src/world/stageSpawnSampler";
import {
  canStageMoverUseLink,
  STAGE_LINK_KINDS,
  type StageLinkRegistry
} from "../../../src/world/stageLinks";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import type {
  SpatialSphereSweepHit,
  StageSpatialQueries,
  StageVolume
} from "../../../src/world/stageSpatialQueries";
import {
  createV2BitSystem,
  type V2BitFlightState,
  type V2BitSystem
} from "../../../src/v2/bitSystem";
import { SCHOOL_PLAYER_SPAWN_IDS } from "../../../src/v2/schoolSpawnSelection";
import type {
  V2ExternalAlert,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import {
  createFixtureBitSpawnRandom,
  createFixtureCenteredBitSpawnRandom,
  createFixturePlayerSpawn,
  createFixturePlayerSpawnRegistry,
  createFixtureSpawnRoleStage,
  requireFirstFixturePlayerSpawn
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

export type BitSystemAcceptanceCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

export type BitSystemAcceptanceMetric = Readonly<{
  label: string;
  value: string;
}>;

export type BitSystemAcceptanceFixture = Readonly<{
  scene: Scene;
  navigation: BitFlightNavigationWorld;
  definition: BitFlightNavigationDefinition;
  payloads: readonly BitFlightNavMeshPayload[];
  courtyardRef: BitFlightBandRef;
  concourseRef: BitFlightBandRef;
  mezzanineRef: BitFlightBandRef;
  pointInBand(ref: BitFlightBandRef, x: number, z: number): Vector3;
}>;

export type BitSystemAcceptanceResult = Readonly<{
  checks: readonly BitSystemAcceptanceCheck[];
  metrics: readonly BitSystemAcceptanceMetric[];
}>;

export type BitSystemAcceptanceMode = "all" | "core" | "school";

type QueuedRandom = Readonly<{
  random(): number;
  enqueue(...values: readonly number[]): void;
}>;

type FixtureStage = Readonly<{
  stage: StageSpatialContext;
  dispose(): void;
}>;

type DynamicBitBlockerMode =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "point"; center: Vector3 }>
  | Readonly<{ kind: "all-segments" }>;

type DynamicBitRevisionFixtureStage = FixtureStage &
  Readonly<{
    setPointBlocker(center: Vector3): void;
    setAllSegmentsBlocked(): void;
    clearBlocker(): void;
    getRevision(): number;
    getStageLinkAccessCount(): number;
  }>;

type SceneResourceCounts = Readonly<{
  meshes: number;
  materials: number;
  transformNodes: number;
  textures: number;
  spriteManagers: number;
}>;

type LoaderFixtureAssets = Readonly<{
  catalog: StageCatalogEntry;
  glb: Uint8Array;
  humanNavmesh: Uint8Array;
  bitNavmesh: Uint8Array;
}>;

type LoaderWorldBoundaryVariant =
  | "valid"
  | "missing"
  | "duplicate"
  | "invalid-extras"
  | "outside-stage";

type LoaderNpcSpawnBiasVariant =
  | "valid"
  | "missing-player-spawn-id"
  | "missing-weight"
  | "minimum-weight"
  | "maximum-weight"
  | "below-minimum-weight"
  | "above-maximum-weight"
  | "zero-weight"
  | "negative-weight"
  | "string-weight"
  | "unexpected-property"
  | "orphan-player-spawn"
  | "outside-npc-spawn"
  | "duplicate-id"
  | "same-player-overlap"
  | "same-player-face-touch"
  | "same-player-horizontal-face-touch"
  | "same-player-disjoint"
  | "different-player-overlap";

const toStageRelativeAssetUrl = (url: string) =>
  url.startsWith("/") ? url.slice(1) : url;

const SCHOOL_VALIDATION_STAGE: StageCatalogEntry = Object.freeze({
  ...SCHOOL_STAGE,
  glbUrl: toStageRelativeAssetUrl(schoolGlbUrl),
  navmeshUrl: toStageRelativeAssetUrl(schoolNavmeshUrl),
  bitNavmeshUrl: toStageRelativeAssetUrl(schoolBitNavmeshUrl),
  roomVariantNavmesh: Object.freeze({
    mode: "required",
    url: toStageRelativeAssetUrl(schoolRoomVariantNavmeshUrl),
    sha256: "c5d9bd4a021370006a4c9d380ea938720719b2908c2d83ae4509720ccac74c4c"
  })
});

const ONE_BIT_BEHAVIOR_RANDOM = Object.freeze([
  0,
  0,
  0.5
] as const);

const EMPTY_TARGETS: readonly V2HumanTargetSnapshot[] = Object.freeze([]);
const EMPTY_ALERTS: readonly V2ExternalAlert[] = Object.freeze([]);
const MICRO_DELTA_SECONDS = 0.01;
const NORMAL_PATROL_SPEED = 0.3;
const SEARCH_VERTICAL_SPEED = 0.06;
const BOB_AMPLITUDE = 0.03;
const PERFORMANCE_DELTA_SECONDS = 1 / 60;
const PERFORMANCE_WARMUP_TICKS = 180;
const PERFORMANCE_MEASURED_TICKS = 600;
const PERFORMANCE_BRUTE_FORCE_MEASURED_TICKS = 600;
const BRUTE_FORCE_START_SECONDS_FOR_ACCEPTANCE = 40;
const PERFORMANCE_P95_BUDGET_MILLISECONDS = 1000 / 60;
const PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS = 50;
const PERFORMANCE_TARGET_LOSS_BUDGET_MILLISECONDS = 125;
const PERFORMANCE_TARGET_LOSS_SETTLE_TICKS = 1200;
const PERFORMANCE_TARGET_LOSS_RECOVERY_TICKS = 30;
const PERFORMANCE_TARGET_LOSS_FOLLOW_UP_TICKS = 60;
const PERFORMANCE_SIGHT_CHECK_INTERVAL_SECONDS = 0.2;
const PERFORMANCE_SIGHT_CASTS_PER_99_UPDATE = 9;
const PERFORMANCE_SIGHT_CATCH_UP_MAXIMUM = 20;
const PERFORMANCE_STRESS_BIT_COUNT = 99;
const EXTERNAL_ALERT_RECEIVER_LIMIT = 4;

let nextFixtureStageIndex = 0;

const createQueuedRandom = (
  initialValues: readonly number[] = Object.freeze([])
): QueuedRandom => {
  const queue = [...initialValues];
  return Object.freeze({
    random: () => queue.shift() ?? 0.5,
    enqueue: (...values: readonly number[]) => {
      queue.push(...values);
    }
  });
};

const toSightOriginKey = (position: Vector3) =>
  `${position.x}|${position.y}|${position.z}`;

const createFixtureStage = (
  scene: Scene,
  navigation: BitFlightNavigationWorld,
  band: BitFlightBandRef,
  center: Vector3,
  isSightBlocked: (from: Vector3, to: Vector3) => boolean,
  size: Readonly<{
    width: number;
    height: number;
    depth: number;
  }> = Object.freeze({ width: 0.04, height: 0.1, depth: 0.04 })
): FixtureStage => {
  const fixtureIndex = nextFixtureStageIndex;
  nextFixtureStageIndex += 1;
  const mesh = MeshBuilder.CreateBox(
    `BitAcceptanceSpawn_${fixtureIndex}`,
    { width: size.width, height: size.height, depth: size.depth },
    scene
  );
  mesh.position.copyFrom(center);
  mesh.computeWorldMatrix(true);
  const volume: StageVolume = Object.freeze({
    id: `bit-acceptance-spawn-${fixtureIndex}`,
    role: "bit_spawn",
    bitFlightBand: band,
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh
  });
  const playerSpawn = createFixturePlayerSpawn(
    `bit-acceptance-player-spawn-${fixtureIndex}`,
    mesh
  );
  const stage = Object.freeze({
    bitNavigation: navigation,
    navigationAreas: createFixtureNavigationAreas(),
    playerSpawns: createFixturePlayerSpawnRegistry(playerSpawn),
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
      castSightSegment: (from: Vector3, to: Vector3) =>
        isSightBlocked(from, to) ? Object.freeze({ blocked: true }) : null,
      sampleGround: () => null,
      containsVolume: () => false,
      containsVolumeById: () => false,
      dispose: () => {}
    })
  }) as unknown as StageSpatialContext;
  return Object.freeze({
    stage,
    dispose: () => mesh.dispose(false, false)
  });
};

const DYNAMIC_BIT_BLOCKER_RADIUS = 0.02;

const findSegmentPointFraction = (
  from: Vector3,
  to: Vector3,
  point: Vector3,
  expandedRadius: number
) => {
  const segment = to.subtract(from);
  const segmentLengthSquared = segment.lengthSquared();
  const fraction =
    segmentLengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            Vector3.Dot(point.subtract(from), segment) /
              segmentLengthSquared
          )
        );
  const closest = from.add(segment.scale(fraction));
  return Vector3.DistanceSquared(closest, point) <=
    expandedRadius * expandedRadius
    ? Object.freeze({ fraction, closest })
    : null;
};

const createDynamicBitRevisionFixtureStage = (
  scene: Scene,
  navigation: BitFlightNavigationWorld,
  band: BitFlightBandRef,
  center: Vector3
): DynamicBitRevisionFixtureStage => {
  const fixtureIndex = nextFixtureStageIndex;
  nextFixtureStageIndex += 1;
  const spawnMesh = MeshBuilder.CreateBox(
    `BitDynamicRevisionSpawn_${fixtureIndex}`,
    { width: 0.04, height: 0.1, depth: 0.04 },
    scene
  );
  spawnMesh.position.copyFrom(center);
  spawnMesh.computeWorldMatrix(true);
  const blockerMesh = MeshBuilder.CreateBox(
    `BitDynamicRevisionBlocker_${fixtureIndex}`,
    {
      width: DYNAMIC_BIT_BLOCKER_RADIUS * 2,
      height: DYNAMIC_BIT_BLOCKER_RADIUS * 2,
      depth: DYNAMIC_BIT_BLOCKER_RADIUS * 2
    },
    scene
  );
  blockerMesh.setEnabled(false);
  const volume: StageVolume = Object.freeze({
    id: `bit-dynamic-revision-spawn-${fixtureIndex}`,
    role: "bit_spawn",
    bitFlightBand: band,
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh: spawnMesh
  });
  const playerSpawn = createFixturePlayerSpawn(
    `bit-dynamic-revision-player-spawn-${fixtureIndex}`,
    spawnMesh
  );
  let revision = 0;
  let blockerMode: DynamicBitBlockerMode = Object.freeze({ kind: "none" });
  let stageLinkAccessCount = 0;

  const createSweepHit = (
    from: Vector3,
    to: Vector3,
    fraction: number,
    centerAtHit: Vector3,
    blockerCenter: Vector3
  ): SpatialSphereSweepHit => {
    const normal = centerAtHit.subtract(blockerCenter);
    if (normal.lengthSquared() === 0) {
      normal.copyFrom(Vector3.Up());
    } else {
      normal.normalize();
    }
    return Object.freeze({
      point: blockerCenter.clone(),
      normal,
      distance: Vector3.Distance(from, centerAtHit),
      mesh: blockerMesh,
      center: centerAtHit,
      fraction
    });
  };

  const queries: StageSpatialQueries = {
    get revision() {
      return revision;
    },
    castMovementSegment: () => null,
    castMovementSphere: (moverKind, from, to, radius) => {
      if (moverKind !== "bit" || blockerMode.kind === "none") {
        return null;
      }
      if (blockerMode.kind === "all-segments") {
        if (from.equals(to)) {
          return null;
        }
        const fraction = 0.5;
        const centerAtHit = Vector3.Lerp(from, to, fraction);
        return createSweepHit(
          from,
          to,
          fraction,
          centerAtHit,
          centerAtHit
        );
      }
      const intersection = findSegmentPointFraction(
        from,
        to,
        blockerMode.center,
        radius + DYNAMIC_BIT_BLOCKER_RADIUS
      );
      return intersection
        ? createSweepHit(
            from,
            to,
            intersection.fraction,
            intersection.closest,
            blockerMode.center
          )
        : null;
    },
    castBeamSegment: () => null,
    castSightSegment: () => null,
    sampleGround: () => null,
    containsVolume: () => false,
    containsVolumeById: () => false,
    intersectsVolumeSegmentById: () => false,
    intersectsVolumeById: () => false,
    findContainingBlocker: () => null,
    dispose: () => {}
  };
  const links: StageLinkRegistry = {
    get all() {
      stageLinkAccessCount += 1;
      return Object.freeze([]);
    },
    getById: () => {
      stageLinkAccessCount += 1;
      return null;
    },
    getByKind: () => {
      stageLinkAccessCount += 1;
      return Object.freeze([]);
    }
  };
  const stage = Object.freeze({
    bitNavigation: navigation,
    navigationAreas: createFixtureNavigationAreas(),
    playerSpawns: createFixturePlayerSpawnRegistry(playerSpawn),
    volumes: Object.freeze({
      all: Object.freeze([volume]),
      getById: (id: string) => (id === volume.id ? volume : null),
      getByRole: (role: StageVolume["role"]) =>
        role === "bit_spawn"
          ? Object.freeze([volume])
          : Object.freeze([])
    }),
    links,
    worldBoundary: null,
    queries
  }) as unknown as StageSpatialContext;

  const advanceRevision = (nextMode: DynamicBitBlockerMode) => {
    blockerMode = nextMode;
    revision += 1;
  };
  return Object.freeze({
    stage,
    setPointBlocker: (blockerCenter: Vector3) => {
      blockerMesh.position.copyFrom(blockerCenter);
      blockerMesh.computeWorldMatrix(true);
      blockerMesh.setEnabled(true);
      advanceRevision(
        Object.freeze({
          kind: "point" as const,
          center: blockerCenter.clone()
        })
      );
    },
    setAllSegmentsBlocked: () => {
      blockerMesh.setEnabled(false);
      advanceRevision(Object.freeze({ kind: "all-segments" as const }));
    },
    clearBlocker: () => {
      blockerMesh.setEnabled(false);
      advanceRevision(Object.freeze({ kind: "none" as const }));
    },
    getRevision: () => revision,
    getStageLinkAccessCount: () => stageLinkAccessCount,
    dispose: () => {
      blockerMesh.dispose(false, false);
      spawnMesh.dispose(false, false);
    }
  });
};

const createSystem = (
  scene: Scene,
  stage: StageSpatialContext,
  random: () => number,
  initialBitCount = 1,
  minimumSpawnDistance = 0,
  spawnRandom: () => number =
    initialBitCount === 1
      ? createFixtureCenteredBitSpawnRandom()
      : createFixtureBitSpawnRandom(0x5405_1000 ^ initialBitCount)
) => {
  const system = createV2BitSystem(scene, stage, {
    combatEnabled: false,
    modeMuzzleColorEnabled: false,
    showGroundShadows: false,
    initialBitCount,
    reinforcementIntervalSeconds: 10,
    maximumBitCount: initialBitCount,
    minimumSpawnDistance,
    spawnMaxAttempts: initialBitCount === 1 ? 8 : 1024,
    spawnProjectionMaxDistance: initialBitCount === 1 ? 0.35 : 0.75,
    random,
    spawnRandom,
    playerSpawn: requireFirstFixturePlayerSpawn(stage),
    resolveTargetNavigationArea: (target: V2HumanTargetSnapshot) =>
      Object.freeze({
        targetId: target.id,
        areaId: "fixture-area",
        revision: 0,
        anchor: target.footPosition.clone()
      })
  });
  system.prepareForScriptedPhase();
  return system;
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

type ExternalAlertStressFixture = Readonly<{
  targets: readonly V2HumanTargetSnapshot[];
  alerts: readonly V2ExternalAlert[];
  targetIds: ReadonlySet<string>;
}>;

const createExternalAlertStressFixture = (
  prefix: string,
  aimPosition: Vector3,
  bitCount = PERFORMANCE_STRESS_BIT_COUNT
): ExternalAlertStressFixture => {
  const targetCount = Math.ceil(
    bitCount / EXTERNAL_ALERT_RECEIVER_LIMIT
  );
  const targets = Object.freeze(
    Array.from({ length: targetCount }, (_, index) =>
      createTarget(
        `${prefix}-target-${index}`,
        aimPosition.clone()
      )
    )
  );
  return Object.freeze({
    targets,
    alerts: Object.freeze(
      targets.map((target, index) =>
        Object.freeze({
          leaderId: `${prefix}-leader-${index}`,
          targetId: target.id,
          remainingSeconds: 1000
        })
      )
    ),
    targetIds: new Set(targets.map((target) => target.id))
  });
};

const createTargetRing = (
  prefix: string,
  center: Vector3,
  radius: number
): readonly V2HumanTargetSnapshot[] =>
  Object.freeze(
    Array.from({ length: 12 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2;
      return createTarget(
        `${prefix}-${index}`,
        center.add(
          new Vector3(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
          )
        )
      );
    })
  );

const isFiniteFlightState = (state: V2BitFlightState) =>
  Number.isFinite(state.position.x) &&
  Number.isFinite(state.position.y) &&
  Number.isFinite(state.position.z) &&
  (state.safeCenterHeight === null ||
    Number.isFinite(state.safeCenterHeight));

const createInitialPositionMap = (
  states: readonly V2BitFlightState[]
): ReadonlyMap<string, Vector3> =>
  new Map(states.map((state) => [state.bitId, state.position.clone()]));

const recordFlightProgress = (
  states: readonly V2BitFlightState[],
  initialPositions: ReadonlyMap<string, Vector3>,
  progressedIds: Set<string>,
  firstProgressTickById?: Map<string, number>,
  tick?: number
) => {
  for (const state of states) {
    const initialPosition = initialPositions.get(state.bitId);
    if (!initialPosition) {
      continue;
    }
    if (
      state.routePurpose !== null ||
      state.activeTransition !== null ||
      state.agentState !== "idle" ||
      Vector3.DistanceSquared(initialPosition, state.position) > 1e-10
    ) {
      progressedIds.add(state.bitId);
      if (
        firstProgressTickById &&
        tick !== undefined &&
        !firstProgressTickById.has(state.bitId)
      ) {
        firstProgressTickById.set(state.bitId, tick);
      }
    }
  }
};

const percentile = (samples: readonly number[], ratio: number) => {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
};

const describeSamples = (samples: readonly number[]) => {
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const maximum = Math.max(...samples);
  const total = samples.reduce((sum, sample) => sum + sample, 0);
  return Object.freeze({ p50, p95, maximum, total });
};

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const captureThrownMessage = (operation: () => unknown) => {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const countSceneResources = (scene: Scene): SceneResourceCounts =>
  Object.freeze({
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    transformNodes: scene.transformNodes.length,
    textures: scene.textures.filter(
      (texture) => texture !== scene.environmentBRDFTexture
    ).length,
    spriteManagers: scene.spriteManagers?.length ?? 0
  });

const sceneResourceCountsEqual = (
  left: SceneResourceCounts,
  right: SceneResourceCounts
) =>
  left.meshes === right.meshes &&
  left.materials === right.materials &&
  left.transformNodes === right.transformNodes &&
  left.textures === right.textures &&
  left.spriteManagers === right.spriteManagers;

const LOADER_FIXTURE_STAGE_ID = "t05-loader-fixture";
const LOADER_FIXTURE_NAV_PROFILE = "t05-loader-human-v1";
const LOADER_FIXTURE_BIT_NAV_PROFILE = "t05-loader-bit-v1";
const LOADER_FIXTURE_WORLD_SCALE = 0.25;
const LOADER_FIXTURE_GLB_URL =
  "__t05-loader-fixture__/t05_loader_fixture.glb";
const LOADER_FIXTURE_NAV_URL =
  "__t05-loader-fixture__/t05_loader_fixture.navmesh.bin";
const LOADER_FIXTURE_BIT_NAV_URL =
  "__t05-loader-fixture__/t05_loader_fixture.bit-flight.navmesh.bin";

const createLoaderFixtureGlb = (
  fixture: BitSystemAcceptanceFixture,
  worldBoundaryVariant: LoaderWorldBoundaryVariant = "valid",
  npcSpawnBiasVariant: LoaderNpcSpawnBiasVariant = "valid"
): Uint8Array => {
  const positions = new Float32Array([
    -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5,
    0.5, 0.5, -0.5,
    -0.5, 0.5, -0.5,
    -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5,
    0.5, 0.5, 0.5,
    -0.5, 0.5, 0.5
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5
  ]);
  const binaryLength = positions.byteLength + indices.byteLength;
  const binaryPadding = (4 - (binaryLength % 4)) % 4;
  const binary = new Uint8Array(binaryLength + binaryPadding);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), positions.byteLength);

  const nodes: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const addEmptyNode = (
    name: string,
    extras: Readonly<Record<string, unknown>>,
    translation?: readonly [number, number, number]
  ) => {
    const node: Record<string, unknown> = { name, extras };
    if (translation) {
      node.translation = translation;
    }
    nodes.push(node);
  };
  const addMeshNode = (
    name: string,
    extras: Readonly<Record<string, unknown>>,
    translation: readonly [number, number, number],
    scale: readonly [number, number, number]
  ) => {
    const meshIndex = meshes.length;
    meshes.push({
      name,
      primitives: [
        {
          attributes: { POSITION: 0 },
          indices: 1,
          mode: 4
        }
      ]
    });
    nodes.push({
      name,
      mesh: meshIndex,
      translation,
      scale,
      extras
    });
  };
  const authoredCoordinate = (value: number) =>
    value / LOADER_FIXTURE_WORLD_SCALE;
  const authoredSize = (value: number) =>
    value / LOADER_FIXTURE_WORLD_SCALE;

  addEmptyNode("META_Stage", {
    hs_schema_version: 2,
    hs_stage_id: LOADER_FIXTURE_STAGE_ID,
    hs_nav_profile: LOADER_FIXTURE_NAV_PROFILE,
    hs_bit_nav_profile: LOADER_FIXTURE_BIT_NAV_PROFILE
  });
  addEmptyNode(
    "MRK_PlayerSpawn",
    {
      hs_id: "loader-player-spawn",
      hs_role: "player_spawn"
    },
    [0, authoredCoordinate(1.4), 0]
  );
  addMeshNode(
    "VOL_LoaderFixturePlayerSpawnExclusion",
    {
      hs_id: "loader-player-spawn-exclusion",
      hs_role: "player_spawn_exclusion",
      hs_player_spawn_id: "loader-player-spawn"
    },
    [0, authoredCoordinate(1.4), 0],
    [authoredSize(2), authoredSize(2), authoredSize(2)]
  );
  addMeshNode(
    "BND_Stage",
    {
      hs_id: "stage",
      hs_role: "playable_boundary"
    },
    [0, authoredCoordinate(2.5), 0],
    [
      authoredSize(20),
      authoredSize(12),
      authoredSize(20)
    ]
  );
  if (worldBoundaryVariant !== "missing") {
    const worldBoundaryExtras =
      worldBoundaryVariant === "invalid-extras"
        ? {
            hs_id: "invalid-world-limit",
            hs_role: "invalid_world_boundary"
          }
        : {
            hs_id: "world-limit",
            hs_role: "world_boundary"
          };
    const worldBoundaryScale =
      worldBoundaryVariant === "outside-stage"
        ? ([
            authoredSize(18),
            authoredSize(10),
            authoredSize(18)
          ] as const)
        : ([
            authoredSize(24),
            authoredSize(16),
            authoredSize(24)
          ] as const);
    addMeshNode(
      "BND_WorldLimit",
      worldBoundaryExtras,
      [0, authoredCoordinate(2.5), 0],
      worldBoundaryScale
    );
    if (worldBoundaryVariant === "duplicate") {
      addMeshNode(
        "BND_WorldLimit",
        worldBoundaryExtras,
        [0, authoredCoordinate(2.5), 0],
        worldBoundaryScale
      );
    }
  }
  addMeshNode(
    "NAV_LoaderFixtureHuman",
    {
      hs_nav_set: "human",
      hs_nav_role: "walkable",
      hs_nav_area: "ground"
    },
    [0, authoredCoordinate(1.4), 0],
    [
      authoredSize(5.6),
      authoredSize(0.04),
      authoredSize(5.6)
    ]
  );

  fixture.definition.bands.forEach((band, index) => {
    const zone = fixture.definition.zones.find(
      (candidate) => candidate.id === band.zoneId
    );
    if (!zone) {
      throw new Error(
        `loader fixtureの飛行ゾーンがありません: ${band.zoneId}`
      );
    }
    addMeshNode(
      `NAV_BitFlight_LoaderFixture_${index}`,
      {
        hs_nav_set: "bit-flight",
        hs_nav_role: "walkable",
        hs_zone_id: band.zoneId,
        hs_band_id: band.id,
        hs_space_kind: zone.spaceKind,
        hs_center_height_min_m: authoredCoordinate(
          band.minimumCenterHeight
        ),
        hs_center_height_max_m: authoredCoordinate(
          band.maximumCenterHeight
        )
      },
      [
        0,
        authoredCoordinate(
          (band.minimumCenterHeight + band.maximumCenterHeight) / 2
        ),
        0
      ],
      [
        authoredSize(5.6),
        authoredSize(0.04),
        authoredSize(5.6)
      ]
    );
  });

  addMeshNode(
    "VOL_LoaderFixtureNpcSpawn",
    {
      hs_id: "loader-npc-spawn",
      hs_role: "npc_spawn"
    },
    [
      authoredCoordinate(1),
      authoredCoordinate(1.4),
      authoredCoordinate(1)
    ],
    [authoredSize(1), authoredSize(0.8), authoredSize(1)]
  );
  const createNpcSpawnBiasExtras = (
    id: string,
    playerSpawnId: string,
    weight: unknown
  ) => {
    const extras: Record<string, unknown> = {
      hs_id: id,
      hs_role: "npc_spawn_bias",
      hs_player_spawn_id: playerSpawnId,
      hs_weight: weight
    };
    if (npcSpawnBiasVariant === "missing-player-spawn-id") {
      delete extras.hs_player_spawn_id;
    }
    if (npcSpawnBiasVariant === "missing-weight") {
      delete extras.hs_weight;
    }
    if (npcSpawnBiasVariant === "unexpected-property") {
      extras.hs_unexpected = true;
    }
    return extras;
  };
  const primaryBiasWeight =
    npcSpawnBiasVariant === "minimum-weight"
      ? 0.000001
      : npcSpawnBiasVariant === "maximum-weight"
        ? 1_000_000
        : npcSpawnBiasVariant === "below-minimum-weight"
          ? 0.0000009
          : npcSpawnBiasVariant === "above-maximum-weight"
            ? 1_000_000.1
            : npcSpawnBiasVariant === "zero-weight"
              ? 0
              : npcSpawnBiasVariant === "negative-weight"
                ? -0.5
                : npcSpawnBiasVariant === "string-weight"
                  ? "0.5"
                  : 0.5;
  const primaryBiasPlayerSpawnId =
    npcSpawnBiasVariant === "orphan-player-spawn"
      ? "loader-player-spawn-missing"
      : "loader-player-spawn";
  const primaryBiasTranslation =
    npcSpawnBiasVariant === "outside-npc-spawn"
      ? ([authoredCoordinate(3), authoredCoordinate(1.4), authoredCoordinate(3)] as const)
      : ([
          authoredCoordinate(1),
          authoredCoordinate(
            npcSpawnBiasVariant === "same-player-horizontal-face-touch"
              ? 1.2125
              : 1.4
          ),
          authoredCoordinate(1)
        ] as const);
  addMeshNode(
    "VOL_LoaderFixtureNpcSpawnBias",
    createNpcSpawnBiasExtras(
      "loader-npc-spawn-bias",
      primaryBiasPlayerSpawnId,
      primaryBiasWeight
    ),
    primaryBiasTranslation,
    [
      authoredSize(0.5),
      authoredSize(
        npcSpawnBiasVariant === "same-player-horizontal-face-touch"
          ? 0.425
          : 0.8
      ),
      authoredSize(0.5)
    ]
  );
  if (
    npcSpawnBiasVariant === "duplicate-id" ||
    npcSpawnBiasVariant === "same-player-overlap" ||
    npcSpawnBiasVariant === "same-player-face-touch" ||
    npcSpawnBiasVariant === "same-player-horizontal-face-touch" ||
    npcSpawnBiasVariant === "same-player-disjoint"
  ) {
    addMeshNode(
      "VOL_LoaderFixtureNpcSpawnBiasSecond",
      {
        hs_id:
          npcSpawnBiasVariant === "duplicate-id"
            ? "loader-npc-spawn-bias"
            : "loader-npc-spawn-bias-second",
        hs_role: "npc_spawn_bias",
        hs_player_spawn_id: "loader-player-spawn",
        hs_weight: 0.25
      },
      [
        authoredCoordinate(
          npcSpawnBiasVariant === "same-player-horizontal-face-touch"
            ? 1
            : npcSpawnBiasVariant === "same-player-disjoint"
              ? 1.4375
              : npcSpawnBiasVariant === "same-player-face-touch"
                ? 1.3125
                : 1.1875
        ),
        authoredCoordinate(
          npcSpawnBiasVariant === "same-player-horizontal-face-touch"
            ? 1.6125
            : 1.4
        ),
        authoredCoordinate(1)
      ],
      [
        authoredSize(
          npcSpawnBiasVariant === "same-player-horizontal-face-touch"
            ? 0.5
            : 0.125
        ),
        authoredSize(
          npcSpawnBiasVariant === "same-player-horizontal-face-touch"
            ? 0.375
            : 0.8
        ),
        authoredSize(
          npcSpawnBiasVariant === "same-player-horizontal-face-touch"
            ? 0.5
            : 0.125
        )
      ]
    );
  }
  if (npcSpawnBiasVariant === "different-player-overlap") {
    addEmptyNode(
      "MRK_PlayerSpawnSecond",
      {
        hs_id: "loader-player-spawn-second",
        hs_role: "player_spawn"
      },
      [authoredCoordinate(1.1), authoredCoordinate(1.4), authoredCoordinate(1)]
    );
    addMeshNode(
      "VOL_LoaderFixturePlayerSpawnExclusionSecond",
      {
        hs_id: "loader-player-spawn-exclusion-second",
        hs_role: "player_spawn_exclusion",
        hs_player_spawn_id: "loader-player-spawn-second"
      },
      [authoredCoordinate(1.1), authoredCoordinate(1.4), authoredCoordinate(1)],
      [authoredSize(0.8), authoredSize(2), authoredSize(0.8)]
    );
    addMeshNode(
      "VOL_LoaderFixtureNpcSpawnBiasSecond",
      {
        hs_id: "loader-npc-spawn-bias-second",
        hs_role: "npc_spawn_bias",
        hs_player_spawn_id: "loader-player-spawn-second",
        hs_weight: 0.25
      },
      [authoredCoordinate(1.1), authoredCoordinate(1.4), authoredCoordinate(1)],
      [authoredSize(0.2), authoredSize(0.8), authoredSize(0.2)]
    );
  }
  addMeshNode(
    "VOL_LoaderFixtureBitSpawn",
    {
      hs_id: "loader-bit-spawn",
      hs_role: "bit_spawn",
      hs_zone_id: fixture.courtyardRef.zoneId,
      hs_band_id: fixture.courtyardRef.bandId
    },
    [0, authoredCoordinate(1.4), 0],
    [
      authoredSize(4.8),
      authoredSize(0.8),
      authoredSize(4.8)
    ]
  );
  addMeshNode(
    "VOL_LoaderFixtureAtriumLift",
    {
      hs_id: "loader-atrium-lift",
      hs_role: "bit_flight_transition",
      hs_transition_kind: "vertical",
      hs_from_zone_id: fixture.concourseRef.zoneId,
      hs_from_band_id: fixture.concourseRef.bandId,
      hs_to_zone_id: fixture.mezzanineRef.zoneId,
      hs_to_band_id: fixture.mezzanineRef.bandId,
      hs_bidirectional: true,
      hs_affordances_json: JSON.stringify(["search-vantage"]),
      hs_projection_distance_m: authoredCoordinate(0.35)
    },
    [0, authoredCoordinate(2.5), 0],
    [
      authoredSize(1.6),
      authoredSize(5.4),
      authoredSize(1.6)
    ]
  );

  const gltf = {
    asset: {
      version: "2.0",
      generator: "T05 loader acceptance fixture"
    },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
        target: 34962
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
        target: 34963
      }
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5]
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5123,
        count: 36,
        type: "SCALAR",
        min: [0],
        max: [7]
      }
    ]
  };
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPadding = (4 - (json.length % 4)) % 4;
  const jsonChunkLength = json.length + jsonPadding;
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binary.length;
  const result = new Uint8Array(totalLength);
  const header = new DataView(result.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, totalLength, true);
  header.setUint32(12, jsonChunkLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  result.set(json, 20);
  result.fill(0x20, 20 + json.length, 20 + jsonChunkLength);
  const binaryHeaderOffset = 20 + jsonChunkLength;
  header.setUint32(binaryHeaderOffset, binary.length, true);
  header.setUint32(binaryHeaderOffset + 4, 0x004e4942, true);
  result.set(binary, binaryHeaderOffset + 8);
  return result;
};

const calculateAcceptanceSha256 = async (data: Uint8Array) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(data).buffer
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
};

const createLoaderFixtureAssets = async (
  fixture: BitSystemAcceptanceFixture,
  worldBoundaryVariant: LoaderWorldBoundaryVariant = "valid",
  worldBoundaryMode: StageCatalogEntry["worldBoundaryMode"] = "required",
  npcSpawnBiasVariant: LoaderNpcSpawnBiasVariant = "valid"
): Promise<LoaderFixtureAssets> => {
  const glb = createLoaderFixtureGlb(
    fixture,
    worldBoundaryVariant,
    npcSpawnBiasVariant
  );
  const humanNavmesh = Uint8Array.from(fixture.payloads[0].data);
  const bitNavmesh = encodeBitFlightNavBundle(
    fixture.payloads.map((payload) => ({
      zoneId: payload.zoneId,
      bandId: payload.bandId,
      data: payload.data
    }))
  );
  const [glbSha256, navmeshSha256, bitNavmeshSha256] = await Promise.all([
    calculateAcceptanceSha256(glb),
    calculateAcceptanceSha256(humanNavmesh),
    calculateAcceptanceSha256(bitNavmesh)
  ]);
  return Object.freeze({
    catalog: Object.freeze({
      id: LOADER_FIXTURE_STAGE_ID,
      label: "T05 loader fixture",
      glbUrl: LOADER_FIXTURE_GLB_URL,
      navmeshUrl: LOADER_FIXTURE_NAV_URL,
      bitNavmeshUrl: LOADER_FIXTURE_BIT_NAV_URL,
      roomVariantNavmesh: Object.freeze({ mode: "unsupported" as const }),
      assetSchemaVersion: 2,
      navProfileId: LOADER_FIXTURE_NAV_PROFILE,
      bitNavProfileId: LOADER_FIXTURE_BIT_NAV_PROFILE,
      glbSha256,
      navmeshSha256,
      bitNavmeshSha256,
      depthPrePassMaterialNames: Object.freeze([]),
      worldBoundaryMode,
      locationAssetsMode: "unsupported" as const
    }),
    glb,
    humanNavmesh,
    bitNavmesh
  });
};

const installLoaderFixtureFetch = (assets: LoaderFixtureAssets) => {
  const previousFetch = globalThis.fetch;
  const payloadBySuffix = new Map<string, Uint8Array>([
    [LOADER_FIXTURE_GLB_URL, assets.glb],
    [LOADER_FIXTURE_NAV_URL, assets.humanNavmesh],
    [LOADER_FIXTURE_BIT_NAV_URL, assets.bitNavmesh]
  ]);
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    const requestedUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const fixturePayload = [...payloadBySuffix].find(([suffix]) =>
      requestedUrl.endsWith(suffix)
    )?.[1];
    if (fixturePayload) {
      return new Response(Uint8Array.from(fixturePayload).buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream"
        }
      });
    }
    return previousFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = previousFetch;
  };
};

const getRequiredFlightState = (system: V2BitSystem) => {
  const state = system.getFrameView().flightStates[0];
  if (!state) {
    throw new Error("検証対象のビット飛行状態がありません。");
  }
  return state;
};

const runActorSphereRadiusCheck = (
  fixture: BitSystemAcceptanceFixture
): BitSystemAcceptanceCheck => {
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => false
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  try {
    const actors = system.getFrameView().actorSpheres;
    const actor = actors[0];
    return Object.freeze({
      name: "ビット被弾球は物理半径0.44mのworld換算を使用",
      ok:
        actors.length === 1 &&
        actor !== undefined &&
        Math.abs(
          actor.radius - BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS
        ) <= 1e-8,
      detail:
        `actor=${actor?.radius.toFixed(6) ?? "none"} / ` +
        `expected=${BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS.toFixed(6)} world units`
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runVisualTargetLossChecks = (
  fixture: BitSystemAcceptanceFixture
): readonly BitSystemAcceptanceCheck[] => {
  const checks: BitSystemAcceptanceCheck[] = [];

  let timeoutSightBlocked = false;
  const timeoutStage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => timeoutSightBlocked
  );
  const timeoutRandom = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const timeoutSystem = createSystem(
    fixture.scene,
    timeoutStage.stage,
    timeoutRandom.random
  );
  try {
    const origin = getRequiredFlightState(timeoutSystem).position;
    const targets = createTargetRing("visual-timeout", origin, 0.2);
    timeoutRandom.enqueue(0.5);
    timeoutSystem.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const acquired = timeoutSystem.getFrameView().targetStates[0];
    timeoutSightBlocked = true;
    timeoutSystem.update({
      deltaSeconds: 0.5,
      elapsedSeconds: 0.5,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const beforeTimeout = timeoutSystem.getFrameView().targetStates[0];
    timeoutSystem.update({
      deltaSeconds: 0.5,
      elapsedSeconds: 1,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const afterTimeout = timeoutSystem.getFrameView().targetStates[0];
    const escapeState = getRequiredFlightState(timeoutSystem);
    checks.push({
      name: "visual標的は最終視認位置到達で18秒前に逃走へ移行",
      ok:
        acquired?.provenance === "visual" &&
        acquired.targetId !== null &&
        beforeTimeout?.targetId === acquired.targetId &&
        afterTimeout?.targetId === null &&
        escapeState.routePurpose === "escape",
      detail:
        `acquired=${acquired?.targetId ?? "none"} / ` +
        `0.5s=${beforeTimeout?.targetId ?? "none"} / ` +
        `1.0s=${afterTimeout?.targetId ?? "none"} / ` +
        `route=${escapeState.routePurpose ?? "none"} / ` +
        `location=${escapeState.zoneId ?? "none"}/${escapeState.bandId ?? "none"} / ` +
        `agent=${escapeState.agentState}`
    });
  } finally {
    timeoutSystem.dispose();
    timeoutStage.dispose();
  }

  const distanceStage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => false
  );
  const distanceRandom = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const distanceSystem = createSystem(
    fixture.scene,
    distanceStage.stage,
    distanceRandom.random
  );
  try {
    const origin = getRequiredFlightState(distanceSystem).position;
    const targets = createTargetRing("visual-distance", origin, 2.65);
    distanceRandom.enqueue(0.5);
    distanceSystem.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const acquired = distanceSystem.getFrameView().targetStates[0];
    const movedTargets = createTargetRing(
      "visual-distance",
      origin,
      3.18
    );
    distanceSystem.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: movedTargets,
      externalAlerts: EMPTY_ALERTS
    });
    const released = distanceSystem.getFrameView().targetStates[0];
    const escapeState = getRequiredFlightState(distanceSystem);
    checks.push({
      name: "visual標的は標準視認距離+0.5の3.17超で即時解除",
      ok:
        acquired?.provenance === "visual" &&
        acquired.targetId !== null &&
        released?.targetId === null &&
        escapeState.routePurpose === "escape",
      detail:
        `distance=3.18 / acquired=${acquired?.targetId ?? "none"} / ` +
        `released=${released?.targetId ?? "none"} / ` +
        `route=${escapeState.routePurpose ?? "none"} / ` +
        `location=${escapeState.zoneId ?? "none"}/${escapeState.bandId ?? "none"} / ` +
        `agent=${escapeState.agentState}`
    });
  } finally {
    distanceSystem.dispose();
    distanceStage.dispose();
  }

  const reacquisitionStage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => false,
    Object.freeze({ width: 1, height: 0.1, depth: 1 })
  );
  let reacquisitionRandomState = 0x1f83d9ab;
  let forceReacquisitionChase = false;
  const reacquisitionRandom = () => {
    if (forceReacquisitionChase) {
      return 0.5;
    }
    reacquisitionRandomState =
      (Math.imul(reacquisitionRandomState, 1664525) + 1013904223) >>> 0;
    return reacquisitionRandomState / 0x1_0000_0000;
  };
  const reacquisitionSystem = createSystem(
    fixture.scene,
    reacquisitionStage.stage,
    reacquisitionRandom,
    5
  );
  try {
    const initialTargets = Object.freeze(
      reacquisitionSystem
        .getFrameView().flightStates
        .flatMap((state) =>
          createTargetRing(
            `pending-escape-reacquisition-${state.bitId}`,
            state.position,
            0.2
          )
        )
    );
    forceReacquisitionChase = true;
    reacquisitionSystem.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: initialTargets,
      externalAlerts: EMPTY_ALERTS
    });
    reacquisitionSystem.update({
      deltaSeconds: 18,
      elapsedSeconds: 18,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const releasedStates = reacquisitionSystem.getFrameView().targetStates;
    const releasedFlights = reacquisitionSystem.getFrameView().flightStates;
    const queuedEscapeCount = releasedFlights.filter(
      (state) => state.routePurpose !== "escape"
    ).length;
    const targets = Object.freeze(
      releasedFlights.flatMap((state) =>
        createTargetRing(
          `pending-escape-reacquisition-${state.bitId}`,
          state.position,
          0.2
        )
      )
    );
    const targetIds = new Set(targets.map((target) => target.id));
    const reacquisitionAlert = Object.freeze({
      leaderId: "pending-escape-reacquisition-leader",
      targetId: targets[0].id,
      remainingSeconds: 100
    });

    reacquisitionSystem.update({
      deltaSeconds: 0.1,
      elapsedSeconds: 18.1,
      targets,
      externalAlerts: Object.freeze([reacquisitionAlert])
    });
    const reacquiredPositions = createInitialPositionMap(
      reacquisitionSystem.getFrameView().flightStates
    );
    const reacquiredProgressIds = new Set<string>();
    for (let frameIndex = 0; frameIndex < 4; frameIndex += 1) {
      reacquisitionSystem.update({
        deltaSeconds: 0.1,
        elapsedSeconds: 18.2 + frameIndex * 0.1,
        targets,
        externalAlerts: EMPTY_ALERTS
      });
      recordFlightProgress(
        reacquisitionSystem.getFrameView().flightStates,
        reacquiredPositions,
        reacquiredProgressIds
      );
    }
    const reacquiredTargets = reacquisitionSystem.getFrameView().targetStates;
    const reacquiredFlights = reacquisitionSystem.getFrameView().flightStates;
    checks.push({
      name: "逃走予算待ち中のvisual再標的化で古い逃走要求を破棄し初回追跡を再優先",
      ok:
        releasedStates.every((state) => state.targetId === null) &&
        queuedEscapeCount >= 1 &&
        reacquiredTargets.length === 5 &&
        reacquiredTargets.every(
          (state) =>
            state.targetId !== null &&
            targetIds.has(state.targetId) &&
            (state.provenance === "visual" ||
              state.provenance === "alert") &&
            state.mode === "chase"
        ) &&
        reacquiredFlights.every((state) => state.routePurpose !== "escape") &&
        reacquiredProgressIds.size === reacquiredPositions.size,
      detail:
        `released=${releasedStates.filter((state) => state.targetId === null).length}/5 / ` +
        `queued=${queuedEscapeCount} / ` +
        `reacquired=${reacquiredTargets.filter((state) => state.targetId !== null && targetIds.has(state.targetId)).length}/5 / ` +
        `progressed=${reacquiredProgressIds.size}/${reacquiredPositions.size}`
    });
  } finally {
    reacquisitionSystem.dispose();
    reacquisitionStage.dispose();
  }

  return Object.freeze(checks);
};

const runSightCheckBudgetCheck = (
  fixture: BitSystemAcceptanceFixture
): BitSystemAcceptanceCheck => {
  let sightCastCount = 0;
  let trackMeasuredSightActors = false;
  let measuredActorIdBySightOrigin = new Map<string, string>();
  const measuredSightChecksByActorId = new Map<string, number>();
  let unmatchedMeasuredSightCastCount = 0;
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    (from) => {
      sightCastCount += 1;
      if (trackMeasuredSightActors) {
        const actorId =
          measuredActorIdBySightOrigin.get(toSightOriginKey(from)) ?? null;
        if (actorId === null) {
          unmatchedMeasuredSightCastCount += 1;
        } else {
          measuredSightChecksByActorId.set(
            actorId,
            (measuredSightChecksByActorId.get(actorId) ?? 0) + 1
          );
        }
      }
      return false;
    },
    Object.freeze({ width: 5, height: 0.8, depth: 5 })
  );
  let randomState = 0x243f6a88;
  let forceNormalChase = false;
  const random = () => {
    if (forceNormalChase) {
      return 0.5;
    }
    randomState =
      (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x1_0000_0000;
  };
  const system = createSystem(
    fixture.scene,
    stage.stage,
    random,
    99,
    0.08
  );
  try {
    system.setDiagnosticsEnabled(true);
    const stressFixture = createExternalAlertStressFixture(
      "sight-budget-target",
      fixture.pointInBand(fixture.courtyardRef, 0, 0)
    );
    forceNormalChase = true;
    for (
      let frameIndex = 0;
      frameIndex < PERFORMANCE_WARMUP_TICKS;
      frameIndex += 1
    ) {
      system.update({
        deltaSeconds: PERFORMANCE_DELTA_SECONDS,
        elapsedSeconds: frameIndex * PERFORMANCE_DELTA_SECONDS,
        targets: stressFixture.targets,
        externalAlerts:
          frameIndex === 0 ? stressFixture.alerts : EMPTY_ALERTS
      });
    }

    sightCastCount = 0;
    let maximumSightCastsPerUpdate = 0;
    let maximumCurrentTargetSightChecksPerUpdate = 0;
    let minimumIdentifiableActorCount = PERFORMANCE_STRESS_BIT_COUNT;
    const expectedActorIds = new Set(
      system.getFrameView().actorSpheres.map((actor) => actor.id)
    );
    for (
      let frameIndex = 0;
      frameIndex < PERFORMANCE_MEASURED_TICKS;
      frameIndex += 1
    ) {
      measuredActorIdBySightOrigin = new Map(
        system
          .getFrameView()
          .actorSpheres.map(
            (actor) => [toSightOriginKey(actor.center), actor.id] as const
          )
      );
      minimumIdentifiableActorCount = Math.min(
        minimumIdentifiableActorCount,
        measuredActorIdBySightOrigin.size
      );
      const beforeUpdate = sightCastCount;
      trackMeasuredSightActors = true;
      system.update({
        deltaSeconds: PERFORMANCE_DELTA_SECONDS,
        elapsedSeconds:
          (PERFORMANCE_WARMUP_TICKS + frameIndex) *
          PERFORMANCE_DELTA_SECONDS,
        targets: stressFixture.targets,
        externalAlerts: EMPTY_ALERTS
      });
      trackMeasuredSightActors = false;
      maximumSightCastsPerUpdate = Math.max(
        maximumSightCastsPerUpdate,
        sightCastCount - beforeUpdate
      );
      maximumCurrentTargetSightChecksPerUpdate = Math.max(
        maximumCurrentTargetSightChecksPerUpdate,
        system.getFrameView().diagnostics.currentTargetSightCheckCount
      );
    }
    const measuredSightCastCount = sightCastCount;
    const measuredActorSightCheckCounts = [...expectedActorIds].map(
      (actorId) => measuredSightChecksByActorId.get(actorId) ?? 0
    );
    const measuredActorSightCheckCount =
      measuredActorSightCheckCounts.reduce(
        (total, count) => total + count,
        0
      );
    const minimumActorSightCheckCount = Math.min(
      ...measuredActorSightCheckCounts
    );
    const maximumActorSightCheckCount = Math.max(
      ...measuredActorSightCheckCounts
    );
    const targetStates = system.getFrameView().targetStates;
    const expectedTotalSightCasts =
      PERFORMANCE_STRESS_BIT_COUNT *
        (PERFORMANCE_MEASURED_TICKS * PERFORMANCE_DELTA_SECONDS) /
      PERFORMANCE_SIGHT_CHECK_INTERVAL_SECONDS;
    const minimumTotalSightCasts =
      Math.floor(expectedTotalSightCasts) -
      PERFORMANCE_SIGHT_CASTS_PER_99_UPDATE;
    const maximumTotalSightCasts =
      Math.ceil(expectedTotalSightCasts) +
      PERFORMANCE_SIGHT_CASTS_PER_99_UPDATE;
    const beforeCatchUpSightCastCount = sightCastCount;
    system.update({
      deltaSeconds: 1,
      elapsedSeconds:
        (PERFORMANCE_WARMUP_TICKS + PERFORMANCE_MEASURED_TICKS) *
        PERFORMANCE_DELTA_SECONDS,
      targets: stressFixture.targets,
      externalAlerts: EMPTY_ALERTS
    });
    const catchUpSightCastCount =
      sightCastCount - beforeCatchUpSightCastCount;
    const catchUpDiagnostics = system.getFrameView().diagnostics;
    return Object.freeze({
      name: "99体の視界Rayを5Hzラウンドロビンで描画フレームへ分散",
      ok:
        targetStates.length === 99 &&
        targetStates.every(
          (state) =>
            state.targetId !== null &&
            stressFixture.targetIds.has(state.targetId) &&
            state.mode === "chase"
        ) &&
        expectedActorIds.size === PERFORMANCE_STRESS_BIT_COUNT &&
        minimumIdentifiableActorCount ===
          PERFORMANCE_STRESS_BIT_COUNT &&
        unmatchedMeasuredSightCastCount === 0 &&
        measuredSightChecksByActorId.size === expectedActorIds.size &&
        minimumActorSightCheckCount > 0 &&
        measuredActorSightCheckCount === measuredSightCastCount &&
        measuredSightCastCount >= minimumTotalSightCasts &&
        measuredSightCastCount <= maximumTotalSightCasts &&
        maximumSightCastsPerUpdate <=
          PERFORMANCE_SIGHT_CASTS_PER_99_UPDATE &&
        maximumCurrentTargetSightChecksPerUpdate <=
          PERFORMANCE_SIGHT_CASTS_PER_99_UPDATE &&
        catchUpSightCastCount <=
          PERFORMANCE_SIGHT_CATCH_UP_MAXIMUM &&
        catchUpDiagnostics.currentTargetSightCheckCount <=
          PERFORMANCE_SIGHT_CATCH_UP_MAXIMUM,
      detail:
        `tick=${PERFORMANCE_DELTA_SECONDS.toFixed(6)}s / ` +
        `measured=${PERFORMANCE_MEASURED_TICKS} / ` +
        `casts=${measuredSightCastCount}/` +
        `${minimumTotalSightCasts}-${maximumTotalSightCasts} / ` +
        `actors=${measuredSightChecksByActorId.size}/` +
        `${expectedActorIds.size} / ` +
        `perActor=${minimumActorSightCheckCount}-` +
        `${maximumActorSightCheckCount} / ` +
        `unmatched=${unmatchedMeasuredSightCastCount} / ` +
        `maxPerUpdate=${maximumSightCastsPerUpdate}/` +
        `${PERFORMANCE_SIGHT_CASTS_PER_99_UPDATE} / ` +
        `current=${maximumCurrentTargetSightChecksPerUpdate}/` +
        `${PERFORMANCE_SIGHT_CASTS_PER_99_UPDATE} / ` +
        `catchUp=${catchUpSightCastCount},` +
        `${catchUpDiagnostics.currentTargetSightCheckCount}/` +
        `${PERFORMANCE_SIGHT_CATCH_UP_MAXIMUM}`
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runCarpetFormationChecks = (
  fixture: BitSystemAcceptanceFixture
): readonly BitSystemAcceptanceCheck[] => {
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => true
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  const checks: BitSystemAcceptanceCheck[] = [];
  try {
    const origin = getRequiredFlightState(system).position;
    const sameBandTarget = createTarget(
      "carpet-target",
      origin.add(new Vector3(1, 0, 0))
    );
    const alert = Object.freeze({
      leaderId: "carpet-external-leader",
      targetId: sameBandTarget.id,
      remainingSeconds: 100
    });
    random.enqueue(0.05);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: Object.freeze([sameBandTarget]),
      externalAlerts: Object.freeze([alert])
    });
    system.update({
      deltaSeconds: 0.1,
      elapsedSeconds: 0.1,
      targets: Object.freeze([sameBandTarget]),
      externalAlerts: EMPTY_ALERTS
    });
    for (const elapsedSeconds of [0.6, 1.1, 1.6] as const) {
      system.update({
        deltaSeconds: 0.5,
        elapsedSeconds,
        targets: Object.freeze([sameBandTarget]),
        externalAlerts: EMPTY_ALERTS
      });
    }

    let stayedInBand = true;
    let bobStayedZero = true;
    let retainedFormation = true;
    for (let frameIndex = 1; frameIndex <= 10; frameIndex += 1) {
      system.update({
        deltaSeconds: 0.1,
        elapsedSeconds: 1.6 + frameIndex * 0.1,
        targets: Object.freeze([sameBandTarget]),
        externalAlerts: EMPTY_ALERTS
      });
      const flightStates = system.getFrameView().flightStates;
      const targetStates = system.getFrameView().targetStates;
      retainedFormation =
        retainedFormation &&
        flightStates.length === 3 &&
        targetStates.filter((state) => state.mode === "carpet-leader")
          .length === 1 &&
        targetStates.filter((state) => state.mode === "carpet-follower")
          .length === 2;
      stayedInBand =
        stayedInBand &&
        flightStates.every(
          (state) =>
            state.zoneId === fixture.courtyardRef.zoneId &&
            state.bandId === fixture.courtyardRef.bandId &&
            state.safeCenterHeight !== null &&
            state.safeCenterHeight >= 1 &&
            state.safeCenterHeight <= 1.8
        );
      bobStayedZero =
        bobStayedZero &&
        flightStates.every(
          (state) =>
            state.safeCenterHeight !== null &&
            Math.abs(state.position.y - state.safeCenterHeight) <= 1e-6
        );
    }

    const crossBandTarget = createTarget(
      sameBandTarget.id,
      fixture.pointInBand(fixture.mezzanineRef, 0, 0)
    );
    system.update({
      deltaSeconds: 0.1,
      elapsedSeconds: 2.7,
      targets: Object.freeze([crossBandTarget]),
      externalAlerts: EMPTY_ALERTS
    });
    const releasedStates = system.getFrameView().flightStates;
    const releasedTargetStates = system.getFrameView().targetStates;
    let releasedBeforeTransition =
      releasedStates.length === 1 &&
      releasedTargetStates.length === 1 &&
      releasedTargetStates[0].mode === "chase" &&
      releasedStates[0].routePurpose === null &&
      releasedStates[0].activeTransition === null;
    let observedTransition = releasedStates[0]?.activeTransition !== null;
    let actorCountStayedReleased = releasedStates.length === 1;
    for (
      let frameIndex = 0;
      frameIndex < 300 && !observedTransition;
      frameIndex += 1
    ) {
      const elapsedSeconds = 2.8 + frameIndex * 0.1;
      system.update({
        deltaSeconds: 0.1,
        elapsedSeconds,
        targets: Object.freeze([crossBandTarget]),
        externalAlerts: EMPTY_ALERTS
      });
      const flightStates = system.getFrameView().flightStates;
      actorCountStayedReleased =
        actorCountStayedReleased && flightStates.length === 1;
      observedTransition = flightStates[0]?.activeTransition !== null;
      if (observedTransition) {
        releasedBeforeTransition =
          releasedBeforeTransition &&
          system.getFrameView().targetStates[0]?.mode === "chase";
      }
    }

    checks.push({
      name: "絨毯編隊は帯内高度・揺れ0を保ち帯変更前に解除",
      ok:
        retainedFormation &&
        stayedInBand &&
        bobStayedZero &&
        releasedBeforeTransition &&
        actorCountStayedReleased &&
        observedTransition,
      detail:
        `formation=${retainedFormation} / inBand=${stayedInBand} / ` +
        `bobZero=${bobStayedZero} / released=${releasedBeforeTransition} / ` +
        `singleActor=${actorCountStayedReleased} / ` +
        `transition=${observedTransition}`
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
  return Object.freeze(checks);
};

type SearchMovementKind = "normal" | "vertical" | "diagonal";

type SearchMovementResult = Readonly<{
  kind: SearchMovementKind;
  before: V2BitFlightState;
  after: V2BitFlightState;
  horizontalDelta: number;
  verticalDelta: number;
  movementDistance: number;
}>;

const runSearchMovementCase = (
  fixture: BitSystemAcceptanceFixture,
  kind: SearchMovementKind,
  scriptedRandom: readonly number[]
): SearchMovementResult => {
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => true
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  try {
    random.enqueue(...scriptedRandom);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const before = getRequiredFlightState(system);
    system.update({
      deltaSeconds: MICRO_DELTA_SECONDS,
      elapsedSeconds: MICRO_DELTA_SECONDS,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const after = getRequiredFlightState(system);
    if (before.safeCenterHeight === null || after.safeCenterHeight === null) {
      throw new Error(`${kind}探索の安全中心高度がありません。`);
    }
    const horizontalDelta = Math.hypot(
      after.position.x - before.position.x,
      after.position.z - before.position.z
    );
    const verticalDelta =
      after.safeCenterHeight - before.safeCenterHeight;
    return Object.freeze({
      kind,
      before,
      after,
      horizontalDelta,
      verticalDelta,
      movementDistance: Math.hypot(horizontalDelta, verticalDelta)
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runBobCheck = (
  fixture: BitSystemAcceptanceFixture
): BitSystemAcceptanceCheck => {
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => true
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  try {
    random.enqueue(0.2, 0.5, 0.999, 0.5);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const peakSeconds = Math.PI / (2 * 0.9);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: peakSeconds,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const state = getRequiredFlightState(system);
    const bob =
      state.safeCenterHeight === null
        ? Number.POSITIVE_INFINITY
        : state.position.y - state.safeCenterHeight;
    return Object.freeze({
      name: "通常飛行の上下揺れは最大0.03",
      ok:
        state.routePurpose === "search" &&
        state.activeTransition === null &&
        bob > 0.029 &&
        bob <= BOB_AMPLITUDE + 1e-6,
      detail:
        `bob=${Number.isFinite(bob) ? bob.toFixed(6) : "none"} / ` +
        `limit=${BOB_AMPLITUDE.toFixed(6)}`
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runTransitionBobCheck = (
  fixture: BitSystemAcceptanceFixture
): BitSystemAcceptanceCheck => {
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.concourseRef,
    fixture.pointInBand(fixture.concourseRef, 0, 0),
    () => true
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  try {
    const target = createTarget(
      "transition-bob-target",
      fixture.pointInBand(fixture.mezzanineRef, 0, 0)
    );
    random.enqueue(0.5);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: Object.freeze([target]),
      externalAlerts: Object.freeze([
        Object.freeze({
          leaderId: "transition-bob-leader",
          targetId: target.id,
          remainingSeconds: 10
        })
      ])
    });
    const before = getRequiredFlightState(system);
    system.update({
      deltaSeconds: 1,
      elapsedSeconds: 1,
      targets: Object.freeze([target]),
      externalAlerts: EMPTY_ALERTS
    });
    const after = getRequiredFlightState(system);
    const movement = Vector3.Distance(before.position, after.position);
    const expectedMovement =
      BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND;
    return Object.freeze({
      name: "遷移中は上下揺れを停止し物理1m/sで移動",
      ok:
        after.agentState === "transition" &&
        after.activeTransition?.id === "atrium-lift-volume" &&
        Math.abs(after.position.x - before.position.x) <= 1e-6 &&
        Math.abs(after.position.z - before.position.z) <= 1e-6 &&
        Math.abs(movement - expectedMovement) <= 1e-6,
      detail:
        `state=${after.agentState} / transition=${after.activeTransition?.id ?? "none"} / ` +
        `movement=${movement.toFixed(6)} / expected=${expectedMovement.toFixed(6)}`
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

type TransitionClearCase = Readonly<{
  label: string;
  advanceSeconds: number;
  expectedBand: BitFlightBandRef;
  direction: "entrance" | "exit";
}>;

const runTransitionClearCase = (
  fixture: BitSystemAcceptanceFixture,
  testCase: TransitionClearCase
): BitSystemAcceptanceCheck => {
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.concourseRef,
    fixture.pointInBand(fixture.concourseRef, 0, 0),
    () => true
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  try {
    const target = createTarget(
      `transition-clear-${testCase.direction}-target`,
      fixture.pointInBand(fixture.mezzanineRef, 0, 0)
    );
    random.enqueue(0.5);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: Object.freeze([target]),
      externalAlerts: Object.freeze([
        Object.freeze({
          leaderId: `transition-clear-${testCase.direction}-leader`,
          targetId: target.id,
          remainingSeconds: 100
        })
      ])
    });
    system.update({
      deltaSeconds: testCase.advanceSeconds,
      elapsedSeconds: testCase.advanceSeconds,
      targets: Object.freeze([target]),
      externalAlerts: EMPTY_ALERTS
    });
    const active = getRequiredFlightState(system);
    system.update({
      deltaSeconds: 0.1,
      elapsedSeconds: testCase.advanceSeconds + 0.1,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const clearing = getRequiredFlightState(system);
    const movedTowardExpectedEndpoint =
      testCase.direction === "entrance"
        ? clearing.position.y < active.position.y
        : clearing.position.y > active.position.y;

    let final = clearing;
    let finalElapsedSeconds = testCase.advanceSeconds + 0.1;
    for (
      let frameIndex = 0;
      frameIndex < 200 && final.zoneId === null;
      frameIndex += 1
    ) {
      finalElapsedSeconds =
        testCase.advanceSeconds + 0.2 + frameIndex * 0.1;
      system.update({
        deltaSeconds: 0.1,
        elapsedSeconds: finalElapsedSeconds,
        targets: EMPTY_TARGETS,
        externalAlerts: EMPTY_ALERTS
      });
      final = getRequiredFlightState(system);
    }
    system.update({
      deltaSeconds: 0.1,
      elapsedSeconds: finalElapsedSeconds + 0.1,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const resumed = getRequiredFlightState(system);
    return Object.freeze({
      name: `遷移${testCase.label}の標的喪失は近い${testCase.direction === "entrance" ? "入口" : "出口"}へ離脱`,
      ok:
        active.agentState === "transition" &&
        active.activeTransition?.id === "atrium-lift-volume" &&
        clearing.agentState === "clearing-transition" &&
        clearing.activeTransition?.id === "atrium-lift-volume" &&
        movedTowardExpectedEndpoint &&
        final.zoneId === testCase.expectedBand.zoneId &&
        final.bandId === testCase.expectedBand.bandId &&
        resumed.routePurpose === "search" &&
        resumed.agentState !== "idle",
      detail:
        `activeY=${active.position.y.toFixed(4)} / ` +
        `clearingY=${clearing.position.y.toFixed(4)} / ` +
        `direction=${testCase.direction} / ` +
        `final=${final.zoneId ?? "none"}/${final.bandId ?? "none"} / ` +
        `resumed=${resumed.routePurpose ?? "none"}/${resumed.agentState}`
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runTransitionClearChecks = (
  fixture: BitSystemAcceptanceFixture
): readonly BitSystemAcceptanceCheck[] =>
  Object.freeze([
    runTransitionClearCase(
      fixture,
      Object.freeze({
        label: "前半",
        advanceSeconds: 1,
        expectedBand: fixture.concourseRef,
        direction: "entrance"
      })
    ),
    runTransitionClearCase(
      fixture,
      Object.freeze({
        label: "後半",
        advanceSeconds: 6,
        expectedBand: fixture.mezzanineRef,
        direction: "exit"
      })
    )
  ]);

const runTransitionReturnSuppressionCheck = async (
  fixture: BitSystemAcceptanceFixture
): Promise<BitSystemAcceptanceCheck> => {
  const isolatedDefinition: BitFlightNavigationDefinition = Object.freeze({
    zones: Object.freeze(
      fixture.definition.zones.filter(
        (zone) => zone.id === fixture.concourseRef.zoneId
      )
    ),
    bands: Object.freeze(
      fixture.definition.bands.filter(
        (band) =>
          band.zoneId === fixture.concourseRef.zoneId &&
          (band.id === fixture.concourseRef.bandId ||
            band.id === fixture.mezzanineRef.bandId)
      )
    ),
    transitions: Object.freeze(
      fixture.definition.transitions.filter(
        (transition) => transition.id === "atrium-lift-volume"
      )
    )
  });
  const isolatedPayloads = Object.freeze(
    fixture.payloads.filter(
      (payload) =>
        payload.zoneId === fixture.concourseRef.zoneId &&
        (payload.bandId === fixture.concourseRef.bandId ||
          payload.bandId === fixture.mezzanineRef.bandId)
    )
  );
  const isolatedNavigation = await createBitFlightNavigationWorld(
    isolatedDefinition,
    isolatedPayloads
  );
  const stage = createFixtureStage(
    fixture.scene,
    isolatedNavigation,
    fixture.concourseRef,
    fixture.pointInBand(fixture.concourseRef, 0, 0),
    () => true
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  try {
    random.enqueue(0.2, 0.5, 0.5, 0.5, 0.5, 0.2);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const planned = getRequiredFlightState(system);
    let completed = planned;
    let completionElapsedSeconds = 0;
    let observedAscentTransitionId: string | null = null;
    for (let frameIndex = 1; frameIndex <= 100; frameIndex += 1) {
      completionElapsedSeconds = frameIndex * 0.1;
      system.update({
        deltaSeconds: 0.1,
        elapsedSeconds: completionElapsedSeconds,
        targets: EMPTY_TARGETS,
        externalAlerts: EMPTY_ALERTS
      });
      completed = getRequiredFlightState(system);
      observedAscentTransitionId =
        completed.activeTransition?.id ?? observedAscentTransitionId;
      if (
        completed.zoneId === fixture.mezzanineRef.zoneId &&
        completed.bandId === fixture.mezzanineRef.bandId &&
        completed.activeTransition === null
      ) {
        break;
      }
    }

    random.enqueue(0.2, 0.5, 0.5);
    system.update({
      deltaSeconds: 0.5,
      elapsedSeconds: completionElapsedSeconds + 0.5,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const fallbackPlanned = getRequiredFlightState(system);
    system.update({
      deltaSeconds: 0.1,
      elapsedSeconds: completionElapsedSeconds + 0.6,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const fallbackMoved = getRequiredFlightState(system);

    return Object.freeze({
      name: "vertical上昇直後3秒はreverseを除外し同帯surface探索へfallback",
      ok:
        planned.routePurpose === "search" &&
        observedAscentTransitionId === "atrium-lift-volume" &&
        completed.zoneId === fixture.mezzanineRef.zoneId &&
        completed.bandId === fixture.mezzanineRef.bandId &&
        completed.activeTransition === null &&
        fallbackPlanned.routePurpose === "search" &&
        fallbackPlanned.zoneId === fixture.mezzanineRef.zoneId &&
        fallbackPlanned.bandId === fixture.mezzanineRef.bandId &&
        fallbackPlanned.activeTransition === null &&
        fallbackMoved.zoneId === fixture.mezzanineRef.zoneId &&
        fallbackMoved.bandId === fixture.mezzanineRef.bandId &&
        fallbackMoved.activeTransition === null &&
        fallbackMoved.agentState === "surface" &&
        Vector3.Distance(fallbackPlanned.position, fallbackMoved.position) > 0,
      detail:
        `planned=${planned.routePurpose ?? "none"} / ` +
        `ascent=${observedAscentTransitionId ?? "none"} / ` +
        `completed=${completed.zoneId ?? "none"}/${completed.bandId ?? "none"} / ` +
        `fallback=${fallbackMoved.zoneId ?? "none"}/${fallbackMoved.bandId ?? "none"} / ` +
        `plan=${fallbackPlanned.routePurpose ?? "none"}/${fallbackPlanned.agentState} / ` +
        `moved=${Vector3.Distance(fallbackPlanned.position, fallbackMoved.position).toFixed(6)} / ` +
        `transition=${fallbackMoved.activeTransition?.id ?? "none"}`
    });
  } finally {
    system.dispose();
    stage.dispose();
    isolatedNavigation.dispose();
  }
};

const runScriptedSearchChecks = async (
  fixture: BitSystemAcceptanceFixture
): Promise<readonly BitSystemAcceptanceCheck[]> => {
  const normal = runSearchMovementCase(
    fixture,
    "normal",
    Object.freeze([0.2, 0.5, 0.999, 0.5])
  );
  const vertical = runSearchMovementCase(
    fixture,
    "vertical",
    Object.freeze([0.7, 0.9, 0.999, 0.999, 0.5])
  );
  const diagonal = runSearchMovementCase(
    fixture,
    "diagonal",
    Object.freeze([0.9, 0.9, 0.5, 0.999, 0.5])
  );

  const inBand = (result: SearchMovementResult) =>
    result.after.zoneId === fixture.courtyardRef.zoneId &&
    result.after.bandId === fixture.courtyardRef.bandId &&
    result.after.safeCenterHeight !== null &&
    result.after.safeCenterHeight >= 1 &&
    result.after.safeCenterHeight <= 1.8 &&
    isFiniteFlightState(result.after);

  const returnSuppression =
    await runTransitionReturnSuppressionCheck(fixture);
  return Object.freeze([
    Object.freeze({
      name: "scripted RNG通常探索の実移動とmicro-dt速度上限",
      ok:
        normal.before.routePurpose === "search" &&
        normal.horizontalDelta > 1e-8 &&
        Math.abs(normal.verticalDelta) <= 1e-6 &&
        normal.movementDistance <=
          NORMAL_PATROL_SPEED * MICRO_DELTA_SECONDS + 1e-6 &&
        inBand(normal),
      detail:
        `horizontal=${normal.horizontalDelta.toFixed(6)} / ` +
        `vertical=${normal.verticalDelta.toFixed(6)} / ` +
        `distance=${normal.movementDistance.toFixed(6)}`
    }),
    Object.freeze({
      name: "scripted RNG純vertical探索を0.06に制限",
      ok:
        vertical.before.routePurpose === "search" &&
        vertical.horizontalDelta <= 1e-6 &&
        vertical.verticalDelta > 0 &&
        vertical.movementDistance <=
          SEARCH_VERTICAL_SPEED * MICRO_DELTA_SECONDS + 1e-6 &&
        inBand(vertical),
      detail:
        `horizontal=${vertical.horizontalDelta.toFixed(6)} / ` +
        `vertical=${vertical.verticalDelta.toFixed(6)} / ` +
        `distance=${vertical.movementDistance.toFixed(6)}`
    }),
    Object.freeze({
      name: "scripted RNG斜め探索の実移動とmicro-dt速度上限",
      ok:
        diagonal.before.routePurpose === "search" &&
        diagonal.horizontalDelta > 1e-8 &&
        diagonal.verticalDelta > 0 &&
        diagonal.movementDistance <=
          NORMAL_PATROL_SPEED * MICRO_DELTA_SECONDS + 1e-6 &&
        inBand(diagonal),
      detail:
        `horizontal=${diagonal.horizontalDelta.toFixed(6)} / ` +
        `vertical=${diagonal.verticalDelta.toFixed(6)} / ` +
        `distance=${diagonal.movementDistance.toFixed(6)}`
    }),
    runBobCheck(fixture),
    runTransitionBobCheck(fixture),
    ...runTransitionClearChecks(fixture),
    returnSuppression
  ]);
};

const runDynamicRevisionSurfaceChecks = (
  fixture: BitSystemAcceptanceFixture
): readonly BitSystemAcceptanceCheck[] => {
  const stage = createDynamicBitRevisionFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, -0.8, 0)
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  system.setDiagnosticsEnabled(true);
  try {
    const target = createTarget(
      "dynamic-revision-surface-target",
      fixture.pointInBand(fixture.courtyardRef, 0.8, 0)
    );
    const targets = Object.freeze([target]);
    const initialPosition = getRequiredFlightState(system).position;
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets,
      externalAlerts: Object.freeze([
        Object.freeze({
          leaderId: "dynamic-revision-surface-leader",
          targetId: target.id,
          remainingSeconds: 100
        })
      ])
    });
    system.update({
      deltaSeconds: 3,
      elapsedSeconds: 3,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const progressed = getRequiredFlightState(system);

    stage.setPointBlocker(
      Vector3.Lerp(initialPosition, progressed.position, 0.5)
    );
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 3,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const pastBlockerState = getRequiredFlightState(system);
    const pastBlockerDiagnostics = system.getFrameView().diagnostics;
    const revisionAfterPastBlocker = stage.getRevision();

    stage.setPointBlocker(
      Vector3.Lerp(pastBlockerState.position, target.aimPosition, 0.5)
    );
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 3,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const futureBlockerState = getRequiredFlightState(system);
    const futureBlockerDiagnostics = system.getFrameView().diagnostics;
    const revisionAfterFutureBlocker = stage.getRevision();
    const stageLinkAccessCount = stage.getStageLinkAccessCount();

    return Object.freeze([
      Object.freeze({
        name: "BIT surface経路はrevision後も通過済み区間の障害物を再検証しない",
        ok:
          progressed.routePurpose === "chase" &&
          Vector3.Distance(initialPosition, progressed.position) > 0.3 &&
          revisionAfterPastBlocker === 1 &&
          pastBlockerState.routePurpose === "chase" &&
          pastBlockerState.agentState === "surface" &&
          pastBlockerDiagnostics.routePlans.chase === 0 &&
          pastBlockerDiagnostics.routeSafetyCache.routeSteps.recomputations >
            0,
        detail:
          `moved=${Vector3.Distance(initialPosition, progressed.position).toFixed(6)} / ` +
          `revision=${revisionAfterPastBlocker} / ` +
          `route=${pastBlockerState.routePurpose ?? "none"}/${pastBlockerState.agentState} / ` +
          `chasePlans=${pastBlockerDiagnostics.routePlans.chase} / ` +
          `routeRecomputations=${pastBlockerDiagnostics.routeSafetyCache.routeSteps.recomputations}`
      }),
      Object.freeze({
        name: "BIT surface経路はrevision後の未通過区間障害物で再計画",
        ok:
          revisionAfterFutureBlocker === 2 &&
          futureBlockerDiagnostics.routePlans.chase > 0 &&
          futureBlockerDiagnostics.routeSafetyCache.routeSteps.recomputations >
            0,
        detail:
          `revision=${revisionAfterFutureBlocker} / ` +
          `route=${futureBlockerState.routePurpose ?? "none"}/${futureBlockerState.agentState} / ` +
          `chasePlans=${futureBlockerDiagnostics.routePlans.chase} / ` +
          `routeRecomputations=${futureBlockerDiagnostics.routeSafetyCache.routeSteps.recomputations}`
      }),
      Object.freeze({
        name: "BIT動的surface経路fixtureはStageLinkを利用しない",
        ok:
          stageLinkAccessCount === 0 &&
          STAGE_LINK_KINDS.every(
            (kind) => !canStageMoverUseLink("bit", kind)
          ),
        detail:
          `registryAccess=${stageLinkAccessCount} / ` +
          `allowed=${STAGE_LINK_KINDS.filter((kind) => canStageMoverUseLink("bit", kind)).join(",") || "none"}`
      })
    ]);
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runDynamicRevisionTransitionChecks = (
  fixture: BitSystemAcceptanceFixture
): readonly BitSystemAcceptanceCheck[] => {
  const transitionStart = fixture.pointInBand(
    fixture.concourseRef,
    0,
    0
  );
  const stage = createDynamicBitRevisionFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.concourseRef,
    transitionStart
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  system.setDiagnosticsEnabled(true);
  try {
    const target = createTarget(
      "dynamic-revision-transition-target",
      fixture.pointInBand(fixture.mezzanineRef, 0, 0)
    );
    const targets = Object.freeze([target]);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets,
      externalAlerts: Object.freeze([
        Object.freeze({
          leaderId: "dynamic-revision-transition-leader",
          targetId: target.id,
          remainingSeconds: 100
        })
      ])
    });
    system.update({
      deltaSeconds: 5,
      elapsedSeconds: 5,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const progressed = getRequiredFlightState(system);

    stage.setPointBlocker(
      Vector3.Lerp(transitionStart, progressed.position, 0.35)
    );
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 5,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const pastBlockerState = getRequiredFlightState(system);
    const pastBlockerDiagnostics = system.getFrameView().diagnostics;

    stage.setPointBlocker(
      Vector3.Lerp(pastBlockerState.position, target.aimPosition, 0.5)
    );
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 5,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const clearingState = getRequiredFlightState(system);
    const forwardBlockerDiagnostics = system.getFrameView().diagnostics;

    stage.clearBlocker();
    let afterClear = clearingState;
    let elapsedSeconds = 5;
    for (
      let index = 0;
      index < 100 && afterClear.activeTransition !== null;
      index += 1
    ) {
      elapsedSeconds += 0.1;
      system.update({
        deltaSeconds: 0.1,
        elapsedSeconds,
        targets,
        externalAlerts: EMPTY_ALERTS
      });
      afterClear = getRequiredFlightState(system);
    }
    system.update({
      deltaSeconds: 0,
      elapsedSeconds,
      targets,
      externalAlerts: EMPTY_ALERTS
    });
    const replannedState = getRequiredFlightState(system);
    const replannedDiagnostics = system.getFrameView().diagnostics;
    const stageLinkAccessCount = stage.getStageLinkAccessCount();

    return Object.freeze([
      Object.freeze({
        name: "BIT transition経路はrevision後も通過済み遷移点を再検証しない",
        ok:
          progressed.agentState === "transition" &&
          progressed.activeTransition?.id === "atrium-lift-volume" &&
          pastBlockerState.agentState === "transition" &&
          pastBlockerState.activeTransition?.id === "atrium-lift-volume" &&
          pastBlockerDiagnostics.routePlans.chase === 0 &&
          pastBlockerDiagnostics.routeSafetyCache.routeSteps.recomputations >
            0,
        detail:
          `progressedY=${progressed.position.y.toFixed(6)} / ` +
          `state=${pastBlockerState.agentState} / ` +
          `transition=${pastBlockerState.activeTransition?.id ?? "none"} / ` +
          `chasePlans=${pastBlockerDiagnostics.routePlans.chase} / ` +
          `routeRecomputations=${pastBlockerDiagnostics.routeSafetyCache.routeSteps.recomputations}`
      }),
      Object.freeze({
        name: "BIT transition経路はrevision後の未通過遷移点障害物で安全離脱後に再計画",
        ok:
          clearingState.agentState === "clearing-transition" &&
          clearingState.activeTransition?.id === "atrium-lift-volume" &&
          forwardBlockerDiagnostics.routeSafetyCache.routeSteps
            .recomputations > 0 &&
          afterClear.activeTransition === null &&
          replannedDiagnostics.routePlans.chase > 0,
        detail:
          `clearing=${clearingState.agentState}/${clearingState.activeTransition?.id ?? "none"} / ` +
          `cleared=${afterClear.zoneId ?? "none"}/${afterClear.bandId ?? "none"}/${afterClear.agentState} / ` +
          `replanned=${replannedState.routePurpose ?? "none"}/${replannedState.agentState} / ` +
          `chasePlans=${replannedDiagnostics.routePlans.chase} / ` +
          `routeRecomputations=${forwardBlockerDiagnostics.routeSafetyCache.routeSteps.recomputations}`
      }),
      Object.freeze({
        name: "BIT動的transition経路fixtureはStageLinkを利用しない",
        ok: stageLinkAccessCount === 0,
        detail: `registryAccess=${stageLinkAccessCount}`
      })
    ]);
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runDynamicRevisionUnreachableRecoveryCheck = (
  fixture: BitSystemAcceptanceFixture
): BitSystemAcceptanceCheck => {
  const stage = createDynamicBitRevisionFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0)
  );
  const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
  const system = createSystem(fixture.scene, stage.stage, random.random);
  system.setDiagnosticsEnabled(true);
  try {
    stage.setAllSegmentsBlocked();
    random.enqueue(0.2, 0.5, 0.999, 0.5);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const unreachableState = getRequiredFlightState(system);
    const unreachableDiagnostics = system.getFrameView().diagnostics;

    stage.clearBlocker();
    random.enqueue(0.2, 0.5, 0.999, 0.5);
    system.update({
      deltaSeconds: 0,
      elapsedSeconds: 0,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const recoveredState = getRequiredFlightState(system);
    const recoveredDiagnostics = system.getFrameView().diagnostics;
    const stageLinkAccessCount = stage.getStageLinkAccessCount();

    return Object.freeze({
      name: "到達不能中のBITはrevision変更時に待機時間を待たず再探索",
      ok:
        unreachableDiagnostics.routePlans.search > 0 &&
        unreachableState.routePurpose === null &&
        recoveredDiagnostics.routePlans.search > 0 &&
        recoveredState.routePurpose === "search" &&
        recoveredState.agentState === "surface" &&
        stageLinkAccessCount === 0,
      detail:
        `blockedRevision=1/${unreachableState.routePurpose ?? "none"}/${unreachableState.agentState}/plans=${unreachableDiagnostics.routePlans.search} / ` +
        `recoveredRevision=${stage.getRevision()}/${recoveredState.routePurpose ?? "none"}/${recoveredState.agentState}/plans=${recoveredDiagnostics.routePlans.search} / ` +
        `stageLinkAccess=${stageLinkAccessCount}`
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runDynamicRevisionChecks = (
  fixture: BitSystemAcceptanceFixture
): readonly BitSystemAcceptanceCheck[] =>
  Object.freeze([
    ...runDynamicRevisionSurfaceChecks(fixture),
    ...runDynamicRevisionTransitionChecks(fixture),
    runDynamicRevisionUnreachableRecoveryCheck(fixture)
  ]);

const runCrossBandChasePerformanceCheck = (
  fixture: BitSystemAcceptanceFixture
): Readonly<{
  check: BitSystemAcceptanceCheck;
  metric: BitSystemAcceptanceMetric;
}> => {
  const stage = createFixtureStage(
    fixture.scene,
    fixture.navigation,
    fixture.courtyardRef,
    fixture.pointInBand(fixture.courtyardRef, 0, 0),
    () => true,
    Object.freeze({ width: 5, height: 0.8, depth: 5 })
  );
  let randomState = 0x3c6ef372;
  let forceChaseMode = false;
  const random = () => {
    if (forceChaseMode) {
      return 0.5;
    }
    randomState =
      (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x1_0000_0000;
  };
  const system = createSystem(
    fixture.scene,
    stage.stage,
    random,
    99,
    0.08
  );
  try {
    const initialPositions = createInitialPositionMap(
      system.getFrameView().flightStates
    );
    const progressedIds = new Set<string>();
    forceChaseMode = true;
    const stressFixture = createExternalAlertStressFixture(
      "cross-band-performance",
      fixture.pointInBand(fixture.mezzanineRef, 0, 0)
    );
    for (
      let frameIndex = 0;
      frameIndex < PERFORMANCE_WARMUP_TICKS;
      frameIndex += 1
    ) {
      system.update({
        deltaSeconds: PERFORMANCE_DELTA_SECONDS,
        elapsedSeconds: frameIndex * PERFORMANCE_DELTA_SECONDS,
        targets: stressFixture.targets,
        externalAlerts:
          frameIndex === 0 ? stressFixture.alerts : EMPTY_ALERTS
      });
      recordFlightProgress(
        system.getFrameView().flightStates,
        initialPositions,
        progressedIds
      );
    }

    const samples: number[] = [];
    for (
      let frameIndex = 0;
      frameIndex < PERFORMANCE_MEASURED_TICKS;
      frameIndex += 1
    ) {
      const startedAt = performance.now();
      system.update({
        deltaSeconds: PERFORMANCE_DELTA_SECONDS,
        elapsedSeconds:
          (PERFORMANCE_WARMUP_TICKS + frameIndex) *
          PERFORMANCE_DELTA_SECONDS,
        targets: stressFixture.targets,
        externalAlerts: EMPTY_ALERTS
      });
      samples.push(performance.now() - startedAt);
      recordFlightProgress(
        system.getFrameView().flightStates,
        initialPositions,
        progressedIds
      );
    }

    const actors = system.getFrameView().actorSpheres;
    const flightStates = system.getFrameView().flightStates;
    const targetStates = system.getFrameView().targetStates;
    const observedCrossBandProgress = flightStates.some(
      (state) =>
        state.activeTransition !== null ||
        (state.zoneId === fixture.mezzanineRef.zoneId &&
          state.bandId === fixture.mezzanineRef.bandId)
    );
    const statistics = describeSamples(samples);
    const detail =
      `tick=${PERFORMANCE_DELTA_SECONDS.toFixed(6)}s / ` +
      `warmup=${PERFORMANCE_WARMUP_TICKS} / ` +
      `measured=${samples.length} / actors=${actors.length} / ` +
      `p50=${statistics.p50.toFixed(3)}ms / ` +
      `p95=${statistics.p95.toFixed(3)}/${PERFORMANCE_P95_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
      `max=${statistics.maximum.toFixed(3)}/${PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
      `crossBand=${observedCrossBandProgress} / ` +
      `progressed=${progressedIds.size}/${initialPositions.size}`;
    return Object.freeze({
      check: Object.freeze({
        name: "99体の帯間追跡を1/60秒tickで計測し性能予算内に維持",
        ok:
          samples.length === PERFORMANCE_MEASURED_TICKS &&
          samples.every(
            (sample) => Number.isFinite(sample) && sample >= 0
          ) &&
          statistics.p95 <= PERFORMANCE_P95_BUDGET_MILLISECONDS &&
          statistics.maximum <=
            PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS &&
          actors.length === 99 &&
          actors.every(
            (actor) =>
              Number.isFinite(actor.center.x) &&
              Number.isFinite(actor.center.y) &&
              Number.isFinite(actor.center.z)
          ) &&
          flightStates.length === 99 &&
          flightStates.every(isFiniteFlightState) &&
          targetStates.length === 99 &&
          targetStates.every(
            (state) =>
              state.targetId !== null &&
              stressFixture.targetIds.has(state.targetId) &&
              state.provenance === "alert" &&
              state.mode === "chase"
          ) &&
          progressedIds.size === initialPositions.size &&
          observedCrossBandProgress,
        detail
      }),
      metric: Object.freeze({
        label: "99体帯間追跡 update",
        value:
          `p50 ${statistics.p50.toFixed(3)} / ` +
          `p95 ${statistics.p95.toFixed(3)} / ` +
          `max ${statistics.maximum.toFixed(3)} ms`
      })
    });
  } finally {
    system.dispose();
    stage.dispose();
  }
};

const runLoaderFixtureLifecycleCheck = async (
  fixture: BitSystemAcceptanceFixture
): Promise<BitSystemAcceptanceCheck> => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const baseline = countSceneResources(scene);
  const assets = await createLoaderFixtureAssets(fixture);
  const restoreFetch = installLoaderFixtureFetch(assets);
  let context: StageSpatialContext | null = null;
  try {
    context = await loadStageSpatialContext(scene, assets.catalog, {
      initializeDynamicSpatial:
        createSchoolStageDynamicSpatialInitializer(0)
    });
    const navigation = context.bitNavigation;
    const firstZoneId = navigation.zones[0]?.id;
    if (!firstZoneId) {
      throw new Error("実loader fixtureに飛行ゾーンがありません。");
    }
    const loadedZoneCount = navigation.zones.length;
    const loadedBandCount = navigation.bands.length;
    const loadedTransitionCount = navigation.transitions.length;
    const worldBoundary = context.worldBoundary;
    const worldBoundaryQueries =
      worldBoundary !== null &&
      worldBoundary.id === "world-limit" &&
      worldBoundary.contains(new Vector3(0, 2.5, 0)) &&
      worldBoundary.contains(new Vector3(12, 10.5, 12)) &&
      !worldBoundary.contains(new Vector3(12.01, 2.5, 0)) &&
      Vector3.DistanceSquared(
        worldBoundary.findExitPoint(
          new Vector3(0, 2.5, 0),
          new Vector3(13, 2.5, 0)
        ) ?? new Vector3(Number.NaN, 0, 0),
        new Vector3(12, 2.5, 0)
      ) <= 1e-10 &&
      Vector3.DistanceSquared(
        worldBoundary.findExitPoint(
          new Vector3(0, 2.5, 0),
          new Vector3(13, 11.1666666667, 13)
        ) ?? new Vector3(Number.NaN, 0, 0),
        new Vector3(12, 10.5, 12)
      ) <= 1e-10 &&
      worldBoundary.findExitPoint(
        new Vector3(0, 2.5, 0),
        new Vector3(1, 2.5, 0)
      ) === null;
    const loaded =
      context.metadata.stageId === LOADER_FIXTURE_STAGE_ID &&
      loadedZoneCount === fixture.definition.zones.length &&
      loadedBandCount === fixture.definition.bands.length &&
      loadedTransitionCount === 1 &&
      context.volumes.getByRole("npc_spawn").length === 1 &&
      context.volumes.getByRole("npc_spawn_bias").length === 1 &&
      context.volumes.getByRole("npc_spawn_bias")[0]
        .playerSpawnId === "loader-player-spawn" &&
      context.volumes.getByRole("npc_spawn_bias")[0]
        .npcSpawnBiasWeight === 0.5 &&
      context.volumes.getByRole("bit_spawn").length === 1 &&
      context.locationAssets === null &&
      worldBoundaryQueries;
    context.dispose();
    context = null;
    const disposedReferenceMessage = captureThrownMessage(() =>
      navigation.getZone(firstZoneId)
    );
    const disposedWorldBoundaryMessage = captureThrownMessage(() =>
      worldBoundary?.contains(Vector3.Zero())
    );
    const afterDispose = countSceneResources(scene);
    return Object.freeze({
      name: "非学校fixtureを実GLB・両NavMesh・SHA検証経由で読込・破棄",
      ok:
        loaded &&
        disposedReferenceMessage?.includes("破棄済み") === true &&
        disposedWorldBoundaryMessage?.includes("破棄済み") === true &&
        sceneResourceCountsEqual(baseline, afterDispose),
      detail:
        `zones=${loadedZoneCount} / ` +
        `bands=${loadedBandCount} / ` +
        `transitions=${loadedTransitionCount} / ` +
        `boundary=${worldBoundaryQueries} / ` +
        `oldRef=${disposedReferenceMessage ?? "例外なし"} / ` +
        `oldBoundary=${disposedWorldBoundaryMessage ?? "例外なし"} / ` +
        `baseline=${JSON.stringify(baseline)} / ` +
        `disposed=${JSON.stringify(afterDispose)}`
    });
  } finally {
    context?.dispose();
    restoreFetch();
    scene.dispose();
    engine.dispose();
  }
};

const runLoaderWorldBoundaryPolicyCheck = async (
  fixture: BitSystemAcceptanceFixture
): Promise<BitSystemAcceptanceCheck> => {
  const cases = [
    Object.freeze({
      label: "required欠落",
      variant: "missing" as const,
      mode: "required" as const,
      shouldLoad: false
    }),
    Object.freeze({
      label: "required重複",
      variant: "duplicate" as const,
      mode: "required" as const,
      shouldLoad: false
    }),
    Object.freeze({
      label: "extras不正",
      variant: "invalid-extras" as const,
      mode: "required" as const,
      shouldLoad: false
    }),
    Object.freeze({
      label: "BND_Stageはみ出し",
      variant: "outside-stage" as const,
      mode: "required" as const,
      shouldLoad: false
    }),
    Object.freeze({
      label: "unsupported混入",
      variant: "valid" as const,
      mode: "unsupported" as const,
      shouldLoad: false
    }),
    Object.freeze({
      label: "unsupported境界なし",
      variant: "missing" as const,
      mode: "unsupported" as const,
      shouldLoad: true
    })
  ];
  const details: string[] = [];
  let allPassed = true;
  for (const testCase of cases) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const baseline = countSceneResources(scene);
    const assets = await createLoaderFixtureAssets(
      fixture,
      testCase.variant,
      testCase.mode
    );
    const restoreFetch = installLoaderFixtureFetch(assets);
    let context: StageSpatialContext | null = null;
    let message: string | null = null;
    let loadedAsExpected = false;
    try {
      try {
        context = await loadStageSpatialContext(
          scene,
          assets.catalog,
          {
            initializeDynamicSpatial:
              createSchoolStageDynamicSpatialInitializer(0)
          }
        );
        loadedAsExpected =
          testCase.shouldLoad &&
          context.worldBoundary === null;
      } catch (error) {
        message =
          error instanceof Error ? error.message : String(error);
        loadedAsExpected =
          !testCase.shouldLoad && message.length > 0;
      }
      context?.dispose();
      context = null;
      const resourcesReturned = sceneResourceCountsEqual(
        baseline,
        countSceneResources(scene)
      );
      allPassed =
        allPassed && loadedAsExpected && resourcesReturned;
      details.push(
        `${testCase.label}=${loadedAsExpected ? "ok" : message ?? "unexpected-load"}` +
          `/resources=${resourcesReturned}`
      );
    } finally {
      restoreFetch();
      scene.dispose();
      engine.dispose();
    }
  }
  return Object.freeze({
    name: "worldBoundaryModeとGLB境界個数・extras・内包をloaderで厳格検証",
    ok: allPassed,
    detail: details.join(" / ")
  });
};

const runLoaderNpcSpawnBiasContractCheck = async (
  fixture: BitSystemAcceptanceFixture
): Promise<BitSystemAcceptanceCheck> => {
  const cases = [
    Object.freeze({
      label: "weight下限境界",
      variant: "minimum-weight" as const,
      shouldLoad: true,
      expectedBiasCount: 1,
      expectedErrorFragments: Object.freeze([] as string[])
    }),
    Object.freeze({
      label: "weight上限境界",
      variant: "maximum-weight" as const,
      shouldLoad: true,
      expectedBiasCount: 1,
      expectedErrorFragments: Object.freeze([] as string[])
    }),
    Object.freeze({
      label: "同一Player非overlap複数",
      variant: "same-player-disjoint" as const,
      shouldLoad: true,
      expectedBiasCount: 2,
      expectedErrorFragments: Object.freeze([] as string[])
    }),
    Object.freeze({
      label: "同一Player面接触",
      variant: "same-player-face-touch" as const,
      shouldLoad: true,
      expectedBiasCount: 2,
      expectedErrorFragments: Object.freeze([] as string[])
    }),
    Object.freeze({
      label: "同一Player水平面接触",
      variant: "same-player-horizontal-face-touch" as const,
      shouldLoad: true,
      expectedBiasCount: 2,
      expectedErrorFragments: Object.freeze([] as string[])
    }),
    Object.freeze({
      label: "別Player overlap",
      variant: "different-player-overlap" as const,
      shouldLoad: true,
      expectedBiasCount: 2,
      expectedErrorFragments: Object.freeze([] as string[])
    }),
    Object.freeze({
      label: "Player参照欠落",
      variant: "missing-player-spawn-id" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["hs_player_spawn_id"])
    }),
    Object.freeze({
      label: "weight欠落",
      variant: "missing-weight" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["hs_weight"])
    }),
    Object.freeze({
      label: "weight下限未満",
      variant: "below-minimum-weight" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze([
        "hs_weightは0.000001以上1000000以下"
      ])
    }),
    Object.freeze({
      label: "weight上限超過",
      variant: "above-maximum-weight" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze([
        "hs_weightは0.000001以上1000000以下"
      ])
    }),
    Object.freeze({
      label: "weightゼロ",
      variant: "zero-weight" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze([
        "hs_weightは0.000001以上1000000以下"
      ])
    }),
    Object.freeze({
      label: "weight負数",
      variant: "negative-weight" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze([
        "hs_weightは0.000001以上1000000以下"
      ])
    }),
    Object.freeze({
      label: "weight文字列",
      variant: "string-weight" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["hs_weight"])
    }),
    Object.freeze({
      label: "未許可property",
      variant: "unexpected-property" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["hs_unexpected"])
    }),
    Object.freeze({
      label: "孤立Player参照",
      variant: "orphan-player-spawn" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["未登録player_spawn"])
    }),
    Object.freeze({
      label: "基礎npc_spawn外",
      variant: "outside-npc-spawn" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["npc_spawn"])
    }),
    Object.freeze({
      label: "hs_id重複",
      variant: "duplicate-id" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["hs_idが重複"])
    }),
    Object.freeze({
      label: "同一Player正面積overlap",
      variant: "same-player-overlap" as const,
      shouldLoad: false,
      expectedBiasCount: 0,
      expectedErrorFragments: Object.freeze(["正面積重複"])
    })
  ];
  const details: string[] = [];
  let allPassed = true;
  for (const testCase of cases) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const baseline = countSceneResources(scene);
    const assets = await createLoaderFixtureAssets(
      fixture,
      "valid",
      "required",
      testCase.variant
    );
    const restoreFetch = installLoaderFixtureFetch(assets);
    let context: StageSpatialContext | null = null;
    let message: string | null = null;
    let matchedContract = false;
    try {
      try {
        context = await loadStageSpatialContext(
          scene,
          assets.catalog,
          {
            initializeDynamicSpatial:
              createSchoolStageDynamicSpatialInitializer(0)
          }
        );
        const biases = context.volumes.getByRole("npc_spawn_bias");
        matchedContract =
          testCase.shouldLoad &&
          biases.length === testCase.expectedBiasCount &&
          biases.every(
            (bias) =>
              bias.playerSpawnId !== null &&
              bias.npcSpawnBiasWeight !== null &&
              bias.npcSpawnBiasWeight >= 0.000001 &&
              bias.npcSpawnBiasWeight <= 1_000_000
          );
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        matchedContract =
          !testCase.shouldLoad &&
          testCase.expectedErrorFragments.every((fragment) =>
            message!.includes(fragment)
          );
      }
      context?.dispose();
      context = null;
      const resourcesReturned = sceneResourceCountsEqual(
        baseline,
        countSceneResources(scene)
      );
      allPassed = allPassed && matchedContract && resourcesReturned;
      details.push(
        `${testCase.label}=${matchedContract ? "ok" : message ?? "unexpected-load"}` +
          `/resources=${resourcesReturned}`
      );
    } finally {
      restoreFetch();
      scene.dispose();
      engine.dispose();
    }
  }
  return Object.freeze({
    name: "NPC spawn bias metadata・参照・weight・overlap実loader契約",
    ok: allPassed,
    detail: details.join(" / ")
  });
};

const runSchoolPerformanceAndLifecycleChecks = async (
  fixture: BitSystemAcceptanceFixture
): Promise<BitSystemAcceptanceResult> => {
  document.title = "T05学校受入: 資産読込";
  await yieldToBrowser();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const baseline = countSceneResources(scene);
  const checks: BitSystemAcceptanceCheck[] = [];
  const metrics: BitSystemAcceptanceMetric[] = [];
  const loaderFixtureAssets = await createLoaderFixtureAssets(fixture);
  const restoreFixtureFetch =
    installLoaderFixtureFetch(loaderFixtureAssets);
  let schoolContext: StageSpatialContext | null = null;
  let fixtureContext: StageSpatialContext | null = null;
  let fixtureSystem: V2BitSystem | null = null;
  try {
    schoolContext = await loadStageSpatialContext(
      scene,
      SCHOOL_VALIDATION_STAGE,
      {
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(0),
        roomVariantSelections:
          SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
      }
    );
    document.title =
      `T05学校受入: 99体探索 warmup 0/${PERFORMANCE_WARMUP_TICKS}`;
    await yieldToBrowser();
    const schoolNpcSpawnVolumes =
      schoolContext.volumes.getByRole("npc_spawn");
    const schoolNpcSpawnBiasVolumes =
      schoolContext.volumes.getByRole("npc_spawn_bias");
    const schoolNpcSpawnChannelSummaries =
      schoolContext.playerSpawns.all.map((playerSpawn) => {
        const sampler = createStageNpcSpawnSampler(
          schoolNpcSpawnVolumes,
          playerSpawn.npcSpawnBiasVolumes,
          playerSpawn.id,
          schoolContext!.navigation,
          {
            maxAttempts: 1,
            projectionMaxDistance: 0.75,
            random: () => 0.5
          }
        );
        return Object.freeze({
          playerSpawnId: playerSpawn.id,
          biasIds: Object.freeze(
            playerSpawn.npcSpawnBiasVolumes.map((volume) => volume.id)
          ),
          channels: sampler.channels,
          totalWeight: sampler.totalWeight
        });
      });
    const actualPlayerSpawnIds = new Set(
      schoolNpcSpawnChannelSummaries.map((summary) => summary.playerSpawnId)
    );
    checks.push(
      Object.freeze({
        name: "実学校11開始地点のNPC bias 1対1・weight・正面積channel",
        ok:
          schoolNpcSpawnBiasVolumes.length ===
            SCHOOL_PLAYER_SPAWN_IDS.length &&
          actualPlayerSpawnIds.size === SCHOOL_PLAYER_SPAWN_IDS.length &&
          SCHOOL_PLAYER_SPAWN_IDS.every((id) =>
            actualPlayerSpawnIds.has(id)
          ) &&
          schoolNpcSpawnChannelSummaries.every(
            (summary) =>
              summary.biasIds.length === 1 &&
              summary.channels.length === 2 &&
              summary.channels[0].channelId === "npc-spawn-base" &&
              summary.channels[0].weight === 1 &&
              summary.channels[0].area > 0 &&
              summary.channels[1].channelId ===
                `npc-spawn-bias:${summary.biasIds[0]}` &&
              summary.channels[1].weight === 0.5 &&
              summary.channels[1].area > 0 &&
              Math.abs(summary.totalWeight - 1.5) <= 1e-10
          ),
        detail: schoolNpcSpawnChannelSummaries
          .map(
            (summary) =>
              `${summary.playerSpawnId}:${summary.biasIds.join(",")}` +
              `/areas=${summary.channels.map((channel) => channel.area.toFixed(3)).join(",")}` +
              `/weight=${summary.totalWeight}`
          )
          .join(" | ")
      })
    );
    const schoolWorldBoundaryRequired =
      schoolContext.worldBoundary?.id === "world-limit";
    const schoolNavigation = schoolContext.bitNavigation;
    const schoolPerformanceStage = createFixtureSpawnRoleStage(
      schoolContext,
      "bit_spawn",
      Object.freeze(["bit-spawn-outdoor-f1"])
    );
    const schoolZoneId = schoolNavigation.zones[0]?.id;
    if (!schoolZoneId) {
      throw new Error("学校Contextに飛行ゾーンがありません。");
    }

    let searchRandomState = 0xbb67ae85;
    const searchRandom = () => {
      searchRandomState =
        (Math.imul(searchRandomState, 1664525) + 1013904223) >>> 0;
      return searchRandomState / 0x1_0000_0000;
    };
    const searchSystem = createSystem(
      scene,
      schoolPerformanceStage,
      searchRandom,
      99,
      0.08
    );
    try {
      searchSystem.setDiagnosticsEnabled(true);
      let maximumSearchRoutePlansPerUpdate = 0;
      const initialPositions = createInitialPositionMap(
        searchSystem.getFrameView().flightStates
      );
      const progressedIds = new Set<string>();
      const firstProgressTickById = new Map<string, number>();
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_WARMUP_TICKS;
        frameIndex += 1
      ) {
        searchSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds: frameIndex * PERFORMANCE_DELTA_SECONDS,
          targets: EMPTY_TARGETS,
          externalAlerts: EMPTY_ALERTS
        });
        const frameView = searchSystem.getFrameView();
        maximumSearchRoutePlansPerUpdate = Math.max(
          maximumSearchRoutePlansPerUpdate,
          frameView.diagnostics.routePlans.search
        );
        recordFlightProgress(
          frameView.flightStates,
          initialPositions,
          progressedIds,
          firstProgressTickById,
          frameIndex + 1
        );
        document.title =
          `T05学校受入: 99体探索 warmup ${frameIndex + 1}/` +
          `${PERFORMANCE_WARMUP_TICKS}`;
        await yieldToBrowser();
      }
      const samples: number[] = [];
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_MEASURED_TICKS;
        frameIndex += 1
      ) {
        const startedAt = performance.now();
        searchSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds:
            (PERFORMANCE_WARMUP_TICKS + frameIndex) *
            PERFORMANCE_DELTA_SECONDS,
          targets: EMPTY_TARGETS,
          externalAlerts: EMPTY_ALERTS
        });
        samples.push(performance.now() - startedAt);
        const frameView = searchSystem.getFrameView();
        maximumSearchRoutePlansPerUpdate = Math.max(
          maximumSearchRoutePlansPerUpdate,
          frameView.diagnostics.routePlans.search
        );
        recordFlightProgress(
          frameView.flightStates,
          initialPositions,
          progressedIds,
          firstProgressTickById,
          PERFORMANCE_WARMUP_TICKS + frameIndex + 1
        );
        document.title =
          `T05学校受入: 99体探索 measure ${frameIndex + 1}/` +
          `${PERFORMANCE_MEASURED_TICKS}`;
        await yieldToBrowser();
      }
      const bruteForceSamples: number[] = [];
      let bruteForceMaximumSample = Number.NEGATIVE_INFINITY;
      let bruteForceMaximumFrameIndex = 0;
      let bruteForceMaximumRoutePlans = 0;
      let bruteForceMaximumRoutePlanMilliseconds = 0;
      let bruteForceMaximumSphereSweeps = 0;
      let bruteForceMaximumSphereSweepMilliseconds = 0;
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_BRUTE_FORCE_MEASURED_TICKS;
        frameIndex += 1
      ) {
        const startedAt = performance.now();
        searchSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds:
            BRUTE_FORCE_START_SECONDS_FOR_ACCEPTANCE +
            frameIndex * PERFORMANCE_DELTA_SECONDS,
          targets: EMPTY_TARGETS,
          externalAlerts: EMPTY_ALERTS
        });
        const sample = performance.now() - startedAt;
        bruteForceSamples.push(sample);
        const frameView = searchSystem.getFrameView();
        if (sample > bruteForceMaximumSample) {
          bruteForceMaximumSample = sample;
          bruteForceMaximumFrameIndex = frameIndex;
          bruteForceMaximumRoutePlans =
            frameView.diagnostics.routePlans.search;
          bruteForceMaximumRoutePlanMilliseconds =
            frameView.diagnostics.routePlanMilliseconds.search;
          bruteForceMaximumSphereSweeps =
            frameView.diagnostics.sphereSweeps;
          bruteForceMaximumSphereSweepMilliseconds =
            frameView.diagnostics.sphereSweepMilliseconds;
        }
        maximumSearchRoutePlansPerUpdate = Math.max(
          maximumSearchRoutePlansPerUpdate,
          frameView.diagnostics.routePlans.search
        );
        document.title =
          `T05学校受入: 99体総当たり探索 ${frameIndex + 1}/` +
          `${PERFORMANCE_BRUTE_FORCE_MEASURED_TICKS}`;
        await yieldToBrowser();
      }
      const actors = searchSystem.getFrameView().actorSpheres;
      const flightStates = searchSystem.getFrameView().flightStates;
      const statistics = describeSamples(samples);
      const bruteForceStatistics =
        describeSamples(bruteForceSamples);
      const maximumProgressWaitTicks = Math.max(
        ...firstProgressTickById.values()
      );
      checks.push({
        name: "学校72遷移Contextで99体探索を1/60秒tick性能予算内に維持",
        ok:
          schoolNavigation.transitions.length === 72 &&
          samples.length === PERFORMANCE_MEASURED_TICKS &&
          samples.every(
            (sample) => Number.isFinite(sample) && sample >= 0
          ) &&
          bruteForceSamples.length ===
            PERFORMANCE_BRUTE_FORCE_MEASURED_TICKS &&
          bruteForceSamples.every(
            (sample) => Number.isFinite(sample) && sample >= 0
          ) &&
          statistics.p95 <= PERFORMANCE_P95_BUDGET_MILLISECONDS &&
          statistics.maximum <=
            PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS &&
          bruteForceStatistics.p95 <=
            PERFORMANCE_P95_BUDGET_MILLISECONDS &&
          bruteForceStatistics.maximum <=
            PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS &&
          actors.length === 99 &&
          actors.every(
            (actor) =>
              Number.isFinite(actor.center.x) &&
              Number.isFinite(actor.center.y) &&
              Number.isFinite(actor.center.z)
          ) &&
          flightStates.length === 99 &&
          flightStates.every(isFiniteFlightState) &&
          progressedIds.size === initialPositions.size &&
          firstProgressTickById.size === initialPositions.size &&
          maximumSearchRoutePlansPerUpdate <= 4,
        detail:
          `transitions=${schoolNavigation.transitions.length} / ` +
          `tick=${PERFORMANCE_DELTA_SECONDS.toFixed(6)}s / ` +
          `warmup=${PERFORMANCE_WARMUP_TICKS} / ` +
          `measured=${samples.length} / actors=${actors.length} / ` +
          `p50=${statistics.p50.toFixed(3)}ms / ` +
          `p95=${statistics.p95.toFixed(3)}/${PERFORMANCE_P95_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `max=${statistics.maximum.toFixed(3)}/${PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `total=${statistics.total.toFixed(3)}ms / ` +
          `bruteP95=${bruteForceStatistics.p95.toFixed(3)}ms / ` +
          `bruteMax=${bruteForceStatistics.maximum.toFixed(3)}ms / ` +
          `bruteMaxFrame=${bruteForceMaximumFrameIndex} / ` +
          `bruteMaxPlans=${bruteForceMaximumRoutePlans}/` +
          `${bruteForceMaximumRoutePlanMilliseconds.toFixed(3)}ms / ` +
          `bruteMaxSweeps=${bruteForceMaximumSphereSweeps}/` +
          `${bruteForceMaximumSphereSweepMilliseconds.toFixed(3)}ms / ` +
          `progressed=${progressedIds.size}/${initialPositions.size} / ` +
          `maxPlans=${maximumSearchRoutePlansPerUpdate}/4 / ` +
          `maxWait=${maximumProgressWaitTicks}tick/` +
          `${(maximumProgressWaitTicks * PERFORMANCE_DELTA_SECONDS).toFixed(3)}s`
      });
      metrics.push({
        label: "学校99体探索 update",
        value:
          `p50 ${statistics.p50.toFixed(3)} / ` +
          `p95 ${statistics.p95.toFixed(3)} / ` +
          `max ${statistics.maximum.toFixed(3)} / ` +
          `total ${statistics.total.toFixed(3)} ms`
      });
      metrics.push({
        label: "学校99体探索の最大計画待ち",
        value:
          `${maximumProgressWaitTicks} tick / ` +
          `${(maximumProgressWaitTicks * PERFORMANCE_DELTA_SECONDS).toFixed(3)} s`
      });
      metrics.push({
        label: "学校99体総当たり探索 update",
        value:
          `p50 ${bruteForceStatistics.p50.toFixed(3)} / ` +
          `p95 ${bruteForceStatistics.p95.toFixed(3)} / ` +
          `max ${bruteForceStatistics.maximum.toFixed(3)} / ` +
          `total ${bruteForceStatistics.total.toFixed(3)} ms`
      });
    } finally {
      searchSystem.dispose();
    }

    const adjacentOutdoorTransition = schoolNavigation.transitions.find(
      (transition) =>
        transition.id === "school-exterior-f1-f2" &&
        transition.kind === "vertical"
    );
    if (!adjacentOutdoorTransition) {
      throw new Error("学校屋外F1→F2のvertical遷移がありません。");
    }
    let chaseRandomState = 0xa54ff53a;
    let forceNormalChase = false;
    const chaseRandom = () => {
      if (forceNormalChase) {
        return 0.5;
      }
      chaseRandomState =
        (Math.imul(chaseRandomState, 1664525) + 1013904223) >>> 0;
      return chaseRandomState / 0x1_0000_0000;
    };
    const chaseSystem = createSystem(
      scene,
      schoolPerformanceStage,
      chaseRandom,
      99,
      0.08
    );
    try {
      const initialPositions = createInitialPositionMap(
        chaseSystem.getFrameView().flightStates
      );
      const progressedIds = new Set<string>();
      const firstProgressTickById = new Map<string, number>();
      forceNormalChase = true;
      document.title =
        `T05学校受入: 99体追跡 warmup 0/${PERFORMANCE_WARMUP_TICKS}`;
      await yieldToBrowser();
      const stressFixture = createExternalAlertStressFixture(
        "school-adjacent-outdoor",
        adjacentOutdoorTransition.toPosition.clone()
      );
      let observedAdjacentVertical = false;
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_WARMUP_TICKS;
        frameIndex += 1
      ) {
        chaseSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds: frameIndex * PERFORMANCE_DELTA_SECONDS,
          targets: stressFixture.targets,
          externalAlerts:
            frameIndex === 0 ? stressFixture.alerts : EMPTY_ALERTS
        });
        recordFlightProgress(
          chaseSystem.getFrameView().flightStates,
          initialPositions,
          progressedIds,
          firstProgressTickById,
          frameIndex + 1
        );
        observedAdjacentVertical =
          observedAdjacentVertical ||
          chaseSystem
            .getFrameView().flightStates
            .some(
              (state) =>
                state.activeTransition?.id ===
                  adjacentOutdoorTransition.id ||
                (state.zoneId === adjacentOutdoorTransition.to.zoneId &&
                  state.bandId === adjacentOutdoorTransition.to.bandId)
            );
        document.title =
          `T05学校受入: 99体追跡 warmup ${frameIndex + 1}/` +
          `${PERFORMANCE_WARMUP_TICKS}`;
        await yieldToBrowser();
      }

      const samples: number[] = [];
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_MEASURED_TICKS;
        frameIndex += 1
      ) {
        const startedAt = performance.now();
        chaseSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds:
            (PERFORMANCE_WARMUP_TICKS + frameIndex) *
            PERFORMANCE_DELTA_SECONDS,
          targets: stressFixture.targets,
          externalAlerts: EMPTY_ALERTS
        });
        samples.push(performance.now() - startedAt);
        recordFlightProgress(
          chaseSystem.getFrameView().flightStates,
          initialPositions,
          progressedIds,
          firstProgressTickById,
          PERFORMANCE_WARMUP_TICKS + frameIndex + 1
        );
        observedAdjacentVertical =
          observedAdjacentVertical ||
          chaseSystem
            .getFrameView().flightStates
            .some(
              (state) =>
                state.activeTransition?.id ===
                  adjacentOutdoorTransition.id ||
                (state.zoneId === adjacentOutdoorTransition.to.zoneId &&
                  state.bandId === adjacentOutdoorTransition.to.bandId)
            );
        document.title =
          `T05学校受入: 99体追跡 measure ${frameIndex + 1}/` +
          `${PERFORMANCE_MEASURED_TICKS}`;
        await yieldToBrowser();
      }
      const actors = chaseSystem.getFrameView().actorSpheres;
      const flightStates = chaseSystem.getFrameView().flightStates;
      const targetStates = chaseSystem.getFrameView().targetStates;
      const statistics = describeSamples(samples);
      const maximumProgressWaitTicks = Math.max(
        ...firstProgressTickById.values()
      );
      const assignedTargetStateCount = targetStates.filter(
        (state) =>
          state.targetId !== null &&
          stressFixture.targetIds.has(state.targetId)
      ).length;
      const chaseTargetStateCount = targetStates.filter(
        (state) => state.mode === "chase"
      ).length;
      checks.push({
        name: "学校99体の屋外隣接帯vertical追跡を1/60秒tick性能予算内に維持",
        ok:
          samples.length === PERFORMANCE_MEASURED_TICKS &&
          samples.every(
            (sample) => Number.isFinite(sample) && sample >= 0
          ) &&
          statistics.p95 <= PERFORMANCE_P95_BUDGET_MILLISECONDS &&
          statistics.maximum <=
            PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS &&
          actors.length === 99 &&
          actors.every(
            (actor) =>
              Number.isFinite(actor.center.x) &&
              Number.isFinite(actor.center.y) &&
              Number.isFinite(actor.center.z)
          ) &&
          flightStates.length === 99 &&
          flightStates.every(isFiniteFlightState) &&
          targetStates.length === 99 &&
          targetStates.every(
            (state) =>
              state.targetId !== null &&
              stressFixture.targetIds.has(state.targetId) &&
              state.mode === "chase"
          ) &&
          progressedIds.size === initialPositions.size &&
          firstProgressTickById.size === initialPositions.size &&
          observedAdjacentVertical,
        detail:
          `transition=${adjacentOutdoorTransition.id} / ` +
          `observed=${observedAdjacentVertical} / ` +
          `tick=${PERFORMANCE_DELTA_SECONDS.toFixed(6)}s / ` +
          `warmup=${PERFORMANCE_WARMUP_TICKS} / ` +
          `measured=${samples.length} / actors=${actors.length} / ` +
          `p50=${statistics.p50.toFixed(3)}ms / ` +
          `p95=${statistics.p95.toFixed(3)}/${PERFORMANCE_P95_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `max=${statistics.maximum.toFixed(3)}/${PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `total=${statistics.total.toFixed(3)}ms / ` +
          `targets=${assignedTargetStateCount}/${targetStates.length} / ` +
          `chase=${chaseTargetStateCount}/${targetStates.length} / ` +
          `progressed=${progressedIds.size}/${initialPositions.size} / ` +
          `maxWait=${maximumProgressWaitTicks}tick/` +
          `${(maximumProgressWaitTicks * PERFORMANCE_DELTA_SECONDS).toFixed(3)}s`
      });
      metrics.push({
        label: "学校99体隣接帯追跡 update",
        value:
          `p50 ${statistics.p50.toFixed(3)} / ` +
          `p95 ${statistics.p95.toFixed(3)} / ` +
          `max ${statistics.maximum.toFixed(3)} / ` +
          `total ${statistics.total.toFixed(3)} ms`
      });
      metrics.push({
        label: "学校99体追跡の最大計画待ち",
        value:
          `${maximumProgressWaitTicks} tick / ` +
          `${(maximumProgressWaitTicks * PERFORMANCE_DELTA_SECONDS).toFixed(3)} s`
      });

      const measuredEndTick =
        PERFORMANCE_WARMUP_TICKS + PERFORMANCE_MEASURED_TICKS;
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_TARGET_LOSS_SETTLE_TICKS;
        frameIndex += 1
      ) {
        chaseSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds:
            (measuredEndTick + frameIndex) *
            PERFORMANCE_DELTA_SECONDS,
          targets: stressFixture.targets,
          externalAlerts: EMPTY_ALERTS
        });
      }
      const positionsBeforeLoss = createInitialPositionMap(
        chaseSystem.getFrameView().flightStates
      );
      const unavailableTargets = Object.freeze(
        stressFixture.targets.map((target) =>
          Object.freeze({
            ...target,
            alive: false
          })
        )
      );
      const performanceElapsedSeconds =
        (
          measuredEndTick +
          PERFORMANCE_TARGET_LOSS_SETTLE_TICKS
        ) *
        PERFORMANCE_DELTA_SECONDS;
      const lossStartedAt = performance.now();
      chaseSystem.update({
        deltaSeconds: PERFORMANCE_DELTA_SECONDS,
        elapsedSeconds: performanceElapsedSeconds,
        targets: unavailableTargets,
        externalAlerts: EMPTY_ALERTS
      });
      const lossUpdateMilliseconds = performance.now() - lossStartedAt;
      const escapeProgressedIds = new Set<string>();
      const escapeStartedIds = new Set<string>();
      const recordEscapeStarts = (
        states: readonly V2BitFlightState[]
      ) => {
        for (const state of states) {
          if (state.routePurpose === "escape") {
            escapeStartedIds.add(state.bitId);
          }
        }
      };
      recordEscapeStarts(chaseSystem.getFrameView().flightStates);
      recordFlightProgress(
        chaseSystem.getFrameView().flightStates,
        positionsBeforeLoss,
        escapeProgressedIds
      );
      const lossRecoverySamples: number[] = [];
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_TARGET_LOSS_RECOVERY_TICKS;
        frameIndex += 1
      ) {
        const recoveryStartedAt = performance.now();
        chaseSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds:
            performanceElapsedSeconds +
            (frameIndex + 1) * PERFORMANCE_DELTA_SECONDS,
          targets: unavailableTargets,
          externalAlerts: EMPTY_ALERTS
        });
        lossRecoverySamples.push(
          performance.now() - recoveryStartedAt
        );
        recordEscapeStarts(chaseSystem.getFrameView().flightStates);
        recordFlightProgress(
          chaseSystem.getFrameView().flightStates,
          positionsBeforeLoss,
          escapeProgressedIds
        );
      }
      const lossFollowUpSamples: number[] = [];
      for (
        let frameIndex = 0;
        frameIndex < PERFORMANCE_TARGET_LOSS_FOLLOW_UP_TICKS;
        frameIndex += 1
      ) {
        const followUpStartedAt = performance.now();
        chaseSystem.update({
          deltaSeconds: PERFORMANCE_DELTA_SECONDS,
          elapsedSeconds:
            performanceElapsedSeconds +
            (
              PERFORMANCE_TARGET_LOSS_RECOVERY_TICKS +
              frameIndex +
              1
            ) *
              PERFORMANCE_DELTA_SECONDS,
          targets: unavailableTargets,
          externalAlerts: EMPTY_ALERTS
        });
        lossFollowUpSamples.push(
          performance.now() - followUpStartedAt
        );
        recordEscapeStarts(chaseSystem.getFrameView().flightStates);
        recordFlightProgress(
          chaseSystem.getFrameView().flightStates,
          positionsBeforeLoss,
          escapeProgressedIds
        );
      }
      const afterLossTargets = chaseSystem.getFrameView().targetStates;
      const afterLossFlights = chaseSystem.getFrameView().flightStates;
      const lossRecoveryStatistics =
        describeSamples(lossRecoverySamples);
      const lossFollowUpStatistics =
        describeSamples(lossFollowUpSamples);
      const missingEscapeStates = afterLossFlights.filter(
        (state) => !escapeStartedIds.has(state.bitId)
      );
      checks.push({
        name: "学校99体の一斉標的喪失と後続逃走を性能予算内で公平に完了",
        ok:
          Number.isFinite(lossUpdateMilliseconds) &&
          lossUpdateMilliseconds >= 0 &&
          lossUpdateMilliseconds <=
            PERFORMANCE_TARGET_LOSS_BUDGET_MILLISECONDS &&
          lossRecoveryStatistics.maximum <=
            PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS &&
          lossFollowUpStatistics.p95 <=
            PERFORMANCE_P95_BUDGET_MILLISECONDS &&
          lossFollowUpStatistics.maximum <=
            PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS &&
          afterLossTargets.length === 99 &&
          afterLossTargets.every((state) => state.targetId === null) &&
          afterLossFlights.length === 99 &&
          afterLossFlights.every(isFiniteFlightState) &&
          escapeStartedIds.size === positionsBeforeLoss.size &&
          escapeProgressedIds.size === positionsBeforeLoss.size,
        detail:
          `lossUpdate=${lossUpdateMilliseconds.toFixed(3)}/` +
          `${PERFORMANCE_TARGET_LOSS_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `recoveryMax=${lossRecoveryStatistics.maximum.toFixed(3)}/` +
          `${PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `followUpP95=${lossFollowUpStatistics.p95.toFixed(3)}/` +
          `${PERFORMANCE_P95_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `followUpMax=${lossFollowUpStatistics.maximum.toFixed(3)}/` +
          `${PERFORMANCE_MAXIMUM_BUDGET_MILLISECONDS.toFixed(3)}ms / ` +
          `released=${afterLossTargets.filter((state) => state.targetId === null).length}/99 / ` +
          `escapeStarted=${escapeStartedIds.size}/${positionsBeforeLoss.size} / ` +
          `progressed=${escapeProgressedIds.size}/${positionsBeforeLoss.size} / ` +
          `missing=${missingEscapeStates.map((state) => `${state.bitId}:${state.zoneId}/${state.bandId}:${state.routePurpose ?? "none"}`).join(",") || "none"}`
      });
      metrics.push({
        label: "学校99体一斉標的喪失 update",
        value: `${lossUpdateMilliseconds.toFixed(3)} ms`
      });
      metrics.push({
        label: "学校99体標的喪失後60fps update",
        value:
          `p95 ${lossFollowUpStatistics.p95.toFixed(3)} / ` +
          `max ${lossFollowUpStatistics.maximum.toFixed(3)} ms`
      });
    } finally {
      chaseSystem.dispose();
    }

    let mixedRandomState = 0x510e527f;
    let assignMixedModes = false;
    let forceMixedChase = false;
    let mixedModeIndex = 0;
    const mixedRandom = () => {
      if (forceMixedChase) {
        return 0.5;
      }
      if (assignMixedModes) {
        const value = mixedModeIndex % 5 === 0 ? 0.05 : 0.5;
        mixedModeIndex += 1;
        return value;
      }
      mixedRandomState =
        (Math.imul(mixedRandomState, 1664525) + 1013904223) >>> 0;
      return mixedRandomState / 0x1_0000_0000;
    };
    const mixedSystem = createSystem(
      scene,
      schoolPerformanceStage,
      mixedRandom,
      99,
      0.08
    );
    try {
      const initialPositions = createInitialPositionMap(
        mixedSystem.getFrameView().flightStates
      );
      const progressedIds = new Set<string>();
      const sameBandStress = createExternalAlertStressFixture(
        "school-mixed-carpet",
        adjacentOutdoorTransition.fromPosition.clone()
      );
      assignMixedModes = true;
      let observedLeader = false;
      let observedFollower = false;
      for (let frameIndex = 0; frameIndex < 40; frameIndex += 1) {
        mixedSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: frameIndex * 0.1,
          targets: sameBandStress.targets,
          externalAlerts:
            frameIndex === 0 ? sameBandStress.alerts : EMPTY_ALERTS
        });
        const targetStates = mixedSystem.getFrameView().targetStates;
        observedLeader =
          observedLeader ||
          targetStates.some((state) => state.mode === "carpet-leader");
        observedFollower =
          observedFollower ||
          targetStates.some((state) => state.mode === "carpet-follower");
        recordFlightProgress(
          mixedSystem.getFrameView().flightStates,
          initialPositions,
          progressedIds
        );
      }

      const crossBandStress = createExternalAlertStressFixture(
        "school-mixed-carpet",
        adjacentOutdoorTransition.toPosition.clone()
      );
      assignMixedModes = false;
      forceMixedChase = true;
      const brainwashedSameBandTargets = Object.freeze(
        sameBandStress.targets.map((target) =>
          Object.freeze({
            ...target,
            brainwashed: true
          })
        )
      );
      mixedSystem.update({
        deltaSeconds: 0.1,
        elapsedSeconds: 4,
        targets: brainwashedSameBandTargets,
        externalAlerts: EMPTY_ALERTS
      });
      const releaseTargetStates = mixedSystem.getFrameView().targetStates;
      let observedCrossBandTransition = false;
      let formationReleased =
        releaseTargetStates.length === 99 &&
        releaseTargetStates.every(
          (state) =>
            state.mode !== "carpet-leader" &&
            state.mode !== "carpet-follower"
        );
      for (let frameIndex = 0; frameIndex < 40; frameIndex += 1) {
        mixedSystem.update({
          deltaSeconds: 0.1,
          elapsedSeconds: 4.1 + frameIndex * 0.1,
          targets: crossBandStress.targets,
          externalAlerts:
            frameIndex === 0 ? crossBandStress.alerts : EMPTY_ALERTS
        });
        const flightStates = mixedSystem.getFrameView().flightStates;
        const targetStates = mixedSystem.getFrameView().targetStates;
        observedCrossBandTransition =
          observedCrossBandTransition ||
          flightStates.some((state) => state.activeTransition !== null);
        formationReleased =
          formationReleased &&
          targetStates.length === 99 &&
          targetStates.every(
            (state) =>
              state.mode !== "carpet-leader" &&
              state.mode !== "carpet-follower"
          );
        recordFlightProgress(
          flightStates,
          initialPositions,
          progressedIds
        );
      }
      checks.push({
        name: "学校99体の混在絨毯編隊を公平予算で計画し帯変更前に全解除",
        ok:
          observedLeader &&
          observedFollower &&
          progressedIds.size === initialPositions.size &&
          formationReleased &&
          observedCrossBandTransition,
        detail:
          `leader=${observedLeader} / follower=${observedFollower} / ` +
          `progressed=${progressedIds.size}/${initialPositions.size} / ` +
          `released=${formationReleased} / ` +
          `transition=${observedCrossBandTransition}`
      });
    } finally {
      mixedSystem.dispose();
    }

    const schoolQueries = schoolContext.queries;
    schoolContext.dispose();
    document.title = "T05学校受入: 連続loader lifecycle";
    await yieldToBrowser();
    schoolContext = null;
    const disposedReferenceMessage = captureThrownMessage(() =>
      schoolNavigation.getZone(schoolZoneId)
    );
    const disposedQueriesMessage = captureThrownMessage(() =>
      schoolQueries.castSightSegment(Vector3.Zero(), Vector3.One())
    );
    const afterSchoolDispose = countSceneResources(scene);

    fixtureContext = await loadStageSpatialContext(
      scene,
      loaderFixtureAssets.catalog,
      {
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(0)
      }
    );
    const fixtureNavigation = fixtureContext.bitNavigation;
    const fixtureZoneId = fixtureNavigation.zones[0]?.id;
    if (!fixtureZoneId) {
      throw new Error("実loader fixtureに飛行ゾーンがありません。");
    }
    const random = createQueuedRandom(ONE_BIT_BEHAVIOR_RANDOM);
    fixtureSystem = createSystem(
      scene,
      fixtureContext,
      random.random
    );
    random.enqueue(0.2, 0.5, 0.999, 0.5);
    fixtureSystem.update({
      deltaSeconds: 0.1,
      elapsedSeconds: 0.1,
      targets: EMPTY_TARGETS,
      externalAlerts: EMPTY_ALERTS
    });
    const fixtureState = getRequiredFlightState(fixtureSystem);
    const fixtureContextActive =
      fixtureState.zoneId === fixture.courtyardRef.zoneId &&
      fixtureState.bandId === fixture.courtyardRef.bandId &&
      isFiniteFlightState(fixtureState);

    fixtureSystem.dispose();
    fixtureSystem = null;
    fixtureContext.dispose();
    fixtureContext = null;
    const disposedFixtureReferenceMessage = captureThrownMessage(() =>
      fixtureNavigation.getZone(fixtureZoneId)
    );
    const afterFixtureDispose = countSceneResources(scene);

    checks.push({
      name: "同一Sceneで学校後に非学校fixtureを実loaderで連続読込・破棄",
      ok:
        disposedReferenceMessage?.includes("破棄済み") === true &&
        disposedQueriesMessage?.includes("破棄済み") === true &&
        disposedFixtureReferenceMessage?.includes("破棄済み") === true &&
        schoolWorldBoundaryRequired &&
        fixtureContextActive &&
        sceneResourceCountsEqual(baseline, afterSchoolDispose) &&
        sceneResourceCountsEqual(baseline, afterFixtureDispose),
      detail:
        `schoolOldRef=${disposedReferenceMessage ?? "例外なし"} / ` +
        `schoolQueries=${disposedQueriesMessage ?? "例外なし"} / ` +
        `schoolBoundaryRequired=${schoolWorldBoundaryRequired} / ` +
        `fixtureOldRef=${disposedFixtureReferenceMessage ?? "例外なし"} / ` +
        `fixtureActive=${fixtureContextActive} / ` +
        `baseline=${JSON.stringify(baseline)} / ` +
        `schoolDisposed=${JSON.stringify(afterSchoolDispose)} / ` +
        `fixtureDisposed=${JSON.stringify(afterFixtureDispose)}`
    });
    return Object.freeze({
      checks: Object.freeze(checks),
      metrics: Object.freeze(metrics)
    });
  } finally {
    fixtureSystem?.dispose();
    fixtureContext?.dispose();
    schoolContext?.dispose();
    restoreFixtureFetch();
    scene.dispose();
    engine.dispose();
  }
};

export const runBitSystemAcceptanceTests = async (
  fixture: BitSystemAcceptanceFixture,
  mode: BitSystemAcceptanceMode = "all"
): Promise<BitSystemAcceptanceResult> => {
  const checks: BitSystemAcceptanceCheck[] = [];
  const metrics: BitSystemAcceptanceMetric[] = [];
  if (mode !== "school") {
    checks.push(
      runActorSphereRadiusCheck(fixture),
      ...runVisualTargetLossChecks(fixture),
      runSightCheckBudgetCheck(fixture),
      ...runCarpetFormationChecks(fixture),
      ...(await runScriptedSearchChecks(fixture)),
      ...runDynamicRevisionChecks(fixture)
    );
    const chasePerformance = runCrossBandChasePerformanceCheck(fixture);
    checks.push(chasePerformance.check);
    metrics.push(chasePerformance.metric);
    try {
      checks.push(
        await runLoaderFixtureLifecycleCheck(fixture),
        await runLoaderWorldBoundaryPolicyCheck(fixture),
        await runLoaderNpcSpawnBiasContractCheck(fixture)
      );
    } catch (error) {
      checks.push({
        name: "非学校fixtureの実loaderライフサイクル検証",
        ok: false,
        detail:
          error instanceof Error ? error.stack ?? error.message : String(error)
      });
    }
  }
  if (mode !== "core") {
    try {
      const schoolAcceptance =
        await runSchoolPerformanceAndLifecycleChecks(fixture);
      checks.push(...schoolAcceptance.checks);
      metrics.push(...schoolAcceptance.metrics);
    } catch (error) {
      checks.push({
        name: "実学校Contextの性能・ライフサイクル検証",
        ok: false,
        detail:
          error instanceof Error ? error.stack ?? error.message : String(error)
      });
    }
  }
  return Object.freeze({
    checks: Object.freeze(checks),
    metrics: Object.freeze(metrics)
  });
};
