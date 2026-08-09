# HAIGURE SURVIVAL v2 B05 Mission・ミニマップ意味資産 実装 計画

更新日: 2026-08-09

## プロンプト

> B05 Mission・ミニマップ意味資産 実装計画を実装してください。
>
> `origin/develop=ceea8ec`ではI2設計とT06-2が統合済みで、次タスクは`B05 → T06-3 → T06-4`の直列順です。今回はB05の実装・検証・commit・push・Draft Pull Request作成までを行い、レビュー、merge、`develop`同期、T06-3着手は行いません。既存の対話Blenderとrootの未追跡`__pycache__`には触れず、最新`origin/develop`から`codex/v2-mission-locations`専用worktreeを作成します。
>
> 学校資産をschema version 3へ更新し、`StageCatalogEntry.locationAssetsMode`を`required / unsupported`で明示します。学校は`required`、既存fixtureは`unsupported`とし、欠落時fallbackは作りません。`MAP_*`専用意味Meshと、Volume roleの`location_area`、`mission_location`、`broadcast_console_target`、Marker roleの`mission_anchor`、`map_stair_landing`、`map_elevator_landing`、`broadcast_console`を追加します。
>
> B05生成正本から、5階層Map、52論理Area、主要24 Mission Locationの到達Volume／NavMesh上Anchor、階段踊り場17件、エレベーター乗場4件、放送卓1件を決定的に生成します。Area優先度はエレベーター400、室・トイレ・更衣室・プールサイド300、階段250、屋外・体育館系200、階別共用部100とします。共用部は粗く統合し、専用Map Meshを平面形状の正本とします。2F／3Fエレベーター乗場は利用不可、1F／4Fは既存stopを厳格参照し、移動中は到着まで出発階を維持します。放送卓は距離基準Markerと正面Ray用target Meshを独立した意味資産として持ちます。
>
> `.blend`、GLB、生成器、監査器、カタログhashに加え、B05単独で`develop`を起動可能にする最小Runtime読込契約を同じPull Requestへ含めます。`StageSpatialContext.locationAssets`へ`StageFloorMap`、`StageLocationArea`／`StageLocationAreaHit`、`StageMissionLocation`、`StageStairLanding`、`StageElevatorLanding`、`StageBroadcastConsole`を公開します。Object名、座標、既存Navigation Area、Collider、BIT Volumeから意味を推測する処理や互換aliasは追加しません。ミニマップ描画、Mission状態機械、放送効果は実装しません。
>
> 同じ生成正本から2回連続生成して決定性を確認し、人間用NavMesh、Room Variant NavMesh、BIT NavMeshはB05前後でbytesとSHA-256を完全不変にします。B05監査、5階層俯瞰fixture、Runtime契約の正常系・失敗系、関連typecheck/build、学校Web／Electron、Pointer Lock、console warning/error 0件を確認します。最後に括弧対応、UTF-8 BOMなし、`git diff --check`、公開文書へのローカル絶対パス混入なしを確認し、commit、push、`develop`向けDraft Pull Request作成まで行います。

## ステップ

- [x] `origin/develop=ceea8ec`、I2／T06-2統合、次タスクB05、GitHub CLI認証、既存dirty差分、既存Blenderプロセスを確認する
- [x] `codex/v2-mission-locations`と専用worktreeを最新`origin/develop`から作成する
- [x] B05の作者資産契約、Runtime公開型、Object role、ID参照、Area優先度、対象外を仕様書と計画へ同期する
- [x] `locationAssetsMode`、schema version 3、`StageSpatialContext.locationAssets`と厳格なregistry／読込検証を実装する
- [x] 学校生成正本へ5 Map、52 Area、24 Mission Location、17階段踊り場、4エレベーター乗場、放送卓を追加する
- [x] `.blend`とGLBを2回連続生成し、決定性とNavMesh 3種のbytes／SHA-256不変を確認する
- [x] B05専用監査と5階層俯瞰fixtureを実装し、構造・配置・Runtime読込を確認する
- [x] 関連typecheck／build、実ブラウザ／Electron、Pointer Lock、console状態、括弧、UTF-8、差分を検証する
- [x] 全体計画、次タスク計画、ブランチ戦略、本計画の結果を最終状態へ同期する
- [x] 意図した差分だけをcommit・pushし、`develop`向けDraft Pull Requestを作成する

## 実装契約

- B05だけが学校生成正本、`.blend`、GLB、意味資産監査、学校カタログhashを編集する。
- 人間用NavMesh、Room Variant NavMesh、BIT NavMeshの形状・bytes・SHA-256は変更しない。
- B05は意味資産を読める最小Runtime契約までを所有し、ミニマップ描画、Mission scheduler／HUD、放送効果、公開処刑会場切替は後続へ残す。
- `locationAssetsMode="required"`は全B05資産の完全な存在と参照整合を要求し、`unsupported`はB05資産が0件であることを要求する。
- 同一優先度Areaの正体積重複、未被覆の歩行可能面、未知role、必須metadata欠落、孤立参照は監査または読込失敗とする。
- 既存の対話Blenderセッションは操作せず、専用worktreeの明示パスを指定したbackground Blenderだけを使用する。

## 対象外

- T06-3のミニマップ描画、Actor／Mission表示、現在地HUD
- T06-4のMission状態機械、20秒scheduler、放送3種、公開処刑会場切替
- 人間用／Room Variant／BIT NavMesh形状の変更
- 既存Blenderセッション、他worktree、rootの未追跡cacheの変更
- Pull Requestレビュー、review thread操作、merge、`develop`同期、worktree削除

## 結果

実装・検証・commit・push・Pull Request作成を完了し、PR #69で`develop=96a16cb`へ統合済み。

- 同一正本からの連続2回生成で、`.blend`は3,631,532 bytes／SHA-256 `1c053fe3daa5751c3e73981100228016b402594ea91357eaea48b8cfe6f2917c`、GLBは22,180,712 bytes／SHA-256 `bdf8a14de59f26e869bd9566884c16136c2d7a2860fe3e8558935bd190b2d1d9`に一致した。
- 最終学校資産は1,894 Object、1,448 Mesh、6 Material。B05監査はschema 3、5 Map（box componentは18／8／4／2／3）、52論理Area／85 piece、24 Mission Volume／24 Anchor、17階段踊り場、4エレベーター乗場（利用可能2／利用不可2）、放送卓Marker／target各1、同順位正体積重複0、GLB参照整合、Nav生成元混入0、世界境界外0でPASSした。
- 人間用NavMeshは3,123,476 bytes／SHA-256 `530fa01f472a7f3ab4f983c6360aa41c296f3170ae44334e67e26377ed5d977b`、Room Variant NavMeshは1,966,070 bytes／SHA-256 `4b5a584b9ba15dba73d55924b91320475d51ee8dcfc951a06822e08bedd52e43`、BIT NavMeshは565,399 bytes／SHA-256 `e7e0a76429ba1c9bcfcb26a18071db2307ca394632fb727a0559140244cac62a`で、再生成前後および`--check`結果が完全一致した。
- B05実ブラウザfixtureは34／34、通常版／荒れ版のAnchor到達性は各24／24、B05 Electron fixtureも34／34でPASSし、5階層のMap、Area色分け、Anchor、階段方向、利用不可エレベーター、放送targetを目視確認した。T02は51／51、T04はBIT出現完了後の検証時刻を単調増加へ統一した状態で115／115となり、いずれもPASSした。
- Runtime拒否系は未知role、必須metadata欠落、未知`hs_*` property、ID重複、同順位重複、floor／area／anchor／elevator／stop／放送卓参照不整合を検証した。エレベーターは移動中の`currentStopId=null`と`displayStopId=出発階`、到着時の表示階更新を確認した。
- `typecheck:v2`、`typecheck:b05`、`typecheck:t02`、`typecheck:t04`、`typecheck:t05`、`typecheck:t06`、`typecheck:t06-2`と、対応する`build`／`build:b05`／`build:t02`／`build:t04`／`build:t05`／`build:t06`／`build:t06-2`は全てPASSした。
- 学校Webは読込完了と通常Runtime進行を確認した。Electron連続受入はCanvas開始、Pointer Lock、入力、タイトル復帰・再開始、音声資源読込、console／renderer／load／unresponsive診断0件でPASSした。
- Blender構造監査と対話資産監査、括弧を含むTypeScript／Python構文、UTF-8 BOMなし、`git diff --check`、公開文書のローカル絶対パス0件を確認した。最新`origin/develop=ceea8ec`から計画commit`65734b8`と実装・結果commitを作成し、[Pull Request #69](https://github.com/catoriinu/haigure_survival/pull/69)を経て`develop=96a16cb`へ統合された。
