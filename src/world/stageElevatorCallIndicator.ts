import { Color3, PBRMaterial } from "@babylonjs/core";

import {
  type ElevatorCallMatState,
  type ElevatorCallMatVisualPhase,
  type StageElevatorCallIndicatorAdapter
} from "./stageElevatorRuntime";
import type { StageElevatorCallIndicatorAsset } from "./stageDynamicAssets";

const CALL_INDICATOR_COLORS = Object.freeze({
  ready: Color3.FromHexString("#36C96B"),
  called: Color3.FromHexString("#E8B52E"),
  unloading: Color3.FromHexString("#E8B52E"),
  "departure-countdown": Color3.FromHexString("#E34242"),
  locked: Color3.FromHexString("#E34242"),
  black: Color3.FromHexString("#050505")
} satisfies Readonly<Record<ElevatorCallMatState | "black", Color3>>);

const createIndicatorMaterial = (
  source: PBRMaterial,
  name: string,
  color: Color3
) => {
  const material = new PBRMaterial(name, source.getScene());
  material.albedoColor = color.clone();
  material.emissiveColor = color.scale(0.12);
  material.metallic = 0;
  material.roughness = 0.82;
  material.alpha = source.alpha;
  material.backFaceCulling = source.backFaceCulling;
  return material;
};

export const createStageElevatorCallIndicatorAdapter = (
  asset: StageElevatorCallIndicatorAsset
): StageElevatorCallIndicatorAdapter => {
  const sourceMaterial = asset.baseMesh.material;
  if (!(sourceMaterial instanceof PBRMaterial)) {
    throw new Error(
      `エレベーター呼出indicatorのBaseにはPBRMaterialが必要です: ${asset.baseMesh.name}`
    );
  }

  const materials = new Map<ElevatorCallMatState | "black", PBRMaterial>(
    (
      Object.entries(CALL_INDICATOR_COLORS) as readonly [
        ElevatorCallMatState | "black",
        Color3
      ][]
    ).map(([state, color]) => [
      state,
      createIndicatorMaterial(
        sourceMaterial,
        `${sourceMaterial.name}_${asset.id}_${state}`,
        color
      )
    ])
  );
  let active = true;
  let currentMaterial: PBRMaterial | null = null;

  return Object.freeze({
    id: asset.id,
    setPresentation: (
      state: ElevatorCallMatState,
      visualPhase: ElevatorCallMatVisualPhase
    ) => {
      if (!active) {
        throw new Error(
          `破棄済みのエレベーター呼出indicatorは更新できません: ${asset.id}`
        );
      }
      const material = materials.get(
        visualPhase === "black" ? "black" : state
      )!;
      if (currentMaterial === material) {
        return;
      }
      asset.baseMesh.material = material;
      currentMaterial = material;
    },
    dispose: () => {
      if (!active) {
        throw new Error(
          `エレベーター呼出indicatorは既に破棄されています: ${asset.id}`
        );
      }
      active = false;
      asset.baseMesh.material = sourceMaterial;
      materials.forEach((material) => material.dispose());
      materials.clear();
      currentMaterial = null;
    }
  });
};
