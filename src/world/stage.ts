import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Vector3
} from "@babylonjs/core";
import { GridLayout } from "./grid";

export type StageStyle = {
  floorColor: Color3;
  ceilingColor: Color3;
  wallBaseColor: Color3;
  floorGridColor: Color3;
  wallGridColor: Color3;
  gridSpacingWorld: number;
  gridCellsPerTexture: number;
  gridLineWidthPx: number;
  gridTextureSize: number;
  enableCollisions: boolean;
};

export type StageParts = {
  floors: Mesh[];
  walls: Mesh[];
  ceiling: Mesh;
  wallMaterial: StandardMaterial;
};

const colorToHex = (color: Color3) => {
  const r = Math.round(color.r * 255)
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(color.g * 255)
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(color.b * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${r}${g}${b}`;
};

const createGridTexture = (
  scene: Scene,
  style: StageStyle,
  baseColor: Color3,
  lineColor: Color3,
  surfaceWidth: number,
  surfaceHeight: number,
  textureName: string
) => {
  const texture = new DynamicTexture(
    textureName,
    { width: style.gridTextureSize, height: style.gridTextureSize },
    scene,
    false
  );
  const ctx = texture.getContext();
  ctx.fillStyle = colorToHex(baseColor);
  ctx.fillRect(0, 0, style.gridTextureSize, style.gridTextureSize);
  ctx.strokeStyle = colorToHex(lineColor);
  ctx.lineWidth = style.gridLineWidthPx;
  const gridSpacingPx = style.gridTextureSize / style.gridCellsPerTexture;

  for (let i = 0; i <= style.gridTextureSize; i += gridSpacingPx) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, style.gridTextureSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(style.gridTextureSize, i);
    ctx.stroke();
  }

  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  const gridTileWorldSize = style.gridSpacingWorld * style.gridCellsPerTexture;
  texture.uScale = surfaceWidth / gridTileWorldSize;
  texture.vScale = surfaceHeight / gridTileWorldSize;

  return texture;
};

const isFloorCell = (layout: GridLayout, row: number, col: number) => {
  if (row < 0 || row >= layout.rows) {
    return false;
  }
  if (col < 0 || col >= layout.columns) {
    return false;
  }

  return layout.cells[row][col] === "floor";
};

export const createStageFromGrid = (
  scene: Scene,
  layout: GridLayout,
  style: StageStyle
): StageParts => {
  const gridWidth = layout.columns * layout.cellSize;
  const gridDepth = layout.rows * layout.cellSize;
  const halfWidth = gridWidth / 2;
  const halfDepth = gridDepth / 2;

  const floorMaterial = new StandardMaterial("floorMaterial", scene);
  floorMaterial.diffuseTexture = createGridTexture(
    scene,
    style,
    style.floorColor,
    style.floorGridColor,
    layout.cellSize,
    layout.cellSize,
    "floorGridTexture"
  );

  const ceilingMaterial = new StandardMaterial("ceilingMaterial", scene);
  ceilingMaterial.diffuseColor = style.ceilingColor;

  const wallMaterial = new StandardMaterial("wallMaterial", scene);
  wallMaterial.diffuseTexture = createGridTexture(
    scene,
    style,
    style.wallBaseColor,
    style.wallGridColor,
    layout.cellSize,
    layout.height,
    "wallGridTexture"
  );
  wallMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

  const floors: Mesh[] = [];
  const walls: Mesh[] = [];
  const wallThickness = 0.6;

  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.columns; col += 1) {
      if (!isFloorCell(layout, row, col)) {
        continue;
      }

      const centerX = -halfWidth + layout.cellSize / 2 + col * layout.cellSize;
      const centerZ = -halfDepth + layout.cellSize / 2 + row * layout.cellSize;

      const floor = MeshBuilder.CreateGround(
        `floor_${row}_${col}`,
        { width: layout.cellSize, height: layout.cellSize },
        scene
      );
      floor.position = new Vector3(centerX, 0, centerZ);
      floor.material = floorMaterial;
      floors.push(floor);

      if (!isFloorCell(layout, row - 1, col)) {
        const wall = MeshBuilder.CreatePlane(
          `wall_south_${row}_${col}`,
          {
            width: layout.cellSize,
            height: layout.height,
            sideOrientation: Mesh.DOUBLESIDE
          },
          scene
        );
        wall.position = new Vector3(
          centerX,
          layout.height / 2,
          centerZ - layout.cellSize / 2
        );
        wall.material = wallMaterial;
        walls.push(wall);

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_south_collider_${row}_${col}`,
            {
              width: layout.cellSize,
              height: layout.height,
              depth: wallThickness
            },
            scene
          );
          collider.position = wall.position.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
        }
      }

      if (!isFloorCell(layout, row + 1, col)) {
        const wall = MeshBuilder.CreatePlane(
          `wall_north_${row}_${col}`,
          {
            width: layout.cellSize,
            height: layout.height,
            sideOrientation: Mesh.DOUBLESIDE
          },
          scene
        );
        wall.position = new Vector3(
          centerX,
          layout.height / 2,
          centerZ + layout.cellSize / 2
        );
        wall.rotation.y = Math.PI;
        wall.material = wallMaterial;
        walls.push(wall);

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_north_collider_${row}_${col}`,
            {
              width: layout.cellSize,
              height: layout.height,
              depth: wallThickness
            },
            scene
          );
          collider.position = wall.position.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
        }
      }

      if (!isFloorCell(layout, row, col - 1)) {
        const wall = MeshBuilder.CreatePlane(
          `wall_west_${row}_${col}`,
          {
            width: layout.cellSize,
            height: layout.height,
            sideOrientation: Mesh.DOUBLESIDE
          },
          scene
        );
        wall.position = new Vector3(
          centerX - layout.cellSize / 2,
          layout.height / 2,
          centerZ
        );
        wall.rotation.y = Math.PI / 2;
        wall.material = wallMaterial;
        walls.push(wall);

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_west_collider_${row}_${col}`,
            {
              width: wallThickness,
              height: layout.height,
              depth: layout.cellSize
            },
            scene
          );
          collider.position = wall.position.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
        }
      }

      if (!isFloorCell(layout, row, col + 1)) {
        const wall = MeshBuilder.CreatePlane(
          `wall_east_${row}_${col}`,
          {
            width: layout.cellSize,
            height: layout.height,
            sideOrientation: Mesh.DOUBLESIDE
          },
          scene
        );
        wall.position = new Vector3(
          centerX + layout.cellSize / 2,
          layout.height / 2,
          centerZ
        );
        wall.rotation.y = -Math.PI / 2;
        wall.material = wallMaterial;
        walls.push(wall);

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_east_collider_${row}_${col}`,
            {
              width: wallThickness,
              height: layout.height,
              depth: layout.cellSize
            },
            scene
          );
          collider.position = wall.position.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
        }
      }
    }
  }

  const ceiling = MeshBuilder.CreatePlane(
    "ceiling",
    { width: gridWidth, height: gridDepth, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  ceiling.position = new Vector3(0, layout.height, 0);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.material = ceilingMaterial;
  if (style.enableCollisions) {
    ceiling.checkCollisions = true;
  }

  return {
    floors,
    walls,
    ceiling,
    wallMaterial
  };
};
