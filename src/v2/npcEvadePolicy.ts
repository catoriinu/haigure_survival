import type { Vector3 } from "@babylonjs/core";
import type { NavigationLocation } from "../world/navigationWorld";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";

export type V2NpcEvadePersonality = "cautious" | "headlong" | "breakthrough";
export type V2NpcEvadeReason = "initial" | "periodic" | "danger" | "arrived" | "blocked" | "unreachable";

export const V2_NPC_EVADE_TUNING = Object.freeze({
  memorySeconds: 5,
  evaluationIntervalSeconds: 0.5,
  maximumEvaluationsPerUpdate: 4,
  evaluationDeadlineSeconds: 1,
  candidateRadius: 8 * BLENDER_METERS_TO_WORLD_UNITS,
  dangerDistance: 2 * BLENDER_METERS_TO_WORLD_UNITS,
  improvementThreshold: 0.05,
  cautious: { weights: [4, 1, 4, 1, 1], holdSeconds: 0.8 },
  headlong: { weights: [1, 4, 1, 1, 3], holdSeconds: 2 },
  breakthrough: { weights: [2, 1, 2, 3, 3], holdSeconds: 1 }
} as const);

export const selectV2NpcEvadePersonality = (ordinal: number): V2NpcEvadePersonality =>
  (["cautious", "headlong", "breakthrough"] as const)[ordinal % 3];

type Point = Readonly<{ x: number; y: number; z: number }>;
export type V2NpcEvadeThreatPosition = Readonly<{ sourceAimPosition: Point }>;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

// 見えていない経路や地形を調べず、短い直線区間への接近だけを評価する。
export const npcEvadeSegmentDistanceSquared = (from: Point, to: Point, point: Point) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const t = lengthSquared === 0 ? 0 : clamp01(
    ((point.x - from.x) * dx + (point.y - from.y) * dy + (point.z - from.z) * dz) / lengthSquared
  );
  const x = point.x - from.x - dx * t;
  const y = point.y - from.y - dy * t;
  const z = point.z - from.z - dz * t;
  return x * x + y * y + z * z;
};

export type V2NpcEvadeEvaluation = Readonly<{
  personality: V2NpcEvadePersonality;
  ordinal: number;
  position: Vector3;
  aimPosition: Vector3;
  forward: Vector3;
  previousDirection: Vector3 | null;
  primaryPosition: Point;
  threats: readonly V2NpcEvadeThreatPosition[];
  candidates: readonly NavigationLocation[];
  currentDestination: NavigationLocation | null;
  elapsedSinceSelection: number;
  emergency: boolean;
  arrivalTolerance: number;
}>;

export const selectNpcEvadeDestination = (input: V2NpcEvadeEvaluation) => {
  const { position, primaryPosition, threats, personality } = input;
  const tuning = V2_NPC_EVADE_TUNING;
  const weights = tuning[personality].weights;
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let awayX = position.x - primaryPosition.x;
  let awayZ = position.z - primaryPosition.z;
  const awayLength = Math.hypot(awayX, awayZ);
  if (awayLength === 0) {
    awayX = -input.forward.x;
    awayZ = -input.forward.z;
  } else {
    awayX /= awayLength;
    awayZ /= awayLength;
  }
  const primaryCurrentDistance = Math.hypot(
    input.aimPosition.x - primaryPosition.x,
    input.aimPosition.y - primaryPosition.y,
    input.aimPosition.z - primaryPosition.z
  );
  const height = input.aimPosition.y - position.y;
  // 候補ごとの一時Vector3を作らず、照準点の高さにそろえて比較する。
  const endpoint = { x: 0, y: 0, z: 0 };
  const score = (location: NavigationLocation) => {
    endpoint.x = location.position.x;
    endpoint.y = location.position.y + height;
    endpoint.z = location.position.z;
    let minimumDistanceSquared = Infinity;
    let minimumSegmentDistanceSquared = Infinity;
    for (const threat of threats) {
      const target = threat.sourceAimPosition;
      const dx = endpoint.x - target.x;
      const dy = endpoint.y - target.y;
      const dz = endpoint.z - target.z;
      minimumDistanceSquared = Math.min(minimumDistanceSquared, dx * dx + dy * dy + dz * dz);
      minimumSegmentDistanceSquared = Math.min(minimumSegmentDistanceSquared,
        npcEvadeSegmentDistanceSquared(input.aimPosition, endpoint, target));
    }
    const primaryDistance = Math.hypot(endpoint.x - primaryPosition.x,
      endpoint.y - primaryPosition.y, endpoint.z - primaryPosition.z);
    const dx = endpoint.x - position.x;
    const dz = endpoint.z - position.z;
    const length = Math.hypot(dx, dz);
    const directionX = length === 0 ? 0 : dx / length;
    const directionZ = length === 0 ? 0 : dz / length;
    const awayDot = directionX * awayX + directionZ * awayZ;
    const awayCross = directionX * awayZ - directionZ * awayX;
    const preferredDot = personality === "breakthrough"
      ? (awayDot + Math.abs(awayCross)) * Math.SQRT1_2 : awayDot;
    const previous = input.previousDirection;
    const continuation = previous === null ? 0.5
      : (directionX * previous.x + directionZ * previous.z + 1) * 0.5;
    return (weights[0] * clamp01(Math.sqrt(minimumDistanceSquared) / tuning.candidateRadius)
      + weights[1] * clamp01((primaryDistance - primaryCurrentDistance) / tuning.candidateRadius)
      + weights[2] * clamp01(Math.sqrt(minimumSegmentDistanceSquared) / tuning.candidateRadius)
      + weights[3] * clamp01((preferredDot + 1) * 0.5)
      + weights[4] * clamp01(continuation)) / weightTotal;
  };
  const movable = (location: NavigationLocation) => {
    const target = location.position;
    return Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z)
      > input.arrivalTolerance;
  };
  const current = input.currentDestination !== null && movable(input.currentDestination)
    ? input.currentDestination : null;
  let selected = current;
  let selectedScore = current === null ? -Infinity : score(current);
  const currentScore = selectedScore;
  // 同点は現在の目的地を維持し、初回はIDによって固定された候補順で決める。
  for (let index = 0; index < input.candidates.length; index += 1) {
    const orderedIndex = input.ordinal % 2 === 0 ? index : input.candidates.length - 1 - index;
    const candidate = input.candidates[orderedIndex];
    if (!movable(candidate)) continue;
    const candidateScore = score(candidate);
    if (candidateScore > selectedScore + 1e-6) {
      selected = candidate;
      selectedScore = candidateScore;
    }
  }
  if (current !== null && selected !== current &&
      ((!input.emergency && input.elapsedSinceSelection < tuning[personality].holdSeconds) ||
       selectedScore < currentScore + tuning.improvementThreshold)) {
    return { destination: current, score: currentScore };
  }
  return { destination: selected, score: selectedScore };
};
