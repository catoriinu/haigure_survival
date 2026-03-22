import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture
} from "@babylonjs/core";

type GroundShadowKind = "ellipse" | "bit" | "bit-circle";

export type GroundShadowHandle = {
  mesh: Mesh;
  kind: GroundShadowKind;
};

export type GroundShadowSyncState = {
  positionX: number;
  positionZ: number;
  width: number;
  depth: number;
  yaw: number;
  visibility: number;
  visible: boolean;
  layerMask: number;
};

type GroundShadowManager = {
  createGroundShadow: (
    name: string,
    kind: GroundShadowKind
  ) => GroundShadowHandle;
  syncGroundShadow: (
    handle: GroundShadowHandle,
    state: GroundShadowSyncState
  ) => void;
  disposeGroundShadow: (handle: GroundShadowHandle | null) => void;
};

const shadowTextureSize = 256;
const groundShadowY = 0.0015;
const groundShadowRenderingGroupId = 0;
const bitShadowTipRadius = 0.11;
const bitShadowTipDepthRatio = 0.62;
const bitCircleShadowRadius = 0.36;

const createShadowTexture = (
  scene: Scene,
  name: string,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void
) => {
  const texture = new DynamicTexture(
    name,
    { width: shadowTextureSize, height: shadowTextureSize },
    scene,
    false
  );
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, shadowTextureSize, shadowTextureSize);
  draw(ctx, shadowTextureSize);
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.update();
  return texture;
};

const drawEllipseShadow = (ctx: CanvasRenderingContext2D, size: number) => {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = size * 0.1;
  ctx.beginPath();
  ctx.ellipse(
    size * 0.5,
    size * 0.5,
    size * 0.3,
    size * 0.2,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
};

const drawBitShadow = (ctx: CanvasRenderingContext2D, size: number) => {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = size * 0.08;

  ctx.beginPath();
  ctx.ellipse(
    size * 0.5,
    size * 0.18,
    size * bitShadowTipRadius,
    size * bitShadowTipRadius * bitShadowTipDepthRatio,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.24);
  ctx.lineTo(size * 0.88, size * 0.86);
  ctx.lineTo(size * 0.12, size * 0.86);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawBitCircleShadow = (ctx: CanvasRenderingContext2D, size: number) => {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = size * 0.08;
  ctx.beginPath();
  ctx.ellipse(
    size * 0.5,
    size * 0.5,
    size * bitCircleShadowRadius,
    size * bitCircleShadowRadius,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
};

const createShadowMaterial = (
  scene: Scene,
  name: string,
  texture: DynamicTexture
) => {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.specularColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.Black();
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  return material;
};

export const createGroundShadowManager = (scene: Scene): GroundShadowManager => {
  const ellipseTexture = createShadowTexture(
    scene,
    "groundShadowEllipseTexture",
    drawEllipseShadow
  );
  const bitTexture = createShadowTexture(
    scene,
    "groundShadowBitTexture",
    drawBitShadow
  );
  const bitCircleTexture = createShadowTexture(
    scene,
    "groundShadowBitCircleTexture",
    drawBitCircleShadow
  );
  const ellipseMaterial = createShadowMaterial(
    scene,
    "groundShadowEllipseMaterial",
    ellipseTexture
  );
  const bitMaterial = createShadowMaterial(
    scene,
    "groundShadowBitMaterial",
    bitTexture
  );
  const bitCircleMaterial = createShadowMaterial(
    scene,
    "groundShadowBitCircleMaterial",
    bitCircleTexture
  );

  const createGroundShadow = (name: string, kind: GroundShadowKind) => {
    const mesh = MeshBuilder.CreateGround(
      name,
      { width: 1, height: 1 },
      scene
    );
    mesh.material =
      kind === "ellipse"
        ? ellipseMaterial
        : kind === "bit"
          ? bitMaterial
          : bitCircleMaterial;
    mesh.isPickable = false;
    mesh.isVisible = false;
    mesh.renderingGroupId = groundShadowRenderingGroupId;
    mesh.visibility = 1;
    return { mesh, kind };
  };

  const syncGroundShadow = (
    handle: GroundShadowHandle,
    state: GroundShadowSyncState
  ) => {
    handle.mesh.position.set(state.positionX, groundShadowY, state.positionZ);
    handle.mesh.scaling.set(state.width, 1, state.depth);
    handle.mesh.rotation.y = state.yaw;
    handle.mesh.visibility = Math.max(0, Math.min(1, state.visibility));
    handle.mesh.isVisible = state.visible;
    handle.mesh.layerMask = state.layerMask;
  };

  const disposeGroundShadow = (handle: GroundShadowHandle | null) => {
    if (!handle) {
      return;
    }
    handle.mesh.dispose();
  };

  return {
    createGroundShadow,
    syncGroundShadow,
    disposeGroundShadow
  };
};
