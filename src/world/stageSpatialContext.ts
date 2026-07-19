import {
  AssetContainer,
  Mesh,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import {
  createNavigationWorld,
  type NavigationWorld
} from "./navigationWorld";
import type { StageCatalogEntry } from "./stageCatalog";
import {
  createStageLinkRegistry,
  STAGE_LINK_KINDS,
  type StageLinkKind,
  type StageLinkPair,
  type StageLinkRegistry
} from "./stageLinks";
import {
  createStageBoundaryContainsQuery,
  createStageSpatialQueries,
  STAGE_VOLUME_ROLES,
  type StageMovementColliderSets,
  type StageSpatialQueries,
  type StageVolume,
  type StageVolumeRole
} from "./stageSpatialQueries";
import { BLENDER_METERS_TO_WORLD_UNITS } from "./worldUnits";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LINK_OBJECT_NAME_PATTERN = /^LNK_(.+)_(A|B)$/;

export const STAGE_MARKER_ROLES = [
  "player_spawn",
  "assembly_anchor",
  "patrol_anchor"
] as const;

export type StageMarkerRole = (typeof STAGE_MARKER_ROLES)[number];

export type StageMarker = Readonly<{
  id: string;
  role: StageMarkerRole;
  node: TransformNode;
}>;

export interface StageMarkerRegistry {
  readonly all: readonly StageMarker[];
  getById(id: string): StageMarker | null;
  getByRole(role: StageMarkerRole): readonly StageMarker[];
  requireSingle(role: StageMarkerRole): StageMarker;
}

export type StageBoundary = Readonly<{
  id: "stage";
  mesh: Mesh;
  contains(point: Vector3): boolean;
}>;

export type StageMetadata = Readonly<{
  schemaVersion: number;
  stageId: string;
  navProfileId: string;
  node: TransformNode;
}>;

export type StageSpatialResources = Readonly<{
  visualMeshes: readonly Mesh[];
  normalColliders: readonly Mesh[];
  actorOnlyColliders: readonly Mesh[];
  humanOnlyColliders: readonly Mesh[];
  movementColliders: StageMovementColliderSets;
  beamBlockers: readonly Mesh[];
  sightBlockers: readonly Mesh[];
  navSourceMeshes: readonly Mesh[];
  semanticMeshes: readonly Mesh[];
  semanticNodes: readonly TransformNode[];
  metadataNode: TransformNode;
  assetContainer: AssetContainer;
  managementRoot: Mesh;
}>;

export type StageVolumeRegistry = Readonly<{
  all: readonly StageVolume[];
  getById(id: string): StageVolume | null;
  getByRole(role: StageVolumeRole): readonly StageVolume[];
}>;

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

const NAV_ROLES = ["walkable", "blocker", "exclude"] as const;
type NavRole = (typeof NAV_ROLES)[number];

const NAV_AREAS = ["ground", "stairs", "outdoor", "door"] as const;
type NavArea = (typeof NAV_AREAS)[number];

const PORTAL_ROLES = [
  "room_portal",
  "streaming_portal",
  "door_trigger"
] as const;
type PortalRole = (typeof PORTAL_ROLES)[number];

type StagePortal = Readonly<{
  id: string;
  role: PortalRole;
  mesh: Mesh;
}>;

type AuthoredStageLinkEndpoint = Readonly<{
  id: string;
  kind: StageLinkKind;
  bidirectional: boolean;
  radiusMeters: number;
  endpoint: "A" | "B";
  objectLinkName: string;
  node: TransformNode;
}>;

type NavSource = Readonly<{
  mesh: Mesh;
  role: NavRole;
  area: NavArea | null;
}>;

type StageAssetClassification = Readonly<{
  metadata: StageMetadata;
  visualMeshes: readonly Mesh[];
  normalColliders: readonly Mesh[];
  actorOnlyColliders: readonly Mesh[];
  humanOnlyColliders: readonly Mesh[];
  navSources: readonly NavSource[];
  markers: readonly StageMarker[];
  volumes: readonly StageVolume[];
  boundaryMesh: Mesh;
  portals: readonly StagePortal[];
  links: readonly AuthoredStageLinkEndpoint[];
}>;

type Extras = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readExtras = (node: TransformNode): Extras => {
  if (!isRecord(node.metadata)) {
    return {};
  }
  const gltfMetadata = node.metadata.gltf;
  if (!isRecord(gltfMetadata) || !isRecord(gltfMetadata.extras)) {
    return {};
  }
  return gltfMetadata.extras;
};

const requireExtras = (node: TransformNode): Extras => {
  const extras = readExtras(node);
  if (Object.keys(extras).length === 0) {
    throw new Error(`必須のglTF Node extrasがありません: ${node.name}`);
  }
  return extras;
};

const assertAllowedHsProperties = (
  objectName: string,
  extras: Extras,
  allowedProperties: readonly string[]
) => {
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

const requireString = (
  objectName: string,
  extras: Extras,
  property: string
): string => {
  const value = extras[property];
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`非空文字列が必要です: ${objectName}.${property}`);
  }
  return value;
};

const requireId = (objectName: string, extras: Extras): string => {
  const value = requireString(objectName, extras, "hs_id");
  if (!KEBAB_CASE_ID_PATTERN.test(value)) {
    throw new Error(`hs_idは小文字kebab-caseで指定します: ${objectName}`);
  }
  return value;
};

const requireInteger = (
  objectName: string,
  extras: Extras,
  property: string
): number => {
  const value = extras[property];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`整数が必要です: ${objectName}.${property}`);
  }
  return value;
};

const requireFiniteNumber = (
  objectName: string,
  extras: Extras,
  property: string
): number => {
  const value = extras[property];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`有限数が必要です: ${objectName}.${property}`);
  }
  return value;
};

const requireBoolean = (
  objectName: string,
  extras: Extras,
  property: string
): boolean => {
  const value = extras[property];
  if (typeof value !== "boolean") {
    throw new Error(`booleanが必要です: ${objectName}.${property}`);
  }
  return value;
};

const requireEnum = <T extends readonly string[]>(
  objectName: string,
  extras: Extras,
  property: string,
  values: T
): T[number] => {
  const value = requireString(objectName, extras, property);
  if (!values.includes(value)) {
    throw new Error(`未登録値です: ${objectName}.${property}=${value}`);
  }
  return value as T[number];
};

const assertUnitScale = (node: TransformNode) => {
  if (
    node.scaling.x !== 1 ||
    node.scaling.y !== 1 ||
    node.scaling.z !== 1
  ) {
    throw new Error(`Emptyのscaleは(1, 1, 1)が必要です: ${node.name}`);
  }
};

const assertFiniteNodeTransform = (node: TransformNode) => {
  const worldValues = node.computeWorldMatrix(true).toArray();
  if (worldValues.some((value) => !Number.isFinite(value))) {
    throw new Error(`world Transformに非有限値があります: ${node.name}`);
  }
};

const assertFiniteMeshGeometry = (mesh: Mesh) => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || positions.length === 0) {
    throw new Error(`頂点を持たない作者Meshです: ${mesh.name}`);
  }
  if (positions.some((value) => !Number.isFinite(value))) {
    throw new Error(`頂点に非有限値があります: ${mesh.name}`);
  }
  assertFiniteNodeTransform(mesh);
  const bounds = mesh.getBoundingInfo().boundingBox;
  const boundsValues = [
    ...bounds.minimumWorld.asArray(),
    ...bounds.maximumWorld.asArray()
  ];
  if (boundsValues.some((value) => !Number.isFinite(value))) {
    throw new Error(`world boundsに非有限値があります: ${mesh.name}`);
  }
};

const configureVisualMesh = (mesh: Mesh) => {
  mesh.setEnabled(true);
  mesh.isVisible = true;
  mesh.visibility = 1;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
};

const configureActorCollider = (mesh: Mesh) => {
  mesh.setEnabled(true);
  mesh.isVisible = false;
  mesh.visibility = 1;
  mesh.isPickable = false;
  mesh.checkCollisions = true;
};

const configureSemanticMesh = (mesh: Mesh) => {
  mesh.setEnabled(true);
  mesh.isVisible = false;
  mesh.visibility = 1;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
};

const assertNoHsProperties = (node: TransformNode) =>
  assertAllowedHsProperties(node.name, readExtras(node), []);

const assertNameHasSuffix = (objectName: string, prefix: string) => {
  if (objectName.length === prefix.length) {
    throw new Error(`接頭辞の後にObject識別名が必要です: ${objectName}`);
  }
};

const classifyNavSource = (mesh: Mesh): NavSource => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, ["hs_nav_role", "hs_nav_area"]);
  const role = requireEnum(mesh.name, extras, "hs_nav_role", NAV_ROLES);
  if (role === "walkable") {
    return {
      mesh,
      role,
      area: requireEnum(mesh.name, extras, "hs_nav_area", NAV_AREAS)
    };
  }
  if (Object.prototype.hasOwnProperty.call(extras, "hs_nav_area")) {
    throw new Error(`blocker/excludeへhs_nav_areaは指定できません: ${mesh.name}`);
  }
  return { mesh, role, area: null };
};

const classifyVolume = (mesh: Mesh): StageVolume => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, ["hs_id", "hs_role"]);
  return {
    id: requireId(mesh.name, extras),
    role: requireEnum(mesh.name, extras, "hs_role", STAGE_VOLUME_ROLES),
    mesh
  };
};

const classifyBoundary = (mesh: Mesh): { id: "stage"; mesh: Mesh } => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, ["hs_id", "hs_role"]);
  const id = requireId(mesh.name, extras);
  const role = requireString(mesh.name, extras, "hs_role");
  if (id !== "stage" || role !== "playable_boundary") {
    throw new Error(
      "BND_Stageにはhs_id=stage、hs_role=playable_boundaryが必要です"
    );
  }
  return { id, mesh };
};

const classifyPortal = (mesh: Mesh): StagePortal => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, [
    "hs_id",
    "hs_role",
    "hs_from",
    "hs_to"
  ]);
  const role = requireEnum(mesh.name, extras, "hs_role", PORTAL_ROLES);
  const hasFrom = Object.prototype.hasOwnProperty.call(extras, "hs_from");
  const hasTo = Object.prototype.hasOwnProperty.call(extras, "hs_to");
  if (hasFrom !== hasTo) {
    throw new Error(`PRT_*のhs_fromとhs_toは対で指定します: ${mesh.name}`);
  }
  if (hasFrom) {
    requireString(mesh.name, extras, "hs_from");
    requireString(mesh.name, extras, "hs_to");
  }
  return { id: requireId(mesh.name, extras), role, mesh };
};

const classifyMetadata = (
  node: TransformNode,
  stage: StageCatalogEntry
): StageMetadata => {
  const extras = requireExtras(node);
  assertAllowedHsProperties(node.name, extras, [
    "hs_schema_version",
    "hs_stage_id",
    "hs_nav_profile"
  ]);
  const schemaVersion = requireInteger(node.name, extras, "hs_schema_version");
  const stageId = requireString(node.name, extras, "hs_stage_id");
  const navProfileId = requireString(node.name, extras, "hs_nav_profile");
  if (schemaVersion !== stage.assetSchemaVersion) {
    throw new Error(
      `資産schema versionがカタログと一致しません: ${schemaVersion}`
    );
  }
  if (stageId !== stage.id) {
    throw new Error(`GLBのstage IDがカタログと一致しません: ${stageId}`);
  }
  if (navProfileId !== stage.navProfileId) {
    throw new Error(
      `GLBのNavMeshプロファイルがカタログと一致しません: ${navProfileId}`
    );
  }
  return { schemaVersion, stageId, navProfileId, node };
};

const classifyMarker = (node: TransformNode): StageMarker => {
  const extras = requireExtras(node);
  assertAllowedHsProperties(node.name, extras, ["hs_id", "hs_role"]);
  assertUnitScale(node);
  return {
    id: requireId(node.name, extras),
    role: requireEnum(node.name, extras, "hs_role", STAGE_MARKER_ROLES),
    node
  };
};

const classifyLink = (node: TransformNode): AuthoredStageLinkEndpoint => {
  const nameMatch = LINK_OBJECT_NAME_PATTERN.exec(node.name);
  if (!nameMatch) {
    throw new Error(`LNK_*名はLNK_<id>_A/Bで指定します: ${node.name}`);
  }
  const extras = requireExtras(node);
  assertAllowedHsProperties(node.name, extras, [
    "hs_id",
    "hs_link_kind",
    "hs_bidirectional",
    "hs_link_radius_m",
    "hs_endpoint"
  ]);
  assertUnitScale(node);
  const endpoint = requireEnum(
    node.name,
    extras,
    "hs_endpoint",
    ["A", "B"] as const
  );
  if (endpoint !== nameMatch[2]) {
    throw new Error(`LNK_*名とhs_endpointが一致しません: ${node.name}`);
  }
  const radiusMeters = requireFiniteNumber(
    node.name,
    extras,
    "hs_link_radius_m"
  );
  if (radiusMeters <= 0) {
    throw new Error(`hs_link_radius_mは正数が必要です: ${node.name}`);
  }
  const id = requireId(node.name, extras);
  if (nameMatch[1] !== id) {
    throw new Error(`LNK_*名とhs_idが一致しません: ${node.name}`);
  }
  return {
    id,
    kind: requireEnum(node.name, extras, "hs_link_kind", STAGE_LINK_KINDS),
    bidirectional: requireBoolean(node.name, extras, "hs_bidirectional"),
    radiusMeters,
    endpoint,
    objectLinkName: nameMatch[1],
    node
  };
};

const assertUniqueObjectNames = (nodes: readonly TransformNode[]) => {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.name)) {
      throw new Error(`作者Object名が重複しています: ${node.name}`);
    }
    seen.add(node.name);
  }
};

const assertUniqueSemanticIds = (
  markers: readonly StageMarker[],
  volumes: readonly StageVolume[],
  boundaryId: string,
  portals: readonly StagePortal[],
  links: readonly AuthoredStageLinkEndpoint[]
) => {
  const owners = new Map<string, string>();
  const register = (id: string, objectName: string) => {
    const owner = owners.get(id);
    if (owner) {
      throw new Error(`hs_idが重複しています: ${id} (${owner}, ${objectName})`);
    }
    owners.set(id, objectName);
  };

  for (const marker of markers) {
    register(marker.id, marker.node.name);
  }
  for (const volume of volumes) {
    register(volume.id, volume.mesh.name);
  }
  register(boundaryId, "BND_Stage");
  for (const portal of portals) {
    register(portal.id, portal.mesh.name);
  }

  const linksById = new Map<string, AuthoredStageLinkEndpoint[]>();
  for (const link of links) {
    const pair = linksById.get(link.id) ?? [];
    pair.push(link);
    linksById.set(link.id, pair);
  }
  for (const [id, pair] of linksById) {
    if (pair.length !== 2) {
      throw new Error(`LNK_*はA/Bの2個で構成します: ${id}`);
    }
    const endpointA = pair.find((link) => link.endpoint === "A");
    const endpointB = pair.find((link) => link.endpoint === "B");
    if (!endpointA || !endpointB) {
      throw new Error(`LNK_*のA/B endpointが揃っていません: ${id}`);
    }
    if (
      endpointA.objectLinkName !== endpointB.objectLinkName ||
      endpointA.kind !== endpointB.kind ||
      endpointA.bidirectional !== endpointB.bidirectional ||
      endpointA.radiusMeters !== endpointB.radiusMeters
    ) {
      throw new Error(`LNK_* pairのpropertyが一致しません: ${id}`);
    }
    if (
      (endpointA.kind === "bit_window" || endpointA.kind === "bit_roof") &&
      !endpointA.bidirectional
    ) {
      throw new Error(`${endpointA.kind}は双方向必須です: ${id}`);
    }
    endpointA.node.computeWorldMatrix(true);
    endpointB.node.computeWorldMatrix(true);
    if (
      Vector3.Distance(
        endpointA.node.getAbsolutePosition(),
        endpointB.node.getAbsolutePosition()
      ) === 0
    ) {
      throw new Error(`LNK_*のA/Bには異なる位置が必要です: ${id}`);
    }
    register(id, `${endpointA.node.name}/${endpointB.node.name}`);
  }
};

const classifyStageAsset = (
  container: AssetContainer,
  managementRoot: Mesh,
  stage: StageCatalogEntry
): StageAssetClassification => {
  const authoredMeshes: Mesh[] = [];
  for (const mesh of container.meshes) {
    if (mesh === managementRoot) {
      continue;
    }
    if (!(mesh instanceof Mesh)) {
      throw new Error(`作者MeshはBabylon Meshとして読み込む必要があります: ${mesh.name}`);
    }
    if (mesh.getTotalVertices() === 0) {
      if (mesh.name === "__root__") {
        continue;
      }
      throw new Error(`規約外の頂点なしMeshです: ${mesh.name}`);
    }
    authoredMeshes.push(mesh);
  }

  const authoredEmptyNodes = container.transformNodes.filter(
    (node): node is TransformNode => node instanceof TransformNode
  );
  const authoredNodes: TransformNode[] = [
    ...authoredMeshes,
    ...authoredEmptyNodes
  ];
  assertUniqueObjectNames(authoredNodes);

  const visualMeshes: Mesh[] = [];
  const normalColliders: Mesh[] = [];
  const actorOnlyColliders: Mesh[] = [];
  const humanOnlyColliders: Mesh[] = [];
  const navSources: NavSource[] = [];
  const volumes: StageVolume[] = [];
  const boundaries: Array<{ id: "stage"; mesh: Mesh }> = [];
  const portals: StagePortal[] = [];

  for (const mesh of authoredMeshes) {
    assertFiniteMeshGeometry(mesh);
    if (mesh.name.startsWith("COL_ActorOnly_")) {
      assertNameHasSuffix(mesh.name, "COL_ActorOnly_");
      assertNoHsProperties(mesh);
      configureActorCollider(mesh);
      actorOnlyColliders.push(mesh);
    } else if (mesh.name.startsWith("COL_HumanOnly_")) {
      assertNameHasSuffix(mesh.name, "COL_HumanOnly_");
      assertNoHsProperties(mesh);
      configureActorCollider(mesh);
      humanOnlyColliders.push(mesh);
    } else if (mesh.name.startsWith("COL_")) {
      assertNameHasSuffix(mesh.name, "COL_");
      assertNoHsProperties(mesh);
      configureActorCollider(mesh);
      normalColliders.push(mesh);
    } else if (mesh.name.startsWith("VIS_")) {
      assertNameHasSuffix(mesh.name, "VIS_");
      assertNoHsProperties(mesh);
      configureVisualMesh(mesh);
      visualMeshes.push(mesh);
    } else if (mesh.name.startsWith("NAV_")) {
      assertNameHasSuffix(mesh.name, "NAV_");
      const source = classifyNavSource(mesh);
      configureSemanticMesh(mesh);
      navSources.push(source);
    } else if (mesh.name.startsWith("VOL_")) {
      assertNameHasSuffix(mesh.name, "VOL_");
      const volume = classifyVolume(mesh);
      configureSemanticMesh(mesh);
      volumes.push(volume);
    } else if (mesh.name === "BND_Stage") {
      const boundary = classifyBoundary(mesh);
      configureSemanticMesh(mesh);
      boundaries.push(boundary);
    } else if (mesh.name.startsWith("PRT_")) {
      assertNameHasSuffix(mesh.name, "PRT_");
      const portal = classifyPortal(mesh);
      configureSemanticMesh(mesh);
      portals.push(portal);
    } else {
      throw new Error(`V2資産規約外の作者Mesh名です: ${mesh.name}`);
    }
  }

  const metadataEntries: StageMetadata[] = [];
  const markers: StageMarker[] = [];
  const links: AuthoredStageLinkEndpoint[] = [];
  for (const node of authoredEmptyNodes) {
    assertFiniteNodeTransform(node);
    if (node.name === "META_Stage") {
      metadataEntries.push(classifyMetadata(node, stage));
    } else if (node.name.startsWith("MRK_")) {
      assertNameHasSuffix(node.name, "MRK_");
      markers.push(classifyMarker(node));
    } else if (node.name.startsWith("LNK_")) {
      links.push(classifyLink(node));
    } else {
      throw new Error(`V2資産規約外の作者Empty名です: ${node.name}`);
    }
  }

  if (metadataEntries.length !== 1) {
    throw new Error(`META_Stageは1個必要です: ${metadataEntries.length}個`);
  }
  if (boundaries.length !== 1) {
    throw new Error(`BND_Stageは1個必要です: ${boundaries.length}個`);
  }
  const playerSpawns = markers.filter((marker) => marker.role === "player_spawn");
  if (playerSpawns.length !== 1) {
    throw new Error(`player_spawnは1個必要です: ${playerSpawns.length}個`);
  }
  if (!navSources.some((source) => source.role === "walkable")) {
    throw new Error("hs_nav_role=walkableのNAV_*が必要です");
  }
  for (const requiredRole of ["npc_spawn", "bit_spawn"] as const) {
    if (!volumes.some((volume) => volume.role === requiredRole)) {
      throw new Error(`${requiredRole}のVOL_*が必要です`);
    }
  }

  assertUniqueSemanticIds(
    markers,
    volumes,
    boundaries[0].id,
    portals,
    links
  );

  return {
    metadata: metadataEntries[0],
    visualMeshes,
    normalColliders,
    actorOnlyColliders,
    humanOnlyColliders,
    navSources,
    markers,
    volumes,
    boundaryMesh: boundaries[0].mesh,
    portals,
    links
  };
};

const createMarkerRegistry = (
  markers: readonly StageMarker[]
): StageMarkerRegistry => {
  const all = Object.freeze([...markers]);
  const byId = new Map(markers.map((marker) => [marker.id, marker]));
  const byRole = new Map<StageMarkerRole, readonly StageMarker[]>();
  for (const role of STAGE_MARKER_ROLES) {
    byRole.set(
      role,
      Object.freeze(markers.filter((marker) => marker.role === role))
    );
  }
  return Object.freeze({
    all,
    getById: (id: string) => byId.get(id) ?? null,
    getByRole: (role: StageMarkerRole) => byRole.get(role)!,
    requireSingle: (role: StageMarkerRole) => {
      const matches = byRole.get(role)!;
      if (matches.length !== 1) {
        throw new Error(`${role} markerを1個に特定できません: ${matches.length}個`);
      }
      return matches[0];
    }
  });
};

const createVolumeRegistry = (
  volumes: readonly StageVolume[]
): StageVolumeRegistry => {
  const all = Object.freeze([...volumes]);
  const byId = new Map(volumes.map((volume) => [volume.id, volume]));
  const byRole = new Map<StageVolumeRole, readonly StageVolume[]>();
  for (const role of STAGE_VOLUME_ROLES) {
    byRole.set(
      role,
      Object.freeze(volumes.filter((volume) => volume.role === role))
    );
  }
  return Object.freeze({
    all,
    getById: (id: string) => byId.get(id) ?? null,
    getByRole: (role: StageVolumeRole) => byRole.get(role)!
  });
};

const createLinkRegistry = (
  links: readonly AuthoredStageLinkEndpoint[]
): StageLinkRegistry => {
  const linksById = new Map<string, AuthoredStageLinkEndpoint[]>();
  for (const link of links) {
    const pair = linksById.get(link.id) ?? [];
    pair.push(link);
    linksById.set(link.id, pair);
  }
  const pairs: StageLinkPair[] = [];
  for (const [id, endpoints] of linksById) {
    const endpointA = endpoints.find((link) => link.endpoint === "A")!;
    const endpointB = endpoints.find((link) => link.endpoint === "B")!;
    endpointA.node.computeWorldMatrix(true);
    endpointB.node.computeWorldMatrix(true);
    pairs.push(
      Object.freeze({
        id,
        kind: endpointA.kind,
        bidirectional: endpointA.bidirectional,
        radiusMeters: endpointA.radiusMeters,
        endpointA: Object.freeze({
          endpoint: "A" as const,
          position: endpointA.node.getAbsolutePosition().clone(),
          node: endpointA.node
        }),
        endpointB: Object.freeze({
          endpoint: "B" as const,
          position: endpointB.node.getAbsolutePosition().clone(),
          node: endpointB.node
        })
      })
    );
  }
  return createStageLinkRegistry(pairs);
};

const assertSemanticsInsideBoundary = (
  boundary: StageBoundary,
  markers: readonly StageMarker[],
  volumes: readonly StageVolume[],
  links: readonly StageLinkPair[]
) => {
  for (const marker of markers) {
    marker.node.computeWorldMatrix(true);
    if (!boundary.contains(marker.node.getAbsolutePosition())) {
      throw new Error(`MRK_*がBND_Stageの外側です: ${marker.node.name}`);
    }
  }

  for (const volume of volumes) {
    const positions = volume.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const world = volume.mesh.computeWorldMatrix(true);
    for (let index = 0; index < positions.length; index += 3) {
      const point = Vector3.TransformCoordinates(
        Vector3.FromArray(positions, index),
        world
      );
      if (!boundary.contains(point)) {
        throw new Error(`VOL_*がBND_Stageの外側です: ${volume.mesh.name}`);
      }
    }
  }

  for (const link of links) {
    for (const endpoint of [link.endpointA, link.endpointB]) {
      if (!boundary.contains(endpoint.position)) {
        throw new Error(`LNK_*がBND_Stageの外側です: ${endpoint.node.name}`);
      }
    }
  }
};

const assertCatalogEntry = (stage: StageCatalogEntry) => {
  if (!KEBAB_CASE_ID_PATTERN.test(stage.id)) {
    throw new Error(`V2ステージIDが不正です: ${stage.id}`);
  }
  if (stage.label.length === 0) {
    throw new Error(`V2ステージ表示名が空です: ${stage.id}`);
  }
  if (!stage.glbUrl.endsWith(".glb")) {
    throw new Error(`GLB URLが不正です: ${stage.glbUrl}`);
  }
  if (!stage.navmeshUrl.endsWith(".navmesh.bin")) {
    throw new Error(`NavMesh URLが不正です: ${stage.navmeshUrl}`);
  }
  if (!Number.isInteger(stage.assetSchemaVersion) || stage.assetSchemaVersion <= 0) {
    throw new Error(`資産schema versionが不正です: ${stage.assetSchemaVersion}`);
  }
  if (stage.navProfileId.length === 0) {
    throw new Error(`NavMeshプロファイルIDが空です: ${stage.id}`);
  }
  if (!SHA256_PATTERN.test(stage.glbSha256)) {
    throw new Error(`GLB SHA-256が不正です: ${stage.id}`);
  }
  if (!SHA256_PATTERN.test(stage.navmeshSha256)) {
    throw new Error(`NavMesh SHA-256が不正です: ${stage.id}`);
  }
};

const resolveAssetUrl = (relativeUrl: string) =>
  `${import.meta.env.BASE_URL}${relativeUrl}`;

const fetchBinary = async (relativeUrl: string): Promise<Uint8Array> => {
  const response = await fetch(resolveAssetUrl(relativeUrl), {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(
      `ステージ資産の取得に失敗しました: ${relativeUrl} (${response.status})`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
};

const calculateSha256 = async (data: Uint8Array): Promise<string> => {
  const bytes = Uint8Array.from(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
};

const assertHash = async (
  label: string,
  data: Uint8Array,
  expectedHash: string
) => {
  const actualHash = await calculateSha256(data);
  if (actualHash !== expectedHash) {
    throw new Error(
      `${label}のSHA-256がカタログと一致しません: expected=${expectedHash}, actual=${actualHash}`
    );
  }
};

const loadGlbContainer = async (
  scene: Scene,
  stage: StageCatalogEntry,
  glbData: Uint8Array
): Promise<AssetContainer> => {
  const fileName = stage.glbUrl.slice(stage.glbUrl.lastIndexOf("/") + 1);
  const bytes = Uint8Array.from(glbData);
  const file = new File([bytes.buffer], fileName, {
    type: "model/gltf-binary"
  });
  return SceneLoader.LoadAssetContainerAsync("", file, scene, null, ".glb");
};

export const loadStageSpatialContext = async (
  scene: Scene,
  stage: StageCatalogEntry
): Promise<StageSpatialContext> => {
  assertCatalogEntry(stage);
  const [glbData, navmeshData] = await Promise.all([
    fetchBinary(stage.glbUrl),
    fetchBinary(stage.navmeshUrl)
  ]);
  await Promise.all([
    assertHash("GLB", glbData, stage.glbSha256),
    assertHash("NavMesh", navmeshData, stage.navmeshSha256)
  ]);

  let container: AssetContainer | null = null;
  let navigation: NavigationWorld | null = null;
  try {
    container = await loadGlbContainer(scene, stage, glbData);
    const managementRoot = container.createRootMesh();
    managementRoot.name = `StageAssetRoot_${stage.id}`;
    managementRoot.scaling.setAll(BLENDER_METERS_TO_WORLD_UNITS);
    managementRoot.isVisible = false;
    managementRoot.isPickable = false;
    managementRoot.checkCollisions = false;
    managementRoot.computeWorldMatrix(true);

    const classification = classifyStageAsset(container, managementRoot, stage);
    const links = createLinkRegistry(classification.links);
    navigation = await createNavigationWorld(navmeshData, links.all);
    container.addAllToScene();

    const humanMovementColliders = Object.freeze([
      ...classification.normalColliders,
      ...classification.actorOnlyColliders,
      ...classification.humanOnlyColliders
    ]);
    const bitMovementColliders = Object.freeze([
      ...classification.normalColliders,
      ...classification.actorOnlyColliders
    ]);
    const movementColliders: StageMovementColliderSets = Object.freeze({
      player: humanMovementColliders,
      npc: humanMovementColliders,
      bit: bitMovementColliders
    });
    const beamBlockers = Object.freeze([...classification.normalColliders]);
    const sightBlockers = Object.freeze([...classification.normalColliders]);
    const navSourceMeshes = Object.freeze(
      classification.navSources.map((source) => source.mesh)
    );
    const semanticMeshes = Object.freeze([
      ...classification.volumes.map((volume) => volume.mesh),
      classification.boundaryMesh,
      ...classification.portals.map((portal) => portal.mesh)
    ]);
    const semanticNodes = Object.freeze([
      classification.metadata.node,
      ...classification.markers.map((marker) => marker.node),
      ...classification.links.map((link) => link.node)
    ]);
    const resources: StageSpatialResources = Object.freeze({
      visualMeshes: Object.freeze([...classification.visualMeshes]),
      normalColliders: Object.freeze([...classification.normalColliders]),
      actorOnlyColliders: Object.freeze([...classification.actorOnlyColliders]),
      humanOnlyColliders: Object.freeze([...classification.humanOnlyColliders]),
      movementColliders,
      beamBlockers,
      sightBlockers,
      navSourceMeshes,
      semanticMeshes,
      semanticNodes,
      metadataNode: classification.metadata.node,
      assetContainer: container,
      managementRoot
    });
    const markers = createMarkerRegistry(classification.markers);
    const volumes = createVolumeRegistry(classification.volumes);
    const queries = createStageSpatialQueries(
      scene,
      {
        movementColliders,
        groundColliders: resources.normalColliders,
        beamBlockers,
        sightBlockers,
        volumes: volumes.all
      }
    );
    const boundary: StageBoundary = Object.freeze({
      id: "stage" as const,
      mesh: classification.boundaryMesh,
      contains: createStageBoundaryContainsQuery(classification.boundaryMesh)
    });
    assertSemanticsInsideBoundary(boundary, markers.all, volumes.all, links.all);

    let disposed = false;
    const ownedContainer = container;
    const ownedNavigation = navigation;
    return Object.freeze({
      stage,
      metadata: classification.metadata,
      resources,
      navigation: ownedNavigation,
      markers,
      volumes,
      links,
      boundary,
      queries,
      dispose: () => {
        if (disposed) {
          throw new Error(`StageSpatialContextは破棄済みです: ${stage.id}`);
        }
        disposed = true;
        ownedNavigation.dispose();
        ownedContainer.removeAllFromScene();
        ownedContainer.dispose();
      }
    });
  } catch (error) {
    navigation?.dispose();
    container?.removeAllFromScene();
    container?.dispose();
    throw error;
  }
};
