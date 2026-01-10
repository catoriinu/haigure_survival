import { DEFAULT_GRID_CONFIG, type CellType, type GridLayout } from "./grid";

export type StageCellPhysicsDef = {
  solid: boolean;
  heightCells: number;
  noRender?: boolean;
};

export type StageMarker = {
  id: string;
  type: "spawn" | "goal" | "checkpoint" | "loot" | "poi";
  x: number;
  z: number;
  rotY?: number;
  tags?: string[];
  props?: Record<string, unknown>;
};

export type StageZone = {
  id: string;
  type:
    | "safeZone"
    | "noEnemySpawn"
    | "noEnemyEnter"
    | "noCombat"
    | "hazard";
  x: number;
  z: number;
  w: number;
  h: number;
  tags?: string[];
  props?: Record<string, unknown>;
};

export type StageArea = {
  startCol: number;
  startRow: number;
  width: number;
  height: number;
};

export type StageJson = {
  meta: {
    name: string;
    description?: string;
    size?: {
      width: number;
      height: number;
    };
    mapScale?: {
      x: number;
      z: number;
    };
  };
  cellPhysics: Record<string, StageCellPhysicsDef>;
  mainMap: string[];
  semantics: unknown;
  generationRules: {
    env: Record<
      string,
      {
        ceiling: {
          heightCells: number;
          collision: boolean;
          style?: {
            tileId?: string;
          };
        };
      }
    >;
  };
  entities: unknown[];
  decals: unknown[];
  gameplay: {
    markers: StageMarker[];
    zones: StageZone[];
    spawners: unknown[];
    triggers: unknown[];
  };
  overrides: unknown;
};

export const getAssemblyAreaFromStageJson = (stageJson: StageJson): StageArea => {
  const assemblyZone = stageJson.gameplay.zones.find(
    (zone) => zone.id === "assembly_area"
  ) as StageZone;
  return {
    startCol: assemblyZone.x,
    startRow: assemblyZone.z,
    width: assemblyZone.w,
    height: assemblyZone.h
  };
};

export const createGridLayoutFromStageJson = (
  stageJson: StageJson
): GridLayout => {
  const rows = stageJson.mainMap.length;
  const columns = stageJson.mainMap[0].length;
  const cells: CellType[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowText = stageJson.mainMap[row];
    const rowCells: CellType[] = [];
    for (let col = 0; col < columns; col += 1) {
      const cellSymbol = rowText[col];
      const cellDefinition = stageJson.cellPhysics[
        cellSymbol
      ] as StageCellPhysicsDef;
      rowCells.push(cellDefinition.solid ? "wall" : "floor");
    }
    cells.push(rowCells);
  }

  const cellSize = DEFAULT_GRID_CONFIG.cellSize;
  const heightCells = Object.values(stageJson.generationRules.env)[0].ceiling
    .heightCells;
  const height = heightCells * cellSize;
  const spawnMarker = stageJson.gameplay.markers.find(
    (marker) => marker.type === "spawn"
  ) as StageMarker;
  const spawn = {
    row: spawnMarker.z,
    col: spawnMarker.x
  };
  const noSpawnCells: { row: number; col: number }[] = [];

  for (const zone of stageJson.gameplay.zones) {
    if (zone.type !== "noEnemySpawn") {
      continue;
    }
    for (let row = zone.z; row < zone.z + zone.h; row += 1) {
      for (let col = zone.x; col < zone.x + zone.w; col += 1) {
        noSpawnCells.push({ row, col });
      }
    }
  }

  return {
    columns,
    rows,
    cellSize,
    height,
    spawn,
    noSpawnCells,
    cells
  };
};
