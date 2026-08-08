# HAIGURE SURVIVAL v2 3Dステージランタイム仕様書

更新日: 2026-08-09
対象バージョン: v2

## 1. 文書の位置付け

本書は、HAIGURE SURVIVAL v2のステージ読込、3D空間問い合わせ、NavMesh、マーカー、ボリューム、資源所有権を規定する実行時の正本である。BlenderとGLBの制作規約は[ステージ資産仕様書](./spec_stage_assets_v2.md)を参照する。

V2ではステージJSON、文字マップ、セル座標、`GridLayout`、`FloorCell`、セルBFSを使用しない。互換アダプター、旧形式フォールバック、旧新二重ロード経路も作らない。当面の通常ゲーム対象は学校だけとし、既存8ステージは個別に3D資産化されるまでV2へ登録しない。

## 2. 空間データの所有関係

```text
.blend（編集正本）
  -> 規約準拠GLB（実行時の空間正本）
       -> 人間用NavMeshバイナリ（再生成可能な派生物）
       -> 帯別ビットNavMesh bundle（再生成可能な派生物）

TypeScript StageCatalogEntry（非空間の索引）
  -> GLB URL
  -> 人間用NavMesh URL
  -> ビット用NavMesh bundle URL
  -> Location意味資産対応mode
```

- 表示、衝突、NavMesh生成形状、スポーン位置、向き、領域、境界はGLBだけに置く。
- 両NavMesh成果物はGLB、管理親縮尺、Recast版、各ベイクプロファイルから再生成する。
- TypeScriptカタログへ座標、セル、ゾーン矩形、経路点、衝突形状を記述しない。

## 3. ステージカタログ

通常ゲームは次の非空間型だけを参照する。

```ts
export type StageCatalogEntry = Readonly<{
  id: string;
  label: string;
  glbUrl: string;
  navmeshUrl: string;
  bitNavmeshUrl: string;
  roomVariantNavmesh:
    | Readonly<{ mode: "unsupported" }>
    | Readonly<{
        mode: "required";
        url: string;
        sha256: string;
      }>;
  assetSchemaVersion: number;
  worldBoundaryMode: "required" | "unsupported";
  locationAssetsMode: "required" | "unsupported";
  navProfileId: string;
  bitNavProfileId: string;
  glbSha256: string;
  navmeshSha256: string;
  bitNavmeshSha256: string;
  depthPrePassMaterialNames: readonly string[];
}>;
```

- `id`はGLBの`META_Stage.hs_stage_id`と一致させる。
- `roomVariantNavmesh`は部屋variant非対応時の`unsupported`と、bundle URL・SHA-256を必須にする`required`の判別可能unionとする。互換wrapper、欠落時fallback、Runtime再生成は使用しない。
- `worldBoundaryMode`は空間形状ではなく、対応資産世代を厳格に選ぶ非空間契約である。`required`では`BND_WorldLimit`を正確に1件要求し、`unsupported`では同Objectを許可しない。
- `locationAssetsMode`も対応資産世代を厳格に選ぶ非空間契約である。`required`はschema version 3以上とB05意味資産の完全な目録を要求し、`unsupported`はB05用`MAP_*`、Marker、Volumeを1件も許可しない。
- `navProfileId`と`bitNavProfileId`はGLBと各NavMesh生成記録の双方に一致させる。
- `depthPrePassMaterialNames`は、半透明面の重なり順を安定させるため、透明Color pass前に深度を確定するMaterial名を重複なく列挙する。各名前はGLB内のMaterialちょうど1件と一致しなければ読込失敗とする。
- GLB、静的人間用NavMesh、対応時の部屋variant bundle、ビット用NavMeshのいずれかのハッシュが不一致なら読込失敗とし、古い成果物を継続使用しない。
- 当面のカタログ件数は学校1件とする。

## 4. `StageSpatialContext`

`StageSpatialContext`は、1回のステージ読込で生成したすべての空間資源を所有する。

```ts
export type StageWorldBoundary = Readonly<{
  id: "world-limit";
  mesh: Mesh;
  contains(point: Vector3): boolean;
  findExitPoint(from: Vector3, to: Vector3): Vector3 | null;
}>;

export type StageSpatialContext = Readonly<{
  stage: StageCatalogEntry;
  metadata: StageMetadata;
  resources: StageSpatialResources;
  dynamicVariants: DynamicStageSpatialVariants;
  navigation: NavigationWorld;
  bitNavigation: BitFlightNavigationWorld;
  markers: StageMarkerRegistry;
  volumes: StageVolumeRegistry;
  playerSpawns: StagePlayerSpawnRegistry;
  assemblyVenues: StageAssemblyVenueRegistry;
  links: StageLinkRegistry;
  boundary: StageBoundary;
  worldBoundary: StageWorldBoundary | null;
  locationAssets: StageLocationAssetRegistry | null;
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
| `beamSightOnlyColliders` | `COL_BeamSightOnly_*` | 移動体を通し、全ビームと視線だけを遮る |
| `movementColliders` | 上記3集合から`StageMoverKind`別に構成 | 移動線分判定 |
| `beamBlockers` | 通常`COL_*`と`COL_BeamSightOnly_*` | 全ビーム遮蔽 |
| `sightBlockers` | 通常`COL_*`と`COL_BeamSightOnly_*` | 視線遮蔽 |
| `navSourceMeshes` | `hs_nav_set=human`の`NAV_*` | 人間用検証・再ベイク |
| `bitFlightNavSourceMeshes` | `hs_nav_set=bit-flight`の`NAV_BitFlight_*` | ビット用検証・再ベイク |
| `semanticMeshes` | `MAP_*`、`VOL_*`、`BND_*`、`PRT_*` | 3D意味判定 |
| `semanticNodes` | `META_*`、`MRK_*`、`LNK_*` | メタデータ・位置・特殊接続 |

`StageSpatialResources`の配列はAssetContainer内に存在する全作者Objectの所有元であり、現在有効な衝突・遮蔽集合の正本にはしない。T04-3A以降の現在値は、次の公開契約だけから取得する。

```ts
export type DynamicStageSpatialActiveSet = Readonly<{
  movementColliders: StageMovementColliderSets;
  groundColliders: readonly Mesh[];
  beamBlockers: readonly Mesh[];
  sightBlockers: readonly Mesh[];
  bitObstacles: readonly Mesh[];
}>;

export type DynamicStageSpatialSnapshot =
  DynamicStageSpatialActiveSet &
  Readonly<{
    revision: number;
  }>;

export interface DynamicStageSpatialVariants {
  readonly revision: number;
  getSnapshot(): DynamicStageSpatialSnapshot;
  replaceActiveSet(
    next: DynamicStageSpatialActiveSet
  ): DynamicStageSpatialSnapshot;
  dispose(): void;
}

export interface StageSpatialQueries {
  readonly revision: number;
  castMovementSegment(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3
  ): SpatialHit | null;
  castMovementSphere(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3,
    radius: number
  ): SpatialSphereSweepHit | null;
  castBeamSegment(from: Vector3, to: Vector3): SpatialHit | null;
  castSightSegment(from: Vector3, to: Vector3): SpatialHit | null;
  sampleGround(origin: Vector3, maxDistance: number): SpatialHit | null;
  containsVolume(role: StageVolumeRole, point: Vector3): boolean;
  dispose(): void;
}
```

- セッション開始時に通常・荒れvariantと初期扉・エレベーター状態を組み立てた完全な集合をrevision `0`とする。
- 1回のシミュレーション更新では、状態機械、動的Meshのworld Transform、次の5集合を先に確定して`replaceActiveSet()`へ渡す。同メソッド内で次revision用の動的空間索引・三角形cacheを構築し、5集合・cache・revisionを持つ1個のsnapshot参照を最後に原子的に差し替える。`revision` getterは常にcurrent snapshotの値を返し、集合とrevisionを別々に公開しない。
- 集合への出入りだけでなく、ビーム・視線を遮るエレベーター扉パネルなどのworld Transformが変わった更新でもrevisionを進める。同一更新内の複数Mesh変更は1回の公開へまとめる。
- 各問い合わせは開始時の1つのsnapshotだけを使用し、処理途中で別revisionの集合を混在させない。`StageSpatialQueries.revision`は直近に取り込んだsnapshot revisionを返す。
- 静的作者Meshの索引は再利用してよい。動的Meshのworld三角形、動的空間索引、known-safe-center cache、ground cache、扉gate・BIT障害物に依存する経路判定はrevisionをkeyへ含めるか、新revision公開前に無効化する。
- `DynamicStageSpatialVariants`はsnapshot、動的索引、cache、購読を所有し、作者Mesh自体は所有しない。既存の静的配列を読む互換wrapperやrevision不一致時のfallbackは追加しない。
- T04-3A後の`createStageSpatialQueries()`は`DynamicStageSpatialVariants`を受け取り、構築時の`movementColliders`、`groundColliders`、`beamBlockers`、`sightBlockers`配列をoptionsへ保持しない。既存利用元を同じ変更内で新factory契約へ統一する。

移動者別集合は次の表を正本とする。

| Collider | `player` | `npc` | `bit` | 視線・全光線 |
|---|---:|---:|---:|---:|
| 通常`COL_*` | 停止 | 停止 | 停止 | 遮蔽 |
| `COL_ActorOnly_*` | 停止 | 停止 | 停止 | 透過 |
| `COL_HumanOnly_*` | 停止 | 停止 | 透過 | 透過 |
| `COL_BeamSightOnly_*` | 透過 | 透過 | 透過 | 遮蔽 |

閉じた窓は`COL_ActorOnly_Window_*`とし、全移動体を止めながら視線と全光線を通す。指定した開いた窓または割れた窓は、残るガラス羽を`COL_ActorOnly_WindowFixed_*`、実開口を`COL_HumanOnly_Window_*`とする。前者は全移動体を止め、後者はプレイヤーとNPCを止めてビットを通す。どちらも視線と全光線を通す。`PRT_*`の既存room、streaming、door trigger用途は維持するが、ビット遷移を`PRT_*`や人間用`StageLinkRegistry`へ登録しない。

## 5. GLB読込と分類

読込は次の順序で行う。

1. `SceneLoader.LoadAssetContainerAsync`でGLBを読む。
2. `createRootMesh()`で作者Nodeの外側に管理親を作り、0.25の一様縮尺を設定する。
3. `container.meshes`と`container.transformNodes`を列挙する。
4. Object名、Blender型に対応するBabylon Node型、`metadata.gltf.extras`を検査する。
5. 資産仕様の各集合へ排他的に分類する。
6. `META_Stage`、必須marker、通常volume、飛行遷移volume、`BND_Stage`、B04対応ステージの`BND_WorldLimit`、`PRT_*`、人間用link、ビット用aperture pairを検査する。
7. GLB、人間用NavMesh、ビットNavMesh bundleのカタログハッシュ、schema version、両profileを照合する。
8. 人間用`LNK_*`だけを`StageLinkPair`へ組み立て、`StageLinkRegistry`を構築する。
9. `assembly_anchor` Markerと`assembly` Volumeを1対1に結び、`StageAssemblyVenueRegistry`を構築する。
10. `NAV_BitFlight_*`から任意数のゾーン・帯を構築し、GLBの帯キー集合とbundle目録を完全一致検査する。
11. 人間用`NavigationWorld`と、帯ごとに独立した`NavigationWorld`および明示遷移グラフを持つ`BitFlightNavigationWorld`を構築する。
12. `locationAssetsMode="required"`では、動的エレベーター資産と空間queryの構築後に`StageLocationAssetRegistry`を組み立て、floor、Area、Mission、踊り場、放送卓、NavMesh被覆を検証する。`unsupported`では`null`とする。
13. すべて成功した後だけ`addAllToScene()`し、旧Contextと交換する。

未知接頭辞、重複ID、型違い、必須extras欠落、NavMesh不整合は即時エラーとする。欠落時に座標をTypeScriptへ直書きしたり、旧JSONへ戻したりしない。

## 6. `NavigationWorld`

ゲーム処理へBabylonのRecast型を直接公開しない。

```ts
export type StageLinkKind =
  | "ladder"
  | "elevator"
  | "teleport";

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
- 固定グリッドtiled人間用NavMeshでは、隣接tileの共有XZ境界で、`walkableClimb`以内の量子化Y差を持つpolygonへ`constrainMovement()`が遷移できる。`NavigationAgent`は速度×`deltaSeconds`の移動予算超過をXZ水平距離で厳格判定し、Detourが返したYと`polygonRef`をそのまま次の`NavigationLocation`へ保持する。Y差を`waypointTolerance`へ加算せず、Yクランプ、例外握りつぶし、Runtime再生成で代用しない。NPCの初期配置、外部再配置、明示遷移の着地では`sampleGround()`の物理床を確認するが、通常のNavMesh追従中は各Actor・各更新で同じ床rayを重複発行せず、`NavigationLocation.position.y`を足元へ使用する。実学校fixtureで階段を含む物理床との誤差を継続監査する。
- 固定グリッドtiled学校NavMeshの経路探索は、Detourの16-bit node indexで予約値を除いた最大値に合わせ、`NavMeshQuery` node 65,535件、polygon corridor 32,768件、straight path 4,096点を上限とする。node上限とpolygon corridor上限の超過は区別し、経路なしへ読み替えず例外にする。作者側の全階代表経路監査も同じnode上限で容量内を確認する。
- 同じ水平位置に上下の床が重なる場合は、現在の`polygonRef`から到達可能な面を使う。X/Z距離だけで最寄りの別階へ再投影しない。
- 経路なし、投影不能は`null`とし、標的への直進へ切り替えない。
- 人間用`surface` stepは通常床、段差、階段ランプ、踊り場を通るNavMesh上の3D点列、`transition` stepは人間用`LNK_*`の固定接続を表す。両者を単一の点列へ潰さない。
- `StageLinkPair.endpointA/B.position`は作者がGLBへ配置した実座標を保持する。`NavigationTransitionStep.entry/exit`は、その端点から人間用NavMeshへ接続した面上の座標を保持し、両者を同じ座標として扱わない。
- `LNK_*`端点の接続面は、`hs_link_radius_m × worldScale`の水平半径内を端点からNavMesh下端まで検索する。端点以下の候補だけを残し、垂直差、水平差、polygon参照の順に昇順で選ぶ。通常の`projectPoint()`が使う上下探索範囲は変更しない。
- 通常扉、段差、階段ランプ、踊り場は連続NavMeshとして表す。
- 梯子、昇降機、テレポートなど、人間用の連続面で表せない接続だけを`StageLinkRegistry`で補う。
- 人間用`findPath()`へビット用NavMeshやビット遷移を渡さない。ビットも人間用NavMeshへ暗黙にフォールバックしない。
- 特殊接続A*の端点間`surface`経路は、探索で必要になった時点で初めて計算する。キャッシュキーは始点・終点の向きを含む有向端点index pairとし、方向ごとに`findSurfaceStep()`で得た`polygonRef`付き`path`または`null`を保持する。逆方向へ同じ経路の座標・`polygonRef`を単純反転せず、起動時の全端点間探索、LRU、遷移数上限、直線フォールバックは設けない。
- `transition.distance`は`entry→作者端点from + 作者端点from→作者端点to + 作者端点to→exit`の3区間合計とする。
- 人間用経路追従は`transition`入口へ到達した時点で`transition-required`を返す。ビットは後述する独立した飛行経路と遷移実行器を使用する。

### 6.1 `BitFlightNavigationWorld`

ビット用ナビゲーションは、同一帯内を担当する帯別NavMeshと、帯・ゾーン間だけを担当する明示接続グラフのハイブリッドとする。

- `BitFlightZoneId`と`BitFlightBandId`はステージ資産が定義するopaque文字列であり、番号、接頭辞、辞書順、高さ順を解釈しない。
- `BitFlightLocation`はゾーンID、帯ID、帯別NavMesh位置、安全中心高度を一組で保持する。`polygonRef`単独を別帯へ渡さない。
- 各帯payloadは`walkable`中心面と、その高度の半径0.54m移動包絡（V1物理半径0.44m＋安全余裕0.10m）へ交差する`blocker`から生成する。壁・柱・家具などを経路計画段階で除外し、最終3D包絡判定だけへ丸投げしない。
- `BitFlightTransitionKind`は`vertical`、`aperture`、`surface-route`、`boundary`だけとする。
- AI意味タグは`search-vantage`、`indoor-access`、`outdoor-access`、`stair-route`、`window-access`だけとし、学校名やObject名をAI分岐へ渡さない。
- `findRoute()`は同一帯内の`surface` stepと明示された`transition` stepだけを連結する。接続のない帯間は、同じX/Zや近い高さでも移動不能とする。
- `aperture`はGLBの`LNK_*`、連続的な上下・境界横断と階段経路はGLBの飛行遷移定義を正本にする。
- ビット用`aperture`の`hs_link_radius_m=0.54`は、端点を帯別NavMeshへ接続する探索半径であり、必要移動包絡と一致させた値である。V1実形状・被弾球の半径0.44mそのものを表すpropertyではない。
- route policyは遷移の利用可否と追加コストだけを提供し、共通ナビゲーションへ探索・追跡・逃走などのAIモードを埋め込まない。
- 破棄時は全帯の`NavMeshQuery`、filter、NavMesh、debug Mesh、経路cacheを同じContext所有単位で解放する。

### 6.2 Navigation Area追跡基盤

`StageNavigationAreaRegistry`は、資産仕様7.7.1節の`navigation_area` Volumeを`hs_area_id`で束ね、`navigation_area_portal`との接続を検証する。包含判定は実Volume形状で行い、AABB、階番号、高さ帯、固定距離グリッドへ置換しない。Area IDはopaque文字列であり、学校以外のステージでも同じAPIを使用する。

標的Areaは、全人間分を毎フレーム先行生成せず、実際に参照された標的だけを遅延解決する。同じフレームで同じ標的を追うNPCとBITは1つの`V2TargetNavigationAreaSnapshot`を共有する。snapshotは標的ID、Area ID、Area内の固定追跡点、revisionを持つ。revisionは標的が別Areaへ確定遷移した場合だけ進め、同じArea内の座標変化では進めない。Portal内部では直前Areaを保持し、境界上の数値揺れで全追跡者を往復再計画させない。

Area APIは、spawn・teleport・エレベーター降車・外部再配置に使う`locate(point)`と、連続移動に使う`advance(cursor, from, to)`へ分ける。`advance()`は現在Areaに接続するPortalだけを常時検査し、Portalのworld AABBをbroad phaseとした後、近傍だけを実Volume三角形で判定する。Portal横断時だけ接続先と現在Areaの包含を確認し、薄いPortalを1更新で飛び越す移動も線分交差で検出する。Portalを通らず現在Area外へ出る通常移動は契約違反であり、全Area再検索へフォールバックしない。

遅延Trackerは、前フレームに参照されなかった標的のcursorを保持し続けない。次に参照された時点の座標を`locate()`し、複数Areaを移動した未参照期間を1本の連続線分として扱わない。エレベーター乗車開始時は出発Areaを確定し、搬送中はAreaを凍結して位置だけ同期する。降車、搭乗取消後の退出、安全退避では`locate()`を1回行い、目的階のAreaとrevisionを原子的に公開する。

対象を追うNPCとBITの追跡は、Alarmだけでなく通常視認、Alert伝播、持続標的など、正確な現在座標を常時必要としない遠距離モードへ共通適用する。Follow、Leave、最終視認位置、固定地点待機、巡回、ランダム探索、集合演出、扉・エレベーター・捕獲など、精密位置または固定位置がゲーム性となる移動へは適用しない。

追跡状態は次の3段階とする。

1. `area`: 追跡者と標的が別Areaにいる間、標的snapshotの固定追跡点を目的地とする。同じsnapshot revision中は、標的の細かな移動だけを理由に経路を再探索しない。
2. `coarse`: 追跡者が標的と同じAreaに入り、既存経路の残りNavMesh距離が12mを超える間、2秒間隔で標的の最新座標へ目的地を更新する。更新位相は安定Actor IDで分散し、直線距離だけで`detail`へ昇格させない。
3. `detail`: 既存経路の残りNavMesh距離が12m以内になった時点から、標的の現在座標を目的地とする。最後に経路へ採用した座標から標的が累積0.15 world unit移動した場合だけ再計画を要求する。残りNavMesh距離または水平直線距離が18m以上なら`coarse`へ戻し、12mから18mの間では現在Phaseを維持する。

Area境界による`area`から`coarse`への切替は一方向とし、距離LODによる`coarse`と`detail`だけを双方向遷移にする。これにより、迂回経路が一時的に別Areaを通る場合やPortal付近の揺れで`area`へ戻らない。標的が別Areaへ移った場合は新snapshotに対して状態を再判定する。Areaへ到達不能な場合も直線追跡へフォールバックせず、そのrevisionの到達不能結果を保持し、revision変更またはstuck通知で再試行する。

標的Area変更で多数の追跡者が同時に期限切れになっても、同一フレームですべての経路を再探索しない。NPCの再計画は要求Queueで管理し、要求がなければ0件、要求があっても最大4件／フレームとする。優先順は移動安全・stuck・evade・プレイヤー指示、`detail`、標的／Area変更、`coarse`、通常徘徊であり、同一優先度は要求時刻、Actor ID順とする。同一Actorの未処理要求中に標的が動いた場合は要求数を増やさず最新座標へ置換する。60Hz受入では`detail`要求を1秒以内、`coarse`／`area`要求を2秒以内に処理する。診断ではPhase別人数、昇格・降格数、再計画待機数、統合数、最大待機時間を公開する。

Alarm発生位置は対象NPCの選定だけに使用し、追跡目的地や固定地点には使用しない。Alarm対象人数と`detail`人数には上限を設けず、99 NPC全員が12m以内へ集まれば全員が`detail`になり得る。最悪条件の実測が性能基準を満たさない場合も暗黙に人数制限へ変更せず、未解決性能課題として記録して別途仕様判断する。

Area分割の粗さと細かさはRuntimeだけでは補正しない。新規ステージ制作時は資産仕様7.7.1節の設計・監査を必須とし、ステージ固有の自然な移動区画を作者が定義する。Runtimeは任意形状と任意IDを受け入れる一方、壁の意味や入口を推測して自動分割しない。

## 7. NavMesh生成と読込

採用実装は`recast-navigation` 0.43.1を固定して使用する。Babylon.jsの`RecastJSPlugin`へNavMeshの所有権を渡さず、V2の`NavigationWorld` adapterが`NavMesh`と`NavMeshQuery`を直接所有する。

本番起動時にGLB全体からNavMeshを生成しない。T04検証・ベイク入口で次を実行する。

1. 規約準拠GLBを読み、人間用は`hs_nav_set=human`、ビット用は`hs_nav_set=bit-flight`だけを抽出する。
2. 各入力のworld座標三角形をRecastの右手座標・反時計回り規約へ変換し、対応する固定ベイクプロファイルで`generateSoloNavMesh()`または確定後のtiled generatorを実行する。
3. debug Mesh、扉、階段、閉鎖地点、到達不能領域を検証する。
4. 代表経路の3D点列と距離を記録する。
5. 人間用`exportNavMesh()`を`.navmesh.bin`へ保存する。ビット用は帯ごとの`exportNavMesh()` payloadをzone ID・band ID付きの単一`.bit-flight.navmesh.bin` bundleへ格納する。
6. `importNavMesh()`で新規`NavMesh`へ復元し、新規`NavMeshQuery`の代表経路が一致することを確認する。
7. GLBの帯キー集合とbundle目録が完全一致し、各飛行遷移のfrom/toが登録帯へ投影できることを確認する。
8. GLB SHA-256、両NavMesh SHA-256、Recast版、両プロファイルID、生成時間、容量を記録する。

本編は人間用NavMeshとビット用bundleを別々に読み、GLB由来の各グラフへ接続する。遷移をNavMesh payloadへ暗黙に焼き込まない。GLBまたはベイク条件を変更した場合は対応するNavMeshを必ず再生成し、GLB・人間用NavMesh・ビット用bundleの組を再監査する。

## 8. マーカー

`StageMarkerRegistry`は`MRK_*`を`hs_role`ごとに索引化する。位置と向きはNodeのworld Transformをそのまま使用する。

初期role:

- `player_spawn`: 向き付きのプレイヤー開始候補。学校では承認済み11件を必須とする。
- `assembly_anchor`: 集合演出の基準位置。
- `patrol_anchor`: 明示的な巡回基準が必要な場合だけ使用。

T04-3Aでは資産仕様7.9節に従い、`door`、`door_panel`、`door_open_pose`、`elevator`、`elevator_car`、`elevator_stop`、`elevator_passenger_origin`、`elevator_wait`、`elevator_human_gate`をmarker role registryへ追加する。roleごとの許可`hs_*`、親子関係、ID参照を厳格検証し、未知roleや共通keyだけを読む緩い分類へしない。

`StagePlayerSpawnRegistry`は`player_spawn` Marker、`hs_player_spawn_id`でそのMarker IDを参照する1件の`player_spawn_exclusion` Volume、同じIDを参照する1件以上の`npc_spawn_bias` Volumeを組み立てる。参照先欠落、除外Volumeの重複対応、bias欠落、孤立対応、`0.000001`未満または`1,000,000`超の重み、単一`npc_spawn`へ完全内包されないbias、対応する人間用NavMeshとの実交差面積がないbiasは読込失敗とする。同一Playerのbias同士は実NavMesh上の正面積重複を禁止し、面・辺で接するだけの場合は許可する。学校は承認済みIDの固定順から、session seedから分離した`player-spawn`乱数列で一様抽選する。選択結果はPlayerとSurvivalへ同一objectで渡す。

NPCとBITのランダム出現は多数の点を列挙せず、対応する3D Volumeとbaked NavMesh polygonの交差面から実面積比例で抽選する。NPCは全`npc_spawn`実交差面をまとめた基礎チャンネルを重み`1.0`とし、選択Player開始地点の`npc_spawn_bias`だけを各`hs_weight`の追加チャンネルとして有効化する。各チャンネルを重み比例で選んだ後、そのチャンネル内を実交差面積比例で抽選する。非選択地点のbiasは候補にも乱数消費にも含めず、基礎チャンネルを常に残すことで全`npc_spawn`許可面の出現確率を0にしない。初期値`hs_weight=0.5`では全校チャンネル`2/3`、近傍チャンネル`1/3`となる。初期洗脳済みを先に配置し、残る未洗脳NPCを同じチャンネル構成と全NPC間の最小距離を共有して後に配置する。`bit_spawn`は対象ゾーンID・帯IDを明示し、対応するBIT用NavMeshだけを使う。開始地点、NPC出現、BIT出現、その他のゲーム進行はsession seedからラベル付きで分離した乱数列を使う。

## 9. ボリュームと境界

`StageVolumeRegistry`は`VOL_*`を`hs_role`ごとに索引化する。点包含、線分交差、最近接面を3D Meshへ問い合わせる。

初期role:

- `npc_spawn`
- `npc_spawn_bias`
- `bit_spawn`
- `player_spawn_exclusion`
- `assembly`
- `no_enemy_spawn`
- `no_enemy_enter`
- `no_combat`
- `hazard`
- `water`: 水中判定に用いる閉じた3D領域。T04-2Bで学校GLBからの読込、内外問い合わせ、プール底へのNavMesh到達、破棄・再読込までを確認済みである。水中水平速度50%と通常速度への復帰はT06で実装する。

T04-3Aでは`door_sweep`、`elevator_call_mat`、`elevator_threshold`、`elevator_car_occupancy`をvolume role registryへ追加し、資産仕様7.9節の所有IDと実形状を正本にする。

`BND_Stage`はプレイ可能な3D空間を定義する。範囲外時の再配置先は`MRK_PlayerSpawn_*`または最後に確認したNavMesh上の安全点とする。AABBだけで凹形状や上下階を判定しない。

B04対応ステージの`BND_WorldLimit`は、表示と光線が存在してよい最終空間を定義する。`BND_Stage`とは別の境界として必須property `StageSpatialContext.worldBoundary`へ公開し、プレイヤー・NPCの領域外判定や再配置へ流用しない。`findExitPoint()`は内側から外側へ出る線分上の最初の交点だけを返し、それ以外は`null`を返す。学校BITは既存の塀内飛行帯へ維持し、この境界を利用する外周経路を持たない。

- `worldBoundaryMode="required"`では、閉じた`BND_WorldLimit`が正確に1件あり、`hs_id="world-limit"`、`hs_role="world_boundary"`を持ち、`BND_Stage`を内包することを読込時に検査する。欠落、重複、参照不正、非閉鎖、非内包は読込失敗とする。
- `worldBoundaryMode="unsupported"`では`BND_WorldLimit`を持たず、`StageSpatialContext.worldBoundary`を`null`とする。Objectが混入していた場合も読込失敗とし、境界終了処理は呼び出さない。
- T05-2Vの非学校fixtureは`required`として先行実装する。B04前の学校と既存の非対応fixtureは`unsupported`を維持し、B04で学校資産へ`BND_WorldLimit`を追加する同じ変更内で学校カタログを`required`へ切り替える。
- `unsupported`は対応外を明示する契約であり、欠落時のfallbackではない。`BND_Stage`、GLB全体AABB、最大寿命を世界境界の代用にしない。
- `BND_WorldLimit` Meshは`semanticMeshes`とAssetContainerが所有する。`StageWorldBoundary`はMesh参照と境界問い合わせcacheだけを所有し、Context破棄時はAssetContainerより先に無効化する。

BITの通常探索、待機、CHASE、逃走、総当たり探索、Alert集合、初期出現、時間増援は既存の塀内飛行帯だけを利用する。選択された`player_spawn_exclusion`だけを初期洗脳済みNPC、初期BIT、時間増援、Alert新規生成へ適用し、未選択の10件はこの理由で除外しない。B04は外周飛行帯と塀越え`boundary`遷移を追加しない。

通常ゲームは`initialBitCount=1`、`bitReinforcementIntervalSeconds=10`、`maximumBitCount=25`を必須入力とする。通常BITとAlert生成BITを上限へ含め、カーペット僚機は除外する。増援タイマーは`playing`のupdate中だけ進め、タイトル、停止、集合・公開処刑、ゲーム終了、破棄中は進めない。Alert生成を時間増援より先に処理し、interval超過時も`while`ではなく1機だけ生成してtimerを0に戻す。上限中はtimerを0に保ち、欠員後のcatch-up burstを行わない。stressは初期20／最大20、performanceは初期50／最大50とする。

### 9.1 集合・公開処刑会場

`StageAssemblyVenueRegistry`は`assembly_anchor` Markerと、`hs_anchor_id`がそのMarker IDを参照する`assembly` Volumeを1対1に組み立てる。

```ts
export type StageAssemblyVenue = Readonly<{
  id: string;
  anchor: StageMarker;
  volume: StageVolume;
  center: Vector3;
  selectionWeight: number;
  assemblyPositions: readonly Vector3[];
  executionAudiencePositions: readonly Vector3[];
  executionTargetPositions: readonly Vector3[];
}>;

export interface StageAssemblyVenueRegistry {
  readonly all: readonly StageAssemblyVenue[];
  getById(id: string): StageAssemblyVenue | null;
}
```

ロード時に次をすべて検査し、違反時はステージ読込を失敗させる。

- `hs_selection_weight`が有限かつ0より大きい。
- 3座標配列がそれぞれ非空で、全要素が有限値3要素である。
- `assemblyPositions.length === executionAudiencePositions.length + executionTargetPositions.length`である。
- MarkerとVolumeの参照が1対1で、参照先欠落、孤立Volume、重複対応がない。
- Marker中心と3座標配列の全点が、対応Volumeと`BND_Stage`の内側または表面にある。

JSON内のBlender座標`(x, y, z)`は読込時にBabylon world座標`(-0.25x, 0.25z, -0.25y)`へ変換する。TypeScriptへステージ固有の座標、格子間隔、会場名による分岐を置かない。

会場選択はRegistryの決定的なID順に、`selectionWeight`による累積weight抽選を行う。入力乱数は0以上1未満とし、会場2件のweightがともに1なら、乱数が`0.5`未満で先頭会場、`0.5`以上で後続会場を選ぶ。会場欠落、不正weight、不正乱数を別会場や固定座標へフォールバックしない。

配置数が作者座標数と同じ場合は、作者座標の値と順序をそのまま使用する。少ない場合は用途ごとに次の共通規則で縮小配置する。

- 中心は常に会場の`center`とする。
- 1人は中心へ置く。
- 2人以上はBabylon XZ平面で等角度の円へ置き、先頭を中心から`+X`方向、以後を正の角度順とする。
- 作者座標群の中心からの最大XZ半径を`maxAuthorRadius`、作者座標数を`capacity`、配置数を`count`とし、縮小後半径を`maxAuthorRadius * sqrt(count / capacity)`とする。
- 集合、公開処刑観客、公開処刑対象は、それぞれの作者座標配列と容量を独立に使用する。
- 同じ会場、用途、人数からは常に同じ順序・同じ座標を返す。

### 9.2 B05 Location意味資産registry

`locationAssetsMode="required"`では、schema version 3の作者`MAP_*`、Marker、Volumeから次の公開registryを構築する。

```ts
export interface StageLocationAssetRegistry {
  readonly floorMaps: readonly StageFloorMap[];
  readonly areas: readonly StageLocationArea[];
  readonly missionLocations: readonly StageMissionLocation[];
  readonly stairLandings: readonly StageStairLanding[];
  readonly elevatorLandings: readonly StageElevatorLanding[];
  readonly broadcastConsole: StageBroadcastConsole;
  getFloorMap(floorId: StageLocationFloorId): StageFloorMap | null;
  getAreaById(id: string): StageLocationArea | null;
  getMissionLocationById(id: string): StageMissionLocation | null;
  findArea(point: Vector3): StageLocationAreaHit | null;
}
```

`StageLocationArea`はID、表示名、優先度と複数の`StageLocationAreaPiece`を持つ。各pieceは固定floorまたはelevator IDのどちらかへ結び、`contains()`は現在の動的空間revisionに追従する。`findArea()`は包含するpieceを優先度降順で解決し、同順位で異なる論理Areaが残る場合は例外とする。固定pieceのhitは`floorId`、エレベーターpieceのhitは`elevatorId`を返す。

ロード時に次をすべて検査する。

- floor ID集合と順序が`f01/f02/f03/f04/roof`、1～5で完全一致する。
- Areaの全pieceでID、表示名、優先度が一致し、固定floorまたは既存elevatorの片方だけを参照する。
- 異なる論理Areaの同順位Volumeが正体積で重複しない。
- 人間用NavMeshの全triangleが1件以上のArea pieceで完全に覆われる。
- Mission Locationのfloor、Area、Volume、Anchor参照が存在し、AnchorがVolume内、Volumeが対応floorのArea piece内、Anchorの最高優先Areaが参照Area、AnchorがNavMeshへ0.25m以内で投影可能である。
- 階段踊り場のfloorと方向が登録値である。
- エレベーター乗場のfloorとelevatorが存在し、`available`とstop有無が一致する。stopがある場合は`floorIndex`がfloor Mapのorderと一致する。
- 放送卓Markerとtargetが1件ずつ存在し、相互参照、floor、表示名が有効である。

学校の確定件数は5 Map、52 Area／85 piece、24 Mission Location、17階段踊り場、4エレベーター乗場、放送卓1件である。`locationAssetsMode="unsupported"`ではB05意味資産を0件とし、`StageSpatialContext.locationAssets`を`null`にする。対応外を欠落扱いして座標や既存Volumeから補完しない。

エレベーターの現在階表示には`StageElevatorSnapshot.displayStopId`を使用する。停止中は現在stop、移動中は到着するまで出発stopを保持し、到着時に目的stopへ切り替える。物理判定用`currentStopId`は移動中`null`の既存契約を維持する。

B05はregistryの読込と検証だけを実装する。ミニマップ描画はT06-3、Mission状態機械、20秒scheduler、放送効果、HUD、公開処刑会場切替はT06-4が所有する。

## 10. 3D空間問い合わせ

```ts
export interface StageSpatialQueries {
  castMovementSegment(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3
  ): SpatialHit | null;
  castMovementSphere(
    moverKind: StageMoverKind,
    from: Vector3,
    to: Vector3,
    radius: number
  ): SpatialSphereSweepHit | null;
  castBeamSegment(from: Vector3, to: Vector3): SpatialHit | null;
  castSightSegment(from: Vector3, to: Vector3): SpatialHit | null;
  sampleGround(origin: Vector3, maxDistance: number): SpatialHit | null;
  containsVolume(role: StageVolumeRole, point: Vector3): boolean;
  dispose(): void;
}
```

- 移動は`castMovementSegment(moverKind, from, to)`で移動者別Collider集合へ問い合わせる。移動者種別を省略する旧`castActorSegment()`や、呼出側でColliderを推測する互換経路は作らない。
- ビットの3D安全包絡は`castMovementSphere(moverKind, from, to, radius)`で連続球スイープする。内部の空間索引は最適化にだけ使用し、公開位置や資産契約へセル座標を公開しない。
- 全光線は更新線分と`BND_WorldLimit`の退出点をキャッシュ済み直方体へのslab判定で求める。退出点では遮蔽衝突、着弾、ダメージ、Alarm、壁命中通知、反射光球を発生させず、約0.2秒の透明化へ移行する。最大寿命20秒は別の安全上限として維持する。
- 連続球スイープの候補三角形はworld座標AABBを2 world unitの3Dグリッドへ登録し、swept AABBと半径に重なる候補だけへ厳密判定する。同率接触時は元Mesh順・triangle index順を維持する。既知安全中心は`moverKind`、半径、完全一致座標をkeyとする16,384件LRUへ保持し、`dispose()`で索引・cache・移動体別集合をすべて破棄する。これらは内部最適化であり、公開状態や経路探索へセルを導入しない。
- T05-2で実装済みの通常CHASE、固定、ランダム、カーペット、NPC gun、プレイヤーgun、公開処刑の全発射元は、前フレーム位置から新位置まで連続線分判定し、最初の`beamBlockers`交点で停止・着弾する。
- 視線は観測点から標的中心まで`sightBlockers`へ線分判定する。
- 通常索敵は距離、扇形視野、遮蔽物なしの全条件を満たす標的だけを取得する。
- 通常視認由来の標的は遮蔽時に解除する。アラート由来の標的は期限まで保持できるが、ビームは壁を貫通しない。
- 床高は下向き3D Rayで`normalColliders`の支持面へ問い合わせる。窓用の`COL_ActorOnly_*`、`COL_HumanOnly_*`、`COL_BeamSightOnly_*`を床支持面にせず、NavMeshの高さも物理接地面の代用にしない。

## 11. AI移動

- NPCは`NavigationLocation`、ビットは`BitFlightLocation`を現在地として保持し、標的変更、標的の規定距離以上の移動、再探索期限、stuck時にだけ対応する完全経路を再探索する。
- 視認標的が遮蔽されて通常追跡を解除した場合は、古い経路も破棄する。
- アラート標的は期限内だけ保持し、NavMesh経路で扉へ回り込む。
- 経路がない場合は壁へ直進せず停止し、規定間隔後に再探索する。
- NPCの`surface` stepは人間用NavMeshへ拘束する。ビットの`surface` stepは現在帯のビット用NavMeshへ拘束し、`transition` stepは共通遷移実行器が実飛行する。
- カーペット爆撃など直進編隊が障害物で成立しない場合、編隊を解除してNavMesh追跡へ移行する。

### 11.1 T05-1B ビット飛行安全条件

T05-1Aが提供する帯別NavMeshと接続グラフへ、T05-1Bが以下の実飛行を接続する。

- 通常飛行時のビット基準位置は、GLBの物理床面上1.0～1.8mに保つ。NavMesh面高を床高の代用にしない。
- 天井までの空きは希望高度より優先する。1.0～1.8mの範囲内で高度を下げても半径0.54mの移動包絡を確保できない通常経路へは進入しない。
- V1実形状・銃口と戦闘用被弾球の物理半径は0.44m、全方向の安全余裕は0.10m、ステージ障害物に対する移動包絡は合計0.54mとする。移動可否は前位置から次位置まで半径0.54mで連続判定し、中心線だけ、静止姿勢だけ、次位置だけの判定にせず、高速移動でも壁、天井、庇、窓枠を飛び越えない。
- 上下揺れはビットの中心位置自体を動かし、そのfrom/to間を同じ半径0.54mで連続Sweepする。揺れ幅を物理半径または移動包絡へ二重加算しない。
- 通常高度は現在帯の許可中心高度内で決定する。低天井では半径0.54mの移動包絡が収まる場合だけ一時的に通常下限未満を許可し、開けた場所では通常範囲へ戻す。`aperture`、`surface-route`、`vertical`、`boundary`の実行中も0.54m包絡を例外にしない。
- 帯内経路は希望高度の直線を最初に検査し、不安全なら帯の下限、25%、50%、75%、上限の高度候補を検査する。部分高障害物は安全な高高度候補を使用し、全高障害物はビット用NavMeshで水平迂回する。これらがすべて不安全な場合だけ、実物理床と天井から安全包絡が収まることを証明できる低天井候補を追加する。薄い全高壁や根拠のない通常下限未満の短絡を許可しない。
- 特殊接続の途中で標的を喪失した場合は、その時点から近い側の端点まで進んで`surface`へ復帰する。経路途中で停止したり、毎フレーム往復方向を切り替えたりしない。
- 遷移離脱中に別の標的変更や経路解除が重なっても、同じ離脱点列と終端を維持する。離脱中の再度の`clear()`は冪等なno-opとし、短縮済み点列の終端を元の遷移端へ差し替えない。
- 遷移完了後はexit側の`BitFlightLocation`へ結び直し、接続先帯の許可中心高度へ戻す。
- 帯・ゾーンを変更する全遷移へ入る前にカーペット編隊を解除する。編隊のまま通過しない。
- 標的の高さへの一定加算やステージ全体の最高点だけで飛行高度上限を決める旧処理は使用せず、現在地の物理床と直上天井を正本にする。
- 屋上は窓の設置対象外だが、索敵、標的追跡、経路、戦闘の対象である。学校では4F屋外帯と屋上帯を、資産が明示する双方向`boundary`遷移で接続する。旧`bit_roof`は資産、Runtime型、監査、優先地点、フォールバックのいずれにも残さない。
- V1のランダム高度、forward 65%・vertical 15%・diagonal 20%の探索、上下揺れ、旋回を現在帯内で復元する。上下揺れは中心移動として安全判定し、遷移中とカーペット中は揺れを停止する。
- 探索履歴はゾーン・帯付きの共有3D履歴とし、セル座標やセルBFSへ戻さない。探索は未探索領域へつながる意味タグ、追跡は標的帯までの安全な完全経路、逃走は視線を切り距離を稼げる遷移を汎用policyとして評価する。

## 12. 実装境界と未接続システム

学校GLBへ必要な`MRK_*`または`VOL_*`がないシステムは、対応資産が追加されるまで明示的に無効化する。セル互換、既定座標、全面床、AABB代用を追加しない。

- T04は`StageMoverKind`、`NavigationLocation.polygonRef`、`surface`／`transition`経路、`StageSpatialContext.links`、移動者別`castMovementSegment()`、`transition-required`、水Volumeの読込・問い合わせ・NavMesh到達までの共通基盤を担当する。
- T05-1Aは汎用飛行ゾーン・帯、別ビットNavMesh bundle、接続グラフ、非学校fixture、学校データ移行を担当する。
- T05-1Bは11.1節のV1飛行表現、高度・天井・衝突安全、探索・追跡、全遷移の実飛行を担当する。
- T05-2は既存の戦闘モード、射程維持、通常CHASE・固定・ランダム・カーペット・NPC gun・プレイヤーgun・公開処刑の全光線物理、警報、標的状態遷移を3D空間へ統合する。
- T05-2VはV1光線演出、演出資源再利用、`BND_WorldLimit`退出点での非着弾フェードを担当する。命中間接照明は`HitEffectSystem`生成時に3灯の`PointLight`を同期作成し、同System破棄まで常時enabledの固定slotとして保持する。待機、遮蔽、返却では`intensity=0`、`range=1`の有限正値にし、命中開始・終了時にLightを追加、破棄、有効化、無効化してStage PBR shaderのLight構成を変更しない。同時命中の先着3件だけがslotを取得し、4件目以降も命中shell、点滅、fade、周囲orbは省略せず継続する。
- T04-3Aは`DynamicStageSpatialVariants`、revision付き動的問い合わせ、扉・エレベーター状態機械、非学校fixture、部屋variant NavMeshタイル組立基盤を担当する。
- T04-3BはB03-3C／B04の学校metadata、20室variant、全陣営NPCの扉・エレベーター利用を実学校へ統合する。
- B04は学校外周表示と`BND_WorldLimit`の資産を担当する。両NavMeshは不変とし、外周BIT飛行帯と塀越え遷移は追加しない。
- B05はschema version 3、`locationAssetsMode`、5 Map、52 Area、24 Mission Location、17階段踊り場、4エレベーター乗場、放送卓と、これらを読める最小Runtime registryを担当する。ミニマップ描画、Mission状態機械、放送効果は含めない。
- T06はB04とT05-2Vを含む最終学校資産を使い、プレイヤー、NPC、ビット、全階、屋上、全光線、ゲーム進行、水中水平速度50%と通常速度への復帰を通した統合確認を行う。外周BIT帯の統合は対象に含めない。
- トラップ光線と動的3DマップビームはT05-2、T05-2V、T06、T07の完了範囲に含めない。将来、対応ステージを移植するタスクで`V2BeamOriginKind`、配置metadata、状態機械、光線物理・演出、専用fixtureを同時に追加する。

## 13. ライフサイクル

- `StageSpatialContext`構築に失敗した場合、新ContextのAssetContainer、人間用NavMesh、生成済みの全帯ビットNavMesh、debug Mesh、イベント購読を破棄し、旧Contextは維持する。
- 成功時は入力停止、プレイヤー再配置、新Context有効化、旧Context破棄の順に交換する。
- `dispose()`は`StageSpatialQueries`、`DynamicStageSpatialVariants`、`StageWorldBoundary`の問い合わせcache・参照を先に無効化し、その後にステージ所有の`StageLocationAssetRegistry`参照、Mesh、TransformNode、Material、Texture参照、人間用NavMesh adapter、ビット用NavMesh群、Crowd、debug Mesh、イベント購読を1回だけ解放する。破棄済みのquery、variant、world boundary、Location意味Nodeを保持して使用しない。
- `recast-navigation`のWASM moduleはアプリ寿命で1回だけ初期化する。ステージごとの`NavMeshQuery`、`NavMesh`、debug Meshは`NavigationWorld.dispose()`で明示的に破棄する。
- 複数3Dステージを再導入する前に、NavMesh再構築時の明示破棄とWASMメモリ推移を専用試験する。

## 14. 検証条件

- V2モジュールにステージJSON、`GridLayout`、`FloorCell`、`worldToCell`、`cellToWorld`、セルBFS参照がない。
- `StageSpatialContext.links`は人間用pairだけ、`StageSpatialContext.bitNavigation.transitions`はビット用遷移だけを公開し、相互に混在しない。
- 同じX/Zに重なる上下床の`NavigationLocation`が異なる`polygonRef`を保持し、現在地・目的地・移動結果が別階へ誤投影されない。
- tiled NavMesh境界の固定回帰では、速度0.3・`deltaSeconds=0.0168`のNPC更新中にYが約0.475から0.5へsnapして隣接polygonへ遷移しても、XZ移動が0.00504の予算内なら追跡を継続し、実際のXZ超過は例外にする。
- 学校の主玄関、教室扉、校庭、渡り廊下、体育館、北西階段の1階～屋上、北東・南西階段の1階～4階が連続NavMeshで接続される。北東・南西から屋上へは接続せず、屋上移動は北西階段を使う。承認済み特殊接続は通常NavMeshが成立しない場合だけ補助する。
- 壁を挟んだ`surface`経路が扉へ迂回し、閉鎖地点と窓開口を通常経路として通らない。階段経路の各点は正しい床高と`polygonRef`を持つ。
- 窓58組はビット用`aperture`としてだけ現れ、プレイヤーとNPCの経路には現れない。旧`bit_roof`は0件で、屋上は`boundary`遷移を使う。
- 修正案1では現行片羽開放幅1.20mの58窓を、V1物理半径0.44m＋余裕0.10m＝半径0.54mの移動包絡と実飛行Agentで双方向116/116に再検証済みとする。旧0.64m包絡・直径1.28mを理由に両羽全開を要求しない。
- `COL_ActorOnly_Window_*`と`COL_ActorOnly_WindowFixed_*`はプレイヤー・NPC・ビットを止め、`COL_HumanOnly_Window_*`はプレイヤー・NPCだけを止める。いずれも視線と全光線を透過する。
- `COL_BeamSightOnly_*`はプレイヤー・NPC・ビットの移動と3種NavMeshを通し、ゲーム内の全ビームと視線だけを遮る。
- T05-1Bでは全モードが帯の許可高度、物理床・天井、V1物理半径0.44m＋安全余裕0.10m＝半径0.54mの移動包絡を満たす。上下揺れは中心Sweepとして検査し、半径へ二重加算しない。標的喪失時は近い遷移端または隣接帯へ離脱し、帯変更前にカーペット編隊を解除する。
- 壁越しに通常索敵せず、窓越しには視認する。T05-2で実装済みの通常CHASE、固定、ランダム、カーペット、NPC gun、プレイヤーgun、公開処刑の全発射元が壁へ着弾し、両種の窓を透過する。
- T04-3Aでは閉→開→閉、開閉中の教室扉遮蔽無効、移動中エレベーター扉パネルの遮蔽追従、旧revision由来cacheの不使用を非学校fixtureで検証する。
- 動的variantを含む学校の破棄・再読込後に、snapshot、動的索引、world boundary cache、イベント購読が増加しない。
- B05では5/52/24/17/4/1の目録、85 Area piece、通常版・全荒れ版の24 Anchor到達、NavMesh全triangleのArea被覆、同順位正体積重複0、欠落metadata、未知role・未知`hs_*`、ID重複、参照不整合の拒否を専用fixtureで検証する。
- エレベーター移動中は`currentStopId=null`かつ`displayStopId=departureStopId`を維持し、到着時だけ目的stopへ切り替える。
- T06で全階と屋上を含む学校全域のゲーム進行を統合確認する。
- 学校の破棄・再読込後にScene資源、NavMesh、イベント購読が増加しない。
- Web開発版、Web本番ビルド、Electronビルドで同じ人間用NavMeshとビット用bundleを読める。
- UTF-8 BOMなし、括弧対応、`git diff --check`、GLB・両NavMeshハッシュ監査が成功する。
