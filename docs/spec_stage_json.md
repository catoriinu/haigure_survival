Babylon.js ブラウザFPS
ステージデータ仕様書（完全版 / v1）
# 1. 本仕様の目的

本仕様は、Babylon.js 製 FPS 視点ゲームにおける ステージ構築・生成・調整を目的とした JSON データ構造を定義する。

本設計は以下の制作フローを前提とする。

1. 人間がステージの超概要（形・意味）を書く
2. AIがその意図をもとに具体化（配置・装飾）する
3. 人間が最終調整（遊びやすさ・見た目）を行う

このフローを破綻させないため、
データは 役割ごとに厳密に分離されている。

# 2. 全体構造（トップレベル）
{
  "meta": {},
  "cellPhysics": {},
  "mainMap": [],
  "semantics": {},
  "generationRules": {},
  "entities": [],
  "decals": [],
  "gameplay": {},
  "overrides": {}
}

# 3. 設計思想（最重要）
## 3.1 データの役割分担
区分	役割
mainMap / cellPhysics	物理的な骨格（通行・高さ）
semantics	セルに付与される「意味」
generationRules	AIに渡す設計図（意図の保存形式）
entities	AIが生成した配置結果（成果物）
decals	見た目専用の貼り物（成果物）
gameplay	ゲーム進行用の注釈
overrides	最終例外（最小限）

# 3.2 Rules / Entities / Decals の思想

- generationRules
→ AIが具体化するための「意図の保存形式」
→ 最終成果物ではない
→ 本プロジェクトでは 常に残す

- entities / decals
→ AIが生成した 成果物
→ 人間が最終的に直接編集する対象

# 4. 座標系の共通ルール

- 原点：左上
- 右方向：+X
- 下方向：+Z
- 単位：セル
- 回転：rotY は度（degree）

# 5. cellPhysics（物理辞書）
## 5.1 役割

ASCII記号と 物理特性（通行・高さ） の対応表。
見た目は一切持たない。

## 5.2 定義例
```
"cellPhysics": {
  " ": { "solid": true,  "heightCells": 0, "noRender": true }
  ".": { "solid": false, "heightCells": 0 },
  "#": { "solid": true,  "heightCells": 3 },
  "$": { "solid": true,  "heightCells": 6 },
  "&": { "solid": true,  "heightCells": 12 },
  "~": { "solid": true,  "heightCells": 0 }
}
```

## 5.3 補足
### 5.3.1 空白セル（' '）について

本仕様では、半角スペース（' '）を 進行不能かつ描画不要なセルとして使用できる。
このセルは、以下の用途を想定する。

- ステージ外部の虚無領域
- 意図的に切り落としたマップ範囲
- 描画やコリジョン生成を行わない領域

空白セルは床や壁として扱われず、
天井生成・decals・entities 配置の対象にもならない。

# 6. mainMap（ステージ骨格）
## 6.1 役割

- ステージの形状・通路・壁・外形を定義
- 物理記号のみを使用する

## 6.2 例
```
"mainMap": [
  "..........",
  "..$$$$....",
  "..$..$....",
  "..$$$$....",
  ".........."
]
```

# 7. semantics（意味レイヤー）
## 7.1 役割

セルに「意味」を付与する。
見た目・配置方針の基点。

## 7.2 チャンネル（v1固定）

- env：環境（屋内 / 屋外）
- zone：用途（道路 / 倉庫 / ロビー 等）

## 7.3 定義
```
"semantics": {
  "channels": {
    "env": [
      "IIIIIIIIII",
      "IIIIIIIIII",
      "IIIIIIIIII",
      "IIIIIIIIII",
      "IIIIIIIIII"
    ],
    "zone": [
      "LLLLLLLLLL",
      "LLLLLLLLLL",
      "LLLLLLLLLL",
      "LLLLLLLLLL",
      "LLLLLLLLLL"
    ]
  },
  "brief": {
    "env": { "I": "屋内", "O": "屋外" },
    "zone": { "L": "ロビー" }
  }
}
```

# 8. generationRules（AI生成用設計図）
## 8.1 役割

- AIに渡す 具体化の方針
- 人間が意図を保存するための構造
- 本プロジェクトでは 常に保持

## 8.2 適用順

1. env
2. zone
（後勝ち・上書き）

## 8.3 定義例
```
"generationRules": {
  "env": {
    "I": {
      "floor": { "tileId": "floor_indoor" },
      "obstacle": { "tileId": "wall_indoor" },
      "ceiling": {
        "heightCells": 7,
        "collision": true,
        "style": { "tileId": "ceiling_basic" }
      }
    }
  },
  "zone": {
    "L": {
      "entity": {
        "allow": ["table", "chair"],
        "density": "medium"
      }
    }
  }
}
```

# 9. entities（配置成果物）
## 9.1 役割

- AIが生成した小物・オブジェクト
- 最終調整の主対象

## 9.2 例
```
"entities": [
  { "kind": "table", "x": 4, "z": 3, "rotY": 90 },
  { "kind": "chair", "x": 5, "z": 3 }
]
```

# 10. decals（貼り物）
## 10.1 役割

- 見た目専用
- 物理・当たり判定に影響しない
- 床・壁・天井を同一概念で扱う

## 10.2 DecalDef
```
{
  "face": "floor" | "wall" | "ceiling",
  "type": "cell" | "rect",
  "x": number,
  "z": number,
  "w"?: number,
  "h"?: number,
  "wallDir"?: "N" | "E" | "S" | "W",
  "texture"?: string,
  "tileId"?: string,
  "color"?: string
}
```

## 11. gameplay（ゲーム進行注釈）

### 11.1 役割と設計思想

`gameplay` セクションは、ステージ固有の **ゲーム進行・演出・制御に関わる注釈情報**を定義するための領域である。

本セクションは以下の方針で設計されている。

- **物理（mainMap / cellPhysics）とは分離**する
- **見た目（entities / decals）とも分離**する
- ゲームの都合（開始・クリア・安全地帯・出現・イベント）のみを扱う
- ステージごとに異なる「ルールの例外」や「進行条件」を、JSON内に明示的に残す

これにより、
ステージ構造や見た目を壊さずに、ゲーム進行のみをピンポイントで調整できる。

### 11.2 配置制約について（重要）

`gameplay` 内に定義される各要素（markers / zones / spawners / triggers）は、
**JSON上では配置セルの種別（床・壁等）による制約を持たない**。

- 床セル上であること
- 壁内部に埋まっていないこと
- 到達可能であること

といった妥当性検証は、**コード側の責務**とする。

JSONは「意図を表すデータ」であり、
実行時の安全性や補正はエンジンが担保する。

### 11.3 構成要素一覧

"gameplay" セクションは以下の要素から構成される。

- markers
- zones
- spawners
- triggers

それぞれの役割は明確に分離されており、
**用途が被らないように使い分けることが重要**である。

## 11.4 markers（静的な点）

### 役割

`markers` は、ステージ上の **固定された重要地点**を表す。

- ゲーム開始位置
- ゴール地点
- チェックポイント
- 宝・注目地点 など

markers に定義された要素は、
**基本的に生成・消滅しない静的な存在**である。

### 使うべきケース

- プレイヤー開始位置（spawn）
- クリア地点（goal）
- 固定配置の重要地点

### 使わないケース

- 敵やアイテムが出現・再出現する場合（→ spawners）

### MarkerDef
```
{
  "id": "string",
  "type": "spawn | goal | checkpoint | loot | poi",
  "x": number,
  "z": number,
  "rotY"?: number,
  "tags"?: string[],
  "props"?: object
}
```

## 11.5 zones（持続的な領域効果）

### 役割

`zones` は、**範囲内に居る間ずっと効果が続く領域**を表す。

- 敵スポーン禁止エリア
- 敵侵入禁止エリア
- 戦闘禁止エリア
- 危険地帯 など

zones は「入った瞬間」ではなく、
**範囲に存在している間の状態制御**を目的とする。

### 使うべきケース

- スポーン周辺の安全地帯
- 敵が湧いてはいけない領域
- 常時効果が必要なエリア

### ZoneDef
```
{
  "id": "string",
  "type": "safeZone | noEnemySpawn | noEnemyEnter | noCombat | hazard",
  "x": number,
  "z": number,
  "w": number,
  "h": number,
  "tags"?: string[],
  "props"?: object
}
```

## 11.6 spawners（出現管理）

### 役割

`spawners` は、**敵・NPC・アイテムなどが「生まれる」地点や範囲**を定義する。

- 同時出現数の制御
- 再出現の有無
- ウェーブ管理

など、**出現ロジックを伴う要素**を扱う。

### 使うべきケース

- 敵が一定条件で湧く
- 同時出現数を制限したい
- 倒された後に再出現する

### 使わないケース

- 最初から固定で置いてある敵（→ entities）

### SpawnerDef

```
{
  "id": "string",
  "type": "enemy | npc | item",
  "x": number,
  "z": number,
  "radius"?: number,
  "maxAlive"?: number,
  "respawn"?: { "cooldownSec": number } | null,
  "tags"?: string[],
  "props"?: object
}
```

## 11.7 triggers（イベントの契機）

### 役割

`triggers` は、**特定の条件が成立した瞬間にイベントを発生させるための要素**である。

- エリアに入ったとき
- エリアを出たとき
- 操作・接触があったとき

など、「きっかけ」をJSONで明示する。

### 使うべきケース

- 扉を開く
- ボス戦を開始する
- BGMを切り替える
- ゴール演出を開始する

### TriggerDef
```
{
  "id": "string",
  "type": "enter | leave | interact",
  "x": number,
  "z": number,
  "w": number,
  "h": number,
  "event": "string",
  "once"?: boolean,
  "tags"?: string[],
  "props"?: object
}
```

## 11.8 各要素の使い分け指針（重要）

| やりたいこと | 使う要素 |
|---|---|
| 開始・ゴール・固定地点 | markers |
| 範囲内で常時効果 | zones |
| 敵・アイテムの出現管理 | spawners |
| 何かが起きるきっかけ | triggers |

**迷った場合の判断基準：**

1. 「何かが生まれるか？」→ spawners
2. 「入った瞬間に起きるか？」→ triggers
3. 「居る間ずっと効くか？」→ zones
4. それ以外 → markers

---

## 11.9 本章のまとめ

- `gameplay` は **ゲーム進行専用の注釈レイヤー**
- 物理・見た目・AI生成とは責務を分離する
- JSONでは自由に書き、妥当性はコード側で検証する
- 小さな変更で大きな挙動調整ができることを最優先とする


# 12. 配置制約について（重要）

- gameplay の配置は JSON上では制約しない
- 妥当性検証（床上か等）は コード側責務
- JSONは「意図」を表すデータとする

# 13. overrides（例外）

- ピンポイントの物理・高さ変更用
- 多用しない
- 増えたら設計を見直す

# 14. 運用ガイド（要約）

1. 骨格を mainMap で作る
2. 意味を semantics で与える
3. 意図を generationRules に書く
4. AIで entities / decals を生成
5. 人間が entities / decals を直接調整
6. 例外は最小限 overrides

# 15. 本仕様の最終方針まとめ

- 人間が理解しやすい
- AIが誤解しにくい
- ピンポイント修正が容易
- 将来拡張で破綻しない
