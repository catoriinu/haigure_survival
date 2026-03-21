# 一人称足元表示の描画用前方オフセット計画

更新日: 2026-03-21

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# 一人称足元表示の描画用前方オフセット計画

追記:
> 下を向いてカメラが少し前に出たときにだけ、映るようにしてください。

と指示しましたが、そもそも「前」の概念を間違えているようです。
「下を向くと目が前に出る」というときの「前」とは、画面の奥・正面向きで言う奥方向のことです。
今の実装では、下を向くとカメラが手前にずれるせいで、自キャラスプライトが画面上部に見えてしまっています。自キャラは画面下部に見えてほしいのです。

## Summary
- 下半身レイヤー自体は残し、自然に見せるために「プレイヤー実位置」と「描画用視点位置」を分離する。
- 適用範囲は、現在下半身レイヤーを表示している全フェーズとする。
- カメラが水平から45度より下を向いたときだけ、描画用視点を水平方向の前方へスライドさせる。
- 実位置ベースの当たり判定、NPC 認識、ビット標的、ミニマップは維持し、見た目だけを変える。

## Implementation Changes
- `main.ts` に「プレイヤー実位置」の正本ベクトルを追加し、移動・衝突解決後の `camera.position` を毎フレームそこへ退避する。
- プレイヤー実位置を参照すべき処理は `camera.position` 直読をやめ、実位置ベクトルを使うよう統一する。
  - 対象は少なくともプレイヤー標的生成、被弾中心計算、execution 中のプレイヤー照準/衝突位置、ビット更新用 targets、ミニマップ、`playerAbility` の脅威判定と NPC ブロッカー生成。
- 描画用オフセットは「俯角45度開始、真下で最大」の線形補間にする。
  - 最大前方オフセット量は `layout.cellSize * 0.18` を既定値にする。
- オフセット方向は水平方向のみとし、`camera` の前方ベクトルを床面へ射影した向きを使う。
  - 射影長が極小のときは yaw 由来の水平前方を使う。
- 描画直前にだけ `camera.position = 実位置 + 描画用オフセット` を適用し、`syncCharacterFacingYaw()`、`syncFirstPersonBodyVisibility()`、反射カメラ同期はその描画用位置で実行する。
- 次フレームのゲーム更新開始前には、必ず `camera.position` を実位置へ戻してから移動・判定を行う。
- `syncPlayerPresentation()` のプレイヤー本体同期は描画用位置ではなく実位置を使い、`playerAvatar` が前方へずれて見えないようにする。
- 壁抜け視点を防ぐため、実位置から描画位置候補まで短いレイで前方オフセットをクランプする。
  - 最初のヒット手前までに短縮し、ヒットが無ければ満額オフセットを使う。
- 新しい UI 項目は追加しない。下半身レイヤーの可視率ロジックは現行のまま維持する。

## Interfaces / Types
- 保存設定や公開 API は変更しない。
- 内部状態として「プレイヤー実位置」「描画用前方オフセット」「現在の描画用カメラ位置」を追加する。
- 必要なら `main.ts` 内 helper として、`capturePlayerEyeBasePosition()`、`computeFirstPersonViewOffset()`、`applyRenderCameraPosition()` 相当を切り出す。

## Test Plan
- 通常プレイで水平視点、30度下向き、45度下向き、真下付近を比較し、45度未満では位置が変わらず、45度超で足元が自然に増えることを確認する。
- 壁際で下を向き、壁の向こうを覗けないことを確認する。
- 下を向いてもプレイヤー被弾判定、NPC の脅威判定、ビットの標的、ミニマップ上の位置が前へずれないことを確認する。
- 反射面で通常視界と同じ前方オフセットが反映され、鏡内の見え方だけ破綻しないことを確認する。
- `playing`、`assemblyMove`、`assemblyHold`、`execution` の切替時にオフセットが残留せず、水平へ戻した瞬間に元の視点へ戻ることを確認する。
- `npm run build` を実行し、構文崩れと括弧対応に問題がないことを確認する。

## Assumptions
- 目的は下半身レイヤーの完全置換ではなく、現行レイヤーを自然に見せること。
- オフセットは `x/z` のみで、`y` は動かさない。
- オフセット量は初回実装では固定値運用とし、調整 UI は増やさない。
- 俯角の補間は線形で十分とし、特殊なイージングは入れない。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を今回タスク用へ切り替える
- [x] プレイヤー実位置と描画用視点オフセットの基盤を `main.ts` に追加する
- [x] `camera.position` 依存のゲームロジックを実位置参照へ差し替える
- [x] 壁クランプと描画前後のカメラ適用/復帰を統合する
- [x] `docs/plan.md` を結果で更新し、`npm run build` で検証する
- [x] follow-up として、下半身レイヤーを一時非表示にし、プレイヤースプライトを主カメラへ出す追試を入れる
- [x] follow-up 修正として、俯角時の描画用カメラオフセットを画面奥方向へ反転する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う

## 結果
- 既存の `docs/plan.md` は `docs/plan_2026-03-20_first-person-foot-view-offset-prev.md` へ退避し、今回タスク用の計画へ切り替えた。
- `src/main.ts` に `playerEyeBasePosition`、`playerEyeRenderOffset`、`playerEyeRenderPosition` を追加し、プレイヤー実位置と描画用視点位置を分離した。あわせて、描画用前方オフセットの算出、壁コライダーへのレイによるクランプ、描画前適用、描画後復帰の helper を追加した。
- 描画用前方オフセットは、カメラの下向き成分が45度相当を超えたときだけ有効にし、真下へ向くほど `layout.cellSize * 0.18` まで線形に増えるようにした。オフセット方向は前方ベクトルの床面射影を使い、射影が極小のときは `camera.rotation.y` 由来の水平向きを使う。
- 壁抜け防止のため、`stageParts.colliders` から作る集合を `updateStageState()` で更新し、実位置から描画位置候補までの短いレイで最初の壁ヒット手前へクランプするようにした。
- プレイヤー実位置を参照すべき処理は `camera.position` 直読をやめ、`playerEyeBasePosition` を使うよう統一した。対象はプレイヤーボイスと SE リスナー距離判定、execution 中のプレイヤー照準/被弾位置、NPC/ビット向け player target、プレイヤー被弾中心計算、ミニマップ、`syncPlayerPresentation()`、NPC 被弾エフェクト距離判定、プレイヤー脅威判定と NPC ブロッカー生成を含む。
- `src/game/playerAbility.ts` の `PlayerAbilityFrameContext` に `playerPosition` を追加し、画面内脅威判定の距離計算と `brainwash-complete-no-gun` 時のプレイヤーブロッカー生成が、描画用オフセットではなくプレイヤー実位置を使うようにした。
- メインループは、フレーム開始時に実位置へ復帰してからゲーム更新を行い、移動や演出でカメラが動いた直後に実位置を再取得し、HUD/音声更新の後でのみ描画用オフセットを適用する順へ整理した。反射カメラ同期と `scene.render()` は描画位置で行い、描画直後に再度実位置へ戻す。
- `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning は出たが失敗ではなく、今回の変更による構文崩れや括弧対応の問題はなかった。
- follow-up の追試として、`src/main.ts` に `firstPersonPreviewUsePlayerSprite = true` を追加し、既存の `firstPersonBodyMesh` は常に非表示にした。その代わり、下半身レイヤーを使っていたフェーズではプレイヤースプライト/ビルボードを主カメラにも通すよう `playerLayerMask` を `worldLayerMask` へ切り替えた。
- 追試表示では、`shouldSyncPlayerAvatarToCamera(gamePhase)` が有効なフェーズに限り、プレイヤースプライトの表示位置を `playerEyeBasePosition + playerEyeRenderOffset * 2` へ寄せるようにした。これにより、正面時は従来どおり画面内に出にくく、下を向いて描画用カメラが前へ出たときだけ主カメラ下端へ入りやすい状態にしている。
- 上記追試後も `npm run build` は成功した。今回は見た目確認前の実験実装であり、実際の映り方はプレイ画面で確認する前提とする。
- follow-up 修正として、俯角時の描画用カメラオフセットの水平方向を反転し、`camera.getDirection()` の床面射影と yaw フォールバックの両方で「画面奥」へ進む符号へ修正した。これにより、下を向いたときの描画用視点が奥へ出る前提へ揃えた。
- 上記修正後も `npm run build` は成功した。Vite の chunk size warning と CJS build deprecation warning は出るが、ビルド自体は成功している。
