import { Vector3 } from "@babylonjs/core";

import type {
  StageDoorAsset,
  StageElevatorAsset,
  StageElevatorStopAsset
} from "../world/stageDynamicAssets";
import {
  intersectsStageDoorClosedPose
} from "../world/stageDoorRuntime";
import type { StageSpatialContext } from "../world/stageSpatialContext";
import type {
  SchoolStageActorPort,
  SchoolStageDynamicRuntime,
  SchoolStageDynamicRuntimeSnapshot
} from "../world/schoolStageDynamicRuntime";
import type { V2HumanTargetSnapshot } from "./combatTypes";
import type {
  V2NpcElevatorTraversalIdentity,
  V2NpcElevatorTraversalRoute,
  V2NpcTraversalNotification,
  V2NpcTraversalRequest,
  V2NpcTraversalResult,
  V2PlayerElevatorTraversalSnapshot
} from "./npcTraversal";
import type { V2PlayerController } from "./playerController";
import type { V2SurvivalRuntime } from "./survivalRuntime";

const PLAYER_ID = "player";
const DOOR_PASS_SIDE_EPSILON = 1e-9;

type WaitingDoorPass = Readonly<{
  npcId: string;
  door: StageDoorAsset;
  entrySide: -1 | 1;
}>;

type WaitingElevatorCall = Readonly<{
  request: Extract<
    V2NpcTraversalRequest,
    {
      kind: "elevator-call";
    }
  >;
  elevator: StageElevatorAsset;
  fromStop: StageElevatorStopAsset;
  callAccepted: boolean;
}>;

type PendingBoarding = Readonly<{
  request: Extract<
    V2NpcTraversalRequest,
    {
      kind: "elevator-board";
    }
  >;
  elevator: StageElevatorAsset;
  fromStop: StageElevatorStopAsset;
  destinationStop: StageElevatorStopAsset;
}>;

type PlayerElevatorTraversalRoute = Readonly<{
  elevator: StageElevatorAsset;
  fromStop: StageElevatorStopAsset;
  destinationStop: StageElevatorStopAsset;
  requestedAtSeconds: number;
}>;

type PlayerElevatorTraversalState =
  | Readonly<{
      kind: "awaiting-call";
      route: PlayerElevatorTraversalRoute;
    }>
  | Readonly<{
      kind: "calling";
      route: PlayerElevatorTraversalRoute;
    }>
  | Readonly<{
      kind: "reserved";
      route: PlayerElevatorTraversalRoute;
    }>
  | Readonly<{
      kind: "riding";
      route: PlayerElevatorTraversalRoute;
    }>;

type ReadyElevatorReservationCandidate =
  | Readonly<{
      kind: "npc";
      actorId: string;
      requestedAtSeconds: number;
      waiting: WaitingElevatorCall;
    }>
  | Readonly<{
      kind: "player";
      actorId: typeof PLAYER_ID;
      requestedAtSeconds: number;
      route: PlayerElevatorTraversalRoute;
    }>;

export type SchoolStageTraversalCoordinatorInput = Readonly<{
  stage: StageSpatialContext;
  runtime: SchoolStageDynamicRuntime;
  survival: V2SurvivalRuntime;
  player: V2PlayerController;
  doorCloseRandom: () => number;
}>;

export interface SchoolStageTraversalCoordinator {
  update(deltaSeconds: number): SchoolStageTraversalFrame;
  getPlayerElevatorTraversalSnapshot():
    | V2PlayerElevatorTraversalSnapshot
    | null;
  releaseForScriptedPhase(): void;
  dispose(): void;
}

export type SchoolStageTraversalFrame = Readonly<{
  runtimeSnapshot: SchoolStageDynamicRuntimeSnapshot;
  notifications: readonly V2NpcTraversalNotification[];
}>;

const requireFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const requireUnitRandom = (name: string, random: () => number) => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`${name}は0以上1未満を返す必要があります: ${value}`);
  }
  return value;
};

const createElevatorIdentity = (
  route: V2NpcElevatorTraversalRoute
): V2NpcElevatorTraversalIdentity =>
  Object.freeze({
    linkId: route.linkId,
    from: route.from,
    to: route.to
  });

export const createSchoolStageActorPort = (
  player: V2PlayerController,
  survival: V2SurvivalRuntime,
  stage: StageSpatialContext
): SchoolStageActorPort =>
  Object.freeze({
    getActorPosition: (actorId: string) =>
      actorId === PLAYER_ID
        ? player.getFootPosition()
        : survival.getNpcPosition(actorId),
    setActorPosition: (actorId: string, position: Vector3) => {
      requireFiniteVector(`Actor ${actorId}の搬送位置`, position);
      if (actorId === PLAYER_ID) {
        player.setTransportFootPosition(position);
      } else {
        survival.setNpcTransportPosition(actorId, position);
      }
      survival.updateTargetNavigationAreaTransportPosition(
        actorId,
        position
      );
    },
    getActorEllipsoids: () =>
      Object.freeze(
        survival.getHumanTargets().map((target) =>
          Object.freeze({
            center: target.hitShape.center.clone(),
            radii: target.hitShape.radii.clone()
          })
        )
      ),
    getDoorActors: () =>
      Object.freeze([
        ...survival.getHumanTargets().map((target) =>
          Object.freeze({
            id: target.id,
            kind: "human" as const,
            position: target.footPosition.clone(),
            ellipsoid: Object.freeze({
              center: target.hitShape.center.clone(),
              radii: target.hitShape.radii.clone()
            })
          })
        ),
        ...survival.getBitActors().map((actor) =>
          Object.freeze({
            id: actor.id,
            kind: "bit" as const,
            position: actor.center.clone(),
            ellipsoid: Object.freeze({
              center: actor.center.clone(),
              radii: new Vector3(
                actor.radius,
                actor.radius,
                actor.radius
              )
            })
          })
        )
      ]),
    relocateDoorActor: (
      actorId: string,
      candidates: readonly Vector3[]
    ) => {
      if (candidates.length === 0) {
        throw new Error(`扉Actor退避候補がありません: ${actorId}`);
      }
      const bit = survival
        .getBitActors()
        .find((candidate) => candidate.id === actorId);
      if (bit) {
        return survival.relocateBit(actorId, candidates);
      }
      const resolved = candidates
        .map((candidate: Vector3, index: number) => {
          const projected = stage.navigation.projectPoint(
            candidate,
            0.75
          );
          return projected
            ? Object.freeze({
                index,
                distanceSquared: Vector3.DistanceSquared(
                  projected.position,
                  candidate
                ),
                position: projected.position.clone()
              })
            : null;
        })
        .filter((candidate) => candidate !== null)
        .sort(
          (left, right) =>
            left.index - right.index ||
            left.distanceSquared - right.distanceSquared
        )[0];
      if (!resolved) {
        throw new Error(
          `人物Actor退避候補をNavMeshへ投影できません: ${actorId}`
        );
      }
      if (actorId === PLAYER_ID) {
        player.setTransportFootPosition(resolved.position);
      } else {
        survival.setNpcTransportPosition(actorId, resolved.position);
      }
      survival.relocateTargetNavigationArea(
        actorId,
        resolved.position
      );
      return resolved.position.clone();
    }
  });

const requireElevatorStop = (
  elevator: StageElevatorAsset,
  endpoint: "A" | "B"
) => {
  const stop = elevator.stops.find(
    (candidate) => candidate.endpoint === endpoint
  );
  if (!stop) {
    throw new Error(
      `エレベーター停止階がありません: ${elevator.id}/${endpoint}`
    );
  }
  return stop;
};

const calculateDoorSide = (
  door: StageDoorAsset,
  position: Vector3
): -1 | 1 => {
  const normal = Vector3.TransformNormal(
    Vector3.Forward(),
    door.node.computeWorldMatrix(true)
  );
  normal.y = 0;
  if (normal.lengthSquared() <= DOOR_PASS_SIDE_EPSILON) {
    throw new Error(
      `扉の通過判定法線を水平面へ投影できません: ${door.id}`
    );
  }
  normal.normalize();
  const offset = position.subtract(
    door.node.getAbsolutePosition()
  );
  const side = Vector3.Dot(offset, normal);
  if (Math.abs(side) <= DOOR_PASS_SIDE_EPSILON) {
    throw new Error(
      `NPCが扉通過判定面上にあります: ${door.id}`
    );
  }
  return side < 0 ? -1 : 1;
};

const hasVisibleBoardingFactionConflict = (
  stage: StageSpatialContext,
  requester: V2HumanTargetSnapshot,
  passengerIds: readonly string[],
  targets: readonly V2HumanTargetSnapshot[]
) => {
  if (requester.brainwashed) {
    return false;
  }
  const targetById = new Map(
    targets.map((target) => [target.id, target] as const)
  );
  return passengerIds.some((passengerId) => {
    const passenger = targetById.get(passengerId);
    if (
      !passenger ||
      !passenger.alive ||
      !passenger.brainwashed
    ) {
      return false;
    }
    return (
      stage.queries.castSightSegment(
        requester.aimPosition,
        passenger.aimPosition
      ) === null
    );
  });
};

const collectVisibleUnbrainwashedNpcIds = (
  stage: StageSpatialContext,
  requester: V2HumanTargetSnapshot,
  actorIds: readonly string[],
  targets: readonly V2HumanTargetSnapshot[]
) => {
  if (!requester.brainwashed) {
    throw new Error(
      `追跡乗車要求者が洗脳済みではありません: ${requester.id}`
    );
  }
  const targetById = new Map(
    targets.map((target) => [target.id, target] as const)
  );
  return Object.freeze(
    actorIds.filter((actorId) => {
      if (actorId === PLAYER_ID) {
        return false;
      }
      const actor = targetById.get(actorId);
      return (
        actor !== undefined &&
        actor.alive &&
        !actor.brainwashed &&
        stage.queries.castSightSegment(
          actor.aimPosition,
          requester.aimPosition
        ) === null
      );
    })
  );
};

export const createSchoolStageTraversalCoordinator = ({
  stage,
  runtime,
  survival,
  player,
  doorCloseRandom
}: SchoolStageTraversalCoordinatorInput):
  SchoolStageTraversalCoordinator => {
  if (typeof doorCloseRandom !== "function") {
    throw new Error(
      "doorCloseRandomには乱数生成関数が必要です。"
    );
  }

  const doorById = new Map(
    stage.doorAssets.all.map((door) => [door.id, door] as const)
  );
  const elevatorByLinkId = new Map(
    stage.elevatorAssets.all.map(
      (elevator) => [elevator.link.id, elevator] as const
    )
  );
  const openingDoorNpcIds = new Map<string, Set<string>>();
  const waitingDoorPassByNpcId =
    new Map<string, WaitingDoorPass>();
  const waitingElevatorCallByNpcId =
    new Map<string, WaitingElevatorCall>();
  const boardedRouteByNpcId =
    new Map<string, V2NpcElevatorTraversalRoute>();
  const arrivedPassengerIds = new Set<string>();
  const previousPlayerCallMatIds = new Set<string>();
  const playerCallMatEntryIds = new Set<string>();
  let playerElevatorTraversal: PlayerElevatorTraversalState | null =
    null;
  let playerElevatorTraversalTerminalSnapshot:
    | V2PlayerElevatorTraversalSnapshot
    | null = null;
  let playerElevatorTraversalSnapshotCache:
    | Readonly<{
        route: PlayerElevatorTraversalRoute;
        phase: V2PlayerElevatorTraversalSnapshot["phase"];
        snapshot: V2PlayerElevatorTraversalSnapshot;
      }>
    | null = null;
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error(
        "SchoolStageTraversalCoordinatorは破棄済みです。"
      );
    }
  };

  const requireDoor = (doorId: string) => {
    const door = doorById.get(doorId);
    if (!door) {
      throw new Error(`未登録の実学校扉です: ${doorId}`);
    }
    if (
      door.doorClass !== "room" &&
      door.doorClass !== "toilet_stall"
    ) {
      throw new Error(`NPCが操作できない扉です: ${doorId}`);
    }
    return door;
  };

  const resolveElevatorRoute = (
    route: V2NpcElevatorTraversalRoute
  ) => {
    const elevator = elevatorByLinkId.get(route.linkId);
    if (!elevator) {
      throw new Error(
        `未登録のエレベーターlinkです: ${route.linkId}`
      );
    }
    const fromStop = requireElevatorStop(elevator, route.from);
    const destinationStop = requireElevatorStop(elevator, route.to);
    return Object.freeze({
      elevator,
      fromStop,
      destinationStop
    });
  };

  const requireOppositeElevatorStop = (
    elevator: StageElevatorAsset,
    fromStop: StageElevatorStopAsset
  ) => {
    const destinationStop = elevator.stops.find(
      (stop) => stop !== fromStop
    );
    if (!destinationStop) {
      throw new Error(
        `エレベーターの反対停止階がありません: ${elevator.id}/${fromStop.id}`
      );
    }
    return destinationStop;
  };

  const isPlayerInsideVolume = (
    volumeId: string,
    footPosition: Vector3
  ) => stage.queries.containsVolumeById(volumeId, footPosition);

  const requireHumanTarget = (actorId: string) => {
    const target = survival
      .getHumanTargets()
      .find((candidate) => candidate.id === actorId);
    if (!target) {
      throw new Error(
        `学校traversalのActor snapshotがありません: ${actorId}`
      );
    }
    return target;
  };

  const isActorFullyOutsideVolume = (
    actorId: string,
    volumeId: string
  ) =>
    !stage.queries.intersectsVolumeById(
      volumeId,
      requireHumanTarget(actorId).hitShape
    );

  const refreshPlayerCallMatEntries = () => {
    const footPosition = player.getFootPosition();
    const currentIds = new Set<string>();
    for (const elevator of stage.elevatorAssets.all) {
      for (const stop of elevator.stops) {
        if (
          !isPlayerInsideVolume(
            stop.callMat.id,
            footPosition
          )
        ) {
          continue;
        }
        currentIds.add(stop.callMat.id);
        if (!previousPlayerCallMatIds.has(stop.callMat.id)) {
          playerCallMatEntryIds.add(stop.callMat.id);
        }
      }
    }
    previousPlayerCallMatIds.clear();
    currentIds.forEach((id) => previousPlayerCallMatIds.add(id));
  };

  const getPlayerRouteOccupancy = (
    route: PlayerElevatorTraversalRoute,
    footPosition: Vector3
  ) => {
    const elevatorSnapshot = runtime
      .getElevator(route.elevator.id)
      .getSnapshot();
    const carAtDepartureStop =
      elevatorSnapshot.currentStopId === route.fromStop.id;
    return Object.freeze({
      callMat: isPlayerInsideVolume(
        route.fromStop.callMat.id,
        footPosition
      ),
      threshold: isPlayerInsideVolume(
        route.fromStop.threshold.id,
        footPosition
      ),
      car:
        carAtDepartureStop &&
        isPlayerInsideVolume(
          route.elevator.car.occupancy.id,
          footPosition
        )
    });
  };

  const findPlayerCallMatRoute = (
    footPosition: Vector3
  ): PlayerElevatorTraversalRoute | null => {
    for (const elevator of stage.elevatorAssets.all) {
      for (const fromStop of elevator.stops) {
        if (
          !playerCallMatEntryIds.has(fromStop.callMat.id) ||
          !isPlayerInsideVolume(
            fromStop.callMat.id,
            footPosition
          )
        ) {
          continue;
        }
        return Object.freeze({
          elevator,
          fromStop,
          destinationStop: requireOppositeElevatorStop(
            elevator,
            fromStop
          ),
          requestedAtSeconds: runtime
            .getElevator(elevator.id)
            .getSnapshot().elapsedSeconds
        });
      }
    }
    return null;
  };

  const findPlayerOpenElevatorRoute = (
    footPosition: Vector3
  ): PlayerElevatorTraversalRoute | null => {
    for (const elevator of stage.elevatorAssets.all) {
      const elevatorRuntime = runtime.getElevator(elevator.id);
      const snapshot = elevatorRuntime.getSnapshot();
      if (
        snapshot.carState !== "stopped" ||
        snapshot.carDoorState !== "open" ||
        snapshot.currentStopId === null
      ) {
        continue;
      }
      const fromStop = elevator.stops.find(
        (stop) => stop.id === snapshot.currentStopId
      );
      if (!fromStop) {
        throw new Error(
          `プレイヤー乗車階がありません: ${elevator.id}/${snapshot.currentStopId}`
        );
      }
      if (
        !isPlayerInsideVolume(
          elevator.car.occupancy.id,
          footPosition
        )
      ) {
        continue;
      }
      return Object.freeze({
        elevator,
        fromStop,
        destinationStop: requireOppositeElevatorStop(
          elevator,
          fromStop
        ),
        requestedAtSeconds: snapshot.elapsedSeconds
      });
    }
    return null;
  };

  const tryCreatePlayerElevatorTraversal = (
    footPosition: Vector3
  ) => {
    if (playerElevatorTraversal !== null) {
      playerCallMatEntryIds.clear();
      return;
    }
    const callRoute = findPlayerCallMatRoute(footPosition);
    if (callRoute) {
      playerCallMatEntryIds.delete(callRoute.fromStop.callMat.id);
      playerElevatorTraversal = Object.freeze({
        kind: "awaiting-call",
        route: callRoute
      });
      return;
    }
    const openRoute = findPlayerOpenElevatorRoute(footPosition);
    if (openRoute) {
      playerElevatorTraversal = Object.freeze({
        kind: "calling",
        route: openRoute
      });
    }
  };

  const isElevatorBoardableAtStop = (
    elevator: StageElevatorAsset,
    fromStop: StageElevatorStopAsset
  ) => {
    const snapshot = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const stopSnapshot = snapshot.stops.find(
      (stop) => stop.id === fromStop.id
    );
    if (!stopSnapshot) {
      throw new Error(
        `乗車階snapshotがありません: ${elevator.id}/${fromStop.id}`
      );
    }
    return (
      snapshot.carState === "stopped" &&
      snapshot.currentStopId === fromStop.id &&
      snapshot.carDoorState === "open" &&
      stopSnapshot.landingDoorState === "open" &&
      !stopSnapshot.humanGateEnabled &&
      !snapshot.passengers.some(
        (passenger) => passenger.state === "arrived"
      )
    );
  };

  const updatePlayerElevatorTraversalState = () => {
    const footPosition = player.getFootPosition();
    tryCreatePlayerElevatorTraversal(footPosition);
    const traversal = playerElevatorTraversal;
    if (!traversal) {
      return;
    }

    const elevatorRuntime = runtime.getElevator(
      traversal.route.elevator.id
    );
    if (traversal.kind === "riding") {
      const snapshot = elevatorRuntime.getSnapshot();
      const passenger = snapshot.passengers.find(
        (candidate) => candidate.actorId === PLAYER_ID
      );
      if (!passenger) {
        throw new Error(
          `プレイヤー乗客snapshotがありません: ${traversal.route.elevator.id}`
        );
      }
      const destinationSnapshot = snapshot.stops.find(
        (stop) =>
          stop.id === traversal.route.destinationStop.id
      );
      if (!destinationSnapshot) {
        throw new Error(
          `プレイヤー降車階snapshotがありません: ${traversal.route.elevator.id}/${traversal.route.destinationStop.id}`
        );
      }
      const departureSnapshot = snapshot.stops.find(
        (stop) => stop.id === traversal.route.fromStop.id
      );
      if (!departureSnapshot) {
        throw new Error(
          `プレイヤー乗車階snapshotがありません: ${traversal.route.elevator.id}/${traversal.route.fromStop.id}`
        );
      }
      if (
        passenger.state === "riding" &&
        snapshot.carState === "stopped" &&
        snapshot.currentStopId ===
          traversal.route.fromStop.id &&
        snapshot.carDoorState === "open" &&
        departureSnapshot.landingDoorState === "open" &&
        !departureSnapshot.humanGateEnabled &&
        isActorFullyOutsideVolume(
          PLAYER_ID,
          traversal.route.elevator.car.occupancy.id
        )
      ) {
        elevatorRuntime.completePreDepartureExit(PLAYER_ID);
        survival.relocateTargetNavigationArea(
          PLAYER_ID,
          player.getFootPosition()
        );
        publishPlayerElevatorTraversalTerminal(
          traversal.route,
          "cancelled"
        );
        playerElevatorTraversal = null;
        return;
      }
      if (
        snapshot.carState === "stopped" &&
        snapshot.currentStopId ===
          traversal.route.destinationStop.id &&
        snapshot.carDoorState === "open" &&
        destinationSnapshot.landingDoorState === "open" &&
        !destinationSnapshot.humanGateEnabled &&
        passenger.state === "arrived" &&
        isActorFullyOutsideVolume(
          PLAYER_ID,
          traversal.route.elevator.car.occupancy.id
        )
      ) {
        elevatorRuntime.completeDisembark(PLAYER_ID);
        survival.relocateTargetNavigationArea(
          PLAYER_ID,
          player.getFootPosition()
        );
        publishPlayerElevatorTraversalTerminal(
          traversal.route,
          "completed"
        );
        playerElevatorTraversal = null;
      }
      return;
    }

    const occupancy = getPlayerRouteOccupancy(
      traversal.route,
      footPosition
    );
    if (!occupancy.callMat && !occupancy.threshold && !occupancy.car) {
      if (traversal.kind === "reserved") {
        elevatorRuntime.cancelBoardingReservation(PLAYER_ID);
      }
      publishPlayerElevatorTraversalTerminal(
        traversal.route,
        "cancelled"
      );
      playerElevatorTraversal = null;
      return;
    }
    if (traversal.kind === "awaiting-call") {
      if (!occupancy.callMat) {
        publishPlayerElevatorTraversalTerminal(
          traversal.route,
          "cancelled"
        );
        playerElevatorTraversal = null;
        return;
      }
      const snapshot = elevatorRuntime.getSnapshot();
      const stopSnapshot = snapshot.stops.find(
        (stop) => stop.id === traversal.route.fromStop.id
      );
      if (!stopSnapshot) {
        throw new Error(
          `プレイヤー呼出階snapshotがありません: ${traversal.route.elevator.id}/${traversal.route.fromStop.id}`
        );
      }
      if (stopSnapshot.callMatState !== "ready") {
        return;
      }
      const callResult = elevatorRuntime.requestCall(
        traversal.route.fromStop.id
      );
      if (callResult.status !== "accepted") {
        throw new Error(
          `ready呼出マットのプレイヤー呼出が受理されませんでした: ${traversal.route.elevator.id}/${traversal.route.fromStop.id}`
        );
      }
      playerElevatorTraversal = Object.freeze({
        kind: "calling",
        route: traversal.route
      });
      return;
    }
    if (
      playerElevatorTraversal?.kind === "reserved" &&
      occupancy.car
    ) {
      survival.beginTargetNavigationAreaTransport(
        PLAYER_ID,
        player.getFootPosition()
      );
      elevatorRuntime.completeBoarding(PLAYER_ID);
      playerElevatorTraversal = Object.freeze({
        kind: "riding",
        route: traversal.route
      });
    }
  };

  const createPlayerElevatorTraversalSnapshot = (
    route: PlayerElevatorTraversalRoute,
    phase: V2PlayerElevatorTraversalSnapshot["phase"]
  ) => {
    const destinationEndpoint =
      route.destinationStop.endpoint === "A"
        ? route.elevator.link.endpointA
        : route.elevator.link.endpointB;
    return Object.freeze({
      elevatorId: route.elevator.id,
      linkId: route.elevator.link.id,
      from: route.fromStop.endpoint,
      to: route.destinationStop.endpoint,
      destinationFloorPosition: Object.freeze(
        destinationEndpoint.position.clone()
      ),
      phase
    } satisfies V2PlayerElevatorTraversalSnapshot);
  };

  const publishPlayerElevatorTraversalTerminal = (
    route: PlayerElevatorTraversalRoute,
    phase: "cancelled" | "completed"
  ) => {
    playerElevatorTraversalSnapshotCache = null;
    playerElevatorTraversalTerminalSnapshot =
      createPlayerElevatorTraversalSnapshot(route, phase);
  };

  const getPlayerElevatorTraversalSnapshot = () => {
    const traversal = playerElevatorTraversal;
    if (!traversal) {
      playerElevatorTraversalSnapshotCache = null;
      return playerElevatorTraversalTerminalSnapshot;
    }
    const phase =
      traversal.kind === "riding"
        ? "riding"
        : traversal.kind === "reserved"
          ? "reserved"
          : "calling";
    if (
      playerElevatorTraversalSnapshotCache?.route === traversal.route &&
      playerElevatorTraversalSnapshotCache.phase === phase
    ) {
      return playerElevatorTraversalSnapshotCache.snapshot;
    }
    const snapshot = createPlayerElevatorTraversalSnapshot(
      traversal.route,
      phase
    );
    playerElevatorTraversalSnapshotCache = Object.freeze({
      route: traversal.route,
      phase,
      snapshot
    });
    return snapshot;
  };

  const beginDoorOpen = (
    request: Extract<
      V2NpcTraversalRequest,
      {
        kind: "door-open";
      }
    >
  ) => {
    const door = requireDoor(request.doorId);
    const actorPosition = survival.getNpcPosition(request.npcId);
    const entrySide = calculateDoorSide(door, actorPosition);
    const waitingNpcIds =
      openingDoorNpcIds.get(door.id) ?? new Set<string>();
    waitingNpcIds.add(request.npcId);
    openingDoorNpcIds.set(door.id, waitingNpcIds);
    waitingDoorPassByNpcId.set(
      request.npcId,
      Object.freeze({
        npcId: request.npcId,
        door,
        entrySide
      })
    );
    const state = runtime.doors.getDoorState(door.id);
    if (state.state === "closed") {
      runtime.doors.requestDoorToggle(door.id);
    }
  };

  const processDoorPassCompletion = (
    request: Extract<
      V2NpcTraversalRequest,
      {
        kind: "door-pass-complete";
      }
    >,
    doorCloseAttempts: Array<
      Readonly<{
        doorId: string;
        selected: boolean;
      }>
    >
  ) => {
    waitingDoorPassByNpcId.delete(request.npcId);
    doorCloseAttempts.push(
      Object.freeze({
        doorId: request.doorId,
        selected:
          requireUnitRandom(
            "NPC通過後の閉扉判定乱数",
            doorCloseRandom
          ) < 0.3
      })
    );
  };

  const processDoorCloseAttempts = (
    doorCloseAttempts: readonly Readonly<{
      doorId: string;
      selected: boolean;
    }>[]
  ) => {
    for (const attempt of doorCloseAttempts) {
      if (!attempt.selected) {
        continue;
      }
      const doorId = attempt.doorId;
      const hasWaitingPass = [
        ...waitingDoorPassByNpcId.values()
      ].some((waiting) => waiting.door.id === doorId);
      const hasWaitingOpen =
        (openingDoorNpcIds.get(doorId)?.size ?? 0) > 0;
      if (hasWaitingPass || hasWaitingOpen) {
        continue;
      }
      const state = runtime.doors.getDoorState(doorId);
      if (state.state === "open") {
        runtime.doors.requestDoorToggle(doorId);
      }
    }
  };

  const processElevatorCall = (
    request: Extract<
      V2NpcTraversalRequest,
      {
        kind: "elevator-call";
      }
    >
  ) => {
    const route = resolveElevatorRoute(request);
    if (waitingElevatorCallByNpcId.has(request.npcId)) {
      throw new Error(
        `NPCのエレベーター呼出入力が重複しています: ${request.npcId}/${request.linkId}`
      );
    }
    waitingElevatorCallByNpcId.set(
      request.npcId,
      Object.freeze({
        request,
        elevator: route.elevator,
        fromStop: route.fromStop,
        callAccepted: false
      })
    );
  };

  const resolveElevatorCallInputs = (
    results: V2NpcTraversalResult[]
  ) => {
    for (const [npcId, waiting] of waitingElevatorCallByNpcId) {
      if (waiting.callAccepted) {
        continue;
      }
      const traversalState =
        survival.getNpcTraversalState(npcId);
      if (
        traversalState.kind !==
        "waiting-elevator-call-input"
      ) {
        continue;
      }
      if (
        !stage.queries.containsVolumeById(
          waiting.fromStop.callMat.id,
          survival.getNpcPosition(npcId)
        )
      ) {
        continue;
      }
      const elevatorRuntime = runtime.getElevator(
        waiting.elevator.id
      );
      const snapshot = elevatorRuntime.getSnapshot();
      const stopSnapshot = snapshot.stops.find(
        (stop) => stop.id === waiting.fromStop.id
      );
      if (!stopSnapshot) {
        throw new Error(
          `NPC呼出階snapshotがありません: ${waiting.elevator.id}/${waiting.fromStop.id}`
        );
      }
      if (stopSnapshot.callMatState !== "ready") {
        continue;
      }
      const callResult = elevatorRuntime.requestCall(
        waiting.fromStop.id
      );
      if (callResult.status !== "accepted") {
        throw new Error(
          `ready呼出マットのNPC呼出が受理されませんでした: ${npcId}/${waiting.elevator.id}/${waiting.fromStop.id}`
        );
      }
      waitingElevatorCallByNpcId.set(
        npcId,
        Object.freeze({
          ...waiting,
          callAccepted: true
        })
      );
      results.push(
        Object.freeze({
          kind: "elevator-call-accepted",
          npcId,
          ...createElevatorIdentity(waiting.request)
        })
      );
    }
  };

  const processElevatorCallCancel = (
    request: Extract<
      V2NpcTraversalRequest,
      {
        kind: "elevator-call-cancel";
      }
    >
  ) => {
    const waiting = waitingElevatorCallByNpcId.get(
      request.npcId
    );
    if (
      !waiting ||
      waiting.request.linkId !== request.linkId ||
      waiting.request.from !== request.from ||
      waiting.request.to !== request.to
    ) {
      throw new Error(
        `取消対象のNPCエレベーター呼出待機がありません: ${request.npcId}/${request.linkId}`
      );
    }
    waitingElevatorCallByNpcId.delete(request.npcId);
  };

  const processElevatorReservationCancel = (
    request: Extract<
      V2NpcTraversalRequest,
      {
        kind: "elevator-reservation-cancel";
      }
    >
  ) => {
    const route = resolveElevatorRoute(request);
    runtime
      .getElevator(route.elevator.id)
      .cancelBoardingReservation(request.npcId);
    boardedRouteByNpcId.delete(request.npcId);
  };

  const collectBoarding = (
    request: Extract<
      V2NpcTraversalRequest,
      {
        kind: "elevator-board";
      }
    >
  ): PendingBoarding => {
    const route = resolveElevatorRoute(request);
    return Object.freeze({
      request,
      elevator: route.elevator,
      fromStop: route.fromStop,
      destinationStop: route.destinationStop
    });
  };

  const resolveCurrentStopRetreatLocation = (
    elevator: StageElevatorAsset,
    route: V2NpcElevatorTraversalRoute,
    currentStopId: string
  ) => {
    const resolved = resolveElevatorRoute(route);
    if (resolved.elevator !== elevator) {
      throw new Error(
        `安全退避対象のエレベーターが一致しません: ${route.linkId}`
      );
    }
    if (currentStopId === resolved.fromStop.id) {
      return route.entryLocation;
    }
    if (currentStopId === resolved.destinationStop.id) {
      return route.exitLocation;
    }
    throw new Error(
      `安全退避対象の現在階が経路外です: ${route.linkId}/${currentStopId}`
    );
  };

  const evictVisibleUnbrainwashedNpcs = (
    elevator: StageElevatorAsset,
    requester: V2HumanTargetSnapshot,
    targets: readonly V2HumanTargetSnapshot[],
    results: V2NpcTraversalResult[],
    currentReadyResultIndexByNpcId: Map<string, number>
  ) => {
    const elevatorRuntime = runtime.getElevator(elevator.id);
    let snapshot = elevatorRuntime.getSnapshot();
    if (snapshot.currentStopId === null) {
      throw new Error(
        `安全退避時にエレベーターが停止階にいません: ${elevator.id}`
      );
    }
    const committedActorIds = Object.freeze([
      ...snapshot.passengers.map(
        (passenger) => passenger.actorId
      ),
      ...snapshot.reservations.map(
        (reservation) => reservation.actorId
      )
    ]);
    const actorIds = collectVisibleUnbrainwashedNpcIds(
      stage,
      requester,
      committedActorIds,
      targets
    );
    for (const actorId of actorIds) {
      const route = boardedRouteByNpcId.get(actorId);
      if (!route) {
        throw new Error(
          `安全退避対象NPCのエレベーター経路がありません: ${actorId}`
        );
      }
      const currentStopId = snapshot.currentStopId;
      if (currentStopId === null) {
        throw new Error(
          `安全退避中にエレベーター停止階が失われました: ${elevator.id}`
        );
      }
      const isPassenger = snapshot.passengers.some(
        (passenger) => passenger.actorId === actorId
      );
      const isReservation = snapshot.reservations.some(
        (reservation) => reservation.actorId === actorId
      );
      if (isPassenger === isReservation) {
        throw new Error(
          `安全退避対象NPCの乗車状態が一意ではありません: ${actorId}`
        );
      }
      if (isPassenger) {
        const retreatLocation =
          resolveCurrentStopRetreatLocation(
            elevator,
            route,
            currentStopId
          );
        elevatorRuntime.completePreDepartureExit(actorId);
        survival.setNpcTransportPosition(
          actorId,
          retreatLocation.position
        );
        arrivedPassengerIds.delete(actorId);
        results.push(
          Object.freeze({
            kind: "elevator-safety-evicted",
            npcId: actorId,
            ...createElevatorIdentity(route),
            location: retreatLocation
          })
        );
      } else {
        elevatorRuntime.cancelBoardingReservation(actorId);
        const readyResultIndex =
          currentReadyResultIndexByNpcId.get(actorId);
        const rejection = Object.freeze({
          kind: "elevator-boarding-rejected" as const,
          npcId: actorId,
          ...createElevatorIdentity(route),
          reason: "not-boardable" as const
        });
        if (readyResultIndex === undefined) {
          results.push(rejection);
        } else {
          results[readyResultIndex] = rejection;
          currentReadyResultIndexByNpcId.delete(actorId);
        }
      }
      boardedRouteByNpcId.delete(actorId);
      snapshot = elevatorRuntime.getSnapshot();
    }
    return actorIds;
  };

  const processBoardingGroups = (
    pendingBoardings: readonly PendingBoarding[],
    results: V2NpcTraversalResult[]
  ) => {
    const byElevatorId = new Map<string, PendingBoarding[]>();
    for (const pending of pendingBoardings) {
      const grouped =
        byElevatorId.get(pending.elevator.id) ?? [];
      grouped.push(pending);
      byElevatorId.set(pending.elevator.id, grouped);
    }
    for (const [elevatorId, grouped] of byElevatorId) {
      const elevatorRuntime = runtime.getElevator(elevatorId);
      const evictedNpcIds = new Set<string>();
      const ordered = [...grouped].sort(
        (left, right) =>
          left.request.requestedAtSeconds -
            right.request.requestedAtSeconds ||
          (left.request.npcId < right.request.npcId
            ? -1
            : left.request.npcId > right.request.npcId
              ? 1
              : 0)
      );
      for (const pending of ordered) {
        if (evictedNpcIds.has(pending.request.npcId)) {
          continue;
        }
        const targets = survival.getHumanTargets();
        const targetById = new Map(
          targets.map((target) => [target.id, target] as const)
        );
        const requester = targetById.get(
          pending.request.npcId
        );
        if (!requester) {
          throw new Error(
            `乗車要求NPC snapshotがありません: ${pending.request.npcId}`
          );
        }
        const beforeBoarding = elevatorRuntime.getSnapshot();
        if (requester.brainwashed) {
          for (const actorId of evictVisibleUnbrainwashedNpcs(
            pending.elevator,
            requester,
            targets,
            results,
            new Map<string, number>()
          )) {
            evictedNpcIds.add(actorId);
          }
        }
        const committedSnapshot = elevatorRuntime.getSnapshot();
        const committedActorIds = Object.freeze([
          ...committedSnapshot.passengers.map(
            (passenger) => passenger.actorId
          ),
          ...committedSnapshot.reservations
            .filter(
              (reservation) =>
                reservation.actorId !== pending.request.npcId
            )
            .map(
            (reservation) => reservation.actorId
            )
        ]);
        if (
          hasVisibleBoardingFactionConflict(
            stage,
            requester,
            committedActorIds,
            targets
          )
        ) {
          elevatorRuntime.cancelBoardingReservation(
            pending.request.npcId
          );
          boardedRouteByNpcId.delete(pending.request.npcId);
          results.push(
            Object.freeze({
              kind: "elevator-boarding-rejected",
              npcId: pending.request.npcId,
              ...createElevatorIdentity(pending.request),
              reason: "not-boardable"
            })
          );
          continue;
        }
        if (
          !beforeBoarding.reservations.some(
            (reservation) =>
              reservation.actorId === pending.request.npcId
          )
        ) {
          throw new Error(
            `乗車開始NPCの予約がありません: ${pending.request.npcId}`
          );
        }
        survival.beginTargetNavigationAreaTransport(
          pending.request.npcId,
          survival.getNpcPosition(pending.request.npcId)
        );
        elevatorRuntime.completeBoarding(
          pending.request.npcId
        );
        arrivedPassengerIds.delete(pending.request.npcId);
        results.push(
          Object.freeze({
            kind: "elevator-boarded",
            npcId: pending.request.npcId,
            ...createElevatorIdentity(pending.request)
          })
        );
      }
    }
  };

  const resolveCompletedNpcDisembarks = (
    results: V2NpcTraversalResult[]
  ) => {
    for (const [npcId, route] of boardedRouteByNpcId) {
      const traversalState =
        survival.getNpcTraversalState(npcId);
      if (traversalState.kind !== "leaving-elevator") {
        continue;
      }
      const resolved = resolveElevatorRoute(route);
      const elevatorRuntime = runtime.getElevator(
        resolved.elevator.id
      );
      const snapshot = elevatorRuntime.getSnapshot();
      const passenger = snapshot.passengers.find(
        (candidate) => candidate.actorId === npcId
      );
      if (!passenger || passenger.state !== "arrived") {
        continue;
      }
      if (
        !isActorFullyOutsideVolume(
          npcId,
          resolved.elevator.car.occupancy.id
        )
      ) {
        continue;
      }
      elevatorRuntime.completeDisembark(npcId);
      boardedRouteByNpcId.delete(npcId);
      arrivedPassengerIds.delete(npcId);
      results.push(
        Object.freeze({
          kind: "elevator-disembarked",
          npcId,
          ...createElevatorIdentity(route),
          location: route.exitLocation
        })
      );
    }
  };

  const detectCompletedDoorPasses = (
    results: V2NpcTraversalResult[]
  ) => {
    for (const pass of waitingDoorPassByNpcId.values()) {
      const traversalState =
        survival.getNpcTraversalState(pass.npcId);
      if (traversalState.kind !== "passing-door") {
        continue;
      }
      const target = survival
        .getHumanTargets()
        .find((candidate) => candidate.id === pass.npcId);
      if (!target) {
        throw new Error(
          `扉通過NPC snapshotがありません: ${pass.npcId}`
        );
      }
      if (
        stage.queries.intersectsVolumeById(
          pass.door.sweepId,
          target.hitShape
        ) ||
        intersectsStageDoorClosedPose(
          pass.door,
          target.hitShape
        )
      ) {
        continue;
      }
      const currentSide = calculateDoorSide(
        pass.door,
        target.footPosition
      );
      if (currentSide === pass.entrySide) {
        continue;
      }
      results.push(
        Object.freeze({
          kind: "door-pass-detected",
          npcId: pass.npcId,
          doorId: pass.door.id
        })
      );
    }
  };

  const resolveOpenedDoors = (
    results: V2NpcTraversalResult[]
  ) => {
    for (const [doorId, npcIds] of openingDoorNpcIds) {
      const state = runtime.doors.getDoorState(doorId);
      if (state.state === "closing") {
        continue;
      }
      if (state.state === "closed") {
        runtime.doors.requestDoorToggle(doorId);
        continue;
      }
      if (state.state !== "open") {
        continue;
      }
      for (const npcId of npcIds) {
        results.push(
          Object.freeze({
            kind: "door-opened",
            npcId,
            doorId
          })
        );
      }
      openingDoorNpcIds.delete(doorId);
    }
  };

  const resolveReadyElevatorCalls = (
    results: V2NpcTraversalResult[]
  ) => {
    if (
      waitingElevatorCallByNpcId.size === 0 &&
      playerElevatorTraversal?.kind !== "calling"
    ) {
      return;
    }
    const targets = survival.getHumanTargets();
    const targetById = new Map(
      targets.map((target) => [target.id, target] as const)
    );
    const currentReadyResultIndexByNpcId =
      new Map<string, number>();
    const candidates: ReadyElevatorReservationCandidate[] = [];
    for (const [npcId, waiting] of waitingElevatorCallByNpcId) {
      if (
        !waiting.callAccepted ||
        survival.getNpcTraversalState(npcId).kind !==
        "waiting-elevator-call"
      ) {
        continue;
      }
      if (
        !isElevatorBoardableAtStop(
          waiting.elevator,
          waiting.fromStop
        )
      ) {
        continue;
      }
      candidates.push(
        Object.freeze({
          kind: "npc",
          actorId: npcId,
          requestedAtSeconds:
            waiting.request.requestedAtSeconds,
          waiting
        })
      );
    }
    const playerTraversal = playerElevatorTraversal;
    if (
      playerTraversal?.kind === "calling" &&
      isElevatorBoardableAtStop(
        playerTraversal.route.elevator,
        playerTraversal.route.fromStop
      )
    ) {
      candidates.push(
        Object.freeze({
          kind: "player",
          actorId: PLAYER_ID,
          requestedAtSeconds:
            playerTraversal.route.requestedAtSeconds,
          route: playerTraversal.route
        })
      );
    }
    candidates.sort(
      (left, right) =>
        left.requestedAtSeconds - right.requestedAtSeconds ||
        (left.actorId < right.actorId
          ? -1
          : left.actorId > right.actorId
            ? 1
            : 0)
    );

    for (const candidate of candidates) {
      if (candidate.kind === "player") {
        if (
          playerElevatorTraversal?.kind !== "calling" ||
          playerElevatorTraversal.route !== candidate.route
        ) {
          continue;
        }
        const reservation = runtime
          .getElevator(candidate.route.elevator.id)
          .requestBoarding(
            Object.freeze({
              actorId: PLAYER_ID,
              fromStopId: candidate.route.fromStop.id,
              destinationStopId:
                candidate.route.destinationStop.id,
              requestedAtSeconds:
                candidate.route.requestedAtSeconds
            })
          );
        if (reservation.status === "accepted") {
          playerElevatorTraversal = Object.freeze({
            kind: "reserved",
            route: candidate.route
          });
        }
        continue;
      }

      const { actorId: npcId, waiting } = candidate;
      if (
        survival.getNpcTraversalState(npcId).kind !==
        "waiting-elevator-call"
      ) {
        continue;
      }
      const requester = targetById.get(npcId);
      if (!requester) {
        throw new Error(
          `予約要求NPC snapshotがありません: ${npcId}`
        );
      }
      if (requester.brainwashed) {
        evictVisibleUnbrainwashedNpcs(
          waiting.elevator,
          requester,
          targets,
          results,
          currentReadyResultIndexByNpcId
        );
      }
      const elevatorRuntime = runtime.getElevator(
        waiting.elevator.id
      );
      const committedSnapshot =
        elevatorRuntime.getSnapshot();
      const committedActorIds = Object.freeze([
        ...committedSnapshot.passengers.map(
          (passenger) => passenger.actorId
        ),
        ...committedSnapshot.reservations.map(
          (reservation) => reservation.actorId
        )
      ]);
      if (
        hasVisibleBoardingFactionConflict(
          stage,
          requester,
          committedActorIds,
          targets
        )
      ) {
        results.push(
          Object.freeze({
            kind: "elevator-boarding-rejected",
            npcId,
            ...createElevatorIdentity(waiting.request),
            reason: "not-boardable"
          })
        );
        waitingElevatorCallByNpcId.delete(npcId);
        continue;
      }
      const reservationResult =
        elevatorRuntime.requestBoarding(
          Object.freeze({
            actorId: npcId,
            fromStopId: waiting.fromStop.id,
            destinationStopId:
              requireElevatorStop(
                waiting.elevator,
                waiting.request.to
              ).id,
            requestedAtSeconds:
              waiting.request.requestedAtSeconds
          })
        );
      if (reservationResult.status === "accepted") {
        boardedRouteByNpcId.set(npcId, waiting.request);
        currentReadyResultIndexByNpcId.set(
          npcId,
          results.length
        );
        results.push(
          Object.freeze({
            kind: "elevator-ready-for-boarding",
            npcId,
            ...createElevatorIdentity(waiting.request)
          })
        );
      } else {
        results.push(
          Object.freeze({
            kind: "elevator-boarding-rejected",
            npcId,
            ...createElevatorIdentity(waiting.request),
            reason: reservationResult.status
          })
        );
      }
      waitingElevatorCallByNpcId.delete(npcId);
    }
  };

  const resolveArrivedPassengers = (
    results: V2NpcTraversalResult[]
  ) => {
    for (const elevator of stage.elevatorAssets.all) {
      const snapshot = runtime
        .getElevator(elevator.id)
        .getSnapshot();
      if (
        snapshot.currentStopId === null ||
        snapshot.carDoorState !== "open"
      ) {
        continue;
      }
      const currentStop = snapshot.stops.find(
        (stop) => stop.id === snapshot.currentStopId
      );
      if (!currentStop) {
        throw new Error(
          `到着階snapshotがありません: ${elevator.id}/${snapshot.currentStopId}`
        );
      }
      if (
        currentStop.landingDoorState !== "open" ||
        currentStop.humanGateEnabled
      ) {
        continue;
      }
      for (const passenger of snapshot.passengers) {
        if (
          passenger.actorId === PLAYER_ID ||
          passenger.state !== "arrived" ||
          passenger.destinationStopId !==
            snapshot.currentStopId ||
          arrivedPassengerIds.has(passenger.actorId)
        ) {
          continue;
        }
        const traversalState =
          survival.getNpcTraversalState(passenger.actorId);
        if (traversalState.kind !== "riding-elevator") {
          continue;
        }
        results.push(
          Object.freeze({
            kind: "elevator-arrived",
            npcId: passenger.actorId,
            linkId: elevator.link.id,
            from: traversalState.from,
            to: traversalState.to
          })
        );
        arrivedPassengerIds.add(passenger.actorId);
      }
    }
  };

  return Object.freeze({
    update: (deltaSeconds: number) => {
      assertActive();
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
        throw new Error(
          "学校traversal更新deltaSecondsには0以上の有限値が必要です。"
        );
      }
      playerElevatorTraversalTerminalSnapshot = null;
      const requests = survival.drainNpcTraversalRequests();
      const results: V2NpcTraversalResult[] = [];
      const pendingBoardings: PendingBoarding[] = [];
      const doorCloseAttempts: Array<
        Readonly<{
          doorId: string;
          selected: boolean;
        }>
      > = [];
      for (const request of requests) {
        switch (request.kind) {
          case "door-open":
            beginDoorOpen(request);
            break;
          case "door-pass-complete":
            processDoorPassCompletion(
              request,
              doorCloseAttempts
            );
            break;
          case "elevator-call":
            processElevatorCall(request);
            break;
          case "elevator-call-cancel":
            processElevatorCallCancel(request);
            break;
          case "elevator-reservation-cancel":
            processElevatorReservationCancel(request);
            break;
          case "elevator-board":
            pendingBoardings.push(collectBoarding(request));
            break;
        }
      }
      refreshPlayerCallMatEntries();
      processDoorCloseAttempts(doorCloseAttempts);
      detectCompletedDoorPasses(results);
      resolveCompletedNpcDisembarks(results);
      processBoardingGroups(pendingBoardings, results);
      resolveElevatorCallInputs(results);
      updatePlayerElevatorTraversalState();
      resolveReadyElevatorCalls(results);
      updatePlayerElevatorTraversalState();
      runtime.update(deltaSeconds);
      resolveOpenedDoors(results);
      resolveElevatorCallInputs(results);
      updatePlayerElevatorTraversalState();
      resolveReadyElevatorCalls(results);
      updatePlayerElevatorTraversalState();
      resolveArrivedPassengers(results);
      const notifications =
        results.length > 0
          ? survival.applyNpcTraversalResults(
              Object.freeze(results)
            )
          : Object.freeze([]);
      const snapshot = runtime.getSnapshot();
      player.syncStageSpatialSnapshot(
        snapshot.spatialSnapshot
      );
      playerCallMatEntryIds.clear();
      return Object.freeze({
        runtimeSnapshot: snapshot,
        notifications
      });
    },
    getPlayerElevatorTraversalSnapshot: () => {
      assertActive();
      return getPlayerElevatorTraversalSnapshot();
    },
    releaseForScriptedPhase: () => {
      assertActive();
      runtime.releaseHumanTraversalForScriptedPhase();
      openingDoorNpcIds.clear();
      waitingDoorPassByNpcId.clear();
      waitingElevatorCallByNpcId.clear();
      boardedRouteByNpcId.clear();
      arrivedPassengerIds.clear();
      previousPlayerCallMatIds.clear();
      playerCallMatEntryIds.clear();
      playerElevatorTraversal = null;
      playerElevatorTraversalTerminalSnapshot = null;
      playerElevatorTraversalSnapshotCache = null;
      survival.releaseNpcTraversalForScriptedPhase();
    },
    dispose: () => {
      assertActive();
      doorById.clear();
      elevatorByLinkId.clear();
      openingDoorNpcIds.clear();
      waitingDoorPassByNpcId.clear();
      waitingElevatorCallByNpcId.clear();
      boardedRouteByNpcId.clear();
      arrivedPassengerIds.clear();
      previousPlayerCallMatIds.clear();
      playerCallMatEntryIds.clear();
      playerElevatorTraversal = null;
      playerElevatorTraversalTerminalSnapshot = null;
      playerElevatorTraversalSnapshotCache = null;
      disposed = true;
    }
  });
};
