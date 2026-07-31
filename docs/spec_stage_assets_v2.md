# HAIGURE SURVIVAL v2 ステージ資産仕様書

更新日: 2026-07-28
対象バージョン: v2
基準検証: T01 GLB・座標・衝突規約 技術検証

## 1. 文書の位置付け

本書は、HAIGURE SURVIVAL v2で使用するBlender編集元、ゲーム用GLB、Recast NavMesh派生物の資産契約を定義する。

V2のステージ空間の正本は、GLBへ出力された3D形状、EmptyのTransform、Object custom properties由来のglTF Node `extras`である。表示、物理衝突、光線遮蔽、NavMesh生成元、スポーン位置、ゲームプレイ領域、ステージ境界、ポータル、非連続接続を同じ座標系の資産として管理する。

ステージJSONは使用しない。JSON文字マップ、セル、行・列、矩形ゾーンなどへ空間を重複記述してはならない。TypeScriptのステージカタログが保持できるのは、ステージID、表示名、GLB URL、静的人間用NavMesh URL、部屋variant NavMesh bundle URL、ビット用NavMesh bundle URL、プロファイルID、整合性検査用ハッシュ、深度プリパス対象Material名などの非空間情報だけである。

Recast NavMeshバイナリはGLBの`NAV_*`形状から生成する派生物であり、編集元ではない。人間用NavMeshは静的基盤と部屋variantごとのDetour tile payload bundleへ分離し、ビット用NavMeshは帯ごとのRecast payloadを別bundleへ格納する。`LNK_*` Emptyと飛行遷移`VOL_*`は最終GLBに残る明示接続の正本であり、Runtimeが対応するNavMeshへ接続する。NavMeshを変更したい場合はBlender資産またはベイクプロファイルを変更し、GLB監査後に対応成果物を再ベイクする。

本規約は規約準拠資産だけを扱う。未知の接頭辞、欠落した必須Object、未知の`hs_*` propertyを読み替える互換処理やフォールバックは作らない。

## 2. 正本と派生物

| 対象 | 役割 | 正本性 |
|---|---|---|
| `.blend` | 制作者が編集する資産 | 編集正本 |
| `.glb` | 実行時に読む3D形状、Transform、Node `extras` | 実行時の空間正本 |
| `.navmesh.bin` | `hs_nav_set=human`の静的`NAV_*`から生成し、部屋所有tileを除外したtiled Recastデータ | 再生成可能な派生物 |
| `.room-variants.navmesh.bin` | 20室×2 variantの人間用Detour tile payloadを格納したbundle | 再生成可能な派生物 |
| `.bit-flight.navmesh.bin` | `hs_nav_set=bit-flight`の帯別Recast payloadを格納したbundle | 再生成可能な派生物 |
| TypeScriptカタログ | ID、表示名、URL、ハッシュ、形式バージョン | 非空間情報だけ |
| ステージJSON | V2では使用しない | 禁止 |

`.blend`とGLBが一致しない場合、実行時の監査対象はGLBである。ただし不一致をGLB側の手修正で解消してはならず、`.blend`を修正してGLBとNavMeshを再出力する。

## 3. ファイル配置

通常ステージ資産は次のように配置する。

```text
assets/blender/v2/<ステージID>/<資産名>.blend
public/stage-assets/v2/<ステージID>/<資産名>.glb
public/stage-assets/v2/<ステージID>/<資産名>.navmesh.bin
public/stage-assets/v2/<ステージID>/<資産名>.room-variants.navmesh.bin
public/stage-assets/v2/<ステージID>/<資産名>.bit-flight.navmesh.bin
```

当面の通常ゲーム対象は学校だけである。T01は技術検証fixtureであり、B02学校は本書の空間Object契約と事前ベイクNavMeshを備えた実ゲーム移行中の資産である。

| 用途 | パス | 状態 |
|---|---|---|
| T01 Blender編集元 | `assets/blender/v2/T01/t01_glb_collision_course.blend` | 座標・縮尺・衝突の検証fixture |
| T01 GLB | `public/stage-assets/v2/T01/t01_glb_collision_course.glb` | 座標・縮尺・衝突の検証fixture |
| B02 Blender編集元 | `assets/blender/v2/B02/b02_school_blockout.blend` | 学校の制作元。3D意味ObjectとNavMesh生成元を保持 |
| B02 GLB | `public/stage-assets/v2/B02/b02_school_blockout.glb` | 学校の実行時空間正本。B03-2内装、T04-2B NAV補正、第5次人間受入、学校3D資産全体リファクタリングを統合済み |
| B02静的NavMesh | `public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin` | 同一GLBから事前ベイクするtiled Recast静的基盤 |
| B02部屋variant NavMesh | `public/stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin` | 同一GLBから20室×2 variantを事前ベイクするDetour tile bundle |
| B02ビットNavMesh | `public/stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin` | 同一GLBから帯別に事前ベイクするRecast bundle |

`.blend`はVite配布物へ含めない。GLBと3種のNavMeshバイナリだけを`public`からWeb版・Electron版へコピーする。バイナリ資産は単一担当で編集し、同一ファイルを複数ブランチで並行編集しない。

### 3.1 B02学校の現行監査基準

- T05-1Aでは既存`VIS_*`472件と`COL_*`325件の形状を維持し、`NAV_BitFlight_*`、飛行遷移`VOL_*`、58組の窓`aperture` metadataを追加する。
- 窓`LNK_*`は58組／116端点とし、A/Bの2端点、双方向、`hs_link_radius_m=0.54`、接続先ゾーン・帯を明示する。`hs_link_radius_m`はV1物理半径0.44m＋安全余裕0.10mに一致する必要包絡・接続半径であり、ビット本体半径ではない。旧`bit_roof`2組／4端点は完全廃止する。
- 修正案1では、V1実形状・被弾球の半径0.44mへ安全余裕0.10mを加えた移動包絡半径0.54m、直径1.08mを正本とする。B03承認時の片羽開放幅1.20mは両羽全開へ変更せず維持し、58窓を窓枠・進入角度まで含む実飛行Agentで双方向116/116に再検証済みとする。旧0.64m包絡・直径1.28mを根拠とした未解決扱いと、両羽全開の承認待ちは廃止する。
- 主玄関、北側校舎北口、北側校舎南口、体育館校庭側は、総高0.30m、各蹴上0.15m、各踏面1.00mの表示2段を共通断面とする。移動衝突は表示段と分離し、地面Z＝-0.30mから床Z＝0.00mへ続く単一の`COL_*Ramp`とする。渡り廊下東西側は表示段を置かず、不可視の`COL_BridgeSideRamp_East`と`COL_BridgeSideRamp_West`で同じ床高差を連続接続する。
- 男女トイレは各3個室とし、内部仕切りは厚さ0.08m、奥行2.10m、高さ2.10mの`VIS_ToiletStallPartition_*`と`COL_ToiletStallPartition_*`を一致させる。個室扉は蝶番から自由端まで1.40mとして開口を閉じ、通路側だけに半径0.06mの丸ノブを付ける。男子小便器3基は背面を東、正面を西へ向け、X＝-2.75～-2.40m、中心Y＝39.6／40.6／41.6mへ配置する。
- 校庭の`VIS_SiteGround`と`VIS_CourtyardSurface`は草地を表す緑、校門は塀と識別できる青とする。体育館は床を明るい木色、舞台を濃茶、腰壁を淡緑、見切りを濃灰として、同一色の面が重なる箇所を分離する。出入口上部の`VIS_*Lintel`は壁色へ統一する。
- 主門と北東門は左右対称の両開き柵形状とし、支柱、上下・中桟、縦桟、中央継ぎを持つ。表示の隙間は意匠だけであり、既存`COL_Gate_*`と`NAV_Blocker_Perimeter`によって移動、NPC、通常ビーム、視線をすべて遮断する。外周7区画は向こう側を見せない連続壁芯を維持し、0.8m×0.4mの5段ブロックと交互目地を外面へ表示する。
- 主玄関前の校庭には下駄箱や用途不明の箱を置かない。下駄箱代替は`BaggageLocker` 2台を建物内南壁際へ配置し、出入口を塞がない。図書室の本棚24台は本の背表紙を室内へ向けて壁際へ並べ、前後の出入口と窓へ干渉させない。本棚1台は本体8部品と背表紙28冊の計36 components／432 trianglesとする。
- 3階・4階の北側特別教室は2階と同じく、トイレ、通路、境界壁、特別教室の順に分離する。4階音楽室は東を前方としてピアノと30脚の椅子を配置する。1階北通用口は`BaggageLocker` 1台と傘立てを壁際へ置き、体育倉庫には表札を置かない。階色帯はF01が24成分、F02～F04が各23成分で、扉・開放部を左右1cmの余裕付きで除外する。
- 人間受入で確認した出入口足元の不要な骨組みは撤去し、表札は開口ではなく脇の建築壁へ支持させる。普通教室後方収納、教卓、放送機材、生徒会室家具、美術室家具、掲示板、体育館演説机の位置・向きと、全階トイレ開口、上階の階段手すり・吹抜け・階間構造・普通教室壁・階色帯を、通行と建築形状が一致する配置へ補正済みとする。
- 階段手すりの共有端点では表示支柱を座標単位で一意化し、転落防止範囲を変えずに重複支柱を生成しない。1階トイレ正面のNav blocker 6箱は`NAV_Blocker_Interiors`だけが所有し、`NAV_Blocker_School1F`へ二重収録しない。
- 学校正本はArmature、Bone、Action、Animation、Modifier、Shape Key、Vertex Group、非表示Object、Export Collection外Object、空・退化Meshを持たない。GLBはSkin、Animation、Camera、未参照Node／Mesh／Material／Texture／Image／Accessor／BufferView／Bufferを持たない。これらは残骸監査で非空なら失敗とする。不要性を証明できない面・同形状候補は削除せず、T04の人間確認候補一覧で管理する。
- 体育館舞台階段上部の東西表示壁・衝突壁は、舞台上面からBlender 2.4mの実開口を一致して確保する。NavMeshだけを接続する仮connector面は資産へ残さない。
- 体育館舞台は中心X＝46.4mを維持してX＝40.6～52.2mの幅11.6mとする。舞台階段は西X＝39.1～40.6m、東X＝52.2～53.7mへ同じ段数・踏面・蹴上げで追従させ、階段上部壁の中心もX＝40.6m／52.2mへ揃える。舞台袖壁は西X＝39.2～40.6m、東X＝52.2～53.6mへ短縮し、既存の袖開口、U字階段、手すり、ギャラリー、体育館外形は維持する。
- `BND_Stage`のBlender範囲はX＝-18.4～63.2m、Y＝-12.3～51.3m、Z＝-0.5～19.0mとする。屋上帯の中心上限18.0mへ半径0.54mの移動包絡を加えても内包する。
- 事前ベイク後は、主玄関から3か所の1F踊り場、各階廊下・代表教室、全階男女トイレ入口、3階段それぞれの1F↔2F↔3F↔4F、北西階段の4F↔屋上、体育館・舞台・体育倉庫、屋上階段室、プールサイド、プール底を含む62代表経路が要求終点へ到達することを検査する。追加2経路は3階・4階のトイレ側通路から正規扉を通って特別教室へ入る。各階段の隣接階経路は指定踊り場を通り、25m以内でなければならない。部分経路を成功扱いせず、要求終点との誤差`1e-5`以下を必須とする。通常窓の内外を結ぶsurface経路が窓開口を短絡せず正規出入口へ迂回することも必須とする。
- 全116窓端点はID文字列や高さから接続先を推測せず、各端点が明示するゾーン・帯のNavMeshへ投影する。体育館高窓14端点は7.10mの開口を一時通過して体育館上段へ接続する。
- T05-1A成果物は`.blend` 1,798,182 bytes／SHA-256 `C409334204D58FCA67F2A5701CB7E663F74785F0FB602118B0DA3C3D4C88248B`、GLB 11,383,492 bytes／`6ADA95BFE63DF055A47E63338A31E61FF7E3A0A1E96A6499AC4482F7EBB2EFD0`、人間用NavMesh 512,900 bytes／`0FCF0B136D41E23202925EB8821270C39D18EFEE37A5146F20C9BFA97C03C869`、ビット用bundle 549,695 bytes／`4032750F29FB95549AEB77A35ABB1B69C9AC7A8D07F03CAE3E46A9E37D465830`である。学校GLBと両NavMeshは同じ入力から2回連続生成し、bytesとSHA-256が一致することを確認済みである。

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
| `BND_WorldLimit` | 閉じたMesh | 表示・BIT・光線の最終世界境界 | 無効 | 無効 | 無効 | 不使用 |
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
- 通常`COL_*`はプレイヤー、NPC、ビットの移動と全光線、視線のすべてを遮る。
- `COL_ActorOnly_*`はプレイヤー、NPC、ビットの全移動体を止め、視線と全光線を通す。
- `COL_HumanOnly_*`はプレイヤーとNPCだけを止め、ビット、視線、全光線を通す。
- 不可視でも衝突を維持するため、Runtimeでは`setEnabled(false)`にせず、`isVisible=false`とする。

学校窓は壁を実際に開口し、表示と移動衝突を分離する。

| 窓 | 表示Object | 衝突Object | 移動・光線契約 |
|---|---|---|---|
| 閉じた窓 | `VIS_WindowFrame_*`と`VIS_WindowGlass_*` | `COL_ActorOnly_Window_*` | プレイヤー・NPC・ビットを止め、視線と全光線を通す |
| 指定した開いた窓または割れた窓 | 開口状態に対応する`VIS_WindowFrame_*`、残るガラス羽の`VIS_WindowGlass_*` | 残るガラス羽の`COL_ActorOnly_WindowFixed_*`と実開口の`COL_HumanOnly_Window_*` | 閉じた羽は全移動体を止め、実開口はプレイヤー・NPCを止めてビットを通す。どちらも視線・全光線を通す |

ビット通過窓は見た目が開いた窓か割れた窓かにかかわらず、Runtimeでは`hs_transition_kind="aperture"`の同一契約で扱う。Collider名だけで経路を推測せず、必ず7.8節のビット用`LNK_<id>_A/B`を組み合わせる。閉じた窓へ`aperture`を置いてはならない。

窓位置で通常の床・階段NavMeshが連結しないよう、必要な`NAV_*` blockerも別途用意する。`COL_ActorOnly_Window_*`、`COL_ActorOnly_WindowFixed_*`、`COL_HumanOnly_Window_*`をNavMeshベイク入力へ流用しない。

### 7.3 `NAV_*`とナビゲーションセット

`NAV_*`はRecast NavMeshを生成するためだけの低ポリMeshである。`VIS_*`、`COL_*`から自動抽出せず、ベイク入力を明示する。

すべての`NAV_*` Objectは`hs_nav_set`を持ち、`human`または`bit-flight`を明示する。人間用ベイクとビット用ベイクは自分のsetだけを抽出し、別setへフォールバックしない。

人間用`NAV_*`は従来どおり`hs_nav_role`を次のいずれかで持つ。

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

ビット用`NAV_BitFlight_*`は、同一飛行帯内の横移動面を表し、次のpropertiesを持つ。

| Key | 型 | 内容 |
|---|---|---|
| `hs_nav_set` | string | `bit-flight` |
| `hs_nav_role` | string | 中心飛行面は`walkable`、障害形状は`blocker` |
| `hs_zone_id` | string | ステージ資産が定義するopaqueなゾーンID |
| `hs_band_id` | string | ゾーン内で一意なopaqueな帯ID |
| `hs_space_kind` | string | `indoor`または`outdoor` |
| `hs_center_height_min_m` | number | Blender絶対Zで表す許可中心高度下限 |
| `hs_center_height_max_m` | number | Blender絶対Zで表す許可中心高度上限 |

- 同一ゾーン・帯を複数Meshで構成してよいが、space kindと高度範囲は全Meshで完全一致させる。
- 各帯は1件以上の`walkable`を持つ。許可中心高度の全域を半径0.54mの移動包絡（V1物理半径0.44m＋安全余裕0.10m）で塞ぎ、帯内のどの高度でも上越し・下越しできない通常`COL_*`と`COL_ActorOnly_*`だけを、2D帯NavMeshの`blocker`として含める。帯内の一部高度だけを塞ぐ机などは2D経路を消さず、T05-1Bの高度決定と3D移動包絡で回避する。該当する全高障害物がない帯では`blocker`を要求しない。`COL_HumanOnly_*`はビット用blockerへ含めない。
- 帯数、ゾーン数、階高、ID形式、上下順を固定しない。地下、中二階、吹き抜け、段違い床、不均一階高も同じ契約で定義する。
- 異なる帯は別Recast payloadへベイクする。位置や高さが重なっても、明示遷移なしにpayload間を接続しない。
- ビット用プロファイルはV1実形状・被弾球の物理半径0.44mと安全余裕0.10m、合計0.54mの移動包絡を前提とする。Runtimeの3D移動包絡を最終権威として維持する。

### 7.4 `META_Stage`

`META_Stage`はExport Collection内にちょうど1個置く単一Emptyである。locationとrotationを`(0, 0, 0)`、scaleを`(1, 1, 1)`とし、ステージ全体のObject `extras`を保持する。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_schema_version` | integer | 本資産契約のschema version。T05-1A以降は`2` |
| `hs_stage_id` | string | TypeScriptカタログのIDと完全一致するID |
| `hs_nav_profile` | string | 人間用ベイクに使用するversion付きRecastプロファイルID |
| `hs_bit_nav_profile` | string | ビット用ベイクに使用するversion付きRecastプロファイルID |

表示名、GLB URL、NavMesh URLは`META_Stage`へ置かず、TypeScriptカタログで管理する。座標配列、スポーン一覧、ゾーン一覧、セルマップを1つのpropertyへ埋め込んではならない。

### 7.5 `MRK_*`

`MRK_*`は点と向きを表すEmptyである。位置はEmptyのworld translation、向きはworld rotationを正本とする。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意な小文字kebab-case ID |
| `hs_role` | string | Runtimeのmarker role registryに登録された役割 |

`hs_role="assembly_anchor"`では、次のpropertiesも必須とする。各座標はBlenderメートル座標の有限値3要素配列を並べたJSON文字列であり、Runtime側へステージ固有の座標生成規則を重複実装しない。

| Key | 型 | 内容 |
|---|---|---|
| `hs_selection_weight` | number | 会場抽選に使う0より大きいweight |
| `hs_assembly_positions_json` | string | 最大人数で使用する集合位置のJSON座標配列 |
| `hs_execution_audience_positions_json` | string | 最大人数で使用する公開処刑観客位置のJSON座標配列 |
| `hs_execution_target_positions_json` | string | 最大人数で使用する公開処刑対象位置のJSON座標配列 |

例:

```text
MRK_PlayerSpawn_Main
  hs_id = "player-spawn-main"
  hs_role = "player_spawn"
```

学校の通常ゲーム資産は`player_spawn`をちょうど1個持つ。NPCやビットのランダム出現範囲は点の集合ではなく`VOL_*`で表す。位置やEuler角をpropertiesへ重複記述しない。
7.9節の動的資産では追加marker roleとして`elevator_call_indicator`を使用できる。

### 7.6 `VOL_*`と`BND_Stage`

`VOL_*`はスポーン、集合、進入禁止、危険領域などを表す閉じた低ポリMeshである。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意な小文字kebab-case ID |
| `hs_role` | string | Runtimeのvolume role registryに登録された役割 |

基本roleには`npc_spawn`、`bit_spawn`、`assembly`、`no_enemy_spawn`、`no_enemy_enter`、`no_combat`、`hazard`、`water`を使用できる。7.9節の動的資産では追加roleとして`door_sweep`、`elevator_call_mat`、`elevator_threshold`、`elevator_car_occupancy`を、7.10節の部屋variantでは`room_variant_tile`を使用できる。`water`は水面ではなく、水中判定に用いる閉じた3D領域を表す。学校資産は、プール内面に一致する`VOL_PoolWater`を1件持ち、`hs_id="pool-water"`、`hs_role="water"`とする。T04-2Bで読込、内外問い合わせ、プール底へのNavMesh到達、破棄・再読込を確認済みであり、水中水平速度50%と通常速度への復帰はT06で実装する。

`bit_spawn`は`hs_zone_id`と`hs_band_id`を追加し、スポーン先の飛行帯を明示する。高さ、Object名、最寄りの人間用NavMeshから推測しない。

`assembly`は`hs_anchor_id`を追加し、同じIDの`assembly_anchor` Markerを参照する。1個のMarkerと1個のVolumeを1会場として厳密に対応付け、参照先欠落、孤立Volume、1対多、多対1を許可しない。Marker位置と3座標配列の全点は、対応Volumeと`BND_Stage`の内側または表面になければならない。集合位置数は公開処刑観客位置数と対象位置数の合計に一致させる。

飛行帯・ゾーン間の連続的な遷移は、`hs_role="bit_flight_transition"`の閉じた`VOL_*`で表す。

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意な遷移ID |
| `hs_role` | string | `bit_flight_transition` |
| `hs_transition_kind` | string | `vertical`、`surface-route`、`boundary` |
| `hs_from_zone_id` / `hs_from_band_id` | string | from帯 |
| `hs_to_zone_id` / `hs_to_band_id` | string | to帯 |
| `hs_bidirectional` | boolean | 双方向か |
| `hs_affordances_json` | string | 登録済みAI意味タグのJSON文字列配列 |
| `hs_projection_distance_m` | number | 遷移候補から各帯NavMeshへ投影する最大距離 |
| `hs_route_points_json` | string | `surface-route`と障害物越え`boundary`で使用するBlender座標点列 |

`vertical`はVolume内の安全候補から上下移動位置を選ぶ。`surface-route`は階段・斜路・踊り場に沿う点列を必須とする。`boundary`は屋外・屋上・吹き抜けなどの境界横断を表す。学校、体育館、屋上などの名称をkindへ追加しない。

- Volumeの位置、回転、範囲はMesh形状を正本とする。
- boxの中心・幅・奥行・高さをpropertiesへ重複記述しない。
- 閉じたmanifold、外向き法線、自己交差なしとする。
- 1つの凹形状へまとめず、凸形状へ分割する。複数Volumeを同じ`hs_role`で使用してよい。
- `VOL_*`は物理衝突、光線遮蔽、NavMesh生成へ使用しない。
- `water` Volumeは水面表示Meshと分離し、プール壁・底の内側だけを閉じた形状で覆う。

#### 7.6.1 B02学校の集合・公開処刑会場

B02学校は校庭と体育館の2会場を持つ。`MRK_AssemblyAnchor_Courtyard`と`MRK_AssemblyAnchor_Gym`はいずれも`hs_selection_weight=1`とし、対応する`VOL_Assembly_Courtyard`と`VOL_Assembly_Gym`を`hs_anchor_id`で結ぶ。

作者座標配列は次を正本とする。`row`、`column`、`i`は0始まりで、記載順のままJSON配列へ格納する。

| 会場 | Anchor `(X, Y, Z)` | 集合100人 |
|---|---|---|
| 校庭 | `(16.7, 14.5, -0.30)` | `row=0..9`の各行について`column=0..9`を並べ、`(9.95 + 1.50 * column, 7.75 + 1.50 * row, -0.30)` |
| 体育館 | `(45.4, 9.5, 0.00)` | `row=0..9`の各行について`column=0..9`を並べ、`(39.325 + 1.35 * column, 3.425 + 1.35 * row, 0.00)` |

公開処刑観客94人は各Anchorの`(centerX, centerY, floorZ)`に対し、`i=0..93`の順で`(centerX + 9.0 * cos(2πi / 94), centerY + 9.0 * sin(2πi / 94), floorZ)`とする。対象6人は`yOffset=-0.45, 0.45`の順に、各行で`xOffset=-0.9, 0.0, 0.9`を並べた`(centerX + xOffset, centerY + yOffset, floorZ)`とする。したがって校庭と体育館の両方が、集合と公開処刑の全用途に利用できる。

座標移行後は次の制作目印をBlenderとGLBから削除し、Runtime資産として残さない。

- `VIS_CourtyardCapacityGrid_10x10`
- `VIS_GymCapacityGrid_10x10`
- `VIS_GymExecutionAudience_94`
- `VIS_GymExecutionTargets_06`

`BND_Stage`はちょうど1個の明示的な閉じた低ポリMeshとする。プレイヤーが存在してよい3D空間を囲み、上下限も持つ。`BND_Stage`はout-of-bounds判定用であり、物理壁ではない。移動を止める必要がある位置には別の`COL_*`を置く。

`BND_Stage`の必須properties:

```text
hs_id = "stage"
hs_role = "playable_boundary"
```

B04対応学校は、`BND_Stage`とは別に`BND_WorldLimit`をちょうど1個持つ。`BND_WorldLimit`は塀外の表示と光線が存在してよい最終空間を囲む、Blender X/Y/Z軸に平行でベベルのない閉じた直方体Meshとする。6面上の全頂点座標は各軸のminまたはmaxと一致させ、キャッシュするmin/maxと実Mesh境界を一致させる。プレイヤー・NPCの領域外判定、物理衝突、光線遮蔽、着弾面には使用しない。BITは既存の塀内飛行帯へ維持し、外周帯を持たない。

学校では、外周塀の外面から水平5.0m、上空Blender Z＝24.0mを基準とする。水平範囲は学校生成正本の外周塀外面から導出し、座標をRuntimeへ重複記述しない。外周表示は塀から歩道1.5m、その外側に道路3.5mを配置し、道路外端を地面表示の終端とする。

`BND_WorldLimit`の必須properties:

```text
hs_id = "world-limit"
hs_role = "world_boundary"
```

TypeScriptカタログの`worldBoundaryMode`は、B04対応学校とT05-2Vの対応fixtureで`required`、B04前の学校と非対応fixtureで`unsupported`とする。`required`は`BND_WorldLimit`を正確に1件要求し、`unsupported`は同Objectを持たない。B04では学校資産へのObject追加と同じ変更内で`unsupported`から`required`へ切り替える。

外周へ`player_spawn`、`npc_spawn`、`bit_spawn`を配置しない。人間用NavMeshとBIT用NavMeshは塀外へ延ばさず、外周用`NAV_BitFlight_*`と塀越え`boundary`遷移も追加しない。両NavMesh、通常探索、待機、総当たり探索、増援出現はすべて塀内へ維持する。

### 7.7 `PRT_*`

`PRT_*`はroom接続、streaming境界、明示的なdoor triggerなどが必要な場合だけ作る薄い閉じたMeshである。通常扉を表すためだけには作らない。

必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | 一意なportal ID |
| `hs_role` | string | `room_portal`、`streaming_portal`、`door_trigger`のいずれか |

`room_portal`と`streaming_portal`で接続先の論理領域が必要な場合は、`hs_from`と`hs_to`へ非空間IDを置く。Portal Mesh自体を衝突やNavMesh接続に使用しない。ビット用遷移を`PRT_*`へ重複登録しない。

### 7.8 `LNK_<id>_A/B`

`LNK_*`は、連続NavMeshで表せない梯子、昇降機、テレポート、ビット通過窓などの狭い開口接続だけに使用する。1つのlinkは次のEmpty 2個で構成する。

```text
LNK_<id>_A
LNK_<id>_B
```

両端で同じ値を持つ必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | Object名の`<id>`と対応するlink ID |
| `hs_link_kind` | string | 人間用は`ladder`、`elevator`、`teleport`のいずれか |
| `hs_bidirectional` | boolean | 双方向接続か |
| `hs_link_radius_m` | number | endpointをNavMeshへ接続する半径。メートル |

各端の必須property `hs_endpoint`は、`LNK_<id>_A`で`A`、`LNK_<id>_B`で`B`とする。片端だけのlink、値が一致しないpair、3個以上の同一IDを認めない。

ビット用`aperture` pairは`hs_link_kind`の代わりに次を両端へ持つ。

| Key | 型 | 内容 |
|---|---|---|
| `hs_transition_kind` | string | `aperture` |
| `hs_zone_id` / `hs_band_id` | string | その端点が接続する飛行帯 |
| `hs_bidirectional` | boolean | 双方向か |
| `hs_link_radius_m` | number | 必要移動包絡と一致する接続半径0.54m。ビット本体半径ではない |
| `hs_projection_distance_m` | number | 指定帯への投影距離 |
| `hs_affordances_json` | string | 意味タグJSON配列 |
| `hs_endpoint` | string | `A`または`B` |

- 学校の窓58組は双方向、`window-access`と`search-vantage`を持ち、Aを屋外帯、Bを校舎内帯または体育館上段へ明示接続する。
- 体育館高窓は開口中心7.10mを一時通過するが、接続後は体育館上段の許可高度へ戻る。
- 旧`bit_roof`2組／4端点は完全廃止する。屋上は4F屋外帯と屋上帯をつなぐ`boundary` Volumeで接続し、旧端点を優先地点やフォールバックへ流用しない。
- 窓枠、庇、外壁、手すり、屋上構造物を含む全遷移区間で、V1物理半径0.44mと安全余裕0.10mを合計した半径0.54mの移動包絡を確保する。
- カーペット編隊を通すために開口や境界を広げない。Runtimeは帯・ゾーン変更前に編隊を解除する。

通常階段は人間用には連続NavMesh、ビット用には明示`surface-route`として管理する。窓または境界の通過判定を`PRT_*`で重複表現しない。旧案の`LINK_*`は無効であり、狭い開口だけ`LNK_*`へ統一する。

### 7.9 動的扉・エレベーター

B03-3C以降の動的扉とエレベーターは、`MRK_*`のTransform、`VOL_*`の実形状、既存の`VIS_*`／`COL_*`子MeshをID参照で組み立てる。位置、閉姿勢、開姿勢、移動軸、回転軸、停止位置、マット範囲を数値`hs_*`へ重複記述しない。

#### 7.9.1 動的扉

動的扉1件は次の階層を必須とする。`<token>`はObject名を一意にするASCII識別子であり、Runtimeの参照はObject名解析ではなく`hs_id`で行う。

```text
MRK_Door_<token>
├─ MRK_DoorPanel_<token>          1件以上
│  ├─ VIS_DoorPanel_<token>       1件以上
│  ├─ VIS_DoorPanel_Handle_<token> roomだけ1件
│  ├─ VIS_DoorPanel_Knob_<token>   toilet_stallだけ1件
│  └─ COL_DoorPanel_<token>       1件以上
├─ MRK_DoorOpenPose_<token>       panelごとに1件
└─ VOL_DoorSweep_<token>          扉ごとに1件
```

`MRK_Door_*`の必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意なdoor ID |
| `hs_role` | string | `door` |
| `hs_door_class` | string | `room`、`toilet_stall`、`elevator_landing`、`elevator_car`のいずれか |
| `hs_sweep_id` | string | 同じ扉が所有する`door_sweep` VolumeのID |
| `hs_elevator_id` | string | elevator系だけ必須。所有する`elevator` ID |
| `hs_stop_id` | string | `elevator_landing`だけ必須。対応する`elevator_stop` ID |

`MRK_DoorPanel_*`の必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意なpanel ID |
| `hs_role` | string | `door_panel` |
| `hs_door_id` | string | 親`door` ID |
| `hs_motion_kind` | string | `slide`または`swing` |
| `hs_open_pose_id` | string | このpanel専用の`door_open_pose` ID |

`MRK_DoorOpenPose_*`は`hs_id`、`hs_role="door_open_pose"`、`hs_door_id`、`hs_panel_id`をすべてstringで持つ。`VOL_DoorSweep_*`は`hs_id`、`hs_role="door_sweep"`、`hs_door_id`をすべてstringで持つ。

- `MRK_DoorPanel_*`の親は対応する`MRK_Door_*`、表示・Collider・扉金物Meshの親は対応panel markerとする。`MRK_DoorOpenPose_*`と`VOL_DoorSweep_*`も同じdoor markerの直下に置く。
- panel markerのlocal Transformを閉姿勢、open-pose markerの同じdoorローカル座標系におけるTransformを開姿勢とする。子`VIS_*`／`COL_*`には`hs_*`を付けず、親子関係でpanelへ対応付ける。
- `slide`は閉・開markerのlocal rotationを一致させ、0ではないtranslation差分の正規化を移動軸、長さを移動量とする。`swing`はlocal translationを一致させ、panel markerのlocal `+Z`を蝶番軸、開markerまでの符号付きrotation差分を開角度とする。`swing`の絶対角度は0より大きくπ以下とする。
- `room`は`slide`、`toilet_stall`は`swing`、`elevator_landing`と`elevator_car`は`slide`だけを許可する。
- `VOL_DoorSweep_*`は全panelの閉姿勢から開姿勢までの掃引領域を覆う閉じた低ポリMeshとする。
- `room` panelは固定表の1.20m開口を閉姿勢で隙間なく閉じる。開姿勢だけ壁法線方向へ離し、厚さ0.08mのpanelと厚さ0.30mの隣接壁の間に0.01mの空隙を確保する。local offsetはwest壁の1階でX=-0.04m、2～4階でX=+0.08m、north壁の1階でY=+0.04m、2～4階でY=-0.04mとする。各panelは1.20mの移動主軸で見た開方向と反対側へpanel中心から0.45mの位置に、幅0.16m、高さ0.32m、面からの出幅0.02mの長方形取っ手を両面分まとめた`VIS_DoorPanel_Handle_*`を1件持つ。
- `toilet_stall` panelのlocal boundsは`(-1.40, -0.02, 0.00)`～`(0.00, 0.02, 1.80)`、sweepは`(-1.42, -0.02, 0.00)`～`(0.02, 1.42, 1.80)`とする。開姿勢のtranslationは閉姿勢と一致させ、local Z回転を`-85°`として仕切り壁との面一致を避ける。通路側local Y負面の`(-1.22, -0.075, 0.95)`を中心に半径0.06mの低ポリ丸ノブ`VIS_DoorPanel_Knob_*`を1件持つ。
- 固定開放扉、固定閉鎖扉、`elevator_landing`、`elevator_car`には`VIS_DoorPanel_Handle_*`／`VIS_DoorPanel_Knob_*`を付けない。扉金物は`VIS_*`だけで表し、Colliderや`hs_*`を持たせず、FurnitureProps Atlasの`door_hardware_yellow`（RGB 181／153／74）へ割り当てる。
- エレベーター扉は1.40m中央開口を4枚のテレスコープ式panelで閉じ、開姿勢では左右0.35m幅の戸袋へ2枚ずつ重ねる。panelは開姿勢で中央開口、かご外形、昇降路内寸から突出してはならない。
- 教室・トイレ扉の開閉0.8秒、エレベーター扉の開閉1.0秒はRuntime状態機械の定数とし、資産propertyへ重複させない。

#### 7.9.2 エレベーター

エレベーター1基は、controller、かご、稼働階2件、既存の人間用`LNK_*` pair、扉、占有・安全Volumeを次のID参照で結ぶ。

`MRK_Elevator_*`の必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意なelevator ID |
| `hs_role` | string | `elevator` |
| `hs_link_id` | string | `hs_link_kind="elevator"`の`LNK_*` pair ID |
| `hs_car_id` | string | `elevator_car` ID |
| `hs_car_door_id` | string | かご側`door` ID |
| `hs_occupancy_id` | string | `elevator_car_occupancy` Volume ID |
| `hs_passenger_origin_id` | string | `elevator_passenger_origin` ID |
| `hs_initial_stop_id` | string | 初期停止階の`elevator_stop` ID |

`MRK_ElevatorCar_*`は`hs_id`、`hs_role="elevator_car"`、`hs_elevator_id`をstringで持つ。かご本体の`VIS_ElevatorCar_*`と通常`COL_ElevatorCar_*`を各1件以上、このcar markerの直下に置く。かご側`MRK_Door_*`、`VOL_ElevatorCarOccupancy_*`、`MRK_ElevatorPassengerOrigin_*`もこのcar markerの子孫に置く。

稼働階ごとの`MRK_ElevatorStop_*`は次を持つ。

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | ステージ内で一意なstop ID |
| `hs_role` | string | `elevator_stop` |
| `hs_elevator_id` | string | 所有する`elevator` ID |
| `hs_link_id` | string | controllerと同じ人間用link ID |
| `hs_endpoint` | string | 1階は`A`、4階は`B` |
| `hs_floor_index` | integer | `1`または`4` |
| `hs_landing_door_id` | string | 乗場側`door` ID |
| `hs_call_mat_id` | string | `elevator_call_mat` Volume ID |
| `hs_call_indicator_id` | string | `elevator_call_indicator` Marker ID |
| `hs_threshold_id` | string | `elevator_threshold` Volume ID |
| `hs_gate_id` | string | `elevator_human_gate` ID |
| `hs_wait_id` | string | `elevator_wait` ID |

残る必須Objectとproperties:

| Object | 必須properties |
|---|---|
| `MRK_ElevatorPassengerOrigin_*` | `hs_id`、`hs_role="elevator_passenger_origin"`、`hs_elevator_id` |
| `MRK_ElevatorWait_*` | `hs_id`、`hs_role="elevator_wait"`、`hs_elevator_id`、`hs_stop_id` |
| `MRK_ElevatorHumanGate_*` | `hs_id`、`hs_role="elevator_human_gate"`、`hs_elevator_id`、`hs_stop_id` |
| `MRK_ElevatorCallIndicator_*` | `hs_id`、`hs_role="elevator_call_indicator"`、`hs_elevator_id`、`hs_stop_id`、`hs_direction="up"`または`"down"` |
| `VOL_ElevatorCallMat_*` | `hs_id`、`hs_role="elevator_call_mat"`、`hs_elevator_id`、`hs_stop_id` |
| `VOL_ElevatorThreshold_*` | `hs_id`、`hs_role="elevator_threshold"`、`hs_elevator_id`、`hs_stop_id` |
| `VOL_ElevatorCarOccupancy_*` | `hs_id`、`hs_role="elevator_car_occupancy"`、`hs_elevator_id` |

上表の`hs_id`と参照IDはstringである。`MRK_ElevatorHumanGate_*`の直下には対応する`COL_HumanOnly_ElevatorGate_*`を正確に1件置き、人物だけを遮断する。`MRK_ElevatorCallIndicator_*`の直下には`VIS_ElevatorCallIndicator_Base_*`と`VIS_ElevatorCallIndicator_Direction_*`を各1件置き、1階は`up`、4階は`down`とする。呼出マット、敷居、かご占有範囲は各`VOL_*`の閉じた実形状を正本とし、半径・AABBをpropertyへ置かない。

- `MRK_ElevatorStop_*`のworld Transformを、かごの停止姿勢とする。1階・4階stopはworld X/Yとrotationを一致させてBlender Zだけを変え、そのtranslation差分からかごの移動軸と移動量を導出する。
- stopのlocal `+Y`を乗場からかごへ向かう乗車方向、`-Y`を降車方向とする。乗客の相対座標は`MRK_ElevatorPassengerOrigin_*`のcar-local Transformを基準にする。
- かご床上面はcar-local Z=`0.12`とし、passenger originとoccupancy下端を同じ高さに置く。廊下床からかご床までの0.12m段差と水平隙間は、各stop直下の同形状`VIS_ElevatorThresholdPlate_*`／`COL_ElevatorThresholdPlate_*`で連結する。敷居は廊下側から0.24mで0.12m上がる約26.6度の斜面と、かご側の0.10m水平部を一つの閉形状にし、かご床前面を水平部終端まで後退させて乗降線上の垂直な衝突継ぎ目を作らない。開口幅は1.40mを維持する。
- `MRK_ElevatorWait_*`は対応call matとthresholdの外側へ水平0.25m以上離し、待機者がcall matを占有し続けない位置に置く。call matと対応する`VIS_ElevatorCallIndicator_Base_*`は、エレベーター側の既存端を維持して廊下側へ広げた水平1.5m×1.5mの同一形状とする。`VIS_ElevatorCallIndicator_Direction_*`は明色の塗りつぶし三角とし、乗場から見て1階は上向き、4階は下向きとする。
- controllerはstopを正確に2件持ち、1階=`A`、4階=`B`とする。`hs_initial_stop_id`は4階stopを参照し、car markerの初期Transformも同stopと一致させる。
- 各stopは乗場扉、呼出マット、呼出indicator、敷居、人物gate、待機markerを各1件所有する。かご扉、占有Volume、乗客基準はエレベーター全体で各1件とする。
- 2階・3階の固定閉鎖扉は通常の静的`VIS_*`／`COL_*`だけで表し、`door`、`elevator_stop`、call mat、threshold、gate、link endpointを持たせない。
- `hs_link_id`以外の参照IDは期待するroleのObject 1件へ解決する。`hs_link_id`は`hs_link_kind="elevator"`でA/B各1 Nodeからなる検証済み論理`StageLinkPair` 1件へ解決する。
- ownerとcomponentが相互参照する箇所は両方向のID一致を要求する。孤立component、規定外の参照、1 componentの複数door／elevator所有、異なるelevator間の参照、同一stop付随物の共有を認めない。

### 7.10 部屋variantとNavMesh tile所有

B03-3Cの対象は、9普通教室と11特別室の合計20室である。`hs_room_id`は次の固定IDだけを使用する。

```text
f02-classroom-01  f02-classroom-02  f02-classroom-03
f03-classroom-01  f03-classroom-02  f03-classroom-03
f04-classroom-01  f04-classroom-02  f04-classroom-03
f01-infirmary     f01-library       f01-staff-room
f01-pc-room       f02-council       f02-broadcast
f02-science       f03-art           f03-home-ec
f04-ll            f04-music
```

各室は`normal`と`disordered`を1件ずつ持ち、次のmarkerを合計40件配置する。

```text
MRK_RoomVariant_<token>
├─ VIS_*                         variantで切り替える表示だけ
├─ COL_*                         variantで切り替える通常Colliderだけ
├─ NAV_*_Blocker                 variantで切り替える人間用障害物
└─ NAV_*_Walkable                荒れ版だけが持つ歩行面
```

`MRK_RoomVariant_*`の必須properties:

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | `room-variant-<room-id>-<variant-id>`形式の一意ID |
| `hs_role` | string | `room_variant` |
| `hs_room_id` | string | 上記20件の固定room ID |
| `hs_variant_id` | string | `normal`または`disordered` |

- 建築、壁、床、天井、動的扉、エレベーター、意味Object、ビット用`NAV_*`はvariant rootの外へ残す。
- variant対象の作者Objectは最寄りの`room_variant` ancestorちょうど1件へ所属する。variantの入れ子、複数所属、子`VIS_*`／`COL_*`／`NAV_*`への`hs_room_id`・`hs_variant_id`重複記述を認めない。
- 現行内装の家具種・台数・決定的な乱れを`normal`として維持する。9普通教室の生徒机は30台を残したまま中段2行だけを室内中央から各0.20m外側へ移し、中央を横切るCollider間1.17m以上の連続通路を作る。`disordered`は決定的な1種類とし、普通教室では各室1台の通常机と同位置の机上物を荒れ版だけから除いて倒れ机の歩行面へ置換する。特別室は通常家具を除去せずに追加物を配置する。少なくとも1扉から室内中央と部屋スポーン受入点への経路を残す。
- 部屋スポーン受入点は下表の`roomBounds`水平中心から0.30m以内にあるactive variantのground polygon上で、対応door rootの床高から共通profileの`walkableClimb`以内にある最短点を、同じ`room_variant_tile`内から選ぶ監査用の決定点とする。家具上面を候補にしない。これは新しい作者markerやRuntime fallbackではない。同距離ならpoly ref昇順を採用し、同じ所有領域内に投影できなければ生成失敗とする。
- 椅子は人物通過可能とする。倒れた机・棚の歩行面は初段差0.15m以下、傾斜45度以下、Blender短辺1.20m以上（Runtime 0.30m以上）とし、表示、通常Collider、人間用`NAV_*_Walkable`を一致させる。大型家具は閉じた`NAV_*_Blocker`と通常Colliderを持ち、プレイヤー・NPC・BIT移動、ビーム、視線の動的空間集合へ見た目どおり反映する。

各室はvariant共通の`VOL_RoomVariantTile_<token>`を1件持つ。

| Key | 型 | 内容 |
|---|---|---|
| `hs_id` | string | `room-variant-tile-<room-id>`形式の一意ID |
| `hs_role` | string | `room_variant_tile` |
| `hs_room_id` | string | 所有する固定room ID |

`room_variant_tile`はvariant rootの外へ置き、固定グリッドtileの所有領域に一致する閉じたMeshとする。位置で頂点をweldした全edgeがちょうど2面に共有されるwatertightかつmanifoldな形状を必須とする。NavMesh三角形のベイク入力には使用せず、生成済みtileを静的基盤または1室へ排他的に割り当てるpartitionだけに使用する。全`room_variant_tile`の内面重複は0件とし、各Detour tile key `(tileX, tileY, layer)`は静的基盤または1室だけが所有する。同じ室の`normal`と`disordered`で生成keyが異なる場合は両者のunionをその室の所有keyとし、静的基盤へ同じkeyを残さない。variant切替時は旧variantの全entryをremoveしてから新variantの全entryをaddし、空tileを表すダミーpayload、欠落keyの補完、再生成fallbackを使用しない。

20室の動的扉は次の固定表で既存開口を網羅する。`roomBounds`と開口区間はBlender X/Yメートルで、west壁はY区間、north壁はX区間を表す。door IDは`room-door-<roomId>-<01始まり連番>`とする。

| roomId | roomBounds `(minX,maxX,minY,maxY)` | 壁 | 開口区間 | 件数 |
|---|---|---|---|---:|
| `f01-infirmary` | `(-12.45,-3.65,2.65,12.35)` | west | `3.10..4.30`, `10.70..11.90` | 2 |
| `f01-library` | `(-12.45,-3.65,12.65,32.35)` | west | `13.10..14.30`, `30.70..31.90` | 2 |
| `f01-staff-room` | `(5.55,23.25,36.65,45.35)` | north | `6.00..7.20`, `21.60..22.80` | 2 |
| `f01-pc-room` | `(23.55,41.25,36.65,45.35)` | north | `24.00..25.20`, `39.60..40.80` | 2 |
| `f02-classroom-01` | `(-12.45,-3.65,2.65,12.35)` | west | `3.10..4.30`, `10.70..11.90` | 2 |
| `f02-classroom-02` | `(-12.45,-3.65,12.65,22.35)` | west | `13.10..14.30`, `20.70..21.90` | 2 |
| `f02-classroom-03` | `(-12.45,-3.65,22.65,32.35)` | west | `23.10..24.30`, `30.70..31.90` | 2 |
| `f02-council` | `(5.55,14.25,36.65,45.35)` | north | `6.00..7.20` | 1 |
| `f02-broadcast` | `(14.55,23.25,36.65,45.35)` | north | `21.60..22.80` | 1 |
| `f02-science` | `(23.55,41.25,36.65,45.35)` | north | `24.00..25.20`, `39.60..40.80` | 2 |
| `f03-classroom-01` | `(-12.45,-3.65,2.65,12.35)` | west | `3.10..4.30`, `10.70..11.90` | 2 |
| `f03-classroom-02` | `(-12.45,-3.65,12.65,22.35)` | west | `13.10..14.30`, `20.70..21.90` | 2 |
| `f03-classroom-03` | `(-12.45,-3.65,22.65,32.35)` | west | `23.10..24.30`, `30.70..31.90` | 2 |
| `f03-art` | `(5.55,23.25,36.65,45.35)` | north | `6.00..7.20`, `21.60..22.80` | 2 |
| `f03-home-ec` | `(23.55,41.25,36.65,45.35)` | north | `24.00..25.20`, `39.60..40.80` | 2 |
| `f04-classroom-01` | `(-12.45,-3.65,2.65,12.35)` | west | `3.10..4.30`, `10.70..11.90` | 2 |
| `f04-classroom-02` | `(-12.45,-3.65,12.65,22.35)` | west | `13.10..14.30`, `20.70..21.90` | 2 |
| `f04-classroom-03` | `(-12.45,-3.65,22.65,32.35)` | west | `23.10..24.30`, `30.70..31.90` | 2 |
| `f04-ll` | `(5.55,23.25,36.65,45.35)` | north | `6.00..7.20`, `21.60..22.80` | 2 |
| `f04-music` | `(23.55,41.25,36.65,45.35)` | north | `24.00..25.20`, `39.60..40.80` | 2 |

普通教室9室は各2件、特別室は合計20件で、`room` doorは合計38件である。全階トイレは男女各3個室、4階分の`toilet_stall` doorを合計24件持つ。旧1階個別扉8件、旧上階結合扉3件、旧トイレ固定扉は残さない。校舎、体育館、渡り廊下の固定開放出入口は動的doorへ変換しない。

## 8. Object custom propertiesとglTF Node `extras`

Object custom propertiesは、glTF exporterのCustom Properties出力を有効にしてNode `extras`へ保存する。Mesh Data、Material、Collectionのpropertiesを実行時契約に使用しない。

- 実行時propertyは`hs_`接頭辞を必須とする。
- property名はASCII snake_caseとする。
- 型はstring、boolean、有限number、integerに限定する。
- `hs_id`は空文字、前後空白、大文字、重複を認めない。飛行ゾーンID・帯IDは前後空白のない非空opaque文字列とし、Runtimeは内容を解析しない。
- `position_x`、`bounds`、`cells`など、Object TransformやMesh形状と重複する空間データを置かない。階段・斜路・障害物越え境界の通過形状を表す`hs_route_points_json`だけは、遷移実行に必要な明示点列として認める。
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
| `navSourceMeshes` | `hs_nav_set=human`の`NAV_*` |
| `bitFlightNavSourceMeshes` | `hs_nav_set=bit-flight`の`NAV_BitFlight_*` |
| `metadataNode` | `META_Stage` |
| `markers` | `MRK_*` |
| `volumes` | 通常ゲーム用`VOL_*` |
| `bitFlightTransitions` | 飛行遷移用`VOL_*`と`LNK_*` |
| `stageBoundary` | `BND_Stage` |
| `worldBoundary` | `BND_WorldLimit`。B04対応ステージで必須 |
| `portals` | `PRT_*` |
| `links` | 人間用`LNK_*` |

分類順は`COL_ActorOnly_*`、`COL_HumanOnly_*`、通常`COL_*`、その他の順とする。通常`COL_*`の判定式は`name.startsWith("COL_") && !name.startsWith("COL_ActorOnly_") && !name.startsWith("COL_HumanOnly_")`と同値でなければならない。人間用pairだけを`StageSpatialContext.links`、ビット用pairとtransition Volumeを`StageSpatialContext.bitNavigation`へ公開する。

`assembly_anchor` Markerと`assembly` Volumeは上記の排他的分類後に`StageAssemblyVenueRegistry`へ1対1で組み立てる。Registryは作者座標配列と選択weightを公開するが、座標や会場名から役割を推測しない。

`door`、`door_panel`、`door_open_pose`、`door_sweep`は排他的な作者Object分類後に内部`StageDoorAssetRegistry`へ組み立てる。`elevator`とそのcar、stop、door、marker、呼出indicator、Volume、`LNK_*` pairは内部`StageElevatorAssetRegistry`へ組み立てる。両RegistryはID参照と親子関係を検証する派生索引であり、作者Objectを元の`visualMeshes`、Collider、marker、volume、link集合から重複分類して取り除かない。

`room_variant` Markerとその子孫、`room_variant_tile` Volumeは内部`StageRoomVariantAssetRegistry`へ組み立てる。Registryは20室×2 variant、最寄りancestorによる排他的所属、固定tile所有を検証する派生索引であり、作者Objectを接頭辞による一次集合から取り除かない。

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
- B04対応学校では`BND_WorldLimit`がBlender軸に平行でベベルのない閉じた直方体Meshとして1件だけ存在し、`BND_Stage`を内包する。水平終端は外周塀外面から5.0m、上端はBlender Z＝24.0mである。
- B04対応学校では外周の`player_spawn`、`npc_spawn`、`bit_spawn`、人間経路、BIT経路が0件であり、人間用NavMeshとBIT用NavMeshが外周歩道・道路へ延びていない。
- `MRK_*`の`player_spawn`が1件だけ存在する。
- B02学校では`assembly_anchor` Markerと`assembly` Volumeが各2件存在し、校庭・体育館の各pairが100件、94件、6件の有限座標配列を持つ。
- 集合会場の旧4件の`VIS_*`目印が0件である。
- 人間用`NAV_*`の`hs_nav_role=walkable`が1件以上、ビット用`NAV_BitFlight_*`が1件以上存在する。
- 学校で有効にする各ゲームシステムに必要なmarker roleとvolume roleが存在する。
- `LNK_*`はA/Bが完全なpairである。ビット用pairは両端の遷移方式、双方向性、半径、投影距離、意味タグが一致し、各端点のゾーン・帯が登録済みである。
- B03-1の学校資産では、校舎1～4階、階段下、体育館、屋上階段室を含む全屋内について、ビットが入り得る範囲の直上を覆う天井`COL_*`が存在し、天井Collider欠落が0件である。
- B03-3Cの各動的扉は`door`、1件以上のpanel、panelごとのopen pose、1件のsweep Volume、panelごとの表示・Colliderを持つ。classとmotion kind、親子関係、参照ID、閉・開Transformが7.9.1節に一致する。
- B03-3Cの`room` doorは固定表どおり38件、`toilet_stall` doorは24件である。旧1階個別室扉8件、旧上階結合室扉3件、旧トイレ固定扉は0件であり、固定開放出入口に動的door metadataがない。
- B03-3Cのエレベーターはcontroller、car、car直下のかご表示・通常Collider各1件以上、1階／4階stop、`elevator` link pair、かご扉、各階乗場扉、occupancy、passenger origin、各階call mat／call indicator／threshold／gate／waitを7.9.2節の件数で持つ。2階・3階の動的componentは0件である。
- B03-3Cの`room_variant` Markerは20室×2の40件、`room_variant_tile` Volumeは20件である。各variantは対象`VIS_*`、`COL_*`、人間用`NAV_*`を各1件以上持ち、静的建築・扉・エレベーター・意味Object・BIT用`NAV_*`を子孫に持たない。

### 11.3 形状とTransform

- Mesh Objectのscaleは`(1, 1, 1)`、rotationは`(0, 0, 0)`である。
- 全Transform、頂点、法線、boundsが有限値である。
- `COL_*`、`VOL_*`、`BND_Stage`、`PRT_*`の必須閉形状に非manifold、自己交差、反転法線がない。
- `MRK_*`と`LNK_*` Emptyのscaleは`(1, 1, 1)`である。
- `BND_Stage`が必須marker、volume、link endpointを内包する。
- 全飛行遷移区間へV1物理半径0.44m＋安全余裕0.10m＝半径0.54mの移動包絡を通し、窓枠、壁、庇、外壁、手すり、天井、屋上構造物との交差が0件である。
- 引き戸の閉・開rotation一致とtranslation差分、開き戸の閉・開translation一致とlocal `+Z`回転、エレベーターstopの同一X/Y・rotationとZ差分を検証し、数値軸・閉位置・開位置propertyが0件である。
- `BND_WorldLimit`の全頂点がX/Y/Zそれぞれのminまたはmaxの6面上にあり、キャッシュした軸平行min/maxと実Meshの内外判定・線分退出点が一致する。

### 11.4 `extras`と意味

- 必須Object custom propertiesがglTF Node `extras`へ同じ型と値で出力されている。
- `META_Stage.hs_stage_id`がTypeScriptカタログIDと一致する。
- `META_Stage.hs_nav_profile`がベイクプロファイルIDと一致する。
- `META_Stage.hs_bit_nav_profile`がビット用ベイクプロファイルIDと一致する。
- `hs_id`が役割横断で一意である。ただし同一`LNK_*` pairのA/Bだけは同じIDを持つ。
- 学校の窓58組がビット専用`aperture`として登録され、旧`bit_roof`は0件である。
- 未登録role、未登録`hs_*` property、座標の重複記述がない。
- 動的扉・エレベーターの`hs_link_id`以外の全参照が期待roleのObject 1件へ解決し、`hs_link_id`はA/B各1 Nodeの検証済み`elevator` StageLinkPair 1件へ解決する。規定されたowner／component相互参照は両方向一致し、孤立、規定外参照、多重所有、異なるelevator間参照が0件である。
- `hs_room_id`は固定20 IDだけ、`hs_variant_id`は`normal`／`disordered`だけである。各対象作者Objectの最寄りvariant ancestorは1件、nested variant、複数所属、子へのvariant property重複は0件である。

### 11.5 分類

- 作者Nodeの未分類0件、重複分類0件である。
- `COL_ActorOnly_*`が全移動者の`movementColliders`へ入り、`beamBlockers`と`sightBlockers`へ入らない。
- `COL_HumanOnly_*`がプレイヤー・NPCの`movementColliders`だけへ入り、ビットの`movementColliders`、`beamBlockers`、`sightBlockers`へ入らない。
- 天井`COL_*`が通常Colliderとしてビットの`movementColliders`へ入り、屋内の天井被覆検査に合格する。
- `NAV_*`、`VOL_*`、`BND_Stage`、`BND_WorldLimit`、`PRT_*`が表示、移動衝突、光線遮蔽へ入らない。
- `VIS_*`がActor衝突と光線遮蔽へ入らない。
- 動的扉・エレベーターの子`VIS_*`／`COL_*`は接頭辞どおりの一次集合へ入り、`StageDoorAssetRegistry`／`StageElevatorAssetRegistry`から同じMesh参照を取得できる。子Meshへ`hs_*`を重複付与しない。

監査違反は警告ではなくビルド失敗とする。未知Objectを`VIS_*`や`COL_*`へ推測分類しない。

## 12. Recast NavMesh派生物

NavMeshベイクの入力は、監査済みの同一GLBに含まれる各nav setと、`META_Stage`が指す対応version付きベイクプロファイルだけである。人間用linkとビット用遷移はNavMesh payloadへ焼き込まず、同じGLBからRuntimeが読み、対応グラフへ加える。

- B03-3C以降の人間用プロファイルIDは`school-humanoid-room-variants-v2`、generatorは`tiled`とする。固定bounds、origin、cell size、tile size、最大tile数、最大polygon数を静的基盤と40 variantの全ベイクで共有し、subset geometryから再計算しない。
- 静的common geometryは全校舎を同じ固定global bounds／共通parameterで一括ベイクし、階段・屋上・プール斜路を物理Y band境界で切断しない。抽出時はDetour source layerを物理Y下限から求めるstable layer keyへ正規化し、tile keyの重複、固定容量超過、再結合失敗を監査する。
- 静的`.navmesh.bin`は`room_variant_tile`所有keyをすべて除外する。variant bundleの各entryは、当該室の物理Y bandへ決定的にclipした静的`NAV_*`と当該室・当該variantの`NAV_*`を、静的基盤と同じ固定global bounds／共通parameterでベイクしたDetour tile payloadである。bundleへ格納するのは所有Volume内のtileだけとし、最終assemblyで静的基盤とのcross-owner edgeが双方向接続することを必須にする。
- 部屋variant bundleは24-byte little-endian header、BOMなしminified UTF-8 JSON manifest、raw Detour tile payload連結で構成する。magicは`HSRVNAV\0`、format versionは`1`とし、headerへversion、header長、manifest byte長、payload byte長、entry件数を格納する。
- manifestは`stageId`、`navProfileId`、`navMeshParams`、`entries`だけを持つ。`navMeshParams`は`origin`、`tileWidth`、`tileHeight`、`maxTiles`、`maxPolys`を持つ。各entryは`roomId`、`variantId`、`tileX`、`tileY`、`layer`、payload先頭相対の`offset`、`length`を持つ。
- entryは`roomId`、`variantId`、`tileY`、`tileX`、`layer`の順に安定sortする。空payload、範囲外、隙間、重複、未参照payload、Detour tile headerとmanifest座標の不一致を失敗にする。同じ室の通常・荒れentryのunionをその室の所有keyとし、静的基盤と20室の所有keyは排他的である。任意のroom／variant切替で旧entryの全keyを除去して新entryを追加できることを監査する。
- 40構成すべてで少なくとも1扉の室外点から家具上面を除いた室内中央ground polygonへの完結経路を必須とする。20室の`disordered`は床側probeから斜路低辺、斜路高辺までの2区間が両方完結しなければならない。room／static境界は両owner側から全cross-owner edgeを収集し、各edgeの逆向き接続と`normal`構成の期待portal集合に対する各variantの一致を検証する。
- 全20室`normal`の最終assemblyで、北西・北東・南西階段の各隣接階、北西階段4階から屋上、屋上からプールサイド、プールサイドからプール底、屋上プール折れ斜路から2階渡り廊下までを双方向に検証する。両端投影、完結したpolygon corridor、`DT_STRAIGHTPATH_ALL_CROSSINGS`の終端一致、距離上限を作者側監査で必須にする。
- `StageCatalogEntry.roomVariantNavmesh`は`{ mode: "unsupported" }`または`{ mode: "required"; url: string; sha256: string }`の判別可能unionとする。`unsupported`へURL・hashを持たせず、`required`だけがbundle URLと64桁SHA-256を必須とする。互換wrapper、欠落時fallback、Runtime再生成は追加しない。
- `VIS_*`や`COL_*`を暗黙のベイク入力にしない。
- GLBへRuntime管理親の`0.25`縮尺を適用したworld座標でベイクする。
- `walkableHeight`、`walkableClimb`、`walkableRadius`などのRecast値はversion付き共通プロファイルで固定する。
- 人間用linkは人間用NavMesh、ビット用apertureは各端点が明示する帯payloadへ投影できることを検証する。
- ビット用bundleは帯ごとのRecast payload、zone ID、band IDだけを保持し、空間定義はGLBを正本とする。bundleの欠落、余分、重複、空payload、区間重複・隙間を失敗にする。
- 通常Web版・Electron版は事前ベイク済みバイナリを読むだけとし、起動時生成を行わない。
- 実行時生成はベイク結果比較用の開発ツールに限定し、バイナリ欠落時のフォールバックにしない。
- GLB SHA-256、人間・ビット両ベイクプロファイルIDとhash、Recast実装version、静的人間NavMesh、部屋variant bundle、ビットNavMeshのSHA-256を監査記録へ残す。
- GLBまたはプロファイルが変わった場合、対応NavMesh未再生成を監査失敗とする。
- NavMeshバイナリを手編集しない。

## 13. 読み込みと破棄

Runtimeの詳細契約は`docs/spec_stage_runtime_v2.md`を正本とする。資産側では次を要求する。

1. GLB、Node `extras`、人間用NavMesh、ビット用bundleの監査が完了するまでステージを利用可能にしない。
2. `VIS_*`だけを表示し、役割集合ごとの衝突・pickable設定を最初の描画前に適用する。
3. 人間用NavMeshは`NavigationWorld`、全帯payloadは`BitFlightNavigationWorld`が所有し、GLBのAssetContainerと同じステージライフサイクルで破棄する。
4. ステージ破棄はAssetContainer単位で行い、作者Mesh、Empty、Material、Texture、管理ルートの参照を残さない。
5. 再読込時は新しいAssetContainer、NavigationWorld、BitFlightNavigationWorldを作り、名前、件数、world bounds、hash、必須roleが初回と一致することを確認する。

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
- B02学校は共通飛行契約の最初の利用データとして、屋外4帯、校舎内4帯、体育館2帯、屋上1帯と明示遷移をGLBへ持つ。
- `PRT_*`は既存のroom、streaming、door trigger用途だけに使用できる。窓58組はビット用`aperture`、屋上外周は`boundary`で表し、旧`bit_roof`は残さない。
- 屋上は窓の設置対象外であるだけで、B03以後もプレイ可能空間と経路対象に含める。
- T04は人間用高さ付きNavMeshとlink registry、T05-1Aは汎用飛行帯・別ビットNavMesh・接続グラフ・学校データ移行、T05-1BはV1飛行表現と3D安全・探索・追跡・実遷移を担当する。完成戦闘と全光線物理はT05-2、V1光線演出と世界境界終了はT05-2V、学校外周表示と`BND_WorldLimit`はB04、学校全域の統合確認はT06で行う。B04は外周BIT帯をT06へ引き渡さない。
- 舞台階段の形状ディテールと同色面の境界表現はB03で仕上げる。
- 既存8ステージのJSONはV2実行経路から除外し、互換アダプターを作らない。
- 既存ステージを将来再導入する場合は、ステージごとに`.blend`、規約準拠GLB、人間用NavMesh、必要な飛行帯・遷移・ビット用bundleを作り、通常ステージ監査へ合格させる。
- JSON文字マップをGLB欠落時の代替、NavMesh生成の補助、テストfixtureの正本として残さない。
