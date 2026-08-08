import { FreeCamera, Scene, Vector3 } from "@babylonjs/core";

import type {
  SchoolStageDynamicRuntime,
  SchoolStageDynamicRuntimeSnapshot
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  ELEVATOR_DOOR_MOTION_SECONDS,
  ELEVATOR_TRAVEL_SECONDS
} from "../../../src/world/stageElevatorRuntime";
import type {
  StageElevatorAsset,
  StageElevatorStopAsset
} from "../../../src/world/stageDynamicAssets";
import type {
  StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import {
  createV2PlayerController
} from "../../../src/v2/playerController";
import type {
  V2PlayerInput,
  V2PlayerMoveAxes
} from "../../../src/v2/playerInput";

export type ElevatorThresholdPlayerCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const FRAME_SECONDS = 1 / 60;
const LATERAL_OFFSET = 0.07;
const TARGET_TOLERANCE = 0.0125;
const MAX_FRAMES_PER_CROSSING = 720;
const MAX_STALLED_FRAMES = 12;
const MAX_AIRBORNE_FRAMES = 4;
const REPETITIONS = 20;

type MutableFixtureInput = V2PlayerInput & {
  setDashPressed(pressed: boolean): void;
};

const createFixtureInput = (): MutableFixtureInput => {
  const axes: V2PlayerMoveAxes = Object.freeze({
    moveX: 0,
    moveZ: 1
  });
  let dashPressed = false;
  let active = true;
  const assertActive = () => {
    if (!active) {
      throw new Error("破棄済みの敷居player入力は使用できません。");
    }
  };
  return {
    getMoveAxes: () => {
      assertActive();
      return axes;
    },
    isDashPressed: () => {
      assertActive();
      return dashPressed;
    },
    drainPressedActions: () => {
      assertActive();
      return Object.freeze([]);
    },
    reset: () => {
      assertActive();
      dashPressed = false;
    },
    dispose: () => {
      assertActive();
      active = false;
    },
    setDashPressed: (pressed: boolean) => {
      assertActive();
      dashPressed = pressed;
    }
  };
};

const requireHorizontalDirection = (
  from: Vector3,
  to: Vector3,
  label: string
) => {
  const direction = to.subtract(from);
  direction.y = 0;
  if (direction.lengthSquared() <= 0.000001) {
    throw new Error(`${label}の水平移動方向を算出できません。`);
  }
  return direction.normalize();
};

const getMeshCenter = (
  mesh: StageElevatorStopAsset["callMat"]["mesh"]
) => {
  mesh.computeWorldMatrix(true);
  return mesh.getBoundingInfo().boundingBox.centerWorld.clone();
};

const ensureElevatorOpenAtStop = (
  runtime: SchoolStageDynamicRuntime,
  update: (
    deltaSeconds: number
  ) => SchoolStageDynamicRuntimeSnapshot,
  elevator: StageElevatorAsset,
  stop: StageElevatorStopAsset
) => {
  const elevatorRuntime = runtime.getElevator(elevator.id);
  const before = elevatorRuntime.getSnapshot();
  if (
    before.currentStopId === stop.id &&
    before.carDoorState === "open" &&
    before.passengers.length === 0 &&
    before.reservations.length === 0
  ) {
    return before;
  }
  const callResult = elevatorRuntime.requestCall(stop.id);
  if (callResult.status !== "accepted") {
    throw new Error(
      `敷居fixtureの空車呼出を受理できません: ${stop.id}/${callResult.status}`
    );
  }
  update(0);
  update(ELEVATOR_DOOR_MOTION_SECONDS);
  update(ELEVATOR_TRAVEL_SECONDS);
  update(ELEVATOR_DOOR_MOTION_SECONDS);
  const opened = elevatorRuntime.getSnapshot();
  if (
    opened.currentStopId !== stop.id ||
    opened.carDoorState !== "open" ||
    opened.passengers.length !== 0
  ) {
    throw new Error(
      `敷居fixtureの停止階を開放できません: ${stop.id}/${opened.currentStopId}/${opened.carDoorState}`
    );
  }
  return opened;
};

type CrossingResult = Readonly<{
  reached: boolean;
  maximumStalledFrames: number;
  airborneFrames: number;
}>;

const runCrossing = (
  controller: ReturnType<typeof createV2PlayerController>,
  input: MutableFixtureInput,
  from: Vector3,
  to: Vector3,
  dash: boolean
): CrossingResult => {
  try {
    controller.placeAt(from, to);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `${detail} from=(${from.x},${from.y},${from.z}) ` +
      `to=(${to.x},${to.y},${to.z})`
    );
  }
  input.setDashPressed(dash);
  const travelDirection = requireHorizontalDirection(
    from,
    to,
    "敷居通過"
  );
  const requiredDistance = Vector3.Distance(
    new Vector3(from.x, 0, from.z),
    new Vector3(to.x, 0, to.z)
  );
  let previousProgress = 0;
  let stalledFrames = 0;
  let maximumStalledFrames = 0;
  let airborneFrames = 0;
  let reached = false;

  for (
    let frameIndex = 0;
    frameIndex < MAX_FRAMES_PER_CROSSING;
    frameIndex += 1
  ) {
    const frame = controller.update(FRAME_SECONDS, true, 1);
    const displacement = frame.footPosition.subtract(from);
    displacement.y = 0;
    const progress = Vector3.Dot(displacement, travelDirection);
    if (!frame.verticalState.grounded) {
      airborneFrames += 1;
    }
    if (
      frameIndex > 12 &&
      progress <= previousProgress + 0.000001
    ) {
      stalledFrames += 1;
      maximumStalledFrames = Math.max(
        maximumStalledFrames,
        stalledFrames
      );
    } else {
      stalledFrames = 0;
    }
    previousProgress = Math.max(previousProgress, progress);
    if (progress >= requiredDistance - TARGET_TOLERANCE) {
      reached = true;
      break;
    }
  }
  input.setDashPressed(false);
  return Object.freeze({
    reached,
    maximumStalledFrames,
    airborneFrames
  });
};

export const runElevatorThresholdPlayerAcceptance = ({
  scene,
  stage,
  runtime,
  update
}: Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  runtime: SchoolStageDynamicRuntime;
  update: (
    deltaSeconds: number
  ) => SchoolStageDynamicRuntimeSnapshot;
}>): ElevatorThresholdPlayerCheck => {
  const elevator = stage.elevatorAssets.all[0];
  if (!elevator) {
    throw new Error("敷居player fixtureにエレベーターがありません。");
  }
  const input = createFixtureInput();
  const camera = new FreeCamera(
    "ElevatorThresholdAcceptanceCamera",
    Vector3.Zero(),
    scene
  );
  const controller = createV2PlayerController({
    scene,
    camera,
    stage,
    playerSpawn: (() => {
      const playerSpawn = stage.playerSpawns.getById("player-spawn-main");
      if (!playerSpawn) {
        throw new Error("敷居player fixtureのPlayer開始地点がありません。");
      }
      return playerSpawn;
    })(),
    input
  });
  const playerCollision = scene.getMeshByName(
    "V2PlayerCollision"
  );
  if (!playerCollision) {
    throw new Error(
      "敷居player fixtureにV2PlayerCollisionがありません。"
    );
  }
  let synchronizedRevision =
    stage.dynamicVariants.getSnapshot().revision;
  const initialSurroundingMeshes =
    playerCollision.surroundingMeshes;
  controller.syncStageSpatialSnapshot(
    stage.dynamicVariants.getSnapshot()
  );
  const repeatedRevisionPreservedSurroundingMeshes =
    playerCollision.surroundingMeshes ===
    initialSurroundingMeshes;
  let revisionUpdateReplacedSurroundingMeshes = false;
  let attempts = 0;
  let failures = 0;
  let maximumStalledFrames = 0;
  let maximumAirborneFrames = 0;

  try {
    for (const stop of elevator.stops) {
      ensureElevatorOpenAtStop(
        runtime,
        update,
        elevator,
        stop
      );
      const spatialSnapshot =
        runtime.getSnapshot().spatialSnapshot;
      const surroundingMeshesBeforeSync =
        playerCollision.surroundingMeshes;
      controller.syncStageSpatialSnapshot(spatialSnapshot);
      if (spatialSnapshot.revision !== synchronizedRevision) {
        revisionUpdateReplacedSurroundingMeshes ||=
          playerCollision.surroundingMeshes !==
          surroundingMeshesBeforeSync;
        synchronizedRevision = spatialSnapshot.revision;
      }

      const callMatCenter = getMeshCenter(stop.callMat.mesh);
      elevator.car.node.computeWorldMatrix(true);
      elevator.car.passengerOriginNode.computeWorldMatrix(true);
      const carFootPosition =
        elevator.car.passengerOriginNode
          .getAbsolutePosition()
          .clone();
      const outward = requireHorizontalDirection(
        carFootPosition,
        callMatCenter,
        `停止階${stop.id}`
      );
      const lateral = new Vector3(
        -outward.z,
        0,
        outward.x
      );
      const outsideBase = callMatCenter.clone();
      const insideBase = carFootPosition.clone();
      const lanePairs = Object.freeze([
        Object.freeze([0, 0] as const),
        Object.freeze([-LATERAL_OFFSET, -LATERAL_OFFSET] as const),
        Object.freeze([LATERAL_OFFSET, LATERAL_OFFSET] as const),
        Object.freeze([-LATERAL_OFFSET, LATERAL_OFFSET] as const),
        Object.freeze([LATERAL_OFFSET, -LATERAL_OFFSET] as const)
      ]);

      for (const [outsideOffset, insideOffset] of lanePairs) {
        const outside = outsideBase.add(
          lateral.scale(outsideOffset)
        );
        const inside = insideBase.add(
          lateral.scale(insideOffset)
        );
        for (const [from, to] of [
          [outside, inside],
          [inside, outside]
        ] as const) {
          for (const dash of [false, true]) {
            for (
              let repetition = 0;
              repetition < REPETITIONS;
              repetition += 1
            ) {
              attempts += 1;
              const result = runCrossing(
                controller,
                input,
                from,
                to,
                dash
              );
              maximumStalledFrames = Math.max(
                maximumStalledFrames,
                result.maximumStalledFrames
              );
              maximumAirborneFrames = Math.max(
                maximumAirborneFrames,
                result.airborneFrames
              );
              if (
                !result.reached ||
                result.maximumStalledFrames >
                  MAX_STALLED_FRAMES ||
                result.airborneFrames > MAX_AIRBORNE_FRAMES
              ) {
                failures += 1;
              }
            }
          }
        }
      }
    }
  } finally {
    controller.dispose();
    camera.dispose();
  }

  return Object.freeze({
    name: "実player controllerで両階の敷居を反復通過",
    ok:
      attempts ===
        elevator.stops.length *
          5 *
          2 *
          2 *
          REPETITIONS &&
      failures === 0 &&
      repeatedRevisionPreservedSurroundingMeshes &&
      revisionUpdateReplacedSurroundingMeshes,
    detail:
      `attempts=${attempts} / failures=${failures} / ` +
      `stall=${maximumStalledFrames} / airborne=${maximumAirborneFrames} / ` +
      `sameRevision=${repeatedRevisionPreservedSurroundingMeshes} / ` +
      `newRevision=${revisionUpdateReplacedSurroundingMeshes}`
  });
};
