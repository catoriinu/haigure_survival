# HAIGURE SURVIVAL v2 T06-6B 開始モード・Mission／Alarm 計画

更新日: 2026-08-23

## プロンプト

> 通常モードとV1相当のいきなり公開処刑を用意し、ON／OFFはMissionとAlarmだけにしてください。ミニマップ、校内放送、早期自動公開処刑は常時有効で、反射設定は追加しないでください。

## 目的

T06-6AのV2専用`V2TitleSettings` snapshotへ即時公開処刑設定、Mission、Alarmを追加し、通常開始と5方式の直接開始を同じ明示契約へ接続する。

## 開始条件

- T06-6Aが独立レビュー後に`develop`へ統合済みである。
- `codex/v2-title-modes`の専用worktreeを最新`origin/develop`から作成する。

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

- [ ] 開始モードのアプリ内状態と公開処刑用V2 fieldを実装する
- [ ] 5方式、人数、会場snapshot、R再演を接続する
- [ ] Mission／AlarmだけのON／OFFをRuntime生成・破棄へ接続する
- [ ] 公開処刑設定resetと組合せfixtureを追加する
- [ ] V3C対象回帰、typecheck、build、Web／Electronを完了する
- [ ] 結果を更新してT06-6B差分だけをcommitする

## 結果

未着手。T06-6Aの`develop`統合後に開始する。
