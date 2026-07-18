# HAIGURE SURVIVAL v2 T04 3Dステージ空間基盤・NavMesh移行 計画

更新日: 2026-07-19

## プロンプト

了解です。このタイミングでJSONマップとセルナビは廃止しましょう。V2では完全に新しく3Dマップをもとに、すべての処理を行います。そもそもJSONは、元のセルでやっていた頃に、少しだけ変更すればプレイヤーが手元で壁などを変更でき、オリジナルの迷路を作れて嬉しいかもしれないと考えていましたが、その機能はおそらく誰も使っていないため、やめることにします。

V2ではすべてのマップにおいてJSONではなく、管理方法の設計は任せますが、別の持ち方にしてください。関係する処理もすべて書き換えてください。既存8ステージについても、JSONをもとに同じような3Dステージへ将来的に移行したいとは考えていますが、JSON依存から処理をすべて書き換える際にV1で作ったマップが妨げになる場合は、いったん対象外として構いません。V2の作業中はしばらく学校だけを中心に進め、将来拡張しやすい基盤にしてください。

## 確定方針

- V2のステージ空間はGLBの3D形状、3Dマーカー、3Dボリューム、NavMeshを正本とする。
- `mainMap`、`zoneMap`、`GridLayout.cells`、`FloorCell`、文字セル記号をV2実行経路から廃止する。
- ステージ選択用のID、表示名、GLBとNavMeshのURLだけはTypeScriptの小さなカタログで保持し、ステージ空間をJSONへ重複記述しない。
- 表示は`VIS_*`、移動衝突は`COL_*`、移動体専用衝突は`COL_ActorOnly_*`、NavMesh生成元は`NAV_*`、位置は`MRK_*`、領域は`VOL_*`、特殊接続は`LNK_*`として3D資産規約へ追加する。
- NPCはNavMesh上の3D経路を使用する。ビットはNavMesh経路を水平基準として床面相対高度を保持し、自由飛行が必要な挙動だけを後続の3D飛行経路へ分離する。
- 壁・床・天井・窓の光線と視線はGLB実メッシュへ連続レイ判定し、NavMeshやセルで代用しない。
- 既存8ステージはV2タイトルと実行経路から一旦外す。互換アダプターは作らず、将来それぞれをGLB・NavMesh化して再導入する。
- 当面の通常ゲーム対象は学校だけとする。学校に未作成の3Dマーカーやボリュームを必要とするシステムは、セル互換を残さず、資産追加まで明示的に未接続とする。
- NavMeshは`recast-navigation`で事前ベイクしたRecastバイナリをRuntimeの読込正本とする。実行時生成は制作・比較検証だけに限定し、欠落時のフォールバックには使用しない。

## ステップ

- [x] JSON文字マップと2Dセル依存の限界、現行依存箇所、T04～T06への影響を調査する
- [x] V2全ステージでJSONマップとセルナビを廃止し、当面は学校だけを対象にする方針をユーザーと確定する
- [x] 現ブランチのセル方式コミットと未コミット差分を責務別に監査し、保持・取り下げ・再実装を確定する
- [x] `docs/plan.md`、ステージ資産仕様、技術仕様、T02・T05・T06計画を3D空間基盤へ改訂する
- [x] `StageSpatialContext`、`NavigationWorld`、3Dマーカー、3Dボリューム、衝突・視線集合の型と所有権を確定する
- [x] GLBの`NAV_*`、`MRK_*`、`VOL_*`、`LNK_*`命名・座標・書き出し・検証規約を確定する
- [x] Blenderの現在ファイル、dirty状態、オブジェクト一覧を読み取り、B02資産を安全に編集できる状態か確認する
- [x] Webの小型3DコースでRecast NavMeshの生成、扉迂回、連続ランプ、到達不能、バイナリ往復を技術検証する
- [x] B02学校へ3D意味Objectと1階NavMeshを追加し、出入口、3階段踊り場、体育館、舞台を含む代表10経路を事前ベイク結果で検証する
- [ ] 将来窓、重複床、複数階・高さ付き接続、Web・Electronでの本番NavMesh読込を技術検証する
- [x] 実行時生成と事前ベイクの時間・容量・再現性を比較し、NavMeshバイナリ形式と生成コマンドを確定する
- [x] 事前ベイクバイナリを所有する`NavigationWorld`を実装し、投影、完全経路、移動拘束、ランダム点、デバッグ表示、破棄を検証する
- [x] NPC・ビットで共有する3D経路追従エージェントを実装し、経路キャッシュ、条件付き再探索、斜面高度、到達不能時停止を検証する
- [x] 学校用TypeScriptカタログとGLB・NavMeshローダーを実装し、ステージJSONを介さず`StageSpatialContext`を構築する
- [x] 学校GLBへプレイヤースポーン、NPC・ビット出現領域、ステージ境界の3Dマーカー・ボリュームを追加する
- [x] NPC・ビット出現VolumeからNavMesh上の3Dスポーン位置を抽選し、最小距離と生成不能を厳格検証する
- [ ] 学校で実際に使用する集合領域と禁止領域を用途確定後に3Dボリュームとして追加する
- [x] プレイヤースポーン、床高、衝突、ステージ境界、再配置を3D空間APIへ移行する
- [ ] NPCの出現、徘徊、追跡、アラート迂回、停止、階段移動をNavMeshへ移行する
- [ ] ビットの出現、探索、追跡、アラート集合、カーペット爆撃解除をNavMesh経路と床相対高度へ移行する
- [ ] 通常ビームの連続3D衝突、ビット視界の3D遮蔽、`COL_ActorOnly_Window_*`透過規則を`StageSpatialContext`へ統合する
- [ ] 集合、警報、トラップ、動的ビーム、ミニマップを3Dマーカー・ボリューム・NavMesh領域へ移行し、学校で未使用の機能はセル互換なしで未接続にする
- [ ] タイトルを学校だけに整理し、既存8 JSONと`procedural-grid`ローダーをV2実行経路から削除する
- [ ] `GridLayout`、`FloorCell`、セル座標変換、セルBFS、JSONステージ型と未使用コードを参照ゼロ確認後に削除する
- [ ] T02・T03検証をGLB・3D空間基盤へ改訂し、JSON fixtureとセル前提の検証を削除する
- [ ] Web実ゲームで学校1階、校庭、渡り廊下、体育館、階段、壁迂回、視界、ビーム、ステージ再読込を手動検証する
- [ ] `npm run build`、T01～T03検証、型検査、UTF-8 BOMなし、括弧対応、`git diff --check`、Blender・GLB・NavMesh監査を行う
- [ ] 実装結果、残るB03・T05・T06境界、既存8ステージの将来3D移行手順を文書へ記録する

## コミット計画

1. `docs: V2ステージを3D空間基盤へ再設計`
2. `revert: 学校テスト用セルナビゲーションを取り下げ`
3. `feat: V2ステージの3D資産契約を追加`
4. `feat: NavMesh技術検証基盤を追加`
5. `feat: 学校用StageSpatialContextを追加`
6. `feat: 学校の3DマーカーとNavMeshを追加`
7. `feat: 3Dスポーン位置サンプラーを追加`
8. `feat: 学校専用V2プレイヤーランタイムを追加`
9. `refactor: NPCの移動をNavMeshへ移行`
10. `refactor: ビットの移動をNavMeshへ移行`
11. `fix: 3Dステージ壁でビームと視界を遮蔽`
12. `refactor: V2のセル・JSONステージ依存を削除`
13. `docs: V2学校ステージ移行結果を更新`

各コミット前に対象差分だけをステージし、関連ビルドと検証が成功した場合だけコミットする。push・Pull Request作成はユーザーの明示指示まで行わない。

## 結果

- 2026-07-19 01:28 JSTに方針転換を開始した。
- 現行実装はステージ構築、スポーン、NPC、ビット、集合、警報、トラップ、動的ビーム、ミニマップなど22 TypeScriptファイル以上でセル型・セル変換へ依存しており、学校JSONだけの置換では解消しないと判断した。
- 旧T04の`NavCellRef`による多層セル案は廃止し、3D `StageSpatialContext`とNavMeshを導入する計画へ置き換えた。
- 未完成だったビットLOS差分は実行時の引数ずれを起こすため取り除いた。GLB実メッシュを使う通常ビーム遮蔽差分は新基盤へ移植する候補として未コミットのまま保全している。
- 現ブランチにはセル方式の学校入口・原点補正・1階ナビ・ビット経路・NPC経路コミットが残っている。履歴のresetは行わず、保持する階段修正と分離して安全なrevertコミットで取り下げる予定である。
- 最初に調査した`RecastJSPlugin`と`recast-detour` 1.6.4は、ViteのES module実行でパッケージ内のtop-level `this`が`undefined`となり初期化できなかった。node_modulesへのパッチや互換wrapperは採用せず、ESMを正式配布する`recast-navigation` 0.43.1へ置き換えた。
- `validation/v2/T04`へセル・JSONを使わない小型3Dコースを追加した。実ブラウザでRecast初期化、壁を抜けず扉へ迂回する6点経路、終端高0.25mの連続ランプ経路、11,116 byteのNavMeshバイナリ往復、到達不能0点の5項目がすべてPASSし、consoleのwarning・errorは0件だった。
- 採用候補を`recast-navigation` 0.43.1の`generateSoloNavMesh()`、`NavMeshQuery`、`exportNavMesh()`、`importNavMesh()`へ更新した。本番は事前ベイクNavMeshの読込だけとし、実行時ベイクは検証・制作入口に限定する。
- 現行B02 GLBはMesh 407件（`VIS_`263件、`COL_`144件）だけで、Empty、node extras、NavMesh生成指定、マーカー、ボリューム、明示境界をまだ含まないことを確認した。
- Blender確認時点では旧B02 worktree側ファイルが開かれ、`bpy.data.is_dirty=true`だったため、保存・破棄・上書き・編集を行わず停止した。旧B02 Git worktree自体はコミット`4e62adf`でクリーンかつoriginと一致している。ユーザーが保存せず閉じ、現作業worktree側ファイルを開き直してから再監査する。
- ユーザーが旧ファイルを保存せず閉じ、現作業worktree側のB02ファイルを開き直した。再監査ではパスが`D:\Users\draft\create\fps_survival20251226\assets\blender\v2\B02\b02_school_blockout.blend`、`bpy.data.is_dirty=false`、全430オブジェクト、Mesh 407件、`VIS_`263件、`COL_`144件であり、安全に資産工程へ進める状態を確認した。この確認時点では保存・編集を行っていない。
- セル方式の5コミットを履歴のresetなしで逆順に取り下げ、階段修正だけを保持した。`npm run build`と`npm run build:t03`を通過後、revertコミット`c94302e`として確定した。
- `docs/spec_stage_assets_v2.md`をGLB意味Object、Object custom properties、Export Collection、GLB監査、NavMesh派生物まで含む資産契約へ改訂し、`docs/spec_stage_runtime_v2.md`へ`StageSpatialContext`、`NavigationWorld`、3D問い合わせ、AI移動、資源所有権を定義した。
- 学校GLBへ`META_Stage`、プレイヤースポーン`MRK_*`、NPC・ビット出現用`VOL_*`、`BND_Stage`、1階用`NAV_*`を追加した。Blenderは443 Object／418 Mesh、GLB出力対象420 Objectで、内訳は`VIS_*`263件、`COL_*`144件、`NAV_*`8件、`META_Stage`1件、`MRK_*`1件、`VOL_*`2件、`BND_Stage`1件である。制作ガイド23件は非出力を維持した。
- プレイヤースポーンから体育館舞台中央への初回経路は部分経路となり、終点誤差`0.762910`を再現した。原因は東西の`GymStageStairHeadWall`下端Z＝2.4mにより、舞台上面からのRuntime通過高が0.35mしかなく、プレイヤー高さ約0.424mとNavMesh高さ0.425mを下回ったことだった。表示・衝突壁双方の下端をZ＝3.4mへ上げ、Blender 2.4mの実開口を確保した。仮connector面は不採用として削除した。
- 修正後、学校1階と3階段踊り場、体育館舞台を含む代表10経路はすべて終点誤差`4.3e-7`以下で到達した。GLBは739,444 bytes、SHA-256 `55A6EAE9AAA169E1CB6389C2D3924BED05D1F9530105DCF92F9F9808FCFEE381`、NavMeshは151,552 bytes、SHA-256 `C0699A5C371AB30A5B85241DEEE38A2603258DE8961A095AA5EF55031A4040E9`である。ベイカーへ代表10経路の終点誤差検査を組み込み、同一入力からの2回ベイクで容量とSHA-256が一致した。
- `NavigationWorld`はRecast WASMを1回だけ初期化し、事前ベイクバイナリの読込、Babylon／Recast座標変換、NavMesh投影、完全経路判定、移動拘束、ランダム点、デバッグMesh、所有資源の破棄を提供する。部分経路と切断島は`null`とし、直進へフォールバックしない。T04検証は扉迂回、連続ランプ、バイナリ往復、NavMesh外、切断島、同一X/Zの上下床分離、空間問い合わせ、破棄後の再生成を含む8/8項目がPASSした。
- 学校だけを登録する非空間TypeScriptカタログへGLB・NavMeshの確定SHA-256を固定し、`StageSpatialContext`で同時取得、ハッシュ照合、作者Nodeの厳格分類、3Dマーカー・ボリューム・境界、NavMesh、Actor・ビーム・視線の空間問い合わせ、所有資源の破棄を実装した。実学校を使うT04ブラウザ検証は12/12項目がPASSし、初回・再実行ともconsole warning／error 0件だった。学校読込は約34～41ms、破棄前後でMesh・Material・TransformNode件数が基準へ戻り、再読込にも成功した。
- 共通3D経路追従エージェントは始点・標的をNavMeshへ投影し、標的移動閾値、定期期限、経路消費、stuck時だけ完全経路を再計算する。到達不能または移動拘束失敗時は標的へ直進せず停止し、再探索期限を待つ。速度×deltaの移動予算で複数経路点を跨ぎ、斜面の3D高度と投影終点を保持する。T04ブラウザ検証は20/20項目がPASSし、console warning／errorは0件だった。
- 3Dスポーンサンプラーは`VOL_*`のworld AABBから候補を生成し、実Volume内判定、NavMesh投影、投影後Volume内判定、重複排除、3D最小距離を満たす点だけを返す。生成不能時は直置きやセルへフォールバックせず、Volume IDと棄却理由別件数を含む例外にする。T04実ブラウザは既存20項目を維持したまま25/25項目が初回・再実行ともPASSし、console warning／errorは0件だった。
- 通常ゲーム入口を学校専用`src/v2/main.ts`へ切り替え、ステージJSON、`GridLayout`、旧`StageContext`を読み込まず、学校GLB／NavMeshから`StageSpatialContext`を構築する。プレイヤーはGLBの`player_spawn` world座標・前方、Actor衝突集合、T03高さ移動、`BND_Stage`を使用し、境界外ではフレーム開始位置へ戻して接地状態を再同期する。実ブラウザは読込完了、クリック開始、接地座標表示、W入力、console warning／error 0件を確認した。
- 舞台階段の形状ディテールと同色境界はB03へ残し、NPC・ビットの複数階移動と高さ付き接続は本T04の後続工程で実装する。
