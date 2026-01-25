import { Color3, DynamicTexture, Scene, Texture } from "@babylonjs/core";

export const colorToHex = (color: Color3) => {
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

type GridTextureOptions = {
  baseColor: Color3;
  lineColor: Color3;
  lineWidth: number;
  lineSpacing: number;
};

export const createGridTexture = (
  scene: Scene,
  textureName: string,
  size: number,
  options: GridTextureOptions
) => {
  const texture = new DynamicTexture(
    textureName,
    { width: size, height: size },
    scene,
    false
  );
  const ctx = texture.getContext();
  ctx.fillStyle = colorToHex(options.baseColor);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = colorToHex(options.lineColor);
  ctx.lineWidth = options.lineWidth;

  for (let i = 0; i <= size; i += options.lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  texture.update();
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;

  return texture;
};
