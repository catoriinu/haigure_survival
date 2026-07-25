import { Vector3 } from "@babylonjs/core";

import {
  cloneNavigationLocation,
  type NavigationLocation,
  type NavigationPath,
  type NavigationPathStep,
  type NavigationTransitionStep,
  type NavigationWorld
} from "./navigationWorld";
import type { StageMoverKind } from "./stageLinks";

export type NavigationAgentConfig = Readonly<{
  projectionMaxDistance: number;
  targetMoveThreshold: number;
  pathRefreshIntervalSeconds: number;
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
  transition: NavigationTransitionStep | null;
}>;

export interface NavigationAgent {
  update(
    currentLocation: NavigationLocation,
    targetPosition: Vector3,
    speed: number,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ): NavigationAgentStepResult;
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
  assertPositiveFiniteNumber("標的移動再探索閾値", config.targetMoveThreshold);
  assertPositiveFiniteNumber(
    "経路再探索間隔",
    config.pathRefreshIntervalSeconds
  );
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
  private readonly config: NavigationAgentConfig;
  private path: readonly NavigationPathStep[] | null = null;
  private resolvedTarget: NavigationLocation | null = null;
  private nextStepIndex = 0;
  private nextPointIndex = 0;
  private plannedTarget: Vector3 | null = null;
  private secondsSincePathSearch = 0;
  private stuckAnchor: Vector3 | null = null;
  private stuckElapsedSeconds = 0;

  constructor(
    navigationWorld: NavigationWorld,
    moverKind: StageMoverKind,
    config: NavigationAgentConfig
  ) {
    assertConfig(config);
    this.navigationWorld = navigationWorld;
    this.moverKind = moverKind;
    this.config = Object.freeze({ ...config });
    this.secondsSincePathSearch = config.pathRefreshIntervalSeconds;
  }

  update(
    currentLocation: NavigationLocation,
    targetPosition: Vector3,
    speed: number,
    deltaSeconds: number,
    allowPathRecalculation: boolean
  ): NavigationAgentStepResult {
    assertNavigationLocation("経路追従の現在位置", currentLocation);
    assertFiniteVector("経路追従の標的位置", targetPosition);
    assertNonNegativeFiniteNumber("経路追従速度", speed);
    assertNonNegativeFiniteNumber("経路追従deltaSeconds", deltaSeconds);
    if (typeof allowPathRecalculation !== "boolean") {
      throw new Error("経路再計画許可にはbooleanが必要です。");
    }

    this.secondsSincePathSearch += deltaSeconds;
    if (!Number.isFinite(this.secondsSincePathSearch)) {
      throw new Error("経路再探索までの経過時間が有限値になりません。");
    }

    const stuck = this.detectStuck(currentLocation, speed, deltaSeconds);
    const targetMoved =
      this.plannedTarget !== null &&
      Vector3.Distance(this.plannedTarget, targetPosition) >=
        this.config.targetMoveThreshold;
    const pathConsumedAwayFromEndpoint =
      this.path !== null &&
      this.resolvedTarget !== null &&
      this.nextStepIndex >= this.path.length &&
      Vector3.Distance(currentLocation.position, this.resolvedTarget.position) >
        this.config.waypointTolerance;
    const refreshExpired =
      this.secondsSincePathSearch >= this.config.pathRefreshIntervalSeconds;
    const mustSearch =
      this.plannedTarget === null ||
      targetMoved ||
      pathConsumedAwayFromEndpoint ||
      refreshExpired ||
      stuck;

    let pathRecalculated = false;
    if (mustSearch && allowPathRecalculation) {
      pathRecalculated = true;
      this.searchPath(currentLocation, targetPosition);
    }

    if (!this.path) {
      return {
        location: cloneNavigationLocation(currentLocation),
        state:
          mustSearch && !allowPathRecalculation
            ? "waiting-for-path"
            : "unreachable",
        pathRecalculated,
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
            transition: null
          };
        }
        return {
          location,
          state: "transition-required",
          pathRecalculated,
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
            transition: null
          };
        }
        const stepDistance = Math.min(remainingDistance, distance);
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
            transition: null
          };
        }
        assertNavigationLocation("NavMesh移動拘束結果", constrainedLocation);
        const actualDistance = Vector3.Distance(
          location.position,
          constrainedLocation.position
        );
        if (actualDistance > stepDistance + this.config.waypointTolerance) {
          throw new Error("NavMesh移動拘束結果が指定移動距離を超えました。");
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
        (targetMoved || pathConsumedAwayFromEndpoint)
          ? "waiting-for-path"
          : "arrived",
      pathRecalculated,
      transition: null
    };
  }

  clear() {
    this.path = null;
    this.resolvedTarget = null;
    this.nextStepIndex = 0;
    this.nextPointIndex = 0;
    this.plannedTarget = null;
    this.secondsSincePathSearch = this.config.pathRefreshIntervalSeconds;
    this.stuckAnchor = null;
    this.stuckElapsedSeconds = 0;
  }

  private searchPath(
    currentLocation: NavigationLocation,
    targetPosition: Vector3
  ) {
    const projectedTarget = this.navigationWorld.projectPoint(
      targetPosition,
      this.config.projectionMaxDistance
    );
    const result = projectedTarget
      ? this.navigationWorld.findPath(
          currentLocation,
          projectedTarget,
          this.moverKind
        )
      : null;
    this.path = result ? cloneAndValidatePath(result) : null;
    this.resolvedTarget = result
      ? cloneNavigationLocation(result.destination)
      : null;
    this.nextStepIndex = 0;
    this.nextPointIndex = 0;
    this.plannedTarget = targetPosition.clone();
    this.secondsSincePathSearch = 0;
    this.stuckAnchor = currentLocation.position.clone();
    this.stuckElapsedSeconds = 0;
  }

  private invalidatePath() {
    this.path = null;
    this.resolvedTarget = null;
    this.nextStepIndex = 0;
    this.nextPointIndex = 0;
    this.secondsSincePathSearch = 0;
    this.stuckAnchor = null;
    this.stuckElapsedSeconds = 0;
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
  config: NavigationAgentConfig
): NavigationAgent => new CachedNavigationAgent(navigationWorld, moverKind, config);
