# タイトル画面「NPC洗脳完了済み人数」スライダー化 計画

更新日: 2026-02-21

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# タイトル画面「NPC洗脳完了済み人数」スライダー化 計画

## 概要
`DEFAULT SETTINGS` の「全NPCが洗脳完了済み」チェックを廃止し、`NPC洗脳完了済み人数` スライダー（内部値は 0〜100%）へ置換する。  
表示人数 `n` は `floor(NPC初期人数 * スライダー% / 100)` で算出し、開始時にランダム抽選した `n` 人へ既存の洗脳完了モード抽選（`applyNpcDefaultHaigureState`）を適用する。  
ユーザー指定により、`プレイヤーが洗脳完了済み` とは独立設定にする。

## 実装前ドキュメント運用（AGENTS.md準拠）
1. `Get-Date -Format yyyy-MM-dd` で日付取得。
2. 既存 `docs/plan.md` は前タスク完了済みのため `docs/plan_2026-02-15_...-prev.md` 形式へ改名。
3. 新規 `docs/plan.md` を作成し、今回プロンプト原文・ステップ・結果欄を記載。
4. 実装の各ステップ完了ごとに `docs/plan.md` のチェックと結果を更新。

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-02-15_initial-portrait-opt-prev.md` へ改名し、新規 `docs/plan.md` を作成
- [x] `src/ui/defaultSettingsPanel.ts` をスライダー仕様へ置換（型変更含む）
- [x] `src/style.css` に `default-settings-panel` 用スライダーUIスタイルを追加
- [x] `src/main.ts` の設定型参照・警告判定・開始時ランダム抽選適用ロジックを更新
- [x] `README.md` の調整可能項目説明を新仕様へ更新
- [x] `npx tsc -p tsconfig.json --noEmit` で型チェック

## 結果
- `DEFAULT SETTINGS` の「全NPCが洗脳完了済み」を廃止し、`NPC洗脳完了済み人数 n人` 表示 + 0〜100%スライダーの2段UIへ置換した。
- `DefaultStartSettings` は `startAllNpcsAsHaigure` を削除し、`initialBrainwashedNpcPercent` を追加した。
- 開始時の洗脳完了済みNPC人数は `floor(initialNpcCount * initialBrainwashedNpcPercent / 100)` で算出し、毎ゲーム開始時にランダム抽選した `n` 人へ `applyNpcDefaultHaigureState` を適用する実装に変更した。
- ゲームオーバー警告判定も同じ `n` 算出に合わせて更新した。
- `README.md` に `defaultDefaultStartSettings.initialBrainwashedNpcPercent` の説明（0〜100%と切り捨て計算）を追加した。
- `npx tsc -p tsconfig.json --noEmit` は成功した。
