# HAIGURE SURVIVAL v2 3Dステージランタイム仕様書

更新日: 2026-07-20
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
  metadata: StageMetadata;
  resources: StageSpatialResources;
  navigation: NavigationWorld;
  markers: StageMarkerRegistry;
  volumes: StageVolumeRegistry;
  links: StageLinkRegistry;
  boundary: StageBoundary;
  queries: StageSpatialQueries;
  dispose(): void;
}>;
```

移動者は共通して次の型で区別する。

```ts
export type StageMoverKind = "player" | "npc" | "bit";
```

`StageSpatialResources`は最低限、次の排他的な作者Object集合と、そこから構成した移動者別集合を持つ。

| 集合 | 入力Object | 用途 |
|---|---|---|
| `visualMeshes` | `VIS_*` | 表示 |
| `normalColliders` | 通常`COL_*` | 全移動体、全光線、視線を遮る |
| `actorOnlyColliders` | `COL_ActorOnly_*` | プレイヤー・NPC・ビットだけを遮る |
| `humanOnlyColliders` | `COL_HumanOnly_*` | プレイヤー・NPCだけを遮る |
| `movementColliders` | 上記3集合から`StageMoverKind`別に構成 | 移動線分判定 |
| `beamBlockers` | 通常`COL_*`だけ | 全ビーム遮蔽 |
| `sightBlockers` | 通常`COL_*`だけ | 視線遮蔽 |
| `navSourceMeshes` | `NAV_*` | 検証・再ベイク |
| `semanticMeshes` | `VOL_*`、`BND_*`、`PRT_*` | 3D意味判定 |
| `semanticNodes` | `META_*`、`MRK_*`、`LNK_*` | メタデータ・位置・特殊接続 |

移動者別集合は次の表を正本とする。

| Collider | `player` | `npc` | `bit` | 視線・全光線 |
|---|---:|---:|---:|---:|
| 通常`COL_*` | 停止 | 停止 | 停止 | 遮蔽 |
| `COL_ActorOnly_*` | 停止 | 停止 | 停止 | 透過 |
| `COL_HumanOnly_*` | 停止 | 停止 | 透過 | 透過 |

閉じた窓は`COL_ActorOnly_Window_*`とし、全移動体を止めながら視線と全光線を通す。指定した開いた窓または割れた窓は、残るガラス羽を`COL_ActorOnly_WindowFixed_*`、実開口を`COL_HumanOnly_Window_*`とする。前者は全移動体を止め、後者はプレイヤーとNPCを止めてビットを通す。どちらも視線と全光線を通す。`PRT_*`の既存room、streaming、door trigger用途は維持するが、`bit_window`と`bit_roof`は`PRT_*`で表さない。

## 5. GLB読込と分類

読込は次の順序で行う。

1. `SceneLoader.LoadAssetContainerAsync`でGLBを読む。
2. `createRootMesh()`で作者Nodeの外側に管理親を作り、0.25の一様縮尺を設定する。
3. `container.meshes`と`container.transformNodes`を列挙する。
4. Object名、Blender型に対応するBabylon Node型、`metadata.gltf.extras`を検査する。
5. 資産仕様の各集合へ排他的に分類する。
6. `META_Stage`、必須marker、必須volume、`BND_Stage`、`PRT_*`のrole、`LNK_*`のA/B pairを検査する。
7. GLBとNavMeshのカタログハッシュ、schema version、nav profileを照合する。
8. `LNK_*`を`StageLinkPair`へ組み立て、`StageLinkRegistry`を構築する。
9. NavMeshバイナリを読み、link pairの両端を対応するNavMesh面へ投影して`NavigationWorld`を構築する。
10. すべて成功した後だけ`addAllToScene()`し、旧Contextと交換する。

未知接頭辞、重複ID、型違い、必須extras欠落、NavMesh不整合は即時エラーとする。欠落時に座標をTypeScriptへ直書きしたり、旧JSONへ戻したりしない。

## 6. `NavigationWorld`

ゲーム処理へBabylonのRecast型を直接公開しない。

```ts
export type StageLinkKind =
  | "ladder"
  | "elevator"
  | "teleport"
  | "bit_window"
  | "bit_roof";

export type StageLinkEndpoint = Readonly<{
  endpoint: "A" | "B";
  position: Vector3;
  node: TransformNode;
}>;

export type StageLinkPair = Readonly<{
  id: string;
  kind: StageLinkKind;
  bidirectional: boolean;
  radiusMeters: number;
  endpointA: StageLinkEndpoint;
  endpointB: StageLinkEndpoint;
}>;

export interface StageLinkRegistry {
  readonly all: readonly StageLinkPair[];
  getById(id: string): StageLinkPair | null;
  getByKind(kind: StageLinkKind): readonly StageLinkPair[];
}

export type NavigationLocation = Readonly<{
  position: Vector3;
  polygonRef: number;
}>;

export type NavigationSurfaceStep = Readonly<{
  kind: "surface";
  points: readonly NavigationLocation[];
  distance: number;
}>;

export type NavigationTransitionStep = Readonly<{
  kind: "transition";
  link: StageLinkPair;
  from: "A" | "B";
  to: "A" | "B";
  entry: NavigationLocation;
  exit: NavigationLocation;
  distance: number;
}>;

export type NavigationPath = Readonly<{
  steps: readonly (NavigationSurfaceStep | NavigationTransitionStep)[];
  destination: NavigationLocation;
  distance: number;
}>;

export interface NavigationWorld {
  projectPoint(position: Vector3, maxDistance: number): NavigationLocation | null;
  findPath(
    start: NavigationLocation,
    destination: NavigationLocation,
    moverKind: StageMoverKind
  ): NavigationPath | null;
  constrainMovement(
    start: NavigationLocation,
    destination: Vector3
  ): NavigationLocation | null;
  randomPointAround(
    origin: NavigationLocation,
    radius: number
  ): NavigationLocation | null;
  createDebugMesh(scene: Scene): Mesh;
  dispose(): void;
}
```

- `NavigationLocation`はBabylon world座標と、その位置が属するRecast polygonの`polygonRef`を必ず組で保持する。現在地、経路点、目的地、移動拘束結果、ランダム点から`polygonRef`を捨てて`Vector3`だけへ戻してはならない。
- 同じ水平位置に上下の床が重なる場合は、現在の`polygonRef`から到達可能な面を使う。X/Z距離だけで最寄りの別階へ再投影しない。
- 経路なし、投影不能は`null`とし、標的への直進へ切り替えない。
- `surface` stepは通常床、段差、階段ランプ、踊り場を通るNavMesh上の3D点列、`transition` stepは`LNK_*`の固定接続を表す。両者を単一の点列へ潰さない。
- `StageLinkPair.endpointA/B.position`は作者がGLBへ配置した実飛行座標を保持する。`NavigationTransitionStep.entry/exit`は、その端点からNavMeshへ接続した面上の座標を保持し、両者を同じ座標として扱わない。
- `LNK_*`端点の接続面は、`hs_link_radius_m × worldScale`の水平半径内を端点からNavMesh下端まで検索する。端点以下の候補だけを残し、垂直差、水平差、polygon参照の順に昇順で選ぶ。通常の`projectPoint()`が使う上下探索範囲は変更しない。
- 通常扉、段差、階段ランプ、踊り場は連続NavMeshとして表す。
- 梯子、昇降機、テレポート、指定されたビット通過窓、ビット屋上接近など連続面で表せない接続だけを`LNK_*`グラフで補う。
- `findPath()`は`moverKind`が利用できるlinkだけを経路候補にする。`bit_window`と`bit_roof`はビット専用かつ双方向必須であり、プレイヤーとNPCの経路へ含めない。
- `findPath()`は最初に始点から終点への通常`surface`経路を1回だけ探索する。playerとNPCはその結果だけを返し、特殊接続グラフへ入らない。bitも通常経路が成立した場合はその結果を返し、通常経路が成立しない場合だけA*で利用可能な特殊接続を探索する。
- 特殊接続A*の端点間`surface`経路は、探索で必要になった時点で初めて計算する。キャッシュキーは順不同の端点index pairとし、`path`または`null`を保持する。逆方向は同じ経路点を反転して再利用し、起動時の全端点間探索、LRU、遷移数上限、直線フォールバックは設けない。
- `transition.distance`は`entry→作者端点from + 作者端点from→作者端点to + 作者端点to→exit`の3区間合計とする。
- 経路追従は`transition`入口へ到達した時点で`transition-required`を返す。T04は特殊接続を瞬間移動で消化せず、窓通過と屋上接近の実飛行をT05-1へ引き渡す。
- NPCとビットは共通経路APIを使う。ビットはNavMesh上の物理床高へ飛行相対高度を加える。

## 7. NavMesh生成と読込

採用実装は`recast-navigation` 0.43.1を固定して使用する。Babylon.jsの`RecastJSPlugin`へNavMeshの所有権を渡さず、V2の`NavigationWorld` adapterが`NavMesh`と`NavMeshQuery`を直接所有する。

本番起動時にGLB全体からNavMeshを生成しない。T04検証・ベイク入口で次を実行する。

1. 規約準拠GLBを読み、`NAV_*`だけを抽出する。
2. `NAV_*`のworld座標三角形をRecastの右手座標・反時計回り規約へ変換し、固定ベイクプロファイルで`generateSoloNavMesh()`または確定後のtiled generatorを実行する。
3. debug Mesh、扉、階段、閉鎖地点、到達不能領域を検証する。
4. 代表経路の3D点列と距離を記録する。
5. `exportNavMesh()`の結果を`.navmesh.bin`へ保存する。
6. `importNavMesh()`で新規`NavMesh`へ復元し、新規`NavMeshQuery`の代表経路が一致することを確認する。
7. 同じGLBの各`LNK_*`端点が水平`hs_link_radius_m × worldScale`以内かつ端点以下の正しいNavMesh面へ投影でき、`bit_window`と`bit_roof`が双方向であることを確認する。
8. GLB SHA-256、NavMesh SHA-256、Recast版、プロファイルID、生成時間、容量を記録する。

本編はバイナリ読込、`importNavMesh()`、`NavMeshQuery`構築に加え、GLB由来の`StageLinkRegistry`を経路グラフへ接続する。`LNK_*`をNavMeshバイナリへ焼き込まない。GLBまたはベイク条件を変更した場合はNavMeshを必ず再生成し、GLBとNavMeshの組を再監査する。B03-2統合後の最終GLB、`bit_window` 58組、`bit_roof` 2組、120端点のNavMesh投影はT04-2Bで同時に確定済みである。

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
- `water`: 水中判定に用いる閉じた3D領域。T04-2Bで学校GLBからの読込、内外問い合わせ、プール底へのNavMesh到達、破棄・再読込までを確認済みである。水中水平速度50%と通常速度への復帰はT06で実装する。

`BND_Stage`はプレイ可能な3D空間を定義する。範囲外時の再配置先は`MRK_PlayerSpawn_*`または最後に確認したNavMesh上の安全点とする。AABBだけで凹形状や上下階を判定しない。

## 10. 3D空間問い合わせ

```ts
export interface StageSpatialQueries {
  castMovementSegment(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3
  ): SpatialHit | null;
  castBeamSegment(from: Vector3, to: Vector3): SpatialHit | null;
  castSightSegment(from: Vector3, to: Vector3): SpatialHit | null;
  sampleGround(origin: Vector3, maxDistance: number): SpatialHit | null;
  containsVolume(role: StageVolumeRole, point: Vector3): boolean;
}
```

- 移動は`castMovementSegment(moverKind, from, to)`で移動者別Collider集合へ問い合わせる。移動者種別を省略する旧`castActorSegment()`や、呼出側でColliderを推測する互換経路は作らない。
- 通常、固定、トラップ、動的を含む全光線は前フレーム位置から新位置まで連続線分判定し、最初の`beamBlockers`交点で停止・着弾する。
- 視線は観測点から標的中心まで`sightBlockers`へ線分判定する。
- 通常索敵は距離、扇形視野、遮蔽物なしの全条件を満たす標的だけを取得する。
- 通常視認由来の標的は遮蔽時に解除する。アラート由来の標的は期限まで保持できるが、ビームは壁を貫通しない。
- 床高は下向き3D Rayで`normalColliders`の支持面へ問い合わせる。窓用の`COL_ActorOnly_*`と`COL_HumanOnly_*`を床支持面にせず、NavMeshの高さも物理接地面の代用にしない。

## 11. AI移動

- NPCとビットは`NavigationLocation`を現在地として保持し、標的変更、標的の規定距離以上の移動、再探索期限、stuck時にだけ`findPath()`を再実行して`surface`／`transition` stepをキャッシュする。
- 視認標的が遮蔽されて通常追跡を解除した場合は、古い経路も破棄する。
- アラート標的は期限内だけ保持し、NavMesh経路で扉へ回り込む。
- 経路がない場合は壁へ直進せず停止し、規定間隔後に再探索する。
- `surface` stepはNavMeshへ拘束して追従する。`transition` stepの入口では、移動を実行せず`transition-required`と対象linkを返す。
- カーペット爆撃など直進編隊が障害物で成立しない場合、編隊を解除してNavMesh追跡へ移行する。

### 11.1 T05-1 ビット飛行安全条件

T04は高さ付き経路と特殊接続の選択までを共通基盤として提供し、以下の実飛行はT05-1で接続する。

- 通常飛行時のビット基準位置は、GLBの物理床面上1.0～1.8mに保つ。NavMesh面高を床高の代用にしない。
- 天井までの空きは希望高度より優先する。1.0～1.8mの範囲内で高度を下げても移動包絡と安全余裕を確保できない通常経路へは進入しない。
- 移動可否はビット本体、銃口、最大揺れ幅を包む移動包絡に、全方向0.10m以上の安全余裕を加え、前位置から次位置までの全区間で連続判定する。中心線だけ、静止姿勢だけ、次位置だけの判定にせず、高速移動でも壁、天井、庇、窓枠を飛び越えない。
- 床相対高度1.0～1.8mを外れる実飛行を許すのは、`bit_window`または`bit_roof`の`transition`実行中だけとする。どちらも資産で確定したA/B間の固定経路を使い、経路上の最高高度は両端の高い方を超えない。移動包絡と0.10mの安全余裕は例外にしない。
- 特殊接続の途中で標的を喪失した場合は、その時点から近い側の端点まで進んで`surface`へ復帰する。経路途中で停止したり、毎フレーム往復方向を切り替えたりしない。
- 特殊接続完了後はexit側の`NavigationLocation`と`polygonRef`へ結び直し、接続先の物理床を基準にした通常高度1.0～1.8mへ戻す。
- 階段、別階移動、`bit_window`、`bit_roof`へ入る前にカーペット編隊を解除する。編隊のまま通過せず、通常追跡の単体ビットとして遷移する。
- 標的の高さへの一定加算やステージ全体の最高点だけで飛行高度上限を決める旧処理は使用せず、現在地の物理床と直上天井を正本にする。
- 屋上は窓の設置対象外だが、索敵、標的追跡、経路、戦闘の対象である。屋外や校庭から屋上標的へ高度を上げて接近・帰還するときは、屋外Aと屋上Bを結ぶ双方向`bit_roof`を使う。通常の床・階段NavMeshだけで到達できる現在地からは、その通常経路も候補にできる。

## 12. 実装境界と未接続システム

学校GLBへ必要な`MRK_*`または`VOL_*`がないシステムは、対応資産が追加されるまで明示的に無効化する。セル互換、既定座標、全面床、AABB代用を追加しない。

- T04は`StageMoverKind`、`NavigationLocation.polygonRef`、`surface`／`transition`経路、`StageSpatialContext.links`、移動者別`castMovementSegment()`、`transition-required`、水Volumeの読込・問い合わせ・NavMesh到達までの共通基盤を担当する。
- T05-1は11.1節のビット高度、天井・衝突安全、窓通過、屋上接近・帰還の実飛行を担当する。
- T05-2は既存の戦闘モード、射程維持、通常・固定・トラップ・動的を含む全光線、警報、標的状態遷移を3D空間へ統合する。
- T06はB03最終学校資産を使い、プレイヤー、NPC、ビット、全階、屋上、全光線、ゲーム進行、水中水平速度50%と通常速度への復帰を通した統合確認を行う。

## 13. ライフサイクル

- `StageSpatialContext`構築に失敗した場合、新ContextのAssetContainer、NavMesh、debug Mesh、イベント購読を破棄し、旧Contextは維持する。
- 成功時は入力停止、プレイヤー再配置、新Context有効化、旧Context破棄の順に交換する。
- `dispose()`はステージ所有のMesh、TransformNode、Material、Texture参照、NavMesh adapter、Crowd、debug Mesh、イベント購読を1回だけ解放する。
- `recast-navigation`のWASM moduleはアプリ寿命で1回だけ初期化する。ステージごとの`NavMeshQuery`、`NavMesh`、debug Meshは`NavigationWorld.dispose()`で明示的に破棄する。
- 複数3Dステージを再導入する前に、NavMesh再構築時の明示破棄とWASMメモリ推移を専用試験する。

## 14. 検証条件

- V2モジュールにステージJSON、`GridLayout`、`FloorCell`、`worldToCell`、`cellToWorld`、セルBFS参照がない。
- `StageSpatialContext.links`がGLB内の完全な`LNK_*` pairだけを公開し、`bit_window`と`bit_roof`を`PRT_*`へ重複登録しない。
- 同じX/Zに重なる上下床の`NavigationLocation`が異なる`polygonRef`を保持し、現在地・目的地・移動結果が別階へ誤投影されない。
- 学校の主玄関、教室扉、校庭、渡り廊下、体育館、北西階段の1階～屋上、北東・南西階段の1階～4階が連続NavMeshで接続される。北東・南西から屋上へは接続せず、屋上移動は北西階段を使う。承認済み特殊接続は通常NavMeshが成立しない場合だけ補助する。
- 壁を挟んだ`surface`経路が扉へ迂回し、閉鎖地点と窓開口を通常経路として通らない。階段経路の各点は正しい床高と`polygonRef`を持つ。
- `bit_window`と`bit_roof`はビットのA→B・B→A経路だけに`transition`として現れ、プレイヤーとNPCの経路には現れない。特殊接続入口では実移動せず`transition-required`を返す。
- `COL_ActorOnly_Window_*`と`COL_ActorOnly_WindowFixed_*`はプレイヤー・NPC・ビットを止め、`COL_HumanOnly_Window_*`はプレイヤー・NPCだけを止める。いずれも視線と全光線を透過する。
- T05-1では通常飛行が物理床上1.0～1.8m、天井優先、ビット本体・銃口・最大揺れ幅と0.10m余裕を満たす。高さ帯の例外は`bit_window`／`bit_roof`上だけで、最高高度は高い端点以下、標的喪失時は近い端へ復帰し、進入前にカーペット編隊を解除する。
- 壁越しに通常索敵せず、窓越しには視認する。T05-2で通常・固定・トラップ・動的を含む全光線が壁へ着弾し、両種の窓を透過する。
- T06で全階と屋上を含む学校全域のゲーム進行を統合確認する。
- 学校の破棄・再読込後にScene資源、NavMesh、イベント購読が増加しない。
- Web開発版、Web本番ビルド、Electronビルドで同じNavMeshバイナリを読める。
- UTF-8 BOMなし、括弧対応、`git diff --check`、GLB・NavMeshハッシュ監査が成功する。
