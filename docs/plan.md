# 外部素材化先行 + Electron EXE化 計画

更新日: 2026-02-28

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# 外部素材化先行 + Electron EXE化 計画（案1）

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
`version`, `stageCatalog`, `audio.bgm.byStage`, `audio.bgm.fallback`, `audio.se`, `audio.voiceManifest`, `portraits.directories`, `portraits.extensions`, `portraits.stateBaseNames`
2. `assets/audio/voice/voiceManifest.json` に現行 `src/audio/voiceManifest.json` と同一スキーマを移設する。  
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
