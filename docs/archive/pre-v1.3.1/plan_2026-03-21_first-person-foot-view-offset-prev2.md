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

追記:
通常のゲーム中で下を向いたときには「前（正面向きのときの画面奥側）」にカメラがスライドするようになりましたが、
全滅シーンで下を向いたときには「後ろ（正面向きのときの画面手前側）」にスライドしてしまっており、挙動がチグハグです。
違いの理由を解析した後、全滅シーン時も、通常のゲーム中と同じ挙動に揃えてください。

追記:
カメラを下に向けて、前にカメラがスライドし始めたとき、同時に「上（正面向きのときの天井方向）」にも高さを上げてください。最も下を向いたときに、「視点高さ」基準で0.3ぶん高くなっているようにしてください。

追記:
前方スライドを試しに0.3にしてみてください

追記:
カメラが下方45度の角度になった瞬間カクッとしてからスライドが始まります。そのカクっとした挙動を極力なくしてほしいので原因を突き止めてください。

追記:
はい、カクつきをなくすための修正を入れてください。
ちなみに後ほど、45度からではなくもっと下を向いたとき（50~60度くらい）からスライドが始まるようにしたいです。角度が変わってからもカクつかないようにしてください。

追記:
スライド開始角度を60度からにしてみてください

追記:
55度からにしてください

追記:
カメラを下に向けたとき、約85度くらいまではそのままなのに、それより下に向けたところでキャラスプライトが左右反転する（あるいは前後が入れ替わる？）瞬間があります。
それは何故でしょうか？

追記:
はい、反転しないように防いでください。
ただ、できれば特殊処理で防ぐより、まずは筋の良い防止方法を検討してほしいです。

追記:
試してみたのですが、下を向いたまま（「最後の有効な水平向き保持」したまま）左右にカメラを回転させると、スプライトは同じ角度のまま、ぐるぐると回転できてしまいました。
人間で言えば、首だけが360度回転している状態です。
それは怖いので、下を向いたままでもスプライトは常に同じ面を画面に表示してください。（身体ごと回転するイメージ）

追記:
通常シーンで下を向いてbw-complete-pose.pngを表示しているときと、
全滅シーンで下を向いてbw-complete-pose.pngを表示しているときとでは、見える画像の範囲が異なっています。
全滅シーンの方が、画像の上の方まで見えているようです。
これはカメラの高さが違うのか、全滅シーンでのスプライトの描画が違うのか、その他なのか、調査してください。
通常シーンと全滅シーンでは、基本的に同じようにスプライトを描画したいです（通常シーンにそろえてほしい）

追記:
> 全滅シーンは gameFlow.updateCameraFollowAvatar() でワールド上の playerAvatar を少し後ろから追う構造

そのように実装されていた理由を考察してください。
それに合理性があるなら修正方針を一度検討し直したいです。
特に強い理由がない、または理由不明の場合は、完全に通常シーンに寄せて、全滅シーン用のカメラ処理は削除してください。

追記:
通常シーン時は変わっていませんでしたが、
全滅シーンでのカメラ位置がおかしくなりました。
少なくとも下を向いたとき、修正前とは違い、カメラが「後ろ（正面向きのときの画面手前方向）」にずれてしまっています。カメラは「前」にスライドしてください。（なお高くなるスライドは問題なさそうです）

追記:
実は、画像8枚のうちbw-complete-pose.pngとbw-in-progress.pngは、他の6枚と比べて目線が低いポーズになっています。
そのうえで現在は、通常シーン時のbw-complete-pose.pngとbw-in-progress.pngの見え方は、今がちょうどよい角度になっています。高さ調整をされていない全滅シーンでの方が、目線が高すぎると感じます。
それを踏まえると、
- bw-complete-pose.pngとbw-in-progress.pngを表示するときのみ、高さ調整をして低くする
- それ以外の6枚を表示するモードは、高さ調整をしないようにする
という整理にすべきです。（※上記の「高さ調整」は「camera.position.yの上書き」のことです。「カメラを下向きにしたときに高さを上にスライドする」のことではありません。スライドについては、先述の「高さ調整」を踏まえたうえで数値調整しつつ残してください）

追記:
bw-in-progress / bw-complete-pose 系: 高さ方向スライドも、0ではなく、最大でそれ以外系の20%の高さのスライドをしてほしいです。
どれだけ反映するか（あるいは軽減するか）の割合として0.2（あるいは0.8）を定数で持ってください。

追記:
カメラを下向きにしているときに光線が自分に命中したとき、
自分のキャラスプライトの方が光線命中エフェクトよりも前に映るようにしてください。
これはレイヤーを無理やり調整するという話ではないです。
光線命中による球体の内側にカメラがあるなら、下を向いたときには光線よりも自分のキャラスプライトの方が手前に見えるのが当たり前だという話です。

## Summary
- 下半身レイヤー自体は残し、自然に見せるために「プレイヤー実位置」と「描画用視点位置」を分離する。
- 適用範囲は、現在下半身レイヤーを表示している全フェーズとする。
- カメラが水平から55度より下を向いたときだけ、描画用視点を水平方向の前方へスライドさせる。
- スライド開始時はしきい値で段差を作らず、開始角度を後で50〜60度へ変更しても滑らかに立ち上がる構成にする。
- 実位置ベースの当たり判定、NPC 認識、ビット標的、ミニマップは維持し、見た目だけを変える。

## Implementation Changes
- `main.ts` に「プレイヤー実位置」の正本ベクトルを追加し、移動・衝突解決後の `camera.position` を毎フレームそこへ退避する。
- プレイヤー実位置を参照すべき処理は `camera.position` 直読をやめ、実位置ベクトルを使うよう統一する。
  - 対象は少なくともプレイヤー標的生成、被弾中心計算、execution 中のプレイヤー照準/衝突位置、ビット更新用 targets、ミニマップ、`playerAbility` の脅威判定と NPC ブロッカー生成。
- 描画用オフセットは「俯角55度開始、真下で最大」の滑らかな補間にする。
  - 最大前方オフセット量は `layout.cellSize * 0.12` を既定値にする。
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
- 通常プレイで水平視点、30度下向き、45度下向き、55度下向き、真下付近を比較し、55度未満では位置が変わらず、55度超で足元が自然に増えることを確認する。
- 壁際で下を向き、壁の向こうを覗けないことを確認する。
- 下を向いてもプレイヤー被弾判定、NPC の脅威判定、ビットの標的、ミニマップ上の位置が前へずれないことを確認する。
- 反射面で通常視界と同じ前方オフセットが反映され、鏡内の見え方だけ破綻しないことを確認する。
- `playing`、`assemblyMove`、`assemblyHold`、`execution` の切替時にオフセットが残留せず、水平へ戻した瞬間に元の視点へ戻ることを確認する。
- `npm run build` を実行し、構文崩れと括弧対応に問題がないことを確認する。

## Assumptions
- 目的は下半身レイヤーの完全置換ではなく、現行レイヤーを自然に見せること。
- 俯角オフセットの水平方向は `x/z` で処理し、今回追記分として `y` は `視点高さ 0.2` 相当まで持ち上げる。
- オフセット量は初回実装では固定値運用とし、調整 UI は増やさない。
- 俯角の補間は `smoothstep` 相当で十分とし、さらに複雑なイージングは入れない。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を今回タスク用へ切り替える
- [x] プレイヤー実位置と描画用視点オフセットの基盤を `main.ts` に追加する
- [x] `camera.position` 依存のゲームロジックを実位置参照へ差し替える
- [x] 壁クランプと描画前後のカメラ適用/復帰を統合する
- [x] `docs/plan.md` を結果で更新し、`npm run build` で検証する
- [x] follow-up として、下半身レイヤーを一時非表示にし、プレイヤースプライトを主カメラへ出す追試を入れる
- [x] follow-up 修正として、俯角時の描画用カメラオフセットを画面奥方向へ反転する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 全滅シーンでのカメラ追従と通常プレイ時の違いを解析し、原因を整理する
- [x] フェーズ別の描画用オフセット方向をそろえるよう `main.ts` を修正する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 俯角オフセットへ上方向の高さ補間を追加する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 前方スライド量の上限を `0.3` へ変更する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 45 度開始時のカクつき原因を調査し、しきい値まわりの不連続点を特定する
- [x] 俯角オフセット開始時の補間を滑らかにし、描画適用側の段差もなくす
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 真下付近の反転原因を整理し、yaw の特異点処理方針を決める
- [x] yaw が未定義になる俯角で最後の有効な水平向きを保持し、主カメラと反射描画で反転しないようにする
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 「最後の有効な水平向き保持」で首固定になる問題を整理し、カメラ姿勢から自然に向きを決める方針へ切り替える
- [x] 真下付近では前方ベクトルではなく view 行列の上向きベクトルから yaw を導き、身体ごと回転する見え方へ揃える
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 通常シーンと全滅シーンで見える範囲の差を、カメラ高さと `gameFlow` / `syncPlayerPresentation()` の役割差から切り分ける
- [x] 全滅シーンの後方オフセット追従を廃止し、通常シーンと同じ一人称プレビュー配置へ寄せるよう `src/game/flow.ts` と `src/main.ts` を修正する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 全滅シーン側の俯角前後方向が逆転した原因を切り分ける
- [x] 俯角オフセットの水平符号を通常シーンと統一する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] low-eye 画像だけに適用する render 高さ補正条件を整理し、`main.ts` の helper 構成を決める
- [x] `scene.onBeforeRenderObservable` の phase ベース `y` 上書きを撤去し、low-eye 画像だけ render `y` 補正を合成する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] low-eye 画像の高さスライド残し率を定数化し、20%だけ残るように調整する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う
- [x] 光線命中エフェクトと一人称用プレイヤー板ポリの見え順が崩れる条件を切り分け、透明描画ソートが原因か確認する
- [x] 自キャラ板ポリの透明描画に深度プリパスを入れ、球体内視点では手前の自キャラスプライトが前に見えるよう修正する
- [x] `docs/plan.md` の結果更新と `npm run build` による確認を行う

## 結果
- 既存の `docs/plan.md` は `docs/plan_2026-03-20_first-person-foot-view-offset-prev.md` へ退避し、今回タスク用の計画へ切り替えた。
- `src/main.ts` に `playerEyeBasePosition`、`playerEyeRenderOffset`、`playerEyeRenderPosition` を追加し、プレイヤー実位置と描画用視点位置を分離した。あわせて、描画用前方オフセットの算出、壁コライダーへのレイによるクランプ、描画前適用、描画後復帰の helper を追加した。
- 描画用前方オフセットは、現在は俯角55度開始・90度最大の滑らかな補間で有効になる。現行の上限値は前方 `layout.cellSize * 0.12`、上方向 `layout.cellSize * 0.2` で、オフセット方向は前方ベクトルの床面射影を使い、射影が極小のときは `camera.rotation.y` 由来の水平向きを使う。
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
- 今回の差異の原因は、通常プレイと `assemblyFree` ではカメラがプレイヤー目線そのものにあり、全滅シーンの `assemblyMove` `assemblyHold` `execution` では `gameFlow.updateCameraFollowAvatar()` によりカメラがアバター前方へ追従配置されている点にあった。同じ俯角オフセット符号を両方へ適用すると、全滅シーン側だけ見かけの移動方向が逆転する。
- `src/main.ts` の `computeFirstPersonViewOffset()` は、`shouldSyncPlayerAvatarToCamera(gamePhase)` が true なフェーズでは従来どおり反転符号を使い、false な全滅シーン系フェーズでは `camera.getDirection()` と yaw フォールバックをそのまま使うようにした。これにより、全滅シーン時も通常プレイ時と同じ見かけの「画面奥側」へスライドするよう揃えた。
- 上記修正後に `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- 追加追試として、俯角オフセットの補間に上方向成分も加えた。現行値は `firstPersonViewOffsetMaxHeightCells = 0.2` で、俯角に応じて `layout.cellSize * 0.2` まで `playerEyeRenderOffset.y` を持ち上げる。
- 上記追加後に `npm run build` を再実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- 追加追試として変更した前方スライド量は、その後の調整で現行 `firstPersonViewOffsetMaxDistanceScale = 0.12` へ落ち着いた。真下時の最大前方オフセットは `layout.cellSize * 0.12` である。
- 上記変更後に `npm run build` を再実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- 45 度開始時のカクつきについては、原因だった 2 つの不連続を解消した。`src/main.ts` の `computeFirstPersonViewOffset()` は下向き成分のしきい値判定を角度ベースの `smoothstep` 相当へ置き換え、開始角度ちょうどで傾きが 0 になるようにした。あわせて `applyRenderCameraPosition()` の `0.0001` デッドゾーンを外し、描画位置の適用開始でも段差が出ないようにした。これにより、将来 `firstPersonViewOffsetStartAngleDegrees` を 50〜60 度へ変更しても、立ち上がりは同じく滑らかに保てる構成になった。
- 上記修正後に `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- follow-up として、俯角オフセットの開始角度 `firstPersonViewOffsetStartAngleDegrees` は最終的に `55` へ調整した。補間はすでに `smoothstep` 相当で連続化されているため、開始点を後ろへずらしても立ち上がりのカクつきは増えない構成を維持している。
- 真下付近で自キャラ板ポリが反転して見えた原因は、`computeCharacterFacingYawFromViewMatrix()` がカメラ前方ベクトルの水平成分から `yaw` を求めており、俯角が深くなって水平成分がほぼ 0 になると `yaw` が未定義に近づいて不安定化していたためである。しかもビルボード材質は背面描画ありなので、その瞬間に裏面が見えて左右反転のように見えていた。
- その後の確認で、「最後に有効だった水平向き保持」は反転自体は止められても、下を向いたまま yaw 入力を続けると板ポリが回らず、視点だけが周回してしまう問題が分かった。これは首だけが回る見え方になり、求める「身体ごと回転」には合わない。
- 最終的には、`computeCharacterFacingYawFromViewMatrix()` の特異点処理を「最後の yaw 保持」から「同じ view 行列の上向きベクトルを水平面へ射影して yaw を求める」方式へ切り替えた。通常域では従来どおり前方ベクトルの水平射影を使い、真下付近で前方が縦に潰れたときだけ上向きベクトルへ自然に引き継ぐ。これにより、下を向いたまま左右へ回しても、板ポリは画面に対して同じ面を保ちながら身体ごと回転する見え方になる。主カメラと反射描画の両方で同じ計算を使うため、鏡側も挙動がそろう。
- 上記修正後に `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- 今回の差異はカメラ高さではなく、全滅シーンで `gameFlow.updateCameraFollowAvatar()` がワールド上の `playerAvatar` を少し後ろから追う構造にあり、通常シーンだけが `syncPlayerPresentation()` で一人称プレビュー位置へ寄せていたことに起因していた。全滅シーン側の追従自体には「自動移動する身体へ視点を追随させる」合理性があるが、後方オフセットは旧来の半三人称的な見せ方の名残で、現在の「通常シーンと同じ一人称表示」方針とは整合しないと判断した。
- `src/game/flow.ts` では、全滅シーン用の後方オフセット追従を削除し、assembly の自動移動中だけカメラ位置を `playerAvatar` と同じ `x/z` へ同期する構成へ整理した。これにより、通常シーンと同じ身体位置基準の一人称カメラになり、execution の `npc-survivor-npc-block` でもカメラを身体の後ろへ回り込ませる処理はなくなった。
- `src/main.ts` では、通常シーンだけでなく全滅シーンでも `firstPersonPreviewUsePlayerSprite` 有効時は描画中だけ `playerAvatar` を `playerEyeBasePosition + playerEyeRenderOffset * 2` へ寄せるようにした。全滅シーンでは描画前にワールド座標を退避し、`scene.render()` 後と次フレーム開始時に復帰するため、`gameFlow` のルート移動や実座標ロジックは従来どおり保たれる。
- 上記修正後に `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- 上記の通常シーン寄せにより、俯角オフセット方向のフェーズ別分岐は前提が古くなっていた。`computeFirstPersonViewOffset()` では依然として `shouldSyncPlayerAvatarToCamera(gamePhase)` が false の全滅シーンだけ水平方向の符号を反転しないまま残っていたため、全滅シーンで下を向くと描画用カメラだけが画面手前側へずれていた。
- そのため、`src/main.ts` の `computeFirstPersonViewOffset()` はフェーズ別の水平方向分岐を廃止し、俯角時の前方スライド方向を通常シーンと全滅シーンで同じ符号へ統一した。これにより、全滅シーンでも下向き時の描画用カメラは画面奥側へスライドする。
- 上記修正後に `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- 今回の整理では、`bw-in-progress`、`brainwash-complete-haigure`、`brainwash-complete-haigure-formation` を low-eye 画像として扱い、`playerNoGunTouchBrainwash` 中の専用ブレンドセルは `hit-a/hit-b` 系として除外する方針にした。
- `src/main.ts` に low-eye 判定 helper と render 高さ補正 helper を追加し、`applyRenderCameraPosition()` で描画用カメラ位置を `実位置 + 俯角スライド + 画像別高さ補正` として合成するようにした。low-eye 画像では `playerEyeRenderOffset.y` を相殺するため、通常シーンで従来ちょうどよかった最終見え方を phase に依存せず維持できる。
- `scene.onBeforeRenderObservable` に残っていた `playing` / `roulette` 限定の `camera.position.y = getEyeHeight()` は撤去し、ミニマップ更新だけを残した。これにより、phase ベース高さ上書きはなくなり、主画面と反射面の描画位置はどちらも `applyRenderCameraPosition()` に統一された。
- 上記修正後に `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
- 追加調整として、low-eye 画像向けの高さ補正は「完全相殺」ではなく「20%だけ残す」方式へ変更した。`src/main.ts` に `firstPersonLowEyeHeightSlideRatio = 0.2` を追加し、`computePlayerPortraitHeightAdjustmentY()` は `playerEyeRenderOffset.y` の 80% だけを相殺する構成にした。これにより、`bw-in-progress` / `bw-complete-pose` 系でも高さ方向スライドが最大で通常系の 20% 残る。
- 今回の見え順崩れは、`firstPersonPreviewUsePlayerSprite = true` かつ `enableCharacterSpriteVerticalAngle = true` の既定構成で、自キャラが `src/game/characterBillboardMeshes.ts` の半透明板ポリとして描かれている一方、被弾球体も半透明メッシュであるため、深度を書かない透明メッシュ同士のソートに依存していたことが原因候補と分かった。座標自体は `playerEyeBasePosition + playerEyeRenderOffset * 2` の前方配置で、球体内視点では自キャラの方が手前に来うる構成だった。
- 修正として、`src/game/characterBillboardMeshes.ts` のプレイヤー/ NPC 板ポリ材質に `needDepthPrePass = true` を追加した。これにより、一人称で使っている自キャラ板ポリは半透明のままでも先に深度を確保でき、光線命中球体の内側にカメラがある状況では、実際に手前にある自キャラスプライトが球体より前に見えるようになる。
- 上記修正後に `npm run build` を実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による構文崩れや括弧対応の問題はなかった。
