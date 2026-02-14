# トラップルーム実装リファクタリング 計画

更新日: 2026-02-08

## プロンプト
トラップルームの実装について、リファクタリングできる余地があるか確認して、リファクタ計画を立ててください。
共通化できるところはなるべく共通化し、ファイルを分けるべきところは分けてください。

修正する際は、READMEの記述に差分が発生していたら常に追従するようにしてください。

OKです。ステップ通り進めてください

## ステップ
- [x] `docs/plan.md` の作成と対象範囲の固定（トラップ全体、軽微調整許容、段階分割）
- [x] `TRAP_STAGE_ID` の共通化（`src/world/stageIds.ts` 追加、参照側置換）
- [x] 重み付き抽選の共通化（`src/game/random/weighted.ts` 追加、既存抽選の統一）
- [x] トラップ候補生成・テレグラフ描画の分離（`src/game/trap/candidates.ts` / `src/game/trap/telegraph.ts`）
- [x] トラップシステム本体の分離（`src/game/trap/system.ts`）
- [x] タイトルのトラップ推奨ボタン管理を分離（`src/ui/trapRoomRecommendControl.ts`）
- [x] `src/main.ts` の統合置換（トラップ処理を新モジュール経由に移行）
- [x] README追従更新（設定の記載場所を最新構成へ更新）
- [x] 型チェック（`npx tsc -p tsconfig.json --noEmit`）

## 結果
- トラップルームの責務を `src/main.ts` から分離し、`src/game/trap/system.ts` を中核として候補生成・テレグラフ描画・フェーズ進行・NPC停止制御をモジュール化した。
- トラップ候補生成は `src/game/trap/candidates.ts`、テレグラフ描画は `src/game/trap/telegraph.ts`、型定義は `src/game/trap/types.ts` に分割した。
- 重み付き抽選を `src/game/random/weighted.ts` に共通化し、`src/game/npcNavigation.ts` の抽選処理を統一した。
- タイトル画面の「トラップルーム推奨設定」ボタンを `src/ui/trapRoomRecommendControl.ts` に分離した。
- `TRAP_STAGE_ID` を `src/world/stageIds.ts` に集約し、`src/world/stageSelection.ts` と `src/main.ts` の参照を統一した。
- READMEのトラップ設定参照先を `src/game/trap/system.ts` に追従更新した。
- 検証として `npx tsc -p tsconfig.json --noEmit` を実行し、成功した。
