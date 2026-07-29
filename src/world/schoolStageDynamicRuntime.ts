import { Matrix, Mesh, Vector3 } from "@babylonjs/core";

import {
  type DynamicStageSpatialActiveSet,
  type DynamicStageSpatialSnapshot,
  type DynamicStageSpatialVariants
} from "./dynamicStageSpatialVariants";
import {
  applyStageDoorPanelOpenness,
  createStageDoorRuntime,
  intersectsStageDoorClosedPose,
  type StageDoorRuntime,
  type StageDoorRuntimeSnapshot,
  type StageDoorSpatialSnapshot
} from "./stageDoorRuntime";
import {
  createStageElevatorRuntime,
  ELEVATOR_CAPACITY,
  type ElevatorDoorMotion,
  type StageElevatorActorAdapter,
  type StageElevatorRuntime,
  type StageElevatorRuntimeInput,
  type StageElevatorSnapshot,
  type StageElevatorSpatialSnapshot
} from "./stageElevatorRuntime";
import {
  type StageDoorAssetRegistry,
  type StageDoorPanelAsset,
  type StageElevatorAsset,
  type StageElevatorAssetRegistry
} from "./stageDynamicAssets";
import {
  type StageCharacterEllipsoid,
  type StageSpatialQueries
} from "./stageSpatialQueries";
import { createSchoolRuntimeRandom } from "./schoolRuntimeSettings";

const ELEVATOR_BOARDING_SLOT_OFFSETS = Object.freeze([
  new Vector3(-0.65, 0, -0.45),
  new Vector3(0, 0, -0.45),
  new Vector3(0.65, 0, -0.45),
  new Vector3(-0.65, 0, 0.45),
  new Vector3(0, 0, 0.45),
  new Vector3(0.65, 0, 0.45)
]);

if (
  ELEVATOR_BOARDING_SLOT_OFFSETS.length !== ELEVATOR_CAPACITY
) {
  throw new Error(
    "エレベーター乗車slot数は定員と一致する必要があります。"
  );
}

export interface SchoolStageActorPort extends StageElevatorActorAdapter {
  getActorEllipsoids(): readonly StageCharacterEllipsoid[];
}

export type SchoolStageDynamicAssetInput = Readonly<{
  staticActiveSet: DynamicStageSpatialActiveSet;
  doorAssets: StageDoorAssetRegistry;
  elevatorAssets: StageElevatorAssetRegistry;
}>;

export type SchoolStageInitialActiveSetInput =
  SchoolStageDynamicAssetInput &
    Readonly<{
      doorInitialRandom: () => number;
    }>;

export type SchoolStageDynamicRuntimeInput =
  SchoolStageDynamicAssetInput &
    Readonly<{
      dynamicVariants: DynamicStageSpatialVariants;
      queries: StageSpatialQueries;
      actors: SchoolStageActorPort;
    }>;

export type SchoolStageDynamicRuntimeSnapshot = Readonly<{
  revision: number;
  spatialSnapshot: DynamicStageSpatialSnapshot;
  doors: StageDoorRuntimeSnapshot;
  elevators: readonly StageElevatorSnapshot[];
}>;

export interface SchoolStageDynamicRuntime {
  readonly revision: number;
  readonly doors: StageDoorRuntime;
  readonly elevators: readonly StageElevatorRuntime[];
  getElevator(elevatorId: string): StageElevatorRuntime;
  releaseHumanTraversalForScriptedPhase(): void;
  getSnapshot(): SchoolStageDynamicRuntimeSnapshot;
  update(deltaSeconds: number): SchoolStageDynamicRuntimeSnapshot;
  dispose(): void;
}

const initializationSeedByStaticActiveSet = new WeakMap<
  DynamicStageSpatialActiveSet,
  number
>();

const freezeMeshes = (meshes: Iterable<Mesh>): readonly Mesh[] =>
  Object.freeze([...new Set(meshes)]);

const combineMeshLists = (
  base: readonly Mesh[],
  additions: readonly (readonly Mesh[])[]
): readonly Mesh[] =>
  freezeMeshes([
    ...base,
    ...additions.flatMap((meshes) => meshes)
  ]);

const composeActiveSet = (
  staticActiveSet: DynamicStageSpatialActiveSet,
  doorSpatial: StageDoorSpatialSnapshot,
  elevatorSpatial: readonly StageElevatorSpatialSnapshot[]
): DynamicStageSpatialActiveSet =>
  Object.freeze({
    movementColliders: Object.freeze({
      player: combineMeshLists(
        staticActiveSet.movementColliders.player,
        [
          doorSpatial.movementColliders.player,
          ...elevatorSpatial.map(
            (snapshot) => snapshot.movementColliders.player
          )
        ]
      ),
      npc: combineMeshLists(
        staticActiveSet.movementColliders.npc,
        [
          doorSpatial.movementColliders.npc,
          ...elevatorSpatial.map(
            (snapshot) => snapshot.movementColliders.npc
          )
        ]
      ),
      bit: combineMeshLists(
        staticActiveSet.movementColliders.bit,
        [
          doorSpatial.movementColliders.bit,
          ...elevatorSpatial.map(
            (snapshot) => snapshot.movementColliders.bit
          )
        ]
      )
    }),
    groundColliders: combineMeshLists(
      staticActiveSet.groundColliders,
      [
        doorSpatial.groundColliders,
        ...elevatorSpatial.map(
          (snapshot) => snapshot.groundColliders
        )
      ]
    ),
    beamBlockers: combineMeshLists(
      staticActiveSet.beamBlockers,
      [
        doorSpatial.beamBlockers,
        ...elevatorSpatial.map(
          (snapshot) => snapshot.beamBlockers
        )
      ]
    ),
    sightBlockers: combineMeshLists(
      staticActiveSet.sightBlockers,
      [
        doorSpatial.sightBlockers,
        ...elevatorSpatial.map(
          (snapshot) => snapshot.sightBlockers
        )
      ]
    ),
    bitObstacles: combineMeshLists(
      staticActiveSet.bitObstacles,
      [
        doorSpatial.bitObstacles,
        ...elevatorSpatial.map(
          (snapshot) => snapshot.bitObstacles
        )
      ]
    )
  });

const collectDynamicColliderMeshes = (
  doors: StageDoorAssetRegistry,
  elevators: StageElevatorAssetRegistry
) => {
  const doorPanelColliders = new Set(
    doors.all.flatMap((door) =>
      door.panels.flatMap((panel) => panel.colliderMeshes)
    )
  );
  const humanGateColliders = new Set(
    elevators.all.flatMap((elevator) =>
      elevator.stops.map((stop) => stop.humanGate.collider)
    )
  );
  return Object.freeze({
    doorPanelColliders,
    humanGateColliders
  });
};

export const createSchoolStageStaticActiveSet = (
  activeSet: DynamicStageSpatialActiveSet,
  doors: StageDoorAssetRegistry,
  elevators: StageElevatorAssetRegistry
): DynamicStageSpatialActiveSet => {
  const { doorPanelColliders, humanGateColliders } =
    collectDynamicColliderMeshes(doors, elevators);
  const excludesDynamicMesh = (mesh: Mesh) =>
    !doorPanelColliders.has(mesh) && !humanGateColliders.has(mesh);
  return Object.freeze({
    movementColliders: Object.freeze({
      player: Object.freeze(
        activeSet.movementColliders.player.filter(excludesDynamicMesh)
      ),
      npc: Object.freeze(
        activeSet.movementColliders.npc.filter(excludesDynamicMesh)
      ),
      bit: Object.freeze(
        activeSet.movementColliders.bit.filter(excludesDynamicMesh)
      )
    }),
    groundColliders: Object.freeze(
      activeSet.groundColliders.filter(excludesDynamicMesh)
    ),
    beamBlockers: Object.freeze(
      activeSet.beamBlockers.filter(excludesDynamicMesh)
    ),
    sightBlockers: Object.freeze(
      activeSet.sightBlockers.filter(excludesDynamicMesh)
    ),
    bitObstacles: Object.freeze(
      activeSet.bitObstacles.filter(excludesDynamicMesh)
    )
  });
};

const updateCarWorldMatrices = (elevator: StageElevatorAsset) => {
  elevator.car.node.computeWorldMatrix(true);
  for (const mesh of [
    ...elevator.car.visualMeshes,
    ...elevator.car.colliderMeshes,
    elevator.car.occupancy.mesh,
    ...elevator.car.door.panels.flatMap((panel) => [
      ...panel.visualMeshes,
      ...panel.colliderMeshes
    ])
  ]) {
    mesh.computeWorldMatrix(true);
  }
};

const createPanelAdapter = (panel: StageDoorPanelAsset) =>
  Object.freeze({
    id: panel.id,
    blockerMeshes: panel.colliderMeshes,
    setOpenness: (openness: number) =>
      applyStageDoorPanelOpenness(panel, openness)
  });

const createElevatorRuntimeInput = (
  elevator: StageElevatorAsset,
  actors: StageElevatorActorAdapter,
  isDoorMotionBlocked: (
    elevator: StageElevatorAsset,
    stopId: string,
    motion: ElevatorDoorMotion
  ) => boolean
): StageElevatorRuntimeInput => ({
  id: elevator.id,
  stops: elevator.stops.map((stop) =>
    Object.freeze({
      id: stop.id,
      floorIndex: stop.floorIndex,
      carPosition: stop.node.getAbsolutePosition().clone(),
      landingDoorPanels: Object.freeze(
        stop.landingDoor.panels.map(createPanelAdapter)
      ),
      humanGateCollider: stop.humanGate.collider,
      setHumanGateEnabled: (enabled: boolean) => {
        stop.humanGate.collider.checkCollisions = enabled;
      }
    })
  ),
  carDoorPanels: Object.freeze(
    elevator.car.door.panels.map(createPanelAdapter)
  ),
  car: {
    getWorldPosition: () =>
      elevator.car.node.getAbsolutePosition().clone(),
    setWorldPosition: (position) => {
      elevator.car.node.setAbsolutePosition(position);
      updateCarWorldMatrices(elevator);
    },
    getBoardingWorldPosition: (slotIndex) => {
      if (
        !Number.isInteger(slotIndex) ||
        slotIndex < 0 ||
        slotIndex >= ELEVATOR_CAPACITY
      ) {
        throw new Error(
          `エレベーター乗車slot indexが不正です: ${slotIndex}`
        );
      }
      const carWorld =
        elevator.car.node.computeWorldMatrix(true);
      elevator.car.passengerOriginNode.computeWorldMatrix(true);
      return elevator.car.passengerOriginNode
        .getAbsolutePosition()
        .add(
          Vector3.TransformNormal(
            ELEVATOR_BOARDING_SLOT_OFFSETS[slotIndex],
            carWorld
          )
        );
    },
    worldToCarLocal: (position) => {
      const inverse = Matrix.Invert(
        elevator.car.node.computeWorldMatrix(true)
      );
      return Vector3.TransformCoordinates(position, inverse);
    },
    carLocalToWorld: (position) =>
      Vector3.TransformCoordinates(
        position,
        elevator.car.node.computeWorldMatrix(true)
      )
  },
  actors,
  occupancy: {
    isDoorMotionBlocked: (stopId, motion) =>
      isDoorMotionBlocked(elevator, stopId, motion)
  }
});

const createInitialElevatorRuntimes = (
  elevators: StageElevatorAssetRegistry
) => {
  const actors: StageElevatorActorAdapter = {
    getActorPosition: (actorId) => {
      throw new Error(
        `初期エレベーター空間にActor位置はありません: ${actorId}`
      );
    },
    setActorPosition: (actorId) => {
      throw new Error(
        `初期エレベーター空間でActorを搬送できません: ${actorId}`
      );
    }
  };
  return elevators.all.map((elevator) =>
    createStageElevatorRuntime(
      createElevatorRuntimeInput(
        elevator,
        actors,
        () => false
      )
    )
  );
};

export const createSchoolStageInitialActiveSet = (
  input: SchoolStageInitialActiveSetInput
): DynamicStageSpatialActiveSet => {
  const doors = createStageDoorRuntime(input.doorAssets, {
    random: input.doorInitialRandom,
    checkClosingOccupancy: () =>
      Object.freeze({
        finalPoseOccupied: false,
        sweepOccupied: false
      })
  });
  const elevators = createInitialElevatorRuntimes(input.elevatorAssets);
  const initialActiveSet = composeActiveSet(
    input.staticActiveSet,
    doors.getSpatialSnapshot(),
    elevators.map((elevator) => elevator.getSpatialSnapshot())
  );
  doors.dispose();
  for (const elevator of elevators) {
    elevator.dispose();
  }
  return initialActiveSet;
};

export const createSchoolStageDynamicSpatialInitializer = (
  seed: number
) =>
  (input: Readonly<{
    activeSet: DynamicStageSpatialActiveSet;
    doorAssets: StageDoorAssetRegistry;
    elevatorAssets: StageElevatorAssetRegistry;
  }>) => {
    const staticActiveSet = createSchoolStageStaticActiveSet(
      input.activeSet,
      input.doorAssets,
      input.elevatorAssets
    );
    initializationSeedByStaticActiveSet.set(
      staticActiveSet,
      seed
    );
    return Object.freeze({
      staticActiveSet,
      initialActiveSet: createSchoolStageInitialActiveSet({
        staticActiveSet,
        doorAssets: input.doorAssets,
        elevatorAssets: input.elevatorAssets,
        doorInitialRandom: createSchoolRuntimeRandom(
          seed,
          "door-initial"
        )
      })
    });
  };

const haveSameMeshes = (
  left: readonly Mesh[],
  right: readonly Mesh[]
) =>
  left.length === right.length &&
  left.every((mesh) => right.includes(mesh));

const assertInitialActiveSetMatches = (
  expected: DynamicStageSpatialActiveSet,
  actual: DynamicStageSpatialSnapshot
) => {
  const matches =
    haveSameMeshes(
      expected.movementColliders.player,
      actual.movementColliders.player
    ) &&
    haveSameMeshes(
      expected.movementColliders.npc,
      actual.movementColliders.npc
    ) &&
    haveSameMeshes(
      expected.movementColliders.bit,
      actual.movementColliders.bit
    ) &&
    haveSameMeshes(expected.groundColliders, actual.groundColliders) &&
    haveSameMeshes(expected.beamBlockers, actual.beamBlockers) &&
    haveSameMeshes(expected.sightBlockers, actual.sightBlockers) &&
    haveSameMeshes(expected.bitObstacles, actual.bitObstacles);
  if (!matches) {
    throw new Error(
      "学校動的Runtimeの初期active setがStage revision 0と一致しません。"
    );
  }
};

class SchoolStageDynamicRuntimeImplementation
  implements SchoolStageDynamicRuntime
{
  readonly doors: StageDoorRuntime;
  readonly elevators: readonly StageElevatorRuntime[];

  private readonly staticActiveSet: DynamicStageSpatialActiveSet;
  private readonly dynamicVariants: DynamicStageSpatialVariants;
  private readonly elevatorById: ReadonlyMap<
    string,
    StageElevatorRuntime
  >;
  private lastDoorSpatialRevision: number;
  private lastElevatorSpatialRevisions: readonly number[];
  private disposed = false;

  constructor(input: SchoolStageDynamicRuntimeInput) {
    this.staticActiveSet = input.staticActiveSet;
    this.dynamicVariants = input.dynamicVariants;
    const initializationSeed =
      initializationSeedByStaticActiveSet.get(
        input.staticActiveSet
      );
    if (initializationSeed === undefined) {
      throw new Error(
        "SchoolStageDynamicRuntimeにはcreateSchoolStageDynamicSpatialInitializer()が生成したstaticActiveSetが必要です。"
      );
    }
    this.doors = createStageDoorRuntime(input.doorAssets, {
      random: createSchoolRuntimeRandom(
        initializationSeed,
        "door-initial"
      ),
      checkClosingOccupancy: (request) => {
        const actorEllipsoids =
          input.actors.getActorEllipsoids();
        const finalPoseOccupied = actorEllipsoids.some(
          (ellipsoid) =>
            intersectsStageDoorClosedPose(
              request.door,
              ellipsoid
            )
        );
        const sweepOccupied = actorEllipsoids.some(
          (ellipsoid) =>
            input.queries.intersectsVolumeById(
              request.door.sweepId,
              ellipsoid
            )
        );
        return Object.freeze({
          finalPoseOccupied,
          sweepOccupied
        });
      }
    });
    this.elevators = Object.freeze(
      input.elevatorAssets.all.map((asset) =>
        createStageElevatorRuntime(
          createElevatorRuntimeInput(
            asset,
            input.actors,
            (elevator, stopId) => {
              const stop = elevator.stops.find(
                (candidate) => candidate.id === stopId
              );
              if (!stop) {
                throw new Error(
                  `エレベーター停止階がありません: ${elevator.id}/${stopId}`
                );
              }
              const volumeIds = [
                stop.callMat.id,
                stop.threshold.id,
                stop.landingDoor.sweepId,
                elevator.car.door.sweepId
              ];
              return input.actors
                .getActorEllipsoids()
                .some((ellipsoid) =>
                  volumeIds.some((volumeId) =>
                    input.queries.intersectsVolumeById(
                      volumeId,
                      ellipsoid
                    )
                  )
                );
            }
          )
        )
      )
    );
    this.elevatorById = new Map(
      input.elevatorAssets.all.map((asset, index) => [
        asset.id,
        this.elevators[index]!
      ])
    );
    this.lastDoorSpatialRevision =
      this.doors.getSpatialSnapshot().revision;
    this.lastElevatorSpatialRevisions = Object.freeze(
      this.elevators.map(
        (elevator) => elevator.getSpatialSnapshot().revision
      )
    );
    const initial = composeActiveSet(
      this.staticActiveSet,
      this.doors.getSpatialSnapshot(),
      this.elevators.map((elevator) =>
        elevator.getSpatialSnapshot()
      )
    );
    assertInitialActiveSetMatches(
      initial,
      input.dynamicVariants.getSnapshot()
    );
  }

  get revision() {
    this.assertActive();
    return this.dynamicVariants.revision;
  }

  getElevator(elevatorId: string) {
    this.assertActive();
    const elevator = this.elevatorById.get(elevatorId);
    if (!elevator) {
      throw new Error(
        `学校動的Runtimeに未登録のエレベーターです: ${elevatorId}`
      );
    }
    return elevator;
  }

  releaseHumanTraversalForScriptedPhase() {
    this.assertActive();
    for (const elevator of this.elevators) {
      elevator.releaseHumanTraversalForScriptedPhase();
    }
  }

  getSnapshot() {
    this.assertActive();
    return Object.freeze({
      revision: this.dynamicVariants.revision,
      spatialSnapshot: this.dynamicVariants.getSnapshot(),
      doors: this.doors.getSnapshot(),
      elevators: Object.freeze(
        this.elevators.map((elevator) => elevator.getSnapshot())
      )
    });
  }

  update(deltaSeconds: number) {
    this.assertActive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "学校動的RuntimeのdeltaSecondsは0以上の有限値が必要です。"
      );
    }
    this.doors.update(deltaSeconds);
    for (const elevator of this.elevators) {
      elevator.update(deltaSeconds);
    }
    const doorSpatial = this.doors.getSpatialSnapshot();
    const elevatorSpatial = this.elevators.map((elevator) =>
      elevator.getSpatialSnapshot()
    );
    const spatialChanged =
      doorSpatial.revision !== this.lastDoorSpatialRevision ||
      elevatorSpatial.some(
        (snapshot, index) =>
          snapshot.revision !==
          this.lastElevatorSpatialRevisions[index]
      );
    if (spatialChanged) {
      this.dynamicVariants.replaceActiveSet(
        composeActiveSet(
          this.staticActiveSet,
          doorSpatial,
          elevatorSpatial
        )
      );
      this.lastDoorSpatialRevision = doorSpatial.revision;
      this.lastElevatorSpatialRevisions = Object.freeze(
        elevatorSpatial.map((snapshot) => snapshot.revision)
      );
    }
    return this.getSnapshot();
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.doors.dispose();
    for (const elevator of this.elevators) {
      elevator.dispose();
    }
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("SchoolStageDynamicRuntimeは破棄済みです。");
    }
  }
}

export const createSchoolStageDynamicRuntime = (
  input: SchoolStageDynamicRuntimeInput
): SchoolStageDynamicRuntime =>
  new SchoolStageDynamicRuntimeImplementation(input);
