# ブランチ横断リファクタリングと開始遅延削減 計画

更新日: 2026-03-21

## プロンプト
このブランチで実装した内容を中心に、それ以前の実装も含めてリファクタリングを行ってください。
なお、以下の点を特に重視してください。

- ゲーム中の動作がかなり重くなってきているので、処理を軽量化することの優先度を上げてください。
- ビルド時に警告が出ています。main.tsの肥大化を止めてファイルを分離するなど検討してください。
- 今、タイトル画面で左クリックをしても、実際にゲームが始まるまでに数秒のラグがあります。
原因を調査して、少しでも早く起動するように修正してください。
- リファクタリングの優先度は「動作を保つこと > 処理を軽量化すること > 処理を共通化すること」です。

PLEASE IMPLEMENT THIS PLAN:
# ブランチ横断リファクタリングと開始遅延削減 計画

## Summary
- 実装開始時に既存の `docs/plan.md` を `docs/plan_2026-03-21_branch-refactor-prev.md` へ退避し、新しい `docs/plan.md` を `2026-03-21` で作成する。以後は各ステップ完了ごとに更新する。
- 対象は、このブランチで増えた一人称表示・キャラスプライト・影・開始フローを中心にしつつ、`src/main.ts` 全体の責務分離、ビルド警告、プレイ中の毎フレーム負荷まで含める。
- 左クリック開始のラグ対策は「デバウンス事前準備」を採用する。タイトル画面は次回開始状態を先に準備し、開始時は再構築を極力走らせない。
- 原因調査は `performance.mark/measure` で `startGame`、`resetGame`、`rebuildCharacters`、portrait 読み込み、billboard/shadow 再構築を一度計測し、原因を確認したうえで計測コードは仕上げ前に外す。

## Key Changes
- `src/game/titleStartPreparation.ts` を新設し、ステージ変更、アラーム罠切替、`playerSettings.portraitDirectory`、`playerSettings.voiceDirectory`、`defaultStartSettings`、`brainwashSettings`、`bitSpawnSettings` の変更時に、250ms デバウンスで開始用準備を再実行する。
- `showGroundShadows`、`enableCharacterSpriteVerticalAngle`、`heightCells` は重い再準備対象に含めず、タイトル中の即時反映だけを維持する。
- 開始用準備は `normalizeRuntimeSettingsForStage`、`buildCharacterAssignments`、必要な portrait preload、タイトル用 `resetGame` 相当の再構築、fingerprint 更新までを担当させる。
- `startGame()` は準備済み fingerprint と一致する場合 `resetGame()` を呼ばず、HUD 切替、BGM 開始、phase 遷移、pointer lock だけを行う。準備中は loading 表示のまま待ち、開始クリック時の追加再抽選は行わない。
- `returnToTitle()` はタイトル復帰直後に次回開始状態の準備を再スケジュールし、再開始でも同じ即時化経路を使う。
- `src/game/characterScene.ts` を新設し、portrait manager cache、player/NPC sprite 生成、billboard mesh、ground shadow、voice actor の責務を `main.ts` から移す。
- billboard mesh と ground shadow は index ベースのプールへ変更し、リセット時は再利用を優先する。NPC 数増減時だけ不足分を追加し、不要分は非表示化する。
- `rebuildCharacters()` は「必要な sprite の差し替え」と「状態初期化」に寄せ、毎回の billboard/shadow 全破棄・全再作成をやめる。
- タイトル画面で準備した `CharacterAssignments` を開始時にもそのまま使い、クリック時の portrait 未ロード待ちをなくす。
- `src/game/runtimeFrame.ts` を新設し、playing / roulette / execution / assembly の更新分岐を `main.ts` から移す。`main.ts` には engine/scene 初期化、モジュール配線、phase 遷移の入口だけを残す。
- 同一フレーム内の `playerAbility.createFrameSnapshot()` と `buildNpcTargets()` は 1 回だけ作成して再利用する。
- `syncBitGroundShadowHandles()` の `new Set(bits.map(...))`、`updateNpcs()` の `npcs.map(() => [])` と `targets.filter(...)`、`AudioManager.updateSpatial()` と `updatePlayerState()` の `new Vector3()` 連発は、再利用バッファと temp vector に置き換える。
- `portraitManager.layerMask` の全件書き換えは、phase または表示モードが変わった時だけ実行する。
- `vite.config.ts` は `vite.config.mts` へ変更して Vite CJS Node API deprecation warning を消す。
- `build.rollupOptions.output.manualChunks` を追加し、少なくとも `@babylonjs/core`、title/UI 群、audio 群を分割する。
- 分割後も vendor-only の `babylon` chunk だけが 500kB を超える場合は `chunkSizeWarningLimit = 2500` を設定し、`docs/plan.md` に測定値を残して警告を解消する。アプリ側 chunk は 500kB 超のまま放置しない。

いくつか問題が起きています。原因を調査して修正してください。
- ボイスが再生されない

- 自ボイスを指定してゲームを始めると以下のエラーが出た
audio.ts:271 Uncaught TypeError: Failed to set the 'value' property on 'AudioParam': The provided float value is non-finite.
    at AudioManager.updateSpatial (audio.ts:271:24)
    at main.ts:4708:16

## ステップ
- [x] 既存の `docs/plan.md` を退避し、今回タスク用の `docs/plan.md` を作成する
- [x] タイトル開始の事前準備フローと設定変更イベントを実装する
- [x] `characterScene` と `runtimeFrame` を新設し、`main.ts` から責務を分離する
- [x] 毎フレーム処理と再生成処理の不要アロケーションを削減する
- [x] Vite 設定を更新してビルド警告を解消し、`npm run build` で検証する
- [x] 実装結果と検証結果を `docs/plan.md` に反映する
- [x] 音声まわりの回帰を調査し、ボイス未再生と `AudioParam` 非有限値エラーの原因を修正する
- [x] `npm run build` を再実行し、回帰修正後のビルド成立を確認する

## 結果
- `src/game/titleStartPreparation.ts` を追加し、タイトル画面の重い再準備を 250ms デバウンスで直列化するコントローラを導入した。開始時は prepared state を確認し、一致時は `resetGame()` を再実行しない構成へ切り替えた。
- `src/ui/titleSettingsSidebar.ts` の変更イベントに `requiresStartPrepare` を追加し、portrait/voice、default settings、brainwash settings、bit settings、trap-room 推奨変更だけが重い再準備を要求するよう整理した。`heightCells` と visual settings は即時反映のみ維持する。
- 起動直後の runtime settings 初期化を title settings ベースへ修正し、初回タイトル表示の時点で次回開始状態と揃うようにした。
- `startGame()` は prepared runtime settings を使って開始し、`returnToTitle()` は prepared state を無効化したうえでタイトル側の再準備を待つ流れへ更新した。
- `src/game/characterScene.ts` を追加し、portrait manager cache、billboard mesh、ground shadow、voice actor の責務を `main.ts` から切り出した。キャラクター再生成時は billboard / shadow を index ベースで再利用し、毎回の全破棄・全再生成をやめた。
- `src/game/runtimeFrame.ts` を追加し、playing / roulette / execution / assembly の更新分岐と、毎フレーム使う target buffer / vector list buffer の再利用ロジックを `main.ts` から分離した。
- `src/main.ts` は `buildNpcTargets()` の毎回再生成をやめ、mutable な target buffer を 1 フレーム内で再利用する構成へ変更した。`playerAbility.createFrameSnapshot()` も playing フレーム内で 1 回だけ生成して共有するようにした。
- `syncBitGroundShadowHandles()` の `new Set(bits.map(...))` を再利用 `Set` に置き換え、`updatePlayerState()` の player center / beam impact は temp `Vector3` を再利用するようにした。
- `src/game/npcs.ts` の `targets.filter(...)`、`npcs.map(() => [])`、evade threat の配列結合を scratch buffer 化し、`src/audio/audio.ts` の `AudioManager.updateSpatial()` は per-frame の `Vector3` 生成をやめて数値演算中心に置き換えた。
- `portraitManager.layerMask` の一括更新は `characterScene.syncBillboards()` 側で phase / 表示モード変更時だけ実行するようにした。
- `vite.config.ts` を `vite.config.mts` へ移行し、Vite CJS Node API deprecation warning を解消した。manual chunks で `babylon`、`audio`、`title-ui`、`game-systems`、`game-entities`、`world` を分割し、app chunk は `index-BXlRBY_g.js` の 60.31 kB まで縮小した。
- `babylon` vendor chunk は `babylon-Bq8v4Nk3.js` の 3,896.73 kB だったため、vendor-only 警告だけを吸収する目的で `chunkSizeWarningLimit` を 4000 に設定した。最終確認時の `npm run build` では chunk size warning も出ていない。
- 音声回帰の原因は、`main.ts` から `characterScene.updateVoices()` へ渡す引数名が `baseOptions` / `loopOptions` ではなく `voiceBaseOptions` / `voiceLoopOptions` のまま残っていたことだった。これにより `updateVoiceActor()` 側へ音声設定が渡らず、ボイス未再生と `AudioManager.updateSpatial()` の `AudioParam` 非有限値エラーが発生していたため、呼び出し側のプロパティ名を修正した。
- 回帰修正後に `npm run build` を再実行し、renderer / electron ともに成功することを確認した。
