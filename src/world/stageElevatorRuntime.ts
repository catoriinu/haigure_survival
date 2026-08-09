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
export type ElevatorCallMatState =
  | "ready"
  | "called"
  | "unloading"
  | "departure-countdown"
  | "locked";
export type ElevatorCallMatVisualPhase = "primary" | "black";
export type ElevatorPassengerState = "riding" | "arrived";

export type ElevatorCallRequestResult = Readonly<{
  status: "accepted" | "not-callable";
  stopId: string;
}>;

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

export type StageElevatorCallIndicatorAdapter = Readonly<{
  id: string;
  setPresentation(
    state: ElevatorCallMatState,
    visualPhase: ElevatorCallMatVisualPhase
  ): void;
  dispose(): void;
}>;

export type StageElevatorStopInput = Readonly<{
  id: string;
  floorIndex: ElevatorFloorIndex;
  carPosition: Vector3;
  landingDoorPanels: readonly StageElevatorDoorPanelAdapter[];
  humanGateCollider: Mesh;
  setHumanGateEnabled(enabled: boolean): void;
  callIndicator: StageElevatorCallIndicatorAdapter;
}>;

export interface StageElevatorCarAdapter {
  getWorldPosition(): Vector3;
  setWorldPosition(position: Vector3): void;
  getBoardingWorldPosition(slotIndex: number): Vector3;
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
  state: ElevatorPassengerState;
  carLocalPosition: Vector3;
}>;

export type ElevatorStopSnapshot = Readonly<{
  id: string;
  floorIndex: ElevatorFloorIndex;
  landingDoorState: ElevatorDoorState;
  doorProgress: number;
  humanGateEnabled: boolean;
  callPending: boolean;
  callMatState: ElevatorCallMatState;
}>;

export type StageElevatorSnapshot = Readonly<{
  id: string;
  elapsedSeconds: number;
  carState: ElevatorCarState;
  carDoorState: ElevatorDoorState;
  doorProgress: number;
  carTravelProgress: number;
  currentStopId: string | null;
  displayStopId: string | null;
  targetStopId: string | null;
  dwellRemainingSeconds: number | null;
  carPosition: Vector3;
  calls: readonly string[];
  reservations: readonly ElevatorPassengerReservation[];
  passengers: readonly ElevatorPassengerSnapshot[];
  stops: readonly ElevatorStopSnapshot[];
}>;

export type StageElevatorTripEstimate = Readonly<{
  fromStopId: string;
  destinationStopId: string;
  capacityAvailable: boolean;
  availableCapacity: number;
  waitSeconds: number;
  boardingWindowSeconds: number;
  rideSeconds: number;
  totalSeconds: number;
}>;

export interface StageElevatorRuntime {
  requestCall(stopId: string): ElevatorCallRequestResult;
  requestBoarding(
    reservation: ElevatorPassengerReservation
  ): ElevatorBoardingReservationResult;
  requestBoarding(
    reservations: readonly ElevatorPassengerReservation[]
  ): readonly ElevatorBoardingReservationResult[];
  cancelBoardingReservation(actorId: string): void;
  completeBoarding(actorId: string): void;
  completePreDepartureExit(actorId: string): void;
  completeDisembark(actorId: string): void;
  releaseHumanTraversalForScriptedPhase(): void;
  estimateTripSeconds(
    fromStopId: string,
    destinationStopId: string
  ): StageElevatorTripEstimate;
  getSnapshot(): StageElevatorSnapshot;
  getSpatialSnapshot(): StageElevatorSpatialSnapshot;
  update(deltaSeconds: number): StageElevatorSnapshot;
  dispose(): void;
}

type RuntimeStop = StageElevatorStopInput;

type RuntimePassenger = Readonly<{
  actorId: string;
  destinationStopId: string;
  state: ElevatorPassengerState;
  slotIndex: number;
  carLocalPosition: Vector3;
}>;

type ElevatorCallIndicatorPresentation = Readonly<{
  state: ElevatorCallMatState;
  visualPhase: ElevatorCallMatVisualPhase;
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
  private readonly indicatorPresentationByStopId = new Map<
    string,
    ElevatorCallIndicatorPresentation
  >();
  private readonly indicatorBlinkStartedAtByStopId = new Map<
    string,
    number
  >();
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
  private currentSnapshot: StageElevatorSnapshot | null = null;
  private active = true;

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
    const callIndicatorIds = new Set<string>();
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
      assertOpaqueId(
        `停止階${stop.id}の呼出indicator ID`,
        stop.callIndicator.id
      );
      if (callIndicatorIds.has(stop.callIndicator.id)) {
        throw new Error(
          `呼出indicator IDが停止階間で重複しています: ${stop.callIndicator.id}`
        );
      }
      callIndicatorIds.add(stop.callIndicator.id);
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
    this.refreshCallIndicators();
  }

  requestCall(stopId: string) {
    this.assertActive();
    const stop = this.getStop(stopId);
    if (this.getCallMatState(stop) !== "ready") {
      return Object.freeze({
        status: "not-callable",
        stopId: stop.id
      }) satisfies ElevatorCallRequestResult;
    }
    if (
      this.carState === "stopped" &&
      this.currentStop === stop &&
      this.doorState === "open"
    ) {
      this.calls.delete(stop.id);
      this.refreshCallIndicators();
      return Object.freeze({
        status: "accepted",
        stopId: stop.id
      }) satisfies ElevatorCallRequestResult;
    }
    this.calls.add(stop.id);
    this.refreshCallIndicators();
    return Object.freeze({
      status: "accepted",
      stopId: stop.id
    }) satisfies ElevatorCallRequestResult;
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
    this.assertActive();
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
      this.currentStop !== null &&
      !this.hasArrivedPassengers() &&
      !this.hasRemoteCall();
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

    this.refreshCallIndicators();
    const results = Object.freeze(
      requested.map((reservation) => resultByActorId.get(reservation.actorId)!)
    );
    return multiple ? results : results[0];
  }

  cancelBoardingReservation(actorId: string) {
    this.assertActive();
    assertOpaqueId("予約取消Actor ID", actorId);
    if (!this.reservations.delete(actorId)) {
      throw new Error(`取消対象の乗車予約がありません: ${actorId}`);
    }
    this.refreshCallIndicators();
  }

  completeBoarding(actorId: string) {
    this.assertActive();
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
    if (this.hasArrivedPassengers()) {
      throw new Error(
        "到着客が全員完全降車するまで新しい乗車を完了できません。"
      );
    }

    const occupiedSlotIndices = new Set(
      [...this.passengers.values()].map(
        (passenger) => passenger.slotIndex
      )
    );
    const slotIndex = Array.from(
      { length: ELEVATOR_CAPACITY },
      (_, index) => index
    ).find((index) => !occupiedSlotIndices.has(index));
    if (slotIndex === undefined) {
      throw new Error(
        `乗車完了時に空きslotがありません: ${actorId}`
      );
    }
    const boardingPosition =
      this.car.getBoardingWorldPosition(slotIndex);
    assertFiniteVector(
      `Actor ${actorId}のかご内乗車位置`,
      boardingPosition
    );
    this.actors.setActorPosition(
      actorId,
      boardingPosition.clone()
    );
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
        state: "riding",
        slotIndex,
        carLocalPosition: carLocalPosition.clone()
      })
    );
    if (this.dwellRemainingSeconds === null) {
      this.dwellRemainingSeconds =
        ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS;
    }
    this.refreshCallIndicators();
  }

  completeDisembark(actorId: string) {
    this.assertActive();
    assertOpaqueId("降車完了Actor ID", actorId);
    if (
      this.carState !== "stopped" ||
      this.doorState !== "open" ||
      this.currentStop === null
    ) {
      throw new Error("扉が完全開放された停止階でのみ降車完了できます。");
    }
    const passenger = this.passengers.get(actorId);
    if (!passenger) {
      throw new Error(`降車対象の乗客がいません: ${actorId}`);
    }
    if (passenger.state !== "arrived") {
      throw new Error(
        `目的階へ到着していない乗客は降車完了できません: ${actorId}`
      );
    }
    this.passengers.delete(actorId);
    if (!this.hasRidingPassengers()) {
      this.dwellRemainingSeconds = null;
    }
    this.refreshCallIndicators();
  }

  completePreDepartureExit(actorId: string) {
    this.assertActive();
    assertOpaqueId("出発前退避Actor ID", actorId);
    if (
      this.carState !== "stopped" ||
      this.doorState !== "open" ||
      this.currentStop === null
    ) {
      throw new Error(
        "扉が完全開放された出発階でのみ出発前退避を完了できます。"
      );
    }
    const passenger = this.passengers.get(actorId);
    if (!passenger) {
      throw new Error(
        `出発前退避対象の乗客がいません: ${actorId}`
      );
    }
    if (passenger.state !== "riding") {
      throw new Error(
        `到着済みの乗客は出発前退避できません: ${actorId}`
      );
    }
    this.passengers.delete(actorId);
    if (!this.hasRidingPassengers()) {
      this.dwellRemainingSeconds = null;
    }
    this.refreshCallIndicators();
  }

  releaseHumanTraversalForScriptedPhase() {
    this.assertActive();
    this.calls.clear();
    this.reservations.clear();
    this.passengers.clear();
    this.dwellRemainingSeconds = null;
    this.refreshCallIndicators();
  }

  estimateTripSeconds(
    fromStopId: string,
    destinationStopId: string
  ): StageElevatorTripEstimate {
    this.assertActive();
    const fromStop = this.getStop(fromStopId);
    const destinationStop = this.getStop(destinationStopId);
    if (fromStop === destinationStop) {
      throw new Error(
        "予測経路の出発階と目的階は異なる必要があります。"
      );
    }
    if (this.hasArrivedPassengers()) {
      return Object.freeze({
        fromStopId: fromStop.id,
        destinationStopId: destinationStop.id,
        capacityAvailable: false,
        availableCapacity: 0,
        waitSeconds: Number.POSITIVE_INFINITY,
        boardingWindowSeconds: Number.POSITIVE_INFINITY,
        rideSeconds:
          ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS +
          ELEVATOR_DOOR_MOTION_SECONDS +
          ELEVATOR_TRAVEL_SECONDS +
          ELEVATOR_DOOR_MOTION_SECONDS,
        totalSeconds: Number.POSITIVE_INFINITY
      });
    }

    const nextOpen = this.estimateNextOpenStop();
    const committedAtBoarding =
      nextOpen.stop === fromStop
        ? [...this.passengers.values()].filter(
            (passenger) =>
              passenger.destinationStopId !== fromStop.id
          ).length +
          [...this.reservations.values()].filter(
            (reservation) =>
              reservation.destinationStopId !== fromStop.id
          ).length
        : 0;
    const availableCapacity = Math.max(
      0,
      ELEVATOR_CAPACITY - committedAtBoarding
    );
    let waitSeconds = nextOpen.seconds;
    if (nextOpen.stop !== fromStop) {
      const reservationDwellSeconds =
        [...this.reservations.values()].some(
          (reservation) =>
            reservation.fromStopId === nextOpen.stop.id
        )
          ? ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS
          : 0;
      const currentDwellSeconds =
        this.carState === "stopped" &&
        this.currentStop === nextOpen.stop &&
        this.doorState === "open"
          ? (this.dwellRemainingSeconds ?? 0)
          : 0;
      waitSeconds +=
        Math.max(
          reservationDwellSeconds,
          currentDwellSeconds
        ) +
        ELEVATOR_DOOR_MOTION_SECONDS +
        ELEVATOR_TRAVEL_SECONDS +
        ELEVATOR_DOOR_MOTION_SECONDS;
    }

    const boardingDwellSeconds =
      this.carState === "stopped" &&
      this.currentStop === fromStop &&
      this.doorState === "open" &&
      this.dwellRemainingSeconds !== null
        ? this.dwellRemainingSeconds
        : ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS;
    const rideSeconds =
      boardingDwellSeconds +
      ELEVATOR_DOOR_MOTION_SECONDS +
      ELEVATOR_TRAVEL_SECONDS +
      ELEVATOR_DOOR_MOTION_SECONDS;

    return Object.freeze({
      fromStopId: fromStop.id,
      destinationStopId: destinationStop.id,
      capacityAvailable: availableCapacity > 0,
      availableCapacity,
      waitSeconds,
      boardingWindowSeconds:
        waitSeconds + boardingDwellSeconds,
      rideSeconds,
      totalSeconds: waitSeconds + rideSeconds
    });
  }

  getSnapshot(): StageElevatorSnapshot {
    this.assertActive();
    if (this.currentSnapshot !== null) {
      return this.currentSnapshot;
    }
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
            state: passenger.state,
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
          callPending: this.calls.has(stop.id),
          callMatState: this.getCallMatState(stop)
        });
      })
    );

    this.currentSnapshot = Object.freeze({
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
      displayStopId:
        this.currentStop?.id ?? this.departureStop?.id ?? null,
      targetStopId: this.targetStop?.id ?? null,
      dwellRemainingSeconds: this.dwellRemainingSeconds,
      carPosition: carPosition.clone(),
      calls,
      reservations,
      passengers,
      stops
    });
    return this.currentSnapshot;
  }

  getSpatialSnapshot() {
    this.assertActive();
    return this.spatialSnapshot;
  }

  update(deltaSeconds: number): StageElevatorSnapshot {
    this.assertActive();
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
        const motionState = this.doorState;
        remainingSeconds = this.advanceDoorMotion(remainingSeconds);
        const doorStateAfterMotion =
          this.doorState as ElevatorDoorState;
        if (
          motionState === "opening" &&
          doorStateAfterMotion === "open"
        ) {
          break;
        }
        if (
          doorStateAfterMotion === "opening" ||
          doorStateAfterMotion === "closing"
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

      if (this.hasArrivedPassengers()) {
        break;
      }

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
    this.refreshCallIndicators();
    return this.getSnapshot();
  }

  dispose() {
    this.assertActive();
    this.active = false;
    this.calls.clear();
    this.reservations.clear();
    this.passengers.clear();
    this.gateEnabledByStopId.clear();
    this.stops.forEach((stop) => stop.callIndicator.dispose());
    this.indicatorPresentationByStopId.clear();
    this.indicatorBlinkStartedAtByStopId.clear();
    this.spatialDirty = false;
    this.currentSnapshot = null;
  }

  private estimateNextOpenStop(): Readonly<{
    stop: RuntimeStop;
    seconds: number;
  }> {
    if (this.carState === "moving") {
      if (!this.targetStop) {
        throw new Error("移動中のかごに目的階がありません。");
      }
      return Object.freeze({
        stop: this.targetStop,
        seconds:
          ELEVATOR_TRAVEL_SECONDS -
          this.travelElapsedSeconds +
          ELEVATOR_DOOR_MOTION_SECONDS
      });
    }
    if (!this.currentStop) {
      throw new Error("停止中のかごに現在停止階がありません。");
    }
    switch (this.doorState) {
      case "open":
        return Object.freeze({
          stop: this.currentStop,
          seconds: 0
        });
      case "opening":
        return Object.freeze({
          stop: this.currentStop,
          seconds:
            ELEVATOR_DOOR_MOTION_SECONDS -
            this.doorElapsedSeconds
        });
      case "closed":
        return Object.freeze({
          stop: this.currentStop,
          seconds: ELEVATOR_DOOR_MOTION_SECONDS
        });
      case "closing":
        if (!this.targetStop) {
          throw new Error("閉扉中のかごに目的階がありません。");
        }
        return Object.freeze({
          stop: this.targetStop,
          seconds:
            ELEVATOR_DOOR_MOTION_SECONDS -
            this.doorElapsedSeconds +
            ELEVATOR_TRAVEL_SECONDS +
            ELEVATOR_DOOR_MOTION_SECONDS
        });
    }
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
      this.dwellRemainingSeconds = null;
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
    this.passengers.forEach((passenger, actorId) => {
      if (passenger.destinationStopId !== arrivedStop.id) {
        throw new Error(
          `到着階と乗客の目的階が一致しません: ${actorId}/${passenger.destinationStopId}/${arrivedStop.id}`
        );
      }
      this.passengers.set(
        actorId,
        Object.freeze({
          ...passenger,
          state: "arrived"
        })
      );
    });
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

  private getCallMatState(stop: RuntimeStop): ElevatorCallMatState {
    if (this.carState === "moving") {
      return this.targetStop === stop ? "called" : "locked";
    }
    if (!this.currentStop) {
      throw new Error("呼出マット状態の算出時に現在停止階がありません。");
    }

    if (this.doorState === "opening") {
      return this.currentStop === stop ? "called" : "locked";
    }
    if (this.doorState === "closing") {
      const emptyCarCallTrip =
        !this.hasRidingPassengers() && this.targetStop !== null;
      return emptyCarCallTrip && this.targetStop === stop
        ? "called"
        : "locked";
    }
    if (this.doorState === "closed") {
      if (
        this.hasArrivedPassengers() ||
        this.calls.has(this.currentStop.id)
      ) {
        return this.currentStop === stop ? "called" : "locked";
      }
      const emptyCarCallTrip =
        !this.hasRidingPassengers() && this.targetStop !== null;
      return emptyCarCallTrip && this.targetStop === stop
        ? "called"
        : "locked";
    }

    if (this.hasArrivedPassengers()) {
      return this.currentStop === stop ? "unloading" : "locked";
    }
    if (this.hasRidingPassengers()) {
      return this.currentStop === stop
        ? "departure-countdown"
        : "locked";
    }

    const remoteCalledStop = this.stops.find(
      (candidate) =>
        candidate !== this.currentStop && this.calls.has(candidate.id)
    );
    if (remoteCalledStop) {
      return remoteCalledStop === stop ? "called" : "locked";
    }

    if (this.reservations.size > 0) {
      return this.currentStop === stop ? "ready" : "locked";
    }
    return "ready";
  }

  private refreshCallIndicators() {
    this.currentSnapshot = null;
    this.stops.forEach((stop) => {
      const state = this.getCallMatState(stop);
      const blinking =
        state === "called" ||
        state === "departure-countdown";
      const previous =
        this.indicatorPresentationByStopId.get(stop.id);
      if (previous?.state !== state) {
        if (blinking) {
          this.indicatorBlinkStartedAtByStopId.set(
            stop.id,
            this.elapsedSeconds
          );
        } else {
          this.indicatorBlinkStartedAtByStopId.delete(stop.id);
        }
      }
      const blinkStartedAt =
        this.indicatorBlinkStartedAtByStopId.get(stop.id) ??
        this.elapsedSeconds;
      const blackPhase =
        Math.floor(
          (this.elapsedSeconds - blinkStartedAt) / 0.5
        ) %
          2 ===
        1;
      const visualPhase: ElevatorCallMatVisualPhase =
        blinking && blackPhase ? "black" : "primary";
      if (
        previous?.state === state &&
        previous.visualPhase === visualPhase
      ) {
        return;
      }
      stop.callIndicator.setPresentation(state, visualPhase);
      this.indicatorPresentationByStopId.set(
        stop.id,
        Object.freeze({ state, visualPhase })
      );
    });
  }

  private hasArrivedPassengers() {
    return [...this.passengers.values()].some(
      (passenger) => passenger.state === "arrived"
    );
  }

  private hasRidingPassengers() {
    return [...this.passengers.values()].some(
      (passenger) => passenger.state === "riding"
    );
  }

  private hasRemoteCall() {
    return (
      this.currentStop !== null &&
      this.stops.some(
        (stop) =>
          stop !== this.currentStop && this.calls.has(stop.id)
      )
    );
  }

  private resolveDepartureTarget() {
    if (!this.currentStop) {
      throw new Error("移動先選択時に現在停止階がありません。");
    }
    if (this.hasArrivedPassengers()) {
      return null;
    }
    if (this.hasRidingPassengers()) {
      const passengerDestination = [...this.passengers.values()]
        .filter((passenger) => passenger.state === "riding")
        .sort((left, right) =>
          compareActorIds(left.actorId, right.actorId)
        )
        .map((passenger) => this.getStop(passenger.destinationStopId))
        .find((stop) => stop !== this.currentStop);
      return passengerDestination ?? null;
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
    const movingPanelBlockers = new Set<Mesh>();
    if (
      this.doorState === "opening" ||
      this.doorState === "closing"
    ) {
      for (const panel of this.carDoorPanels) {
        for (const blocker of panel.blockerMeshes) {
          movingPanelBlockers.add(blocker);
        }
      }
      if (!this.currentStop) {
        throw new Error(
          "扉panel移動中のエレベーターに現在停止階がありません。"
        );
      }
      for (const panel of this.currentStop.landingDoorPanels) {
        for (const blocker of panel.blockerMeshes) {
          movingPanelBlockers.add(blocker);
        }
      }
    }
    const panelBlockers = Object.freeze(
      this.allPanelBlockers.filter(
        (blocker) => !movingPanelBlockers.has(blocker)
      )
    );
    const humanMovementColliders = Object.freeze([
      ...panelBlockers,
      ...activeHumanGates
    ]);
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

  private setHumanGateEnabled(stop: RuntimeStop, enabled: boolean) {
    if (this.gateEnabledByStopId.get(stop.id) === enabled) {
      return;
    }
    stop.setHumanGateEnabled(enabled);
    this.gateEnabledByStopId.set(stop.id, enabled);
    this.markSpatialChanged();
  }

  private assertActive() {
    if (!this.active) {
      throw new Error("破棄済みのStageElevatorRuntimeは使用できません。");
    }
  }
}

export const createStageElevatorRuntime = (
  input: StageElevatorRuntimeInput
): StageElevatorRuntime => new TwoStopStageElevatorRuntime(input);
