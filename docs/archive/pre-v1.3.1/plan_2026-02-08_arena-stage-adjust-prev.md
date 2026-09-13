# arenaステージ調整 計画

更新日: 2026-02-08

## プロンプト
assembly_areaを部屋中央に変更してください。
キャラクターが100人いても整列できるようにしてください。

## ステップ
- [x] `assembly_area` の必要面積と中央座標を算出
- [x] `public/stage/arena.json` の `assembly_area` を更新
- [x] 検証（型チェック）
- [x] 結果をplanに反映

## 結果
`public/stage/arena.json` の `assembly_area` を
`x: 8, z: 8, w: 11, h: 11` に変更した。

この設定は中心座標が `(13.5, 13.5)` となり、27x27 マップの部屋中央と一致する。
また、領域内の床セル数は `121` セルで、キャラクター100人の整列に必要なセル数を満たす。

検証として `npx tsc -p tsconfig.json --noEmit` を実行し、成功した。