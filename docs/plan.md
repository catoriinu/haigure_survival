# city_centerステージ導入 計画

更新日: 2026-01-10

## プロンプト
docs\spec_stage_json.mdの仕様書と、public\stage\city _center.jsonのステージデータを読み込み、ステージを作成できるようにしてください。
今はlaboratory.jsonを読み込んでいますが、タイトル画面でcity _center.jsonと選択切り替えができるようにし、デフォルト選択をcity _center.jsonの方にしてください。
spawn座標はx57, z28、カメラは0時方向向きにしてください。
assembly_area範囲はx10, z28あたりの交差点範囲にしてください。
天井はなしにしてください。
壁（$）の高さは6、ビル（&）は18を採用してください。

## ステップ
- [x] spawn座標/天井なし/壁高さの方針を確定する
- [ ] assembly_areaの範囲（w/h）を確定する
- [ ] 決定内容に合わせてpublic\stage\city _center.jsonを更新する
- [ ] StageJsonの型定義/読み込み処理を仕様に合わせて調整し、必要ならステージ生成側に反映する
- [ ] src\world\stageSelection.tsのカタログを更新し、タイトル画面でcity_centerをデフォルトにする
- [ ] タイトル画面で切り替え、city_centerとlaboratoryの両方が生成できることを確認する

## 結果
未実施