# タイトル画面 PLAYER SETTINGS 統合 計画

更新日: 2026-03-19

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# タイトル画面 PLAYER SETTINGS 統合計画

## 要約
- 実装開始時は AGENTS.md に従い、既存の計画ファイルを日付付きで退避し、新しい計画ファイルへ今回の原文プロンプト・進捗・結果を記録する。
- タイトル画面の設定パネル先頭に `PLAYER SETTINGS` を追加し、既存の `CAMERA SETTINGS` はここへ統合して独立パネルを削除する。
- `PLAYER SETTINGS` では `自キャラ`、`自ボイス`、`視点高さ` を扱い、キャラとボイスはどちらも先頭に固定の `ランダム選択` を置く。

## API / 型変更
- `CameraSettings` を `PlayerSettings` へ置換する。
- `PlayerSettings` は `heightCells: number`、`portraitDirectory: string | null`、`voiceDirectory: string | null` を持つ。
  - `null` はランダム選択を表す。
- タイトル設定保存のスキーマは `cameraSettings` から `playerSettings` へ更新し、保存バージョンを `2 -> 3` に上げる。
- v2 読み込み時は `cameraSettings.heightCells` を `playerSettings.heightCells` へ移し、新規の `portraitDirectory` / `voiceDirectory` はランダム初期値にする。

## 実装変更
- タイトル右側設定UIは `PLAYER SETTINGS` → `DEFAULT SETTINGS` → 既存各設定の順に並べ替える。
- `PLAYER SETTINGS` パネルに以下を実装する。
  - `自キャラ`: `public/picture/chara` の有効ディレクトリ名一覧を列挙。先頭は `ランダム選択`。
  - `自ボイス`: `public/audio/voice` のディレクトリ名一覧を列挙。先頭は `ランダム選択`。
  - `視点高さ`: 既存スライダーをそのまま移設。
- キャラ候補は既存のポートレート列挙処理を再利用し、ボイス候補は実ディレクトリと `voiceManifest` の対応が取れるものを列挙する。
- キャラ割当生成を `playerSettings` 前提に組み直す。
  - `自キャラ` 固定時はプレイヤーのポートレートだけをそのディレクトリに固定する。
  - `自ボイス` 固定時はディレクトリ先頭2桁に対応する `VoiceProfile.id` をプレイヤーへ割り当て、NPC側は残りのボイス抽選を使う。
  - 両方ランダム時は現行挙動のままにする。
- 初回ロード、ステージ変更、ゲーム開始、タイトル復帰のすべてで同じ割当生成を使い、選択した自キャラ/自ボイスが常に反映されるようにする。
- タイトル設定保存・復元・リセット・警告同期の経路は `playerSettings` ベースへ更新し、視点高さ変更時のタイトルカメラ同期も `PLAYER SETTINGS` 変更イベントで行う。
- 保存済みのキャラ/ボイスディレクトリが現在存在しない場合は、表示エラーなしでランダム選択へ正規化する。

## テスト
- タイトル画面で `PLAYER SETTINGS` が `DEFAULT SETTINGS` の上に表示され、`CAMERA SETTINGS` が消えていること。
- `自キャラ` と `自ボイス` のプルダウン先頭が常に `ランダム選択` で、その下に実ディレクトリ名が並ぶこと。
- 視点高さの変更が従来どおりタイトル中のカメラ高さへ即時反映されること。
- 固定した `自キャラ` でゲーム開始時のプレイヤースプライトと一人称用ボディが切り替わること。
- 固定した `自ボイス` でプレイヤーの音声が切り替わり、NPC音声は従来どおり動くこと。
- リロード後も自キャラ・自ボイス・視点高さが復元され、リセットで両方ともランダムに戻ること。
- 保存済みディレクトリ名を手動で無効値にした場合でも、エラー表示なしでランダムに戻ること。
- `npm run build` が通ること。

## 前提・既定値
- `自ボイス` も他のタイトル設定と同様に localStorage へ保存する。
- プルダウン表示名は、指定どおりディレクトリ名をそのまま使う。
- 固定した `自キャラ` は NPC のポートレート候補からは除外せず、NPC 側の見た目割当ロジックは現行方針を維持する。

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-03-19_player-settings-prev.md` へ退避し、新しい `docs/plan.md` を作成する
- [x] `PLAYER SETTINGS` パネルと関連スタイルを追加し、`CAMERA SETTINGS` を統合する
- [x] タイトル設定保存の `playerSettings` 化と v2 -> v3 移行を実装する
- [x] 自キャラ / 自ボイスの選択をプレイヤー割当に反映し、関連フローを統一する
- [x] `docs/plan.md` の結果を更新し、`npm run build` で確認する

## 結果
- 既存 `docs/plan.md` は `docs/plan_2026-03-19_player-settings-prev.md` へ退避し、今回タスク用の計画ファイルへ切り替えた。
- `src/ui/playerSettingsPanel.ts` を追加し、タイトル画面の設定パネル先頭に `PLAYER SETTINGS` を新設した。項目は `自キャラ`、`自ボイス`、`視点高さ` の3つで、各プルダウン先頭は固定で `ランダム選択` にした。
- `src/ui/titleSettingsSidebar.ts` は `cameraSettings` を廃止して `playerSettings` に置き換え、`CAMERA SETTINGS` 独立パネルを削除した。視点高さ変更時のタイトルカメラ同期は `player-settings` 変更イベントで行うようにした。
- `src/style.css` は `player-settings-panel` 用のレイアウトとセレクト入力スタイルを追加し、既存のタイトル設定パネル群と同じ見た目に統合した。
- `src/ui/titleSettingsStorage.ts` は保存スキーマを `playerSettings` ベースへ更新し、保存バージョンを `3` に上げた。v2 読み込み時は旧 `cameraSettings.heightCells` を `playerSettings.heightCells` へ移し、`portraitDirectory` / `voiceDirectory` はランダム初期値へ移行するようにした。
- 保存済みの `portraitDirectory` / `voiceDirectory` が現在の有効候補に存在しない場合は、表示エラーなしで `null` へ正規化してランダム選択へ戻すようにした。
- `src/audio/voice.ts` は `public/audio/voice` の実ディレクトリ一覧を `import.meta.glob` から組み立て、`voiceManifest` と対応する候補だけを列挙できるようにした。
- `src/main.ts` は `titlePlayerSettings` を導入し、タイトル保存・復元・リセット・カメラ高さ反映を `playerSettings` ベースへ更新した。
- `src/main.ts` のプレイヤー割当生成は `buildCharacterAssignments(npcCount, playerSettings)` へ差し替えた。`自キャラ` 固定時はプレイヤーのポートレートだけを固定し、`自ボイス` 固定時は対応する `VoiceProfile.id` をプレイヤーへ固定、NPC側は残りのボイス候補から抽選するようにした。
- 初回ロード、ステージ変更、ゲーム開始時のキャラ再構築、タイトル復帰時の事前割当で同じ `playerSettings` ベースの割当生成を使うように統一した。
- 未使用になった `src/ui/cameraSettingsPanel.ts` は削除した。
- `npm run build` は成功した。
