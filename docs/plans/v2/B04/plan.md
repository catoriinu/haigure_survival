# HAIGURE SURVIVAL v2 B04 学校外周・道路・世界境界資産 計画

更新日: 2026-07-28

## プロンプト

PLEASE IMPLEMENT THIS PLAN:

# B04 学校外周・道路・世界境界資産 実装計画

- 最新`origin/develop`を取得し、専用worktree `fps_survival20251226-b04-school-world-boundary` とブランチ `codex/v2-b04-school-world-boundary`を作成する。
- 現在の`develop` worktreeにある未コミットの人口設定差分は触らず、stash・reset・checkoutもしない。
- 全周へ完全フラットな歩道1.5m＋道路3.5mを追加し、`BND_WorldLimit`とカタログhashを更新する。
- 最新指示により外周BIT飛行帯・塀越え遷移は追加せず、BITと両NavMeshを塀内に維持する。
- commitまでを今回の範囲とし、push・Pull Request・mergeは行わない。

生成正本から西側校舎南端Y=-7.0m、塀内面Y=-14.3m、有効距離7.3mを再監査する。値が一致すれば南延長は行わず、`BND_Stage`と人間用NavMeshを不変にする。現行塀外面`X=-18.8..63.6 / Y=-14.7..51.7`を基準に、歩道外端`X=-20.3..65.1 / Y=-16.2..53.2`、道路外端`X=-23.8..68.6 / Y=-19.7..56.7`をZ=-0.30mの同一平面へ生成する。段差、縁石、白線、遠景、Collider、スポーンVolumeは追加しない。既存Atlasの明色`wall`を歩道、濃色`trim`を道路へ使用する。

`BND_WorldLimit`は`X=-23.8..68.6 / Y=-19.7..56.7 / Z=-0.6..24.0`の不可視・非衝突・非遮蔽な閉じた軸平行直方体とし、`hs_id="world-limit"`、`hs_role="world_boundary"`を付与する。学校カタログのGLB SHA-256を更新し、`worldBoundaryMode`を`unsupported`から`required`へ同時切替する。型や公開APIは増やさず、学校の`StageSpatialContext.worldBoundary`が非nullになることだけを契約変更とする。

外周BIT飛行帯、外周用`NAV_BitFlight_*`、`boundary`遷移は作らない。BIT Runtime、`StageSpatialContext`の意味Object境界検証、光線Runtimeも変更しない。人間用NavMesh、BIT用NavMesh、部屋variant NavMeshはbytes／SHA-256不変を必須とする。

## 確定方針

- `BND_Stage`は現在どおりプレイヤー・NPCが存在してよい学校内の境界とし、塀の外側へ広げない。
- `BND_WorldLimit`は塀の外面から水平5.0mの余白と上空Z＝24.0mを持つ、表示と光線の最終限界とする。BITは既存の塀内飛行帯へ維持する。
- 外周表示は全周へ歩道1.5m、その外側へ道路3.5mを配置し、道路外端を地面表示の終端とする。遠景を追加して外周限界を曖昧にしない。
- `BND_WorldLimit`は不可視・非衝突・非遮蔽で、Blender X/Y/Z軸に平行、ベベルなしの閉じた直方体Meshとする。全頂点を各軸のminまたはmax面上へ置き、T05-2Vがキャッシュするmin/maxと実境界を一致させる。物理壁や光線着弾面にはしない。
- B04前に`worldBoundaryMode="unsupported"`である学校カタログを、`BND_WorldLimit`追加と同じ変更内で`required`へ切り替える。資産とpolicyの片方だけを先に配布しない。
- プレイヤーとNPCのCollider、人間用NavMesh、`npc_spawn`は学校内だけに維持する。外周歩道・道路へ人間用NavMeshを追加しない。
- 外周には`player_spawn`、`npc_spawn`、`bit_spawn`を配置しない。通常探索先と総当たり探索先にも使用しない。
- 外周BIT飛行帯、外周用`NAV_BitFlight_*`、学校内外を結ぶ`boundary`遷移は追加しない。BIT用NavMeshと既存遷移を塀内へ維持し、外周BIT経路を0件とする。
- B03-3Cの西側校舎南端Y=-7.0mと塀内面Y=-14.3mの有効距離7.3mを正本から再確認する。5.0m以上のため南延長は行わず、`BND_Stage`と両NavMeshを変更しない。
- 学校`.blend`、生成スクリプト、GLB、カタログhash、建築・保護契約・NavMesh監査を同じB04ブランチの単一担当で更新する。人間用、BIT用、部屋variantの3 NavMeshはbytes／SHA-256不変を必須とする。
- B04は光線Runtime、BITのモード判定、T05-4の標的選択個性、G／N／H、音声、ゲーム進行を変更しない。

## 実行単位と推奨設定

- 推奨ブランチ: `codex/v2-b04-school-world-boundary`
- 推奨モデル: GPT-5.6 Sol
- 推奨リーズニング: High
- 選定理由: I0後の確定学校外形に対するBlender資産、両NavMesh、境界・スポーン監査が中心であるため。
- 開始条件: I0が`develop`へマージ済みであること。`BND_WorldLimit`の名前、意味、5.0m外周、Z＝24.0mを使用し、外周BIT帯は追加しない最新指示を優先する。
- 並行可否: T05-4と別worktreeで並行可能。B04は学校生成正本、`.blend`、GLB、両NavMesh、カタログhashだけを所有し、T05-4はNPC／BIT RuntimeとT05 fixtureだけを所有する。両方の`develop`統合前にT04-3Bのブランチ作成または書込みを開始しない。

## ステップ

- [x] `git fetch --prune origin develop`で最新`origin/develop=692aedc7bc023c18d52f7e78bd7c9429f7b53e90`を取得し、I0統合headであることを確認する
- [x] 元の`develop` worktreeにある`src/v2/survivalRuntime.ts`と`validation/v2/T05/performanceScenario.test.ts`の未コミット差分を保持したまま、専用worktreeと`codex/v2-b04-school-world-boundary`を作成する
- [x] `docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、B03-3／T05-2V／T04-3／T06計画、本計画、資産・Runtime仕様、ブランチ戦略を読む
- [x] B03-3Cの西側校舎南端Y=-7.0m、塀内面Y=-14.3m、有効距離7.3mを生成正本から再監査し、南延長不要を確定する
- [x] 学校外周塀外面`X=-18.8..63.6 / Y=-14.7..51.7`、既存地面、`BND_Stage`、両NavMeshの基準を生成正本と開始hashから監査する
- [x] 外周5.0m、歩道1.5m、道路3.5m、上空Z＝24.0mの俯瞰図と境界数値を提示し、実装前の形状確認を行う
- [x] 学校生成正本へ全周の歩道・道路・地面終端と`BND_WorldLimit`を追加する
- [x] `BND_WorldLimit`追加と同時に学校カタログの`worldBoundaryMode`を`unsupported`から`required`へ切り替え、欠落・重複・非閉鎖・非軸平行・ベベル・min/max不一致・`BND_Stage`非内包を監査する
- [x] 外周用`NAV_BitFlight_*`、`boundary`遷移、Collider、通常探索・出現用Volumeを追加せず、BITを塀内へ維持する
- [x] 建築・保護契約・境界・スポーン・遷移監査へ、二重境界と外周立入規則を追加する
- [x] `.blend`、GLB、カタログhashを決定的に再生成し、人間用、BIT用、部屋variantの3 NavMeshのbytes／SHA-256不変を確認する
- [x] プレイヤー・NPC・BITの学校外到達不能、外周スポーン0件、外周経路0件、`BND_WorldLimit`外への経路0件を検証する
- [x] 固定視点と実ブラウザで、校門越しおよび塀越しに歩道・道路が自然に見え、道路外端より先に地面が続かないことを確認する
- [x] 全発射元の光線が`BND_WorldLimit`退出点で着弾・ダメージ・Alarm・反射光球なしに約0.2秒でフェードすることを実ブラウザで確認する
- [x] 資産監査、決定性、型検査、通常build、T01～T05 build、UTF-8 BOMなし、ローカル絶対パスなし、`git diff --check`を確認する
- [x] 実装結果と後続同期事項を本計画へ記録し、B04だけをcommitする。全体計画、次タスク計画、ブランチ戦略、push、Pull Request、mergeは変更・実行しない

## 結果

2026-07-28に`origin/develop@692aedc7bc023c18d52f7e78bd7c9429f7b53e90`から専用worktreeを開始した。元の`develop` worktreeにある人口設定2ファイルの未コミット差分は変更していない。開始基準は学校`.blend` 2,685,136 bytes／SHA-256 `E5B0CEBF38DECD2214D7E0E3A8DD87E62D0E4B4CCF42065A40329516C005089B`、GLB 15,442,976 bytes／`C97820435EA50A9C64D61E3BC68615E9F9AD35EB69993E59B46A59EBC19F6BB7`、人間用NavMesh 3,124,800 bytes／`6A35B416EB7069FDB9E8EFF5FA9C62F6CE2D6FEBC9F28765B6041213AD448DD1`、BIT用NavMesh 568,363 bytes／`C60C44187E8EECA0889A933B564BB7EAB936728148F43E5DD1796C57E82D8D73`、部屋variant NavMesh 1,911,013 bytes／`78A0F481AAE3ABD6A6E403C60FC0DEBC1C70941C8B7956F17E35006DF10C3AFD`である。

生成正本の西側校舎床南端Y=-7.0mと塀内面Y=-14.3mから有効距離7.3mを再確認したため、南延長は行わない。旧方針の外周BIT飛行帯とT06への同機能引き渡しは、BITと両NavMeshを塀内へ維持する最新指示で置き換えた。

学校正本へ`VIS_B04_Sidewalk`と`VIS_B04_Road`を各4個の直方体成分で追加し、歩道外端`X=-20.3..65.1 / Y=-16.2..53.2`、道路外端`X=-23.8..68.6 / Y=-19.7..56.7`、上面Z=-0.30mへ完全フラットに配置した。歩道は既存Architecture Atlasの`wall`、道路は`trim`を使用する。既存校内地面の表示だけを塀外面まで接続し、道路外端より先には地面、遠景、Collider、Volumeを追加していない。数値入り俯瞰図、校門固定視点、塀越し固定視点を保存して見た目を確認した。

`BND_WorldLimit`を8頂点・6面・12辺、Material・Modifierなしの閉じた軸平行直方体として追加した。範囲は`X=-23.8..68.6 / Y=-19.7..56.7 / Z=-0.6..24.0`、propertiesは`hs_id="world-limit"`と`hs_role="world_boundary"`であり、`BND_Stage`を内包する。学校カタログを`worldBoundaryMode="required"`へ切り替え、GLB SHA-256を`C1362F8152C9552428673F762AFD0B97ED505B174C68A3FED6F5D23400E197F4`へ更新した。最終学校`.blend`は2,687,080 bytes／`F31C0BCA1D0CF64E12E18BC92C6659DAC0878F4EC9EBDBF435D70AFF8A777998`、GLBは15,448,424 bytes／前記hashである。通常の生成パイプラインを連続2回実行し、両回で`.blend`とGLBのbytes／SHA-256が一致した。

人間用NavMesh、BIT用NavMesh、部屋variant NavMeshは開始時のbytes／SHA-256から不変である。B04専用監査では外周BIT経路、外周スポーン、B04 Collider／Volume／Markerを各0件と確認した。建築、内装、対話資産、B03保護baseline、正本残渣、B04境界、学校NavMeshの全監査が通過した。

実ブラウザではT02が48/48、T04が106/106、T05が255/255で通過した。学校の表示資産は通常606件、全荒れ626件、`worldBoundary`はrequiredかつ非nullである。プレイヤー・NPC・BITは既存の塀内経路へ維持され、全9 origin kindの光線は世界境界退出点で着弾・ダメージ・Alarm・反射光球なしに約0.2秒で消滅した。ブラウザconsole、Babylon Logger、unhandled rejectionは0件だった。

`audit:v2:dependencies`、`check:v2:school-navmesh`、`typecheck:v2`、T01～T05の型検査、通常build、T01～T05 buildをすべて通過した。変更テキスト14ファイルはUTF-8 BOMなしで、無効UTF-8、ローカル絶対パス、競合markerは各0件、Python 5ファイルの構文解析と`git diff --check`も通過した。`docs/plan.md`、`docs/plans/v2/next_tasks_plan.md`、`docs/branch_strategy.md`は変更していない。後続タスクは、B04統合後に各全体計画を同期する際、外周BIT帯が存在しない最新契約を前提とする。
