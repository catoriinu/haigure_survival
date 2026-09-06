import type { V2PlayerAction } from "./playerInput";
import type { V2SurvivalFrame } from "./survivalRuntime";
import type { V2TitleStartMode } from "./titleSettingsSession";

export type V2RuntimeEndFlowFrame = Pick<
  V2SurvivalFrame,
  "phase"
>;

export type V2RuntimeEndFlowDecision =
  | "ignored"
  | "retry-normal-session"
  | "replay-execution"
  | "return-to-title";

export const dispatchV2RuntimeEndFlow = (
  actions: readonly V2PlayerAction[],
  frame: V2RuntimeEndFlowFrame,
  startMode: V2TitleStartMode
): V2RuntimeEndFlowDecision => {
  for (const action of actions) {
    if (action === "retry") {
      if (frame.phase === "playing") {
        return "retry-normal-session";
      }
      if (
        frame.phase === "execution-complete" ||
        (startMode === "instant-public-execution" && frame.phase === "execution")
      ) {
        return "replay-execution";
      }
    }
    if (action === "advance-end-flow") {
      if (
        frame.phase === "playing" ||
        frame.phase === "assembly" ||
        frame.phase === "execution-complete" ||
        (startMode === "instant-public-execution" && frame.phase === "execution")
      ) {
        return "return-to-title";
      }
    }
  }
  return "ignored";
};
