# キャラスプライト縦角度オプション 実装計画

更新日: 2026-03-20

## プロンプト
今現在、キャラスプライトは全て（プレイヤーの下半身レイヤーは特殊処理なので除く）、プレイヤーのカメラ向きに常に正面を向くようになっています。
これを、横軸は常に正面向きのまま、縦軸は角度を付けられるようなオプションを追加したいです（つまり、今の実装も残しつつ、タイトル画面でONOFFできるようにしたい）

「縦軸に角度をつける」とは、そのキャラが立っている座標の足下に、常に画像の下辺が接地している状態であり、カメラから見たときにその角度や映る範囲が反映されるようにしてほしいということです。

PLEASE IMPLEMENT THIS PLAN:
# キャラスプライト縦角度オプション計画

## Summary
- 実装着手時は、まず `docs/plan.md` をこの内容で更新してから進める。
- 既存の Babylon `Sprite` 表示は残し、`OFF` では現状の見え方を完全維持する。
- `ON` では、`Sprite` はロジック用の正本として残しつつ、表示だけを `Mesh.BILLBOARDMODE_Y` の平面メッシュへ切り替える。
- 新設定は `PLAYER SETTINGS` に追加し、型名は `enableCharacterSpriteVerticalAngle: boolean`、初期値とデフォルト復帰値は `false`、保存バージョンは `4` に上げる。

## Key Changes
- タイトル設定
  - `PlayerSettings` に `enableCharacterSpriteVerticalAngle` を追加する。
  - `PLAYER SETTINGS` にチェックボックスを 1 行追加し、文言は `キャラスプライト縦角度表示` で固定する。
  - 保存・読込・デフォルト復帰へ同項目を追加する。v3 の保存データ読込時はこの値だけ `false` を補完して再保存する。
  - この切替はリロード不要にし、現在ロード済みのキャラ表示へ即時反映する。
- 表示方式
  - 対象は `playerAvatar` と全 NPC のワールド表示のみとし、プレイヤー下半身レイヤーは完全に対象外にする。
  - 各キャラに unit plane の表示メッシュを 1 つ持たせ、`billboardMode = Mesh.BILLBOARDMODE_Y` を使って Y 軸だけカメラ向きへ追従させる。
  - 平面は中心基準のまま `position.y = height * 0.5` を維持し、`scaling.x/y` を元 `Sprite` の `width/height` と同期して下辺接地を保つ。
  - `Sprite` の `position / width / height / cellIndex / color / isVisible` を正本にし、表示メッシュ側は毎フレームそれを追従する。
  - `Mesh.BILLBOARDMODE_Y` は描画中の active camera 基準で効く前提にし、通常画面と反射面の両方で「横方向だけ正面向き」を維持する。
- テクスチャと描画
  - portrait directory ごとに共有マテリアルを 1 つ持ち、diffuse は既存 spritesheet を再利用する。
  - 各キャラ mesh の UV バッファを `cellIndex` 変更時だけ更新して、現在のセルを表示する。
  - 各キャラ mesh の Color バッファを `sprite.color` と alpha に同期して、既存の点滅・フェード色を維持する。
  - `ON` 中は `SpriteManager` 群の `layerMask` を `0` にして `Sprite` を描画させず、`OFF` に戻したら既存の mask 運用へ戻す。
  - プレイヤー表示メッシュの `layerMask` は、現行の `world / reflectionOnly` 切替規則をそのまま移植する。NPC は常に `world` 側とする。
- ライフサイクル
  - billboard mesh 群は `resetGame`、キャラ再生成、ステージ切替の既存 dispose / 再生成フローへ統合する。
  - 当たり判定、ビーム命中、NPC 移動、下半身レイヤー更新は既存 `Sprite` 依存のままにし、今回の変更は表示経路だけに閉じる。
  - フレーム同期は既存 render loop の `updateCharacterSpriteCells()` の後、`scene.render()` の前にまとめて入れる。

## ステップ
- [x] 既存のスプライト描画、タイトル設定 UI、保存処理、反射面描画の経路を確認し、実装方針を確定する
- [x] タイトル設定モデル・UI・保存処理へ `enableCharacterSpriteVerticalAngle` を追加する
- [x] Y軸ビルボード平面メッシュによるキャラ表示を実装し、既存 `Sprite` 表示と切り替えられるようにする
- [x] 描画同期、反射面、ライフサイクルを `main.ts` に統合し、表示モード切替を即時反映できるようにする
- [x] ビルドで検証し、結果を反映する

## 結果
- `PLAYER SETTINGS` に `キャラスプライト縦角度表示` チェックボックスを追加し、`PlayerSettings.enableCharacterSpriteVerticalAngle` を localStorage 保存対象へ組み込んだ。保存バージョンは `4` に更新し、v3 の既存データ読込時は新項目だけ `false` を補完する形にした。
- `src/game/characterBillboardMeshes.ts` を追加し、portrait directory ごとの共有マテリアル、セル単位 UV 更新、頂点カラー同期を持つ Y軸ビルボード平面メッシュ表示を実装した。
- `src/main.ts` でプレイヤーと NPC の billboard mesh をキャラ生成・再生成時に張り直し、毎フレームの `Sprite` 状態から位置・サイズ・セル・色・表示状態を同期するようにした。縦角度表示 ON 中は `SpriteManager.layerMask = 0` で従来 `Sprite` 描画を止め、OFF では元の表示経路へ戻る。
- プレイヤー表示については既存の `world / reflectionOnly` 切替規則を billboard mesh 側へ移植し、プレイヤー下半身レイヤーの処理には手を入れていない。
- follow-up 修正として、billboard mesh のマテリアルへ `emissiveColor = white` と `linkEmissiveWithDiffuse = true` を追加し、`disableLighting = true` のままでもテクスチャ色が黒化しないよう修正した。
- follow-up 修正として、billboard mesh の UV を `Sprite` と同じ V 向きへ反転し、キャラスプライトが上下逆さまに表示される不具合を修正した。
- `npm run build` を実行し、renderer / electron ともに成功した。
