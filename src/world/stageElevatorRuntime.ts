import { type Mesh, Vector3 } from "@babylonjs/core";

export const ELEVATOR_CAPACITY = 6;
export const ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS = 5;
export const ELEVATOR_DOOR_MOTION_SECONDS = 1;
export const ELEVATOR_TRAVEL_SECONDS = 6;

export type ElevatorFloorIndex = 1 | 4;
export type ElevatorDoorState =
  | "closed"
  | "opening"
  | "open"
  | "closing";
export type ElevatorCarState = "stopped" | "moving";
export type ElevatorDoorMotion = "opening" | "closing";

export type ElevatorPassengerReservation = Readonly<{
  actorId: string;
  fromStopId: string;
  destinationStopId: string;
  requestedAtSeconds: number;
}>;

export type ElevatorBoardingReservationResult =
  | Readonly<{
      status: "accepted";
      reservation: ElevatorPassengerReservation;
    }>
  | Readonly<{
      status: "capacity-reached";
      actorId: string;
    }>
  | Readonly<{
      status: "not-boardable";
      actorId: string;
    }>;

export type StageElevatorDoorPanelAdapter = Readonly<{
  id: string;
  blockerMeshes: readonly Mesh[];
  setOpenness(openness: number): void;
}>;

export type StageElevatorStopInput = Readonly<{
  id: string;
  floorIndex: ElevatorFloorIndex;
  carPosition: Vector3;
  landingDoorPanels: readonly StageElevatorDoorPanelAdapter[];
  humanGateCollider: Mesh;
  setHumanGateEnabled(enabled: boolean): void;
}>;

export interface StageElevatorCarAdapter {
  getWorldPosition(): Vector3;
  setWorldPosition(position: Vector3): void;
  worldToCarLocal(position: Vector3): Vector3;
  carLocalToWorld(position: Vector3): Vector3;
}

export interface StageElevatorActorAdapter {
  getActorPosition(actorId: string): Vector3;
  setActorPosition(actorId: string, position: Vector3): void;
}

export interface StageElevatorOccupancyAdapter {
  isDoorMotionBlocked(
    stopId: string,
    motion: ElevatorDoorMotion
  ): boolean;
}

export type StageElevatorRuntimeInput = Readonly<{
  id: string;
  stops: readonly StageElevatorStopInput[];
  carDoorPanels: readonly StageElevatorDoorPanelAdapter[];
  car: StageElevatorCarAdapter;
  actors: StageElevatorActorAdapter;
  occupancy: StageElevatorOccupancyAdapter;
}>;

export type StageElevatorSpatialSnapshot = Readonly<{
  revision: number;
  movementColliders: Readonly<{
    player: readonly Mesh[];
    npc: readonly Mesh[];
    bit: readonly Mesh[];
  }>;
  groundColliders: readonly Mesh[];
  beamBlockers: readonly Mesh[];
  sightBlockers: readonly Mesh[];
  bitObstacles: readonly Mesh[];
}>;

export type ElevatorPassengerSnapshot = Readonly<{
  actorId: string;
  destinationStopId: string;
  carLocalPosition: Vector3;
}>;

export type ElevatorStopSnapshot = Readonly<{
  id: string;
  floorIndex: ElevatorFloorIndex;
  landingDoorState: ElevatorDoorState;
  doorProgress: number;
  humanGateEnabled: boolean;
  callPending: boolean;
}>;

export type StageElevatorSnapshot = Readonly<{
  id: string;
  elapsedSeconds: number;
  carState: ElevatorCarState;
  carDoorState: ElevatorDoorState;
  doorProgress: number;
  carTravelProgress: number;
  currentStopId: string | null;
  targetStopId: string | null;
  dwellRemainingSeconds: number | null;
  carPosition: Vector3;
  calls: readonly string[];
  reservations: readonly ElevatorPassengerReservation[];
  passengers: readonly ElevatorPassengerSnapshot[];
  stops: readonly ElevatorStopSnapshot[];
}>;

export interface StageElevatorRuntime {
  requestCall(stopId: string): void;
  requestBoarding(
    reservation: ElevatorPassengerReservation
  ): ElevatorBoardingReservationResult;
  requestBoarding(
    reservations: readonly ElevatorPassengerReservation[]
  ): readonly ElevatorBoardingReservationResult[];
  cancelBoardingReservation(actorId: string): void;
  completeBoarding(actorId: string): void;
  completeDisembark(actorId: string): void;
  getSnapshot(): StageElevatorSnapshot;
  getSpatialSnapshot(): StageElevatorSpatialSnapshot;
  update(deltaSeconds: number): StageElevatorSnapshot;
}

type RuntimeStop = StageElevatorStopInput;

type RuntimePassenger = Readonly<{
  actorId: string;
  destinationStopId: string;
  carLocalPosition: Vector3;
}>;

const assertOpaqueId = (name: string, value: string) => {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name}には前後空白のない非空文字列が必要です。`);
  }
};

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const validatePanelAdapters = (
  name: string,
  panels: readonly StageElevatorDoorPanelAdapter[],
  panelIds: Set<string>,
  panelMeshes: Set<Mesh>
) => {
  if (panels.length === 0) {
    throw new Error(`${name}には実扉panelが1件以上必要です。`);
  }
  return Object.freeze(
    panels.map((panel, panelIndex) => {
      assertOpaqueId(`${name}[${panelIndex}]のID`, panel.id);
      if (panelIds.has(panel.id)) {
        throw new Error(`実扉panel IDが重複しています: ${panel.id}`);
      }
      if (panel.blockerMeshes.length === 0) {
        throw new Error(`実扉panel ${panel.id} にblocker Meshがありません。`);
      }
      panelIds.add(panel.id);
      const blockerMeshes = Object.freeze([...panel.blockerMeshes]);
      blockerMeshes.forEach((mesh) => {
        if (panelMeshes.has(mesh)) {
          throw new Error(
            `実扉panel blocker Meshが重複所有されています: ${mesh.name}`
          );
        }
        panelMeshes.add(mesh);
      });
      return Object.freeze({
        id: panel.id,
        blockerMeshes,
        setOpenness: panel.setOpenness
      });
    })
  );
};

const compareActorIds = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const compareReservations = (
  left: ElevatorPassengerReservation,
  right: ElevatorPassengerReservation
) =>
  left.requestedAtSeconds - right.requestedAtSeconds ||
  compareActorIds(left.actorId, right.actorId);

const cloneReservation = (
  reservation: ElevatorPassengerReservation
): ElevatorPassengerReservation =>
  Object.freeze({
    actorId: reservation.actorId,
    fromStopId: reservation.fromStopId,
    destinationStopId: reservation.destinationStopId,
    requestedAtSeconds: reservation.requestedAtSeconds
  });

class TwoStopStageElevatorRuntime implements StageElevatorRuntime {
  private readonly id: string;
  private readonly stops: readonly RuntimeStop[];
  private readonly stopById: ReadonlyMap<string, RuntimeStop>;
  private readonly carDoorPanels: readonly StageElevatorDoorPanelAdapter[];
  private readonly allPanelBlockers: readonly Mesh[];
  private readonly car: StageElevatorCarAdapter;
  private readonly actors: StageElevatorActorAdapter;
  private readonly occupancy: StageElevatorOccupancyAdapter;
  private readonly gateEnabledByStopId = new Map<string, boolean>();
  private readonly calls = new Set<string>();
  private readonly reservations = new Map<
    string,
    ElevatorPassengerReservation
  >();
  private readonly passengers = new Map<string, RuntimePassenger>();

  private elapsedSeconds = 0;
  private carState: ElevatorCarState = "stopped";
  private doorState: ElevatorDoorState = "open";
  private doorElapsedSeconds = 0;
  private travelElapsedSeconds = 0;
  private dwellRemainingSeconds: number | null = null;
  private currentStop: RuntimeStop | null;
  private departureStop: RuntimeStop | null = null;
  private targetStop: RuntimeStop | null = null;
  private spatialRevision = 0;
  private spatialDirty = false;
  private spatialSnapshot!: StageElevatorSpatialSnapshot;

  constructor(input: StageElevatorRuntimeInput) {
    assertOpaqueId("エレベーターID", input.id);
    if (input.stops.length !== 2) {
      throw new Error("エレベーター停止階は1階と4階の2件が必要です。");
    }

    const panelIds = new Set<string>();
    const panelMeshes = new Set<Mesh>();
    const carDoorPanels = validatePanelAdapters(
      "かご扉panel",
      input.carDoorPanels,
      panelIds,
      panelMeshes
    );
    const stopIds = new Set<string>();
    const floorIndices = new Set<ElevatorFloorIndex>();
    const humanGateColliders = new Set<Mesh>();
    const stops = input.stops.map((stop, stopIndex) => {
      assertOpaqueId(`停止階${stopIndex}のID`, stop.id);
      assertFiniteVector(`停止階${stop.id}のかご位置`, stop.carPosition);
      if (stopIds.has(stop.id)) {
        throw new Error(`エレベーター停止階IDが重複しています: ${stop.id}`);
      }
      if (floorIndices.has(stop.floorIndex)) {
        throw new Error(
          `エレベーター停止階番号が重複しています: ${stop.floorIndex}`
        );
      }
      stopIds.add(stop.id);
      floorIndices.add(stop.floorIndex);
      const landingDoorPanels = validatePanelAdapters(
        `停止階${stop.id}の乗場扉panel`,
        stop.landingDoorPanels,
        panelIds,
        panelMeshes
      );
      if (panelMeshes.has(stop.humanGateCollider)) {
        throw new Error(
          `人物gate Colliderを実扉panel blockerと共有できません: ${stop.humanGateCollider.name}`
        );
      }
      if (humanGateColliders.has(stop.humanGateCollider)) {
        throw new Error(
          `人物gate Colliderが停止階間で共有されています: ${stop.humanGateCollider.name}`
        );
      }
      humanGateColliders.add(stop.humanGateCollider);
      return Object.freeze({
        ...stop,
        carPosition: stop.carPosition.clone(),
        landingDoorPanels
      });
    });
    if (!floorIndices.has(1) || !floorIndices.has(4)) {
      throw new Error("エレベーター停止階は1階と4階である必要があります。");
    }

    this.id = input.id;
    this.stops = Object.freeze(stops);
    this.stopById = new Map(stops.map((stop) => [stop.id, stop]));
    this.carDoorPanels = carDoorPanels;
    this.allPanelBlockers = Object.freeze([
      ...carDoorPanels.flatMap((panel) => panel.blockerMeshes),
      ...stops.flatMap((stop) =>
        stop.landingDoorPanels.flatMap((panel) => panel.blockerMeshes)
      )
    ]);
    this.car = input.car;
    this.actors = input.actors;
    this.occupancy = input.occupancy;
    this.currentStop = this.getStopByFloor(4);

    this.car.setWorldPosition(this.currentStop.carPosition.clone());
    assertFiniteVector("初期かご位置", this.car.getWorldPosition());
    this.stops.forEach((stop) => {
      this.setHumanGateEnabled(stop, stop !== this.currentStop);
    });
    this.applyPanelOpenness();
    this.publishSpatialSnapshot(false);
    this.spatialDirty = false;
  }

  requestCall(stopId: string) {
    const stop = this.getStop(stopId);
    if (
      this.carState === "stopped" &&
      this.currentStop === stop &&
      this.doorState === "open"
    ) {
      this.calls.delete(stop.id);
      return;
    }
    this.calls.add(stop.id);
  }

  requestBoarding(
    reservation: ElevatorPassengerReservation
  ): ElevatorBoardingReservationResult;
  requestBoarding(
    reservations: readonly ElevatorPassengerReservation[]
  ): readonly ElevatorBoardingReservationResult[];
  requestBoarding(
    input:
      | ElevatorPassengerReservation
      | readonly ElevatorPassengerReservation[]
  ):
    | ElevatorBoardingReservationResult
    | readonly ElevatorBoardingReservationResult[] {
    const multiple = Array.isArray(input);
    const requested = multiple
      ? [...input]
      : [input as ElevatorPassengerReservation];
    const actorIds = new Set<string>();

    requested.forEach((reservation, requestIndex) => {
      assertOpaqueId(
        `乗車予約${requestIndex}のActor ID`,
        reservation.actorId
      );
      const fromStop = this.getStop(reservation.fromStopId);
      const destinationStop = this.getStop(
        reservation.destinationStopId
      );
      if (fromStop === destinationStop) {
        throw new Error("乗車予約の出発階と目的階は異なる必要があります。");
      }
      assertNonNegativeFiniteNumber(
        `乗車予約${reservation.actorId}の要求時刻`,
        reservation.requestedAtSeconds
      );
      if (actorIds.has(reservation.actorId)) {
        throw new Error(
          `同一更新の乗車予約Actor IDが重複しています: ${reservation.actorId}`
        );
      }
      if (
        this.reservations.has(reservation.actorId) ||
        this.passengers.has(reservation.actorId)
      ) {
        throw new Error(
          `Actorは既に乗車予約中または乗車中です: ${reservation.actorId}`
        );
      }
      actorIds.add(reservation.actorId);
    });

    const boardable =
      this.carState === "stopped" &&
      this.doorState === "open" &&
      this.currentStop !== null;
    const resultByActorId = new Map<
      string,
      ElevatorBoardingReservationResult
    >();

    if (!boardable) {
      requested.forEach((reservation) => {
        resultByActorId.set(
          reservation.actorId,
          Object.freeze({
            status: "not-boardable",
            actorId: reservation.actorId
          })
        );
      });
    } else {
      const sorted = [...requested].sort(compareReservations);
      let available =
        ELEVATOR_CAPACITY -
        this.passengers.size -
        this.reservations.size;
      sorted.forEach((reservation) => {
        if (reservation.fromStopId !== this.currentStop!.id) {
          resultByActorId.set(
            reservation.actorId,
            Object.freeze({
              status: "not-boardable",
              actorId: reservation.actorId
            })
          );
          return;
        }
        if (available === 0) {
          resultByActorId.set(
            reservation.actorId,
            Object.freeze({
              status: "capacity-reached",
              actorId: reservation.actorId
            })
          );
          return;
        }
        const accepted = cloneReservation(reservation);
        this.reservations.set(accepted.actorId, accepted);
        available -= 1;
        resultByActorId.set(
          accepted.actorId,
          Object.freeze({
            status: "accepted",
            reservation: accepted
          })
        );
      });
    }

    const results = Object.freeze(
      requested.map((reservation) => resultByActorId.get(reservation.actorId)!)
    );
    return multiple ? results : results[0];
  }

  cancelBoardingReservation(actorId: string) {
    assertOpaqueId("予約取消Actor ID", actorId);
    if (!this.reservations.delete(actorId)) {
      throw new Error(`取消対象の乗車予約がありません: ${actorId}`);
    }
  }

  completeBoarding(actorId: string) {
    assertOpaqueId("乗車完了Actor ID", actorId);
    const reservation = this.reservations.get(actorId);
    if (!reservation) {
      throw new Error(`乗車完了対象の予約がありません: ${actorId}`);
    }
    if (
      this.carState !== "stopped" ||
      this.doorState !== "open" ||
      this.currentStop?.id !== reservation.fromStopId
    ) {
      throw new Error("扉が完全開放された予約出発階でのみ乗車完了できます。");
    }

    const actorPosition = this.actors.getActorPosition(actorId);
    assertFiniteVector(`Actor ${actorId}の乗車位置`, actorPosition);
    const carLocalPosition = this.car.worldToCarLocal(actorPosition);
    assertFiniteVector(`Actor ${actorId}のかご相対位置`, carLocalPosition);

    this.reservations.delete(actorId);
    this.passengers.set(
      actorId,
      Object.freeze({
        actorId,
        destinationStopId: reservation.destinationStopId,
        carLocalPosition: carLocalPosition.clone()
      })
    );
    if (this.dwellRemainingSeconds === null) {
      this.dwellRemainingSeconds =
        ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS;
    }
  }

  completeDisembark(actorId: string) {
    assertOpaqueId("降車完了Actor ID", actorId);
    if (
      this.carState !== "stopped" ||
      this.doorState !== "open" ||
      this.currentStop === null
    ) {
      throw new Error("扉が完全開放された停止階でのみ降車完了できます。");
    }
    if (!this.passengers.delete(actorId)) {
      throw new Error(`降車対象の乗客がいません: ${actorId}`);
    }
    if (this.passengers.size === 0) {
      this.dwellRemainingSeconds = null;
    }
  }

  getSnapshot(): StageElevatorSnapshot {
    const carPosition = this.car.getWorldPosition();
    assertFiniteVector("かご位置", carPosition);
    const doorProgress = this.getDoorProgress();
    const calls = Object.freeze(
      this.stops
        .filter((stop) => this.calls.has(stop.id))
        .map((stop) => stop.id)
    );
    const reservations = Object.freeze(
      [...this.reservations.values()]
        .sort(compareReservations)
        .map(cloneReservation)
    );
    const passengers = Object.freeze(
      [...this.passengers.values()]
        .sort((left, right) =>
          compareActorIds(left.actorId, right.actorId)
        )
        .map((passenger) =>
          Object.freeze({
            actorId: passenger.actorId,
            destinationStopId: passenger.destinationStopId,
            carLocalPosition: passenger.carLocalPosition.clone()
          })
        )
    );
    const stops = Object.freeze(
      this.stops.map((stop) => {
        const isCurrent =
          this.carState === "stopped" && this.currentStop === stop;
        return Object.freeze({
          id: stop.id,
          floorIndex: stop.floorIndex,
          landingDoorState: isCurrent ? this.doorState : "closed",
          doorProgress: isCurrent ? doorProgress : 0,
          humanGateEnabled: this.gateEnabledByStopId.get(stop.id)!,
          callPending: this.calls.has(stop.id)
        });
      })
    );

    return Object.freeze({
      id: this.id,
      elapsedSeconds: this.elapsedSeconds,
      carState: this.carState,
      carDoorState: this.doorState,
      doorProgress,
      carTravelProgress:
        this.carState === "moving"
          ? this.travelElapsedSeconds / ELEVATOR_TRAVEL_SECONDS
          : 0,
      currentStopId: this.currentStop?.id ?? null,
      targetStopId: this.targetStop?.id ?? null,
      dwellRemainingSeconds: this.dwellRemainingSeconds,
      carPosition: carPosition.clone(),
      calls,
      reservations,
      passengers,
      stops
    });
  }

  getSpatialSnapshot() {
    return this.spatialSnapshot;
  }

  update(deltaSeconds: number): StageElevatorSnapshot {
    assertNonNegativeFiniteNumber(
      "エレベーター更新deltaSeconds",
      deltaSeconds
    );
    this.elapsedSeconds += deltaSeconds;
    this.spatialDirty = false;
    let remainingSeconds = deltaSeconds;

    for (let transitionCount = 0; transitionCount < 16; transitionCount += 1) {
      if (this.carState === "moving") {
        if (remainingSeconds === 0) {
          break;
        }
        remainingSeconds = this.advanceTravel(remainingSeconds);
        if (this.carState === "moving") {
          break;
        }
        continue;
      }

      if (this.doorState === "opening" || this.doorState === "closing") {
        if (remainingSeconds === 0) {
          break;
        }
        remainingSeconds = this.advanceDoorMotion(remainingSeconds);
        if (
          this.doorState === "opening" ||
          this.doorState === "closing"
        ) {
          break;
        }
        continue;
      }

      if (this.doorState === "closed") {
        if (!this.currentStop) {
          throw new Error("停止中の閉扉状態に現在停止階がありません。");
        }
        if (
          this.occupancy.isDoorMotionBlocked(
            this.currentStop.id,
            "opening"
          )
        ) {
          break;
        }
        this.doorState = "opening";
        this.doorElapsedSeconds = 0;
        this.applyPanelOpenness();
        this.markSpatialChanged();
        continue;
      }

      if (!this.currentStop) {
        throw new Error("開扉状態に現在停止階がありません。");
      }
      this.calls.delete(this.currentStop.id);

      if (
        this.dwellRemainingSeconds !== null &&
        this.dwellRemainingSeconds > 0
      ) {
        if (remainingSeconds === 0) {
          break;
        }
        const consumed = Math.min(
          remainingSeconds,
          this.dwellRemainingSeconds
        );
        this.dwellRemainingSeconds -= consumed;
        remainingSeconds -= consumed;
        if (this.dwellRemainingSeconds > 0) {
          break;
        }
      }

      if (this.reservations.size > 0) {
        break;
      }
      const departureTarget = this.resolveDepartureTarget();
      if (!departureTarget) {
        break;
      }
      if (
        this.occupancy.isDoorMotionBlocked(
          this.currentStop.id,
          "closing"
        )
      ) {
        break;
      }

      this.targetStop = departureTarget;
      this.setHumanGateEnabled(this.currentStop, true);
      this.doorState = "closing";
      this.doorElapsedSeconds = 0;
      this.applyPanelOpenness();
      this.markSpatialChanged();
    }

    if (this.spatialDirty) {
      this.publishSpatialSnapshot(true);
      this.spatialDirty = false;
    }
    return this.getSnapshot();
  }

  private advanceDoorMotion(availableSeconds: number) {
    const motion = this.doorState;
    if (motion !== "opening" && motion !== "closing") {
      throw new Error("扉移動中ではありません。");
    }
    const remainingMotion =
      ELEVATOR_DOOR_MOTION_SECONDS - this.doorElapsedSeconds;
    const consumed = Math.min(availableSeconds, remainingMotion);
    this.doorElapsedSeconds += consumed;
    if (consumed > 0) {
      this.applyPanelOpenness();
      this.markSpatialChanged();
    }
    const remainingSeconds = availableSeconds - consumed;
    if (this.doorElapsedSeconds < ELEVATOR_DOOR_MOTION_SECONDS) {
      return remainingSeconds;
    }

    this.doorElapsedSeconds = 0;
    if (motion === "opening") {
      if (!this.currentStop) {
        throw new Error("開扉完了時に現在停止階がありません。");
      }
      this.doorState = "open";
      this.setHumanGateEnabled(this.currentStop, false);
      this.applyPanelOpenness();
      this.markSpatialChanged();
      this.calls.delete(this.currentStop.id);
      this.dwellRemainingSeconds =
        this.passengers.size > 0
          ? ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS
          : null;
      return remainingSeconds;
    }

    if (!this.currentStop || !this.targetStop) {
      throw new Error("閉扉完了時に移動元または移動先がありません。");
    }
    this.doorState = "closed";
    this.departureStop = this.currentStop;
    this.currentStop = null;
    this.carState = "moving";
    this.travelElapsedSeconds = 0;
    this.dwellRemainingSeconds = null;
    this.stops.forEach((stop) => this.setHumanGateEnabled(stop, true));
    this.applyPanelOpenness();
    this.markSpatialChanged();
    return remainingSeconds;
  }

  private advanceTravel(availableSeconds: number) {
    if (!this.departureStop || !this.targetStop) {
      throw new Error("移動中のかごに出発階または目的階がありません。");
    }
    const remainingTravel =
      ELEVATOR_TRAVEL_SECONDS - this.travelElapsedSeconds;
    const consumed = Math.min(availableSeconds, remainingTravel);
    this.travelElapsedSeconds += consumed;
    const progress =
      this.travelElapsedSeconds / ELEVATOR_TRAVEL_SECONDS;
    const position = Vector3.Lerp(
      this.departureStop.carPosition,
      this.targetStop.carPosition,
      progress
    );
    this.car.setWorldPosition(position);
    this.carryPassengers();
    if (consumed > 0) {
      this.applyPanelOpenness();
      this.markSpatialChanged();
    }

    const remainingSeconds = availableSeconds - consumed;
    if (this.travelElapsedSeconds < ELEVATOR_TRAVEL_SECONDS) {
      return remainingSeconds;
    }

    const arrivedStop = this.targetStop;
    this.car.setWorldPosition(arrivedStop.carPosition.clone());
    this.carryPassengers();
    this.currentStop = arrivedStop;
    this.departureStop = null;
    this.targetStop = null;
    this.carState = "stopped";
    this.travelElapsedSeconds = 0;
    this.calls.delete(arrivedStop.id);
    this.applyPanelOpenness();
    this.markSpatialChanged();
    return remainingSeconds;
  }

  private carryPassengers() {
    this.passengers.forEach((passenger) => {
      const worldPosition = this.car.carLocalToWorld(
        passenger.carLocalPosition
      );
      assertFiniteVector(
        `Actor ${passenger.actorId}の搬送位置`,
        worldPosition
      );
      this.actors.setActorPosition(
        passenger.actorId,
        worldPosition.clone()
      );
    });
  }

  private resolveDepartureTarget() {
    if (!this.currentStop) {
      throw new Error("移動先選択時に現在停止階がありません。");
    }
    if (this.passengers.size > 0) {
      const passengerDestination = [...this.passengers.values()]
        .sort((left, right) =>
          compareActorIds(left.actorId, right.actorId)
        )
        .map((passenger) => this.getStop(passenger.destinationStopId))
        .find((stop) => stop !== this.currentStop);
      return passengerDestination ?? this.getOppositeStop(this.currentStop);
    }
    return (
      this.stops.find(
        (stop) => stop !== this.currentStop && this.calls.has(stop.id)
      ) ?? null
    );
  }

  private applyPanelOpenness() {
    const currentDoorOpenness =
      this.carState === "stopped" && this.currentStop
        ? this.getDoorProgress()
        : 0;
    this.carDoorPanels.forEach((panel) => {
      panel.setOpenness(currentDoorOpenness);
    });
    this.stops.forEach((stop) => {
      const openness =
        this.carState === "stopped" && this.currentStop === stop
          ? currentDoorOpenness
          : 0;
      stop.landingDoorPanels.forEach((panel) => {
        panel.setOpenness(openness);
      });
    });
  }

  private publishSpatialSnapshot(incrementRevision: boolean) {
    if (incrementRevision) {
      this.spatialRevision += 1;
    }
    const activeHumanGates = this.stops
      .filter((stop) => this.gateEnabledByStopId.get(stop.id) === true)
      .map((stop) => stop.humanGateCollider);
    const humanMovementColliders = Object.freeze([
      ...this.allPanelBlockers,
      ...activeHumanGates
    ]);
    const panelBlockers = Object.freeze([...this.allPanelBlockers]);
    this.spatialSnapshot = Object.freeze({
      revision: this.spatialRevision,
      movementColliders: Object.freeze({
        player: humanMovementColliders,
        npc: humanMovementColliders,
        bit: panelBlockers
      }),
      groundColliders: Object.freeze([]),
      beamBlockers: panelBlockers,
      sightBlockers: panelBlockers,
      bitObstacles: panelBlockers
    });
  }

  private markSpatialChanged() {
    this.spatialDirty = true;
  }

  private getDoorProgress() {
    switch (this.doorState) {
      case "closed":
        return 0;
      case "open":
        return 1;
      case "opening":
        return this.doorElapsedSeconds / ELEVATOR_DOOR_MOTION_SECONDS;
      case "closing":
        return (
          1 -
          this.doorElapsedSeconds / ELEVATOR_DOOR_MOTION_SECONDS
        );
    }
  }

  private getStop(stopId: string) {
    assertOpaqueId("エレベーター停止階ID", stopId);
    const stop = this.stopById.get(stopId);
    if (!stop) {
      throw new Error(`未登録のエレベーター停止階IDです: ${stopId}`);
    }
    return stop;
  }

  private getStopByFloor(floorIndex: ElevatorFloorIndex) {
    const stop = this.stops.find(
      (candidate) => candidate.floorIndex === floorIndex
    );
    if (!stop) {
      throw new Error(`エレベーター停止階${floorIndex}がありません。`);
    }
    return stop;
  }

  private getOppositeStop(stop: RuntimeStop) {
    const opposite = this.stops.find((candidate) => candidate !== stop);
    if (!opposite) {
      throw new Error("反対側のエレベーター停止階がありません。");
    }
    return opposite;
  }

  private setHumanGateEnabled(stop: RuntimeStop, enabled: boolean) {
    if (this.gateEnabledByStopId.get(stop.id) === enabled) {
      return;
    }
    stop.setHumanGateEnabled(enabled);
    this.gateEnabledByStopId.set(stop.id, enabled);
    this.markSpatialChanged();
  }
}

export const createStageElevatorRuntime = (
  input: StageElevatorRuntimeInput
): StageElevatorRuntime => new TwoStopStageElevatorRuntime(input);
