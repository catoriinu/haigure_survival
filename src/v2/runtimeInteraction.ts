import type {
  StageDoorInteractionCandidate,
  StageDoorRuntime
} from "../world/stageDoorRuntime";
import type { V2PlayerCompletionState } from "./combatTypes";
import type {
  V2NpcCommandCandidate,
  V2NpcCommandMode
} from "./npcSystem";
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

export type V2RuntimeExecutionReplaySurvivalPort = Pick<
  V2SurvivalRuntime,
  "replayExecution"
>;

export type V2RuntimeExecutionReplayDispatchResult =
  | "ignored"
  | "execution-replayed";

export type V2RuntimeExecutionReplayDispatch = Readonly<{
  actions: readonly V2PlayerAction[];
  frame: Pick<V2SurvivalFrame, "phase">;
  survival: V2RuntimeExecutionReplaySurvivalPort;
}>;

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

export type V2RuntimeInteractionFeedback =
  | Readonly<{
      kind: "npc-command-changed";
      npcId: string;
      commandMode: V2NpcCommandMode;
    }>
  | Readonly<{
      kind: "door-toggle-started";
      doorId: string;
      state: "opening" | "closing";
    }>;

export const dispatchV2RuntimeExecutionReplay = ({
  actions,
  frame,
  survival
}: V2RuntimeExecutionReplayDispatch): V2RuntimeExecutionReplayDispatchResult => {
  if (!actions.includes("replay-execution")) {
    return "ignored";
  }
  if (
    frame.phase === "execution" ||
    frame.phase === "execution-complete"
  ) {
    survival.replayExecution();
    return "execution-replayed";
  }
  return "ignored";
};

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
}: V2RuntimeInteractionDispatch): readonly V2RuntimeInteractionFeedback[] => {
  const npcCandidate = npcCandidates[0];
  const doorCandidate = doorCandidates[0];
  const feedback: V2RuntimeInteractionFeedback[] = [];
  let effectiveNpcCommandMode = npcCandidate?.commandMode ?? null;
  let doorToggleStarted = false;

  for (const action of actions) {
    if (action === "replay-execution") {
      continue;
    }
    if (action === "npc-follow") {
      if (
        npcCandidate &&
        effectiveNpcCommandMode !== "follow" &&
        survival.requestNpcCommand(npcCandidate.npcId, "follow")
      ) {
        effectiveNpcCommandMode = "follow";
        feedback.push(
          Object.freeze({
            kind: "npc-command-changed",
            npcId: npcCandidate.npcId,
            commandMode: "follow"
          })
        );
      }
      continue;
    }
    if (action === "npc-leave") {
      if (
        npcCandidate &&
        effectiveNpcCommandMode !== "leave" &&
        survival.requestNpcCommand(npcCandidate.npcId, "leave")
      ) {
        effectiveNpcCommandMode = "leave";
        feedback.push(
          Object.freeze({
            kind: "npc-command-changed",
            npcId: npcCandidate.npcId,
            commandMode: "leave"
          })
        );
      }
      continue;
    }
    if (action === "door-toggle") {
      if (doorCandidate && !doorToggleStarted) {
        const result = doors.requestDoorToggle(
          doorCandidate.door.id
        );
        if (result.status === "started") {
          doorToggleStarted = true;
          feedback.push(
            Object.freeze({
              kind: "door-toggle-started",
              doorId: doorCandidate.door.id,
              state: result.state
            })
          );
        }
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
  return Object.freeze(feedback);
};
