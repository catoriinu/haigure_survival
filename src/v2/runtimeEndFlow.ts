import type { V2PlayerAction } from "./playerInput";
import type { V2SurvivalFrame } from "./survivalRuntime";

export type V2RuntimeEndFlowFrame = Pick<
  V2SurvivalFrame,
  "phase" | "playerCompletionUnlocked"
>;

export type V2RuntimeEndFlowDecision =
  | "ignored"
  | "retry-normal-session"
  | "enter-epilogue"
  | "replay-execution"
  | "return-to-title";

export const dispatchV2RuntimeEndFlow = (
  actions: readonly V2PlayerAction[],
  frame: V2RuntimeEndFlowFrame
): V2RuntimeEndFlowDecision => {
  for (const action of actions) {
    if (action === "retry") {
      if (frame.phase === "playing" && frame.playerCompletionUnlocked) {
        return "retry-normal-session";
      }
      if (frame.phase === "execution-complete") {
        return "replay-execution";
      }
    }
    if (action === "advance-end-flow") {
      if (frame.phase === "playing" && frame.playerCompletionUnlocked) {
        return "enter-epilogue";
      }
      if (
        frame.phase === "assembly" ||
        frame.phase === "execution-complete"
      ) {
        return "return-to-title";
      }
    }
  }
  return "ignored";
};
