import { Vector3, type FreeCamera } from "@babylonjs/core";
import { NPC_SPRITE_WIDTH, PLAYER_SPRITE_WIDTH } from "../game/characterSprites";
import type { SchoolStageDynamicRuntime } from "../world/schoolStageDynamicRuntime";
import type { StageSpatialSession } from "../world/stageSpatialContext";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import type { V2HumanTargetSnapshot } from "./combatTypes";
import type { V2PlayerController } from "./playerController";
import type { V2SurvivalRuntime } from "./survivalRuntime";

type PersonalityCounts = Readonly<{ persistent: number; nearestVisible: number }>;

/** 観測専用。NPC/BITの可変内部状態や制御APIを外へ渡さない。 */
export type V2StressWorkloadSnapshot = Readonly<{
  populationBitCount: number;
  npcPersonalities: PersonalityCounts;
  bitPersonalities: PersonalityCounts;
  targetedNpcPersonalities: PersonalityCounts;
  targetedBitPersonalities: PersonalityCounts;
  followerIds: readonly string[];
  scheduledFollowerShotIds: readonly string[];
  activeFollowerShotIds: readonly string[];
}>;

export type V2StressWorkloadEvidence = Readonly<{
  elapsedSeconds: number;
  initialPlayerCount: number;
  initialNpcCount: number;
  initialBrainwashedNpcCount: number;
  initialBitCount: number;
  minimumNpcCount: number;
  minimumBitCount: number;
  roomCount: number;
  disorderedRoomCount: number;
  changedDoorIds: readonly string[];
  movingElevatorIds: readonly string[];
  arrivedElevatorIds: readonly string[];
  movedNpcIds: readonly string[];
  movedBitIds: readonly string[];
  maximumFollowerCount: number;
  scheduledFollowerIds: readonly string[];
  activeFollowerIds: readonly string[];
  followerShotActivationCount: number;
  acceptedPlayerShotCount: number;
  maximumActiveBeamCount: number;
  maximumNpcPersonalities: PersonalityCounts;
  maximumBitPersonalities: PersonalityCounts;
  maximumTargetedNpcPersonalities: PersonalityCounts;
  maximumTargetedBitPersonalities: PersonalityCounts;
}>;

/** 経過時間だけでは成立扱いにしない。性能・警告・保持の判定は計測器側で行う。 */
export const findV2StressWorkloadMissingEvidence = (
  evidence: V2StressWorkloadEvidence
): readonly string[] => {
  const missing: string[] = [];
  if (evidence.elapsedSeconds < 120) missing.push("120秒の実時間観測");
  if (
    evidence.initialPlayerCount !== 1 || evidence.initialNpcCount !== 99 ||
    evidence.initialBrainwashedNpcCount !== 66 || evidence.initialBitCount !== 50 ||
    evidence.minimumNpcCount !== 99 || evidence.minimumBitCount !== 50
  ) missing.push("Player 1・NPC 99（初期洗脳66）・BIT 50の実人口");
  if (evidence.roomCount !== 20 || evidence.disorderedRoomCount !== 20) {
    missing.push("20室すべての荒れvariant");
  }
  if (evidence.changedDoorIds.length < 2) missing.push("複数の動的扉の実変位");
  if (evidence.movingElevatorIds.length === 0 || evidence.arrivedElevatorIds.length === 0) {
    missing.push("エレベーターの実移動と別停止階への到着");
  }
  if (evidence.movedNpcIds.length === 0) missing.push("NPCの実移動");
  if (evidence.movedBitIds.length === 0) missing.push("BITの実移動");
  // 人数上限をdriverへ設けない。6人を超える実Followerを観測し小人数だけの代用を防ぐ。
  if (evidence.maximumFollowerCount <= 6) missing.push("6人を超える同時Follower");
  if (
    evidence.acceptedPlayerShotCount === 0 || evidence.followerShotActivationCount === 0 ||
    evidence.activeFollowerIds.length === 0 || evidence.maximumActiveBeamCount === 0
  ) missing.push("Player射撃からFollower光線生成までの同期射撃");
  for (const [label, counts] of [
    ["NPC", evidence.maximumTargetedNpcPersonalities],
    ["BIT", evidence.maximumTargetedBitPersonalities]
  ] as const) {
    if (counts.persistent === 0 || counts.nearestVisible === 0) {
      missing.push(`${label}両個性による実標的保持`);
    }
  }
  return Object.freeze(missing);
};

type StressVector = readonly [number, number, number];
export type V2StressInputRequest = Readonly<{ requestedAtSeconds: number }> & (
  | Readonly<{ kind: "player-placement"; targetNpcId: string; approachOffsets: readonly StressVector[];
      aimPolicy: "target-aim-position" }>
  | Readonly<{ kind: "select-gun" }>
  | Readonly<{ kind: "follow"; npcId: string }>
  | Readonly<{ kind: "player-shot"; direction: StressVector }>
  | Readonly<{ kind: "door-toggle"; doorId: string }>
  | Readonly<{ kind: "elevator-call"; elevatorId: string; stopId: string }>
);

/** 要求時刻と全引数を、実行時刻・許否から分ける。比較用hashはrequest列だけから作る。 */
export type V2StressResolvedPlacement = Readonly<{
  position: StressVector;
  lookDirection: StressVector;
  approachOffset: StressVector;
  targetFootPosition: StressVector;
}>;

export type V2StressInput = Readonly<{
  request: V2StressInputRequest;
  result: Readonly<{ executedAtSeconds: number; accepted: boolean;
    resolvedPlacement?: V2StressResolvedPlacement | null }>;
}>;

export type V2StressInputReplayReport = Readonly<{
  sourceInputCount: number;
  executedInputCount: number;
  maximumDelaySeconds: number;
  resultMismatches: readonly Readonly<{
    inputIndex: number;
    expectedAccepted: boolean;
    actualAccepted: boolean;
  }>[];
}>;

const vectorTuple = (vector: Vector3): StressVector => Object.freeze([vector.x, vector.y, vector.z]);

const copyStressVector = (vector: StressVector): StressVector => {
  if (vector.length !== 3 || !vector.every(Number.isFinite)) {
    throw new Error("stress入力の座標・方向には有限の3要素が必要です。");
  }
  return Object.freeze([vector[0], vector[1], vector[2]]);
};

const copyStressRequest = (request: V2StressInputRequest): V2StressInputRequest => {
  const requestedAtSeconds = request.requestedAtSeconds;
  if (!Number.isFinite(requestedAtSeconds) || requestedAtSeconds < 0 || requestedAtSeconds >= 120) {
    throw new Error("stress入力の要求時刻は0秒以上120秒未満の有限値が必要です。");
  }
  switch (request.kind) {
    case "player-placement": {
      if (request.aimPolicy !== "target-aim-position" || request.approachOffsets.length === 0) {
        throw new Error("stress配置入力には対象照準方針と1件以上の接近offsetが必要です。");
      }
      return Object.freeze({ requestedAtSeconds, kind: request.kind, targetNpcId: request.targetNpcId,
        approachOffsets: Object.freeze(request.approachOffsets.map(copyStressVector)), aimPolicy: request.aimPolicy });
    }
    case "select-gun": return Object.freeze({ requestedAtSeconds, kind: request.kind });
    case "follow": return Object.freeze({ requestedAtSeconds, kind: request.kind, npcId: request.npcId });
    case "player-shot": return Object.freeze({ requestedAtSeconds, kind: request.kind,
      direction: copyStressVector(request.direction) });
    case "door-toggle": return Object.freeze({ requestedAtSeconds, kind: request.kind, doorId: request.doorId });
    case "elevator-call": return Object.freeze({ requestedAtSeconds, kind: request.kind,
      elevatorId: request.elevatorId, stopId: request.stopId });
    default: throw new Error("未登録のstress入力種別です。");
  }
};

/** key順も正規化し、結果や再生遅延を含めない。runnerでこの文字列をSHA-256等へ渡す。 */
export const serializeV2StressInputRequests = (inputs: readonly V2StressInput[]): string =>
  JSON.stringify(inputs.map((input) => copyStressRequest(input.request)));

/** 同時刻の要求は元の順番を保つ。配置の対象ID・接近方針も保存した要求から変更しない。 */
export const createV2StressInputReplay = (
  sourceInputs: readonly V2StressInput[],
  executeRequest: (request: V2StressInputRequest, executedAtSeconds: number) => boolean
) => {
  const source = sourceInputs.map((input) => ({ request: copyStressRequest(input.request),
    expectedAccepted: input.result.accepted }));
  for (let index = 1; index < source.length; index += 1) {
    if (source[index]!.request.requestedAtSeconds < source[index - 1]!.request.requestedAtSeconds) {
      throw new Error("stress再生入力は要求時刻の昇順で保存してください。");
    }
  }
  let executedInputCount = 0;
  let previousElapsedSeconds = 0;
  let maximumDelaySeconds = 0;
  const resultMismatches: Array<V2StressInputReplayReport["resultMismatches"][number]> = [];
  return Object.freeze({
    update: (elapsedSeconds: number) => {
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < previousElapsedSeconds) {
        throw new Error("stress再生の実時間は単調増加の有限値が必要です。");
      }
      previousElapsedSeconds = elapsedSeconds;
      while (executedInputCount < source.length) {
        const input = source[executedInputCount]!;
        if (input.request.requestedAtSeconds > elapsedSeconds) break;
        const actualAccepted = executeRequest(input.request, elapsedSeconds);
        maximumDelaySeconds = Math.max(maximumDelaySeconds, elapsedSeconds - input.request.requestedAtSeconds);
        if (actualAccepted !== input.expectedAccepted) {
          resultMismatches.push(Object.freeze({ inputIndex: executedInputCount,
            expectedAccepted: input.expectedAccepted, actualAccepted }));
        }
        executedInputCount += 1;
      }
    },
    getReport: (): V2StressInputReplayReport => Object.freeze({ sourceInputCount: source.length,
      executedInputCount, maximumDelaySeconds, resultMismatches: Object.freeze([...resultMismatches]) })
  });
};

export type V2PerformanceStressWorkloadReport = Readonly<{
  version: 3;
  inputMode: "record" | "replay";
  status: "running" | "completed" | "incomplete" | "disposed";
  evidence: V2StressWorkloadEvidence;
  missingEvidence: readonly string[];
  phaseSeconds: Readonly<Record<string, number>>;
  inputs: readonly V2StressInput[];
  unavailablePlacementAttemptCount: number;
  replay: V2StressInputReplayReport | null;
  fixtureInterventions: readonly string[];
  synchronizedFireEvidence: string;
}>;

export type V2PerformanceStressWorkload = Readonly<{
  update(elapsedSeconds: number): void;
  getReport(): V2PerformanceStressWorkloadReport;
  dispose(): void;
}>;

type Options = Readonly<{
  stage: StageSpatialSession;
  dynamicRuntime: SchoolStageDynamicRuntime;
  survival: Pick<V2SurvivalRuntime,
    "getFrame" | "getHumanTargets" | "getBitActors" | "getNpcCommandCandidates" |
    "requestNpcCommand" | "selectPlayerCompletion" | "requestPlayerGunFire" |
    "relocateTargetNavigationArea"
  > & Readonly<{ getStressWorkloadSnapshot(): V2StressWorkloadSnapshot }>;
  player: Pick<V2PlayerController, "getFootPosition" | "getEyePosition" | "placeAt">;
  camera: FreeCamera;
  replayInputs: readonly V2StressInput[] | null;
}>;

const maximumCounts = (previous: PersonalityCounts, current: PersonalityCounts): PersonalityCounts => ({
  persistent: Math.max(previous.persistent, current.persistent),
  nearestVisible: Math.max(previous.nearestVisible, current.nearestVisible)
});
const emptyCounts = (): PersonalityCounts => ({ persistent: 0, nearestVisible: 0 });
const sortedIds = (ids: ReadonlySet<string>): readonly string[] => Object.freeze([...ids].sort());
// 通常Player/NPCの水平Collider半径の和。捕縛距離や移動阻止距離は代用しない。
const placementMinimumNpcDistanceSquared = ((PLAYER_SPRITE_WIDTH + NPC_SPRITE_WIDTH) * 0.5) ** 2;
const hasPlacementNpcClearance = (position: Vector3, humans: readonly V2HumanTargetSnapshot[]): boolean =>
  humans.every((human) => human.kind !== "npc" ||
    (position.x - human.footPosition.x) ** 2 + (position.z - human.footPosition.z) ** 2 >=
      placementMinimumNpcDistanceSquared);
const placementApproachOffsets: readonly StressVector[] = Object.freeze([
  Object.freeze([BLENDER_METERS_TO_WORLD_UNITS, 0, 0] as const),
  Object.freeze([0, 0, BLENDER_METERS_TO_WORLD_UNITS] as const),
  Object.freeze([-BLENDER_METERS_TO_WORLD_UNITS, 0, 0] as const),
  Object.freeze([0, 0, -BLENDER_METERS_TO_WORLD_UNITS] as const)
]);

/**
 * T07の実時間stress専用。各requestは通常Runtimeの状態・距離・視線・安全判定を通す。
 * NPC/BITは再配置しない。PlayerだけをNavMesh上へfixture配置し入力列へ全件記録する。
 * 呼出側はsurvival/dynamicの通常update後に実時間で呼び、120秒の計測器終了と合わせて退避する。
 */
export const createV2PerformanceStressWorkload = ({
  stage, dynamicRuntime, survival, player, camera, replayInputs
}: Options): V2PerformanceStressWorkload => {
  const initialFrame = survival.getFrame();
  const initialHumans = survival.getHumanTargets();
  const npcPositions = new Map(initialHumans.filter((target) => target.kind === "npc")
    .map((target) => [target.id, target.footPosition.clone()]));
  // BITの実人口は生成時から存在するが、active sphereは出現演出終了後に初めて列挙される。
  const bitFirstObservedPositions = new Map<string, Vector3>();
  const initialDoors = dynamicRuntime.doors.getSnapshot().doors;
  const doorOpenness = new Map(initialDoors.map((door) => [door.id, door.openness]));
  const initialElevators = dynamicRuntime.elevators.map((elevator) => elevator.getSnapshot());
  const elevatorOrigins = new Map(initialElevators.map((elevator) => [elevator.id, {
    position: elevator.carPosition.clone(), stopId: elevator.currentStopId
  }]));
  const movedNpcs = new Set<string>();
  const movedBits = new Set<string>();
  const changedDoors = new Set<string>();
  const movingElevators = new Set<string>();
  const arrivedElevators = new Set<string>();
  const scheduledFollowers = new Set<string>();
  const activeFollowers = new Set<string>();
  let previousActiveFollowers = new Set<string>();
  const inputs: V2StressInput[] = [];
  const phaseSeconds: Record<string, number> = {};
  let elapsedSeconds = 0;
  let previousPhase = initialFrame.phase;
  let disposed = false;
  let minimumNpcCount = initialFrame.npcCount;
  let minimumBitCount = initialFrame.bitCount;
  let maximumFollowerCount = 0;
  let followerShotActivationCount = 0;
  let acceptedPlayerShotCount = 0;
  let maximumActiveBeamCount = 0;
  let maximumNpcPersonalities = emptyCounts();
  let maximumBitPersonalities = emptyCounts();
  let maximumTargetedNpcPersonalities = emptyCounts();
  let maximumTargetedBitPersonalities = emptyCounts();
  let nextPlacementSeconds = 0;
  let nextCommandSeconds = 0;
  let nextShotSeconds = 0;
  let nextDoorSeconds = 0;
  let nextElevatorSeconds = 0;
  let doorIndex = 0;
  let placementCursor = 0;

  const executeRequest = (request: V2StressInputRequest): Omit<V2StressInput["result"], "executedAtSeconds"> => {
    switch (request.kind) {
      case "player-placement": {
        const frame = survival.getFrame();
        if (frame.phase !== "playing" || !frame.playerCanMove) return { accepted: false, resolvedPlacement: null };
        const humans = survival.getHumanTargets();
        const target = humans.find((human) => human.kind === "npc" && human.id === request.targetNpcId);
        if (target === undefined) return { accepted: false, resolvedPlacement: null };
        const eyeOffset = player.getEyePosition().subtract(player.getFootPosition());
        // 記録・再生とも同じ対象の現在位置へ、保存した順序の候補を投影する。
        for (const offset of request.approachOffsets) {
          const location = stage.navigation.projectPoint(target.footPosition.add(Vector3.FromArray(offset)), 0.1);
          if (location === null || !stage.boundary.contains(location.position)) continue;
          if (Vector3.DistanceSquared(location.position, target.footPosition) > 0.16 ||
            !hasPlacementNpcClearance(location.position, humans)) continue;
          const aim = location.position.add(eyeOffset);
          if (stage.queries.castSightSegment(aim, target.aimPosition) !== null) continue;
          const direction = target.aimPosition.subtract(aim).normalize();
          player.placeAt(location.position, location.position.add(direction));
          survival.relocateTargetNavigationArea("player", player.getFootPosition());
          camera.setTarget(player.getEyePosition().add(direction));
          camera.getViewMatrix(true);
          camera.getTransformationMatrix();
          return { accepted: true, resolvedPlacement: Object.freeze({ position: vectorTuple(player.getFootPosition()),
            lookDirection: vectorTuple(direction), approachOffset: offset, targetFootPosition: vectorTuple(target.footPosition) }) };
        }
        return { accepted: false, resolvedPlacement: null };
      }
      case "select-gun": {
        const frame = survival.getFrame();
        if (frame.phase !== "playing" || !frame.playerCompletionUnlocked) return { accepted: false };
        survival.selectPlayerCompletion("brainwash-complete-gun");
        return { accepted: true };
      }
      case "follow": return { accepted: survival.requestNpcCommand(request.npcId, "follow") };
      case "player-shot": {
        const accepted = survival.requestPlayerGunFire(Vector3.FromArray(request.direction));
        if (accepted) acceptedPlayerShotCount += 1;
        return { accepted };
      }
      case "door-toggle": return { accepted: dynamicRuntime.doors.requestDoorToggle(request.doorId).status === "started" };
      case "elevator-call": return { accepted: dynamicRuntime.getElevator(request.elevatorId)
        .requestCall(request.stopId).status === "accepted" };
    }
  };
  const submitRequest = (request: V2StressInputRequest, executedAtSeconds = elapsedSeconds): boolean => {
    const savedRequest = copyStressRequest(request);
    const result = executeRequest(savedRequest);
    inputs.push(Object.freeze({ request: savedRequest, result: Object.freeze({ executedAtSeconds, ...result }) }));
    return result.accepted;
  };
  const replay = replayInputs === null ? null : createV2StressInputReplay(replayInputs, submitRequest);

  const createPlacementRequest = (target: V2HumanTargetSnapshot): V2StressInputRequest => ({
    requestedAtSeconds: elapsedSeconds, kind: "player-placement", targetNpcId: target.id,
    approachOffsets: placementApproachOffsets, aimPolicy: "target-aim-position"
  });

  const observe = () => {
    const frame = survival.getFrame();
    minimumNpcCount = Math.min(minimumNpcCount, frame.npcCount);
    maximumActiveBeamCount = Math.max(maximumActiveBeamCount, frame.activeBeamCount);
    for (const target of survival.getHumanTargets()) {
      if (target.kind !== "npc") continue;
      if (Vector3.DistanceSquared(npcPositions.get(target.id)!, target.footPosition) > 0.0001) {
        movedNpcs.add(target.id);
      }
    }
    for (const actor of survival.getBitActors()) {
      // active sphereの初観測を開始点とする。出現しただけでは移動証拠に数えない。
      if (!bitFirstObservedPositions.has(actor.id)) {
        bitFirstObservedPositions.set(actor.id, actor.center.clone());
        continue;
      }
      if (Vector3.DistanceSquared(bitFirstObservedPositions.get(actor.id)!, actor.center) > 0.0001) {
        movedBits.add(actor.id);
      }
    }
    for (const door of dynamicRuntime.doors.getSnapshot().doors) {
      if (Math.abs(door.openness - doorOpenness.get(door.id)!) > 0.01) changedDoors.add(door.id);
    }
    for (const elevator of dynamicRuntime.elevators) {
      const snapshot = elevator.getSnapshot();
      const origin = elevatorOrigins.get(snapshot.id)!;
      if (snapshot.carState === "moving" &&
        Vector3.DistanceSquared(origin.position, snapshot.carPosition) > 0.0001) {
        movingElevators.add(snapshot.id);
      }
      if (movingElevators.has(snapshot.id) && snapshot.carState === "stopped" &&
        snapshot.currentStopId !== null && snapshot.currentStopId !== origin.stopId) {
        arrivedElevators.add(snapshot.id);
      }
    }
    const snapshot = survival.getStressWorkloadSnapshot();
    // 出現演出中のactive sphere数ではなく、BIT Runtimeが保持する実人口を使う。
    minimumBitCount = Math.min(minimumBitCount, snapshot.populationBitCount);
    maximumFollowerCount = Math.max(maximumFollowerCount, snapshot.followerIds.length);
    maximumNpcPersonalities = maximumCounts(maximumNpcPersonalities, snapshot.npcPersonalities);
    maximumBitPersonalities = maximumCounts(maximumBitPersonalities, snapshot.bitPersonalities);
    maximumTargetedNpcPersonalities = maximumCounts(maximumTargetedNpcPersonalities, snapshot.targetedNpcPersonalities);
    maximumTargetedBitPersonalities = maximumCounts(maximumTargetedBitPersonalities, snapshot.targetedBitPersonalities);
    for (const id of snapshot.scheduledFollowerShotIds) scheduledFollowers.add(id);
    // npcSystem.notifyBeamsSpawnedが実beam IDを受領した場合だけactiveへ進む。
    for (const id of snapshot.activeFollowerShotIds) {
      activeFollowers.add(id);
      if (!previousActiveFollowers.has(id)) followerShotActivationCount += 1;
    }
    previousActiveFollowers = new Set(snapshot.activeFollowerShotIds);
    return snapshot;
  };

  const update = (nextElapsedSeconds: number) => {
    if (disposed) throw new Error("破棄済みのstress workloadは更新できません。");
    if (!Number.isFinite(nextElapsedSeconds) || nextElapsedSeconds < elapsedSeconds) {
      throw new Error("stress workloadの実時間は単調増加の有限値が必要です。");
    }
    if (elapsedSeconds >= 120) return;
    const nextTime = Math.min(nextElapsedSeconds, 120);
    phaseSeconds[previousPhase] = (phaseSeconds[previousPhase] ?? 0) + nextTime - elapsedSeconds;
    elapsedSeconds = nextTime;
    const snapshot = observe();
    const frame = survival.getFrame();
    previousPhase = frame.phase;
    if (replay !== null) {
      replay.update(nextElapsedSeconds);
      return;
    }
    if (elapsedSeconds >= 120) return;

    if (elapsedSeconds >= nextDoorSeconds) {
      nextDoorSeconds = elapsedSeconds + 2;
      // Player近傍を選別しない動的負荷。各扉の通常閉鎖占有解決とrevision更新は保持する。
      for (let index = 0; index < Math.min(2, initialDoors.length); index += 1) {
        const door = initialDoors[doorIndex % initialDoors.length]!;
        doorIndex += 1;
        submitRequest({ requestedAtSeconds: elapsedSeconds, kind: "door-toggle", doorId: door.id });
      }
    }
    if (elapsedSeconds >= nextElevatorSeconds) {
      nextElevatorSeconds = elapsedSeconds + 4;
      for (const elevator of dynamicRuntime.elevators) {
        const current = elevator.getSnapshot();
        if (current.carState !== "stopped" || current.currentStopId === null) continue;
        const destination = current.stops.find((stop) => stop.id !== current.currentStopId)!;
        submitRequest({ requestedAtSeconds: elapsedSeconds, kind: "elevator-call", elevatorId: current.id,
          stopId: destination.id });
      }
    }
    if (frame.phase !== "playing") return;
    if (frame.playerCompletionUnlocked && frame.playerState !== "brainwash-complete-gun") {
      submitRequest({ requestedAtSeconds: elapsedSeconds, kind: "select-gun" });
    }
    const currentState = survival.getFrame().playerState;
    if (elapsedSeconds >= nextPlacementSeconds && survival.getFrame().playerCanMove) {
      nextPlacementSeconds = elapsedSeconds + 2;
      const followerIds = new Set(snapshot.followerIds);
      const targets = survival.getHumanTargets().filter((target) => target.kind === "npc" &&
        !followerIds.has(target.id) && (currentState === "brainwash-complete-gun"
          ? target.brainwashed && target.state.startsWith("brainwash-complete-")
          : target.state === "brainwash-complete-gun"));
      if (targets.length > 0) {
        const target = targets[placementCursor % targets.length]!;
        placementCursor += 1;
        submitRequest(createPlacementRequest(target));
      }
    }
    if (elapsedSeconds >= nextCommandSeconds) {
      nextCommandSeconds = elapsedSeconds + 0.5;
      for (const candidate of survival.getNpcCommandCandidates()) {
        if (candidate.commandMode === "follow") continue;
        submitRequest({ requestedAtSeconds: elapsedSeconds, kind: "follow", npcId: candidate.npcId });
      }
    }
    if (elapsedSeconds >= nextShotSeconds && currentState === "brainwash-complete-gun") {
      nextShotSeconds = elapsedSeconds + 1;
      const direction = camera.getForwardRay().direction;
      submitRequest({ requestedAtSeconds: elapsedSeconds, kind: "player-shot", direction: vectorTuple(direction) });
    }
  };

  const getReport = (): V2PerformanceStressWorkloadReport => {
    const evidence: V2StressWorkloadEvidence = Object.freeze({
      elapsedSeconds, initialPlayerCount: initialHumans.filter((target) => target.kind === "player").length,
      initialNpcCount: initialFrame.npcCount, initialBrainwashedNpcCount: initialFrame.brainwashedNpcCount,
      initialBitCount: initialFrame.bitCount, minimumNpcCount, minimumBitCount,
      roomCount: stage.roomVariantSelection.length,
      disorderedRoomCount: stage.roomVariantSelection.filter((room) => room.variant === "disordered").length,
      changedDoorIds: sortedIds(changedDoors), movingElevatorIds: sortedIds(movingElevators),
      arrivedElevatorIds: sortedIds(arrivedElevators), movedNpcIds: sortedIds(movedNpcs), movedBitIds: sortedIds(movedBits),
      maximumFollowerCount, scheduledFollowerIds: sortedIds(scheduledFollowers), activeFollowerIds: sortedIds(activeFollowers),
      followerShotActivationCount, acceptedPlayerShotCount, maximumActiveBeamCount,
      maximumNpcPersonalities, maximumBitPersonalities, maximumTargetedNpcPersonalities, maximumTargetedBitPersonalities
    });
    const replayReport = replay?.getReport() ?? null;
    const missingEvidence = [...findV2StressWorkloadMissingEvidence(evidence)];
    if (replayReport !== null && replayReport.executedInputCount !== replayReport.sourceInputCount) {
      missingEvidence.push("保存した再生入力の全件実行");
    }
    if (inputs.some((input) => input.result.executedAtSeconds >= 120)) {
      missingEvidence.push("再生入力の120秒計測区間内での実行");
    }
    return Object.freeze({
      version: 3, inputMode: replay === null ? "record" : "replay",
      status: disposed ? "disposed" : elapsedSeconds < 120 ? "running" :
        missingEvidence.length === 0 ? "completed" : "incomplete",
      evidence, missingEvidence: Object.freeze(missingEvidence), phaseSeconds: Object.freeze({ ...phaseSeconds }),
      inputs: Object.freeze([...inputs]),
      unavailablePlacementAttemptCount: inputs.filter((input) =>
        input.request.kind === "player-placement" && !input.result.accepted).length,
      replay: replayReport,
      fixtureInterventions: Object.freeze([
        "2秒ごとにNPC IDと接近offset・対象照準方針を要求し、現在位置からNavMesh上のPlayer配置先を解決して結果へ記録する。",
        "2秒ごとに2枚の通常扉へtoggle要求、4秒ごとに停止中エレベーターの別停止階へ呼出要求する。",
        "Followは通常の状態・距離・視線判定を通し人数上限を設けない。自然洗脳後のG相当選択と1秒ごとの射撃要求を行う。",
        "replayでは保存した対象ID・接近候補・照準方針を同じ時刻と順序で実行する。配置未成立はresolvedPlacement=nullと許否falseで保存する。"
      ]),
      synchronizedFireEvidence: "activeFollowerIdsはNPC notifyBeamsSpawnedが実beam IDを受領してactiveへ遷移した観測。予約のみは生成済みに含めない。"
    });
  };
  return Object.freeze({ update, getReport, dispose: () => { disposed = true; } });
};
