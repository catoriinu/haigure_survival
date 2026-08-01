# HAIGURE SURVIVAL v2 T06-2 学校最終統合 計画

更新日: 2026-08-01

## プロンプト

> 通常版と荒れ版の教室配置、PR #59につながる学校Runtime修正、次の機能タスクを一度`develop`で統合し、その後の安全な作業順を整理する。

## 目的

B03-3DとT06-1を含む最新`develop`を入力とし、学校資産と通常ゲームRuntimeを一つの専用branchで最終統合する。複数開始地点、選択地点に追従する敵出現禁止、NPC／BIT出現Volume、BIT時間増援、既定荒れ状態2、ゲーム進行、破棄・再読込を接続し、V3最終機能ゲートを完了する。

## 対象外

- 荒れ版配置の再設計。B03-3D承認済み成果を入力として使用する。
- T07の99 NPC／50 BIT定量性能最適化、最終仕様書監査、リリース準備。
- タイトル画面の荒れ状態スライダー。
- 外周BIT飛行帯・外周BIT経路・外周スポーンの追加。

## 依存と開始条件

- B03-3DとT06-1の各Pull Requestが独立レビューを終え、両方とも`develop`へマージ済みであること。
- 最新`origin/develop`から専用branch／worktreeを作り、未マージbranchから派生しないこと。
- 資産実装前に、全開始候補の俯瞰画像、抽選方式、各`VOL_PlayerSpawnExclusion_*`寸法、NPC／BIT出現Volume範囲を提示し、ユーザー承認を得ること。

## ファイル所有

- 単一担当: 学校生成正本・監査器、Blender正本、GLB、静的人間用NavMesh、Room Variant NavMesh、BIT用NavMesh、`src/world/stageCatalog.ts`のhash、開始・出現選択Runtime、通常ゲーム入口、T06-2 fixture、本計画。
- T06-2実行中は学校バイナリと生成器を他branchから同時編集しない。
- 全体計画の結果更新は統合段階で単一担当が行う。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-t06-school-integration`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- 理由: Blender意味Object、3種NavMesh、開始・出現抽選、通常ゲーム進行、時間増援、入力・音声・水中、資源ライフサイクルを同じseedとE2Eで横断するため。
- 並行可否: 単独。T07はT06-2の`develop`統合後に開始する。

## ステップ

- [ ] B03-3DとT06-1を含む最新`develop`、資産・Runtime仕様、各結果を監査する
- [ ] 最低候補として1階玄関、体育館中央、舞台演説台裏、2～4階普通教室を含む開始候補一覧を作り、安全なトイレ・特別室・屋上プールサイド候補も評価する
- [ ] 全候補の俯瞰画像、抽選方式、対応する出現禁止Volume寸法、NPC／BIT出現Volume範囲を提示し、ユーザー承認を得る
- [ ] 承認済みの向き付き`MRK_PlayerSpawn_*`と同suffixの`VOL_PlayerSpawnExclusion_*`を資産化する
- [ ] 人間用NavMesh上の`npc_spawn`と、到達可能な各BIT飛行帯を面積で覆う`bit_spawn` Volumeを資産化する
- [ ] 同一seedで開始地点・向き・初期NPC／BITを再現し、選択中の除外Volumeだけを初期洗脳済みNPCとBITへ適用する
- [ ] 初期洗脳済みNPCを除外範囲外で先に、未洗脳NPCを残候補から生成し、必要数とNPC間最小距離を満たす。候補不足時は厳格エラーとする
- [ ] 通常BITを初期数・出現間隔・最大数の必須設定へ統一し、Alertを同じ最大数へ含め、カーペット僚機を除外する
- [ ] 停止中、タイトル、公開処刑中、破棄後は増援せず、再読込でseed、timer、個体数を初期化する
- [ ] B03-3D荒れ版、T06-1入力・UI・音声・水中と、扉・エレベーター・Follower・光線・世界境界を通常ゲームへ統合する
- [ ] 資産監査、3種NavMesh二重生成、型検査、全build、T02～T06 fixture、通常Web、Electron、破棄・再読込を検証する
- [ ] Pull Request作成後、独立レビューとV3最終機能ゲートで、タイトル開始から終了・タイトル復帰・再読込まで完全E2Eを確認する
- [ ] 実装・検証・commit・push・Pull Request作成までを本タスクとし、レビュー、merge、worktree整理を別タスクで行う

## 完了条件

- 承認済み開始候補・出現禁止・NPC／BIT出現Volumeが資産とRuntimeで一致する。
- 同一seedの開始・出現が再現可能で、選択開始地点周囲の敵出現が0件である。
- 通常BIT時間増援、最大数、停止・破棄条件が成立する。
- 既定荒れ状態2を含む全学校機能が通常ゲームで接続される。
- V3最終機能ゲートのWeb・Electron完全E2Eと資源残留0件を満たす。

## 次タスク開始用プロンプト

> B03-3DとT06-1が独立レビュー後に`develop`へマージ済みの最新`origin/develop`から、`codex/v2-t06-school-integration`と専用worktreeを作成してT06-2を開始してください。資産編集前に、全`MRK_PlayerSpawn_*`候補の俯瞰画像、抽選方式、各`VOL_PlayerSpawnExclusion_*`寸法、`npc_spawn`／`bit_spawn` Volume範囲を提示し、私の承認を得てください。承認後、学校資産を単一担当で更新し、複数開始地点、動的出現禁止、NPC／BIT出現、BIT時間増援、B03-3D荒れ版、T06-1入力・音声・水中、扉・エレベーター・Follower、世界境界を通常ゲームへ統合してください。V3最終機能ゲート、実装・検証・commit・push・Pull Request作成までを対象とし、レビューとmerge、T07は行わないでください。GPT-5.6 Sol / Ultraを使用してください。

## 結果

未着手。Wave 0GではB03-3DとT06-1の両方を`develop`へ統合してから開始する直列ゲートと、資産実装前のユーザー承認事項を確定した。
