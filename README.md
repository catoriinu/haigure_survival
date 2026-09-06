# HAIGURE SURVIVAL v2

ハイグレ洗脳されたい人向けの一人称視点サバイバルゲームです。

このブランチはv2学校ステージの開発版です。現在の通常ゲームは学校だけを読み込みます。公開中のv1系ブラウザ版とは実装とステージ構成が異なります。

## 現在のV2ステージ方式

- ステージ空間の正本はGLBの3D形状、意味Object、事前ベイクしたRecast NavMeshです。
- JSON文字マップ、セル座標、`GridLayout`、`FloorCell`、セルBFSはV2で使用しません。
- 旧8ステージはV2から一時的に外しています。将来、個別にGLBとNavMeshへ移行して再導入します。
- TypeScriptのステージカタログにはID、表示名、GLB／NavMesh URL、資産ハッシュなど、空間を重複記述しない情報だけを保持します。
- 学校1～4階、屋上、校庭、渡り廊下、体育館をゲーム空間として扱います。人間用複数階NavMeshに加え、任意の飛行ゾーン・飛行帯を持つビット専用NavMesh bundleと明示接続グラフを使用します。
- 学校はschema version 3の意味資産として、5階層の専用Map、52 Area、24 Mission Location、17階段踊り場、4エレベーター乗場、放送卓を持ちます。RuntimeはObject名や座標から意味を推測せず、GLB metadataの厳格な参照だけを使用します。
- 屋上は窓の設置対象外ですが、ゲーム、索敵、経路、戦闘の対象です。学校では4F屋外帯と屋上帯を、資産が明示する双方向`boundary`遷移で接続します。旧`bit_roof`固定経路は使用しません。

3D資産の主な命名規約は次のとおりです。

| 接頭辞 | 用途 |
|---|---|
| `VIS_*` | 表示形状 |
| `COL_*` | Actor・ビーム・視線を遮る通常衝突 |
| `COL_ActorOnly_*` | プレイヤー、NPC、ビットを遮る衝突。閉じた窓では視線と全光線を通す |
| `COL_HumanOnly_*` | プレイヤーとNPCだけを遮る衝突。ビット通過窓ではビット、視線、全光線を通す |
| `COL_BeamSightOnly_*` | 移動体を通し、ゲーム内の全ビームと視線だけを遮る不可視形状 |
| `NAV_*` | 人間用またはビット飛行帯用NavMesh生成元 |
| `MAP_*` | 階別ミニマップ専用の平面形状 |
| `MRK_*` | スポーンなどの3D位置 |
| `VOL_*` | 出現領域、連続的な上下移動、境界横断などの3D範囲 |
| `BND_*` | ステージ境界 |
| `META_*` | ステージメタデータ |
| `LNK_*` | 窓など、狭い`aperture`遷移の両端 |

窓は`LNK_<id>_A/B`のビット専用`aperture`、連続的な上下移動と屋上外周は`VOL_*`の`vertical`／`boundary`、階段は形状に沿う`surface-route`として表します。接続元・接続先のゾーンIDと帯IDは資産へ明示し、IDや高さから推測しません。プレイヤー・NPCはこれらのビット遷移やビット用NavMeshを利用できません。

ビットのV1実形状・戦闘用被弾球は半径0.44m、全方向の安全余裕は0.10m、ステージ障害物に対する移動包絡は半径0.54mです。上下揺れは中心位置の連続Sweepとして判定し、揺れ幅を包絡半径へ二重加算しません。ビット用`LNK_*`の`hs_link_radius_m=0.54`は必要包絡に合わせた接続半径であり、本体半径ではありません。

詳細は[ステージ資産仕様](docs/spec_stage_assets_v2.md)と[3D実行仕様](docs/spec_stage_runtime_v2.md)を参照してください。

## 起動

Node.js 18以上とnpmを用意し、リポジトリ直下で次を実行します。

```powershell
npm ci
npm run dev:web
```

ブラウザで `http://127.0.0.1:5175/` を開き、読込完了後に画面を左クリックして開始します。`file://`によるHTMLの直接起動は対応対象外です。

- `W` / `A` / `S` / `D`: 移動
- `Shift`: ダッシュ（通常モードは左の体力を消費。最大15秒分、休止中は毎秒0.5回復。洗脳後は消費なし）
- マウス: 視点移動
- `Esc`: マウス操作を解放

ローカルPC内だけで確認する場合、WindowsファイアウォールでNode.jsのパブリック／プライベートネットワーク受信を許可する必要はありません。サーバー終了時は起動したターミナルで `Ctrl+C` を押します。

## Web配布

- itch.ioのブラウザ版は`npm run build:renderer`で作成した`dist/`のみをアップロードします。
- GitHubから取得する版はソース一式を保持し、`npm ci`後に`npm run dev:web`でローカルHTTPサーバーから起動します。
- 表札のNoto Sans JP subsetはGitHubソース版に生成用資産として含みます。production `dist/`にTTFは含めず、生成済みAtlas、文字Mesh入りGLB、OFL 1.1と第三者ライセンス表示を含めます。
- `public/audio`と`public/picture/chara`はローカル開発専用です。production buildではこれらのinventoryを読み込まず、`public/`全体もコピーしません。配布を許可したライセンス表示とstage assetだけを固定一覧から出力します。
- `npm run build:renderer`は生成後にWeb配布監査を自動実行します。ローカル音声、Character画像、生成用font、または固定一覧外のファイルが`dist/`へ混入した場合、そのbuildは失敗するためアップロードしないでください。
- Electronパッケージはこの配布手順の対象外です。

## 検証

```powershell
npm run audit:v2:dependencies
npm run build
npm run build:t01
npm run build:t02
npm run build:t03
npm run build:t04
npm run build:t05
npm run build:b05
```

`audit:v2:dependencies`は、通常Web入口、V2実行モジュール、T01～T04検証へステージJSON・旧セル型・旧セル実装が再混入していないことを検査します。`typecheck:t05`はT05検証の型に加え、共通飛行Runtimeに学校固有文字列が混入していないことも検査します。

NavMeshを学校GLBから再生成する制作コマンドは次のとおりです。

```powershell
npm run bake:v2:school-navmesh
```

ベイク結果は代表経路、容量、SHA-256、同一入力からの再現性まで検証されます。GLBとNavMeshのどちらか一方だけを更新しないでください。

## 現在の境界

- B03-0: T04計画の「B03-0へのビット通過窓・屋上接近引き渡し契約」を基に、窓、各階用途、当時の固定経路を設計確定。旧`bit_roof`はT05-1Aで廃止
- B03-1／B03-2: 学校のローポリ仕上げ、実窓開口、Collider、`LNK_*`、階段など同色面の見分けやすさ、内装・最適化を順番に完成
- T04-2A: 高さ付きNavMesh問い合わせ、移動体別Collider、特殊接続の基礎契約を実装済み
- T04-2B: B03最終GLBでNPC複数階移動、実窓・屋上接続分類、学校回帰を統合
- T05-1A: ステージ非依存の飛行ゾーン・帯、別ビットNavMesh bundle、`aperture`／`vertical`／`surface-route`／`boundary`接続、非学校fixture、学校データを実装
- T05-1B: 全ビットモード共通の高度・半径0.54mの3D包絡安全、V1飛行表現、探索・追跡・逃走、共通遷移実行、遷移前のカーペット解除を実装
- 修正案1を確定し、現行58窓の片羽開放幅1.20mは、物理半径0.44m＋余裕0.10m＝包絡半径0.54m（直径1.08m）の実飛行Agentで双方向116/116に合格。旧直径1.28mを理由とする両羽全開の承認待ちは廃止
- T05-2: gun所持NPC・ビットの完成戦闘モード、通常・固定・トラップ・動的ビームを含む全光線、集合、警報、公開処刑の3D統合
- B05: Mission・ミニマップ用の階別Map、Area、主要24目的地、階段、エレベーター乗場、放送卓と最小Runtime読込契約を専用branchで実装・検証済み。独立レビューと`develop`統合待ち
- T06-3／T06-4: B05が独立レビュー後に`develop`へmergeされてからT06-3ミニマップを開始し、そのmerge後にT06-4 Mission・放送Runtimeを開始
- T06／T07: 学校全域、音声、水中速度、資源ライフサイクルの統合後、性能、回帰試験、Web・Electron、仕様書を最終化
- 既存8ステージは将来、個別にGLBとNavMeshへ移行して再導入
- 現在の通常ビーム、ビット・NPC索敵、アラート追跡は学校の3D壁、扇形視野、NavMesh迂回へ対応済みです。

全体進捗は[v2ロードマップ](docs/plan.md)、確定した実行順は[後続タスク計画](docs/plans/v2/next_tasks_plan.md)、今回の実装記録は[T04計画](docs/plans/v2/T04/plan.md)と[B02＋T03テストプレイ計画](docs/plans/v2/B02/testplay_plan.md)を参照してください。
