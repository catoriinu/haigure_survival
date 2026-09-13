# 公開処刑ビット不在時NPC射撃対応 計画

更新日: 2026-02-08

## プロンプト
ビットの出現数が0の状態でゲームオーバーし、「最後の未洗脳者がPCで、NPCに捕まった」場合と「最後の未洗脳者がNPCで、NPCに捕まった」場合の公開処刑シーンにおいて、
ビットがいないので、代わりにbrainwash-complete-gun状態のNPCたちから中央のPC（NPC）に光線を発射してください。光線発射までの猶予はビットによる公開処刑時と同じにしてください。

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] 公開処刑ロジックを調査し、ビット不在時NPC射撃の差し込み位置を特定
- [x] `src/main.ts` にビット不在時のNPC射撃（待機時間を含む）を実装
- [x] 公開処刑のビーム衝突判定をNPC射撃に対応
- [x] 型チェックとビルド確認を実行
- [x] `docs/plan.md` の結果を更新

## 結果
`src/main.ts` の公開処刑処理に、ビット不在時（`bits.length === 0`）のNPC射撃分岐を追加した。
対象は既存のビット斉射公開処刑バリアント（`player-survivor` / `npc-survivor-npc-block`）で、公開処刑開始時点で `brainwash-complete-gun` のNPCを射手として記録し、発射直前にそのNPCを `brainwash-complete-gun` 状態へ設定して中央ターゲットへビームを発射するようにした。
発射までの待機時間は既存ビット処刑と同じフロー（`publicExecutionBeamDelayMin/Max` のカウントダウン + `bitFireEffectDuration`）をそのまま利用し、タイミングを一致させた。
ビーム衝突判定は、ビット斉射時は従来どおりビット由来ビームを扱い、ビット不在時は記録した射手NPC由来ビームを扱うように分岐させた。
`npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` が成功した。