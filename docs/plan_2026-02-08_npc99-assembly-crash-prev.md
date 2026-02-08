# タイトル画面 DEFAULT SETTINGS に NPC初期人数を追加する計画

更新日: 2026-02-08

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# タイトル画面 DEFAULT SETTINGS に NPC初期人数を追加する計画

## 概要
`DEFAULT SETTINGS` に `NPCの初期人数` 数値入力を追加し、`0〜99` を受け付けます。
反映タイミングは確認済み仕様どおり「ゲーム開始時のみ」です。
既存の固定 `npcCount=11` 依存を、`DEFAULT SETTINGS` の実行時設定へ置き換えます。

## 変更対象と公開インターフェース
- `src/ui/defaultSettingsPanel.ts`
- `src/main.ts`
- `src/style.css`
- `README.md`
- `docs/plan.md`（AGENTS.md運用ルールに従って更新）

`DefaultStartSettings` の型変更:
- `startPlayerAsBrainwashCompleteGun: boolean`
- `startAllNpcsAsHaigure: boolean`
- `initialNpcCount: number` を追加

## ステップ
- [x] 既存 `docs/plan.md` を退避して新規 `docs/plan.md` を作成
- [x] `src/ui/defaultSettingsPanel.ts` に `NPCの初期人数` 数値入力（0〜99）を追加
- [x] `src/style.css` に `default-settings-panel` 用の数値入力スタイルを追加
- [x] `src/main.ts` の固定 `npcCount` 依存を `DefaultStartSettings.initialNpcCount` ベースに置き換え
- [x] `README.md` の調整可能項目を実装に合わせて更新
- [x] `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` を実行
- [x] `docs/plan.md` の結果欄を最終更新

## 結果
`DEFAULT SETTINGS` に `NPC初期人数` の数値入力（0〜99）を追加し、
`DefaultStartSettings` に `initialNpcCount` を追加した。
入力値は `change` / `blur` で整数化し、範囲外を0〜99へ補正して保持する。

`src/main.ts` では固定 `npcCount` を廃止し、
`defaultDefaultStartSettings.initialNpcCount`（デフォルト11）を実行時設定として利用するよう変更した。
`assignVoiceIds` は引数で人数を受け取り、`resetGame` → `rebuildCharacters` 時に
`runtimeDefaultStartSettings.initialNpcCount` を反映してNPC再生成する。
また、立ち絵スプライト管理容量は `100`（プレイヤー1 + NPC最大99）へ更新した。

`README.md` の調整可能項目を実装に合わせて更新した。
検証は `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` が成功した。
