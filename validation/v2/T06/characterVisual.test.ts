import {
  Color4,
  NullEngine,
  Scene,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import { resolveV2FirstPersonCharacterVisualFrame } from "../../../src/v2/v2PlayerCharacterVisual";
import { V2_DEFAULT_PORTRAIT_DIRECTORY } from "../../../src/v2/v2CharacterAssignments";
import { resolveV2CharacterFacingYaw } from "../../../src/v2/v2CharacterFacing";
import {
  V2_PORTRAIT_IMAGE_BASE_NAMES,
  V2_CHARACTER_VISUAL_MAX_HEIGHT,
  V2_CHARACTER_VISUAL_MAX_WIDTH,
  calculateV2CharacterVisualSize,
  createV2CharacterVisualRuntime,
  createV2PortraitFileInventoryFromPublicPaths,
  getV2CharacterVisualCellIndex,
  resolveV2PortraitFiles
} from "../../../src/v2/v2CharacterVisualRuntime";
import { assert, executeTest, type T06TestResult } from "./testUtils";

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
        createV2PortraitFileInventoryFromPublicPaths(paths);
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
          createV2PortraitFileInventoryFromPublicPaths(paths.slice(0, -1))
        );
      } catch {
        missingStateRejected = true;
      }
      let duplicateStateRejected = false;
      try {
        createV2PortraitFileInventoryFromPublicPaths([
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
          Math.abs(size.width - V2_CHARACTER_VISUAL_MAX_WIDTH) <= 0.000001 &&
          Math.abs(size.height - 1216 / 2496) <= 0.000001 &&
          Math.abs(defaultSize.width - 11 / 35) <= 0.000001 &&
          Math.abs(defaultSize.height - V2_CHARACTER_VISUAL_MAX_HEIGHT) <=
            0.000001,
        `状態cellまたは縦横比が不正です: ${JSON.stringify(size)}`
      );
      return "portrait 8cell、temporary gun、V1最終の幅1/3・高さ2/3上限";
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
        handle.setState("brainwash-complete-gun", false);
        handle.syncPresentation();
        assert(
          handle.sprite.cellIndex === 3 &&
            handle.width > 0 &&
            handle.height > handle.width &&
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
        handle.dispose();
        let duplicateDisposeRejected = false;
        try {
          handle.dispose();
        } catch {
          duplicateDisposeRejected = true;
        }
        assert(
          unknownActorRejected && duplicateDisposeRejected,
          "未割当actorまたはSprite二重破棄が拒否されません。"
        );
        return "Sprite描画、default状態、未割当actor、Sprite二重破棄を検証";
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
          })
        ])
      });
      let runtimeDisposed = false;
      try {
        const first = runtime.createSprite("player", "fixture-upright-first");
        const second = runtime.createSprite("player", "fixture-upright-second");
        const firstMesh = first.presentationMesh;
        const secondMesh = second.presentationMesh;
        assert(
          firstMesh !== null &&
            secondMesh !== null &&
            firstMesh.material === secondMesh.material &&
            first.sprite.manager.layerMask === 0,
          "upright Planeまたは共有Materialが作成されません。"
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
          secondMesh.isDisposed() && !scene.materials.includes(sharedMaterial),
          "Runtime破棄で残存Planeと共有Materialが破棄されません。"
        );
        return "SpriteManager描画を隠し、world-up Planeを共有Materialで同期・破棄";
      } finally {
        if (!runtimeDisposed) {
          runtime.dispose();
        }
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
      const frame = resolveV2FirstPersonCharacterVisualFrame({
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
      const frame = resolveV2FirstPersonCharacterVisualFrame({
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
      const frame = resolveV2FirstPersonCharacterVisualFrame({
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
      const frame = resolveV2FirstPersonCharacterVisualFrame({
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
      return "真下で完全表示";
    })
  ]);
