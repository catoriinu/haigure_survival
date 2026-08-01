import {
  Mesh,
  TransformNode,
  Vector3,
  VertexBuffer,
  type Node
} from "@babylonjs/core";

import { SCHOOL_ROOM_VARIANT_ROOM_IDS } from "./schoolRuntimeSettings";

export const STAGE_ROOM_VARIANT_ROOM_IDS =
  SCHOOL_ROOM_VARIANT_ROOM_IDS;

export type StageRoomVariantRoomId =
  (typeof STAGE_ROOM_VARIANT_ROOM_IDS)[number];

export const STAGE_ROOM_VARIANT_IDS = ["normal", "disordered"] as const;

export type StageRoomVariantId = (typeof STAGE_ROOM_VARIANT_IDS)[number];

export const STAGE_ROOM_VARIANT_SELECTION_PRESETS = [
  "all-normal",
  "all-disordered"
] as const;

export type StageRoomVariantSelectionPreset =
  (typeof STAGE_ROOM_VARIANT_SELECTION_PRESETS)[number];

export type StageRoomVariantSelectionByRoom = Readonly<
  Record<StageRoomVariantRoomId, StageRoomVariantId>
>;

export type StageRoomVariantSelection =
  | StageRoomVariantSelectionPreset
  | StageRoomVariantSelectionByRoom;

export type StageRoomVariantAsset = Readonly<{
  id: string;
  roomId: StageRoomVariantRoomId;
  variantId: StageRoomVariantId;
  node: TransformNode;
  visualMeshes: readonly Mesh[];
  colliderMeshes: readonly Mesh[];
  beamSightOnlyColliders: readonly Mesh[];
  humanNavSourceMeshes: readonly Mesh[];
}>;

export type StageRoomVariantTileVolume = Readonly<{
  id: string;
  roomId: StageRoomVariantRoomId;
  mesh: Mesh;
}>;

export type StageRoomVariantMeshPartition = Readonly<{
  visualMeshes: readonly Mesh[];
  colliderMeshes: readonly Mesh[];
  beamSightOnlyColliders: readonly Mesh[];
  humanNavSourceMeshes: readonly Mesh[];
}>;

export type StageRoomVariantActivation = Readonly<{
  selection: StageRoomVariantSelectionByRoom;
  selectedVariants: readonly StageRoomVariantAsset[];
  unselectedVariants: readonly StageRoomVariantAsset[];
  active: StageRoomVariantMeshPartition;
  inactive: StageRoomVariantMeshPartition;
}>;

export interface StageRoomVariantAssetRegistry {
  readonly roomIds: readonly StageRoomVariantRoomId[];
  readonly variantIds: readonly StageRoomVariantId[];
  readonly ids: readonly string[];
  readonly variants: readonly StageRoomVariantAsset[];
  readonly tileVolumes: readonly StageRoomVariantTileVolume[];
  getVariantById(id: string): StageRoomVariantAsset | null;
  getVariant(
    roomId: StageRoomVariantRoomId,
    variantId: StageRoomVariantId
  ): StageRoomVariantAsset;
  getTileVolume(
    roomId: StageRoomVariantRoomId
  ): StageRoomVariantTileVolume;
  activate(selection: StageRoomVariantSelection): StageRoomVariantActivation;
}

export type StageRoomVariantAssetRegistrySource = Readonly<{
  markerNodes: readonly TransformNode[];
  volumeMeshes: readonly Mesh[];
  visualMeshes: readonly Mesh[];
  normalColliders: readonly Mesh[];
  beamSightOnlyColliders: readonly Mesh[];
  humanNavSourceMeshes: readonly Mesh[];
  authoredNodes: readonly TransformNode[];
}>;

type Extras = Readonly<Record<string, unknown>>;

type AuthoredRoomVariant = Readonly<{
  id: string;
  roomId: StageRoomVariantRoomId;
  variantId: StageRoomVariantId;
  node: TransformNode;
  extras: Extras;
}>;

type AuthoredRoomVariantTile = Readonly<{
  id: string;
  roomId: StageRoomVariantRoomId;
  mesh: Mesh;
  extras: Extras;
}>;

type VariantMeshAccumulator = {
  visualMeshes: Mesh[];
  colliderMeshes: Mesh[];
  beamSightOnlyColliders: Mesh[];
  humanNavSourceMeshes: Mesh[];
};

const ROOM_VARIANT_MARKER_PREFIX = "MRK_RoomVariant_";
const ROOM_VARIANT_TILE_PREFIX = "VOL_RoomVariantTile_";
const ROOM_VARIANT_ROLE = "room_variant";
const ROOM_VARIANT_TILE_ROLE = "room_variant_tile";
const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OBJECT_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const VOLUME_TRIANGLE_EPSILON = 1e-12;
const FORBIDDEN_DYNAMIC_MESH_PREFIXES = Object.freeze([
  "VIS_Door",
  "COL_Door",
  "VIS_Elevator",
  "COL_Elevator"
]);
const ROOM_VARIANT_VISUAL_PREFIXES = Object.freeze([
  "VIS_B03_Interior_",
  "VIS_RoomVariant_"
]);
const ROOM_VARIANT_COLLIDER_PREFIXES = Object.freeze([
  "COL_B03_Interior_",
  "COL_RoomVariant_"
]);
const ROOM_VARIANT_BEAM_SIGHT_ONLY_COLLIDER_PREFIXES = Object.freeze([
  "COL_BeamSightOnly_B03_Interior_",
  "COL_BeamSightOnly_RoomVariant_"
]);
const ROOM_VARIANT_NAV_PREFIX = "NAV_RoomVariant_";

const ROOM_VARIANT_ALLOWED_HS_PROPERTIES = Object.freeze([
  "hs_id",
  "hs_role",
  "hs_room_id",
  "hs_variant_id"
]);

const ROOM_VARIANT_TILE_ALLOWED_HS_PROPERTIES = Object.freeze([
  "hs_id",
  "hs_role",
  "hs_room_id"
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readExtras = (node: TransformNode): Extras => {
  if (!isRecord(node.metadata)) {
    return {};
  }
  const gltf = node.metadata.gltf;
  if (!isRecord(gltf) || !isRecord(gltf.extras)) {
    return {};
  }
  return gltf.extras;
};

export const isStageRoomVariantMarkerNode = (
  node: TransformNode
): boolean => {
  const extras = readExtras(node);
  return (
    node.name.startsWith(ROOM_VARIANT_MARKER_PREFIX) ||
    extras.hs_role === ROOM_VARIANT_ROLE
  );
};

export const isStageRoomVariantTileMesh = (mesh: Mesh): boolean => {
  const extras = readExtras(mesh);
  return (
    mesh.name.startsWith(ROOM_VARIANT_TILE_PREFIX) ||
    extras.hs_role === ROOM_VARIANT_TILE_ROLE
  );
};

const requireExtras = (node: TransformNode): Extras => {
  const extras = readExtras(node);
  if (Object.keys(extras).length === 0) {
    throw new Error(`必須のglTF Node extrasがありません: ${node.name}`);
  }
  return extras;
};

const requireString = (
  objectName: string,
  extras: Extras,
  property: string
): string => {
  const value = extras[property];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`非空文字列が必要です: ${objectName}.${property}`);
  }
  return value;
};

const requireKebabCaseId = (
  objectName: string,
  extras: Extras,
  property: string
): string => {
  const value = requireString(objectName, extras, property);
  if (!KEBAB_CASE_ID_PATTERN.test(value)) {
    throw new Error(
      `IDは小文字kebab-caseで指定します: ${objectName}.${property}`
    );
  }
  return value;
};

const requireEnum = <Value extends string>(
  objectName: string,
  extras: Extras,
  property: string,
  values: readonly Value[]
): Value => {
  const value = requireString(objectName, extras, property);
  if (!values.includes(value as Value)) {
    throw new Error(
      `${property}が未登録値です: ${objectName}.${property}=${value}`
    );
  }
  return value as Value;
};

const assertAllowedHsProperties = (
  objectName: string,
  extras: Extras,
  allowedProperties: readonly string[]
): void => {
  const unknownProperty = Object.keys(extras).find(
    (property) =>
      property.startsWith("hs_") && !allowedProperties.includes(property)
  );
  if (unknownProperty) {
    throw new Error(
      `未登録のhs_ propertyです: ${objectName}.${unknownProperty}`
    );
  }
};

const assertObjectToken = (objectName: string, prefix: string): void => {
  const token = objectName.slice(prefix.length);
  if (!OBJECT_TOKEN_PATTERN.test(token)) {
    throw new Error(
      `部屋variant Object名のtokenは非空ASCII識別子が必要です: ${objectName}`
    );
  }
};

const isRoomVariantRoomId = (
  value: unknown
): value is StageRoomVariantRoomId =>
  typeof value === "string" &&
  STAGE_ROOM_VARIANT_ROOM_IDS.includes(value as StageRoomVariantRoomId);

const isRoomVariantId = (value: unknown): value is StageRoomVariantId =>
  typeof value === "string" &&
  STAGE_ROOM_VARIANT_IDS.includes(value as StageRoomVariantId);

const requireRoomId = (
  objectName: string,
  extras: Extras
): StageRoomVariantRoomId => {
  const roomId = requireString(objectName, extras, "hs_room_id");
  if (!isRoomVariantRoomId(roomId)) {
    throw new Error(
      `hs_room_idがB03-3Cの固定room IDではありません: ${objectName}.${roomId}`
    );
  }
  return roomId;
};

const assertUniqueReferences = (
  label: string,
  nodes: readonly TransformNode[]
): void => {
  const references = new Set<TransformNode>();
  for (const node of nodes) {
    if (references.has(node)) {
      throw new Error(`${label}に同じNode参照が重複しています: ${node.name}`);
    }
    references.add(node);
  }
};

const assertSourceMembership = (
  label: string,
  nodes: readonly TransformNode[],
  authoredNodes: ReadonlySet<TransformNode>
): void => {
  const missing = nodes.find((node) => !authoredNodes.has(node));
  if (missing) {
    throw new Error(
      `${label}のNodeがauthoredNodesにありません: ${missing.name}`
    );
  }
};

const registerPrimaryClassification = (
  classifications: Map<TransformNode, string>,
  label: string,
  nodes: readonly TransformNode[]
): void => {
  for (const node of nodes) {
    const previous = classifications.get(node);
    if (previous) {
      throw new Error(
        `作者Nodeが複数の一次集合へ分類されています: ${node.name} (${previous}, ${label})`
      );
    }
    classifications.set(node, label);
  }
};

const parseRoomVariantMarker = (
  node: TransformNode
): AuthoredRoomVariant => {
  if (!node.name.startsWith(ROOM_VARIANT_MARKER_PREFIX)) {
    throw new Error(
      `room_variantは${ROOM_VARIANT_MARKER_PREFIX}*名が必要です: ${node.name}`
    );
  }
  assertObjectToken(node.name, ROOM_VARIANT_MARKER_PREFIX);
  if (
    node.scaling.x !== 1 ||
    node.scaling.y !== 1 ||
    node.scaling.z !== 1
  ) {
    throw new Error(
      `room_variant Markerのscaleは(1, 1, 1)が必要です: ${node.name}`
    );
  }
  const extras = requireExtras(node);
  assertAllowedHsProperties(
    node.name,
    extras,
    ROOM_VARIANT_ALLOWED_HS_PROPERTIES
  );
  const role = requireString(node.name, extras, "hs_role");
  if (role !== ROOM_VARIANT_ROLE) {
    throw new Error(
      `room_variant Marker名とhs_roleが一致しません: ${node.name}.${role}`
    );
  }
  const roomId = requireRoomId(node.name, extras);
  const variantId = requireEnum(
    node.name,
    extras,
    "hs_variant_id",
    STAGE_ROOM_VARIANT_IDS
  );
  const id = requireKebabCaseId(node.name, extras, "hs_id");
  const expectedId = `room-variant-${roomId}-${variantId}`;
  if (id !== expectedId) {
    throw new Error(
      `room_variantのhs_idが契約と一致しません: ${node.name}.${id} (期待値: ${expectedId})`
    );
  }
  return Object.freeze({ id, roomId, variantId, node, extras });
};

const parseRoomVariantTile = (
  mesh: Mesh
): AuthoredRoomVariantTile => {
  if (!mesh.name.startsWith(ROOM_VARIANT_TILE_PREFIX)) {
    throw new Error(
      `room_variant_tileは${ROOM_VARIANT_TILE_PREFIX}*名が必要です: ${mesh.name}`
    );
  }
  assertObjectToken(mesh.name, ROOM_VARIANT_TILE_PREFIX);
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(
    mesh.name,
    extras,
    ROOM_VARIANT_TILE_ALLOWED_HS_PROPERTIES
  );
  const role = requireString(mesh.name, extras, "hs_role");
  if (role !== ROOM_VARIANT_TILE_ROLE) {
    throw new Error(
      `room_variant_tile Volume名とhs_roleが一致しません: ${mesh.name}.${role}`
    );
  }
  const roomId = requireRoomId(mesh.name, extras);
  const id = requireKebabCaseId(mesh.name, extras, "hs_id");
  const expectedId = `room-variant-tile-${roomId}`;
  if (id !== expectedId) {
    throw new Error(
      `room_variant_tileのhs_idが契約と一致しません: ${mesh.name}.${id} (期待値: ${expectedId})`
    );
  }
  return Object.freeze({ id, roomId, mesh, extras });
};

const assertClosedManifoldVolume = (mesh: Mesh): void => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (
    !positions ||
    positions.length === 0 ||
    positions.length % 3 !== 0 ||
    !indices ||
    indices.length === 0 ||
    indices.length % 3 !== 0
  ) {
    throw new Error(
      `room_variant_tileは閉じた三角形Meshが必要です: ${mesh.name}`
    );
  }

  const vertexCount = positions.length / 3;
  const coordinateByIndex = new Map<number, Vector3>();
  const vertexKeyByIndex = new Map<number, string>();
  const getVertex = (index: number): Readonly<{
    coordinate: Vector3;
    key: string;
  }> => {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
      throw new Error(
        `room_variant_tileの頂点indexが範囲外です: ${mesh.name}.${index}`
      );
    }
    const existingCoordinate = coordinateByIndex.get(index);
    const existingKey = vertexKeyByIndex.get(index);
    if (existingCoordinate && existingKey) {
      return { coordinate: existingCoordinate, key: existingKey };
    }
    const offset = index * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(
        `room_variant_tileの頂点に非有限値があります: ${mesh.name}`
      );
    }
    const coordinate = new Vector3(x, y, z);
    const key = `${x}:${y}:${z}`;
    coordinateByIndex.set(index, coordinate);
    vertexKeyByIndex.set(index, key);
    return { coordinate, key };
  };

  const edges = new Map<string, { count: number; direction: number }>();
  let signedVolume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const first = getVertex(Number(indices[index]));
    const second = getVertex(Number(indices[index + 1]));
    const third = getVertex(Number(indices[index + 2]));
    if (
      first.key === second.key ||
      second.key === third.key ||
      third.key === first.key ||
      Vector3.Cross(
        second.coordinate.subtract(first.coordinate),
        third.coordinate.subtract(first.coordinate)
      ).lengthSquared() <= VOLUME_TRIANGLE_EPSILON
    ) {
      throw new Error(
        `room_variant_tileに退化三角形があります: ${mesh.name}`
      );
    }

    signedVolume +=
      Vector3.Dot(
        first.coordinate,
        Vector3.Cross(second.coordinate, third.coordinate)
      ) / 6;

    for (const [from, to] of [
      [first.key, second.key],
      [second.key, third.key],
      [third.key, first.key]
    ] as const) {
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count += 1;
      edge.direction += from < to ? 1 : -1;
      edges.set(key, edge);
    }
  }

  const invalidEdge = [...edges.values()].find(
    (edge) => edge.count !== 2 || edge.direction !== 0
  );
  if (invalidEdge || Math.abs(signedVolume) <= VOLUME_TRIANGLE_EPSILON) {
    throw new Error(
      `room_variant_tileは位置weld後の全edgeを2面が共有する、閉じたmanifold Meshが必要です: ${mesh.name}`
    );
  }
};

const collectVariantAncestors = (
  node: TransformNode,
  variantByNode: ReadonlyMap<Node, AuthoredRoomVariant>
): readonly AuthoredRoomVariant[] => {
  const ancestors: AuthoredRoomVariant[] = [];
  const visited = new Set<Node>();
  let current = node.parent;
  while (current) {
    if (visited.has(current)) {
      throw new Error(`作者Nodeの親子関係が循環しています: ${node.name}`);
    }
    visited.add(current);
    const variant = variantByNode.get(current);
    if (variant) {
      ancestors.push(variant);
    }
    current = current.parent;
  }
  return ancestors;
};

const isAncestorOf = (
  ancestor: TransformNode,
  node: TransformNode
): boolean => {
  const visited = new Set<Node>();
  let current = node.parent;
  while (current) {
    if (visited.has(current)) {
      throw new Error(`作者Nodeの親子関係が循環しています: ${node.name}`);
    }
    visited.add(current);
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const assertNoVariantProperties = (node: TransformNode): void => {
  const extras = readExtras(node);
  for (const property of ["hs_room_id", "hs_variant_id"] as const) {
    if (Object.prototype.hasOwnProperty.call(extras, property)) {
      throw new Error(
        `room_variant子孫へ${property}を重複記述できません: ${node.name}`
      );
    }
  }
};

const assertVariantVisual = (mesh: Mesh): void => {
  if (!mesh.name.startsWith("VIS_") || mesh.name.length === "VIS_".length) {
    throw new Error(
      `room_variantの表示MeshはVIS_*名が必要です: ${mesh.name}`
    );
  }
  if (
    !ROOM_VARIANT_VISUAL_PREFIXES.some((prefix) =>
      mesh.name.startsWith(prefix)
    )
  ) {
    throw new Error(
      `room_variant配下へ静的建築VIS_*を配置できません: ${mesh.name}`
    );
  }
  assertNoForbiddenDynamicMesh(mesh);
  assertAllowedHsProperties(mesh.name, readExtras(mesh), []);
};

const assertVariantCollider = (mesh: Mesh): void => {
  if (
    !mesh.name.startsWith("COL_") ||
    mesh.name.startsWith("COL_ActorOnly_") ||
    mesh.name.startsWith("COL_HumanOnly_") ||
    mesh.name.length === "COL_".length
  ) {
    throw new Error(
      `room_variantのColliderは通常COL_*名が必要です: ${mesh.name}`
    );
  }
  if (
    !ROOM_VARIANT_COLLIDER_PREFIXES.some((prefix) =>
      mesh.name.startsWith(prefix)
    )
  ) {
    throw new Error(
      `room_variant配下へ静的建築COL_*を配置できません: ${mesh.name}`
    );
  }
  assertNoForbiddenDynamicMesh(mesh);
  assertAllowedHsProperties(mesh.name, readExtras(mesh), []);
};

const assertVariantBeamSightOnlyCollider = (mesh: Mesh): void => {
  if (
    !mesh.name.startsWith("COL_BeamSightOnly_") ||
    mesh.name.length === "COL_BeamSightOnly_".length
  ) {
    throw new Error(
      `room_variantのビーム・視線専用遮蔽はCOL_BeamSightOnly_*名が必要です: ${mesh.name}`
    );
  }
  if (
    !ROOM_VARIANT_BEAM_SIGHT_ONLY_COLLIDER_PREFIXES.some((prefix) =>
      mesh.name.startsWith(prefix)
    )
  ) {
    throw new Error(
      `room_variant配下へ静的なビーム・視線専用遮蔽を配置できません: ${mesh.name}`
    );
  }
  assertNoForbiddenDynamicMesh(mesh);
  assertAllowedHsProperties(mesh.name, readExtras(mesh), []);
};

const assertVariantHumanNavSource = (mesh: Mesh): void => {
  if (
    !mesh.name.startsWith("NAV_") ||
    mesh.name.startsWith("NAV_BitFlight_") ||
    mesh.name.length === "NAV_".length
  ) {
    throw new Error(
      `room_variantのNavMesh生成元は人間用NAV_*名が必要です: ${mesh.name}`
    );
  }
  if (!mesh.name.startsWith(ROOM_VARIANT_NAV_PREFIX)) {
    throw new Error(
      `room_variant配下の人間用NAV_*は${ROOM_VARIANT_NAV_PREFIX}*名が必要です: ${mesh.name}`
    );
  }
  assertNoForbiddenDynamicMesh(mesh);
  const extras = requireExtras(mesh);
  const navSet = requireString(mesh.name, extras, "hs_nav_set");
  if (navSet !== "human") {
    throw new Error(
      `room_variant配下へビット用NAV_*を置けません: ${mesh.name}.${navSet}`
    );
  }
  assertAllowedHsProperties(mesh.name, extras, [
    "hs_nav_set",
    "hs_nav_role",
    "hs_nav_area"
  ]);
  const navRole = requireEnum(
    mesh.name,
    extras,
    "hs_nav_role",
    ["walkable", "blocker", "exclude"] as const
  );
  const hasNavArea = Object.prototype.hasOwnProperty.call(
    extras,
    "hs_nav_area"
  );
  if (navRole === "walkable") {
    requireEnum(
      mesh.name,
      extras,
      "hs_nav_area",
      ["ground", "stairs", "outdoor", "door"] as const
    );
  } else if (hasNavArea) {
    throw new Error(
      `blocker/excludeへhs_nav_areaは指定できません: ${mesh.name}`
    );
  }
};

const assertNoForbiddenDynamicMesh = (mesh: Mesh): void => {
  const forbiddenPrefix = FORBIDDEN_DYNAMIC_MESH_PREFIXES.find((prefix) =>
    mesh.name.startsWith(prefix)
  );
  if (forbiddenPrefix) {
    throw new Error(
      `動的扉・エレベーターのMeshをroom_variant配下へ置けません: ${mesh.name}`
    );
  }
};

const freezeSortedMeshes = (meshes: readonly Mesh[]): readonly Mesh[] =>
  Object.freeze([...meshes].sort((left, right) =>
    left.name.localeCompare(right.name)
  ));

const createUniformSelection = (
  variantId: StageRoomVariantId
): StageRoomVariantSelectionByRoom => {
  const selection = {} as Record<
    StageRoomVariantRoomId,
    StageRoomVariantId
  >;
  for (const roomId of STAGE_ROOM_VARIANT_ROOM_IDS) {
    selection[roomId] = variantId;
  }
  return Object.freeze(selection);
};

export const STAGE_ROOM_VARIANT_ALL_NORMAL_SELECTION =
  createUniformSelection("normal");

export const STAGE_ROOM_VARIANT_ALL_DISORDERED_SELECTION =
  createUniformSelection("disordered");

const normalizeSelection = (
  selection: StageRoomVariantSelection
): StageRoomVariantSelectionByRoom => {
  if (selection === "all-normal") {
    return STAGE_ROOM_VARIANT_ALL_NORMAL_SELECTION;
  }
  if (selection === "all-disordered") {
    return STAGE_ROOM_VARIANT_ALL_DISORDERED_SELECTION;
  }
  if (!isRecord(selection)) {
    throw new Error("部屋variant選択にはpresetまたはroom別選択が必要です");
  }

  const unknownRoomId = Object.keys(selection).find(
    (roomId) => !isRoomVariantRoomId(roomId)
  );
  if (unknownRoomId) {
    throw new Error(
      `部屋variant選択に未登録room IDがあります: ${unknownRoomId}`
    );
  }

  const normalized = {} as Record<
    StageRoomVariantRoomId,
    StageRoomVariantId
  >;
  for (const roomId of STAGE_ROOM_VARIANT_ROOM_IDS) {
    if (!Object.prototype.hasOwnProperty.call(selection, roomId)) {
      throw new Error(`部屋variant選択がありません: ${roomId}`);
    }
    const variantId = selection[roomId];
    if (!isRoomVariantId(variantId)) {
      throw new Error(
        `部屋variant選択が未登録値です: ${roomId}.${String(variantId)}`
      );
    }
    normalized[roomId] = variantId;
  }
  return Object.freeze(normalized);
};

const freezeMeshPartition = (
  variants: readonly StageRoomVariantAsset[]
): StageRoomVariantMeshPartition =>
  Object.freeze({
    visualMeshes: Object.freeze(
      variants.flatMap((variant) => variant.visualMeshes)
    ),
    colliderMeshes: Object.freeze(
      variants.flatMap((variant) => variant.colliderMeshes)
    ),
    beamSightOnlyColliders: Object.freeze(
      variants.flatMap((variant) => variant.beamSightOnlyColliders)
    ),
    humanNavSourceMeshes: Object.freeze(
      variants.flatMap((variant) => variant.humanNavSourceMeshes)
    )
  });

const createActivation = (
  variants: readonly StageRoomVariantAsset[],
  selection: StageRoomVariantSelection
): StageRoomVariantActivation => {
  const normalized = normalizeSelection(selection);
  const selectedVariants = variants.filter(
    (variant) => normalized[variant.roomId] === variant.variantId
  );
  if (selectedVariants.length !== STAGE_ROOM_VARIANT_ROOM_IDS.length) {
    throw new Error(
      `active room_variantは各室1件が必要です: ${selectedVariants.length}件`
    );
  }
  const selected = new Set(selectedVariants);
  const unselectedVariants = variants.filter(
    (variant) => !selected.has(variant)
  );
  return Object.freeze({
    selection: normalized,
    selectedVariants: Object.freeze(selectedVariants),
    unselectedVariants: Object.freeze(unselectedVariants),
    active: freezeMeshPartition(selectedVariants),
    inactive: freezeMeshPartition(unselectedVariants)
  });
};

export const createStageRoomVariantAssetRegistry = (
  source: StageRoomVariantAssetRegistrySource
): StageRoomVariantAssetRegistry => {
  assertUniqueReferences("authoredNodes", source.authoredNodes);
  assertUniqueReferences("markerNodes", source.markerNodes);
  assertUniqueReferences("volumeMeshes", source.volumeMeshes);
  assertUniqueReferences("visualMeshes", source.visualMeshes);
  assertUniqueReferences("normalColliders", source.normalColliders);
  assertUniqueReferences(
    "beamSightOnlyColliders",
    source.beamSightOnlyColliders
  );
  assertUniqueReferences(
    "humanNavSourceMeshes",
    source.humanNavSourceMeshes
  );

  const authoredNodes = new Set(source.authoredNodes);
  assertSourceMembership("markerNodes", source.markerNodes, authoredNodes);
  assertSourceMembership("volumeMeshes", source.volumeMeshes, authoredNodes);
  assertSourceMembership("visualMeshes", source.visualMeshes, authoredNodes);
  assertSourceMembership(
    "normalColliders",
    source.normalColliders,
    authoredNodes
  );
  assertSourceMembership(
    "beamSightOnlyColliders",
    source.beamSightOnlyColliders,
    authoredNodes
  );
  assertSourceMembership(
    "humanNavSourceMeshes",
    source.humanNavSourceMeshes,
    authoredNodes
  );

  const primaryClassification = new Map<TransformNode, string>();
  registerPrimaryClassification(
    primaryClassification,
    "markerNodes",
    source.markerNodes
  );
  registerPrimaryClassification(
    primaryClassification,
    "volumeMeshes",
    source.volumeMeshes
  );
  registerPrimaryClassification(
    primaryClassification,
    "visualMeshes",
    source.visualMeshes
  );
  registerPrimaryClassification(
    primaryClassification,
    "normalColliders",
    source.normalColliders
  );
  registerPrimaryClassification(
    primaryClassification,
    "beamSightOnlyColliders",
    source.beamSightOnlyColliders
  );
  registerPrimaryClassification(
    primaryClassification,
    "humanNavSourceMeshes",
    source.humanNavSourceMeshes
  );

  const markerNodes = new Set(source.markerNodes);
  const volumeMeshes = new Set<TransformNode>(source.volumeMeshes);
  const roomVariantCandidates = source.authoredNodes.filter(
    isStageRoomVariantMarkerNode
  );
  const tileCandidates = source.authoredNodes.filter((node) =>
    isStageRoomVariantTileMesh(node as Mesh)
  );

  const invalidMarkerCandidate = roomVariantCandidates.find(
    (node) => !markerNodes.has(node)
  );
  if (invalidMarkerCandidate) {
    throw new Error(
      `room_variantがmarkerNodesへ分類されていません: ${invalidMarkerCandidate.name}`
    );
  }
  const invalidTileCandidate = tileCandidates.find(
    (node) => !volumeMeshes.has(node)
  );
  if (invalidTileCandidate) {
    throw new Error(
      `room_variant_tileがvolumeMeshesへ分類されていません: ${invalidTileCandidate.name}`
    );
  }
  if (roomVariantCandidates.length !== 40) {
    throw new Error(
      `room_variant Markerは20室×2の40件が必要です: ${roomVariantCandidates.length}件`
    );
  }
  if (tileCandidates.length !== 20) {
    throw new Error(
      `room_variant_tile Volumeは20件が必要です: ${tileCandidates.length}件`
    );
  }

  const parsedVariants = roomVariantCandidates.map(parseRoomVariantMarker);
  const parsedTiles = tileCandidates.map((node) =>
    parseRoomVariantTile(node as Mesh)
  );

  const ids = new Map<string, string>();
  for (const entry of [...parsedVariants, ...parsedTiles]) {
    const owner = ids.get(entry.id);
    const objectName = "node" in entry ? entry.node.name : entry.mesh.name;
    if (owner) {
      throw new Error(
        `部屋variant資産のhs_idが重複しています: ${entry.id} (${owner}, ${objectName})`
      );
    }
    ids.set(entry.id, objectName);
  }

  const variantByKey = new Map<string, AuthoredRoomVariant>();
  const variantByNode = new Map<Node, AuthoredRoomVariant>();
  for (const variant of parsedVariants) {
    const key = `${variant.roomId}:${variant.variantId}`;
    const previous = variantByKey.get(key);
    if (previous) {
      throw new Error(
        `同じroom/variantのMarkerが重複しています: ${key} (${previous.node.name}, ${variant.node.name})`
      );
    }
    variantByKey.set(key, variant);
    variantByNode.set(variant.node, variant);
  }

  const tileByRoomId = new Map<
    StageRoomVariantRoomId,
    AuthoredRoomVariantTile
  >();
  for (const tile of parsedTiles) {
    const previous = tileByRoomId.get(tile.roomId);
    if (previous) {
      throw new Error(
        `同じroomのroom_variant_tileが重複しています: ${tile.roomId} (${previous.mesh.name}, ${tile.mesh.name})`
      );
    }
    assertClosedManifoldVolume(tile.mesh);
    tileByRoomId.set(tile.roomId, tile);
  }

  for (const variant of parsedVariants) {
    const variantAncestors = collectVariantAncestors(
      variant.node,
      variantByNode
    );
    if (variantAncestors.length > 0) {
      throw new Error(
        `room_variantを入れ子にできません: ${variant.node.name} -> ${variantAncestors[0].node.name}`
      );
    }
  }
  for (const tile of parsedTiles) {
    const variantAncestors = collectVariantAncestors(
      tile.mesh,
      variantByNode
    );
    const relatedVariant = parsedVariants.find(
      (variant) => isAncestorOf(tile.mesh, variant.node)
    );
    if (variantAncestors.length > 0 || relatedVariant) {
      throw new Error(
        `room_variant_tileはvariant rootと親子関係を持てません: ${tile.mesh.name}`
      );
    }
  }
  for (const node of source.authoredNodes) {
    if (
      !node.name.startsWith("VIS_RoomVariant_") &&
      !node.name.startsWith("COL_RoomVariant_") &&
      !node.name.startsWith("COL_BeamSightOnly_RoomVariant_") &&
      !node.name.startsWith("NAV_RoomVariant_")
    ) {
      continue;
    }
    const variantAncestors = collectVariantAncestors(node, variantByNode);
    if (variantAncestors.length !== 1) {
      throw new Error(
        `RoomVariant名の作者Meshは最寄りroom_variant ancestorちょうど1件が必要です: ${node.name}`
      );
    }
  }

  const accumulators = new Map<AuthoredRoomVariant, VariantMeshAccumulator>();
  for (const variant of parsedVariants) {
    accumulators.set(variant, {
      visualMeshes: [],
      colliderMeshes: [],
      beamSightOnlyColliders: [],
      humanNavSourceMeshes: []
    });
  }

  for (const node of source.authoredNodes) {
    if (variantByNode.has(node)) {
      continue;
    }
    const ancestors = collectVariantAncestors(node, variantByNode);
    if (ancestors.length === 0) {
      continue;
    }
    if (ancestors.length !== 1) {
      throw new Error(
        `作者Objectが複数room_variantへ所属しています: ${node.name}`
      );
    }

    const owner = ancestors[0];
    const accumulator = accumulators.get(owner);
    if (!accumulator) {
      throw new Error(
        `room_variantの内部索引がありません: ${owner.node.name}`
      );
    }
    assertNoVariantProperties(node);
    const classification = primaryClassification.get(node);
    if (classification === "visualMeshes") {
      const mesh = node as Mesh;
      assertVariantVisual(mesh);
      accumulator.visualMeshes.push(mesh);
    } else if (classification === "normalColliders") {
      const mesh = node as Mesh;
      assertVariantCollider(mesh);
      accumulator.colliderMeshes.push(mesh);
    } else if (classification === "beamSightOnlyColliders") {
      const mesh = node as Mesh;
      assertVariantBeamSightOnlyCollider(mesh);
      accumulator.beamSightOnlyColliders.push(mesh);
    } else if (classification === "humanNavSourceMeshes") {
      const mesh = node as Mesh;
      assertVariantHumanNavSource(mesh);
      accumulator.humanNavSourceMeshes.push(mesh);
    } else {
      throw new Error(
        `room_variant配下にはVIS_*、通常COL_*、COL_BeamSightOnly_*、人間用NAV_*だけを配置できます: ${node.name} (${classification ?? "未分類"})`
      );
    }
  }

  const variants: StageRoomVariantAsset[] = [];
  for (const roomId of STAGE_ROOM_VARIANT_ROOM_IDS) {
    for (const variantId of STAGE_ROOM_VARIANT_IDS) {
      const authored = variantByKey.get(`${roomId}:${variantId}`);
      if (!authored) {
        throw new Error(
          `room_variant Markerがありません: ${roomId}.${variantId}`
        );
      }
      const meshes = accumulators.get(authored);
      if (!meshes) {
        throw new Error(
          `room_variantの内部索引がありません: ${authored.node.name}`
        );
      }
      if (
        meshes.visualMeshes.length === 0 ||
        meshes.colliderMeshes.length === 0 ||
        meshes.humanNavSourceMeshes.length === 0
      ) {
        throw new Error(
          `各room_variantにはVIS_*、通常COL_*、人間用NAV_*が各1件以上必要です: ${authored.node.name} ` +
            `(VIS=${meshes.visualMeshes.length}, COL=${meshes.colliderMeshes.length}, NAV=${meshes.humanNavSourceMeshes.length})`
        );
      }
      variants.push(
        Object.freeze({
          id: authored.id,
          roomId,
          variantId,
          node: authored.node,
          visualMeshes: freezeSortedMeshes(meshes.visualMeshes),
          colliderMeshes: freezeSortedMeshes(meshes.colliderMeshes),
          beamSightOnlyColliders: freezeSortedMeshes(
            meshes.beamSightOnlyColliders
          ),
          humanNavSourceMeshes: freezeSortedMeshes(
            meshes.humanNavSourceMeshes
          )
        })
      );
    }
  }

  const tileVolumes: StageRoomVariantTileVolume[] = [];
  for (const roomId of STAGE_ROOM_VARIANT_ROOM_IDS) {
    const tile = tileByRoomId.get(roomId);
    if (!tile) {
      throw new Error(`room_variant_tileがありません: ${roomId}`);
    }
    tileVolumes.push(
      Object.freeze({ id: tile.id, roomId, mesh: tile.mesh })
    );
  }

  const frozenVariants = Object.freeze(variants);
  const frozenTileVolumes = Object.freeze(tileVolumes);
  const variantById = new Map(
    frozenVariants.map((variant) => [variant.id, variant] as const)
  );
  const runtimeVariantByKey = new Map(
    frozenVariants.map(
      (variant) =>
        [`${variant.roomId}:${variant.variantId}`, variant] as const
    )
  );
  const runtimeTileByRoomId = new Map(
    frozenTileVolumes.map((tile) => [tile.roomId, tile] as const)
  );
  const frozenIds = Object.freeze([
    ...frozenVariants.map((variant) => variant.id),
    ...frozenTileVolumes.map((tile) => tile.id)
  ]);

  return Object.freeze({
    roomIds: STAGE_ROOM_VARIANT_ROOM_IDS,
    variantIds: STAGE_ROOM_VARIANT_IDS,
    ids: frozenIds,
    variants: frozenVariants,
    tileVolumes: frozenTileVolumes,
    getVariantById: (id: string) => variantById.get(id) ?? null,
    getVariant: (
      roomId: StageRoomVariantRoomId,
      variantId: StageRoomVariantId
    ) => {
      const variant = runtimeVariantByKey.get(`${roomId}:${variantId}`);
      if (!variant) {
        throw new Error(
          `room_variantが登録されていません: ${roomId}.${variantId}`
        );
      }
      return variant;
    },
    getTileVolume: (roomId: StageRoomVariantRoomId) => {
      const tile = runtimeTileByRoomId.get(roomId);
      if (!tile) {
        throw new Error(`room_variant_tileが登録されていません: ${roomId}`);
      }
      return tile;
    },
    activate: (selection: StageRoomVariantSelection) =>
      createActivation(frozenVariants, selection)
  });
};
