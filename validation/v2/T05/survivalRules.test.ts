import { Vector3 } from "@babylonjs/core";

import type { V2AlarmFrame } from "../../../src/v2/alarmSystem";
import {
  V2_EXECUTION_BIT_VIEW_GAP_RADIANS,
  V2_PLAYER_BLOCK_RADIUS,
  areAllV2HumansBrainwashed,
  canV2SurvivalPlayerMove,
  cloneV2AlarmFrame,
  createV2ExecutionBitPositions,
  selectV2ExecutionAudienceIds,
  selectV2PlayerBlockedNpcIds
} from "../../../src/v2/survivalRules";
import type { StageAssemblyVenue } from "../../../src/world/stageSpatialContext";

export type SurvivalRulesTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): SurvivalRulesTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
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

const createVenue = (): StageAssemblyVenue =>
  Object.freeze({
    id: "survival-rules-venue",
    anchor: {} as StageAssemblyVenue["anchor"],
    volume: {} as StageAssemblyVenue["volume"],
    center: new Vector3(0, 0, 0),
    selectionWeight: 1,
    assemblyPositions: Object.freeze([
      new Vector3(4, 0, 0)
    ]),
    executionAudiencePositions: Object.freeze([
      new Vector3(4, 0, 0),
      new Vector3(0, 0, 4),
      new Vector3(-4, 0, 0),
      new Vector3(0, 0, -4)
    ]),
    executionTargetPositions: Object.freeze([
      new Vector3(0, 0, 0)
    ])
  });

const absoluteWrappedAngle = (angle: number): number =>
  Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));

export const runSurvivalRulesTests =
  (): readonly SurvivalRulesTestResult[] => [
    executeTest(
      "playing中は指定4状態かつNPC拘束なしの場合だけ移動できる",
      () => {
        const movableStates = [
          "normal",
          "evade",
          "brainwash-complete-gun",
          "brainwash-complete-no-gun"
        ] as const;
        const stoppedStates = [
          "hit-a",
          "hit-b",
          "brainwash-in-progress",
          "brainwash-complete-haigure",
          "brainwash-complete-haigure-formation"
        ] as const;
        const movable = movableStates.every((playerState) =>
          canV2SurvivalPlayerMove({
            phase: "playing",
            playerState,
            playerCaptured: false,
            assemblyPlayerControlReleased: false,
            executionPlayerRole: null
          })
        );
        const stopped = stoppedStates.every(
          (playerState) =>
            !canV2SurvivalPlayerMove({
              phase: "playing",
              playerState,
              playerCaptured: false,
              assemblyPlayerControlReleased: false,
              executionPlayerRole: null
            })
        );
        const captured = movableStates.every(
          (playerState) =>
            !canV2SurvivalPlayerMove({
              phase: "playing",
              playerState,
              playerCaptured: true,
              assemblyPlayerControlReleased: false,
              executionPlayerRole: null
            })
        );
        return {
          ok: movable && stopped && captured,
          detail:
            `movable=${movable} / stopped=${stopped} / ` +
            `captured=${captured}`
        };
      }
    ),
    executeTest(
      "assemblyはWASD解放後に移動し、execution系ではplayer対象だけ停止する",
      () => {
        const assemblyStopped = !canV2SurvivalPlayerMove({
          phase: "assembly",
          playerState: "brainwash-complete-haigure-formation",
          playerCaptured: true,
          assemblyPlayerControlReleased: false,
          executionPlayerRole: "observer"
        });
        const assemblyReleased = canV2SurvivalPlayerMove({
          phase: "assembly",
          playerState: "brainwash-complete-haigure-formation",
          playerCaptured: true,
          assemblyPlayerControlReleased: true,
          executionPlayerRole: "observer"
        });
        const executionTargetStopped = [
          "execution",
          "execution-complete"
        ].every(
          (phase) =>
            !canV2SurvivalPlayerMove({
              phase:
                phase === "execution"
                  ? "execution"
                  : "execution-complete",
              playerState: "hit-a",
              playerCaptured: true,
              assemblyPlayerControlReleased: false,
              executionPlayerRole: "target"
            })
        );
        const nonTargetRoles = [
          "shooter",
          "observer",
          null
        ] as const;
        const nonTargetsMove = nonTargetRoles.every(
          (executionPlayerRole) =>
            canV2SurvivalPlayerMove({
              phase: "execution",
              playerState: "hit-a",
              playerCaptured: true,
              assemblyPlayerControlReleased: false,
              executionPlayerRole
            })
        );
        return {
          ok:
            assemblyStopped &&
            assemblyReleased &&
            executionTargetStopped &&
            nonTargetsMove,
          detail:
            `assembly=${assemblyStopped}->${assemblyReleased} / ` +
            `target=${executionTargetStopped} / ` +
            `nonTarget=${nonTargetsMove}`
        };
      }
    ),
    executeTest(
      "集合3秒カウント条件は全員brainwashedだけでhitだけでは成立しない",
      () => {
        const allBrainwashed = areAllV2HumansBrainwashed([
          { brainwashed: true },
          { brainwashed: true },
          { brainwashed: true }
        ]);
        const hitHumans = [
          { brainwashed: true },
          { brainwashed: false, state: "hit-a" }
        ] as const;
        const hitOnly = areAllV2HumansBrainwashed(hitHumans);
        return {
          ok: allBrainwashed && !hitOnly,
          detail:
            `allBrainwashed=${allBrainwashed} / hitOnly=${hitOnly}`
        };
      }
    ),
    executeTest(
      "no-gun playerは半径0.27以内のalive NPC全IDを入力順で選ぶ",
      () => {
        const center = Vector3.Zero();
        const npcs = Object.freeze([
          {
            id: "inside",
            footPosition: new Vector3(
              V2_PLAYER_BLOCK_RADIUS - 0.001,
              0,
              0
            ),
            alive: true,
            state: "normal" as const
          },
          {
            id: "boundary",
            footPosition: new Vector3(
              V2_PLAYER_BLOCK_RADIUS,
              0,
              0
            ),
            alive: true,
            state: "normal" as const
          },
          {
            id: "outside",
            footPosition: new Vector3(
              V2_PLAYER_BLOCK_RADIUS + 0.001,
              0,
              0
            ),
            alive: true,
            state: "normal" as const
          },
          {
            id: "dead",
            footPosition: new Vector3(0.01, 0, 0),
            alive: false,
            state: "brainwash-in-progress" as const
          }
        ]);
        const noGun = selectV2PlayerBlockedNpcIds(
          "brainwash-complete-no-gun",
          center,
          npcs
        );
        const gun = selectV2PlayerBlockedNpcIds(
          "brainwash-complete-gun",
          center,
          npcs
        );
        return {
          ok:
            noGun.join("|") === "inside|boundary" &&
            gun.length === 0 &&
            Object.isFrozen(noGun),
          detail:
            `noGun=${noGun.join(",")} / gun=${gun.join(",")}`
        };
      }
    ),
    executeTest(
      "公開処刑は対象だけを除外し全観客の入力順と表示対象を保つ",
      () => {
        const result = selectV2ExecutionAudienceIds(
          [
            "player",
            "npc-01",
            "target-01",
            "npc-02",
            "npc-03",
            "npc-04"
          ],
          ["target-01"]
        );
        return {
          ok:
            result.join("|") ===
              "player|npc-01|npc-02|npc-03|npc-04" &&
            !result.includes("target-01") &&
            Object.isFrozen(result),
          detail: `audience=${result.join(",")}`
        };
      }
    ),
    executeTest(
      "bit配置はviewer正面を中心とする12度gapを全件で空ける",
      () => {
        const venue = createVenue();
        const viewers = Object.freeze([
          new Vector3(10, 0, 0),
          new Vector3(0, 0, 10),
          new Vector3(-10, 0, 0),
          new Vector3(3, 0, -8)
        ]);
        const counts = Object.freeze([1, 2, 99, 997]);
        let minimumGap = Number.POSITIVE_INFINITY;
        let checked = 0;
        for (const viewer of viewers) {
          const viewerAngle = Math.atan2(viewer.z, viewer.x);
          for (const count of counts) {
            const positions = createV2ExecutionBitPositions(
              venue,
              count,
              viewer
            );
            checked += positions.length;
            for (const position of positions) {
              const angle = Math.atan2(position.z, position.x);
              minimumGap = Math.min(
                minimumGap,
                absoluteWrappedAngle(angle - viewerAngle)
              );
            }
          }
        }
        const halfGap =
          V2_EXECUTION_BIT_VIEW_GAP_RADIANS * 0.5;
        return {
          ok:
            minimumGap >= halfGap - 1e-12 &&
            checked ===
              viewers.length *
                counts.reduce((sum, count) => sum + count, 0),
          detail:
            `minimum=${(minimumGap * 180 / Math.PI).toFixed(9)}deg / ` +
            `required=${(halfGap * 180 / Math.PI).toFixed(9)}deg / ` +
            `checked=${checked}`
        };
      }
    ),
    executeTest(
      "中庭公開処刑BITの高さは1F屋外飛行帯下限へ収まる",
      () => {
        const baseVenue = createVenue();
        const courtyardVenue = Object.freeze({
          ...baseVenue,
          id: "assembly-courtyard",
          center: new Vector3(0, -0.3, 0)
        });
        const positions = createV2ExecutionBitPositions(
          courtyardVenue,
          25,
          new Vector3(4, -0.3, 0)
        );
        const minimumHeight = Math.min(
          ...positions.map((position) => position.y)
        );
        return {
          ok:
            positions.length === 25 &&
            positions.every((position) => position.y === 1),
          detail: `minimumHeight=${minimumHeight.toFixed(3)} / required=1.000`
        };
      }
    ),
    executeTest(
      "公開alarm frameは配列と位置をcloneして内部値と分離する",
      () => {
        const source: V2AlarmFrame = Object.freeze({
          events: Object.freeze([
            Object.freeze({
              candidateId: "alarm-01",
              targetId: "player",
              position: new Vector3(1, 2, 3)
            })
          ]),
          activeCandidateIds: Object.freeze(["alarm-01"]),
          activeFloors: Object.freeze([
            Object.freeze({
              candidateId: "alarm-01",
              position: new Vector3(1, 2, 3),
              supportNormal: Vector3.Up(),
              tangent: Vector3.Right(),
              radius: 0.25
            })
          ]),
          usedCandidateIds: Object.freeze(["alarm-01"]),
          blinks: Object.freeze([
            Object.freeze({
              candidateId: "alarm-01",
              position: new Vector3(4, 5, 6),
              supportNormal: Vector3.Up(),
              tangent: Vector3.Right(),
              radius: 0.25,
              elapsedSeconds: 1,
              remainingSeconds: 4,
              blinkIntervalSeconds: 0.4,
              visible: true
            })
          ])
        });
        const cloned = cloneV2AlarmFrame(source);
        cloned.events[0].position.x = 10;
        cloned.activeFloors[0].supportNormal.x = 11;
        cloned.blinks[0].position.z = 20;
        source.events[0].position.y = 30;
        source.blinks[0].position.x = 40;
        return {
          ok:
            cloned !== source &&
            cloned.events !== source.events &&
            cloned.activeFloors !== source.activeFloors &&
            cloned.blinks !== source.blinks &&
            cloned.events[0].position !==
              source.events[0].position &&
            cloned.blinks[0].position !==
              source.blinks[0].position &&
            cloned.activeFloors[0].supportNormal !==
              source.activeFloors[0].supportNormal &&
            cloned.events[0].position.x === 10 &&
            cloned.events[0].position.y === 2 &&
            cloned.blinks[0].position.x === 4 &&
            cloned.blinks[0].position.z === 20 &&
            cloned.activeFloors[0].supportNormal.x === 11 &&
            source.activeFloors[0].supportNormal.x === 0 &&
            source.events[0].position.x === 1 &&
            source.blinks[0].position.z === 6 &&
            Object.isFrozen(cloned.events) &&
            Object.isFrozen(cloned.blinks),
          detail:
            `event=${cloned.events[0].position.toString()} / ` +
            `blink=${cloned.blinks[0].position.toString()}`
        };
      }
    )
  ];
