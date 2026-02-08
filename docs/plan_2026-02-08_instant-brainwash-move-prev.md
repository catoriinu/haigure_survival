# DEFAULT SETTINGS に即洗脳チェック追加 計画

更新日: 2026-02-08

## プロンプト
DEFAULT SETTINGSに「即洗脳」チェックボックスを追加してください。
ONのときは、npcBrainwashInProgressDecisionDelay=0, npcBrainwashStayChance=0に上書きしてください。
すなわち、光線命中・解放後は即座に`brainwash-complete-haigure`状態になってほしいです。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] `src/ui/defaultSettingsPanel.ts` に `即洗脳` チェックと設定項目を追加
- [x] `src/game/npcs.ts` に in-progress 遷移設定の実行時上書きAPIを追加
- [x] `src/main.ts` で `即洗脳` 設定をゲーム開始時に適用
- [x] 型チェックとビルドで検証
- [x] `docs/plan.md` の結果を更新

## 結果
`DEFAULT SETTINGS` に `即洗脳` チェックボックスを追加し、設定値を `DefaultStartSettings.instantBrainwash` として保持するようにした。

`src/game/npcs.ts` には `NpcBrainwashInProgressTransitionConfig` と
`setNpcBrainwashInProgressTransitionConfig` を追加し、
`brainwash-in-progress` の遷移判定で使う `decisionDelay` / `stayChance` を実行時に上書き可能にした。

`src/main.ts` ではゲーム開始時に `instantBrainwash` を評価し、
ONなら `decisionDelay: 0` / `stayChance: 0`、OFFなら `decisionDelay: 10` / `stayChance: 0.5`
を適用するようにした。
これにより ON 時は光線命中後に `brainwash-in-progress` へ入ったNPCが即座に `brainwash-complete-haigure` へ遷移する。

検証として `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` を実行し、どちらも成功した。
