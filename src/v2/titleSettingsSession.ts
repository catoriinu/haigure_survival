import {
  createV2InstantExecutionPopulation,
  createV2SurvivalPopulationFromTitleSettings,
  type V2InstantExecutionMethod,
  type V2TitleSettings,
  type V2TitleSettingsRuntimePopulation
} from "../v2TitleSettingsStore";
import type { V2ExecutionPlayerRole } from "./publicExecutionSystem";

export type V2TitleStartMode = "normal" | "instant-public-execution";

export type V2InstantPublicExecutionScenario = Readonly<{
  method: V2InstantExecutionMethod;
  venueId: "assembly-courtyard" | "assembly-gym";
  targetActorIds: readonly string[];
  audienceNpcIds: readonly string[];
  npcShooterIds: readonly string[];
  bitShooterIds: readonly string[];
  playerRole: V2ExecutionPlayerRole;
}>;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type V2SessionStartSnapshot = DeepReadonly<
  Readonly<{
    startMode: V2TitleStartMode;
    settings: V2TitleSettings;
    runtimePopulation: V2TitleSettingsRuntimePopulation;
    instantPublicExecutionScenario: V2InstantPublicExecutionScenario | null;
  }>
>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const deepFreeze = <T extends object>(value: T): DeepReadonly<T> => {
  for (const nested of Object.values(value)) {
    if (typeof nested === "object" && nested !== null && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value) as DeepReadonly<T>;
};

const createSequentialIds = (
  prefix: "npc_" | "v2_bit_",
  count: number,
  offset = 0
): readonly string[] =>
  Object.freeze(
    Array.from({ length: count }, (_, index) => `${prefix}${index + offset}`)
  );

export const createV2InstantPublicExecutionScenario = (
  settings: V2TitleSettings["execution"],
  venueRandom: () => number
): V2InstantPublicExecutionScenario => {
  const venueRoll = venueRandom();
  if (!Number.isFinite(venueRoll) || venueRoll < 0 || venueRoll >= 1) {
    throw new Error(`即時公開処刑の会場乱数は0以上1未満が必要です: ${venueRoll}`);
  }
  const npcTargetIds = createSequentialIds("npc_", settings.targetNpcCount);
  const surroundingNpcIds = createSequentialIds(
    "npc_",
    settings.surroundingNpcCount,
    settings.targetNpcCount
  );
  const playerIsTarget =
    settings.method === "player-bit" || settings.method === "player-npc";
  const targetActorIds = [...npcTargetIds];
  if (playerIsTarget) {
    targetActorIds.splice(Math.floor(targetActorIds.length / 2), 0, "player");
  }
  const usesNpcShooters =
    settings.method === "player-npc" || settings.method === "npc-npc";
  const usesBitShooters =
    settings.method === "player-bit" || settings.method === "npc-bit";
  return Object.freeze({
    method: settings.method,
    venueId:
      venueRoll < 0.5 ? "assembly-courtyard" : "assembly-gym",
    targetActorIds: Object.freeze(targetActorIds),
    audienceNpcIds: surroundingNpcIds,
    npcShooterIds: usesNpcShooters
      ? surroundingNpcIds
      : Object.freeze([]),
    bitShooterIds: usesBitShooters
      ? createSequentialIds("v2_bit_", settings.surroundingBitCount)
      : Object.freeze([]),
    playerRole:
      settings.method === "npc-player"
        ? "shooter"
        : playerIsTarget
          ? "target"
          : "observer"
  });
};

export const createV2SessionStartSnapshot = ({
  startMode,
  settings,
  venueRandom,
  runtimePopulation
}: Readonly<{
  startMode: V2TitleStartMode;
  settings: V2TitleSettings;
  venueRandom: () => number;
  runtimePopulation?: V2TitleSettingsRuntimePopulation;
}>): V2SessionStartSnapshot => {
  const instantPublicExecutionScenario =
    startMode === "instant-public-execution"
      ? createV2InstantPublicExecutionScenario(settings.execution, venueRandom)
      : null;
  return deepFreeze({
    startMode,
    settings: clone(settings),
    runtimePopulation: clone(
      runtimePopulation ??
        (startMode === "instant-public-execution"
          ? createV2InstantExecutionPopulation(settings.execution)
          : createV2SurvivalPopulationFromTitleSettings(settings))
    ),
    instantPublicExecutionScenario
  });
};

export const doV2SessionStartSnapshotsMatch = (
  active: V2SessionStartSnapshot,
  current: V2SessionStartSnapshot
): boolean => JSON.stringify(active) === JSON.stringify(current);
