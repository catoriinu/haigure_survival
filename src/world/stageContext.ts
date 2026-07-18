import {
  AssetContainer,
  Color3,
  Color4,
  Mesh,
  Scene,
  SceneLoader,
  Vector3
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { type GridLayout } from "./grid";
import {
  createStageFromGrid,
  type ReflectiveSurface,
  type StageEnvironment,
  type StageParts,
  type StageStyle
} from "./stage";
import {
  BLENDER_METERS_TO_BABYLON_UNITS,
  createGridLayoutFromStageDefinition,
  createStageDecalsFromStageDefinition,
  createStageEnvironmentFromStageDefinition,
  createZoneMapFromStageDefinition,
  getAssemblyAreaFromStageDefinition,
  getSkyColorFromStageDefinition,
  type StageArea,
  type StageDefinitionV2
} from "./stageJson";
import type { MirrorTexture, StandardMaterial } from "@babylonjs/core";
import type { BaseTexture } from "@babylonjs/core";

const managedSharedTextureReferences = new Map<BaseTexture, number>();

export type StageContextEnvironment = StageEnvironment & {
  skyColor: Color4 | null;
  ceilingHeight: number | null;
};

export type StageContextResources = {
  colliders: Mesh[];
  reflectiveSurfaces: ReflectiveSurface[];
  reflectiveMaterials: StandardMaterial[];
  reflectiveTextures: MirrorTexture[];
  authoredMeshes: Mesh[];
  assetContainer: AssetContainer | null;
  dispose: () => void;
};

export type StageContext = {
  definition: StageDefinitionV2;
  layout: GridLayout;
  zoneMap: string[][] | null;
  style: StageStyle;
  resources: StageContextResources;
  room: {
    width: number;
    depth: number;
    height: number;
  };
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
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

export const buildStageStyle = (
  layout: GridLayout,
  definition: StageDefinitionV2
): StageStyle => {
  const indoorFloorTileId =
    definition.kind === "procedural-grid"
      ? definition.rendering.environmentRules.I?.floor?.tileId
      : undefined;
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
  definition: StageDefinitionV2
): StageContextEnvironment => {
  if (definition.kind === "glb") {
    const skyColor = getSkyColorFromStageDefinition(definition);
    return {
      envMap: null,
      decals: [],
      skyColor: skyColor ? buildSkyColor(skyColor) : null,
      ceilingHeight: null
    };
  }

  const environment = createStageEnvironmentFromStageDefinition(definition);
  return {
    envMap: environment.envMap,
    decals: createStageDecalsFromStageDefinition(definition),
    skyColor: environment.skyColor ? buildSkyColor(environment.skyColor) : null,
    ceilingHeight: layout.ceilingHeight
  };
};

const disposeStageParts = (parts: StageParts) => {
  for (const floor of parts.floors) {
    floor.dispose();
  }
  for (const reflectiveSurface of parts.reflectiveSurfaces) {
    reflectiveSurface.mesh.dispose();
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
  parts.floorMaterial.dispose(false, true);
  parts.ceilingMaterial?.dispose(false, true);
  parts.floorMaterialOutdoor?.dispose(false, true);
  for (const reflectiveMaterial of parts.reflectiveMaterials) {
    reflectiveMaterial.dispose(false, true);
  }
  for (const reflectiveTexture of parts.reflectiveTextures) {
    reflectiveTexture.dispose();
  }
  for (const wallMaterial of parts.wallMaterials) {
    wallMaterial.dispose(false, true);
  }
};

const createProceduralResources = (parts: StageParts): StageContextResources => ({
  colliders: parts.colliders,
  reflectiveSurfaces: parts.reflectiveSurfaces,
  reflectiveMaterials: parts.reflectiveMaterials,
  reflectiveTextures: parts.reflectiveTextures,
  authoredMeshes: [...parts.floors, ...parts.walls, ...parts.colliders],
  assetContainer: null,
  dispose: () => disposeStageParts(parts)
});

const splitAssetPath = (path: string) => {
  const assetUrl = `${import.meta.env.BASE_URL}${path}`;
  const slashIndex = assetUrl.lastIndexOf("/");
  return {
    rootUrl: assetUrl.slice(0, slashIndex + 1),
    filename: assetUrl.slice(slashIndex + 1)
  };
};

const retainManagedSharedTextures = (
  scene: Scene,
  existingTextures: Set<BaseTexture>
) => {
  const retainedTextures = scene.textures.filter(
    (texture) =>
      texture.name.startsWith("data:EnvironmentBRDFTexture") &&
      (!existingTextures.has(texture) || managedSharedTextureReferences.has(texture))
  );
  for (const texture of retainedTextures) {
    managedSharedTextureReferences.set(
      texture,
      (managedSharedTextureReferences.get(texture) ?? 0) + 1
    );
  }
  return retainedTextures;
};

const releaseManagedSharedTextures = (
  scene: Scene,
  textures: BaseTexture[]
) => {
  for (const texture of textures) {
    const nextReferenceCount =
      (managedSharedTextureReferences.get(texture) as number) - 1;
    if (nextReferenceCount > 0) {
      managedSharedTextureReferences.set(texture, nextReferenceCount);
      continue;
    }
    managedSharedTextureReferences.delete(texture);
    if (scene.textures.includes(texture)) {
      texture.dispose();
    }
  }
};

const loadGlbResources = async (
  scene: Scene,
  definition: Extract<StageDefinitionV2, { kind: "glb" }>
): Promise<StageContextResources> => {
  const { rootUrl, filename } = splitAssetPath(definition.asset.path);
  const existingTextures = new Set(scene.textures);
  const container = await SceneLoader.LoadAssetContainerAsync(
    rootUrl,
    filename,
    scene
  );
  const managementRoot = container.createRootMesh();
  managementRoot.name = `${definition.meta.name}AssetRoot`;
  managementRoot.scaling.setAll(BLENDER_METERS_TO_BABYLON_UNITS);
  managementRoot.isVisible = false;
  managementRoot.checkCollisions = false;
  container.addAllToScene();
  const retainedSharedTextures = retainManagedSharedTextures(
    scene,
    existingTextures
  );

  const authoredMeshes = container.meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
  );
  const invalidMesh = authoredMeshes.find(
    (mesh) => !mesh.name.startsWith("VIS_") && !mesh.name.startsWith("COL_")
  );
  if (invalidMesh) {
    container.removeAllFromScene();
    container.dispose();
    releaseManagedSharedTextures(scene, retainedSharedTextures);
    throw new Error(`v2資産規約外のメッシュ名です: ${invalidMesh.name}`);
  }

  const colliders: Mesh[] = [];
  for (const mesh of authoredMeshes) {
    mesh.setEnabled(true);
    mesh.isPickable = false;
    if (mesh.name.startsWith("VIS_")) {
      mesh.isVisible = true;
      mesh.visibility = 1;
      mesh.checkCollisions = false;
    } else {
      mesh.isVisible = false;
      mesh.visibility = 1;
      mesh.checkCollisions = true;
      colliders.push(mesh);
    }
    mesh.computeWorldMatrix(true);
  }

  const resources: StageContextResources = {
    colliders,
    reflectiveSurfaces: [],
    reflectiveMaterials: [],
    reflectiveTextures: [],
    authoredMeshes,
    assetContainer: container,
    dispose: () => {
      for (const material of resources.reflectiveMaterials) {
        material.dispose(false, true);
      }
      for (const texture of resources.reflectiveTextures) {
        texture.dispose();
      }
      container.removeAllFromScene();
      container.dispose();
      releaseManagedSharedTextures(scene, retainedSharedTextures);
    }
  };
  return resources;
};

const buildGridBounds = (layout: GridLayout) => {
  const lastCol = layout.columns - 1;
  const lastRow = layout.rows - 1;
  const centers = [
    { col: 0, row: 0 },
    { col: lastCol, row: 0 },
    { col: 0, row: lastRow },
    { col: lastCol, row: lastRow }
  ].map(
    (cell) =>
      new Vector3(
        layout.worldOrigin.x +
          layout.columnDirection.x * cell.col * layout.cellSize +
          layout.rowDirection.x * cell.row * layout.cellSize,
        0,
        layout.worldOrigin.z +
          layout.columnDirection.z * cell.col * layout.cellSize +
          layout.rowDirection.z * cell.row * layout.cellSize
      )
  );
  const halfCell = layout.cellSize / 2;
  return {
    minX: Math.min(...centers.map((center) => center.x)) - halfCell,
    maxX: Math.max(...centers.map((center) => center.x)) + halfCell,
    minY: 0,
    maxY: layout.height,
    minZ: Math.min(...centers.map((center) => center.z)) - halfCell,
    maxZ: Math.max(...centers.map((center) => center.z)) + halfCell
  };
};

const buildGlbBounds = (resources: StageContextResources) => {
  const minimum = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  const maximum = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  );
  for (const mesh of resources.authoredMeshes) {
    mesh.computeWorldMatrix(true);
    const box = mesh.getBoundingInfo().boundingBox;
    minimum.minimizeInPlace(box.minimumWorld);
    maximum.maximizeInPlace(box.maximumWorld);
  }
  return {
    minX: minimum.x,
    maxX: maximum.x,
    minY: minimum.y,
    maxY: maximum.y,
    minZ: minimum.z,
    maxZ: maximum.z
  };
};

export const buildStageContext = async (
  scene: Scene,
  definition: StageDefinitionV2
): Promise<StageContext> => {
  const layout = createGridLayoutFromStageDefinition(definition);
  const environment = buildStageEnvironment(layout, definition);
  const style = buildStageStyle(layout, definition);
  const resources =
    definition.kind === "procedural-grid"
      ? createProceduralResources(
          createStageFromGrid(scene, layout, style, environment)
        )
      : await loadGlbResources(scene, definition);
  const bounds =
    definition.kind === "procedural-grid"
      ? buildGridBounds(layout)
      : buildGlbBounds(resources);
  if (definition.kind === "glb") {
    layout.height = bounds.maxY - bounds.minY;
  }

  return {
    definition,
    layout,
    zoneMap: createZoneMapFromStageDefinition(definition),
    style,
    resources,
    room: {
      width: bounds.maxX - bounds.minX,
      depth: bounds.maxZ - bounds.minZ,
      height: bounds.maxY - bounds.minY
    },
    bounds,
    environment,
    assemblyArea: getAssemblyAreaFromStageDefinition(definition),
    skipAssembly: definition.gameplay.options.skipAssembly
  };
};

export const disposeStageContext = (context: StageContext) => {
  context.resources.dispose();
};
