# ビーム衝突判定共通化 計画

更新日: 2026-02-08

## プロンプト
特殊な例外処理を入れるより、共通化してほしいです。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] 既存の通常戦闘/NPC公開処刑のビーム衝突判定差分を確認
- [x] `src/game/beamCollision.ts` に発射元除外つき判定ヘルパーを追加
- [x] `src/game/npcs.ts` と `src/main.ts` を共通ヘルパー利用に変更
- [x] 公開処刑側の個別回避コード（自己衝突除外の直書き・発射位置補正）を削除
- [x] 型チェックとビルド確認を実行
- [x] `docs/plan.md` の結果を更新

## 結果
公開処刑/NPC通常戦闘の双方で、自己発射ビームを発射元へ当てない判定を
`isBeamHittingTargetExcludingSource` に共通化した。
公開処刑側にあった個別の自己除外分岐と発射位置オフセットを削除し、
通常戦闘と同等の発射位置・同等の衝突判定ヘルパー経由で命中判定される構成に統一した。
`npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` は成功。
