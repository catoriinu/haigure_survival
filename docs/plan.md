# タイトル画面設定のLocalStorage永続化 計画

更新日: 2026-02-21

## プロンプト
タイトル画面の設定を、ブラウザ（GoogleChromeを推奨）のLocalStorageに保存して次回にも持ち越したいです。
保存対象はVOLUME、ステージ（チェックボックス含む）、各種SETTINGSです。

決定仕様:
- 1:A 保存タイミングは変更時即時
- 2:A 起動直後に復元（保存済みステージを初期選択）
- 3:A 不正項目は初期値へ置換し、補正後を再保存
- 4:A 単一キー + version
- 5:A VOLUME / ステージID / アラームトラップcheckbox / 全SETTINGSを保存

## ステップ
- [x] `src/main.ts` にタイトル設定永続化モデル（単一キー + version）と、復元・補正・再保存ロジックを追加
- [x] 起動時初期値へ永続化データを反映（VOLUME、ステージ、アラームトラップ、DEFAULT/BRAINWASH/BIT SETTINGS）
- [x] タイトル画面の各変更イベントで即時保存するよう接続
- [x] 型チェック（`npx tsc -p tsconfig.json --noEmit`）を実行して整合を確認
- [x] 変更内容と検証結果を `docs/plan.md` の結果へ反映

## 結果
- `src/main.ts` に `localStorage` 永続化モデル（`haigure-survival.title-settings` + `version=1`）を追加し、保存データを1キーのJSONで管理するようにした。
- 起動時に保存データを読み込み、`VOLUME`、ステージID、アラームトラップ、`DEFAULT/BRAINWASH/BIT SETTINGS` を初期値へ反映するようにした。
- 保存データに不正値がある場合は項目単位で既定値へ補正し、補正後データを即時に再保存する仕様を実装した。
- タイトル画面の各変更イベント（音量変更、ステージ変更、アラームトラップ切替、各設定パネル更新）で即時保存するよう接続した。
- `npx tsc -p tsconfig.json --noEmit` は成功した。
