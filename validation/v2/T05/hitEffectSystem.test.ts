import {
  Color3,
  InstancedMesh,
  Light,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  PointLight,
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
  type V2HitEffectVisualEnvelope,
  V2_HIT_EFFECT_ALPHA,
  V2_HIT_EFFECT_CYAN,
  V2_HIT_EFFECT_LIGHT_IDLE_RANGE,
  V2_HIT_EFFECT_LIGHT_INTENSITY,
  V2_HIT_EFFECT_LIGHT_SLOT_COUNT,
  V2_HIT_EFFECT_PINK
} from "../../../src/v2/hitEffectSystem";
import { V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT } from "../../../src/v2/v2TransparentRenderingOrder";

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

const resolveHitShapeVisualEnvelope = (
  target: V2HumanTargetSnapshot
): V2HitEffectVisualEnvelope =>
  Object.freeze({
    center: target.hitShape.center.clone(),
    width: target.hitShape.radii.x * 2,
    height: target.hitShape.radii.y * 2
  });

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
            isIndirectLightVisible: () => true,
            resolveVisualEnvelope: resolveHitShapeVisualEnvelope
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
              shell.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT &&
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
              orbSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT &&
              activePlayerOrbs.length === 13 &&
              activePlayerOrbs.every(
                (mesh) =>
                  mesh.isVisible &&
                  mesh.alphaIndex ===
                    V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT &&
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
            isIndirectLightVisible: () => true,
            resolveVisualEnvelope: resolveHitShapeVisualEnvelope
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
                    mesh.alphaIndex ===
                      V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT &&
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
                .every(
                  (mesh) =>
                    mesh.alphaIndex ===
                      V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT &&
                    approximately(mesh.scaling.x, 0.02)
                );
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
          let visualCenter = new Vector3(4, 5, 6);
          let visualWidth = 0.3;
          let visualHeight = 0.6;
          const system = createV2HitEffectSystem({
            scene,
            random: () => 0.5,
            isIndirectLightVisible: (position) => {
              checkedPositions.push(position.clone());
              return indirectLightVisible;
            },
            resolveVisualEnvelope: () =>
              Object.freeze({
                center: visualCenter.clone(),
                width: visualWidth,
                height: visualHeight
              })
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
            ) as PointLight | null;
            const firstNpcProfile =
              material?.backFaceCulling === true &&
              shell?.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT &&
              shell.position.equals(visualCenter) &&
              approximately(
                shell.scaling.x,
                Math.hypot(visualWidth, visualHeight) * 1.05
              ) &&
              approximately(
                light?.intensity ?? -1,
                V2_HIT_EFFECT_LIGHT_INTENSITY
              );

            system.clear();
            system.start(player);
            const playerProfile =
              material?.backFaceCulling === false &&
              shell?.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT &&
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
                V2_HIT_EFFECT_LIGHT_IDLE_RANGE
              );

            indirectLightVisible = true;
            visualCenter = new Vector3(7, 8, 9);
            visualWidth = 0.5;
            visualHeight = 0.9;
            system.update(0, [npc], () => true);
            const visibleFlicker =
              shell?.position.equals(visualCenter) === true &&
              approximately(
                shell.scaling.x,
                Math.hypot(visualWidth, visualHeight) * 1.05
              ) &&
              light?.position.equals(visualCenter) === true &&
              approximately(
                light?.intensity ?? -1,
                V2_HIT_EFFECT_LIGHT_INTENSITY
              ) &&
              approximately(
                light?.range ?? -1,
                Math.hypot(visualWidth, visualHeight) *
                  1.05 *
                  1.2
              );
            system.update(3.5, [npc], () => true);
            const visibleHalfFade = approximately(
              light?.intensity ?? -1,
              V2_HIT_EFFECT_LIGHT_INTENSITY * 0.5
            );
            indirectLightVisible = false;
            system.update(0, [npc], () => true);
            const hiddenHalfFade =
              approximately(light?.intensity ?? -1, 0) &&
              approximately(
                light?.range ?? -1,
                V2_HIT_EFFECT_LIGHT_IDLE_RANGE
              );
            indirectLightVisible = true;
            system.update(0, [npc], () => true);
            const restoredHalfFade =
              approximately(
                light?.intensity ?? -1,
                V2_HIT_EFFECT_LIGHT_INTENSITY * 0.5
              ) &&
              (light?.range ?? 0) > 0;
            const latestPosition =
              checkedPositions[checkedPositions.length - 1];
            const positionsMatch =
              checkedPositions.length >= 7 &&
              latestPosition !== undefined &&
              latestPosition.equals(visualCenter);

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
        "固定3灯を常時enabledで保持し4件同時命中でもStage照明構成を変更しない",
        () => {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const stageMesh = MeshBuilder.CreateBox(
            "stage-pbr-surrogate",
            { size: 1 },
            scene
          );
          stageMesh.material = new PBRMaterial(
            "stage-pbr-surrogate-material",
            scene
          );
          const system = createV2HitEffectSystem({
            scene,
            random: () => 0.5,
            isIndirectLightVisible: () => true,
            resolveVisualEnvelope: resolveHitShapeVisualEnvelope
          });
          const baselineSceneLights = [...scene.lights];
          const baselineStageLightSources = [...stageMesh.lightSources];
          const originalMarkSubMeshesAsLightDirty =
            stageMesh._markSubMeshesAsLightDirty;
          let stageLightDirtyCount = 0;
          stageMesh._markSubMeshesAsLightDirty = (dispose = false) => {
            stageLightDirtyCount += 1;
            originalMarkSubMeshesAsLightDirty.call(stageMesh, dispose);
          };
          try {
            const targets = [
              createTarget(
                "npc-1",
                "npc",
                "hit-a",
                new Vector3(1, 2, 3)
              ),
              createTarget(
                "npc-2",
                "npc",
                "hit-a",
                new Vector3(2, 2, 3)
              ),
              createTarget(
                "npc-3",
                "npc",
                "hit-a",
                new Vector3(3, 2, 3)
              ),
              createTarget(
                "npc-4",
                "npc",
                "hit-a",
                new Vector3(4, 2, 3)
              )
            ] as const;
            const started = targets.every((target) =>
              system.start(target)
            );
            const concurrent = system.getVisualPoolSnapshot();
            const hitLights = scene.lights.filter(
              (light): light is PointLight =>
                light instanceof PointLight &&
                light.name.startsWith("v2-hit-effect-light-")
            );
            const fourthShell = scene.getMeshByName(
              "v2-hit-effect-shell-4"
            );
            const fixedLightProfile =
              hitLights.length === V2_HIT_EFFECT_LIGHT_SLOT_COUNT &&
              hitLights.every(
                (light) =>
                  light.isEnabled() &&
                  approximately(
                    light.intensity,
                    V2_HIT_EFFECT_LIGHT_INTENSITY
                  ) &&
                  light.range > 0
              );
            system.update(3, targets, () => true);
            const fadeStarted = system.getVisualPoolSnapshot();
            const fourthEffectContinues =
              fourthShell?.isEnabled() === true &&
              fadeStarted.orb.inUse === 52;
            system.update(1, targets, () => true);
            system.clear();
            const released = system.getVisualPoolSnapshot();
            const lightsIdle =
              hitLights.every(
                (light) =>
                  light.isEnabled() &&
                  approximately(light.intensity, 0) &&
                  Number.isFinite(light.range) &&
                  approximately(
                    light.range,
                    V2_HIT_EFFECT_LIGHT_IDLE_RANGE
                  )
              ) &&
              released.light.inUse === 0 &&
              released.light.available ===
                V2_HIT_EFFECT_LIGHT_SLOT_COUNT;
            const sceneLightsStable =
              scene.lights.length === baselineSceneLights.length &&
              scene.lights.every(
                (light, index) => light === baselineSceneLights[index]
              );
            const stageLightSourcesStable =
              stageMesh.lightSources.length ===
                baselineStageLightSources.length &&
              stageMesh.lightSources.every(
                (light, index) =>
                  light === baselineStageLightSources[index]
              );
            const topologyStable =
              sceneLightsStable &&
              stageLightSourcesStable &&
              stageLightDirtyCount === 0;
            return {
              ok:
                started &&
                baselineSceneLights.length ===
                  V2_HIT_EFFECT_LIGHT_SLOT_COUNT &&
                baselineStageLightSources.length ===
                  V2_HIT_EFFECT_LIGHT_SLOT_COUNT &&
                concurrent.shell.inUse === 4 &&
                concurrent.material.inUse === 4 &&
                concurrent.light.capacity ===
                  V2_HIT_EFFECT_LIGHT_SLOT_COUNT &&
                concurrent.light.inUse ===
                  V2_HIT_EFFECT_LIGHT_SLOT_COUNT &&
                concurrent.light.available === 0 &&
                fixedLightProfile &&
                fourthEffectContinues &&
                lightsIdle &&
                topologyStable,
              detail:
                `sceneLights=${baselineSceneLights.length} / ` +
                `stageSources=${baselineStageLightSources.length} / ` +
                `shells=${concurrent.shell.inUse} / ` +
                `lights=${concurrent.light.inUse}/${concurrent.light.capacity} / ` +
                `orbs=${fadeStarted.orb.inUse} / ` +
                `idleRange=${hitLights[0]?.range ?? "none"} / ` +
                `dirty=${stageLightDirtyCount} / ` +
                `stable=${topologyStable}`
            };
          } finally {
            stageMesh._markSubMeshesAsLightDirty =
              originalMarkSubMeshesAsLightDirty;
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
            isIndirectLightVisible: () => true,
            resolveVisualEnvelope: resolveHitShapeVisualEnvelope
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

    results.push(
      executeTest("表示包絡callbackとcenter・width・heightを厳格検証する", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        let missingResolverRejected = false;
        try {
          createV2HitEffectSystem({
            scene,
            random: () => 0.5,
            isIndirectLightVisible: () => true
          } as unknown as Parameters<typeof createV2HitEffectSystem>[0]);
        } catch {
          missingResolverRejected = true;
        }

        let visualEnvelope = Object.freeze({
          center: new Vector3(4, 5, 6),
          width: 0.3,
          height: 0.6
        }) as V2HitEffectVisualEnvelope;
        const system = createV2HitEffectSystem({
          scene,
          random: () => 0.5,
          isIndirectLightVisible: () => true,
          resolveVisualEnvelope: () => visualEnvelope
        });
        try {
          const target = createTarget("npc", "npc", "hit-a");
          const invalidEnvelopes: unknown[] = [
            null,
            Object.freeze({ center: { x: 1, y: 2, z: 3 }, width: 1, height: 1 }),
            Object.freeze({
              center: new Vector3(Number.NaN, 2, 3),
              width: 1,
              height: 1
            }),
            Object.freeze({ center: new Vector3(1, 2, 3), width: 0, height: 1 }),
            Object.freeze({
              center: new Vector3(1, 2, 3),
              width: 1,
              height: Number.POSITIVE_INFINITY
            })
          ];
          let invalidStartRejections = 0;
          for (const invalidEnvelope of invalidEnvelopes) {
            visualEnvelope = invalidEnvelope as V2HitEffectVisualEnvelope;
            try {
              system.start(target);
            } catch {
              invalidStartRejections += 1;
            }
          }

          visualEnvelope = Object.freeze({
            center: new Vector3(4, 5, 6),
            width: 0.3,
            height: 0.6
          });
          const validStarted = system.start(target);
          visualEnvelope = Object.freeze({
            center: new Vector3(4, 5, 6),
            width: 0.3,
            height: 0
          });
          let invalidUpdateRejected = false;
          try {
            system.update(0, [target], () => true);
          } catch {
            invalidUpdateRejected = true;
          }
          system.clear();
          return {
            ok:
              missingResolverRejected &&
              invalidStartRejections === invalidEnvelopes.length &&
              validStarted &&
              invalidUpdateRejected,
            detail:
              `missing=${missingResolverRejected} / ` +
              `start=${invalidStartRejections}/${invalidEnvelopes.length} / ` +
              `update=${invalidUpdateRejected}`
          };
        } finally {
          system.dispose();
          scene.dispose();
          engine.dispose();
        }
      })
    );

    return Object.freeze(results);
  };
