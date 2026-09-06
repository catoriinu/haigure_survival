# プレイヤー能力リファクタリング 計画

更新日: 2026-03-20

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# feature_add_player_ability リファクタリング調査結果

## 要約
- `develop...HEAD` の差分を確認し、現状 `npm run build` は成功した。
- リファクタリング余地は十分ある。優先度は 1. プレイヤー能力ロジックの `main.ts` 集中解消、2. HUD/ヘルプ表示の状態遷移統合、3. `updateNpcs` の引数整理。
- 主因は [src/main.ts](../../../src/main.ts#L1987) に今回ブランチの追加責務が集中し、[src/game/npcs.ts](../../../src/game/npcs.ts#L315) の更新 API が肥大化し、[src/ui/hud.ts](../../../src/ui/hud.ts#L89) の表示ポリシーが呼び出し側へ漏れている点。

## 実装方針
- `main.ts` から「移動入力集約・ダッシュ判定・スタミナ更新・プレイヤー由来脅威判定」を `playerAbility` 系モジュールへ抽出する。`camera`、`scene`、`layout`、`npcs` を受けて、そのフレームで必要な `moveSpeed`、`threatenedNpcIds`、`npcBlockers`、`staminaHudState` を返す形にする。
- `updateNpcs` は位置引数を増やし続けない形へ変更する。`NpcUpdateContext` を導入し、`targets`、衝突・脅威情報、callback、移動制約、設定値をグループ化する。プレイヤー由来脅威は `context.movement.playerThreatenedNpcIds` 経由だけで参照する。
- HUD 更新は `main.ts` と `flow.ts` の個別命令から `syncHudForPhase` 相当へ寄せる。`hudVisible`、`helpPanelText`、`crosshair`、`staminaGauge` を同じ場所で決め、`setHudVisible(false)` と `setHelpPanelText(null)` を複数箇所で手動同期しない形にする。
- フェーズ判定は `isAssemblyPhase`、`canReturnToTitleFromPhase`、`canReleaseAssemblyControl` のような共有 helper に寄せる。`main.ts`、`flow.ts`、`input.ts` で `"assemblyMove" | "assemblyHold" | "assemblyFree"` を直接列挙する箇所を置き換える。
- `index.html` と `style.css` の stamina gauge 追加は現状のままでよく、先に TypeScript 側の責務整理を優先する。

## 重要な型・IF変更
- `updateNpcs(layout, floorCells, npcs, beams, delta, elapsed, ..., brainwashOnNoGunTouch)` は `updateNpcs(layout, floorCells, npcs, beams, delta, elapsed, context)` に置き換える。
- `PlayerAbilityFrameSnapshot` を追加し、少なくとも `moveSpeed`、`threatenedNpcIds`、`npcBlockers`、`stamina` を持たせる。
- フェーズ共通 helper は `GamePhase` を受ける純関数として切り出し、`main.ts` のローカル関数定義を減らす。

## テスト観点
- `npm run build` が引き続き通ること。
- 通常時に `Shift` ダッシュでスタミナが減少し、0 到達後は回復完了まで加速しないこと。
- 洗脳完了時にスタミナゲージが最大表示になり、近距離3セルまたは画面内9セルの NPC が即座に evade 対象になること。
- `assemblyMove` と `assemblyHold` 中の `WASD` で `assemblyFree` へ移行し、`Enter` のタイトル復帰とヘルプ表示が維持されること。
- ルーレット、公開処刑、タイトル復帰でヘルプパネルと HUD が意図どおり切り替わること。

## 前提とデフォルト
- ベース比較は `develop...HEAD` を採用する。
- 目的は挙動変更ではなく責務整理で、ゲーム仕様値は変えない。
- `collectPlayerThreatenedNpcIds()` の前半用と後半用の評価タイミングは意味が異なるため、単純な1回計算への統合は行わない。必要なら「前更新 snapshot / 後更新 snapshot」を明示的に分ける。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、今回タスク用の計画へ切り替える
- [x] フェーズ helper を追加し、`main.ts` / `flow.ts` / `input.ts` の分岐重複を整理する
- [x] `playerAbility` モジュールを追加し、プレイヤー移動・ダッシュ・スタミナ・脅威判定を `main.ts` から移す
- [x] `src/game/npcs.ts` に `NpcUpdateContext` を導入し、呼び出し側の引数整理を行う
- [x] HUD 状態同期を共通化し、ヘルプ表示とスタミナ表示の更新責務を整理する
- [x] `npm run build` を再実行し、結果と実装概要を反映する

## 結果
- `src/game/phases.ts` を追加し、`GamePhase` 型と `isAssemblyPhase` / `canReleaseAssemblyControl` / `canReturnToTitleFromPhase` などの純関数へフェーズ判定を集約した。
- `src/game/playerAbility.ts` を追加し、移動入力、ダッシュ速度決定、スタミナ更新、プレイヤー由来脅威NPC判定を `PlayerAbilityFrameSnapshot` ベースで管理するようにした。
- `src/game/npcs.ts` の `updateNpcs` は `NpcUpdateContext` 受け取りへ変更し、ターゲット、callback、演出、移動制約、アラーム、設定値を構造化した。
- `src/main.ts` では `buildNpcTargets`、`createPlayerAbilitySnapshot`、`syncHudForPhase` を追加し、HUD 表示制御とフレーム更新の重複を整理した。`flow.ts` は HUD を直接更新せず、フェーズ用 override を `main.ts` 側へ渡す形に改めた。
- `src/ui/input.ts` はフェーズ helper を使うように整理し、`src/ui/hud.ts` のミニマップ描画からクロスヘア更新責務を外した。
- `npm run build` は成功した。既存どおり、Vite の CJS API 非推奨警告と 500kB 超チャンク警告は出たが、新規エラーは発生しなかった。
