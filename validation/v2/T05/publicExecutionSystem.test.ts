import { Vector3 } from "@babylonjs/core";

import {
  createV2PublicExecutionSystem,
  V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS,
  V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS,
  V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS,
  V2_PUBLIC_EXECUTION_SIMULTANEOUS_CHANCE,
  V2_PUBLIC_EXECUTION_TRIGGER_SECONDS,
  type V2ExecutionBlock,
  type V2ExecutionCandidateInput,
  type V2ExecutionShooterPools
} from "../../../src/v2/publicExecutionSystem";
import type { V2HumanTargetSnapshot } from "../../../src/v2/combatTypes";
import type { StageAssemblyVenue } from "../../../src/world/stageSpatialContext";

export type PublicExecutionSystemTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => string
): PublicExecutionSystemTestResult => {
  try {
    return Object.freeze({
      name,
      ok: true,
      detail: operation()
    });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail:
        error instanceof Error
          ? error.stack ?? error.message
          : String(error)
    });
  }
};

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-9
) => Math.abs(actual - expected) <= tolerance;

const createRandomSequence = (values: readonly number[]) => {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`公開処刑テスト乱数列を使い切りました: index=${index}`);
    }
    index += 1;
    return value;
  };
};

const createHuman = (
  id: string,
  kind: V2HumanTargetSnapshot["kind"] = "npc"
): V2HumanTargetSnapshot => {
  const footPosition = new Vector3(0, 0, 0);
  const aimPosition = new Vector3(0, 0.45, 0);
  return Object.freeze({
    id,
    kind,
    footPosition,
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: new Vector3(0.16, 0.45, 0.16)
    }),
    state: "normal",
    alive: true,
    brainwashed: false
  });
};

const createNpcBlocks = (
  survivors: readonly V2HumanTargetSnapshot[]
): readonly V2ExecutionBlock[] =>
  Object.freeze(
    survivors.map((survivor, index) =>
      Object.freeze({
        targetId: survivor.id,
        blockerId: `npc-blocker-${index}`,
        blockerKind: "npc" as const
      })
    )
  );

const createInput = (
  survivors: readonly V2HumanTargetSnapshot[],
  blocks: readonly V2ExecutionBlock[],
  bitShooterCount: number
): V2ExecutionCandidateInput =>
  Object.freeze({
    survivors: Object.freeze([...survivors]),
    blocks: Object.freeze([...blocks]),
    bitShooterCount
  });

const center = new Vector3(10, 1, -5);
const createVenue = (id: string): StageAssemblyVenue =>
  Object.freeze({
    id,
    anchor: {} as StageAssemblyVenue["anchor"],
    volume: {} as StageAssemblyVenue["volume"],
    center: center.clone(),
    selectionWeight: 1,
    assemblyPositions: Object.freeze(
      Array.from(
        { length: 10 },
        (_, index) => new Vector3(index, 1, -5)
      )
    ),
    executionAudiencePositions: Object.freeze(
      Array.from(
        { length: 8 },
        (_, index) => {
          const angle = Math.PI * 2 * index / 8;
          return new Vector3(
            center.x + Math.cos(angle) * 4,
            center.y,
            center.z + Math.sin(angle) * 4
          );
        }
      )
    ),
    executionTargetPositions: Object.freeze(
      Array.from(
        { length: V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS },
        (_, index) =>
          new Vector3(
            center.x + index - 2.5,
            center.y,
            center.z
          )
      )
    )
  });

const venueCourtyard = createVenue("courtyard");

const createShooterPools = (
  bitCount: number,
  npcCount: number
): V2ExecutionShooterPools =>
  Object.freeze({
    bitShooterIds: Object.freeze(
      Array.from({ length: bitCount }, (_, index) => `bit-${index}`)
    ),
    npcShooterIds: Object.freeze(
      Array.from({ length: npcCount }, (_, index) => `shooter-npc-${index}`)
    ),
    playerShooterId: "player"
  });

const requireCandidate = (
  input: V2ExecutionCandidateInput
) => {
  const system = createV2PublicExecutionSystem(
    createRandomSequence([])
  );
  const candidate = system.findCandidate(input);
  if (!candidate) {
    throw new Error("成立するはずの公開処刑候補がnullです");
  }
  return candidate;
};

const testCandidateBoundariesAndBlocks = () => {
  const system = createV2PublicExecutionSystem(
    createRandomSequence([])
  );
  const one = Object.freeze([createHuman("npc-0")]);
  const six = Object.freeze(
    Array.from(
      { length: V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS },
      (_, index) => createHuman(`npc-${index}`)
    )
  );
  const seven = Object.freeze([
    ...six,
    createHuman(`npc-${V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS}`)
  ]);

  assert(
    system.findCandidate(createInput([], [], 6)) === null,
    "生存者0人で候補が成立しました"
  );
  assert(
    system.findCandidate(
      createInput(seven, createNpcBlocks(seven), 6)
    ) === null,
    "生存者7人で候補が成立しました"
  );
  assert(
    system.findCandidate(
      createInput(one, createNpcBlocks(one), 6)
    ) !== null,
    "生存者1人で候補が成立しません"
  );
  assert(
    system.findCandidate(
      createInput(six, createNpcBlocks(six), 6)
    ) !== null,
    "生存者6人で候補が成立しません"
  );
  assert(
    system.findCandidate(
      createInput(
        six,
        createNpcBlocks(six).slice(0, six.length - 1),
        6
      )
    ) === null,
    "全対象が妨害されていないのに候補が成立しました"
  );

  const player = Object.freeze([createHuman("player", "player")]);
  const playerBlockedByPlayer = Object.freeze([
    Object.freeze({
      targetId: "player",
      blockerId: "player",
      blockerKind: "player" as const
    })
  ]);
  assert(
    system.findCandidate(
      createInput(player, playerBlockedByPlayer, 6)
    ) === null,
    "プレイヤー生存者がNPC以外の妨害で候補になりました"
  );

  return "0人・7人・未妨害を拒否し、1人・6人・全対象妨害を受理";
};

const testCandidateStability = () => {
  const system = createV2PublicExecutionSystem(
    createRandomSequence([])
  );
  const survivorA = Object.freeze([createHuman("npc-a")]);
  const survivorB = Object.freeze([createHuman("npc-b")]);
  const inputA = createInput(
    survivorA,
    createNpcBlocks(survivorA),
    6
  );
  const inputB = createInput(
    survivorB,
    createNpcBlocks(survivorB),
    6
  );

  assert(
    system.advanceCandidate(0.6, inputA) === null,
    "候補維持0.6秒で成立しました"
  );
  assert(
    system.advanceCandidate(0.5, inputB) === null,
    "候補集合変更後の0.5秒で成立しました"
  );
  const candidate = system.advanceCandidate(0.5, inputB);
  assert(candidate?.targets[0]?.id === "npc-b", "1秒維持後の候補が不正です");

  const invalid = createInput(survivorA, [], 6);
  assert(
    system.advanceCandidate(0.7, inputA) === null,
    "再開後0.7秒で候補が成立しました"
  );
  assert(
    system.advanceCandidate(0.4, invalid) === null,
    "妨害解除時に候補が成立しました"
  );
  assert(
    system.advanceCandidate(0.4, inputA) === null,
    "妨害解除後の再開0.4秒で候補が成立しました"
  );

  return `候補key変更・妨害解除で計時をリセットし${V2_PUBLIC_EXECUTION_TRIGGER_SECONDS}秒維持`;
};

const testVariantsAndShooterSelection = () => {
  const player = createHuman("player", "player");
  const npcA = createHuman("npc-a");
  const npcB = createHuman("npc-b");

  const playerSurvivors = Object.freeze([player, npcA]);
  const playerCandidate = requireCandidate(
    createInput(
      playerSurvivors,
      createNpcBlocks(playerSurvivors),
      6
    )
  );
  assert(
    playerCandidate.variant === "player-survivor" &&
      playerCandidate.playerRole === "target" &&
      !playerCandidate.usesNpcVolley,
    "player-survivorの役割またはbit斉射判定が不正です"
  );

  const playerBlockCandidate = requireCandidate(
    createInput(
      [npcA, npcB],
      [
        {
          targetId: npcA.id,
          blockerId: "player",
          blockerKind: "player"
        },
        {
          targetId: npcB.id,
          blockerId: "npc-blocker",
          blockerKind: "npc"
        }
      ],
      0
    )
  );
  assert(
    playerBlockCandidate.variant ===
      "npc-survivor-player-block" &&
      playerBlockCandidate.playerRole === "shooter" &&
      !playerBlockCandidate.usesNpcVolley,
    "player妨害variantの役割または射手種別が不正です"
  );

  const npcBlockInput = createInput(
    [npcA, npcB],
    createNpcBlocks([npcA, npcB]),
    V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS - 1
  );
  const npcBlockCandidate = requireCandidate(npcBlockInput);
  assert(
    npcBlockCandidate.variant === "npc-survivor-npc-block" &&
      npcBlockCandidate.playerRole === "observer" &&
      npcBlockCandidate.usesNpcVolley,
    "NPC妨害variantまたはbit不足時NPC斉射判定が不正です"
  );

  const bitCandidate = requireCandidate(
    createInput(
      [npcA, npcB],
      createNpcBlocks([npcA, npcB]),
      V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS
    )
  );
  assert(
    !bitCandidate.usesNpcVolley,
    "bitが6体あるのにNPC斉射になりました"
  );

  const npcSystem = createV2PublicExecutionSystem(
    createRandomSequence([
      0.9,
      0.1,
      0.2,
      0.3,
      0.4,
      0,
      0
    ])
  );
  const npcFrame = npcSystem.enter(
    npcBlockCandidate,
    venueCourtyard,
    [],
    createShooterPools(5, 5)
  );
  assert(
    npcFrame.assignments.every(
      (assignment) => assignment.originKind === "execution-npc"
    ),
    "bit不足時のoriginKindがexecution-npcではありません"
  );

  const playerSystem = createV2PublicExecutionSystem(() => {
    throw new Error("player手動処刑で乱数を消費しました");
  });
  const playerFrame = playerSystem.enter(
    playerBlockCandidate,
    venueCourtyard,
    [],
    createShooterPools(0, 0)
  );
  assert(
    playerFrame.assignments.every(
      (assignment) =>
        assignment.originKind === "execution-player" &&
        assignment.shooterIds.length === 1 &&
        assignment.shooterIds[0] === "player"
    ),
    "player手動処刑の割当が不正です"
  );
  assert(
    playerSystem.update(V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS * 2)
      .length === 0,
    "player手動処刑で自動ShotEventが発行されました"
  );

  return "player・NPC・bitの3射手種別とbit 6体未満のNPC斉射を確認";
};

const testRoundRobinAssignments = () => {
  const survivors = Object.freeze(
    Array.from({ length: 3 }, (_, index) =>
      createHuman(`target-${index}`)
    )
  );
  const candidate = requireCandidate(
    createInput(
      survivors,
      createNpcBlocks(survivors),
      V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS
    )
  );
  const system = createV2PublicExecutionSystem(
    createRandomSequence([0.9, 0, 0, 0])
  );
  const frame = system.enter(
    candidate,
    venueCourtyard,
    [],
    createShooterPools(8, 0)
  );
  const assignmentCounts = frame.assignments.map(
    (assignment) => assignment.shooterIds.length
  );
  const assignedIds = frame.assignments.flatMap(
    (assignment) => assignment.shooterIds
  );

  assert(
    assignmentCounts.join(",") === "3,3,2",
    `8射手の均等割当が不正です: ${assignmentCounts.join(",")}`
  );
  assert(
    new Set(assignedIds).size === 8 && assignedIds.length === 8,
    "射手が重複割当または未割当です"
  );
  assert(
    frame.assignments.every(
      (assignment) => assignment.originKind === "execution-bit"
    ),
    "bit斉射のoriginKindが不正です"
  );

  return `8射手を3対象へ${assignmentCounts.join("/")}で均等割当`;
};

const testManualPlayerCompletionPendingTargets = () => {
  const survivors = Object.freeze([
    createHuman("target-a"),
    createHuman("target-b")
  ]);
  const candidate = requireCandidate(
    createInput(
      survivors,
      [
        {
          targetId: "target-a",
          blockerId: "player",
          blockerKind: "player"
        },
        {
          targetId: "target-b",
          blockerId: "player",
          blockerKind: "player"
        }
      ],
      0
    )
  );
  assert(
    candidate.variant === "npc-survivor-player-block",
    "手動完了回帰テストの候補variantが不正です"
  );

  const system = createV2PublicExecutionSystem(() => {
    throw new Error("player手動処刑で乱数を消費しました");
  });
  const entered = system.enter(
    candidate,
    venueCourtyard,
    [],
    createShooterPools(0, 0)
  );
  assert(
    entered.assignments.every(
      (assignment) => assignment.originKind === "execution-player"
    ) &&
      entered.pendingTargetIds.join(",") === "target-a,target-b" &&
      entered.completedTargetIds.length === 0,
    "player手動処刑の初期pending/completedが不正です"
  );

  assert(
    system.notifyTargetCompleted("target-a"),
    "player手動処刑の最初の完了通知を受理しません"
  );
  const partiallyCompleted = system.getFrame();
  assert(
    partiallyCompleted.phase === "execution" &&
      partiallyCompleted.pendingTargetIds.join(",") === "target-b" &&
      partiallyCompleted.completedTargetIds.join(",") === "target-a",
    "player手動処刑の完了対象がpendingから除外されません"
  );

  assert(
    system.notifyTargetCompleted("target-b"),
    "player手動処刑の最後の完了通知を受理しません"
  );
  const completed = system.getFrame();
  assert(
    completed.phase === "complete" &&
      completed.pendingTargetIds.length === 0 &&
      completed.completedTargetIds.join(",") === "target-a,target-b",
    "player手動処刑の全完了後phaseまたはpendingが不正です"
  );

  const replayed = system.replay();
  assert(
    replayed.phase === "execution" &&
      replayed.pendingTargetIds.join(",") === "target-a,target-b" &&
      replayed.completedTargetIds.length === 0,
    "player手動処刑のリプレイでpending/completedを初期化しません"
  );

  return "execution-playerの手動完了でpendingを減らし、全完了・リプレイ初期化を確認";
};

const testSimultaneousAndIndividualTiming = () => {
  const survivors = Object.freeze([
    createHuman("target-a"),
    createHuman("target-b")
  ]);
  const candidate = requireCandidate(
    createInput(
      survivors,
      createNpcBlocks(survivors),
      V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS
    )
  );
  const shooters = createShooterPools(6, 0);

  const simultaneousSystem = createV2PublicExecutionSystem(
    createRandomSequence([
      V2_PUBLIC_EXECUTION_SIMULTANEOUS_CHANCE - 0.000001,
      0.5
    ])
  );
  const simultaneousFrame = simultaneousSystem.enter(
    candidate,
    venueCourtyard,
    [],
    shooters
  );
  assert(simultaneousFrame.simultaneous, "30%側が同時斉射になりません");
  const sharedDelay =
    V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS +
    0.5 *
      (V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS -
        V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS);
  assert(
    simultaneousSystem.update(sharedDelay - 0.001).length === 0,
    "共有待機時間より前に同時斉射しました"
  );
  const simultaneousEvents = simultaneousSystem.update(0.002);
  assert(
    simultaneousEvents.length === 2,
    "共有待機時間に全対象を同時斉射しませんでした"
  );

  const individualSystem = createV2PublicExecutionSystem(
    createRandomSequence([
      V2_PUBLIC_EXECUTION_SIMULTANEOUS_CHANCE,
      0,
      0.999999
    ])
  );
  const individualFrame = individualSystem.enter(
    candidate,
    venueCourtyard,
    [],
    shooters
  );
  assert(!individualFrame.simultaneous, "70%側が個別斉射になりません");
  const firstEvents = individualSystem.update(
    V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS
  );
  assert(
    firstEvents.length === 1 &&
      firstEvents[0].targetId === "target-a",
    "最短2秒の対象だけが先に発射されませんでした"
  );
  assert(
    individualSystem.update(
      V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS -
        V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS
    ).length === 1,
    "最長8秒未満の対象が時間差発射されませんでした"
  );

  return `同時確率境界${V2_PUBLIC_EXECUTION_SIMULTANEOUS_CHANCE}、待機${V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS}～${V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS}秒`;
};

const testVenueCompletionAndReplay = () => {
  const survivors = Object.freeze([
    createHuman("target-a"),
    createHuman("target-b")
  ]);
  const candidate = requireCandidate(
    createInput(
      survivors,
      createNpcBlocks(survivors),
      V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS - 1
    )
  );
  const system = createV2PublicExecutionSystem(
    createRandomSequence([
      0.1,
      0.9,
      0.9,
      0.2,
      0.9,
      0,
      0,
      0,
      0.999999
    ])
  );
  const entered = system.enter(
    candidate,
    venueCourtyard,
    ["audience-a", "audience-b"],
    createShooterPools(5, 3)
  );
  const firstPlacements = entered.placements.map(
    (placement) => placement.position.clone()
  );
  const firstAssignments = entered.assignments.map(
    (assignment) => assignment.shooterIds.join(",")
  );
  assert(
    entered.venueId === venueCourtyard.id &&
      entered.placements.length === 4 &&
      entered.simultaneous &&
      entered.assignments.every(
        (assignment) => assignment.originKind === "execution-npc"
      ),
    "初回会場・配置・同時抽選・NPC割当が不正です"
  );
  assert(
    system.update(V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS).length === 2,
    "初回斉射イベントが全対象分ではありません"
  );
  assert(
    system.notifyTargetCompleted("target-a"),
    "最初の対象完了通知を受理しません"
  );
  assert(
    system.getFrame().phase === "execution",
    "一部完了だけで公開処刑が完了しました"
  );
  assert(
    !system.notifyTargetCompleted("target-a") &&
      !system.notifyTargetCompleted("unknown"),
    "重複または未知対象の完了通知を受理しました"
  );
  assert(
    system.notifyTargetCompleted("target-b"),
    "最後の対象完了通知を受理しません"
  );
  const completed = system.getFrame();
  assert(
    completed.phase === "complete" &&
      completed.pendingTargetIds.length === 0 &&
      completed.completedTargetIds.length === 2,
    "全対象完了後のphase・pendingまたは完了一覧が不正です"
  );

  const replayed = system.replay();
  assert(
    replayed.phase === "execution" &&
      replayed.venueId === venueCourtyard.id &&
      replayed.candidate === entered.candidate &&
      !replayed.simultaneous &&
      replayed.pendingTargetIds.join(",") === "target-a,target-b" &&
      replayed.completedTargetIds.length === 0,
    "リプレイが同じ会場・候補を維持して進行・抽選・完了状態を初期化しません"
  );
  assert(
    replayed.placements.every(
      (placement, index) =>
        placement.position !== firstPlacements[index] &&
        approximately(
          Vector3.Distance(
            placement.position,
            firstPlacements[index]
          ),
          0
        )
    ),
    "リプレイ配置の値維持またはclone分離が不正です"
  );
  assert(
    replayed.assignments.every(
      (assignment, index) =>
        assignment.originKind === "execution-npc" &&
        assignment.shooterIds.join(",") !== firstAssignments[index]
    ),
    "リプレイでNPC射手割当を再抽選していません"
  );
  const replayFirstEvents = system.update(
    V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS
  );
  assert(
    replayFirstEvents.length === 1 &&
      replayFirstEvents[0].targetId === "target-a",
    "リプレイで時間差待機を再抽選していません"
  );

  return "全対象完了通知でcomplete、リプレイは同一会場・候補・配置を維持して同時判定・待機・NPC割当を再抽選";
};

export const runPublicExecutionSystemTests =
  (): readonly PublicExecutionSystemTestResult[] => [
    executeTest(
      "候補人数境界と全対象妨害を判定する",
      testCandidateBoundariesAndBlocks
    ),
    executeTest(
      "候補を同一条件で1秒維持する",
      testCandidateStability
    ),
    executeTest(
      "player・NPC・bitの射手variantを選ぶ",
      testVariantsAndShooterSelection
    ),
    executeTest(
      "射手を対象へ均等割当する",
      testRoundRobinAssignments
    ),
    executeTest(
      "player手動処刑のpendingと完了状態を更新する",
      testManualPlayerCompletionPendingTargets
    ),
    executeTest(
      "30%同時斉射と2～8秒の時間差を判定する",
      testSimultaneousAndIndividualTiming
    ),
    executeTest(
      "会場維持・完了通知・リプレイ再抽選を行う",
      testVenueCompletionAndReplay
    )
  ];
