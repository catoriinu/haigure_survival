# HAIGURE SURVIVAL v2.0.0

ハイグレ洗脳されたい人向けの一人称視点サバイバルゲームです。

v2.0.0では、複数階の学校を舞台にした3Dステージへ移行しました。通常ゲームの対象は学校のみで、v1.3.1の既存8ステージと旧設定の自動移行には対応していません。変更内容、互換性、既知の問題は[v2.0.0リリースノート](docs/releases/v2.0.0.md)を参照してください。

## 現在のV2ステージ方式

- ステージ空間の正本はGLBの3D形状、意味Object、事前ベイクしたRecast NavMeshです。
- JSON文字マップ、セル座標、`GridLayout`、`FloorCell`、セルBFSはV2で使用しません。
- 旧8ステージはV2から一時的に外しています。将来、個別にGLBとNavMeshへ移行して再導入します。
- TypeScriptのステージカタログにはID、表示名、GLB／NavMesh URL、資産ハッシュなど、空間を重複記述しない情報だけを保持します。
- 学校1～4階、屋上、校庭、渡り廊下、体育館をゲーム空間として扱います。人間用複数階NavMeshに加え、任意の飛行ゾーン・飛行帯を持つビット専用NavMesh bundleと明示接続グラフを使用します。
- 学校はschema version 3の意味資産として、5階層の専用Map、53 Area、25 Mission Location、17階段踊り場、4エレベーター乗場、放送卓を持ちます。RuntimeはObject名や座標から意味を推測せず、GLB metadataの厳格な参照だけを使用します。
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

いきなり公開処刑では、処刑中・完了後とも`R`でその場からリプレイします。キャラクターの画像・ボイス、会場、設定、射手担当はタイトルに戻るまで保持し、BIT／NPCの発射タイミングだけを再抽選します。素材の読み込みや追加クリックは不要です。`Enter`はタイトル画面へ戻ります。

ローカルPC内だけで確認する場合、WindowsファイアウォールでNode.jsのパブリック／プライベートネットワーク受信を許可する必要はありません。サーバー終了時は起動したターミナルで `Ctrl+C` を押します。

### デバッグモードの切り替え

[src/v2/debugMode.ts](src/v2/debugMode.ts)の先頭にある`V2_DEBUG_MODE`を変更します。

```typescript
export const V2_DEBUG_MODE = false;
```

- `false`：通常モード。詳細診断を隠し、体力制限付きダッシュを使います。通常のテストプレイ・commit・配布ではこちらにします。
- `true`：デバッグモード。詳細診断を表示し、ダッシュの体力制限を外します。

保存後にブラウザを再読み込みしてください。配布版へ反映する場合は`npm run build:renderer`で再ビルドします。タイトル設定やブラウザ保存値では切り替わりません。

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

## v2.0.0の対応範囲

- 複数階の学校、体育館、校庭、屋上、動的な扉とエレベーター、通常・荒れた教室を統合しています。
- NPCの複数階移動、ビットの立体飛行、3D遮蔽を使う索敵・光線、同陣営NPCへの指示に対応しています。
- 階別ミニマップ、現在地表示、Mission、同行者、校内放送、公開処刑会場の切り替えを実装しています。
- 学校向けタイトル設定、通常／いきなり公開処刑、ゲームオーバーとリプレイ、小画面向け設定表示、再開始時の静的学校資源再利用を実装しています。
- 既存8ステージ、学校トラップ・動的3Dマップビーム、リアルタイム鏡面反射はv2.0.0の対象外です。
- 最終Web受入は、[既知9項目のユーザー許容](docs/plans/v2/T07/accepted-known-issues.md)を含めて完了しています。性能基準の全項目合格や既知問題の修正完了を意味しません。

変更概要は[リリースノート](docs/releases/v2.0.0.md)、作業記録は[v2ロードマップ](docs/plan.md)、[後続タスク計画](docs/plans/v2/next_tasks_plan.md)、[リリース準備計画](docs/plans/v2/release-preparation/plan.md)を参照してください。
