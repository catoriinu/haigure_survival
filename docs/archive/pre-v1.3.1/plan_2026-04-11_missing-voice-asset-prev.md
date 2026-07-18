# キャラクタースプライト透明描画修正 計画

更新日: 2026-04-11

## プロンプト
キャラクタースプライトの画像のうち透明度のある部分は、向こう側が透過して見えるようにしてください。現在、カメラに向かって手前側のキャラ画像の透明部分に重なっている、キャラクターや光線系のエフェクトなどが見えない（手前の透明が優先されてしまっている）問題があります。

## ステップ
- [x] 既存の `docs/plan.md` を `docs/plan_2026-04-11_character-sprite-transparency-prev.md` へ退避し、新しい計画書を作成する
- [x] キャラクタービルボードの透明ピクセルが深度を塞がないよう、マテリアル設定を修正する
- [x] `npm run build` で確認し、結果を計画書へ反映する

## 結果
- `docs/plan.md` を今回タスク用に作成し、直前の計画書は `docs/plan_2026-04-11_character-sprite-transparency-prev.md` へ退避した。
- `src/game/characterBillboardMeshes.ts` でビルボード用 `StandardMaterial` に `Material.MATERIAL_ALPHATESTANDBLEND` と `alphaCutOff = 0.01` を設定した。
- 既存の `needDepthPrePass` は維持しつつ、alpha test を併用する構成へ変更したことで、透明ピクセルは深度プリパスで破棄され、不透明部分の遮蔽は維持しながら透明部分越しに後ろのキャラクターや光線エフェクトが見える想定にした。
- `npm run build` は成功した。
- 実機での見た目確認は未実施。キャラクター同士が重なる場面と、手前キャラの透明部分越しにビーム／ヒットエフェクトが見えるかの確認が未完了。
