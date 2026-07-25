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
import {
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
  type V2AlarmTriggerEvent
} from "./alarmSystem";
import {
  V2_HIT_FADE_DURATION_SECONDS,
  createV2CharacterStateSystem,
  type V2CharacterImpactSource,
  type V2CharacterStateSystem
} from "./characterStateSystem";
import {
  isV2AliveState,
  isV2BrainwashState,
  isV2HitState,
  type V2ActorSphere,
  type V2AlertRequest,
  type V2BeamRequest,
  type V2CharacterState,
  type V2HumanTargetSnapshot,
  type V2TargetProvenance
} from "./combatTypes";
import {
  createV2HumanTargetSpatialIndex,
  type V2HumanTargetSpatialIndex
} from "./humanTargetSpatialIndex";

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
const NPC_HIT_RADII = Object.freeze(
  new Vector3(
    NPC_SPRITE_WIDTH * 0.5,
    NPC_SPRITE_HEIGHT * 0.5,
    NPC_SPRITE_WIDTH * 0.5
  )
);
const SPAWN_MINIMUM_DISTANCE = NPC_SPRITE_WIDTH * 1.75;
const SPAWN_PROJECTION_MAX_DISTANCE = 0.75;
const NAVIGATION_PROJECTION_MAX_DISTANCE = 0.75;
const PLACEMENT_PROJECTION_MAX_DISTANCE = 0.1;
const GROUND_PROBE_UPWARD_OFFSET = 0.5;
const GROUND_PROBE_DISTANCE = 1.5;
const NPC_INITIAL_GUN_CHANCE = 0.45;
const NPC_INITIAL_NO_GUN_CHANCE = 0.45;

export const V2_NPC_GUN_RANGE = 1.5;
export const V2_NPC_GUN_INTERVAL_MIN_SECONDS = 1.4;
export const V2_NPC_GUN_INTERVAL_MAX_SECONDS = 2.2;
export const V2_NPC_GUN_BEAM_SPEED = 1.58;
export const V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS = 20;
export const V2_NPC_CAPTURE_RADIUS = 0.27;
export const V2_NPC_CAPTURE_DURATION_SECONDS = 20;
export const V2_NPC_CAPTURE_BREAKAWAY_SECONDS = 2.5;
export const V2_NPC_CAPTURE_BREAKAWAY_SPEED = 0.27;

const NPC_EVADE_DISTANCE =
  V2_NPC_CAPTURE_BREAKAWAY_SPEED *
  V2_NPC_CAPTURE_BREAKAWAY_SECONDS;

const NPC_GUN_RANGE_SQUARED = V2_NPC_GUN_RANGE * V2_NPC_GUN_RANGE;

const NAVIGATION_AGENT_CONFIG = Object.freeze({
  projectionMaxDistance: NAVIGATION_PROJECTION_MAX_DISTANCE,
  targetMoveThreshold: 0.15,
  pathRefreshIntervalSeconds: 0.5,
  waypointTolerance: 0.02,
  stuckDistanceThreshold: 0.005,
  stuckDurationSeconds: 1
});

const ALIVE_HUMANS_TARGET_POLICY = Object.freeze({
  kind: "alive-humans" as const
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

export type V2NpcCaptureSnapshot = Readonly<{
  npcId: string;
  targetId: string;
  remainingSeconds: number;
}>;

export type V2NpcPlacementAssignment = Readonly<{
  id: string;
  footPosition: Vector3;
  formation: boolean;
}>;

export type V2NpcExternalThreat = Readonly<{
  targetId: string;
  sourcePosition: Vector3;
}>;

export interface V2NpcSystem {
  update(
    deltaSeconds: number,
    playerTarget: V2HumanTargetSnapshot
  ): void;
  getTargetSnapshots(): readonly V2HumanTargetSnapshot[];
  getActorSpheres(): readonly V2ActorSphere[];
  getTrackingSnapshots(): readonly V2NpcTrackingSnapshot[];
  applyBeamImpact(
    npcId: string,
    source: V2CharacterImpactSource
  ): boolean;
  prepareExecutionTarget(npcId: string): void;
  prepareExecutionAudience(npcId: string): void;
  prepareExecutionShooter(npcId: string): void;
  enterFormationState(npcId: string): boolean;
  drainBeamRequests(): readonly V2BeamRequest[];
  getCaptureSnapshots(): readonly V2NpcCaptureSnapshot[];
  drainAlertRequests(): readonly V2AlertRequest[];
  applyAlarmTargetEvents(events: readonly V2AlarmTriggerEvent[]): void;
  getThreatenedTargetIds(): readonly string[];
  setExternalThreats(threats: readonly V2NpcExternalThreat[]): void;
  setPlayerBlockedTargetIds(targetIds: readonly string[]): void;
  setVisibleNpcIds(npcIds: readonly string[]): void;
  setAiSuspended(suspended: boolean): void;
  placeNpcs(assignments: readonly V2NpcPlacementAssignment[]): void;
  dispose(): void;
}

type NpcAlarmTarget = {
  candidateId: string;
  targetId: string;
};

type NpcCapture = {
  targetId: string;
  remainingSeconds: number;
  lastTargetFootPosition: Vector3;
};

type NpcRuntime = {
  readonly id: string;
  readonly sprite: Sprite;
  readonly navigationAgent: NavigationAgent;
  readonly stateSystem: V2CharacterStateSystem;
  navigationLocation: NavigationLocation;
  footPosition: Vector3;
  readonly forward: Vector3;
  lastState: V2CharacterState;
  wanderDestination: NavigationLocation | null;
  wanderWaitSeconds: number;
  targetId: string | null;
  targetProvenance: V2TargetProvenance | null;
  alertLeaderId: string | null;
  alertRemainingSeconds: number;
  readonly alarmTargetQueue: NpcAlarmTarget[];
  fireCooldownSeconds: number;
  capture: NpcCapture | null;
  breakawayRemainingSeconds: number;
  breakawayDestination: NavigationLocation | null;
};

type ResolvedPlacement = Readonly<{
  npc: NpcRuntime;
  navigationLocation: NavigationLocation;
  footPosition: Vector3;
  formation: boolean;
}>;

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
  assertFiniteVector(`${label}の命中形状中心`, target.hitShape.center);
  assertFiniteVector(`${label}の命中形状半径`, target.hitShape.radii);
  assertPositiveFiniteNumber(
    `${label}の命中形状X半径`,
    target.hitShape.radii.x
  );
  assertPositiveFiniteNumber(
    `${label}の命中形状Y半径`,
    target.hitShape.radii.y
  );
  assertPositiveFiniteNumber(
    `${label}の命中形状Z半径`,
    target.hitShape.radii.z
  );
  if (target.alive !== isV2AliveState(target.state)) {
    throw new Error(`${label}のaliveとstateが一致しません。`);
  }
  if (target.brainwashed !== isV2BrainwashState(target.state)) {
    throw new Error(`${label}のbrainwashedとstateが一致しません。`);
  }
};

const assertAlarmTargetEvent = (event: V2AlarmTriggerEvent) => {
  if (
    event.candidateId.length === 0 ||
    event.targetId.length === 0
  ) {
    throw new Error(
      "alarm target eventには非空のcandidateIdとtargetIdが必要です。"
    );
  }
  assertFiniteVector("alarm target eventの発火位置", event.position);
};

const toAimPosition = (footPosition: Vector3) =>
  new Vector3(
    footPosition.x,
    footPosition.y + NPC_SPRITE_CENTER_HEIGHT,
    footPosition.z
  );

const cloneNavigationLocation = (
  location: NavigationLocation
): NavigationLocation =>
  Object.freeze({
    position: location.position.clone(),
    polygonRef: location.polygonRef
  });

const cloneTargetSnapshot = (
  target: V2HumanTargetSnapshot
): V2HumanTargetSnapshot =>
  Object.freeze({
    ...target,
    footPosition: target.footPosition.clone(),
    aimPosition: target.aimPosition.clone(),
    hitShape: Object.freeze({
      center: target.hitShape.center.clone(),
      radii: target.hitShape.radii.clone()
    })
  });

const createNpcTargetSnapshot = (
  npc: NpcRuntime
): V2HumanTargetSnapshot => {
  const state = npc.stateSystem.getSnapshot().state;
  const aimPosition = toAimPosition(npc.footPosition);
  return Object.freeze({
    id: npc.id,
    kind: "npc" as const,
    footPosition: npc.footPosition.clone(),
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: NPC_HIT_RADII.clone()
    }),
    state,
    alive: isV2AliveState(state),
    brainwashed: isV2BrainwashState(state)
  });
};

const getSpriteCellIndex = (state: V2CharacterState) => {
  if (state === "hit-a") {
    return 1;
  }
  if (state === "hit-b") {
    return 2;
  }
  return isV2BrainwashState(state) ? 3 : 0;
};

const isStoppedState = (state: V2CharacterState) =>
  isV2HitState(state) ||
  state === "brainwash-in-progress" ||
  state === "brainwash-complete-haigure" ||
  state === "brainwash-complete-haigure-formation";

class SchoolV2NpcSystem implements V2NpcSystem {
  private readonly stage: StageSpatialContext;
  private readonly spriteManager: SpriteManager;
  private readonly npcs: readonly NpcRuntime[];
  private readonly npcsById: ReadonlyMap<string, NpcRuntime>;
  private readonly random: () => number;
  private readonly pendingAlertRequests: V2AlertRequest[] = [];
  private readonly pendingBeamRequests: V2BeamRequest[] = [];
  private targetSnapshots: readonly V2HumanTargetSnapshot[];
  private actorSpheres: readonly V2ActorSphere[];
  private threatenedTargetIds: readonly string[] = Object.freeze([]);
  private externalThreats: readonly V2NpcExternalThreat[] =
    Object.freeze([]);
  private playerBlockedTargetIds: readonly string[] = Object.freeze([]);
  private aiSuspended = false;
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
        const initialState = brainwashedIndices.has(index)
          ? this.pickInitialBrainwashedState()
          : "normal";
        const stateSystem = createV2CharacterStateSystem({
          kind: "npc",
          initialState,
          random: () => this.nextRandom()
        });
        const sprite = new Sprite(id, spriteManager);
        cleanupActions.push(() => sprite.dispose());
        sprite.width = NPC_SPRITE_WIDTH;
        sprite.height = NPC_SPRITE_HEIGHT;
        sprite.isPickable = false;
        sprite.cellIndex = getSpriteCellIndex(initialState);
        sprite.color.a = 1;
        const footPosition = this.resolveFootPosition(spawnPoint.position);
        sprite.position.copyFrom(toAimPosition(footPosition));
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
          stateSystem,
          navigationLocation: cloneNavigationLocation(spawnPoint),
          footPosition,
          forward: new Vector3(Math.sin(angle), 0, Math.cos(angle)),
          lastState: initialState,
          wanderDestination: null,
          wanderWaitSeconds: this.nextWanderWait(),
          targetId: null,
          targetProvenance: null,
          alertLeaderId: null,
          alertRemainingSeconds: 0,
          alarmTargetQueue: [],
          fireCooldownSeconds:
            initialState === "brainwash-complete-gun"
              ? this.nextInitialGunCooldown()
              : 0,
          capture: null,
          breakawayRemainingSeconds: 0,
          breakawayDestination: null
        });
      }
      this.npcs = Object.freeze(npcs);
      this.npcsById = new Map(npcs.map((npc) => [npc.id, npc]));
      this.targetSnapshots = this.buildTargetSnapshots();
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

    for (const npc of this.npcs) {
      const previousState = npc.lastState;
      const currentState = npc.stateSystem.update(deltaSeconds).state;
      this.synchronizeStateMode(npc, previousState, currentState);
      npc.lastState = currentState;
      this.synchronizeSpriteVisual(npc);
    }

    const frameTargets = Object.freeze([
      cloneTargetSnapshot(playerTarget),
      ...this.npcs
        .filter((npc) => npc.sprite.isVisible)
        .map(createNpcTargetSnapshot)
    ]);
    const targetsById = new Map(
      frameTargets.map((target) => [target.id, target])
    );
    if (targetsById.size !== frameTargets.length) {
      throw new Error("NPC更新の標的IDが重複しています。");
    }

    const threatenedIds = new Set<string>();
    const threatSourcesByTargetId = new Map<string, Vector3>();
    const capturedTargetIds = new Set<string>(
      this.playerBlockedTargetIds
    );

    for (const threat of this.externalThreats) {
      const target = targetsById.get(threat.targetId);
      if (!target) {
        throw new Error(
          `外部脅威の対象が現在frameに存在しません: ${threat.targetId}`
        );
      }
      if (!target.alive) {
        continue;
      }
      threatenedIds.add(target.id);
      threatSourcesByTargetId.set(
        target.id,
        threat.sourcePosition.clone()
      );
    }

    if (this.aiSuspended) {
      for (const npc of this.npcs) {
        if (!npc.sprite.isVisible) {
          continue;
        }
        npc.navigationAgent.clear();
        if (npc.capture) {
          capturedTargetIds.add(npc.capture.targetId);
          this.registerCaptureThreat(
            npc,
            npc.capture.targetId,
            threatenedIds,
            threatSourcesByTargetId
          );
        }
      }
      this.finishFrame(threatenedIds);
      return;
    }

    this.advanceAlarmTargetQueues(targetsById);
    const startedBreakawayNpcIds = this.advanceCaptures(
      deltaSeconds,
      targetsById,
      capturedTargetIds,
      threatenedIds,
      threatSourcesByTargetId
    );

    const targetSpatialIndex = createV2HumanTargetSpatialIndex(
      frameTargets,
      NPC_VISION_RANGE
    );
    for (const npc of this.npcs) {
      if (!npc.sprite.isVisible) {
        npc.navigationAgent.clear();
        continue;
      }
      const state = npc.stateSystem.getSnapshot().state;
      if (
        state !== "brainwash-complete-gun" &&
        state !== "brainwash-complete-no-gun"
      ) {
        if (isStoppedState(state)) {
          npc.navigationAgent.clear();
        }
        continue;
      }
      if (npc.capture) {
        continue;
      }
      if (
        state === "brainwash-complete-no-gun" &&
        npc.breakawayRemainingSeconds > 0
      ) {
        if (!startedBreakawayNpcIds.has(npc.id)) {
          this.updateBreakaway(npc, deltaSeconds);
        }
        continue;
      }

      const target = this.selectCombatTarget(
        npc,
        state,
        targetSpatialIndex,
        targetsById,
        capturedTargetIds
      );
      if (!target) {
        npc.navigationAgent.clear();
        continue;
      }

      threatenedIds.add(target.id);
      threatSourcesByTargetId.set(target.id, npc.footPosition.clone());
      if (state === "brainwash-complete-gun") {
        this.updateGunNpc(npc, target, deltaSeconds);
      } else {
        this.updateNoGunNpc(
          npc,
          target,
          deltaSeconds,
          capturedTargetIds,
          threatenedIds,
          threatSourcesByTargetId
        );
      }
    }

    for (const npc of this.npcs) {
      if (!npc.sprite.isVisible) {
        continue;
      }
      const state = npc.stateSystem.getSnapshot().state;
      if (!isV2AliveState(state)) {
        continue;
      }
      const threatened = threatenedIds.has(npc.id);
      npc.stateSystem.setAliveBehaviorState(
        threatened ? "evade" : "normal"
      );
      npc.lastState = npc.stateSystem.getSnapshot().state;
      this.synchronizeSpriteVisual(npc);
      if (capturedTargetIds.has(npc.id)) {
        npc.navigationAgent.clear();
        npc.wanderDestination = null;
        continue;
      }
      if (threatened) {
        const threatPosition = threatSourcesByTargetId.get(npc.id);
        if (!threatPosition) {
          throw new Error(`脅威元座標がありません: ${npc.id}`);
        }
        this.updateEvadingNpc(npc, threatPosition, deltaSeconds);
      } else {
        this.updateNormalNpc(npc, deltaSeconds);
      }
    }

    this.finishFrame(threatenedIds);
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
      this.npcs
        .filter((npc) => npc.sprite.isVisible)
        .map((npc) =>
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

  applyBeamImpact(npcId: string, source: V2CharacterImpactSource) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    const accepted = npc.stateSystem.applyImpact(source);
    if (!accepted) {
      return false;
    }
    npc.lastState = npc.stateSystem.getSnapshot().state;
    this.synchronizeSpriteVisual(npc);
    npc.wanderDestination = null;
    npc.wanderWaitSeconds = 0;
    npc.alarmTargetQueue.length = 0;
    npc.capture = null;
    npc.breakawayRemainingSeconds = 0;
    npc.breakawayDestination = null;
    this.clearTarget(npc);
    this.releaseCapturesForTarget(npcId);
    this.targetSnapshots = this.buildTargetSnapshots();
    this.actorSpheres = this.buildActorSpheres();
    return true;
  }

  prepareExecutionTarget(npcId: string) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    npc.stateSystem.prepareExecutionTarget();
    this.finishScriptedStateChange(npc);
  }

  prepareExecutionAudience(npcId: string) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    npc.stateSystem.prepareExecutionAudience();
    this.finishScriptedStateChange(npc);
  }

  prepareExecutionShooter(npcId: string) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    npc.stateSystem.prepareExecutionShooter();
    this.finishScriptedStateChange(npc);
  }

  enterFormationState(npcId: string) {
    this.assertActive();
    const npc = this.requireNpc(npcId);
    const accepted = npc.stateSystem.enterFormationState();
    if (!accepted) {
      return false;
    }
    this.finishScriptedStateChange(npc);
    return true;
  }

  drainBeamRequests() {
    this.assertActive();
    const requests = Object.freeze(
      this.pendingBeamRequests.map((request) =>
        Object.freeze({
          ...request,
          targetPolicy: request.targetPolicy,
          origin: request.origin.clone(),
          direction: request.direction.clone()
        })
      )
    );
    this.pendingBeamRequests.length = 0;
    return requests;
  }

  getCaptureSnapshots() {
    this.assertActive();
    return Object.freeze(
      this.npcs.flatMap((npc) =>
        npc.sprite.isVisible && npc.capture
          ? [
              Object.freeze({
                npcId: npc.id,
                targetId: npc.capture.targetId,
                remainingSeconds: npc.capture.remainingSeconds
              })
            ]
          : []
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

  applyAlarmTargetEvents(events: readonly V2AlarmTriggerEvent[]) {
    this.assertActive();
    for (const event of events) {
      assertAlarmTargetEvent(event);
    }
    const influenceRadiusSquared =
      V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS *
      V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS;
    for (const npc of this.npcs) {
      const state = npc.stateSystem.getSnapshot().state;
      if (
        !npc.sprite.isVisible ||
        (state !== "brainwash-complete-gun" &&
          state !== "brainwash-complete-no-gun")
      ) {
        continue;
      }
      let receivedAlarm = false;
      for (const event of events) {
        if (npc.id === event.targetId) {
          continue;
        }
        const offsetX = npc.footPosition.x - event.position.x;
        const offsetZ = npc.footPosition.z - event.position.z;
        if (
          offsetX * offsetX + offsetZ * offsetZ >
          influenceRadiusSquared
        ) {
          continue;
        }
        receivedAlarm = true;
        const queued = npc.alarmTargetQueue.find(
          (entry) => entry.targetId === event.targetId
        );
        if (!queued) {
          npc.alarmTargetQueue.push({
            candidateId: event.candidateId,
            targetId: event.targetId
          });
        }
      }
      if (!receivedAlarm) {
        continue;
      }
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      npc.capture = null;
      npc.navigationAgent.clear();
      this.clearTarget(npc);
    }
  }

  getThreatenedTargetIds() {
    this.assertActive();
    return Object.freeze([...this.threatenedTargetIds]);
  }

  setExternalThreats(threats: readonly V2NpcExternalThreat[]) {
    this.assertActive();
    for (const threat of threats) {
      if (threat.targetId.length === 0) {
        throw new Error("外部脅威の対象IDを空にできません。");
      }
      assertFiniteVector("外部脅威の発生元", threat.sourcePosition);
    }
    this.externalThreats = Object.freeze(
      threats.map((threat) =>
        Object.freeze({
          targetId: threat.targetId,
          sourcePosition: threat.sourcePosition.clone()
        })
      )
    );
  }

  setPlayerBlockedTargetIds(targetIds: readonly string[]) {
    this.assertActive();
    const uniqueTargetIds = new Set<string>();
    for (const targetId of targetIds) {
      if (uniqueTargetIds.has(targetId)) {
        throw new Error(
          `プレイヤー停止対象NPC IDが重複しています: ${targetId}`
        );
      }
      this.requireNpc(targetId);
      uniqueTargetIds.add(targetId);
    }
    this.playerBlockedTargetIds = Object.freeze([...targetIds]);
  }

  setVisibleNpcIds(npcIds: readonly string[]) {
    this.assertActive();
    const visibleNpcIds = new Set<string>();
    for (const npcId of npcIds) {
      if (visibleNpcIds.has(npcId)) {
        throw new Error(`表示NPC IDが重複しています: ${npcId}`);
      }
      this.requireNpc(npcId);
      visibleNpcIds.add(npcId);
    }

    for (const npc of this.npcs) {
      const visible = visibleNpcIds.has(npc.id);
      npc.sprite.isVisible = visible;
      if (!visible) {
        npc.navigationAgent.clear();
        npc.wanderDestination = null;
        npc.alarmTargetQueue.length = 0;
        npc.capture = null;
        npc.breakawayRemainingSeconds = 0;
        npc.breakawayDestination = null;
        this.clearTarget(npc);
      }
      this.synchronizeSpriteVisual(npc);
    }
    for (const npc of this.npcs) {
      const capture = npc.capture;
      const capturedNpcId =
        capture && this.npcsById.has(capture.targetId)
          ? capture.targetId
          : null;
      if (
        capture &&
        capturedNpcId &&
        !visibleNpcIds.has(capturedNpcId)
      ) {
        this.releaseCaptureImmediately(npc);
      }
    }
    this.threatenedTargetIds = Object.freeze(
      this.threatenedTargetIds.filter(
        (targetId) =>
          !this.npcsById.has(targetId) || visibleNpcIds.has(targetId)
      )
    );
    this.targetSnapshots = this.buildTargetSnapshots();
    this.actorSpheres = this.buildActorSpheres();
  }

  setAiSuspended(suspended: boolean) {
    this.assertActive();
    if (this.aiSuspended === suspended) {
      return;
    }
    this.aiSuspended = suspended;
    for (const npc of this.npcs) {
      npc.navigationAgent.clear();
    }
  }

  placeNpcs(assignments: readonly V2NpcPlacementAssignment[]) {
    this.assertActive();
    if (assignments.length !== this.npcs.length) {
      throw new Error(
        `NPC配置指定数が一致しません: expected=${this.npcs.length}, actual=${assignments.length}`
      );
    }

    const assignmentIds = new Set<string>();
    const resolvedPlacements: ResolvedPlacement[] = [];
    for (const assignment of assignments) {
      if (assignment.id.length === 0) {
        throw new Error("NPC配置IDを空にできません。");
      }
      if (assignmentIds.has(assignment.id)) {
        throw new Error(`NPC配置IDが重複しています: ${assignment.id}`);
      }
      assignmentIds.add(assignment.id);
      assertFiniteVector(
        `NPC配置${assignment.id}の足元`,
        assignment.footPosition
      );
      const npc = this.requireNpc(assignment.id);
      if (
        assignment.formation &&
        !isV2BrainwashState(npc.stateSystem.getSnapshot().state)
      ) {
        throw new Error(
          `aliveまたはhit NPCを集合状態へ配置できません: ${assignment.id}`
        );
      }
      const projected = this.stage.navigation.projectPoint(
        assignment.footPosition,
        PLACEMENT_PROJECTION_MAX_DISTANCE
      );
      if (
        !projected ||
        Vector3.Distance(projected.position, assignment.footPosition) >
          PLACEMENT_PROJECTION_MAX_DISTANCE
      ) {
        throw new Error(
          `NPC配置をNavMeshへ0.1以内で投影できません: ${assignment.id}`
        );
      }
      resolvedPlacements.push(
        Object.freeze({
          npc,
          navigationLocation: cloneNavigationLocation(projected),
          footPosition: this.resolveFootPosition(projected.position),
          formation: assignment.formation
        })
      );
    }

    for (const placement of resolvedPlacements) {
      const npc = placement.npc;
      npc.navigationAgent.clear();
      npc.navigationLocation = placement.navigationLocation;
      npc.footPosition = placement.footPosition;
      npc.wanderDestination = null;
      npc.wanderWaitSeconds = this.nextWanderWait();
      npc.alarmTargetQueue.length = 0;
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      this.clearTarget(npc);
      if (placement.formation) {
        npc.stateSystem.enterFormationState();
      }
      npc.lastState = npc.stateSystem.getSnapshot().state;
      npc.sprite.position.copyFrom(toAimPosition(npc.footPosition));
      this.synchronizeSpriteVisual(npc);
    }
    this.threatenedTargetIds = Object.freeze([]);
    this.targetSnapshots = this.buildTargetSnapshots();
    this.actorSpheres = this.buildActorSpheres();
  }

  dispose() {
    this.assertActive();
    this.disposed = true;
    this.pendingAlertRequests.length = 0;
    this.pendingBeamRequests.length = 0;
    for (const npc of this.npcs) {
      npc.navigationAgent.clear();
      npc.sprite.dispose();
    }
    this.spriteManager.dispose();
  }

  private synchronizeStateMode(
    npc: NpcRuntime,
    previousState: V2CharacterState,
    currentState: V2CharacterState
  ) {
    if (previousState === currentState) {
      return;
    }
    if (
      currentState !== "brainwash-complete-gun" &&
      currentState !== "brainwash-complete-no-gun"
    ) {
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      this.clearTarget(npc);
    }
    if (currentState === "brainwash-complete-gun") {
      npc.fireCooldownSeconds = this.nextInitialGunCooldown();
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      this.clearTarget(npc);
    }
    if (currentState === "brainwash-complete-no-gun") {
      npc.fireCooldownSeconds = 0;
      npc.capture = null;
      npc.breakawayRemainingSeconds = 0;
      npc.breakawayDestination = null;
      npc.wanderDestination = null;
      this.clearTarget(npc);
    }
    if (isV2AliveState(currentState) && !isV2AliveState(previousState)) {
      npc.wanderDestination = null;
      npc.wanderWaitSeconds = this.nextWanderWait();
    }
  }

  private advanceAlarmTargetQueues(
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>
  ) {
    for (const npc of this.npcs) {
      for (let index = npc.alarmTargetQueue.length - 1; index >= 0; index -= 1) {
        const entry = npc.alarmTargetQueue[index];
        const target = targetsById.get(entry.targetId);
        if (
          !target ||
          target.id === npc.id ||
          isV2BrainwashState(target.state)
        ) {
          npc.alarmTargetQueue.splice(index, 1);
        }
      }
      if (npc.targetProvenance === "alert") {
        const first = npc.alarmTargetQueue[0];
        if (!first || first.targetId !== npc.targetId) {
          this.clearTarget(npc);
        }
      }
    }
  }

  private advanceCaptures(
    deltaSeconds: number,
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    capturedTargetIds: Set<string>,
    threatenedIds: Set<string>,
    threatSourcesByTargetId: Map<string, Vector3>
  ) {
    const startedBreakawayNpcIds = new Set<string>();
    for (const npc of this.npcs) {
      if (!npc.capture) {
        continue;
      }
      const target = targetsById.get(npc.capture.targetId);
      if (!target || !this.isTargetable(npc, target)) {
        this.releaseCaptureImmediately(npc);
        continue;
      }
      npc.capture.lastTargetFootPosition.copyFrom(target.footPosition);
      npc.capture.remainingSeconds -= deltaSeconds;
      if (npc.capture.remainingSeconds <= 0) {
        this.startBreakaway(npc, target.footPosition);
        startedBreakawayNpcIds.add(npc.id);
        continue;
      }
      capturedTargetIds.add(target.id);
      this.registerCaptureThreat(
        npc,
        target.id,
        threatenedIds,
        threatSourcesByTargetId
      );
    }
    return startedBreakawayNpcIds;
  }

  private registerCaptureThreat(
    npc: NpcRuntime,
    targetId: string,
    threatenedIds: Set<string>,
    threatSourcesByTargetId: Map<string, Vector3>
  ) {
    threatenedIds.add(npc.id);
    threatenedIds.add(targetId);
    threatSourcesByTargetId.set(targetId, npc.footPosition.clone());
    const target = this.npcsById.get(targetId);
    if (target) {
      threatSourcesByTargetId.set(npc.id, target.footPosition.clone());
    }
  }

  private selectCombatTarget(
    npc: NpcRuntime,
    state: "brainwash-complete-gun" | "brainwash-complete-no-gun",
    targetSpatialIndex: V2HumanTargetSpatialIndex,
    targetsById: ReadonlyMap<string, V2HumanTargetSnapshot>,
    capturedTargetIds: ReadonlySet<string>
  ) {
    const alarmTarget = npc.alarmTargetQueue[0];
    if (alarmTarget) {
      const target = targetsById.get(alarmTarget.targetId);
      if (
        !target ||
        target.id === npc.id ||
        isV2BrainwashState(target.state)
      ) {
        throw new Error(
          `prune後のalarm targetが標的不能です: ${alarmTarget.targetId}`
        );
      }
      this.setTarget(
        npc,
        target.id,
        "alert",
        `alarm:${alarmTarget.candidateId}`,
        0
      );
      return target;
    }

    if (npc.targetProvenance === "visual" && npc.targetId) {
      const currentTarget = targetsById.get(npc.targetId);
      if (
        currentTarget &&
        !capturedTargetIds.has(currentTarget.id) &&
        this.isVisuallyTargetable(npc, currentTarget)
      ) {
        return currentTarget;
      }
      this.clearTarget(npc);
    }

    const visibleTarget = this.findNearestVisibleTarget(
      npc,
      targetSpatialIndex.query(
        toAimPosition(npc.footPosition),
        NPC_VISION_RANGE
      ),
      capturedTargetIds
    );
    if (!visibleTarget) {
      this.clearTarget(npc);
      return null;
    }
    this.setTarget(npc, visibleTarget.id, "visual", null, 0);
    if (state === "brainwash-complete-gun") {
      this.pendingAlertRequests.push(
        Object.freeze({
          leaderId: npc.id,
          targetId: visibleTarget.id
        })
      );
    }
    return visibleTarget;
  }

  private updateGunNpc(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number
  ) {
    this.chaseTarget(npc, target, deltaSeconds);
    const origin = toAimPosition(npc.footPosition);
    const toTarget = target.aimPosition.subtract(origin);
    const distanceSquared = toTarget.lengthSquared();
    if (
      distanceSquared === 0 ||
      distanceSquared > NPC_GUN_RANGE_SQUARED ||
      this.stage.queries.castSightSegment(origin, target.aimPosition) !== null
    ) {
      return;
    }
    npc.fireCooldownSeconds -= deltaSeconds;
    if (npc.fireCooldownSeconds > 0) {
      return;
    }
    const direction = toTarget.scale(1 / Math.sqrt(distanceSquared));
    this.pendingBeamRequests.push(
      Object.freeze({
        sourceId: npc.id,
        originKind: "npc-gun" as const,
        targetPolicy: ALIVE_HUMANS_TARGET_POLICY,
        origin,
        direction,
        speed: V2_NPC_GUN_BEAM_SPEED,
        maximumLifetime: V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS
      })
    );
    npc.fireCooldownSeconds = this.nextFireInterval();
  }

  private updateNoGunNpc(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number,
    capturedTargetIds: Set<string>,
    threatenedIds: Set<string>,
    threatSourcesByTargetId: Map<string, Vector3>
  ) {
    if (npc.alarmTargetQueue.length > 0) {
      this.chaseTarget(npc, target, deltaSeconds);
      return;
    }
    if (
      target.alive &&
      !capturedTargetIds.has(target.id) &&
      Vector3.Distance(npc.footPosition, target.footPosition) <=
        V2_NPC_CAPTURE_RADIUS
    ) {
      npc.capture = {
        targetId: target.id,
        remainingSeconds: V2_NPC_CAPTURE_DURATION_SECONDS,
        lastTargetFootPosition: target.footPosition.clone()
      };
      capturedTargetIds.add(target.id);
      npc.navigationAgent.clear();
      this.pendingAlertRequests.push(
        Object.freeze({
          leaderId: npc.id,
          targetId: target.id
        })
      );
      this.registerCaptureThreat(
        npc,
        target.id,
        threatenedIds,
        threatSourcesByTargetId
      );
      return;
    }
    this.chaseTarget(npc, target, deltaSeconds);
  }

  private chaseTarget(
    npc: NpcRuntime,
    target: V2HumanTargetSnapshot,
    deltaSeconds: number
  ) {
    npc.wanderDestination = null;
    const movement = npc.navigationAgent.update(
      npc.navigationLocation,
      target.footPosition,
      NPC_CHASE_SPEED,
      deltaSeconds
    );
    this.applyNavigationMovement(npc, movement.location);
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

  private updateEvadingNpc(
    npc: NpcRuntime,
    threatPosition: Vector3,
    deltaSeconds: number
  ) {
    npc.targetId = null;
    npc.targetProvenance = null;
    npc.alertLeaderId = null;
    npc.alertRemainingSeconds = 0;
    if (!npc.wanderDestination) {
      const away = npc.footPosition.subtract(threatPosition);
      away.y = 0;
      if (away.lengthSquared() === 0) {
        away.copyFrom(npc.forward).scaleInPlace(-1);
      } else {
        away.normalize();
      }
      const candidate = npc.navigationLocation.position.add(
        away.scale(NPC_WANDER_RADIUS)
      );
      npc.wanderDestination = this.stage.navigation.constrainMovement(
        npc.navigationLocation,
        candidate
      );
      npc.navigationAgent.clear();
      if (!npc.wanderDestination) {
        return;
      }
    }
    const movement = npc.navigationAgent.update(
      npc.navigationLocation,
      npc.wanderDestination.position,
      NPC_CHASE_SPEED,
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
    }
  }

  private updateBreakaway(npc: NpcRuntime, deltaSeconds: number) {
    npc.breakawayRemainingSeconds = Math.max(
      0,
      npc.breakawayRemainingSeconds - deltaSeconds
    );
    if (npc.breakawayDestination) {
      const movement = npc.navigationAgent.update(
        npc.navigationLocation,
        npc.breakawayDestination.position,
        V2_NPC_CAPTURE_BREAKAWAY_SPEED,
        deltaSeconds
      );
      const moved = this.applyNavigationMovement(npc, movement.location);
      if (
        !moved ||
        movement.state === "arrived" ||
        movement.state === "unreachable"
      ) {
        npc.navigationAgent.clear();
        npc.breakawayDestination = null;
      }
    }
    if (npc.breakawayRemainingSeconds === 0) {
      npc.navigationAgent.clear();
      npc.breakawayDestination = null;
    }
  }

  private startBreakaway(npc: NpcRuntime, targetFootPosition: Vector3) {
    npc.capture = null;
    this.clearTarget(npc);
    npc.breakawayRemainingSeconds = V2_NPC_CAPTURE_BREAKAWAY_SECONDS;
    const away = npc.footPosition.subtract(targetFootPosition);
    away.y = 0;
    if (away.lengthSquared() === 0) {
      away.copyFrom(npc.forward).scaleInPlace(-1);
    } else {
      away.normalize();
    }
    const candidate = npc.navigationLocation.position.add(
      away.scale(NPC_EVADE_DISTANCE)
    );
    npc.breakawayDestination = this.stage.navigation.constrainMovement(
      npc.navigationLocation,
      candidate
    );
  }

  private findNearestVisibleTarget(
    npc: NpcRuntime,
    targets: readonly V2HumanTargetSnapshot[],
    excludedTargetIds: ReadonlySet<string>
  ) {
    let nearest: V2HumanTargetSnapshot | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      if (
        excludedTargetIds.has(target.id) ||
        !this.isVisuallyTargetable(npc, target)
      ) {
        continue;
      }
      const distanceSquared = Vector3.DistanceSquared(
        toAimPosition(npc.footPosition),
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
    const origin = toAimPosition(npc.footPosition);
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
    const displacement = nextLocation.position.subtract(
      npc.navigationLocation.position
    );
    if (displacement.lengthSquared() === 0) {
      return true;
    }
    const nextFootPosition = this.resolveFootPosition(nextLocation.position);
    const currentAimPosition = toAimPosition(npc.footPosition);
    const nextAimPosition = toAimPosition(nextFootPosition);
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
    const horizontal = new Vector3(displacement.x, 0, displacement.z);
    if (horizontal.lengthSquared() > 0) {
      npc.forward.copyFrom(horizontal.normalize());
    }
    npc.navigationLocation = cloneNavigationLocation(nextLocation);
    npc.footPosition = nextFootPosition;
    return true;
  }

  private resolveFootPosition(navigationPosition: Vector3) {
    const probeOrigin = navigationPosition.add(
      new Vector3(0, GROUND_PROBE_UPWARD_OFFSET, 0)
    );
    const ground = this.stage.queries.sampleGround(
      probeOrigin,
      GROUND_PROBE_DISTANCE
    );
    if (!ground) {
      throw new Error(
        `NPCのNavMesh位置に物理床がありません: (${navigationPosition.x}, ${navigationPosition.y}, ${navigationPosition.z})`
      );
    }
    return new Vector3(
      navigationPosition.x,
      ground.point.y,
      navigationPosition.z
    );
  }

  private setTarget(
    npc: NpcRuntime,
    targetId: string,
    provenance: V2TargetProvenance,
    alertLeaderId: string | null,
    alertRemainingSeconds: number
  ) {
    const changed =
      npc.targetId !== targetId ||
      npc.targetProvenance !== provenance;
    npc.targetId = targetId;
    npc.targetProvenance = provenance;
    npc.alertLeaderId = alertLeaderId;
    npc.alertRemainingSeconds = alertRemainingSeconds;
    npc.wanderDestination = null;
    if (changed) {
      npc.navigationAgent.clear();
    }
  }

  private clearTarget(npc: NpcRuntime) {
    npc.targetId = null;
    npc.targetProvenance = null;
    npc.alertLeaderId = null;
    npc.alertRemainingSeconds = 0;
    npc.navigationAgent.clear();
  }

  private releaseCapturesForTarget(targetId: string) {
    for (const npc of this.npcs) {
      if (npc.capture?.targetId === targetId) {
        this.releaseCaptureImmediately(npc);
      }
    }
  }

  private releaseCaptureImmediately(npc: NpcRuntime) {
    npc.capture = null;
    npc.breakawayRemainingSeconds = 0;
    npc.breakawayDestination = null;
    this.clearTarget(npc);
  }

  private finishScriptedStateChange(npc: NpcRuntime) {
    npc.lastState = npc.stateSystem.getSnapshot().state;
    this.synchronizeSpriteVisual(npc);
    npc.navigationAgent.clear();
    npc.wanderDestination = null;
    npc.wanderWaitSeconds = 0;
    npc.alarmTargetQueue.length = 0;
    npc.capture = null;
    npc.breakawayRemainingSeconds = 0;
    npc.breakawayDestination = null;
    this.clearTarget(npc);
    this.releaseCapturesForTarget(npc.id);
    this.targetSnapshots = this.buildTargetSnapshots();
    this.actorSpheres = this.buildActorSpheres();
  }

  private synchronizeSpriteVisual(npc: NpcRuntime) {
    const snapshot = npc.stateSystem.getSnapshot();
    npc.sprite.cellIndex = getSpriteCellIndex(snapshot.state);
    npc.sprite.color.a =
      snapshot.hitPhase === "fade"
        ? snapshot.hitPhaseRemainingSeconds /
          V2_HIT_FADE_DURATION_SECONDS
        : 1;
  }

  private finishFrame(threatenedIds: ReadonlySet<string>) {
    for (const npc of this.npcs) {
      npc.sprite.position.copyFrom(toAimPosition(npc.footPosition));
      this.synchronizeSpriteVisual(npc);
    }
    this.threatenedTargetIds = Object.freeze([...threatenedIds]);
    this.targetSnapshots = this.buildTargetSnapshots();
    this.actorSpheres = this.buildActorSpheres();
  }

  private buildTargetSnapshots() {
    return Object.freeze(
      this.npcs
        .filter((npc) => npc.sprite.isVisible)
        .map(createNpcTargetSnapshot)
    );
  }

  private buildActorSpheres(): readonly V2ActorSphere[] {
    return Object.freeze(
      this.npcs
        .filter((npc) => npc.sprite.isVisible)
        .map((npc) =>
          Object.freeze({
            id: npc.id,
            kind: "npc" as const,
            center: toAimPosition(npc.footPosition),
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

  private pickInitialBrainwashedState(): V2CharacterState {
    const roll = this.nextRandom();
    if (roll < NPC_INITIAL_GUN_CHANCE) {
      return "brainwash-complete-gun";
    }
    if (roll < NPC_INITIAL_GUN_CHANCE + NPC_INITIAL_NO_GUN_CHANCE) {
      return "brainwash-complete-no-gun";
    }
    return "brainwash-complete-haigure";
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

  private nextFireInterval() {
    return (
      V2_NPC_GUN_INTERVAL_MIN_SECONDS +
      this.nextRandom() *
        (V2_NPC_GUN_INTERVAL_MAX_SECONDS -
          V2_NPC_GUN_INTERVAL_MIN_SECONDS)
    );
  }

  private nextInitialGunCooldown() {
    return this.nextFireInterval() * this.nextRandom();
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
