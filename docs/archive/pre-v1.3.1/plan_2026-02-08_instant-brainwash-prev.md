# タイトル画面パネル分離（BRAINWASH SETTINGS）計画

更新日: 2026-02-08

## プロンプト
ほぼOKです。
見た目について、やはりDEFAULT SETTINGSとは別のパネル「BRAINWASH SETTINGS」に分けてください。位置はDEFAULT SETTINGSの下、BIT SETTINGSの上です。
文字の大きさはDEFAULT SETTINGSに合わせてください。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] `src/ui/defaultSettingsPanel.ts` から洗脳確率UIを分離し、`DefaultStartSettings` を元の責務へ整理
- [x] 新規 `src/ui/brainwashSettingsPanel.ts` を追加し、既存スライダー連動ロジックを移設
- [x] `src/main.ts` で `BRAINWASH SETTINGS` パネルを `DEFAULT` と `BIT` の間に配置し、開始時設定適用を接続
- [x] `src/style.css` に `brainwash-settings-panel` のスタイルを追加（文字サイズを `default-settings-panel` と一致）
- [x] `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` で検証
- [x] `docs/plan.md` の結果欄を最終更新

## 結果
`DEFAULT SETTINGS` から洗脳確率UIを分離し、新規 `BRAINWASH SETTINGS` パネルとして実装した。
`src/ui/defaultSettingsPanel.ts` は初期人数と2つのチェック項目のみを持つ責務へ戻し、
新規 `src/ui/brainwashSettingsPanel.ts` に `ポーズ/銃あり/銃なし` の表示・スライダー連動ロジックを移設した。

`src/main.ts` は `BrainwashSettings` を別管理に変更し、タイトル画面右下パネル群を
`DEFAULT SETTINGS` → `BRAINWASH SETTINGS` → `BIT SETTINGS` の順で生成するようにした。
開始時には `BRAINWASH SETTINGS` の値を取得し、既存どおり内部確率へ変換して
`setNpcBrainwashCompleteTransitionConfig` に適用する。
タイトルUIのポインター対象判定と表示切替にも `brainwash-settings-panel` を追加した。

`src/style.css` には `brainwash-settings-panel` 系スタイルを追加し、文字サイズを
`default-settings-panel` と同一（パネル13px、タイトル12px、ラベル13px）にそろえた。

検証として `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` を実行し、どちらも成功した。
