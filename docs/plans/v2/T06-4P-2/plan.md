# HAIGURE SURVIVAL v2 T06-4P-2 エレベーター・NPC 計画

更新日: 2026-08-22

## プロンプト

> 発車猶予を5秒から4秒へ変更する。
>
> 自律NPCが安全性・定員・所要時間に基づきエレベーターを実際に呼び、乗車、搬送、降車できる状態を通常ゲームで成立させる。
>
> 定員6人は全Actor先着順とする。既存乗客・予約を維持し、Player同行者も同じ先着順で空席まで乗車する。満員・乗り遅れ時はFollowを解除せず、次便または階段で追跡する。
>
> 屋上入口の複数NPC停止がB06後も残る場合は、同行・Alarm・Mission優先度を変えずRuntime側を修正する。

2026-08-21 実装指示:

> 以下の計画を実装してください。
>
> - 最新`develop`を再取得し、`codex/v2-elevator-npc-polish`の専用branch／worktreeから開始する。共有worktreeの未追跡ファイルは触らない。
> - 現行実装の定員6人、全Actor先着順、自律NPC利用、Followerの次便／階段選択、呼出マット再進入は再実装せず、未達の4秒契約と通常ゲーム受入を完成させる。
> - 過去の再進入修正`f5579d6`は現行実装へ別経路で吸収済みのためcherry-pickしない。
> - B06-4では屋上入口192経路が成立しているため、屋上専用コードは追加せず回帰確認だけを行う。
> - `ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS`を5から4へ変更し、最初の乗車完了から4秒で発車する。後続乗車でカウントをリセットしない。
> - 発車判定、現在便・次便の所要時間見積り、Followerの同便到達可否は同じ4秒定数を使用する。
> - 要求時刻順＋同時刻Actor ID順、既存乗客・予約保持、Player優先枠なし、満員時のFollow維持を変えない。
> - 暗黙teleport、座標fallback、Follower解除、定員超過、旧状態互換を追加しない。Blender、GLB、NavMesh、生成器、カタログhashを変更しない。
> - T04実学校fixtureへ3.999秒時点の開扉待機、4秒到達時のclosing、後続乗車で発車時刻を延長しないこと、初期状態の乗車後所要時間12秒を固定値で追加する。
> - 通常ゲームのWeb／Electron受入を再現可能にする固定seedのエレベーター検証ハーネスを追加し、通常人口の状態遷移と診断を記録する。ゲーム本編の選択policyは変更しない。
> - T02、T04、T05、T06-3、T06-4、`typecheck:v2`、通常build、Electron build、通常Web／Electron、V3P、UTF-8 BOMなし、括弧対応、`git diff --check`、ローカル絶対パスなしを確認する。
> - 個別・親・中央計画を同期し、T06-4P-2差分だけをcommitする。push、Pull Request、レビュー、merge、worktree削除は行わない。

2026-08-22 Chrome白画面追補指示:

> Codex内部ブラウザでは表示できる一方、Chromeでは画面が白く固まる原因をコード側も含めて調査する。
>
> 最初の白画面報告は今日ではなく約1週間前のセッションであり、「何分くらい前」は時刻ではなく「何PR前」の音声認識誤変換である。過去会話とPR履歴から、どの修正以降に発生したかを確認する。
>
> 白画面診断修正を専用commitとして実装する。YES。

2026-08-22 同行者乗車優先の受入修正指示:

> 4秒で発車することは確認できたが、同行者がエレベーターへ乗らず、行き先へ急いで走っていった。
>
> 同行者は、同じ便に最大人数まで乗れる場合、Playerと一緒にエレベーターへ乗ることを最優先にする。時間予測による先回りは、同便へ乗れない場合の代替とする。

## 目的

現行エレベーターの5秒待機とNPC利用policyを修正し、自律NPCとPlayer同行者が通常人口・定員競合下で呼出、乗車、搬送、降車、追跡継続できる状態を成立させる。

## 開始条件

- T06-4P-1が独立レビュー後に`develop`へ統合済みである。
- B06-2の建築統合とB06-4の屋上入口資産監査が`develop`へ統合済みである。
- B06-4後も屋上入口停止が残る場合は、再現seed、開始位置、目的地、NPC数、snapshotが引き渡されている。
- `codex/v2-elevator-npc-polish`の専用worktreeを使用する。

## エレベーター契約

- `ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS`を`5`から`4`へ変更する。
- 最初の乗客が乗車してから4秒で発車し、発車判定とNPC所要時間見積りは同じ定数を使用する。
- 定員6人はPlayer、未洗脳NPC、洗脳済みNPCを含む全Actorの先着順とし、Follower優先枠・優先予約を設けない。
- 既存乗客と既存予約を維持し、空席数だけ新規Actorを受け付ける。
- 満員・扉閉鎖・乗り遅れ時の同行者はFollowを解除せず、次便または階段のうち現行安全性・所要時間policyが選ぶ経路で追跡する。
- Playerの既知便が乗車可能で空席もある場合、同行者は残り乗車時間と到達予測時間の比較より同便への接近を優先する。4秒発車、全Actor先着順、既存予約保持は変えず、実際に乗り遅れた場合だけ次便または階段へ再計画する。

## 自律NPC契約

- 自律NPCは出発階・目的階、安全性、空席、予約、待機4秒、移動時間、階段経路を比較してエレベーターを選ぶ。
- エレベーター選択時は呼出、待機位置、閾値進入、占有、搬送、降車、目的地への経路再接続を一つの状態遷移として完了する。
- 未洗脳NPCの敵対便回避、洗脳済みNPCの追跡、Follow、Alarm、Missionの既存優先度は変更しない。
- 乗車失敗を理由に暗黙teleport、定員超過、Follow解除、目的地座標fallbackを行わない。

## 屋上入口の条件付き修正

- 資産・NavMeshが正常でも複数NPC集中時だけ停止する場合、同一点占有、先頭停止、movement segment拒否、再計画をfixture化する。
- 同行、Alarm、Mission優先度を変えず、NPC移動状態または混雑解消契約だけを修正する。
- B06-4後に再現しない場合はコードを変更せず、非再現のfixture／実画面証拠だけを結果へ記録する。

## 受入条件

- 自律NPCが通常ゲームで1F↔4Fを呼出・乗車・搬送・降車し、目的地へ再接続する。
- Player＋1～5同行者が空席まで先着順で乗り、満員競合・乗り遅れでもFollowを維持して次便または階段で追跡する。
- 固定seedの通常ゲーム受入では、資産定義の待機位置へ同行者が実移動で合流してからPlayerが呼び出し、Player＋指定同行者が定員6人以内で同便へ乗車したことを記録する。NPCを検証用にteleportしない。
- 全Actor合計6人を超えず、既存乗客・予約が後着Followerで置換されない。
- 最初の乗客から発車まで4秒で、所要時間見積りも4秒を使用する。
- 単体／複数NPCが屋上入口を双方向通過し、既存優先度を維持する。

## 検証

- T04のエレベーター状態機械、実学校統合、NPC navigation policy fixtureを4秒契約へ更新する。
- 自律NPC、Player＋1～5同行者、全員先着順、満員、乗り遅れ、次便、階段代替、予約維持、破棄・再生成をfixture化する。
- 通常人口のWeb／Electronで同じシナリオを実行し、console警告・エラー0件を確認する。
- T02、T04、T05、T06-3、T06-4の影響回帰と通常buildを通す。

## Chrome白画面診断契約

- `index.html`の通常入口を軽量bootstrapへ分離し、loading UIとCSSをBabylon、Recast、学校GLB、50 NPCの初期化より先に描画する。
- bootstrap、Runtime module読込、Engine生成、学校資産、Character表示、Survival、Scene ready、visual準備、実行開始を同一の起動診断snapshotへ時系列で記録する。
- 起動が非同期フェーズで停止した場合は、白画面のままにせず、現在フェーズと経過時間をタイトル画面へ表示する。例外はconsole、DOM、診断snapshotの同じfailureへ記録する。
- ページ離脱時はブラウザ自身がWindow、Scene、WebGL contextを破棄するため、同期的なScene全破棄と直後のEngine破棄を重ねない。明示的なゲーム内セッション再構築では従来どおりdisposeを完了してから次Sessionを作る。
- service worker、キャッシュfallback、旧入口互換、画像・音声fallback、GLB／NavMesh変更は追加しない。

## ステップ

- [x] 現行5秒定数、所要時間見積り、予約・定員・Follower経路を監査する
- [x] 失敗fixtureを先に追加する
- [x] 4秒定数と全Actor先着順を実装する
- [x] 自律NPCと同行者の呼出・乗車・降車・追跡継続を修正する
- [x] 必要な場合だけ屋上入口の複数NPC混雑を修正する
- [x] T04、T05、T06、build、通常Web／Electronを検証する
- [x] V3P第1磨き込み事前ゲートを通し、結果を更新してT06-4P-2差分だけをcommitする
- [x] 過去セッション、PR #73～#76、Chromeのhost／port別再現から白画面条件を監査する
- [x] 軽量bootstrapと起動フェーズ診断を実装する
- [x] ページ離脱と明示的Session再構築の破棄責務を分離する
- [x] typecheck、build、Web／Electron、Chrome再読込を検証する
- [x] 実画面報告と同行者の時間比較policyから、空席があっても階段を選ぶ原因を特定する
- [x] 同便に空席がある同行者は到達予測時間にかかわらずエレベーターを選ぶ失敗fixtureを追加する
- [x] 同行者の同便優先を実装し、満員・安全性・先着順・4秒発車を維持する
- [x] 固定seed受入が離れた同行者の合流前にPlayer便を即発車し、5人中0人乗車となることを診断する
- [x] 乗場のPlayerが同行者1人の呼出マット進入を妨げ、5人中4人で停止する固定seed受入の経路振動を診断する
- [x] 固定seed受入を待機位置への実合流後に呼び出す構造へ変更し、指定同行者全員の乗車を完了条件にする
- [x] T04実学校、T05 Follow、通常Web／Electron受入と共通検証を再実行する
- [x] 診断結果を更新し、白画面追補と同行者同便優先の差分を専用commitにする

## 結果

2026-08-21、`origin/develop=c716331`にT06-4P-1のPR #76が統合済みであることを確認し、同headから`codex/v2-elevator-npc-polish`と専用worktreeを作成した。共有`develop`の未追跡ファイル4件は変更していない。

現行実装を監査し、定員6人、要求時刻順＋同時刻Actor ID順、自律NPCのエレベーター選択・呼出・乗降、Followerの同便・次便・階段選択、呼出マット再進入は実装・fixture化済みであることを確認した。過去の`f5579d6`はcherry-pickしない。B06-4の屋上入口は6状態・単体／5体／10体・上下方向の192経路が成立しており、停止snapshotがないため屋上専用Runtime修正は行わない。未達は5秒定数と、4秒固定値・通常ゲームWeb／Electron受入の明示である。

T04実学校fixtureへ、初期所要時間12秒、3.999秒時点の開扉、後続乗車で残り時間を延長しないこと、4秒到達時のclosingを固定値で追加した。現行5秒実装に対して実ブラウザで実行し、4秒時点でclosingへ移らないため後続の降車処理が成立せず失敗することを確認した。

`ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS`を4へ変更した。発車判定、現在便・次便の所要時間見積り、Followerの同便猶予は既存どおり同じ公開定数を参照し、全Actor先着順、定員6人、既存乗客・予約保持、Player優先枠なしの実装には変更を加えていない。T04実ブラウザfixtureは82/82件PASSし、初期所要時間12秒、3.999秒の開扉、後続乗車後も残り0.001秒、4秒到達時closingを確認した。

通常ゲーム入口へ`elevatorAcceptance=T06-4P-2&seed=20260821&followers=1..5`を追加した。通常人口50 NPC・初期洗脳10・初期BIT 1を維持し、実Player便の呼出・予約・乗車・約4秒発車・搬送・降車、1～5人へのFollow受理と乗り遅れ後の歩行診断、通常人口の自律NPCによる呼出・乗車・到着をDOM遷移として記録する。WebではPlayer便の発車猶予約4.000秒と自律`npc_10`、Electronでは発車猶予約3.997秒と自律`npc_17`の乗車・到着を確認し、Electronのconsole、renderer、load、render-process-gone、unresponsiveはすべて0件だった。厳密な同便・満員・次便・階段・Follow維持はT04実学校fixtureで担保し、通常ゲームの選択policyは変更していない。

B06-4屋上入口は192経路fixtureで停止snapshotがなく、通常ゲーム受入でも屋上専用の再現条件は発生しなかったため、屋上Runtimeは変更していない。

2026-08-22、4秒定数へ追随していなかったT04動的状態機械fixtureも同じ公開定数へ統一した。T05 NPC指示fixtureでは、既存`develop`上の旧world scale座標とNavigation初期化frame不足を検出し、3m指示範囲内かつ1.2m再開距離外の配置と0秒初期化更新へ修正した。NPC Runtimeや戦闘・Follow policyは変更していない。

ローカル同一headのV3P事前ゲートとして、B05 42/42、T04実学校82/82、T05総合320/320、T05 NPC指示27/27、T06-3 16/16、T06-4 36/36を実ブラウザで通過した。T04実学校では初期所要時間12秒、3.999秒時点open、後続乗車後も残り約0.001秒、4秒到達時closing、全Actor先着順6人、満員時Follow維持、屋上入口192経路、破棄・再生成を確認し、Babylon Logger、console warning／errorは0件だった。T02の実ブラウザ43/52とT04総合114/118に残る資産系失敗は、今回変更していない`origin/develop`正本の既知基準と同じであり、対象のT04実学校fixtureは全件PASSしている。

通常人口Webはseed `20260821`、50 NPC、初期洗脳済み10、初期BIT 1、Follower 5人でPASSし、Player便の発車猶予3.985秒、自律`npc_20`の乗車・到着、Follower `npc_41`の同便乗車・降車、最大同時2人を記録した。Electronは発車猶予3.981秒、自律`npc_17`の乗車・到着を確認し、console、renderer、load、render-process-gone、unresponsiveは0件だった。

`build:t02`、`build:t04`、`build:t05`、`build:t06-3`、`build:t06-4`、`build:electron`、`typecheck:v2`はPASSした。通常buildはrenderer生成と学校GLB catalog整合まで成功し、`origin/develop`から差分0のOFL／THIRD_PARTY_NOTICESがCRLF bytes／hashとなる既知2件だけで配布監査が停止した。学校`.blend`、GLB、3種NavMesh、生成器、監査器、catalogは`origin/develop`との差分0で、GLBと3種NavMeshのSHA-256はcatalogと一致した。B05実GLB監査42/42で5階Map、Barrier／Passage各5、53 Area／85 piece、25 Mission Location、通常版／荒れ版Anchor各25/25、異常0件を確認した。

2026-08-22、過去セッションとGit履歴を再監査し、最初の白画面報告はPR #73 merge後、PR #74へ入るB06-3 commit `6f25faf`作成後の2026-08-17 15:11であると特定した。現行`develop`はPR #76まで統合済みであり、発生窓はPR #73直後からPR #74作業中である。現在のT06-4P-2より前から発生しているため、4秒定数やエレベーター受入追加は初発原因ではない。

修正前はCodex内部ブラウザ、`localhost:5175`、`127.0.0.1:5176`では正常である一方、Chromeの`127.0.0.1:5175`だけが新規タブでも停止した。service worker、IndexedDB、sessionStorageは存在せず、音声・Character画像Junctionと代表HTTP応答は正常だった。単一の壊れた資産や決定的なRuntime例外ではなく、同originのrenderer／navigation／Vite文脈と、重い通常入口を初回描画前から一体初期化する構造の組合せを修正対象とした。

通常入口を`src/v2/bootstrap.ts`へ変更し、CSSとloading UIを先に描画してから`src/v2/main.ts`をdynamic importする構造へ分離した。`src/v2/startupDiagnostics.ts`はbootstrap、初回描画、Runtime module、Engine、学校資産、Character表示、Survival、Scene ready、visual準備、Session ready、runningを時系列snapshotとして`window.__v2StartupDiagnostics`とDOM datasetへ公開する。15秒以上同じ非同期起動が継続した場合は現在フェーズと経過秒をタイトル画面へ表示し、起動例外は`failed` snapshot、console、読込エラー画面へ同じ原因を記録する。

ゲーム内のEnterタイトル復帰は従来どおり旧Sessionをdisposeしてから再構築する。ページ離脱では`beforeunload`中にSession全破棄とEngine破棄を重ねず、終了フラグ、所有参照解除、render loop停止、診断更新だけを同期実行する。ブラウザ自身のWindow／WebGL context破棄へ責務を統一し、旧入口互換、キャッシュfallback、画像・音声fallbackは追加していない。

Chromeの問題originでは、修正後の初回がloading UI 17ms、Engine 1.536秒、学校資産2.375秒、Character表示6.594秒、全起動7.341秒で`running`へ到達した。同一タブ3回連続再読込は7.005秒、7.133秒、7.099秒で全件成功し、最終コードでも5.968秒、console warning／error 0件だった。Codex内部ブラウザは9.354秒、production配信は1.889秒で`running`となり、いずれもwarning／error 0件だった。2026-08-22には、ユーザー自身のChromeで別タブから同じローカル入口を開き、問題なくタイトル画面へ到達したことも確認した。不正な`elevatorAcceptance`では142msで`failed`となり、白画面ではなく読込エラーと具体的原因を表示した。

Electron通常入口の音声専用受入は初回Session所有root、BGM／SE／VOICE実再生、失敗0件、console／renderer／load／render-process-gone／unresponsive 0件でPASSした。受入完了後のElectron process終了時にChromiumの`GPU state invalid after WaitForGetOffsetInRange`がstderrへ1件出たが、render loop停止追加の前後で同じであり、稼働中診断、process-gone、unresponsiveには記録されない終了後メッセージだった。既存の通常人口エレベーター長時間受入は2回ともPlayer便の約3.98秒発車、1F搬送、降車と起動診断異常0件まで成立したが、変更していない自律NPC到着条件が180秒以内に成立せず未達だった。起動・離脱変更後もRuntime更新中のエレベーター／NPC policy差分はなく、追補commitの対象外である。

最終`typecheck:v2`、V2依存監査、Vite production build、`build:electron`はPASSした。productionはbootstrap 3.37kB、main 415.81kB、Babylon 4,082.67kBへ分離された。`build:renderer`は生成まで成功し、変更前と同じOFL／THIRD_PARTY_NOTICESのCRLF bytes／hash 2件だけで配布監査が停止した。

2026-08-22、ユーザー実画面で、4秒発車は成立する一方、同行者が同便へ乗らず目的階へ走る事象を確認した。原因は、Followerの既知Player便であっても乗車接近時間と残り4秒を比較し、間に合わない予測では階段を選べるpolicyと、別Actorが呼出済みの`departure-countdown`中に後着Followerの呼出入力を現在便へ接続できないCoordinator条件の組合せだった。Playerの既知便が開扉中かつ空席ありの場合は時間比較より同便接近を優先し、呼出マットがlockedでも現在停止階で実際に乗車可能なら同じ便の予約処理へ接続するよう変更した。満員、実際の乗り遅れ、安全性競合では従来どおり次便または階段を選び、Follow、全Actor先着順、定員6人、既存予約、4秒発車を変更していない。

T04実学校fixtureでは、最初のActorが乗車して呼出マットが`departure-countdown`になった後も後着5人が同じ便へ参加し、6人満員まで受理、7・8人目を拒否、既存予約を保持する条件を追加した。Followerの接近予測4.001秒が4秒窓を超える場合でも、Playerの既知便に空席があればエレベーターを選ぶ条件も追加した。新規ブラウザタブで82/82件PASSし、同便優先、満員時の階段／次便、Follow維持、自律NPC、屋上入口192経路、console warning／error、Babylon Logger 0件を確認した。T05 NPC指示fixtureも27/27件PASSし、エレベーター搬送中のFollow継続、予約取消後の復帰、console／Babylon異常0件を確認した。

固定seed通常人口受入は、同行者を単純なPlayer距離ではなく1階呼出マットまでの実NavMesh距離順で5人選び、全員に実位置でFollowを指示してからPlayerが1階で呼び出す構造へ変更した。最初の試行ではPlayerが呼出マット中央に残り、`npc_17`の接近回避がマット境界で振動して5人中4人で停止したため、Playerは予約成立直後に実際の車内へ入り入口を空けるよう修正した。再実行では`npc_10`、`npc_12`、`npc_17`、`npc_20`、`npc_47`の5人全員とPlayerが同じ便へ乗車し、最大予約・乗客6人、発車猶予3.9999～4.0000秒、1階から4階への搬送、5人全員の降車、Electronのconsole／renderer／load／render-process-gone／unresponsive 0件を2回確認した。検証用NPCのteleportや通常ゲームpolicyの選択強制は追加していない。

Electron専用受入全体は、同行者便の完了後に別の自律NPCが180秒以内に自然利用する既存条件だけが2回とも成立せずtimeoutした。同行者修正前から残る既知未達であり、今回の同行者便は約21秒で完了している。自律NPCの呼出・乗車・搬送・降車は同一headのT04実学校fixtureでPASSしているが、通常人口での自律利用を再現可能にする別段階の明示化は未完としてcommit前に分離判断が必要である。

最終`typecheck:v2`、V2依存監査、`typecheck:t04`、`build:t04`、`build:t05`、Vite production build、`build:electron`はPASSした。UTF-8 BOMなし、`git diff --check`、ローカル絶対パス混入なしを確認した。括弧対応はTypeScript型検査とbuildで確認した。白画面追補と同行者同便優先をT06-4P-2の単一commitとして確定した。
