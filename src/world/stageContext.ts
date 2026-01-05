import { Color3, Scene } from "@babylonjs/core";
import { createGridLayout, type GridLayout } from "./grid";
import { createStageFromGrid, type StageParts, type StageStyle } from "./stage";

export type StageContext = {
  layout: GridLayout;
  style: StageStyle;
  parts: StageParts;
  room: {
    width: number;
    depth: number;
    height: number;
  };
};

export const buildStageStyle = (layout: GridLayout): StageStyle => ({
  floorColor: new Color3(0.55, 0.2, 0.75),
  ceilingColor: new Color3(0.88, 0.88, 0.88),
  wallBaseColor: new Color3(0.88, 0.88, 0.88),
  floorGridColor: new Color3(0.07, 0.07, 0.07),
  wallGridColor: new Color3(0.07, 0.07, 0.07),
  gridSpacingWorld: layout.cellSize,
  gridCellsPerTexture: 8,
  gridLineWidthPx: 3,
  gridTextureSize: 512,
  enableCollisions: true
});

export const buildStageContext = (
  scene: Scene,
  stageJson: unknown | null
): StageContext => {
  const layout = createGridLayout();
  const style = buildStageStyle(layout);
  const parts = createStageFromGrid(scene, layout, style);
  const room = {
    width: layout.columns * layout.cellSize,
    depth: layout.rows * layout.cellSize,
    height: layout.height
  };

  return { layout, style, parts, room };
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
  parts.ceiling.dispose();
  parts.floorMaterial.dispose();
  parts.ceilingMaterial.dispose();
  parts.wallMaterial.dispose();
};
