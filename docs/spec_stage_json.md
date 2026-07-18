# HAIGURE SURVIVAL ステージJSON作成仕様書

更新日: 2026-07-18
対象バージョン: 1.3.1
基準実装: `src/world/stageJson.ts`

## 1. 文書の位置付け

本書は、HAIGURE SURVIVAL v1.3.1で読み込めるステージJSONの作成規則を定義する。ゲーム仕様は [ゲーム仕様書](./spec.md)、読込後の構成は [技術仕様書](./spec_technical.md) を参照すること。

現行実装にはJSON Schemaやランタイム検証がない。型アサーション後に各項目を直接参照するため、本書の必須条件を満たさないデータは読込後に例外、`undefined` 参照、寸法不一致を起こす。

## 2. 配置と登録

1. JSONを `public/stage/<ファイル名>.json` にUTF-8（BOMなし）で配置する。
2. `src/world/stageSelection.ts` の `STAGE_CATALOG` にID、表示用ラベル、ファイル名を追加する。
3. ステージ専用処理が必要なら、`src/world/stageIds.ts` と呼出側へID判定を追加する。
4. ステージ固有BGMを使う場合は `public/audio/bgm/<meta.name>.mp3` を配置する。

JSONファイルを置くだけではタイトルの選択肢へ追加されない。現行の専用IDは次の3つである。

| ID | 専用処理 |
|---|---|
| `arena_trap_room` | トラップ光線システム |
| `labyrinth_dynamic` | `D`ゾーンを使う動的ビームシステム |
| `arena_roulette` | ルーレット進行とタイトル設定制限 |

## 3. 座標系

JSONはASCIIマップを人が読む向きで記述する。

- 原点: `mainMap` 左上
- X: 右へ増加
- Z: 下へ増加
- 座標単位: `mapScale` 適用前のベースセル
- `rotY`: 度数法。0度は内部ワールドの+Z方向
- `w`: X方向の幅
- `h`: Z方向の奥行き。ただし壁面鏡では鏡の縦方向セル数として使う

読込時に `mainMap`、`semantics.channels.env`、`semantics.channels.zone` は各行を左右反転する。マーカー、ゾーン、デカールも同じX反転を受けるため、JSON作成者は内部反転を考慮せず、見たままの左上原点で記述する。

### 3.1 X反転式

ベースマップ幅を `W` とする。

| 対象 | 内部X |
|---|---|
| 点マーカー | `W - 1 - x` |
| 矩形ゾーン | `W - x - w` |
| 床・天井矩形デカール | `W - x - width` |
| 東西向き壁デカール | `W - 1 - x` |

壁方向 `E` と `W` は反転時に入れ替わる。`N` と `S` は変わらない。

## 4. `mapScale` とワールド寸法

`meta.mapScale` はベースセル1文字を内部セルへ複製する倍率である。

```json
"mapScale": { "x": 2, "z": 3 }
```

この場合、1文字を横2セル、縦3セルへ展開する。マーカーとゾーンにも同じ倍率を適用する。

- 内部列数: `mainMap[0].length * mapScale.x`
- 内部行数: `mainMap.length * mapScale.z`
- 1内部セル: `1 / 3` ワールド単位
- ベースセルのワールド幅: `mapScale.x / 3`
- ベースセルのワールド奥行き: `mapScale.z / 3`

倍率は実装上整数検証されないが、1以上の整数を指定すること。0、負数、小数は使用禁止とする。

## 5. トップレベル構造

すべての新規ステージは次の項目を持たせる。

```json
{
  "meta": {},
  "cellPhysics": {},
  "mainMap": [],
  "semantics": {},
  "generationRules": { "env": {} },
  "entities": [],
  "decals": [],
  "gameplay": {
    "markers": [],
    "zones": [],
    "spawners": [],
    "triggers": [],
    "options": { "skipAssembly": false }
  },
  "overrides": {}
}
```

| 項目 | 型 | 現行ランタイムでの使用 |
|---|---|---|
| `meta` | object | 使用 |
| `cellPhysics` | object | 使用 |
| `mainMap` | string[] | 使用 |
| `semantics` | object | `channels.env` と任意の `channels.zone` を使用 |
| `generationRules` | object | `env` の一部を使用 |
| `entities` | array | 未使用。空配列を指定 |
| `decals` | array | 壁面鏡だけ使用 |
| `gameplay` | object | `markers`、`zones`、`options` を使用 |
| `overrides` | any | 未使用。空オブジェクトを指定 |

## 6. `meta`

```ts
type Meta = {
  name: string;
  description?: string;
  size?: { width: number; height: number };
  mapScale: { x: number; z: number };
};
```

| 項目 | 必須 | 内容 |
|---|---|---|
| `name` | 必須 | ステージ内部名。対応BGMのファイル名にも使う |
| `description` | 任意 | タイトルの表示ラベルへ使用する説明 |
| `size` | 任意 | 文書用寸法。現行ランタイムは参照しない |
| `mapScale` | 必須 | X/Z方向の展開倍率 |

実寸法は常に `mainMap` から算出する。`size` を書く場合は `width = 各行の文字数`、`height = 行数` と一致させること。

## 7. `cellPhysics`

```ts
type StageCellPhysicsDef = {
  solid: boolean;
  heightCells: number;
  noRender?: boolean;
};
```

`mainMap` の1文字と物理特性を対応付ける。`mainMap` に現れるすべての文字を定義すること。

```json
"cellPhysics": {
  " ": { "solid": true, "heightCells": 0, "noRender": true },
  ".": { "solid": false, "heightCells": 0 },
  "$": { "solid": true, "heightCells": 3 }
}
```

| 項目 | 内容 |
|---|---|
| `solid` | `true`なら壁、`false`なら床 |
| `heightCells` | 壁高のセル数。内部セルサイズを掛けてワールド高にする |
| `noRender` | `true`なら壁メッシュを描画しない。ただし衝突は生成する |

### 7.1 高さ0のsolidセル

`solid: true` かつ `heightCells: 0` は、`cellPhysics` 内で最大の `heightCells` を壁高として使用する。これは空白セルを不可視の外周壁として扱うための規則である。

最低1種類は正の高さを持つsolid記号を定義すること。全solid定義が0だとフォールバック高も0になる。

### 7.2 推奨記号

記号の意味は固定ではなく `cellPhysics` が決めるが、現行データとの一貫性のため次を推奨する。

| 記号 | 用途 |
|---|---|
| 半角空白 | 不可視の進入不能領域 |
| `.` | 床 |
| `$` | 標準壁 |
| `&` | 高い壁 |

## 8. `mainMap`

`mainMap` は物理的な床・壁の配列である。

```json
"mainMap": [
  "$$$$$",
  "$...$",
  "$...$",
  "$...$",
  "$$$$$"
]
```

必須条件:

- 1行以上、1文字以上であること。
- 全行の文字数が同じであること。
- すべての文字が `cellPhysics` に存在すること。
- プレイヤーのスポーン先が `solid: false` のセルになること。
- 外周を閉じるか、不可視solidセルで移動範囲を囲むこと。

床セルごとに床メッシュを1枚作り、隣接セルが壁なら床側から壁面と衝突Meshを作る。壁セル自体に床は作らない。

## 9. `semantics`

```ts
type StageSemantics = {
  channels: {
    env: string[];
    zone?: string[];
  };
  brief?: {
    env?: Record<string, string>;
    zone?: Record<string, string>;
  };
};
```

### 9.1 `channels.env`

`mainMap` と同じベース寸法で環境記号を記述する。

| 記号 | 現行処理 |
|---|---|
| `O` | 屋外用の暗色床マテリアルを使用 |
| `O`以外 | 通常床マテリアルを使用 |

屋内記号には現行データと同じ `I` を推奨する。環境記号と `generationRules.env` のキーは合わせること。

### 9.2 `channels.zone`

任意の意味レイヤーである。現行ランタイムが解釈する記号は `D` だけである。

- `D`: `labyrinth_dynamic` で動的ビーム候補になる床セル。
- 上下左右に連結した `D` 床セルを1つのビームセットとして扱う。
- `D` が壁セル上にあっても候補にならない。
- `D` の意味はステージID `labyrinth_dynamic` のときだけ実際の進行に接続される。
- `L` などその他の記号は現行ランタイムでは意味を持たない。

`zone` を指定する場合は `mainMap` と同じ行数・列数にする。使用しない場合はプロパティ自体を省略する。

### 9.3 `brief`

記号の人間向け説明を保存できるが、現行ランタイムは参照しない。保守性のため、使用した環境・ゾーン記号の説明を書くことを推奨する。

## 10. `generationRules`

型上の必須部分は次のとおりである。

```ts
type StageEnvRule = {
  floor?: { tileId?: string };
  obstacle?: { tileId?: string };
  ceiling: {
    heightCells: number;
    collision: boolean;
    style?: { tileId?: string };
  } | null;
  sky?: { color: string };
};

type GenerationRules = {
  env: Record<string, StageEnvRule>;
};
```

`env` は1件以上必要である。現行処理には次の制約がある。

| 項目 | 現行処理 |
|---|---|
| 最初のenvルールの `ceiling` | ステージ全体の天井として使用 |
| `ceiling.heightCells` | 天井高に使用 |
| `ceiling.collision` | 未使用。天井があれば常に衝突有効 |
| `ceiling.style` | 未使用 |
| `env.I.floor.tileId` | 一部の既知tileIdを床色へ変換 |
| `env.O.sky.color` | ステージ背景色へ使用 |
| `floor` のその他キー | 未使用 |
| `obstacle` | 未使用 |
| `generationRules.zone` | 型外の追加データ。現行ランタイムでは未使用 |

対応済み床 `tileId`:

| tileId | 色 |
|---|---|
| `floor_arena_amber` | 茶系のアリーナ床 |
| `floor_labyrinth_amber` | 紺系の迷宮床 |
| その他／未指定 | 既定の紫床 |

屋外の例:

```json
"generationRules": {
  "env": {
    "O": {
      "floor": { "tileId": "floor_city_asphalt" },
      "obstacle": { "tileId": "wall_city" },
      "ceiling": null,
      "sky": { "color": "#87ceeb" }
    }
  }
}
```

`ceiling: null` なら天井を生成しない。天井ありの場合、ステージ高さは最大壁高と天井高の大きい方になる。

## 11. `gameplay.markers`

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

プレイヤースポーンには、`id: "spawn_player"` かつ `type: "spawn"` のマーカーを必ず1件置く。グリッド構築は最初の `type: "spawn"` を使い、向きとタグの取得は `id: "spawn_player"` も要求するため、同じ1件で両方を満たすこと。

```json
{
  "id": "spawn_player",
  "type": "spawn",
  "x": 2,
  "z": 2,
  "rotY": 180,
  "tags": ["look_at_center"]
}
```

対応済みタグ:

| タグ | 動作 |
|---|---|
| `random_spawnable` | 敵出現禁止セルを除いたスポーン可能床からランダム選択 |
| `random_floor` | 全床セルからランダム選択 |
| `look_at_center` | `rotY` よりステージ中心方向を優先 |

タグがない場合はマーカー座標と `rotY` を使用する。`props` とspawn以外のマーカー種別は現行ランタイムでは未使用である。

## 12. `gameplay.zones`

```ts
type StageZone = {
  id: string;
  type:
    | "safeZone"
    | "noEnemySpawn"
    | "noEnemyEnter"
    | "noCombat"
    | "hazard";
  x: number;
  z: number;
  w: number;
  h: number;
  tags?: string[];
  props?: Record<string, unknown>;
};
```

### 12.1 `assembly_area`

全ステージに `id: "assembly_area"` の矩形を必ず1件置く。

```json
{
  "id": "assembly_area",
  "type": "safeZone",
  "x": 1,
  "z": 1,
  "w": 3,
  "h": 3,
  "tags": ["all_down", "execution"]
}
```

全滅後の整列・公開処刑配置に使用する。現行コードはIDだけで検索するが、意味を明確にするため `type: "safeZone"` と上記タグを使用する。領域内には十分な床を確保すること。到達不能セルしかない場合は全床へフォールバックする。

### 12.2 `noEnemySpawn`

`type: "noEnemySpawn"` の全矩形を内部セルへ展開し、ビットの初期・追加スポーン候補から除外する。

`safeZone` は `assembly_area` の検索以外、`noEnemyEnter`、`noCombat`、`hazard`、ゾーンの `tags` と `props` は現行ランタイムでは未使用である。

## 13. `gameplay.options`

```ts
type StageGameplayOptions = {
  skipAssembly: boolean;
};
```

- `false`: 全滅後にキャラクターを `assembly_area` へ経路移動させる。
- `true`: 全滅後の移動を省略し、即時配置へ進む。

## 14. `decals`

型は床・壁・天井、セル・矩形、テクスチャ・色などを表現できるが、v1.3.1で描画されるのは壁面鏡だけである。

```ts
type StageDecal = {
  face: "floor" | "wall" | "ceiling";
  type: "cell" | "rect";
  x: number;
  z: number;
  w?: number;
  h?: number;
  wallDir?: "N" | "E" | "S" | "W";
  texture?: string;
  tileId?: string;
  color?: string;
  reflective?: {
    kind: "mirror";
    tint: string;
    amount: number;
    blur: number;
  };
};
```

鏡の例:

```json
{
  "face": "wall",
  "type": "rect",
  "x": 1,
  "z": 1,
  "w": 3,
  "h": 2,
  "wallDir": "N",
  "reflective": {
    "kind": "mirror",
    "tint": "#c4c8d1",
    "amount": 0.72,
    "blur": 4
  }
}
```

必須条件:

- `face` は `wall`。
- `reflective.kind` は `mirror`。
- `wallDir` を指定する。
- `tint` はBabylon.jsが解釈できる16進色にする。
- `w` は壁面の横幅、`h` は床からの高さをセル数で指定する。
- `type: "cell"` は幅・高さとも1として扱う。

`texture`、`tileId`、`color`、鏡以外のreflective、床・天井デカールは現行ランタイムでは描画されない。

## 15. 現行未使用項目

次の項目は将来用または制作意図保存用として既存JSONに存在するが、v1.3.1のランタイム処理には接続されていない。

| 項目 | 作成時の扱い |
|---|---|
| `meta.size` | 任意。書くなら実寸と一致させる |
| `semantics.brief` | 任意の説明用 |
| `generationRules.zone` | 任意の説明用。処理されない |
| `entities` | `[]` を指定 |
| `gameplay.spawners` | `[]` を指定 |
| `gameplay.triggers` | `[]` を指定 |
| `overrides` | `{}` を指定 |
| marker/zoneの未対応種別・`props` | ゲーム処理を期待しない |

これらへ値を書いても、配置物、スポーン、イベント、例外処理は自動生成されない。

## 16. 最小構成例

次は通常の屋内ステージとして読み込める最小テンプレートである。

```json
{
  "meta": {
    "name": "sample_room",
    "description": "サンプルルーム",
    "size": { "width": 5, "height": 5 },
    "mapScale": { "x": 1, "z": 1 }
  },
  "cellPhysics": {
    ".": { "solid": false, "heightCells": 0 },
    "$": { "solid": true, "heightCells": 3 }
  },
  "mainMap": [
    "$$$$$",
    "$...$",
    "$...$",
    "$...$",
    "$$$$$"
  ],
  "semantics": {
    "channels": {
      "env": [
        "IIIII",
        "IIIII",
        "IIIII",
        "IIIII",
        "IIIII"
      ]
    },
    "brief": {
      "env": { "I": "屋内" }
    }
  },
  "generationRules": {
    "env": {
      "I": {
        "floor": { "tileId": "floor_arena_amber" },
        "obstacle": { "tileId": "wall_plain" },
        "ceiling": {
          "heightCells": 3,
          "collision": true,
          "style": { "tileId": "ceiling_plain" }
        }
      }
    }
  },
  "entities": [],
  "decals": [],
  "gameplay": {
    "markers": [
      {
        "id": "spawn_player",
        "type": "spawn",
        "x": 2,
        "z": 2,
        "rotY": 0
      }
    ],
    "zones": [
      {
        "id": "assembly_area",
        "type": "safeZone",
        "x": 1,
        "z": 1,
        "w": 3,
        "h": 3,
        "tags": ["all_down", "execution"]
      }
    ],
    "spawners": [],
    "triggers": [],
    "options": { "skipAssembly": false }
  },
  "overrides": {}
}
```

## 17. 機能追加例

最小構成へ次の差分を加えることで、対応済み機能を使用できる。

### 17.1 ランダム開始

```json
"tags": ["random_spawnable", "look_at_center"]
```

### 17.2 敵出現禁止領域

```json
{
  "id": "safe_spawn_1",
  "type": "noEnemySpawn",
  "x": 1,
  "z": 1,
  "w": 2,
  "h": 2
}
```

### 17.3 屋外

- `channels.env` の屋外セルを `O` にする。
- `generationRules.env.O.ceiling` を `null` にする。
- `generationRules.env.O.sky.color` を指定する。

### 17.4 動的ビーム

- ステージIDを `labyrinth_dynamic` にする。
- `channels.zone` を追加する。
- 光線を出したい床セルを連結した `D` で記述する。

### 17.5 鏡

- 壁に接する床側座標へ、14章の壁面鏡デカールを追加する。
- `wallDir` は部屋から見た壁面方向に合わせる。

## 18. 現行8ステージの実データ

| ファイル | 実マップ寸法 | scale | 主な特徴 |
|---|---:|---:|---|
| `laboratory.json` | 17×56 | 1×1 | 屋内、敵出現禁止領域 |
| `city_center.json` | 56×58 | 2×2 | 屋外、空白不可視領域、高壁 |
| `arena.json` | 27×27 | 1×1 | 屋内アリーナ |
| `arena_trap_room.json` | 27×27 | 1×1 | トラップ専用ID |
| `arena_roulette.json` | 27×27 | 1×1 | ルーレット専用ID |
| `arena_mirror_house.json` | 27×27 | 1×1 | 壁面鏡4枚 |
| `labyrinth.json` | 76×64 | 1×1 | 大型迷路 |
| `labyrinth_dynamic.json` | 76×64 | 1×1 | `D`ゾーン付き大型迷路 |

v1.3.1実データには、ランタイム未使用項目に次の不一致がある。

- `labyrinth.json` と `labyrinth_dynamic.json` の `meta.size.height` は77だが、実際の `mainMap` は64行である。
- `laboratory.json` の `semantics.channels.zone` は57行だが、`mainMap` は56行である。このzoneは当該ステージでゲーム処理に使用されない。

新規・更新データではこれらを踏襲せず、寸法を一致させること。

## 19. 作成チェックリスト

### 19.1 JSONと寸法

- [ ] JSONとして構文解析できる
- [ ] UTF-8（BOMなし）で保存している
- [ ] `mainMap` が空でない
- [ ] `mainMap` の全行幅が同じ
- [ ] `channels.env` が `mainMap` と同じ行数・列数
- [ ] `channels.zone` を書く場合、`mainMap` と同じ行数・列数
- [ ] `meta.size` を書く場合、`mainMap` の実寸と一致
- [ ] `mapScale.x/z` が1以上の整数

### 19.2 物理と環境

- [ ] `mainMap` の全記号が `cellPhysics` に定義済み
- [ ] 正の高さを持つsolid記号が最低1つある
- [ ] スポーンセルと整列領域に床がある
- [ ] 外周または不可視壁で移動範囲が閉じている
- [ ] `generationRules.env` が1件以上ある
- [ ] 天井の有無と高さが意図どおり
- [ ] 屋外なら `O` と `env.O.sky.color` を指定している

### 19.3 ゲーム進行

- [ ] `spawn_player` / `spawn` マーカーが1件ある
- [ ] `assembly_area` ゾーンが1件ある
- [ ] `skipAssembly` を明示している
- [ ] ランダム開始タグと敵出現禁止領域が矛盾していない
- [ ] `D` を使う場合、ステージIDが `labyrinth_dynamic`
- [ ] 専用機能が必要ならID定数と呼出側を実装済み

### 19.4 表示と登録

- [ ] 鏡は `wall` / `mirror` / `wallDir` を満たす
- [ ] `STAGE_CATALOG` に登録した
- [ ] `description` がタイトル表示名として適切
- [ ] 固有BGM名が `meta.name` と一致
- [ ] 実際に開始し、スポーン、壁、天井、整列、専用ギミックを確認した
