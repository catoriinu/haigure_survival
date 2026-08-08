import {
  Camera,
  Color3,
  Color4,
  Engine,
  FreeCamera,
  InstancedMesh,
  Material,
  Mesh,
  MeshBuilder,
  NullEngine,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import {
  V2_NORMAL_BEAM_BACK_DIAMETER,
  V2_NORMAL_BEAM_FRONT_DIAMETER,
  V2_NORMAL_BEAM_MAX_BODY_LENGTH,
  V2_NORMAL_BEAM_TIP_DIAMETER,
  createV2BeamSystem
} from "../../../src/v2/beamCollision";
import {
  V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
  configureV2StageTransparentRenderingOrder
} from "../../../src/v2/v2StageTransparentRenderingOrder";
import {
  V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR,
  V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH,
  V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_SPATIAL
} from "../../../src/v2/v2TransparentRenderingOrder";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import { createDynamicStageSpatialQueryFixture } from "../T05/stageSpatialQueryFixture";
import { assert, executeTest, type T06TestResult } from "./testUtils";

const approximately = (
  actual: number,
  expected: number,
  tolerance: number
) => Math.abs(actual - expected) <= tolerance;

const createFlatMaterial = (
  name: string,
  color: Color3,
  alpha: number,
  scene: Scene
): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = color;
  material.alpha = alpha;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  return material;
};

class FixtureBeamDepthMaterial extends StandardMaterial {
  protected override _hasAlphaChannel(): boolean {
    return true;
  }
}

const createBeamDepthMaterial = (
  name: string,
  scene: Scene
): StandardMaterial => {
  const material = new FixtureBeamDepthMaterial(name, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = new Color3(1, 0.18, 0.74);
  material.alpha = 0.55;
  material.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
  material.alphaCutOff = 0.1;
  material.disableColorWrite = true;
  material.forceDepthWrite = true;
  return material;
};

const readCenterPixel = async (
  engine: Engine,
  size: number
): Promise<readonly [number, number, number, number]> => {
  const pixels = await engine.readPixels(0, 0, size, size, true, true);
  const bytes = new Uint8Array(
    pixels.buffer,
    pixels.byteOffset,
    pixels.byteLength
  );
  const coordinate = Math.floor(size / 2);
  const offset = (coordinate * size + coordinate) * 4;
  return Object.freeze([
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number
  ]);
};

const readPixel = async (
  engine: Engine,
  size: number,
  x: number,
  y: number
): Promise<readonly [number, number, number, number]> => {
  const pixels = await engine.readPixels(0, 0, size, size, true, true);
  const bytes = new Uint8Array(
    pixels.buffer,
    pixels.byteOffset,
    pixels.byteLength
  );
  const offset = (y * size + x) * 4;
  return Object.freeze([
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number
  ]);
};

export const runStageTransparentRenderingOrderTests = async (): Promise<
  readonly T06TestResult[]
> =>
  Promise.all([
    executeTest("Stage窓ガラスの空間半透明index統一", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const glassMaterial = createFlatMaterial(
          V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
          new Color3(0, 0, 1),
          0.28,
          scene
        );
        const firstGlass = MeshBuilder.CreatePlane(
          "VIS_WindowGlass_fixture",
          { size: 1 },
          scene
        );
        const bridgeGlass = MeshBuilder.CreatePlane(
          "VIS_B03_GymBridgeWindowGlass_fixture",
          { size: 1 },
          scene
        );
        firstGlass.material = glassMaterial;
        bridgeGlass.material = glassMaterial;

        const otherTransparent = MeshBuilder.CreatePlane(
          "VIS_InfirmaryCurtain_fixture",
          { size: 1 },
          scene
        );
        otherTransparent.material = createFlatMaterial(
          "MAT_B03_InfirmaryCurtain",
          new Color3(0, 1, 0),
          0.96,
          scene
        );
        const opaque = MeshBuilder.CreatePlane(
          "VIS_Wall_fixture",
          { size: 1 },
          scene
        );
        opaque.material = new StandardMaterial("MAT_Wall_fixture", scene);

        assert(
          firstGlass.alphaIndex === Number.MAX_VALUE &&
            bridgeGlass.alphaIndex === Number.MAX_VALUE,
          "Stage窓ガラスの初期alphaIndexがBabylon既定値ではありません。"
        );
        configureV2StageTransparentRenderingOrder([
          firstGlass,
          bridgeGlass,
          otherTransparent,
          opaque
        ]);
        assert(
          firstGlass.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
            bridgeGlass.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
            otherTransparent.alphaIndex === Number.MAX_VALUE &&
            opaque.alphaIndex === Number.MAX_VALUE &&
            V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER <
              V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR <
              V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH <
              V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
            V2_TRANSPARENT_ALPHA_INDEX_SPATIAL <
              V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER &&
            !scene.useOrderIndependentTransparency,
          "窓ガラスだけの空間半透明indexまたはCharacter順が不正です。"
        );
        return "通常窓・体育館連絡通路窓=spatial、beam color=150、beam depth=160、非対象Materialは既定値を維持、OIT=無効";
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("Stage窓ガラスMaterial契約違反の拒否", () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        let missingRejected = false;
        try {
          configureV2StageTransparentRenderingOrder([]);
        } catch {
          missingRejected = true;
        }

        const opaqueGlass = MeshBuilder.CreatePlane(
          "VIS_WindowGlass_opaque_fixture",
          { size: 1 },
          scene
        );
        opaqueGlass.material = new StandardMaterial(
          V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
          scene
        );
        let opaqueRejected = false;
        try {
          configureV2StageTransparentRenderingOrder([opaqueGlass]);
        } catch {
          opaqueRejected = true;
        }
        assert(
          missingRejected && opaqueRejected,
          "窓ガラスMaterial欠落または非alpha blendが拒否されません。"
        );
        return "Material 0件と非alpha blendを契約違反として拒否";
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("光と窓ガラスの距離順WebGL描画", async () => {
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const engine = new Engine(
        canvas,
        true,
        { preserveDrawingBuffer: true, stencil: false },
        false
      );
      engine.setSize(size, size);
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0, 0, 0, 1);
      const camera = new FreeCamera(
        "fixture-stage-transparency-camera",
        new Vector3(0, 0, -5),
        scene
      );
      camera.setTarget(Vector3.Zero());
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = -1;
      camera.orthoRight = 1;
      camera.orthoTop = 1;
      camera.orthoBottom = -1;
      camera.minZ = 0.1;
      camera.maxZ = 10;
      scene.activeCamera = camera;

      try {
        const glass = MeshBuilder.CreatePlane(
          "VIS_WindowGlass_gpu_fixture",
          { size: 2 },
          scene
        );
        glass.material = createFlatMaterial(
          V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
          new Color3(0, 0, 1),
          0.8,
          scene
        );
        glass.position.z = 0.5;

        const light = MeshBuilder.CreatePlane(
          "V2CombatLight_gpu_fixture",
          { size: 2 },
          scene
        );
        light.material = createFlatMaterial(
          "V2CombatLightMaterial_gpu_fixture",
          new Color3(1, 0, 0),
          0.8,
          scene
        );
        light.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
        light.position.z = 0;
        const lightDepth = light.clone(
          "V2CombatLightDepth_gpu_fixture",
          light
        );
        lightDepth.position.setAll(0);
        lightDepth.rotation.setAll(0);
        lightDepth.scaling.setAll(1);
        lightDepth.material = createBeamDepthMaterial(
          "V2CombatLightDepthMaterial_gpu_fixture",
          scene
        );
        lightDepth.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;

        configureV2StageTransparentRenderingOrder([glass]);
        await scene.whenReadyAsync();
        scene.render();
        const lightInFront = await readCenterPixel(engine, size);
        assert(
          lightInFront[0] > lightInFront[2] + 80 &&
            lightInFront[2] < 20,
          `光が手前の透過合成が不正です: ${JSON.stringify(lightInFront)}`
        );

        glass.position.z = 0;
        light.position.z = 0.5;
        glass.computeWorldMatrix(true);
        light.computeWorldMatrix(true);
        scene.render();
        const glassInFront = await readCenterPixel(engine, size);
        assert(
          glassInFront[2] > glassInFront[0] + 80 &&
            glassInFront[0] > 20,
          `ガラスが手前の透過合成が不正です: ${JSON.stringify(glassInFront)}`
        );
        return `光手前=${JSON.stringify(
          lightInFront
        )}、ガラス手前=${JSON.stringify(glassInFront)}`;
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("光線が窓ガラスを横切るWebGL深度合成", async () => {
      const size = 128;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const engine = new Engine(
        canvas,
        true,
        { preserveDrawingBuffer: true, stencil: false },
        false
      );
      engine.setSize(size, size);
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0, 0, 0, 1);
      const camera = new FreeCamera(
        "fixture-stage-crossing-transparency-camera",
        new Vector3(0, 0, -5),
        scene
      );
      camera.setTarget(Vector3.Zero());
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      camera.orthoLeft = -1;
      camera.orthoRight = 1;
      camera.orthoTop = 1;
      camera.orthoBottom = -1;
      camera.minZ = 0.1;
      camera.maxZ = 10;
      scene.activeCamera = camera;

      try {
        const glass = MeshBuilder.CreatePlane(
          "VIS_WindowGlass_crossing_gpu_fixture",
          { size: 2 },
          scene
        );
        glass.material = createFlatMaterial(
          V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
          new Color3(0, 0, 1),
          0.8,
          scene
        );

        const crossingLight = MeshBuilder.CreatePlane(
          "V2CombatLight_crossing_gpu_fixture",
          { size: 2 },
          scene
        );
        crossingLight.material = createFlatMaterial(
          "V2CombatLightMaterial_crossing_gpu_fixture",
          new Color3(1, 0, 0),
          0.8,
          scene
        );
        crossingLight.alphaIndex =
          V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
        crossingLight.rotation.y = Math.PI / 4;
        const crossingLightDepth = crossingLight.clone(
          "V2CombatLightDepth_crossing_gpu_fixture",
          crossingLight
        );
        crossingLightDepth.position.setAll(0);
        crossingLightDepth.rotation.setAll(0);
        crossingLightDepth.scaling.setAll(1);
        crossingLightDepth.material = createBeamDepthMaterial(
          "V2CombatLightDepthMaterial_crossing_gpu_fixture",
          scene
        );
        crossingLightDepth.alphaIndex =
          V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;

        configureV2StageTransparentRenderingOrder([glass]);
        await scene.whenReadyAsync();
        scene.render();

        const left = await readPixel(
          engine,
          size,
          Math.floor(size * 0.35),
          Math.floor(size / 2)
        );
        const right = await readPixel(
          engine,
          size,
          Math.floor(size * 0.65),
          Math.floor(size / 2)
        );
        assert(
          left[2] > left[0] + 80 &&
            left[0] > 20 &&
            right[0] > right[2] + 80 &&
            right[2] < 20,
          `交差する光とガラスがピクセル深度順に合成されません: left=${JSON.stringify(
            left
          )}, right=${JSON.stringify(right)}`
        );
        return `奥側=${JSON.stringify(left)}、手前側=${JSON.stringify(right)}`;
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest(
      "実ビーム形状・両面ガラス・Character・密集trailのWebGL回帰",
      async () => {
        const size = 192;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const engine = new Engine(
          canvas,
          true,
          { preserveDrawingBuffer: true, stencil: false },
          false
        );
        engine.setSize(size, size);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.04, 0.04, 0.04, 1);
        const camera = new FreeCamera(
          "fixture-dense-beam-transparency-camera",
          new Vector3(0, 0, -5),
          scene
        );
        camera.setTarget(Vector3.Zero());
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        camera.orthoLeft = -1.5;
        camera.orthoRight = 1.5;
        camera.orthoTop = 1;
        camera.orthoBottom = -1;
        camera.minZ = 0.02;
        camera.maxZ = 10;
        scene.activeCamera = camera;

        try {
          const glass = MeshBuilder.CreatePlane(
            "VIS_WindowGlass_dense_gpu_fixture",
            { size: 3, sideOrientation: Mesh.DOUBLESIDE },
            scene
          );
          glass.material = createFlatMaterial(
            V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
            new Color3(0.56, 0.78, 0.86),
            0.28,
            scene
          );

          const character = MeshBuilder.CreatePlane(
            "fixture-dense-force-depth-character",
            { width: 0.7, height: 0.7 },
            scene
          );
          const characterMaterial = createFlatMaterial(
            "fixture-dense-force-depth-character-material",
            new Color3(0.1, 0.85, 0.2),
            0.9,
            scene
          );
          characterMaterial.transparencyMode =
            Material.MATERIAL_ALPHATESTANDBLEND;
          characterMaterial.alphaCutOff = 0.01;
          characterMaterial.forceDepthWrite = true;
          character.material = characterMaterial;
          character.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER;
          character.position.set(0.35, 0, 0.4);

          const visualMaterial = createFlatMaterial(
            "fixture-dense-beam-material",
            new Color3(1, 0.18, 0.74),
            0.55,
            scene
          );
          const depthMaterial = createBeamDepthMaterial(
            "fixture-dense-beam-depth-material",
            scene
          );
          const beamBodySource = MeshBuilder.CreateCylinder(
            "fixture-dense-beam-body-source",
            {
              height: 2.2,
              diameterTop: 0.16,
              diameterBottom: 0.28,
              tessellation: 12,
              sideOrientation: Mesh.DOUBLESIDE
            },
            scene
          );
          const beamBodyPositions = beamBodySource.getVerticesData(
            VertexBuffer.PositionKind
          )!;
          const beamBodyColors: number[] = [];
          for (
            let index = 0;
            index < beamBodyPositions.length;
            index += 3
          ) {
            const normalizedY = beamBodyPositions[index + 1] / 2.2;
            const alpha =
              normalizedY >= -1 / 6
                ? 1
                : Math.max(0, (normalizedY + 0.5) * 3);
            beamBodyColors.push(1, 1, 1, alpha);
          }
          beamBodySource.setVerticesData(
            VertexBuffer.ColorKind,
            beamBodyColors,
            false,
            4
          );
          beamBodySource.useVertexColors = true;
          beamBodySource.hasVertexAlpha = true;
          const beamBodyDepthSource = beamBodySource.clone(
            "fixture-dense-beam-body-depth-source"
          );
          beamBodySource.registerInstancedBuffer(
            VertexBuffer.ColorInstanceKind,
            4
          );
          beamBodyDepthSource.registerInstancedBuffer(
            VertexBuffer.ColorInstanceKind,
            4
          );
          beamBodySource.material = visualMaterial;
          beamBodySource.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
          beamBodySource.isVisible = false;
          beamBodyDepthSource.material = depthMaterial;
          beamBodyDepthSource.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;
          beamBodyDepthSource.isVisible = false;
          const beamBody = beamBodySource.createInstance(
            "fixture-dense-beam-body"
          );
          beamBody.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
          const beamBodyDepth = beamBodyDepthSource.createInstance(
            "fixture-dense-beam-body-depth"
          );
          beamBodyDepth.parent = beamBody;
          beamBodyDepth.position.setAll(0);
          beamBodyDepth.rotation.setAll(0);
          beamBodyDepth.scaling.setAll(1);
          beamBodyDepth.instancedBuffers.instanceColor = new Color4(
            1,
            1,
            1,
            1
          );
          const beamDirection = new Vector3(1, 0, -0.5).normalize();
          const beamRotationAxis = Vector3.Cross(
            Vector3.Up(),
            beamDirection
          ).normalize();
          beamBody.rotationQuaternion = Quaternion.RotationAxis(
            beamRotationAxis,
            Math.acos(Vector3.Dot(Vector3.Up(), beamDirection))
          );
          beamBody.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
          beamBodyDepth.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;

          const beamTipPosition = beamDirection.scale(1.1);
          const beamTipSource = MeshBuilder.CreateSphere(
            "fixture-dense-beam-tip-source",
            { diameter: 0.36, segments: 12 },
            scene
          );
          const beamTipDepthSource = beamTipSource.clone(
            "fixture-dense-beam-tip-depth-source"
          );
          beamTipSource.registerInstancedBuffer(
            VertexBuffer.ColorInstanceKind,
            4
          );
          beamTipDepthSource.registerInstancedBuffer(
            VertexBuffer.ColorInstanceKind,
            4
          );
          beamTipSource.material = visualMaterial;
          beamTipSource.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
          beamTipSource.isVisible = false;
          beamTipDepthSource.material = depthMaterial;
          beamTipDepthSource.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;
          beamTipDepthSource.isVisible = false;
          const beamTip = beamTipSource.createInstance(
            "fixture-dense-beam-tip"
          );
          beamTip.instancedBuffers.instanceColor = new Color4(1, 1, 1, 1);
          const beamTipDepth = beamTipDepthSource.createInstance(
            "fixture-dense-beam-tip-depth"
          );
          beamTipDepth.parent = beamTip;
          beamTipDepth.position.setAll(0);
          beamTipDepth.rotation.setAll(0);
          beamTipDepth.scaling.setAll(1);
          beamTipDepth.instancedBuffers.instanceColor = new Color4(
            1,
            1,
            1,
            1
          );
          beamTip.position.copyFrom(beamTipPosition);
          beamTip.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
          beamTipDepth.alphaIndex =
            V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;

          for (let index = 0; index < 7; index += 1) {
            const trail = MeshBuilder.CreateSphere(
              `fixture-dense-beam-trail-${index}`,
              { diameter: 0.22, segments: 10 },
              scene
            );
            trail.position.set(
              beamTipPosition.x + (index % 3) * 0.018 - 0.018,
              (Math.floor(index / 3) - 1) * 0.018,
              -0.2 + index * 0.004
            );
            trail.material = visualMaterial;
            trail.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR;
            const trailDepth = trail.clone(
              `fixture-dense-beam-trail-depth-${index}`,
              trail
            );
            trailDepth.position.setAll(0);
            trailDepth.rotation.setAll(0);
            trailDepth.scaling.setAll(1);
            trailDepth.material = depthMaterial;
            trailDepth.alphaIndex =
              V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH;
          }

          configureV2StageTransparentRenderingOrder([glass]);
          await scene.whenReadyAsync();
          scene.render();

          const pixelAt = (worldX: number, worldY: number) =>
            readPixel(
              engine,
              size,
              Math.floor(((worldX + 1.5) / 3) * size),
              Math.floor(((worldY + 1) / 2) * size)
            );
          const glassOnly = await pixelAt(0, 0.65);
          const beamBehindGlass = await pixelAt(-0.55, 0);
          const beamInFrontOfCharacter = await pixelAt(0.35, 0);
          const denseTip = await pixelAt(beamTipPosition.x, 0);

          assert(
            !scene.useOrderIndependentTransparency &&
              glassOnly[2] > glassOnly[0] + 20 &&
              beamBehindGlass[2] > beamBehindGlass[0] &&
              beamBehindGlass[0] > glassOnly[0] + 20 &&
              beamInFrontOfCharacter[0] >
                beamInFrontOfCharacter[1] + 20 &&
              denseTip[0] > denseTip[1] + 40 &&
              denseTip[2] > denseTip[1] + 20,
            `実ビーム密集時の深度・色が不正です: glass=${JSON.stringify(
              glassOnly
            )}, behind=${JSON.stringify(
              beamBehindGlass
            )}, character=${JSON.stringify(
              beamInFrontOfCharacter
            )}, tip=${JSON.stringify(denseTip)}`
          );
          return `glass=${JSON.stringify(
            glassOnly
          )}、奥側=${JSON.stringify(
            beamBehindGlass
          )}、Character前=${JSON.stringify(
            beamInFrontOfCharacter
          )}、tip＋14面trail=${JSON.stringify(denseTip)}`;
        } finally {
          scene.dispose();
          engine.dispose();
        }
      }
    ),
    executeTest(
      "実player-gun InstanceのFPS同軸表示と深度proxy",
      async () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const engine = new Engine(
          canvas,
          true,
          { preserveDrawingBuffer: true, stencil: false },
          false
        );
        engine.setSize(size, size);
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.04, 0.04, 0.04, 1);
        const camera = new FreeCamera(
          "fixture-player-beam-camera",
          new Vector3(0, 0, -1),
          scene
        );
        camera.setTarget(new Vector3(0, 0, 1));
        camera.fov = Math.PI / 3;
        camera.minZ = 0.02;
        camera.maxZ = 10;
        scene.activeCamera = camera;

        const movementColliders = Object.freeze({
          player: Object.freeze([]),
          npc: Object.freeze([]),
          bit: Object.freeze([])
        });
        const spatialFixture = createDynamicStageSpatialQueryFixture(
          scene,
          {
            movementColliders,
            groundColliders: Object.freeze([]),
            beamBlockers: Object.freeze([]),
            sightBlockers: Object.freeze([]),
            bitObstacles: movementColliders.bit
          },
          { volumes: [] }
        );
        const stage = Object.freeze({
          resources: Object.freeze({
            beamBlockers: Object.freeze([]),
            sightBlockers: Object.freeze([])
          }),
          worldBoundary: null,
          queries: spatialFixture.queries
        }) as unknown as StageSpatialContext;
        const system = createV2BeamSystem({
          scene,
          stage,
          getHumanTargets: () => [],
          random: () => 0.5,
          getOrbVisibilityPredicate: () => () => true
        });

        try {
          const glass = MeshBuilder.CreatePlane(
            "VIS_WindowGlass_player_beam_gpu_fixture",
            { size: 2, sideOrientation: Mesh.DOUBLESIDE },
            scene
          );
          glass.material = createFlatMaterial(
            V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
            new Color3(0.15, 0.55, 1),
            0.65,
            scene
          );
          glass.position.z = 0.1;
          glass.setEnabled(false);
          configureV2StageTransparentRenderingOrder([glass]);

          await system.prepareVisualResources();
          const beamId = system.spawn({
            sourceId: "fixture-player",
            originKind: "player-gun",
            targetPolicy: Object.freeze({ kind: "alive-humans" }),
            origin: new Vector3(0, 0, -0.9),
            direction: Vector3.Forward(),
            speed: 1.58,
            maximumLifetime: 2
          });
          system.update(0.5);
          await scene.whenReadyAsync();
          scene.render();
          const baselineCenter = await readCenterPixel(engine, size);
          const baselineRim = await readPixel(
            engine,
            size,
            Math.floor(size / 2 + 7),
            Math.floor(size / 2)
          );

          glass.setEnabled(true);
          glass.position.z = 0.1;
          glass.computeWorldMatrix(true);
          scene.render();
          const glassBehind = await readCenterPixel(engine, size);

          glass.position.z = -0.97;
          glass.computeWorldMatrix(true);
          scene.render();
          const glassInFront = await readCenterPixel(engine, size);

          glass.position.z = 0.1;
          glass.computeWorldMatrix(true);
          for (const mesh of scene.meshes) {
            if (
              mesh.name.startsWith(`${beamId}-`) &&
              mesh instanceof InstancedMesh
            ) {
              mesh.instancedBuffers.instanceColor = new Color4(1, 1, 1, 0);
            }
          }
          scene.render();
          const fadedOut = await readCenterPixel(engine, size);

          const visualMaterial = scene.getMaterialByName(
            "v2NormalBeamMaterial"
          ) as StandardMaterial | null;
          const depthMaterial = scene.getMaterialByName(
            "v2NormalBeamDepthMaterial"
          ) as StandardMaterial | null;
          const body = scene.getMeshByName(
            `${beamId}-body`
          ) as InstancedMesh | null;
          const bodyDepth = scene.getMeshByName(
            `${beamId}-body-depth`
          ) as InstancedMesh | null;
          const tip = scene.getMeshByName(
            `${beamId}-tip`
          ) as InstancedMesh | null;
          const tipDepth = scene.getMeshByName(
            `${beamId}-tip-depth`
          ) as InstancedMesh | null;

          assert(
            baselineCenter[0] > baselineCenter[1] + 45 &&
              baselineCenter[2] > baselineCenter[1] + 20 &&
              baselineRim[0] > baselineRim[1] + 20 &&
              Math.abs(glassBehind[0] - baselineCenter[0]) <= 3 &&
              Math.abs(glassBehind[1] - baselineCenter[1]) <= 3 &&
              Math.abs(glassBehind[2] - baselineCenter[2]) <= 3 &&
              glassInFront[0] < baselineCenter[0] - 20 &&
              glassInFront[2] > glassInFront[0] &&
              fadedOut[2] > fadedOut[0] + 25 &&
              visualMaterial?.transparencyMode ===
                Material.MATERIAL_ALPHABLEND &&
              !visualMaterial.needDepthPrePass &&
              depthMaterial?.transparencyMode ===
                Material.MATERIAL_ALPHATESTANDBLEND &&
              depthMaterial.needAlphaTesting() &&
              depthMaterial.disableColorWrite &&
              depthMaterial.forceDepthWrite &&
              !depthMaterial.needDepthPrePass &&
              approximately(depthMaterial.alphaCutOff, 0.1, 1e-6) &&
              bodyDepth?.parent === body &&
              tipDepth?.parent === tip,
            `実player-gun描画が不正です: baseline=${JSON.stringify(
              baselineCenter
            )}, rim=${JSON.stringify(
              baselineRim
            )}, behind=${JSON.stringify(
              glassBehind
            )}, front=${JSON.stringify(
              glassInFront
            )}, faded=${JSON.stringify(fadedOut)}`
          );
          return `baseline=${JSON.stringify(
            baselineCenter
          )}、rim=${JSON.stringify(
            baselineRim
          )}、奥ガラス=${JSON.stringify(
            glassBehind
          )}、手前ガラス=${JSON.stringify(
            glassInFront
          )}、fade後=${JSON.stringify(fadedOut)}`;
        } finally {
          system.dispose();
          spatialFixture.dispose();
          scene.dispose();
          engine.dispose();
        }
      }
    )
  ]);
