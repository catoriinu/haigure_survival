# arena_trap_room NPC一時停止特例 計画

更新日: 2026-02-08

## プロンプト
- トラップ部屋では、ビームが発射される秒前～ビームの持続時間が終了するまでの間、normalまたはevadeのNPCは一時的に移動しないようにしてください。
- ただし5%の確率で、止まらず移動し続けてください（足を止めきれなかったイメージ）
- これはキャラクターのモードの遷移ではないので特例処理としてください。

## ステップ
- [x] 既存のトラップ位相とNPC移動更新ポイントを確認
- [x] `updateNpcs` に移動凍結特例のフックを追加
- [x] `main.ts` でトラップ窓（警告～持続終了）を判定し、5%継続移動抽選を実装
- [x] `arena_trap_room` 限定でNPC移動凍結を適用し、他ステージへ影響しないことを担保
- [x] 型チェックで検証

## 結果
- `src/game/npcs.ts` の `updateNpcs` に
  `shouldFreezeAliveMovement: (npc, npcId) => boolean` を追加した。
  - `normal` / `evade` の移動処理でこの特例を参照し、`true` の間は移動を行わない。
  - これは状態遷移ではなく、移動処理のみを止める特例として実装した。
- `src/main.ts` にトラップ専用のNPC移動制御を追加した。
  - 凍結窓: `trapPhase === "charging"` または トラップビーム残存中。
  - 凍結窓に入る瞬間にNPCごとに `5%` を抽選し、当選NPCのみ移動継続。
  - `arena_trap_room` かつ `playing` 時のみ有効で、それ以外では自動クリア。
- 検証として `npx tsc -p tsconfig.json --noEmit` を実行し、成功した。
