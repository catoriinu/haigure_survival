import { Mesh, Ray, Scene, Vector3 } from "@babylonjs/core";

export type PlayerVerticalState = {
  grounded: boolean;
  verticalVelocity: number;
  supportY: number | null;
};

export type PlayerHeightSnapshot = PlayerVerticalState & {
  supportMeshName: string | null;
  supportNormalY: number | null;
};

export type PlayerHeightConfig = {
  gravity: number;
  maxStepHeight: number;
  groundTolerance: number;
  groundSnapDistance: number;
  minGroundNormalY: number;
};

export type PlayerHeightFrameResult = {
  actualHorizontalDisplacement: Vector3;
  state: PlayerVerticalState;
  supportMeshName: string | null;
};

export type PlayerHeightController = {
  reset: () => void;
  getState: () => PlayerVerticalState;
  getSupportMeshName: () => string | null;
  capture: (snapshot: PlayerHeightSnapshot) => void;
  restore: (snapshot: PlayerHeightSnapshot) => void;
  resync: (
    collisionMesh: Mesh,
    stageColliders: ReadonlySet<Mesh>
  ) => PlayerVerticalState;
  move: (
    collisionMesh: Mesh,
    horizontalDisplacement: Vector3,
    delta: number,
    stageColliders: ReadonlySet<Mesh>
  ) => PlayerHeightFrameResult;
};

type GroundSupport = {
  y: number;
  meshName: string;
  normalY: number;
};

export const createPlayerHeightController = (
  scene: Scene,
  {
    gravity,
    maxStepHeight,
    groundTolerance,
    groundSnapDistance,
    minGroundNormalY
  }: PlayerHeightConfig
): PlayerHeightController => {
  const state: PlayerVerticalState = {
    grounded: false,
    verticalVelocity: 0,
    supportY: null
  };
  const supportRay = new Ray(Vector3.Zero(), new Vector3(0, -1, 0), 0);
  const startPosition = Vector3.Zero();
  const normalPosition = Vector3.Zero();
  const actualHorizontalDisplacement = Vector3.Zero();
  const stepDirection = Vector3.Zero();
  const stepLookAhead = Vector3.Zero();
  const supportProbePosition = Vector3.Zero();
  const verticalDisplacement = Vector3.Zero();
  const groundedDisplacement = Vector3.Zero();
  const continuousMoveDirection = Vector3.Zero();
  const horizontalProgressTolerance = 0.000001;
  let supportMeshName: string | null = null;
  let supportNormalY: number | null = null;

  const copyState = (): PlayerVerticalState => ({ ...state });

  const moveWithUpdatedWorld = (
    collisionMesh: Mesh,
    displacement: Vector3
  ) => {
    collisionMesh.computeWorldMatrix(true);
    collisionMesh.moveWithCollisions(displacement);
  };

  const findSupport = (
    position: Vector3,
    stageColliders: ReadonlySet<Mesh>,
    upwardReach: number,
    downwardReach: number
  ): GroundSupport | null => {
    supportRay.origin.set(position.x, position.y + upwardReach, position.z);
    supportRay.length = upwardReach + downwardReach;
    const hit = scene.pickWithRay(
      supportRay,
      (mesh) => stageColliders.has(mesh as Mesh),
      false
    );
    if (!hit?.hit || !hit.pickedPoint || !hit.pickedMesh) {
      return null;
    }
    const normal = hit.getNormal(true, false);
    if (!normal || normal.y < minGroundNormalY) {
      return null;
    }
    return {
      y: hit.pickedPoint.y,
      meshName: hit.pickedMesh.name,
      normalY: normal.y
    };
  };

  const updateGroundState = (
    collisionMesh: Mesh,
    stageColliders: ReadonlySet<Mesh>
  ) => {
    const support = findSupport(
      collisionMesh.position,
      stageColliders,
      maxStepHeight + groundTolerance,
      groundSnapDistance
    );
    state.grounded = support !== null;
    state.supportY = support?.y ?? null;
    supportMeshName = support?.meshName ?? null;
    supportNormalY = support?.normalY ?? null;
    if (state.grounded) {
      state.verticalVelocity = 0;
    }
  };

  const findContinuousSupport = (
    position: Vector3,
    direction: Vector3,
    distance: number,
    stageColliders: ReadonlySet<Mesh>,
    initialSupportY: number
  ): GroundSupport | null => {
    const sampleCount = Math.ceil(distance / maxStepHeight);
    let previousSupportY = initialSupportY;
    let support: GroundSupport | null = null;
    for (let sample = 1; sample <= sampleCount; sample += 1) {
      supportProbePosition.copyFrom(direction);
      supportProbePosition.scaleInPlace((distance * sample) / sampleCount);
      supportProbePosition.addInPlace(position);
      supportProbePosition.y = previousSupportY + groundTolerance;
      support = findSupport(
        supportProbePosition,
        stageColliders,
        maxStepHeight + groundTolerance,
        groundSnapDistance
      );
      if (
        !support ||
        support.y - previousSupportY > maxStepHeight + groundTolerance ||
        previousSupportY - support.y > groundSnapDistance
      ) {
        return null;
      }
      previousSupportY = support.y;
    }
    return support;
  };

  const snapDown = (
    collisionMesh: Mesh,
    stageColliders: ReadonlySet<Mesh>,
    downwardReach = groundSnapDistance
  ) => {
    const support = findSupport(
      collisionMesh.position,
      stageColliders,
      maxStepHeight + groundTolerance,
      downwardReach
    );
    if (!support) {
      state.grounded = false;
      state.supportY = null;
      supportMeshName = null;
      supportNormalY = null;
      return;
    }
    const horizontalX = collisionMesh.position.x;
    const horizontalZ = collisionMesh.position.z;
    verticalDisplacement.set(0, -downwardReach, 0);
    moveWithUpdatedWorld(collisionMesh, verticalDisplacement);
    collisionMesh.position.x = horizontalX;
    collisionMesh.position.z = horizontalZ;
    collisionMesh.computeWorldMatrix(true);
    updateGroundState(collisionMesh, stageColliders);
  };

  const tryStepUp = (
    collisionMesh: Mesh,
    horizontalDisplacement: Vector3,
    stageColliders: ReadonlySet<Mesh>,
    normalHorizontalProgress: number,
    initialSupportY: number
  ) => {
    const requestedDistance = Math.hypot(
      horizontalDisplacement.x,
      horizontalDisplacement.z
    );
    if (requestedDistance <= horizontalProgressTolerance) {
      return false;
    }
    const normalState = copyState();
    const normalSupportMeshName = supportMeshName;
    const normalSupportNormalY = supportNormalY;
    const restoreNormalState = () => {
      collisionMesh.position.copyFrom(normalPosition);
      state.grounded = normalState.grounded;
      state.verticalVelocity = normalState.verticalVelocity;
      state.supportY = normalState.supportY;
      supportMeshName = normalSupportMeshName;
      supportNormalY = normalSupportNormalY;
    };
    stepLookAhead.copyFrom(horizontalDisplacement);
    stepLookAhead.y = 0;
    stepLookAhead.normalize();
    const lookAheadDistance =
      collisionMesh.ellipsoid.x + requestedDistance + groundTolerance;
    stepDirection.copyFrom(stepLookAhead);
    stepLookAhead.scaleInPlace(lookAheadDistance);
    stepLookAhead.addInPlace(startPosition);
    const candidateSupport = findSupport(
      stepLookAhead,
      stageColliders,
      lookAheadDistance,
      groundSnapDistance
    );
    if (!candidateSupport) {
      return false;
    }
    const candidateRise = candidateSupport.y - initialSupportY;
    if (candidateRise > maxStepHeight + groundTolerance) {
      if (
        candidateSupport.normalY >= 0.9999 &&
        (supportNormalY === null || supportNormalY >= 0.9999)
      ) {
        return false;
      }
      const continuousSupport = findContinuousSupport(
        startPosition,
        stepDirection,
        lookAheadDistance,
        stageColliders,
        initialSupportY
      );
      if (
        !continuousSupport ||
        Math.abs(continuousSupport.y - candidateSupport.y) > groundTolerance
      ) {
        return false;
      }
    }
    const candidateHeight = candidateSupport.y - startPosition.y;
    if (candidateHeight < -groundSnapDistance) {
      return false;
    }

    collisionMesh.position.copyFrom(startPosition);
    const liftHeight = Math.max(0, candidateHeight + groundTolerance);
    if (liftHeight > 0) {
      verticalDisplacement.set(0, liftHeight, 0);
      moveWithUpdatedWorld(collisionMesh, verticalDisplacement);
    }
    const climbedHeight = collisionMesh.position.y - startPosition.y;
    if (climbedHeight < liftHeight - groundTolerance) {
      restoreNormalState();
      return false;
    }

    const raisedPosition = collisionMesh.position.clone();
    moveWithUpdatedWorld(collisionMesh, horizontalDisplacement);
    const steppedHorizontalProgress =
      ((collisionMesh.position.x - raisedPosition.x) *
        horizontalDisplacement.x +
        (collisionMesh.position.z - raisedPosition.z) *
          horizontalDisplacement.z) /
      requestedDistance;
    if (
      normalState.grounded &&
      steppedHorizontalProgress <=
      normalHorizontalProgress + horizontalProgressTolerance
    ) {
      restoreNormalState();
      return false;
    }
    const steppedPosition = collisionMesh.position.clone();
    snapDown(
      collisionMesh,
      stageColliders,
      liftHeight + groundSnapDistance
    );
    const finalHorizontalProgress =
      ((collisionMesh.position.x - startPosition.x) *
        horizontalDisplacement.x +
        (collisionMesh.position.z - startPosition.z) *
          horizontalDisplacement.z) /
      requestedDistance;
    if (
      state.grounded &&
      (!normalState.grounded ||
        finalHorizontalProgress >
          normalHorizontalProgress + horizontalProgressTolerance)
    ) {
      return true;
    }
    collisionMesh.position.copyFrom(steppedPosition);
    state.grounded = true;
    state.verticalVelocity = 0;
    state.supportY = candidateSupport.y;
    supportMeshName = candidateSupport.meshName;
    supportNormalY = candidateSupport.normalY;
    return true;
  };

  const reset = () => {
    state.grounded = false;
    state.verticalVelocity = 0;
    state.supportY = null;
    supportMeshName = null;
    supportNormalY = null;
  };

  const capture = (snapshot: PlayerHeightSnapshot) => {
    snapshot.grounded = state.grounded;
    snapshot.verticalVelocity = state.verticalVelocity;
    snapshot.supportY = state.supportY;
    snapshot.supportMeshName = supportMeshName;
    snapshot.supportNormalY = supportNormalY;
  };

  const restore = (snapshot: PlayerHeightSnapshot) => {
    state.grounded = snapshot.grounded;
    state.verticalVelocity = snapshot.verticalVelocity;
    state.supportY = snapshot.supportY;
    supportMeshName = snapshot.supportMeshName;
    supportNormalY = snapshot.supportNormalY;
  };

  const resolveGroundedDisplacement = (
    horizontalDisplacement: Vector3,
    stageColliders: ReadonlySet<Mesh>,
    initialSupportY: number
  ) => {
    const requestedDistance = Math.hypot(
      horizontalDisplacement.x,
      horizontalDisplacement.z
    );
    if (
      requestedDistance <= horizontalProgressTolerance ||
      supportNormalY === null
    ) {
      return horizontalDisplacement;
    }
    continuousMoveDirection.copyFrom(horizontalDisplacement);
    continuousMoveDirection.y = 0;
    continuousMoveDirection.normalize();
    const targetSupport = findContinuousSupport(
      startPosition,
      continuousMoveDirection,
      requestedDistance,
      stageColliders,
      initialSupportY
    );
    if (
      !targetSupport ||
      (supportNormalY >= 0.9999 && targetSupport.normalY >= 0.9999)
    ) {
      return horizontalDisplacement;
    }
    groundedDisplacement.copyFrom(horizontalDisplacement);
    groundedDisplacement.y = targetSupport.y - initialSupportY;
    return groundedDisplacement;
  };

  return {
    reset,
    getState: copyState,
    getSupportMeshName: () => supportMeshName,
    capture,
    restore,
    resync: (collisionMesh, stageColliders) => {
      reset();
      collisionMesh.computeWorldMatrix(true);
      const support = findSupport(
        collisionMesh.position,
        stageColliders,
        maxStepHeight + groundTolerance,
        groundSnapDistance
      );
      if (support) {
        const horizontalX = collisionMesh.position.x;
        const horizontalZ = collisionMesh.position.z;
        collisionMesh.position.y = support.y + groundTolerance;
        verticalDisplacement.set(0, -groundTolerance * 2, 0);
        moveWithUpdatedWorld(collisionMesh, verticalDisplacement);
        collisionMesh.position.x = horizontalX;
        collisionMesh.position.z = horizontalZ;
        collisionMesh.computeWorldMatrix(true);
        updateGroundState(collisionMesh, stageColliders);
      } else {
        snapDown(collisionMesh, stageColliders);
      }
      return copyState();
    },
    move: (
      collisionMesh,
      horizontalDisplacement,
      delta,
      stageColliders
    ) => {
      startPosition.copyFrom(collisionMesh.position);
      const wasGrounded = state.grounded;
      const initialSupportY = state.supportY;
      if (horizontalDisplacement.lengthSquared() > 0) {
        const displacement =
          wasGrounded && initialSupportY !== null
            ? resolveGroundedDisplacement(
                horizontalDisplacement,
                stageColliders,
                initialSupportY
              )
            : horizontalDisplacement;
        if (
          displacement === groundedDisplacement ||
          (wasGrounded && supportNormalY !== null && supportNormalY < 0.9999)
        ) {
          const horizontalX = collisionMesh.position.x;
          const horizontalZ = collisionMesh.position.z;
          verticalDisplacement.set(0, groundTolerance, 0);
          moveWithUpdatedWorld(collisionMesh, verticalDisplacement);
          collisionMesh.position.x = horizontalX;
          collisionMesh.position.z = horizontalZ;
          collisionMesh.computeWorldMatrix(true);
        }
        moveWithUpdatedWorld(collisionMesh, displacement);
      }
      normalPosition.copyFrom(collisionMesh.position);
      if (wasGrounded) {
        snapDown(collisionMesh, stageColliders);
        normalPosition.copyFrom(collisionMesh.position);
        const requestedDistance = Math.hypot(
          horizontalDisplacement.x,
          horizontalDisplacement.z
        );
        const normalHorizontalProgress =
          requestedDistance > horizontalProgressTolerance
            ? ((normalPosition.x - startPosition.x) *
                horizontalDisplacement.x +
                (normalPosition.z - startPosition.z) *
                  horizontalDisplacement.z) /
              requestedDistance
            : 0;
        if (
          !state.grounded ||
          normalHorizontalProgress + horizontalProgressTolerance <
            requestedDistance
        ) {
          tryStepUp(
            collisionMesh,
            horizontalDisplacement,
            stageColliders,
            normalHorizontalProgress,
            initialSupportY!
          );
        }
      } else {
        state.verticalVelocity -= gravity * delta;
        verticalDisplacement.set(0, state.verticalVelocity * delta, 0);
        moveWithUpdatedWorld(collisionMesh, verticalDisplacement);
        snapDown(collisionMesh, stageColliders);
      }

      actualHorizontalDisplacement.set(
        collisionMesh.position.x - startPosition.x,
        0,
        collisionMesh.position.z - startPosition.z
      );
      return {
        actualHorizontalDisplacement,
        state: copyState(),
        supportMeshName
      };
    }
  };
};
