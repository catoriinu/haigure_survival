import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";

export type HitFadeOrb = {
  mesh: Mesh;
  velocity: Vector3;
};

const hitFadeOrbMinScale = 0.08;

export type HitFadeOrbConfig = {
  minCount: number;
  maxCount: number;
  diameter: number;
  surfaceOffsetMin: number;
  surfaceOffsetMax: number;
  speedMin: number;
  speedMax: number;
};

export type HitEffectMeshOptions = {
  name: string;
  diameter: number;
  color: Color3;
  alpha: number;
  segments?: number;
  sideOrientation?: number;
  backFaceCulling?: boolean;
};

export const createHitEffectMesh = (
  scene: Scene,
  options: HitEffectMeshOptions
) => {
  const meshOptions = {
    diameter: options.diameter,
    segments: options.segments ?? 18
  } as {
    diameter: number;
    segments: number;
    sideOrientation?: number;
  };

  if (options.sideOrientation !== undefined) {
    meshOptions.sideOrientation = options.sideOrientation;
  }

  const mesh = MeshBuilder.CreateSphere(options.name, meshOptions, scene);
  mesh.isPickable = false;

  const material = new StandardMaterial(`${options.name}_mat`, scene);
  material.alpha = options.alpha;
  material.emissiveColor = options.color.clone();
  material.diffuseColor = options.color.clone();
  if (options.backFaceCulling !== undefined) {
    material.backFaceCulling = options.backFaceCulling;
  }
  mesh.material = material;

  return { mesh, material };
};

export const createHitFadeOrbs = (
  scene: Scene,
  center: Vector3,
  material: StandardMaterial,
  effectRadius: number,
  config: HitFadeOrbConfig
) => {
  const count =
    config.minCount +
    Math.floor(Math.random() * (config.maxCount - config.minCount + 1));
  const orbs: HitFadeOrb[] = [];

  for (let index = 0; index < count; index += 1) {
    const theta = Math.random() * Math.PI * 2;
    const u = Math.random() * 2 - 1;
    const base = Math.sqrt(1 - u * u);
    const direction = new Vector3(
      base * Math.cos(theta),
      u,
      base * Math.sin(theta)
    );
    const offset =
      config.surfaceOffsetMin +
      Math.random() * (config.surfaceOffsetMax - config.surfaceOffsetMin);
    const position = center.add(direction.scale(effectRadius + offset));
    const orb = MeshBuilder.CreateSphere(
      "hitFadeOrb",
      { diameter: config.diameter, segments: 10 },
      scene
    );
    orb.material = material;
    orb.isPickable = false;
    orb.position.copyFrom(position);
    const speed =
      config.speedMin +
      Math.random() * (config.speedMax - config.speedMin);
    const velocity = direction.scale(speed);
    orbs.push({ mesh: orb, velocity });
  }

  return orbs;
};

export const updateHitFadeOrbs = (
  orbs: HitFadeOrb[],
  delta: number,
  scale: number
) => {
  if (scale <= hitFadeOrbMinScale) {
    for (const orb of orbs) {
      orb.mesh.setEnabled(false);
    }
    return;
  }

  const clampedScale = Math.max(scale, 0);
  for (const orb of orbs) {
    orb.mesh.position.addInPlace(orb.velocity.scale(delta));
    orb.mesh.scaling.set(clampedScale, clampedScale, clampedScale);
  }
};
