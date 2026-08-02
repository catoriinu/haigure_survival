import {
  Color3,
  Color4,
  Light,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  type InstancedMesh
} from "@babylonjs/core";

import {
  V2_HIT_FADE_DURATION_SECONDS,
  V2_HIT_FLICKER_DURATION_SECONDS,
  V2_HIT_FLICKER_INTERVAL_SECONDS
} from "./characterStateSystem";
import {
  isV2HitState,
  type V2HumanKind,
  type V2HumanTargetSnapshot
} from "./combatTypes";
import { V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT } from "./v2TransparentRenderingOrder";

export const V2_HIT_EFFECT_ALPHA = 0.45;
export const V2_HIT_EFFECT_LIGHT_INTENSITY = 0.4;
export const V2_HIT_EFFECT_LIGHT_RANGE_RATE = 1.2;
export const V2_HIT_EFFECT_LIGHT_IDLE_RANGE = 1;
export const V2_HIT_EFFECT_LIGHT_SLOT_COUNT = 3;
export const V2_HIT_EFFECT_DIAMETER_MARGIN_RATE = 1.05;
export const V2_HIT_EFFECT_PINK = Object.freeze(
  new Color3(1, 0.18, 0.74)
);
export const V2_HIT_EFFECT_CYAN = Object.freeze(
  new Color3(0.2, 0.96, 1)
);
export const V2_HIT_EFFECT_ORB_COUNT_MIN = 5;
export const V2_HIT_EFFECT_ORB_COUNT_MAX = 20;
export const V2_HIT_EFFECT_POOL_KINDS = Object.freeze([
  "shell",
  "material",
  "light",
  "orb"
] as const);

type V2HitEffectPoolKind =
  (typeof V2_HIT_EFFECT_POOL_KINDS)[number];

export type V2HitEffectPoolState = Readonly<{
  capacity: number;
  inUse: number;
  available: number;
}>;

export type V2HitEffectPoolSnapshot = Readonly<
  Record<V2HitEffectPoolKind, V2HitEffectPoolState>
>;

export type V2HitEffectSystemOptions = Readonly<{
  scene: Scene;
  random(): number;
  isIndirectLightVisible(position: Vector3): boolean;
  resolveVisualEnvelope(
    target: V2HumanTargetSnapshot
  ): V2HitEffectVisualEnvelope;
}>;

export type V2HitEffectVisualEnvelope = Readonly<{
  center: Vector3;
  width: number;
  height: number;
}>;

export interface V2HitEffectSystem {
  readonly activeCount: number;
  prepareVisualResources(): Promise<void>;
  start(target: V2HumanTargetSnapshot): boolean;
  update(
    deltaSeconds: number,
    targets: readonly V2HumanTargetSnapshot[],
    shouldRenderOrb: (position: Vector3) => boolean
  ): void;
  getVisualPoolSnapshot(): V2HitEffectPoolSnapshot;
  clear(): void;
  dispose(): void;
}

type HitEffectBundle = {
  mesh: Mesh;
  material: StandardMaterial;
};

type HitFadeOrb = {
  mesh: InstancedMesh;
  velocity: Vector3;
  diameter: number;
};

type ActiveHitEffect = {
  targetId: string;
  kind: V2HumanKind;
  bundle: HitEffectBundle;
  lightSlot: PointLight | null;
  diameter: number;
  phase: "flicker" | "fade";
  phaseElapsedSeconds: number;
  phaseRemainingSeconds: number;
  orbs: HitFadeOrb[];
};

const HIT_FADE_ORB_MIN_SCALE = 0.08;

const assertNonNegativeFiniteNumber = (
  label: string,
  value: number
): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}には0以上の有限値が必要です: ${value}`);
  }
};

const assertTarget = (target: V2HumanTargetSnapshot): void => {
  if (target.id.length === 0 || target.id.trim() !== target.id) {
    throw new Error("命中演出対象には前後空白のない非空IDが必要です");
  }
  const values = [
    target.hitShape.center.x,
    target.hitShape.center.y,
    target.hitShape.center.z,
    target.hitShape.radii.x,
    target.hitShape.radii.y,
    target.hitShape.radii.z
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`命中演出対象の形状に非有限値があります: ${target.id}`);
  }
  if (
    target.hitShape.radii.x <= 0 ||
    target.hitShape.radii.y <= 0 ||
    target.hitShape.radii.z <= 0
  ) {
    throw new Error(`命中演出対象の半径は正数である必要があります: ${target.id}`);
  }
};

const resolveValidatedVisualEnvelope = (
  resolver: V2HitEffectSystemOptions["resolveVisualEnvelope"],
  target: V2HumanTargetSnapshot
): V2HitEffectVisualEnvelope => {
  const envelope = resolver(target);
  if (typeof envelope !== "object" || envelope === null) {
    throw new Error(
      `命中演出の表示包絡にはobjectが必要です: ${target.id}`
    );
  }
  if (!(envelope.center instanceof Vector3)) {
    throw new Error(
      `命中演出の表示包絡中心にはVector3が必要です: ${target.id}`
    );
  }
  if (
    !Number.isFinite(envelope.center.x) ||
    !Number.isFinite(envelope.center.y) ||
    !Number.isFinite(envelope.center.z)
  ) {
    throw new Error(
      `命中演出の表示包絡中心には有限座標が必要です: ${target.id}`
    );
  }
  if (!Number.isFinite(envelope.width) || envelope.width <= 0) {
    throw new Error(
      `命中演出の表示包絡幅には正の有限値が必要です: ${target.id}`
    );
  }
  if (!Number.isFinite(envelope.height) || envelope.height <= 0) {
    throw new Error(
      `命中演出の表示包絡高には正の有限値が必要です: ${target.id}`
    );
  }
  return Object.freeze({
    center: envelope.center.clone(),
    width: envelope.width,
    height: envelope.height
  });
};

const calculateDiameter = (envelope: V2HitEffectVisualEnvelope): number =>
  Math.hypot(envelope.width, envelope.height) *
  V2_HIT_EFFECT_DIAMETER_MARGIN_RATE;

export const createV2HitEffectSystem = ({
  scene,
  random,
  isIndirectLightVisible,
  resolveVisualEnvelope
}: V2HitEffectSystemOptions): V2HitEffectSystem => {
  if (typeof random !== "function") {
    throw new Error("V2HitEffectSystemのrandomには関数が必要です");
  }
  if (typeof isIndirectLightVisible !== "function") {
    throw new Error(
      "V2HitEffectSystemのisIndirectLightVisibleには関数が必要です"
    );
  }
  if (typeof resolveVisualEnvelope !== "function") {
    throw new Error(
      "V2HitEffectSystemのresolveVisualEnvelopeには関数が必要です"
    );
  }

  const shellSource = MeshBuilder.CreateSphere(
    "v2-hit-effect-shell-source",
    { diameter: 1, segments: 18 },
    scene
  );
  shellSource.isPickable = false;
  shellSource.visibility = 0;
  shellSource.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT;
  shellSource.setEnabled(false);
  const shellSourceMaterial = new StandardMaterial(
    "v2-hit-effect-shell-source-material",
    scene
  );
  shellSourceMaterial.alpha = V2_HIT_EFFECT_ALPHA;
  shellSourceMaterial.diffuseColor.copyFrom(V2_HIT_EFFECT_PINK);
  shellSourceMaterial.emissiveColor.copyFrom(V2_HIT_EFFECT_PINK);
  shellSourceMaterial.specularColor.copyFrom(Color3.Black());
  shellSourceMaterial.backFaceCulling = false;
  shellSource.material = shellSourceMaterial;

  const orbSource = MeshBuilder.CreateSphere(
    "v2-hit-effect-orb-source",
    { diameter: 1, segments: 10 },
    scene
  );
  orbSource.isPickable = false;
  orbSource.isVisible = false;
  orbSource.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT;
  const orbMaterial = new StandardMaterial(
    "v2-hit-effect-orb-material",
    scene
  );
  orbMaterial.alpha = V2_HIT_EFFECT_ALPHA;
  orbMaterial.diffuseColor.copyFrom(V2_HIT_EFFECT_PINK);
  orbMaterial.emissiveColor.copyFrom(V2_HIT_EFFECT_PINK);
  orbMaterial.specularColor.copyFrom(Color3.Black());
  orbSource.material = orbMaterial;
  orbSource.registerInstancedBuffer(VertexBuffer.ColorInstanceKind, 4);
  orbSource.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);

  const bundles: HitEffectBundle[] = [];
  const availableBundles: HitEffectBundle[] = [];
  const lightSlots: PointLight[] = [];
  const availableLightSlots: PointLight[] = [];
  const orbInstances: InstancedMesh[] = [];
  const availableOrbs: InstancedMesh[] = [];
  const activeEffects = new Map<string, ActiveHitEffect>();
  let nextBundleSerial = 1;
  let nextOrbSerial = 1;
  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2HitEffectSystemは使用できません");
    }
  };

  const nextRandom = (): number => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        "V2HitEffectSystemのrandomは0以上1未満を返す必要があります"
      );
    }
    return value;
  };
  const randomInRange = (minimum: number, maximum: number): number =>
    minimum + nextRandom() * (maximum - minimum);
  const randomInteger = (minimum: number, maximum: number): number =>
    minimum + Math.floor(nextRandom() * (maximum - minimum + 1));

  const resetBundle = (bundle: HitEffectBundle): void => {
    bundle.mesh.position.setAll(0);
    bundle.mesh.rotation.setAll(0);
    bundle.mesh.scaling.setAll(1);
    bundle.mesh.visibility = 0;
    bundle.mesh.setEnabled(false);
    bundle.material.alpha = V2_HIT_EFFECT_ALPHA;
    bundle.material.diffuseColor.copyFrom(V2_HIT_EFFECT_PINK);
    bundle.material.emissiveColor.copyFrom(V2_HIT_EFFECT_PINK);
    bundle.material.specularColor.copyFrom(Color3.Black());
    bundle.material.backFaceCulling = true;
  };

  const resetLightSlot = (light: PointLight): void => {
    light.position.setAll(0);
    light.diffuse.copyFrom(V2_HIT_EFFECT_PINK);
    light.specular.copyFrom(V2_HIT_EFFECT_PINK);
    light.intensity = 0;
    light.range = V2_HIT_EFFECT_LIGHT_IDLE_RANGE;
  };

  for (
    let serial = 1;
    serial <= V2_HIT_EFFECT_LIGHT_SLOT_COUNT;
    serial += 1
  ) {
    const light = new PointLight(
      `v2-hit-effect-light-${serial}`,
      Vector3.Zero(),
      scene
    );
    light.falloffType = Light.FALLOFF_GLTF;
    resetLightSlot(light);
    lightSlots.push(light);
  }
  availableLightSlots.push(...[...lightSlots].reverse());

  const createBundle = (): HitEffectBundle => {
    const serial = nextBundleSerial;
    nextBundleSerial += 1;
    const mesh = shellSource.clone(
      `v2-hit-effect-shell-${serial}`,
      null,
      false
    );
    if (!mesh) {
      throw new Error("命中演出shellのclone作成に失敗しました");
    }
    const material = new StandardMaterial(
      `v2-hit-effect-material-${serial}`,
      scene
    );
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT;
    const bundle = { mesh, material };
    resetBundle(bundle);
    bundles.push(bundle);
    return bundle;
  };

  const acquireBundle = (): HitEffectBundle => {
    const bundle = availableBundles.pop() ?? createBundle();
    resetBundle(bundle);
    bundle.mesh.visibility = 1;
    bundle.mesh.setEnabled(true);
    return bundle;
  };

  const releaseBundle = (bundle: HitEffectBundle): void => {
    resetBundle(bundle);
    availableBundles.push(bundle);
  };

  const acquireLightSlot = (): PointLight | null => {
    if (availableLightSlots.length === 0) {
      return null;
    }
    return availableLightSlots.pop()!;
  };

  const releaseLightSlot = (light: PointLight): void => {
    resetLightSlot(light);
    availableLightSlots.push(light);
  };

  const resetOrb = (mesh: InstancedMesh): void => {
    mesh.position.setAll(0);
    mesh.rotation.setAll(0);
    mesh.scaling.setAll(1);
    mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
    mesh.isVisible = false;
    mesh.setEnabled(false);
  };

  const acquireOrb = (): InstancedMesh => {
    let mesh = availableOrbs.pop();
    if (!mesh) {
      mesh = orbSource.createInstance(
        `v2-hit-effect-orb-${nextOrbSerial}`
      );
      nextOrbSerial += 1;
      mesh.isPickable = false;
      orbInstances.push(mesh);
    }
    resetOrb(mesh);
    mesh.isVisible = true;
    mesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT;
    mesh.setEnabled(true);
    return mesh;
  };

  const releaseOrb = (mesh: InstancedMesh): void => {
    resetOrb(mesh);
    availableOrbs.push(mesh);
  };

  const releaseEffect = (effect: ActiveHitEffect): void => {
    for (const orb of effect.orbs) {
      releaseOrb(orb.mesh);
    }
    effect.orbs.length = 0;
    if (effect.lightSlot) {
      releaseLightSlot(effect.lightSlot);
    }
    releaseBundle(effect.bundle);
    activeEffects.delete(effect.targetId);
  };

  const setBundleColor = (
    bundle: HitEffectBundle,
    color: Color3
  ): void => {
    bundle.material.diffuseColor.copyFrom(color);
    bundle.material.emissiveColor.copyFrom(color);
  };

  const setEffectColor = (
    effect: ActiveHitEffect,
    color: Color3
  ): void => {
    setBundleColor(effect.bundle, color);
    if (effect.lightSlot) {
      effect.lightSlot.diffuse.copyFrom(color);
      effect.lightSlot.specular.copyFrom(color);
    }
  };

  const getPhaseLightIntensity = (
    effect: ActiveHitEffect
  ): number =>
    effect.phase === "flicker"
      ? V2_HIT_EFFECT_LIGHT_INTENSITY
      : V2_HIT_EFFECT_LIGHT_INTENSITY *
        (effect.phaseRemainingSeconds /
          V2_HIT_FADE_DURATION_SECONDS);

  const updateIndirectLight = (
    effect: ActiveHitEffect,
    position: Vector3
  ): void => {
    if (!effect.lightSlot) {
      return;
    }
    if (!isIndirectLightVisible(position)) {
      effect.lightSlot.intensity = 0;
      effect.lightSlot.range = V2_HIT_EFFECT_LIGHT_IDLE_RANGE;
      return;
    }
    effect.lightSlot.intensity = getPhaseLightIntensity(effect);
    effect.lightSlot.range =
      effect.diameter * V2_HIT_EFFECT_LIGHT_RANGE_RATE;
  };

  const createFadeOrbs = (
    effect: ActiveHitEffect,
    center: Vector3,
    shouldRenderOrb: (position: Vector3) => boolean
  ): void => {
    if (!shouldRenderOrb(center)) {
      return;
    }
    const isPlayer = effect.kind === "player";
    const diameter = isPlayer ? 0.04 : 0.02;
    const offsetMinimum = isPlayer ? 0.01 : 0.005;
    const offsetMaximum = isPlayer ? 0.07 : 0.03;
    const speedMinimum = isPlayer ? 0.04 : 0.02;
    const speedMaximum = isPlayer ? 0.11 : 0.05;
    const count = randomInteger(
      V2_HIT_EFFECT_ORB_COUNT_MIN,
      V2_HIT_EFFECT_ORB_COUNT_MAX
    );
    for (let index = 0; index < count; index += 1) {
      const theta = nextRandom() * Math.PI * 2;
      const vertical = nextRandom() * 2 - 1;
      const horizontal = Math.sqrt(1 - vertical * vertical);
      const direction = new Vector3(
        horizontal * Math.cos(theta),
        vertical,
        horizontal * Math.sin(theta)
      );
      const offset = randomInRange(offsetMinimum, offsetMaximum);
      const mesh = acquireOrb();
      mesh.position.copyFrom(
        center.add(
          direction.scale(effect.diameter / 2 + offset)
        )
      );
      mesh.scaling.setAll(diameter);
      effect.orbs.push({
        mesh,
        velocity: direction.scale(
          randomInRange(speedMinimum, speedMaximum)
        ),
        diameter
      });
    }
  };

  const updateFadeOrbs = (
    effect: ActiveHitEffect,
    elapsedSeconds: number,
    fadeRatio: number,
    shouldRenderOrb: (position: Vector3) => boolean
  ): void => {
    const activeOrbs: HitFadeOrb[] = [];
    for (const orb of effect.orbs) {
      if (!shouldRenderOrb(orb.mesh.position)) {
        releaseOrb(orb.mesh);
        continue;
      }
      orb.mesh.position.addInPlace(
        orb.velocity.scale(elapsedSeconds)
      );
      if (fadeRatio <= HIT_FADE_ORB_MIN_SCALE) {
        releaseOrb(orb.mesh);
        continue;
      }
      orb.mesh.scaling.setAll(orb.diameter * fadeRatio);
      orb.mesh.instancedBuffers.instanceColor = new Color4(
        1,
        1,
        1,
        fadeRatio
      );
      activeOrbs.push(orb);
    }
    effect.orbs = activeOrbs;
  };

  const clear = (): void => {
    for (const effect of [...activeEffects.values()]) {
      releaseEffect(effect);
    }
  };

  return {
    get activeCount() {
      return activeEffects.size;
    },
    prepareVisualResources: async () => {
      assertActive();
      const bundle = acquireBundle();
      const compilations = [
        bundle.material.forceCompilationAsync(bundle.mesh),
        orbMaterial.forceCompilationAsync(orbSource, {
          useInstances: true
        })
      ];
      await Promise.all(compilations);
      releaseBundle(bundle);
    },
    start: (target) => {
      assertActive();
      assertTarget(target);
      if (activeEffects.has(target.id)) {
        return false;
      }
      const envelope = resolveValidatedVisualEnvelope(
        resolveVisualEnvelope,
        target
      );
      const diameter = calculateDiameter(envelope);
      const bundle = acquireBundle();
      const lightSlot = acquireLightSlot();
      bundle.mesh.position.copyFrom(envelope.center);
      bundle.mesh.scaling.setAll(diameter);
      bundle.material.alpha = V2_HIT_EFFECT_ALPHA;
      bundle.material.backFaceCulling = target.kind !== "player";
      if (lightSlot) {
        lightSlot.position.copyFrom(envelope.center);
      }
      const effect: ActiveHitEffect = {
        targetId: target.id,
        kind: target.kind,
        bundle,
        lightSlot,
        diameter,
        phase: "flicker",
        phaseElapsedSeconds: 0,
        phaseRemainingSeconds:
          V2_HIT_FLICKER_DURATION_SECONDS,
        orbs: []
      };
      setEffectColor(effect, V2_HIT_EFFECT_PINK);
      updateIndirectLight(effect, envelope.center);
      activeEffects.set(target.id, effect);
      return true;
    },
    update: (deltaSeconds, targets, shouldRenderOrb) => {
      assertActive();
      assertNonNegativeFiniteNumber(
        "命中演出deltaSeconds",
        deltaSeconds
      );
      if (typeof shouldRenderOrb !== "function") {
        throw new Error("命中演出のorb表示判定には関数が必要です");
      }
      const targetById = new Map<string, V2HumanTargetSnapshot>();
      for (const target of targets) {
        assertTarget(target);
        if (targetById.has(target.id)) {
          throw new Error(`命中演出対象IDが重複しています: ${target.id}`);
        }
        targetById.set(target.id, target);
      }
      for (const effect of [...activeEffects.values()]) {
        const target = targetById.get(effect.targetId);
        if (!target || !isV2HitState(target.state)) {
          releaseEffect(effect);
          continue;
        }
        const envelope = resolveValidatedVisualEnvelope(
          resolveVisualEnvelope,
          target
        );
        effect.diameter = calculateDiameter(envelope);
        effect.bundle.mesh.position.copyFrom(envelope.center);
        effect.bundle.mesh.scaling.setAll(effect.diameter);
        effect.lightSlot?.position.copyFrom(envelope.center);
        let remainingDeltaSeconds = deltaSeconds;
        while (remainingDeltaSeconds > 0) {
          const consumedSeconds = Math.min(
            remainingDeltaSeconds,
            effect.phaseRemainingSeconds
          );
          effect.phaseElapsedSeconds += consumedSeconds;
          effect.phaseRemainingSeconds -= consumedSeconds;
          remainingDeltaSeconds -= consumedSeconds;
          if (effect.phase === "flicker") {
            const isPink =
              Math.floor(
                effect.phaseElapsedSeconds /
                  V2_HIT_FLICKER_INTERVAL_SECONDS
              ) %
                2 ===
              0;
            setEffectColor(
              effect,
              isPink
                ? V2_HIT_EFFECT_PINK
                : V2_HIT_EFFECT_CYAN
            );
            if (effect.phaseRemainingSeconds > 0) {
              continue;
            }
            effect.phase = "fade";
            effect.phaseElapsedSeconds = 0;
            effect.phaseRemainingSeconds =
              V2_HIT_FADE_DURATION_SECONDS;
            setEffectColor(effect, V2_HIT_EFFECT_PINK);
            createFadeOrbs(
              effect,
              envelope.center,
              shouldRenderOrb
            );
            continue;
          }
          const fadeRatio =
            effect.phaseRemainingSeconds /
            V2_HIT_FADE_DURATION_SECONDS;
          effect.bundle.material.alpha =
            V2_HIT_EFFECT_ALPHA * fadeRatio;
          updateFadeOrbs(
            effect,
            consumedSeconds,
            fadeRatio,
            shouldRenderOrb
          );
          if (effect.phaseRemainingSeconds <= 0) {
            releaseEffect(effect);
            break;
          }
        }
        if (activeEffects.has(effect.targetId)) {
          updateIndirectLight(effect, envelope.center);
        }
      }
    },
    getVisualPoolSnapshot: () => {
      assertActive();
      const bundleCapacity = bundles.length;
      const bundleAvailable = availableBundles.length;
      const bundleState = Object.freeze({
        capacity: bundleCapacity,
        inUse: bundleCapacity - bundleAvailable,
        available: bundleAvailable
      });
      const lightCapacity = lightSlots.length;
      const lightAvailable = availableLightSlots.length;
      const orbCapacity = orbInstances.length;
      const orbAvailable = availableOrbs.length;
      return Object.freeze({
        shell: bundleState,
        material: bundleState,
        light: Object.freeze({
          capacity: lightCapacity,
          inUse: lightCapacity - lightAvailable,
          available: lightAvailable
        }),
        orb: Object.freeze({
          capacity: orbCapacity,
          inUse: orbCapacity - orbAvailable,
          available: orbAvailable
        })
      });
    },
    clear: () => {
      assertActive();
      clear();
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      clear();
      for (const orb of orbInstances) {
        orb.dispose();
      }
      for (const light of lightSlots) {
        light.dispose();
      }
      for (const bundle of bundles) {
        bundle.mesh.dispose(false, false);
        bundle.material.dispose();
      }
      shellSource.dispose(false, false);
      shellSourceMaterial.dispose();
      orbSource.dispose(false, false);
      orbMaterial.dispose();
      availableOrbs.length = 0;
      orbInstances.length = 0;
      availableBundles.length = 0;
      bundles.length = 0;
      availableLightSlots.length = 0;
      lightSlots.length = 0;
      disposed = true;
    }
  };
};
