import type { V2SurvivalFrame } from "./survivalRuntime";

export type V2MissionHudMode = "hidden" | "missions" | "results";

export const resolveV2MissionHudMode = (
  started: boolean,
  phase: V2SurvivalFrame["phase"]
): V2MissionHudMode => {
  if (!started) {
    return "hidden";
  }
  if (phase === "playing") {
    return "missions";
  }
  if (phase === "assembly" || phase === "execution-complete") {
    return "results";
  }
  return "hidden";
};
