# HAIGURE SURVIVAL v2 T06-6A タイトル基本設定・永続化 計画

更新日: 2026-08-23

## プロンプト

> V1相当の人数・音量・表示設定と、V2の人口、BIT、荒れ度、開始地点をタイトルから変更できるようにしてください。V1との保存互換は設けず、V2専用の保存領域を使用し、実行中は不変snapshotを使用してください。視点高さの既定値は1.20としてください。

## 目的

I4で確定した基本設定を`V2TitleSettings`へ統一し、V1から独立した保存、正規化、全設定reset、タイトルUI、Runtime開始snapshotまで実装する。開始モード、即時公開処刑、Mission／Alarm、最終レイアウトは後続へ分離する。

## 開始条件

- I4文書が独立レビュー後に`develop`へ統合済みである。
- `codex/v2-title-settings`の専用worktreeを最新`origin/develop`から作成する。

## 公開契約

- 保存rootはV2独立schemaの`version: 1`と、NPC人数0～99、初期洗脳済み率0～100、Player初期洗脳済み、BIT無効化、BIT増援間隔1～99秒、BIT最大数1～50、BGM／SE／VOICE各0～10、視点高さ0.50～1.50（既定1.20）、地面影、縦方向Character表示、即時洗脳、銃なし接触洗脳、NPC完了G／N／H比率、荒れ度0～10、開始地点選択、既存Character／VOICE選択を持つ。
- 初期洗脳済み人数は`floor(npcCount * percent / 100)`とする。BIT無効時は初期数・増援とも0、有効時の初期数は固定1。G／N／H比率は整数かつ合計100を必須とする。
- 開始地点は`random`または`src/v2/schoolSpawnSelection.ts`の承認済み11 IDだけを許可し、Runtimeへ正式IDを渡す。
- 保存キーはV2専用の`haigure-survival-v2.title-settings`とする。既存の`V2_TITLE_SETTINGS_STORAGE_KEY`もこの値へ置き換え、V1キー`haigure-survival.title-settings`は読込、移行、上書き、削除しない。V2キー内のversion不一致は全体既定値、version 1内の不正fieldは項目別正規化、未知fieldは削除し、canonical JSONを即時再保存する。
- RuntimeはlocalStorageを直接読まず、タイトル開始時にdeep freezeしたsnapshotを必須入力として受け取る。タイトル変更は実行中sessionへ反映しない。

## UI・所有範囲

- 固定学校表示、人口、BIT、音量、表示、洗脳、荒れ度、開始地点、Characterのsemantic groupを作る。stage selectorは作らない。
- groupはDOM上で独立sectionとし、labelの複数行、`min-width: 0`、可変列へ対応させる。絶対配置と最終breakpointはT06-6Cが所有する。
- 通常モードの全設定resetを実装する。即時公開処刑設定だけのresetはT06-6Bが追加する。
- `brainwashOnNoGunTouch`はT06-4のG／N一括変更契約へsnapshotから渡す。

## 対象外

- 開始モード、即時公開処刑、Mission／Alarm、ミニマップ、放送、早期自動公開処刑の設定。
- ゲームオーバー、R／Enter、最終responsive配置、静的学校資源再利用。
- V1保存値または旧V2試作値の互換読込・移行、暗黙fallback、学校資産・Location・NavMesh変更。

## 検証

- 境界値、視点高さ既定1.20、初期洗脳人数切り捨て、G／N／H合計、BIT無効化、承認済み11地点、version 1正規化、version不一致全reset、未知field削除をfixture化する。
- V1キーへsentinel値を保存した状態でV2の読込、変更、reset、再起動を行い、V1キーが一度も読まれず、値も変更・削除されないことをfixture化する。
- 変更ごとの保存、再起動、全設定reset、snapshot不変性、RuntimeのlocalStorage直接参照0件を確認する。
- 通常Web／ElectronでPointer Lockを奪わず全入力を操作でき、console warning・error 0件で開始できることを確認する。

## ステップ

- [ ] `V2TitleSettings`、schema version 1、既定値、正規化、V2専用canonical保存を実装する
- [ ] 基本設定のsemantic groupと固定学校表示を実装する
- [ ] 設定を不変開始snapshotとしてRuntimeへ接続する
- [ ] 全設定resetと保存・再起動fixtureを追加する
- [ ] typecheck、build、Web／Electron、既存T06回帰を完了する
- [ ] 結果を更新してT06-6A差分だけをcommitする

## 結果

未着手。I4の`develop`統合後に開始する。
