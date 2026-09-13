import type { Mesh } from "@babylonjs/core";

import { V2_TRANSPARENT_ALPHA_INDEX_SPATIAL } from "./v2TransparentRenderingOrder";

export const V2_STAGE_WINDOW_GLASS_MATERIAL_NAME =
  "MAT_B03_WindowGlass";

export const configureV2StageTransparentRenderingOrder = (
  visualMeshes: readonly Mesh[]
): void => {
  const windowGlassMeshes = visualMeshes.filter(
    (mesh) =>
      mesh.material?.name === V2_STAGE_WINDOW_GLASS_MATERIAL_NAME
  );
  if (windowGlassMeshes.length === 0) {
    throw new Error(
      `Stage visualに窓ガラスMaterialがありません: ${V2_STAGE_WINDOW_GLASS_MATERIAL_NAME}`
    );
  }
  for (const mesh of windowGlassMeshes) {
    const material = mesh.material;
    if (
      material === null ||
      !material.needAlphaBlendingForMesh(mesh)
    ) {
      throw new Error(
        `Stage窓ガラスMaterialがalpha blendではありません: ${mesh.name}`
      );
    }
  }
  for (const mesh of visualMeshes) {
    if (mesh.material?.needAlphaBlendingForMesh(mesh)) {
      mesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_SPATIAL;
    }
  }
};
