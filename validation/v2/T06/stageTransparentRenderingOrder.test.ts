import {
  Camera, Color3, Color4, Engine, EngineStore, FreeCamera, InstancedMesh, Material,
  MeshBuilder, NullEngine, Scene, StandardMaterial, Vector3, VertexBuffer
} from "@babylonjs/core";

import {
  V2_NORMAL_BEAM_BACK_DIAMETER,
  V2_NORMAL_BEAM_FRONT_DIAMETER,
  V2_NORMAL_BEAM_MAX_BODY_LENGTH,
  V2_NORMAL_BEAM_TIP_DIAMETER,
  createV2BeamSystem
} from "../../../src/v2/beamCollision";
import { configureV2TransparentDepthComposition } from "../../../src/v2/v2TransparentDepthComposition";
import { V2_HIT_FLICKER_DURATION_SECONDS } from "../../../src/v2/characterStateSystem";
import type { V2HumanTargetSnapshot } from "../../../src/v2/combatTypes";
import { createV2HitEffectSystem } from "../../../src/v2/hitEffectSystem";
import {
  V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
  configureV2StageTransparentRenderingOrder
} from "../../../src/v2/v2StageTransparentRenderingOrder";
import {
  V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR,
  V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_SPATIAL
} from "../../../src/v2/v2TransparentRenderingOrder";
import type { StageSpatialSession } from "../../../src/world/stageSpatialContext";
import { createDynamicStageSpatialQueryFixture } from "../T05/stageSpatialQueryFixture";
import { assert, executeTest, type T06TestResult } from "./testUtils";

type Rgb = readonly [number, number, number];
type Layer = Readonly<{ color: Rgb; alpha: number }>;
const BLACK: Rgb = [0, 0, 0];
const RED: Rgb = [1, 0, 0];
const GREEN: Rgb = [0, 1, 0];
const BLUE: Rgb = [0, 0, 1];

// GPU の描画順や render target から導出しない、通常の source-over の参照式。
// 引数は奥から手前。8 bit 出力直前まで線形 RGB のまま計算する。
const sourceOver = (background: Rgb, layers: readonly Layer[]): Rgb => {
  let result: Rgb = background;
  for (const layer of layers) {
    result = result.map((value, channel) =>
      layer.color[channel] * layer.alpha + value * (1 - layer.alpha)
    ) as unknown as Rgb;
  }
  return result;
};

const createFlatMaterial = (
  name: string, color: Rgb, alpha: number, scene: Scene
): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.FromArray(color);
  material.alpha = alpha;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  return material;
};

const createLayer = (
  scene: Scene, name: string, color: Rgb, alpha: number, z: number
) => {
  const mesh = MeshBuilder.CreatePlane(name, { size: 4 }, scene);
  const material = createFlatMaterial(`${name}_material`, color, alpha, scene);
  mesh.material = material;
  mesh.position.z = z;
  return { mesh, material };
};

const createGpuFixture = (
  width = 96, height = width, background: Rgb = BLACK
) => {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  // MSAA の輪郭画素を混ぜず、pixel center の幾何と合成式を照合する。
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false }, false);
  engine.setSize(width, height);
  const scene = new Scene(engine);
  const { renderer } = configureV2TransparentDepthComposition(scene);
  scene.imageProcessingConfiguration.isEnabled = false;
  scene.clearColor = new Color4(...background, 1);
  const camera = new FreeCamera("透明合成検証camera", new Vector3(0, 0, -5), scene);
  camera.setTarget(Vector3.Zero());
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoLeft = -1; camera.orthoRight = 1;
  camera.orthoTop = 1; camera.orthoBottom = -1;
  camera.minZ = 0.01; camera.maxZ = 100;
  scene.activeCamera = camera;
  const backdrop = createLayer(scene, "不透明背景", background, 1, 8);
  backdrop.mesh.scaling.setAll(10);
  backdrop.material.transparencyMode = Material.MATERIAL_OPAQUE;
  return { engine, scene, camera, renderer, backdrop };
};

type GpuFixture = ReturnType<typeof createGpuFixture>;
const renderImage = async (fixture: GpuFixture): Promise<Uint8Array> => {
  await fixture.scene.whenReadyAsync();
  // prepass と専用 Effect の初回生成、材質再コンパイルを実際の描画経路で完了する。
  for (let frame = 0; frame < 3; frame++) {
    fixture.scene.render();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const pixels = await fixture.engine.readPixels(
    0, 0, fixture.engine.getRenderWidth(), fixture.engine.getRenderHeight(), true, true
  );
  return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
};

const assertImage = (
  fixture: GpuFixture, pixels: Uint8Array,
  expectedAt: (x: number, y: number) => Rgb, label: string, tolerance = 2
) => {
  const width = fixture.engine.getRenderWidth();
  const height = fixture.engine.getRenderHeight();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const expected = expectedAt(x, y);
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const byte = Math.round(expected[channel] * 255);
        assert(Math.abs(pixels[offset + channel] - byte) <= tolerance,
          `${label}: (${x}, ${y}) channel=${channel}, actual=${pixels[offset + channel]}, expected=${byte}`);
      }
      assert(pixels[offset + 3] === 255, `${label}: (${x}, ${y}) の背景 alpha が保持されません。`);
    }
  }
};

const configureGlass = (glass: ReturnType<typeof createLayer>) => {
  glass.material.name = V2_STAGE_WINDOW_GLASS_MATERIAL_NAME;
  configureV2StageTransparentRenderingOrder([glass.mesh]);
};

export const runStageTransparentRenderingOrderTests = async (): Promise<readonly T06TestResult[]> => {
  const results = await Promise.all([
    executeTest("Stage窓・カーテンの材質契約と画素深度合成の接続", async () => {
      const fixture = createGpuFixture();
      const { scene, engine } = fixture;
      try {
        const firstGlass = createLayer(scene, "通常窓", BLUE, 0.28, 0);
        const bridgeGlass = createLayer(scene, "体育館連絡通路窓", BLUE, 0.28, 0.5);
        firstGlass.material.name = V2_STAGE_WINDOW_GLASS_MATERIAL_NAME;
        bridgeGlass.mesh.material = firstGlass.material;
        const curtain = createLayer(scene, "保健室カーテン", GREEN, 0.96, 1);
        curtain.material.name = "MAT_B03_InfirmaryCurtain";
        assert(firstGlass.mesh.alphaIndex === Number.MAX_VALUE && bridgeGlass.mesh.alphaIndex === Number.MAX_VALUE,
          "窓ガラスの初期 alphaIndex が Babylon 既定値ではありません。");
        configureV2StageTransparentRenderingOrder([
          firstGlass.mesh, bridgeGlass.mesh, curtain.mesh, fixture.backdrop.mesh
        ]);
        for (const mesh of [firstGlass.mesh, bridgeGlass.mesh, curtain.mesh]) {
          assert(mesh.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_SPATIAL,
            `${mesh.name} の空間半透明分類が設定されません。`);
          assert(!mesh.material!.needDepthPrePass && !mesh.material!.forceDepthWrite,
            `${mesh.name} が後方を消す深度書込みを要求しています。`);
        }
        assert(fixture.backdrop.mesh.alphaIndex === Number.MAX_VALUE,
          "不透明背景まで半透明分類へ移されています。");
        assert(scene.useOrderIndependentTransparency && scene.depthPeelingRenderer === fixture.renderer,
          "本番の透明深度合成 renderer が接続されていません。");
        const pixels = await renderImage(fixture);
        const expected = sourceOver(BLACK, [
          { color: GREEN, alpha: 0.96 }, { color: BLUE, alpha: 0.28 }, { color: BLUE, alpha: 0.28 }
        ]);
        assertImage(fixture, pixels, () => expected, "通常窓・連絡通路窓・カーテン");
        return "窓2種とカーテンの材質/index契約、不透明分類、専用renderer接続と全画素 source-over を確認";
      } finally { scene.dispose(); engine.dispose(); }
    }),
    executeTest("Stage窓ガラスMaterial契約違反の拒否", () => {
      const engine = new NullEngine(); const scene = new Scene(engine);
      try {
        let missingRejected = false;
        try { configureV2StageTransparentRenderingOrder([]); } catch { missingRejected = true; }
        const opaqueGlass = MeshBuilder.CreatePlane("非透過の窓", { size: 1 }, scene);
        opaqueGlass.material = new StandardMaterial(V2_STAGE_WINDOW_GLASS_MATERIAL_NAME, scene);
        let opaqueRejected = false;
        try { configureV2StageTransparentRenderingOrder([opaqueGlass]); } catch { opaqueRejected = true; }
        assert(missingRejected && opaqueRejected, "窓材質の欠落または非 alpha blend が拒否されません。");
        return "Material 0件と非 alpha blend を契約違反として拒否";
      } finally { scene.dispose(); engine.dispose(); }
    }),
    executeTest("不透明面と窓・カーテンの奥行きWebGL描画", async () => {
      const fixture = createGpuFixture(); const { scene, engine } = fixture;
      try {
        // 実 BIT は別回帰が所有する。ここでは不透明面との深度契約を独立に検証する。
        const opaque = createLayer(scene, "不透明赤面", RED, 1, 0);
        opaque.material.transparencyMode = Material.MATERIAL_OPAQUE;
        const curtain = createLayer(scene, "カーテン", GREEN, 0.5, -0.25);
        const glass = createLayer(scene, "窓", BLUE, 0.5, -0.5); configureGlass(glass);
        configureV2StageTransparentRenderingOrder([opaque.mesh, curtain.mesh, glass.mesh]);
        assert(!opaque.material.needAlphaBlendingForMesh(opaque.mesh), "不透明面が半透明 queue に入っています。");
        assertImage(fixture, await renderImage(fixture), () => sourceOver(RED, [
          { color: GREEN, alpha: 0.5 }, { color: BLUE, alpha: 0.5 }
        ]), "ガラス手前");
        curtain.mesh.position.z = -0.75;
        assertImage(fixture, await renderImage(fixture), () => sourceOver(RED, [
          { color: BLUE, alpha: 0.5 }, { color: GREEN, alpha: 0.5 }
        ]), "カーテン手前");
        opaque.mesh.position.z = -1;
        assertImage(fixture, await renderImage(fixture), () => RED, "不透明面手前");
        return "窓・カーテンの入替えと不透明面による遮蔽を全画素の線形合成式で確認";
      } finally { scene.dispose(); engine.dispose(); }
    }),
    executeTest("光と窓ガラスの距離順WebGL描画", async () => {
      const background: Rgb = [0.02, 0.06, 0.03];
      const fixture = createGpuFixture(96, 96, background); const { scene, engine } = fixture;
      try {
        const glass = createLayer(scene, "窓", BLUE, 0.35, 0.5); configureGlass(glass);
        const light = createLayer(scene, "光", RED, 0.55, 0);
        light.mesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
        assertImage(fixture, await renderImage(fixture), () => sourceOver(background, [
          { color: BLUE, alpha: 0.35 }, { color: RED, alpha: 0.55 }
        ]), "光手前でも奥ガラスが寄与");
        glass.mesh.position.z = 0; light.mesh.position.z = 0.5;
        assertImage(fixture, await renderImage(fixture), () => sourceOver(background, [
          { color: RED, alpha: 0.55 }, { color: BLUE, alpha: 0.35 }
        ]), "ガラス手前でも奥光が寄与");
        return "alphaIndex の大小に関係なく、光とガラスの前後両方向を全画素 source-over で確認";
      } finally { scene.dispose(); engine.dispose(); }
    }),
    executeTest("光線と窓ガラスの交差・逆視点WebGL深度合成", async () => {
      const fixture = createGpuFixture(128); const { scene, engine, camera } = fixture;
      try {
        const glass = createLayer(scene, "交差する窓", BLUE, 0.6, 0); configureGlass(glass);
        const light = createLayer(scene, "交差する光", RED, 0.55, 0);
        light.mesh.position.x = 0.25;
        light.mesh.rotation.y = Math.PI / 4;
        light.mesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
        for (const reverse of [false, true]) {
          camera.position.z = reverse ? 5 : -5; camera.setTarget(Vector3.Zero());
          fixture.backdrop.mesh.position.z = reverse ? -8 : 8;
          assertImage(fixture, await renderImage(fixture), (x) => {
            const screenX = ((x + 0.5) / 128) * 2 - 1;
            const worldX = reverse ? -screenX : screenX;
            const lightZ = -(worldX - 0.25);
            const lightInFront = reverse ? lightZ > 0 : lightZ < 0;
            const glassLayer = { color: BLUE, alpha: 0.6 };
            const lightLayer = { color: RED, alpha: 0.55 };
            return sourceOver(BLACK, lightInFront ? [glassLayer, lightLayer] : [lightLayer, glassLayer]);
          }, reverse ? "逆視点の交差" : "正面の交差");
        }
        return "交差面の各pixelの深度を解析し、両側・裏側視点も全画素で確認";
      } finally { scene.dispose(); engine.dispose(); }
    }),
    executeTest("35層・Character・片面性・alpha0・端pixel・resize・破棄のWebGL回帰", async () => {
      const background: Rgb = [0.04, 0.04, 0.04];
      const fixture = createGpuFixture(127, 95, background); const { scene, engine, renderer } = fixture;
      const layers: ReturnType<typeof createLayer>[] = [];
      let disposed = false;
      try {
        const colors: readonly Rgb[] = [[0.9, 0.1, 0.2], [0.15, 0.85, 0.3], [0.2, 0.3, 0.95]];
        const reference: Layer[] = [];
        for (let index = 34; index >= 0; index--) {
          const color = colors[index % colors.length];
          const layer = createLayer(scene, `低alpha層${index}`, color, 0.08, 1 + index * 0.12);
          layer.mesh.alphaIndex = index % 2 === 0 ? 0 : 999;
          layers.push(layer); reference.push({ color, alpha: 0.08 });
        }
        const expectedDense = sourceOver(background, reference);
        assertImage(fixture, await renderImage(fixture), () => expectedDense, "35色別層");
        const densePassCount = renderer.lastPassCount;
        assert(densePassCount >= 18, `35層が完走していません: passes=${densePassCount}`);
        const character = createLayer(scene, "旧forceDepthWriteのCharacter", GREEN, 0.9, 0.3);
        character.material.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
        character.material.alphaCutOff = 0.01; character.material.forceDepthWrite = true;
        character.mesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER;
        const expectedCharacter = sourceOver(expectedDense, [{ color: GREEN, alpha: 0.9 }]);
        const invisible: ReturnType<typeof createLayer>[] = [];
        for (let index = 0; index < 24; index++) {
          invisible.push(createLayer(scene, `alpha0層${index}`, RED, 0, -1 + index * 0.02));
        }
        assertImage(fixture, await renderImage(fixture), () => expectedCharacter, "Characterとalpha0層");
        const alphaZeroPassCount = renderer.lastPassCount;
        for (const layer of invisible) layer.mesh.setEnabled(false);
        assertImage(fixture, await renderImage(fixture), () => expectedCharacter, "alpha0面を非表示");
        assert(alphaZeroPassCount === renderer.lastPassCount,
          "alpha0面が深度層を消費しています。");
        assert(character.material.forceDepthWrite, "Character本来の材質設定が書き換えられました。");
        const oneSided = createLayer(scene, "片面の赤", RED, 0.5, -0.5);
        oneSided.material.backFaceCulling = true; oneSided.mesh.rotation.y = Math.PI;
        assertImage(fixture, await renderImage(fixture), () => expectedCharacter, "片面の背面は非描画");
        assert(oneSided.material.backFaceCulling, "rendererが片面材質を両面へ変更しました。");
        oneSided.mesh.rotation.y = 0;
        const expectedFront = sourceOver(expectedCharacter, [{ color: RED, alpha: 0.5 }]);
        assertImage(fixture, await renderImage(fixture), () => expectedFront, "片面の表面は描画");
        engine.setSize(191, 107);
        assertImage(fixture, await renderImage(fixture), () => expectedFront, "端数resize後も全層を維持");
        for (const layer of [...layers, character, oneSided]) layer.mesh.setEnabled(false);
        const cornerLayers: ReturnType<typeof createLayer>[] = [];
        const cornerReference: Layer[] = [];
        for (let index = 13; index >= 0; index--) {
          const color = index % 2 === 0 ? RED : BLUE;
          const layer = createLayer(scene, `端の14層${index}`, color, 0.12, 1 + index * 0.12);
          layer.mesh.scaling.set(1.5 / (4 * 191), 1.5 / (4 * 107), 1);
          cornerLayers.push(layer); cornerReference.push({ color, alpha: 0.12 });
        }
        const expectedCorner = sourceOver(background, cornerReference);
        for (const [cornerX, cornerY] of [[0, 0], [190, 0], [0, 106], [190, 106]]) {
          for (const layer of cornerLayers) {
            layer.mesh.position.x = -1 + (cornerX + 0.5) * 2 / 191;
            layer.mesh.position.y = -1 + (cornerY + 0.5) * 2 / 107;
          }
          assertImage(fixture, await renderImage(fixture), (x, y) =>
            x === cornerX && y === cornerY ? expectedCorner : background,
          `画面端(${cornerX},${cornerY})だけの残層`);
          assert(renderer.lastPassCount >= 7, "端の単独pixelの残層が空と判定されました。");
        }
        for (const layer of cornerLayers) layer.mesh.setEnabled(false);
        assertImage(fixture, await renderImage(fixture), () => background, "透明物のないframe");
        assert(renderer.lastPassCount === 0, "透明物のないframeに前frameの層が残りました。");
        scene.dispose(); disposed = true;
        assert(engine._renderTargetWrapperCache.length === 0,
          "Scene破棄後にdepth peelingまたは縮約render targetが残っています。");
        return `35層=${densePassCount} pass、24枚のalpha0は層を消費せず、Character・片面・191×107・4隅1pixel・空frame・RT全解放を確認`;
      } finally { if (!disposed) scene.dispose(); engine.dispose(); }
    }),
    executeTest("実player-gun InstanceのFPS同軸本体と前後ガラスの合成", async () => {
      const background: Rgb = [0.04, 0.04, 0.04];
      const fixture = createGpuFixture(128, 128, background); const { scene, engine, camera } = fixture;
      camera.mode = Camera.PERSPECTIVE_CAMERA; camera.position.set(0, 0, -1);
      camera.setTarget(new Vector3(0, 0, 1)); camera.fov = Math.PI / 3; camera.minZ = 0.02;
      const movementColliders = { player: [], npc: [], bit: [] };
      const spatialFixture = createDynamicStageSpatialQueryFixture(scene, {
        movementColliders, groundColliders: [], beamBlockers: [], sightBlockers: [], bitObstacles: []
      }, { volumes: [] });
      const stage = {
        resources: { beamBlockers: [], sightBlockers: [] }, worldBoundary: null, queries: spatialFixture.queries
      } as unknown as StageSpatialSession;
      let showOrbs = false;
      const system = createV2BeamSystem({ scene, stage, getHumanTargets: () => [], random: () => 0.5,
        getOrbVisibilityPredicate: () => () => showOrbs });
      try {
        const glassColor: Rgb = [0.15, 0.55, 1]; const glassAlpha = 0.65;
        const glass = createLayer(scene, "FPS窓", glassColor, glassAlpha, 0.1); configureGlass(glass);
        glass.mesh.setEnabled(false);
        await system.prepareVisualResources();
        const beamId = system.spawn({ sourceId: "fixture-player", originKind: "player-gun",
          targetPolicy: { kind: "alive-humans" }, origin: new Vector3(0, 0, -0.9),
          direction: Vector3.Forward(), speed: 1.58, maximumLifetime: 2 });
        system.update(0.5);
        const tip = scene.getMeshByName(`${beamId}-tip`) as InstancedMesh;
        tip.setEnabled(false);
        const bodyOnly = await renderImage(fixture);
        const centerOffset = (64 * 128 + 64) * 4;
        const rimOffset = (64 * 128 + 67) * 4;
        assert(bodyOnly[centerOffset] > bodyOnly[centerOffset + 1] + 20 &&
          bodyOnly[rimOffset] > bodyOnly[rimOffset + 1] + 8,
        `先端球を隠すとFPS本体が消えます: center=${Array.from(bodyOnly.slice(centerOffset,centerOffset+4))}, rim=${Array.from(bodyOnly.slice(rimOffset,rimOffset+4))}`);
        showOrbs = true;
        tip.setEnabled(true);
        system.update(0.075);
        system.update(0.005);
        assert(scene.meshes.some((mesh) =>
          mesh.name === `${beamId}-trail` && mesh instanceof InstancedMesh &&
          mesh.isEnabled() && mesh.instancedBuffers.instanceColor.a > 0
        ), "実player-gunの有効なtrailを生成できていません。");
        const baseline = await renderImage(fixture);
        const visualMaterial = scene.getMaterialByName("v2NormalBeamMaterial") as StandardMaterial;
        const beamColor = visualMaterial.emissiveColor.asArray() as unknown as Rgb;
        const baselineAt = (x: number, y: number): Rgb => {
          const offset = (y * 128 + x) * 4;
          return [baseline[offset] / 255, baseline[offset + 1] / 255, baseline[offset + 2] / 255];
        };
        // 同じ色の body/tip/trail の累積透過率を単独描画から測定し、
        // 背景を差し替えた時の RGB は source-over だけで予測する。
        const opacityAt = (x: number, y: number) => Math.max(0, Math.min(1,
          (baselineAt(x, y)[0] - background[0]) / (beamColor[0] - background[0])
        ));
        assertImage(fixture, baseline, (x, y) => sourceOver(background, [
          { color: beamColor, alpha: opacityAt(x, y) }
        ]), "実body/tip/trailの色と透過率");
        glass.mesh.setEnabled(true);
        const glassBackground = sourceOver(background, [{ color: glassColor, alpha: glassAlpha }]);
        const behind = await renderImage(fixture);
        assertImage(fixture, behind, (x, y) => sourceOver(glassBackground, [
          { color: beamColor, alpha: opacityAt(x, y) }
        ]), "実光線越しの奥ガラス");
        assert(Math.abs(behind[centerOffset + 2] - baseline[centerOffset + 2]) > 2,
          "奥ガラスがbaselineから消えています。");
        glass.mesh.position.z = -0.97;
        assertImage(fixture, await renderImage(fixture), (x, y) => sourceOver(baselineAt(x, y), [
          { color: glassColor, alpha: glassAlpha }
        ]), "実光線より手前のガラス");
        glass.mesh.position.z = 0.1;
        for (const mesh of scene.meshes) {
          if (mesh.name.startsWith(`${beamId}-`) && mesh instanceof InstancedMesh) {
            mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 0);
          }
        }
        assertImage(fixture, await renderImage(fixture), () => glassBackground, "instance alpha0後はガラスのみ");
        const body = scene.getMeshByName(`${beamId}-body`) as InstancedMesh;
        assert(body instanceof InstancedMesh && tip instanceof InstancedMesh,
          "実player-gunのbody/tip Instanceを検証していません。");
        const positions = body.sourceMesh.getVerticesData(VertexBuffer.PositionKind)!;
        const colors = body.sourceMesh.getVerticesData(VertexBuffer.ColorKind)!;
        const topRadii: number[] = []; const bottomRadii: number[] = [];
        for (let index = 0; index < positions.length; index += 3) {
          const radius = Math.hypot(positions[index], positions[index + 2]);
          (positions[index + 1] > 0 ? topRadii : bottomRadii).push(radius);
        }
        assert(Math.abs(Math.max(...topRadii) * 2 - V2_NORMAL_BEAM_FRONT_DIAMETER) < 1e-5 &&
          Math.abs(Math.max(...bottomRadii) * 2 - V2_NORMAL_BEAM_BACK_DIAMETER) < 1e-5 &&
          body.scaling.y <= V2_NORMAL_BEAM_MAX_BODY_LENGTH + 1e-6 &&
          Math.abs(tip.sourceMesh.getBoundingInfo().boundingBox.extendSize.y * 2 - V2_NORMAL_BEAM_TIP_DIAMETER) < 1e-5 &&
          colors.some((value, index) => index % 4 === 3 && value === 0) &&
          colors.some((value, index) => index % 4 === 3 && value === 1),
        "実光線の寸法・先端球・末尾vertex alpha契約が変わっています。");
        assert(visualMaterial.transparencyMode === Material.MATERIAL_ALPHABLEND &&
          !visualMaterial.forceDepthWrite && !visualMaterial.needDepthPrePass &&
          scene.getMaterialByName("v2NormalBeamDepthMaterial") === null &&
          !scene.meshes.some((mesh) => mesh.name.startsWith(`${beamId}-`) && mesh.name.endsWith("-depth")),
        "光線に背景を消す深度proxyが残っています。");
        return "実FPS本体単独・縁・body/tip/trail・前後ガラス全画素・instance alpha0・寸法/末尾alpha・proxy撤去を確認";
      } finally { system.dispose(); spatialFixture.dispose(); scene.dispose(); engine.dispose(); }
    }),
    executeTest("実命中orbの事前compile後の遅延生成とinstance alpha0", async () => {
      const background: Rgb = [0.04, 0.04, 0.04];
      const fixture = createGpuFixture(96, 96, background);
      const { scene, engine, camera } = fixture;
      camera.orthoLeft = -0.12; camera.orthoRight = 0.12;
      camera.orthoBottom = -0.12; camera.orthoTop = 0.12;
      const system = createV2HitEffectSystem({
        scene, random: () => 0.5, isIndirectLightVisible: () => false,
        resolveVisualEnvelope: (target) => ({
          center: target.hitShape.center.clone(), width: 0.04, height: 0.04
        })
      });
      try {
        const glass = createLayer(scene, "命中orbの奥窓", BLUE, 0.35, 0.3);
        configureGlass(glass);
        const glassBackground = sourceOver(background, [{ color: BLUE, alpha: 0.35 }]);
        assert(system.getVisualPoolSnapshot().orb.capacity === 0,
          "事前compileより前にorb Instanceが生成されています。");
        await system.prepareVisualResources();
        assertImage(fixture, await renderImage(fixture), () => glassBackground, "orb生成前の奥窓");
        const target: V2HumanTargetSnapshot = {
          id: "命中orb検証player", kind: "player", state: "normal", alive: true, brainwashed: false,
          footPosition: new Vector3(0, -0.24, 0), aimPosition: Vector3.Zero(),
          hitShape: { center: Vector3.Zero(), radii: new Vector3(0.1, 0.24, 0.1) }
        };
        assert(system.start(target), "実命中演出を開始できません。");
        system.update(V2_HIT_FLICKER_DURATION_SECONDS,
          [{ ...target, state: "hit-a", alive: false }], () => true);
        for (const mesh of scene.meshes) {
          if (mesh.name.startsWith("v2-hit-effect-shell-")) mesh.setEnabled(false);
        }
        const orbs = scene.meshes.filter((mesh): mesh is InstancedMesh =>
          mesh instanceof InstancedMesh && mesh.name.startsWith("v2-hit-effect-orb-") && mesh.isEnabled()
        );
        assert(orbs.length === 13, `実命中orbの遅延生成数が不正です: ${orbs.length}`);
        const visible = await renderImage(fixture);
        assert(visible.some((value, index) =>
          index % 4 === 0 && value > Math.round(glassBackground[0] * 255) + 20
        ), "遅延生成した命中orbが画面に現れません。");
        for (const orb of orbs) orb.instancedBuffers.instanceColor = new Color4(1, 1, 1, 0);
        assertImage(fixture, await renderImage(fixture), () => glassBackground,
          "実命中orbのinstance alpha0後は奥窓だけ");
        return "0 Instanceで事前compile→実命中から13 orbを遅延生成→可視pixel確認→alpha0で全pixelが奥窓へ戻る";
      } finally { system.dispose(); scene.dispose(); engine.dispose(); }
    })
  ]);
  // factoryの消去通知は同時実行中の別GPU試験へ影響するので、前段完了後に発火する。
  results.push(await executeTest("Engine終了通知後の材質factory再登録", async () => {
    for (const iteration of [1, 2]) {
      const fixture = createGpuFixture(); const { scene, engine, renderer } = fixture;
      try {
        createLayer(scene, "可視の赤", RED, 0.5, 0);
        createLayer(scene, "可視の青", BLUE, 0.5, 0.5);
        const expected = sourceOver(BLACK, [{ color: BLUE, alpha: 0.5 }, { color: RED, alpha: 0.5 }]);
        assertImage(fixture, await renderImage(fixture), () => expected, `Engine${iteration}の可視2層`);
        const visiblePassCount = renderer.lastPassCount;
        for (let index = 0; index < 24; index++) {
          createLayer(scene, `再生成後alpha0層${index}`, GREEN, 0, -1 + index * 0.02);
        }
        assertImage(fixture, await renderImage(fixture), () => expected, `Engine${iteration}のalpha0追加後`);
        assert(renderer.lastPassCount === visiblePassCount,
          `Engine${iteration}でalpha0面が深度層を消費: before=${visiblePassCount}, after=${renderer.lastPassCount}`);
      } finally { scene.dispose(); engine.dispose(); }
      // Babylon 6.49のNullEngineはInstancesへ二重登録されるため、既存の
      // NullEngine fixture後は最後の破棄通知が自動発火しない。既存参照を
      // 削除せず、本番が受け取る同じ公開通知をここで明示的に発火する。
      EngineStore.OnEnginesDisposedObservable.notifyObservers(engine);
    }
    return "実Engine破棄＋factory消去通知→新Engineを通し、両方で24枚のalpha0のpixel寄与/追加peelが0";
  }));
  return results;
};
