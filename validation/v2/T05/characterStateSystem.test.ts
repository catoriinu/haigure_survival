import {
  createV2CharacterStateSystem,
  V2_HIT_FADE_DURATION_SECONDS,
  V2_HIT_FLICKER_DURATION_SECONDS,
  V2_NO_GUN_TOUCH_BRAINWASH_DURATION_SECONDS,
  V2_NPC_BRAINWASH_DECISION_SECONDS,
  V2_NPC_HAIGURE_DECISION_SECONDS
} from "../../../src/v2/characterStateSystem";
import {
  isV2AliveState,
  isV2BrainwashState,
  isV2HitState,
  type V2CharacterState
} from "../../../src/v2/combatTypes";
import { createV2PlayerCombatSystem } from "../../../src/v2/playerCombatSystem";

export type CharacterStateSystemTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => string
): CharacterStateSystemTestResult => {
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
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (operation: () => void, message: string) => {
  let thrown = false;
  try {
    operation();
  } catch {
    thrown = true;
  }
  assert(thrown, message);
};

const createRandomSequence = (values: readonly number[]) => {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`乱数列を使い切りました: index=${index}`);
    }
    index += 1;
    return value;
  };
};

const testStatePredicates = () => {
  const states: readonly V2CharacterState[] = [
    "normal",
    "evade",
    "hit-a",
    "hit-b",
    "brainwash-in-progress",
    "brainwash-complete-gun",
    "brainwash-complete-no-gun",
    "brainwash-complete-haigure",
    "brainwash-complete-haigure-formation"
  ];
  assert(states.filter(isV2AliveState).length === 2, "alive状態数が不正です。");
  assert(states.filter(isV2HitState).length === 2, "hit状態数が不正です。");
  assert(
    states.filter(isV2BrainwashState).length === 5,
    "brainwash状態数が不正です。"
  );
  return "9状態をalive=2、hit=2、brainwash=5へ分類";
};

const testPlayerHitSequence = () => {
  const system = createV2CharacterStateSystem({
    kind: "player",
    initialState: "normal",
    instantBrainwash: false,
    npcCompletionPercentages: null,
    random: createRandomSequence([])
  });
  const accepted = system.applyImpact({
    sourceId: "v2_bit_7",
    originKind: "bit-chase"
  });
  assert(accepted, "生存プレイヤーが命中を受理しませんでした。");
  system.update(0.120001);
  assert(system.getSnapshot().state === "hit-b", "0.12秒後にhit-bではありません。");
  system.update(V2_HIT_FLICKER_DURATION_SECONDS - 0.120001);
  assert(system.getSnapshot().hitPhase === "fade", "3秒後にfadeではありません。");
  assert(system.getSnapshot().state === "hit-a", "fade中がhit-aではありません。");
  system.update(V2_HIT_FADE_DURATION_SECONDS);
  const brainwash = system.getSnapshot();
  assert(
    brainwash.state === "brainwash-in-progress",
    "fade完了後にbrainwash-in-progressではありません。"
  );
  assert(
    brainwash.playerCompletionUnlocked,
    "fade完了直後にプレイヤー選択が解放されません。"
  );
  assert(
    brainwash.hitSourceId === "v2_bit_7" &&
      brainwash.hitOriginKind === "bit-chase",
    "命中元が保持されていません。"
  );
  assert(
    !system.applyImpact({
      sourceId: "v2_bit_8",
      originKind: "bit-fixed"
    }),
    "非alive状態が再命中を受理しました。"
  );
  system.selectPlayerCompletion("brainwash-complete-gun");
  assert(
    system.getSnapshot().state === "brainwash-complete-gun",
    "G相当の完了状態を選択できません。"
  );
  return "3秒点滅、1秒fade、即時選択、命中元保持";
};

const testNpcBrainwashTransitions = () => {
  const system = createV2CharacterStateSystem({
    kind: "npc",
    initialState: "brainwash-in-progress",
    instantBrainwash: false,
    npcCompletionPercentages: Object.freeze({ gun: 45, noGun: 45 }),
    random: createRandomSequence([0.25, 0.75, 0.05, 0.2, 0.4])
  });
  system.update(V2_NPC_BRAINWASH_DECISION_SECONDS);
  assert(
    system.getSnapshot().state === "brainwash-in-progress",
    "50%継続判定が反映されません。"
  );
  system.update(V2_NPC_BRAINWASH_DECISION_SECONDS);
  assert(
    system.getSnapshot().state === "brainwash-complete-haigure",
    "50%ハイグレ遷移が反映されません。"
  );
  system.update(V2_NPC_HAIGURE_DECISION_SECONDS);
  assert(
    system.getSnapshot().state === "brainwash-complete-haigure",
    "10%ハイグレ継続が反映されません。"
  );
  system.update(V2_NPC_HAIGURE_DECISION_SECONDS);
  assert(
    system.getSnapshot().state === "brainwash-complete-gun",
    "45%gun遷移が反映されません。"
  );
  return "in-progress 50/50、haigure 45/45/10のgun経路";
};

const testNpcNoGunTransition = () => {
  const system = createV2CharacterStateSystem({
    kind: "npc",
    initialState: "brainwash-complete-haigure",
    instantBrainwash: false,
    npcCompletionPercentages: Object.freeze({ gun: 45, noGun: 45 }),
    random: createRandomSequence([0.2, 0.8])
  });
  system.update(V2_NPC_HAIGURE_DECISION_SECONDS);
  assert(
    system.getSnapshot().state === "brainwash-complete-no-gun",
    "45%no-gun遷移が反映されません。"
  );
  return "haigure 45/45/10のno-gun経路";
};

const testStrictBehaviorTransitions = () => {
  const aliveNpc = createV2CharacterStateSystem({
    kind: "npc",
    initialState: "normal",
    instantBrainwash: false,
    npcCompletionPercentages: Object.freeze({ gun: 45, noGun: 45 }),
    random: createRandomSequence([])
  });
  assert(
    aliveNpc.setAliveBehaviorState("evade"),
    "alive NPCのevade切替が受理されません。"
  );
  assert(aliveNpc.getSnapshot().state === "evade", "evadeへ切り替わりません。");
  aliveNpc.applyImpact({
    sourceId: "v2_bit_9",
    originKind: "bit-random"
  });
  assert(
    !aliveNpc.setAliveBehaviorState("normal"),
    "hit NPCがalive行動切替を受理しました。"
  );
  assert(
    !aliveNpc.enterFormationState(),
    "hit NPCが集合状態への遷移を受理しました。"
  );

  const brainwashedNpc = createV2CharacterStateSystem({
    kind: "npc",
    initialState: "brainwash-complete-no-gun",
    instantBrainwash: false,
    npcCompletionPercentages: Object.freeze({ gun: 45, noGun: 45 }),
    random: createRandomSequence([])
  });
  assert(
    brainwashedNpc.enterFormationState(),
    "brainwash NPCの集合遷移が受理されません。"
  );
  assert(
    brainwashedNpc.getSnapshot().state ===
      "brainwash-complete-haigure-formation",
    "集合状態へ切り替わりません。"
  );
  return "alive限定normal/evade、brainwash NPC限定formation";
};

const testScriptedExecutionTransitions = () => {
  const hitAudience = createV2CharacterStateSystem({
    kind: "npc",
    initialState: "hit-b",
    instantBrainwash: false,
    npcCompletionPercentages: Object.freeze({ gun: 45, noGun: 45 }),
    random: createRandomSequence([])
  });
  hitAudience.prepareExecutionAudience();
  const audience = hitAudience.getSnapshot();
  assert(
    audience.state === "brainwash-complete-haigure-formation" &&
      audience.hitPhase === "none" &&
      audience.hitSourceId === null,
    "hit途中の観客が集合状態へ正規化されません。"
  );

  const brainwashedShooter = createV2CharacterStateSystem({
    kind: "player",
    initialState: "brainwash-in-progress",
    instantBrainwash: false,
    npcCompletionPercentages: null,
    random: createRandomSequence([])
  });
  brainwashedShooter.prepareExecutionShooter();
  const shooter = brainwashedShooter.getSnapshot();
  assert(
    shooter.state === "brainwash-complete-gun" &&
      !shooter.playerCompletionUnlocked,
    "公開処刑の射手がgun状態へ正規化されません。"
  );

  const alive = createV2CharacterStateSystem({
    kind: "npc",
    initialState: "evade",
    instantBrainwash: false,
    npcCompletionPercentages: Object.freeze({ gun: 45, noGun: 45 }),
    random: createRandomSequence([])
  });
  assertThrows(
    () => alive.prepareExecutionAudience(),
    "alive対象への観客強制遷移が拒否されません。"
  );
  assertThrows(
    () => alive.prepareExecutionShooter(),
    "alive対象への射手強制遷移が拒否されません。"
  );
  assert(
    alive.getSnapshot().state === "evade",
    "拒否した公開処刑遷移で状態が変化しました。"
  );
  return "hit/brainwashを観客・射手へ正規化、alive誤用はthrow";
};

const testInstantBrainwash = () => {
  const player = createV2CharacterStateSystem({
    kind: "player",
    initialState: "normal",
    instantBrainwash: true,
    npcCompletionPercentages: null,
    random: createRandomSequence([])
  });
  player.applyImpact({
    sourceId: "npc_0",
    originKind: "npc-no-gun-touch"
  });
  assert(player.getSnapshot().state === "hit-a", "即時洗脳ONのPlayerがhit-aを経ません。");
  player.update(0.120001);
  assert(player.getSnapshot().state === "hit-b", "即時洗脳ONのPlayerがhit-bを経ません。");
  player.update(
    V2_HIT_FLICKER_DURATION_SECONDS - 0.120001 +
      V2_HIT_FADE_DURATION_SECONDS
  );
  const playerSnapshot = player.getSnapshot();
  assert(
    playerSnapshot.state === "brainwash-complete-haigure" &&
      playerSnapshot.hitPhase === "none" &&
      playerSnapshot.playerCompletionUnlocked,
    "即時洗脳ONのPlayerが命中演出後に洗脳中を飛ばして完了しません。"
  );

  const npc = createV2CharacterStateSystem({
    kind: "npc",
    initialState: "normal",
    instantBrainwash: true,
    npcCompletionPercentages: Object.freeze({ gun: 0, noGun: 100 }),
    random: createRandomSequence([0.75])
  });
  npc.applyImpact({
    sourceId: "npc_1",
    originKind: "npc-no-gun-touch"
  });
  assert(npc.getSnapshot().state === "hit-a", "即時洗脳ONのNPCがhit-aを経ません。");
  npc.update(0.120001);
  assert(npc.getSnapshot().state === "hit-b", "即時洗脳ONのNPCがhit-bを経ません。");
  npc.update(
    V2_HIT_FLICKER_DURATION_SECONDS - 0.120001 +
      V2_HIT_FADE_DURATION_SECONDS
  );
  const npcSnapshot = npc.getSnapshot();
  assert(
    npcSnapshot.state === "brainwash-complete-no-gun" &&
      npcSnapshot.hitPhase === "none",
    "即時洗脳ONのNPCが命中演出後に設定比率の完了状態へ遷移しません。"
  );
  return "Player・NPCともhit-a/hit-b後、洗脳中を飛ばして完了";
};

const testNoGunTouchBrainwash = () => {
  const player = createV2CharacterStateSystem({
    kind: "player",
    initialState: "normal",
    instantBrainwash: false,
    npcCompletionPercentages: null,
    random: createRandomSequence([])
  });
  assert(
    player.applyNoGunTouchBrainwash({
      sourceId: "npc_0",
      originKind: "npc-no-gun-touch"
    }),
    "銃なし接触洗脳を受理しません。"
  );
  assert(
    player.getSnapshot().state === "hit-a" &&
      player.getSnapshot().hitPhase === "none" &&
      player.getSnapshot().noGunTouchBrainwashProgress === 0,
    "銃なし接触洗脳が専用合成演出で開始しません。"
  );
  player.update(V2_NO_GUN_TOUCH_BRAINWASH_DURATION_SECONDS / 2);
  assert(
    player.getSnapshot().noGunTouchBrainwashProgress === 0.5,
    "銃なし接触洗脳の合成進捗が不正です。"
  );
  player.update(V2_NO_GUN_TOUCH_BRAINWASH_DURATION_SECONDS / 2);
  assert(
    player.getSnapshot().state === "brainwash-in-progress" &&
      player.getSnapshot().noGunTouchBrainwashProgress === null,
    "銃なし接触洗脳が4秒後に洗脳中へ遷移しません。"
  );
  return "光線命中phaseなし、4秒のhit-b→hit-a合成進捗後に洗脳中";
};

const testPlayerCombatStateWrapper = () => {
  const player = createV2PlayerCombatSystem({
    playerId: "player",
    initialState: "normal",
    instantBrainwash: false,
    random: createRandomSequence([])
  });
  assert(
    player.setAliveBehaviorState("evade") &&
      player.getStateSnapshot().state === "evade",
    "player wrapperでevadeへ切り替えられません。"
  );
  player.prepareExecutionTarget();
  assert(
    player.getStateSnapshot().state === "evade",
    "player wrapperで処刑対象状態を準備できません。"
  );
  player.applyImpact({
    sourceId: "bit_0",
    originKind: "bit-chase"
  });
  player.prepareExecutionAudience();
  assert(
    player.getStateSnapshot().state ===
      "brainwash-complete-haigure-formation",
    "player wrapperで公開処刑観客を準備できません。"
  );
  player.prepareExecutionShooter();
  assert(
    player.getStateSnapshot().state === "brainwash-complete-gun",
    "player wrapperで公開処刑射手を準備できません。"
  );
  return "player wrapperのalive・対象・観客・射手状態API";
};

export const runCharacterStateSystemTests = () =>
  Object.freeze([
    executeTest("9状態の述語分類", testStatePredicates),
    executeTest("プレイヤー被弾・洗脳・選択", testPlayerHitSequence),
    executeTest("NPC洗脳遷移gun経路", testNpcBrainwashTransitions),
    executeTest("NPC洗脳遷移no-gun経路", testNpcNoGunTransition),
    executeTest("厳格な行動・集合遷移", testStrictBehaviorTransitions),
    executeTest("公開処刑の強制状態遷移", testScriptedExecutionTransitions),
    executeTest("即時洗脳", testInstantBrainwash),
    executeTest("銃なし接触洗脳", testNoGunTouchBrainwash),
    executeTest("player combat状態wrapper", testPlayerCombatStateWrapper)
  ]);
