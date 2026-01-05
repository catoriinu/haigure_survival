export type StageSelection = {
  id: string;
  label: string;
  jsonPath: string;
};

export const STAGE_CATALOG: StageSelection[] = [
  {
    id: "default",
    label: "default",
    jsonPath: "/stage/default.json"
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
): Promise<unknown | null> => {
  try {
    const response = await fetch(selection.jsonPath, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    return null;
  }
};
