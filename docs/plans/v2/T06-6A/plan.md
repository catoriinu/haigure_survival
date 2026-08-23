# HAIGURE SURVIVAL v2 T06-6A タイトル基本設定・永続化 計画

更新日: 2026-08-23

## プロンプト

> V1相当の人数・音量・表示設定と、V2の人口、BIT、荒れ度、開始地点をタイトルから変更できるようにしてください。V1との保存互換は設けず、V2専用の保存領域を使用し、実行中は不変snapshotを使用してください。視点高さの既定値は1.20としてください。

2026-08-23 実装開始指示:

> PLEASE IMPLEMENT THIS PLAN:
>
> 未追跡ファイルを保持したままローカル`develop=154da02`をPR #78統合済みの`origin/develop=dbb7ecb`へfast-forwardし、専用branch/worktreeでT06-6Aを開始する。
>
> `V2TitleSettings`を唯一の設定契約へ統一し、V2専用キー`haigure-survival-v2.title-settings`、厳密なschema version 1、項目別正規化、未知field除去、canonical保存、全設定reset、deep-frozen開始snapshotを実装する。V1キーは参照・移行・変更・削除しない。
>
> 固定学校表示と、人口・BIT・音量・表示・洗脳・学校・Characterの独立したsemantic sectionをタイトルへ追加する。NPC数、初期洗脳人数、BIT人口、荒れvariant、正式開始地点、視点高さ、表示、Character、音量、洗脳挙動へsnapshotだけを接続する。`brainwashOnNoGunTouch` ON時は接触洗脳を有効化し、T06-4の全校放送による一括変更先をN、OFF時はGにする。
>
> 専用fixture、既存T06回帰、通常Web／Electron、UTF-8（BOMなし）、括弧対応、`git diff --check`、ローカル絶対パス、学校資産差分0件を確認し、個別計画の結果を更新してT06-6A差分だけをcommitする。push、Pull Request、レビュー、mergeは行わない。

2026-08-23 追加修正指示:

> タイトル設定を変更するたびにタイトル画面とRuntime全体を読み込み直さないでください。設定変更は保存とUI更新だけにし、ゲーム画面への反映はゲームを開始した瞬間にしてください。タイトル操作が消えて開始できない読込中は、V1と同様に中央へ`NOW LOADING`を表示してください。
>
> V1でスライダーだった初期洗脳済み人数、視点高さ、洗脳完了比率などはスライダーへ戻してください。洗脳完了比率の表示も`G／N／H比率`ではなく、V1と同じ`ポーズ／銃あり／銃なし`に戻し、ポーズを残余表示、銃あり／銃なしをスライダーにしてください。音量はV1相当の選択ボタンへ戻し、ゲーム全体の設定として左下隅へ配置してください。学校に依存する設定は独立させ、左上隅へ配置してください。
>
> `いきなり公開処刑モードに変更`は今回機能を実装しなくてもよいですが、レイアウト確認用に操作不能なボタンを最初から表示してください。

2026-08-23 追加修正指示（第2回）:

> ・「洗脳進行中を経ずに即洗脳」ONでも、プレイヤーもNPCも光線命中のhit-aとhit-bは必ず経ること。その後にprogressにならない、というのが「即洗脳」の意味。V1時の仕様を確認すること。
> ・「影を表示」ONでの影の楕円の向きが違和感。キャラクタースプライトに平行に、常に横長の楕円にすること。
> ・「影を表示」ONで、BITの影がない。BITの影を復活させること。
> ・ビットを正面から見たとき、先端の球から光が発射されていないように見える。光が最初に出現する位置を、先端の球を包む位置にすること。
> ・NPCを99人にするとゲーム自体（カメラの動きなど）は重くないのに、NPCの動きがカクカクする。許容できる水準まで軽減を検討すること。
> ・「銃なしに触れたら洗脳」は、光線命中エフェクトではなく、足元から徐々にhit-bからhit-aへ切り替わるV1演出に合わせること。有効化時は「再読み込みします」の確認を出し、OK後に必要な合成画像を生成すること。
> ・`NOW LOADING...`の点をV1同様にカウント表示し、素材数または進捗率も表示すること。停止していないことをプレイヤーに伝えること。
> ・右側の設定ウィンドウを縦一列にして幅を狭めること。
> ・左上ウィンドウの名前を「ステージ」にすること。
> ・「視点高さ」の既定値を1.15にすること。

2026-08-23 追加修正指示（第3回）:

> ・右設定の縦一列化自体はOKですが、もう少し枠を細くしてほしいです。あと、下の方にスペースが残っています。詰めてください。
> ・「銃なしに触れたら洗脳」ON時に、銃なしのプレイヤーが未洗脳のNPCに触れても、洗脳できない問題があります。
> ・V1では、組み合わせによると「全滅できない可能性があります」のような警告を出してくれていたはずです。その条件がV2でも残っていることを検証したうえで、全滅できない（洗脳する方法がなくて詰んでいる）パターンのときには画面上にV1同様の警告をだしてください。
> ・「BITを出現させない」ONのとき、増援間隔などがdisableになっているのはOKですが、disableのものは灰色にするなどして視覚的に分かりやすくしてください。増援間隔以外も同様です。
> ・BITの描画がガラスや光線を越えて一番手前に表示されないように、カーテン、光、BIT、窓を画面の奥から深度順に正しく重ねてください。影も同じ深度契約へ含め、再発防止テストを整備してください。
> ・赤BITの先端は黒ではなく赤にしてください。

2026-08-23 NPC 99人時の追加調査指示:

> NPCを99人にするとゲーム自体（カメラの動きなど）は重くないのに、NPCの動きがカクカクする問題について、描画位置の補間だけを対策としないでください。計算負荷や更新間引きを含む原因を計測・特定し、計算側の根本対策を行ってください。

2026-08-23 整列ハイグレ時の追加修正指示:

> ゲームオーバーで体育館に全員が整列してハイグレしているときに、プレイヤーが動くことができません。整列ハイグレ時はプレイヤーが動けるというV1の仕様を確認し、V2でも移動できるように修正してください。

2026-08-23 Pull Request #79レビュー対応指示:

> Pull Requestにインラインコメントを付けましたので対応してください。妥当であれば対応し、コミット、pushまで行ってください。

## 目的

I4で確定した基本設定を`V2TitleSettings`へ統一し、V1から独立した保存、正規化、全設定reset、タイトルUI、Runtime開始snapshotまで実装する。開始モード、即時公開処刑、Mission／Alarm、最終レイアウトは後続へ分離する。

## 開始条件

- [x] I4文書がPR #78で`develop=dbb7ecbe7864eaae2218e2cda97fd54d3d148ac2`へ統合済みである。
- [x] 未追跡の`docs/plans/skills/`と`scripts/v2/__pycache__/`を保持して`develop`をfast-forwardし、ahead／behind `0/0`を確認した。
- [x] `codex/v2-title-settings`の専用worktreeを最新`origin/develop`から作成した。

## 公開契約

- 保存rootはV2独立schemaの`version: 1`と、NPC人数0～99、初期洗脳済み率0～100、Player初期洗脳済み、BIT無効化、BIT増援間隔1～99秒、BIT最大数1～50、BGM／SE／VOICE各0～10、視点高さ0.50～1.50（既定1.15）、地面影、縦方向Character表示、即時洗脳、銃なし接触洗脳、NPC完了G／N／H比率、荒れ度0～10、開始地点選択、既存Character／VOICE選択を持つ。
- 初期洗脳済み人数は`floor(npcCount * percent / 100)`とする。BIT無効時は初期数・増援とも0、有効時の初期数は固定1。G／N／H比率は整数かつ合計100を必須とする。
- 開始地点は`random`または`src/v2/schoolSpawnSelection.ts`の承認済み11 IDだけを許可し、Runtimeへ正式IDを渡す。
- 保存キーはV2専用の`haigure-survival-v2.title-settings`とする。既存の`V2_TITLE_SETTINGS_STORAGE_KEY`もこの値へ置き換え、V1キー`haigure-survival.title-settings`は読込、移行、上書き、削除しない。V2キー内のversion不一致は全体既定値、version 1内の不正fieldは項目別正規化、未知fieldは削除し、canonical JSONを即時再保存する。
- RuntimeはlocalStorageを直接読まず、タイトル開始時にdeep freezeしたsnapshotを必須入力として受け取る。タイトル変更は実行中sessionへ反映しない。

## UI・所有範囲

- 固定学校表示、人口、BIT、音量、表示、洗脳、荒れ度、開始地点、Characterのsemantic groupを作る。stage selectorは作らない。
- groupはDOM上で独立sectionとし、labelの複数行、`min-width: 0`、可変列へ対応させる。絶対配置と最終breakpointはT06-6Cが所有する。
- 通常モードの全設定resetを実装する。即時公開処刑設定だけのresetはT06-6Bが追加する。
- `brainwashOnNoGunTouch`はT06-4のG／N一括変更契約へsnapshotから渡す。

## 対象外

- 開始モード、即時公開処刑、Mission／Alarm、ミニマップ、放送、早期自動公開処刑の設定。
- ゲームオーバー、R／Enter、最終responsive配置、静的学校資源再利用。
- V1保存値または旧V2試作値の互換読込・移行、暗黙fallback、学校資産・Location・NavMesh変更。

## 検証

- 境界値、視点高さ既定1.15、初期洗脳人数切り捨て、G／N／H合計、BIT無効化、承認済み11地点、version 1正規化、version不一致全reset、未知field削除をfixture化する。
- V1キーへsentinel値を保存した状態でV2の読込、変更、reset、再起動を行い、V1キーが一度も読まれず、値も変更・削除されないことをfixture化する。
- 変更ごとの保存、再起動、全設定reset、snapshot不変性、RuntimeのlocalStorage直接参照0件を確認する。
- 通常Web／ElectronでPointer Lockを奪わず全入力を操作でき、console warning・error 0件で開始できることを確認する。

## ステップ

- [x] `V2TitleSettings`、schema version 1、既定値、正規化、V2専用canonical保存を実装する
- [x] 基本設定のsemantic groupと固定学校表示を実装する
- [x] 設定を不変開始snapshotとしてRuntimeへ接続する
- [x] 全設定resetと保存・再起動fixtureを追加する
- [x] typecheck、build、Web／Electron、既存T06回帰を完了する
- [x] 結果を更新してT06-6A差分だけをcommitする
- [x] V1の操作部品、表示名、音量UI、読込表示と後続T06-6B／T06-6Dの所有境界を再確認する
- [x] 設定変更時のRuntime再構築を廃止し、開始時だけ最新snapshotを適用する
- [x] 読込中の中央`NOW LOADING`表示を統一する
- [x] 学校を左上、音量を左下へ分離し、V1準拠のスライダーと比率表示へ戻す
- [x] 操作不能な`いきなり公開処刑モードに変更`ボタンをレイアウト確認用に追加する
- [x] 追加fixture、typecheck、build、Web／Electron回帰を完了する
- [x] 追加修正結果を更新してT06-6A差分だけをcommitする
- [x] V1の即時洗脳、銃なし接触洗脳、読込進捗、影、BIT光線の実装を現行V2と照合する
- [x] 即時洗脳をhit-a／hit-b完了後にprogressだけ省略する状態遷移へ修正する
- [x] 銃なし接触洗脳のhit-b→hit-a下方合成、再生成確認、専用開始経路を復元する
- [x] キャラクター影の向き、BIT影、BIT光線の初期出現位置を修正する
- [x] 読込点滅と進捗、右側一列、ステージ表記、視点高さ既定1.15を実装する
- [x] NPC 99人時の移動更新を計測し、カクつきの原因に沿って軽減する
- [x] 専用fixture、回帰、通常Web／Electron、静的監査を完了する
- [x] 最新結果を記録し、今回の追加差分だけをcommitする
- [x] V1のゲームオーバー不能警告条件と、V2の接触・透明描画契約を照合する
- [x] 銃なしプレイヤーから未洗脳NPCへの接触洗脳を追加する
- [x] V1相当の終了不能警告をV2設定へ接続する
- [x] 右設定枠をさらに細く詰め、依存して無効な行を灰色表示する
- [x] BIT、影、光線、ガラスの深度順と赤BIT先端色を修正する
- [x] 99 NPC時の処理を項目別に計測し、論理移動が間欠化する原因を計算側で解消する
- [x] 専用fixture、描画回帰、通常Web／Electron、静的監査を完了する
- [x] 最新結果を記録し、今回の追加差分だけをcommitする
- [x] V1の`assemblyMove／assemblyHold／assemblyFree`とWASD解放条件を確認する
- [x] 整列開始後のWASD新規押下でPlayer操作を解放する
- [x] 入力、移動ルール、Runtime lifecycle、通常ゲームを回帰する
- [x] 最新結果を記録し、整列移動修正だけをcommitする
- [x] PR #79の最新headと未解決スレッド2件を取得し、各指摘の妥当性を確認する
- [x] 組込み`00_default` portraitをカタログ外でもcanonical設定として保存する
- [x] I4正本の後発指示と現行視点高さ1.15契約を同期する
- [x] 専用fixture、型検査、build、テキスト配布検査を実行する
- [x] レビュー対応結果を記録し、commit・push・元スレッド返信を行う

## 結果

PR #78統合済みの`develop=dbb7ecb`から専用branch／worktreeを作成した。V2専用キー、厳密なschema version 1、I4既定値、項目別正規化、未知field除去、canonical保存、deep freeze snapshot、正式な開始地点カタログを統一storeへ実装した。固定学校表示と人口／BIT／音量／表示／洗脳／学校／Characterのsemantic section、全設定resetを追加し、必須snapshotから人口、BIT、荒れ度、開始地点、視点高さ、Character、音量、地面影、即時・接触洗脳、G／N／H比率、全校放送のG／N変更先を供給するようにした。

専用fixtureは8／8、T06は69／69、T06-2は22／22、T06-4は37／37をPASSした。T05では追加した即時洗脳を含む機能項目がPASSし、総合性能fixtureの単発計測だけは再実行ごとに別項目で環境スパイクが出たため、T06-6A起因ではないことを切り分けた。`typecheck:v2`、T05／T06／T06-2／T06-4のtypecheck、専用・既存fixture build、通常buildをPASSした。通常Webでタイトル設定の変更、再読込、reset、開始を確認し、Electron受入ではPointer Lock、開始、タイトル復帰、再開始、BGM／SE／VOICE実読込、console／renderer／load異常0件を確認した。

追加修正では、タイトル設定変更時のsession再構築を撤去し、保存済み設定と表示中sessionのsnapshotが異なる場合だけ開始クリック時に新snapshotで再構築して自動開始するようにした。入力欄が操作不能になる初回読込、開始時再構築、Enter復帰時再構築は中央`NOW LOADING`へ統一した。学校設定を左上、V1相当の`−／値／＋／MUTE`音量設定を左下へ分離し、初期洗脳済み率、視点高さ、荒れ度、銃あり／銃なし比率をsliderへ戻した。比率表示は`ポーズ／銃あり／銃なし`とし、ポーズを残余、操作した比率の相手側を100以内へ調整する。`いきなり公開処刑モードに変更`はT06-6Bの機能を持たないdisabled buttonとして中央へ追加した。

追加専用fixtureは9／9をPASSした。通常Webでは設定変更中のsession seed維持、開始可能表示維持、開始クリック後だけのseed更新、`NOW LOADING`中の入力非表示、最新設定での自動開始を確認した。`typecheck:v2`、通常buildとWeb配布監査、T06／T06-2／T06-4 build、T06 Electron受入をPASSし、ElectronのPointer Lock、Enter復帰、再開始、BGM／SE／VOICE実読込、console／renderer／load異常0件を再確認した。

第2回追加修正では、即時洗脳でも光線命中の3秒hit-a／hit-b点滅と1秒fadeを必ず完了し、その後の`brainwash-in-progress`だけを省略するようにした。銃なし接触洗脳は光線命中effect／SEを使用せず、4秒かけて足元からhit-bをhit-aへ16段階で置換する17枚の合成frameを、有効設定での再読み込み時だけ生成する。OFFからONへの変更はV1相当の確認を必須にし、取消時は保存も再読み込みもしない。キャラクター影はsprite yawと同じ向きの横長楕円へ固定し、BITは機体形状と傾きに応じた地面影を復元した。光線先端球の中心を発射点へ置き、本体前端を球後端へ接続した。

読込表示は`NOW LOADING`の0～3点アニメーションと`完了数 / 全6工程`を表示し、右側設定を一列430px、左上見出しを`ステージ`、視点高さ既定を1.15へ変更した。第2回修正時点では、99 NPCの論理位置を変えず、描画位置だけを毎frame指数補間して不均一なAI／経路更新間隔による見た目の段差を軽減した。T06-6A専用fixtureは9／9、T06描画fixtureは69／69、通常Electron受入は全項目、99 NPC／50 BITの120秒高負荷Runtimeは1852 frame・renderer異常0件でPASSした。T05統合fixtureは機能321／321がPASSし、残る1件は今回の処理外である学校72遷移brute-force計測が50.0ms基準に対して50.1msとなった単発環境スパイクだった。`typecheck:v2`、T05／T06／T06-2／T06-4／T06-6Aのtypecheck、各対象build、通常build、Web配布監査、`git diff --check`、UTF-8 BOMなし、ローカル絶対path追加0件、保護学校資産差分0件を確認した。

第3回追加修正では、右設定枠を380pxへ狭め、画面下端まで伸ばす固定bottomを撤去して内容高に合わせた。BIT無効時は増援間隔・最大数の行と入力を灰色化する。V1の固定学校条件を照合し、Player初期洗脳済み、BIT、初期洗脳NPC数、銃あり比率、銃なし比率と接触設定の組み合わせからゲームオーバー不能リスクを判定し、詰む可能性がある場合だけV1と同じ警告文を右設定上部へ表示する。銃なしPlayerの足元から0.27m以内にいるalive未洗脳NPCを接触対象として既存のhit-b→hit-a下方合成遷移へ渡し、光線effect／SEを出さずに洗脳できる経路を追加した。

BIT本体・先端球・BIT影・Character影・窓・カーテンを同じ空間距離順の透明描画indexへ統一し、BIT materialは透明instance fadeを維持しながら深度を書き込むようにした。光線のcolor／depth proxyと組み合わせ、カメラ距離が入れ替わる窓・カーテン・BITの重なりをWebGL pixel fixtureで固定した。赤BITは状態色設定にかかわらず先端球を赤にした。

99 NPCの再調査では、カメラ描画自体ではなく、重いNavMesh経路再計算を1 frame最大4件へ制限した結果、同時追跡時に最大95体が`waiting-for-path`となり、論理位置まで停止することを原因として特定した。描画補間を根本対策とはせず、同一Navigation Areaかつ近距離追跡中の待機NPCは、NavMeshへ拘束した1 stepの直接移動と衝突segment検査を行い、重い経路計算の順番待ち中も論理移動を継続させた。T05最悪条件では99／99体が初回frameから移動し、直接待機移動1275回、重い経路再計算上限4件／frameを維持し、NPC更新最大1.3msとなった。

最新差分でT06-6A専用fixture 11／11、T05総合fixture 322／322、T06描画fixture 70／70を実ブラウザでPASSした。通常Electron受入はPointer Lock、Enter復帰、再開始、BGM／SE／VOICE実読込、console／renderer／load異常0件を確認した。99 NPC／50 BITの高負荷profileは120秒、1852 frame、99 NPC維持、洗脳済み98体、renderer異常0件で完走した。`typecheck:v2`、T05／T06／T06-6A build、通常buildとWeb配布監査をPASSした。変更17ファイルについて`git diff --check`、UTF-8 BOMなし、追加ローカル絶対path 0件、RuntimeのlocalStorage／URL直接参照追加0件、保護学校資産差分0件を確認した。

整列ハイグレ時の追加修正では、V1の`assemblyMove／assemblyHold`中にWASDを新規押下すると`assemblyFree`へ移る仕様と、整列開始前から押しっぱなしのキーでは解除せず全キーを離した後の次の押下だけで解除する条件を確認した。V2入力へ非repeatのWASD edge actionを追加し、`assembly`へ入った時点ではPlayerを停止したまま、整列後の新規WASD actionを受けたframeで操作を一度だけ解放して、通常のPlayer衝突移動へ渡すようにした。会場IDに分岐しないため、体育館と校庭の両方で同じ契約になる。

最新差分でT05総合fixture 322／322、T06 fixture 70／70を実ブラウザでPASSした。T05実Runtime遷移では`phase=assembly`、移動可否`false→true`、最初の解放受理、二重解放拒否、資源破棄一致を確認した。T05／T06／T06-6A build、通常buildとWeb配布監査をPASSした。通常Electron受入は初回だけランダムなPlayer洗脳前提が制限時間内に成立しなかったが、その実行でもconsole／renderer／load異常0件であり、再実行は13項目すべてと診断0件でPASSした。テキスト配布検査は変更9ファイルのUTF-8 BOMなし、`git diff --check`、ローカル絶対path追加なしを確認した。

PR #79のインライン指摘2件はいずれも妥当と判定した。統一storeのportrait正式値集合に組込み`00_default`を追加し、通常カタログに存在しない条件でもcanonical保存と再起動復元を保証するfixtureを追加した。I4正本は元の1.20依頼を履歴として保持したまま、T06-6Aの後発1.15指示、現行契約、既定値表、結果を1.15へ同期した。T06-6A専用fixtureは実ブラウザで12／12 PASS、console warning／error 0件、`typecheck:v2`、T06-6A build、通常Web／Electron build、Web配布監査、テキスト配布検査をPASSした。

修正・fixture・正本同期は`4fdf0e7`として`codex/v2-title-settings`へpushした。元の2スレッドへ妥当性判断、修正内容、検証結果、Electron実操作の再確認は未実施であることを返信した。依頼範囲外のスレッドresolve、Ready化、レビュー、mergeは実施していない。
