# HAIGURE SURVIVAL v2 ステージ資産仕様書

更新日: 2026-07-19
対象バージョン: v2
基準検証: T01 GLB・座標・衝突規約 技術検証

## 1. 文書の位置付け

本書は、HAIGURE SURVIVAL v2で使用するBlender編集元、ゲーム用GLB、Recast NavMesh派生物の資産契約を定義する。

V2のステージ空間の正本は、GLBへ出力された3D形状、EmptyのTransform、Object custom properties由来のglTF Node `extras`である。表示、物理衝突、光線遮蔽、NavMesh生成元、スポーン位置、ゲームプレイ領域、ステージ境界、ポータル、非連続接続を同じ座標系の資産として管理する。

ステージJSONは使用しない。JSON文字マップ、セル、行・列、矩形ゾーンなどへ空間を重複記述してはならない。TypeScriptのステージカタログが保持できるのは、ステージID、表示名、GLB URL、NavMesh URL、整合性検査用ハッシュなどの非空間情報だけである。

Recast NavMeshバイナリはGLBの`NAV_*`形状から生成する派生物であり、編集元ではない。`LNK_*` EmptyはGLBに残る特殊接続の正本であり、RuntimeがNavMesh上へ両端を投影して経路グラフへ加える。NavMeshを変更したい場合はBlender資産またはベイクプロファイルを変更し、GLB監査後に再ベイクする。

本規約は規約準拠資産だけを扱う。未知の接頭辞、欠落した必須Object、未知の`hs_*` propertyを読み替える互換処理やフォールバックは作らない。

## 2. 正本と派生物

| 対象 | 役割 | 正本性 |
|---|---|---|
| `.blend` | 制作者が編集する資産 | 編集正本 |
| `.glb` | 実行時に読む3D形状、Transform、Node `extras` | 実行時の空間正本 |
| `.navmesh.bin` | `NAV_*`と固定ベイクプロファイルから生成したRecastデータ | 再生成可能な派生物 |
| TypeScriptカタログ | ID、表示名、URL、ハッシュ、形式バージョン | 非空間情報だけ |
| ステージJSON | V2では使用しない | 禁止 |

`.blend`とGLBが一致しない場合、実行時の監査対象はGLBである。ただし不一致をGLB側の手修正で解消してはならず、`.blend`を修正してGLBとNavMeshを再出力する。

## 3. ファイル配置

通常ステージ資産は次のように配置する。

```text
assets/blender/v2/<ステージID>/<資産名>.blend
public/stage-assets/v2/<ステージID>/<資産名>.glb
public/stage-assets/v2/<ステージID>/<資産名>.navmesh.bin
```

当面の通常ゲーム対象は学校だけである。T01は技術検証fixtureであり、B02学校は本書の空間Object契約と事前ベイクNavMeshを備えた実ゲーム移行中の資産である。

| 用途 | パス | 状態 |
|---|---|---|
| T01 Blender編集元 | `assets/blender/v2/T01/t01_glb_collision_course.blend` | 座標・縮尺・衝突の検証fixture |
| T01 GLB | `public/stage-assets/v2/T01/t01_glb_collision_course.glb` | 座標・縮尺・衝突の検証fixture |
| B02 Blender編集元 | `assets/blender/v2/B02/b02_school_blockout.blend` | 学校の制作元。3D意味ObjectとNavMesh生成元を保持 |
| B02 GLB | `public/stage-assets/v2/B02/b02_school_blockout.glb` | 学校の実行時空間正本。Runtime移行・手動検証中 |
| B02 NavMesh | `public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin` | 同一GLBから事前ベイクするRecast派生物 |

`.blend`はVite配布物へ含めない。GLBとNavMeshバイナリだけを`public`からWeb版・Electron版へコピーする。バイナリ資産は単一担当で編集し、同一ファイルを複数ブランチで並行編集しない。

### 3.1 B02学校の現行監査基準

- Blenderは504 Object／480 Meshとし、`EXP_Stage_school`配下の482 ObjectだけをGLBへ出力する。
- 出力内訳は`VIS_*`308件、`COL_*`161件、`NAV_*`8件、`META_Stage`1件、`MRK_*`1件、`VOL_*`2件、`BND_Stage`1件とする。
- 制作用ガイド22件はExport Collection外に保持し、GLBへ出力しない。
- 主玄関、北側校舎北口、北側校舎南口、体育館校庭側は、総高0.30m、各蹴上0.15m、各踏面1.00mの表示2段を共通断面とする。移動衝突は表示段と分離し、地面Z＝-0.30mから床Z＝0.00mへ続く単一の`COL_*Ramp`とする。渡り廊下東西側は表示段を置かず、不可視の`COL_BridgeSideRamp_East`と`COL_BridgeSideRamp_West`で同じ床高差を連続接続する。
- 男女トイレは各3個室とし、内部仕切りは厚さ0.08m、奥行2.10m、高さ2.10mの`VIS_ToiletStallPartition_*`と`COL_ToiletStallPartition_*`を一致させる。男子小便器はB03で3基を追加するため、X＝-2.55～-2.25m、Y＝39.0～42.2mの設置帯と、その西側1.0mの立位空間を塞がない。
- 体育館舞台階段上部の東西表示壁・衝突壁は、舞台上面からBlender 2.4mの実開口を一致して確保する。NavMeshだけを接続する仮connector面は資産へ残さない。
- `BND_Stage`のBlender範囲はX＝-18.4～63.2m、Y＝-12.3～51.3m、Z＝-0.5～16.0mとする。プールサイド足元Z＝13.85mへ最大視点高2.0mを加えたZ＝15.85mを内包し、上端に0.15mの余裕を持つ。
- 事前ベイク後は、主玄関から校庭、北側屋外、北西階段踊り場・階段下倉庫、北東・南西階段踊り場、体育館中央・体育倉庫へ向かう経路、校庭・東側屋外から各出入口と渡り廊下側面へ向かう経路、男女トイレ個室、西側特別教室内縦断・前方扉・後方扉、体育館床・東西ランプ下から舞台へ向かう経路を含む代表21経路が要求終点へ到達することを検査する。部分経路を成功扱いせず、要求終点との誤差`1e-5`以下を必須とする。現行監査資産では2～4階の一般床、北西上階階段、屋上、プールをAI NavMeshの対象外としているが、これはT04-1時点の資産状態である。屋上は窓の設置対象外であるだけで、ゲームプレイまたは将来の経路対象から除外しない。
- 現行`.blend`は345,906 bytes・SHA-256 `6F68041134DEA543BDF7FA13193ECA46A729145E973BD28C5855AAEB72DDE51B`、GLBは942,796 bytes・SHA-256 `294F8E4370CE736726166AE14CBABEB89CBB40DE875CFD2FF40A9F9E20EB9C8C`、NavMeshは157,376 bytes・SHA-256 `7326422B609D810E8736B48A08EC819AA962848769A718E175463FE6191A5347`である。同じ保存済み`.blend`からのGLB再出力と同じGLBからのNavMesh再ベイクで、GLBとNavMeshの各SHA-256が一致しなければならない。

検証専用Viteでは、`publicDir`をリポジトリ全体の`public`へ向けない。検証対象の資産ディレクトリだけを公開し、ビルド後はファイル一覧、容量、SHA-256を公開元と照合する。

## 4. Blender制作座標

- 単位系: Metric
- Unit Scale: `1.0`
- 長さ単位: Meters
- `1 Blender unit = 1m`
- X: 右が正
- Y: 制作上の前方が正
- Z: 上が正
- ステージ原点: 基準入口中央の床上面
- Mesh Objectの配置完了時scale: `(1, 1, 1)`
- Mesh Objectの配置完了時rotation: `(0, 0, 0)`。回転が必要な形状は適用してから出力する
- Emptyのscale: `(1, 1, 1)`。`MRK_*`と`LNK_*`は向きを保持するためrotationを適用しない
- Emptyのローカル`+Y`を前方、ローカル`+Z`を上方とする

T01ではBlender 5.2.0 LTSとglTF exporter 5.2.39を使用した。`Y-up`を有効にした実測変換は次のとおりである。

```text
(X_blender, Y_blender, Z_blender)
  -> (X_gltf, Y_gltf, Z_gltf)
  = (X_blender, Z_blender, -Y_blender)
```

GLB内の距離倍率は`1.0`であり、メートル寸法を維持する。

## 5. Babylon.js座標と縮尺

Babylon.js 6.49.0の既定左手系へGLBを読み込み、AssetContainerの管理親へ`0.25`の一様縮尺を適用した最終対応は次のとおりである。

```text
(X_blender, Y_blender, Z_blender)
  -> (X_babylon, Y_babylon, Z_babylon)
  = (-0.25 * X_blender, 0.25 * Z_blender, -0.25 * Y_blender)
```

| Blender | Babylon |
|---|---|
| `+X` | `-X` |
| `+Y` | `-Z` |
| `+Z` | `+Y` |
| 1m | 0.25ワールド単位 |

軸変換はライブラリの説明だけで確定しない。エクスポーター、ローダー、座標設定の変更後は、左右・前後・上下を区別できる非対称な基準点を持つGLBを実ブラウザで読み込み、world Transformとworld boundsを測定する。GLBのJSON解析だけを最終判定に使用しない。

縮尺は作者Meshへ焼き込まず、次の順序で適用する。

1. `@babylonjs/loaders/glTF`を登録する。
2. `SceneLoader.LoadAssetContainerAsync`でGLBをAssetContainerへ読む。
3. `AssetContainer.createRootMesh()`で作者データの外側へ管理親を追加する。
4. 管理親へ`0.25`の一様縮尺を設定する。
5. glTFローダーが生成した座標変換用ルートは変更しない。
6. 同じ管理親のworld Transformを、表示、衝突、Empty、Volume、NavMeshベイクのすべてへ適用する。

GLBとNavMeshで別の軸変換や縮尺を使用してはならない。NavMeshは、この管理親適用後と同じBabylon world座標でベイクする。

## 6. Export Collection

通常ステージは、Blender Scene内に次のExport Collectionを1つだけ持つ。

```text
EXP_Stage_<stage-id>
```

学校の例は`EXP_Stage_school`である。Objectは役割別の子Collectionへ整理してよいが、実行時の分類はCollection名ではなくObject名とNode `extras`だけで決定する。

- GLBへ出力する全Objectを`EXP_Stage_<stage-id>`配下へ置く。
- 契約ObjectをExport Collection以外のCollectionへ多重リンクしない。
- 制作用ガイド、参照画像、Camera、Light、未適用Boolean元、バックアップObjectはExport Collectionへ置かない。
- 手動選択状態を出力範囲の正本にしない。エクスポート処理は対象Export Collectionを名前で指定する。
- Export Collection外のObjectがGLBへ混入した場合は監査失敗とする。
- Collection custom propertiesへ実行時情報を置かない。glTF Node `extras`として到達できるObject custom propertiesだけを使用する。

## 7. Object分類

作者Object名は次のいずれかへ厳密に分類する。Mesh ObjectはObject名とMesh Data名を同一にする。名前はGLB内で一意とし、未知接頭辞を認めない。

現行Runtimeでは、複数の作者Objectで同一Mesh datablockを共有しない。共有MeshをglTFの複数Nodeから参照すると、Babylon.jsローダーの既定設定では2個目以降が`InstancedMesh`になり得る一方、`StageSpatialContext`は作者Nodeを通常の`Mesh`として分類する契約だからである。Mesh datablock共有を採用する場合は、専用fixtureでGLB Node名、`extras`、分類、衝突、遮蔽、破棄を検証し、Runtimeのinstance対応と本書のObject名・Mesh Data名契約を同じ技術タスクで更新してから使用する。Material共有はこの制限を受けない。

| 接頭辞・固定名 | Blender型 | 役割 | 表示 | Actor衝突 | 光線・視線遮蔽 | NavMeshベイク |
|---|---|---|---|---|---|---|
| `VIS_*` | Mesh | プレイヤーに見せる形状 | 有効 | 無効 | 無効 | 不使用 |
| `COL_*` | Mesh | 通常の不可視衝突 | 無効 | 有効 | 有効 | 不使用 |
| `COL_ActorOnly_*` | Mesh | 全移動体専用の不可視衝突 | 無効 | 有効 | 無効 | 不使用 |
| `COL_HumanOnly_*` | Mesh | プレイヤー・NPC専用の不可視衝突 | 無効 | 有効 | 無効 | 不使用 |
| `NAV_*` | Mesh | Recastベイク入力 | 無効 | 無効 | 無効 | 使用 |
| `META_Stage` | Empty | ステージ全体メタデータ | 無効 | 無効 | 無効 | 不使用 |
| `MRK_*` | Empty | 位置と向きを持つマーカー | 無効 | 無効 | 無効 | 不使用 |
| `VOL_*` | 閉じたMesh | ゲームプレイ領域 | 無効 | 無効 | 無効 | 不使用 |
| `BND_Stage` | 閉じたMesh | プレイ可能空間の外周境界 | 無効 | 無効 | 無効 | 不使用 |
| `PRT_*` | 薄い閉じたMesh | room、streaming、door trigger等のポータル | 無効 | 無効 | 無効 | 不使用 |
| `LNK_<id>_A/B` | Empty 2個 | 連続NavMeshで表せない接続点対 | 無効 | 無効 | 無効 | 不使用 |

`COL_ActorOnly_*`と`COL_HumanOnly_*`は通常`COL_*`より先に判定し、排他的に分類する。専用Colliderを通常`COL_*`へも重複登録してはならない。

### 7.1 `VIS_*`

- 表示形状だけを持ち、`checkCollisions=false`とする。
- 物理衝突やゲーム判定を表示Meshへ依存させない。
- 透明ガラスは`VIS_WindowGlass_*`とし、ガラスMaterialを共有して透明Object数を抑える。
- `VIS_*`を光線・視線の遮蔽Meshとして使用しない。

### 7.2 `COL_*`、`COL_ActorOnly_*`、`COL_HumanOnly_*`

- 表示形状と衝突形状を別Meshにする。
- 閉じた低ポリ形状とし、法線を外向きにする。
- 壁、床、天井、段差、斜面、踊り場へ対応する`COL_*`を用意する。
- B03-1では校舎1～4階、階段下、体育館、屋上階段室を含む全屋内空間を検査し、ビットが入り得る範囲の直上に天井`COL_*`の欠落がない状態にする。
- 表示階段へ衝突を設定せず、踏面を覆う連続斜面`COL_StairRamp_*`を使用する。
- `COL_Stairs_*`のような段ごとの階段Colliderは作らない。
- 通常`COL_*`はプレイヤー、NPC、ビットの移動と、通常・固定・トラップ・動的を含む全光線、視線のすべてを遮る。
- `COL_ActorOnly_*`はプレイヤー、NPC、ビットの全移動体を止め、視線と全光線を通す。
- `COL_HumanOnly_*`はプレイヤーとNPCだけを止め、ビット、視線、全光線を通す。
- 不可視でも衝突を維持するため、Runtimeでは`setEnabled(false)`にせず、`isVisible=false`とする。

学校窓は壁を実際に開口し、表示と移動衝突を分離する。

| 窓 | 表示Object | 衝突Object | 移動・光線契約 |
|---|---|---|---|
| 閉じた窓 | `VIS_WindowFrame_*`と`VIS_WindowGlass_*` | `COL_ActorOnly_Window_*` | プレイヤー・NPC・ビットを止め、視線と全光線を通す |
| 指定した開いた窓または割れた窓 | 開口状態に対応する`VIS_WindowFrame_*`、必要なガラス表示 | `COL_HumanOnly_Window_*` | プレイヤー・NPCを止め、ビット・視線・全光線を通す |

ビット通過窓は見た目が開いた窓か割れた窓かにかかわらず、Runtimeでは`hs_link_kind="bit_window"`の同一契約で扱う。Collider名だけでビット通過経路を推測せず、必ず7.8節の`LNK_<id>_A/B`を組み合わせる。閉じた窓へ`bit_window`を置いてはならない。

窓位置で通常の床・階段NavMeshが連結しないよう、必要な`NAV_*` blockerも別途用意する。`COL_ActorOnly_Window_*`と`COL_HumanOnly_Window_*`をNavMeshベイク入力へ流用しない。

### 7.3 `NAV_*`と`hs_nav_role`

`NAV_*`はRecast NavMeshを生成するためだけの低ポリMeshである。`VIS_*`、`COL_*`から自動抽出せず、ベイク入力を明示する。

すべての`NAV_*` Objectは、Object custom property `hs_nav_role`を次のいずれかで持つ。

| `hs_nav_role` | 形状 | ベイク時の意味 |
|---|---|---|
| `walkable` | 床、斜面、踊り場、階段ランプなどのMesh | 傾斜・クリアランス条件を満たす面を歩行候補にする |
| `blocker` | 壁、閉鎖扉、窓開口、柱などの閉じた低ポリMesh | walkable spanを遮断する |
| `exclude` | 閉じた低ポリVolume | 内部のNavMesh polygonを生成対象から除外する |

- `walkable`には`hs_nav_area`を必須とし、初期値は`ground`、`stairs`、`outdoor`、`door`のいずれかとする。
- `hs_nav_area`は経路フィルターとコストへ使用する意味ラベルであり、座標やセル番号ではない。
- 未登録の`hs_nav_role`または`hs_nav_area`は監査失敗とする。
- 通常階段は連続した`NAV_*` walkable面で表す。段ごとのリンクを作らない。
- 通常扉は開口を跨ぐ連続NavMeshで表す。room分割やdoor triggerが不要なら`PRT_*`も作らない。
- `NAV_*`はGLBへ含めるが、通常Runtimeでは非表示・非衝突・非pickableとする。

### 7.4 `META_Stage`

`META_Stage`はExport Collection内にちょうど1個置く単一Emptyである。locationとrotationを`(0, 0, 0)`、scaleを`(1, 1, 1)`とし、ステージ全体のObject `extras`を保持する。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_schema_version` | integer | 本資産契約のschema version。初期値は`1` |
| `hs_stage_id` | string | TypeScriptカタログのIDと完全一致するID |
| `hs_nav_profile` | string | ベイクに使用するversion付きRecastプロファイルID |

表示名、GLB URL、NavMesh URLは`META_Stage`へ置かず、TypeScriptカタログで管理する。座標配列、スポーン一覧、ゾーン一覧、セルマップを1つのpropertyへ埋め込んではならない。

### 7.5 `MRK_*`

`MRK_*`は点と向きを表すEmptyである。位置はEmptyのworld translation、向きはworld rotationを正本とする。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意な小文字kebab-case ID |
| `hs_role` | string | Runtimeのmarker role registryに登録された役割 |

例:

```text
MRK_PlayerSpawn_Main
  hs_id = "player-spawn-main"
  hs_role = "player_spawn"
```

学校の通常ゲーム資産は`player_spawn`をちょうど1個持つ。NPCやビットのランダム出現範囲は点の集合ではなく`VOL_*`で表す。位置やEuler角をpropertiesへ重複記述しない。

### 7.6 `VOL_*`と`BND_Stage`

`VOL_*`はスポーン、集合、進入禁止、危険領域などを表す閉じた低ポリMeshである。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意な小文字kebab-case ID |
| `hs_role` | string | Runtimeのvolume role registryに登録された役割 |

roleには`npc_spawn`、`bit_spawn`、`assembly`、`no_enemy_spawn`、`no_enemy_enter`、`no_combat`、`hazard`、`water`を使用できる。`water`は水面ではなく、水中判定に用いる閉じた3D領域を表す。B03-1の学校資産は、プール内面に一致する`VOL_PoolWater`を1件持ち、`hs_id="pool-water"`、`hs_role="water"`とする。TypeScriptのrole登録とRuntime接続はT04-2Bで行う。

- Volumeの位置、回転、範囲はMesh形状を正本とする。
- boxの中心・幅・奥行・高さをpropertiesへ重複記述しない。
- 閉じたmanifold、外向き法線、自己交差なしとする。
- 1つの凹形状へまとめず、凸形状へ分割する。複数Volumeを同じ`hs_role`で使用してよい。
- `VOL_*`は物理衝突、光線遮蔽、NavMesh生成へ使用しない。
- `water` Volumeは水面表示Meshと分離し、プール壁・底の内側だけを閉じた形状で覆う。

`BND_Stage`はちょうど1個の明示的な閉じた低ポリMeshとする。プレイヤーが存在してよい3D空間を囲み、上下限も持つ。`BND_Stage`はout-of-bounds判定用であり、物理壁ではない。移動を止める必要がある位置には別の`COL_*`を置く。

`BND_Stage`の必須properties:

```text
hs_id = "stage"
hs_role = "playable_boundary"
```

### 7.7 `PRT_*`

`PRT_*`はroom接続、streaming境界、明示的なdoor triggerなどが必要な場合だけ作る薄い閉じたMeshである。通常扉を表すためだけには作らない。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | 一意なportal ID |
| `hs_role` | string | `room_portal`、`streaming_portal`、`door_trigger`のいずれか |

`room_portal`と`streaming_portal`で接続先の論理領域が必要な場合は、`hs_from`と`hs_to`へ非空間IDを置く。Portal Mesh自体を衝突やNavMesh接続に使用しない。`bit_window`と`bit_roof`はポータルではなく特殊経路であるため、`PRT_*`では表さず`LNK_*`だけを使用する。

### 7.8 `LNK_<id>_A/B`

`LNK_*`は、連続NavMeshで表せない梯子、昇降機、テレポート、ビット通過窓、ビット屋上接近の接続だけに使用する。1つのlinkは次のEmpty 2個で構成する。

```text
LNK_<id>_A
LNK_<id>_B
```

両端で同じ値を持つ必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | Object名の`<id>`と対応するlink ID |
| `hs_link_kind` | string | `ladder`、`elevator`、`teleport`、`bit_window`、`bit_roof`のいずれか |
| `hs_bidirectional` | boolean | 双方向接続か |
| `hs_link_radius_m` | number | endpointをNavMeshへ接続する半径。メートル |

各端の必須property `hs_endpoint`は、`LNK_<id>_A`で`A`、`LNK_<id>_B`で`B`とする。片端だけのlink、値が一致しないpair、3個以上の同一IDを認めない。

`bit_window`と`bit_roof`には次の追加契約を適用する。

- どちらもビット専用かつ双方向必須とし、両端の`hs_bidirectional`を`true`にする。プレイヤーとNPCの経路グラフへ加えない。
- `bit_window`は指定した開いた窓または割れた窓だけに置き、A/B双方の`hs_link_kind`を`bit_window`とする。Aを屋外の通常飛行高度にある安全な待機位置、Bを室内の床相対高度にある安全な待機位置とし、A/B間の固定経路が窓開口中央を通るようにする。
- `bit_roof`はA/B双方の`hs_link_kind`を`bit_roof`とし、Aを屋外の安全な待機位置、Bを屋上の安全な着地点とする。屋上への接近と通常移動範囲への帰還を同じpairで表す。屋上は窓の設置対象外だが、ゲームプレイ、NavMesh、索敵、標的追跡、戦闘の対象外ではない。
- 固定経路上の最高高度はA/Bの高い方を超えない。通常の床・階段用NavMeshを特殊接続の途中へ直結しない。
- 窓枠、庇、外壁、手すり、屋上構造物を含む固定経路の全区間で、ビット本体と銃口を含む半径約0.44mに0.10mの安全余裕を加え、最低でも半径0.54m以上の空きを確保する。最大揺れ幅を含む移動包絡がこれより大きい場合は、その包絡に0.10mを加えた側を採用する。
- カーペット編隊を通すために開口または屋上経路を広げない。Runtimeは特殊接続へ入る前に編隊を解除する。

通常階段、踊り場、通常扉には`LNK_*`を使用しない。窓または屋上の通過判定を`PRT_*`で重複表現しない。旧案の`LINK_*`は無効であり、`LNK_*`へ統一する。

## 8. Object custom propertiesとglTF Node `extras`

Object custom propertiesは、glTF exporterのCustom Properties出力を有効にしてNode `extras`へ保存する。Mesh Data、Material、Collectionのpropertiesを実行時契約に使用しない。

- 実行時propertyは`hs_`接頭辞を必須とする。
- property名はASCII snake_caseとする。
- 型はstring、boolean、有限number、integerに限定する。
- IDは空文字、前後空白、大文字、重複を認めない。
- `position_x`、`bounds`、`cells`、座標配列など、Object TransformやMesh形状と重複する空間データを置かない。
- `hs_link_radius_m`のようにEmptyの形状だけでは表現できない役割固有の単一値は認める。
- 未登録の`hs_*` property、型不一致、Node `extras`への未出力を監査失敗とする。
- 接頭辞から決まる分類をpropertyで上書きしない。たとえば`VIS_*`へ衝突roleを付けてもColliderにはならない。

## 9. GLB書き出し

通常ステージの確定設定:

- 形式: glTF Binary（`.glb`）
- 対象: `EXP_Stage_<stage-id>` Export Collectionだけ
- Y-up: 有効
- Export scale: `1.0`
- Custom Properties / `extras`: 有効
- Camera: 出力しない
- Light: 出力しない
- Animation: 出力しない
- Transform適用済みの実メートル形状を出力する
- `VIS_*`用Materialは出力する
- `COL_*`、`NAV_*`、`VOL_*`、`BND_*`、`PRT_*`はMaterialを持たなくてよい
- EmptyはNodeとして保持する

出力後にBlender Sceneだけを検査して完了としてはならない。GLB 2.0のJSON chunkとbufferを直接読み、Node名、Mesh名、Node `extras`、件数、Transform、参照関係を監査する。

## 10. Runtime分類集合

GLB読込後、作者Nodeを次の排他的集合へ分類する。

| 集合 | 入るObject |
|---|---|
| `visualMeshes` | `VIS_*` |
| `normalColliders` | 通常`COL_*` |
| `actorOnlyColliders` | `COL_ActorOnly_*` |
| `humanOnlyColliders` | `COL_HumanOnly_*` |
| `movementColliders.player` | 通常`COL_*`、`COL_ActorOnly_*`、`COL_HumanOnly_*` |
| `movementColliders.npc` | 通常`COL_*`、`COL_ActorOnly_*`、`COL_HumanOnly_*` |
| `movementColliders.bit` | 通常`COL_*`、`COL_ActorOnly_*` |
| `beamBlockers` | 通常`COL_*`だけ |
| `sightBlockers` | 通常`COL_*`だけ |
| `navSourceMeshes` | `NAV_*` |
| `metadataNode` | `META_Stage` |
| `markers` | `MRK_*` |
| `volumes` | `VOL_*` |
| `stageBoundary` | `BND_Stage` |
| `portals` | `PRT_*` |
| `links` | `LNK_*` |

分類順は`COL_ActorOnly_*`、`COL_HumanOnly_*`、通常`COL_*`、その他の順とする。通常`COL_*`の判定式は`name.startsWith("COL_") && !name.startsWith("COL_ActorOnly_") && !name.startsWith("COL_HumanOnly_")`と同値でなければならない。`links`はA/Bを`StageLinkPair`へ組み立て、`StageSpatialContext.links`の`StageLinkRegistry`として公開する。

すべての作者Nodeがちょうど1つの役割集合へ入り、未分類Nodeと重複分類Nodeが0件であることを要求する。glTFローダーの管理ルートとAssetContainer管理親は作者Nodeではないため、この監査から除外する。

## 11. GLB監査

通常ステージGLBは、NavMeshベイク前と配布ビルド前に次をすべて満たす。

### 11.1 コンテナ

- GLB 2.0 headerとchunk長が正常である。
- Sceneは1件で、参照不能Node、Mesh、Accessor、BufferViewがない。
- Camera 0件、Light 0件、Animation 0件である。
- Object名とMesh Data名が一致し、名前が一意である。
- Export Collection外の制作Objectが混入していない。

### 11.2 必須Object

- `META_Stage`がEmptyとして1件だけ存在する。
- `BND_Stage`が閉じたMeshとして1件だけ存在する。
- `MRK_*`の`player_spawn`が1件だけ存在する。
- `NAV_*`の`hs_nav_role=walkable`が1件以上存在する。
- 学校で有効にする各ゲームシステムに必要なmarker roleとvolume roleが存在する。
- `LNK_*`はA/Bが完全なpairである。`PRT_*`と`LNK_*`は必要な場合だけ存在してよい。`bit_window`と`bit_roof`を使う設計箇所では対応する`LNK_*` pairが存在し、両端の`hs_bidirectional=true`が一致する。
- B03-1の学校資産では、校舎1～4階、階段下、体育館、屋上階段室を含む全屋内について、ビットが入り得る範囲の直上を覆う天井`COL_*`が存在し、天井Collider欠落が0件である。

### 11.3 形状とTransform

- Mesh Objectのscaleは`(1, 1, 1)`、rotationは`(0, 0, 0)`である。
- 全Transform、頂点、法線、boundsが有限値である。
- `COL_*`、`VOL_*`、`BND_Stage`、`PRT_*`の必須閉形状に非manifold、自己交差、反転法線がない。
- `MRK_*`と`LNK_*` Emptyのscaleは`(1, 1, 1)`である。
- `BND_Stage`が必須marker、volume、link endpointを内包する。
- `bit_window`／`bit_roof`のA/B間全区間へ半径0.54mの移動包絡を通し、窓枠、壁、庇、外壁、手すり、屋上構造物との交差が0件である。

### 11.4 `extras`と意味

- 必須Object custom propertiesがglTF Node `extras`へ同じ型と値で出力されている。
- `META_Stage.hs_stage_id`がTypeScriptカタログIDと一致する。
- `META_Stage.hs_nav_profile`がベイクプロファイルIDと一致する。
- `hs_id`が役割横断で一意である。ただし同一`LNK_*` pairのA/Bだけは同じIDを持つ。
- `bit_window`と`bit_roof`はビット専用kindとして登録され、`hs_bidirectional=true`である。
- 未登録role、未登録`hs_*` property、座標の重複記述がない。

### 11.5 分類

- 作者Nodeの未分類0件、重複分類0件である。
- `COL_ActorOnly_*`が全移動者の`movementColliders`へ入り、`beamBlockers`と`sightBlockers`へ入らない。
- `COL_HumanOnly_*`がプレイヤー・NPCの`movementColliders`だけへ入り、ビットの`movementColliders`、`beamBlockers`、`sightBlockers`へ入らない。
- 天井`COL_*`が通常Colliderとしてビットの`movementColliders`へ入り、屋内の天井被覆検査に合格する。
- `NAV_*`、`VOL_*`、`BND_Stage`、`PRT_*`が表示、移動衝突、光線遮蔽へ入らない。
- `VIS_*`がActor衝突と光線遮蔽へ入らない。

監査違反は警告ではなくビルド失敗とする。未知Objectを`VIS_*`や`COL_*`へ推測分類しない。

## 12. Recast NavMesh派生物

NavMeshベイクの入力は、監査済みの同一GLBに含まれる`NAV_*` Meshと、`META_Stage.hs_nav_profile`が指すversion付きベイクプロファイルだけである。`LNK_<id>_A/B`はNavMeshバイナリへ焼き込まず、同じGLBからRuntimeが読み、両端を読み込んだNavMesh面へ投影して`surface`経路間の`transition`として加える。

- `VIS_*`や`COL_*`を暗黙のベイク入力にしない。
- GLBへRuntime管理親の`0.25`縮尺を適用したworld座標でベイクする。
- `walkableHeight`、`walkableClimb`、`walkableRadius`などのRecast値はversion付き共通プロファイルで固定する。
- 各`LNK_*`端点の直下に、`hs_link_radius_m`以内で接続できるNavMesh面が存在することをGLBとNavMeshの組で検証する。
- 通常Web版・Electron版は事前ベイク済みバイナリを読むだけとし、起動時生成を行わない。
- 実行時生成はベイク結果比較用の開発ツールに限定し、バイナリ欠落時のフォールバックにしない。
- GLB SHA-256、ベイクプロファイルIDとhash、Recast実装version、NavMesh SHA-256を監査記録へ残す。
- GLBまたはプロファイルが変わった場合、NavMesh未再生成を監査失敗とする。
- NavMeshバイナリを手編集しない。

## 13. 読み込みと破棄

Runtimeの詳細契約は`docs/spec_stage_runtime_v2.md`を正本とする。資産側では次を要求する。

1. GLB、Node `extras`、NavMeshの監査が完了するまでステージを利用可能にしない。
2. `VIS_*`だけを表示し、役割集合ごとの衝突・pickable設定を最初の描画前に適用する。
3. NavMeshバイナリは`NavigationWorld`が所有し、GLBのAssetContainerと同じステージライフサイクルで破棄する。
4. ステージ破棄はAssetContainer単位で行い、作者Mesh、Empty、Material、Texture、管理ルートの参照を残さない。
5. 再読込時は新しいAssetContainerとNavigationWorldを作り、名前、件数、world bounds、hash、必須roleが初回と一致することを確認する。

GLB読込で生成される`EnvironmentBRDFTexture`はBabylon.jsのScene共有資源として扱う。Stage側は明示破棄せず、Sceneのライフサイクルへ委ねる。

## 14. T01基準コース

T01は本書の座標、縮尺、表示・衝突分離を確定した検証fixtureである。通常ステージ用の`META_*`、`NAV_*`、`MRK_*`、`VOL_*`、`BND_*`、`PRT_*`、`LNK_*`を持たないため、通常ステージ監査へ合格させてはならない。

コース外形は9m x 10mで、玄関相当の小段差、廊下相当の壁・天井、階段室相当の階段・踊り場を3レーンへ配置する。

| VIS | COL | Blender寸法・高さ | Babylon実測 |
|---|---|---|---|
| `VIS_FloorBase` | `COL_FloorBase` | 9m x 10m、上面Z=0m | 2.25 x 2.50、上面Y=0 |
| `VIS_Step015` | `COL_Step015` | 高さ0.15m | 高さ0.0375 |
| `VIS_Slope` | `COL_Slope` | 1:4、終端高0.8m | 中央面高0.1000 |
| `VIS_SlopeLanding` | `COL_SlopeLanding` | 上面高0.8m | 上面高0.2000 |
| `VIS_Stairs` | `COL_StairRamp` | 6段、蹴上0.15m、踏面0.30m、ランプ1:2 | ランプ中央面高0.1125 |
| `VIS_StairLanding` | `COL_StairLanding` | 上面高0.9m | 上面高0.2250 |
| `VIS_WallStop` | `COL_WallStop` | 高さ2.4m | 高さ0.6000 |
| `VIS_CeilingLow` | `COL_CeilingLow` | 下面高2.1m | 下面高0.5250 |

T01 GLBはNode 16件、Mesh 16件、Material 6件である。VIS 8件、COL 8件、独立検証画面の自動検査28項目がPASSした。

垂直衝突は、期待する`COL_*`通知、Rayで得た幾何学面高、`moveWithCollisions()`後のprobe停止Yを別々に確認した。

| 対象 | 衝突先 | 面または停止位置 | 結果 |
|---|---|---:|---|
| 平面床 | `COL_FloorBase` | 面Y=0、probeY=0.002121 | PASS |
| 15cm段差 | `COL_Step015` | 面Y=0.0375、probeY=0.039621 | PASS |
| 斜面中央 | `COL_Slope` | 面Y=0.1000、probeY=0.098760 | PASS |
| 斜面踊り場 | `COL_SlopeLanding` | 面Y=0.2000、probeY=0.202121 | PASS |
| 階段ランプ中央 | `COL_StairRamp` | 面Y=0.1125、probeY=0.100991 | PASS |
| 階段踊り場 | `COL_StairLanding` | 面Y=0.2250、probeY=0.227121 | PASS |
| 壁 | `COL_WallStop` | stopZ=-1.599、期待値-1.600 | PASS |
| 天井 | `COL_CeilingLow` | stopY=0.098636、期待値0.100758 | PASS |

初回読込後のAssetContainer破棄、Scene残存Node・Mesh・Material・Texture 0件、再読込後の名前・件数・world bounds一致、ブラウザwarning/error 0件を確認した。

検証画面:

```powershell
npm run dev:t01
npm run build:t01
```

## 15. 当面の対象と移行条件

- 当面の通常ゲーム対象は学校だけとする。
- B02学校blockoutには`VIS_*`、`COL_*`に加えて`META_*`、`NAV_*`、`MRK_*`、`VOL_*`、`BND_*`を追加済みであり、事前ベイクNavMeshと組み合わせてRuntime移行を行う。
- `PRT_*`は既存のroom、streaming、door trigger用途だけに使用できる。B03では承認済みの開いた窓・割れた窓へ`COL_HumanOnly_Window_*`と`bit_window` pairを、屋外と屋上の承認済み接続箇所へ`bit_roof` pairを追加し、これらを`PRT_*`では表さない。
- 屋上は窓の設置対象外であるだけで、B03以後もプレイ可能空間と経路対象に含める。
- T04は`StageMoverKind`、高さ付きNavMesh位置、通常面と特殊接続を分けた経路、移動者別Collider、link registryまでの共通基盤を担当する。B03資産を使う学校複数階回帰はT04-2B、ビットの床相対高度・天井・衝突安全と窓／屋上の実飛行はT05-1、完成戦闘と全光線はT05-2、学校全域の統合確認はT06で行う。
- 舞台階段の形状ディテールと同色面の境界表現はB03で仕上げる。
- 既存8ステージのJSONはV2実行経路から除外し、互換アダプターを作らない。
- 既存ステージを将来再導入する場合は、ステージごとに`.blend`、規約準拠GLB、事前ベイクNavMeshを作り、通常ステージ監査へ合格させる。
- JSON文字マップをGLB欠落時の代替、NavMesh生成の補助、テストfixtureの正本として残さない。
