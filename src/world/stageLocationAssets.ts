import {
  Mesh,
  TransformNode,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import type {
  StageElevatorAssetRegistry,
  StageElevatorStopAsset
} from "./stageDynamicAssets";
import type { NavigationWorld } from "./navigationWorld";
import type { StageSpatialQueries } from "./stageSpatialQueries";
import { BLENDER_METERS_TO_WORLD_UNITS } from "./worldUnits";

export const STAGE_LOCATION_FLOOR_IDS = [
  "f01",
  "f02",
  "f03",
  "f04",
  "roof"
] as const;

export type StageLocationFloorId =
  (typeof STAGE_LOCATION_FLOOR_IDS)[number];

export const STAGE_STAIR_LANDING_DIRECTIONS = [
  "up",
  "down",
  "both"
] as const;

export type StageStairLandingDirection =
  (typeof STAGE_STAIR_LANDING_DIRECTIONS)[number];

export type StageFloorMap = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  displayName: string;
  order: number;
  mesh: Mesh;
}>;

export type StageLocationAreaPieceFloorBinding =
  | Readonly<{
      kind: "fixed";
      floorId: StageLocationFloorId;
    }>
  | Readonly<{
      kind: "elevator";
      elevatorId: string;
    }>;

export type StageLocationAreaPiece = Readonly<{
  id: string;
  areaId: string;
  floorBinding: StageLocationAreaPieceFloorBinding;
  mesh: Mesh;
  contains(point: Vector3): boolean;
}>;

export type StageLocationArea = Readonly<{
  id: string;
  displayName: string;
  priority: number;
  pieces: readonly StageLocationAreaPiece[];
}>;

export type StageLocationAreaHit = Readonly<{
  area: StageLocationArea;
  piece: StageLocationAreaPiece;
  floorId: StageLocationFloorId | null;
  elevatorId: string | null;
}>;

export type StageMissionLocation = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  displayName: string;
  area: StageLocationArea;
  volumeMesh: Mesh;
  anchorNode: TransformNode;
}>;

export type StageStairLanding = Readonly<{
  id: string;
  stairId: string;
  floorId: StageLocationFloorId;
  direction: StageStairLandingDirection;
  node: TransformNode;
}>;

export type StageElevatorLanding = Readonly<{
  id: string;
  elevatorId: string;
  floorId: StageLocationFloorId;
  available: boolean;
  stop: StageElevatorStopAsset | null;
  node: TransformNode;
}>;

export type StageBroadcastConsole = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  displayName: string;
  markerNode: TransformNode;
  targetMesh: Mesh;
}>;

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

export type AuthoredStageFloorMap = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  displayName: string;
  order: number;
  mesh: Mesh;
}>;

export type AuthoredStageLocationAreaPiece = Readonly<{
  id: string;
  areaId: string;
  displayName: string;
  priority: number;
  floorBinding: StageLocationAreaPieceFloorBinding;
  mesh: Mesh;
}>;

export type AuthoredStageMissionLocationVolume = Readonly<{
  id: string;
  locationId: string;
  areaId: string;
  floorId: StageLocationFloorId;
  displayName: string;
  anchorId: string;
  mesh: Mesh;
}>;

export type AuthoredStageMissionAnchor = Readonly<{
  id: string;
  locationId: string;
  node: TransformNode;
}>;

export type AuthoredStageStairLanding = Readonly<{
  id: string;
  stairId: string;
  floorId: StageLocationFloorId;
  direction: StageStairLandingDirection;
  node: TransformNode;
}>;

export type AuthoredStageElevatorLanding = Readonly<{
  id: string;
  elevatorId: string;
  floorId: StageLocationFloorId;
  available: boolean;
  stopId: string | null;
  node: TransformNode;
}>;

export type AuthoredStageBroadcastConsoleMarker = Readonly<{
  id: string;
  floorId: StageLocationFloorId;
  displayName: string;
  targetId: string;
  node: TransformNode;
}>;

export type AuthoredStageBroadcastConsoleTarget = Readonly<{
  id: string;
  consoleId: string;
  mesh: Mesh;
}>;

export type StageLocationAssetRegistrySource = Readonly<{
  floorMaps: readonly AuthoredStageFloorMap[];
  areaPieces: readonly AuthoredStageLocationAreaPiece[];
  missionVolumes: readonly AuthoredStageMissionLocationVolume[];
  missionAnchors: readonly AuthoredStageMissionAnchor[];
  stairLandings: readonly AuthoredStageStairLanding[];
  elevatorLandings: readonly AuthoredStageElevatorLanding[];
  broadcastConsoleMarkers: readonly AuthoredStageBroadcastConsoleMarker[];
  broadcastConsoleTargets: readonly AuthoredStageBroadcastConsoleTarget[];
}>;

const OVERLAP_EPSILON = 1.0e-5;
const ANCHOR_NAVMESH_PROJECTION_METERS = 0.25;

type AxisAlignedBoxBounds = Readonly<{
  minimum: Vector3;
  maximum: Vector3;
}>;

const assertAxisAlignedBoxMesh = (
  label: string,
  mesh: Mesh
): AxisAlignedBoxBounds => {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions || positions.length === 0) {
    throw new Error(`${label}に頂点がありません: ${mesh.name}`);
  }
  const world = mesh.computeWorldMatrix(true);
  const points: Vector3[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    points.push(
      Vector3.TransformCoordinates(Vector3.FromArray(positions, index), world)
    );
  }
  const minimum = new Vector3(
    Math.min(...points.map((point) => point.x)),
    Math.min(...points.map((point) => point.y)),
    Math.min(...points.map((point) => point.z))
  );
  const maximum = new Vector3(
    Math.max(...points.map((point) => point.x)),
    Math.max(...points.map((point) => point.y)),
    Math.max(...points.map((point) => point.z))
  );
  if (
    maximum.x - minimum.x <= OVERLAP_EPSILON ||
    maximum.y - minimum.y <= OVERLAP_EPSILON ||
    maximum.z - minimum.z <= OVERLAP_EPSILON
  ) {
    throw new Error(`${label}には正体積のBoxが必要です: ${mesh.name}`);
  }
  const corners = new Set<string>();
  for (const point of points) {
    const sides = (["x", "y", "z"] as const).map((axis) => {
      if (Math.abs(point[axis] - minimum[axis]) <= OVERLAP_EPSILON) {
        return "0";
      }
      if (Math.abs(point[axis] - maximum[axis]) <= OVERLAP_EPSILON) {
        return "1";
      }
      throw new Error(
        `${label}は軸平行Boxである必要があります: ${mesh.name}`
      );
    });
    corners.add(sides.join(""));
  }
  if (corners.size !== 8) {
    throw new Error(`${label}のBox頂点が不足しています: ${mesh.name}`);
  }
  return Object.freeze({ minimum, maximum });
};

const assertUnique = (
  label: string,
  entries: readonly Readonly<{ id: string }>[]
) => {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`${label} IDが重複しています: ${entry.id}`);
    }
    seen.add(entry.id);
  }
};

const assertPositiveAabbOverlapAbsent = (
  areaPieces: readonly AuthoredStageLocationAreaPiece[]
) => {
  for (let leftIndex = 0; leftIndex < areaPieces.length; leftIndex += 1) {
    const left = areaPieces[leftIndex];
    left.mesh.computeWorldMatrix(true);
    const leftBounds = left.mesh.getBoundingInfo().boundingBox;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < areaPieces.length;
      rightIndex += 1
    ) {
      const right = areaPieces[rightIndex];
      if (left.areaId === right.areaId || left.priority !== right.priority) {
        continue;
      }
      right.mesh.computeWorldMatrix(true);
      const rightBounds = right.mesh.getBoundingInfo().boundingBox;
      const overlapX =
        Math.min(leftBounds.maximumWorld.x, rightBounds.maximumWorld.x) -
        Math.max(leftBounds.minimumWorld.x, rightBounds.minimumWorld.x);
      const overlapY =
        Math.min(leftBounds.maximumWorld.y, rightBounds.maximumWorld.y) -
        Math.max(leftBounds.minimumWorld.y, rightBounds.minimumWorld.y);
      const overlapZ =
        Math.min(leftBounds.maximumWorld.z, rightBounds.maximumWorld.z) -
        Math.max(leftBounds.minimumWorld.z, rightBounds.minimumWorld.z);
      if (
        overlapX > OVERLAP_EPSILON &&
        overlapY > OVERLAP_EPSILON &&
        overlapZ > OVERLAP_EPSILON
      ) {
        throw new Error(
          `同一優先度のlocation_areaが正体積で重複しています: ` +
            `${left.id}/${right.id}`
        );
      }
    }
  }
};

const assertNavigationSurfaceCovered = (
  navigation: NavigationWorld,
  areaPieces: readonly StageLocationAreaPiece[],
  boundsByPieceId: ReadonlyMap<string, AxisAlignedBoxBounds>
) => {
  const fixedPieces = areaPieces.filter(
    (piece) => piece.floorBinding.kind === "fixed"
  );
  for (const [index, triangle] of navigation.getSurfaceTriangles().entries()) {
    const triangleMinimum = new Vector3(
      Math.min(triangle.a.x, triangle.b.x, triangle.c.x),
      Math.min(triangle.a.y, triangle.b.y, triangle.c.y),
      Math.min(triangle.a.z, triangle.b.z, triangle.c.z)
    );
    const triangleMaximum = new Vector3(
      Math.max(triangle.a.x, triangle.b.x, triangle.c.x),
      Math.max(triangle.a.y, triangle.b.y, triangle.c.y),
      Math.max(triangle.a.z, triangle.b.z, triangle.c.z)
    );
    const candidateBounds = fixedPieces
      .map((piece) => boundsByPieceId.get(piece.id)!)
      .filter(
        (bounds) =>
          bounds.maximum.x >= triangleMinimum.x &&
          bounds.minimum.x <= triangleMaximum.x &&
          bounds.maximum.y >= triangleMinimum.y &&
          bounds.minimum.y <= triangleMaximum.y &&
          bounds.maximum.z >= triangleMinimum.z &&
          bounds.minimum.z <= triangleMaximum.z
      );
    let uncovered: readonly (readonly Vector3[])[] = Object.freeze([
      Object.freeze([triangle.a, triangle.b, triangle.c])
    ]);
    for (const bounds of candidateBounds) {
      uncovered = Object.freeze(
        uncovered.flatMap((polygon) => subtractBoxFromPolygon(polygon, bounds))
      );
      if (uncovered.length === 0) {
        break;
      }
    }
    const uncoveredArea = uncovered.reduce(
      (sum, polygon) => sum + polygonArea(polygon),
      0
    );
    const allowedError = Math.max(1.0e-4, triangle.area * 1.0e-6);
    if (uncoveredArea > allowedError) {
      throw new Error(`location_area未被覆のNavMesh面があります: triangle=${index}`);
    }
  }
};

const clipPolygonByPlane = (
  polygon: readonly Vector3[],
  axis: "x" | "y" | "z",
  boundary: number,
  keepPositive: boolean
): readonly Vector3[] => {
  const result: Vector3[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentSigned =
      (current[axis] - boundary) * (keepPositive ? 1 : -1);
    const nextSigned =
      (next[axis] - boundary) * (keepPositive ? 1 : -1);
    const currentInside = currentSigned >= 0;
    const nextInside = nextSigned >= 0;
    if (currentInside) {
      result.push(current);
    }
    if (currentInside !== nextInside) {
      const interpolation =
        currentSigned / (currentSigned - nextSigned);
      result.push(Vector3.Lerp(current, next, interpolation));
    }
  }
  return Object.freeze(result);
};

const subtractBoxFromPolygon = (
  polygon: readonly Vector3[],
  bounds: AxisAlignedBoxBounds
): readonly (readonly Vector3[])[] => {
  const planes = Object.freeze([
    Object.freeze({ axis: "x" as const, boundary: bounds.minimum.x, positive: true }),
    Object.freeze({ axis: "x" as const, boundary: bounds.maximum.x, positive: false }),
    Object.freeze({ axis: "y" as const, boundary: bounds.minimum.y, positive: true }),
    Object.freeze({ axis: "y" as const, boundary: bounds.maximum.y, positive: false }),
    Object.freeze({ axis: "z" as const, boundary: bounds.minimum.z, positive: true }),
    Object.freeze({ axis: "z" as const, boundary: bounds.maximum.z, positive: false })
  ]);
  let insideCandidates: readonly (readonly Vector3[])[] = Object.freeze([
    polygon
  ]);
  const outsideFragments: Array<readonly Vector3[]> = [];
  for (const plane of planes) {
    const nextInside: Array<readonly Vector3[]> = [];
    for (const candidate of insideCandidates) {
      const inside = clipPolygonByPlane(
        candidate,
        plane.axis,
        plane.boundary,
        plane.positive
      );
      const outside = clipPolygonByPlane(
        candidate,
        plane.axis,
        plane.boundary,
        !plane.positive
      );
      if (inside.length >= 3) {
        nextInside.push(inside);
      }
      if (outside.length >= 3 && polygonArea(outside) > 1.0e-8) {
        outsideFragments.push(outside);
      }
    }
    insideCandidates = Object.freeze(nextInside);
    if (insideCandidates.length === 0) {
      break;
    }
  }
  return Object.freeze(outsideFragments);
};

const polygonArea = (polygon: readonly Vector3[]): number => {
  if (polygon.length < 3) {
    return 0;
  }
  let area = 0;
  for (let index = 1; index < polygon.length - 1; index += 1) {
    area += Vector3.Cross(
      polygon[index].subtract(polygon[0]),
      polygon[index + 1].subtract(polygon[0])
    ).length() / 2;
  }
  return area;
};

export const createStageLocationAssetRegistry = (
  source: StageLocationAssetRegistrySource,
  navigation: NavigationWorld,
  elevators: StageElevatorAssetRegistry,
  queries: StageSpatialQueries
): StageLocationAssetRegistry => {
  assertUnique("floor_map", source.floorMaps);
  assertUnique("location_area piece", source.areaPieces);
  assertUnique("mission_location volume", source.missionVolumes);
  assertUnique("mission_anchor", source.missionAnchors);
  assertUnique("map_stair_landing", source.stairLandings);
  assertUnique("map_elevator_landing", source.elevatorLandings);
  assertUnique("broadcast_console", source.broadcastConsoleMarkers);
  assertUnique("broadcast_console_target", source.broadcastConsoleTargets);

  const floorMapByFloorId = new Map<StageLocationFloorId, StageFloorMap>();
  const floorMapOrders = new Set<number>();
  const floorMaps = Object.freeze(
    source.floorMaps
      .map((authored): StageFloorMap => {
        if (floorMapByFloorId.has(authored.floorId)) {
          throw new Error(`floor_mapの階が重複しています: ${authored.floorId}`);
        }
        if (floorMapOrders.has(authored.order)) {
          throw new Error(`floor_mapの順序が重複しています: ${authored.order}`);
        }
        const floorMap = Object.freeze({ ...authored });
        floorMapByFloorId.set(authored.floorId, floorMap);
        floorMapOrders.add(authored.order);
        return floorMap;
      })
      .sort((left, right) => left.order - right.order)
  );
  if (
    floorMaps.length !== STAGE_LOCATION_FLOOR_IDS.length ||
    STAGE_LOCATION_FLOOR_IDS.some(
      (floorId, index) =>
        floorMaps[index]?.floorId !== floorId ||
        floorMaps[index]?.order !== index + 1
    )
  ) {
    throw new Error(
      "floor_mapはf01/f02/f03/f04/roofを1から5の順序で定義します"
    );
  }

  const groupedAreaPieces = new Map<
    string,
    AuthoredStageLocationAreaPiece[]
  >();
  const boundsByPieceId = new Map<string, AxisAlignedBoxBounds>();
  for (const piece of source.areaPieces) {
    boundsByPieceId.set(
      piece.id,
      assertAxisAlignedBoxMesh("location_area piece", piece.mesh)
    );
    if (
      piece.floorBinding.kind === "fixed" &&
      !floorMapByFloorId.has(piece.floorBinding.floorId)
    ) {
      throw new Error(
        `location_areaが未登録floorを参照しています: ${piece.id}/${piece.floorBinding.floorId}`
      );
    }
    if (
      piece.floorBinding.kind === "elevator" &&
      !elevators.getById(piece.floorBinding.elevatorId)
    ) {
      throw new Error(
        `location_areaが未登録elevatorを参照しています: ${piece.id}/${piece.floorBinding.elevatorId}`
      );
    }
    const grouped = groupedAreaPieces.get(piece.areaId) ?? [];
    grouped.push(piece);
    groupedAreaPieces.set(piece.areaId, grouped);
  }
  const areas = Object.freeze(
    [...groupedAreaPieces.entries()]
      .map(([areaId, authoredPieces]): StageLocationArea => {
        const reference = authoredPieces[0];
        if (
          authoredPieces.some(
            (piece) =>
              piece.displayName !== reference.displayName ||
              piece.priority !== reference.priority
          )
        ) {
          throw new Error(
            `同一location_areaの表示名・優先度が一致しません: ${areaId}`
          );
        }
        if (!Number.isInteger(reference.priority) || reference.priority <= 0) {
          throw new Error(`location_areaの優先度が不正です: ${areaId}`);
        }
        return Object.freeze({
          id: areaId,
          displayName: reference.displayName,
          priority: reference.priority,
          pieces: Object.freeze(
            authoredPieces.map((piece) =>
              Object.freeze({
                id: piece.id,
                areaId: piece.areaId,
                floorBinding: piece.floorBinding,
                mesh: piece.mesh,
                contains: (point: Vector3) =>
                  queries.containsVolumeById(piece.id, point)
              })
            )
          )
        });
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  );
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const allAreaPieces = Object.freeze(areas.flatMap((area) => area.pieces));
  assertPositiveAabbOverlapAbsent(source.areaPieces);

  const anchorByLocationId = new Map(
    source.missionAnchors.map((anchor) => [anchor.locationId, anchor])
  );
  if (anchorByLocationId.size !== source.missionAnchors.length) {
    throw new Error("mission_anchorのlocation IDが重複しています");
  }
  const missionLocationIds = new Set<string>();
  const missionLocations = Object.freeze(
    source.missionVolumes
      .map((volume): StageMissionLocation => {
        const missionBounds = assertAxisAlignedBoxMesh(
          "mission_location Volume",
          volume.mesh
        );
        if (missionLocationIds.has(volume.locationId)) {
          throw new Error(
            `mission_locationのlocation IDが重複しています: ${volume.locationId}`
          );
        }
        missionLocationIds.add(volume.locationId);
        const anchor = anchorByLocationId.get(volume.locationId);
        if (!anchor || anchor.id !== volume.anchorId) {
          throw new Error(
            `mission_locationのanchor参照が不正です: ${volume.locationId}/${volume.anchorId}`
          );
        }
        const area = areaById.get(volume.areaId);
        if (!area) {
          throw new Error(
            `mission_locationが未登録areaを参照しています: ${volume.locationId}/${volume.areaId}`
          );
        }
        if (!floorMapByFloorId.has(volume.floorId)) {
          throw new Error(
            `mission_locationが未登録floorを参照しています: ${volume.locationId}/${volume.floorId}`
          );
        }
        const matchingFloorPieces = area.pieces.filter(
          (piece) =>
            piece.floorBinding.kind === "fixed" &&
            piece.floorBinding.floorId === volume.floorId
        );
        if (matchingFloorPieces.length === 0) {
          throw new Error(
            `mission_locationのfloorとarea pieceが一致しません: ${volume.locationId}`
          );
        }
        anchor.node.computeWorldMatrix(true);
        const anchorPosition = anchor.node.getAbsolutePosition();
        if (!queries.containsVolumeById(volume.id, anchorPosition)) {
          throw new Error(
            `mission_anchorが対応Volume内にありません: ${volume.locationId}`
          );
        }
        const containingAreaPiece = matchingFloorPieces.find((piece) => {
          const bounds = piece.mesh.getBoundingInfo().boundingBox;
          return (
            missionBounds.minimum.x >=
              bounds.minimumWorld.x - OVERLAP_EPSILON &&
            missionBounds.minimum.y >=
              bounds.minimumWorld.y - OVERLAP_EPSILON &&
            missionBounds.minimum.z >=
              bounds.minimumWorld.z - OVERLAP_EPSILON &&
            missionBounds.maximum.x <=
              bounds.maximumWorld.x + OVERLAP_EPSILON &&
            missionBounds.maximum.y <=
              bounds.maximumWorld.y + OVERLAP_EPSILON &&
            missionBounds.maximum.z <=
              bounds.maximumWorld.z + OVERLAP_EPSILON &&
            piece.contains(anchorPosition)
          );
        });
        if (!containingAreaPiece) {
          throw new Error(
            `mission_locationが参照Area pieceへ完全内包されません: ${volume.locationId}`
          );
        }
        const resolvedArea = areas
          .filter((candidate) =>
            candidate.pieces.some((piece) => piece.contains(anchorPosition))
          )
          .sort(
            (left, right) =>
              right.priority - left.priority || left.id.localeCompare(right.id)
          )[0];
        if (!resolvedArea || resolvedArea.id !== area.id) {
          throw new Error(
            `mission_anchorの最優先Areaが参照先と一致しません: ` +
              `${volume.locationId}/${resolvedArea?.id ?? "none"}`
          );
        }
        if (
          !navigation.projectPoint(
            anchorPosition,
            ANCHOR_NAVMESH_PROJECTION_METERS * BLENDER_METERS_TO_WORLD_UNITS
          )
        ) {
          throw new Error(
            `mission_anchorをNavMeshへ投影できません: ${volume.locationId}`
          );
        }
        return Object.freeze({
          id: volume.locationId,
          floorId: volume.floorId,
          displayName: volume.displayName,
          area,
          volumeMesh: volume.mesh,
          anchorNode: anchor.node
        });
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  );
  if (missionLocations.length !== source.missionAnchors.length) {
    throw new Error("参照されていないmission_anchorがあります");
  }

  const stairLandings = Object.freeze(
    source.stairLandings
      .map((landing): StageStairLanding => {
        if (!floorMapByFloorId.has(landing.floorId)) {
          throw new Error(
            `map_stair_landingが未登録floorを参照しています: ${landing.id}/${landing.floorId}`
          );
        }
        return Object.freeze({ ...landing });
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  );

  const elevatorLandings = Object.freeze(
    source.elevatorLandings
      .map((landing): StageElevatorLanding => {
        if (!floorMapByFloorId.has(landing.floorId)) {
          throw new Error(
            `map_elevator_landingが未登録floorを参照しています: ${landing.id}/${landing.floorId}`
          );
        }
        const elevator = elevators.getById(landing.elevatorId);
        if (!elevator) {
          throw new Error(
            `map_elevator_landingが未登録elevatorを参照しています: ${landing.id}/${landing.elevatorId}`
          );
        }
        if (landing.available !== (landing.stopId !== null)) {
          throw new Error(
            `map_elevator_landingの利用可否とstop参照が一致しません: ${landing.id}`
          );
        }
        const stop = landing.stopId
          ? elevator.stops.find((candidate) => candidate.id === landing.stopId) ??
            null
          : null;
        if (landing.available && !stop) {
          throw new Error(
            `map_elevator_landingが未登録stopを参照しています: ${landing.id}/${landing.stopId}`
          );
        }
        const floorOrder = floorMapByFloorId.get(landing.floorId)!.order;
        if (stop && stop.floorIndex !== floorOrder) {
          throw new Error(
            `map_elevator_landingのfloorとstopが一致しません: ${landing.id}/${stop.id}`
          );
        }
        return Object.freeze({
          id: landing.id,
          elevatorId: landing.elevatorId,
          floorId: landing.floorId,
          available: landing.available,
          stop,
          node: landing.node
        });
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  );

  if (
    source.broadcastConsoleMarkers.length !== 1 ||
    source.broadcastConsoleTargets.length !== 1
  ) {
    throw new Error(
      `放送卓Marker/targetは各1個必要です: ` +
        `${source.broadcastConsoleMarkers.length}/${source.broadcastConsoleTargets.length}`
    );
  }
  const consoleMarker = source.broadcastConsoleMarkers[0];
  const consoleTarget = source.broadcastConsoleTargets[0];
  if (
    consoleMarker.targetId !== consoleTarget.id ||
    consoleTarget.consoleId !== consoleMarker.id
  ) {
    throw new Error("放送卓Markerとtargetの相互参照が一致しません");
  }
  if (!floorMapByFloorId.has(consoleMarker.floorId)) {
    throw new Error(
      `放送卓が未登録floorを参照しています: ${consoleMarker.id}/${consoleMarker.floorId}`
    );
  }
  const broadcastConsole: StageBroadcastConsole = Object.freeze({
    id: consoleMarker.id,
    floorId: consoleMarker.floorId,
    displayName: consoleMarker.displayName,
    markerNode: consoleMarker.node,
    targetMesh: consoleTarget.mesh
  });

  assertNavigationSurfaceCovered(
    navigation,
    allAreaPieces,
    boundsByPieceId
  );

  const missionLocationById = new Map(
    missionLocations.map((location) => [location.id, location])
  );
  return Object.freeze({
    floorMaps,
    areas,
    missionLocations,
    stairLandings,
    elevatorLandings,
    broadcastConsole,
    getFloorMap: (floorId: StageLocationFloorId) =>
      floorMapByFloorId.get(floorId) ?? null,
    getAreaById: (id: string) => areaById.get(id) ?? null,
    getMissionLocationById: (id: string) =>
      missionLocationById.get(id) ?? null,
    findArea: (point: Vector3) => {
      const matches = areas
        .flatMap((area) =>
          area.pieces
            .filter((piece) => piece.contains(point))
            .map((piece) => ({ area, piece }))
        )
        .sort(
          (left, right) =>
            right.area.priority - left.area.priority ||
            left.area.id.localeCompare(right.area.id) ||
            left.piece.id.localeCompare(right.piece.id)
        );
      const selected = matches[0];
      if (!selected) {
        return null;
      }
      const samePriorityAreaIds = new Set(
        matches
          .filter((match) => match.area.priority === selected.area.priority)
          .map((match) => match.area.id)
      );
      if (samePriorityAreaIds.size !== 1) {
        throw new Error(
          `同一優先度のlocation_areaを一意に解決できません: ${[
            ...samePriorityAreaIds
          ].join(",")}`
        );
      }
      return Object.freeze({
        area: selected.area,
        piece: selected.piece,
        floorId:
          selected.piece.floorBinding.kind === "fixed"
            ? selected.piece.floorBinding.floorId
            : null,
        elevatorId:
          selected.piece.floorBinding.kind === "elevator"
            ? selected.piece.floorBinding.elevatorId
            : null
      });
    }
  });
};
