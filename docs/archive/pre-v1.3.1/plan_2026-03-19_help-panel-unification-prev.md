# 操作説明パネル統一 計画

更新日: 2026-03-19

## プロンプト
通常HUDを、「全滅後の整列」「その後の待機/自由移動」「公開処刑」のようなタイミングで中身を書き換えれば十分ではないでしょうか。
そうすれば `overlayHelp` 関連の実装を消せるはずです。
`helpPanel` に統一し、`helpPanel` だけは `hudVisible` と独立制御にしてください。
フェード中はパネルを非表示にし、フェード明けに再表示してください。

## ステップ
- [x] `helpPanel` と `overlayHelp` の責務差分と依存箇所を洗い出す
- [x] HUD・DOM・スタイルから `overlayHelp` を削除し、`helpPanel` 一本化へ変更する
- [x] 通常プレイ・ルーレット・全滅後・公開処刑の操作説明更新経路を `helpPanel` に統一する
- [x] フェード遷移開始時に操作説明を消し、遷移先で再表示する制御へ置き換える
- [x] `npm run build` で確認し、結果を `docs/plan.md` に反映する

## 結果
- 実装着手前に、`overlayHelp` が `hud.setStateInfo()` 専用DOM、`helpPanel` が `drawMinimap()` 内 `retryText` 専用DOMとして二重化されていることを確認した。
- `beginFadeOut()` を使う遷移は、全滅後整列開始、エピローグ移行、公開処刑開始、公開処刑リプレイ、ルーレット Undo に存在することを確認した。
- `src/ui/hud.ts` は `setHelpPanelText()` と内部保持テキストで `helpPanel` を制御する構成へ変更し、`DrawMinimapParams.retryText` と `setStateInfo()` を削除した。
- `src/main.ts` は通常プレイ・ルーレットの操作説明を毎フレーム `helpPanel` へ流す構成へ変更し、全 `beginFadeOut()` 呼び出し前、ゲーム開始、タイトル復帰、ステージ再初期化時に `helpPanel` を明示クリアするようにした。
- `src/game/flow.ts` は整列と公開処刑のフェーズ突入時に `helpPanel` 文言を設定する構成へ変更し、`index.html` と `src/style.css` から `overlayHelp` を削除した。
- `npm run build` は成功した。Vite の 500kB 超チャンク警告は出たが、今回変更による新規エラーはなかった。
