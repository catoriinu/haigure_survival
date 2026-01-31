import {
  Color3,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";

export type HitFadeOrb = {
  mesh: Mesh;
  velocity: Vector3;
};

const hitFadeOrbMinScale = 0.08;
const hitEffectMarginRate = 1.05;

export const calculateHitEffectDiameter = (width: number, height: number) =>
  Math.hypot(width, height) * hitEffectMarginRate;

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
  material.specularColor = Color3.Black();
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
  scale: number,
  shouldProcessOrb: (position: Vector3) => boolean
) => {
  if (scale <= hitFadeOrbMinScale) {
    for (const orb of orbs) {
      orb.mesh.setEnabled(false);
    }
    return;
  }

  const clampedScale = Math.max(scale, 0);
  const activeOrbs: HitFadeOrb[] = [];
  for (const orb of orbs) {
    if (!shouldProcessOrb(orb.mesh.position)) {
      orb.mesh.dispose();
      continue;
    }
    orb.mesh.position.addInPlace(orb.velocity.scale(delta));
    orb.mesh.scaling.set(clampedScale, clampedScale, clampedScale);
    activeOrbs.push(orb);
  }
  orbs.length = 0;
  orbs.push(...activeOrbs);
};

export type HitSequenceState = {
  phase: "none" | "flicker" | "fade";
  timer: number;
  elapsed: number;
  effect: Mesh | null;
  material: StandardMaterial | null;
  light: PointLight | null;
  orbs: HitFadeOrb[];
};

export type HitSequenceConfig = {
  hitDuration: number;
  fadeDuration: number;
  flickerInterval: number;
  colorA: Color3;
  colorB: Color3;
  effectAlpha: number;
  effectDiameter: number;
  lightIntensity: number;
  lightRange: number;
  fadeOrbConfig: HitFadeOrbConfig;
  effectName: string;
  sideOrientation?: number;
  backFaceCulling?: boolean;
};

export const createHitSequenceState = (): HitSequenceState => ({
  phase: "none",
  timer: 0,
  elapsed: 0,
  effect: null,
  material: null,
  light: null,
  orbs: []
});

export const resetHitSequenceState = (state: HitSequenceState) => {
  if (state.effect) {
    state.effect.dispose();
    state.effect = null;
  }
  state.material = null;
  if (state.light) {
    state.light.dispose();
    state.light = null;
  }
  for (const orb of state.orbs) {
    orb.mesh.dispose();
  }
  state.orbs = [];
  state.timer = 0;
  state.elapsed = 0;
  state.phase = "none";
};

export const startHitSequence = (
  state: HitSequenceState,
  scene: Scene,
  position: Vector3,
  config: HitSequenceConfig
) => {
  resetHitSequenceState(state);
  const options: HitEffectMeshOptions = {
    name: config.effectName,
    diameter: config.effectDiameter,
    color: config.colorA,
    alpha: config.effectAlpha
  };
  if (config.sideOrientation !== undefined) {
    options.sideOrientation = config.sideOrientation;
  }
  if (config.backFaceCulling !== undefined) {
    options.backFaceCulling = config.backFaceCulling;
  }
  const { mesh: effect, material } = createHitEffectMesh(scene, options);
  effect.position.copyFrom(position);
  state.effect = effect;
  state.material = material;
  const light = new PointLight(
    `${config.effectName}_light`,
    position.clone(),
    scene
  );
  light.diffuse = config.colorA.clone();
  light.specular = config.colorA.clone();
  light.intensity = config.lightIntensity;
  light.range = config.lightRange;
  state.light = light;
  state.phase = "flicker";
  state.timer = config.hitDuration;
  state.elapsed = 0;
};

export const updateHitSequence = (
  state: HitSequenceState,
  delta: number,
  position: Vector3,
  config: HitSequenceConfig,
  onFlicker: (isColorA: boolean) => void,
  onFadeStart: (() => void) | null,
  onComplete: (() => void) | null,
  shouldProcessOrb: (position: Vector3) => boolean,
  flickerElapsed?: number
) => {
  if (state.phase === "none") {
    return;
  }
  state.effect!.position.copyFrom(position);
  if (state.light) {
    state.light.position.copyFrom(position);
  }

  if (state.phase === "flicker") {
    if (flickerElapsed === undefined) {
      state.elapsed += delta;
    } else {
      state.elapsed = flickerElapsed;
    }
    state.timer -= delta;
    const isColorA =
      Math.floor(state.elapsed / config.flickerInterval) % 2 === 0;
    const color = isColorA ? config.colorA : config.colorB;
    state.material!.emissiveColor.copyFrom(color);
    state.material!.diffuseColor.copyFrom(color);
    state.material!.alpha = config.effectAlpha;
    if (state.light) {
      state.light.diffuse.copyFrom(color);
      state.light.specular.copyFrom(color);
      state.light.intensity = config.lightIntensity;
    }
    onFlicker(isColorA);
    if (state.timer > 0) {
      return;
    }
    state.phase = "fade";
    state.timer = config.fadeDuration;
    if (shouldProcessOrb(position)) {
      state.orbs = createHitFadeOrbs(
        state.effect!.getScene(),
        position.clone(),
        state.material!,
        config.effectDiameter / 2,
        config.fadeOrbConfig
      );
    } else {
      state.orbs = [];
    }
    state.material!.emissiveColor.copyFrom(config.colorA);
    state.material!.diffuseColor.copyFrom(config.colorA);
    state.material!.alpha = config.effectAlpha;
    if (state.light) {
      state.light.diffuse.copyFrom(config.colorA);
      state.light.specular.copyFrom(config.colorA);
    }
    if (onFadeStart) {
      onFadeStart();
    }
  }

  state.timer = Math.max(0, state.timer - delta);
  const fadeScale = state.timer / config.fadeDuration;
  state.material!.alpha = config.effectAlpha * fadeScale;
  if (state.light) {
    state.light.intensity = config.lightIntensity * fadeScale;
  }
  updateHitFadeOrbs(state.orbs, delta, fadeScale, shouldProcessOrb);
  if (state.timer <= 0) {
    if (onComplete) {
      onComplete();
    }
    resetHitSequenceState(state);
  }
};
