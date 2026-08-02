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
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import type {
  V2NpcNavigationRouteContext
} from "../../../src/v2/npcSystem";
import {
  createV2PerformanceDiagnostics,
  createV2SeededRandom,
  V2_PERFORMANCE_DEFAULT_SEED,
  type V2PerformanceDiagnostics
} from "../../../src/v2/performanceDiagnostics";
import type { V2PlayerController } from "../../../src/v2/playerController";
import {
  createV2SurvivalRuntime,
  summarizeV2NpcHudCounts,
  summarizeV2TargetTracking,
  V2_PERFORMANCE_ACCEPTANCE_POPULATION,
  type V2SurvivalRuntime
} from "../../../src/v2/survivalRuntime";

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

const createFakePlayer = (
  stage: StageSpatialContext
): V2PlayerController => {
  const spawn = stage.markers
    .requireSingle("player_spawn")
    .node.getAbsolutePosition()
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
        verticalState
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

const createRuntime = (
  scene: Scene,
  stage: StageSpatialContext,
  getOrbVisibilityPredicate: () => (position: Vector3) => boolean,
  performanceDiagnostics: V2PerformanceDiagnostics | null = null
) =>
  createV2SurvivalRuntime({
    scene,
    stage,
    player: createFakePlayer(stage),
    random: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED),
    getOrbVisibilityPredicate,
    population: V2_PERFORMANCE_ACCEPTANCE_POPULATION,
    performanceDiagnostics,
    performanceWorkloadScenario: null,
    releaseStageTraversalForScriptedPhase: () => {},
    selectNavigationRoute: selectDistanceNavigationRoute
  });

export const runSurvivalRuntimeLifecycleTests = async (
  scene: Scene,
  stage: StageSpatialContext
): Promise<readonly SurvivalRuntimeLifecycleCheck[]> => {
  const checks: SurvivalRuntimeLifecycleCheck[] = [];
  const baseline = captureSceneResources(scene);
  let firstRuntime: V2SurvivalRuntime | null = null;
  let secondRuntime: V2SurvivalRuntime | null = null;

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
    const performanceDiagnostics =
      createV2PerformanceDiagnostics(
        scene.getEngine(),
        scene,
        Object.freeze({
          seed: V2_PERFORMANCE_DEFAULT_SEED,
          view: "courtyard"
        }),
        V2_PERFORMANCE_ACCEPTANCE_POPULATION
      );
    firstRuntime = createRuntime(
      scene,
      stage,
      () => {
        orbVisibilityPredicateFactoryCalls += 1;
        return () => true;
      },
      performanceDiagnostics
    );
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
    const firstUpdatedFrame = firstRuntime.update(1 / 60, 1 / 60, null);
    performanceDiagnostics.finishFrame();
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
    const npcPlayerTargets =
      performanceReport.cold.counters[
        "scenario.npc-player-targets"
      ];
    const bitPlayerTargets =
      performanceReport.cold.counters[
        "scenario.bit-player-targets"
      ];
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

    secondRuntime = createRuntime(scene, stage, () => () => true);
    const secondFrame = secondRuntime.getFrame();
    await secondRuntime.prepareVisualResources();
    secondRuntime.update(1 / 60, 1 / 60, null);
    const secondActive = captureSceneResources(scene);
    const secondDelta = subtractSceneResources(secondActive, baseline);
    secondRuntime.dispose();
    secondRuntime = null;
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
    const commandPlayer = createFakePlayer(stage);
    let commandRuntime: V2SurvivalRuntime | null = null;
    let commandCamera: FreeCamera | null = null;
    let initialCandidateCount = 0;
    let followVisible = false;
    let followVisibleBeforeTransition = false;
    let fireAccepted = false;
    let phaseAfterTransition = "playing";
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
      commandRuntime = createV2SurvivalRuntime({
        scene,
        stage,
        player: commandPlayer,
        random: gunNpcRandom,
        getOrbVisibilityPredicate: () => () => true,
        population: Object.freeze({
          npcCount: 1,
          initialBrainwashedNpcCount: 1,
          bitCount: 0
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

      commandRuntime.update(2, 2, null);
      commandRuntime.update(0.25, 2.25, null);
      commandRuntime.update(3.7, 5.95, null);
      const completionFrame = commandRuntime.update(0.06, 6.01, null);
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
      commandRuntime.update(2.85, 8.86, null);
      followVisibleBeforeTransition =
        commandRuntime.getNpcCommandCandidates().find(
          (entry) => entry.npcId === candidate.npcId
        )?.commandMode === "follow";
      fireAccepted = commandRuntime.requestPlayerGunFire(
        new Vector3(1, 0, 0)
      );
      const transitionFrame = commandRuntime.update(0.1, 8.96, null);
      phaseAfterTransition = transitionFrame.phase;
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
    firstRuntime?.dispose();
  }

  return Object.freeze(checks);
};

export const runPerformanceDiagnosticsLifecycleTests = async (
  engine: Engine,
  scene: Scene
): Promise<readonly SurvivalRuntimeLifecycleCheck[]> => {
  const scenario = Object.freeze({
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
      diagnostics.finishFrame();
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
