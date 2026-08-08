# HAIGURE SURVIVAL v2 T06-2 学校開始・出現・増援統合 計画

更新日: 2026-08-08

## プロンプト

> 通常版と荒れ版の教室配置、PR #59につながる学校Runtime修正、次の機能タスクを一度`develop`で統合し、その後の安全な作業順を整理する。

追加指示:

> 現在プルリク66番かな、えっと、教室の荒れ状態を更新する、最新化するタスクを行っていて、それでもう一度デベロップに取り込もうとしています。この次に行うべき大きなプランのタスクについて何だったかを、この次だとかこの後やるものについて、一覧化をお願いします。また、ここまでに行った修正で、過去に立てたプランのうち、やらなければいけないことが増えたり減ったりしている場合は、それも最新化するようにしてください。

今回の開始指示:

> `019fdf4b-1680-7541-9d82-cd5c4e2258b6`の内容を確認しつつ、T06-2「学校開始・出現・増援統合」のプランを開始してください。
> 実装にかかわらないプラン系のファイルの差分だけであれば、これから作るT06-2用のブランチの中に最初にコミットしてしまって構いません。

実行指示:

> PLEASE IMPLEMENT THIS PLAN:
> 計画文書の初回ローカルコミットと、実資産を基にした視覚提案までを実施してください。資産・Runtime・仕様書・fixtureは変更せず、図、候補数、抽選方式、各Volume寸法を提示した時点でYES待ちとしてください。pushとPull Request作成は行わないでください。

## 目的

PR #65のB03-3D、PR #64のT06-1、PR #66のB03-3D追補は、`origin/develop=cdb8bae`までに統合済みである。開始フェーズでは最新`develop`から専用branch／worktreeを作り、計画8ファイルだけを初回コミットした後、現行学校資産を読み取り専用で可視化し、複数開始地点、選択地点に追従する敵出現禁止、NPC／BIT出現Volume、BIT時間増援の実装前提案を確定する。資産・Runtime・仕様書・fixtureはユーザー承認後の後続フェーズで変更する。

## 対象外

- 荒れ版配置の再設計。B03-3D承認済み成果を入力として使用する。
- B03-3DとT06-1の初回branch統合。PR #64までに`develop`上で完了済みである。
- T07の99 NPC／50 BIT定量性能最適化、最終仕様書監査、リリース準備。
- タイトル画面の荒れ状態スライダー。
- 外周BIT飛行帯・外周BIT経路・外周スポーンの追加。
- 開始フェーズ中のBlender正本、GLB、NavMesh、生成器、カタログhash、Runtime、仕様書、fixtureの変更。
- push、Pull Request作成、レビュー、merge、worktree整理。

## 依存と開始条件

- PR #65、PR #64、PR #66が`develop`へマージ済みであること。2026-08-08に`cdb8bae`で確認済みである。
- 最新`origin/develop`から専用branch／worktreeを作り、未マージbranchから派生しないこと。`codex/v2-t06-school-integration`を`cdb8bae`から作成済みである。
- 資産実装前に、全開始候補の俯瞰画像、抽選方式、各`VOL_PlayerSpawnExclusion_*`寸法、NPC／BIT出現Volume範囲を提示し、ユーザー承認を得ること。

## ファイル所有

- 単一担当: 学校生成正本・監査器、Blender正本、GLB、静的人間用NavMesh、Room Variant NavMesh、BIT用NavMesh、`src/world/stageCatalog.ts`のhash、開始・出現選択Runtime、通常ゲーム入口、T06-2 fixture、本計画。
- T06-2実行中は学校バイナリと生成器を他branchから同時編集しない。
- 全体計画の結果更新は統合段階で単一担当が行う。
- 開始フェーズの変更対象は`docs/branch_strategy.md`、`docs/plan.md`、v2のREADME・I1・T06-1・T06-2・T06・次タスク計画の8ファイルだけとする。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-t06-school-integration`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- 理由: Blender意味Object、3種NavMesh、開始・出現抽選、通常ゲーム進行、時間増援、入力・音声・水中、資源ライフサイクルを同じseedとE2Eで横断するため。
- 並行可否: 単独。T06-2の`develop`統合後はI2を開始する。

## 後続実装へ固定する契約

- `player_spawn` Markerと専用`player_spawn_exclusion` Volumeを`hs_player_spawn_id`で明示的に1対1対応させる。名前suffix推測、`no_enemy_spawn`流用、欠落時fallbackは作らない。
- 選択済み開始地点をPlayerとSurvivalへ同一入力として渡し、選択地点の除外Volumeだけを初期洗脳済みNPC、初期BIT、時間増援、Alert生成へ適用する。
- 同じsession seedから開始地点、NPC、BIT用の独立乱数列を派生し、候補追加が他の乱数系列を変えないようにする。
- NPCは明示的な複数`npc_spawn` Volumeから利用可能面積比例で抽選し、洗脳済みを先に、未洗脳を後に配置する。要求数、全NPC間最小距離、安全条件を満たせない場合は厳格エラーとする。
- BITは到達可能な全許可飛行帯の明示`bit_spawn` Volumeを利用可能面積比例で使用し、ビット用NavMesh投影、0.54m安全包絡、共通遷移グラフ到達性、禁止Volume外を必須とする。
- `bitCount`を`initialBitCount`へ破壊的に改名し、出現間隔と最大数も必須入力にする。通常は初期1機、10秒間隔、最大25機とし、旧名互換や既定fallbackは作らない。
- 通常BITとAlertを同じ最大数へ含め、カーペット僚機だけを除外する。増援timerはplaying中だけ進め、上限到達中は待機し、欠員時に1機だけ補充してcatch-up burstを発生させない。

## 検証設計

- T06-2専用fixtureをport 5182で追加し、DOM完了条件を`document.documentElement.dataset.validationStatus === "passed"`へ統一する。
- Marker／除外Volumeの欠落・重複・孤立、同seed再現、選択中Volumeだけの除外、面積比例境界値、NPC生成順、全飛行帯被覆、候補枯渇の厳格失敗を決定的に検証する。
- 通常`1 / 10秒 / 25`、stress`20 / 最大20`、performance`50 / 最大50`、Alertとの上限共有、カーペット僚機除外、停止phase、再開、再読込、dispose後callback 0件を検証する。
- 通常ゲームのWeb／Electronで、タイトル、Pointer Lock、開始地点、増援、F／E／C、Follower同期射撃、G／N／H、扉、エレベーター、水中、荒れ状態、世界境界、公開処刑、終了、タイトル復帰、再読込を横断する。
- 合格件数は過去値を固定せず、実装HEADで得た件数、全fixtureの`passed`、console warning/error 0件、破棄後資源残留0件を記録する。

## ステップ

### 開始フェーズ（今回）

- [x] PR #66を含む最新`develop`、PR #65／#64／#66の結果、資産・Runtime仕様を監査する
- [x] 最新`origin/develop=cdb8bae`から`codex/v2-t06-school-integration`と専用worktreeを作成し、旧dirty worktreeと未保存Blenderセッションを保全する
- [ ] 計画8ファイルだけを最新状態へ更新し、UTF-8 BOMなし、差分、絶対パスを検証して初回ローカルコミットを作成する
- [ ] 最低候補として1階玄関、体育館中央、舞台演説台裏、2～4階普通教室を含む開始候補一覧を作り、安全なトイレ・特別室・屋上プールサイド候補も評価する
- [ ] 全候補の俯瞰画像、抽選方式、対応する出現禁止Volume寸法、NPC／BIT出現Volume範囲を提示し、ユーザー承認を得る

### ユーザー承認後の実装フェーズ

- [ ] 承認済みの向き付き`MRK_PlayerSpawn_*`と、`player_spawn_exclusion` role／`hs_player_spawn_id`で明示参照する1対1の除外Volumeを資産化する
- [ ] 人間用NavMesh上の`npc_spawn`と、到達可能な各BIT飛行帯を面積で覆う`bit_spawn` Volumeを資産化する
- [ ] 同一seedで開始地点・向き・初期NPC／BITを再現し、選択中の除外Volumeだけを初期洗脳済みNPCとBITへ適用する
- [ ] 初期洗脳済みNPCを除外範囲外で先に、未洗脳NPCを残候補から生成し、必要数とNPC間最小距離を満たす。候補不足時は厳格エラーとする
- [ ] 通常BITを初期数・出現間隔・最大数の必須設定へ統一し、Alertを同じ最大数へ含め、カーペット僚機を除外する
- [ ] 停止中、タイトル、公開処刑中、破棄後は増援せず、再読込でseed、timer、個体数を初期化する
- [ ] B03-3D荒れ版、T06-1入力・UI・音声・水中、扉・エレベーター・Follower・光線・世界境界を、初回統合済み機能として通常ゲームで横断回帰する
- [ ] 資産監査、3種NavMesh二重生成、型検査、全build、T02～T06 fixture、通常Web、Electron、破棄・再読込を検証する
- [ ] Pull Request作成後、独立レビューとV3学校基盤機能ゲートで、タイトル開始から終了・タイトル復帰・再読込まで完全E2Eを確認する
- [ ] 実装・検証・commit・push・Pull Request作成までを本タスクとし、レビュー、merge、worktree整理を別タスクで行う

## 完了条件

### 開始フェーズ

- 最新`develop`由来の専用worktreeに、計画8ファイルだけの初回ローカルコミットが存在する。
- 旧dirty worktree、rootの未追跡cache、未保存Blenderセッションが変更されていない。
- 現在状態と提案状態を比較できる俯瞰図、候補表、抽選案、除外Volume寸法、NPC／BIT出現Volume範囲が提示されている。
- 資産・Runtime・仕様書・fixture・push・Pull Requestには未着手のまま、ユーザーのYESまたは修正指定を待つ。

### 実装フェーズ

- 承認済み開始候補・出現禁止・NPC／BIT出現Volumeが資産とRuntimeで一致する。
- 同一seedの開始・出現が再現可能で、選択開始地点周囲の敵出現が0件である。
- 通常BIT時間増援、最大数、停止・破棄条件が成立する。
- 既定荒れ状態2を含む全学校機能が通常ゲームで接続される。
- V3学校基盤機能ゲートのWeb・Electron完全E2Eと資源残留0件を満たす。

## 次タスク開始用プロンプト

> T06-2の開始候補、抽選方式、`player_spawn_exclusion` Volume寸法、`npc_spawn`／`bit_spawn` Volume範囲の視覚提案がユーザー承認済みであることを確認してください。`codex/v2-t06-school-integration`で承認内容を計画へ固定した後、学校資産を単一担当で更新し、複数開始地点、動的出現禁止、NPC／BIT出現、BIT時間増援を通常ゲームへ実装してください。PR #65／#64／#66で統合済みの荒れ版、入力・音声・水中、扉・エレベーター・Follower、光線、世界境界は新規統合扱いにせず横断回帰してください。実装・検証・ローカルcommitまでを対象とし、push、Pull Request作成、レビュー、merge、I2以降は別途明示されるまで行わないでください。GPT-5.6 Sol / Ultraを使用してください。

## 結果

2026-08-08、PR #65、PR #64、PR #66が`origin/develop=cdb8bae`までに統合済みであることを確認した。ローカル`develop`をfast-forwardし、同headから`codex/v2-t06-school-integration`と専用worktreeを作成した。旧計画worktreeの8件の文書差分とrootの未追跡Python cache、未保存Blenderセッションは変更せず保全している。現在は開始フェーズの計画8ファイルを初回コミットする前段階であり、資産・Runtime・仕様書・fixtureには未着手である。次は現資産による視覚提案を提示し、ユーザー承認を待つ。
