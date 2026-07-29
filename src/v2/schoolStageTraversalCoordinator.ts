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
  V2NpcTraversalResult
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

export type SchoolStageTraversalCoordinatorInput = Readonly<{
  stage: StageSpatialContext;
  runtime: SchoolStageDynamicRuntime;
  survival: V2SurvivalRuntime;
  player: V2PlayerController;
  doorCloseRandom: () => number;
}>;

export interface SchoolStageTraversalCoordinator {
  update(deltaSeconds: number): SchoolStageTraversalFrame;
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
  survival: V2SurvivalRuntime
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
        return;
      }
      survival.setNpcTransportPosition(actorId, position);
    },
    getActorEllipsoids: () =>
      Object.freeze(
        survival.getHumanTargets().map((target) =>
          Object.freeze({
            center: target.hitShape.center.clone(),
            radii: target.hitShape.radii.clone()
          })
        )
      )
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
    runtime
      .getElevator(route.elevator.id)
      .requestCall(route.fromStop.id);
    waitingElevatorCallByNpcId.set(
      request.npcId,
      Object.freeze({
        request,
        elevator: route.elevator,
        fromStop: route.fromStop
      })
    );
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
    const targets = survival.getHumanTargets();
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
        elevatorRuntime.completeDisembark(actorId);
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

  const processDisembark = (
    request: Extract<
      V2NpcTraversalRequest,
      {
        kind: "elevator-disembark";
      }
    >,
    results: V2NpcTraversalResult[]
  ) => {
    const route = resolveElevatorRoute(request);
    const elevatorRuntime = runtime.getElevator(route.elevator.id);
    elevatorRuntime.completeDisembark(request.npcId);
    boardedRouteByNpcId.delete(request.npcId);
    survival.setNpcTransportPosition(
      request.npcId,
      request.exitLocation.position
    );
    arrivedPassengerIds.delete(request.npcId);
    results.push(
      Object.freeze({
        kind: "elevator-disembarked",
        npcId: request.npcId,
        ...createElevatorIdentity(request),
        location: request.exitLocation
      })
    );
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
    const currentReadyResultIndexByNpcId =
      new Map<string, number>();
    const ordered = [
      ...waitingElevatorCallByNpcId.entries()
    ].sort(
      (left, right) =>
        left[1].request.requestedAtSeconds -
          right[1].request.requestedAtSeconds ||
        (left[0] < right[0]
          ? -1
          : left[0] > right[0]
            ? 1
            : 0)
    );
    for (const [npcId, waiting] of ordered) {
      if (
        survival.getNpcTraversalState(npcId).kind !==
        "waiting-elevator-call"
      ) {
        continue;
      }
      const snapshot = runtime
        .getElevator(waiting.elevator.id)
        .getSnapshot();
      const currentStop = snapshot.stops.find(
        (stop) => stop.id === waiting.fromStop.id
      );
      if (!currentStop) {
        throw new Error(
          `呼出階snapshotがありません: ${waiting.elevator.id}/${waiting.fromStop.id}`
        );
      }
      if (
        snapshot.currentStopId !== waiting.fromStop.id ||
        snapshot.carDoorState !== "open" ||
        currentStop.landingDoorState !== "open" ||
        currentStop.humanGateEnabled ||
        snapshot.passengers.some(
          (passenger) =>
            passenger.destinationStopId ===
            snapshot.currentStopId
        )
      ) {
        continue;
      }
      const targets = survival.getHumanTargets();
      const requester = targets.find(
        (target) => target.id === npcId
      );
      if (!requester) {
        throw new Error(
          `予約要求NPC snapshotがありません: ${npcId}`
        );
      }
      if (requester.brainwashed) {
        evictVisibleUnbrainwashedNpcs(
          waiting.elevator,
          requester,
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
          survival.getHumanTargets()
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
          case "elevator-disembark":
            processDisembark(request, results);
            break;
        }
      }
      processDoorCloseAttempts(doorCloseAttempts);
      detectCompletedDoorPasses(results);
      processBoardingGroups(pendingBoardings, results);
      resolveReadyElevatorCalls(results);
      const snapshot = runtime.update(deltaSeconds);
      resolveOpenedDoors(results);
      resolveReadyElevatorCalls(results);
      resolveArrivedPassengers(results);
      const notifications =
        results.length > 0
          ? survival.applyNpcTraversalResults(
              Object.freeze(results)
            )
          : Object.freeze([]);
      player.syncStageSpatialSnapshot(
        snapshot.spatialSnapshot
      );
      return Object.freeze({
        runtimeSnapshot: snapshot,
        notifications
      });
    },
    releaseForScriptedPhase: () => {
      assertActive();
      runtime.releaseHumanTraversalForScriptedPhase();
      openingDoorNpcIds.clear();
      waitingDoorPassByNpcId.clear();
      waitingElevatorCallByNpcId.clear();
      boardedRouteByNpcId.clear();
      arrivedPassengerIds.clear();
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
      disposed = true;
    }
  });
};
