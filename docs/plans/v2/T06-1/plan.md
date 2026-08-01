# HAIGURE SURVIVAL v2 T06-1 通常ゲームRuntime接続 計画

更新日: 2026-08-01

## プロンプト

> 荒れ版教室配置の相談と同時並行で、次の機能的な改善・作成へ進みたい。安全に並行できる機能タスクを過去のプランと現行実装から整理する。

## 目的

既に実装済みの入力・状態・NPC指示・扉・学校動的Runtime APIを、学校バイナリへ触れず通常ゲーム入口へ接続する。F／E／C・G／N／H、候補表示、既定荒れ状態2、音声、水中速度50%、開始・破棄ライフサイクルを実プレイで成立させる。

## 対象外

- Blender正本、GLB、静的人間用NavMesh、Room Variant NavMesh、BIT用NavMesh、生成器、資産監査器、`src/world/stageCatalog.ts`の変更。
- 複数`MRK_PlayerSpawn_*`、`VOL_PlayerSpawnExclusion_*`、追加`npc_spawn`／`bit_spawn` Volumeの資産化。
- 時間増援と開始地点に追従する出現禁止の最終統合。これらはT06-2が担当する。
- 荒れ版教室の見た目・配置変更、タイトル画面の荒れ状態スライダー、T07性能最適化。

## 依存と開始条件

- Wave 0Gの計画Pull Requestが`develop`へ統合済みであること。
- PR #59～#61を含む最新`origin/develop`から専用branch／worktreeを作ること。
- B03-3Dの完了は開始条件ではない。ただし同時実行時はファイル所有を厳守する。

## ファイル所有

- 主担当: `src/v2/main.ts`、通常ゲーム入口に必要な`src/v2/**`、操作表示・音声接続に必要な`src/ui/**`・`src/audio/**`、T06-1専用fixture・設定、本計画。
- 共有変更が必要な場合はT06-1内でRuntime API利用側へ寄せ、`src/world/**`は変更しない。
- 編集禁止: 学校Blender正本、GLB、全NavMesh、学校生成器・監査器、`src/world/stageCatalog.ts`、B03-3D計画、全体計画。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-t06-runtime-core`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- 理由: 通常ゲームのframe更新、Pointer Lock、UI、状態遷移、音声、水中、破棄・再読込を同じライフサイクルで接続し、既存APIの重複実装を避ける必要があるため。
- 並行可否: B03-3Dと並行可能。T06-2とT07は開始しない。

## ステップ

- [ ] 最新`develop`とT04-3B、T05-2／T05-3の結果を読み、通常ゲーム入口で未接続のAPIと既存UI・音声経路を棚卸しする
- [ ] 毎frameで`drainPressedActions()`を一度だけ消費し、F／Eを既存NPC候補と`requestNpcCommand()`、Cを既存扉候補と`requestDoorToggle()`へ配送する
- [ ] G／N／Hを既存`selectPlayerCompletion()`へ接続し、解放前・`playing`終了後は無効、選択解放後は連続再選択可能とする
- [ ] NPC／扉候補の中央優先highlightとF／E／C prompt、G／N／H案内、G状態だけの照準・左クリック案内を同期する
- [ ] 通常ゲームの`roomDisorderLevel`を2へ接続し、同一seedの決定性、テスト注入0／10、全normal固定経路の廃止を検証する
- [ ] G／Nの移動、Hの移動停止、G射撃、N接触妨害、状態別表示とVOICEを既存Runtimeへ接続する
- [ ] `VOL_PoolWater`内だけ水平速度50%とし、退出・再配置・タイトル復帰・再読込で通常速度へ戻す
- [ ] BGM・SE・VOICEと既存音量設定・ミュートをV2学校入口へ接続し、多重再生と購読残留を防ぐ
- [ ] reset、blur、Pointer Lock解除、タイトル復帰、再読込、disposeでaction、UI、Audio、購読が残留しないことを検証する
- [ ] 型検査、build、T04／T05回帰、T06-1 fixture、実ブラウザ、Electronで入力・UI・Pointer Lock・音声・水中・再読込を確認する
- [ ] 結果を本計画へ記録し、実装・検証・commit・push・Pull Request作成まで行う。レビュー、merge、worktree整理は別タスクとする

## 完了条件

- 通常ゲームでF／E／C・G／N／Hと候補表示が既存Runtime APIを通して動作する。
- 通常ゲームの既定荒れ状態2、状態別挙動・案内・VOICE、水中速度50%が成立する。
- Pointer Lock、タイトル復帰、再読込後も入力・UI・Audio購読の重複が0件である。
- 学校バイナリ、生成器、全NavMesh、カタログhash、`src/world/**`の差分が0件である。
- 型検査、build、fixture、実ブラウザ、Electronに合格する。

## 次タスク開始用プロンプト

> Wave 0Gが`develop`へマージ済みの最新`origin/develop`から、`codex/v2-t06-runtime-core`と専用worktreeを作成してT06-1を実装してください。通常ゲーム入口で既存の`drainPressedActions()`、`requestNpcCommand()`、`requestDoorToggle()`、`selectPlayerCompletion()`を接続し、F／E／C・G／N／H、候補highlight・prompt、既定荒れ状態2、状態別案内・VOICE、プール内水平速度50%、BGM・SE・VOICE、開始・破棄ライフサイクルを実プレイで成立させてください。学校Blender正本、GLB、全NavMesh、生成器、監査器、`src/world/stageCatalog.ts`、`src/world/**`は変更しないでください。複数開始地点、追加出現Volume、時間増援はT06-2へ残してください。実装・検証・commit・push・Pull Request作成までを対象とし、レビューとmergeは行わないでください。GPT-5.6 Sol / Ultraを使用してください。

## 結果

未着手。Wave 0Gでは現行入力収集・状態選択・NPC指示・扉APIが存在し、通常ゲーム入口で未消費であることを確認した。学校資産を編集しないため、B03-3Dと並行できる。
