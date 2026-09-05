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
import { decodeBitFlightNavBundle } from "./bitFlightNavBundle";
import { BIT_FLIGHT_ENVELOPE_RADIUS_METERS } from "./bitFlightSafety";
import {
  BIT_FLIGHT_AFFORDANCES,
  BIT_FLIGHT_SPACE_KINDS,
  BIT_FLIGHT_TRANSITION_KINDS,
  createBitFlightBandRef,
  createBitFlightNavigationWorld,
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightAffordance,
  type BitFlightBand,
  type BitFlightBandRef,
  type BitFlightNavigationDefinition,
  type BitFlightNavigationWorld,
  type BitFlightSpaceKind,
  type BitFlightTransitionDefinition,
  type BitFlightTransitionKind,
  type BitFlightZone
} from "./bitFlightNavigation";
import {
  createNavigationWorld,
  createNavigationWorldFromNavMesh,
  type NavigationWorld
} from "./navigationWorld";
import {
  calculateNavigationSurfaceVolumeIntersectionArea,
  hasPositiveNavigationSurfaceVolumeIntersection,
  isVolumeFullyContainedByConvexVolume
} from "./navigationSurfaceVolumeSampler";
import {
  assembleHumanNavTileBundle,
  decodeHumanNavTileBundle,
  type HumanNavRoomVariantSelection,
  type HumanNavTileBundle
} from "./humanNavTileBundle";
import {
  createDynamicStageSpatialVariants,
  type DynamicStageSpatialActiveSet,
  type DynamicStageSpatialVariants
} from "./dynamicStageSpatialVariants";
import {
  assertAllowedDynamicStageHsProperties,
  createStageDynamicAssetRegistries,
  DYNAMIC_STAGE_MARKER_ROLES,
  DYNAMIC_STAGE_VOLUME_ROLES,
  type DynamicStageMarkerRole,
  type DynamicStageVolumeRole,
  type StageDoorAssetRegistry,
  type StageElevatorAssetRegistry
} from "./stageDynamicAssets";
import {
  createStageCatalogFingerprint,
  type StageCatalogEntry
} from "./stageCatalog";
import {
  createStageNavigationAreaRegistry,
  type AuthoredStageNavigationAreaPortal,
  type StageNavigationAreaRegistry
} from "./stageNavigationAreas";
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
  createStageVolumeContainsSegmentQuery,
  NPC_SPAWN_BIAS_WEIGHT_MAXIMUM,
  NPC_SPAWN_BIAS_WEIGHT_MINIMUM,
  STAGE_VOLUME_ROLES,
  type StageMovementColliderSets,
  type StageSpatialQueryDiagnostics,
  type StageSpatialQueries,
  type StageVolume,
  type StageVolumeRole
} from "./stageSpatialQueries";
import {
  createStageWorldBoundary,
  type OwnedStageWorldBoundary,
  type StageWorldBoundary
} from "./stageWorldBoundary";
import {
  createStageRoomVariantAssetRegistry,
  isStageRoomVariantMarkerNode,
  isStageRoomVariantTileMesh,
  type StageRoomVariantActivation,
  type StageRoomVariantAssetRegistry,
  type StageRoomVariantSelectionByRoom
} from "./stageRoomVariantAssets";
import {
  createAuthoredStageLocationAssetRegistry,
  STAGE_LOCATION_FLOOR_IDS,
  STAGE_STAIR_LANDING_DIRECTIONS,
  type AuthoredStageBroadcastConsoleMarker,
  type AuthoredStageBroadcastConsoleTarget,
  type AuthoredStageElevatorLanding,
  type AuthoredStageFloorMap,
  type AuthoredStageLocationAreaPiece,
  type AuthoredStageMinimapBarrier,
  type AuthoredStageMinimapPassage,
  type AuthoredStageMissionAnchor,
  type AuthoredStageMissionLocationVolume,
  type AuthoredStageStairLanding,
  type AuthoredStageLocationAssetRegistry,
  type StageLocationAssetRegistry,
  type StageLocationAssetRegistrySource,
  type StageLocationFloorId,
  type StageStairLandingDirection
} from "./stageLocationAssets";

let stageGlbParseCount = 0;
let staticDecodedHumanBundleOwnerCount = 0;
let staticBitNavigationOwnerCount = 0;
let sessionHumanNavigationWorldOwnerCount = 0;

export const getStageSpatialOwnershipDiagnostics = () => Object.freeze({
  glbParseCount: stageGlbParseCount,
  staticDecodedHumanBundleOwnerCount,
  staticBitNavigationOwnerCount,
  sessionHumanNavigationWorldOwnerCount
});
import { BLENDER_METERS_TO_WORLD_UNITS } from "./worldUnits";

export type { StageWorldBoundary } from "./stageWorldBoundary";
export type {
  StageBroadcastConsole,
  StageElevatorLanding,
  StageFloorMap,
  StageMinimapBarrier,
  StageMinimapPassage,
  StageLocationArea,
  StageLocationAreaHit,
  StageLocationAreaPiece,
  StageLocationAssetRegistry,
  StageLocationFloorId,
  StageMissionLocation,
  StageStairLanding
} from "./stageLocationAssets";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LINK_OBJECT_NAME_PATTERN = /^LNK_(.+)_(A|B)$/;

export const STAGE_MARKER_ROLES = [
  "player_spawn",
  "assembly_anchor",
  "patrol_anchor",
  "mission_anchor",
  "map_stair_landing",
  "map_elevator_landing",
  "broadcast_console",
  ...DYNAMIC_STAGE_MARKER_ROLES
] as const;

export type StageMarkerRole = (typeof STAGE_MARKER_ROLES)[number];

export type StageMarker = Readonly<{
  id: string;
  role: StageMarkerRole;
  node: TransformNode;
}>;

export type StagePlayerSpawn = Readonly<{
  id: string;
  marker: StageMarker;
  exclusionVolume: StageVolume;
  npcSpawnBiasVolumes: readonly StageVolume[];
}>;

export interface StagePlayerSpawnRegistry {
  readonly all: readonly StagePlayerSpawn[];
  getById(id: string): StagePlayerSpawn | null;
}

export interface StageMarkerRegistry {
  readonly all: readonly StageMarker[];
  getById(id: string): StageMarker | null;
  getByRole(role: StageMarkerRole): readonly StageMarker[];
  requireSingle(role: StageMarkerRole): StageMarker;
}

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

export type StageBoundary = Readonly<{
  id: "stage";
  mesh: Mesh;
  contains(point: Vector3): boolean;
}>;

export type StageMetadata = Readonly<{
  schemaVersion: number;
  stageId: string;
  navProfileId: string;
  bitNavProfileId: string;
  node: TransformNode;
}>;

export type StageSpatialResources = Readonly<{
  visualMeshes: readonly Mesh[];
  normalColliders: readonly Mesh[];
  actorOnlyColliders: readonly Mesh[];
  humanOnlyColliders: readonly Mesh[];
  beamSightOnlyColliders: readonly Mesh[];
  movementColliders: StageMovementColliderSets;
  beamBlockers: readonly Mesh[];
  sightBlockers: readonly Mesh[];
  humanNavigationSources: readonly StageHumanNavigationSource[];
  bitFlightNavSourceMeshes: readonly Mesh[];
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

export type StageDynamicSpatialInitializationDescriptor = Readonly<{
  seed: number;
  initialize(
    input: StageDynamicSpatialInitializationInput
  ): StageDynamicSpatialInitialization;
}>;

export type StageStaticSpatialView = Readonly<{
  scene: Scene;
  fingerprint: string;
  stage: StageCatalogEntry;
  metadata: StageMetadata;
  resources: StageSpatialResources;
  doorAssets: StageDoorAssetRegistry;
  elevatorAssets: StageElevatorAssetRegistry;
  roomVariants: StageRoomVariantAssetRegistry | null;
  locationAssets: AuthoredStageLocationAssetRegistry | null;
  humanNavigationBundle: HumanNavTileBundle | null;
  humanNavigationData: Uint8Array | null;
  bitNavigation: BitFlightNavigationWorld;
  markers: StageMarkerRegistry;
  volumes: StageVolumeRegistry;
  assemblyVenues: StageAssemblyVenueRegistry;
  links: StageLinkRegistry;
  boundary: StageBoundary;
  worldBoundary: StageWorldBoundary | null;
}>;

export type OwnedStageStaticSpatialResources = Readonly<{
  view: StageStaticSpatialView;
  fingerprint: string;
  cancelSessionConstructionSynchronously(): void;
  dispose(): void;
}>;

export type StageSpatialSession = Readonly<{
  staticView: StageStaticSpatialView;
  stage: StageCatalogEntry;
  metadata: StageMetadata;
  resources: StageSpatialResources;
  staticSpatialActiveSet: DynamicStageSpatialActiveSet;
  dynamicVariants: DynamicStageSpatialVariants;
  doorAssets: StageDoorAssetRegistry;
  elevatorAssets: StageElevatorAssetRegistry;
  roomVariants: StageRoomVariantAssetRegistry | null;
  locationAssets: StageLocationAssetRegistry | null;
  roomVariantSelection: readonly HumanNavRoomVariantSelection[];
  navigation: NavigationWorld;
  bitNavigation: BitFlightNavigationWorld;
  markers: StageMarkerRegistry;
  volumes: StageVolumeRegistry;
  playerSpawns: StagePlayerSpawnRegistry;
  navigationAreas: StageNavigationAreaRegistry;
  assemblyVenues: StageAssemblyVenueRegistry;
  links: StageLinkRegistry;
  boundary: StageBoundary;
  worldBoundary: StageWorldBoundary | null;
  queries: StageSpatialQueries;
  dynamicSpatialInitialization: StageDynamicSpatialInitializationDescriptor | null;
  dispose(): void;
}>;

const NAV_ROLES = ["walkable", "blocker", "exclude"] as const;
type NavRole = (typeof NAV_ROLES)[number];

const NAV_AREAS = ["ground", "stairs", "outdoor", "door"] as const;
type NavArea = (typeof NAV_AREAS)[number];

export type StageHumanNavigationSource = Readonly<{
  mesh: Mesh;
  navSet: "human";
  role: NavRole;
  area: NavArea | null;
}>;

const NAV_SETS = ["human", "bit-flight"] as const;
type NavSet = (typeof NAV_SETS)[number];

const PORTAL_ROLES = [
  "room_portal",
  "streaming_portal",
  "door_trigger",
  "navigation_area_portal"
] as const;
type PortalRole = (typeof PORTAL_ROLES)[number];

type StagePortal = Readonly<{
  id: string;
  role: PortalRole;
  fromAreaId: string | null;
  toAreaId: string | null;
  bidirectional: boolean | null;
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

type NavSource = StageHumanNavigationSource;

type BitFlightNavSource = Readonly<{
  mesh: Mesh;
  navSet: "bit-flight";
  role: "walkable" | "blocker";
  zoneId: ReturnType<typeof toBitFlightZoneId>;
  bandId: ReturnType<typeof toBitFlightBandId>;
  spaceKind: BitFlightSpaceKind;
  minimumCenterHeight: number;
  maximumCenterHeight: number;
}>;

type AuthoredBitFlightTransitionVolume = Readonly<{
  mesh: Mesh;
  definition: Omit<
    BitFlightTransitionDefinition,
    "fromPosition" | "toPosition" | "traversalPoints" | "region"
  >;
  traversalPoints: readonly Vector3[];
}>;

type AuthoredBitFlightLinkEndpoint = Readonly<{
  id: string;
  endpoint: "A" | "B";
  kind: "aperture";
  band: BitFlightBandRef;
  bidirectional: boolean;
  radiusMeters: number;
  projectionDistance: number;
  affordances: readonly BitFlightAffordance[];
  objectLinkName: string;
  node: TransformNode;
}>;

type AuthoredAssemblyAnchor = Readonly<{
  marker: StageMarker;
  selectionWeight: number;
  assemblyPositions: readonly Vector3[];
  executionAudiencePositions: readonly Vector3[];
  executionTargetPositions: readonly Vector3[];
}>;

type AuthoredAssemblyVolume = Readonly<{
  volume: StageVolume;
  anchorId: string;
}>;

type StageAssetClassification = Readonly<{
  metadata: StageMetadata;
  visualMeshes: readonly Mesh[];
  normalColliders: readonly Mesh[];
  actorOnlyColliders: readonly Mesh[];
  humanOnlyColliders: readonly Mesh[];
  beamSightOnlyColliders: readonly Mesh[];
  navSources: readonly NavSource[];
  bitFlightNavSources: readonly BitFlightNavSource[];
  markers: readonly StageMarker[];
  volumes: readonly StageVolume[];
  assemblyAnchors: readonly AuthoredAssemblyAnchor[];
  assemblyVolumes: readonly AuthoredAssemblyVolume[];
  bitFlightTransitionVolumes: readonly AuthoredBitFlightTransitionVolume[];
  boundaryMesh: Mesh;
  worldBoundaryMesh: Mesh | null;
  portals: readonly StagePortal[];
  links: readonly AuthoredStageLinkEndpoint[];
  bitFlightLinks: readonly AuthoredBitFlightLinkEndpoint[];
  roomVariants: StageRoomVariantAssetRegistry | null;
  locationAssetSource: StageLocationAssetRegistrySource;
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

const requireReferenceId = (
  objectName: string,
  extras: Extras,
  property: string
): string => {
  const value = requireString(objectName, extras, property);
  if (!KEBAB_CASE_ID_PATTERN.test(value)) {
    throw new Error(
      `参照IDは小文字kebab-caseで指定します: ${objectName}.${property}`
    );
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

const requireStringArrayJson = (
  objectName: string,
  extras: Extras,
  property: string
): readonly string[] => {
  const encoded = requireString(objectName, extras, property);
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch {
    throw new Error(`JSON配列として解析できません: ${objectName}.${property}`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some(
      (value) =>
        typeof value !== "string" ||
        value.length === 0 ||
        value.trim() !== value
    )
  ) {
    throw new Error(`非空文字列のJSON配列が必要です: ${objectName}.${property}`);
  }
  if (new Set(parsed).size !== parsed.length) {
    throw new Error(`JSON配列に重複値があります: ${objectName}.${property}`);
  }
  return Object.freeze(parsed);
};

const requireBitFlightAffordances = (
  objectName: string,
  extras: Extras
): readonly BitFlightAffordance[] =>
  Object.freeze(
    requireStringArrayJson(objectName, extras, "hs_affordances_json").map(
      (value) => {
        if (!BIT_FLIGHT_AFFORDANCES.includes(value as BitFlightAffordance)) {
          throw new Error(
            `未登録の飛行遷移意味タグです: ${objectName}.${value}`
          );
        }
        return value as BitFlightAffordance;
      }
    )
  );

const parseBitFlightBandRef = (
  objectName: string,
  extras: Extras,
  prefix: "hs_from" | "hs_to" | "hs"
): BitFlightBandRef => {
  const zoneProperty =
    prefix === "hs" ? "hs_zone_id" : `${prefix}_zone_id`;
  const bandProperty =
    prefix === "hs" ? "hs_band_id" : `${prefix}_band_id`;
  return createBitFlightBandRef(
    toBitFlightZoneId(requireString(objectName, extras, zoneProperty)),
    toBitFlightBandId(requireString(objectName, extras, bandProperty))
  );
};

const parseBitFlightRoutePoints = (
  objectName: string,
  extras: Extras
): readonly Vector3[] => {
  if (!Object.prototype.hasOwnProperty.call(extras, "hs_route_points_json")) {
    return Object.freeze([]);
  }
  return parseWorldPositionArrayJson(
    objectName,
    extras,
    "hs_route_points_json"
  );
};

const parseWorldPositionArrayJson = (
  objectName: string,
  extras: Extras,
  property: string
): readonly Vector3[] => {
  const encoded = requireString(objectName, extras, property);
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch {
    throw new Error(`座標JSONを解析できません: ${objectName}.${property}`);
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some(
      (point) =>
        !Array.isArray(point) ||
        point.length !== 3 ||
        point.some((value) => typeof value !== "number" || !Number.isFinite(value))
    )
  ) {
    throw new Error(
      `座標には有限値3要素の非空JSON配列が必要です: ${objectName}.${property}`
    );
  }
  return Object.freeze(
    parsed.map((point) => {
      const [x, y, z] = point as [number, number, number];
      return new Vector3(
        -x * BLENDER_METERS_TO_WORLD_UNITS,
        z * BLENDER_METERS_TO_WORLD_UNITS,
        -y * BLENDER_METERS_TO_WORLD_UNITS
      );
    })
  );
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

const classifyNavSource = (mesh: Mesh): NavSource | BitFlightNavSource => {
  const extras = requireExtras(mesh);
  const navSet = requireEnum(mesh.name, extras, "hs_nav_set", NAV_SETS);
  if (navSet === "bit-flight") {
    if (!mesh.name.startsWith("NAV_BitFlight_")) {
      throw new Error(
        `bit-flight生成元はNAV_BitFlight_*名が必要です: ${mesh.name}`
      );
    }
    assertAllowedHsProperties(mesh.name, extras, [
      "hs_nav_set",
      "hs_nav_role",
      "hs_zone_id",
      "hs_band_id",
      "hs_space_kind",
      "hs_center_height_min_m",
      "hs_center_height_max_m"
    ]);
    const minimumCenterHeight =
      requireFiniteNumber(mesh.name, extras, "hs_center_height_min_m") *
      BLENDER_METERS_TO_WORLD_UNITS;
    const maximumCenterHeight =
      requireFiniteNumber(mesh.name, extras, "hs_center_height_max_m") *
      BLENDER_METERS_TO_WORLD_UNITS;
    if (minimumCenterHeight > maximumCenterHeight) {
      throw new Error(`飛行帯の中心高度範囲が逆転しています: ${mesh.name}`);
    }
    return {
      mesh,
      navSet,
      role: requireEnum(
        mesh.name,
        extras,
        "hs_nav_role",
        ["walkable", "blocker"] as const
      ),
      ...parseBitFlightBandRef(mesh.name, extras, "hs"),
      spaceKind: requireEnum(
        mesh.name,
        extras,
        "hs_space_kind",
        BIT_FLIGHT_SPACE_KINDS
      ),
      minimumCenterHeight,
      maximumCenterHeight
    };
  }
  if (mesh.name.startsWith("NAV_BitFlight_")) {
    throw new Error(
      `NAV_BitFlight_*はhs_nav_set=bit-flightが必要です: ${mesh.name}`
    );
  }
  assertAllowedHsProperties(mesh.name, extras, [
    "hs_nav_set",
    "hs_nav_role",
    "hs_nav_area"
  ]);
  const role = requireEnum(mesh.name, extras, "hs_nav_role", NAV_ROLES);
  if (role === "walkable") {
    return {
      mesh,
      navSet,
      role,
      area: requireEnum(mesh.name, extras, "hs_nav_area", NAV_AREAS)
    };
  }
  if (Object.prototype.hasOwnProperty.call(extras, "hs_nav_area")) {
    throw new Error(`blocker/excludeへhs_nav_areaは指定できません: ${mesh.name}`);
  }
  return { mesh, navSet, role, area: null };
};

const classifyVolume = (
  mesh: Mesh
): Readonly<{
  volume: StageVolume;
  assemblyVolume: AuthoredAssemblyVolume | null;
}> => {
  const extras = requireExtras(mesh);
  const role = requireEnum(mesh.name, extras, "hs_role", STAGE_VOLUME_ROLES);
  const isBitSpawn = role === "bit_spawn";
  const isNpcSpawnBias = role === "npc_spawn_bias";
  const isPlayerSpawnExclusion = role === "player_spawn_exclusion";
  const isAssembly = role === "assembly";
  const isNavigationArea = role === "navigation_area";
  const isLocationArea = role === "location_area";
  const isMissionLocation = role === "mission_location";
  const isBroadcastConsoleTarget = role === "broadcast_console_target";
  if (
    DYNAMIC_STAGE_VOLUME_ROLES.includes(
      role as DynamicStageVolumeRole
    )
  ) {
    assertAllowedDynamicStageHsProperties(
      mesh.name,
      extras,
      role as DynamicStageVolumeRole
    );
  } else {
    assertAllowedHsProperties(
      mesh.name,
      extras,
      isBitSpawn
        ? ["hs_id", "hs_role", "hs_zone_id", "hs_band_id"]
        : isNpcSpawnBias
          ? ["hs_id", "hs_role", "hs_player_spawn_id", "hs_weight"]
        : isPlayerSpawnExclusion
          ? ["hs_id", "hs_role", "hs_player_spawn_id"]
        : isAssembly
          ? ["hs_id", "hs_role", "hs_anchor_id"]
          : isNavigationArea
            ? ["hs_id", "hs_role", "hs_area_id"]
            : isLocationArea
              ? [
                  "hs_id",
                  "hs_role",
                  "hs_area_id",
                  "hs_display_name",
                  "hs_priority",
                  "hs_floor_id",
                  "hs_elevator_id"
                ]
              : isMissionLocation
                ? [
                    "hs_id",
                    "hs_role",
                    "hs_location_id",
                    "hs_area_id",
                    "hs_floor_id",
                    "hs_display_name",
                    "hs_anchor_id"
                  ]
                : isBroadcastConsoleTarget
                  ? ["hs_id", "hs_role", "hs_console_id"]
            : ["hs_id", "hs_role"]
    );
  }
  const volume: StageVolume = Object.freeze({
    id: requireId(mesh.name, extras),
    role,
    bitFlightBand: isBitSpawn
      ? parseBitFlightBandRef(mesh.name, extras, "hs")
      : null,
    playerSpawnId: isPlayerSpawnExclusion || isNpcSpawnBias
      ? requireReferenceId(mesh.name, extras, "hs_player_spawn_id")
      : null,
    npcSpawnBiasWeight: isNpcSpawnBias
      ? requireFiniteNumber(mesh.name, extras, "hs_weight")
      : null,
    navigationAreaId: isNavigationArea
      ? requireReferenceId(mesh.name, extras, "hs_area_id")
      : null,
    mesh
  });
  if (
    isNpcSpawnBias &&
    (volume.npcSpawnBiasWeight === null ||
      volume.npcSpawnBiasWeight < NPC_SPAWN_BIAS_WEIGHT_MINIMUM ||
      volume.npcSpawnBiasWeight > NPC_SPAWN_BIAS_WEIGHT_MAXIMUM)
  ) {
    throw new Error(
      `npc_spawn_biasのhs_weightは${NPC_SPAWN_BIAS_WEIGHT_MINIMUM}以上` +
        `${NPC_SPAWN_BIAS_WEIGHT_MAXIMUM}以下が必要です: ${mesh.name}`
    );
  }
  return {
    volume,
    assemblyVolume: isAssembly
      ? Object.freeze({
          volume,
          anchorId: requireReferenceId(
            mesh.name,
            extras,
            "hs_anchor_id"
          )
        })
      : null
  };
};

const requireLocationFloorId = (
  objectName: string,
  extras: Extras,
  property = "hs_floor_id"
): StageLocationFloorId =>
  requireEnum(objectName, extras, property, STAGE_LOCATION_FLOOR_IDS);

const classifyFloorMap = (mesh: Mesh): AuthoredStageFloorMap => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, [
    "hs_id",
    "hs_role",
    "hs_floor_id",
    "hs_display_name",
    "hs_order"
  ]);
  const role = requireString(mesh.name, extras, "hs_role");
  if (role !== "floor_map") {
    throw new Error(`未登録のMAP_* roleです: ${mesh.name}.${role}`);
  }
  const order = requireInteger(mesh.name, extras, "hs_order");
  if (order < 0) {
    throw new Error(`floor_mapのhs_orderは0以上が必要です: ${mesh.name}`);
  }
  return Object.freeze({
    id: requireId(mesh.name, extras),
    floorId: requireLocationFloorId(mesh.name, extras),
    displayName: requireString(mesh.name, extras, "hs_display_name"),
    order,
    mesh
  });
};

const classifyMinimapBarrier = (mesh: Mesh): AuthoredStageMinimapBarrier => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, [
    "hs_id",
    "hs_role",
    "hs_floor_id"
  ]);
  const role = requireString(mesh.name, extras, "hs_role");
  if (role !== "map_barrier") {
    throw new Error(`未登録のMAP_* roleです: ${mesh.name}.${role}`);
  }
  return Object.freeze({
    id: requireId(mesh.name, extras),
    floorId: requireLocationFloorId(mesh.name, extras),
    mesh
  });
};

const classifyMinimapPassage = (mesh: Mesh): AuthoredStageMinimapPassage => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, [
    "hs_id",
    "hs_role",
    "hs_floor_id"
  ]);
  const role = requireString(mesh.name, extras, "hs_role");
  if (role !== "map_passage") {
    throw new Error(`未登録のMAP_* roleです: ${mesh.name}.${role}`);
  }
  return Object.freeze({
    id: requireId(mesh.name, extras),
    floorId: requireLocationFloorId(mesh.name, extras),
    mesh
  });
};

const classifyLocationAreaPiece = (
  volume: StageVolume
): AuthoredStageLocationAreaPiece => {
  const extras = requireExtras(volume.mesh);
  const hasFloor = Object.prototype.hasOwnProperty.call(extras, "hs_floor_id");
  const hasElevator = Object.prototype.hasOwnProperty.call(
    extras,
    "hs_elevator_id"
  );
  if (hasFloor === hasElevator) {
    throw new Error(
      `location_area pieceはfloorまたはelevatorの一方だけを参照します: ${volume.mesh.name}`
    );
  }
  return Object.freeze({
    id: volume.id,
    areaId: requireReferenceId(volume.mesh.name, extras, "hs_area_id"),
    displayName: requireString(
      volume.mesh.name,
      extras,
      "hs_display_name"
    ),
    priority: requireInteger(volume.mesh.name, extras, "hs_priority"),
    floorBinding: hasFloor
      ? Object.freeze({
          kind: "fixed" as const,
          floorId: requireLocationFloorId(volume.mesh.name, extras)
        })
      : Object.freeze({
          kind: "elevator" as const,
          elevatorId: requireReferenceId(
            volume.mesh.name,
            extras,
            "hs_elevator_id"
          )
        }),
    mesh: volume.mesh
  });
};

const classifyMissionLocationVolume = (
  volume: StageVolume
): AuthoredStageMissionLocationVolume => {
  const extras = requireExtras(volume.mesh);
  return Object.freeze({
    id: volume.id,
    locationId: requireReferenceId(
      volume.mesh.name,
      extras,
      "hs_location_id"
    ),
    areaId: requireReferenceId(volume.mesh.name, extras, "hs_area_id"),
    floorId: requireLocationFloorId(volume.mesh.name, extras),
    displayName: requireString(
      volume.mesh.name,
      extras,
      "hs_display_name"
    ),
    anchorId: requireReferenceId(volume.mesh.name, extras, "hs_anchor_id"),
    mesh: volume.mesh
  });
};

const classifyBroadcastConsoleTarget = (
  volume: StageVolume
): AuthoredStageBroadcastConsoleTarget => {
  const extras = requireExtras(volume.mesh);
  return Object.freeze({
    id: volume.id,
    consoleId: requireReferenceId(
      volume.mesh.name,
      extras,
      "hs_console_id"
    ),
    mesh: volume.mesh
  });
};

const classifyBitFlightTransitionVolume = (
  mesh: Mesh
): AuthoredBitFlightTransitionVolume => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, [
    "hs_id",
    "hs_role",
    "hs_transition_kind",
    "hs_from_zone_id",
    "hs_from_band_id",
    "hs_to_zone_id",
    "hs_to_band_id",
    "hs_bidirectional",
    "hs_affordances_json",
    "hs_projection_distance_m",
    "hs_route_points_json"
  ]);
  const role = requireString(mesh.name, extras, "hs_role");
  if (role !== "bit_flight_transition") {
    throw new Error(`未登録のVOL_* roleです: ${mesh.name}.${role}`);
  }
  const projectionDistance =
    requireFiniteNumber(mesh.name, extras, "hs_projection_distance_m") *
    BLENDER_METERS_TO_WORLD_UNITS;
  if (projectionDistance <= 0) {
    throw new Error(`飛行遷移の投影距離には正数が必要です: ${mesh.name}`);
  }
  return {
    mesh,
    definition: {
      id: requireId(mesh.name, extras),
      kind: requireEnum(
        mesh.name,
        extras,
        "hs_transition_kind",
        BIT_FLIGHT_TRANSITION_KINDS
      ),
      from: parseBitFlightBandRef(mesh.name, extras, "hs_from"),
      to: parseBitFlightBandRef(mesh.name, extras, "hs_to"),
      bidirectional: requireBoolean(
        mesh.name,
        extras,
        "hs_bidirectional"
      ),
      affordances: requireBitFlightAffordances(mesh.name, extras),
      projectionDistance
    },
    traversalPoints: parseBitFlightRoutePoints(mesh.name, extras)
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

const classifyWorldBoundary = (
  mesh: Mesh
): { id: "world-limit"; mesh: Mesh } => {
  const extras = requireExtras(mesh);
  assertAllowedHsProperties(mesh.name, extras, ["hs_id", "hs_role"]);
  const id = requireId(mesh.name, extras);
  const role = requireString(mesh.name, extras, "hs_role");
  if (id !== "world-limit" || role !== "world_boundary") {
    throw new Error(
      "BND_WorldLimitにはhs_id=world-limit、hs_role=world_boundaryが必要です"
    );
  }
  return { id, mesh };
};

const classifyPortal = (mesh: Mesh): StagePortal => {
  const extras = requireExtras(mesh);
  const role = requireEnum(mesh.name, extras, "hs_role", PORTAL_ROLES);
  const isNavigationAreaPortal = role === "navigation_area_portal";
  assertAllowedHsProperties(
    mesh.name,
    extras,
    isNavigationAreaPortal
      ? ["hs_id", "hs_role", "hs_from", "hs_to", "hs_bidirectional"]
      : ["hs_id", "hs_role", "hs_from", "hs_to"]
  );
  const hasFrom = Object.prototype.hasOwnProperty.call(extras, "hs_from");
  const hasTo = Object.prototype.hasOwnProperty.call(extras, "hs_to");
  if (hasFrom !== hasTo) {
    throw new Error(`PRT_*のhs_fromとhs_toは対で指定します: ${mesh.name}`);
  }
  if (hasFrom) {
    requireString(mesh.name, extras, "hs_from");
    requireString(mesh.name, extras, "hs_to");
  }
  return {
    id: requireId(mesh.name, extras),
    role,
    fromAreaId: isNavigationAreaPortal
      ? requireReferenceId(mesh.name, extras, "hs_from")
      : null,
    toAreaId: isNavigationAreaPortal
      ? requireReferenceId(mesh.name, extras, "hs_to")
      : null,
    bidirectional: isNavigationAreaPortal
      ? requireBoolean(mesh.name, extras, "hs_bidirectional")
      : null,
    mesh
  };
};

const classifyMetadata = (
  node: TransformNode,
  stage: StageCatalogEntry
): StageMetadata => {
  const extras = requireExtras(node);
  assertAllowedHsProperties(node.name, extras, [
    "hs_schema_version",
    "hs_stage_id",
    "hs_nav_profile",
    "hs_bit_nav_profile"
  ]);
  const schemaVersion = requireInteger(node.name, extras, "hs_schema_version");
  const stageId = requireString(node.name, extras, "hs_stage_id");
  const navProfileId = requireString(node.name, extras, "hs_nav_profile");
  const bitNavProfileId = requireString(
    node.name,
    extras,
    "hs_bit_nav_profile"
  );
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
  if (bitNavProfileId !== stage.bitNavProfileId) {
    throw new Error(
      `GLBのビット用NavMeshプロファイルがカタログと一致しません: ${bitNavProfileId}`
    );
  }
  return { schemaVersion, stageId, navProfileId, bitNavProfileId, node };
};

const classifyMarker = (
  node: TransformNode
): Readonly<{
  marker: StageMarker;
  assemblyAnchor: AuthoredAssemblyAnchor | null;
}> => {
  const extras = requireExtras(node);
  const role = requireEnum(
    node.name,
    extras,
    "hs_role",
    STAGE_MARKER_ROLES
  );
  const isAssemblyAnchor = role === "assembly_anchor";
  const isMissionAnchor = role === "mission_anchor";
  const isStairLanding = role === "map_stair_landing";
  const isElevatorLanding = role === "map_elevator_landing";
  const isBroadcastConsole = role === "broadcast_console";
  if (
    DYNAMIC_STAGE_MARKER_ROLES.includes(
      role as DynamicStageMarkerRole
    )
  ) {
    assertAllowedDynamicStageHsProperties(
      node.name,
      extras,
      role as DynamicStageMarkerRole
    );
  } else {
    assertAllowedHsProperties(
      node.name,
      extras,
      isAssemblyAnchor
        ? [
            "hs_id",
            "hs_role",
            "hs_selection_weight",
            "hs_assembly_positions_json",
            "hs_execution_audience_positions_json",
            "hs_execution_target_positions_json"
          ]
        : isMissionAnchor
          ? ["hs_id", "hs_role", "hs_location_id"]
          : isStairLanding
            ? [
                "hs_id",
                "hs_role",
                "hs_stair_id",
                "hs_floor_id",
                "hs_direction"
              ]
            : isElevatorLanding
              ? [
                  "hs_id",
                  "hs_role",
                  "hs_elevator_id",
                  "hs_floor_id",
                  "hs_available",
                  "hs_stop_id"
                ]
              : isBroadcastConsole
                ? [
                    "hs_id",
                    "hs_role",
                    "hs_floor_id",
                    "hs_display_name",
                    "hs_target_id"
                  ]
        : ["hs_id", "hs_role"]
    );
  }
  assertUnitScale(node);
  const marker: StageMarker = Object.freeze({
    id: requireId(node.name, extras),
    role,
    node
  });
  if (!isAssemblyAnchor) {
    return { marker, assemblyAnchor: null };
  }
  const selectionWeight = requireFiniteNumber(
    node.name,
    extras,
    "hs_selection_weight"
  );
  if (selectionWeight <= 0) {
    throw new Error(`集合会場の選択weightには正数が必要です: ${node.name}`);
  }
  return {
    marker,
    assemblyAnchor: Object.freeze({
      marker,
      selectionWeight,
      assemblyPositions: parseWorldPositionArrayJson(
        node.name,
        extras,
        "hs_assembly_positions_json"
      ),
      executionAudiencePositions: parseWorldPositionArrayJson(
        node.name,
        extras,
        "hs_execution_audience_positions_json"
      ),
      executionTargetPositions: parseWorldPositionArrayJson(
        node.name,
        extras,
        "hs_execution_target_positions_json"
      )
    })
  };
};

const classifyMissionAnchor = (
  marker: StageMarker
): AuthoredStageMissionAnchor => {
  const extras = requireExtras(marker.node);
  return Object.freeze({
    id: marker.id,
    locationId: requireReferenceId(
      marker.node.name,
      extras,
      "hs_location_id"
    ),
    node: marker.node
  });
};

const classifyStairLanding = (
  marker: StageMarker
): AuthoredStageStairLanding => {
  const extras = requireExtras(marker.node);
  return Object.freeze({
    id: marker.id,
    stairId: requireReferenceId(
      marker.node.name,
      extras,
      "hs_stair_id"
    ),
    floorId: requireLocationFloorId(marker.node.name, extras),
    direction: requireEnum(
      marker.node.name,
      extras,
      "hs_direction",
      STAGE_STAIR_LANDING_DIRECTIONS
    ) as StageStairLandingDirection,
    node: marker.node
  });
};

const classifyElevatorLanding = (
  marker: StageMarker
): AuthoredStageElevatorLanding => {
  const extras = requireExtras(marker.node);
  const available = requireBoolean(
    marker.node.name,
    extras,
    "hs_available"
  );
  const hasStop = Object.prototype.hasOwnProperty.call(extras, "hs_stop_id");
  if (available !== hasStop) {
    throw new Error(
      `map_elevator_landingの利用可否とstop参照が一致しません: ${marker.node.name}`
    );
  }
  return Object.freeze({
    id: marker.id,
    elevatorId: requireReferenceId(
      marker.node.name,
      extras,
      "hs_elevator_id"
    ),
    floorId: requireLocationFloorId(marker.node.name, extras),
    available,
    stopId: hasStop
      ? requireReferenceId(marker.node.name, extras, "hs_stop_id")
      : null,
    node: marker.node
  });
};

const classifyBroadcastConsoleMarker = (
  marker: StageMarker
): AuthoredStageBroadcastConsoleMarker => {
  const extras = requireExtras(marker.node);
  return Object.freeze({
    id: marker.id,
    floorId: requireLocationFloorId(marker.node.name, extras),
    displayName: requireString(
      marker.node.name,
      extras,
      "hs_display_name"
    ),
    targetId: requireReferenceId(
      marker.node.name,
      extras,
      "hs_target_id"
    ),
    node: marker.node
  });
};

const classifyLink = (
  node: TransformNode
): AuthoredStageLinkEndpoint | AuthoredBitFlightLinkEndpoint => {
  const nameMatch = LINK_OBJECT_NAME_PATTERN.exec(node.name);
  if (!nameMatch) {
    throw new Error(`LNK_*名はLNK_<id>_A/Bで指定します: ${node.name}`);
  }
  const extras = requireExtras(node);
  if (Object.prototype.hasOwnProperty.call(extras, "hs_transition_kind")) {
    assertAllowedHsProperties(node.name, extras, [
      "hs_id",
      "hs_transition_kind",
      "hs_zone_id",
      "hs_band_id",
      "hs_bidirectional",
      "hs_link_radius_m",
      "hs_projection_distance_m",
      "hs_affordances_json",
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
    const id = requireId(node.name, extras);
    if (nameMatch[1] !== id) {
      throw new Error(`LNK_*名とhs_idが一致しません: ${node.name}`);
    }
    const kind = requireEnum(
      node.name,
      extras,
      "hs_transition_kind",
      BIT_FLIGHT_TRANSITION_KINDS
    );
    if (kind !== "aperture") {
      throw new Error(`LNK_*の飛行遷移方式はapertureだけです: ${node.name}`);
    }
    const radiusMeters = requireFiniteNumber(
      node.name,
      extras,
      "hs_link_radius_m"
    );
    if (radiusMeters !== BIT_FLIGHT_ENVELOPE_RADIUS_METERS) {
      throw new Error(
        `ビット用LNK_*の必要安全包絡半径は${BIT_FLIGHT_ENVELOPE_RADIUS_METERS.toFixed(2)}mです: ${node.name}`
      );
    }
    const projectionDistance =
      requireFiniteNumber(
        node.name,
        extras,
        "hs_projection_distance_m"
      ) * BLENDER_METERS_TO_WORLD_UNITS;
    if (projectionDistance <= 0) {
      throw new Error(`飛行遷移の投影距離には正数が必要です: ${node.name}`);
    }
    return {
      id,
      endpoint,
      kind,
      band: parseBitFlightBandRef(node.name, extras, "hs"),
      bidirectional: requireBoolean(
        node.name,
        extras,
        "hs_bidirectional"
      ),
      radiusMeters,
      projectionDistance,
      affordances: requireBitFlightAffordances(node.name, extras),
      objectLinkName: nameMatch[1],
      node
    };
  }
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
  floorMaps: readonly AuthoredStageFloorMap[],
  minimapBarriers: readonly AuthoredStageMinimapBarrier[],
  minimapPassages: readonly AuthoredStageMinimapPassage[],
  markers: readonly StageMarker[],
  volumes: readonly StageVolume[],
  bitFlightTransitionVolumes: readonly AuthoredBitFlightTransitionVolume[],
  boundaryId: string,
  worldBoundaryId: string | null,
  portals: readonly StagePortal[],
  links: readonly AuthoredStageLinkEndpoint[],
  bitFlightLinks: readonly AuthoredBitFlightLinkEndpoint[],
  roomVariants: StageRoomVariantAssetRegistry | null
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
  for (const floorMap of floorMaps) {
    register(floorMap.id, floorMap.mesh.name);
  }
  for (const barrier of minimapBarriers) {
    register(barrier.id, barrier.mesh.name);
  }
  for (const passage of minimapPassages) {
    register(passage.id, passage.mesh.name);
  }
  for (const volume of volumes) {
    register(volume.id, volume.mesh.name);
  }
  for (const transition of bitFlightTransitionVolumes) {
    register(transition.definition.id, transition.mesh.name);
  }
  if (roomVariants) {
    for (const variant of roomVariants.variants) {
      register(variant.id, variant.node.name);
    }
    for (const tile of roomVariants.tileVolumes) {
      register(tile.id, tile.mesh.name);
    }
  }
  register(boundaryId, "BND_Stage");
  if (worldBoundaryId) {
    register(worldBoundaryId, "BND_WorldLimit");
  }
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

  const bitLinksById = new Map<string, AuthoredBitFlightLinkEndpoint[]>();
  for (const link of bitFlightLinks) {
    const pair = bitLinksById.get(link.id) ?? [];
    pair.push(link);
    bitLinksById.set(link.id, pair);
  }
  for (const [id, pair] of bitLinksById) {
    if (pair.length !== 2) {
      throw new Error(`ビット用LNK_*はA/Bの2個で構成します: ${id}`);
    }
    const endpointA = pair.find((link) => link.endpoint === "A");
    const endpointB = pair.find((link) => link.endpoint === "B");
    if (!endpointA || !endpointB) {
      throw new Error(`ビット用LNK_*のA/B endpointが揃っていません: ${id}`);
    }
    if (
      endpointA.objectLinkName !== endpointB.objectLinkName ||
      endpointA.kind !== endpointB.kind ||
      endpointA.bidirectional !== endpointB.bidirectional ||
      endpointA.radiusMeters !== endpointB.radiusMeters ||
      endpointA.projectionDistance !== endpointB.projectionDistance ||
      endpointA.affordances.length !== endpointB.affordances.length ||
      endpointA.affordances.some(
        (value, index) => value !== endpointB.affordances[index]
      )
    ) {
      throw new Error(`ビット用LNK_* pairのpropertyが一致しません: ${id}`);
    }
    endpointA.node.computeWorldMatrix(true);
    endpointB.node.computeWorldMatrix(true);
    if (
      Vector3.Distance(
        endpointA.node.getAbsolutePosition(),
        endpointB.node.getAbsolutePosition()
      ) === 0
    ) {
      throw new Error(`ビット用LNK_*のA/Bには異なる位置が必要です: ${id}`);
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
  const beamSightOnlyColliders: Mesh[] = [];
  const navSources: NavSource[] = [];
  const bitFlightNavSources: BitFlightNavSource[] = [];
  const floorMaps: AuthoredStageFloorMap[] = [];
  const minimapBarriers: AuthoredStageMinimapBarrier[] = [];
  const minimapPassages: AuthoredStageMinimapPassage[] = [];
  const volumes: StageVolume[] = [];
  const locationAreaPieces: AuthoredStageLocationAreaPiece[] = [];
  const missionLocationVolumes: AuthoredStageMissionLocationVolume[] = [];
  const broadcastConsoleTargets: AuthoredStageBroadcastConsoleTarget[] = [];
  const assemblyVolumes: AuthoredAssemblyVolume[] = [];
  const bitFlightTransitionVolumes: AuthoredBitFlightTransitionVolume[] = [];
  const boundaries: Array<{ id: "stage"; mesh: Mesh }> = [];
  const worldBoundaries: Array<{ id: "world-limit"; mesh: Mesh }> = [];
  const portals: StagePortal[] = [];

  for (const mesh of authoredMeshes) {
    assertFiniteMeshGeometry(mesh);
    if (mesh.name.startsWith("COL_BeamSightOnly_")) {
      assertNameHasSuffix(mesh.name, "COL_BeamSightOnly_");
      assertNoHsProperties(mesh);
      configureSemanticMesh(mesh);
      beamSightOnlyColliders.push(mesh);
    } else if (mesh.name.startsWith("COL_ActorOnly_")) {
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
    } else if (mesh.name.startsWith("MAP_")) {
      assertNameHasSuffix(mesh.name, "MAP_");
      if (stage.locationAssetsMode !== "required") {
        throw new Error(
          `locationAssetsMode=unsupportedではMAP_*を使用できません: ${mesh.name}`
        );
      }
      configureSemanticMesh(mesh);
      const role = requireString(mesh.name, requireExtras(mesh), "hs_role");
      if (role === "floor_map") {
        floorMaps.push(classifyFloorMap(mesh));
      } else if (role === "map_barrier") {
        minimapBarriers.push(classifyMinimapBarrier(mesh));
      } else if (role === "map_passage") {
        minimapPassages.push(classifyMinimapPassage(mesh));
      } else {
        throw new Error(`未登録のMAP_* roleです: ${mesh.name}.${role}`);
      }
    } else if (mesh.name.startsWith("NAV_")) {
      assertNameHasSuffix(mesh.name, "NAV_");
      const source = classifyNavSource(mesh);
      configureSemanticMesh(mesh);
      if (source.navSet === "bit-flight") {
        bitFlightNavSources.push(source);
      } else {
        navSources.push(source);
      }
    } else if (isStageRoomVariantTileMesh(mesh)) {
      if (stage.roomVariantNavmesh.mode !== "required") {
        throw new Error(
          `roomVariantNavmesh=unsupportedではroom_variant_tileを使用できません: ${mesh.name}`
        );
      }
      configureSemanticMesh(mesh);
    } else if (mesh.name.startsWith("VOL_")) {
      assertNameHasSuffix(mesh.name, "VOL_");
      configureSemanticMesh(mesh);
      const extras = requireExtras(mesh);
      if (extras.hs_role === "bit_flight_transition") {
        bitFlightTransitionVolumes.push(
          classifyBitFlightTransitionVolume(mesh)
        );
      } else {
        const classified = classifyVolume(mesh);
        volumes.push(classified.volume);
        if (classified.volume.role === "location_area") {
          locationAreaPieces.push(
            classifyLocationAreaPiece(classified.volume)
          );
        } else if (classified.volume.role === "mission_location") {
          missionLocationVolumes.push(
            classifyMissionLocationVolume(classified.volume)
          );
        } else if (
          classified.volume.role === "broadcast_console_target"
        ) {
          broadcastConsoleTargets.push(
            classifyBroadcastConsoleTarget(classified.volume)
          );
        }
        if (classified.assemblyVolume) {
          assemblyVolumes.push(classified.assemblyVolume);
        }
      }
    } else if (mesh.name === "BND_Stage") {
      const boundary = classifyBoundary(mesh);
      configureSemanticMesh(mesh);
      boundaries.push(boundary);
    } else if (mesh.name === "BND_WorldLimit") {
      const boundary = classifyWorldBoundary(mesh);
      configureSemanticMesh(mesh);
      worldBoundaries.push(boundary);
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
  const assemblyAnchors: AuthoredAssemblyAnchor[] = [];
  const missionAnchors: AuthoredStageMissionAnchor[] = [];
  const stairLandings: AuthoredStageStairLanding[] = [];
  const elevatorLandings: AuthoredStageElevatorLanding[] = [];
  const broadcastConsoleMarkers: AuthoredStageBroadcastConsoleMarker[] = [];
  const links: AuthoredStageLinkEndpoint[] = [];
  const bitFlightLinks: AuthoredBitFlightLinkEndpoint[] = [];
  for (const node of authoredEmptyNodes) {
    assertFiniteNodeTransform(node);
    if (node.name === "META_Stage") {
      metadataEntries.push(classifyMetadata(node, stage));
    } else if (isStageRoomVariantMarkerNode(node)) {
      if (stage.roomVariantNavmesh.mode !== "required") {
        throw new Error(
          `roomVariantNavmesh=unsupportedではroom_variantを使用できません: ${node.name}`
        );
      }
    } else if (node.name.startsWith("MRK_")) {
      assertNameHasSuffix(node.name, "MRK_");
      const classified = classifyMarker(node);
      markers.push(classified.marker);
      if (classified.assemblyAnchor) {
        assemblyAnchors.push(classified.assemblyAnchor);
      }
      if (classified.marker.role === "mission_anchor") {
        missionAnchors.push(classifyMissionAnchor(classified.marker));
      } else if (classified.marker.role === "map_stair_landing") {
        stairLandings.push(classifyStairLanding(classified.marker));
      } else if (classified.marker.role === "map_elevator_landing") {
        elevatorLandings.push(
          classifyElevatorLanding(classified.marker)
        );
      } else if (classified.marker.role === "broadcast_console") {
        broadcastConsoleMarkers.push(
          classifyBroadcastConsoleMarker(classified.marker)
        );
      }
    } else if (node.name.startsWith("LNK_")) {
      const link = classifyLink(node);
      if ("band" in link) {
        bitFlightLinks.push(link);
      } else {
        links.push(link);
      }
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
  if (stage.worldBoundaryMode === "required" && worldBoundaries.length !== 1) {
    throw new Error(
      `worldBoundaryMode=requiredではBND_WorldLimitが1個必要です: ${worldBoundaries.length}個`
    );
  }
  if (
    stage.worldBoundaryMode === "unsupported" &&
    worldBoundaries.length !== 0
  ) {
    throw new Error(
      `worldBoundaryMode=unsupportedではBND_WorldLimitを使用できません: ${worldBoundaries.length}個`
    );
  }
  const locationAssetCount =
    floorMaps.length +
    minimapBarriers.length +
    minimapPassages.length +
    locationAreaPieces.length +
    missionLocationVolumes.length +
    missionAnchors.length +
    stairLandings.length +
    elevatorLandings.length +
    broadcastConsoleMarkers.length +
    broadcastConsoleTargets.length;
  if (stage.locationAssetsMode === "unsupported" && locationAssetCount !== 0) {
    throw new Error(
      `locationAssetsMode=unsupportedではLocation意味資産を使用できません: ${locationAssetCount}個`
    );
  }
  if (
    stage.locationAssetsMode === "required" &&
    [
      floorMaps,
      minimapBarriers,
      minimapPassages,
      locationAreaPieces,
      missionLocationVolumes,
      missionAnchors,
      stairLandings,
      elevatorLandings,
      broadcastConsoleMarkers,
      broadcastConsoleTargets
    ].some((entries) => entries.length === 0)
  ) {
    throw new Error("locationAssetsMode=requiredの意味資産が不足しています");
  }
  const playerSpawns = markers.filter((marker) => marker.role === "player_spawn");
  if (playerSpawns.length === 0) {
    throw new Error("player_spawnは1個以上必要です");
  }
  if (!navSources.some((source) => source.role === "walkable")) {
    throw new Error("hs_nav_role=walkableのNAV_*が必要です");
  }
  if (bitFlightNavSources.length === 0) {
    throw new Error("NAV_BitFlight_*が必要です");
  }
  for (const requiredRole of [
    "npc_spawn",
    "npc_spawn_bias",
    "bit_spawn"
  ] as const) {
    if (!volumes.some((volume) => volume.role === requiredRole)) {
      throw new Error(`${requiredRole}のVOL_*が必要です`);
    }
  }
  const playerSpawnIds = new Set(playerSpawns.map((spawn) => spawn.id));
  const playerSpawnExclusions = volumes.filter(
    (volume) => volume.role === "player_spawn_exclusion"
  );
  const exclusionByPlayerSpawnId = new Map<string, StageVolume>();
  for (const exclusion of playerSpawnExclusions) {
    const playerSpawnId = exclusion.playerSpawnId!;
    if (!playerSpawnIds.has(playerSpawnId)) {
      throw new Error(
        `player_spawn_exclusionが未登録player_spawnを参照しています: ${exclusion.id}/${playerSpawnId}`
      );
    }
    if (exclusionByPlayerSpawnId.has(playerSpawnId)) {
      throw new Error(
        `player_spawn_exclusionがplayer_spawnへ重複対応しています: ${playerSpawnId}`
      );
    }
    exclusionByPlayerSpawnId.set(playerSpawnId, exclusion);
  }
  for (const playerSpawn of playerSpawns) {
    if (!exclusionByPlayerSpawnId.has(playerSpawn.id)) {
      throw new Error(
        `player_spawnに対応するplayer_spawn_exclusionがありません: ${playerSpawn.id}`
      );
    }
  }

  const npcSpawnVolumes = volumes.filter(
    (volume) => volume.role === "npc_spawn"
  );
  const npcSpawnBiasVolumes = volumes.filter(
    (volume) => volume.role === "npc_spawn_bias"
  );
  const npcSpawnBiasesByPlayerSpawnId = new Map<string, StageVolume[]>();
  for (const bias of npcSpawnBiasVolumes) {
    const playerSpawnId = bias.playerSpawnId!;
    if (!playerSpawnIds.has(playerSpawnId)) {
      throw new Error(
        `npc_spawn_biasが未登録player_spawnを参照しています: ${bias.id}/${playerSpawnId}`
      );
    }
    const containingNpcSpawnVolumes = npcSpawnVolumes.filter((volume) =>
      isVolumeFullyContainedByConvexVolume(bias, volume)
    );
    if (containingNpcSpawnVolumes.length !== 1) {
      throw new Error(
        `npc_spawn_biasは単一npc_spawn Volumeへ完全内包する必要があります: ${bias.id}/${containingNpcSpawnVolumes.length}件`
      );
    }
    const grouped =
      npcSpawnBiasesByPlayerSpawnId.get(playerSpawnId) ?? [];
    grouped.push(bias);
    npcSpawnBiasesByPlayerSpawnId.set(playerSpawnId, grouped);
  }
  for (const playerSpawn of playerSpawns) {
    if (!npcSpawnBiasesByPlayerSpawnId.has(playerSpawn.id)) {
      throw new Error(
        `player_spawnに対応するnpc_spawn_biasがありません: ${playerSpawn.id}`
      );
    }
  }

  const roomVariants =
    stage.roomVariantNavmesh.mode === "required"
      ? createStageRoomVariantAssetRegistry({
          markerNodes: authoredEmptyNodes.filter(
            isStageRoomVariantMarkerNode
          ),
          volumeMeshes: authoredMeshes.filter(isStageRoomVariantTileMesh),
          visualMeshes,
          normalColliders,
          beamSightOnlyColliders,
          humanNavSourceMeshes: navSources.map((source) => source.mesh),
          authoredNodes
        })
      : null;

  assertUniqueSemanticIds(
    floorMaps,
    minimapBarriers,
    minimapPassages,
    markers,
    volumes,
    bitFlightTransitionVolumes,
    boundaries[0].id,
    worldBoundaries[0]?.id ?? null,
    portals,
    links,
    bitFlightLinks,
    roomVariants
  );

  const locationAssetSource: StageLocationAssetRegistrySource =
    Object.freeze({
      floorMaps: Object.freeze([...floorMaps]),
      minimapBarriers: Object.freeze([...minimapBarriers]),
      minimapPassages: Object.freeze([...minimapPassages]),
      areaPieces: Object.freeze([...locationAreaPieces]),
      missionVolumes: Object.freeze([...missionLocationVolumes]),
      missionAnchors: Object.freeze([...missionAnchors]),
      stairLandings: Object.freeze([...stairLandings]),
      elevatorLandings: Object.freeze([...elevatorLandings]),
      broadcastConsoleMarkers: Object.freeze([
        ...broadcastConsoleMarkers
      ]),
      broadcastConsoleTargets: Object.freeze([
        ...broadcastConsoleTargets
      ])
    });

  return {
    metadata: metadataEntries[0],
    visualMeshes,
    normalColliders,
    actorOnlyColliders,
    humanOnlyColliders,
    beamSightOnlyColliders,
    navSources,
    bitFlightNavSources,
    markers,
    volumes,
    assemblyAnchors,
    assemblyVolumes,
    bitFlightTransitionVolumes,
    boundaryMesh: boundaries[0].mesh,
    worldBoundaryMesh: worldBoundaries[0]?.mesh ?? null,
    portals,
    links,
    bitFlightLinks,
    roomVariants,
    locationAssetSource
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

const createPlayerSpawnRegistry = (
  markers: StageMarkerRegistry,
  volumes: StageVolumeRegistry,
  navigation: NavigationWorld
): StagePlayerSpawnRegistry => {
  const playerSpawnMarkers = markers.getByRole("player_spawn");
  const exclusions = volumes.getByRole("player_spawn_exclusion");
  const allNpcSpawnBiasVolumes = volumes.getByRole("npc_spawn_bias");
  const navigationTriangles = navigation.getSurfaceTriangles();
  const exclusionByPlayerSpawnId = new Map(
    exclusions.map((exclusion) => [exclusion.playerSpawnId!, exclusion])
  );
  const all = Object.freeze(
    playerSpawnMarkers.map((marker) => {
      const exclusionVolume = exclusionByPlayerSpawnId.get(marker.id)!;
      const npcSpawnBiasVolumes = Object.freeze(
        allNpcSpawnBiasVolumes
          .filter((volume) => volume.playerSpawnId === marker.id)
          .sort((left, right) => left.id.localeCompare(right.id))
      );
      for (const biasVolume of npcSpawnBiasVolumes) {
        if (
          !hasPositiveNavigationSurfaceVolumeIntersection(
            Object.freeze([biasVolume]),
            navigationTriangles
          )
        ) {
          throw new Error(
            `npc_spawn_biasとbaked NavMeshの正面積交差がありません: ${marker.id}/${biasVolume.id}`
          );
        }
      }
      for (
        let leftIndex = 0;
        leftIndex < npcSpawnBiasVolumes.length;
        leftIndex += 1
      ) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < npcSpawnBiasVolumes.length;
          rightIndex += 1
        ) {
          const overlapArea =
            calculateNavigationSurfaceVolumeIntersectionArea(
              Object.freeze([
                npcSpawnBiasVolumes[leftIndex],
                npcSpawnBiasVolumes[rightIndex]
              ]),
              navigationTriangles
            );
          if (overlapArea > 1e-10) {
            throw new Error(
              `同じplayer_spawnのnpc_spawn_biasがbaked NavMesh上で正面積重複しています: ${marker.id}/${npcSpawnBiasVolumes[leftIndex].id}/${npcSpawnBiasVolumes[rightIndex].id}/${overlapArea}`
            );
          }
        }
      }
      marker.node.computeWorldMatrix(true);
      const position = marker.node.getAbsolutePosition();
      if (!createStageBoundaryContainsQuery(exclusionVolume.mesh)(position)) {
        throw new Error(
          `player_spawnが対応player_spawn_exclusionの外側です: ${marker.id}/${exclusionVolume.id}`
        );
      }
      return Object.freeze({
        id: marker.id,
        marker,
        exclusionVolume,
        npcSpawnBiasVolumes
      });
    })
  );
  const byId = new Map(all.map((spawn) => [spawn.id, spawn]));
  return Object.freeze({
    all,
    getById: (id: string) => byId.get(id) ?? null
  });
};

const createAssemblyVenueRegistry = (
  authoredAnchors: readonly AuthoredAssemblyAnchor[],
  authoredVolumes: readonly AuthoredAssemblyVolume[],
  boundary: StageBoundary
): StageAssemblyVenueRegistry => {
  const volumeByAnchorId = new Map<string, AuthoredAssemblyVolume>();
  for (const authoredVolume of authoredVolumes) {
    if (volumeByAnchorId.has(authoredVolume.anchorId)) {
      throw new Error(
        `集合会場anchorへ複数のVOL_*が対応しています: ${authoredVolume.anchorId}`
      );
    }
    volumeByAnchorId.set(authoredVolume.anchorId, authoredVolume);
  }

  const anchorIds = new Set(
    authoredAnchors.map((authoredAnchor) => authoredAnchor.marker.id)
  );
  for (const authoredVolume of authoredVolumes) {
    if (!anchorIds.has(authoredVolume.anchorId)) {
      throw new Error(
        `集合会場VOL_*の参照先anchorがありません: ${authoredVolume.volume.mesh.name}`
      );
    }
  }

  const venues = authoredAnchors.map((authoredAnchor) => {
    const authoredVolume = volumeByAnchorId.get(authoredAnchor.marker.id);
    if (!authoredVolume) {
      throw new Error(
        `assembly_anchorへ対応するVOL_*がありません: ${authoredAnchor.marker.node.name}`
      );
    }
    if (
      authoredAnchor.assemblyPositions.length !==
      authoredAnchor.executionAudiencePositions.length +
        authoredAnchor.executionTargetPositions.length
    ) {
      throw new Error(
        `集合人数と公開処刑人数の合計が一致しません: ${authoredAnchor.marker.node.name}`
      );
    }

    authoredAnchor.marker.node.computeWorldMatrix(true);
    const center = authoredAnchor.marker.node.getAbsolutePosition().clone();
    const containsVolume = createStageBoundaryContainsQuery(
      authoredVolume.volume.mesh
    );
    if (!containsVolume(center)) {
      throw new Error(
        `assembly_anchorが対応VOL_*の外側です: ${authoredAnchor.marker.node.name}`
      );
    }

    const positionGroups = [
      ["hs_assembly_positions_json", authoredAnchor.assemblyPositions],
      [
        "hs_execution_audience_positions_json",
        authoredAnchor.executionAudiencePositions
      ],
      [
        "hs_execution_target_positions_json",
        authoredAnchor.executionTargetPositions
      ]
    ] as const;
    for (const [property, positions] of positionGroups) {
      for (const position of positions) {
        if (!containsVolume(position)) {
          throw new Error(
            `作者座標が対応VOL_*の外側です: ${authoredAnchor.marker.node.name}.${property}`
          );
        }
        if (!boundary.contains(position)) {
          throw new Error(
            `作者座標がBND_Stageの外側です: ${authoredAnchor.marker.node.name}.${property}`
          );
        }
      }
    }

    return Object.freeze({
      id: authoredAnchor.marker.id,
      anchor: authoredAnchor.marker,
      volume: authoredVolume.volume,
      center,
      selectionWeight: authoredAnchor.selectionWeight,
      assemblyPositions: authoredAnchor.assemblyPositions,
      executionAudiencePositions:
        authoredAnchor.executionAudiencePositions,
      executionTargetPositions: authoredAnchor.executionTargetPositions
    });
  });
  venues.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  );
  const all = Object.freeze(venues);
  const byId = new Map(all.map((venue) => [venue.id, venue]));
  return Object.freeze({
    all,
    getById: (id: string) => byId.get(id) ?? null
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

const createBitFlightNavigationDefinition = (
  classification: StageAssetClassification
): BitFlightNavigationDefinition => {
  const zonesById = new Map<string, BitFlightZone>();
  const bandsByKey = new Map<string, BitFlightBand>();
  const walkableBandKeys = new Set<string>();
  const bandKey = (ref: BitFlightBandRef) =>
    JSON.stringify([ref.zoneId, ref.bandId]);

  for (const source of classification.bitFlightNavSources) {
    const zone = zonesById.get(source.zoneId);
    if (zone && zone.spaceKind !== source.spaceKind) {
      throw new Error(
        `同一飛行ゾーンの空間種別が一致しません: ${source.zoneId}`
      );
    }
    zonesById.set(
      source.zoneId,
      zone ??
        Object.freeze({
          id: source.zoneId,
          spaceKind: source.spaceKind
        })
    );

    const ref = createBitFlightBandRef(source.zoneId, source.bandId);
    const key = bandKey(ref);
    if (source.role === "walkable") {
      walkableBandKeys.add(key);
    }
    const band = bandsByKey.get(key);
    if (
      band &&
      (band.minimumCenterHeight !== source.minimumCenterHeight ||
        band.maximumCenterHeight !== source.maximumCenterHeight)
    ) {
      throw new Error(
        `同一飛行帯の中心高度範囲が一致しません: ${source.zoneId}/${source.bandId}`
      );
    }
    bandsByKey.set(
      key,
      band ??
        Object.freeze({
          zoneId: source.zoneId,
          id: source.bandId,
          minimumCenterHeight: source.minimumCenterHeight,
          maximumCenterHeight: source.maximumCenterHeight
        })
    );
  }
  for (const [key, band] of bandsByKey) {
    if (!walkableBandKeys.has(key)) {
      throw new Error(
        `飛行帯にwalkable生成元がありません: ${band.zoneId}/${band.id}`
      );
    }
  }

  const requireBand = (ref: BitFlightBandRef) => {
    const band = bandsByKey.get(bandKey(ref));
    if (!band) {
      throw new Error(`未登録の飛行帯です: ${ref.zoneId}/${ref.bandId}`);
    }
    return band;
  };
  const bandCenterHeight = (ref: BitFlightBandRef) => {
    const band = requireBand(ref);
    return (band.minimumCenterHeight + band.maximumCenterHeight) / 2;
  };

  const volumeTransitions = classification.bitFlightTransitionVolumes.map(
    ({ mesh, definition, traversalPoints }): BitFlightTransitionDefinition => {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      const minimum = bounds.minimumWorld.clone();
      const maximum = bounds.maximumWorld.clone();
      const contains = createStageBoundaryContainsQuery(mesh);
      const containsSegment =
        createStageVolumeContainsSegmentQuery(mesh);
      const centerX = (bounds.minimumWorld.x + bounds.maximumWorld.x) / 2;
      const centerZ = (bounds.minimumWorld.z + bounds.maximumWorld.z) / 2;
      if (definition.kind === "surface-route" && traversalPoints.length === 0) {
        throw new Error(
          `surface-routeには通過点が必要です: ${definition.id}`
        );
      }
      const firstTraversalPoint = traversalPoints[0];
      const lastTraversalPoint = traversalPoints[traversalPoints.length - 1];
      const fromPosition =
        firstTraversalPoint ??
        new Vector3(
          centerX,
          bandCenterHeight(definition.from),
          centerZ
        );
      const toPosition =
        lastTraversalPoint ??
        new Vector3(
          centerX,
          bandCenterHeight(definition.to),
          centerZ
        );
      return Object.freeze({
        ...definition,
        fromPosition: fromPosition.clone(),
        toPosition: toPosition.clone(),
        traversalPoints,
        region: Object.freeze({
          minimum,
          maximum,
          contains,
          containsSegment
        })
      });
    }
  );

  const bitLinksById = new Map<string, AuthoredBitFlightLinkEndpoint[]>();
  for (const endpoint of classification.bitFlightLinks) {
    const pair = bitLinksById.get(endpoint.id) ?? [];
    pair.push(endpoint);
    bitLinksById.set(endpoint.id, pair);
  }
  const apertureTransitions = [...bitLinksById].map(
    ([id, endpoints]): BitFlightTransitionDefinition => {
      const endpointA = endpoints.find((endpoint) => endpoint.endpoint === "A")!;
      const endpointB = endpoints.find((endpoint) => endpoint.endpoint === "B")!;
      endpointA.node.computeWorldMatrix(true);
      endpointB.node.computeWorldMatrix(true);
      const fromPosition = endpointA.node.getAbsolutePosition().clone();
      const toPosition = endpointB.node.getAbsolutePosition().clone();
      requireBand(endpointA.band);
      requireBand(endpointB.band);
      return Object.freeze({
        id,
        kind: "aperture",
        from: endpointA.band,
        to: endpointB.band,
        bidirectional: endpointA.bidirectional,
        affordances: endpointA.affordances,
        fromPosition,
        toPosition,
        traversalPoints: Object.freeze([fromPosition.clone(), toPosition.clone()]),
        region: null,
        projectionDistance: endpointA.projectionDistance
      });
    }
  );

  for (const volume of classification.volumes) {
    if (volume.role === "bit_spawn") {
      if (!volume.bitFlightBand) {
        throw new Error(`bit_spawnに飛行帯指定がありません: ${volume.id}`);
      }
      requireBand(volume.bitFlightBand);
    }
  }

  return Object.freeze({
    zones: Object.freeze([...zonesById.values()]),
    bands: Object.freeze([...bandsByKey.values()]),
    transitions: Object.freeze([
      ...volumeTransitions,
      ...apertureTransitions
    ])
  });
};

const assertSemanticsInsideBoundary = (
  boundary: StageBoundary,
  worldBoundary: StageWorldBoundary | null,
  floorMaps: readonly AuthoredStageFloorMap[],
  minimapBarriers: readonly AuthoredStageMinimapBarrier[],
  minimapPassages: readonly AuthoredStageMinimapPassage[],
  markers: readonly StageMarker[],
  volumes: readonly StageVolume[],
  bitFlightTransitionVolumes: readonly AuthoredBitFlightTransitionVolume[],
  links: readonly StageLinkPair[],
  bitFlightLinks: readonly AuthoredBitFlightLinkEndpoint[]
) => {
  for (const mapAsset of floorMaps) {
    const positions = mapAsset.mesh.getVerticesData(
      VertexBuffer.PositionKind
    )!;
    const world = mapAsset.mesh.computeWorldMatrix(true);
    for (let index = 0; index < positions.length; index += 3) {
      const point = Vector3.TransformCoordinates(
        Vector3.FromArray(positions, index),
        world
      );
      if (!boundary.contains(point)) {
        throw new Error(`MAP_*がBND_Stageの外側です: ${mapAsset.mesh.name}`);
      }
    }
  }
  if (
    (minimapBarriers.length > 0 || minimapPassages.length > 0) &&
    !worldBoundary
  ) {
    throw new Error(
      "map_barrier／map_passageにはBND_WorldLimitが必要です"
    );
  }
  for (const mapAsset of [...minimapBarriers, ...minimapPassages]) {
    const positions = mapAsset.mesh.getVerticesData(
      VertexBuffer.PositionKind
    )!;
    const world = mapAsset.mesh.computeWorldMatrix(true);
    for (let index = 0; index < positions.length; index += 3) {
      const point = Vector3.TransformCoordinates(
        Vector3.FromArray(positions, index),
        world
      );
      if (!worldBoundary!.contains(point)) {
        throw new Error(
          `MAP_Barrier／MAP_PassageがBND_WorldLimitの外側です: ${mapAsset.mesh.name}`
        );
      }
    }
  }
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
  for (const transition of bitFlightTransitionVolumes) {
    const positions = transition.mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const world = transition.mesh.computeWorldMatrix(true);
    for (let index = 0; index < positions.length; index += 3) {
      const point = Vector3.TransformCoordinates(
        Vector3.FromArray(positions, index),
        world
      );
      if (!boundary.contains(point)) {
        throw new Error(
          `飛行遷移VOL_*がBND_Stageの外側です: ${transition.mesh.name}`
        );
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
  for (const endpoint of bitFlightLinks) {
    endpoint.node.computeWorldMatrix(true);
    if (!boundary.contains(endpoint.node.getAbsolutePosition())) {
      throw new Error(
        `ビット用LNK_*がBND_Stageの外側です: ${endpoint.node.name}`
      );
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
  if (!stage.bitNavmeshUrl.endsWith(".bit-flight.navmesh.bin")) {
    throw new Error(`ビット用NavMesh URLが不正です: ${stage.bitNavmeshUrl}`);
  }
  if (stage.roomVariantNavmesh.mode === "unsupported") {
    if (
      Object.keys(stage.roomVariantNavmesh).length !== 1
    ) {
      throw new Error(
        `roomVariantNavmesh=unsupportedへURL・hashは指定できません: ${stage.id}`
      );
    }
  } else if (stage.roomVariantNavmesh.mode === "required") {
    if (
      Object.keys(stage.roomVariantNavmesh).length !== 3 ||
      !stage.roomVariantNavmesh.url.endsWith(
        ".room-variants.navmesh.bin"
      ) ||
      !SHA256_PATTERN.test(stage.roomVariantNavmesh.sha256)
    ) {
      throw new Error(
        `roomVariantNavmesh=requiredのURL・SHA-256が不正です: ${stage.id}`
      );
    }
  } else {
    throw new Error(`roomVariantNavmesh.modeが不正です: ${stage.id}`);
  }
  if (!Number.isInteger(stage.assetSchemaVersion) || stage.assetSchemaVersion <= 0) {
    throw new Error(`資産schema versionが不正です: ${stage.assetSchemaVersion}`);
  }
  if (stage.navProfileId.length === 0) {
    throw new Error(`NavMeshプロファイルIDが空です: ${stage.id}`);
  }
  if (stage.bitNavProfileId.length === 0) {
    throw new Error(`ビット用NavMeshプロファイルIDが空です: ${stage.id}`);
  }
  if (!SHA256_PATTERN.test(stage.glbSha256)) {
    throw new Error(`GLB SHA-256が不正です: ${stage.id}`);
  }
  if (!SHA256_PATTERN.test(stage.navmeshSha256)) {
    throw new Error(`NavMesh SHA-256が不正です: ${stage.id}`);
  }
  if (!SHA256_PATTERN.test(stage.bitNavmeshSha256)) {
    throw new Error(`ビット用NavMesh SHA-256が不正です: ${stage.id}`);
  }
  if (
    stage.depthPrePassMaterialNames.some((name) => name.length === 0) ||
    new Set(stage.depthPrePassMaterialNames).size !==
      stage.depthPrePassMaterialNames.length
  ) {
    throw new Error(`深度プリパスMaterial名が不正です: ${stage.id}`);
  }
  if (
    stage.worldBoundaryMode !== "required" &&
    stage.worldBoundaryMode !== "unsupported"
  ) {
    throw new Error(`世界境界modeが不正です: ${stage.id}`);
  }
  if (
    stage.locationAssetsMode !== "required" &&
    stage.locationAssetsMode !== "unsupported"
  ) {
    throw new Error(`Location意味資産modeが不正です: ${stage.id}`);
  }
  if (
    stage.locationAssetsMode === "required" &&
    stage.assetSchemaVersion < 3
  ) {
    throw new Error(
      `locationAssetsMode=requiredには資産schema version 3以上が必要です: ${stage.id}`
    );
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
  const container = await SceneLoader.LoadAssetContainerAsync(
    "",
    file,
    scene,
    null,
    ".glb"
  );
  stageGlbParseCount += 1;
  return container;
};

const configureStageMaterials = (
  container: AssetContainer,
  stage: StageCatalogEntry
) => {
  for (const materialName of stage.depthPrePassMaterialNames) {
    const matchingMaterials = container.materials.filter(
      (material) => material.name === materialName
    );
    if (matchingMaterials.length !== 1) {
      throw new Error(
        `深度プリパス対象Materialが1件ではありません: ${materialName}=${matchingMaterials.length}`
      );
    }
    matchingMaterials[0].needDepthPrePass = true;
  }
};

const assertRoomVariantRegistryMatchesBundle = (
  registry: StageRoomVariantAssetRegistry,
  bundle: HumanNavTileBundle
) => {
  const registryRoomIds = new Set<string>(registry.roomIds);
  const bundleRoomIds = new Set(bundle.rooms.map((room) => room.roomId));
  if (
    registryRoomIds.size !== bundleRoomIds.size ||
    [...registryRoomIds].some((roomId) => !bundleRoomIds.has(roomId))
  ) {
    throw new Error(
      "GLBのroom_variant room ID集合がNavMesh bundleと一致しません。"
    );
  }
};

const createRoomVariantActivation = (
  registry: StageRoomVariantAssetRegistry,
  selections: readonly HumanNavRoomVariantSelection[]
): StageRoomVariantActivation => {
  const selectionByRoom = Object.fromEntries(
    selections.map((selection) => [
      selection.roomId,
      selection.variant
    ])
  ) as StageRoomVariantSelectionByRoom;
  return registry.activate(selectionByRoom);
};

const applyRoomVariantActivation = (
  activation: StageRoomVariantActivation
) => {
  for (const variant of activation.selectedVariants) {
    variant.node.setEnabled(true);
  }
  for (const variant of activation.unselectedVariants) {
    variant.node.setEnabled(false);
  }
};

export type StageDynamicSpatialInitializationInput = Readonly<{
  activeSet: DynamicStageSpatialActiveSet;
  doorAssets: StageDoorAssetRegistry;
  elevatorAssets: StageElevatorAssetRegistry;
}>;

export type StageDynamicSpatialInitialization = Readonly<{
  staticActiveSet: DynamicStageSpatialActiveSet;
  initialActiveSet: DynamicStageSpatialActiveSet;
}>;

export type StageSpatialSessionOptions = Readonly<{
  queryDiagnostics?: StageSpatialQueryDiagnostics;
  roomVariantSelections?: readonly HumanNavRoomVariantSelection[];
  dynamicSpatialInitialization?: StageDynamicSpatialInitializationDescriptor;
}>;

export type StageStaticSessionSource = Readonly<{
  classification: StageAssetClassification;
  humanNavigationBundle: HumanNavTileBundle | null;
  humanNavigationData: Uint8Array | null;
}>;

type StageStaticSessionOwnership = {
  status: "available" | "constructing" | "active" | "disposed";
  source: StageStaticSessionSource;
  cancelConstruction: (() => void) | null;
};

const stageStaticSessionOwnership = new WeakMap<
  OwnedStageStaticSpatialResources,
  StageStaticSessionOwnership
>();

type StageNodeActivationLease = Readonly<{
  release(): void;
}>;

const createStageNodeActivationLease = (
  container: AssetContainer
): StageNodeActivationLease => {
  const nodeStates = container.transformNodes.map((node) =>
    Object.freeze({
      node,
      enabled: node.isEnabled(),
      position: node.position.clone(),
      rotation: node.rotation.clone(),
      rotationQuaternion: node.rotationQuaternion?.clone() ?? null,
      scaling: node.scaling.clone()
    })
  );
  const meshStates = container.meshes.map((mesh) =>
    Object.freeze({
      mesh,
      enabled: mesh.isEnabled(),
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      rotationQuaternion: mesh.rotationQuaternion?.clone() ?? null,
      scaling: mesh.scaling.clone(),
      isVisible: mesh.isVisible,
      isPickable: mesh.isPickable,
      checkCollisions: mesh.checkCollisions
    })
  );
  let released = false;
  return Object.freeze({
    release: () => {
      if (released) {
        throw new Error("Stage静的Node activation leaseは解放済みです。");
      }
      for (const state of nodeStates) {
        state.node.position.copyFrom(state.position);
        state.node.rotation.copyFrom(state.rotation);
        state.node.rotationQuaternion = state.rotationQuaternion?.clone() ?? null;
        state.node.scaling.copyFrom(state.scaling);
        state.node.setEnabled(state.enabled);
        state.node.computeWorldMatrix(true);
      }
      for (const state of meshStates) {
        state.mesh.position.copyFrom(state.position);
        state.mesh.rotation.copyFrom(state.rotation);
        state.mesh.rotationQuaternion = state.rotationQuaternion?.clone() ?? null;
        state.mesh.scaling.copyFrom(state.scaling);
        state.mesh.isVisible = state.isVisible;
        state.mesh.isPickable = state.isPickable;
        state.mesh.checkCollisions = state.checkCollisions;
        state.mesh.setEnabled(state.enabled);
        state.mesh.computeWorldMatrix(true);
      }
      released = true;
    }
  });
};

export const loadStageStaticSpatialResources = async (
  scene: Scene,
  stage: StageCatalogEntry
): Promise<OwnedStageStaticSpatialResources> => {
  assertCatalogEntry(stage);
  const roomVariantNavmeshRequest =
    stage.roomVariantNavmesh.mode === "required"
      ? fetchBinary(stage.roomVariantNavmesh.url)
      : Promise.resolve<Uint8Array | null>(null);
  const [
    glbData,
    navmeshData,
    bitNavmeshData,
    roomVariantNavmeshData
  ] = await Promise.all([
    fetchBinary(stage.glbUrl),
    fetchBinary(stage.navmeshUrl),
    fetchBinary(stage.bitNavmeshUrl),
    roomVariantNavmeshRequest
  ]);
  const hashChecks = [
    assertHash("GLB", glbData, stage.glbSha256),
    assertHash("NavMesh", navmeshData, stage.navmeshSha256),
    assertHash(
      "ビット用NavMesh",
      bitNavmeshData,
      stage.bitNavmeshSha256
    )
  ];
  if (stage.roomVariantNavmesh.mode === "required") {
    if (!roomVariantNavmeshData) {
      throw new Error(
        `必須の部屋variant NavMesh bundleがありません: ${stage.id}`
      );
    }
    hashChecks.push(
      assertHash(
        "部屋variant NavMesh",
        roomVariantNavmeshData,
        stage.roomVariantNavmesh.sha256
      )
    );
  }
  await Promise.all(hashChecks);

  let container: AssetContainer | null = null;
  let bitNavigation: BitFlightNavigationWorld | null = null;
  let worldBoundary: OwnedStageWorldBoundary | null = null;
  let humanNavigationBundle: HumanNavTileBundle | null = null;
  let humanNavigationData: Uint8Array | null = null;
  try {
    container = await loadGlbContainer(scene, stage, glbData);
    configureStageMaterials(container, stage);
    const managementRoot = container.createRootMesh();
    managementRoot.name = `StageAssetRoot_${stage.id}`;
    managementRoot.scaling.setAll(BLENDER_METERS_TO_WORLD_UNITS);
    managementRoot.isVisible = false;
    managementRoot.isPickable = false;
    managementRoot.checkCollisions = false;
    managementRoot.computeWorldMatrix(true);

    const classification = classifyStageAsset(container, managementRoot, stage);
    const links = createLinkRegistry(classification.links);
    const bitFlightDefinition =
      createBitFlightNavigationDefinition(classification);
    const bitNavmeshPayloads = decodeBitFlightNavBundle(bitNavmeshData).map(
      (payload) =>
        Object.freeze({
          zoneId: toBitFlightZoneId(payload.zoneId),
          bandId: toBitFlightBandId(payload.bandId),
          data: payload.data
        })
    );
    if (stage.roomVariantNavmesh.mode === "required") {
      if (
        !roomVariantNavmeshData ||
        !classification.roomVariants
      ) {
        throw new Error(
          `必須の部屋variant資源を組み立てられません: ${stage.id}`
        );
      }
      humanNavigationBundle = await decodeHumanNavTileBundle(
        roomVariantNavmeshData,
        navmeshData,
        stage.id,
        stage.navProfileId
      );
      staticDecodedHumanBundleOwnerCount += 1;
      assertRoomVariantRegistryMatchesBundle(
        classification.roomVariants,
        humanNavigationBundle
      );
    } else {
      if (classification.roomVariants) {
        throw new Error(
          `roomVariantNavmesh=unsupportedにroom variant registryがあります: ${stage.id}`
        );
      }
      humanNavigationData = Uint8Array.from(navmeshData);
    }
    bitNavigation = await createBitFlightNavigationWorld(
      bitFlightDefinition,
      bitNavmeshPayloads
    );
    staticBitNavigationOwnerCount += 1;
    container.addAllToScene();

    const activeVisualMeshes = Object.freeze([...classification.visualMeshes]);
    const activeNormalColliders = Object.freeze([...classification.normalColliders]);
    const activeBeamSightOnlyColliders = Object.freeze([
      ...classification.beamSightOnlyColliders
    ]);
    const activeHumanNavSources = Object.freeze([...classification.navSources]);
    const humanMovementColliders = Object.freeze([
      ...activeNormalColliders,
      ...classification.actorOnlyColliders,
      ...classification.humanOnlyColliders
    ]);
    const bitMovementColliders = Object.freeze([
      ...activeNormalColliders,
      ...classification.actorOnlyColliders
    ]);
    const fullMovementColliders: StageMovementColliderSets =
      Object.freeze({
      player: humanMovementColliders,
      npc: humanMovementColliders,
      bit: bitMovementColliders
    });
    const fullBeamBlockers = Object.freeze([
      ...activeNormalColliders,
      ...activeBeamSightOnlyColliders
    ]);
    const fullSightBlockers = Object.freeze([
      ...activeNormalColliders,
      ...activeBeamSightOnlyColliders
    ]);
    const dynamicAssets = createStageDynamicAssetRegistries({
      markerNodes: classification.markers.map((marker) => marker.node),
      volumeMeshes: classification.volumes.map((volume) => volume.mesh),
      visualMeshes: activeVisualMeshes,
      normalColliders: activeNormalColliders,
      humanOnlyColliders: classification.humanOnlyColliders,
      links: links.all
    });
    const humanNavigationSources = Object.freeze([
      ...activeHumanNavSources
    ]);
    const bitFlightNavSourceMeshes = Object.freeze(
      classification.bitFlightNavSources.map((source) => source.mesh)
    );
    const semanticMeshes = Object.freeze([
      ...classification.locationAssetSource.floorMaps.map(
        (floorMap) => floorMap.mesh
      ),
      ...classification.locationAssetSource.minimapBarriers.map(
        (barrier) => barrier.mesh
      ),
      ...classification.locationAssetSource.minimapPassages.map(
        (passage) => passage.mesh
      ),
      ...classification.volumes.map((volume) => volume.mesh),
      ...classification.bitFlightTransitionVolumes.map(
        (transition) => transition.mesh
      ),
      classification.boundaryMesh,
      ...(classification.worldBoundaryMesh
        ? [classification.worldBoundaryMesh]
        : []),
      ...classification.portals.map((portal) => portal.mesh),
      ...(classification.roomVariants?.tileVolumes.map(
        (tile) => tile.mesh
      ) ?? [])
    ]);
    const semanticNodes = Object.freeze([
      classification.metadata.node,
      ...classification.markers.map((marker) => marker.node),
      ...classification.links.map((link) => link.node),
      ...classification.bitFlightLinks.map((link) => link.node),
      ...(classification.roomVariants?.variants.map(
        (variant) => variant.node
      ) ?? [])
    ]);
    const resources: StageSpatialResources = Object.freeze({
      visualMeshes: activeVisualMeshes,
      normalColliders: activeNormalColliders,
      actorOnlyColliders: Object.freeze([...classification.actorOnlyColliders]),
      humanOnlyColliders: Object.freeze([...classification.humanOnlyColliders]),
      beamSightOnlyColliders: activeBeamSightOnlyColliders,
      movementColliders: fullMovementColliders,
      beamBlockers: fullBeamBlockers,
      sightBlockers: fullSightBlockers,
      humanNavigationSources,
      bitFlightNavSourceMeshes,
      semanticMeshes,
      semanticNodes,
      metadataNode: classification.metadata.node,
      assetContainer: container,
      managementRoot
    });
    const markers = createMarkerRegistry(classification.markers);
    const volumes = createVolumeRegistry(classification.volumes);
    const boundary: StageBoundary = Object.freeze({
      id: "stage" as const,
      mesh: classification.boundaryMesh,
      contains: createStageBoundaryContainsQuery(classification.boundaryMesh)
    });
    worldBoundary = classification.worldBoundaryMesh
      ? createStageWorldBoundary(
          classification.worldBoundaryMesh,
          classification.boundaryMesh
        )
      : null;
    assertSemanticsInsideBoundary(
      boundary,
      worldBoundary,
      classification.locationAssetSource.floorMaps,
      classification.locationAssetSource.minimapBarriers,
      classification.locationAssetSource.minimapPassages,
      markers.all,
      volumes.all,
      classification.bitFlightTransitionVolumes,
      links.all,
      classification.bitFlightLinks
    );
    const assemblyVenues = createAssemblyVenueRegistry(
      classification.assemblyAnchors,
      classification.assemblyVolumes,
      boundary
    );

    let disposed = false;
    const ownedContainer = container;
    const ownedBitNavigation = bitNavigation;
    const ownedWorldBoundary = worldBoundary;
    const sessionSource: StageStaticSessionSource = Object.freeze({
      classification,
      humanNavigationBundle,
      humanNavigationData
    });
    const staticView: StageStaticSpatialView = Object.freeze({
      scene,
      fingerprint: createStageCatalogFingerprint(stage),
      stage,
      metadata: classification.metadata,
      resources,
      doorAssets: dynamicAssets.doors,
      elevatorAssets: dynamicAssets.elevators,
      roomVariants: classification.roomVariants,
      locationAssets:
        stage.locationAssetsMode === "required"
          ? createAuthoredStageLocationAssetRegistry(
              classification.locationAssetSource,
              dynamicAssets.elevators
            )
          : null,
      humanNavigationBundle,
      humanNavigationData,
      bitNavigation: ownedBitNavigation,
      markers,
      volumes,
      assemblyVenues,
      links,
      boundary,
      worldBoundary: ownedWorldBoundary
    });
    const sessionOwnership: StageStaticSessionOwnership = {
      status: "available",
      source: sessionSource,
      cancelConstruction: null
    };
    const owner: OwnedStageStaticSpatialResources = Object.freeze({
      view: staticView,
      fingerprint: staticView.fingerprint,
      cancelSessionConstructionSynchronously: () => {
        sessionOwnership.cancelConstruction?.();
      },
      dispose: () => {
        if (disposed) {
          throw new Error(`Stage静的空間資源は破棄済みです: ${stage.id}`);
        }
        if (
          sessionOwnership.status === "active" ||
          sessionOwnership.status === "constructing"
        ) {
          throw new Error(
            `有効または生成中のStage空間sessionより先に静的資源を破棄できません: ${stage.id}`
          );
        }
        disposed = true;
        sessionOwnership.status = "disposed";
        ownedWorldBoundary?.dispose();
        ownedBitNavigation.dispose();
        staticBitNavigationOwnerCount -= 1;
        if (humanNavigationBundle !== null) {
          staticDecodedHumanBundleOwnerCount -= 1;
        }
        ownedContainer.removeAllFromScene();
        ownedContainer.dispose();
      }
    });
    stageStaticSessionOwnership.set(owner, sessionOwnership);
    return owner;
  } catch (error) {
    worldBoundary?.dispose();
    if (bitNavigation) {
      bitNavigation.dispose();
      staticBitNavigationOwnerCount -= 1;
    }
    if (humanNavigationBundle !== null) {
      staticDecodedHumanBundleOwnerCount -= 1;
    }
    container?.removeAllFromScene();
    container?.dispose();
    throw error;
  }
};

export const createStageSpatialSession = async (
  staticResources: OwnedStageStaticSpatialResources,
  options: StageSpatialSessionOptions = {}
): Promise<StageSpatialSession> => {
  const staticView = staticResources.view;
  const ownership = stageStaticSessionOwnership.get(staticResources);
  if (!ownership) {
    throw new Error("loadStageStaticSpatialResources()が生成したownerが必要です。");
  }
  const source = ownership.source;
  if (ownership.status === "disposed") {
    throw new Error("破棄済みのStage静的資源からsessionは生成できません。");
  }
  if (ownership.status !== "available") {
    throw new Error("同じStage静的資源へ複数sessionは生成できません。");
  }
  const { stage } = staticView;
  if (stage.roomVariantNavmesh.mode === "required" && !options.roomVariantSelections) {
    throw new Error(`roomVariantNavmesh=requiredでは全室variant選択が必要です: ${stage.id}`);
  }
  if (stage.roomVariantNavmesh.mode === "unsupported" && options.roomVariantSelections) {
    throw new Error(`roomVariantNavmesh=unsupportedへvariant選択は指定できません: ${stage.id}`);
  }
  ownership.status = "constructing";
  const isStaticDisposed = () => ownership.status === "disposed";

  const activationLease = createStageNodeActivationLease(
    staticView.resources.assetContainer
  );
  let navigation: NavigationWorld | null = null;
  let navigationOwnerCounted = false;
  let dynamicVariants: DynamicStageSpatialVariants | null = null;
  let queries: StageSpatialQueries | null = null;
  let navigationAreas: StageNavigationAreaRegistry | null = null;
  let constructionCancelled = false;
  let constructionRolledBack = false;
  const rollbackConstruction = () => {
    if (constructionRolledBack) {
      return;
    }
    constructionRolledBack = true;
    navigationAreas?.dispose();
    navigationAreas = null;
    queries?.dispose();
    queries = null;
    dynamicVariants?.dispose();
    dynamicVariants = null;
    if (navigation !== null && navigationOwnerCounted) {
      navigation.dispose();
      sessionHumanNavigationWorldOwnerCount -= 1;
      navigationOwnerCounted = false;
      navigation = null;
    }
    activationLease.release();
    if (ownership.status !== "disposed") {
      ownership.status = "available";
    }
    ownership.cancelConstruction = null;
  };
  ownership.cancelConstruction = () => {
    constructionCancelled = true;
    rollbackConstruction();
  };
  try {
    let roomVariantActivation: StageRoomVariantActivation | null = null;
    let roomVariantSelection: readonly HumanNavRoomVariantSelection[] = Object.freeze([]);
    if (stage.roomVariantNavmesh.mode === "required") {
      if (!staticView.roomVariants || !source.humanNavigationBundle || !options.roomVariantSelections) {
        throw new Error(`必須の部屋variant資源を組み立てられません: ${stage.id}`);
      }
      roomVariantActivation = createRoomVariantActivation(
        staticView.roomVariants,
        options.roomVariantSelections
      );
      applyRoomVariantActivation(roomVariantActivation);
      const assembly = await assembleHumanNavTileBundle(
        source.humanNavigationBundle,
        options.roomVariantSelections
      );
      if (constructionCancelled) {
        assembly.navMesh.destroy();
        throw new Error("Stage session生成は終了処理でcancelされました。");
      }
      roomVariantSelection = assembly.selectedVariants;
      navigation = createNavigationWorldFromNavMesh(assembly.navMesh, staticView.links.all);
      sessionHumanNavigationWorldOwnerCount += 1;
      navigationOwnerCounted = true;
    } else {
      if (!source.humanNavigationData) {
        throw new Error(`人間用NavMesh dataがありません: ${stage.id}`);
      }
      const createdNavigation = await createNavigationWorld(
        source.humanNavigationData,
        staticView.links.all
      );
      if (constructionCancelled) {
        createdNavigation.dispose();
        throw new Error("Stage session生成は終了処理でcancelされました。");
      }
      navigation = createdNavigation;
      sessionHumanNavigationWorldOwnerCount += 1;
      navigationOwnerCounted = true;
    }

    const classification = source.classification;
    const inactiveVisualMeshes = new Set(roomVariantActivation?.inactive.visualMeshes ?? []);
    const inactiveNormalColliders = new Set(roomVariantActivation?.inactive.colliderMeshes ?? []);
    const inactiveBeamSightOnlyColliders = new Set(
      roomVariantActivation?.inactive.beamSightOnlyColliders ?? []
    );
    const inactiveHumanNavSources = new Set(
      roomVariantActivation?.inactive.humanNavSourceMeshes ?? []
    );
    const activeVisualMeshes = Object.freeze(
      classification.visualMeshes.filter((mesh) => !inactiveVisualMeshes.has(mesh))
    );
    const activeNormalColliders = Object.freeze(
      classification.normalColliders.filter((mesh) => !inactiveNormalColliders.has(mesh))
    );
    const activeBeamSightOnlyColliders = Object.freeze(
      classification.beamSightOnlyColliders.filter(
        (mesh) => !inactiveBeamSightOnlyColliders.has(mesh)
      )
    );
    const activeHumanNavSources = Object.freeze(
      classification.navSources.filter(
        (navSource) => !inactiveHumanNavSources.has(navSource.mesh)
      )
    );
    const humanMovementColliders = Object.freeze([
      ...activeNormalColliders,
      ...classification.actorOnlyColliders,
      ...classification.humanOnlyColliders
    ]);
    const bitMovementColliders = Object.freeze([
      ...activeNormalColliders,
      ...classification.actorOnlyColliders
    ]);
    const movementColliders: StageMovementColliderSets = Object.freeze({
      player: humanMovementColliders,
      npc: humanMovementColliders,
      bit: bitMovementColliders
    });
    const beamBlockers = Object.freeze([
      ...activeNormalColliders,
      ...activeBeamSightOnlyColliders
    ]);
    const sightBlockers = Object.freeze([
      ...activeNormalColliders,
      ...activeBeamSightOnlyColliders
    ]);
    const fullActiveSet: DynamicStageSpatialActiveSet = Object.freeze({
      movementColliders,
      groundColliders: activeNormalColliders,
      beamBlockers,
      sightBlockers,
      bitObstacles: bitMovementColliders
    });
    const hasDynamicAssets =
      staticView.doorAssets.all.length > 0 || staticView.elevatorAssets.all.length > 0;
    if (hasDynamicAssets && !options.dynamicSpatialInitialization) {
      throw new Error(`動的資産を持つStageには動的初期化descriptorが必要です: ${stage.id}`);
    }
    const spatialInitialization = options.dynamicSpatialInitialization
      ? options.dynamicSpatialInitialization.initialize({
          activeSet: fullActiveSet,
          doorAssets: staticView.doorAssets,
          elevatorAssets: staticView.elevatorAssets
        })
      : Object.freeze({
          staticActiveSet: fullActiveSet,
          initialActiveSet: fullActiveSet
        });
    dynamicVariants = createDynamicStageSpatialVariants(
      spatialInitialization.initialActiveSet
    );
    queries = createStageSpatialQueries(staticView.scene, dynamicVariants, {
      volumes: staticView.volumes.all,
      diagnostics: options.queryDiagnostics
    });
    navigationAreas = createStageNavigationAreaRegistry(
      staticView.volumes.all,
      classification.portals
        .filter((portal) => portal.role === "navigation_area_portal")
        .map((portal): AuthoredStageNavigationAreaPortal =>
          Object.freeze({
            id: portal.id,
            fromAreaId: portal.fromAreaId!,
            toAreaId: portal.toAreaId!,
            bidirectional: portal.bidirectional!,
            mesh: portal.mesh
          })
        ),
      options.queryDiagnostics
    );
    const playerSpawns = createPlayerSpawnRegistry(
      staticView.markers,
      staticView.volumes,
      navigation
    );
    const locationAssets = staticView.locationAssets
      ? staticView.locationAssets.bindSession(
          navigation,
          queries
        )
      : null;
    const resources: StageSpatialResources = Object.freeze({
      visualMeshes: activeVisualMeshes,
      normalColliders: activeNormalColliders,
      actorOnlyColliders: Object.freeze([...classification.actorOnlyColliders]),
      humanOnlyColliders: Object.freeze([...classification.humanOnlyColliders]),
      beamSightOnlyColliders: activeBeamSightOnlyColliders,
      movementColliders,
      beamBlockers,
      sightBlockers,
      humanNavigationSources: Object.freeze([...activeHumanNavSources]),
      bitFlightNavSourceMeshes: staticView.resources.bitFlightNavSourceMeshes,
      semanticMeshes: staticView.resources.semanticMeshes,
      semanticNodes: staticView.resources.semanticNodes,
      metadataNode: staticView.resources.metadataNode,
      assetContainer: staticView.resources.assetContainer,
      managementRoot: staticView.resources.managementRoot
    });

    const ownedNavigation = navigation;
    const ownedDynamicVariants = dynamicVariants;
    const ownedQueries = queries;
    const ownedNavigationAreas = navigationAreas;
    if (isStaticDisposed()) {
      throw new Error("Stage session生成中に静的資源が破棄されました。");
    }
    ownership.status = "active";
    ownership.cancelConstruction = null;
    let disposed = false;
    return Object.freeze({
      staticView,
      stage,
      metadata: staticView.metadata,
      resources,
      staticSpatialActiveSet: spatialInitialization.staticActiveSet,
      dynamicVariants: ownedDynamicVariants,
      doorAssets: staticView.doorAssets,
      elevatorAssets: staticView.elevatorAssets,
      roomVariants: staticView.roomVariants,
      locationAssets,
      roomVariantSelection,
      navigation: ownedNavigation,
      bitNavigation: staticView.bitNavigation,
      markers: staticView.markers,
      volumes: staticView.volumes,
      playerSpawns,
      navigationAreas: ownedNavigationAreas,
      assemblyVenues: staticView.assemblyVenues,
      links: staticView.links,
      boundary: staticView.boundary,
      worldBoundary: staticView.worldBoundary,
      queries: ownedQueries,
      dynamicSpatialInitialization: options.dynamicSpatialInitialization ?? null,
      dispose: () => {
        if (disposed) {
          throw new Error(`Stage空間sessionは破棄済みです: ${stage.id}`);
        }
        disposed = true;
        ownedNavigationAreas.dispose();
        ownedQueries.dispose();
        ownedDynamicVariants.dispose();
        if (navigationOwnerCounted) {
          ownedNavigation.dispose();
          sessionHumanNavigationWorldOwnerCount -= 1;
          navigationOwnerCounted = false;
        }
        activationLease.release();
        if (!isStaticDisposed()) {
          ownership.status = "available";
        }
      }
    });
  } catch (error) {
    rollbackConstruction();
    throw error;
  }
};
