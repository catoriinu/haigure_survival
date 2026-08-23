import {
  Color3,
  Color4,
  Material,
  Mesh,
  MeshBuilder,
  Sprite,
  SpriteManager,
  StandardMaterial,
  VertexBuffer,
  type Scene,
} from "@babylonjs/core";
import {
  CHARACTER_SPRITE_CELL_SIZE,
  CHARACTER_SPRITE_FRAME_COUNT,
  CHARACTER_SPRITE_IMAGE_HEIGHT,
  CHARACTER_SPRITE_IMAGE_WIDTH,
  NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT,
  createDefaultCharacterSpritesheet,
} from "../game/characterSprites";
import {
  createGroundShadowManager,
  type GroundShadowHandle
} from "../game/groundShadows";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import type { V2CharacterState } from "./combatTypes";
import {
  V2_DEFAULT_PORTRAIT_DIRECTORY,
  type V2CharacterAssignments,
} from "./v2CharacterAssignments";
import { V2_TRANSPARENT_ALPHA_INDEX_SPATIAL } from "./v2TransparentRenderingOrder";
import {
  V2_PORTRAIT_ASSET_CATALOG,
  type V2PortraitFileInventory
} from "./v2PortraitAssetCatalog";
import {
  V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER,
} from "./v2TransparentRenderingOrder";

export const V2_PORTRAIT_IMAGE_BASE_NAMES = Object.freeze([
  "normal",
  "evade",
  "hit-a",
  "hit-b",
  "bw-in-progress",
  "bw-complete-gun",
  "bw-complete-no-gun",
  "bw-complete-pose",
] as const);

export type V2PortraitImageBaseName =
  (typeof V2_PORTRAIT_IMAGE_BASE_NAMES)[number];

export type V2ResolvedPortraitFiles = Readonly<
  Record<V2PortraitImageBaseName, string>
>;

export type V2CharacterVisualSpriteSource = "default" | "portrait";

export type V2CharacterVisualOrientationMode =
  | "upright"
  | "camera-facing";

export const V2_CHARACTER_VISUAL_MAX_WIDTH = 1 / 3;
export const V2_CHARACTER_VISUAL_MAX_HEIGHT =
  1.7 * BLENDER_METERS_TO_WORLD_UNITS;

export type V2CharacterVisualSize = Readonly<{
  width: number;
  height: number;
}>;

export type V2CharacterVisualSpriteHandle = Readonly<{
  sprite: Sprite;
  presentationMesh: Mesh | null;
  width: number;
  height: number;
  setState(
    state: V2CharacterState,
    temporaryGunActive: boolean,
    noGunTouchBrainwashProgress: number | null
  ): void;
  syncPresentation(): void;
  dispose(): void;
}>;

export type V2CharacterVisualRuntime = Readonly<{
  orientationMode: V2CharacterVisualOrientationMode;
  setFacingYaw(yaw: number): void;
  getActorVisualSize(actorId: string): V2CharacterVisualSize;
  createSprite(
    actorId: string,
    instanceName: string,
  ): V2CharacterVisualSpriteHandle;
  dispose(): void;
}>;

export type V2CharacterVisualRuntimeOptions = Readonly<{
  scene: Scene;
  assignments: V2CharacterAssignments;
  orientationMode: V2CharacterVisualOrientationMode;
  showGroundShadows: boolean;
  includeNoGunTouchBlendFrames: boolean;
}>;

type V2CharacterVisualSheet = Readonly<{
  url: string;
  cellWidth: number;
  cellHeight: number;
  frameCount: number;
  width: number;
  height: number;
  source: V2CharacterVisualSpriteSource;
  blobUrl: string | null;
}>;

type V2CharacterVisualManagerResource = {
  manager: SpriteManager;
  presentationMaterial: StandardMaterial | null;
  sheet: V2CharacterVisualSheet;
  capacity: number;
  activeSpriteCount: number;
};

type V2CharacterVisualPresentation = {
  mesh: Mesh;
  uvData: Float32Array;
  colorData: Float32Array;
  lastCellIndex: number;
  lastWidth: number;
  lastHeight: number;
  lastFacingYaw: number;
  lastVisible: boolean;
  lastColor: Color4;
};

type V2CharacterVisualSpriteRecord = {
  sprite: Sprite;
  presentation: V2CharacterVisualPresentation | null;
  managerResource: V2CharacterVisualManagerResource;
  shadow: GroundShadowHandle | null;
  disposed: boolean;
};

const V2_CHARACTER_VISUAL_PLAYER_ACTOR_ID = "player";

export const resolveV2PortraitFiles = (
  directory: string,
  inventory: V2PortraitFileInventory,
): V2ResolvedPortraitFiles => {
  if (directory.length === 0) {
    throw new Error("V2 Character画像のportrait directoryが空です。");
  }
  const filesByBaseName = inventory.get(directory);
  if (filesByBaseName === undefined) {
    throw new Error(
      `V2 Character画像のportrait directoryがありません: ${directory}`,
    );
  }
  const resolvedEntries = V2_PORTRAIT_IMAGE_BASE_NAMES.map((baseName) => {
    const fileName = filesByBaseName.get(baseName);
    if (fileName === undefined) {
      throw new Error(
        `V2 Character画像の必須状態がありません: ${directory}/${baseName}.*`,
      );
    }
    return [baseName, fileName] as const;
  });
  return Object.freeze(
    Object.fromEntries(resolvedEntries) as Record<
      V2PortraitImageBaseName,
      string
    >,
  );
};

export const calculateV2CharacterVisualSize = (
  imageWidth: number,
  imageHeight: number,
): V2CharacterVisualSize => {
  if (!Number.isFinite(imageWidth) || imageWidth <= 0) {
    throw new Error(
      `V2 Character画像の幅には正の有限値が必要です: ${imageWidth}`,
    );
  }
  if (!Number.isFinite(imageHeight) || imageHeight <= 0) {
    throw new Error(
      `V2 Character画像の高さには正の有限値が必要です: ${imageHeight}`,
    );
  }
  const scale = Math.min(
    V2_CHARACTER_VISUAL_MAX_WIDTH / imageWidth,
    V2_CHARACTER_VISUAL_MAX_HEIGHT / imageHeight,
  );
  return Object.freeze({
    width: imageWidth * scale,
    height: imageHeight * scale,
  });
};

export const getV2CharacterVisualCellIndex = (
  state: V2CharacterState,
  temporaryGunActive: boolean,
  source: V2CharacterVisualSpriteSource,
  noGunTouchBrainwashProgress: number | null,
): number => {
  if (noGunTouchBrainwashProgress !== null) {
    const baseFrameCount =
      source === "default"
        ? CHARACTER_SPRITE_FRAME_COUNT
        : V2_PORTRAIT_IMAGE_BASE_NAMES.length;
    return (
      baseFrameCount +
      Math.floor(
        Math.min(1, Math.max(0, noGunTouchBrainwashProgress)) *
          NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT
      )
    );
  }
  if (source === "default") {
    if (state === "hit-a") {
      return 1;
    }
    if (state === "hit-b") {
      return 2;
    }
    if (state === "brainwash-complete-gun" || temporaryGunActive) {
      return 3;
    }
    if (state === "brainwash-complete-no-gun") {
      return 4;
    }
    if (
      state === "brainwash-complete-haigure" ||
      state === "brainwash-complete-haigure-formation"
    ) {
      return 5;
    }
    return state === "brainwash-in-progress" ? 2 : 0;
  }

  if (state === "hit-a") {
    return 2;
  }
  if (state === "hit-b") {
    return 3;
  }
  if (state === "brainwash-complete-gun" || temporaryGunActive) {
    return 5;
  }
  if (state === "brainwash-complete-no-gun") {
    return 6;
  }
  if (
    state === "brainwash-complete-haigure" ||
    state === "brainwash-complete-haigure-formation"
  ) {
    return 7;
  }
  if (state === "brainwash-in-progress") {
    return 4;
  }
  return state === "evade" ? 1 : 0;
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`V2 Character画像を読み込めません: ${url}`));
    image.src = url;
  });

const createBlobUrl = (canvas: HTMLCanvasElement): Promise<string> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error("V2 Character画像sheetをPNGへ変換できません。"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/png");
  });

const joinPortraitAssetUrl = (
  baseUrl: string,
  directory: string,
  fileName: string,
): string => {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}picture/chara/${directory}/${fileName}`;
};

const createPortraitSheet = async (
  directory: string,
  files: V2ResolvedPortraitFiles,
  baseUrl: string,
  includeNoGunTouchBlendFrames: boolean,
): Promise<V2CharacterVisualSheet> => {
  const images = await Promise.all(
    V2_PORTRAIT_IMAGE_BASE_NAMES.map((baseName) =>
      loadImage(joinPortraitAssetUrl(baseUrl, directory, files[baseName])),
    ),
  );
  const firstImage = images[0] as HTMLImageElement;
  const cellWidth = firstImage.naturalWidth;
  const cellHeight = firstImage.naturalHeight;
  if (cellWidth <= 0 || cellHeight <= 0) {
    throw new Error(
      `V2 Character画像の実寸が不正です: ${directory} ${cellWidth}x${cellHeight}`,
    );
  }
  const canvas = document.createElement("canvas");
  const blendFrameCount = includeNoGunTouchBlendFrames
    ? NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT + 1
    : 0;
  canvas.width = cellWidth * (images.length + blendFrameCount);
  canvas.height = cellHeight;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("V2 Character画像sheet用Canvas 2D contextがありません。");
  }
  for (let index = 0; index < images.length; index += 1) {
    context.drawImage(
      images[index] as HTMLImageElement,
      index * cellWidth,
      0,
      cellWidth,
      cellHeight,
    );
  }
  if (includeNoGunTouchBlendFrames) {
    const hitAImage = images[2] as HTMLImageElement;
    const hitBImage = images[3] as HTMLImageElement;
    for (
      let blendIndex = 0;
      blendIndex <= NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT;
      blendIndex += 1
    ) {
      const progress =
        blendIndex / NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT;
      const destinationX = (images.length + blendIndex) * cellWidth;
      context.drawImage(
        hitBImage,
        0,
        0,
        cellWidth,
        cellHeight,
        destinationX,
        0,
        cellWidth,
        cellHeight
      );
      const revealedHeight = Math.round(cellHeight * progress);
      if (revealedHeight > 0) {
        const sourceY = cellHeight - revealedHeight;
        context.clearRect(destinationX, sourceY, cellWidth, revealedHeight);
        context.drawImage(
          hitAImage,
          0,
          sourceY,
          cellWidth,
          revealedHeight,
          destinationX,
          sourceY,
          cellWidth,
          revealedHeight
        );
      }
      if ((blendIndex + 1) % 2 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
  }
  const blobUrl = await createBlobUrl(canvas);
  const size = calculateV2CharacterVisualSize(cellWidth, cellHeight);
  return Object.freeze({
    url: blobUrl,
    cellWidth,
    cellHeight,
    frameCount: V2_PORTRAIT_IMAGE_BASE_NAMES.length + blendFrameCount,
    width: size.width,
    height: size.height,
    source: "portrait",
    blobUrl,
  });
};

const createDefaultSheet = (
  includeNoGunTouchBlendFrames: boolean
): V2CharacterVisualSheet => {
  const size = calculateV2CharacterVisualSize(
    CHARACTER_SPRITE_IMAGE_WIDTH,
    CHARACTER_SPRITE_IMAGE_HEIGHT,
  );
  return Object.freeze({
    url: createDefaultCharacterSpritesheet(includeNoGunTouchBlendFrames),
    cellWidth: CHARACTER_SPRITE_CELL_SIZE,
    cellHeight: CHARACTER_SPRITE_CELL_SIZE,
    frameCount:
      CHARACTER_SPRITE_FRAME_COUNT +
      (includeNoGunTouchBlendFrames
        ? NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT + 1
        : 0),
    width: size.width,
    height: size.height,
    source: "default",
    blobUrl: null,
  });
};

const assertAssignments = (assignments: V2CharacterAssignments): void => {
  if (assignments.length === 0) {
    throw new Error("V2 Character表示にはactor割当が必要です。");
  }
  const actorIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.actorId.length === 0) {
      throw new Error("V2 Character表示のactor IDが空です。");
    }
    if (actorIds.has(assignment.actorId)) {
      throw new Error(
        `V2 Character表示のactor IDが重複しています: ${assignment.actorId}`,
      );
    }
    if (assignment.portraitDirectory.length === 0) {
      throw new Error(
        `V2 Character表示のportrait directoryが空です: ${assignment.actorId}`,
      );
    }
    actorIds.add(assignment.actorId);
  }
};

const fillPresentationColorData = (
  target: Float32Array,
  color: Color4,
): void => {
  for (let vertexIndex = 0; vertexIndex < 4; vertexIndex += 1) {
    const offset = vertexIndex * 4;
    target[offset] = color.r;
    target[offset + 1] = color.g;
    target[offset + 2] = color.b;
    target[offset + 3] = color.a;
  }
};

const updatePresentationUvData = (
  target: Float32Array,
  cellIndex: number,
  frameCount: number,
): void => {
  const left = cellIndex / frameCount;
  const right = (cellIndex + 1) / frameCount;
  target[0] = left;
  target[1] = 1;
  target[2] = right;
  target[3] = 1;
  target[4] = right;
  target[5] = 0;
  target[6] = left;
  target[7] = 0;
};

const createPresentationMaterial = (
  directory: string,
  manager: SpriteManager,
  scene: Scene,
): StandardMaterial => {
  manager.texture.hasAlpha = true;
  const material = new StandardMaterial(
    `V2CharacterVisualPresentationMaterial_${directory}`,
    scene,
  );
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.specularColor = Color3.Black();
  material.diffuseColor = Color3.White();
  material.emissiveColor = Color3.White();
  material.linkEmissiveWithDiffuse = true;
  material.diffuseTexture = manager.texture;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
  material.alphaCutOff = 0.01;
  material.forceDepthWrite = true;
  return material;
};

const createPresentation = (
  actorId: string,
  instanceName: string,
  material: StandardMaterial,
  frameCount: number,
  scene: Scene,
): V2CharacterVisualPresentation => {
  const mesh = MeshBuilder.CreatePlane(
    `${instanceName}_upright`,
    { size: 1, updatable: true },
    scene,
  );
  mesh.material = material;
  mesh.alphaIndex =
    actorId === V2_CHARACTER_VISUAL_PLAYER_ACTOR_ID
      ? V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER
      : V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER;
  mesh.isPickable = false;
  mesh.isVisible = false;
  mesh.hasVertexAlpha = true;

  const uvData = new Float32Array(8);
  updatePresentationUvData(uvData, 0, frameCount);
  mesh.setVerticesData(VertexBuffer.UVKind, uvData, true);

  const colorData = new Float32Array(16);
  const initialColor = new Color4(1, 1, 1, 1);
  fillPresentationColorData(colorData, initialColor);
  mesh.setVerticesData(VertexBuffer.ColorKind, colorData, true);

  return {
    mesh,
    uvData,
    colorData,
    lastCellIndex: -1,
    lastWidth: -1,
    lastHeight: -1,
    lastFacingYaw: Number.NaN,
    lastVisible: false,
    lastColor: new Color4(-1, -1, -1, -1),
  };
};

const syncPresentation = (
  presentation: V2CharacterVisualPresentation,
  sprite: Sprite,
  frameCount: number,
  facingYaw: number,
): void => {
  if (!presentation.mesh.position.equals(sprite.position)) {
    presentation.mesh.position.copyFrom(sprite.position);
  }
  if (presentation.lastFacingYaw !== facingYaw) {
    presentation.mesh.rotation.set(0, facingYaw, 0);
    presentation.lastFacingYaw = facingYaw;
  }

  if (
    presentation.lastWidth !== sprite.width ||
    presentation.lastHeight !== sprite.height
  ) {
    presentation.mesh.scaling.set(sprite.width, sprite.height, 1);
    presentation.lastWidth = sprite.width;
    presentation.lastHeight = sprite.height;
  }

  if (presentation.lastCellIndex !== sprite.cellIndex) {
    updatePresentationUvData(
      presentation.uvData,
      sprite.cellIndex,
      frameCount,
    );
    presentation.mesh.updateVerticesData(
      VertexBuffer.UVKind,
      presentation.uvData,
      false,
    );
    presentation.lastCellIndex = sprite.cellIndex;
  }

  const spriteColor = sprite.color;
  if (
    presentation.lastColor.r !== spriteColor.r ||
    presentation.lastColor.g !== spriteColor.g ||
    presentation.lastColor.b !== spriteColor.b ||
    presentation.lastColor.a !== spriteColor.a
  ) {
    fillPresentationColorData(presentation.colorData, spriteColor);
    presentation.mesh.updateVerticesData(
      VertexBuffer.ColorKind,
      presentation.colorData,
      false,
    );
    presentation.lastColor.copyFrom(spriteColor);
  }

  if (presentation.lastVisible !== sprite.isVisible) {
    presentation.mesh.isVisible = sprite.isVisible;
    presentation.lastVisible = sprite.isVisible;
  }
};

export const createV2CharacterVisualRuntime = async ({
  scene,
  assignments,
  orientationMode,
  showGroundShadows,
  includeNoGunTouchBlendFrames,
}: V2CharacterVisualRuntimeOptions): Promise<V2CharacterVisualRuntime> => {
  assertAssignments(assignments);
  const assignmentsByActorId = new Map(
    assignments.map((assignment) => [assignment.actorId, assignment] as const),
  );
  const capacitiesByDirectory = new Map<string, number>();
  for (const assignment of assignments) {
    const expectedSpriteCount =
      assignment.actorId === V2_CHARACTER_VISUAL_PLAYER_ACTOR_ID ? 2 : 1;
    capacitiesByDirectory.set(
      assignment.portraitDirectory,
      (capacitiesByDirectory.get(assignment.portraitDirectory) ?? 0) +
        expectedSpriteCount,
    );
  }

  const inventory = V2_PORTRAIT_ASSET_CATALOG.filesByDirectory;
  const managerResources = new Map<
    string,
    V2CharacterVisualManagerResource
  >();
  const spriteRecords = new Set<V2CharacterVisualSpriteRecord>();
  const blobUrls = new Set<string>();
  const groundShadowManager = showGroundShadows
    ? createGroundShadowManager(scene, V2_TRANSPARENT_ALPHA_INDEX_SPATIAL)
    : null;

  try {
    const directories = [...capacitiesByDirectory.keys()].sort();
    for (const directory of directories) {
      const sheet =
        directory === V2_DEFAULT_PORTRAIT_DIRECTORY
          ? createDefaultSheet(includeNoGunTouchBlendFrames)
          : await createPortraitSheet(
              directory,
              resolveV2PortraitFiles(directory, inventory),
              import.meta.env.BASE_URL,
              includeNoGunTouchBlendFrames,
            );
      if (sheet.blobUrl !== null) {
        blobUrls.add(sheet.blobUrl);
      }
      const capacity = capacitiesByDirectory.get(directory) as number;
      const manager = new SpriteManager(
        `V2CharacterVisual_${directory}`,
        sheet.url,
        capacity,
        { width: sheet.cellWidth, height: sheet.cellHeight },
        scene,
      );
      if (orientationMode === "upright") {
        manager.layerMask = 0;
      }
      managerResources.set(directory, {
        manager,
        presentationMaterial:
          orientationMode === "upright"
            ? createPresentationMaterial(directory, manager, scene)
            : null,
        sheet,
        capacity,
        activeSpriteCount: 0,
      });
    }
  } catch (error) {
    for (const resource of managerResources.values()) {
      resource.presentationMaterial?.dispose(false, false);
      resource.manager.dispose();
    }
    for (const blobUrl of blobUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    throw error;
  }

  let disposed = false;
  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2 Character表示Runtimeは使用できません。");
    }
  };

  let facingYaw = 0;

  const disposeSpriteRecord = (
    record: V2CharacterVisualSpriteRecord,
    rejectDuplicate: boolean,
  ): void => {
    if (record.disposed) {
      if (rejectDuplicate) {
        throw new Error(
          `V2 Character表示Spriteは破棄済みです: ${record.sprite.name}`,
        );
      }
      return;
    }
    record.disposed = true;
    groundShadowManager?.disposeGroundShadow(record.shadow);
    record.presentation?.mesh.dispose();
    record.sprite.dispose();
    record.managerResource.activeSpriteCount -= 1;
    spriteRecords.delete(record);
  };

  const getActorManagerResource = (
    actorId: string,
  ): V2CharacterVisualManagerResource => {
    const assignment = assignmentsByActorId.get(actorId);
    if (assignment === undefined) {
      throw new Error(
        `V2 Character表示にactor割当がありません: ${actorId}`,
      );
    }
    return managerResources.get(
      assignment.portraitDirectory,
    ) as V2CharacterVisualManagerResource;
  };

  return Object.freeze({
    orientationMode,
    setFacingYaw: (yaw) => {
      assertActive();
      if (!Number.isFinite(yaw)) {
        throw new Error(
          `V2 Character表示の水平yawには有限値が必要です: ${yaw}`,
        );
      }
      if (facingYaw === yaw) {
        return;
      }
      facingYaw = yaw;
      for (const record of spriteRecords) {
        if (record.presentation !== null) {
          if (record.presentation.lastFacingYaw !== facingYaw) {
            record.presentation.mesh.rotation.set(0, facingYaw, 0);
            record.presentation.lastFacingYaw = facingYaw;
          }
        }
      }
    },
    getActorVisualSize: (actorId) => {
      assertActive();
      const managerResource = getActorManagerResource(actorId);
      return Object.freeze({
        width: managerResource.sheet.width,
        height: managerResource.sheet.height,
      });
    },
    createSprite: (actorId, instanceName) => {
      assertActive();
      if (instanceName.length === 0) {
        throw new Error("V2 Character表示Spriteのinstance nameが空です。");
      }
      const managerResource = getActorManagerResource(actorId);
      if (managerResource.activeSpriteCount >= managerResource.capacity) {
        throw new Error(
          `V2 Character表示SpriteManagerのcapacityを超えました: ${actorId}`,
        );
      }
      const sprite = new Sprite(instanceName, managerResource.manager);
      sprite.width = managerResource.sheet.width;
      sprite.height = managerResource.sheet.height;
      sprite.isPickable = false;
      sprite.cellIndex = getV2CharacterVisualCellIndex(
        "normal",
        false,
        managerResource.sheet.source,
        null,
      );
      const presentation =
        orientationMode === "upright"
          ? createPresentation(
              actorId,
              instanceName,
              managerResource.presentationMaterial as StandardMaterial,
              managerResource.sheet.frameCount,
              scene,
            )
          : null;
      const record: V2CharacterVisualSpriteRecord = {
        sprite,
        presentation,
        managerResource,
        shadow: groundShadowManager?.createGroundShadow(
          `V2CharacterGroundShadow_${instanceName}`,
          "ellipse"
        ) ?? null,
        disposed: false,
      };
      managerResource.activeSpriteCount += 1;
      spriteRecords.add(record);
      if (presentation !== null) {
        syncPresentation(
          presentation,
          sprite,
          managerResource.sheet.frameCount,
          facingYaw,
        );
      }

      return Object.freeze({
        sprite,
        presentationMesh: presentation?.mesh ?? null,
        width: managerResource.sheet.width,
        height: managerResource.sheet.height,
        setState: (
          state,
          temporaryGunActive,
          noGunTouchBrainwashProgress
        ) => {
          assertActive();
          if (record.disposed) {
            throw new Error(
              `破棄済みのV2 Character表示Spriteは更新できません: ${instanceName}`,
            );
          }
          sprite.cellIndex = getV2CharacterVisualCellIndex(
            state,
            temporaryGunActive,
            managerResource.sheet.source,
            noGunTouchBrainwashProgress,
          );
        },
        syncPresentation: () => {
          assertActive();
          if (record.disposed) {
            throw new Error(
              `破棄済みのV2 Character表示Spriteは同期できません: ${instanceName}`,
            );
          }
          if (record.presentation !== null) {
            syncPresentation(
              record.presentation,
              sprite,
              managerResource.sheet.frameCount,
              facingYaw,
            );
          }
          if (record.shadow !== null && groundShadowManager !== null) {
            groundShadowManager.syncGroundShadow(record.shadow, {
              positionX: sprite.position.x,
              positionY: sprite.position.y - sprite.height / 2,
              positionZ: sprite.position.z,
              width: sprite.width * 0.72,
              depth: sprite.width * 0.42,
              yaw: facingYaw,
              visibility: sprite.color.a,
              visible: sprite.isVisible,
              layerMask:
                presentation?.mesh.layerMask ?? managerResource.manager.layerMask
            });
          }
        },
        dispose: () => {
          assertActive();
          disposeSpriteRecord(record, true);
        },
      });
    },
    dispose: () => {
      assertActive();
      disposed = true;
      for (const record of [...spriteRecords]) {
        disposeSpriteRecord(record, false);
      }
      for (const resource of managerResources.values()) {
        resource.presentationMaterial?.dispose(false, false);
        resource.manager.dispose();
      }
      managerResources.clear();
      groundShadowManager?.dispose();
      for (const blobUrl of blobUrls) {
        URL.revokeObjectURL(blobUrl);
      }
      blobUrls.clear();
    },
  });
};
