import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  NPC_SPRITE_CENTER_HEIGHT
} from "../../../src/game/characterSprites";
import {
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
  type V2AlarmTriggerEvent
} from "../../../src/v2/alarmSystem";
import {
  V2_HIT_FADE_DURATION_SECONDS,
  V2_HIT_FLICKER_DURATION_SECONDS,
  V2_NPC_BRAINWASH_DECISION_SECONDS,
  V2_NPC_HAIGURE_DECISION_SECONDS,
  type V2CharacterImpactSource
} from "../../../src/v2/characterStateSystem";
import {
  V2_NPC_CAPTURE_BREAKAWAY_SPEED,
  V2_NPC_CAPTURE_DURATION_SECONDS,
  V2_NPC_DETAIL_ENTER_DISTANCE_METERS,
  V2_NPC_DETAIL_EXIT_DISTANCE_METERS,
  V2_NPC_GUN_RESUME_DISTANCE_METERS,
  V2_NPC_GUN_STOP_DISTANCE_METERS,
  V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS,
  V2_NPC_GUN_BEAM_SPEED,
  V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE,
  V2_NPC_PATH_REPLAN_DEADLINE_SECONDS,
  V2_NPC_REST_SEPARATION_METERS,
  createV2NpcSystem,
  type V2NpcCommandQuery,
  type V2NpcNavigationRouteContext,
  type V2NpcSystem
} from "../../../src/v2/npcSystem";
import {
  isV2AliveState,
  isV2BrainwashState,
  selectV2TargetSelectionPersonality,
  type V2CharacterState,
  type V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import { createNavigationAgent } from "../../../src/world/navigationAgent";
import {
  DISTANCE_NAVIGATION_ROUTE_POLICY,
  type NavigationRouteCandidate,
  type NavigationTransitionStep,
  type NavigationWorld
} from "../../../src/world/navigationWorld";
import {
  createStageNavigationAreaRegistry,
  type StageNavigationArea,
  type StageNavigationAreaCursor,
  type StageNavigationAreaPortal
} from "../../../src/world/stageNavigationAreas";
import type { StageVolume } from "../../../src/world/stageSpatialQueries";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import type { V2NpcTraversalState } from "../../../src/v2/npcTraversal";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import { createDefaultV2CharacterVisualRuntime } from "../characterVisualFixture";

export type NpcCombatTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type NpcFixture = Readonly<{
  system: V2NpcSystem;
  navigation: NavigationWorld;
  setSightBlocked(blocked: boolean): void;
  setSightResolver(
    resolver: ((from: Vector3, to: Vector3) => boolean) | null
  ): void;
  getSightCastEnds(): readonly Vector3[];
  getPathfindCount(): number;
  getPathfindRecords(): readonly Readonly<{
    start: Vector3;
    destination: Vector3;
  }>[];
  setNavigationAreas(
    areas: readonly StageNavigationArea[],
    portals: readonly StageNavigationAreaPortal[],
    locate: (point: Vector3) => StageNavigationAreaCursor
  ): void;
  setPathDistanceOverride(distance: number | null): void;
  setPathWaypoints(waypoints: readonly Vector3[]): void;
  getSpriteAlpha(npcId: string): number;
  dispose(): void;
}>;

type NpcRuntimeTestAccess = {
  npcs: Array<{
    id: string;
    footPosition: Vector3;
    navigationLocation: Readonly<{
      position: Vector3;
      polygonRef: number;
    }>;
    navigationPendingTargetPosition: Vector3 | null;
    navigationGoalRevision: number;
    navigationReplanRequestedAtSeconds: number | null;
    navigationAgentCleared: boolean;
    navigationBehavior: string;
    wanderWaitSeconds: number;
    restSlot: Readonly<{
      position: Vector3;
      polygonRef: number;
    }> | null;
    restSlotAreaId: string | null;
    restSlotKey: string | null;
    resting: boolean;
    pursuitActorAreaCursor: StageNavigationAreaCursor;
    pendingNavigationTransition: NavigationTransitionStep | null;
    traversalState: V2NpcTraversalState;
  }>;
  random: () => number;
  selectRestSlot(
    npc: NpcRuntimeTestAccess["npcs"][number],
    center: Vector3,
    areaId: string,
    key: string,
    playerTarget: V2HumanTargetSnapshot,
    minimumCenterDistance: number,
    maximumCenterDistance: number
  ): Readonly<{
    position: Vector3;
    polygonRef: number;
  }> | null;
  createWanderDestination(
    npc: NpcRuntimeTestAccess["npcs"][number],
    playerTarget: V2HumanTargetSnapshot
  ): Readonly<{
    position: Vector3;
    polygonRef: number;
  }> | null;
  prepareReplanPermissions(): void;
  hasReplanPermission(npcIndex: number): boolean;
  reconsiderWaitingElevatorCall(
    npc: NpcRuntimeTestAccess["npcs"][number]
  ): void;
};

const EMPTY_ALARM_TARGET_EVENTS:
  readonly V2AlarmTriggerEvent[] = Object.freeze([]);

const selectDistanceNavigationRoute = (
  _context: V2NpcNavigationRouteContext,
  candidates: readonly NavigationRouteCandidate[]
) => DISTANCE_NAVIGATION_ROUTE_POLICY.selectRoute(candidates);

const applyNpcBeamImpact = (
  system: V2NpcSystem,
  npcId: string,
  source: V2CharacterImpactSource
) =>
  system.applyBeamImpacts([
    Object.freeze({
      npcId,
      source
    })
  ])[0].accepted;

const executeTest = async (
  name: string,
  operation: () => string | Promise<string>
): Promise<NpcCombatTestResult> => {
  try {
    return Object.freeze({
      name,
      ok: true,
      detail: await operation()
    });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (operation: () => void, message: string) => {
  let thrown = false;
  try {
    operation();
  } catch {
    thrown = true;
  }
  assert(thrown, message);
};

const createInitializationRandom = (
  npcCount: number,
  initialBrainwashedNpcCount: number,
  brainwashedStateRoll: number | null
) => {
  const spawnCoordinates = [
    [0.2, 0.5, 0.2],
    [0.8, 0.5, 0.8],
    [0.2, 0.5, 0.8]
  ] as const;
  const values: number[] = [];
  for (let index = 0; index < npcCount; index += 1) {
    const gridSize = Math.ceil(Math.sqrt(npcCount));
    const coordinate = spawnCoordinates[index] ?? [
      0.05 +
        (0.9 * (index % gridSize)) /
          Math.max(1, gridSize - 1),
      0.5,
      0.05 +
        (0.9 * Math.floor(index / gridSize)) /
          Math.max(1, gridSize - 1)
    ];
    values.push(...coordinate);
  }
  for (let index = 0; index < initialBrainwashedNpcCount; index += 1) {
    values.push(0);
  }
  for (let index = 0; index < npcCount; index += 1) {
    if (index < initialBrainwashedNpcCount) {
      const stateRoll =
        brainwashedStateRoll ??
        (index === 0 ? 0.1 : index === 1 ? 0.6 : 0.95);
      values.push(stateRoll, 0.5, 0.5);
      if (stateRoll < 0.45) {
        values.push(0.5, 0.5);
      }
    } else {
      values.push(0.5, 0.5);
    }
  }
  let index = 0;
  return () => {
    const value = values[index] ?? 0.5;
    index += 1;
    return value;
  };
};

const createNpcFixture = async (
  npcCount: number,
  initialBrainwashedNpcCount: number,
  boundaryExtent = 5,
  disableWander = false,
  observeRouteContext:
    | ((context: V2NpcNavigationRouteContext) => void)
    | null = null,
  brainwashedStateRoll: number | null = null
): Promise<NpcFixture> => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateBox(
    "npc-test-ground",
    {
      width: boundaryExtent * 2,
      height: 1,
      depth: boundaryExtent * 2
    },
    scene
  );
  ground.computeWorldMatrix(true);
  let sightBlocked = false;
  let sightResolver:
    | ((from: Vector3, to: Vector3) => boolean)
    | null = null;
  const sightCastEnds: Vector3[] = [];
  let pathfindCount = 0;
  const pathfindRecords: Array<{
    start: Vector3;
    destination: Vector3;
  }> = [];
  let pathDistanceOverride: number | null = null;
  let pathWaypoints: readonly Vector3[] = Object.freeze([]);

  const createLocation = (position: Vector3) =>
    Object.freeze({
      position: new Vector3(position.x, 0, position.z),
      polygonRef: 1
    });
  const isInside = (position: Vector3) =>
    Math.abs(position.x) <= boundaryExtent &&
    Math.abs(position.z) <= boundaryExtent;
  const navigation: NavigationWorld = {
    projectPoint: (position, maxDistance) => {
      if (!isInside(position)) {
        return null;
      }
      const projected = createLocation(position);
      return Vector3.Distance(position, projected.position) <= maxDistance
        ? projected
        : null;
    },
    findSurfacePath: (start, destination) =>
      Object.freeze({
        kind: "surface" as const,
        points: Object.freeze([
          createLocation(start.position),
          createLocation(destination.position)
        ]),
        distance: Vector3.Distance(start.position, destination.position)
      }),
    findPath: (start, destination, _moverKind, routePolicy) => {
      pathfindCount += 1;
      pathfindRecords.push({
        start: start.position.clone(),
        destination: destination.position.clone()
      });
      const surfacePoints = Object.freeze([
        createLocation(start.position),
        ...pathWaypoints.map(createLocation),
        createLocation(destination.position)
      ]);
      const surface = Object.freeze({
        kind: "surface" as const,
        points: surfacePoints,
        distance: surfacePoints.slice(1).reduce(
          (distance, point, index) =>
            distance +
            Vector3.Distance(surfacePoints[index].position, point.position),
          0
        )
      });
      const path = Object.freeze({
        steps: Object.freeze([surface]),
        destination: createLocation(destination.position),
        distance: pathDistanceOverride ?? surface.distance
      });
      return routePolicy.selectRoute(
        Object.freeze([
          Object.freeze({
            kind: "surface" as const,
            path
          })
        ])
      )?.path ?? null;
    },
    constrainMovement: (_start, destination) =>
      isInside(destination) ? createLocation(destination) : null,
    randomPointAround: (origin) =>
      disableWander ? null : createLocation(origin.position),
    createDebugMesh: () => ground,
    dispose: () => undefined
  };

  const navigationArea = Object.freeze({
    id: "t05-npc-combat-area",
    volumes: Object.freeze([])
  });
  let navigationAreas: readonly StageNavigationArea[] = Object.freeze([
    navigationArea
  ]);
  let navigationAreaPortals: readonly StageNavigationAreaPortal[] =
    Object.freeze([]);
  let locateNavigationArea = (_point: Vector3): StageNavigationAreaCursor =>
    Object.freeze({ areaId: navigationArea.id, portalId: null });
  const stage = {
    navigation,
    navigationAreas: Object.freeze({
      get all() {
        return navigationAreas;
      },
      get portals() {
        return navigationAreaPortals;
      },
      getById: (id: string) =>
        navigationAreas.find((area) => area.id === id) ?? null,
      locate: (point: Vector3) => locateNavigationArea(point),
      advance: (cursor: Readonly<{ areaId: string; portalId: string | null }>) => cursor,
      dispose: () => undefined
    }),
    doorAssets: Object.freeze({
      all: Object.freeze([]),
      getById: () => null,
      getByClass: () => Object.freeze([])
    }),
    elevatorAssets: Object.freeze({
      all: Object.freeze([]),
      getById: () => null
    }),
    boundary: Object.freeze({
      id: "stage" as const,
      mesh: ground,
      contains: (position: Vector3) =>
        isInside(position) && Math.abs(position.y) <= 0.5
    }),
    worldBoundary: null,
    queries: Object.freeze({
      revision: 0,
      castMovementSegment: () => null,
      castMovementSphere: () => null,
      castBeamSegment: () => null,
      castSightSegment: (from: Vector3, to: Vector3) => {
        sightCastEnds.push(to.clone());
        return (sightResolver?.(from, to) ?? sightBlocked)
          ? Object.freeze({
              point: Vector3.Zero(),
              normal: Vector3.Up(),
              distance: 0,
              mesh: ground
            })
          : null;
      },
      sampleGround: (origin: Vector3) =>
        Object.freeze({
          point: new Vector3(origin.x, 0, origin.z),
          normal: Vector3.Up(),
          distance: origin.y,
          mesh: ground
      }),
      containsVolume: () => false,
      containsVolumeById: () => false,
      intersectsVolumeSegmentById: () => false,
      intersectsVolumeById: () => false,
      findContainingBlocker: () => null,
      dispose: () => undefined
    })
  } as unknown as StageSpatialContext;

  const characterVisuals = await createDefaultV2CharacterVisualRuntime(
    scene,
    Object.freeze([
      "player",
      ...Array.from({ length: npcCount }, (_, index) => `npc_${index}`)
    ])
  );
  const system = createV2NpcSystem({
    scene,
    stage,
    characterVisuals,
    npcCount,
    initialBrainwashedNpcCount,
    diagnosticsEnabled: true,
    random: createInitializationRandom(
      npcCount,
      initialBrainwashedNpcCount,
      brainwashedStateRoll
    ),
    resolveTargetNavigationArea: (target) =>
      Object.freeze({
        targetId: target.id,
        areaId: navigationArea.id,
        revision: 0,
        anchor: target.footPosition.clone()
      }),
    selectNavigationRoute: (context, candidates) => {
      if (observeRouteContext) {
        observeRouteContext(context);
      }
      return selectDistanceNavigationRoute(context, candidates);
    }
  });
  return Object.freeze({
    system,
    navigation,
    setSightBlocked: (blocked) => {
      sightBlocked = blocked;
    },
    setSightResolver: (resolver) => {
      sightResolver = resolver;
      sightCastEnds.length = 0;
    },
    getSightCastEnds: () =>
      Object.freeze(sightCastEnds.map((position) => position.clone())),
    getPathfindCount: () => pathfindCount,
    getPathfindRecords: () =>
      Object.freeze(
        pathfindRecords.map(({ start, destination }) =>
          Object.freeze({
            start: start.clone(),
            destination: destination.clone()
          })
        )
      ),
    setNavigationAreas: (areas, portals, locate) => {
      navigationAreas = Object.freeze([...areas]);
      navigationAreaPortals = Object.freeze([...portals]);
      locateNavigationArea = locate;
    },
    setPathDistanceOverride: (distance) => {
      pathDistanceOverride = distance;
    },
    setPathWaypoints: (waypoints) => {
      pathWaypoints = Object.freeze(
        waypoints.map((waypoint) => waypoint.clone())
      );
    },
    getSpriteAlpha: (npcId) => {
      const spriteManagers = scene.spriteManagers;
      if (!spriteManagers) {
        throw new Error("テスト用sceneにsprite managerがありません。");
      }
      const sprite = spriteManagers
        .flatMap((manager) => manager.sprites)
        .find((candidate) => candidate.name === npcId);
      if (!sprite) {
        throw new Error(`テスト用NPC spriteがありません: ${npcId}`);
      }
      return sprite.color.a;
    },
    dispose: () => {
      system.dispose();
      characterVisuals.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
};

const createPlayerTarget = (
  footPosition: Vector3,
  state: V2CharacterState = "normal"
): V2HumanTargetSnapshot => {
  const aimPosition = footPosition.add(new Vector3(0, 0.3, 0));
  return Object.freeze({
    id: "player",
    kind: "player" as const,
    footPosition: footPosition.clone(),
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: new Vector3(0.1, 0.3, 0.1)
    }),
    state,
    alive: isV2AliveState(state),
    brainwashed: isV2BrainwashState(state)
  });
};

const createNpcCommandQuery = (
  playerTarget: V2HumanTargetSnapshot
): V2NpcCommandQuery =>
  Object.freeze({
    playerTarget,
    cameraPosition: new Vector3(
      playerTarget.footPosition.x,
      playerTarget.footPosition.y + NPC_SPRITE_CENTER_HEIGHT,
      playerTarget.footPosition.z
    ),
    cameraDirection: new Vector3(0, 0, 1),
    isInCameraFrustum: () => true
  });

const createAlarmEvent = (
  candidateId: string,
  targetId: string,
  position = Vector3.Zero()
): V2AlarmTriggerEvent =>
  Object.freeze({
    candidateId,
    targetId,
    position: position.clone()
  });

const placeThreeNpcs = (system: V2NpcSystem) => {
  system.placeNpcs([
    {
      id: "npc_0",
      footPosition: new Vector3(0, 0, 0),
      formation: false
    },
    {
      id: "npc_1",
      footPosition: new Vector3(3, 0, 3),
      formation: false
    },
    {
      id: "npc_2",
      footPosition: new Vector3(0, 0, -0.6),
      formation: false
    }
  ]);
};

const testInitialStatesAndHitShape = async () => {
  const fixture = await createNpcFixture(3, 3);
  try {
    const snapshots = fixture.system.getFrameView().targets;
    const tracking = fixture.system.getFrameView().tracking;
    assert(
      snapshots.map((snapshot) => snapshot.state).join("|") ===
        "brainwash-complete-gun|brainwash-complete-no-gun|brainwash-complete-haigure",
      "初期45/45/10の決定的抽選結果が一致しません。"
    );
    assert(
      snapshots.every(
        (snapshot) =>
          snapshot.brainwashed &&
          !snapshot.alive &&
          snapshot.hitShape.center.equals(snapshot.aimPosition) &&
          snapshot.hitShape.radii.x > 0 &&
          snapshot.hitShape.radii.y > 0 &&
          snapshot.hitShape.radii.z > 0 &&
          !("collisionRadius" in snapshot)
      ),
      "state由来フラグまたは楕円体命中形状が不正です。"
    );
    assert(
      tracking.every(
        ({ targetSelectionPersonality }) =>
          targetSelectionPersonality !== null
      ),
      "初期洗脳完了NPCへ標的選択個性が割り当てられません。"
    );
    return "抽選=gun/no-gun/haigure、全snapshotがstate由来の楕円体、個性割当済み";
  } finally {
    fixture.dispose();
  }
};

const testDeferredTargetSelectionPersonalityAssignment = async () => {
  const fixture = await createNpcFixture(1, 0);
  try {
    const initialTracking = fixture.system.getFrameView().tracking[0];
    assert(
      initialTracking.targetSelectionPersonality === null,
      "未洗脳NPCへ標的選択個性が先行割当されました。"
    );
    assert(
      applyNpcBeamImpact(fixture.system, "npc_0", {
        sourceId: "bit_0",
        originKind: "bit-chase"
      }),
      "個性の遅延割当テストでNPCへの命中が受理されません。"
    );
    fixture.system.update(
      V2_HIT_FLICKER_DURATION_SECONDS +
        V2_HIT_FADE_DURATION_SECONDS +
        V2_NPC_BRAINWASH_DECISION_SECONDS +
        V2_NPC_HAIGURE_DECISION_SECONDS,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const completedTracking = fixture.system.getFrameView().tracking[0];
    const expectedPersonality =
      selectV2TargetSelectionPersonality("npc", "npc_0");
    assert(
      completedTracking.targetSelectionPersonality ===
        expectedPersonality,
      "初回洗脳完了時の標的選択個性が個体ID固定hashと一致しません。"
    );
    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "shooter" }
    ]);
    fixture.system.update(
      0,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const scriptedTracking = fixture.system.getFrameView().tracking[0];
    assert(
      scriptedTracking.targetSelectionPersonality ===
        completedTracking.targetSelectionPersonality,
      "洗脳完了後の状態遷移で標的選択個性が再割当されました。"
    );
    return (
      `before=${initialTracking.targetSelectionPersonality ?? "none"} / ` +
      `expected=${expectedPersonality} / ` +
      `completed=${completedTracking.targetSelectionPersonality} / ` +
      `scripted=${scriptedTracking.targetSelectionPersonality}`
    );
  } finally {
    fixture.dispose();
  }
};

const testAlarmReceiverEligibilityAndRange = async () => {
  const completedFixture = await createNpcFixture(3, 3, 100);
  const inProgressFixture = await createNpcFixture(2, 0);
  try {
    completedFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(
          V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
          0,
          0
        ),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(
          V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS + 0.001,
          0,
          0
        ),
        formation: false
      },
      {
        id: "npc_2",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    completedFixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent("alarm-range", "player")
      ])
    );
    const firstTracking =
      completedFixture.system.getFrameView().tracking;
    assert(
      firstTracking[0].targetId === "player" &&
        firstTracking[1].targetId === null &&
        firstTracking[2].targetId === null,
      "発火時のXZ半径またはgun/no-gun完成状態の受信選別が不正です。"
    );

    completedFixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent(
          "alarm-no-gun",
          "player",
          new Vector3(
            V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS + 0.001,
            0,
            0
          )
        )
      ])
    );
    assert(
      completedFixture.system.getFrameView().tracking[1].targetId ===
        "player",
      "発火時半径内のno-gun完成NPCがAlarmを受信しません。"
    );

    inProgressFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(0.5, 0, 0),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(1, 0, 0),
        formation: false
      }
    ]);
    applyNpcBeamImpact(inProgressFixture.system, "npc_0", {
      sourceId: "bit_0",
      originKind: "bit-chase"
    });
    inProgressFixture.system.update(
      V2_HIT_FLICKER_DURATION_SECONDS +
        V2_HIT_FADE_DURATION_SECONDS,
      createPlayerTarget(new Vector3(50, 0, 50)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      inProgressFixture.system.getFrameView().targets[0].state ===
        "brainwash-in-progress",
      "受信除外テストのNPCがbrainwash-in-progressへ到達しません。"
    );
    inProgressFixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent("alarm-in-progress", "player")
      ])
    );
    assert(
      inProgressFixture.system
        .getFrameView()
        .tracking
        .every((tracking) => tracking.targetId === null),
      "brainwash-in-progressまたはalive NPCがAlarmを受信しました。"
    );
    return "50/3 world XZ範囲、gun/no-gunのみ受信、haigure/in-progress除外";
  } finally {
    inProgressFixture.dispose();
    completedFixture.dispose();
  }
};

const testGunAlarmFifoAndEvade = async () => {
  const fixture = await createNpcFixture(3, 2);
  try {
    placeThreeNpcs(fixture.system);
    const alivePlayer = createPlayerTarget(new Vector3(0, 0, 1));
    fixture.system.update(
      0,
      alivePlayer,
      Object.freeze([
        createAlarmEvent("alarm-0", "player"),
        createAlarmEvent("alarm-0", "npc_2"),
        createAlarmEvent("alarm-1", "player")
      ])
    );
    assert(
      fixture.system.getFrameView().tracking[0].targetId === "player",
      "alarm FIFO先頭が優先されません。"
    );

    fixture.setSightBlocked(true);
    fixture.system.update(1, alivePlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.drainBeamRequests().length === 0,
      "3D遮蔽中にNPC光線が発射されました。"
    );
    fixture.setSightBlocked(false);
    fixture.system.update(1, alivePlayer, EMPTY_ALARM_TARGET_EVENTS);
    const beams = fixture.system.drainBeamRequests();
    assert(beams.length === 1, "射程内のgun NPCが光線を発射しません。");
    assert(
      beams[0].sourceId === "npc_0" &&
        beams[0].originKind === "npc-gun" &&
        beams[0].targetPolicy.kind === "alive-humans" &&
        beams[0].speed === V2_NPC_GUN_BEAM_SPEED &&
        beams[0].maximumLifetime ===
          V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS,
      "NPC光線契約が不正です。"
    );

    fixture.system.update(30, alivePlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().tracking[0].targetId === "player",
      "Alarm FIFOが固定時間で失効しました。"
    );
    fixture.system.drainBeamRequests();
    const hitPlayer = createPlayerTarget(
      new Vector3(0, 0, 1),
      "hit-a"
    );
    fixture.system.update(0, hitPlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().tracking[0].targetId === "player",
      "Alarm FIFOがhit中の対象をbrainwash前に解除しました。"
    );

    const brainwashedPlayer = createPlayerTarget(
      new Vector3(0, 0, 1),
      "brainwash-in-progress"
    );
    fixture.system.update(
      0,
      brainwashedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const tracking = fixture.system.getFrameView().tracking[0];
    const npcTwo = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_2");
    assert(
      tracking.targetId === "npc_2" &&
        tracking.provenance === "alert",
      "非aliveのFIFO先頭がpruneされません。"
    );
    assert(npcTwo?.state === "evade", "脅威対象NPCがevadeへ遷移しません。");
    assert(
      fixture.system.getFrameView().threatenedTargetIds.includes("npc_2"),
      "追跡対象IDが脅威一覧へ反映されません。"
    );
    return "Alarm FIFO・時間保持・brainwash prune・3D遮蔽・gun光線・evade";
  } finally {
    fixture.dispose();
  }
};

const testNoGunCaptureAndBreakaway = async () => {
  const fixture = await createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-4, 0, -4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(0.2, 0, 0),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    fixture.system.update(0.1, player, EMPTY_ALARM_TARGET_EVENTS);
    const capture = fixture.system.getFrameView().captures[0];
    assert(
      capture?.npcId === "npc_1" &&
        capture.targetId === "player" &&
        capture.remainingSeconds === V2_NPC_CAPTURE_DURATION_SECONDS,
      "no-gun NPCが接触captureを開始しません。"
    );
    const threatIds = fixture.system.getFrameView().threatenedTargetIds;
    assert(
      threatIds.includes("npc_1") && threatIds.includes("player"),
      "capture双方のIDが脅威一覧へ入りません。"
    );
    assert(
      fixture.system
        .drainAlertRequests()
        .some(
          (request) =>
            request.leaderId === "npc_1" &&
            request.targetId === "player"
      ),
      "capture初回のAlertRequestがありません。"
    );
    fixture.system.update(
      V2_NPC_CAPTURE_DURATION_SECONDS,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system.getFrameView().captures.length === 0,
      "20秒後にcaptureが解除されません。"
    );
    const releasePosition = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_1")!.footPosition;
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    fixture.system.update(1, player, EMPTY_ALARM_TARGET_EVENTS);
    const breakawayPosition = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_1")!.footPosition;
    assert(
      Math.abs(
        breakawayPosition.x -
          releasePosition.x -
          V2_NPC_CAPTURE_BREAKAWAY_SPEED
      ) <= 1e-6,
      "capture解除後の専用速度0.27による離脱になっていません。"
    );
    const distantPlayer = createPlayerTarget(
      new Vector3(-4, 0, 0)
    );
    fixture.system.update(
      0,
      distantPlayer,
      Object.freeze([
        createAlarmEvent(
          "alarm-breakaway-cancel",
          "player",
          breakawayPosition
        )
      ])
    );
    assert(
      fixture.system.getFrameView().tracking[1].targetId === "player",
      "非接触breakaway解除後にAlarm追跡へ復帰しません。"
    );
    fixture.system.update(
      1,
      distantPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const alarmChasePosition = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_1")!.footPosition;
    assert(
      alarmChasePosition.x < breakawayPosition.x,
      "Alarmが非接触breakawayより優先されません。"
    );
    return "接触capture 20秒・離脱0.27・breakawayよりAlarm優先";
  } finally {
    fixture.dispose();
  }
};

const testAlarmInterruptsCapture = async () => {
  const fixture = await createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-4, 0, -4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(0.2, 0, 0),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    fixture.system.update(0.1, player, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().captures[0]?.npcId === "npc_1",
      "Alarm優先テストのcaptureが開始しません。"
    );
    fixture.system.drainAlertRequests();

    fixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent("alarm-during-capture", "player")
      ])
    );
    const tracking = fixture.system.getFrameView().tracking[1];
    assert(
      tracking.targetId === "player" &&
        tracking.provenance === "alert" &&
        fixture.system.getFrameView().captures.length === 0,
      "Alarm FIFO追跡が接触captureより優先されません。"
    );
    assert(
      fixture.system.drainAlertRequests().length === 0,
      "Alarm専用追跡が共有bit Alertへ混入しました。"
    );
    return "Alarmが既存captureを即中断し、強制追跡中は再captureしない";
  } finally {
    fixture.dispose();
  }
};

const testCaptureEndsWithoutBreakawayWhenTargetIsHit = async () => {
  const fixture = await createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-4, 0, -4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(0.2, 0, 0),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    fixture.system.update(0.1, player, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().captures[0]?.npcId === "npc_1",
      "命中解除テストのcaptureが開始しません。"
    );

    const beforeHit = fixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    const hitPlayer = createPlayerTarget(Vector3.Zero(), "hit-a");
    fixture.system.update(1, hitPlayer, EMPTY_ALARM_TARGET_EVENTS);
    const afterHit = fixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    const tracking = fixture.system.getFrameView().tracking[1];
    assert(
      fixture.system.getFrameView().captures.length === 0 &&
        tracking.targetId === null,
      "対象命中時にcaptureと追跡を即終了できません。"
    );
    assert(
      afterHit.equals(beforeHit),
      "対象命中時に即終了すべきbreakawayが開始されました。"
    );
    return "対象hitでcapture・追跡を即終了しbreakawayなし";
  } finally {
    fixture.dispose();
  }
};

const startNoGunCaptureOfNpc = (
  fixture: NpcFixture
): V2HumanTargetSnapshot => {
  fixture.system.placeNpcs([
    {
      id: "npc_0",
      footPosition: new Vector3(-4, 0, -4),
      formation: false
    },
    {
      id: "npc_1",
      footPosition: new Vector3(0.2, 0, 0),
      formation: false
    },
    {
      id: "npc_2",
      footPosition: Vector3.Zero(),
      formation: false
    }
  ]);
  const distantPlayer = createPlayerTarget(
    new Vector3(4, 0, 4)
  );
  fixture.system.update(
    0.1,
    distantPlayer,
    EMPTY_ALARM_TARGET_EVENTS
  );
  assert(
    fixture.system.getFrameView().captures.some(
      (capture) =>
        capture.npcId === "npc_1" &&
        capture.targetId === "npc_2"
    ),
    "no-gun NPCがalive NPC対象のcaptureを開始しません。"
  );
  return distantPlayer;
};

const testNpcCaptureTargetImmediateReleasePaths = async () => {
  const impactFixture = await createNpcFixture(3, 2);
  const visibilityFixture = await createNpcFixture(3, 2);
  try {
    const impactPlayer = startNoGunCaptureOfNpc(impactFixture);
    const impactCapturerBefore = impactFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      applyNpcBeamImpact(impactFixture.system, "npc_2", {
        sourceId: "bit_capture_release",
        originKind: "bit-chase"
      }),
      "capture対象NPCが光線命中を受理しません。"
    );
    assert(
      impactFixture.system.getFrameView().captures.length === 0 &&
        impactFixture.system.getFrameView().tracking[1].targetId ===
          null,
      "capture対象NPCの被弾時にcaptureと現在追跡を即解除できません。"
    );
    impactFixture.system.update(
      1,
      impactPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const impactCapturerAfter = impactFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      impactCapturerAfter.equals(impactCapturerBefore) &&
        impactFixture.system.getFrameView().tracking[1].targetId ===
          null,
      "対象NPC被弾後に不要な追跡またはbreakawayが開始されました。"
    );

    const visibilityPlayer =
      startNoGunCaptureOfNpc(visibilityFixture);
    const visibilityCapturerBefore = visibilityFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    visibilityFixture.system.setVisibleNpcIds([
      "npc_0",
      "npc_1"
    ]);
    assert(
      visibilityFixture.system.getFrameView().captures.length === 0 &&
        visibilityFixture.system.getFrameView().tracking[1].targetId ===
          null,
      "capture対象NPCの非表示化時にcaptureと追跡を即解除できません。"
    );
    visibilityFixture.system.update(
      1,
      visibilityPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const visibilityCapturerAfter = visibilityFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      visibilityCapturerAfter.equals(visibilityCapturerBefore),
      "capture対象NPCの非表示化後に不要なbreakawayが開始されました。"
    );
    return "NPC対象被弾・非表示でcapture即解除、breakawayなし";
  } finally {
    visibilityFixture.dispose();
    impactFixture.dispose();
  }
};

const testImpactSuspensionAndStrictPlacement = async () => {
  const fixture = await createNpcFixture(2, 0);
  try {
    const before = fixture.system.getFrameView().targets[0].footPosition;
    assertThrows(
      () =>
        fixture.system.placeNpcs([
          {
            id: "npc_0",
            footPosition: Vector3.Zero(),
            formation: false
          }
        ]),
      "全NPCを含まない配置指定が拒否されません。"
    );
    assertThrows(
      () =>
        fixture.system.placeNpcs([
          {
            id: "npc_0",
            footPosition: Vector3.Zero(),
            formation: true
          },
          {
            id: "npc_1",
            footPosition: new Vector3(1, 0, 0),
            formation: false
          }
        ]),
      "alive NPCのformation指定が拒否されません。"
    );
    assertThrows(
      () =>
        fixture.system.placeNpcs([
          {
            id: "npc_0",
            footPosition: new Vector3(20, 0, 20),
            formation: false
          },
          {
            id: "npc_1",
            footPosition: new Vector3(1, 0, 0),
            formation: false
          }
        ]),
      "NavMeshへ0.1以内で投影できない配置が拒否されません。"
    );
    assert(
      fixture.system.getFrameView().targets[0].footPosition.equals(before),
      "不正配置の検証中にNPC位置が部分適用されました。"
    );

    assert(
      applyNpcBeamImpact(fixture.system, "npc_0", {
        sourceId: "v2_bit_0",
        originKind: "bit-chase"
      }),
      "alive NPCが光線命中を受理しません。"
    );
    fixture.system.setAiSuspended(true);
    fixture.system.update(
      4,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const after = fixture.system.getFrameView().targets[0];
    assert(
      after.state === "brainwash-in-progress",
      "AI停止中にcharacter state timerが進みません。"
    );
    assert(
      after.footPosition.equals(before) &&
        fixture.system.drainBeamRequests().length === 0,
      "AI停止中に移動または発射しました。"
    );
    return "厳格・原子的配置、beam impact、AI停止中state timer継続";
  } finally {
    fixture.dispose();
  }
};

const testFormationPlacement = async () => {
  const fixture = await createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-1, 0.05, 0),
        formation: true
      },
      {
        id: "npc_1",
        footPosition: new Vector3(1, 0.05, 0),
        formation: false
      }
    ]);
    const snapshots = fixture.system.getFrameView().targets;
    assert(
      snapshots[0].state ===
        "brainwash-complete-haigure-formation",
      "brainwash NPCがformation状態へ遷移しません。"
    );
    assert(
      snapshots[0].footPosition.y === 0 &&
        snapshots[1].footPosition.y === 0,
      "配置NPCが物理床へ接地していません。"
    );
    return "全指定をNavMesh 0.1以内へ投影し物理床接地、formation遷移";
  } finally {
    fixture.dispose();
  }
};

const testScriptedExecutionAndFade = async () => {
  const fixture = await createNpcFixture(2, 0);
  try {
    assert(
      applyNpcBeamImpact(fixture.system, "npc_0", {
        sourceId: "bit_0",
        originKind: "bit-chase"
      }),
      "公開処刑観客用のhit状態を作れません。"
    );
    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "audience" }
    ]);
    assert(
      fixture.system.getFrameView().targets[0].state ===
        "brainwash-complete-haigure-formation",
      "hit途中のNPC観客がformationへ正規化されません。"
    );
    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "shooter" }
    ]);
    assert(
      fixture.system.getFrameView().targets[0].state ===
        "brainwash-complete-gun",
      "NPC射手がgunへ正規化されません。"
    );
    assertThrows(
      () =>
        fixture.system.prepareExecutionRoles([
          { npcId: "npc_1", role: "audience" }
        ]),
      "alive NPCへの観客強制遷移が拒否されません。"
    );
    assertThrows(
      () =>
        fixture.system.prepareExecutionRoles([
          { npcId: "npc_1", role: "shooter" }
        ]),
      "alive NPCへの射手強制遷移が拒否されません。"
    );

    applyNpcBeamImpact(fixture.system, "npc_1", {
      sourceId: "bit_1",
      originKind: "bit-fixed"
    });
    const player = createPlayerTarget(new Vector3(4, 0, 4));
    fixture.system.update(
      V2_HIT_FLICKER_DURATION_SECONDS,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.getSpriteAlpha("npc_1") === 1,
      "fade開始時のNPC alphaが1ではありません。"
    );
    fixture.system.update(
      V2_HIT_FADE_DURATION_SECONDS * 0.5,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      Math.abs(fixture.getSpriteAlpha("npc_1") - 0.5) < 0.000001,
      "fade中間時のNPC alphaが0.5ではありません。"
    );
    fixture.system.update(
      V2_HIT_FADE_DURATION_SECONDS * 0.5,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.getSpriteAlpha("npc_1") === 1,
      "fade以外のNPC alphaが1へ復帰しません。"
    );
    return "hit観客・射手正規化、alive誤用拒否、fade alpha=1→0→1";
  } finally {
    fixture.dispose();
  }
};

const testExternalThreatAndPlayerBlocking = async () => {
  const evadeRouteContexts: V2NpcNavigationRouteContext[] = [];
  const fixture = await createNpcFixture(
    3,
    0,
    5,
    false,
    (context) => {
      if (
        context.npcId === "npc_0" &&
        context.behavior === "evade"
      ) {
        evadeRouteContexts.push(context);
      }
    }
  );
  try {
    placeThreeNpcs(fixture.system);
    const before = new Map(
      fixture.system
        .getFrameView()
        .targets
        .map((snapshot) => [snapshot.id, snapshot.footPosition])
    );
    fixture.system.setExternalThreats([
      {
        sourceId: "external-threat",
        targetId: "npc_0",
        sourcePosition: new Vector3(-1, 0, 0),
        sightClear: true
      }
    ]);
    fixture.system.setPlayerBlockedTargetIds(["npc_1", "npc_2"]);
    fixture.system.update(
      0,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    fixture.system.update(
      1,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const after = new Map(
      fixture.system
        .getFrameView()
        .targets
        .map((snapshot) => [snapshot.id, snapshot])
    );
    assert(
      after.get("npc_0")?.state === "evade" &&
        after.get("npc_0")!.footPosition.x >
          before.get("npc_0")!.x,
      "外部脅威対象NPCがevadeで発生元から逃走しません。"
    );
    assert(
      after
        .get("npc_1")!
        .footPosition.equals(before.get("npc_1")!) &&
        after
          .get("npc_2")!
          .footPosition.equals(before.get("npc_2")!),
      "プレイヤー接触中の複数NPCが同時停止しません。"
    );
    assert(
      fixture.system.getFrameView().threatenedTargetIds.includes("npc_0"),
      "外部脅威対象が脅威一覧へ統合されません。"
    );
    const exposedContext =
      evadeRouteContexts[evadeRouteContexts.length - 1];
    assert(
      exposedContext?.targetId === "external-threat" &&
        exposedContext.targetSightClear,
      `evade経路へ脅威ID・露出状態が渡りません: ` +
        `${exposedContext?.targetId ?? "null"}/` +
        `${exposedContext?.targetSightClear ?? false}`
    );

    fixture.system.setExternalThreats([]);
    fixture.system.setPlayerBlockedTargetIds([]);
    fixture.system.update(
      0,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .targets
        .every((snapshot) => snapshot.state === "normal"),
      "空集合を設定した次frameに脅威・停止状態が解除されません。"
    );
    return (
      "外部脅威evade・逃走、経路policyへ脅威ID・露出状態、" +
      "複数NPC停止、空集合で次frame解除"
    );
  } finally {
    fixture.dispose();
  }
};

const testStrictNpcVisibility = async () => {
  const fixture = await createNpcFixture(3, 0);
  try {
    fixture.system.setVisibleNpcIds(["npc_0"]);
    assert(
      fixture.system.getFrameView().targets.map(({ id }) => id).join("|") ===
        "npc_0" &&
        fixture.system.getFrameView().actorSpheres.map(({ id }) => id).join("|") ===
          "npc_0" &&
        fixture.system.getFrameView().tracking.map(({ npcId }) => npcId).join(
          "|"
        ) === "npc_0",
      "非表示NPCが公開snapshotまたは衝突対象に残っています。"
    );
    assertThrows(
      () => fixture.system.setVisibleNpcIds(["npc_0", "npc_0"]),
      "表示NPC IDの重複が拒否されません。"
    );
    assertThrows(
      () => fixture.system.setVisibleNpcIds(["npc_missing"]),
      "未知の表示NPC IDが拒否されません。"
    );
    assert(
      fixture.system.getFrameView().targets.length === 1,
      "不正な表示指定が部分適用されました。"
    );
    fixture.system.setVisibleNpcIds(["npc_0", "npc_1", "npc_2"]);
    assert(
      fixture.system.getFrameView().targets.length === 3 &&
        fixture.system.getFrameView().actorSpheres.length === 3,
      "NPC表示集合を復元できません。"
    );
    return "表示集合でsnapshot/衝突を制御、重複・未知IDは原子的にthrow";
  } finally {
    fixture.dispose();
  }
};

const placeVisionSelectionNpcs = (system: V2NpcSystem) => {
  system.placeNpcs([
    {
      id: "npc_0",
      footPosition: Vector3.Zero(),
      formation: false
    },
    {
      id: "npc_1",
      footPosition: new Vector3(-1, 0, -1),
      formation: false
    },
    {
      id: "npc_2",
      footPosition: new Vector3(0, 0, -2),
      formation: false
    }
  ]);
};

const testNearestVisibleTargetRayEarlyExitAndTieOrder = async () => {
  const nearestTieFixture = await createNpcFixture(3, 1);
  const persistentTieFixture = await createNpcFixture(3, 2);
  const blockedFixture = await createNpcFixture(3, 1);
  const player = createPlayerTarget(
    new Vector3(1, NPC_SPRITE_CENTER_HEIGHT - 0.3, -1)
  );
  try {
    placeVisionSelectionNpcs(nearestTieFixture.system);
    nearestTieFixture.setSightResolver(() => false);
    nearestTieFixture.system.update(
      0,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const nearestTieTracking = nearestTieFixture.system
      .getFrameView()
      .tracking.find(({ npcId }) => npcId === "npc_0");
    const nearestTieCastEnds =
      nearestTieFixture.getSightCastEnds();
    assert(
      nearestTieTracking?.targetSelectionPersonality ===
        "nearest-visible" &&
        nearestTieTracking.targetId === "npc_1" &&
        nearestTieCastEnds.length === 1 &&
        nearestTieCastEnds[0].x === -1 &&
        nearestTieCastEnds[0].z === -1,
      "nearest-visibleの同距離標的をID順で選択できません: " +
        `target=${nearestTieTracking?.targetId ?? "none"} / ` +
        `casts=${nearestTieCastEnds.map((position) => position.toString()).join("|")}`
    );

    persistentTieFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(4, 0, 4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: Vector3.Zero(),
        formation: false
      },
      {
        id: "npc_2",
        footPosition: new Vector3(-1, 0, -1),
        formation: false
      }
    ]);
    persistentTieFixture.system.setVisibleNpcIds([
      "npc_1",
      "npc_2"
    ]);
    persistentTieFixture.setSightResolver(() => false);
    persistentTieFixture.system.update(
      0,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const persistentTieTracking = persistentTieFixture.system
      .getFrameView()
      .tracking.find(({ npcId }) => npcId === "npc_1");
    const persistentTieCastEnds =
      persistentTieFixture.getSightCastEnds();
    assert(
      persistentTieTracking?.targetSelectionPersonality ===
        "persistent" &&
        persistentTieTracking.targetId === "player" &&
        persistentTieCastEnds.length === 1 &&
        persistentTieCastEnds[0].equals(player.aimPosition),
      "persistentの同距離標的を元のframe順で選択できません。"
    );

    placeVisionSelectionNpcs(blockedFixture.system);
    blockedFixture.setSightResolver((_from, to) => to.x < 0);
    blockedFixture.system.update(
      0,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const blockedTracking = blockedFixture.system
      .getFrameView()
      .tracking.find(({ npcId }) => npcId === "npc_0");
    const blockedCastEnds = blockedFixture.getSightCastEnds();
    assert(
      blockedTracking?.targetId === "player" &&
        blockedCastEnds.length === 2 &&
        blockedCastEnds[0].x === -1 &&
        blockedCastEnds[0].z === -1 &&
        blockedCastEnds[1].equals(player.aimPosition),
      "近い遮蔽標的の次の可視標的で停止せず、遠い候補まで視線Rayを実行しました。"
    );
    return (
      `nearestTie=${nearestTieTracking?.targetId}:` +
      `${nearestTieCastEnds.length} / ` +
      `persistentTie=${persistentTieTracking?.targetId}:` +
      `${persistentTieCastEnds.length} / ` +
      `blocked=${blockedTracking?.targetId}:${blockedCastEnds.length}`
    );
  } finally {
    blockedFixture.dispose();
    persistentTieFixture.dispose();
    nearestTieFixture.dispose();
  }
};

const testNpcCurrentTargetSightSchedule = async () => {
  const fixture = await createNpcFixture(2, 2);
  const player = createPlayerTarget(new Vector3(0, 0, -1));
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(4, 0, 4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    fixture.system.setVisibleNpcIds(["npc_1"]);
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    const acquired = fixture.system.getFrameView().tracking[0];
    assert(
      acquired.targetId === "player" &&
        acquired.targetSelectionPersonality === "persistent",
      "5Hz境界テスト用のpersistent NPCが初期標的を取得しません。"
    );

    fixture.setSightBlocked(true);
    fixture.system.update(
      0.199,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const beforeBoundary = fixture.system.getFrameView();
    fixture.system.update(
      0.002,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const afterBoundary = fixture.system.getFrameView();
    assert(
      beforeBoundary.currentTargetSightCheckCount === 0 &&
        beforeBoundary.tracking[0].targetId === "player",
      "5Hz境界前に現在標的の視線確認を実行しました。"
    );
    assert(
      afterBoundary.currentTargetSightCheckCount === 1 &&
        afterBoundary.sightRayCount === 1 &&
        afterBoundary.tracking[0].targetId === null,
      "5Hz境界で現在標的を再確認して遮蔽を反映できません。"
    );
    return (
      `before=${beforeBoundary.currentTargetSightCheckCount} / ` +
      `after=${afterBoundary.currentTargetSightCheckCount} / ` +
      `rays=${afterBoundary.sightRayCount}`
    );
  } finally {
    fixture.dispose();
  }
};

const testNpcFollowAndAlarmSightSchedules = async () => {
  const followFixture = await createNpcFixture(1, 0);
  const alarmFixture = await createNpcFixture(1, 1);
  const player = createPlayerTarget(Vector3.Zero());
  try {
    followFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(0, 0, 0.3),
        formation: false
      }
    ]);
    assert(
      followFixture.system.requestCommand(
        "npc_0",
        "follow",
        createNpcCommandQuery(player)
      ),
      "5Hz視線確認テストのFollow指示が受理されません。"
    );
    followFixture.setSightResolver(() => false);
    followFixture.system.update(
      0,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const followPriority = followFixture.system.getFrameView();
    followFixture.setSightResolver(() => true);
    followFixture.system.update(
      0.199,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const followBeforeBoundary =
      followFixture.system.getFrameView();
    followFixture.system.update(
      0.002,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const followAfterBoundary =
      followFixture.system.getFrameView();

    const alarmPlayer = createPlayerTarget(
      new Vector3(0, 0, -1)
    );
    alarmFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    alarmFixture.setSightResolver(() => false);
    alarmFixture.system.update(
      0,
      alarmPlayer,
      Object.freeze([
        createAlarmEvent(
          "scheduled-alarm-sight",
          "player",
          Vector3.Zero()
        )
      ])
    );
    const alarmPriority = alarmFixture.system.getFrameView();
    alarmFixture.setSightResolver(() => true);
    alarmFixture.system.update(
      0.199,
      alarmPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const alarmBeforeBoundary =
      alarmFixture.system.getFrameView();
    alarmFixture.system.update(
      0.002,
      alarmPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const alarmAfterBoundary =
      alarmFixture.system.getFrameView();

    assert(
      followPriority.currentTargetSightCheckCount === 1 &&
        followPriority.sightRayCount === 1 &&
        followBeforeBoundary.currentTargetSightCheckCount === 0 &&
        followBeforeBoundary.sightRayCount === 0 &&
        followAfterBoundary.currentTargetSightCheckCount === 1 &&
        followAfterBoundary.sightRayCount === 1 &&
        followAfterBoundary.tracking[0].commandMode === "follow",
      "Follow視線Rayを開始時優先・5Hz共通schedulerで確認できません。"
    );
    assert(
      alarmPriority.currentTargetSightCheckCount === 1 &&
        alarmPriority.sightRayCount === 1 &&
        alarmPriority.forcedTargetChangeCount === 1 &&
        alarmBeforeBoundary.currentTargetSightCheckCount === 0 &&
        alarmBeforeBoundary.sightRayCount === 0 &&
        alarmAfterBoundary.currentTargetSightCheckCount === 1 &&
        alarmAfterBoundary.sightRayCount === 1 &&
        alarmAfterBoundary.tracking[0].targetId === "player" &&
        alarmAfterBoundary.tracking[0].provenance === "alert",
      "Alarm gun視線Rayを受信時優先・5Hz共通schedulerで確認できません。"
    );
    return (
      `follow=${followPriority.currentTargetSightCheckCount}->` +
      `${followBeforeBoundary.currentTargetSightCheckCount}->` +
      `${followAfterBoundary.currentTargetSightCheckCount} / ` +
      `alarm=${alarmPriority.currentTargetSightCheckCount}->` +
      `${alarmBeforeBoundary.currentTargetSightCheckCount}->` +
      `${alarmAfterBoundary.currentTargetSightCheckCount}`
    );
  } finally {
    alarmFixture.dispose();
    followFixture.dispose();
  }
};

const testNpcTargetSelectionPersonalitiesAndForcedPriority = async () => {
  const fixture = await createNpcFixture(3, 2, 5, true);
  const initialPlayer = createPlayerTarget(
    new Vector3(0, 0, -0.5)
  );
  const movedPlayer = createPlayerTarget(new Vector3(0, 0, -3));
  try {
    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "shooter" },
      { npcId: "npc_1", role: "shooter" }
    ]);
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(0.1, 0, 0),
        formation: false
      },
      {
        id: "npc_2",
        footPosition: new Vector3(0, 0, -2),
        formation: false
      }
    ]);
    fixture.system.update(
      0,
      initialPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    fixture.system.update(
      0.1,
      initialPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const acquiredTracking = fixture.system.getFrameView().tracking;
    assert(
      acquiredTracking[0].targetSelectionPersonality ===
        "nearest-visible" &&
        acquiredTracking[1].targetSelectionPersonality ===
          "persistent" &&
        acquiredTracking[0].targetId === "player" &&
        acquiredTracking[1].targetId === "player",
      "個性別retargetテストの初期標的または固定個性が不正です。"
    );

    fixture.setSightResolver(
      (_from, to) => Math.abs(to.z + 2) <= 1e-6
    );
    fixture.system.update(
      0.89,
      movedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const beforeAlternativeBoundary = fixture.system.getFrameView();
    fixture.system.update(
      0,
      movedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const alternativeCandidateFootPosition = fixture.system
      .getFrameView()
      .targets.find(({ id }) => id === "npc_2")!.footPosition;
    const pathfindCountBeforeSameTargetQuery =
      fixture.getPathfindCount();
    fixture.system.update(
      0.02,
      movedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const blockedAlternative = fixture.system.getFrameView();
    const pathfindCountAfterSameTargetQuery =
      fixture.getPathfindCount();
    const sameTargetQueryPathRecords = fixture
      .getPathfindRecords()
      .slice(pathfindCountBeforeSameTargetQuery);
    const autonomousActorPathCount =
      sameTargetQueryPathRecords.filter(
        ({ start }) =>
          Vector3.DistanceSquared(
            start,
            alternativeCandidateFootPosition
          ) > 1e-12
      ).length;
    assert(
      beforeAlternativeBoundary.personalityRetargetQueryCount === 0 &&
        beforeAlternativeBoundary.tracking[0].targetId === "player",
      "1Hz境界前にnearest-visibleの別候補探索を実行しました。"
    );
    assert(
      blockedAlternative.personalityRetargetQueryCount === 1 &&
        blockedAlternative.autonomousVisualTargetChangeCount === 0 &&
        blockedAlternative.tracking[0].targetId === "player" &&
        blockedAlternative.tracking[1].targetId === "player" &&
        autonomousActorPathCount <= 1 &&
        sameTargetQueryPathRecords.every(
          ({ destination }) =>
            Vector3.DistanceSquared(
              destination,
              movedPlayer.footPosition
            ) <= 1e-12
        ),
      "遮蔽された近傍候補を除外した同一標的保持、または経路非再計画が不正です: " +
        `query=${blockedAlternative.personalityRetargetQueryCount} / ` +
        `changes=${blockedAlternative.autonomousVisualTargetChangeCount} / ` +
        `targets=${blockedAlternative.tracking[0].targetId ?? "none"}/` +
        `${blockedAlternative.tracking[1].targetId ?? "none"} / ` +
        `path=${pathfindCountBeforeSameTargetQuery}->` +
        `${pathfindCountAfterSameTargetQuery} / ` +
        `autonomousPath=${autonomousActorPathCount} / ` +
        `pathRecords=${sameTargetQueryPathRecords
          .map(
            ({ start, destination }) =>
              `${start.toString()}->${destination.toString()}`
          )
          .join("|")}`
    );

    fixture.setSightResolver(null);
    const npc0PreviousTargetPathRecord = [
      ...fixture.getPathfindRecords()
    ].reverse().find(
      ({ start, destination }) =>
        Math.abs(start.x) <= 1e-12 &&
        Vector3.DistanceSquared(
          destination,
          movedPlayer.footPosition
        ) <= 1e-12
    );
    const pathfindCountBeforeTargetSwitch =
      fixture.getPathfindCount();
    fixture.system.update(
      1,
      movedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const switched = fixture.system.getFrameView();
    const npc2FootPositionAtPathRequest = switched.targets.find(
      ({ id }) => id === "npc_2"
    )!.footPosition;
    fixture.system.update(
      0,
      movedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const switchedPath = fixture.system.getFrameView();
    const targetSwitchPathRecords = fixture
      .getPathfindRecords()
      .slice(pathfindCountBeforeTargetSwitch);
    const npc0TargetSwitchPathRecords =
      targetSwitchPathRecords.filter(
        ({ destination }) =>
          Vector3.DistanceSquared(
            destination,
            npc2FootPositionAtPathRequest
          ) <= 1e-12
      );
    assert(
      switched.personalityRetargetQueryCount === 1 &&
        switched.autonomousVisualTargetChangeCount === 1 &&
        switched.tracking[0].targetId === "npc_2" &&
        switched.tracking[1].targetId === "player",
      "nearest-visibleだけが1Hzで可視の近傍候補へ切り替わりません。"
    );
    assert(
      targetSwitchPathRecords.length ===
        switched.pathRecalculationCount +
          switchedPath.pathRecalculationCount &&
        npc0PreviousTargetPathRecord !== undefined &&
        switchedPath.pathRecalculationCount > 0 &&
        switched.pathRecalculationCount +
          switchedPath.pathRecalculationCount <=
          V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE &&
        npc0TargetSwitchPathRecords.length === 1 &&
        Vector3.DistanceSquared(
          npc0TargetSwitchPathRecords[0].destination,
          npc2FootPositionAtPathRequest
        ) <= 1e-12,
      "自律標的ID切替後の経路が全体予算内で最新destinationへ再計画されません: " +
        `previous=${npc0PreviousTargetPathRecord?.destination.toString() ?? "none"} / ` +
        `budget=${switched.pathRecalculationCount}+${switchedPath.pathRecalculationCount}/` +
        `${V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE} / ` +
        `npc0Paths=${npc0TargetSwitchPathRecords
          .map(
            ({ start, destination }) =>
              `${start.toString()}->${destination.toString()}`
          )
          .join("|")}`
    );

    fixture.system.update(
      0,
      movedPlayer,
      Object.freeze([
        createAlarmEvent(
          "target-personality-forced",
          "player",
          Vector3.Zero()
        )
      ])
    );
    const forced = fixture.system.getFrameView();
    fixture.system.update(
      1.1,
      movedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const forcedHeld = fixture.system.getFrameView();
    assert(
      forced.tracking.slice(0, 2).every(
        ({ targetId, provenance }) =>
          targetId === "player" && provenance === "alert"
      ) &&
        forced.forcedTargetChangeCount === 2 &&
        forced.autonomousVisualTargetChangeCount === 0 &&
        forced.personalityRetargetQueryCount === 0,
      "強制Alarm標的が個性によるvisual標的より優先されません。"
    );
    assert(
      forcedHeld.tracking.slice(0, 2).every(
        ({ targetId, provenance }) =>
          targetId === "player" && provenance === "alert"
      ) &&
        forcedHeld.forcedTargetChangeCount === 0 &&
        forcedHeld.autonomousVisualTargetChangeCount === 0 &&
        forcedHeld.personalityRetargetQueryCount === 0,
      "1秒超継続中の強制Alarm標的を個性探索が奪いました。"
    );
    return (
      `blocked=${blockedAlternative.tracking[0].targetId}/` +
      `${blockedAlternative.personalityRetargetQueryCount} / ` +
      `sameTargetPath=${pathfindCountBeforeSameTargetQuery}->` +
      `${pathfindCountAfterSameTargetQuery} / ` +
      `switched=${switched.tracking[0].targetId}/` +
      `${switched.tracking[1].targetId},path=` +
      `${npc0TargetSwitchPathRecords.length}/` +
      `${switched.pathRecalculationCount} / ` +
      `forced=${forced.forcedTargetChangeCount}/` +
      `${forcedHeld.tracking[0].provenance}`
    );
  } finally {
    fixture.dispose();
  }
};

const testNpcCurrentAndAlternativeSightShareRay = async () => {
  const fixture = await createNpcFixture(1, 1, 5, true);
  const player = createPlayerTarget(new Vector3(0, 0, -1));
  try {
    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "shooter" }
    ]);
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    const acquired = fixture.system.getFrameView().tracking[0];
    fixture.system.update(1, player, EMPTY_ALARM_TARGET_EVENTS);
    const overlapped = fixture.system.getFrameView();
    assert(
      acquired.targetId === "player" &&
        acquired.targetSelectionPersonality === "nearest-visible" &&
        overlapped.currentTargetSightCheckCount === 1 &&
        overlapped.personalityRetargetQueryCount === 1 &&
        overlapped.sightRayCount === 1 &&
        overlapped.autonomousVisualTargetChangeCount === 0 &&
        overlapped.tracking[0].targetId === "player",
      "同updateの現在標的5Hz確認と別候補1Hz探索で現在標的Rayを共有できません。"
    );
    return (
      `current=${overlapped.currentTargetSightCheckCount} / ` +
      `alternative=${overlapped.personalityRetargetQueryCount} / ` +
      `rays=${overlapped.sightRayCount}`
    );
  } finally {
    fixture.dispose();
  }
};

const testNpcTargetlessPriorityDoesNotStarveCurrentSightChecks = async () => {
  const npcCount = 30;
  const holderId = "npc_1";
  const fixture = await createNpcFixture(npcCount, npcCount, 5, true);
  const player = createPlayerTarget(new Vector3(0, 0, -2));
  const targetlessRayOrigins = new Set<string>();
  let measurementHalf = 0;
  let firstHalfHolderSightRays = 0;
  let secondHalfHolderSightRays = 0;
  try {
    fixture.system.prepareExecutionRoles(
      Array.from({ length: npcCount }, (_, index) => ({
        npcId: `npc_${index}`,
        role: "shooter" as const
      }))
    );
    fixture.system.placeNpcs(
      Array.from({ length: npcCount }, (_, index) => ({
        id: `npc_${index}`,
        footPosition:
          index === 1
            ? new Vector3(-0.1, 0, 0)
            : new Vector3(0.1 + index * 0.02, 0, 0),
        formation: false
      }))
    );
    for (const npc of (
      fixture.system as unknown as NpcRuntimeTestAccess
    ).npcs) {
      npc.wanderWaitSeconds = Number.POSITIVE_INFINITY;
    }
    fixture.setSightResolver((from) => {
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
    });

    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
      fixture.system.update(
        1 / 60,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
    }
    const afterPriorityPass = fixture.system.getFrameView();
    const priorityPassRayOrigins = new Set(targetlessRayOrigins);
    assert(
      priorityPassRayOrigins.size === npcCount - 1,
      "初回1秒時点で全targetless priority NPCの視線試行が一巡しません。"
    );

    let firstHalfCurrentChecks = 0;
    let firstHalfSightRays = 0;
    measurementHalf = 1;
    for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
      fixture.system.update(
        1 / 60,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
      const view = fixture.system.getFrameView();
      firstHalfCurrentChecks += view.currentTargetSightCheckCount;
      firstHalfSightRays += view.sightRayCount;
    }

    let secondHalfCurrentChecks = 0;
    let secondHalfSightRays = 0;
    measurementHalf = 2;
    for (let frameIndex = 0; frameIndex < 60; frameIndex += 1) {
      fixture.system.update(
        1 / 60,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
      const view = fixture.system.getFrameView();
      secondHalfCurrentChecks += view.currentTargetSightCheckCount;
      secondHalfSightRays += view.sightRayCount;
    }
    measurementHalf = 0;
    const completed = fixture.system.getFrameView();
    const holder = completed.tracking.find(
      ({ npcId }) => npcId === holderId
    );
    const targetless = completed.tracking.filter(
      ({ npcId }) => npcId !== holderId
    );
    assert(
      afterPriorityPass.tracking.find(
        ({ npcId }) => npcId === holderId
      )?.targetId === "player",
      "初回priority一巡時点で保持NPCが標的を失いました。"
    );
    assert(
      holder?.targetId === "player" &&
        holder.targetSelectionPersonality === "persistent" &&
        targetless.every(({ targetId }) => targetId === null),
      "混在schedulerテストの保持NPCまたはtargetless NPC状態が不正です。"
    );
    assert(
      firstHalfCurrentChecks >= 4 &&
        firstHalfCurrentChecks <= 6 &&
        secondHalfCurrentChecks >= 4 &&
        secondHalfCurrentChecks <= 6 &&
        firstHalfHolderSightRays === firstHalfCurrentChecks &&
        secondHalfHolderSightRays === secondHalfCurrentChecks &&
        firstHalfSightRays >= firstHalfHolderSightRays &&
        secondHalfSightRays >= secondHalfHolderSightRays,
      "targetless priority一巡後に保持NPCの5Hz視線確認が継続しません。"
    );
    return (
      `priority=${priorityPassRayOrigins.size}/${npcCount - 1} / ` +
      `first=current:${firstHalfCurrentChecks},` +
      `holderRay:${firstHalfHolderSightRays},allRay:${firstHalfSightRays} / ` +
      `second=current:${secondHalfCurrentChecks},` +
      `holderRay:${secondHalfHolderSightRays},allRay:${secondHalfSightRays}`
    );
  } finally {
    fixture.dispose();
  }
};

const testNpcTargetSelectionScheduleBudgets = async () => {
  const npcCount = 99;
  const fixture = await createNpcFixture(npcCount, npcCount);
  const player = createPlayerTarget(new Vector3(0, 0, -6));
  const placements = Array.from({ length: npcCount }, (_, index) => ({
    id: `npc_${index}`,
    footPosition: new Vector3(
      ((index % 11) - 5) * 0.04,
      0,
      -4.6 + Math.floor(index / 11) * 0.02
    ),
    formation: false
  }));
  const toSightOriginKey = (position: Vector3) =>
    `${position.x.toFixed(6)}:${position.z.toFixed(6)}`;
  const actorIdBySightOrigin = new Map(
    placements.map(
      ({ id, footPosition }) =>
        [toSightOriginKey(footPosition), id] as const
    )
  );
  const sightCheckFramesByActorId = new Map<string, number[]>();
  let measurementFrameIndex = -1;
  let unmatchedMeasuredSightRayCount = 0;
  try {
    fixture.system.prepareExecutionRoles(
      Array.from({ length: npcCount }, (_, index) => ({
        npcId: `npc_${index}`,
        role: "shooter" as const
      }))
    );
    fixture.system.placeNpcs(placements);
    fixture.setSightResolver((from) => {
      if (measurementFrameIndex >= 0) {
        const actorId =
          actorIdBySightOrigin.get(toSightOriginKey(from)) ?? null;
        if (actorId === null) {
          unmatchedMeasuredSightRayCount += 1;
        } else {
          const frames =
            sightCheckFramesByActorId.get(actorId) ?? [];
          frames.push(measurementFrameIndex);
          sightCheckFramesByActorId.set(actorId, frames);
        }
      }
      return false;
    });

    for (let frameIndex = 0; frameIndex < 120; frameIndex += 1) {
      fixture.system.update(
        1 / 60,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
    }
    const warmedView = fixture.system.getFrameView();
    const nearestVisibleNpcCount = warmedView.tracking.filter(
      ({ targetSelectionPersonality }) =>
        targetSelectionPersonality === "nearest-visible"
    ).length;
    const measuredFrameCount = 600;
    let maximumCurrentChecks = 0;
    let maximumAlternativeQueries = 0;
    let measuredCurrentChecks = 0;
    let measuredAlternativeQueries = 0;
    let measuredSightRays = 0;
    for (
      let frameIndex = 0;
      frameIndex < measuredFrameCount;
      frameIndex += 1
    ) {
      measurementFrameIndex = frameIndex;
      fixture.system.update(
        1 / 60,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
      const view = fixture.system.getFrameView();
      maximumCurrentChecks = Math.max(
        maximumCurrentChecks,
        view.currentTargetSightCheckCount
      );
      maximumAlternativeQueries = Math.max(
        maximumAlternativeQueries,
        view.personalityRetargetQueryCount
      );
      measuredCurrentChecks += view.currentTargetSightCheckCount;
      measuredAlternativeQueries +=
        view.personalityRetargetQueryCount;
      measuredSightRays += view.sightRayCount;
    }
    measurementFrameIndex = -1;
    const steadyView = fixture.system.getFrameView();
    const measuredSeconds = measuredFrameCount / 60;
    const expectedCurrentChecks =
      npcCount * 5 * measuredSeconds;
    const expectedAlternativeQueries =
      nearestVisibleNpcCount * measuredSeconds;
    const measuredSightCheckCounts = placements.map(
      ({ id }) => sightCheckFramesByActorId.get(id)?.length ?? 0
    );
    const minimumActorSightCheckCount = Math.min(
      ...measuredSightCheckCounts
    );
    let maximumActorSightCheckPeriodFrames = 0;
    for (const frames of sightCheckFramesByActorId.values()) {
      for (let index = 1; index < frames.length; index += 1) {
        maximumActorSightCheckPeriodFrames = Math.max(
          maximumActorSightCheckPeriodFrames,
          frames[index] - frames[index - 1]
        );
      }
    }
    fixture.system.update(
      1,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const catchUpView = fixture.system.getFrameView();
    assert(
      steadyView.tracking.every(
        ({ targetId, targetSelectionPersonality }) =>
          targetId === "player" &&
          targetSelectionPersonality !== null
      ),
      "99 NPCの固定1/60更新で全個体が標的と個性を保持しません。"
    );
    assert(
      maximumCurrentChecks <= 9 &&
        maximumAlternativeQueries <= 2 &&
        measuredCurrentChecks >= expectedCurrentChecks - 9 &&
        measuredCurrentChecks <= expectedCurrentChecks + 9 &&
        measuredAlternativeQueries >=
          expectedAlternativeQueries - 2 &&
        measuredAlternativeQueries <=
          expectedAlternativeQueries + 2 &&
        sightCheckFramesByActorId.size === npcCount &&
        unmatchedMeasuredSightRayCount === 0 &&
        measuredSightCheckCounts.reduce(
          (total, count) => total + count,
          0
        ) === measuredSightRays &&
        minimumActorSightCheckCount >= 49 &&
        maximumActorSightCheckPeriodFrames <= 13 &&
        catchUpView.currentTargetSightCheckCount <= 20 &&
        catchUpView.personalityRetargetQueryCount <= 4,
      "99 NPCの5Hz/1Hzラウンドロビン一巡、測定総量、概周期、またはcatch-up上限が不正です。"
    );
    return (
      `steady=current:${maximumCurrentChecks}/9,` +
      `alternative:${maximumAlternativeQueries}/2,` +
      `total:${measuredCurrentChecks}/` +
      `${expectedCurrentChecks},${measuredAlternativeQueries}/` +
      `${expectedAlternativeQueries},actors=` +
      `${sightCheckFramesByActorId.size}/${npcCount},` +
      `min=${minimumActorSightCheckCount},` +
      `period=${maximumActorSightCheckPeriodFrames}/13,` +
      `unmatched=${unmatchedMeasuredSightRayCount} / ` +
      `catchUp=current:${catchUpView.currentTargetSightCheckCount}/20,` +
      `alternative:${catchUpView.personalityRetargetQueryCount}/4`
    );
  } finally {
    fixture.dispose();
  }
};

const testGunVisualLockAndLastSeenPath = async () => {
  const fixture = await createNpcFixture(1, 1);
  const overLimitFixture = await createNpcFixture(1, 1);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    const initialTarget = createPlayerTarget(
      new Vector3(0, 0, -1)
    );
    fixture.system.update(
      0,
      initialTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const acquired = fixture.system.getFrameView().tracking[0];
    const baselinePathfindCount = fixture.getPathfindCount();

    const outsideFovTarget = createPlayerTarget(
      new Vector3(0, 0, 1)
    );
    fixture.system.update(
      0,
      outsideFovTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const retainedOutsideFov =
      fixture.system.getFrameView().tracking[0];

    fixture.setSightBlocked(true);
    fixture.system.update(
      0.2,
      outsideFovTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    fixture.system.update(
      0,
      outsideFovTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const firstLostView = fixture.system.getFrameView();
    const firstLostPathfindCount = fixture.getPathfindCount();
    fixture.system.update(
      0.1,
      outsideFovTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const secondLostPathfindCount = fixture.getPathfindCount();

    overLimitFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    overLimitFixture.system.update(
      0,
      initialTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    overLimitFixture.setPathDistanceOverride(5.01);
    overLimitFixture.setSightBlocked(true);
    overLimitFixture.system.update(
      0.2,
      initialTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const overLimitTracking =
      overLimitFixture.system.getFrameView().tracking[0];

    assert(
      acquired.targetId === "player" &&
        acquired.provenance === "visual",
      "銃ありNPCが初回の距離・FOV・視線条件でvisual標的を取得しません。"
    );
    assert(
      retainedOutsideFov.targetId === "player" &&
        retainedOutsideFov.provenance === "visual",
      "銃ありNPCが取得済み標的をFOV外だけで解除しました。"
    );
    assert(
      firstLostView.tracking[0].targetId === "player" &&
        firstLostView.pathRecalculationCount === 1 &&
        firstLostPathfindCount === baselinePathfindCount + 2 &&
        secondLostPathfindCount === firstLostPathfindCount,
      "最終視認位置の経路を公平予算内で一度だけ計画できません。"
    );
    assert(
      overLimitTracking.targetId === null &&
        overLimitTracking.provenance === null,
      "経路長5.0を超える最終視認位置追跡を解除しません。"
    );
    return (
      `fov=${acquired.targetId}->${retainedOutsideFov.targetId} / ` +
      `lastSeenPath=${firstLostPathfindCount}->${secondLostPathfindCount} / ` +
      `overLimit=${overLimitTracking.targetId ?? "none"}`
    );
  } finally {
    overLimitFixture.dispose();
    fixture.dispose();
  }
};

const testNavigationAgentReplanPermission = async () => {
  const fixture = await createNpcFixture(2, 0);
  const agent = createNavigationAgent(
    fixture.navigation,
    "npc",
    DISTANCE_NAVIGATION_ROUTE_POLICY,
    {
      projectionMaxDistance: 0.75,
      waypointTolerance: 0.02,
      stuckDistanceThreshold: 0.005,
      stuckDurationSeconds: 1
    }
  );
  try {
    const start = Object.freeze({
      position: Vector3.Zero(),
      polygonRef: 1
    });
    const firstWaiting = agent.update(
      start,
      new Vector3(2, 0, 0),
      1,
      0.1,
      0.1,
      false
    );
    assert(
      firstWaiting.state === "waiting-for-path" &&
        !firstWaiting.pathRecalculated &&
        fixture.getPathfindCount() === 0,
      "再計画未許可の新規経路要求が待機しません。"
    );

    const planned = agent.update(
      start,
      new Vector3(2, 0, 0),
      1,
      0.1,
      0.1,
      true
    );
    const continued = agent.update(
      planned.location,
      new Vector3(2, 0, 2),
      1,
      0.1,
      0.1,
      false
    );
    assert(
      planned.pathRecalculated &&
        planned.pathDistance === 2 &&
        fixture.getPathfindCount() === 1 &&
        !continued.pathRecalculated &&
        continued.state === "moving" &&
        Vector3.Distance(continued.location.position, planned.location.position) >
          0,
      "再計画未許可時に既存経路を継続できません。"
    );

    agent.clear();
    const waitingAfterClear = agent.update(
      planned.location,
      new Vector3(2, 0, 2),
      1,
      0.1,
      0.1,
      false
    );
    assert(
      waitingAfterClear.state === "waiting-for-path" &&
        fixture.getPathfindCount() === 1,
      "clear後の新規経路要求が許可待ちになりません。"
    );
    return "新規経路は許可待ち、既存経路は未許可frameでも継続";
  } finally {
    agent.clear();
    fixture.dispose();
  }
};

const testNpcActorSpheresAreBuiltLazilyOncePerFrameView = async () => {
  const fixture = await createNpcFixture(2, 0);
  try {
    const previousView = fixture.system.getFrameView();
    const actorSpheresDescriptor = Object.getOwnPropertyDescriptor(
      previousView,
      "actorSpheres"
    );
    const previousCenters = previousView.targets.map((target) =>
      target.aimPosition.clone()
    );
    assert(
      typeof actorSpheresDescriptor?.get === "function" &&
        actorSpheresDescriptor.value === undefined,
      "NPC actorSpheresが未アクセスでも先行構築されています。"
    );

    fixture.system.placeNpcs(
      previousView.targets.map((target, index) =>
        Object.freeze({
          id: target.id,
          footPosition: new Vector3(index + 1, 0, index + 1),
          formation: false
        })
      )
    );
    const currentView = fixture.system.getFrameView();
    const previousActors = previousView.actorSpheres;
    const repeatedPreviousActors = previousView.actorSpheres;
    const currentActors = currentView.actorSpheres;
    assert(
      previousActors === repeatedPreviousActors,
      "同じNPC Frame View内でactorSpheresが複数回構築されました。"
    );
    assert(
      previousActors.every(
        (actor, index) =>
          Vector3.DistanceSquared(
            actor.center,
            previousCenters[index]
          ) <= 1e-12
      ),
      "次更新後に未アクセスだった旧NPC actorSpheresが変化しました。"
    );
    assert(
      currentView !== previousView &&
        currentActors !== previousActors &&
        currentActors.some(
          (actor, index) =>
            Vector3.DistanceSquared(
              actor.center,
              previousActors[index].center
            ) > 1e-12
        ) &&
        Object.isFrozen(previousActors) &&
        previousActors.every(Object.isFrozen),
      "NPC actorSpheresの更新単位またはimmutable契約が不正です。"
    );
    return "未アクセス時getter・同一View 1回・旧View不変";
  } finally {
    fixture.dispose();
  }
};

const testNpcFrameViewBuildsOncePerBulkChange = async () => {
  const fixture = await createNpcFixture(3, 0);
  const alarmFixture = await createNpcFixture(3, 3);
  try {
    const initialSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    fixture.system.applyBeamImpacts([]);
    fixture.system.prepareExecutionRoles([]);
    fixture.system.enterFormationStates([]);
    assert(
      fixture.system.getFrameView().frameViewBuildSequence ===
        initialSequence,
      "空のNPC一括変更でFrame Viewが再構築されました。"
    );

    const impactResults = fixture.system.applyBeamImpacts([
      {
        npcId: "npc_0",
        source: {
          sourceId: "bit_bulk_0",
          originKind: "bit-chase"
        }
      },
      {
        npcId: "npc_1",
        source: {
          sourceId: "bit_bulk_1",
          originKind: "bit-fixed"
        }
      }
    ]);
    const afterImpactSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    assert(
      impactResults.every((result) => result.accepted) &&
        afterImpactSequence === initialSequence + 1,
      "複数NPCへの光線命中でFrame Viewが1回だけ再構築されません。"
    );

    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "audience" },
      { npcId: "npc_1", role: "shooter" }
    ]);
    const afterExecutionSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    assert(
      afterExecutionSequence === afterImpactSequence + 1,
      "複数NPCの公開処刑役割変更でFrame Viewが1回だけ再構築されません。"
    );

    const formationResults = fixture.system.enterFormationStates([
      "npc_0",
      "npc_1"
    ]);
    const afterFormationSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    assert(
      formationResults.every((result) => result.accepted) &&
        afterFormationSequence === afterExecutionSequence + 1,
      "複数NPCの集合状態変更でFrame Viewが1回だけ再構築されません。"
    );

    fixture.system.update(
      0,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system.getFrameView().frameViewBuildSequence ===
        afterFormationSequence + 1,
      "通常NPC更新でFrame Viewが1回だけ再構築されません。"
    );

    const alarmSequence =
      alarmFixture.system.getFrameView().frameViewBuildSequence;
    alarmFixture.system.update(
      0,
      createPlayerTarget(Vector3.Zero()),
      Object.freeze([
        createAlarmEvent("alarm-frame-view", "player")
      ])
    );
    assert(
      alarmFixture.system.getFrameView().frameViewBuildSequence ===
        alarmSequence + 1,
      "Alarm受信とNPC更新の間でFrame Viewが重複再構築されました。"
    );
    return "空batch=0回、複数命中・処刑役割・集合・Alarm更新=各1回";
  } finally {
    alarmFixture.dispose();
    fixture.dispose();
  }
};

const testZeroNpcUpdate = async () => {
  const fixture = await createNpcFixture(0, 0);
  try {
    const initialSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    fixture.system.update(
      1 / 60,
      createPlayerTarget(Vector3.Zero()),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const view = fixture.system.getFrameView();
    assert(
      view.targets.length === 0 &&
        view.pathRecalculationCount === 0 &&
        view.waitingForPathCount === 0 &&
        view.frameViewBuildSequence === initialSequence + 1,
      "NPC 0件更新のFrame Viewまたは経路予算契約が不正です。"
    );
    return "NPC 0件でも再計画indexをNaN化せず1回更新";
  } finally {
    fixture.dispose();
  }
};

const createTestElevatorTransition = (
  position: Vector3
): NavigationTransitionStep => {
  const entry = Object.freeze({
    position: position.clone(),
    polygonRef: 1
  });
  const exit = Object.freeze({
    position: position.clone(),
    polygonRef: 1
  });
  return Object.freeze({
    kind: "transition",
    link: Object.freeze({
      id: "npc-test-elevator-link",
      kind: "elevator",
      bidirectional: true,
      radiusMeters: 1,
      endpointA: Object.freeze({
        endpoint: "A",
        position: entry.position,
        node: null
      }),
      endpointB: Object.freeze({
        endpoint: "B",
        position: exit.position,
        node: null
      })
    }) as unknown as NavigationTransitionStep["link"],
    from: "A",
    to: "B",
    entry,
    exit,
    distance: 0
  });
};

const testNpcElevatorClearQueuesReplan = async () => {
  const fixture = await createNpcFixture(1, 1, 30, true);
  try {
    const runtime = (fixture.system as unknown as NpcRuntimeTestAccess).npcs[0];
    const transition = createTestElevatorTransition(runtime.footPosition);
    runtime.pendingNavigationTransition = transition;
    runtime.navigationAgentCleared = false;
    runtime.navigationReplanRequestedAtSeconds = null;
    runtime.traversalState = Object.freeze({
      kind: "waiting-elevator-call-input",
      linkId: transition.link.id,
      from: transition.from,
      to: transition.to,
      entryLocation: transition.entry,
      exitLocation: transition.exit
    });

    fixture.system.applyTraversalResults([
      Object.freeze({
        kind: "elevator-call-accepted",
        npcId: runtime.id,
        linkId: transition.link.id,
        from: transition.from,
        to: transition.to
      })
    ]);
    const traversalState = fixture.system.getTraversalState(runtime.id);

    assert(
      traversalState.kind === "moving-to-elevator-wait" &&
        runtime.navigationAgentCleared &&
        runtime.navigationReplanRequestedAtSeconds === null &&
        runtime.navigationPendingTargetPosition === null,
      "elevator-call-acceptedのAgent clearが次回再計画状態と同期されません。"
    );
    return "call-accepted後はmoving-to-waitかつ再計画待ち";
  } finally {
    fixture.dispose();
  }
};

const testNpcElevatorBlockedStatesDoNotConsumeReplanBudget = async () => {
  const npcCount = 5;
  const fixture = await createNpcFixture(npcCount, npcCount, 30, true);
  try {
    const systemAccess = fixture.system as unknown as NpcRuntimeTestAccess;
    const runtimes = systemAccess.npcs;
    const transition = createTestElevatorTransition(runtimes[0].footPosition);
    const route = Object.freeze({
      linkId: transition.link.id,
      from: transition.from,
      to: transition.to,
      entryLocation: transition.entry,
      exitLocation: transition.exit
    });
    runtimes[0].traversalState = Object.freeze({
      kind: "waiting-elevator-board",
      ...route
    });
    runtimes[1].traversalState = Object.freeze({
      kind: "riding-elevator",
      ...route
    });
    runtimes[2].traversalState = Object.freeze({
      kind: "leaving-elevator",
      ...route,
      exitLocation: Object.freeze({
        position: runtimes[2].footPosition.clone(),
        polygonRef: 1
      })
    });
    runtimes[3].traversalState = Object.freeze({
      kind: "waiting-door-open",
      doorId: "npc-test-door"
    });
    runtimes[4].traversalState = Object.freeze({ kind: "walking" });
    for (const runtime of runtimes) {
      runtime.navigationPendingTargetPosition = new Vector3(2, 0, 0);
      runtime.navigationGoalRevision += 1;
      runtime.navigationReplanRequestedAtSeconds = 0;
      runtime.navigationAgentCleared = false;
    }

    systemAccess.prepareReplanPermissions();
    const permissions = runtimes.map((_runtime, index) =>
      systemAccess.hasReplanPermission(index)
    );
    assert(
      permissions.join("|") === "false|false|false|false|true",
      "探索不能なエレベーター／扉状態が再計画枠を占有しました: " +
        permissions.join("|")
    );
    return "探索不能4体=0枠 / walking 1体=1枠";
  } finally {
    fixture.dispose();
  }
};

const testNpcElevatorWaitingCallConsumesManualReplan = async () => {
  const fixture = await createNpcFixture(1, 1, 30, true);
  try {
    const systemAccess = fixture.system as unknown as NpcRuntimeTestAccess;
    const runtime = systemAccess.npcs[0];
    const transition = createTestElevatorTransition(runtime.footPosition);
    fixture.navigation.findPath = (_start, destination) =>
      Object.freeze({
        steps: Object.freeze([transition]),
        destination: Object.freeze({
          position: destination.position.clone(),
          polygonRef: destination.polygonRef
        }),
        distance: transition.distance
      });
    runtime.pendingNavigationTransition = transition;
    runtime.navigationPendingTargetPosition = new Vector3(2, 0, 0);
    runtime.navigationGoalRevision += 1;
    runtime.navigationReplanRequestedAtSeconds = 0;
    runtime.navigationAgentCleared = false;
    runtime.traversalState = Object.freeze({
      kind: "waiting-elevator-call",
      linkId: transition.link.id,
      from: transition.from,
      to: transition.to,
      entryLocation: transition.entry,
      exitLocation: transition.exit
    });

    systemAccess.reconsiderWaitingElevatorCall(runtime);
    assert(
      runtime.traversalState.kind === "waiting-elevator-call" &&
        runtime.navigationReplanRequestedAtSeconds === null &&
        runtime.navigationPendingTargetPosition === null,
      "同じエレベーター便を維持した手動経路比較が再計画要求を消費しません。"
    );
    return "同じ便を維持して要求1件を消費";
  } finally {
    fixture.dispose();
  }
};

const testNavigationAreaRejectsExitWithoutPortal = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const firstMesh = MeshBuilder.CreateBox(
    "navigation-area-test-first",
    { size: 2 },
    scene
  );
  const secondMesh = MeshBuilder.CreateBox(
    "navigation-area-test-second",
    { size: 2 },
    scene
  );
  secondMesh.position.x = 4;
  firstMesh.computeWorldMatrix(true);
  secondMesh.computeWorldMatrix(true);
  const volumes: readonly StageVolume[] = Object.freeze([
    Object.freeze({
      id: "navigation-area-test-first",
      role: "navigation_area",
      bitFlightBand: null,
      navigationAreaId: "first",
      mesh: firstMesh
    }),
    Object.freeze({
      id: "navigation-area-test-second",
      role: "navigation_area",
      bitFlightBand: null,
      navigationAreaId: "second",
      mesh: secondMesh
    })
  ]);
  const registry = createStageNavigationAreaRegistry(volumes, Object.freeze([]));
  try {
    const from = Vector3.Zero();
    const cursor = registry.locate(from);
    const sameAreaCursor = registry.advance(
      cursor,
      from,
      new Vector3(0.5, 0, 0)
    );
    assert(
      sameAreaCursor.areaId === "first",
      "Portalなしの同一Area移動が拒否されました。"
    );
    assertThrows(
      () => registry.advance(cursor, from, new Vector3(4, 0, 0)),
      "Portalなしで現在Areaを離れた移動が契約違反になりません。"
    );
    return "同一Areaは維持 / Portalなし離脱は例外";
  } finally {
    registry.dispose();
    scene.dispose();
    engine.dispose();
  }
};

const testNpcFairReplanBudgetAndFrameView = async () => {
  const npcCount = 99;
  const fixture = await createNpcFixture(npcCount, 0, 30);
  try {
    const initialView = fixture.system.getFrameView();
    assert(
      initialView === fixture.system.getFrameView() &&
        initialView.targets === fixture.system.getFrameView().targets &&
        Object.isFrozen(initialView) &&
        Object.isFrozen(initialView.targets),
      "同じ更新内でNPC frame viewが再生成されました。"
    );

    const deltaSeconds = 1 / 60;
    const player = createPlayerTarget(new Vector3(29, 0, 29));
    let firstBudgetView = initialView;
    for (
      let frameIndex = 0;
      frameIndex < 70 &&
      firstBudgetView.pathRecalculationCount === 0;
      frameIndex += 1
    ) {
      fixture.system.update(
        deltaSeconds,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
      firstBudgetView = fixture.system.getFrameView();
    }
    assert(
      firstBudgetView !== initialView &&
      firstBudgetView.pathRecalculationCount ===
          V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE &&
        firstBudgetView.waitingForPathCount ===
          npcCount - V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE,
      "99件同時要求の初回予算または待機件数が不正です。"
    );

    let elapsedSinceFirstBudget = 0;
    while (
      fixture.getPathfindCount() < npcCount &&
      elapsedSinceFirstBudget <
        V2_NPC_PATH_REPLAN_DEADLINE_SECONDS
    ) {
      fixture.system.update(
        deltaSeconds,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
      elapsedSinceFirstBudget += deltaSeconds;
    }
    const completedView = fixture.system.getFrameView();
    assert(
      fixture.getPathfindCount() === npcCount &&
        elapsedSinceFirstBudget <=
          V2_NPC_PATH_REPLAN_DEADLINE_SECONDS &&
        completedView === fixture.system.getFrameView(),
      "公平な全体予算で99件を2秒以内に処理できません。"
    );
    return (
      `first=${firstBudgetView.pathRecalculationCount}/` +
      `${firstBudgetView.waitingForPathCount} / ` +
      `completed=${fixture.getPathfindCount()} / ` +
      `elapsed=${elapsedSinceFirstBudget.toFixed(3)}s`
    );
  } finally {
    fixture.dispose();
  }
};

const testNpcPursuitDistanceLodAndCumulativeTargetMovement = async () => {
  const fixture = await createNpcFixture(1, 1, 30, true);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    const initialPlayerPosition = new Vector3(2.9975, 0, 0);
    const initialPlayer = createPlayerTarget(initialPlayerPosition);
    fixture.system.update(
      0,
      initialPlayer,
      Object.freeze([
        createAlarmEvent("pursuit-lod", "player", Vector3.Zero())
      ])
    );
    fixture.system.update(0, initialPlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().tracking[0].pursuitPhase === "coarse",
      "残り経路未確定時にcoarseで開始されません。"
    );

    fixture.system.update(0, initialPlayer, EMPTY_ALARM_TARGET_EVENTS);
    fixture.system.update(0, initialPlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().tracking[0].pursuitPhase === "detail",
      "残りNavMesh経路12m以内でcoarseからdetailへ昇格しません。"
    );

    const pathfindCountBeforeMicroMovement = fixture.getPathfindCount();
    for (const offset of [0.051, 0.102, 0.153]) {
      fixture.system.update(
        0,
        createPlayerTarget(initialPlayerPosition.add(new Vector3(offset, 0, 0))),
        EMPTY_ALARM_TARGET_EVENTS
      );
    }
    const queuedAfterCumulativeMovement =
      fixture.system.getFrameView().replanQueuedCount;
    fixture.system.update(
      0,
      createPlayerTarget(initialPlayerPosition.add(new Vector3(0.153, 0, 0))),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const microMovementPaths = fixture
      .getPathfindRecords()
      .slice(pathfindCountBeforeMicroMovement);
    assert(
      queuedAfterCumulativeMovement === 1 &&
        microMovementPaths.length === 1 &&
        Vector3.DistanceSquared(
          microMovementPaths[0].destination,
          initialPlayerPosition.add(new Vector3(0.153, 0, 0))
        ) <= 1e-12,
      "detailの累積0.15移動が1件へ統合され、最新座標へ再計画されません。"
        + ` queued=${queuedAfterCumulativeMovement} / paths=${microMovementPaths.map(({ destination }) => destination.toString()).join("|")}`
    );

    const npcPosition = fixture.system.getFrameView().targets[0].footPosition;
    fixture.system.update(
      0,
      createPlayerTarget(npcPosition.add(new Vector3(4, 0, 0))),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system.getFrameView().tracking[0].pursuitPhase === "detail",
      "12mから18mのヒステリシス帯でdetailを維持しません。"
    );
    fixture.system.update(
      0,
      createPlayerTarget(npcPosition.add(new Vector3(4.5, 0, 0))),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system.getFrameView().tracking[0].pursuitPhase === "coarse",
      "水平18mでdetailからcoarseへ降格しません。"
    );
    return (
      `enter=11.99m<=${V2_NPC_DETAIL_ENTER_DISTANCE_METERS}m / ` +
      `exit=${V2_NPC_DETAIL_EXIT_DISTANCE_METERS}m / ` +
      `microPaths=${microMovementPaths.length}`
    );
  } finally {
    fixture.dispose();
  }
};

const testNpcPursuitWallDetourRemainsCoarse = async () => {
  const fixture = await createNpcFixture(1, 1, 30, true);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    fixture.setPathWaypoints([new Vector3(0, 0, 4)]);
    const player = createPlayerTarget(new Vector3(2, 0, 0));
    fixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent("wall-detour", "player", Vector3.Zero())
      ])
    );
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    const tracking = fixture.system.getFrameView().tracking[0];
    assert(
      tracking.pursuitPhase === "coarse",
      "水平距離12m未満でも既存NavMesh経路が12m超ならcoarseを維持しません。"
    );
    return "direct=8m / detour>12m / phase=coarse";
  } finally {
    fixture.dispose();
  }
};

const testNpcPursuitAllDetailWorstCase = async () => {
  const npcCount = 99;
  const fixture = await createNpcFixture(npcCount, npcCount, 30, true);
  try {
    fixture.system.placeNpcs(
      Array.from({ length: npcCount }, (_, index) => ({
        id: `npc_${index}`,
        footPosition: new Vector3(
          (index % 11) * 0.01,
          0,
          Math.floor(index / 11) * 0.01
        ),
        formation: false
      }))
    );
    const player = createPlayerTarget(new Vector3(2.5, 0, 0));
    let maximumUpdateMilliseconds = 0;
    let maximumPathRecalculationCount = 0;
    for (let updateIndex = 0; updateIndex < 180; updateIndex += 1) {
      const startedAt = performance.now();
      fixture.system.update(
        1 / 60,
        player,
        updateIndex === 0
          ? Object.freeze([
              createAlarmEvent("all-detail", "player", Vector3.Zero())
            ])
          : EMPTY_ALARM_TARGET_EVENTS
      );
      maximumUpdateMilliseconds = Math.max(
        maximumUpdateMilliseconds,
        performance.now() - startedAt
      );
      maximumPathRecalculationCount = Math.max(
        maximumPathRecalculationCount,
        fixture.system.getFrameView().pathRecalculationCount
      );
    }
    const finalView = fixture.system.getFrameView();
    const detailCount = finalView.tracking.filter(
      ({ pursuitPhase }) => pursuitPhase === "detail"
    ).length;
    assert(
      detailCount === npcCount &&
        maximumPathRecalculationCount <=
          V2_NPC_MAXIMUM_PATH_REPLANS_PER_UPDATE &&
        maximumUpdateMilliseconds < 50,
      "99 NPC全員detailの最悪条件で停止、再計画上限超過、または50ms超更新が発生しました: " +
        `detail=${detailCount}/${npcCount} / replans=${maximumPathRecalculationCount} / max=${maximumUpdateMilliseconds.toFixed(3)}ms`
    );
    return (
      `detail=${detailCount}/${npcCount} / ` +
      `replans<=${maximumPathRecalculationCount} / ` +
      `max=${maximumUpdateMilliseconds.toFixed(3)}ms`
    );
  } finally {
    fixture.dispose();
  }
};

const testNpcCoarseRefreshStaggerAndStationarySuppression = async () => {
  const npcCount = 8;
  const movingFixture = await createNpcFixture(
    npcCount,
    npcCount,
    30,
    true,
    null,
    0.6
  );
  const stationaryFixture = await createNpcFixture(
    npcCount,
    npcCount,
    30,
    true,
    null,
    0.6
  );
  const placements = Array.from({ length: npcCount }, (_, index) => ({
    id: `npc_${index}`,
    footPosition: new Vector3(0, 0, index * 0.01),
    formation: false
  }));
  try {
    movingFixture.system.placeNpcs(placements);
    stationaryFixture.system.placeNpcs(placements);
    const initialPlayer = createPlayerTarget(new Vector3(25, 0, 0));
    for (const fixture of [movingFixture, stationaryFixture]) {
      fixture.system.update(
        0,
        initialPlayer,
        Object.freeze([
          createAlarmEvent("coarse-stagger", "player", Vector3.Zero())
        ])
      );
      fixture.system.update(0, initialPlayer, EMPTY_ALARM_TARGET_EVENTS);
      fixture.system.update(0, initialPlayer, EMPTY_ALARM_TARGET_EVENTS);
      fixture.system.update(0, initialPlayer, EMPTY_ALARM_TARGET_EVENTS);
    }

    const movingPathCountBefore = movingFixture.getPathfindCount();
    let movingMaximumReplans = 0;
    for (let frameIndex = 1; frameIndex <= 120; frameIndex += 1) {
      movingFixture.system.update(
        1 / 60,
        createPlayerTarget(new Vector3(25 + frameIndex * 0.001, 0, 0)),
        EMPTY_ALARM_TARGET_EVENTS
      );
      movingMaximumReplans = Math.max(
        movingMaximumReplans,
        movingFixture.system.getFrameView().pathRecalculationCount
      );
    }
    movingFixture.system.update(
      0,
      createPlayerTarget(new Vector3(25.12, 0, 0)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const movingPeriodicPaths =
      movingFixture.getPathfindCount() - movingPathCountBefore;

    const stationaryPathCountBefore = stationaryFixture.getPathfindCount();
    for (let frameIndex = 0; frameIndex < 240; frameIndex += 1) {
      stationaryFixture.system.update(
        1 / 60,
        initialPlayer,
        EMPTY_ALARM_TARGET_EVENTS
      );
    }
    const stationaryPeriodicPaths =
      stationaryFixture.getPathfindCount() - stationaryPathCountBefore;
    assert(
      movingPeriodicPaths === npcCount &&
        movingMaximumReplans === 1 &&
        stationaryPeriodicPaths === 0,
      "coarse更新がActor IDで分散されないか、静止標的へ無意味な再計画が発生しました: " +
        `moving=${movingPeriodicPaths}/${npcCount} / max=${movingMaximumReplans} / stationary=${stationaryPeriodicPaths}`
    );
    return (
      `moving=${movingPeriodicPaths}/${npcCount} / ` +
      `max=${movingMaximumReplans} / stationary=${stationaryPeriodicPaths}`
    );
  } finally {
    movingFixture.dispose();
    stationaryFixture.dispose();
  }
};

const testAutonomousRestSlotReservations = async () => {
  const fixture = await createNpcFixture(2, 0);
  const corridorHalfWidth = 0.06;
  fixture.navigation.projectPoint = (position, maxDistance) => {
    if (Math.abs(position.x) > 5 || Math.abs(position.z) > 5) {
      return null;
    }
    const projected = Object.freeze({
      position: new Vector3(
        position.x,
        0,
        Math.max(
          -corridorHalfWidth,
          Math.min(corridorHalfWidth, position.z)
        )
      ),
      polygonRef: 1
    });
    return Vector3.Distance(position, projected.position) <= maxDistance
      ? projected
      : null;
  };
  const origin = new Vector3(1, 0, 0);
  const playerPosition = new Vector3(
    1 - Math.sqrt(0.5) * 2,
    0,
    0
  );
  const player = createPlayerTarget(playerPosition);
  const access = fixture.system as unknown as NpcRuntimeTestAccess;
  const minimumDistance =
    V2_NPC_REST_SEPARATION_METERS *
    BLENDER_METERS_TO_WORLD_UNITS;
  try {
    fixture.system.placeNpcs([
      { id: "npc_0", footPosition: origin, formation: false },
      { id: "npc_1", footPosition: origin, formation: false }
    ]);
    for (const npc of access.npcs) {
      npc.wanderWaitSeconds = 0;
    }
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    const firstSlots = access.npcs.map((npc) =>
      npc.restSlot?.position.clone() ?? null
    );
    const firstKeys = access.npcs.map((npc) => npc.restSlotKey);
    assert(
      firstSlots.every((slot) => slot !== null) &&
        access.npcs.every(
          (npc) => npc.restSlotAreaId === "t05-npc-combat-area"
        ),
      "自律移動の停止地点が同じNavigation Areaへ予約されません。"
    );
    assert(
      access.npcs[0].footPosition.equals(access.npcs[1].footPosition) &&
        access.npcs.every((npc) => !npc.resting),
      "移動開始時の一時的なNPC重なりを強制分離しました。"
    );
    assert(
      firstSlots.every(
        (slot) =>
          Math.hypot(
            slot!.x - playerPosition.x,
            slot!.z - playerPosition.z
          ) >=
          minimumDistance - 1e-6
      ) &&
        Vector3.Distance(firstSlots[0]!, firstSlots[1]!) >=
          minimumDistance - 1e-6,
      "停止地点がplayerまたは予約済みNPCから0.8mを確保しません。"
    );
    assert(
      firstSlots.every(
        (slot) => Math.abs(slot!.z) <= corridorHalfWidth + 1e-6
      ),
      "狭路のNavMesh内へ停止地点を投影できません。"
    );

    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      access.npcs.every(
        (npc, index) =>
          npc.restSlotKey === firstKeys[index] &&
          npc.restSlot?.position.equals(firstSlots[index]!)
      ),
      "停止地点が同じ目標のままframeごとに再選択されました。"
    );

    fixture.system.update(10, player, EMPTY_ALARM_TARGET_EVENTS);
    const arrivedPositions = access.npcs.map((npc) =>
      npc.footPosition.clone()
    );
    for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
      fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    }
    assert(
      access.npcs.every((npc) => npc.resting) &&
        Vector3.Distance(
          access.npcs[0].footPosition,
          access.npcs[1].footPosition
        ) >=
          minimumDistance - 1e-6,
      "予約した非重複地点へ到着して停止しません。"
    );
    assert(
      access.npcs.every((npc, index) =>
        npc.footPosition.equals(arrivedPositions[index])
      ),
      "狭路で停止後の目的地反転または振動が発生しました。"
    );
    return "移動中の重なりを許容し、狭路でも同一Areaのplayer／NPCから0.8m離れた安定停止地点を予約";
  } finally {
    fixture.dispose();
  }
};

const testWanderRestSlotRejectsPortalPositions = async () => {
  const fixture = await createNpcFixture(1, 0);
  const access = fixture.system as unknown as NpcRuntimeTestAccess;
  const firstArea = Object.freeze({
    id: "portal-rest-first",
    volumes: Object.freeze([])
  });
  const secondArea = Object.freeze({
    id: "portal-rest-second",
    volumes: Object.freeze([])
  });
  const portalHalfWidth = 0.05;
  const portalHalfDepth = 0.1;
  const portal: StageNavigationAreaPortal = Object.freeze({
    id: "navigation-area-portal-03",
    fromAreaId: firstArea.id,
    toAreaId: secondArea.id,
    bidirectional: true,
    contains: (point: Vector3) =>
      Math.abs(point.x) <= portalHalfWidth &&
      Math.abs(point.z) <= portalHalfDepth,
    intersects: () => false
  });
  const locateCalls: Vector3[] = [];
  const locate = (point: Vector3): StageNavigationAreaCursor => {
    locateCalls.push(point.clone());
    if (portal.contains(point)) {
      throw new Error(
        `Navigation Area Portal内の初期位置は禁止されています: ${portal.id}`
      );
    }
    if (point.x <= -4) {
      throw new Error("Navigation Area包含数が1ではありません: 0");
    }
    if (point.x >= 4) {
      throw new Error("Navigation Area包含数が1ではありません: 2");
    }
    return Object.freeze({
      areaId: point.x < 0 ? firstArea.id : secondArea.id,
      portalId: null
    });
  };
  fixture.setNavigationAreas(
    Object.freeze([firstArea, secondArea]),
    Object.freeze([portal]),
    locate
  );
  const player = createPlayerTarget(new Vector3(3, 0, 3));
  const npc = access.npcs[0];
  const resetRestSlot = () => {
    npc.restSlot = null;
    npc.restSlotAreaId = null;
    npc.restSlotKey = null;
    npc.resting = false;
  };
  const select = (center: Vector3, key: string, maximumDistance = Infinity) =>
    access.selectRestSlot(
      npc,
      center,
      npc.pursuitActorAreaCursor.areaId,
      key,
      player,
      0,
      maximumDistance
    );
  const assertLocateError = (center: Vector3, expectedMessage: string) => {
    resetRestSlot();
    let actualMessage = "";
    try {
      select(center, `error:${expectedMessage}`, 0);
    } catch (error) {
      actualMessage = error instanceof Error ? error.message : String(error);
    }
    assert(
      actualMessage === expectedMessage,
      `Navigation Area包含契約違反が維持されません: ${actualMessage}`
    );
  };

  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-0.1, 0, 0),
        formation: false
      }
    ]);
    assert(
      npc.pursuitActorAreaCursor.areaId === firstArea.id,
      "テストNPCの現在Navigation Areaが設定されません。"
    );

    for (const [label, center] of [
      ["center", Vector3.Zero()],
      ["boundary", new Vector3(portalHalfWidth, 0, 0)]
    ] as const) {
      resetRestSlot();
      locateCalls.length = 0;
      const slot = select(center, `portal:${label}`);
      assert(
        slot !== null &&
          !portal.contains(slot.position) &&
          locate(slot.position).areaId === firstArea.id &&
          locateCalls.every((position) => !portal.contains(position)),
        `Portal ${label}候補を除外して同じAreaの停止地点を選べません。`
      );
    }

    resetRestSlot();
    const oppositeAreaSlot = select(
      new Vector3(portalHalfWidth + 0.15, 0, 0),
      "opposite-area"
    );
    assert(
      oppositeAreaSlot !== null &&
        locate(oppositeAreaSlot.position).areaId === firstArea.id,
      "反対Areaの投影中心から現在Areaの停止地点を選べません。"
    );

    resetRestSlot();
    const randomValues = [0, 0.01];
    let randomIndex = 0;
    access.random = () => randomValues[randomIndex++] ?? 0;
    const wanderSlot = access.createWanderDestination(npc, player);
    assert(
      wanderSlot !== null &&
        randomIndex === 2 &&
        npc.restSlotAreaId === firstArea.id &&
        locate(wanderSlot.position).areaId === firstArea.id,
      "WanderがNPCの現在Areaを期待Areaとして最初の候補内で停止地点を選びません。"
    );

    assertLocateError(
      new Vector3(-4, 0, 0),
      "Navigation Area包含数が1ではありません: 0"
    );
    assertLocateError(
      new Vector3(4, 0, 0),
      "Navigation Area包含数が1ではありません: 2"
    );
    return "Portal中心・境界をlocate前に除外し、反対Areaを拒否、包含0／2例外を維持";
  } finally {
    fixture.dispose();
  }
};

const testGunStandoffHysteresis = async () => {
  const fixture = await createNpcFixture(1, 1, 5, false, null, 0.1);
  const player = createPlayerTarget(Vector3.Zero());
  const access = fixture.system as unknown as NpcRuntimeTestAccess;
  const stopDistance =
    V2_NPC_GUN_STOP_DISTANCE_METERS *
    BLENDER_METERS_TO_WORLD_UNITS;
  const resumeDistance =
    V2_NPC_GUN_RESUME_DISTANCE_METERS *
    BLENDER_METERS_TO_WORLD_UNITS;
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(0, 0, stopDistance * 0.5),
        formation: false
      }
    ]);
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    fixture.system.update(1, player, EMPTY_ALARM_TARGET_EVENTS);
    const stoppedPosition = access.npcs[0].footPosition.clone();
    const stoppedSlot = access.npcs[0].restSlot?.position.clone();
    assert(
      stoppedSlot !== undefined &&
        access.npcs[0].resting &&
        Math.hypot(stoppedPosition.x, stoppedPosition.z) >=
          stopDistance - 1e-6,
      "gun NPCが0.8mの停止地点を確保しません: " +
        `slot=${stoppedSlot?.toString() ?? "none"} / ` +
        `resting=${access.npcs[0].resting} / ` +
        `position=${stoppedPosition.toString()} / ` +
        `distance=${Math.hypot(stoppedPosition.x, stoppedPosition.z)}`
    );

    const towardTarget = player.footPosition.subtract(stoppedPosition);
    towardTarget.y = 0;
    towardTarget.normalize();
    const approachedPlayer = createPlayerTarget(
      stoppedPosition.add(towardTarget.scale(stopDistance * 0.5))
    );
    fixture.system.update(0.01, approachedPlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      access.npcs[0].footPosition.equals(stoppedPosition),
      "player側から近づいた時に停止gun NPCを強制反発させました。"
    );

    const retreatedPlayer = createPlayerTarget(
      stoppedPosition.add(
        towardTarget.scale(resumeDistance + 0.001)
      )
    );
    fixture.system.update(0.21, retreatedPlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      !access.npcs[0].resting &&
        access.npcs[0].restSlot !== null &&
        !access.npcs[0].restSlot!.position.equals(stoppedSlot!),
      "gun NPCが1.0m超で停止地点を更新して追跡を再開しません。"
    );
    return "gun停止0.8m／再移動1.0m、player側接近では強制反発なし";
  } finally {
    fixture.dispose();
  }
};

const testBrainwashedSearchRecovery = async () => {
  const runCompletedState = async (
    stateRoll: number,
    expectedState:
      | "brainwash-complete-gun"
      | "brainwash-complete-no-gun"
  ) => {
    const fixture = await createNpcFixture(
      1,
      1,
      5,
      false,
      null,
      stateRoll
    );
    const access = fixture.system as unknown as NpcRuntimeTestAccess;
    const nearPlayer = createPlayerTarget(Vector3.Zero());
    try {
      fixture.system.placeNpcs([
        {
          id: "npc_0",
          footPosition: new Vector3(0, 0, 0.5),
          formation: false
        }
      ]);
      fixture.system.update(0, nearPlayer, EMPTY_ALARM_TARGET_EVENTS);
      assert(
        fixture.system.getFrameView().targets[0].state === expectedState &&
          fixture.system.getFrameView().tracking[0].targetId === "player",
        `${expectedState}が初期標的を取得しません。`
      );
      const farPlayer = createPlayerTarget(new Vector3(4, 0, 4));
      fixture.system.update(0.21, farPlayer, EMPTY_ALARM_TARGET_EVENTS);
      assert(
        fixture.system.getFrameView().tracking[0].targetId === null &&
          access.npcs[0].navigationBehavior === "wander" &&
          access.npcs[0].restSlotKey?.startsWith("wander:") === true,
        `${expectedState}が標的消失直後に探索移動へ復帰しません。`
      );
    } finally {
      fixture.dispose();
    }
  };

  await runCompletedState(0.1, "brainwash-complete-gun");
  await runCompletedState(0.6, "brainwash-complete-no-gun");

  const haigureFixture = await createNpcFixture(
    1,
    1,
    5,
    false,
    null,
    0.95
  );
  const haigureAccess =
    haigureFixture.system as unknown as NpcRuntimeTestAccess;
  try {
    haigureFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    haigureAccess.npcs[0].wanderWaitSeconds = 0;
    haigureFixture.system.update(
      1,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      haigureFixture.system.getFrameView().targets[0].state ===
        "brainwash-complete-haigure" &&
        haigureAccess.npcs[0].restSlot === null &&
        haigureAccess.npcs[0].footPosition.equals(Vector3.Zero()),
      "haigure状態が探索移動を開始しました。"
    );
    return "gun／no-gunは標的消失直後にWander探索へ復帰し、haigureは停止維持";
  } finally {
    haigureFixture.dispose();
  }
};

export const runNpcCombatTests = async () =>
  Object.freeze(await Promise.all([
    executeTest("NPC初期状態・楕円体snapshot", testInitialStatesAndHitShape),
    executeTest(
      "NPC標的選択個性の洗脳完了時一回割当",
      testDeferredTargetSelectionPersonalityAssignment
    ),
    executeTest(
      "NPC Alarm受信状態・発火時範囲",
      testAlarmReceiverEligibilityAndRange
    ),
    executeTest("NPC gun・alarm FIFO・evade", testGunAlarmFifoAndEvade),
    executeTest("NPC no-gun capture・離脱", testNoGunCaptureAndBreakaway),
    executeTest(
      "NPC Alarmのcapture全面上書き",
      testAlarmInterruptsCapture
    ),
    executeTest(
      "NPC capture対象hit時の即終了",
      testCaptureEndsWithoutBreakawayWhenTargetIsHit
    ),
    executeTest(
      "NPC capture対象の被弾・非表示即解除",
      testNpcCaptureTargetImmediateReleasePaths
    ),
    executeTest(
      "NPC beam impact・AI停止・厳格配置",
      testImpactSuspensionAndStrictPlacement
    ),
    executeTest("NPC集合配置", testFormationPlacement),
    executeTest("NPC公開処刑状態・hit fade", testScriptedExecutionAndFade),
    executeTest(
      "NPC外部脅威・プレイヤー複数停止",
      testExternalThreatAndPlayerBlocking
    ),
    executeTest("NPC厳格表示集合", testStrictNpcVisibility),
    executeTest(
      "NPC最近傍可視Ray早期終了・同距離順",
      testNearestVisibleTargetRayEarlyExitAndTieOrder
    ),
    executeTest(
      "NPC現在標的視線確認5Hz境界",
      testNpcCurrentTargetSightSchedule
    ),
    executeTest(
      "NPC Follow・Alarm視線確認5Hz統合",
      testNpcFollowAndAlarmSightSchedules
    ),
    executeTest(
      "NPC個性別1Hz切替・遮蔽・強制優先",
      testNpcTargetSelectionPersonalitiesAndForcedPriority
    ),
    executeTest(
      "NPC現在標的5Hz・別候補1HzのRay共有",
      testNpcCurrentAndAlternativeSightShareRay
    ),
    executeTest(
      "NPC targetless priority混在時の5Hz飢餓防止",
      testNpcTargetlessPriorityDoesNotStarveCurrentSightChecks
    ),
    executeTest(
      "NPC標的選択5Hz・1Hz予算",
      testNpcTargetSelectionScheduleBudgets
    ),
    executeTest(
      "NPC gunのFOV外保持・最終視認位置経路",
      testGunVisualLockAndLastSeenPath
    ),
    executeTest(
      "NavigationAgent再計画許可",
      testNavigationAgentReplanPermission
    ),
    executeTest(
      "NPC actorSpheres遅延Frame View",
      testNpcActorSpheresAreBuiltLazilyOncePerFrameView
    ),
    executeTest(
      "NPC Frame View一括再構築回数",
      testNpcFrameViewBuildsOncePerBulkChange
    ),
    executeTest("NPC 0件更新", testZeroNpcUpdate),
    executeTest(
      "NPCエレベーターclear後の再計画同期",
      testNpcElevatorClearQueuesReplan
    ),
    executeTest(
      "NPCエレベーター探索不能状態の再計画枠除外",
      testNpcElevatorBlockedStatesDoNotConsumeReplanBudget
    ),
    executeTest(
      "NPCエレベーター呼出待機の手動再計画消費",
      testNpcElevatorWaitingCallConsumesManualReplan
    ),
    executeTest(
      "Navigation AreaのPortalなし離脱拒否",
      testNavigationAreaRejectsExitWithoutPortal
    ),
    executeTest(
      "NPC公平再計画予算・frame view",
      testNpcFairReplanBudgetAndFrameView
    ),
    executeTest(
      "NPC追跡距離LOD・累積標的移動",
      testNpcPursuitDistanceLodAndCumulativeTargetMovement
    ),
    executeTest(
      "NPC追跡の壁越し経路距離LOD",
      testNpcPursuitWallDetourRemainsCoarse
    ),
    executeTest(
      "NPC追跡99体全員detail最悪条件",
      testNpcPursuitAllDetailWorstCase
    ),
    executeTest(
      "NPC coarse更新のActor ID分散・静止時抑止",
      testNpcCoarseRefreshStaggerAndStationarySuppression
    ),
    executeTest(
      "NPC自律停止地点の安定予約",
      testAutonomousRestSlotReservations
    ),
    executeTest(
      "NPC Wander停止地点のPortal除外・Area固定",
      testWanderRestSlotRejectsPortalPositions
    ),
    executeTest(
      "NPC gun停止距離ヒステリシス",
      testGunStandoffHysteresis
    ),
    executeTest(
      "洗脳済みNPCの標的消失後探索復帰",
      testBrainwashedSearchRecovery
    )
  ]));
