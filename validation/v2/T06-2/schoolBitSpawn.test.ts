import { NullEngine, Scene, Vector3 } from "@babylonjs/core";

import schoolGlbUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.glb?url";
import schoolNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin?url";
import schoolBitNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin?url";
import schoolRoomVariantNavmeshUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin?url";
import {
  createV2BitSystem,
  V2_BIT_INDOOR_SPAWN_PROBABILITY,
  type V2BitFlightState
} from "../../../src/v2/bitSystem";
import { selectV2PlayerSpawn } from "../../../src/v2/schoolSpawnSelection";
import { createBitFlightSafety } from "../../../src/world/bitFlightSafety";
import { SCHOOL_STAGE, type StageCatalogEntry } from "../../../src/world/stageCatalog";
import {
  createSchoolRuntimeRandom,
  createSchoolRoomVariantSelections,
  DEFAULT_SCHOOL_RUNTIME_SETTINGS
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicSpatialInitializationDescriptor
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  createStageSpatialSession,
  loadStageStaticSpatialResources,
  type OwnedStageStaticSpatialResources,
  type StageSpatialSession
} from "../../../src/world/stageSpatialContext";
import { assert, executeTest } from "./testUtils";

const MAXIMUM_BIT_COUNT = 30;
const MINIMUM_SPAWN_DISTANCE = 0.2;
const SEEDS = Object.freeze(
  Array.from({ length: 18 }, (_, index) => 20260912 + index * 7919)
);

type SpawnCounts = { indoor: number; outdoor: number };

const createSchoolValidationStage = (): StageCatalogEntry => {
  const roomVariantNavmesh = SCHOOL_STAGE.roomVariantNavmesh;
  assert(roomVariantNavmesh.mode === "required", "学校の部屋variant NavMeshがありません。");
  const relativeUrl = (url: string) => url.startsWith("/") ? url.slice(1) : url;
  return Object.freeze({
    ...SCHOOL_STAGE,
    glbUrl: relativeUrl(schoolGlbUrl),
    navmeshUrl: relativeUrl(schoolNavmeshUrl),
    bitNavmeshUrl: relativeUrl(schoolBitNavmeshUrl),
    roomVariantNavmesh: Object.freeze({
      ...roomVariantNavmesh,
      url: relativeUrl(schoolRoomVariantNavmeshUrl)
    })
  });
};

const positionSignature = (states: readonly V2BitFlightState[]) =>
  JSON.stringify(states.map((state) => ({
    id: state.bitId,
    zone: state.zoneId,
    band: state.bandId,
    position: state.position.asArray(),
    heightMode: state.heightMode
  })));

const formatCounts = (counts: SpawnCounts) => {
  const total = counts.indoor + counts.outdoor;
  return `屋内${counts.indoor}/屋外${counts.outdoor} (${(counts.indoor / total * 100).toFixed(1)}%屋内)`;
};

export const runSchoolBitSpawnTests = async () => Object.freeze([
  await executeTest("実学校GLB/BIT NavMeshの初期・時間増援50%分布と安全性", async () => {
    const startedAt = performance.now();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let staticResources: OwnedStageStaticSpatialResources | null = null;
    let stage: StageSpatialSession | null = null;
    try {
      assert(V2_BIT_INDOOR_SPAWN_PROBABILITY === 0.5, "屋内出現確率が50%ではありません。");
      staticResources = await loadStageStaticSpatialResources(scene, createSchoolValidationStage());
      stage = await createStageSpatialSession(staticResources, {
        dynamicSpatialInitialization: createSchoolStageDynamicSpatialInitializationDescriptor(0),
        roomVariantSelections: createSchoolRoomVariantSelections(
          DEFAULT_SCHOOL_RUNTIME_SETTINGS,
          0
        )
      });
      const spatial = stage;
      const safety = createBitFlightSafety(spatial.queries);
      const initialCounts: SpawnCounts = { indoor: 0, outdoor: 0 };
      const timedInitialCounts: SpawnCounts = { indoor: 0, outdoor: 0 };
      const reinforcementCounts: SpawnCounts = { indoor: 0, outdoor: 0 };
      const playerSpawnIds = new Set<string>();
      let checkedPositions = 0;
      let smallestDistance = Number.POSITIVE_INFINITY;

      const runSeed = (seed: number, timed: boolean, recordCounts: boolean) => {
        const playerSpawn = selectV2PlayerSpawn(
          spatial.playerSpawns.all,
          "random",
          createSchoolRuntimeRandom(seed, "player-spawn")
        );
        playerSpawnIds.add(playerSpawn.id);
        const system = createV2BitSystem(scene, spatial, {
          initialBitCount: timed ? 1 : MAXIMUM_BIT_COUNT,
          reinforcementIntervalSeconds: 10,
          maximumBitCount: MAXIMUM_BIT_COUNT,
          minimumSpawnDistance: MINIMUM_SPAWN_DISTANCE,
          spawnMaxAttempts: 512,
          spawnProjectionMaxDistance: 0.75,
          combatEnabled: false,
          modeMuzzleColorEnabled: false,
          showGroundShadows: false,
          random: createSchoolRuntimeRandom(seed, "core"),
          spawnRandom: createSchoolRuntimeRandom(seed, "bit-spawn"),
          playerSpawn,
          resolveTargetNavigationArea: (target) => ({
            targetId: target.id,
            areaId: spatial.navigationAreas.locate(target.footPosition).areaId,
            revision: 0,
            anchor: target.footPosition.clone()
          })
        });
        const checked = new Set<string>();
        const inspectNewPositions = (states: readonly V2BitFlightState[]) => {
          for (const state of states) {
            if (checked.has(state.bitId)) {
              continue;
            }
            assert(state.zoneId !== null && state.bandId !== null, `${seed}/${state.bitId}: 飛行帯がありません。`);
            const zone = spatial.bitNavigation.getZone(state.zoneId);
            assert(zone !== null, `${seed}/${state.bitId}: 飛行zoneがありません。`);
            const inSpawnVolume = spatial.volumes.getByRole("bit_spawn").some((volume) =>
              volume.bitFlightBand?.zoneId === state.zoneId &&
              volume.bitFlightBand.bandId === state.bandId &&
              spatial.queries.containsVolumeById(volume.id, state.position)
            );
            assert(inSpawnVolume, `${seed}/${state.bitId}: 出現Volume外です。`);
            assert(safety.isCenterSafe(state.position), `${seed}/${state.bitId}: 安全包絡が衝突しています。`);
            const floor = spatial.queries.sampleGround(state.position, 5);
            const exclusionPoints = floor ? [state.position, floor.point] : [state.position];
            for (const point of exclusionPoints) {
              for (const role of ["no_enemy_spawn", "no_enemy_enter", "hazard", "water"] as const) {
                assert(!spatial.queries.containsVolume(role, point), `${seed}/${state.bitId}: ${role}内です。`);
              }
              assert(
                !spatial.queries.containsVolumeById(playerSpawn.exclusionVolume.id, point),
                `${seed}/${state.bitId}: 選択されたPlayer開始地点の除外域内です。`
              );
            }
            for (const other of states) {
              if (other.bitId === state.bitId) {
                continue;
              }
              const distance = Vector3.Distance(state.position, other.position);
              smallestDistance = Math.min(smallestDistance, distance);
              assert(distance >= MINIMUM_SPAWN_DISTANCE - 1e-8, `${seed}/${state.bitId}: BIT間隔が不足しています。`);
            }
            if (recordCounts) {
              const counts = !timed
                ? initialCounts
                : checked.size === 0 ? timedInitialCounts : reinforcementCounts;
              counts[zone.spaceKind] += 1;
            }
            checked.add(state.bitId);
            checkedPositions += 1;
          }
        };
        try {
          // AI停止は時間増援も止めるため、敵対行動のみ止めて生成位置を固定する。
          system.setHostileActionsSuspended(true);
          // 出現演出中はflightStatesへ公開されないため、公開APIで演出を完了する。
          system.prepareForScriptedPhase();
          let states = system.getFrameView().flightStates;
          assert(states.length === (timed ? 1 : MAXIMUM_BIT_COUNT), `${seed}: 初期出現数が不正です。`);
          inspectNewPositions(states);
          if (timed) {
            for (let count = 2; count <= MAXIMUM_BIT_COUNT; count += 1) {
              const previousSignature = positionSignature(states);
              system.update({ deltaSeconds: 10, elapsedSeconds: (count - 1) * 10, targets: [], externalAlerts: [] });
              system.prepareForScriptedPhase();
              states = system.getFrameView().flightStates;
              assert(states.length === count, `${seed}: 時間増援が1機ずつ出現しません。`);
              assert(positionSignature(states.slice(0, count - 1)) === previousSignature, `${seed}: 計測中に既存BITが移動しました。`);
              inspectNewPositions(states);
            }
            system.update({ deltaSeconds: 10, elapsedSeconds: MAXIMUM_BIT_COUNT * 10, targets: [], externalAlerts: [] });
            assert(system.getFrameView().populationBitCount === MAXIMUM_BIT_COUNT, `${seed}: 最大数30を超えました。`);
          }
          return positionSignature(states);
        } finally {
          system.dispose();
        }
      };

      let firstInitialSignature = "";
      let firstTimedSignature = "";
      for (const seed of SEEDS) {
        const initialSignature = runSeed(seed, false, true);
        const timedSignature = runSeed(seed, true, true);
        if (seed === SEEDS[0]) {
          firstInitialSignature = initialSignature;
          firstTimedSignature = timedSignature;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      assert(runSeed(SEEDS[0], false, false) === firstInitialSignature, "初期生成の同seed再現性が失われています。");
      assert(runSeed(SEEDS[0], true, false) === firstTimedSignature, "時間増援の同seed再現性が失われています。");
      for (const [label, counts] of [["初期一括", initialCounts], ["時間増援", reinforcementCounts]] as const) {
        const fraction = counts.indoor / (counts.indoor + counts.outdoor);
        assert(Math.abs(fraction - 0.5) <= 0.1, `${label}の実測屋内割合が50%±10ポイントを外れました: ${formatCounts(counts)}`);
      }
      return `荒れ度${DEFAULT_SCHOOL_RUNTIME_SETTINGS.roomDisorderLevel}・ステージseed0の実学校sessionを共有 / 18seed・1080機: ` +
        `初期30機×18=${formatCounts(initialCounts)} / ` +
        `通常初期1機×18=${formatCounts(timedInitialCounts)} / ` +
        `10秒増援29機×18=${formatCounts(reinforcementCounts)} / ` +
        `開始地点${playerSpawnIds.size}種類 / 同seed再生成60機を含む安全・除外検査${checkedPositions}機 / ` +
        `最小間隔${smallestDistance.toFixed(4)} world units / 最大数30・同seed位置一致PASS / ` +
        `${((performance.now() - startedAt) / 1000).toFixed(1)}秒`;
    } finally {
      stage?.dispose();
      staticResources?.dispose();
      scene.dispose();
      engine.dispose();
    }
  })
]);
