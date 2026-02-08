# 公開処刑プレイヤー生存時NPC斉射修正 計画

更新日: 2026-02-08

## プロンプト
まず、「最後の未洗脳者がPCで、NPCに捕まった」場合を確認しました。
想定と異なっていました。
想定は以下です。こうしてください。
- 公開処刑開始時から、周囲の全NPCがbrainwash-complete-gun状態である（ボイスはbrainwash-complete-haigure-formationを再生し続ける）
- 最大10秒後に、全NPCがPCに向けてビームを発射する。PCは洗脳される

## ステップ
- [x] 既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成
- [x] 公開処刑（player-survivor）の現行遷移とボイス状態参照を確認
- [x] `src/main.ts` に全NPC gun状態化 + ボイス状態オーバーライドを実装
- [x] 発射タイミングを最大10秒要件に合わせて調整
- [x] 型チェックとビルド確認を実行
- [x] `docs/plan.md` の結果を更新

## 結果
`player-survivor` の公開処刑開始時に、周囲の全NPCを `brainwash-complete-gun` 状態に設定するよう `src/main.ts` を修正した。
同時に、公開処刑中のNPCボイス状態を `brainwash-complete-haigure-formation` へ強制するオーバーライドを追加し、見た目状態が gun でも formation ボイスを継続再生できるようにした。
ビット不在公開処刑の発射待機は `publicExecutionBeamDelayMin/Max` のカウントダウンのみで発射するよう調整し、最大10秒後に全NPCが中央PCへビームを発射する挙動に変更した。
ビーム衝突判定は既存の公開処刑判定をそのまま利用し、中央PCへの命中で洗脳遷移することを維持した。
`npx tsc -p tsconfig.json --noEmit` と `npm run build:renderer` が成功した。