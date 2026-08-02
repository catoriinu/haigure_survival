# HAIGURE SURVIVAL v2 T06-1 通常ゲームRuntime接続 計画

更新日: 2026-08-02

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

### 2026-08-02 通常ゲームRuntime追加修正指示

> PLEASE IMPLEMENT THIS PLAN:
>
> - 既存の専用worktreeと`codex/v2-t06-runtime-core`を継続使用し、ローカル2commitを保持したままDraft PR #64へ追加する。
> - 光線命中音は、壁などへの衝突では鳴らさず、人物へのImpactが受理されて`hit-a`へ遷移した瞬間だけ1回鳴らす。
> - C操作の候補判定とHUD表示を、固定Sweep中心ではなく、現在の扉Transformに追従する取っ手／ノブ位置へ統一する。
> - room扉とtoilet扉は占有中でも閉鎖を開始し、開閉中は人物・BIT・光線・視線を透過させる。閉鎖完了前に最終扉面と交差するプレイヤー・NPC・BITを安全側へ移動し、全対象がパネル外へ出てから閉鎖状態とColliderを公開する。
> - Follower同期射撃Cooldownを1.0秒から0.6秒へ変更する。常時反発する分離処理を、狭路では中央追従へ戻る安定隊列Anchorへ置き換える。
> - Follow／Leave中でない未洗脳NPCは、最大12m・左右各95度・遮蔽判定あり・3Hzで洗脳状態NPCと全BITを能動的に視認する。複数脅威では最寄りを主脅威としつつ、全脅威から最も安全な逃走先を選ぶ。FollowはAlarm、直接脅威、自律視認より優先する。
> - BGM／SE／VOICEの既定音量はすべて0のままとする。
> - 実装は計画、命中音、取っ手操作、トイレ閉鎖、Follower、NPC自律回避、最終結果にcommitを分ける。全検証後にpushし、Draft PR #64を更新する。レビュー、merge、`develop`同期、worktree整理は行わない。

### 2026-08-02 T06-1追補・B03-3D資産連携・v2.0前機能拡張指示

> PLEASE IMPLEMENT THIS PLAN:
>
> - Runtime修正は既存worktree・branch・Draft PR #64を継続する。トイレ内側ノブだけは学校資産の単一所有を守り、B03-3D branchで実装してT06-2統合時に通常ゲームへ入れる。
> - NPCの自律閉扉は実装済みの全陣営共通・通過後30%閉鎖・後続通過者がいる間は閉めない仕様を維持する。BGM／SE／VOICEのテスト用既定音量は0を維持する。
> - 移動中のNPC同士は重なってよい。停止時は同じ階・Navigation Area内のプレイヤーおよび停止NPCから水平0.8m以上離れた安定Rest Slotを選ぶ。gun NPCは0.8m未満まで自ら接近せず、0.8m停止／1.0m再移動とする。
> - gun／no-gun洗脳済みNPCが標的を失った場合は既存Wander相当の探索へ戻し、haigure、formation、捕獲・公開処刑中は停止を維持する。
> - プレイヤーのエレベーター呼出・予約・乗車・目的階snapshotを毎frame NPCへ渡す。Followerは同じ便を優先し、満員・乗り遅れでもFollowを解除せず次便または別経路で追う。既知の搬送追跡中は5秒見失いタイマーを停止する。未洗脳Followerの陣営安全判定は維持する。
> - Follower同期射撃は1人1本のまま、個体・射撃ごとにyaw／pitchをそれぞれ一様分布の±3度で独立にずらす。0.3～0.8秒遅延と0.6秒Cooldownは維持する。
> - `V2PlayerAction`へ`retry`を追加し、KeyRを1回だけdrainする。通常ゲームのプレイヤー洗脳完了後は同じ設定・seedのsessionを再生成し、`execution-complete`では既存公開処刑をリプレイする。他のphaseでは無効にする。
> - Alarm追跡速度だけをFollowと同じ0.5へ変更する。Alarm床候補は安定hashで4件中3件を残し、新規追加間隔を5秒から7.5秒へ変更して総合出現量を約半分にする。
> - T06-1は計画、NPC停止・探索、Followerエレベーター・射撃、R、Alarm、結果にcommitを分け、全検証後にpushしてDraft PR #64を更新する。レビュー、merge、`develop`同期、worktree整理は行わない。
> - B03-3Dは単一`VIS_DoorPanel_Knob_*` Meshへ廊下側・個室側の球形ノブを生成し、既存Anchor 1件契約を維持する。学校GLB／Blender／hashをT06-1へ混ぜない。
> - v2.0前の順序を`B03-3D + T06-1 → T06-2 → I2設計 → T06-3 + B05 → T06-4 → T07 → v2.0リリース準備`へ更新する。I2でミニマップとMissionを相談・設計し、T06-3でV1相当ミニマップ、B05で意味付きLocation資産、T06-4でプレイヤー／NPC Mission Runtimeを実装する。

### 2026-08-02 公開処刑R・操作Feedback・Character ID・Portal修正指示

> PLEASE IMPLEMENT THIS PLAN:
>
> - 既存のT06-1専用worktree、branch`codex/v2-t06-runtime-core`、Draft PR #64を継続する。開始時HEADは`3d353cc`でremote／Pull Requestと一致している。
> - Enterは洗脳前を含むゲーム開始後の全phaseでタイトルへ戻る操作とする。Rは通常ゲームのリトライには使わず、公開処刑の進行中・完了後だけ、同じ会場・対象・配置・Character割当を維持した処刑シーンの再演に使う。R案内は有効時だけ左側help HUDへ表示する。
> - WanderのRest SlotはNPCの現在のNavigation Areaへ固定し、NavMesh投影後のPortal内候補を`locate()`前に不採用とする。`locate()`の例外は捕捉せず、Area包含0件／複数件などの契約違反を表面化させる。
> - NPC候補は`none`／`leave`を水色`#61e8ff`、`follow`を黄緑`#9cff57`、扉を黄色`#ffd166`とし、枠と文字を同色にする。F／Eでcommand modeが変わった場合とCで扉開閉が`started`になった場合だけ、180ms・中間点`scale(1.18)`／`brightness(1.8)`の単発発光を再始動する。拒否、busy、同状態、候補なしでは発光しない。
> - タイトル右下へV1同様の「自キャラ」「自ボイス」別selectを追加し、双方の先頭・既定値を「ランダム選択」にする。保存時は同じ設定rootの音量と未知fieldを保持する。
> - 全actorのVOICE IDを開始準備時にshuffleし、プレイヤー、NPC ID順へ使い切るまで重複なしで割り当てる。固定自ボイスはNPC候補から除外し、portraitはVOICE ID先頭2桁との初回一致を優先する。固定自キャラはプレイヤーだけを上書きする。設定変更と新session生成時に再生成し、開始クリックと公開処刑Rでは再抽選しない。
> - `V2VoiceRuntimeOptions`は明示的なCharacter割当を必須入力とし、暗黙の循環割当を削除する。portrait素材0件では組込み`00_default`を内部割当に使い、自キャラselectは非表示とする。画像描画自体はT06-5へ残す。
> - 将来順序を`… → T06-4 → I3 キャラクター表示設計 → T06-5 キャラクター画像Runtime → T07`へ更新する。I3でNPC billboard、プレイヤー反射、一人称下半身、状態画像、組込み表示、性能条件を相談確定し、T06-5は今回の割当と保存設定を利用する。
> - 学校GLB、Blender、NavMesh、生成器、カタログhash、`src/world/**`、音声・画像バイナリは変更しない。VOICE／BGM／SEの既定音量0を維持する。
> - T05／T06 fixture、型検査、build、Web、Electron、UTF-8 BOMなし、括弧・構文、ローカル絶対パス、所有外差分を検証する。計画、Portal、R、操作Feedback、Character割当・UI、検証結果の6単位にcommitし、全検証後に一度pushしてDraft PR #64を更新する。レビュー、merge、`develop`同期、worktree整理は行わない。

### 2026-08-02 キャラクター画像Runtime前倒し・操作Feedback強化指示

> 元のキャラクター画像ディレクトリを読み込み、プレイヤーとNPCへ反映する。画像が存在する場合でも、プレイヤーが組込みのデフォルトスプライトを明示的に選べる設定を追加する。
>
> ただし、Character ID割当から画像描画までを現在のT06-1 Runtimeへ自然に接続できる場合に限って今回実装し、不自然な依存や資産変更が必要なら将来タスクへ残す。
>
> C／E／Fの操作成功時に表示するターゲットFeedbackは現在の対象別色を維持しつつ、入力成功が視覚的に明確になるよう発光をさらに目立たせる。

- 現行T06-1は既に全actorのCharacter割当とsession再生成を所有し、ローカル配布済み17キャラクター・各8状態の画像契約も揃っている。学校資産や後続Mission Runtimeへ依存せず接続できるため、Character画像Runtimeの主要範囲をT06-1へ前倒しする。
- 「自キャラ」はランダム、組込みデフォルトスプライト、検出済み画像directoryを明示的に区別する。組込みデフォルトはプレイヤーだけを上書きし、NPCは全actor割当どおりの画像を使用する。画像directoryが0件の場合は全actorへ組込み表示を割り当てる。
- NPCは状態連動billboard、プレイヤーは下向き時の一人称足元表示へ同じCharacter割当を使用する。同じ画像directoryのTexture／SpriteManagerはsession内で共有し、session破棄時に解放する。現行v2には鏡・反射カメラRuntimeがないため、鏡へのプレイヤー反映は今回新設せず後続の表示設計へ残す。
- 画像バイナリと検証用junctionはGitへ追加しない。必須状態画像が欠けるdirectoryは組込み表示へ暗黙fallbackせず、画像契約違反として読込を失敗させる。
- 旧I3／T06-5のうち、NPC状態別billboard、プレイヤー足元表示、組込み表示を今回へ前倒しする。I3／T06-5は現行v2にまだ存在しない鏡反射と表示仕上げへ縮小し、全体ロードマップ、次タスク計画、branch戦略、仕様書を同期する。T07ではCharacter表示を有効にした99 NPC条件の性能・回帰を維持する。

### 2026-08-02 公開処刑プレイヤー射手の照準修正指示

> プレイヤーが最後の未洗脳NPCを捕獲して公開処刑へ入った場合、プレイヤーが射手であるにもかかわらず画面へ照準が表示されない。公開処刑中にプレイヤーが射手となる構成では照準を表示する。

- `execution`かつ`executionPlayerRole === "shooter"`では、プレイヤーの通常Character状態にかかわらず照準と左クリック案内を表示し、同じ条件で既存の公開処刑手動射撃へ配送する。
- playerが処刑対象または観客の構成、`execution-complete`、通常`playing`の非gun状態では照準と射撃案内を表示しない。

### 2026-08-02 Character表示サイズ・縦角度修正指示

> V2のCharacter画像はV1より明らかに小さい。V1では最大1m×2m相当の枠へ縦横比を維持して収め、現在より約1.5～1.7倍大きかった記憶があるため、V1の実装を確認して同等の大きさへ戻す。
>
> V1には、Character画像がカメラの上下角度にも常に正面を向く表示と、地面へ垂直に立った画像がカメラの横方向だけを向き、上下視点では自然な見え方になる表示の2種類があった。後者を既定にする。プレイヤーが足元を見た時も、自キャラ画像の下半身が自然な角度で映るようにする。常時正面表示は要件が不自然になる場合は省略してもよい。

- V1最終実装を監査した結果、表示上限は「1m×2m」そのものではなく、最大`1×2 cell`に`cellSize=1/3`を掛けた幅`1/3`・高さ`2/3 world unit`だった。元画像の縦横比を維持してこの枠へ収める式をV2へ復元すると、現行画像は正確に約1.57～1.67倍となる。
- `NPC_SPRITE_WIDTH`／`NPC_SPRITE_HEIGHT`は衝突・照準契約として維持し、Character画像の表示上限だけを独立させる。
- 既定は地面へ垂直なPlane表示とし、カメラpitchを追従させず、安定した水平yawだけを追従する。上下角度を含めて常に正面を向く従来のBabylon Sprite表示も設定で選択可能なまま維持する。
- プレイヤーの一人称自画像は、55度以上の下向きで足元へ段階的に現れる現行条件を維持し、地面垂直表示では下半身を透視投影の自然な角度で描画する。真下付近でも水平向きが失われない安定yawを使用する。

### 2026-08-02 Character実寸・ビーム描画順・命中フェード修正指示

> ビーム命中時、NPCのCharacter画像がビームや命中光よりカメラ手前へ描画される。プレイヤーは現状のままでよいが、NPCは極端な近距離を除き、Character画像の周囲に発射中のビーム、残光、命中光球が見える描画へ修正する。
>
> 命中光球をCharacter画像の大きさに合わせて可変にできるなら、画像全体を包む大きさへ変更する。
>
> `hit-a`／`hit-b`の点滅終了後、命中光球がフェードアウトする時に`hit-a`のCharacter画像まで一瞬消える。光球だけをフェードさせ、Character画像は消さない。
>
> 学校の扉付き出入口と現在のCharacter画像を実寸比較し、背の高いCharacterでも160～170cm程度にする。現在が大きすぎる場合は、最大1m×2m相当の枠を90cm×180cm相当へ下げる案など、学校尺度に合う値へ調整する。

- 学校は`1 Blender m = 0.25 world unit`で、教室引き戸・通常出入口は高さ2.30m、体育館系は2.40m、トイレ個室扉は1.80mである。現行portraitの非透明表示高は約1.59～1.92m、組込みdefaultは2.67mであり、希望上限1.70mに対して大きすぎる。
- 0.9m×1.8mを学校尺度へそのまま変換するとportraitの横幅制限が先に効いて非透明表示高が約1.07～1.30mまで縮むため採用しない。表示上限高を明示的な1.70mへ変更し、現行portraitを約1.51～1.70m、組込みdefaultを1.70mへ揃える。表示寸法は衝突・照準寸法から独立したまま維持する。
- 同じrendering groupとdepth testを維持したまま、透明描画の`alphaIndex`をNPC Character、ビーム／残光／命中演出、プレイヤーCharacterの順へ明示する。group分離やdepth clearは追加しない。
- V1最終契約と同じく、命中光球は対象Character表示の幅・高さの対角径へmarginを掛け、表示中心へ追従する。衝突ellipsoidは変更しない。
- NPC Characterのalphaは命中光球のfade進捗から分離して常時1とし、状態cellだけを`hit-a`へ維持する。

### 2026-08-02 Character透明画素の奥側描画修正指示

> 前回までの光とCharacter画像の前後関係はおおむね解決したが、Character画像の裏側を通る光やガラスが、PNGの透明部分でもCharacter画像に遮られて見えない。添付画像2枚のとおり、Character画像の透明部分では、奥にある光やガラスを正しく描画する。

- PNG画像自体のalpha欠損ではなく、`MATERIAL_ALPHATESTANDBLEND`のCharacter Planeへ指定した`needDepthPrePass`が、alpha discardより前にPlane四角全体のdepthを書いていることをBabylon.js 6.49の描画経路で確認した。
- `needDepthPrePass`を廃止し、通常のalpha test／blend passで透明画素をdiscardした後、実画素だけdepthへ書く。前面の光は従来どおりCharacterより後に描画し、後面の光・ガラスはCharacter実画素だけに遮られ、透明画素では見えるようにする。
- pure alpha testへの置換、rendering group分離、depth clear、学校ガラスMaterial、画像バイナリは変更しない。

### 2026-08-02 光とStage半透明面の距離描画修正指示

> Character透明部の問題は解決したが、今度は実空間で光が窓ガラスより手前にある場合も、ガラスが光より前へ表示される。光が手前なら光を前へ出し、窓と重なった部分は双方のalphaを保って透過合成する。

- 戦闘光は`alphaIndex=200`、Stageの窓ガラスはBabylon既定の`Number.MAX_VALUE`であり、透明物sortが距離より先に`alphaIndex`を比較するため、ガラスが位置に関係なく最後に描画されていた。
- Stage読込直後に`MAT_B03_WindowGlass`を使う全active visual Meshを、ビーム／残光／命中演出と同じ空間半透明indexへ統一する。同じindex内ではBabylon既定のカメラ距離sortを使い、手前の対象を後描画する。保健室カーテンとプール水面は同じ問題分類になり得るが、異なるalpha／depth契約を持ち今回の添付再現対象ではないため変更しない。
- 内部定数`V2_TRANSPARENT_ALPHA_INDEX_COMBAT_EFFECT`は空間半透明全体を表す名称へ置換し、旧定数aliasは残さない。NPC Characterの100、プレイヤーCharacterの300、Character実画素のdepth書込みは維持する。
- 学校GLB、生成器、NavMesh、カタログhash、`src/world/**`、Stage Materialのalpha／depth契約、rendering group、depth clearは変更しない。

### 2026-08-02 PR #65統合・全教室荒れ版確認指示

> Pull Request #65の荒れ版教室対応を`develop`へ取り込んだため、T06-1専用branchへ最新`develop`を統合する。競合があればB03-3Dの学校資産成果とT06-1のRuntime成果を両立させて解消する。通常ゲームを5175番で起動し、見た目確認のため今回は全教室を荒れ版にする。ここまでの統合内容と追加commitをPull Request #64へpushする。

- Pull Request #65が`develop`へmerge済みであり、merge commitが`origin/develop`へ含まれることをGitHubとGit双方で確認してから統合する。
- 荒れ版のBlender正本、GLB、Room Variant NavMesh、生成器、監査器、カタログhashは`develop`から履歴ごと取り込み、T06-1側では直接編集しない。競合時はPR #65の資産を採用しつつ、T06-1のRuntime接続を失わないよう解消する。
- 通常仕様の既定荒れ状態2は履歴上の契約として保持するが、今回の見た目確認中だけ、通常・性能・stress・rampValidation入口が使う明示的な確認値を10へ変更し、全20室を荒れ版として選択する。0／2／10の設定APIとfixture注入契約は変更しない。
- 5175番の通常ゲームで最新学校Stageを読み込み、全20室の荒れ版選択、タイトル開始、`playing`、console／Babylon Logger／unhandled rejection 0件を確認する。通常ゲーム用サーバーは確認後も停止しない。
- 統合回帰、型検査、build、UTF-8 BOMなし、`git diff --check`、ローカル絶対パス、競合markerなしを確認し、追加commitとmerge commitを既存branchへpushする。Pull Request #64のheadがpush後HEADと一致し、baseが`develop`、open状態であることを再確認する。

## 目的

既に実装済みの入力・状態・NPC指示・扉・学校動的Runtime APIを、学校バイナリへ触れず通常ゲーム入口へ接続する。F／E／C・G／N／H、候補表示、既定荒れ状態2、音声、水中速度50%、開始・破棄ライフサイクルを実プレイで成立させる。

## 対象外

- Blender正本、GLB、静的人間用NavMesh、Room Variant NavMesh、BIT用NavMesh、生成器、資産監査器、`src/world/stageCatalog.ts`の変更。通常Runtime回帰修正で原因となった`src/world/bitFlightNavigation.ts`だけは対象に含める。
- 複数`MRK_PlayerSpawn_*`、`VOL_PlayerSpawnExclusion_*`、追加`npc_spawn`／`bit_spawn` Volumeの資産化。
- 時間増援と開始地点に追従する出現禁止の最終統合。これらはT06-2が担当する。
- 荒れ版教室の見た目・配置変更、タイトル画面の荒れ状態スライダー、T07性能最適化。
- 今回明示された未洗脳NPCの自律視界探索と複数脅威回避は対象へ移す。洗脳済みプレイヤーを自律視認脅威へ加える変更は対象外とする。
- 音声・画像バイナリの追加または変更。Character画像Runtimeはローカル配布済み素材の列挙と描画接続だけを対象とし、素材自体はGit管理対象へ追加しない。

## 依存と開始条件

- Wave 0Gの計画Pull Requestが`develop`へ統合済みであること。
- PR #59～#61を含む最新`origin/develop`から専用branch／worktreeを作ること。
- B03-3Dの完了は開始条件ではない。ただし同時実行時はファイル所有を厳守する。

## ファイル所有

- 主担当: `src/v2/main.ts`、通常ゲーム入口に必要な`src/v2/**`、操作表示・音声接続に必要な`src/ui/**`・`src/audio/**`、T06-1専用fixture・設定、本計画。
- 通常Runtime回帰修正では、BIT帯内経路cache契約の修正を`src/world/bitFlightNavigation.ts`とT05回帰へ限定する。今回の追加修正では扉Runtime、動的Actor連携、取っ手資産型に必要な`src/world/stageDoorRuntime.ts`、`src/world/schoolStageDynamicRuntime.ts`、`src/world/stageDynamicAssets.ts`だけを追加所有する。
- 編集禁止: 学校Blender正本、GLB、全NavMesh、学校生成器・監査器、`src/world/stageCatalog.ts`、上記以外の`src/world/**`、B03-3D計画。今回明示されたv2.0前ロードマップ更新に限り、全体計画・次タスク計画・branch戦略を追加所有する。
- 今回の公開処刑R・操作Feedback・Character ID・Portal修正では`src/world/**`を一切変更しない。ローカル配布済み音声・画像directoryは読込対象として列挙できるが、音声・画像バイナリと検証用junctionはcommitしない。

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

### 2026-08-02 Runtime追加修正

- [x] 人物Impactが受理されて`hit-a`へ遷移した時だけ`character-hit`音声eventを1回発行し、壁・重複・受理拒否では発行しない
- [x] roomの取っ手とtoiletのノブを必須操作Anchorとして解決し、カメラ眼位置から現在Anchorまでの距離・角度を候補判定とHUD投影へ共用する
- [x] room／toiletの占有時閉鎖拒否を廃止し、開閉中の全遮蔽を無効のまま、閉鎖完了前に交差する人物とBITを両側の安全位置へ退避する
- [x] 単一BIT搬送APIを追加し、安全な飛行帯への投影、Agent・経路・Area履歴の再初期化を同時に行う
- [x] Follower同期射撃Cooldownを0.6秒へ変更し、常時反発を廃止して狭路では中央へ戻る安定隊列Anchorへ置き換える
- [x] 未洗脳NPCへ12m・左右各95度・3Hzの洗脳状態NPC／BIT視認を追加し、複数脅威から最小距離を最大化する逃走先を選ぶ
- [x] Audio、T04扉、T05 BIT／NPC、T06、通常Web、Electron、型検査、build、配布テキスト検査を完了する
- [x] 検証結果を記録し、計画どおり分割commit、push、Draft PR #64更新まで行う

### 2026-08-02 T06-1追補

- [x] T06-1／B03-3Dのbranch、dirty差分、Draft PR #64、未保存Blender、単一資産所有を再監査する
- [x] 今回の依頼、確定値、Runtime／資産の配送境界を本計画へ記録する
- [x] 全体計画、次タスク計画、branch戦略へI2、T06-3、B05、T06-4を追加し、T07とv2.0リリース準備の依存を更新する
- [x] NPC停止時の安定Rest Slot、gunの0.8m停止／1.0m再移動、洗脳済みgun／no-gunの探索復帰を実装・検証する
- [x] プレイヤーのエレベーター搬送snapshot、Followerの同便／次便追跡、搬送中の見失い停止、陣営安全維持を実装・検証する
- [x] 配送前回帰で、乗車前取消と実搬送完了を1frameの終端snapshotへ分離し、取消時だけFollowerの保存目的地と見失い停止を即時解除する
- [x] Follower同期射撃へ個体・射撃ごとのyaw／pitch各±3度を追加し、遅延・Cooldown・1人1本を回帰する
- [x] Rの一回drainを公開処刑リプレイへ限定し、通常リトライを削除して対象外phase無効、左help HUD限定表示、HUD消去を実装・検証する
- [x] 配送前レビューで、session遷移中の`beforeunload`を終了契約へ接続し、旧session破棄後と新session生成後の両地点で再生成を中止する
- [x] Alarm由来速度0.5、候補約75%、追加間隔7.5秒、総量約50%、Follow優先を実装・検証する
- [x] NPC通過後30%閉扉、後続待機、room／toilet閉鎖退避、既定音量0を回帰する
- [x] T04～T06 fixture、型検査、build、通常Web、Electron、配布テキスト検査を完了する
- [x] 実装結果と証跡を記録し、分割commit、push、Draft PR #64更新まで行う

### 2026-08-02 公開処刑R・操作Feedback・Character ID・Portal修正

- [x] worktree、branch、remote、Draft PR #64のHEADとdirty状態を再監査する
- [x] 今回の原文指示、Enter／Rの最終仕様、対象外、検証、6commitの配送境界を本計画へ記録する
- [x] WanderのRest SlotをNPCの現在Areaへ固定し、Portal候補だけを`locate()`前に除外して厳格なArea例外を維持する
- [x] R actionとdispatcherを公開処刑専用へ置換し、進行中／完了後の再演、通常全phase無効、queue・Traversal残留0を実装する
- [x] Enterをゲーム開始後の全phaseでタイトル復帰へ統一し、R用session再生成APIを削除する
- [x] F／E／C成功Feedback、mode別色、180ms発光、対象変更・clear・dispose時の即時消去を実装する
- [x] 全actorのCharacter／VOICE割当、portrait対応、重複なしshuffle、タイトルの自キャラ／自ボイス選択、設定保存を実装する
- [x] 仕様書と全体ロードマップへR／EnterとI3／T06-5を同期する
- [x] T05／T06 fixture、全typecheck／build、通常Web、Electron、配布テキスト、差分所有を検証する
- [x] 実装結果と証跡を記録し、6commitを一度pushしてDraft PR #64を更新する

### 2026-08-02 キャラクター画像Runtime前倒し・操作Feedback強化

- [x] ローカル画像directory、状態画像、既存Character割当、NPC／プレイヤー描画経路を監査し、T06-1へ自然に接続できることを確認する
- [x] ランダム／組込みデフォルト／固定directoryを区別する自キャラ設定を実装する
- [x] 8状態画像を厳格に読込・共有・破棄するRuntime契約を実装する
- [x] NPCへactor割当と状態に連動するCharacter billboardを接続し、同じdirectoryの描画資源を共有する
- [x] プレイヤーへ同じactor割当を使う、下向き時の一人称足元表示を接続する
- [x] F／E／C成功Feedbackの対象別色を維持し、拡大、輝度、外周発光を強化する
- [x] プレイヤーが公開処刑の射手となる構成だけ照準・左クリック案内と既存手動射撃を有効にする
- [x] T06 fixture、型検査、build、通常Web、Electronで画像、状態、組込み表示、Feedback、再生成・破棄を検証する
- [x] 仕様書とロードマップを前倒し後の現行順序へ同期し、本計画へ結果と検証証跡を記録して対象差分をcommitする

### 2026-08-02 Character表示サイズ・縦角度修正

- [x] V1最終の表示上限、縦横比計算、縦角度2mode、設定既定値、一人称足元表示を履歴から監査する
- [x] Character表示上限を幅`1/3`・高さ`2/3 world unit`へ分離し、衝突・照準サイズを変更せずV1式へ戻す
- [x] タイトル設定へ地面垂直表示／常時正面表示を追加し、地面垂直表示を既定として既存設定rootへ保存する
- [x] NPCとプレイヤーのCharacter画像を、安定した水平yawだけを追従する地面垂直Planeで描画し、状態cell・透明度・破棄を既存Spriteと同期する
- [x] プレイヤーが55度以上足元を見た時、地面垂直表示で下半身が自然な角度で見えるようにし、真下付近の向き反転・消失を防ぐ
- [x] T06 fixture、関連T04／T05回帰、型検査、build、通常Web、Electronでサイズ・2mode・足元表示・console・資源破棄を検証する
- [x] 実装結果と証跡を本計画へ記録し、対象差分だけをローカルcommitする。push・Pull Request更新は別途指示があるまで行わない

### 2026-08-02 Character実寸・ビーム描画順・命中フェード修正

- [x] 学校GLB・生成正本・単位変換とportrait 17件のalpha境界を読み取り専用監査し、扉高、現行表示高、候補上限を実寸比較する
- [x] Character表示上限高を1.70mへ変更し、portraitと組込みdefaultを衝突・照準寸法から独立して縮小する
- [x] NPC Character、ビーム／残光／命中演出、プレイヤーCharacterの透明描画順を`alphaIndex`で固定し、既存depth testを維持する
- [x] Character Runtimeからactor別表示寸法を取得し、命中光球を表示中心・表示矩形の対角径へ追従させる
- [x] `hit-a` fade中もNPC Characterのalphaを1に維持し、光球・orb・PointLightだけをfadeさせる
- [x] T05／T06 fixture、全typecheck／build、通常Web、Electronで実寸、前後関係、光球包含、fade、近距離、player維持、console・資源破棄を検証する
- [x] 実装結果と証跡を本計画へ記録し、対象差分だけをローカルcommitする。push・Pull Request更新は別途指示があるまで行わない

### 2026-08-02 Character透明画素の奥側描画修正

- [x] 添付画像、現行V2、V1の透明部修正履歴、Babylon.js 6.49の透明queue／depth pre-pass／alpha discard順を読み取り専用で監査し、Plane全体のdepth書込みを原因として確定する
- [x] Character Planeの深度先行描画を廃止し、通常passでalpha discard後の実画素だけdepthへ書く
- [x] T06 fixtureへalpha test／blend、depth書込み、透明queue順、共有Material、破棄の契約を追加する
- [x] T06 fixture、関連回帰、型検査、build、通常Web、Electronで、透明部の奥側光・ガラス、実画素の遮蔽、前面光、console、資源破棄を検証する
- [x] 実装結果と証跡を本計画へ記録し、対象差分だけをローカルcommitする。push・Pull Request更新は別途指示があるまで行わない

### 2026-08-02 光とStage半透明面の距離描画修正

- [x] 添付画像、学校GLBの半透明Material、現行effect／Stage `alphaIndex`、Babylon.js透明sortを読み取り専用で監査し、ガラスの最大index固定を原因として確定する
- [x] 空間半透明indexへ内部定数名を統一し、Stage読込直後に窓ガラスのactive visual Meshを同じindexへ設定する
- [x] T06 fixtureへ対象Materialの厳格解決、非対象不変、NPC／空間半透明／player順と、光／ガラスの前後交換WebGL画素試験を追加する
- [x] T05／T06 fixture、関連typecheck／build、通常Web、Electronで光手前・ガラス手前・Character透明部回帰・console・破棄を検証する
- [x] 実装結果と証跡を本計画へ記録し、対象差分だけをローカルcommitする。push・Pull Request更新は別途指示があるまで行わない

### 2026-08-02 PR #65統合・全教室荒れ版確認

- [x] Pull Request #65のmerge状態、`origin/develop`のmerge commit、Pull Request #64のhead／base／公開状態、専用worktreeのclean状態を確認する
- [x] 今回指示と統合・全荒れ版・検証・push工程を本計画へ記録する
- [x] 最新`origin/develop`をT06-1 branchへ統合し、競合があれば学校資産成果とRuntime成果を両立させて解消する
- [x] 通常・性能・stress・rampValidation入口の見た目確認用荒れ状態を10へ変更し、全20室の荒れ版選択をfixtureで固定する
- [x] 関連fixture、typecheck、build、通常Web／Electron、console、資源破棄、全荒れ版の実画面を検証する
- [x] 統合・追加修正・検証結果をcommitし、既存branchへpushしてPull Request #64のremote head一致を確認する

## 完了条件

- 通常ゲームでF／E／C・G／N／Hと候補表示が既存Runtime APIを通して動作する。
- 通常ゲームの既定荒れ状態2、状態別挙動・案内・VOICE、水中速度50%が成立する。
- Pointer Lock、タイトル復帰、再読込後も入力・UI・Audio購読の重複が0件である。
- 学校バイナリ、生成器、全NavMesh、カタログhashと、今回所有する扉Runtime／資産型以外の`src/world/**`の差分が0件である。
- 型検査、build、fixture、実ブラウザ、Electronに合格する。
- Rは公開処刑の進行中・完了後だけ有効で、同じ処刑シーンを再演する。Enterはゲーム開始後の全phaseでタイトルへ戻る。
- F／E／C成功時だけ対象色の単発Feedbackが再生され、候補・Pointer Lock・sessionの消失後に残留しない。
- Portal内Rest Slotで更新が停止せず、Portal以外のNavigation Area契約違反は引き続き例外になる。
- タイトルの自キャラ／自ボイスは独立して保存され、ランダム／組込みデフォルト／固定directoryを区別できる。全actorの明示割当をVOICEとCharacter画像描画が共用する。
- NPCは状態連動Character billboard、プレイヤーは下向き時の一人称足元表示を持ち、session再生成・破棄後に描画資源が残留しない。
- F／E／C成功時の対象別色を維持しつつ、入力成功が明確に分かる強い発光を再生する。拒否、busy、同状態、候補なしでは発光しない。
- 公開処刑中に`executionPlayerRole === "shooter"`なら通常Character状態にかかわらず照準と左クリック案内が表示され、観客・処刑対象・完了後には表示されない。
- Character画像は元画像比率を維持して幅`1/3 world unit`・高さ`1.70m`以内へ収まり、衝突・照準サイズへ影響しない。
- 地面垂直表示を既定とし、NPCとプレイヤー画像はカメラの水平yawだけを安定して追従する。常時正面表示へ切り替えても状態・割当・破棄契約を維持する。
- プレイヤーが55度以上足元を見た場合、地面垂直表示の下半身が自然な透視角で現れ、真下付近でも向き反転・消失を起こさない。

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

### 2026-08-02 通常ゲームRuntime追加修正結果

光線の衝突音声eventを`character-hit`へ統一し、人物へのImpactが受理されて`hit-a`へ遷移した時だけ人物ごとに1回発行するよう変更した。壁・扉などの遮蔽物への衝突、同一frameの重複、既に被弾中・洗脳中・洗脳完了済みの人物では発行しない。

room扉の`VIS_DoorPanel_Handle_*`とtoilet扉の`VIS_DoorPanel_Knob_*`を必須操作Anchorとして資産読込時に解決し、候補距離・角度、安定ソート、HUDの枠とC表示を同じ現在world位置へ統一した。room／toiletとも占有による閉鎖要求拒否を廃止した。開閉中は人物・BITの移動Collider、光線・視線・BIT遮蔽から除外し、閉鎖完了直前に最終パネルと交差するプレイヤー・NPC・BITを両側のNavigation契約を満たす最短候補へ再配置する。再取得した占有snapshotで全対象がパネル外にあることを確認した後だけ`closed`を公開してColliderを戻す。単一BIT再配置では飛行帯投影とAgent・経路・Area・探索履歴の再初期化を同時に行う。

Follower同期射撃Cooldownを正確に0.6秒へ短縮し、個体別0.3～0.8秒の発射遅延は維持した。毎frameの反発を削除し、NPC IDから決まる半径0.8m以内の隊列Anchorへ置き換えた。AnchorをNavMeshへ十分近く投影できない扉・階段などの狭路ではプレイヤー最終視認位置の中央追従へ戻り、一時的な重なりを許容する。Followの12m視認、遮蔽中5m維持、5秒連続見失い解除、速度0.5、Alarm・直接脅威・自律脅威よりFollowを優先する契約は維持した。

Follow／Leave中でない生存未洗脳NPCへ、最大12m・左右各95度・遮蔽あり・3Hzラウンドロビンの自律脅威探索を追加した。洗脳状態NPCは空間index、BITは毎frame渡す脅威snapshotから探索し、次の探索で非視認なら自律脅威だけを解除する。直接脅威は別provenanceで維持し、複数脅威では全脅威への距離を減らさない候補を優先して、最小脅威距離、主脅威距離、制約済み候補への移動距離、固定順で選ぶ。候補ごとの`findPath()`を既存経路予算外で最大16回呼ぶ初期実装は99体性能fixtureで検出して削除し、選択後の実経路計算だけを既存Navigation再計画予算へ通した。通常Web初期化で検出したNPC spawnのPortal判定は、NavMesh投影点ではなく接地補正後の足元へ統一した。

最終検証結果は次のとおり。

- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。
- T04通常fixtureは115／115、実学校動的統合fixtureは68／68 PASS。room／toiletの占有中閉鎖開始、動作中の人物・BIT・光線・視線遮蔽0、人物・BIT退避後の`closed`公開、閉・開・途中のAnchor追従を確認した。
- T05 NPC指示fixtureは22／22 PASS。0.6秒Cooldown境界、安定隊列、狭路の中央追従、12m／95度境界、遮蔽、洗脳NPC・BIT、複数脅威、3Hz公平性、視認解除、直接脅威維持、Follow優先を確認した。T05統合fixtureは296／296 PASSし、99体学校探索の最大計画待ち1 tick、99体隣接帯追跡2 tickを維持した。
- T06専用fixtureは26／26 PASS。現在の取っ手位置を基準にした1m内外境界、F／E／C一回配送、HUD、音声event一回drain、既定音量VOICE／BGM／SE=0、保存値・MUTE、session再生成を確認した。
- 通常Webは`http://127.0.0.1:5175/`でタイトル画面まで初期化し、VOICE／BGM／SE panel、Canvas 2件、favicon用data linkを確認した。新規タブのconsole warning／error、Babylon Logger error、未処理例外は0件だった。
- Electron受入は全12項目PASS。Canvas開始とPointer Lock、洗脳選択解放、G→N→H→G、gun射撃、N移動、H停止、Enter復帰、再開始、BGM／SE／VOICE読込を確認し、console、renderer、unhandled rejection、load failure、render process異常は0件だった。
- `git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、括弧・構文を確認した。学校Blender正本、GLB、生成器、全NavMesh、カタログhash、全体計画の差分は0件である。`src/world/**`はBIT有向経路cacheと今回明示された扉Runtime／動的Actor連携／資産型だけを変更した。

実装を計画、命中音、取っ手操作、通常扉閉鎖退避、Follower、自律脅威回避、Portal足元判定、回帰補正、fixture更新、最終結果へ分割してcommitした。全検証後に`codex/v2-t06-runtime-core`を一度pushし、Draft Pull Request #64の本文へ検証結果、対象外、T06-2への引き渡しを反映する。レビュー、merge、`develop`同期、worktree整理は行わない。

### 2026-08-02 T06-1追補・B03-3D資産連携・v2.0前機能拡張結果

自律移動の停止地点へ、同一階・同一Navigation Area内のプレイヤーと停止予約済みNPCから水平0.8m以上離れる、NPC ID由来の安定Rest Slotを追加した。移動中の継続反発は行わず、狭路では後方の空きSlotを使い、一時的な重なりを許容する。gun NPCは0.8mで停止し1.0mで再移動するヒステリシスを持ち、標的消失後のgun／no-gunは次更新からWander相当の探索へ戻る。haigure、formation、捕獲・公開処刑、エレベーター専用slotは従来の停止契約を優先する。

Traversal Coordinatorからプレイヤーの呼出・予約・乗車snapshotを毎frame渡し、Followerは定員6人と陣営安全を守りながら同じ便を優先する。満員・乗り遅れでもFollowを解除せず、次便または別経路へ再計画する。搬送中と搬送完了後の目的階到着までは見失いタイマーを停止する。配送前回帰で、乗車前取消でも目的階追跡を保持する問題を検出したため、`cancelled`と`completed`を1frameの終端snapshotへ分離した。取消時は保存目的地を即時破棄して通常の5秒見失い判定へ戻し、実搬送完了時だけ到着追跡を維持する。固定2mが実際の乗車猶予内だった境界fixtureも、実Runtimeの`boardingWindowSeconds + 0.001秒`へ修正した。

Follower同期射撃は1人1本を維持し、NPC IDと射撃番号から決まるyaw／pitch各±3度の独立した一様分布をプレイヤー照準方向へ適用した。個体別0.3～0.8秒の遅延と0.6秒Cooldownは維持した。

当初は`retry` actionで洗脳完了時の同一設定・seedによるRuntime session再生成も実装したが、後続の最終指示で通常リトライ経路を削除した。現行は`replay-execution` actionを公開処刑の進行中・完了後だけ一回drainし、同じ処刑シーンを再演する。遷移中の`beforeunload`を終了契約へ接続する修正は、Enterによるタイトル復帰とsession破棄の共通ライフサイクルとして維持した。

Alarm由来追跡速度をFollowと同じ0.5へ変更し、通常視認追跡0.3とFollow優先を維持した。アラーム床は空間cell keyの安定hashで4件中3件を残し、追加間隔を5秒から7.5秒へ変更した。10分相当のseed付き反復で候補比率75%、時間比率約67%、総量約50%を確認した。VOICE／BGM／SEの保存値がない場合の既定音量はすべて0のままである。

B03-3Dでは、24枚のトイレ扉それぞれについて単一`VIS_DoorPanel_Knob_*` Mesh内へ廊下側・個室側の球形ノブを生成した。Anchor Mesh数は扉ごとに1件を維持し、両側から同じ現在ノブ位置へHUDを投影できる。`099f9de fix(assets): トイレ扉の内側ノブを追加`としてB03-3D branchへローカルcommitした。GLBは強制生成2回で同一SHA-256 `6c94350ed4a4a390848d102bdb8174c3e0665378b3147a2e41b5853d61a22ca9`、Blender正本は`1079f03b04e7b3eda09179a95f554a251da41a90961b4bd67a4ce8defd6990d4`である。人物、Room Variant、BITの3種NavMesh bytesは変更していない。起動中の未保存Blenderセッションと既存dirty計画は操作していない。この資産commitはT06-1へ混ぜず、T06-2統合時に取り込む。

最終検証結果は次のとおり。

- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`は最終差分ですべてPASSした。通常buildには既知のVite chunk-size warningだけがあり、終了codeは0だった。
- NPC NullEngine fixtureは37／37 PASS。安定Rest Slot、0.8m境界、狭路、gunヒステリシス、gun／no-gun探索復帰、haigure停止を確認した。
- T04通常fixtureは115／115、実学校動的統合fixtureは75／75 PASS。Followerの同便／次便／取消／完了、総定員6、未洗脳Followerの安全拒否、NPC通過後30%閉扉、後続通過、room／toilet閉鎖退避を確認し、console warning／errorは0件だった。
- T05全体fixtureは301／301、NPC指示fixtureは26／26 PASS。Follower射撃のyaw／pitch各±3度、1射1本、0.3～0.8秒遅延、0.6秒Cooldown、Alarm／通常視認／Follow速度、搬送中と完了後の見失い停止、取消後の5秒境界を確認し、console warning／errorは0件だった。
- この時点のT06専用fixtureは33／33 PASSだったが、後続指示で通常R session再生成と同一seed factory項目を削除した。現行の公開処刑専用Rを含む最終fixture結果は本計画末尾の42／42を正とする。
- 通常Webは`http://127.0.0.1:5175/`でタイトル、全音量MUTE、開始後の`playing` HUDを確認した。開始前のconsole warning／errorは0件だった。Codex内蔵ブラウザの文書ルートではPointer Lock要求が環境固有の`WrongDocumentError`になるため、実Pointer Lockを含む連続操作はElectronで判定した。
- この時点のElectron受入は同一seedの通常Rリトライを含む全13項目PASSだったが、後続指示で同経路を削除した。現行受入は通常R無効を確認する本計画末尾の全13項目PASSを正とする。
- 配布テキスト検査、`git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、括弧・構文を確認した。T06-1 branchには学校Blender正本、GLB、生成器、全NavMesh、カタログhashを含めていない。

全体計画、次タスク計画、branch戦略は、`B03-3D + T06-1 → T06-2 → I2設計 → T06-3 + B05 → T06-4 → T07 → v2.0リリース準備`へ更新した。I2ではミニマップとMissionのLocation、候補、表示、達成・失敗、付与率、優先順位をユーザー相談で確定し、T06-3、B05、T06-4で分離実装する。T07はミニマップとMissionを有効にした99 NPC／50 BIT条件を含む。T06-1 Runtime差分を分割commitして`codex/v2-t06-runtime-core`へpushし、Draft Pull Request #64へ検証結果、B03-3D資産依存、T06-2以降への引き渡しを反映する。レビュー、merge、`develop`同期、worktree整理は行わない。

### 2026-08-02 公開処刑R・操作Feedback・Character ID・Portal修正結果

Wander用Rest SlotはNPC現在地のNavigation Areaを期待Areaとして固定し、NavMesh投影後の候補がPortal内なら厳格な`locate()`を呼ぶ前に不採用として同じAreaの次候補へ進むよう変更した。Area包含0件・複数件などPortal以外の契約違反は捕捉せず、従来どおり例外として表面化する。

`retry` actionを`replay-execution`へ置換し、Rは公開処刑の進行中・完了後だけ同じ会場・対象・配置・Character割当を維持した再演へ配送するよう統一した。再演前にTraversal、NPC command、光線・命中演出、pending射撃、Audio eventを消去し、同時斉射、発射待ち時間、NPC射手だけを再抽選する。通常ゲームのR session再生成経路を削除し、R案内は有効時だけ左側help HUDへ表示する。Enterは洗脳前を含むゲーム開始後の全phaseでタイトルへ戻る。

NPC候補は`none`／`leave`を水色、`follow`を黄緑、扉候補を黄色で枠と文字へ反映した。F／Eでcommand modeが変化した場合と、Cで扉開閉が`started`になった場合だけ180msの単発発光を開始し、中間点で`scale(1.18)`と`brightness(1.8)`へ変化させる。同状態入力、拒否、busy、候補なしでは発光せず、候補ID変更、候補消失、Pointer Lock解除、タイトル復帰、clear、disposeでインラインanimationを除去する。

タイトル右下へ「自キャラ」「自ボイス」の独立selectを追加し、双方の既定値をランダム選択とした。設定は既存rootへ即時保存し、音量と未知fieldを保持する。開始準備時にVOICE IDをshuffleし、プレイヤー、NPC ID順へ未使用IDを優先して割り当て、超過分だけ固定自ボイスを除外した安定poolから再抽選する。portraitはVOICE ID先頭2桁との初回一致を優先し、固定自キャラはプレイヤーだけを上書きする。VOICE Runtimeは明示的なactor割当を必須入力とし、暗黙の循環割当を削除した。画像描画はI3相談後のT06-5へ残した。

最終検証結果は次のとおり。

- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。通常buildには既知のVite chunk-size warningだけがあり、終了codeは0だった。
- T05実ブラウザfixtureは302／302、NPC指示fixtureは26／26 PASS。Portal中央・境界内外、反対Area、Portal中心から同Area次候補への選択、Area包含0件／複数件の例外維持を含み、console warning／errorは0件だった。
- T06実ブラウザfixtureは42／42 PASS。R一回消費、公開処刑途中／完了後の再演、通常phase無効、queue残留0、左help HUD限定表示、NPC三mode色、F／E／C成功発光と拒否時0回、Character設定・保存・割当・VOICE配送を確認し、console warning／errorは0件だった。
- 通常Webは`http://127.0.0.1:5175/`で学校3D読込完了、自キャラ／自ボイスのランダム既定、固定値変更時のsession再生成、相互設定保持、ランダムへの復帰、VOICE／BGM／SEのMUTE表示を確認した。console warning／errorは0件だった。
- Electron受入は全13項目PASS。Canvas開始とPointer Lock、洗脳選択解放、G→N→H→G、gun射撃、N移動、H停止、通常R無効、Enter復帰、再開始、session所有root各1件、BGM 1件・SE 14件・VOICE 74件のresource loadを確認した。resource失敗、console、renderer、load、render process消失、unresponsiveはすべて0件だった。位置依存のF／E／Cと公開処刑RはT06 fixtureで補完した。
- `git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、括弧・構文を確認した。学校Blender正本、GLB、生成器、全NavMesh、カタログhash、`src/world/**`、音声・画像バイナリの差分は0件だった。`public/picture`は実ブラウザ／Electron検証用のignored junctionだけをローカル共有し、commit対象に含めていない。

実装を「計画」「Portal」「R」「操作Feedback」「Character割当・UI」「検証結果」の6commitへ分割し、全検証後に`codex/v2-t06-runtime-core`を一度pushしてDraft Pull Request #64へ結果、対象外、T06-5への引き渡しを反映した。レビュー、merge、`develop`同期、worktree整理は行わない。

### 2026-08-02 キャラクター画像Runtime前倒し・操作Feedback強化結果

後続指示により、前節でT06-5へ残していた基本Character画像描画をT06-1へ前倒しした。ローカル配布済みの17 Character directoryから`normal`、`evade`、`hit-a`、`hit-b`、`bw-in-progress`、`bw-complete-gun`、`bw-complete-no-gun`、`bw-complete-pose`の8状態を厳格に解決し、directory単位の共有SpriteManagerへ横8cellのsheetとして接続した。状態欠落・同名拡張子重複・未割当actorは契約エラーとし、session破棄時に個別Sprite、共有SpriteManager、Texture、Blob URLを順に解放する。

全NPCは既存のactor Character割当を使う状態連動billboardへ置き換え、画像ごとの縦横比と足元基準を維持した。プレイヤーも同じ割当を使い、視線が下向き55度を超えると足元画像が滑らかに現れ、真下で完全表示される。一人称表示は公開処刑の配置変更直後も更新直前の実プレイヤー足元座標へ同期する。現行V2には鏡・反射camera Runtimeがないため、鏡反射、一人称下半身の仕上げ、状態別表示の追加相談はI3／T06-5へ残した。

タイトルの「自キャラ」は、既定のランダム選択、ローカル画像が存在していても選べる組込み「デフォルトスプライト」、固定Character directoryを区別して保存する。組込みdefault指定はプレイヤーだけを上書きし、NPCは明示割当済みの実画像を維持する。ローカル画像が0件なら従来どおり全actorを組込みdefaultへ割り当て、自キャラselectは表示しない。画像バイナリと検証用junctionはGit差分へ含めていない。

F／E／C成功時の180ms Feedbackは対象別色を維持したまま、中間点を`scale(1.35)`、`brightness(2.8)`、二重外周光、3px outlineへ強化した。公開処刑中にプレイヤーが射手である場合はCharacter状態に依存せず中央照準と左クリック射撃案内を表示し、既存の手動処刑光線へ同じ判定を接続した。処刑対象、観客、処刑完了後、Pointer Lock解除中には表示しない。

最終検証結果は次のとおり。

- T06専用実ブラウザfixtureは51／51 PASS。Character画像8状態、欠落・重複拒否、状態cell、組込みdefault、55度／72.5度／真下の一人称表示、公開処刑射手だけの照準、F／E／C成功Feedbackと拒否時0回、session購読残留0件を確認した。
- 通常Webは`http://127.0.0.1:5175/`で17種類の実Character画像がNPCへ表示されること、「自キャラ」のランダム／デフォルト／17 directory、デフォルト選択のsession再生成後保持、ランダムへの復帰を確認した。
- Electron受入は全13項目PASS。Canvas開始とPointer Lock、洗脳状態遷移、G→N→H→G、gun射撃、N移動、H停止、通常R無効、Enter復帰、再開始、session所有root各1件、BGM 1件・SE 12件・VOICE 57件の読込を確認した。音声resource失敗、console warning／error、renderer例外、unhandled rejection、load error、render process消失、unresponsiveはすべて0件だった。
- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。通常buildの既知Vite chunk-size warning以外に失敗はない。
- `git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、禁止所有ファイル差分なしを確認した。学校Blender正本、GLB、生成器、全NavMesh、カタログhash、`src/world/**`は変更していない。

基本Character画像はT06-1の現行仕様とし、I3／T06-5は反射・表示仕上げへ縮小した。Runtime、HUD、fixture差分は`8b3d0f2 feat(v2): Character画像をRuntimeへ接続`としてローカルcommitした。今回の追加差分はローカルcommitまでを対象とし、push、Draft Pull Request #64更新、レビュー、merge、`develop`同期、worktree整理は行わない。

### 2026-08-02 Character表示サイズ・縦角度修正結果

この時点ではCharacter画像の表示寸法を衝突・照準寸法から分離し、元画像の縦横比を保ったまま幅`1/3`・高さ`2/3 world unit`へ収めるV1最終式へ戻した。後続の実寸監査に基づく最大高`1.70m`への再調整は次節を正とする。`NPC_SPRITE_WIDTH`／`NPC_SPRITE_HEIGHT`など既存の衝突・照準契約は変更していない。

タイトルのPLAYER SETTINGSへ「キャラ画像を地面に垂直表示」を追加し、既定値を有効にした。設定は既存のCharacter設定rootへ保存し、未設定の既存データだけを有効へ一度正規化する。保存済みの無効値、音量、未知fieldは保持する。無効にした場合は従来のカメラ上下角も含めて常時正面を向くSprite表示へ切り替わり、設定変更時のsession再生成後も同じCharacter割当を使う。

地面垂直表示では、既存Spriteを状態・位置・cell・色・透明度の正本として維持し、水平yawだけを追従するworld-up Planeへ同期した。真下付近ではカメラ上方向から水平yawを解決し、それも退化する場合だけ前frameのyawを維持するため、向きの反転・消失を起こさない。NPCの通常移動、配置、状態変更、公開処刑配置へ同じ同期を通し、directory単位の共有Material、個別Plane、SpriteManager、Texture、Blob URLをsession破棄時に解放する。

プレイヤー画像は従来どおり下向き55度から現れ、90度で完全表示する。V1と同じ相対配置になるようカメラと画像へ別の水平・垂直offsetを描画時だけ適用し、論理上のカメラ座標は描画直後に復元する。これにより地面垂直表示では足元を見た時に下半身が透視角に沿って見え、従来表示ではカメラ正面を向いた姿が見える。移動、照準、候補取得、音声位置へ描画offsetは影響しない。

最終検証結果は次のとおり。

- T06実ブラウザfixtureは55／55 PASS。幅・高さ上限、縦横比、2mode、水平yawの通常／真下／退化境界、Planeへの位置・寸法・cell UV・色・透明度同期、共有Material、破棄、55度／72.5度／真下の一人称表示、設定既定値・保存値・未知field保持を確認した。console warning／errorとBabylon Logger errorは0件だった。
- T04実ブラウザfixtureは115／115、T05全体fixtureは302／302、T05 NPC指示fixtureは26／26 PASSし、Character Runtime必須mode追加後も既存回帰を維持した。
- 通常Webは17種類の実Character画像が拡大表示されること、地面垂直表示の既定ON、OFF時の従来表示、ONへの復帰とsession再生成を確認した。最終保存状態は地面垂直表示ONである。
- Character表示専用Electron受入は、既定ON、Canvas Pointer Lock、正面表示、90度真下でのプレイヤー下半身表示をPASSし、console、renderer、load、render process消失、unresponsiveはすべて0件だった。通常Electron受入も全項目PASSし、音声resource失敗と各診断は0件だった。
- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。`git diff --check`、Electron harness構文、UTF-8 BOMなし、ローカル絶対パスなし、括弧・構文、禁止所有ファイル差分なしを確認した。学校Blender正本、GLB、生成器、全NavMesh、カタログhash、`src/world/**`、画像・音声バイナリは変更していない。

今回の追加差分はローカルcommitまでを対象とし、push、Draft Pull Request #64更新、レビュー、merge、`develop`同期、worktree整理は行わない。通常プレイ用の`http://127.0.0.1:5175/`は継続起動する。

### 2026-08-02 Character実寸・ビーム描画順・命中フェード修正結果

学校の正本単位、生成器、配布GLBを読み取り専用で照合し、`1 Blender unit = 1m`、通常Runtimeの`1m = 0.25 world unit`を確認した。教室引き戸は高さ2.30m、トイレ個室扉は1.80mである。ローカル配布済みportrait 17件のalpha境界も実測し、Character表示の最大高を従来の`2/3 world unit`から厳密な`1.70m`へ変更した。幅上限`1/3 world unit`と元画像比率は維持し、一般portraitの実表示高は約1.51～1.70m、組込みdefaultは1.70mとなる。衝突、照準、移動Ellipsoidは変更していない。

地面垂直表示の透明描画順を、同じrendering groupと既存depth testのまま、NPC Character、ビーム／残光／命中演出、プレイヤーCharacterの順へ`alphaIndex`で固定した。これによりNPCは前面にある光を上書きせず、実際にNPCより後方にある光や遮蔽物は従来どおりdepth testで隠れる。プレイヤーCharacterは従来どおり光の内側から見える順序を維持する。camera-facing modeのSpriteManager契約、rendering group、depth clearは変更していない。

Character Runtimeへactor別の実表示幅・高さを返す必須APIを追加した。命中光球は衝突Ellipsoidではなく、対象の足元と実表示高から得る表示中心へ置き、直径を`hypot(width, height) * 1.05`として画像矩形全体を包むようにした。対象の移動や表示寸法へ毎frame追従し、PointLightの位置・rangeとfade orbの開始面も同じ包絡へ同期する。NPCは球の外側から前面だけを見る設定、プレイヤーは球の内側からも見える設定を維持した。

`hit-a`／`hit-b`後の命中光fade中にNPC Characterまで透明化していた直接代入を削除し、NPC Character alphaを常時1に維持した。fadeするのは命中光球、orb、PointLightだけであり、光が消える瞬間もCharacter画像は消えない。

最終検証結果は次のとおり。

- T05実ブラウザfixtureは303／303、T06実ブラウザfixtureは55／55 PASS。actor表示寸法、NPC／effect／playerの順序、sourceとpool再利用instanceの`alphaIndex`、可変表示中心・直径、包絡不正値拒否、fade中のCharacter alpha=1を確認し、fixtureタブのconsole warning／errorは0件だった。
- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。通常buildには既知のVite chunk-size warningだけがあり、終了codeは0だった。
- 通常Webで実画像の高さと学校出入口との余裕、NPC、ビーム、残光の前後関係を画面確認した。Codex内蔵ブラウザのPointer Lock要求では環境固有の`WrongDocumentError`が記録されるため、Pointer Lockと診断0件の判定はElectron受入へ分離した。
- Character表示専用Electron受入は既定の地面垂直表示、Canvas Pointer Lock、正面表示、真下のプレイヤー下半身表示をPASSした。通常Electron受入は`normal`から`hit-a`／`hit-b`を経て洗脳進行へ移る実経路、G→N→H→G、gun射撃、Enter復帰、再開始をPASSし、console、renderer、load、render process消失、unresponsiveはすべて0件だった。
- 学校Blender正本、GLB、生成器、全NavMesh、カタログhash、`src/world/**`、画像・音声バイナリは変更していない。

今回の追加差分はローカルcommitまでを対象とし、push、Draft Pull Request #64更新、レビュー、merge、`develop`同期、worktree整理は行わない。通常プレイ用の`http://127.0.0.1:5175/`は継続起動する。

### 2026-08-02 Character透明画素の奥側描画修正結果

PNG素材のalpha値とV1履歴を読み取り専用で確認し、素材背景の大半がalpha 0であること、V1にも同じ問題を残す`needDepthPrePass`が入っていたことを確認した。Babylon.js 6.49では、`MATERIAL_ALPHATESTANDBLEND`がalpha testを最終alpha計算後へ移す一方、透明queueのdepth pre-passはそのdiscardより前にreturnする。このため、Character Planeの透明画素を含む四角全体がdepthへ書かれ、後段で描画される奥側の光・ガラスが透明部でもdepth testに失敗していた。

Character Materialから`needDepthPrePass`を削除し、`forceDepthWrite`へ置換した。通常passではtexture alphaとvertex alphaを計算した後にalpha 0画素をdiscardし、生き残ったCharacter実画素だけが色とdepthを書く。これにより、透明部では奥側の半透明物を表示し、Character実画素は奥側を遮蔽し、Characterより手前の光は既存の`alphaIndex`とdepth testで表示する。`alphaCutOff=0.01`、NPC／戦闘演出／プレイヤーの順、rendering group、学校ガラスMaterial、画像素材は変更していない。

検証結果は次のとおり。

- T06実ブラウザfixtureは56／56 PASS。NullEngineで`ALPHATESTANDBLEND`、alpha test／blend、depth pre-pass無効、通常pass depth書込み、共有Material、既存`alphaIndex`順を固定した。さらに96px WebGL画素fixtureで、透明部の奥側を青`[0,0,229,255]`、Character実画素を緑`[0,255,0,255]`、前面光を赤優勢`[229,26,0,255]`／`[229,0,23,255]`として検出し、warning／errorは0件だった。
- T05実ブラウザfixtureは303／303 PASSし、ビーム、命中演出、Character順を含む既存回帰を維持した。warning／errorは0件だった。
- `typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。通常buildには既知のBabylon chunk-size warningだけがあり、新規warning／errorはない。
- 通常Webは`http://127.0.0.1:5175/`でタイトル、Pointer Lock、`playing`、実Character画像、ビーム、命中状態、学校窓を画面確認した。Codex内蔵ブラウザでは開始後のPointer Lock再要求時にChromium固有errorが1件記録されたため、アプリ診断0件の判定はElectronへ分離した。
- Character専用Electron受入は地面垂直表示、Pointer Lock、正面／真下画像をPASSした。通常Electron受入も全13項目PASSし、console、renderer error、unhandled rejection、load error、render process消失、unresponsiveは0件、BGM 1件・SE 16件・VOICE 73件の読込失敗は0件だった。
- `git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、括弧・構文、所有外差分なしを確認した。学校Blender正本、GLB、生成器、全NavMesh、カタログhash、`src/world/**`、画像・音声バイナリは変更していない。

本追加差分は計画、Character Material、T06回帰fixtureの3ファイルだけをローカルcommitする。push、Draft Pull Request #64更新、レビュー、merge、`develop`同期、worktree整理は行わない。通常プレイ用の`http://127.0.0.1:5175/`は継続起動する。

### 2026-08-02 光とStage半透明面の距離描画修正結果

- Babylon.jsの透明物sortは距離より先に`alphaIndex`を比較する。戦闘光は`200`、学校窓ガラスは既定の`Number.MAX_VALUE`だったため、実空間で光が手前でもガラスが必ず後描画されることを原因として確定した。
- 空間半透明の共通indexを`V2_TRANSPARENT_ALPHA_INDEX_SPATIAL=200`として明示し、通常Stage読込直後に`MAT_B03_WindowGlass`を使う全active visual Meshへ設定した。同じindex内ではBabylon.jsのback-to-front距離sortが働くため、光とガラスの実際の前後関係に応じて描画順が反転する。
- 対象Material 0件または非alpha blendは契約違反として拒否する。NPC Character=`100`、player Character=`300`、Character実画素のdepth書込みは維持し、カーテンなど他Materialは変更していない。
- T06実ブラウザfixtureは`59 / 59` PASS。中央画素は修正前固定順=`[41,0,204,255]`、光手前=`[204,0,41,255]`、ガラス手前=`[41,0,204,255]`となり、手前側の色を優先しつつ奥側の色も残るalpha合成を確認した。Character透明画素回帰もPASSし、Babylon Logger、warning、errorは0件だった。
- T05実ブラウザfixtureは`303 / 303` PASS。`typecheck:v2`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。通常buildには既知のBabylon chunk-size advisory 1件だけがあり、エラーはない。
- 通常Webは`http://127.0.0.1:5175/`で学校Stage読込と`playing`開始を確認し、Runtime例外は0件だった。Character専用ElectronはPASSし、通常Electronは最終2回連続で全13項目PASS、Audio失敗0件、console／Babylon Logger／renderer error／unhandled rejection／load error各0件だった。先行1回だけEnter破棄時の読込中VOICE 1件を受入側が`net::ERR_ABORTED`として記録したが、追加2回では再発しなかった。
- `git diff --check`、UTF-8 BOMなし、ローカル絶対パスなし、括弧・構文、所有外差分なしを確認した。学校Blender正本、GLB、生成器、全NavMesh、カタログhash、`src/world/**`、画像・音声バイナリは変更していない。通常プレイ用5175番サーバーは継続起動し、T05／T06一時fixtureサーバーだけを停止した。
- 本追加差分だけをローカルcommitした。push、Draft Pull Request #64更新、レビュー、merge、`develop`同期、worktree整理は行っていない。

### 2026-08-02 PR #65統合・全教室荒れ版確認結果

- Pull Request #65が`develop`へmerge済みで、merge commit `993c5c6`が`origin/develop`のHEADであることをGitHubとGitで確認した。T06-1 branchへmerge commit `90a828f`で統合し、4つのfixtureを自動統合した。競合は0件で、PR #65の学校Blender正本、GLB、Room Variant NavMesh、生成器、監査器、カタログhashを履歴ごと受け入れ、T06-1のRuntime／Character／扉／戦闘fixtureを維持した。
- `V2_ROOM_VARIANT_VISUAL_REVIEW_LEVEL=10`をT06専用の見た目確認値として追加し、通常・性能・stress・rampValidation入口の両分岐から必須使用した。Room Variant設定APIの0／2／10契約は変更せず、今回のRuntime入口群だけ全20室を`disordered`として選択する。後で通常仕様の既定2へ戻す箇所はこの単一定数に限定した。
- T02実ブラウザfixtureは50／50 PASS。学校GLB hash `a127b2bc...0ae71f`、Room Variant NavMesh bundle hash `86f141f0...cd89f8f`がカタログと一致し、`roomVariants=40/20/selected=20`、全荒れvariantコンテキスト再読込、Babylon Logger／browser error 0件を確認した。
- T04実ブラウザfixtureは115／115 PASSし、部屋variantの0／4／20室、実tile組立、欠落・重複・parameter不一致拒否を確認した。T05は303／303 PASS、T06は60／60 PASSし、T06では「確認値10／荒れ版20室／通常・性能・stress入口で共用」とBabylon Logger／warning／error 0件を確認した。
- `typecheck:v2`、`typecheck:t02`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`build:t02`、`build:t04`、`build:t05`、`build:t06`、通常`build`はすべてPASSした。通常buildには既知のBabylon chunk-size advisory 1件だけがあり、エラーはない。
- 5175番の通常Webは最新学校Stageでタイトルから`playing`へ遷移し、NPC 50／BIT 20を更新してRuntime例外0件だった。通常Electronは全13項目PASSし、Pointer Lock、G／N／H、Enterタイトル復帰、再開始、session root重複0、Audio BGM 1／SE 12／VOICE 58、Audio失敗0、console／renderer／unhandled rejection／load／process消失／unresponsive 0件を確認した。
- T02／T04／T05／T06の一時fixtureサーバーだけを停止し、通常プレイ用`http://127.0.0.1:5175/`はPID 32016で継続起動した。全体計画・次タスク計画・branch戦略のB03-3D進捗同期は統合担当所有のため、今回のT06-1追加差分では編集していない。
- 計画commit `1740ab4`、`origin/develop`統合commit `90a828f`、全荒れ版確認commit `92ae26f`を作成して既存branchへpushした。最初のpush後にlocal／origin／Pull Request #64 headが`92ae26f`で一致し、Pull Request #64はopen、ready、base=`develop`、head branch=`codex/v2-t06-runtime-core`を維持した。本結果記録commitも同じbranchへ追加pushし、最終remote head一致を再確認する。
