import { Vector3 } from "@babylonjs/core";

import type { NavigationLocation } from "../world/navigationWorld";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";

export const V2_ALARM_SELECTION_INTERVAL_SECONDS = 7.5;
export const V2_ALARM_BLINK_DURATION_SECONDS = 5;
export const V2_ALARM_BLINK_INTERVAL_START_SECONDS = 0.8;
export const V2_ALARM_BLINK_INTERVAL_END_SECONDS = 0.08;
export const V2_ALARM_BLINK_EASE_EXPONENT = 1.35;
export const V2_ALARM_INFLUENCE_RADIUS_LEGACY_CELLS = 50;
export const V2_LEGACY_GRID_CELL_WORLD_UNITS = 1 / 3;
export const V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS =
  V2_ALARM_INFLUENCE_RADIUS_LEGACY_CELLS *
  V2_LEGACY_GRID_CELL_WORLD_UNITS;
export const V2_ALARM_INFLUENCE_RADIUS_METERS =
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS /
  BLENDER_METERS_TO_WORLD_UNITS;

const VECTOR_LENGTH_EPSILON = 1e-8;
const ORTHOGONAL_DOT_EPSILON = 1e-6;
const INTERSECTION_EPSILON = 1e-9;
const ACTIVE_CANDIDATE_SPATIAL_CELL_SIZE = 1;
const ACTIVE_CANDIDATE_SPATIAL_BOUNDS_MARGIN =
  Math.sqrt(INTERSECTION_EPSILON);

export type V2AlarmCandidate = Readonly<{
  id: string;
  navigationLocation: NavigationLocation;
  supportNormal: Vector3;
  tangent: Vector3;
  radius: number;
  verticalTolerance: number;
}>;

export interface V2AlarmCandidateProvider {
  getCandidates(): readonly V2AlarmCandidate[];
}

export type V2AlarmHumanSnapshot = Readonly<{
  id: string;
  /**
   * 次のupdate後も内容が変化しないフレームSnapshotの位置。
   */
  footPosition: Vector3;
  alive: boolean;
}>;

export type V2AlarmTriggerEvent = Readonly<{
  candidateId: string;
  targetId: string;
  position: Vector3;
}>;

export type V2AlarmFloorSnapshot = Readonly<{
  candidateId: string;
  position: Vector3;
  supportNormal: Vector3;
  tangent: Vector3;
  radius: number;
}>;

export type V2AlarmBlinkSnapshot = Readonly<{
  candidateId: string;
  position: Vector3;
  supportNormal: Vector3;
  tangent: Vector3;
  radius: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  blinkIntervalSeconds: number;
  visible: boolean;
}>;

export type V2AlarmFrame = Readonly<{
  events: readonly V2AlarmTriggerEvent[];
  activeCandidateIds: readonly string[];
  activeFloors: readonly V2AlarmFloorSnapshot[];
  usedCandidateIds: readonly string[];
  blinks: readonly V2AlarmBlinkSnapshot[];
}>;

export type V2AlarmDiagnostics = Readonly<{
  enabled: boolean;
  candidateCount: number;
  spatialIndexCandidateCount: number;
  segmentIntersectionTestCount: number;
}>;

export type V2AlarmSystemUpdateInput = Readonly<{
  deltaSeconds: number;
  humans: readonly V2AlarmHumanSnapshot[];
}>;

export type V2AlarmSystemOptions = Readonly<{
  candidateProvider: V2AlarmCandidateProvider;
  random: () => number;
  diagnosticsEnabled: boolean;
}>;

export interface V2AlarmSystem {
  update(input: V2AlarmSystemUpdateInput): V2AlarmFrame;
  getFrame(): V2AlarmFrame;
  getDiagnostics(): V2AlarmDiagnostics;
  reset(): void;
  dispose(): void;
}

type RuntimeAlarmCandidate = Readonly<{
  id: string;
  navigationLocation: NavigationLocation;
  supportNormal: Vector3;
  tangent: Vector3;
  bitangent: Vector3;
  radius: number;
  verticalTolerance: number;
  minimum: Vector3;
  maximum: Vector3;
  floorSnapshot: V2AlarmFloorSnapshot;
}>;

type RuntimeBlink = {
  candidate: RuntimeAlarmCandidate;
  elapsedSeconds: number;
  blinkTimerSeconds: number;
  visible: boolean;
};

type IntersectionInterval = Readonly<{
  minimum: number;
  maximum: number;
}>;

type ActiveCandidateSpatialIndex = Readonly<{
  cells: ReadonlyMap<string, readonly RuntimeAlarmCandidate[]>;
  activationOrderById: ReadonlyMap<string, number>;
  candidateCount: number;
}>;

const assertFiniteNumber = (name: string, value: number): void => {
  if (!Number.isFinite(value)) {
    throw new Error(`${name}には有限値が必要です: ${value}`);
  }
};

const assertNonNegativeFiniteNumber = (name: string, value: number): void => {
  assertFiniteNumber(name, value);
  if (value < 0) {
    throw new Error(`${name}には0以上の値が必要です: ${value}`);
  }
};

const assertPositiveFiniteNumber = (name: string, value: number): void => {
  assertFiniteNumber(name, value);
  if (value <= 0) {
    throw new Error(`${name}には0より大きい値が必要です: ${value}`);
  }
};

const assertFiniteVector = (name: string, value: Vector3): void => {
  assertFiniteNumber(`${name}.x`, value.x);
  assertFiniteNumber(`${name}.y`, value.y);
  assertFiniteNumber(`${name}.z`, value.z);
};

const assertIdentifier = (name: string, value: string): void => {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name}には前後空白のない非空IDが必要です。`);
  }
};

const cloneNavigationLocation = (
  location: NavigationLocation
): NavigationLocation =>
  Object.freeze({
    position: location.position.clone(),
    polygonRef: location.polygonRef
  });

const buildRuntimeCandidate = (
  candidate: V2AlarmCandidate
): RuntimeAlarmCandidate => {
  assertIdentifier("alarm candidate.id", candidate.id);
  assertFiniteVector(
    `alarm candidate(${candidate.id}).navigationLocation.position`,
    candidate.navigationLocation.position
  );
  if (
    !Number.isInteger(candidate.navigationLocation.polygonRef) ||
    candidate.navigationLocation.polygonRef <= 0
  ) {
    throw new Error(
      `alarm candidate(${candidate.id}).navigationLocation.polygonRefには` +
        "1以上の整数が必要です。"
    );
  }
  assertFiniteVector(
    `alarm candidate(${candidate.id}).supportNormal`,
    candidate.supportNormal
  );
  assertFiniteVector(
    `alarm candidate(${candidate.id}).tangent`,
    candidate.tangent
  );
  assertPositiveFiniteNumber(
    `alarm candidate(${candidate.id}).radius`,
    candidate.radius
  );
  assertPositiveFiniteNumber(
    `alarm candidate(${candidate.id}).verticalTolerance`,
    candidate.verticalTolerance
  );

  if (
    candidate.supportNormal.lengthSquared() <=
    VECTOR_LENGTH_EPSILON * VECTOR_LENGTH_EPSILON
  ) {
    throw new Error(
      `alarm candidate(${candidate.id}).supportNormalはゼロベクトルにできません。`
    );
  }
  if (
    candidate.tangent.lengthSquared() <=
    VECTOR_LENGTH_EPSILON * VECTOR_LENGTH_EPSILON
  ) {
    throw new Error(
      `alarm candidate(${candidate.id}).tangentはゼロベクトルにできません。`
    );
  }

  const supportNormal = candidate.supportNormal.clone().normalize();
  const tangent = candidate.tangent.clone().normalize();
  const normalTangentDot = Vector3.Dot(supportNormal, tangent);
  if (Math.abs(normalTangentDot) > ORTHOGONAL_DOT_EPSILON) {
    throw new Error(
      `alarm candidate(${candidate.id})のsupportNormalとtangentは` +
        `直交している必要があります: dot=${normalTangentDot}`
    );
  }
  const bitangent = Vector3.Cross(supportNormal, tangent).normalize();
  const halfExtent = new Vector3(
    candidate.radius *
      Math.hypot(tangent.x, bitangent.x) +
      candidate.verticalTolerance * Math.abs(supportNormal.x),
    candidate.radius *
      Math.hypot(tangent.y, bitangent.y) +
      candidate.verticalTolerance * Math.abs(supportNormal.y),
    candidate.radius *
      Math.hypot(tangent.z, bitangent.z) +
      candidate.verticalTolerance * Math.abs(supportNormal.z)
  ).addInPlace(
    new Vector3(
      ACTIVE_CANDIDATE_SPATIAL_BOUNDS_MARGIN,
      ACTIVE_CANDIDATE_SPATIAL_BOUNDS_MARGIN,
      ACTIVE_CANDIDATE_SPATIAL_BOUNDS_MARGIN
    )
  );
  const center = candidate.navigationLocation.position;
  const floorSnapshot: V2AlarmFloorSnapshot = Object.freeze({
    candidateId: candidate.id,
    position: Object.freeze(center.clone()) as Vector3,
    supportNormal: Object.freeze(supportNormal.clone()) as Vector3,
    tangent: Object.freeze(tangent.clone()) as Vector3,
    radius: candidate.radius
  });

  return Object.freeze({
    id: candidate.id,
    navigationLocation: cloneNavigationLocation(candidate.navigationLocation),
    supportNormal,
    tangent,
    bitangent,
    radius: candidate.radius,
    verticalTolerance: candidate.verticalTolerance,
    minimum: center.subtract(halfExtent),
    maximum: center.add(halfExtent),
    floorSnapshot
  });
};

const getSpatialCellCoordinate = (value: number): number =>
  Math.floor(value / ACTIVE_CANDIDATE_SPATIAL_CELL_SIZE);

const getSpatialCellKey = (
  x: number,
  y: number,
  z: number
): string => `${x}:${y}:${z}`;

const buildActiveCandidateSpatialIndex = (
  activeCandidates: ReadonlyMap<string, RuntimeAlarmCandidate>
): ActiveCandidateSpatialIndex => {
  const cells = new Map<string, RuntimeAlarmCandidate[]>();
  const activationOrderById = new Map<string, number>();
  let activationOrder = 0;
  for (const candidate of activeCandidates.values()) {
    activationOrderById.set(candidate.id, activationOrder);
    activationOrder += 1;
    const minimumX = getSpatialCellCoordinate(candidate.minimum.x);
    const maximumX = getSpatialCellCoordinate(candidate.maximum.x);
    const minimumY = getSpatialCellCoordinate(candidate.minimum.y);
    const maximumY = getSpatialCellCoordinate(candidate.maximum.y);
    const minimumZ = getSpatialCellCoordinate(candidate.minimum.z);
    const maximumZ = getSpatialCellCoordinate(candidate.maximum.z);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        for (let z = minimumZ; z <= maximumZ; z += 1) {
          const key = getSpatialCellKey(x, y, z);
          const cell = cells.get(key);
          if (cell) {
            cell.push(candidate);
          } else {
            cells.set(key, [candidate]);
          }
        }
      }
    }
  }
  return Object.freeze({
    cells,
    activationOrderById,
    candidateCount: activeCandidates.size
  });
};

const queryActiveCandidateSpatialIndex = (
  index: ActiveCandidateSpatialIndex,
  from: Vector3,
  to: Vector3,
  queryToken: number,
  seenQueryTokenByCandidateId: Map<string, number>,
  output: RuntimeAlarmCandidate[]
): void => {
  output.length = 0;
  const minimumX = getSpatialCellCoordinate(Math.min(from.x, to.x));
  const maximumX = getSpatialCellCoordinate(Math.max(from.x, to.x));
  const minimumY = getSpatialCellCoordinate(Math.min(from.y, to.y));
  const maximumY = getSpatialCellCoordinate(Math.max(from.y, to.y));
  const minimumZ = getSpatialCellCoordinate(Math.min(from.z, to.z));
  const maximumZ = getSpatialCellCoordinate(Math.max(from.z, to.z));
  for (let x = minimumX; x <= maximumX; x += 1) {
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (let z = minimumZ; z <= maximumZ; z += 1) {
        const cell = index.cells.get(getSpatialCellKey(x, y, z));
        if (!cell) {
          continue;
        }
        for (const candidate of cell) {
          if (
            seenQueryTokenByCandidateId.get(candidate.id) === queryToken
          ) {
            continue;
          }
          seenQueryTokenByCandidateId.set(candidate.id, queryToken);
          output.push(candidate);
        }
      }
    }
  }
  output.sort(
    (left, right) =>
      index.activationOrderById.get(left.id)! -
      index.activationOrderById.get(right.id)!
  );
};

const intersectIntervals = (
  left: IntersectionInterval,
  right: IntersectionInterval
): IntersectionInterval | null => {
  const minimum = Math.max(left.minimum, right.minimum);
  const maximum = Math.min(left.maximum, right.maximum);
  return minimum <= maximum + INTERSECTION_EPSILON
    ? Object.freeze({ minimum, maximum })
    : null;
};

const calculateAxialInterval = (
  startHeight: number,
  heightDelta: number,
  verticalTolerance: number
): IntersectionInterval | null => {
  if (Math.abs(heightDelta) <= INTERSECTION_EPSILON) {
    return Math.abs(startHeight) <= verticalTolerance + INTERSECTION_EPSILON
      ? Object.freeze({ minimum: 0, maximum: 1 })
      : null;
  }

  const first = (-verticalTolerance - startHeight) / heightDelta;
  const second = (verticalTolerance - startHeight) / heightDelta;
  return intersectIntervals(
    Object.freeze({
      minimum: Math.min(first, second),
      maximum: Math.max(first, second)
    }),
    Object.freeze({ minimum: 0, maximum: 1 })
  );
};

const calculateRadialInterval = (
  startU: number,
  startV: number,
  deltaU: number,
  deltaV: number,
  radius: number
): IntersectionInterval | null => {
  const quadratic = deltaU * deltaU + deltaV * deltaV;
  const linear = 2 * (startU * deltaU + startV * deltaV);
  const constant =
    startU * startU +
    startV * startV -
    radius * radius -
    INTERSECTION_EPSILON;

  if (quadratic <= INTERSECTION_EPSILON) {
    return constant <= 0
      ? Object.freeze({ minimum: 0, maximum: 1 })
      : null;
  }

  const discriminant = linear * linear - 4 * quadratic * constant;
  if (discriminant < -INTERSECTION_EPSILON) {
    return null;
  }
  const root = Math.sqrt(Math.max(0, discriminant));
  const first = (-linear - root) / (2 * quadratic);
  const second = (-linear + root) / (2 * quadratic);
  return intersectIntervals(
    Object.freeze({
      minimum: Math.min(first, second),
      maximum: Math.max(first, second)
    }),
    Object.freeze({ minimum: 0, maximum: 1 })
  );
};

const getCandidateLocalCoordinates = (
  candidate: RuntimeAlarmCandidate,
  point: Vector3
) => {
  const relative = point.subtract(
    candidate.navigationLocation.position
  );
  return Object.freeze({
    u: Vector3.Dot(relative, candidate.tangent),
    v: Vector3.Dot(relative, candidate.bitangent),
    height: Vector3.Dot(relative, candidate.supportNormal)
  });
};

const isPointInsideCandidate = (
  candidate: RuntimeAlarmCandidate,
  point: Vector3
): boolean => {
  const local = getCandidateLocalCoordinates(candidate, point);
  return (
    Math.abs(local.height) <=
      candidate.verticalTolerance + INTERSECTION_EPSILON &&
    local.u * local.u + local.v * local.v <=
      candidate.radius * candidate.radius + INTERSECTION_EPSILON
  );
};

const doesSegmentIntersectCandidate = (
  candidate: RuntimeAlarmCandidate,
  from: Vector3,
  to: Vector3
): boolean => {
  const start = getCandidateLocalCoordinates(candidate, from);
  const end = getCandidateLocalCoordinates(candidate, to);
  const axialInterval = calculateAxialInterval(
    start.height,
    end.height - start.height,
    candidate.verticalTolerance
  );
  if (!axialInterval) {
    return false;
  }
  const radialInterval = calculateRadialInterval(
    start.u,
    start.v,
    end.u - start.u,
    end.v - start.v,
    candidate.radius
  );
  return radialInterval !== null &&
    intersectIntervals(axialInterval, radialInterval) !== null;
};

const doesMovementEnterCandidate = (
  candidate: RuntimeAlarmCandidate,
  from: Vector3,
  to: Vector3
): boolean =>
  !isPointInsideCandidate(candidate, from) &&
  doesSegmentIntersectCandidate(candidate, from, to);

const calculateBlinkIntervalSeconds = (elapsedSeconds: number): number => {
  const progress = Math.min(
    1,
    elapsedSeconds / V2_ALARM_BLINK_DURATION_SECONDS
  );
  const blend = Math.pow(progress, V2_ALARM_BLINK_EASE_EXPONENT);
  return (
    V2_ALARM_BLINK_INTERVAL_START_SECONDS +
    (V2_ALARM_BLINK_INTERVAL_END_SECONDS -
      V2_ALARM_BLINK_INTERVAL_START_SECONDS) *
      blend
  );
};

const createFloorSnapshot = (
  candidate: RuntimeAlarmCandidate
): V2AlarmFloorSnapshot => candidate.floorSnapshot;

const createBlinkSnapshot = (blink: RuntimeBlink): V2AlarmBlinkSnapshot =>
  Object.freeze({
    ...createFloorSnapshot(blink.candidate),
    elapsedSeconds: blink.elapsedSeconds,
    remainingSeconds: Math.max(
      0,
      V2_ALARM_BLINK_DURATION_SECONDS - blink.elapsedSeconds
    ),
    blinkIntervalSeconds: calculateBlinkIntervalSeconds(
      blink.elapsedSeconds
    ),
    visible: blink.visible
  });

export const createV2AlarmSystem = ({
  candidateProvider,
  random,
  diagnosticsEnabled
}: V2AlarmSystemOptions): V2AlarmSystem => {
  if (typeof candidateProvider?.getCandidates !== "function") {
    throw new Error(
      "V2AlarmSystemのcandidateProviderにはgetCandidates関数が必要です。"
    );
  }
  if (typeof random !== "function") {
    throw new Error("V2AlarmSystemのrandomには関数が必要です。");
  }

  const candidates = candidateProvider
    .getCandidates()
    .map(buildRuntimeCandidate);
  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) {
      throw new Error(`alarm candidate IDが重複しています: ${candidate.id}`);
    }
    candidateIds.add(candidate.id);
  }

  const activeCandidates = new Map<string, RuntimeAlarmCandidate>();
  const usedCandidateIds = new Set<string>();
  const blinks = new Map<string, RuntimeBlink>();
  const previousFootPositions = new Map<string, Vector3>();
  const spatialQueryBuffer: RuntimeAlarmCandidate[] = [];
  const seenQueryTokenByCandidateId = new Map<string, number>();
  let selectionTimerSeconds = 0;
  let activeCandidateVersion = 0;
  let activeFloorSnapshotVersion = -1;
  let activeFloorSnapshots: readonly V2AlarmFloorSnapshot[] =
    Object.freeze([]);
  let spatialIndexVersion = -1;
  let spatialIndex = buildActiveCandidateSpatialIndex(activeCandidates);
  let spatialQueryToken = 0;
  let segmentIntersectionTestCount = 0;
  let disposed = false;
  let frame: V2AlarmFrame = Object.freeze({
    events: Object.freeze([]),
    activeCandidateIds: Object.freeze([]),
    activeFloors: Object.freeze([]),
    usedCandidateIds: Object.freeze([]),
    blinks: Object.freeze([])
  });
  let diagnostics: V2AlarmDiagnostics = Object.freeze({
    enabled: diagnosticsEnabled,
    candidateCount: diagnosticsEnabled ? candidates.length : 0,
    spatialIndexCandidateCount: 0,
    segmentIntersectionTestCount: 0
  });

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2AlarmSystemは使用できません。");
    }
  };

  const nextRandom = (): number => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `V2AlarmSystemのrandomは0以上1未満の有限値を返す必要があります: ${value}`
      );
    }
    return value;
  };

  const markActiveCandidatesChanged = (): void => {
    activeCandidateVersion += 1;
  };

  const requireCurrentSpatialIndex =
    (): ActiveCandidateSpatialIndex => {
      if (spatialIndexVersion !== activeCandidateVersion) {
        spatialIndex = buildActiveCandidateSpatialIndex(
          activeCandidates
        );
        spatialIndexVersion = activeCandidateVersion;
      }
      return spatialIndex;
    };

  const requireCurrentActiveFloorSnapshots =
    (): readonly V2AlarmFloorSnapshot[] => {
      if (activeFloorSnapshotVersion !== activeCandidateVersion) {
        activeFloorSnapshots = Object.freeze(
          Array.from(
            activeCandidates.values(),
            createFloorSnapshot
          )
        );
        activeFloorSnapshotVersion = activeCandidateVersion;
      }
      return activeFloorSnapshots;
    };

  const selectOneEligibleCandidate = (): void => {
    const eligible = candidates.filter(
      (candidate) =>
        !activeCandidates.has(candidate.id) &&
        !blinks.has(candidate.id)
    );
    if (eligible.length === 0) {
      return;
    }
    const selected =
      eligible[Math.floor(nextRandom() * eligible.length)];
    usedCandidateIds.add(selected.id);
    activeCandidates.set(selected.id, selected);
    markActiveCandidatesChanged();
  };

  const rebuildFrame = (
    events: readonly V2AlarmTriggerEvent[]
  ): V2AlarmFrame => {
    frame = Object.freeze({
      events: Object.freeze(
        events.map((event) =>
          Object.freeze({
            ...event,
            position: event.position.clone()
          })
        )
      ),
      activeCandidateIds: Object.freeze([...activeCandidates.keys()]),
      activeFloors: requireCurrentActiveFloorSnapshots(),
      usedCandidateIds: Object.freeze([...usedCandidateIds]),
      blinks: Object.freeze(
        Array.from(blinks.values(), createBlinkSnapshot)
      )
    });
    return frame;
  };

  const rebuildDiagnostics = (): V2AlarmDiagnostics => {
    if (!diagnosticsEnabled) {
      return diagnostics;
    }
    diagnostics = Object.freeze({
      enabled: true,
      candidateCount: candidates.length,
      spatialIndexCandidateCount: spatialIndex.candidateCount,
      segmentIntersectionTestCount
    });
    return diagnostics;
  };

  const resetRuntimeState = (): void => {
    if (activeCandidates.size > 0) {
      activeCandidates.clear();
      markActiveCandidatesChanged();
    }
    usedCandidateIds.clear();
    blinks.clear();
    previousFootPositions.clear();
    seenQueryTokenByCandidateId.clear();
    spatialQueryBuffer.length = 0;
    selectionTimerSeconds = 0;
    segmentIntersectionTestCount = 0;
    selectOneEligibleCandidate();
    requireCurrentSpatialIndex();
    rebuildFrame([]);
    rebuildDiagnostics();
  };

  resetRuntimeState();

  return {
    update: ({ deltaSeconds, humans }) => {
      assertActive();
      assertNonNegativeFiniteNumber(
        "V2AlarmSystem.update.deltaSeconds",
        deltaSeconds
      );
      segmentIntersectionTestCount = 0;

      selectionTimerSeconds += deltaSeconds;
      while (
        selectionTimerSeconds >= V2_ALARM_SELECTION_INTERVAL_SECONDS
      ) {
        selectionTimerSeconds -= V2_ALARM_SELECTION_INTERVAL_SECONDS;
        selectOneEligibleCandidate();
      }

      const events: V2AlarmTriggerEvent[] = [];
      const humanIds = new Set<string>();
      for (const human of humans) {
        assertIdentifier("alarm human.id", human.id);
        if (humanIds.has(human.id)) {
          throw new Error(`alarm human IDが重複しています: ${human.id}`);
        }
        humanIds.add(human.id);
        assertFiniteVector(
          `alarm human(${human.id}).footPosition`,
          human.footPosition
        );

        if (!human.alive) {
          previousFootPositions.delete(human.id);
          continue;
        }

        const previous = previousFootPositions.get(human.id);
        previousFootPositions.set(human.id, human.footPosition);
        if (!previous) {
          continue;
        }

        spatialQueryToken += 1;
        queryActiveCandidateSpatialIndex(
          requireCurrentSpatialIndex(),
          previous,
          human.footPosition,
          spatialQueryToken,
          seenQueryTokenByCandidateId,
          spatialQueryBuffer
        );
        for (const candidate of spatialQueryBuffer) {
          if (!activeCandidates.has(candidate.id)) {
            continue;
          }
          if (diagnosticsEnabled) {
            segmentIntersectionTestCount += 1;
          }
          if (
            !doesMovementEnterCandidate(
              candidate,
              previous,
              human.footPosition
            )
          ) {
            continue;
          }
          activeCandidates.delete(candidate.id);
          markActiveCandidatesChanged();
          blinks.set(candidate.id, {
            candidate,
            elapsedSeconds: 0,
            blinkTimerSeconds: 0,
            visible: true
          });
          events.push(
            Object.freeze({
              candidateId: candidate.id,
              targetId: human.id,
              position: candidate.navigationLocation.position.clone()
            })
          );
        }
      }

      for (const trackedId of previousFootPositions.keys()) {
        if (!humanIds.has(trackedId)) {
          previousFootPositions.delete(trackedId);
        }
      }

      for (const [candidateId, blink] of blinks) {
        blink.elapsedSeconds += deltaSeconds;
        const blinkInterval = calculateBlinkIntervalSeconds(
          blink.elapsedSeconds
        );
        blink.blinkTimerSeconds += deltaSeconds;
        while (blink.blinkTimerSeconds >= blinkInterval) {
          blink.blinkTimerSeconds -= blinkInterval;
          blink.visible = !blink.visible;
        }
        if (
          blink.elapsedSeconds >= V2_ALARM_BLINK_DURATION_SECONDS
        ) {
          blinks.delete(candidateId);
        }
      }

      requireCurrentSpatialIndex();
      const nextFrame = rebuildFrame(events);
      rebuildDiagnostics();
      return nextFrame;
    },
    getFrame: () => {
      assertActive();
      return frame;
    },
    getDiagnostics: () => {
      assertActive();
      return diagnostics;
    },
    reset: () => {
      assertActive();
      resetRuntimeState();
    },
    dispose: () => {
      assertActive();
      activeCandidates.clear();
      markActiveCandidatesChanged();
      usedCandidateIds.clear();
      blinks.clear();
      previousFootPositions.clear();
      seenQueryTokenByCandidateId.clear();
      spatialQueryBuffer.length = 0;
      disposed = true;
    }
  };
};
