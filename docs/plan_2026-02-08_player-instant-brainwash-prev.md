# 「即洗脳」をBRAINWASH SETTINGSへ移動 計画

更新日: 2026-02-08

## プロンプト
やはり「即洗脳」はBRAINWASH SETTINGSの方に移動してください。位置は「ポーズ」の上です。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] `src/ui/defaultSettingsPanel.ts` から `即洗脳` を削除し、型責務を整理
- [x] `src/ui/brainwashSettingsPanel.ts` に `即洗脳` チェックを追加（位置は `ポーズ` の上）
- [x] `src/main.ts` の設定保持・適用先を `BrainwashSettings` 側へ移動
- [x] `src/style.css` に `brainwash-settings-panel` のチェックボックス行スタイルを追加
- [x] `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` で検証
- [x] `docs/plan.md` の結果欄を更新

## 結果
`即洗脳` の設定項目を `DEFAULT SETTINGS` から `BRAINWASH SETTINGS` へ移動した。
`BRAINWASH SETTINGS` ではタイトル直下に `即洗脳` チェックを配置し、その下に既存の `ポーズ` 行が続く構成にした。

`src/ui/defaultSettingsPanel.ts` から `instantBrainwash` の型・UI・イベント処理を削除し、
`src/ui/brainwashSettingsPanel.ts` の `BrainwashSettings` に `instantBrainwash` を追加して同項目を管理するようにした。

`src/main.ts` では in-progress遷移設定の上書き判定を `DefaultStartSettings` ではなく `BrainwashSettings` 参照へ変更し、
開始時に `BRAINWASH SETTINGS` の値を取得して `setNpcBrainwashInProgressTransitionConfig` へ適用するよう更新した。

`src/style.css` には `brainwash-settings-panel` 用のチェックボックス行スタイル
（`__checkbox-row` / `__checkbox` / `__checkbox-label`）を追加した。

検証として `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` を実行し、どちらも成功した。
