import { Vector3 } from "@babylonjs/core";

import {
  V2_ALARM_BLINK_DURATION_SECONDS,
  V2_ALARM_BLINK_INTERVAL_END_SECONDS,
  V2_ALARM_BLINK_INTERVAL_START_SECONDS,
  V2_ALARM_INFLUENCE_RADIUS_LEGACY_CELLS,
  V2_ALARM_INFLUENCE_RADIUS_METERS,
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
  V2_ALARM_SELECTION_INTERVAL_SECONDS,
  V2_LEGACY_GRID_CELL_WORLD_UNITS,
  createV2AlarmSystem,
  type V2AlarmCandidate,
  type V2AlarmCandidateProvider,
  type V2AlarmHumanSnapshot
} from "../../../src/v2/alarmSystem";

export type AlarmSystemTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): AlarmSystemTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const createCandidate = (
  id: string,
  center: Vector3,
  polygonRef: number
): V2AlarmCandidate =>
  Object.freeze({
    id,
    navigationLocation: Object.freeze({
      position: center.clone(),
      polygonRef
    }),
    supportNormal: Vector3.Up(),
    tangent: Vector3.Right(),
    radius: 0.25,
    verticalTolerance: 0.05
  });

const createProvider = (
  candidates: readonly V2AlarmCandidate[]
): V2AlarmCandidateProvider =>
  Object.freeze({
    getCandidates: () => candidates
  });

const createRandomSequence = (values: readonly number[]) => {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`random sequenceを使い切りました: index=${index}`);
    }
    index += 1;
    return value;
  };
};

const createHuman = (
  id: string,
  footPosition: Vector3,
  alive = true
): V2AlarmHumanSnapshot =>
  Object.freeze({
    id,
    footPosition: footPosition.clone(),
    alive
  });

const hasSameIds = (
  actual: readonly string[],
  expected: readonly string[]
) =>
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-6
) => Math.abs(actual - expected) <= tolerance;

export const runAlarmSystemTests =
  (): readonly AlarmSystemTestResult[] => {
    const results: AlarmSystemTestResult[] = [];

    results.push(
      executeTest("初期1件と5秒間隔の非active・非点滅候補を選ぶ", () => {
        const candidates = Object.freeze([
          createCandidate("alarm-a", new Vector3(0, 0, 0), 1),
          createCandidate("alarm-b", new Vector3(2, 0, 0), 2),
          createCandidate("alarm-c", new Vector3(4, 0, 0), 3),
          createCandidate("alarm-d", new Vector3(6, 0, 0), 4)
        ]);
        const system = createV2AlarmSystem({
          candidateProvider: createProvider(candidates),
          random: createRandomSequence([0.75, 0, 0.99, 0])
        });
        try {
          const initial = system.getFrame();
          const afterFirstInterval = system.update({
            deltaSeconds: V2_ALARM_SELECTION_INTERVAL_SECONDS,
            humans: []
          });
          const afterTwoIntervals = system.update({
            deltaSeconds: V2_ALARM_SELECTION_INTERVAL_SECONDS * 2,
            humans: []
          });
          const afterExhaustion = system.update({
            deltaSeconds: V2_ALARM_SELECTION_INTERVAL_SECONDS * 2,
            humans: []
          });
          return {
            ok:
              hasSameIds(initial.activeCandidateIds, ["alarm-d"]) &&
              hasSameIds(afterFirstInterval.activeCandidateIds, [
                "alarm-d",
                "alarm-a"
              ]) &&
              hasSameIds(afterTwoIntervals.activeCandidateIds, [
                "alarm-d",
                "alarm-a",
                "alarm-c",
                "alarm-b"
              ]) &&
              hasSameIds(afterExhaustion.usedCandidateIds, [
                "alarm-d",
                "alarm-a",
                "alarm-c",
                "alarm-b"
              ]) &&
              new Set(afterExhaustion.usedCandidateIds).size ===
                afterExhaustion.usedCandidateIds.length,
            detail:
              `initial=${initial.activeCandidateIds.join(",")} / ` +
              `selected=${afterExhaustion.usedCandidateIds.join(",")}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("点滅終了後は使用済み候補を再抽選できる", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-reusable", Vector3.Zero(), 1)
          ]),
          random: createRandomSequence([0, 0])
        });
        try {
          system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(-1, 0, 0))]
          });
          const triggered = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(1, 0, 0))]
          });
          const blinkCompleted = system.update({
            deltaSeconds: V2_ALARM_BLINK_DURATION_SECONDS,
            humans: [createHuman("player", new Vector3(1, 0, 0))]
          });
          const reselected = system.update({
            deltaSeconds: V2_ALARM_SELECTION_INTERVAL_SECONDS,
            humans: [createHuman("player", new Vector3(1, 0, 0))]
          });
          return {
            ok:
              triggered.blinks.length === 1 &&
              blinkCompleted.blinks.length === 0 &&
              blinkCompleted.activeCandidateIds.length === 0 &&
              hasSameIds(reselected.activeCandidateIds, [
                "alarm-reusable"
              ]) &&
              hasSameIds(reselected.usedCandidateIds, [
                "alarm-reusable"
              ]),
            detail:
              `triggered=${triggered.blinks.length} / ` +
              `completed=${blinkCompleted.blinks.length} / ` +
              `reselected=${reselected.activeCandidateIds.join(",")}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("V1の50セルをV2 world・メートルへ換算する", () => {
        const expectedWorldRadius = 50 / 3;
        const expectedMeterRadius = expectedWorldRadius / 0.25;
        return {
          ok:
            V2_ALARM_INFLUENCE_RADIUS_LEGACY_CELLS === 50 &&
            approximately(V2_LEGACY_GRID_CELL_WORLD_UNITS, 1 / 3) &&
            approximately(
              V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
              expectedWorldRadius
            ) &&
            approximately(
              V2_ALARM_INFLUENCE_RADIUS_METERS,
              expectedMeterRadius
            ),
          detail:
            `${V2_ALARM_INFLUENCE_RADIUS_LEGACY_CELLS} cells / ` +
            `${V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS.toFixed(6)} world / ` +
            `${V2_ALARM_INFLUENCE_RADIUS_METERS.toFixed(6)}m`
        };
      })
    );

    results.push(
      executeTest("初回観測は登録だけ行い高速横断を連続判定する", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-center", Vector3.Zero(), 1)
          ]),
          random: createRandomSequence([0])
        });
        try {
          const first = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(-2, 0, 0))]
          });
          const crossed = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(2, 0, 0))]
          });
          return {
            ok:
              first.events.length === 0 &&
              crossed.events.length === 1 &&
              crossed.events[0].candidateId === "alarm-center" &&
              crossed.events[0].targetId === "player" &&
              Vector3.Distance(crossed.events[0].position, Vector3.Zero()) <=
                1e-6,
            detail:
              `first=${first.events.length} / crossed=${crossed.events.length}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("同じXZでも別階の移動は発動しない", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-ground", Vector3.Zero(), 1)
          ]),
          random: createRandomSequence([0])
        });
        try {
          system.update({
            deltaSeconds: 0,
            humans: [createHuman("npc-upper", new Vector3(-2, 2, 0))]
          });
          const frame = system.update({
            deltaSeconds: 0,
            humans: [createHuman("npc-upper", new Vector3(2, 2, 0))]
          });
          return {
            ok:
              frame.events.length === 0 &&
              hasSameIds(frame.activeCandidateIds, ["alarm-ground"]),
            detail:
              `events=${frame.events.length} / active=${frame.activeCandidateIds.join(",")}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("候補追加時点ですでに内部にいる対象は再侵入まで発動しない", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-inside", Vector3.Zero(), 1)
          ]),
          random: createRandomSequence([0])
        });
        try {
          const first = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", Vector3.Zero())]
          });
          const stayed = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(0.05, 0, 0))]
          });
          system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(1, 0, 0))]
          });
          const reentered = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", Vector3.Zero())]
          });
          return {
            ok:
              first.events.length === 0 &&
              stayed.events.length === 0 &&
              reentered.events.length === 1,
            detail:
              `first=${first.events.length} / stayed=${stayed.events.length} / ` +
              `reentered=${reentered.events.length}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("非生存対象は観測履歴と発動対象から除外する", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-alive-only", Vector3.Zero(), 1)
          ]),
          random: createRandomSequence([0])
        });
        try {
          system.update({
            deltaSeconds: 0,
            humans: [
              createHuman("npc", new Vector3(-1, 0, 0), false)
            ]
          });
          const deadCross = system.update({
            deltaSeconds: 0,
            humans: [
              createHuman("npc", new Vector3(1, 0, 0), false)
            ]
          });
          const revivedFirstObservation = system.update({
            deltaSeconds: 0,
            humans: [createHuman("npc", new Vector3(-1, 0, 0))]
          });
          const aliveCross = system.update({
            deltaSeconds: 0,
            humans: [createHuman("npc", new Vector3(1, 0, 0))]
          });
          return {
            ok:
              deadCross.events.length === 0 &&
              revivedFirstObservation.events.length === 0 &&
              aliveCross.events.length === 1,
            detail:
              `dead=${deadCross.events.length} / revived=${revivedFirstObservation.events.length} / ` +
              `alive=${aliveCross.events.length}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("発動後5秒間の点滅間隔を0.8秒から0.08秒へ加速する", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-blink", Vector3.Zero(), 1)
          ]),
          random: createRandomSequence([0])
        });
        try {
          system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(-1, 0, 0))]
          });
          const triggered = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(1, 0, 0))]
          });
          const initialBlink = triggered.blinks[0];
          const accelerated = system.update({
            deltaSeconds: V2_ALARM_BLINK_DURATION_SECONDS - 0.1,
            humans: []
          });
          const acceleratedBlink = accelerated.blinks[0];
          const completed = system.update({
            deltaSeconds: 0.1,
            humans: []
          });
          return {
            ok:
              triggered.events.length === 1 &&
              initialBlink.visible &&
              approximately(
                initialBlink.blinkIntervalSeconds,
                V2_ALARM_BLINK_INTERVAL_START_SECONDS
              ) &&
              acceleratedBlink.blinkIntervalSeconds <
                initialBlink.blinkIntervalSeconds &&
              acceleratedBlink.blinkIntervalSeconds >
                V2_ALARM_BLINK_INTERVAL_END_SECONDS &&
              completed.blinks.length === 0,
            detail:
              `initial=${initialBlink.blinkIntervalSeconds.toFixed(3)} / ` +
              `accelerated=${acceleratedBlink.blinkIntervalSeconds.toFixed(3)} / ` +
              `completed=${completed.blinks.length}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("resetで選択・点滅・観測履歴を新規セッションへ戻す", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-reset-a", Vector3.Zero(), 1),
            createCandidate("alarm-reset-b", new Vector3(2, 0, 0), 2)
          ]),
          random: createRandomSequence([0, 0.99])
        });
        try {
          system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(-1, 0, 0))]
          });
          system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(1, 0, 0))]
          });
          system.reset();
          const resetFrame = system.getFrame();
          const firstObservation = system.update({
            deltaSeconds: 0,
            humans: [createHuman("player", new Vector3(2, 0, 0))]
          });
          return {
            ok:
              hasSameIds(resetFrame.activeCandidateIds, ["alarm-reset-b"]) &&
              hasSameIds(resetFrame.usedCandidateIds, ["alarm-reset-b"]) &&
              resetFrame.blinks.length === 0 &&
              firstObservation.events.length === 0,
            detail:
              `active=${resetFrame.activeCandidateIds.join(",")} / ` +
              `blink=${resetFrame.blinks.length} / first=${firstObservation.events.length}`
          };
        } finally {
          system.dispose();
        }
      })
    );

    results.push(
      executeTest("破棄後は全公開操作を拒否する", () => {
        const system = createV2AlarmSystem({
          candidateProvider: createProvider([
            createCandidate("alarm-dispose", Vector3.Zero(), 1)
          ]),
          random: createRandomSequence([0])
        });
        system.dispose();
        let getFrameRejected = false;
        let updateRejected = false;
        let resetRejected = false;
        let secondDisposeRejected = false;
        try {
          system.getFrame();
        } catch {
          getFrameRejected = true;
        }
        try {
          system.update({ deltaSeconds: 0, humans: [] });
        } catch {
          updateRejected = true;
        }
        try {
          system.reset();
        } catch {
          resetRejected = true;
        }
        try {
          system.dispose();
        } catch {
          secondDisposeRejected = true;
        }
        return {
          ok:
            getFrameRejected &&
            updateRejected &&
            resetRejected &&
            secondDisposeRejected,
          detail:
            `get=${getFrameRejected} / update=${updateRejected} / ` +
            `reset=${resetRejected} / dispose=${secondDisposeRejected}`
        };
      })
    );

    results.push(
      executeTest("候補の重複IDと非直交基底を初期化時に拒否する", () => {
        const duplicate = createCandidate("alarm-duplicate", Vector3.Zero(), 1);
        let duplicateRejected = false;
        let basisRejected = false;
        try {
          createV2AlarmSystem({
            candidateProvider: createProvider([duplicate, duplicate]),
            random: createRandomSequence([0])
          });
        } catch {
          duplicateRejected = true;
        }
        try {
          createV2AlarmSystem({
            candidateProvider: createProvider([
              Object.freeze({
                ...createCandidate("alarm-basis", Vector3.Zero(), 1),
                tangent: new Vector3(1, 1, 0)
              })
            ]),
            random: createRandomSequence([0])
          });
        } catch {
          basisRejected = true;
        }
        return {
          ok: duplicateRejected && basisRejected,
          detail: `duplicate=${duplicateRejected} / basis=${basisRejected}`
        };
      })
    );

    return Object.freeze(results);
  };
