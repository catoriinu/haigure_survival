# タイトル画面 DEFAULT SETTINGS に「NPC洗脳完了後の行動遷移確率」追加 計画

更新日: 2026-02-08

## プロンプト
タイトル画面のDEFAULT SETTINGSに、以下の機能を追加してください。
- NPCの洗脳完了後の行動遷移確率
  - ポーズ（入力不可。値の計算は後述）
  - 銃あり（スライドバー、最低0,最大100。値はスライドバーの左に表示）
  - 銃なし（スライドバー、最低0,最大100。値はスライドバーの左に表示）

スライドバーを動かすと、他の値（スライドバー）も合計が100になるように連動して変わる。
例：
ポーズ20,銃あり40,銃なし40のとき、銃ありを60に変更→ポーズ0,銃あり60,銃なし40
ポーズ20,銃あり40,銃なし40のとき、銃ありを80に変更→ポーズ0,銃あり80,銃なし20
ポーズ20,銃あり40,銃なし40のとき、銃ありを0に変更→ポーズ60,銃あり0,銃なし40

なお、現在の実装上は、npcBrainwashCompleteHaigureStayChanceとnpcBrainwashToGunChanceで定義しています。
その組み合わせを、ユーザーが感覚的に調整できるようにしたいと思っています。なので実際に計算に使う値は、スライドバーの値と異なっていても構いません。

実装確定仕様:
- 初期表示値はポーズ20 / 銃あり40 / 銃なし40
- 連動ルールは「ポーズを先に調整」
- 適用範囲は既存参照箇所すべて（自然遷移・初期全NPCハイグレ適用・昇格処理）
- 内部変換:
  - posePercent = 100 - gunPercent - noGunPercent
  - stayChance = posePercent / 100
  - toGunChance = (gunPercent + noGunPercent) === 0 ? 0 : gunPercent / (gunPercent + noGunPercent)

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] `src/ui/defaultSettingsPanel.ts` を拡張（新規設定項目、スライダー連動ロジック、表示更新）
- [x] `src/style.css` に `default-settings-panel` のスライダー行スタイルを追加
- [x] `src/game/npcs.ts` に実行時設定APIを追加し、既存参照箇所を設定値経由へ置換
- [x] `src/main.ts` で新規設定初期値・内部確率変換・`startGame()`適用を実装
- [x] `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` で検証
- [x] `docs/plan.md` の結果欄を最終更新

## 結果
`DEFAULT SETTINGS` に「NPC洗脳完了後の行動遷移確率」セクションを追加し、`ポーズ/銃あり/銃なし` の3値を100固定で扱うUIを実装した。
`ポーズ` は自動計算表示、`銃あり` と `銃なし` は `0..100` のスライダーで、値をスライダー左に表示する。

スライダー連動は「ポーズを先に調整」ルールを実装した。
変更した側の値を確定し、もう片方は可能な限り維持しつつ、合計超過時はポーズ（余剰ゼロ）を先に使い、必要時のみもう片方を圧縮する。
これにより、要求された例（20/40/40→60、80、0）に一致する挙動になる。

`src/game/npcs.ts` では `NpcBrainwashCompleteTransitionConfig` と `setNpcBrainwashCompleteTransitionConfig` を追加し、
固定値だった `npcBrainwashCompleteHaigureStayChance` / `npcBrainwashToGunChance` の参照を実行時設定へ置換した。
適用先は自然遷移・初期全NPCハイグレ適用・昇格処理の全箇所。

`src/main.ts` では `DefaultStartSettings` に `npcBrainwashCompleteGunPercent` / `npcBrainwashCompleteNoGunPercent` 初期値（40/40）を追加し、
`startGame()` で以下変換を行って `resetGame()` 前に設定を適用するようにした。
- `posePercent = 100 - gunPercent - noGunPercent`
- `stayChance = posePercent / 100`
- `toGunChance = (gunPercent + noGunPercent) === 0 ? 0 : gunPercent / (gunPercent + noGunPercent)`

検証として `npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` を実行し、どちらも成功した。
