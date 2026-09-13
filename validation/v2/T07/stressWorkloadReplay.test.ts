import { Vector3 } from "@babylonjs/core";
import type { V2HumanTargetSnapshot } from "../../../src/v2/combatTypes";
import {
  createV2PerformanceStressWorkload,
  createV2StressInputReplay,
  serializeV2StressInputRequests,
  type V2StressInput,
  type V2StressInputRequest,
  type V2StressWorkloadSnapshot
} from "../../../src/v2/performanceStressWorkload";
import { assert, assertThrows, executeTest } from "../T06/testUtils";

const input = (request: V2StressInputRequest, accepted: boolean): V2StressInput => ({
  request, result: { executedAtSeconds: request.requestedAtSeconds, accepted }
});

const createReplayFixture = (replayInputs: readonly V2StressInput[], playerCanMove = true) => {
  type Options = Parameters<typeof createV2PerformanceStressWorkload>[0];
  const actions: string[] = [];
  const placedPositions: number[][] = [];
  const lookAtPositions: number[][] = [];
  let footPosition = Vector3.Zero();
  const targetPosition = new Vector3(1, 0, 2);
  const personalities = { persistent: 0, nearestVisible: 0 };
  const snapshot: V2StressWorkloadSnapshot = {
    populationBitCount: 50, npcPersonalities: personalities, bitPersonalities: personalities,
    targetedNpcPersonalities: personalities, targetedBitPersonalities: personalities,
    followerIds: [], scheduledFollowerShotIds: [], activeFollowerShotIds: []
  };
  const workload = createV2PerformanceStressWorkload({
    replayInputs,
    stage: {
      roomVariantSelection: [],
      navigation: { projectPoint: (position: Vector3) => ({ position: position.clone() }) },
      boundary: { contains: () => true },
      queries: { castSightSegment: () => null }
    } as unknown as Options["stage"],
    dynamicRuntime: {
      doors: {
        getSnapshot: () => ({ doors: [{ id: "door-a", openness: 0 }] }),
        requestDoorToggle: (id: string) => { actions.push(`door:${id}`); return { status: "started" }; }
      }, elevators: []
    } as unknown as Options["dynamicRuntime"],
    survival: {
      getFrame: () => ({ phase: "playing", npcCount: 99, brainwashedNpcCount: 66,
        bitCount: 50, activeBeamCount: 0, playerCanMove, playerCompletionUnlocked: false, playerState: "normal" }),
      getHumanTargets: (): V2HumanTargetSnapshot[] => [{ id: "npc-a", kind: "npc",
        footPosition: targetPosition, aimPosition: targetPosition.add(Vector3.Up()),
        hitShape: { center: targetPosition.add(Vector3.Up()), radii: new Vector3(0.1, 0.2, 0.1) },
        state: "normal", alive: true, brainwashed: false }],
      getBitActors: () => [], getStressWorkloadSnapshot: () => snapshot,
      getNpcCommandCandidates: () => { throw new Error("再生中に新しい指示候補を選別した"); },
      requestNpcCommand: (id: string) => { actions.push(`follow:${id}`); return false; },
      requestPlayerGunFire: (direction: Vector3) => { actions.push(`shot:${direction.asArray().join(",")}`); return false; },
      selectPlayerCompletion: () => { throw new Error("銃選択未解放なのに状態を強制変更した"); },
      relocateTargetNavigationArea: (id: string) => { actions.push(`relocate:${id}`); }
    } as unknown as Options["survival"],
    player: {
      getFootPosition: () => footPosition.clone(), getEyePosition: () => footPosition.add(Vector3.Up()),
      placeAt: (position: Vector3) => { footPosition = position.clone(); placedPositions.push(position.asArray()); }
    },
    camera: {
      setTarget: (position: Vector3) => { lookAtPositions.push(position.asArray()); },
      getViewMatrix: () => {}, getTransformationMatrix: () => {}
    } as unknown as Options["camera"]
  });
  return { workload, actions, placedPositions, lookAtPositions };
};

export const runStressWorkloadReplayTests = async () => [
  await executeTest("stress再生は要求時刻・同時刻順序を守り二重実行しない", () => {
    const source = [
      input({ requestedAtSeconds: 0.5, kind: "door-toggle", doorId: "door-a" }, true),
      input({ requestedAtSeconds: 0.5, kind: "follow", npcId: "npc-a" }, true),
      input({ requestedAtSeconds: 1, kind: "player-shot", direction: [0, 0, 1] }, true)
    ];
    const executed: V2StressInput[] = [];
    const replay = createV2StressInputReplay(source, (request, executedAtSeconds) => {
      executed.push({ request, result: { executedAtSeconds, accepted: true } });
      return true;
    });
    replay.update(0.499);
    assert(Number(executed.length) === 0, "予定時刻より先に要求を実行した");
    replay.update(0.5);
    replay.update(0.5);
    assert(executed.map((item) => item.request.kind).join(",") === "door-toggle,follow", "同時刻順序または重複抑止が不正");
    replay.update(1.25);
    replay.update(2);
    assert(executed.length === 3 && replay.getReport().executedInputCount === 3, "完了した要求を再実行した");
    assert(replay.getReport().maximumDelaySeconds === 0.25, "frame単位の再生遅延を失った");
    assert(executed[2]!.request.requestedAtSeconds === 1 && executed[2]!.result.executedAtSeconds === 1.25,
      "保存した要求時刻を再生時刻で上書きした");
    return "予定時刻前は無操作、同時刻は元順序、各要求1回、最大遅延0.25秒";
  }),
  await executeTest("stress許否結果の変化は同一要求列と区別して報告", () => {
    const source = [input({ requestedAtSeconds: 1, kind: "follow", npcId: "npc-a" }, true)];
    const actual: V2StressInput[] = [];
    const replay = createV2StressInputReplay(source, (request, executedAtSeconds) => {
      actual.push({ request, result: { executedAtSeconds, accepted: false } });
      return false;
    });
    replay.update(1.1);
    assert(serializeV2StressInputRequests(source) === serializeV2StressInputRequests(actual), "許否・遅延を要求fingerprintへ混入した");
    const report = replay.getReport();
    assert(report.executedInputCount === 1 && report.resultMismatches.length === 1, "拒否を未実行と混同した");
    assert(report.resultMismatches[0]!.expectedAccepted && !report.resultMismatches[0]!.actualAccepted,
      "記録時の許可と再生時の拒否を失った");
    return "要求列は一致、1件実行済み、許否だけ不一致";
  }),
  await executeTest("stress再生は入力を黙って並べ替えず逆行時刻を拒否", () => {
    const later = input({ requestedAtSeconds: 2, kind: "select-gun" }, false);
    const earlier = input({ requestedAtSeconds: 1, kind: "select-gun" }, false);
    assertThrows(() => createV2StressInputReplay([later, earlier], () => false), "非昇順入力を受理した");
    const replay = createV2StressInputReplay([earlier], () => false);
    replay.update(1);
    assertThrows(() => replay.update(0.5), "再生時計の逆行を受理した");
    return "入力順序の破損と時計逆行を明示エラー化";
  }),
  await executeTest("stress空の明示再生は自動入力へ切り替わらない", () => {
    const fixture = createReplayFixture([]);
    fixture.workload.update(0);
    fixture.workload.update(2);
    assert(fixture.actions.length === 0 && fixture.workload.getReport().inputs.length === 0, "空replayをrecordにフォールバックした");
    assert(fixture.workload.getReport().inputMode === "replay", "明示したreplayモードを失った");
    fixture.workload.dispose();
    return "空配列も明示replayとして保持し、対象選別・扉操作を追加しない";
  }),
  await executeTest("stress配置対象不在の再生は無操作で状態条件も維持", () => {
    const source = [
      input({ requestedAtSeconds: 0, kind: "player-placement", targetNpcId: "npc-missing",
        approachOffsets: [[0.25, 0, 0]], aimPolicy: "target-aim-position" }, false),
      input({ requestedAtSeconds: 0, kind: "select-gun" }, true),
      input({ requestedAtSeconds: 0, kind: "follow", npcId: "npc-a" }, true)
    ];
    const fixture = createReplayFixture(source);
    fixture.workload.update(0);
    const report = fixture.workload.getReport();
    assert(fixture.placedPositions.length === 0 && report.unavailablePlacementAttemptCount === 1,
      "存在しない対象を再選別・再配置した");
    assert(report.inputs[0]!.result.resolvedPlacement === null, "配置未成立の結果座標をnullで保存しなかった");
    assert(fixture.actions.join(",") === "follow:npc-a", "未解放の銃選択または新しい自動入力を実行した");
    assert(report.replay!.executedInputCount === 3 && report.replay!.resultMismatches.length === 2,
      "無操作/拒否を未実行と混同した");
    fixture.workload.dispose();
    return "配置対象不在は無操作、銃選択未解放とFollow拒否は許否不一致として保存";
  }),
  await executeTest("stress配置再生は現在の対象位置と保存した接近・照準方針を使用", () => {
    const source = [input({ requestedAtSeconds: 0, kind: "player-placement", targetNpcId: "npc-a",
      approachOffsets: [[0, 0, -0.25]], aimPolicy: "target-aim-position" }, true)];
    const fixture = createReplayFixture(source);
    fixture.workload.update(0);
    assert(JSON.stringify(fixture.placedPositions) === "[[1,0,1.75]]", "対象位置と保存offsetから配置先を解決しなかった");
    assert(JSON.stringify(fixture.lookAtPositions) === "[[1,1,2.75]]", "現在対象への視線方向を解決しなかった");
    const resolved = fixture.workload.getReport().inputs[0]!.result.resolvedPlacement!;
    assert(JSON.stringify(resolved.position) === "[1,0,1.75]" && JSON.stringify(resolved.lookDirection) === "[0,0,1]",
      "解決した配置・視線を結果へ保存しなかった");
    assert(JSON.stringify(resolved.targetFootPosition) === "[1,0,2]" && JSON.stringify(resolved.approachOffset) === "[0,0,-0.25]",
      "実行時の対象位置と採用offsetを結果へ保存しなかった");
    assert(serializeV2StressInputRequests(fixture.workload.getReport().inputs) === serializeV2StressInputRequests(source),
      "再生した配置要求の引数を変更した");
    fixture.workload.dispose();
    const blocked = createReplayFixture(source, false);
    blocked.workload.update(0);
    assert(blocked.placedPositions.length === 0 && blocked.workload.getReport().replay!.resultMismatches.length === 1,
      "Player移動不可状態を配置で突破した");
    assert(blocked.workload.getReport().inputs[0]!.result.resolvedPlacement === null, "移動不可の拒否に結果座標が残った");
    blocked.workload.dispose();
    return "対象ID・接近・照準方針を保存し、実座標と視線は結果へ分離。Player移動不可では拒否";
  }),
  await executeTest("stress旧配置schemaを互換入力として黙って受理しない", () => {
    const oldPlacement = { requestedAtSeconds: 0, kind: "player-placement", targetNpcId: "npc-a",
      position: [1, 0, 2], lookDirection: [0, 0, 1] } as unknown as V2StressInputRequest;
    assertThrows(() => createV2StressInputReplay([input(oldPlacement, true)], () => true),
      "旧絶対座標schemaを互換処理した");
    const oldUnavailable = { requestedAtSeconds: 0, kind: "placement-unavailable",
      targetNpcId: "npc-a" } as unknown as V2StressInputRequest;
    assertThrows(() => createV2StressInputReplay([input(oldUnavailable, false)], () => false),
      "旧未成立要求を共通実行から除外して受理した");
    return "旧絶対座標と旧placement-unavailableは明示移行を要求";
  })
];
