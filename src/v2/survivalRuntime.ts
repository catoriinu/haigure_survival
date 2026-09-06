import { Frustum, Vector3, type Scene } from "@babylonjs/core";

import {
  prepareBitFlightNavigationRouteCaches
} from "../world/bitFlightNavigation";
import type {
  NavigationRouteCandidate
} from "../world/navigationWorld";
import type {
  StageAssemblyVenue,
  StagePlayerSpawn,
  StageSpatialSession
} from "../world/stageSpatialContext";
import {
  createV2NavigationAlarmCandidateProvider
} from "./alarmCandidateProvider";
import {
  createV2AlarmSystem,
  type V2AlarmFrame,
  type V2AlarmSystem
} from "./alarmSystem";
import {
  createV2AlertCoordinator,
  type V2AlertCoordinator
} from "./alertCoordinator";
import { createAssemblyPositions } from "./assemblyLayout";
import {
  createV2BeamSystem,
  V2_BEAM_VISUAL_POOL_KINDS,
  type V2BeamFrameEvents,
  type V2BeamSystem
} from "./beamCollision";
import {
  createV2BitSystem,
  type V2BitFrameView,
  type V2BitSystem
} from "./bitSystem";
import {
  createV2HitEffectSystem,
  V2_HIT_EFFECT_POOL_KINDS,
  type V2HitEffectSystem
} from "./hitEffectSystem";
import {
  type V2BeamRequest,
  type V2ActorSphere,
  type V2CharacterState,
  type V2HumanTargetSnapshot,
  type V2PlayerCompletionState,
  type V2TargetProvenance
} from "./combatTypes";
import {
  createV2GameplayAudioEventQueue,
  type V2GameplayAudioEvent
} from "./gameplayAudioEventQueue";
import {
  createV2MissionRuntime,
  resolveV2MissionAssemblyVenueId,
  V2_REQUIRED_ASSEMBLY_VENUE_IDS,
  type V2BroadcastCommand,
  type V2MissionElevatorSnapshot,
  type V2MissionFrame,
  type V2MissionNpcSnapshot,
  type V2MissionRuntime,
  type V2MissionView
} from "./missionRuntime";
import {
  createV2BroadcastRuntime,
  type V2BroadcastRuntime
} from "./broadcastRuntime";
import type { V2InstantPublicExecutionScenario } from "./titleSettingsSession";

export type { V2GameplayAudioEvent } from "./gameplayAudioEventQueue";
import {
  V2_NPC_CAPTURE_RADIUS,
  createV2NpcSystem,
  type V2NpcBeamImpact,
  type V2NpcBeamSpawn,
  type V2NpcCommandCandidate,
  type V2NpcCommandKind,
  type V2NpcCommandQuery,
  type V2NpcExecutionRoleAssignment,
  type V2NpcExternalThreat,
  type V2NpcNavigationRouteContext,
  type V2NpcSystem
} from "./npcSystem";
import type {
  V2NpcTraversalNotification,
  V2NpcTraversalRequest,
  V2NpcTraversalResult,
  V2NpcTraversalState,
  V2PlayerElevatorTraversalSnapshot
} from "./npcTraversal";
import type {
  V2PerformanceDiagnostics,
  V2PerformanceScenario
} from "./performanceDiagnostics";
import type { V2StressWorkloadSnapshot } from "./performanceStressWorkload";
import {
  createV2TargetNavigationAreaTracker,
  type V2TargetNavigationAreaTracker
} from "./pursuitNavigation";
import type { V2CharacterVisualRuntime } from "./v2CharacterVisualRuntime";
import {
  V2_PLAYER_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS,
  V2_PLAYER_GUN_BEAM_ORIGIN_OFFSET,
  V2_PLAYER_GUN_BEAM_SPEED,
  createV2PlayerCombatSystem,
  type V2PlayerCombatSystem,
  type V2PlayerGunFireEvent
} from "./playerCombatSystem";
import type { V2PlayerController } from "./playerController";
import {
  createV2PublicExecutionCandidate,
  createV2PublicExecutionSystem,
  type V2ExecutionBlock,
  type V2ExecutionCandidate,
  type V2ExecutionPlayerRole,
  type V2ExecutionShotEvent,
  type V2ExecutionVariant,
  type V2PublicExecutionFrame,
  type V2PublicExecutionSystem
} from "./publicExecutionSystem";
import {
  V2_PLAYER_BLOCK_RADIUS,
  areAllV2HumansBrainwashed,
  canV2SurvivalPlayerMove,
  createV2ExecutionBitPositions,
  selectV2ExecutionAudienceIds,
  selectV2PlayerBlockedNpcIds
} from "./survivalRules";

const ALERT_DURATION_SECONDS = 15;
const PERFORMANCE_ALERT_REFRESH_SECONDS = 10;
const ALL_DEAD_ASSEMBLY_DELAY_SECONDS = 3;
export const V2_HOSTILE_STARTUP_GRACE_SECONDS = 5;
const PLAYER_ID = "player";
const EMPTY_ALARM_FRAME: V2AlarmFrame = Object.freeze({
  events: Object.freeze([]),
  activeCandidateIds: Object.freeze([]),
  activeFloors: Object.freeze([]),
  usedCandidateIds: Object.freeze([]),
  blinks: Object.freeze([])
});

export const selectV2PlayerNoGunTouchTargetIds = (
  enabled: boolean,
  playerState: V2CharacterState,
  playerFootPosition: Vector3,
  npcTargets: readonly V2HumanTargetSnapshot[]
): readonly string[] => {
  if (!enabled || playerState !== "brainwash-complete-no-gun") {
    return Object.freeze([]);
  }
  const radiusSquared = V2_NPC_CAPTURE_RADIUS * V2_NPC_CAPTURE_RADIUS;
  return Object.freeze(
    npcTargets
      .filter((target) => {
        if (target.kind !== "npc" || !target.alive || target.brainwashed) {
          return false;
        }
        const deltaX = target.footPosition.x - playerFootPosition.x;
        const deltaY = target.footPosition.y - playerFootPosition.y;
        const deltaZ = target.footPosition.z - playerFootPosition.z;
        return (
          deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ <=
          radiusSquared
        );
      })
      .map((target) => target.id)
  );
};

export type V2SurvivalPhase =
  | "playing"
  | "assembly"
  | "execution"
  | "execution-complete";

export type V2NpcHudCategory =
  | "unbrainwashed"
  | "haigure"
  | "gun"
  | "no-gun";

export type V2NpcHudCounts = Readonly<{
  unbrainwashed: number;
  haigure: number;
  gun: number;
  noGun: number;
}>;

const V2_NPC_HUD_CATEGORY_BY_STATE = Object.freeze({
  normal: "unbrainwashed",
  evade: "unbrainwashed",
  "hit-a": "haigure",
  "hit-b": "haigure",
  "brainwash-in-progress": "haigure",
  "brainwash-complete-gun": "gun",
  "brainwash-complete-no-gun": "no-gun",
  "brainwash-complete-haigure": "haigure",
  "brainwash-complete-haigure-formation": "haigure"
} satisfies Readonly<Record<V2CharacterState, V2NpcHudCategory>>);

export const summarizeV2NpcHudCounts = (
  states: readonly V2CharacterState[]
): V2NpcHudCounts => {
  let unbrainwashed = 0;
  let haigure = 0;
  let gun = 0;
  let noGun = 0;
  for (const state of states) {
    const category = V2_NPC_HUD_CATEGORY_BY_STATE[state];
    if (category === "unbrainwashed") {
      unbrainwashed += 1;
    } else if (category === "haigure") {
      haigure += 1;
    } else if (category === "gun") {
      gun += 1;
    } else {
      noGun += 1;
    }
  }
  return Object.freeze({ unbrainwashed, haigure, gun, noGun });
};

export type V2SurvivalFrame = Readonly<{
  phase: V2SurvivalPhase;
  assemblyVenueId: string;
  mission: V2MissionFrame | null;
  playerState: V2CharacterState;
  playerNoGunTouchBrainwashProgress: number | null;
  playerCompletionUnlocked: boolean;
  playerCanMove: boolean;
  npcCount: number;
  npcHudCounts: V2NpcHudCounts;
  brainwashedNpcCount: number;
  bitCount: number;
  activeBeamCount: number;
  activeAlertCount: number;
  activeAlarmCount: number;
  alarmBlinkCount: number;
  alarmTriggerCount: number;
  alarm: V2AlarmFrame;
  captureCount: number;
  executionVariant: V2ExecutionVariant | null;
  executionPlayerRole: V2ExecutionPlayerRole | null;
  executionPendingTargetIds: readonly string[];
  executionTargetCount: number;
  executionCompletedTargetCount: number;
  visualTargetCount: number;
  alertTargetCount: number;
  npcPlayerTargetCount: number;
  bitPlayerTargetCount: number;
  blockerImpactCount: number;
  actorImpactCount: number;
}>;

export type V2TargetTrackingSample = Readonly<{
  targetId: string | null;
  provenance: V2TargetProvenance | null;
}>;

export type V2TargetTrackingSummary = Readonly<{
  visualTargetCount: number;
  alertTargetCount: number;
  npcPlayerTargetCount: number;
  bitPlayerTargetCount: number;
}>;

export type V2MinimapActorSnapshot = Readonly<{
  id: string;
  kind: "npc" | "bit";
  areaPosition: Vector3;
  sightPosition: Vector3;
  follower: boolean;
}>;

const EMPTY_V2_MINIMAP_ACTOR_SNAPSHOTS: readonly V2MinimapActorSnapshot[] =
  Object.freeze([]);

export const summarizeV2TargetTracking = (
  npcTracking: readonly V2TargetTrackingSample[],
  bitTracking: readonly V2TargetTrackingSample[]
): V2TargetTrackingSummary => {
  let visualTargetCount = 0;
  let alertTargetCount = 0;
  let npcPlayerTargetCount = 0;
  let bitPlayerTargetCount = 0;
  for (const tracking of npcTracking) {
    if (tracking.targetId === PLAYER_ID) {
      npcPlayerTargetCount += 1;
    }
    if (tracking.provenance === "visual") {
      visualTargetCount += 1;
    } else if (tracking.provenance === "alert") {
      alertTargetCount += 1;
    }
  }
  for (const tracking of bitTracking) {
    if (tracking.targetId === PLAYER_ID) {
      bitPlayerTargetCount += 1;
    }
    if (tracking.provenance === "visual") {
      visualTargetCount += 1;
    } else if (tracking.provenance === "alert") {
      alertTargetCount += 1;
    }
  }
  return Object.freeze({
    visualTargetCount,
    alertTargetCount,
    npcPlayerTargetCount,
    bitPlayerTargetCount
  });
};

export interface V2SurvivalRuntime {
  activateStartupScenario(): boolean;
  getFeatureResources(): V2SurvivalFeatureResources;
  getStressWorkloadSnapshot(): V2StressWorkloadSnapshot;
  prepareVisualResources(): Promise<void>;
  update(
    deltaSeconds: number,
    elapsedSeconds: number,
    playerElevatorTraversal: V2PlayerElevatorTraversalSnapshot | null,
    elevators: readonly V2MissionElevatorSnapshot[]
  ): V2SurvivalFrame;
  getFrame(): V2SurvivalFrame;
  drainAudioEvents(): readonly V2GameplayAudioEvent[];
  canPlayerMove(): boolean;
  releaseAssemblyPlayerControl(): boolean;
  selectPlayerCompletion(state: V2PlayerCompletionState): void;
  getNpcCommandCandidates(): readonly V2NpcCommandCandidate[];
  requestNpcCommand(npcId: string, kind: V2NpcCommandKind): boolean;
  cancelNpcFollow(npcId: string): boolean;
  notifyPlayerElevatorStartedMoving(): void;
  setHostileActionsSuspended(suspended: boolean): void;
  requestBroadcast(command: V2BroadcastCommand): boolean;
  previewNpcLocationMissionRoute(
    npcId: string,
    locationId: string
  ): NavigationRouteCandidate["kind"] | null;
  requestNpcLocationMission(
    npcId: string,
    locationId: string
  ): V2MissionView;
  getMissions(): readonly V2MissionView[];
  getHumanTargets(): readonly V2HumanTargetSnapshot[];
  getBitActors(): readonly V2ActorSphere[];
  getMinimapActors(): readonly V2MinimapActorSnapshot[];
  releaseNpcTraversalForScriptedPhase(): void;
  drainNpcTraversalRequests(): readonly V2NpcTraversalRequest[];
  applyNpcTraversalResults(
    results: readonly V2NpcTraversalResult[]
  ): readonly V2NpcTraversalNotification[];
  getNpcTraversalState(npcId: string): V2NpcTraversalState;
  getNpcPosition(npcId: string): Vector3;
  setNpcTransportPosition(npcId: string, position: Vector3): void;
  relocateBit(bitId: string, candidates: readonly Vector3[]): Vector3;
  beginTargetNavigationAreaTransport(targetId: string, position: Vector3): void;
  updateTargetNavigationAreaTransportPosition(targetId: string, position: Vector3): void;
  relocateTargetNavigationArea(targetId: string, position: Vector3): void;
  requestPlayerGunFire(direction: Vector3): boolean;
  replayExecution(): void;
  dispose(): void;
}

export type V2SurvivalPopulation = Readonly<{
  npcCount: number;
  initialBrainwashedNpcCount: number;
  initialBitCount: number;
  bitReinforcementIntervalSeconds: number;
  maximumBitCount: number;
}>;

export type V2SurvivalFeatureResources = Readonly<{
  missionRuntime: boolean;
  broadcastRuntime: boolean;
  alarmCandidateProvider: boolean;
  alarmSystem: boolean;
}>;

export const resolveV2SurvivalFeatureResources = (
  features: V2SurvivalRuntimeOptions["features"]
): V2SurvivalFeatureResources =>
  Object.freeze({
    missionRuntime: features.missionEnabled,
    broadcastRuntime: !features.missionEnabled,
    alarmCandidateProvider: features.alarmEnabled,
    alarmSystem: features.alarmEnabled
  });

export const V2_TEST_SURVIVAL_POPULATION: V2SurvivalPopulation =
  Object.freeze({
    npcCount: 50,
    initialBrainwashedNpcCount: 10,
    initialBitCount: 1,
    bitReinforcementIntervalSeconds: 10,
    maximumBitCount: 25
  });

export const V2_PERFORMANCE_ACCEPTANCE_POPULATION:
  V2SurvivalPopulation = Object.freeze({
    npcCount: 99,
    initialBrainwashedNpcCount: 66,
    initialBitCount: 50,
    bitReinforcementIntervalSeconds: 10,
    maximumBitCount: 50
  });

export type V2SurvivalRuntimeOptions = Readonly<{
  scene: Scene;
  stage: StageSpatialSession;
  playerSpawn: StagePlayerSpawn;
  player: V2PlayerController;
  initialPlayerState: V2CharacterState;
  characterVisuals: V2CharacterVisualRuntime;
  showGroundShadows: boolean;
  random: () => number;
  npcSpawnRandom: () => number;
  bitSpawnRandom: () => number;
  playerMissionRandom: () => number;
  npcMissionRandom: () => number;
  broadcastMissionRandom: () => number;
  getOrbVisibilityPredicate(): (position: Vector3) => boolean;
  population: V2SurvivalPopulation;
  features: Readonly<{
    missionEnabled: boolean;
    alarmEnabled: boolean;
  }>;
  startupScenario: V2InstantPublicExecutionScenario | null;
  brainwashSettings: Readonly<{
    instantBrainwash: boolean;
    brainwashOnNoGunTouch: boolean;
    gunPercent: number;
    noGunPercent: number;
  }>;
  performanceDiagnostics: V2PerformanceDiagnostics | null;
  performanceWorkloadScenario: V2PerformanceScenario | null;
  releaseStageTraversalForScriptedPhase(): void;
  selectNavigationRoute(
    context: V2NpcNavigationRouteContext,
    candidates: readonly NavigationRouteCandidate[]
  ): NavigationRouteCandidate | null;
}>;

export type V2SurvivalConstructionOwnerLabel =
  | "target-navigation-area-tracker"
  | "npc-system"
  | "mission-runtime"
  | "broadcast-runtime"
  | "bit-system"
  | "alert-coordinator"
  | "alarm-system"
  | "execution-system"
  | "hit-effect-system"
  | "beam-system";

export type V2SurvivalConstructionDependencies = Readonly<{
  ownerAcquired?(label: V2SurvivalConstructionOwnerLabel): void;
  ownerRolledBack?(label: V2SurvivalConstructionOwnerLabel): void;
}>;

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const assertFiniteVector = (name: string, value: Vector3) => {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`${name}には有限の3Dベクトルが必要です。`);
  }
};

const assertPopulation = (
  population: V2SurvivalPopulation
) => {
  const entries = [
    ["npcCount", population.npcCount],
    [
      "initialBrainwashedNpcCount",
      population.initialBrainwashedNpcCount
    ],
    ["initialBitCount", population.initialBitCount],
    ["maximumBitCount", population.maximumBitCount]
  ] as const;
  for (const [name, value] of entries) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        `V2SurvivalRuntimeのpopulation.${name}には0以上の整数が必要です。`
      );
    }
  }
  if (
    population.initialBrainwashedNpcCount >
    population.npcCount
  ) {
    throw new Error(
      "V2SurvivalRuntimeの初期洗脳済みNPC数はNPC総数以下である必要があります。"
    );
  }
  if (population.initialBitCount > population.maximumBitCount) {
    throw new Error(
      "V2SurvivalRuntimeの初期BIT数は最大BIT数以下である必要があります。"
    );
  }
  if (
    !Number.isFinite(population.bitReinforcementIntervalSeconds) ||
    population.bitReinforcementIntervalSeconds <= 0
  ) {
    throw new Error(
      "V2SurvivalRuntimeのpopulation.bitReinforcementIntervalSecondsには正の有限値が必要です。"
    );
  }
};

const getLookAtPosition = (
  footPosition: Vector3,
  center: Vector3
) => {
  const horizontal = center.subtract(footPosition);
  horizontal.y = 0;
  return horizontal.lengthSquared() > 1e-8
    ? center.clone()
    : center.add(new Vector3(0, 0, 1));
};

export const createV2SurvivalRuntime = ({
  scene,
  stage,
  playerSpawn,
  player,
  initialPlayerState,
  characterVisuals,
  showGroundShadows,
  random,
  npcSpawnRandom,
  bitSpawnRandom,
  playerMissionRandom,
  npcMissionRandom,
  broadcastMissionRandom,
  getOrbVisibilityPredicate,
  population,
  features,
  startupScenario,
  brainwashSettings,
  performanceDiagnostics,
  performanceWorkloadScenario,
  releaseStageTraversalForScriptedPhase,
  selectNavigationRoute
}: V2SurvivalRuntimeOptions,
constructionDependencies: V2SurvivalConstructionDependencies = Object.freeze({})
): V2SurvivalRuntime => {
  if (typeof random !== "function") {
    throw new Error("V2SurvivalRuntimeのrandomには関数が必要です。");
  }
  if (typeof npcSpawnRandom !== "function") {
    throw new Error("V2SurvivalRuntimeのnpcSpawnRandomには関数が必要です。");
  }
  if (typeof bitSpawnRandom !== "function") {
    throw new Error("V2SurvivalRuntimeのbitSpawnRandomには関数が必要です。");
  }
  if (typeof playerMissionRandom !== "function") {
    throw new Error("V2SurvivalRuntimeのplayerMissionRandomには関数が必要です。");
  }
  if (typeof npcMissionRandom !== "function") {
    throw new Error("V2SurvivalRuntimeのnpcMissionRandomには関数が必要です。");
  }
  if (typeof broadcastMissionRandom !== "function") {
    throw new Error("V2SurvivalRuntimeのbroadcastMissionRandomには関数が必要です。");
  }
  if (typeof getOrbVisibilityPredicate !== "function") {
    throw new Error(
      "V2SurvivalRuntimeのgetOrbVisibilityPredicateには関数が必要です。"
    );
  }
  if (
    typeof releaseStageTraversalForScriptedPhase !==
    "function"
  ) {
    throw new Error(
      "V2SurvivalRuntimeのreleaseStageTraversalForScriptedPhaseには関数が必要です。"
    );
  }
  assertPopulation(population);
  const featureResources = resolveV2SurvivalFeatureResources(features);

  const locationAssets = stage.locationAssets;
  if (locationAssets === null) {
    throw new Error("T06-4にはStage Location Asset Registryが必要です。");
  }
  const requiredAssemblyVenues = new Map<string, StageAssemblyVenue>();
  for (const venueId of V2_REQUIRED_ASSEMBLY_VENUE_IDS) {
    const venue = stage.assemblyVenues.getById(venueId);
    if (venue === null) {
      throw new Error(`集合会場が未登録です: ${venueId}`);
    }
    requiredAssemblyVenues.set(venueId, venue);
  }

  let visualRandomState = 0x6d2b79f5;
  const visualRandom = () => {
    visualRandomState =
      (Math.imul(visualRandomState, 1664525) + 1013904223) >>> 0;
    return visualRandomState / 0x1_0000_0000;
  };

  const playerCombat = createV2PlayerCombatSystem({
    playerId: PLAYER_ID,
    initialState: initialPlayerState,
    instantBrainwash: brainwashSettings.instantBrainwash,
    random
  });

  let ownedNpcSystem: V2NpcSystem | null = null;
  let ownedBitSystem: V2BitSystem | null = null;
  let ownedAlertCoordinator: V2AlertCoordinator | null = null;
  let ownedAlarmSystem: V2AlarmSystem | null = null;
  let ownedExecutionSystem: V2PublicExecutionSystem | null = null;
  let ownedBeamSystem: V2BeamSystem | null = null;
  let ownedHitEffectSystem: V2HitEffectSystem | null = null;
  let ownedTargetNavigationAreaTracker: V2TargetNavigationAreaTracker | null = null;
  let ownedMissionRuntime: V2MissionRuntime | null = null;
  let ownedBroadcastRuntime: V2BroadcastRuntime | null = null;
  const constructionCleanupStack: Array<Readonly<{
    label: V2SurvivalConstructionOwnerLabel;
    dispose(): void;
  }>> = [];
  const acquireConstructionOwner = <T>(
    label: V2SurvivalConstructionOwnerLabel,
    owner: T,
    dispose: (owner: T) => void
  ): T => {
    constructionCleanupStack.push(Object.freeze({
      label,
      dispose: () => dispose(owner)
    }));
    constructionDependencies.ownerAcquired?.(label);
    return owner;
  };
  let humanTargets: readonly V2HumanTargetSnapshot[] =
    Object.freeze([]);
  let frameOrbVisibilityPredicate:
    | ((position: Vector3) => boolean)
    | null = null;
  const getFrameOrbVisibilityPredicate = () => {
    if (frameOrbVisibilityPredicate === null) {
      const cameraPredicate = getOrbVisibilityPredicate();
      if (typeof cameraPredicate !== "function") {
        throw new Error(
          "V2SurvivalRuntimeのgetOrbVisibilityPredicateは位置判定関数を返す必要があります。"
        );
      }
      frameOrbVisibilityPredicate = (position: Vector3) =>
        (stage.worldBoundary === null ||
          stage.worldBoundary.contains(position)) &&
        cameraPredicate(position);
    }
    return frameOrbVisibilityPredicate;
  };
  const isIndirectLightVisible = (position: Vector3) => {
    const activeCamera = scene.activeCamera;
    if (!activeCamera) {
      throw new Error(
        "命中演出の間接照明判定にはSceneのactive cameraが必要です。"
      );
    }
    return (
      stage.queries.castBeamSegment(
        activeCamera.globalPosition,
        position
      ) === null
    );
  };

  try {
    ownedTargetNavigationAreaTracker = acquireConstructionOwner(
      "target-navigation-area-tracker",
      createV2TargetNavigationAreaTracker(stage.navigationAreas),
      (owner) => owner.dispose()
    );
    ownedNpcSystem = acquireConstructionOwner("npc-system", createV2NpcSystem({
      scene,
      stage,
      characterVisuals,
      npcCount: population.npcCount,
      initialBrainwashedNpcCount:
        population.initialBrainwashedNpcCount,
      brainwashSettings,
      diagnosticsEnabled: performanceDiagnostics !== null,
      random,
      spawnRandom: npcSpawnRandom,
      playerSpawn,
      resolveTargetNavigationArea: (target) =>
        ownedTargetNavigationAreaTracker!.resolve(target.id),
      selectNavigationRoute
    }), (owner) => owner.dispose());
    const completedBrainwashedBroadcastState =
      brainwashSettings.brainwashOnNoGunTouch
        ? "brainwash-complete-no-gun"
        : "brainwash-complete-gun";
    if (featureResources.missionRuntime) {
      ownedMissionRuntime = acquireConstructionOwner("mission-runtime", createV2MissionRuntime({
        locations: locationAssets,
        playerRandom: playerMissionRandom,
        npcRandom: npcMissionRandom,
        broadcastRandom: broadcastMissionRandom,
        completedBrainwashedBroadcastState,
        npcPort: ownedNpcSystem
      }), (owner) => owner.dispose());
    } else {
      ownedBroadcastRuntime = acquireConstructionOwner("broadcast-runtime", createV2BroadcastRuntime({
        locations: locationAssets,
        random: broadcastMissionRandom,
        completedBrainwashedState: completedBrainwashedBroadcastState,
        npcPort: ownedNpcSystem
      }), (owner) => owner.dispose());
    }
    ownedBitSystem = acquireConstructionOwner("bit-system", createV2BitSystem(scene, stage, {
      initialBitCount: population.initialBitCount,
      reinforcementIntervalSeconds:
        population.bitReinforcementIntervalSeconds,
      maximumBitCount: population.maximumBitCount,
      minimumSpawnDistance: 0.2,
      spawnMaxAttempts: 512,
      spawnProjectionMaxDistance: 0.75,
      combatEnabled: true,
      modeMuzzleColorEnabled: false,
      showGroundShadows,
      random,
      spawnRandom: bitSpawnRandom,
      playerSpawn,
      resolveTargetNavigationArea: (target) =>
        ownedTargetNavigationAreaTracker!.resolve(target.id)
    }), (owner) => owner.dispose());
    if (performanceWorkloadScenario !== null) {
      ownedBitSystem.prepareForScriptedPhase();
    }
    ownedAlertCoordinator = acquireConstructionOwner("alert-coordinator", createV2AlertCoordinator({
      alertDuration: ALERT_DURATION_SECONDS
    }), (owner) => owner.clear());
    if (featureResources.alarmSystem) {
      ownedAlarmSystem = acquireConstructionOwner("alarm-system", createV2AlarmSystem({
        candidateProvider:
          createV2NavigationAlarmCandidateProvider(stage),
        diagnosticsEnabled: performanceDiagnostics !== null,
        random
      }), (owner) => owner.dispose());
    }
    ownedExecutionSystem = acquireConstructionOwner(
      "execution-system",
      createV2PublicExecutionSystem(random),
      (owner) => owner.reset()
    );
    ownedHitEffectSystem = acquireConstructionOwner("hit-effect-system", createV2HitEffectSystem({
      scene,
      random: visualRandom,
      isIndirectLightVisible,
      resolveVisualEnvelope: (target) => {
        const size = characterVisuals.getActorVisualSize(target.id);
        return Object.freeze({
          center: new Vector3(
            target.footPosition.x,
            target.footPosition.y + size.height / 2,
            target.footPosition.z
          ),
          width: size.width,
          height: size.height
        });
      }
    }), (owner) => owner.dispose());
    humanTargets = Object.freeze([
      playerCombat.createTargetSnapshot(
        player.getFootPosition(),
        player.getEyePosition()
      ),
      ...ownedNpcSystem.getFrameView().targets
    ]);
    ownedTargetNavigationAreaTracker.beginFrame(humanTargets);
    ownedBeamSystem = acquireConstructionOwner("beam-system", createV2BeamSystem({
      scene,
      stage,
      getHumanTargets: () => humanTargets,
      random: visualRandom,
      getOrbVisibilityPredicate: getFrameOrbVisibilityPredicate,
      collisionDiagnostics: performanceDiagnostics
        ? Object.freeze({
            recordStartContainment: (
              candidateMeshCount: number,
              triangulatedMeshCount: number
            ) => {
              performanceDiagnostics.count(
                "beam.start-containment.queries"
              );
              performanceDiagnostics.count(
                "beam.start-containment.candidates",
                candidateMeshCount
              );
              performanceDiagnostics.count(
                "beam.start-containment.triangulated-meshes",
                triangulatedMeshCount
              );
            }
          })
        : undefined
    }), (owner) => owner.dispose());
  } catch (error) {
    for (const owner of [...constructionCleanupStack].reverse()) {
      owner.dispose();
      constructionDependencies.ownerRolledBack?.(owner.label);
    }
    throw error;
  }

  const npcSystem = ownedNpcSystem;
  const missionRuntime = ownedMissionRuntime;
  const broadcastRuntime = ownedBroadcastRuntime;
  const bitSystem = ownedBitSystem;
  const alertCoordinator = ownedAlertCoordinator;
  const alarmSystem = ownedAlarmSystem;
  const executionSystem = ownedExecutionSystem;
  const beamSystem = ownedBeamSystem;
  const hitEffectSystem = ownedHitEffectSystem;
  const targetNavigationAreaTracker = ownedTargetNavigationAreaTracker;
  bitSystem.setDiagnosticsEnabled(
    performanceDiagnostics !== null
  );
  const allNpcIds = Object.freeze(
    npcSystem.getFrameView().targets.map((target) => target.id)
  );
  const allNpcIdSet = new Set(allNpcIds);

  let disposed = false;
  let phase: V2SurvivalPhase = "playing";
  let assemblyPlayerControlReleased = false;
  let hostileActionsSuspendedByRuntime = false;
  let frozenAssemblyVenue: StageAssemblyVenue | null = null;
  let missionFrame: V2MissionFrame | null = missionRuntime?.getFrame() ?? null;
  let instructionAssemblyVenueId = missionFrame !== null
    ? resolveV2MissionAssemblyVenueId(missionFrame)
    : broadcastRuntime!.getAssemblyVenueId();
  let allDeadSeconds = 0;
  let blockerImpactCount = 0;
  let actorImpactCount = 0;
  let alarmTriggerCount = 0;
  let pendingPlayerBeamRequests: V2BeamRequest[] = [];
  let pendingPlayerGunFireEvents: V2PlayerGunFireEvent[] = [];
  const audioEventQueue = createV2GameplayAudioEventQueue();
  const previousBitTargetIds = new Map(
    bitSystem
      .getFrameView()
      .targetStates.map((target) => [target.bitId, target.targetId])
  );
  const bitActorById = new Map<string, V2ActorSphere>();
  const humanTargetById = new Map<string, V2HumanTargetSnapshot>();
  let playerBlockedNpcIds: readonly string[] = Object.freeze([]);
  let previousBitThreats: readonly V2NpcExternalThreat[] =
    Object.freeze([]);
  let alarmFrame: V2AlarmFrame = alarmSystem?.getFrame() ?? EMPTY_ALARM_FRAME;
  let performanceAlertRefreshSeconds = 0;

  const assertActive = () => {
    if (disposed) {
      throw new Error("V2SurvivalRuntimeは破棄済みです。");
    }
  };

  const rebuildHumanTargets = () => {
    humanTargets = Object.freeze([
      playerCombat.createTargetSnapshot(
        player.getFootPosition(),
        player.getEyePosition()
      ),
      ...npcSystem.getFrameView().targets
    ]);
    return humanTargets;
  };

  const recordBeamSpawn = (request: V2BeamRequest) => {
    audioEventQueue.enqueue(
      Object.freeze({
        kind: "beam-shot" as const,
        originKind: request.originKind,
        position: request.origin.clone()
      })
    );
    return beamSystem.spawn(request);
  };

  const recordBitTargetEvents = (
    frameView: V2BitFrameView,
    actorById: ReadonlyMap<string, V2ActorSphere>
  ) => {
    for (const target of frameView.targetStates) {
      const previousTargetId = previousBitTargetIds.get(target.bitId) ?? null;
      if (
        target.targetId !== null &&
        target.targetId !== previousTargetId
      ) {
        const actor = actorById.get(target.bitId);
        if (!actor) {
          throw new Error(
            `BIT音声イベントの位置がありません: ${target.bitId}`
          );
        }
        audioEventQueue.enqueue(
          Object.freeze({
            kind: "bit-target" as const,
            position: actor.center.clone()
          })
        );
      }
      previousBitTargetIds.set(target.bitId, target.targetId);
    }
    for (const bitId of previousBitTargetIds.keys()) {
      if (!actorById.has(bitId)) {
        previousBitTargetIds.delete(bitId);
      }
    }
  };

  const getPlayerTarget = () => {
    const target = humanTargets.find(
      (candidate) => candidate.id === PLAYER_ID
    );
    if (!target) {
      throw new Error("player snapshotがありません。");
    }
    return target;
  };

  const buildMissionNpcSnapshots =
    (): readonly V2MissionNpcSnapshot[] => {
      const npcFrame = npcSystem.getFrameView();
      if (npcFrame.targets.length !== npcFrame.tracking.length) {
        throw new Error(
          `Mission用NPC snapshot数が一致しません: ${npcFrame.targets.length}/${npcFrame.tracking.length}`
        );
      }
      return Object.freeze(
        npcFrame.targets.map((target, index) => {
          const tracking = npcFrame.tracking[index];
          if (target.id !== tracking.npcId) {
            throw new Error(
              `Mission用NPC snapshotの並びが一致しません: ${target.id}/${tracking.npcId}`
            );
          }
          return Object.freeze({
            id: target.id,
            state: target.state,
            footPosition: target.footPosition.clone(),
            commandMode: tracking.commandMode,
            targetId: tracking.targetId,
            locationMission: tracking.locationMission
          });
        })
      );
    };

  const updateMissionFrame = (
    deltaSeconds: number,
    elevators: readonly V2MissionElevatorSnapshot[]
  ) => {
    const npcStateTransitions = npcSystem.drainStateTransitions();
    if (missionRuntime !== null) {
      missionFrame = missionRuntime.update(
        Object.freeze({
          deltaSeconds,
          phase,
          playerState: playerCombat.getStateSnapshot().state,
          playerFootPosition: player.getFootPosition(),
          npcs: buildMissionNpcSnapshots(),
          npcStateTransitions,
          elevators
        })
      );
      instructionAssemblyVenueId = resolveV2MissionAssemblyVenueId(
        missionFrame
      );
    }
  };

  const getInstructionAssemblyVenue = () => {
    const venue = requiredAssemblyVenues.get(instructionAssemblyVenueId);
    if (!venue) {
      throw new Error(`集合会場がありません: ${instructionAssemblyVenueId}`);
    }
    return venue;
  };

  const freezeAssemblyVenue = () => {
    if (frozenAssemblyVenue === null) {
      frozenAssemblyVenue = getInstructionAssemblyVenue();
    }
    return frozenAssemblyVenue;
  };

  const requireFrozenAssemblyVenue = () => {
    if (frozenAssemblyVenue === null) {
      throw new Error("集合・公開処刑会場が固定されていません。");
    }
    return frozenAssemblyVenue;
  };

  const createNpcCommandQuery = (): V2NpcCommandQuery => {
    const activeCamera = scene.activeCamera;
    if (!activeCamera) {
      throw new Error(
        "NPC指示候補の抽出にはSceneのactive cameraが必要です。"
      );
    }
    const frustumPlanes = Frustum.GetPlanes(
      activeCamera.getTransformationMatrix()
    );
    return Object.freeze({
      playerTarget: playerCombat.createTargetSnapshot(
        player.getFootPosition(),
        player.getEyePosition()
      ),
      cameraPosition: activeCamera.globalPosition.clone(),
      cameraDirection: activeCamera.getForwardRay().direction.clone(),
      isInCameraFrustum: (position: Vector3) =>
        Frustum.IsPointInFrustum(position, frustumPlanes)
    });
  };

  const canPlayerMove = () => {
    return canV2SurvivalPlayerMove({
      phase,
      playerState: playerCombat.getStateSnapshot().state,
      playerCaptured: npcSystem
        .getFrameView()
        .captures
        .some((capture) => capture.targetId === PLAYER_ID),
      assemblyPlayerControlReleased,
      executionPlayerRole:
        executionSystem.getFrame().candidate?.playerRole ?? null
    });
  };

  const clearCombatForPhaseTransition = () => {
    releaseStageTraversalForScriptedPhase();
    npcSystem.clearCommands();
    npcSystem.setAiSuspended(true);
    npcSystem.setExternalThreats(Object.freeze([]));
    npcSystem.setAutonomousThreatActors(Object.freeze([]));
    npcSystem.setPlayerBlockedTargetIds(Object.freeze([]));
    bitSystem.prepareForScriptedPhase();
    bitSystem.setAiSuspended(true);
    beamSystem.clear();
    hitEffectSystem.clear();
    alertCoordinator.clear();
    audioEventQueue.clear();
    previousBitTargetIds.clear();
    bitActorById.clear();
    humanTargetById.clear();
    alarmFrame = EMPTY_ALARM_FRAME;
    pendingPlayerBeamRequests = [];
    pendingPlayerGunFireEvents = [];
    playerBlockedNpcIds = Object.freeze([]);
    previousBitThreats = Object.freeze([]);
    npcSystem.drainBeamRequests();
    bitSystem.takeAlertRequests();
  };

  const placeHumansForAssembly = () => {
    const assemblyVenue = requireFrozenAssemblyVenue();
    const npcTargets = npcSystem.getFrameView().targets;
    const ids = [
      PLAYER_ID,
      ...npcTargets.map((target) => target.id)
    ];
    const positions = createAssemblyPositions(
      assemblyVenue,
      ids.length
    );
    const playerTarget = getPlayerTarget();
    if (playerTarget.brainwashed) {
      playerCombat.enterFormationState();
    }
    player.placeAt(
      positions[0],
      getLookAtPosition(positions[0], assemblyVenue.center)
    );
    npcSystem.placeNpcs(
      npcTargets.map((target, index) =>
        Object.freeze({
          id: target.id,
          footPosition: positions[index + 1],
          formation: target.brainwashed
        })
      )
    );
    for (const target of rebuildHumanTargets()) {
      targetNavigationAreaTracker.relocate(
        target.id,
        target.footPosition
      );
    }
  };

  const enterAssembly = () => {
    freezeAssemblyVenue();
    clearCombatForPhaseTransition();
    executionSystem.reset();
    assemblyPlayerControlReleased = false;
    phase = "assembly";
    placeHumansForAssembly();
  };

  const prepareExecutionTargetStates = (
    candidate: V2ExecutionCandidate
  ) => {
    const npcAssignments: V2NpcExecutionRoleAssignment[] = [];
    for (const target of candidate.targets) {
      if (target.kind === "player") {
        playerCombat.prepareExecutionTarget();
      } else {
        npcAssignments.push(
          Object.freeze({
            npcId: target.id,
            role: "target"
          })
        );
      }
    }
    npcSystem.prepareExecutionRoles(Object.freeze(npcAssignments));
    rebuildHumanTargets();
  };

  const prepareExecutionParticipantStates = (
    candidate: V2ExecutionCandidate,
    executionFrame: V2PublicExecutionFrame,
    instantExecution: boolean
  ) => {
    npcSystem.setVisibleNpcIds(allNpcIds);
    const targetIds = new Set(
      candidate.targets.map((target) => target.id)
    );
    const shooterIds = new Set(
      executionFrame.assignments.flatMap(
        (assignment) => assignment.shooterIds
      )
    );
    if (candidate.playerRole === "shooter") {
      if (instantExecution) {
        playerCombat.prepareInstantExecutionShooter();
      } else {
        playerCombat.prepareExecutionShooter();
      }
    } else if (candidate.playerRole === "observer") {
      if (instantExecution) {
        playerCombat.prepareInstantExecutionAudience();
      } else {
        playerCombat.prepareExecutionAudience();
      }
    }
    const npcAssignments: V2NpcExecutionRoleAssignment[] = [];
    for (const target of npcSystem.getFrameView().targets) {
      if (targetIds.has(target.id)) {
        continue;
      }
      npcAssignments.push(
        Object.freeze({
          npcId: target.id,
          role: shooterIds.has(target.id)
            ? "shooter"
            : "audience"
        })
      );
    }
    if (instantExecution) {
      npcSystem.prepareInstantExecutionRoles(
        Object.freeze(npcAssignments)
      );
    } else {
      npcSystem.prepareExecutionRoles(Object.freeze(npcAssignments));
    }
    rebuildHumanTargets();
  };

  const applyExecutionPlacements = (
    executionFrame: V2PublicExecutionFrame
  ) => {
    const assemblyVenue = requireFrozenAssemblyVenue();
    const positionById = new Map(
      executionFrame.placements.map(
        (placement) =>
          [placement.id, placement.position] as const
      )
    );
    const visibleIds = new Set(positionById.keys());
    const visibleNpcIds = [...visibleIds].filter(
      (id) => id !== PLAYER_ID
    );
    const playerPosition = positionById.get(PLAYER_ID);
    if (!playerPosition) {
      throw new Error("公開処刑のplayer配置がありません。");
    }
    player.placeAt(
      playerPosition,
      getLookAtPosition(playerPosition, assemblyVenue.center)
    );
    npcSystem.placeNpcs(
      npcSystem.getFrameView().targets.map((target) => {
        const position =
          positionById.get(target.id) ?? target.footPosition;
        return Object.freeze({
          id: target.id,
          footPosition: position,
          formation:
            target.state ===
            "brainwash-complete-haigure-formation"
        });
      })
    );
    npcSystem.setVisibleNpcIds(
      Object.freeze(visibleNpcIds)
    );

    const usesBitShooters =
      executionFrame.assignments[0]?.originKind ===
      "execution-bit";
    bitSystem.setVisible(usesBitShooters);
    if (usesBitShooters) {
      const targetPlacements = executionFrame.placements.filter(
        (placement) => placement.role === "target"
      );
      if (targetPlacements.length === 0) {
        throw new Error("公開処刑のBIT円陣中心となる対象がありません。");
      }
      const targetCenter = targetPlacements.reduce(
        (center, placement) => center.addInPlace(placement.position),
        Vector3.Zero()
      ).scaleInPlace(1 / targetPlacements.length);
      const playerIsTarget = targetPlacements.some(
        (placement) => placement.id === PLAYER_ID
      );
      const bitIds = bitSystem
        .getFrameView()
        .actorSpheres
        .map((actor) => actor.id);
      const bitPositions = createV2ExecutionBitPositions(
        assemblyVenue,
        bitIds.length,
        targetCenter,
        playerIsTarget ? null : playerPosition
      );
      bitSystem.placeBits(
        bitIds.map((id, index) =>
          Object.freeze({
            id,
            centerPosition: bitPositions[index]
          })
        )
      );
      bitSystem.faceBitsAt(player.getEyePosition());
    }
    for (const target of rebuildHumanTargets()) {
      targetNavigationAreaTracker.relocate(
        target.id,
        target.footPosition
      );
    }
  };

  const placeHumansForExecution = (
    candidate: V2ExecutionCandidate,
    startupExecutionScenario: V2InstantPublicExecutionScenario | null = null
  ) => {
    const assemblyVenue = requireFrozenAssemblyVenue();
    const audienceIds = startupExecutionScenario === null
      ? selectV2ExecutionAudienceIds(
          humanTargets.map((target) => target.id),
          candidate.targets.map((target) => target.id)
        )
      : Object.freeze([
          ...startupExecutionScenario.audienceNpcIds,
          ...(startupExecutionScenario.playerRole === "target"
            ? []
            : [PLAYER_ID])
        ]);
    const bitIds = startupExecutionScenario?.bitShooterIds ??
      bitSystem
        .getFrameView()
        .actorSpheres
        .map((actor) => actor.id);
    const audienceNpcIds = new Set(
      audienceIds.filter((id) => id !== PLAYER_ID)
    );
    const npcShooterIds = startupExecutionScenario?.npcShooterIds ??
      humanTargets
        .filter(
          (target) =>
            target.kind === "npc" &&
            audienceNpcIds.has(target.id)
        )
        .map((target) => target.id);
    const executionFrame = executionSystem.enter(
      candidate,
      assemblyVenue,
      audienceIds,
      Object.freeze({
        bitShooterIds: Object.freeze(bitIds),
        npcShooterIds: Object.freeze(npcShooterIds),
        playerShooterId: PLAYER_ID
      })
    );
    prepareExecutionParticipantStates(
      candidate,
      executionFrame,
      startupExecutionScenario !== null
    );
    applyExecutionPlacements(executionFrame);
  };

  const enterExecution = (
    candidate: V2ExecutionCandidate
  ) => {
    freezeAssemblyVenue();
    clearCombatForPhaseTransition();
    prepareExecutionTargetStates(candidate);
    placeHumansForExecution(candidate);
    phase = "execution";
  };

  const enterStartupExecution = (
    scenario: V2InstantPublicExecutionScenario
  ): void => {
    const venue = requiredAssemblyVenues.get(scenario.venueId);
    if (!venue) {
      throw new Error(`即時公開処刑会場がありません: ${scenario.venueId}`);
    }
    const targetById = new Map(
      humanTargets.map((target) => [target.id, target] as const)
    );
    const targets = scenario.targetActorIds.map((targetId) => {
      const target = targetById.get(targetId);
      if (!target) {
        throw new Error(`即時公開処刑対象がありません: ${targetId}`);
      }
      return Object.freeze({ id: target.id, kind: target.kind });
    });
    const candidate = createV2PublicExecutionCandidate(
      Object.freeze(targets),
      scenario.playerRole,
      scenario.method === "player-npc" || scenario.method === "npc-npc"
    );
    frozenAssemblyVenue = venue;
    clearCombatForPhaseTransition();
    prepareExecutionTargetStates(candidate);
    placeHumansForExecution(candidate, scenario);
    phase = "execution";
  };

  const applyBeamImpacts = (events: V2BeamFrameEvents) => {
    if (events.impacts.length === 0) {
      return;
    }
    const impactedTargetIds = new Set<string>();
    const npcImpacts: V2NpcBeamImpact[] = [];
    const notificationEntries: Array<
      Readonly<{
        sourceId: string;
        targetId: string;
        originKind:
          V2BeamFrameEvents["impacts"][number]["originKind"];
        target: V2HumanTargetSnapshot;
        impactPosition: Vector3;
        npcImpactIndex: number | null;
        playerAccepted: boolean;
      }>
    > = [];
    for (const event of events.impacts) {
      if (event.hit.kind === "blocker") {
        blockerImpactCount += 1;
        continue;
      }
      actorImpactCount += 1;
      const targetId = event.hit.actor.id;
      if (impactedTargetIds.has(targetId)) {
        continue;
      }
      impactedTargetIds.add(targetId);
      const source = Object.freeze({
        sourceId: event.sourceId,
        originKind: event.originKind
      });
      const npcImpactIndex =
        targetId === PLAYER_ID ? null : npcImpacts.length;
      const playerAccepted =
        targetId === PLAYER_ID
          ? playerCombat.applyImpact(source)
          : false;
      if (npcImpactIndex !== null) {
        const playerNoGunAssisted =
          playerCombat.getStateSnapshot().state ===
            "brainwash-complete-no-gun" &&
          Vector3.Distance(
            player.getFootPosition(),
            event.hit.actor.footPosition
          ) <= V2_PLAYER_BLOCK_RADIUS;
        npcImpacts.push(
          Object.freeze({
            npcId: targetId,
            source,
            playerNoGunAssisted
          })
        );
      }
      notificationEntries.push(
        Object.freeze({
          sourceId: event.sourceId,
          targetId,
          originKind: event.originKind,
          target: event.hit.actor,
          impactPosition: event.hit.point.clone(),
          npcImpactIndex,
          playerAccepted
        })
      );
    }
    const npcImpactResults = npcSystem.applyBeamImpacts(
      Object.freeze(npcImpacts)
    );
    if (
      notificationEntries.some(
        (entry) =>
          entry.targetId === PLAYER_ID && entry.playerAccepted
      )
    ) {
      npcSystem.notifyPlayerImpactAccepted();
    }
    for (const entry of notificationEntries) {
      const accepted =
        entry.npcImpactIndex === null
          ? entry.playerAccepted
          : npcImpactResults[entry.npcImpactIndex].accepted;
      if (accepted) {
        audioEventQueue.enqueue(
          Object.freeze({
            kind: "character-hit" as const,
            position: entry.impactPosition.clone()
          })
        );
        hitEffectSystem.start(entry.target);
      }
      if (
        accepted &&
        (entry.originKind === "bit-chase" ||
          entry.originKind === "bit-fixed" ||
          entry.originKind === "bit-random" ||
          entry.originKind === "bit-carpet")
      ) {
        bitSystem.notifyBeamImpact(
          entry.sourceId,
          entry.targetId
        );
      }
    }
  };

  const applyNoGunContactBrainwashImpacts = (): void => {
    const impacts = npcSystem.drainContactBrainwashImpacts();
    let playerImpactAccepted = false;
    for (const impact of impacts) {
      const target = humanTargets.find(
        (candidate) => candidate.id === impact.targetId
      );
      if (!target) {
        throw new Error(
          `銃なし接触洗脳の対象がありません: ${impact.targetId}`
        );
      }
      const source = Object.freeze({
        sourceId: impact.sourceNpcId,
        originKind: "npc-no-gun-touch" as const
      });
      const accepted =
        impact.targetId === PLAYER_ID
          ? playerCombat.applyNoGunTouchBrainwash(source)
          : npcSystem.applyNoGunTouchBrainwashImpacts(
              Object.freeze([
                Object.freeze({
                  npcId: impact.targetId,
                  source,
                  playerNoGunAssisted: false
                })
              ])
            )[0].accepted;
      if (!accepted) {
        continue;
      }
      playerImpactAccepted ||= impact.targetId === PLAYER_ID;
    }
    if (playerImpactAccepted) {
      npcSystem.notifyPlayerImpactAccepted();
    }

    const playerTargetIds = selectV2PlayerNoGunTouchTargetIds(
      brainwashSettings.brainwashOnNoGunTouch,
      playerCombat.getStateSnapshot().state,
      player.getFootPosition(),
      npcSystem.getFrameView().targets
    );
    if (playerTargetIds.length === 0) {
      return;
    }
    const source = Object.freeze({
      sourceId: PLAYER_ID,
      originKind: "player-no-gun-touch" as const
    });
    npcSystem.applyNoGunTouchBrainwashImpacts(
      Object.freeze(
        playerTargetIds.map((npcId) =>
          Object.freeze({
            npcId,
            source,
            playerNoGunAssisted: false
          })
        )
      )
    );
  };

  const buildBitThreats = (
    frameView: V2BitFrameView,
    actorById: ReadonlyMap<string, V2ActorSphere>,
    humanTargetById: ReadonlyMap<string, V2HumanTargetSnapshot>
  ): readonly V2NpcExternalThreat[] => {
    const targetIds = new Set<string>();
    const threats: V2NpcExternalThreat[] = [];
    for (const tracking of frameView.targetStates) {
      if (
        tracking.targetId === null ||
        targetIds.has(tracking.targetId)
      ) {
        continue;
      }
      const source = actorById.get(tracking.bitId);
      if (!source) {
        throw new Error(
          `bit脅威元位置がありません: ${tracking.bitId}`
        );
      }
      const target = humanTargetById.get(tracking.targetId);
      if (!target) {
        throw new Error(
          `bit脅威対象snapshotがありません: ${tracking.targetId}`
        );
      }
      targetIds.add(tracking.targetId);
      threats.push(
        Object.freeze({
          sourceId: tracking.bitId,
          targetId: tracking.targetId,
          sourcePosition: source.center.clone(),
          sightClear:
            stage.queries.castSightSegment(
              source.center,
              target.aimPosition
            ) === null
        })
      );
    }
    return Object.freeze(threats);
  };

  const updatePlayerBlockedNpcIds = () => {
    const playerTarget = getPlayerTarget();
    playerBlockedNpcIds = selectV2PlayerBlockedNpcIds(
      playerTarget.state,
      playerTarget.footPosition,
      npcSystem.getFrameView().targets
    );
    npcSystem.setPlayerBlockedTargetIds(
      playerBlockedNpcIds
    );
  };

  const refreshPerformanceCombatAlert = (
    deltaSeconds: number
  ) => {
    performanceAlertRefreshSeconds -= deltaSeconds;
    if (performanceAlertRefreshSeconds > 0) {
      return;
    }
    const leader = bitSystem.getFrameView().actorSpheres[0];
    if (!leader) {
      throw new Error(
        "性能戦闘シナリオにはBITが1機以上必要です。"
      );
    }
    let target: V2HumanTargetSnapshot | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const candidate of humanTargets) {
      if (!candidate.alive) {
        continue;
      }
      const distanceSquared = Vector3.DistanceSquared(
        leader.center,
        candidate.aimPosition
      );
      if (distanceSquared < nearestDistanceSquared) {
        target = candidate;
        nearestDistanceSquared = distanceSquared;
      }
    }
    if (!target) {
      return;
    }
    alertCoordinator.publish([
      Object.freeze({
        leaderId: leader.id,
        targetId: target.id
      })
    ]);
    performanceDiagnostics?.count(
      "scenario.alert-injections"
    );
    performanceAlertRefreshSeconds =
      PERFORMANCE_ALERT_REFRESH_SECONDS;
  };

  const buildExecutionBlocks = () => {
    const blocks: V2ExecutionBlock[] = npcSystem
      .getFrameView()
      .captures
      .map((capture) =>
        Object.freeze({
          targetId: capture.targetId,
          blockerId: capture.npcId,
          blockerKind: "npc" as const
        })
      );
    for (const targetId of playerBlockedNpcIds) {
      blocks.push(
        Object.freeze({
          targetId,
          blockerId: PLAYER_ID,
          blockerKind: "player" as const
        })
      );
    }
    return Object.freeze(blocks);
  };

  const completeExecutionTargets = () => {
    const executionFrame = executionSystem.getFrame();
    const completed = new Set(
      executionFrame.completedTargetIds
    );
    const npcIdsEnteringFormation: string[] = [];
    const completedTargetIds: string[] = [];
    for (const target of executionFrame.candidate?.targets ?? []) {
      if (completed.has(target.id)) {
        continue;
      }
      const snapshot = humanTargets.find(
        (candidate) => candidate.id === target.id
      );
      if (!snapshot?.brainwashed) {
        continue;
      }
      if (target.kind === "player") {
        playerCombat.enterFormationState();
      } else {
        npcIdsEnteringFormation.push(target.id);
      }
      completedTargetIds.push(target.id);
    }
    npcSystem.enterFormationStates(
      Object.freeze(npcIdsEnteringFormation)
    );
    for (const targetId of completedTargetIds) {
      executionSystem.notifyTargetCompleted(targetId);
    }
    rebuildHumanTargets();
    const completedFrame = executionSystem.getFrame();
    if (completedFrame.phase === "complete") {
      if (completedFrame.candidate?.playerRole === "shooter") {
        playerCombat.enterFormationState();
        rebuildHumanTargets();
      }
      phase = "execution-complete";
      audioEventQueue.clear();
    }
  };

  const createExecutionBeamRequests = (
    events: readonly V2ExecutionShotEvent[]
  ) => {
    const targetById = new Map(
      humanTargets.map((target) => [target.id, target] as const)
    );
    const bitById = new Map(
      bitSystem
        .getFrameView()
        .actorSpheres
        .map((actor) => [actor.id, actor] as const)
    );
    const requests: V2BeamRequest[] = [];
    for (const event of events) {
      const target = targetById.get(event.targetId);
      if (!target) {
        throw new Error(
          `公開処刑の対象snapshotがありません: ${event.targetId}`
        );
      }
      for (const shooterId of event.shooterIds) {
        const origin =
          event.originKind === "execution-bit"
            ? bitById.get(shooterId)?.center
            : targetById.get(shooterId)?.aimPosition;
        if (!origin) {
          throw new Error(
            `公開処刑の射手位置がありません: ${shooterId}`
          );
        }
        const direction = target.aimPosition.subtract(origin);
        if (direction.lengthSquared() === 0) {
          throw new Error(
            `公開処刑の射手と対象が同じ位置です: ${shooterId}/${target.id}`
          );
        }
        const normalized = direction.normalize();
        requests.push(
          Object.freeze({
            sourceId: shooterId,
            originKind: event.originKind,
            targetPolicy: Object.freeze({
              kind: "execution-assigned" as const,
              targetIds: Object.freeze([target.id])
            }),
            origin: origin.add(
              normalized.scale(
                V2_PLAYER_GUN_BEAM_ORIGIN_OFFSET
              )
            ),
            direction: normalized,
            speed: V2_PLAYER_GUN_BEAM_SPEED,
            maximumLifetime:
              V2_PLAYER_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS
          })
        );
      }
    }
    return Object.freeze(requests);
  };

  const buildFrame = (): V2SurvivalFrame => {
    const npcFrameView = npcSystem.getFrameView();
    const npcTracking = npcFrameView.tracking;
    const bitFrameView = bitSystem.getFrameView();
    const bitTracking = bitFrameView.targetStates;
    const playerStateSnapshot = playerCombat.getStateSnapshot();
    const targetTrackingSummary = summarizeV2TargetTracking(
      npcTracking,
      bitTracking
    );
    let brainwashedNpcCount = 0;
    for (const target of npcFrameView.targets) {
      if (target.brainwashed) {
        brainwashedNpcCount += 1;
      }
    }
    const npcHudCounts = summarizeV2NpcHudCounts(
      npcFrameView.targets.map((target) => target.state)
    );
    const executionFrame = executionSystem.getFrame();
    const currentAssemblyVenue =
      frozenAssemblyVenue ?? getInstructionAssemblyVenue();
    return Object.freeze({
      phase,
      assemblyVenueId: currentAssemblyVenue.id,
      mission: missionFrame,
      playerState: playerStateSnapshot.state,
      playerNoGunTouchBrainwashProgress:
        playerStateSnapshot.noGunTouchBrainwashProgress,
      playerCompletionUnlocked:
        playerStateSnapshot.playerCompletionUnlocked,
      playerCanMove: canPlayerMove(),
      npcCount: npcFrameView.targets.length,
      npcHudCounts,
      brainwashedNpcCount,
      bitCount: bitFrameView.populationBitCount,
      activeBeamCount: beamSystem.activeCount,
      activeAlertCount: alertCoordinator.activeCount,
      activeAlarmCount: alarmFrame.activeCandidateIds.length,
      alarmBlinkCount: alarmFrame.blinks.length,
      alarmTriggerCount,
      alarm: alarmFrame,
      captureCount: npcFrameView.captures.length,
      executionVariant:
        executionFrame.candidate?.variant ?? null,
      executionPlayerRole:
        executionFrame.candidate?.playerRole ?? null,
      executionPendingTargetIds: Object.freeze([
        ...executionFrame.pendingTargetIds
      ]),
      executionTargetCount:
        executionFrame.candidate?.targets.length ?? 0,
      executionCompletedTargetCount:
        executionFrame.completedTargetIds.length,
      visualTargetCount:
        targetTrackingSummary.visualTargetCount,
      alertTargetCount:
        targetTrackingSummary.alertTargetCount,
      npcPlayerTargetCount:
        targetTrackingSummary.npcPlayerTargetCount,
      bitPlayerTargetCount:
        targetTrackingSummary.bitPlayerTargetCount,
      blockerImpactCount,
      actorImpactCount
    });
  };

  const buildMinimapActorSnapshots =
    (): readonly V2MinimapActorSnapshot[] => {
      const npcFrame = npcSystem.getFrameView();
      if (npcFrame.targets.length !== npcFrame.tracking.length) {
        throw new Error(
          `ミニマップ用NPC snapshot数が一致しません: ${npcFrame.targets.length}/${npcFrame.tracking.length}`
        );
      }
      const snapshots: V2MinimapActorSnapshot[] = [];
      for (let index = 0; index < npcFrame.targets.length; index += 1) {
        const target = npcFrame.targets[index];
        const tracking = npcFrame.tracking[index];
        if (target.id !== tracking.npcId) {
          throw new Error(
            `ミニマップ用NPC snapshotの並びが一致しません: ${target.id}/${tracking.npcId}`
          );
        }
        snapshots.push(
          Object.freeze({
            id: target.id,
            kind: "npc" as const,
            areaPosition: target.footPosition,
            sightPosition: target.aimPosition,
            follower: tracking.commandMode === "follow"
          })
        );
      }
      for (const actor of bitSystem.getFrameView().actorSpheres) {
        snapshots.push(
          Object.freeze({
            id: actor.id,
            kind: "bit" as const,
            areaPosition: actor.center,
            sightPosition: actor.center,
            follower: false
          })
        );
      }
      return Object.freeze(snapshots);
    };

  let minimapActorSnapshots = EMPTY_V2_MINIMAP_ACTOR_SNAPSHOTS;
  let frame = buildFrame();
  let startupScenarioActivated = false;

  return {
    activateStartupScenario: () => {
      assertActive();
      if (startupScenario === null) {
        return false;
      }
      if (startupScenarioActivated) {
        throw new Error("開始scenarioは既に適用済みです。");
      }
      startupScenarioActivated = true;
      enterStartupExecution(startupScenario);
      updateMissionFrame(0, Object.freeze([]));
      minimapActorSnapshots = buildMinimapActorSnapshots();
      frame = buildFrame();
      return true;
    },
    getStressWorkloadSnapshot: () => {
      assertActive();
      const npcTracking = npcSystem.getFrameView().tracking;
      const bitTracking = bitSystem.getFrameView().targetStates;
      const countPersonalities = (actors: readonly Readonly<{
        targetSelectionPersonality: "persistent" | "nearest-visible" | null;
        targetId: string | null;
      }>[], targetedOnly: boolean) => {
        let persistent = 0;
        let nearestVisible = 0;
        for (const actor of actors) {
          if (targetedOnly && actor.targetId === null) continue;
          if (actor.targetSelectionPersonality === "persistent") persistent += 1;
          if (actor.targetSelectionPersonality === "nearest-visible") nearestVisible += 1;
        }
        return Object.freeze({ persistent, nearestVisible });
      };
      return Object.freeze({
        populationBitCount: bitSystem.getFrameView().populationBitCount,
        npcPersonalities: countPersonalities(npcTracking, false),
        bitPersonalities: countPersonalities(bitTracking, false),
        targetedNpcPersonalities: countPersonalities(npcTracking, true),
        targetedBitPersonalities: countPersonalities(bitTracking, true),
        followerIds: Object.freeze(npcTracking.filter((npc) => npc.commandMode === "follow").map((npc) => npc.npcId)),
        scheduledFollowerShotIds: Object.freeze(npcTracking.filter((npc) => npc.followerFirePhase === "scheduled").map((npc) => npc.npcId)),
        activeFollowerShotIds: Object.freeze(npcTracking.filter((npc) => npc.followerFirePhase === "active").map((npc) => npc.npcId))
      });
    },
    getFeatureResources: () => {
      assertActive();
      return Object.freeze({
        missionRuntime: missionRuntime !== null,
        broadcastRuntime: broadcastRuntime !== null,
        alarmCandidateProvider: alarmSystem !== null,
        alarmSystem: alarmSystem !== null
      });
    },
    prepareVisualResources: async () => {
      assertActive();
      const beamPreparation =
        beamSystem.prepareVisualResources();
      const hitEffectPreparation =
        hitEffectSystem.prepareVisualResources();
      await Promise.resolve();
      prepareBitFlightNavigationRouteCaches(
        stage.bitNavigation
      );
      await Promise.all([
        beamPreparation,
        hitEffectPreparation
      ]);
    },
    update: (
      deltaSeconds,
      elapsedSeconds,
      playerElevatorTraversal,
      elevators
    ) => {
      assertActive();
      assertNonNegativeFiniteNumber(
        "survival deltaSeconds",
        deltaSeconds
      );
      assertNonNegativeFiniteNumber(
        "survival elapsedSeconds",
        elapsedSeconds
      );
      const updateStartedAtSeconds = elapsedSeconds - deltaSeconds;
      const hostileStartupGraceActive =
        updateStartedAtSeconds < V2_HOSTILE_STARTUP_GRACE_SECONDS;
      const hostileActionsSuspended =
        hostileStartupGraceActive || hostileActionsSuspendedByRuntime;
      npcSystem.setHostileActionsSuspended(hostileActionsSuspended);
      bitSystem.setHostileActionsSuspended(hostileActionsSuspended);
      npcSystem.setPlayerElevatorTraversalSnapshot(
        playerElevatorTraversal
      );
      frameOrbVisibilityPredicate = null;
      const npcFrameViewBuildSequenceAtUpdateStart =
        performanceDiagnostics
          ? npcSystem.getFrameView().frameViewBuildSequence
          : 0;
      let performanceSectionStartedAt = 0;
      if (performanceDiagnostics) {
        performanceDiagnostics.count("alarm.candidates", 0);
        performanceDiagnostics.count(
          "alarm.spatial-index-candidates",
          0
        );
        performanceDiagnostics.count(
          "alarm.segment-intersection-tests",
          0
        );
        performanceDiagnostics.count("npc.route-plans", 0);
        performanceDiagnostics.count(
          "npc.waiting-for-path",
          0
        );
        performanceDiagnostics.count(
          "npc.direct-movement-while-waiting",
          0
        );
        performanceDiagnostics.count(
          "npc.frame-view-builds",
          0
        );
        performanceDiagnostics.count("beam.spawned", 0);
        performanceDiagnostics.count("beam.active", 0);
        performanceDiagnostics.count(
          "beam.start-containment.queries",
          0
        );
        performanceDiagnostics.count(
          "beam.start-containment.candidates",
          0
        );
        performanceDiagnostics.count(
          "beam.start-containment.triangulated-meshes",
          0
        );
        for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
          performanceDiagnostics.count(
            `beam.pool.${kind}.capacity`,
            0
          );
          performanceDiagnostics.count(
            `beam.pool.${kind}.in-use`,
            0
          );
        }
        for (const kind of V2_HIT_EFFECT_POOL_KINDS) {
          performanceDiagnostics.count(
            `hit-effect.pool.${kind}.capacity`,
            0
          );
          performanceDiagnostics.count(
            `hit-effect.pool.${kind}.in-use`,
            0
          );
        }
        performanceDiagnostics.count(
          "bit.route-plans.search",
          0
        );
        performanceDiagnostics.count(
          "bit.route-plans.chase",
          0
        );
        performanceDiagnostics.count(
          "bit.route-plans.escape",
          0
        );
        performanceDiagnostics.count("bit.pursuit.area", 0);
        performanceDiagnostics.count("bit.pursuit.detail", 0);
        performanceDiagnostics.count("bit.sight-rays", 0);
        performanceDiagnostics.count("bit.sphere-sweeps", 0);
        performanceDiagnostics.count(
          "bit.beam-requests",
          0
        );
        performanceDiagnostics.count(
          "scenario.alert-injections",
          0
        );
        performanceDiagnostics.count(
          "scenario.active-alerts",
          0
        );
        performanceDiagnostics.count(
          "scenario.alive-targets",
          0
        );
        performanceDiagnostics.count("scenario.playing", 0);
        performanceDiagnostics.count("scenario.npc-count", 0);
        performanceDiagnostics.count(
          "scenario.brainwashed-npc-count",
          0
        );
        performanceDiagnostics.count("scenario.bit-count", 0);
        performanceDiagnostics.count(
          "scenario.npc-player-targets",
          0
        );
        performanceDiagnostics.count(
          "scenario.bit-player-targets",
          0
        );
      }

      rebuildHumanTargets();
      performanceSectionStartedAt =
        performanceDiagnostics?.beginSection("beam") ?? 0;
      const beamEvents = beamSystem.update(deltaSeconds);
      applyBeamImpacts(beamEvents);
      npcSystem.notifyBeamCompletions(beamEvents.completions);
      performanceDiagnostics?.finishSection(
        "beam",
        performanceSectionStartedAt
      );
      performanceSectionStartedAt =
        performanceDiagnostics?.beginSection(
          "player-combat"
        ) ?? 0;
      playerCombat.update(deltaSeconds);
      performanceDiagnostics?.finishSection(
        "player-combat",
        performanceSectionStartedAt
      );
      rebuildHumanTargets();
      targetNavigationAreaTracker.beginFrame(humanTargets);

      let executionShotEvents:
        | readonly V2ExecutionShotEvent[] = Object.freeze([]);
      if (phase === "playing") {
        alertCoordinator.update(deltaSeconds);
        if (performanceWorkloadScenario) {
          refreshPerformanceCombatAlert(deltaSeconds);
        }
        if (alarmSystem !== null) {
          performanceSectionStartedAt =
            performanceDiagnostics?.beginSection("alarm") ?? 0;
          alarmFrame = alarmSystem.update({
            deltaSeconds,
            humans: humanTargets
          });
          for (const event of alarmFrame.events) {
            audioEventQueue.enqueue(
              Object.freeze({
                kind: "alarm" as const,
                position: event.position.clone()
              })
            );
          }
          performanceDiagnostics?.finishSection(
            "alarm",
            performanceSectionStartedAt
          );
          if (performanceDiagnostics) {
            const alarmDiagnostics =
              alarmSystem.getDiagnostics();
            performanceDiagnostics.count(
              "alarm.candidates",
              alarmDiagnostics.candidateCount
            );
            performanceDiagnostics.count(
              "alarm.spatial-index-candidates",
              alarmDiagnostics.spatialIndexCandidateCount
            );
            performanceDiagnostics.count(
              "alarm.segment-intersection-tests",
              alarmDiagnostics.segmentIntersectionTestCount
            );
          }
        }
        alarmTriggerCount += alarmFrame.events.length;
        npcSystem.setExternalThreats(previousBitThreats);
        npcSystem.setAutonomousThreatActors(
          bitSystem.getFrameView().actorSpheres
        );
        updatePlayerBlockedNpcIds();
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection("npc") ?? 0;
        npcSystem.update(
          deltaSeconds,
          getPlayerTarget(),
          alarmFrame.events
        );
        applyNoGunContactBrainwashImpacts();
        performanceDiagnostics?.finishSection(
          "npc",
          performanceSectionStartedAt
        );
        const npcFrameView = npcSystem.getFrameView();
        performanceDiagnostics?.count(
          "npc.route-plans",
          npcFrameView.pathRecalculationCount
        );
        performanceDiagnostics?.count(
          "npc.waiting-for-path",
          npcFrameView.waitingForPathCount
        );
        performanceDiagnostics?.count(
          "npc.direct-movement-while-waiting",
          npcFrameView.directMovementWhileWaitingCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.area",
          npcFrameView.areaPursuitCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.coarse",
          npcFrameView.coarsePursuitCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.detail",
          npcFrameView.detailPursuitCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.promotions",
          npcFrameView.pursuitPromotionCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.demotions",
          npcFrameView.pursuitDemotionCount
        );
        performanceDiagnostics?.count(
          "npc.replan.queued",
          npcFrameView.replanQueuedCount
        );
        performanceDiagnostics?.count(
          "npc.replan.coalesced",
          npcFrameView.replanCoalescedCount
        );
        performanceDiagnostics?.count(
          "npc.replan.max-wait-ms",
          npcFrameView.replanMaximumWaitSeconds * 1000
        );
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection(
            "player-combat"
          ) ?? 0;
        playerCombat.setAliveBehaviorState(
          npcSystem
            .getFrameView()
            .threatenedTargetIds
            .includes(PLAYER_ID)
            ? "evade"
            : "normal"
        );
        performanceDiagnostics?.finishSection(
          "player-combat",
          performanceSectionStartedAt
        );
        rebuildHumanTargets();

        const activeAlerts =
          alertCoordinator.getActiveAlerts();
        performanceDiagnostics?.count(
          "scenario.active-alerts",
          activeAlerts.length
        );
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection("bit") ?? 0;
        bitSystem.update({
          deltaSeconds,
          elapsedSeconds,
          targets: humanTargets,
          externalAlerts: activeAlerts
        });
        const bitFrameView = bitSystem.getFrameView();
        bitActorById.clear();
        for (const actor of bitFrameView.actorSpheres) {
          bitActorById.set(actor.id, actor);
        }
        humanTargetById.clear();
        for (const target of humanTargets) {
          humanTargetById.set(target.id, target);
        }
        recordBitTargetEvents(bitFrameView, bitActorById);
        performanceDiagnostics?.count(
          "bit.target-history-size",
          previousBitTargetIds.size
        );
        performanceDiagnostics?.finishSection(
          "bit",
          performanceSectionStartedAt
        );
        if (performanceDiagnostics) {
          const bitDiagnostics = bitFrameView.diagnostics;
          performanceDiagnostics.count(
            "bit.route-plans.search",
            bitDiagnostics.routePlans.search
          );
          performanceDiagnostics.count(
            "bit.route-plans.chase",
            bitDiagnostics.routePlans.chase
          );
          performanceDiagnostics.count(
            "bit.route-plans.escape",
            bitDiagnostics.routePlans.escape
          );
          performanceDiagnostics.count(
            "bit.pursuit.area",
            bitDiagnostics.areaPursuitCount
          );
          performanceDiagnostics.count(
            "bit.pursuit.detail",
            bitDiagnostics.detailPursuitCount
          );
          performanceDiagnostics.count(
            "bit.route-plan-ms.search",
            bitDiagnostics.routePlanMilliseconds.search
          );
          performanceDiagnostics.count(
            "bit.route-plan-ms.chase",
            bitDiagnostics.routePlanMilliseconds.chase
          );
          performanceDiagnostics.count(
            "bit.route-plan-ms.escape",
            bitDiagnostics.routePlanMilliseconds.escape
          );
          performanceDiagnostics.count(
            "bit.sight-rays",
            bitDiagnostics.sightRays
          );
          performanceDiagnostics.count(
            "bit.sphere-sweeps",
            bitDiagnostics.sphereSweeps
          );
          performanceDiagnostics.count(
            "bit.sphere-sweep-ms",
            bitDiagnostics.sphereSweepMilliseconds
          );
          performanceDiagnostics.count(
            "bit.beam-requests",
            bitDiagnostics.beamRequests
          );
          performanceDiagnostics.count("bit.reinforcement-spawns", bitDiagnostics.reinforcementSpawns);
        }
        previousBitThreats = buildBitThreats(
          bitFrameView,
          bitActorById,
          humanTargetById
        );

        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection(
            "execution"
          ) ?? 0;
        const survivors = humanTargets.filter(
          (target) => target.alive
        );
        const allBrainwashed =
          areAllV2HumansBrainwashed(humanTargets);
        if (allBrainwashed) {
          allDeadSeconds += deltaSeconds;
          executionSystem.advanceCandidate(deltaSeconds, {
            survivors,
            blocks: Object.freeze([]),
            bitShooterCount:
              bitFrameView.actorSpheres.length
          });
          if (
            allDeadSeconds >=
            ALL_DEAD_ASSEMBLY_DELAY_SECONDS
          ) {
            enterAssembly();
          }
        } else if (survivors.length === 0) {
          allDeadSeconds = 0;
          executionSystem.advanceCandidate(deltaSeconds, {
            survivors,
            blocks: Object.freeze([]),
            bitShooterCount:
              bitFrameView.actorSpheres.length
          });
        } else {
          allDeadSeconds = 0;
          const candidate = executionSystem.advanceCandidate(
            deltaSeconds,
            {
              survivors,
              blocks: buildExecutionBlocks(),
              bitShooterCount:
                bitFrameView.actorSpheres.length
            }
          );
          if (candidate) {
            enterExecution(candidate);
          }
        }
        performanceDiagnostics?.finishSection(
          "execution",
          performanceSectionStartedAt
        );

        performanceSectionStartedAt = performanceDiagnostics?.beginSection("mission") ?? 0;
        updateMissionFrame(deltaSeconds, elevators);
        performanceDiagnostics?.finishSection("mission", performanceSectionStartedAt);
        if (phase === "playing") {
          alertCoordinator.publish([
            ...npcSystem.drainAlertRequests(),
            ...bitSystem.takeAlertRequests()
          ]);
          performanceSectionStartedAt =
            performanceDiagnostics?.beginSection("beam") ?? 0;
          const npcBeamRequests =
            npcSystem.drainBeamRequests();
          const bitBeamRequests = bitFrameView.beamRequests;
          performanceDiagnostics?.count(
            "beam.spawned",
            npcBeamRequests.length + bitBeamRequests.length
          );
          const npcBeamSpawns: V2NpcBeamSpawn[] = [];
          for (const request of npcBeamRequests) {
            npcBeamSpawns.push(
              Object.freeze({
                sourceId: request.sourceId,
                beamId: recordBeamSpawn(request)
              })
            );
          }
          npcSystem.notifyBeamsSpawned(
            Object.freeze(npcBeamSpawns)
          );
          for (const request of bitBeamRequests) {
            recordBeamSpawn(request);
          }
          performanceDiagnostics?.finishSection(
            "beam",
            performanceSectionStartedAt
          );
        }
      } else {
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection("npc") ?? 0;
        npcSystem.update(
          deltaSeconds,
          getPlayerTarget(),
          EMPTY_ALARM_FRAME.events
        );
        applyNoGunContactBrainwashImpacts();
        performanceDiagnostics?.finishSection(
          "npc",
          performanceSectionStartedAt
        );
        const npcFrameView = npcSystem.getFrameView();
        performanceDiagnostics?.count(
          "npc.route-plans",
          npcFrameView.pathRecalculationCount
        );
        performanceDiagnostics?.count(
          "npc.waiting-for-path",
          npcFrameView.waitingForPathCount
        );
        performanceDiagnostics?.count(
          "npc.direct-movement-while-waiting",
          npcFrameView.directMovementWhileWaitingCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.area",
          npcFrameView.areaPursuitCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.coarse",
          npcFrameView.coarsePursuitCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.detail",
          npcFrameView.detailPursuitCount
        );
        rebuildHumanTargets();
        if (phase === "assembly") {
          const playerTarget = getPlayerTarget();
          if (
            playerTarget.brainwashed &&
            playerTarget.state !==
              "brainwash-complete-haigure-formation"
          ) {
            playerCombat.enterFormationState();
          }
          const npcIdsEnteringFormation: string[] = [];
          for (const target of npcSystem.getFrameView().targets) {
            if (
              target.brainwashed &&
              target.state !==
                "brainwash-complete-haigure-formation"
            ) {
              npcIdsEnteringFormation.push(target.id);
            }
          }
          npcSystem.enterFormationStates(
            Object.freeze(npcIdsEnteringFormation)
          );
          rebuildHumanTargets();
        } else if (phase === "execution") {
          performanceSectionStartedAt =
            performanceDiagnostics?.beginSection(
              "execution"
            ) ?? 0;
          completeExecutionTargets();
          performanceDiagnostics?.finishSection(
            "execution",
            performanceSectionStartedAt
          );
          if (phase === "execution") {
            performanceSectionStartedAt =
              performanceDiagnostics?.beginSection(
                "execution"
              ) ?? 0;
            executionShotEvents =
              executionSystem.update(deltaSeconds);
            performanceDiagnostics?.finishSection(
              "execution",
              performanceSectionStartedAt
            );
          }
        }
        npcSystem.drainBeamRequests();
        npcSystem.drainAlertRequests();
        performanceSectionStartedAt = performanceDiagnostics?.beginSection("mission") ?? 0;
        updateMissionFrame(deltaSeconds, elevators);
        performanceDiagnostics?.finishSection("mission", performanceSectionStartedAt);
      }

      if (phase === "execution") {
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection("beam") ?? 0;
        const executionBeamRequests =
          createExecutionBeamRequests(executionShotEvents);
        performanceDiagnostics?.count(
          "beam.spawned",
          executionBeamRequests.length
        );
        for (const request of executionBeamRequests) {
          recordBeamSpawn(request);
        }
        performanceDiagnostics?.finishSection(
          "beam",
          performanceSectionStartedAt
        );
      }
      if (
        phase === "playing" ||
        phase === "execution"
      ) {
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection("beam") ?? 0;
        performanceDiagnostics?.count(
          "beam.spawned",
          pendingPlayerBeamRequests.length +
            pendingPlayerGunFireEvents.length
        );
        for (const request of pendingPlayerBeamRequests) {
          recordBeamSpawn(request);
        }
        for (const event of pendingPlayerGunFireEvents) {
          recordBeamSpawn(event.beamRequest);
        }
        performanceDiagnostics?.finishSection(
          "beam",
          performanceSectionStartedAt
        );
      }
      pendingPlayerBeamRequests = [];
      pendingPlayerGunFireEvents = [];
      performanceSectionStartedAt =
        performanceDiagnostics?.beginSection(
          "hit-effect"
        ) ?? 0;
      if (hitEffectSystem.activeCount > 0) {
        performanceDiagnostics?.count("hit-effect.updates");
        hitEffectSystem.update(
          deltaSeconds,
          humanTargets,
          getFrameOrbVisibilityPredicate()
        );
      }
      performanceDiagnostics?.finishSection(
        "hit-effect",
        performanceSectionStartedAt
      );
      if (performanceDiagnostics) {
        let aliveTargetCount = 0;
        for (const target of humanTargets) {
          if (target.alive) {
            aliveTargetCount += 1;
          }
        }
        const npcFrameView = npcSystem.getFrameView();
        const bitFrameView = bitSystem.getFrameView();
        performanceDiagnostics.count("bit.population-count", bitFrameView.populationBitCount);
        performanceDiagnostics.count(
          "scenario.alive-targets",
          aliveTargetCount
        );
        performanceDiagnostics.count(
          "scenario.playing",
          phase === "playing" ? 1 : 0
        );
        performanceDiagnostics.count(
          "scenario.npc-count",
          npcFrameView.targets.length
        );
        performanceDiagnostics.count(
          "scenario.bit-count",
          bitFrameView.actorSpheres.length
        );
      }
      performanceDiagnostics?.count(
        "beam.active",
        beamSystem.activeCount
      );
      performanceDiagnostics?.count(
        "npc.frame-view-builds",
        npcSystem.getFrameView().frameViewBuildSequence -
          npcFrameViewBuildSequenceAtUpdateStart
      );
      if (performanceDiagnostics) {
        const pool = beamSystem.getVisualPoolSnapshot();
        for (const kind of V2_BEAM_VISUAL_POOL_KINDS) {
          performanceDiagnostics.count(
            `beam.pool.${kind}.capacity`,
            pool[kind].capacity
          );
          performanceDiagnostics.count(
            `beam.pool.${kind}.in-use`,
            pool[kind].inUse
          );
        }
        const hitEffectPool =
          hitEffectSystem.getVisualPoolSnapshot();
        for (const kind of V2_HIT_EFFECT_POOL_KINDS) {
          performanceDiagnostics.count(
            `hit-effect.pool.${kind}.capacity`,
            hitEffectPool[kind].capacity
          );
          performanceDiagnostics.count(
            `hit-effect.pool.${kind}.in-use`,
            hitEffectPool[kind].inUse
          );
        }
      }

      performanceSectionStartedAt =
        performanceDiagnostics?.beginSection(
          "frame-build"
        ) ?? 0;
      minimapActorSnapshots =
        phase === "playing"
          ? buildMinimapActorSnapshots()
          : EMPTY_V2_MINIMAP_ACTOR_SNAPSHOTS;
      frame = buildFrame();
      performanceDiagnostics?.count(
        "scenario.brainwashed-npc-count",
        frame.brainwashedNpcCount
      );
      performanceDiagnostics?.count(
        "scenario.npc-player-targets",
        frame.npcPlayerTargetCount
      );
      performanceDiagnostics?.count(
        "scenario.bit-player-targets",
        frame.bitPlayerTargetCount
      );
      performanceDiagnostics?.finishSection(
        "frame-build",
        performanceSectionStartedAt
      );
      return frame;
    },
    getFrame: () => {
      assertActive();
      return frame;
    },
    drainAudioEvents: () => {
      assertActive();
      return audioEventQueue.drain();
    },
    canPlayerMove: () => {
      assertActive();
      return canPlayerMove();
    },
    releaseAssemblyPlayerControl: () => {
      assertActive();
      if (phase !== "assembly" || assemblyPlayerControlReleased) {
        return false;
      }
      assemblyPlayerControlReleased = true;
      frame = buildFrame();
      return true;
    },
    selectPlayerCompletion: (state) => {
      assertActive();
      if (phase !== "playing") {
        throw new Error(
          "プレイヤー洗脳完了状態はplaying中に選択してください。"
        );
      }
      playerCombat.selectCompletion(state);
      rebuildHumanTargets();
      frame = buildFrame();
    },
    getNpcCommandCandidates: () => {
      assertActive();
      if (phase !== "playing") {
        return Object.freeze([]);
      }
      return npcSystem.getCommandCandidates(
        createNpcCommandQuery()
      );
    },
    requestNpcCommand: (npcId, kind) => {
      assertActive();
      if (!allNpcIdSet.has(npcId)) {
        throw new Error(`未登録のV2 NPC IDです: ${npcId}`);
      }
      if (phase !== "playing") {
        return false;
      }
      const accepted = npcSystem.requestCommand(
        npcId,
        kind,
        createNpcCommandQuery()
      );
      if (accepted) {
        missionRuntime?.notifyNpcCommandChanged(npcId, kind);
        missionFrame = missionRuntime?.getFrame() ?? null;
        minimapActorSnapshots = buildMinimapActorSnapshots();
        frame = buildFrame();
      }
      return accepted;
    },
    cancelNpcFollow: (npcId) => {
      assertActive();
      if (!allNpcIdSet.has(npcId)) {
        throw new Error(`未登録のV2 NPC IDです: ${npcId}`);
      }
      if (phase !== "playing") {
        return false;
      }
      const cancelled = npcSystem.cancelFollow(npcId);
      if (cancelled) {
        missionRuntime?.notifyNpcCommandChanged(npcId, "leave");
        missionFrame = missionRuntime?.getFrame() ?? null;
        minimapActorSnapshots = buildMinimapActorSnapshots();
        frame = buildFrame();
      }
      return cancelled;
    },
    notifyPlayerElevatorStartedMoving: () => {
      assertActive();
      missionRuntime?.notifyPlayerElevatorStartedMoving();
      missionFrame = missionRuntime?.getFrame() ?? null;
      minimapActorSnapshots = buildMinimapActorSnapshots();
      frame = buildFrame();
    },
    setHostileActionsSuspended: (suspended) => {
      assertActive();
      hostileActionsSuspendedByRuntime = suspended;
      npcSystem.setHostileActionsSuspended(suspended);
      bitSystem.setHostileActionsSuspended(suspended);
    },
    requestBroadcast: (command) => {
      assertActive();
      if (phase !== "playing") {
        return false;
      }
      const update = Object.freeze({
        playerState: playerCombat.getStateSnapshot().state,
        playerFootPosition: player.getFootPosition(),
        npcs: buildMissionNpcSnapshots()
      });
      if (missionRuntime !== null) {
        missionRuntime.executeBroadcast(command, update);
        missionFrame = missionRuntime.getFrame();
        instructionAssemblyVenueId = resolveV2MissionAssemblyVenueId(
          missionFrame
        );
      } else {
        broadcastRuntime!.execute(command, update);
        instructionAssemblyVenueId = broadcastRuntime!.getAssemblyVenueId();
      }
      rebuildHumanTargets();
      minimapActorSnapshots = buildMinimapActorSnapshots();
      frame = buildFrame();
      return true;
    },
    previewNpcLocationMissionRoute: (npcId, locationId) => {
      assertActive();
      const location = locationAssets.getMissionLocationById(locationId);
      if (!location) {
        throw new Error(`未登録のMission Locationです: ${locationId}`);
      }
      const currentContext = npcSystem.getNavigationRouteContext(npcId);
      const missionContext = Object.freeze({
        ...currentContext,
        behavior: "mission" as const,
        targetId: null,
        playerElevatorTraversal: null,
        targetProvenance: null,
        targetSelectionPersonality: null,
        targetSightClear: false
      });
      const path = stage.navigation.findPath(
        missionContext.location,
        location.navigationLocation,
        "npc",
        Object.freeze({
          selectRoute: (candidates: readonly NavigationRouteCandidate[]) =>
            selectNavigationRoute(missionContext, candidates)
        })
      );
      if (path === null) {
        return null;
      }
      return path.steps.some((step) => step.kind === "transition")
        ? "link"
        : "surface";
    },
    requestNpcLocationMission: (npcId, locationId) => {
      assertActive();
      if (missionRuntime === null) {
        throw new Error("Mission OFFではNPC Location Missionを開始できません。");
      }
      if (phase !== "playing") {
        throw new Error("NPC Location Missionはplaying中だけ要求できます。");
      }
      const mission = missionRuntime.assignNpcLocationMission(
        npcId,
        locationId,
        buildMissionNpcSnapshots()
      );
      rebuildHumanTargets();
      missionFrame = missionRuntime.getFrame();
      minimapActorSnapshots = buildMinimapActorSnapshots();
      frame = buildFrame();
      return mission;
    },
    getMissions: () => {
      assertActive();
      return missionRuntime?.getMissions() ?? Object.freeze([]);
    },
    getHumanTargets: () => {
      assertActive();
      return humanTargets;
    },
    getBitActors: () => {
      assertActive();
      return bitSystem.getFrameView().actorSpheres;
    },
    getMinimapActors: () => {
      assertActive();
      return minimapActorSnapshots;
    },
    releaseNpcTraversalForScriptedPhase: () => {
      assertActive();
      npcSystem.releaseTraversalForScriptedPhase();
      rebuildHumanTargets();
    },
    drainNpcTraversalRequests: () => {
      assertActive();
      return npcSystem.drainTraversalRequests();
    },
    applyNpcTraversalResults: (results) => {
      assertActive();
      const notifications =
        npcSystem.applyTraversalResults(results);
      for (const result of results) {
        if (
          result.kind === "elevator-disembarked" ||
          result.kind === "elevator-safety-evicted"
        ) {
          targetNavigationAreaTracker.relocate(
            result.npcId,
            result.location.position
          );
        }
      }
      rebuildHumanTargets();
      return notifications;
    },
    getNpcTraversalState: (npcId) => {
      assertActive();
      return npcSystem.getTraversalState(npcId);
    },
    getNpcPosition: (npcId) => {
      assertActive();
      return npcSystem.getNpcPosition(npcId);
    },
    setNpcTransportPosition: (npcId, position) => {
      assertActive();
      assertFiniteVector("NPC搬送位置", position);
      npcSystem.setNpcTransportPosition(npcId, position);
      rebuildHumanTargets();
    },
    relocateBit: (bitId, candidates) => {
      assertActive();
      return bitSystem.relocateBit(bitId, candidates);
    },
    beginTargetNavigationAreaTransport: (targetId, position) => {
      assertActive();
      assertFiniteVector("標的Navigation Area搬送開始位置", position);
      targetNavigationAreaTracker.beginTransport(targetId, position);
    },
    updateTargetNavigationAreaTransportPosition: (targetId, position) => {
      assertActive();
      assertFiniteVector("標的Navigation Area搬送位置", position);
      targetNavigationAreaTracker.updateTransportPosition(
        targetId,
        position
      );
      if (targetId === PLAYER_ID) {
        rebuildHumanTargets();
      }
    },
    relocateTargetNavigationArea: (targetId, position) => {
      assertActive();
      assertFiniteVector("標的Navigation Area再配置位置", position);
      targetNavigationAreaTracker.relocate(targetId, position);
      if (targetId === PLAYER_ID) {
        rebuildHumanTargets();
      }
    },
    requestPlayerGunFire: (direction) => {
      assertActive();
      assertFiniteVector("プレイヤー射撃方向", direction);
      if (direction.lengthSquared() === 0) {
        throw new Error(
          "プレイヤー射撃方向をゼロベクトルにできません。"
        );
      }
      if (phase === "playing") {
        const event = playerCombat.requestGunFire(
          player.getEyePosition(),
          direction
        );
        if (!event) {
          return false;
        }
        pendingPlayerGunFireEvents.push(event);
        npcSystem.notifyPlayerGunFire(event);
        return true;
      }
      if (phase !== "execution") {
        return false;
      }
      const executionFrame = executionSystem.getFrame();
      if (
        executionFrame.candidate?.playerRole !== "shooter"
      ) {
        return false;
      }
      const targetIds = executionFrame.candidate.targets
        .map((target) => target.id)
        .filter(
          (targetId) =>
            !executionFrame.completedTargetIds.includes(targetId)
        );
      if (targetIds.length === 0) {
        return false;
      }
      const normalized = direction.clone().normalize();
      pendingPlayerBeamRequests.push(
        Object.freeze({
          sourceId: PLAYER_ID,
          originKind: "execution-player" as const,
          targetPolicy: Object.freeze({
            kind: "execution-manual" as const,
            targetIds: Object.freeze(targetIds)
          }),
          origin: player
            .getEyePosition()
            .add(
              normalized.scale(
                V2_PLAYER_GUN_BEAM_ORIGIN_OFFSET
              )
            ),
          direction: normalized,
          speed: V2_PLAYER_GUN_BEAM_SPEED,
          maximumLifetime:
            V2_PLAYER_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS
        })
      );
      return true;
    },
    replayExecution: () => {
      assertActive();
      if (phase !== "execution-complete") {
        throw new Error(
          "公開処刑リプレイは処刑完了後に開始してください。"
        );
      }
      const candidate = executionSystem.getFrame().candidate;
      if (!candidate) {
        throw new Error("公開処刑リプレイ対象がありません。");
      }
      clearCombatForPhaseTransition();
      prepareExecutionTargetStates(candidate);
      const replayFrame = executionSystem.replay();
      prepareExecutionParticipantStates(
        candidate,
        replayFrame,
        false
      );
      applyExecutionPlacements(replayFrame);
      phase = "execution";
      rebuildHumanTargets();
      frame = buildFrame();
    },
    dispose: () => {
      assertActive();
      missionRuntime?.dispose();
      broadcastRuntime?.dispose();
      npcSystem.clearCommands();
      hitEffectSystem.dispose();
      beamSystem.dispose();
      executionSystem.reset();
      alarmSystem?.dispose();
      bitSystem.dispose();
      npcSystem.dispose();
      targetNavigationAreaTracker.dispose();
      alertCoordinator.clear();
      humanTargets = Object.freeze([]);
      minimapActorSnapshots = EMPTY_V2_MINIMAP_ACTOR_SNAPSHOTS;
      pendingPlayerBeamRequests = [];
      pendingPlayerGunFireEvents = [];
      audioEventQueue.dispose();
      previousBitTargetIds.clear();
      bitActorById.clear();
      humanTargetById.clear();
      disposed = true;
    }
  };
};
