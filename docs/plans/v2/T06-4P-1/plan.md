# HAIGURE SURVIVAL v2 T06-4P-1 ミニマップ・BIT表示 計画

更新日: 2026-08-18

## プロンプト

> ミニマップは作者定義された階別仕切りだけを黒で描き、扉・出入口は壁の切れ目と短い明色線で示す。
>
> BIT先端球は通常時を黒へ戻す。デバッグ表示は既定OFFとし、V1色をchase=緑、fixed=水色、random=黄、alert-send=橙、alert-receive=青、carpet-leader=桃、hold=白へ復元し、V2固有のcarpet-followerは紫にする。

2026-08-17 実装指示:

> `codex/v2-minimap-location-assets`ブランチから作業ブランチを作成し、そこにこのプランで実装を始めてください。なかなかGitHubが復旧しないので`develop`を取り込めないためです。
>
> 1. cleanな`codex/v2-minimap-location-assets`のHEAD `56a6ca2`から、`codex/v2-minimap-bit-polish`と専用worktree `../fps_survival20251226-t06-4p-1-minimap-bit-polish`を作成する。`develop`のpull・mergeは行わない。
> 2. 正確な日付を取得し、T06-4P-1個別計画へ今回の起点変更と指示原文を反映する。以降、各ステップ完了時にチェック状態を更新する。
> 3. B06-4のBarrier／Passage registryと現在のミニマップ・BIT表示を監査し、T06-3、T05、T06-4へ失敗fixtureを追加する。
> 4. ミニマップを作者定義Barrier／Passage描画へ切り替える。
> 5. BIT先端球の通常黒色と、既定OFFのモード別デバッグ色を実装する。
> 6. scoped fixture、typecheck、build、通常Web／Electronで検証する。
> 7. 個別計画の結果と中央ロードマップを更新し、T06-4P-1差分だけをcommitする。

2026-08-18 人間受入追加指示:

> ・トイレ周辺のミニマップがおかしいです。薄い線（出入り口）もそこではないところにあり、対応関係がおかしいです。
> ・体育館のギャラリーがミニマップ上で黒いです。緑にしてほしいです。
> ・体育館への渡り廊下に薄い線がありますが、ここは出入り口ではないと思います。仮に薄い線の意味がNavMeshの境界線だとしたら、そうではなく、「扉」「部屋の出入り口」あるいは「階段（マップ単位の大きな境目）」に限定してほしいです。
> ・体育館の舞台のあたりの仕切り壁が描画されていません。薄い線はいらないですが、黒い線はほしいです。
> ・体育館屋上の柵の外のミニマップに赤い縁が見えます。不要だと思うので原因を確認して削除してください。
> ・体育倉庫の側面の壁がミニマップにありません。黒い線を引いてください。
> ・階段やエレベーター側面の壁について、描画方法を考えたいです。ミニマップはマップの実態の略図を表すものと考えて、どう描画するのが一番実態に即すでしょうか？
>
> 渡り廊下についてはもう少し検討してください。見た目に即すなら線はいらないし、境界線という判断にするなら線はあってもよいと思います。1階、2階、3階の渡り廊下それぞれで検討し、ルールは一致させてください。
>
> わかりました。では、この方針でお願いします。

承認された統一規則は、薄線を「歩行可能床が、黒線で表す恒久的な壁・柵の開口を横断する位置」だけに描くことである。NavMesh境界、床Meshの継ぎ目、Area境界だけでは描かない。1F、2F、3Fの校舎・体育館側接続は、各階とも実壁または柵の固定開放出入口として薄線を残し、周囲の黒線と対応させる。

## 目的

B06-4の作者定義`floor_map`／`map_barrier`／`map_passage`をそのまま描画し、家具投影と別階混入を廃止する。同時にBIT先端球の通常色と既定OFFのモード別デバッグ色を確定する。人間受入で判明した作者定義形状の不整合は、Runtime座標特例を追加せず、生成正本、`.blend`、GLB、カタログhashを同期して修正する。

## 開始条件

- GitHub障害中の明示指示により、cleanでorigin追跡一致の`codex/v2-minimap-location-assets=56a6ca2`を直接起点とする。
- 5階層の`StageMinimapBarrier`／`StageMinimapPassage`がLocation registryから取得できる。
- `codex/v2-minimap-bit-polish`の専用worktreeを使用し、開始時点では`develop`をpull／mergeしない。

## 公開Runtime契約

```ts
export type StageMinimapBarrier = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  mesh: Mesh;
}>;

export type StageMinimapPassage = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  mesh: Mesh;
}>;
```

- `StageLocationAssetRegistry`へ`minimapBarriers`、`minimapPassages`と、階別取得APIを追加する。
- `src/ui/v2Minimap.ts`は作者定義barrierだけを黒で描き、passageは壁の切れ目に重なる短い明色線として描く。
- 旧`structuralBlockers`投影、Nav blocker、Collider、Object名・座標からの仕切り推測は削除し、fallbackを設けない。
- `V2BitSystemConfig`へ既定`false`のモード別先端球デバッグ表示を追加する。設定OFF時は全モード黒、ON時だけ確定色を使う。

## BIT色契約

| 状態 | 色 |
|---|---|
| 通常表示（デバッグOFF） | 黒 |
| chase | 緑 |
| fixed | 水色 |
| random | 黄 |
| alert-send | 橙 |
| alert-receive | 青 |
| carpet-leader | 桃 |
| hold | 白 |
| carpet-follower | 紫 |

## Location・Mission受入

- 中央校庭・体育館北側通路は`1F 校庭`、東西南北外周は`1F 校舎外周`と表示する。
- 校舎外周をPlayer／NPC Mission候補やミニマップLocation目標へ追加しない。
- `gym-rooftop`をPlayer／NPC通常Mission候補として読み、HUDに`3F 体育館屋上へ行く`を表示し、active時だけミニマップ目標を出す。
- Location IDや座標をRuntimeへ直書きしない。

## 受入条件

- 1F～4F・屋上で家具表示0件、別階混入0件、恒久仕切りだけが黒、全通行開口が短い明色線である。
- 屋上は屋上床輪郭、プール、更衣室、階段室、屋上固有壁・柵だけを表示する。
- BIT先端球はデバッグOFFで全モード黒、ONで上表8色と一致する。
- デバッグ表示は既定OFFで、通常ゲームの保存設定やタイトル設定へ先行追加しない。
- 1F Area表示と3F体育館屋上MissionがB06-4の意味資産だけで成立する。
- 全階トイレは実前壁・側壁と男女出入口2か所が対応し、共通通路や床継ぎ目をPassageとして描かない。
- 2F体育館ギャラリーの歩行床は緑で連続し、外壁・内側手すりだけが黒である。
- 1F、2F、3Fの体育館接続は、各階とも実壁・柵の開口だけを薄線で示し、NavMesh境界や床継ぎ目には線を置かない。
- 体育館舞台仕切りと体育倉庫側壁は実壁位置へ黒線を持ち、舞台開口へ薄線を置かない。
- 3F体育館屋上床は柵外へ赤くはみ出さない。
- 階段は歩行床を階色、側壁・手すりを黒、階段口を薄線で示し、エレベーターはシャフトを黒、実扉だけを薄線で示す。

## 検証

- T06-3 fixtureへ全階barrier／passage、家具0、別階混入0、cache再生成・破棄を追加する。
- T05 fixtureへ通常黒と全デバッグ色のMaterial回帰を追加する。
- T06-4 fixtureへArea表示、Mission候補、gym-rooftop完了・目標解除を追加する。
- 1920×1080の通常Web／Electronで全5階、BIT全モード、Pointer Lock、HUD重なり、console警告・エラー0件を確認する。

## ステップ

- [x] `codex/v2-minimap-location-assets=56a6ca2`から専用branch／worktreeを作成する
- [x] 正確な日付、今回の起点変更、実装指示原文を個別計画へ反映する
- [x] B06-4 registryと現行structural blocker投影を監査し、失敗fixtureを先に追加する
- [x] barrier／passageの階別描画へ切り替える
- [x] BIT通常黒と既定OFFのモード別デバッグ色を実装する
- [x] T05、T06-3、T06-4、build、Web／Electronを検証する
- [x] 結果と中央ロードマップを更新してT06-4P-1差分だけをcommitする
- [x] 人間受入画像と生成正本を照合し、トイレ、ギャラリー、3階層接続、舞台、体育館屋上、体育倉庫、階段・エレベーターの原因と統一描画規則を確定する
- [x] 受入修正fixtureを先に追加し、現行作者定義形状で失敗することを確認する
- [x] 作者定義floor／Barrier／Passageを実壁・柵・歩行床へ一致させ、生成正本、`.blend`、GLB、カタログhashを同期する
- [x] 資産監査、決定性、対象fixture、typecheck、build、通常Web／Electronで受入項目を検証する
- [x] 人間受入結果と中央ロードマップを更新し、受入修正差分だけをcommitする

## 結果

2026-08-18、GitHub障害中のユーザー指示により、cleanでorigin追跡一致の`codex/v2-minimap-location-assets=56a6ca2`から`codex/v2-minimap-bit-polish`と専用worktreeを作成した。B06-4の階別Barrier／Passage registryを監査し、T06-3、T05、T06-4へ先行fixtureを追加した。ミニマップは旧Nav blocker投影を廃止し、5階分の作者定義floor／Barrier／Passage cacheを床、黒いBarrier、明色Passageの順に描画する実装へ切り替えた。BIT先端球は共有MaterialとInstanceを維持し、通常Runtimeでは全モード黒、専用fixtureでのみモード別色を使う必須boolean設定へ切り替えた。carpet-followerのfade中もInstance色を保持し、追加Materialを生成しない。

T05は320/320、T06-3は16/16、T06-4は36/36でPASSした。`audit:v2:dependencies`、`typecheck:v2`、`build:t05`、`build:t06-3`、`build:t06-4`、`build:electron`はPASSした。通常rendererも生成まで成功し、既知の配布監査だけがOFL／THIRD_PARTY_NOTICESのCRLF bytes／hash差で失敗した。1920×1080のWebでは5階表示、HUD重なりなし、console warning／error 0件を確認し、Electron normal／haigureはPointer Lock、Mission配線、console／renderer／load／process診断0件でPASSした。

`develop`のpull／merge、既存worktree、未保存Blender画面、学校`.blend`、GLB、NavMesh、生成器、カタログhashは変更していない。中央ロードマップを完了状態へ更新し、指定された`feat: ミニマップとBIT表示を仕上げる`でT06-4P-1差分だけをローカルcommitした。

2026-08-18、人間受入でトイレ開口、体育館ギャラリー、1F～3F体育館接続、舞台仕切り、体育館屋上外縁、体育倉庫側壁、階段・エレベーター表現を再監査した。薄線を恒久壁・柵の開口だけへ限定し、1F～3Fの体育館接続は同じ規則で両端の固定開放出入口を示す方針が承認された。現行不整合はRuntime描画色ではなくB06-4作者定義形状にあるため、後続受入ステップで生成正本と派生資産を同期して修正する。

受入fixtureを`audit_b05_location_assets.py`へ先行追加し、トイレ実壁・出入口、ギャラリー歩行床、舞台仕切り、体育倉庫側壁、3階層接続、体育館屋上外縁、エレベーターシャフト・扉を座標単位で検査するようにした。変更前`.blend`に対して実行し、最初の不合格として`3F体育館屋上floor_mapが実床・柵の外側へはみ出しています`を再現した。

作者定義を修正し、全階トイレの実壁・男女出入口、エレベーターシャフト・実扉、1F～3F体育館接続の両端、1F舞台仕切り・体育倉庫側壁、2Fギャラリー外壁・手すり、3F体育館屋上の実床・柵外周を同期した。NavMesh境界、床継ぎ目、舞台中央、旧トイレ共通通路にはPassageを置いていない。生成バージョンを`t06-4p-1-minimap-acceptance-v4`へ更新し、通常生成が旧成果物を再利用しないことと、2回目の通常生成で`.blend`／GLB hashが不変であることを確認した。GLBは22,464,416 bytes、SHA-256 `84160507C68D30B23BEA9E68FEF3DF204B475FEF144DCCF6AFDFDA6ADA3D2DDA`となり、カタログを同期した。

建築監査、保護契約比較、Location監査、Room Variant NavMesh `--check`に合格し、Human／Room Variant／BIT NavMesh hashは開始時から不変だった。`audit:v2:dependencies`、`typecheck:v2`、`build:b05`、`build:t06-3`、`build:t06-4`、`build:electron`はPASSし、T06-3実ブラウザfixtureは16/16、console／Babylon異常0件だった。通常Webは1920×1080の新規Chromeタブでタイトルから学校3D空間へ遷移し、ミニマップとHUD描画を確認した。Electron normal／haigureはPointer Lock、Mission配線、console／renderer／load診断0件でPASSした。通常buildは学校GLBのカタログ整合まで成功し、既知のOFL／THIRD_PARTY_NOTICESのCRLF bytes／hash差だけで失敗した。Chrome自動操作のPointer Lock `WrongDocumentError`と、今回変更していない旧`rampValidation=gym`のNavigation Area Portal例外は実装受入から分離した。

人間受入結果と中央ロードマップを更新し、受入修正差分だけを`fix: ミニマップ意味資産を実態に合わせる`でローカルcommitした。push、Pull Request更新、レビュー、mergeは実施していない。
