# HAIGURE SURVIVAL v2 T05-2V 光線演出・世界境界終了 計画

更新日: 2026-07-28

## プロンプト

> V2の光線がV1より簡略化され、光の軌跡、周囲の光球、光線命中エフェクトが失われています。V1相当の表示を復元してください。
>
> 光線が校舎の塀を越えて空の向こうまで飛び続けています。塀の外側約5メートルを世界の最終境界とし、光線はそこで衝突や着弾ではなく自然に消えるようにしてください。既存の最大寿命は安全上限として残してください。

2026-07-26 実装開始指示:

> T05-2V「光線演出・世界境界終了」のプランを開始してください。
>
> PLEASE IMPLEMENT THIS PLAN:
>
> 指定ブランチ`codex/v2-t05-2v-beam-effects`の専用worktreeで、本計画に確定した世界境界契約、V1相当の光線・命中演出、資源再利用、検証を実装してください。学校バイナリは変更せず、コミットまで行い、push、Pull Request、統合は別途指示があるまで実施しないでください。

2026-07-28 B03-3B統合後の同期指示:

> B03-3を`develop`へマージしました。T05-2Vで最新の`origin/develop`を取得し、T05-2Vへ取り込んで競合を解消してください。

PR #50のT05-2主要Runtimeは2026-07-26に`develop`へマージ済みである。残作業を同じPRへ追加せず、V1光線演出と共通世界境界終了だけをT05-2Vの独立成果として実装する。

## 確定方針

- 通常・固定・ランダム・カーペット・NPC gun・プレイヤーgun・公開処刑の全発射元で同じ光線表示と終了契約を使用する。
- V1相当表示は、テーパ付き本体、後端フェード、大きい先端球、周囲の軌跡光球、壁・床・天井着弾時の反射光球、キャラクター命中時の半透明発光球、PointLight、2色点滅、フェード、周囲光球を含む。
- 光線本体、先端、軌跡光球、着弾光球、命中球、PointLightはpool／instance等の再利用基盤で所有し、発射ごとのMesh生成・破棄へ戻さない。
- `BND_WorldLimit`は表示・BIT・光線の最終限界であり、`BND_Stage`とは別契約とする。T05-2Vは非学校fixtureでこの契約を先行実装し、B04の学校資産を直接編集しない。
- 光線線分が`BND_WorldLimit`を横切った場合は正確な退出点で終了し、約0.2秒で透明化する。遮蔽衝突、着弾、ダメージ、Alarm、壁命中通知、反射光球を発生させない。
- 世界境界はBlender X/Y/Z軸に平行でベベルのない閉じた直方体とし、全頂点が各軸のminまたはmax面上にあることを監査する。判定はキャッシュしたmin/maxへの線分slab判定で行い、Scene全Mesh Rayや三角形化を追加しない。
- 既存の最大寿命20秒は、世界境界内を飛び続ける光線と将来の大型ステージに対する安全上限として維持する。
- `StageCatalogEntry.worldBoundaryMode`と`StageSpatialContext.worldBoundary`をRuntime仕様4節どおり追加する。`required`では`BND_WorldLimit`を正確に1件要求し、`unsupported`ではObjectを持たず`worldBoundary=null`とする。
- T05-2Vの非学校fixtureを`required`にする。B04前の学校と既存の非対応fixtureは`unsupported`を維持し、旧境界や時間終了へ暗黙fallbackしない。
- NPC状態別スプライト表示、BIT動的スポーン、プレイヤー開始地点、音声、G／N／H入力は本タスクへ含めない。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-t05-2v-beam-effects`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: Ultra
- 理由: 全発射元、連続衝突、命中状態、描画資源pool、世界境界終了、99 NPC／50 BIT性能を同時に維持する必要があるため。
- 代替: GPT-5.6 Sol / Extra High。
- 開始条件: PR #50マージ済み`develop`。B03-3Aで固定した`BND_WorldLimit`の名前・形状・終了意味を使用する。
- 並行可否: B03-3Bと別worktreeで並行可能。B03-3Bが先に完了した場合は、学校バイナリを単一編集するB03-3CまたはB04とも並行可能。学校資産担当だけが`.blend`、GLB、両NavMesh、カタログhashを編集し、T05-2Vは光線Runtimeと非学校fixtureだけを編集する。
- 排他条件: T04-3AとT05-3は光線・Runtime周辺の所有が重なるため、T05-2Vの`develop`統合後に開始する。B04はB03-3C後へ移し、T06はB03-3～T05-3とT04-3Bの完了後に開始する。

## ステップ

- [x] `docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、T05結果、本計画、B03-3／T04-3／T05-3／B04／T06／T07計画、資産・Runtime仕様、ブランチ戦略を読む
- [x] V1最終光線実装と現行T05-2の全発射元、pool、命中状態、clear／disposeを比較し、共通演出状態を確定する
- [x] `StageCatalogEntry.worldBoundaryMode`、`StageWorldBoundary`、必須property `StageSpatialContext.worldBoundary`を追加し、非学校fixtureを`required`、B04前の学校と既存非対応fixtureを`unsupported`にする
- [x] `required` fixtureへ`BND_Stage`と分離した`BND_WorldLimit`を追加し、欠落・重複・非閉鎖・`BND_Stage`非内包と、`unsupported`への混入を読込エラーにする
- [x] `BND_WorldLimit`が軸平行・ベベルなしの直方体で、全頂点とキャッシュmin/maxが一致することを監査する
- [x] 光線線分と世界境界の退出点をO(1)で求め、退出時に着弾イベントを発生させず0.2秒フェードへ移行する
- [x] テーパ付き本体、後端フェード、大きい先端球、ランダムな周囲軌跡光球を共通表示へ復元する
- [x] 壁・床・天井着弾時の反射光球を復元し、世界境界終了時には生成されないことを検証する
- [x] プレイヤー／NPC命中時の半透明発光球、PointLight、2色点滅、フェード、周囲光球を状態遷移へ同期する
- [x] 通常・固定・ランダム・カーペット・NPC gun・プレイヤーgun・公開処刑で、命中1回、遮蔽、後端引戻し、最大寿命、世界境界終了を共通回帰する
- [x] 光線と全演出資源のpool再利用、clear／dispose、同一Scene再読込、残留0件を検証する
- [ ] プレイヤー1人＋NPC 99人＋BIT 50機の開始直後10秒・定常戦闘60秒で、CPU＋描画workの既存基準を維持する（1920×1080の両ビューでsteady p95が16.9msとなり、16.7ms基準を0.2ms超過）
- [x] T01～T05、通常Web、Electron、型検査、全build、console、UTF-8 BOMなし、ローカル絶対パスなし、`git diff --check`、括弧対応を回帰する
- [x] 60Hz前面環境での描画込み最終性能確認をT07へ引き渡し、本計画へ結果を記録する（並行作業中のため全体計画は変更しない）
- [x] PR #52を含む最新`origin/develop`を取得し、B03-3Bのレビュー済みHEADが統合済みであることを確認する
- [x] 最新`origin/develop`をT05-2Vへ取り込み、学校資産hashと`worldBoundaryMode: "unsupported"`を両立させて競合を解消する
- [x] 競合解消後のV2／T04／T05型検査と差分検査を通し、統合結果を記録する

## 結果

2026-07-27、最新`origin/develop`の`89bd9ef510287982f8abf8a5ddf0acc8611400f9`から作成した専用ブランチ`codex/v2-t05-2v-beam-effects`と専用worktreeで実装を完了した。学校の`.blend`、GLB、NavMesh、カタログhashは変更していない。

`StageCatalogEntry.worldBoundaryMode`と`StageWorldBoundary`を追加し、`required`では名前・extrasが一致する`BND_WorldLimit`を正確に1件要求し、`unsupported`では同Objectを禁止して`worldBoundary=null`とした。world座標頂点を統合して8隅、6面、閉じた辺、2三角形から成る各面、軸平行、非退化、非ベベル、`BND_Stage`全包含を検証する。実行時の`contains`と`findExitPoint`はキャッシュしたmin/maxだけを使用し、context破棄後の参照も無効化する。

全9発射元へV1相当のテーパ付き本体、後端alpha減衰、先端球、trail、blocker反射球を共通適用した。先端球の外表面を物理停止点へ合わせ、本体前端と先端球背面を接線配置し、`retractLeadRemaining`で命中・寿命終了時の巻き戻しも連続させた。境界・actor・blocker・寿命を同一線分上で比較し、同距離では境界を優先する。境界退出時は正確な交点で停止し、着弾、ダメージ、Alarm、壁通知、寿命切れ通知、反射球を発生させず、本体・先端・既存trailを退出フレーム残時間込みの0.2秒で単調にフェードする。trailは区間内の生成時刻で生成・加齢し、指数dragを解析積分してフレーム分割に依存しない。演出乱数はゲーム／AI乱数から分離し、表示判定は1フレーム1回、player中心5m以内かつactive camera frustum内に限定した。

受理済みactor命中だけで開始する独立`HitEffectSystem`を追加し、キャラクター状態定数を共有してpink／cyan点滅3秒とfade 1秒、PointLight、player／NPC別の周囲球を再生する。本体・先端・trail・反射球は共有geometry／materialのinstance pool、命中球・独立material・PointLightはbundle poolで再利用し、clear、replay、phase変更、対象消失、状態解除、disposeで即時返却する。

T05ブラウザfixtureは249／249項目PASSし、公開完了状態`passed`、`Babylon Logger=0 / errors=なし / warnings=なし`を確認した。完了後console warningの専用probeでは249／250項目、公開完了状態`failed`へ自動遷移することも確認した。`typecheck:v2`、`typecheck:t01`～`typecheck:t05`、通常build、`build:t01`～`build:t05`はすべて成功した。T01～T04、通常Web、Electronも実行確認し、Runtimeのwarning／errorは0件だった。通常build、T01、T03、T05にはVite生成サイズwarningがある。UTF-8 BOM、ローカル絶対パス、`git diff --check`、括弧対応、依存監査も異常なしである。

1920×1080、player 1人＋NPC 99人＋BIT 50機、seed `20260725`の最終計測では、courtyardのcold 10秒がp95 20.7ms／p99 48.2ms／max 57.3ms／Long Task 2件、steady 60秒がp95 16.9ms／p99 23.3ms／max 41.8ms／Long Task 0件だった。awayのcold 10秒はp95 21.0ms／p99 44.0ms／max 61.6ms／Long Task 2件、steady 60秒はp95 16.9ms／p99 24.1ms／max 43.5ms／Long Task 0件だった。両ビューともsteady p95が16.7ms基準を0.2ms超過し、coldも基準未達のため性能受入は未完了とする。cold最大フレームの既存bit区間はcourtyard 51.4ms／away 54.6msで、今回追加したbeam区間は3.2ms／5.2ms、hit-effect区間は1.0ms／1.2msだった。描画込み60Hzの最終判定と既存bitスパイクの解消をT07へ引き継ぐ。並行作業中のため全体計画ファイルは変更していない。

2026-07-28、`origin/develop`を再取得し、PR #52のマージコミット`2f67effaf057a005cfde1b085893f8370d95283b`と、B03-3Bのレビュー済みHEAD`5a4a918cb4192a677c6056528ead5463ac593cfa`が第2親として統合済みであることを確認した。T05-2Vは旧基準`89bd9ef`から1コミット先行、最新`origin/develop`から5コミット遅れており、専用worktreeで競合解消を開始する。push、Pull Request作成、`develop`への統合は行わない。

同日、最新`origin/develop`を`--no-ff --no-commit`で取り込み、唯一の競合`src/world/stageCatalog.ts`を解消した。学校GLB、人間用NavMesh、BIT用NavMeshのB03-3B最終SHA-256と、B04前の学校を`worldBoundaryMode: "unsupported"`とするT05-2V契約を両方維持した。公開3成果物から再計算したSHA-256はカタログ値と全件一致し、競合markerは0件である。

自動統合された`validation/v2/T04/main.ts`はB03-3Bの新学校件数、57窓、72遷移、有向surface cache、屋上折れ斜路検証と、T05-2Vの`worldBoundary: null`、決定的光線生成引数を両方保持した。`validation/v2/T05/bitSystemAcceptance.test.ts`もB03-3Bの72遷移期待値と、T05-2Vの世界境界fixture、policy、破棄、学校`unsupported`検証を両立している。

`typecheck:v2`、`typecheck:t04`、`typecheck:t05`は全件成功し、T05 Runtime静的検査は`10 files / 4 terms / PASS`だった。テキスト配布検査は変更テキスト90件についてstrict UTF-8、BOMなし、ローカル絶対パスなし、通常差分とindex差分の`git diff --check`を通過した。今回の統合ではpush、Pull Request作成、`develop`への統合を行っていない。
