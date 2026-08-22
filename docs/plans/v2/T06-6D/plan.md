# HAIGURE SURVIVAL v2 T06-6D 静的学校資源再利用 計画

更新日: 2026-08-22

## プロンプト

> 学校Scene／GLB／静的Registry／NavMesh bundleをアプリ終了まで保持し、ゲームごとには部屋Variant、Player、NPC、BIT、扉、エレベーター、Mission、開始位置など毎回変わる状態だけを初期化してください。

## 目的

学校1ステージ固定のV2でアプリ所有の静的資源とsession所有の動的状態を別interfaceへ分離し、タイトル復帰・R再演・通常再開始でGLBとNavMeshを再解析しない。

## 開始条件

- T06-6Cが独立レビュー後に`develop`へ統合済みである。
- `codex/v2-static-school-resource-reuse`の専用worktreeを最新`origin/develop`から作成する。

## 公開interface契約

- 静的interfaceは1つのBabylon `Scene`、学校GLB `AssetContainer`、作者Mesh／Material／Texture、不変Location registry、人間用NavMesh、Room Variant NavMesh bundle、BIT NavMesh bundle、catalog fingerprintを所有する。
- 動的interfaceは選択room variantとactive set、Player、NPC、BIT、扉、エレベーター、Mission、開始地点、乱数系列、timer、予約、入力、HUD、Audio bridge、observer／subscriptionを所有する。
- 動的interfaceは静的interfaceへの非所有参照だけを受け取り、静的Mesh、Material、Texture、NavMeshをdisposeしない。
- 同じcatalog fingerprintでは静的interface identityを維持し、動的interfaceだけを毎session新規作成する。

## 生成・破棄契約

- タイトル復帰、通常R、即時公開処刑R、新規開始では旧動的状態を完全破棄してから新しい設定／scenario snapshotで動的状態を構築する。
- catalog fingerprint変更時は動的状態、静的資源の順に各1回破棄し、新しい静的資源を読込後に動的状態を構築する。
- アプリ終了時も動的状態、静的資源の順に各1回破棄する。
- 動的構築失敗時は部分動的資源だけを破棄し、有効な静的資源を保持してタイトルへ明示エラーを表示する。旧session値、座標、欠落静的資源へのfallbackは作らない。

## 対象外

- 複数stage cache、LRU、background preload、学校バイナリ・NavMesh形状・Location内容の変更。
- タイトル表示、responsive配置、ゲームオーバー演出、設定fieldの変更。

## 検証

- GLB parse回数、catalog fingerprint、静的／動的identity、dispose回数を専用fixtureで計測する。
- タイトル→開始→game over→R→Enter→再開始を複数周行い、静的identity不変、動的identity更新を確認する。
- Actor、room active set、timer、予約、Mission、observer、Audio、HUD、入力の残留0件と、失敗した部分sessionの破棄を確認する。
- catalog変更とアプリ終了で静的資源が各1回だけ破棄され、通常Web／ElectronでWASM／GPU資源が単調増加しないことを確認する。

## ステップ

- [ ] 現行所有グラフとcatalog fingerprintをfixtureへ固定する
- [ ] 静的／動的interfaceを実装する
- [ ] タイトル復帰・R・再開始を動的再構築へ切り替える
- [ ] 構築失敗、catalog変更、アプリ終了の破棄順を実装する
- [ ] identity、parse、残留、Web／Electron回帰を完了する
- [ ] 結果を更新してT06-6D差分だけをcommitする

## 結果

未着手。T06-6Cの`develop`統合後に開始する。
