import { FreeCamera, Mesh, Scene, Vector3 } from "@babylonjs/core";
import {
  PLAYER_SPRITE_HEIGHT,
  PLAYER_SPRITE_WIDTH
} from "../game/characterSprites";
import {
  createPlayerHeightController,
  type PlayerHeightSnapshot,
  type PlayerVerticalState
} from "../game/playerHeight";
import { createPlayerMotionController } from "../game/playerMotion";
import type {
  DynamicStageSpatialSnapshot
} from "../world/dynamicStageSpatialVariants";
import type { StageSpatialContext } from "../world/stageSpatialContext";
import type { V2PlayerInput } from "./playerInput";

export const V2_PLAYER_BASE_EYE_HEIGHT = 1 / 3;
export const V2_PLAYER_MIN_EYE_HEIGHT_SCALE = 0.5;
export const V2_PLAYER_MAX_EYE_HEIGHT_SCALE = 1.5;

const PLAYER_MOVE_SPEED = 0.02 * Math.sqrt(10);
const PLAYER_DASH_SPEED_MULTIPLIER = 2;
const PLAYER_MOVE_INERTIA_AT_60_FPS = 0.9;
const PLAYER_MOVE_STOP_EPSILON = 0.00001;
const PLAYER_GRAVITY = 2.4525;
const PLAYER_MAX_STEP_HEIGHT = 0.0375;
const PLAYER_GROUND_TOLERANCE = 0.004;
const PLAYER_GROUND_SNAP_DISTANCE = 0.0415;
const PLAYER_MIN_GROUND_NORMAL_Y = Math.SQRT1_2;
const HORIZONTAL_FORWARD_EPSILON_SQUARED = 0.000001;

export type V2PlayerControllerOptions = Readonly<{
  scene: Scene;
  camera: FreeCamera;
  stage: StageSpatialContext;
  input: V2PlayerInput;
  eyeHeightScale?: number;
}>;

export type V2PlayerFrame = Readonly<{
  footPosition: Vector3;
  eyePosition: Vector3;
  verticalState: PlayerVerticalState;
}>;

export type V2PlayerController = {
  update(delta: number, allowMove: boolean): V2PlayerFrame;
  getFootPosition(): Vector3;
  getEyePosition(): Vector3;
  getVerticalState(): PlayerVerticalState;
  setEyeHeightScale(scale: number): void;
  syncStageSpatialSnapshot(snapshot: DynamicStageSpatialSnapshot): void;
  setTransportFootPosition(footPosition: Vector3): void;
  placeAt(footPosition: Vector3, lookAtPosition: Vector3): void;
  resetToSpawn(): void;
  dispose(): void;
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

const assertEyeHeightScale = (scale: number) => {
  if (
    !Number.isFinite(scale) ||
    scale < V2_PLAYER_MIN_EYE_HEIGHT_SCALE ||
    scale > V2_PLAYER_MAX_EYE_HEIGHT_SCALE
  ) {
    throw new Error(
      `eyeHeightScaleは${V2_PLAYER_MIN_EYE_HEIGHT_SCALE}以上${V2_PLAYER_MAX_EYE_HEIGHT_SCALE}以下の有限値が必要です。`
    );
  }
};

const assertDelta = (delta: number) => {
  if (!Number.isFinite(delta) || delta < 0) {
    throw new Error("deltaには0以上の有限値が必要です。");
  }
};

const buildSpawnForward = (
  scene: Scene,
  stage: StageSpatialContext
): Vector3 => {
  const marker = stage.markers.requireSingle("player_spawn");
  const markerWorld = marker.node.computeWorldMatrix(true);
  const forward = Vector3.TransformNormal(
    Vector3.Forward(scene.useRightHandedSystem),
    markerWorld
  );
  forward.y = 0;
  assertFiniteVector("player_spawnのworld前方", forward);
  if (forward.lengthSquared() <= HORIZONTAL_FORWARD_EPSILON_SQUARED) {
    throw new Error("player_spawnのworld前方を水平面へ投影できません。");
  }
  return forward.normalize();
};

export const createV2PlayerController = ({
  scene,
  camera,
  stage,
  input,
  eyeHeightScale: initialEyeHeightScale = 1
}: V2PlayerControllerOptions): V2PlayerController => {
  assertEyeHeightScale(initialEyeHeightScale);
  const initialSpatialSnapshot = stage.dynamicVariants.getSnapshot();
  if (initialSpatialSnapshot.movementColliders.player.length === 0) {
    throw new Error("V2プレイヤーには1個以上のactor colliderが必要です。");
  }

  const spawnMarker = stage.markers.requireSingle("player_spawn");
  const spawnFootPosition = spawnMarker.node.getAbsolutePosition().clone();
  const spawnForward = buildSpawnForward(scene, stage);
  assertFiniteVector("player_spawnのworld位置", spawnFootPosition);
  if (!stage.boundary.contains(spawnFootPosition)) {
    throw new Error("player_spawnがBND_Stageの外側にあります。");
  }

  const groundColliderSet = new Set(initialSpatialSnapshot.groundColliders);
  const collisionMesh = new Mesh("V2PlayerCollision", scene);
  collisionMesh.isVisible = false;
  collisionMesh.isPickable = false;
  collisionMesh.checkCollisions = true;
  collisionMesh.ellipsoid = new Vector3(
    PLAYER_SPRITE_WIDTH * 0.5,
    PLAYER_SPRITE_HEIGHT * 0.5,
    PLAYER_SPRITE_WIDTH * 0.5
  );
  collisionMesh.ellipsoidOffset = new Vector3(
    0,
    PLAYER_SPRITE_HEIGHT * 0.5,
    0
  );
  collisionMesh.surroundingMeshes = [
    ...initialSpatialSnapshot.movementColliders.player
  ];

  const motion = createPlayerMotionController({
    moveInertiaAt60Fps: PLAYER_MOVE_INERTIA_AT_60_FPS,
    moveStopEpsilon: PLAYER_MOVE_STOP_EPSILON
  });
  const height = createPlayerHeightController(scene, {
    gravity: PLAYER_GRAVITY,
    maxStepHeight: PLAYER_MAX_STEP_HEIGHT,
    groundTolerance: PLAYER_GROUND_TOLERANCE,
    groundSnapDistance: PLAYER_GROUND_SNAP_DISTANCE,
    minGroundNormalY: PLAYER_MIN_GROUND_NORMAL_Y
  });

  const frameStartFootPosition = Vector3.Zero();
  const frameStartHeightSnapshot: PlayerHeightSnapshot = {
    grounded: false,
    verticalVelocity: 0,
    supportY: null,
    supportMeshName: null,
    supportNormalY: null
  };
  const cameraHorizontalForward = Vector3.Zero();
  let eyeHeightScale = initialEyeHeightScale;
  let movementYaw = Math.atan2(spawnForward.x, spawnForward.z);
  let synchronizedSpatialRevision =
    initialSpatialSnapshot.revision;
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みのV2PlayerControllerは使用できません。");
    }
  };

  const getEyeHeight = () => V2_PLAYER_BASE_EYE_HEIGHT * eyeHeightScale;

  const getFootPosition = () => collisionMesh.position.clone();

  const getEyePosition = () =>
    new Vector3(
      collisionMesh.position.x,
      collisionMesh.position.y + getEyeHeight(),
      collisionMesh.position.z
    );

  const syncCameraPosition = () => {
    camera.position.copyFrom(getEyePosition());
  };

  const syncStageSpatialSnapshot = (
    snapshot: DynamicStageSpatialSnapshot
  ) => {
    assertActive();
    if (snapshot.revision === synchronizedSpatialRevision) {
      return;
    }
    collisionMesh.surroundingMeshes = [
      ...snapshot.movementColliders.player
    ];
    groundColliderSet.clear();
    for (const collider of snapshot.groundColliders) {
      groundColliderSet.add(collider);
    }
    synchronizedSpatialRevision = snapshot.revision;
  };

  const resyncHeightOrThrow = (operation: string) => {
    const state = height.resync(collisionMesh, groundColliderSet);
    if (!state.grounded) {
      throw new Error(`${operation}でプレイヤーを接地できません。`);
    }
    assertFiniteVector(`${operation}後の足元位置`, collisionMesh.position);
    if (!stage.boundary.contains(collisionMesh.position)) {
      throw new Error(`${operation}後の足元位置がBND_Stageの外側です。`);
    }
    return state;
  };

  const resetToSpawn = () => {
    assertActive();
    input.reset();
    motion.reset();
    collisionMesh.position.copyFrom(spawnFootPosition);
    collisionMesh.computeWorldMatrix(true);
    resyncHeightOrThrow("player_spawnへの再配置");
    camera.rotation.set(0, 0, 0);
    syncCameraPosition();
    camera.setTarget(camera.position.add(spawnForward));
    camera.cameraDirection.set(0, 0, 0);
    movementYaw = Math.atan2(spawnForward.x, spawnForward.z);
  };

  const setTransportFootPosition = (footPosition: Vector3) => {
    assertActive();
    assertFiniteVector("プレイヤー搬送足元", footPosition);
    if (!stage.boundary.contains(footPosition)) {
      throw new Error("プレイヤー搬送足元がBND_Stageの外側です。");
    }
    collisionMesh.position.copyFrom(footPosition);
    collisionMesh.computeWorldMatrix(true);
    syncCameraPosition();
  };

  const placeAt = (
    footPosition: Vector3,
    lookAtPosition: Vector3
  ) => {
    assertActive();
    assertFiniteVector("プレイヤー再配置足元", footPosition);
    assertFiniteVector("プレイヤー再配置注視点", lookAtPosition);
    const horizontalForward = lookAtPosition.subtract(footPosition);
    horizontalForward.y = 0;
    if (
      horizontalForward.lengthSquared() <=
      HORIZONTAL_FORWARD_EPSILON_SQUARED
    ) {
      throw new Error(
        "プレイヤー再配置注視点は足元と異なる水平位置が必要です。"
      );
    }
    horizontalForward.normalize();

    input.reset();
    motion.reset();
    collisionMesh.position.copyFrom(footPosition);
    collisionMesh.computeWorldMatrix(true);
    resyncHeightOrThrow("指定位置への再配置");
    syncCameraPosition();
    camera.setTarget(camera.position.add(horizontalForward));
    camera.cameraDirection.set(0, 0, 0);
    movementYaw = Math.atan2(
      horizontalForward.x,
      horizontalForward.z
    );
  };

  camera.speed = 0;
  camera.checkCollisions = false;
  camera.inputs.removeByType("FreeCameraKeyboardMoveInput");
  resetToSpawn();

  const buildFrame = (): V2PlayerFrame => ({
    footPosition: getFootPosition(),
    eyePosition: getEyePosition(),
    verticalState: height.getState()
  });

  return {
    update: (delta, allowMove) => {
      assertActive();
      assertDelta(delta);
      if (typeof allowMove !== "boolean") {
        throw new Error("allowMoveにはbooleanが必要です。");
      }
      frameStartFootPosition.copyFrom(collisionMesh.position);
      height.capture(frameStartHeightSnapshot);
      if (!stage.boundary.contains(frameStartFootPosition)) {
        throw new Error("V2プレイヤーのフレーム開始位置がBND_Stageの外側です。");
      }

      cameraHorizontalForward.copyFrom(
        camera.getDirection(Vector3.Forward(scene.useRightHandedSystem))
      );
      cameraHorizontalForward.y = 0;
      assertFiniteVector("カメラのworld前方", cameraHorizontalForward);
      if (
        cameraHorizontalForward.lengthSquared() >
        HORIZONTAL_FORWARD_EPSILON_SQUARED
      ) {
        cameraHorizontalForward.normalize();
        movementYaw = Math.atan2(
          cameraHorizontalForward.x,
          cameraHorizontalForward.z
        );
      }

      const moveSpeed = input.isDashPressed()
        ? PLAYER_MOVE_SPEED * PLAYER_DASH_SPEED_MULTIPLIER
        : PLAYER_MOVE_SPEED;
      const requestedDisplacement = motion.update(
        input.getMoveAxes(),
        movementYaw,
        delta,
        allowMove,
        moveSpeed
      );
      const heightFrame = height.move(
        collisionMesh,
        requestedDisplacement,
        delta,
        groundColliderSet
      );

      if (!stage.boundary.contains(collisionMesh.position)) {
        collisionMesh.position.copyFrom(frameStartFootPosition);
        collisionMesh.computeWorldMatrix(true);
        height.restore(frameStartHeightSnapshot);
        motion.reset();
      } else {
        motion.commit(heightFrame.actualHorizontalDisplacement);
      }

      syncCameraPosition();
      return buildFrame();
    },
    getFootPosition: () => {
      assertActive();
      return getFootPosition();
    },
    getEyePosition: () => {
      assertActive();
      return getEyePosition();
    },
    getVerticalState: () => {
      assertActive();
      return height.getState();
    },
    setEyeHeightScale: (scale) => {
      assertActive();
      assertEyeHeightScale(scale);
      eyeHeightScale = scale;
      syncCameraPosition();
    },
    syncStageSpatialSnapshot,
    setTransportFootPosition,
    placeAt,
    resetToSpawn,
    dispose: () => {
      assertActive();
      input.dispose();
      collisionMesh.dispose();
      disposed = true;
    }
  };
};
