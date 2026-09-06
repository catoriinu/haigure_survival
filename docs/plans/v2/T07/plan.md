# HAIGURE SURVIVAL v2 T07 性能・回帰試験・仕様書 計画

更新日: 2026-09-06

最新の追加作業は[プレイ中HUDとデバッグ表示の調整](hud-polish-plan.md)を参照する。ユーザーの2026-09-06訂正により、今後の受入・build・試験はWeb版だけを対象とする。以下の既実施Electron結果は履歴であり、追加試験の指示やWeb版の合否条件とは扱わない。

## プロンプト

2026-09-06 P2依頼からの担当・範囲指定:

> Astraによる本格的なリファクタリング・軽量化・テスト整理の調査と実施はT07へ置きます。P2で発見した候補は引き継ぎますが、P2を全面的な構造監査へ拡大しないでください。

2026-09-06 P2判断回答:

> ２はT07で修正しましょう

対象はP2-U01「長時間起動時の案内文字重複」。ユーザー指定によりT07のUI修正として実施する。P2では修正しない。

> V2の学校1ステージを回帰試験し、1080p・既定設定で60fpsを目標に調整してください。Web版とElectron版をビルドし、3Dステージ実行仕様、技術仕様、Blender資産仕様を最新実装へ更新してください。

> 最終的には最低でもNPC 99人、BIT 50機、Player 1人の負荷へ耐えられることを確認してください。荒れ度10、動的扉、エレベーター、Follower、同期射撃、標的選択個性も有効にしてください。

> I3の判断によりリアルタイム鏡面反射は追加しません。99 NPC／50 BITは60fps要件ではなく120秒の安定性stress上限とし、既定通常構成の60fps目標と分けて確認してください。

## 目的

完成したタイトル・設定・学校Runtimeを、既定通常構成の性能目標と最大構成の安定性上限に分けて検証する。Astraが測定に基づく仕様不変のリファクタリング・軽量化・テスト整理を調査・実施する。最適化後のWeb／Electron最終回帰と仕様書同期を完了し、v2リリース準備へ引き渡す。

## 担当設定

- モデル: GPT-6 Astra（2026-09-06のユーザー指定）。
- 推奨リーズニング: Ultra。資源所有、ゲーム契約、性能、既存受入の検出能力を横断して維持するため。
- P2ではこの本格調査・実装を開始していない。
- 2026-09-06実行承認後: 親Astraが共有ファイル・採否・Git・サーバーを担当する。難しい計測設計・所有・安全・レビューはGPT-6 Astra／Ultra、棚卸し・定型作業・確定仕様の小修正はGPT-5.6 Sol／Highへ分担する。同一ファイルと重い測定は並行実行しない。
- 依頼原文と実行単位は[実行計画](execution-plan.md)、契約対応は[回帰対応表](validation-matrix.md)に保存する。

## 開始条件

- T06-6Dが独立レビュー後に`develop`へ統合済みである。
- P2のリリース必須修正が0件で、必要な修正がすべて`develop`へ統合済みである。
- P2の代表受入が完了している。2026-09-06のユーザー指定により[P2結果](../P2/results.md)のP2-V01／V02と残導線は人間確認OKとして閉じ、受入上の開始条件は成立した。AI再検証のPASSとは区別する。
- 未コミットのP2確定文書を後続作業木へ引き継ぐ。最新`origin/develop`だけには今回の文書が含まれないため、統合・引継ぎ状態を開始時に確認する。
- `codex/v2-t07-regression-docs`の専用worktreeを最新`origin/develop`から作成する。

## 性能契約

### 既定通常構成

- 1920×1080、タイトル既定値のNPC 50、初期洗脳済み20%、BIT初期1・10秒増援・最大25、荒れ度2、Mission ON、Alarm OFF、ミニマップ・放送・早期自動公開処刑ONで計測する。
- 次callbackまでの`frameIntervalTimeMs`を通常構成の絶対条件とし、p95 16.7ms以下、p99 25ms以下、最大50ms以下、50ms超Long Task 0件を要求する。開始直後10秒と定常戦闘60秒を別々に報告し、旧totalは比較用の別指標として混同しない。
- 解像度、人口、既定品質、Character画像、光線演出、ミニマップ、Missionを無効化した値で代用しない。

### 最大安定性stress

- Player 1、NPC 99、初期洗脳済み66、BIT 50、荒れ度10、20室の荒れvariant、多数の動的扉、稼働エレベーター、無制限Follower、同期射撃、`persistent`／`nearest-visible`混在を有効にする。
- 60fpsを合格条件にせず、120秒完走、diagnostics・warning・error 0件、終了後の保持リーク0件、同一T07計測器の変更前baselineに対する主要frame time・heap指標の悪化5%以内を合格条件とする。
- I3固定baselineはframe work p95 27.1ms／p99 31.4ms、総frame p95 33.5ms／p99 34.0msを保持する。seed 20260725・校庭視点・全荒れ・99/66/50・600＋3600 frame条件を復元し、実時間120秒とは別に比較する。同一端末、同一解像度、同一seed、同一計測区間を照合し、出典条件を復元できない比較を合格にしない。
- リアルタイム鏡面反射、反射専用camera、`MirrorTexture`は有効化せず、性能項目にも含めない。

## 機能・安全回帰

- T05-1の半径0.54m移動包絡、床・直上天井、別BIT NavMesh、`aperture`／`vertical`／`surface-route`／`boundary`を維持する。
- V1相当の光線軌跡、周囲光球、着弾、命中演出とpool／instanceの生成数、更新、破棄を計測する。
- G／N／H、F／E／C、Follow／Leave、同期射撃、Mission、Alarm、放送、ミニマップ、公開処刑、世界境界、扉、エレベーターを回帰する。
- `V2TitleSettings`、V1保存キー不変、V2 schema version不一致reset、version 1正規化、通常全reset、公開処刑部分reset、通常／即時公開処刑、R／Enter、静的学校資源identityを回帰する。
- 1920×1080、1280×720、1024×600、800×600、640×480、480×360と連続resizeを回帰し、全設定への到達、値・focus・mode維持、横overflow 0を確認する。

## 計測・最適化境界

- CPU、GPU、NavMesh、視線Ray、経路再計画、光線、光球、PointLight、Mission、ミニマップ、room variant、heapを分離計測する。
- 安全判定、経路意味、設定初期値、表示項目、ゲームルールを変える最適化は行わない。
- 学校資産を変更する必要が判明した場合はT07へ混在させず、P2の問題別branchへ戻す。
- 実測前に全面分割・一律置換を決めない。性能寄与、契約、所有、失敗検出能力を調査し、独立した実装単位と対象受入を計画へ固定してから順に実施する。
- テスト整理は重複の見かけやPASS数で判断しない。T06-6Dのidentity、rollback、終了中非同期、最終owner解放等を維持し、削除・統合する場合は検出能力の対応を示す。
- 通常URLの`seed`引数だけを固定seedと扱わない。対応する既存計測scenarioと実際のsession seed、人口、素材、解像度を記録する。

## P2からの引継ぎ

| ID | 候補 | T07で行うこと |
|---|---|---|
| P2-T01 | 既定性能／最大安定性 | 既存I3／T06-6A実績と最新統合版を区別し、上記の2条件で計測する |
| P2-T02 | 終了後Chromium GPUメッセージ | 稼働中・終了中・終了後、rendererの終了理由、owner解放を分離して評価する |
| P2-T03 | 構造・テスト整理 | 起動／session境界と受入scenario、実seed、テストが保証する契約を調査し、意味不変の改善案を作る |
| P2-U01 | 長時間起動時の案内文字重複 | ユーザー指定の修正。startupDiagnostics、タイトルCSSの表示関係を直し、通常loading／失敗案内／開始注記と小画面可読性を確認する |

P2-U01は後発のユーザー指定によりT07で修正する。性能・構造改善とは実装単位を分け、`src/v2/startupDiagnostics.ts`、`src/style.css`、必要なら`index.html`を所有する。P2-V01／V02は人間確認OKとしてP2受入を閉じ、T07の未解決課題へ移管しない。AI観測時の技術的原因は未確定のまま記録を保持する。T07の他の所有候補は`src/v2/**`、直接関連する`src/world/**`・`src/ui/**`、関連validation・package scripts・仕様文書とし、調査後に実装単位ごとの所有を絞る。学校バイナリ、生成器、catalog内容を同時編集しない。

## ステップ

- [x] 全個別計画の結果とP2必須修正0件を確認する
- [x] P2代表受入完了と引継ぎ候補を確認し、Astraの調査範囲・baseline・所有を固定する
- [x] 構造とテストの契約・検出能力を調べ、仕様不変の実装単位へ分割する
- [x] P2-U01の長時間起動案内重複を修正し、通常・失敗・設定反映表示と小画面で確認する
- [x] 既定通常構成の開始直後10秒・定常戦闘60秒をWeb／Electronで計測する
- [x] 最大構成を同一seedで120秒実行し、診断・保持・baseline比を測定する
- [x] CPU／GPU／AI／NavMesh／演出／UI／heapを分離して意味不変の最適化を行う
- [ ] BIT安全、扉、エレベーター、Follower、Mission、Alarm、放送、終了導線を回帰する
- [x] `V2TitleSettings`、V1保存分離、6 viewport、連続resize、静的資源再利用を回帰する
- [x] Web版とElectron版をbuildし、配布監査と実行時console／process診断を採取する
- [x] ゲーム仕様、技術仕様、3D実行仕様、Blender資産仕様を同期する
- [ ] V4性能・リリースゲートと独立レビューを完了する
- [x] 結果を更新し、T07差分だけをcommitする

## 結果

2026-09-06実行開始。T06-6DはPR #83、develop `c8769e32`へ統合済み。P2は人間確認OKを含めて受入完了・必須修正0件であり、AI測定PASSとは区別する。P2確定文書9件は別ローカルcommit `ec24845`へ保存した。ユーザーが手動worktree作成を承認し、専用の`codex/v2-t07-regression-docs`へ引き継いだ。正本にあった対象外4件は内容を保全した。push・PR・merge・worktree削除は対象外。

計測基盤と契約対応表を整備し、製品改善前のbaselineを採取した。通常の実時間70秒と最大構成120秒、I3の固定4200frame比較を区別する。Web／Electronの通常・stressは変更前後各3 attemptを実施し、24 attempt中23回を完走した。再開始保持観測も完了。通常の数値条件未達、Electronの入力中断回、素材request中断を個別に保存して原因を切り分けた。

P2-U01本体、Mission HUDのDOM再利用、空間queryのmembership再利用を適用した。P2-U01の`runStartupUi.mjs`はloading／stalled／running／failedの4状態×6 viewport＝24条件に合格し、実行前後のsource hashも不変だった。AIが最小480×360の4状態と、6 viewportすべてのstalled画像を実際に確認した。さらにT06-6D再試行Electronで、初回失敗、設定操作による再試行なし、Canvas実クリックによる復旧、現在設定の反映がPASSした。これによりP2-U01の独立ステップを完了とする。画像確認はAIによる実画面確認であり、実聴やユーザー確認を意味しない。

最終機能回帰は13 suite中12 suiteがPASSし、T04総合の最終結果は116/118、外部issue 0だった。個数同期の2件は解消したが、北西階段4F→屋上BIT遷移の施設壁横断と、南西階段2 polygonのNPC物理床誤差超過が残る。いずれも安全判定や閾値を緩めず、学校資産・派生NavMeshの別修正へ渡すため、機能・安全回帰の全体ステップは未完を維持する。

`npm run build`はV2依存監査、型検査、renderer build、Web配布監査、Electron buildを含めてPASSした。Babylon chunk 4,082.68kBが4,000kBを超える警告は残り、配布監査の`localAudioArtifacts`／`localCharacterArtifacts`／`unexpectedArtifacts`はすべて空だった。build成功と、実行時console・stderr 0件は分けて判定する。

T06-6C responsiveはinstant／normal各8 viewportと連続resize 4遷移がPASSし、AIが640×480・480×360の両モード画像を実際に確認した。Electron最終機能受入は8条件がすべてexit 0で、通常ゲーム受入11 checkはG／N／H、射撃、R、Pointer Lock、移動を含み、audio resource 2,148件も完了・失敗0件だった。実Webの最終wrapperはCanvas開始、Pointer Lock、W／D／S／A、実mouse左右視点、front／left／right視認をPASSした。ElectronとWebの実操作証拠は分けて評価する。P2-T02はNVIDIA設定読取とempty WebGL因子診断まで完了したが、GPU stderrが無害であることや原因の確定には至らず残課題とする。

Mission HUDのDOM再利用、空間query membershipのrevision内再利用、既存fixture共通runner、B06 Node／Mesh／Primitive上限の現行資産追随を採用した。P2-U01もユーザー指定どおり採用済み。計測器とstress workloadの既存独立fixtureを共通入口へ接続し、T07型検査PASS（2.53秒）、計測器22件＋stress 22件＝44/44 PASS（0.69秒）を確認した。test本体と製品計測版は変更していない。minimap cache拡大、BIT人数Map、NPC逃走先変更、Sweep・安全cache緩和、資産再構成、fixture削除は、寄与または契約維持の根拠が足りないため今回非採用とした。

正式before／after比較はWeb normalが絶対条件FAIL・5%以内、Web stressがPASS、Electron normalが絶対条件FAIL・5%以内、Electron stressがbefore 1の媒体診断未達とafter 2の107.4166秒abortによりincompleteとなった。通常とstressの計測実施は完了したが、計測完了を性能合格へ読み替えない。

再開始保持観測はWeb／Electronとも3周を完走し、両runtimeで接続DOM数が402に固定され、最終owner残留とconsole／page診断異常は0だった。Webは2→3周の`staticOnlyBaselineMismatchCount=1`により構造条件FAIL。追加の資源名診断3周＋6周の全7境界では個数・ID・名前まで一致したが、正式1件の原因は確定できなかった。追加6周版は別VOICE中断1件が未解決で診断FAILだった。Electron正式保持は構造条件PASSだがsession 1の`aim.mp3`にcomplete-buffer証拠がなく媒体診断FAILである。固定4200frame参考pairも採取したが、beforeはruntime診断未達、afterは終盤のPointer Lock解除があり、歴史的I3条件との差もあるため比較未確定とした。

Electron stress停止は既存NavMeshの共有斜辺で希望点が隣接2面とも面外判定となる局所条件を再現し、正式runと同じ異常拘束点を得た。正式runでの到達経緯は未確定であり、新しいRuntime不具合の問題別修正へ渡す。保持の不一致時内訳と媒体中断の正常性も残課題として固定した。今回の実装・計測・調査結果はT07の5単位でローカルcommitし、P2前提文書commitと分離した。T07全体およびV4は完了扱いにしない。各commitと詳細は[結果](results.md)へ集約する。
