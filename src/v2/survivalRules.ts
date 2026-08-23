import { Vector3 } from "@babylonjs/core";

import type { StageAssemblyVenue } from "../world/stageSpatialContext";
import type { V2AlarmFrame } from "./alarmSystem";
import type { V2CharacterState } from "./combatTypes";
import type { V2ExecutionPlayerRole } from "./publicExecutionSystem";

export const V2_PLAYER_BLOCK_RADIUS = 0.27;
export const V2_EXECUTION_BIT_VIEW_GAP_RADIANS =
  (12 * Math.PI) / 180;

const EXECUTION_BIT_HEIGHT = 1.3;
const EXECUTION_BIT_RING_INNER_RATIO = 0.25;
const EXECUTION_BIT_RING_OUTER_RATIO = 0.75;
const GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5));

export type V2SurvivalRulePhase =
  | "playing"
  | "assembly"
  | "execution"
  | "execution-complete";

export type V2PlayerMovementRuleInput = Readonly<{
  phase: V2SurvivalRulePhase;
  playerState: V2CharacterState;
  playerCaptured: boolean;
  assemblyPlayerControlReleased: boolean;
  executionPlayerRole: V2ExecutionPlayerRole | null;
}>;

export const canV2SurvivalPlayerMove = ({
  phase,
  playerState,
  playerCaptured,
  assemblyPlayerControlReleased,
  executionPlayerRole
}: V2PlayerMovementRuleInput): boolean => {
  if (phase === "playing") {
    const stateAllowsMovement =
      playerState === "normal" ||
      playerState === "evade" ||
      playerState === "brainwash-complete-gun" ||
      playerState === "brainwash-complete-no-gun";
    return stateAllowsMovement && !playerCaptured;
  }
  if (phase === "assembly") {
    return assemblyPlayerControlReleased;
  }
  if (
    phase === "execution" ||
    phase === "execution-complete"
  ) {
    return executionPlayerRole !== "target";
  }
  return false;
};

export const areAllV2HumansBrainwashed = (
  humans: readonly Readonly<{ brainwashed: boolean }>[]
): boolean => humans.every((human) => human.brainwashed);

export const selectV2PlayerBlockedNpcIds = (
  playerState: V2CharacterState,
  playerFootPosition: Vector3,
  npcs: readonly Readonly<{
    id: string;
    footPosition: Vector3;
    alive: boolean;
    state: V2CharacterState;
  }>[]
): readonly string[] =>
  playerState === "brainwash-complete-no-gun"
    ? Object.freeze(
        npcs
          .filter(
            (npc) =>
              (npc.alive ||
                npc.state === "hit-a" ||
                npc.state === "hit-b") &&
              Vector3.Distance(
                playerFootPosition,
                npc.footPosition
              ) <= V2_PLAYER_BLOCK_RADIUS
          )
          .map((npc) => npc.id)
      )
    : Object.freeze([]);

export const selectV2ExecutionAudienceIds = (
  orderedHumanIds: readonly string[],
  targetIds: readonly string[]
): readonly string[] => {
  const targetIdSet = new Set(targetIds);
  return Object.freeze(
    orderedHumanIds.filter((id) => !targetIdSet.has(id))
  );
};

const getMaximumHorizontalRadius = (
  center: Vector3,
  positions: readonly Vector3[]
) => {
  const radius = Math.max(
    ...positions.map((position) =>
      Math.hypot(
        position.x - center.x,
        position.z - center.z
      )
    )
  );
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error("公開処刑会場の作者半径には正数が必要です。");
  }
  return radius;
};

export const createV2ExecutionBitPositions = (
  venue: StageAssemblyVenue,
  count: number,
  viewerPosition: Vector3
): readonly Vector3[] => {
  const maximumRadius = getMaximumHorizontalRadius(
    venue.center,
    venue.executionAudiencePositions
  );
  const innerRadius =
    maximumRadius * EXECUTION_BIT_RING_INNER_RATIO;
  const outerRadius =
    maximumRadius * EXECUTION_BIT_RING_OUTER_RATIO;
  const viewerAngle = Math.atan2(
    viewerPosition.z - venue.center.z,
    viewerPosition.x - venue.center.x
  );
  const availableAngle =
    Math.PI * 2 - V2_EXECUTION_BIT_VIEW_GAP_RADIANS;
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const normalizedRadius = Math.sqrt((index + 0.5) / count);
      const radius =
        innerRadius +
        (outerRadius - innerRadius) * normalizedRadius;
      const angularProgress =
        ((index * GOLDEN_ANGLE_RADIANS) % (Math.PI * 2)) /
        (Math.PI * 2);
      const angle =
        viewerAngle +
        V2_EXECUTION_BIT_VIEW_GAP_RADIANS * 0.5 +
        availableAngle * angularProgress;
      return new Vector3(
        venue.center.x + Math.cos(angle) * radius,
        venue.center.y + EXECUTION_BIT_HEIGHT,
        venue.center.z + Math.sin(angle) * radius
      );
    })
  );
};

export const cloneV2AlarmFrame = (
  source: V2AlarmFrame
): V2AlarmFrame =>
  Object.freeze({
    events: Object.freeze(
      source.events.map((event) =>
        Object.freeze({
          ...event,
          position: event.position.clone()
        })
      )
    ),
    activeCandidateIds: Object.freeze([
      ...source.activeCandidateIds
    ]),
    activeFloors: Object.freeze(
      source.activeFloors.map((floor) =>
        Object.freeze({
          ...floor,
          position: floor.position.clone(),
          supportNormal: floor.supportNormal.clone(),
          tangent: floor.tangent.clone()
        })
      )
    ),
    usedCandidateIds: Object.freeze([
      ...source.usedCandidateIds
    ]),
    blinks: Object.freeze(
      source.blinks.map((blink) =>
        Object.freeze({
          ...blink,
          position: blink.position.clone(),
          supportNormal: blink.supportNormal.clone(),
          tangent: blink.tangent.clone()
        })
      )
    )
  });
