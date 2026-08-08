import {
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  createV2BitSystem,
  type V2BitSystem
} from "../../../src/v2/bitSystem";
import type {
  V2ExternalAlert,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import {
  createV2NpcSystem
} from "../../../src/v2/npcSystem";
import {
  DISTANCE_NAVIGATION_ROUTE_POLICY
} from "../../../src/world/navigationWorld";
import {
  createDefaultV2CharacterVisualRuntime
} from "../characterVisualFixture";
import {
  countSceneResources,
  createSyntheticStageFixture,
  sceneResourceCountsEqual,
  type SyntheticStageFixture
} from "./runtimeFixture";
import {
  assert,
  captureThrownMessage,
  createSeededRandom,
  createSequenceRandom,
  executeTest
} from "./testUtils";

const EMPTY_TARGETS: readonly V2HumanTargetSnapshot[] = Object.freeze([]);
const EMPTY_ALERTS: readonly V2ExternalAlert[] = Object.freeze([]);

const createTarget = (
  id: string,
  footPosition: Vector3,
  aimPosition: Vector3
): V2HumanTargetSnapshot =>
  Object.freeze({
    id,
    kind: "player" as const,
    footPosition,
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: new Vector3(0.2, 0.4, 0.2)
    }),
    state: "normal" as const,
    alive: true,
    brainwashed: false
  });

const updateBitSystem = (
  system: V2BitSystem,
  deltaSeconds: number,
  elapsedSeconds: number,
  targets: readonly V2HumanTargetSnapshot[] = EMPTY_TARGETS,
  externalAlerts: readonly V2ExternalAlert[] = EMPTY_ALERTS
) => {
  system.update({
    deltaSeconds,
    elapsedSeconds,
    targets,
    externalAlerts
  });
};

const createBitSystem = (
  scene: Scene,
  fixture: SyntheticStageFixture,
  input: Readonly<{
    initialBitCount: number;
    maximumBitCount: number;
    combatEnabled: boolean;
    random: () => number;
    spawnRandom?: () => number;
    spawnMaxAttempts?: number;
  }>
) =>
  createV2BitSystem(scene, fixture.stage, {
    initialBitCount: input.initialBitCount,
    reinforcementIntervalSeconds: 10,
    maximumBitCount: input.maximumBitCount,
    minimumSpawnDistance: 0.05,
    spawnMaxAttempts: input.spawnMaxAttempts ?? 512,
    spawnProjectionMaxDistance: 0.75,
    combatEnabled: input.combatEnabled,
    random: input.random,
    spawnRandom: input.spawnRandom ?? createSeededRandom(0x0620_2b17),
    playerSpawn: fixture.selectedPlayerSpawn,
    resolveTargetNavigationArea: (target) =>
      Object.freeze({
        targetId: target.id,
        areaId: "t06-2-area",
        revision: 0,
        anchor: target.footPosition.clone()
      })
  });

const assertOnlySelectedExclusionWasQueried = (
  fixture: SyntheticStageFixture,
  minimumQueryCount: number
) => {
  assert(
    fixture.queriedExclusionIds.length >= minimumQueryCount,
    `選択開始地点の除外照会が不足しています: ${fixture.queriedExclusionIds.length}`
  );
  const unexpectedIds = fixture.queriedExclusionIds.filter(
    (id) => id !== fixture.selectedPlayerSpawn.exclusionVolume.id
  );
  assert(
    unexpectedIds.length === 0,
    `非選択開始地点の除外Volumeが照会されました: ${unexpectedIds.join(",")}`
  );
};

const testBrainwashedNpcOrderAndSelectedExclusion = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene, {
    selectedExcludes: (point) => point.x < 0,
    otherExcludes: (point) => point.x >= 0
  });
  const visuals = await createDefaultV2CharacterVisualRuntime(
    scene,
    Object.freeze(["player", "npc_0", "npc_1", "npc_2", "npc_3"])
  );
  const system = createV2NpcSystem({
    scene,
    stage: fixture.stage,
    characterVisuals: visuals,
    npcCount: 4,
    initialBrainwashedNpcCount: 2,
    diagnosticsEnabled: false,
    random: () => 0.5,
    spawnRandom: createSeededRandom(0x0620_2c18),
    playerSpawn: fixture.selectedPlayerSpawn,
    resolveTargetNavigationArea: (target) =>
      Object.freeze({
        targetId: target.id,
        areaId: "t06-2-area",
        revision: 0,
        anchor: target.footPosition.clone()
      }),
    selectNavigationRoute: (_context, candidates) =>
      DISTANCE_NAVIGATION_ROUTE_POLICY.selectRoute(candidates)
  });
  try {
    const targets = system.getFrameView().targets;
    assert(
      targets.map((target) => target.id).join("|") ===
        "npc_0|npc_1|npc_2|npc_3",
      `NPC初期順序が不正です: ${targets.map((target) => target.id).join(",")}`
    );
    assert(
      targets.slice(0, 2).every(
        (target) => target.brainwashed && target.footPosition.x >= 0
      ),
      "洗脳済みNPCが先行配置されていないか、選択地点除外内にいます。"
    );
    assert(
      targets.slice(2).every((target) => !target.brainwashed),
      "通常NPCが洗脳済みNPCより前に配置されました。"
    );
    assertOnlySelectedExclusionWasQueried(fixture, 1);
    return (
      `order=${targets.map((target) => `${target.id}:${target.brainwashed}`).join(",")} / ` +
      `exclusionQueries=${fixture.queriedExclusionIds.length}`
    );
  } finally {
    system.dispose();
    visuals.dispose();
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
};

const testTimedReinforcementPauseCapAndLifecycle = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene, {
    selectedExcludes: () => false,
    otherExcludes: () => true
  });
  const baseline = countSceneResources(scene);
  const createSystem = () =>
    createBitSystem(scene, fixture, {
      initialBitCount: 1,
      maximumBitCount: 3,
      combatEnabled: false,
      random: () => 0.5
    });
  let system = createSystem();
  try {
    assert(
      system.getFrameView().populationBitCount === 1,
      "初期BIT数が1機ではありません。"
    );
    const initialExclusionQueryCount = fixture.queriedExclusionIds.length;

    system.setAiSuspended(true);
    updateBitSystem(system, 30, 30);
    assert(
      system.getFrameView().populationBitCount === 1,
      "non-playing相当のAI停止中に増援タイマーが進みました。"
    );

    system.setAiSuspended(false);
    updateBitSystem(system, 9.999, 39.999);
    assert(
      system.getFrameView().populationBitCount === 1,
      "10秒境界より前にBIT増援が出現しました。"
    );
    updateBitSystem(system, 0.001, 40);
    assert(
      system.getFrameView().populationBitCount === 2,
      "playing中の10秒境界でBITが1機増援されませんでした。"
    );
    const reinforcementExclusionQueryCount =
      fixture.queriedExclusionIds.length;
    assert(
      reinforcementExclusionQueryCount > initialExclusionQueryCount,
      "時間増援で選択開始地点の除外Volumeを照会していません。"
    );

    updateBitSystem(system, 30, 70);
    assert(
      system.getFrameView().populationBitCount === 3,
      "大deltaでcatch-up burstしたか、1機増援されませんでした。"
    );
    updateBitSystem(system, 30, 100);
    assert(
      system.getFrameView().populationBitCount === 3,
      "最大BIT数を超えて増援されました。"
    );
    assertOnlySelectedExclusionWasQueried(fixture, 1);

    system.dispose();
    assert(
      sceneResourceCountsEqual(baseline, countSceneResources(scene)),
      "BIT System破棄後にScene資源が残留しました。"
    );
    system = createSystem();
    assert(
      system.getFrameView().populationBitCount === 1,
      "同一SceneでのBIT System再生成が初期1機へ戻りません。"
    );
    system.dispose();
    assert(
      sceneResourceCountsEqual(baseline, countSceneResources(scene)),
      "BIT System再生成・再破棄後にScene資源が残留しました。"
    );
    return (
      `count=1>2>3 / paused=30s / catchUp=1 / ` +
      `exclusionQueries=${reinforcementExclusionQueryCount}`
    );
  } finally {
    if (!sceneResourceCountsEqual(baseline, countSceneResources(scene))) {
      system.dispose();
    }
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
};

const testAlertPopulationCountsTowardCap = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene);
  const random = createSequenceRandom(
    [0.5, 0.5, 0.5, 0.5, 0.85],
    0.5
  );
  const system = createBitSystem(scene, fixture, {
    initialBitCount: 1,
    maximumBitCount: 2,
    combatEnabled: true,
    random: random.random
  });
  try {
    const leader = system.getFrameView().actorSpheres[0];
    assert(leader !== undefined, "Alert検証の初期BITがありません。");
    const target = createTarget(
      "alert-target",
      leader.center.add(new Vector3(-1, -leader.center.y, 0)),
      leader.center.add(new Vector3(-1, 0, 0))
    );
    const queryCountBeforeAlert = fixture.queriedExclusionIds.length;
    updateBitSystem(system, 0, 0, Object.freeze([target]));
    const alertFrame = system.getFrameView();
    assert(
      alertFrame.populationBitCount === 2 &&
        alertFrame.actorSpheres.length === 2 &&
        alertFrame.targetStates.some((state) => state.mode === "alert-send") &&
        alertFrame.targetStates.some((state) => state.mode === "alert-receive"),
      `通常+Alert人口が上限2へ算入されません: population=${alertFrame.populationBitCount} / actors=${alertFrame.actorSpheres.length} / modes=${alertFrame.targetStates.map((state) => state.mode).join(",")}`
    );
    assert(
      fixture.queriedExclusionIds.length > queryCountBeforeAlert,
      "Alert BIT生成で選択開始地点の除外Volumeを照会していません。"
    );
    updateBitSystem(system, 10, 10, Object.freeze([target]));
    assert(
      system.getFrameView().populationBitCount === 2,
      "Alert BITを上限算入せず時間増援が追加されました。"
    );
    assertOnlySelectedExclusionWasQueried(fixture, 1);
    return (
      `population=${alertFrame.populationBitCount} / ` +
      `modes=${alertFrame.targetStates.map((state) => state.mode).join(",")}`
    );
  } finally {
    system.dispose();
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
};

const testBitSpawnRejectsSafeCenterOutsideVolume = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene, {
    bitSpawnBounds: Object.freeze({ centerY: 0, height: 1 })
  });
  try {
    const message = captureThrownMessage(() => {
      const system = createBitSystem(scene, fixture, {
        initialBitCount: 1,
        maximumBitCount: 1,
        combatEnabled: false,
        random: () => 0.5,
        spawnRandom: () => 0.5,
        spawnMaxAttempts: 1
      });
      system.dispose();
    });
    assert(
      message === "bit_spawnの1点目を1回以内に生成できませんでした。",
      `safeCenterHeightがVolume外の候補を拒否しませんでした: ${message ?? "例外なし"}`
    );
    return "NavMesh面Y=0は内包 / safeCenterHeight=1.2はVolume外として拒否";
  } finally {
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
};

const testCarpetFollowersExcludedFromCap = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene);
  const random = createSequenceRandom([0.5, 0.5, 0.5, 0.05], 0.5);
  const system = createBitSystem(scene, fixture, {
    initialBitCount: 1,
    maximumBitCount: 2,
    combatEnabled: false,
    random: random.random
  });
  try {
    const leader = system.getFrameView().actorSpheres[0];
    assert(leader !== undefined, "絨毯僚機検証の初期BITがありません。");
    const target = createTarget(
      "carpet-target",
      leader.center.add(new Vector3(-1, -leader.center.y, 0)),
      leader.center.add(new Vector3(-1, 0, 0))
    );
    const targets = Object.freeze([target]);
    updateBitSystem(system, 0, 0, targets);
    updateBitSystem(system, 0.1, 0.1, targets);
    const carpetFrame = system.getFrameView();
    assert(
      carpetFrame.populationBitCount === 1 &&
        carpetFrame.actorSpheres.length === 3 &&
        carpetFrame.targetStates.filter(
          (state) => state.mode === "carpet-follower"
        ).length === 2,
      `絨毯僚機が人口上限から除外されません: population=${carpetFrame.populationBitCount} / actors=${carpetFrame.actorSpheres.length} / modes=${carpetFrame.targetStates.map((state) => state.mode).join(",")}`
    );
    updateBitSystem(system, 10, 10.1, targets);
    assert(
      system.getFrameView().populationBitCount === 2,
      "絨毯僚機を人口へ誤算入し、通常増援が阻害されました。"
    );
    return (
      `population=${carpetFrame.populationBitCount} / ` +
      `actors=${carpetFrame.actorSpheres.length} / followers=2`
    );
  } finally {
    system.dispose();
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
};

export const runPopulationIntegrationTests = async () =>
  Object.freeze([
    await executeTest(
      "洗脳済みNPC先行・選択開始地点だけの除外",
      testBrainwashedNpcOrderAndSelectedExclusion
    ),
    await executeTest(
      "初期1機・10秒増援・最大数・停止・catch-up禁止・再生成破棄",
      testTimedReinforcementPauseCapAndLifecycle
    ),
    await executeTest(
      "通常BITとAlert BITの共通上限算入",
      testAlertPopulationCountsTowardCap
    ),
    await executeTest(
      "BIT投影後safeCenterHeightのVolume内包判定",
      testBitSpawnRejectsSafeCenterOutsideVolume
    ),
    await executeTest(
      "絨毯僚機の人口上限除外",
      testCarpetFollowersExcludedFromCap
    )
  ]);
