import { Color3, Color4, Scene } from "@babylonjs/core";
import { CELL_SCALE, createGridLayout, type GridLayout } from "./grid";
import {
  createStageFromGrid,
  type StageEnvironment,
  type StageParts,
  type StageStyle
} from "./stage";
import {
  createGridLayoutFromStageJson,
  createStageEnvironmentFromStageJson,
  getAssemblyAreaFromStageJson,
  type StageArea,
  type StageJson
} from "./stageJson";

export type StageContextEnvironment = StageEnvironment & {
  skyColor: Color4 | null;
  ceilingHeight: number | null;
};

export type StageContext = {
  layout: GridLayout;
  style: StageStyle;
  parts: StageParts;
  room: {
    width: number;
    depth: number;
    height: number;
  };
  environment: StageContextEnvironment;
  assemblyArea: StageArea;
  skipAssembly: boolean;
};

const resolveFloorColorFromTileId = (
  tileId: string | undefined,
  fallbackColor: Color3
) => {
  if (tileId === "floor_arena_amber") {
    return new Color3(0.56, 0.41, 0.2);
  }
  if (tileId === "floor_labyrinth_amber") {
    return new Color3(0.07, 0.12, 0.32);
  }
  return fallbackColor;
};

const defaultAssemblyArea: StageArea = {
  startCol: 8 * CELL_SCALE,
  startRow: 8 * CELL_SCALE,
  width: 4 * CELL_SCALE,
  height: 4 * CELL_SCALE
};

export const buildStageStyle = (
  layout: GridLayout,
  stageJson: StageJson | null
): StageStyle => {
  const indoorFloorTileId = stageJson?.generationRules.env.I?.floor?.tileId;
  return {
    floorColor: resolveFloorColorFromTileId(
      indoorFloorTileId,
      new Color3(0.55, 0.2, 0.75)
    ),
    floorColorOutdoor: new Color3(0.18, 0.18, 0.18),
    ceilingColor: new Color3(0.88, 0.88, 0.88),
    wallBaseColor: new Color3(0.88, 0.88, 0.88),
    floorGridColor: new Color3(0.07, 0.07, 0.07),
    wallGridColor: new Color3(0.07, 0.07, 0.07),
    gridSpacingWorld: layout.cellSize,
    gridCellsPerTexture: 8,
    gridLineWidthPx: 3,
    gridTextureSize: 512,
    enableCollisions: true
  };
};

const buildSkyColor = (hexColor: string): Color4 => {
  const color = Color3.FromHexString(hexColor);
  return new Color4(color.r, color.g, color.b, 1);
};

const buildStageEnvironment = (
  layout: GridLayout,
  stageJson: StageJson | null
): StageContextEnvironment => {
  if (!stageJson) {
    return { envMap: null, skyColor: null, ceilingHeight: layout.ceilingHeight };
  }

  const environment = createStageEnvironmentFromStageJson(stageJson);
  return {
    envMap: environment.envMap,
    skyColor: environment.skyColor ? buildSkyColor(environment.skyColor) : null,
    ceilingHeight: layout.ceilingHeight
  };
};

export const buildStageContext = (
  scene: Scene,
  stageJson: StageJson | null
): StageContext => {
  const layout = stageJson
    ? createGridLayoutFromStageJson(stageJson)
    : createGridLayout();
  const environment = buildStageEnvironment(layout, stageJson);
  const assemblyArea = stageJson
    ? getAssemblyAreaFromStageJson(stageJson)
    : defaultAssemblyArea;
  const skipAssembly = stageJson ? stageJson.gameplay.options.skipAssembly : false;
  const style = buildStageStyle(layout, stageJson);
  const parts = createStageFromGrid(scene, layout, style, environment);
  const room = {
    width: layout.columns * layout.cellSize,
    depth: layout.rows * layout.cellSize,
    height: layout.height
  };

  return { layout, style, parts, room, environment, assemblyArea, skipAssembly };
};

export const disposeStageParts = (parts: StageParts) => {
  for (const floor of parts.floors) {
    floor.dispose();
  }
  for (const wall of parts.walls) {
    wall.dispose();
  }
  for (const collider of parts.colliders) {
    collider.dispose();
  }
  if (parts.ceiling) {
    parts.ceiling.dispose();
  }
  parts.floorMaterial.dispose();
  if (parts.ceilingMaterial) {
    parts.ceilingMaterial.dispose();
  }
  if (parts.floorMaterialOutdoor) {
    parts.floorMaterialOutdoor.dispose();
  }
  for (const wallMaterial of parts.wallMaterials) {
    wallMaterial.dispose();
  }
};
