# HAIGURE SURVIVAL v2 T02 ステージ型・共通ローダー・8ステージ移行 計画

更新日: 2026-07-18

## プロンプト

HAIGURE SURVIVAL v2ロードマップのT02「v2ステージ型、共通ローダー、既存8ステージJSONの移行」を実装する。

- `StageDefinitionV2`を`schemaVersion: 2`と`kind`で判別するUnion型として導入する。
  - `procedural-grid`はグリッド形状、環境マップ、生成規則、デカールを保持する。
  - `glb`はBASE_URL相対GLBパスと平面ナビゲーショングリッドを保持する。
- 共通領域を`meta`、`gameplay`、制作注釈へ分離する。
  - `gameplay`はマーカー、ゾーン、`skipAssembly`だけを保持する。
  - `brief`、`L`・`D`意味マップ、`generationRules.zone`は制作注釈として保持する。
  - 全件空の`entities`、`spawners`、`triggers`、`overrides`と不正確な`meta.size`は削除する。
- GLB用平面グリッドはBlender資産原点を基準とするメートル座標で記述する。
  - 列はBlender `+X`、行はBlender `+Y`、セル寸法はメートルとする。
  - BabylonではT01実測値どおり、列方向を`-X`、行方向を`-Z`、距離を0.25倍に変換する。
  - 内部`GridLayout`へ水平原点と行・列の向きを追加し、セル／ワールド変換を両ステージ型で統一する。
- 共通APIを`loadStageDefinition`、非同期`buildStageContext`、`disposeStageContext`へ統一する。
- GLBは`AssetContainer`、管理親、作者メッシュ、マテリアル、テクスチャをコンテキスト単位で破棄する。
- 旧`StageJson`、`loadStageJson`、`StageJson | null`、組込みグリッドへの読込失敗フォールバックは残さない。
- 既存8 JSONをv2形式へ一括移行し、機能上のマップ、スポーン、ゾーン、鏡、専用IDを維持する。
- T01 GLB用検証定義とT02専用検証画面を作るが、通常タイトルのステージ一覧へT01を追加しない。
- 検証用Viteの公開範囲は8 JSON、T01 GLB、検証定義だけに限定する。
- `docs/spec_stage_json.md`と`docs/spec_technical.md`をT02結果へ更新する。
- プレイヤー重力・接地・階段、NPC、ビット、光線の高さ対応、高さ付きナビゲーション、学校本体には着手しない。

PR #36へ別セッションのレビュー結果がコメントされたため、内容を精査して対応し、対応結果をPRコメントとして返信する。レビューで報告された次の4件を対象とする。

- 共有Environment BRDF Textureを非同期RGBD展開中に破棄しない。
- GLBの整列ゾーン中心を`GridLayout`の原点・行列方向による共通水平座標変換へ統一する。
- ステージ切替失敗時に旧コンテキストを維持し、UIを有効ステージへ戻してエラーを表示する。初期ロード失敗もタイトル上へ表示する。
- T02検証で資源実体、Texture・シェーダー準備、Babylon Logger、`error`、`unhandledrejection`、非対称座標と整列中心を検査する。

開始時に日時、Git状態、`develop`、PR #35のマージを確認し、最新`develop`から`codex/v2-t02-stage-loader`を作成する。変更はUTF-8（BOMなし）で行い、1ステップごとに本計画の進捗と結果を更新する。

## ステップ

- [x] 日時、Git状態、最新`develop`、T01マージを確認し、T02専用ブランチを作成する
- [x] T00・T01の結果、資産規約、現行ステージ実装、8 JSONを調査してT02仕様を確定する
- [x] `StageDefinitionV2`、水平座標変換、共通ステージコンテキストを実装する
- [x] procedural-gridとGLBの非同期構築・統一破棄を実装する
- [x] 初期ロードとタイトル上のステージ切り替えを非同期コンテキストへ移行する
- [x] 既存8ステージJSONをv2形式へ移行する
- [x] T01 GLB用検証定義と公開範囲限定のT02検証画面を実装する
- [x] 通常8ステージとJSON→GLB→JSON切り替えを実ブラウザで検証する
- [x] 仕様書、T02計画、全体計画へ結果を反映する
- [x] ビルド、UTF-8、括弧対応、差分を最終検証する
- [x] PR #36のレビューコメントとスレッド状態を取得し、4件の指摘を精査する
- [x] 共有BRDF Textureの所有をSceneへ委ね、非同期RGBD展開中の破棄を防ぐ
- [x] ゾーン矩形中心を共通水平座標変換へ統一する
- [x] ステージ切替・初期ロード失敗時のタイトルUI処理を実装する
- [x] T02検証を資源実体・非同期エラー・座標検査まで強化する
- [x] ビルド、実ブラウザ、UTF-8、差分を再検証する
- [x] レビュー対応結果をコミット・プッシュし、PR #36へ返信する

## 結果

- 2026-07-18 17:07 JSTに開始確認を実施した。
- 作業ツリーはクリーンで、`develop`、`origin/develop`、リモート`develop`はPR #35マージ済みの`0c8b438`で一致していた。
- 最新`develop`から`codex/v2-t02-stage-loader`を作成した。
- T01規約のBlender 1m＝GLB 1m、Babylon管理親0.25倍、`VIS_`／`COL_`、実ブラウザ軸測定、検証公開範囲限定を引き継ぐ。
- v2 JSONは責務別に再編し、制作注釈だけを保持する。T01 GLBは専用検証画面で扱い、GLB用水平座標はBlender資産原点・メートル基準とする。
- `StageDefinitionV2`を`procedural-grid`と`glb`のUnion型として実装し、共通メタデータ、ゲームプレイ、制作注釈を分離した。
- `GridLayout`へセル(0,0)のワールド中心と行・列方向を追加し、既存中央原点とBlender原点基準の両方を同じセル変換で扱えるようにした。
- 非同期`buildStageContext`とコンテキスト所有資源を実装し、GLBではT01規約の0.25倍、VIS/COL設定、AssetContainer破棄を適用した。
- 初期ロードとタイトル切り替えを`loadStageDefinition`と非同期`buildStageContext`へ統一し、古くなったロード結果を破棄してから終了するようにした。
- 8 JSONを`schemaVersion: 2`・`kind: "procedural-grid"`へ移行し、共通ゲームプレイ、グリッド、描画、制作注釈へ再編した。空の予約領域と`meta.size`を削除し、`laboratory`の過剰な最終ゾーン行も削除した。
- 移行後の通常レンダラービルドが成功した。
- T01 GLB用に1mセル9×10、Blender原点基準、中央レーン入口スポーンのv2検証定義を追加した。通常の8ステージカタログには追加していない。
- T02専用Viteを`publicDir: false`と許可リスト配信で構成し、8 JSON、T01検証定義、T01 GLBだけを検証用distへ出力した。
- 実ブラウザで8 procedural-gridの生成・破棄、T01 GLBのVIS 8件・COL 8件、床2.25×2.50、段差0.0375、軸、Blender原点グリッド、AssetContainer破棄、JSON→GLB→JSON切り替えを検証した。
- 通常タイトルには8ステージだけが表示され、8件を順次切り替えて各回「左クリック：開始」へ復帰し、warning/errorが0件であることを確認した。
- PR #36のレビューで、共有BRDF Textureの非同期RGBD展開中の破棄、GLB整列中心の旧座標式、切替失敗時のUI不整合、検証の偽陽性が指摘された。4件はいずれもT02範囲の有効な指摘と判断して対応した。
- `EnvironmentBRDFTexture`はStageContextの参照カウントと明示破棄を廃止し、Babylon.jsのScene共有資源として非同期RGBD展開と最終破棄をSceneへ委ねた。
- `gridAreaCenterToWorld`を追加し、整列・公開処刑・ルーレットが使うゾーン矩形中心を`worldOrigin`、`columnDirection`、`rowDirection`による共通水平変換へ統一した。
- ステージ切替失敗時は現行requestだけがselectとサイドバーを有効ステージへ戻し、タイトルへエラーを表示する。初期定義・カタログ・コンテキスト構築の失敗もタイトルへ致命エラーを表示するようにした。
- T02検証は破棄前にGLBのNode、Material、Texture参照を保持して実体残留を検査し、Scene共有BRDFの準備、非対称セル往復、`assembly_area`中心、Babylon Logger、`error`、`unhandledrejection`を検査する全45項目へ強化した。
- 強化後のT02検証を実ブラウザで2回連続実行し、どちらも全45項目がPASSした。Babylon Logger error、ブラウザerror、unhandled rejection、console warning/errorは0件だった。
- 通常タイトルで8ステージを順次切り替え、全件で選択値が対象ステージに一致し「左クリック：開始」へ復帰した。console warning/errorは0件だった。
- レビュー対応後に`npm run build`、`npm run build:t01`、`npm run build:t02`、`git diff --check`が成功した。変更テキスト12件は厳格UTF-8、BOMなしだった。
- リポジトリ全体の`tsc --noEmit`は、変更外の`portraitSprites.ts`、`input.ts`、`titleSettingsStorage.ts`にある既存3件だけが失敗し、T02変更による追加エラーはなかった。
- 旧JSONとv2 JSONを機械比較し、意図した`laboratory`の余剰1行削除を除いて、マップ、物理、環境、スポーン、ゾーン、鏡、制作注釈が8件すべて一致することを確認した。
- `npm run build`、`npm run build:t01`、`npm run build:t02`が成功した。Electron、T01・T02専用TypeScriptの型・構文・括弧対応を確認した。
- 追加のリポジトリ全体`tsc --noEmit`では、今回未変更の`portraitSprites.ts`、`input.ts`、`titleSettingsStorage.ts`に既存の型エラーが各1件あった。T02変更ファイルの型エラーは0件だった。
- 変更テキスト26件を厳格UTF-8として復号し、BOMなしを確認した。JSON 9件の構文解析、`git diff --check`も成功した。
- T02検証distは許可対象とHTML／CSS／JSだけの13ファイルで、GLBは公開元と同じSHA-256 `CF6CF17CF7447152D0B25219045C33EFB2E1A1821C201ACD6E51E39F468EA69B`だった。
- `docs/spec_stage_json.md`をv2契約へ全面更新し、`docs/spec_technical.md`と`docs/spec_stage_assets_v2.md`へ非同期ローダー、統一破棄、共有Texture所有を反映した。
- T03以降のプレイヤー高さ、NPC、ビット、光線、学校本体には着手していない。
