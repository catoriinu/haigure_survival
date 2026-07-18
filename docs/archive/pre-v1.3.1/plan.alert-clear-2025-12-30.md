# ビットalert解除条件整理 計画

更新日: 2025-12-30

## プロンプト
ビットのalert送信の解除条件がおかしい気がします。
特に、ビットがalert送信したときのターゲットがAlive=falseになったら解除してほしいのですが、そうなっていないように感じます。しかもそうなったとき、15秒の制限も超えてずっとalert送信状態になっている気がします。
解除条件を整理して、そのような現象が起きうるか調査してください。

これを意図通りに解除するための実装計画を立ててください。
不明瞭な仕様がある場合は質問してください。

補足仕様:
- alert-send解除時は回復動作（上向きから水平へ戻す）を必須とする。
- ターゲットがAlive=falseになった時点でalertSignalは即時クリアする。
- alert-receive解除時は回復動作を行わず、searchへ戻るだけで良い。
- 絨毯爆撃の下向き→水平は既存挙動に従う。

## ステップ
- [x] 現状のalert解除フローとSE停止の経路を整理し、解除阻害ポイントを特定する（`src/game/bits.ts`, `src/main.ts`）
- [x] 解除時の姿勢復帰とモード遷移の期待仕様を確定する
- [x] alert解除処理の修正方針を定義する
- [x] 実装: alert解除ロジックを修正する（`src/game/bits.ts`）
- [x] 動作確認項目を整理する

## 方針
- alert-send解除中も回転更新を行い、回復姿勢が成立した時点で`search`へ戻す。
- alertTargetがaliveでなくなった時点でalertSignalを即時クリアし、alert-send側は回復へ移行する。
- alert-receiveは回復動作を挟まず即時`search`へ戻す（既存の絨毯爆撃の下向き→水平挙動は現状維持）。

## 動作確認項目
- alert-send中のターゲットがAlive=falseになった直後にalertSignalがクリアされ、ビットが水平へ回復後に`search`へ戻る
- alert-sendの解除中に回転が進行し、`alertRecoverPitchThreshold`到達で解除される
- alert-receive中のターゲットがAlive=falseになった直後に即時`search`へ戻る
- 15秒経過・alert集結完了でもalert-sendが解除される
- alert解除後にSEループが停止する（alert-sendビットが存在しない状態になる）

## 結果
- alert-send解除中の回転更新とalertSignal即時クリアを追加し、alert-receiveは回復動作なしで`search`へ戻すよう修正した。
