# HAIGURE SURVIVAL v2 T06-6B 開始モード・Mission／Alarm 計画

更新日: 2026-08-23

## プロンプト

> 通常モードとV1相当のいきなり公開処刑を用意し、ON／OFFはMissionとAlarmだけにしてください。ミニマップ、校内放送、早期自動公開処刑は常時有効で、反射設定は追加しないでください。

2026-08-23 実装開始指示:

> PLEASE IMPLEMENT THIS PLAN:
>
> # T06-6B「開始モード・Mission／Alarm」実装計画
>
> - T06-6AがPR #79で統合済みの最新`origin/develop`から`codex/v2-title-modes`と専用worktreeを作成し、既存の未追跡差分を保持する。
> - `V2TitleSettings`へMission／Alarmと5方式の即時公開処刑設定をschema version 1のcanonical fieldとして追加し、開始モードだけは保存から分離する。
> - 通常／即時公開処刑の開始snapshot、決定的な校庭／体育館、方式別roleと人数、R再演、公開処刑設定だけのresetを実装する。
> - Mission OFFではMission Runtime、scheduler、HUD、marker、結果集計を生成せず、放送、Follow／Leave、Location registryは維持する。Alarm OFFではAlarm床、判定、通知、強制追跡を生成・実行しない。ミニマップ、放送、早期自動公開処刑、全human洗脳済み終了は常時有効とする。
> - T06-6B専用fixture、T05／T06／T06-4／T06-6A回帰、通常Web／Electron、テキスト配布検査を完了し、T06-6B差分だけをcommitする。push、Pull Request、レビュー、merge、worktree整理は行わない。

2026-08-23 追補指示:

> - 「プレイヤーをビットが処刑」「NPCをビットが処刑」では、現在と同じ高度を維持し、V1同様に対象者を中心とする円陣へビットを等間隔配置して、ビットをプレイヤーへ向ける。
> - タイトル画面はNPC、VOICE、BGM、SEを除く英語表記を日本語化し、ゲーム中のMission表示も「ミッション」へ変更する。
> - 「学校3Dサバイバル基盤」「通常モード」を「サバイバルモード」へ変更する。
> - モード切替ボタンを黄色／赤の押せる外観とし、hover時の色変更を追加する。
> - タイトル設定項目の文字を1px拡大し、入力欄、ボタン、配置も合わせて調整する。
> - `MUTE`は英語表記のまま維持する。
> - タイトルのバージョン表示を`ver.2.0.0`にする。

## 目的

T06-6AのV2専用`V2TitleSettings` snapshotへ即時公開処刑設定、Mission、Alarmを追加し、通常開始と5方式の直接開始を同じ明示契約へ接続する。

## 開始条件

- [x] T06-6Aが独立レビュー後にPR #79で`develop=0416bb72d49b68e3c46f08611fd1ed301afae924`へ統合済みである。
- [x] 共有`develop`の未追跡`docs/plans/skills/`と`scripts/v2/__pycache__/`を変更せず、`codex/v2-title-modes`の専用worktreeを最新`origin/develop`から作成した。

## 公開契約

- 開始モードは`normal`／`instant-public-execution`のアプリ内状態とし、localStorageへ保存しない。アプリ起動時は`normal`、同一アプリ内のタイトル復帰時は直前モードを維持する。
- V2独立schema version 1へMission有効（既定ON）、Alarm有効（既定OFF）、公開処刑方式、対象NPC数0～6、周囲NPC数0～99、周囲BIT数0～50を保存する。
- 5方式はPlayer対象／BIT射手、Player対象／NPC射手、NPC対象／BIT射手、NPC対象／NPC射手、NPC対象／Player射手。既定はPlayer対象／BIT射手、対象NPC 0、周囲NPC 11、周囲BIT 10。
- 新規開始時に専用乱数系列で校庭／体育館を決定し、scenario snapshotへ固定する。R再演は同じ方式、会場、対象構成を再利用する。
- 公開処刑設定resetは公開処刑方式と3人数だけを既定値へ戻し、基本設定、Mission、Alarmを変更しない。

## 機能切替

- Mission OFFはプレイヤー通常・状況Mission、NPC Mission、scheduler、HUD、marker、結果集計を生成しない。放送の移動命令、Follow／Leave、Location registryは維持する。
- Alarm OFFはAlarm床表示、発動判定、通知、強制追跡を含むAlarm subsystem全体を生成しない。
- ミニマップ、校内放送、早期自動公開処刑、全human洗脳済み終了は常時有効。汎用feature flagや反射設定は追加しない。
- 残存1～6人が全員blockedの状態を1秒維持した早期自動公開処刑と、全human洗脳済み後3秒の集合・epilogueは別phaseとして維持する。

## 対象外

- T06-6Aの保存基盤・基本groupの作り直し、最終responsive配置、ゲームオーバー演出、静的資源分離。
- ミニマップ、放送、早期自動公開処刑、鏡面反射のON／OFF。
- 学校資産、公開処刑会場座標、Location内容の変更。

## 検証

- 5方式、人数の0／既定／最大、校庭／体育館決定性、R再演、公開処刑設定resetをfixture化する。
- Mission ON／OFFとAlarm ON／OFFの4組合せで、生成資源、scheduler、HUD、interaction、追跡、破棄を確認する。
- 常時有効3機能が設定値を持たず、OFF機能が裏で更新されず、通常Web／Electronでconsole warning・error 0件であることを確認する。

## ステップ

- [x] 開始モードのアプリ内状態と公開処刑用V2 fieldを実装する
- [x] 5方式、人数、会場snapshot、R再演を接続する
- [x] Mission／AlarmだけのON／OFFをRuntime生成・破棄へ接続する
- [x] 公開処刑設定resetと組合せfixtureを追加する
- [x] V3C対象回帰、typecheck、build、Web／Electronを完了する
- [x] 結果を更新してT06-6B差分だけをcommitする
- [x] BIT方式をV1相当の対象中心円陣とプレイヤー向きへ変更する
- [x] タイトル画面とゲーム中ミッション表示を指定どおり日本語化する
- [x] モード切替ボタンの状態別配色とタイトル設定UIの1px拡大を行う
- [x] 追補fixture、実Web／Electron、回帰、配布検査を完了して追補結果をcommitする

## 結果

`origin/develop=0416bb72d49b68e3c46f08611fd1ed301afae924`をbaseとする専用worktreeで、次を完了した。

- V2 schema version 1へMission／Alarmと即時公開処刑4項目を統合し、方式別上限をcanonical正規化した。開始モードは非保存のアプリ内状態とし、通常resetと公開処刑設定resetを分離した。
- deep-frozenな`V2SessionStartSnapshot`へ保存設定、人口、決定的な会場と5方式のrole構成を固定した。即時開始とR再演を同じscenarioへ接続し、NPC 99／BIT 50／中心対象6／会場100人の上限を維持した。
- Mission OFF時はMission Runtime、scheduler、HUD、marker、結果集計を生成せず、独立放送Runtimeで3放送と集合会場を維持した。Alarm OFF時は候補provider、Alarm System、床表示、更新、通知音、NPC強制追跡を生成・実行しない構成へ変更した。
- T06-6B fixtureは13/13、T06-6A回帰は12/12、T06回帰は70/70、T06-4回帰は37/37、T05回帰は322/322を実ブラウザでPASSし、各fixtureのconsole warning／errorは0件だった。
- 実Web画面で通常／即時公開処刑の右側切替、ステージ・音量表示、開始、R再演を確認した。Electronでは5方式、同一scenario再演、Mission／Alarm 4組合せをPASSし、console／load／process異常は0件だった。
- `audit:v2:dependencies`、関連typecheck、T05／T06／T06-4／T06-6A／T06-6B build、通常renderer／Electron build、Web配布監査をPASSした。
- `verify-text-delivery.ps1 -Repository`、`git diff --check`、UTF-8（BOMなし）、ローカル絶対パス0件、学校バイナリ／NavMesh／生成器差分0件を確認した。
- 視点高さ既定値1.15を維持し、V1保存キーの読込・変更・削除、旧schema互換、汎用feature flag、反射設定は追加していない。
- 追補対応として、BIT射手を対象群の中心を基準とする単一円周へ等角度で配置し、既存の高度を維持したまま全BITをプレイヤーへ向けた。NPC対象時はプレイヤー視線方向へ12度の観覧gapを維持した。
- タイトル画面をNPC、VOICE、BGM、SE、MUTE以外は指定どおり日本語化し、ゲーム中のMission見出しも「ミッション」「ミッション結果」へ変更した。モード表示は「サバイバルモード」、バージョン表示は`ver.2.0.0`とした。
- モード切替ボタンを通常画面では赤、即時公開処刑画面では黄とし、hover／activeの配色、移動、shadowを追加した。設定見出しと項目文字を各1px拡大し、入力欄、ボタン、左右panel幅を調整した。
- 追補後のT05 fixtureは323/323、T06-4は37/37、T06-6Aは12/12、T06-6Bは13/13を実ブラウザでPASSし、console warning／errorは0件だった。実タイトルで日本語表示、MUTE、`ver.2.0.0`、赤／黄切替を確認した。
- 追補後のElectron受入で通常タイトル、5方式、R再演、Mission／Alarm 4組合せをPASSし、console／load／process異常は0件だった。通常build、V2依存監査、Web配布監査、テキスト配布検査、`git diff --check`もPASSし、バイナリ、学校資産、NavMesh、生成器、ローカル絶対パスの追加は0件だった。
