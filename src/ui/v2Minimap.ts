import {
  Frustum,
  Vector3,
  VertexBuffer,
  type Camera,
  type Mesh
} from "@babylonjs/core";

import type { StageElevatorSnapshot } from "../world/stageElevatorRuntime";
import type {
  StageElevatorLanding,
  StageFloorMap,
  StageLocationAreaHit,
  StageLocationAssetRegistry,
  StageLocationFloorId,
  StageStairLandingDirection
} from "../world/stageLocationAssets";
import type { StageSpatialQueries } from "../world/stageSpatialQueries";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import type { V2MinimapActorSnapshot } from "../v2/survivalRuntime";

const MINIMAP_SIZE_CSS_PX = 180;
const MINIMAP_RADIUS_CSS_PX = MINIMAP_SIZE_CSS_PX / 2;
export const V2_MINIMAP_RANGE_METERS = 18;
export const V2_MINIMAP_VIEW_CONE_RANGE_METERS = 12;
const MINIMAP_RANGE_WORLD_UNITS =
  V2_MINIMAP_RANGE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const MINIMAP_VIEW_CONE_RANGE_WORLD_UNITS =
  V2_MINIMAP_VIEW_CONE_RANGE_METERS * BLENDER_METERS_TO_WORLD_UNITS;
const MINIMAP_SCALE_CSS_PX_PER_WORLD_UNIT =
  MINIMAP_RADIUS_CSS_PX / MINIMAP_RANGE_WORLD_UNITS;
const MINIMAP_VIEW_CONE_RADIUS_CSS_PX =
  MINIMAP_VIEW_CONE_RANGE_WORLD_UNITS *
  MINIMAP_SCALE_CSS_PX_PER_WORLD_UNIT;
const VISIBILITY_REFRESH_SECONDS = 0.1;
const HORIZONTAL_EPSILON = 1.0e-8;

const MAP_BACKGROUND_COLOR = "#1b1b1b";
const MAP_BLOCKED_COLOR = "#050505";
export const V2_MINIMAP_FLOOR_COLORS = Object.freeze({
  f01: "#d5b83f",
  f02: "#4fa968",
  f03: "#c95a5a",
  f04: "#527bc5",
  roof: "#898f98"
} satisfies Readonly<Record<StageLocationFloorId, string>>);
const PLAYER_COLOR = "#ffffff";
const NPC_COLOR = "#f4d35e";
const BIT_COLOR = "#ff7657";
const FOLLOWER_COLOR = "#66e8ff";
const MISSION_COLOR = "#ff68d4";
const ELEVATOR_AVAILABLE_COLOR = "#7fe38d";
const ELEVATOR_UNAVAILABLE_COLOR = "#666666";
const STAIR_COLOR = "#f5f5f5";

export type V2MinimapActorMarkerKind =
  | "npc"
  | "bit"
  | "follower"
  | "mission-actor";

export type V2MinimapActorMarker = Readonly<{
  id: string;
  kind: V2MinimapActorMarkerKind;
  position: Vector3;
}>;

export type V2MinimapMissionLocationMarker = Readonly<{
  id: string;
  position: Vector3;
}>;

export type V2MinimapStairMarker = Readonly<{
  id: string;
  direction: StageStairLandingDirection;
  position: Vector3;
}>;

export type V2MinimapElevatorMarker = Readonly<{
  id: string;
  available: boolean;
  displayStop: boolean;
  position: Vector3;
}>;

export type V2MinimapFrame = Readonly<{
  floorId: StageLocationFloorId;
  floorColor: string;
  areaId: string;
  readout: string;
  playerPosition: Vector3;
  forward: Vector3;
  actorMarkers: readonly V2MinimapActorMarker[];
  missionLocationMarkers: readonly V2MinimapMissionLocationMarker[];
  stairMarkers: readonly V2MinimapStairMarker[];
  elevatorMarkers: readonly V2MinimapElevatorMarker[];
}>;

export type V2MinimapUpdate = Readonly<{
  active: boolean;
  elapsedSeconds: number;
  playerFootPosition: Vector3;
  playerEyePosition: Vector3;
  forward: Vector3;
  actors: readonly V2MinimapActorSnapshot[];
  elevators: readonly StageElevatorSnapshot[];
  missionTargetActorIds: readonly string[];
  missionTargetLocationIds: readonly string[];
}>;

export type V2MinimapDiagnostics = Readonly<{
  mapCacheBuildCount: number;
  visibilityRefreshCount: number;
  sightCastCount: number;
  lastSightCandidateCount: number;
}>;

export type V2MinimapControllerOptions = Readonly<{
  canvas: HTMLCanvasElement;
  readout: HTMLElement;
  camera: Camera;
  locationAssets: StageLocationAssetRegistry;
  structuralBlockers: readonly Mesh[];
  queries: StageSpatialQueries;
}>;

export interface V2MinimapController {
  update(update: V2MinimapUpdate): V2MinimapFrame | null;
  getFrame(): V2MinimapFrame | null;
  getDiagnostics(): V2MinimapDiagnostics;
  clear(): void;
  dispose(): void;
}

type FloorMapPath = Readonly<{
  floorId: StageLocationFloorId;
  mapPath: Path2D;
  structuralBlockerPath: Path2D;
}>;

type ResolvedActor = Readonly<{
  snapshot: V2MinimapActorSnapshot;
  floorId: StageLocationFloorId;
  distanceSquared: number;
  missionTarget: boolean;
}>;

const assertFiniteVector = (label: string, value: Vector3): void => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${label}は有限値である必要があります。`);
  }
};

const assertNonNegativeFiniteNumber = (
  label: string,
  value: number
): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}は0以上の有限値である必要があります。`);
  }
};

const normalizeHorizontalForward = (forward: Vector3): Vector3 => {
  assertFiniteVector("ミニマップ進行方向", forward);
  const horizontal = new Vector3(forward.x, 0, forward.z);
  if (horizontal.lengthSquared() <= HORIZONTAL_EPSILON) {
    throw new Error("ミニマップ進行方向の水平成分がありません。");
  }
  return horizontal.normalize();
};

const horizontalDistanceSquared = (
  left: Vector3,
  right: Vector3
): number => {
  const x = left.x - right.x;
  const z = left.z - right.z;
  return x * x + z * z;
};

const requireCanvasContext = (
  canvas: HTMLCanvasElement
): CanvasRenderingContext2D => {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("ミニマップのCanvas 2D contextを取得できません。");
  }
  return context;
};

const MINIMAP_STRUCTURAL_BLOCKER_PREFIXES = Object.freeze([
  "COL_Wall",
  "COL_GymWall",
  "COL_GymStageSideWall",
  "COL_GymStageStairHeadWall",
  "COL_GymStorage_",
  "COL_ToiletStallPartition_",
  "COL_StairStorageShell_",
  "COL_StairClosure_",
  "COL_StairGuard_",
  "COL_Perimeter_",
  "COL_Gate_",
  "COL_PoolBasinWall_",
  "COL_B03_ExteriorWalls_",
  "COL_B03_InteriorWalls_",
  "COL_B03_Interior_Walls_",
  "COL_B03_GymExteriorWalls",
  "COL_B03_ElevatorShaftShell",
  "COL_B03_ElevatorStairWall",
  "COL_B03_GymRoofGapWall",
  "COL_B03_GymStageSideWalls",
  "COL_B03_StairBoundaryCaps_",
  "COL_B03_GymGalleryGuards",
  "COL_B03_GymRoofGuards",
  "COL_B03_GymRoofConnectionGuards"
]);

export const selectV2MinimapStructuralBlockers = (
  colliders: readonly Mesh[]
): readonly Mesh[] =>
  Object.freeze(
    colliders.filter((mesh) =>
      MINIMAP_STRUCTURAL_BLOCKER_PREFIXES.some((prefix) =>
        mesh.name.startsWith(prefix)
      )
    )
  );

const appendProjectedMeshGeometry = (path: Path2D, mesh: Mesh): void => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || positions.length === 0 || !indices || indices.length === 0) {
    throw new Error(`構造コライダーのgeometryがありません: ${mesh.name}`);
  }
  if (indices.length % 3 !== 0) {
    throw new Error(
      `構造コライダーのindex数が三角形単位ではありません: ${mesh.name}`
    );
  }
  const world = mesh.computeWorldMatrix(true);
  const worldPositions: Vector3[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    worldPositions.push(
      Vector3.TransformCoordinates(Vector3.FromArray(positions, index), world)
    );
  }
  for (let index = 0; index < indices.length; index += 3) {
    const first = worldPositions[indices[index]];
    const second = worldPositions[indices[index + 1]];
    const third = worldPositions[indices[index + 2]];
    const projectedArea =
      (second.x - first.x) * (third.z - first.z) -
      (second.z - first.z) * (third.x - first.x);
    if (projectedArea >= -HORIZONTAL_EPSILON) {
      continue;
    }
    path.moveTo(first.x, first.z);
    path.lineTo(second.x, second.z);
    path.lineTo(third.x, third.z);
    path.closePath();
  }
};

const createFloorMapPath = (
  floorMap: StageFloorMap,
  structuralBlockers: readonly Mesh[]
): FloorMapPath => {
  const positions = floorMap.mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = floorMap.mesh.getIndices();
  if (
    !positions ||
    positions.length === 0 ||
    !indices ||
    indices.length === 0
  ) {
    throw new Error(`floor_mapのgeometryがありません: ${floorMap.id}`);
  }
  if (indices.length % 3 !== 0) {
    throw new Error(`floor_mapのindex数が三角形単位ではありません: ${floorMap.id}`);
  }
  const world = floorMap.mesh.computeWorldMatrix(true);
  const mapPath = new Path2D();
  const worldPositions: Vector3[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    worldPositions.push(
      Vector3.TransformCoordinates(Vector3.FromArray(positions, index), world)
    );
  }
  const centerY = floorMap.mesh.getBoundingInfo().boundingBox.centerWorld.y;
  for (let index = 0; index < indices.length; index += 3) {
    const first = worldPositions[indices[index]];
    const second = worldPositions[indices[index + 1]];
    const third = worldPositions[indices[index + 2]];
    const normalY = Vector3.Cross(
      second.subtract(first),
      third.subtract(first)
    ).y;
    const averageY = (first.y + second.y + third.y) / 3;
    if (Math.abs(normalY) <= 1.0e-8 || averageY <= centerY) {
      continue;
    }
    mapPath.moveTo(first.x, first.z);
    mapPath.lineTo(second.x, second.z);
    mapPath.lineTo(third.x, third.z);
    mapPath.closePath();
  }
  const structuralBlockerPath = new Path2D();
  const floorSurfaceY =
    floorMap.mesh.getBoundingInfo().boundingBox.maximumWorld.y;
  const bodyHeightProbeY =
    floorSurfaceY + 1 * BLENDER_METERS_TO_WORLD_UNITS;
  for (const blocker of structuralBlockers) {
    blocker.computeWorldMatrix(true);
    const bounds = blocker.getBoundingInfo().boundingBox;
    if (
      bodyHeightProbeY < bounds.minimumWorld.y ||
      bodyHeightProbeY > bounds.maximumWorld.y
    ) {
      continue;
    }
    appendProjectedMeshGeometry(structuralBlockerPath, blocker);
  }
  return Object.freeze({
    floorId: floorMap.floorId,
    mapPath,
    structuralBlockerPath
  });
};

const requireElevatorDisplayFloor = (
  hit: StageLocationAreaHit,
  elevators: readonly StageElevatorSnapshot[],
  locationAssets: StageLocationAssetRegistry
): StageLocationFloorId => {
  if (hit.floorId !== null) {
    return hit.floorId;
  }
  const elevator = elevators.find(
    (candidate) => candidate.id === hit.elevatorId
  );
  if (!elevator || elevator.displayStopId === null) {
    throw new Error(
      `エレベーターAreaの表示stopを解決できません: ${hit.elevatorId}`
    );
  }
  const landing = locationAssets.elevatorLandings.find(
    (candidate) =>
      candidate.elevatorId === elevator.id &&
      candidate.stop?.id === elevator.displayStopId
  );
  if (!landing) {
    throw new Error(
      `エレベーター表示stopに対応する乗場がありません: ${elevator.id}/${elevator.displayStopId}`
    );
  }
  return landing.floorId;
};

const resolveAreaFloor = (
  hit: StageLocationAreaHit,
  elevators: readonly StageElevatorSnapshot[],
  locationAssets: StageLocationAssetRegistry
): StageLocationFloorId =>
  hit.floorId ??
  requireElevatorDisplayFloor(hit, elevators, locationAssets);

const requireElevatorSnapshot = (
  elevatorId: string,
  elevators: readonly StageElevatorSnapshot[]
): StageElevatorSnapshot => {
  const snapshot = elevators.find((candidate) => candidate.id === elevatorId);
  if (!snapshot) {
    throw new Error(`ミニマップ対象のelevator snapshotがありません: ${elevatorId}`);
  }
  return snapshot;
};

const isLandingDisplayStop = (
  landing: StageElevatorLanding,
  elevators: readonly StageElevatorSnapshot[]
): boolean => {
  const snapshot = requireElevatorSnapshot(landing.elevatorId, elevators);
  return landing.stop !== null && landing.stop.id === snapshot.displayStopId;
};

const freezeFrame = (frame: V2MinimapFrame): V2MinimapFrame =>
  Object.freeze({
    ...frame,
    playerPosition: frame.playerPosition.clone(),
    forward: frame.forward.clone(),
    actorMarkers: Object.freeze(frame.actorMarkers),
    missionLocationMarkers: Object.freeze(frame.missionLocationMarkers),
    stairMarkers: Object.freeze(frame.stairMarkers),
    elevatorMarkers: Object.freeze(frame.elevatorMarkers)
  });

export const projectV2MinimapPoint = (
  position: Vector3,
  playerPosition: Vector3,
  forward: Vector3
): Readonly<{ x: number; y: number }> => {
  const offsetX = position.x - playerPosition.x;
  const offsetZ = position.z - playerPosition.z;
  return Object.freeze({
    x:
      MINIMAP_RADIUS_CSS_PX +
      (forward.z * offsetX - forward.x * offsetZ) *
        MINIMAP_SCALE_CSS_PX_PER_WORLD_UNIT,
    y:
      MINIMAP_RADIUS_CSS_PX -
      (forward.x * offsetX + forward.z * offsetZ) *
        MINIMAP_SCALE_CSS_PX_PER_WORLD_UNIT
  });
};

const drawCircleMarker = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void => {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = "#111111";
  context.stroke();
};

const drawDiamondMarker = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string
): void => {
  context.beginPath();
  context.moveTo(x, y - 5);
  context.lineTo(x + 5, y);
  context.lineTo(x, y + 5);
  context.lineTo(x - 5, y);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = "#111111";
  context.stroke();
};

const drawStairMarker = (
  context: CanvasRenderingContext2D,
  marker: V2MinimapStairMarker,
  playerPosition: Vector3,
  forward: Vector3
): void => {
  const point = projectV2MinimapPoint(marker.position, playerPosition, forward);
  context.save();
  context.translate(point.x, point.y);
  context.strokeStyle = STAIR_COLOR;
  context.fillStyle = MAP_BACKGROUND_COLOR;
  context.lineWidth = 1.5;
  context.strokeRect(-5, -5, 10, 10);
  context.beginPath();
  if (marker.direction === "up" || marker.direction === "both") {
    context.moveTo(-2, 2);
    context.lineTo(0, -2);
    context.lineTo(2, 2);
  }
  if (marker.direction === "down" || marker.direction === "both") {
    context.moveTo(-2, -2);
    context.lineTo(0, 2);
    context.lineTo(2, -2);
  }
  context.stroke();
  context.restore();
};

const drawElevatorMarker = (
  context: CanvasRenderingContext2D,
  marker: V2MinimapElevatorMarker,
  playerPosition: Vector3,
  forward: Vector3
): void => {
  const point = projectV2MinimapPoint(marker.position, playerPosition, forward);
  context.save();
  context.translate(point.x, point.y);
  context.fillStyle = marker.available
    ? ELEVATOR_AVAILABLE_COLOR
    : ELEVATOR_UNAVAILABLE_COLOR;
  context.fillRect(-5, -5, 10, 10);
  context.lineWidth = marker.displayStop ? 2.5 : 1.5;
  context.strokeStyle = marker.displayStop ? PLAYER_COLOR : "#111111";
  context.strokeRect(-5, -5, 10, 10);
  context.fillStyle = "#111111";
  context.font = "bold 8px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("E", 0, 0.5);
  context.restore();
};

const renderFrame = (
  context: CanvasRenderingContext2D,
  devicePixelRatio: number,
  floorPaths: FloorMapPath,
  frame: V2MinimapFrame
): void => {
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, MINIMAP_SIZE_CSS_PX, MINIMAP_SIZE_CSS_PX);
  context.save();
  context.beginPath();
  context.arc(
    MINIMAP_RADIUS_CSS_PX,
    MINIMAP_RADIUS_CSS_PX,
    MINIMAP_RADIUS_CSS_PX - 1,
    0,
    Math.PI * 2
  );
  context.clip();
  context.fillStyle = MAP_BACKGROUND_COLOR;
  context.fillRect(0, 0, MINIMAP_SIZE_CSS_PX, MINIMAP_SIZE_CSS_PX);

  context.save();
  const scale = MINIMAP_SCALE_CSS_PX_PER_WORLD_UNIT;
  const a = frame.forward.z * scale;
  const b = -frame.forward.x * scale;
  const c = -frame.forward.x * scale;
  const d = -frame.forward.z * scale;
  const e =
    MINIMAP_RADIUS_CSS_PX -
    a * frame.playerPosition.x -
    c * frame.playerPosition.z;
  const f =
    MINIMAP_RADIUS_CSS_PX -
    b * frame.playerPosition.x -
    d * frame.playerPosition.z;
  context.transform(a, b, c, d, e, f);
  context.fillStyle = frame.floorColor;
  context.globalAlpha = 0.82;
  context.fill(floorPaths.mapPath);
  context.fillStyle = MAP_BLOCKED_COLOR;
  context.globalAlpha = 1;
  context.fill(floorPaths.structuralBlockerPath);
  context.restore();

  context.beginPath();
  context.moveTo(MINIMAP_RADIUS_CSS_PX, MINIMAP_RADIUS_CSS_PX);
  context.arc(
    MINIMAP_RADIUS_CSS_PX,
    MINIMAP_RADIUS_CSS_PX,
    MINIMAP_VIEW_CONE_RADIUS_CSS_PX,
    -Math.PI / 2 - Math.PI / 6,
    -Math.PI / 2 + Math.PI / 6
  );
  context.closePath();
  context.fillStyle = "rgba(255, 255, 255, 0.14)";
  context.fill();

  for (const marker of frame.stairMarkers) {
    drawStairMarker(context, marker, frame.playerPosition, frame.forward);
  }
  for (const marker of frame.elevatorMarkers) {
    drawElevatorMarker(context, marker, frame.playerPosition, frame.forward);
  }
  for (const marker of frame.missionLocationMarkers) {
    const point = projectV2MinimapPoint(
      marker.position,
      frame.playerPosition,
      frame.forward
    );
    drawDiamondMarker(context, point.x, point.y, MISSION_COLOR);
  }
  for (const marker of frame.actorMarkers) {
    const point = projectV2MinimapPoint(
      marker.position,
      frame.playerPosition,
      frame.forward
    );
    const color =
      marker.kind === "follower"
        ? FOLLOWER_COLOR
        : marker.kind === "mission-actor"
          ? MISSION_COLOR
          : marker.kind === "npc"
            ? NPC_COLOR
            : BIT_COLOR;
    drawCircleMarker(context, point.x, point.y, 3.5, color);
  }

  context.beginPath();
  context.moveTo(MINIMAP_RADIUS_CSS_PX, MINIMAP_RADIUS_CSS_PX - 8);
  context.lineTo(MINIMAP_RADIUS_CSS_PX + 6, MINIMAP_RADIUS_CSS_PX + 6);
  context.lineTo(MINIMAP_RADIUS_CSS_PX - 6, MINIMAP_RADIUS_CSS_PX + 6);
  context.closePath();
  context.fillStyle = PLAYER_COLOR;
  context.fill();
  context.strokeStyle = "#111111";
  context.lineWidth = 1.5;
  context.stroke();

  const north = projectV2MinimapPoint(
    frame.playerPosition.add(new Vector3(0, 0, -1)),
    frame.playerPosition,
    frame.forward
  );
  const northOffsetX = north.x - MINIMAP_RADIUS_CSS_PX;
  const northOffsetY = north.y - MINIMAP_RADIUS_CSS_PX;
  const northLength = Math.hypot(northOffsetX, northOffsetY);
  context.fillStyle = PLAYER_COLOR;
  context.font = "bold 12px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    "N",
    MINIMAP_RADIUS_CSS_PX + (northOffsetX / northLength) * 75,
    MINIMAP_RADIUS_CSS_PX + (northOffsetY / northLength) * 75
  );
  context.restore();

  context.beginPath();
  context.arc(
    MINIMAP_RADIUS_CSS_PX,
    MINIMAP_RADIUS_CSS_PX,
    MINIMAP_RADIUS_CSS_PX - 1,
    0,
    Math.PI * 2
  );
  context.strokeStyle = "#111111";
  context.lineWidth = 2;
  context.stroke();
};

export const createV2MinimapController = ({
  canvas,
  readout,
  camera,
  locationAssets,
  structuralBlockers,
  queries
}: V2MinimapControllerOptions): V2MinimapController => {
  const context = requireCanvasContext(canvas);
  const mapPaths = Object.freeze(
    locationAssets.floorMaps.map((floorMap) =>
      createFloorMapPath(floorMap, structuralBlockers)
    )
  );
  if (mapPaths.length !== 5) {
    throw new Error(`ミニマップの階別cacheは5件必要です: ${mapPaths.length}`);
  }
  const mapPathByFloorId = new Map(
    mapPaths.map((entry) => [entry.floorId, entry] as const)
  );
  let disposed = false;
  let frame: V2MinimapFrame | null = null;
  let lastVisibilityRefreshSeconds = Number.NEGATIVE_INFINITY;
  let directlyVisibleActorIds: ReadonlySet<string> = new Set<string>();
  let visibilityRefreshCount = 0;
  let sightCastCount = 0;
  let lastSightCandidateCount = 0;
  let currentDevicePixelRatio = 0;

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2ミニマップは使用できません。");
    }
  };

  const resizeCanvas = () => {
    const nextDevicePixelRatio = window.devicePixelRatio;
    if (nextDevicePixelRatio === currentDevicePixelRatio) {
      return;
    }
    currentDevicePixelRatio = nextDevicePixelRatio;
    canvas.width = Math.round(MINIMAP_SIZE_CSS_PX * nextDevicePixelRatio);
    canvas.height = Math.round(MINIMAP_SIZE_CSS_PX * nextDevicePixelRatio);
  };

  const clear = () => {
    assertActive();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = "none";
    readout.style.display = "none";
    readout.textContent = "";
    frame = null;
    directlyVisibleActorIds = new Set<string>();
    lastVisibilityRefreshSeconds = Number.NEGATIVE_INFINITY;
  };

  resizeCanvas();
  clear();

  return {
    update: (update) => {
      assertActive();
      assertNonNegativeFiniteNumber(
        "ミニマップelapsedSeconds",
        update.elapsedSeconds
      );
      assertFiniteVector("ミニマップplayer foot", update.playerFootPosition);
      assertFiniteVector("ミニマップplayer eye", update.playerEyePosition);
      if (!update.active) {
        clear();
        return null;
      }
      resizeCanvas();
      const forward = normalizeHorizontalForward(update.forward);
      const playerAreaHit = locationAssets.findArea(update.playerFootPosition);
      if (!playerAreaHit) {
        throw new Error("プレイヤー位置に対応するlocation_areaがありません。");
      }
      const floorId = resolveAreaFloor(
        playerAreaHit,
        update.elevators,
        locationAssets
      );
      const floorMap = locationAssets.getFloorMap(floorId);
      if (!floorMap) {
        throw new Error(`現在階のfloor_mapがありません: ${floorId}`);
      }
      const mapPath = mapPathByFloorId.get(floorId);
      if (!mapPath) {
        throw new Error(`現在階のミニマップcacheがありません: ${floorId}`);
      }
      const missionActorIds = new Set(update.missionTargetActorIds);
      const missionLocationIds = new Set(update.missionTargetLocationIds);
      const rangeSquared =
        MINIMAP_RANGE_WORLD_UNITS * MINIMAP_RANGE_WORLD_UNITS;
      const resolvedActors: ResolvedActor[] = [];
      for (const actor of update.actors) {
        assertFiniteVector(
          `ミニマップActor Area位置 ${actor.id}`,
          actor.areaPosition
        );
        assertFiniteVector(
          `ミニマップActor視認位置 ${actor.id}`,
          actor.sightPosition
        );
        const distanceSquared = horizontalDistanceSquared(
          actor.areaPosition,
          update.playerFootPosition
        );
        if (distanceSquared > rangeSquared) {
          continue;
        }
        const areaHit = locationAssets.findArea(actor.areaPosition);
        if (!areaHit) {
          continue;
        }
        const actorFloorId = resolveAreaFloor(
          areaHit,
          update.elevators,
          locationAssets
        );
        if (actorFloorId !== floorId) {
          continue;
        }
        resolvedActors.push(
          Object.freeze({
            snapshot: actor,
            floorId: actorFloorId,
            distanceSquared,
            missionTarget: missionActorIds.has(actor.id)
          })
        );
      }

      if (
        update.elapsedSeconds - lastVisibilityRefreshSeconds >=
        VISIBILITY_REFRESH_SECONDS
      ) {
        const frustumPlanes = Frustum.GetPlanes(
          camera.getTransformationMatrix()
        );
        const sightCandidates = resolvedActors.filter(
          (actor) =>
            !actor.snapshot.follower &&
            !actor.missionTarget &&
            Frustum.IsPointInFrustum(
              actor.snapshot.sightPosition,
              frustumPlanes
            )
        );
        const nextDirectlyVisibleActorIds = new Set<string>();
        for (const actor of sightCandidates) {
          sightCastCount += 1;
          if (
            queries.castSightSegment(
              update.playerEyePosition,
              actor.snapshot.sightPosition
            ) === null
          ) {
            nextDirectlyVisibleActorIds.add(actor.snapshot.id);
          }
        }
        directlyVisibleActorIds = nextDirectlyVisibleActorIds;
        lastVisibilityRefreshSeconds = update.elapsedSeconds;
        visibilityRefreshCount += 1;
        lastSightCandidateCount = sightCandidates.length;
      }

      const actorMarkers = Object.freeze(
        resolvedActors
          .filter(
            (actor) =>
              actor.snapshot.follower ||
              actor.missionTarget ||
              directlyVisibleActorIds.has(actor.snapshot.id)
          )
          .map((actor): V2MinimapActorMarker =>
            Object.freeze({
              id: actor.snapshot.id,
              kind: actor.missionTarget
                ? "mission-actor"
                : actor.snapshot.follower
                  ? "follower"
                  : actor.snapshot.kind,
              position: actor.snapshot.areaPosition.clone()
            })
          )
          .sort((left, right) => left.id.localeCompare(right.id))
      );

      const missionLocationMarkers = Object.freeze(
        [...missionLocationIds]
          .map((id): V2MinimapMissionLocationMarker | null => {
            const location = locationAssets.getMissionLocationById(id);
            if (!location) {
              throw new Error(`未登録のMission Location IDです: ${id}`);
            }
            location.anchorNode.computeWorldMatrix(true);
            const position = location.anchorNode.getAbsolutePosition().clone();
            if (
              location.floorId !== floorId ||
              horizontalDistanceSquared(position, update.playerFootPosition) >
                rangeSquared
            ) {
              return null;
            }
            return Object.freeze({ id: location.id, position });
          })
          .filter(
            (marker): marker is V2MinimapMissionLocationMarker =>
              marker !== null
          )
          .sort((left, right) => left.id.localeCompare(right.id))
      );

      const stairMarkers = Object.freeze(
        locationAssets.stairLandings
          .filter((landing) => landing.floorId === floorId)
          .map((landing): V2MinimapStairMarker | null => {
            landing.node.computeWorldMatrix(true);
            const position = landing.node.getAbsolutePosition().clone();
            return horizontalDistanceSquared(
              position,
              update.playerFootPosition
            ) <= rangeSquared
              ? Object.freeze({
                  id: landing.id,
                  direction: landing.direction,
                  position
                })
              : null;
          })
          .filter(
            (marker): marker is V2MinimapStairMarker => marker !== null
          )
          .sort((left, right) => left.id.localeCompare(right.id))
      );

      const elevatorMarkers = Object.freeze(
        locationAssets.elevatorLandings
          .filter((landing) => landing.floorId === floorId)
          .map((landing): V2MinimapElevatorMarker | null => {
            landing.node.computeWorldMatrix(true);
            const position = landing.node.getAbsolutePosition().clone();
            return horizontalDistanceSquared(
              position,
              update.playerFootPosition
            ) <= rangeSquared
              ? Object.freeze({
                  id: landing.id,
                  available: landing.available,
                  displayStop: isLandingDisplayStop(
                    landing,
                    update.elevators
                  ),
                  position
                })
              : null;
          })
          .filter(
            (marker): marker is V2MinimapElevatorMarker => marker !== null
          )
          .sort((left, right) => left.id.localeCompare(right.id))
      );

      const readoutText = `${floorMap.displayName} ${playerAreaHit.area.displayName}`;
      frame = freezeFrame({
        floorId,
        floorColor: V2_MINIMAP_FLOOR_COLORS[floorId],
        areaId: playerAreaHit.area.id,
        readout: readoutText,
        playerPosition: update.playerFootPosition,
        forward,
        actorMarkers,
        missionLocationMarkers,
        stairMarkers,
        elevatorMarkers
      });
      canvas.style.display = "block";
      readout.style.display = "block";
      readout.textContent = readoutText;
      renderFrame(context, currentDevicePixelRatio, mapPath, frame);
      return frame;
    },
    getFrame: () => {
      assertActive();
      return frame;
    },
    getDiagnostics: () => {
      assertActive();
      return Object.freeze({
        mapCacheBuildCount: mapPaths.length,
        visibilityRefreshCount,
        sightCastCount,
        lastSightCandidateCount
      });
    },
    clear,
    dispose: () => {
      assertActive();
      clear();
      disposed = true;
    }
  };
};
