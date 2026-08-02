import { NullEngine, Scene, Vector3 } from "@babylonjs/core";

import { resolveV2FirstPersonCharacterVisualFrame } from "../../../src/v2/v2PlayerCharacterVisual";
import { V2_DEFAULT_PORTRAIT_DIRECTORY } from "../../../src/v2/v2CharacterAssignments";
import {
  V2_PORTRAIT_IMAGE_BASE_NAMES,
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
          size.width <= 0.2 &&
          size.height <= 0.425,
        `状態cellまたは縦横比が不正です: ${JSON.stringify(size)}`
      );
      return "portrait 8cell、temporary gun、縦横比を維持";
    }),
    executeTest("組込みCharacter表示Runtimeの所有契約", async () => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const runtime = await createV2CharacterVisualRuntime({
        scene,
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
        assert(
          handle.sprite.cellIndex === 3 &&
            handle.width > 0 &&
            handle.height > handle.width,
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
        return "default状態、未割当actor、Sprite二重破棄を検証";
      } finally {
        runtime.dispose();
        scene.dispose();
        engine.dispose();
      }
    }),
    executeTest("一人称Character表示の無効状態", () => {
      const frame = resolveV2FirstPersonCharacterVisualFrame({
        active: false,
        footPosition: new Vector3(1, 2, 3),
        viewForward: new Vector3(0, -1, 0),
        spriteHeight: 0.4
      });
      assert(
        !frame.visible &&
          frame.alpha === 0 &&
          frame.position.equalsWithEpsilon(
            new Vector3(1, 2.2, 3),
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
        spriteHeight: 0.4
      });
      assert(
        frame.visible &&
          Math.abs(frame.alpha - 0.5) <= 0.000001 &&
          Math.abs(frame.position.z - 0.02) <= 0.000001,
        `中間補間が不正です: ${JSON.stringify({
          alpha: frame.alpha,
          position: frame.position.asArray()
        })}`
      );
      return "72.5度でalpha 0.5、前方offset 0.02";
    }),
    executeTest("一人称Character表示の真下", () => {
      const frame = resolveV2FirstPersonCharacterVisualFrame({
        active: true,
        footPosition: new Vector3(1, 2, 3),
        viewForward: new Vector3(0, -1, 0),
        spriteHeight: 0.4
      });
      assert(
        frame.visible &&
          frame.alpha === 1 &&
          frame.position.equalsWithEpsilon(
            new Vector3(1, 2.2, 3),
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
