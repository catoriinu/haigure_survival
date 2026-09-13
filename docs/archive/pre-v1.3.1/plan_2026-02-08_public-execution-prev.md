# タイトル画面 DEFAULT SETTINGS 追加 計画

更新日: 2026-02-08

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# タイトル画面「DEFAULT SETTINGS」追加 計画（README更新なし）

## 概要
タイトル画面右下に新規パネル `DEFAULT SETTINGS` を追加し、開始時のプレイヤー/NPC初期状態を切り替え可能にします。  
2つのチェックボックスは相互排他（同時ON不可、両方OFF可）で実装します。  
`README.md` は変更しません。

## 変更対象ファイル
1. `docs/plan.md`（新規計画に更新）
2. `src/ui/defaultSettingsPanel.ts`（新規）
3. `src/game/npcs.ts`
4. `src/main.ts`
5. `src/style.css`

## 公開API・型の変更
1. `src/ui/defaultSettingsPanel.ts`
- `DefaultStartSettings`
  - `startPlayerAsBrainwashCompleteGun: boolean`
  - `startAllNpcsAsHaigure: boolean`
- `createDefaultSettingsPanel(...)`
- `data-ui="default-settings-panel"`

2. `src/game/npcs.ts`
- `applyNpcDefaultHaigureState(npc: Npc)` を `export`
- 分岐:
  - `Math.random() < npcBrainwashCompleteHaigureStayChance` → `brainwash-complete-haigure`
  - それ以外 → `promoteHaigureNpc(npc)`（内部で `npcBrainwashToGunChance` により `gun/no-gun`）

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] 右下パネルの積み上げレイアウト化（`main.ts`）
- [x] `src/ui/defaultSettingsPanel.ts` を新規作成
- [x] `src/game/npcs.ts` に `applyNpcDefaultHaigureState` を実装
- [x] `src/main.ts` に設定統合（初期状態・可視制御・UI判定）を実装
- [x] `src/style.css` に `title-right-panels` / `default-settings-panel` スタイルを追加
- [x] 型チェックとビルド確認を実行

## 結果
タイトル画面右下に `DEFAULT SETTINGS` パネルを追加し、`プレイヤーがハイグレ人間` と `全NPCがハイグレ人間` の2チェックを実装した。  
2つのチェックは相互排他とし、同時にONにしようとした場合は最後にONした側を優先してもう片方をOFFにする動作にした（両方OFFは可能）。  
`main.ts` では右下のパネル群をスタック配置に変更し、`DEFAULT SETTINGS` を `BIT SETTINGS` の上に表示するよう変更した。  
ゲーム開始時に `DEFAULT SETTINGS` の値を実行時設定として確定し、プレイヤー初期状態（`brainwash-complete-gun`）と全NPC初期状態（`brainwash-complete-haigure` / `brainwash-complete-gun` / `brainwash-complete-no-gun`）を反映する実装にした。  
`src/game/npcs.ts` に `applyNpcDefaultHaigureState` を追加し、`npcBrainwashCompleteHaigureStayChance` と `npcBrainwashToGunChance` の既存確率を使った分岐に統一した。  
`npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` が成功した。
