# 外部素材化先行 + Electron EXE化 計画

更新日: 2026-02-28

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# 外部素材化先行 + Electron EXE化 計画（案1）

PLEASE IMPLEMENT THIS PLAN:
# Electronポータブルzip配布 + 最小assetsテンプレート化 計画

## 要約
`public` 依存を先に除去し、素材と素材ファイル名指定をすべて外部化してから、Electron配布（exe）を確定します。  
決定済み事項は以下です。  
1. 外部素材ルートは `assets` 固定。  
2. ファイル名指定はすべて外部JSON化。  
3. 後方互換フォールバックは作らない（旧 `public`/旧ハードコードは使わない）。

## 重要な公開API/インターフェース変更
1. `src/world/stageSelection.ts`  
`STAGE_CATALOG` 定数を廃止し、`assets/config/game-config.json` から生成する方式に変更。  
2. `src/audio/voice.ts`  
`voiceManifest` の静的 import を廃止し、外部JSONを受けて `VoiceProfile[]` を構築するAPIに変更。  
3. `src/game/portraitSprites.ts`  
`import.meta.glob("/public/...")` を廃止し、外部設定（ディレクトリ名・拡張子順・状態別basename）を使う方式に変更。  
4. `src/main.ts`  
BGM/SE/ステージ/ポートレート/VOICEの参照元をすべて外部設定経由へ変更。  
5. `electron/main.ts`  
本番時は `app://` プロトコルで `dist` と外部 `assets` を同時配信する方式に変更（`/audio` `/picture` `/stage` `/config` は外部 `assets` へ）。  
6. `vite.config.ts`  
`publicDir` 由来のビルド同梱を無効化し、実行時は外部 `assets` を参照する設定に変更。

## 外部ファイル仕様（決定版）
1. `assets/config/game-config.json` を新設し、以下を定義する。  
`version`, `stageCatalog`, `audio.bgm.byStage`, `audio.se`, `audio.voiceManifest`
2. `assets/audio/voice/voice-manifest.json` に現行 `src/audio/voiceManifest.json` と同一スキーマを移設する。  
3. ステージJSONは `assets/stage/*.json`、SEは `assets/audio/se/*.mp3`、BGMは `assets/audio/bgm/*.mp3`、立ち絵は `assets/picture/chara/<dir>/...` を使用する。  
4. 旧 `public` 参照は全廃する。

## 実装ステップ
- [x] `docs/plan.md` 運用開始。既存 `docs/plan.md` を退避し、新規 `docs/plan.md` を作成し、以降1ステップごとに更新する。更新日は `date` コマンドで取得した日付を使う。
- [x] `assets/config/game-config.json` の型定義を `src/runtimeAssets/types.ts` に追加し、`src/runtimeAssets/loadConfig.ts` を新規作成して読み込み処理を実装する。
- [x] `src/world/stageSelection.ts` を外部設定駆動に変更し、`stageCatalog` から `StageSelection[]` を生成する。
- [x] `src/audio/voice.ts` を外部VOICEマニフェスト駆動へ変更し、静的 import を削除する。
- [x] `src/game/portraitSprites.ts` を外部設定駆動へ変更し、`import.meta.glob("/public/...")` を削除する。
- [x] `src/main.ts` の BGM/SE/VOICE/ステージ/立ち絵のハードコードを `game-config.json` 経由へ置換する。
- [x] `vite.config.ts` を更新し、ビルド時に `public` を同梱しない構成に変更する。
- [x] `electron/main.ts` を更新し、本番 `app://` 配信で `dist` と外部 `assets` をルーティングする。開発時は既存 dev server を継続利用する。
- [x] `README.md` を `public` 手順から `assets` 手順へ更新し、利用者向けに「exe同階層 / サーバ起動時同階層」配置ルールを明記する。
- [x] `npm run build` と `npm run dist` を実行し、成果物で外部 `assets` 読み込みを確認する。
- [x] 括弧対応確認（特に `main.ts` と `portraitSprites.ts` の分岐変更箇所）を最後に実施し、`docs/plan.md` の結果欄を最新化する。

### 追加対応（2026-02-28）
- [x] トラップ発射SEをランダム選択から距離選択（`beamNonTarget`）へ変更する。
- [x] NPC発射SEを距離選択へ変更し、プレイヤー狙い時は`beamTarget`を選ぶようにする。
- [x] READMEのSE説明に`beamNonTarget`/`beamTarget`の距離選択ルールを追記する。
- [x] 素材フォルダ維持用のダミーファイル（`.gitkeep`）を配置できるようにする。
- [x] ダミーファイル名（`.gitkeep`）を実装側で読み込み対象から除外する。

### 追加対応（2026-02-28 ポータブルzip配布 + 最小assetsテンプレート化）
- [x] `assets-template` を新規作成し、`config/game-config.json`・`audio/voice/voice-manifest.json`・`stage/laboratory.json`・各素材フォルダの`.gitkeep`を配置する。
- [x] `assets-template/config/game-config.json` を1ステージ固定（`laboratory`）かつ `audio.bgm.byStage = {}` の最小構成にする。
- [x] `assets-template/audio/voice/voice-manifest.json` に `00` のみを持つ最小スキーマ（各配列空）を定義する。
- [x] `vite.config.ts` に `/config/se-files.json` ルートを追加し、`assets/audio/se` の実在 `.mp3` 一覧のみ返すようにする。
- [x] `electron/main.ts` に `/config/se-files.json` ルートを追加し、Viteと同じ条件で `.mp3` 一覧を返すようにする。
- [x] `src/runtimeAssets/loadConfig.ts` に `loadSeFileNames()` を追加する。
- [x] `src/main.ts` のSE再生可否判定を `game-config.json` 記述ベースから `se-files.json` 実在一覧ベースへ変更する。
- [x] `package.json` の配布設定を `portable` ターゲットへ切り替え、`npm run dist` で `dist:portable` + `package:portable` を実行するようにする。
- [x] `scripts/package-portable.ps1` を追加し、`release` 内の portable exe と `assets-template` をまとめて `*-portable.zip` を生成する。
- [x] `README.md` に Windowsポータブル配布手順（`npm run dist` / zip構成 / インストーラー不使用 / 削除方法）を追記する。
- [x] `npm run build` / `npx tsc -p tsconfig.json --noEmit` / `npm run build:electron` / `npm run dist` を実行して成功を確認する。

### 追加対応（2026-02-28 方針簡素化）
- [x] 後続指示に合わせて、配布は「portable exe単体」を基本とし、zip同梱フローを取りやめる。
- [x] `package.json` の `dist` を `npm run build && electron-builder --win portable` に簡素化する。
- [x] `scripts/package-portable.ps1` を削除する。
- [x] `assets-template` を削除し、exe入手者が `assets/` を手動作成して使う運用に一本化する。
- [x] `README.md` のWindows配布手順を「portable exe単体配布」前提へ修正する。

## 結果
- `docs/plan.md` を今回タスク用に再作成し、旧計画を `docs/plan_2026-02-27_external-assets-prev.md` へ退避した。
- `assets/config/game-config.json`、`src/runtimeAssets/types.ts`、`src/runtimeAssets/loadConfig.ts` を追加し、外部設定ロードの土台を作成した。
- `src/world/stageSelection.ts` の `STAGE_CATALOG` 定数を撤廃し、`buildStageCatalog(gameConfig)` で生成する方式へ変更した。
- `src/audio/voice.ts` の `voiceManifest` 静的 import を廃止し、`buildVoiceProfiles(manifest)` で外部JSONを受け取る構成へ変更した。
- `src/game/portraitSprites.ts` の `import.meta.glob("/public/...")` 依存を削除し、`configurePortraitAssets` で外部設定を注入する方式へ変更した。
- `src/main.ts` を外部設定駆動へ置換し、BGM/SE/VOICE/ステージ/立ち絵の参照元を `game-config.json` + `assets` へ統一した。
- `vite.config.ts` で `publicDir: false` を設定し、`/audio` `/picture` `/stage` `/config` を `assets` から返すdev/previewミドルウェアを追加した。
- `electron/main.ts` を `app://` プロトコル配信へ切り替え、本番では `dist` と exe同階層 `assets` をルーティングするようにした。
- `README.md` を `assets` 運用へ更新し、素材配置ルールを「サーバ起動時同階層 / exe同階層」に統一した。加えて `assets` へ素材を複製し、`src/audio/voiceManifest.json` を削除して外部JSON一本化した。
- `npm run build` / `npm run dist` を実行し成功を確認した。あわせて `npm run dev:web` で `/config/game-config.json` と `/stage/laboratory.json` が `200` で取得できることを確認した。
- `npx tsc -p tsconfig.json --noEmit` を追加実行して構文/型整合を再確認し、`main.ts` と `portraitSprites.ts` の括弧対応崩れがないことを確認した。
- 追加修正として、`assets/config/game-config.json` の `audio.bgm.byStage` を空オブジェクトに変更し、存在しない `laboratory.mp3` 参照による 404 を解消した（fallback の `研究所劇伴MP3.mp3` を使用）。
- 追加入力対応として、`audio.bgm.byStage` を全ステージ `id.mp3` 初期値へ更新し、`audio.bgm.fallback` を廃止した。
- BGMは `assets/audio/bgm` の実在 `.mp3` 一覧からランダム再生する方式へ変更し、`/config/bgm-files.json` を Vite/Electron 両方で提供するようにした。
- `game-config.json` の `version` を `2.0.0` に更新し、READMEの `game-config.json（version: 2.0.0時点）` 説明を素材配置向けの簡潔な内容に整理した。
- README の `SE` 節を実装準拠で整理し、利用者向けに「配置場所・キー形式・配列の書き方・未存在時の扱い」に絞って追記した。
- README の `SE` 設定例を実ファイル名から用途説明ベースへ変更し、重複していた説明文を削って読みやすく整理した。
- `SfxDirector` のビームSE再生を距離選択APIへ統一し、トラップ発射SEも `beamNonTarget` の距離選択で再生するように変更した。
- `updateNpcs` のビーム発射コールバックに `targetingPlayer` を追加し、NPCがプレイヤー狙いで発射した場合は `beamTarget` 側を距離選択するように変更した。
- README の `SE` 説明に `beamNonTarget` / `beamTarget` の `[遠/中/近]` 順と距離しきい値（2.33 / 1.33）を追記した。
- ビームSEの距離しきい値を `遠距離: 8セル以上`、`中距離: 4セル以上8セル未満`、`近距離: 4セル未満` へ変更し、実装値はワールド座標単位（`8/3`, `4/3`）に更新した。READMEはセル単位の説明に揃えた。
- ビームSEの距離しきい値を再調整し、`遠距離: 10セル以上`、`中距離: 5セル以上10セル未満`、`近距離: 5セル未満` に更新した。実装値はワールド座標単位（`10/3`, `5/3`）を使用し、READMEはセル単位表記に揃えた。
- README の `SE` 節で `beamNonTarget` / `beamTarget` の距離説明を文章から設定例の値へ移し、重複説明を削除した。
- README の `VOICE` 節を整理し、`audio.voiceManifest` の指定方法と `voice-manifest.json` の必須キー/パス記法に絞った素材配置向けの説明へ更新した。
- VOICEマニフェストのファイル名を `voiceManifest.json` から `voice-manifest.json` へ統一し、`game-config.json` と README の参照先を新名称へ更新した。
- `portraits.directories` / `portraits.extensions` を `game-config.json` から削除し、立ち絵ディレクトリ一覧は `/config/portrait-directories.json` で自動取得する方式へ変更した。
- 立ち絵の拡張子探索順を実装固定（`png`→`jpg`→`jpeg`→`webp`→`gif`→`bmp`→`avif`→`svg`）へ変更し、READMEの説明を新仕様に更新した。
- `portraits.stateBaseNames` も `game-config.json` から削除し、状態別basenameを実装固定へ変更した。READMEから設定項目説明を削除した。
- README の「任意手順」セクション全体を再構成し、見出し階層を統一したうえで「配置→設定→素材別」の順に整理した。
- `assets/audio/bgm` / `assets/audio/se` / `assets/audio/voice` / `assets/picture/chara` / `assets/stage` に `.gitkeep` を追加し、空フォルダ構成をGitで保持できるようにした。
- `vite.config.ts` と `electron/main.ts` の動的一覧取得で `.gitkeep` を除外するようにし、実行時の素材探索に影響しないようにした。
- `vite.config.ts` と `electron/main.ts` に `/config/se-files.json` を追加し、SEは `assets/audio/se` の実在 `.mp3` 一覧のみ再生対象にするよう統一した。
- `src/runtimeAssets/loadConfig.ts` に `loadSeFileNames()` を追加し、`src/main.ts` の `isSeAvailable` 判定を実在SE一覧ベースへ変更した。
- 検証として `npm run build`、`npx tsc -p tsconfig.json --noEmit`、`npm run build:electron`、`npm run dist` を実行し、すべて成功を確認した。
- `npm run dist` 実行時に新規生成された実行ファイルは `release/HAIGURE SURVIVAL 1.2.0.exe`（portable）であることを確認した（`release` には過去成果物が残存しうる）。
- 括弧対応確認として、`vite.config.ts` と `electron/main.ts` の分岐追加箇所（`/config/se-files.json` ルート）に構文崩れがないことを `build` / `tsc` 成功で再確認した。
- 後続指示により方針を簡素化し、`scripts/package-portable.ps1` と `assets-template` は削除した。
- `npm run dist` は portable exeを1つ作るだけの構成へ戻し、配布時は exe単体を渡して受け取り側が `assets/` を手動作成する運用に統一した。
- READMEのWindows配布手順は上記運用に合わせて更新した。
