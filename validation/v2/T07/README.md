# T07 検証runner

更新日: 2026-09-06

T07の計測、前後比較、保持観測、既存fixture回帰、P2-U01起動UI確認の入口をまとめる。コマンドはrepository rootから実行する。通常ゲームを使うrunnerでは、対象worktreeから dev:web を起動し、正本のローカル音声・Character画像を利用できる状態にする。

以下のplaceholderは実行環境の絶対pathへ置き換える。

~~~powershell
$PLAYWRIGHT_MODULE = "<absolute-path-to-playwright-index.mjs>"
$BROWSER_EXECUTABLE = "<absolute-path-to-chromium.exe>"
$OUTPUT_ROOT = "<absolute-artifact-directory>"
$GAME_URL = "http://127.0.0.1:5175/"
~~~

計測中は対象source、計測runner、依存lock、Vite設定、ローカル素材を変更しない。WebとElectron、normalとstress、beforeとafterは同時実行せず、同じ電源設定と表示条件で直列実行する。

## 計測器・負荷driverの独立fixture

時間窓、Long Taskの帰属・末尾回収、observerの寿命、人口、実負荷の証拠、要求列の再生、配置条件を確認する。`measurementRunner.mjs`は計測器とstressの各testをメモリ内でbundleし、ブラウザ・通常ゲームserver・配布buildを起動しない。stressの再生・配置testは`stressWorkload.test.ts`から含まれる。

~~~powershell
node node_modules/typescript/bin/tsc --noEmit -p validation/v2/T07/stressWorkload.tsconfig.json
node validation/v2/T07/measurementRunner.mjs
~~~

これは計測方法と負荷driverの独立検証であり、実学校の性能・機能・保持観測の合格数へ加算しない。

## 実時間性能計測

入口は validation/v2/T07/runPerformance.mjs。

normalは開始直後10秒のcoldと続く60秒のsteadyを計測する。stressは120秒を計測する。fixed-4200は4200 frameの診断用で、待機上限は480秒。normal／stressの待機上限は180秒である。全runtimeで1920x1080、device scale factor 1、seed 20260725、courtyard視点をrunnerが固定する。

Web normal 3回:

~~~powershell
node validation/v2/T07/runPerformance.mjs --runtime=web --profile=normal --label=before --runs=3 --output="$OUTPUT_ROOT/before" --playwright-module="$PLAYWRIGHT_MODULE" --browser-executable="$BROWSER_EXECUTABLE" --url="$GAME_URL"
~~~

Electron normal 3回:

~~~powershell
node validation/v2/T07/runPerformance.mjs --runtime=electron --profile=normal --label=before --runs=3 --output="$OUTPUT_ROOT/before" --playwright-module="$PLAYWRIGHT_MODULE" --url="$GAME_URL"
~~~

stressでは、比較対象外のsmokeで負荷成立を確認した意味request列を保存し、同じ列をbefore／afterで共通利用する。WebとElectronで共通列を使ってもよい。生成された`-inputs.json`には実行結果も含むが、同一性は要求時刻・順序・ID・引数のrequest hashで比較する。recordをbefore値に混ぜるとstressInputModeが異なり比較不能になる。下記はruntimeごとに記録する例である。正式なT07比較では、Gの繰返しと12人への募集burstを含む、smokeで成立済みの共通入力を使用する。

~~~powershell
node validation/v2/T07/runPerformance.mjs --runtime=web --profile=stress --label=record --runs=1 --stress-inputs=record --output="$OUTPUT_ROOT/input-record-web" --playwright-module="$PLAYWRIGHT_MODULE" --browser-executable="$BROWSER_EXECUTABLE" --url="$GAME_URL"
node validation/v2/T07/runPerformance.mjs --runtime=web --profile=stress --label=before --runs=3 --stress-inputs="<absolute-path-to-web-stress-inputs.json>" --output="$OUTPUT_ROOT/before" --playwright-module="$PLAYWRIGHT_MODULE" --browser-executable="$BROWSER_EXECUTABLE" --url="$GAME_URL"

node validation/v2/T07/runPerformance.mjs --runtime=electron --profile=stress --label=record --runs=1 --stress-inputs=record --output="$OUTPUT_ROOT/input-record-electron" --playwright-module="$PLAYWRIGHT_MODULE" --url="$GAME_URL"
node validation/v2/T07/runPerformance.mjs --runtime=electron --profile=stress --label=before --runs=3 --stress-inputs="<absolute-path-to-electron-stress-inputs.json>" --output="$OUTPUT_ROOT/before" --playwright-module="$PLAYWRIGHT_MODULE" --url="$GAME_URL"
~~~

afterもlabelとoutputだけafterへ変え、同じstress入力を使う。各runは独立したbrowser contextまたはElectron partitionを使う。計測区間中に強制GCせず、完了後に保持heapと終了後heapを採る。

source identityはGit管理済み／未追跡かつ非ignoreの次をhashする。

- src配下
- index.html
- validation/v2/T07/runPerformance.mjs
- validation/v2/T07/performanceElectron.cjs
- validation/v2/T07/mediaObservation.mjs
- package.json、package-lock.json、vite.config.mts

public/audioとpublic/picture/charaはsource identityとは別のmaterial manifestとして全fileをhashする。各run後にsource identityを再計算し、変更時は instrumentationUnchanged=false として以後のrunを止める。

normalのlocalAcceptance=passedは絶対性能条件を含む。stressのcomparison-and-retained-heap-requiredは採取完了であり、最終合格ではない。

## before／after比較

入口は validation/v2/T07/comparePerformance.mjs。before、afterの各directoryに、labelがbefore／afterのWeb／Electron × normal／stress × 3回のJSONが必要である。

~~~powershell
node validation/v2/T07/comparePerformance.mjs --before="$OUTPUT_ROOT/before" --after="$OUTPUT_ROOT/after" --output="$OUTPUT_ROOT/comparison.json"
~~~

各条件3回の中央値を使う。環境、seed、視点、人口、描画条件、素材fingerprint、電源設定、stress入力mode／hashなどが一致し、証拠が完備した場合だけ比較する。各条件の`*-source.json`と各runのtreeHashを結び、collector、main、survivalRuntime、bitSystem、runPerformance、mediaObservationのhashをbefore/afterで照合する。performanceStressWorkloadはstress、performanceElectronはElectronでのみ照合する。実行しないElectron helperの変更はWeb groupの比較条件へ含めない。

normalはafter全3回の絶対条件、stressは主要p95／p99と、計測終了後の強制GCで取得した保持heapの`usedSize`がbefore比5%以内で合格する。`backingStorageSize`は補助値とし、Electron 28のCDPで未取得の場合はunavailableを残す。未取得を0へ置き換えず、主要指標の判定とは別に表示する。保持リークの判定は次の独立runnerで行う。

report欠落・artifact読込失敗・source manifest不足はgroupのincompleteとして保存し、残るgroupの集計を継続する。正式測定で生じたwarning/errorや数値未達はその回を除外せず、3回の結果に残す。計測方法の不備や入力中断で条件が成立しなかったattemptは別途保持し、補完理由と同条件の確認を記録する。初回Electronの待機画面CSP警告はhelper修正後にElectronだけを取り直す対象とし、Webの正式回は保持する。

## session再開始後の保持観測

入口は validation/v2/T07/runRetainedHeap.mjs。cyclesは3以上。同じrendererでnormal 70秒を完了してから毎回GCし、RとEnter→Canvasを交互に使って新sessionへ進む。最終session後はbeforeunloadを2回送り、全owner解放後にもう一度GCする。GCは必ず性能計測区間外で行う。

Web:

~~~powershell
node validation/v2/T07/runRetainedHeap.mjs --runtime=web --cycles=3 --output="$OUTPUT_ROOT/retained-web.json" --playwright-module="$PLAYWRIGHT_MODULE" --browser-executable="$BROWSER_EXECUTABLE" --url="$GAME_URL"
~~~

Electron:

~~~powershell
node validation/v2/T07/runRetainedHeap.mjs --runtime=electron --cycles=3 --output="$OUTPUT_ROOT/retained-electron.json" --playwright-module="$PLAYWRIGHT_MODULE" --url="$GAME_URL"
~~~

source identityはsrc配下、runRetainedHeap.mjs、performanceElectron.cjs、mediaObservation.mjs、package.json、package-lock.json、vite.config.mtsをhashし、開始前後の一致を要求する。outcome.status=collectedはowner、identity、session交換、終了処理、診断の構造条件を満たした意味である。heap差だけでリーク0件とせず、同条件の複数run分布とDOM／listener傾向を人が比較する。

## 既存fixture回帰

入口は validation/v2/T07/runRegression.mjs。runner自身がsuite専用Viteを起動して終了するため、通常ゲームの5175は使わない。port 5175は拒否される。

suiteは次の13種類。

- t04、t04-school、b05、t05、t05-npc-command
- t06、t06-2、t06-3、t06-4
- t06-6a、t06-6b、t06-6c、t06-6d

1 suiteの例:

~~~powershell
node validation/v2/T07/runRegression.mjs --suite=t06-6d --output="$OUTPUT_ROOT/regression/t06-6d.json" --playwright-module="$PLAYWRIGHT_MODULE" --browser-executable="$BROWSER_EXECUTABLE" --port=5212
~~~

全suiteを別portで各1回実行する。outcome.status=passed、failedChecks空、externalIssueCount=0、cleanupErrors空を確認する。t05の既存残1件はrunnerが免除せず、そのまま正式結果へ保存する。

## P2-U01起動UI

入口は validation/v2/T07/runStartupUi.mjs。P2-U01を適用した通常ゲームserverへ接続する。

~~~powershell
node validation/v2/T07/runStartupUi.mjs --url="$GAME_URL" --output-dir="$OUTPUT_ROOT/startup-ui" --playwright-module="$PLAYWRIGHT_MODULE" --browser-executable="$BROWSER_EXECUTABLE"
~~~

最初のcontextではmain.tsのdynamic importを保留する。loadingを6 viewportで記録し、実時間15秒以上経過してstalledになってから再び6 viewportを記録する。保留は固定16秒ではなく、stalledの6画像を採り終えてから解除する。解除後runningへ到達し、NPC数を変更して通常2行start hintを発生させ、同じ6 viewportを記録する。別contextではmain.tsを失敗させ、failedを6 viewportで記録する。

main requestとfailed／2行hint待ちは各10秒、stalled待ちは25秒、resume後running待ちは180秒が上限。viewport順は1920x1080、1280x720、1024x600、800x600、640x480、480x360で、変更後100ms待って観測する。各状態で横overflow、中央配置、viewport内包、font／line-height、heading／mode／version／通常status表示との非重複を確認し、合計24 PNGとresult.jsonを出力する。

source identityはindex.html、src/style.css、src/v2/bootstrap.ts、src/v2/startupDiagnostics.ts、src/v2/main.tsの5file。開始前後のaggregateSha256一致を要求する。outcome.status=passed、sourceUnchanged=true、各snapshotのerrors空を機械合格とし、24画像は文字の読みやすさと全体配置を人が確認する。

## 証拠の保持

- before、after、stress入力記録、保持観測、fixture、UIを別directoryへ保存し、既存証拠を上書きしない。
- runPerformanceの各run JSON、summary、source manifest、material manifest、stress inputs、PNG、comparePerformanceのJSONを組として保持する。
- runRetainedHeapのJSONはruntimeとcyclesが分かる名前にする。
- runRegressionは13 suiteそれぞれのJSONを保持する。
- runStartupUiはresult.jsonと24 PNGを同じdirectoryに保持する。
- 失敗時もJSON、失敗stage、diagnostics、server／process log、画像を削除しない。
