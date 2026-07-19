import { Vector3 } from "@babylonjs/core";

import type { NavigationPath, NavigationWorld } from "./navigationWorld";

export type NavigationAgentConfig = Readonly<{
  projectionMaxDistance: number;
  targetMoveThreshold: number;
  pathRefreshIntervalSeconds: number;
  waypointTolerance: number;
  stuckDistanceThreshold: number;
  stuckDurationSeconds: number;
}>;

export type NavigationAgentState = "moving" | "arrived" | "unreachable";

export type NavigationAgentStepResult = Readonly<{
  position: Vector3;
  state: NavigationAgentState;
  pathRecalculated: boolean;
}>;

export interface NavigationAgent {
  update(
    currentPosition: Vector3,
    targetPosition: Vector3,
    speed: number,
    deltaSeconds: number
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

const cloneAndValidatePath = (path: NavigationPath): readonly Vector3[] => {
  if (path.points.length === 0) {
    throw new Error("NavigationWorld.findPath()は1点以上の経路を返す必要があります。");
  }
  if (!Number.isFinite(path.distance) || path.distance < 0) {
    throw new Error("NavigationWorld.findPath()の経路距離が不正です。");
  }
  return Object.freeze(
    path.points.map((point, index) => {
      assertFiniteVector(`経路点${index}`, point);
      return point.clone();
    })
  );
};

class CachedNavigationAgent implements NavigationAgent {
  private readonly navigationWorld: NavigationWorld;
  private readonly config: NavigationAgentConfig;
  private path: readonly Vector3[] | null = null;
  private resolvedTarget: Vector3 | null = null;
  private nextPointIndex = 0;
  private plannedTarget: Vector3 | null = null;
  private secondsSincePathSearch = 0;
  private stuckAnchor: Vector3 | null = null;
  private stuckElapsedSeconds = 0;

  constructor(navigationWorld: NavigationWorld, config: NavigationAgentConfig) {
    assertConfig(config);
    this.navigationWorld = navigationWorld;
    this.config = Object.freeze({ ...config });
    this.secondsSincePathSearch = config.pathRefreshIntervalSeconds;
  }

  update(
    currentPosition: Vector3,
    targetPosition: Vector3,
    speed: number,
    deltaSeconds: number
  ): NavigationAgentStepResult {
    assertFiniteVector("経路追従の現在位置", currentPosition);
    assertFiniteVector("経路追従の標的位置", targetPosition);
    assertNonNegativeFiniteNumber("経路追従速度", speed);
    assertNonNegativeFiniteNumber("経路追従deltaSeconds", deltaSeconds);

    this.secondsSincePathSearch += deltaSeconds;
    if (!Number.isFinite(this.secondsSincePathSearch)) {
      throw new Error("経路再探索までの経過時間が有限値になりません。");
    }

    const stuck = this.detectStuck(currentPosition, speed, deltaSeconds);
    const targetMoved =
      this.plannedTarget !== null &&
      Vector3.Distance(this.plannedTarget, targetPosition) >=
        this.config.targetMoveThreshold;
    const pathConsumedAwayFromEndpoint =
      this.path !== null &&
      this.resolvedTarget !== null &&
      this.nextPointIndex >= this.path.length &&
      Vector3.Distance(currentPosition, this.resolvedTarget) >
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
    if (mustSearch) {
      pathRecalculated = true;
      this.searchPath(currentPosition, targetPosition);
    }

    if (!this.path) {
      return {
        position: currentPosition.clone(),
        state: "unreachable",
        pathRecalculated
      };
    }

    const movementBudget = speed * deltaSeconds;
    if (!Number.isFinite(movementBudget)) {
      throw new Error("経路追従の移動距離が有限値になりません。");
    }

    const position = currentPosition.clone();
    let remainingDistance = movementBudget;
    while (this.nextPointIndex < this.path.length) {
      const nextPoint = this.path[this.nextPointIndex];
      const distance = Vector3.Distance(position, nextPoint);
      if (distance <= this.config.waypointTolerance) {
        this.nextPointIndex += 1;
        continue;
      }
      if (remainingDistance === 0) {
        break;
      }
      const stepDistance = Math.min(remainingDistance, distance);
      const desiredPosition = position.add(
        nextPoint.subtract(position).scale(stepDistance / distance)
      );
      const constrainedPosition = this.navigationWorld.constrainMovement(
        position,
        desiredPosition
      );
      if (!constrainedPosition) {
        this.invalidatePath();
        return {
          position: currentPosition.clone(),
          state: "unreachable",
          pathRecalculated
        };
      }
      assertFiniteVector("NavMesh移動拘束結果", constrainedPosition);
      const actualDistance = Vector3.Distance(position, constrainedPosition);
      if (actualDistance > stepDistance + this.config.waypointTolerance) {
        throw new Error("NavMesh移動拘束結果が指定移動距離を超えました。");
      }
      position.copyFrom(constrainedPosition);
      remainingDistance -= stepDistance;
      if (Vector3.Distance(position, nextPoint) <= this.config.waypointTolerance) {
        this.nextPointIndex += 1;
        continue;
      }
      break;
    }

    const state =
      this.nextPointIndex >= this.path.length ? "arrived" : "moving";
    return { position, state, pathRecalculated };
  }

  clear() {
    this.path = null;
    this.resolvedTarget = null;
    this.nextPointIndex = 0;
    this.plannedTarget = null;
    this.secondsSincePathSearch = this.config.pathRefreshIntervalSeconds;
    this.stuckAnchor = null;
    this.stuckElapsedSeconds = 0;
  }

  private searchPath(currentPosition: Vector3, targetPosition: Vector3) {
    const projectedStart = this.navigationWorld.projectPoint(
      currentPosition,
      this.config.projectionMaxDistance
    );
    const projectedTarget = this.navigationWorld.projectPoint(
      targetPosition,
      this.config.projectionMaxDistance
    );
    const result =
      projectedStart && projectedTarget
        ? this.navigationWorld.findPath(projectedStart, projectedTarget)
        : null;
    this.path = result ? cloneAndValidatePath(result) : null;
    this.resolvedTarget = this.path
      ? this.path[this.path.length - 1].clone()
      : null;
    this.nextPointIndex = 0;
    this.plannedTarget = targetPosition.clone();
    this.secondsSincePathSearch = 0;
    this.stuckAnchor = currentPosition.clone();
    this.stuckElapsedSeconds = 0;
  }

  private invalidatePath() {
    this.path = null;
    this.resolvedTarget = null;
    this.nextPointIndex = 0;
    this.secondsSincePathSearch = 0;
    this.stuckAnchor = null;
    this.stuckElapsedSeconds = 0;
  }

  private detectStuck(
    currentPosition: Vector3,
    speed: number,
    deltaSeconds: number
  ) {
    if (!this.path || this.nextPointIndex >= this.path.length || speed === 0) {
      this.stuckAnchor = currentPosition.clone();
      this.stuckElapsedSeconds = 0;
      return false;
    }
    if (!this.stuckAnchor) {
      this.stuckAnchor = currentPosition.clone();
      this.stuckElapsedSeconds = 0;
      return false;
    }
    if (
      Vector3.Distance(this.stuckAnchor, currentPosition) >
      this.config.stuckDistanceThreshold
    ) {
      this.stuckAnchor.copyFrom(currentPosition);
      this.stuckElapsedSeconds = 0;
      return false;
    }

    this.stuckElapsedSeconds += deltaSeconds;
    return this.stuckElapsedSeconds >= this.config.stuckDurationSeconds;
  }
}

export const createNavigationAgent = (
  navigationWorld: NavigationWorld,
  config: NavigationAgentConfig
): NavigationAgent => new CachedNavigationAgent(navigationWorld, config);
