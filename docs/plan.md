# W/S 水平前後移動修正計画

更新日: 2026-03-21

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# W/S 水平前後移動修正計画

## Summary
- 原因は `W/S` の移動基準がカメラ前方ベクトルの水平成分で、正規化されていないこと。
- 修正後は `W/S` を「プレイヤーの現在の水平向き」に固定し、上下を向いても常にステージ上の水平方向へ前後移動させる。

## Key Changes
- 実装着手時に現行 `docs/plan.md` を退避し、新しい `docs/plan.md` を今回タスク用へ切り替える。
- `src/main.ts` の `computeCharacterFacingYawFromViewMatrix()` を移動にも使う。
- `updatePlayerMovement()` 内で `movementYaw = computeCharacterFacingYawFromViewMatrix(camera.getViewMatrix(), currentCharacterFacingYaw)` を計算し、`currentCharacterFacingYaw` を更新して移動へ渡す。
- `src/game/playerAbility.ts` の `applyMovement` は `camera.getDirection()` ベースをやめ、`horizontalFacingYaw` から unit forward `(sin(yaw), 0, cos(yaw))` と unit right `(cos(yaw), 0, -sin(yaw))` を作って移動ベクトルを組み立てる。
- 射撃方向、視線上下、描画用カメラオフセット、一人称見た目の処理は変更しない。

## Interfaces / Types
- 内部インターフェース変更として `PlayerAbilityController.applyMovement` の第一引数を `horizontalFacingYaw: number` にし、移動の適用先として `camera: FreeCamera` は第二引数で受け取る。
- セーブデータ、UI、公開設定は変更しない。

## Test Plan
- `playing`、`assemblyFree`、`execution` の移動可能時に、水平、45度下、80度下、80度上、ほぼ真下、ほぼ真上で `W` と `S` を確認し、常に床面上で前後移動できることを確認する。
- 真上/真下付近でも、左右へ視点を回した後の `W/S` がプレイヤーの水平向きと一致することを確認する。
- `A/D`、斜め移動、ダッシュ、NPC 接触による移動阻害が従来どおり動くことを確認する。
- `npm run build` を実行し、型エラーや構文崩れがないことを確認する。最後に括弧対応を目視確認する。

## Assumptions
- 「プレイヤーのステージ上の向き」は、既存の `computeCharacterFacingYawFromViewMatrix()` が返す水平向きと同義とする。
- 斜め移動の速度仕様は今回変更しない。今回の対象は `W/S` の前後移動基準のみとする。

## ステップ
- [x] 現行 `docs/plan.md` を退避し、今回タスク用の `docs/plan.md` を作成する
- [x] `src/main.ts` で移動用の水平向きを算出し、`updatePlayerMovement()` から渡す
- [x] `src/game/playerAbility.ts` の `applyMovement()` を yaw 基準の水平移動へ変更する
- [x] `docs/plan.md` の結果を更新し、`npm run build` で確認する
- [x] `applyMovement()` 内の旧 `camera` 参照を解消し、実行時エラーを修正する
- [x] 俯角時の移動デグレを調査し、描画用オフセット復帰で移動量を失わないよう修正する

## 結果
- 現行の `docs/plan.md` を `docs/plan_2026-03-21_first-person-foot-view-offset-prev2.md` へ退避し、今回タスク用の計画へ切り替えた。
- `src/main.ts` の `updatePlayerMovement()` で、移動前に `computeCharacterFacingYawFromViewMatrix(camera.getViewMatrix(), currentCharacterFacingYaw)` を使って水平 yaw を算出し、`currentCharacterFacingYaw` を更新したうえで移動処理へ渡すようにした。
- `src/game/playerAbility.ts` の `applyMovement()` は第一引数を `horizontalFacingYaw` に変更し、`camera.getDirection()` ではなく `yaw` から作る unit forward / unit right を使って水平方向の移動ベクトルを組み立てるようにした。これにより、上下を向いても `W/S` の移動量が俯角・仰角で縮まらない。
- `npm run build` は renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は出たが、今回の変更による型エラーや構文崩れはなかった。
- 変更後の `updatePlayerMovement()` と `applyMovement()` の括弧対応を確認し、今回の if ブロック追加・差し替えによる対応崩れはないことを確認した。
- follow-up 修正として、`src/game/playerAbility.ts` の `applyMovement()` が内部で `camera.cameraDirection` を更新している点に合わせ、`camera: FreeCamera` を第二引数として明示的に受け取るようにした。これに合わせて `src/main.ts` の呼び出し側も更新し、`ReferenceError: camera is not defined` で停止する問題を解消した。
- 上記 follow-up 修正後に `npm run build` を再実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による型エラーや構文崩れはなかった。
- 今回のデグレ原因は、俯角時だけ `applyRenderCameraPosition()` が描画用オフセットを `camera.position` に乗せ、その後 `restorePlayerEyeBasePosition()` が `scene.render()` 中に反映された移動分まで含めて古い `playerEyeBasePosition` へ丸ごと巻き戻していたことにあった。そのため、見た目上はカメラが少しずれる一方で、実際のプレイヤー位置は更新されず、身体が動かない状態になっていた。
- `src/main.ts` の `restorePlayerEyeBasePosition()` は、古い実位置へ戻すのではなく、`playerEyeRenderPosition - playerEyeBasePosition` で求めた描画用オフセットだけを現在の `camera.position` から差し引く構成へ修正した。これにより、`scene.render()` 中に反映された移動量は維持したまま、描画用オフセットだけを外して次フレームの実位置へ戻せる。
- 上記デグレ修正後に `npm run build` を再実行し、renderer / electron ともに成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の修正による型エラーや構文崩れはなかった。
