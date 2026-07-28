# HAIGURE SURVIVAL v2 T04-3 動的空間・扉・エレベーター統合 計画

更新日: 2026-07-28

## プロンプト

普通教室・特別教室とトイレ個室の扉をプレイヤーとNPCが開閉できるようにし、静止中は人物衝突、ビーム遮蔽、視線遮蔽を有効にする。BITは閉じた扉を通れず、扉を操作できない。

1階・4階だけに停止するエレベーターを、プレイヤー、未洗脳NPC、洗脳済みNPCが単独でも利用できるようにする。扉の`closed / opening / closing`中は人物用全面ゲートで駆け込みを防ぎ、実扉パネルだけをビーム・視線遮蔽として扱う。定員は全キャラクター合計6人とし、降車を妨げずに7人目の乗車だけを拒否する。

20室の通常・荒れvariantを開始時に抽選し、プレイヤーと全NPCが倒れた机・棚の上を歩けるNavMeshを組み立てる。閉扉、エレベーター状態、選択variantを、人物移動、ビーム、視線、BIT経路へ動的に反映する。

2026-07-28、最新の`origin/develop`を取得し、`4edd8f08c948a7822cd6bd623e25dff142078f18`以降を基点として、専用ブランチ`codex/v2-t04-3-dynamic-runtime`と専用worktreeを作成してT04-3Aを実装する。B03-3Cが別worktreeで進行中のため、学校`.blend`、GLB、両NavMesh、学校生成スクリプト、カタログhash、B03-3C worktreeを変更しない。各実装ステップで本計画を更新し、型検査、T04 fixture、`build:t04`、実ブラウザ確認まで実施する。commitまでは行い、push、Pull Request作成、`develop`へのmergeは別途指示まで行わない。

2026-07-28 統合指示:

> 隣のタスクのT05-3を実装したタスクをまず読み込んでください。その内容が、もうコミットが完了しており、こちらのT04-3Aに統合をして良い状態であれば、こちらを統合headへ切り替えて、推奨手順でこの後、`develop`へのPull Requestを作るところまで行ってください。まだ駄目な状態であれば、次に何をすれば進められるのか提案してください。

2026-07-28 方針変更:

> Pull Requestは作らなくてよいです。このまま後でB03-3Cのbranchへローカルで取り込みます。Pull Requestを作成済みであればcloseしてください。

## 確定方針

### T04-3A 動的空間基盤

- `docs/spec_stage_runtime_v2.md` 4節を必読の型正本とし、`DynamicStageSpatialActiveSet`、`DynamicStageSpatialSnapshot`、`DynamicStageSpatialVariants`を同名で実装する。人物Collider、ground Collider、ビーム遮蔽物、視線遮蔽物、BIT障害物の5集合を1つのrevision付きsnapshotとして公開する。
- 初期variantをrevision 0とし、状態機械と全動的Transformを更新して次の5集合を`replaceActiveSet()`へ渡す。同メソッド内で次revision用の索引・cacheを構築し、集合・cache・revisionを持つsnapshot参照を最後に原子的に差し替える。遮蔽中のエレベーター扉パネルのTransform変更もrevision更新対象とする。
- 動的扉を含む各問い合わせは開始時の1 snapshotだけを使う。known-safe-center、ground、world三角形、空間索引、扉gate・BIT障害物依存の経路cacheはrevisionをkeyへ含めるか公開前に無効化し、静的配列へのfallbackを追加しない。
- `StageSpatialResources`は全作者ObjectとAssetContainerだけを所有し、現在有効な集合の正本にしない。`DynamicStageSpatialVariants`はsnapshot、動的索引、cache、購読を所有し、作者Mesh自体は所有しない。
- 通常の人間用扉は連続NavMesh上のgateとして扱い、閉扉時も人間用NavMesh自体を分断しない。NPCは必要な扉を開けて通る。
- エレベーターだけを`StageLinkKind: "elevator"`の明示遷移として扱い、`NavigationAgent.completeTransition(...)`で移動完了後の経路を再開する。
- 20室の通常・荒れ人間用NavMeshタイルを開始時に選択・結合し、プレイヤー、NPC、BIT、空間indexの生成前に確定する。
- 2の20乗の全体NavMeshを作らず、部屋variantごとの所有タイルを組み立てる。
- `docs/spec_stage_assets_v2.md` 7.9節のmarker／volume roleと許可`hs_*`を厳格登録し、`StageDoorAssetRegistry`と`StageElevatorAssetRegistry`を非学校fixtureで構築する。未知key、参照不正、孤立・多重所有を許可しない。

### 教室・トイレ扉状態機械

- 状態は`closed / opening / open / closing`、開閉時間は0.8秒とする。
- プレイヤーはCキーで約1m以内の候補を操作する。候補順は画面中央との角度、次に距離とする。
- 教室扉は独立した`door-initial`乱数系列で20%を閉状態から開始する。トイレ個室は必ず開状態から開始する。
- 静止中は現在の扉位置で人物衝突、ビーム遮蔽、視線遮蔽を有効にし、移動中だけ無効にする。
- 閉扉開始前に最終位置と掃引Volumeを確認し、人物がいれば閉扉を中止して再開する。自動再試行queueは持たない。
- 全陣営NPCは必要経路上の閉扉を必ず開ける。通過完了ごとに独立した`door-behavior`系列で30%の閉扉を試み、占有中ならその試行を破棄する。
- BITは扉を操作せず、閉扉を移動・ビーム・視線経路から除外する。

### エレベーター状態機械

- 初期状態は4階停止・扉開放とする。停止階は1階と4階だけとする。
- 最初の搭乗者から5秒待機、扉開閉1秒、階間移動6秒とする。追加搭乗者は待機時間をリセットしない。
- かごがいない階の乗場外側約1mの呼出マットへプレイヤー、未洗脳NPC、洗脳済みNPCのいずれかが入った時点で呼出を登録する。NPCはプレイヤー不在でも呼出でき、マット自体を立入禁止領域にしない。
- 呼出を登録したNPCはマット外の待機点へ移り、乗車予定のないNPCもマット外で待つ。プレイヤーがマットに残った場合は安全条件を満たすまで開閉を開始しない。
- 乗客を乗せた運行を、反対階の空車呼出より優先する。走行中の呼出は次の行先として保持し、途中停止しない。
- かご内の乗客IDと相対座標を保持し、走行中は毎フレーム搬送する。
- 到着後も乗客が残る場合は、新たな5秒待機後に反対階へ戻る。
- 開閉状態は`closed / opening / open / closing`、かご状態は`stopped / moving`を直交して管理する。

### 人物通行ゲート・定員

- 人物用全面通行ゲートは`closed / opening / closing`で両方向を遮断し、完全な`open`でのみ解除する。
- 開扉・閉扉のどちらも、開始前に乗場マット、敷居、扉パネル掃引Volumeの占有を確認し、人物がいれば現在状態のまま待つ。NPCは`opening / closing`中の扉へ駆け込まない。
- 閉扉は、降車完了後に有効な乗車予約を到達時刻・Actor ID順で処理し、予約中の人物が乗車完了または予約取消となった後にだけ開始判定へ進む。
- 同一更新では「呼出・降車・乗車予約更新→占有確認→人物ゲート有効化→扉パネル移動開始」の順に処理する。これにより予約者の通過を閉扉が先に遮らない。
- 閉扉開始時は占有確認後、人物ゲートを有効化してから扉パネルを動かす。ゲート有効化後の外側接触だけでは再開扉しない。
- 到着時の開扉も占有確認後に開始し、`opening`中は人物ゲートを維持する。完全開放後は降車を先に許可し、その後に予約済み乗車者を通す。
- ビームと視線は人物ゲートを無視し、現在位置の乗場扉・かご扉パネルだけで遮蔽する。
- 定員はプレイヤー、未洗脳NPC、洗脳済みNPCの合計6人とする。
- かご内人数と、進入許可から乗車完了または予約取消まで複数更新にまたがって保持する全有効乗車予約を合算し、6人になった時点で新規の乗車予約を拒否する。
- 同時要求は到達時刻、同一更新では安定Actor ID順で処理し、プレイヤー優先を設けない。
- 定員ゲートは論理的な一方向入場判定とし、降車方向を止める物理Colliderにはしない。
- 5人以下へ戻った場合は、扉が完全開放中なら次の乗車を許可する。
- Follow中NPCが定員で拒否された場合はFollowを解除する。
- 通常NPCが定員で拒否された場合は待機または階段へ再経路計画し、プレイヤーは次便を待つ。

### T04-3B 実学校・NPC統合

- T05-4で確定した`persistent`／`nearest-visible`の標的選択個性を実学校へ持ち込み、動的扉、エレベーター、部屋variantによる視認・距離・経路変化と同時に回帰する。
- 全キャラクターがプレイヤー不在でもエレベーターを単独利用できる。
- NPCは階段所要時間と、かご位置、待機、開閉、移動、定員を含むエレベーター予測時間を比較する。
- NPCごとにseed固定の忍耐度・危険許容度を持たせ、重要な状態変化時だけ再評価して経路振動を防ぐ。
- `evade`中は露出・視線危険も評価し、約3m以内のエレベーターを別階への逃走候補にできる。
- 未洗脳NPCは、乗場またはかご内の洗脳済みNPCを視認できる便を避け、階段、待機、`evade`へ再計画する。
- 洗脳済みNPCは、未洗脳NPCを視認した場合、定員と扉状態が許せば同じ便へ乗り、間に合わなければ次便または階段で階層追跡する。
- 閉扉で敵を視認できない場合は通常呼出を許可し、開扉後に視認した時点で未洗脳NPCの乗車中止・逃走を判断する。
- 同じかごに敵対陣営が存在しても、通常の視認・戦闘・逃走処理を停止しない。
- BITは呼出、乗車、エレベーターリンク利用を行わない。

### 荒れた教室選択

- `SchoolRuntimeSettings.roomDisorderLevel`は整数0～10、既定値2とする。
- 荒れる室数は`round(20 * roomDisorderLevel / 10)`とする。
- `disorder`系列によるseed付きshuffleで固定数を選び、セッション中は変更しない。
- `disorder`、`door-initial`、`door-behavior`、`follower-fire`、`core`を独立乱数系列として公開する。
- variant選択後に人間用NavMeshタイル、Collider、ビーム・視線・BIT障害物を組み立て、その後にスポーンと空間indexを生成する。

## 公開API・型

- `SchoolRuntimeSettings.roomDisorderLevel`
- `DynamicStageSpatialActiveSet`
- `DynamicStageSpatialSnapshot`
- `DynamicStageSpatialVariants`
- `StageSpatialQueries.revision`
- `DoorState`
- `ElevatorDoorState`
- `ElevatorCarState`
- `ElevatorPassengerReservation`
- `NavigationAgent.completeTransition(...)`
- `requestDoorToggle(...)`
- `getDoorInteractionCandidates(...)`
- エレベーター呼出、乗車予約、状態snapshot API

既存の静的APIとの互換wrapperや未定義時fallbackは追加せず、利用元を調査して新契約へ統一する。

## 実行単位と推奨設定

### T04-3A

- ブランチ: `codex/v2-t04-3-dynamic-runtime`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- Ultra判断: 推奨。動的Collider・遮蔽、タイルNavMesh、扉とエレベーターの状態機械、乗車予約を同時に扱う。
- 開始条件: T05-2Vが`develop`へ統合済みであること。
- 所有範囲: `src/world`、専用の動的状態機械、`validation/v2/T04/`と`vite.t04.config.mts`の動的空間・扉・エレベーター専用fixture。学校バイナリ、`validation/v2/T05/`、実学校NPC統合を変更しない。
- 並行可否: B03-3BまたはB03-3C、およびT05-3と並行できる。T05-2Vが先に完了してB03-3Bが継続している場合も、学校バイナリを編集しないため開始できる。

### T04-3B

- ブランチ: `codex/v2-t04-3-school-integration`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- Ultra判断: 推奨。実学校、NPC、扉、エレベーター、部屋variant、ビーム・視線・BITを横断する。
- 開始条件: B03-3C、B04、T04-3A、T05-3、T05-4が`develop`へ統合済みであること。
- 並行可否: 単独で実施する。

## ステップ

- [x] T04-3A: 最新`origin/develop`から専用branch／worktreeを作成し、依存関係を導入する
- [x] T04-3A: 動的Collider・遮蔽物active setとrevisionを実装する
- [x] T04-3A: 資産仕様7.9節の扉・エレベーターrole、許可`hs_*`、ID参照、Transform規約を厳格分類し、非学校fixtureで監査する
- [x] T04-3A: 教室・トイレ扉状態機械とT04専用の非学校fixtureを実装する
- [x] T04-3A: エレベーター状態機械、人物ゲート、定員、予約、搬送、`completeTransition()`を実装する
- [x] T04-3A: 部屋variant NavMeshタイルの選択・結合基盤を実装する
- [x] T04-3A: 開閉、定員、同時要求、呼出、動的遮蔽を自動回帰する
- [x] 統合: 完了済みT05-3の計画・worktree・commit・検証結果を監査し、T04-3Aを統合headへ切り替える
- [x] 統合: T05 fixtureの空間queryをdynamic variants契約へ移行する
- [x] 統合: T04／T05／通常Runtimeを再検証する
- [x] 統合: 統合branchをpushし、作成済みDraft Pull Request #54を最新指示に従ってcloseする
- [ ] 後続: B03-3Cのbranchへ本統合headをローカルで取り込む（別途指示で実施）
- [ ] T04-3B: B03-3C／B04の実学校metadataを読込み、20室variantを開始時に確定する
- [ ] T04-3B: T05-4の標的選択個性を保持したまま、全陣営NPCの扉・エレベーター利用と陣営別回避・追跡を統合する
- [ ] T04-3B: 実学校で人物移動、ビーム、視線、BIT、スポーン、ライフサイクルを回帰する

## 結果

T04-3A完了。2026-07-28、`origin/develop`の`4edd8f08c948a7822cd6bd623e25dff142078f18`から`codex/v2-t04-3-dynamic-runtime`と専用worktreeを作成し、`npm ci`を完了した。

revision 0の`DynamicStageSpatialActiveSet`／`DynamicStageSpatialSnapshot`／`DynamicStageSpatialVariants`、原子的な`replaceActiveSet()`、問い合わせ開始snapshotの固定、revisionごとのworld三角形・空間index・cache・Volume包含判定、`StageSpatialQueries.revision`、`StageSpatialContext`の所有・破棄順を実装した。Transformだけが変わる更新と、エレベーターかごとともに移動する占有Volumeもrevisionへ追従する。

資産仕様7.9節の扉・エレベーターrole、許可`hs_*`、親子関係、型、ID相互参照、Transform、孤立・多重所有を厳格検証するregistryを実装した。通常扉は0.8秒の4状態、1m以内の候補順、移動中だけの遮蔽解除、最終位置と掃引Volumeの占有中止、教室20%とトイレ開放の初期状態を実装した。エレベーターは初期4階開放、1階／4階運行、5秒待機、1秒扉、6秒搬送、走行中呼出保持、乗客便優先、人物ゲート、Actor搬送、到達時刻・Actor ID順の予約、定員6人、降車非阻害、予約取消と`NavigationAgent.completeTransition()`を実装した。

部屋variant基盤はRecast 0.43.1のversion付きtiled bundle、共通tileと部屋ごとの`normal`／`disordered`所有tile、`NavMesh.initTiled()`／`addTile()`組立、`SchoolRuntimeSettings.roomDisorderLevel`、独立`disorder`乱数系列を実装した。実tile fixtureで共通2 tile、各variant 2 tile、荒れ室数0／4／20、seed再現性、normal 3.200m／disordered 4.014mの代表経路、欠落・重複・parameters不一致の拒否を確認した。

T04-3A単独commit時点の最終検証は`audit:v2:dependencies`、`typecheck:v2`、`typecheck:t04`、`build:t04`、通常`build`がすべてPASSした。実ブラウザのT04 fixtureは初回、画面からの再実行、再読込のすべてで102／102 PASS、warning／error、Babylon Logger error、unhandled rejectionは0件だった。通常Web入口もクリック開始後に`フェーズ playing`へ到達した。T04-3A専用fixtureは32件を含み、動的snapshot、資産registry、扉・エレベーター、NavMeshタイルを自動回帰する。学校`.blend`、GLB、両NavMesh、学校生成スクリプト、カタログhash、B03-3C worktreeは変更していない。T05専用fixtureに残っていた旧`createStageSpatialQueries()`呼出の更新は、所有境界どおり後続のT05-3統合で扱った。

2026-07-28、隣接するT05-3タスクのCodex最終報告、個別計画、cleanなworktree、`a8fd588d73fe7204843aa05851b699e458b05a15`の単一commit、T05-3専用16／16、既存T05 253／253、Web・Electron、型検査・buildの完了証跡を照合した。T05-3をmerge commit`bcc6647`で本branchへ取り込み、本branchをT04-3A＋T05-3の統合headへ切り替えた。

T05 fixtureの旧2引数`createStageSpatialQueries()`全14呼出を、`DynamicStageSpatialActiveSet`と`StageSpatialQueryOptions`を分離して受けるT05専用fixture経由でdynamic variants契約へ統一した。旧combined-options、互換wrapper、fallbackは残していない。query、dynamic variantsの順に破棄する所有関係もfixtureへ集約し、`typecheck:t05`がPASSすることを確認した。

2026-07-28 08:36 +09:00時点の統合検証では、`audit:v2:dependencies`、`typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`build:t04`、`build:t05`、通常`build`、`git diff --check`がすべてPASSした。統合差分35テキストのUTF-8 strict decode、BOM、merge marker、ローカル絶対パス検査はいずれも0件で、学校`.blend`、GLB、両NavMesh、学校生成スクリプト、カタログhashの差分も0件だった。

実ブラウザではT04 fixtureが初回／画面再実行／再読込の各102／102、T05 fixtureが各253／253、T05-3専用fixtureが各16／16で、各fixtureのconsole warning／error、Babylon Logger error、unhandled rejectionは0件だった。T05再実行で顕在化した2件は、Babylon Observableの遅延remove完了前にbaselineを採る性能fixtureと、18秒移動後も初期BIT位置のtarget ringを再利用する視認fixtureに原因を限定し、baseline前の1 event-loop待機と現在BIT位置からのtarget ring再生成で安定化した。通常Webは初期読込時のwarning／error 0件と、開始後の`フェーズ playing`、NPC 50体、BIT 20体以上を確認した。自動操作APIからのPointer Lock要求だけはChromium／Computer Use環境側の制約で拒否されたため、productionコードは変更せずPull Requestの検証注記へ残す。

2026-07-28 08:43 +09:00、公開前実装head`bbf4aaa7e11c8b0b02e26d09434d67bac6d1c4b6`を`codex/v2-t04-3-dynamic-runtime`へpushし、`develop`向けDraft Pull Request [#54](https://github.com/catoriinu/haigure_survival/pull/54)を作成した。GitHubから`OPEN`、`MERGEABLE`、Draft、base=`develop`、head=`codex/v2-t04-3-dynamic-runtime`を読み戻した。`origin/develop`は検証基点`4edd8f08c948a7822cd6bd623e25dff142078f18`のままで、`develop`へのmergeは行っていない。

2026-07-28 08:45 +09:00、最新指示に従ってDraft Pull Request #54をcloseし、GitHubから`CLOSED`、`mergedAt=null`を読み戻した。`codex/v2-t04-3-dynamic-runtime`は後でB03-3Cのbranchへローカル統合できるよう残し、remote branchの削除、`develop`へのmerge、B03-3C worktreeの変更は行っていない。

同日のI0第2次人間受入で、体育館西ギャラリー階段Rampの固定グリッドtile境界におけるY=0.475mから0.500mへのDetour snapを3D移動距離へ算入し、水平要求距離0.00504mを超えたと誤判定する停止を修正した。速度予算はXZ水平距離だけを厳格判定し、NavMesh面YとpolygonRefはDetour結果を保持する。報告座標固定回帰は3D距離0.025291321m、水平距離0.003569148m、polygon `6326784`→`6327296`を確認し、別の真の水平超過は引き続き例外とした。最終T04実ブラウザは106/106、warning／error 0件である。
