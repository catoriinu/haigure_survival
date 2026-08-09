# HAIGURE SURVIVAL v2 T06-3 ミニマップ 計画

更新日: 2026-08-09

## プロンプト

> PLEASE IMPLEMENT THIS PLAN:
>
> # T06-3 ミニマップ実装計画
>
> - 次タスクは`T06-3 ミニマップ`とする。開始条件のB05はPR #69として`develop`にマージ済みで、基点は`origin/develop`の`96a16cb`。
> - 専用ブランチ`codex/v2-minimap`とリポジトリ外の専用worktreeを作成する。既存worktreeと未追跡ファイルは変更しない。
> - 推奨モデルはGPT-5.6 Sol、リーズニングはHigh。
> - T06-4のミッション機能、学校3D資産、GLB、NavMesh、生成器、カタログは対象外。
> - `src/ui/v2Minimap.ts`へ180px円形Canvasミニマップのモデル生成、描画、ライフサイクル管理を実装する。
> - 半径9mはBabylon座標の2.25単位として扱い、プレイヤーを中央、進行方向を上に固定する。
> - B05の5階層マップを初期化時に階層別`Path2D`へ変換し、フレームごとのメッシュ走査は禁止する。
> - 世界北`(0, 0, -1)`、視野扇、現在地、階段方向、エレベーターの利用可否・表示停止階、NPC、BIT、追従者、ミッション対象を描画する。
> - Survival Runtimeへ読み取り専用の`V2MinimapActorSnapshot`と`getMinimapActors()`を追加する。旧API、互換エイリアス、暗黙のフォールバックは追加しない。
> - 更新入力へ`missionTargetActorIds`と`missionTargetLocationIds`を設ける。本番では空配列を渡し、検証fixtureだけで利用する。
> - 一般NPC／BITは同一階・半径内・カメラ範囲内・遮蔽なしの場合だけ表示する。Follow中NPCとミッション対象は視野・遮蔽を無視するが、同一階と半径9mの条件を維持する。
> - `src/v2/main.ts`へセッション単位で統合し、タイトル復帰、ステージ再構築、エラー、dispose時に描画・キャッシュ・参照を破棄する。通常プレイ中だけ表示する。
> - 既存ステータスはマップ下、ヘルプは画面左下へ移動し、1080pでHUDが重ならない配置にする。
> - B05のsemantic location assetsだけを読み、学校固有座標をハードコードしない。T06-4のMission状態管理や学校資産は変更しない。
> - 実装、検証、計画結果更新、ローカルコミットまで行う。push、Pull Request、レビュー、mergeは行わない。

## ステップ

- [x] 最新`origin/develop=96a16cb`、B05統合、既存dirty差分、worktree競合、依存関係を確認する
- [x] `codex/v2-minimap`と専用worktreeを最新`origin/develop`から作成する
- [x] B05統合済みの実態へ全体計画、次タスク計画、ブランチ戦略、I2進捗を更新する
- [x] ミニマップの純粋モデル、階別静的背景cache、Canvas描画、現在地表示を実装する
- [x] Survival Runtimeへミニマップ用Actor snapshot APIを追加する
- [x] 通常ゲームへセッション単位で接続し、HUD配置と破棄・再構築を統合する
- [x] T06-3専用fixtureで階層、回転、Location、階段、エレベーター、Actor、Follower、Mission対象を検証する
- [x] 通常ゲームのブラウザ・Electron 1080pでPointer Lock、HUD非重複、階移動、console状態を確認する
- [x] 共通・T06-3・関連回帰のtypecheck／build／fixtureとテキスト配布検査を完了する
- [x] 実装結果を記録し、T06-3対象差分だけをローカルコミットする

## 実装契約

- マップ半径9mは`BLENDER_METERS_TO_WORLD_UNITS`を使って2.25 world unitsへ変換する。
- 階別背景は`StageLocationAssetRegistry`のMap meshから初期化時に一度だけ構築し、更新時にmesh geometryを再走査しない。
- 現在階・現在地は`findArea()`、エレベーター内の表示階は動的snapshotの`displayStopId`を正本とする。
- 一般Actorの直接視認は同一階、距離、frustumの順に絞り込んだ後、`castSightSegment()`で最大10Hz評価する。
- Follow中NPCとMission対象は視野・遮蔽を免除するが、同一階・半径条件は免除しない。
- 学校座標、階段、エレベーター、LocationをTypeScript定数へ重複記述しない。
- Mission scheduler、Mission HUD、放送、公開処刑会場切替、学校バイナリ変更はT06-3へ含めない。

## 結果

- 180px円形Canvasミニマップを追加し、B05の5階層Mapをセッション初期化時に`Path2D`へ変換した。9m範囲、進行方向上、世界北、視野扇、現在地、階段、エレベーター、NPC、BIT、Follower、Mission対象を描画する。
- 一般Actorは同一階・9m以内・frustum内へ絞った後に最大10Hzで遮蔽判定し、FollowerとMission対象は同一階・9m条件を維持して視野・遮蔽を免除した。
- Survival Runtimeへ読み取り専用`V2MinimapActorSnapshot`と`getMinimapActors()`を追加し、NPCのFollow状態とBIT非追従を明示的に変換した。本番のMission入力は空配列とし、Mission状態管理は追加していない。
- 通常ゲームのセッションへ統合し、タイトル復帰・再構築・render error・dispose時に描画と参照を破棄する。ステータスをマップ下、ヘルプを左下へ移動した。
- 専用ブラウザfixtureは11/11、関連回帰はT04 115/115、B05 34/34、T06 68/68、T06-2 22/22でPASSし、各fixtureのconsole警告・エラーは0件だった。
- Electron通常ゲームは1920×1080でPointer Lock、playing、ミニマップ・現在地・ステータス・スタミナ想定領域・ヘルプの非重複、renderer警告・エラー0件を確認した。通常入力プロファイルでも`KeyW`で0.051 world unitsの移動を確認した。
- `typecheck:v2`、`typecheck:t06-3`、`build`、`build:t06-3`、T04・B05・T06・T06-2のtypecheck／build、差分・UTF-8・公開文書検査を完了した。
- 学校GLB、NavMesh、Blender正本、生成器、カタログ、T06-4 Mission状態管理は変更していない。push、Pull Request、レビュー、mergeは未実施。
