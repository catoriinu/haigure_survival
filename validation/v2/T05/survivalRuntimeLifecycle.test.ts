import {
  InstancedMesh,
  Vector3,
  type Engine,
  type Scene
} from "@babylonjs/core";

import type { PlayerVerticalState } from "../../../src/game/playerHeight";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import {
  createV2PerformanceDiagnostics,
  createV2SeededRandom,
  V2_PERFORMANCE_DEFAULT_SEED
} from "../../../src/v2/performanceDiagnostics";
import type { V2PlayerController } from "../../../src/v2/playerController";
import {
  createV2SurvivalRuntime,
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
  rootNodes: number;
}>;

type ObservableCounts = Readonly<Record<string, number>>;

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
    placeAt: (nextFootPosition) => {
      footPosition = nextFootPosition.clone();
      eyePosition = footPosition.add(
        new Vector3(0, (1 / 3) * eyeHeightScale, 0)
      );
    },
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
  stage: StageSpatialContext
) =>
  createV2SurvivalRuntime({
    scene,
    stage,
    player: createFakePlayer(stage),
    random: createV2SeededRandom(V2_PERFORMANCE_DEFAULT_SEED),
    population: V2_PERFORMANCE_ACCEPTANCE_POPULATION,
    performanceDiagnostics: null,
    performanceWorkloadScenario: null
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
    firstRuntime = createRuntime(scene, stage);
    const firstFrame = firstRuntime.getFrame();
    checks.push(
      Object.freeze({
        name: "実人口99/66/50の初期frameを構築",
        ok:
          firstFrame.npcCount === 99 &&
          firstFrame.brainwashedNpcCount === 66 &&
          firstFrame.bitCount === 50 &&
          !firstFrame.playerCompletionUnlocked,
        detail:
          `npc=${firstFrame.npcCount} / ` +
          `brainwashed=${firstFrame.brainwashedNpcCount} / ` +
          `bit=${firstFrame.bitCount} / ` +
          `completionUnlocked=${firstFrame.playerCompletionUnlocked}`
      })
    );
    await firstRuntime.prepareVisualResources();
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

    secondRuntime = createRuntime(scene, stage);
    const secondFrame = secondRuntime.getFrame();
    await secondRuntime.prepareVisualResources();
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
