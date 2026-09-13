import { Engine, Vector3 } from "@babylonjs/core";

import {
  createPlayerMotionController,
  type PlayerMotionController,
  type PlayerMoveAxes
} from "../../../src/game/playerMotion";
import { assert, executeTest } from "./testUtils";

const BASE_MOVE_SPEED = 0.02 * Math.sqrt(10);
const WATER_MOVE_SPEED = BASE_MOVE_SPEED * 0.5;
const FIXED_DELTA_60_FPS = 1 / 60;
const FIXED_DELTA_120_FPS = 1 / 120;
const NO_INPUT = Object.freeze({ moveX: 0, moveZ: 0 });
const FORWARD_INPUT = Object.freeze({ moveX: 0, moveZ: 1 });
const BACKWARD_INPUT = Object.freeze({ moveX: 0, moveZ: -1 });
const RIGHT_INPUT = Object.freeze({ moveX: 1, moveZ: 0 });

const createMotion = () =>
  createPlayerMotionController({
    moveInertiaAt60Fps: 0.9,
    moveStopEpsilon: 0.00001,
    collisionEpsilon: Engine.CollisionsEpsilon
  });

const runFrame = (
  motion: PlayerMotionController,
  moveAxes: PlayerMoveAxes,
  delta: number,
  moveSpeed: number,
  collisionBlocked = false
) => {
  const requested = motion.update(
    moveAxes,
    0,
    delta,
    true,
    moveSpeed
  ).clone();
  const actual =
    !collisionBlocked && requested.length() > Engine.CollisionsEpsilon
      ? requested.clone()
      : Vector3.Zero();
  motion.commit(actual);
  return Object.freeze({ requested, actual });
};

const measureContinuousMovement = (
  delta: number,
  moveSpeed: number,
  frameCount: number
) => {
  const motion = createMotion();
  const position = Vector3.Zero();
  const requestedLengths: number[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const result = runFrame(
      motion,
      FORWARD_INPUT,
      delta,
      moveSpeed
    );
    requestedLengths.push(result.requested.length());
    position.addInPlace(result.actual);
  }
  return Object.freeze({ position, requestedLengths });
};

export const runPlayerMotionTests = async () =>
  Promise.all([
    executeTest(
      "衝突epsilon未満の水中移動を蓄積して開始できる",
      () => {
        const water60 = measureContinuousMovement(
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED,
          120
        );
        const normal120 = measureContinuousMovement(
          FIXED_DELTA_120_FPS,
          BASE_MOVE_SPEED,
          240
        );
        assert(
          water60.requestedLengths[0] === 0 &&
            water60.requestedLengths[1] > Engine.CollisionsEpsilon,
          `水中60fpsの要求変位が2frame目にepsilonを超えません: ${water60.requestedLengths
            .slice(0, 2)
            .map((value) => value.toFixed(9))
            .join(",")}`
        );
        assert(
          water60.position.length() > 0.02,
          `水中60fpsで移動を開始できません: ${water60.position.length().toFixed(9)}`
        );
        assert(
          normal120.position.length() > 0.02,
          `通常120fpsで移動を開始できません: ${normal120.position.length().toFixed(9)}`
        );
        return `water60=${water60.position.length().toFixed(6)} / normal120=${normal120.position.length().toFixed(6)} / epsilon=${Engine.CollisionsEpsilon}`;
      }
    ),
    executeTest(
      "入力停止と反転で未適用変位を持ち越さない",
      () => {
        const stoppedMotion = createMotion();
        const firstForward = runFrame(
          stoppedMotion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const stopped = runFrame(
          stoppedMotion,
          NO_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const firstRight = runFrame(
          stoppedMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const secondRight = runFrame(
          stoppedMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        assert(
          firstForward.requested.length() === 0 &&
            stopped.requested.length() === 0 &&
            firstRight.requested.length() === 0,
          "停止前の未適用変位が後続frameへ公開されました。"
        );
        assert(
          secondRight.actual.x > Engine.CollisionsEpsilon &&
            Math.abs(secondRight.actual.z) <= Number.EPSILON,
          `停止後の右移動へ旧方向が混入しました: ${secondRight.actual.toString()}`
        );

        const turnedMotion = createMotion();
        runFrame(
          turnedMotion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const firstTurnedRight = runFrame(
          turnedMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const secondTurnedRight = runFrame(
          turnedMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        assert(
          firstTurnedRight.requested.length() === 0 &&
            secondTurnedRight.actual.x > Engine.CollisionsEpsilon &&
            Math.abs(secondTurnedRight.actual.z) <= Number.EPSILON,
          `直角方向転換後の右移動へ旧方向が混入しました: first=${firstTurnedRight.requested.toString()} / second=${secondTurnedRight.actual.toString()}`
        );

        const reversedMotion = createMotion();
        runFrame(
          reversedMotion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const reversed = runFrame(
          reversedMotion,
          BACKWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        assert(
          reversed.requested.length() === 0 && reversed.actual.length() === 0,
          `反対入力で未適用変位が相殺されません: ${reversed.requested.toString()}`
        );
        return `stop=${stopped.requested.length().toFixed(9)} / right=${secondRight.actual.length().toFixed(9)} / turn=${secondTurnedRight.actual.length().toFixed(9)} / reverse=${reversed.actual.length().toFixed(9)}`;
      }
    ),
    executeTest(
      "衝突で拒否された変位を残差として再利用しない",
      () => {
        const motion = createMotion();
        runFrame(
          motion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED,
          true
        );
        const blocked = runFrame(
          motion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED,
          true
        );
        const released = Array.from({ length: 4 }, () =>
          runFrame(
            motion,
            NO_INPUT,
            FIXED_DELTA_60_FPS,
            WATER_MOVE_SPEED
          )
        );
        assert(
          blocked.requested.length() > Engine.CollisionsEpsilon &&
            blocked.actual.length() === 0,
          `衝突拒否の前提が成立しません: requested=${blocked.requested.length().toFixed(9)}`
        );
        assert(
          released.every(
            (frame) =>
              frame.requested.length() === 0 && frame.actual.length() === 0
          ),
          "衝突で拒否された変位が入力停止後に再適用されました。"
        );
        return `blocked=${blocked.requested.length().toFixed(9)} / released=${released.map((frame) => frame.actual.length().toFixed(9)).join(",")}`;
      }
    ),
    executeTest(
      "移動禁止・reset・delta 0で未適用変位を消去する",
      () => {
        const allowMoveMotion = createMotion();
        runFrame(
          allowMoveMotion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const denied = allowMoveMotion.update(
          FORWARD_INPUT,
          0,
          FIXED_DELTA_60_FPS,
          false,
          WATER_MOVE_SPEED
        ).clone();
        allowMoveMotion.commit(Vector3.Zero());
        runFrame(
          allowMoveMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const afterDenied = runFrame(
          allowMoveMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );

        const resetMotion = createMotion();
        runFrame(
          resetMotion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        resetMotion.reset();
        runFrame(
          resetMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const afterReset = runFrame(
          resetMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );

        const zeroDeltaMotion = createMotion();
        runFrame(
          zeroDeltaMotion,
          FORWARD_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const zeroDelta = runFrame(
          zeroDeltaMotion,
          FORWARD_INPUT,
          0,
          WATER_MOVE_SPEED
        );
        runFrame(
          zeroDeltaMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );
        const afterZeroDelta = runFrame(
          zeroDeltaMotion,
          RIGHT_INPUT,
          FIXED_DELTA_60_FPS,
          WATER_MOVE_SPEED
        );

        for (const [label, frame] of [
          ["allowMove=false", afterDenied],
          ["reset", afterReset],
          ["delta=0", afterZeroDelta]
        ] as const) {
          assert(
            frame.actual.x > Engine.CollisionsEpsilon &&
              Math.abs(frame.actual.z) <= Number.EPSILON,
            `${label}後の右移動へ旧方向が混入しました: ${frame.actual.toString()}`
          );
        }
        assert(
          denied.length() === 0 && zeroDelta.requested.length() === 0,
          `移動禁止またはdelta 0で要求変位が残りました: denied=${denied.toString()} / zeroDelta=${zeroDelta.requested.toString()}`
        );
        return `denied=${denied.length().toFixed(9)} / resetZ=${afterReset.actual.z.toFixed(9)} / zeroDelta=${zeroDelta.requested.length().toFixed(9)}`;
      }
    )
  ]);
