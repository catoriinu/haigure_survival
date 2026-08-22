# HAIGURE SURVIVAL v2 I4 タイトル・ゲーム設定設計 計画

更新日: 2026-08-23

## プロンプト

> V1のタイトル画面から選べる人数変更、各種オプション、いきなり公開処刑モードと、Missionや荒れ度などV2で追加した機能の設定を追加したいです。タイトル画面の設計、V1相当のゲームオーバー、リプレイ、タイトル復帰、学校3D空間の再利用を後続計画へ入れてください。

> I3ではリアルタイム鏡面反射を採用せず、T06-5を省略してI4へ連続で入ってください。I4用ブランチにI3とT06-5を省略したことを記録してください。

> 画面サイズが多少小さくても、折り返しなどによって上下にはみ出して変更できない事態を避けてください。表示領域が足りない場合はインタラクティブに折り返す、文字を小さくする、上下左右の隅へ基準点を置くなどして、ウィンドウサイズを切り替えても違和感なく追従することを設計条件へ入れてください。

> HAIGURE SURVIVAL V1との互換性は考慮せず、V2のタイトル設定を別の保存領域へ保存してください。V1へ戻ったときにV1の設定へ影響させないでください。視点高さの既定値は1.20としてください。

## 目的

V1相当のタイトル・設定・ゲーム終了導線と、V2固有の開始条件、公開処刑、Mission、Alarm、学校静的資源再利用を実装前に固定する。I4は文書専用とし、後続T06-6A～Dが追加判断なしで直列実装できる契約を作る。

## 開始状態と対象外

- `origin/develop=154da0242280a27365ba8b7fe05e306813b06c3d`から`codex/v2-title-settings-design`を作成した。
- I3の終了判断を同じbranchへ吸収し、T06-5とV3Bゲートを省略する。I4の開始依存はT06-4P-2までとする。
- 学校はV2の1ステージ固定で、表示名だけを示す。stage selector、複数stage cache、リアルタイム鏡面反射、反射設定を追加しない。
- I4ではTypeScript、CSS、画像、音声、Blender、GLB、NavMesh、生成器、カタログhashを変更しない。

## `V2TitleSettings`契約

保存キーはV2専用の`haigure-survival-v2.title-settings`、保存versionはV2独立schemaの厳密な`1`とする。V1が使用する`haigure-survival.title-settings`は読込、移行、上書き、削除のすべてを行わない。タイトル変更ごとに正規化済みcanonical snapshotをV2専用キーへ保存し、Runtimeは開始時に生成した不変snapshotだけを読む。

`docs/spec.md`に保存されたV1履歴の視点高さ既定値1.00とV1保存契約は変更しない。以下の既定値1.20はV2だけへ適用する。

| 分類 | 設定 | 範囲・候補 | 既定値 |
|---|---|---|---|
| 人口 | NPC人数 | 0～99の整数 | 50 |
| 人口 | 初期洗脳済み率 | 0～100%の整数。人数は`floor(npcCount * percent / 100)` | 20% |
| 人口 | Player初期洗脳済み | ON／OFF | OFF |
| BIT | BIT無効化 | ONで初期・増援とも0 | OFF |
| BIT | 初期数 | 有効時1で固定 | 1 |
| BIT | 増援間隔 | 1～99秒の整数 | 10秒 |
| BIT | 最大数 | 1～50の整数 | 25 |
| 音量 | BGM／SE／VOICE | 各0～10の整数 | 各5 |
| 表示 | 視点高さ | 0.50～1.50、0.05刻み | 1.20 |
| 表示 | 地面影／縦方向Character表示 | ON／OFF | 両方ON |
| 洗脳 | 即時洗脳／銃なし接触洗脳 | ON／OFF | 両方OFF |
| 洗脳 | NPC完了状態比率 | G／N／Hの整数%、合計100 | 45／45／10 |
| 学校 | 荒れ度 | 0～10の整数。0は全室normal | 2 |
| 学校 | Player開始地点 | ランダムまたは承認済み11地点 | ランダム |

開始地点11件は、1階玄関、体育館中央、体育館舞台上、2～4階普通教室、2階トイレ、2階生徒会室、3階美術室、4階音楽室、屋上プール西側階段付近とし、資産の正式IDを表示名へ対応付ける。座標や名前suffixから推測しない。

V2専用キーに保存されたversionなし、version 1以外の値はsnapshot全体を既定値へ戻す。version 1内の型不正・範囲外・不正参照は項目単位で正規化し、未知fieldを削除したcanonical formを即時再保存する。V1保存キーまたは旧V2試作値からの互換読込、移行、暗黙fallbackは追加しない。

通常モードには全設定リセット、即時公開処刑モードには公開処刑設定だけのリセットを置く。開始モード自体はlocalStorageへ保存せず、アプリ起動時は常に通常モード、同一アプリ内のタイトル復帰時だけ直前モードを保持する。

## 機能・開始モード契約

- ユーザーが切り替えられるV2機能はMissionとAlarmだけとする。Missionは既定ON、Alarmは既定OFF。
- Mission OFFではプレイヤー通常・状況Mission、NPC Mission、20秒scheduler、HUD、marker、結果集計を生成しない。放送の移動命令とFollow／Leaveは維持する。
- Alarm OFFではAlarm床の表示、発動判定、通知、強制追跡を含む機能全体を生成・実行しない。
- ミニマップ、校内放送、残存1～6人が各1秒blockedで成立する早期自動公開処刑は常時有効とし、設定項目を作らない。
- 全human洗脳済み後3秒で集合・epilogueへ進む終了は早期自動公開処刑と別経路であり、常時有効とする。

即時公開処刑は次の5方式を固定する。

1. Player対象／BIT射手
2. Player対象／NPC射手
3. NPC対象／BIT射手
4. NPC対象／NPC射手
5. NPC対象／Player射手

既定方式はPlayer対象／BIT射手、対象NPC 0、周囲NPC 11、周囲BIT 10とする。中心対象は最大6、周囲NPCは0～99、周囲BITは0～50。会場は新規開始ごとに専用の決定的乱数系列で校庭または体育館から選び、scenario開始後は固定する。Rによる同一scenario再演では方式・会場・対象構成を維持する。

## タイトル・終了状態契約

- 広い画面ではV1相当として中央へタイトル、開始状態、モードを置き、右側へ設定群、右下へ独立したversion表示、固定学校表示を置く。
- Player洗脳後もG／N／H操作を継続可能にし、Rは同じ設定snapshotから新seedで通常sessionを再生成する。開始地点、荒れvariant、Character割当、NPC／BIT配置は新seedで再抽選する。
- 通常ゲームオーバーでEnterはepilogueへ進む。全human洗脳済みは3秒後に自動epilogueへ進む。
- 即時公開処刑完了時のRは同じscenario・会場を再演し、epilogueまたは公開処刑完了時のEnterはタイトルへ戻る。
- タイトル復帰ではPointer Lock解除、入力停止、Mission／ミニマップ／HUD停止、Audio停止、動的session破棄の順序を単一状態遷移へ固定する。

## 小画面・リサイズ契約

- タイトルrootは`100dvw`／`100dvh`、`box-sizing: border-box`、`env(safe-area-inset-*)`と`clamp(8px, 2vmin, 16px)`を使う全画面gridとする。
- 基準点は中央、左上、右上、左下、右下の5箇所とする。中央はタイトル／開始モード、左上は固定学校表示、右上は警告・保存状態、左下は音量等の補助設定、右下は操作列と独立version表示へ割り当てる。
- 広い画面では設定viewportを右端の安全余白内へ置き、上部警告と右下versionの間だけを使用する。中程度では設定groupを複数列へ折り返す。狭い画面では中央タイトルを上部へ移し、設定を下部全幅の積層領域へ移す。
- 適応順は、余白・gap縮小、設定group折り返し、文字を最低12pxまで縮小、設定領域だけの縦scroll有効化とする。項目を非表示にせず、labelは複数行を許可し、固定widthと不要な`min-width`を除去する。操作対象の最小高さは32pxとする。
- CSSの幅・高さ条件に加え、設定表示、開始モード切替、文字折り返し後の実寸を`ResizeObserver`で監視し、`wide`、`compact`、`stacked`のclassだけを切り替える。resizeのためにDOMまたはformを再生成しない。
- 入力値、開始モード、選択状態、focusをresize前後で維持する。設定viewportはwheel、trackpad、Tab／Shift+Tabで末尾まで到達でき、画面全体には横scrollを発生させない。
- 通常対応の最小基準を640×480とする。480×360は縮退表示として、全設定が設定viewportの縦scrollで操作可能であることまで保証する。

## 静的・動的資源契約

- アプリ所有の静的資源は、1つのBabylon `Scene`、学校GLB `AssetContainer`、作者Mesh／Material／Texture、不変Location registry、人間用NavMesh、Room Variant NavMesh bundle、BIT NavMesh bundle、catalog fingerprintとする。
- session所有の動的資源は、選択room variantとactive set、Player、NPC、BIT、扉、エレベーター、Mission、開始地点、乱数系列、timer、予約、HUD、入力、Audio bridge、observer／subscriptionとする。
- 同じcatalog fingerprintでは静的identityを維持し、タイトル復帰、R再演、通常再開始で動的状態だけを破棄・再生成する。
- catalog fingerprint変更時は動的状態、静的資源の順に破棄して再読込する。アプリ終了時も同じ順で各1回だけ破棄する。
- session構築失敗時は途中まで作成した動的資源だけを破棄し、有効な静的資源を保持してタイトルへエラー表示する。旧session値、座標、欠落資源へのfallbackは追加しない。

## 後続所有

- T06-6Aは`V2TitleSettings`、V2専用保存キー、schema version 1、正規化、保存、通常モードの全設定reset、固定学校UI、基本設定、折り返し可能なsemantic group、Runtime不変snapshotを所有する。
- T06-6Bは通常／即時公開処刑、5方式、Mission／Alarmの2切替だけを所有する。反射、ミニマップ、放送、早期自動公開処刑の設定を追加しない。
- T06-6CはV1相当タイトル、5基準点grid、`ResizeObserver`、compact／stacked／scroll、ゲームオーバー、R／Enter、終了順を所有する。
- T06-6Dは静的／動的interface、再利用、再初期化、catalog変更、最終破棄だけを所有する。
- 共有ファイル競合を避けるためT06-6A → T06-6B → T06-6C → T06-6Dを直列実装する。

## 代表受入

- 既定通常: NPC 50、初期洗脳済み20%、BIT最大25、荒れ度2、Mission ON、Alarm OFF。
- 最大安定性: NPC 99、BIT最大50。120秒完走、診断0件、保持リーク0件、固定baseline比5%以内を判定し、60fps条件とは分離する。
- 即時公開処刑: 5方式すべて、中心対象0～6、周囲NPC 0／11／99、周囲BIT 0／10／50、校庭／体育館、R再演、Enterタイトル復帰。
- 保存: V1キー不変、V2専用キーだけの読書き、version不一致全reset、version 1項目別正規化、未知field除去、再起動、通常全reset、公開処刑部分reset。
- 表示: 1920×1080、1280×720、1024×600、800×600、640×480、480×360。1920→1024→640→1280の連続resizeで値・focus・モード・隅基準を維持する。

## ステップ

- [x] I3の負荷判断を記録し、T06-5とV3Bを省略する
- [x] V1／V2設定、開始地点、公開処刑、Mission、Alarmを監査する
- [x] `V2TitleSettings`の型、範囲、既定値、V2専用保存、resetを確定する
- [x] タイトル、ゲームオーバー、R再演、Enterタイトル復帰を確定する
- [x] 小画面・resize時の基準点、折り返し、縮小、scroll契約を確定する
- [x] 静的学校資源と動的session状態の所有・破棄順を確定する
- [x] T06-6A～DとT07の所有・代表受入へ引き渡す

## 結果

I3の不採用判断とT06-5省略を吸収し、タイトル設定、2機能切替、5方式の即時公開処刑、V1相当終了導線、V1から完全分離したV2専用保存、小画面対応、静的学校資源再利用を実装判断不要の契約として確定した。V2の視点高さ既定値は1.20とした。I4では文書だけを変更し、コード、CSS、画像、音声、学校資産、生成器、commit、push、Pull Request、レビュー、mergeは実施していない。
