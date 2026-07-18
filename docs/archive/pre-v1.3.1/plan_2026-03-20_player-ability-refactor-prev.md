# プレイヤー由来evade拡張 計画

更新日: 2026-03-20

## プロンプト
プレイヤー由来の複数NPC `evade` 判定を実装してください。

- プレイヤーが `brainwash-complete-gun` / `brainwash-complete-no-gun` の間だけ、プレイヤー由来の脅威NPC集合を毎フレーム算出する
- 対象は生存中のNPCで、条件は「画面内」または「プレイヤーから水平3セル以内」
- 単一の `player.targetId` は持たず、毎フレームの `Set` を既存の `targetedIds` に合流させる
- プレイヤー由来の脅威は、そのフレームからNPCの逃走挙動にも使う
- 視界範囲は NPC 中心点が現在カメラの画面内に投影され、かつ洗脳済みNPCの視界距離と同じ距離以内であることとする
- 近距離判定は XZ 平面距離で行う
- 壁や遮蔽物による視線遮断は考慮しない
- 至近距離判定は 3 セルのまま維持する
- 視界判定だけは 9 セル相当にする
- NPC とプレイヤーの設定値は直接流用せず、既存コードの定数配置パターンに合わせる

## ステップ
- [x] 既存 `docs/plan.md` を退避し、今回タスク用の計画へ切り替える
- [x] `src/main.ts` にプレイヤー由来脅威NPC集合の算出と `targetedIds` / `npcEvadeThreats` 反映を実装する
- [x] `src/game/npcs.ts` にプレイヤー由来脅威の即時逃走挙動反映を実装する
- [x] プレイヤー視界距離定数を既存パターンに合わせて整理し、NPC側定数への直接依存を外す
- [x] `npm run build` を再実行し、結果を計画へ反映する

## 結果
- `src/main.ts` にプレイヤーが `brainwash-complete-gun` / `brainwash-complete-no-gun` のときだけ有効な `collectPlayerThreatenedNpcIds` を追加した。
- プレイヤー由来脅威は「NPC中心点が画面内に投影され、かつ洗脳済みNPC視界距離以内」または「プレイヤーから水平3セル以内」の生存NPCを対象にし、毎フレーム `npcEvadeThreats` と最終 `targetedIds` の両方へ反映するようにした。
- 既存の単一 `aimedNpcIndex` ベースの照準判定は削除し、複数NPC同時対象へ置き換えた。
- `src/game/npcs.ts` の `updateNpcs` にプレイヤー脅威集合を渡し、そのフレームから evade 速度・目的地選定・再ターゲットへ反映するようにした。
- 視界距離の扱いは NPC 側定数の直接流用をやめ、`src/main.ts` のプレイヤー用ローカル定数 `playerEvadeThreatVisionRangeCells = 9` に整理した。NPC 側の視界距離定数は `src/game/npcs.ts` 内部専用に戻した。
- `npm run build` は再実行後も成功した。既存どおり、Vite の CJS API 非推奨警告と 500kB 超チャンク警告は出たが、今回変更による新規エラーはなかった。
