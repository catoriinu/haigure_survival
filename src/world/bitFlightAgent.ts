import { Vector3 } from "@babylonjs/core";

import {
  cloneBitFlightRoute,
  getBitFlightWorldPosition,
  type BitFlightLocation,
  type BitFlightNavigationWorld,
  type BitFlightRoute,
  type BitFlightRoutePolicy,
  type BitFlightRouteStep,
  type BitFlightTransitionRouteStep,
  type BitFlightTransitionTraversal
} from "./bitFlightNavigation";
import {
  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
  type BitFlightSafety
} from "./bitFlightSafety";
import { cloneNavigationLocation } from "./navigationWorld";
import { BLENDER_METERS_TO_WORLD_UNITS } from "./worldUnits";

export const BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND =
  1 * BLENDER_METERS_TO_WORLD_UNITS;

export type BitFlightAgentConfig = Readonly<{
  waypointTolerance: number;
}>;

export type BitFlightAgentState =
  | "idle"
  | "surface"
  | "transition"
  | "clearing-transition"
  | "arrived"
  | "unreachable"
  | "blocked";

export type BitFlightAgentStepResult = Readonly<{
  state: BitFlightAgentState;
  position: Vector3 | null;
  location: BitFlightLocation | null;
  facingDirection: Vector3 | null;
  transition: BitFlightTransitionTraversal | null;
  routeStepIndex: number;
  routeStepCount: number;
}>;

export interface BitFlightAgent {
  setRoute(
    currentLocation: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ): boolean;
  setPreparedRoute(
    currentLocation: BitFlightLocation,
    route: BitFlightRoute
  ): boolean;
  update(
    surfaceSpeedWorldUnitsPerSecond: number,
    deltaSeconds: number
  ): BitFlightAgentStepResult;
  getSnapshot(): BitFlightAgentStepResult;
  clear(): void;
  dispose(): void;
}

type ActiveTransition = {
  readonly routeStep: BitFlightTransitionRouteStep;
  points: readonly Vector3[];
  nextPointIndex: number;
  endpoint: BitFlightLocation;
  clearing: boolean;
};

const MOVEMENT_EPSILON = 1e-8;

const assertFiniteVector = (label: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${label}には有限の3D座標が必要です。`);
  }
};

const assertNonNegativeFiniteNumber = (label: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}には0以上の有限値が必要です。`);
  }
};

const assertPositiveFiniteNumber = (label: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}には正の有限値が必要です。`);
  }
};

const cloneBitFlightLocation = (
  location: BitFlightLocation
): BitFlightLocation =>
  Object.freeze(
    Object.assign({}, location, {
      surface: cloneNavigationLocation(location.surface),
      heightMode: location.heightMode
    })
  ) as BitFlightLocation;

const sameBand = (
  left: BitFlightLocation,
  right: BitFlightLocation
) => left.zoneId === right.zoneId && left.bandId === right.bandId;

const calculatePathDistance = (points: readonly Vector3[]) => {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += Vector3.Distance(points[index - 1], points[index]);
  }
  return distance;
};

class RouteFollowingBitFlightAgent implements BitFlightAgent {
  private readonly navigationWorld: BitFlightNavigationWorld;
  private readonly safety: BitFlightSafety;
  private readonly config: BitFlightAgentConfig;
  private route: BitFlightRoute | null = null;
  private routeStepIndex = 0;
  private surfacePointIndex = 0;
  private location: BitFlightLocation | null = null;
  private position: Vector3 | null = null;
  private facingDirection: Vector3 | null = null;
  private activeTransition: ActiveTransition | null = null;
  private state: BitFlightAgentState = "idle";
  private disposed = false;

  constructor(
    navigationWorld: BitFlightNavigationWorld,
    safety: BitFlightSafety,
    config: BitFlightAgentConfig
  ) {
    assertPositiveFiniteNumber(
      "ビット飛行経路点到達許容値",
      config.waypointTolerance
    );
    if (
      safety.envelopeRadius !==
      BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
    ) {
      throw new Error(
        "BitFlightAgentには物理半径0.44m、安全余裕0.10m、安全包絡半径0.54mの安全判定が必要です。"
      );
    }
    this.navigationWorld = navigationWorld;
    this.safety = safety;
    this.config = Object.freeze({ ...config });
  }

  setRoute(
    currentLocation: BitFlightLocation,
    destination: BitFlightLocation,
    policy: BitFlightRoutePolicy
  ) {
    this.assertActive();
    if (this.activeTransition) {
      throw new Error(
        "飛行遷移中は経路を再設定できません。clear()で安全な遷移端へ離脱してください。"
      );
    }

    const currentPosition = getBitFlightWorldPosition(currentLocation);
    const destinationPosition = getBitFlightWorldPosition(destination);
    if (
      !this.safety.isCenterSafe(currentPosition) ||
      !this.safety.isCenterSafe(destinationPosition)
    ) {
      this.route = null;
      this.location = cloneBitFlightLocation(currentLocation);
      this.position = currentPosition;
      this.facingDirection = null;
      this.routeStepIndex = 0;
      this.surfacePointIndex = 0;
      this.activeTransition = null;
      this.state = "blocked";
      return false;
    }
    const routeStepSafety = new Map<BitFlightRouteStep, boolean>();
    const safePolicy: BitFlightRoutePolicy = Object.freeze({
      canUseTransition: (traversal) =>
        policy.canUseTransition(traversal),
      canUseRouteStep: (step) => {
        if (!policy.canUseRouteStep(step)) {
          return false;
        }
        const cachedSafety = routeStepSafety.get(step);
        if (cachedSafety !== undefined) {
          return cachedSafety;
        }
        const isSafe = this.isRouteStepSafe(step);
        routeStepSafety.set(step, isSafe);
        return isSafe;
      },
      additionalSurfaceCruiseHeights: (step, band) =>
        Object.freeze([
          ...policy.additionalSurfaceCruiseHeights(step, band),
          ...this.safety.findLowCeilingCruiseHeights(step, band)
        ]),
      additionalTransitionCost: (traversal) =>
        policy.additionalTransitionCost(traversal)
    });
    const route = this.navigationWorld.findRoute(
      currentLocation,
      destination,
      safePolicy
    );
    this.location = cloneBitFlightLocation(currentLocation);
    this.position = currentPosition;
    this.facingDirection = null;
    this.routeStepIndex = 0;
    this.surfacePointIndex = 0;
    this.activeTransition = null;

    if (!route) {
      this.route = null;
      this.state = "unreachable";
      return false;
    }
    if (!route.steps.every((step) => routeStepSafety.get(step) === true)) {
      throw new Error(
        "BitFlightNavigationWorldが安全判定で除外した辺を含む経路を返しました。"
      );
    }
    return this.acceptRoute(currentLocation, route, "verified");
  }

  setPreparedRoute(
    currentLocation: BitFlightLocation,
    route: BitFlightRoute
  ) {
    this.assertActive();
    if (this.activeTransition) {
      throw new Error(
        "飛行遷移中は経路を再設定できません。clear()で安全な遷移端へ離脱してください。"
      );
    }
    this.navigationWorld.assertPreparedRoute(currentLocation, route);
    return this.acceptRoute(currentLocation, route, "verify");
  }

  private acceptRoute(
    currentLocation: BitFlightLocation,
    route: BitFlightRoute,
    safetyStatus: "verify" | "verified"
  ) {
    const currentPosition = getBitFlightWorldPosition(currentLocation);
    const destinationPosition = getBitFlightWorldPosition(route.destination);
    this.location = cloneBitFlightLocation(currentLocation);
    this.position = currentPosition;
    this.facingDirection = null;
    this.routeStepIndex = 0;
    this.surfacePointIndex = 0;
    this.activeTransition = null;
    if (
      !this.safety.isCenterSafe(currentPosition) ||
      !this.safety.isCenterSafe(destinationPosition) ||
      (safetyStatus === "verify" &&
        !this.isRouteSafe(currentLocation, route))
    ) {
      this.route = null;
      this.state = "blocked";
      return false;
    }
    this.route = cloneBitFlightRoute(route);
    this.state = this.route.steps.length === 0 ? "arrived" : "surface";
    return true;
  }

  update(
    surfaceSpeedWorldUnitsPerSecond: number,
    deltaSeconds: number
  ) {
    this.assertActive();
    assertNonNegativeFiniteNumber(
      "ビット帯内移動速度",
      surfaceSpeedWorldUnitsPerSecond
    );
    assertNonNegativeFiniteNumber("ビット飛行deltaSeconds", deltaSeconds);

    let remainingSeconds = deltaSeconds;
    let zeroDurationProgress = true;
    while (zeroDurationProgress) {
      zeroDurationProgress = false;

      if (this.activeTransition) {
        const result = this.advanceActiveTransition(remainingSeconds);
        remainingSeconds = result.remainingSeconds;
        zeroDurationProgress = result.completed;
        if (!result.completed) {
          break;
        }
        continue;
      }

      if (!this.route) {
        break;
      }
      if (this.routeStepIndex >= this.route.steps.length) {
        this.location = cloneBitFlightLocation(this.route.destination);
        this.position = getBitFlightWorldPosition(this.location);
        this.state = "arrived";
        break;
      }

      const step = this.route.steps[this.routeStepIndex];
      if (step.kind === "transition") {
        this.beginTransition(step);
        zeroDurationProgress = true;
        continue;
      }

      const result = this.advanceSurfaceStep(
        step,
        surfaceSpeedWorldUnitsPerSecond,
        remainingSeconds
      );
      remainingSeconds = result.remainingSeconds;
      zeroDurationProgress = result.completed;
      if (!result.completed) {
        break;
      }
    }

    return this.getSnapshot();
  }

  getSnapshot() {
    this.assertActive();
    return Object.freeze({
      state: this.state,
      position: this.position?.clone() ?? null,
      location: this.location
        ? cloneBitFlightLocation(this.location)
        : null,
      facingDirection: this.facingDirection?.clone() ?? null,
      transition:
        this.activeTransition?.routeStep.traversal ?? null,
      routeStepIndex: this.routeStepIndex,
      routeStepCount: this.route?.steps.length ?? 0
    });
  }

  clear() {
    this.assertActive();
    if (this.activeTransition) {
      if (this.activeTransition.clearing) {
        return;
      }
      this.beginSafeTransitionClear();
      return;
    }
    this.route = null;
    this.routeStepIndex = 0;
    this.surfacePointIndex = 0;
    this.state = "idle";
  }

  dispose() {
    this.assertActive();
    this.route = null;
    this.location = null;
    this.position = null;
    this.facingDirection = null;
    this.activeTransition = null;
    this.routeStepIndex = 0;
    this.surfacePointIndex = 0;
    this.state = "idle";
    this.disposed = true;
  }

  private isRouteSafe(
    startLocation: BitFlightLocation,
    route: BitFlightRoute
  ) {
    let cursor = getBitFlightWorldPosition(startLocation);
    for (const step of route.steps) {
      const points = this.getRouteStepPositions(step);
      if (!this.isPointPathSafe(Object.freeze([cursor, ...points]))) {
        return false;
      }
      cursor = points[points.length - 1];
    }
    const destination = getBitFlightWorldPosition(route.destination);
    return (
      this.safety.isCenterSafe(destination) &&
      this.safety.findMovementCollision(cursor, destination) === null
    );
  }

  private isRouteStepSafe(step: BitFlightRouteStep) {
    const points = this.getRouteStepPositions(step);
    if (
      step.kind === "transition" &&
      step.traversal.transition.kind === "vertical"
    ) {
      const region = step.traversal.transition.region;
      if (!region) {
        throw new Error("vertical遷移に安全領域がありません。");
      }
      if (
        points.some(
          (point) =>
            point.x < region.minimum.x ||
            point.x > region.maximum.x ||
            point.y < region.minimum.y ||
            point.y > region.maximum.y ||
            point.z < region.minimum.z ||
            point.z > region.maximum.z ||
            !region.contains(point)
        )
      ) {
        return false;
      }
    }
    return this.isPointPathSafe(points);
  }

  private getRouteStepPositions(step: BitFlightRouteStep) {
    return step.kind === "surface"
      ? Object.freeze(step.points.map(getBitFlightWorldPosition))
      : Object.freeze(step.points.map((point) => point.clone()));
  }

  private isPointPathSafe(points: readonly Vector3[]) {
    if (points.length === 0 || !this.safety.isCenterSafe(points[0])) {
      return false;
    }
    for (let index = 1; index < points.length; index += 1) {
      if (
        this.safety.findMovementCollision(
          points[index - 1],
          points[index]
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private advanceSurfaceStep(
    step: Extract<BitFlightRouteStep, { kind: "surface" }>,
    speed: number,
    availableSeconds: number
  ) {
    if (!this.location || !this.position) {
      throw new Error("帯内移動に必要な現在飛行位置がありません。");
    }
    if (
      this.location.zoneId !== step.band.zoneId ||
      this.location.bandId !== step.band.bandId
    ) {
      throw new Error("帯内経路と現在飛行位置の飛行帯が一致しません。");
    }

    let remainingSeconds = availableSeconds;
    while (this.surfacePointIndex < step.points.length) {
      const target = step.points[this.surfacePointIndex];
      if (!sameBand(this.location, target)) {
        throw new Error("帯内経路点が異なる飛行帯を参照しています。");
      }
      const targetPosition = getBitFlightWorldPosition(target);
      const distance = Vector3.Distance(this.position, targetPosition);
      if (distance <= this.config.waypointTolerance) {
        if (this.safety.findMovementCollision(this.position, targetPosition)) {
          this.route = null;
          this.state = "blocked";
          return { remainingSeconds: 0, completed: false };
        }
        this.location = cloneBitFlightLocation(target);
        this.position = targetPosition;
        this.surfacePointIndex += 1;
        continue;
      }
      if (speed === 0 || remainingSeconds === 0) {
        this.state = "surface";
        return { remainingSeconds, completed: false };
      }

      const movementDistance = Math.min(
        distance,
        speed * remainingSeconds
      );
      const direction = targetPosition
        .subtract(this.position)
        .scale(1 / distance);
      const desiredPosition = this.position.add(
        direction.scale(movementDistance)
      );
      const band = this.navigationWorld.getBand(this.location);
      if (!band) {
        throw new Error("帯内移動中の飛行帯がありません。");
      }
      const desiredHeightMode =
        desiredPosition.y < band.minimumCenterHeight
          ? ("low-ceiling" as const)
          : ("band" as const);
      const constrained = this.navigationWorld.constrainMovement(
        this.location,
        desiredPosition,
        desiredHeightMode
      );
      if (!constrained) {
        this.route = null;
        this.state = "blocked";
        return { remainingSeconds: 0, completed: false };
      }
      if (!sameBand(this.location, constrained)) {
        throw new Error("帯内移動拘束結果が別の飛行帯へ移動しました。");
      }

      const constrainedPosition = getBitFlightWorldPosition(constrained);
      const actualMovement = Vector3.Distance(
        this.position,
        constrainedPosition
      );
      if (
        actualMovement >
        movementDistance + this.config.waypointTolerance
      ) {
        throw new Error("帯内移動拘束結果が指定移動距離を超えました。");
      }
      if (actualMovement <= MOVEMENT_EPSILON) {
        this.route = null;
        this.state = "blocked";
        return { remainingSeconds: 0, completed: false };
      }
      if (
        this.safety.findMovementCollision(
          this.position,
          constrainedPosition
        )
      ) {
        this.route = null;
        this.state = "blocked";
        return { remainingSeconds: 0, completed: false };
      }
      this.facingDirection = constrainedPosition
        .subtract(this.position)
        .normalize();
      this.location = cloneBitFlightLocation(constrained);
      this.position = constrainedPosition;
      remainingSeconds -= movementDistance / speed;
      this.state = "surface";

      if (
        Vector3.Distance(this.position, targetPosition) <=
        this.config.waypointTolerance
      ) {
        if (
          this.safety.findMovementCollision(
            this.position,
            targetPosition
          )
        ) {
          this.route = null;
          this.state = "blocked";
          return { remainingSeconds: 0, completed: false };
        }
        this.location = cloneBitFlightLocation(target);
        this.position = targetPosition;
        this.surfacePointIndex += 1;
        continue;
      }
      return { remainingSeconds, completed: false };
    }

    this.routeStepIndex += 1;
    this.surfacePointIndex = 0;
    return { remainingSeconds, completed: true };
  }

  private beginTransition(step: BitFlightTransitionRouteStep) {
    if (!this.location || !this.position) {
      throw new Error("飛行遷移開始に必要な現在飛行位置がありません。");
    }
    if (!sameBand(this.location, step.entry)) {
      throw new Error("飛行遷移入口と現在飛行位置の飛行帯が一致しません。");
    }
    if (step.points.length < 2) {
      throw new Error("飛行遷移には入口と出口を含む経路点列が必要です。");
    }
    step.points.forEach((point, index) =>
      assertFiniteVector(`飛行遷移経路点${index}`, point)
    );
    if (!this.isRouteStepSafe(step)) {
      this.route = null;
      this.state = "blocked";
      return;
    }
    const entryPosition = getBitFlightWorldPosition(step.entry);
    if (
      Vector3.Distance(this.position, entryPosition) >
      this.config.waypointTolerance
    ) {
      this.route = null;
      this.state = "blocked";
      return;
    }

    this.position = step.points[0].clone();
    this.location = null;
    this.activeTransition = {
      routeStep: step,
      points: step.points,
      nextPointIndex: 1,
      endpoint: cloneBitFlightLocation(step.exit),
      clearing: false
    };
    this.state = "transition";
  }

  private advanceActiveTransition(availableSeconds: number) {
    const active = this.activeTransition;
    if (!active || !this.position) {
      throw new Error("進行中の飛行遷移がありません。");
    }

    let remainingSeconds = availableSeconds;
    while (active.nextPointIndex < active.points.length) {
      const target = active.points[active.nextPointIndex];
      const distance = Vector3.Distance(this.position, target);
      if (distance <= this.config.waypointTolerance) {
        if (this.safety.findMovementCollision(this.position, target)) {
          this.route = null;
          this.activeTransition = null;
          this.state = "blocked";
          return { remainingSeconds: 0, completed: false };
        }
        this.position = target.clone();
        active.nextPointIndex += 1;
        continue;
      }
      if (remainingSeconds === 0) {
        this.state = active.clearing
          ? "clearing-transition"
          : "transition";
        return { remainingSeconds, completed: false };
      }

      const movementDistance = Math.min(
        distance,
        BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND *
          remainingSeconds
      );
      const direction = target
        .subtract(this.position)
        .scale(1 / distance);
      const desiredPosition = this.position.add(
        direction.scale(movementDistance)
      );
      if (
        this.safety.findMovementCollision(
          this.position,
          desiredPosition
        )
      ) {
        this.route = null;
        this.activeTransition = null;
        this.state = "blocked";
        return { remainingSeconds: 0, completed: false };
      }
      this.position = desiredPosition;
      this.facingDirection = direction;
      remainingSeconds -=
        movementDistance /
        BIT_FLIGHT_TRANSITION_SPEED_WORLD_UNITS_PER_SECOND;
      this.state = active.clearing
        ? "clearing-transition"
        : "transition";

      if (
        Vector3.Distance(this.position, target) <=
        this.config.waypointTolerance
      ) {
        if (this.safety.findMovementCollision(this.position, target)) {
          this.route = null;
          this.activeTransition = null;
          this.state = "blocked";
          return { remainingSeconds: 0, completed: false };
        }
        this.position = target.clone();
        active.nextPointIndex += 1;
        continue;
      }
      return { remainingSeconds, completed: false };
    }

    this.location = cloneBitFlightLocation(active.endpoint);
    this.position = getBitFlightWorldPosition(this.location);
    this.activeTransition = null;
    if (active.clearing) {
      this.route = null;
      this.routeStepIndex = 0;
      this.surfacePointIndex = 0;
      this.state = "idle";
    } else {
      this.routeStepIndex += 1;
      this.surfacePointIndex = 0;
    }
    return { remainingSeconds, completed: true };
  }

  private beginSafeTransitionClear() {
    const active = this.activeTransition;
    if (!active || !this.position) {
      throw new Error("安全離脱する飛行遷移がありません。");
    }

    const traversedPoints = active.points
      .slice(0, active.nextPointIndex)
      .reverse()
      .map((point) => point.clone());
    const remainingPoints = active.points
      .slice(active.nextPointIndex)
      .map((point) => point.clone());
    const entryPath = [this.position.clone(), ...traversedPoints];
    const exitPath = [this.position.clone(), ...remainingPoints];
    const returnToEntry =
      calculatePathDistance(entryPath) < calculatePathDistance(exitPath);
    const endpoint = returnToEntry
      ? active.routeStep.entry
      : active.routeStep.exit;
    const points = returnToEntry ? entryPath : exitPath;

    this.route = null;
    this.routeStepIndex = 0;
    this.surfacePointIndex = 0;
    if (calculatePathDistance(points) <= this.config.waypointTolerance) {
      this.location = cloneBitFlightLocation(endpoint);
      this.position = getBitFlightWorldPosition(this.location);
      this.activeTransition = null;
      this.state = "idle";
      return;
    }

    this.activeTransition = {
      routeStep: active.routeStep,
      points: Object.freeze(points),
      nextPointIndex: 1,
      endpoint: cloneBitFlightLocation(endpoint),
      clearing: true
    };
    this.state = "clearing-transition";
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("破棄済みのBitFlightAgentは使用できません。");
    }
  }
}

export const createBitFlightAgent = (
  navigationWorld: BitFlightNavigationWorld,
  safety: BitFlightSafety,
  config: BitFlightAgentConfig
): BitFlightAgent =>
  new RouteFollowingBitFlightAgent(navigationWorld, safety, config);
