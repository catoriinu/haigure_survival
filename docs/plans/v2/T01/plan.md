# HAIGURE SURVIVAL v2 T01 GLB・座標・衝突規約 技術検証 計画

更新日: 2026-07-18

## プロンプト

PLEASE IMPLEMENT THIS PLAN:

# HAIGURE SURVIVAL v2 T01 GLB・座標・衝突規約 技術検証

## 概要

T00を引き継ぎ、`codex/v2-t01-glb-contract`上でテストコース、GLB、独立検証画面、v2資産仕様書を作成する。既存8ステージや通常ゲームへは統合せず、T02以降の実装には進まない。

## 実装内容

- 開始時に日付、Git状態、最新`develop`、Blender MCP接続を再確認する。今回の指示全文と追加決定をT01計画へ反映し、各工程完了直後にチェックと結果を更新する。
- ユーザー承認に基づき、現在のBlenderテストシーンをMCPで破棄して直接作り直す。別プロセスは使用しない。
- Metric・1 unit＝1m、原点を中央レーン入口の床上面、X＝右・Y＝前・Z＝上とする9m×10mの3レーンコースを作る。
  - 左: 1:4斜面と高さ0.8mの踊り場
  - 中央: 0.15m段差、下面2.1mの天井、高さ2.4mの終端壁
  - 右: 蹴上0.15m・踏面0.30mの6段階段、高さ0.9mの踊り場、1:2の不可視ランプコライダー
- 作者メッシュを16個に固定する。`FloorBase`、`Step015`、`Slope`、`SlopeLanding`、`StairLanding`、`WallStop`、`CeilingLow`はVIS/COLの対、階段は`VIS_Stairs`と`COL_StairRamp`へ分離する。Object名とMesh Data名を同じ接頭辞にし、変換を適用してscaleを1にする。
- 次へ保存する。
  - `assets/blender/v2/T01/t01_glb_collision_course.blend`
  - `public/stage-assets/v2/T01/t01_glb_collision_course.glb`
- GLBは実メートルのままY-upで出力する。Babylon.jsではglTFルートを上書きせず、`AssetContainer.createRootMesh()`で追加した管理親へ0.25倍を適用する。
- `@babylonjs/loaders` 6.49系を追加し、通常ゲームから独立した`validation/v2/T01`のVite画面を実装する。専用の`dev:t01`、`typecheck:t01`、`build:t01`コマンドを追加し、通常の`src/main.ts`やステージカタログは変更しない。
- 検証画面は初回読込、命名・縮尺・衝突検査、コンテナ破棄、再読込を自動実行し、結果をPASS/FAILと実測値で表示する。VISは表示・衝突無効、COLは有効状態を保ったまま非表示・衝突有効にする。COL表示切替も設ける。
- `docs/spec_stage_assets_v2.md`を新規作成し、軸、原点、縮尺、命名、書出し、読込、衝突、破棄規約、全実測値、Blender/Babylonバージョン、ファイル容量、Git LFS不要の判断を保存する。

## 公開規約

- Blender 1mはGLBでも1mを維持し、Babylon管理親の0.25倍により0.25ワールド単位へ変換する。
- Blender→glTFは実測済みの`(X,Y,Z)→(X,Z,-Y)`とし、Babylon左手系での最終Z符号は検証画面で実測して仕様書へ確定値を記録する。
- 頂点を持つ作者メッシュは例外なく`VIS_`または`COL_`で始める。非ジオメトリのglTF／AssetContainer管理ルートだけを命名検査対象外とする。
- `COL_StairRamp`は既定で不可視だが、無効化せずBabylon衝突対象にする。表示階段自体には衝突を設定しない。
- ナビゲーション、スポーン、ゾーン、既存ステージ互換、プレイヤー重力、NPC・ビット・光線の高さ対応は追加しない。

## テスト計画

- Blender MCPで16メッシュの名前、寸法、原点、適用済み変換を確認し、ビューポートでも形状を確認する。
- GLB読込後にVIS/COL各8件、可視性・衝突設定、床9m→2.25、奥行10m→2.50、段差0.15m→0.0375を許容誤差`1e-4`で検証する。
- 現行プレイヤー相当の楕円体プローブを使い、床、段差、斜面、壁、天井、踊り場、`COL_StairRamp`への実衝突と衝突先名を検証する。階段昇降ロジック自体は実装しない。
- `removeAllFromScene()`と`dispose()`後に作者メッシュ・関連材質・テクスチャが消え、再読込後の名前集合、件数、境界寸法、衝突結果が初回と一致することを確認する。
- `npm run build:t01`、`npm run build`、ブラウザ上の全PASS、GLBのdistコピー、`git diff --check`を確認する。
- 変更した全テキストを厳格UTF-8として復号し、BOMなしを検査する。`.blend`と`.glb`の存在・容量も確認する。
- T01計画を全完了にし、`docs/plan.md`のT01を完了へ更新して結果を追記する。T02以降は未着手のまま保持する。
- 最終差分をコミットしてoriginへpushし、`develop`宛てのT01 Pull Requestを作成する。

## 前提

- 現在のBlenderシーン内容は破棄してよいという最新指示を適用する。
- 検証画面は独立Vite構成、成果物はv2/T01階層、縮尺はBabylon親ルート適用とする。
- テストコースはテクスチャなしの小型プリミティブ資産として通常Gitで管理し、T01ではGit LFSを導入しない。

## 追加決定

- リポジトリ内の`AGENTS.md`探索は終了し、自動適用された`C:\Users\draft\.codex\AGENTS.md`と`docs/plan.md`、`docs/plans/v2/T01/plan.md`に従う。
- 現在のBlenderシーンは今回だけのテストシーンなので破棄し、接続中のGUI BlenderシーンをそのままT01成果物へ作り直す。
- テストコースは学校で必要になる玄関相当の段差、廊下相当の壁・天井、階段室相当の階段・踊り場を小さく集め、後続ロジックを検証するためのステージとする。学校本体や詳細な間取りは作らない。

## ステップ

- [x] 日付、Git状態、T00完了、最新`develop`、Blender MCP接続を確認し、専用ブランチを作成する
- [x] テストコースの寸法、原点、メッシュ命名、衝突形状を確定する
- [x] Blender MCPで現在シーンをテストコースへ作り直す
- [x] `.blend`とGLBを保存し、表示メッシュと衝突メッシュを検査する
- [x] 独立したBabylon.js検証画面と専用ビルドを実装する
- [x] 縮尺、軸、表示、衝突、破棄、再読み込みを検証する
- [x] v2ステージ資産仕様書へ規約と実測結果を記録する
- [x] 関連ビルド、UTF-8（BOMなし）、括弧対応、差分を検証する
- [x] 本計画と全体`docs/plan.md`へT01の完了結果を記録する
- [x] 変更をコミット、pushし、`develop`宛てPull Requestを作成する

## 結果

- 2026-07-18 15:28 JSTに開始確認を実施した。
- `develop`と`origin/develop`は`59b16cc`で一致し、開始時の作業ツリーはクリーンだった。
- Blender MCPへ接続でき、開始時シーンは`Cube`、`Light`、`Camera`、`RedSphere`の4オブジェクトだった。このシーンはユーザー承認に基づき破棄対象とする。
- `codex/v2-t01-glb-contract`ブランチを最新`develop`から作成した。
- コースは9m×10m、原点は中央レーン入口の床上面、Blender X＝右・Y＝前・Z＝上とした。
- 左レーンを1:4斜面＋高さ0.8m踊り場、中央レーンを0.15m段差＋下面2.1m天井＋高さ2.4m壁、右レーンを蹴上0.15m・踏面0.30mの6段階段＋高さ0.9m踊り場とした。
- `FloorBase`、`Step015`、`Slope`、`SlopeLanding`、`StairLanding`、`WallStop`、`CeilingLow`をVIS/COLの対とし、`VIS_Stairs`と`COL_StairRamp`を分離する計16メッシュ構成を確定した。
- Blender MCPで既存の4オブジェクトを破棄し、`VIS`コレクション8メッシュと`COL`コレクション8メッシュへ作り直した。
- 全メッシュでObject名とMesh Data名が一致し、scale `(1, 1, 1)`、rotation `(0, 0, 0)`、床9m×10m、段差高0.15mなどの設計寸法と一致することをPython検査とビューポートで確認した。
- `assets/blender/v2/T01/t01_glb_collision_course.blend`を104,573 bytesで保存した。
- `public/stage-assets/v2/T01/t01_glb_collision_course.glb`をBlender glTF exporter 5.2.39、GLB 2.0、Y-up、実メートルで27,216 bytesに出力した。
- GLBのJSONチャンクを厳格UTF-8で解析し、Node 16件・Mesh 16件がすべて設計どおりの`VIS_`または`COL_`名であり、マテリアル6件を含むことを確認した。
- 両バイナリは小型かつテクスチャ非同梱のため、Git LFSを導入せず通常Gitで管理する。
- `@babylonjs/loaders` 6.49.0と`validation/v2/T01`の独立検証画面を追加し、通常ゲームへ接続せず`LoadAssetContainerAsync`を検証できる構成にした。
- `dev:t01`、`typecheck:t01`、`build:t01`を追加し、専用TypeScript型検査とVite本番ビルドが成功した。
- 検証画面はVIS/COL命名、0.25倍の管理親、楕円体衝突プローブ、AssetContainer破棄、再読込後の署名一致を自動判定し、COL表示切替も提供する。
- Browserで初回読込と再読込を実行し、命名、設定、縮尺、軸、床・段差・斜面・踊り場・階段ランプ・壁・天井の衝突、破棄、再読込同一性の全28項目がPASSした。
- Babylon 6.49左手系での最終軸は`Blender +X → Babylon -X`、`Blender +Y → Babylon -Z`、`Blender +Z → Babylon +Y`と実測した。
- 床9m×10mは2.25×2.50、0.15m段差は0.0375、階段ランプ中央面0.45mは0.1125ワールド単位と実測した。
- 不可視の`COL_StairRamp`へ現行プレイヤー相当の楕円体プローブが衝突し、表示階段には衝突を設定していないことを確認した。
- 手動のCOL表示／非表示、GLB破棄、GLB再読込、全検証再実行を確認し、ブラウザコンソールのwarning/errorは0件だった。
- `docs/spec_stage_assets_v2.md`を新規作成し、配置、Blender座標、glTF変換、Babylon最終軸、0.25縮尺、VIS/COL命名、階段ランプ、GLB出力、AssetContainer破棄、全実測結果を正本化した。
- `docs/plan.md`のT01を完了へ更新し、T00時点の未変更記録と区別したうえで成果物、縮尺、全28項目PASS、T02以降未着手を記録した。
- `npm run build`と`npm run build:t01`が成功し、専用型検査によってTypeScriptの構文・型・括弧対応も確認した。
- T01のVite公開範囲を専用GLBへ限定し、`dist/t01-validation`を4ファイル・4,092,923 bytesにした。public、通常dist、T01 distのGLBは27,216 bytesかつ同一SHA-256だった。
- 公開URL変更後もBrowserで全28項目PASSとCOL表示／非表示切替を再確認した。
- 変更テキスト10件を厳格UTF-8として復号し、BOMなしを確認した。JSON 3件の構文解析、GLB 2.0の16メッシュ・VIS/COL各8件・Material 6件、`git diff --check`も成功した。
- 最終保存後のBlenderはMetric・1 unit＝1m、16メッシュ、VIS/COL各8件、Object名とMesh Data名の一致、scale 1、保存済み状態を維持している。
- T01成果物を`d089010`（`feat: v2ステージ資産規約を技術検証`）としてコミットし、`origin/codex/v2-t01-glb-contract`へpushした。
- `develop`宛てDraft Pull Request [#35](https://github.com/catoriinu/haigure_survival/pull/35)を作成した。T02以降は未着手のまま保持している。
