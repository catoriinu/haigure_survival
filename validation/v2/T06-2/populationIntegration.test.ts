import {
  NullEngine,
  Scene,
  StandardMaterial,
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
import { createSchoolRuntimeRandom } from "../../../src/world/schoolRuntimeSettings";
import { createStageBoundaryContainsQuery } from "../../../src/world/stageSpatialQueries";
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

const assertNear = (
  actual: number,
  expected: number,
  label: string
) => {
  assert(
    Math.abs(actual - expected) <= 1e-6,
    `${label}が不正です: expected=${expected}, actual=${actual}`
  );
};

const getRequiredMesh = (scene: Scene, name: string) => {
  const mesh = scene.getMeshByName(name);
  assert(mesh !== null, `Meshがありません: ${name}`);
  return mesh;
};

const getRequiredStandardMaterial = (scene: Scene, name: string) => {
  const material = scene.getMaterialByName(name);
  assert(
    material instanceof StandardMaterial,
    `StandardMaterialがありません: ${name}`
  );
  return material;
};

type BitSpawnVisualPhase = "fade-start" | "hold-start" | "shrink-start";

const assertBitSpawnVisualPhase = (
  scene: Scene,
  bitId: string,
  phase: BitSpawnVisualPhase,
  label: string
) => {
  const body = getRequiredMesh(scene, `${bitId}_body`);
  const muzzle = getRequiredMesh(scene, `${bitId}_muzzle`);
  const spawn = getRequiredMesh(scene, `${bitId}_spawn`);
  const spawnMaterial = getRequiredStandardMaterial(
    scene,
    `${bitId}_spawn_material`
  );
  const blackBodyMaterial = getRequiredStandardMaterial(
    scene,
    "v2BitBodyMaterial"
  );
  assert(
    spawn.material === spawnMaterial,
    `${label}の出現球に専用Materialが設定されていません。`
  );
  assert(
    spawnMaterial.diffuseColor.equals(
      blackBodyMaterial.diffuseColor
    ) &&
      spawnMaterial.emissiveColor.equals(
        blackBodyMaterial.emissiveColor
      ) &&
      spawnMaterial.specularColor.equals(
        blackBodyMaterial.specularColor
      ),
    `${label}の出現球が黒灰色Materialではありません。`
  );
  if (phase === "fade-start") {
    assertNear(spawnMaterial.alpha, 0, `${label} fade-start alpha`);
    assert(
      !body.isVisible && !muzzle.isVisible,
      `${label}のfade開始時にbodyまたはmuzzleが表示されています。`
    );
    return;
  }
  assertNear(spawnMaterial.alpha, 1, `${label} ${phase} alpha`);
  assert(
    body.isVisible && !muzzle.isVisible,
    `${label}の${phase}でbody/muzzle表示が不正です。`
  );
  assertNear(body.scaling.x, 1, `${label} ${phase} body scale X`);
  if (phase === "shrink-start") {
    assertNear(spawn.scaling.x, 1, `${label} shrink-start sphere scale`);
    assertNear(spawn.position.z, 0, `${label} shrink-start sphere Z`);
  }
};

const assertBitSpawnVisualCompleted = (
  scene: Scene,
  bitId: string,
  label: string
) => {
  const body = getRequiredMesh(scene, `${bitId}_body`);
  const muzzle = getRequiredMesh(scene, `${bitId}_muzzle`);
  assert(
    scene.getMeshByName(`${bitId}_spawn`) === null &&
      scene.getMaterialByName(`${bitId}_spawn_material`) === null,
    `${label}の完了後に一時Meshまたは専用Materialが残りました。`
  );
  assert(
    body.isVisible && muzzle.isVisible,
    `${label}の完了後にbodyまたはmuzzleが表示されません。`
  );
  assertNear(body.scaling.x, 1, `${label} 完了body scale X`);
  assertNear(muzzle.scaling.x, 1, `${label} 完了muzzle scale X`);
};

const assertNoBitSpawnTemporaryResources = (
  scene: Scene,
  label: string
) => {
  const spawnMeshes = scene.meshes.filter((mesh) =>
    /^v2_bit_\d+_spawn$/.test(mesh.name)
  );
  const spawnMaterials = scene.materials.filter((material) =>
    /^v2_bit_\d+_spawn_material$/.test(material.name)
  );
  assert(
    spawnMeshes.length === 0 && spawnMaterials.length === 0,
    `${label}の完了後にBIT出現一時資源が残りました: meshes=${spawnMeshes.map((mesh) => mesh.name).join(",") || "なし"} / materials=${spawnMaterials.map((material) => material.name).join(",") || "なし"}`
  );
};

const completeBitSpawnVisualsWithAssertions = (
  system: V2BitSystem,
  scene: Scene,
  bitIds: readonly string[],
  elapsedSeconds: number,
  targets: readonly V2HumanTargetSnapshot[],
  label: string,
  requireNoBeamRequests = false
) => {
  let elapsed = elapsedSeconds;
  elapsed += 0.5;
  updateBitSystem(system, 0.5, elapsed, targets);
  for (const bitId of bitIds) {
    assertBitSpawnVisualPhase(scene, bitId, "hold-start", label);
  }
  if (requireNoBeamRequests) {
    assert(
      system.getFrameView().beamRequests.length === 0,
      `${label}のfade完了時に発砲しました。`
    );
  }

  elapsed += 0.5;
  updateBitSystem(system, 0.5, elapsed, targets);
  for (const bitId of bitIds) {
    assertBitSpawnVisualPhase(scene, bitId, "shrink-start", label);
  }
  if (requireNoBeamRequests) {
    assert(
      system.getFrameView().beamRequests.length === 0,
      `${label}のhold完了時に発砲しました。`
    );
  }

  elapsed += 0.5;
  updateBitSystem(system, 0.5, elapsed, targets);
  for (const bitId of bitIds) {
    assertBitSpawnVisualCompleted(scene, bitId, label);
  }
  assertNoBitSpawnTemporaryResources(scene, label);
  if (requireNoBeamRequests) {
    assert(
      system.getFrameView().beamRequests.length === 0,
      `${label}のshrink完了時に発砲しました。`
    );
  }
  return elapsed;
};

const completeCurrentBitSpawnVisuals = (
  system: V2BitSystem,
  elapsedSeconds: number,
  targets: readonly V2HumanTargetSnapshot[] = EMPTY_TARGETS
) => {
  let elapsed = elapsedSeconds;
  for (const deltaSeconds of [0.5, 0.5, 0.5] as const) {
    elapsed += deltaSeconds;
    updateBitSystem(system, deltaSeconds, elapsed, targets);
  }
  return elapsed;
};

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

const testV1BitSpawnVisualLifecycle = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene);
  const baseline = countSceneResources(scene);
  const system = createBitSystem(scene, fixture, {
    initialBitCount: 1,
    maximumBitCount: 1,
    combatEnabled: true,
    random: () => 0
  });
  try {
    const initialFrame = system.getFrameView();
    assert(
      initialFrame.populationBitCount === 1 &&
        initialFrame.actorSpheres.length === 0 &&
        initialFrame.targetStates.length === 0 &&
        initialFrame.flightStates.length === 0,
      "出現演出中のBITが人口以外のFrame Viewへ公開されました。"
    );

    const body = getRequiredMesh(scene, "v2_bit_0_body");
    const muzzle = getRequiredMesh(scene, "v2_bit_0_muzzle");
    const spawn = getRequiredMesh(scene, "v2_bit_0_spawn");
    const spawnMaterial = getRequiredStandardMaterial(
      scene,
      "v2_bit_0_spawn_material"
    );
    const blackBodyMaterial = getRequiredStandardMaterial(
      scene,
      "v2BitBodyMaterial"
    );
    const redBodyMaterial = getRequiredStandardMaterial(
      scene,
      "v2RedBitBodyMaterial"
    );
    assert(
      body.material === redBodyMaterial,
      "赤BITを作る前提を満たしていません。"
    );
    assert(
      spawnMaterial.diffuseColor.equals(
        blackBodyMaterial.diffuseColor
      ) &&
        spawnMaterial.emissiveColor.equals(
          blackBodyMaterial.emissiveColor
        ),
      "赤BITの出現球が常時黒灰色ではありません。"
    );
    assert(
      !body.isVisible && !muzzle.isVisible,
      "fade-in開始時にBIT本体またはmuzzleが表示されています。"
    );
    assertNear(spawnMaterial.alpha, 0, "fade-in開始alpha");

    updateBitSystem(system, 0.25, 0.25);
    assertNear(spawnMaterial.alpha, 0.5, "fade-in中間alpha");
    assert(
      !body.isVisible && !muzzle.isVisible,
      "fade-in中間でBIT本体またはmuzzleが表示されています。"
    );

    updateBitSystem(system, 0.25, 0.5);
    assertNear(spawnMaterial.alpha, 1, "fade-in完了alpha");
    assert(
      body.isVisible && !muzzle.isVisible,
      "hold開始時の本体・muzzle表示がV1と一致しません。"
    );
    assertNear(body.scaling.x, 1, "hold開始body scale X");

    updateBitSystem(system, 0.5, 1);
    assertNear(spawn.scaling.x, 1, "shrink開始sphere scale");
    assertNear(spawn.position.z, 0, "shrink開始sphere Z");

    updateBitSystem(system, 0.25, 1.25);
    assertNear(
      spawn.scaling.x,
      1 - (1 - 0.04 / 0.22) * 0.5,
      "shrink中間sphere scale"
    );
    assertNear(spawn.position.z, 0.095 * 0.5, "shrink中間sphere Z");
    assert(
      system.getFrameView().actorSpheres.length === 0,
      "shrink中のBITがactorとして公開されました。"
    );

    updateBitSystem(system, 0.25, 1.5);
    const completedFrame = system.getFrameView();
    assert(
      scene.getMeshByName("v2_bit_0_spawn") === null &&
        scene.getMaterialByName("v2_bit_0_spawn_material") === null,
      "spawn完了後に一時Meshまたは専用Materialが残りました。"
    );
    assert(
      body.isVisible && muzzle.isVisible,
      "spawn完了後にBIT本体またはmuzzleが表示されません。"
    );
    assert(
      completedFrame.populationBitCount === 1 &&
        completedFrame.actorSpheres.length === 1 &&
        completedFrame.targetStates.length === 1 &&
        completedFrame.flightStates.length === 1 &&
        completedFrame.beamRequests.length === 0,
      "spawn完了後のFrame View公開が不正です。"
    );

    system.dispose();
    assert(
      sceneResourceCountsEqual(baseline, countSceneResources(scene)),
      "BIT spawn演出完了後の破棄でScene資源が残留しました。"
    );
    return "0.5s fade + 0.5s hold + 0.5s shrink / black sphere / delayed actor publication";
  } finally {
    if (!sceneResourceCountsEqual(baseline, countSceneResources(scene))) {
      system.dispose();
    }
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
};

const testPrepareForScriptedPhaseFinalizesPendingSpawn = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene);
  const baseline = countSceneResources(scene);
  const system = createBitSystem(scene, fixture, {
    initialBitCount: 1,
    maximumBitCount: 1,
    combatEnabled: false,
    random: () => 0.5
  });
  try {
    assertBitSpawnVisualPhase(
      scene,
      "v2_bit_0",
      "fade-start",
      "scripted phase初回"
    );
    assert(
      system.getFrameView().populationBitCount === 1 &&
        system.getFrameView().actorSpheres.length === 0,
      "scripted phase準備前のpending公開状態が不正です。"
    );

    system.prepareForScriptedPhase();
    const firstPreparedFrame = system.getFrameView();
    assertBitSpawnVisualCompleted(
      scene,
      "v2_bit_0",
      "scripted phase初回"
    );
    assertNoBitSpawnTemporaryResources(scene, "scripted phase初回");
    assert(
      firstPreparedFrame.populationBitCount === 1 &&
        firstPreparedFrame.actorSpheres.length === 1 &&
        firstPreparedFrame.targetStates.length === 1 &&
        firstPreparedFrame.flightStates.length === 1,
      "prepareForScriptedPhase後にpending BITが公開されません。"
    );
    const firstPreparedResources = countSceneResources(scene);

    system.prepareForScriptedPhase();
    const repeatedFrame = system.getFrameView();
    assertBitSpawnVisualCompleted(
      scene,
      "v2_bit_0",
      "scripted phase再呼出し"
    );
    assertNoBitSpawnTemporaryResources(scene, "scripted phase再呼出し");
    assert(
      repeatedFrame.populationBitCount === 1 &&
        repeatedFrame.actorSpheres.length === 1 &&
        repeatedFrame.actorSpheres[0].id ===
          firstPreparedFrame.actorSpheres[0].id &&
        sceneResourceCountsEqual(
          firstPreparedResources,
          countSceneResources(scene)
        ),
      "prepareForScriptedPhase再呼出しで公開BITまたはScene資源が変化しました。"
    );

    system.dispose();
    assert(
      sceneResourceCountsEqual(baseline, countSceneResources(scene)),
      "scripted phase準備後のdisposeでScene資源が残留しました。"
    );
    return "pending resource removed / actor published / repeated prepare stable / dispose clean";
  } finally {
    if (!sceneResourceCountsEqual(baseline, countSceneResources(scene))) {
      system.dispose();
    }
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
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

const testNpcSpawnSeedDeterminism = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene, {
    selectedExcludes: () => false,
    otherExcludes: () => true
  });
  const visuals = await createDefaultV2CharacterVisualRuntime(
    scene,
    Object.freeze(["player", "npc_0", "npc_1", "npc_2", "npc_3"])
  );
  const captureSignature = (seed: number) => {
    const system = createV2NpcSystem({
      scene,
      stage: fixture.stage,
      characterVisuals: visuals,
      npcCount: 4,
      initialBrainwashedNpcCount: 2,
      diagnosticsEnabled: false,
      random: createSchoolRuntimeRandom(seed, "core"),
      spawnRandom: createSchoolRuntimeRandom(seed, "npc-spawn"),
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
      return Object.freeze({
        statusSignature: targets
          .map((target) =>
            `${target.id}:${target.state}:${target.brainwashed}`
          )
          .join("|"),
        brainwashedFlags: Object.freeze(
          targets.map((target) => target.brainwashed)
        ),
        positionSignature: targets
          .map((target) =>
            [
              target.id,
              target.footPosition.x.toFixed(6),
              target.footPosition.y.toFixed(6),
              target.footPosition.z.toFixed(6)
            ].join(":")
          )
          .join("|")
      });
    } finally {
      system.dispose();
    }
  };

  try {
    const first = captureSignature(0);
    const repeated = captureSignature(0);
    const different = captureSignature(10);
    assert(
      first.statusSignature === repeated.statusSignature &&
        first.positionSignature === repeated.positionSignature,
      "同じNPC spawn seedで位置またはstatusが再現されません。"
    );
    assert(
      first.positionSignature !== different.positionSignature &&
        first.statusSignature !== different.statusSignature,
      "異なるsession seedでNPCの位置または洗脳済みstatus内訳が変化しません。"
    );
    assert(
      first.brainwashedFlags.join("|") === "true|true|false|false" &&
        different.brainwashedFlags.join("|") ===
          "true|true|false|false",
      "初期洗脳NPC先行・通常NPC後続のstatus契約が変化しました。"
    );
    return "same-seed position/status stable / different-seed position+brainwashed-status changed / status order fixed";
  } finally {
    visuals.dispose();
    fixture.dispose();
    scene.dispose();
    engine.dispose();
  }
};

const testNpcBiasPopulation50AndSessionLifecycle = async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const fixture = createSyntheticStageFixture(scene, {
    selectedExcludes: (point) => point.x < -4,
    otherExcludes: (point) => point.x > 4
  });
  const actorIds = Object.freeze([
    "player",
    ...Array.from({ length: 50 }, (_value, index) => `npc_${index}`)
  ]);
  const visuals = await createDefaultV2CharacterVisualRuntime(
    scene,
    actorIds
  );
  const baseline = countSceneResources(scene);
  const capture = (
    seed: number,
    playerSpawn: SyntheticStageFixture["selectedPlayerSpawn"]
  ) => {
    fixture.queriedExclusionIds.length = 0;
    const system = createV2NpcSystem({
      scene,
      stage: fixture.stage,
      characterVisuals: visuals,
      npcCount: 50,
      initialBrainwashedNpcCount: 10,
      diagnosticsEnabled: false,
      random: createSchoolRuntimeRandom(seed, "core"),
      spawnRandom: createSchoolRuntimeRandom(seed, "npc-spawn"),
      playerSpawn,
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
      const activeBiasContains = playerSpawn.npcSpawnBiasVolumes.map(
        (volume) => createStageBoundaryContainsQuery(volume.mesh)
      );
      const isInsideActiveBias = (position: Vector3) =>
        activeBiasContains.some((contains) => contains(position));
      const signature = targets
        .map((target) =>
          [
            target.id,
            target.state,
            target.brainwashed,
            target.footPosition.x.toFixed(6),
            target.footPosition.y.toFixed(6),
            target.footPosition.z.toFixed(6)
          ].join(":")
        )
        .join("|");
      return Object.freeze({
        signature,
        totalCount: targets.length,
        brainwashedCount: targets.filter((target) => target.brainwashed)
          .length,
        brainwashedInsideBiasCount: targets
          .slice(0, 10)
          .filter((target) => isInsideActiveBias(target.footPosition)).length,
        normalInsideBiasCount: targets
          .slice(10)
          .filter((target) => isInsideActiveBias(target.footPosition)).length,
        brainwashedOutsideSelectedExclusion: targets
          .slice(0, 10)
          .every((target) =>
            playerSpawn.id === fixture.selectedPlayerSpawn.id
              ? target.footPosition.x >= -4
              : target.footPosition.x <= 4
          ),
        brainwashedFirst:
          targets.slice(0, 10).every((target) => target.brainwashed) &&
          targets.slice(10).every((target) => !target.brainwashed),
        queriedExclusionIds: Object.freeze([
          ...fixture.queriedExclusionIds
        ])
      });
    } finally {
      system.dispose();
    }
  };

  try {
    const seed = 0x0620_2c50;
    const selected = capture(seed, fixture.selectedPlayerSpawn);
    assert(
      sceneResourceCountsEqual(baseline, countSceneResources(scene)),
      "50 NPCの最初のsession破棄後にScene資源が残りました。"
    );
    const repeated = capture(seed, fixture.selectedPlayerSpawn);
    assert(
      sceneResourceCountsEqual(baseline, countSceneResources(scene)),
      "50 NPCの同seed再生成破棄後にScene資源が残りました。"
    );
    const switched = capture(seed, fixture.otherPlayerSpawn);
    assert(
      sceneResourceCountsEqual(baseline, countSceneResources(scene)),
      "Player開始ID切替sessionの破棄後にScene資源が残りました。"
    );

    for (const [label, snapshot, playerSpawn] of [
      ["selected", selected, fixture.selectedPlayerSpawn],
      ["repeated", repeated, fixture.selectedPlayerSpawn],
      ["switched", switched, fixture.otherPlayerSpawn]
    ] as const) {
      assert(
        snapshot.totalCount === 50 &&
          snapshot.brainwashedCount === 10 &&
          snapshot.brainwashedFirst &&
          snapshot.brainwashedOutsideSelectedExclusion &&
          snapshot.brainwashedInsideBiasCount > 0 &&
          snapshot.brainwashedInsideBiasCount < 10 &&
          snapshot.normalInsideBiasCount > 0 &&
          snapshot.normalInsideBiasCount < 40,
        `${label}の50/10または両cohort bias分布が不正です: ${JSON.stringify(snapshot)}`
      );
      assert(
        snapshot.queriedExclusionIds.length >= 10 &&
          snapshot.queriedExclusionIds.every(
            (id) => id === playerSpawn.exclusionVolume.id
          ),
        `${label}で非選択Player除外を照会しました: ${snapshot.queriedExclusionIds.join(",")}`
      );
    }
    assert(
      selected.signature === repeated.signature,
      "同じsession seedとPlayer開始IDで50 NPCの位置・statusが再現されません。"
    );
    assert(
      selected.signature !== switched.signature,
      "同じNPC乱数列のPlayer開始ID切替で50 NPC配置が変化しません。"
    );
    return (
      `50/10 / selected bias=${selected.brainwashedInsideBiasCount}+${selected.normalInsideBiasCount} / ` +
      `switched bias=${switched.brainwashedInsideBiasCount}+${switched.normalInsideBiasCount} / ` +
      `same-seed stable / dispose baseline`
    );
  } finally {
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
    system.prepareForScriptedPhase();
    assertNoBitSpawnTemporaryResources(scene, "時間増援開始前");
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
    const timedPendingFrame = system.getFrameView();
    assert(
      timedPendingFrame.populationBitCount === 2 &&
        timedPendingFrame.actorSpheres.length === 1,
      "playing中の10秒境界でpending時間増援が1機追加されませんでした。"
    );
    assertBitSpawnVisualPhase(
      scene,
      "v2_bit_1",
      "fade-start",
      "時間増援"
    );
    const reinforcementExclusionQueryCount =
      fixture.queriedExclusionIds.length;
    assert(
      reinforcementExclusionQueryCount > initialExclusionQueryCount,
      "時間増援で選択開始地点の除外Volumeを照会していません。"
    );

    const timedSpawnCompletedElapsedSeconds =
      completeBitSpawnVisualsWithAssertions(
        system,
        scene,
        Object.freeze(["v2_bit_1"]),
        40,
        EMPTY_TARGETS,
        "時間増援"
      );
    assert(
      system.getFrameView().actorSpheres.length === 2,
      "時間増援の演出完了後にactorが公開されません。"
    );

    updateBitSystem(
      system,
      30,
      timedSpawnCompletedElapsedSeconds + 30
    );
    assert(
      system.getFrameView().populationBitCount === 3,
      "大deltaでcatch-up burstしたか、1機増援されませんでした。"
    );
    updateBitSystem(
      system,
      30,
      timedSpawnCompletedElapsedSeconds + 60
    );
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
    let elapsedSeconds = completeCurrentBitSpawnVisuals(system, 0);
    const leader = system.getFrameView().actorSpheres[0];
    assert(leader !== undefined, "Alert検証の初期BITがありません。");
    const target = createTarget(
      "alert-target",
      leader.center.add(new Vector3(-1, -leader.center.y, 0)),
      leader.center.add(new Vector3(-1, 0, 0))
    );
    const queryCountBeforeAlert = fixture.queriedExclusionIds.length;
    const targets = Object.freeze([target]);
    elapsedSeconds += 0.2;
    updateBitSystem(system, 0.2, elapsedSeconds, targets);
    const pendingAlertFrame = system.getFrameView();
    assert(
      pendingAlertFrame.populationBitCount === 2 &&
        pendingAlertFrame.actorSpheres.length === 1 &&
        pendingAlertFrame.targetStates.some(
          (state) => state.mode === "alert-send"
        ) &&
        !pendingAlertFrame.targetStates.some(
          (state) => state.mode === "alert-receive"
        ) &&
        scene.getMeshByName("v2_bit_1_spawn") !== null,
      `Alert BITが人口へ即算入されないか、演出中に公開されました: population=${pendingAlertFrame.populationBitCount} / actors=${pendingAlertFrame.actorSpheres.length} / modes=${pendingAlertFrame.targetStates.map((state) => state.mode).join(",")}`
    );
    assertBitSpawnVisualPhase(
      scene,
      "v2_bit_1",
      "fade-start",
      "内部Alert増援"
    );
    assert(
      fixture.queriedExclusionIds.length > queryCountBeforeAlert,
      "Alert BIT生成で選択開始地点の除外Volumeを照会していません。"
    );
    elapsedSeconds = completeBitSpawnVisualsWithAssertions(
      system,
      scene,
      Object.freeze(["v2_bit_1"]),
      elapsedSeconds,
      targets,
      "内部Alert増援"
    );
    const completedAlertFrame = system.getFrameView();
    assert(
      completedAlertFrame.actorSpheres.length === 2 &&
        completedAlertFrame.targetStates.some(
          (state) => state.mode === "alert-receive"
        ) &&
        scene.getMeshByName("v2_bit_1_spawn") === null &&
        scene.getMaterialByName("v2_bit_1_spawn_material") === null,
      `Alert BITの演出完了後公開が不正です: actors=${completedAlertFrame.actorSpheres.length} / modes=${completedAlertFrame.targetStates.map((state) => state.mode).join(",")}`
    );
    updateBitSystem(system, 10, elapsedSeconds + 10, targets);
    assert(
      system.getFrameView().populationBitCount === 2,
      "Alert BITを上限算入せず時間増援が追加されました。"
    );
    assertOnlySelectedExclusionWasQueried(fixture, 1);
    return (
      `pendingPopulation=${pendingAlertFrame.populationBitCount} / ` +
      `completedModes=${completedAlertFrame.targetStates.map((state) => state.mode).join(",")}`
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
    let elapsedSeconds = completeCurrentBitSpawnVisuals(system, 0);
    const leader = system.getFrameView().actorSpheres[0];
    assert(leader !== undefined, "絨毯僚機検証の初期BITがありません。");
    const target = createTarget(
      "carpet-target",
      leader.center.add(new Vector3(-1, -leader.center.y, 0)),
      leader.center.add(new Vector3(-1, 0, 0))
    );
    const targets = Object.freeze([target]);
    elapsedSeconds += 0.2;
    updateBitSystem(system, 0.2, elapsedSeconds, targets);
    assert(
      system.getFrameView().beamRequests.length === 0,
      "絨毯mode選択直後の0.2秒updateで発砲しました。"
    );
    elapsedSeconds += 0.1;
    updateBitSystem(system, 0.1, elapsedSeconds, targets);
    const pendingCarpetFrame = system.getFrameView();
    assert(
      pendingCarpetFrame.populationBitCount === 1 &&
        pendingCarpetFrame.actorSpheres.length === 1 &&
        pendingCarpetFrame.beamRequests.length === 0 &&
        scene.getMeshByName("v2_bit_1_spawn") !== null &&
        scene.getMeshByName("v2_bit_2_spawn") !== null,
      `絨毯僚機が人口上限から除外されないか、演出中に公開されました: population=${pendingCarpetFrame.populationBitCount} / actors=${pendingCarpetFrame.actorSpheres.length}`
    );
    for (const bitId of ["v2_bit_1", "v2_bit_2"] as const) {
      assertBitSpawnVisualPhase(
        scene,
        bitId,
        "fade-start",
        "絨毯僚機"
      );
    }
    elapsedSeconds = completeBitSpawnVisualsWithAssertions(
      system,
      scene,
      Object.freeze(["v2_bit_1", "v2_bit_2"]),
      elapsedSeconds,
      targets,
      "絨毯僚機",
      true
    );
    updateBitSystem(system, 0, elapsedSeconds, targets);
    const completedCarpetFrame = system.getFrameView();
    assert(
      completedCarpetFrame.populationBitCount === 1 &&
        completedCarpetFrame.actorSpheres.length === 3 &&
        completedCarpetFrame.targetStates.filter(
          (state) => state.mode === "carpet-follower"
        ).length === 2 &&
        scene.getMaterialByName("v2_bit_1_spawn_material") === null &&
        scene.getMaterialByName("v2_bit_2_spawn_material") === null,
      `絨毯僚機の演出完了後公開が不正です: population=${completedCarpetFrame.populationBitCount} / actors=${completedCarpetFrame.actorSpheres.length} / modes=${completedCarpetFrame.targetStates.map((state) => state.mode).join(",")}`
    );
    updateBitSystem(system, 10, elapsedSeconds + 10, targets);
    assert(
      system.getFrameView().populationBitCount === 2,
      "絨毯僚機を人口へ誤算入し、通常増援が阻害されました。"
    );
    return (
      `population=${completedCarpetFrame.populationBitCount} / ` +
      `actors=${completedCarpetFrame.actorSpheres.length} / followers=2`
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
      "V1相当BIT出現演出・遅延公開・専用資源破棄",
      testV1BitSpawnVisualLifecycle
    ),
    await executeTest(
      "scripted phaseのpending即時完了・冪等性・破棄",
      testPrepareForScriptedPhaseFinalizesPendingSpawn
    ),
    await executeTest(
      "洗脳済みNPC先行・選択開始地点だけの除外",
      testBrainwashedNpcOrderAndSelectedExclusion
    ),
    await executeTest(
      "NPC開始位置・statusのsession seed決定性",
      testNpcSpawnSeedDeterminism
    ),
    await executeTest(
      "NPC 50/初期洗脳10のbias両cohort・Player切替・再生成破棄",
      testNpcBiasPopulation50AndSessionLifecycle
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
