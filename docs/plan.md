# develop マージ前の公開処刑ブランチ整理 計画

更新日: 2026-04-11

## プロンプト
このブランチで実装した内容をdevelopブランチにマージする予定です。内容をリファクタリングしてください。

PLEASE IMPLEMENT THIS PLAN:
# develop マージ前の公開処刑ブランチ整理 計画

## 要約
- 実装開始時に現在の `docs/plan.md` を `docs/plan_2026-04-11_title-start-layout-prev2.md` へ退避し、新しい `docs/plan.md` をこのタスク用に作成して、原文プロンプト・進捗・結果を都度更新する。
- 目的は、このブランチで増えた責務を `src/main.ts` から分離して、`develop` へマージしやすい構造にすること。主対象は公開処刑進行、タイトル開始導線、タイトル表示同期で、UI 見た目や保存形式は原則維持する。
- リファクタ中に必要な軽微な挙動調整は許容するが、公開処刑ルールや設定項目の意味は変えない。

## ステップ
- [x] 既存の `docs/plan.md` を `docs/plan_2026-04-11_title-start-layout-prev2.md` へ退避し、新しい `docs/plan.md` を本タスク用に作成する
- [x] `src/ui/titleOverlayController.ts` を新設し、タイトルのロード表示・開始案内・モード表示を `main.ts` から切り出す
- [x] `src/game/publicExecutionController.ts` を新設し、公開処刑シナリオ準備・進行・ヒット管理・候補検出を `main.ts` から切り出す
- [x] `src/main.ts` のタイトル遷移と公開処刑呼び出しを controller ベースへ整理する
- [x] `npm run build` を実行し、結果と未確認の手動確認項目を `docs/plan.md` に反映する

## 結果
- `docs/plan.md` を `docs/plan_2026-04-11_title-start-layout-prev2.md` へ退避し、本タスク用の計画書を新規作成した。
- `src/ui/titleOverlayController.ts` を新設し、タイトル画面の `NOW LOADING`、進捗表示、開始案内、モード文言切替を `main.ts` から切り出した。
- `src/main.ts` は title overlay DOM の直接操作とロード表示タイマー管理をやめ、`titleOverlayController.createLoadingSession()` と `setInstantExecutionMode()` 経由で扱う構成へ整理した。
- `src/game/publicExecutionController.ts` を新設し、instant execution の scenario 準備、通常プレイ中の公開処刑候補判定、execution 中のヒット演出・斉射進行・プレイヤー射撃判定・voice override を `main.ts` から切り出した。
- `src/main.ts` は公開処刑について `publicExecutionController.prepareInstantScenario()`、`advanceAutoTrigger()`、`enter()`、`update()`、`reset()`、`getScenario()` を呼ぶ構成へ整理した。あわせて `startGame` と `startInstantExecution` の title UI 非表示・pointer lock・`titleStartPreparation.invalidateReady()` を `finalizeTitleStartTransition()` へ共通化した。
- `src/main.ts` に `syncTitleStartSettings()` と `setTitleUiVisible()` を追加し、タイトル開始前の設定反映と、タイトル復帰時の UI 表示切替を共通化した。
- `npm run build` を実行し、`vite build` と `tsc -p tsconfig.electron.json` の成功を確認した。
- サバイバルモード開始直後に `buildPlayerHitSequenceConfig` / `buildNpcHitSequenceConfig` が未定義で停止する不具合を修正するため、`src/main.ts` に roulette/通常被弾用の hit sequence helper を復元した。
- `npx tsc --noEmit` で今回の未定義参照が消えたことを確認した。別件の既存型エラーとして `src/game/portraitSprites.ts`、`src/ui/input.ts`、`src/ui/titleSettingsStorage.ts` は引き続き残っている。
- instant execution 開始時に `finalizeTitleStartTransition()` が execution 用の HUD override を消していたため、`src/main.ts` の `startInstantExecution()` で title 遷移完了処理を `publicExecutionController.enter()` より先に実行するよう修正し、操作説明パネルが表示される状態へ戻した。
- 手動確認は未実施。通常タイトル開始、instant execution 開始、公開処刑 3 系統、execution replay の実機確認が未完了。
