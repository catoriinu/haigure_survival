# HAIGURE SURVIVAL v2 B06-4 ミニマップ意味資産・Location 計画

更新日: 2026-08-10

## プロンプト

> `MAP_*`へ階別の恒久仕切りと通行開口を明示的に作者定義する。Nav blocker、Object名、座標からの推測は廃止する。
>
> 家具・便器・机・椅子・ロッカー等は通行可否にかかわらず登録しない。
>
> 屋上は屋上床輪郭と、プール、更衣室、階段室、屋上固有の壁・柵だけを登録し、下階形状を含めない。
>
> 1F校庭／校舎外周Area分割、体育館屋上Mission Location、Anchor、Volumeを既承認契約どおり追加する。
>
> 複数NPCの屋上入口停止を資産・NavMesh側で監査し、残る場合だけT06-4Pへ渡す。

## 目的

P1-MAP-01～03、P1-LOC-01～02、P1-NAV-01を作者定義の意味資産へ反映し、ミニマップに恒久仕切りと通行開口だけを階別公開する。

## 開始条件

- B06-3が独立レビュー後に`develop`へ統合済みである。
- B05の5 Map、52 Area／85 piece、24 Mission Location、17階段踊り場、4エレベーター乗場、放送卓の現行目録を再監査済みである。
- `codex/v2-minimap-location-assets`の専用worktreeを使用する。

## 公開資産契約

- `MAP_*`の`hs_role`を`floor_map | map_barrier | map_passage`へ拡張する。
- `floor_map`は各階1件の床輪郭、`map_barrier`は恒久壁・塀・柵、`map_passage`は扉・出入口の通行開口を表す。
- 3 roleは`hs_id`、`hs_role`、`hs_floor_id`を必須とする。`floor_map`だけは`hs_display_name`と正整数`hs_order`も必須とする。
- barrier／passageのIDは全体で一意とし、未知role、重複ID、未登録floor、5階層のfloor_map欠落を読込エラーにする。
- 家具、机、椅子、ロッカー、便器、小便器、掲示板、箱などは通行可否にかかわらず`map_barrier`へ登録しない。
- Nav blocker、Collider名、表示Object名、座標からbarrier／passageを推測するfallbackは設けない。

## Location契約

- 1Fの`area-courtyard`を中央校庭と体育館北側通路に限定し、南・西・北・東外周へ`area-school-perimeter`（表示名`校舎外周`）を追加する。
- 校舎外周は`location_area`だけを持ち、Mission Location、Anchor、Volume、集合・公開処刑会場を追加しない。
- `gym-rooftop` Mission Location、Anchor、2m四方Volumeを既存箱・Ramp・柵と干渉しない体育館屋上中央へ追加する。
- 追加後の論理Areaは53、Mission Location／Anchor／Volumeは各25件とし、既存IDと会場を変更しない。

## 屋上とNPC入口監査

- `roof`には屋上床輪郭、プール、更衣室、階段室、屋上固有の壁・柵だけを登録し、4F以下の壁を含めない。
- 単体／複数NPCについて、直接追跡、同行、Alarm、放送Mission、通常Mission、自律移動で屋上入口を双方向確認する。
- 資産・Collider・NavMesh修正後も複数集中時だけ停止する場合、再現seed、開始位置、目的地、NPC数、snapshotをT06-4P-2へ渡す。

## 対象外

- ミニマップの色・線幅・描画、BIT先端球はT06-4P-1、NPC混雑解消はT06-4P-2が担当する。
- `MAP_*`を物理衝突、遮蔽、NavMeshベイクへ使用しない。

## 受入条件

- 1F～4F・屋上の各階で家具表示0件、別階混入0件、未知role・重複ID・欠落階0件である。
- 屋上は屋上固有形状だけ、扉・出入口は対応する`map_passage`、恒久壁・塀・柵は`map_barrier`である。
- 中央校庭・体育館北側通路は`1F 校庭`、外周歩行域は`1F 校舎外周`となり、校舎外周はMission候補に出ない。
- `3F 体育館屋上`がPlayer／NPC通常Mission用の25件目として厳格参照できる。
- 人間用／Room Variant用／BIT用NavMeshは形状変更がない限りbytes／SHA-256不変である。

## 検証

- GLB、必要なNavMesh、監査署名を各2回生成して決定性を確認する。
- B05資産・参照・被覆・Anchor到達性、全階barrier／passage目録、家具0、別階混入0を監査する。
- T02、T04、T06-3、T06-4、通常build、Web／Electron、console警告・エラー0件を確認する。

## ステップ

- [ ] 現行floor_map生成とNav blocker投影経路を監査する
- [ ] floor_map／map_barrier／map_passageを作者定義する
- [ ] 屋上固有形状、Area分割、gym-rooftop Locationを実装する
- [ ] 複数NPC屋上入口を資産・NavMesh側で検証する
- [ ] `.blend`、GLB、必要なNavMesh、カタログhashを同期する
- [ ] 決定性、B05、全階ミニマップ意味資産、Web／Electronを検証する
- [ ] 条件付きRuntime再現snapshotをT06-4P-2へ引き渡す
- [ ] 結果を更新してB06-4差分だけをcommitする

## 結果

未着手。B06-3の`develop`統合後に開始する。
