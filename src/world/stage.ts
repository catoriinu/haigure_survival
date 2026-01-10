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
  floorColorOutdoor: Color3;
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
  colliders: Mesh[];
  ceiling: Mesh | null;
  floorMaterial: StandardMaterial;
  floorMaterialOutdoor: StandardMaterial | null;
  ceilingMaterial: StandardMaterial | null;
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

const getWallHeight = (layout: GridLayout, row: number, col: number) => {
  if (row < 0 || row >= layout.rows) {
    return layout.height;
  }
  if (col < 0 || col >= layout.columns) {
    return layout.height;
  }

  return layout.cellHeights[row][col];
};

const isNoRenderCell = (layout: GridLayout, row: number, col: number) => {
  if (row < 0 || row >= layout.rows) {
    return false;
  }
  if (col < 0 || col >= layout.columns) {
    return false;
  }

  return layout.cellNoRender[row][col];
};

export const createStageFromGrid = (
  scene: Scene,
  layout: GridLayout,
  style: StageStyle,
  envMap: string[][] | null = null
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
  const floorMaterialOutdoor = envMap
    ? new StandardMaterial("floorMaterialOutdoor", scene)
    : null;
  if (floorMaterialOutdoor) {
    floorMaterialOutdoor.diffuseTexture = createGridTexture(
      scene,
      style,
      style.floorColorOutdoor,
      style.floorGridColor,
      layout.cellSize,
      layout.cellSize,
      "floorGridTextureOutdoor"
    );
  }

  let ceilingMaterial: StandardMaterial | null = null;

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
  const colliders: Mesh[] = [];
  const wallThickness = 0.05;

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
      const isOutdoorCell = envMap ? envMap[row][col] === "O" : false;
      floor.material =
        isOutdoorCell && floorMaterialOutdoor ? floorMaterialOutdoor : floorMaterial;
      floors.push(floor);

      if (!isFloorCell(layout, row - 1, col)) {
        const wallHeight = getWallHeight(layout, row - 1, col);
        const wallPosition = new Vector3(
          centerX,
          wallHeight / 2,
          centerZ - layout.cellSize / 2
        );
        if (!isNoRenderCell(layout, row - 1, col)) {
          const wall = MeshBuilder.CreatePlane(
            `wall_south_${row}_${col}`,
            {
              width: layout.cellSize,
              height: wallHeight,
              sideOrientation: Mesh.DOUBLESIDE
            },
            scene
          );
          wall.position = wallPosition;
          wall.material = wallMaterial;
          walls.push(wall);
        }

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_south_collider_${row}_${col}`,
            {
              width: layout.cellSize,
              height: wallHeight,
              depth: wallThickness
            },
            scene
          );
          collider.position = wallPosition.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
          colliders.push(collider);
        }
      }

      if (!isFloorCell(layout, row + 1, col)) {
        const wallHeight = getWallHeight(layout, row + 1, col);
        const wallPosition = new Vector3(
          centerX,
          wallHeight / 2,
          centerZ + layout.cellSize / 2
        );
        if (!isNoRenderCell(layout, row + 1, col)) {
          const wall = MeshBuilder.CreatePlane(
            `wall_north_${row}_${col}`,
            {
              width: layout.cellSize,
              height: wallHeight,
              sideOrientation: Mesh.DOUBLESIDE
            },
            scene
          );
          wall.position = wallPosition;
          wall.rotation.y = Math.PI;
          wall.material = wallMaterial;
          walls.push(wall);
        }

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_north_collider_${row}_${col}`,
            {
              width: layout.cellSize,
              height: wallHeight,
              depth: wallThickness
            },
            scene
          );
          collider.position = wallPosition.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
          colliders.push(collider);
        }
      }

      if (!isFloorCell(layout, row, col - 1)) {
        const wallHeight = getWallHeight(layout, row, col - 1);
        const wallPosition = new Vector3(
          centerX - layout.cellSize / 2,
          wallHeight / 2,
          centerZ
        );
        if (!isNoRenderCell(layout, row, col - 1)) {
          const wall = MeshBuilder.CreatePlane(
            `wall_west_${row}_${col}`,
            {
              width: layout.cellSize,
              height: wallHeight,
              sideOrientation: Mesh.DOUBLESIDE
            },
            scene
          );
          wall.position = wallPosition;
          wall.rotation.y = Math.PI / 2;
          wall.material = wallMaterial;
          walls.push(wall);
        }

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_west_collider_${row}_${col}`,
            {
              width: wallThickness,
              height: wallHeight,
              depth: layout.cellSize
            },
            scene
          );
          collider.position = wallPosition.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
          colliders.push(collider);
        }
      }

      if (!isFloorCell(layout, row, col + 1)) {
        const wallHeight = getWallHeight(layout, row, col + 1);
        const wallPosition = new Vector3(
          centerX + layout.cellSize / 2,
          wallHeight / 2,
          centerZ
        );
        if (!isNoRenderCell(layout, row, col + 1)) {
          const wall = MeshBuilder.CreatePlane(
            `wall_east_${row}_${col}`,
            {
              width: layout.cellSize,
              height: wallHeight,
              sideOrientation: Mesh.DOUBLESIDE
            },
            scene
          );
          wall.position = wallPosition;
          wall.rotation.y = -Math.PI / 2;
          wall.material = wallMaterial;
          walls.push(wall);
        }

        if (style.enableCollisions) {
          const collider = MeshBuilder.CreateBox(
            `wall_east_collider_${row}_${col}`,
            {
              width: wallThickness,
              height: wallHeight,
              depth: layout.cellSize
            },
            scene
          );
          collider.position = wallPosition.clone();
          collider.checkCollisions = true;
          collider.isVisible = false;
          colliders.push(collider);
        }
      }
    }
  }

  let ceiling: Mesh | null = null;
  if (layout.ceilingHeight !== null) {
    ceilingMaterial = new StandardMaterial("ceilingMaterial", scene);
    ceilingMaterial.diffuseColor = style.ceilingColor;
    ceiling = MeshBuilder.CreatePlane(
      "ceiling",
      { width: gridWidth, height: gridDepth, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    ceiling.position = new Vector3(0, layout.ceilingHeight, 0);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.material = ceilingMaterial;
    if (style.enableCollisions) {
      ceiling.checkCollisions = true;
    }
  }

  return {
    floors,
    walls,
    colliders,
    ceiling,
    floorMaterial,
    floorMaterialOutdoor,
    ceilingMaterial,
    wallMaterial
  };
};
