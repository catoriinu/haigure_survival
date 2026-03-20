import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  Scene,
  Sprite,
  StandardMaterial,
  Texture,
  VertexBuffer
} from "@babylonjs/core";
import type { PortraitSpriteSheet } from "./portraitSprites";

export type CharacterBillboardMeshHandle = {
  mesh: Mesh;
  frameCount: number;
  uvData: Float32Array;
  colorData: Float32Array;
  lastCellIndex: number;
  lastWidth: number;
  lastHeight: number;
  lastLayerMask: number;
  lastVisible: boolean;
  lastColor: Color4;
};

type CharacterBillboardMeshManager = {
  createCharacterBillboardMesh: (
    name: string,
    directory: string
  ) => CharacterBillboardMeshHandle;
  syncCharacterBillboardMesh: (
    handle: CharacterBillboardMeshHandle,
    sprite: Sprite,
    enabled: boolean,
    layerMask: number,
    yaw: number
  ) => void;
  disposeCharacterBillboardMesh: (
    handle: CharacterBillboardMeshHandle | null
  ) => void;
};

const fillColorData = (target: Float32Array, color: Color4) => {
  for (let index = 0; index < 4; index += 1) {
    const offset = index * 4;
    target[offset] = color.r;
    target[offset + 1] = color.g;
    target[offset + 2] = color.b;
    target[offset + 3] = color.a;
  }
};

const updateUvData = (
  target: Float32Array,
  cellIndex: number,
  frameCount: number
) => {
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

export const createCharacterBillboardMeshManager = (
  scene: Scene,
  getPortraitSpriteSheet: (directory: string) => PortraitSpriteSheet
): CharacterBillboardMeshManager => {
  const materialCache = new Map<string, StandardMaterial>();

  const ensureMaterial = (directory: string) => {
    const cachedMaterial = materialCache.get(directory);
    if (cachedMaterial) {
      return cachedMaterial;
    }
    const sheet = getPortraitSpriteSheet(directory);
    const texture = new Texture(sheet.url, scene, true, false);
    texture.hasAlpha = true;

    const material = new StandardMaterial(
      `characterBillboardMaterial_${directory}`,
      scene
    );
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.specularColor = Color3.Black();
    material.diffuseColor = Color3.White();
    material.emissiveColor = Color3.White();
    material.linkEmissiveWithDiffuse = true;
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    materialCache.set(directory, material);
    return material;
  };

  const createCharacterBillboardMesh = (name: string, directory: string) => {
    const sheet = getPortraitSpriteSheet(directory);
    const mesh = MeshBuilder.CreatePlane(
      name,
      { size: 1, updatable: true },
      scene
    );
    mesh.material = ensureMaterial(directory);
    mesh.isPickable = false;
    mesh.isVisible = false;
    mesh.hasVertexAlpha = true;

    const uvData = new Float32Array(8);
    updateUvData(uvData, 0, sheet.frameCount);
    mesh.setVerticesData(VertexBuffer.UVKind, uvData, true);

    const colorData = new Float32Array(16);
    const initialColor = new Color4(1, 1, 1, 1);
    fillColorData(colorData, initialColor);
    mesh.setVerticesData(VertexBuffer.ColorKind, colorData, true);

    return {
      mesh,
      frameCount: sheet.frameCount,
      uvData,
      colorData,
      lastCellIndex: -1,
      lastWidth: -1,
      lastHeight: -1,
      lastLayerMask: -1,
      lastVisible: false,
      lastColor: new Color4(-1, -1, -1, -1)
    };
  };

  const syncCharacterBillboardMesh = (
    handle: CharacterBillboardMeshHandle,
    sprite: Sprite,
    enabled: boolean,
    layerMask: number,
    yaw: number
  ) => {
    handle.mesh.position.copyFrom(sprite.position);
    handle.mesh.rotation.y = yaw;

    if (handle.lastWidth !== sprite.width || handle.lastHeight !== sprite.height) {
      handle.mesh.scaling.set(sprite.width, sprite.height, 1);
      handle.lastWidth = sprite.width;
      handle.lastHeight = sprite.height;
    }

    if (handle.lastCellIndex !== sprite.cellIndex) {
      updateUvData(handle.uvData, sprite.cellIndex, handle.frameCount);
      handle.mesh.updateVerticesData(VertexBuffer.UVKind, handle.uvData, false);
      handle.lastCellIndex = sprite.cellIndex;
    }

    const spriteColor = sprite.color;
    if (
      handle.lastColor.r !== spriteColor.r ||
      handle.lastColor.g !== spriteColor.g ||
      handle.lastColor.b !== spriteColor.b ||
      handle.lastColor.a !== spriteColor.a
    ) {
      fillColorData(handle.colorData, spriteColor);
      handle.mesh.updateVerticesData(
        VertexBuffer.ColorKind,
        handle.colorData,
        false
      );
      handle.lastColor.copyFrom(spriteColor);
    }

    const visible = enabled && sprite.isVisible;
    if (handle.lastVisible !== visible) {
      handle.mesh.isVisible = visible;
      handle.lastVisible = visible;
    }

    if (handle.lastLayerMask !== layerMask) {
      handle.mesh.layerMask = layerMask;
      handle.lastLayerMask = layerMask;
    }
  };

  const disposeCharacterBillboardMesh = (
    handle: CharacterBillboardMeshHandle | null
  ) => {
    if (!handle) {
      return;
    }
    handle.mesh.dispose();
  };

  return {
    createCharacterBillboardMesh,
    syncCharacterBillboardMesh,
    disposeCharacterBillboardMesh
  };
};
