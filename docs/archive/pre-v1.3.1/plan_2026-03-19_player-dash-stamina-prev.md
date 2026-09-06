# 接触判定距離分離 計画

更新日: 2026-03-19

## プロンプト
「銃なしに触れたら洗脳」状態ON時の洗脳判定や、OFF時の移動封じ判定に使っている「触れた」の判定距離について、
プレイヤーがNPCに「触れた」場合と、NPCがNPCやプレイヤーに「触れた」場合とでは、個別に距離を設定できるようにしてください

距離はUIで設定はしません。固定値で良いです。

プレイヤー由来を0.50に、
NPC由来を0.17に変えてください

## ステップ
- [x] 既存 `docs/plan.md` を退避し、今回タスク用の計画ファイルへ切り替える
- [x] プレイヤー由来接触距離を `0.33` の独立定数として `src/main.ts` に反映する
- [x] NPC由来接触距離を `0.14` の独立定数として `src/game/npcs.ts` に明示する
- [x] 接触分岐の括弧対応を含めて差分を確認する
- [x] `npm run build` を実行し、結果を計画へ反映する

## 結果
- 既存の `docs/plan.md` は `docs/plan_2026-03-19_help-panel-unification-prev.md` へ退避し、今回タスク用の計画へ差し替えた。
- `src/main.ts` では、プレイヤーが `brainwash-complete-no-gun` 状態で接触元になるケースの半径を `playerNoGunTouchContactRadius = 0.5` として独立させ、NPCへの接触洗脳判定と移動封じ判定の両方に反映した。
- `src/game/npcs.ts` では、NPCが接触元になるケースの半径を `npcNoGunTouchContactRadius = 0.17` として明示し、NPC→プレイヤー/NPC の接触判定と、接触後に生成する移動封じ半径の両方に反映した。
- `src/game/npcs.ts` の接触分岐周辺と `src/main.ts` の `npcBlockers` 生成部を確認し、括弧対応や分岐構造の崩れがないことを確認した。
- `npm run build` は成功した。既存どおり、Vite の CJS API 非推奨警告と 500kB 超チャンク警告は出たが、今回変更による新規エラーはなかった。
