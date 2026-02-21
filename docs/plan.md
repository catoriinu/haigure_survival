# タイトル画面「ゲームが終了しない可能性があります」条件再整理 計画

更新日: 2026-02-21

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# タイトル画面「ゲームが終了しない可能性があります」条件再整理 計画

## 概要
現行の警告判定を、現在の設定項目とステージ特性に合わせて再定義します。
方針は「実運用重視（誤警告を減らす）」で、`arena_trap_room` と `labyrinth_dynamic` は警告対象外にします。
また、`銃なしのみ + 銃なし接触洗脳OFF` を終了不能リスクとして判定に含めます。

## 判定仕様（決定版）
`src/main.ts:211` の `hasNeverGameOverRisk` を以下の順序で判定します。

1. ステージ例外
- `stageId === TRAP_STAGE_ID` または `stageId === LABYRINTH_DYNAMIC_STAGE_ID` のとき `false`（警告非表示）。

2. プレイヤー初期状態
- `startPlayerAsBrainwashCompleteGun === true` のとき `false`。

3. ビット出現設定
- `disableBitSpawn === false` のとき `false`。

4. 初期洗脳済みNPC人数
- `n = floor(initialNpcCount * initialBrainwashedNpcPercent / 100)`。
- `n <= 0` のとき `true`（警告表示）。

5. 初期洗脳済みNPCの実効攻撃手段
- `hasGunRoute = npcBrainwashCompleteGunPercent > 0`
- `hasNoGunTouchRoute = npcBrainwashCompleteNoGunPercent > 0 && brainwashOnNoGunTouch === true`
- `hasGunRoute || hasNoGunTouchRoute` なら `false`、それ以外は `true`。

## 実装変更点
1. `src/main.ts`
- `hasNeverGameOverRisk` の引数に `stageId: string` を追加。
- 上記「判定仕様（決定版）」のロジックへ置換。
- `updateTitleGameOverWarning` から `stageSelection.id` を渡すよう修正。
- 文言は現状維持（`titleGameOverWarning.textContent` は変更しない）。

2. `docs/plan.md` 運用（AGENTS.md準拠、実装時）
- まず `Get-Date -Format yyyy-MM-dd` で日付取得。
- 既存 `docs/plan.md` の扱いをルール通り更新し、今回計画・進捗・結果を記録。

## 公開API / インターフェース変更
- 外部公開API変更なし。
- 内部関数シグネチャ変更のみ:
  - `src/main.ts` の `hasNeverGameOverRisk` に `stageId` 引数を追加。

## テストケース / 確認シナリオ
1. `arena_trap_room` 選択時は常に警告非表示。
2. `labyrinth_dynamic` 選択時は常に警告非表示。
3. 非例外ステージで `disableBitSpawn=false` は警告非表示。
4. 非例外ステージで `disableBitSpawn=true`、`startPlayerAsBrainwashCompleteGun=true` は警告非表示。
5. 非例外ステージで `disableBitSpawn=true`、`startPlayerAsBrainwashCompleteGun=false`、`n=0` は警告表示。
6. 非例外ステージで `disableBitSpawn=true`、`n>0`、`gun%>0` は警告非表示。
7. 非例外ステージで `disableBitSpawn=true`、`n>0`、`gun%=0`、`noGun%>0`、`brainwashOnNoGunTouch=true` は警告非表示。
8. 非例外ステージで `disableBitSpawn=true`、`n>0`、`gun%=0`、`noGun%>0`、`brainwashOnNoGunTouch=false` は警告表示。
9. 非例外ステージで `disableBitSpawn=true`、`n>0`、`gun%=0`、`noGun%=0` は警告表示。
10. ステージ切替直後（タイトル画面）でも判定が即時反映されること。

## 前提・採用したデフォルト
- 判定方針は「実運用重視」。
- ステージ例外は `TRAP + Dynamic` の2種類。
- `銃なしのみ + 接触洗脳OFF` は終了不能リスクとして警告対象。
- `アラームトラップ有効化` は単独で終了手段にならないため、警告判定には使わない。

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-02-21_npc-brainwashed-slider-prev.md` へ改名し、新規 `docs/plan.md` を作成
- [x] `src/main.ts` の `hasNeverGameOverRisk` を新仕様へ更新（`stageId` 引数追加、判定順序反映）
- [x] `updateTitleGameOverWarning` を新シグネチャへ接続（`stageSelection.id` を渡す）
- [x] タイトル画面以外で警告が再表示されないように `updateTitleGameOverWarning` に表示ガードを追加
- [x] `npx tsc -p tsconfig.json --noEmit` で型チェック

## 結果
- `hasNeverGameOverRisk` に `stageId` 引数を追加し、`TRAP` / `LABYRINTH_DYNAMIC` のステージ例外を先頭判定に実装した。
- プレイヤー初期状態、ビット出現設定、初期洗脳済みNPC人数 `n`、および実効攻撃手段（`gun%` / `noGun% + 接触洗脳ON`）を判定順序どおり反映した。
- `updateTitleGameOverWarning` の呼び出しを更新し、`stageSelection.id` を渡してステージ依存判定を有効化した。
- `titleGameOverWarningEnabled` フラグを追加し、`startGame` でOFF、`returnToTitle` でONに切り替えることで、ゲーム開始後の `blur/change` による警告再表示経路を無効化した。
- `npx tsc -p tsconfig.json --noEmit` は成功した。
