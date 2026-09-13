import { createDefaultCharacterSpritesheet, CHARACTER_SPRITE_CELL_SIZE } from "../../../src/game/characterSprites";
import {
  Camera,
  Color3,
  Color4,
  Engine,
  FreeCamera,
  Material,
  Mesh,
  MeshBuilder,
  NullEngine,
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
import { configureV2TransparentDepthComposition } from "../../../src/v2/v2TransparentDepthComposition";
import {
  V2_TRANSPARENT_ALPHA_INDEX_SPATIAL,
  V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER,
  V2_TRANSPARENT_ALPHA_INDEX_NPC_RESTRAINT,
  V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER
} from "../../../src/v2/v2TransparentRenderingOrder";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import {
  V2_PORTRAIT_IMAGE_BASE_NAMES,
  V2_CHARACTER_VISUAL_MAX_HEIGHT,
  V2_CHARACTER_VISUAL_MAX_WIDTH,
  V2_NPC_RESTRAINT_DEPTH_OFFSET,
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
    executeTest("デフォルトNPCの洗脳状態別配色", async () => {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("デフォルト画像の読込失敗"));
      });
      image.src = createDefaultCharacterSpritesheet();
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
      context.drawImage(image, 0, 0);
      const color = (state: Parameters<typeof getV2CharacterVisualCellIndex>[0]) => {
        const frame = getV2CharacterVisualCellIndex(state, false, "default", null);
        return [...context.getImageData(frame * CHARACTER_SPRITE_CELL_SIZE + 4, 4, 1, 1).data].slice(0, 3);
      };
      for (const state of ["brainwash-in-progress", "brainwash-complete-haigure", "brainwash-complete-haigure-formation"] as const) {
        assert(color(state).join(",") === "92,92,92", `${state}が灰色ではありません。`);
      }
      const gun = color("brainwash-complete-gun");
      const noGun = color("brainwash-complete-no-gun");
      assert(gun.join(",") === "113,60,120", "銃ありが指定されたピンク系の配色ではありません。");
      assert(noGun[0] < noGun[1] && noGun[1] < noGun[2], "銃なしがくすんだ水色ではありません。");
      return "進行中・ポーズ・整列は灰色、銃ありはピンク系、銃なしは水色";
    }),
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
        getV2CharacterVisualCellIndex("normal", false, "portrait", null) === 0 &&
          getV2CharacterVisualCellIndex("evade", false, "portrait", null) === 1 &&
          getV2CharacterVisualCellIndex("hit-a", false, "portrait", null) === 2 &&
          getV2CharacterVisualCellIndex("hit-b", false, "portrait", null) === 3 &&
          getV2CharacterVisualCellIndex(
            "brainwash-in-progress",
            false,
            "portrait",
            null
          ) === 4 &&
          getV2CharacterVisualCellIndex(
            "brainwash-complete-no-gun",
            true,
            "portrait",
            null
          ) === 5 &&
          getV2CharacterVisualCellIndex(
            "brainwash-complete-haigure-formation",
            false,
            "portrait",
            null
          ) === 7 &&
          getV2CharacterVisualCellIndex("hit-a", false, "portrait", 0) === 8 &&
          getV2CharacterVisualCellIndex("hit-a", false, "portrait", 0.5) === 16 &&
          getV2CharacterVisualCellIndex("hit-a", false, "portrait", 1) === 24 &&
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
      return "portrait 8cell＋銃なし接触17cell、temporary gun、幅1/3・学校実寸1.70m上限";
    }),
    executeTest("camera-facing Character表示Runtimeの所有契約", async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
    const runtime = await createV2CharacterVisualRuntime({
      scene,
      showGroundShadows: false,
      orientationMode: "camera-facing",
      includeNoGunTouchBlendFrames: false,
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
        handle.setState("brainwash-complete-gun", false, null);
        handle.syncPresentation();
        assert(
          handle.sprite.cellIndex === 3 &&
            handle.width > 0 &&
            handle.height > handle.width &&
            playerSize.width === handle.width &&
            playerSize.height === handle.height &&
            handle.presentationMesh.billboardMode === Mesh.BILLBOARDMODE_ALL &&
            handle.presentationMesh.rotation.equals(Vector3.Zero()) &&
            handle.sprite.manager.layerMask === 0,
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
        return "camera-facing Plane描画、actor寸法取得、未割当actor、二重破棄を検証";
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
      showGroundShadows: true,
      orientationMode: "upright",
      includeNoGunTouchBlendFrames: false,
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
            !presentationMaterial.forceDepthWrite &&
            first.sprite.manager.layerMask === 0 &&
            npcMesh.alphaIndex ===
              V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER &&
            firstMesh.alphaIndex ===
              V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER &&
            V2_TRANSPARENT_ALPHA_INDEX_NPC_CHARACTER <
              V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
            V2_TRANSPARENT_ALPHA_INDEX_SPATIAL <
              V2_TRANSPARENT_ALPHA_INDEX_PLAYER_CHARACTER,
          "upright Plane、透明材質の深度write抑止、共有Materialまたは透明描画順が不正です。"
        );

        runtime.setFacingYaw(Math.PI / 3);
        first.sprite.position.copyFromFloats(1, 2, 3);
        first.sprite.color = new Color4(0.25, 0.5, 0.75, 0.4);
        first.sprite.isVisible = true;
        first.setState("hit-a", false, null);
        first.syncPresentation();
        const firstShadow = scene.getMeshByName(
          "V2CharacterGroundShadow_fixture-upright-first"
        );
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
            Math.abs((colorData[3] as number) - 0.4) <= 0.000001 &&
            firstShadow !== null &&
            firstShadow.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_SPATIAL &&
            firstShadow.scaling.x > firstShadow.scaling.z &&
            Math.abs(firstShadow.rotation.y - Math.PI / 3) <= 0.000001,
          "upright Planeまたは横長の地面影へ位置・寸法・yaw・cell UV・色alphaが同期されません。"
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
    executeTest("銃なし拘束表示の追随・再利用・解除・破棄", async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const runtime = await createV2CharacterVisualRuntime({
        scene,
        showGroundShadows: false,
        orientationMode: "upright",
        includeNoGunTouchBlendFrames: false,
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
          }),
          Object.freeze({
            actorId: "npc-002",
            voiceProfileId: "03",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          })
        ])
      });
      let runtimeDisposed = false;
      try {
        const player = runtime.createSprite(
          "player",
          "fixture-restraint-player"
        );
        const firstNpc = runtime.createSprite(
          "npc-001",
          "fixture-restraint-first"
        );
        const disposableNpc = runtime.createSprite(
          "npc-002",
          "fixture-restraint-disposable"
        );
        player.sprite.isVisible = true;
        firstNpc.sprite.isVisible = true;
        disposableNpc.sprite.isVisible = true;
        firstNpc.sprite.position.copyFromFloats(1, 2, 3);
        disposableNpc.sprite.position.copyFromFloats(-1, 4, -3);
        runtime.setFacingYaw(Math.PI / 3);
        runtime.updateNoGunRestraint(
          Object.freeze(["player", "npc-001"]),
          0
        );

        const playerBand = scene.getMeshByName(
          "fixture-restraint-player_noGunRestraint"
        );
        const firstBand = scene.getMeshByName(
          "fixture-restraint-first_noGunRestraint"
        );
        const restraintHeight = 0.3 * BLENDER_METERS_TO_WORLD_UNITS;
        const expectedFirstY =
          firstNpc.sprite.position.y - firstNpc.height / 2 + restraintHeight / 2;
        assert(
          playerBand === null &&
            firstBand !== null &&
            firstBand.isVisible &&
            firstBand.position.equalsWithEpsilon(
              new Vector3(
                1 - Math.sin(Math.PI / 3) * V2_NPC_RESTRAINT_DEPTH_OFFSET,
                expectedFirstY,
                3 - Math.cos(Math.PI / 3) * V2_NPC_RESTRAINT_DEPTH_OFFSET
              ),
              0.000001
            ) &&
            firstBand.scaling.equalsWithEpsilon(
              new Vector3(firstNpc.width, restraintHeight, 1),
              0.000001
            ) &&
            firstBand.rotation.x === 0 &&
            Math.abs(firstBand.rotation.y - Math.PI / 3) <= 0.000001 &&
            firstBand.rotation.z === 0 &&
            firstBand.alphaIndex === V2_TRANSPARENT_ALPHA_INDEX_NPC_RESTRAINT,
          "拘束表示のPlayer除外、位置、寸法、upright yawが不正です。"
        );

        const firstMaterial = firstBand.material;
        const firstTexture =
          firstMaterial instanceof StandardMaterial
            ? firstMaterial.diffuseTexture
            : null;
        const restraintMeshCount = scene.meshes.filter((mesh) =>
          mesh.name.endsWith("_noGunRestraint")
        ).length;
        assert(firstMaterial !== null, "拘束帯のMaterialがありません。");
        const singleCaptureAlpha = firstMaterial.alpha;
        runtime.updateNoGunRestraint(
          Object.freeze(["npc-001", "npc-001", "npc-001"]),
          0
        );
        assert(
          scene.getMeshByName("fixture-restraint-first_noGunRestraint") ===
            firstBand &&
            scene.meshes.filter((mesh) =>
              mesh.name.endsWith("_noGunRestraint")
            ).length === restraintMeshCount &&
            firstBand.isVisible &&
            firstBand.material === firstMaterial &&
            firstMaterial.alpha === singleCaptureAlpha,
          "複数捕獲により拘束帯が重複するか濃さが変わりました。"
        );
        firstNpc.sprite.position.copyFromFloats(2, 2.5, 4);
        runtime.setFacingYaw(Math.PI / 2);
        runtime.updateNoGunRestraint(Object.freeze(["npc-001"]), 0.5);
        const reusedBand = scene.getMeshByName(
          "fixture-restraint-first_noGunRestraint"
        );
        const expectedMovedY =
          firstNpc.sprite.position.y - firstNpc.height / 2 + restraintHeight / 2;
        assert(
          reusedBand === firstBand &&
            scene.meshes.filter((mesh) =>
              mesh.name.endsWith("_noGunRestraint")
            ).length === restraintMeshCount &&
            firstBand.position.equalsWithEpsilon(
              new Vector3(2 - V2_NPC_RESTRAINT_DEPTH_OFFSET, expectedMovedY, 4),
              0.000001
            ) &&
            Math.abs(firstBand.rotation.y - Math.PI / 2) <= 0.000001,
          "拘束Planeを再利用せず、補間済みSprite位置・yawへ追随しません。"
        );

        runtime.updateNoGunRestraint(Object.freeze([]), 1);
        assert(!firstBand.isVisible, "対象解除後も拘束表示が残りました。");

        runtime.updateNoGunRestraint(Object.freeze(["npc-002"]), 1.5);
        const disposableBand = scene.getMeshByName(
          "fixture-restraint-disposable_noGunRestraint"
        );
        assert(
          disposableBand !== null &&
            disposableBand.isVisible &&
            disposableBand.material === firstMaterial,
          "拘束表示が共有Materialを使用していません。"
        );
        disposableNpc.dispose();
        assert(
          disposableBand.isDisposed(),
          "Character record破棄で拘束Planeを破棄しません。"
        );

        runtime.dispose();
        runtimeDisposed = true;
        assert(
          firstBand.isDisposed() &&
            firstMaterial !== null &&
            !scene.materials.includes(firstMaterial) &&
            firstTexture !== null &&
            !scene.textures.includes(firstTexture),
          "Runtime破棄で拘束Plane・共有Material・gradient Textureを破棄しません。"
        );
        return "Player除外、複数捕獲でも帯1本・同じ濃さ、feet追随、0.075高、再利用、解除、record/runtime破棄";
      } finally {
        if (!runtimeDisposed) {
          runtime.dispose();
        }
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("camera-facing拘束表示は俯角でもSprite足元へ一致", async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const camera = new FreeCamera(
        "fixture-restraint-camera-facing-camera",
        new Vector3(0, 1.2, -3),
        scene
      );
      camera.setTarget(new Vector3(0, 0.4, 0));
      scene.activeCamera = camera;
      const runtime = await createV2CharacterVisualRuntime({
        scene,
        showGroundShadows: false,
        orientationMode: "camera-facing",
        includeNoGunTouchBlendFrames: false,
        assignments: Object.freeze([
          Object.freeze({
            actorId: "npc-camera-facing",
            voiceProfileId: "01",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          })
        ])
      });
      try {
        const handle = runtime.createSprite(
          "npc-camera-facing",
          "fixture-restraint-camera-facing"
        );
        handle.sprite.position.copyFromFloats(0.5, 1, 2);
        handle.sprite.isVisible = true;
        handle.syncPresentation();
        runtime.updateNoGunRestraint(
          Object.freeze(["npc-camera-facing"]),
          0
        );
        const band = scene.getMeshByName(
          "fixture-restraint-camera-facing_noGunRestraint"
        );
        assert(band !== null, "camera-facing拘束Planeがありません。");
        const restraintHeight = 0.3 * BLENDER_METERS_TO_WORLD_UNITS;
        const initialCameraUp = camera
          .getDirection(Vector3.Up())
          .normalize();
        const initialSpriteFoot = handle.sprite.position.subtract(
          initialCameraUp.scale(handle.height / 2)
        );
        const initialBandBottom = band.position.subtract(
          initialCameraUp.scale(restraintHeight / 2)
        ).add(camera.getDirection(Vector3.Forward()).scale(V2_NPC_RESTRAINT_DEPTH_OFFSET));
        const initialBandPosition = band.position.clone();
        handle.presentationMesh.computeWorldMatrix(true);
        const initialPlaneFoot = Vector3.TransformCoordinates(
          new Vector3(0, -0.5, 0), handle.presentationMesh.getWorldMatrix()
        );
        assert(
          band.billboardMode === Mesh.BILLBOARDMODE_ALL &&
            band.rotation.equals(Vector3.Zero()) &&
            initialPlaneFoot.equalsWithEpsilon(initialSpriteFoot, 0.000001) &&
            initialBandBottom.equalsWithEpsilon(
              initialSpriteFoot,
              0.000001
            ),
          "俯角cameraでSprite足元と拘束帯下端が一致しません。"
        );

        camera.position.copyFromFloats(2.5, 1.2, -1.5);
        camera.setTarget(new Vector3(0, 0.4, 0));
        camera.getViewMatrix(true);
        runtime.updateNoGunRestraint(
          Object.freeze(["npc-camera-facing"]),
          0.5
        );
        const turnedCameraUp = camera
          .getDirection(Vector3.Up())
          .normalize();
        const turnedSpriteFoot = handle.sprite.position.subtract(
          turnedCameraUp.scale(handle.height / 2)
        );
        const turnedBandBottom = band.position.subtract(
          turnedCameraUp.scale(restraintHeight / 2)
        ).add(camera.getDirection(Vector3.Forward()).scale(V2_NPC_RESTRAINT_DEPTH_OFFSET));
        handle.presentationMesh.computeWorldMatrix(true);
        const turnedPlaneFoot = Vector3.TransformCoordinates(
          new Vector3(0, -0.5, 0), handle.presentationMesh.getWorldMatrix()
        );
        assert(
          !band.position.equalsWithEpsilon(initialBandPosition, 0.000001) &&
            band.billboardMode === Mesh.BILLBOARDMODE_ALL &&
            band.rotation.equals(Vector3.Zero()) &&
            turnedPlaneFoot.equalsWithEpsilon(turnedSpriteFoot, 0.000001) &&
            turnedBandBottom.equalsWithEpsilon(
              turnedSpriteFoot,
              0.000001
            ),
          "camera yaw変更後に拘束帯がSpriteのview平面へ追随しません。"
        );
        return "俯角・yaw変更後ともcamera up上のSprite足元と帯下端が一致";
      } finally {
        runtime.dispose();
        scene.dispose();
        engine.dispose();
      }
    }),
    ...(["upright", "camera-facing"] as const).map((orientationMode) => executeTest(`Character ${orientationMode} のPNG三段階alpha・Playerfade・前後光・拘束帯・壁のWebGL合成`, async () => {
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
      configureV2TransparentDepthComposition(scene);
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
        showGroundShadows: false,
        orientationMode,
        includeNoGunTouchBlendFrames: false,
        assignments: Object.freeze([
          Object.freeze({
            actorId: "player",
            voiceProfileId: "01",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          }),
          Object.freeze({
            actorId: "npc-001",
            voiceProfileId: "01",
            portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
          })
        ])
      });
      let runtimeDisposed = false;
      const alphaCanvas = document.createElement("canvas");
      alphaCanvas.width = 3;
      alphaCanvas.height = 1;
      const alphaContext = alphaCanvas.getContext("2d");
      assert(alphaContext !== null, "三段階alphaのPNG生成用Canvasがありません。");
      alphaContext.putImageData(
        new ImageData(
          new Uint8ClampedArray([
            0, 255, 0, 0,
            0, 255, 0, 128,
            0, 255, 0, 255
          ]),
          3,
          1
        ),
        0,
        0
      );
      const alphaTexture = new Texture(
        alphaCanvas.toDataURL("image/png"),
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
          "player",
          "fixture-character-alpha"
        );
        handle.sprite.position.set(0, 0, 0);
        handle.sprite.width = 2;
        handle.sprite.height = 2;
        handle.sprite.isVisible = true;
        handle.syncPresentation();
        const characterMesh = handle.presentationMesh;
        const syncCharacter = () => {
          handle.syncPresentation();
          assert(characterMesh.material instanceof StandardMaterial,
            "WebGL描画fixtureのCharacter Plane Materialがありません。");
          characterMesh.material.diffuseTexture = alphaTexture;
          characterMesh.setVerticesData(
            VertexBuffer.UVKind,
            new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
            true
          );
        };
        syncCharacter();

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
        (frontMesh.material as StandardMaterial).alpha = 0.5;
        frontMesh.setEnabled(false);

        const bandHandle = runtime.createSprite("npc-001", "fixture-character-band");
        bandHandle.sprite.isVisible = true;
        runtime.updateNoGunRestraint(Object.freeze(["npc-001"]), 0.5);
        bandHandle.sprite.isVisible = false;
        const restraintBand = scene.getMeshByName(
          "fixture-character-band_noGunRestraint"
        );
        assert(restraintBand !== null, "Runtimeの拘束帯が生成されません。");
        // 実際の帯材質を拡大し、同じPNG三領域上の画素を比較する。
        restraintBand.position.set(0, 0, -0.25);
        restraintBand.rotation.set(0, 0, 0);
        restraintBand.scaling.set(2, 2, 1);
        restraintBand.isVisible = false;

        const wallMesh = MeshBuilder.CreatePlane(
          "fixture-character-alpha-wall",
          { width: 0.6, height: 2 },
          scene
        );
        wallMesh.position.set(-2 / 3, 0, -0.5);
        const wallMaterial = new StandardMaterial(
          "fixture-character-alpha-wall-material",
          scene
        );
        wallMaterial.disableLighting = true;
        wallMaterial.diffuseColor = Color3.Black();
        wallMaterial.emissiveColor = new Color3(1, 1, 0);
        wallMesh.material = wallMaterial;
        wallMesh.setEnabled(false);

        await scene.whenReadyAsync();
        const captureSamples = async () => {
          scene.render();
          await scene.whenReadyAsync();
          for (let frame = 0; frame < 3; frame += 1) {
            scene.render();
          }
          const pixels = await engine.readPixels(0, 0, 96, 96, true, true);
          return [16, 48, 80].map((x) => readRgbaPixel(pixels, 96, x, 48));
        };

        const rearSamples = await captureSamples();
        const opaqueSample = rearSamples.find(
          ([red, green, blue]) => green > 200 && red < 20 && blue < 20
        );
        const transparentSample = rearSamples.find(
          ([red, green, blue]) => blue > 200 && red < 20 && green < 20
        );
        const halfSample = rearSamples[1];
        assert(
          opaqueSample !== undefined &&
            transparentSample !== undefined &&
            halfSample[0] < 20 &&
            Math.abs(halfSample[1] - opaqueSample[1] * (128 / 255)) <= 20 &&
            Math.abs(halfSample[2] - transparentSample[2] * (127 / 255)) <= 20,
          `PNGのalpha0/0.5/1が奥側の光と一度ずつ合成されません: ${JSON.stringify(rearSamples)}`
        );

        handle.sprite.color.a = 0.5;
        syncCharacter();
        const fadedSamples = await captureSamples();
        assert(fadedSamples.every(([red, green, blue], index) => {
          const effectiveAlpha = (rearSamples[index][1] / opaqueSample[1]) * 0.5;
          return red < 20 &&
            Math.abs(green - opaqueSample[1] * effectiveAlpha) <= 20 &&
            Math.abs(blue - transparentSample[2] * (1 - effectiveAlpha)) <= 20;
        }), `Playerのfade alpha0.5がPNG alphaと掛け合わされず、奥光が遮られます: ${JSON.stringify({ rearSamples, fadedSamples })}`);
        handle.sprite.color.a = 1;
        syncCharacter();

        frontMesh.setEnabled(true);
        const frontSamples = await captureSamples();
        assert(
          frontSamples.every(([red, green, blue], index) =>
            Math.abs(red - 127.5) <= 16 &&
            Math.abs(green - rearSamples[index][1] * 0.5) <= 16 &&
            Math.abs(blue - rearSamples[index][2] * 0.5) <= 16
          ),
          `Character前面の光が奥側のCharacterと光を透過しません: ${JSON.stringify({ rearSamples, frontSamples })}`
        );

        frontMesh.setEnabled(false);
        wallMesh.setEnabled(true);
        const wallSamples = await captureSamples();
        restraintBand.isVisible = true;
        const restraintSamples = await captureSamples();
        const wallSample = restraintSamples[0];
        assert(
          wallSample[0] > 230 && wallSample[1] > 230 && wallSample[2] < 20 &&
            wallSample.every((channel, index) =>
              Math.abs(channel - wallSamples[0][index]) <= 2
            ) &&
            restraintSamples.slice(1).every(([red, green, blue], index) =>
              red > wallSamples[index + 1][0] + 20 &&
              green + blue > 80 &&
              green + blue < wallSamples[index + 1][1] + wallSamples[index + 1][2] - 10
            ),
          `拘束帯が壁を越えるか、帯の奥のCharacterと光が透けません: ${JSON.stringify({ wallSamples, restraintSamples })}`
        );

        runtime.dispose();
        runtimeDisposed = true;
        return `PNG alpha0/0.5/1=${JSON.stringify(rearSamples)}、Playerfade=${JSON.stringify(fadedSamples)}、前面の光=${JSON.stringify(frontSamples)}、壁と拘束帯=${JSON.stringify(restraintSamples)}`;
      } finally {
        if (!runtimeDisposed) {
          runtime.dispose();
        }
        alphaTexture.dispose();
        scene.dispose();
        engine.dispose();
      }
    })),
    executeTest("実拘束帯の同位置Characterへの合成・両表示モード・平行斜視", async () => {
      const results: string[] = [];
      for (const orientationMode of ["upright", "camera-facing"] as const) {
        const canvas = document.createElement("canvas");
        const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false }, false);
        engine.setSize(96, 96);
        const scene = new Scene(engine);
        configureV2TransparentDepthComposition(scene);
        scene.imageProcessingConfiguration.isEnabled = false;
        scene.clearColor = new Color4(0, 0, 0, 1);
        const camera = new FreeCamera("実拘束帯camera", new Vector3(0, 1, -3), scene);
        camera.setTarget(new Vector3(0, 1, 0));
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        camera.minZ = 0.1;
        camera.maxZ = 10;
        scene.activeCamera = camera;
        const runtime = await createV2CharacterVisualRuntime({
          scene, orientationMode, showGroundShadows: false,
          includeNoGunTouchBlendFrames: false,
          assignments: [{ actorId: "npc-band", voiceProfileId: "01", portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY }]
        });
        const textureCanvas = document.createElement("canvas");
        textureCanvas.width = 1; textureCanvas.height = 1;
        const context = textureCanvas.getContext("2d")!;
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, 1, 1);
        const texture = new Texture(textureCanvas.toDataURL("image/png"), scene, false, false, Texture.NEAREST_SAMPLINGMODE);
        texture.hasAlpha = true;
        try {
          const handle = runtime.createSprite("npc-band", "fixture-real-band");
          handle.sprite.position.set(0, 1, 0);
          handle.sprite.width = 0.333;
          handle.sprite.height = 0.4;
          handle.sprite.isVisible = true;
          handle.syncPresentation();
          const character = handle.presentationMesh;
          (character.material as StandardMaterial).diffuseTexture = texture;
          runtime.updateNoGunRestraint(["npc-band"], 0.5);
          const band = scene.getMeshByName("fixture-real-band_noGunRestraint")!;
          const renderPixel = async () => {
            await scene.whenReadyAsync();
            for (let frame = 0; frame < 3; frame++) {
              scene.render();
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
            const pixels = await engine.readPixels(0, 0, 96, 96, true, true);
            return readRgbaPixel(pixels, 96, 48, 48);
          };
          for (const oblique of [false, true]) {
            camera.position.set(oblique ? 0.9 : 0, oblique ? 1.5 : 1, -3);
            camera.setTarget(handle.sprite.position);
            const forward = camera.getDirection(Vector3.Forward());
            runtime.setFacingYaw(Math.atan2(forward.x, forward.z));
            handle.syncPresentation();
            runtime.updateNoGunRestraint(["npc-band", "npc-band"], 0.5);
            const viewCenter = Vector3.TransformCoordinates(band.position, camera.getViewMatrix(true));
            camera.orthoLeft = viewCenter.x - 0.15;
            camera.orthoRight = viewCenter.x + 0.15;
            camera.orthoBottom = viewCenter.y - 0.03;
            camera.orthoTop = viewCenter.y + 0.03;
            const materialAlpha = band.material!.alpha;
            assert(scene.meshes.filter((mesh) => mesh.name.endsWith("_noGunRestraint")).length === 1 &&
              Math.abs(materialAlpha - 0.675) <= 0.000001 &&
              Math.abs(band.scaling.x - handle.sprite.width) <= 0.000001 &&
              Math.abs(band.scaling.y - 0.3 * BLENDER_METERS_TO_WORLD_UNITS) <= 0.000001,
            "実拘束帯が重複するか、元の幅・高さ・濃さが変わりました。");
            band.isVisible = false;
            const characterOnly = await renderPixel();
            band.isVisible = true;
            character.isVisible = false;
            const bandOnly = await renderPixel();
            character.isVisible = true;
            const combined = await renderPixel();
            const bandAlpha = bandOnly[0] / 255;
            const expected = characterOnly.slice(0, 3).map((channel, index) =>
              channel * (1 - bandAlpha) + bandOnly[index]
            );
            assert(characterOnly[1] > 245 && bandOnly[0] > 30 && bandOnly[0] < 220 &&
              expected.every((channel, index) => Math.abs(channel - combined[index]) <= 4),
            `${orientationMode}/${oblique ? "斜視" : "平行"}で同位置の拘束帯がMAX混色されます: ${JSON.stringify({ characterOnly, bandOnly, combined, expected })}`);
            results.push(`${orientationMode}/${oblique ? "斜視" : "平行"}: ${combined.join(",")}`);
          }
        } finally {
          runtime.dispose(); texture.dispose(); scene.dispose(); engine.dispose();
        }
      }
      return results.join(" / ");
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
