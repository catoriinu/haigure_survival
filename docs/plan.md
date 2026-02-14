# アラームセル機能追加 計画

更新日: 2026-02-14

## プロンプト
PLEASE IMPLEMENT THIS PLAN:
# アラームセル機能追加 計画

## 要約
タイトル画面の `STAGE` パネルに「アラームトラップ有効化」チェックボックスを追加し、ON時のみアラームセル機能を有効化します。  
アラームセルは床に擬態し、ゲーム開始時に1セル抽選、以後2秒ごとに1セルずつ追加。aliveのプレイヤー/NPCが踏むと水色点滅（5秒）し、周囲50セル内の洗脳済みNPC（銃あり/銃なし）が、その踏んだキャラを強制追跡ターゲットに上書きします。  
強制追跡は既存 `alert/block/breakAway` より優先し、ターゲットが `brainwash-in-progress` に入った時点で解除します。

## 確定仕様（今回ロック）
- 適用ステージ: 全ステージ（チェックON時のみ有効）
- 点滅時間: 5秒
- 点滅色: 水色
- 距離定義: 2Dユークリッド距離（平面直線距離）で50セル以内
- 強制追跡上書き範囲: 全面上書き（`alert`/`block`/`breakAway` を中断）
- 強制追跡解除: ターゲットが `brainwash-in-progress` に遷移した時点
- アラーム再抽選: 踏まれたセルは点滅終了まで抽選対象外。終了後は再抽選可

## 重要なAPI/型の変更
- `src/ui/stageSelectControl.ts`
  - `StageSelectControlOptions` に以下を追加
    - `initialAlarmTrapEnabled: boolean`
    - `onAlarmTrapEnabledChange: (enabled: boolean) => void`
  - `StageSelectControl` に以下を追加
    - `getAlarmTrapEnabled: () => boolean`
    - `setAlarmTrapEnabled: (enabled: boolean) => void`
- `src/game/npcs.ts`
  - `updateNpcs(...)` に以下引数を追加
    - `getForcedAlarmTargetId: (npcId: string) => string | null`
  - 強制追跡中NPCの行動分岐を追加（`search/vision/loseRange` をバイパス）
- 新規 `src/game/alarm/system.ts`
  - `createAlarmSystem({...})` を追加
  - `syncStageContext(...) / resetRuntimeState() / update(...) / getForcedTargetId(...) / dispose()`
- `src/main.ts`
  - `createStageSelectControl` 呼び出しを新APIに合わせて更新
  - `alarmSystem` の生成・ステージ同期・リセット・毎フレーム更新を追加
  - `updateNpcs` 呼び出しに `getForcedAlarmTargetId` を接続
- `src/style.css`
  - `stage-select-control` 内チェックボックス行用スタイル追加

## 実装詳細（決定済み）
1. `docs/plan.md` 運用を先に実施
- `Get-Date -Format yyyy-MM-dd` で日付取得
- 既存 `docs/plan.md` を `docs/plan_2026-02-14_dynamic-beam-prev-current.md` へ改名
- 新しい `docs/plan.md` を規定フォーマットで作成し、このプロンプト原文と本計画を反映
- 実装ステップ完了ごとに `docs/plan.md` のチェックと結果欄を更新

2. STAGEパネルにチェックボックス追加
- `stage-select-control` に `label + checkbox + 文言「アラームトラップ有効化」` を追加
- タイトル中設定値 `titleAlarmTrapEnabled` と実行時設定 `runtimeAlarmTrapEnabled` を分離
- `startGame()` で `title -> runtime` を確定

3. アラームシステム新規実装（`src/game/alarm/system.ts`）
- 保持状態
  - `activeAlarmKeys: Set<string>`（擬態中アラーム）
  - `blinkingByKey: Map<string, BlinkState>`（点滅中セル）
  - `forcedTargetByNpcId: Map<string, string>`（NPC強制追跡ターゲット）
  - `selectionTimerSec`（2秒加算タイマ）
  - `prevAliveCellByTargetId`（踏み入れ検知用）
  - `floorCellByKey`（key->セル情報）
- 初期化
  - `resetRuntimeState()` で空初期化し、開始時に即1セル抽選
- 周期抽選
  - 2秒ごとに候補から1セル追加
  - 候補は「床セル - active - blinking」
  - 候補0ならスキップ
- 踏み入れ検知
  - aliveターゲット（`player`, `npc_*` の `normal/evade`）のセル遷移を監視
  - 遷移先が `activeAlarmKeys` に含まれたら発火
- 発火処理
  - 該当セルを `active` から外して `blinking` に移行（5秒）
  - 水色点滅メッシュ生成（トラップ床点滅ロジックを流用）
  - 周囲50セル内の洗脳済みNPC（`brainwash-complete-gun/no-gun`）を対象に `forcedTargetByNpcId` を上書き
- 点滅終了処理
  - メッシュ破棄
  - `blinking` から除外（再抽選対象へ復帰）
- 強制追跡解除
  - `forcedTargetByNpcId` を毎フレーム点検
  - ターゲットが `brainwash-in-progress`（またはそれ以降のbrainwash系）になったら解除

4. NPC更新ロジックへの組み込み（`src/game/npcs.ts`）
- 強制追跡中のNPCは `alertState` を `none` にし、`alertReturn*`/`blockTargetId`/`blockTimer`/`breakAwayTimer` をクリア
- 強制追跡中は `brainwashMode = "chase"` と `brainwashTargetId` を固定
- `search` の可視判定、`loseRange` による解除、`no-gun` の block/breakAway 分岐はスキップ
- `targetedIds` は従来同様に更新（強制追跡対象も反映）

5. メインループ統合（`src/main.ts`）
- `alarmSystem` を生成
- ステージ切替時・`resetGame()` で `syncStageContext({ layout, floorCells })` と `resetRuntimeState()`
- `gamePhase === "playing"` フレームで `alarmSystem.update(delta, gamePhase, npcTargets)` を実行
- `updateNpcs` に `getForcedAlarmTargetId` を渡す
- チェックOFF時は `alarmSystem` 側で非動作

6. スタイル追加（`src/style.css`）
- `.stage-select-control__checkbox-row`
- `.stage-select-control__checkbox`
- `.stage-select-control__checkbox-label`

## テストケース・受け入れ条件
1. チェックOFFで開始
- アラームセル抽選が走らない
- 点滅も強制追跡も発生しない

2. チェックONで開始
- 開始直後に1セルが内部抽選される
- 2秒経過ごとに1セルずつ増える

3. プレイヤーがアラームセルを踏む
- 踏んだセルが水色点滅する
- 5秒後に点滅が消える
- 点滅中はそのセルが再抽選されない
- 点滅後は再抽選候補に戻る

4. alive NPCがアラームセルを踏む
- プレイヤー時と同様に点滅する
- 周囲50セル内の洗脳済みNPCのみが踏んだNPCを強制追跡する

5. 強制追跡の優先度
- 強制追跡中に `alert` が発生してもターゲットが維持される
- `block/breakAway` に移行しない

6. 強制追跡解除
- 対象が `brainwash-in-progress` へ遷移した瞬間に解除
- 解除後は通常AIへ復帰

7. 型チェック
- `npx tsc -p tsconfig.json --noEmit` が成功

## 前提とデフォルト
- 「踏む」はセル遷移（前フレームと異なるセルへ進入）で判定
- アラームセルは可視表示しない（点滅時のみ可視）
- 強制追跡対象は発火時点の半径内NPCに対して上書きし、後続発火で再上書き可
- 50セルは `layout.cellSize * 50` の平面距離として扱う

## ステップ
- [x] 既存 `docs/plan.md` を `docs/plan_2026-02-14_dynamic-beam-prev-current.md` へ改名し、新規 `docs/plan.md` を作成
- [x] STAGEパネルに「アラームトラップ有効化」チェックボックスを追加し、タイトル設定値/実行時設定値を分離
- [x] `src/game/alarm/system.ts` を新規実装（抽選、踏み検知、水色点滅、強制追跡管理）
- [x] `src/game/npcs.ts` の `updateNpcs(...)` を拡張し、強制追跡中は `alert/block/breakAway` より優先して追跡
- [x] `src/main.ts` に `alarmSystem` を統合（生成、stage同期、reset、update、NPC更新連携）
- [x] `src/style.css` に STAGEパネル内チェックボックス用スタイルを追加
- [x] `npx tsc -p tsconfig.json --noEmit` を実行して型チェック
- [x] 実装結果を `docs/plan.md` の結果欄へ反映

## 追加ステップ（ミニマップ追跡表示）
- [x] ミニマップ描画仕様の拡張（水色ドット描画パラメータ追加）
- [x] アラームセルを1回でも踏んだNPC IDを収集する連携を追加
- [x] ビットアラートのターゲットに1回でもなったNPC IDを収集する連携を追加
- [x] プレイヤー洗脳済み時のみ、対象NPC位置をミニマップへ常時表示する
- [x] 対象NPCが非aliveになったら追跡表示対象から除外する
- [x] `npx tsc -p tsconfig.json --noEmit` を実行して型チェック

## 追加ステップ（アラーム優先度修正版）
- [x] `src/game/alarm/system.ts` の強制単一ターゲット管理をFIFOキュー管理へ変更
- [x] `src/game/npcs.ts` のターゲット解決順を「アラームキュー先頭 -> 視界内最寄り -> なし」に変更
- [x] `src/game/npcs.ts` の追跡移動をBFS経路追従へ変更（壁回り込み）
- [x] `src/main.ts` の `updateNpcs` 連携を新API `getAlarmTargetStack` に更新
- [x] `npx tsc -p tsconfig.json --noEmit` を実行して型チェック

## 結果
- `docs/plan.md` を旧計画から切替し、前回計画を `docs/plan_2026-02-14_dynamic-beam-prev-current.md` に退避した。
- `src/ui/stageSelectControl.ts` に「アラームトラップ有効化」チェックボックスと設定取得/設定反映APIを追加した。
- `src/game/alarm/system.ts` を新規追加し、以下を実装した。
  - ゲーム開始時1セル抽選、2秒ごと1セル追加抽選
  - aliveターゲットのセル遷移でアラーム踏み判定
  - 踏まれたセルの水色点滅（5秒、トラップ点滅ロジック流用）
  - 点滅中セルの再抽選除外、終了後の再抽選復帰
  - 半径50セル内の洗脳済みNPCへの強制追跡ターゲット上書き
  - ターゲットが `brainwash` 系状態へ遷移した際の強制追跡解除
- `src/game/npcs.ts` の `updateNpcs(...)` を拡張し、強制追跡中は `alert/block/breakAway` を中断して追跡を優先するようにした。
- `src/main.ts` に `alarmSystem` を統合し、生成・ステージ同期・`resetGame` 同期・毎フレーム更新・`updateNpcs` 連携を実装した。
- `src/style.css` に STAGE パネル内チェックボックス行のスタイルを追加した。
- `npx tsc -p tsconfig.json --noEmit` を実行し、成功した。
- 追加指示対応として、ビットのアラート機能で呼び寄せられる対象をビットのみに変更した（`src/main.ts` の `applyAlertRequests(...)` からNPC受信処理を除去）。
- 追加指示対応として、NPC側の `alert receive` による強制追跡処理を除去した（`src/game/npcs.ts` の `receive` 分岐撤去、`src/game/types.ts` の `NpcAlertState` を `none|send` のみに整理）。
- 追加指示対応として、ミニマップに追跡NPC表示を追加した。
  - `src/game/alarm/system.ts` に `onNpcTriggerAlarmCell` コールバックを追加し、アラームセルを踏んだNPCを `src/main.ts` 側で記録するようにした。
  - `src/main.ts` に `alarmTriggeredNpcIds` / `bitAlertTargetedNpcIds` を追加し、ビットアラートターゲット化されたNPCをフレームごとに記録するようにした。
  - プレイヤーが洗脳状態（`isBrainwashState(playerState)`）の間のみ、追跡対象NPCの現在位置をミニマップ描画へ渡すようにした。
  - 追跡対象NPCが非aliveになった時点で追跡集合から除外するようにした。
  - `src/ui/hud.ts` に `trackedNpcPositions` 描画を追加し、水色（`#66e8ff`）ドットとして常時表示するようにした。
  - `npx tsc -p tsconfig.json --noEmit` は成功した。
- 追加指示対応として、アラーム優先度修正版を実装した。
  - `src/game/alarm/system.ts` のNPCターゲット保持を単一IDからFIFOキューへ変更し、新規アラーム候補を末尾挿入・重複は位置維持にした。
  - ターゲット取得APIを `getForcedTargetId(...)` から `getAlarmTargetStack(...)` に変更した。
  - `src/game/npcs.ts` でターゲット解決順を「アラームキュー先頭 -> 視界内最寄り -> なし」に変更した。
  - `src/game/npcs.ts` の追跡移動を、`buildReachableMap` + `setNpcDestination` によるBFS経路追従へ変更した（壁回り込み）。
  - `src/main.ts` の `updateNpcs` 連携を新APIへ更新した。
  - `npx tsc -p tsconfig.json --noEmit` は成功した。
