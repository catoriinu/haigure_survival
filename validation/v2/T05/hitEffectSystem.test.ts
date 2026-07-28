import {
  Color3,
  InstancedMesh,
  Light,
  NullEngine,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";

import type {
  V2CharacterState,
  V2HumanKind,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import {
  createV2HitEffectSystem,
  V2_HIT_EFFECT_ALPHA,
  V2_HIT_EFFECT_CYAN,
  V2_HIT_EFFECT_LIGHT_INTENSITY,
  V2_HIT_EFFECT_PINK
} from "../../../src/v2/hitEffectSystem";

export type HitEffectSystemTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): HitEffectSystemTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail:
        error instanceof Error
          ? error.stack ?? error.message
          : String(error)
    });
  }
};

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-6
) => Math.abs(actual - expected) <= tolerance;

const colorsMatch = (
  actual: Readonly<{ r: number; g: number; b: number }>,
  expected: Readonly<{ r: number; g: number; b: number }>
) =>
  approximately(actual.r, expected.r) &&
  approximately(actual.g, expected.g) &&
  approximately(actual.b, expected.b);

const createTarget = (
  id: string,
  kind: V2HumanKind,
  state: V2CharacterState,
  center = new Vector3(1, 2, 3)
): V2HumanTargetSnapshot => {
  const radii =
    kind === "player"
      ? new Vector3(0.1, 0.24, 0.1)
      : new Vector3(0.08, 0.2, 0.08);
  return Object.freeze({
    id,
    kind,
    footPosition: center.subtract(new Vector3(0, radii.y, 0)),
    aimPosition: center.clone(),
    hitShape: Object.freeze({
      center: center.clone(),
      radii
    }),
    state,
    alive: state === "normal" || state === "evade",
    brainwashed:
      state !== "normal" &&
      state !== "evade" &&
      state !== "hit-a" &&
      state !== "hit-b"
  });
};

export const runHitEffectSystemTests =
  (): readonly HitEffectSystemTestResult[] => {
    const results: HitEffectSystemTestResult[] = [];

    results.push(
      executeTest(
        "受理済みplayer命中をV1寸法・2色点滅・1秒fadeで表示する",
        () => {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const baseline = Object.freeze({
            meshes: scene.meshes.length,
            materials: scene.materials.length,
            geometries: scene.geometries.length,
            lights: scene.lights.length
          });
          const system = createV2HitEffectSystem({
            scene,
            random: () => 0.5,
            isIndirectLightVisible: () => true
          });
          try {
            const normalTarget = createTarget(
              "player",
              "player",
              "normal"
            );
            const hitTarget = createTarget(
              "player",
              "player",
              "hit-a"
            );
            const expectedDiameter =
              Math.hypot(
                hitTarget.hitShape.radii.x * 2,
                hitTarget.hitShape.radii.y * 2
              ) * 1.05;
            const started = system.start(normalTarget);
            const duplicateRejected = !system.start(normalTarget);
            const shell = scene.meshes.find((mesh) =>
              mesh.name.startsWith("v2-hit-effect-shell-1")
            );
            const material = shell?.material as
              | StandardMaterial
              | undefined;
            const light = scene.lights.find(
              (candidate) =>
                candidate.name === "v2-hit-effect-light-1"
            );
            const initialProfile =
              started &&
              duplicateRejected &&
              shell?.isEnabled() === true &&
              approximately(shell.scaling.x, expectedDiameter) &&
              approximately(material?.alpha ?? -1, V2_HIT_EFFECT_ALPHA) &&
              material?.backFaceCulling === false &&
              colorsMatch(
                material?.emissiveColor ?? Color3.Black(),
                V2_HIT_EFFECT_PINK
              ) &&
              approximately(V2_HIT_EFFECT_LIGHT_INTENSITY, 0.4) &&
              approximately(
                light?.intensity ?? -1,
                V2_HIT_EFFECT_LIGHT_INTENSITY
              ) &&
              approximately(
                light?.range ?? -1,
                expectedDiameter * 1.2
              ) &&
              light?.falloffType === Light.FALLOFF_GLTF;

            system.update(0.12, [hitTarget], () => true);
            const cyanFlicker = colorsMatch(
              material?.emissiveColor ?? Color3.Black(),
              V2_HIT_EFFECT_CYAN
            );
            system.update(2.88, [hitTarget], () => true);
            const fadeStart = system.getVisualPoolSnapshot();
            const orbSource = scene.getMeshByName(
              "v2-hit-effect-orb-source"
            );
            const activePlayerOrbs = scene.meshes.filter(
              (mesh) =>
                mesh instanceof InstancedMesh &&
                mesh.name.startsWith("v2-hit-effect-orb-") &&
                mesh.isEnabled()
            );
            const playerOrbProfile =
              fadeStart.orb.inUse === 13 &&
              orbSource?.isVisible === false &&
              orbSource.isEnabled() &&
              activePlayerOrbs.length === 13 &&
              activePlayerOrbs.every(
                (mesh) =>
                  mesh.isVisible &&
                  approximately(mesh.scaling.x, 0.04)
              );
            system.update(0.5, [hitTarget], () => true);
            const halfwayFade =
              approximately(
                material?.alpha ?? -1,
                V2_HIT_EFFECT_ALPHA * 0.5
              ) &&
              approximately(
                light?.intensity ?? -1,
                V2_HIT_EFFECT_LIGHT_INTENSITY * 0.5
              );
            system.update(0.5, [hitTarget], () => true);
            const completed = system.getVisualPoolSnapshot();
            const allReturned =
              system.activeCount === 0 &&
              completed.shell.inUse === 0 &&
              completed.material.inUse === 0 &&
              completed.light.inUse === 0 &&
              completed.orb.inUse === 0;
            system.dispose();
            const resourcesDisposed =
              scene.meshes.length === baseline.meshes &&
              scene.materials.length === baseline.materials &&
              scene.geometries.length === baseline.geometries &&
              scene.lights.length === baseline.lights;
            return {
              ok:
                initialProfile &&
                cyanFlicker &&
                playerOrbProfile &&
                halfwayFade &&
                allReturned &&
                resourcesDisposed,
              detail:
                `diameter=${expectedDiameter.toFixed(6)} / ` +
                `cyan=${cyanFlicker} / orbs=${fadeStart.orb.inUse} / ` +
                `half=${halfwayFade} / returned=${allReturned} / ` +
                `disposed=${resourcesDisposed}`
            };
          } finally {
            system.dispose();
            scene.dispose();
            engine.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "NPC命中orbとbundleを高水位で再利用しclear時に全返却する",
        () => {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const system = createV2HitEffectSystem({
            scene,
            random: () => 0.5,
            isIndirectLightVisible: () => true
          });
          try {
            const first = createTarget("npc-1", "npc", "hit-a");
            const second = createTarget(
              "npc-2",
              "npc",
              "hit-a",
              new Vector3(2, 2, 3)
            );
            system.start(first);
            system.start(second);
            system.update(3, [first, second], () => true);
            const highWater = system.getVisualPoolSnapshot();
            const npcShellsCullBackFaces = scene.meshes
              .filter(
                (mesh) =>
                  mesh.name.startsWith("v2-hit-effect-shell-") &&
                  mesh.name !== "v2-hit-effect-shell-source"
              )
              .every(
                (mesh) =>
                  (mesh.material as StandardMaterial)
                    .backFaceCulling === true
              );
            const npcOrbProfile =
              highWater.orb.inUse === 26 &&
              scene.meshes
                .filter(
                  (mesh) =>
                    mesh instanceof InstancedMesh &&
                    mesh.name.startsWith("v2-hit-effect-orb-") &&
                    mesh.isEnabled()
                )
                .every((mesh) => approximately(mesh.scaling.x, 0.02));
            const meshCountAtHighWater = scene.meshes.length;
            const materialCountAtHighWater = scene.materials.length;
            const lightCountAtHighWater = scene.lights.length;
            system.clear();
            const afterClear = system.getVisualPoolSnapshot();
            system.start(first);
            system.start(second);
            system.update(3, [first, second], () => true);
            const reused = system.getVisualPoolSnapshot();
            const noGrowth =
              scene.meshes.length === meshCountAtHighWater &&
              scene.materials.length === materialCountAtHighWater &&
              scene.lights.length === lightCountAtHighWater &&
              reused.shell.capacity === highWater.shell.capacity &&
              reused.orb.capacity === highWater.orb.capacity;
            system.clear();
            return {
              ok:
                highWater.shell.inUse === 2 &&
                highWater.material.inUse === 2 &&
                highWater.light.inUse === 2 &&
                npcShellsCullBackFaces &&
                npcOrbProfile &&
                afterClear.shell.inUse === 0 &&
                afterClear.orb.inUse === 0 &&
                noGrowth,
              detail:
                `bundle=${highWater.shell.capacity} / ` +
                `orbs=${highWater.orb.capacity} / ` +
                `npcCull=${npcShellsCullBackFaces} / ` +
                `npcProfile=${npcOrbProfile} / noGrowth=${noGrowth}`
            };
          } finally {
            system.dispose();
            scene.dispose();
            engine.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "bundle再利用時もNPCとplayerの内側描画を混線させず間接照明を動的遮蔽する",
        () => {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          let indirectLightVisible = true;
          const checkedPositions: Vector3[] = [];
          const system = createV2HitEffectSystem({
            scene,
            random: () => 0.5,
            isIndirectLightVisible: (position) => {
              checkedPositions.push(position.clone());
              return indirectLightVisible;
            }
          });
          try {
            const npc = createTarget("npc", "npc", "hit-a");
            const player = createTarget(
              "player",
              "player",
              "hit-a",
              new Vector3(2, 2, 3)
            );
            system.start(npc);
            const shell = scene.getMeshByName(
              "v2-hit-effect-shell-1"
            );
            const material = shell?.material as
              | StandardMaterial
              | undefined;
            const light = scene.getLightByName(
              "v2-hit-effect-light-1"
            );
            const firstNpcProfile =
              material?.backFaceCulling === true &&
              approximately(
                light?.intensity ?? -1,
                V2_HIT_EFFECT_LIGHT_INTENSITY
              );

            system.clear();
            system.start(player);
            const playerProfile =
              material?.backFaceCulling === false &&
              approximately(
                light?.intensity ?? -1,
                V2_HIT_EFFECT_LIGHT_INTENSITY
              );

            system.clear();
            indirectLightVisible = false;
            system.start(npc);
            const secondNpcProfile =
              material?.backFaceCulling === true &&
              approximately(light?.intensity ?? -1, 0) &&
              light?.falloffType === Light.FALLOFF_GLTF &&
              approximately(
                light?.range ?? -1,
                Math.hypot(
                  npc.hitShape.radii.x * 2,
                  npc.hitShape.radii.y * 2
                ) *
                  1.05 *
                  1.2
              );

            indirectLightVisible = true;
            system.update(0, [npc], () => true);
            const visibleFlicker = approximately(
              light?.intensity ?? -1,
              V2_HIT_EFFECT_LIGHT_INTENSITY
            );
            system.update(3.5, [npc], () => true);
            const visibleHalfFade = approximately(
              light?.intensity ?? -1,
              V2_HIT_EFFECT_LIGHT_INTENSITY * 0.5
            );
            indirectLightVisible = false;
            system.update(0, [npc], () => true);
            const hiddenHalfFade = approximately(
              light?.intensity ?? -1,
              0
            );
            indirectLightVisible = true;
            system.update(0, [npc], () => true);
            const restoredHalfFade = approximately(
              light?.intensity ?? -1,
              V2_HIT_EFFECT_LIGHT_INTENSITY * 0.5
            );
            const latestPosition =
              checkedPositions[checkedPositions.length - 1];
            const positionsMatch =
              checkedPositions.length >= 7 &&
              latestPosition !== undefined &&
              latestPosition.equals(npc.hitShape.center);

            return {
              ok:
                firstNpcProfile &&
                playerProfile &&
                secondNpcProfile &&
                visibleFlicker &&
                visibleHalfFade &&
                hiddenHalfFade &&
                restoredHalfFade &&
                positionsMatch,
              detail:
                `npc1=${firstNpcProfile} / player=${playerProfile} / ` +
                `npc2=${secondNpcProfile} / visible=${visibleFlicker} / ` +
                `fade=${visibleHalfFade}->${hiddenHalfFade}->${restoredHalfFade} / ` +
                `queries=${checkedPositions.length}`
            };
          } finally {
            system.dispose();
            scene.dispose();
            engine.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "対象消失・状態解除・orb非表示判定で即時返却する",
        () => {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const system = createV2HitEffectSystem({
            scene,
            random: () => 0.5,
            isIndirectLightVisible: () => true
          });
          try {
            const hitTarget = createTarget("npc", "npc", "hit-a");
            system.start(hitTarget);
            system.update(0.1, [], () => true);
            const missingReleased = system.activeCount === 0;
            system.start(hitTarget);
            system.update(
              0.1,
              [createTarget("npc", "npc", "brainwash-in-progress")],
              () => true
            );
            const stateReleased = system.activeCount === 0;
            system.start(hitTarget);
            system.update(3, [hitTarget], () => false);
            const culledAtFade =
              system.activeCount === 1 &&
              system.getVisualPoolSnapshot().orb.inUse === 0;
            system.clear();
            return {
              ok:
                missingReleased &&
                stateReleased &&
                culledAtFade &&
                system.getVisualPoolSnapshot().shell.inUse === 0,
              detail:
                `missing=${missingReleased} / state=${stateReleased} / ` +
                `culled=${culledAtFade}`
            };
          } finally {
            system.dispose();
            scene.dispose();
            engine.dispose();
          }
        }
      )
    );

    return Object.freeze(results);
  };
