import type { V2SurvivalPopulation } from "./survivalRuntime";

export type V2RuntimeStressProfile = "baseline" | "high";

export type V2RuntimeStressScenario = Readonly<{
  profile: V2RuntimeStressProfile;
  seed: number;
  durationSeconds: number;
  population: V2SurvivalPopulation;
}>;

export type V2RuntimeStressReport = Readonly<{
  status: "running" | "passed" | "failed";
  profile: V2RuntimeStressProfile;
  seed: number;
  durationSeconds: number;
  wallElapsedSeconds: number;
  simulationElapsedSeconds: number;
  frameCount: number;
  population: V2SurvivalPopulation;
  initialNpcCount: number;
  initialBrainwashedNpcCount: number;
  initialBitCount: number;
  currentNpcCount: number;
  currentBrainwashedNpcCount: number;
  currentBitCount: number;
  phase: string;
  spatialRevision: number;
  error: string | null;
}>;

const V2_RUNTIME_STRESS_DEFAULT_SEED = 20260729;

const BASELINE_SCENARIO = Object.freeze({
  profile: "baseline" as const,
  durationSeconds: 600,
  population: Object.freeze({
    npcCount: 50,
    initialBrainwashedNpcCount: 10,
    initialBitCount: 20,
    bitReinforcementIntervalSeconds: 10,
    maximumBitCount: 20
  })
});

const HIGH_SCENARIO = Object.freeze({
  profile: "high" as const,
  durationSeconds: 120,
  population: Object.freeze({
    npcCount: 99,
    initialBrainwashedNpcCount: 66,
    initialBitCount: 50,
    bitReinforcementIntervalSeconds: 10,
    maximumBitCount: 50
  })
});

const parseSeed = (value: string | null) => {
  if (value === null) {
    return V2_RUNTIME_STRESS_DEFAULT_SEED;
  }
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(
      "schoolStress seedには0以上の安全な整数が必要です。"
    );
  }
  return seed;
};

export const readV2RuntimeStressScenario = (
  search: string
): V2RuntimeStressScenario | null => {
  const parameters = new URLSearchParams(search);
  const requestedProfile = parameters.get("schoolStress");
  if (requestedProfile === null) {
    return null;
  }
  const profile =
    requestedProfile === "baseline"
      ? BASELINE_SCENARIO
      : requestedProfile === "high"
        ? HIGH_SCENARIO
        : (() => {
            throw new Error(
              "schoolStressにはbaselineまたはhighが必要です。"
            );
          })();
  return Object.freeze({
    profile: profile.profile,
    seed: parseSeed(parameters.get("seed")),
    durationSeconds: profile.durationSeconds,
    population: profile.population
  });
};
