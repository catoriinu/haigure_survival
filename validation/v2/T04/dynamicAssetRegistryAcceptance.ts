import {
  Mesh,
  MeshBuilder,
  NullEngine,
  Quaternion,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";

import {
  createStageDynamicAssetRegistries,
  type StageDynamicAssetRegistrySource
} from "../../../src/world/stageDynamicAssets";
import type { StageLinkPair } from "../../../src/world/stageLinks";

export type DynamicAssetRegistryAcceptanceCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type InvalidFixtureVariant =
  | "unknown-hs"
  | "mesh-marker"
  | "invalid-parent"
  | "invalid-reference"
  | "orphan"
  | "multiple-owners"
  | "invalid-slide-transform"
  | "invalid-swing-transform"
  | "invalid-indicator-direction";

type DoorFixtureOptions = Readonly<{
  doorId: string;
  token: string;
  doorClass: "room" | "toilet_stall" | "elevator_landing" | "elevator_car";
  motionKind: "slide" | "swing";
  parent?: TransformNode;
  elevatorId?: string;
  stopId?: string;
  markerAsMesh?: boolean;
  unknownHs?: boolean;
  invalidOpenPoseParent?: TransformNode;
  invalidOpenPosePanelId?: string;
  invalidTransform?: boolean;
}>;

type FixtureCollector = Readonly<{
  scene: Scene;
  markerNodes: TransformNode[];
  volumeMeshes: Mesh[];
  visualMeshes: Mesh[];
  normalColliders: Mesh[];
  humanOnlyColliders: Mesh[];
  links: StageLinkPair[];
}>;

const setExtras = (
  node: TransformNode,
  extras: Readonly<Record<string, unknown>>
): void => {
  node.metadata = {
    gltf: {
      extras: { ...extras }
    }
  };
};

const createMarker = (
  collector: FixtureCollector,
  name: string,
  extras: Readonly<Record<string, unknown>>,
  parent?: TransformNode,
  asMesh = false
): TransformNode => {
  const marker = asMesh
    ? MeshBuilder.CreateBox(name, { size: 0.1 }, collector.scene)
    : new TransformNode(name, collector.scene);
  marker.parent = parent ?? null;
  setExtras(marker, extras);
  collector.markerNodes.push(marker);
  return marker;
};

const createVolume = (
  collector: FixtureCollector,
  name: string,
  extras: Readonly<Record<string, unknown>>,
  parent: TransformNode
): Mesh => {
  const volume = MeshBuilder.CreateBox(
    name,
    { width: 1.2, height: 0.2, depth: 1.2 },
    collector.scene
  );
  volume.parent = parent;
  setExtras(volume, extras);
  collector.volumeMeshes.push(volume);
  return volume;
};

const createDoor = (
  collector: FixtureCollector,
  options: DoorFixtureOptions
): TransformNode => {
  const sweepId = `${options.doorId}-sweep`;
  const panelId = `${options.doorId}-panel`;
  const openPoseId = `${options.doorId}-open-pose`;
  const doorExtras: Record<string, unknown> = {
    hs_id: options.doorId,
    hs_role: "door",
    hs_door_class: options.doorClass,
    hs_sweep_id: sweepId
  };
  if (
    options.doorClass === "elevator_landing" ||
    options.doorClass === "elevator_car"
  ) {
    doorExtras.hs_elevator_id = options.elevatorId;
  }
  if (options.doorClass === "elevator_landing") {
    doorExtras.hs_stop_id = options.stopId;
  }
  if (options.unknownHs === true) {
    doorExtras.hs_unknown = true;
  }

  const door = createMarker(
    collector,
    `MRK_Door_${options.token}`,
    doorExtras,
    options.parent,
    options.markerAsMesh
  );
  const panel = createMarker(
    collector,
    `MRK_DoorPanel_${options.token}`,
    {
      hs_id: panelId,
      hs_role: "door_panel",
      hs_door_id: options.doorId,
      hs_motion_kind: options.motionKind,
      hs_open_pose_id: openPoseId
    },
    door
  );
  const openPose = createMarker(
    collector,
    `MRK_DoorOpenPose_${options.token}`,
    {
      hs_id: openPoseId,
      hs_role: "door_open_pose",
      hs_door_id: options.doorId,
      hs_panel_id: options.invalidOpenPosePanelId ?? panelId
    },
    options.invalidOpenPoseParent ?? door
  );

  if (options.motionKind === "slide") {
    openPose.position.x = 1;
    if (options.invalidTransform === true) {
      openPose.rotationQuaternion = Quaternion.RotationAxis(
        Vector3.Up(),
        Math.PI / 8
      );
    }
  } else {
    openPose.rotationQuaternion = Quaternion.RotationAxis(
      Vector3.Up(),
      Math.PI / 2
    );
    if (options.invalidTransform === true) {
      openPose.position.x = 0.1;
    }
  }

  const visual = MeshBuilder.CreateBox(
    `VIS_DoorPanel_${options.token}`,
    { width: 0.9, height: 2, depth: 0.08 },
    collector.scene
  );
  visual.parent = panel;
  collector.visualMeshes.push(visual);
  if (
    options.doorClass === "room" ||
    options.doorClass === "toilet_stall"
  ) {
    const interactionAnchor = MeshBuilder.CreateBox(
      options.doorClass === "room"
        ? `VIS_DoorPanel_Handle_${options.token}`
        : `VIS_DoorPanel_Knob_${options.token}`,
      { size: 0.08 },
      collector.scene
    );
    interactionAnchor.parent = panel;
    collector.visualMeshes.push(interactionAnchor);
  }

  const collider = MeshBuilder.CreateBox(
    `COL_DoorPanel_${options.token}`,
    { width: 0.9, height: 2, depth: 0.08 },
    collector.scene
  );
  collider.parent = panel;
  collector.normalColliders.push(collider);

  createVolume(
    collector,
    `VOL_DoorSweep_${options.token}`,
    {
      hs_id: sweepId,
      hs_role: "door_sweep",
      hs_door_id: options.doorId
    },
    door
  );
  return door;
};

const createElevatorLink = (
  collector: FixtureCollector,
  stop1Position: Vector3,
  stop4Position: Vector3
): StageLinkPair => {
  const endpointANode = new TransformNode(
    "LNK_ElevatorFixture_A",
    collector.scene
  );
  endpointANode.position.copyFrom(stop1Position);
  const endpointBNode = new TransformNode(
    "LNK_ElevatorFixture_B",
    collector.scene
  );
  endpointBNode.position.copyFrom(stop4Position);
  const link = Object.freeze({
    id: "elevator-link",
    kind: "elevator" as const,
    bidirectional: true,
    radiusMeters: 0.54,
    endpointA: Object.freeze({
      endpoint: "A" as const,
      position: stop1Position.clone(),
      node: endpointANode
    }),
    endpointB: Object.freeze({
      endpoint: "B" as const,
      position: stop4Position.clone(),
      node: endpointBNode
    })
  });
  collector.links.push(link);
  return link;
};

const createElevatorStopComponents = (
  collector: FixtureCollector,
  stop: TransformNode,
  floorIndex: 1 | 4,
  invalidDirection = false
): void => {
  const suffix = String(floorIndex);
  const stopId = `elevator-stop-${suffix}`;
  const callMatId = `elevator-call-mat-${suffix}`;
  const thresholdId = `elevator-threshold-${suffix}`;
  const gateId = `elevator-gate-${suffix}`;
  const waitId = `elevator-wait-${suffix}`;
  const callIndicatorId = `elevator-call-indicator-${suffix}`;

  createVolume(
    collector,
    `VOL_ElevatorCallMat_Floor${suffix}`,
    {
      hs_id: callMatId,
      hs_role: "elevator_call_mat",
      hs_elevator_id: "elevator-main",
      hs_stop_id: stopId
    },
    stop
  );
  createVolume(
    collector,
    `VOL_ElevatorThreshold_Floor${suffix}`,
    {
      hs_id: thresholdId,
      hs_role: "elevator_threshold",
      hs_elevator_id: "elevator-main",
      hs_stop_id: stopId
    },
    stop
  );

  const gate = createMarker(
    collector,
    `MRK_ElevatorHumanGate_Floor${suffix}`,
    {
      hs_id: gateId,
      hs_role: "elevator_human_gate",
      hs_elevator_id: "elevator-main",
      hs_stop_id: stopId
    },
    stop
  );
  const gateCollider = MeshBuilder.CreateBox(
    `COL_HumanOnly_ElevatorGate_Floor${suffix}`,
    { width: 1.2, height: 2, depth: 0.08 },
    collector.scene
  );
  gateCollider.parent = gate;
  collector.humanOnlyColliders.push(gateCollider);

  createMarker(
    collector,
    `MRK_ElevatorWait_Floor${suffix}`,
    {
      hs_id: waitId,
      hs_role: "elevator_wait",
      hs_elevator_id: "elevator-main",
      hs_stop_id: stopId
    },
    stop
  );
  const callIndicator = createMarker(
    collector,
    `MRK_ElevatorCallIndicator_Floor${suffix}`,
    {
      hs_id: callIndicatorId,
      hs_role: "elevator_call_indicator",
      hs_elevator_id: "elevator-main",
      hs_stop_id: stopId,
      hs_direction:
        floorIndex === 1
          ? invalidDirection
            ? "down"
            : "up"
          : "down"
    },
    stop
  );
  const indicatorBase = MeshBuilder.CreateBox(
    `VIS_ElevatorCallIndicator_Base_Floor${suffix}`,
    { width: 1.5, height: 0.02, depth: 1.5 },
    collector.scene
  );
  indicatorBase.parent = callIndicator;
  collector.visualMeshes.push(indicatorBase);
  const indicatorDirection = MeshBuilder.CreateBox(
    `VIS_ElevatorCallIndicator_Direction_Floor${suffix}`,
    { width: 0.9, height: 0.01, depth: 0.9 },
    collector.scene
  );
  indicatorDirection.parent = callIndicator;
  collector.visualMeshes.push(indicatorDirection);
};

const createFixtureSource = (
  scene: Scene,
  variant: InvalidFixtureVariant | null
): StageDynamicAssetRegistrySource => {
  const collector: FixtureCollector = {
    scene,
    markerNodes: [],
    volumeMeshes: [],
    visualMeshes: [],
    normalColliders: [],
    humanOnlyColliders: [],
    links: []
  };

  const invalidParent = new TransformNode(
    "Fixture_InvalidDoorParent",
    scene
  );
  createDoor(collector, {
    doorId: "room-door",
    token: "Room",
    doorClass: "room",
    motionKind: "slide",
    markerAsMesh: variant === "mesh-marker",
    unknownHs: variant === "unknown-hs",
    invalidOpenPoseParent:
      variant === "invalid-parent" ? invalidParent : undefined,
    invalidOpenPosePanelId:
      variant === "invalid-reference" ? "toilet-door-panel" : undefined,
    invalidTransform: variant === "invalid-slide-transform"
  });
  createDoor(collector, {
    doorId: "toilet-door",
    token: "Toilet",
    doorClass: "toilet_stall",
    motionKind: "swing",
    invalidTransform: variant === "invalid-swing-transform"
  });

  const controller = createMarker(
    collector,
    "MRK_Elevator_Main",
    {
      hs_id: "elevator-main",
      hs_role: "elevator",
      hs_link_id: "elevator-link",
      hs_car_id: "elevator-car",
      hs_car_door_id: "elevator-car-door",
      hs_occupancy_id: "elevator-occupancy",
      hs_passenger_origin_id: "elevator-passenger-origin",
      hs_initial_stop_id: "elevator-stop-4"
    }
  );
  const stop1 = createMarker(
    collector,
    "MRK_ElevatorStop_Floor1",
    {
      hs_id: "elevator-stop-1",
      hs_role: "elevator_stop",
      hs_elevator_id: "elevator-main",
      hs_link_id: "elevator-link",
      hs_endpoint: "A",
      hs_floor_index: 1,
      hs_landing_door_id: "elevator-landing-door-1",
      hs_call_mat_id: "elevator-call-mat-1",
      hs_call_indicator_id: "elevator-call-indicator-1",
      hs_threshold_id: "elevator-threshold-1",
      hs_gate_id: "elevator-gate-1",
      hs_wait_id: "elevator-wait-1"
    },
    controller
  );
  const stop4 = createMarker(
    collector,
    "MRK_ElevatorStop_Floor4",
    {
      hs_id: "elevator-stop-4",
      hs_role: "elevator_stop",
      hs_elevator_id: "elevator-main",
      hs_link_id: "elevator-link",
      hs_endpoint: "B",
      hs_floor_index: 4,
      hs_landing_door_id: "elevator-landing-door-4",
      hs_call_mat_id: "elevator-call-mat-4",
      hs_call_indicator_id: "elevator-call-indicator-4",
      hs_threshold_id: "elevator-threshold-4",
      hs_gate_id: "elevator-gate-4",
      hs_wait_id: "elevator-wait-4"
    },
    controller
  );
  stop4.position.y = 6;

  const car = createMarker(
    collector,
    "MRK_ElevatorCar_Main",
    {
      hs_id: "elevator-car",
      hs_role: "elevator_car",
      hs_elevator_id: "elevator-main"
    },
    controller
  );
  car.position.y = 6;
  const carVisual = MeshBuilder.CreateBox(
    "VIS_ElevatorCar_Main",
    { width: 1.8, height: 2.2, depth: 1.8 },
    scene
  );
  carVisual.parent = car;
  collector.visualMeshes.push(carVisual);
  const carCollider = MeshBuilder.CreateBox(
    "COL_ElevatorCar_Main",
    { width: 1.8, height: 2.2, depth: 1.8 },
    scene
  );
  carCollider.parent = car;
  collector.normalColliders.push(carCollider);

  createDoor(collector, {
    doorId: "elevator-car-door",
    token: "ElevatorCar",
    doorClass: "elevator_car",
    motionKind: "slide",
    parent: car,
    elevatorId: "elevator-main"
  });
  createDoor(collector, {
    doorId: "elevator-landing-door-1",
    token: "ElevatorLandingFloor1",
    doorClass: "elevator_landing",
    motionKind: "slide",
    parent: stop1,
    elevatorId: "elevator-main",
    stopId: "elevator-stop-1"
  });
  createDoor(collector, {
    doorId: "elevator-landing-door-4",
    token: "ElevatorLandingFloor4",
    doorClass: "elevator_landing",
    motionKind: "slide",
    parent: stop4,
    elevatorId: "elevator-main",
    stopId: "elevator-stop-4"
  });

  createVolume(
    collector,
    "VOL_ElevatorCarOccupancy_Main",
    {
      hs_id: "elevator-occupancy",
      hs_role: "elevator_car_occupancy",
      hs_elevator_id: "elevator-main"
    },
    car
  );
  createMarker(
    collector,
    "MRK_ElevatorPassengerOrigin_Main",
    {
      hs_id: "elevator-passenger-origin",
      hs_role: "elevator_passenger_origin",
      hs_elevator_id: "elevator-main"
    },
    car
  );

  createElevatorStopComponents(
    collector,
    stop1,
    1,
    variant === "invalid-indicator-direction"
  );
  createElevatorStopComponents(collector, stop4, 4);
  createElevatorLink(
    collector,
    new Vector3(0, 0, 0),
    new Vector3(0, 6, 0)
  );

  if (variant === "orphan") {
    createMarker(
      collector,
      "MRK_ElevatorWait_Orphan",
      {
        hs_id: "elevator-wait-orphan",
        hs_role: "elevator_wait",
        hs_elevator_id: "elevator-main",
        hs_stop_id: "elevator-stop-1"
      },
      stop1
    );
  }
  if (variant === "multiple-owners") {
    createMarker(
      collector,
      "MRK_Elevator_Secondary",
      {
        hs_id: "elevator-secondary",
        hs_role: "elevator",
        hs_link_id: "elevator-link",
        hs_car_id: "elevator-car",
        hs_car_door_id: "elevator-car-door",
        hs_occupancy_id: "elevator-occupancy",
        hs_passenger_origin_id: "elevator-passenger-origin",
        hs_initial_stop_id: "elevator-stop-4"
      }
    );
  }

  return Object.freeze({
    markerNodes: Object.freeze([...collector.markerNodes]),
    volumeMeshes: Object.freeze([...collector.volumeMeshes]),
    visualMeshes: Object.freeze([...collector.visualMeshes]),
    normalColliders: Object.freeze([...collector.normalColliders]),
    humanOnlyColliders: Object.freeze([
      ...collector.humanOnlyColliders
    ]),
    links: Object.freeze([...collector.links])
  });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const captureRejection = (
  engine: NullEngine,
  variant: InvalidFixtureVariant
): string | null => {
  const scene = new Scene(engine);
  try {
    createStageDynamicAssetRegistries(
      createFixtureSource(scene, variant)
    );
    return null;
  } catch (error) {
    return errorMessage(error);
  } finally {
    scene.dispose();
  }
};

export const runDynamicAssetRegistryAcceptance =
  (): readonly DynamicAssetRegistryAcceptanceCheck[] => {
    const engine = new NullEngine();
    const checks: DynamicAssetRegistryAcceptanceCheck[] = [];
    try {
      const validScene = new Scene(engine);
      try {
        const registries = createStageDynamicAssetRegistries(
          createFixtureSource(validScene, null)
        );
        const elevator = registries.elevators.getById("elevator-main");
        const roomDoor = registries.doors.getById("room-door");
        const toiletDoor = registries.doors.getById("toilet-door");
        const firstStop = elevator?.stops[0];
        const fourthStop = elevator?.stops[1];
        checks.push({
          name: "7.9.1/7.9.2の有効な動的資産グラフ",
          ok:
            registries.doors.all.length === 5 &&
            registries.doors.getByClass("room").length === 1 &&
            registries.doors.getByClass("toilet_stall").length === 1 &&
            registries.doors.getByClass("elevator_car").length === 1 &&
            registries.doors.getByClass("elevator_landing").length === 2 &&
            roomDoor?.panels[0]?.motion.kind === "slide" &&
            toiletDoor?.panels[0]?.motion.kind === "swing" &&
            registries.elevators.all.length === 1 &&
            elevator?.link.id === "elevator-link" &&
            elevator.link.kind === "elevator" &&
            elevator.link.bidirectional &&
            elevator.car.id === "elevator-car" &&
            elevator.car.visualMeshes.length === 1 &&
            elevator.car.colliderMeshes.length === 1 &&
            elevator.car.door.id === "elevator-car-door" &&
            elevator.car.occupancy.id === "elevator-occupancy" &&
            elevator.car.passengerOriginId ===
              "elevator-passenger-origin" &&
            elevator.initialStop.id === "elevator-stop-4" &&
            firstStop?.floorIndex === 1 &&
            firstStop.callMat.id === "elevator-call-mat-1" &&
            firstStop.threshold.id === "elevator-threshold-1" &&
            firstStop.humanGate.id === "elevator-gate-1" &&
            firstStop.wait.id === "elevator-wait-1" &&
            firstStop.callIndicator.id ===
              "elevator-call-indicator-1" &&
            firstStop.callIndicator.direction === "up" &&
            firstStop.callIndicator.baseMesh.name ===
              "VIS_ElevatorCallIndicator_Base_Floor1" &&
            fourthStop?.floorIndex === 4 &&
            fourthStop.callMat.id === "elevator-call-mat-4" &&
            fourthStop.threshold.id === "elevator-threshold-4" &&
            fourthStop.humanGate.id === "elevator-gate-4" &&
            fourthStop.wait.id === "elevator-wait-4" &&
            fourthStop.callIndicator.id ===
              "elevator-call-indicator-4" &&
            fourthStop.callIndicator.direction === "down" &&
            fourthStop.callIndicator.directionMesh.name ===
              "VIS_ElevatorCallIndicator_Direction_Floor4",
          detail:
            `doors=${registries.doors.all.length} / ` +
            `elevators=${registries.elevators.all.length} / ` +
            `stops=${elevator?.stops.map((stop) => stop.floorIndex).join(",") ?? "none"}`
        });
      } catch (error) {
        checks.push({
          name: "7.9.1/7.9.2の有効な動的資産グラフ",
          ok: false,
          detail: `予期しない拒否: ${errorMessage(error)}`
        });
      } finally {
        validScene.dispose();
      }

      const rejectionCases = Object.freeze([
        Object.freeze({
          name: "未知hs_*の拒否",
          variant: "unknown-hs" as const,
          expected: "未登録のhs_"
        }),
        Object.freeze({
          name: "Mesh型MRK_*の拒否",
          variant: "mesh-marker" as const,
          expected: "Emptyである必要があります"
        }),
        Object.freeze({
          name: "動的扉の親子関係不正の拒否",
          variant: "invalid-parent" as const,
          expected: "直下の親子関係が必要です"
        }),
        Object.freeze({
          name: "動的扉のID相互参照不正の拒否",
          variant: "invalid-reference" as const,
          expected: "相互参照が一致しません"
        }),
        Object.freeze({
          name: "孤立componentの拒否",
          variant: "orphan" as const,
          expected: "孤立しています"
        }),
        Object.freeze({
          name: "component多重所有の拒否",
          variant: "multiple-owners" as const,
          expected: "複数ownerに共有されています"
        }),
        Object.freeze({
          name: "slide扉Transform不正の拒否",
          variant: "invalid-slide-transform" as const,
          expected: "slide扉の閉・開local rotation"
        }),
        Object.freeze({
          name: "swing扉Transform不正の拒否",
          variant: "invalid-swing-transform" as const,
          expected: "swing扉の閉・開local translation"
        }),
        Object.freeze({
          name: "呼出indicator階方向不正の拒否",
          variant: "invalid-indicator-direction" as const,
          expected: "1階=up、4階=down"
        })
      ]);
      for (const rejectionCase of rejectionCases) {
        const message = captureRejection(
          engine,
          rejectionCase.variant
        );
        checks.push({
          name: rejectionCase.name,
          ok: message?.includes(rejectionCase.expected) === true,
          detail: message ?? "拒否されませんでした"
        });
      }
    } finally {
      engine.dispose();
    }
    return Object.freeze(checks);
  };
