# HAIGURE SURVIVAL v2 3Dステージランタイム仕様書

更新日: 2026-07-19
対象バージョン: v2

## 1. 文書の位置付け

本書は、HAIGURE SURVIVAL v2のステージ読込、3D空間問い合わせ、NavMesh、マーカー、ボリューム、資源所有権を規定する実行時の正本である。BlenderとGLBの制作規約は[ステージ資産仕様書](./spec_stage_assets_v2.md)を参照する。

V2ではステージJSON、文字マップ、セル座標、`GridLayout`、`FloorCell`、セルBFSを使用しない。互換アダプター、旧形式フォールバック、旧新二重ロード経路も作らない。当面の通常ゲーム対象は学校だけとし、既存8ステージは個別に3D資産化されるまでV2へ登録しない。

## 2. 空間データの所有関係

```text
.blend（編集正本）
  -> 規約準拠GLB（実行時の空間正本）
       -> 事前ベイクNavMeshバイナリ（再生成可能な派生物）

TypeScript StageCatalogEntry（非空間の索引）
  -> GLB URL
  -> NavMesh URL
```

- 表示、衝突、NavMesh生成形状、スポーン位置、向き、領域、境界はGLBだけに置く。
- NavMeshバイナリはGLB、管理親縮尺、Recast版、ベイクプロファイルから再生成する。
- TypeScriptカタログへ座標、セル、ゾーン矩形、経路点、衝突形状を記述しない。

## 3. ステージカタログ

通常ゲームは次の非空間型だけを参照する。

```ts
export type StageCatalogEntry = Readonly<{
  id: string;
  label: string;
  glbUrl: string;
  navmeshUrl: string;
  assetSchemaVersion: number;
  navProfileId: string;
  glbSha256: string;
  navmeshSha256: string;
}>;
```

- `id`はGLBの`META_Stage.hs_stage_id`と一致させる。
- `navProfileId`はGLBとNavMesh生成記録の双方に一致させる。
- ハッシュ不一致は読込失敗とし、古いNavMeshを継続使用しない。
- 当面のカタログ件数は学校1件とする。

## 4. `StageSpatialContext`

`StageSpatialContext`は、1回のステージ読込で生成したすべての空間資源を所有する。

```ts
export type StageSpatialContext = Readonly<{
  stage: StageCatalogEntry;
  resources: StageSpatialResources;
  navigation: NavigationWorld;
  markers: StageMarkerRegistry;
  volumes: StageVolumeRegistry;
  boundary: StageBoundary;
  queries: StageSpatialQueries;
  dispose(): void;
}>;
```

`StageSpatialResources`は最低限、次の排他的な集合を持つ。

| 集合 | 入力Object | 用途 |
|---|---|---|
| `visualMeshes` | `VIS_*` | 表示 |
| `actorColliders` | `COL_*`、`COL_ActorOnly_*` | プレイヤー・NPC・ビット移動 |
| `beamBlockers` | 通常`COL_*`だけ | 全ビーム遮蔽 |
| `sightBlockers` | 通常`COL_*`だけ | 視線遮蔽 |
| `navSourceMeshes` | `NAV_*` | 検証・再ベイク |
| `semanticMeshes` | `VOL_*`、`BND_*`、`PRT_*` | 3D意味判定 |
| `semanticNodes` | `META_*`、`MRK_*`、`LNK_*` | メタデータ・位置・特殊接続 |

`COL_ActorOnly_*`は`actorColliders`にだけ含め、`beamBlockers`と`sightBlockers`から除外する。窓はこの分類により、移動を止めながら視線とビームを通す。

## 5. GLB読込と分類

読込は次の順序で行う。

1. `SceneLoader.LoadAssetContainerAsync`でGLBを読む。
2. `createRootMesh()`で作者Nodeの外側に管理親を作り、0.25の一様縮尺を設定する。
3. `container.meshes`と`container.transformNodes`を列挙する。
4. Object名、Blender型に対応するBabylon Node型、`metadata.gltf.extras`を検査する。
5. 資産仕様の各集合へ排他的に分類する。
6. `META_Stage`、必須marker、必須volume、`BND_Stage`を検査する。
7. GLBとNavMeshのカタログハッシュ、schema version、nav profileを照合する。
8. NavMeshバイナリを読み、`NavigationWorld`を構築する。
9. すべて成功した後だけ`addAllToScene()`し、旧Contextと交換する。

未知接頭辞、重複ID、型違い、必須extras欠落、NavMesh不整合は即時エラーとする。欠落時に座標をTypeScriptへ直書きしたり、旧JSONへ戻したりしない。

## 6. `NavigationWorld`

ゲーム処理へBabylonのRecast型を直接公開しない。

```ts
export type NavigationPath = Readonly<{
  points: readonly Vector3[];
  distance: number;
}>;

export interface NavigationWorld {
  projectPoint(position: Vector3, maxDistance: number): Vector3 | null;
  findPath(start: Vector3, destination: Vector3): NavigationPath | null;
  constrainMovement(start: Vector3, destination: Vector3): Vector3 | null;
  randomPointAround(origin: Vector3, radius: number): Vector3 | null;
  createDebugMesh(scene: Scene): Mesh;
  dispose(): void;
}
```

- APIは床高を含むBabylon world座標の`Vector3`だけを扱う。
- 経路なし、投影不能は`null`とし、標的への直進へ切り替えない。
- 初期実装は`computePath()`の3D角点を追従する。Crowdと平滑化は計測後に別途採否を決める。
- 通常扉、段差、階段ランプ、踊り場は連続NavMeshとして表す。
- 梯子、昇降機、テレポートなど連続面で表せない接続だけを`LNK_*`グラフで補う。
- NPCとビットは共通経路APIを使う。ビットはNavMesh上の床高へ飛行相対高度を加える。

## 7. NavMesh生成と読込

採用実装は`recast-navigation` 0.43.1を固定して使用する。Babylon.jsの`RecastJSPlugin`へNavMeshの所有権を渡さず、V2の`NavigationWorld` adapterが`NavMesh`と`NavMeshQuery`を直接所有する。

本番起動時にGLB全体からNavMeshを生成しない。T04検証・ベイク入口で次を実行する。

1. 規約準拠GLBを読み、`NAV_*`だけを抽出する。
2. `NAV_*`のworld座標三角形をRecastの右手座標・反時計回り規約へ変換し、固定ベイクプロファイルで`generateSoloNavMesh()`または確定後のtiled generatorを実行する。
3. debug Mesh、扉、階段、閉鎖地点、到達不能領域を検証する。
4. 代表経路の3D点列と距離を記録する。
5. `exportNavMesh()`の結果を`.navmesh.bin`へ保存する。
6. `importNavMesh()`で新規`NavMesh`へ復元し、新規`NavMeshQuery`の代表経路が一致することを確認する。
7. GLB SHA-256、NavMesh SHA-256、Recast版、プロファイルID、生成時間、容量を記録する。

本編はバイナリ読込、`importNavMesh()`、`NavMeshQuery`構築だけを行う。GLBまたはベイク条件を変更した場合はNavMeshを必ず再生成する。

## 8. マーカー

`StageMarkerRegistry`は`MRK_*`を`hs_role`ごとに索引化する。位置と向きはNodeのworld Transformをそのまま使用する。

初期role:

- `player_spawn`: プレイヤー初期位置。学校では1件必須。
- `assembly_anchor`: 集合演出の基準位置。
- `patrol_anchor`: 明示的な巡回基準が必要な場合だけ使用。

NPCとビットのランダム出現は多数の点を列挙せず、対応する3D Volume内からNavMesh上の点を抽選する。

## 9. ボリュームと境界

`StageVolumeRegistry`は`VOL_*`を`hs_role`ごとに索引化する。点包含、線分交差、最近接面を3D Meshへ問い合わせる。

初期role:

- `npc_spawn`
- `bit_spawn`
- `assembly`
- `no_enemy_spawn`
- `no_enemy_enter`
- `no_combat`
- `hazard`

`BND_Stage`はプレイ可能な3D空間を定義する。範囲外時の再配置先は`MRK_PlayerSpawn_*`または最後に確認したNavMesh上の安全点とする。AABBだけで凹形状や上下階を判定しない。

## 10. 3D空間問い合わせ

```ts
export interface StageSpatialQueries {
  castBeamSegment(from: Vector3, to: Vector3): SpatialHit | null;
  castSightSegment(from: Vector3, to: Vector3): SpatialHit | null;
  sampleGround(origin: Vector3, maxDistance: number): SpatialHit | null;
  containsVolume(role: StageVolumeRole, point: Vector3): boolean;
}
```

- ビームは前フレーム位置から新位置まで連続線分判定し、最初の`beamBlockers`交点で停止・着弾する。
- 視線は観測点から標的中心まで`sightBlockers`へ線分判定する。
- 通常索敵は距離、扇形視野、遮蔽物なしの全条件を満たす標的だけを取得する。
- 通常視認由来の標的は遮蔽時に解除する。アラート由来の標的は期限まで保持できるが、ビームは壁を貫通しない。
- 床高は下向き3D Rayで`actorColliders`の支持面へ問い合わせる。NavMeshの高さを物理接地面の代用にしない。

## 11. AI移動

- NPCとビットは、標的または目的Volumeが変わった時だけ`findPath()`を再実行し、3D経路点をキャッシュする。
- 視認標的が遮蔽されて通常追跡を解除した場合は、古い経路も破棄する。
- アラート標的は期限内だけ保持し、NavMesh経路で扉へ回り込む。
- 経路がない場合は壁へ直進せず停止し、規定間隔後に再探索する。
- カーペット爆撃など直進編隊が障害物で成立しない場合、編隊を解除してNavMesh追跡へ移行する。

## 12. 未接続システム

学校GLBへ必要な`MRK_*`または`VOL_*`がないシステムは、対応資産が追加されるまで明示的に無効化する。セル互換、既定座標、全面床、AABB代用を追加しない。

T04の学校通常プレイ接続として、プレイヤー、NPC、ビット、通常ビーム、視線の3Dランタイム統合を完了した。固定光線、トラップ光線、動的ビーム、公開処刑などの完全な3D統合はT05で行う。

## 13. ライフサイクル

- `StageSpatialContext`構築に失敗した場合、新ContextのAssetContainer、NavMesh、debug Mesh、イベント購読を破棄し、旧Contextは維持する。
- 成功時は入力停止、プレイヤー再配置、新Context有効化、旧Context破棄の順に交換する。
- `dispose()`はステージ所有のMesh、TransformNode、Material、Texture参照、NavMesh adapter、Crowd、debug Mesh、イベント購読を1回だけ解放する。
- `recast-navigation`のWASM moduleはアプリ寿命で1回だけ初期化する。ステージごとの`NavMeshQuery`、`NavMesh`、debug Meshは`NavigationWorld.dispose()`で明示的に破棄する。
- 複数3Dステージを再導入する前に、NavMesh再構築時の明示破棄とWASMメモリ推移を専用試験する。

## 14. 検証条件

- V2モジュールにステージJSON、`GridLayout`、`FloorCell`、`worldToCell`、`cellToWorld`、セルBFS参照がない。
- 学校の主玄関、教室扉、3階段、校庭、渡り廊下、体育館が連続NavMeshで接続される。
- 壁を挟んだ経路が扉へ迂回し、閉鎖地点と窓開口を通らない。
- 階段経路の各点が床高を持ち、NPCとビットが階段ランプを滑らかに昇降する。
- 壁越しに通常索敵せず、窓越しには視認する。
- 通常ビームは壁へ着弾し、窓を透過する。
- 学校の破棄・再読込後にScene資源、NavMesh、イベント購読が増加しない。
- Web開発版、Web本番ビルド、Electronビルドで同じNavMeshバイナリを読める。
- UTF-8 BOMなし、括弧対応、`git diff --check`、GLB・NavMeshハッシュ監査が成功する。
