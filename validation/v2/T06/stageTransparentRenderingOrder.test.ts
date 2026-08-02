import {
  Camera,
  Color3,
  Color4,
  Engine,
  FreeCamera,
  Material,
  MeshBuilder,
  NullEngine,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";

import {
  V2_STAGE_WINDOW_GLASS_MATERIAL_NAME,
  configureV2StageTransparentRenderingOrder
} from "../../../src/v2/v2StageTransparentRenderingOrder";
import {
  V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_SPATIAL
} from "../../../src/v2/v2TransparentRenderingOrder";
import { assert, executeTest, type T06TestResult } from "./testUtils";

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
              V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
            V2_TRANSPARENT_ALPHA_INDEX_SPATIAL <
              V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER,
          "窓ガラスだけの空間半透明indexまたはCharacter順が不正です。"
        );
        return "通常窓・体育館連絡通路窓=spatial、非対象Materialは既定値を維持";
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
        light.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_SPATIAL;
        light.position.z = 0;

        await scene.whenReadyAsync();
        scene.render();
        const fixedIndexRegression = await readCenterPixel(engine, size);
        assert(
          fixedIndexRegression[2] > fixedIndexRegression[0] + 80,
          `修正前のガラス固定後描画を再現できません: ${JSON.stringify(
            fixedIndexRegression
          )}`
        );

        configureV2StageTransparentRenderingOrder([glass]);
        scene.render();
        const lightInFront = await readCenterPixel(engine, size);
        assert(
          lightInFront[0] > lightInFront[2] + 80 &&
            lightInFront[2] > 20,
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
        return `固定順=${JSON.stringify(
          fixedIndexRegression
        )}、光手前=${JSON.stringify(
          lightInFront
        )}、ガラス手前=${JSON.stringify(glassInFront)}`;
      } finally {
        scene.dispose();
        engine.dispose();
      }
    })
  ]);
