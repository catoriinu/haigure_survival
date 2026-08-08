import {
  Camera,
  Color3,
  Color4,
  Engine,
  FreeCamera,
  Material,
  MeshBuilder,
  NullEngine,
  RawTexture,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import {
  resolveV2FirstPersonCharacterVisualFrameToRef,
  type V2FirstPersonCharacterVisualFrameOptions,
  type V2FirstPersonCharacterVisualFrameTarget
} from "../../../src/v2/v2PlayerCharacterVisual";
import { V2_DEFAULT_PORTRAIT_DIRECTORY } from "../../../src/v2/v2CharacterAssignments";
import { resolveV2CharacterFacingYaw } from "../../../src/v2/v2CharacterFacing";
import { createV2PortraitAssetCatalogFromPublicPaths } from "../../../src/v2/v2PortraitAssetCatalog";
import {
  V2_TRANSPARENT_ALPHA_INDEX_SPATIAL,
  V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER
} from "../../../src/v2/v2TransparentRenderingOrder";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import {
  V2_PORTRAIT_IMAGE_BASE_NAMES,
  V2_CHARACTER_VISUAL_MAX_HEIGHT,
  V2_CHARACTER_VISUAL_MAX_WIDTH,
  calculateV2CharacterVisualSize,
  createV2CharacterVisualRuntime,
  getV2CharacterVisualCellIndex,
  resolveV2PortraitFiles
} from "../../../src/v2/v2CharacterVisualRuntime";
import { assert, executeTest, type T06TestResult } from "./testUtils";

const readRgbaPixel = (
  pixels: ArrayBufferView,
  width: number,
  x: number,
  y: number
): readonly [number, number, number, number] => {
  const bytes = new Uint8Array(
    pixels.buffer,
    pixels.byteOffset,
    pixels.byteLength
  );
  const offset = (y * width + x) * 4;
  return Object.freeze([
    bytes[offset] as number,
    bytes[offset + 1] as number,
    bytes[offset + 2] as number,
    bytes[offset + 3] as number
  ]);
};

const createFirstPersonFrameTarget =
  (): V2FirstPersonCharacterVisualFrameTarget => ({
    visible: false,
    alpha: 0,
    position: Vector3.Zero(),
    cameraRenderOffset: Vector3.Zero()
  });

const resolveFirstPersonFrame = (
  options: V2FirstPersonCharacterVisualFrameOptions
): V2FirstPersonCharacterVisualFrameTarget =>
  resolveV2FirstPersonCharacterVisualFrameToRef(
    options,
    createFirstPersonFrameTarget()
  );

const createFlatTransparentMaterial = (
  name: string,
  color: Color3,
  scene: Scene
): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = color;
  material.alpha = 0.9;
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  return material;
};

export const runCharacterVisualTests = async (): Promise<
  readonly T06TestResult[]
> =>
  Promise.all([
    executeTest("Character画像の必須8状態解決", () => {
      const paths = V2_PORTRAIT_IMAGE_BASE_NAMES.map(
        (baseName) =>
          `/public/picture/chara/01_test/${baseName}.png`
      );
      const inventory =
        createV2PortraitAssetCatalogFromPublicPaths(paths).filesByDirectory;
      const files = resolveV2PortraitFiles("01_test", inventory);
      assert(
        Object.keys(files).length === 8 &&
          files.normal === "normal.png" &&
          files["bw-complete-pose"] === "bw-complete-pose.png",
        `必須8状態を解決できません: ${JSON.stringify(files)}`
      );
      let missingStateRejected = false;
      try {
        resolveV2PortraitFiles(
          "01_test",
          createV2PortraitAssetCatalogFromPublicPaths(paths.slice(0, -1))
            .filesByDirectory
        );
      } catch {
        missingStateRejected = true;
      }
      let duplicateStateRejected = false;
      try {
        createV2PortraitAssetCatalogFromPublicPaths([
          ...paths,
          "/public/picture/chara/01_test/normal.webp"
        ]);
      } catch {
        duplicateStateRejected = true;
      }
      assert(
        missingStateRejected && duplicateStateRejected,
        "必須状態欠落または同名拡張子重複が拒否されません。"
      );
      return "8状態を解決し、欠落・重複を拒否";
    }),
    executeTest("Character画像の状態cellと縦横比", () => {
      const size = calculateV2CharacterVisualSize(832, 1216);
      const defaultSize = calculateV2CharacterVisualSize(330, 700);
      const expectedMaximumHeight =
        1.7 * BLENDER_METERS_TO_WORLD_UNITS;
      assert(
        getV2CharacterVisualCellIndex("normal", false, "portrait") === 0 &&
          getV2CharacterVisualCellIndex("evade", false, "portrait") === 1 &&
          getV2CharacterVisualCellIndex("hit-a", false, "portrait") === 2 &&
          getV2CharacterVisualCellIndex("hit-b", false, "portrait") === 3 &&
          getV2CharacterVisualCellIndex(
            "brainwash-in-progress",
            false,
            "portrait"
          ) === 4 &&
          getV2CharacterVisualCellIndex(
            "brainwash-complete-no-gun",
            true,
            "portrait"
          ) === 5 &&
          getV2CharacterVisualCellIndex(
            "brainwash-complete-haigure-formation",
            false,
            "portrait"
          ) === 7 &&
          Math.abs(size.width / size.height - 832 / 1216) <= 0.000001 &&
          V2_CHARACTER_VISUAL_MAX_WIDTH === 1 / 3 &&
          Math.abs(V2_CHARACTER_VISUAL_MAX_HEIGHT - expectedMaximumHeight) <=
            0.000001 &&
          Math.abs(size.width - (832 / 1216) * expectedMaximumHeight) <=
            0.000001 &&
          Math.abs(size.height - expectedMaximumHeight) <= 0.000001 &&
          Math.abs(defaultSize.width - (330 / 700) * expectedMaximumHeight) <=
            0.000001 &&
          Math.abs(defaultSize.height - V2_CHARACTER_VISUAL_MAX_HEIGHT) <=
            0.000001,
        `状態cellまたは縦横比が不正です: ${JSON.stringify(size)}`
      );
      return "portrait 8cell、temporary gun、幅1/3・学校実寸1.70m上限";
    }),
    executeTest("camera-facing Character表示Runtimeの所有契約", async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const runtime = await createV2CharacterVisualRuntime({
        scene,
        orientationMode: "camera-facing",
        assignments: Object.freeze([
          Object.freeze({
            actorId: "player",
            voiceProfileId: "01",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          })
        ])
      });
      try {
        const handle = runtime.createSprite("player", "fixture-player");
        const playerSize = runtime.getActorVisualSize("player");
        handle.setState("brainwash-complete-gun", false);
        handle.syncPresentation();
        assert(
          handle.sprite.cellIndex === 3 &&
            handle.width > 0 &&
            handle.height > handle.width &&
            playerSize.width === handle.width &&
            playerSize.height === handle.height &&
            handle.presentationMesh === null &&
            handle.sprite.manager.layerMask !== 0,
          "組込みCharacter表示の状態または寸法が不正です。"
        );
        let unknownActorRejected = false;
        try {
          runtime.createSprite("unknown", "fixture-unknown");
        } catch {
          unknownActorRejected = true;
        }
        let unknownActorSizeRejected = false;
        try {
          runtime.getActorVisualSize("unknown");
        } catch {
          unknownActorSizeRejected = true;
        }
        handle.dispose();
        let duplicateDisposeRejected = false;
        try {
          handle.dispose();
        } catch {
          duplicateDisposeRejected = true;
        }
        assert(
          unknownActorRejected &&
            unknownActorSizeRejected &&
            duplicateDisposeRejected,
          "未割当actorの生成・寸法取得またはSprite二重破棄が拒否されません。"
        );
        return "Sprite描画、actor寸法取得、未割当actor、二重破棄を検証";
      } finally {
        runtime.dispose();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("upright Character表示Runtimeの同期と破棄", async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const runtime = await createV2CharacterVisualRuntime({
        scene,
        orientationMode: "upright",
        assignments: Object.freeze([
          Object.freeze({
            actorId: "player",
            voiceProfileId: "01",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          }),
          Object.freeze({
            actorId: "npc-001",
            voiceProfileId: "02",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          })
        ])
      });
      let runtimeDisposed = false;
      try {
        const first = runtime.createSprite("player", "fixture-upright-first");
        const second = runtime.createSprite("player", "fixture-upright-second");
        const npc = runtime.createSprite("npc-001", "fixture-upright-npc");
        const firstMesh = first.presentationMesh;
        const secondMesh = second.presentationMesh;
        const npcMesh = npc.presentationMesh;
        const presentationMaterial = firstMesh?.material ?? null;
        assert(
          firstMesh !== null &&
            secondMesh !== null &&
            npcMesh !== null &&
            presentationMaterial !== null &&
            presentationMaterial === secondMesh.material &&
            presentationMaterial === npcMesh.material &&
            presentationMaterial.transparencyMode ===
              Material.MATERIAL_ALPHATESTANDBLEND &&
            presentationMaterial.needAlphaTesting() &&
            presentationMaterial.needAlphaBlendingForMesh(firstMesh) &&
            !presentationMaterial.needDepthPrePass &&
            presentationMaterial.forceDepthWrite &&
            first.sprite.manager.layerMask === 0 &&
            npcMesh.alphaIndex ===
              V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER &&
            firstMesh.alphaIndex ===
              V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER &&
            V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER <
              V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
            V2_TRANSPARENT_ALPHA_INDEX_SPATIAL <
              V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER,
          "upright Plane、alpha discard後depth、共有Materialまたは透明描画順が不正です。"
        );

        runtime.setFacingYaw(Math.PI / 3);
        first.sprite.position.copyFromFloats(1, 2, 3);
        first.sprite.color = new Color4(0.25, 0.5, 0.75, 0.4);
        first.sprite.isVisible = true;
        first.setState("hit-a", false);
        first.syncPresentation();
        const uvData = firstMesh.getVerticesData(VertexBuffer.UVKind);
        const colorData = firstMesh.getVerticesData(VertexBuffer.ColorKind);
        assert(
          firstMesh.position.equalsWithEpsilon(
            new Vector3(1, 2, 3),
            0.000001
          ) &&
            firstMesh.scaling.equalsWithEpsilon(
              new Vector3(first.width, first.height, 1),
              0.000001
            ) &&
            firstMesh.rotation.x === 0 &&
            Math.abs(firstMesh.rotation.y - Math.PI / 3) <= 0.000001 &&
            firstMesh.rotation.z === 0 &&
            firstMesh.isVisible &&
            uvData !== null &&
            Math.abs((uvData[0] as number) - 1 / 6) <= 0.000001 &&
            Math.abs((uvData[2] as number) - 2 / 6) <= 0.000001 &&
            colorData !== null &&
            Math.abs((colorData[0] as number) - 0.25) <= 0.000001 &&
            Math.abs((colorData[3] as number) - 0.4) <= 0.000001,
          "upright Planeへ位置・寸法・yaw・cell UV・色alphaが同期されません。"
        );

        let positionWriteCount = 0;
        let yawWriteCount = 0;
        const originalPositionCopyFrom =
          firstMesh.position.copyFrom.bind(firstMesh.position);
        const originalRotationSet =
          firstMesh.rotation.set.bind(firstMesh.rotation);
        firstMesh.position.copyFrom = (source) => {
          positionWriteCount += 1;
          return originalPositionCopyFrom(source);
        };
        firstMesh.rotation.set = (x, y, z) => {
          yawWriteCount += 1;
          return originalRotationSet(x, y, z);
        };
        runtime.setFacingYaw(Math.PI / 3);
        first.syncPresentation();
        assert(
          positionWriteCount === 0 && yawWriteCount === 0,
          `同一位置・yawの再同期でtransformが更新されました: position=${positionWriteCount}, yaw=${yawWriteCount}`
        );
        first.sprite.position.x += 0.25;
        first.syncPresentation();
        runtime.setFacingYaw(Math.PI / 2);
        assert(
          Number(positionWriteCount) === 1 && Number(yawWriteCount) === 1,
          `位置・yaw変更時の差分同期回数が不正です: position=${positionWriteCount}, yaw=${yawWriteCount}`
        );

        first.sprite.isVisible = false;
        first.syncPresentation();
        assert(!firstMesh.isVisible, "upright Planeへ非表示が同期されません。");

        const sharedMaterial = firstMesh.material;
        first.dispose();
        assert(
          firstMesh.isDisposed() &&
            sharedMaterial !== null &&
            scene.materials.includes(sharedMaterial),
          "handle破棄でPlaneだけを破棄できません。"
        );
        runtime.dispose();
        runtimeDisposed = true;
        assert(
          secondMesh.isDisposed() &&
            npcMesh.isDisposed() &&
            !scene.materials.includes(sharedMaterial),
          "Runtime破棄で残存Planeと共有Materialが破棄されません。"
        );
        return "world-up Planeを共有し、transform差分同期・透明順・破棄を確認";
      } finally {
        if (!runtimeDisposed) {
          runtime.dispose();
        }
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("Character透明画素の奥側WebGL描画", async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const engine = new Engine(
        canvas,
        true,
        { preserveDrawingBuffer: true, stencil: false },
        false
      );
      engine.setSize(96, 96);
      const scene = new Scene(engine);
      scene.clearColor = new Color4(0, 0, 0, 1);
      const camera = new FreeCamera(
        "fixture-character-alpha-camera",
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

      const runtime = await createV2CharacterVisualRuntime({
        scene,
        orientationMode: "upright",
        assignments: Object.freeze([
          Object.freeze({
            actorId: "npc-001",
            voiceProfileId: "01",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          })
        ])
      });
      let runtimeDisposed = false;
      const alphaTexture = RawTexture.CreateRGBATexture(
        new Uint8Array([0, 255, 0, 255, 0, 0, 0, 0]),
        2,
        1,
        scene,
        false,
        false,
        Texture.NEAREST_SAMPLINGMODE
      );
      alphaTexture.hasAlpha = true;
      alphaTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
      alphaTexture.wrapV = Texture.CLAMP_ADDRESSMODE;

      try {
        const handle = runtime.createSprite(
          "npc-001",
          "fixture-character-alpha"
        );
        const characterMesh = handle.presentationMesh;
        assert(
          characterMesh !== null &&
            characterMesh.material instanceof StandardMaterial,
          "WebGL描画fixtureのCharacter Plane Materialがありません。"
        );
        const characterMaterial = characterMesh.material as StandardMaterial;
        characterMaterial.diffuseTexture = alphaTexture;
        characterMesh.position.set(0, 0, 0);
        characterMesh.rotation.set(0, 0, 0);
        characterMesh.scaling.set(2, 2, 1);
        characterMesh.isVisible = true;
        characterMesh.setVerticesData(
          VertexBuffer.UVKind,
          new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
          true
        );

        const rearMesh = MeshBuilder.CreatePlane(
          "fixture-character-alpha-rear",
          { size: 2 },
          scene
        );
        rearMesh.position.z = 0.5;
        rearMesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_SPATIAL;
        rearMesh.material = createFlatTransparentMaterial(
          "fixture-character-alpha-rear-material",
          new Color3(0, 0, 1),
          scene
        );

        await scene.whenReadyAsync();
        scene.render();
        const rearPixels = await engine.readPixels(0, 0, 96, 96, true, true);
        const rearSamples = [
          readRgbaPixel(rearPixels, 96, 24, 48),
          readRgbaPixel(rearPixels, 96, 72, 48)
        ];
        const opaqueSample = rearSamples.find(
          ([red, green, blue]) => green > red + 80 && green > blue + 80
        );
        const transparentSample = rearSamples.find(
          ([red, green, blue]) => blue > red + 80 && blue > green + 80
        );
        assert(
          opaqueSample !== undefined && transparentSample !== undefined,
          `透明部の奥側または実画素の遮蔽が不正です: ${JSON.stringify(
            rearSamples
          )}`
        );

        const frontMesh = MeshBuilder.CreatePlane(
          "fixture-character-alpha-front",
          { size: 2 },
          scene
        );
        frontMesh.position.z = -0.5;
        frontMesh.alphaIndex = V2_TRANSPARENT_ALPHA_INDEX_SPATIAL;
        frontMesh.material = createFlatTransparentMaterial(
          "fixture-character-alpha-front-material",
          new Color3(1, 0, 0),
          scene
        );
        await scene.whenReadyAsync();
        scene.render();
        const frontPixels = await engine.readPixels(0, 0, 96, 96, true, true);
        const frontSamples = [
          readRgbaPixel(frontPixels, 96, 24, 48),
          readRgbaPixel(frontPixels, 96, 72, 48)
        ];
        assert(
          frontSamples.every(
            ([red, green, blue]) => red > green + 80 && red > blue + 80
          ),
          `Character前面の光が描画されません: ${JSON.stringify(
            frontSamples
          )}`
        );

        runtime.dispose();
        runtimeDisposed = true;
        return `透明部=${JSON.stringify(
          transparentSample
        )}、実画素=${JSON.stringify(
          opaqueSample
        )}、前面=${JSON.stringify(frontSamples)}`;
      } finally {
        if (!runtimeDisposed) {
          runtime.dispose();
        }
        alphaTexture.dispose();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("Character水平yawの真下安定化", () => {
      const forwardYaw = resolveV2CharacterFacingYaw({
        viewForward: new Vector3(1, 0, 0),
        viewUp: new Vector3(0, 1, 0),
        fallbackYaw: 0
      });
      const downwardYaw = resolveV2CharacterFacingYaw({
        viewForward: new Vector3(0, -1, 0),
        viewUp: new Vector3(1, 0, 0),
        fallbackYaw: 0
      });
      const fallbackYaw = resolveV2CharacterFacingYaw({
        viewForward: new Vector3(0, -1, 0),
        viewUp: new Vector3(0, 1, 0),
        fallbackYaw: -Math.PI / 4
      });
      assert(
        Math.abs(forwardYaw - Math.PI / 2) <= 0.000001 &&
          Math.abs(downwardYaw - Math.PI / 2) <= 0.000001 &&
          Math.abs(fallbackYaw + Math.PI / 4) <= 0.000001,
        `水平yawの前方・真下・予備値が不正です: ${JSON.stringify({
          forwardYaw,
          downwardYaw,
          fallbackYaw
        })}`
      );
      return "通常は前方、真下はカメラ上方、退化時は前frame yawを維持";
    }),
    executeTest("一人称Character表示の無効状態", () => {
      const frame = resolveFirstPersonFrame({
        active: false,
        footPosition: new Vector3(1, 2, 3),
        viewForward: new Vector3(0, -1, 0),
        facingYaw: 0,
        spriteHeight: 0.4
      });
      assert(
        !frame.visible &&
          frame.alpha === 0 &&
          frame.position.equalsWithEpsilon(
            new Vector3(1, 2.2, 3),
            0.000001
          ) &&
          frame.cameraRenderOffset.equalsWithEpsilon(
            Vector3.Zero(),
            0.000001
          ),
        `無効時の表示frameが不正です: ${JSON.stringify({
          visible: frame.visible,
          alpha: frame.alpha,
          position: frame.position.asArray()
        })}`
      );
      return "無効時は足元同期を維持して非表示";
    }),
    executeTest("一人称Character表示の55度境界", () => {
      const angle = (55 * Math.PI) / 180;
      const frame = resolveFirstPersonFrame({
        active: true,
        footPosition: Vector3.Zero(),
        viewForward: new Vector3(0, -Math.sin(angle), Math.cos(angle)),
        facingYaw: 0,
        spriteHeight: 0.4
      });
      assert(
        !frame.visible && frame.alpha <= 0.000001,
        `55度境界で表示されました: ${frame.alpha}`
      );
      return "55度では非表示";
    }),
    executeTest("一人称Character表示の中間補間", () => {
      const angle = (72.5 * Math.PI) / 180;
      const frame = resolveFirstPersonFrame({
        active: true,
        footPosition: Vector3.Zero(),
        viewForward: new Vector3(0, -Math.sin(angle), Math.cos(angle)),
        facingYaw: 0,
        spriteHeight: 0.4
      });
      assert(
        frame.visible &&
          Math.abs(frame.alpha - 0.5) <= 0.000001 &&
          Math.abs(frame.position.z + (1 / 3) * 0.14) <= 0.000001 &&
          Math.abs(frame.cameraRenderOffset.z + (1 / 3) * 0.07) <=
            0.000001 &&
          Math.abs(frame.cameraRenderOffset.y - (1 / 3) * 0.085) <=
            0.000001,
        `中間補間が不正です: ${JSON.stringify({
          alpha: frame.alpha,
          position: frame.position.asArray()
        })}`
      );
      return "72.5度でalpha 0.5、V1同等のカメラ・画像offset";
    }),
    executeTest("一人称Character表示の真下", () => {
      const frame = resolveFirstPersonFrame({
        active: true,
        footPosition: new Vector3(1, 2, 3),
        viewForward: new Vector3(0, -1, 0),
        facingYaw: 0,
        spriteHeight: 0.4
      });
      assert(
        frame.visible &&
          frame.alpha === 1 &&
          frame.position.equalsWithEpsilon(
            new Vector3(1, 2.2, 3 - (2 / 3) * 0.14),
            0.000001
          ) &&
          frame.cameraRenderOffset.equalsWithEpsilon(
            new Vector3(0, (1 / 3) * 0.17, -(1 / 3) * 0.14),
            0.000001
          ),
        `真下表示が不正です: ${JSON.stringify({
          alpha: frame.alpha,
          position: frame.position.asArray()
        })}`
      );
      const target = createFirstPersonFrameTarget();
      const positionReference = target.position;
      const offsetReference = target.cameraRenderOffset;
      const reused = resolveV2FirstPersonCharacterVisualFrameToRef(
        {
          active: true,
          footPosition: new Vector3(4, 5, 6),
          viewForward: new Vector3(0, -1, 0),
          facingYaw: Math.PI / 2,
          spriteHeight: 0.4
        },
        target
      );
      assert(
        reused === target &&
          reused.position === positionReference &&
          reused.cameraRenderOffset === offsetReference,
        "一人称Character表示のToRefが出力領域を再利用していません。"
      );
      return "真下で完全表示し、ToRef出力領域を再利用";
    })
  ]);
