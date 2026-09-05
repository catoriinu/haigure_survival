# HAIGURE SURVIVAL v2 T06-6D 静的学校資源再利用 計画

更新日: 2026-09-06

## プロンプト

2026-09-06追加訂正：今の注記は、表示領域の中でセンタリングをしてほしい。

2026-09-06追加依頼：挙動的には問題ありませんでした。タイトル画面で設定変更をしたために開始前に再読み込みが必要なときは「左クリック：開始\n（開始前に設定反映を行います）」という文字を2行で表示するように修正してください。

T06-6D「静的学校資源再利用」を実装する。

- 保存済みプロジェクト`fps_survival20251226`のCodex Desktop管理worktreeを使い、最新`develop`をremote再確認したうえで`codex/v2-static-school-resource-reuse`を作成する。手動の`git worktree add`は行わない。
- 現行`StageSpatialContext`を互換aliasやfallbackなしで`StageStaticSpatialView`、`OwnedStageStaticSpatialResources`、`StageSpatialSession`へ分離する。`createStageCatalogFingerprint`、`loadStageStaticSpatialResources`、`createStageSpatialSession`を導入し、全利用元を新契約へ移行して旧loaderを除去する。
- Fingerprintは`StageCatalogEntry`の全fieldを固定順で正規化し、URL、全SHA、schema/profile、Room Variant設定、各mode、depth-prepass material一覧を含める。
- 静的所有は1つの`Scene`、`AssetContainer`、全作者Mesh／Material／Texture、作者Registry、人間用decode済みNavMesh bundle、Room Variant bundle、variant非依存BIT `NavigationWorld`とする。
- session所有は選択Room Variant、人間用`NavigationWorld`、active set、queries、Player／NPC／BIT、扉、エレベーター、Mission、開始位置、入力、HUD、Audio、observer／subscription等とし、静的資源をdisposeしない。
- Locationを作者定義とsession固有query／polygonRef bindingへ分離し、PlayerSpawnの選択NavMesh検証もsession生成時へ分ける。`schoolStageDynamicRuntime`のhidden `WeakMap` seed結合を廃止し、明示的な初期化descriptorにする。
- `Scene`と環境Lightはアプリ所有、Cameraはsession所有として`detachControl`後に明示破棄する。Room Variant、扉、エレベーターの静的Node変更はactivation leaseで作者基準へ必ず戻す。
- 同一fingerprintでは旧動的sessionだけを破棄して静的identityを維持する。catalog変更は`dynamic dispose → static dispose → static load → dynamic create`、アプリ終了は`dynamic → static → Engine`の順に各1回とする。
- 通常Rは元snapshot＋新seed、即時公開処刑Rは同じsnapshot・同じseedの新しい動的sessionへ交換する。
- 動的構築失敗は部分動的資源を逆順で破棄し、静的資源を保持してタイトルへ元エラーを明示する。自動再試行やfallbackは行わず、タイトルの明示操作から手動再試行可能にする。設定変更後は現在設定＋新seed、変更なしなら失敗要求のsnapshot規則を維持する。
- `validation/v2/T06-6D`、専用Vite／Electron runner、package scriptsを追加する。同一fingerprintの3周以上でGLB parse／静的load 1回、静的identity不変、動的identity更新、旧session各1回破棄を固定する。
- static-only baselineに対しActor、Room active set、Mission、timer、予約、乗客、入力、HUD、Audio、observer、subscription、query、人間`NavigationWorld`残留0を確認する。catalog変更、部分構築失敗後の手動再試行、session生成中の終了、`beforeunload`を依存注入fixtureで検証する。
- 実Web／Electronで`通常開始 → R → Enter → 再開始 → 公開処刑 → R → Enter`を確認し、console warning／error、unhandled rejection、資源単調増加がないことを確認する。
- 関連するT04／T05／T06系build・fixture、通常build、依存監査、`git diff --check`、テキスト配布検査、UTF-8 BOMなし、括弧対応を確認する。
- `.blend`、GLB、人間／BIT／Room Variant NavMesh、生成器、カタログ内容は変更せず、Blenderは使わない。
- 完了時に本計画の結果を更新し、T06-6D差分だけをcommitする。push、Pull Request、review、merge、worktree削除は行わない。
- AGENTS.mdの規則どおり対象worktreeから通常ゲーム確認サーバーを起動したままにし、URL、ポート、素材モードを最終報告する。
- 最終監査で判明した、static load／Character visual／初回session構築中の`beforeunload`後に遅延ownerを再公開する競合を、construction tokenと各`await`直後のcancel検査で解消する。終了後に解決した資源はその場で破棄し、static／Character／初回session各遅延fixtureで残留0を固定する。
- Elevator call indicatorはinput生成からRuntime constructor成功までtransaction所有とし、後続stop／constructor失敗時に取得済みadapter／PBRMaterialを逆順破棄する。失敗注入でScene material baseline復帰を固定する。
- B05／T04の指定validationはnullable ownerを取得順に保持し、`Runtime → session → static`の順に`finally`で破棄して、session生成／後続処理のthrowでも静的ownerを失わない。
- Locationは作者定義だけで決まるfloor、barrier／passage、area／AABB、mission参照、stair／elevator／broadcast参照を静的registryで一度だけ構築・検証する。`bindSession`はquery closure、選択human NavMeshへの投影／polygonRef、surface coverage、選択NavMesh依存検証だけを行い、旧互換入口は残さない。
- 実施中のテストが本当に必要か、オーバーエンジニアリングになっていないかを自己レビューし、並行担当者の差分も含めて独立監査する。承認された最小ゲートへ絞り、重複するbuild／Electron／asset監査は追加しない。
- Scene readinessの事前全Mesh走査はcold-cache A/Bで独立効果を確認できない場合に除去し、通常の`scene.whenReadyAsync()`だけを残す。

## 目的

学校1ステージ固定のV2でアプリ所有の静的資源とsession所有の動的状態を厳密に分離し、同一catalog fingerprintのタイトル復帰・R再演・通常再開始ではGLBとNavMeshを再取得・再解析せず、動的状態だけを完全交換する。

## 対象外

- 複数stage cache、LRU、background preload。
- タイトル表示、responsive配置、ゲームオーバー演出、設定fieldの変更。
- `.blend`、GLB、各NavMesh、生成器、カタログ内容の変更。
- 互換alias、旧loader、暗黙fallback、自動再試行。

## ステップ

- [x] 開始前の再構築判定を表示と共有し、設定変更時の2行注記と設定復元時の解除を実装する
- [x] 追加表示の型検査・実画面確認・差分検査を行い、追加修正をcommitする

- [x] remote／branch／worktreeと現行所有グラフを固定し、Fingerprint・静的／session公開契約を定義する
- [x] 静的loader、作者Location、decode済みNavMesh bundle、activation leaseを実装する
- [x] session factory、Location／PlayerSpawn binding、明示的動的初期化descriptor、逆順rollbackを実装する
- [x] アプリ寿命のScene／Light／静的資源とsession寿命のCamera／Runtimeを分離し、R・Enter・catalog変更・終了順を移行する
- [x] T06-6D依存注入fixture、専用Vite／Electron runner、package scriptsを追加する
- [x] 同一fingerprint 3周、残留0、catalog変更、失敗再試行、生成中終了、beforeunloadを検証する
- [x] 実Web／Electron操作と関連T04／T05／T06・通常build・監査・配布検査を完了する
- [x] ownership境界、遅延終了、Elevator rollback、Location静的分離、validation所有順を修正し、対象fixtureを追加する
- [x] 必要性を再評価して承認済み最小検証セットへ絞り、3名の独立監査でblocking finding 0を確認する
- [x] cold-cache A/BでScene事前warm-upの効果なしを確認し、重複全Mesh走査を除去する
- [x] 正本素材を接続した通常ゲーム確認サーバーを対象worktreeから起動し、最終状態を確認する
- [x] 結果を最終実績へ更新し、配布／差分／encoding検査を完了する
- [x] T06-6D差分だけをローカルcommitする

## 結果

2026-09-06中央揃え修正：開始案内の表示領域へ`text-align: center`を指定し、開始案内と設定反映の注記を各行中央揃えにした。通常画面で2行の中心が一致することを確認し、検証用の設定変更は元へ戻した。CSSのみの変更のためゲーム全体のbuildは再実行せず、差分・文字コード検査を行った。

2026-09-06追加修正：タイトルの開始判定と同じsnapshot比較で、再構築が必要なときだけ「左クリック：開始」の次行に「（開始前に設定反映を行います）」を表示する。session所有のイベント購読で設定操作後に更新し、設定を元へ戻したときや新session生成時は再判定する。型検査・依存監査はPASS。通常ゲームの実画面で設定変更時の2行表示、重なりなし、設定復元時の注記解除を確認し、操作した設定を元に戻した。

開始時に`HEAD`、`origin/develop`とも`3587e50476ebaa506dec33fac38c1f50af3c9893`、ahead／behind `0/0`、worktree clean、同名local／remote branch不在を確認し、管理worktree上で`codex/v2-static-school-resource-reuse`を作成した。

`StageSpatialContext`／旧loaderを除去し、非所有`StageStaticSpatialView`、所有wrapper `OwnedStageStaticSpatialResources`、動的`StageSpatialSession`へ分離した。catalog全fieldの決定的fingerprint、GLB／decode済みhuman bundle／static BIT owner、session human NavigationWorld、作者Locationとsession binding、PlayerSpawn検証、Node activation lease、明示seed descriptor、同時session／破棄後生成拒否を実装した。Scene／環境Lightはアプリ、Cameraと全Runtimeはsession所有とし、通常遷移のasync Audio closeとbeforeunload同期破棄を分けた。初回を含む構築中rollbackを公開し、cancel後の遅延NavMesh／session自己破棄、扉→エレベーター部分構築の逆順rollback、dynamic→static→Scene→Engine順を固定した。安定状態の終了はactive sessionだけ、構築遷移中の終了はconstruction rollbackだけを取得し、同一破棄callbackの二重呼出しを防止した。同期終了ではAudio dispose開始時にownerを論理解放し、最終世代のresidualをその場で1回記録する。設定panelをアプリ寿命へ移し、失敗後の明示再試行と設定変更分岐、通常Rの同snapshot＋新seed、公開処刑Rの同snapshot＋同seedを実装した。正本stage runtime／technical仕様も3-owner契約と実装fieldへ同期した。

`validation/v2/T06-6D`、専用Vite、fixture Electron、実ゲームElectron runner、package scriptsを追加した。fixture Electronは13/13 PASS。実ゲームは`通常開始 → R → Enter → 設定反映再開始 → 公開処刑 → R → Enter`を完走し、GLB parse／static load各1、static identity 1、dynamic identity更新、旧session各1回破棄、static-only Scene baseline一致6／不一致0、human NavigationWorld 1、static decoded bundle 1、static BIT 1を確認した。二重`beforeunload`後は最終世代を含む全residualが空、human／static decoded／static BIT owner、Scene資源が各0、最終sessionの破棄成功／呼出しが各1回で、終了処理後を含むconsole warning／error・unhandled rejectionは0だった。Canvas中央が設定inputに重なる問題は、DOM clickへ逃げず、`elementFromPoint`で実Canvasが最前面になる点だけをtrusted mouse inputで操作するようrunnerを修正した。

過剰設計レビューでは、T04／T05／T06のbuildを重複して全再実行する案、T06-6A build、T06-6C game-flow、Character Electron、Blender／NavMesh再監査、heap soakを不採用とした。Scene readiness事前巡回はshader disk cache無効の同条件audio-only A/Bで、あり12.9秒／なし13.2秒と双方PASSし独立効果がなかったため削除した。rollback stackのfixture専用観測APIも逆順実行assertと重複するため削除した。T06-6Bの旧`playing → Enter → assembly → Enter → title`期待は製品契約と不一致だったため、Enter 1回後のtitle、transition完了、dynamic identity更新を確認する最小契約へ修正した。T06-6Dでは通常開始時にtrusted clickとPointer Lockを実確認済みであり、R／タイトル遷移の明示exit後cooldownに依存する「公開処刑完了時もLock保持」は資源再利用契約外なので除外した。Pointer Lockを再取得できない一過性に例外処理や固定待機を追加せず、同じ資源フローを単独実行して全owner診断0件を確認した。

承認済み最小検証として、`npm run build`、`build:t04`、`build:t05`、`build:t06`、`build:t06-6d`、`typecheck:t02`、`typecheck:b05`、`typecheck:t06-2`、`typecheck:t06-3`、`typecheck:t06-4`をPASSした。最終Audio owner修正後にも通常`npm run build`を単独実行し、`typecheck:v2`、V2依存監査、renderer／Electron build、Web配布監査をPASSした。T05 Browserは324/324、標準T06 Electronは11項目、T06-6B Electronは全公開処刑方式とMission／Alarm 4組合せ、T06-6C Electronは通常／即時の全8 viewportとresize連続、T06-6D fixture Electronは13/13、T06-6D実ゲームElectronは指定操作列と同期終了診断をPASSした。

3名の独立監査と自己レビューでは、コード、ownership、資産境界、validationのblocking finding 0件となった。変更はtracked 43＋untracked 10の合計53ファイルで、T06-6D契約と移行先validationに限定される。`.blend`、GLB、各NavMesh、生成器、catalog内容、binaryは変更していない。対象管理worktreeへ配布検査scriptを適用し、changed text 53件、`git diff --check`、UTF-8 BOMなし、ローカル絶対パスなしをPASSした。

通常確認サーバーは対象worktreeの`http://127.0.0.1:5175/`で起動し、正本素材Junctionを使用した。トップ、BGM、SE、Character画像のHTTP 200と`text/html`／`audio/mpeg`／`image/png`を確認した。
