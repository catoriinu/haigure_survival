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

BIT出現範囲の確認指示:

> ビットの出現箇所を11箇所へ限定するのではなく、バージョン1と同様に、基本的にはビットが移動可能な箇所ならどこでも出現可能にしてください。また、一定時間ごとに最大数まで、ステージ中のどこかへ出現し続けるロジックにしてください。現状のV2の仕組みで問題がある場合は、別の方法を検討する前に可能・不可能を確認してください。

開始候補の修正指示:

> 1階・体育館の舞台裏 → 1階・体育館の舞台上にしてください。
> 普通教室系は初期向きを黒板向きにしてください。それ以外はOKです。
> 2階・トイレは出入り口の向きにしてください。
> 2階・理科室は生徒会室にしてください。
> 屋上・プールサイド東側は、プール内、西側の階段そば、西向きにしてください。

開始候補の承認指示:

> 11件すべて追加でよいです。

向きと実装受入の確認指示:

> 指示した向きに図ではなっていませんが、実際にゲームを作成したら指示どおりの向きになることを信じるので、このままでOKです。

実装開始指示:

> 次の作業は何ですか？ 次に進んでください。

通常ゲーム確認と追加是正指示:

> 最新のサーバーを立て、通常ゲームをローカルホストで確認できるようにしてください。教室の荒れ状態と扉の既定動作、`roomVariantReview=all-disordered`をなくした後の確認方法も説明してください。
>
> ゲーム開始後、効果音と画像assetが読み込めていないため修正してください。
>
> 5回開始しても体育館舞台上だけなので、Player開始地点がランダムか確認してください。BITの初期数、出現間隔、出現可能範囲も説明し、V1の「黒い球体が空中へfade-inした後、そこから円錐形BITが生える」出現演出へ修正してください。

音声優先とNPC開始配置の追加指示:

> 効果音やBGMを流すための検証と修正を先に完了させ、その後に追加した問題へ取り組んでください。NPCの開始位置と開始statusも固定され、Character IDだけがランダムに見えるため確認してください。NPC位置はランダムにし、将来はPlayer開始地点ごとに、同じ教室などPlayerの近くへNPCが出やすくなる調整を追加できる設計を見越してください。

NPC近傍優先の実装承認:

> Player開始地点IDへ明示対応する専用`npc_spawn_bias` Volumeと正の`hs_weight`を追加し、全`npc_spawn`許可面の出現可能性を残したまま、同じ教室や近傍へNPCが出やすくなる推奨案を実装してよいかという確認への回答: YES

Pull Request作成指示:

> このタスクでやるべき残り作業は残っていますか?もしなければ、プッシュして、ディベロップへのプルリクを作ってください。

プール開始時の移動不能確認指示:

> プールからゲームが開始するとき、その場からWASDを押しても一歩も動きません。問題を確認してください。

プール開始時の移動不能修正承認:

> YES

## 目的

PR #65のB03-3D、PR #64のT06-1、PR #66のB03-3D追補は、`origin/develop=cdb8bae`までに統合済みである。開始フェーズでは最新`develop`から専用branch／worktreeを作り、計画8ファイルだけを初回コミットした後、現行学校資産を読み取り専用で可視化し、複数開始地点、選択地点に追従する敵出現禁止、NPC／BIT出現Volume、BIT時間増援の実装前提案を確定した。2026-08-08に修正版11候補すべてのユーザー承認と実装開始指示を得たため、同じ専用worktreeで実装フェーズへ移行する。

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
- 資産実装前に、全開始候補の俯瞰画像、抽選方式、各`VOL_PlayerSpawnExclusion_*`寸法、NPC／BIT出現Volume範囲を提示し、ユーザー承認を得ること。2026-08-08に修正版11候補すべての承認を取得済みである。

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
- 通常ゲームはsession生成ごとに暗号学的entropyから新しい32-bit seedを1件採番する。performance／school stress／ramp検証は明示seedを固定し、同一seedで開始地点、NPC位置・status、Character割当、BIT、荒れ状態、扉状態を再現する。
- 同じsession seedから開始地点、Character割当、NPC、BIT用の独立乱数列を派生し、候補追加や各系列の消費が他の乱数系列を変えないようにする。
- NPCは明示的な複数`npc_spawn` Volumeから利用可能面積比例で抽選し、洗脳済みを先に、未洗脳を後に配置する。要求数、全NPC間最小距離、安全条件を満たせない場合は厳格エラーとする。
- 通常ゲームでの初期NPC数50人と初期洗脳済み10人は人数契約として固定するが、位置、洗脳済み内訳、初期向き、Character割当はsession seedごとに再抽選する。
- Player開始地点に応じたNPC近傍優先は、現行の全`npc_spawn`実面積一様抽選を重み`1.0`の基礎チャンネルとして残し、専用role `npc_spawn_bias` Volumeを`hs_player_spawn_id`と`0.000001`以上`1,000,000`以下の有限な`hs_weight`で明示対応させて今回実装する。初期11件は各1 Volume・`hs_weight=0.5`とし、各NPCは全校チャンネル`2/3`、選択開始地点の近傍チャンネル`1/3`で選んだ後、チャンネル内の実NavMesh交差面積比例で抽選する。重み0による出現禁止は認めず、既存`player_spawn_exclusion`は安全除外専用として流用しない。これにより全許可面での出現可能性を保ったまま、同じ教室や近傍だけを高確率化する。
- BITは到達可能な全許可飛行帯の明示`bit_spawn` Volumeを利用可能面積比例で使用し、ビット用NavMesh投影、0.54m安全包絡、共通遷移グラフ到達性、禁止Volume外を必須とする。
- `bitCount`を`initialBitCount`へ破壊的に改名し、出現間隔と最大数も必須入力にする。通常は初期1機、10秒間隔、最大25機とし、旧名互換や既定fallbackは作らない。
- 通常BITとAlertを同じ最大数へ含め、カーペット僚機だけを除外する。増援timerはplaying中だけ進め、上限到達中は待機し、欠員時に1機だけ補充してcatch-up burstを発生させない。

## 検証設計

- T06-2専用fixtureをport 5182で追加し、DOM完了条件を`document.documentElement.dataset.validationStatus === "passed"`へ統一する。
- Marker／除外Volumeの欠落・重複・孤立、同seed再現、選択中Volumeだけの除外、面積比例境界値、NPC生成順、全飛行帯被覆、候補枯渇の厳格失敗を決定的に検証する。
- 通常`1 / 10秒 / 25`、stress`20 / 最大20`、performance`50 / 最大50`、Alertとの上限共有、カーペット僚機除外、停止phase、再開、再読込、dispose後callback 0件を検証する。
- 通常ゲームのWeb／Electronで、タイトル、Pointer Lock、開始地点、増援、F／E／C、Follower同期射撃、G／N／H、扉、エレベーター、水中、荒れ状態、世界境界、公開処刑、終了、タイトル復帰、再読込を横断する。
- 合格件数は過去値を固定せず、実装HEADで得た件数、全fixtureの`passed`、console warning/error 0件、破棄後資源残留0件を記録する。

## 開始フェーズ視覚提案（2026-08-08・11候補承認済み）

- 現行資産は`player_spawn` Marker 1件、同じ中庭bbox `(6, 4, -0.4)..(30, 28, 2.5)`を使う`npc_spawn`／`bit_spawn` Volume各1件で、開始地点専用の除外Volumeは存在しない。
- 通常室と全室荒れ状態の実Recast NavMeshで修正版11候補を照合し、水平投影誤差最大`0.000001706m`、bakeによる垂直差`+0.04..+0.05m`で全件投影できた。
- Markerのauthor前方は`(sin(rotZ), -cos(rotZ))`であり、`0°=-Y`、`90°=+X`とする。Babylon.js 6.49のNullEngineで現行GLBを読み、既存`MRK_PlayerSpawn_Main`のworld matrixへRuntimeと同じ`TransformNormal(Vector3.Forward(false), markerWorld)`を適用して照合済みである。この契約から普通教室の黒板向きを`-141.52°`、トイレの出入口向きを`14.04°`、プールの西向きを`-90°`とした。
- 緑を基礎案6候補、黄を追加採用5候補、橙枠を対応する`player_spawn_exclusion`案として、F1～F4・屋上の俯瞰図と対話型比較図をrepo外のスレッド可視化領域へ再生成した。11件はすべて承認済みである。正本はbackground Blenderで読み取り、保存していない。

| Code | 開始候補 | author位置 | 向き | 除外Volume寸法 |
| --- | --- | --- | ---: | ---: |
| C1 | F1正面玄関 | `(-1.5, 0, 0)` | `90°` | `5×5×3.2m` |
| C2 | 体育館中央・舞台向き | `(46.4, 9.5, 0)` | `0°` | `10×10×6.4m` |
| C3 | F1体育館・舞台上・客席向き | `(46.4, -6.5, 1)` | `180°` | `8×5×6.4m` |
| C4 | F2普通教室・黒板向き | `(-4.6, 18, 3.6)` | `-141.52°` | `6×6×3.2m` |
| C5 | F3普通教室・黒板向き | `(-4.6, 18, 7.2)` | `-141.52°` | `6×6×3.2m` |
| C6 | F4普通教室・黒板向き | `(-4.6, 18, 10.8)` | `-141.52°` | `6×6×3.2m` |
| O1 | F2トイレ洗面側・出入口向き | `(-0.8, 40.5, 3.6)` | `14.04°` | `4×4×3.2m` |
| O2 | F2生徒会室南側・会議机向き | `(9.9, 38.5, 3.6)` | `180°` | `7×4×3.2m` |
| O3 | F3美術室南側・室内向き | `(14.3, 37.4, 7.2)` | `180°` | `8×5×3.2m` |
| O4 | F4音楽室南側・室内向き | `(31.3, 37.4, 10.8)` | `180°` | `8×5×3.2m` |
| O5 | 屋上プール内・西側階段そば・西向き | `(17.5, 39, 14.66)` | `-90°` | `7×5×4.6m` |

- 体育館は吹抜けのため、C2／C3は`gym-low`実面`z=1.41m`と`gym-upper`実面`z=5.01m`の両方へBIT安全包絡`±0.54m`を加えた範囲を覆う高さ`6.4m`とする。C2 bboxは`z=-0.4..6.0m`、C3 bboxは`z=0.6..7.0m`である。
- O2は生徒会室境界`x=5.55..14.25m`、`y=36.65..45.35m`内の南側とし、通常／荒れ家具まで`1.8m`、南壁まで`1.85m`を確保する。対応Volume bboxは`(6.4, 36.5, 3.2)..(13.4, 40.5, 6.4)`である。
- O5は`VOL_PoolWater`内の西側階段東端から中心を`1.0m`離し、Player外周から階段まで`0.6m`を確保する。対応Volume bboxは`(14.0, 36.5, 14.1)..(21.0, 41.5, 18.7)`で、`roof-flight`のBIT安全包絡`z=14.86..18.54m`を覆う。開始時の足元は水Volume内にあり、初回更新から水中速度50%を適用する。
- NPCは次の5個の非重複階層Volumeを提案し、現行room variantの人間用NavMeshとの実交差面積を抽選重みに使う。

| ID | author範囲 |
| --- | --- |
| `npc-spawn-f01-stage` | `(-18.4, -14.2, -0.4)..(63.2, 51.0, 3.4)` |
| `npc-spawn-f02-stage` | `(-12.2, -8.7, 3.4)..(59.0, 45.1, 7.0)` |
| `npc-spawn-f03-stage` | `(-12.2, -11.2, 7.0)..(59.2, 45.1, 10.6)` |
| `npc-spawn-f04-stage` | `(-12.2, -8.8, 10.6)..(47.0, 45.1, 14.2)` |
| `npc-spawn-roof-stage` | `(-12.5, -6.9, 14.2)..(47.3, 45.4, 18.6)` |

- BITは次の11飛行帯を個別の連続Volumeで覆い、Volume個数やAABB面積ではなく実baked polygon面積を抽選重みに使う。この11件はPlayer開始候補11地点とは別物であり、BITを11個の離散地点へ限定しない。到達可能な許可飛行NavMesh全域のどこからでも出現可能にするための被覆単位である。

| Band | author範囲 |
| --- | --- |
| `outdoor-f1` | `(-18.1, -14.1, -0.4)..(62.9, 50.9, 3.2)` |
| `interior-f1` | `(-12.2, -3.1, -0.4)..(56.9, 45.0, 3.2)` |
| `gym-low` | `(33.9, -10.9, -0.4)..(58.8, 26.0, 3.2)` |
| `outdoor-f2` | `(-18.1, -14.1, 3.2)..(62.9, 50.9, 6.8)` |
| `interior-f2` | `(-12.2, -6.5, 3.2)..(46.9, 45.1, 6.8)` |
| `gym-upper` | `(34.0, -11.0, 3.2)..(58.9, 26.1, 6.8)` |
| `outdoor-f3` | `(-18.1, -14.1, 6.8)..(62.9, 50.9, 10.4)` |
| `interior-f3` | `(-12.2, -6.5, 6.8)..(46.9, 45.1, 10.4)` |
| `outdoor-f4` | `(-18.1, -14.1, 10.4)..(62.9, 50.9, 14.0)` |
| `interior-f4` | `(-12.2, -6.5, 10.4)..(46.9, 45.1, 14.0)` |
| `roof-flight` | `(-12.2, -6.4, 14.0)..(46.9, 45.0, 18.6)` |

- 推奨案は、承認済み11候補IDの固定順と、session seedからラベル付きで分岐した開始地点専用乱数列による一様抽選とする。地点確率が明快でfixtureを固定しやすい一方、カテゴリ内候補数の差がカテゴリ確率へ反映される。
- 代替案はカテゴリ重み付き抽選後にカテゴリ内を一様抽選する方式とする。カテゴリ比率を調整できる一方、重み設定、境界値、決定性fixtureが増える。

## ステップ

### 開始フェーズ（今回）

- [x] PR #66を含む最新`develop`、PR #65／#64／#66の結果、資産・Runtime仕様を監査する
- [x] 最新`origin/develop=cdb8bae`から`codex/v2-t06-school-integration`と専用worktreeを作成し、旧dirty worktreeと未保存Blenderセッションを保全する
- [x] 計画8ファイルだけを最新状態へ更新し、UTF-8 BOMなし、差分、絶対パスを検証して初回ローカルコミット`13ab1f7`を作成する
- [x] 基礎案として1階玄関、体育館中央、体育館舞台上、2～4階普通教室を含む開始候補一覧を作り、トイレ、生徒会室、美術室、音楽室、屋上プール内候補も評価する
- [x] 全候補の俯瞰画像、抽選方式、対応する出現禁止Volume寸法、NPC／BIT出現Volume範囲を提示し、修正指定を反映して11候補すべてのユーザー承認を得る

### ユーザー承認後の実装フェーズ

- [x] 修正版11候補の採用、実ゲームで指定向きを満たす受入条件、T06-2実装開始指示を計画へ固定する
- [x] 承認済みの向き付き`MRK_PlayerSpawn_*`と、`player_spawn_exclusion` role／`hs_player_spawn_id`で明示参照する1対1の除外Volumeを資産化する
- [x] 人間用NavMesh上の`npc_spawn`と、到達可能な各BIT飛行帯を面積で覆う`bit_spawn` Volumeを資産化する
- [x] 同一seedで開始地点・向き・初期NPC／BITを再現し、選択中の除外Volumeだけを初期洗脳済みNPCとBITへ適用する
- [x] 初期洗脳済みNPCを除外範囲外で先に、未洗脳NPCを残候補から生成し、必要数とNPC間最小距離を満たす。候補不足時は厳格エラーとする
- [x] 通常BITを初期数・出現間隔・最大数の必須設定へ統一し、Alertを同じ最大数へ含め、カーペット僚機を除外する
- [x] 停止中、タイトル、公開処刑中、破棄後は増援せず、再読込でseed、timer、個体数を初期化する
- [x] B03-3D荒れ版、T06-1入力・UI・音声・水中、扉・エレベーター・Follower・光線・世界境界を、初回統合済み機能として通常ゲームで横断回帰する
- [x] 資産監査、3種NavMesh二重生成、型検査、全build、T02～T06 fixture、通常Web、Electron、破棄・再読込を検証する
- [x] ユーザーの明示指示後にbranchをoriginへpushし、`develop`向けDraft PR #67を作成する
- [ ] 別途指示されたPull Request作成後、独立レビューとV3学校基盤機能ゲートで、タイトル開始から終了・タイトル復帰・再読込まで完全E2Eを確認する
- [x] 次の実装フェーズは実装・検証・ローカルcommitまでとし、push、Pull Request作成、レビュー、merge、worktree整理は別途指示されるまで行わない

### 通常ゲーム確認で判明した是正フェーズ

- [x] 音声asset配信、カタログ、保存音量、自動再生経路を切り分け、仕様どおりVOICE／BGM／SEを既定値5で実再生できる状態へ戻す
- [x] T06 fixtureとElectron受入へ既定表示値5と非0 gainの回帰を追加し、BGM／SE／VOICEの取得・再生要求・console診断を検証する
- [x] 通常sessionごとにPlayer開始地点が変化する一方、検証用seed指定では決定性を維持する乱数契約へ修正する
- [x] NPCの位置・開始status・Character割当が現在固定される範囲を明文化し、Player開始地点IDに応じた近傍優先重みを後から追加できる抽選入力へ整理する
- [x] V1と同じBIT出現演出を確認し、黒球fade-inから円錐形BITが生える段階的演出を初期BIT・時間増援・Alertへ統合する
- [x] 追加是正後に対象fixture、型検査、build、通常Web／Electron、再読込・破棄を再検証してローカルcommitする

### NPC開始地点別近傍優先フェーズ

- [x] `npc_spawn_bias` Volumeと正の`hs_weight`による推奨案のユーザー承認を取得し、全許可面の出現可能性を残す契約を固定する
- [x] 専用branch／worktreeがクリーンであること、未保存Blender GUIと5176確認serverを変更せず継続できることを確認する
- [x] 現行生成正本、GLB extras、RuntimeのNavMesh面積抽選、fixtureを監査し、11開始地点へ各1件のbias Volume、全校`1.0`＋近傍`0.5`のチャンネル重み計算を確定する
- [x] 承認済みの意味Volume 11件を生成正本・Blender・GLBへ追加し、3種NavMesh不変、新GLB hash、生成決定性、全資産監査を再確定する
- [x] 選択Player開始地点に対応するbiasだけをNPC抽選重みへ適用し、seed決定性、洗脳済み先行、最小距離、厳格失敗を維持する
- [x] T06-2 fixtureへ対応欠落・不正weight・非選択bias無効・全域非ゼロ・分布変化・再生成／破棄の回帰を追加する
- [x] 型検査、build、資産監査、NavMesh、専用fixture、通常Webを再検証し、独立レビューでP0～P2を閉じる
- [x] 本計画の結果を実測値へ更新し、対象差分だけをローカルcommitする

### プール開始時の移動不能是正フェーズ

- [x] 実プール開始地点を固定seedで再現し、開始Marker、Collider、NavMesh、水中判定、入力、要求変位、実変位を切り分ける
- [x] Babylon.jsの固定衝突epsilon未満となるフレーム単位変位をプレイヤー移動内で蓄積し、通常速度と水中50%を維持したままフレームレート非依存で移動開始できるようにする
- [x] 静止状態、方向転換、入力停止、衝突時に不要な残差移動を発生させない回帰fixtureを追加する
- [x] 実プールMarker、水中倍率0.5、W／A／S／Dを結合した回帰と、通常開始地点の移動回帰を追加する
- [x] 対象型検査・build・fixtureと通常ゲームの実プール開始操作を検証し、console warning／error 0件を確認する
- [x] 本計画の結果を実測値へ更新し、対象差分だけをローカルcommitする

## 完了条件

### 開始フェーズ

- 最新`develop`由来の専用worktreeに、計画8ファイルだけの初回ローカルコミットが存在する。
- 旧dirty worktree、rootの未追跡cache、未保存Blenderセッションが変更されていない。
- 現在状態と提案状態を比較できる俯瞰図、候補表、抽選案、除外Volume寸法、NPC／BIT出現Volume範囲が提示されている。
- 資産・Runtime・仕様書・fixture・push・Pull Requestには未着手のまま、修正版11候補のユーザー承認内容が計画と提案資料へ固定されている。

### 実装フェーズ

- 承認済み開始候補・出現禁止・NPC／BIT出現Volumeが資産とRuntimeで一致する。
- 同一seedの開始・出現が再現可能で、選択開始地点周囲の敵出現が0件である。
- 通常BIT時間増援、最大数、停止・破棄条件が成立する。
- 既定荒れ状態2を含む全学校機能が通常ゲームで接続される。
- V3学校基盤機能ゲートのWeb・Electron完全E2Eと資源残留0件を満たす。

## 次タスク開始用プロンプト

> T06-2の修正版Player開始候補11件、抽選方式、`player_spawn_exclusion` Volume寸法、`npc_spawn`／`bit_spawn` Volume範囲の視覚提案がユーザー承認済みであることを確認してください。承認済み11件は、1階玄関、体育館中央、体育館舞台上、黒板向きの2～4階普通教室、出入口向きの2階トイレ、2階生徒会室、3階美術室、4階音楽室、プール内西側階段そば・西向きです。`codex/v2-t06-school-integration`で承認内容を計画へ固定した後、学校資産を単一担当で更新し、複数開始地点、動的出現禁止、NPC／BIT出現、BIT時間増援を通常ゲームへ実装してください。BIT側の11件は離散地点ではなく、到達可能な許可飛行NavMesh全域を覆う連続Volumeとして扱ってください。PR #65／#64／#66で統合済みの荒れ版、入力・音声・水中、扉・エレベーター・Follower、光線、世界境界は新規統合扱いにせず横断回帰してください。実装・検証・ローカルcommitまでを対象とし、push、Pull Request作成、レビュー、merge、I2以降は別途明示されるまで行わないでください。GPT-5.6 Sol / Ultraを使用してください。

## 結果

2026-08-08、PR #65、PR #64、PR #66が`origin/develop=cdb8bae`までに統合済みであることを確認した。ローカル`develop`をfast-forwardし、同headから`codex/v2-t06-school-integration`と専用worktreeを作成した。旧計画worktreeの8件の文書差分とrootの未追跡Python cache、未保存Blenderセッションは変更せず保全している。計画8ファイルだけを`13ab1f7`として初回ローカルコミットした。

同日、正本Blendを別backgroundプロセスで保存せず読み取り、通常室と全室荒れ状態の実Recast NavMesh、GLB、BIT飛行帯を横断監査した。基礎案6候補と追加採用5候補、対応する除外Volume、NPC 5階層Volume、BIT 11連続飛行帯Volumeを図示した。ユーザー指示に従い、舞台上、普通教室の黒板向き、トイレの出入口向き、生徒会室、プール内西側階段そば・西向きへ修正し、11件すべての採用承認を得た。修正版11候補は通常／全室荒れNavMeshへ全件投影でき、候補IDも提案資料間で一本化した。体育館2候補は吹抜け上下の飛行帯を覆う高さ`6.4m`、屋上候補は飛行帯とBIT安全包絡を覆う高さ`4.6m`である。BIT側の11件は離散出現地点ではなく、到達可能な飛行NavMesh全域を覆う連続Volumeである。正本Blend、GLB、全NavMesh、生成器、カタログhash、Runtime、仕様書、fixtureは開始フェーズでは変更せず、pushとPull Request作成も行っていない。開始候補の向きは図の矢印ではなく実ゲーム開始直後のカメラ方向を受入正本とし、2026-08-08のユーザー指示により実装フェーズへ移行した。

実装フェーズでは、専用worktreeのbackground Blender 5.2だけを使用して生成器を更新し、承認済みPlayer Marker 11件、1対1の専用除外Volume 11件、NPC階層Volume 5件、BIT連続飛行帯Volume 11件の計38意味Objectを正本BlendとGLBへ生成した。学校GLBは連続強制生成で22,048,056 bytes、SHA-256 `ca8fe9307b742f1d38ebc02d837d574568c4d710f856fef8c90cb5ebc5f255f2`へ決定的に更新した。静的人間用NavMesh `530fa01f...`、Room Variant NavMesh `4b5a584b...`、BIT用NavMesh `e7e0a764...`は再焼成と`--check`で既存bytes／hashを維持し、構造・荒れ状態・飛行可能領域に変化がないことを確認した。学校architecture、interiors、interactive assets、protected contract、generator refactor、B04 world boundaryの6監査はすべてPASSし、BIT 11 Volumeが11飛行帯の焼成AABBを1対1で被覆すること、外周BIT出現が0件であることを固定した。GUIで開いている未保存Blenderセッションは操作していない。

Runtimeでは、`player_spawn` Markerと`player_spawn_exclusion` Volumeを`hs_player_spawn_id`で厳格に1対1登録し、固定順11候補を開始地点専用乱数列で一様抽選した。同一の選択結果をPlayerとSurvivalへ渡し、PlayerカメラにはMarkerの実world前方を適用した。NPCとBITは開始地点とは独立した乱数列を使い、world変換済みVolume Meshの凸半空間でNavMesh三角形を切り抜いた実交差面積を重みとして全許可面から抽選する。選択中の除外Volumeだけを適用し、NPCは初期洗脳済みを先に配置してから未洗脳を配置する。候補不足、Marker／Volume契約不整合、要求数不足はfallbackせず厳格エラーとした。

`bitCount`は`initialBitCount`へ破壊的に改名し、通常設定を初期1機、10秒間隔、最大25機へ統一した。通常BITとAlertを上限へ含め、カーペット僚機は除外する。増援timerは`playing`中だけ進め、上限到達後に欠員が出た場合も1回につき1機だけ補充し、catch-up burstを発生させない。タイトル、停止、公開処刑、ゲーム終了、dispose中は増援せず、再読込と破棄でseed、timer、個体数、callbackを初期化する。

独立Runtimeレビューで、回転VolumeをAABBとして扱う交差面積計算と、BIT中心高度ではなくNavMesh面高を使う包含判定のP2 2件を検出した。前者を実Volume Meshの凸半空間clip、後者を実BIT中心座標の包含判定へ修正し、再レビュー後の未解決P0～P2は0件となった。T06-2専用fixtureは11/11、T02は50/50、T03は24/24、T04は115/115、実学校統合は77/77、T05は312/312、T05 NPC commandは26/26、T06は63/63で、すべてブラウザDOMの`validationStatus=passed`とconsole warning/error 0件を確認した。`typecheck:v2`とT01～T06-2の全型検査、通常buildとT01～T06-2の全buildもPASSした。

通常ゲームのElectron受入では、Canvas開始とPointer Lock、洗脳進行、G／N／Hと射撃、通常状態のR無効、タイトル復帰、再開始、BGM／SE／VOICE読込、renderer／load／process診断0件を確認した。音声確認用のrepo内一時junctionと今回起動した検証server 7本は検証後に削除・停止し、音声正本と他worktreeのserverは変更していない。旧計画worktreeの8差分、rootの未追跡Python cache、GUIの未保存Blenderセッションも保全した。本実装と検証結果は専用branchへローカルcommitし、push、Pull Request作成、レビュー、merge、V3ゲートは未実施のまま次の明示指示を待つ。

その後の通常ゲーム確認では、専用worktreeにGit管理外の`public/audio`と`public/picture`が存在せず、Viteが音声・画像URLをHTML fallbackとして返していたことを確認した。root正本へのJunctionを接続してViteを再起動し、音声215件と画像136件の全351 assetがHTTP 200かつ正しいMIMEで配信され、ViteカタログにもBGM 1件、SE 13件、VOICE 201件、画像136件が列挙される状態へ復旧した。さらに、配信復旧後も無音だった直接原因は、`docs/spec.md`が3カテゴリとも既定値5とする一方、通常Runtimeの`V2_DEFAULT_AUDIO_VOLUME_LEVELS`と回帰fixtureだけがテスト中の暫定値0を維持していた仕様逸脱であると特定した。音声是正を他の追加課題より先に完了させる。

音声是正では、VOICE／BGM／SEの保存設定なし既定値を仕様どおり各5へ戻し、保存済みの明示MUTE 0は維持した。T06 fixtureは65/65 PASSし、既定値5からVOICE `0.5`、BGM `0.1625`、SE `0.45`の非0 gainへ変換される契約を確認した。通常ゲームの新規読込でも3カテゴリの表示値5を確認し、音声専用Electron受入ではゲーム開始後にBGM 1件、SE 1件、VOICE 3件の実media requestがHTTP 206で完了し、失敗0件、音声再生console error 0件で`status=passed`となった。Electronの非前面実行によるPointer Lock拒否は音声経路と分離し、通常の完全E2Eでは従来どおり厳格判定を維持する。

通常ゲームの開始地点固定は、11候補の登録や一様抽選ではなく、初回とタイトル復帰の両方で通常sessionにも`seed=0`を再利用していたことが原因だった。`seed=0`の開始地点専用系列は常にindex 2の体育館舞台上を選び、NPC位置・開始status・向きも同じseedの独立系列から毎回同じ結果になっていた一方、Character割当だけが`Math.random`だったため見た目だけが変化していた。通常sessionは生成ごとに新しい32-bit seedを採番し、Player、NPC、Character、BIT、荒れ状態、扉状態を同じsession seedの独立系列へ統一した。通常ページを12回再読込した結果、seed 12種類、Player開始地点6種類を確認した。`rampValidation=gym`は2回とも`seed=0`かつ体育館舞台上を再現し、検証用固定seedの決定性を維持した。T06ブラウザーfixtureはCharacter独立系列と再生成時seed採番を追加して65/65 PASSした。

NPCは引き続き初期50人、うち初期洗脳済み10人を人数契約とするが、通常session seedの更新により位置、初期洗脳済みのgun／no-gun／ハイグレ内訳、向き、VOICE／portrait割当がsessionごとに変化する。同一seedでは位置とstatusの完全一致、異なるseedでは両方の変化、初期洗脳済み先行順をT06-2 fixtureで確認した。開始地点別の近傍優先は、全`npc_spawn`許可面を基礎分布として維持し、Player開始地点IDへ明示対応する専用`npc_spawn_bias` Volumeと正の重みによって確率だけを変更する方式で実装した。安全除外用`player_spawn_exclusion`の流用や、遠方を重み0として出現不能にする方式は採用していない。

BITにはV1と同じ合計1.5秒の生成演出を移植した。直径`0.22m`の黒灰球を0.5秒でalpha 0から1へfade-inし、球内で円錐本体を表示して0.5秒保持し、最後の0.5秒で球を直径`0.04m`相当へ縮小しながらlocal Z `0.095m`のmuzzle方向へ動かして円錐を露出する。初期、時間増援、内部Alert、カーペット僚機は同じ生成経路を通り、pending中はAI、移動、索敵、Alert receiver選出、射撃、actor／target／flight公開を停止する一方、人口上限には即算入する。編隊僚機pending中にleader／followerの射撃timerが進む既存経路も修正した。公開処刑準備では演出を明示完了し、通常Runtimeでは演出を省略しない。完了・途中破棄の双方で一時Sphereと専用Materialを解放する。T06-2は14/14、T05は312/312をブラウザーでPASSし、`typecheck:v2`／T05／T06／T06-2と通常build／T05／T06／T06-2 buildもPASSした。独立再レビューで、全4生成経路の演出、演出中の射撃抑止、内部Alert 3参加者の範囲外解除、`prepareForScriptedPhase()`の即時完了・反復・破棄をfixtureで直接検証し、残るP0～P2は0件となった。通常Webでは12回の再読込でseed 12種類・開始地点6種類、タイトル復帰後の再開始でもseedと開始地点の変化を確認した。追加是正をローカルcommitし、pushとPull Request作成は行わない。

NPC開始地点別近傍優先フェーズでは、承認済みPlayer開始地点11件へ各1件の`npc_spawn_bias` Volumeを追加し、すべて`hs_weight=0.5`とした。全校`npc_spawn`チャンネルの重み`1.0`を常に残すため、チャンネル選択は全校`2/3`、選択開始地点の近傍`1/3`となり、全許可面の出現可能性は失われない。基礎チャンネル自体もbias内へ着地できるため、実際の近傍出現率は`1/3`より高くなる。`hs_weight`は有限な`0.000001..1,000,000`だけを許可し、同一Playerに属するbiasは実NavMesh面積の正の重複を禁止する一方、面・辺接触と別Player間の重なりを許可した。非選択biasは候補にも乱数消費にも含めず、選択済み`player_spawn_exclusion`は従来どおり安全除外だけに使用する。

学校GLBは22,057,212 bytes、SHA-256 `55ca8f0e0eb6bd1115749eafc5fabda30ba16e0a6f6f4dbb9b1cf6cf67239748`へ決定的に更新した。静的人間用、Room Variant、BIT用NavMeshのhashはそれぞれ`530fa01f...`、`4b5a584b...`、`e7e0a764...`のまま不変で、6資産監査と正本／GLB parityをPASSした。T06-2は18/18、T05は314/314をブラウザーでPASSし、console warning/error 0件、対象型検査・build・NavMesh checkもPASSした。通常Webの連続2sessionでは、2階普通教室から4階音楽室へseedと開始地点が変わり、各回で対応bias 1件だけが有効、NPC 50人、初期洗脳済み10人、bias内人数12人／10人、console warning/error 0件を実測した。最終独立レビューで、水平共有面上のNavMeshを正面積overlapと誤認する問題と、Electron受入がbias IDを名前から推測する問題のP2 2件を検出し、対向する同一支持平面の境界接触判定、水平面fixture、明示`playerSpawnId`照合へ修正した。修正後もT06-2 18/18、T05 314/314、通常build／対象build、Electron音声限定受入をPASSし、再レビュー後の未解決P0～P2は0件である。本差分は`feat(v2): Player開始地点別のNPC出現biasを追加`としてローカルcommitし、pushとPull Request作成は行わない。

2026-08-08、ユーザーの明示指示により`codex/v2-t06-school-integration`をoriginへpushし、`develop`向けDraft PR #67を作成した。作成時点のPull RequestはOPEN／Draft／MERGEABLE／CLEANである。実装・修正・ローカル検証は完了しており、残る統合前作業は独立Pull RequestレビューとV3学校基盤機能ゲートである。mergeとworktree整理は実施していない。

同日、屋上プール内の開始地点では水中速度50%により60fps時の1フレーム要求変位が約`0.000527m`となり、Babylon.jsの固定衝突epsilon `0.001m`を下回って衝突移動が毎フレーム破棄されるため、WASDを押し続けても移動を開始できないことを確認した。Player移動へ未送信の水平入力変位だけを蓄積し、epsilonを超えた時点で1回送信する契約を追加した。送信済み変位や衝突で拒否された差分は蓄積せず、入力停止、方向転換、移動禁止、`reset()`、delta 0で残差を消去するため、遅延移動や反対方向への漏出は発生しない。

実GLBの`player-spawn-roof-pool-west-stairs`から、水中判定`true`、水平倍率`0.5`の状態でW／A／S／Dそれぞれが2フレーム目に移動開始し、120フレームで水平距離`0.585022m`、空中判定0フレーム、世界境界内を維持することをT02へ固定した。T02は51/51、T03は24/24、T06-2は22/22をブラウザーでPASSし、console warning／errorは0件だった。独立レビューで、Wの未送信変位がW→Dの直角方向転換後へ混入するP2を検出したため、正規化した入力軸方向が変わった時点で残差を破棄するよう修正した。カメラyawだけの変更では残差を維持する。W 1フレームからD 2フレームへの回帰を追加し、直接fixture 4/4と最終Electron fixture 22/22をPASSし、再レビュー後のP0～P2は0件となった。通常ゲームのElectron受入でも固定seed 11で同プール開始地点を選択し、Pointer Lock取得後にWを700ms保持して`(-4.375, 3.667, -9.750)`から`(-4.267, 3.667, -9.750)`へ水平`0.108m`移動し、renderer／load／process診断0件でPASSした。対象型検査、build、JavaScript構文検査、UTF-8 BOM／絶対パス／空白差分検査もPASSした。学校資産、GLB、NavMesh、生成器、カタログhashは変更していない。本修正はPlayer移動本体、T02／T03／T06／T06-2回帰、計画の8ファイルだけを対象にローカルcommitし、push、Pull Request更新、mergeは行わない。
