import { CharacterState } from "../types";

export type RoulettePhase =
  | "inactive"
  | "despawn-wait"
  | "spawn-wait"
  | "spinning"
  | "post-spin-wait"
  | "fire-effect"
  | "hit-sequence"
  | "post-hit-wait"
  | "ended";

export type RouletteHitTarget =
  | { kind: "player" }
  | { kind: "npc"; npcIndex: number };

export type RouletteSnapshot = {
  playerState: CharacterState;
  npcStates: CharacterState[];
  rouletteRoundCount: number;
  rouletteNoHitRoundCount: number;
  rouletteSurviveCountAtBrainwash: number | null;
};

export type RouletteRoundStats = {
  elapsed: number;
  roundCount: number;
  surviveCount: number | null;
  noHitRoundCount: number;
};

export type RouletteSpinProfile = {
  duration: number;
  accelDuration: number;
  decelStart: number;
  glideStart: number;
  finalBrakeStart: number;
  glideSpeedRatio: number;
};
