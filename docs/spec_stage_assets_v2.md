# HAIGURE SURVIVAL v2 ステージ資産仕様書

更新日: 2026-07-18
対象バージョン: v2
基準検証: T01 GLB・座標・衝突規約 技術検証

## 1. 文書の位置付け

本書は、HAIGURE SURVIVAL v2で使用するBlender編集元とゲーム用GLBの資産規約を定義する。Blenderは表示形状と衝突形状を担当し、ナビゲーション、スポーン、ゾーン、ステージ固有設定はステージJSONが担当する。

本規約はT01の小型テストコースで実測した結果を正本とする。任意のGLBへ対応する互換処理や、規約外メッシュを読み替えるフォールバックは作らない。

## 2. ファイル配置

v2ステージ資産は次のように配置する。

```text
assets/blender/v2/<タスクまたはステージID>/<資産名>.blend
public/stage-assets/v2/<タスクまたはステージID>/<資産名>.glb
```

T01の基準資産:

| 用途 | パス | 容量 |
|---|---|---:|
| Blender編集元 | `assets/blender/v2/T01/t01_glb_collision_course.blend` | 104,573 bytes |
| ゲーム用GLB | `public/stage-assets/v2/T01/t01_glb_collision_course.glb` | 27,216 bytes |

`.blend`はVite配布物へ含めず、GLBだけを`public`からWeb版・Electron版へコピーする。T01資産はテクスチャ非同梱の小型バイナリであるため、Git LFSを導入せず通常Gitで管理する。

検証専用Viteでは、`publicDir`をリポジトリ全体の`public`へ向けない。検証対象の資産ディレクトリだけを公開範囲にし、既存ゲームの画像・音声・ステージデータを検証用`dist`へ複製しない。ビルド後は検証用`dist`のファイル一覧と容量を確認し、対象GLBが公開元と同一SHA-256であることを検査する。

## 3. Blender制作座標

- 単位系: Metric
- Unit Scale: `1.0`
- 長さ単位: Meters
- `1 Blender unit = 1m`
- X: 右が正
- Y: 制作上の前方が正
- Z: 上が正
- ステージ原点: 基準入口中央の床上面
- 配置完了時のObject scale: `(1, 1, 1)`
- 配置完了時のObject rotation: `(0, 0, 0)`。回転が必要な形状は適用してから出力する

T01ではBlender 5.2.0 LTSとglTF exporter 5.2.39を使用した。`export_yup=true`で、BlenderからGLB内glTFへの変換は次のとおり実測した。

```text
(X_blender, Y_blender, Z_blender)
  → (X_gltf, Y_gltf, Z_gltf)
  = (X_blender, Z_blender, -Y_blender)
```

GLB内の距離倍率は`1.0`であり、メートル寸法を維持する。

## 4. Babylon.js座標と縮尺

Babylon.js 6.49.0の既定左手系へGLBを読み込み、AssetContainerの管理親へ`0.25`の一様縮尺を適用した最終対応は次のとおりである。

```text
(X_blender, Y_blender, Z_blender)
  → (X_babylon, Y_babylon, Z_babylon)
  = (-0.25 * X_blender, 0.25 * Z_blender, -0.25 * Y_blender)
```

| Blender | Babylon |
|---|---|
| `+X` | `-X` |
| `+Y` | `-Z` |
| `+Z` | `+Y` |
| 1m | 0.25ワールド単位 |

軸変換は、Blender、glTF exporter、Babylon.js、`@babylonjs/loaders`の仕様やバージョンから推測だけで確定しない。新しい検証環境または設定変更後は、左右・前後・上下を区別できる非対称な基準点を持つGLBを実ブラウザで読み込み、world座標とworld boundsを測定して最終符号を確定する。GLBのJSON解析だけを最終判定には使用しない。実測結果が本節と異なる場合は、後続実装へ進む前に本書を更新する。

縮尺はGLBや作者メッシュへ焼き込まず、次の順序で適用する。

1. `@babylonjs/loaders/glTF`を登録する。
2. `SceneLoader.LoadAssetContainerAsync`でGLBをAssetContainerへ読む。
3. `AssetContainer.createRootMesh()`で作者データの外側へ管理親を追加する。
4. 追加した管理親へ`0.25`の一様縮尺を設定する。
5. glTFローダーが生成した座標変換用ルートは変更しない。
6. `addAllToScene()`後、最初の描画前にVIS/COL設定を適用する。

## 5. メッシュ命名

頂点を持つ作者メッシュは、Object名とMesh Data名の両方を次の規則へ統一する。

| 接頭辞 | 役割 | Babylon表示 | Babylon衝突 |
|---|---|---|---|
| `VIS_` | プレイヤーに見せる表示形状 | 表示 | 無効 |
| `COL_` | 簡略化した衝突形状 | 非表示 | 有効 |

適用例:

```text
VIS_Stairs
COL_StairRamp
```

頂点を持つ作者メッシュに接頭辞なしの名前を認めない。glTFローダーの`__root__`とAssetContainer管理親など、頂点を持たない管理ルートだけを命名検査から除外する。

Babylon.jsでは次の設定を適用する。

```text
VIS_: setEnabled(true), isVisible=true,  checkCollisions=false
COL_: setEnabled(true), isVisible=false, checkCollisions=true
```

`COL_`は衝突を維持するため`setEnabled(false)`にしない。デバッグ表示時だけ`isVisible`を切り替える。

## 6. 衝突形状

- 表示形状と衝突形状を別メッシュにする。
- `COL_`は閉じた低ポリゴン形状とし、法線を外向きにする。
- `COL_`はBlender上でWire表示にしてよいが、viewport/renderから除外せずGLBへ含める。
- 壁、天井、床、段差、斜面、踊り場には、それぞれ対応する`COL_`を用意する。
- 表示階段`VIS_Stairs`へ衝突を設定しない。
- 階段移動には、踏面を覆う連続斜面`COL_StairRamp`だけを使用する。
- `COL_Stairs`のような段ごとの階段コライダーは作らない。

急なランプへ楕円体が接触したとき、楕円体の足元座標は接触法線の影響で真上の幾何学面高と一致しない。幾何学面高は垂直レイ、実衝突は`moveWithCollisions`の衝突先で別々に検証する。

## 7. GLB書き出し

T01で確定した設定:

- 形式: glTF Binary（`.glb`）
- Y-up: 有効
- Export scale: `1.0`
- 選択した16メッシュだけを書き出す
- Camera: 出力しない
- Light: 出力しない
- Animation: 出力しない
- Transform適用済みの実メートル形状を出力する
- `VIS_`用マテリアルは出力する
- `COL_`はマテリアルを持たなくてもよい

出力後はGLB 2.0ヘッダー、Node名、Mesh名、件数を検査する。T01 GLBはNode 16件、Mesh 16件、Material 6件である。

## 8. 読み込みと破棄

読込後は頂点を持つメッシュを列挙し、すべてが`VIS_`または`COL_`であることを検査する。未知接頭辞をVISやCOLへ読み替えない。

ステージ破棄はAssetContainer単位で行う。

1. `removeAllFromScene()`でコンテナ所有物をシーンから外す。
2. `dispose()`でMesh、Material、Texture、管理ルートを破棄する。
3. 作者メッシュ、`createRootMesh()`で追加した管理親、glTF管理ルートを含む全Mesh／TransformNode参照が`isDisposed()`になり、シーンに残っていないことを確認する。コンテナ由来Material名、Texture名もシーンに残っていないことを確認する。
4. 再読込時は新しいAssetContainerを作り、初回と同じ命名、件数、world boundsになることを確認する。

## 9. T01基準コース

コース外形は9m×10mで、玄関相当の小段差、廊下相当の壁・天井、階段室相当の階段・踊り場を3レーンへ配置する。学校本体の間取りや外観ではなく、後続ロジックのための技術検証資産である。

| VIS | COL | Blender寸法・高さ | Babylon実測 |
|---|---|---|---|
| `VIS_FloorBase` | `COL_FloorBase` | 9m×10m、上面Z=0m | 2.25×2.50、上面Y=0 |
| `VIS_Step015` | `COL_Step015` | 高さ0.15m | 高さ0.0375 |
| `VIS_Slope` | `COL_Slope` | 1:4、終端高0.8m | 中央面高0.1000 |
| `VIS_SlopeLanding` | `COL_SlopeLanding` | 上面高0.8m | 上面高0.2000 |
| `VIS_Stairs` | `COL_StairRamp` | 6段、蹴上0.15m、踏面0.30m、ランプ1:2 | ランプ中央面高0.1125 |
| `VIS_StairLanding` | `COL_StairLanding` | 上面高0.9m | 上面高0.2250 |
| `VIS_WallStop` | `COL_WallStop` | 高さ2.4m | 高さ0.6000 |
| `VIS_CeilingLow` | `COL_CeilingLow` | 下面高2.1m | 下面高0.5250 |

## 10. T01検証結果

検証環境:

| 要素 | バージョン |
|---|---|
| Blender | 5.2.0 LTS |
| Blender glTF exporter | 5.2.39 |
| Babylon.js Core | 6.49.0 |
| Babylon.js Loaders | 6.49.0 |

縮尺・境界寸法の一致判定には許容誤差`1e-4`を使用した。現行プレイヤー相当の幅0.2・高さ約0.424242の楕円体プローブを使用した。

垂直衝突は、期待した`COL_`の通知、Rayで得た幾何学面高、`moveWithCollisions()`後のプローブ停止Yの3条件をすべて満たした場合だけPASSとする。プローブ停止位置と壁・天井の停止位置には許容誤差`0.004`を使用する。

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

- VIS 8件・COL 8件の命名と設定を確認した。
- 初回読込後にAssetContainerを破棄し、管理親とglTF管理ルートを含む全管理ノードが`isDisposed()`となり、Scene残存Node、Mesh、Material、Textureがすべて0件になることを確認した。
- 再読込後の名前、件数、world boundsが初回と一致した。
- 独立検証画面の自動検査28項目がすべてPASSした。
- COL表示切替、手動破棄、手動再読込もPASSした。
- ブラウザコンソールのwarning/errorは0件だった。

検証画面は次のコマンドで起動する。

```powershell
npm run dev:t01
```

既定URLは`http://127.0.0.1:5176/`である。型検査と本番ビルドは`npm run build:t01`で実行する。

## 11. T01対象外

次は本書の規約を利用する後続タスクで扱い、T01では実装していない。

- 既存8ステージのv2形式への移行
- 共通ステージローダーへの統合
- ナビゲーション、スポーン、ゾーン定義の追加
- プレイヤーの重力、接地、段差・階段移動
- NPCの高さ付きナビゲーション
- ビットと光線の高さ・3D衝突対応
- 学校の間取り、ブロックアウト、ローポリ仕上げ
