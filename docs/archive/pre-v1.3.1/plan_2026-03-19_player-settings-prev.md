# 鏡反射修正と水たまり撤去 計画

更新日: 2026-03-15

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# 鏡反射修正と水たまり撤去 計画

## 要約
- `arena_mirror_house` から水たまり仕様を完全撤去し、壁鏡だけを残す。
- 鏡は Babylon の planar reflection を正しく張り直し、正面にある光景がリアルタイムに映る状態へ修正する。
- 現状のベースラインとして `npm run build` は通っている。変更後も同じ確認と手動の見た目確認で閉じる。

## API / 型変更
- `src/world/stageJson.ts` から床反射用の `StageReflectionStyle` と `StageSurfaceStyle.reflection` を削除する。
- `public/stage/arena_mirror_house.json` から `env` の `M` 記号、水たまり説明、`generationRules.env.M` を削除し、該当床は通常床 `I` に統一する。
- ランタイム側は壁鏡のみを反射面として扱う。`puddle` 種別、床 overlay、共用水たまり RTT 分岐は削除する。

## 実装変更
- `src/world/stage.ts` は `decal.reflective.kind === "mirror"` の壁デカールだけから反射面を生成する。`resolveFloorReflection`、`puddleInsetRatio`、水たまり mesh 生成、床反射 push は全削除する。
- 鏡の `mirrorPlane` は Babylon の clip plane 規約に合わせ、鏡面メッシュの見える側と逆向きの法線で定義する。鏡面の微小オフセットは維持して z-fighting は避ける。
- `src/main.ts` の鏡 RTT は面ごとに個別作成し、`renderListPredicate` を使って反射面自身を描画対象から除外する。`renderSprites = true` と layer mask 判定は維持し、プレイヤー反射用アバターや NPC スプライトもそのまま映す。
- 鏡マテリアルは現行の `tint` / `amount` / `blur` を引き継ぐが、不透明鏡として扱う。`puddle` 専用 alpha 計算と shared texture の仕組みは削除する。
- 実装開始時は AGENTS.md に従い、現在の `docs/plan.md` を日付付き退避名へ改名し、このタスク用の新しい `docs/plan.md` を作成してステップ進捗と結果を更新する。

## テスト
- `npm run build` が通ること。
- `arena_mirror_house` で水たまり mesh / RTT が生成されず、床見た目が通常床のみであること。
- 北・南・東・西の各鏡の正面に立ったとき、室内、NPC、プレイヤー反射用アバターがリアルタイムに映ること。
- カメラ移動中に鏡が黒塗り、無地壁、自己再帰表示にならないこと。
- 他ステージで反射面が増えず、既存表示が変わらないこと。

## 前提
- ステージ ID / 名称 `arena_mirror_house` は維持する。
- 鏡の配置数と位置は現行 JSON のまま使い、水たまりだけを除去する。
- 今回は機能修正が主目的なので、鏡の色味パラメータの大幅変更は行わない。

追加指示:
- 鏡の中に映っている光景の解像度が低く感じる。ぼやけているわけではないが、輪郭線がはっきりしない。
- 原因を特定し、何のデメリットもなく修正可能なら修正する。
- 処理が非常に重くなってしまうなどのデメリットがあるなら一旦調査までで中断する。
- それぞれ試していきたいので、負荷の高い順に1つためす。
- `ratio: 1.0` 案はあまりきれいになったとは言えなかったので、次の案へ変更する。
- `blur: 0` 案も見た目はあまり改善されなかったので、次の案を試す。
- 3案の中では一番最初の案が最もきれいだったので、まず最初の案へ戻す。
- そのうえで、他に原因や改善策がありそうか検討する。
- 追加候補のうち `案1` と `案2` を試したい。まず `案1` から試す。
- 新しい `案1` はあまり効果がなかったので、ratio や blur を変更していたときの `案2` に戻す。
- GPU負荷が増える新しい `案2` はやらない。旧 `案2` だけを適用する。

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-03-15_mirror-reflection-fix-prev.md` へ退避し、新しい `docs/plan.md` を作成する
- [x] 水たまり関連の型・ステージJSON・反射面生成を削除する
- [x] 鏡の `mirrorPlane` と RTT 描画対象除外を修正する
- [x] `docs/plan.md` の結果を更新し、`npm run build` で確認する
- [x] 鏡の輪郭が甘く見える原因を調査し、負荷が最も高い `ratio: 1.0` 案を単独で適用する
- [x] `ratio: 1.0` 案の実機確認結果を反映し、次に軽い案として `blur: 0` のみを適用する
- [x] `blur: 0` 案の実機確認結果を反映し、残る併用案として `ratio: 1.0` と `blur: 0` を適用する
- [x] 3案の比較結果を反映し、最も見た目が良かった最初の案 `ratio: 1.0` / `blur: 4` へ戻す
- [x] 追加の原因候補と改善策を調査し、次に試すべき候補を整理する
- [x] 追加候補 `案1` として、負荷を増やさない鏡材質の反射率調整をミラーハウスの鏡4面に適用する
- [x] `案1` の実機確認結果を反映し、効果が薄かったため旧 `案2` の `ratio: 1.0` / `blur: 4` / `amount: 0.72` に戻す
- [x] GPU負荷が増える新 `案2` は不採用とし、旧 `案2` のみを維持する

## 結果
- `docs/plan.md` 旧版は `docs/plan_2026-03-15_mirror-reflection-fix-prev.md` へ退避し、今回タスク用の計画へ切り替えた。
- `public/stage/arena_mirror_house.json` から `M` 環境記号、水たまり説明、床反射設定を削除し、床は全面 `I` の通常屋内床へ統一した。
- `src/world/stageJson.ts` / `src/world/stage.ts` / `src/world/stageContext.ts` から床反射用の型・環境参照・水たまり mesh 生成を削除し、反射面は壁鏡のみを扱う構成へ整理した。
- `src/world/stage.ts` では鏡の `mirrorPlane` 法線を部屋側と逆向きに修正し、Babylon の clip plane 規約に合うようにした。
- `src/main.ts` では鏡ごとに個別 RTT を生成しつつ `renderListPredicate` で反射面メッシュを RTT 描画対象から外し、鏡材質は `diffuseTexture` 直貼りではなく `reflectionTexture` を使う構成へ変更した。
- 鏡像の輪郭が甘く見える主因は、鏡 RTT を `ratio: 0.75` で生成していたことと、ステージ定義の `blur: 4` にあると特定した。
- 追加試行として、負荷が最も高い案から順に試す方針に合わせ、`src/main.ts` の鏡 RTT 比率を `0.75` から `1.0` に引き上げた。`blur: 4` は維持している。
- ユーザー確認では `ratio: 1.0` 案の改善は限定的だったため、比較条件を分けるために RTT 比率は `0.75` へ戻し、`public/stage/arena_mirror_house.json` の鏡 `blur` を `0` に変更した。
- ユーザー確認では `blur: 0` 案の改善も限定的だったため、残る比較として `public/stage/arena_mirror_house.json` の `blur: 0` を維持したまま、`src/main.ts` の鏡 RTT 比率を再び `1.0` に引き上げた。
- ユーザー比較では 3案の中で最初の `ratio: 1.0` / `blur: 4` 案が最も見た目が良かったため、鏡設定はその状態へ戻した。
- 追加調査では、Babylon の `MirrorTexture` は sampling mode の既定値が `Texture.BILINEAR_SAMPLINGMODE` で、RTT の `samples` 既定値も `1` のため、反射面では bilinear 補間と非MSAAのまま描画されていると確認した。
- `src/main.ts` の鏡材質は `amount: 0.72` を `reflectionTexture.level` に設定しつつ、残り `0.28` を `diffuseColor` / `emissiveColor` の tint で埋めているため、鏡像コントラスト自体が落ちて見える構成になっている。
- `src/main.ts` のエンジン生成は `new Engine(canvas, true)` で `adaptToDeviceRatio` を使っていないため、高DPI環境ではゲーム全体の内部描画解像度が表示解像度より低い可能性がある。
- `npm run build` は成功した。
- 調査候補としては鏡 RTT の `samples` 追加、鏡材質の `amount` / tint 見直し、または高DPI対応があったが、GPU負荷が増える新 `案2` は採用しないことにした。
- `案1` の試行として、`public/stage/arena_mirror_house.json` の鏡4面の `amount` を `0.72` から `0.9` へ引き上げ、RTT や blur はそのままで反射寄りの見え方へ調整した。
- ユーザー確認では新しい `案1` の効果が薄かったため、鏡4面の `amount` は `0.72` に戻し、ratio や blur を調整していたときの旧 `案2`、つまり `ratio: 1.0` / `blur: 4` の状態へ戻した。
- ユーザー指示により、GPU負荷が増える新しい `案2` の mirror RTT samples 追加は実施せず、旧 `案2` の状態だけを残すことにした。
