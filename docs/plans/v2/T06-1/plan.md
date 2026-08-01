# HAIGURE SURVIVAL v2 T06-1 通常ゲームRuntime接続 計画

更新日: 2026-08-01

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

## 完了条件

- 通常ゲームでF／E／C・G／N／Hと候補表示が既存Runtime APIを通して動作する。
- 通常ゲームの既定荒れ状態2、状態別挙動・案内・VOICE、水中速度50%が成立する。
- Pointer Lock、タイトル復帰、再読込後も入力・UI・Audio購読の重複が0件である。
- 学校バイナリ、生成器、全NavMesh、カタログhash、`src/world/**`の差分が0件である。
- 型検査、build、fixture、実ブラウザ、Electronに合格する。

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
