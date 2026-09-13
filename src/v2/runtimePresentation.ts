import type { V2SurvivalFrame } from "./survivalRuntime";
import type { V2TitleStartMode } from "./titleSettingsSession";

export type V2MissionHudMode = "hidden" | "missions" | "results";

export const resolveV2MissionHudMode = (
  started: boolean,
  phase: V2SurvivalFrame["phase"],
  startMode: V2TitleStartMode,
  missionEnabled: boolean
): V2MissionHudMode => {
  if (!started || !missionEnabled || startMode === "instant-public-execution") {
    return "hidden";
  }
  if (phase === "playing") {
    return "missions";
  }
  return "results";
};
