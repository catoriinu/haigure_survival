import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  NullEngine,
  PBRMaterial,
  Quaternion,
  Scene,
  TransformNode,
  Vector3
} from "@babylonjs/core";

import {
  createDynamicStageSpatialVariants,
  type DynamicStageSpatialVariants
} from "../../../src/world/dynamicStageSpatialVariants";
import {
  createStageDoorRuntime,
  type StageDoorRuntimeOptions
} from "../../../src/world/stageDoorRuntime";
import type {
  StageDoorAsset,
  StageDoorAssetRegistry,
  StageDoorClass,
  StageDoorPanelAsset,
  StageNodeLocalTransform
} from "../../../src/world/stageDynamicAssets";
import { createStageDynamicAssetRegistries } from "../../../src/world/stageDynamicAssets";
import {
  createStageElevatorRuntime,
  type ElevatorPassengerReservation
} from "../../../src/world/stageElevatorRuntime";
import { createStageElevatorCallIndicatorAdapter } from "../../../src/world/stageElevatorCallIndicator";
import {
  createSchoolRuntimeSettings,
  selectDisorderedRoomIds
} from "../../../src/world/schoolRuntimeSettings";
import {
  createStageSpatialQueries,
  type StageSpatialQueries
} from "../../../src/world/stageSpatialQueries";

export type DynamicInteractionAcceptanceCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const localTransform = (position: Vector3): StageNodeLocalTransform =>
  Object.freeze({
    position,
    rotation: Quaternion.Identity(),
    scaling: Vector3.One()
  });

const setExtras = (
  node: TransformNode,
  extras: Readonly<Record<string, unknown>>
) => {
  node.metadata = { gltf: { extras: { ...extras } } };
};

const createDoorRegistryAssetFixture = (scene: Scene) => {
  const door = new TransformNode("MRK_Door_RegistryFixture", scene);
  setExtras(door, {
    hs_id: "registry-door",
    hs_role: "door",
    hs_door_class: "room",
    hs_sweep_id: "registry-door-sweep"
  });
  const panel = new TransformNode(
    "MRK_DoorPanel_RegistryFixture",
    scene
  );
  panel.parent = door;
  setExtras(panel, {
    hs_id: "registry-door-panel",
    hs_role: "door_panel",
    hs_door_id: "registry-door",
    hs_motion_kind: "slide",
    hs_open_pose_id: "registry-door-open"
  });
  const openPose = new TransformNode(
    "MRK_DoorOpenPose_RegistryFixture",
    scene
  );
  openPose.parent = door;
  openPose.position.x = 0.2;
  setExtras(openPose, {
    hs_id: "registry-door-open",
    hs_role: "door_open_pose",
    hs_door_id: "registry-door",
    hs_panel_id: "registry-door-panel"
  });
  const visual = MeshBuilder.CreateBox(
    "VIS_DoorPanel_RegistryFixture",
    { size: 0.05 },
    scene
  );
  visual.parent = panel;
  const collider = MeshBuilder.CreateBox(
    "COL_DoorPanel_RegistryFixture",
    { size: 0.05 },
    scene
  );
  collider.parent = panel;
  const sweep = MeshBuilder.CreateBox(
    "VOL_DoorSweep_RegistryFixture",
    { width: 0.25, height: 0.2, depth: 0.1 },
    scene
  );
  sweep.parent = door;
  setExtras(sweep, {
    hs_id: "registry-door-sweep",
    hs_role: "door_sweep",
    hs_door_id: "registry-door"
  });
  return { door, panel, openPose, visual, collider, sweep };
};

const captureMessage = (action: () => void) => {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const createDoorAsset = (
  scene: Scene,
  id: string,
  doorClass: StageDoorClass,
  position: Vector3
): StageDoorAsset => {
  const doorNode = new TransformNode(`MRK_Door_${id}`, scene);
  doorNode.position.copyFrom(position);
  const panelNode = new TransformNode(`MRK_DoorPanel_${id}`, scene);
  panelNode.parent = doorNode;
  const openPoseNode = new TransformNode(`MRK_DoorOpenPose_${id}`, scene);
  openPoseNode.parent = doorNode;
  const isSwing = doorClass === "toilet_stall";
  const openRotation = isSwing
    ? Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2)
    : Quaternion.Identity();
  if (isSwing) {
    openPoseNode.rotationQuaternion = openRotation.clone();
  } else {
    openPoseNode.position.x = 0.2;
  }
  const collider = MeshBuilder.CreateBox(
    `COL_DoorPanel_${id}`,
    { size: 0.05 },
    scene
  );
  collider.parent = panelNode;
  const interactionAnchor = MeshBuilder.CreateBox(
    doorClass === "toilet_stall"
      ? `VIS_DoorPanel_Knob_${id}`
      : `VIS_DoorPanel_Handle_${id}`,
    { size: 0.02 },
    scene
  );
  interactionAnchor.parent = panelNode;
  const sweep = MeshBuilder.CreateBox(
    `VOL_DoorSweep_${id}`,
    { width: 0.25, height: 0.2, depth: 0.1 },
    scene
  );
  sweep.parent = doorNode;
  doorNode.computeWorldMatrix(true);
  const panel: StageDoorPanelAsset = Object.freeze({
    id: `${id}-panel`,
    doorId: id,
    node: panelNode,
    openPoseNode,
    visualMeshes: Object.freeze([interactionAnchor]),
    interactionAnchorMesh: interactionAnchor,
    colliderMeshes: Object.freeze([collider]),
    closedTransform: localTransform(Vector3.Zero()),
    openTransform: Object.freeze({
      position: isSwing ? Vector3.Zero() : new Vector3(0.2, 0, 0),
      rotation: openRotation,
      scaling: Vector3.One()
    }),
    motion: isSwing
      ? Object.freeze({
          kind: "swing" as const,
          axis: new Vector3(0, 0, 1),
          angleRadians: Math.PI / 2
        })
      : Object.freeze({
          kind: "slide" as const,
          axis: Vector3.Right(),
          distance: 0.2
        })
  });
  return Object.freeze({
    id,
    doorClass,
    node: doorNode,
    panels: Object.freeze([panel]),
    sweepId: `${id}-sweep`,
    sweepMesh: sweep,
    elevatorId: null,
    stopId: null
  });
};

const createDoorRegistry = (
  doors: readonly StageDoorAsset[]
): StageDoorAssetRegistry => ({
  all: Object.freeze([...doors]),
  getById: (id) => doors.find((door) => door.id === id) ?? null,
  getByClass: (doorClass) =>
    Object.freeze(
      doors.filter((door) => door.doorClass === doorClass)
    )
});

const createReservation = (
  actorId: string,
  requestedAtSeconds: number
): ElevatorPassengerReservation =>
  Object.freeze({
    actorId,
    fromStopId: "stop-4",
    destinationStopId: "stop-1",
    requestedAtSeconds
  });

const createElevatorPanelFixture = (
  scene: Scene,
  id: string,
  parent: TransformNode | null,
  opennessById: Map<string, number>,
  updateCountById: Map<string, number>
) => {
  const mesh = MeshBuilder.CreateBox(
    `COL_ElevatorPanel_${id}`,
    { size: 0.05 },
    scene
  );
  mesh.parent = parent;
  return Object.freeze({
    mesh,
    adapter: Object.freeze({
      id,
      blockerMeshes: Object.freeze([mesh]),
      setOpenness: (openness: number) => {
        opennessById.set(id, openness);
        updateCountById.set(
          id,
          (updateCountById.get(id) ?? 0) + 1
        );
        mesh.position.x = openness * 0.1;
        mesh.computeWorldMatrix(true);
      }
    })
  });
};

export const runDynamicInteractionAcceptance =
  (): readonly DynamicInteractionAcceptanceCheck[] => {
    const checks: DynamicInteractionAcceptanceCheck[] = [];
    const engine = new NullEngine();
    const scene = new Scene(engine);
    let doorVariants: DynamicStageSpatialVariants | null = null;
    let doorQueries: StageSpatialQueries | null = null;
    let elevatorVariants: DynamicStageSpatialVariants | null = null;
    let elevatorQueries: StageSpatialQueries | null = null;
    try {
      const registryFixture = createDoorRegistryAssetFixture(scene);
      const registrySource = {
        markerNodes: [
          registryFixture.door,
          registryFixture.panel,
          registryFixture.openPose
        ],
        volumeMeshes: [registryFixture.sweep],
        visualMeshes: [registryFixture.visual],
        normalColliders: [registryFixture.collider],
        humanOnlyColliders: [],
        links: []
      };
      const registries = createStageDynamicAssetRegistries(registrySource);
      const openSweep = MeshBuilder.CreatePlane(
        "VOL_DoorSweep_OpenFixture",
        { size: 0.25 },
        scene
      );
      openSweep.parent = registryFixture.door;
      setExtras(openSweep, {
        hs_id: "registry-door-sweep",
        hs_role: "door_sweep",
        hs_door_id: "registry-door"
      });
      const openVolumeMessage = captureMessage(() =>
        createStageDynamicAssetRegistries({
          ...registrySource,
          volumeMeshes: [openSweep]
        })
      );
      const originalPanelName = registryFixture.panel.name;
      registryFixture.panel.name = "MRK_DoorPanel_";
      const invalidTokenMessage = captureMessage(() =>
        createStageDynamicAssetRegistries(registrySource)
      );
      registryFixture.panel.name = originalPanelName;
      setExtras(registryFixture.door, {
        hs_id: "registry-door",
        hs_role: "door",
        hs_door_class: "room",
        hs_sweep_id: "registry-door-sweep",
        hs_unknown: true
      });
      const unknownPropertyMessage = captureMessage(() =>
        createStageDynamicAssetRegistries(registrySource)
      );
      checks.push({
        name: "動的扉asset registryの厳格分類",
        ok:
          registries.doors.all.length === 1 &&
          registries.elevators.all.length === 0 &&
          unknownPropertyMessage?.includes("未登録") === true,
        detail: `doors=${registries.doors.all.length} / elevators=${registries.elevators.all.length} / invalid=${unknownPropertyMessage ?? "none"}`
      });
      checks.push({
        name: "動的資産の閉VolumeとASCII token検証",
        ok:
          openVolumeMessage?.includes("manifold") === true &&
          invalidTokenMessage?.includes("非空ASCII") === true,
        detail: `volume=${openVolumeMessage ?? "none"} / token=${invalidTokenMessage ?? "none"}`
      });
      const isolatedLinkNodeA = new TransformNode(
        "LNK_IsolatedElevator_A",
        scene
      );
      const isolatedLinkNodeB = new TransformNode(
        "LNK_IsolatedElevator_B",
        scene
      );
      const isolatedElevatorLinkMessage = captureMessage(() =>
        createStageDynamicAssetRegistries({
          markerNodes: [],
          volumeMeshes: [],
          visualMeshes: [],
          normalColliders: [],
          humanOnlyColliders: [],
          links: [
            Object.freeze({
              id: "isolated-elevator-link",
              kind: "elevator" as const,
              bidirectional: true,
              radiusMeters: 0.54,
              endpointA: Object.freeze({
                endpoint: "A" as const,
                position: Vector3.Zero(),
                node: isolatedLinkNodeA
              }),
              endpointB: Object.freeze({
                endpoint: "B" as const,
                position: Vector3.Up(),
                node: isolatedLinkNodeB
              })
            })
          ]
        })
      );
      checks.push({
        name: "孤立elevator linkの拒否",
        ok: isolatedElevatorLinkMessage?.includes("孤立") === true,
        detail: isolatedElevatorLinkMessage ?? "none"
      });

      const doors = [
        createDoorAsset(
          scene,
          "room-front",
          "room",
          new Vector3(0, 0, 0.1)
        ),
        createDoorAsset(
          scene,
          "room-side",
          "room",
          new Vector3(0, 0, 0.1)
        ),
        createDoorAsset(
          scene,
          "toilet",
          "toilet_stall",
          new Vector3(-0.05, 0, 0.1)
        ),
        createDoorAsset(
          scene,
          "toilet-far",
          "toilet_stall",
          new Vector3(0, 0, 0.3)
        )
      ] as const;
      const randomValues = [0.1, 0.9];
      let finalPoseOccupied = false;
      let sweepOccupied = false;
      const options: StageDoorRuntimeOptions = {
        random: () => {
          const value = randomValues.shift();
          if (value === undefined) {
            throw new Error("door-initial乱数が不足しました。");
          }
          return value;
        },
        checkClosingOccupancy: () => ({
          finalPoseOccupied,
          sweepOccupied
        })
      };
      const doorRuntime = createStageDoorRuntime(
        createDoorRegistry(doors),
        options
      );
      const initial = doorRuntime.getSnapshot();
      const candidates = doorRuntime.getDoorInteractionCandidates({
        origin: Vector3.Zero(),
        forward: Vector3.Forward()
      });
      doorVariants = createDynamicStageSpatialVariants(
        doorRuntime.getSpatialSnapshot()
      );
      doorQueries = createStageSpatialQueries(scene, doorVariants, {
        volumes: []
      });
      const doorRayFrom = new Vector3(0, 0, 0);
      const doorRayTo = new Vector3(0, 0, 0.2);
      const initiallyClosedDoorHit = doorQueries.castBeamSegment(
        doorRayFrom,
        doorRayTo
      );
      checks.push({
        name: "通常扉の初期状態と候補順",
        ok:
          initial.doors.find((door) => door.id === "room-front")?.state ===
            "closed" &&
          initial.doors.find((door) => door.id === "room-side")?.state ===
            "open" &&
          initial.doors.find((door) => door.id === "toilet")?.state ===
            "open" &&
          candidates[0]?.door.id === "room-front" &&
          candidates[1]?.door.id === "room-side" &&
          candidates.every(
            (candidate) => candidate.door.id !== "toilet-far"
          ) &&
          initiallyClosedDoorHit?.mesh === doors[0].panels[0].colliderMeshes[0],
        detail: `${initial.doors.map((door) => `${door.id}:${door.state}`).join(",")} / order=${candidates.map((candidate) => candidate.door.id).join(",")}`
      });

      const opening = doorRuntime.requestDoorToggle("room-front");
      const movingSpatial = doorRuntime.getSpatialSnapshot();
      doorVariants.replaceActiveSet(movingSpatial);
      const openingDoorBeamHit = doorQueries.castBeamSegment(
        doorRayFrom,
        doorRayTo
      );
      doorRuntime.update(0.4);
      const halfway = doorRuntime.getDoorState("room-front");
      const halfwayPanelX = doors[0].panels[0].node.position.x;
      const doorHalfwaySpatial = doorRuntime.getSpatialSnapshot();
      doorRuntime.update(0.4);
      const opened = doorRuntime.getDoorState("room-front");
      const openedPanelX = doors[0].panels[0].node.position.x;
      const openedSpatial = doorRuntime.getSpatialSnapshot();
      checks.push({
        name: "通常扉0.8秒と移動中遮蔽解除",
        ok:
          opening.status === "started" &&
          opening.state === "opening" &&
          movingSpatial.activePanelColliders.length === 3 &&
          movingSpatial.movementColliders.player.length === 3 &&
          movingSpatial.beamBlockers.length === 3 &&
          movingSpatial.sightBlockers.length === 3 &&
          movingSpatial.bitObstacles.length === 3 &&
          openingDoorBeamHit === null &&
          halfway.state === "opening" &&
          Math.abs(halfway.openness - 0.5) < 1e-9 &&
          Math.abs(halfwayPanelX - 0.1) < 1e-9 &&
          doorHalfwaySpatial.revision > movingSpatial.revision &&
          opened.state === "open" &&
          Math.abs(openedPanelX - 0.2) < 1e-9 &&
          openedSpatial.activePanelColliders.length === 4 &&
          openedSpatial.revision > doorHalfwaySpatial.revision,
        detail: `moving=${movingSpatial.activePanelColliders.length} / half=${halfway.openness}:${halfwayPanelX} / final=${opened.state}:${openedPanelX} / revision=${movingSpatial.revision}->${doorHalfwaySpatial.revision}->${openedSpatial.revision}`
      });

      finalPoseOccupied = true;
      const finalPoseBlocked = doorRuntime.requestDoorToggle("room-front");
      finalPoseOccupied = false;
      sweepOccupied = true;
      const sweepBlocked = doorRuntime.requestDoorToggle("room-front");
      sweepOccupied = false;
      const closing = doorRuntime.requestDoorToggle("room-front");
      const closingSpatial = doorRuntime.getSpatialSnapshot();
      doorRuntime.update(0.8);
      const closedSpatial = doorRuntime.getSpatialSnapshot();
      doorVariants.replaceActiveSet(closedSpatial);
      const closedDoorBeamHit = doorQueries.castBeamSegment(
        doorRayFrom,
        doorRayTo
      );
      checks.push({
        name: "通常扉の占有中止と閉扉",
        ok:
          finalPoseBlocked.status === "blocked" &&
          finalPoseBlocked.finalPoseOccupied &&
          !finalPoseBlocked.sweepOccupied &&
          sweepBlocked.status === "blocked" &&
          !sweepBlocked.finalPoseOccupied &&
          sweepBlocked.sweepOccupied &&
          closing.status === "started" &&
          closingSpatial.activePanelColliders.length === 3 &&
          doorRuntime.getDoorState("room-front").state === "closed" &&
          doors[0].panels[0].node.position.x === 0 &&
          closedSpatial.activePanelColliders.length === 4 &&
          closedDoorBeamHit?.mesh ===
            doors[0].panels[0].colliderMeshes[0],
        detail: `blocked=${finalPoseBlocked.status}/${sweepBlocked.status} / closing=${closing.status}:${closingSpatial.activePanelColliders.length} / final=${doorRuntime.getDoorState("room-front").state}:${closedSpatial.activePanelColliders.length}`
      });
      doorQueries.dispose();
      doorQueries = null;
      doorVariants.dispose();
      doorVariants = null;
      doorRuntime.dispose();

      const inspectionDoors = [
        ...Array.from({ length: 38 }, (_, index) =>
          createDoorAsset(
            scene,
            `inspection-room-${index + 1}`,
            "room",
            new Vector3(index * 0.5, 0, 0)
          )
        ),
        ...Array.from({ length: 24 }, (_, index) =>
          createDoorAsset(
            scene,
            `inspection-toilet-${index + 1}`,
            "toilet_stall",
            new Vector3(30 + index * 0.5, 0, 0)
          )
        ),
        createDoorAsset(
          scene,
          "inspection-elevator-landing-1",
          "elevator_landing",
          new Vector3(50, 0, 0)
        ),
        createDoorAsset(
          scene,
          "inspection-elevator-landing-4",
          "elevator_landing",
          new Vector3(51, 0, 0)
        ),
        createDoorAsset(
          scene,
          "inspection-elevator-car",
          "elevator_car",
          new Vector3(52, 0, 0)
        )
      ] as const;
      const staticBlocker = MeshBuilder.CreateBox(
        "COL_InspectionStaticBlocker",
        { size: 0.05 },
        scene
      );
      staticBlocker.position.x = -0.5;
      staticBlocker.computeWorldMatrix(true);
      const fullColliderSet = Object.freeze([
        staticBlocker,
        ...inspectionDoors.flatMap((door) =>
          door.panels.flatMap((panel) => panel.colliderMeshes)
        )
      ]);
      const fullActiveSet = Object.freeze({
        movementColliders: Object.freeze({
          player: fullColliderSet,
          npc: fullColliderSet,
          bit: fullColliderSet
        }),
        groundColliders: fullColliderSet,
        beamBlockers: fullColliderSet,
        sightBlockers: fullColliderSet,
        bitObstacles: fullColliderSet
      });
      const inspectionVariants =
        createDynamicStageSpatialVariants(fullActiveSet);
      const inspectionQueries = createStageSpatialQueries(
        scene,
        inspectionVariants,
        { volumes: [] }
      );
      let inspectionRandomCallCount = 0;
      const inspectionRuntime = createStageDoorRuntime(
        createDoorRegistry(inspectionDoors),
        {
          random: () => {
            inspectionRandomCallCount += 1;
            return 0.5;
          },
          checkClosingOccupancy: () => ({
            finalPoseOccupied: false,
            sweepOccupied: false
          })
        }
      );
      const currentInspectionActiveSet =
        inspectionVariants.getSnapshot();
      inspectionVariants.replaceActiveSet(
        currentInspectionActiveSet
      );
      const inspectionSnapshot =
        inspectionRuntime.getSnapshot();
      const closedPositionHit =
        inspectionQueries.castBeamSegment(
          new Vector3(0, 0, -0.1),
          new Vector3(0, 0, 0.1)
        );
      const openPositionHit =
        inspectionQueries.castBeamSegment(
          new Vector3(0.2, 0, -0.1),
          new Vector3(0.2, 0, 0.1)
        );
      const staticBlockerHit =
        inspectionQueries.castBeamSegment(
          new Vector3(-0.5, 0, -0.1),
          new Vector3(-0.5, 0, 0.1)
        );
      const elevatorPanelsRemainClosed =
        inspectionDoors
          .slice(62)
          .every(
            (door) =>
              door.panels[0]?.node.position.x === 0
          );
      inspectionRuntime.dispose();
      const disposedInspectionMessage = captureMessage(() =>
        inspectionRuntime.getSnapshot()
      );
      const reloadedInspectionRuntime =
        createStageDoorRuntime(
          createDoorRegistry(inspectionDoors),
          {
            random: () => 0.5,
            checkClosingOccupancy: () => ({
              finalPoseOccupied: false,
              sweepOccupied: false
            })
          }
        );
      const reloadedInspectionSnapshot =
        reloadedInspectionRuntime.getSnapshot();
      checks.push({
        name: "通常ゲーム確認用62扉の全開固定",
        ok:
          inspectionRandomCallCount === 38 &&
          inspectionSnapshot.doors.length === 62 &&
          inspectionSnapshot.doors.every(
            (door) =>
              door.state === "open" &&
              door.openness === 1
          ) &&
          elevatorPanelsRemainClosed &&
          inspectionVariants.revision === 1 &&
          inspectionVariants.getSnapshot()
            .beamBlockers.length === 66 &&
          closedPositionHit === null &&
          openPositionHit?.mesh ===
            inspectionDoors[0]?.panels[0]?.colliderMeshes[0] &&
          staticBlockerHit?.mesh === staticBlocker &&
          disposedInspectionMessage?.includes(
            "破棄済み"
          ) === true &&
          reloadedInspectionSnapshot.doors.length ===
            62 &&
          reloadedInspectionSnapshot.doors.every(
            (door) =>
              door.state === "open" &&
              door.openness === 1
          ),
        detail:
          `doors=${inspectionSnapshot.doors.length} / ` +
          `random=${inspectionRandomCallCount} / ` +
          `revision=${inspectionVariants.revision} / ` +
          `closed=${closedPositionHit?.mesh.name ?? "none"} / ` +
          `open=${openPositionHit?.mesh.name ?? "none"} / ` +
          `static=${staticBlockerHit?.mesh.name ?? "none"} / ` +
          `disposed=${disposedInspectionMessage ?? "none"} / ` +
          `reloaded=${reloadedInspectionSnapshot.doors.length}`
      });
      reloadedInspectionRuntime.dispose();
      inspectionQueries.dispose();
      inspectionVariants.dispose();

      const indicatorRoot = new TransformNode(
        "MRK_ElevatorCallIndicator_RuntimeFixture",
        scene
      );
      const indicatorBase = MeshBuilder.CreateBox(
        "VIS_ElevatorCallIndicator_Base_RuntimeFixture",
        { size: 0.1 },
        scene
      );
      indicatorBase.parent = indicatorRoot;
      const indicatorDirection = MeshBuilder.CreateBox(
        "VIS_ElevatorCallIndicator_Direction_RuntimeFixture",
        { size: 0.05 },
        scene
      );
      indicatorDirection.parent = indicatorRoot;
      const indicatorSourceMaterial = new PBRMaterial(
        "MAT_ElevatorCallIndicator_RuntimeFixture",
        scene
      );
      indicatorSourceMaterial.albedoTexture = new DynamicTexture(
        "TEX_ElevatorCallIndicator_RuntimeFixture",
        { width: 4, height: 4 },
        scene,
        false
      );
      indicatorBase.material = indicatorSourceMaterial;
      const indicatorTextureCountBeforeAdapter =
        scene.textures.length;
      const materialAdapter =
        createStageElevatorCallIndicatorAdapter({
          id: "indicator-material-fixture",
          node: indicatorRoot,
          direction: "up",
          baseMesh: indicatorBase,
          directionMesh: indicatorDirection
        });
      materialAdapter.setPresentation("ready", "primary");
      const readyMaterial = indicatorBase.material as PBRMaterial;
      materialAdapter.setPresentation("ready", "primary");
      const repeatedReadyMaterial =
        indicatorBase.material as PBRMaterial;
      materialAdapter.setPresentation("called", "primary");
      const calledMaterial = indicatorBase.material as PBRMaterial;
      materialAdapter.setPresentation("unloading", "primary");
      const unloadingMaterial =
        indicatorBase.material as PBRMaterial;
      materialAdapter.setPresentation(
        "departure-countdown",
        "primary"
      );
      const departureCountdownMaterial =
        indicatorBase.material as PBRMaterial;
      materialAdapter.setPresentation("locked", "primary");
      const lockedMaterial = indicatorBase.material as PBRMaterial;
      materialAdapter.setPresentation("called", "black");
      const blackMaterial = indicatorBase.material as PBRMaterial;
      const indicatorTextureCountDuringAdapter =
        scene.textures.length;
      materialAdapter.dispose();
      checks.push({
        name: "エレベーター呼出indicator専用material",
        ok:
          readyMaterial !== indicatorSourceMaterial &&
          repeatedReadyMaterial === readyMaterial &&
          readyMaterial.albedoColor.equalsWithEpsilon(
            Color3.FromHexString("#36C96B")
          ) &&
          calledMaterial.albedoColor.equalsWithEpsilon(
            Color3.FromHexString("#E8B52E")
          ) &&
          unloadingMaterial.albedoColor.equalsWithEpsilon(
            Color3.FromHexString("#E8B52E")
          ) &&
          departureCountdownMaterial.albedoColor.equalsWithEpsilon(
            Color3.FromHexString("#E34242")
          ) &&
          lockedMaterial.albedoColor.equalsWithEpsilon(
            Color3.FromHexString("#E34242")
          ) &&
          blackMaterial.albedoColor.equalsWithEpsilon(
            Color3.FromHexString("#050505")
          ) &&
          indicatorBase.material === indicatorSourceMaterial &&
          indicatorTextureCountDuringAdapter ===
            indicatorTextureCountBeforeAdapter &&
          scene.textures.length ===
            indicatorTextureCountBeforeAdapter,
        detail:
          `ready=${readyMaterial.albedoColor.toHexString()} / ` +
          `called=${calledMaterial.albedoColor.toHexString()} / ` +
          `unloading=${unloadingMaterial.albedoColor.toHexString()} / ` +
          `departure=${departureCountdownMaterial.albedoColor.toHexString()} / ` +
          `locked=${lockedMaterial.albedoColor.toHexString()} / ` +
          `black=${blackMaterial.albedoColor.toHexString()} / ` +
          `restored=${indicatorBase.material === indicatorSourceMaterial} / ` +
          `textures=${indicatorTextureCountBeforeAdapter}->${indicatorTextureCountDuringAdapter}->${scene.textures.length}`
      });

      const actorPositions = new Map<string, Vector3>();
      const gateStates = new Map<string, boolean>();
      const panelOpenness = new Map<string, number>();
      const panelOpennessUpdateCounts = new Map<string, number>();
      const callIndicatorPresentations = new Map<
        string,
        readonly [string, string]
      >();
      const callIndicatorUpdateCounts = new Map<string, number>();
      const disposedCallIndicators = new Set<string>();
      const createCallIndicatorAdapter = (id: string) =>
        Object.freeze({
          id,
          setPresentation: (state: string, phase: string) => {
            callIndicatorPresentations.set(
              id,
              Object.freeze([state, phase])
            );
            callIndicatorUpdateCounts.set(
              id,
              (callIndicatorUpdateCounts.get(id) ?? 0) + 1
            );
          },
          dispose: () => {
            disposedCallIndicators.add(id);
          }
        });
      const carRoot = new TransformNode("MRK_ElevatorCar_RuntimeFixture", scene);
      const firstFloorRoot = new TransformNode(
        "MRK_ElevatorStop_RuntimeFixture_1",
        scene
      );
      const fourthFloorRoot = new TransformNode(
        "MRK_ElevatorStop_RuntimeFixture_4",
        scene
      );
      fourthFloorRoot.position.y = 6;
      const carPanel = createElevatorPanelFixture(
        scene,
        "car-panel",
        carRoot,
        panelOpenness,
        panelOpennessUpdateCounts
      );
      const firstFloorPanel = createElevatorPanelFixture(
        scene,
        "landing-panel-1",
        firstFloorRoot,
        panelOpenness,
        panelOpennessUpdateCounts
      );
      const fourthFloorPanel = createElevatorPanelFixture(
        scene,
        "landing-panel-4",
        fourthFloorRoot,
        panelOpenness,
        panelOpennessUpdateCounts
      );
      const firstFloorGate = MeshBuilder.CreateBox(
        "COL_HumanOnly_ElevatorGate_RuntimeFixture_1",
        { size: 0.05 },
        scene
      );
      firstFloorGate.parent = firstFloorRoot;
      const fourthFloorGate = MeshBuilder.CreateBox(
        "COL_HumanOnly_ElevatorGate_RuntimeFixture_4",
        { size: 0.05 },
        scene
      );
      fourthFloorGate.parent = fourthFloorRoot;
      let doorMotionBlocked = false;
      const elevator = createStageElevatorRuntime({
        id: "fixture-elevator",
        stops: [
          {
            id: "stop-1",
            floorIndex: 1,
            carPosition: new Vector3(0, 0, 0),
            landingDoorPanels: [firstFloorPanel.adapter],
            humanGateCollider: firstFloorGate,
            setHumanGateEnabled: (enabled) =>
              gateStates.set("stop-1", enabled),
            callIndicator: createCallIndicatorAdapter("indicator-1")
          },
          {
            id: "stop-4",
            floorIndex: 4,
            carPosition: new Vector3(0, 6, 0),
            landingDoorPanels: [fourthFloorPanel.adapter],
            humanGateCollider: fourthFloorGate,
            setHumanGateEnabled: (enabled) =>
              gateStates.set("stop-4", enabled),
            callIndicator: createCallIndicatorAdapter("indicator-4")
          }
        ],
        carDoorPanels: [carPanel.adapter],
        car: {
          getWorldPosition: () => carRoot.getAbsolutePosition().clone(),
          setWorldPosition: (position) => {
            carRoot.position.copyFrom(position);
            carRoot.computeWorldMatrix(true);
            carPanel.mesh.computeWorldMatrix(true);
          },
          getBoardingWorldPosition: (slotIndex) =>
            carRoot
              .getAbsolutePosition()
              .add(
                new Vector3(
                  ((slotIndex % 3) - 1) * 0.01,
                  0,
                  Math.floor(slotIndex / 3) * 0.01
                )
              ),
          worldToCarLocal: (position) =>
            position.subtract(carRoot.getAbsolutePosition()),
          carLocalToWorld: (position) =>
            carRoot.getAbsolutePosition().add(position)
        },
        actors: {
          getActorPosition: (actorId) => {
            const position = actorPositions.get(actorId);
            if (!position) {
              throw new Error(`Actor位置がありません: ${actorId}`);
            }
            return position.clone();
          },
          setActorPosition: (actorId, position) => {
            actorPositions.set(actorId, position.clone());
          }
        },
        occupancy: {
          isDoorMotionBlocked: () => doorMotionBlocked
        }
      });
      const initialElevator = elevator.getSnapshot();
      const repeatedInitialElevator = elevator.getSnapshot();
      const initialElevatorSpatial = elevator.getSpatialSnapshot();
      const initialFirstIndicatorPresentation =
        callIndicatorPresentations.get("indicator-1");
      const initialFourthIndicatorPresentation =
        callIndicatorPresentations.get("indicator-4");
      elevatorVariants = createDynamicStageSpatialVariants(
        initialElevatorSpatial
      );
      elevatorQueries = createStageSpatialQueries(
        scene,
        elevatorVariants,
        { volumes: [] }
      );
      const lowerDoorRayFrom = new Vector3(0, 0, -0.2);
      const lowerDoorRayTo = new Vector3(0, 0, 0.2);
      const initialHumanGateHit = elevatorQueries.castMovementSegment(
        "player",
        lowerDoorRayFrom,
        lowerDoorRayTo
      );
      const initialPanelBeamHit = elevatorQueries.castBeamSegment(
        lowerDoorRayFrom,
        lowerDoorRayTo
      );
      actorPositions.set(
        "actor-pre-departure-exit",
        new Vector3(0, 6, 0)
      );
      const preDepartureReservation = elevator.requestBoarding(
        createReservation("actor-pre-departure-exit", 0)
      );
      elevator.completeBoarding("actor-pre-departure-exit");
      elevator.completePreDepartureExit(
        "actor-pre-departure-exit"
      );
      const afterPreDepartureExit = elevator.getSnapshot();
      checks.push({
        name: "エレベーター出発前退避",
        ok:
          preDepartureReservation.status === "accepted" &&
          afterPreDepartureExit.passengers.length === 0 &&
          afterPreDepartureExit.dwellRemainingSeconds === null &&
          afterPreDepartureExit.stops.every(
            (stop) => stop.callMatState === "ready"
          ),
        detail:
          `reservation=${preDepartureReservation.status} / ` +
          `passengers=${afterPreDepartureExit.passengers.length} / ` +
          `dwell=${afterPreDepartureExit.dwellRemainingSeconds ?? "none"} / ` +
          `states=${afterPreDepartureExit.stops.map((stop) => `${stop.id}:${stop.callMatState}`).join(",")}`
      });
      const reservations = Array.from({ length: 7 }, (_, index) =>
        createReservation(`actor-${index}`, 1)
      ).reverse();
      reservations.forEach((reservation, index) =>
        actorPositions.set(
          reservation.actorId,
          new Vector3(index * 0.01, 6, 0)
        )
      );
      const capacityResults = elevator.requestBoarding(reservations);
      const capacityRejected = capacityResults.find(
        (result) => result.status === "capacity-reached"
      );
      checks.push({
        name: "エレベーター初期4階と定員6人",
        ok:
          initialElevator.currentStopId === "stop-4" &&
          repeatedInitialElevator === initialElevator &&
          initialElevator.carDoorState === "open" &&
          gateStates.get("stop-4") === false &&
          initialElevatorSpatial.revision === 0 &&
          initialElevatorSpatial.beamBlockers.length === 3 &&
          initialElevatorSpatial.movementColliders.player.includes(
            firstFloorGate
          ) &&
          !initialElevatorSpatial.movementColliders.player.includes(
            fourthFloorGate
          ) &&
          initialHumanGateHit !== null &&
          initialPanelBeamHit?.mesh === firstFloorPanel.mesh &&
          panelOpenness.get("car-panel") === 1 &&
          panelOpenness.get("landing-panel-4") === 1 &&
          panelOpenness.get("landing-panel-1") === 0 &&
          initialElevator.stops.every(
            (stop) => stop.callMatState === "ready"
          ) &&
          initialFirstIndicatorPresentation?.[0] === "ready" &&
          initialFirstIndicatorPresentation?.[1] === "primary" &&
          initialFourthIndicatorPresentation?.[0] === "ready" &&
          initialFourthIndicatorPresentation?.[1] === "primary" &&
          capacityResults.filter((result) => result.status === "accepted")
            .length === 6 &&
          capacityResults[0]?.status === "capacity-reached" &&
          capacityRejected?.actorId === "actor-6",
        detail: `stop=${initialElevator.currentStopId} / snapshotReused=${repeatedInitialElevator === initialElevator} / spatial=${initialElevatorSpatial.revision}:${initialElevatorSpatial.beamBlockers.length} / accepted=${capacityResults.filter((result) => result.status === "accepted").length} / rejected=${capacityResults[0]?.status}`
      });

      for (const reservation of reservations.slice(1, 6)) {
        elevator.cancelBoardingReservation(reservation.actorId);
      }
      elevator.completeBoarding("actor-0");
      const countdownStartSpatialRevision =
        elevator.getSpatialSnapshot().revision;
      const countdownBeforeBlink = elevator.update(0.499);
      const repeatedCountdownBeforeBlink = elevator.getSnapshot();
      const countdownBeforeBlinkPresentation =
        callIndicatorPresentations.get("indicator-4");
      const countdownBlink = elevator.update(0.001);
      const countdownBlinkPresentation =
        callIndicatorPresentations.get("indicator-4");
      const countdownBlinkSpatialRevision =
        elevator.getSpatialSnapshot().revision;
      const actorZeroCarLocal = actorPositions
        .get("actor-0")!
        .subtract(initialElevator.carPosition);
      const afterFiveSeconds = elevator.update(4.5);
      const afterFiveSpatial = elevator.getSpatialSnapshot();
      const closingStartOpenness = panelOpenness.get("car-panel");
      const afterClosing = elevator.update(1);
      const afterClosingSpatial = elevator.getSpatialSnapshot();
      const closedOpenness = panelOpenness.get("car-panel");
      const panelUpdatesBeforeHalfway = Object.freeze(
        new Map(panelOpennessUpdateCounts)
      );
      const halfwayTravel = elevator.update(3);
      const panelUpdatesAfterHalfway = Object.freeze(
        new Map(panelOpennessUpdateCounts)
      );
      const halfwaySpatial = elevator.getSpatialSnapshot();
      const actorHalfway = actorPositions.get("actor-0")!;
      const carPanelHalfwayY =
        carPanel.mesh.getBoundingInfo().boundingBox.centerWorld.y;
      doorMotionBlocked = true;
      const arrivedClosed = elevator.update(3);
      doorMotionBlocked = false;
      const arrivalOpening = elevator.update(0);
      const arrivedOpen = elevator.update(1);
      const arrivedOpenSpatial = elevator.getSpatialSnapshot();
      const arrivedOpenOpenness = panelOpenness.get("landing-panel-1");
      elevatorVariants.replaceActiveSet(arrivedOpenSpatial);
      const openHumanGateHit = elevatorQueries.castMovementSegment(
        "player",
        lowerDoorRayFrom,
        lowerDoorRayTo
      );
      const openPanelBeamHit = elevatorQueries.castBeamSegment(
        lowerDoorRayFrom,
        lowerDoorRayTo
      );
      checks.push({
        name: "エレベーター5秒待機・1秒扉・6秒搬送",
        ok:
          afterFiveSeconds.carDoorState === "closing" &&
          countdownBlink.stops.find(
            (stop) => stop.id === "stop-4"
          )?.callMatState === "departure-countdown" &&
          countdownBeforeBlink.stops.find(
            (stop) => stop.id === "stop-4"
          )?.callMatState === "departure-countdown" &&
          countdownBeforeBlinkPresentation?.[0] ===
            "departure-countdown" &&
          countdownBeforeBlinkPresentation?.[1] === "primary" &&
          countdownBlinkPresentation?.[0] ===
            "departure-countdown" &&
          countdownBlinkPresentation?.[1] === "black" &&
          repeatedCountdownBeforeBlink === countdownBeforeBlink &&
          countdownBlink !== countdownBeforeBlink &&
          countdownStartSpatialRevision ===
            countdownBlinkSpatialRevision &&
          afterClosing.carState === "moving" &&
          afterFiveSeconds.stops.every(
            (stop) => stop.callMatState === "locked"
          ) &&
          Math.abs(halfwayTravel.carTravelProgress - 0.5) < 1e-9 &&
          Vector3.Distance(
            actorHalfway,
            halfwayTravel.carPosition.add(actorZeroCarLocal)
          ) < 1e-9 &&
          arrivedClosed.currentStopId === "stop-1" &&
          arrivedClosed.carDoorState === "closed" &&
          arrivedClosed.passengers[0]?.state === "arrived" &&
          arrivedClosed.stops.find((stop) => stop.id === "stop-1")
            ?.callMatState === "called" &&
          arrivedClosed.stops.find((stop) => stop.id === "stop-4")
            ?.callMatState === "locked" &&
          arrivalOpening.carDoorState === "opening" &&
          arrivalOpening.stops.find((stop) => stop.id === "stop-1")
            ?.callMatState === "called" &&
          arrivedOpen.carDoorState === "open" &&
          arrivedOpen.passengers.length === 1,
        detail: `countdown=${countdownBlink.stops.map((stop) => `${stop.id}:${stop.callMatState}`).join(",")} / snapshot=${repeatedCountdownBeforeBlink === countdownBeforeBlink}->${countdownBlink !== countdownBeforeBlink} / after5=${afterFiveSeconds.carDoorState} / after1=${afterClosing.carState} / half=${halfwayTravel.carTravelProgress} / arrival=${arrivedClosed.carDoorState}:${arrivedClosed.stops.map((stop) => `${stop.id}:${stop.callMatState}`).join(",")}->${arrivalOpening.carDoorState}->${arrivedOpen.carDoorState}`
      });
      checks.push({
        name: "エレベーター人物gateと実panel動的遮蔽",
        ok:
          afterFiveSpatial.revision > initialElevatorSpatial.revision &&
          afterFiveSpatial.movementColliders.player.includes(
            fourthFloorGate
          ) &&
          closingStartOpenness === 1 &&
          closedOpenness === 0 &&
          halfwaySpatial.revision > afterClosingSpatial.revision &&
          [...panelUpdatesBeforeHalfway].every(
            ([panelId, count]) =>
              panelUpdatesAfterHalfway.get(panelId) === count
          ) &&
          Math.abs(carPanelHalfwayY - 3) < 1e-9 &&
          arrivedOpenSpatial.movementColliders.player.includes(
            fourthFloorGate
          ) &&
          !arrivedOpenSpatial.movementColliders.player.includes(
            firstFloorGate
          ) &&
          arrivedOpenSpatial.beamBlockers.length === 3 &&
          !arrivedOpenSpatial.beamBlockers.includes(firstFloorGate) &&
          !arrivedOpenSpatial.beamBlockers.includes(fourthFloorGate) &&
          arrivedOpenSpatial.movementColliders.bit.length === 3 &&
          arrivedOpenOpenness === 1 &&
          openHumanGateHit === null &&
          openPanelBeamHit === null,
        detail: `revision=${initialElevatorSpatial.revision}->${afterFiveSpatial.revision}->${afterClosingSpatial.revision}->${halfwaySpatial.revision}->${arrivedOpenSpatial.revision} / panelUpdates=${JSON.stringify([...panelUpdatesBeforeHalfway])}->${JSON.stringify([...panelUpdatesAfterHalfway])} / query=${elevatorQueries.revision} / carY=${carPanelHalfwayY.toFixed(3)} / gate=${gateStates.get("stop-1")}/${gateStates.get("stop-4")}`
      });
      actorPositions.set("actor-arrival-wait", new Vector3(0, 0, 0));
      const arrivedEstimate = elevator.estimateTripSeconds(
        "stop-1",
        "stop-4"
      );
      const arrivedBoarding = elevator.requestBoarding({
        actorId: "actor-arrival-wait",
        fromStopId: "stop-1",
        destinationStopId: "stop-4",
        requestedAtSeconds: 19
      });
      const arrivedCall = elevator.requestCall("stop-4");
      const unloadingSpatialRevision =
        elevator.getSpatialSnapshot().revision;
      const unloadingPresentationBeforeWait =
        callIndicatorPresentations.get("indicator-1");
      const unloadingUpdateCountBeforeWait =
        callIndicatorUpdateCounts.get("indicator-1");
      const unloadingSteady = elevator.update(0.5);
      const unloadingPresentationAfterWait =
        callIndicatorPresentations.get("indicator-1");
      const unloadingUpdateCountAfterWait =
        callIndicatorUpdateCounts.get("indicator-1");
      const arrivedPreDepartureExitMessage = captureMessage(() =>
        elevator.completePreDepartureExit("actor-0")
      );
      checks.push({
        name: "エレベーター到着客の完全降車待ち・自動復路禁止",
        ok:
          arrivedOpen.passengers[0]?.state === "arrived" &&
          arrivedOpen.stops.find((stop) => stop.id === "stop-1")
            ?.callMatState === "unloading" &&
          arrivedOpen.stops.find((stop) => stop.id === "stop-4")
            ?.callMatState === "locked" &&
          arrivedBoarding.status === "not-boardable" &&
          arrivedCall.status === "not-callable" &&
          arrivedEstimate.capacityAvailable === false &&
          arrivedEstimate.availableCapacity === 0 &&
          arrivedEstimate.waitSeconds === Number.POSITIVE_INFINITY &&
          arrivedEstimate.totalSeconds === Number.POSITIVE_INFINITY &&
          arrivedPreDepartureExitMessage?.includes(
            "到着済み"
          ) === true &&
          unloadingSteady.carDoorState === "open" &&
          unloadingSteady.currentStopId === "stop-1" &&
          unloadingSteady.targetStopId === null &&
          elevator.getSpatialSnapshot().revision ===
            unloadingSpatialRevision &&
          unloadingPresentationBeforeWait?.[0] ===
            "unloading" &&
          unloadingPresentationBeforeWait?.[1] === "primary" &&
          unloadingPresentationAfterWait?.[0] === "unloading" &&
          unloadingPresentationAfterWait?.[1] === "primary" &&
          unloadingUpdateCountAfterWait ===
            unloadingUpdateCountBeforeWait,
        detail:
          `passenger=${arrivedOpen.passengers[0]?.state ?? "none"} / ` +
          `states=${arrivedOpen.stops.map((stop) => `${stop.id}:${stop.callMatState}`).join(",")} / ` +
          `boarding=${arrivedBoarding.status} / call=${arrivedCall.status} / ` +
          `preDeparture=${arrivedPreDepartureExitMessage ?? "none"} / ` +
          `estimate=${arrivedEstimate.waitSeconds} / ` +
          `revision=${unloadingSpatialRevision}->${elevator.getSpatialSnapshot().revision}`
      });
      elevator.completeDisembark("actor-0");
      actorPositions.set("actor-return", new Vector3(0, 0, 0));
      const reopenedCapacity = elevator.requestBoarding({
        actorId: "actor-return",
        fromStopId: "stop-1",
        destinationStopId: "stop-4",
        requestedAtSeconds: 20
      });
      elevator.cancelBoardingReservation("actor-return");
      checks.push({
        name: "エレベーター降車非阻害・空き回復・予約取消",
        ok:
          elevator.getSnapshot().passengers.length === 0 &&
          elevator.getSnapshot().reservations.length === 0 &&
          reopenedCapacity.status === "accepted",
        detail: `passengers=${elevator.getSnapshot().passengers.length} / reservations=${elevator.getSnapshot().reservations.length} / reopened=${reopenedCapacity.status}`
      });

      const invalidStopMessage = captureMessage(() =>
        elevator.requestCall("stop-invalid")
      );
      elevator.requestCall("stop-4");
      const calledPrimaryPresentation =
        callIndicatorPresentations.get("indicator-4");
      const lockedPrimaryPresentation =
        callIndicatorPresentations.get("indicator-1");
      const calledBlinkStartSpatialRevision =
        elevator.getSpatialSnapshot().revision;
      const calledUpdateCountBeforeBlink =
        callIndicatorUpdateCounts.get("indicator-4");
      const lockedUpdateCountBeforeBlink =
        callIndicatorUpdateCounts.get("indicator-1");
      doorMotionBlocked = true;
      const calledBeforeBlink = elevator.update(0.499);
      const calledBeforeBlinkPresentation =
        callIndicatorPresentations.get("indicator-4");
      const calledUpdateCountBeforeBoundary =
        callIndicatorUpdateCounts.get("indicator-4");
      const calledBlink = elevator.update(0.001);
      const calledBlinkPresentation =
        callIndicatorPresentations.get("indicator-4");
      const calledBlinkSpatialRevision =
        elevator.getSpatialSnapshot().revision;
      const calledUpdateCountAfterBlink =
        callIndicatorUpdateCounts.get("indicator-4");
      const lockedUpdateCountAfterBlink =
        callIndicatorUpdateCounts.get("indicator-1");
      const occupancyBlockedCall = elevator.update(0);
      const gateAtBlockedCall = gateStates.get("stop-1");
      doorMotionBlocked = false;
      const callClosing = elevator.update(0);
      const gateAtCallClosing = gateStates.get("stop-1");
      elevatorVariants.replaceActiveSet(elevator.getSpatialSnapshot());
      const closingHumanGateHit = elevatorQueries.castMovementSegment(
        "player",
        lowerDoorRayFrom,
        lowerDoorRayTo
      );
      const closingPanelBeamHit = elevatorQueries.castBeamSegment(
        lowerDoorRayFrom,
        lowerDoorRayTo
      );
      const callMoving = elevator.update(1);
      const notBoardable = elevator.requestBoarding({
        actorId: "actor-late",
        fromStopId: "stop-1",
        destinationStopId: "stop-4",
        requestedAtSeconds: 21
      });
      const rejectedCallDuringTravel = elevator.requestCall("stop-1");
      const heldDuringTravel = elevator.getSnapshot();
      doorMotionBlocked = true;
      const arrivedForCall = elevator.update(6);
      doorMotionBlocked = false;
      const arrivalOpeningForCall = elevator.update(0);
      const openedAtUpdateBoundary = elevator.update(10);
      actorPositions.set("actor-boundary", new Vector3(0, 6, 0));
      const boundaryReservation = elevator.requestBoarding({
        actorId: "actor-boundary",
        fromStopId: "stop-4",
        destinationStopId: "stop-1",
        requestedAtSeconds: 22
      });
      const heldOpenByReservation = elevator.update(10);
      elevator.cancelBoardingReservation("actor-boundary");
      const idleAfterCancel = elevator.update(0);
      checks.push({
        name: "エレベーター呼出中の黄色点滅・反対階の赤点灯",
        ok:
          calledPrimaryPresentation?.[0] === "called" &&
          calledPrimaryPresentation?.[1] === "primary" &&
          lockedPrimaryPresentation?.[0] === "locked" &&
          lockedPrimaryPresentation?.[1] === "primary" &&
          calledBeforeBlink.stops.find(
            (stop) => stop.id === "stop-4"
          )?.callMatState === "called" &&
          calledBeforeBlinkPresentation?.[0] === "called" &&
          calledBeforeBlinkPresentation?.[1] === "primary" &&
          calledBlink.stops.find(
            (stop) => stop.id === "stop-4"
          )?.callMatState === "called" &&
          calledBlinkPresentation?.[0] === "called" &&
          calledBlinkPresentation?.[1] === "black" &&
          calledBlinkStartSpatialRevision ===
            calledBlinkSpatialRevision &&
          calledUpdateCountBeforeBlink !== undefined &&
          lockedUpdateCountBeforeBlink !== undefined &&
          calledUpdateCountBeforeBoundary ===
            calledUpdateCountBeforeBlink &&
          calledUpdateCountAfterBlink ===
            calledUpdateCountBeforeBlink + 1 &&
          lockedUpdateCountAfterBlink ===
            lockedUpdateCountBeforeBlink,
        detail:
          `called=${calledPrimaryPresentation?.join("/")}->${calledBeforeBlinkPresentation?.join("/")}->${calledBlinkPresentation?.join("/")} / ` +
          `locked=${lockedPrimaryPresentation?.join("/")} / ` +
          `updates=${calledUpdateCountBeforeBlink}->${calledUpdateCountBeforeBoundary}->${calledUpdateCountAfterBlink} / ` +
          `revision=${calledBlinkStartSpatialRevision}->${calledBlinkSpatialRevision}`
      });
      checks.push({
        name: "エレベーター両方向呼出・占有待機・走行中追加呼出禁止",
        ok:
          occupancyBlockedCall.carDoorState === "open" &&
          gateAtBlockedCall === false &&
          callClosing.carDoorState === "closing" &&
          gateAtCallClosing === true &&
          closingHumanGateHit?.mesh === firstFloorGate &&
          closingPanelBeamHit === null &&
          callMoving.carState === "moving" &&
          notBoardable.status === "not-boardable" &&
          rejectedCallDuringTravel.status === "not-callable" &&
          heldDuringTravel.calls.length === 1 &&
          heldDuringTravel.calls.includes("stop-4") &&
          !heldDuringTravel.calls.includes("stop-1") &&
          arrivedForCall.currentStopId === "stop-4" &&
          arrivedForCall.carDoorState === "closed" &&
          arrivedForCall.calls.length === 1 &&
          arrivedForCall.calls.includes("stop-4") &&
          arrivedForCall.stops.find(
            (stop) => stop.id === "stop-4"
          )?.callMatState === "called" &&
          arrivedForCall.stops.find(
            (stop) => stop.id === "stop-1"
          )?.callMatState === "locked" &&
          arrivalOpeningForCall.carDoorState === "opening" &&
          arrivalOpeningForCall.stops.find(
            (stop) => stop.id === "stop-4"
          )?.callMatState === "called" &&
          openedAtUpdateBoundary.carDoorState === "open" &&
          openedAtUpdateBoundary.stops.every(
            (stop) => stop.callMatState === "ready"
          ) &&
          idleAfterCancel.carDoorState === "open" &&
          idleAfterCancel.targetStopId === null &&
          invalidStopMessage?.includes("未登録") === true,
        detail: `blocked=${occupancyBlockedCall.carDoorState} / moving=${callMoving.carState} / call=${rejectedCallDuringTravel.status} / held=${heldDuringTravel.calls.join(",")} / arrival=${arrivedForCall.carDoorState}:${arrivedForCall.calls.join(",")} / idle=${idleAfterCancel.targetStopId ?? "none"} / invalid=${invalidStopMessage ?? "none"}`
      });
      checks.push({
        name: "エレベーター開扉完了境界・予約中の閉扉抑止",
        ok:
          openedAtUpdateBoundary.carState === "stopped" &&
          openedAtUpdateBoundary.carDoorState === "open" &&
          openedAtUpdateBoundary.calls.length === 0 &&
          boundaryReservation.status === "accepted" &&
          heldOpenByReservation.carState === "stopped" &&
          heldOpenByReservation.carDoorState === "open" &&
          heldOpenByReservation.reservations.length === 1 &&
          heldOpenByReservation.stops.find(
            (stop) => stop.id === "stop-4"
          )?.callMatState === "ready" &&
          heldOpenByReservation.stops.find(
            (stop) => stop.id === "stop-1"
          )?.callMatState === "locked" &&
          idleAfterCancel.stops.every(
            (stop) => stop.callMatState === "ready"
          ),
        detail: `boundary=${openedAtUpdateBoundary.carState}:${openedAtUpdateBoundary.carDoorState} / reservation=${boundaryReservation.status}:${heldOpenByReservation.reservations.length} / afterCancel=${idleAfterCancel.carDoorState}:${idleAfterCancel.targetStopId}`
      });
      const stableIndicatorUpdateCounts = new Map(
        callIndicatorUpdateCounts
      );
      elevator.update(0.1);
      const stableIndicatorsUnchanged = [
        "indicator-1",
        "indicator-4"
      ].every(
        (id) =>
          callIndicatorUpdateCounts.get(id) ===
          stableIndicatorUpdateCounts.get(id)
      );
      elevator.dispose();
      checks.push({
        name: "エレベーター呼出表示の差分更新・破棄",
        ok:
          stableIndicatorsUnchanged &&
          disposedCallIndicators.has("indicator-1") &&
          disposedCallIndicators.has("indicator-4"),
        detail:
          `updates=${[...callIndicatorUpdateCounts.entries()]
            .map(([id, count]) => `${id}:${count}`)
            .join(",")} / disposed=${[...disposedCallIndicators].join(",")}`
      });

      const roomIds = Array.from(
        { length: 20 },
        (_, index) => `room-${index + 1}`
      );
      const level0 = selectDisorderedRoomIds(
        roomIds,
        createSchoolRuntimeSettings(0),
        123
      );
      const level2 = selectDisorderedRoomIds(
        roomIds,
        createSchoolRuntimeSettings(),
        123
      );
      const level10 = selectDisorderedRoomIds(
        roomIds,
        createSchoolRuntimeSettings(10),
        123
      );
      const repeated = selectDisorderedRoomIds(
        roomIds,
        createSchoolRuntimeSettings(),
        123
      );
      const differentSeed = selectDisorderedRoomIds(
        roomIds,
        createSchoolRuntimeSettings(),
        124
      );
      checks.push({
        name: "部屋variantの0・4・20室とseed再現性",
        ok:
          level0.length === 0 &&
          level2.length === 4 &&
          level10.length === 20 &&
          JSON.stringify(level2) === JSON.stringify(repeated) &&
          JSON.stringify(level2) !== JSON.stringify(differentSeed),
        detail: `level0=${level0.length} / level2=${level2.length} / level10=${level10.length} / seed123=${level2.join(",")} / seed124=${differentSeed.join(",")}`
      });
    } finally {
      doorQueries?.dispose();
      doorVariants?.dispose();
      elevatorQueries?.dispose();
      elevatorVariants?.dispose();
      scene.dispose();
      engine.dispose();
    }
    return Object.freeze(checks);
  };
