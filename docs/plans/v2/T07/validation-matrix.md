# T07 受入対応表

更新日: 2026-09-06
担当: GPT-5.6 Sol / Highの読み取り調査、親Astraが整理。
基点: develop c8769e32。P2前提文書commit: ec24845。対象: PR #84、Runtime検証head `8e6cd34`。
状態: **T07／V4は既知問題を許容したユーザー判断により受入OK**。PR作成後のWeb追加検証・独立レビューと、最終9項目の扱いは [最終受入記録](accepted-known-issues.md) に集約する。以下は初回の検証対応・証拠を保持した表であり、古いfixture件数やbefore／after値を最終Runtimeの再実行結果にはしない。数値FAIL・未確定は維持する。

| 契約群 | 既存入口 | 守る内容と追加計測 | 現時点の証拠 |
|---|---|---|---|
| BIT安全・飛行経路 | T05 bitFlightSafety / bitFlightSurfaceVariant / bitSystemAcceptance、T04 school-integration.html | 半径0.54m、床・天井、4種遷移、別BIT NavMesh、動的revision。実学校の移動・経路待ち・再計画頻度を追加計測する | T05 325/325、T04学校統合82/82 PASS。T04総合116/118で、北西階段4F→屋上BIT遷移と南西階段NPC接地の2資産問題が残る |
| 光線・光球・命中・描画 | T05 beamCombat / hitEffectSystem / bitCombatIntegration、T06 stageTransparentRenderingOrder / characterVisual | pool、破棄、Ray、命中event、窓越しWebGL描画。通常Web/Electronの実画面とCPU/GPU寄与を確認する | T05 325/325、T06 70/70 PASS。ElectronでG選択と実射撃を確認。Web wrapperはfront／left／rightを視認し、射撃確認の証拠にはしない。GPUは補助値として採取し、個別変更の因果は確定しない |
| 操作・Follower・同期射撃 | T05 npc-command.html、T06 runtimeInteraction / runtimeHud、acceptance:t06:electron | G/N/H、F/E/C、Follow/Leave、無制限Follower、同期射撃。継続WASD、Pointer Lock、実負荷時の入力応答を確認する | T05 NPC操作27/27、T06 70/70 PASS。ElectronはG／N／H、射撃、R等を確認。実Web wrapperはCanvas開始、Pointer Lock、W／D／S／A、実mouse左右視点、front／left／right視認だけをPASS |
| Mission・Alarm・放送・ミニマップ | B05、T05 Alarm群、T06-3、T06-4、Mission Electron normal / haigure | 意味資産・表示・Runtime・実学校配線は異なる契約。通常ゲームでも同時動作と実操作を確認する | B05 42/42、T06-3 16/16、T06-4 38/38 PASS。Mission normal／haigure Electronはいずれもexit 0・診断配列空 |
| 世界境界・扉・エレベーター | T04学校統合、T05 worldBoundary、T06操作/HUD、acceptance:t06-4p-2:electron | GLB境界、動的扉、Player/Follower/自律NPCの乗降。通常ゲームで通過・開閉・乗降を確認する | T04学校統合82/82、T05 325/325 PASS。通常人口50/10/6でPlayer＋Follower 5人、自律NPC `npc_7`の乗降を確認。T04総合は116/118、既知2件を許容済み |
| 設定・保存・reset・開始モード | T06-6A、T06-6B、acceptance:t06-6b:electron | 既定値、schema、V1キー分離、全/部分reset、通常/5方式即時公開処刑。6Aと6Bは相互内包しない | T06-6A 12/12、T06-6B 14/14 PASS。Electronで通常、5方式、Mission／Alarm 4組合せ、R再演を確認 |
| 終了導線・R/Enter | T06 runtimeInteraction、T06-6C game-flow Electron、T06-6D game-flow Electron | 6Cはphaseと操作、6Dは同じ導線上の所有と破棄。単純な代替関係ではない | T06-6C 7/7、T06-6D 13/13 PASS。Electronのgame-flowとCanvas再試行はいずれもexit 0。終了後GPU stderrはP2-T02で継続調査 |
| 6 viewport・連続resize | T06-6C fixture / Electron | 既存runnerは指定6サイズを含む8サイズ。P2-U01の長時間案内も通常Webで6サイズ確認する | instant／normal各8 viewportと連続resize 4遷移PASS。AIが640×480・480×360の両モード画像を確認。実聴・ユーザー確認とは区別 |
| lifecycle・静的資源再利用 | T06-6D fixture / Electron fixture / game-flow / retry | fingerprint、identity、動的交換、rollback、遅延owner、beforeunload、retry。静的保持を許すsession終了と最終owner解放を分ける | T06-6D 13/13、game-flow、retryがPASS。after保持は両runtime 3周完走・DOM 402固定・最終owner 0。Webはstatic-only baseline不一致1件、Electronは`aim.mp3`媒体証拠不足で別々にFAIL |
| 既定性能・最大stress | T05 performanceScenario、performance診断、T04 runElectronStress.mjs | 既定50構成の実時間70秒と、99/66/50・荒れ10の実時間120秒を追加/調整。負荷実稼働・heap・5%比較・終了解放を証拠化する | Web normalは絶対条件FAIL・5%以内、Web stress PASS、Electron normalは絶対条件FAIL・5%以内、Electron stress incomplete。固定4200frame参考pairは採取済みだが診断・Pointer Lock・歴史的条件差により比較未確定 |

## 最終受入artifact

- 最終機能回帰: 13 suite中12 suite PASS。T04学校統合82/82、T04総合116/118。残る2件は屋上BIT遷移と南西階段NPC接地の資産問題。
- `artifacts/t07/2026-09-06/final-functional-acceptance/build.log`: `npm run build` PASS。Babylon 4,082.68kBの4,000kB超過警告あり。配布物のローカルaudio／Characterと想定外artifactは0件。
- `artifacts/t07/2026-09-06/final-functional-acceptance/responsive/result.json`: instant／normal各8 viewport、連続resize 4遷移PASS。640×480・480×360の両モード画像をAIが確認。
- `artifacts/t07/2026-09-06/final-functional-acceptance/electron-runs/2026-09-06T05-27-04-737Z-all/summary.json`: 8条件すべてexit 0。通常ゲーム11 check PASS、audio resource 2,148件完了・失敗0件、元CJS reportの診断配列は空。
- 複数Electron runの終了後にChromium GPU stderrを観測した。P2-T02はNVIDIA設定読取とempty WebGL因子診断まで完了したが、無害・原因確定には至っていない。CJS reportのconsole／renderer／load／renderProcessGone／unresponsive 0件と統合しない。
- 正式性能比較: Web normal=`failed`（5%以内）、Web stress=`passed`、Electron normal=`failed`（5%以内）、Electron stress=`incomplete`。通常絶対条件は`frameIntervalTimeMs`で判定。
- after保持観測: Web／Electronとも3周完走・最終owner 0。Webはstatic-only baseline不一致、Electronは媒体complete-buffer証拠不足でFAIL。別の資源名診断3周＋6周では不一致を再現せず、6周版はVOICE中断1件で診断FAIL。正式失敗の置換には使用しない。
- 候補採否と数値を含む公開結果は[結果](results.md)へ集約する。

## 重複実行と採否

- 最終採用はP2-U01、Mission HUDのDOM再利用、空間query membershipのrevision内再利用、13 suite共通runner、B06 Node／Mesh／Primitive上限の現行資産追随。
- minimap cache拡大、BIT人数Map、NPC逃走先変更、Sweep・安全cache緩和、資産再構成、fixture／監査削除は今回非採用。安全に削除できるコード／3D資産は0件。
- 通常buildはV2依存監査、型検査、renderer build、配布監査、Electron buildを内包する。
- 各fixture buildは対応する型検査を内包する。T05型検査はRuntime独立性監査も内包する。
- fixtureとElectron runnerの実行は通常buildへ内包されない。
- 計測器とstress workloadの既存独立fixtureは`measurementRunner.mjs`から重複なく呼び出す。製品sourceとtest本体は変えず、入口・tsconfig・READMEだけを同期した。T07型検査PASS（2.53秒）、計測器22＋stress 22＝44/44 PASS（0.69秒）。結果は`final-functional-acceptance/measurement-fixture-result.json`へ記録した。
- T06-6D fixtureはB05 LocationとT06 Runtime lifecycleの一部を内包するが、統合文脈での失敗検出を確認せず削除しない。
- この表は入口の対応表であり、全コマンドを重複実行する一覧ではない。変更単位と最終受入に対して、Astraが契約と証拠の対応を固定する。
- Solは棚卸し、定型記録、確定仕様の小修正を担当。Astraは計測設計、採否、安全/寿命契約、テスト削除、独立レビューを担当する。
- 共有ファイルとGit操作は親が管理し、同一ファイルの並行編集と重いbuild/計測の同時実行を避ける。
- Web保持の旧static-only baseline不一致は初回の資源名診断3周＋6周で非再現。PR作成後の最新3周＋詳細6周でも非再現で、追加診断は資源の識別子・名前・生成破棄stackを保存した。旧1件の原因は未確定のままT07-K08として許容済み。P2-T02のGPU stderr履歴、renderer診断、媒体診断、owner解放とは分ける。
