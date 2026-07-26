# HAIGURE SURVIVAL v2 T05-2V 光線演出・世界境界終了 計画

更新日: 2026-07-26

## プロンプト

> V2の光線がV1より簡略化され、光の軌跡、周囲の光球、光線命中エフェクトが失われています。V1相当の表示を復元してください。
>
> 光線が校舎の塀を越えて空の向こうまで飛び続けています。塀の外側約5メートルを世界の最終境界とし、光線はそこで衝突や着弾ではなく自然に消えるようにしてください。既存の最大寿命は安全上限として残してください。

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

- [ ] `docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、T05結果、本計画、B03-3／T04-3／T05-3／B04／T06／T07計画、資産・Runtime仕様、ブランチ戦略を読む
- [ ] V1最終光線実装と現行T05-2の全発射元、pool、命中状態、clear／disposeを比較し、共通演出状態を確定する
- [ ] `StageCatalogEntry.worldBoundaryMode`、`StageWorldBoundary`、必須property `StageSpatialContext.worldBoundary`を追加し、非学校fixtureを`required`、B04前の学校と既存非対応fixtureを`unsupported`にする
- [ ] `required` fixtureへ`BND_Stage`と分離した`BND_WorldLimit`を追加し、欠落・重複・非閉鎖・`BND_Stage`非内包と、`unsupported`への混入を読込エラーにする
- [ ] `BND_WorldLimit`が軸平行・ベベルなしの直方体で、全頂点とキャッシュmin/maxが一致することを監査する
- [ ] 光線線分と世界境界の退出点をO(1)で求め、退出時に着弾イベントを発生させず0.2秒フェードへ移行する
- [ ] テーパ付き本体、後端フェード、大きい先端球、ランダムな周囲軌跡光球を共通表示へ復元する
- [ ] 壁・床・天井着弾時の反射光球を復元し、世界境界終了時には生成されないことを検証する
- [ ] プレイヤー／NPC命中時の半透明発光球、PointLight、2色点滅、フェード、周囲光球を状態遷移へ同期する
- [ ] 通常・固定・ランダム・カーペット・NPC gun・プレイヤーgun・公開処刑で、命中1回、遮蔽、後端引戻し、最大寿命、世界境界終了を共通回帰する
- [ ] 光線と全演出資源のpool再利用、clear／dispose、同一Scene再読込、残留0件を検証する
- [ ] プレイヤー1人＋NPC 99人＋BIT 50機の開始直後10秒・定常戦闘60秒で、CPU＋描画workの既存基準を維持する
- [ ] T01～T05、通常Web、Electron、型検査、全build、console、UTF-8 BOMなし、ローカル絶対パスなし、`git diff --check`、括弧対応を回帰する
- [ ] 60Hz前面環境での描画込み最終性能確認をT07へ引き渡し、本計画と全体計画へ結果を記録する

## 結果

未着手。PR #50で戦闘・状態・光線物理・集合・警報・公開処刑と仕様維持性能リファクタリングは`develop`へ統合済みである。V1光線演出と世界境界での非着弾フェードを独立したT05-2Vとして実装する。2026-07-26、学校バイナリを所有するB03-3Bとの並行実行へ変更し、T04-3AとT05-3はT05-2V統合後に開始する依存関係を確定した。PR #51レビュー対応で、`worldBoundaryMode`による`required`／`unsupported`移行と、必須property `worldBoundary`の型・fixture契約を確定した。
