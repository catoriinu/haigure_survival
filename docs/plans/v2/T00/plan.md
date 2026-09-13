# HAIGURE SURVIVAL v2 T00 ロードマップ保存 計画

更新日: 2026-07-18

## プロンプト

現在の`docs/plan.md`をv2以前の計画として退避し、HAIGURE SURVIVAL v2複数セッション実装ロードマップを新しい`docs/plan.md`へ保存する。個別タスクは`docs/plans/v2/<タスクID>/plan.md`で管理できるようにし、このタスクではコードとモデルを変更しない。

## ステップ

- [x] 正確な更新日とGit状態を確認する
- [x] 以前の`docs/plan.md`を`docs/archive/pre-v2/`へ退避する
- [x] v2ロードマップを新しい`docs/plan.md`へ保存する
- [x] 個別タスク用の計画ファイルを作成する
- [x] v2タスクとリリースに適用するブランチ戦略を文書化する
- [x] UTF-8（BOMなし）、ファイル構成、差分を検証する

## 結果

- v1.3.1仕様書再構築計画を`docs/archive/pre-v2/plan_2026-07-18_v1.3.1-spec-rebuild.md`へ退避した。
- v2ロードマップを`docs/plan.md`へ保存した。
- T00～T07、B01～B03の個別計画ファイルを用意した。
- `docs/branch_strategy.md`を作成し、すべてのT系・B系タスクを`develop`起点・`develop`宛てPull Requestで運用する規則を保存した。
- コード、ステージJSON、Blenderモデルは変更していない。
