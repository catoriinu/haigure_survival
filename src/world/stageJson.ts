import { DEFAULT_GRID_CONFIG, type CellType, type GridLayout } from "./grid";

export const STAGE_DEFINITION_SCHEMA_VERSION = 2 as const;
export const BLENDER_METERS_TO_BABYLON_UNITS = 0.25;

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

export type StageDecalReflectiveStyle = {
  kind: "mirror";
  tint: string;
  amount: number;
  blur: number;
};

export type StageDecal = {
  face: "floor" | "wall" | "ceiling";
  type: "cell" | "rect";
  x: number;
  z: number;
  w?: number;
  h?: number;
  wallDir?: "N" | "E" | "S" | "W";
  texture?: string;
  tileId?: string;
  color?: string;
  reflective?: StageDecalReflectiveStyle;
};

export type StageArea = {
  startCol: number;
  startRow: number;
  width: number;
  height: number;
};

export type StageDefinitionCommonV2 = {
  schemaVersion: typeof STAGE_DEFINITION_SCHEMA_VERSION;
  meta: {
    name: string;
    description?: string;
  };
  gameplay: {
    markers: StageMarker[];
    zones: StageZone[];
    options: {
      skipAssembly: boolean;
    };
  };
  authoring?: {
    symbols?: {
      env?: Record<string, string>;
      zone?: Record<string, string>;
    };
    zoneRules?: Record<string, unknown>;
  };
};

export type ProceduralGridStageDefinitionV2 = StageDefinitionCommonV2 & {
  kind: "procedural-grid";
  grid: {
    cellSize: number;
    mapScale: {
      x: number;
      z: number;
    };
    cellPhysics: Record<string, StageCellPhysicsDef>;
    mainMap: string[];
    zoneMap?: string[];
  };
  rendering: {
    environmentMap: string[];
    environmentRules: Record<string, StageEnvRule>;
    decals: StageDecal[];
  };
};

export type GlbStageDefinitionV2 = StageDefinitionCommonV2 & {
  kind: "glb";
  asset: {
    path: string;
  };
  navigation: {
    cellSizeMeters: number;
    originMeters: {
      x: number;
      y: number;
    };
    cellPhysics: Record<string, StageCellPhysicsDef>;
    mainMap: string[];
    zoneMap?: string[];
  };
  environment: {
    skyColor?: string;
  };
};

export type StageDefinitionV2 =
  | ProceduralGridStageDefinitionV2
  | GlbStageDefinitionV2;

type StageMapScale = ProceduralGridStageDefinitionV2["grid"]["mapScale"];
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

const flipStageWallDir = (wallDir: StageDecal["wallDir"]) => {
  if (wallDir === "E") {
    return "W";
  }
  if (wallDir === "W") {
    return "E";
  }
  return wallDir;
};

const flipStageDecalX = (
  decal: StageDecal,
  mapSize: StageMapWidth
): StageDecal => {
  const width = decal.type === "rect" ? (decal.w ?? 1) : 1;
  const flippedX =
    decal.wallDir === "E" || decal.wallDir === "W"
      ? mapSize.width - 1 - decal.x
      : mapSize.width - decal.x - width;
  return {
    ...decal,
    x: flippedX,
    wallDir: flipStageWallDir(decal.wallDir)
  };
};

const expandSymbolMap = (
  rows: string[],
  mapScale: StageMapScale
): string[][] => {
  const expanded: string[][] = [];

  for (const rowText of rows) {
    const expandedSymbols: string[] = [];
    for (const cellSymbol of rowText) {
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

const getDefinitionRows = (definition: StageDefinitionV2) =>
  definition.kind === "procedural-grid"
    ? definition.grid.mainMap
    : definition.navigation.mainMap;

const getDefinitionMapScale = (
  definition: StageDefinitionV2
): StageMapScale =>
  definition.kind === "procedural-grid"
    ? definition.grid.mapScale
    : { x: 1, z: 1 };

const transformMarker = (
  definition: StageDefinitionV2,
  marker: StageMarker
) =>
  definition.kind === "procedural-grid"
    ? flipStageMarkerX(marker, getStageMapWidth(definition.grid.mainMap))
    : marker;

const transformZone = (definition: StageDefinitionV2, zone: StageZone) =>
  definition.kind === "procedural-grid"
    ? flipStageZoneX(zone, getStageMapWidth(definition.grid.mainMap))
    : zone;

export const getAssemblyAreaFromStageDefinition = (
  definition: StageDefinitionV2
): StageArea => {
  const assemblyZone = transformZone(
    definition,
    definition.gameplay.zones.find(
      (zone) => zone.id === "assembly_area"
    ) as StageZone
  );
  const scale = getDefinitionMapScale(definition);
  return {
    startCol: assemblyZone.x * scale.x,
    startRow: assemblyZone.z * scale.z,
    width: assemblyZone.w * scale.x,
    height: assemblyZone.h * scale.z
  };
};

export const getPlayerSpawnMarkerFromStageDefinition = (
  definition: StageDefinitionV2
): StageMarker | null => {
  const marker = definition.gameplay.markers.find(
    (candidate) =>
      candidate.id === "spawn_player" && candidate.type === "spawn"
  );
  return marker ? transformMarker(definition, marker) : null;
};

export const createEnvMapFromStageDefinition = (
  definition: ProceduralGridStageDefinitionV2
): string[][] =>
  expandSymbolMap(
    flipStageColumns(definition.rendering.environmentMap),
    definition.grid.mapScale
  );

export const createZoneMapFromStageDefinition = (
  definition: StageDefinitionV2
): string[][] | null => {
  const rows =
    definition.kind === "procedural-grid"
      ? definition.grid.zoneMap
      : definition.navigation.zoneMap;
  if (!rows) {
    return null;
  }
  if (definition.kind === "procedural-grid") {
    return expandSymbolMap(flipStageColumns(rows), definition.grid.mapScale);
  }
  return rows.map((row) => [...row]);
};

export const createStageDecalsFromStageDefinition = (
  definition: ProceduralGridStageDefinitionV2
): StageDecal[] => {
  const mapSize = getStageMapWidth(definition.grid.mainMap);
  return definition.rendering.decals.map((decal) =>
    flipStageDecalX(decal, mapSize)
  );
};

export const getSkyColorFromStageDefinition = (
  definition: StageDefinitionV2
): string | null => {
  if (definition.kind === "glb") {
    return definition.environment.skyColor ?? null;
  }
  return definition.rendering.environmentRules.O?.sky?.color ?? null;
};

export const createStageEnvironmentFromStageDefinition = (
  definition: ProceduralGridStageDefinitionV2
) => ({
  envMap: createEnvMapFromStageDefinition(definition),
  skyColor: getSkyColorFromStageDefinition(definition)
});

const createNoSpawnCells = (
  definition: StageDefinitionV2,
  scale: StageMapScale
) => {
  const noSpawnCells: { row: number; col: number }[] = [];
  for (const zone of definition.gameplay.zones) {
    if (zone.type !== "noEnemySpawn") {
      continue;
    }
    const transformedZone = transformZone(definition, zone);
    const startRow = transformedZone.z * scale.z;
    const startCol = transformedZone.x * scale.x;
    const zoneHeight = transformedZone.h * scale.z;
    const zoneWidth = transformedZone.w * scale.x;
    for (let row = startRow; row < startRow + zoneHeight; row += 1) {
      for (let col = startCol; col < startCol + zoneWidth; col += 1) {
        noSpawnCells.push({ row, col });
      }
    }
  }
  return noSpawnCells;
};

export const createGridLayoutFromStageDefinition = (
  definition: StageDefinitionV2
): GridLayout => {
  const procedural = definition.kind === "procedural-grid";
  const rows = getDefinitionRows(definition);
  const scale = getDefinitionMapScale(definition);
  const cellPhysics = procedural
    ? definition.grid.cellPhysics
    : definition.navigation.cellPhysics;
  const cellSize = procedural
    ? definition.grid.cellSize
    : definition.navigation.cellSizeMeters * BLENDER_METERS_TO_BABYLON_UNITS;
  const maxHeightCells = Math.max(
    ...Object.values(cellPhysics).map((item) => item.heightCells)
  );
  const symbolMap = procedural
    ? expandSymbolMap(flipStageColumns(rows), scale)
    : rows.map((row) => [...row]);
  const { cells, cellHeights, cellNoRender } = createCellDataFromSymbolMap(
    symbolMap,
    cellPhysics,
    cellSize,
    maxHeightCells
  );
  const expandedRows = symbolMap.length;
  const columns = symbolMap[0].length;
  const ceiling = procedural
    ? Object.values(definition.rendering.environmentRules)[0].ceiling
    : null;
  const ceilingHeight =
    ceiling === null ? null : ceiling.heightCells * cellSize;
  const height = Math.max(maxHeightCells * cellSize, ceilingHeight ?? 0);
  const spawnMarker = transformMarker(
    definition,
    definition.gameplay.markers.find(
      (marker) => marker.type === "spawn"
    ) as StageMarker
  );
  const spawn = {
    row: spawnMarker.z * scale.z + Math.floor(scale.z / 2),
    col: spawnMarker.x * scale.x + Math.floor(scale.x / 2)
  };
  const worldOrigin = procedural
    ? {
        x: -(columns * cellSize) / 2 + cellSize / 2,
        z: -(expandedRows * cellSize) / 2 + cellSize / 2
      }
    : {
        x:
          -definition.navigation.originMeters.x *
          BLENDER_METERS_TO_BABYLON_UNITS,
        z:
          -definition.navigation.originMeters.y *
          BLENDER_METERS_TO_BABYLON_UNITS
      };

  return {
    columns,
    rows: expandedRows,
    cellSize,
    worldOrigin,
    columnDirection: procedural ? { x: 1, z: 0 } : { x: -1, z: 0 },
    rowDirection: procedural ? { x: 0, z: 1 } : { x: 0, z: -1 },
    height,
    ceilingHeight,
    cellNoRender,
    spawn,
    noSpawnCells: createNoSpawnCells(definition, scale),
    cells,
    cellHeights
  };
};

export const DEFAULT_STAGE_GRID_CELL_SIZE = DEFAULT_GRID_CONFIG.cellSize;
