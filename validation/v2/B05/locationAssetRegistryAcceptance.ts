import {
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";

import {
  createDynamicStageSpatialVariants,
  type DynamicStageSpatialVariants
} from "../../../src/world/dynamicStageSpatialVariants";
import type {
  StageElevatorAsset,
  StageElevatorAssetRegistry,
  StageElevatorStopAsset
} from "../../../src/world/stageDynamicAssets";
import {
  createStageLocationAssetRegistry,
  STAGE_LOCATION_FLOOR_IDS,
  type AuthoredStageLocationAreaPiece,
  type StageLocationAssetRegistrySource,
  type StageLocationFloorId
} from "../../../src/world/stageLocationAssets";
import type {
  NavigationLocation,
  NavigationSurfaceTriangle,
  NavigationWorld
} from "../../../src/world/navigationWorld";
import { SCHOOL_STAGE } from "../../../src/world/stageCatalog";
import {
  loadStageSpatialContext,
  STAGE_MARKER_ROLES
} from "../../../src/world/stageSpatialContext";
import {
  createStageSpatialQueries,
  STAGE_VOLUME_ROLES,
  type StageSpatialQueries,
  type StageVolume
} from "../../../src/world/stageSpatialQueries";

export type LocationAssetRegistryAcceptanceCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type MutableLocationAssetRegistrySource = {
  -readonly [Key in keyof StageLocationAssetRegistrySource]: Array<
    StageLocationAssetRegistrySource[Key][number]
  >;
};

type FixtureMutation = (
  source: MutableLocationAssetRegistrySource,
  scene: Scene
) => void;

type LocationAssetFixture = Readonly<{
  scene: Scene;
  source: StageLocationAssetRegistrySource;
  navigation: NavigationWorld;
  elevators: StageElevatorAssetRegistry;
  queries: StageSpatialQueries;
  variants: DynamicStageSpatialVariants;
  elevatorRoot: TransformNode;
  dispose(): void;
}>;

const EMPTY_ACTIVE_SET = Object.freeze({
  movementColliders: Object.freeze({
    player: Object.freeze([]),
    npc: Object.freeze([]),
    bit: Object.freeze([])
  }),
  groundColliders: Object.freeze([]),
  beamBlockers: Object.freeze([]),
  sightBlockers: Object.freeze([]),
  bitObstacles: Object.freeze([])
});

const createBox = (
  scene: Scene,
  name: string,
  center: Vector3,
  size: Readonly<{ width: number; height: number; depth: number }>,
  parent: TransformNode | null = null
): Mesh => {
  const mesh = MeshBuilder.CreateBox(name, size, scene);
  mesh.parent = parent;
  mesh.position.copyFrom(center);
  mesh.computeWorldMatrix(true);
  return mesh;
};

const createNavigationStub = (): NavigationWorld => {
  const triangle: NavigationSurfaceTriangle = Object.freeze({
    a: new Vector3(-1, 0, -1),
    b: new Vector3(1, 0, -1),
    c: new Vector3(0, 0, 1),
    area: 2
  });
  const projectPoint = (
    position: Vector3,
    maxDistance: number
  ): NavigationLocation | null => {
    const projected = new Vector3(position.x, 0, position.z);
    return Vector3.Distance(position, projected) <= maxDistance
      ? Object.freeze({ position: projected, polygonRef: 1 })
      : null;
  };
  return Object.freeze({
    getSurfaceTriangles: () => Object.freeze([triangle]),
    projectPoint,
    findSurfacePath: () => {
      throw new Error("B05 registry fixtureではfindSurfacePathを呼び出しません。");
    },
    findPath: () => {
      throw new Error("B05 registry fixtureではfindPathを呼び出しません。");
    },
    constrainMovement: () => {
      throw new Error("B05 registry fixtureではconstrainMovementを呼び出しません。");
    },
    randomPointAround: () => {
      throw new Error("B05 registry fixtureではrandomPointAroundを呼び出しません。");
    },
    createDebugMesh: () => {
      throw new Error("B05 registry fixtureではcreateDebugMeshを呼び出しません。");
    },
    dispose: () => {}
  });
};

const createElevatorRegistry = (
  elevatorRoot: TransformNode
): StageElevatorAssetRegistry => {
  const stop1 = Object.freeze({
    id: "elevator-stop-1",
    floorIndex: 1
  }) as unknown as StageElevatorStopAsset;
  const stop4 = Object.freeze({
    id: "elevator-stop-4",
    floorIndex: 4
  }) as unknown as StageElevatorStopAsset;
  const elevator = Object.freeze({
    id: "elevator-main",
    node: elevatorRoot,
    stops: Object.freeze([stop1, stop4]),
    initialStop: stop4
  }) as unknown as StageElevatorAsset;
  return Object.freeze({
    all: Object.freeze([elevator]),
    getById: (id: string) => (id === elevator.id ? elevator : null)
  });
};

const toStageVolume = (
  id: string,
  role: StageVolume["role"],
  mesh: Mesh
): StageVolume =>
  Object.freeze({
    id,
    role,
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    bitFlightBand: null,
    navigationAreaId: null,
    mesh
  });

const createFixture = (
  engine: NullEngine,
  mutate: FixtureMutation | null = null
): LocationAssetFixture => {
  const scene = new Scene(engine);
  const floorMaps = STAGE_LOCATION_FLOOR_IDS.map((floorId, index) =>
    Object.freeze({
      id: `map-${floorId}`,
      floorId,
      displayName: `${index + 1}階`,
      order: index + 1,
      mesh: MeshBuilder.CreatePlane(
        `MAP_${floorId.toUpperCase()}_Acceptance`,
        { size: 2 },
        scene
      )
    })
  );

  const fixedAreaMesh = createBox(
    scene,
    "VOL_LocationArea_F01_Acceptance",
    Vector3.Zero(),
    { width: 10, height: 4, depth: 10 }
  );
  const missionMesh = createBox(
    scene,
    "VOL_MissionLocation_Acceptance",
    Vector3.Zero(),
    { width: 2, height: 2, depth: 2 }
  );
  const consoleTargetMesh = createBox(
    scene,
    "VOL_BroadcastConsoleTarget_Acceptance",
    new Vector3(2, 0, 0),
    { width: 0.5, height: 1, depth: 0.2 }
  );
  const elevatorRoot = new TransformNode(
    "MRK_ElevatorRoot_Acceptance",
    scene
  );
  elevatorRoot.position.x = 20;
  const elevatorAreaMesh = createBox(
    scene,
    "VOL_LocationArea_Elevator_Acceptance",
    Vector3.Zero(),
    { width: 2, height: 3, depth: 2 },
    elevatorRoot
  );

  const missionAnchor = new TransformNode(
    "MRK_MissionAnchor_Acceptance",
    scene
  );
  const stairLanding = new TransformNode(
    "MRK_StairLanding_Acceptance",
    scene
  );
  stairLanding.position.x = 1;
  const consoleMarker = new TransformNode(
    "MRK_BroadcastConsole_Acceptance",
    scene
  );
  consoleMarker.position.x = 2;

  const source: MutableLocationAssetRegistrySource = {
    floorMaps: [...floorMaps],
    areaPieces: [
      Object.freeze({
        id: "area-piece-f01",
        areaId: "area-f01",
        displayName: "1階共用部",
        priority: 100,
        floorBinding: Object.freeze({ kind: "fixed" as const, floorId: "f01" }),
        mesh: fixedAreaMesh
      }),
      Object.freeze({
        id: "area-piece-elevator",
        areaId: "area-elevator",
        displayName: "エレベーター",
        priority: 400,
        floorBinding: Object.freeze({
          kind: "elevator" as const,
          elevatorId: "elevator-main"
        }),
        mesh: elevatorAreaMesh
      })
    ],
    missionVolumes: [
      Object.freeze({
        id: "mission-volume-main",
        locationId: "mission-main",
        areaId: "area-f01",
        floorId: "f01",
        displayName: "Mission地点",
        anchorId: "mission-anchor-main",
        mesh: missionMesh
      })
    ],
    missionAnchors: [
      Object.freeze({
        id: "mission-anchor-main",
        locationId: "mission-main",
        node: missionAnchor
      })
    ],
    stairLandings: [
      Object.freeze({
        id: "stair-landing-main",
        stairId: "stair-main",
        floorId: "f01",
        direction: "both",
        node: stairLanding
      })
    ],
    elevatorLandings: [
      Object.freeze({
        id: "elevator-landing-f01",
        elevatorId: "elevator-main",
        floorId: "f01",
        available: true,
        stopId: "elevator-stop-1",
        node: new TransformNode("MRK_ElevatorLanding_F01_Acceptance", scene)
      }),
      Object.freeze({
        id: "elevator-landing-f02",
        elevatorId: "elevator-main",
        floorId: "f02",
        available: false,
        stopId: null,
        node: new TransformNode("MRK_ElevatorLanding_F02_Acceptance", scene)
      }),
      Object.freeze({
        id: "elevator-landing-f03",
        elevatorId: "elevator-main",
        floorId: "f03",
        available: false,
        stopId: null,
        node: new TransformNode("MRK_ElevatorLanding_F03_Acceptance", scene)
      }),
      Object.freeze({
        id: "elevator-landing-f04",
        elevatorId: "elevator-main",
        floorId: "f04",
        available: true,
        stopId: "elevator-stop-4",
        node: new TransformNode("MRK_ElevatorLanding_F04_Acceptance", scene)
      })
    ],
    broadcastConsoleMarkers: [
      Object.freeze({
        id: "broadcast-console-main",
        floorId: "f01",
        displayName: "放送卓",
        targetId: "broadcast-console-target-main",
        node: consoleMarker
      })
    ],
    broadcastConsoleTargets: [
      Object.freeze({
        id: "broadcast-console-target-main",
        consoleId: "broadcast-console-main",
        mesh: consoleTargetMesh
      })
    ]
  };
  mutate?.(source, scene);

  const volumes = Object.freeze([
    ...source.areaPieces.map((piece) =>
      toStageVolume(piece.id, "location_area", piece.mesh)
    ),
    ...source.missionVolumes.map((volume) =>
      toStageVolume(volume.id, "mission_location", volume.mesh)
    ),
    ...source.broadcastConsoleTargets.map((target) =>
      toStageVolume(target.id, "broadcast_console_target", target.mesh)
    )
  ]);
  const variants = createDynamicStageSpatialVariants(EMPTY_ACTIVE_SET);
  const queries = createStageSpatialQueries(scene, variants, { volumes });
  const elevators = createElevatorRegistry(elevatorRoot);
  const navigation = createNavigationStub();

  return Object.freeze({
    scene,
    source: Object.freeze({
      floorMaps: Object.freeze([...source.floorMaps]),
      areaPieces: Object.freeze([...source.areaPieces]),
      missionVolumes: Object.freeze([...source.missionVolumes]),
      missionAnchors: Object.freeze([...source.missionAnchors]),
      stairLandings: Object.freeze([...source.stairLandings]),
      elevatorLandings: Object.freeze([...source.elevatorLandings]),
      broadcastConsoleMarkers: Object.freeze([
        ...source.broadcastConsoleMarkers
      ]),
      broadcastConsoleTargets: Object.freeze([
        ...source.broadcastConsoleTargets
      ])
    }),
    navigation,
    elevators,
    queries,
    variants,
    elevatorRoot,
    dispose: () => {
      queries.dispose();
      variants.dispose();
      navigation.dispose();
      scene.dispose();
    }
  });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const captureRegistryRejection = (
  engine: NullEngine,
  mutate: FixtureMutation
): string | null => {
  const fixture = createFixture(engine, mutate);
  try {
    createStageLocationAssetRegistry(
      fixture.source,
      fixture.navigation,
      fixture.elevators,
      fixture.queries
    );
    return null;
  } catch (error) {
    return errorMessage(error);
  } finally {
    fixture.dispose();
  }
};

const captureCatalogRejection = async (
  engine: NullEngine,
  stage: typeof SCHOOL_STAGE
): Promise<string | null> => {
  const scene = new Scene(engine);
  try {
    await loadStageSpatialContext(scene, stage);
    return null;
  } catch (error) {
    return errorMessage(error);
  } finally {
    scene.dispose();
  }
};

const replaceAreaPiece = (
  source: MutableLocationAssetRegistrySource,
  index: number,
  replacement: Partial<AuthoredStageLocationAreaPiece>
): void => {
  source.areaPieces[index] = Object.freeze({
    ...source.areaPieces[index],
    ...replacement
  });
};

export const runLocationAssetRegistryAcceptance = async (): Promise<
  readonly LocationAssetRegistryAcceptanceCheck[]
> => {
  const engine = new NullEngine();
  const checks: LocationAssetRegistryAcceptanceCheck[] = [];
  try {
    const validFixture = createFixture(engine);
    try {
      const registry = createStageLocationAssetRegistry(
        validFixture.source,
        validFixture.navigation,
        validFixture.elevators,
        validFixture.queries
      );
      const fixedHit = registry.findArea(Vector3.Zero());
      const elevatorHitBeforeMove = registry.findArea(new Vector3(20, 0, 0));
      validFixture.elevatorRoot.position.x = 30;
      validFixture.elevatorRoot.computeWorldMatrix(true);
      validFixture.variants.replaceActiveSet(EMPTY_ACTIVE_SET);
      const elevatorHitAfterMove = registry.findArea(new Vector3(30, 0, 0));
      const unavailableLandings = registry.elevatorLandings.filter(
        (landing) => !landing.available
      );
      checks.push({
        name: "正常なLocation registryと動的elevator piece",
        ok:
          registry.floorMaps.length === 5 &&
          registry.areas.length === 2 &&
          registry.missionLocations.length === 1 &&
          registry.stairLandings.length === 1 &&
          registry.elevatorLandings.length === 4 &&
          registry.broadcastConsole.id === "broadcast-console-main" &&
          registry.broadcastConsole.floorId === "f01" &&
          registry.getFloorMap("roof")?.order === 5 &&
          registry.getAreaById("area-f01") === fixedHit?.area &&
          registry.getMissionLocationById("mission-main")?.area.id ===
            "area-f01" &&
          fixedHit?.floorId === "f01" &&
          fixedHit.elevatorId === null &&
          elevatorHitBeforeMove?.area.id === "area-elevator" &&
          elevatorHitBeforeMove.floorId === null &&
          elevatorHitBeforeMove.elevatorId === "elevator-main" &&
          elevatorHitAfterMove?.area.id === "area-elevator" &&
          registry.findArea(new Vector3(20, 0, 0)) === null &&
          unavailableLandings.length === 2 &&
          unavailableLandings.every((landing) => landing.stop === null),
        detail:
          `floors=${registry.floorMaps.length} / areas=${registry.areas.length} / ` +
          `locations=${registry.missionLocations.length} / ` +
          `elevatorAfterMove=${elevatorHitAfterMove?.elevatorId ?? "none"}`
      });
    } catch (error) {
      checks.push({
        name: "正常なLocation registryと動的elevator piece",
        ok: false,
        detail: `予期しない拒否: ${errorMessage(error)}`
      });
    } finally {
      validFixture.dispose();
    }

    const markerRoles = new Set<string>(STAGE_MARKER_ROLES);
    const volumeRoles = new Set<string>(STAGE_VOLUME_ROLES);
    checks.push({
      name: "Location roleの閉集合",
      ok:
        [
          "mission_anchor",
          "map_stair_landing",
          "map_elevator_landing",
          "broadcast_console"
        ].every((role) => markerRoles.has(role)) &&
        [
          "location_area",
          "mission_location",
          "broadcast_console_target"
        ].every((role) => volumeRoles.has(role)) &&
        !markerRoles.has("unknown_location_marker") &&
        !volumeRoles.has("unknown_location_volume"),
      detail:
        `markerRoles=${markerRoles.size} / volumeRoles=${volumeRoles.size}`
    });

    const catalogCases = Object.freeze([
      Object.freeze({
        name: "requiredでschema v3未満を拒否",
        stage: Object.freeze({
          ...SCHOOL_STAGE,
          roomVariantNavmesh: Object.freeze({ mode: "unsupported" as const }),
          assetSchemaVersion: 2
        }),
        expected: "資産schema version 3以上"
      }),
      Object.freeze({
        name: "locationAssetsMode metadata欠落を拒否",
        stage: Object.freeze({
          ...SCHOOL_STAGE,
          roomVariantNavmesh: Object.freeze({ mode: "unsupported" as const }),
          locationAssetsMode: undefined
        }) as unknown as typeof SCHOOL_STAGE,
        expected: "Location意味資産modeが不正"
      }),
      Object.freeze({
        name: "未知locationAssetsModeを拒否",
        stage: Object.freeze({
          ...SCHOOL_STAGE,
          roomVariantNavmesh: Object.freeze({ mode: "unsupported" as const }),
          locationAssetsMode: "mixed"
        }) as unknown as typeof SCHOOL_STAGE,
        expected: "Location意味資産modeが不正"
      })
    ]);
    for (const testCase of catalogCases) {
      const message = await captureCatalogRejection(engine, testCase.stage);
      checks.push({
        name: testCase.name,
        ok: message?.includes(testCase.expected) ?? false,
        detail: message ?? "拒否されませんでした"
      });
    }

    const rejectionCases: ReadonlyArray<
      Readonly<{
        name: string;
        expected: string;
        mutate: FixtureMutation;
      }>
    > = Object.freeze([
      Object.freeze({
        name: "required floor_map欠落を拒否",
        expected: "floor_mapはf01/f02/f03/f04/roof",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.floorMaps.pop();
        }
      }),
      Object.freeze({
        name: "必須priority metadata欠落を拒否",
        expected: "優先度が不正",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          replaceAreaPiece(source, 0, {
            priority: undefined as unknown as number
          });
        }
      }),
      Object.freeze({
        name: "意味ID重複を拒否",
        expected: "floor_map IDが重複",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.floorMaps.push(
            Object.freeze({
              ...source.floorMaps[1],
              id: source.floorMaps[0].id
            })
          );
        }
      }),
      Object.freeze({
        name: "同順位location_area正体積重複を拒否",
        expected: "同一優先度のlocation_areaが正体積で重複",
        mutate: (
          source: MutableLocationAssetRegistrySource,
          scene: Scene
        ) => {
          const overlapMesh = createBox(
            scene,
            "VOL_LocationArea_Overlap_Acceptance",
            new Vector3(1, 0, 0),
            { width: 2, height: 2, depth: 2 }
          );
          source.areaPieces.push(
            Object.freeze({
              id: "area-piece-overlap",
              areaId: "area-overlap",
              displayName: "重複Area",
              priority: 100,
              floorBinding: Object.freeze({
                kind: "fixed" as const,
                floorId: "f01" as const
              }),
              mesh: overlapMesh
            })
          );
        }
      }),
      Object.freeze({
        name: "未登録floor参照を拒否",
        expected: "未登録floorを参照",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.missionVolumes[0] = Object.freeze({
            ...source.missionVolumes[0],
            floorId: "basement" as StageLocationFloorId
          });
        }
      }),
      Object.freeze({
        name: "missionのfloorとarea piece不一致を拒否",
        expected: "floorとarea pieceが一致しません",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.missionVolumes[0] = Object.freeze({
            ...source.missionVolumes[0],
            floorId: "roof"
          });
        }
      }),
      Object.freeze({
        name: "未登録area参照を拒否",
        expected: "未登録areaを参照",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.missionVolumes[0] = Object.freeze({
            ...source.missionVolumes[0],
            areaId: "missing-area"
          });
        }
      }),
      Object.freeze({
        name: "mission anchor参照不一致を拒否",
        expected: "anchor参照が不正",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.missionVolumes[0] = Object.freeze({
            ...source.missionVolumes[0],
            anchorId: "missing-anchor"
          });
        }
      }),
      Object.freeze({
        name: "mission anchorのVolume外配置を拒否",
        expected: "対応Volume内にありません",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.missionAnchors[0].node.position.x = 4;
        }
      }),
      Object.freeze({
        name: "未登録elevator参照を拒否",
        expected: "未登録elevatorを参照",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          replaceAreaPiece(source, 1, {
            floorBinding: Object.freeze({
              kind: "elevator",
              elevatorId: "missing-elevator"
            })
          });
        }
      }),
      Object.freeze({
        name: "未登録stop参照を拒否",
        expected: "未登録stopを参照",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.elevatorLandings[0] = Object.freeze({
            ...source.elevatorLandings[0],
            stopId: "missing-stop"
          });
        }
      }),
      Object.freeze({
        name: "elevator landingのfloor-stop不一致を拒否",
        expected: "floorとstopが一致しません",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.elevatorLandings[0] = Object.freeze({
            ...source.elevatorLandings[0],
            stopId: "elevator-stop-4"
          });
        }
      }),
      Object.freeze({
        name: "availableとstop有無の不一致を拒否",
        expected: "利用可否とstop参照が一致しません",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.elevatorLandings[1] = Object.freeze({
            ...source.elevatorLandings[1],
            stopId: "elevator-stop-1"
          });
        }
      }),
      Object.freeze({
        name: "放送卓Marker-target相互参照不一致を拒否",
        expected: "相互参照が一致しません",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.broadcastConsoleMarkers[0] = Object.freeze({
            ...source.broadcastConsoleMarkers[0],
            targetId: "missing-broadcast-target"
          });
        }
      }),
      Object.freeze({
        name: "放送卓の未登録floor参照を拒否",
        expected: "放送卓が未登録floorを参照",
        mutate: (source: MutableLocationAssetRegistrySource) => {
          source.broadcastConsoleMarkers[0] = Object.freeze({
            ...source.broadcastConsoleMarkers[0],
            floorId: "basement" as StageLocationFloorId
          });
        }
      })
    ]);

    for (const testCase of rejectionCases) {
      const message = captureRegistryRejection(engine, testCase.mutate);
      checks.push({
        name: testCase.name,
        ok: message?.includes(testCase.expected) ?? false,
        detail: message ?? "拒否されませんでした"
      });
    }
  } finally {
    engine.dispose();
  }
  return Object.freeze(checks);
};
