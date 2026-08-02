import {
  Matrix,
  Mesh,
  Quaternion,
  Vector3
} from "@babylonjs/core";

import {
  intersectsCharacterEllipsoidWithMeshAtWorldMatrix,
  type StageCharacterEllipsoid,
  type StageMovementColliderSets
} from "./stageSpatialQueries";
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

export type StageDoorRuntimeOptions = Readonly<{
  random: () => number;
  resolveClosingOccupancy(
    request: StageDoorClosingOccupancyRequest
  ): void;
}>;

export type StageDoorInteractionView = Readonly<{
  origin: Vector3;
  forward: Vector3;
}>;

export type StageDoorInteractionCandidate = Readonly<{
  door: StageDoorAsset;
  interactionPosition: Vector3;
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
  readonly interactionAnchors: readonly MutableDoorInteractionAnchor[];
  state: DoorState;
  openness: number;
};

type MutableDoorInteractionAnchor = {
  readonly panelId: string;
  readonly mesh: Mesh;
  readonly position: Vector3;
};

type DoorInteractionSource = Readonly<{
  door: StageDoorAsset;
  interactionAnchors: readonly MutableDoorInteractionAnchor[];
}>;

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

export const applyStageDoorPanelOpenness = (
  panel: StageDoorPanelAsset,
  openness: number
): void => {
  Vector3.LerpToRef(
    panel.closedTransform.position,
    panel.openTransform.position,
    openness,
    panel.node.position
  );
  Vector3.LerpToRef(
    panel.closedTransform.scaling,
    panel.openTransform.scaling,
    openness,
    panel.node.scaling
  );
  const rotation =
    panel.node.rotationQuaternion ?? Quaternion.Identity();
  Quaternion.SlerpToRef(
    panel.closedTransform.rotation,
    panel.openTransform.rotation,
    openness,
    rotation
  );
  rotation.normalize();
  if (!panel.node.rotationQuaternion) {
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
    applyStageDoorPanelOpenness(panel, openness);
  }
};

export const intersectsStageDoorClosedPose = (
  door: StageDoorAsset,
  ellipsoid: StageCharacterEllipsoid
): boolean =>
  door.panels.some((panel) => {
    const parent = panel.node.parent;
    if (!parent) {
      throw new Error(
        `扉panelに親Nodeがありません: ${door.id}/${panel.id}`
      );
    }
    const currentPanelWorld =
      panel.node.computeWorldMatrix(true);
    const closedPanelWorld = Matrix.Compose(
      panel.closedTransform.scaling,
      panel.closedTransform.rotation,
      panel.closedTransform.position
    ).multiply(parent.computeWorldMatrix(true));
    const inverseCurrentPanelWorld =
      Matrix.Invert(currentPanelWorld);
    return panel.colliderMeshes.some((collider) => {
      const colliderRelativeToPanel =
        collider
          .computeWorldMatrix(true)
          .multiply(inverseCurrentPanelWorld);
      const closedColliderWorld =
        colliderRelativeToPanel.multiply(closedPanelWorld);
      return intersectsCharacterEllipsoidWithMeshAtWorldMatrix(
        collider,
        closedColliderWorld,
        ellipsoid
      );
    });
  });

const isStable = (state: DoorState): boolean =>
  state === "closed" || state === "open";

const createDoorInteractionAnchors = (
  door: StageDoorAsset
): readonly MutableDoorInteractionAnchor[] => {
  const anchors = door.panels.map((panel) => {
    const anchor = panel.interactionAnchorMesh;
    if (!anchor) {
      throw new Error(
        `通常扉の操作Anchorがありません: ${door.id}/${panel.id}`
      );
    }
    return {
      panelId: panel.id,
      mesh: anchor,
      position: Vector3.Zero()
    };
  });
  for (const anchor of anchors) {
    anchor.mesh.computeWorldMatrix(true);
    anchor.position.copyFrom(
      anchor.mesh.getBoundingInfo().boundingBox.centerWorld
    );
  }
  return Object.freeze(anchors);
};

const refreshDoorInteractionAnchors = (
  runtimeState: MutableDoorState
): void => {
  for (const anchor of runtimeState.interactionAnchors) {
    anchor.mesh.computeWorldMatrix(true);
    anchor.position.copyFrom(
      anchor.mesh.getBoundingInfo().boundingBox.centerWorld
    );
  }
};

const getClosestDoorInteractionPosition = (
  anchors: readonly MutableDoorInteractionAnchor[],
  viewOrigin: Vector3
): Vector3 => {
  let closest = anchors[0]!;
  let closestDistanceSquared = Vector3.DistanceSquared(
    closest.position,
    viewOrigin
  );
  for (let index = 1; index < anchors.length; index += 1) {
    const candidate = anchors[index]!;
    const distanceSquared = Vector3.DistanceSquared(
      candidate.position,
      viewOrigin
    );
    if (
      distanceSquared < closestDistanceSquared ||
      (distanceSquared === closestDistanceSquared &&
        candidate.panelId < closest.panelId)
    ) {
      closest = candidate;
      closestDistanceSquared = distanceSquared;
    }
  }
  return closest.position;
};

const collectDoorInteractionCandidates = (
  sources: readonly DoorInteractionSource[],
  view: StageDoorInteractionView
): readonly StageDoorInteractionCandidate[] => {
  assertFiniteVector("扉操作視点origin", view.origin);
  assertFiniteVector("扉操作視点forward", view.forward);
  const forwardLengthSquared = view.forward.lengthSquared();
  if (forwardLengthSquared <= OPENNESS_EPSILON) {
    throw new Error("扉操作視点forwardは0以外が必要です");
  }
  const inverseForwardLength = 1 / Math.sqrt(forwardLengthSquared);
  const forwardX = view.forward.x * inverseForwardLength;
  const forwardY = view.forward.y * inverseForwardLength;
  const forwardZ = view.forward.z * inverseForwardLength;
  const maximumDistanceSquared =
    STAGE_DOOR_INTERACTION_DISTANCE_WORLD_UNITS ** 2;
  const candidates: StageDoorInteractionCandidate[] = [];
  for (const source of sources) {
    const position = getClosestDoorInteractionPosition(
      source.interactionAnchors,
      view.origin
    );
    const offsetX = position.x - view.origin.x;
    const offsetY = position.y - view.origin.y;
    const offsetZ = position.z - view.origin.z;
    const distanceSquared =
      offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
    if (distanceSquared > maximumDistanceSquared) {
      continue;
    }
    const distanceWorldUnits = Math.sqrt(distanceSquared);
    const angleRadians =
      distanceWorldUnits <= OPENNESS_EPSILON
        ? 0
        : Math.acos(
            Math.max(
              -1,
              Math.min(
                1,
                (forwardX * offsetX +
                  forwardY * offsetY +
                  forwardZ * offsetZ) /
                  distanceWorldUnits
              )
            )
          );
    candidates.push(
      Object.freeze({
        door: source.door,
        interactionPosition: position.clone(),
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

export const getDoorInteractionCandidates = (
  doors: readonly StageDoorAsset[],
  view: StageDoorInteractionView
): readonly StageDoorInteractionCandidate[] =>
  collectDoorInteractionCandidates(
    doors.map((door) => ({
      door,
      interactionAnchors: createDoorInteractionAnchors(door)
    })),
    view
  );

class StageDoorRuntimeImplementation implements StageDoorRuntime {
  private readonly states: MutableDoorState[];
  private readonly byId: Map<string, MutableDoorState>;
  private options: StageDoorRuntimeOptions | null;
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
      states.push({
        door,
        interactionAnchors: createDoorInteractionAnchors(door),
        state,
        openness
      });
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
    return collectDoorInteractionCandidates(this.states, view);
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
      this.publishRuntimeSnapshot();
      this.publishSpatialSnapshot(false);
      return Object.freeze({
        status: "started",
        state: "opening"
      });
    }

    runtimeState.state = "closing";
    this.publishRuntimeSnapshot();
    this.publishSpatialSnapshot(false);
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
    let spatialMembershipChanged = false;
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
        refreshDoorInteractionAnchors(runtimeState);
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
        spatialMembershipChanged = true;
      } else if (
        runtimeState.state === "closing" &&
        runtimeState.openness <= OPENNESS_EPSILON
      ) {
        runtimeState.openness = 0;
        this.options!.resolveClosingOccupancy(
          freezeClosingRequest(runtimeState.door)
        );
        runtimeState.state = "closed";
        changed = true;
        spatialMembershipChanged = true;
      }
    }
    if (changed) {
      this.publishRuntimeSnapshot();
    }
    if (spatialMembershipChanged) {
      this.publishSpatialSnapshot(transformsChanged);
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
    const revision = this.currentSnapshot.revision;
    const spatialRevision = this.currentSpatialSnapshot.revision;
    this.states.length = 0;
    this.byId.clear();
    this.options = null;
    this.currentSnapshot = Object.freeze({
      revision,
      doors: Object.freeze([])
    });
    const emptyColliders = Object.freeze([]);
    this.currentSpatialSnapshot = Object.freeze({
      revision: spatialRevision,
      transformsChanged: false,
      activePanelColliders: emptyColliders,
      movementColliders: Object.freeze({
        player: emptyColliders,
        npc: emptyColliders,
        bit: emptyColliders
      }),
      groundColliders: emptyColliders,
      beamBlockers: emptyColliders,
      sightBlockers: emptyColliders,
      bitObstacles: emptyColliders
    });
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

  private publishRuntimeSnapshot(): void {
    const revision = this.currentSnapshot.revision + 1;
    this.currentSnapshot = this.createSnapshot(revision);
  }

  private publishSpatialSnapshot(transformsChanged: boolean): void {
    const revision = this.currentSpatialSnapshot.revision + 1;
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
