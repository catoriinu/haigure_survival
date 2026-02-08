# 即洗脳ON時のプレイヤー遷移修正 計画

更新日: 2026-02-08

## プロンプト
「即洗脳」ON時、プレイヤーに光線命中したときも、in-progressではなく`brainwash-complete-haigure`状態に即遷移してください。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] `src/main.ts` のプレイヤー被弾後遷移を `instantBrainwash` 設定で分岐
- [x] 型チェックとビルドで検証
- [x] `docs/plan.md` の結果欄を更新

## 結果
`src/main.ts` のプレイヤー被弾シーケンス完了時の遷移を分岐化した。
`runtimeBrainwashSettings.instantBrainwash` が ON のときは
`brainwash-in-progress` へ遷移せず、`brainwash-complete-haigure` へ即遷移するようにした。
OFF のときは従来どおり `brainwash-in-progress` へ遷移する。

既存の `brainwashChoiceStarted` / `brainwashChoiceUnlocked` の更新は維持しているため、
従来の選択入力やHUD表示の開始条件は崩さない。

検証として `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` を実行し、どちらも成功した。
