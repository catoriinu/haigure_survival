# 操作説明パネル統一 計画

更新日: 2026-03-19

## プロンプト
通常HUDを、「全滅後の整列」「その後の待機/自由移動」「公開処刑」のようなタイミングで中身を書き換えれば十分ではないでしょうか。
そうすれば `overlayHelp` 関連の実装を消せるはずです。
`helpPanel` に統一し、`helpPanel` だけは `hudVisible` と独立制御にする案で、`plan.md` だけ書き換えてください。実装は修正しないでください。

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-03-19_assembly-move-cancel-plan-prev2.md` へ退避し、今回タスク用の新しい `docs/plan.md` を作成する
- [ ] `helpPanel` と `overlayHelp` の責務差分と依存箇所を洗い出す
- [ ] `overlayHelp` を廃止し、`helpPanel` を通常HUDと独立制御に変更する方針を整理する
- [ ] 操作説明文言の生成経路を `helpPanel` へ一本化する変更点を整理する
- [ ] 実装後の確認項目と、`overlayHelp` 削除に伴う影響範囲を明記する

## 結果
- 計画のみ作成。実装は未着手。
- 現時点では `overlayHelp` 関連のコード・DOM・スタイルは削除していない。
