# HAIGURE SURVIVAL v2 T05-3 同陣営NPC指示・同期射撃 計画

更新日: 2026-07-28

## プロンプト

プレイヤーと同じ陣営のNPCがカメラ内かつ約2m以内にいる場合、Fキーで「ついてこい」、Eキーで「離れろ」を指示できるようにする。未洗脳プレイヤーは未洗脳NPC、洗脳済みプレイヤーは洗脳済みNPCを指示する。同時に何人へ指示してもよい。

Follow中はNPCがプレイヤーを視認できる限り追従し、見失っても短時間は最後に確認した方向へ進む。Leaveはプレイヤーから離れる地点へ移動し、到達または5秒で通常状態へ戻る。

洗脳済みFollowerは、プレイヤーが実際にビームを発射した方向へ0.3～0.8秒遅れて射撃する。NPCは発射終了後1秒のクールダウンを持ち、銃なしNPCやハイグレ状態NPCにはFollow中だけ一時的な銃を持たせる。

2026-07-28 実装開始指示:

> PLEASE IMPLEMENT THIS PLAN:
>
> - 実装開始時に再度`git fetch --prune origin`を行い、最新`origin/develop`から`codex/v2-t05-3-npc-commands`と専用worktreeを直接作成する。元のdirtyな`develop`、B03-3C、T04-3Aのbranch／worktreeには触れず、既存branch／worktreeがあれば基点・dirty状態・所有者を確認する。新worktreeに`node_modules`がなければ`npm ci`を行う。
> - `Get-Date`後、指定文書をUTF-8で末尾まで再読し、本計画だけを各実装・検証ステップ完了ごとに更新する。`docs/plan.md`と`docs/plans/v2/next_tasks_plan.md`は変更しない。
> - `V2PlayerAction`は`npc-follow`、`npc-leave`、`door-toggle`、`select-gun`、`select-no-gun`、`select-haigure`の6リテラルとする。F／E／C／G／N／Hの非repeat `keydown`を発生順に一度だけ`drainPressedActions()`で返し、reset、blur、disposeで未消費actionも消去する。実ゲーム入力接続はT06へ残す。
> - `V2NpcCommandKind = "follow" | "leave"`、`V2NpcCommandMode = "none" | "follow" | "leave"`、`getNpcCommandCandidates()`、`requestNpcCommand()`を追加する。候補はNPC ID、照準位置、距離、照準角、現在の`commandMode`を含む。未知IDはエラー、既知だが要求時点で対象外なら`false`とし、別NPCへの暗黙fallbackを行わない。
> - NPC frame snapshotへ`commandMode`、一時gun、同期射撃phaseを公開する。T04-3B向けにFollowだけを解除する専用hookを用意する。プレイヤーの成立した通常gun射撃を`V2PlayerGunFireEvent`として正規化方向付きで保存し、beam側には実際の巻戻し・境界fade終了時のcompletion eventを追加する。
> - 候補抽出は、プレイヤー足元との3D距離2m以内、同陣営、NPC照準点がactive camera frustum内、プレイヤー眼位置からNPC照準点まで視線clearを必須とし、照準角、距離、NPC IDの順で安定sortする。未洗脳プレイヤーは`normal`／`evade`、洗脳完了プレイヤーはgun／no-gun／haigureだけを対象とし、hit、洗脳中、集合編隊中、処刑中を除外する。
> - `V2CharacterState`は増やさず、NPCごとの直交command状態を保持する。指示開始時は古い標的、捕縛、Alarm、自律経路を解除し、指示終了後に古い標的を復元せず既存AIへ新規評価させる。
> - Followは速度0.3、分離距離0.8m、停止1.0m・再開1.2mのヒステリシスとする。固定slotは作らず、0.8m未満のFollower間反発をプレイヤー追従より優先する。視線clearなら最後の位置と水平移動方向を更新し、遮蔽後は最後の位置と直近の非ゼロ移動方向1m先へ進む。連続2秒の視線喪失、Leave、陣営不一致、定員拒否hookで解除する。
> - Follow中は通常evade、gun自律射撃、no-gun捕縛を停止し、既存自律射撃cooldownも停止する。未洗脳プレイヤーへの有効被弾では未洗脳Follower全員、Follower本人への有効被弾では本人だけを解除し、洗脳済みプレイヤー／Followerへの非受理beam接触では解除しない。
> - LeaveはFollow予約を即時解除し、プレイヤーから遠ざかる方向を中心にNavMesh候補を決定的に生成する。投影後に`findPath(..., "npc")`が成功する候補から最も遠ざかる地点を選び、速度0.3で移動して到達または5秒で`none`へ戻す。到達可能地点がなければ状態を変えず`false`を返す。
> - haigureの`stateElapsedSeconds`はFollow／Leave中だけ進めず、解除後の次フレームから保存値の続きとして再開する。
> - gun／no-gun／haigureの表示セルを分離する。no-gun／haigure FollowerはFollow中だけgunセルとgun能力を有効にし、Leave、解除、phase変更、非表示化、dispose時に基底状態のセルと能力へ戻す。
> - 成立した通常`player-gun` eventごとに、idleな洗脳済みFollowerだけが方向snapshotを保存する。各NPC専用の`follower-fire`乱数状態で0.3～0.8秒を決め、既存NPC gun銃口から同じ方向へ1発発射する。予約、active beam、completion後1秒cooldown中の追加射撃は無視し、Follow解除時は未発射予約だけを破棄して発射済みbeamは通常完了させる。
> - `clearCommands()`をphase遷移、replay、NPC非表示化、disposeへ接続し、command、予約、方向snapshot、一時gun、購読・参照を残さない。
> - T05共有`main.ts`は変更せず、専用HTML／entry／fixtureを追加する。T05のtsconfigとVite設定を複数entry対応にし、既存fixtureとT05-3専用fixtureを別画面でbuild・実行する。
> - 候補、入力、対象状態、Follow、Leave、被弾、haigure残時間、無制限Follower、複数分離、同期射撃遅延、連打、一時gun復元、予約取消、beam完了起点cooldown、各ライフサイクルの残留0件を自動検証する。
> - `npm run typecheck:v2`、`typecheck:t05`、`build:t05`、`build`、`git diff --check`を実行する。T05-3専用画面、既存T05画面、通常Web、Electronを実動確認し、console／Babylon Logger／unhandled rejectionのwarning・errorを0件にする。UTF-8 BOM、競合marker、ローカルユーザーディレクトリ絶対パス、TypeScriptの括弧・構文整合も検査する。
> - B03-3C、T04-3A、学校資産、`src/world`の動的空間、T04検証、共有fixture index、全体計画は変更しない。実ゲームのaction消費、highlight、prompt、扉操作はT06／T04-3Bへ残す。
> - 対象差分だけをセルフレビューし、T04-3Bへ定員拒否hook、T06へ入力action・候補query・状態表示契約を記録する。結果更新後、T05-3差分だけを`T05-3 同陣営NPC指示と同期射撃を実装`でコミットし、push、PR、レビュー操作、mergeは行わない。

2026-07-28 統合指示:

> 隣のタスクのT05-3を実装したタスクをまず読み込んでください。その内容が、もうコミットが完了しており、こちらのT04-3Aに統合をして良い状態であれば、こちらを統合headへ切り替えて、推奨手順でこの後、`develop`へのPull Requestを作るところまで行ってください。まだ駄目な状態であれば、次に何をすれば進められるのか提案してください。

2026-07-28 方針変更:

> Pull Requestは作らなくてよいです。このまま後でB03-3Cのbranchへローカルで取り込みます。Pull Requestを作成済みであればcloseしてください。

## 確定方針

### 対象選択・入力

- FをFollow、EをLeave、Cを扉操作とする。
- 対象条件は同陣営、物理距離2m以内、カメラ・frustum内、視線が通ることとする。
- 複数候補は画面中央・照準との角度、次に距離で並べ、対象をhighlightと操作promptで示す。
- 1回のキー入力につき1人へ指示し、キーリピートを無視する。
- 同時Follower人数に上限を設けない。
- `V2PlayerAction`へF・E・Cと既存計画のG・N・Hを離散actionとして追加し、`drainPressedActions()`で消費する。実ゲーム入力接続はT06が担当する。

### 状態構成

- NPCの既存`V2CharacterState`を増やさず、直交する`commandMode: none | follow | leave`を追加する。
- 未洗脳プレイヤーは通常・`evade`中の未洗脳NPCを指示できる。
- 洗脳済みプレイヤーは洗脳完了したgun／no-gun NPCと一時的なhaigure NPCを指示できる。
- `brainwash-in-progress`、処刑中、集合編隊中は対象外とする。
- haigure NPCは指示中に残り状態時間を停止し、指示終了後に正確な残時間から再開する。

### Follow

- 最高速度は既存`evade/chase`相当の0.3とする。
- 固定隊形・固定slotは設けず、約0.8mの局所分離と約1.0～1.2mの停止距離だけを使う。
- Follow中は、遠距離の敵対者を発見しただけで行う通常の`evade`遷移と自律射撃を抑制する。ただし未洗脳NPCのエレベーター乗車安全と、同じかごで視認が成立した敵対陣営への通常の戦闘・逃走は抑制しない。
- 未洗脳Followerが乗場またはかご内の洗脳済みNPCを視認した場合は、Followを維持したままその便への接近・乗車を中止し、階段または安全な待機へ再経路計画する。定員拒否または連続2秒のプレイヤー視線喪失が成立した場合は通常どおりFollowを解除する。
- プレイヤーを見失った場合は、最後に確認した移動方向・位置へ追跡して再視認を試みる。
- 2秒以内に再視認すれば継続し、連続2秒見失った場合は解除する。
- Leave、陣営不一致、エレベーター定員拒否でも解除する。
- 未洗脳陣営では、プレイヤーへの実際の有効被弾で未洗脳Follower全員を解除し、Follower本人への有効被弾では本人だけを解除する。
- 洗脳済みプレイヤー・Followerへのビーム接触ではFollowを解除しない。

### Leave

- Followを即時解除し、NavMesh上のプレイヤーから離れる到達可能地点を選ぶ。
- 速度0.3で移動し、到達または5秒経過で終了して元のAI状態へ戻る。
- haigure状態の残り時間はLeave中も停止する。

### 洗脳済みFollower同期射撃

- Follow中はNPCの自律射撃を完全に停止し、同期射撃だけを許可する。
- プレイヤーの実際に成立したgun射撃方向をsnapshotとして保存する。
- 各Followerは独立した`follower-fire`系列で0.3～0.8秒の遅延を決め、自身の銃口から保存方向へ1回発射する。
- 予約中、発射中、発射終了後1秒のクールダウン中に発生したプレイヤー射撃は無視する。
- クールダウンはFollowerのビーム終了時から開始する。
- Follow解除時は未発射予約を取り消す。
- no-gunとhaigure NPCにはFollow中だけ一時的なgun表示・能力を与え、解除時に元の状態へ戻す。元からgunのNPCはgun状態を維持する。
- プレイヤー自身が射撃不可能な状態では同期射撃eventを生成しない。

## 公開API・型

- `V2NpcCommandKind = "follow" | "leave"`
- `V2NpcCommandMode = "none" | "follow" | "leave"`
- `getNpcCommandCandidates()`
- `requestNpcCommand()`
- `V2PlayerAction`
- `drainPressedActions()`
- プレイヤーgun射撃成立eventと保存方向

既存状態名の互換aliasや、対象不在時の別NPCへの暗黙fallbackは追加しない。

## 実行単位と推奨設定

- ブランチ: `codex/v2-t05-3-npc-commands`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- Ultra判断: 推奨。既存AI、洗脳状態、haigure時間、被弾、視線、局所分離、射撃予約が相互作用する。
- 開始条件: T05-2Vが`develop`へ統合済みであること。
- 所有範囲: `V2PlayerAction`、`drainPressedActions()`、NPC指示状態、候補選択、Follow・Leave、局所分離、同期射撃、`validation/v2/T05/`と`vite.t05.config.mts`のNPC指示・同期射撃専用fixture。
- 非所有範囲: `src/world`の動的空間、扉・エレベーター状態機械、`validation/v2/T04/`、学校バイナリ、共有fixture index。共有fixture indexの更新が必要な場合はT04-3Bの統合担当が行う。
- 対象外: 実学校の扉・エレベーター利用、入力購読、操作UI。これらはT04-3BとT06が担当する。
- 並行可否: B03-3BまたはB03-3C、およびT04-3Aと並行できる。T05-2Vが先に完了してB03-3Bが継続している場合も、学校バイナリを編集しないため開始できる。

## ステップ

- [x] `git fetch --prune origin`後の`origin/develop` `4edd8f08c948a7822cd6bd623e25dff142078f18`から専用branch／worktreeを作成し、元のdirtyな`develop`と並行worktreeを保全する
- [x] 2026-07-28の日付を取得し、指定文書をUTF-8で末尾まで再読して所有境界を確認し、新worktreeで`npm ci`を完了する
- [x] `V2PlayerAction`、`drainPressedActions()`、成立済みplayer-gun event、beam completion eventの公開契約を実装する
- [x] 候補抽出、画面中央優先、同陣営・距離・frustum・視線条件を実装する
- [x] `commandMode`とhaigure残時間停止・再開を実装する
- [x] Followの局所分離、停止距離、2秒視線猶予、解除条件を実装する
- [x] Leaveの離脱地点、到達・5秒終了、元AI復帰を実装する
- [x] 未洗脳陣営と洗脳済み陣営の被弾解除規則を実装する
- [x] 洗脳済みFollowerの0.3～0.8秒同期射撃、1秒クールダウン、一時gun、状態復元を実装する
- [x] 無制限Follower、複数Follower分離、射撃連打、haigure、被弾、視線喪失、実beam完了、全消去経路をT05-3専用fixtureで回帰する
- [x] T05-3専用fixture、既存T05、通常Web、Electronを実動確認し、指定typecheck・build・静的監査を完了する
- [x] 対象差分だけをセルフレビューし、Leaveの再計画待機中5秒解除を修正して専用fixtureへ回帰を追加する
- [x] T04-3Bへ定員拒否hook、T06へ入力action・候補query・状態表示契約を引き渡す
- [x] 統合: T04-3A側でT05-3の計画・worktree・commit・検証結果を再監査し、統合headへ取り込む
- [x] 統合: T05 fixtureの旧空間query呼出をdynamic variants契約へ移行する
- [x] 統合: T04／T05／通常Runtimeを回帰する
- [x] 統合: 統合branchをpushし、作成済みDraft Pull Request #54を最新指示に従ってcloseする
- [ ] 後続: B03-3Cのbranchへ本統合headをローカルで取り込む（別途指示で実施）

## 結果

2026-07-28、実装・検証を完了した。開始時の`git fetch --prune origin`後、PR #53統合済みの最新`origin/develop` `4edd8f08c948a7822cd6bd623e25dff142078f18`から`codex/v2-t05-3-npc-commands`と専用worktreeを直接作成した。元の`develop`にある`src/v2/survivalRuntime.ts`と`validation/v2/T05/performanceScenario.test.ts`の未コミット変更、B03-3C、T04-3Aを含む並行worktreeには触れていない。リポジトリ直下に`AGENTS.md`実体がないため、タスクへ添付された指示を正本として扱った。指定文書はUTF-8で末尾まで再読し、新worktreeで`npm ci`を完了した。

F／E／C／G／N／Hを6種の`V2PlayerAction`として追加し、非repeat入力を発生順に一度だけ返す`drainPressedActions()`とreset／blur／dispose時の消去を実装した。通常ゲーム側でのaction消費は接続していない。成立した通常gun射撃を正規化方向付き`V2PlayerGunFireEvent`として保持し、beamの巻戻し・境界fadeを含む実終了時刻を`V2BeamCompletionEvent`で通知するようにした。

NPC指示は既存`V2CharacterState`を増やさず、`commandMode`を直交状態として実装した。候補は同陣営、足元間3D距離2m以内、active camera frustum内、眼位置から照準点までの視線clearを必須とし、照準角、距離、NPC IDで安定sortする。未知IDはエラー、要求時点で対象外またはLeave到達地点なしは`false`とし、別NPCへの暗黙fallbackは追加していない。

Followは速度0.3、0.8m局所分離、1.0m停止／1.2m再開、最終視認位置と水平移動方向、連続2秒の視線喪失猶予を既存NavMesh移動へ統合した。Follow／Leave開始時に旧標的、捕縛、Alarm、自律経路を消去し、解除後は旧標的を復元せず次frameの既存AI評価へ戻す。Leaveは指示状態を変える前に投影・経路成立を確認し、最も遠ざかる到達可能地点へ速度0.3で移動して、到達または5秒で終了する。セルフレビューで再計画待機中の5秒解除判定がFollow側へ誤配置されていた点を検出・修正し、5 NPCの再計画予算外NPCが最終frameで実際に`waiting-for-path`となる回帰を追加した。

未洗脳プレイヤーへの受理済み被弾では未洗脳Follower全員、Follower本人への受理済み被弾では本人だけを解除し、洗脳済みプレイヤー／Followerへの非受理beam接触では解除しない。haigureの状態経過はFollow／Leave中だけ停止し、解除後に保存値の続きから再開する。gun／no-gun／haigureの基底表示セルを分離し、no-gun／haigureはFollow中だけ一時gun表示・能力を持ち、解除・状態変更・非表示化・全消去・dispose時に基底状態へ戻す。

洗脳済みFollowerはNPC別の`follower-fire`乱数系列で0.3～0.8秒の予約を作り、保存したプレイヤー射撃方向へ既存NPC gun起点から1発だけ発射する。予約中、active beam中、実beam終了後1秒のcooldown中は追加射撃を無視する。Follow解除時は未発射予約だけを取り消し、active beamは通常終了まで維持する。phase遷移、replay、非表示化、`clearCommands()`、disposeへcommand・予約・方向snapshot・一時gun・beam追跡の消去を接続した。

T05-3単独commit時点ではT05共有`main.ts`と共有fixture indexを変更せず、`npc-command.html`、専用entry、専用fixtureを追加してViteを複数entry化した。専用fixtureは強化後の実ブラウザ初回・画面ボタン再実行とも16/16 PASSで、Leaveの`waitingForPathCount=1`、候補抽出、Follow／Leave、被弾、haigure、12体Follower、局所分離、同期射撃、実beam完了、全消去経路を確認した。既存の学校Stage用Survival lifecycleへRuntime黒箱checkを追加し、active camera候補1件、公開APIのFollow、player gun予約、`assembly`への実phase遷移、active beam 0件、phase guard、dispose後の参照拒否とScene資源baseline復帰を確認した。既存T05 fixtureは253/253 PASS、通常Webは学校scene・NPC 50体・BIT 20体の起動、Electronはbuild済みアプリのscene表示と終了を確認した。ブラウザconsole、Babylon Logger、unhandled rejectionはwarning／error 0件だった。

`npm run typecheck:v2`、`npm run typecheck:t05`、`npm run build:t05`、`npm run build`はすべてPASSした。通常buildでは既存の大容量chunkに対するVite CLI advisoryだけが出力された。`git diff --check`、UTF-8 BOM、競合marker、ローカルユーザーディレクトリ絶対パス、TypeScriptの型・構文・括弧整合を確認し、対象外の`docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、`validation/v2/T04/`、`vite.t04.config.mts`、`src/world`、学校資産に差分がないことを確認した。

T04-3Bへの引き渡しは、エレベーター定員拒否時に`cancelNpcFollow(npcId)`を呼ぶ契約とし、実学校の扉・エレベーター統合は実装していない。T06への引き渡しは、`V2PlayerInput.drainPressedActions()`の`npc-follow`／`npc-leave`を消費し、`getNpcCommandCandidates()`の先頭候補を明示IDで`requestNpcCommand()`へ渡すこと、候補・`commandMode`・一時gun・同期射撃phaseを操作UIへ表示することとする。`door-toggle`の実配送、highlight、promptもT06／T04-3Bへ残した。

対象差分だけを`T05-3 同陣営NPC指示と同期射撃を実装`でコミットし、push、Pull Request作成、レビュー操作、`develop`へのmergeは行わない。

2026-07-28、T04-3A統合担当が本タスクのCodex最終報告、個別計画、cleanなworktree、単一commit、検証証跡を再監査し、T04-3A branchへcommit境界を保って取り込んだ。以後は同branchを統合headとする。

T04-3Aで必須化されたdynamic variants契約へ、T05 fixtureの旧2引数`createStageSpatialQueries()`全14呼出を移行した。新fixtureは`DynamicStageSpatialActiveSet`と`StageSpatialQueryOptions`だけを受け、query、dynamic variantsの順に破棄する。旧combined-options、互換wrapper、fallbackは追加しておらず、移行後の`typecheck:t05`はPASSした。

2026-07-28 08:36 +09:00時点の統合検証では、`audit:v2:dependencies`、`typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`build:t04`、`build:t05`、通常`build`、`git diff --check`がすべてPASSした。実ブラウザではT04 fixtureが初回／画面再実行／再読込の各102／102、T05 fixtureが各253／253、T05-3専用fixtureが各16／16で、各fixtureのconsole warning／error、Babylon Logger error、unhandled rejectionは0件だった。

T05再実行で顕在化した2件は、Babylon Observableの遅延remove完了前にbaselineを採る性能fixtureと、18秒移動後も初期BIT位置のtarget ringを再利用する視認fixtureに原因を限定し、baseline前の1 event-loop待機と現在BIT位置からのtarget ring再生成で安定化した。通常Webは初期読込時のwarning／error 0件と、開始後の`フェーズ playing`、NPC 50体、BIT 20体以上を確認した。自動操作APIからのPointer Lock要求だけはChromium／Computer Use環境側の制約で拒否されたため、productionコードは変更せずPull Requestの検証注記へ残す。学校資産とB03-3C worktreeには触れていない。

2026-07-28 08:43 +09:00、公開前実装head`bbf4aaa7e11c8b0b02e26d09434d67bac6d1c4b6`を`codex/v2-t04-3-dynamic-runtime`へpushし、`develop`向けDraft Pull Request [#54](https://github.com/catoriinu/haigure_survival/pull/54)を作成した。GitHubから`OPEN`、`MERGEABLE`、Draft、base=`develop`、head=`codex/v2-t04-3-dynamic-runtime`を読み戻した。`origin/develop`は検証基点`4edd8f08c948a7822cd6bd623e25dff142078f18`のままで、`develop`へのmergeは行っていない。

2026-07-28 08:45 +09:00、最新指示に従ってDraft Pull Request #54をcloseし、GitHubから`CLOSED`、`mergedAt=null`を読み戻した。`codex/v2-t04-3-dynamic-runtime`は後でB03-3Cのbranchへローカル統合できるよう残し、remote branchの削除、`develop`へのmerge、B03-3C worktreeの変更は行っていない。
