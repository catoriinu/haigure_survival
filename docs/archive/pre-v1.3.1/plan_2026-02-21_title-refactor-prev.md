# `feature_fix_title` マージ前リファクタリング計画 計画

更新日: 2026-02-21

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# `feature_fix_title` マージ前リファクタリング計画（コミットまで）

## 概要
- `develop` へのマージは実施しない。
- 実施範囲は「中規模」、コミットは「2コミット」で固定。
- 重点対象は `src/main.ts` と `src/style.css`。
- 事前確認として `npm run build` は成功済み（ビルドエラーなし）。

## 調査で確定したリファクタリング余地
1. `src/main.ts` にタイトル設定永続化ロジック（型・正規化・I/O）が集中しており、責務分離余地が大きい。
2. `src/main.ts` の `startGame` / `returnToTitle` が `async` 化され、入力多重時の競合リスクがある。
3. `src/main.ts` の `applyStageSelection` は `await resetGame()` 後にリクエスト再検証がなく、連打時に古い処理が後勝ちする余地がある。
4. `src/style.css` はパネル系・ボタン系の共通宣言が重複しており、同一見た目を維持したまま整理可能。

## 実装方針（決定仕様）
### コミット1: 動作安定化（`fix`）
- 対象: `src/main.ts`
- 変更:
  - タイトル遷移中フラグ（例: `titleTransitionInProgress`）を追加し、`startGame` と `returnToTitle` の多重実行を抑止。
  - `startGame` / `returnToTitle` は `try/finally` で遷移フラグを確実に解除。
  - `applyStageSelection` は `await resetGame()` 後に `requestId` と `gamePhase` を再検証し、古い要求の後勝ち更新を防止。
  - 既存仕様（ゲーム内容・UI見た目）は変更しない。
- コミットメッセージ:
  - `fix: タイトル遷移時の非同期競合を解消`

### コミット2: 構造整理（`refactor`）
- 対象: `src/main.ts`, `src/style.css`, `src/world/stageSelection.ts`, 新規 `src/ui/titleSettingsStorage.ts`
- 変更:
  - `main.ts` の永続化関連ロジックを `src/ui/titleSettingsStorage.ts` に抽出。
  - 抽出対象は、保存データ型・正規化処理・`load/save/clear`・デフォルト生成。
  - `main.ts` は UI制御とゲーム状態遷移に集中させ、永続化I/Oは新モジュール経由に統一。
  - `src/world/stageSelection.ts` の未使用 `createStageSelector` を削除。
  - `src/style.css` は共通化可能な宣言（パネル基本スタイル、タイトルボタン基本スタイル）をセレクタグループで整理し、見た目は不変。
- コミットメッセージ:
  - `refactor: タイトル設定永続化とタイトルUIスタイルを整理`

## 公開API / 型・インターフェース変更
- 追加: `src/ui/titleSettingsStorage.ts` のエクスポート
  - `PersistedTitleSettings`
  - `buildDefaultPersistedTitleSettings(...)`
  - `normalizePersistedTitleSettings(...)`
  - `loadPersistedTitleSettings(...)`
  - `savePersistedTitleSettings(...)`
  - `clearPersistedTitleSettings(...)`
- 削除: `src/world/stageSelection.ts` の `createStageSelector` エクスポート（現状参照なしを確認済み）。
- 既存UIコンポーネントの外部インターフェースは変更しない。

## 検証項目（受け入れ基準）
1. ビルド確認
- `npm run build` が成功すること。

2. タイトル遷移の競合確認
- タイトル画面で左クリック連打しても、開始処理が多重実行されないこと。
- `execution/assembly` から `Enter` 連打しても、タイトル復帰が多重実行されないこと。

3. ステージ切替競合確認
- タイトルでステージ選択を連続変更しても、最後に選んだステージが最終状態になること。
- 切替中に開始操作しても矛盾状態にならないこと。

4. 永続化とリセット確認
- 音量・ステージ・各設定の変更が即時保存され、再読込で復元されること。
- 「デフォルトに戻す」後に既存仕様どおりの状態（キー削除ベース）になること。

5. スタイル回帰確認
- タイトル右下パネル群、リセットボタン、設定パネル統合表示の見た目と配置が実質不変であること。

## ドキュメント運用（`AGENTS.md` 準拠）
- `Get-Date -Format yyyy-MM-dd` 実行済み（`2026-02-21`）。
- 新タスク扱いとして、既存 `docs/plan.md` を改名し退避（例: `docs/plan_2026-02-21_title-refactor-prev.md`）。
- 新規 `docs/plan.md` を作成し、以下を都度更新:
  - プロンプト原文
  - ステップ進捗（1ステップごと）
  - 結果要約（最終状態）
- 文字コードは UTF-8（BOMなし）で統一。

## 前提・デフォルト
- ブランチは `feature_fix_title` のまま作業する。
- `develop` へのマージ・push はこのタスクでは実施しない。
- コミットは上記2件のみを作成し、不要な差分は含めない。
- 防御的プログラミングは追加しない（今回の修正は実際の競合経路に限定）。

## ステップ
- [ ] `src/main.ts` にタイトル遷移の非同期競合対策（遷移フラグ + `try/finally` + ステージ再検証）を実装
- [ ] コミット1（`fix: タイトル遷移時の非同期競合を解消`）を作成
- [ ] 永続化ロジックを `src/ui/titleSettingsStorage.ts` へ抽出し、`src/main.ts` を接続
- [ ] `src/world/stageSelection.ts` から未使用 `createStageSelector` を削除
- [ ] `src/style.css` の重複スタイルを共通化（見た目不変）
- [ ] ビルド確認（`npm run build`）を実施
- [ ] コミット2（`refactor: タイトル設定永続化とタイトルUIスタイルを整理`）を作成
- [ ] 実装結果を `docs/plan.md` の結果へ反映

## 結果
- 実装中
