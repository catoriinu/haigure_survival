import { Vector3 } from "@babylonjs/core";
import type { V2HumanTargetSnapshot } from "../../../src/v2/combatTypes";
import {
  createV2PerformanceStressWorkload,
  serializeV2StressInputRequests,
  type V2StressInput,
  type V2StressWorkloadSnapshot
} from "../../../src/v2/performanceStressWorkload";
import { assert, executeTest } from "../T06/testUtils";

type Options = Parameters<typeof createV2PerformanceStressWorkload>[0];

const createPlacementFixture = (
  npcPositions: Vector3[],
  replayInputs: readonly V2StressInput[] | null = null,
  geometry = {
    projectPoint: (position: Vector3): { position: Vector3 } | null => ({ position: position.clone() }),
    contains: (_position: Vector3) => true,
    blockedSight: (_position: Vector3) => false
  }
) => {
  const getHumans = (): V2HumanTargetSnapshot[] => npcPositions.map((footPosition, index) => ({
    id: `npc-${index}`, kind: "npc", footPosition,
    aimPosition: footPosition.add(new Vector3(0, 0.2, 0)),
    hitShape: { center: footPosition.add(new Vector3(0, 0.2, 0)), radii: new Vector3(0.1, 0.2, 0.1) },
    state: index === 0 ? "brainwash-complete-gun" : "normal", alive: true, brainwashed: index === 0
  }));
  const placedPositions: number[][] = [];
  let footPosition = new Vector3(10, 0, 10);
  const personalities = { persistent: 0, nearestVisible: 0 };
  const snapshot: V2StressWorkloadSnapshot = {
    populationBitCount: 50, npcPersonalities: personalities, bitPersonalities: personalities,
    targetedNpcPersonalities: personalities, targetedBitPersonalities: personalities,
    followerIds: [], scheduledFollowerShotIds: [], activeFollowerShotIds: []
  };
  const workload = createV2PerformanceStressWorkload({
    replayInputs,
    stage: {
      roomVariantSelection: [], navigation: { projectPoint: geometry.projectPoint },
      boundary: { contains: geometry.contains },
      queries: { castSightSegment: (position: Vector3) => geometry.blockedSight(position) ? {} : null }
    } as unknown as Options["stage"],
    dynamicRuntime: {
      doors: { getSnapshot: () => ({ doors: [] }) }, elevators: []
    } as unknown as Options["dynamicRuntime"],
    survival: {
      getFrame: () => ({ phase: "playing", npcCount: npcPositions.length, brainwashedNpcCount: 1,
        bitCount: 50, activeBeamCount: 0, playerCanMove: true, playerCompletionUnlocked: false, playerState: "normal" }),
      getHumanTargets: getHumans, getBitActors: () => [], getStressWorkloadSnapshot: () => snapshot,
      getNpcCommandCandidates: () => [], relocateTargetNavigationArea: () => {}
    } as unknown as Options["survival"],
    player: {
      getFootPosition: () => footPosition.clone(),
      getEyePosition: () => footPosition.add(new Vector3(0, 0.2, 0)),
      placeAt: (position: Vector3) => { footPosition = position.clone(); placedPositions.push(position.asArray()); }
    },
    camera: {
      setTarget: () => {}, getViewMatrix: () => {}, getTransformationMatrix: () => {}
    } as unknown as Options["camera"]
  });
  return { workload, placedPositions };
};

const placementInput = (x: number): V2StressInput => ({
  request: { requestedAtSeconds: 0, kind: "player-placement", targetNpcId: "npc-0",
    approachOffsets: [[x, 0, 0]], aimPolicy: "target-aim-position" },
  result: { executedAtSeconds: 0, accepted: true }
});

export const runStressWorkloadPlacementTests = async () => [
  await executeTest("stress配置は対象以外のNPCとも非重複を保つ", () => {
    const positions = [Vector3.Zero(), new Vector3(0.26, 0, 0)];
    const fixture = createPlacementFixture(positions);
    fixture.workload.update(0);
    assert(JSON.stringify(fixture.placedPositions) === "[[0,0,0.25]]", "別NPCと重なる最初の候補を選んだ");
    const placed = Vector3.FromArray(fixture.placedPositions[0]!);
    assert(positions.every((position) => Math.hypot(placed.x - position.x, placed.z - position.z) >= 0.2),
      "Player/NPCの水平Collider半径の和を確保しなかった");
    fixture.workload.dispose();
    return "1m相当の候補距離を維持し、別NPCに重なる候補を除外";
  }),
  await executeTest("stress投影後のNPC重複を検出し未成立入力を保存", () => {
    const fixture = createPlacementFixture([Vector3.Zero()], null, {
      projectPoint: () => ({ position: new Vector3(0.15, 0, 0) }),
      contains: () => true, blockedSight: () => false
    });
    fixture.workload.update(0);
    const report = fixture.workload.getReport();
    assert(fixture.placedPositions.length === 0 && report.unavailablePlacementAttemptCount === 1,
      "NavMeshへの投影でNPCへ近づいた配置を受理した");
    assert(report.inputs[0]!.request.kind === "player-placement" && !report.inputs[0]!.result.accepted &&
      report.inputs[0]!.result.resolvedPlacement === null,
      "全候補不成立を無記録のまま捨てた");
    fixture.workload.dispose();
    return "投影前0.25worldでも投影後0.15worldなら全候補を拒否し記録";
  }),
  await executeTest("stress配置はNavMesh・境界・視線の条件を維持", () => {
    const fixture = createPlacementFixture([Vector3.Zero()], null, {
      projectPoint: (position) => position.x > 0 ? null : { position: position.clone() },
      contains: (position) => position.z <= 0,
      blockedSight: (position) => position.x < 0
    });
    fixture.workload.update(0);
    assert(JSON.stringify(fixture.placedPositions) === "[[0,0,-0.25]]", "既存の幾何条件を通らない候補を採用した");
    fixture.workload.dispose();
    return "NavMesh欠落・境界外・遮蔽を順に除外し最後の候補だけ採用";
  }),
  await executeTest("stress再生配置はNPC離隔0.2worldの境界を保つ", () => {
    for (const [distance, expectedAccepted] of [[0.2, true], [0.1999, false]] as const) {
      const fixture = createPlacementFixture([Vector3.Zero()], [placementInput(distance)]);
      fixture.workload.update(0);
      assert(fixture.workload.getReport().inputs[0]!.result.accepted === expectedAccepted,
        `水平離隔${distance}worldの許否が不正`);
      assert(fixture.placedPositions.length === (expectedAccepted ? 1 : 0), "拒否した位置へPlayerを配置した");
      fixture.workload.dispose();
    }
    return "Collider半径の和0.2worldは受理、0.1999worldは拒否";
  }),
  await executeTest("stress再生は移動した対象NPCへの接近を同じ意味入力で維持", () => {
    const npcPosition = new Vector3(1, 0, 2);
    const source = placementInput(0.25);
    const fixture = createPlacementFixture([npcPosition], [source]);
    npcPosition.set(3, 1, 4);
    fixture.workload.update(0);
    const report = fixture.workload.getReport();
    assert(JSON.stringify(fixture.placedPositions) === "[[3.25,1,4]]" && report.inputs[0]!.result.accepted,
      "移動した対象の現在位置へ接近しなかった");
    const resolved = report.inputs[0]!.result.resolvedPlacement!;
    assert(JSON.stringify(resolved.lookDirection) === "[-1,0,0]" && JSON.stringify(resolved.targetFootPosition) === "[3,1,4]",
      "対象移動後の照準を再計算しなかった");
    assert(report.replay!.resultMismatches.length === 0 &&
      serializeV2StressInputRequests(report.inputs) === serializeV2StressInputRequests([source]),
      "移動追従で共通要求列を変更した");
    fixture.workload.dispose();
    return "対象移動後に同じoffsetを適用し、実座標の変化はhash対象の要求列へ混入しない";
  }),
  await executeTest("stress記録と再生は同じ接近候補順序を使い結果座標を分離", () => {
    const recording = createPlacementFixture([Vector3.Zero()]);
    recording.workload.update(0);
    const recordedInputs = recording.workload.getReport().inputs;
    recording.workload.dispose();
    const replaying = createPlacementFixture([new Vector3(2, 0, 3), new Vector3(2.26, 0, 3)], recordedInputs);
    replaying.workload.update(0);
    const replayedInputs = replaying.workload.getReport().inputs;
    assert(JSON.stringify(recordedInputs[0]!.result.resolvedPlacement!.approachOffset) === "[0.25,0,0]" &&
      JSON.stringify(replayedInputs[0]!.result.resolvedPlacement!.approachOffset) === "[0,0,0.25]",
      "保存順序で候補の安全判定を再実行しなかった");
    assert(JSON.stringify(replayedInputs[0]!.result.resolvedPlacement!.position) === "[2,0,3.25]",
      "記録時の絶対座標を再生した");
    assert(serializeV2StressInputRequests(recordedInputs) === serializeV2StressInputRequests(replayedInputs),
      "候補の採用結果が変わると共通要求列まで変化した");
    replaying.workload.dispose();
    return "record/replayが同じ候補列を評価し、現場の非対象NPCで採用offsetが変わっても要求列は一致";
  }),
  await executeTest("stress再生先へ移動した非対象NPCとの重複は拒否", () => {
    const blockingPosition = new Vector3(1, 0, 0);
    const source = placementInput(0.25);
    const fixture = createPlacementFixture([Vector3.Zero(), blockingPosition], [source]);
    blockingPosition.x = 0.3;
    fixture.workload.update(0);
    const report = fixture.workload.getReport();
    assert(fixture.placedPositions.length === 0 && !report.inputs[0]!.result.accepted,
      "再生直前に移動した別NPCへ重なる配置を受理した");
    assert(report.replay!.resultMismatches.length === 1 &&
      serializeV2StressInputRequests(report.inputs) === serializeV2StressInputRequests([source]) &&
      report.inputs[0]!.result.resolvedPlacement === null,
      "拒否を記録しなかったか保存した接近方針を変更した");
    fixture.workload.dispose();
    return "現在の全NPC離隔を確認し、候補が塞がれた場合は拒否と許否不一致を保存";
  })
];
