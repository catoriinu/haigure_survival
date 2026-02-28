import { type StageJson } from "./stageJson";
import type { GameConfig } from "../runtimeAssets/types";
import { buildAssetUrl } from "../runtimeAssets/loadConfig";

export type StageSelection = {
  id: string;
  label: string;
  jsonPath: string;
};

export const buildStageCatalog = (gameConfig: GameConfig): StageSelection[] =>
  gameConfig.stageCatalog.map((stage) => ({
    id: stage.id,
    label: stage.label,
    jsonPath: buildAssetUrl("stage", stage.jsonFile)
  }));

export const loadStageJson = async (
  selection: StageSelection
): Promise<StageJson | null> => {
  try {
    const response = await fetch(selection.jsonPath, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as StageJson;
  } catch (error) {
    return null;
  }
};
