import { Vector3 } from "@babylonjs/core";
import {
  createV2PerformanceStressWorkload,
  findV2StressWorkloadMissingEvidence,
  type V2StressWorkloadEvidence,
  type V2StressWorkloadSnapshot
} from "../../../src/v2/performanceStressWorkload";
import { assert, executeTest } from "../T06/testUtils";
import { runStressWorkloadReplayTests } from "./stressWorkloadReplay.test";
import { runStressWorkloadPlacementTests } from "./stressWorkloadPlacement.test";

const completeEvidence: V2StressWorkloadEvidence = Object.freeze({
  elapsedSeconds: 120,
  initialPlayerCount: 1,
  initialNpcCount: 99,
  initialBrainwashedNpcCount: 66,
  initialBitCount: 50,
  minimumNpcCount: 99,
  minimumBitCount: 50,
  roomCount: 20,
  disorderedRoomCount: 20,
  changedDoorIds: ["door-a", "door-b"],
  movingElevatorIds: ["elevator-a"],
  arrivedElevatorIds: ["elevator-a"],
  movedNpcIds: ["npc-a"],
  movedBitIds: ["bit-a"],
  maximumFollowerCount: 7,
  scheduledFollowerIds: ["npc-a"],
  activeFollowerIds: ["npc-a"],
  followerShotActivationCount: 1,
  acceptedPlayerShotCount: 1,
  maximumActiveBeamCount: 1,
  maximumNpcPersonalities: { persistent: 33, nearestVisible: 33 },
  maximumBitPersonalities: { persistent: 25, nearestVisible: 25 },
  maximumTargetedNpcPersonalities: { persistent: 1, nearestVisible: 1 },
  maximumTargetedBitPersonalities: { persistent: 1, nearestVisible: 1 }
});

export const runStressWorkloadTests = async () => [
  ...await runStressWorkloadReplayTests(),
  ...await runStressWorkloadPlacementTests(),
  await executeTest("stress出現演出中のBITを人口減少と混同しない", () => {
    type WorkloadOptions = Parameters<typeof createV2PerformanceStressWorkload>[0];
    let activeBitCount = 50;
    let populationBitCount = 50;
    let activeBitActors: ReturnType<WorkloadOptions["survival"]["getBitActors"]> = [];
    const emptyPersonalities = { persistent: 0, nearestVisible: 0 };
    const getSnapshot = (): V2StressWorkloadSnapshot => ({
      populationBitCount,
      npcPersonalities: emptyPersonalities,
      bitPersonalities: emptyPersonalities,
      targetedNpcPersonalities: emptyPersonalities,
      targetedBitPersonalities: emptyPersonalities,
      followerIds: [], scheduledFollowerShotIds: [], activeFollowerShotIds: []
    });
    // 観測境界だけのfixture。assemblyにより配置・命令は実行せず、実学校受入とは分ける。
    const workload = createV2PerformanceStressWorkload({
      stage: { roomVariantSelection: [] } as unknown as WorkloadOptions["stage"],
      dynamicRuntime: {
        doors: { getSnapshot: () => ({ doors: [] }) }, elevators: []
      } as unknown as WorkloadOptions["dynamicRuntime"],
      survival: {
        getFrame: () => ({ phase: "assembly", npcCount: 99,
          brainwashedNpcCount: 66, bitCount: activeBitCount, activeBeamCount: 0 }),
        getHumanTargets: () => [], getBitActors: () => activeBitActors,
        getStressWorkloadSnapshot: getSnapshot
      } as unknown as WorkloadOptions["survival"],
      player: {} as WorkloadOptions["player"],
      camera: {} as WorkloadOptions["camera"],
      replayInputs: null
    });
    activeBitCount = 0;
    workload.update(0);
    const fading = workload.getReport().evidence;
    assert(fading.initialBitCount === 50 && fading.minimumBitCount === 50,
      "active sphereが0の出現演出を人口0と判定した");
    assert(fading.movedBitIds.length === 0, "割当人口を実移動の証拠に流用した");
    activeBitCount = 50;
    const actorCenter = new Vector3(1, 2, 3);
    activeBitActors = [{ id: "bit-a", kind: "bit", center: actorCenter, radius: 0.1 }];
    workload.update(1.5);
    assert(workload.getReport().evidence.movedBitIds.length === 0,
      "初出現の位置を変位と誤認した");
    workload.update(1.6);
    assert(workload.getReport().evidence.movedBitIds.length === 0,
      "出現後も同じ位置のBITを移動済みにした");
    actorCenter.x += 0.1;
    workload.update(1.7);
    assert(workload.getReport().evidence.movedBitIds.join(",") === "bit-a",
      "初観測位置からの実変位を記録しなかった");
    assert(workload.getReport().evidence.minimumBitCount === 50,
      "active sphereの空・初出現・移動を実人口の減少にした");
    populationBitCount = 49;
    workload.update(1.8);
    assert(workload.getReport().evidence.minimumBitCount === 49,
      "実人口49への減少を初期設定50で隠した");
    workload.dispose();
    return "空→初出現→静止→実変位で移動証拠を取得。実人口50を維持し49への減少は検出";
  }),
  await executeTest("stress成立は時間・構成・実動作証拠をすべて要求", () => {
    assert(findV2StressWorkloadMissingEvidence(completeEvidence).length === 0, "完全な証拠を不成立にした");
    const missing = findV2StressWorkloadMissingEvidence({ ...completeEvidence, elapsedSeconds: 119.999 });
    assert(missing.length === 1 && missing[0] === "120秒の実時間観測", "120秒未満を完走にした");
    return "119.999秒と120秒の境界を確認";
  }),
  await executeTest("stress初期人口だけ合っていても途中の負荷減少を検出", () => {
    for (const partial of [{ minimumNpcCount: 98 }, { minimumBitCount: 49 }, { initialBrainwashedNpcCount: 65 }]) {
      const missing = findV2StressWorkloadMissingEvidence({ ...completeEvidence, ...partial });
      assert(missing.some((item) => item.includes("実人口")), "負荷を減らした構成を成立にした");
    }
    return "NPC・BITの最小実人口と初期洗脳66を個別確認";
  }),
  await executeTest("stress荒れ室1室不足を検出", () => {
    const missing = findV2StressWorkloadMissingEvidence({ ...completeEvidence, disorderedRoomCount: 19 });
    assert(missing.includes("20室すべての荒れvariant"), "全室選択を設定値だけで代用した");
    return "実際のvariant選択20室を要求";
  }),
  await executeTest("stress扉要求とエレベーター呼出だけを実動作にしない", () => {
    const missing = findV2StressWorkloadMissingEvidence({ ...completeEvidence,
      changedDoorIds: ["door-a"], movingElevatorIds: [], arrivedElevatorIds: [] });
    assert(missing.includes("複数の動的扉の実変位"), "1枚の扉だけで複数成立にした");
    assert(missing.includes("エレベーターの実移動と別停止階への到着"), "呼出だけで移動成立にした");
    const travelling = findV2StressWorkloadMissingEvidence({ ...completeEvidence, arrivedElevatorIds: [] });
    assert(travelling.includes("エレベーターの実移動と別停止階への到着"), "未到着を到着にした");
    return "扉の変位・エレベーター移動・到着を個別要求";
  }),
  await executeTest("stress静止NPC/BITを実負荷証拠にしない", () => {
    const missing = findV2StressWorkloadMissingEvidence({ ...completeEvidence, movedNpcIds: [], movedBitIds: [] });
    assert(missing.includes("NPCの実移動") && missing.includes("BITの実移動"), "人口だけで実移動を代用した");
    return "人口と移動の証拠を分離";
  }),
  await executeTest("stressFollower予約だけでは同期射撃成立にしない", () => {
    const missing = findV2StressWorkloadMissingEvidence({ ...completeEvidence,
      activeFollowerIds: [], followerShotActivationCount: 0 });
    assert(missing.includes("Player射撃からFollower光線生成までの同期射撃"), "scheduledだけで実spawn成立にした");
    const tooFew = findV2StressWorkloadMissingEvidence({ ...completeEvidence, maximumFollowerCount: 6 });
    assert(tooFew.includes("6人を超える同時Follower"), "少人数の受入で無制限負荷を代用した");
    return "予約と実spawnを分離、6人以下の証拠を区別";
  }),
  await executeTest("stress個性の割当だけで標的選択が働いたと扱わない", () => {
    const missing = findV2StressWorkloadMissingEvidence({ ...completeEvidence,
      maximumTargetedNpcPersonalities: { persistent: 2, nearestVisible: 0 },
      maximumTargetedBitPersonalities: { persistent: 0, nearestVisible: 2 } });
    assert(missing.includes("NPC両個性による実標的保持") && missing.includes("BIT両個性による実標的保持"),
      "割当値だけで両個性の実標的保持を代用した");
    return "NPC・BITそれぞれ両個性の実targetを要求";
  })
];
