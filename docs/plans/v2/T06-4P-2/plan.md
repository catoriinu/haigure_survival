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
- 全Actor合計6人を超えず、既存乗客・予約が後着Followerで置換されない。
- 最初の乗客から発車まで4秒で、所要時間見積りも4秒を使用する。
- 単体／複数NPCが屋上入口を双方向通過し、既存優先度を維持する。

## 検証

- T04のエレベーター状態機械、実学校統合、NPC navigation policy fixtureを4秒契約へ更新する。
- 自律NPC、Player＋1～5同行者、全員先着順、満員、乗り遅れ、次便、階段代替、予約維持、破棄・再生成をfixture化する。
- 通常人口のWeb／Electronで同じシナリオを実行し、console警告・エラー0件を確認する。
- T02、T04、T05、T06-3、T06-4の影響回帰と通常buildを通す。

## ステップ

- [x] 現行5秒定数、所要時間見積り、予約・定員・Follower経路を監査する
- [x] 失敗fixtureを先に追加する
- [x] 4秒定数と全Actor先着順を実装する
- [x] 自律NPCと同行者の呼出・乗車・降車・追跡継続を修正する
- [x] 必要な場合だけ屋上入口の複数NPC混雑を修正する
- [x] T04、T05、T06、build、通常Web／Electronを検証する
- [x] V3P第1磨き込み事前ゲートを通し、結果を更新してT06-4P-2差分だけをcommitする

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
