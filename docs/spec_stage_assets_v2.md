# HAIGURE SURVIVAL v2 ステージ資産仕様書

更新日: 2026-07-19
対象バージョン: v2
基準検証: T01 GLB・座標・衝突規約 技術検証

## 1. 文書の位置付け

本書は、HAIGURE SURVIVAL v2で使用するBlender編集元、ゲーム用GLB、Recast NavMesh派生物の資産契約を定義する。

V2のステージ空間の正本は、GLBへ出力された3D形状、EmptyのTransform、Object custom properties由来のglTF Node `extras`である。表示、物理衝突、光線遮蔽、NavMesh生成元、スポーン位置、ゲームプレイ領域、ステージ境界、ポータル、非連続接続を同じ座標系の資産として管理する。

ステージJSONは使用しない。JSON文字マップ、セル、行・列、矩形ゾーンなどへ空間を重複記述してはならない。TypeScriptのステージカタログが保持できるのは、ステージID、表示名、GLB URL、NavMesh URL、整合性検査用ハッシュなどの非空間情報だけである。

Recast NavMeshバイナリはGLBの`NAV_*`形状と`LNK_*` Emptyから生成する派生物であり、編集元ではない。NavMeshを変更したい場合はBlender資産またはベイクプロファイルを変更し、GLB監査後に再ベイクする。

本規約は規約準拠資産だけを扱う。未知の接頭辞、欠落した必須Object、未知の`hs_*` propertyを読み替える互換処理やフォールバックは作らない。

## 2. 正本と派生物

| 対象 | 役割 | 正本性 |
|---|---|---|
| `.blend` | 制作者が編集する資産 | 編集正本 |
| `.glb` | 実行時に読む3D形状、Transform、Node `extras` | 実行時の空間正本 |
| `.navmesh.bin` | `NAV_*`、`LNK_*`、固定ベイクプロファイルから生成したRecastデータ | 再生成可能な派生物 |
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

当面の通常ゲーム対象は学校だけである。T01とB02の現行ファイルは技術検証・制作途中の資産であり、本書の通常ステージ必須Objectをすべて満たす完成資産ではない。

| 用途 | パス | 状態 |
|---|---|---|
| T01 Blender編集元 | `assets/blender/v2/T01/t01_glb_collision_course.blend` | 座標・縮尺・衝突の検証fixture |
| T01 GLB | `public/stage-assets/v2/T01/t01_glb_collision_course.glb` | 座標・縮尺・衝突の検証fixture |
| B02 Blender編集元 | `assets/blender/v2/B02/b02_school_blockout.blend` | 学校の制作元。空間Object追加前 |
| B02 GLB | `public/stage-assets/v2/B02/b02_school_blockout.glb` | 学校の制作途中。通常ステージとして未適合 |

`.blend`はVite配布物へ含めない。GLBとNavMeshバイナリだけを`public`からWeb版・Electron版へコピーする。バイナリ資産は単一担当で編集し、同一ファイルを複数ブランチで並行編集しない。

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

| 接頭辞・固定名 | Blender型 | 役割 | 表示 | Actor衝突 | 光線・視線遮蔽 | NavMeshベイク |
|---|---|---|---|---|---|---|
| `VIS_*` | Mesh | プレイヤーに見せる形状 | 有効 | 無効 | 無効 | 不使用 |
| `COL_*` | Mesh | 通常の不可視衝突 | 無効 | 有効 | 有効 | 不使用 |
| `COL_ActorOnly_*` | Mesh | 移動体専用の不可視衝突 | 無効 | 有効 | 無効 | 不使用 |
| `NAV_*` | Mesh | Recastベイク入力 | 無効 | 無効 | 無効 | 使用 |
| `META_Stage` | Empty | ステージ全体メタデータ | 無効 | 無効 | 無効 | 不使用 |
| `MRK_*` | Empty | 位置と向きを持つマーカー | 無効 | 無効 | 無効 | 不使用 |
| `VOL_*` | 閉じたMesh | ゲームプレイ領域 | 無効 | 無効 | 無効 | 不使用 |
| `BND_Stage` | 閉じたMesh | プレイ可能空間の外周境界 | 無効 | 無効 | 無効 | 不使用 |
| `PRT_*` | 薄い閉じたMesh | room、streaming、door trigger等のポータル | 無効 | 無効 | 無効 | 不使用 |
| `LNK_<id>_A/B` | Empty 2個 | 連続NavMeshで表せない接続点対 | 無効 | 無効 | 無効 | 使用 |

`COL_ActorOnly_*`は`COL_*`より長い接頭辞を先に判定し、排他的に分類する。`COL_ActorOnly_*`を通常`COL_*`へも重複登録してはならない。

### 7.1 `VIS_*`

- 表示形状だけを持ち、`checkCollisions=false`とする。
- 物理衝突やゲーム判定を表示Meshへ依存させない。
- 透明ガラスは`VIS_WindowGlass_*`とし、ガラスMaterialを共有して透明Object数を抑える。
- `VIS_*`を光線・視線の遮蔽Meshとして使用しない。

### 7.2 `COL_*`と`COL_ActorOnly_*`

- 表示形状と衝突形状を別Meshにする。
- 閉じた低ポリ形状とし、法線を外向きにする。
- 壁、床、天井、段差、斜面、踊り場へ対応する`COL_*`を用意する。
- 表示階段へ衝突を設定せず、踏面を覆う連続斜面`COL_StairRamp_*`を使用する。
- `COL_Stairs_*`のような段ごとの階段Colliderは作らない。
- `COL_*`はActor、ビーム、視線のすべてを遮る。
- `COL_ActorOnly_*`はプレイヤー、NPC、ビットなどの移動体だけを止め、通常光線、固定光線、トラップ光線、視線から除外する。
- 不可視でも衝突を維持するため、Runtimeでは`setEnabled(false)`にせず、`isVisible=false`とする。

学校窓は、壁を実際に開口し、次の3層へ分離する。

| Object | 役割 |
|---|---|
| `VIS_WindowFrame_*` | 低ポリ窓枠 |
| `VIS_WindowGlass_*` | 薄い透明ガラス表示 |
| `COL_ActorOnly_Window_*` | 窓開口を塞ぐ移動体専用衝突 |

窓位置でNavMeshが連結しないよう、必要な`NAV_*` blockerも別途用意する。`COL_ActorOnly_Window_*`をNavMeshベイク入力へ流用しない。

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

初期roleには`npc_spawn`、`bit_spawn`、`assembly`、`no_enemy_spawn`、`no_enemy_enter`、`no_combat`、`hazard`を使用できる。追加roleはRuntime側registryと本書を同時に更新してから使用する。

- Volumeの位置、回転、範囲はMesh形状を正本とする。
- boxの中心・幅・奥行・高さをpropertiesへ重複記述しない。
- 閉じたmanifold、外向き法線、自己交差なしとする。
- 1つの凹形状へまとめず、凸形状へ分割する。複数Volumeを同じ`hs_role`で使用してよい。
- `VOL_*`は物理衝突、光線遮蔽、NavMesh生成へ使用しない。

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

`room_portal`と`streaming_portal`で接続先の論理領域が必要な場合は、`hs_from`と`hs_to`へ非空間IDを置く。Portal Mesh自体を衝突やNavMesh接続に使用しない。

### 7.8 `LNK_<id>_A/B`

`LNK_*`は、連続NavMeshで表せない梯子、昇降機、テレポートなどの接続だけに使用する。1つのlinkは次のEmpty 2個で構成する。

```text
LNK_<id>_A
LNK_<id>_B
```

両端で同じ値を持つ必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | Object名の`<id>`と対応するlink ID |
| `hs_link_kind` | string | `ladder`、`elevator`、`teleport`のいずれか |
| `hs_bidirectional` | boolean | 双方向接続か |
| `hs_link_radius_m` | number | endpointをNavMeshへ接続する半径。メートル |

各端の必須property `hs_endpoint`は、`LNK_<id>_A`で`A`、`LNK_<id>_B`で`B`とする。片端だけのlink、値が一致しないpair、3個以上の同一IDを認めない。

通常階段、踊り場、通常扉には`LNK_*`を使用しない。旧案の`LINK_*`は無効であり、`LNK_*`へ統一する。

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
| `actorColliders` | 通常`COL_*`と`COL_ActorOnly_*` |
| `beamBlockers` | 通常`COL_*`だけ |
| `lineOfSightBlockers` | 通常`COL_*`だけ |
| `navigationBakeSources` | `NAV_*` |
| `metadataNode` | `META_Stage` |
| `markers` | `MRK_*` |
| `volumes` | `VOL_*` |
| `stageBoundary` | `BND_Stage` |
| `portals` | `PRT_*` |
| `links` | `LNK_*` |

分類順は`COL_ActorOnly_*`、通常`COL_*`、その他の順とする。通常`COL_*`の判定式は`name.startsWith("COL_") && !name.startsWith("COL_ActorOnly_")`と同値でなければならない。

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
- `LNK_*`はA/Bが完全なpairである。`PRT_*`と`LNK_*`は必要な場合だけ存在してよい。

### 11.3 形状とTransform

- Mesh Objectのscaleは`(1, 1, 1)`、rotationは`(0, 0, 0)`である。
- 全Transform、頂点、法線、boundsが有限値である。
- `COL_*`、`VOL_*`、`BND_Stage`、`PRT_*`の必須閉形状に非manifold、自己交差、反転法線がない。
- `MRK_*`と`LNK_*` Emptyのscaleは`(1, 1, 1)`である。
- `BND_Stage`が必須markerとvolumeを内包する。

### 11.4 `extras`と意味

- 必須Object custom propertiesがglTF Node `extras`へ同じ型と値で出力されている。
- `META_Stage.hs_stage_id`がTypeScriptカタログIDと一致する。
- `META_Stage.hs_nav_profile`がベイクプロファイルIDと一致する。
- `hs_id`が役割横断で一意である。ただし同一`LNK_*` pairのA/Bだけは同じIDを持つ。
- 未登録role、未登録`hs_*` property、座標の重複記述がない。

### 11.5 分類

- 作者Nodeの未分類0件、重複分類0件である。
- `COL_ActorOnly_*`が`actorColliders`だけに入り、`beamBlockers`と`lineOfSightBlockers`へ入らない。
- `NAV_*`、`VOL_*`、`BND_Stage`、`PRT_*`が表示、Actor衝突、光線遮蔽へ入らない。
- `VIS_*`がActor衝突と光線遮蔽へ入らない。

監査違反は警告ではなくビルド失敗とする。未知Objectを`VIS_*`や`COL_*`へ推測分類しない。

## 12. Recast NavMesh派生物

NavMeshベイクの入力は、監査済みの同一GLBに含まれる`NAV_*` Mesh、`LNK_<id>_A/B` Empty、`META_Stage.hs_nav_profile`が指すversion付きベイクプロファイルだけである。

- `VIS_*`や`COL_*`を暗黙のベイク入力にしない。
- GLBへRuntime管理親の`0.25`縮尺を適用したworld座標でベイクする。
- `walkableHeight`、`walkableClimb`、`walkableRadius`などのRecast値はversion付き共通プロファイルで固定する。
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
- B02学校blockoutは`VIS_*`と`COL_*`の制作基盤として利用し、通常ゲームへ登録する前に本書の`META_*`、`NAV_*`、`MRK_*`、`VOL_*`、`BND_*`を追加する。
- `PRT_*`と`LNK_*`は学校の設計上必要な場合だけ追加する。
- 既存8ステージのJSONはV2実行経路から除外し、互換アダプターを作らない。
- 既存ステージを将来再導入する場合は、ステージごとに`.blend`、規約準拠GLB、事前ベイクNavMeshを作り、通常ステージ監査へ合格させる。
- JSON文字マップをGLB欠落時の代替、NavMesh生成の補助、テストfixtureの正本として残さない。
