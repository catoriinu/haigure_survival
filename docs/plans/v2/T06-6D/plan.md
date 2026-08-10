# HAIGURE SURVIVAL v2 T06-6D 静的学校資源再利用 計画

更新日: 2026-08-10

## プロンプト

> 学校モデルそのものは読み込み済みだったら読み込まないようにし、キャラクター配置、開始位置、毎ゲーム変わる初期値だけを読み込み直せませんか。

> 学校Scene／GLB／静的Registry／NavMesh bundleをアプリ終了まで保持し、ゲームごとには部屋Variant、Player、NPC、BIT、扉、エレベーター、Mission、開始位置等だけを初期化する。カタログ変更またはアプリ終了時のみ静的資源を破棄する。

## 目的

学校1ステージ固定のV2で、アプリ所有の静的学校資源とセッション所有の動的状態を別interfaceへ分離する。タイトル復帰・リプレイ・再開始で学校GLBと静的NavMesh bundleを再解析せず、動的状態だけを確実に初期化する。

## 開始条件

- T06-6Cが独立レビュー後に`develop`へ統合済みである。
- I4で静的／動的所有表、catalog identity、生成・再利用・破棄順、エラー時の所有移管が承認済みである。
- `codex/v2-static-school-resource-reuse`の専用worktreeを使用する。

## 公開interface契約

- アプリ所有interfaceはBabylon `Scene`、学校GLB `AssetContainer`、作者Mesh／Material／Texture、静的Location registry、人間用NavMesh、BIT用NavMesh bundleと、それらのcatalog identityを所有する。
- セッション所有interfaceは部屋variant、Player、NPC、BIT、扉、エレベーター、Mission、開始位置、予約、入力、HUD、Audio bridge、イベント購読を所有する。
- 動的interfaceは静的interfaceへの非所有参照だけを受け取り、静的Mesh／Material／Texture／NavMeshを破棄しない。
- 同じcatalog identityでの再開始は静的interface identityを維持する。catalog identity変更時は動的状態を破棄後、旧静的資源を完全破棄して新規読込する。
- アプリ終了時は動的状態を先に、静的学校資源とSceneを後に1回だけ破棄する。

## セッション再初期化契約

- 毎ゲーム、room variant、Player、NPC、BIT、扉、エレベーター、Mission、開始位置、乱数列、予約、HUD、入力、購読を新規生成する。
- 前sessionのActor、Mesh instance、Sprite、予約、Mission、timer、observer、Audio node、入力購読を0件へ戻してから次sessionを公開する。
- 失敗した新sessionの動的資源だけを破棄し、既存静的学校資源は有効なまま維持する。
- 欠落静的資源を旧session値や座標で補うfallbackは追加しない。

## 対象外

- 学校バイナリ、生成器、NavMesh形状、Location内容、タイトル表示・ゲームオーバー演出、設定項目の変更。
- 複数ステージcache、LRU、バックグラウンド先読み。V2学校1件の明示所有分離だけを行う。

## 受入条件

- 初回だけ学校GLBを解析し、タイトル復帰・Rリプレイ・再開始を複数回行っても静的Scene／AssetContainer／Location registry／NavMesh bundleのidentityが変わらない。
- 毎session、room variant、Player、NPC、BIT、扉、エレベーター、Mission、開始位置、予約、購読が新しいidentityと初期値になる。
- 前sessionのActor、購読、予約、Mission状態、timer、Audio、HUDが残留しない。
- catalog identity変更時は旧静的資源を1回破棄して新規読込し、アプリ終了時に全資源を1回だけ破棄する。
- 通常Web／Electronで複数回のタイトル復帰・再開始を行い、console警告・エラー0件、WASM／GPU資源の単調増加0件である。

## 検証

- GLB parse回数、静的／動的identity、dispose回数を専用fixtureで計測する。
- タイトル→開始→ゲームオーバー→R→Enter→再開始を複数周実行し、動的状態だけが初期化されることを確認する。
- T02、T04、T05、T06-3、T06-4、T06-6A～C、通常build、Web／Electron、consoleを回帰する。
- 最終終了後にScene、AssetContainer、Material、Texture、NavMesh、Actor、購読、予約、Mission状態がすべて破棄されることを確認する。

## ステップ

- [ ] 現行`createRuntimeSession()`／`disposeRuntime()`の所有グラフを固定する
- [ ] 静的学校資源と動的session状態のinterfaceを実装する
- [ ] タイトル復帰・リプレイ・再開始を動的再初期化へ切り替える
- [ ] catalog identity変更とアプリ終了の完全破棄を実装する
- [ ] identity、parse回数、残留、Web／Electronを検証する
- [ ] 結果を更新してT06-6D差分だけをcommitする

## 結果

未着手。T06-6Cの`develop`統合後に開始する。
