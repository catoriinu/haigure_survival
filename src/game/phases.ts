export type GamePhase =
  | "title"
  | "playing"
  | "roulette"
  | "transition"
  | "assemblyMove"
  | "assemblyHold"
  | "assemblyFree"
  | "execution";

export const isAssemblyPhase = (phase: GamePhase) =>
  phase === "assemblyMove" ||
  phase === "assemblyHold" ||
  phase === "assemblyFree";

export const canReleaseAssemblyControl = (phase: GamePhase) =>
  phase === "assemblyMove" || phase === "assemblyHold";

export const canReturnToTitleFromPhase = (phase: GamePhase) =>
  isAssemblyPhase(phase) || phase === "execution" || phase === "roulette";

export const shouldPreventContextMenuForPhase = (phase: GamePhase) =>
  isAssemblyPhase(phase) || phase === "execution";

export const isDefeatScenePhase = (phase: GamePhase) =>
  isAssemblyPhase(phase) || phase === "execution";

export const shouldShowFirstPersonBodyForPhase = (phase: GamePhase) =>
  phase === "playing" || isDefeatScenePhase(phase);

export const shouldHidePlayerAvatarFromMainCamera = (phase: GamePhase) =>
  phase === "playing" || isDefeatScenePhase(phase);

export const usesPlayerEyeHeight = (phase: GamePhase) =>
  phase === "playing" || phase === "roulette" || phase === "assemblyFree";

export const shouldSyncPlayerAvatarToCamera = (phase: GamePhase) =>
  phase === "playing" || phase === "assemblyFree";
