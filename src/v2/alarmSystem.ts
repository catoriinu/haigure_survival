import { Vector3 } from "@babylonjs/core";

import type { NavigationLocation } from "../world/navigationWorld";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";

export const V2_ALARM_SELECTION_INTERVAL_SECONDS = 5;
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
  footPosition: Vector3;
  alive: boolean;
}>;

export type V2AlarmTriggerEvent = Readonly<{
  candidateId: string;
  targetId: string;
  position: Vector3;
}>;

export type V2AlarmBlinkSnapshot = Readonly<{
  candidateId: string;
  position: Vector3;
  elapsedSeconds: number;
  remainingSeconds: number;
  blinkIntervalSeconds: number;
  visible: boolean;
}>;

export type V2AlarmFrame = Readonly<{
  events: readonly V2AlarmTriggerEvent[];
  activeCandidateIds: readonly string[];
  usedCandidateIds: readonly string[];
  blinks: readonly V2AlarmBlinkSnapshot[];
}>;

export type V2AlarmSystemUpdateInput = Readonly<{
  deltaSeconds: number;
  humans: readonly V2AlarmHumanSnapshot[];
}>;

export type V2AlarmSystemOptions = Readonly<{
  candidateProvider: V2AlarmCandidateProvider;
  random: () => number;
}>;

export interface V2AlarmSystem {
  update(input: V2AlarmSystemUpdateInput): V2AlarmFrame;
  getFrame(): V2AlarmFrame;
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

  return Object.freeze({
    id: candidate.id,
    navigationLocation: cloneNavigationLocation(candidate.navigationLocation),
    supportNormal,
    tangent,
    bitangent,
    radius: candidate.radius,
    verticalTolerance: candidate.verticalTolerance
  });
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
  const constant = startU * startU + startV * startV - radius * radius;

  if (quadratic <= INTERSECTION_EPSILON) {
    return constant <= INTERSECTION_EPSILON
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

const createBlinkSnapshot = (blink: RuntimeBlink): V2AlarmBlinkSnapshot =>
  Object.freeze({
    candidateId: blink.candidate.id,
    position: blink.candidate.navigationLocation.position.clone(),
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
  random
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
  let selectionTimerSeconds = 0;
  let disposed = false;
  let frame: V2AlarmFrame = Object.freeze({
    events: Object.freeze([]),
    activeCandidateIds: Object.freeze([]),
    usedCandidateIds: Object.freeze([]),
    blinks: Object.freeze([])
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
      usedCandidateIds: Object.freeze([...usedCandidateIds]),
      blinks: Object.freeze([...blinks.values()].map(createBlinkSnapshot))
    });
    return frame;
  };

  const resetRuntimeState = (): void => {
    activeCandidates.clear();
    usedCandidateIds.clear();
    blinks.clear();
    previousFootPositions.clear();
    selectionTimerSeconds = 0;
    selectOneEligibleCandidate();
    rebuildFrame([]);
  };

  resetRuntimeState();

  return {
    update: ({ deltaSeconds, humans }) => {
      assertActive();
      assertNonNegativeFiniteNumber(
        "V2AlarmSystem.update.deltaSeconds",
        deltaSeconds
      );

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
        previousFootPositions.set(human.id, human.footPosition.clone());
        if (!previous) {
          continue;
        }

        for (const candidate of [...activeCandidates.values()]) {
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

      for (const trackedId of [...previousFootPositions.keys()]) {
        if (!humanIds.has(trackedId)) {
          previousFootPositions.delete(trackedId);
        }
      }

      for (const [candidateId, blink] of [...blinks]) {
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

      return rebuildFrame(events);
    },
    getFrame: () => {
      assertActive();
      return rebuildFrame([]);
    },
    reset: () => {
      assertActive();
      resetRuntimeState();
    },
    dispose: () => {
      assertActive();
      activeCandidates.clear();
      usedCandidateIds.clear();
      blinks.clear();
      previousFootPositions.clear();
      disposed = true;
    }
  };
};
