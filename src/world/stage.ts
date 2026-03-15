import {
  Color3,
  Mesh,
  MeshBuilder,
  Plane,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
import { GridLayout } from "./grid";
import { createGridTexture } from "./textureUtils";
import type { StageDecal } from "./stageJson";
import type { MirrorTexture } from "@babylonjs/core";

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

export type StageEnvironment = {
  envMap: string[][] | null;
  decals: StageDecal[];
};

export type ReflectiveSurface = {
  mesh: Mesh;
  mirrorPlane: Plane;
  tint: Color3;
  amount: number;
  blur: number;
};

export type StageParts = {
  floors: Mesh[];
  walls: Mesh[];
  colliders: Mesh[];
  reflectiveSurfaces: ReflectiveSurface[];
  reflectiveMaterials: StandardMaterial[];
  reflectiveTextures: MirrorTexture[];
  ceiling: Mesh | null;
  floorMaterial: StandardMaterial;
  floorMaterialOutdoor: StandardMaterial | null;
  ceilingMaterial: StandardMaterial | null;
  wallMaterials: StandardMaterial[];
};

const createStageGridTexture = (
  scene: Scene,
  style: StageStyle,
  baseColor: Color3,
  lineColor: Color3,
  surfaceWidth: number,
  surfaceHeight: number,
  textureName: string
) => {
  const texture = createGridTexture(
    scene,
    textureName,
    style.gridTextureSize,
    {
      baseColor,
      lineColor,
      lineWidth: style.gridLineWidthPx,
      lineSpacing: style.gridTextureSize / style.gridCellsPerTexture
    }
  );
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

const resolveFloorMaterial = (
  environment: StageEnvironment,
  row: number,
  col: number,
  floorMaterial: StandardMaterial,
  floorMaterialOutdoor: StandardMaterial | null
) => {
  if (!environment.envMap || !floorMaterialOutdoor) {
    return floorMaterial;
  }
  return environment.envMap[row][col] === "O"
    ? floorMaterialOutdoor
    : floorMaterial;
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

const reflectiveSurfaceOffset = 0.01;

type WallSegment = {
  name: string;
  colliderName: string;
  planeWidth: number;
  planeHeight: number;
  colliderWidth: number;
  colliderHeight: number;
  colliderDepth: number;
  position: Vector3;
  rotationY?: number;
  render: boolean;
};

const addWallSegment = (
  scene: Scene,
  wallMaterial: StandardMaterial,
  segment: WallSegment,
  walls: Mesh[],
  colliders: Mesh[],
  enableCollisions: boolean
) => {
  if (segment.render) {
    const wall = MeshBuilder.CreatePlane(
      segment.name,
      {
        width: segment.planeWidth,
        height: segment.planeHeight,
        sideOrientation: Mesh.DOUBLESIDE
      },
      scene
    );
    wall.position = segment.position;
    if (segment.rotationY !== undefined) {
      wall.rotation.y = segment.rotationY;
    }
    wall.material = wallMaterial;
    walls.push(wall);
  }

  if (enableCollisions) {
    const collider = MeshBuilder.CreateBox(
      segment.colliderName,
      {
        width: segment.colliderWidth,
        height: segment.colliderHeight,
        depth: segment.colliderDepth
      },
      scene
    );
    collider.position = segment.position.clone();
    collider.checkCollisions = true;
    collider.isVisible = false;
    colliders.push(collider);
  }
};

export const createStageFromGrid = (
  scene: Scene,
  layout: GridLayout,
  style: StageStyle,
  environment: StageEnvironment
): StageParts => {
  const envMap = environment.envMap;
  const gridWidth = layout.columns * layout.cellSize;
  const gridDepth = layout.rows * layout.cellSize;
  const halfWidth = gridWidth / 2;
  const halfDepth = gridDepth / 2;

  const floorMaterial = new StandardMaterial("floorMaterial", scene);
  floorMaterial.diffuseTexture = createStageGridTexture(
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
    floorMaterialOutdoor.diffuseTexture = createStageGridTexture(
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

  const wallMaterialsByHeight = new Map<number, StandardMaterial>();
  const getWallMaterial = (wallHeight: number) => {
    const cached = wallMaterialsByHeight.get(wallHeight);
    if (cached) {
      return cached;
    }

    const wallMaterial = new StandardMaterial(
      `wallMaterial_${wallHeight}`,
      scene
    );
    wallMaterial.diffuseTexture = createStageGridTexture(
      scene,
      style,
      style.wallBaseColor,
      style.wallGridColor,
      layout.cellSize,
      wallHeight,
      `wallGridTexture_${wallHeight}`
    );
    wallMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
    wallMaterialsByHeight.set(wallHeight, wallMaterial);
    return wallMaterial;
  };

  const floors: Mesh[] = [];
  const walls: Mesh[] = [];
  const colliders: Mesh[] = [];
  const reflectiveSurfaces: ReflectiveSurface[] = [];
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
      floor.material = resolveFloorMaterial(
        environment,
        row,
        col,
        floorMaterial,
        floorMaterialOutdoor
      );
      floors.push(floor);

      if (!isFloorCell(layout, row - 1, col)) {
        const wallHeight = getWallHeight(layout, row - 1, col);
        const wallMaterial = getWallMaterial(wallHeight);
        const wallPosition = new Vector3(
          centerX,
          wallHeight / 2,
          centerZ - layout.cellSize / 2
        );
        addWallSegment(
          scene,
          wallMaterial,
          {
            name: `wall_south_${row}_${col}`,
            colliderName: `wall_south_collider_${row}_${col}`,
            planeWidth: layout.cellSize,
            planeHeight: wallHeight,
            colliderWidth: layout.cellSize,
            colliderHeight: wallHeight,
            colliderDepth: wallThickness,
            position: wallPosition,
            render: !isNoRenderCell(layout, row - 1, col)
          },
          walls,
          colliders,
          style.enableCollisions
        );
      }

      if (!isFloorCell(layout, row + 1, col)) {
        const wallHeight = getWallHeight(layout, row + 1, col);
        const wallMaterial = getWallMaterial(wallHeight);
        const wallPosition = new Vector3(
          centerX,
          wallHeight / 2,
          centerZ + layout.cellSize / 2
        );
        addWallSegment(
          scene,
          wallMaterial,
          {
            name: `wall_north_${row}_${col}`,
            colliderName: `wall_north_collider_${row}_${col}`,
            planeWidth: layout.cellSize,
            planeHeight: wallHeight,
            colliderWidth: layout.cellSize,
            colliderHeight: wallHeight,
            colliderDepth: wallThickness,
            position: wallPosition,
            rotationY: Math.PI,
            render: !isNoRenderCell(layout, row + 1, col)
          },
          walls,
          colliders,
          style.enableCollisions
        );
      }

      if (!isFloorCell(layout, row, col - 1)) {
        const wallHeight = getWallHeight(layout, row, col - 1);
        const wallMaterial = getWallMaterial(wallHeight);
        const wallPosition = new Vector3(
          centerX - layout.cellSize / 2,
          wallHeight / 2,
          centerZ
        );
        addWallSegment(
          scene,
          wallMaterial,
          {
            name: `wall_west_${row}_${col}`,
            colliderName: `wall_west_collider_${row}_${col}`,
            planeWidth: layout.cellSize,
            planeHeight: wallHeight,
            colliderWidth: wallThickness,
            colliderHeight: wallHeight,
            colliderDepth: layout.cellSize,
            position: wallPosition,
            rotationY: Math.PI / 2,
            render: !isNoRenderCell(layout, row, col - 1)
          },
          walls,
          colliders,
          style.enableCollisions
        );
      }

      if (!isFloorCell(layout, row, col + 1)) {
        const wallHeight = getWallHeight(layout, row, col + 1);
        const wallMaterial = getWallMaterial(wallHeight);
        const wallPosition = new Vector3(
          centerX + layout.cellSize / 2,
          wallHeight / 2,
          centerZ
        );
        addWallSegment(
          scene,
          wallMaterial,
          {
            name: `wall_east_${row}_${col}`,
            colliderName: `wall_east_collider_${row}_${col}`,
            planeWidth: layout.cellSize,
            planeHeight: wallHeight,
            colliderWidth: wallThickness,
            colliderHeight: wallHeight,
            colliderDepth: layout.cellSize,
            position: wallPosition,
            rotationY: -Math.PI / 2,
            render: !isNoRenderCell(layout, row, col + 1)
          },
          walls,
          colliders,
          style.enableCollisions
        );
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

  for (let index = 0; index < environment.decals.length; index += 1) {
    const decal = environment.decals[index];
    if (
      decal.face !== "wall" ||
      decal.reflective?.kind !== "mirror" ||
      !decal.wallDir
    ) {
      continue;
    }

    const widthCells = decal.type === "rect" ? (decal.w ?? 1) : 1;
    const heightCells = decal.type === "rect" ? (decal.h ?? 1) : 1;
    const mirrorWidth = widthCells * layout.cellSize;
    const mirrorHeight = heightCells * layout.cellSize;
    const startX = -halfWidth + decal.x * layout.cellSize;
    const startZ = -halfDepth + decal.z * layout.cellSize;
    let position: Vector3;
    let rotationY = 0;
    let normal = new Vector3(0, 0, 1);

    if (decal.wallDir === "N") {
      position = new Vector3(
        startX + mirrorWidth / 2,
        mirrorHeight / 2,
        startZ + reflectiveSurfaceOffset
      );
      rotationY = Math.PI;
      normal = new Vector3(0, 0, -1);
    } else if (decal.wallDir === "S") {
      position = new Vector3(
        startX + mirrorWidth / 2,
        mirrorHeight / 2,
        startZ + layout.cellSize - reflectiveSurfaceOffset
      );
      rotationY = 0;
      normal = new Vector3(0, 0, 1);
    } else if (decal.wallDir === "W") {
      position = new Vector3(
        startX + reflectiveSurfaceOffset,
        mirrorHeight / 2,
        startZ + mirrorWidth / 2
      );
      rotationY = Math.PI / 2;
      normal = new Vector3(-1, 0, 0);
    } else {
      position = new Vector3(
        startX + layout.cellSize - reflectiveSurfaceOffset,
        mirrorHeight / 2,
        startZ + mirrorWidth / 2
      );
      rotationY = -Math.PI / 2;
      normal = new Vector3(1, 0, 0);
    }

    const mirror = MeshBuilder.CreatePlane(
      `mirror_${index}`,
      {
        width: mirrorWidth,
        height: mirrorHeight,
        sideOrientation: Mesh.DOUBLESIDE
      },
      scene
    );
    mirror.position = position;
    mirror.rotation.y = rotationY;
    mirror.isPickable = false;
    // MirrorTexture は clip plane に mirrorPlane を使うため、法線は部屋側と逆向きにする。
    reflectiveSurfaces.push({
      mesh: mirror,
      mirrorPlane: Plane.FromPositionAndNormal(position, normal),
      tint: Color3.FromHexString(decal.reflective.tint),
      amount: decal.reflective.amount,
      blur: decal.reflective.blur
    });
  }

  return {
    floors,
    walls,
    colliders,
    reflectiveSurfaces,
    reflectiveMaterials: [],
    reflectiveTextures: [],
    ceiling,
    floorMaterial,
    floorMaterialOutdoor,
    ceilingMaterial,
    wallMaterials: [...wallMaterialsByHeight.values()]
  };
};
