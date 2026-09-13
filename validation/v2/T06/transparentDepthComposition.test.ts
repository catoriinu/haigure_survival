import {
  Camera, Color3, Color4, Engine, FreeCamera, HemisphericLight, InstancedMesh,
  Material, MeshBuilder, PBRMaterial, Scene, Vector3
} from "@babylonjs/core";

import schoolGlbUrl from "../../../public/stage-assets/v2/B02/b02_school_blockout.glb?url";
import { createV2BitSystem } from "../../../src/v2/bitSystem";
import { createV2BeamSystem } from "../../../src/v2/beamCollision";
import { configureV2TransparentDepthComposition } from "../../../src/v2/v2TransparentDepthComposition";
import {
  configureV2StageTransparentRenderingOrder,
  V2_STAGE_WINDOW_GLASS_MATERIAL_NAME
} from "../../../src/v2/v2StageTransparentRenderingOrder";
import { createSyntheticStageFixture } from "../T06-2/runtimeFixture";
import { createSeededRandom } from "../T06-2/testUtils";
import { assert, executeTest, type T06TestResult } from "./testUtils";

const SIZE = 160;
type Pixel = readonly number[];
type Layer = Readonly<{ name: string; setEnabled(enabled: boolean): void }>;
type GlassDefinition = Readonly<{
  name: string;
  alphaMode: string;
  doubleSided: boolean;
  pbrMetallicRoughness: Readonly<{
    baseColorFactor: readonly number[];
    metallicFactor: number;
    roughnessFactor: number;
  }>;
}>;

const readSchoolGlassDefinition = async (): Promise<GlassDefinition> => {
  const assetUrl = new URL(schoolGlbUrl, `${window.location.origin}/`);
  const response = await fetch(assetUrl);
  const responseDescription = `URL=${response.url} / status=${response.status} / Content-Type=${response.headers.get("content-type")}`;
  assert(response.ok, `学校GLBを取得できません: ${responseDescription}`);
  const bytes = await response.arrayBuffer();
  const header = new DataView(bytes);
  assert(header.getUint32(0, true) === 0x46546c67, `学校資産がGLBではありません: ${responseDescription}`);
  assert(header.getUint32(16, true) === 0x4e4f534a, `学校GLBのJSON chunkがありません: ${responseDescription}`);
  const document = JSON.parse(new TextDecoder("utf-8").decode(
    new Uint8Array(bytes, 20, header.getUint32(12, true))
  )) as { materials: readonly GlassDefinition[] };
  const glass = document.materials.find(({ name }) => name === V2_STAGE_WINDOW_GLASS_MATERIAL_NAME);
  assert(glass !== undefined, "学校GLBに窓ガラスmaterialがありません。");
  assert(glass.alphaMode === "BLEND" && glass.doubleSided, "学校窓ガラスのBLEND・両面契約が変わりました。");
  const alpha = glass.pbrMetallicRoughness.baseColorFactor[3];
  assert(alpha > 0 && alpha < 1, "学校窓ガラスが半透明ではありません。");
  return glass;
};

const readPixel = async (engine: Engine): Promise<Pixel> => {
  const pixels = await engine.readPixels(0, 0, SIZE, SIZE, true, true);
  const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  const offset = ((SIZE / 2) * SIZE + SIZE / 2) * 4;
  return Object.freeze(Array.from(bytes.slice(offset, offset + 4)));
};

const pixelDistance = (left: Pixel, right: Pixel) =>
  Math.max(...left.slice(0, 3).map((channel, index) => Math.abs(channel - right[index])));

const createGpuSceneFixture = (
  engine: Engine,
  glassDefinition: GlassDefinition,
  spawnPending: boolean,
  compositionEnabled: boolean
) => {
  const scene = new Scene(engine);
  if (compositionEnabled) {
    configureV2TransparentDepthComposition(scene);
  }
  scene.imageProcessingConfiguration.isEnabled = false;
  // 窓ガラス・黒いBIT・magenta光線の寄与を8bit量子化でも区別できる背景を使う。
  scene.clearColor = new Color4(0.04, 0.5, 0.02, 1);
  const camera = new FreeCamera("透過合成検証camera", new Vector3(0, 1.2, -3), scene);
  camera.setTarget(new Vector3(0, 1.2, 0));
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -0.16; camera.orthoRight = 0.16;
  camera.orthoBottom = -0.16; camera.orthoTop = 0.16;
  camera.minZ = 0.01; camera.maxZ = 10;
  scene.activeCamera = camera;
  const light = new HemisphericLight("透過合成検証light", new Vector3(-0.2, 1, -0.5), scene);
  light.intensity = 0.8;
  const spatial = createSyntheticStageFixture(scene);
  for (const mesh of scene.meshes) mesh.isVisible = false;
  const bits = createV2BitSystem(scene, spatial.stage, {
    initialBitCount: 1, maximumBitCount: 1, reinforcementIntervalSeconds: 10,
    minimumSpawnDistance: 0.2, spawnMaxAttempts: 512, spawnProjectionMaxDistance: 0.75,
    combatEnabled: false, modeMuzzleColorEnabled: false, showGroundShadows: false,
    random: () => 0.5, spawnRandom: createSeededRandom(20260912),
    playerSpawn: spatial.selectedPlayerSpawn,
    resolveTargetNavigationArea: (target) => ({
      targetId: target.id, areaId: "t06-2-area", revision: 0,
      anchor: target.footPosition.clone()
    })
  });
  bits.placeBits([{ id: "v2_bit_0", centerPosition: new Vector3(0, 1.2, 0) }]);
  bits.setHostileActionsSuspended(true);
  if (spawnPending) {
    bits.update({ deltaSeconds: 0.25, elapsedSeconds: 0.25, targets: [], externalAlerts: [] });
  } else {
    bits.prepareForScriptedPhase();
    bits.faceBitsAt([{ id: "v2_bit_0", aimPosition: new Vector3(0, 1.2, -3) }]);
  }
  bits.setAiSuspended(true);
  const bitRoot = scene.getTransformNodeByName("v2_bit_0")!;
  const bitLayer: Layer = { name: "BIT", setEnabled: (enabled) => bitRoot.setEnabled(enabled) };
  if (!spawnPending) {
    for (const name of ["v2_bit_0_body", "v2_bit_0_muzzle"]) {
      const mesh = scene.getMeshByName(name);
      assert(mesh instanceof InstancedMesh, `通常BITの実Instanceがありません: ${name}`);
      assert(mesh.material!.alpha === 1 && mesh.sourceMesh.material!.alpha === 1 &&
        mesh.visibility === 1 && mesh.sourceMesh.visibility === 1 && mesh.instancedBuffers.color.a === 1,
      `通常BITの独立参照に必要なsource・Instanceのalpha1契約が変わりました: ${name}`);
      if (!compositionEnabled) {
        // 通常BIT内部の銃口と本体はalpha1なので、独立参照では通常の深度書込で遮蔽する。
        // 半透明キューの中心距離sortへ任せると、奥の本体が手前の黒い銃口を上塗りする。
        mesh.material!.forceDepthWrite = true;
      }
    }
  }

  const glass = MeshBuilder.CreatePlane("VIS_WindowGlass_composition", { size: 0.4 }, scene);
  glass.position.set(0, 1.2, -0.3);
  const material = new PBRMaterial(glassDefinition.name, scene);
  const pbr = glassDefinition.pbrMetallicRoughness;
  material.albedoColor = Color3.FromArray(pbr.baseColorFactor);
  material.alpha = pbr.baseColorFactor[3];
  material.metallic = pbr.metallicFactor;
  material.roughness = pbr.roughnessFactor;
  material.backFaceCulling = !glassDefinition.doubleSided;
  material.twoSidedLighting = glassDefinition.doubleSided;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  glass.material = material;
  configureV2StageTransparentRenderingOrder([glass]);
  const glassLayer: Layer = { name: "学校GLBガラス", setEnabled: (enabled) => glass.setEnabled(enabled) };

  let renderBeamOrbs = false;
  const beams = createV2BeamSystem({
    scene, stage: spatial.stage, getHumanTargets: () => [], random: () => 0.5,
    getOrbVisibilityPredicate: () => () => renderBeamOrbs
  });
  const beamLayer: Layer = { name: "実player-gun", setEnabled: (enabled) => {
    for (const mesh of scene.meshes) {
      if (mesh.name.startsWith("v2-normal-beam-")) mesh.setEnabled(enabled);
    }
  } };
  const layers = [bitLayer, glassLayer, beamLayer];
  const layersByName = new Map(layers.map((layer) => [layer.name, layer]));
  const showOnly = (selected: readonly Layer[]) => {
    for (const layer of layers) layer.setEnabled(false);
    for (const layer of selected) layer.setEnabled(true);
  };
  const render = async (selected: readonly Layer[]) => {
    showOnly(selected);
    scene.autoClear = true;
    scene.autoClearDepthAndStencil = true;
    await scene.whenReadyAsync();
    for (let frame = 0; frame < 3; frame += 1) scene.render();
    return readPixel(engine);
  };
  const reference = async (backToFront: readonly Layer[]) => {
    // 同じ実素材を奥から1層ずつGPU合成する。後続passは色を保持し深度だけ消去する。
    // これが既知の前後関係に対するsource-over参照で、productionの描画indexに依存しない。
    try {
      for (let index = 0; index < backToFront.length; index += 1) {
        showOnly([backToFront[index]]);
        scene.autoClear = index === 0;
        scene.autoClearDepthAndStencil = true;
        scene.render();
      }
      return await readPixel(engine);
    } finally {
      scene.autoClear = true;
      scene.autoClearDepthAndStencil = true;
    }
  };
  return {
    scene, camera, glass, bitRoot, bitLayer, glassLayer, beamLayer, render, reference,
    inspectBitParts: async () => {
      const body = scene.getMeshByName("v2_bit_0_body")!;
      const muzzle = scene.getMeshByName("v2_bit_0_muzzle")!;
      try {
        muzzle.setEnabled(false);
        const bodyOnly = await render([bitLayer]);
        muzzle.setEnabled(true);
        body.setEnabled(false);
        const muzzleOnly = await render([bitLayer]);
        return { bodyOnly, muzzleOnly };
      } finally {
        body.setEnabled(true);
        muzzle.setEnabled(true);
      }
    },
    getLayer: (name: string) => {
      const layer = layersByName.get(name);
      assert(layer !== undefined, `透過合成の参照layerがありません: ${name}`);
      return layer;
    },
    spawnBeam: async (z: number, includeOrbs = false): Promise<Layer> => {
      renderBeamOrbs = includeOrbs;
      const id = beams.spawn({
        sourceId: "player", originKind: "player-gun", targetPolicy: { kind: "alive-humans" },
        origin: new Vector3(-0.2, 1.2, z), direction: Vector3.Right(), speed: 1, maximumLifetime: 10
      });
      beams.update(0.4);
      await beams.prepareVisualResources();
      const layer: Layer = { name: id, setEnabled: (enabled) => {
        for (const mesh of scene.meshes) {
          if (mesh.name.startsWith(`${id}-`)) mesh.setEnabled(enabled);
        }
      } };
      layersByName.set(id, layer);
      return layer;
    },
    dispose: () => {
      beams.dispose(); bits.dispose(); spatial.dispose(); scene.dispose();
    }
  };
};

const createGpuFixture = (
  engine: Engine,
  definition: GlassDefinition,
  spawnPending: boolean
) => {
  const actual = createGpuSceneFixture(engine, definition, spawnPending, true);
  const oracle = createGpuSceneFixture(engine, definition, spawnPending, false);
  const synchronizeReferenceInputs = () => {
    oracle.scene.clearColor.copyFrom(actual.scene.clearColor);
    oracle.camera.position.copyFrom(actual.camera.position);
    oracle.camera.setTarget(actual.camera.getTarget());
    oracle.glass.position.copyFrom(actual.glass.position);
    oracle.glass.rotation.copyFrom(actual.glass.rotation);
    for (const material of oracle.scene.materials) {
      const source = actual.scene.getMaterialByName(material.name);
      assert(source !== null, `参照素材に対応する実素材がありません: ${material.name}`);
      material.alpha = source.alpha;
    }
    for (const mesh of oracle.scene.meshes) {
      if (mesh instanceof InstancedMesh && mesh.name.startsWith("v2-normal-beam-")) {
        const source = actual.scene.getMeshByName(mesh.name);
        assert(source instanceof InstancedMesh, `参照光線に対応する実Instanceがありません: ${mesh.name}`);
        mesh.instancedBuffers.instanceColor = source.instancedBuffers.instanceColor.clone();
      }
    }
  };
  return {
    ...actual,
    inspectBitParts: async () => ({ actual: await actual.inspectBitParts(), reference: await oracle.inspectBitParts() }),
    // 参照sceneにはproduction compositorを登録しない。素材・index・observerの影響を分離する。
    reference: async (backToFront: readonly Layer[]) => {
      synchronizeReferenceInputs();
      const referenceLayers = backToFront.map(({ name }) => oracle.getLayer(name));
      await oracle.render(referenceLayers);
      assert(!oracle.scene.useOrderIndependentTransparency, "独立参照へproduction compositorが混入しました。");
      return oracle.reference(referenceLayers);
    },
    spawnBeam: async (z: number, includeOrbs = false) => {
      const layer = await actual.spawnBeam(z, includeOrbs);
      await oracle.spawnBeam(z, includeOrbs);
      return layer;
    },
    dispose: () => { oracle.dispose(); actual.dispose(); }
  };
};

export const runTransparentDepthCompositionTests = async (): Promise<readonly T06TestResult[]> => {
  const canvas = document.createElement("canvas");
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false }, false);
  engine.setSize(SIZE, SIZE);
  try {
    const definition = await readSchoolGlassDefinition();
    const checks: T06TestResult[] = [];
    checks.push(await executeTest("実出現球alpha0.5と学校PBRガラスの前後合成", async () => {
      const fixture = createGpuFixture(engine, definition, true);
      try {
        const values: string[] = [];
        for (const glassZ of [-0.3, 0.3]) {
          fixture.glass.position.z = glassZ;
          const actual = await fixture.render([fixture.bitLayer, fixture.glassLayer]);
          const expected = await fixture.reference(glassZ < 0
            ? [fixture.bitLayer, fixture.glassLayer] : [fixture.glassLayer, fixture.bitLayer]);
          values.push(`glassZ=${glassZ}: actual=${actual}/reference=${expected}`);
          assert(pixelDistance(actual, expected) <= 3, `出現球とガラスの透過合成が不一致: ${values.join(" | ")}`);
        }
        return values.join(" | ");
      } finally { fixture.dispose(); }
    }));
    checks.push(await executeTest("実BITとplayer-gunの前後・奥BITの画素寄与", async () => {
      const values: string[] = [];
      for (const beamZ of [-0.2, 0.2]) {
        const fixture = createGpuFixture(engine, definition, false);
        try {
          await fixture.spawnBeam(beamZ);
          const actual = await fixture.render([fixture.bitLayer, fixture.beamLayer]);
          const beamOnly = await fixture.render([fixture.beamLayer]);
          const bitOnly = await fixture.render([fixture.bitLayer]);
          const expected = await fixture.reference(beamZ < 0
            ? [fixture.bitLayer, fixture.beamLayer] : [fixture.beamLayer, fixture.bitLayer]);
          const referenceBitOnly = await fixture.reference([fixture.bitLayer]);
          values.push(`beamZ=${beamZ}: actual=${actual}/reference=${expected}/beamOnly=${beamOnly}/bitOnly=${bitOnly}/referenceBitOnly=${referenceBitOnly}`);
          const parts = await fixture.inspectBitParts();
          values.push(`BIT個別描画=${JSON.stringify(parts)}`);
          assert(pixelDistance(parts.actual.bodyOnly, parts.reference.bodyOnly) <= 3 &&
            pixelDistance(parts.actual.muzzleOnly, parts.reference.muzzleOnly) <= 3,
          `本体・銃口の個別描画が独立参照と不一致: ${values.join(" | ")}`);
          assert(pixelDistance(referenceBitOnly, parts.reference.muzzleOnly) <= 3 &&
            pixelDistance(parts.reference.bodyOnly, parts.reference.muzzleOnly) > 8,
          `独立参照で手前の銃口が奥の本体を遮蔽していません: ${values.join(" | ")}`);
          assert(pixelDistance(actual, expected) <= 3, `BITと光線の透過合成が不一致: ${values.join(" | ")}`);
          if (beamZ < 0) {
            assert(pixelDistance(actual, beamOnly) > 8, "手前の半透明光線越しに奥BITの画素が寄与していません。");
          } else {
            assert(pixelDistance(actual, bitOnly) <= 3, "手前BITの不透明部分を奥光線が透過しました。");
          }
        } finally { fixture.dispose(); }
      }
      return values.join(" | ");
    }));
    checks.push(await executeTest("実player-gunと学校PBRガラスの前後・両者の画素寄与", async () => {
      const fixture = createGpuFixture(engine, definition, false);
      try {
        await fixture.spawnBeam(0);
        const values: string[] = [];
        for (const glassZ of [-0.3, 0.3]) {
          fixture.glass.position.z = glassZ;
          const actual = await fixture.render([fixture.beamLayer, fixture.glassLayer]);
          const beamOnly = await fixture.render([fixture.beamLayer]);
          const glassOnly = await fixture.render([fixture.glassLayer]);
          const expected = await fixture.reference(glassZ < 0
            ? [fixture.beamLayer, fixture.glassLayer] : [fixture.glassLayer, fixture.beamLayer]);
          values.push(`glassZ=${glassZ}: actual=${actual}/reference=${expected}/beamOnly=${beamOnly}/glassOnly=${glassOnly}`);
          assert(pixelDistance(actual, expected) <= 3, `光線とガラスの透過合成が不一致: ${values.join(" | ")}`);
          assert(pixelDistance(actual, beamOnly) > 3 && pixelDistance(actual, glassOnly) > 3,
            `光線・ガラスの片方が合成から消えています: ${values.join(" | ")}`);
        }
        return values.join(" | ");
      } finally { fixture.dispose(); }
    }));
    checks.push(await executeTest("実BIT・光線・学校ガラスの斜視と逆視点の3層合成", async () => {
      const fixture = createGpuFixture(engine, definition, false);
      try {
        await fixture.spawnBeam(-0.15);
        fixture.glass.position.z = -0.3;
        const values: string[] = [];
        for (const reverse of [false, true]) {
          fixture.camera.position.set(reverse ? -0.9 : 0.9, 1.2, reverse ? 3 : -3);
          fixture.camera.setTarget(new Vector3(0, 1.2, 0));
          const actual = await fixture.render([fixture.bitLayer, fixture.beamLayer, fixture.glassLayer]);
          const expected = await fixture.reference(reverse
            ? [fixture.glassLayer, fixture.beamLayer, fixture.bitLayer]
            : [fixture.bitLayer, fixture.beamLayer, fixture.glassLayer]);
          values.push(`${reverse ? "逆視点" : "斜視"}: actual=${actual}/reference=${expected}`);
          assert(pixelDistance(actual, expected) <= 3, `3層の前後合成が不一致: ${values.join(" | ")}`);
        }
        return values.join(" | ");
      } finally { fixture.dispose(); }
    }));
    checks.push(await executeTest("実光線の多重tip・trailと奥ガラスの透過合成", async () => {
      const fixture = createGpuFixture(engine, definition, false);
      try {
        fixture.glass.position.z = 0.3;
        const rearBeam = await fixture.spawnBeam(0.1, true);
        const frontBeam = await fixture.spawnBeam(-0.1, true);
        // 多重半透明がほぼ不透明になる飽和を避け、実Instanceのfade途中を比較する。
        for (const mesh of fixture.scene.meshes) {
          if (mesh instanceof InstancedMesh && mesh.name.startsWith("v2-normal-beam-")) {
            mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 0.35);
          }
        }
        const tips = fixture.scene.meshes.filter((mesh) => mesh.name.startsWith("v2-normal-beam-") && mesh.name.endsWith("-tip"));
        const trails = fixture.scene.meshes.filter((mesh) => mesh.name.startsWith("v2-normal-beam-") && mesh.name.includes("-trail") && !mesh.name.endsWith("-depth"));
        assert(tips.length >= 2 && trails.length >= 2, "実光線のtip・trailが複数生成されていません。");
        const actual = await fixture.render([fixture.beamLayer, fixture.glassLayer]);
        const expected = await fixture.reference([fixture.glassLayer, rearBeam, frontBeam]);
        const beamOnly = await fixture.render([fixture.beamLayer]);
        assert(pixelDistance(actual, expected) <= 3,
          `多重光線の透過合成が不一致: actual=${actual}/reference=${expected}/beamOnly=${beamOnly}`);
        assert(pixelDistance(actual, beamOnly) > 3, "多重光線の深度で奥ガラスの寄与が消えました。");
        return `tip=${tips.length}/trail=${trails.length}: actual=${actual}/reference=${expected}/beamOnly=${beamOnly}`;
      } finally { fixture.dispose(); }
    }));
    checks.push(await executeTest("alpha0の実出現球・光線tip・trailが奥ガラスを隠さない", async () => {
      const fixture = createGpuFixture(engine, definition, true);
      try {
        fixture.glass.position.z = 0.3;
        await fixture.spawnBeam(-0.1, true);
        const sphere = fixture.scene.getMeshByName("v2_bit_0_spawn")!;
        sphere.material!.alpha = 0;
        let zeroAlphaInstances = 0;
        for (const mesh of fixture.scene.meshes) {
          if (mesh instanceof InstancedMesh && mesh.name.startsWith("v2-normal-beam-")) {
            mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 0);
            zeroAlphaInstances += 1;
          }
        }
        assert(zeroAlphaInstances >= 4, "alpha0へ設定する実光線Instanceが不足しています。");
        const actual = await fixture.render([fixture.bitLayer, fixture.beamLayer, fixture.glassLayer]);
        const expected = await fixture.render([fixture.glassLayer]);
        assert(pixelDistance(actual, expected) <= 2,
          `alpha0の形状が奥ガラスを隠しました: actual=${actual}/glassOnly=${expected}`);
        return `alpha0光線Instance=${zeroAlphaInstances}: actual=${actual}/glassOnly=${expected}`;
      } finally { fixture.dispose(); }
    }));
    return Object.freeze(checks);
  } finally {
    engine.dispose();
    canvas.remove();
  }
};
