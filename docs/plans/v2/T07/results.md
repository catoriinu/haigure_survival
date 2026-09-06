# T07 ローカル実装・検証結果

更新日: 2026-09-06

## 判定

**T07／V4はユーザー判断による受入OK、PR #84のマージ準備中である。** PR作成後のWeb追加検証と独立レビュー、再現性・実プレイ影響の報告を経て、ユーザーが既知9項目を許容した。正本は [既知問題の許容と最終受入](accepted-known-issues.md)。数値・fixtureのFAILと原因未確定は保持し、修正済み・AI数値基準PASSとは扱わない。

以下の表と初回計測値は最終HUD／リプレイ変更前の履歴証拠である。Runtime head `8e6cd34` の追加Web実測は最終受入記録へ集約し、旧before／after比較を最終版へ流用しない。Electronの追加build・試験と再開時間測定は後発のユーザー指定により対象外。

| 判定対象 | 結果 | 根拠 |
|---|---|---|
| 既定通常性能 | 未達 | Web／Electronともafter全3回が絶対条件に未達。主要指標のbefore比は5%以内 |
| Web最大stressの時間・heap比較 | PASS | 120秒・負荷成立・診断条件を全3回で確認。主要指標の悪化5%以内 |
| Electron最大stress | 未合格・比較不完備 | after 2回目が107.4166秒でNavMesh移動拘束例外により停止。before 1回目には未解決の音声request中断もある |
| 再開始後の保持・診断 | 未合格 | Webはstatic-only資源個数の不一致1回。Electronは構造条件を満たすが音声request中断1件の正常性を確定できない |
| 機能・表示 | 部分合格 | 13 fixture中12 suite、Electron機能8条件、起動UI24条件、responsive16条件＋resize4遷移、通常Web実操作はPASS。T04総合は116/118で資産側2件が残る |
| 配布build | PASS・警告あり | Web／Electron buildと配布監査PASS。Babylon chunk 4,082.68kBの4,000kB超過警告を保持 |
| 仕様同期 | 実施 | 技術仕様と3D実行仕様を更新。ゲーム仕様・資産仕様は契約不変のため本文を変更しない |

## 実施した変更と採否

- **計測基盤:** 通常50 NPC構成の実時間cold 10秒／steady 60秒、99 NPC／50 BITの120秒stress、歴史的な固定4200frameを別profileにした。CPU work、callback間隔、旧total、GPU、section、counter、Long Task、heapを分離し、未取得を0で埋めない。負荷入力の要求列と実行結果、人口、素材、source版を保存する。
- **P2-U01:** 起動診断専用の表示要素を設け、タイトルの通常注記とメッセージの所有を保った。長時間loading、失敗、開始注記の重複を解消した。
- **Mission HUD:** Mission IDごとの行と結果行をcontroller内で再利用し、値・state・色・順序が変わる時に更新する。hidden、対象消失、結果表示、disposeを含む局所回帰を追加した。
- **空間問い合わせ:** 同じrevision内でprivateな許可Mesh集合の静的部分・動的部分を再利用する。候補順、Ray／Sphereの幾何判定、dynamic revision、旧query lease、disposeの契約を維持した。抽出比較540組、T05 325/325を確認した。
- **検証工程:** 既存13 suiteのVite起動・終了、診断、結果保存を共通runnerへまとめた。fixtureのfavicon 404を明示的なdata faviconで解消した。T04の古い資産個数・ビームorigin期待値、B06の履歴で説明できる3個数上限を現行成果物へ同期し、他の閾値や安全判定は変更しない。

Mission HUDのp95中央値は0.1ms程度の低下で、時間分解能に近い。通常WebのCPU work中央値も低下したが、個別変更の寄与と統計的有意差は確定していない。大幅なfps向上や通常性能達成とは報告しない。HUDの反復DOM生成とqueryの反復集合生成を局所的に減らす構造上の効果を採用根拠とする。

minimapのcache拡大、BIT／NPC規則変更、Sweep間引き・安全判定緩和、大規模な責務分割、fixture削除・統合は今回非採用。未使用コード・資産は静的参照だけで削除せず、GLB内部の到達不能・未参照indexは0件と確認した。通常Runtimeへ直接接続しないpreview GLBと外部atlasも生成・監査・配布契約の利用者を持つため保持する。合計285,658 bytesの配布整理は将来候補であり、ユーザー採用済みの後続作業ではない。

## 正式性能比較

Windows、RTX 4070 SUPER／ANGLE D3D11、1920×1080、DPR 1、seed 20260725、校庭視点、正本のローカル音声・Character画像を使用した。WebはChromium 149、Electronは28.3.3／Chromium 120。同runtime内で環境・設定・素材・意味request列を揃え、変更前後各3回を直列実行した。計測区間内にGCは実行しない。

変更前後の正式24 attemptは23完走・1例外停止だった。数値未達・正式診断失敗は除外しない。別途、計測方法の初期不備と入力中断のattemptは原データを保持し、修正・補完の理由を[実行計画](execution-plan.md)へ記録した。

以下は3回の中央値。時間はms、heapは計測窓終了後の強制GCによる`usedSize`。

| 条件 | CPU work p95 前→後 | CPU work p99 前→後 | callback p95 前→後 | callback p99 前→後 | 保持heap中央値の増減 |
|---|---:|---:|---:|---:|---:|
| Web normal cold | 13.9→13.1 | 17.9→18.1 | 16.9→16.9 | 21.1→20.0 | normal全体 +1.365% |
| Web normal steady | 14.6→13.6 | 18.5→17.0 | 16.9→16.8 | 19.2→17.8 | 同上 |
| Web stress | 47.8→47.2 | 56.0→53.9 | 50.1→49.6 | 58.3→56.0 | +0.015% |
| Electron normal cold | 19.3→19.0 | 25.4→26.4 | 33.6→33.7 | 34.9→35.6 | normal全体 +0.194% |
| Electron normal steady | 19.6→19.0 | 23.4→22.3 | 33.5→33.5 | 33.7→33.7 | 同上 |
| Electron stress | 比較不完備 | 比較不完備 | 比較不完備 | 比較不完備 | after 2回目が未取得 |

normalの絶対条件は各cold／steadyのcallback p95≤16.7ms、p99≤25ms、最大≤50ms、50ms超Long Task 0件である。after Webはcold最大64.6／79.2／72.8ms、steady最大27.1／28.3／61.1msで、3回目に60msのLong Taskが1件あった。after Electronも全3回がp95／p99／最大に未達で、3回目にLong Taskが1件あった。

after Web 3回目の最大CPU work 60.4msではBIT chase経路計算が52.9msを占めた。同種のspikeはbeforeにも存在する。coldの長いcallback間隔は同区間の最大CPU workだけでは説明できず、この経路計算spikeと同じ原因へまとめない。

Web normalのGPU p95中央値はcold 4.3→5.4ms、steady 4.7→5.9msと増えた。GPUは補助指標であり、主要5%比較へ混ぜないが、値とばらつきは保持する。Electronで取得できない`backingStorageSize`も未取得のまま残す。

初回起動の中央値はWeb normal 4,932→4,724ms、Web stress 4,861→4,865ms、Electron normal 6,253→6,252ms、Electron stress 6,582→6,576ms。school load、Character読込、Runtime構築、Scene準備をphase別に保存した。Web normalの短縮を特定の変更の効果とは断定しない。

I3の歴史的な固定4200frame値はwork p95／p99=27.1／31.4ms、旧total=33.5／34.0msのまま保持する。現行計測器による参考1回ずつはbefore work30.3／35.6ms・旧total33.9／39.2ms、after work29.1／34.1ms・旧total33.7／38.5msだった。ただし歴史的条件と音量・機能等の一致を復元できず、今回のbeforeには媒体診断未達、afterには終盤のPointer Lock解除もある。参考採取の完走と比較成立を分け、このpairを改善・歴史的目標維持の合格証拠に使用しない。

## 再開始と終了後の保持

同一rendererでnormal 70秒を3周実行し、R、Enter→Canvasで再開始した。各周のGC前に媒体観測ログをNode側へ退避し、rendererの性能report履歴を最新1件へ限定した。同じ観測方式をbefore／afterへ適用した。

| runtime／版 | GC後usedSize 1／2／3周（bytes） | 終了後（bytes） | 接続DOM 1／2／3周 |
|---|---|---:|---|
| Web before | 142128880／163342800／161657516 | 68920472 | 400／400／400 |
| Web after | 146414768／163684220／169001688 | 69330504 | 402／402／402 |
| Electron before | 149416672／166282296／167117228 | 70756004 | 400／400／400 |
| Electron after | 144304844／164806520／168492132 | 71153396 | 402／402／402 |

全4観測で静的load／GLB parse各1回、静的identity不変、動的identity 1→2→3、各dispose 1回、最終ownerとScene資源0を確認した。afterの接続DOM数は各周固定。Web afterは2→3周で約5.3MB増加し、static-only基準の不一致1回があるため保持条件を合格としない。Electron afterはstatic-only一致を含む構造条件を満たすが、1周目の`aim.mp3`中断の正常性を確定できず診断条件が未達。heap差だけでリーク不存在は断定しない。

Webの静的資源不一致は、正式runを保持したまま別runnerで資源名を観測した。追加3周と6周を完了し、全7回の再開始境界でMesh／Material／Texture／Camera／Lightの個数とID・名前が一致した。共通基準は1479／7／4／0／1で、正式1件の不一致は再現しなかった。6周版は別のVOICE request中断1件で診断FAILだった。診断用HTTP応答への観測追加は正式性能値・保持heap比較に使用せず、正式失敗を置き換えない。

正式不一致時の資源内訳は元reportに保存されていない。遅延生成・破棄順を追跡した範囲でも原因は確定せず、Sceneの遅延default materialも追加観測では生成されていないため候補に留める。正式3改善にScene資源を直接増減する変更はないが、時間変化が既存の生成条件へ影響した可能性は未確定。次の原因調査では、不一致が起きた瞬間の資源内訳・名前・生成stackを保存することを具体的な入口とする。

## 機能・表示・資産・build

| fixture | 結果 |
|---|---:|
| B05 | 42/42 |
| T04学校統合 | 82/82 |
| T04総合 | 116/118 |
| T05 | 325/325 |
| T05 NPC操作 | 27/27 |
| T06 | 70/70 |
| T06-2 | 22/22 |
| T06-3 | 16/16 |
| T06-4 | 38/38 |
| T06-6A／6B／6C／6D | 12/12、14/14、7/7、13/13 |

T04以外の12 suiteは外部診断0でPASS。T04は個数同期後も次の2項目が残る。旧queryへ戻したA/Bでは元の4失敗すべての数値・内容が一致しており、古い個数期待値2項目だけを同期して116/118になった。閾値を緩めて合格にしていない。

- **屋上BIT遷移:** 北西4F→屋上の作者経路の終点から飛行帯への投影点をつなぐ線が`COL_RooftopFacilityShell`を横断する。半径0.135 world units（0.54m）の安全Sweepが正逆とも拒否した。作者終点を正規の階段室開口から屋上帯へ延ばす資産側修正が必要であり、正規壁の削除や安全半径の縮小は採らない。
- **NPC接地:** 南西階段3F／4Fの各1標本で、足元とNavLocationは一致するが物理床との高さ差が0.0362985134／0.0360773802 world unitsとなり、0.035の既存閾値を超える。対象polyは5984512／5984768。人物用TileCacheの生成面とColliderの対応を修正対象とする。Runtimeへ毎frame Rayを戻すことや閾値変更を結論としない。

P2-U01はloading／stalled／running／failedの4状態×6 viewport＝24条件を確認した。AIが480×360の全4状態と全6 viewportのstalled画像を視認し、Canvas実クリックでの失敗後再試行もElectronでPASSした。responsiveは両モード各8 viewport、連続resize 4遷移がPASSし、640×480・480×360をAIが視認した。

Electron機能受入8条件はすべてexit 0。設定・5方式、Mission normal／haigure、Player・Follower・自律NPCのエレベーター、Canvas再試行、R／Enterの静的・動的寿命、通常ゲームのG／N／H、実射撃、移動・停止を確認した。通常ゲームは11 check PASS、媒体request 2,148件完了・失敗0件。通常Webでも実WASD、Pointer Lock、実マウス視点変更を確認し、正面・左・右の画面をAIが視認した。これはAIの実操作・視認であり、実聴やユーザー確認を意味しない。

Blenderのgeometry-only監査はPASS。GLBは22,477,080 bytes、Node 1,923、Mesh／Primitive各1,476、triangle 420,429で、資産hashはcatalogと一致した。学校の`.blend`、GLB、NavMesh、生成器、catalog内容は変更していない。B06の3個数上限は後続の正当な追加・削除を履歴で説明して同期した。

`npm run build`はV2依存監査・型検査・renderer・Web配布監査・Electronを含めてPASS。ローカル音声・Character画像と想定外artifactの配布混入は0件。Babylon chunkの容量警告は残し、抑制していない。成功後の全build・全fixtureの理由のない再実行は行わない。

独立fixtureの入口は、既存の計測器22項目とstress driver22項目を`measurementRunner.mjs`から重複なく呼ぶ形へ統一した。T07型検査と44/44項目がPASSし、実学校の合格数には加算しない。比較器も欠落・壊れたJSON・必須check・source版・GC・単回未達・5%境界など9分類76ケースのoffline検証を通過した。

## 初回調査の未解決事項と現在の扱い

- Electron stressの移動拘束例外は、要求した水平距離0.006660に対し0.030708移動し、許容0.02を超えた。既存NavMeshを読む約0.8秒のNode/wasm検証で、面内判定される開始面6822658からも正式runと完全一致する異常拘束点を再現した。共有斜辺上の希望点を隣接2面がともに面外判定し、NavMeshの壁辺へ拘束する条件である。希望点のZを診断上だけ±1e-6 world変えると一方の面が面内判定になり、要求近傍へ戻った。製品query最適化を使わず局所再現したが、正式runがその境界へ到達する過程と最適化による時間変化の因果は未確定。固定offsetや安全検査の緩和は製品へ追加していない。
- Electronの約30fps周期は、ゲームを読まない空WebGL clearでも再現し、rAFだけでは約60fpsだった。背景抑制と全画面の各単独変更でも改善しない。NVIDIA DRSの読み取りでは明示的なfps／同期設定値を取得できず、設定なし・制限なしとは断定しない。OS／driver設定は変更していない。
- P2-T02のGPU stderrは複数の終了処理で観測し、性能runnerでもbefore stress 2／after stress 1に各1件ある。renderer診断、正常終了、最終owner0と分け、無害・原因解消とは判定しない。
- 正式性能24 attemptにはraw media中断14件があり、13件は全区間buffer観測を持つ。before Electron stress 1の`aim.mp3`だけは対応する正常性を確定できない。after Electron保持の別runでも同音声の証拠不足が1件ある。追加Web6周のsession 3→通常RでもVOICE中断1件に置換・完全読込の証拠がなく未解決。異なるrunを混ぜず、成功回への差し替えは行わない。

学校資産は監査だけの範囲を維持する。当初は屋上経路・階段NavMesh・移動拘束・保持診断の修正と再評価を受入前提としていたが、後発のユーザー判断で [既知9項目の許容](accepted-known-issues.md) へ置き換えた。修正・追加試験をPR #84のマージ前提にはしない。将来再対応する場合は対象を改めて指定し、安全判定・閾値を維持して再現と解消を確認する。

## 証拠と操作履歴

独立証拠の基点はAI作業領域のproject `fps-survival`配下、`artifacts/t07/2026-09-06/`。repository外の証拠であり、原データや失敗attemptを削除・上書きしない。

- `before/`、`after/`、`comparison.json`、`final-performance-summary.md`: 正式24 attemptと3回の中央値・範囲、source／material manifest、入力列、GPU・section・起動phase、診断。
- `before-retained-{web,electron}.json`、`after-retained-{web,electron}.json`: 各3周のGC、DOM／listener、所有、終了、診断。
- `fixed-reference/`: I3固定4200frameの現行計測器による変更前後参考測定。歴史的条件との差と、診断・入力条件の未達を保持する。
- `final-functional-acceptance/`: 13 suite、build、起動UI、responsive、Electron8条件、通常Web実操作と画像。
- `t04-failure-analysis.md`、`t04-observed-failures.json`、`t04-before-query/`: T04失敗の因果・A/B・座標・面・Sweep証拠。
- `query-membership-review.md`、`final-runtime-review.md`、`compare-performance-review.md`: Astraの独立レビュー。指摘なしを全受入合格の代用にしない。
- `candidate-final-decisions.md`、`code-asset-inventory.md`、`geometry-audit.json`、`stale-audit-provenance.md`: 採否、未使用判定、資産監査と上限同期の根拠。
- `electron-frame-pacing.md`、`nvidia-drs-readonly/`: 空canvas因子診断とdriver profileの読み取り。
- `after-electron-stress-abort-analysis.md`、`after-electron-stress-nav-probe.json`: 移動拘束の境界数値条件、元runとの一致、開始面と希望点の対照、到達経緯の未確認範囲。
- `retained-resource-diagnostic-web.json`、`retained-resource-diagnostic-web-6cycles.json`、`retained-static-baseline-analysis.md`、`retained-static-baseline-evidence.json`: 正式保持失敗とは分離した資源名の追加観測。3周＋6周の不再現、別VOICE中断、破棄順・遅延生成・原因未確定の根拠。
- `ai-remaining-review/`: PR作成後の最終Runtimeに対するWeb通常3回・stress3回、保持3回＋詳細6回、対象3 fixture、HUD・NavMesh・媒体観測の診断と実プレイ影響評価。採否は公開文書の[最終受入記録](accepted-known-issues.md)を参照する。

P2前提文書9件は別ローカルcommit `ec24845`へ保存した。T07は専用branch `codex/v2-t07-regression-docs`で次の5単位をローカルcommitした。

| commit | 内容 |
|---|---|
| `a805bd8` | 起動診断の案内重複を解消 |
| `5e6b610` | 実時間の性能計測と負荷検証を整備 |
| `3802eec` | HUDと空間問い合わせの反復生成を削減 |
| `1ed4304` | 学校受入の現行期待値と診断を整備 |
| 本結果記録を含む文書commit | T07の実測結果と未達条件を記録 |

各commitの対象一覧、UTF-8 BOMなし、staged差分、公開差分へのローカル利用者の絶対パス混入0を確認した。初回文書の独立監査2件は、6周結果の同期と計測fixture入口の追加で対応した。その後HUD・体力・拘束・公開処刑リプレイを追加し、明示承認により `8e6cd34` までの計12 commitをpushして`develop`宛てPR #84を作成した。PR作成後の追加検証と既知問題許容により受入OKへ更新した。merge、統合元同期、worktree削除は未実施。
