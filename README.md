# HAIGURE SURVIVAL v2

ハイグレ洗脳されたい人向けの一人称視点サバイバルゲームです。

このブランチはv2学校ステージの開発版です。現在の通常ゲームは学校だけを読み込みます。公開中のv1系ブラウザ版とは実装とステージ構成が異なります。

## 現在のV2ステージ方式

- ステージ空間の正本はGLBの3D形状、意味Object、事前ベイクしたRecast NavMeshです。
- JSON文字マップ、セル座標、`GridLayout`、`FloorCell`、セルBFSはV2で使用しません。
- 旧8ステージはV2から一時的に外しています。将来、個別にGLBとNavMeshへ移行して再導入します。
- TypeScriptのステージカタログにはID、表示名、GLB／NavMesh URL、資産ハッシュなど、空間を重複記述しない情報だけを保持します。
- 学校1階、校庭、渡り廊下、体育館、3か所の校舎階段踊り場、体育館舞台を現在のテスト対象とします。

3D資産の主な命名規約は次のとおりです。

| 接頭辞 | 用途 |
|---|---|
| `VIS_*` | 表示形状 |
| `COL_*` | Actor・ビーム・視線を遮る通常衝突 |
| `COL_ActorOnly_*` | Actorだけを遮る衝突。将来の窓では視線とビームを通す |
| `NAV_*` | NavMesh生成元 |
| `MRK_*` | スポーンなどの3D位置 |
| `VOL_*` | 出現領域などの3D範囲 |
| `BND_*` | ステージ境界 |
| `META_*` | ステージメタデータ |

詳細は[ステージ資産仕様](docs/spec_stage_assets_v2.md)と[3D実行仕様](docs/spec_stage_runtime_v2.md)を参照してください。

## 起動

Node.js 18以上とnpmを用意し、リポジトリ直下で次を実行します。

```powershell
npm install
npm run dev:web
```

ブラウザで `http://127.0.0.1:5175/` を開き、読込完了後に画面を左クリックして開始します。

- `W` / `A` / `S` / `D`: 移動
- `Shift`: ダッシュ
- マウス: 視点移動
- `Esc`: マウス操作を解放

ローカルPC内だけで確認する場合、WindowsファイアウォールでNode.jsのパブリック／プライベートネットワーク受信を許可する必要はありません。サーバー終了時は起動したターミナルで `Ctrl+C` を押します。

## 検証

```powershell
npm run audit:v2:dependencies
npm run build
npm run build:t01
npm run build:t02
npm run build:t03
npm run build:t04
```

`audit:v2:dependencies`は、通常Web入口、V2実行モジュール、T01～T04検証へステージJSON・旧セル型・旧セル実装が再混入していないことを検査します。

NavMeshを学校GLBから再生成する制作コマンドは次のとおりです。

```powershell
npm run bake:v2:school-navmesh
```

ベイク結果は代表経路、容量、SHA-256、同一入力からの再現性まで検証されます。GLBとNavMeshのどちらか一方だけを更新しないでください。

## 現在の境界

- B03: 学校のローポリ仕上げ、実窓開口、ガラス、階段など同色面の見分けやすさ
- T05: 固定光線、トラップ光線、動的ビーム、集合・ステージ警報ギミックなど、残る特殊システムの完全3D化
- 後続工程: NPC・ビットの複数階移動と高さ付きNavMesh接続、既存8ステージの3D再制作
- 現在の通常ビーム、ビット・NPC索敵、アラート追跡は学校の3D壁、扇形視野、NavMesh迂回へ対応済みです。

全体進捗は[v2ロードマップ](docs/plan.md)、今回の実装記録は[T04計画](docs/plans/v2/T04/plan.md)と[B02＋T03テストプレイ計画](docs/plans/v2/B02/testplay_plan.md)を参照してください。
