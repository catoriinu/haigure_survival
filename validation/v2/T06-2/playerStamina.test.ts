import {
  createV2PlayerDashController,
  V2_PLAYER_DASH_SPEED_MULTIPLIER,
  V2_PLAYER_STAMINA_DRAIN_INTERVAL_SECONDS,
  V2_PLAYER_STAMINA_MAX_TENTHS,
  V2_PLAYER_STAMINA_RECOVER_INTERVAL_SECONDS,
  type V2PlayerDashController
} from "../../../src/v2/playerStamina";
import { assert, executeTest } from "./testUtils";

const update = (
  controller: V2PlayerDashController,
  overrides: Partial<Parameters<V2PlayerDashController["update"]>[0]> = {}
) =>
  controller.update({
    delta: 0,
    gameplayActive: true,
    playerState: "normal",
    dashPressed: false,
    moving: false,
    ...overrides
  });

export const runPlayerStaminaTests = async () =>
  Promise.all([
    executeTest("V1最終値でダッシュ中だけスタミナを消費", () => {
      assert(
        V2_PLAYER_DASH_SPEED_MULTIPLIER === 2 &&
          V2_PLAYER_STAMINA_MAX_TENTHS === 150 &&
          V2_PLAYER_STAMINA_DRAIN_INTERVAL_SECONDS === 0.1 &&
          V2_PLAYER_STAMINA_RECOVER_INTERVAL_SECONDS === 0.2,
        "ダッシュ・スタミナ定数がV1最終値と一致しません。"
      );
      const controller = createV2PlayerDashController("stamina");
      const idleDash = update(controller, {
        delta: 1,
        dashPressed: true
      });
      assert(
        idleDash.active &&
          idleDash.stamina?.currentTenths === 150,
        "移動入力なしのダッシュでスタミナを消費しました。"
      );
      const movingDash = update(controller, {
        delta: 1,
        dashPressed: true,
        moving: true
      });
      assert(
        movingDash.active &&
          movingDash.stamina?.currentTenths === 140,
        `1秒の消費量が不正です: ${movingDash.stamina?.currentTenths}`
      );
      return `倍率=${V2_PLAYER_DASH_SPEED_MULTIPLIER} / idle=${idleDash.stamina?.currentTenths} / moving=${movingDash.stamina?.currentTenths}`;
    }),
    executeTest("空になるまで消費しShift継続中は回復しない", () => {
      const controller = createV2PlayerDashController("stamina");
      let frame = update(controller);
      for (let index = 0; index < 150; index += 1) {
        frame = update(controller, {
          delta: 0.1,
          dashPressed: true,
          moving: true
        });
      }
      assert(
        frame.active && frame.stamina?.currentTenths === 0,
        `スタミナを0まで消費できません: ${frame.stamina?.currentTenths}`
      );
      frame = update(controller, {
        delta: 2,
        dashPressed: true,
        moving: true
      });
      assert(
        !frame.active && frame.stamina?.currentTenths === 0,
        "スタミナ0でダッシュまたは回復しました。"
      );
      frame = update(controller, { delta: 2, moving: true });
      assert(
        frame.stamina?.currentTenths === 10,
        `2秒の回復量が不正です: ${frame.stamina?.currentTenths}`
      );
      return `exhausted=0 / recovered=${frame.stamina.currentTenths}`;
    }),
    executeTest("洗脳中は満タン固定で全状態からダッシュ可能", () => {
      const controller = createV2PlayerDashController("stamina");
      update(controller, {
        delta: 1,
        dashPressed: true,
        moving: true
      });
      const brainwashStates = [
        "brainwash-in-progress",
        "brainwash-complete-gun",
        "brainwash-complete-no-gun",
        "brainwash-complete-haigure",
        "brainwash-complete-haigure-formation"
      ] as const;
      for (const playerState of brainwashStates) {
        const frame = update(controller, {
          delta: 10,
          playerState,
          dashPressed: true,
          moving: true
        });
        assert(
          frame.active &&
            frame.stamina?.brainwashed === true &&
            frame.stamina.currentTenths === 150,
          `洗脳状態の満タン固定が不正です: ${playerState}`
        );
      }
      return `${brainwashStates.length}状態で満タン・ダッシュ有効`;
    }),
    executeTest("非playingはtimerを破棄しdebugは従来どおり無制限", () => {
      const limited = createV2PlayerDashController("stamina");
      update(limited, {
        delta: 0.05,
        dashPressed: true,
        moving: true
      });
      const inactive = update(limited, {
        delta: 10,
        gameplayActive: false,
        dashPressed: true,
        moving: true
      });
      const resumed = update(limited, {
        delta: 0.05,
        dashPressed: true,
        moving: true
      });
      assert(
        !inactive.active &&
          inactive.stamina?.currentTenths === 150 &&
          resumed.stamina?.currentTenths === 150,
        "非playingでダッシュしたかtimerを持ち越しました。"
      );
      const unlimited = createV2PlayerDashController("unlimited");
      const debugFrame = update(unlimited, {
        gameplayActive: false,
        playerState: "hit-a",
        dashPressed: true,
        moving: true
      });
      assert(
        debugFrame.active && debugFrame.stamina === null,
        "debug用無制限ダッシュが従来挙動を維持していません。"
      );
      return "playing外timer破棄 / debug staminaなし・ダッシュ有効";
    })
  ]);
