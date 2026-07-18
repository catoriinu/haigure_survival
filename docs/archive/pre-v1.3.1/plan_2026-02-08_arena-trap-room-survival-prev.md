# arena_trap_room トラップサバイバル実装 計画

更新日: 2026-02-08

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# `arena_trap_room` トラップサバイバル実装計画

## 概要
`arena_trap_room` でのみ、周期的な「予告点滅→一斉発射→インターバル」を繰り返すトラップシステムを追加する。  
既存のビット/NPC/公開処刑ロジックは併用し、トラップ光線は通常光線と同様に命中時の洗脳処理へ接続する。

## 実装ステップ
1. 計画ファイル更新ルール対応  
`docs/plan.md` の既存内容を `docs/plan_2026-02-08_arena-stage-adjust-prev.md` のような退避名へ改名し、新規 `docs/plan.md` を作成する。  
`Get-Date -Format yyyy-MM-dd` の実行結果 `2026-02-08` を更新日に使い、今回プロンプト原文・ステップ・結果欄を運用する。

2. ステージ選択へ `arena_trap_room` を追加  
`src/world/stageSelection.ts` の `STAGE_CATALOG` に 4 番目として `arena_trap_room.json` を追加する。  
既存 3 ステージは保持し、右クリック切替に統合する。

3. トラップ用ビーム仕様を追加  
`src/game/types.ts` の `Beam` に以下を追加する。  
`group: "normal" | "trap"`  
`bodyRadius: number`  
`trailEnabled: boolean`  
`impactEnabled: boolean`  
既存通常ビームは挙動維持のため `group="normal"`, `bodyRadius=0`, `trailEnabled=true`, `impactEnabled=true` にする。

4. ビーム生成 API を拡張  
`src/game/beams.ts` に `createTrapBeam(...)` を追加する。  
内部共通生成関数を使い、通常 `createBeam(...)` は既存互換のまま維持する。  
`createTrapBeam` の固定仕様は以下。  
速度: 通常の 3 倍  
太さ: 1 セル (`layout.cellSize`)  
命中判定半径: `layout.cellSize / 2`  
トレイル・着弾オーブ: 無効（大量同時発射時の負荷対策）

5. 命中判定を太さ対応に更新  
`src/game/beamCollision.ts` で軸距離判定を `targetRadius + beam.bodyRadius` に変更する。  
これにより「見た目と一致」判定を実現する。  
通常ビームは `bodyRadius=0` なので従来挙動を維持する。

6. トラップ候補セル生成ロジックを実装  
`src/main.ts` にトラップ候補計算を追加する（`isTrapStage = stageSelection.id === "arena_trap_room"`）。  
床候補: 全 floor セル。  
壁候補: floor セルに隣接する wall 面（4 方向チェック）を 1 面 1 候補として抽出。  
壁候補は「縦 3 セル 1 セット」とし、発射時は同じ面から高さ違い 3 本を同時発射する。

7. 予告点滅フェーズ実装  
`src/main.ts` にトラップ状態機械を追加する。  
`charging (5秒) -> waiting_clear -> interval (5秒) -> charging ...`  
開始タイミングはゲーム開始直後（即開始）。  
点滅速度は 5 秒間で遅い→速いへ連続変化。  
実装値: 点滅間隔 `0.8s -> 0.08s` を `progress^1.35` で補間。  
床は薄いピンク板、壁は薄いピンク縦面（高さ 3 セル）を一時メッシュで点滅表示する。

8. 一斉発射と増加ルール実装  
各サイクルの選択数は三角数 `n(n+1)/2`（`1,3,6,10,15,21...`）で増加。  
候補総数を超えたら候補最大数で打ち止め。  
抽選は「床候補＋壁候補」の同一プールから重複なしランダム抽選。  
壁候補選出時は 3 本同時発射。  
床候補は上方向（床→天井）、壁候補は面の正面方向（部屋内向き）へ発射。

9. 次周期開始条件を実装  
`waiting_clear` は `beams` 配列内の `group==="trap"` が 0 になるまで待機。  
全トラップ光線消滅後に `interval=5秒` を開始し、終了後に次の `charging` へ遷移する。  
通常ビームは継続していても周期判定に干渉させない。

10. リセット・ステージ切替時の後始末  
`resetGame`, `applyStageSelection`, タイトル復帰時に、トラップ予告メッシュ・状態・タイマーを破棄/初期化する。  
`arena_trap_room` 以外ではトラップ更新処理を完全停止する。

## ステップ
- [x] 1. 計画ファイル更新ルール対応
- [x] 2. ステージ選択へ `arena_trap_room` を追加
- [x] 3. トラップ用ビーム仕様を追加
- [x] 4. ビーム生成 API を拡張
- [x] 5. 命中判定を太さ対応に更新
- [x] 6. トラップ候補セル生成ロジックを実装
- [x] 7. 予告点滅フェーズ実装
- [x] 8. 一斉発射と増加ルール実装
- [x] 9. 次周期開始条件を実装
- [x] 10. リセット・ステージ切替時の後始末

## 結果
以下を実装した。

- `src/world/stageSelection.ts`
  - ステージ選択に `arena_trap_room` を4番目として追加。
- `src/game/types.ts`
  - `Beam` に `group`, `bodyRadius`, `trailEnabled`, `impactEnabled` を追加。
- `src/game/beams.ts`
  - 共通生成 `createBeamInternal` を導入。
  - 既存 `createBeam` は従来互換（`group: "normal"`）を維持。
  - 新規 `createTrapBeam` を追加（速度3倍、太さ1セル、判定半径1/2セル、trail/impact無効）。
  - `updateBeams` で beamごとの trail/impact 有効フラグを反映。
- `src/game/beamCollision.ts`
  - 胴体判定を `targetRadius + beam.bodyRadius` に変更し、見た目太さ対応を追加。
- `src/main.ts`
  - `arena_trap_room` 専用トラップ状態機械を追加。
    - `charging(5秒) -> waiting_clear -> interval(5秒)` を循環。
    - 点滅テンポは `0.8 -> 0.08` 秒を `progress^1.35` で補間。
  - 床セル＋壁面（縦3セル1セット）候補を同一プール抽選。
  - 三角数 `1,3,6,10,15,21...` で選択数増加（候補数上限で打ち止め）。
  - 壁セットは3本同時発射、床は上向き、壁は室内向きに発射。
  - `group === "trap"` が消滅後にのみ5秒インターバルへ遷移。
  - `resetGame` / `applyStageSelection` / 非playing時にトラップ表示・状態を初期化。

検証として `npx tsc -p tsconfig.json --noEmit` を実行し、成功した。
