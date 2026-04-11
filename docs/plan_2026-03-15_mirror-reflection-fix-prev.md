# 全滅シーン下半身レイヤー表示 計画

更新日: 2026-03-15

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# 全滅シーン下半身レイヤー表示計画

## 要約
- 適用範囲は `assemblyMove` / `assemblyHold` / `execution` の全全滅フェーズとする。
- 全滅シーンでも、カメラを下に向けたときはプレイヤー状態に対応した一人称下半身レイヤーを表示する。
- 全滅シーン中の `playerAvatar` は主カメラには出さず、将来の鏡・水たまり反射に備えて反射専用表示のまま残す。
- 画像アセットは追加しない。既存の state→portrait cell をそのまま使い、`brainwash-complete-haigure-formation` も現行どおり `bw-complete-pose` を使う。
- 実装時は AGENTS.md に従って `docs/plan.md` を今回タスク用に更新する。

## API / 型
- 公開 API 変更なし。
- `GamePhase` の値追加なし。内部で「一人称下半身レイヤーを有効にするフェーズ」と「主カメラから `playerAvatar` を隠すフェーズ」を判定する共通ヘルパーを追加し、分岐を集約する。

## 実装変更
- 表示ポリシーを `src/main.ts` に集約する。
  - `syncFirstPersonBodyVisibility` の `gamePhase !== "playing"` 前提をやめ、`playing` に加えて `assemblyMove` / `assemblyHold` / `execution` でも下半身レイヤーを有効化する。
  - `syncPlayerPresentation` の `playerPortraitManager.layerMask` を、全滅フェーズでも `reflectionOnlyLayerMask` にする。
  - 主カメラ側の非表示は `isVisible = false` ではなく layer mask で行い、反射用表示を潰さない。
  - タイトル、ルーレット、通常の遷移フェーズは現状維持にする。
- 全滅シーン開始時の `playerAvatar` 扱いを `src/game/flow.ts` で整理する。
  - `playerAvatar.isVisible = false` にしている分岐はやめ、全滅フェーズでは常に「ワールド上に正しい位置を持つ反射用アバター」として残す。
  - `assemblyMove` / `assemblyHold` は現行どおり整列用の位置を使う。
  - `execution` はバリアントごとに位置を明示する。
    - `player-survivor`: 中央ターゲット位置
    - `npc-survivor-player-block`: 前列中央スロット
    - `npc-survivor-npc-block`: 現行どおり前列中央スロット
  - `playerState` だけを正本にし、同フレームで明示的にセルを入れる必要がある箇所も `getPortraitCellIndex(playerState)` を使う。ハードコードされた `cellIndex = 2` は使わない。
- 下半身レイヤーの状態同期は既存の共通経路を維持する。
  - `updateCharacterSpriteCells` で `playerState` から求めた `playerAvatar.cellIndex` をそのまま `redrawFirstPersonBodyTexture` に渡す。
  - `brainwash-complete-haigure-formation` 用の特別画像や下半身専用画像は追加しない。
  - これにより全滅シーンでも `evade` / `brainwash-complete-gun` / `brainwash-complete-haigure-formation` など現在状態に応じた下半身が出るようにする。

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-03-14_player-body-reflection-prev.md` へ退避し、新規 `docs/plan.md` を作成する
- [x] `src/main.ts` に全滅フェーズ共通の表示判定ヘルパーを追加し、下半身レイヤーと `playerAvatar` の layer mask 制御を整理する
- [x] `src/game/flow.ts` の全滅シーン開始処理を修正し、`playerAvatar` を反射専用アバターとして残しつつ状態セルを `playerState` 基準へ統一する
- [x] `npm run build` を実行してビルド確認する
- [x] 実装結果を `docs/plan.md` の結果へ反映する

## 結果
- `docs/plan.md` 旧版は `docs/plan_2026-03-14_player-body-reflection-prev.md` へ退避し、今回タスク用の計画へ切り替えた。
- `src/main.ts` に全滅フェーズ判定ヘルパーを追加し、一人称下半身レイヤーは `playing` に加えて `assemblyMove` / `assemblyHold` / `execution` でも表示できるようにした。
- `src/main.ts` の `playerPortraitManager.layerMask` は、通常プレイに加えて全滅フェーズでも `reflectionOnlyLayerMask` を使うように変更した。これにより、主カメラにはプレイヤー本体を出さず、反射専用アバターとして残せる。
- `src/game/flow.ts` では、全滅シーン開始時に `playerAvatar.isVisible = false` にしていた分岐をやめ、各 execution バリアントでも反射用アバターとして正しいワールド位置へ置くようにした。
- `src/game/flow.ts` では、プレイヤーの即時セル更新を `getPortraitCellIndex(state)` 経由へ統一し、`brainwash-complete-haigure-formation` / `brainwash-complete-gun` / `evade` の各状態で、その状態に対応した下半身レイヤーが同フレームから使われるようにした。
- `npm run build` は成功した。
- 手動の見た目確認は未実施。
