import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial
} from "@babylonjs/core";
import { GridLayout } from "../../world/grid";
import { TrapCandidate } from "./types";

export type TrapTelegraphMeshBuildOptions = {
  material: StandardMaterial;
  floorWarningYOffset: number;
  wallWarningInset: number;
  wallCellCount: number;
};

export const createTrapTelegraphMaterial = (scene: Scene) => {
  const material = new StandardMaterial("trapTelegraphMaterial", scene);
  material.diffuseColor = new Color3(1, 0.18, 0.74);
  material.emissiveColor = new Color3(1, 0.18, 0.74);
  material.specularColor = Color3.Black();
  material.alpha = 0.9;
  material.backFaceCulling = false;
  return material;
};

export const createTrapTelegraphMesh = (
  scene: Scene,
  layout: GridLayout,
  candidate: TrapCandidate,
  options: TrapTelegraphMeshBuildOptions
) => {
  if (candidate.kind === "floor") {
    const floorMesh = MeshBuilder.CreateGround(
      `trapTelegraphFloor_${candidate.row}_${candidate.col}`,
      { width: layout.cellSize, height: layout.cellSize },
      scene
    );
    floorMesh.position.set(
      candidate.centerX,
      options.floorWarningYOffset,
      candidate.centerZ
    );
    floorMesh.material = options.material;
    floorMesh.isPickable = false;
    return floorMesh;
  }

  const wallMesh = MeshBuilder.CreatePlane(
    `trapTelegraphWall_${candidate.row}_${candidate.col}_${candidate.side}`,
    {
      width: layout.cellSize,
      height: layout.cellSize * options.wallCellCount,
      sideOrientation: Mesh.DOUBLESIDE
    },
    scene
  );
  wallMesh.position.set(
    candidate.boundaryX + candidate.direction.x * options.wallWarningInset,
    (layout.cellSize * options.wallCellCount) / 2,
    candidate.boundaryZ + candidate.direction.z * options.wallWarningInset
  );
  wallMesh.rotation.y = candidate.rotationY;
  wallMesh.material = options.material;
  wallMesh.isPickable = false;
  return wallMesh;
};

export const setTrapTelegraphVisible = (meshes: Mesh[], visible: boolean) => {
  const visibility = visible ? 1 : 0;
  for (const mesh of meshes) {
    mesh.visibility = visibility;
  }
};

export const disposeTrapTelegraphMeshes = (meshes: Mesh[]) => {
  for (const mesh of meshes) {
    mesh.dispose();
  }
};
