import {
  FreeCamera,
  InstancedMesh,
  Vector3,
  type Engine,
  type Scene
} from "@babylonjs/core";

import {
  NPC_SPRITE_CENTER_HEIGHT
} from "../../../src/game/characterSprites";
import type { PlayerVerticalState } from "../../../src/game/playerHeight";
import {
  DISTANCE_NAVIGATION_ROUTE_POLICY,
  type NavigationRouteCandidate
} from "../../../src/world/navigationWorld";
import type {
  StagePlayerSpawn,
  StageSpatialSession
} from "../../../src/world/stageSpatialContext";
import type {
  V2NpcNavigationRouteContext
} from "../../../src/v2/npcSystem";
import {
  createV2PerformanceDiagnostics,
  createV2SeededRandom,
  V2_PERFORMANCE_DEFAULT_SEED,
  type V2PerformanceDiagnostics,
  type V2PerformanceScenario
} from "../../../src/v2/performanceDiagnostics";
import type { V2PlayerController } from "../../../src/v2/playerController";
import type { V2MissionElevatorSnapshot } from "../../../src/v2/missionRuntime";
import {
  V2_HIT_FADE_DURATION_SECONDS,
  V2_HIT_FLICKER_DURATION_SECONDS,
  V2_NPC_BRAINWASH_DECISION_SECONDS,
  V2_NO_GUN_TOUCH_BRAINWASH_DURATION_SECONDS
} from "../../../src/v2/characterStateSystem";
import type { V2CharacterState } from "../../../src/v2/combatTypes";
import {
  V2_NPC_CAPTURE_DURATION_SECONDS,
  V2_NPC_CURRENT_TARGET_SIGHT_HERTZ
} from "../../../src/v2/npcSystem";
import {
  createV2SurvivalRuntime,
  summarizeV2NpcHudCounts,
  summarizeV2TargetTracking,
  V2_HOSTILE_STARTUP_GRACE_SECONDS,
  V2_PERFORMANCE_ACCEPTANCE_POPULATION,
  type V2SurvivalConstructionDependencies,
  type V2SurvivalConstructionOwnerLabel,
  type V2SurvivalRuntime
} from "../../../src/v2/survivalRuntime";
import type { V2CharacterVisualRuntime } from "../../../src/v2/v2CharacterVisualRuntime";
import { createDefaultV2CharacterVisualRuntime } from "../characterVisualFixture";
import {
  createFixtureSpawnRoleStage,
  createFixturePlayerSpawnStage,
  requireFirstFixturePlayerSpawn
} from "./spawnContractFixture";

export type SurvivalRuntimeLifecycleCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type SceneResourceCounts = Readonly<{
  meshes: number;
  instances: number;
  materials: number;
  multiMaterials: number;
  transformNodes: number;
  geometries: number;
  textures: number;
  spriteManagers: number;
  sprites: number;
  particleSystems: number;
  skeletons: number;
  animationGroups: number;
  lights: number;
  rootNodes: number;
}>;

type ObservableCounts = Readonly<Record<string, number>>;

const selectDistanceNavigationRoute = (
  _context: V2NpcNavigationRouteContext,
  candidates: readonly NavigationRouteCandidate[]
) => DISTANCE_NAVIGATION_ROUTE_POLICY.selectRoute(candidates);

const createInitialMissionElevatorSnapshots = (
  stage: StageSpatialSession
): readonly V2MissionElevatorSnapshot[] =>
  Object.freeze(
    stage.elevatorAssets.all.map((elevator) =>
      Object.freeze({
        id: elevator.id,
        carState: "stopped" as const,
        displayStopId: elevator.initialStop.id,
        targetStopId: null
      })
    )
  );

const createFakePlayer = (
  playerSpawn: StagePlayerSpawn
): V2PlayerController => {
  const spawn = playerSpawn.marker.node
    .getAbsolutePosition()
    .clone();
  let footPosition = spawn.clone();
  let eyePosition = spawn.add(new Vector3(0, 1 / 3, 0));
  let eyeHeightScale = 1;
  const verticalState: PlayerVerticalState = Object.freeze({
    grounded: true,
    verticalVelocity: 0,
    supportY: spawn.y
  });
  const setFootPosition = (nextFootPosition: Vector3) => {
    footPosition = nextFootPosition.clone();
    eyePosition = footPosition.add(
      new Vector3(0, (1 / 3) * eyeHeightScale, 0)
    );
  };

  return {
    update: () =>
      Object.freeze({
        footPosition: footPosition.clone(),
        eyePosition: eyePosition.clone(),
        verticalState,
        stamina: null
      }),
    getFootPosition: () => footPosition.clone(),
    getEyePosition: () => eyePosition.clone(),
    getVerticalState: () => verticalState,
    setEyeHeightScale: (scale) => {
      eyeHeightScale = scale;
      eyePosition = footPosition.add(
        new Vector3(0, (1 / 3) * eyeHeightScale, 0)
      );
    },
    syncStageSpatialSnapshot: () => {},
    setTransportFootPosition: setFootPosition,
    placeAt: setFootPosition,
    resetToSpawn: () => {
      footPosition = spawn.clone();
      eyePosition = footPosition.add(
        new Vector3(0, (1 / 3) * eyeHeightScale, 0)
      );
    },
    dispose: () => {}
  };
};

const captureSceneResources = (
  scene: Scene
): SceneResourceCounts => {
  let instanceCount = 0;
  for (const mesh of scene.meshes) {
    if (mesh instanceof InstancedMesh) {
      instanceCount += 1;
    }
  }
  return Object.freeze({
    meshes: scene.meshes.length - instanceCount,
    instances: instanceCount,
    materials: scene.materials.length,
    multiMaterials: scene.multiMaterials.length,
    transformNodes: scene.transformNodes.length,
    geometries: scene.geometries.length,
    textures: scene.textures.length,
    spriteManagers: scene.spriteManagers?.length ?? 0,
    sprites:
      scene.spriteManagers?.reduce(
        (total, manager) => total + manager.sprites.length,
        0
      ) ?? 0,
    particleSystems: scene.particleSystems.length,
    skeletons: scene.skeletons.length,
    animationGroups: scene.animationGroups.length,
    lights: scene.lights.length,
    rootNodes: scene.rootNodes.length
  });
};

const subtractSceneResources = (
  counts: SceneResourceCounts,
  baseline: SceneResourceCounts
): SceneResourceCounts =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(counts).map(([key, value]) => [
        key,
        value - baseline[key as keyof SceneResourceCounts]
      ])
    ) as SceneResourceCounts
  );

const sceneResourceCountsEqual = (
  left: SceneResourceCounts,
  right: SceneResourceCounts
) =>
  Object.keys(left).every(
    (key) =>
      left[key as keyof SceneResourceCounts] ===
      right[key as keyof SceneResourceCounts]
  );

const hasGeneratedResources = (delta: SceneResourceCounts) =>
  Object.values(delta).some((value) => value > 0);

const isObservable = (
  value: unknown
): value is Readonly<{ observers: readonly unknown[] }> =>
  typeof value === "object" &&
  value !== null &&
  "observers" in value &&
  Array.isArray(
    (value as Readonly<{ observers: unknown }>).observers
  );

const captureObservableCounts = (
  label: "scene" | "engine",
  owner: object
): ObservableCounts => {
  const counts: Record<string, number> = {};
  const properties = owner as Record<string, unknown>;
  for (const key in properties) {
    if (!key.startsWith("on") || !key.endsWith("Observable")) {
      continue;
    }
    const observable = properties[key];
    if (isObservable(observable)) {
      counts[`${label}.${key}`] = observable.observers.length;
    }
  }
  return Object.freeze(counts);
};

const observableCountsEqual = (
  left: ObservableCounts,
  right: ObservableCounts
) => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? 0) !== (right[key] ?? 0)) {
      return false;
    }
  }
  return true;
};

const createRuntime = async (
  scene: Scene,
  stage: StageSpatialSession,
  getOrbVisibilityPredicate: () => (position: Vector3) => boolean,
  performanceDiagnostics: V2PerformanceDiagnostics | null = null,
  performanceWorkloadScenario: V2PerformanceScenario | null = null,
  constructionDependencies: V2SurvivalConstructionDependencies = Object.freeze({})
) => {
  const playerSpawn = requireFirstFixturePlayerSpawn(stage);
  const player = createFakePlayer(playerSpawn);
  const characterVisuals = await createDefaultV2CharacterVisualRuntime(
    scene,
    Object.freeze([
      "player",
      ...Array.from(
        { length: V2_PERFORMANCE_ACCEPTANCE_POPULATION.npcCount },
        (_, index) => `npc_${index}`
      )
    ])
  );
  try {
    return Object.freeze({
      runtime: createV2SurvivalRuntime({
        scene,
        stage,
        playerSpawn,
        player,
        initialPlayerState: "normal",
        showGroundShadows: false,
        characterVisuals,
        random: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED),
        npcSpawnRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4e50_4301
        ),
        bitSpawnRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4249_5401
        ),
        playerMissionRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d50_4c01
        ),
        npcMissionRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d4e_4c01
        ),
        broadcastMissionRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d42_4301
        ),
        getOrbVisibilityPredicate,
        population: V2_PERFORMANCE_ACCEPTANCE_POPULATION,
        features: Object.freeze({
          missionEnabled: true,
          alarmEnabled: true
        }),
        startupScenario: null,
        brainwashSettings: Object.freeze({
          instantBrainwash: false,
          brainwashOnNoGunTouch: false,
          gunPercent: 45,
          noGunPercent: 45
        }),
        performanceDiagnostics,
        performanceWorkloadScenario,
        releaseStageTraversalForScriptedPhase: () => {},
        selectNavigationRoute: selectDistanceNavigationRoute
      }, constructionDependencies),
      characterVisuals,
      player
    });
  } catch (error) {
    characterVisuals.dispose();
    throw error;
  }
};

export const runSurvivalNoGunRestraintTests = async (
  scene: Scene,
  stage: StageSpatialSession
): Promise<readonly SurvivalRuntimeLifecycleCheck[]> => {
  const checks: SurvivalRuntimeLifecycleCheck[] = [];
  const playerSpawn = requireFirstFixturePlayerSpawn(stage);
  const elevatorSnapshots = createInitialMissionElevatorSnapshots(stage);
  // 猶予中に空になった視線探索の予算を、解除後の1周期で進める。
  const firstHostileTickSeconds = 1 / V2_NPC_CURRENT_TARGET_SIGHT_HERTZ;
  const firstHostileTickElapsedSeconds =
    V2_HOSTILE_STARTUP_GRACE_SECONDS + firstHostileTickSeconds;
  const runCase = async (
    name: string,
    options: Readonly<{
      initialPlayerState: V2CharacterState;
      initialBrainwashedNpcCount: number;
      brainwashOnNoGunTouch: boolean;
    }>,
    inspect: (
      runtime: V2SurvivalRuntime,
      player: V2PlayerController
    ) => Pick<SurvivalRuntimeLifecycleCheck, "ok" | "detail">
  ) => {
    const player = createFakePlayer(playerSpawn);
    let runtime: V2SurvivalRuntime | null = null;
    let characterVisuals: V2CharacterVisualRuntime | null = null;
    try {
      characterVisuals = await createDefaultV2CharacterVisualRuntime(
        scene,
        Object.freeze(["player", "npc_0", "npc_1"])
      );
      runtime = createV2SurvivalRuntime({
        scene,
        stage,
        playerSpawn,
        player,
        initialPlayerState: options.initialPlayerState,
        showGroundShadows: false,
        characterVisuals,
        random: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED),
        npcSpawnRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4e50_4303),
        bitSpawnRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4249_5403),
        playerMissionRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d50_4c03),
        npcMissionRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d4e_4c03),
        broadcastMissionRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d42_4303),
        getOrbVisibilityPredicate: () => () => true,
        population: Object.freeze({
          npcCount: 2,
          initialBrainwashedNpcCount: options.initialBrainwashedNpcCount,
          initialBitCount: 0,
          bitReinforcementIntervalSeconds: 10,
          maximumBitCount: 0
        }),
        features: Object.freeze({ missionEnabled: false, alarmEnabled: false }),
        startupScenario: null,
        brainwashSettings: Object.freeze({
          instantBrainwash: false,
          brainwashOnNoGunTouch: options.brainwashOnNoGunTouch,
          gunPercent: 0,
          noGunPercent: 100
        }),
        performanceDiagnostics: null,
        performanceWorkloadScenario: null,
        releaseStageTraversalForScriptedPhase: () => {},
        selectNavigationRoute: selectDistanceNavigationRoute
      });
      checks.push(Object.freeze({ name, ...inspect(runtime, player) }));
    } catch (error) {
      checks.push(Object.freeze({
        name,
        ok: false,
        detail: error instanceof Error ? error.stack ?? error.message : String(error)
      }));
    } finally {
      runtime?.dispose();
      characterVisuals?.dispose();
      player.dispose();
    }
  };

  await runCase(
    "銃なし近接拘束の公開IDはN→G/Hの直後に更新される",
    { initialPlayerState: "brainwash-complete-no-gun", initialBrainwashedNpcCount: 0, brainwashOnNoGunTouch: false },
    (runtime, player) => {
      const targetPosition = runtime.getNpcPosition("npc_0");
      player.placeAt(targetPosition, targetPosition.add(Vector3.Up()));
      runtime.selectPlayerCompletion("brainwash-complete-no-gun");
      const noGunFrame = runtime.getFrame();
      runtime.selectPlayerCompletion("brainwash-complete-gun");
      const gunFrame = runtime.getFrame();
      runtime.selectPlayerCompletion("brainwash-complete-no-gun");
      const secondNoGunFrame = runtime.getFrame();
      runtime.selectPlayerCompletion("brainwash-complete-haigure");
      const haigureFrame = runtime.getFrame();
      return {
        ok:
          noGunFrame.noGunRestrainedTargetIds.includes("npc_0") &&
          gunFrame.noGunRestrainedTargetIds.length === 0 &&
          secondNoGunFrame.noGunRestrainedTargetIds.includes("npc_0") &&
          haigureFrame.noGunRestrainedTargetIds.length === 0 &&
          Object.isFrozen(noGunFrame.noGunRestrainedTargetIds),
        detail:
          `N=${noGunFrame.noGunRestrainedTargetIds.join(",")} / ` +
          `G=${gunFrame.noGunRestrainedTargetIds.join(",")} / ` +
          `N再選択=${secondNoGunFrame.noGunRestrainedTargetIds.join(",")} / ` +
          `H=${haigureFrame.noGunRestrainedTargetIds.join(",")}`
      };
    }
  );
  await runCase(
    "通常被弾の移動停止は銃なし拘束表示へ含めない",
    { initialPlayerState: "hit-a", initialBrainwashedNpcCount: 0, brainwashOnNoGunTouch: false },
    (runtime) => {
      const frame = runtime.getFrame();
      return {
        ok: frame.playerState === "hit-a" && !frame.playerCanMove &&
          frame.captureCount === 0 && frame.noGunRestrainedTargetIds.length === 0,
        detail:
          `state=${frame.playerState} / move=${frame.playerCanMove} / ` +
          `restrained=${frame.noGunRestrainedTargetIds.join(",")}`
      };
    }
  );
  await runCase(
    "NPC捕獲の公開IDはPlayerだけを含み20秒後に解除される",
    { initialPlayerState: "normal", initialBrainwashedNpcCount: 1, brainwashOnNoGunTouch: false },
    (runtime, player) => {
      runtime.update(V2_HOSTILE_STARTUP_GRACE_SECONDS, V2_HOSTILE_STARTUP_GRACE_SECONDS, null, elevatorSnapshots);
      const captorPosition = runtime.getNpcPosition("npc_0");
      player.placeAt(captorPosition, captorPosition.add(Vector3.Up()));
      const captured = runtime.update(
        firstHostileTickSeconds,
        firstHostileTickElapsedSeconds,
        null,
        elevatorSnapshots
      );
      const released = runtime.update(
        V2_NPC_CAPTURE_DURATION_SECONDS,
        firstHostileTickElapsedSeconds + V2_NPC_CAPTURE_DURATION_SECONDS,
        null,
        elevatorSnapshots
      );
      return {
        ok:
          captured.captureCount === 1 && !captured.playerCanMove &&
          captured.noGunRestrainedTargetIds.join("|") === "player" &&
          released.captureCount === 0 && released.playerCanMove &&
          released.noGunRestrainedTargetIds.length === 0,
        detail:
          `capture=${captured.captureCount}->${released.captureCount} / ` +
          `move=${captured.playerCanMove}->${released.playerCanMove} / ` +
          `restrained=${captured.noGunRestrainedTargetIds.join(",")}->` +
          released.noGunRestrainedTargetIds.join(",")
      };
    }
  );
  await runCase(
    "NPCの接触洗脳ONはPlayer停止時にも捕獲表示を作らない",
    { initialPlayerState: "normal", initialBrainwashedNpcCount: 1, brainwashOnNoGunTouch: true },
    (runtime, player) => {
      runtime.update(V2_HOSTILE_STARTUP_GRACE_SECONDS, V2_HOSTILE_STARTUP_GRACE_SECONDS, null, elevatorSnapshots);
      const captorPosition = runtime.getNpcPosition("npc_0");
      player.placeAt(captorPosition, captorPosition.add(Vector3.Up()));
      const frame = runtime.update(
        firstHostileTickSeconds,
        firstHostileTickElapsedSeconds,
        null,
        elevatorSnapshots
      );
      return {
        ok:
          frame.playerState === "hit-a" && frame.playerNoGunTouchBrainwashProgress === 0 &&
          !frame.playerCanMove && frame.captureCount === 0 &&
          frame.noGunRestrainedTargetIds.length === 0,
        detail:
          `state=${frame.playerState} / touch=${frame.playerNoGunTouchBrainwashProgress} / ` +
          `capture=${frame.captureCount} / restrained=${frame.noGunRestrainedTargetIds.join(",")}`
      };
    }
  );
  await runCase(
    "Player接触洗脳はhit中の近接拘束を保ち洗脳中への遷移直後に消す",
    { initialPlayerState: "brainwash-complete-no-gun", initialBrainwashedNpcCount: 0, brainwashOnNoGunTouch: true },
    (runtime, player) => {
      const targetPosition = runtime.getNpcPosition("npc_0");
      player.placeAt(targetPosition, targetPosition.add(Vector3.Up()));
      const contactFrame = runtime.update(0, 0, null, elevatorSnapshots);
      const contactState = runtime.getHumanTargets().find((target) => target.id === "npc_0")!.state;
      const progressedFrame = runtime.update(
        V2_NO_GUN_TOUCH_BRAINWASH_DURATION_SECONDS,
        V2_NO_GUN_TOUCH_BRAINWASH_DURATION_SECONDS,
        null,
        elevatorSnapshots
      );
      const progressedState = runtime.getHumanTargets().find((target) => target.id === "npc_0")!.state;
      return {
        ok:
          contactState === "hit-a" && contactFrame.noGunRestrainedTargetIds.includes("npc_0") &&
          progressedState === "brainwash-in-progress" && progressedFrame.phase === "playing" &&
          !progressedFrame.noGunRestrainedTargetIds.includes("npc_0"),
        detail:
          `state=${contactState}->${progressedState} / phase=${progressedFrame.phase} / ` +
          `restrained=${contactFrame.noGunRestrainedTargetIds.join(",")}->` +
          progressedFrame.noGunRestrainedTargetIds.join(",")
      };
    }
  );
  return Object.freeze(checks);
};

const runInstantExecutionReplayTest = async (
  scene: Scene,
  stage: StageSpatialSession
): Promise<SurvivalRuntimeLifecycleCheck> => {
  const name = "即時公開処刑の途中・完了後リプレイで弾と被弾を消し役割・配置を保つ";
  const playerSpawn = requireFirstFixturePlayerSpawn(stage);
  const player = createFakePlayer(playerSpawn);
  const elevatorSnapshots = createInitialMissionElevatorSnapshots(stage);
  let runtime: V2SurvivalRuntime | null = null;
  let characterVisuals: V2CharacterVisualRuntime | null = null;
  try {
    characterVisuals = await createDefaultV2CharacterVisualRuntime(
      scene,
      Object.freeze(["player", "npc_0", "npc_1"])
    );
    const executionRuntime = createV2SurvivalRuntime({
      scene,
      stage,
      playerSpawn,
      player,
      initialPlayerState: "normal",
      showGroundShadows: false,
      characterVisuals,
      random: () => 0.9,
      npcSpawnRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4e50_4304),
      bitSpawnRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4249_5404),
      playerMissionRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d50_4c04),
      npcMissionRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d4e_4c04),
      broadcastMissionRandom: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d42_4304),
      getOrbVisibilityPredicate: () => () => true,
      population: Object.freeze({
        npcCount: 2,
        initialBrainwashedNpcCount: 0,
        initialBitCount: 0,
        bitReinforcementIntervalSeconds: 10,
        maximumBitCount: 0
      }),
      features: Object.freeze({ missionEnabled: false, alarmEnabled: false }),
      startupScenario: Object.freeze({
        method: "npc-player",
        venueId: "assembly-courtyard",
        targetActorIds: Object.freeze(["npc_0"]),
        audienceNpcIds: Object.freeze(["npc_1"]),
        npcShooterIds: Object.freeze([]),
        bitShooterIds: Object.freeze([]),
        playerRole: "shooter"
      }),
      brainwashSettings: Object.freeze({
        instantBrainwash: false,
        brainwashOnNoGunTouch: false,
        gunPercent: 0,
        noGunPercent: 100
      }),
      performanceDiagnostics: null,
      performanceWorkloadScenario: null,
      releaseStageTraversalForScriptedPhase: () => {},
      selectNavigationRoute: selectDistanceNavigationRoute
    });
    runtime = executionRuntime;
    executionRuntime.activateStartupScenario();
    const initialTargets = executionRuntime.getHumanTargets();
    const targetState = () =>
      executionRuntime.getHumanTargets().find((target) => target.id === "npc_0")!.state;
    let elapsedSeconds = 0;
    const advance = (deltaSeconds: number) => {
      elapsedSeconds += deltaSeconds;
      return executionRuntime.update(deltaSeconds, elapsedSeconds, null, elevatorSnapshots);
    };
    const fireAtTarget = () => {
      const target = executionRuntime.getHumanTargets().find((entry) => entry.id === "npc_0")!;
      return executionRuntime.requestPlayerGunFire(
        target.aimPosition.subtract(player.getEyePosition())
      );
    };
    const advanceUntilHit = () => {
      for (let tick = 0; tick < 100 && targetState() === "evade"; tick += 1) {
        advance(0.05);
      }
      return targetState();
    };

    const flyingShotAccepted = executionRuntime.requestPlayerGunFire(Vector3.Up());
    const flyingFrame = advance(0);
    const pendingShotAccepted = fireAtTarget();
    executionRuntime.replayExecution();
    const beamReplayFrame = advance(0);

    const firstHitShotAccepted = fireAtTarget();
    advance(0);
    const hitState = advanceUntilHit();
    const activeHitShells = scene.meshes.filter((mesh) =>
      mesh.name.startsWith("v2-hit-effect-shell-") && mesh.isEnabled()
    );
    executionRuntime.replayExecution();
    const hitReplayFrame = executionRuntime.getFrame();
    const replayTargetState = targetState();
    const clearedAudioCount = executionRuntime.drainAudioEvents().length;
    const hitShellsRetainedAndCleared = activeHitShells.every((mesh) =>
      !mesh.isDisposed() && !mesh.isEnabled()
    );

    const completionShotAccepted = fireAtTarget();
    advance(0);
    const secondHitState = advanceUntilHit();
    const completeFrame = advance(
      V2_HIT_FLICKER_DURATION_SECONDS + V2_HIT_FADE_DURATION_SECONDS +
      V2_NPC_BRAINWASH_DECISION_SECONDS
    );
    executionRuntime.replayExecution();
    const completeReplayFrame = executionRuntime.getFrame();
    const replayTargets = executionRuntime.getHumanTargets();
    const positionsPreserved = replayTargets.every((target, index) =>
      target.id === initialTargets[index].id &&
      Vector3.Distance(target.footPosition, initialTargets[index].footPosition) < 1e-9
    );
    const audienceState = replayTargets.find((target) => target.id === "npc_1")!.state;
    return Object.freeze({
      name,
      ok:
        flyingShotAccepted && pendingShotAccepted && flyingFrame.activeBeamCount === 1 &&
        beamReplayFrame.activeBeamCount === 0 && beamReplayFrame.phase === "execution" &&
        firstHitShotAccepted && hitState === "hit-a" && activeHitShells.length > 0 &&
        hitReplayFrame.activeBeamCount === 0 && replayTargetState === "evade" &&
        clearedAudioCount === 0 && hitShellsRetainedAndCleared &&
        completionShotAccepted && secondHitState === "hit-a" &&
        completeFrame.phase === "execution-complete" &&
        completeReplayFrame.phase === "execution" &&
        completeReplayFrame.executionCompletedTargetCount === 0 &&
        completeReplayFrame.executionPendingTargetIds.join(",") === "npc_0" &&
        completeReplayFrame.playerState === "brainwash-complete-gun" &&
        targetState() === "evade" && audienceState === "brainwash-complete-haigure-formation" &&
        positionsPreserved,
      detail:
        `弾=${flyingFrame.activeBeamCount}->${beamReplayFrame.activeBeamCount} / ` +
        `被弾=${hitState}->${replayTargetState} / 演出=${activeHitShells.length}/${hitShellsRetainedAndCleared} / ` +
        `未配送音声=${clearedAudioCount} / 完了=${completeFrame.phase}->${completeReplayFrame.phase} / ` +
        `Player=${completeReplayFrame.playerState} / 観客=${audienceState} / 配置保持=${positionsPreserved}`
    });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  } finally {
    runtime?.dispose();
    characterVisuals?.dispose();
    player.dispose();
  }
};

export const runSurvivalRuntimeLifecycleTests = async (
  scene: Scene,
  stage: StageSpatialSession
): Promise<readonly SurvivalRuntimeLifecycleCheck[]> => {
  const lifecycleStage = createFixturePlayerSpawnStage(
    createFixtureSpawnRoleStage(
      createFixtureSpawnRoleStage(
        stage,
        "npc_spawn",
        Object.freeze(["npc-spawn-f01-stage"])
      ),
      "bit_spawn",
      Object.freeze(["bit-spawn-outdoor-f1"])
    ),
    "player-spawn-main"
  );
  const checks: SurvivalRuntimeLifecycleCheck[] = [];
  const baseline = captureSceneResources(scene);
  const acquiredDuringFailure: V2SurvivalConstructionOwnerLabel[] = [];
  const rolledBackDuringFailure: V2SurvivalConstructionOwnerLabel[] = [];
  const injectedConstructionError = new Error(
    "fixture survival construction failure"
  );
  let observedConstructionError: unknown = null;
  try {
    await createRuntime(
      scene,
      lifecycleStage,
      () => () => true,
      null,
      null,
      Object.freeze({
        ownerAcquired: (label) => {
          acquiredDuringFailure.push(label);
          if (label === "alarm-system") {
            throw injectedConstructionError;
          }
        },
        ownerRolledBack: (label) => rolledBackDuringFailure.push(label)
      })
    );
  } catch (error) {
    observedConstructionError = error;
  }
  checks.push(Object.freeze({
    name: "Survival通常部分構築失敗を取得逆順rollback",
    ok:
      observedConstructionError === injectedConstructionError &&
      rolledBackDuringFailure.join("|") ===
        [...acquiredDuringFailure].reverse().join("|") &&
      sceneResourceCountsEqual(captureSceneResources(scene), baseline),
    detail:
      `acquired=${acquiredDuringFailure.join("|")} / ` +
      `rollback=${rolledBackDuringFailure.join("|")} / ` +
      `original=${observedConstructionError === injectedConstructionError}`
  }));
  let firstRuntime: V2SurvivalRuntime | null = null;
  let firstCharacterVisuals: V2CharacterVisualRuntime | null = null;
  let secondRuntime: V2SurvivalRuntime | null = null;
  let secondCharacterVisuals: V2CharacterVisualRuntime | null = null;

  try {
    const allStateHudCounts = summarizeV2NpcHudCounts(
      Object.freeze([
        "normal",
        "evade",
        "hit-a",
        "hit-b",
        "brainwash-in-progress",
        "brainwash-complete-gun",
        "brainwash-complete-no-gun",
        "brainwash-complete-haigure",
        "brainwash-complete-haigure-formation"
      ])
    );
    checks.push(
      Object.freeze({
        name: "NPCの全状態をHUDの4分類へ集計",
        ok:
          allStateHudCounts.unbrainwashed === 2 &&
          allStateHudCounts.haigure === 5 &&
          allStateHudCounts.gun === 1 &&
          allStateHudCounts.noGun === 1,
        detail:
          `unbrainwashed=${allStateHudCounts.unbrainwashed} / ` +
          `haigure=${allStateHudCounts.haigure} / ` +
          `gun=${allStateHudCounts.gun} / ` +
          `noGun=${allStateHudCounts.noGun}`
      })
    );
    let orbVisibilityPredicateFactoryCalls = 0;
    const performanceWorkloadScenario = Object.freeze({
      profile: "fixed-4200" as const,
      seed: V2_PERFORMANCE_DEFAULT_SEED,
      view: "courtyard" as const
    });
    const performanceDiagnostics =
      createV2PerformanceDiagnostics(
        scene.getEngine(),
        scene,
        performanceWorkloadScenario,
        V2_PERFORMANCE_ACCEPTANCE_POPULATION
      );
    const firstFixture = await createRuntime(
      scene,
      lifecycleStage,
      () => {
        orbVisibilityPredicateFactoryCalls += 1;
        return () => true;
      },
      performanceDiagnostics,
      performanceWorkloadScenario
    );
    firstRuntime = firstFixture.runtime;
    firstCharacterVisuals = firstFixture.characterVisuals;
    const firstFrame = firstRuntime.getFrame();
    checks.push(
      Object.freeze({
        name: "実人口99/66/50の初期frameを構築",
        ok:
          firstFrame.npcCount === 99 &&
          firstFrame.npcHudCounts.unbrainwashed +
            firstFrame.npcHudCounts.haigure +
            firstFrame.npcHudCounts.gun +
            firstFrame.npcHudCounts.noGun ===
            firstFrame.npcCount &&
          firstFrame.brainwashedNpcCount === 66 &&
          firstFrame.bitCount === 50 &&
          firstFrame.npcPlayerTargetCount === 0 &&
          firstFrame.bitPlayerTargetCount === 0 &&
          !firstFrame.playerCompletionUnlocked,
        detail:
          `npc=${firstFrame.npcCount} / ` +
          `hud=${JSON.stringify(firstFrame.npcHudCounts)} / ` +
          `brainwashed=${firstFrame.brainwashedNpcCount} / ` +
          `bit=${firstFrame.bitCount} / ` +
          `playerTargets=${firstFrame.npcPlayerTargetCount}+` +
          `${firstFrame.bitPlayerTargetCount} / ` +
          `completionUnlocked=${firstFrame.playerCompletionUnlocked}`
      })
    );
    await firstRuntime.prepareVisualResources();
    performanceDiagnostics.beginFrame();
    const firstUpdatedFrame = firstRuntime.update(
      1 / 60,
      1 / 60,
      null,
      createInitialMissionElevatorSnapshots(lifecycleStage)
    );
    performanceDiagnostics.finishFrame(1 / 60);
    const firstHumanTargets = firstRuntime.getHumanTargets();
    const repeatedHumanTargets = firstRuntime.getHumanTargets();
    checks.push(
      Object.freeze({
        name: "Human target snapshotを状態更新まで再利用",
        ok:
          firstHumanTargets === repeatedHumanTargets &&
          firstHumanTargets.length === firstUpdatedFrame.npcCount + 1,
        detail:
          `same=${firstHumanTargets === repeatedHumanTargets} / ` +
          `targets=${firstHumanTargets.length}`
      })
    );
    const initialPlayerTarget = firstHumanTargets.find(
      (target) => target.id === "player"
    );
    if (!initialPlayerTarget) {
      throw new Error("初期player target snapshotがありません。");
    }
    const transportedPlayerPosition =
      initialPlayerTarget.footPosition.add(new Vector3(0.01, 0, 0));
    firstRuntime.beginTargetNavigationAreaTransport(
      "player",
      initialPlayerTarget.footPosition
    );
    firstFixture.player.setTransportFootPosition(
      transportedPlayerPosition
    );
    firstRuntime.updateTargetNavigationAreaTransportPosition(
      "player",
      transportedPlayerPosition
    );
    const transportedHumanTargets = firstRuntime.getHumanTargets();
    const transportedPlayerTarget = transportedHumanTargets.find(
      (target) => target.id === "player"
    );
    checks.push(
      Object.freeze({
        name: "プレイヤー搬送位置を同frameのHuman targetへ同期",
        ok:
          transportedHumanTargets !== firstHumanTargets &&
          transportedPlayerTarget?.footPosition.equals(
            transportedPlayerPosition
          ) === true,
        detail:
          `snapshotChanged=${transportedHumanTargets !== firstHumanTargets} / ` +
          `position=${transportedPlayerTarget?.footPosition.toString() ?? "missing"}`
      })
    );
    const relocatedPlayerPosition =
      transportedPlayerPosition.add(new Vector3(0.01, 0, 0));
    firstFixture.player.setTransportFootPosition(
      relocatedPlayerPosition
    );
    firstRuntime.relocateTargetNavigationArea(
      "player",
      relocatedPlayerPosition
    );
    const relocatedPlayerTarget = firstRuntime
      .getHumanTargets()
      .find((target) => target.id === "player");
    checks.push(
      Object.freeze({
        name: "プレイヤー再配置位置を同frameのHuman targetへ同期",
        ok:
          relocatedPlayerTarget?.footPosition.equals(
            relocatedPlayerPosition
          ) === true,
        detail:
          `position=${relocatedPlayerTarget?.footPosition.toString() ?? "missing"}`
      })
    );
    const fixedTrackingSummary = summarizeV2TargetTracking(
      Object.freeze([
        Object.freeze({
          targetId: "player",
          provenance: "visual" as const
        }),
        Object.freeze({
          targetId: "npc-1",
          provenance: "alert" as const
        }),
        Object.freeze({
          targetId: "player",
          provenance: "alert" as const
        }),
        Object.freeze({
          targetId: null,
          provenance: null
        })
      ]),
      Object.freeze([
        Object.freeze({
          targetId: "player",
          provenance: "visual" as const
        }),
        Object.freeze({
          targetId: "npc-2",
          provenance: "visual" as const
        }),
        Object.freeze({
          targetId: "player",
          provenance: "alert" as const
        })
      ])
    );
    checks.push(
      Object.freeze({
        name: "固定trackingから非0の標的数を厳密集計",
        ok:
          fixedTrackingSummary.visualTargetCount === 3 &&
          fixedTrackingSummary.alertTargetCount === 3 &&
          fixedTrackingSummary.npcPlayerTargetCount === 2 &&
          fixedTrackingSummary.bitPlayerTargetCount === 2,
        detail:
          `visual=${fixedTrackingSummary.visualTargetCount} / ` +
          `alert=${fixedTrackingSummary.alertTargetCount} / ` +
          `npcPlayer=${fixedTrackingSummary.npcPlayerTargetCount} / ` +
          `bitPlayer=${fixedTrackingSummary.bitPlayerTargetCount}`
      })
    );
    const performanceReport =
      performanceDiagnostics.getReport();
    const initialBitCount =
      performanceReport.cold.counters["scenario.bit-count"];
    const initialAlertInjections =
      performanceReport.cold.counters["scenario.alert-injections"];
    checks.push(
      Object.freeze({
        name: "性能シナリオ初回frameでBITとAlert workloadを成立",
        ok:
          initialBitCount?.sampleCount === 1 &&
          initialBitCount.first === 50 &&
          initialBitCount.minimum === 50 &&
          initialAlertInjections?.sampleCount === 1 &&
          initialAlertInjections.first === 1,
        detail:
          `bit=${JSON.stringify(initialBitCount)} / ` +
          `alert=${JSON.stringify(initialAlertInjections)}`
      })
    );
    const npcPlayerTargets =
      performanceReport.cold.counters[
        "scenario.npc-player-targets"
      ];
    const bitPlayerTargets =
      performanceReport.cold.counters[
        "scenario.bit-player-targets"
      ];
    const idleHitEffectUpdates =
      performanceReport.cold.counters["hit-effect.updates"];
    const bitTargetHistorySize =
      performanceReport.cold.counters["bit.target-history-size"];
    checks.push(
      Object.freeze({
        name: "active hit effect 0件時の更新を省略",
        ok: idleHitEffectUpdates === undefined,
        detail:
          `updateSamples=${idleHitEffectUpdates?.sampleCount ?? 0}`
      })
    );
    checks.push(
      Object.freeze({
        name: "BIT標的履歴を現行BIT数以内に維持",
        ok:
          bitTargetHistorySize?.sampleCount === 1 &&
          bitTargetHistorySize.first <= firstUpdatedFrame.bitCount,
        detail:
          `history=${bitTargetHistorySize?.first ?? "missing"} / ` +
          `bit=${firstUpdatedFrame.bitCount}`
      })
    );
    checks.push(
      Object.freeze({
        name: "プレイヤーを狙うNPC／BIT数を個別集計",
        ok:
          Number.isInteger(
            firstUpdatedFrame.npcPlayerTargetCount
          ) &&
          firstUpdatedFrame.npcPlayerTargetCount >= 0 &&
          firstUpdatedFrame.npcPlayerTargetCount <=
            firstUpdatedFrame.npcCount &&
          Number.isInteger(
            firstUpdatedFrame.bitPlayerTargetCount
          ) &&
          firstUpdatedFrame.bitPlayerTargetCount >= 0 &&
          firstUpdatedFrame.bitPlayerTargetCount <=
            firstUpdatedFrame.bitCount &&
          npcPlayerTargets?.sampleCount === 1 &&
          npcPlayerTargets.first ===
            firstUpdatedFrame.npcPlayerTargetCount &&
          bitPlayerTargets?.sampleCount === 1 &&
          bitPlayerTargets.first ===
            firstUpdatedFrame.bitPlayerTargetCount,
        detail:
          `npc=${firstUpdatedFrame.npcPlayerTargetCount}/` +
          `${firstUpdatedFrame.npcCount} / ` +
          `bit=${firstUpdatedFrame.bitPlayerTargetCount}/` +
          `${firstUpdatedFrame.bitCount} / ` +
          `counterSamples=${npcPlayerTargets?.sampleCount ?? 0}+` +
          `${bitPlayerTargets?.sampleCount ?? 0}`
      })
    );
    performanceDiagnostics.dispose();
    checks.push(
      Object.freeze({
        name: "オーブ表示判定を1フレームに1回だけ構築",
        ok: orbVisibilityPredicateFactoryCalls === 1,
        detail: `factoryCalls=${orbVisibilityPredicateFactoryCalls}`
      })
    );
    const firstActive = captureSceneResources(scene);
    const firstDelta = subtractSceneResources(firstActive, baseline);
    firstRuntime.dispose();
    firstRuntime = null;
    firstCharacterVisuals.dispose();
    firstCharacterVisuals = null;
    const afterFirstDispose = captureSceneResources(scene);
    checks.push(
      Object.freeze({
        name: "SurvivalRuntime破棄後にScene資源がbaselineへ復帰",
        ok:
          hasGeneratedResources(firstDelta) &&
          sceneResourceCountsEqual(baseline, afterFirstDispose),
        detail:
          `delta=${JSON.stringify(firstDelta)} / ` +
          `baseline=${JSON.stringify(baseline)} / ` +
          `disposed=${JSON.stringify(afterFirstDispose)}`
      })
    );

    const secondFixture = await createRuntime(
      scene,
      lifecycleStage,
      () => () => true,
      null,
      performanceWorkloadScenario
    );
    secondRuntime = secondFixture.runtime;
    secondCharacterVisuals = secondFixture.characterVisuals;
    const secondFrame = secondRuntime.getFrame();
    await secondRuntime.prepareVisualResources();
    secondRuntime.update(
      1 / 60,
      1 / 60,
      null,
      createInitialMissionElevatorSnapshots(lifecycleStage)
    );
    const secondActive = captureSceneResources(scene);
    const secondDelta = subtractSceneResources(secondActive, baseline);
    secondRuntime.dispose();
    secondRuntime = null;
    secondCharacterVisuals.dispose();
    secondCharacterVisuals = null;
    const afterSecondDispose = captureSceneResources(scene);
    checks.push(
      Object.freeze({
        name: "同一Scene・学校Stageで再生成して同じ資源増分を再利用",
        ok:
          secondFrame.npcCount === 99 &&
          secondFrame.brainwashedNpcCount === 66 &&
          secondFrame.bitCount === 50 &&
          !secondFrame.playerCompletionUnlocked &&
          sceneResourceCountsEqual(firstDelta, secondDelta) &&
          sceneResourceCountsEqual(baseline, afterSecondDispose),
        detail:
          `firstDelta=${JSON.stringify(firstDelta)} / ` +
          `secondDelta=${JSON.stringify(secondDelta)} / ` +
          `disposed=${JSON.stringify(afterSecondDispose)}`
      })
    );

    const commandBaseline = captureSceneResources(scene);
    const previousActiveCamera = scene.activeCamera;
    const playerSpawn = requireFirstFixturePlayerSpawn(lifecycleStage);
    const commandPlayer = createFakePlayer(playerSpawn);
    let commandRuntime: V2SurvivalRuntime | null = null;
    let commandCharacterVisuals: V2CharacterVisualRuntime | null = null;
    let commandCamera: FreeCamera | null = null;
    let initialCandidateCount = 0;
    let followVisible = false;
    let followVisibleBeforeTransition = false;
    let fireAccepted = false;
    let phaseAfterTransition = "playing";
    let assemblyMovementBeforeRelease = false;
    let assemblyReleaseAccepted = false;
    let assemblyMovementAfterRelease = false;
    let duplicateAssemblyReleaseRejected = false;
    let activeBeamCountAfterTransition = -1;
    let phaseGuardedCandidateCount = -1;
    let phaseGuardedRequestAccepted = true;
    let scriptedPhaseTraversalReleaseCount = 0;
    let disposedAccessRejected = false;
    try {
      const seededRandom = createV2SeededRandom(
        V2_PERFORMANCE_DEFAULT_SEED ^ 0x5430_5303
      );
      const gunNpcRandom = () => seededRandom() * 0.44;
      commandCharacterVisuals =
        await createDefaultV2CharacterVisualRuntime(
          scene,
          Object.freeze(["player", "npc_0"])
        );
      commandRuntime = createV2SurvivalRuntime({
        scene,
        stage: lifecycleStage,
        playerSpawn,
        player: commandPlayer,
        initialPlayerState: "normal",
        showGroundShadows: false,
        characterVisuals: commandCharacterVisuals,
        random: gunNpcRandom,
        npcSpawnRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4e50_4302
        ),
        bitSpawnRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4249_5402
        ),
        playerMissionRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d50_4c02
        ),
        npcMissionRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d4e_4c02
        ),
        broadcastMissionRandom: createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED ^ 0x4d42_4302
        ),
        getOrbVisibilityPredicate: () => () => true,
        population: Object.freeze({
          npcCount: 1,
          initialBrainwashedNpcCount: 1,
          initialBitCount: 0,
          bitReinforcementIntervalSeconds: 10,
          maximumBitCount: 0
        }),
        features: Object.freeze({
          missionEnabled: true,
          alarmEnabled: true
        }),
        startupScenario: null,
        brainwashSettings: Object.freeze({
          instantBrainwash: false,
          brainwashOnNoGunTouch: false,
          gunPercent: 45,
          noGunPercent: 45
        }),
        performanceDiagnostics: null,
        performanceWorkloadScenario: null,
        releaseStageTraversalForScriptedPhase: () => {
          scriptedPhaseTraversalReleaseCount += 1;
        },
        selectNavigationRoute: selectDistanceNavigationRoute
      });
      const npcSprite = scene.spriteManagers
        ?.flatMap((manager) => manager.sprites)
        .find((sprite) => sprite.name === "npc_0");
      if (!npcSprite) {
        throw new Error(
          "Runtime NPC指示検証のnpc_0 spriteがありません。"
        );
      }
      if (npcSprite.cellIndex !== 3) {
        throw new Error(
          `Runtime NPC指示検証のnpc_0がgun状態ではありません: ` +
            `${npcSprite.cellIndex}`
        );
      }
      const npcAimPosition = npcSprite.position.clone();
      const npcFootPosition = npcAimPosition.add(
        new Vector3(0, -NPC_SPRITE_CENTER_HEIGHT, 0)
      );
      commandPlayer.placeAt(npcFootPosition, npcAimPosition);
      commandCamera = new FreeCamera(
        "T05-3RuntimeCommandCamera",
        commandPlayer.getEyePosition(),
        scene
      );
      commandCamera.minZ = 0.01;
      commandCamera.maxZ = 100;
      commandCamera.setTarget(npcAimPosition);
      scene.activeCamera = commandCamera;
      commandCamera.getViewMatrix(true);
      commandCamera.getProjectionMatrix(true);

      const elevatorSnapshots = createInitialMissionElevatorSnapshots(lifecycleStage);
      const startupGraceFrame = commandRuntime.update(5, 5, null, elevatorSnapshots);
      if (startupGraceFrame.playerState !== "normal") {
        throw new Error(
          `開始5秒の猶予中に洗脳済みNPCがPlayerを攻撃しました: ${startupGraceFrame.playerState}`
        );
      }
      commandRuntime.update(0, 5, null, elevatorSnapshots);
      commandRuntime.update(2, 7, null, elevatorSnapshots);
      commandRuntime.update(0.25, 7.25, null, elevatorSnapshots);
      commandRuntime.update(3.7, 10.95, null, elevatorSnapshots);
      const completionFrame = commandRuntime.update(
        0.06,
        11.01,
        null,
        elevatorSnapshots
      );
      if (!completionFrame.playerCompletionUnlocked) {
        throw new Error(
          `Runtime NPC指示検証でプレイヤー完了選択が解放されません: ` +
            `${completionFrame.playerState}`
        );
      }
      commandRuntime.selectPlayerCompletion(
        "brainwash-complete-gun"
      );
      const currentNpcAimPosition = npcSprite.position.clone();
      const currentNpcFootPosition = currentNpcAimPosition.add(
        new Vector3(0, -NPC_SPRITE_CENTER_HEIGHT, 0)
      );
      commandPlayer.placeAt(
        currentNpcFootPosition,
        currentNpcAimPosition
      );
      commandCamera.position.copyFrom(commandPlayer.getEyePosition());
      commandCamera.setTarget(currentNpcAimPosition);
      commandCamera.getViewMatrix(true);
      commandCamera.getProjectionMatrix(true);
      const candidates = commandRuntime.getNpcCommandCandidates();
      initialCandidateCount = candidates.length;
      const candidate = candidates[0];
      if (!candidate) {
        throw new Error(
          "Runtime active camera経由のNPC指示候補がありません。"
        );
      }
      if (
        !commandRuntime.requestNpcCommand(
          candidate.npcId,
          "follow"
        )
      ) {
        throw new Error(
          "Runtime公開API経由のFollowが受理されません。"
        );
      }
      followVisible =
        commandRuntime.getNpcCommandCandidates().find(
          (entry) => entry.npcId === candidate.npcId
        )?.commandMode === "follow";
      commandRuntime.update(2.85, 8.86, null, elevatorSnapshots);
      followVisibleBeforeTransition =
        commandRuntime.getNpcCommandCandidates().find(
          (entry) => entry.npcId === candidate.npcId
        )?.commandMode === "follow";
      fireAccepted = commandRuntime.requestPlayerGunFire(
        new Vector3(1, 0, 0)
      );
      const transitionFrame = commandRuntime.update(
        0.1,
        8.96,
        null,
        elevatorSnapshots
      );
      phaseAfterTransition = transitionFrame.phase;
      assemblyMovementBeforeRelease = commandRuntime.canPlayerMove();
      assemblyReleaseAccepted =
        commandRuntime.releaseAssemblyPlayerControl();
      assemblyMovementAfterRelease = commandRuntime.canPlayerMove();
      duplicateAssemblyReleaseRejected =
        !commandRuntime.releaseAssemblyPlayerControl();
      activeBeamCountAfterTransition =
        transitionFrame.activeBeamCount;
      phaseGuardedCandidateCount =
        commandRuntime.getNpcCommandCandidates().length;
      phaseGuardedRequestAccepted =
        commandRuntime.requestNpcCommand(
          candidate.npcId,
          "follow"
        );

      const disposedRuntime = commandRuntime;
      disposedRuntime.dispose();
      commandRuntime = null;
      try {
        disposedRuntime.getFrame();
      } catch (error) {
        disposedAccessRejected =
          error instanceof Error &&
          error.message.includes("破棄済み");
      }
    } finally {
      commandRuntime?.dispose();
      commandCharacterVisuals?.dispose();
      if (scene.activeCamera === commandCamera) {
        scene.activeCamera = previousActiveCamera;
      }
      commandCamera?.dispose();
      commandPlayer.dispose();
    }
    const afterCommandDispose = captureSceneResources(scene);
    checks.push(
      Object.freeze({
        name: "T05-3 Runtime指示・phase遷移・破棄を実経路で消去",
        ok:
          initialCandidateCount >= 1 &&
          followVisible &&
          followVisibleBeforeTransition &&
          fireAccepted &&
          phaseAfterTransition === "assembly" &&
          !assemblyMovementBeforeRelease &&
          assemblyReleaseAccepted &&
          assemblyMovementAfterRelease &&
          duplicateAssemblyReleaseRejected &&
          scriptedPhaseTraversalReleaseCount === 1 &&
          activeBeamCountAfterTransition === 0 &&
          phaseGuardedCandidateCount === 0 &&
          !phaseGuardedRequestAccepted &&
          disposedAccessRejected &&
          sceneResourceCountsEqual(
            commandBaseline,
            afterCommandDispose
          ),
        detail:
          `candidates=${initialCandidateCount} / ` +
          `follow=${followVisible}->${followVisibleBeforeTransition} / ` +
          `fire=${fireAccepted} / ` +
          `phase=${phaseAfterTransition} / ` +
          `move=${assemblyMovementBeforeRelease}->${assemblyMovementAfterRelease} / ` +
          `release=${assemblyReleaseAccepted}/${duplicateAssemblyReleaseRejected} / ` +
          `traversalRelease=${scriptedPhaseTraversalReleaseCount} / ` +
          `beams=${activeBeamCountAfterTransition} / ` +
          `guardCandidates=${phaseGuardedCandidateCount} / ` +
          `guardRequest=${phaseGuardedRequestAccepted} / ` +
          `disposedRejected=${disposedAccessRejected} / ` +
          `resources=${JSON.stringify(afterCommandDispose)}`
      })
    );
  } finally {
    secondRuntime?.dispose();
    secondCharacterVisuals?.dispose();
    firstRuntime?.dispose();
    firstCharacterVisuals?.dispose();
  }

  checks.push(...await runSurvivalNoGunRestraintTests(scene, lifecycleStage));
  checks.push(await runInstantExecutionReplayTest(scene, lifecycleStage));
  return Object.freeze(checks);
};

export const runPerformanceDiagnosticsLifecycleTests = async (
  engine: Engine,
  scene: Scene
): Promise<readonly SurvivalRuntimeLifecycleCheck[]> => {
  const scenario = Object.freeze({
    profile: "fixed-4200" as const,
    seed: V2_PERFORMANCE_DEFAULT_SEED,
    view: "courtyard" as const
  });
  await new Promise<void>((resolve) =>
    setTimeout(() => resolve(), 0)
  );
  const baseline = Object.freeze({
    ...captureObservableCounts("scene", scene),
    ...captureObservableCounts("engine", engine)
  });

  const exerciseDiagnostics = () => {
    const diagnostics = createV2PerformanceDiagnostics(
      engine,
      scene,
      scenario,
      V2_PERFORMANCE_ACCEPTANCE_POPULATION
    );
    try {
      diagnostics.beginFrame();
      diagnostics.finishFrame(1 / 60);
      return Object.freeze({
        ...captureObservableCounts("scene", scene),
        ...captureObservableCounts("engine", engine)
      });
    } finally {
      diagnostics.dispose();
    }
  };

  const firstActive = exerciseDiagnostics();
  await new Promise<void>((resolve) =>
    setTimeout(() => resolve(), 0)
  );
  const afterFirstDispose = Object.freeze({
    ...captureObservableCounts("scene", scene),
    ...captureObservableCounts("engine", engine)
  });

  const secondActive = exerciseDiagnostics();
  await new Promise<void>((resolve) =>
    setTimeout(() => resolve(), 0)
  );
  const afterSecondDispose = Object.freeze({
    ...captureObservableCounts("scene", scene),
    ...captureObservableCounts("engine", engine)
  });

  return Object.freeze([
    Object.freeze({
      name: "性能診断のScene・Engine Observableを破棄時に解除",
      ok:
        !observableCountsEqual(baseline, firstActive) &&
        observableCountsEqual(baseline, afterFirstDispose),
      detail:
        `baseline=${JSON.stringify(baseline)} / ` +
        `active=${JSON.stringify(firstActive)} / ` +
        `disposed=${JSON.stringify(afterFirstDispose)}`
    }),
    Object.freeze({
      name: "性能診断を同一Engine・Sceneで再生成して再利用",
      ok:
        observableCountsEqual(firstActive, secondActive) &&
        observableCountsEqual(baseline, afterSecondDispose),
      detail:
        `first=${JSON.stringify(firstActive)} / ` +
        `second=${JSON.stringify(secondActive)} / ` +
        `disposed=${JSON.stringify(afterSecondDispose)}`
    })
  ]);
};
