# 直近3コミット分リファクタリング 計画

更新日: 2026-01-11

## プロンプト
直近3コミット分の差分を読み込み、リファクタリング計画を立案してください。
また、spec.md, spec_stage_json.mdへの仕様追加・更新箇所があるかも確認してください。

## ステップ
- [x] 変更点の依存関係を整理し、StageJson→GridLayout→Stage生成の責務境界を確定する
- [x] mapScale/semanticsの拡張処理を共通化し、Grid/Env生成の重複実装を解消する
- [x] createStageFromGridの壁生成・床材切替をヘルパー化して重複を削減する
- [x] StageContextに環境情報（envMap/skyColor/ceiling）を集約し、呼び出し側の引数を整理する
- [x] spec_stage_json.md/spec.mdの更新点を反映する

## 結果
- docs/spec_stage_json.mdにmapScale/sky/ceiling null/option/noRenderの記述を追加
- docs/spec.mdに屋外/天井の扱いとNPC初期人数の更新を反映
- stageJsonのmapScale拡張処理を共通化してmainMap/envの重複ループを整理
- stageJsonで環境データ生成をまとめ、StageContextで環境情報を集約
- stage.tsの壁生成と床材選択をヘルパー化して重複を削減
