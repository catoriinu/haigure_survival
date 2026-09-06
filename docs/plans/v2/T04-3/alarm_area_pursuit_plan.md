# NPC／BIT共通Navigation Area三段階追跡・負荷最適化 計画

更新日: 2026-08-01

## プロンプト

Alarm床を踏んだ際、約41人のNPCが同時にプレイヤーを標的として20～30fpsまで低下する。Alarmの絶望感と全対象の論理的な追跡は維持し、処理の軽量化によって99 NPC／50 BITまで成立させる。Alarm対象人数とdetail人数には上限を設けず、99人全員が12m以内へ集まれば全員detailになり得る。

単純な12mグリッドは使用しない。ステージ側で任意形状のNavigation AreaとPortalを明示し、壁越しの誤判定と第一段階・第二段階の往復を防ぐ。ターゲットがAreaを変更したときも全Actorの再計算を同一フレームに集中させず、2秒以内に分散する。

この三段階追跡はAlarm専用にせず、NPCとBITが移動する標的へ遠距離から接近する共通基盤とする。Alarm、Alert、通常視認などの標的選択理由と、`area`／`coarse`／`detail`という移動精度を分離する。最終視認位置、Follow、Leave、固定目的地、局所的な扉・エレベーター・捕獲、BITの固定・ランダム・カーペット攻撃など、精密位置または固定位置がゲーム性となる状態には適用しない。

Navigation AreaをV2ゲーム基盤として作者資産・Runtime両仕様書へ反映し、将来の全ステージ制作で参照できるようにする。Area分割が粗すぎる場合は詳細追跡へ早く移って軽量化効果が下がり、細かすぎる場合はArea revisionと再計算要求が増えるというトレードオフ、壁を跨がない分割基準、Portal境界、生成・監査条件を明記する。

2026-08-01追加指示:

Alarm対象は人数制限せず全員がプレイヤーを追跡する。追跡を`area`、`coarse`、`detail`の3段階へ変更する。`coarse → detail`は残りNavMesh経路距離12m以内、`detail → coarse`は18m以上とし、12～18mでは現在Phaseを維持する。99人全員が12m以内へ集まれば全員detailになり得る仕様とし、detail人数上限は設けない。

`area`は標的と別Navigation Areaで固定地点へ低頻度接近、`coarse`は同じAreaで2秒間隔の概算追跡、`detail`は最後に経路へ採用した位置から累積0.15 world unit移動した場合だけ最新位置へ再計画する。直線距離だけではdetailへ昇格せず、既存経路の残りNavMesh距離を使用する。detailからは残り経路距離または水平直線距離18m以上でcoarseへ戻す。Alarm発生位置は影響対象選定だけに使用し、追跡目的地には使用しない。

NPCの観測位置、未処理の最新目的地、最後に採用した経路目的地を分離し、未処理要求は最新位置へ統合する。再計画は最大4件／フレームの要求Queueとし、移動安全・stuck・evade・プレイヤー指示、detail、標的／Area変更、coarse、通常徘徊の順、同一優先度は要求時刻とActor ID順で処理する。detail要求は60Hzで1秒以内、coarse／area要求は2秒以内に処理する。

`NavigationAgentStepResult`へ追加探索なしの残り経路距離を追加する。Navigation Area APIを初期特定用`locate(point)`と連続移動用`advance(cursor, from, to)`へ分離し、Portal以外の通常移動では全Area包含検査を行わない。標的Area snapshotは全人間分の毎フレーム先行生成をやめ、実際に参照された標的だけを同一フレーム1回解決する遅延Trackerとする。BIT固有の追跡頻度は維持する。

学校`.blend`、GLB、NavMesh、生成器、カタログhash、5 Area／4 Portalは変更しない。通常視認、Alert、標的選択個性、Follow／Leave、evade、最終視認位置、扉、エレベーターを回帰し、99 NPC／66初期洗脳済みNPC／50 BITを含むWeb／Electron負荷検証を行う。人数上限や旧静的追跡へのfallbackは追加せず、独立観点レビューと単一commitまでを完了範囲とする。push、Pull Request、mergeは行わない。

2026-08-01 PR #59インラインコメント対応指示:

> プルリク59番にインラインコメントがつきました。内容を確認して、妥当かどうかを判断し、修正して、インラインコメントに返信してください。

最新HEAD `174046ee9eb51239855abfe45e81eed57f4bf605`の未解決3スレッドを確認し、いずれも妥当と判定した。エレベーター状態遷移時のNavigation Agent clearと再計画要求を共通処理で同期し、今フレームに経路探索を実行できない状態へ再計画枠を付与しない。Portalと交差せず現在Areaを離れた移動はRuntime契約違反として明示的に失敗させる。対象回帰、型検査、build、fixture後に同じPRブランチへcommit／pushし、各元スレッドへ修正内容と検証結果を返信する。スレッド解決とmergeは行わない。

## ステップ

- [x] 最新remote、dirty差分、既存worktree、学校レイアウト資産、Blender所有状態を確認し、専用branch／worktreeを作成する。
- [x] 保存済み学校レイアウトHEADを基準にし、Alarm床可視化commitを専用branchへ取り込む。
- [x] Navigation AreaをV2共通基盤として資産・Runtime仕様へ追加し、将来ステージの分割粒度、壁・Portal、監査、性能上のトレードオフを明文化する。
- [x] GLB作者契約へ任意形状のNavigation Area／Portalを追加し、学校生成器・監査器・仕様書・カタログを更新する。
- [x] RuntimeへArea registry、厳密包含、Portal境界保持、target Area snapshot／revisionを追加する。
- [x] NPC／BITの長距離追跡を共通の`area`／`coarse`／`detail`三段階へ移行し、12m／18mヒステリシスでPhase振動を禁止する。
- [x] 経路再計算を意味的revision駆動の要求Queueへ変更し、要求なし0件・1フレーム最大4件・優先度内Actor ID順へ統一する。
- [x] NPC通常歩行の重複床rayと、NPC／BITの遠距離標的座標追従を軽量化する。
- [x] 99 NPC／初期洗脳66 NPC／50 BIT stressを120秒実行し、完走したため詳細追跡48人上限を有効化しない。
- [x] 資産再生成、NavMesh hash不変、型検査、build、T04／T05 fixture、Web／Electron、人間受入、console、破棄再読込を検証する。
- [x] 独立観点の二巡目差分レビュー、テキスト配布検査、計画結果更新を行い、単一commitを作成する。
- [x] 2026-08-01時点の専用worktree、HEAD、対象外資産5ファイルのSHA-256、ルートworktreeのdirty差分を再確認する。
- [x] `area`／`coarse`／`detail`、12m／18mヒステリシス、累積0.15目的地更新を実装する。
- [x] 最大4件／フレームの要求Queue、重複統合、優先順位、1秒／2秒期限、残り経路距離を実装する。
- [x] Navigation Areaを`locate()`／`advance()` cursor APIへ移行し、標的Area snapshotを遅延解決する。
- [x] Runtime仕様、性能診断、HUD、T04／T05 fixtureを三段階追跡契約へ更新する。
- [x] 通常ゲーム、Web／Electron stress、実操作、console、破棄再読込、資産hash不変、テキスト配布を検証する。
- [x] 独立観点レビュー後、最新結果を記録して修正用の単一commitを作成する。
- [x] PR #59の最新base／headと全未解決review threadを取得し、3件の指摘の妥当性をコード上の実行順から判定する。
- [x] エレベーター状態遷移時のAgent clear、再計画要求、探索可能状態のQueue許可を修正する。
- [x] PortalなしArea離脱の契約違反検出と対象回帰テストを追加する。
- [x] V2／T04／T05型検査、対象build／fixture、差分・UTF-8検査を実行する。
- [x] 修正結果を記録し、単一commitをPR #59へpushして3件の元スレッドへ返信する。

## 結果

NPC追跡を`area`／`coarse`／`detail`へ移行し、12m／18mヒステリシス、coarseの2秒分散更新、detailの累積0.15更新を実装した。観測位置、未処理の最新目的地、最後に経路へ採用した目的地を分離し、最大4件／フレームの優先Queueで同一Actor要求を統合する。`NavigationAgentStepResult.remainingPathDistance`は既存経路点から計算し、LOD判定用の追加探索を行わない。Alarm対象とdetail人数の上限は追加していない。

Navigation Areaは`locate()`／`advance()` cursor APIへ統一し、標的snapshotを参照時だけ同一フレーム1回解決してNPC／BITで共有する。Portal検査は接続PortalのAABB broad phase後に実Volume三角形を判定する。未参照標的は次回`locate()`し、エレベーター搬送中は出発Areaを凍結、降車時に目的Areaを再特定する。これにより4階廊下で発生した古い`school-ground` cursorの持越し例外を修正した。

長時間stress中に、低frameの1更新で呼出マットを飛び越す場合と、経路再計画時点ですでに遷移点へいる場合を確認した。前者はVolume ID指定の実三角形線分交差query、後者は`moving-to-elevator-call-mat`状態で実待機点へ戻ってから呼出す契約で修正した。座標推測、AABBによる最終判定、旧経路fallbackは追加していない。

最終fixtureはT04 115／115、実学校統合67／67、T05 289／289、NPC command 16／16でPASSした。V2／T04／T05型検査、通常／Electron／T04／T05 build、依存監査、学校NavMesh check、`git diff --check`、UTF-8 strict、BOMなし、ローカル絶対パス・競合marker検査を実行した。学校`.blend`、GLB、人間用static／room variants／BIT NavMesh、生成器、カタログは変更していない。

seed 20260801でWeb／Electronの99 NPC／初期洗脳66 NPC／50 BITを120秒完走した。Web／Electronの50 NPC／初期洗脳10 NPC／20 BITも600秒完走し、途中で発見した呼出マット回帰を修正後、最終ソースでは99体120秒を再完走した。

基準`c87589d`と1920×1080・同一seedで各3回測定したsteady中央値は、total frame p95が66.7msから23.1msへ約65%改善した。一方、NPC section p95は2.4msから10.6msへ悪化し、10%以内の計画基準は未達である。古い標的位置へ停止していた基準では60秒のNPC経路探索が203件、修正後は最新位置へ追随して3,857件となったことが主因である。Area `advance`時間は60秒中央値99.1msまで軽量化した。2026-08-01の人間受入ではAlarm床発動時を含めて体感上の重さが大幅に改善し、本タスクの性能改善を完了と判断した。追跡人数、0.15閾値、detail上限なしは維持し、NPC sectionの追加最適化は本タスクを妨げないT07の計測・最適化候補として扱う。

PR #59の未解決インラインコメント3件はいずれも妥当と判断した。エレベーター状態遷移時のAgent clearを共通処理へ統一し、再計画できない乗車待機・乗車中・降車中などの状態をQueue対象外にした。呼出待機中の手動経路探索はpending目的地を消費し、同一Actorが再計画枠を占有し続けない。Navigation AreaはPortalと交差しない移動でも現在Area内への到達を確認し、直接離脱を契約違反として失敗させる。

追加回帰4件を含むT05 fixtureは293／293、T04 fixtureは115／115、実学校統合fixtureは67／67でPASSした。V2／T04／T05型検査、通常／Electron／T04／T05 build、学校NavMesh check、UTF-8 strict・BOMなし、ローカル絶対パス・競合marker、`git diff --check`を確認した。ブラウザのconsole warning／error、Babylon Logger、unhandled rejectionは0件だった。修正は同じPR branchへ単一commitでpushし、元の3スレッドへ判断・修正・検証結果を個別返信する。スレッドはResolveしない。
