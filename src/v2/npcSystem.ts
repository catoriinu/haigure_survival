import {
  Sprite,
  SpriteManager,
  Vector3,
  type Scene
} from "@babylonjs/core";

import {
  CHARACTER_SPRITE_CELL_SIZE,
  NPC_SPRITE_CENTER_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_WIDTH,
  createDefaultCharacterSpritesheet
} from "../game/characterSprites";
import {
  createNavigationAgent,
  type NavigationAgent
} from "../world/navigationAgent";
import type { NavigationLocation } from "../world/navigationWorld";
import { createStageBoundarySpawnSampler } from "../world/stageSpawnSampler";
import type { StageSpatialContext } from "../world/stageSpatialContext";
import type {
  V2ActorSphere,
  V2AlertRequest,
  V2ExternalAlert,
  V2HumanTargetSnapshot,
  V2TargetProvenance
} from "./combatTypes";

const NPC_SEARCH_SPEED = 0.2;
const NPC_CHASE_SPEED = 0.3;
const NPC_VISION_RANGE = 3;
const NPC_VISION_RANGE_SQUARED = NPC_VISION_RANGE * NPC_VISION_RANGE;
const NPC_VISION_COSINE = Math.cos((95 * Math.PI) / 180);
const NPC_WANDER_RADIUS = 2;
const NPC_WANDER_MAX_ATTEMPTS = 16;
const NPC_WANDER_WAIT_MIN_SECONDS = 0.5;
const NPC_WANDER_WAIT_MAX_SECONDS = 1.5;
const NPC_COLLISION_RADIUS = NPC_SPRITE_WIDTH * 0.5;
const SPAWN_MINIMUM_DISTANCE = NPC_SPRITE_WIDTH * 1.75;
const SPAWN_PROJECTION_MAX_DISTANCE = 0.75;
const NAVIGATION_PROJECTION_MAX_DISTANCE = 0.75;

const NAVIGATION_AGENT_CONFIG = Object.freeze({
  projectionMaxDistance: NAVIGATION_PROJECTION_MAX_DISTANCE,
  targetMoveThreshold: 0.15,
  pathRefreshIntervalSeconds: 0.5,
  waypointTolerance: 0.02,
  stuckDistanceThreshold: 0.005,
  stuckDurationSeconds: 1
});

export type V2NpcSystemOptions = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  npcCount: number;
  initialBrainwashedNpcCount: number;
  random: () => number;
}>;

export type V2NpcTrackingSnapshot = Readonly<{
  npcId: string;
  targetId: string | null;
  provenance: V2TargetProvenance | null;
  alertLeaderId: string | null;
  alertRemainingSeconds: number;
}>;

export interface V2NpcSystem {
  update(
    deltaSeconds: number,
    playerTarget: V2HumanTargetSnapshot
  ): void;
  getTargetSnapshots(): readonly V2HumanTargetSnapshot[];
  getActorSpheres(): readonly V2ActorSphere[];
  getTrackingSnapshots(): readonly V2NpcTrackingSnapshot[];
  drainAlertRequests(): readonly V2AlertRequest[];
  applyAlerts(alerts: readonly V2ExternalAlert[]): void;
  setBrainwashed(npcId: string, brainwashed: boolean): void;
  dispose(): void;
}

type NpcRuntime = {
  readonly id: string;
  readonly sprite: Sprite;
  readonly navigationAgent: NavigationAgent;
  navigationLocation: NavigationLocation;
  readonly forward: Vector3;
  brainwashed: boolean;
  wanderDestination: NavigationLocation | null;
  wanderWaitSeconds: number;
  targetId: string | null;
  targetProvenance: V2TargetProvenance | null;
  alertLeaderId: string | null;
  alertRemainingSeconds: number;
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

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const assertPositiveFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}には正の有限値が必要です。`);
  }
};

const assertNpcCount = (
  npcCount: number,
  initialBrainwashedNpcCount: number
) => {
  if (!Number.isInteger(npcCount) || npcCount < 2) {
    throw new Error("npcCountには2以上の整数が必要です。");
  }
  if (
    !Number.isInteger(initialBrainwashedNpcCount) ||
    initialBrainwashedNpcCount < 0 ||
    initialBrainwashedNpcCount > npcCount
  ) {
    throw new Error(
      "initialBrainwashedNpcCountには0以上npcCount以下の整数が必要です。"
    );
  }
};

const assertTargetSnapshot = (
  label: string,
  target: V2HumanTargetSnapshot
) => {
  if (target.id.length === 0) {
    throw new Error(`${label}のIDが空です。`);
  }
  assertFiniteVector(`${label}の足元`, target.footPosition);
  assertFiniteVector(`${label}の照準点`, target.aimPosition);
  assertPositiveFiniteNumber(`${label}の衝突半径`, target.collisionRadius);
};

const toAimPosition = (footPosition: Vector3) =>
  new Vector3(
    footPosition.x,
    footPosition.y + NPC_SPRITE_CENTER_HEIGHT,
    footPosition.z
  );

const cloneTargetSnapshot = (
  target: V2HumanTargetSnapshot
): V2HumanTargetSnapshot =>
  Object.freeze({
    ...target,
    footPosition: target.footPosition.clone(),
    aimPosition: target.aimPosition.clone()
  });

const createNpcTargetSnapshot = (
  npc: NpcRuntime
): V2HumanTargetSnapshot =>
  Object.freeze({
    id: npc.id,
    kind: "npc" as const,
    footPosition: npc.navigationLocation.position.clone(),
    aimPosition: toAimPosition(npc.navigationLocation.position),
    collisionRadius: NPC_COLLISION_RADIUS,
    alive: true,
    brainwashed: npc.brainwashed
  });

class SchoolV2NpcSystem implements V2NpcSystem {
  private readonly stage: StageSpatialContext;
  private readonly spriteManager: SpriteManager;
  private readonly npcs: readonly NpcRuntime[];
  private readonly npcsById: ReadonlyMap<string, NpcRuntime>;
  private readonly random: () => number;
  private readonly pendingAlertRequests: V2AlertRequest[] = [];
  private targetSnapshots: readonly V2HumanTargetSnapshot[];
  private actorSpheres: readonly V2ActorSphere[];
  private disposed = false;

  constructor(options: V2NpcSystemOptions) {
    assertNpcCount(options.npcCount, options.initialBrainwashedNpcCount);
    if (typeof options.random !== "function") {
      throw new Error("randomには0以上1未満を返す関数が必要です。");
    }

    this.stage = options.stage;
    this.random = options.random;

    const spawnSampler = createStageBoundarySpawnSampler(
      options.stage.boundary,
      options.stage.navigation,
      {
        maxAttempts: options.npcCount * 64,
        projectionMaxDistance: SPAWN_PROJECTION_MAX_DISTANCE,
        random: options.random
      },
      (point) =>
        options.stage.queries.containsVolume("no_enemy_spawn", point) ||
        options.stage.queries.containsVolume("no_enemy_enter", point) ||
        options.stage.queries.containsVolume("hazard", point) ||
        options.stage.queries.containsVolume("water", point)
    );
    const spawnPoints = spawnSampler.samplePoints(
      options.npcCount,
      SPAWN_MINIMUM_DISTANCE
    );
    const brainwashedIndices = this.pickBrainwashedIndices(
      options.npcCount,
      options.initialBrainwashedNpcCount
    );

    const npcs: NpcRuntime[] = [];
    const cleanupActions: Array<() => void> = [];
    const spriteManager = new SpriteManager(
      "V2SchoolNpcSpriteManager",
      createDefaultCharacterSpritesheet(),
      options.npcCount,
      {
        width: CHARACTER_SPRITE_CELL_SIZE,
        height: CHARACTER_SPRITE_CELL_SIZE
      },
      options.scene
    );
    this.spriteManager = spriteManager;
    cleanupActions.push(() => spriteManager.dispose());

    try {
      for (let index = 0; index < spawnPoints.length; index += 1) {
        const spawnPoint = spawnPoints[index];
        const id = `npc_${index}`;
        const sprite = new Sprite(id, spriteManager);
        cleanupActions.push(() => sprite.dispose());
        sprite.width = NPC_SPRITE_WIDTH;
        sprite.height = NPC_SPRITE_HEIGHT;
        sprite.isPickable = false;
        const brainwashed = brainwashedIndices.has(index);
        sprite.cellIndex = brainwashed ? 3 : 0;
        sprite.position.copyFrom(toAimPosition(spawnPoint.position));
        const angle = this.nextRandom() * Math.PI * 2;
        const navigationAgent = createNavigationAgent(
          options.stage.navigation,
          "npc",
          NAVIGATION_AGENT_CONFIG
        );
        cleanupActions.push(() => navigationAgent.clear());
        npcs.push({
          id,
          sprite,
          navigationAgent,
          navigationLocation: spawnPoint,
          forward: new Vector3(Math.sin(angle), 0, Math.cos(angle)),
          brainwashed,
          wanderDestination: null,
          wanderWaitSeconds: this.nextWanderWait(),
          targetId: null,
          targetProvenance: null,
          alertLeaderId: null,
          alertRemainingSeconds: 0
        });
      }
      this.npcs = Object.freeze(npcs);
      this.npcsById = new Map(npcs.map((npc) => [npc.id, npc]));
      this.targetSnapshots = Object.freeze(
        npcs.map(createNpcTargetSnapshot)
      );
      this.actorSpheres = this.buildActorSpheres();
      cleanupActions.length = 0;
    } catch (error) {
      for (let index = cleanupActions.length - 1; index >= 0; index -= 1) {
        cleanupActions[index]();
      }
      throw error;
    }
  }

  update(deltaSeconds: number, playerTarget: V2HumanTargetSnapshot) {
    this.assertActive();
    assertNonNegativeFiniteNumber("NPC更新deltaSeconds", deltaSeconds);
    assertTargetSnapshot("プレイヤー標的", playerTarget);
    if (playerTarget.kind !== "player") {
      throw new Error("NPC更新へ渡す外部標的はplayerである必要があります。");
    }

    const frameTargets = Object.freeze([
      cloneTargetSnapshot(playerTarget),
      ...this.npcs.map(createNpcTargetSnapshot)
    ]);
    const targetsById = new Map(
      frameTargets.map((target) => [target.id, target])
    );
    if (targetsById.size !== frameTargets.length) {
      throw new Error("NPC更新の標的IDが重複しています。");
    }

    for (const npc of this.npcs) {
      if (npc.brainwashed) {
        this.updateBrainwashedNpc(npc, deltaSeconds, frameTargets, targetsById);
      } else {
        this.updateNormalNpc(npc, deltaSeconds);
      }
      npc.sprite.position.copyFrom(
        toAimPosition(npc.navigationLocation.position)
      );
    }

    this.targetSnapshots = Object.freeze(
      this.npcs.map(createNpcTargetSnapshot)
    );
    this.actorSpheres = this.buildActorSpheres();
  }

  getTargetSnapshots() {
    this.assertActive();
    return Object.freeze(
      this.targetSnapshots.map(cloneTargetSnapshot)
    );
  }

  getActorSpheres() {
    this.assertActive();
    return Object.freeze(
      this.actorSpheres.map((sphere) =>
        Object.freeze({ ...sphere, center: sphere.center.clone() })
      )
    );
  }

  getTrackingSnapshots() {
    this.assertActive();
    return Object.freeze(
      this.npcs.map((npc) =>
        Object.freeze({
          npcId: npc.id,
          targetId: npc.targetId,
          provenance: npc.targetProvenance,
          alertLeaderId: npc.alertLeaderId,
          alertRemainingSeconds: npc.alertRemainingSeconds
        })
      )
    );
  }

  drainAlertRequests() {
    this.assertActive();
    const requests = Object.freeze(
      this.pendingAlertRequests.map((request) => Object.freeze({ ...request }))
    );
    this.pendingAlertRequests.length = 0;
    return requests;
  }

  applyAlerts(alerts: readonly V2ExternalAlert[]) {
    this.assertActive();
    for (const alert of alerts) {
      if (
        alert.leaderId.length === 0 ||
        alert.targetId.length === 0 ||
        alert.leaderId === alert.targetId
      ) {
        throw new Error("アラートには異なる非空のleaderIdとtargetIdが必要です。");
      }
      assertPositiveFiniteNumber(
        "アラート残り時間",
        alert.remainingSeconds
      );

      for (const npc of this.npcs) {
        if (
          !npc.brainwashed ||
          npc.id === alert.targetId ||
          npc.id === alert.leaderId
        ) {
          continue;
        }
        const targetChanged =
          npc.targetId !== alert.targetId || npc.targetProvenance !== "alert";
        npc.targetId = alert.targetId;
        npc.targetProvenance = "alert";
        npc.alertLeaderId = alert.leaderId;
        npc.alertRemainingSeconds = alert.remainingSeconds;
        npc.wanderDestination = null;
        if (targetChanged) {
          npc.navigationAgent.clear();
        }
      }
    }
  }

  setBrainwashed(npcId: string, brainwashed: boolean) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    if (npc.brainwashed === brainwashed) {
      return;
    }
    npc.brainwashed = brainwashed;
    npc.sprite.cellIndex = brainwashed ? 3 : 0;
    this.clearTarget(npc);
    npc.wanderDestination = null;
    npc.wanderWaitSeconds = brainwashed ? 0 : this.nextWanderWait();
    this.targetSnapshots = Object.freeze(
      this.npcs.map(createNpcTargetSnapshot)
    );
  }

  dispose() {
    this.assertActive();
    this.disposed = true;
    this.pendingAlertRequests.length = 0;
    for (const npc of this.npcs) {
      npc.navigationAgent.clear();
      npc.sprite.dispose();
    }
    this.spriteManager.dispose();
  }

  private updateNormalNpc(npc: NpcRuntime, deltaSeconds: number) {
    if (npc.targetId !== null) {
      this.clearTarget(npc);
    }
    npc.wanderWaitSeconds = Math.max(
      0,
      npc.wanderWaitSeconds - deltaSeconds
    );
    if (!npc.wanderDestination && npc.wanderWaitSeconds === 0) {
      npc.wanderDestination = this.createWanderDestination(
        npc.navigationLocation
      );
      npc.navigationAgent.clear();
      if (!npc.wanderDestination) {
        npc.wanderWaitSeconds = this.nextWanderWait();
        return;
      }
    }
    if (!npc.wanderDestination) {
      return;
    }

    const movement = npc.navigationAgent.update(
      npc.navigationLocation,
      npc.wanderDestination.position,
      NPC_SEARCH_SPEED,
      deltaSeconds
    );
    const moved = this.applyNavigationMovement(npc, movement.location);
    if (
      !moved ||
      movement.state === "arrived" ||
      movement.state === "unreachable"
    ) {
      npc.navigationAgent.clear();
      npc.wanderDestination = null;
      npc.wanderWaitSeconds = this.nextWanderWait();
    }
  }

  private updateBrainwashedNpc(
    npc: NpcRuntime,
    deltaSeconds: number,
    targets: readonly V2HumanTargetSnapshot[],
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>
  ) {
    npc.wanderDestination = null;
    if (npc.targetProvenance === "alert") {
      npc.alertRemainingSeconds = Math.max(
        0,
        npc.alertRemainingSeconds - deltaSeconds
      );
      if (npc.alertRemainingSeconds === 0) {
        this.clearTarget(npc);
      }
    }

    if (npc.targetProvenance === "visual" && npc.targetId) {
      const currentTarget = targetsById.get(npc.targetId);
      if (!currentTarget || !this.isVisuallyTargetable(npc, currentTarget)) {
        this.clearTarget(npc);
      }
    }

    if (!npc.targetId) {
      const visibleTarget = this.findNearestVisibleTarget(npc, targets);
      if (visibleTarget) {
        npc.targetId = visibleTarget.id;
        npc.targetProvenance = "visual";
        npc.alertLeaderId = null;
        npc.alertRemainingSeconds = 0;
        npc.navigationAgent.clear();
        this.pendingAlertRequests.push(
          Object.freeze({ leaderId: npc.id, targetId: visibleTarget.id })
        );
      }
    }

    if (!npc.targetId) {
      npc.navigationAgent.clear();
      return;
    }
    const target = targetsById.get(npc.targetId);
    if (!target || !this.isTargetable(npc, target)) {
      if (npc.targetProvenance === "visual") {
        this.clearTarget(npc);
      } else {
        npc.navigationAgent.clear();
      }
      return;
    }

    const movement = npc.navigationAgent.update(
      npc.navigationLocation,
      target.footPosition,
      NPC_CHASE_SPEED,
      deltaSeconds
    );
    this.applyNavigationMovement(npc, movement.location);
  }

  private findNearestVisibleTarget(
    npc: NpcRuntime,
    targets: readonly V2HumanTargetSnapshot[]
  ) {
    let nearest: V2HumanTargetSnapshot | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      if (!this.isVisuallyTargetable(npc, target)) {
        continue;
      }
      const distanceSquared = Vector3.DistanceSquared(
        toAimPosition(npc.navigationLocation.position),
        target.aimPosition
      );
      if (distanceSquared < nearestDistanceSquared) {
        nearest = target;
        nearestDistanceSquared = distanceSquared;
      }
    }
    return nearest;
  }

  private isVisuallyTargetable(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot
  ) {
    if (!this.isTargetable(npc, target)) {
      return false;
    }
    const origin = toAimPosition(npc.navigationLocation.position);
    const toTarget = target.aimPosition.subtract(origin);
    const distanceSquared = toTarget.lengthSquared();
    if (
      distanceSquared === 0 ||
      distanceSquared > NPC_VISION_RANGE_SQUARED
    ) {
      return false;
    }
    const direction = toTarget.scale(1 / Math.sqrt(distanceSquared));
    if (Vector3.Dot(npc.forward, direction) < NPC_VISION_COSINE) {
      return false;
    }
    return this.stage.queries.castSightSegment(
      origin,
      target.aimPosition
    ) === null;
  }

  private isTargetable(npc: NpcRuntime, target: V2HumanTargetSnapshot) {
    return target.id !== npc.id && target.alive && !target.brainwashed;
  }

  private applyNavigationMovement(
    npc: NpcRuntime,
    nextLocation: NavigationLocation
  ) {
    const currentAimPosition = toAimPosition(npc.navigationLocation.position);
    const nextAimPosition = toAimPosition(nextLocation.position);
    if (
      this.stage.queries.castMovementSegment(
        "npc",
        currentAimPosition,
        nextAimPosition
      ) !== null
    ) {
      npc.navigationAgent.clear();
      return false;
    }
    const displacement = nextLocation.position.subtract(
      npc.navigationLocation.position
    );
    const horizontal = new Vector3(displacement.x, 0, displacement.z);
    if (horizontal.lengthSquared() > 0) {
      npc.forward.copyFrom(horizontal.normalize());
    }
    npc.navigationLocation = nextLocation;
    return true;
  }

  private clearTarget(npc: NpcRuntime) {
    npc.targetId = null;
    npc.targetProvenance = null;
    npc.alertLeaderId = null;
    npc.alertRemainingSeconds = 0;
    npc.navigationAgent.clear();
  }

  private buildActorSpheres(): readonly V2ActorSphere[] {
    return Object.freeze(
      this.npcs.map((npc) =>
        Object.freeze({
          id: npc.id,
          kind: "npc" as const,
          center: toAimPosition(npc.navigationLocation.position),
          radius: NPC_COLLISION_RADIUS
        })
      )
    );
  }

  private pickBrainwashedIndices(count: number, brainwashedCount: number) {
    const indices = Array.from({ length: count }, (_, index) => index);
    for (let index = 0; index < brainwashedCount; index += 1) {
      const remaining = count - index;
      const swapIndex = index + Math.floor(this.nextRandom() * remaining);
      [indices[index], indices[swapIndex]] = [
        indices[swapIndex],
        indices[index]
      ];
    }
    return new Set(indices.slice(0, brainwashedCount));
  }

  private nextRandom() {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(
        `randomは0以上1未満の有限値を返す必要があります: ${value}`
      );
    }
    return value;
  }

  private nextWanderWait() {
    return (
      NPC_WANDER_WAIT_MIN_SECONDS +
      this.nextRandom() *
        (NPC_WANDER_WAIT_MAX_SECONDS - NPC_WANDER_WAIT_MIN_SECONDS)
    );
  }

  private createWanderDestination(origin: NavigationLocation) {
    for (let attempt = 0; attempt < NPC_WANDER_MAX_ATTEMPTS; attempt += 1) {
      const angle = this.nextRandom() * Math.PI * 2;
      const distance = Math.sqrt(this.nextRandom()) * NPC_WANDER_RADIUS;
      const candidate = new Vector3(
        origin.position.x + Math.cos(angle) * distance,
        origin.position.y,
        origin.position.z + Math.sin(angle) * distance
      );
      const projected = this.stage.navigation.constrainMovement(
        origin,
        candidate
      );
      if (
        projected &&
        Vector3.Distance(projected.position, candidate) <=
          NAVIGATION_PROJECTION_MAX_DISTANCE
      ) {
        return projected;
      }
    }
    return null;
  }

  private requireNpc(npcId: string) {
    const npc = this.npcsById.get(npcId);
    if (!npc) {
      throw new Error(`未登録のV2 NPC IDです: ${npcId}`);
    }
    return npc;
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error("V2NpcSystemは破棄済みです。");
    }
  }
}

export const createV2NpcSystem = (
  options: V2NpcSystemOptions
): V2NpcSystem => new SchoolV2NpcSystem(options);
