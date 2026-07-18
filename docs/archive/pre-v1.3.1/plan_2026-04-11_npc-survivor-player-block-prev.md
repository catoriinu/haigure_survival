# npc-survivor-player-block 初弾命中修正 計画

更新日: 2026-04-06

## プロンプト
中程度のバグ：npc-survivor-player-blockの処刑のとき、プレイヤーが最初の一人を撃つときに光線が出ておらず、照準の向きに関わらず真ん中のNPCが光線命中エフェクトが起こります。
そうではなく、最初の一発目も通常通りに光線発射してください。そして命中したキャラのことだけを光線命中状態にしてください。

つまり、通常モードのbrainwash-complete-gun状態と同じ仕様にしてほしいのです。

一発目から光線が出るようになったのはOKです。
ただ、光線が命中していなくても中央の生存者が勝手に命中したことになっているのは指示違反です。

ありがとうございます。想定通りの挙動になりました。
この修正が適切か、念のため確認とリファクタリングを行ってください。

## ステップ
- [x] `処刑開始` 直後の初弾が pointer lock 再取得に消費される原因を切り分け、初弾で beam が出る状態にする
- [x] `処刑開始` ボタンの user gesture 中に pointer lock を要求するよう修正する
- [x] execution 中のプレイヤービーム命中条件を再調査し、「beam が外れたのに中央 survivor が hit になる」経路を特定する
- [x] `npc-survivor-player-block` で beam が実際に当たった target だけを hit にするよう修正する
- [x] 修正後コードを確認し、beam 座標計算の重複や不整合を整理する
- [x] `npm run build` でビルド確認し、結果を反映する

## 結果
- `docs/plan.md` は本不具合用へ切り替え、直前まで使っていた計画は `docs/plan_2026-04-05_instant-execution-title-prev.md` へ退避した。
- `src/ui/executeSettingsPanel.ts`、`src/ui/titleSettingsSidebar.ts`、`src/main.ts` を修正し、`処刑開始` ボタンの click user gesture 中に `canvas.requestPointerLock()` を先に要求してから `startInstantExecution()` を始める構成へ変更した。これにより、`npc-survivor-player-block` 開始直後の最初の左クリックが pointer lock 再取得に消費されにくくなり、初弾 beam が出ない問題は解消した。
- 調査の結果、`beginExecutionHit()` の到達元は execution 側で `buildExecutionPlayerBeamHitCandidates()` の `onHit` と `handleExecutionBeamCollisions()` の 2 系統に絞れた。`npc-survivor-player-block` では後者の自動斉射ルートは通らないため、残件は player beam の collision 条件側にある。
- `df820c5` 以前の execution プレイヤー命中処理も、`npc-survivor-player-block` では `isBeamHittingTarget(...)` を使って中央 survivor への hit を決めていた。shared resolver 化そのものが、今回の「beam が外れているのに中央 survivor が hit になる」現象の唯一原因ではないことを確認した。
- ユーザーから「中央 survivor から 180 度後ろを向いて空撃ちしても、最初の 1 発目で中央 survivor が hit になる」との再現報告があり、単純な当たり判定の広さだけでは説明できないことを確認した。前段の見立てだけでは不十分。
- `src/main.ts` に一時ログを追加し、`npc-survivor-player-block` の execution 中だけ `onPlayerFire`、player beam の `candidateOnHit`、`beginExecutionHit()` の発火順とスタックを `console.log` で追えるようにした。これにより、初弾 miss 時に本当に player beam の衝突コールバック経由で hit しているのか、別経路が走っているのかを runtime で切り分けられる状態にした。
- `npm run build` を再実行し、計測ログ追加後も `vite build` と `tsc -p tsconfig.electron.json` の成功を確認した。
- ユーザーからのログで、180 度後ろ向きの空撃ちでも `onPlayerFire -> candidateOnHit -> beginExecutionHit` の順で入っていることを確認した。つまり direct hit の隠し経路ではなく、player beam collision 側が誤って true を返している。
- 追加調査として `src/main.ts` の一時ログを拡張し、`candidateOnHit` で `targetRadii`、segment/tip の位置、`segmentHit`、`tipHit`、`manualHit` を同フレームで出せるようにした。これで衝突判定のどの部分が想定外なのかを直接照合できる。
- `npm run build` を再実行し、衝突判定の追加ログ後も `vite build` と `tsc -p tsconfig.electron.json` の成功を確認した。
- 数値検証の結果、ユーザーが貼った `onPlayerFire` / `candidateOnHit` の座標からは本来 `isBeamHittingTarget(...)` は false になることを確認した。したがって、execution 初弾の誤命中は「命中優先ルール」ではなく、scene ノード座標ベースの collision 計算が runtime で論理座標とずれていたことが原因と判断した。
- `src/game/beamCollision.ts` を修正し、beam collision は `mesh.position` や `tip.getAbsolutePosition()` ではなく、`startPosition`、`travelDistance`、`currentLength`、`velocity` から beam 本体区間と tip 位置を直接組み立てて判定するよう変更した。通常 beam と trap beam の両方で論理座標を使うため、`npc-survivor-player-block` の初弾でも、実際に beam が当たった target だけが hit する。
- 調査用に追加していた `src/main.ts` の一時 `console.log` は削除し、通常コードへ戻した。
- 修正後に `npm run build` を再実行し、`vite build` と `tsc -p tsconfig.electron.json` の成功を確認した。ゲーム内での手動確認は未実施。
- 追確認では、この修正方針に対して追加の不適切な挙動は見つからなかった。scene ノード座標依存を排し、beam の論理座標を使う方針は妥当と判断した。
- リファクタリングとして `src/game/beamCollision.ts` に beam 幾何情報の共通組み立て処理を寄せ、tip 中心座標と impact 座標を export した。これに合わせて `src/game/playerBeamHits.ts` と `src/main.ts` の impact 座標取得も共通 helper を使うよう統一し、`beam.tip.position` 依存の重複実装と未使用の `playerHitImpactDirection` を削除した。
- リファクタリング後に `npm run build` を再実行し、`vite build` と `tsc -p tsconfig.electron.json` の成功を確認した。ゲーム内での手動確認は未実施。
