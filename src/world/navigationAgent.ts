import { Vector3 } from "@babylonjs/core";

import {
  cloneNavigationLocation,
  type NavigationLocation,
  type NavigationPath,
  type NavigationPathStep,
  type NavigationRoutePolicy,
  type NavigationTransitionStep,
  type NavigationWorld
} from "./navigationWorld";
import type { StageMoverKind } from "./stageLinks";

export type NavigationAgentConfig = Readonly<{
  projectionMaxDistance: number;
  waypointTolerance: number;
  stuckDistanceThreshold: number;
  stuckDurationSeconds: number;
}>;

export type NavigationAgentState =
  | "moving"
  | "arrived"
  | "unreachable"
  | "waiting-for-path"
  | "transition-required";

export type NavigationAgentStepResult = Readonly<{
  location: NavigationLocation;
  state: NavigationAgentState;
  pathRecalculated: boolean;
  pathDistance: number | null;
  remainingPathDistance: number | null;
  transition: NavigationTransitionStep | null;
}>;

export interface NavigationAgent {
  readonly stuckRevision: number;
  update(
    currentLocation: NavigationLocation,
    targetPosition: Vector3,
    goalRevision: number,
    speed: number,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ): NavigationAgentStepResult;
  completeTransition(location: NavigationLocation): void;
  clear(): void;
}

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3D座標が必要です。`);
  }
};

const assertNavigationLocation = (name: string, value: NavigationLocation) => {
  assertFiniteVector(`${name}の座標`, value.position);
  if (!Number.isInteger(value.polygonRef) || value.polygonRef <= 0) {
    throw new Error(`${name}には有効なNavMesh面IDが必要です。`);
  }
};

const assertPositiveFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}には正の有限値が必要です。`);
  }
};

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const assertConfig = (config: NavigationAgentConfig) => {
  assertPositiveFiniteNumber("NavMesh投影最大距離", config.projectionMaxDistance);
  assertPositiveFiniteNumber("経路点到達許容値", config.waypointTolerance);
  assertPositiveFiniteNumber(
    "停止判定移動距離",
    config.stuckDistanceThreshold
  );
  assertPositiveFiniteNumber("停止判定時間", config.stuckDurationSeconds);
};

const cloneAndValidatePath = (path: NavigationPath): readonly NavigationPathStep[] => {
  if (path.steps.length === 0) {
    throw new Error("NavigationWorld.findPath()は1区間以上の経路を返す必要があります。");
  }
  if (!Number.isFinite(path.distance) || path.distance < 0) {
    throw new Error("NavigationWorld.findPath()の経路距離が不正です。");
  }
  return Object.freeze(
    path.steps.map((step, stepIndex) => {
      if (!Number.isFinite(step.distance) || step.distance < 0) {
        throw new Error(`経路区間${stepIndex}の距離が不正です。`);
      }
      if (step.kind === "surface") {
        if (step.points.length === 0) {
          throw new Error(`床・階段区間${stepIndex}に経路点がありません。`);
        }
        return Object.freeze({
          kind: "surface" as const,
          points: Object.freeze(
            step.points.map((point, pointIndex) => {
              assertNavigationLocation(`経路区間${stepIndex}の点${pointIndex}`, point);
              return cloneNavigationLocation(point);
            })
          ),
          distance: step.distance
        });
      }
      assertNavigationLocation(`特殊接続${stepIndex}の入口`, step.entry);
      assertNavigationLocation(`特殊接続${stepIndex}の出口`, step.exit);
      return Object.freeze({
        kind: "transition" as const,
        link: step.link,
        from: step.from,
        to: step.to,
        entry: cloneNavigationLocation(step.entry),
        exit: cloneNavigationLocation(step.exit),
        distance: step.distance
      });
    })
  );
};

class CachedNavigationAgent implements NavigationAgent {
  private readonly navigationWorld: NavigationWorld;
  private readonly moverKind: StageMoverKind;
  private readonly routePolicy: NavigationRoutePolicy;
  private readonly config: NavigationAgentConfig;
  private path: readonly NavigationPathStep[] | null = null;
  private resolvedTarget: NavigationLocation | null = null;
  private pathDistance: number | null = null;
  private nextStepIndex = 0;
  private nextPointIndex = 0;
  private plannedGoalRevision: number | null = null;
  private stuckAnchor: Vector3 | null = null;
  private stuckElapsedSeconds = 0;
  private currentStuckRevision = 0;
  private stuckSignaled = false;
  private pendingTransition: NavigationTransitionStep | null = null;

  constructor(
    navigationWorld: NavigationWorld,
    moverKind: StageMoverKind,
    routePolicy: NavigationRoutePolicy,
    config: NavigationAgentConfig
  ) {
    assertConfig(config);
    this.navigationWorld = navigationWorld;
    this.moverKind = moverKind;
    this.routePolicy = routePolicy;
    this.config = Object.freeze({ ...config });
  }

  get stuckRevision() {
    return this.currentStuckRevision;
  }

  update(
    currentLocation: NavigationLocation,
    targetPosition: Vector3,
    goalRevision: number,
    speed: number,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ): NavigationAgentStepResult {
    assertNavigationLocation("経路追従の現在位置", currentLocation);
    assertFiniteVector("経路追従の標的位置", targetPosition);
    if (!Number.isInteger(goalRevision) || goalRevision < 0) {
      throw new Error("経路追従goalRevisionには0以上の整数が必要です。");
    }
    assertNonNegativeFiniteNumber("経路追従速度", speed);
    assertNonNegativeFiniteNumber("経路追従deltaSeconds", deltaSeconds);
    if (typeof allowPathRecalculation !== "boolean") {
      throw new Error("経路再計画許可にはbooleanが必要です。");
    }

    if (this.pendingTransition) {
      const currentStep = this.path?.[this.nextStepIndex] ?? null;
      if (
        !currentStep ||
        currentStep.kind !== "transition" ||
        currentStep !== this.pendingTransition
      ) {
        throw new Error("実行待ち特殊接続と経路状態が一致しません。");
      }
      return {
        location: cloneNavigationLocation(currentLocation),
        state: "transition-required",
        pathRecalculated: false,
        pathDistance: this.pathDistance,
        remainingPathDistance: this.calculateRemainingPathDistance(currentLocation),
        transition: this.pendingTransition
      };
    }

    const stuck = this.detectStuck(currentLocation, speed, deltaSeconds);
    if (stuck && !this.stuckSignaled) {
      this.currentStuckRevision += 1;
      this.stuckSignaled = true;
    } else if (!stuck) {
      this.stuckSignaled = false;
    }
    const goalChanged = this.plannedGoalRevision !== goalRevision;
    const pathConsumedAwayFromEndpoint =
      this.path !== null &&
      this.resolvedTarget !== null &&
      this.nextStepIndex >= this.path.length &&
      Vector3.Distance(currentLocation.position, this.resolvedTarget.position) >
        this.config.waypointTolerance;
    const mustSearch =
      goalChanged ||
      pathConsumedAwayFromEndpoint ||
      stuck;

    let pathRecalculated = false;
    if (mustSearch && allowPathRecalculation) {
      pathRecalculated = true;
      this.searchPath(currentLocation, targetPosition, goalRevision);
    }

    if (!this.path) {
      return {
        location: cloneNavigationLocation(currentLocation),
        state:
          mustSearch && !allowPathRecalculation
            ? "waiting-for-path"
            : "unreachable",
        pathRecalculated,
        pathDistance: this.pathDistance,
        remainingPathDistance: null,
        transition: null
      };
    }

    const movementBudget = speed * deltaSeconds;
    if (!Number.isFinite(movementBudget)) {
      throw new Error("経路追従の移動距離が有限値になりません。");
    }

    let location = cloneNavigationLocation(currentLocation);
    let remainingDistance = movementBudget;
    while (this.nextStepIndex < this.path.length) {
      const step = this.path[this.nextStepIndex];
      if (step.kind === "transition") {
        if (
          Vector3.Distance(location.position, step.entry.position) >
          this.config.waypointTolerance
        ) {
          this.invalidatePath();
          return {
            location: cloneNavigationLocation(currentLocation),
            state: "unreachable",
            pathRecalculated,
            pathDistance: this.pathDistance,
            remainingPathDistance: null,
            transition: null
          };
        }
        this.pendingTransition = step;
        return {
          location,
          state: "transition-required",
          pathRecalculated,
          pathDistance: this.pathDistance,
          remainingPathDistance: this.calculateRemainingPathDistance(location),
          transition: step
        };
      }

      while (this.nextPointIndex < step.points.length) {
        const nextPoint = step.points[this.nextPointIndex];
        const distance = Vector3.Distance(location.position, nextPoint.position);
        if (distance <= this.config.waypointTolerance) {
          this.nextPointIndex += 1;
          continue;
        }
        if (remainingDistance === 0) {
          return {
            location,
            state: "moving",
            pathRecalculated,
            pathDistance: this.pathDistance,
            remainingPathDistance: this.calculateRemainingPathDistance(location),
            transition: null
          };
        }
        const isIntermediatePoint =
          this.nextPointIndex < step.points.length - 1;
        // 中間点はNavMesh面の境界上なので、許容差内の面側から次の点へ進む。
        const approachDistance = isIntermediatePoint
          ? distance - this.config.waypointTolerance * 0.5
          : distance;
        const stepDistance = Math.min(remainingDistance, approachDistance);
        const desiredPosition = location.position.add(
          nextPoint.position.subtract(location.position).scale(stepDistance / distance)
        );
        const constrainedLocation = this.navigationWorld.constrainMovement(
          location,
          desiredPosition
        );
        if (!constrainedLocation) {
          this.invalidatePath();
          return {
            location: cloneNavigationLocation(currentLocation),
            state: "unreachable",
            pathRecalculated,
            pathDistance: this.pathDistance,
            remainingPathDistance: null,
            transition: null
          };
        }
        assertNavigationLocation("NavMesh移動拘束結果", constrainedLocation);
        const actualHorizontalDistance = Math.hypot(
          constrainedLocation.position.x - location.position.x,
          constrainedLocation.position.z - location.position.z
        );
        if (
          actualHorizontalDistance >
          stepDistance + this.config.waypointTolerance
        ) {
          throw new Error(
            "NavMesh移動拘束結果が指定水平移動距離を超えました。 " +
              `actualHorizontal=${actualHorizontalDistance}, ` +
              `requested=${stepDistance}, ` +
              `tolerance=${this.config.waypointTolerance}, ` +
              `from=${location.position.toString()}, ` +
              `desired=${desiredPosition.toString()}, ` +
              `constrained=${constrainedLocation.position.toString()}`
          );
        }
        location = constrainedLocation;
        remainingDistance -= stepDistance;
        if (
          Vector3.Distance(location.position, nextPoint.position) <=
          this.config.waypointTolerance
        ) {
          this.nextPointIndex += 1;
          continue;
        }
        return {
          location,
          state: "moving",
          pathRecalculated,
          pathDistance: this.pathDistance,
          remainingPathDistance: this.calculateRemainingPathDistance(location),
          transition: null
        };
      }

      this.nextStepIndex += 1;
      this.nextPointIndex = 0;
    }

    return {
      location,
      state:
        !allowPathRecalculation &&
        (goalChanged || pathConsumedAwayFromEndpoint)
          ? "waiting-for-path"
          : "arrived",
      pathRecalculated,
      pathDistance: this.pathDistance,
      remainingPathDistance: 0,
      transition: null
    };
  }

  completeTransition(location: NavigationLocation) {
    assertNavigationLocation("特殊接続完了位置", location);
    const pending = this.pendingTransition;
    const currentStep = this.path?.[this.nextStepIndex] ?? null;
    if (
      !pending ||
      !currentStep ||
      currentStep.kind !== "transition" ||
      currentStep !== pending
    ) {
      throw new Error("完了対象の特殊接続がありません。");
    }
    if (
      location.polygonRef !== pending.exit.polygonRef ||
      Vector3.Distance(location.position, pending.exit.position) >
        this.config.waypointTolerance
    ) {
      throw new Error("特殊接続完了位置が予定出口と一致しません。");
    }

    this.nextStepIndex += 1;
    this.nextPointIndex = 0;
    this.pendingTransition = null;
    this.stuckAnchor = location.position.clone();
    this.stuckElapsedSeconds = 0;
    this.stuckSignaled = false;
  }

  clear() {
    this.path = null;
    this.resolvedTarget = null;
    this.pathDistance = null;
    this.nextStepIndex = 0;
    this.nextPointIndex = 0;
    this.plannedGoalRevision = null;
    this.stuckAnchor = null;
    this.stuckElapsedSeconds = 0;
    this.stuckSignaled = false;
    this.pendingTransition = null;
  }

  private searchPath(
    currentLocation: NavigationLocation,
    targetPosition: Vector3,
    goalRevision: number
  ) {
    const projectedTarget = this.navigationWorld.projectPoint(
      targetPosition,
      this.config.projectionMaxDistance
    );
    const result = projectedTarget
      ? this.navigationWorld.findPath(
          currentLocation,
          projectedTarget,
          this.moverKind,
          this.routePolicy
        )
      : null;
    this.path = result ? cloneAndValidatePath(result) : null;
    this.pathDistance = result?.distance ?? null;
    this.resolvedTarget = result
      ? cloneNavigationLocation(result.destination)
      : null;
    this.nextStepIndex = 0;
    this.nextPointIndex = 0;
    this.plannedGoalRevision = goalRevision;
    this.stuckAnchor = currentLocation.position.clone();
    this.stuckElapsedSeconds = 0;
    this.stuckSignaled = false;
    this.pendingTransition = null;
  }

  private invalidatePath() {
    this.path = null;
    this.resolvedTarget = null;
    this.pathDistance = null;
    this.nextStepIndex = 0;
    this.nextPointIndex = 0;
    this.plannedGoalRevision = null;
    this.stuckAnchor = null;
    this.stuckElapsedSeconds = 0;
    this.stuckSignaled = false;
    this.pendingTransition = null;
  }

  private calculateRemainingPathDistance(
    currentLocation: NavigationLocation
  ): number | null {
    if (!this.path) {
      return null;
    }

    let distance = 0;
    let cursor = currentLocation.position;
    for (
      let stepIndex = this.nextStepIndex;
      stepIndex < this.path.length;
      stepIndex += 1
    ) {
      const step = this.path[stepIndex];
      if (step.kind === "transition") {
        distance += Vector3.Distance(cursor, step.entry.position);
        distance += step.distance;
        cursor = step.exit.position;
        continue;
      }

      const firstPointIndex =
        stepIndex === this.nextStepIndex ? this.nextPointIndex : 0;
      for (
        let pointIndex = firstPointIndex;
        pointIndex < step.points.length;
        pointIndex += 1
      ) {
        const point = step.points[pointIndex].position;
        distance += Vector3.Distance(cursor, point);
        cursor = point;
      }
    }
    return distance;
  }

  private detectStuck(
    currentLocation: NavigationLocation,
    speed: number,
    deltaSeconds: number
  ) {
    const nextStep = this.path?.[this.nextStepIndex] ?? null;
    if (!nextStep || nextStep.kind === "transition" || speed === 0) {
      this.stuckAnchor = currentLocation.position.clone();
      this.stuckElapsedSeconds = 0;
      return false;
    }
    if (!this.stuckAnchor) {
      this.stuckAnchor = currentLocation.position.clone();
      this.stuckElapsedSeconds = 0;
      return false;
    }
    if (
      Vector3.Distance(this.stuckAnchor, currentLocation.position) >
      this.config.stuckDistanceThreshold
    ) {
      this.stuckAnchor.copyFrom(currentLocation.position);
      this.stuckElapsedSeconds = 0;
      return false;
    }

    this.stuckElapsedSeconds += deltaSeconds;
    return this.stuckElapsedSeconds >= this.config.stuckDurationSeconds;
  }
}

export const createNavigationAgent = (
  navigationWorld: NavigationWorld,
  moverKind: StageMoverKind,
  routePolicy: NavigationRoutePolicy,
  config: NavigationAgentConfig
): NavigationAgent =>
  new CachedNavigationAgent(
    navigationWorld,
    moverKind,
    routePolicy,
    config
  );
