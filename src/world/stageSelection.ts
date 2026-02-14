import { type StageJson } from "./stageJson";
import { LABYRINTH_DYNAMIC_STAGE_ID, TRAP_STAGE_ID } from "./stageIds";

export type StageSelection = {
  id: string;
  label: string;
  jsonPath: string;
};

const buildStageJsonPath = (filename: string) =>
  `${import.meta.env.BASE_URL}stage/${filename}`;

export const STAGE_CATALOG: StageSelection[] = [
  {
    id: "laboratory",
    label: "laboratory",
    jsonPath: buildStageJsonPath("laboratory.json")
  },
  {
    id: "city_center",
    label: "city_center",
    jsonPath: buildStageJsonPath("city_center.json")
  },
  {
    id: "arena",
    label: "arena",
    jsonPath: buildStageJsonPath("arena.json")
  },
  {
    id: TRAP_STAGE_ID,
    label: TRAP_STAGE_ID,
    jsonPath: buildStageJsonPath("arena_trap_room.json")
  },
  {
    id: "labyrinth",
    label: "labyrinth",
    jsonPath: buildStageJsonPath("labyrinth.json")
  },
  {
    id: LABYRINTH_DYNAMIC_STAGE_ID,
    label: LABYRINTH_DYNAMIC_STAGE_ID,
    jsonPath: buildStageJsonPath("labyrinth_dynamic.json")
  }
];

export const createStageSelector = (stages: StageSelection[]) => {
  let index = 0;
  return {
    getCurrent: () => stages[index],
    next: () => {
      index = (index + 1) % stages.length;
      return stages[index];
    }
  };
};

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
