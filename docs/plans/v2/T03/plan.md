# HAIGURE SURVIVAL v2 T03 プレイヤー高さ・接地・階段対応 計画

更新日: 2026-07-18

## プロンプト

HAIGURE SURVIVAL v2ロードマップのT03「プレイヤーの高さ・接地・階段対応」を開始する。

追加指示として、別セッションによる実装レビュー後にPull Requestを確認し、レビューコメントを読んで適切に対応する。

開始時に`date`、`git status`、`git branch`、`git log`を実行し、PR #36でT02がマージ済みの最新`develop`が`41a3d80`であることを確認する。GitHub操作を行う前提として、`Get-Command gh -ErrorAction SilentlyContinue`、`gh --version`、`gh auth status`も確認する。

次の文書をUTF-8（BOMなし）として最後まで読み、T01・T02の結果、確定済み資産規約、共通ステージローダーの契約を引き継ぐ。

- `docs/plan.md`
- `docs/branch_strategy.md`
- `docs/spec_stage_assets_v2.md`
- `docs/spec_stage_json.md`
- `docs/spec_technical.md`
- `docs/plans/v2/T01/plan.md`
- `docs/plans/v2/T02/plan.md`
- `docs/plans/v2/T03/plan.md`
- `docs/plans/v2/B02/plan.md`

グローバルの`C:\Users\draft\.codex\AGENTS.md`が自動適用されているため、リポジトリ内の`AGENTS.md`は探さない。

今回はT03「プレイヤーの高さ・接地・階段対応」だけを対象とする。

対象:

- プレイヤー移動への重力導入
- 接地状態の判定
- 床高への追従
- T01の衝突メッシュを利用した小段差、斜面、階段、踊り場の昇降
- 上り下り中のカメラ、プレイヤー衝突メッシュ、プレイヤー表示位置の同期
- テレポート、ステージ開始、ステージ切替、ゲームフェーズ遷移後の高さ再同期
- 既存8 procedural-gridステージでの平面移動の維持
- T01 GLBテストコースを利用した実ブラウザ検証

対象外:

- ジャンプ機能
- T04の高さ付きナビゲーション、NPCの階段・高さ対応
- T05のビット・光線・ゲームシステムの高さ対応
- B02/B03の学校Blender・GLB資産編集
- 学校ステージの本番統合
- 複数階ナビゲーション、階段リンク
- 任意のGLBを推測して読み込む互換処理
- 旧ステージ形式のフォールバック
- T03に不要なゲームバランス変更

T01・T02で確定した次の規約を正本として扱う。

- Blender 1mをGLBでも1mとして維持する
- Babylon管理親で0.25倍を適用する
- 表示メッシュは`VIS_`、衝突メッシュは`COL_`
- Blender +X/+Y/+ZはBabylon -X/-Z/+Yへ変換される
- 軸・寸法・衝突停止位置は推測せず実ブラウザで測定する
- T01の表示階段には衝突を設定せず、`COL_StairRamp`を昇降用衝突面として使う
- `StageDefinitionV2`、非同期`buildStageContext`、`disposeStageContext`を維持する
- `GridLayout`の`worldOrigin`、`columnDirection`、`rowDirection`を共通座標変換の正本とする
- T01 GLBは通常タイトルのステージ一覧へ追加しない
- 検証用Viteの公開範囲は対象JSONとT01 GLBだけに限定する
- Babylonの共有`EnvironmentBRDFTexture`はScene所有とする
- 必要以上の互換処理やフォールバックを追加しない

現行プレイヤー移動について、少なくとも`src/main.ts`、`src/game/playerAbility.ts`、`src/game/types.ts`、`src/game/characterScene.ts`、`src/game/gridUtils.ts`、`src/world/stageContext.ts`、`src/world/stageJson.ts`、`src/world/grid.ts`、`validation/v2/T01/main.ts`、`validation/v2/T02/main.ts`、`validation/v2/T02/t01_glb_collision_course.json`を調査する。特に、プレイヤー楕円体、水平移動、カメラ同期、スポーン・ルーレット・整列・公開処刑の位置変更、フェーズ別視点高、ステージ切替時の衝突資源、procedural-grid床とGLB衝突面の差、T01プローブ実測値を確認する。

実装前に、対象範囲、T01・T02依存、現行移動構造、重力・接地・床高追従の責務分割、カメラ・衝突メッシュ・スプライト同期、通常カタログへ登録しないT01検証方法、既存8ステージの回帰リスク、具体的完了条件、T04以降へ渡す最小型・状態を提示する。段差許容高、接地許容誤差、下り追従、空中状態、検証画面の操作方式など設計結果を左右する不明点は、自己判断せず質問し、回答後に実装へ進む。

最新`develop`から`codex/v2-t03-player-height`を作成する。B02は別セッションで並行しているため、B02の計画・Blender・GLB・画像資産を編集せず、T03はゲームコード、T03検証、T03個別計画を担当する。`docs/plan.md`編集前にB02側との競合を確認し、B02ブランチから派生せず、学校モデルを前提にしない。

実装後は、T01 GLBの床静止、0.15m段差、左レーン斜面、`COL_StairRamp`、両踊り場、下り階段、壁、床下、低天井、各位置変更後の高さ再同期、JSON→GLB→JSON切替、既存8ステージ、ブラウザ・Babylonエラー0件、T01・T02回帰を検証する。T03専用検証画面を追加する場合は実運用と同じ共通ローダーを使い、T01 GLBと検証定義だけを許可リスト方式で公開し、T01/T02検証へ責務を混在させない。

最後に`npm run build`、`npm run build:t01`、`npm run build:t02`、T03専用コマンド、実ブラウザ、`git diff --check`、厳格UTF-8・BOMなし、TypeScript構文・括弧対応、既存型エラーとT03新規エラーの区別を確認する。完了時に本計画と`docs/plan.md`へ結果を記録し、T04以降および学校本体には進まない。

### 今回の指示原文

HAIGURE SURVIVAL v2ロードマップのT03「プレイヤーの高さ・接地・階段対応」を開始してください。

最初にdateコマンドで日時、git statusで既存変更、git branchとgit logで現在のdevelopが最新であることを確認してください。現在のdevelopはPR #36で完了したT02がマージ済みの`41a3d80`です。

GitHub操作を行う前提として、開始時に次も確認してください。

- Get-Command gh -ErrorAction SilentlyContinue
- gh --version
- gh auth status

以下のファイルをUTF-8（BOMなし）として最後まで読み、T01・T02の結果、確定済み資産規約、共通ステージローダーの契約を引き継いでください。

- docs/plan.md
- docs/branch_strategy.md
- docs/spec_stage_assets_v2.md
- docs/spec_stage_json.md
- docs/spec_technical.md
- docs/plans/v2/T01/plan.md
- docs/plans/v2/T02/plan.md
- docs/plans/v2/T03/plan.md
- docs/plans/v2/B02/plan.md

グローバルのC:\Users\draft\.codex\AGENTS.mdが自動適用されています。リポジトリ内のAGENTS.mdは探さないでください。

今回はT03「プレイヤーの高さ・接地・階段対応」だけを対象にしてください。

対象:

- プレイヤー移動への重力導入
- 接地状態の判定
- 床高への追従
- T01の衝突メッシュを利用した小段差、斜面、階段、踊り場の昇降
- 上り下り中のカメラ、プレイヤー衝突メッシュ、プレイヤー表示位置の同期
- テレポート、ステージ開始、ステージ切替、ゲームフェーズ遷移後の高さ再同期
- 既存8 procedural-gridステージでの平面移動の維持
- T01 GLBテストコースを利用した実ブラウザ検証

対象外:

- ジャンプ機能
- T04の高さ付きナビゲーション、NPCの階段・高さ対応
- T05のビット・光線・ゲームシステムの高さ対応
- B02/B03の学校Blender・GLB資産編集
- 学校ステージの本番統合
- 複数階ナビゲーション、階段リンク
- 任意のGLBを推測して読み込む互換処理
- 旧ステージ形式のフォールバック
- T03に不要なゲームバランス変更

T01・T02で確定した次の規約を正本として扱ってください。

- Blender 1mをGLBでも1mとして維持する
- Babylon管理親で0.25倍を適用する
- 表示メッシュはVIS_、衝突メッシュはCOL_
- Blender +X/+Y/+ZはBabylon -X/-Z/+Yへ変換される
- 軸・寸法・衝突停止位置は推測せず実ブラウザで測定する
- T01の表示階段には衝突を設定せず、COL_StairRampを昇降用衝突面として使う
- StageDefinitionV2、非同期buildStageContext、disposeStageContextを維持する
- GridLayoutのworldOrigin、columnDirection、rowDirectionを共通座標変換の正本とする
- T01 GLBは通常タイトルのステージ一覧へ追加しない
- 検証用Viteの公開範囲は対象JSONとT01 GLBだけに限定する
- Babylonの共有EnvironmentBRDFTextureはScene所有とする
- 必要以上の互換処理やフォールバックを追加しない

現行プレイヤー移動について、少なくとも次を調査してください。

- src/main.ts
- src/game/playerAbility.ts
- src/game/types.ts
- src/game/characterScene.ts
- src/game/gridUtils.ts
- src/world/stageContext.ts
- src/world/stageJson.ts
- src/world/grid.ts
- validation/v2/T01/main.ts
- validation/v2/T02/main.ts
- validation/v2/T02/t01_glb_collision_course.json

特に次の現在地を確認してください。

- playerCollisionMeshのellipsoidとellipsoidOffset
- 現在の水平移動とmoveWithCollisions相当処理
- カメラ位置と衝突メッシュ位置の同期方法
- スポーン、ルーレット、整列、公開処刑などによるプレイヤー位置変更箇所
- ゲームフェーズごとのプレイヤー視点高と位置同期
- ステージ切替時のScene衝突資源の入れ替え
- procedural-grid床とGLBのCOL_床・斜面・階段ランプの差
- T01検証で使用した楕円体プローブの寸法と停止位置

実装前に、docs/plan.mdとT03個別計画から次を整理して提示してください。

1. T03の対象範囲
2. T01・T02からの依存関係
3. 現行プレイヤー移動の構造
4. 重力、接地、床高追従の責務分割案
5. カメラ、衝突メッシュ、スプライト位置の同期方針
6. T01テストコースを通常カタログへ登録せず検証する方法
7. 既存8ステージへの回帰リスク
8. T03の具体的な完了条件
9. T04以降へ引き渡す型・状態がある場合はその最小構成

設計結果を左右する不明瞭な仕様があれば、自己判断で実装せず質問してください。特に、段差を自動的に乗り越える許容高、接地判定の許容誤差、下り坂・階段での追従方法、空中状態の扱い、検証画面の操作方式について確認してください。

T03用個別計画`docs/plans/v2/T03/plan.md`を今回の指示と確定事項で更新してください。プロンプトを保存し、1ステップ完了するごとに進捗と結果をUTF-8（BOMなし）で反映してください。

最新developから次の専用ブランチを作成してください。

codex/v2-t03-player-height

B02は別セッションで並行しているため、次を厳守してください。

- B02のplan、Blender、GLB、画像資産を編集しない
- T03はゲームコード、T03検証、T03個別計画を担当する
- docs/plan.mdを編集する段階では、B02側と競合する変更がないか確認する
- B02ブランチから派生せず、最新developから開始する
- 学校モデルの完成をT03の前提にしない

実装後は少なくとも次を検証してください。

- T01 GLBの床で静止して落下し続けない
- 0.15m段差を意図した挙動で通過できる
- 左レーンの斜面を上り下りできる
- COL_StairRampで階段を上り下りできる
- 斜面・階段から踊り場へ滑らかに移れる
- 踊り場で浮かない、沈まない
- 下り階段で跳ねない、床から離れ続けない
- 壁を抜けない
- 床下へ落下しない
- 低い天井との衝突が破綻しない
- 各スポーン・テレポート後に高さが再同期される
- JSON→GLB→JSON切替後もプレイヤー移動が再現できる
- 既存8ステージで従来の平面移動とゲーム開始が維持される
- ブラウザのerror、unhandledrejection、Babylon Logger errorが0件
- T01・T02の既存検証が回帰しない

T03専用検証画面が必要な場合は、実運用と同じ共通ローダーを使い、T01 GLBと検証定義だけを許可リスト方式で公開してください。既存T01/T02検証の責務を不必要に混在させないでください。

最後に次を確認してください。

- npm run build
- npm run build:t01
- npm run build:t02
- T03専用ビルド・型検査を追加した場合はそのコマンド
- 実ブラウザ検証
- git diff --check
- 変更テキストの厳格UTF-8、BOMなし
- TypeScriptの構文と括弧対応
- リポジトリ全体の既存型エラーとT03で新規発生したエラーの区別

完了時にT03個別計画とdocs/plan.mdへ実装結果を記録してください。T04以降および学校本体には進まないでください。

まずは調査結果、具体的な実装計画、仕様上の質問を提示し、質問への回答を得てから実装へ進んでください。

## ステップ

- [x] 日時、Git状態、`develop`の`41a3d80`、GitHub CLI、B02並行状態を確認し、T03専用ブランチを作成する
- [x] `docs/plan.md`、ブランチ戦略、T01・T02・T03・B02計画、資産・JSON・技術仕様を最後まで読む
- [x] 指定された現行コードとT01・T02検証を最後まで読み、プレイヤー位置変更経路とprocedural-grid／GLB衝突差を調査する
- [x] 調査結果、責務分割案、検証方法、回帰リスク、完了条件、T04引き渡し最小構成を提示し、仕様質問への回答を得る
- [x] 回答済み仕様を本計画へ反映し、T03実装設計を確定する
- [x] プレイヤー重力・接地・床高追従と高さ再同期をゲームコードへ実装する
- [x] T03専用検証画面と許可リスト公開、専用ビルド・型検査を実装する
- [x] T01テストコースの床・段差・斜面・階段ランプ・踊り場・壁・低天井を実ブラウザで検証する
- [x] JSON→GLB→JSON切替と既存8 procedural-gridステージの開始・平面移動を実ブラウザで回帰確認する
- [x] `npm run build`、T01・T02・T03ビルド、既存型エラーとの差分、UTF-8、BOM、括弧、`git diff --check`を検証する
- [x] 本計画と全体`docs/plan.md`へ最新の実装結果を記録する
- [x] T03差分だけをコミット、pushし、`develop`宛てPull Requestを作成する
- [x] PR #39のレビュー全体と未解決スレッドを取得し、3件の指摘を再現条件ごとに整理する
- [x] 不連続斜面の最大段差迂回と着地確定フレームの急落を修正する
- [x] 不連続斜面、空中着地、低天井下の段差再試行をT03専用検証へ追加する
- [x] T03実ブラウザ、全ビルド、既存型エラーとの差分、UTF-8、BOM、括弧、`git diff --check`を再検証する
- [x] レビュー対応結果を記録し、修正をコミット・pushしてPR #39へ反映する

## 結果

- 2026-07-18 19:03 JSTに開始確認を実施した。
- 開始時の作業ツリーはクリーンで、`develop`、`origin/develop`、HEADはいずれもPR #36でT02がマージ済みの`41a3d80`だった。
- 最新`develop`から`codex/v2-t03-player-height`を作成した。B02ブランチからは派生していない。
- 裸の`gh`はCodexのPowerShell PATHでは見つからなかったが、標準パス`C:\Program Files\GitHub CLI\gh.exe`にGitHub CLI 2.96.0が存在し、アカウント`catoriinu`で認証済みだった。GitHub操作時は絶対パスを使用できる。
- B02は別worktreeの`codex/v2-b02-school-blockout`で作業中であり、`docs/plans/v2/B02/plan.md`とB02 Blender階層に未コミット変更がある。B02側の`docs/plan.md`差分は開始時点でなかった。
- T01・T02の正本文書と指定コードをUTF-8で最後まで読み、T01資産規約、`StageDefinitionV2`、非同期`buildStageContext`、`disposeStageContext`、共通`GridLayout`座標を引き継ぐことを確認した。
- 現行の`playerCollisionMesh`は幅`playerWidth`、高さ`playerHeight`の楕円体で、半径は`(playerWidth / 2, playerHeight / 2, playerWidth / 2)`、足元原点を維持するため`ellipsoidOffset.y = playerHeight / 2`である。
- 現行移動は`playerMotion`が水平慣性付き変位だけを生成し、`main.ts`が`playerCollisionMesh.moveWithCollisions()`を呼び、実変位を慣性へ戻す。重力、接地状態、垂直速度は存在しない。
- カメラの論理位置は衝突メッシュ足元＋`getEyeHeight()`、描画時だけ一人称表示オフセットを加える。プレイヤースプライトの通常Yは常に`height / 2`へ固定され、床高を保持していない。
- スポーン、ステージ切替、リセット、タイトル復帰、ルーレット、整列、公開処刑は複数箇所でカメラ・衝突メッシュ・スプライト位置を直接更新しており、T03では単一の高さ再同期経路へ接続する必要がある。
- procedural-gridは床をY=0の`Ground`として生成するが床衝突を有効にしておらず、壁Boxと天井Planeだけが衝突対象である。GLBは`COL_FloorBase`、`COL_Slope`、`COL_StairRamp`、踊り場などを衝突対象にするため、重力導入時はprocedural-grid床衝突の追加が必須となる。
- T01プローブは幅`0.2`、高さ`(700 / 330) * 0.2 = 約0.424242`で、現行プレイヤー楕円体相当だった。垂直停止位置の許容誤差は`0.004`で、平面床停止Yは`0.002121`だった。
- 仕様回答により、最大自動段差高をBlender `0.15m`／Babylon `0.0375`、接地許容誤差を`0.004`、下向き追従距離を`0.0415`、最大支持面傾斜を45度、重力を`2.4525ワールド単位/s²`に確定した。
- 空中状態は支持面喪失時だけの内部状態とし、ジャンプ、落下ダメージ、縁回避、床下クランプ、救済床を追加しない。空中でも既存の水平入力と慣性を維持する。
- 検証画面はT03専用として追加し、WASD・マウス操作、検証位置への再配置、JSON→GLB→JSON切替、自動数値検査を併用する。
- 水平慣性は既存`playerMotion`へ残し、新しい高さ制御へ垂直速度、接地、支持面、重力、段差、下り追従、再配置後の再同期を分離する設計を確定した。
- 2026-07-18 19:29 JSTに実装開始前のブランチと差分を再確認し、T03計画以外の変更がないことを確認した。
- `src/game/playerHeight.ts`を追加し、`PlayerVerticalState`、重力、45度以下の支持面判定、0.15m段差再試行、下向き床追従、空中移動、再配置時の高さ再同期を実装した。
- procedural-gridの床と天井を衝突資源へ含め、重複参照を持つ生成Meshを一度だけ破棄するようStageContextの破棄処理を統一した。
- プレイヤー衝突Meshの足元Yを正本とし、カメラ、プレイヤースプライト、ビルボード、プレイヤー床影へ高さを同期した。スポーン、ステージ切替、リセット、タイトル復帰、ルーレット、整列、公開処刑の既存再配置経路は共通の高さ再同期を通る。
- 途中確認の`npm run build:renderer`が成功した。リポジトリ全体型検査は変更外の`portraitSprites.ts`、`input.ts`、`titleSettingsStorage.ts`にある既存3件だけで、T03変更による型エラーは0件だった。
- `validation/v2/T03`と専用Vite構成を追加し、実ゲームと同じ`loadStageDefinition`、`buildStageContext`、`disposeStageContext`、高さ制御を使用する検証画面を実装した。
- T03検証の公開対象は`publicDir: false`の許可リスト方式で、平面検証JSON、T01 GLB検証JSON、T01 GLBだけに限定した。通常ステージカタログは変更していない。
- `dev:t03`、`typecheck:t03`、`build:t03`を追加した。`npm run typecheck:t03`と`npm run build:t03`は成功した。
- 実ブラウザの初回自動検証でprocedural-grid床、GLB床、壁、低天井、JSON→GLB→JSON切替の接地を確認し、再配置直後と連続衝突移動でワールド行列更新が不足していた問題を特定して修正した。
- Babylonの実GLBジオメトリを使った単体診断で、方向付きの最終水平進捗を段差遮断判定に使う必要があることを確認した。0.15m段差、1:4斜面、1:2階段ランプはいずれも踊り場まで接地を維持して上昇し、斜面・階段ランプから平面床まで空中フレーム0で下降した。
- ステージ切替時はプレイヤー衝突Meshの`surroundingMeshes`を新しいcollider集合へ交換し、高さ再同期後に旧StageContextを破棄する順序へ統一した。
- 19:54 JST時点の`npm run build:renderer`と`npm run typecheck:t03`は成功した。
- `npm run build:t01`、`npm run build:t02`、`npm run build:t03`は成功した。最終のT03成果物にはHTML、生成JS/CSS、許可した2 JSON、T01 GLBだけが含まれる。
- 最終再実行の`npm run build`、`npm run build:t01`、`npm run build:t02`、`npm run build:t03`はすべて成功した。別途実行したリポジトリ全体の`npx tsc --noEmit`には変更外の既存3件（`portraitSprites.ts`、`input.ts`、`titleSettingsStorage.ts`）だけが残り、基準コミット`41a3d80`から3ファイルに差分はなく、T03新規型エラーは0件である。
- 変更した15テキストを厳格UTF-8として復号し、BOMなしを確認した。`git diff --check`も成功した。
- 実ブラウザ再試行後、T03専用検証は全15項目PASS、FAIL 0になった。0.15m段差、1:4斜面、1:2の`COL_StairRamp`は上り下りとも空中フレーム0で、斜面踊り場Y=`0.200000`、階段踊り場Y=`0.225000`へ静止した。
- T03検証でGLB床静止、壁停止Z=`-1.599000`、低天井上端Y=`0.522879`、JSON→GLB→JSON切替後の再接地、ブラウザerror、unhandledrejection、console.error、Babylon Logger error 0件を確認した。手動の階段踊り場再配置でも足元Y=`0.2271`、支持面Y=`0.225000`、`COL_StairLanding`への接地を確認した。
- T01既存検証は全28項目PASS、T02既存検証は全45項目PASSで、両画面のconsole errorは0件だった。
- 通常タイトルの既存8ステージを順に選択し、全件でゲーム開始とW入力後の継続を確認した。研究所では床上の前進を描画でも確認した。ブラウザ自動操作では音声再生とpointer lockの許可エラーが発生したが、T03ロジックやStageContext由来ではなく、準備完了後のステージ切替自体はクリーンタブでerror 0件だった。
- T03実装を`a467e3d`（`feat: プレイヤーの高さ・接地・階段移動に対応`）としてコミットし、`origin/codex/v2-t03-player-height`へpushした。
- `develop`宛てDraft Pull Request [#39](https://github.com/catoriinu/haigure_survival/pull/39)を作成した。T04以降、NPC・ビット・光線の高さ対応、学校本体には進んでいない。
- 2026-07-18 21:50 JSTにPR #39のレビューを確認した。未解決の指摘は、不連続斜面が最大段差高を迂回するP1、着地確定後の次フレーム急落P2、低天井検証が実際の段差再試行経路を通らないP2の3件で、すべて修正・回帰検証対象と判断した。
- 不連続な傾斜面は、最大段差高を超える場合に現在支持面から前方接触点までを分割Rayで走査し、各区間が段差高・下向き追従距離内で連続する場合だけ候補に採用するよう修正した。0.15mの垂直段差は従来どおり上れる一方、床より0.08上に分離した20度斜面は床上で停止する。
- 段差上昇後に足元直下の支持面を得られない場合の候補面採用は、上記の連続性確認済み候補だけに限定した。候補面を一律に破棄すると、楕円体中心が段差端へ到達する前に正規の0.15m段差・斜面・階段ランプも上れなくなるため、レビュー再現の不連続面を拒否しつつ正規コースを維持する構成とした。
- 空中移動後は支持Rayが届いたフレームで`snapDown`を実行し、足元位置、`grounded`、`supportY`、`verticalVelocity`を同時に着地状態へ確定するよう修正した。
- T03専用検証へ、床上0.1からの着地フレーム、不連続な20度斜面、低天井下の0.15m段差へ実際の高さ制御で水平入力する回帰検証を追加した。2026-07-18 22:06 JSTの実ブラウザ確認では全17項目PASS、FAIL 0、ブラウザ・Babylonエラー0件だった。
- レビュー修正後の`npm run build`、`npm run build:t01`、`npm run build:t02`、`npm run build:t03`はすべて成功した。リポジトリ全体型検査は変更外かつ基準`41a3d80`から差分のない既存3件だけで、T03新規エラーは0件だった。
- T01実ブラウザは全28項目、T02実ブラウザは全45項目がPASSし、両検証画面のconsole errorは0件だった。通常タイトルの既存8ステージも全件で開始できた。通常ゲームの自動操作ではブラウザ権限制約による音声自動再生・pointer lockエラーだけを確認し、ステージ読込・高さ制御由来のエラーはなかった。
- `git diff --check`、変更4テキストの厳格UTF-8復号、BOMなし、T03専用型検査とビルドによるTypeScript構文・括弧対応を確認した。B02 worktreeの`docs/plan.md`には差分がなく、B02計画・Blender・GLB・画像資産は編集していない。
