# プレイヤー/NPC楕円体被命中判定 共通化 計画

更新日: 2026-02-22

## プロンプト
わかりました。ではそのように楕円体になるように修正をお願いします。
ちょっと待ってください。
「NPCだけ」でなく、プレイヤーも楕円体にして、処理を共通化させてください。

## ステップ
- [x] 現行の命中判定コードと呼び出し箇所を調査し、変更範囲を確定
- [x] `src/game/beamCollision.ts` を楕円体命中判定に対応させる
- [x] プレイヤー/NPCのビーム命中判定呼び出しを共通ロジックへ置換する
- [x] ビルド確認（`npm run build`）を実施する
- [x] 実装結果を `docs/plan.md` の結果に反映する

## 結果
- `src/game/beamCollision.ts` に楕円体半径型 `BeamHitRadii` と、`width/height` から半径を作る `createBeamHitRadii` を追加した。
- ビーム命中判定は球判定から楕円体判定へ移行し、ビーム本体（線分）と先端の両方で楕円体当たりを判定するように変更した。
- `src/game/npcs.ts` は固定 `npcHitRadius` を廃止し、各NPCスプライトの `width/height` から算出した半径を使うように変更した。
- `src/main.ts` のプレイヤー/NPC被弾判定（通常時・公開処刑時）を共通ヘルパー経由の楕円体判定へ置換した。
- `npm run build` は成功した（renderer/electron ともに完了）。
