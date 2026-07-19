# HAIGURE SURVIVAL 旧T02 ステージJSON仕様書（V2廃止済み）

更新日: 2026-07-19
文書状態: 旧T02履歴（V2実行契約では廃止済み）
基準実装（履歴）: 旧`src/world/stageJson.ts`（V2移行で削除済み）

> [!CAUTION]
> 本書をV2の実行契約、実装要件、データ作成要件として参照してはならない。V2ではステージJSON、JSON文字マップ、セルナビゲーションを廃止し、これらへの互換処理も実装しない。

## 1. 文書の位置付け

本書は、旧T02で採用していたステージ定義JSONの仕様を履歴として保存するものである。以下に記載する`schemaVersion: 2`、`StageDefinitionV2`、`procedural-grid`、旧GLB用JSON、文字マップ、セル座標、セルナビゲーションはすべて廃止済みであり、V2の要件ではない。

V2のステージ実行契約は、現行の[V2ステージランタイム仕様書](./spec_stage_runtime_v2.md)を正本とする。V2はGLBの3D meshes／markers／volumes、事前ベイク済みRecast navmesh、TypeScriptの非空間カタログを使用し、対象ステージを学校のみに限定する。既存8ステージはV2対象外である。

以下の旧T02仕様は、当時の設計と実装を追跡する目的でのみ残す。

- `procedural-grid`: JSONの文字グリッドから床、壁、天井、衝突、鏡を生成する。
- `glb`: 規約準拠GLBから表示形状と衝突形状を読み、JSONは平面ナビゲーション、スポーン、ゾーン、ステージ設定を担当する。

GLB資産自体の縮尺、軸、命名、衝突規約は[ステージ資産仕様書](./spec_stage_assets_v2.md)を正本とする。旧JSON形式の互換読込や変換フォールバックは提供しない。

## 2. 旧T02の配置と登録（履歴）

- 通常ステージ定義は`public/stage/<ファイル名>.json`へUTF-8（BOMなし）で配置する。
- `src/world/stageSelection.ts`の`STAGE_CATALOG`へID、初期ラベル、定義パスを登録する。
- 定義パスとGLBパスは`import.meta.env.BASE_URL`から解決できる相対パスとする。
- JSONを配置しただけではタイトルの選択肢へ追加されない。

旧T02時点の専用IDは次の3件だった。

| ID | 専用処理 |
|---|---|
| `arena_trap_room` | トラップ光線システム |
| `labyrinth_dynamic` | `D`ゾーンを使う動的ビームシステム |
| `arena_roulette` | ルーレット進行とタイトル設定制限 |

## 3. Union型

```ts
type StageDefinitionV2 =
  | ProceduralGridStageDefinitionV2
  | GlbStageDefinitionV2;
```

両形式は次の共通領域を持つ。

```ts
type StageDefinitionCommonV2 = {
  schemaVersion: 2;
  meta: {
    name: string;
    description?: string;
  };
  gameplay: {
    markers: StageMarker[];
    zones: StageZone[];
    options: {
      skipAssembly: boolean;
    };
  };
  authoring?: {
    symbols?: {
      env?: Record<string, string>;
      zone?: Record<string, string>;
    };
    zoneRules?: Record<string, unknown>;
  };
};
```

`meta.description`はタイトルのステージ名へ使用する。BGMは`meta.name`と同名の素材を選ぶ。

旧形式の`meta.size`、`entities`、`gameplay.spawners`、`gameplay.triggers`、`overrides`はv2契約に含めない。

## 4. procedural-grid形式

```ts
type ProceduralGridStageDefinitionV2 = StageDefinitionCommonV2 & {
  kind: "procedural-grid";
  grid: {
    cellSize: number;
    mapScale: { x: number; z: number };
    cellPhysics: Record<string, StageCellPhysicsDef>;
    mainMap: string[];
    zoneMap?: string[];
  };
  rendering: {
    environmentMap: string[];
    environmentRules: Record<string, StageEnvRule>;
    decals: StageDecal[];
  };
};
```

### 4.1 座標

- JSON原点は`mainMap`左上。
- Xは右、Zは下へ増加する。
- 読込時に`mainMap`、`environmentMap`、`zoneMap`の各行を左右反転する。
- マーカー、ゾーン、デカールにも同じX反転を適用する。
- `E`と`W`の壁方向はX反転時に入れ替える。
- 内部ワールドではグリッド全体の中央を原点とし、列をBabylon `+X`、行を`+Z`へ配置する。

### 4.2 セル寸法と展開

`grid.cellSize`は展開後の1内部セルのBabylonワールド寸法である。既存8ステージは`0.3333333333333333`を使用する。

`mapScale`は1文字を内部セルへ複製する倍率である。

- 内部列数: `mainMap[0].length * mapScale.x`
- 内部行数: `mainMap.length * mapScale.z`
- ベースセル幅: `cellSize * mapScale.x`
- ベースセル奥行き: `cellSize * mapScale.z`

`mapScale.x/z`は1以上の整数とする。

### 4.3 物理グリッド

```ts
type StageCellPhysicsDef = {
  solid: boolean;
  heightCells: number;
  noRender?: boolean;
};
```

- `mainMap`は1行以上で、全行を同じ文字数にする。
- `mainMap`に現れる全記号を`cellPhysics`へ定義する。
- `solid: false`は床、`solid: true`は壁とする。
- `heightCells`へ`cellSize`を掛けた値を壁高とする。
- `solid: true`かつ`heightCells: 0`は、定義内最大の`heightCells`を使用する。
- `noRender: true`は壁表示を省略するが、衝突は生成する。
- 外周を壁または不可視solidセルで閉じる。

### 4.4 環境と天井

`rendering.environmentMap`は`mainMap`と同じベース寸法にする。`O`は屋外床、それ以外は屋内床として扱う。

`rendering.environmentRules`の最初のルールにある`ceiling`をステージ全体の天井へ使用する。`ceiling: null`なら天井を生成しない。`O.sky.color`はBabylonの背景色へ使用する。

対応済み床`tileId`:

| tileId | 表示 |
|---|---|
| `floor_arena_amber` | 茶系アリーナ床 |
| `floor_labyrinth_amber` | 紺系迷宮床 |
| その他／未指定 | 既定の紫床 |

### 4.5 意味ゾーン

`grid.zoneMap`は任意で、指定時は`mainMap`と同じベース寸法にする。

- `D`: `labyrinth_dynamic`の動的ビーム候補床セル。
- `L`: 制作上の汎用屋内領域。旧T02ランタイムでは処理していなかった。

上下左右に連結した`D`床セルを1つのビームセットとして扱う。

### 4.6 デカール

v2で描画するデカールは壁面鏡である。

```ts
type StageDecal = {
  face: "floor" | "wall" | "ceiling";
  type: "cell" | "rect";
  x: number;
  z: number;
  w?: number;
  h?: number;
  wallDir?: "N" | "E" | "S" | "W";
  reflective?: {
    kind: "mirror";
    tint: string;
    amount: number;
    blur: number;
  };
};
```

鏡は`face: "wall"`、`reflective.kind: "mirror"`、`wallDir`を必須とする。

## 5. glb形式

```ts
type GlbStageDefinitionV2 = StageDefinitionCommonV2 & {
  kind: "glb";
  asset: {
    path: string;
  };
  navigation: {
    cellSizeMeters: number;
    originMeters: { x: number; y: number };
    cellPhysics: Record<string, StageCellPhysicsDef>;
    mainMap: string[];
    zoneMap?: string[];
  };
  environment: {
    skyColor?: string;
  };
};
```

### 5.1 GLBパス

`asset.path`はBASE_URL相対で記述する。

```json
"asset": {
  "path": "stage-assets/v2/T01/t01_glb_collision_course.glb"
}
```

ローダーはAssetContainerの外側に管理親を作成し、0.25倍を適用する。glTF管理ルートは変更しない。

### 5.2 平面ナビゲーション座標

GLB用JSONの水平座標はBlender資産原点・メートル基準とする。

- `originMeters`: ナビゲーションセル`(x=0, z=0)`中心のBlender X/Y座標。
- `cellSizeMeters`: 1セルのBlenderメートル寸法。
- JSON列: Blender `+X`へ増加。
- JSON行: Blender `+Y`へ増加。
- JSON列はBabylon `-X`、JSON行はBabylon `-Z`へ変換する。
- 距離は0.25倍に変換する。
- GLB形式ではJSON列の左右反転を行わない。

本平面グリッドはT02時点の既存ゲームシステムを接続するための構造だった。当時は`layerId`、`floorY`、複数階、階段リンクをT04で導入する予定としていたが、この設計は採用せず、現行V2は3D NavMeshを使用する。

### 5.3 GLBメッシュ

- 頂点を持つ作者メッシュはすべて`VIS_`または`COL_`で始める。
- `VIS_`: 表示、有効、衝突無効。
- `COL_`: 有効、非表示、衝突有効。
- 規約外の作者メッシュ名は読込エラーとする。

## 6. ゲームプレイ共通領域

### 6.1 マーカー

```ts
type StageMarker = {
  id: string;
  type: "spawn" | "goal" | "checkpoint" | "loot" | "poi";
  x: number;
  z: number;
  rotY?: number;
  tags?: string[];
  props?: Record<string, unknown>;
};
```

全ステージに`id: "spawn_player"`かつ`type: "spawn"`のマーカーを1件置く。

対応済みタグ:

| タグ | 動作 |
|---|---|
| `random_spawnable` | 敵出現禁止セルを除く床からランダム開始 |
| `random_floor` | 全床セルからランダム開始 |
| `look_at_center` | `rotY`よりステージ中心方向を優先 |

### 6.2 ゾーン

```ts
type StageZone = {
  id: string;
  type: "safeZone" | "noEnemySpawn" | "noEnemyEnter" | "noCombat" | "hazard";
  x: number;
  z: number;
  w: number;
  h: number;
  tags?: string[];
  props?: Record<string, unknown>;
};
```

- 全ステージに`id: "assembly_area"`を1件置く。
- `noEnemySpawn`はビットの初期・追加スポーン候補から除外する。
- `noEnemyEnter`、`noCombat`、`hazard`は旧T02ランタイムでは処理していなかった。

### 6.3 オプション

- `skipAssembly: false`: 全滅後に`assembly_area`へ経路移動する。
- `skipAssembly: true`: 整列移動を省略して即時配置する。

## 7. 制作注釈

`authoring.symbols`は環境・ゾーン記号の人間向け説明を保持する。`authoring.zoneRules`は制作意図を保持できたが、旧T02ランタイムでは処理していなかった。

制作注釈はゲームプレイ効果を自動生成しない。

## 8. 読込・切替・破棄

1. `loadStageDefinition`がJSONを取得する。
2. `schemaVersion`と`kind`を検査する。
3. 非同期`buildStageContext`がグリッド、描画資源、衝突資源を構築する。
4. 新コンテキスト完成後に旧コンテキストを破棄して切り替える。
5. 競合して古くなったロード結果は利用せず、そのコンテキストを即時破棄する。

取得失敗、未対応版、未知の`kind`、GLB命名違反はエラーとする。旧形式読込、組込みグリッドへの代替、未知形式の推測変換は行わない。

`disposeStageContext`は次をまとめて破棄する。

- procedural-gridの床、壁、天井、コライダー、Material、Texture、反射資源。
- GLBのAssetContainer、管理親、glTFルート、作者Mesh、Material、Texture。

Babylon.jsがGLBのPBR Material用に生成する`EnvironmentBRDFTexture`はScene共有資源とし、StageContextからは破棄しない。非同期RGBD展開を含むライフサイクルと最終破棄はSceneへ委ねる。

## 9. 旧T02時点の8ステージ（履歴）

次の8件は旧T02で使用していたJSONステージであり、V2移行時に`public/stage`から削除した。個別に3D資産化されるまで、V2のカタログや動作保証には含めない。

| ファイル | kind | 内部グリッド | 主な特徴 |
|---|---|---:|---|
| `laboratory.json` | procedural-grid | 17×56 | 屋内、敵出現禁止領域 |
| `city_center.json` | procedural-grid | 112×116 | 屋外、2×2展開、高壁 |
| `arena.json` | procedural-grid | 27×27 | 屋内アリーナ |
| `arena_trap_room.json` | procedural-grid | 27×27 | トラップ専用ID |
| `arena_roulette.json` | procedural-grid | 27×27 | ルーレット専用ID |
| `arena_mirror_house.json` | procedural-grid | 27×27 | 壁面鏡4枚 |
| `labyrinth.json` | procedural-grid | 76×64 | 大型迷路 |
| `labyrinth_dynamic.json` | procedural-grid | 76×64 | `D`ゾーン付き大型迷路 |

T02移行時に`laboratory.json`の過剰な最終`L`行を削除し、全定義のマップ寸法を一致させた。

T01テストコースは検証専用のglb定義であり、旧T02の通常ステージカタログには登録されていなかった。

## 10. 旧T02作成チェックリスト（履歴）

以下は旧JSONを作成していた当時のチェックリストである。現行V2の資産制作や実装検証には使用せず、[V2ステージランタイム仕様書](./spec_stage_runtime_v2.md)と[ステージ資産仕様書](./spec_stage_assets_v2.md)に従う。

- [ ] UTF-8（BOMなし）のJSONとして解析できる。
- [ ] `schemaVersion: 2`と既知の`kind`を持つ。
- [ ] `mainMap`が空でなく、全行幅が同じ。
- [ ] 使用記号をすべて`cellPhysics`へ定義している。
- [ ] `zoneMap`と`environmentMap`が必要なマップ寸法と一致する。
- [ ] `spawn_player`と`assembly_area`が各1件ある。
- [ ] `skipAssembly`を明示している。
- [ ] procedural-gridは外周、天井、環境、鏡が意図どおりである。
- [ ] glbは資産原点、メートル寸法、`VIS_`／`COL_`命名を満たす。
- [ ] タイトルから開始し、切替後に旧資源がSceneへ残らない。
