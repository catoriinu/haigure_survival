# プレイヤー移動の責務分離と慣性復元 計画

更新日: 2026-03-21

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# プレイヤー移動の責務分離と慣性復元 計画

## Summary
- 現在の `(moveSpeed * delta) / (1 - camera.inertia)` 補正は最終形としては採用しない。
- 一番筋の良い設計は、「プレイヤーの物理実体」と「カメラ表示」を分離し、移動速度と慣性を Babylon の `camera.inertia` ではなくゲーム側の明示的な状態で管理する構成にすること。
- 具体的には、専用のプレイヤー衝突メッシュを移動の唯一の正とし、`playerEyeBasePosition`、カメラ、キャラスプライト、ミニマップ、当たり判定参照はすべてそこから派生させる。

## Key Changes
- `main.ts` に不可視の `playerCollisionMesh` を追加する。
  - 公開APIの `AbstractMesh.moveWithCollisions()` を使う。
  - `checkCollisions = true`、`ellipsoid` と `ellipsoidOffset` は現行カメラ相当の体格に合わせる。
  - `camera` は衝突実体から外し、表示専用に戻す。`camera.inertia` と `camera.checkCollisions` はプレイヤー移動の挙動決定に使わない。
- プレイヤーの正位置を「衝突メッシュの足元基準位置」に統一する。
  - `playerEyeBasePosition` は毎フレーム `playerCollisionMesh.position` と `getEyeHeight()` から再計算する派生値に変更する。
  - `capturePlayerEyeBasePosition()` で `camera.position` を正とみなす流れは廃止する。
  - `applyRenderCameraPosition()` はあくまで描画用オフセットだけを扱い、移動や同期の責務を持たせない。
- 移動モデルを専用状態へ切り出す。
  - `playerAbility.ts` から `applyMovement()` を削除し、入力軸取得だけを残す。
  - 新しい内部 `PlayerMotionController` を追加し、水平移動用の `moveMomentum` を永続状態として持つ。
  - 慣性は `moveInertiaAt60Fps = 0.9` を初期値とする明示的パラメータにする。これは「旧体感に近い僅かな滑り」を再現するためのゲーム側設定であり、`camera.inertia` とは無関係にする。
  - 毎フレームの流れは次で固定する。
    1. `computeCharacterFacingYawFromViewMatrix()` で水平 yaw を求める。
    2. `playerAbility.getMoveAxes()` で入力軸を取る。
    3. `PlayerMotionController` が、入力分と前フレームの `moveMomentum` から「今回要求する水平 displacement」を作る。
    4. その displacement を `playerCollisionMesh.moveWithCollisions()` に通す。
    5. 実際に動いた量 `actualDisplacement` を測り、次フレーム用 `moveMomentum` を `actualDisplacement * frameInertia` で更新する。
  - これにより、キー押下中の加速感と、キーを離した直後の僅かな慣性移動を復活させつつ、壁衝突後は実移動量ベースで慣性が減衰する。
- ブロック時とフェーズ遷移時の挙動を明示する。
  - `allowMove = false` のフレームでは新規移動を行わず、`moveMomentum` は即時ゼロにする。NPC 接触ブロック中に惰性で滑り続けない仕様にする。
  - スポーン、リセット、タイトル遷移、アセンブリ遷移、ルーレット遷移、実行シーン遷移では `playerCollisionMesh.position` と `moveMomentum` を必ず明示的に初期化する。
  - `roulette` のように自由移動しないフェーズでも、プレイヤー位置の唯一の正は同じ変数群に揃え、復帰時に位置がズレないようにする。
- 表示系は派生専用に揃える。
  - `syncPlayerPresentation()`、一人称プレビュー位置、地面影、被弾判定のプレイヤー位置、ミニマップ、音源位置は `playerEyeBasePosition` だけを見る。
  - 後退時に自キャラスプライトが映る問題は、カメラとスプライトが同じ正位置から派生することで解消する。
  - 視線上下、射撃方向、俯角時の描画用カメラオフセットの仕様は変更しない。

## Interfaces / Types
- `PlayerAbilityController`
  - `applyMovement(...)` は削除する。
  - `getMoveAxes(): { moveX: number; moveZ: number }` を追加する。
  - 既存の入力管理、スタミナ管理、脅威判定の責務は維持する。
- 新規内部 `PlayerMotionController`
  - `reset()`
  - `update(moveAxes, horizontalFacingYaw, delta, allowMove, moveSpeed): requestedDisplacement`
  - `commit(actualDisplacement): void`
- 新規内部設定
  - `moveInertiaAt60Fps`
  - `moveStopEpsilon`
- `playerEyeBasePosition` は「カメラから捕捉した値」ではなく「プレイヤー実体から導出した目線位置」という意味に統一する。

## Test Plan
- `playing`、`assemblyFree`、`execution` で、水平、45度下、80度下、80度上、ほぼ真上、ほぼ真下でも `W/S` が常に水平方向へ移動すること。
- `W/A/S/D` を離した直後に、以前と同程度のごく短い慣性移動が入り、その後自然に停止すること。
- `W`→`S`、`A`→`D` の切り返しで、移動量と向きが破綻しないこと。
- 壁・角・NPC ブロックに慣性付きで当たっても、めり込み、震え、永続的な押しつけが発生しないこと。
- `S` で後退し続けても自キャラスプライトが画面へ映り込まないこと。
- スポーン直後、リセット直後、タイトル復帰、ルーレット遷移、実行シーン遷移後に、位置ずれや古い慣性の持ち越しがないこと。
- ミニマップ、音源位置、ビーム当たり判定、プレイヤー脅威判定が従来どおりプレイヤー位置へ追従すること。
- `npm run build` を実行し、型エラーと構文崩れがないことを確認する。最後に、移動更新まわりの if/return 追加箇所と描画復帰処理の括弧対応を目視確認する。

## Assumptions
- 今回は「全面整理」を採用し、最小修正や `camera.inertia` 依存の補正は残さない。
- 慣性の初期値は「旧体感に近い僅かな滑り」を優先して `0.9 @ 60fps` 相当で開始し、必要なら手触りだけを微調整する。旧挙動の数値完全一致までは要求しない。
- プレイヤーの自由移動仕様、スタミナ仕様、射撃方向、俯角時カメラオフセット、一人称見た目の基本仕様は維持する。

## ステップ
- [x] `docs/plan.md` を今回タスク用へ切り替え、実装方針を記録する
- [x] `PlayerAbilityController` から移動適用責務を外し、入力軸取得APIへ整理する
- [x] `PlayerMotionController` と `playerCollisionMesh` を導入し、プレイヤー移動の正位置を衝突メッシュへ統一する
- [x] カメラ、キャラスプライト、各種参照位置を `playerEyeBasePosition` 派生へ揃え、フェーズ遷移時の初期化を更新する
- [x] `docs/plan.md` の結果を更新し、`npm run build` と括弧確認で仕上げる

## 結果
- 直前の計画は `docs/plan_2026-03-21_ws-horizontal-movement-followup-prev.md` へ退避し、今回タスク用の `docs/plan.md` へ切り替えた。
- `src/game/playerAbility.ts` から移動適用責務を削除し、`getMoveAxes()` を追加して入力軸取得だけを公開する構成へ整理した。スタミナ管理、脅威判定、入力状態管理の責務は維持している。
- `src/game/playerMotion.ts` を新規追加し、ゲーム側の明示的な `moveMomentum` を保持する `PlayerMotionController` を実装した。慣性は `moveInertiaAt60Fps = 0.9` を 60fps 基準で減衰させる方式で管理し、キー押下中の加速感とキー離し後の短い慣性移動を `camera.inertia` 非依存で再現する。
- `src/main.ts` に不可視の `playerCollisionMesh` を追加し、`camera.checkCollisions = false` へ変更した。`updatePlayerMovement()` は `computeCharacterFacingYawFromViewMatrix()` と `playerAbility.getMoveAxes()` から要求移動量を作り、`playerCollisionMesh.moveWithCollisions()` の実移動量を `playerMotion.commit()` へ返す流れへ置き換えた。
- `playerEyeBasePosition` は `playerCollisionMesh.position + getEyeHeight()` から毎フレーム再計算する派生値へ統一した。これに合わせてカメラ基準の `capturePlayerEyeBasePosition()` は廃止し、`restorePlayerEyeBasePosition()` は描画用カメラオフセットを外した後に必ずプレイヤー実位置へ戻す役割へ整理した。
- スポーン、リセット、ルーレット、実行シーン移行時には `playerCollisionMesh` と `playerMotion` を明示的に初期化するよう更新した。カメラ、キャラスプライト、被弾判定、音源、ミニマップなどが参照する `playerEyeBasePosition` は、今回の統一後もプレイヤー実位置から派生する。
- `npm run build` は成功した。Vite の chunk size warning と CJS build deprecation warning は継続して出るが、今回の変更による型エラーや構文崩れは発生していない。
- `updatePlayerMovement()`、`restorePlayerEyeBasePosition()`、描画ループ内の `if` 分岐追加箇所を見直し、今回の差し替えで括弧対応が崩れていないことを確認した。
