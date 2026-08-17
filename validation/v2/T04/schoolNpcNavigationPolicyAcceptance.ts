import { Vector3 } from "@babylonjs/core";

import type {
  NavigationLocation,
  NavigationRouteCandidate,
  NavigationSurfaceStep,
  NavigationTransitionStep
} from "../../../src/world/navigationWorld";
import type {
  SchoolStageDynamicRuntime
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  ELEVATOR_DOOR_MOTION_SECONDS,
  ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS,
  ELEVATOR_TRAVEL_SECONDS
} from "../../../src/world/stageElevatorRuntime";
import type {
  StageElevatorAsset,
  StageElevatorStopAsset
} from "../../../src/world/stageDynamicAssets";
import type {
  StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import type {
  V2CharacterState,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import type {
  V2NpcNavigationRouteContext
} from "../../../src/v2/npcSystem";
import type {
  V2PlayerElevatorTraversalSnapshot
} from "../../../src/v2/npcTraversal";
import {
  createSchoolNpcNavigationPolicy,
  createSchoolNpcNavigationTraits
} from "../../../src/v2/schoolNpcNavigationPolicy";

export type SchoolNpcNavigationPolicyCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

export type SchoolNpcNavigationPolicyAcceptanceInput =
  Readonly<{
    stage: StageSpatialContext;
    runtime: SchoolStageDynamicRuntime;
    updateRuntime(deltaSeconds: number): void;
    trackingActorId: string;
  }>;

const createLocation = (
  position: Vector3
): NavigationLocation =>
  Object.freeze({
    position: position.clone(),
    polygonRef: 1
  });

const createSurfaceStep = (
  position: Vector3,
  distance: number
): NavigationSurfaceStep =>
  Object.freeze({
    kind: "surface",
    points: Object.freeze([createLocation(position)]),
    distance
  });

const createSurfaceCandidate = (
  position: Vector3,
  distance: number
): NavigationRouteCandidate =>
  Object.freeze({
    kind: "surface",
    path: Object.freeze({
      steps: Object.freeze([
        createSurfaceStep(position, distance)
      ]),
      destination: createLocation(position),
      distance
    })
  });

const requireOtherStop = (
  elevator: StageElevatorAsset,
  fromStop: StageElevatorStopAsset
) => {
  const destinationStop = elevator.stops.find(
    (stop) => stop !== fromStop
  );
  if (!destinationStop) {
    throw new Error(
      `エレベーターの反対停止階がありません: ${elevator.id}`
    );
  }
  return destinationStop;
};

const createElevatorCandidate = (
  elevator: StageElevatorAsset,
  walkingDistance: number,
  exitWalkingDistance = 0
): NavigationRouteCandidate => {
  const fromStop = elevator.initialStop;
  const destinationStop = requireOtherStop(
    elevator,
    fromStop
  );
  const entry = createLocation(
    fromStop.node.getAbsolutePosition()
  );
  const exit = createLocation(
    destinationStop.node.getAbsolutePosition()
  );
  const transition: NavigationTransitionStep =
    Object.freeze({
      kind: "transition",
      link: elevator.link,
      from: fromStop.endpoint,
      to: destinationStop.endpoint,
      entry,
      exit,
      distance: 0
    });
  return Object.freeze({
    kind: "link",
    path: Object.freeze({
      steps: Object.freeze([
        createSurfaceStep(entry.position, walkingDistance),
        transition,
        createSurfaceStep(exit.position, exitWalkingDistance)
      ]),
      destination: exit,
      distance: walkingDistance + exitWalkingDistance
    })
  });
};

const createPlayerElevatorTraversalSnapshot = (
  elevator: StageElevatorAsset,
  phase: V2PlayerElevatorTraversalSnapshot["phase"]
): V2PlayerElevatorTraversalSnapshot => {
  const fromStop = elevator.initialStop;
  const destinationStop = requireOtherStop(
    elevator,
    fromStop
  );
  return Object.freeze({
    elevatorId: elevator.id,
    linkId: elevator.link.id,
    from: fromStop.endpoint,
    to: destinationStop.endpoint,
    destinationFloorPosition:
      destinationStop.node.getAbsolutePosition().clone(),
    phase
  });
};

const createTarget = (
  id: string,
  state: V2CharacterState,
  footPosition: Vector3
): V2HumanTargetSnapshot => {
  const brainwashed = state.startsWith("brainwash-");
  const aimPosition = footPosition.add(
    new Vector3(0, 0.2, 0)
  );
  return Object.freeze({
    id,
    kind: "npc",
    footPosition: footPosition.clone(),
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: new Vector3(0.1, 0.2, 0.1)
    }),
    state,
    alive: true,
    brainwashed
  });
};

const createContext = (
  npcId: string,
  position: Vector3,
  overrides: Partial<V2NpcNavigationRouteContext> = {}
): V2NpcNavigationRouteContext =>
  Object.freeze({
    npcId,
    behavior: "wander",
    speed: 0.2,
    characterState: "normal",
    brainwashed: false,
    commandMode: "none",
    targetId: null,
    playerElevatorTraversal: null,
    targetProvenance: null,
    targetSelectionPersonality: null,
    targetSightClear: false,
    currentRouteKind: null,
    currentRouteLinkId: null,
    traversalState: Object.freeze({
      kind: "walking"
    }),
    location: createLocation(position),
    stuckRevision: 0,
    reservationResultRevision: 0,
    ...overrides
  });

const getSelectedElevatorId = (
  candidate: NavigationRouteCandidate | null
) => {
  const transition = candidate?.path.steps.find(
    (
      step
    ): step is NavigationTransitionStep =>
      step.kind === "transition"
  );
  return transition?.link.id ?? null;
};

export const runSchoolNpcNavigationPolicyAcceptance = ({
  stage,
  runtime,
  updateRuntime,
  trackingActorId
}: SchoolNpcNavigationPolicyAcceptanceInput):
  readonly SchoolNpcNavigationPolicyCheck[] => {
  const checks: SchoolNpcNavigationPolicyCheck[] = [];
  const add = (
    name: string,
    ok: boolean,
    detail: string
  ) => {
    checks.push(Object.freeze({ name, ok, detail }));
  };

  const traits = createSchoolNpcNavigationTraits(
    730_429,
    "npc_traits"
  );
  const repeatedTraits = createSchoolNpcNavigationTraits(
    730_429,
    "npc_traits"
  );
  const otherTraits = createSchoolNpcNavigationTraits(
    730_429,
    "npc_traits_other"
  );
  add(
    "traitsはseedとNPC IDから再現する",
    traits.patience === repeatedTraits.patience &&
      traits.riskTolerance ===
        repeatedTraits.riskTolerance &&
      (traits.patience !== otherTraits.patience ||
        traits.riskTolerance !==
          otherTraits.riskTolerance) &&
      traits.patience >= 0 &&
      traits.patience <= 1 &&
      traits.riskTolerance >= 0 &&
      traits.riskTolerance <= 1,
    `patience=${traits.patience.toFixed(6)} risk=${traits.riskTolerance.toFixed(6)}`
  );

  const elevators = stage.elevatorAssets.all;
  if (elevators.length !== 1) {
    throw new Error(
      `学校NPC policy fixtureにはエレベーター1基が必要です: ${elevators.length}`
    );
  }
  const elevator = elevators[0];
  const firstStopCenter = elevator.initialStop.callMat.mesh
    .getBoundingInfo()
    .boundingBox.centerWorld.clone();
  let targets: readonly V2HumanTargetSnapshot[] =
    Object.freeze([
      createTarget("npc_policy", "normal", firstStopCenter)
    ]);
  const createdPolicies: ReturnType<
    typeof createSchoolNpcNavigationPolicy
  >[] = [];
  const createPolicy = () => {
    const policy = createSchoolNpcNavigationPolicy({
      seed: 730_429,
      elevatorAssets: stage.elevatorAssets,
      dynamicRuntime: runtime,
      queries: stage.queries,
      getHumanTargets: () => targets
    });
    createdPolicies.push(policy);
    return policy;
  };

  const fastElevatorCandidate = createElevatorCandidate(
    elevator,
    0
  );
  const elevatorTransition =
    fastElevatorCandidate.path.steps.find(
      (
        step
      ): step is NavigationTransitionStep =>
        step.kind === "transition"
    );
  if (!elevatorTransition) {
    throw new Error(
      "学校NPC policy fixtureのエレベーター遷移がありません。"
    );
  }
  const stairsLong = createSurfaceCandidate(
    firstStopCenter,
    100
  );
  const policy = createPolicy();
  const alarmRooftopStart = stage.navigation.projectPoint(
    new Vector3(1.346851, 0.9, -10.073972),
    0.3
  );
  const alarmRooftopDestination = stage.navigation.projectPoint(
    new Vector3(1.375, 3.625, -8.35),
    0.3
  );
  if (!alarmRooftopStart || !alarmRooftopDestination) {
    throw new Error(
      "実学校Alarm屋上追跡fixtureのNavMesh位置がありません。"
    );
  }
  targets = Object.freeze([
    createTarget(
      "npc_alarm_rooftop",
      "brainwash-complete-no-gun",
      alarmRooftopStart.position
    ),
    createTarget(
      "player",
      "normal",
      alarmRooftopDestination.position
    )
  ]);
  const alarmRooftopPolicy = createPolicy();
  const alarmRooftopPath = stage.navigation.findPath(
    alarmRooftopStart,
    alarmRooftopDestination,
    "npc",
    Object.freeze({
      selectRoute: (candidates) =>
        alarmRooftopPolicy(
          createContext(
            "npc_alarm_rooftop",
            alarmRooftopStart.position,
            {
              behavior: "pursue",
              characterState: "brainwash-complete-no-gun",
              brainwashed: true,
              targetId: "player",
              targetProvenance: "alert"
            }
          ),
          candidates
        )
    })
  );
  const alarmRooftopTransitions =
    alarmRooftopPath?.steps.filter(
      (step): step is NavigationTransitionStep =>
        step.kind === "transition"
    ) ?? [];
  add(
    "実seedのAlarm NPCは屋上追跡で到達経路を選択する",
    alarmRooftopPath !== null,
    `kind=${alarmRooftopTransitions.length > 0 ? "link" : "surface"} / ` +
      `links=${alarmRooftopTransitions.map((step) => step.link.id).join(",") || "none"} / ` +
      `distance=${alarmRooftopPath?.distance.toFixed(3) ?? "null"}`
  );
  const alarmRooftopInitialPositions = Object.freeze([
    new Vector3(1.346851, 0.9, -10.073972),
    new Vector3(-13.874734, 0, 1.601717),
    new Vector3(1.081556, 0.9, -10.501089),
    new Vector3(-14.232798, 0, -1.463871),
    new Vector3(-14.513766, 0, -3.779106),
    new Vector3(3.663434, -0.075, -4.809523),
    new Vector3(0.108797, 0, -0.191375),
    new Vector3(-5.647262, 0.9, -9.574805),
    new Vector3(-3.362051, 0.9, -10.447022),
    new Vector3(2.156412, 3.625, -3.708231)
  ]);
  const alarmRooftopSeedRoutes = alarmRooftopInitialPositions.map(
    (position, index) => {
      const npcId = `npc_${index}`;
      const start = stage.navigation.projectPoint(position, 0.3);
      if (!start) {
        throw new Error(
          `実seedのAlarm NPC開始位置にNavMesh面がありません: ${npcId}`
        );
      }
      targets = Object.freeze([
        createTarget(
          npcId,
          "brainwash-complete-no-gun",
          start.position
        ),
        createTarget(
          "player",
          "normal",
          alarmRooftopDestination.position
        )
      ]);
      const seedPolicy = createPolicy();
      const path = stage.navigation.findPath(
        start,
        alarmRooftopDestination,
        "npc",
        Object.freeze({
          selectRoute: (candidates) =>
            seedPolicy(
              createContext(npcId, start.position, {
                behavior: "pursue",
                characterState: "brainwash-complete-no-gun",
                brainwashed: true,
                targetId: "player",
                targetProvenance: "alert"
              }),
              candidates
            )
        })
      );
      const transitions =
        path?.steps.filter(
          (step): step is NavigationTransitionStep =>
            step.kind === "transition"
        ) ?? [];
      return Object.freeze({
        npcId,
        path,
        kind: transitions.length > 0 ? "link" : "surface"
      });
    }
  );
  add(
    "実seedの初期洗脳済み10 NPCは全員が屋上追跡経路を選択する",
    alarmRooftopSeedRoutes.every((route) => route.path !== null),
    alarmRooftopSeedRoutes
      .map(
        (route) =>
          `${route.npcId}:${route.kind}/${route.path?.distance.toFixed(3) ?? "null"}`
      )
      .join(",")
  );
  targets = Object.freeze([
    createTarget("npc_policy", "normal", firstStopCenter)
  ]);
  const fastSelection = policy(
    createContext("npc_policy", firstStopCenter),
    Object.freeze([
      stairsLong,
      fastElevatorCandidate
    ])
  );
  add(
    "実学校1基の予測時間と階段時間を比較する",
    getSelectedElevatorId(fastSelection) ===
      elevator.link.id,
    `selected=${getSelectedElevatorId(fastSelection)}`
  );
  const waitPointSelection = createPolicy()(
    createContext("npc_wait_point", firstStopCenter, {
      traversalState: Object.freeze({
        kind: "moving-to-elevator-wait",
        linkId: elevator.link.id,
        from: elevatorTransition.from,
        to: elevatorTransition.to,
        entryLocation: elevatorTransition.entry,
        exitLocation: elevatorTransition.exit
      })
    }),
    Object.freeze([
      stairsLong,
      fastElevatorCandidate
    ])
  );
  add(
    "呼出後の待機点移動はエレベーターlinkを再選択しない",
    waitPointSelection?.kind === "surface",
    `selected=${waitPointSelection?.kind ?? "null"}`
  );

  const stairsShort = createSurfaceCandidate(
    firstStopCenter,
    0.001
  );
  const stairsSelection = createPolicy()(
    createContext("npc_policy", firstStopCenter),
    Object.freeze([
      stairsShort,
      fastElevatorCandidate
    ])
  );
  add(
    "短い階段経路をエレベーターより優先する",
    stairsSelection?.kind === "surface",
    `selected=${stairsSelection?.kind ?? "null"}`
  );

  const changedCandidates = Object.freeze([
    createSurfaceCandidate(firstStopCenter, 0.001),
    createElevatorCandidate(elevator, 100)
  ]);
  const stableSelection = policy(
    createContext("npc_policy", firstStopCenter),
    changedCandidates
  );
  add(
    "重要状態不変時は経路比較を振動させない",
    getSelectedElevatorId(stableSelection) ===
      elevator.link.id,
    `selected=${getSelectedElevatorId(stableSelection)}`
  );
  const stuckSelection = policy(
    createContext("npc_policy", firstStopCenter, {
      stuckRevision: 1
    }),
    changedCandidates
  );
  add(
    "stuck revision変更時だけ経路を再評価する",
    stuckSelection?.kind === "surface",
    `selected=${stuckSelection?.kind ?? "null"}`
  );
  const reservationPolicy = createPolicy();
  reservationPolicy(
    createContext("npc_policy", firstStopCenter),
    Object.freeze([stairsLong, fastElevatorCandidate])
  );
  const reservationSelection = reservationPolicy(
    createContext("npc_policy", firstStopCenter, {
      reservationResultRevision: 1
    }),
    changedCandidates
  );
  add(
    "予約・定員結果の受信時に経路を再評価する",
    reservationSelection?.kind === "surface",
    `selected=${reservationSelection?.kind ?? "null"}`
  );

  const farPosition = firstStopCenter.add(
    new Vector3(100, 0, 100)
  );
  targets = Object.freeze([
    createTarget("npc_policy", "evade", farPosition)
  ]);
  const evadeSelection = createPolicy()(
    createContext("npc_policy", farPosition, {
      behavior: "evade",
      characterState: "evade",
      targetId: "enemy",
      targetSightClear: true
    }),
    Object.freeze([
      stairsLong,
      fastElevatorCandidate
    ])
  );
  add(
    "evadeは呼出マット水平3m外のエレベーターを選ばない",
    evadeSelection?.kind === "surface",
    `selected=${evadeSelection?.kind ?? "null"}`
  );

  const carCenter = elevator.car.occupancy.mesh
    .getBoundingInfo()
    .boundingBox.centerWorld.clone();
  const requesterPosition = carCenter.add(
    new Vector3(0.01, 0, 0)
  );
  const brainwashedPosition = carCenter.add(
    new Vector3(-0.01, 0, 0)
  );
  targets = Object.freeze([
    createTarget(
      "npc_policy",
      "normal",
      requesterPosition
    ),
    createTarget(
      "npc_visible_brainwashed",
      "brainwash-complete-no-gun",
      brainwashedPosition
    )
  ]);
  const safeSelection = createPolicy()(
    createContext("npc_policy", requesterPosition),
    Object.freeze([
      stairsLong,
      createElevatorCandidate(elevator, 0)
    ])
  );
  add(
    "未洗脳NPCは可視の洗脳済みNPCがいる便を絶対回避する",
    safeSelection?.kind === "surface",
    `selected=${safeSelection?.kind ?? "null"}`
  );

  const playerReservedTraversal =
    createPlayerElevatorTraversalSnapshot(
      elevator,
      "reserved"
    );
  targets = Object.freeze([
    createTarget(
      "npc_follower_safe",
      "normal",
      requesterPosition
    ),
    createTarget(
      "npc_visible_brainwashed",
      "brainwash-complete-no-gun",
      brainwashedPosition
    )
  ]);
  const safeFollowerSelection = createPolicy()(
    createContext("npc_follower_safe", requesterPosition, {
      behavior: "follow",
      speed: 0.5,
      commandMode: "follow",
      targetId: "player",
      playerElevatorTraversal: playerReservedTraversal
    }),
    Object.freeze([
      stairsLong,
      createElevatorCandidate(elevator, 0)
    ])
  );
  add(
    "未洗脳Followerは可視の洗脳済み同乗者がいる同便を拒否する",
    safeFollowerSelection?.kind === "surface",
    `selected=${safeFollowerSelection?.kind ?? "null"}`
  );

  targets = Object.freeze([
    createTarget(
      "npc_follower_same_trip",
      "normal",
      firstStopCenter
    )
  ]);
  const samePlayerTripSelection = createPolicy()(
    createContext(
      "npc_follower_same_trip",
      firstStopCenter,
      {
        behavior: "follow",
        speed: 0.5,
        commandMode: "follow",
        targetId: "player",
        playerElevatorTraversal:
          playerReservedTraversal
      }
    ),
    Object.freeze([
      stairsShort,
      createElevatorCandidate(elevator, 0)
    ])
  );
  add(
    "Followerはplayer対象の既知便へ間に合う場合に同便を最優先する",
    getSelectedElevatorId(samePlayerTripSelection) ===
      elevator.link.id,
    `selected=${getSelectedElevatorId(samePlayerTripSelection)}`
  );

  targets = Object.freeze([
    createTarget(
      "npc_follower_wrong_target",
      "normal",
      firstStopCenter
    )
  ]);
  const wrongFollowTargetSelection = createPolicy()(
    createContext(
      "npc_follower_wrong_target",
      firstStopCenter,
      {
        behavior: "follow",
        speed: 0.5,
        commandMode: "follow",
        targetId: "npc_not_player",
        playerElevatorTraversal:
          playerReservedTraversal
      }
    ),
    Object.freeze([
      stairsShort,
      createElevatorCandidate(elevator, 0)
    ])
  );
  add(
    "Followerのエレベーター既知便追跡はtargetId=playerだけに適用する",
    wrongFollowTargetSelection?.kind === "surface",
    `selected=${wrongFollowTargetSelection?.kind ?? "null"}`
  );

  targets = Object.freeze([
    createTarget(
      "npc_follower_late",
      "normal",
      firstStopCenter
    )
  ]);
  const lateFollowerDestinationStop = requireOtherStop(
    elevator,
    elevator.initialStop
  );
  const lateFollowerBoardingWindowSeconds = runtime
    .getElevator(elevator.id)
    .estimateTripSeconds(
      elevator.initialStop.id,
      lateFollowerDestinationStop.id
    ).boardingWindowSeconds;
  const lateFollowerApproachDistance =
    (lateFollowerBoardingWindowSeconds + 0.001) * 0.5;
  const lateFollowerSelection = createPolicy()(
    createContext("npc_follower_late", firstStopCenter, {
      behavior: "follow",
      speed: 0.5,
      commandMode: "follow",
      targetId: "player",
      playerElevatorTraversal: playerReservedTraversal
    }),
    Object.freeze([
      stairsShort,
      createElevatorCandidate(
        elevator,
        lateFollowerApproachDistance
      )
    ])
  );
  add(
    "Followerが同便猶予へ間に合わなければ短い別経路を選ぶ",
    lateFollowerSelection?.kind === "surface",
    `window=${lateFollowerBoardingWindowSeconds} / ` +
      `approach=${lateFollowerApproachDistance / 0.5} / ` +
      `selected=${lateFollowerSelection?.kind ?? "null"}`
  );

  const destinationStop = requireOtherStop(
    elevator,
    elevator.initialStop
  );
  const trackingElevator = runtime.getElevator(elevator.id);
  const fullTripActorIds = Object.freeze(
    Array.from(
      { length: 6 },
      (_, index) => `npc_policy_full_${index}`
    )
  );
  targets = Object.freeze([
    createTarget(
      "npc_policy",
      "normal",
      firstStopCenter
    ),
    ...fullTripActorIds.map((actorId) =>
      createTarget(
        actorId,
        "brainwash-complete-no-gun",
        carCenter
      )
    )
  ]);
  const fullTripResults = trackingElevator.requestBoarding(
    fullTripActorIds.map((actorId, index) =>
      Object.freeze({
        actorId,
        fromStopId: elevator.initialStop.id,
        destinationStopId: destinationStop.id,
        requestedAtSeconds: index
      })
    )
  );
  const safeNextTripSelection = createPolicy()(
    createContext("npc_policy", firstStopCenter),
    Object.freeze([
      stairsLong,
      fastElevatorCandidate
    ])
  );
  add(
    "未洗脳NPCは可視の敵が降りる現便と次便を分離する",
    fullTripResults.every(
      (result) => result.status === "accepted"
    ) &&
      getSelectedElevatorId(safeNextTripSelection) ===
        elevator.link.id,
    `capacity=${trackingElevator.estimateTripSeconds(
      elevator.initialStop.id,
      destinationStop.id
    ).availableCapacity} / selected=` +
      `${getSelectedElevatorId(safeNextTripSelection)}`
  );

  targets = Object.freeze([
    createTarget(
      "npc_follower_full",
      "brainwash-complete-no-gun",
      firstStopCenter
    ),
    ...fullTripActorIds.map((actorId) =>
      createTarget(
        actorId,
        "brainwash-complete-no-gun",
        carCenter
      )
    )
  ]);
  const playerRidingTraversal =
    createPlayerElevatorTraversalSnapshot(
      elevator,
      "riding"
    );
  const fullFollowerAlternativeSelection = createPolicy()(
    createContext("npc_follower_full", firstStopCenter, {
      behavior: "follow",
      speed: 0.5,
      characterState: "brainwash-complete-no-gun",
      brainwashed: true,
      commandMode: "follow",
      targetId: "player",
      playerElevatorTraversal: playerRidingTraversal
    }),
    Object.freeze([
      stairsShort,
      fastElevatorCandidate
    ])
  );
  add(
    "満員便へ乗れないFollowerは短い別経路へ切り替える",
    fullFollowerAlternativeSelection?.kind === "surface",
    `capacity=${trackingElevator.estimateTripSeconds(
      elevator.initialStop.id,
      destinationStop.id
    ).availableCapacity} / selected=` +
      `${fullFollowerAlternativeSelection?.kind ?? "null"}`
  );
  const fullFollowerNextTripSelection = createPolicy()(
    createContext("npc_follower_full", firstStopCenter, {
      behavior: "follow",
      speed: 0.5,
      characterState: "brainwash-complete-no-gun",
      brainwashed: true,
      commandMode: "follow",
      targetId: "player",
      playerElevatorTraversal: playerRidingTraversal
    }),
    Object.freeze([
      stairsLong,
      fastElevatorCandidate
    ])
  );
  add(
    "満員便でも別経路が長いFollowerは次便として追跡を維持する",
    getSelectedElevatorId(fullFollowerNextTripSelection) ===
      elevator.link.id,
    `capacity=${trackingElevator.estimateTripSeconds(
      elevator.initialStop.id,
      destinationStop.id
    ).availableCapacity} / selected=` +
      `${getSelectedElevatorId(fullFollowerNextTripSelection)}`
  );
  for (const actorId of fullTripActorIds) {
    trackingElevator.cancelBoardingReservation(actorId);
  }

  targets = Object.freeze([
    createTarget(
      "npc_brainwashed_tracker",
      "brainwash-complete-no-gun",
      firstStopCenter
    ),
    createTarget(
      trackingActorId,
      "normal",
      carCenter
    )
  ]);
  const trackingPolicy = createPolicy();
  const trackingStairs = createSurfaceCandidate(
    firstStopCenter,
    5
  );
  const trackingContext = createContext(
    "npc_brainwashed_tracker",
    firstStopCenter,
    {
      behavior: "pursue",
      characterState: "brainwash-complete-no-gun",
      brainwashed: true,
      targetId: trackingActorId,
      targetSightClear: true,
      currentRouteKind: "link",
      currentRouteLinkId: elevator.link.id,
      traversalState: Object.freeze({
        kind: "waiting-elevator-call",
        linkId: elevator.link.id,
        from: elevatorTransition.from,
        to: elevatorTransition.to,
        entryLocation: elevatorTransition.entry,
        exitLocation: elevatorTransition.exit
      })
    }
  );
  const targetReservation = trackingElevator.requestBoarding(
    Object.freeze({
      actorId: trackingActorId,
      fromStopId: elevator.initialStop.id,
      destinationStopId: destinationStop.id,
      requestedAtSeconds: 1
    })
  );
  if (targetReservation.status !== "accepted") {
    throw new Error(
      `追跡対象の乗車予約が拒否されました: ${targetReservation.status}`
    );
  }
  trackingElevator.completeBoarding(trackingActorId);
  const lockedNewActorSelection = createPolicy()(
    createContext(
      "npc_brainwashed_tracker",
      firstStopCenter,
      {
        behavior: "pursue",
        characterState: "brainwash-complete-no-gun",
        brainwashed: true,
        targetId: trackingActorId,
        targetSightClear: true
      }
    ),
    Object.freeze([
      trackingStairs,
      fastElevatorCandidate
    ])
  );
  add(
    "locked呼出マットでは未受付NPCがエレベーターを新規選択しない",
    lockedNewActorSelection?.kind === "surface",
    `callMat=${trackingElevator
      .getSnapshot()
      .stops.find(
        (stop) => stop.id === elevator.initialStop.id
      )?.callMatState} / selected=` +
      `${lockedNewActorSelection?.kind ?? "null"}`
  );
  const sameTripSelection = trackingPolicy(
    trackingContext,
    Object.freeze([
      trackingStairs,
      fastElevatorCandidate
    ])
  );
  const trackingEstimate =
    trackingElevator.estimateTripSeconds(
      elevator.initialStop.id,
      destinationStop.id
    );
  const trackingCallMatState = trackingElevator
    .getSnapshot()
    .stops.find(
      (stop) => stop.id === elevator.initialStop.id
    )?.callMatState;
  add(
    "洗脳済みNPCは追跡対象と同便へ間に合う場合に選択する",
    getSelectedElevatorId(sameTripSelection) ===
      elevator.link.id,
    `selected=${getSelectedElevatorId(sameTripSelection)} / ` +
      `route=${trackingContext.currentRouteKind}/` +
      `${trackingContext.currentRouteLinkId}/` +
      `${trackingContext.traversalState.kind} / ` +
      `callMat=${trackingCallMatState} / ` +
      `estimate=${trackingEstimate.totalSeconds}/` +
      `${trackingEstimate.boardingWindowSeconds}/` +
      `${trackingEstimate.availableCapacity}`
  );
  const immediateBoardingSelection = createPolicy()(
    trackingContext,
    Object.freeze([
      createSurfaceCandidate(firstStopCenter, 7.5),
      createElevatorCandidate(elevator, 0, 2)
    ])
  );
  add(
    "降車後歩行が長くても乗車前に間に合えば同便を選択する",
    getSelectedElevatorId(immediateBoardingSelection) ===
      elevator.link.id,
    `selected=${getSelectedElevatorId(immediateBoardingSelection)}`
  );
  const lateApproachSelection = createPolicy()(
    trackingContext,
    Object.freeze([
      createSurfaceCandidate(firstStopCenter, 7.5),
      createElevatorCandidate(elevator, 2)
    ])
  );
  add(
    "同便の残り乗車時間へ間に合わなければ次便として比較する",
    lateApproachSelection?.kind === "surface",
    `dwell=${trackingElevator.getSnapshot().dwellRemainingSeconds} / ` +
      `selected=${lateApproachSelection?.kind ?? "null"}`
  );

  updateRuntime(ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS);
  updateRuntime(ELEVATOR_DOOR_MOTION_SECONDS);
  const departedSnapshot = trackingElevator.getSnapshot();
  const nextTripSelection = createPolicy()(
    trackingContext,
    Object.freeze([
      createSurfaceCandidate(firstStopCenter, 20),
      fastElevatorCandidate
    ])
  );
  add(
    "同便へ間に合わなくても階段が長ければ次便を選択する",
    departedSnapshot.carState === "moving" &&
      getSelectedElevatorId(nextTripSelection) ===
        elevator.link.id,
    `car=${departedSnapshot.carState} / selected=` +
      `${getSelectedElevatorId(nextTripSelection)}`
  );
  const stairsFallbackSelection = createPolicy()(
    trackingContext,
    Object.freeze([
      trackingStairs,
      fastElevatorCandidate
    ])
  );
  add(
    "同便へ間に合わず階段が短ければ階段で追跡する",
    departedSnapshot.carState === "moving" &&
      stairsFallbackSelection?.kind === "surface",
    `car=${departedSnapshot.carState} / selected=` +
      `${stairsFallbackSelection?.kind ?? "null"}`
  );

  updateRuntime(ELEVATOR_TRAVEL_SECONDS);
  updateRuntime(ELEVATOR_DOOR_MOTION_SECONDS);
  trackingElevator.completeDisembark(trackingActorId);
  trackingElevator.requestCall(elevator.initialStop.id);
  updateRuntime(0);
  updateRuntime(ELEVATOR_DOOR_MOTION_SECONDS);
  updateRuntime(ELEVATOR_TRAVEL_SECONDS);
  updateRuntime(ELEVATOR_DOOR_MOTION_SECONDS);
  const restoredElevator = trackingElevator.getSnapshot();
  if (
    restoredElevator.currentStopId !== elevator.initialStop.id ||
    restoredElevator.carDoorState !== "open" ||
    restoredElevator.passengers.length !== 0 ||
    restoredElevator.reservations.length !== 0
  ) {
    throw new Error(
      "学校NPC経路policy fixture後にエレベーター初期状態を復元できません。"
    );
  }
  for (const createdPolicy of createdPolicies) {
    createdPolicy.dispose();
  }

  return Object.freeze(checks);
};
