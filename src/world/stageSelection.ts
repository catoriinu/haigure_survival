import {
  STAGE_DEFINITION_SCHEMA_VERSION,
  type StageDefinitionV2
} from "./stageJson";
import { LABYRINTH_DYNAMIC_STAGE_ID, TRAP_STAGE_ID } from "./stageIds";

export type StageSelection = {
  id: string;
  label: string;
  definitionPath: string;
};

const buildStageDefinitionPath = (filename: string) =>
  `${import.meta.env.BASE_URL}stage/${filename}`;

export const STAGE_CATALOG: StageSelection[] = [
  {
    id: "laboratory",
    label: "laboratory",
    definitionPath: buildStageDefinitionPath("laboratory.json")
  },
  {
    id: "city_center",
    label: "city_center",
    definitionPath: buildStageDefinitionPath("city_center.json")
  },
  {
    id: "arena",
    label: "arena",
    definitionPath: buildStageDefinitionPath("arena.json")
  },
  {
    id: TRAP_STAGE_ID,
    label: TRAP_STAGE_ID,
    definitionPath: buildStageDefinitionPath("arena_trap_room.json")
  },
  {
    id: "arena_roulette",
    label: "arena_roulette",
    definitionPath: buildStageDefinitionPath("arena_roulette.json")
  },
  {
    id: "arena_mirror_house",
    label: "arena_mirror_house",
    definitionPath: buildStageDefinitionPath("arena_mirror_house.json")
  },
  {
    id: "labyrinth",
    label: "labyrinth",
    definitionPath: buildStageDefinitionPath("labyrinth.json")
  },
  {
    id: LABYRINTH_DYNAMIC_STAGE_ID,
    label: LABYRINTH_DYNAMIC_STAGE_ID,
    definitionPath: buildStageDefinitionPath("labyrinth_dynamic.json")
  }
];

export const loadStageDefinition = async (
  selection: StageSelection
): Promise<StageDefinitionV2> => {
  const response = await fetch(selection.definitionPath, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `ステージ定義の取得に失敗しました: ${selection.definitionPath} (${response.status})`
    );
  }
  const definition = (await response.json()) as Partial<StageDefinitionV2>;
  if (definition.schemaVersion !== STAGE_DEFINITION_SCHEMA_VERSION) {
    throw new Error(
      `未対応のステージ定義バージョンです: ${String(definition.schemaVersion)}`
    );
  }
  if (definition.kind !== "procedural-grid" && definition.kind !== "glb") {
    throw new Error(`未知のステージ種別です: ${String(definition.kind)}`);
  }
  return definition as StageDefinitionV2;
};
