# city_centerステージ導入 計画

更新日: 2026-01-10

## プロンプト
docs\spec_stage_json.mdの仕様書と、public\stage\city _center.jsonのステージデータを読み込み、ステージを作成できるようにしてください。
今はlaboratory.jsonを読み込んでいますが、タイトル画面でcity _center.jsonと選択切り替えができるようにし、デフォルト選択をcity _center.jsonの方にしてください。
カメラは0時方向向きにしてください。
開始位置は床のある場所に移動してください（現状はエリア外）。
assembly_area範囲はx10, z28あたりの交差点範囲にしてください。
天井はなしにしてください。
壁（$）の高さは6、ビル（&）は18を採用してください。
mainMapで、画面端で床が途切れている箇所は見えない壁で進行不能にしてください。
このマップは広すぎるため、整列シーンはスキップして整列完了まで自動的にシーンを飛ばしたいです。(brainwash中にスキップしたのと同じ状態)
json内の適切な箇所に「整列スキップ」フラグを追加してください。
全滅時に整列シーンを即時完了する際は、フェードアウトとフェードインを挟んでください（brainwash中のスキップと同じ）。
"mapScale": { "x": 2, "z": 2 } は、ASCII文字1文字を2x2セルとして拡大する意味で反映してください。

## ステップ
- [x] spawn座標/天井なし/壁高さの方針を確定する
- [x] assembly_areaの範囲（w/h）を確定する
- [x] 決定内容に合わせてpublic\stage\city _center.jsonを更新する
- [x] StageJsonの型定義/読み込み処理を仕様に合わせて調整し、必要ならステージ生成側に反映する
- [x] src\world\stageSelection.tsのカタログを更新し、タイトル画面でcity_centerをデフォルトにする
- [x] 開始位置を床セルへ移動し、境界の床セルを見えない壁に置き換える
- [x] 整列スキップフラグをJSON/型/ゲームフローに反映する
- [x] 整列スキップ時にフェードアウト/インを挟む
- [x] mapScaleでmainMap/markers/zonesを拡大する
- [ ] タイトル画面で切り替え、city_centerとlaboratoryの両方が生成できることを確認する

## 結果
- city_center.jsonにspawn/assembly_areaを追加し、spawnを床セルに移動した
- ceilingがnullのステージで天井なし・壁高さをcellPhysics準拠で生成するようにした
- 見えない壁（noRender）に対応し、画面端の床セルを置き換えた
- assembly_areaを床セル（x25 z28 w6 h6）へ移動して経路生成エラーを解消した
- noRender壁でコリジョン生成時の参照エラーを修正した
- gameplay.options.skipAssemblyを追加し、全滅時に整列シーンを即時完了へスキップするようにした
- 全滅時の整列スキップにフェードアウト/インを追加した
- mapScaleを参照してmainMap/markers/zonesを拡大するようにした
- タイトル画面のステージ選択にcity_centerを追加しデフォルト化した
- タイトル画面での切り替え確認は未実施