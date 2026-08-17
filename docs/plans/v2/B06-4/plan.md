# HAIGURE SURVIVAL v2 B06-4 ミニマップ意味資産・Location 計画

更新日: 2026-08-17

## プロンプト

> PLEASE IMPLEMENT THIS PLAN:
>
> `MAP_*`へ階別の恒久仕切りと通行開口を明示的に作者定義する。Nav blocker、Object名、座標からの推測は廃止する。
>
> 家具・便器・机・椅子・ロッカー等は通行可否にかかわらず登録しない。
>
> 屋上は屋上床輪郭と、プール、更衣室、階段室、屋上固有の壁・柵だけを登録し、下階形状を含めない。
>
> 1F校庭／校舎外周Area分割、体育館屋上Mission Location、Anchor、Volumeを既承認契約どおり追加する。
>
> 複数NPCの屋上入口停止を資産・NavMesh側で監査し、残る場合だけT06-4Pへ渡す。
>
> 最新`origin/develop`から`codex/v2-minimap-location-assets`専用worktreeを作成する。B06-4は作者定義の意味資産と、それを厳格に読み出す最小Runtime契約までを担当し、ミニマップ描画変更、BIT表示、NPC Runtime修正は後続へ残す。実装・検証・個別計画更新・commitまでを対象とし、push、Pull Request、レビュー、mergeは行わない。

## 目的

P1-MAP-01～03、P1-LOC-01～02、P1-NAV-01を作者定義の意味資産へ反映し、ミニマップに恒久仕切りと通行開口だけを階別公開する。

## 開始条件

- B06-3はPR #74で`origin/develop=6527097`へ統合済みである。
- 共有`develop`の未追跡ファイルと未保存Blender 5.2画面には触れない。
- `origin/develop=6527097`から作成した`codex/v2-minimap-location-assets`専用worktreeを使用する。
- B05の5 Map、52 Area／85 piece、24 Mission Location、17階段踊り場、4エレベーター乗場、放送卓を変更前baselineとする。

## 公開資産契約

- `MAP_*`の`hs_role`を`floor_map | map_barrier | map_passage`へ拡張する。
- `floor_map`は各階1件の床輪郭、`map_barrier`は恒久壁・塀・柵、`map_passage`は扉・出入口の通行開口を表す。
- 3 roleは`hs_id`、`hs_role`、`hs_floor_id`を必須とする。`floor_map`だけは`hs_display_name`と正整数`hs_order`も必須とする。
- barrier／passageのIDは全体で一意とし、未知role、重複ID、未登録floor、5階層のfloor_map欠落を読込エラーにする。
- 家具、机、椅子、ロッカー、便器、小便器、掲示板、箱などは通行可否にかかわらず`map_barrier`へ登録しない。
- Nav blocker、Collider名、表示Object名、座標からbarrier／passageを推測するfallbackは設けない。
- schema versionは`3`を維持する。
- `StageLocationAssetRegistry`へ`StageMinimapBarrier`、`StageMinimapPassage`、`minimapBarriers`、`minimapPassages`、`getMinimapBarriers(floorId)`、`getMinimapPassages(floorId)`を追加する。
- B06-4は上記資産を厳格に読み出す最小Runtime契約までを所有する。`src/ui/v2Minimap.ts`の描画切替と旧`structuralBlockers`投影の削除はT06-4P-1へ残す。

## Location契約

- 1Fの`area-courtyard`を中央校庭と体育館北側通路に限定し、南・西・北・東外周へ`area-school-perimeter`（表示名`校舎外周`）を追加する。
- 校舎外周は`location_area`だけを持ち、Mission Location、Anchor、Volume、集合・公開処刑会場を追加しない。
- `gym-rooftop` Mission Location、Anchor、2m四方Volumeを既存箱・Ramp・柵と干渉しない体育館屋上中央の作者座標`(46.4, 9.5, 9.6)`へ追加する。
- 追加後は5 Map、53 Area／85 piece、Mission Location／Anchor／Volume各25件、階段踊り場17件、エレベーター乗場4件、放送卓1件とし、既存IDと会場を変更しない。

## 屋上とNPC入口監査

- `roof`には屋上床輪郭、プール、更衣室、階段室、屋上固有の壁・柵だけを登録し、4F以下の壁を含めない。
- 単体／5体／10体NPCについて、直接追跡、同行、Alarm、放送Mission、通常Mission、自律移動で屋上入口を双方向確認する。
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

- [x] 現行floor_map生成とNav blocker投影経路を監査する
- [x] floor_map／map_barrier／map_passageを作者定義する
- [x] 屋上固有形状、Area分割、gym-rooftop Locationを実装する
- [x] Runtime registryと厳格なMAP拒否契約を追加する
- [x] 複数NPC屋上入口を資産・NavMesh側で検証する
- [x] `.blend`、GLB、必要なNavMesh、カタログhashを同期する
- [x] 決定性、B05、全階ミニマップ意味資産、Web／Electronを検証する
- [x] 条件付きRuntime再現snapshotの要否を判定し、T06-4P-2へ結果を引き渡す
- [x] 結果を更新してB06-4差分だけをcommitする

## 結果

2026-08-17、B06-3がPR #74で統合済みの`origin/develop=6527097`から`codex/v2-minimap-location-assets`と専用worktreeを作成した。共有`develop`の未追跡`docs/plans/skills/`、`scripts/v2/__pycache__/`と未保存Blender 5.2画面は変更していない。

現行実装は5件の`floor_map`を作者定義する一方、仕切りを`src/ui/v2Minimap.ts`が人間用Nav blockerから高さ投影している。B06-4ではこの推測元を増やさず、後続T06-4P-1が切り替えられる厳格な`map_barrier`／`map_passage` registryまでを追加する。

階別の作者定義Barrier／Passageを各1 Meshへ統合し、5階すべてを明示した。校庭14 pieceは中央校庭・体育館北側通路3 pieceと校舎外周11 pieceへ再割当てし、`gym-rooftop` Missionを作者座標へ追加した。Runtimeは全MAP ID一意、未知role、未知floor、階別Barrier／Passage欠落を拒否する。

生成を2回行い、`.blend`は3,850,960 bytes／SHA-256 `9C46FE0D243F3B1C4C55F567A3214A6FB17DE867A7B9DE2F60BE67E7DBEE350B`、GLBは22,435,504 bytes／SHA-256 `EC1E7F81351833186763D070CB6A604EE36750A43030E3138D5C27EB9E28B97D`、Scene意味署名は`0F94EAC7D600706E90360526C2906CC5B651FBD61C20069DE806F7CD09AB46C3`で一致した。人間用NavMesh `52F7DCBCD09B5DEE685865001BC2DD1E8B98F4BF418688C8F4F01DB0C180A9E4`、Room Variant用NavMesh `C5D9BD4A021370006A4C9D380EA938720719B2908C2D83AE4509720CCAC74C4C`、BIT用NavMesh `4B3BBD249E00C515DAD333EF29157E5128FC5CF7286CC26655D096E34BE5B499`は変更前から完全不変であり、物理形状修正と再ベイクは不要だった。

B05意味監査は5 Map、Barrier／Passage各5、53 Area／85 piece、Mission Location／Anchor／Volume各25、階段踊り場17、エレベーター乗場4、放送卓1、同順位正体積重複0、境界外0で通過した。実ブラウザB05は42/42、通常版／荒れ版Anchor到達性は各25/25、未知MAP role、重複ID、欠落metadata、未知floor、階別Barrier／Passage欠落、不正Area／Anchor参照の拒否を含めてPASSし、console warning／errorとBabylon Loggerは0件だった。

T04実学校fixtureは81/81を通過した。`gym`と`gym-rooftop`間を、直接追跡、Follow、Alarm、放送Mission、通常Mission、自律移動の6状態、単体／5体／10体、上り／下りで合計192経路監査し、すべて経路を取得した。複数集中時だけの停止は再現せず、資産・Collider・NavMesh原因も検出しなかったため、T06-4P-2向け停止snapshotは作成しない。T06-4P-2はこの192経路のfixtureを回帰入力とし、新たに実移動停止が再現した場合だけRuntime混雑制御を扱う。

`typecheck:v2`、B05、T02、T04、T06-3、T06-4、各対象build、Python構文、Electron buildは成功した。通常buildはVite生成と学校GLBカタログ整合まで成功し、`origin/develop`と差分がないライセンス2ファイルについて既知の`ofl-integrity`と`third-party-notices-integrity`だけが改行差で失敗した。B06-4による新規失敗は0件である。通常Webは学校GLBと50 NPCを読込み、warning／error 0件だった。Electronのnormal／haigure Mission受入はPointer Lock、Location表示、Mission target、放送、再読込、診断0件を通過した。

T06-4P-1へは`StageLocationAssetRegistry.minimapBarriers`／`minimapPassages`と階別getterを引き渡す。T06-4P-1は`src/ui/v2Minimap.ts`の描画元切替、旧`structuralBlockers`投影削除、黒線・明色開口・BIT表示だけを担当する。push、Pull Request、レビュー、mergeは実施しない。
