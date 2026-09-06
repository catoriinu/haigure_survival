# T07 実行計画・候補台帳

更新日: 2026-09-06

## プロンプト

> HAIGURE SURVIVAL v2のT07「性能・回帰試験・仕様書」を、GPT-6 Astraで実施してください。既存T07の目的に、根拠に基づくリファクタリング・軽量化・検証工程の改善を加えます。
>
> 最初に実際のcwd、Git root、branch、HEAD、既存差分、worktree、最新origin/developとPR統合状態を確認してください。AGENTS.md、全体計画、next_tasks_plan.md、ブランチ戦略、P2・T07・T06-6Dの個別計画、現行仕様と関連スキルを読んでください。
>
> P2が完了し、リリース必須修正が0件で、必要な修正がdevelopへ統合済みであることを確認してください。満たしていなければT07実装へ進まず、具体的な不足を報告してください。既存差分を保持し、割り当てられた専用worktreeを使ってください。
>
> 目的：これまでの実装を、現行仕様・実際の利用経路・測定結果から見直し、性能、保守性、変更容易性、検証効率を改善することです。Solで実装されたこと自体を問題とせず、T06-6Dなどの改善済み成果を前提にしてください。
>
> まず調査し、T07計画を更新してください。候補ごとに根拠、期待効果、変更範囲、回帰リスク、検証方法、今回実施するかを記録してください。
>
> 調査対象：
> - 未使用コード、到達不能処理、設定やイベントの未接続、廃止仕様の残骸。
> - 重複したゲーム規則・処理・状態、責務の混在、資源の所有・生成・破棄、不要な再計算や割当。
> - 具体的な仕様変更で修正箇所が散らばる構造。必要な範囲の共通化や責務分離。
> - CPU、GPU、AI、NavMesh、視線判定、経路再計画、光線、照明、Mission、ミニマップ、メモリ、初回開始・再開始の負荷。
> - 3D資産の重複面、不可視面、未参照資源、過剰な形状・材質・描画呼出し。
> - 現仕様と不一致のテスト、同じ不具合検出を重複する検証、不要な準備処理、build・型検査・fixtureの重複実行。
> - 調査で判明した、同じ目的に必要な改善。
>
> 実施方針：
> - 変更前に基準値を記録し、実測上のボトルネックと構造上の問題を区別する。
> - 現行仕様を維持する、効果が説明できる改善を小さな単位で実装・検証する。
> - 未使用判断は通常ゲームだけでなく、設定分岐、全variant、動的参照、検証・生成工程も調べる。
> - テストは古さや件数だけで削除しない。守る契約と代替カバレッジを確認する。通常buildに含まれないテストの削除を、通常build高速化と扱わない。
> - 将来の仮定だけに基づく汎用化、互換層、暗黙のfallbackは追加しない。
> - 大規模改修や効果の小さい整理はリリース後候補へ分ける。
> - 学校資産の変更はT07へ混在させず、現行計画どおりP2の問題別資産タスクへ切り出す。削除候補は全variant、見た目、Collider、NavMesh、metadataへの寄与を確認する。
> - 新たな機能不具合はP2の問題別修正として分離し、最終合格前に解消状況を確認する。
>
> T07本来の受入条件を維持してください。
> - 1080p・既定通常構成で60fps目標を検証し、開始直後と定常状態を分ける。
> - NPC 99人／BIT 50機の最大構成は120秒の安定性条件として扱う。
> - 同一端末・解像度・seed・計測区間で変更前後を比較する。
> - 人口、画質、機能、安全判定、ゲームルールを削って性能改善としない。
> - Web／Electronの関連機能、実画面・Player操作、設定・再開始・資源破棄を確認する。
> - 現行T07に記載された数値条件と回帰項目を省略しない。
>
> 各ステップで計画と結果を更新し、仕様書を最終実装へ同期してください。必要な検証に合格した後は、理由のない一括再実行をしないでください。
>
> 実装・検証・文書更新・T07差分のローカルcommitまでを対象とします。push、PR作成、merge、worktree削除は行わないでください。
>
> 最終報告には、実施した改善と根拠、測定結果、維持した契約、検証結果、延期した候補、T07合否、ローカルcommit、通常ゲームの確認URLを記載してください。
>
> まずPlanモードで、P2結果と現行実装を読み、調査対象、基準計測、改善候補の選定基準、実装単位、検証方法を具体化してください。この段階では変更せず、計画を提示してください。実測が必要な判断は未確定と明記し、実行段階の計測後に確定してください。

追加指示:

> サブエージェントを使ってください。簡単な調査や定型作業はGPT-5.6 Sol／Highを使いつつ、難しい設計や判断はGPT-6 Astra／Ultraに任せ、作業内容に応じた振り分けはあなたが判断してください。
>
> では、先程策定したプランと分担で作業を開始してください
>
> 専用worktreeへの割当を行ってください。今はP2かもしれませんが、一つのタスクに統合したので、改名してそれをT07として利用してください。
>
> 測定中は操作を控えて続行する

P2文書の別ローカルcommitと、専用手動worktree作成を承認済み。後者は手動作成案への「はい」による明示承認。

## ステップ

- [x] 前提確認・P2文書9件の別commit・既存差分保全・専用worktree準備。
- [x] 計測基盤を実時間／固定frameに分け、独立fixtureで境界・Long Task遅延通知・末尾回収を確認。
- [x] Web／Electronそれぞれ通常70秒・最大stress120秒を各3回計測。最適化前のソースと計測器を固定。
- [x] P2-U01を独立単位で修正し、通常loading・15秒超・失敗・Canvas再試行・開始注記を6サイズで確認。
- [x] 候補の採否と所有を固定し、一件ずつ実装・対象回帰・同条件比較。
- [x] 最終比較、Web／Electron機能・表示確認、候補採否、仕様同期。
- [x] T04残2資産問題、移動拘束、保持・媒体診断の未解決範囲を固定し、T07差分をローカルcommit。
- [ ] 問題別修正の統合・対象回帰を確認し、後続ゲートで正式V4を実施。

## 計測条件

通常は`V2_DEFAULT_TITLE_SETTINGS`を使い、設定schema・保存キーを変えない。実時間[0,10)と[10,70)を別報告し、通常と同じdelta・増援・Mission・音声・画像を維持する。BIT25は上限であり70秒内の到達数ではない。最大stressは[0,120)で負荷成立証拠を伴う。既存I3固定4200frameとT04 600秒受入は別用途として維持する。

同一端末・GPU・電源条件・runtime版・1920×1080・DPR・素材指紋・設定snapshot・実session seed・視点・入力列・cache条件・計測器版を保存する。各回の未達を平均で隠さない。GCは通常計測区間外の保持検証で実行する。

比較の代表値は、変更前の正式測定に先立ち各条件3回の中央値へ固定した。stressの主要比較指標はCPU work・次callback間隔・旧総frameの各p95/p99と、区間終了後の強制GCで取得する保持heapの`usedSize`とする。`usedSize`はWeb／Electronで共通に取得できる指標として扱う。各主要指標の中央値の悪化5%以内を個別に判定し、3回それぞれの値・範囲・負荷成立・診断・完走の合否も残す。通常構成の絶対条件はcold/steady各回で判定する。`backingStorageSize`、stressの単発最大、未GC heap、GPU、各sectionは補助値として併記し、取得不能を0へ置き換えない。

2026-09-06のElectron 28.3.3初回観測では、CDP `Runtime.getHeapUsage`の結果が`usedSize`と`totalSize`のみで、`backingStorageSize`は未取得だった。このAPI差に基づき、主要heapを両runtime共通の`usedSize`へ統一し、`backingStorageSize`の未取得は補助値として保持する。GC失敗、diagnostics未達、未完了runの扱いは維持する。保持リーク0件の判定は独立した再開始測定で行う。

同じ初回Electron 3回では、helperの待機画面に由来するCSP警告がlaunch段階で記録された。3回は失敗attemptとして保持し、待機画面へCSPを付けるhelper修正後のElectron 3回を正式beforeの対象とする。警告を持つ回を正式3回の中央値へ混ぜない。Webはこのhelperを実行しないため再測定対象へ含めず、比較scriptもElectron helperの版をElectron groupだけで照合する。実ゲームindexの既存CSPは維持する。

比較時は各条件の`*-source.json`からcollector、main、survivalRuntime、bitSystem、runPerformance、mediaObservationのhashを照合する。stressのみperformanceStressWorkload、ElectronのみperformanceElectronを加える。Mission HUDとstageSpatialQueriesの最適化は比較対象の変更として扱う。reportやsource manifestが不足するgroupはincompleteを保存してから他groupへ進み、欠損を0や3回未満の中央値へ置き換えない。

入力再生は、通常の変身解放時刻が実時間の揺れで前後するため、Gを0.5秒間隔で繰り返す共通の要求列を用いる。Player/NPCの状態や完了条件を直接変更せず、実行成否・時刻差・Follower数・実射撃を各回確認する。事前に作った要求列の仮結果を実測結果として扱わず、smokeの実観測結果を正式比較の参照入力へ保存する。

最初のplaying frame入口を起点とし、CPU work、次callbackまでのframe interval、旧`max(work,前interval)`、GPUを区別する。Long Taskはentry.startTimeで窓へ帰属させ、末尾の遅延通知を回収する。未取得指標はnull、未完了・中断・比較不能は独立状態としPASSへ変換しない。reportを退避してからsession observerを破棄する。

I3出典はT06-1のseed20260725・校庭視点・全荒れ・99／66／50・cold600＋steady3600frame。旧work p95/p99=27.1/31.4ms、旧total=33.5/34.0msを維持し、実時間120秒へ直接5%判定を適用しない。条件復元不能な比較は未確定とする。

## 候補台帳

| 候補 | 根拠・期待効果 | 範囲・回帰リスク・検証 | 採否 |
|---|---|---|---|
| 計測条件 | 固定4200frameと99/66/50のみでは通常50人の実時間目標を判断できない | performanceDiagnostics、mainの計測配線、T07 runner。境界・人口・実seed・Long Task・取得不能を検証 | 通常・stressのbefore／after採取と4群判定を完了。固定4200frame参考pairも採取したが比較未確定 |
| P2-U01 | startupDiagnosticsが2要素を同時表示しCSSが同一Gridセルへ配置 | startupDiagnostics/style。loading・失敗・再試行・2行注記・6 viewportで可読性確認 | 採用・適用・独立受入完了 |
| Mission HUD | 同じ表示値でも毎frame DOMを再生成。section p95は0.1msで大幅なfps向上の根拠にはしない | Mission IDごとの要素再利用。同秒内進捗、小数期限、表示順、消失、結果、hiddenとdisposeを回帰 | 採用・適用・回帰・after比較完了。単独の大幅なfps改善は主張しない |
| minimap | 静的markerの再計算はあるがsection p95は0.5ms。動的階・エレベーターの鮮度契約がある | より広いcache導入と動的境界の維持が必要 | 今回の採用対象にしない |
| NPC・BIT・空間問い合わせ | 通常30秒の独立CPU profileでstatic query自己時間1092.8ms、layered ray自己時間721.8ms。集合の反復生成がある | 同一revision内のprivate集合だけ再利用。revision更新、旧query lease、走査順、Sphere安全判定は維持 | 小範囲の集合再利用を採用・適用。抽出比較540組とT05 325/325、after比較完了 |
| 所有・責務 | 起動/session/受入が同じ入口へ接続 | 具体的な変更箇所の散在を示し、小単位化。T06-6D identity・rollback・終了順維持 | 大規模分割は非採用。P2-U01、HUD、query、runnerの限定責務だけ採用 |
| 未使用・未接続 | 参照数だけでは通常と生成・検証の利用を区別できない | 全variant・動的import・DOM・生成器・監査器・fixtureを追跡 | 安全に削除できるコード／3D資産0件。削除非採用 |
| 検証工程 | buildはV2型・依存監査・renderer・配布監査・Electronを内包 | 契約と失敗検出対応、所要時間。fixtureは通常build外 | 13 suite共通runnerを採用。計測器とstress workloadの既存独立fixtureも`measurementRunner.mjs`の再利用入口へ統一。T07型検査PASS（2.53秒）、計測器22＋stress 22＝44/44 PASS（0.69秒）。test本体・製品計測版は不変。既存fixture・監査の削除は非採用 |
| B06構造監査の個数上限 | B06-4採用意味資産の追加と重複校庭面の除去により上限との差+11 Node/+10 Meshを全数説明できる | 3上限だけ1923/1476/1476へ追随。他予算・学校資産は不変、geometry-only監査で確認 | 採用・変更済み、実監査通過 |
| 学校資産 | 既存残骸監査・重複面規約・batch化成果 | 全variant・表示・Collider/NavMesh/metadata・hash・draw/material確認 | 読み取り監査のみ |
| P2-T02 | owner解放後のChromium GPUメッセージ | 稼働中・終了中・終了後、renderer終了理由、最終ownerを分離 | NVIDIA設定読取とempty WebGL因子診断まで完了。無害・原因確定には至らず残課題。ログは抑制しない |

採用には、現契約の維持、実測寄与または具体的な保守上の問題、小さく検証・撤回できることを必要とする。性能のばらつきを超えない効果を高速化と報告しない。将来用途だけの汎用化・大規模分割・低効果整理は延期候補。新機能不具合と学校資産修正はP2問題別タスクへ分離し、最終合格前に未解消を照合する。

## 結果

開始条件確認、計測基盤の独立検証、before／after正式計測、候補の最終採否、再開始保持観測と補助診断を完了した。P2-U01、Mission HUD、空間query membership、13 suite共通runner、B06構造上限追随を採用し、他候補は契約または寄与の根拠に従って非採用とした。数値条件と回帰項目は[担当計画](plan.md)、詳細と5単位のローカルcommitは[結果](results.md)へ集約する。固定4200frame参考pairは採取済みだが比較未確定。移動拘束の局所再現と保持原因の調査限界を記録し、T07全体と正式V4は未完を維持する。

### 改善3件の適用と局所回帰

P2-U01本体を適用した。`runStartupUi.mjs`の結果はloading／stalled／running／failedの4状態×6 viewport＝24条件が合格し、実行前後のsource hashは不変だった。AIが最小480×360の4状態と、6 viewportすべてのstalled画像を実際に確認した。T06-6D再試行Electronも、初回失敗、設定操作による再試行なし、Canvas実クリックによる復旧、現在設定の反映に合格した。これによりP2-U01を完了とする。AIの画像確認を実聴やユーザー確認として扱わない。

Mission HUDのDOM再利用を適用し、dispose後の`resultRows=null`を確認した。T06-4は38/38合格。空間queryのmembership再利用も適用し、抽出比較540組とT05 325/325が合格した。T04は現行資産個数へfixtureを同期して116/118、外部issue 0。残る北西階段4F→屋上BIT遷移の施設壁横断と南西階段2 polygonのNPC物理床誤差超過は、query変更では生じておらず、学校資産・派生NavMeshの別修正へ渡す。

### 最終機能受入と未達条件

`final-functional-acceptance/regression/`の13 suite中、B05、T04学校統合、T05、T05 NPC操作、T06、T06-2、T06-3、T06-4、T06-6A／6B／6C／6Dの12 suiteがPASSした。T04学校統合は82/82、T04総合は最終116/118で、残る2件は上記の資産問題である。13 suite全体は未完を維持する。

`final-functional-acceptance/build.log`の`npm run build`は、V2依存監査、型検査、renderer、Web配布監査、Electronを含めてPASSした。Babylon chunk 4,082.68kBに4,000kB超過警告があり、配布物のローカルaudio／Characterと想定外artifactは0件だった。

T06-6C responsiveはinstant／normal各8 viewportと連続resize 4遷移がPASSした。AIが640×480・480×360のinstant／normal画像を確認し、横overflow、設定到達、値・focus・mode維持を確認した。これはAIによる実画面確認であり、実聴やユーザー確認ではない。

`final-functional-acceptance/electron-runs/2026-09-06T05-27-04-737Z-all/summary.json`は8条件すべてexit 0。元CJS report／logでは設定、Mission、エレベーター、Canvas再試行、R／Enter、通常ゲームの11 check、audio resource 2,148件を合格した。実Webの最終wrapperはCanvas開始、Pointer Lock、W／D／S／A、実mouse左右視点、front／left／right視認をPASSした。ElectronとWebの実操作証拠は分けて評価する。P2-T02はNVIDIA設定読取とempty WebGL因子診断まで完了したが、GPU stderrの無害性と原因は未確定のまま追跡する。

正式比較はWeb normal=`failed`だがbefore比5%以内、Web stress=`passed`、Electron normal=`failed`だがbefore比5%以内、Electron stress=`incomplete`。通常の絶対条件は各runの`frameIntervalTimeMs`で判定し、旧totalと混同しない。24 attempt中23回完走し、Electron stress after 2は107.4166秒でabortした。計測実施は完了したが、通常性能の合格とElectron stressの比較成立は未達である。

after保持観測はWeb／Electronともnormal 3周を完走し、接続DOM数402固定、全最終owner 0だった。WebはusedSize 146414768／163684220／169001688、終了後69330504 bytesで、2→3周のstatic-only baseline不一致1件により構造条件FAIL。追加の資源名付き3周＋6周では全7境界の個数・ID・名前が一致し、不一致は再現しなかった。6周版は別VOICE中断1件で媒体診断FAIL。正式不一致時の資源内訳がなく、限定的な遅延生成・破棄順追跡でも原因は確定しないため、正式1件を未解決として残す。Electronは144304844／164806520／168492132、終了後71153396 bytesで構造条件PASSだが、session 1の`aim.mp3`にcomplete-buffer証拠がなく媒体診断FAIL。別の失敗を混同せず、補助runで正式失敗を置き換えない。

固定4200frame参考pairはbeforeのruntime診断未達、afterの終盤Pointer Lock解除に加え、歴史的I3条件との素材・音量・機能差があるため比較未確定とした。現行値はbeforeのwork p95／p99=30.3／35.6ms、旧total p95／p99=33.9／39.2msに対し、afterは29.1／34.1ms、33.7／38.5ms。採取実施は完了としても合格証拠にはしない。候補の最終採否と今回のローカルcommitは完了した。学校資産・移動拘束の問題別修正、保持・媒体診断の原因確定、通常性能の未達解消と再評価、正式V4が残る。

### 計測基盤の初回確認

V2依存監査・V2/T05型検査通過。計測器の境界、Long Task遅延・末尾回収、observer破棄、中断の19項目に、BIT出現演出中と実人口欠損/上限超過の区別を加え21項目通過。stress負荷証拠のpure testは8項目通過。

その後、CPU work上位10 frameの同時点section/counter保存を追加し、計測器fixtureは22項目通過。stress driverは要求と結果を分けた記録・再生を追加し14項目通過。BITのactive sphereは1.5秒後の初出現位置を観測基準にし、人口50の保持と実変位の証拠を分ける。

実collector・91 counter・18 section・4200 frameの単独benchmark（off/on各3回）で、収集処理の差は6.21/7.87/6.81μs/frame。最終summary生成は9.97～11.22msで計測区間外。強制GCは実行せず、Babylon instrumentationとブラウザ描画の負荷はこの値に含めていない。

通常Web smoke（`smoke/smoke2-web-normal-1.json`）は1920×1080・DPR1、Chrome149、RTX4070 SUPER／ANGLE D3D11で70秒完走。音声ON、BGM1・VOICE12 directory・Character136 file、デフォルト画像割当0、Pointer Lock継続、console/resource異常0、最終owner解放を確認。初回起動5119ms。cold CPU work p95/p99=12.6/16.7ms、frame interval p95/p99/max=16.9/18.3/77.2ms。steady CPU work=13.4/16.4ms、frame interval=16.8/17.6/62.5ms、Long Task62msが1件。数値条件は未達であり正式な変更前3回baselineではない。

同smokeではNPC section p95=7.9ms、BIT経路chaseの単発最大48.6ms、minimap p95=0.5ms、Mission HUD p95=0.1ms。単発値の再現性と原因を確認して採否を決める。BIT初期出現演出のactive sphereが0でも実個体は1機保持されていたため、受入判定を既存`populationBitCount`の観測へ修正した。ゲーム人口・演出は変更していない。

Blender 5.2の正本blendに対する`audit_b06_school_structure.py -- geometry-only`が通過。GLB 22,477,080 bytes、Node 1,923、Mesh/Primitive各1,476、Triangle 420,429。壁のcross-object T-junction 0、エレベーター北壁の同一平面重複面積0。資産の再生成・変更は行っていない。background Blenderのaddon起動不可案内は監査結果と分離して記録した。

### 変更前の正式性能採取

`before-performance-summary.json`と`before/`にWeb／Electron、normal／stress各3回を保存した。完走・実人口・素材・音声有効・Pointer Lock・最終owner解放・source不変を個別に確認した。normalの数値条件は両runtimeとも未達。Electron normalの入力中断回は`before-input-interruption/`へ保持し、同じsourceで有効入力の1回を補った。数値未達を理由とした回の除外は行っていない。

| 条件 | 1回目 | 2回目 | 3回目 |
|---|---:|---:|---:|
| Web normal cold interval p95（ms） | 16.9 | 17.0 | 16.9 |
| Web normal steady interval p95（ms） | 17.0 | 16.8 | 16.9 |
| Electron normal cold interval p95（ms） | 33.6 | 33.7 | 33.6 |
| Electron normal steady interval p95（ms） | 33.5 | 33.5 | 33.5 |
| Web stress CPU work p95（ms） | 47.6 | 47.8 | 48.6 |
| Web stress interval p95（ms） | 49.7 | 50.1 | 50.6 |
| Electron stress CPU work p95（ms） | 67.9 | 70.3 | 61.4 |
| Electron stress interval p95（ms） | 71.2 | 74.0 | 65.2 |

stressは全6回が120秒と実負荷条件を満たした。Web全3回とElectron 2／3回目は診断条件を満たす。Electron 1回目の`aim.mp3`に`net::ERR_ABORTED`が1件あり、4つの候補要素のうち3つは全区間bufferの証拠が不足していた。通信と要素の直接対応、再生完了は未取得のため原因未確定を維持し、当該回を除外せず診断未達として比較へ渡す。console 0件や音声有効flagを、その通信の正常完了証拠へ読み替えない。

Electron normalの定常区間は3回とも1800 frame／60秒で、CPU work平均約13msに対してcallback間隔は約33.3msだった。明示的な30fps設定は現コードで確認できず、runtime・表示環境側とゲーム処理側を分けて追加調査する。

保持測定は独立runnerで実施する。各周のGC前に媒体観測ログをNode側へ退避し、rendererでは最新の性能reportだけ保持する。これにより計測用の過去ログ増加と製品ownerの残留を区別し、同じ方式をbefore／afterで維持する。

### 変更前の再開始保持観測

`before-retained-web.json`と`before-retained-electron.json`は、同一rendererでnormal 70秒を3回完了し、R、Enter→Canvasで再開始した。両版とも静的load／GLB parse各1回、静的identity不変、動的identity 1→2→3、各dispose 1回、static-only baselineの不一致0、最終owner残留0、診断条件を確認した。

| runtime | GC後usedSize 1／2／3周（bytes） | 終了後（bytes） | 接続DOM node 1／2／3周 |
|---|---|---:|---|
| Web | 142128880／163342800／161657516 | 68920472 | 400／400／400 |
| Electron | 149416672／166282296／167117228 | 70756004 | 400／400／400 |

両版とも1→2周の増加があり、2→3周ではWebが減少、Electronは約0.8MB増加だった。接続DOM数は固定。CDPの全DOM／listenerはWeb 813／929／930、255／420／432、Electron 706／823／823、261／423／423だった。owner残留と接続DOM増加は認めないが、この1runだけで全保持リークの不存在を断定せず、afterの同条件推移と合わせて評価する。

比較器のoffline回帰は9分類76ケース通過。欠落report、壊れたJSON、GC不足、必須check欠落、source manifest不整合、計測file変更、UI／空間queryだけの変更、通常単回未達、5%境界を検証した。これは比較器の検証であり、ゲーム性能の合格数へ加算しない。
