# T06-4 Mission・校内放送 Runtime 実装計画

更新日: 2026-08-09

## プロンプト

PLEASE IMPLEMENT THIS PLAN:

# T06-4 Mission・校内放送 Runtime 実装計画

## 概要

- 実装開始時に `origin/develop` を再取得し、PR #70 を含む最新 HEAD（計画時点 `7f17e2d`）から専用ブランチ `codex/v2-missions` と worktree を作る。
- 既存 worktree の未追跡 `scripts/v2/__pycache__/` は触らない。
- 最初に `docs/plans/v2/T06-4/plan.md` を作成し、日付、今回のプロンプト、チェックリスト、結果欄を記録する。併せてロードマップ類を T06-3 統合済み・T06-4 進行中へ更新し、以後各ステップ完了時に同期する。
- Mission、NPC移動、校内放送、公開処刑会場選択、右上HUD、T06-3ミニマップ連携までを実装する。Blender・GLB・NavMesh・生成器・カタログハッシュと T07 は対象外とする。

## 公開契約

- `V2MissionKind` を、Player Location、Follower獲得、Follower護衛、対象洗脳、最初のFollower洗脳、最初のFollowerからの逃走、NPC Location の判別可能な union として追加する。
- `V2MissionState` は `active / completed / failed / cancelled` の4状態とし、担当者、Actor/Locationターゲット、開始時刻、期限、終了理由を持つ不変の `V2MissionView` を公開する。不正な組み合わせを表現できない判別 union にする。
- `StageMissionLocation` に、正本Volumeによる `contains(position)` と、ロード時に検証済みの `navigationLocation` を追加する。座標の直書き、名前・Collider・BIT Volumeからの推測、欠落時のフォールバックは禁止する。
- Player入力の `npc-follow` / `npc-leave` を、汎用の primary / secondary interactionへ完全移行する。旧action名や互換エイリアスは残さない。
- NPC Runtimeへ、Mission ID・種別・Locationを持つ移動割当、取消、移動中・危険回避中・到着の状態取得を追加する。洗脳遷移は原因と「その瞬間にPlayerのNで阻止していたか」を型付きイベントとしてMission Runtimeへ通知する。

## 実装内容

- Mission Runtimeは戦闘AIと分離した決定的乱数系列をPlayer通常、NPC通常、放送に割り当てる。Playing開始20秒後から20秒周期で動作し、Playing離脱時は未完了Missionを失敗ではなく取消にする。
- Player通常Missionは最大3件。空きがある各tickで50%抽選を1回行い、最大1件だけ追加する。無効候補を除いて比率を再正規化し、同一種別・Actor・Locationの重複は許可しない。

| Player状態 | Mission | 比率 | 期限・完了条件 |
|---|---|---:|---|
| 未洗脳 | Location移動 | 50% | 120秒、目的地Volume内への進入 |
| 未洗脳 | Follower獲得 | 30% | 120秒、開始後に対象へ新しくFollow成功 |
| 未洗脳 | 最初のFollower護衛 | 20% | 240秒、開始時にFollow中かつ未洗脳の最初のFollowerを目的地へ誘導。Leaveまたは洗脳で失敗 |
| 洗脳済み | 指定対象の洗脳 | 70% | 180秒、PlayerのG、またはN阻止中の第三者攻撃で対象が洗脳進行へ遷移 |
| 洗脳済み | 最初のFollower洗脳 | 30% | 240秒、上記と同じ判定 |

- Playerが洗脳進行へ入った時点でFollower獲得・護衛を取消する。通常ハイグレ状態では既存Missionと期限を継続するが、新しいLocation Missionは生成しない。
- 最初のFollowerは、そのセッションで最初に成功したFollow対象へ固定し、Leave後も履歴を保持して差し替えない。そのNPCが洗脳済みとなりPlayerを追跡・攻撃し始めた瞬間、1セッション1回だけ45秒の逃走Missionを開始する。距離12m以上かつ非ターゲット状態を連続5秒維持すれば完了、Playerの洗脳進行で失敗とする。
- NPC通常Location Missionは1tick最大2件、同時最大8件、期限180秒とする。ユーザー決定どおり両陣営の移動可能NPCを対象にするが、Follow中NPCは通常抽選から除外する。危険中も期限は進み、危険解消後に再開する。
- NPC行動優先度を `同行 > 直接的危険 > Alarm > 放送Mission > 通常Mission > 自律行動` に統一する。放送Missionは同行中にも付与できるが、同行が続く間は移動せず期限切れになり得る。銃なしの洗脳済みNPCに移動を妨害されている未洗脳NPCも、同行成立時に捕捉を解除して同行移動へ移る。
- 右上Mission HUDにはPlayerの通常3件と状況1件を表示し、残り時間と対象を更新する。完了・失敗はactive一覧から外して4秒表示し、取消は表示しない。ミニマップにはactiveなPlayer MissionのActor/Location IDだけを渡し、T06-3の18m範囲・12m視野・Location表示を維持する。
- 放送コンソールはPlaying中、3m以内、画面中央rayが正面ターゲットを直接捉えた場合だけ候補にする。コンソール候補をNPC Follow/Leaveより優先し、CのDoor操作は変更しない。コンソールを狙っている間、無効なsecondary操作をNPC操作へフォールスルーさせない。
- 放送操作は、F=`体育館に集まって`、未洗脳PlayerのE=`みんな逃げて`、洗脳済みPlayerのE=`みんなハイグレ人間になろう`、洗脳進行中はFのみとする。回数制限・cooldown・結果通知・字幕・効果数表示・チャイム・SFX・VOICEは追加しない。
- 新しい放送時は既存の全放送Missionを取消し、対象NPCの通常Location Missionを置換する。放送Missionは通常上限8件の外、期限180秒とする。
  - 体育館：両陣営の移動可能な生存NPCを個別に50%抽選し、当選者を体育館へ送る。0件でも再抽選しない。
  - 逃走：現在のPlayer位置から近い洗脳完了NPCを、距離・NPC ID順で最大5体選び、2F放送室へ送る。Player追跡はさせない。
  - ハイグレ人間化：通常ハイグレNPCを即時にハイグレ人間へ遷移させる。Player、洗脳進行中、公開処刑編成中などの固定対象は除外する。
- 最後の校内指示は初期値を中庭とし、体育館放送で体育館、それ以外の放送で中庭へ更新する。集合・公開処刑への遷移時に会場を固定し、`assembly-gym` または `assembly-courtyard` をRegistry IDで厳密に取得する。現在の重み付きランダム会場選択は削除し、欠落時は明示的エラーとする。

## テストと受入条件

- Mission fixtureで20秒scheduler、50%抽選、比率再正規化、上限、重複防止、期限、phase離脱取消、通常ハイグレ中の継続、G/N成功条件、第三者攻撃失敗、最初のFollower固定、45秒逃走条件を決定的に検証する。
- NPC fixtureで通常Mission最大8件・1tick最大2件、Follow除外、危険中の一時停止と期限継続、行動優先度、Volume到着を検証する。
- 放送fixtureで3m・ray条件、コンソール優先、個別50%、距離＋ID順の最大5体、既存放送取消、通常Mission置換、180秒期限、Follow優先、即時ハイグレ人間化、最終指示と会場固定を検証する。
- 実ブラウザまたはElectronでPointer Lock、F/E操作、NPC・Doorとの優先競合、右上HUD、ミニマップ目標、3種類の放送、集合・公開処刑会場、コンソールエラーなしを確認する。
- 既存B05 Location監査、T06-3ミニマップfixture、依存監査、T06-4対象typecheck、V2全体typecheck、build、V3A、`git diff --check` を通す。制御構造変更後は括弧対応も構文検査で確認する。
- 差分にローカル絶対パス、UTF-8 BOM、学校バイナリ資産、NavMesh、生成器、カタログハッシュの変更がないことを確認し、計画書の結果欄を実測結果で更新する。

## 前提と完了境界

- 今回確定した通常NPC Mission対象は「両陣営の移動可能NPC、ただしFollow中を除外」とする。放送MissionではFollow中も対象にできる。
- 実装時に暗黙のフォールバック、旧API互換、欠落metadataの推測は追加しない。
- T06-4の実装作業を別途開始する場合の完了境界は、専用worktreeでの実装、受入検証、計画書更新、ローカルcommitまでとする。push、Draft PR作成、レビュー、merge、T07開始はそれぞれ別の明示承認を要する。

### 2026-08-09 受入追補

Missionについて、Follower獲得で`npc_30`のようなIDを指定されても誰か分からないため、特定NPCではなく獲得人数を目標にする。ゲーム内で最初に表示されるFollower獲得Missionは1人固定とし、2回目以降は1人、2人、3人のいずれかを表示する。その時点で獲得可能な未洗脳NPC数を超える人数は候補から除外し、候補が0人ならMission自体を発生させない。同じNPCの再Followは重複計上せず、Mission開始後に初めてFollowした異なるNPC数を進捗とし、Leave後も獲得実績を保持する。

美術室や図書室などのPlayer Location Missionは、狭いAnchor周辺ではなく、その部屋の正本Areaへ入った時点で完了させる。Follower護衛はPlayerとFollowerの両方が目的Areaへ入った時点で完了する。NPC通常／放送Location Missionは集合先Anchorへ到達させるため、既存の正本Mission Volume判定を維持する。目的地はミニマップと同じ正本階表示を使い、`3F 美術室`、`1F 図書室`のように階数付きで表示する。

Mission HUDは0件なら何も表示せず、1件以上なら`MISSION`見出しを含む単一パネルへ全Missionを並べる。Missionごとの独立した背景、外枠、shadowは廃止し、同じパネル内で余白により区別する。完了／失敗4秒表示、取消非表示、通常最大3件＋状況最大1件は維持する。

上記以外は、直前までに確定したT06-4仕様を維持する。

### 2026-08-09 第2次受入追補

- Missionが0件のときは、Missionパネル自体を完全に非表示にする。
- ゲーム内の利用者向け表記は、`追従`を`同行`、`Follower`を`同行者`へ統一する。技術識別子の`follow`／`follower`は変更しない。
- 「最初の同行者を護衛」はNPC IDと目的地を表示しない。最初の同行者が現在同行中かどうかを問わず、240秒の期限まで未洗脳のまま生存すれば完了とする。NPCが欠落、被弾して生存状態を失う、または洗脳へ遷移した場合は失敗とする。Playerの洗脳開始またはPlaying終了では取消とする。
- 護衛Missionの対象表示は、同行中なら`（同行中）`、非同行なら正本Areaから`現在地：3F 美術室`のように表示し、3秒周期で位置変化を反映する。エレベーター内は`現在地：エレベーター`、正本Areaを解決できない間は`現在地確認中`とし、座標や前回位置から推測しない。
- G状態の放送卓HUDと射撃案内の重なりを解消する。Playing中の下部案内を`G：銃　左クリック：射撃　N：非武装　H：ハイグレ`へ統合し、単独の射撃案内は公開処刑の射手時だけ表示する。
- 放送卓のF／E操作は成功時に既存Interactionと同じ押下パルスを表示し、最後に成功したボタンをFは緑、Eは水色、未押下は紫で示す。拒否された操作は押下状態を更新しない。
- 通常の洗脳Missionは「指定対象を洗脳」から人数目標へ変更し、NPC IDを表示しない。セッション初回は1人固定、2回目以降は生成時点の有効人数を上限として1～3人を一様抽選する。有効対象が0人なら発生させず、必要人数に満たない候補は除外する。PlayerのG、またはPlayerがNで阻止中の第三者攻撃による異なるNPCの洗脳開始を進捗へ数え、阻止していない第三者攻撃は数えない。開始後に残存有効人数を加えても達成不能になった場合は失敗し、期限は180秒とする。
- 「最初の同行者を洗脳」は特定対象Missionとして維持するが、HUDからNPC IDを除く。通常の人数Missionでは、この特定対象を同時に重複計上しない。

### 2026-08-10 第3次受入追補

- Missionの残り時間は、期限到達で完了するMissionを`達成まで`、期限到達で失敗するMissionを`失敗まで`と表示し、意味を判別できるようにする。
- Missionが完了または失敗へ変化しても、4秒間の結果表示中は同じ表示位置を維持する。そのMissionが画面から消えた後に、残っているMissionを並べ直す。
- Playerが光線命中などで`hit-a`へ入った瞬間、表示中の未洗脳状態用Missionをすべて失敗へ更新する。`hit-a`、`hit-b`、`brainwash-in-progress`中は次のMissionを表示せず、G・N・Hのいずれかへ確定した時点で洗脳済み状態用Missionを1件表示する。以後は既存の20秒周期・50%抽選仕様へ戻す。
- Playerの最初のMissionは20秒schedulerを待たず、Playing開始直後に必ず1件表示する。同一フレームの通常schedulerによる重複生成は禁止する。
- 洗脳済みNPCとBITはゲーム開始から5秒間、移動もビーム発射もしない。BITの出現は許可し、Playerと未洗脳NPCが逃げるための猶予期間とする。
- NPC行動優先度を`同行 > 直接的危機 > Alarm > 放送Mission > 通常Mission > 自律行動`へ変更する。銃なしの洗脳済みNPCに移動を妨害されている未洗脳NPCでも、同行が成立した瞬間に危険回避より同行移動を優先し、救出できる挙動とする。

## ステップ

- [x] `origin/develop`、PR #70、dirty差分、既存worktreeを確認し、`codex/v2-missions`専用worktreeを作成する。
- [x] I2、B05、T06-3、ブランチ戦略、対象Runtime入口を照合し、所有境界と受入条件を固定する。
- [x] Mission公開契約、決定的scheduler、Player Mission、最初のFollower、状況Missionを実装する。
- [x] NPC Location Mission、行動優先度、洗脳遷移イベント、即時ハイグレ人間化を実装する。
- [x] 汎用primary／secondary Interaction、校内放送3種、公開処刑会場固定を実装する。
- [x] 右上Mission HUD、T06-3ミニマップ目標、通常ゲーム入口を統合する。
- [x] Mission／NPC／放送fixtureと対象typecheckを追加する。
- [x] B05・T06-3回帰、共通typecheck／build、V3A、実ブラウザまたはElectron受入、テキスト配布検査を完了する。
- [x] ロードマップと本計画の結果を実測へ同期し、T06-4差分だけをcommitする。
- [x] 受入追補を現行Mission契約、B05 Area、HUD構造へ照合し、資産変更なしの修正範囲を確定する。
- [x] Follower獲得を初回1人、2回目以降1～3人の有効人数抽選と異なるNPCの獲得進捗へ変更する。
- [x] Player Location／Follower護衛を正本Area進入完了へ変更し、階数付き目的地表示へ統一する。
- [x] Mission HUDを0件非表示、1件以上で見出し付き単一パネルへ変更する。
- [x] 追補fixture、対象typecheck／build、実ブラウザまたはElectron受入、配布監査を完了する。
- [x] 追補結果を本計画へ同期し、T06-4追補差分だけをローカルcommitする。
- [x] 第2次受入追補をMission状態機械、表示契約、Interaction契約へ反映する。
- [x] 護衛Missionを240秒生存条件へ変更し、同行状態／現在地を3秒周期でIDなし表示する。
- [x] 通常の洗脳Missionを初回1人・2回目以降1～3人の人数目標へ変更する。
- [x] Missionパネルの0件完全非表示と、ゲーム内の同行／同行者表記を統一する。
- [x] Playing下部案内へ射撃操作を統合し、放送F／Eの押下パルスと最終押下色を追加する。
- [x] 対象fixture、typecheck／build、実ブラウザ／Electron受入、配布監査を完了する。
- [x] 第2次受入追補の結果を本計画へ同期し、T06-4差分だけをローカルcommitする。
- [x] 明示承認に基づきbranchをpushし、`develop`向けDraft PRを作成する。
- [x] Mission HUDの期限ラベルと、結果表示中に表示位置を固定する並び順を実装する。
- [x] `hit-a`開始時の未洗脳Mission失敗、洗脳中の非表示、Playing開始直後とG・N・H確定時の即時1件生成を実装する。
- [x] ゲーム開始5秒間の洗脳済みNPC／BIT停止と、同行最優先のNPC行動順を実装する。
- [x] Mission／NPC／BIT／HUD fixture、対象typecheck／build、実ブラウザまたはElectron受入を完了する。
- [x] UTF-8 BOM、括弧対応、禁止資産差分、`git diff --check`を監査し、実測結果を本計画へ同期してローカルcommitする。

## 結果

- `origin/develop=7f17e2d`から`codex/v2-missions`と専用worktreeを作成した。既存worktreeの未追跡`scripts/v2/__pycache__/`には触れていない。
- Missionの判別union、20秒scheduler、Player通常／状況Mission、NPC Location Mission、最初のFollower、G／N洗脳判定、正本Volume到着、期限・取消・履歴を実装した。N補助は受理impact時点のPlayer状態・距離を保持し、洗脳開始イベントへ通知する。
- NPC行動を`直接的危険 > Follow > Alarm > 放送Mission > 通常Mission > 自律行動`へ統一し、危険回避、Follow、エレベーター、移動失敗、Mission取消の競合を解消した。
- primary／secondary Interaction、放送卓3m＋正面ray、体育館／逃走／ハイグレ人間化の3放送、通常Mission置換、最後の校内指示、`assembly-gym`／`assembly-courtyard`の厳格な会場固定を実装した。旧`npc-follow`／`npc-leave` actionと互換aliasは残していない。
- 右上Mission HUD、完了／失敗4秒表示、取消非表示、T06-3ミニマップのactive Player Mission Actor／Location目標を通常ゲームへ接続した。
- fixtureは追補後のT06-4 30/30、既存受入時のB05 34/34、T06 68/68、T06-3 14/14でPASSし、各pageのconsole warning／errorは0件だった。T06-4 fixtureではscheduler、再正規化、上限、重複、期限境界、phase取消、最初のFollower、逃走、NPC優先度、放送置換、Interaction優先、会場固定に加え、Follower人数抽選、distinct進捗、Player／護衛Area判定、NPC Mission Volume維持、階表示、単一HUDパネルを決定的に検証した。
- `typecheck:t05`、`typecheck:t06`、`typecheck:t06-3`、`typecheck:b05`、`typecheck:t06-4`、`typecheck:v2`、対応する5件のfixture build、通常`npm run build`、Electron受入script構文をPASSした。
- Mission専用Electron受入はnormalでPointer Lock、放送卓ray、20秒HUD／Mission target配線、F体育館、E逃走、体育館／中庭会場を、haigureでEハイグレ人間化と中庭会場を確認した。normalでは`player-follower-acquire / follower-count`をHUDへ1件表示し、Actor／LocationのミニマップIDがともに0件である新契約を明示的に確認した。両scenarioともconsole、renderer、load、render-process-gone、unresponsiveは0件だった。InteractionのNPC優先競合、無効secondary非fallthrough、Door C独立はT06-4 fixtureで確認した。
- Follower獲得Missionを特定NPC指定から人数目標へ変更した。セッション初回は1人、2回目以降は生成時のeligible人数を上限として1～3人を一様抽選し、同一NPCの再Followを重複加算せず、Leave後も獲得済み人数を保持する。eligibleが0人ならMission候補にしない。
- Player Location MissionとFollower護衛は正本Areaへの入室で完了し、NPC通常／放送Location Missionは従来どおり正本Mission Volumeで完了する。目的地名は正本floor mapから`3F 美術室`のように表示し、屋上名は重複させない。
- Mission HUDは0件で完全に非表示とし、1件以上では`MISSION`見出し付きの単一パネルへ全項目をまとめた。各項目の独立した背景、外枠、角丸、shadowは廃止し、Followerの必要人数／獲得人数とLocationの階数付き名称を2行で表示する。
- `git diff --check`、括弧を含むTypeScript／Electron構文検査、厳格UTF-8／BOM、ローカル絶対パス、旧action名、保護対象差分を監査した。Blender、GLB、NavMesh、生成器、カタログハッシュは変更していない。
- 本計画更新を含むT06-4差分をローカルcommitまで完了し、後続の明示承認に基づいてremote branchへpushした。レビュー、merge、I3／T06-5／T07は未実施である。
- 第2次受入追補では、護衛Missionを目的地誘導から「最初の同行者が240秒間、未洗脳の生存状態を維持する」条件へ変更した。同行中は`（同行中）`、離脱中は正本Areaを3秒周期で解決した現在地を表示し、NPC ID、座標推測、前回位置fallbackは表示契約から除外した。
- 通常の洗脳Missionを特定NPC指定から人数目標へ変更した。セッション初回は1人、2回目以降は生成時の有効対象数を上限として1～3人を一様抽選し、GまたはN補助付き第三者攻撃による異なるNPCの洗脳開始だけを進捗へ数える。特定対象Missionとの重複、阻止なし第三者攻撃、同一NPCの再遷移は数えない。
- ゲーム内表記を`同行`／`同行者`へ統一し、Missionが0件ならパネルの`display`を明示的に`none`へ戻すようにした。Playing中の下部案内を`G：銃　左クリック：射撃　N：非武装　H：ハイグレ`へ統合し、放送F／Eには成功時だけ180msの押下パルスと、F緑／E水色の最終押下色を表示する。
- 実ブラウザでT06-4 31/31、T06 69/69、T06-3 14/14、B05 34/34をPASSし、各pageのconsole warning／errorは0件だった。Mission専用Electron受入はnormal／haigureともPASSし、Pointer Lock、放送卓ray、Mission HUD、F体育館、E逃走／ハイグレ人間化、会場固定、診断0件を確認した。
- `typecheck:t06`、`typecheck:t06-4`、`typecheck:v2`、`build:t06`、`build:t06-4`、`build:t06-3`、`build:b05`、通常`npm run build`、Electron受入script構文、テキスト配布検査、`git diff --check`をPASSした。T06全体Electron受入は、今回の下部案内、射撃、G／N／H切替、session lifecycleをすべて確認できた一方、変更対象外のBGM resource load完了待ちだけが2回とも未成立となり、aggregate結果はFAILだった。console、renderer、load、render-process-gone、unresponsiveの診断は0件だった。
- 第2次受入追補を含むT06-4差分を`codex/v2-missions`へcommitし、remote branchへpushした。`develop`向けDraft PR #71を作成し、OPEN／Draft／MERGEABLE／CLEANを確認した。レビュー、merge、I3／T06-5／T07は未実施である。
- 第3次受入追補では、Mission HUDの期限表示を`達成まで`／`失敗まで`へ分け、完了／失敗の4秒表示中は元の表示位置を固定した。結果表示が消えた後だけ残存Missionを再整列する。
- Playing開始直後に未洗脳Missionを1件生成する。Playerが`hit-a`へ入った瞬間に未洗脳Missionを失敗へ遷移させ、`hit-a`／`hit-b`／洗脳進行中は新規Missionを表示せず、G・N・H確定時に洗脳済みMissionを1件即時生成する。20秒周期へ戻る同一frameでは重複生成しない。
- ゲーム開始から5秒間、洗脳済みNPCとBITの移動、索敵、ビーム、捕捉を停止し、BITの出現は維持した。NPCの優先度は`同行 > 直接的危機 > Alarm > 放送Mission > 通常Mission > 自律行動`へ変更し、同行成立時に銃なし洗脳済みNPCの捕捉を解除する。
- 実ブラウザでT06-4 32/32、T05 316/316をPASSし、console warning／errorは0件だった。Mission専用Electron受入はnormal／haigureともPASSし、Pointer Lock、即時Mission HUDとミニマップ目標、F体育館、E逃走／ハイグレ人間化、会場固定、BGM／VOICE読込、診断0件を確認した。
- `typecheck:t05`、`typecheck:t06-4`、`typecheck:v2`、`build:t05`、`build:t06`、`build:t06-3`、`build:t06-4`、通常`npm run build`をPASSした。括弧を含むTypeScript／Electron構文は各typecheck／buildで検査した。
