# labyrinth_dynamic の Dセル時限光線ギミック実装 計画

更新日: 2026-02-14

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# labyrinth_dynamic の Dセル時限光線ギミック実装計画

追加要件:
- 当選確率は各セットごとに5%（可変）とする。
- 可変内訳として、抽選回数ごとに1%ずつ当選確率を増加させる。
- 迷宮（構造変化）では、alive状態NPCは「現在光線発射中の床セル」に踏み入る前に移動をキャンセルし、移動先を再抽選する。
- Dセルでも光線非発射時は通行可。洗脳済みNPCは現行通り光線セルを通行可。

## 要約
`labyrinth_dynamic` ステージ限定で、`zone` の `D` セルに対して「点滅予告 → 床から太い光線発射 → 次セットへ切替」を周期実行する専用システムを追加します。
壁出現は実装せず、光線のみ実装します。
抽選は「4近傍連結した D セット」を単位にし、毎サイクル1セットを等確率抽選します（同一セット連続当選を許容）。

## 確定仕様（今回ロック済み）
- 対象ステージ: `labyrinth_dynamic` のみ。
- ステージファイル方針: 現ファイル名 `public/stage/labyrinth_ dynamic.json` を維持して `STAGE_CATALOG` に追加。
- 初回開始: ステージ開始直後に1回目の抽選・点滅開始。
- 時間定数: 警告5秒、発射20秒。
- 次抽選開始: 現在発射中の残り5秒時点（= 発射開始から15秒後）に次の点滅開始。
- 切替: 次の点滅完了時に新規セット発射。旧光線は20秒満了で終了（終端1秒フェード）。
- 抽選単位: 4近傍連結セット、1サイクル1セット、等確率。
- SE: 1セットにつき1回再生。
- NPC凍結: なし（通常挙動のまま）。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、今回タスク用の `docs/plan.md` を新規作成
- [x] ステージID/ステージ選択/ステージJSONユーティリティ（zoneMap生成）を拡張
- [x] Dセル連結セット生成ロジックと dynamicBeamSystem を新規実装
- [x] `createTrapBeam` の持続時間パラメータ化（既存互換維持）
- [x] `main.ts` に dynamicBeamSystem を統合（初期化・切替・リセット・更新）
- [x] 型チェック実行と結果確認
- [x] dynamicBeam抽選を「各セット独立確率（初回5%）」へ変更
- [x] 抽選回数に応じた確率増加（+1%/回）を実装
- [x] 型チェック実行と結果確認（追加要件分）
- [x] alive状態NPCの「動的光線セル進入前キャンセル+再抽選」を実装
- [x] 型チェック実行と結果確認（NPC回避追加要件分）

## 結果
- `src/world/stageIds.ts` に `LABYRINTH_DYNAMIC_STAGE_ID` を追加し、`src/world/stageSelection.ts` の `STAGE_CATALOG` に `labyrinth_dynamic`（`public/stage/labyrinth_ dynamic.json`）を追加した。
- `src/world/stageJson.ts` に `createZoneMapFromStageJson(...)` を追加し、`zone` チャンネルを `env` と同じく「左右反転 + mapScale展開」して取得できるようにした。
- `src/game/beams.ts` の `createTrapBeam(...)` に `sustainDurationSec` 引数（既定4秒）を追加し、既存呼び出し互換を維持した。
- `src/game/dynamicBeam/types.ts` / `src/game/dynamicBeam/candidates.ts` / `src/game/dynamicBeam/system.ts` を新規追加し、Dセル4近傍連結セット抽選・点滅警告（5秒）・発射（20秒）・残り5秒で次警告開始・セット単位SE1回を実装した。
- `src/main.ts` に `dynamicBeamSystem` を統合し、初期化時・ステージ切替時・`resetGame` 時に `syncStageContext/resetRuntimeState` を実行、`runRenderLoop` で毎フレーム `update` するようにした。
- `npx tsc -p tsconfig.json --noEmit` を実行し、成功した。
- `src/game/dynamicBeam/system.ts` の抽選を「各セット独立判定」に変更し、抽選確率を `5% + (抽選回数 - 1) * 1%`（上限100%）で適用するようにした。
- 抽選が0セット当選の回は、次サイクルへ無発射で繰り越す挙動にした（追加フォールバック抽選なし）。
- `src/game/npcs.ts` で alive状態NPCの移動先抽選・経路進行前に「禁止セル判定」を通すようにし、次セルが禁止なら移動をキャンセルして再抽選するようにした。禁止セルが無い場合は従来通り移動する。
- `src/main.ts` で `sourceId === "dynamic_beam"` かつ `active` のビームを毎フレームセル化し、alive NPC用の禁止セル判定として `updateNpcs` に渡すようにした。これにより `labyrinth_dynamic` の発射中セルのみを回避対象にした。
