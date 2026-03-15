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

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-03-15_mirror-reflection-fix-prev.md` へ退避し、新しい `docs/plan.md` を作成する
- [x] 水たまり関連の型・ステージJSON・反射面生成を削除する
- [x] 鏡の `mirrorPlane` と RTT 描画対象除外を修正する
- [x] `docs/plan.md` の結果を更新し、`npm run build` で確認する

## 結果
- `docs/plan.md` 旧版は `docs/plan_2026-03-15_mirror-reflection-fix-prev.md` へ退避し、今回タスク用の計画へ切り替えた。
- `public/stage/arena_mirror_house.json` から `M` 環境記号、水たまり説明、床反射設定を削除し、床は全面 `I` の通常屋内床へ統一した。
- `src/world/stageJson.ts` / `src/world/stage.ts` / `src/world/stageContext.ts` から床反射用の型・環境参照・水たまり mesh 生成を削除し、反射面は壁鏡のみを扱う構成へ整理した。
- `src/world/stage.ts` では鏡の `mirrorPlane` 法線を部屋側と逆向きに修正し、Babylon の clip plane 規約に合うようにした。
- `src/main.ts` では鏡ごとに個別 RTT を生成しつつ `renderListPredicate` で反射面メッシュを RTT 描画対象から外し、鏡材質は `diffuseTexture` 直貼りではなく `reflectionTexture` を使う構成へ変更した。
- `npm run build` は成功した。
- 実機での見た目確認は未実施。
