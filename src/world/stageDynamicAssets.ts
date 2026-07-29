import {
  Mesh,
  Quaternion,
  TransformNode,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import type { StageLinkPair } from "./stageLinks";

export const DYNAMIC_STAGE_MARKER_ROLES = [
  "door",
  "door_panel",
  "door_open_pose",
  "elevator",
  "elevator_car",
  "elevator_stop",
  "elevator_passenger_origin",
  "elevator_wait",
  "elevator_human_gate",
  "elevator_call_indicator"
] as const;

export const DYNAMIC_STAGE_VOLUME_ROLES = [
  "door_sweep",
  "elevator_call_mat",
  "elevator_threshold",
  "elevator_car_occupancy"
] as const;

export type DynamicStageMarkerRole =
  (typeof DYNAMIC_STAGE_MARKER_ROLES)[number];

export type DynamicStageVolumeRole =
  (typeof DYNAMIC_STAGE_VOLUME_ROLES)[number];

export const STAGE_DOOR_CLASSES = [
  "room",
  "toilet_stall",
  "elevator_landing",
  "elevator_car"
] as const;

export type StageDoorClass = (typeof STAGE_DOOR_CLASSES)[number];

export const STAGE_DOOR_MOTION_KINDS = ["slide", "swing"] as const;

export type StageDoorMotionKind =
  (typeof STAGE_DOOR_MOTION_KINDS)[number];

const DYNAMIC_STAGE_ALLOWED_HS_PROPERTIES = Object.freeze({
  door: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_door_class",
    "hs_sweep_id",
    "hs_elevator_id",
    "hs_stop_id"
  ]),
  door_panel: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_door_id",
    "hs_motion_kind",
    "hs_open_pose_id"
  ]),
  door_open_pose: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_door_id",
    "hs_panel_id"
  ]),
  elevator: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_link_id",
    "hs_car_id",
    "hs_car_door_id",
    "hs_occupancy_id",
    "hs_passenger_origin_id",
    "hs_initial_stop_id"
  ]),
  elevator_car: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id"
  ]),
  elevator_stop: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id",
    "hs_link_id",
    "hs_endpoint",
    "hs_floor_index",
    "hs_landing_door_id",
    "hs_call_mat_id",
    "hs_call_indicator_id",
    "hs_threshold_id",
    "hs_gate_id",
    "hs_wait_id"
  ]),
  elevator_passenger_origin: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id"
  ]),
  elevator_wait: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id",
    "hs_stop_id"
  ]),
  elevator_human_gate: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id",
    "hs_stop_id"
  ]),
  elevator_call_indicator: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id",
    "hs_stop_id",
    "hs_direction"
  ]),
  door_sweep: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_door_id"
  ]),
  elevator_call_mat: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id",
    "hs_stop_id"
  ]),
  elevator_threshold: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id",
    "hs_stop_id"
  ]),
  elevator_car_occupancy: Object.freeze([
    "hs_id",
    "hs_role",
    "hs_elevator_id"
  ])
} satisfies Readonly<
  Record<
    DynamicStageMarkerRole | DynamicStageVolumeRole,
    readonly string[]
  >
>);

const DYNAMIC_MARKER_NAME_PREFIXES = Object.freeze({
  door: "MRK_Door_",
  door_panel: "MRK_DoorPanel_",
  door_open_pose: "MRK_DoorOpenPose_",
  elevator: "MRK_Elevator_",
  elevator_car: "MRK_ElevatorCar_",
  elevator_stop: "MRK_ElevatorStop_",
  elevator_passenger_origin: "MRK_ElevatorPassengerOrigin_",
  elevator_wait: "MRK_ElevatorWait_",
  elevator_human_gate: "MRK_ElevatorHumanGate_",
  elevator_call_indicator: "MRK_ElevatorCallIndicator_"
} satisfies Readonly<Record<DynamicStageMarkerRole, string>>);

const DYNAMIC_VOLUME_NAME_PREFIXES = Object.freeze({
  door_sweep: "VOL_DoorSweep_",
  elevator_call_mat: "VOL_ElevatorCallMat_",
  elevator_threshold: "VOL_ElevatorThreshold_",
  elevator_car_occupancy: "VOL_ElevatorCarOccupancy_"
} satisfies Readonly<Record<DynamicStageVolumeRole, string>>);

const KEBAB_CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DYNAMIC_OBJECT_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TRANSFORM_EPSILON = 1e-5;
const VOLUME_TRIANGLE_EPSILON = 1e-12;

type Extras = Readonly<Record<string, unknown>>;

type DynamicRole = DynamicStageMarkerRole | DynamicStageVolumeRole;

type AuthoredDynamicMarker = Readonly<{
  id: string;
  role: DynamicStageMarkerRole;
  extras: Extras;
  node: TransformNode;
}>;

type AuthoredDynamicVolume = Readonly<{
  id: string;
  role: DynamicStageVolumeRole;
  extras: Extras;
  mesh: Mesh;
}>;

export type StageNodeLocalTransform = Readonly<{
  position: Vector3;
  rotation: Quaternion;
  scaling: Vector3;
}>;

export type StageDoorPanelMotion =
  | Readonly<{
      kind: "slide";
      axis: Vector3;
      distance: number;
    }>
  | Readonly<{
      kind: "swing";
      axis: Vector3;
      angleRadians: number;
    }>;

export type StageDoorPanelAsset = Readonly<{
  id: string;
  doorId: string;
  node: TransformNode;
  openPoseNode: TransformNode;
  visualMeshes: readonly Mesh[];
  colliderMeshes: readonly Mesh[];
  closedTransform: StageNodeLocalTransform;
  openTransform: StageNodeLocalTransform;
  motion: StageDoorPanelMotion;
}>;

export type StageDoorAsset = Readonly<{
  id: string;
  doorClass: StageDoorClass;
  node: TransformNode;
  panels: readonly StageDoorPanelAsset[];
  sweepId: string;
  sweepMesh: Mesh;
  elevatorId: string | null;
  stopId: string | null;
}>;

export interface StageDoorAssetRegistry {
  readonly all: readonly StageDoorAsset[];
  getById(id: string): StageDoorAsset | null;
  getByClass(doorClass: StageDoorClass): readonly StageDoorAsset[];
}

export type StageElevatorVolumeAsset<
  Role extends
    | "elevator_call_mat"
    | "elevator_threshold"
    | "elevator_car_occupancy"
> = Readonly<{
  id: string;
  role: Role;
  mesh: Mesh;
}>;

export type StageElevatorHumanGateAsset = Readonly<{
  id: string;
  node: TransformNode;
  collider: Mesh;
}>;

export type StageElevatorWaitAsset = Readonly<{
  id: string;
  node: TransformNode;
}>;

export type StageElevatorCallIndicatorAsset = Readonly<{
  id: string;
  node: TransformNode;
  direction: "up" | "down";
  baseMesh: Mesh;
  directionMesh: Mesh;
}>;

export type StageElevatorStopAsset = Readonly<{
  id: string;
  node: TransformNode;
  floorIndex: 1 | 4;
  endpoint: "A" | "B";
  landingDoor: StageDoorAsset;
  callMat: StageElevatorVolumeAsset<"elevator_call_mat">;
  threshold: StageElevatorVolumeAsset<"elevator_threshold">;
  humanGate: StageElevatorHumanGateAsset;
  wait: StageElevatorWaitAsset;
  callIndicator: StageElevatorCallIndicatorAsset;
}>;

export type StageElevatorCarAsset = Readonly<{
  id: string;
  node: TransformNode;
  visualMeshes: readonly Mesh[];
  colliderMeshes: readonly Mesh[];
  door: StageDoorAsset;
  occupancy: StageElevatorVolumeAsset<"elevator_car_occupancy">;
  passengerOriginId: string;
  passengerOriginNode: TransformNode;
}>;

export type StageElevatorAsset = Readonly<{
  id: string;
  node: TransformNode;
  link: StageLinkPair;
  car: StageElevatorCarAsset;
  stops: readonly [StageElevatorStopAsset, StageElevatorStopAsset];
  initialStop: StageElevatorStopAsset;
}>;

export interface StageElevatorAssetRegistry {
  readonly all: readonly StageElevatorAsset[];
  getById(id: string): StageElevatorAsset | null;
}

export type StageDynamicAssetRegistrySource = Readonly<{
  markerNodes: readonly TransformNode[];
  volumeMeshes: readonly Mesh[];
  visualMeshes: readonly Mesh[];
  normalColliders: readonly Mesh[];
  humanOnlyColliders: readonly Mesh[];
  links: readonly StageLinkPair[];
}>;

export type StageDynamicAssetRegistries = Readonly<{
  doors: StageDoorAssetRegistry;
  elevators: StageElevatorAssetRegistry;
}>;

export const getAllowedDynamicStageHsProperties = (
  role: DynamicRole
): readonly string[] => DYNAMIC_STAGE_ALLOWED_HS_PROPERTIES[role];

export const assertAllowedDynamicStageHsProperties = (
  objectName: string,
  extras: Readonly<Record<string, unknown>>,
  role: DynamicRole
): void => {
  const allowed = getAllowedDynamicStageHsProperties(role);
  const unknownProperty = Object.keys(extras).find(
    (property) => property.startsWith("hs_") && !allowed.includes(property)
  );
  if (unknownProperty) {
    throw new Error(
      `未登録のhs_ propertyです: ${objectName}.${unknownProperty}`
    );
  }
};

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

const requireIdValue = (
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

const requireId = (objectName: string, extras: Extras): string =>
  requireIdValue(objectName, extras, "hs_id");

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

const requireFloorIndex = (
  objectName: string,
  extras: Extras
): 1 | 4 => {
  const value = extras.hs_floor_index;
  if (value !== 1 && value !== 4) {
    throw new Error(
      `hs_floor_indexは1または4が必要です: ${objectName}`
    );
  }
  return value;
};

const findMarkerRoleFromName = (
  name: string
): DynamicStageMarkerRole | null => {
  for (const role of DYNAMIC_STAGE_MARKER_ROLES) {
    if (name.startsWith(DYNAMIC_MARKER_NAME_PREFIXES[role])) {
      return role;
    }
  }
  return null;
};

const findVolumeRoleFromName = (
  name: string
): DynamicStageVolumeRole | null => {
  for (const role of DYNAMIC_STAGE_VOLUME_ROLES) {
    if (name.startsWith(DYNAMIC_VOLUME_NAME_PREFIXES[role])) {
      return role;
    }
  }
  return null;
};

const assertDynamicObjectToken = (
  objectName: string,
  prefix: string
): void => {
  const token = objectName.slice(prefix.length);
  if (!DYNAMIC_OBJECT_TOKEN_PATTERN.test(token)) {
    throw new Error(
      `動的資産Object名のtokenは非空ASCII識別子が必要です: ${objectName}`
    );
  }
};

const assertClosedVolumeMesh = (mesh: Mesh): void => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (
    !positions ||
    !indices ||
    indices.length === 0 ||
    indices.length % 3 !== 0
  ) {
    throw new Error(`動的VOL_*は閉じた三角形Meshが必要です: ${mesh.name}`);
  }

  const vertexKey = (index: number) => {
    const offset = index * 3;
    if (
      offset < 0 ||
      offset + 2 >= positions.length ||
      !Number.isFinite(positions[offset]) ||
      !Number.isFinite(positions[offset + 1]) ||
      !Number.isFinite(positions[offset + 2])
    ) {
      throw new Error(`動的VOL_*の頂点が不正です: ${mesh.name}`);
    }
    return `${positions[offset]}:${positions[offset + 1]}:${positions[offset + 2]}`;
  };
  const edges = new Map<string, { count: number; direction: number }>();
  let signedVolume = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const firstIndex = indices[index];
    const secondIndex = indices[index + 1];
    const thirdIndex = indices[index + 2];
    const firstOffset = firstIndex * 3;
    const secondOffset = secondIndex * 3;
    const thirdOffset = thirdIndex * 3;
    const first = Vector3.FromArray(positions, firstOffset);
    const second = Vector3.FromArray(positions, secondOffset);
    const third = Vector3.FromArray(positions, thirdOffset);
    if (
      Vector3.Cross(
        second.subtract(first),
        third.subtract(first)
      ).lengthSquared() <= VOLUME_TRIANGLE_EPSILON
    ) {
      throw new Error(`動的VOL_*に退化三角形があります: ${mesh.name}`);
    }
    signedVolume += Vector3.Dot(
      first,
      Vector3.Cross(second, third)
    ) / 6;

    for (const [fromIndex, toIndex] of [
      [firstIndex, secondIndex],
      [secondIndex, thirdIndex],
      [thirdIndex, firstIndex]
    ] as const) {
      const from = vertexKey(fromIndex);
      const to = vertexKey(toIndex);
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
      `動的VOL_*は一貫した面向きの閉じたmanifold Meshが必要です: ${mesh.name}`
    );
  }
};

const isDynamicMarkerRole = (
  value: unknown
): value is DynamicStageMarkerRole =>
  typeof value === "string" &&
  DYNAMIC_STAGE_MARKER_ROLES.includes(value as DynamicStageMarkerRole);

const isDynamicVolumeRole = (
  value: unknown
): value is DynamicStageVolumeRole =>
  typeof value === "string" &&
  DYNAMIC_STAGE_VOLUME_ROLES.includes(value as DynamicStageVolumeRole);

const collectDynamicMarkers = (
  nodes: readonly TransformNode[]
): readonly AuthoredDynamicMarker[] => {
  const markers: AuthoredDynamicMarker[] = [];
  for (const node of nodes) {
    const expectedRole = findMarkerRoleFromName(node.name);
    const extras = readExtras(node);
    const authoredRole = extras.hs_role;
    if (!expectedRole && !isDynamicMarkerRole(authoredRole)) {
      continue;
    }
    if (node instanceof Mesh) {
      throw new Error(`動的MRK_*はEmptyである必要があります: ${node.name}`);
    }
    if (!expectedRole || authoredRole !== expectedRole) {
      throw new Error(
        `動的MRK_*名とhs_roleが一致しません: ${node.name}.${String(authoredRole)}`
      );
    }
    assertDynamicObjectToken(
      node.name,
      DYNAMIC_MARKER_NAME_PREFIXES[expectedRole]
    );
    const requiredExtras = requireExtras(node);
    assertAllowedDynamicStageHsProperties(
      node.name,
      requiredExtras,
      expectedRole
    );
    markers.push(
      Object.freeze({
        id: requireId(node.name, requiredExtras),
        role: expectedRole,
        extras: requiredExtras,
        node
      })
    );
  }
  return Object.freeze(markers);
};

const collectDynamicVolumes = (
  meshes: readonly Mesh[]
): readonly AuthoredDynamicVolume[] => {
  const volumes: AuthoredDynamicVolume[] = [];
  for (const mesh of meshes) {
    const expectedRole = findVolumeRoleFromName(mesh.name);
    const extras = readExtras(mesh);
    const authoredRole = extras.hs_role;
    if (!expectedRole && !isDynamicVolumeRole(authoredRole)) {
      continue;
    }
    if (!expectedRole || authoredRole !== expectedRole) {
      throw new Error(
        `動的VOL_*名とhs_roleが一致しません: ${mesh.name}.${String(authoredRole)}`
      );
    }
    assertDynamicObjectToken(
      mesh.name,
      DYNAMIC_VOLUME_NAME_PREFIXES[expectedRole]
    );
    assertClosedVolumeMesh(mesh);
    const requiredExtras = requireExtras(mesh);
    assertAllowedDynamicStageHsProperties(
      mesh.name,
      requiredExtras,
      expectedRole
    );
    volumes.push(
      Object.freeze({
        id: requireId(mesh.name, requiredExtras),
        role: expectedRole,
        extras: requiredExtras,
        mesh
      })
    );
  }
  return Object.freeze(volumes);
};

const assertUniqueEntries = (
  markers: readonly AuthoredDynamicMarker[],
  volumes: readonly AuthoredDynamicVolume[]
): void => {
  const owners = new Map<string, string>();
  for (const entry of [...markers, ...volumes]) {
    const previous = owners.get(entry.id);
    const objectName = "node" in entry ? entry.node.name : entry.mesh.name;
    if (previous) {
      throw new Error(
        `動的資産のhs_idが重複しています: ${entry.id} (${previous}, ${objectName})`
      );
    }
    owners.set(entry.id, objectName);
  }
};

const assertNoHsProperties = (mesh: Mesh): void => {
  const property = Object.keys(readExtras(mesh)).find((key) =>
    key.startsWith("hs_")
  );
  if (property) {
    throw new Error(
      `動的資産の子Meshへhs_*は指定できません: ${mesh.name}.${property}`
    );
  }
};

const assertUniqueReferences = (
  label: string,
  values: readonly TransformNode[]
): void => {
  const seen = new Set<TransformNode>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label}に同じObject参照が重複しています: ${value.name}`);
    }
    seen.add(value);
  }
};

const assertFiniteVector = (nodeName: string, vector: Vector3): void => {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    throw new Error(`Transformに非有限値があります: ${nodeName}`);
  }
};

const assertFiniteQuaternion = (
  nodeName: string,
  quaternion: Quaternion
): void => {
  if (
    !Number.isFinite(quaternion.x) ||
    !Number.isFinite(quaternion.y) ||
    !Number.isFinite(quaternion.z) ||
    !Number.isFinite(quaternion.w)
  ) {
    throw new Error(`Transformに非有限値があります: ${nodeName}`);
  }
};

const readLocalTransform = (node: TransformNode): StageNodeLocalTransform => {
  assertFiniteVector(node.name, node.position);
  assertFiniteVector(node.name, node.scaling);
  const rotation = (
    node.rotationQuaternion?.clone() ??
    Quaternion.FromEulerAngles(
      node.rotation.x,
      node.rotation.y,
      node.rotation.z
    )
  ).normalize();
  assertFiniteQuaternion(node.name, rotation);
  return Object.freeze({
    position: node.position.clone(),
    rotation,
    scaling: node.scaling.clone()
  });
};

const vectorsEqual = (
  left: Vector3,
  right: Vector3,
  epsilon = TRANSFORM_EPSILON
): boolean => Vector3.DistanceSquared(left, right) <= epsilon * epsilon;

const quaternionsEqual = (
  left: Quaternion,
  right: Quaternion,
  epsilon = TRANSFORM_EPSILON
): boolean =>
  1 - Math.min(1, Math.abs(Quaternion.Dot(left, right))) <= epsilon;

const createPanelMotion = (
  objectName: string,
  kind: StageDoorMotionKind,
  closed: StageNodeLocalTransform,
  open: StageNodeLocalTransform
): StageDoorPanelMotion => {
  if (!vectorsEqual(closed.scaling, open.scaling)) {
    throw new Error(
      `扉panelの閉・開scaleは一致が必要です: ${objectName}`
    );
  }
  if (kind === "slide") {
    if (!quaternionsEqual(closed.rotation, open.rotation)) {
      throw new Error(
        `slide扉の閉・開local rotationは一致が必要です: ${objectName}`
      );
    }
    const translation = open.position.subtract(closed.position);
    const distance = translation.length();
    if (distance <= TRANSFORM_EPSILON) {
      throw new Error(
        `slide扉の閉・開translation差分は0以外が必要です: ${objectName}`
      );
    }
    return Object.freeze({
      kind,
      axis: translation.scale(1 / distance),
      distance
    });
  }

  if (!vectorsEqual(closed.position, open.position)) {
    throw new Error(
      `swing扉の閉・開local translationは一致が必要です: ${objectName}`
    );
  }
  const inverseClosed = Quaternion.Inverse(closed.rotation);
  const relative = inverseClosed.multiply(open.rotation).normalize();
  if (relative.w < 0) {
    relative.scaleInPlace(-1);
  }
  if (
    Math.abs(relative.x) > TRANSFORM_EPSILON ||
    Math.abs(relative.z) > TRANSFORM_EPSILON
  ) {
    throw new Error(
      `swing扉はGLBのpanel local +Y軸（Blender local +Z）だけで回転する必要があります: ${objectName} ` +
        `(relative=${relative.toString()})`
    );
  }
  const angleRadians = 2 * Math.atan2(relative.y, relative.w);
  if (
    Math.abs(angleRadians) <= TRANSFORM_EPSILON ||
    Math.abs(angleRadians) > Math.PI + TRANSFORM_EPSILON
  ) {
    throw new Error(
      `swing扉の開角度は0より大きくπ以下が必要です: ${objectName}`
    );
  }
  return Object.freeze({
    kind,
    axis: Vector3.Up(),
    angleRadians
  });
};

const requireDirectParent = (
  child: TransformNode,
  parent: TransformNode,
  relationship: string
): void => {
  if (child.parent !== parent) {
    throw new Error(
      `${relationship}は直下の親子関係が必要です: ${child.name} -> ${parent.name}`
    );
  }
};

const isDescendantOf = (
  child: TransformNode,
  ancestor: TransformNode
): boolean => {
  let current = child.parent;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

const requireDescendant = (
  child: TransformNode,
  ancestor: TransformNode,
  relationship: string
): void => {
  if (!isDescendantOf(child, ancestor)) {
    throw new Error(
      `${relationship}の子孫関係が必要です: ${child.name} -> ${ancestor.name}`
    );
  }
};

const claimComponent = (
  claims: Map<string, string>,
  componentId: string,
  owner: string
): void => {
  const previousOwner = claims.get(componentId);
  if (previousOwner) {
    throw new Error(
      `動的componentが複数ownerに共有されています: ${componentId} (${previousOwner}, ${owner})`
    );
  }
  claims.set(componentId, owner);
};

const assertAllClaimed = (
  label: string,
  entries: readonly Readonly<{ id: string }>[],
  claims: ReadonlyMap<string, string>
): void => {
  const orphan = entries.find((entry) => !claims.has(entry.id));
  if (orphan) {
    throw new Error(`${label}が孤立しています: ${orphan.id}`);
  }
};

const createDoorRegistry = (
  source: StageDynamicAssetRegistrySource,
  markers: readonly AuthoredDynamicMarker[],
  volumes: readonly AuthoredDynamicVolume[]
): StageDoorAssetRegistry => {
  assertUniqueReferences("visualMeshes", source.visualMeshes);
  assertUniqueReferences("normalColliders", source.normalColliders);

  const doors = markers.filter((entry) => entry.role === "door");
  const panels = markers.filter((entry) => entry.role === "door_panel");
  const openPoses = markers.filter((entry) => entry.role === "door_open_pose");
  const sweeps = volumes.filter((entry) => entry.role === "door_sweep");
  if (
    doors.length === 0 &&
    panels.length === 0 &&
    openPoses.length === 0 &&
    sweeps.length === 0
  ) {
    const all = Object.freeze([]) as readonly StageDoorAsset[];
    return Object.freeze({
      all,
      getById: (_id: string) => null,
      getByClass: (_doorClass: StageDoorClass) => all
    });
  }
  const panelClaims = new Map<string, string>();
  const openPoseClaims = new Map<string, string>();
  const sweepClaims = new Map<string, string>();
  const usedVisualMeshes = new Set<Mesh>();
  const usedColliderMeshes = new Set<Mesh>();
  const assets: StageDoorAsset[] = [];

  for (const door of doors) {
    const doorClass = requireEnum(
      door.node.name,
      door.extras,
      "hs_door_class",
      STAGE_DOOR_CLASSES
    );
    const sweepId = requireIdValue(
      door.node.name,
      door.extras,
      "hs_sweep_id"
    );
    const elevatorClass =
      doorClass === "elevator_landing" || doorClass === "elevator_car";
    const hasElevatorId = Object.prototype.hasOwnProperty.call(
      door.extras,
      "hs_elevator_id"
    );
    const hasStopId = Object.prototype.hasOwnProperty.call(
      door.extras,
      "hs_stop_id"
    );
    if (hasElevatorId !== elevatorClass) {
      throw new Error(
        `elevator扉だけhs_elevator_idが必要です: ${door.node.name}`
      );
    }
    if (hasStopId !== (doorClass === "elevator_landing")) {
      throw new Error(
        `elevator_landingだけhs_stop_idが必要です: ${door.node.name}`
      );
    }
    const elevatorId = hasElevatorId
      ? requireIdValue(
          door.node.name,
          door.extras,
          "hs_elevator_id"
        )
      : null;
    const stopId = hasStopId
      ? requireIdValue(door.node.name, door.extras, "hs_stop_id")
      : null;

    const sweep = sweeps.find((entry) => entry.id === sweepId);
    if (!sweep) {
      throw new Error(
        `doorのhs_sweep_idがdoor_sweepへ解決できません: ${door.node.name}.${sweepId}`
      );
    }
    if (
      requireIdValue(sweep.mesh.name, sweep.extras, "hs_door_id") !==
      door.id
    ) {
      throw new Error(
        `doorとdoor_sweepの相互参照が一致しません: ${door.id}.${sweep.id}`
      );
    }
    requireDirectParent(sweep.mesh, door.node, "door_sweep");
    claimComponent(sweepClaims, sweep.id, door.id);

    const childPanels = panels.filter((entry) => entry.node.parent === door.node);
    if (childPanels.length === 0) {
      throw new Error(`doorにはpanelが1件以上必要です: ${door.node.name}`);
    }
    const panelAssets: StageDoorPanelAsset[] = [];
    for (const panel of childPanels) {
      const doorId = requireIdValue(
        panel.node.name,
        panel.extras,
        "hs_door_id"
      );
      if (doorId !== door.id) {
        throw new Error(
          `doorとdoor_panelの相互参照が一致しません: ${door.id}.${panel.id}`
        );
      }
      claimComponent(panelClaims, panel.id, door.id);
      const motionKind = requireEnum(
        panel.node.name,
        panel.extras,
        "hs_motion_kind",
        STAGE_DOOR_MOTION_KINDS
      );
      const expectedMotion: StageDoorMotionKind =
        doorClass === "toilet_stall" ? "swing" : "slide";
      if (motionKind !== expectedMotion) {
        throw new Error(
          `${doorClass}扉のmotion kindは${expectedMotion}が必要です: ${panel.node.name}`
        );
      }

      const openPoseId = requireIdValue(
        panel.node.name,
        panel.extras,
        "hs_open_pose_id"
      );
      const openPose = openPoses.find((entry) => entry.id === openPoseId);
      if (!openPose) {
        throw new Error(
          `panelのhs_open_pose_idがdoor_open_poseへ解決できません: ${panel.node.name}.${openPoseId}`
        );
      }
      if (
        requireIdValue(
          openPose.node.name,
          openPose.extras,
          "hs_door_id"
        ) !== door.id ||
        requireIdValue(
          openPose.node.name,
          openPose.extras,
          "hs_panel_id"
        ) !== panel.id
      ) {
        throw new Error(
          `panelとdoor_open_poseの相互参照が一致しません: ${panel.id}.${openPose.id}`
        );
      }
      requireDirectParent(openPose.node, door.node, "door_open_pose");
      claimComponent(openPoseClaims, openPose.id, panel.id);

      const visualMeshes = source.visualMeshes.filter(
        (mesh) =>
          mesh.parent === panel.node && mesh.name.startsWith("VIS_DoorPanel_")
      );
      const colliderMeshes = source.normalColliders.filter(
        (mesh) =>
          mesh.parent === panel.node && mesh.name.startsWith("COL_DoorPanel_")
      );
      if (visualMeshes.length === 0 || colliderMeshes.length === 0) {
        throw new Error(
          `door_panel直下にはVIS_DoorPanel_*とCOL_DoorPanel_*が各1件以上必要です: ${panel.node.name}`
        );
      }
      for (const mesh of [...visualMeshes, ...colliderMeshes]) {
        assertNoHsProperties(mesh);
      }
      visualMeshes.forEach((mesh) => usedVisualMeshes.add(mesh));
      colliderMeshes.forEach((mesh) => usedColliderMeshes.add(mesh));

      const closedTransform = readLocalTransform(panel.node);
      const openTransform = readLocalTransform(openPose.node);
      panelAssets.push(
        Object.freeze({
          id: panel.id,
          doorId: door.id,
          node: panel.node,
          openPoseNode: openPose.node,
          visualMeshes: Object.freeze([...visualMeshes]),
          colliderMeshes: Object.freeze([...colliderMeshes]),
          closedTransform,
          openTransform,
          motion: createPanelMotion(
            panel.node.name,
            motionKind,
            closedTransform,
            openTransform
          )
        })
      );
    }

    assets.push(
      Object.freeze({
        id: door.id,
        doorClass,
        node: door.node,
        panels: Object.freeze(panelAssets),
        sweepId,
        sweepMesh: sweep.mesh,
        elevatorId,
        stopId
      })
    );
  }

  assertAllClaimed("door_panel", panels, panelClaims);
  assertAllClaimed("door_open_pose", openPoses, openPoseClaims);
  assertAllClaimed("door_sweep", sweeps, sweepClaims);

  const orphanVisual = source.visualMeshes.find(
    (mesh) =>
      mesh.name.startsWith("VIS_DoorPanel_") && !usedVisualMeshes.has(mesh)
  );
  if (orphanVisual) {
    throw new Error(`扉の表示Meshが孤立しています: ${orphanVisual.name}`);
  }
  const orphanCollider = source.normalColliders.find(
    (mesh) =>
      mesh.name.startsWith("COL_DoorPanel_") &&
      !usedColliderMeshes.has(mesh)
  );
  if (orphanCollider) {
    throw new Error(`扉のCollider Meshが孤立しています: ${orphanCollider.name}`);
  }

  const all = Object.freeze(assets);
  const byId = new Map(all.map((asset) => [asset.id, asset]));
  const byClass = new Map<StageDoorClass, readonly StageDoorAsset[]>();
  for (const doorClass of STAGE_DOOR_CLASSES) {
    byClass.set(
      doorClass,
      Object.freeze(all.filter((asset) => asset.doorClass === doorClass))
    );
  }
  return Object.freeze({
    all,
    getById: (id: string) => byId.get(id) ?? null,
    getByClass: (doorClass: StageDoorClass) => byClass.get(doorClass)!
  });
};

type WorldTransform = Readonly<{
  position: Vector3;
  rotation: Quaternion;
}>;

const readWorldTransform = (node: TransformNode): WorldTransform => {
  const scaling = Vector3.One();
  const rotation = Quaternion.Identity();
  const position = Vector3.Zero();
  const matrix = node.computeWorldMatrix(true);
  if (!matrix.decompose(scaling, rotation, position)) {
    throw new Error(`world Transformを分解できません: ${node.name}`);
  }
  assertFiniteVector(node.name, position);
  assertFiniteQuaternion(node.name, rotation);
  return Object.freeze({ position, rotation: rotation.normalize() });
};

const assertElevatorStopTransforms = (
  first: AuthoredDynamicMarker,
  fourth: AuthoredDynamicMarker
): void => {
  const firstWorld = readWorldTransform(first.node);
  const fourthWorld = readWorldTransform(fourth.node);
  if (
    Math.abs(firstWorld.position.x - fourthWorld.position.x) >
      TRANSFORM_EPSILON ||
    Math.abs(firstWorld.position.z - fourthWorld.position.z) >
      TRANSFORM_EPSILON ||
    Math.abs(firstWorld.position.y - fourthWorld.position.y) <=
      TRANSFORM_EPSILON ||
    !quaternionsEqual(firstWorld.rotation, fourthWorld.rotation)
  ) {
    throw new Error(
      `elevator stopはworld X/Zとrotationを一致させ、高さだけを変える必要があります: ${first.node.name}, ${fourth.node.name}`
    );
  }
};

const assertSameWorldPose = (
  node: TransformNode,
  expected: TransformNode,
  relationship: string
): void => {
  const actualWorld = readWorldTransform(node);
  const expectedWorld = readWorldTransform(expected);
  if (
    !vectorsEqual(actualWorld.position, expectedWorld.position) ||
    !quaternionsEqual(actualWorld.rotation, expectedWorld.rotation)
  ) {
    throw new Error(
      `${relationship}のworld Transformが一致しません: ${node.name}, ${expected.name}`
    );
  }
};

const createElevatorRegistry = (
  source: StageDynamicAssetRegistrySource,
  markers: readonly AuthoredDynamicMarker[],
  volumes: readonly AuthoredDynamicVolume[],
  doors: StageDoorAssetRegistry
): StageElevatorAssetRegistry => {
  assertUniqueReferences("humanOnlyColliders", source.humanOnlyColliders);
  const controllers = markers.filter((entry) => entry.role === "elevator");
  const cars = markers.filter((entry) => entry.role === "elevator_car");
  const stops = markers.filter((entry) => entry.role === "elevator_stop");
  const passengerOrigins = markers.filter(
    (entry) => entry.role === "elevator_passenger_origin"
  );
  const waits = markers.filter((entry) => entry.role === "elevator_wait");
  const gates = markers.filter(
    (entry) => entry.role === "elevator_human_gate"
  );
  const callIndicators = markers.filter(
    (entry) => entry.role === "elevator_call_indicator"
  );
  const callMats = volumes.filter(
    (entry) => entry.role === "elevator_call_mat"
  );
  const thresholds = volumes.filter(
    (entry) => entry.role === "elevator_threshold"
  );
  const occupancies = volumes.filter(
    (entry) => entry.role === "elevator_car_occupancy"
  );
  const elevatorDoors = doors.all.filter(
    (door) =>
      door.doorClass === "elevator_landing" ||
      door.doorClass === "elevator_car"
  );
  const elevatorLinks = source.links.filter(
    (link) => link.kind === "elevator"
  );
  if (
    controllers.length === 0 &&
    cars.length === 0 &&
    stops.length === 0 &&
    passengerOrigins.length === 0 &&
    waits.length === 0 &&
    gates.length === 0 &&
    callIndicators.length === 0 &&
    callMats.length === 0 &&
    thresholds.length === 0 &&
    occupancies.length === 0 &&
    elevatorDoors.length === 0 &&
    elevatorLinks.length === 0
  ) {
    const all = Object.freeze([]) as readonly StageElevatorAsset[];
    return Object.freeze({
      all,
      getById: (_id: string) => null
    });
  }

  const claims = new Map<string, string>();
  const linkClaims = new Map<string, string>();
  const usedCarVisuals = new Set<Mesh>();
  const usedCarColliders = new Set<Mesh>();
  const usedGateColliders = new Set<Mesh>();
  const usedCallIndicatorVisuals = new Set<Mesh>();
  const linksById = new Map(source.links.map((link) => [link.id, link]));
  const assets: StageElevatorAsset[] = [];

  const requireMarker = (
    entries: readonly AuthoredDynamicMarker[],
    id: string,
    owner: string,
    role: DynamicStageMarkerRole
  ): AuthoredDynamicMarker => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw new Error(
        `${owner}の参照が${role}へ解決できません: ${id}`
      );
    }
    claimComponent(claims, entry.id, owner);
    return entry;
  };

  const requireVolume = (
    entries: readonly AuthoredDynamicVolume[],
    id: string,
    owner: string,
    role: DynamicStageVolumeRole
  ): AuthoredDynamicVolume => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw new Error(
        `${owner}の参照が${role}へ解決できません: ${id}`
      );
    }
    claimComponent(claims, entry.id, owner);
    return entry;
  };

  for (const controller of controllers) {
    const linkId = requireIdValue(
      controller.node.name,
      controller.extras,
      "hs_link_id"
    );
    const link = linksById.get(linkId);
    if (!link || link.kind !== "elevator") {
      throw new Error(
        `elevatorのhs_link_idはelevator StageLinkPairへ解決する必要があります: ${controller.node.name}.${linkId}`
      );
    }
    claimComponent(linkClaims, link.id, controller.id);

    const carId = requireIdValue(
      controller.node.name,
      controller.extras,
      "hs_car_id"
    );
    const car = requireMarker(cars, carId, controller.id, "elevator_car");
    if (
      requireIdValue(car.node.name, car.extras, "hs_elevator_id") !==
      controller.id
    ) {
      throw new Error(
        `elevatorとelevator_carの相互参照が一致しません: ${controller.id}.${car.id}`
      );
    }

    const carDoorId = requireIdValue(
      controller.node.name,
      controller.extras,
      "hs_car_door_id"
    );
    const carDoor = doors.getById(carDoorId);
    if (
      !carDoor ||
      carDoor.doorClass !== "elevator_car" ||
      carDoor.elevatorId !== controller.id
    ) {
      throw new Error(
        `elevatorのcar door参照が一致しません: ${controller.id}.${carDoorId}`
      );
    }
    claimComponent(claims, carDoor.id, controller.id);
    requireDescendant(carDoor.node, car.node, "elevator_car door");

    const occupancyId = requireIdValue(
      controller.node.name,
      controller.extras,
      "hs_occupancy_id"
    );
    const occupancy = requireVolume(
      occupancies,
      occupancyId,
      controller.id,
      "elevator_car_occupancy"
    );
    if (
      requireIdValue(
        occupancy.mesh.name,
        occupancy.extras,
        "hs_elevator_id"
      ) !== controller.id
    ) {
      throw new Error(
        `elevatorとcar occupancyの相互参照が一致しません: ${controller.id}.${occupancy.id}`
      );
    }
    requireDescendant(occupancy.mesh, car.node, "elevator car occupancy");

    const passengerOriginId = requireIdValue(
      controller.node.name,
      controller.extras,
      "hs_passenger_origin_id"
    );
    const passengerOrigin = requireMarker(
      passengerOrigins,
      passengerOriginId,
      controller.id,
      "elevator_passenger_origin"
    );
    if (
      requireIdValue(
        passengerOrigin.node.name,
        passengerOrigin.extras,
        "hs_elevator_id"
      ) !== controller.id
    ) {
      throw new Error(
        `elevatorとpassenger originの相互参照が一致しません: ${controller.id}.${passengerOrigin.id}`
      );
    }
    requireDescendant(
      passengerOrigin.node,
      car.node,
      "elevator passenger origin"
    );

    const carVisuals = source.visualMeshes.filter(
      (mesh) =>
        mesh.parent === car.node && mesh.name.startsWith("VIS_ElevatorCar_")
    );
    const carColliders = source.normalColliders.filter(
      (mesh) =>
        mesh.parent === car.node && mesh.name.startsWith("COL_ElevatorCar_")
    );
    if (carVisuals.length === 0 || carColliders.length === 0) {
      throw new Error(
        `elevator_car直下にはVIS_ElevatorCar_*とCOL_ElevatorCar_*が各1件以上必要です: ${car.node.name}`
      );
    }
    for (const mesh of [...carVisuals, ...carColliders]) {
      assertNoHsProperties(mesh);
    }
    carVisuals.forEach((mesh) => usedCarVisuals.add(mesh));
    carColliders.forEach((mesh) => usedCarColliders.add(mesh));

    const ownedStops = stops.filter(
      (stop) =>
        requireIdValue(
          stop.node.name,
          stop.extras,
          "hs_elevator_id"
        ) === controller.id
    );
    if (ownedStops.length !== 2) {
      throw new Error(
        `elevatorはstopを正確に2件所有する必要があります: ${controller.id}.${ownedStops.length}`
      );
    }
    ownedStops.forEach((stop) =>
      claimComponent(claims, stop.id, controller.id)
    );

    const stopAssets: StageElevatorStopAsset[] = [];
    for (const stop of ownedStops) {
      const stopLinkId = requireIdValue(
        stop.node.name,
        stop.extras,
        "hs_link_id"
      );
      if (stopLinkId !== linkId) {
        throw new Error(
          `elevatorとstopのhs_link_idが一致しません: ${controller.id}.${stop.id}`
        );
      }
      const endpoint = requireEnum(
        stop.node.name,
        stop.extras,
        "hs_endpoint",
        ["A", "B"] as const
      );
      const floorIndex = requireFloorIndex(stop.node.name, stop.extras);
      if (
        (floorIndex === 1 && endpoint !== "A") ||
        (floorIndex === 4 && endpoint !== "B")
      ) {
        throw new Error(
          `elevator stopは1階=A、4階=Bが必要です: ${stop.node.name}`
        );
      }

      const landingDoorId = requireIdValue(
        stop.node.name,
        stop.extras,
        "hs_landing_door_id"
      );
      const landingDoor = doors.getById(landingDoorId);
      if (
        !landingDoor ||
        landingDoor.doorClass !== "elevator_landing" ||
        landingDoor.elevatorId !== controller.id ||
        landingDoor.stopId !== stop.id
      ) {
        throw new Error(
          `elevator stopのlanding door参照が一致しません: ${stop.id}.${landingDoorId}`
        );
      }
      claimComponent(claims, landingDoor.id, stop.id);

      const callMat = requireVolume(
        callMats,
        requireIdValue(
          stop.node.name,
          stop.extras,
          "hs_call_mat_id"
        ),
        stop.id,
        "elevator_call_mat"
      );
      const threshold = requireVolume(
        thresholds,
        requireIdValue(
          stop.node.name,
          stop.extras,
          "hs_threshold_id"
        ),
        stop.id,
        "elevator_threshold"
      );
      const gate = requireMarker(
        gates,
        requireIdValue(stop.node.name, stop.extras, "hs_gate_id"),
        stop.id,
        "elevator_human_gate"
      );
      const wait = requireMarker(
        waits,
        requireIdValue(stop.node.name, stop.extras, "hs_wait_id"),
        stop.id,
        "elevator_wait"
      );
      const callIndicator = requireMarker(
        callIndicators,
        requireIdValue(
          stop.node.name,
          stop.extras,
          "hs_call_indicator_id"
        ),
        stop.id,
        "elevator_call_indicator"
      );

      for (const component of [
        callMat,
        threshold,
        gate,
        wait,
        callIndicator
      ]) {
        if (
          requireIdValue(
            "node" in component
              ? component.node.name
              : component.mesh.name,
            component.extras,
            "hs_elevator_id"
          ) !== controller.id ||
          requireIdValue(
            "node" in component
              ? component.node.name
              : component.mesh.name,
            component.extras,
            "hs_stop_id"
          ) !== stop.id
        ) {
          throw new Error(
            `elevator stop付随物の相互参照が一致しません: ${stop.id}.${component.id}`
          );
        }
      }

      const gateColliders = source.humanOnlyColliders.filter(
        (mesh) =>
          mesh.parent === gate.node &&
          mesh.name.startsWith("COL_HumanOnly_ElevatorGate_")
      );
      if (gateColliders.length !== 1) {
        throw new Error(
          `elevator_human_gate直下にはCOL_HumanOnly_ElevatorGate_*が正確に1件必要です: ${gate.node.name}`
        );
      }
      assertNoHsProperties(gateColliders[0]);
      usedGateColliders.add(gateColliders[0]);

      requireDescendant(
        callIndicator.node,
        stop.node,
        "elevator call indicator"
      );
      const direction = requireEnum(
        callIndicator.node.name,
        callIndicator.extras,
        "hs_direction",
        ["up", "down"] as const
      );
      const expectedDirection = floorIndex === 1 ? "up" : "down";
      if (direction !== expectedDirection) {
        throw new Error(
          `elevator call indicatorは1階=up、4階=downが必要です: ${callIndicator.node.name}.${direction}`
        );
      }
      const baseMeshes = source.visualMeshes.filter(
        (mesh) =>
          mesh.parent === callIndicator.node &&
          mesh.name.startsWith("VIS_ElevatorCallIndicator_Base_")
      );
      const directionMeshes = source.visualMeshes.filter(
        (mesh) =>
          mesh.parent === callIndicator.node &&
          mesh.name.startsWith("VIS_ElevatorCallIndicator_Direction_")
      );
      if (baseMeshes.length !== 1 || directionMeshes.length !== 1) {
        throw new Error(
          `elevator_call_indicator直下にはBaseとDirection表示Meshが各1件必要です: ${callIndicator.node.name}`
        );
      }
      for (const mesh of [...baseMeshes, ...directionMeshes]) {
        assertNoHsProperties(mesh);
        usedCallIndicatorVisuals.add(mesh);
      }

      stopAssets.push(
        Object.freeze({
          id: stop.id,
          node: stop.node,
          floorIndex,
          endpoint,
          landingDoor,
          callMat: Object.freeze({
            id: callMat.id,
            role: "elevator_call_mat",
            mesh: callMat.mesh
          }),
          threshold: Object.freeze({
            id: threshold.id,
            role: "elevator_threshold",
            mesh: threshold.mesh
          }),
          humanGate: Object.freeze({
            id: gate.id,
            node: gate.node,
            collider: gateColliders[0]
          }),
          wait: Object.freeze({
            id: wait.id,
            node: wait.node
          }),
          callIndicator: Object.freeze({
            id: callIndicator.id,
            node: callIndicator.node,
            direction,
            baseMesh: baseMeshes[0],
            directionMesh: directionMeshes[0]
          })
        })
      );
    }

    stopAssets.sort((left, right) => left.floorIndex - right.floorIndex);
    if (
      stopAssets[0]?.floorIndex !== 1 ||
      stopAssets[1]?.floorIndex !== 4
    ) {
      throw new Error(
        `elevator stopは1階と4階を各1件必要です: ${controller.id}`
      );
    }
    const firstAuthored = ownedStops.find(
      (stop) => requireFloorIndex(stop.node.name, stop.extras) === 1
    )!;
    const fourthAuthored = ownedStops.find(
      (stop) => requireFloorIndex(stop.node.name, stop.extras) === 4
    )!;
    assertElevatorStopTransforms(firstAuthored, fourthAuthored);

    const initialStopId = requireIdValue(
      controller.node.name,
      controller.extras,
      "hs_initial_stop_id"
    );
    const initialStop = stopAssets.find((stop) => stop.id === initialStopId);
    if (!initialStop || initialStop.floorIndex !== 4) {
      throw new Error(
        `elevatorの初期stopは4階が必要です: ${controller.node.name}.${initialStopId}`
      );
    }
    assertSameWorldPose(car.node, initialStop.node, "elevator car初期stop");

    const typedStops = stopAssets as [
      StageElevatorStopAsset,
      StageElevatorStopAsset
    ];
    const carAsset: StageElevatorCarAsset = Object.freeze({
      id: car.id,
      node: car.node,
      visualMeshes: Object.freeze([...carVisuals]),
      colliderMeshes: Object.freeze([...carColliders]),
      door: carDoor,
      occupancy: Object.freeze({
        id: occupancy.id,
        role: "elevator_car_occupancy",
        mesh: occupancy.mesh
      }),
      passengerOriginId: passengerOrigin.id,
      passengerOriginNode: passengerOrigin.node
    });
    assets.push(
      Object.freeze({
        id: controller.id,
        node: controller.node,
        link,
        car: carAsset,
        stops: Object.freeze(typedStops),
        initialStop,
      })
    );
  }

  assertAllClaimed("elevator_car", cars, claims);
  assertAllClaimed("elevator_stop", stops, claims);
  assertAllClaimed("elevator_passenger_origin", passengerOrigins, claims);
  assertAllClaimed("elevator_wait", waits, claims);
  assertAllClaimed("elevator_human_gate", gates, claims);
  assertAllClaimed("elevator_call_indicator", callIndicators, claims);
  assertAllClaimed("elevator_call_mat", callMats, claims);
  assertAllClaimed("elevator_threshold", thresholds, claims);
  assertAllClaimed("elevator_car_occupancy", occupancies, claims);
  assertAllClaimed("elevator door", elevatorDoors, claims);
  assertAllClaimed("elevator link", elevatorLinks, linkClaims);

  const orphanCarVisual = source.visualMeshes.find(
    (mesh) =>
      mesh.name.startsWith("VIS_ElevatorCar_") &&
      !usedCarVisuals.has(mesh)
  );
  if (orphanCarVisual) {
    throw new Error(
      `elevator car表示Meshが孤立しています: ${orphanCarVisual.name}`
    );
  }
  const orphanCallIndicatorVisual = source.visualMeshes.find(
    (mesh) =>
      mesh.name.startsWith("VIS_ElevatorCallIndicator_") &&
      !usedCallIndicatorVisuals.has(mesh)
  );
  if (orphanCallIndicatorVisual) {
    throw new Error(
      `elevator call indicator表示Meshが孤立しています: ${orphanCallIndicatorVisual.name}`
    );
  }
  const orphanCarCollider = source.normalColliders.find(
    (mesh) =>
      mesh.name.startsWith("COL_ElevatorCar_") &&
      !usedCarColliders.has(mesh)
  );
  if (orphanCarCollider) {
    throw new Error(
      `elevator car Colliderが孤立しています: ${orphanCarCollider.name}`
    );
  }
  const orphanGateCollider = source.humanOnlyColliders.find(
    (mesh) =>
      mesh.name.startsWith("COL_HumanOnly_ElevatorGate_") &&
      !usedGateColliders.has(mesh)
  );
  if (orphanGateCollider) {
    throw new Error(
      `elevator人物gate Colliderが孤立しています: ${orphanGateCollider.name}`
    );
  }

  const all = Object.freeze(assets);
  const byId = new Map(all.map((asset) => [asset.id, asset]));
  return Object.freeze({
    all,
    getById: (id: string) => byId.get(id) ?? null
  });
};

const collectDynamicIds = (
  markers: readonly AuthoredDynamicMarker[],
  volumes: readonly AuthoredDynamicVolume[],
  links: readonly StageLinkPair[]
): void => {
  const owners = new Map<string, string>();
  for (const link of links) {
    if (owners.has(link.id)) {
      throw new Error(`動的資産入力のlink IDが重複しています: ${link.id}`);
    }
    owners.set(link.id, `LNK_${link.id}_A/B`);
  }
  for (const entry of [...markers, ...volumes]) {
    const owner = owners.get(entry.id);
    const objectName = "node" in entry ? entry.node.name : entry.mesh.name;
    if (owner) {
      throw new Error(
        `動的資産のhs_idが既存link IDと重複しています: ${entry.id} (${owner}, ${objectName})`
      );
    }
    owners.set(entry.id, objectName);
  }
};

export const createStageDoorAssetRegistry = (
  source: StageDynamicAssetRegistrySource
): StageDoorAssetRegistry => {
  const markers = collectDynamicMarkers(source.markerNodes);
  const volumes = collectDynamicVolumes(source.volumeMeshes);
  assertUniqueEntries(markers, volumes);
  return createDoorRegistry(source, markers, volumes);
};

export const createStageElevatorAssetRegistry = (
  source: StageDynamicAssetRegistrySource,
  doors: StageDoorAssetRegistry
): StageElevatorAssetRegistry => {
  const markers = collectDynamicMarkers(source.markerNodes);
  const volumes = collectDynamicVolumes(source.volumeMeshes);
  assertUniqueEntries(markers, volumes);
  return createElevatorRegistry(source, markers, volumes, doors);
};

export const createStageDynamicAssetRegistries = (
  source: StageDynamicAssetRegistrySource
): StageDynamicAssetRegistries => {
  const markers = collectDynamicMarkers(source.markerNodes);
  const volumes = collectDynamicVolumes(source.volumeMeshes);
  assertUniqueEntries(markers, volumes);
  collectDynamicIds(markers, volumes, source.links);
  const doors = createDoorRegistry(source, markers, volumes);
  const elevators = createElevatorRegistry(
    source,
    markers,
    volumes,
    doors
  );
  return Object.freeze({ doors, elevators });
};
