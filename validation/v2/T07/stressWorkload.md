# T07 最大構成の実負荷driver

`src/v2/performanceStressWorkload.ts` は、通常性能計測とは独立した実時間120秒stressに使う。Player 1、NPC 99（初期洗脳66）、BIT 50、20室の荒れvariantを呼出側で構成する。既存の固定4200frame向け人工alertやBIT scripted phaseは使わない。

`createV2PerformanceStressWorkload({ stage, dynamicRuntime, survival, player, camera, replayInputs })` で作成する。`stage` は実際の `StageSpatialSession` とし、扉、エレベーター、NavMesh、選択variantはそこから取得する。学校固有座標・停止階ID・NPC IDを埋め込まない。`replayInputs` は必須で、`null` は新規記録、配列は保存済み入力の再生である。空配列も明示した再生として扱い、自動入力へ切り替えない。

通常のdynamic/survival更新後に、最初のplaying frame入口からの実時間を `update(elapsedSeconds)` に渡す。120秒到達後に `getReport()` の戻り値を計測結果へ退避し、sessionの破棄に合わせて `dispose()` する。driver自身はtimer、DOM listener、Scene observerを登録しない。計測中は毎frame `getReport()` して入力列全体を複製せず、計測器の報告間隔と終了時に取得する。

Playerのfixture配置は、実NPC位置からBlender正本1m相当（0.25world）離した候補をNavMeshへ投影し、stage境界、視線、全NPCとの水平離隔が成立した場合だけ行う。最低離隔は通常Colliderの正本と同じ `PLAYER_SPRITE_WIDTH / 2 + NPC_SPRITE_WIDTH / 2`（現行0.2world）から取得し、NavMesh投影後の実座標で確認する。配置先・注視方向・対象IDは全件 `inputs` に記録する。NPC/BITの位置、状態、更新頻度は変更しない。Playerが通常の被弾・洗脳で銃選択可能になった時だけ通常G操作と同じAPIを呼び、以後は通常の射撃要求を行う。Followは通常の3m距離・状態・視線条件を通し、driver側に人数上限を設けない。

動的扉は2秒ごとに2枚へ通常toggle要求を行う。エレベーターは4秒ごとに、停止中なら実metadataの別停止階へ通常呼出要求を行う。扉の占有解決、エレベーターの安全判定・移動速度・定員・通常NPC traversalは既存Runtimeが担当する。これらは明示したfixture入力であり、実Playerの移動・インタラクション受入の代用にはしない。

`getStressWorkloadSnapshot()` は既存NPC/BIT frame viewから必要な観測値だけを返す。Follower光線は、`npcSystem.notifyBeamsSpawned` が実beam IDを受け取り `active` へ進んだ場合を生成証拠とする。`scheduled` とPlayer射撃要求だけでは成立にしない。

判定は実人口、全20荒れ室、複数扉の変位、エレベーターの移動と別階到着、NPC/BITの移動、6人を超える同時Follower、同期光線生成、NPC/BITそれぞれ両個性の実標的保持を要求する。6人超は少人数の受入だけで代用しないための最低観測値であり、人数上限ではない。120秒経過していても証拠不足は `incomplete` と `missingEvidence` に残す。性能、console診断、終了後保持の合否は別の計測器・受入で判定する。

reportはversion 3とし、`inputMode` に `record` または `replay` を保存する。`V2StressInput` は要求と結果を次のように分ける。

```json
{
  "request": {
    "requestedAtSeconds": 12.5,
    "kind": "elevator-call",
    "elevatorId": "metadataのエレベーターID",
    "stopId": "metadataの停止階ID"
  },
  "result": {
    "executedAtSeconds": 12.516,
    "accepted": true
  }
}
```

要求には共通の操作方針と引数を保存する。`player-placement` は `targetNpcId`、対象からの接近候補を順に並べた `approachOffsets`、`aimPolicy: "target-aim-position"` を持つ。`follow` は `npcId`、`player-shot` は `direction`、`door-toggle` は `doorId` を持つ。`select-gun` は追加引数を持たない。配置要求の結果に、実際の足元座標・照準方向・採用offset・対象の実足元を `resolvedPlacement` として保存する。配置未成立はnull、配置以外は省略する。

新規記録は実状態に応じて要求を生成する。再生は保存した要求時刻に達したframeで、同時刻も含め元の順序のまま一度ずつ通常APIへ送る。対象IDの再選別や新しい自動コマンドを追加しない。配置の記録・再生は同じexecutorを使い、対象NPCの現在足元へ保存offsetを加えてNavMeshへ投影する。現在の境界・視線・Player可動状態・全NPCとの水平離隔が成立した候補だけ採用する。全候補が不成立なら `result.accepted=false` とする。固定する入力は「同じ対象へ同じ接近方針で接近する」要求であり、移動する対象へ届かなくなる過去の絶対座標ではない。実際に解決した座標の差は結果として比較する。銃選択の未解放や通常APIの拒否を強制突破しない。

`serializeV2StressInputRequests(inputs)` は要求のkey順を正規化したJSON文字列を返す。runnerへはdriver出力またはこのserializerで同じkey順へ正規化した入力artifactを渡す。runnerは正規化済み要求列のJSONからSHA-256のfingerprintを作り、許否結果・再生時刻を混入させずに同一要求列を比較できる。`replay.resultMismatches` は記録時と再生時の許否差、`maximumDelaySeconds` は要求時刻から実行frameまでの最大遅延を保存する。拒否された要求も実行済みであり、同一入力列の未実施とは扱わない。120秒の観測を終えるframeで遅れて実行された入力は、実行時刻を保持したうえで計測区間外として `missingEvidence` へ残す。

前後の性能比較には同じ保存入力を使うreplay同士を使用する。最初のrecordには候補探索・入力生成の自己コストが加わるため、入力採取・負荷成立確認として別扱いにする。比較時は `inputs`、許否差、最大遅延、`phaseSeconds` と実負荷証拠も保存・照合する。自然洗脳やFollowerが時間内に成立しない場合、状態固定や無敵化で補わない。

`stressWorkload.test.ts` の `runStressWorkloadTests()` は、時間だけの合格、人口削減、荒れ室不足、要求のみでの扉・エレベーター判定、静止Actor、予約のみの同期射撃、個性割当だけでの実標的判定を検出する。`stressWorkloadReplay.test.ts` では再生時刻・順序・一度だけの実行・許否不一致・空配列・配置未成立・意味入力の再生・状態条件を確認する。`stressWorkloadPlacement.test.ts` では対象以外のNPC、NavMesh投影後の重複、既存の幾何条件、0.2worldの境界、対象移動後の現在位置による解決と結果記録を確認する。これらのpure testは実学校120秒の受入結果とは区別する。
