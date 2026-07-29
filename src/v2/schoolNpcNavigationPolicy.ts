import type {
  NavigationRouteCandidate,
  NavigationTransitionStep
} from "../world/navigationWorld";
import type {
  SchoolStageDynamicRuntime
} from "../world/schoolStageDynamicRuntime";
import {
  ELEVATOR_DOOR_MOTION_SECONDS,
  ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS,
  ELEVATOR_TRAVEL_SECONDS,
  type StageElevatorRuntime,
  type StageElevatorSnapshot,
  type StageElevatorTripEstimate
} from "../world/stageElevatorRuntime";
import type {
  StageElevatorAsset,
  StageElevatorAssetRegistry,
  StageElevatorStopAsset
} from "../world/stageDynamicAssets";
import type {
  StageSpatialQueries
} from "../world/stageSpatialQueries";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import type {
  V2NpcNavigationRouteContext
} from "./npcSystem";
import type {
  V2HumanTargetSnapshot
} from "./combatTypes";

const FNV_1A_OFFSET_BASIS = 0x811c9dc5;
const FNV_1A_PRIME = 0x01000193;
const NPC_TRAIT_SALT = "haigure-v2:t04-3b:npc-navigation:v1";
const EVADE_ELEVATOR_MAX_DISTANCE_METERS = 3;
const EVADE_ELEVATOR_MAX_DISTANCE_WORLD_UNITS =
  EVADE_ELEVATOR_MAX_DISTANCE_METERS *
  BLENDER_METERS_TO_WORLD_UNITS;
const NPC_PATIENCE_MAX_WAIT_SECONDS = 5;
const NPC_RISK_PENALTY_MAX_SECONDS = 5;
const NEXT_TRIP_ADDITIONAL_SECONDS =
  ELEVATOR_DOOR_MOTION_SECONDS +
  ELEVATOR_TRAVEL_SECONDS +
  ELEVATOR_DOOR_MOTION_SECONDS +
  ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS +
  ELEVATOR_DOOR_MOTION_SECONDS +
  ELEVATOR_TRAVEL_SECONDS +
  ELEVATOR_DOOR_MOTION_SECONDS;

export type SchoolNpcNavigationTraits = Readonly<{
  patience: number;
  riskTolerance: number;
}>;

export type SchoolNpcElevatorBoardingMode = "same" | "next";

export type SchoolNpcElevatorSafetyQuery = Readonly<{
  npcId: string;
  elevatorId: string;
  fromStopId: string;
  destinationStopId: string;
  boardingMode: SchoolNpcElevatorBoardingMode;
}>;

export type SchoolNpcNavigationPolicyOptions = Readonly<{
  seed: number;
  elevatorAssets: StageElevatorAssetRegistry;
  dynamicRuntime: SchoolStageDynamicRuntime;
  queries: StageSpatialQueries;
  getHumanTargets(): readonly V2HumanTargetSnapshot[];
}>;

export interface SchoolNpcNavigationPolicy {
  (
    context: V2NpcNavigationRouteContext,
    candidates: readonly NavigationRouteCandidate[]
  ): NavigationRouteCandidate | null;
  dispose(): void;
}

type ElevatorBinding = Readonly<{
  asset: StageElevatorAsset;
  runtime: StageElevatorRuntime;
}>;

type ResolvedElevatorCandidate = Readonly<{
  candidate: NavigationRouteCandidate;
  binding: ElevatorBinding;
  transition: NavigationTransitionStep;
  fromStop: StageElevatorStopAsset;
  destinationStop: StageElevatorStopAsset;
}>;

type CachedDecision = Readonly<{
  signature: string;
  selectedCandidateKey: string | null;
}>;

type ElevatorCandidateEvaluation = Readonly<{
  resolved: ResolvedElevatorCandidate;
  candidateKey: string;
  comparisonSeconds: number;
  signature: Readonly<Record<string, unknown>>;
}>;

type BrainwashedTrackingTrip = Readonly<{
  targetActorId: string;
  boardingMode: SchoolNpcElevatorBoardingMode;
}>;

const assertSeed = (seed: number) => {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(
      "学校NPC経路policyのseedには0以上の安全な整数が必要です。"
    );
  }
};

const assertOpaqueId = (name: string, value: string) => {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(
      `${name}には前後空白のない非空文字列が必要です。`
    );
  }
};

const assertPositiveFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}には正の有限値が必要です。`);
  }
};

const assertRevision = (name: string, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name}には0以上の安全な整数が必要です。`);
  }
};

const hashTraitKey = (value: string) => {
  let hash = FNV_1A_OFFSET_BASIS;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    hash ^= codeUnit & 0xff;
    hash = Math.imul(hash, FNV_1A_PRIME);
    hash ^= codeUnit >>> 8;
    hash = Math.imul(hash, FNV_1A_PRIME);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
};

const createUnitTrait = (
  seed: number,
  npcId: string,
  trait: keyof SchoolNpcNavigationTraits
) =>
  hashTraitKey(
    `${NPC_TRAIT_SALT}:${seed}:${npcId}:${trait}`
  ) / 0xffff_ffff;

export const createSchoolNpcNavigationTraits = (
  seed: number,
  npcId: string
): SchoolNpcNavigationTraits => {
  assertSeed(seed);
  assertOpaqueId("学校NPC経路traitのNPC ID", npcId);
  return Object.freeze({
    patience: createUnitTrait(seed, npcId, "patience"),
    riskTolerance: createUnitTrait(
      seed,
      npcId,
      "riskTolerance"
    )
  });
};

const compareIds = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const requireSingleCandidate = (
  kind: NavigationRouteCandidate["kind"],
  candidates: readonly NavigationRouteCandidate[]
) => {
  const matching = candidates.filter(
    (candidate) => candidate.kind === kind
  );
  if (matching.length > 1) {
    throw new Error(
      `学校NPC経路候補の${kind}が重複しています。`
    );
  }
  return matching[0] ?? null;
};

const createCandidateKey = (
  candidate: NavigationRouteCandidate
) => {
  if (candidate.kind === "surface") {
    return "surface";
  }
  const transition = candidate.path.steps.find(
    (
      step
    ): step is NavigationTransitionStep =>
      step.kind === "transition"
  );
  if (!transition) {
    throw new Error(
      "学校NPCのlink経路に遷移がありません。"
    );
  }
  return [
    "link",
    transition.link.id,
    transition.from,
    transition.to
  ].join(":");
};

const resolveElevatorStop = (
  asset: StageElevatorAsset,
  endpoint: "A" | "B"
) => {
  const stop = asset.stops.find(
    (candidate) => candidate.endpoint === endpoint
  );
  if (!stop) {
    throw new Error(
      `エレベーター端点に対応する停止階がありません: ` +
        `${asset.id}/${endpoint}`
    );
  }
  return stop;
};

const resolveElevatorCandidate = (
  candidate: NavigationRouteCandidate | null,
  bindingByLinkId: ReadonlyMap<string, ElevatorBinding>
): ResolvedElevatorCandidate | null => {
  if (!candidate) {
    return null;
  }
  const transitions = candidate.path.steps.filter(
    (
      step
    ): step is NavigationTransitionStep =>
      step.kind === "transition"
  );
  if (transitions.length !== 1) {
    throw new Error(
      "学校NPCのlink経路にはエレベーター遷移が1件必要です。"
    );
  }
  const transition = transitions[0];
  if (transition.link.kind !== "elevator") {
    throw new Error(
      `学校NPC経路policyへ非エレベーターlinkが渡されました: ` +
        `${transition.link.id}/${transition.link.kind}`
    );
  }
  const binding = bindingByLinkId.get(transition.link.id);
  if (!binding) {
    throw new Error(
      `実学校エレベーター資産に未登録のlinkです: ` +
        transition.link.id
    );
  }
  return Object.freeze({
    candidate,
    binding,
    transition,
    fromStop: resolveElevatorStop(
      binding.asset,
      transition.from
    ),
    destinationStop: resolveElevatorStop(
      binding.asset,
      transition.to
    )
  });
};

const calculateSurfaceDistance = (
  candidate: NavigationRouteCandidate
) =>
  candidate.path.steps.reduce(
    (distance, step) =>
      step.kind === "surface"
        ? distance + step.distance
        : distance,
    0
  );

const calculateBoardingApproachDistance = (
  candidate: NavigationRouteCandidate
) => {
  let distance = 0;
  for (const step of candidate.path.steps) {
    if (step.kind === "transition") {
      break;
    }
    distance += step.distance;
  }
  return distance;
};

const getCallMatCenter = (stop: StageElevatorStopAsset) => {
  stop.callMat.mesh.computeWorldMatrix(true);
  return stop.callMat.mesh
    .getBoundingInfo()
    .boundingBox.centerWorld;
};

const isWithinEvadeCallDistance = (
  context: V2NpcNavigationRouteContext,
  stop: StageElevatorStopAsset
) => {
  const center = getCallMatCenter(stop);
  return (
    Math.hypot(
      context.location.position.x - center.x,
      context.location.position.z - center.z
    ) <= EVADE_ELEVATOR_MAX_DISTANCE_WORLD_UNITS
  );
};

const createReservationCapacitySignature = (
  snapshot: StageElevatorSnapshot
) =>
  JSON.stringify({
    reservations: snapshot.reservations
      .map((reservation) => [
        reservation.actorId,
        reservation.fromStopId,
        reservation.destinationStopId
      ])
      .sort((left, right) =>
        compareIds(left.join("\u0000"), right.join("\u0000"))
      ),
    passengers: snapshot.passengers
      .map((passenger) => [
        passenger.actorId,
        passenger.destinationStopId
      ])
      .sort((left, right) =>
        compareIds(left.join("\u0000"), right.join("\u0000"))
      )
  });

const createElevatorMotionSignature = (
  snapshot: StageElevatorSnapshot
) =>
  JSON.stringify([
    snapshot.carState,
    snapshot.currentStopId,
    snapshot.targetStopId
  ]);

const normalizeVisibleActorIds = (
  actorIds: readonly string[]
) => {
  const uniqueIds = new Set<string>();
  for (const actorId of actorIds) {
    assertOpaqueId("可視洗脳済みActor ID", actorId);
    if (uniqueIds.has(actorId)) {
      throw new Error(
        `可視洗脳済みActor IDが重複しています: ${actorId}`
      );
    }
    uniqueIds.add(actorId);
  }
  return Object.freeze([...uniqueIds].sort(compareIds));
};

const collectVisibleBrainwashedActorIds = (
  query: SchoolNpcElevatorSafetyQuery,
  asset: StageElevatorAsset,
  runtime: StageElevatorRuntime,
  fromStop: StageElevatorStopAsset,
  queries: StageSpatialQueries,
  targets: readonly V2HumanTargetSnapshot[]
) => {
  const requester = targets.find(
    (target) => target.id === query.npcId
  );
  if (!requester) {
    throw new Error(
      `学校NPC経路policyの要求者snapshotがありません: ${query.npcId}`
    );
  }
  const elevatorSnapshot = runtime.getSnapshot();
  const committedActorIds = new Set(
    query.boardingMode === "same"
      ? [
          ...elevatorSnapshot.passengers.map(
            (passenger) => passenger.actorId
          ),
          ...elevatorSnapshot.reservations.map(
            (reservation) => reservation.actorId
          )
        ]
      : []
  );
  const boardingVolumeIds =
    query.boardingMode === "same"
      ? Object.freeze([
          fromStop.callMat.id,
          fromStop.threshold.id,
          asset.car.occupancy.id
        ])
      : Object.freeze([
          fromStop.callMat.id,
          fromStop.threshold.id
        ]);
  return normalizeVisibleActorIds(
    targets
      .filter(
        (target) =>
          target.id !== requester.id &&
          target.kind === "npc" &&
          target.alive &&
          target.brainwashed &&
          (committedActorIds.has(target.id) ||
            boardingVolumeIds.some((volumeId) =>
              queries.containsVolumeById(
                volumeId,
                target.footPosition
              )
            )) &&
          queries.castSightSegment(
            requester.aimPosition,
            target.aimPosition
          ) === null
      )
      .map((target) => target.id)
  );
};

const resolveBrainwashedTrackingTrip = (
  context: V2NpcNavigationRouteContext,
  snapshot: StageElevatorSnapshot,
  fromStop: StageElevatorStopAsset,
  destinationStop: StageElevatorStopAsset,
  estimate: StageElevatorTripEstimate,
  walkingSeconds: number
): BrainwashedTrackingTrip | null => {
  if (!context.brainwashed || context.targetId === null) {
    return null;
  }
  const targetReservation = snapshot.reservations.find(
    (reservation) =>
      reservation.actorId === context.targetId &&
      reservation.fromStopId === fromStop.id &&
      reservation.destinationStopId === destinationStop.id
  );
  const targetPassenger = snapshot.passengers.find(
    (passenger) =>
      passenger.actorId === context.targetId &&
      passenger.destinationStopId === destinationStop.id
  );
  if (!targetReservation && !targetPassenger) {
    return null;
  }
  const targetStillBoardable =
    targetReservation !== undefined ||
    (snapshot.carState === "stopped" &&
      snapshot.currentStopId === fromStop.id &&
      (snapshot.carDoorState === "opening" ||
        snapshot.carDoorState === "open"));
  return Object.freeze({
    targetActorId: context.targetId,
    boardingMode:
      targetStillBoardable &&
      estimate.capacityAvailable &&
      walkingSeconds <= estimate.boardingWindowSeconds
        ? "same"
        : "next"
  });
};

export const createSchoolNpcNavigationPolicy = ({
  seed,
  elevatorAssets,
  dynamicRuntime,
  queries,
  getHumanTargets
}: SchoolNpcNavigationPolicyOptions): SchoolNpcNavigationPolicy => {
  assertSeed(seed);
  const bindingByLinkId = new Map<string, ElevatorBinding>();
  for (const asset of elevatorAssets.all) {
    assertOpaqueId("学校エレベーターID", asset.id);
    assertOpaqueId("学校エレベーターlink ID", asset.link.id);
    if (bindingByLinkId.has(asset.link.id)) {
      throw new Error(
        `学校エレベーターlink IDが重複しています: ` +
          asset.link.id
      );
    }
    bindingByLinkId.set(
      asset.link.id,
      Object.freeze({
        asset,
        runtime: dynamicRuntime.getElevator(asset.id)
      })
    );
  }

  const traitsByNpcId = new Map<
    string,
    SchoolNpcNavigationTraits
  >();
  const decisionsByNpcId = new Map<string, CachedDecision>();
  const stableDoorStateById = new Map<string, "closed" | "open">();
  const stableElevatorDoorStateById = new Map<
    string,
    "closed" | "open"
  >();
  let disposed = false;

  const getTraits = (npcId: string) => {
    const existing = traitsByNpcId.get(npcId);
    if (existing) {
      return existing;
    }
    const traits = createSchoolNpcNavigationTraits(seed, npcId);
    traitsByNpcId.set(npcId, traits);
    return traits;
  };

  const createDoorStableSignature = (
    elevatorSnapshots: readonly StageElevatorSnapshot[]
  ) => {
    const doorSnapshot = dynamicRuntime.doors.getSnapshot();
    for (const door of doorSnapshot.doors) {
      if (door.state === "closed" || door.state === "open") {
        stableDoorStateById.set(door.id, door.state);
      }
    }
    for (const elevatorSnapshot of elevatorSnapshots) {
      if (
        elevatorSnapshot.carDoorState === "closed" ||
        elevatorSnapshot.carDoorState === "open"
      ) {
        stableElevatorDoorStateById.set(
          elevatorSnapshot.id,
          elevatorSnapshot.carDoorState
        );
      }
    }
    return JSON.stringify({
      doors: [...stableDoorStateById.entries()].sort(
        (left, right) => compareIds(left[0], right[0])
      ),
      elevators: [...stableElevatorDoorStateById.entries()].sort(
        (left, right) => compareIds(left[0], right[0])
      )
    });
  };

  const selectRoute = (
    context: V2NpcNavigationRouteContext,
    candidates: readonly NavigationRouteCandidate[]
  ) => {
    if (disposed) {
      throw new Error(
        "SchoolNpcNavigationPolicyは破棄済みです。"
      );
    }
    assertOpaqueId("学校NPC経路policyのNPC ID", context.npcId);
    assertPositiveFiniteNumber("学校NPCの移動速度", context.speed);

    const surfaceCandidate = requireSingleCandidate(
      "surface",
      candidates
    );
    const elevatorCandidates = candidates
      .filter((candidate) => candidate.kind === "link")
      .map((candidate) => {
        const resolved = resolveElevatorCandidate(
          candidate,
          bindingByLinkId
        );
        if (!resolved) {
          throw new Error(
            "学校NPCのlink候補を解決できません。"
          );
        }
        return resolved;
      });
    if (
      context.traversalState.kind ===
      "moving-to-elevator-wait"
    ) {
      const selectedCandidateKey = surfaceCandidate
        ? createCandidateKey(surfaceCandidate)
        : null;
      decisionsByNpcId.set(
        context.npcId,
        Object.freeze({
          signature:
            "moving-to-elevator-wait:surface-only",
          selectedCandidateKey
        })
      );
      return surfaceCandidate;
    }
    if (elevatorCandidates.length === 0) {
      const selectedCandidateKey = surfaceCandidate
        ? createCandidateKey(surfaceCandidate)
        : null;
      decisionsByNpcId.set(
        context.npcId,
        Object.freeze({
          signature: "surface-only",
          selectedCandidateKey
        })
      );
      return surfaceCandidate;
    }

    assertRevision(
      `NPC ${context.npcId}のstuck revision`,
      context.stuckRevision
    );
    assertRevision(
      `NPC ${context.npcId}の予約結果revision`,
      context.reservationResultRevision
    );
    const evade = context.behavior === "evade";
    const traits = getTraits(context.npcId);
    const riskPenalty =
      evade &&
      context.targetId !== null &&
      context.targetSightClear
        ? NPC_RISK_PENALTY_MAX_SECONDS *
          (1 - traits.riskTolerance)
        : 0;
    const targets = getHumanTargets();
    const elevatorSnapshots = elevatorCandidates.map(
      (candidate) =>
        candidate.binding.runtime.getSnapshot()
    );
    const evaluations: ElevatorCandidateEvaluation[] =
      elevatorCandidates.map((elevatorCandidate, index) => {
        const elevatorSnapshot = elevatorSnapshots[index]!;
        const estimate =
          elevatorCandidate.binding.runtime.estimateTripSeconds(
            elevatorCandidate.fromStop.id,
            elevatorCandidate.destinationStop.id
          );
        const walkingSeconds =
          calculateSurfaceDistance(
            elevatorCandidate.candidate
          ) / context.speed;
        const boardingApproachSeconds =
          calculateBoardingApproachDistance(
            elevatorCandidate.candidate
          ) / context.speed;
        const trackingTrip = resolveBrainwashedTrackingTrip(
          context,
          elevatorSnapshot,
          elevatorCandidate.fromStop,
          elevatorCandidate.destinationStop,
          estimate,
          boardingApproachSeconds
        );
        const boardingMode: SchoolNpcElevatorBoardingMode =
          trackingTrip?.boardingMode ??
          (estimate.capacityAvailable ? "same" : "next");
        const visibleBrainwashedActorIds =
          collectVisibleBrainwashedActorIds(
            Object.freeze({
              npcId: context.npcId,
              elevatorId:
                elevatorCandidate.binding.asset.id,
              fromStopId: elevatorCandidate.fromStop.id,
              destinationStopId:
                elevatorCandidate.destinationStop.id,
              boardingMode
            }),
            elevatorCandidate.binding.asset,
            elevatorCandidate.binding.runtime,
            elevatorCandidate.fromStop,
            queries,
            targets
          );
        const allowedByDistance =
          !evade ||
          isWithinEvadeCallDistance(
            context,
            elevatorCandidate.fromStop
          );
        const allowedByFaction =
          context.brainwashed ||
          visibleBrainwashedActorIds.length === 0;
        const comparisonSeconds =
          allowedByDistance && allowedByFaction
            ? walkingSeconds +
              estimate.totalSeconds +
              (boardingMode === "next"
                ? NEXT_TRIP_ADDITIONAL_SECONDS
                : 0) +
              riskPenalty
            : Number.POSITIVE_INFINITY;
        return Object.freeze({
          resolved: elevatorCandidate,
          candidateKey: createCandidateKey(
            elevatorCandidate.candidate
          ),
          comparisonSeconds,
          signature: Object.freeze({
            candidateKey: createCandidateKey(
              elevatorCandidate.candidate
            ),
            destinationFloor:
              elevatorCandidate.destinationStop.floorIndex,
            boardingMode,
            elevatorMotion:
              createElevatorMotionSignature(
                elevatorSnapshot
              ),
            reservationCapacity:
              createReservationCapacitySignature(
                elevatorSnapshot
              ),
            trackingTrip,
            visibleBrainwashedActorIds,
            allowedByDistance,
            allowedByFaction
          })
        });
      });
    const signature = JSON.stringify({
      targetId: context.targetId,
      brainwashed: context.brainwashed,
      commandMode: context.commandMode,
      evade,
      doorStable:
        createDoorStableSignature(elevatorSnapshots),
      targetSightClear: context.targetSightClear,
      stuckRevision: context.stuckRevision,
      reservationResultRevision:
        context.reservationResultRevision,
      candidates: evaluations.map(
        (evaluation) => evaluation.signature
      )
    });
    const previous = decisionsByNpcId.get(context.npcId);
    if (previous?.signature === signature) {
      if (previous.selectedCandidateKey === null) {
        return null;
      }
      return (
        candidates.find(
          (candidate) =>
            createCandidateKey(candidate) ===
            previous.selectedCandidateKey
        ) ?? null
      );
    }

    let selected: NavigationRouteCandidate | null =
      surfaceCandidate;
    let selectedCandidateKey = surfaceCandidate
      ? createCandidateKey(surfaceCandidate)
      : null;
    let selectedComparisonSeconds = surfaceCandidate
      ? surfaceCandidate.path.distance / context.speed +
        NPC_PATIENCE_MAX_WAIT_SECONDS * traits.patience
      : Number.POSITIVE_INFINITY;
    for (const evaluation of [...evaluations].sort(
      (left, right) =>
        compareIds(left.candidateKey, right.candidateKey)
    )) {
      if (
        evaluation.comparisonSeconds <
        selectedComparisonSeconds
      ) {
        selected = evaluation.resolved.candidate;
        selectedCandidateKey = evaluation.candidateKey;
        selectedComparisonSeconds =
          evaluation.comparisonSeconds;
        continue;
      }
      if (
        evaluation.comparisonSeconds !==
          selectedComparisonSeconds ||
        !Number.isFinite(evaluation.comparisonSeconds)
      ) {
        continue;
      }
      const keepsCurrentElevator =
        context.currentRouteKind === "link" &&
        context.currentRouteLinkId ===
          evaluation.resolved.transition.link.id;
      if (keepsCurrentElevator) {
        selected = evaluation.resolved.candidate;
        selectedCandidateKey = evaluation.candidateKey;
      }
    }
    decisionsByNpcId.set(
      context.npcId,
      Object.freeze({
        signature,
        selectedCandidateKey
      })
    );
    return selected;
  };
  return Object.freeze(
    Object.assign(selectRoute, {
      dispose: () => {
        if (disposed) {
          throw new Error(
            "SchoolNpcNavigationPolicyは破棄済みです。"
          );
        }
        traitsByNpcId.clear();
        decisionsByNpcId.clear();
        stableDoorStateById.clear();
        stableElevatorDoorStateById.clear();
        bindingByLinkId.clear();
        disposed = true;
      }
    })
  );
};
