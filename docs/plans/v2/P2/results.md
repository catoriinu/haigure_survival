# P2 最終微修正整理 確認結果・引継ぎ

更新日: 2026-09-06

## 判定

**P2完了。受入保留0件、リリース必須修正0件。T07の受入上の開始条件は成立した。**

- 判断事項1（P2-V01／V02と残る入力・導線・設定復元の確認）は、2026-09-06のユーザー指定により「人間確認OK」として閉じた。
- AIによる実測PASS、既存受入証拠、人間確認OKの受入判断を区別する。AI側で入力確認が完了しなかった観測と技術的原因の未確定は記録を保持し、原因を解消済みと断定しない。
- T07へUI修正1件（P2-U01、起動長期化時の案内重複）と調査3件（P2-T01～03）を引き継ぐ。
- 文書不整合3件（P2-D01～03）は今回同期した。
- T07は未着手。P2文書は未コミットのため、後続作業木へ確定版を引き継ぐ。今回の依頼はcommitやT07実装の開始を含まない。

全面的な構造監査、機能修正、テスト変更、学校資産変更は行っていない。
## Git・統合・実行環境

| 項目 | 今回確認した状態 |
|---|---|
| 実cwd／Git root | 正本リポジトリのルート（`.`） |
| 開始branch | `develop` |
| HEAD／fetch後origin/develop | `c8769e32b1f7b8f739a9f8698db55237e5121075`、ahead／behind 0/0 |
| P2文書branch | `codex/v2-final-polish-plan`。正本作業木で文書だけを編集。追加worktreeなし |
| 開始時の既存差分 | tracked差分なし。`docs/plans/skills/blender-prevent-z-fighting/plan.md`と`scripts/v2/__pycache__/`内の3ファイルは未追跡のまま保持 |
| 既存worktree | 正本、Codex管理`1f46/fps_survival20251226`、`fps_survival20251226-pr81-responsive-review-fix`の3件。移動・削除なし |
| PR統合 | #78～#83はすべてMERGED。#83は2026-09-05 17:27:40 UTC（09-06 02:27:40 JST）にdevelopへ統合 |
| #83レビュー | 再試行listenerの1スレッドは修正返信あり、`isResolved=true`。今回の投稿・resolveなし |
| 実ゲームサーバー | 既存の[通常ゲーム](http://127.0.0.1:5175/)、port 5175、初回観測時のVite PID 32664、Codex管理worktreeから起動。再開時に同ポートで再起動 |
| 実行対象の一致 | 管理worktreeはclean、HEAD `1df255dd6ca7edd90d436f24ad693fcf7f233de8`。そのHEADと統合HEADの`git diff --stat`は空で、Git管理対象の内容は同一 |
| 素材 | 正本素材を参照する既存接続を使用。BGM、SE、VOICE、Character画像のHTTP 200と正しいContent-Typeを確認 |
| 今回のElectron | 管理worktreeの既存依存を利用。受入runnerと通常`electron .`の開発URL読込。配布用`file://`の新規build・再検証はしていない |

専用プロファイル付き`Start-Process`は自動承認レビューに「blocked by policy」と拒否され、実行されなかった。正本の既定受入コマンドは`electron`が見つからず終了した。依存導入や環境変更をせず、同一内容で依存が導入済みの管理worktreeから既定受入と`npm.cmd exec -- electron .`を実行した。これは製品の起動不具合とは数えない。

通常URLの`?seed=20260906`／runnerの`?seed=20260829`だけでは通常ゲームの乱数を固定しない。`src/v2/main.ts`の`fixedRuntimeSeed`は専用受入scenarioに基づくため、URL指定を固定seedの証拠に用いない。今回の通常操作はランダム開始として扱う。

## 既存証拠の採用と解消済み事項

| 証拠 | 記録された結果と今回の扱い |
|---|---|
| [T06-6D結果](../T06-6D/plan.md)、[PR #83](https://github.com/catoriinu/haigure_survival/pull/83) | T05 324/324、専用Electron 13/13、T06／T06-6B／T06-6C、通常build、配布監査PASS。今回すべてを再実行していない |
| #83再試行指摘 | Canvasへのアプリ寿命listenerと失敗注入受入で修正済み。未完了チェックや過去の指摘だけから再オープンしない |
| [T06-6A結果](../T06-6A/plan.md) | 保存正規化・V1分離・視点高さ1.15の契約、12/12とbuildの記録を採用。最大99 NPC／50 BITの120秒完走は過去の実績としてのみ採用 |
| [T06-6B結果](../T06-6B/plan.md) | 5方式の公開処刑、Mission／Alarm 4組合せ、修正後14/14を採用。今回の目視は代表方式に限定 |
| [T06-6C結果](../T06-6C/plan.md)、PR #81／#82 | 通常RはPlayer状態不問、Enterは直接タイトル復帰。6基準viewport・連続resize・境界修正の記録を採用 |
| [T06-4P-2結果](../T06-4P-2/plan.md)、PR #77 | 自律NPC自然利用待ちの180秒timeoutは後続の固定Location Missionによる実移動確認で解消済み。2回連続PASSの最終記録を採用 |
| [I3結果](../I3/plan.md)、[T07性能契約](../T07/plan.md) | 99 NPC／50 BITは120秒安定性上限。既定構成の60fpsとは別条件。今回の同時Web／Electron実行時間を性能baselineにしない |

過去のT05 323/324、配布物の改行hash不一致、自律NPCの自然到着待ちは、後発の修正・統合済み証拠と区別した。P1台帳の「必須」は受付時の分類であり、最新子計画の解消済み結果を無視して現在の必須残件へ転記しない。

## 今回の確認範囲

以下の表はAIが実際に確認した範囲と停止時点の観測記録である。表内の未確認・入力不成立はAI証拠の限界を示す。最終的な受入は、後述のユーザー指定による人間確認OKで閉じた。

| 対象 | 操作・条件 | 今回の結果 |
|---|---|---|
| Webタイトル | 1280×720でNPC50、洗脳済み20%、BIT最大25、荒れ度2、Mission ON／Alarm OFF、音量各5、Character・VOICE候補を表示 | 学校背景と設定を目視。保存済み視点高さ1.20は既定値と誤認せず、リセットで1.15を確認 |
| Web全reset | 全設定をリセットし、開始前設定反映の2行案内を表示 | 1.15へ復帰し、設定反映後に通常playingへ移行 |
| Web通常・R・Enter | NPC50で開始、Rによる再開始、Enterでタイトルへ復帰 | 通常playing、再開始後の別開始地点、タイトル表示まで確認。W入力だけでは実移動の成立を証明していない |
| Web学校・HUD | 4F 1年2組、1F体育館 | 黒板、机・椅子、壁・窓、Character、階別ミニマップ、NPC／BIT／光線、ミッション表示を目視。全校の再監査ではない |
| Web部分reset | 即時公開処刑へ切替、周囲NPC数を0へ変更して公開処刑設定のみreset | 方式Player対象／BIT、対象NPC0、周囲NPC11、周囲BIT10へ復帰。全resetとの区別を確認 |
| Web公開処刑 | 上記代表設定で開始、R、完了後Enter | 体育館`assembly-gym`、`execution-complete`、NPC11／BIT10、結果HUDを確認。R後も同会場・同構成で完了し、Enter後のタイトルで即時モードを保持 |
| Web機能切替 | 通常へ戻し、開始地点1階玄関、Mission OFF／Alarm ONで開始 | 設定値とNOW LOADINGまでは確認。停止後のplaying・Alarm実発動は未確認 |
| Webレスポンシブ | 初期1280×720と、可視パネルへの切替後の狭い表示 | 設定群の積層、scroll、末尾reset／モード切替の到達を確認。今回の6解像度厳密測定は省略し、既存証拠を採用 |
| Electron実ゲーム受入 | `npm.cmd run acceptance:t06-6d:game-flow:electron`を1回実行 | exit 0、PASS。既定タイトル→NPC1通常→R→Enter→設定変更→公開処刑→R→Enter→最終破棄。通常人口50の長時間受入とは区別 |
| Electron所有確認 | 上記runnerの実アプリ診断 | staticLoad／GLB parse各1、staticIdentity1、dynamic世代1～7を各1回破棄、baseline一致6／不一致0、終了後dynamic／human Nav／static bundle／BIT owner／Scene資源0 |
| 通常Electronタイトル・全reset | `electron .`で通常Web入口、NPC50の既定値。視点高さを1.35へ変更して全reset | 1.15へ戻り、再構築注記が解除されることを確認 |
| 通常Electron開始・学校 | NPC50、Mission ON／Alarm OFF、音量各5 | 2F女子トイレでplaying、正常状態、Character、階別Map、同行者／場所移動Mission、BIT増援を確認 |
| 通常Electron入力 | W／D、Canvasクリック、Enter | 観測中のPlayer座標`(0.200, 0.902, -10.125)`は変化せず、Enter後もplaying。入力配送、focus、Pointer Lockと製品原因の切り分け前に操作停止。P2-V02へ残す |
| 素材HTTP | BGM `研究所劇伴MP3.mp3`、SE `aim.mp3`、VOICE `01_devil/悪_110ハイグレ.wav`、Character `01_hgsv_mb/bw-complete-gun.png` | 全200、順に`audio/mpeg`、`audio/mpeg`、`audio/wav`、`image/png`。HTML fallbackではない |

AIが今回追加していない確認: 全fixture・全buildの一括再実行、Blender／NavMesh再生成・監査、5方式全組合せの再実行、最大構成120秒再測定、配布用Electron再build、全校歩行、全扉／エレベーター／Follow／同期射撃／放送の再回帰。関連機能は既存の最終証拠を採用し、P2で新たに必要となった残確認は最終の人間確認OKで閉じた。

## 問題・候補台帳

### P2-V01 Web Pointer Lock失敗（人間確認OKで受入終了）

最終状態: 2026-09-06のユーザー指定により受入OK。以下はAI観測時の記録であり、技術的原因の確定やAI再検証PASSを意味しない。

- 再現条件: Codex内ブラウザの通常Web、初期は非表示。全reset後の通常開始で2026-09-06 10:08:13 JST、公開処刑開始で10:11:16 JSTに各1件観測。
- 期待: 開始クリック後にCanvasのPointer Lockを取得し、視点操作できる。対応環境のconsole異常0。
- 実際: `UnknownError: If you see this error we have a bug. Please report this bug to chromium.`、次に`WrongDocumentError: The root document of this element is not valid for pointer lock.`。phase遷移、R、Enterは成立した。
- 根拠: 今回のWeb consoleログと上表の実画面。`src/v2/main.ts`の`requestCanvasPointerLock()`が取得失敗をconsoleへ報告する。可視表示へ切り替えて再開始を試したが、結果取得前に操作停止。
- 影響: Webの視点操作受入を合格にできない。非表示の埋込みブラウザ固有制約か、通常対応ブラウザでも起こる製品不具合かは未確定。エラーメッセージだけでどちらかに断定しない。
- 対象ファイル: `src/v2/main.ts`（Pointer Lockと開始処理）、`src/v2/playerInput.ts`（直接関連する入力）。現時点では調査対象で、変更承認を意味しない。
- 受入条件: 可視の通常対応ブラウザで同じ開始・R・Enter・再開始を行い、実Pointer Lock・視点操作とconsoleを確認。非表示環境限定なら制約として分離し、通常環境でも再現すれば専用必須修正へ昇格する。

### P2-V02 通常Electronの実入力未確認（人間確認OKで受入終了）

最終状態: 2026-09-06のユーザー指定により受入OK。以下はAI観測時の記録であり、技術的原因の確定やAI再検証PASSを意味しない。

- 再現条件: 通常`electron .`、既定NPC50、2F女子トイレ開始。別窓DevToolsを伴う開発起動。Computer UseでW／D、再クリック、Enterを入力。
- 期待: normal状態で実移動し、Enterは直接タイトルへ戻る。
- 実際: HUD座標は不変で、Enter後もplayingを観測。NPC・BIT・Mission更新は継続した。
- 根拠: 今回の通常Electron画面。対照となる既存runnerは同じソースを読み、`webContents.sendInputEvent`で通常R／Enterを含む指定遷移に今回PASSした。入力は`event.code`で処理し、blurでclearする実装である。
- 影響: focus、Pointer Lock、入力配送、短いキー入力とゲームframeの関係を未分離。通常Electron全体が入力不能とも、製品問題なしとも判定しない。
- 対象ファイル: `src/v2/playerInput.ts`、`src/v2/main.ts`、`electron/main.ts`。受入側は`validation/v2/T06-6D/gameFlowElectronAcceptance.cjs`。
- 受入条件: ゲームCanvasのfocusとPointer Lockを確認し、物理WASDの継続入力による位置変化、Enter、再開始を通常アプリで確認する。入力状態を区別した結果から製品不具合か検証環境制約かを分類する。

### P2-U01 長時間起動案内の文字重複（T07修正対象・ユーザー指定）

- 再現条件: 通常Electronの初期表示で15秒以上loadingが継続。今回33秒、`bootstrap-ready`時点に観測。
- 期待: 「読込継続中」、停止位置、経過時間が重ならず読める。
- 実際: 中央の読込継続中文字列と、長時間継続・停止位置・経過時間の文が同じ行で重なった。前面表示後、通常タイトルとゲーム開始には到達した。33秒を製品のcold load所要時間と断定しない。
- 根拠: 今回のElectron画面。`startupDiagnostics.ts`の`updateStalledStartupMessage()`は両要素を同時表示し、`style.css`では`#titleStartHint`と`#titleMessage`が同じGridセル、messageは`white-space: nowrap`である。
- 影響: 長期化時の診断文が読みにくい。今回、クラッシュ・保存破損・進行不能は生じていないため必須修正には分類しない。
- 対象ファイル: `src/v2/startupDiagnostics.ts`、`src/style.css`、必要なら`index.html`。学校資産は対象外。
- 受入条件: 15秒以上のloadingで案内・phase・経過時間を判読でき、通常loading、開始注記、失敗案内の表示を維持する。小画面でも案内へ到達できる。
- 引継ぎ: 2026-09-06の「２はT07で修正しましょう」により、T07の修正対象へ割り当てた。T07内で性能・構造改善とは実装単位を分け、上記の所有・受入条件で修正する。P2では実装しない。

### P2-T01 既定性能と最大安定性（T07調査）

- 条件／期待: [T07](../T07/plan.md)の1080p既定通常構成と99 NPC／50 BIT最大構成をそれぞれ満たす。
- 実際／根拠: I3の総frame p95 33.5ms／p99 34.0msと、T06-6Aの120秒完走は過去の実績。P2では負荷計測をしていない。
- 影響: 最新統合版のリリース性能は未判定。通常60fpsと最大構成の完走を混同しない。
- 対象: `src/v2/**`、直接関連する`src/world/**`、既存性能受入とT07文書。学校資産変更は別タスク。
- 受入: 開始10秒／定常60秒、最大120秒、CPU／GPU／AI／NavMesh／演出／UI／heapを分け、T07の数値条件で判断する。

### P2-T02 終了時GPUメッセージと寿命境界（T07調査）

- 条件／期待: Electron終了時に実ownerを解放し、稼働中エラー・renderer異常を発生させない。
- 実際: 今回の実ゲームrunnerは所有診断0とexit 0のPASS後、stderrへ`GPU state invalid after WaitForGetOffsetInRange.`を1件出力した。
- 根拠: 今回のrunner出力。T06-4P-2にも同じ終了後メッセージの記録がある。
- 影響: これだけをゲームの保持リークやクラッシュとは扱わない。終了時を含む完全な無警告を保証する証拠にもできない。
- 対象: `electron/main.ts`、`src/v2/main.ts`と寿命owner、既存Electron受入runner。
- 受入: 単独プロセス・同じ条件で稼働中／終了中／終了後のメッセージとprocess終了理由を分離する。問題を隠すログ抑制を最適化と扱わない。

### P2-T03 Astraによる構造・テスト整理（T07調査）

- 条件／期待: 調査と測定から、仕様不変のリファクタリング・軽量化・テスト整理を計画する。
- 実際／根拠: `main.ts`は通常起動と専用受入scenarioを持ち、通常URLのseedと実session seedは同義ではない。複数runnerはそれぞれ専用条件・人口・寿命検証を持つ。P2では重複や削除可能性を全面監査していない。
- 影響: 「同じ画面を開く」「同じPASS数」だけで受入を統合・削除すると契約の検証を失うおそれがある。今回はテストを変更していない。
- 対象: `src/v2/main.ts`、`validation/v2/T06-6A`～`T06-6D`、関連`validation/v2/T06`、`package.json`、T07計画。必要箇所を調査段階で絞る。
- 受入: 既存テストを契約・発火条件・失敗検出能力・所要時間へ対応付け、実測seed・人口・素材・解像度を記録する。廃止候補には同等の検出能力を示す。T06-6Dの静的identity、rollback、終了中非同期、最終owner解放の証拠を減らさない。

### P2-D01～03 文書不整合（今回同期）

| ID | 再現・実際 | 期待・影響・根拠 | 対象／受入 |
|---|---|---|---|
| P2-D01 | 全体計画のT06-6D、次タスク計画のT06-6A～Dが未チェック | PR #79～#83の統合状態を反映し、再実装を防ぐ | `docs/plan.md`、`next_tasks_plan.md`、`T06-6D/plan.md`、個別計画一覧。統合済みとP2完了・人間確認OKが矛盾しない |
| P2-D02 | I4が通常Enterをepilogue経由、右上に保存状態を置く旧契約を現在形で記載 | T06-6C後発契約ではPlayer状態不問の通常R／直接タイトル復帰、保存済みラベルは削除済み | `I4/plan.md`。後発契約と実装・今回の既存runner結果へ同期し、元依頼は履歴として保持 |
| P2-D03 | T07のSol／High指定と「性能・回帰だけ」の説明が今回のAstra構造・軽量化・テスト整理指示と未同期 | 調査・実施はT07、P2は候補の仕分けまで。意味不変・性能契約・既存証拠を維持 | 全体／次タスク／branch戦略／T07。Astra担当と受入上の開始条件成立・未着手を明記し、調査済みと誤記しない |

## 最終受入と引継ぎ

### 人間判断記録

2026-09-06、判断事項1は入力・残導線・保存復元の確認方法、判断事項2はP2-U01の修正先として提示した。当初「１は推奨案で」「２はT07で修正しましょう」と回答され、AI確認を再開した。

再開後はChromeの通常タイトル表示と、開始地点1階玄関・Mission OFF／Alarm ONへの設定変更を確認した。開始操作後の観測では長時間起動案内を表示し、Pointer Lock・実入力の最終結果は取得していない。その後、Computer Useが現在のブラウザURLを確実に識別できず、安全判定で操作を停止した。この再停止は物理Escによるものではない。

最終回答（原文）:

> じゃあもう１はいいです。人間が確認してOKしたということにしてください。

| 判断事項 | 最終決定 | 記録・扱い |
|---|---|---|
| 1: Web Pointer Lock、通常Electron実入力、残るreset・モード復帰・再開始・保存復元 | ユーザー指定により人間確認OKとして受入完了 | AI追加操作は終了。P2-V01／V02を含む保留を閉じる。人間の具体的な操作ログや計測値は提供されていないため、AIが確認した値として追加しない |
| 2: 起動長期化時の案内文字重複（P2-U01） | T07で修正 | startupDiagnostics・タイトルCSSを中心に、通常loading・失敗案内・開始注記と小画面の可読性を維持して修正する |

この最終指定は、判断事項1のAI継続確認・再開依頼と旧継続プロンプトを置き換える。受入保留0件、リリース必須修正0件としてP2を完了する。P2-V01／V02を未完了タスクとしてT07へ移さない。T07の最適化後に必要な機能回帰はT07の既定範囲に従う。

| 引継ぎ先 | 所有・依存 | 完了条件 |
|---|---|---|
| T07: P2-U01 | UI修正として独立した実装単位。上記台帳の対象ファイル・受入条件を使用 | 長時間起動時の案内が重ならず判読でき、他のタイトル案内を維持 |
| T07: P2-T01～03 | Astra担当。性能・終了時GPU・構造／テスト整理。最新統合版と今回の確定文書を開始時に確認 | T07計画の性能・安定性・契約維持・回帰・仕様同期を満たす |

必須修正タスクの追加は不要。今回の文書は未コミットであるため、後続作業木へ確定版を引き継ぐ。T07の調査・実装、commit、push、PR作成、mergeは今回開始していない。

## 操作停止時の環境・設定記録

- 最初の停止時は既存5175サーバーと通常Electronを起動したままだった。その後の再開時には停止していたため、同一ソースのCodex管理worktreeから5175サーバーを再起動した。上のPIDは初回観測値であり、現在PIDとして扱わない。
- 初回のCodex内Webでは1階玄関、Mission OFF／Alarm ON、全reset後の視点高さ1.15で停止した。元の観測値は開始地点ランダム、Mission ON／Alarm OFF、視点高さ1.20である。
- 再開後のChromeでは保存済み設定が荒れ度3、NPC39、洗脳済み39%、BITなし、音量各2、視点高さ1.15だった。確認用に開始地点1階玄関、Mission OFF／Alarm ONへ変更した。AIによる元設定への復元は停止により実施していない。
- 通常Electronは初回確認時に視点高さ1.35を全resetで1.15へ戻した。再開時に通常Electronのウィンドウはなかった。
- 最終の人間確認OKは受入判断であり、AIによる設定復元・追加操作・技術的原因確定の証拠としては扱わない。現在の画面状態を再確認する操作は行っていない。
- commit、push、PR作成、コメント投稿、merge、resolve、worktree削除、コード・3D資産・テストの編集は行っていない。
## 更新文書・文書検証

- P2正本: [計画](plan.md)、[確認結果・台帳](results.md)。
- 関連個別計画: [I4](../I4/plan.md)、[T06-6D](../T06-6D/plan.md)、[T07](../T07/plan.md)。
- 統合文書: [全体計画](../../../plan.md)、[次タスク計画](../next_tasks_plan.md)、[個別計画一覧](../README.md)、[ブランチ戦略](../../../branch_strategy.md)。

9文書の厳密UTF-8 decode、BOMなし、ローカル参照先存在、`git diff --check`を確認した。既存未追跡4ファイルのSHA-256は開始時と一致し、実行に使った管理worktreeはclean。コード・3D資産・validation・scripts・package・Electronソースのtracked差分は0。HEADは開始時から変わっていない。
