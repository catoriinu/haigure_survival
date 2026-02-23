# ビット壁埋まり対策（全モード） 計画

更新日: 2026-02-23

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# ビット壁埋まり対策（全モード）計画

追加入力:
- 前より壁にめり込んで出現するケースは減ったと思いますが、まだあります。
- これ以上の改善は難しいでしょうか？
- 1で

## 要約
1. 主因は「出現位置の妥当性未検証」です。`createBitAt` が渡された座標をそのまま採用しており、床/壁チェックがありません。`src/game/bits.ts:1218` `src/game/bits.ts:1226`
2. 壁埋まりを起こしやすい生成経路が2つあります。`alert` 追加出現のランダムオフセット（±0.2）と、`carpet` 追従出現の左右オフセット（±0.25）です。`src/game/bits.ts:112` `src/game/bits.ts:116` `src/game/bits.ts:1745` `src/game/bits.ts:1822`
3. 現在のセルサイズは `1/3` なので、狭い通路でオフセットが壁セルに入りやすいです。`src/world/grid.ts:34` `src/world/stageJson.ts:260`
4. いったん壁セル内に湧くと、移動判定は「次の中心点が床か」だけを見るため、反転を繰り返して実質停止しやすいです。`src/game/bits.ts:1368` `src/game/bits.ts:2634` `src/game/bits.ts:2641`
5. ローカル試算（迷宮）では、現行ロジックのまま `alert` オフセット起因で約6.79%、`carpet` 追従起因で約21.76%が壁セル座標になります（推定）。

## 公開API/インターフェース変更
1. `createBitAt` の引数に `layout: GridLayout` を追加します。
`createBitAt(scene, layout, materials, index, position, direction?)`
2. 呼び出し元を全更新します。`src/main.ts:1119` `src/main.ts:1129` `src/main.ts:2406`

## 実装仕様（決定版）
1. `src/game/bits.ts` に出現位置解決ヘルパーを追加します。
`isFloorPoint` / `hasFloorNeighbor` / `isBitSpawnPointValid` / `resolveNearestValidBitSpawnPosition`
2. 妥当位置の条件を固定します。
「床セル上」かつ「隣接4方向に少なくとも1つ床セルがある」かつ「壁クリアランス半径0.11以上」。
3. `resolveNearestValidBitSpawnPosition` は以下で固定します。
「希望位置が妥当ならそのまま」→「不正なら `worldToCellClamped` 起点で4近傍BFS（探索順: 上→右→下→左）」→「最初に見つかった妥当セル中心へ補正」。
4. `createBit` でも最終位置を同ヘルパーで確定し、初期ランダム湧きも同じ保証をかけます。`src/game/bits.ts:1120` `src/game/bits.ts:1127`
5. `alert`/`carpet` の既存オフセット値は変更しません。無効位置のみ「最寄り有効位置へ補正」します（選択済み方針）。

## テストケース/受け入れ条件
1. `npm run build` が成功すること。
2. `labyrinth` と `labyrinth_dynamic` で、ビット出現間隔最短・最大数多めで連続プレイし、壁埋まり出現と停止再現が起きないこと。
3. `arena_roulette` でルーレット進行が従来どおり動作し、出現補正により配置が破綻しないこと。
4. 通常湧き・`alert` 追加湧き・`carpet` 追従湧きのすべてで、出現直後の位置が床判定を満たすこと（デバッグ確認）。

## 前提・既定値
1. 適用範囲は「全モード」。
2. 不正位置時の方針は「最寄り有効位置へ補正」。
3. 出現安全性を優先し、オフセット意図（厳密な左右位置）と衝突する場合は安全側に補正する。
4. 有効候補が0のステージは不正ステージとして扱う（本件対象ステージでは発生しない前提）。

## ステップ
- [x] `bits.ts` に出現位置検証/補正ヘルパーを追加し、`createBit` と `createBitAt` に適用する
- [x] `createBitAt` の公開インターフェース変更を `main.ts` の全呼び出しへ反映する
- [x] `npm run build` を実行して型/ビルド整合を確認する
- [x] 実装結果を `docs/plan.md` の結果へ反映する
- [x] クリアランス半径を 0.11 に引き上げる
- [x] `updateBits` の移動可否判定に壁クリアランス判定（0.11）を追加する
- [x] `npm run build` を再実行して整合を確認する
- [x] 追加入力分の実装結果を `docs/plan.md` の結果へ反映する

## 結果
- `src/game/bits.ts` に以下の出現位置検証/補正ヘルパーを追加した。
  - `isFloorPoint`
  - `hasFloorNeighbor`
  - `isBitSpawnPointValid`
  - `resolveNearestValidBitSpawnPosition`
- 妥当位置判定は「床セル上」「隣接4方向に床セルが1つ以上」「壁クリアランス半径 0.11 以上」に統一した。
- `createBit` と `createBitAt` の両方で `resolveNearestValidBitSpawnPosition` を通すように変更し、通常湧き/alert湧き/carpet湧き/roulette湧きを全モードで同一保証に統一した。
- `createBitAt(scene, layout, materials, index, position, direction?)` へ公開インターフェースを変更し、`src/main.ts` の全呼び出しを更新した。
- `npm run build` を実行し、renderer/electron のビルド成功を確認した。
- 追加入力（「1で」）対応として、壁クリアランス半径を `0.11` へ引き上げた。
- `updateBits` の移動判定を `isFloorAt` 単体から、`isFloorAt` + 壁クリアランス（0.11）併用へ変更した。
- 壁距離判定を `hasWallClearanceAt` に共通化し、出現時と移動時で同一基準を使うように統一した。
- 追加入力対応後に `npm run build` を再実行し、renderer/electron のビルド成功を確認した。
