# HAIGURE SURVIVAL v2 3Dステージランタイム仕様書

更新日: 2026-07-25
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
  assetSchemaVersion: number;
  navProfileId: string;
  bitNavProfileId: string;
  glbSha256: string;
  navmeshSha256: string;
  bitNavmeshSha256: string;
}>;
```

- `id`はGLBの`META_Stage.hs_stage_id`と一致させる。
- `navProfileId`と`bitNavProfileId`はGLBと各NavMesh生成記録の双方に一致させる。
- 3資産のいずれかのハッシュが不一致なら読込失敗とし、古い成果物を継続使用しない。
- 当面のカタログ件数は学校1件とする。

## 4. `StageSpatialContext`

`StageSpatialContext`は、1回のステージ読込で生成したすべての空間資源を所有する。

```ts
export type StageSpatialContext = Readonly<{
  stage: StageCatalogEntry;
  metadata: StageMetadata;
  resources: StageSpatialResources;
  navigation: NavigationWorld;
  bitNavigation: BitFlightNavigationWorld;
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
| `navSourceMeshes` | `hs_nav_set=human`の`NAV_*` | 人間用検証・再ベイク |
| `bitFlightNavSourceMeshes` | `hs_nav_set=bit-flight`の`NAV_BitFlight_*` | ビット用検証・再ベイク |
| `semanticMeshes` | `VOL_*`、`BND_*`、`PRT_*` | 3D意味判定 |
| `semanticNodes` | `META_*`、`MRK_*`、`LNK_*` | メタデータ・位置・特殊接続 |

移動者別集合は次の表を正本とする。

| Collider | `player` | `npc` | `bit` | 視線・全光線 |
|---|---:|---:|---:|---:|
| 通常`COL_*` | 停止 | 停止 | 停止 | 遮蔽 |
| `COL_ActorOnly_*` | 停止 | 停止 | 停止 | 透過 |
| `COL_HumanOnly_*` | 停止 | 停止 | 透過 | 透過 |

閉じた窓は`COL_ActorOnly_Window_*`とし、全移動体を止めながら視線と全光線を通す。指定した開いた窓または割れた窓は、残るガラス羽を`COL_ActorOnly_WindowFixed_*`、実開口を`COL_HumanOnly_Window_*`とする。前者は全移動体を止め、後者はプレイヤーとNPCを止めてビットを通す。どちらも視線と全光線を通す。`PRT_*`の既存room、streaming、door trigger用途は維持するが、ビット遷移を`PRT_*`や人間用`StageLinkRegistry`へ登録しない。

## 5. GLB読込と分類

読込は次の順序で行う。

1. `SceneLoader.LoadAssetContainerAsync`でGLBを読む。
2. `createRootMesh()`で作者Nodeの外側に管理親を作り、0.25の一様縮尺を設定する。
3. `container.meshes`と`container.transformNodes`を列挙する。
4. Object名、Blender型に対応するBabylon Node型、`metadata.gltf.extras`を検査する。
5. 資産仕様の各集合へ排他的に分類する。
6. `META_Stage`、必須marker、通常volume、飛行遷移volume、`BND_Stage`、`PRT_*`、人間用link、ビット用aperture pairを検査する。
7. GLB、人間用NavMesh、ビットNavMesh bundleのカタログハッシュ、schema version、両profileを照合する。
8. 人間用`LNK_*`だけを`StageLinkPair`へ組み立て、`StageLinkRegistry`を構築する。
9. `NAV_BitFlight_*`から任意数のゾーン・帯を構築し、GLBの帯キー集合とbundle目録を完全一致検査する。
10. 人間用`NavigationWorld`と、帯ごとに独立した`NavigationWorld`および明示遷移グラフを持つ`BitFlightNavigationWorld`を構築する。
11. すべて成功した後だけ`addAllToScene()`し、旧Contextと交換する。

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
- 同じ水平位置に上下の床が重なる場合は、現在の`polygonRef`から到達可能な面を使う。X/Z距離だけで最寄りの別階へ再投影しない。
- 経路なし、投影不能は`null`とし、標的への直進へ切り替えない。
- 人間用`surface` stepは通常床、段差、階段ランプ、踊り場を通るNavMesh上の3D点列、`transition` stepは人間用`LNK_*`の固定接続を表す。両者を単一の点列へ潰さない。
- `StageLinkPair.endpointA/B.position`は作者がGLBへ配置した実座標を保持する。`NavigationTransitionStep.entry/exit`は、その端点から人間用NavMeshへ接続した面上の座標を保持し、両者を同じ座標として扱わない。
- `LNK_*`端点の接続面は、`hs_link_radius_m × worldScale`の水平半径内を端点からNavMesh下端まで検索する。端点以下の候補だけを残し、垂直差、水平差、polygon参照の順に昇順で選ぶ。通常の`projectPoint()`が使う上下探索範囲は変更しない。
- 通常扉、段差、階段ランプ、踊り場は連続NavMeshとして表す。
- 梯子、昇降機、テレポートなど、人間用の連続面で表せない接続だけを`StageLinkRegistry`で補う。
- 人間用`findPath()`へビット用NavMeshやビット遷移を渡さない。ビットも人間用NavMeshへ暗黙にフォールバックしない。
- 特殊接続A*の端点間`surface`経路は、探索で必要になった時点で初めて計算する。キャッシュキーは順不同の端点index pairとし、`path`または`null`を保持する。逆方向は同じ経路点を反転して再利用し、起動時の全端点間探索、LRU、遷移数上限、直線フォールバックは設けない。
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

- `player_spawn`: プレイヤー初期位置。学校では1件必須。
- `assembly_anchor`: 集合演出の基準位置。
- `patrol_anchor`: 明示的な巡回基準が必要な場合だけ使用。

NPCとビットのランダム出現は多数の点を列挙せず、対応する3D Volume内からNavMesh上の点を抽選する。`bit_spawn`は対象ゾーンID・帯IDを明示し、ビット用NavMeshだけへ投影する。

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
- 連続球スイープの候補三角形はworld座標AABBを2 world unitの3Dグリッドへ登録し、swept AABBと半径に重なる候補だけへ厳密判定する。同率接触時は元Mesh順・triangle index順を維持する。既知安全中心は`moverKind`、半径、完全一致座標をkeyとする16,384件LRUへ保持し、`dispose()`で索引・cache・移動体別集合をすべて破棄する。これらは内部最適化であり、公開状態や経路探索へセルを導入しない。
- 通常、固定、トラップ、動的を含む全光線は前フレーム位置から新位置まで連続線分判定し、最初の`beamBlockers`交点で停止・着弾する。
- 視線は観測点から標的中心まで`sightBlockers`へ線分判定する。
- 通常索敵は距離、扇形視野、遮蔽物なしの全条件を満たす標的だけを取得する。
- 通常視認由来の標的は遮蔽時に解除する。アラート由来の標的は期限まで保持できるが、ビームは壁を貫通しない。
- 床高は下向き3D Rayで`normalColliders`の支持面へ問い合わせる。窓用の`COL_ActorOnly_*`と`COL_HumanOnly_*`を床支持面にせず、NavMeshの高さも物理接地面の代用にしない。

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
- T05-2は既存の戦闘モード、射程維持、通常・固定・トラップ・動的を含む全光線、警報、標的状態遷移を3D空間へ統合する。
- T06はB03最終学校資産を使い、プレイヤー、NPC、ビット、全階、屋上、全光線、ゲーム進行、水中水平速度50%と通常速度への復帰を通した統合確認を行う。

## 13. ライフサイクル

- `StageSpatialContext`構築に失敗した場合、新ContextのAssetContainer、人間用NavMesh、生成済みの全帯ビットNavMesh、debug Mesh、イベント購読を破棄し、旧Contextは維持する。
- 成功時は入力停止、プレイヤー再配置、新Context有効化、旧Context破棄の順に交換する。
- `dispose()`はステージ所有のMesh、TransformNode、Material、Texture参照、人間用NavMesh adapter、ビット用NavMesh群、空間問い合わせ索引・三角形cache、Crowd、debug Mesh、イベント購読を1回だけ解放する。破棄済みの`StageSpatialQueries`を保持して問い合わせた場合は失敗させる。
- `recast-navigation`のWASM moduleはアプリ寿命で1回だけ初期化する。ステージごとの`NavMeshQuery`、`NavMesh`、debug Meshは`NavigationWorld.dispose()`で明示的に破棄する。
- 複数3Dステージを再導入する前に、NavMesh再構築時の明示破棄とWASMメモリ推移を専用試験する。

## 14. 検証条件

- V2モジュールにステージJSON、`GridLayout`、`FloorCell`、`worldToCell`、`cellToWorld`、セルBFS参照がない。
- `StageSpatialContext.links`は人間用pairだけ、`StageSpatialContext.bitNavigation.transitions`はビット用遷移だけを公開し、相互に混在しない。
- 同じX/Zに重なる上下床の`NavigationLocation`が異なる`polygonRef`を保持し、現在地・目的地・移動結果が別階へ誤投影されない。
- 学校の主玄関、教室扉、校庭、渡り廊下、体育館、北西階段の1階～屋上、北東・南西階段の1階～4階が連続NavMeshで接続される。北東・南西から屋上へは接続せず、屋上移動は北西階段を使う。承認済み特殊接続は通常NavMeshが成立しない場合だけ補助する。
- 壁を挟んだ`surface`経路が扉へ迂回し、閉鎖地点と窓開口を通常経路として通らない。階段経路の各点は正しい床高と`polygonRef`を持つ。
- 窓58組はビット用`aperture`としてだけ現れ、プレイヤーとNPCの経路には現れない。旧`bit_roof`は0件で、屋上は`boundary`遷移を使う。
- 修正案1では現行片羽開放幅1.20mの58窓を、V1物理半径0.44m＋余裕0.10m＝半径0.54mの移動包絡と実飛行Agentで双方向116/116に再検証済みとする。旧0.64m包絡・直径1.28mを理由に両羽全開を要求しない。
- `COL_ActorOnly_Window_*`と`COL_ActorOnly_WindowFixed_*`はプレイヤー・NPC・ビットを止め、`COL_HumanOnly_Window_*`はプレイヤー・NPCだけを止める。いずれも視線と全光線を透過する。
- T05-1Bでは全モードが帯の許可高度、物理床・天井、V1物理半径0.44m＋安全余裕0.10m＝半径0.54mの移動包絡を満たす。上下揺れは中心Sweepとして検査し、半径へ二重加算しない。標的喪失時は近い遷移端または隣接帯へ離脱し、帯変更前にカーペット編隊を解除する。
- 壁越しに通常索敵せず、窓越しには視認する。T05-2で通常・固定・トラップ・動的を含む全光線が壁へ着弾し、両種の窓を透過する。
- T06で全階と屋上を含む学校全域のゲーム進行を統合確認する。
- 学校の破棄・再読込後にScene資源、NavMesh、イベント購読が増加しない。
- Web開発版、Web本番ビルド、Electronビルドで同じ人間用NavMeshとビット用bundleを読める。
- UTF-8 BOMなし、括弧対応、`git diff --check`、GLB・両NavMeshハッシュ監査が成功する。
