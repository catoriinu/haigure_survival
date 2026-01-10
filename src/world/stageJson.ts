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

export type StageGameplayOptions = {
  skipAssembly: boolean;
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
    mapScale: {
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
        } | null;
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
    options: StageGameplayOptions;
  };
  overrides: unknown;
};

export const getAssemblyAreaFromStageJson = (stageJson: StageJson): StageArea => {
  const assemblyZone = stageJson.gameplay.zones.find(
    (zone) => zone.id === "assembly_area"
  ) as StageZone;
  const scaleX = stageJson.meta.mapScale.x;
  const scaleZ = stageJson.meta.mapScale.z;
  return {
    startCol: assemblyZone.x * scaleX,
    startRow: assemblyZone.z * scaleZ,
    width: assemblyZone.w * scaleX,
    height: assemblyZone.h * scaleZ
  };
};

export const createGridLayoutFromStageJson = (
  stageJson: StageJson
): GridLayout => {
  const baseRows = stageJson.mainMap.length;
  const baseColumns = stageJson.mainMap[0].length;
  const scaleX = stageJson.meta.mapScale.x;
  const scaleZ = stageJson.meta.mapScale.z;
  const rows = baseRows * scaleZ;
  const columns = baseColumns * scaleX;
  const cells: CellType[][] = [];
  const cellHeights: number[][] = [];
  const cellNoRender: boolean[][] = [];
  const maxHeightCells = Math.max(
    ...Object.values(stageJson.cellPhysics).map(
      (definition) => definition.heightCells
    )
  );
  const fallbackWallHeightCells = maxHeightCells;
  const cellSize = DEFAULT_GRID_CONFIG.cellSize;

  for (let row = 0; row < baseRows; row += 1) {
    const rowText = stageJson.mainMap[row];
    const expandedSymbols: string[] = [];
    for (let col = 0; col < baseColumns; col += 1) {
      const cellSymbol = rowText[col];
      for (let x = 0; x < scaleX; x += 1) {
        expandedSymbols.push(cellSymbol);
      }
    }
    for (let z = 0; z < scaleZ; z += 1) {
      const rowCells: CellType[] = [];
      const rowHeights: number[] = [];
      const rowNoRender: boolean[] = [];
      for (const cellSymbol of expandedSymbols) {
        const cellDefinition = stageJson.cellPhysics[
          cellSymbol
        ] as StageCellPhysicsDef;
        const isWall = cellDefinition.solid;
        rowCells.push(isWall ? "wall" : "floor");
        rowNoRender.push(cellDefinition.noRender === true);
        const wallHeightCells =
          isWall && cellDefinition.heightCells === 0
            ? fallbackWallHeightCells
            : cellDefinition.heightCells;
        rowHeights.push(wallHeightCells * cellSize);
      }
      cells.push(rowCells);
      cellHeights.push(rowHeights);
      cellNoRender.push(rowNoRender);
    }
  }

  const ceiling = Object.values(stageJson.generationRules.env)[0].ceiling;
  const ceilingHeight =
    ceiling === null ? null : ceiling.heightCells * cellSize;
  const maxWallHeight = maxHeightCells * cellSize;
  const height = Math.max(maxWallHeight, ceilingHeight ?? 0);
  const spawnMarker = stageJson.gameplay.markers.find(
    (marker) => marker.type === "spawn"
  ) as StageMarker;
  const spawn = {
    row: spawnMarker.z * scaleZ + Math.floor(scaleZ / 2),
    col: spawnMarker.x * scaleX + Math.floor(scaleX / 2)
  };
  const noSpawnCells: { row: number; col: number }[] = [];

  for (const zone of stageJson.gameplay.zones) {
    if (zone.type !== "noEnemySpawn") {
      continue;
    }
    const startRow = zone.z * scaleZ;
    const startCol = zone.x * scaleX;
    const zoneHeight = zone.h * scaleZ;
    const zoneWidth = zone.w * scaleX;
    for (let row = startRow; row < startRow + zoneHeight; row += 1) {
      for (let col = startCol; col < startCol + zoneWidth; col += 1) {
        noSpawnCells.push({ row, col });
      }
    }
  }

  return {
    columns,
    rows,
    cellSize,
    height,
    ceilingHeight,
    cellNoRender,
    spawn,
    noSpawnCells,
    cells,
    cellHeights
  };
};
