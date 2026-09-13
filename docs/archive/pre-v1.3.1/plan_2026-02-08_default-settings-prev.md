# タイトル画面ビット出現設定対応 計画

更新日: 2026-02-08

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
- タイトル画面にビット出現設定パネルを追加し、`bitSpawnInterval` と `maxBitCount` を任意設定可能にする。
- `bitSpawnInterval` は 1〜99。
- `maxBitCount` は 1〜99。
- チェックボックス「ビットを出現させない」を追加する。
- チェックON時、`bitSpawnInterval` と `maxBitCount` 入力を灰色かつ入力不可にし、表示値は保持する。
- チェックONでゲーム開始時は、内部 `maxBitCount` を 0 とし、ビットを一切出現させない。
- 保持範囲はセッション中保持、配置は右下パネル、入力方式は数値入力のみ。
- 変更対象: `docs/plan.md`, `src/ui/bitSpawnPanel.ts`, `src/main.ts`, `src/style.css`, `README.md`。

## ステップ
- [x] 既存 `docs/plan.md` を退避して、新規 `docs/plan.md` を作成
- [x] `src/ui/bitSpawnPanel.ts` を新規作成（数値入力2項目とチェックボックス）
- [x] `src/main.ts` に設定UIの接続・開始時の実効値確定・スポーンロジック反映を実装
- [x] `src/style.css` にビット設定パネルのスタイルを追加
- [x] `README.md` に調整可能項目を追記
- [x] 型チェックとビルド確認を実行
- [x] 結果を `docs/plan.md` に反映

## 結果
タイトル画面右下に `BIT SETTINGS` パネルを追加し、`bitSpawnInterval`（1〜99）と `maxBitCount`（1〜99）を数値入力で設定可能にした。  
チェックボックス「ビットを出現させない」を追加し、ON時は入力欄を無効化・灰色表示しつつ値表示を保持。  
ゲーム開始時に実効設定を確定するよう変更し、ON時は内部 `runtimeMaxBitCount = 0` として初期生成・通常スポーン・アラート由来スポーンをすべて抑止する実装にした。  
型チェック（`npx tsc -p tsconfig.json --noEmit`）とレンダラーのビルド（`npm run build:renderer`）が成功。
