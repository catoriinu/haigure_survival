import type {
  StageDoorInteractionCandidate,
  StageDoorRuntime
} from "../world/stageDoorRuntime";
import type { V2PlayerCompletionState } from "./combatTypes";
import type { V2NpcCommandCandidate } from "./npcSystem";
import type { V2PlayerAction } from "./playerInput";
import type { V2SurvivalFrame, V2SurvivalRuntime } from "./survivalRuntime";

export const V2_NORMAL_HORIZONTAL_SPEED_SCALE = 1 as const;
export const V2_WATER_HORIZONTAL_SPEED_SCALE = 0.5 as const;

export const resolveV2HorizontalSpeedScale = (
  inWater: boolean
):
  | typeof V2_NORMAL_HORIZONTAL_SPEED_SCALE
  | typeof V2_WATER_HORIZONTAL_SPEED_SCALE =>
  inWater
    ? V2_WATER_HORIZONTAL_SPEED_SCALE
    : V2_NORMAL_HORIZONTAL_SPEED_SCALE;

export type V2RuntimeInteractionFrame = Pick<
  V2SurvivalFrame,
  "phase" | "playerCompletionUnlocked"
>;

export type V2RuntimeInteractionSurvivalPort = Pick<
  V2SurvivalRuntime,
  "requestNpcCommand" | "selectPlayerCompletion"
>;

export type V2RuntimeInteractionDoorPort = Pick<
  StageDoorRuntime,
  "requestDoorToggle"
>;

export type V2RuntimeInteractionDispatch = Readonly<{
  actions: readonly V2PlayerAction[];
  frame: V2RuntimeInteractionFrame;
  npcCandidates: readonly V2NpcCommandCandidate[];
  doorCandidates: readonly StageDoorInteractionCandidate[];
  survival: V2RuntimeInteractionSurvivalPort;
  doors: V2RuntimeInteractionDoorPort;
}>;

const PLAYER_COMPLETION_BY_ACTION = Object.freeze({
  "select-gun": "brainwash-complete-gun",
  "select-no-gun": "brainwash-complete-no-gun",
  "select-haigure": "brainwash-complete-haigure"
} satisfies Readonly<
  Record<
    Extract<V2PlayerAction, `select-${string}`>,
    V2PlayerCompletionState
  >
>);

export const dispatchV2RuntimeInteractions = ({
  actions,
  frame,
  npcCandidates,
  doorCandidates,
  survival,
  doors
}: V2RuntimeInteractionDispatch): void => {
  const npcCandidate = npcCandidates[0];
  const doorCandidate = doorCandidates[0];

  for (const action of actions) {
    if (action === "npc-follow") {
      if (npcCandidate) {
        survival.requestNpcCommand(npcCandidate.npcId, "follow");
      }
      continue;
    }
    if (action === "npc-leave") {
      if (npcCandidate) {
        survival.requestNpcCommand(npcCandidate.npcId, "leave");
      }
      continue;
    }
    if (action === "door-toggle") {
      if (doorCandidate) {
        doors.requestDoorToggle(doorCandidate.door.id);
      }
      continue;
    }
    if (
      frame.phase === "playing" &&
      frame.playerCompletionUnlocked
    ) {
      survival.selectPlayerCompletion(
        PLAYER_COMPLETION_BY_ACTION[action]
      );
    }
  }
};
