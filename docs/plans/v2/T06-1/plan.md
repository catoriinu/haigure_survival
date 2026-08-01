# HAIGURE SURVIVAL v2 T06-1 通常ゲームRuntime接続 計画

更新日: 2026-08-01

## プロンプト

> 荒れ版教室配置の相談と同時並行で、次の機能的な改善・作成へ進みたい。安全に並行できる機能タスクを過去のプランと現行実装から整理する。

### 2026-08-01 実装指示

> PLEASE IMPLEMENT THIS PLAN:
>
> # T06-1 通常ゲームRuntime接続 実装計画
>
> - 最新`origin/develop`の`520a073`から`codex/v2-t06-runtime-core`と専用worktreeを作成する。
> - 通常ゲームへF／E／C・G／N／H、候補UI、荒れ状態2、音声、水中速度、タイトル復帰を含むライフサイクルを接続する。
> - 学校バイナリ、生成器、NavMesh、カタログhash、`src/world/**`、全体計画は変更しない。
> - 実装・検証・commit・push・Draft PR作成まで行い、レビュー・merge・`develop`同期・worktree整理は行わない。
> - 毎frameで入力actionを一度だけdrainし、F／EをNPC指示、Cを扉開閉、G／N／Hを解放済みのプレイヤー状態選択へ配送する。
> - NPCと扉の先頭候補を画面座標へ投影してhighlightとpromptを表示し、gun状態だけ照準と左クリック案内を表示する。
> - 通常・性能・stress経路のRoom Variantをseed付き荒れ状態2へ統一し、T06 fixtureだけ0／10を注入できるようにする。
> - `water` Volume内だけ水平速度倍率0.5、それ以外は1.0を毎frame明示し、退出・再配置・タイトル復帰・再初期化で通常速度へ戻す。
> - BGM・正規化SEイベント・状態別VOICE、既存音量設定とMUTEを接続し、開始・タイトル復帰・disposeでAudio資源を正しく所有する。
> - Runtime sessionが入力、UI、Audio、Scene、Stage、Survival、動的Runtime、購読を所有し、Enterによるタイトル復帰、再開始、`beforeunload`、初期化失敗で同じ破棄順を使う。
> - `V2PlayerController.update`へ必須の水平速度倍率、`V2SurvivalRuntime`へ`V2GameplayAudioEvent`と`drainAudioEvents()`、`AudioManager`へ`dispose()`を追加し、旧互換や省略時fallbackは作らない。
> - T06専用fixture、T04／T05回帰、通常Web、Electron、UTF-8 BOMなし、括弧・構文、禁止所有差分0件を検証する。
> - T06-1差分だけをcommit・pushし、検証結果、対象外、T06-2への引き渡しを記載したDraft PRを作成する。

### 2026-08-01 通常Runtime回帰修正指示

> ローカルサーバーの通常ゲームで`favicon.ico`の404と、`RouteFollowingBitFlightAgent.advanceSurfaceStep()`から「帯内移動拘束結果が指定移動距離を超えました。」が発生し、`main.ts`のゲーム更新が停止した。faviconの404とゲーム停止原因を分離し、例外を抑止するfallbackではなく、帯内移動の距離契約または拘束位置の原因を特定して解決する。

### 2026-08-01 テスト中の音量指示

> 各種音量について、テスト中は0にしておく。VOICE／BGM／SEのデフォルトをすべて0とする。

### 2026-08-01 Follow・扉操作の追加修正指示

> NPCのFollowはAlarmなどの自律命令より優先し、Alarmで上書きされないようにする。未洗脳・洗脳後のどちらにも同じ規則を適用する。Follow速度は通常NPCより速く、プレイヤーの通常移動速度の約80%となる切りのよい値にする。Cキーの扉開閉は、通常学校で候補表示も開閉も発生しない現象を調査し、実装済み機能の不具合であれば修正する。

### 2026-08-01 Follow継続条件の追加修正指示

> 階段でNPCが視界内にいるように見えてもFollowが途切れることがあるため、現行の継続条件を調査する。視線から一時的に外れても、ある程度近くにいる間はFollowを維持できる余裕のある条件へ変更する。NPCとBITの直線視界距離も確認する。

### 2026-08-01 Follow視界距離の確定指示

> Follow中のプレイヤーを見つける直線視界は最大12mとする。12m以内で視線が通れば維持し、視線が通らなくても5m以内なら維持する。視線が通らず、かつ5mを超えた状態が連続5秒続いた場合に解除する。

### 2026-08-01 優先範囲の確定指示

> 現在修正中のFollow継続条件と扉修正を最優先で完了する。未洗脳NPC自身の視界探索と、複数脅威から逃走元を選ぶ設計は、この修正完了後の別タスクとして進める。

## 目的

既に実装済みの入力・状態・NPC指示・扉・学校動的Runtime APIを、学校バイナリへ触れず通常ゲーム入口へ接続する。F／E／C・G／N／H、候補表示、既定荒れ状態2、音声、水中速度50%、開始・破棄ライフサイクルを実プレイで成立させる。

## 対象外

- Blender正本、GLB、静的人間用NavMesh、Room Variant NavMesh、BIT用NavMesh、生成器、資産監査器、`src/world/stageCatalog.ts`の変更。通常Runtime回帰修正で原因となった`src/world/bitFlightNavigation.ts`だけは対象に含める。
- 複数`MRK_PlayerSpawn_*`、`VOL_PlayerSpawnExclusion_*`、追加`npc_spawn`／`bit_spawn` Volumeの資産化。
- 時間増援と開始地点に追従する出現禁止の最終統合。これらはT06-2が担当する。
- 荒れ版教室の見た目・配置変更、タイトル画面の荒れ状態スライダー、T07性能最適化。
- 未洗脳NPC自身が洗脳済みNPC／BITを能動的に発見する視界探索と、複数脅威から最寄りまたは最適な逃走元を選ぶ仕様変更。

## 依存と開始条件

- Wave 0Gの計画Pull Requestが`develop`へ統合済みであること。
- PR #59～#61を含む最新`origin/develop`から専用branch／worktreeを作ること。
- B03-3Dの完了は開始条件ではない。ただし同時実行時はファイル所有を厳守する。

## ファイル所有

- 主担当: `src/v2/main.ts`、通常ゲーム入口に必要な`src/v2/**`、操作表示・音声接続に必要な`src/ui/**`・`src/audio/**`、T06-1専用fixture・設定、本計画。
- 通常Runtime回帰修正では、BIT帯内経路cache契約の修正を`src/world/bitFlightNavigation.ts`とT05回帰へ限定する。それ以外の共有変更はT06-1内でRuntime API利用側へ寄せる。
- 編集禁止: 学校Blender正本、GLB、全NavMesh、学校生成器・監査器、`src/world/stageCatalog.ts`、`src/world/bitFlightNavigation.ts`以外の`src/world/**`、B03-3D計画、全体計画。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-t06-runtime-core`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- 理由: 通常ゲームのframe更新、Pointer Lock、UI、状態遷移、音声、水中、破棄・再読込を同じライフサイクルで接続し、既存APIの重複実装を避ける必要があるため。
- 並行可否: B03-3Dと並行可能。T06-2とT07は開始しない。

## ステップ

- [x] 最新`develop`とT04-3B、T05-2／T05-3の結果を読み、通常ゲーム入口で未接続のAPIと既存UI・音声経路を棚卸しする
- [x] 毎frameで`drainPressedActions()`を一度だけ消費し、F／Eを既存NPC候補と`requestNpcCommand()`、Cを既存扉候補と`requestDoorToggle()`へ配送する
- [x] G／N／Hを既存`selectPlayerCompletion()`へ接続し、解放前・`playing`終了後は無効、選択解放後は連続再選択可能とする
- [x] NPC／扉候補の中央優先highlightとF／E／C prompt、G／N／H案内、G状態だけの照準・左クリック案内を同期する
- [x] 通常ゲームの`roomDisorderLevel`を2へ接続し、同一seedの決定性、テスト注入0／10、全normal固定経路の廃止を検証する
- [x] G／Nの移動、Hの移動停止、G射撃、N接触妨害、状態別表示とVOICEを既存Runtimeへ接続する
- [x] `VOL_PoolWater`内だけ水平速度50%とし、退出・再配置・タイトル復帰・再読込で通常速度へ戻す
- [x] BGM・SE・VOICEと既存音量設定・ミュートをV2学校入口へ接続し、多重再生と購読残留を防ぐ
- [x] reset、blur、Pointer Lock解除、タイトル復帰、再読込、disposeでaction、UI、Audio、購読が残留しないことを検証する
- [x] 型検査、build、T04／T05回帰、T06-1 fixture、実ブラウザ、Electronで入力・UI・Pointer Lock・音声・水中・再読込を確認する
- [x] 結果を本計画へ記録し、実装・検証・commit・push・Pull Request作成まで行う。レビュー、merge、worktree整理は別タスクとする

### 通常Runtime回帰修正

- [x] `favicon.ico`の404とBIT更新停止を分離し、停止例外の発生箇所と呼出経路を特定する
- [x] `constrainMovement()`の距離guardとpolygon参照契約を確認し、正逆で座標列が同じでも中間`polygonRef`が異なる再現条件をT05 fixtureへ固定する
- [x] 現行の移動速度・NavMesh・安全包絡契約を維持して原因を修正し、例外抑止fallbackは追加しない
- [x] T05専用回帰、T06、通常Web・Electron、型検査・build・console状態を確認する
- [x] 修正結果を本計画へ記録し、対象差分だけをcommit対象として確定する。push・PR更新は別途指示があるまで行わない

### テスト用既定音量

- [x] 保存済み設定がない場合のVOICE／BGM／SE既定値をすべて0へ変更する
- [x] 保存済み音量、0～10の即時変更、MUTEの既存仕様を維持する
- [x] T06専用fixtureで既定値0と保存済み設定の保持を検証する

### Follow優先・継続条件・C扉操作の追加修正

- [x] Alarm、自律AI、Follow、視線喪失の現行優先順位と、通常プレイヤー・NPCの実効速度を調査する
- [x] C入力から扉候補、HUD、`requestDoorToggle()`までの接続と、通常学校で候補が0件になる座標契約違反を特定する
- [x] Follow速度を`0.5 world unit/s`へ変更し、Leave速度は従来値`0.3`から変更しない
- [x] Follow中は既存どおりAlarm・外部脅威より優先し、Follow開始前のAlarmとFollow中のAlarmが遅延適用されない契約を回帰テストへ固定する
- [x] Follow直線視界を最大12mとし、5m以内なら遮蔽中も現在位置へ追従する。視界不成立かつ5m超が連続5秒続いた場合だけ解除する
- [x] 5秒解除の直前は5Hzの通常視線slotを待たず最新LOSを再確認し、5秒直前に視界が戻ったNPCを誤解除しない境界条件を回帰テストへ固定する
- [x] 通常入口の扉候補originをカメラ眼位置からプレイヤー足元へ修正し、HUDは扉sweep中央へ投影する。学校資産と`src/world/**`は変更しない
- [x] T04／T05／T06 fixture、型検査、build、通常Web、ElectronでFollow・Alarm・階段相当遮蔽・C表示／開閉・console状態を検証する
- [x] 追加修正結果と検証証跡を本計画へ記録し、対象差分だけをローカルcommitする。push・Pull Request更新は別途指示があるまで行わない

## 完了条件

- 通常ゲームでF／E／C・G／N／Hと候補表示が既存Runtime APIを通して動作する。
- 通常ゲームの既定荒れ状態2、状態別挙動・案内・VOICE、水中速度50%が成立する。
- Pointer Lock、タイトル復帰、再読込後も入力・UI・Audio購読の重複が0件である。
- 学校バイナリ、生成器、全NavMesh、カタログhash、`src/world/bitFlightNavigation.ts`以外の`src/world/**`の差分が0件である。
- 型検査、build、fixture、実ブラウザ、Electronに合格する。

## 次タスク開始用プロンプト

> Wave 0Gが`develop`へマージ済みの最新`origin/develop`から、`codex/v2-t06-runtime-core`と専用worktreeを作成してT06-1を実装してください。通常ゲーム入口で既存の`drainPressedActions()`、`requestNpcCommand()`、`requestDoorToggle()`、`selectPlayerCompletion()`を接続し、F／E／C・G／N／H、候補highlight・prompt、既定荒れ状態2、状態別案内・VOICE、プール内水平速度50%、BGM・SE・VOICE、開始・破棄ライフサイクルを実プレイで成立させてください。学校Blender正本、GLB、全NavMesh、生成器、監査器、`src/world/stageCatalog.ts`、`src/world/**`は変更しないでください。複数開始地点、追加出現Volume、時間増援はT06-2へ残してください。実装・検証・commit・push・Pull Request作成までを対象とし、レビューとmergeは行わないでください。GPT-5.6 Sol / Ultraを使用してください。

## 結果

`origin/develop`の`520a073`から`codex/v2-t06-runtime-core`と専用worktreeを作成し、通常ゲーム入口を明示的なRuntime sessionへ整理した。sessionが入力、候補HUD、音声、Scene、Stage、Survival、動的Runtime、イベント購読を所有し、Enterによるタイトル復帰、再開始、`beforeunload`、初期化失敗を同じ破棄順へ接続した。Pointer Lock解除とblurでは入力actionをresetし、候補UIを即時消去する。

通常frameで`drainPressedActions()`を一度だけ実行し、安定ソート済みの先頭候補へF／E／Cを配送した。G／N／Hは`playing`かつ選択解放中だけ既存状態APIへ渡し、gun状態だけ照準、左クリック案内、実射撃を許可した。NPC／扉候補HUD、既定荒れ状態2とseed決定性、水Volume内0.5／外1.0の必須水平速度倍率を通常・性能・stress経路へ接続した。学校の初期NPC抽選がNavigation Area Portal内を選ぶ既存の確率的初期化失敗を確認したため、既存のspawn除外条件へPortal内判定を追加し、通常Webを3回再読込して初期化成功とHUD／音量panel各1件を確認した。

`V2GameplayAudioEvent`と一回drain queueを追加し、ビット標的化、光線発射、命中、警報を既存`SfxDirector`へ配送した。既存manifestとGit管理外のローカル配布音声を`import.meta.glob`で列挙し、player／NPCの状態遷移、brainwash loop、haigure enter／loop、idle VOICEを接続した。既存音量panelと保存設定を再利用し、VOICE／BGM／SEの0～10とMUTEを即時反映する。`AudioManager.dispose()`はBGM、全SE／VOICE slot、AudioContextを破棄し、音声バイナリ自体は差分へ含めていない。

検証結果は次のとおり。

- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。
- T06専用fixtureは23／23 PASS。action一回消費、候補先頭・候補なし・連打、状態guard、HUD消去、荒れ状態0／2／10、水中出入り、音量・MUTE、音声event一回配送、AudioManager破棄、session購読残留0件を確認し、warning／errorは0件だった。
- 実ブラウザはT04通常115／115、T04学校統合67／67、T05通常294／294、T05 NPC指示16／16、T06専用23／23がPASSし、各console warning／errorとBabylon Logger errorは0件だった。通常Webはタイトル開始、Enter復帰、再開始、3回再読込、HUD／音量panel各1件を確認した。in-app Browserの自動操作ではChromium側のPointer Lock要求が拒否されたため、Pointer Lockを伴う連続実入力はElectron受入へ分離した。
- Electron受入はCanvas開始とPointer Lock、`brainwash-in-progress`到達、G→N→H→G、gun照準・実射撃、N移動、H移動停止、Enter復帰、再開始をPASSした。復帰前後のHUD／音量panelは各1件、BGM 1件・SE 15件・VOICE 104件の読込成功、音声読込失敗、console warning／error、renderer例外、unhandled rejection、load error、render process消失、unresponsiveはすべて0件だった。候補位置と移動経路へ依存するF／E／C・waterの連続操作はT06専用fixtureで補完した。
- `git diff --check`、Electron harness構文、UTF-8 BOMなし、ローカル絶対パスなしを確認した。学校バイナリ、生成器、全NavMesh、カタログhash、`src/world/**`、全体計画の差分は0件だった。

複数開始地点、追加出現Volume、時間増援、タイトル画面の荒れ状態スライダーは計画どおりT06-2以降へ残す。レビュー、merge、`develop`同期、worktree整理は本タスクでは行わない。

実装・検証差分を`8a0575f`としてcommitし、`origin/codex/v2-t06-runtime-core`へpushした。Draft Pull Request #64を作成し、本計画、検証結果、対象外、T06-2への引き渡しを記録した。

### 2026-08-01 通常Runtime回帰修正結果

通常探索40秒以降に利用されるBITの総当たり経路は、複数transition endpoint間の恒久surface cacheを通る。旧実装は正逆を無方向のcanonical keyへまとめ、Recastのstraight pathを座標と`polygonRef`ごと単純反転していた。しかし`DT_STRAIGHTPATH_ALL_CROSSINGS`の境界点では中間`polygonRef`が進行方向に依存するため、逆向き経路が別polygonの参照を保持していた。これを次frameの`moveAlongSurface()`へ渡すと、要求移動量を超える面内補正が発生し、速度契約を守る既存guardが「帯内移動拘束結果が指定移動距離を超えました。」として停止していた。

`src/world/bitFlightNavigation.ts`のendpoint surface cacheを完全な有向keyへ変更し、prewarmでも正方向と逆方向をRecastへ個別に問い合わせるようにした。座標列の単純反転処理と無方向keyは削除した。Agentの速度、`waypointTolerance=0.03`、距離超過guard、NavMesh、安全包絡には変更を加えていない。学校バイナリ、全NavMesh、生成器、カタログhashも変更していない。ユーザー環境のSurvival乱数は`Math.random`を含むため同じ実経路の例外値は再捕捉できなかったが、4点経路の正逆座標一致と中間`polygonRef`不一致を方向別fixtureで決定的に再現し、旧cacheなら片方向探索欠落またはnative逆経路不一致となる条件を固定した。

通常入口には空のdata faviconを明示し、ゲーム停止と無関係だった`favicon.ico`の404も除去した。テスト中の音量指示に従い、保存設定がない場合のVOICE／BGM／SE既定値をすべて0へ変更した。保存済み設定、0～10の即時変更、MUTEは維持し、実ブラウザの今回のテスト設定も3カテゴリすべてMUTEへ保存して再読込後の保持を確認した。

回帰修正後の検証結果は次のとおり。

- T05実ブラウザは295／295 PASS。方向別cache項目は`points=4/4`、`directedRefs=true`、正逆`findPath=2/2`、native正逆との位置・`polygonRef`一致、再利用時の再探索なし、通常BIT速度0.25と赤BIT速度0.75の正逆Agent追従4件すべて`arrived`を確認した。console warning／errorは0件だった。
- T06実ブラウザは既定音量0の検証追加後24／24 PASS。保存済み3カテゴリ値と未知fieldの保持、0～10・MUTE、AudioManager破棄を含み、console warning／errorは0件だった。
- 修正後のElectron high stressは120秒設定を完走し、wall 123.85秒、simulation 92.85秒、1,861 frame、99 NPC／50初期BIT、`phase=playing`、Runtime errorなし、renderer diagnostics 0件だった。総当たり探索開始の40秒を越えて同例外は再発しなかった。
- 通常Webはタイトル初期化と再読込に成功し、VOICE／BGM／SEがすべてMUTE表示で保持された。console warning／errorと`favicon.ico`の404は0件だった。
- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。`git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、禁止所有ファイル差分なしを確認した。

本回帰修正はlocal commitまでを対象とし、`origin/codex/v2-t06-runtime-core`とDraft Pull Request #64は別途指示があるまで更新しない。

### 2026-08-01 Follow継続条件・C扉操作の追加修正結果

Follow速度を従来の`0.3 world unit/s`から`0.5 world unit/s`へ変更し、Leave速度は`0.3`として別定数へ分離した。未洗脳、gun、no-gun、haigureの全Followerへ同じ速度を適用する。Follow開始時に既存のAlarm・自律標的・保留要求を消去し、Follow中に到着したAlarmと外部脅威を無視する既存優先契約をテストへ固定した。

Followの直線視界上限を12m、遮蔽中も現在のプレイヤー位置を追跡する近距離を5m、視界不成立かつ5m超での解除猶予を連続5秒へ変更した。独立レビューで、5秒直前に視界が回復しても5Hz視線slotより先に解除され得る境界競合を検出したため、猶予満了直前かつ12m以内では最新LOSを必ず再確認するよう修正し、この時系列を回帰テストへ追加した。これにより、階段などで一時遮蔽されても5m以内なら無期限に維持し、5mを超えても視線が12m以内で再度通るか、5秒前に戻ればFollowを維持する。

C操作が通常学校で候補0件となっていた原因は、扉Runtimeが床面の扉rootまで1m以内を要求する一方、通常入口が高さ1.33mのカメラ眼位置を候補originへ渡していた座標契約不一致だった。候補originをプレイヤー足元へ変更し、HUDのC promptは床rootではなく扉sweep meshのworld中央へ投影した。眼位置では0件、同じ水平位置の足元では0.6m先の扉が先頭候補となる実StageDoorRuntimeテスト、C一回配送、扉中央HUD投影を追加した。学校資産と`src/world/**`は変更していない。

追加修正後の検証結果は次のとおり。

- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。
- T05全体fixtureは295／295 PASS、NPC指示fixtureは19／19 PASS。Follow速度0.5、Leave速度0.3、normal／gun／no-gun／haigure共通適用、Alarm優先、5m遮蔽追跡、12m LOS、5秒直前の再視認、12m超5秒解除を確認し、console warning／errorとBabylon Logger errorは0件だった。
- T06 fixtureは26／26 PASS。通常眼高では欠落する床原点扉を足元基準で取得し、F／E／C一回配送、扉sweep中央へのC prompt投影、候補消去を確認した。console warning／errorとBabylon Logger errorは0件だった。
- T04通常fixtureは115／115 PASS、実学校動的統合fixtureは67／67 PASSで、各console warning／errorは0件だった。
- 通常Webは最終コードで開始後30秒間`playing`を継続し、BIT帯内移動例外、更新停止、favicon 404は再発しなかった。in-app BrowserからのPointer Lock要求だけは制御面固有の`WrongDocumentError`となるため、実Pointer Lockを伴う連続操作はElectronで確認した。
- Electron受入は全12項目PASS。Canvas開始とPointer Lock、`brainwash-in-progress`、G→N→H→G、gun射撃、N移動、H移動停止、Enter復帰、再開始、HUD／音量root重複0、BGM 1件・SE 22件・VOICE 314件の読込を確認した。音声失敗、console、renderer、load、render process消失、unresponsiveはすべて0件だった。位置依存のF／E／CはT05／T06の実Runtime fixtureで補完した。
- `git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、学校バイナリ・生成器・全NavMesh・カタログhash・`src/world/**`差分0件を確認した。

未洗脳NPC自身による洗脳済みNPC／BITの能動的な視界探索と、複数脅威から逃走元を選ぶ仕様変更は、ユーザー指示どおりこの追加修正へ含めず、次の設計タスクへ残す。push、Pull Request更新、レビュー、merge、`develop`同期、worktree整理も行わない。
