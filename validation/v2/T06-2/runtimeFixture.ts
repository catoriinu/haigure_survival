import {
  MeshBuilder,
  TransformNode,
  Vector3,
  type Scene
} from "@babylonjs/core";

import {
  createBitFlightBandRef,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightBand,
  type BitFlightBandRef,
  type BitFlightHeightSelection,
  type BitFlightLocation,
  type BitFlightNavigationWorld,
  type BitFlightRoute,
  type BitFlightRoutePolicy,
  type BitFlightSurfaceRouteStep,
  type BitFlightZone
} from "../../../src/world/bitFlightNavigation";
import type {
  NavigationLocation,
  NavigationRoutePolicy,
  NavigationSurfaceTriangle,
  NavigationWorld
} from "../../../src/world/navigationWorld";
import type {
  StagePlayerSpawn,
  StagePlayerSpawnRegistry,
  StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import type { StageVolume } from "../../../src/world/stageSpatialQueries";

export type SceneResourceCounts = Readonly<{
  meshes: number;
  materials: number;
  transformNodes: number;
  textures: number;
  spriteManagers: number;
}>;

export type SyntheticStageFixture = Readonly<{
  stage: StageSpatialContext;
  selectedPlayerSpawn: StagePlayerSpawn;
  otherPlayerSpawn: StagePlayerSpawn;
  queriedExclusionIds: string[];
  dispose(): void;
}>;

export type SyntheticStageFixtureOptions = Readonly<{
  selectedExcludes?: (point: Vector3) => boolean;
  otherExcludes?: (point: Vector3) => boolean;
  bitSpawnBounds?: Readonly<{
    centerY: number;
    height: number;
  }>;
}>;

export const countSceneResources = (scene: Scene): SceneResourceCounts =>
  Object.freeze({
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    transformNodes: scene.transformNodes.length,
    textures: scene.textures.filter(
      (texture) => texture !== scene.environmentBRDFTexture
    ).length,
    spriteManagers: scene.spriteManagers?.length ?? 0
  });

export const sceneResourceCountsEqual = (
  left: SceneResourceCounts,
  right: SceneResourceCounts
) =>
  left.meshes === right.meshes &&
  left.materials === right.materials &&
  left.transformNodes === right.transformNodes &&
  left.textures === right.textures &&
  left.spriteManagers === right.spriteManagers;

const createTriangle = (
  a: Vector3,
  b: Vector3,
  c: Vector3
): NavigationSurfaceTriangle =>
  Object.freeze({
    a,
    b,
    c,
    area: Vector3.Cross(b.subtract(a), c.subtract(a)).length() / 2
  });

const createSurfaceTriangles = () => {
  const southwest = new Vector3(-5, 0, -5);
  const southeast = new Vector3(5, 0, -5);
  const northeast = new Vector3(5, 0, 5);
  const northwest = new Vector3(-5, 0, 5);
  return Object.freeze([
    createTriangle(southwest, southeast, northeast),
    createTriangle(southwest.clone(), northeast.clone(), northwest)
  ]);
};

const cloneNavigationLocation = (
  location: NavigationLocation
): NavigationLocation =>
  Object.freeze({
    position: location.position.clone(),
    polygonRef: location.polygonRef
  });

const createHumanNavigation = (
  surfaceTriangles: readonly NavigationSurfaceTriangle[],
  debugMesh: ReturnType<typeof MeshBuilder.CreateBox>
): NavigationWorld => {
  const projectPoint = (position: Vector3): NavigationLocation | null => {
    if (Math.abs(position.x) > 5 || Math.abs(position.z) > 5) {
      return null;
    }
    return Object.freeze({
      position: new Vector3(position.x, 0, position.z),
      polygonRef: 1
    });
  };
  const createSurfaceStep = (
    start: NavigationLocation,
    destination: NavigationLocation
  ) =>
    Object.freeze({
      kind: "surface" as const,
      points: Object.freeze([
        cloneNavigationLocation(start),
        cloneNavigationLocation(destination)
      ]),
      distance: Vector3.Distance(start.position, destination.position)
    });
  return Object.freeze({
    getSurfaceTriangles: () => surfaceTriangles,
    projectPoint: (position: Vector3) => projectPoint(position),
    findSurfacePath: (
      start: NavigationLocation,
      destination: NavigationLocation
    ) =>
      createSurfaceStep(start, destination),
    findPath: (
      start: NavigationLocation,
      destination: NavigationLocation,
      _moverKind: Parameters<NavigationWorld["findPath"]>[2],
      routePolicy: NavigationRoutePolicy
    ) => {
      const surfaceStep = createSurfaceStep(start, destination);
      const path = Object.freeze({
        steps: Object.freeze([surfaceStep]),
        destination: cloneNavigationLocation(destination),
        distance: surfaceStep.distance
      });
      return routePolicy.selectRoute(
        Object.freeze([
          Object.freeze({ kind: "surface" as const, path })
        ])
      )?.path ?? null;
    },
    constrainMovement: (
      _start: NavigationLocation,
      destination: Vector3
    ) => projectPoint(destination),
    randomPointAround: () => null,
    createDebugMesh: () => debugMesh,
    dispose: () => {}
  });
};

const createBitNavigation = (
  surfaceTriangles: readonly NavigationSurfaceTriangle[]
): Readonly<{
  navigation: BitFlightNavigationWorld;
  bandRef: BitFlightBandRef;
}> => {
  const zoneId = toBitFlightZoneId("t06-2-zone");
  const bandId = toBitFlightBandId("t06-2-band");
  const bandRef = createBitFlightBandRef(zoneId, bandId);
  const zone: BitFlightZone = Object.freeze({
    id: zoneId,
    spaceKind: "indoor"
  });
  const band: BitFlightBand = Object.freeze({
    zoneId,
    id: bandId,
    minimumCenterHeight: 1,
    maximumCenterHeight: 1.4
  });
  const clampHeight = (height: number) =>
    Math.min(band.maximumCenterHeight, Math.max(band.minimumCenterHeight, height));
  const createLocation = (
    position: Vector3,
    heightMode: BitFlightLocation["heightMode"] = "band"
  ): BitFlightLocation =>
    Object.freeze({
      zoneId,
      bandId,
      surface: Object.freeze({
        position: new Vector3(position.x, 0, position.z),
        polygonRef: 1
      }),
      safeCenterHeight: clampHeight(position.y),
      heightMode
    }) as unknown as BitFlightLocation;
  const createSurfaceRoute = (
    start: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ): BitFlightRoute | null => {
    const step: BitFlightSurfaceRouteStep = Object.freeze({
      kind: "surface",
      band: bandRef,
      points: Object.freeze([start, destination]),
      distance: Vector3.Distance(
        start.surface.position,
        destination.surface.position
      )
    });
    if (!policy.canUseRouteStep(step)) {
      return null;
    }
    return Object.freeze({
      steps: Object.freeze([step]),
      destination,
      distance: step.distance,
      totalCost: step.distance
    });
  };

  const navigation: BitFlightNavigationWorld = Object.freeze({
    zones: Object.freeze([zone]),
    bands: Object.freeze([band]),
    transitions: Object.freeze([]),
    getZone: (id: Parameters<BitFlightNavigationWorld["getZone"]>[0]) =>
      id === zoneId ? zone : null,
    getBand: (ref: BitFlightBandRef) =>
      ref.zoneId === zoneId && ref.bandId === bandId ? band : null,
    getSurfaceTriangles: (ref: BitFlightBandRef) =>
      ref.zoneId === zoneId && ref.bandId === bandId
        ? surfaceTriangles
        : Object.freeze([]),
    projectPointInBand: (ref: BitFlightBandRef, position: Vector3) =>
      ref.zoneId === zoneId &&
      ref.bandId === bandId &&
      Math.abs(position.x) <= 5 &&
      Math.abs(position.z) <= 5
        ? createLocation(position)
        : null,
    findLocationCandidates: (position: Vector3) =>
      Math.abs(position.x) <= 5 && Math.abs(position.z) <= 5
        ? Object.freeze([createLocation(position)])
        : Object.freeze([]),
    findRoute: (
      start: BitFlightLocation,
      destination: BitFlightLocation,
      policy: BitFlightRoutePolicy
    ) =>
      createSurfaceRoute(start, destination, policy),
    findSurfaceRoute: (
      start: BitFlightLocation,
      destination: BitFlightLocation,
      policy: BitFlightRoutePolicy
    ) =>
      createSurfaceRoute(start, destination, policy),
    findRouteThroughTransition: () => null,
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
      heightMode: BitFlightLocation["heightMode"]
    ) =>
      Math.abs(destination.x) <= 5 && Math.abs(destination.z) <= 5
        ? createLocation(destination, heightMode)
        : null,
    randomPointAround: () => null,
    getTransitionsFrom: () => Object.freeze([]),
    createDebugMeshes: () => Object.freeze([]),
    dispose: () => {}
  });
  return Object.freeze({ navigation, bandRef });
};

const createPlayerSpawn = (
  scene: Scene,
  id: string,
  x: number
): StagePlayerSpawn => {
  const markerNode = new TransformNode(`${id}-marker`, scene);
  markerNode.position.set(x, 0, 0);
  markerNode.computeWorldMatrix(true);
  const exclusionMesh = MeshBuilder.CreateBox(
    `${id}-exclusion-mesh`,
    { width: 4.5, height: 2, depth: 10 },
    scene
  );
  exclusionMesh.position.set(x, 0.5, 0);
  exclusionMesh.computeWorldMatrix(true);
  const exclusionVolume: StageVolume = Object.freeze({
    id: `${id}-exclusion`,
    role: "player_spawn_exclusion",
    bitFlightBand: null,
    playerSpawnId: id,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh: exclusionMesh
  });
  const biasMesh = MeshBuilder.CreateBox(
    `${id}-bias-mesh`,
    { width: 4.5, height: 2, depth: 10 },
    scene
  );
  biasMesh.position.set(x, 0.5, 0);
  biasMesh.computeWorldMatrix(true);
  const biasVolume: StageVolume = Object.freeze({
    id: `${id}-bias`,
    role: "npc_spawn_bias",
    bitFlightBand: null,
    playerSpawnId: id,
    npcSpawnBiasWeight: 0.5,
    navigationAreaId: null,
    mesh: biasMesh
  });
  return Object.freeze({
    id,
    marker: Object.freeze({
      id,
      role: "player_spawn" as const,
      node: markerNode
    }),
    exclusionVolume,
    npcSpawnBiasVolumes: Object.freeze([biasVolume])
  });
};

const createPlayerSpawnRegistry = (
  spawns: readonly StagePlayerSpawn[]
): StagePlayerSpawnRegistry =>
  Object.freeze({
    all: spawns,
    getById: (id: string) =>
      spawns.find((spawn) => spawn.id === id) ?? null
  });

export const createSyntheticStageFixture = (
  scene: Scene,
  options: SyntheticStageFixtureOptions = Object.freeze({})
): SyntheticStageFixture => {
  const surfaceTriangles = createSurfaceTriangles();
  const ground = MeshBuilder.CreateBox(
    "t06-2-ground",
    { width: 10, height: 0.1, depth: 10 },
    scene
  );
  ground.position.y = -0.05;
  ground.computeWorldMatrix(true);
  const humanNavigation = createHumanNavigation(surfaceTriangles, ground);
  const bitNavigationFixture = createBitNavigation(surfaceTriangles);

  const npcSpawnMesh = MeshBuilder.CreateBox(
    "t06-2-npc-spawn-mesh",
    { width: 10, height: 2, depth: 10 },
    scene
  );
  npcSpawnMesh.position.y = 0.5;
  npcSpawnMesh.computeWorldMatrix(true);
  const bitSpawnMesh = MeshBuilder.CreateBox(
    "t06-2-bit-spawn-mesh",
    {
      width: 10,
      height: options.bitSpawnBounds?.height ?? 2,
      depth: 10
    },
    scene
  );
  bitSpawnMesh.position.y = options.bitSpawnBounds?.centerY ?? 0.5;
  bitSpawnMesh.computeWorldMatrix(true);
  const npcSpawn: StageVolume = Object.freeze({
    id: "t06-2-npc-spawn",
    role: "npc_spawn",
    bitFlightBand: null,
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh: npcSpawnMesh
  });
  const bitSpawn: StageVolume = Object.freeze({
    id: "t06-2-bit-spawn",
    role: "bit_spawn",
    bitFlightBand: bitNavigationFixture.bandRef,
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh: bitSpawnMesh
  });
  const selectedPlayerSpawn = createPlayerSpawn(
    scene,
    "player-spawn-selected",
    -2.5
  );
  const otherPlayerSpawn = createPlayerSpawn(
    scene,
    "player-spawn-other",
    2.5
  );
  const playerSpawns = Object.freeze([
    selectedPlayerSpawn,
    otherPlayerSpawn
  ]);
  const volumes = Object.freeze([
    npcSpawn,
    bitSpawn,
    ...selectedPlayerSpawn.npcSpawnBiasVolumes,
    ...otherPlayerSpawn.npcSpawnBiasVolumes,
    selectedPlayerSpawn.exclusionVolume,
    otherPlayerSpawn.exclusionVolume
  ]);
  const queriedExclusionIds: string[] = [];
  const navigationArea = Object.freeze({
    id: "t06-2-area",
    volumes: Object.freeze([])
  });

  const stage = Object.freeze({
    navigation: humanNavigation,
    bitNavigation: bitNavigationFixture.navigation,
    doorAssets: Object.freeze({
      all: Object.freeze([]),
      getById: () => null,
      getByClass: () => Object.freeze([])
    }),
    elevatorAssets: Object.freeze({
      all: Object.freeze([]),
      getById: () => null
    }),
    volumes: Object.freeze({
      all: volumes,
      getById: (id: string) =>
        volumes.find((volume) => volume.id === id) ?? null,
      getByRole: (role: StageVolume["role"]) =>
        Object.freeze(volumes.filter((volume) => volume.role === role))
    }),
    playerSpawns: createPlayerSpawnRegistry(playerSpawns),
    navigationAreas: Object.freeze({
      all: Object.freeze([navigationArea]),
      portals: Object.freeze([]),
      getById: (id: string) => (id === navigationArea.id ? navigationArea : null),
      locate: () => Object.freeze({
        areaId: navigationArea.id,
        portalId: null
      }),
      advance: (cursor: Readonly<{
        areaId: string;
        portalId: string | null;
      }>) => cursor,
      dispose: () => {}
    }),
    links: Object.freeze({
      all: Object.freeze([]),
      getById: () => null,
      getByKind: () => Object.freeze([])
    }),
    boundary: Object.freeze({
      id: "stage" as const,
      mesh: ground,
      contains: (point: Vector3) =>
        Math.abs(point.x) <= 5 &&
        Math.abs(point.z) <= 5 &&
        point.y >= -0.1 &&
        point.y <= 2
    }),
    worldBoundary: null,
    queries: Object.freeze({
      revision: 0,
      castMovementSegment: () => null,
      castMovementSphere: () => null,
      castBeamSegment: () => null,
      castSightSegment: () => null,
      sampleGround: (origin: Vector3) =>
        Object.freeze({
          point: new Vector3(origin.x, 0, origin.z),
          normal: Vector3.Up(),
          distance: Math.abs(origin.y),
          mesh: ground
        }),
      containsVolume: () => false,
      containsVolumeById: (id: string, point: Vector3) => {
        queriedExclusionIds.push(id);
        if (id === selectedPlayerSpawn.exclusionVolume.id) {
          return options.selectedExcludes?.(point) ?? false;
        }
        if (id === otherPlayerSpawn.exclusionVolume.id) {
          return options.otherExcludes?.(point) ?? false;
        }
        return false;
      },
      intersectsVolumeSegmentById: () => false,
      intersectsVolumeById: () => false,
      findContainingBlocker: () => null,
      dispose: () => {}
    }),
    dispose: () => {}
  }) as unknown as StageSpatialContext;

  return Object.freeze({
    stage,
    selectedPlayerSpawn,
    otherPlayerSpawn,
    queriedExclusionIds,
    dispose: () => {
      humanNavigation.dispose();
      bitNavigationFixture.navigation.dispose();
      for (const volume of volumes) {
        volume.mesh.dispose(false, false);
      }
      ground.dispose(false, false);
      selectedPlayerSpawn.marker.node.dispose(false);
      otherPlayerSpawn.marker.node.dispose(false);
    }
  });
};
