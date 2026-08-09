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
>
> 追加修正（2026-08-09）:
>
> - 校庭で`area-common-f02`と`area-common-f03`が同一優先度として重複解決され、ミニマップ更新が停止する例外を修正する。
> - ミニマップへ現在の2倍の範囲を表示し、半径18mとする。中央の視野扇はNPC視界と同じ半径12mで描画する。
> - 階別床色を1F黄、2F緑、3F赤、4F青、屋上灰とし、校舎の階ライン色へ合わせる。
> - 部屋の壁や恒久的な進入不可区域を黒く表示する。本棚など小物による通行不可は表示対象外とする。
> - 修正、検証、計画結果更新、ローカルコミットまで行い、push、Pull Request、レビュー、mergeは行わない。
>
> 飛び降り・Area接面追補（2026-08-09）:
>
> - 体育館屋上で`area-common-f02`と`area-common-f03`、ゲーム開始時に北東階段で`area-stair-ne-f01-f02`と`area-stair-ne-f02-f03`が同一優先度として重複解決される例外を修正する。
> - 校舎屋上の階段室上からの飛び降りを裏技として許容し、空中で`location_area`から外れてもゲーム更新を停止しない。
> - 空中の階表示は実装しやすい方式でよく、例として地面から離れてから約5秒の許容が認められている。ゲーム全体へ例外を波及させない。
>
> 接面解決・保持時間追補（2026-08-09）:
>
> - 飛び降り時のArea保持時間は5秒ではなく3秒へ変更する。
> - 校庭で`area-common-f03`と`area-common-f04`が同一優先度として重複解決され、ミニマップ更新が停止する例外を修正する。

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
- [x] ActorのArea／階判定例外を再現し、表示点と階判定点の契約を修正する
- [x] 半径18m表示、半径12m視野扇、階別床色を実装する
- [x] Runtime分類済みの恒久建築コライダーから、壁・進入不可領域を黒く表す階別静的cacheを構築する
- [x] 専用fixture、通常ゲーム、Electron、関連回帰を再検証する
- [x] 追加修正結果を計画へ反映し、T06-3追補をローカルコミットする
- [x] 共用部・北東階段の接面上にあるプレイヤー／Actor足元をfixtureで再現する
- [x] 足元Area判定を身体側サンプルへ統一し、同一優先度の垂直接面を一意に解決する
- [x] 空中Area欠落を5秒保持・以後非表示・着地復帰とする明示状態へ変更する
- [x] 専用fixture、通常ゲーム、Electron、関連回帰、テキスト配布を再検証する
- [x] 飛び降り追補の結果を反映し、T06-3追加コミットを作成する
- [x] Actorの5cm補正後に3F／4F接面へ一致するケースをfixtureで再現する
- [x] 垂直接面を全階共通で解決する明示的なArea判定へ変更し、空中保持を3秒へ短縮する
- [x] 専用fixture、通常ゲーム、Electron、関連回帰、テキスト配布を再検証する（Electron自動受入はPointer Lock取得失敗を記録）
- [x] 接面解決追補の結果を反映し、T06-3追加コミットを作成する

## 実装契約

- 追加修正後のマップ半径18mと視野扇半径12mは、`BLENDER_METERS_TO_WORLD_UNITS`を使って4.5／3 world unitsへ変換する。
- 階別背景は`StageLocationAssetRegistry`のMap meshから初期化時に一度だけ構築し、更新時にmesh geometryを再走査しない。
- 黒表示はRuntime分類済みColliderの命名契約から壁・外壁・間仕切り・恒久ガードだけを選び、各階の人物高さを通る構造を初期化時に`Path2D`へ変換する。内装・小物・部屋variant Colliderは含めない。
- 現在階・現在地は`findArea()`、エレベーター内の表示階は動的snapshotの`displayStopId`を正本とする。
- プレイヤー／NPCのArea・階判定点は足元から身体側へ5cm上げ、BITは飛行中心をそのまま判定点とする。判定点が階層Areaの共有水平接面へ一致した場合は、共有面の上下1mmを明示的に再評価して一意に解決する。frustum／遮蔽判定には視認位置を使い、Area判定へ流用しない。
- プレイヤーの接地状態は`V2PlayerFrame.verticalState.grounded`をミニマップへ明示入力する。空中でArea外へ出た場合は最後の有効Areaを3秒保持し、3秒超過後はAreaを再取得するまでミニマップだけを非表示にする。接地中のArea欠落は資産契約違反として従来どおり例外にする。
- 一般Actorの直接視認は同一階、距離、frustumの順に絞り込んだ後、`castSightSegment()`で最大10Hz評価する。
- Follow中NPCとMission対象は視野・遮蔽を免除するが、同一階・半径条件は免除しない。
- 学校座標、階段、エレベーター、LocationをTypeScript定数へ重複記述しない。
- Mission scheduler、Mission HUD、放送、公開処刑会場切替、学校バイナリ変更はT06-3へ含めない。

## 結果

- 180px円形Canvasミニマップを追加し、B05の5階層Mapをセッション初期化時に`Path2D`へ変換した。追加修正後は18m範囲、12m視野扇、進行方向上、世界北、現在地、階段、エレベーター、NPC、BIT、Follower、Mission対象を描画する。
- 一般Actorは同一階・18m以内・frustum内へ絞った後に最大10Hzで遮蔽判定し、FollowerとMission対象は同一階・18m条件を維持して視野・遮蔽を免除した。
- NPC snapshotを足元の`areaPosition`と照準点の`sightPosition`へ分離した。追補ではプレイヤー／NPCは足元から5cm上、BITは飛行中心をArea判定点とした。型付きの接面例外だけを上下1mmで再評価し、`area-common-f02`／`area-common-f03`、`area-stair-ne-f01-f02`／`area-stair-ne-f02-f03`、`area-common-f03`／`area-common-f04`の共有接面を全階共通の処理で一意に解決した。旧APIや暗黙のfallbackは追加していない。
- 校舎屋上などから飛び降りてArea外へ出た空中状態は、最後の階・現在地表示を3秒維持する。3秒を超えた場合はゲーム更新を止めずミニマップだけを非表示にし、着地または別Areaへの進入で自動復帰する。接地中のArea欠落だけは厳格例外を維持した。
- 1F黄、2F緑、3F赤、4F青、屋上灰の階別床色を追加した。Runtime分類済みの恒久建築コライダー87件から人物高さを通る面だけを階別cacheへ変換し、壁・仕切りを黒で描画する一方、内装小物Colliderは0件に保った。
- Survival Runtimeへ読み取り専用`V2MinimapActorSnapshot`と`getMinimapActors()`を追加し、NPCのFollow状態とBIT非追従を明示的に変換した。本番のMission入力は空配列とし、Mission状態管理は追加していない。
- 通常ゲームのセッションへ統合し、タイトル復帰・再構築・render error・dispose時に描画と参照を破棄する。ステータスをマップ下、ヘルプを左下へ移動した。
- 飛び降り追補後の専用ブラウザfixtureは14/14、関連回帰はT04 115/115、B05 34/34、T06 68/68、T06-2 22/22でPASSし、各fixtureのconsole警告・エラーは0件だった。
- Electron通常ゲームは1920×1080でPointer Lock、playing、ミニマップ・現在地・ステータス・スタミナ想定領域・ヘルプの非重複、renderer警告・エラー0件を再確認した。通常入力プロファイルでも`KeyW`で0.094 world unitsの移動を確認した。
- 3秒・3F／4F接面追補後の専用ブラウザfixtureは14/14、B05は34/34、T04は115/115、T06は68/68、T06-2は22/22でPASSし、各fixtureのconsole／Babylon異常は0件だった。Electron自動受入は通常ゲームの`playing`到達とArea例外なしを確認したが、テストウィンドウのPointer Lock要求がDOM例外となり2回とも受入完走には至らなかった。今回起動したElectronは終了した。
- `typecheck:v2`、`typecheck:t06-3`、`build`、`build:t06-3`、T04・B05・T06・T06-2のtypecheck／build、差分・UTF-8・公開文書検査を完了した。
- 学校GLB、NavMesh、Blender正本、生成器、カタログ、T06-4 Mission状態管理は変更していない。push、Pull Request、レビュー、mergeは未実施。
