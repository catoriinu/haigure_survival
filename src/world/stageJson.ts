import { DEFAULT_GRID_CONFIG, type CellType, type GridLayout } from "./grid";

export type StageCellPhysicsDef = {
  solid: boolean;
  heightCells: number;
  noRender?: boolean;
};

export type StageSurfaceStyle = {
  tileId?: string;
};

export type StageCeilingRule = {
  heightCells: number;
  collision: boolean;
  style?: StageSurfaceStyle;
};

export type StageSkyRule = {
  color: string;
};

export type StageEnvRule = {
  floor?: StageSurfaceStyle;
  obstacle?: StageSurfaceStyle;
  ceiling: StageCeilingRule | null;
  sky?: StageSkyRule;
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

export type StageSemantics = {
  channels: {
    env: string[];
    zone?: string[];
  };
  brief?: {
    env?: Record<string, string>;
    zone?: Record<string, string>;
  };
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
  semantics: StageSemantics;
  generationRules: {
    env: Record<string, StageEnvRule>;
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

type StageMapScale = StageJson["meta"]["mapScale"];
type StageMapWidth = {
  width: number;
};

const getStageMapWidth = (rows: string[]): StageMapWidth => ({
  width: rows[0].length
});

const flipStageColumns = (rows: string[]): string[] =>
  rows.map((row) => row.split("").reverse().join(""));

const flipStageMarkerX = (
  marker: StageMarker,
  mapSize: StageMapWidth
): StageMarker => ({
  ...marker,
  x: mapSize.width - 1 - marker.x
});

const flipStageZoneX = (zone: StageZone, mapSize: StageMapWidth): StageZone => ({
  ...zone,
  x: mapSize.width - zone.x - zone.w
});

const expandSymbolMap = (
  rows: string[],
  mapScale: StageMapScale
): string[][] => {
  const baseRows = rows.length;
  const baseColumns = rows[0].length;
  const expanded: string[][] = [];

  for (let row = 0; row < baseRows; row += 1) {
    const rowText = rows[row];
    const expandedSymbols: string[] = [];
    for (let col = 0; col < baseColumns; col += 1) {
      const cellSymbol = rowText[col];
      for (let x = 0; x < mapScale.x; x += 1) {
        expandedSymbols.push(cellSymbol);
      }
    }
    for (let z = 0; z < mapScale.z; z += 1) {
      expanded.push([...expandedSymbols]);
    }
  }

  return expanded;
};

const createCellDataFromSymbolMap = (
  symbolMap: string[][],
  cellPhysics: Record<string, StageCellPhysicsDef>,
  cellSize: number,
  fallbackWallHeightCells: number
) => {
  const cells: CellType[][] = [];
  const cellHeights: number[][] = [];
  const cellNoRender: boolean[][] = [];

  for (const rowSymbols of symbolMap) {
    const rowCells: CellType[] = [];
    const rowHeights: number[] = [];
    const rowNoRender: boolean[] = [];
    for (const cellSymbol of rowSymbols) {
      const cellDefinition = cellPhysics[cellSymbol] as StageCellPhysicsDef;
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

  return { cells, cellHeights, cellNoRender };
};

export const getAssemblyAreaFromStageJson = (stageJson: StageJson): StageArea => {
  const mapSize = getStageMapWidth(stageJson.mainMap);
  const assemblyZone = flipStageZoneX(
    stageJson.gameplay.zones.find(
      (zone) => zone.id === "assembly_area"
    ) as StageZone,
    mapSize
  );
  const scaleX = stageJson.meta.mapScale.x;
  const scaleZ = stageJson.meta.mapScale.z;
  return {
    startCol: assemblyZone.x * scaleX,
    startRow: assemblyZone.z * scaleZ,
    width: assemblyZone.w * scaleX,
    height: assemblyZone.h * scaleZ
  };
};

export const createEnvMapFromStageJson = (
  stageJson: StageJson
): string[][] => {
  return expandSymbolMap(
    flipStageColumns(stageJson.semantics.channels.env),
    stageJson.meta.mapScale
  );
};

export const getSkyColorFromStageJson = (
  stageJson: StageJson
): string | null => stageJson.generationRules.env.O?.sky?.color ?? null;

export type StageEnvironmentData = {
  envMap: string[][];
  skyColor: string | null;
};

export const createStageEnvironmentFromStageJson = (
  stageJson: StageJson
): StageEnvironmentData => ({
  envMap: createEnvMapFromStageJson(stageJson),
  skyColor: getSkyColorFromStageJson(stageJson)
});

export const createGridLayoutFromStageJson = (
  stageJson: StageJson
): GridLayout => {
  const scaleX = stageJson.meta.mapScale.x;
  const scaleZ = stageJson.meta.mapScale.z;
  const mapSize = getStageMapWidth(stageJson.mainMap);
  const maxHeightCells = Math.max(
    ...Object.values(stageJson.cellPhysics).map(
      (definition) => definition.heightCells
    )
  );
  const fallbackWallHeightCells = maxHeightCells;
  const cellSize = DEFAULT_GRID_CONFIG.cellSize;
  const symbolMap = expandSymbolMap(
    flipStageColumns(stageJson.mainMap),
    stageJson.meta.mapScale
  );
  const rows = symbolMap.length;
  const columns = symbolMap[0].length;
  const { cells, cellHeights, cellNoRender } = createCellDataFromSymbolMap(
    symbolMap,
    stageJson.cellPhysics,
    cellSize,
    fallbackWallHeightCells
  );

  const ceiling = Object.values(stageJson.generationRules.env)[0].ceiling;
  const ceilingHeight =
    ceiling === null ? null : ceiling.heightCells * cellSize;
  const maxWallHeight = maxHeightCells * cellSize;
  const height = Math.max(maxWallHeight, ceilingHeight ?? 0);
  const spawnMarker = flipStageMarkerX(
    stageJson.gameplay.markers.find(
      (marker) => marker.type === "spawn"
    ) as StageMarker,
    mapSize
  );
  const spawn = {
    row: spawnMarker.z * scaleZ + Math.floor(scaleZ / 2),
    col: spawnMarker.x * scaleX + Math.floor(scaleX / 2)
  };
  const noSpawnCells: { row: number; col: number }[] = [];

  for (const zone of stageJson.gameplay.zones) {
    if (zone.type !== "noEnemySpawn") {
      continue;
    }
    const flippedZone = flipStageZoneX(zone, mapSize);
    const startRow = flippedZone.z * scaleZ;
    const startCol = flippedZone.x * scaleX;
    const zoneHeight = flippedZone.h * scaleZ;
    const zoneWidth = flippedZone.w * scaleX;
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
