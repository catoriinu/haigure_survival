import {
  FreeCamera,
  Frustum,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  NPC_SPRITE_CENTER_HEIGHT
} from "../../../src/game/characterSprites";
import {
  type V2AlarmTriggerEvent
} from "../../../src/v2/alarmSystem";
import {
  V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS,
  createV2BeamSystem,
  type V2BeamCompletionEvent
} from "../../../src/v2/beamCollision";
import {
  isV2AliveState,
  isV2BrainwashState,
  type V2ActorSphere,
  type V2CharacterState,
  type V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import {
  V2_NPC_ALARM_SPEED,
  V2_NPC_CHASE_SPEED,
  V2_NPC_FOLLOWER_FIRE_COOLDOWN_SECONDS,
  V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS,
  V2_NPC_FOLLOWER_FIRE_DELAY_MIN_SECONDS,
  V2_NPC_FOLLOW_SEPARATION_METERS,
  V2_NPC_FOLLOW_SIGHT_DISTANCE_METERS,
  V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS,
  V2_NPC_FOLLOW_SPEED,
  V2_NPC_FOLLOW_TRACKING_DISTANCE_METERS,
  V2_NPC_CURRENT_TARGET_SIGHT_HERTZ,
  V2_NPC_AUTONOMOUS_THREAT_SIGHT_HERTZ,
  V2_NPC_LEAVE_MAXIMUM_SECONDS,
  V2_NPC_LEAVE_SPEED,
  V2_NPC_COMMAND_MAXIMUM_DISTANCE_METERS,
  createV2NpcSystem,
  type V2NpcCommandQuery,
  type V2NpcNavigationRouteContext,
  type V2NpcSystem
} from "../../../src/v2/npcSystem";
import {
  V2_FOLLOWER_FIRE_SPREAD_DEGREES,
  createV2FollowerFireDirection
} from "../../../src/v2/followerFireDirection";
import {
  createV2PlayerCombatSystem
} from "../../../src/v2/playerCombatSystem";
import {
  createV2PlayerInput,
  type V2PlayerAction
} from "../../../src/v2/playerInput";
import {
  DISTANCE_NAVIGATION_ROUTE_POLICY,
  type NavigationRouteCandidate,
  type NavigationWorld
} from "../../../src/world/navigationWorld";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import type { StageVolume } from "../../../src/world/stageSpatialQueries";
import { createStageWorldBoundary } from "../../../src/world/stageWorldBoundary";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import { createDefaultV2CharacterVisualRuntime } from "../characterVisualFixture";
import {
  createFixturePlayerSpawn,
  createFixtureSurfacePointSpawnRandom,
  createFixtureSurfaceTriangles
} from "./spawnContractFixture";

export type NpcCommandTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type NpcCommandFixture = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  system: V2NpcSystem;
  setSightResolver(
    resolver: ((from: Vector3, to: Vector3) => boolean) | null
  ): void;
  setPathsAvailable(available: boolean): void;
  setMovementBlocked(blocked: boolean): void;
  setProjectionResolver(
    resolver: ((position: Vector3) => Vector3 | null) | null
  ): void;
  getSpriteCellIndex(npcId: string): number;
  dispose(): void;
}>;

const EMPTY_ALARM_EVENTS:
  readonly V2AlarmTriggerEvent[] = Object.freeze([]);
const ALIVE_HUMANS_POLICY = Object.freeze({
  kind: "alive-humans" as const
});
const TEST_EPSILON = 1e-6;

const selectDistanceNavigationRoute = (
  _context: V2NpcNavigationRouteContext,
  candidates: readonly NavigationRouteCandidate[]
) => DISTANCE_NAVIGATION_ROUTE_POLICY.selectRoute(candidates);

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertNear = (
  actual: number,
  expected: number,
  tolerance: number,
  message: string
) => {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected=${expected}, actual=${actual}`
  );
};

const degreesToRadians = (degrees: number) =>
  (degrees * Math.PI) / 180;

const getFollowerSpreadAngles = (direction: Vector3) => {
  const normalized = direction.normalizeToNew();
  return Object.freeze({
    yawRadians: Math.atan2(normalized.x, normalized.z),
    pitchRadians: Math.asin(normalized.y)
  });
};

const assertFollowerSpreadDirection = (
  direction: Vector3,
  message: string
) => {
  const spreadRadians = degreesToRadians(
    V2_FOLLOWER_FIRE_SPREAD_DEGREES
  );
  const angles = getFollowerSpreadAngles(direction);
  assertNear(
    direction.length(),
    1,
    TEST_EPSILON,
    `${message}の方向が正規化されていません`
  );
  assert(
    Math.abs(angles.yawRadians) <=
      spreadRadians + TEST_EPSILON &&
      Math.abs(angles.pitchRadians) <=
        spreadRadians + TEST_EPSILON,
    `${message}がyaw／pitchの±${V2_FOLLOWER_FIRE_SPREAD_DEGREES}度を超えました: ` +
      `yaw=${(
        (angles.yawRadians * 180) /
        Math.PI
      ).toFixed(6)}, pitch=${(
        (angles.pitchRadians * 180) /
        Math.PI
      ).toFixed(6)}`
  );
};

const assertThrows = (
  operation: () => void,
  message: string
) => {
  let thrown = false;
  try {
    operation();
  } catch {
    thrown = true;
  }
  assert(thrown, message);
};

const executeTest = async (
  name: string,
  operation: () => string | Promise<string>
): Promise<NpcCommandTestResult> => {
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
      detail:
        error instanceof Error
          ? error.stack ?? error.message
          : String(error)
    });
  }
};

const createInitializationRandom = (
  npcCount: number,
  initialBrainwashedNpcCount: number
) => {
  const values: number[] = [];
  for (let index = 0; index < npcCount; index += 1) {
    if (index < initialBrainwashedNpcCount) {
      const stateRoll =
        index === 0 ? 0.1 : index === 1 ? 0.6 : 0.95;
      values.push(stateRoll, 0.5, 0.5);
      if (stateRoll < 0.45) {
        values.push(0.5, 0.5);
      }
    } else {
      values.push(0.5, 0.5);
    }
  }
  let valueIndex = 0;
  return () => {
    const value = values[valueIndex] ?? 0.5;
    valueIndex += 1;
    return value;
  };
};

const createNpcSpawnRandom = (npcCount: number) => {
  const gridSize = Math.ceil(Math.sqrt(npcCount));
  return createFixtureSurfacePointSpawnRandom(
    Array.from({ length: npcCount }, (_, index) =>
      Object.freeze({
        xRatio:
          0.05 +
          (0.9 * (index % gridSize)) /
            Math.max(1, gridSize - 1),
        zRatio:
          0.05 +
          (0.9 * Math.floor(index / gridSize)) /
            Math.max(1, gridSize - 1)
      })
    ),
    0x5405_3000 ^ npcCount
  );
};

const createNpcCommandFixture = async (
  npcCount: number,
  initialBrainwashedNpcCount: number,
  boundaryExtent = 4,
  observeRouteContext:
    | ((context: V2NpcNavigationRouteContext) => void)
    | null = null
): Promise<NpcCommandFixture> => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateBox(
    "t05-3-ground",
    {
      width: boundaryExtent * 2,
      height: 1,
      depth: boundaryExtent * 2
    },
    scene
  );
  ground.computeWorldMatrix(true);

  let sightResolver:
    | ((from: Vector3, to: Vector3) => boolean)
    | null = null;
  let pathsAvailable = true;
  let movementBlocked = false;
  let projectionResolver:
    | ((position: Vector3) => Vector3 | null)
    | null = null;

  const createLocation = (position: Vector3) =>
    Object.freeze({
      position: new Vector3(position.x, 0, position.z),
      polygonRef: 1
    });
  const isInside = (position: Vector3) =>
    Math.abs(position.x) <= boundaryExtent &&
    Math.abs(position.z) <= boundaryExtent;
  const navigation: NavigationWorld = {
    getSurfaceTriangles: () =>
      createFixtureSurfaceTriangles(
        -boundaryExtent,
        boundaryExtent,
        -boundaryExtent,
        boundaryExtent
      ),
    projectPoint: (position, maxDistance) => {
      if (!isInside(position)) {
        return null;
      }
      const resolvedPosition = projectionResolver
        ? projectionResolver(position)
        : position;
      if (!resolvedPosition) {
        return null;
      }
      const projected = createLocation(resolvedPosition);
      return Vector3.Distance(
        position,
        projected.position
      ) <= maxDistance
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
        distance: Vector3.Distance(
          start.position,
          destination.position
        )
      }),
    findPath: (start, destination, _moverKind, routePolicy) => {
      if (!pathsAvailable) {
        return null;
      }
      const surface = Object.freeze({
        kind: "surface" as const,
        points: Object.freeze([
          createLocation(start.position),
          createLocation(destination.position)
        ]),
        distance: Vector3.Distance(
          start.position,
          destination.position
        )
      });
      const path = Object.freeze({
        steps: Object.freeze([surface]),
        destination: createLocation(destination.position),
        distance: surface.distance
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
    constrainMovement: (start, destination) => {
      if (movementBlocked) {
        return createLocation(start.position);
      }
      return isInside(destination)
        ? createLocation(destination)
        : null;
    },
    randomPointAround: (origin) =>
      createLocation(origin.position),
    createDebugMesh: () => ground,
    dispose: () => undefined
  };

  const navigationArea = Object.freeze({
    id: "t05-npc-command-area",
    volumes: Object.freeze([])
  });
  const npcSpawnVolume: StageVolume = Object.freeze({
    id: "t05-npc-command-spawn",
    role: "npc_spawn",
    bitFlightBand: null,
    playerSpawnId: null,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh: ground
  });
  const playerSpawn = createFixturePlayerSpawn(
    "t05-npc-command-player-spawn",
    ground
  );
  const stage = {
    resources: Object.freeze({
      beamBlockers: Object.freeze([]),
      sightBlockers: Object.freeze([])
    }),
    navigation,
    volumes: Object.freeze({
      all: Object.freeze([npcSpawnVolume]),
      getById: (id: string) =>
        id === npcSpawnVolume.id ? npcSpawnVolume : null,
      getByRole: (role: StageVolume["role"]) =>
        role === "npc_spawn"
          ? Object.freeze([npcSpawnVolume])
          : Object.freeze([])
    }),
    navigationAreas: Object.freeze({
      all: Object.freeze([navigationArea]),
      portals: Object.freeze([]),
      getById: (id: string) => id === navigationArea.id ? navigationArea : null,
      locate: () => Object.freeze({ areaId: navigationArea.id, portalId: null }),
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
      id: "t05-3-stage" as const,
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
      castSightSegment: (from: Vector3, to: Vector3) =>
        sightResolver?.(from, to)
          ? Object.freeze({
              point: Vector3.Zero(),
              normal: Vector3.Up(),
              distance: 0,
              mesh: ground
            })
          : null,
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
      initialBrainwashedNpcCount
    ),
    spawnRandom: createNpcSpawnRandom(npcCount),
    playerSpawn,
    resolveTargetNavigationArea: (target) =>
      Object.freeze({
        targetId: target.id,
        areaId: navigationArea.id,
        revision: 0,
        anchor: target.footPosition.clone()
      }),
    selectNavigationRoute: (context, candidates) => {
      observeRouteContext?.(context);
      return selectDistanceNavigationRoute(context, candidates);
    }
  });

  return Object.freeze({
    scene,
    stage,
    system,
    setSightResolver: (resolver) => {
      sightResolver = resolver;
    },
    setPathsAvailable: (available) => {
      pathsAvailable = available;
    },
    setMovementBlocked: (blocked) => {
      movementBlocked = blocked;
    },
    setProjectionResolver: (resolver) => {
      projectionResolver = resolver;
    },
    getSpriteCellIndex: (npcId) => {
      const sprite = scene.spriteManagers
        ?.flatMap((manager) => manager.sprites)
        .find((candidate) => candidate.name === npcId);
      if (!sprite) {
        throw new Error(
          `T05-3 fixtureのNPC spriteがありません: ${npcId}`
        );
      }
      return sprite.cellIndex;
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
  const aimPosition = footPosition.add(
    new Vector3(0, 0.3, 0)
  );
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

const createCommandQuery = (
  playerTarget: V2HumanTargetSnapshot,
  isInCameraFrustum: (position: Vector3) => boolean =
    () => true
): V2NpcCommandQuery =>
  Object.freeze({
    playerTarget,
    cameraPosition: new Vector3(
      playerTarget.footPosition.x,
      playerTarget.footPosition.y + NPC_SPRITE_CENTER_HEIGHT,
      playerTarget.footPosition.z
    ),
    cameraDirection: new Vector3(0, 0, 1),
    isInCameraFrustum
  });

const placeNpcs = (
  system: V2NpcSystem,
  positions: readonly Vector3[]
) => {
  system.placeNpcs(
    positions.map((footPosition, index) =>
      Object.freeze({
        id: `npc_${index}`,
        footPosition,
        formation: false
      })
    )
  );
};

const getNpcTarget = (
  system: V2NpcSystem,
  npcId: string
) => {
  const target = system
    .getFrameView()
    .targets.find((candidate) => candidate.id === npcId);
  if (!target) {
    throw new Error(`NPC snapshotがありません: ${npcId}`);
  }
  return target;
};

const getTracking = (
  system: V2NpcSystem,
  npcId: string
) => {
  const tracking = system
    .getFrameView()
    .tracking.find((candidate) => candidate.npcId === npcId);
  if (!tracking) {
    throw new Error(`NPC追跡snapshotがありません: ${npcId}`);
  }
  return tracking;
};

const testPlayerActions = async () => {
  const target = new EventTarget() as unknown as Window;
  const input = createV2PlayerInput(target);
  const dispatchKey = (
    code: string,
    repeat = false
  ) => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { code, repeat })
    );
  };
  const expectedActions: readonly V2PlayerAction[] =
    Object.freeze([
      "npc-follow",
      "npc-leave",
      "door-toggle",
      "select-gun",
      "select-no-gun",
      "select-haigure",
      "replay-execution"
    ]);

  ["KeyF", "KeyE", "KeyC", "KeyG", "KeyN", "KeyH", "KeyR"].forEach(
    (code) => dispatchKey(code)
  );
  dispatchKey("KeyF", true);
  assert(
    input.drainPressedActions().join("|") ===
      expectedActions.join("|"),
    "F/E/C/G/N/H/Rのaction順またはrepeat無視が不正です。"
  );
  assert(
    input.drainPressedActions().length === 0,
    "drain後にactionが残っています。"
  );

  dispatchKey("KeyF");
  input.reset();
  assert(
    input.drainPressedActions().length === 0,
    "reset後にactionが残っています。"
  );
  dispatchKey("KeyE");
  target.dispatchEvent(new Event("blur"));
  assert(
    input.drainPressedActions().length === 0,
    "blur後にactionが残っています。"
  );
  dispatchKey("KeyC");
  input.dispose();
  target.dispatchEvent(
    new KeyboardEvent("keydown", { code: "KeyG" })
  );
  assertThrows(
    () => input.drainPressedActions(),
    "dispose後の入力参照が拒否されません。"
  );
  return "7 actionを発生順に一度だけdrainし、repeat/reset/blur/disposeを確認";
};

const testPlayerGunFireEventSnapshot = async () => {
  const gunPlayer = createV2PlayerCombatSystem({
    playerId: "player",
    initialState: "brainwash-complete-gun",
    random: () => 0.5
  });
  const callerDirection = new Vector3(0, 0, 4);
  const event = gunPlayer.requestGunFire(
    new Vector3(0, 0.3, 0),
    callerDirection
  );
  if (!event) {
    throw new Error(
      "gun状態で成立する射撃eventが生成されません。"
    );
  }
  assert(
    event.direction.equals(new Vector3(0, 0, 1)) &&
      event.beamRequest.direction.equals(
        new Vector3(0, 0, 1)
      ) &&
      event.direction !== callerDirection &&
      event.beamRequest.direction !== callerDirection &&
      event.beamRequest.direction !== event.direction,
    "成立射撃eventとbeam requestが独立した正規化方向を保持しません。"
  );
  callerDirection.set(4, 0, 0);
  assert(
    event.direction.equals(new Vector3(0, 0, 1)) &&
      event.beamRequest.direction.equals(
        new Vector3(0, 0, 1)
      ),
    "caller方向の変更が成立射撃eventへ混入しました。"
  );

  const unavailableStates: readonly V2CharacterState[] =
    Object.freeze([
      "normal",
      "evade",
      "brainwash-complete-no-gun",
      "brainwash-complete-haigure",
      "brainwash-complete-haigure-formation"
    ]);
  for (const state of unavailableStates) {
    const player = createV2PlayerCombatSystem({
      playerId: `player-${state}`,
      initialState: state,
      random: () => 0.5
    });
    assert(
      player.requestGunFire(
        new Vector3(0, 0.3, 0),
        new Vector3(0, 0, 1)
      ) === null,
      `射撃不能状態${state}がgun射撃eventを生成しました。`
    );
  }
  return "成立gun方向を独立clone・正規化し、射撃不能5状態はeventなし";
};

const testCandidateSelection = async () => {
  const fixture = await createNpcCommandFixture(5, 0);
  const player = createPlayerTarget(Vector3.Zero());
  try {
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.25),
      new Vector3(0, 0, 0.25),
      new Vector3(0, 0, 0.45),
      new Vector3(0.1, 0, 0.15),
      new Vector3(
        0,
        0,
        V2_NPC_COMMAND_MAXIMUM_DISTANCE_METERS *
          BLENDER_METERS_TO_WORLD_UNITS
      )
    ]);
    const candidates = fixture.system.getCommandCandidates(
      createCommandQuery(player)
    );
    assert(
      candidates.map((candidate) => candidate.npcId).join("|") ===
        "npc_0|npc_1|npc_2|npc_4|npc_3",
      "照準角・距離・ID順または3m上限が不正です。"
    );
    assertNear(
      candidates[0].distanceMeters,
      1,
      TEST_EPSILON,
      "物理距離換算が不正です"
    );
    assert(
      candidates.every(
        (candidate) =>
          candidate.commandMode === "none" &&
          candidate.aimPosition instanceof Vector3
      ),
      "候補snapshotの公開項目が不正です。"
    );
    assert(
      V2_NPC_COMMAND_MAXIMUM_DISTANCE_METERS === 3 &&
        candidates.some(
          (candidate) =>
            candidate.npcId === "npc_4" &&
            Math.abs(candidate.distanceMeters - 3) <= TEST_EPSILON
        ),
      "3.0m境界上のNPCが候補になりません。"
    );
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.25),
      new Vector3(0, 0, 0.25),
      new Vector3(0, 0, 0.45),
      new Vector3(0.1, 0, 0.15),
      new Vector3(
        0,
        0,
        (V2_NPC_COMMAND_MAXIMUM_DISTANCE_METERS + 0.01) *
          BLENDER_METERS_TO_WORLD_UNITS
      )
    ]);
    assert(
      !fixture.system
        .getCommandCandidates(createCommandQuery(player))
        .some((candidate) => candidate.npcId === "npc_4"),
      "3.0m超のNPCが候補へ残っています。"
    );

    const camera = new FreeCamera(
      "t05-3-command-camera",
      new Vector3(0, NPC_SPRITE_CENTER_HEIGHT, 0),
      fixture.scene
    );
    camera.minZ = 0.01;
    camera.maxZ = 10;
    camera.setTarget(
      new Vector3(0, NPC_SPRITE_CENTER_HEIGHT, 1)
    );
    fixture.scene.activeCamera = camera;
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    const frustumPlanes = Frustum.GetPlanes(
      camera.getTransformationMatrix()
    );
    const frustumCandidates =
      fixture.system.getCommandCandidates(
        createCommandQuery(
          player,
          (position) =>
            Frustum.IsPointInFrustum(position, frustumPlanes)
        )
      );
    assert(
      frustumCandidates.length > 0,
      "実Babylon camera frustum内のNPCが候補になりません。"
    );
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.25),
      new Vector3(0, 0, -0.25),
      new Vector3(0.1, 0, 0.25),
      new Vector3(-0.1, 0, 0.25),
      new Vector3(
        0,
        0,
        (V2_NPC_COMMAND_MAXIMUM_DISTANCE_METERS + 0.01) *
          BLENDER_METERS_TO_WORLD_UNITS
      )
    ]);
    const cameraCandidates =
      fixture.system.getCommandCandidates(
        createCommandQuery(
          player,
          (position) =>
            Frustum.IsPointInFrustum(position, frustumPlanes)
        )
      );
    assert(
      cameraCandidates.some(
        (candidate) => candidate.npcId === "npc_0"
      ) &&
        !cameraCandidates.some(
          (candidate) => candidate.npcId === "npc_1"
        ),
      "active cameraの実frustumで前方／後方を選別できません。"
    );

    const sightStarts: Vector3[] = [];
    fixture.setSightResolver(
      (from, to) => {
        sightStarts.push(from.clone());
        return to.x > 0.05;
      }
    );
    const visibleCandidates =
      fixture.system.getCommandCandidates(
        createCommandQuery(player)
      );
    assert(
      !visibleCandidates.some(
        (candidate) => candidate.npcId === "npc_2"
      ),
      "遮蔽NPCが候補へ残っています。"
    );
    assert(
      sightStarts.length > 0 &&
        sightStarts.every((from) =>
          from.equals(player.aimPosition)
        ),
      "視線判定がプレイヤー眼位置から開始されていません。"
    );
    assert(
      fixture.system.getCommandCandidates(
        createCommandQuery(
          createPlayerTarget(
            Vector3.Zero(),
            "brainwash-complete-gun"
          )
        )
      ).length === 0,
      "異なる陣営のNPCが候補へ残っています。"
    );
    return "同陣営・3m境界・実camera frustum・眼位置LOSを適用し、角度→距離→IDで安定ソート";
  } finally {
    fixture.dispose();
  }
};

const testCommandStateEligibility = async () => {
  const aliveFixture = await createNpcCommandFixture(2, 0);
  const brainwashedFixture = await createNpcCommandFixture(3, 3);
  const alivePlayer = createPlayerTarget(Vector3.Zero());
  const brainwashedPlayer = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const positions = [
    new Vector3(-0.1, 0, 0.3),
    new Vector3(0.1, 0, 0.3)
  ] as const;
  try {
    placeNpcs(aliveFixture.system, positions);
    aliveFixture.system.setExternalThreats([
      Object.freeze({
        sourceId: "bit-threat",
        targetId: "npc_1",
        sourcePosition: new Vector3(0.2, 0, 0.3),
        sightClear: true
      })
    ]);
    aliveFixture.system.update(
      0.01,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getNpcTarget(aliveFixture.system, "npc_0").state ===
        "normal" &&
        getNpcTarget(aliveFixture.system, "npc_1").state ===
          "evade" &&
        aliveFixture.system.getCommandCandidates(
          createCommandQuery(alivePlayer)
        ).length === 2,
      "未洗脳プレイヤーがnormal／evade NPCを対象にできません。"
    );

    const hitResult = aliveFixture.system.applyBeamImpacts([
      Object.freeze({
        npcId: "npc_0",
        source: Object.freeze({
          sourceId: "bit_0",
          originKind: "bit-chase" as const
        })
      })
    ]);
    assert(
      hitResult[0].accepted &&
        !aliveFixture.system
          .getCommandCandidates(createCommandQuery(alivePlayer))
          .some((candidate) => candidate.npcId === "npc_0"),
      "hit NPCが未洗脳プレイヤーの候補へ残っています。"
    );
    aliveFixture.system.update(
      4,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getNpcTarget(aliveFixture.system, "npc_0").state ===
        "brainwash-in-progress" &&
        !aliveFixture.system
          .getCommandCandidates(
            createCommandQuery(brainwashedPlayer)
          )
          .some((candidate) => candidate.npcId === "npc_0"),
      "洗脳中NPCが洗脳済みプレイヤーの候補へ残っています。"
    );

    placeNpcs(brainwashedFixture.system, [
      new Vector3(-0.1, 0, 0.3),
      new Vector3(0, 0, 0.3),
      new Vector3(0.1, 0, 0.3)
    ]);
    assert(
      brainwashedFixture.system
        .getCommandCandidates(
          createCommandQuery(brainwashedPlayer)
        )
        .map((candidate) => candidate.npcId)
        .sort()
        .join("|") === "npc_0|npc_1|npc_2",
      "洗脳済みプレイヤーがgun／no-gun／haigureを対象にできません。"
    );
    const formationResult =
      brainwashedFixture.system.enterFormationStates([
        "npc_2"
      ]);
    assert(
      formationResult[0].accepted &&
        !brainwashedFixture.system
          .getCommandCandidates(
            createCommandQuery(brainwashedPlayer)
          )
          .some((candidate) => candidate.npcId === "npc_2"),
      "集合編隊中NPCが候補へ残っています。"
    );
    return "normal／evadeと洗脳完了3状態を許可し、hit・洗脳中・集合編隊を除外";
  } finally {
    aliveFixture.dispose();
    brainwashedFixture.dispose();
  }
};

const testCommandRequestContract = async () => {
  const fixture = await createNpcCommandFixture(2, 0);
  const player = createPlayerTarget(Vector3.Zero());
  try {
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.3),
      new Vector3(0.1, 0, 0.3)
    ]);
    const query = createCommandQuery(player);
    assertThrows(
      () =>
        fixture.system.requestCommand(
          "npc_missing",
          "follow",
          query
        ),
      "未知IDがthrowされません。"
    );
    assert(
      !fixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(player, () => false)
      ),
      "要求時点で対象外の既知IDがfalseになりません。"
    );
    assert(
      getTracking(fixture.system, "npc_1").commandMode ===
        "none",
      "対象外要求が別NPCへ暗黙fallbackしました。"
    );
    assert(
      fixture.system.requestCommand("npc_0", "follow", query),
      "有効なFollow指示が受理されません。"
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "Followがframe snapshotへ公開されません。"
    );
    assert(
      fixture.system.cancelFollow("npc_0") &&
        getTracking(fixture.system, "npc_0").commandMode ===
          "none" &&
        !fixture.system.cancelFollow("npc_0"),
      "定員拒否接続用のFollow解除hookが不正です。"
    );
    return "未知ID throw、対象外false、fallbackなし、Follow解除hookを確認";
  } finally {
    fixture.dispose();
  }
};

const testFollowMovementAndRelease = async () => {
  const fixture = await createNpcCommandFixture(2, 0);
  const player = createPlayerTarget(Vector3.Zero());
  try {
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.25),
      new Vector3(0, 0, 0.25)
    ]);
    const query = createCommandQuery(player);
    assert(
      fixture.system.requestCommand("npc_0", "follow", query) &&
        fixture.system.requestCommand("npc_1", "follow", query),
      "複数Followerを上限なしで設定できません。"
    );
    const before = getNpcTarget(
      fixture.system,
      "npc_0"
    ).footPosition.clone();
    fixture.system.update(0, player, EMPTY_ALARM_EVENTS);
    fixture.system.update(0.2, player, EMPTY_ALARM_EVENTS);
    const after = getNpcTarget(
      fixture.system,
      "npc_0"
    ).footPosition;
    assert(
      Vector3.Distance(before, after) > 0,
      "重複Followerの局所分離が作動しません。"
    );
    assert(
      Vector3.Distance(
        getNpcTarget(fixture.system, "npc_0").footPosition,
        getNpcTarget(fixture.system, "npc_1").footPosition
      ) > 0,
      "複数Followerが同一点に残っています。"
    );
    for (let frame = 0; frame < 10; frame += 1) {
      fixture.system.update(
        0.05,
        player,
        EMPTY_ALARM_EVENTS
      );
    }
    const separatedDistance = Vector3.Distance(
      getNpcTarget(fixture.system, "npc_0").footPosition,
      getNpcTarget(fixture.system, "npc_1").footPosition
    );
    assert(
      separatedDistance + 0.005 >=
        V2_NPC_FOLLOW_SEPARATION_METERS *
          BLENDER_METERS_TO_WORLD_UNITS,
      `Follower間隔が約0.8mまで分離しません: ${separatedDistance}`
    );

    fixture.setSightResolver(() => true);
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS + 0.1,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (tracking) => tracking.commandMode === "follow"
        ),
      "5m以内の視線遮蔽でFollowが解除されました。"
    );
    const distantPlayer = createPlayerTarget(
      new Vector3(0, 0, -2)
    );
    fixture.setMovementBlocked(true);
    fixture.setSightResolver(null);
    fixture.system.update(
      1 / V2_NPC_CURRENT_TARGET_SIGHT_HERTZ,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    fixture.setSightResolver(() => true);
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS - 0.8,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (tracking) => tracking.commandMode === "follow"
        ),
      "5m超で最初の5秒未満の視線喪失によりFollowが解除されました。"
    );
    fixture.setSightResolver(null);
    fixture.system.update(
      1 / V2_NPC_CURRENT_TARGET_SIGHT_HERTZ,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    fixture.setSightResolver(() => true);
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS - 0.8,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (tracking) => tracking.commandMode === "follow"
        ),
      "再視認で視線喪失時間が0へ戻りません。"
    );
    fixture.system.update(0.81, distantPlayer, EMPTY_ALARM_EVENTS);
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (tracking) => tracking.commandMode === "none"
        ),
      "5m超かつ連続5秒の視線喪失でFollowが解除されません。"
    );
    fixture.setMovementBlocked(false);

    fixture.setSightResolver(null);
    assert(
      fixture.system.requestCommand("npc_0", "follow", query) &&
        fixture.system.requestCommand("npc_1", "follow", query),
      "陣営不一致解除前のFollow再設定に失敗しました。"
    );
    fixture.system.update(
      0.01,
      createPlayerTarget(
        Vector3.Zero(),
        "brainwash-complete-gun"
      ),
      EMPTY_ALARM_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (tracking) => tracking.commandMode === "none"
        ),
      "プレイヤーとの陣営不一致でFollowが解除されません。"
    );
    assert(
      fixture.system.requestCommand("npc_0", "follow", query) &&
        fixture.system.requestCommand("npc_1", "follow", query),
      "被弾解除前のFollow再設定に失敗しました。"
    );
    fixture.system.notifyPlayerImpactAccepted();
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (tracking) => tracking.commandMode === "none"
        ),
      "未洗脳プレイヤー被弾でFollower全員が解除されません。"
    );

    assert(
      fixture.system.requestCommand("npc_0", "follow", query) &&
        fixture.system.requestCommand("npc_1", "follow", query),
      "本人被弾解除前のFollow再設定に失敗しました。"
    );
    const impactResult = fixture.system.applyBeamImpacts([
      Object.freeze({
        npcId: "npc_0",
        source: Object.freeze({
          sourceId: "player",
          originKind: "player-gun" as const
        })
      })
    ]);
    assert(
      impactResult[0].accepted &&
        getTracking(fixture.system, "npc_0").commandMode ===
          "none" &&
        getTracking(fixture.system, "npc_1").commandMode ===
          "follow",
      "Follower本人への有効被弾が本人だけを解除しません。"
    );
    return "約0.8m分離、5m近距離維持、再視認を含む5秒LOS、陣営不一致、プレイヤー全解除・本人だけ解除を確認";
  } finally {
    fixture.dispose();
  }
};

const testFollowStopAndResume = async () => {
  const fixture = await createNpcCommandFixture(1, 0);
  const player = createPlayerTarget(Vector3.Zero());
  try {
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.25)
    ]);
    assert(
      fixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(player)
      ),
      "停止距離検証のFollowが受理されません。"
    );
    const stoppedPosition = getNpcTarget(
      fixture.system,
      "npc_0"
    ).footPosition.clone();
    fixture.system.update(0.5, player, EMPTY_ALARM_EVENTS);
    assertNear(
      Vector3.Distance(
        stoppedPosition,
        getNpcTarget(fixture.system, "npc_0").footPosition
      ),
      0,
      TEST_EPSILON,
      "1.0m停止距離で移動しました"
    );

    const fartherPlayer = createPlayerTarget(
      new Vector3(0, 0, -0.1)
    );
    fixture.system.update(
      0,
      fartherPlayer,
      EMPTY_ALARM_EVENTS
    );
    fixture.system.update(
      0.5,
      fartherPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      Vector3.Distance(
        stoppedPosition,
        getNpcTarget(fixture.system, "npc_0").footPosition
      ) > 0,
      "1.2m超でFollow移動が再開しません。"
    );
    return "1.0m停止・1.2m超再開のヒステリシスを確認";
  } finally {
    fixture.dispose();
  }
};

const testFollowAndLeaveSpeeds = async () => {
  const aliveFixture = await createNpcCommandFixture(1, 0);
  const brainwashedFixture = await createNpcCommandFixture(3, 3);
  const alivePlayer = createPlayerTarget(Vector3.Zero());
  const brainwashedPlayer = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const stepSeconds = 0.2;
  const followStart = new Vector3(0, 0, 0.4);
  const assertFollowStep = (
    fixture: NpcCommandFixture,
    npcId: string,
    player: V2HumanTargetSnapshot,
    positions: readonly Vector3[]
  ) => {
    placeNpcs(fixture.system, positions);
    assert(
      fixture.system.requestCommand(
        npcId,
        "follow",
        createCommandQuery(player)
      ),
      `${npcId}の速度検証用Followが受理されません。`
    );
    fixture.system.update(0, player, EMPTY_ALARM_EVENTS);
    const before = getNpcTarget(
      fixture.system,
      npcId
    ).footPosition.clone();
    fixture.system.update(
      stepSeconds,
      player,
      EMPTY_ALARM_EVENTS
    );
    assertNear(
      Vector3.Distance(
        before,
        getNpcTarget(fixture.system, npcId).footPosition
      ),
      V2_NPC_FOLLOW_SPEED * stepSeconds,
      TEST_EPSILON,
      `${npcId}のFollow速度が0.5ではありません`
    );
    assert(
      fixture.system.cancelFollow(npcId),
      `${npcId}の速度検証用Followを解除できません。`
    );
  };
  try {
    assert(
      V2_NPC_FOLLOW_SPEED === 0.5 &&
        V2_NPC_LEAVE_SPEED === 0.3,
      `Follow／Leave速度定数が不正です: ${V2_NPC_FOLLOW_SPEED}/${V2_NPC_LEAVE_SPEED}`
    );
    assertFollowStep(
      aliveFixture,
      "npc_0",
      alivePlayer,
      [followStart]
    );

    const expectedBrainwashedStates = [
      "brainwash-complete-gun",
      "brainwash-complete-no-gun",
      "brainwash-complete-haigure"
    ] as const;
    for (
      let targetIndex = 0;
      targetIndex < expectedBrainwashedStates.length;
      targetIndex += 1
    ) {
      const positions = [
        new Vector3(-3, 0, 3),
        new Vector3(3, 0, 3),
        new Vector3(0, 0, -3)
      ];
      positions[targetIndex] = followStart;
      const npcId = `npc_${targetIndex}`;
      placeNpcs(brainwashedFixture.system, positions);
      assert(
        getNpcTarget(brainwashedFixture.system, npcId).state ===
          expectedBrainwashedStates[targetIndex],
        `${npcId}の速度検証状態が不正です。`
      );
      assertFollowStep(
        brainwashedFixture,
        npcId,
        brainwashedPlayer,
        positions
      );
    }

    placeNpcs(aliveFixture.system, [followStart]);
    const leaveBefore = getNpcTarget(
      aliveFixture.system,
      "npc_0"
    ).footPosition.clone();
    assert(
      aliveFixture.system.requestCommand(
        "npc_0",
        "leave",
        createCommandQuery(alivePlayer)
      ),
      "速度検証用Leaveが受理されません。"
    );
    aliveFixture.system.update(
      0,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    aliveFixture.system.update(
      stepSeconds,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    assertNear(
      Vector3.Distance(
        leaveBefore,
        getNpcTarget(aliveFixture.system, "npc_0").footPosition
      ),
      V2_NPC_LEAVE_SPEED * stepSeconds,
      TEST_EPSILON,
      "Leave速度が従来の0.3ではありません"
    );
    return "normal／gun／no-gun／haigureのFollow速度0.5、Leave速度0.3を確認";
  } finally {
    aliveFixture.dispose();
    brainwashedFixture.dispose();
  }
};

const testFollowDistanceAndOcclusion = async () => {
  const fixture = await createNpcCommandFixture(1, 0, 5);
  const initialPlayer = createPlayerTarget(Vector3.Zero());
  const start = new Vector3(0, 0, 0.4);
  const requestFollow = () => {
    assert(
      fixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(initialPlayer)
      ),
      "距離・遮蔽検証用Followが受理されません。"
    );
  };
  try {
    assert(
      V2_NPC_FOLLOW_TRACKING_DISTANCE_METERS === 5 &&
        V2_NPC_FOLLOW_SIGHT_DISTANCE_METERS === 12 &&
        V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS === 5,
      "Follow距離契約5m／12m／5秒が不正です。"
    );

    placeNpcs(fixture.system, [start]);
    requestFollow();
    fixture.setSightResolver(() => true);
    const nearOccludedPlayer = createPlayerTarget(
      new Vector3(0, 0, -0.8)
    );
    fixture.system.update(
      0,
      nearOccludedPlayer,
      EMPTY_ALARM_EVENTS
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS + 0.1,
      nearOccludedPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow" &&
        Vector3.Distance(
          getNpcTarget(fixture.system, "npc_0").footPosition,
          nearOccludedPlayer.footPosition
        ) <= TEST_EPSILON,
      "5m以内の遮蔽中に現在player位置を追従し続けません。"
    );

    fixture.setMovementBlocked(true);
    fixture.setSightResolver(null);
    placeNpcs(fixture.system, [start]);
    requestFollow();
    fixture.setSightResolver(() => true);
    const sightBoundaryPlayer = createPlayerTarget(
      new Vector3(
        0,
        0,
        start.z -
          V2_NPC_FOLLOW_SIGHT_DISTANCE_METERS *
            BLENDER_METERS_TO_WORLD_UNITS
      )
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS - 0.01,
      sightBoundaryPlayer,
      EMPTY_ALARM_EVENTS
    );
    fixture.setSightResolver(null);
    fixture.system.update(
      0.02,
      sightBoundaryPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "5秒直前に回復した12m境界のLOSを再確認せずFollowを解除しました。"
    );

    placeNpcs(fixture.system, [start]);
    requestFollow();
    const outsideSightPlayer = createPlayerTarget(
      new Vector3(
        0,
        0,
        start.z -
          (V2_NPC_FOLLOW_SIGHT_DISTANCE_METERS *
            BLENDER_METERS_TO_WORLD_UNITS +
            0.001)
      )
    );
    fixture.system.update(
      0,
      outsideSightPlayer,
      EMPTY_ALARM_EVENTS
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS - 0.001,
      outsideSightPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "12m超の最初の5秒未満でFollowが解除されました。"
    );
    fixture.system.update(
      0.002,
      outsideSightPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "none",
      "12m超かつ5m超のLOS不成立が5秒続いてもFollowが解除されません。"
    );
    return "遮蔽中5m追跡、LOS clearの12m境界、12m超の5秒解除を確認";
  } finally {
    fixture.dispose();
  }
};

const testFollowElevatorSightGrace = async () => {
  const fixture = await createNpcCommandFixture(1, 0, 6);
  const nearbyPlayer = createPlayerTarget(
    new Vector3(0, 0, -0.5)
  );
  const distantPlayer = createPlayerTarget(
    new Vector3(0, 0, -5)
  );
  const destinationFloorPosition = new Vector3(0, 0, 2);
  try {
    placeNpcs(fixture.system, [Vector3.Zero()]);
    assert(
      fixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(nearbyPlayer)
      ),
      "エレベーター見失い停止検証のFollowが受理されません。"
    );
    fixture.setSightResolver(() => true);
    fixture.setMovementBlocked(true);
    fixture.system.setPlayerElevatorTraversalSnapshot(
      Object.freeze({
        elevatorId: "elevator-follow-test",
        linkId: "link-follow-test",
        from: "A" as const,
        to: "B" as const,
        destinationFloorPosition,
        phase: "riding" as const
      })
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS + 0.1,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "player elevator snapshot中に12m超・遮蔽の5秒見失いでFollowが解除されました。"
    );

    fixture.system.setPlayerElevatorTraversalSnapshot(
      Object.freeze({
        elevatorId: "elevator-follow-test",
        linkId: "link-follow-test",
        from: "A" as const,
        to: "B" as const,
        destinationFloorPosition,
        phase: "completed" as const
      })
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS + 0.1,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "搬送完了terminalで目的階到達前のFollowが解除されました。"
    );
    fixture.system.setPlayerElevatorTraversalSnapshot(null);
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS + 0.1,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "snapshot終了後、目的階へ到達する前にFollowが解除されました。"
    );

    fixture.setMovementBlocked(false);
    fixture.system.update(
      4 + TEST_EPSILON,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    fixture.system.update(
      0,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "目的階到達の認識時点でFollowが即時解除されました。"
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS - 0.001,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "目的階到達後の通常見失い猶予5秒未満でFollowが解除されました。"
    );
    fixture.system.update(
      0.001 + TEST_EPSILON,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "none",
      "目的階到達後に通常の5秒見失い解除へ復帰しません。"
    );
    return "搬送中とcompleted terminal後の目的階到達前は見失い停止、到達後は通常5秒境界へ復帰";
  } finally {
    fixture.dispose();
  }
};

const testFollowElevatorCancellationResumesSightGrace = async () => {
  const fixture = await createNpcCommandFixture(1, 0, 6);
  const nearbyPlayer = createPlayerTarget(
    new Vector3(0, 0, -0.5)
  );
  const distantPlayer = createPlayerTarget(
    new Vector3(0, 0, -5)
  );
  const destinationFloorPosition = new Vector3(0, 0, 2);
  try {
    placeNpcs(fixture.system, [Vector3.Zero()]);
    assert(
      fixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(nearbyPlayer)
      ),
      "エレベーター取消検証のFollowが受理されません。"
    );
    fixture.setSightResolver(() => true);
    fixture.setMovementBlocked(true);
    fixture.system.setPlayerElevatorTraversalSnapshot(
      Object.freeze({
        elevatorId: "elevator-follow-cancel-test",
        linkId: "link-follow-cancel-test",
        from: "A" as const,
        to: "B" as const,
        destinationFloorPosition,
        phase: "reserved" as const
      })
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS + 0.1,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "予約中に見失い猶予が進行しました。"
    );

    fixture.system.setPlayerElevatorTraversalSnapshot(
      Object.freeze({
        elevatorId: "elevator-follow-cancel-test",
        linkId: "link-follow-cancel-test",
        from: "A" as const,
        to: "B" as const,
        destinationFloorPosition,
        phase: "cancelled" as const
      })
    );
    fixture.system.update(
      V2_NPC_FOLLOW_SIGHT_GRACE_SECONDS - 0.001,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "follow",
      "取消後の通常見失い猶予5秒未満でFollowが解除されました。"
    );
    fixture.system.setPlayerElevatorTraversalSnapshot(null);
    fixture.system.update(
      0.001 + TEST_EPSILON,
      distantPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(fixture.system, "npc_0").commandMode === "none",
      "乗車前取消後に目的階追跡を破棄して通常の5秒見失い解除へ復帰しません。"
    );
    return "reserved中は見失い停止、cancelled terminalで保存目的階を破棄して通常5秒境界へ復帰";
  } finally {
    fixture.dispose();
  }
};

const testFollowAlarmPriority = async () => {
  const fixture = await createNpcCommandFixture(4, 3);
  const aliveFixture = await createNpcCommandFixture(1, 0);
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const alarmEvent = Object.freeze({
    candidateId: "alarm-follow-priority",
    targetId: "npc_3",
    position: new Vector3(0, 0, 0.4)
  });
  try {
    const alivePlayer = createPlayerTarget(Vector3.Zero());
    placeNpcs(aliveFixture.system, [
      new Vector3(0, 0, 0.4)
    ]);
    assert(
      aliveFixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(alivePlayer)
      ),
      "未洗脳external threat検証用Followが受理されません。"
    );
    aliveFixture.system.setExternalThreats([
      Object.freeze({
        sourceId: "bit-follow-priority",
        targetId: "npc_0",
        sourcePosition: new Vector3(0, 0, -1),
        sightClear: true
      })
    ]);
    aliveFixture.system.update(
      0.2,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    const aliveTracking = getTracking(
      aliveFixture.system,
      "npc_0"
    );
    assert(
      aliveTracking.commandMode === "follow" &&
        aliveTracking.targetId === null &&
        getNpcTarget(aliveFixture.system, "npc_0").state ===
          "normal",
      "未洗脳Followerがexternal threatでevadeへ上書きされました。"
    );

    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.4),
      new Vector3(3, 0, 3),
      new Vector3(-3, 0, 3),
      new Vector3(0, 0, -3.8)
    ]);
    fixture.system.update(0, player, [alarmEvent]);
    const alarmTracking = getTracking(fixture.system, "npc_0");
    assert(
      alarmTracking.targetId === "npc_3" &&
        alarmTracking.provenance === "alert",
      "Follow開始前のAlarm標的が成立しません。"
    );
    assert(
      fixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(player)
      ),
      "Alarm標的保持中のFollowが受理されません。"
    );
    const startedTracking = getTracking(
      fixture.system,
      "npc_0"
    );
    assert(
      startedTracking.commandMode === "follow" &&
        startedTracking.targetId === null &&
        startedTracking.provenance === null,
      "Follow開始時に既存Alarm標的が消去されません。"
    );

    fixture.system.update(0.2, player, [alarmEvent]);
    const followingTracking = getTracking(
      fixture.system,
      "npc_0"
    );
    assert(
      followingTracking.commandMode === "follow" &&
        followingTracking.targetId === null &&
        followingTracking.provenance === null,
      "Follow中のAlarmが指示または標的を上書きしました。"
    );
    assert(
      fixture.system.cancelFollow("npc_0"),
      "Alarm遅延適用検証前にFollowを解除できません。"
    );
    fixture.system.update(0, player, EMPTY_ALARM_EVENTS);
    const releasedTracking = getTracking(
      fixture.system,
      "npc_0"
    );
    assert(
      releasedTracking.commandMode === "none" &&
        releasedTracking.targetId === null &&
        releasedTracking.provenance === null,
      "Follow中に無視したAlarmが解除後に遅延適用されました。"
    );
    return "未洗脳external threat抑制、開始前Alarm消去、Follow中Alarm無視、解除後の遅延適用なしを確認";
  } finally {
    fixture.dispose();
    aliveFixture.dispose();
  }
};

const testAlarmVisualAndFollowNavigationSpeeds = async () => {
  const visualContexts: V2NpcNavigationRouteContext[] = [];
  const alarmContexts: V2NpcNavigationRouteContext[] = [];
  const followContexts: V2NpcNavigationRouteContext[] = [];
  const visualFixture = await createNpcCommandFixture(
    1,
    1,
    4,
    (context) => visualContexts.push(context)
  );
  const alarmFixture = await createNpcCommandFixture(
    1,
    1,
    4,
    (context) => alarmContexts.push(context)
  );
  const followFixture = await createNpcCommandFixture(
    2,
    1,
    4,
    (context) => followContexts.push(context)
  );
  const alivePlayer = createPlayerTarget(
    new Vector3(0, 0, -1)
  );
  try {
    placeNpcs(visualFixture.system, [Vector3.Zero()]);
    visualFixture.system.update(
      0,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    visualFixture.system.update(
      0.2,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(visualFixture.system, "npc_0")
        .provenance === "visual",
      "通常視認追跡のvisual標的を取得できません。"
    );

    placeNpcs(alarmFixture.system, [Vector3.Zero()]);
    alarmFixture.system.update(0, alivePlayer, [
      Object.freeze({
        candidateId: "alarm-speed",
        targetId: "player",
        position: alivePlayer.footPosition.clone()
      })
    ]);
    alarmFixture.system.update(
      0.2,
      alivePlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(alarmFixture.system, "npc_0")
        .provenance === "alert",
      "Alarm由来追跡のalert標的を保持できません。"
    );

    const brainwashedPlayer = createPlayerTarget(
      new Vector3(0, 0, -0.4),
      "brainwash-complete-gun"
    );
    placeNpcs(followFixture.system, [
      Vector3.Zero(),
      new Vector3(0, 0, -3)
    ]);
    assert(
      followFixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(brainwashedPlayer)
      ),
      "速度比較用Followが受理されません。"
    );
    followFixture.system.update(0.2, brainwashedPlayer, [
      Object.freeze({
        candidateId: "alarm-during-follow-speed",
        targetId: "npc_1",
        position: new Vector3(0, 0, -3)
      })
    ]);
    followFixture.system.update(
      0.2,
      brainwashedPlayer,
      EMPTY_ALARM_EVENTS
    );
    const followTracking = getTracking(
      followFixture.system,
      "npc_0"
    );

    const visualPursuit = [...visualContexts].reverse().find(
      (context) =>
        context.npcId === "npc_0" &&
        context.behavior === "pursue"
    );
    const alarmPursuit = [...alarmContexts].reverse().find(
      (context) =>
        context.npcId === "npc_0" &&
        context.behavior === "pursue"
    );
    const followNavigation = [...followContexts].reverse().find(
      (context) =>
        context.npcId === "npc_0" &&
        context.behavior === "follow"
    );
    assert(
      V2_NPC_CHASE_SPEED === 0.3 &&
        visualPursuit?.speed === V2_NPC_CHASE_SPEED,
      `通常視認追跡速度が0.3ではありません: constant=${V2_NPC_CHASE_SPEED}, route=${visualPursuit?.speed}`
    );
    assert(
      V2_NPC_ALARM_SPEED === 0.5 &&
        alarmPursuit?.speed === V2_NPC_ALARM_SPEED,
      `Alarm追跡速度が0.5ではありません: constant=${V2_NPC_ALARM_SPEED}, route=${alarmPursuit?.speed}`
    );
    assert(
      V2_NPC_FOLLOW_SPEED === 0.5 &&
        followNavigation?.speed === V2_NPC_FOLLOW_SPEED &&
        followTracking.commandMode === "follow" &&
        followTracking.provenance === null,
      "Alarm受信中にFollow優先または速度0.5を維持できません。"
    );
    return "通常視認0.3、Alarm 0.5、Follow優先0.5をNavigation契約で確認";
  } finally {
    visualFixture.dispose();
    alarmFixture.dispose();
    followFixture.dispose();
  }
};

const testLeaveLifecycle = async () => {
  const fixture = await createNpcCommandFixture(1, 0);
  const blockedFixture = await createNpcCommandFixture(1, 0);
  const timeoutFixture = await createNpcCommandFixture(5, 0);
  const player = createPlayerTarget(Vector3.Zero());
  try {
    const initialPosition = new Vector3(0, 0, 0.3);
    placeNpcs(fixture.system, [initialPosition]);
    const query = createCommandQuery(player);
    assert(
      fixture.system.requestCommand("npc_0", "follow", query) &&
        getTracking(fixture.system, "npc_0").commandMode ===
          "follow" &&
        fixture.system.requestCommand("npc_0", "leave", query) &&
        getTracking(fixture.system, "npc_0").commandMode ===
          "leave",
      "Followを即時解除する到達可能なLeave指示が受理されません。"
    );
    let elapsed = 0;
    while (
      getTracking(fixture.system, "npc_0").commandMode ===
        "leave" &&
      elapsed < V2_NPC_LEAVE_MAXIMUM_SECONDS
    ) {
      fixture.system.update(
        0.05,
        player,
        EMPTY_ALARM_EVENTS
      );
      elapsed += 0.05;
    }
    const finalPosition = getNpcTarget(
      fixture.system,
      "npc_0"
    ).footPosition;
    assert(
      getTracking(fixture.system, "npc_0").commandMode ===
        "none" &&
        Vector3.Distance(finalPosition, player.footPosition) >
          Vector3.Distance(initialPosition, player.footPosition),
      "Leaveが遠ざかる地点への到達で終了しません。"
    );
    fixture.system.setExternalThreats([
      Object.freeze({
        sourceId: "player-threat",
        targetId: "npc_0",
        sourcePosition: player.footPosition.clone(),
        sightClear: true
      })
    ]);
    fixture.system.update(
      0.01,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getNpcTarget(fixture.system, "npc_0").state === "evade",
      "Leave終了後に既存AIの新規評価へ復帰しません。"
    );

    placeNpcs(blockedFixture.system, [initialPosition]);
    blockedFixture.setPathsAvailable(false);
    assert(
      !blockedFixture.system.requestCommand(
        "npc_0",
        "leave",
        createCommandQuery(player)
      ) &&
        getTracking(
          blockedFixture.system,
          "npc_0"
        ).commandMode === "none",
      "到達可能地点なしのLeaveが状態を変えずfalseになりません。"
    );

    placeNpcs(timeoutFixture.system, [
      new Vector3(-1, 0, -1),
      new Vector3(1, 0, -1),
      new Vector3(-1, 0, 1),
      new Vector3(1, 0, 1),
      initialPosition
    ]);
    assert(
      timeoutFixture.system.requestCommand(
        "npc_4",
        "leave",
        createCommandQuery(player)
      ),
      "timeout検証のLeaveが受理されません。"
    );
    timeoutFixture.setPathsAvailable(false);
    const timeoutStepSeconds =
      V2_NPC_LEAVE_MAXIMUM_SECONDS / 51 + TEST_EPSILON;
    for (let frameIndex = 0; frameIndex < 51; frameIndex += 1) {
      timeoutFixture.system.update(
        timeoutStepSeconds,
        player,
        EMPTY_ALARM_EVENTS
      );
    }
    assert(
      getTracking(
        timeoutFixture.system,
        "npc_4"
      ).commandMode === "none" &&
        timeoutFixture.system.getFrameView().waitingForPathCount <= 1,
      "waiting-for-path中のLeaveが5秒でnoneへ戻りません。"
    );
    return `Follow即時解除、到達終了、AI復帰、到達不能false、waiting-for-path中${V2_NPC_LEAVE_MAXIMUM_SECONDS}秒終了を確認`;
  } finally {
    fixture.dispose();
    blockedFixture.dispose();
    timeoutFixture.dispose();
  }
};

const testHaigureTimerPauseAndResume = async () => {
  const followFixture = await createNpcCommandFixture(3, 3);
  const leaveFixture = await createNpcCommandFixture(3, 3);
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const positions = [
    new Vector3(-0.1, 0, 0.3),
    new Vector3(0, 0, 0.3),
    new Vector3(0.1, 0, 0.3)
  ] as const;
  const assertHaigure = (
    system: V2NpcSystem,
    message: string
  ) => {
    assert(
      getNpcTarget(system, "npc_2").state ===
        "brainwash-complete-haigure",
      message
    );
  };
  try {
    placeNpcs(followFixture.system, positions);
    followFixture.system.update(
      3,
      player,
      EMPTY_ALARM_EVENTS
    );
    assertHaigure(
      followFixture.system,
      "Follow前3秒でハイグレ状態が予期せず遷移しました。"
    );
    assert(
      followFixture.system.requestCommand(
        "npc_2",
        "follow",
        createCommandQuery(player)
      ),
      "ハイグレNPCのFollowが受理されません。"
    );
    followFixture.system.update(
      20,
      player,
      EMPTY_ALARM_EVENTS
    );
    assertHaigure(
      followFixture.system,
      "Follow中にハイグレ残り時間が進みました。"
    );
    assert(
      followFixture.system.cancelFollow("npc_2"),
      "ハイグレFollowerを解除できません。"
    );
    followFixture.system.update(
      6.999,
      player,
      EMPTY_ALARM_EVENTS
    );
    assertHaigure(
      followFixture.system,
      "Follow解除後に保存残時間より早く遷移しました。"
    );
    followFixture.system.update(
      0.001 + TEST_EPSILON,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getNpcTarget(followFixture.system, "npc_2").state ===
        "brainwash-complete-no-gun",
      "Follow解除後に3秒の続きから正確に再開しません。"
    );

    placeNpcs(leaveFixture.system, positions);
    leaveFixture.system.update(
      3,
      player,
      EMPTY_ALARM_EVENTS
    );
    leaveFixture.setMovementBlocked(true);
    assert(
      leaveFixture.system.requestCommand(
        "npc_2",
        "leave",
        createCommandQuery(player)
      ),
      "ハイグレNPCのLeaveが受理されません。"
    );
    leaveFixture.system.update(
      V2_NPC_LEAVE_MAXIMUM_SECONDS,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getTracking(leaveFixture.system, "npc_2").commandMode ===
        "none",
      "移動停止中のLeaveが5秒で終了しません。"
    );
    assertHaigure(
      leaveFixture.system,
      "Leave中にハイグレ残り時間が進みました。"
    );
    leaveFixture.system.update(
      6.999,
      player,
      EMPTY_ALARM_EVENTS
    );
    assertHaigure(
      leaveFixture.system,
      "Leave解除後に保存残時間より早く遷移しました。"
    );
    leaveFixture.system.update(
      0.001 + TEST_EPSILON,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      getNpcTarget(leaveFixture.system, "npc_2").state ===
        "brainwash-complete-no-gun",
      "Leave解除後に3秒の続きから正確に再開しません。"
    );
    return "3秒経過→指示中停止→残り7秒の10秒境界をFollow/Leave双方で確認";
  } finally {
    followFixture.dispose();
    leaveFixture.dispose();
  }
};

const testFollowerFireSpreadContract = async () => {
  const forward = new Vector3(0, 0, 4);
  const maximumUnitRandom = 1 - Number.EPSILON;
  const negative = createV2FollowerFireDirection(
    forward,
    0,
    0
  );
  const positive = createV2FollowerFireDirection(
    forward,
    maximumUnitRandom,
    maximumUnitRandom
  );
  const mixed = createV2FollowerFireDirection(
    forward,
    maximumUnitRandom,
    0
  );
  const spreadRadians = degreesToRadians(
    V2_FOLLOWER_FIRE_SPREAD_DEGREES
  );
  const negativeAngles = getFollowerSpreadAngles(negative);
  const positiveAngles = getFollowerSpreadAngles(positive);
  const mixedAngles = getFollowerSpreadAngles(mixed);
  const positiveBoundaryRadians =
    spreadRadians * (maximumUnitRandom * 2 - 1);

  for (const [name, direction] of [
    ["negative", negative],
    ["positive", positive],
    ["mixed", mixed]
  ] as const) {
    assertFollowerSpreadDirection(
      direction,
      `Follower拡散${name}`
    );
  }
  assertNear(
    negativeAngles.yawRadians,
    -spreadRadians,
    TEST_EPSILON,
    "yaw最小境界が-3度ではありません"
  );
  assertNear(
    negativeAngles.pitchRadians,
    -spreadRadians,
    TEST_EPSILON,
    "pitch最小境界が-3度ではありません"
  );
  assertNear(
    positiveAngles.yawRadians,
    positiveBoundaryRadians,
    TEST_EPSILON,
    "yaw最大境界が+3度ではありません"
  );
  assertNear(
    positiveAngles.pitchRadians,
    positiveBoundaryRadians,
    TEST_EPSILON,
    "pitch最大境界が+3度ではありません"
  );
  assert(
    mixedAngles.yawRadians > 0 &&
      mixedAngles.pitchRadians < 0,
    "yawとpitchが独立した乱数入力で逆向きに散りません。"
  );
  return "yaw／pitch各±3度、独立入力、正規化を境界値で確認";
};

const testBrainwashedFollowersAndSynchronizedFire = async () => {
  const fixture = await createNpcCommandFixture(3, 3);
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const playerCombat = createV2PlayerCombatSystem({
    playerId: "player",
    initialState: "brainwash-complete-gun",
    random: () => 0.5
  });
  try {
    placeNpcs(fixture.system, [
      new Vector3(-0.1, 0, 0.3),
      new Vector3(0, 0, 0.3),
      new Vector3(0.1, 0, 0.3)
    ]);
    assert(
      fixture.system
        .getFrameView()
        .targets.map((target) => target.state)
        .join("|") ===
        "brainwash-complete-gun|brainwash-complete-no-gun|brainwash-complete-haigure",
      "gun/no-gun/ハイグレの決定的初期状態が不正です。"
    );
    assert(
      fixture.getSpriteCellIndex("npc_0") === 3 &&
        fixture.getSpriteCellIndex("npc_1") === 4 &&
        fixture.getSpriteCellIndex("npc_2") === 5,
      "gun/no-gun/ハイグレの基底表示セル3/4/5が分離されていません。"
    );
    const query = createCommandQuery(player);
    for (const npcId of ["npc_0", "npc_1", "npc_2"]) {
      assert(
        fixture.system.requestCommand(npcId, "follow", query),
        `${npcId}をFollowerへ設定できません。`
      );
    }
    const tracking = fixture.system.getFrameView().tracking;
    assert(
      tracking.every(
        (entry) => entry.commandMode === "follow"
      ) &&
        !getTracking(fixture.system, "npc_0")
          .temporaryGunActive &&
        getTracking(fixture.system, "npc_1")
          .temporaryGunActive &&
        getTracking(fixture.system, "npc_2")
          .temporaryGunActive,
      "一時gun能力の付与条件が不正です。"
    );
    assert(
      ["npc_0", "npc_1", "npc_2"].every(
        (npcId) => fixture.getSpriteCellIndex(npcId) === 3
      ),
      "Followerのgun表示セルが不正です。"
    );
    const rejectedPlayerImpact = playerCombat.applyImpact(
      Object.freeze({
        sourceId: "bit_0",
        originKind: "bit-chase" as const
      })
    );
    const rejectedFollowerImpact =
      fixture.system.applyBeamImpacts([
        Object.freeze({
          npcId: "npc_1",
          source: Object.freeze({
            sourceId: "bit_0",
            originKind: "bit-chase" as const
          })
        })
      ]);
    assert(
      !rejectedPlayerImpact &&
        !rejectedFollowerImpact[0].accepted &&
        fixture.system
          .getFrameView()
          .tracking.every(
            (entry) => entry.commandMode === "follow"
          ),
      "洗脳済みプレイヤー／Followerへの非受理beam接触でFollowが解除されました。"
    );

    const fireEvent = playerCombat.requestGunFire(
      new Vector3(0, 0.3, 0),
      new Vector3(0, 0, 4)
    );
    if (!fireEvent) {
      throw new Error(
        "成立するはずのplayer-gun eventが生成されません。"
      );
    }
    assert(
      fireEvent.direction.equals(new Vector3(0, 0, 1)),
      "成立player-gun eventの方向snapshotが正規化されません。"
    );
    fixture.system.notifyPlayerGunFire(fireEvent);
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) => entry.followerFirePhase === "scheduled"
        ),
      "洗脳済みFollower全員が同期射撃を予約しません。"
    );
    fixture.system.notifyPlayerGunFire(
      playerCombat.requestGunFire(
        new Vector3(0, 0.3, 0),
        new Vector3(1, 0, 0)
      )!
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) => entry.followerFirePhase === "scheduled"
        ),
      "予約中の追加player-gun eventを無視できません。"
    );

    const observedDelays = new Map<string, number>();
    const beamIds = new Map<string, string>();
    const requestCounts = new Map<string, number>();
    const spreadDirections = new Map<string, Vector3>();
    let elapsed = 0;
    while (
      observedDelays.size < 3 &&
      elapsed <=
        V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS + 0.01
    ) {
      fixture.system.update(
        0.001,
        player,
        EMPTY_ALARM_EVENTS
      );
      elapsed += 0.001;
      const requests = fixture.system.drainBeamRequests();
      for (const request of requests) {
        observedDelays.set(request.sourceId, elapsed);
        requestCounts.set(
          request.sourceId,
          (requestCounts.get(request.sourceId) ?? 0) + 1
        );
        spreadDirections.set(
          request.sourceId,
          request.direction.clone()
        );
        assert(
          request.originKind === "npc-gun",
          "同期射撃のoriginKindがnpc-gunではありません。"
        );
        assertFollowerSpreadDirection(
          request.direction,
          `${request.sourceId}の同期射撃`
        );
        const beamId = `follower-${request.sourceId}`;
        beamIds.set(request.sourceId, beamId);
        fixture.system.notifyBeamsSpawned([
          Object.freeze({
            sourceId: request.sourceId,
            beamId
          })
        ]);
      }
    }
    assert(
      observedDelays.size === 3 &&
        [...observedDelays.values()].every(
          (delay) =>
            delay + TEST_EPSILON >=
              V2_NPC_FOLLOWER_FIRE_DELAY_MIN_SECONDS &&
            delay <=
              V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS +
                0.001 +
                TEST_EPSILON
        ),
      `Follower個別遅延が0.3〜0.8秒外です: ${[
        ...observedDelays.entries()
      ]
        .map(([id, delay]) => `${id}=${delay.toFixed(3)}`)
        .join(", ")}`
    );
    assert(
      [...requestCounts.values()].reduce(
        (total, count) => total + count,
        0
      ) === 3 &&
        [...requestCounts.values()].every(
          (count) => count === 1
        ),
      `Followerの1射から1人1本を超える光線要求が生成されました: ${[
        ...requestCounts.entries()
      ]
        .map(([id, count]) => `${id}=${count}`)
        .join(", ")}`
    );
    assert(
      new Set(
        [...spreadDirections.values()].map((direction) =>
          `${direction.x.toFixed(9)}:${direction.y.toFixed(9)}:${direction.z.toFixed(9)}`
        )
      ).size === 3,
      "3体のFollowerで射撃拡散の個体差が生じません。"
    );
    const deterministicFixture = await createNpcCommandFixture(3, 3);
    try {
      placeNpcs(deterministicFixture.system, [
        new Vector3(-0.1, 0, 0.3),
        new Vector3(0, 0, 0.3),
        new Vector3(0.1, 0, 0.3)
      ]);
      const deterministicQuery = createCommandQuery(player);
      for (const npcId of ["npc_0", "npc_1", "npc_2"]) {
        assert(
          deterministicFixture.system.requestCommand(
            npcId,
            "follow",
            deterministicQuery
          ),
          `${npcId}の決定性再現用Followが受理されません。`
        );
      }
      deterministicFixture.system.notifyPlayerGunFire(
        fireEvent
      );
      const repeatedDirections = new Map<string, Vector3>();
      const repeatedDelays = new Map<string, number>();
      let repeatedElapsed = 0;
      while (
        repeatedDirections.size < 3 &&
        repeatedElapsed <=
          V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS + 0.01
      ) {
        deterministicFixture.system.update(
          0.001,
          player,
          EMPTY_ALARM_EVENTS
        );
        repeatedElapsed += 0.001;
        for (const request of
          deterministicFixture.system.drainBeamRequests()) {
          repeatedDirections.set(
            request.sourceId,
            request.direction.clone()
          );
          repeatedDelays.set(request.sourceId, repeatedElapsed);
        }
      }
      assert(
        repeatedDirections.size === 3 &&
          [...spreadDirections.entries()].every(
            ([npcId, direction]) =>
              repeatedDirections
                .get(npcId)
                ?.equalsWithEpsilon(direction, TEST_EPSILON) &&
              Math.abs(
                repeatedDelays.get(npcId)! -
                  observedDelays.get(npcId)!
              ) <= TEST_EPSILON
          ),
        "同じNPC ID・seed相当の初期化で遅延とyaw／pitch拡散を決定的に再現できません。"
      );
    } finally {
      deterministicFixture.dispose();
    }
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) => entry.followerFirePhase === "active"
        ),
      "spawn済み同期射撃がactiveになりません。"
    );
    fixture.system.notifyPlayerGunFire(fireEvent);
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) => entry.followerFirePhase === "active"
        ),
      "active中の追加player-gun eventを無視できません。"
    );

    const completions: V2BeamCompletionEvent[] = [
      ...beamIds.entries()
    ].map(([sourceId, beamId]) =>
      Object.freeze({
        beamId,
        sourceId,
        originKind: "npc-gun" as const,
        targetPolicy: ALIVE_HUMANS_POLICY,
        frameElapsedSeconds: 0.4
      })
    );
    fixture.system.notifyBeamCompletions(completions);
    assert(
      V2_NPC_FOLLOWER_FIRE_COOLDOWN_SECONDS === 0.6,
      `Follower同期射撃Cooldownが0.6秒ではありません: ${V2_NPC_FOLLOWER_FIRE_COOLDOWN_SECONDS}`
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) => entry.followerFirePhase === "cooldown"
        ),
      "beam completionからcooldownへ遷移しません。"
    );
    fixture.system.notifyPlayerGunFire(fireEvent);
    fixture.system.update(
      0.6,
      player,
      EMPTY_ALARM_EVENTS
    );
    fixture.system.update(
      V2_NPC_FOLLOWER_FIRE_COOLDOWN_SECONDS - 0.201,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) => entry.followerFirePhase === "cooldown"
        ),
      "beam完了時点から0.6秒未満でcooldownが終了しました。"
    );
    fixture.system.update(
      0.001 + TEST_EPSILON,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) => entry.followerFirePhase === "idle"
        ),
      "beam完了時点から0.6秒後にidleへ戻りません。"
    );

    fixture.system.notifyPlayerGunFire(fireEvent);
    assert(
      fixture.system.cancelFollow("npc_1") &&
        fixture.system.drainBeamRequests().length === 0 &&
        getTracking(fixture.system, "npc_1")
          .followerFirePhase === "idle" &&
        !getTracking(fixture.system, "npc_1")
          .temporaryGunActive &&
        fixture.getSpriteCellIndex("npc_1") === 4,
      "Follow解除が未発射予約を取消し一時gunを復元しません。"
    );
    fixture.system.clearCommands();
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (entry) =>
            entry.commandMode === "none" &&
            entry.followerFirePhase === "idle" &&
            !entry.temporaryGunActive
        ) &&
        fixture.getSpriteCellIndex("npc_0") === 3 &&
        fixture.getSpriteCellIndex("npc_1") === 4 &&
        fixture.getSpriteCellIndex("npc_2") === 5,
      "clearCommands後に指示・予約・一時gun表示が残っています。"
    );
    return `3 Follower、個体別±3度拡散・1射1本、遅延${[
      ...observedDelays.values()
    ]
      .map((delay) => delay.toFixed(3))
      .join("/")}秒、active・0.6秒cooldown・復元を確認`;
  } finally {
    fixture.dispose();
  }
};

const testActualBeamCompletionEvents = async () => {
  const fixture = await createNpcCommandFixture(1, 1);
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const playerCombat = createV2PlayerCombatSystem({
    playerId: "player",
    initialState: "brainwash-complete-gun",
    random: () => 0.5
  });
  const hitTargets: V2HumanTargetSnapshot[] = [];
  const hitBeamSystem = createV2BeamSystem({
    scene: fixture.scene,
    stage: fixture.stage,
    getHumanTargets: () => hitTargets,
    random: () => 0.5,
    getOrbVisibilityPredicate: () => () => true
  });
  let boundaryBeamSystem:
    | ReturnType<typeof createV2BeamSystem>
    | null = null;
  let worldBoundary:
    | ReturnType<typeof createStageWorldBoundary>
    | null = null;
  try {
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.3)
    ]);
    assert(
      fixture.system.requestCommand(
        "npc_0",
        "follow",
        createCommandQuery(player)
      ),
      "実beam completion検証のFollowが受理されません。"
    );
    const fireEvent = playerCombat.requestGunFire(
      new Vector3(0, 0.3, 0),
      Vector3.Right()
    );
    if (!fireEvent) {
      throw new Error(
        "実beam completion検証のplayer-gun eventがありません。"
      );
    }
    fixture.system.notifyPlayerGunFire(fireEvent);
    fixture.system.update(
      V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS +
        TEST_EPSILON,
      player,
      EMPTY_ALARM_EVENTS
    );
    const requests = fixture.system.drainBeamRequests();
    assert(
      requests.length === 1,
      "実beam completion検証の同期射撃requestが1件ではありません。"
    );
    const request = requests[0];
    const enemyAim = request.origin.add(
      request.direction.scale(0.3)
    );
    const enemyRadii = new Vector3(0.05, 0.1, 0.05);
    hitTargets.push(
      Object.freeze({
        id: "enemy",
        kind: "npc" as const,
        footPosition: enemyAim.subtract(
          new Vector3(0, enemyRadii.y, 0)
        ),
        aimPosition: enemyAim.clone(),
        hitShape: Object.freeze({
          center: enemyAim.clone(),
          radii: enemyRadii
        }),
        state: "normal" as const,
        alive: true,
        brainwashed: false
      })
    );
    const followerBeamId = hitBeamSystem.spawn(request);
    fixture.system.notifyBeamsSpawned([
      Object.freeze({
        sourceId: request.sourceId,
        beamId: followerBeamId
      })
    ]);
    const impactFrame = hitBeamSystem.update(0.5);
    assert(
      impactFrame.impacts.length === 1 &&
        impactFrame.completions.length === 0 &&
        hitBeamSystem.getActiveBeams()[0].phase ===
          "retracting",
      "実beamが命中後の巻戻しへ入りません。"
    );
    const retractCompletionFrame =
      hitBeamSystem.update(0.5);
    const retractCompletion =
      retractCompletionFrame.completions[0];
    assert(
      retractCompletionFrame.completions.length === 1 &&
        retractCompletion.beamId === followerBeamId &&
        retractCompletion.sourceId === "npc_0" &&
        retractCompletion.originKind === "npc-gun" &&
        retractCompletion.frameElapsedSeconds > 0 &&
        retractCompletion.frameElapsedSeconds <= 0.5 &&
        hitBeamSystem.activeCount === 0,
      "巻戻し完了時の実completion eventが不正です。"
    );
    fixture.system.notifyBeamCompletions(
      retractCompletionFrame.completions
    );
    assert(
      getTracking(fixture.system, "npc_0")
        .followerFirePhase === "cooldown",
      "実beam completionをFollower cooldownへ接続できません。"
    );

    hitBeamSystem.spawn({
      sourceId: "clear-source",
      originKind: "npc-gun",
      targetPolicy: ALIVE_HUMANS_POLICY,
      origin: Vector3.Zero(),
      direction: Vector3.Right(),
      speed: 1,
      maximumLifetime: 1
    });
    hitBeamSystem.clear();
    assert(
      hitBeamSystem.update(0.5).completions.length === 0,
      "beam clearがcompletion eventを生成しました。"
    );

    const stageBoundaryMesh = MeshBuilder.CreateBox(
      "BND_Stage",
      { size: 1 },
      fixture.scene
    );
    const worldBoundaryMesh = MeshBuilder.CreateBox(
      "BND_WorldLimit",
      { size: 2 },
      fixture.scene
    );
    stageBoundaryMesh.computeWorldMatrix(true);
    worldBoundaryMesh.computeWorldMatrix(true);
    worldBoundary = createStageWorldBoundary(
      worldBoundaryMesh,
      stageBoundaryMesh
    );
    const boundaryStage = Object.freeze({
      ...fixture.stage,
      worldBoundary
    }) as StageSpatialContext;
    boundaryBeamSystem = createV2BeamSystem({
      scene: fixture.scene,
      stage: boundaryStage,
      getHumanTargets: () => [],
      random: () => 0.5,
      getOrbVisibilityPredicate: () => () => true
    });
    const boundaryBeamId = boundaryBeamSystem.spawn({
      sourceId: "boundary-follower",
      originKind: "npc-gun",
      targetPolicy: ALIVE_HUMANS_POLICY,
      origin: Vector3.Zero(),
      direction: Vector3.Right(),
      speed: 10,
      maximumLifetime: 2
    });
    const exitFrame = boundaryBeamSystem.update(0.2);
    assert(
      exitFrame.worldBoundaryExits.length === 1 &&
        exitFrame.completions.length === 0 &&
        boundaryBeamSystem.getActiveBeams()[0].phase ===
          "world-boundary-fading",
      "世界境界退出後にboundary fadeへ入りません。"
    );
    const boundaryCompletionFrame =
      boundaryBeamSystem.update(0.2);
    const boundaryCompletion =
      boundaryCompletionFrame.completions[0];
    assert(
      V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS === 0.2 &&
        boundaryCompletionFrame.completions.length === 1 &&
        boundaryCompletion.beamId === boundaryBeamId &&
        boundaryCompletion.sourceId === "boundary-follower" &&
        boundaryCompletion.frameElapsedSeconds > 0 &&
        boundaryCompletion.frameElapsedSeconds <= 0.2 &&
        boundaryBeamSystem.activeCount === 0,
      "世界境界fade終了時の実completion eventが不正です。"
    );
    boundaryBeamSystem.spawn({
      sourceId: "dispose-source",
      originKind: "npc-gun",
      targetPolicy: ALIVE_HUMANS_POLICY,
      origin: Vector3.Zero(),
      direction: Vector3.Right(),
      speed: 1,
      maximumLifetime: 1
    });
    boundaryBeamSystem.dispose();
    boundaryBeamSystem = null;
    return "実beamの巻戻し・境界fade完了event、cooldown接続、clear/dispose非通知を確認";
  } finally {
    boundaryBeamSystem?.dispose();
    worldBoundary?.dispose();
    hitBeamSystem.dispose();
    fixture.dispose();
  }
};

const testActiveBeamSurvivesFollowRelease = async () => {
  const fixture = await createNpcCommandFixture(2, 2);
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const playerCombat = createV2PlayerCombatSystem({
    playerId: "player",
    initialState: "brainwash-complete-gun",
    random: () => 0.5
  });
  try {
    placeNpcs(fixture.system, [
      new Vector3(-0.1, 0, 0.3),
      new Vector3(0.1, 0, 0.3)
    ]);
    assert(
      fixture.system.requestCommand(
        "npc_1",
        "follow",
        createCommandQuery(player)
      ),
      "active beam解除検証のFollowが受理されません。"
    );
    const fireEvent = playerCombat.requestGunFire(
      new Vector3(0, 0.3, 0),
      new Vector3(0, 0, 1)
    );
    if (!fireEvent) {
      throw new Error(
        "active beam解除検証のplayer-gun eventがありません。"
      );
    }
    fixture.system.notifyPlayerGunFire(fireEvent);
    fixture.system.update(
      V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS + TEST_EPSILON,
      player,
      EMPTY_ALARM_EVENTS
    );
    const requests = fixture.system.drainBeamRequests();
    assert(
      requests.length === 1 &&
        requests[0].sourceId === "npc_1",
      "同期射撃予約を1件発射できません。"
    );
    const beamId = "released-follow-active-beam";
    fixture.system.notifyBeamsSpawned([
      Object.freeze({
        sourceId: "npc_1",
        beamId
      })
    ]);
    assert(
      getTracking(fixture.system, "npc_1")
        .followerFirePhase === "active",
      "Follower beamがactiveになりません。"
    );
    assert(
      fixture.system.cancelFollow("npc_1"),
      "active beam中のFollowを解除できません。"
    );
    const releasedTracking = getTracking(
      fixture.system,
      "npc_1"
    );
    assert(
      releasedTracking.commandMode === "none" &&
        releasedTracking.followerFirePhase === "active" &&
        !releasedTracking.temporaryGunActive &&
        fixture.getSpriteCellIndex("npc_1") === 4,
      "Follow解除が発射済みbeam追跡を維持して一時gunだけ復元しません。"
    );
    fixture.system.notifyPlayerGunFire(fireEvent);
    assert(
      fixture.system.drainBeamRequests().length === 0 &&
        getTracking(fixture.system, "npc_1")
          .followerFirePhase === "active",
      "Follow解除後のactive beam中に追加予約が生成されました。"
    );
    fixture.system.notifyBeamCompletions([
      Object.freeze({
        beamId,
        sourceId: "npc_1",
        originKind: "npc-gun" as const,
        targetPolicy: ALIVE_HUMANS_POLICY,
        frameElapsedSeconds: 0
      })
    ]);
    assert(
      getTracking(fixture.system, "npc_1")
        .followerFirePhase === "idle",
      "Follow解除後の発射済みbeam追跡がcompletionまで継続しません。"
    );
    return "active beamはFollow解除後も追跡し、completionでidleへ解放";
  } finally {
    fixture.dispose();
  }
};

const testUnlimitedFollowersAndSeparation = async () => {
  const followerCount = 12;
  const fixture = await createNpcCommandFixture(
    followerCount,
    followerCount
  );
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  try {
    placeNpcs(
      fixture.system,
      Array.from(
        { length: followerCount },
        () => new Vector3(0, 0, 0.3)
      )
    );
    const query = createCommandQuery(player);
    for (let index = 0; index < followerCount; index += 1) {
      assert(
        fixture.system.requestCommand(
          `npc_${index}`,
          "follow",
          query
        ),
        `12体中npc_${index}をFollowerへ設定できません。`
      );
    }
    assert(
      fixture.system
        .getFrameView()
        .tracking.filter(
          (tracking) => tracking.commandMode === "follow"
        ).length === followerCount,
      "Follower同時人数に上限が残っています。"
    );
    for (let frame = 0; frame < 24; frame += 1) {
      fixture.system.update(
        0.05,
        player,
        EMPTY_ALARM_EVENTS
      );
    }
    const positions = Array.from(
      { length: followerCount },
      (_unused, index) =>
        getNpcTarget(
          fixture.system,
          `npc_${index}`
        ).footPosition
    );
    let minimumDistance = Number.POSITIVE_INFINITY;
    for (let left = 0; left < positions.length; left += 1) {
      for (
        let right = left + 1;
        right < positions.length;
        right += 1
      ) {
        minimumDistance = Math.min(
          minimumDistance,
          Vector3.Distance(positions[left], positions[right])
        );
      }
    }
    assert(
      minimumDistance > TEST_EPSILON,
      "12体Followerの一部が完全に重なったままです。"
    );
    for (let frame = 0; frame < 10; frame += 1) {
      fixture.system.update(0.05, player, EMPTY_ALARM_EVENTS);
    }
    const maximumSettledDrift = Math.max(
      ...positions.map((position, index) =>
        Vector3.Distance(
          position,
          getNpcTarget(fixture.system, `npc_${index}`).footPosition
        )
      )
    );
    assert(
      maximumSettledDrift <= TEST_EPSILON,
      `安定隊列Anchor到達後もFollowerが振動します: ${maximumSettledDrift}`
    );
    assert(
      fixture.system
        .getFrameView()
        .tracking.every(
          (tracking) => tracking.commandMode === "follow"
        ),
      "12体の局所分離中にFollowが解除されました。"
    );
    return `12体同時Follow、最小間隔=${minimumDistance.toFixed(4)}、静止後drift=${maximumSettledDrift.toFixed(4)}`;
  } finally {
    fixture.dispose();
  }
};

const testNarrowPassageFormationFallback = async () => {
  const fixture = await createNpcCommandFixture(2, 2);
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  try {
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 0.45),
      new Vector3(0, 0, 0.48)
    ]);
    const query = createCommandQuery(player);
    assert(
      fixture.system.requestCommand("npc_0", "follow", query) &&
        fixture.system.requestCommand("npc_1", "follow", query),
      "狭路fallback検証のFollowが受理されません。"
    );
    fixture.setProjectionResolver(() => Vector3.Zero());
    const distances: number[] = [];
    for (let frame = 0; frame < 24; frame += 1) {
      fixture.system.update(0.05, player, EMPTY_ALARM_EVENTS);
      distances.push(
        Vector3.Distance(
          getNpcTarget(fixture.system, "npc_0").footPosition,
          player.footPosition
        )
      );
    }
    assert(
      distances.every(
        (distance, index) =>
          index === 0 || distance <= distances[index - 1] + TEST_EPSILON
      ),
      `狭路fallback中に追従先が反転しました: ${distances.join(",")}`
    );
    assert(
      Math.abs(getNpcTarget(fixture.system, "npc_0").footPosition.x) <=
          TEST_EPSILON &&
        Math.abs(getNpcTarget(fixture.system, "npc_1").footPosition.x) <=
          TEST_EPSILON,
      "狭路で隊列Anchorを捨てて中央追従へ戻りません。"
    );
    return "隊列AnchorがNavMeshへ近接投影できない狭路では中央追従し、目的地反転なし";
  } finally {
    fixture.dispose();
  }
};

const createBitThreat = (
  id: string,
  center: Vector3
): V2ActorSphere =>
  Object.freeze({
    id,
    kind: "bit" as const,
    center: center.clone(),
    radius: 0.05
  });

const testAutonomousThreatVisionAndEscape = async () => {
  const fixture = await createNpcCommandFixture(2, 1);
  const player = createPlayerTarget(Vector3.Zero());
  const observerId = "npc_1";
  const brainwashedId = "npc_0";
  try {
    placeNpcs(fixture.system, [
      new Vector3(0, 0, 1),
      Vector3.Zero()
    ]);
    const orientationPlayer = createPlayerTarget(
      new Vector3(0, 0, 0.45)
    );
    assert(
      fixture.system.requestCommand(
        observerId,
        "follow",
        createCommandQuery(orientationPlayer)
      ),
      "自律視界検証前の正面方向設定に失敗しました。"
    );
    fixture.system.update(0, orientationPlayer, EMPTY_ALARM_EVENTS);
    fixture.system.update(
      0.2,
      orientationPlayer,
      EMPTY_ALARM_EVENTS
    );
    assert(
      fixture.system.cancelFollow(observerId),
      "自律視界検証前のFollow解除に失敗しました。"
    );
    fixture.setMovementBlocked(true);
    const observer = getNpcTarget(fixture.system, observerId);
    const observerAim = observer.aimPosition;
    const updateSight = () =>
      fixture.system.update(
        1 / V2_NPC_AUTONOMOUS_THREAT_SIGHT_HERTZ + 0.001,
        player,
        EMPTY_ALARM_EVENTS
      );

    fixture.system.setNpcTransportPosition(
      brainwashedId,
      observer.footPosition.add(new Vector3(0, 0, 1))
    );
    fixture.system.setAutonomousThreatActors(Object.freeze([]));
    updateSight();
    let view = fixture.system.getFrameView();
    assert(
      getTracking(fixture.system, observerId).evadeThreatIds.includes(
        brainwashedId
      ) && view.autonomousThreatVisibleCount >= 1,
      `未洗脳NPCが正面の洗脳済みNPCを自律視認しません: ` +
        `states=${view.targets.map((target) => `${target.id}:${target.state}`).join(",")}` +
        ` / threats=${getTracking(fixture.system, observerId).evadeThreatIds.join(",")}` +
        ` / scans=${view.autonomousThreatSightCheckCount}` +
        ` / visible=${view.autonomousThreatVisibleCount}`
    );

    fixture.system.setNpcTransportPosition(
      brainwashedId,
      new Vector3(20, 0, 20)
    );
    fixture.system.setAutonomousThreatActors(
      Object.freeze([
        createBitThreat(
          "bit-range",
          observerAim.add(new Vector3(0, 0, 3))
        )
      ])
    );
    updateSight();
    assert(
      getTracking(fixture.system, observerId).evadeThreatIds.includes(
        "bit-range"
      ),
      "12m境界上のBITを自律視認しません。"
    );

    fixture.system.setAutonomousThreatActors(
      Object.freeze([
        createBitThreat(
          "bit-range",
          observerAim.add(new Vector3(0, 0, 3.001))
        )
      ])
    );
    updateSight();
    assert(
      !getTracking(fixture.system, observerId).evadeThreatIds.includes(
        "bit-range"
      ),
      "12m超のBIT視認が次回3Hz探索で解除されません。"
    );

    const insideAngle = (94.9 * Math.PI) / 180;
    const outsideAngle = (95.1 * Math.PI) / 180;
    fixture.system.setAutonomousThreatActors(
      Object.freeze([
        createBitThreat(
          "bit-angle",
          observerAim.add(
            new Vector3(
              Math.sin(insideAngle) * 2,
              0,
              Math.cos(insideAngle) * 2
            )
          )
        )
      ])
    );
    updateSight();
    assert(
      getTracking(fixture.system, observerId).evadeThreatIds.includes(
        "bit-angle"
      ),
      "左右95度内側のBITを自律視認しません。"
    );
    fixture.system.setAutonomousThreatActors(
      Object.freeze([
        createBitThreat(
          "bit-angle",
          observerAim.add(
            new Vector3(
              Math.sin(outsideAngle) * 2,
              0,
              Math.cos(outsideAngle) * 2
            )
          )
        )
      ])
    );
    updateSight();
    assert(
      !getTracking(fixture.system, observerId).evadeThreatIds.includes(
        "bit-angle"
      ),
      "左右95度外側のBITを自律視認しました。"
    );

    fixture.setSightResolver(() => true);
    fixture.system.setAutonomousThreatActors(
      Object.freeze([
        createBitThreat(
          "bit-occluded",
          observerAim.add(new Vector3(0, 0, 2))
        )
      ])
    );
    updateSight();
    assert(
      !getTracking(fixture.system, observerId).evadeThreatIds.includes(
        "bit-occluded"
      ),
      "遮蔽されたBITを自律視認しました。"
    );

    fixture.system.setExternalThreats(
      Object.freeze([
        Object.freeze({
          sourceId: "direct-threat",
          targetId: observerId,
          sourcePosition: observerAim.add(new Vector3(0, 0, -1)),
          sightClear: false
        })
      ])
    );
    updateSight();
    assert(
      getTracking(fixture.system, observerId).evadeThreatIds.join("|") ===
        "direct-threat",
      "自律視認解除時に直接脅威まで消えました。"
    );

    fixture.setSightResolver(null);
    fixture.system.setExternalThreats(Object.freeze([]));
    fixture.system.setAutonomousThreatActors(
      Object.freeze([
        createBitThreat(
          "bit-left",
          observerAim.add(new Vector3(-0.5, 0, 1))
        ),
        createBitThreat(
          "bit-right",
          observerAim.add(new Vector3(0.5, 0, 1))
        )
      ])
    );
    updateSight();
    view = fixture.system.getFrameView();
    assert(
      getTracking(fixture.system, observerId).evadeThreatIds.length === 2 &&
        view.autonomousThreatMaximumSourceCount === 2 &&
        view.autonomousThreatSightCheckCount === 1,
      "複数BIT脅威または3Hz探索診断値が不正です。"
    );
    const beforeEscape = getNpcTarget(
      fixture.system,
      observerId
    ).footPosition.clone();
    fixture.setMovementBlocked(false);
    fixture.system.update(0, player, EMPTY_ALARM_EVENTS);
    for (let frame = 0; frame < 5; frame += 1) {
      fixture.system.update(0.05, player, EMPTY_ALARM_EVENTS);
    }
    const afterEscape = getNpcTarget(
      fixture.system,
      observerId
    ).footPosition;
    assert(
      afterEscape.z < beforeEscape.z &&
        Vector3.Distance(afterEscape, observerAim) >
          Vector3.Distance(beforeEscape, observerAim),
      `複数脅威から最小距離を広げる方向へ逃走しません: ${beforeEscape.toString()} -> ${afterEscape.toString()}`
    );

    const followPlayer = createPlayerTarget(
      afterEscape.add(new Vector3(0, 0, 0.4))
    );
    assert(
      fixture.system.requestCommand(
        observerId,
        "follow",
        createCommandQuery(followPlayer)
      ),
      "脅威回避中のFollow指示が受理されません。"
    );
    fixture.system.update(0.01, followPlayer, EMPTY_ALARM_EVENTS);
    assert(
      getTracking(fixture.system, observerId).commandMode === "follow" &&
        getTracking(fixture.system, observerId).evadeThreatIds.length === 0,
      "Followが自律視認・直接脅威・Alarmより優先されません。"
    );
    return "洗脳NPC・BIT、12m／95度、遮蔽、3Hz解除、直接脅威維持、複数脅威、Follow優先を確認";
  } finally {
    fixture.dispose();
  }
};

const testAutonomousThreatRoundRobinFairness = async () => {
  const fixture = await createNpcCommandFixture(4, 0);
  const player = createPlayerTarget(new Vector3(0, 0, -3));
  const positions = [
    new Vector3(-2, 0, 0),
    new Vector3(-0.7, 0, 0),
    new Vector3(0.7, 0, 0),
    new Vector3(2, 0, 0)
  ];
  try {
    placeNpcs(fixture.system, positions);
    fixture.setMovementBlocked(true);
    fixture.system.setAutonomousThreatActors(
      Object.freeze(
        positions.flatMap((position, observerIndex) =>
          [
            new Vector3(0, 0, 0.5),
            new Vector3(0.5, 0, 0),
            new Vector3(0, 0, -0.5),
            new Vector3(-0.5, 0, 0)
          ].map((offset, directionIndex) =>
            createBitThreat(
              `bit-fair-${observerIndex}-${directionIndex}`,
              position
                .add(offset)
                .add(new Vector3(0, NPC_SPRITE_CENTER_HEIGHT, 0))
            )
          )
        )
      )
    );
    let scheduledCheckCount = 0;
    for (let frame = 0; frame < 4; frame += 1) {
      fixture.system.update(
        1 / 12 + 0.001,
        player,
        EMPTY_ALARM_EVENTS
      );
      scheduledCheckCount +=
        fixture.system.getFrameView()
          .autonomousThreatSightCheckCount;
    }
    assert(
      Array.from({ length: 4 }, (_unused, index) =>
        getTracking(fixture.system, `npc_${index}`)
      ).every((tracking) => tracking.evadeThreatIds.length > 0),
      "3Hzラウンドロビンが4体すべてへ公平に到達しません。"
    );
    assert(
      scheduledCheckCount >= 4,
      `3Hzラウンドロビンの探索回数が不足しています: ${scheduledCheckCount}`
    );
    return `4体すべてを3Hzラウンドロビンで探索、checks=${scheduledCheckCount}`;
  } finally {
    fixture.dispose();
  }
};

const testAutonomousCombatSuppression = async () => {
  const baselineFixture = await createNpcCommandFixture(3, 2);
  const followerFixture = await createNpcCommandFixture(3, 2);
  const baselinePlayer = createPlayerTarget(Vector3.Zero());
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const positions = [
    new Vector3(-0.05, 0, 0.1),
    new Vector3(0.05, 0, 0.1),
    new Vector3(0, 0, 0.2)
  ] as const;
  try {
    placeNpcs(baselineFixture.system, positions);
    baselineFixture.system.update(
      3,
      baselinePlayer,
      EMPTY_ALARM_EVENTS
    );
    const baselineBeamCount =
      baselineFixture.system.drainBeamRequests().length;
    const baselineCaptureCount =
      baselineFixture.system.getFrameView().captures.length;
    assert(
      baselineBeamCount > 0 && baselineCaptureCount > 0,
      `比較用の自律gun射撃とno-gun捕縛が成立しません: beam=${baselineBeamCount}, capture=${baselineCaptureCount}`
    );

    placeNpcs(followerFixture.system, positions);
    const query = createCommandQuery(player);
    assert(
      followerFixture.system.requestCommand(
        "npc_0",
        "follow",
        query
      ) &&
        followerFixture.system.requestCommand(
          "npc_1",
          "follow",
          query
        ),
      "自律戦闘抑制検証のFollower設定に失敗しました。"
    );
    followerFixture.system.update(
      3,
      player,
      EMPTY_ALARM_EVENTS
    );
    assert(
      followerFixture.system.drainBeamRequests().length === 0 &&
        followerFixture.system.getFrameView().captures.length === 0,
      "Follow中にgun自律射撃またはno-gun捕縛が発生しました。"
    );
    return `比較時beam=${baselineBeamCount}/capture=${baselineCaptureCount}、Follow中はいずれも0`;
  } finally {
    baselineFixture.dispose();
    followerFixture.dispose();
  }
};

const testCommandLifecycleCleanup = async () => {
  const fixture = await createNpcCommandFixture(2, 2);
  const player = createPlayerTarget(
    Vector3.Zero(),
    "brainwash-complete-gun"
  );
  const positions = [
    new Vector3(-0.1, 0, 0.3),
    new Vector3(0.1, 0, 0.3)
  ] as const;
  const playerCombat = createV2PlayerCombatSystem({
    playerId: "player",
    initialState: "brainwash-complete-gun",
    random: () => 0.5
  });
  const fireEvent = playerCombat.requestGunFire(
    new Vector3(0, 0.3, 0),
    new Vector3(0, 0, 1)
  );
  if (!fireEvent) {
    throw new Error(
      "ライフサイクル検証用player-gun eventがありません。"
    );
  }
  const assertClean = (
    system: V2NpcSystem,
    operation: string
  ) => {
    const tracking = getTracking(system, "npc_1");
    assert(
      tracking.commandMode === "none" &&
        tracking.followerFirePhase === "idle" &&
        !tracking.temporaryGunActive &&
        fixture.getSpriteCellIndex("npc_1") === 4 &&
        system.drainBeamRequests().length === 0,
      `${operation}後にcommand・予約・一時gun・beam追跡が残っています。`
    );
  };
  const startScheduled = () => {
    assert(
      fixture.system.requestCommand(
        "npc_1",
        "follow",
        createCommandQuery(player)
      ),
      "ライフサイクル検証のFollowが受理されません。"
    );
    fixture.system.notifyPlayerGunFire(fireEvent);
    const tracking = getTracking(fixture.system, "npc_1");
    assert(
      tracking.commandMode === "follow" &&
        tracking.followerFirePhase === "scheduled" &&
        tracking.temporaryGunActive,
      "ライフサイクル検証の予約状態を準備できません。"
    );
  };
  const makeActive = (beamId: string) => {
    startScheduled();
    fixture.system.update(
      V2_NPC_FOLLOWER_FIRE_DELAY_MAX_SECONDS + TEST_EPSILON,
      player,
      EMPTY_ALARM_EVENTS
    );
    const requests = fixture.system.drainBeamRequests();
    assert(
      requests.length === 1 &&
        requests[0].sourceId === "npc_1",
      "ライフサイクル検証のbeam requestを準備できません。"
    );
    fixture.system.notifyBeamsSpawned([
      Object.freeze({
        sourceId: "npc_1",
        beamId
      })
    ]);
    assert(
      getTracking(fixture.system, "npc_1")
        .followerFirePhase === "active",
      "ライフサイクル検証のactive beamを準備できません。"
    );
  };

  const disposedFixture = await createNpcCommandFixture(2, 2);
  let disposedFixtureClosed = false;
  try {
    placeNpcs(fixture.system, positions);
    makeActive("phase-reset-active");
    fixture.system.setAiSuspended(true);
    assertClean(fixture.system, "setAiSuspended");
    fixture.system.setAiSuspended(false);

    startScheduled();
    placeNpcs(fixture.system, positions);
    assertClean(fixture.system, "placeNpcs/replay相当");

    makeActive("visibility-active");
    fixture.system.setVisibleNpcIds(["npc_0"]);
    fixture.system.setVisibleNpcIds(["npc_0", "npc_1"]);
    assertClean(fixture.system, "setVisibleNpcIds非表示");

    startScheduled();
    fixture.system.clearCommands();
    assertClean(fixture.system, "clearCommands");

    placeNpcs(disposedFixture.system, positions);
    assert(
      disposedFixture.system.requestCommand(
        "npc_1",
        "follow",
        createCommandQuery(player)
      ),
      "dispose検証のFollowが受理されません。"
    );
    disposedFixture.system.notifyPlayerGunFire(fireEvent);
    disposedFixture.dispose();
    disposedFixtureClosed = true;
    assertThrows(
      () => disposedFixture.system.getFrameView(),
      "dispose後のcommand snapshot参照が拒否されません。"
    );
    assertThrows(
      () => disposedFixture.system.drainBeamRequests(),
      "dispose後の予約drainが拒否されません。"
    );
    return "phase reset・replay相当・非表示・clear・disposeの残留0を確認";
  } finally {
    fixture.dispose();
    if (!disposedFixtureClosed) {
      disposedFixture.dispose();
    }
  }
};

export const runNpcCommandTests = async () =>
    Object.freeze(await Promise.all([
      executeTest("離散入力action", testPlayerActions),
      executeTest(
        "プレイヤー成立gun射撃event",
        testPlayerGunFireEventSnapshot
      ),
      executeTest("NPC指示候補抽出", testCandidateSelection),
      executeTest("NPC指示対象状態", testCommandStateEligibility),
      executeTest(
        "NPC指示要求と解除hook",
        testCommandRequestContract
      ),
      executeTest(
        "Follow移動・視線猶予・被弾解除",
        testFollowMovementAndRelease
      ),
      executeTest(
        "Follow停止距離ヒステリシス",
        testFollowStopAndResume
      ),
      executeTest(
        "Follow／Leave速度",
        testFollowAndLeaveSpeeds
      ),
      executeTest(
        "Follow距離・遮蔽契約",
        testFollowDistanceAndOcclusion
      ),
      executeTest(
        "Followエレベーター搬送中の見失い停止",
        testFollowElevatorSightGrace
      ),
      executeTest(
        "Followエレベーター乗車前取消",
        testFollowElevatorCancellationResumesSightGrace
      ),
      executeTest(
        "FollowのAlarm優先",
        testFollowAlarmPriority
      ),
      executeTest(
        "通常視認・Alarm・Follow速度",
        testAlarmVisualAndFollowNavigationSpeeds
      ),
      executeTest("Leave離脱と終了", testLeaveLifecycle),
      executeTest(
        "ハイグレ残時間停止・再開",
        testHaigureTimerPauseAndResume
      ),
      executeTest(
        "Follower射撃拡散契約",
        testFollowerFireSpreadContract
      ),
      executeTest(
        "洗脳済みFollower同期射撃",
        testBrainwashedFollowersAndSynchronizedFire
      ),
      executeTest(
        "実beam completion統合",
        testActualBeamCompletionEvents
      ),
      executeTest(
        "Follow解除後のactive beam継続",
        testActiveBeamSurvivesFollowRelease
      ),
      executeTest(
        "無制限Follower・多数分離",
        testUnlimitedFollowersAndSeparation
      ),
      executeTest(
        "狭路の隊列Anchor fallback",
        testNarrowPassageFormationFallback
      ),
      executeTest(
        "未洗脳NPCの自律脅威視認・回避",
        testAutonomousThreatVisionAndEscape
      ),
      executeTest(
        "自律脅威探索3Hz公平性",
        testAutonomousThreatRoundRobinFairness
      ),
      executeTest(
        "Follow中の自律戦闘抑制",
        testAutonomousCombatSuppression
      ),
      executeTest(
        "commandライフサイクル残留0",
        testCommandLifecycleCleanup
      )
    ]));
