import { publicExecutionMaxSurvivors } from "../game/publicExecutionConfig";

export type ExecuteMethod =
  | "player-bit"
  | "player-npc"
  | "npc-bit"
  | "npc-npc"
  | "npc-player";

export type ExecuteSettings = {
  method: ExecuteMethod;
  targetNpcCount: number;
  surroundingNpcCount: number;
  surroundingBitCount: number;
};

export const executeMethodOptions: ReadonlyArray<{
  value: ExecuteMethod;
  label: string;
}> = [
  { value: "player-bit", label: "プレイヤーをビットが処刑" },
  { value: "player-npc", label: "プレイヤーをNPCが処刑" },
  { value: "npc-bit", label: "NPCをビットが処刑" },
  { value: "npc-npc", label: "NPCをNPCが処刑" },
  { value: "npc-player", label: "NPCをプレイヤーが処刑" }
] as const;

export const defaultExecuteSettings: ExecuteSettings = {
  method: "player-bit",
  targetNpcCount: 0,
  surroundingNpcCount: 11,
  surroundingBitCount: 10
};

const clampInteger = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

export const isPlayerExecutionMethod = (method: ExecuteMethod) =>
  method === "player-bit" || method === "player-npc";

export const isNpcExecutionMethod = (method: ExecuteMethod) =>
  !isPlayerExecutionMethod(method);

export const usesBitExecutionMethod = (method: ExecuteMethod) =>
  method === "player-bit" || method === "npc-bit";

export const isPlayerShooterExecutionMethod = (method: ExecuteMethod) =>
  method === "npc-player";

export const getExecuteTargetNpcMin = (method: ExecuteMethod) =>
  isNpcExecutionMethod(method) ? 1 : 0;

export const getExecuteTargetNpcMax = (method: ExecuteMethod) =>
  isPlayerExecutionMethod(method)
    ? publicExecutionMaxSurvivors - 1
    : publicExecutionMaxSurvivors;

export const getExecuteCentralCharacterCount = (
  method: ExecuteMethod,
  targetNpcCount: number
) => targetNpcCount + (isPlayerExecutionMethod(method) ? 1 : 0);

export const normalizeExecuteSettings = (
  source: ExecuteSettings
): ExecuteSettings => {
  const targetNpcCount = clampInteger(
    source.targetNpcCount,
    getExecuteTargetNpcMin(source.method),
    getExecuteTargetNpcMax(source.method)
  );
  const centralCharacterCount = getExecuteCentralCharacterCount(
    source.method,
    targetNpcCount
  );
  return {
    method: source.method,
    targetNpcCount,
    surroundingNpcCount: clampInteger(
      source.surroundingNpcCount,
      centralCharacterCount,
      99
    ),
    surroundingBitCount: usesBitExecutionMethod(source.method)
      ? clampInteger(source.surroundingBitCount, centralCharacterCount, 99)
      : clampInteger(source.surroundingBitCount, 0, 99)
  };
};

export const getEffectiveExecuteBitCount = (settings: ExecuteSettings) =>
  usesBitExecutionMethod(settings.method)
    ? normalizeExecuteSettings(settings).surroundingBitCount
    : 0;
