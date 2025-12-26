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

export type RoomConfig = {
  name: string;
  width: number;
  depth: number;
  height: number;
  center: Vector3;
  floorColor: Color3;
  ceilingColor: Color3;
  wallBaseColor: Color3;
  wallGridColor: Color3;
  wallGridSpacing: number;
  wallGridLineWidth: number;
  wallTextureSize: number;
  wallTextureScaleU: number;
  wallTextureScaleV: number;
  enableCollisions: boolean;
};

export type RoomParts = {
  floor: Mesh;
  ceiling: Mesh;
  walls: Mesh[];
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

const createWallTexture = (scene: Scene, config: RoomConfig) => {
  const wallTexture = new DynamicTexture(
    `${config.name}_wallTexture`,
    { width: config.wallTextureSize, height: config.wallTextureSize },
    scene,
    false
  );
  const ctx = wallTexture.getContext();
  ctx.fillStyle = colorToHex(config.wallBaseColor);
  ctx.fillRect(0, 0, config.wallTextureSize, config.wallTextureSize);
  ctx.strokeStyle = colorToHex(config.wallGridColor);
  ctx.lineWidth = config.wallGridLineWidth;

  for (let i = 0; i <= config.wallTextureSize; i += config.wallGridSpacing) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, config.wallTextureSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(config.wallTextureSize, i);
    ctx.stroke();
  }

  wallTexture.update();
  wallTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  wallTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  wallTexture.uScale = config.wallTextureScaleU;
  wallTexture.vScale = config.wallTextureScaleV;

  return wallTexture;
};

export const createRoom = (scene: Scene, config: RoomConfig): RoomParts => {
  const floorMaterial = new StandardMaterial(
    `${config.name}_floorMaterial`,
    scene
  );
  floorMaterial.diffuseColor = config.floorColor;

  const ceilingMaterial = new StandardMaterial(
    `${config.name}_ceilingMaterial`,
    scene
  );
  ceilingMaterial.diffuseColor = config.ceilingColor;

  const wallMaterial = new StandardMaterial(
    `${config.name}_wallMaterial`,
    scene
  );
  wallMaterial.diffuseTexture = createWallTexture(scene, config);
  wallMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

  const floor = MeshBuilder.CreateGround(
    `${config.name}_floor`,
    { width: config.width, height: config.depth },
    scene
  );
  floor.position = new Vector3(
    config.center.x,
    config.center.y,
    config.center.z
  );
  floor.material = floorMaterial;

  const ceiling = MeshBuilder.CreatePlane(
    `${config.name}_ceiling`,
    { width: config.width, height: config.depth, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  ceiling.position = new Vector3(
    config.center.x,
    config.center.y + config.height,
    config.center.z
  );
  ceiling.rotation.x = Math.PI;
  ceiling.material = ceilingMaterial;

  const wallNorth = MeshBuilder.CreatePlane(
    `${config.name}_wallNorth`,
    { width: config.width, height: config.height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  wallNorth.position = new Vector3(
    config.center.x,
    config.center.y + config.height / 2,
    config.center.z + config.depth / 2
  );
  wallNorth.rotation.y = Math.PI;
  wallNorth.material = wallMaterial;

  const wallSouth = MeshBuilder.CreatePlane(
    `${config.name}_wallSouth`,
    { width: config.width, height: config.height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  wallSouth.position = new Vector3(
    config.center.x,
    config.center.y + config.height / 2,
    config.center.z - config.depth / 2
  );
  wallSouth.material = wallMaterial;

  const wallEast = MeshBuilder.CreatePlane(
    `${config.name}_wallEast`,
    { width: config.depth, height: config.height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  wallEast.position = new Vector3(
    config.center.x + config.width / 2,
    config.center.y + config.height / 2,
    config.center.z
  );
  wallEast.rotation.y = -Math.PI / 2;
  wallEast.material = wallMaterial;

  const wallWest = MeshBuilder.CreatePlane(
    `${config.name}_wallWest`,
    { width: config.depth, height: config.height, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  wallWest.position = new Vector3(
    config.center.x - config.width / 2,
    config.center.y + config.height / 2,
    config.center.z
  );
  wallWest.rotation.y = Math.PI / 2;
  wallWest.material = wallMaterial;

  if (config.enableCollisions) {
    floor.checkCollisions = true;
    ceiling.checkCollisions = true;
    wallNorth.checkCollisions = true;
    wallSouth.checkCollisions = true;
    wallEast.checkCollisions = true;
    wallWest.checkCollisions = true;
  }

  return {
    floor,
    ceiling,
    walls: [wallNorth, wallSouth, wallEast, wallWest],
    wallMaterial
  };
};
