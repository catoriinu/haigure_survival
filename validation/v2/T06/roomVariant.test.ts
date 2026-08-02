import {
  SCHOOL_ROOM_VARIANT_ROOM_IDS,
  createSchoolRoomVariantSelections,
  createSchoolRuntimeSettings
} from "../../../src/world/schoolRuntimeSettings";
import { V2_ROOM_VARIANT_VISUAL_REVIEW_LEVEL } from "../../../src/v2/roomVariantVisualReview";

import { assert, assertThrows, executeTest } from "./testUtils";

const countDisordered = (
  selections: ReturnType<typeof createSchoolRoomVariantSelections>
) =>
  selections.filter((selection) => selection.variant === "disordered")
    .length;

export const runRoomVariantTests = async () =>
  Promise.all([
    executeTest("通常入口の全教室荒れ版確認値", () => {
      const selections = createSchoolRoomVariantSelections(
        createSchoolRuntimeSettings(
          V2_ROOM_VARIANT_VISUAL_REVIEW_LEVEL
        ),
        0
      );
      assert(
        V2_ROOM_VARIANT_VISUAL_REVIEW_LEVEL === 10 &&
          countDisordered(selections) ===
            SCHOOL_ROOM_VARIANT_ROOM_IDS.length,
        "通常入口の見た目確認値で全20室が荒れ版になりません。"
      );
      return "確認値10 / 荒れ版20室 / 通常・性能・stress入口で共用";
    }),
    executeTest("荒れ状態0／2／10の選択件数", () => {
      const seed = 0x5430_0601;
      const level0 = createSchoolRoomVariantSelections(
        createSchoolRuntimeSettings(0),
        seed
      );
      const level2 = createSchoolRoomVariantSelections(
        createSchoolRuntimeSettings(2),
        seed
      );
      const level10 = createSchoolRoomVariantSelections(
        createSchoolRuntimeSettings(10),
        seed
      );
      assert(
        level0.length === SCHOOL_ROOM_VARIANT_ROOM_IDS.length &&
          level2.length === SCHOOL_ROOM_VARIANT_ROOM_IDS.length &&
          level10.length === SCHOOL_ROOM_VARIANT_ROOM_IDS.length,
        "荒れ状態別の選択結果が全20室を保持していません。"
      );
      assert(
        countDisordered(level0) === 0 &&
          countDisordered(level2) === 4 &&
          countDisordered(level10) === 20,
        "荒れ状態0／2／10の荒れ版室数が0／4／20ではありません。"
      );
      return "level 0=0室 / level 2=4室 / level 10=20室";
    }),
    executeTest("荒れ状態抽選のseed決定性", () => {
      const settings = createSchoolRuntimeSettings(2);
      const first = createSchoolRoomVariantSelections(
        settings,
        0x5430_0601
      );
      const repeated = createSchoolRoomVariantSelections(
        settings,
        0x5430_0601
      );
      const different = createSchoolRoomVariantSelections(
        settings,
        0x5430_0602
      );
      const serialize = (
        selections: ReturnType<typeof createSchoolRoomVariantSelections>
      ) => JSON.stringify(selections);
      assert(
        serialize(first) === serialize(repeated),
        "同一seedで荒れ版室の選択結果が一致しません。"
      );
      assert(
        serialize(first) !== serialize(different),
        "異なる検証seedが同じ荒れ版室を選択しました。"
      );
      return "同一seedは同一順序、異なるseedは異なる4室を選択";
    }),
    executeTest("荒れ状態の必須範囲契約", () => {
      assertThrows(
        () => createSchoolRuntimeSettings(-1),
        "荒れ状態-1が拒否されません。"
      );
      assertThrows(
        () => createSchoolRuntimeSettings(11),
        "荒れ状態11が拒否されません。"
      );
      assertThrows(
        () => createSchoolRuntimeSettings(2.5),
        "整数ではない荒れ状態が拒否されません。"
      );
      return "範囲外と非整数を例外として拒否";
    })
  ]);
