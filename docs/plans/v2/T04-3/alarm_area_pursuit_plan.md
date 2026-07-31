# NPC／BIT共通Navigation Area二段階追跡・負荷最適化 計画

更新日: 2026-07-31

## プロンプト

Alarm床を踏んだ際、約41人のNPCが同時にプレイヤーを標的として20～30fpsまで低下する。Alarmの絶望感と全対象の論理的な追跡は維持し、まず処理の軽量化によって99 NPC／50 BITまで成立させる。性能基準を満たせない場合だけ、経路距離が近い最大48人を詳細追跡、残りをArea追跡とする。48人以下なら全員を詳細追跡する。

単純な12mグリッドは使用しない。ステージ側で任意形状のNavigation AreaとPortalを明示し、壁越しの誤判定と第一段階・第二段階の往復を防ぐ。ターゲットがAreaを変更したときも全Actorの再計算を同一フレームに集中させず、2秒以内に分散する。

この二段階追跡はAlarm専用にせず、NPCとBITが移動する標的へ遠距離から接近する共通基盤とする。Alarm、Alert、通常視認、遠距離Followなどの標的選択理由と、Area追跡／詳細追跡という移動精度を分離する。固定目的地、局所的な扉・エレベーター・捕獲、BITの固定・ランダム・カーペット攻撃など、精密位置がゲーム性となる状態には適用しない。

Navigation AreaをV2ゲーム基盤として作者資産・Runtime両仕様書へ反映し、将来の全ステージ制作で参照できるようにする。Area分割が粗すぎる場合は詳細追跡へ早く移って軽量化効果が下がり、細かすぎる場合はArea revisionと再計算要求が増えるというトレードオフ、壁を跨がない分割基準、Portal境界、生成・監査条件を明記する。

## ステップ

- [x] 最新remote、dirty差分、既存worktree、学校レイアウト資産、Blender所有状態を確認し、専用branch／worktreeを作成する。
- [x] 保存済み学校レイアウトHEADを基準にし、Alarm床可視化commitを専用branchへ取り込む。
- [x] Navigation AreaをV2共通基盤として資産・Runtime仕様へ追加し、将来ステージの分割粒度、壁・Portal、監査、性能上のトレードオフを明文化する。
- [x] GLB作者契約へ任意形状のNavigation Area／Portalを追加し、学校生成器・監査器・仕様書・カタログを更新する。
- [x] RuntimeへArea registry、厳密包含、Portal境界保持、target Area snapshot／revisionを追加する。
- [x] NPC／BITの長距離追跡を共通のArea／詳細二段階へ移行し、Phase振動を禁止する。
- [x] 経路再計算を意味的revision駆動へ変更し、1フレーム最大4件・通常1件・2秒以内の分散Schedulerへ統一する。
- [x] NPC通常歩行の重複床rayと、NPC／BITの遠距離標的座標追従を軽量化する。
- [x] 99 NPC／初期洗脳66 NPC／50 BIT stressを120秒実行し、完走したため詳細追跡48人上限を有効化しない。
- [x] 資産再生成、NavMesh hash不変、型検査、build、T04／T05 fixture、Web／Electron、人間受入、console、破棄再読込を検証する。
- [x] 独立観点の二巡目差分レビュー、テキスト配布検査、計画結果更新を行い、単一commitを作成する。

## 結果

Navigation AreaをV2共通の作者資産・Runtime契約として追加し、実学校へ5 Area／4 Portalを実装した。標的Area snapshotを1フレーム1回だけ共有し、NPCとBITを遠距離Area追跡から同一Area内の詳細追跡へ一方向に移行する。経路探索は意味的revisionで更新し、NPCは通常1件・最大4件／フレームで分散する。通常NavMesh歩行中のNPC床rayを除去し、性能HUDへNPC／BITのArea・詳細追跡数を追加した。

学校資産は5 Area／4 Portalとして再生成・監査し、GLB SHA-256を`0914e9f04bfca2d6d65a33b97a025e0eb529aec1907a3cfaf8070fc36de06444`へ更新した。人間用static／room variants／BIT NavMeshのhashは変更していない。途中で発見した屋上BITのArea上端不足は、roof Areaをステージ上端19mまで拡張して解消した。

T04 fixtureは115／115、実学校fixtureは66／66、T05 fixtureは285／285、NPC command fixtureは16／16でPASSし、各console warning／errorは0件だった。V2／T04／T05型検査、通常／Electron／T04／T05 build、依存監査、学校NavMesh check、資産監査、`git diff --check`、UTF-8 strict・BOMなし、ローカル絶対パス・競合marker検査もPASSした。

Web高負荷stressはseed 20260732で99 NPC／初期洗脳66 NPC／50 BITを120秒実行し、停止・例外なしでPASSした。Electron高負荷stressも同構成で完走し、renderer diagnosticsは0件だった。Electron実操作では`renderCanvas`のPointer Lockを取得し、OSのW入力で0.264m移動、性能HUDと操作説明の非重複、renderer diagnostics 0件を確認した。人数48上限は性能受入が成立したため導入せず、Alarmの脅威人数と全対象の論理追跡を維持した。最終FPS合否と追加最適化はT07の性能計測で扱う。
