import { Mesh, Quaternion, Vector3 } from "@babylonjs/core";

import type { StageMovementColliderSets } from "./stageSpatialQueries";
import {
  type StageDoorAsset,
  type StageDoorAssetRegistry,
  type StageDoorPanelAsset,
  type StageNodeLocalTransform
} from "./stageDynamicAssets";
import { BLENDER_METERS_TO_WORLD_UNITS } from "./worldUnits";

export const STAGE_DOOR_TRAVEL_SECONDS = 0.8;
export const STAGE_DOOR_INTERACTION_DISTANCE_METERS = 1;
export const STAGE_DOOR_INTERACTION_DISTANCE_WORLD_UNITS =
  STAGE_DOOR_INTERACTION_DISTANCE_METERS * BLENDER_METERS_TO_WORLD_UNITS;

const ROOM_DOOR_INITIAL_CLOSED_PROBABILITY = 0.2;
const OPENNESS_EPSILON = 1e-9;

export const DOOR_STATES = [
  "closed",
  "opening",
  "open",
  "closing"
] as const;

export type DoorState = (typeof DOOR_STATES)[number];

export type StageDoorRuntimeDoorSnapshot = Readonly<{
  id: string;
  state: DoorState;
  openness: number;
}>;

export type StageDoorRuntimeSnapshot = Readonly<{
  revision: number;
  doors: readonly StageDoorRuntimeDoorSnapshot[];
}>;

export type StageDoorSpatialSnapshot = Readonly<{
  revision: number;
  transformsChanged: boolean;
  activePanelColliders: readonly Mesh[];
  movementColliders: StageMovementColliderSets;
  groundColliders: readonly Mesh[];
  beamBlockers: readonly Mesh[];
  sightBlockers: readonly Mesh[];
  bitObstacles: readonly Mesh[];
}>;

export type StageDoorClosingPanel = Readonly<{
  panel: StageDoorPanelAsset;
  finalTransform: StageNodeLocalTransform;
  colliders: readonly Mesh[];
}>;

export type StageDoorClosingOccupancyRequest = Readonly<{
  door: StageDoorAsset;
  sweepMesh: Mesh;
  finalPanels: readonly StageDoorClosingPanel[];
}>;

export type StageDoorClosingOccupancyResult = Readonly<{
  finalPoseOccupied: boolean;
  sweepOccupied: boolean;
}>;

export type StageDoorRuntimeOptions = Readonly<{
  random: () => number;
  checkClosingOccupancy(
    request: StageDoorClosingOccupancyRequest
  ): StageDoorClosingOccupancyResult;
}>;

export type StageDoorInteractionView = Readonly<{
  origin: Vector3;
  forward: Vector3;
}>;

export type StageDoorInteractionCandidate = Readonly<{
  door: StageDoorAsset;
  angleRadians: number;
  distanceMeters: number;
}>;

export type StageDoorToggleResult =
  | Readonly<{
      status: "started";
      state: "opening" | "closing";
    }>
  | Readonly<{
      status: "busy";
      state: "opening" | "closing";
    }>
  | Readonly<{
      status: "blocked";
      state: "open";
      finalPoseOccupied: boolean;
      sweepOccupied: boolean;
    }>;

export type StageDoorRuntimeUpdate = Readonly<{
  changed: boolean;
  transformsChanged: boolean;
  snapshot: StageDoorRuntimeSnapshot;
  spatialSnapshot: StageDoorSpatialSnapshot;
}>;

export interface StageDoorRuntime {
  readonly revision: number;
  getSnapshot(): StageDoorRuntimeSnapshot;
  getSpatialSnapshot(): StageDoorSpatialSnapshot;
  getDoorState(doorId: string): StageDoorRuntimeDoorSnapshot;
  getDoorInteractionCandidates(
    view: StageDoorInteractionView
  ): readonly StageDoorInteractionCandidate[];
  requestDoorToggle(doorId: string): StageDoorToggleResult;
  update(deltaSeconds: number): StageDoorRuntimeUpdate;
  dispose(): void;
}

type MutableDoorState = {
  readonly door: StageDoorAsset;
  state: DoorState;
  openness: number;
};

const assertFiniteVector = (name: string, value: Vector3): void => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}に非有限値があります`);
  }
};

const freezeClosingRequest = (
  door: StageDoorAsset
): StageDoorClosingOccupancyRequest =>
  Object.freeze({
    door,
    sweepMesh: door.sweepMesh,
    finalPanels: Object.freeze(
      door.panels.map((panel) =>
        Object.freeze({
          panel,
          finalTransform: panel.closedTransform,
          colliders: panel.colliderMeshes
        })
      )
    )
  });

const applyPanelTransform = (
  panel: StageDoorPanelAsset,
  openness: number
): void => {
  const position = Vector3.Lerp(
    panel.closedTransform.position,
    panel.openTransform.position,
    openness
  );
  const scaling = Vector3.Lerp(
    panel.closedTransform.scaling,
    panel.openTransform.scaling,
    openness
  );
  const rotation = Quaternion.Slerp(
    panel.closedTransform.rotation,
    panel.openTransform.rotation,
    openness
  ).normalize();
  panel.node.position.copyFrom(position);
  panel.node.scaling.copyFrom(scaling);
  if (panel.node.rotationQuaternion) {
    panel.node.rotationQuaternion.copyFrom(rotation);
  } else {
    panel.node.rotationQuaternion = rotation;
  }
  panel.node.computeWorldMatrix(true);
  for (const mesh of [...panel.visualMeshes, ...panel.colliderMeshes]) {
    mesh.computeWorldMatrix(true);
  }
};

const applyDoorTransform = (
  door: StageDoorAsset,
  openness: number
): void => {
  for (const panel of door.panels) {
    applyPanelTransform(panel, openness);
  }
};

const isStable = (state: DoorState): boolean =>
  state === "closed" || state === "open";

export const getDoorInteractionCandidates = (
  doors: readonly StageDoorAsset[],
  view: StageDoorInteractionView
): readonly StageDoorInteractionCandidate[] => {
  assertFiniteVector("扉操作視点origin", view.origin);
  assertFiniteVector("扉操作視点forward", view.forward);
  const forwardLengthSquared = view.forward.lengthSquared();
  if (forwardLengthSquared <= OPENNESS_EPSILON) {
    throw new Error("扉操作視点forwardは0以外が必要です");
  }
  const forward = view.forward.scale(1 / Math.sqrt(forwardLengthSquared));
  const candidates: StageDoorInteractionCandidate[] = [];
  for (const door of doors) {
    const position = door.node.getAbsolutePosition();
    const offset = position.subtract(view.origin);
    const distanceWorldUnits = offset.length();
    if (
      distanceWorldUnits >
      STAGE_DOOR_INTERACTION_DISTANCE_WORLD_UNITS
    ) {
      continue;
    }
    const angleRadians =
      distanceWorldUnits <= OPENNESS_EPSILON
        ? 0
        : Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                Vector3.Dot(
                  forward,
                  offset.scale(1 / distanceWorldUnits)
                )
              )
            )
          );
    candidates.push(
      Object.freeze({
        door,
        angleRadians,
        distanceMeters:
          distanceWorldUnits / BLENDER_METERS_TO_WORLD_UNITS
      })
    );
  }
  candidates.sort(
    (left, right) =>
      left.angleRadians - right.angleRadians ||
      left.distanceMeters - right.distanceMeters ||
      (left.door.id < right.door.id
        ? -1
        : left.door.id > right.door.id
          ? 1
          : 0)
  );
  return Object.freeze(candidates);
};

class StageDoorRuntimeImplementation implements StageDoorRuntime {
  private readonly states: readonly MutableDoorState[];
  private readonly byId: ReadonlyMap<string, MutableDoorState>;
  private readonly options: StageDoorRuntimeOptions;
  private currentSnapshot: StageDoorRuntimeSnapshot;
  private currentSpatialSnapshot: StageDoorSpatialSnapshot;
  private disposed = false;

  constructor(
    registry: StageDoorAssetRegistry,
    options: StageDoorRuntimeOptions
  ) {
    this.options = options;
    const runtimeDoors = registry.all.filter(
      (door) =>
        door.doorClass === "room" || door.doorClass === "toilet_stall"
    );
    const states: MutableDoorState[] = [];
    for (const door of runtimeDoors) {
      let openness: number;
      let state: DoorState;
      if (door.doorClass === "toilet_stall") {
        openness = 1;
        state = "open";
      } else {
        const randomValue = options.random();
        if (
          !Number.isFinite(randomValue) ||
          randomValue < 0 ||
          randomValue >= 1
        ) {
          throw new Error(
            `door-initial乱数は0以上1未満が必要です: ${randomValue}`
          );
        }
        const startsClosed =
          randomValue < ROOM_DOOR_INITIAL_CLOSED_PROBABILITY;
        openness = startsClosed ? 0 : 1;
        state = startsClosed ? "closed" : "open";
      }
      applyDoorTransform(door, openness);
      states.push({ door, state, openness });
    }
    this.states = states;
    this.byId = new Map(states.map((state) => [state.door.id, state]));
    this.currentSnapshot = this.createSnapshot(0);
    this.currentSpatialSnapshot = this.createSpatialSnapshot(0, false);
  }

  get revision(): number {
    this.assertAlive();
    return this.currentSnapshot.revision;
  }

  getSnapshot(): StageDoorRuntimeSnapshot {
    this.assertAlive();
    return this.currentSnapshot;
  }

  getSpatialSnapshot(): StageDoorSpatialSnapshot {
    this.assertAlive();
    return this.currentSpatialSnapshot;
  }

  getDoorState(doorId: string): StageDoorRuntimeDoorSnapshot {
    this.assertAlive();
    const state = this.requireState(doorId);
    return Object.freeze({
      id: state.door.id,
      state: state.state,
      openness: state.openness
    });
  }

  getDoorInteractionCandidates(
    view: StageDoorInteractionView
  ): readonly StageDoorInteractionCandidate[] {
    this.assertAlive();
    return getDoorInteractionCandidates(
      this.states.map((state) => state.door),
      view
    );
  }

  requestDoorToggle(doorId: string): StageDoorToggleResult {
    this.assertAlive();
    const runtimeState = this.requireState(doorId);
    if (
      runtimeState.state === "opening" ||
      runtimeState.state === "closing"
    ) {
      return Object.freeze({
        status: "busy",
        state: runtimeState.state
      });
    }
    if (runtimeState.state === "closed") {
      runtimeState.state = "opening";
      this.publish(false);
      return Object.freeze({
        status: "started",
        state: "opening"
      });
    }

    const occupancy = this.options.checkClosingOccupancy(
      freezeClosingRequest(runtimeState.door)
    );
    if (
      typeof occupancy.finalPoseOccupied !== "boolean" ||
      typeof occupancy.sweepOccupied !== "boolean"
    ) {
      throw new Error(
        `扉占有判定はfinalPoseOccupiedとsweepOccupiedをbooleanで返す必要があります: ${doorId}`
      );
    }
    if (occupancy.finalPoseOccupied || occupancy.sweepOccupied) {
      runtimeState.state = "open";
      runtimeState.openness = 1;
      return Object.freeze({
        status: "blocked",
        state: "open",
        finalPoseOccupied: occupancy.finalPoseOccupied,
        sweepOccupied: occupancy.sweepOccupied
      });
    }
    runtimeState.state = "closing";
    this.publish(false);
    return Object.freeze({
      status: "started",
      state: "closing"
    });
  }

  update(deltaSeconds: number): StageDoorRuntimeUpdate {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error("扉RuntimeのdeltaSecondsは0以上の有限値が必要です");
    }
    let changed = false;
    let transformsChanged = false;
    for (const runtimeState of this.states) {
      if (
        runtimeState.state !== "opening" &&
        runtimeState.state !== "closing"
      ) {
        continue;
      }
      const direction = runtimeState.state === "opening" ? 1 : -1;
      const nextOpenness = Math.max(
        0,
        Math.min(
          1,
          runtimeState.openness +
            (direction * deltaSeconds) / STAGE_DOOR_TRAVEL_SECONDS
        )
      );
      if (
        Math.abs(nextOpenness - runtimeState.openness) >
        OPENNESS_EPSILON
      ) {
        runtimeState.openness = nextOpenness;
        applyDoorTransform(runtimeState.door, nextOpenness);
        changed = true;
        transformsChanged = true;
      }
      if (
        runtimeState.state === "opening" &&
        runtimeState.openness >= 1 - OPENNESS_EPSILON
      ) {
        runtimeState.openness = 1;
        runtimeState.state = "open";
        changed = true;
      } else if (
        runtimeState.state === "closing" &&
        runtimeState.openness <= OPENNESS_EPSILON
      ) {
        runtimeState.openness = 0;
        runtimeState.state = "closed";
        changed = true;
      }
    }
    if (changed) {
      this.publish(transformsChanged);
    }
    return Object.freeze({
      changed,
      transformsChanged,
      snapshot: this.currentSnapshot,
      spatialSnapshot: this.currentSpatialSnapshot
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("StageDoorRuntimeは破棄済みです");
    }
  }

  private requireState(doorId: string): MutableDoorState {
    const state = this.byId.get(doorId);
    if (!state) {
      throw new Error(`通常扉Runtimeに未登録のdoor IDです: ${doorId}`);
    }
    return state;
  }

  private publish(transformsChanged: boolean): void {
    const revision = this.currentSnapshot.revision + 1;
    this.currentSnapshot = this.createSnapshot(revision);
    this.currentSpatialSnapshot = this.createSpatialSnapshot(
      revision,
      transformsChanged
    );
  }

  private createSnapshot(revision: number): StageDoorRuntimeSnapshot {
    return Object.freeze({
      revision,
      doors: Object.freeze(
        this.states.map((runtimeState) =>
          Object.freeze({
            id: runtimeState.door.id,
            state: runtimeState.state,
            openness: runtimeState.openness
          })
        )
      )
    });
  }

  private createSpatialSnapshot(
    revision: number,
    transformsChanged: boolean
  ): StageDoorSpatialSnapshot {
    const activePanelColliders = Object.freeze(
      this.states.flatMap((runtimeState) =>
        isStable(runtimeState.state)
          ? runtimeState.door.panels.flatMap(
              (panel) => panel.colliderMeshes
            )
          : []
      )
    );
    const movementColliders: StageMovementColliderSets = Object.freeze({
      player: activePanelColliders,
      npc: activePanelColliders,
      bit: activePanelColliders
    });
    return Object.freeze({
      revision,
      transformsChanged,
      activePanelColliders,
      movementColliders,
      groundColliders: Object.freeze([]),
      beamBlockers: activePanelColliders,
      sightBlockers: activePanelColliders,
      bitObstacles: activePanelColliders
    });
  }
}

export const createStageDoorRuntime = (
  registry: StageDoorAssetRegistry,
  options: StageDoorRuntimeOptions
): StageDoorRuntime =>
  new StageDoorRuntimeImplementation(registry, options);

export const requestDoorToggle = (
  runtime: StageDoorRuntime,
  doorId: string
): StageDoorToggleResult => runtime.requestDoorToggle(doorId);
