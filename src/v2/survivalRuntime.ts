import { Frustum, Vector3, type Scene } from "@babylonjs/core";

import {
  prepareBitFlightNavigationRouteCaches
} from "../world/bitFlightNavigation";
import type {
  NavigationRouteCandidate
} from "../world/navigationWorld";
import type { StageSpatialContext } from "../world/stageSpatialContext";
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
import {
  createAssemblyPositions,
  selectAssemblyVenueByWeight
} from "./assemblyLayout";
import {
  createV2BeamSystem,
  V2_BEAM_VISUAL_POOL_KINDS,
  type V2BeamFrameEvents,
  type V2BeamSystem
} from "./beamCollision";
import {
  createV2BitSystem,
  type V2BitSystem
} from "./bitSystem";
import {
  createV2HitEffectSystem,
  V2_HIT_EFFECT_POOL_KINDS,
  type V2HitEffectSystem
} from "./hitEffectSystem";
import {
  type V2BeamRequest,
  type V2CharacterState,
  type V2HumanTargetSnapshot,
  type V2PlayerCompletionState,
  type V2TargetProvenance
} from "./combatTypes";
import {
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
  V2NpcTraversalState
} from "./npcTraversal";
import type {
  V2PerformanceDiagnostics,
  V2PerformanceScenario
} from "./performanceDiagnostics";
import {
  createV2TargetNavigationAreaTracker,
  type V2TargetNavigationAreaFrame,
  type V2TargetNavigationAreaTracker
} from "./pursuitNavigation";
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
  areAllV2HumansBrainwashed,
  canV2SurvivalPlayerMove,
  createV2ExecutionBitPositions,
  selectV2ExecutionAudienceIds,
  selectV2PlayerBlockedNpcIds
} from "./survivalRules";

const ALERT_DURATION_SECONDS = 15;
const PERFORMANCE_ALERT_REFRESH_SECONDS = 10;
const ALL_DEAD_ASSEMBLY_DELAY_SECONDS = 3;
const PLAYER_ID = "player";
const EMPTY_ALARM_FRAME: V2AlarmFrame = Object.freeze({
  events: Object.freeze([]),
  activeCandidateIds: Object.freeze([]),
  activeFloors: Object.freeze([]),
  usedCandidateIds: Object.freeze([]),
  blinks: Object.freeze([])
});

export type V2SurvivalPhase =
  | "playing"
  | "assembly"
  | "execution"
  | "execution-complete";

export type V2SurvivalFrame = Readonly<{
  phase: V2SurvivalPhase;
  assemblyVenueId: string;
  playerState: V2CharacterState;
  playerCompletionUnlocked: boolean;
  playerCanMove: boolean;
  npcCount: number;
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
  prepareVisualResources(): Promise<void>;
  update(deltaSeconds: number, elapsedSeconds: number): V2SurvivalFrame;
  getFrame(): V2SurvivalFrame;
  canPlayerMove(): boolean;
  selectPlayerCompletion(state: V2PlayerCompletionState): void;
  getNpcCommandCandidates(): readonly V2NpcCommandCandidate[];
  requestNpcCommand(npcId: string, kind: V2NpcCommandKind): boolean;
  cancelNpcFollow(npcId: string): boolean;
  getHumanTargets(): readonly V2HumanTargetSnapshot[];
  releaseNpcTraversalForScriptedPhase(): void;
  drainNpcTraversalRequests(): readonly V2NpcTraversalRequest[];
  applyNpcTraversalResults(
    results: readonly V2NpcTraversalResult[]
  ): readonly V2NpcTraversalNotification[];
  getNpcTraversalState(npcId: string): V2NpcTraversalState;
  getNpcPosition(npcId: string): Vector3;
  setNpcTransportPosition(npcId: string, position: Vector3): void;
  requestPlayerGunFire(direction: Vector3): boolean;
  replayExecution(): void;
  dispose(): void;
}

export type V2SurvivalPopulation = Readonly<{
  npcCount: number;
  initialBrainwashedNpcCount: number;
  bitCount: number;
}>;

export const V2_TEST_SURVIVAL_POPULATION: V2SurvivalPopulation =
  Object.freeze({
    npcCount: 50,
    initialBrainwashedNpcCount: 33,
    bitCount: 20
  });

export const V2_PERFORMANCE_ACCEPTANCE_POPULATION:
  V2SurvivalPopulation = Object.freeze({
    npcCount: 99,
    initialBrainwashedNpcCount: 66,
    bitCount: 50
  });

export type V2SurvivalRuntimeOptions = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  player: V2PlayerController;
  random: () => number;
  getOrbVisibilityPredicate(): (position: Vector3) => boolean;
  population: V2SurvivalPopulation;
  performanceDiagnostics: V2PerformanceDiagnostics | null;
  performanceWorkloadScenario: V2PerformanceScenario | null;
  releaseStageTraversalForScriptedPhase(): void;
  selectNavigationRoute(
    context: V2NpcNavigationRouteContext,
    candidates: readonly NavigationRouteCandidate[]
  ): NavigationRouteCandidate | null;
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
    ["bitCount", population.bitCount]
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
};

const requireRandom = (random: () => number) => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `V2SurvivalRuntimeのrandomは0以上1未満が必要です: ${value}`
    );
  }
  return value;
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
  player,
  random,
  getOrbVisibilityPredicate,
  population,
  performanceDiagnostics,
  performanceWorkloadScenario,
  releaseStageTraversalForScriptedPhase,
  selectNavigationRoute
}: V2SurvivalRuntimeOptions): V2SurvivalRuntime => {
  if (typeof random !== "function") {
    throw new Error("V2SurvivalRuntimeのrandomには関数が必要です。");
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

  let visualRandomState = 0x6d2b79f5;
  const visualRandom = () => {
    visualRandomState =
      (Math.imul(visualRandomState, 1664525) + 1013904223) >>> 0;
    return visualRandomState / 0x1_0000_0000;
  };

  const assemblyVenue = selectAssemblyVenueByWeight(
    stage.assemblyVenues.all,
    requireRandom(random)
  );
  const playerCombat = createV2PlayerCombatSystem({
    playerId: PLAYER_ID,
    initialState: "normal",
    random
  });

  let ownedNpcSystem: V2NpcSystem | null = null;
  let ownedBitSystem: V2BitSystem | null = null;
  let ownedAlertCoordinator: V2AlertCoordinator | null = null;
  let ownedAlarmSystem: V2AlarmSystem | null = null;
  let ownedExecutionSystem: V2PublicExecutionSystem | null = null;
  let ownedBeamSystem: V2BeamSystem | null = null;
  let ownedHitEffectSystem: V2HitEffectSystem | null = null;
  let ownedTargetNavigationAreaTracker: V2TargetNavigationAreaTracker | null =
    createV2TargetNavigationAreaTracker(stage.navigationAreas);
  let humanTargets: readonly V2HumanTargetSnapshot[] =
    Object.freeze([]);
  let targetNavigationAreaFrame: V2TargetNavigationAreaFrame = new Map();
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
    ownedNpcSystem = createV2NpcSystem({
      scene,
      stage,
      npcCount: population.npcCount,
      initialBrainwashedNpcCount:
        population.initialBrainwashedNpcCount,
      diagnosticsEnabled: performanceDiagnostics !== null,
      random,
      resolveTargetNavigationArea: (target) => {
        const snapshot = targetNavigationAreaFrame.get(target.id);
        if (!snapshot) {
          throw new Error(
            `追跡標的のNavigation Area snapshotがありません: ${target.id}`
          );
        }
        return snapshot;
      },
      selectNavigationRoute
    });
    ownedBitSystem = createV2BitSystem(scene, stage, {
      initialBitCount: population.bitCount,
      minimumSpawnDistance: 0.2,
      spawnMaxAttempts: 512,
      spawnProjectionMaxDistance: 0.75,
      combatEnabled: true,
      random,
      resolveTargetNavigationArea: (target) => {
        const snapshot = targetNavigationAreaFrame.get(target.id);
        if (!snapshot) {
          throw new Error(
            `追跡標的のNavigation Area snapshotがありません: ${target.id}`
          );
        }
        return snapshot;
      }
    });
    ownedAlertCoordinator = createV2AlertCoordinator({
      alertDuration: ALERT_DURATION_SECONDS
    });
    ownedAlarmSystem = createV2AlarmSystem({
      candidateProvider:
        createV2NavigationAlarmCandidateProvider(stage),
      diagnosticsEnabled: performanceDiagnostics !== null,
      random
    });
    ownedExecutionSystem =
      createV2PublicExecutionSystem(random);
    ownedHitEffectSystem = createV2HitEffectSystem({
      scene,
      random: visualRandom,
      isIndirectLightVisible
    });
    humanTargets = Object.freeze([
      playerCombat.createTargetSnapshot(
        player.getFootPosition(),
        player.getEyePosition()
      ),
      ...ownedNpcSystem.getFrameView().targets
    ]);
    targetNavigationAreaFrame = ownedTargetNavigationAreaTracker.update(
      humanTargets
    );
    ownedBeamSystem = createV2BeamSystem({
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
    });
  } catch (error) {
    ownedBeamSystem?.dispose();
    ownedHitEffectSystem?.dispose();
    ownedExecutionSystem?.reset();
    ownedAlarmSystem?.dispose();
    ownedAlertCoordinator?.clear();
    ownedBitSystem?.dispose();
    ownedNpcSystem?.dispose();
    ownedTargetNavigationAreaTracker?.dispose();
    throw error;
  }

  const npcSystem = ownedNpcSystem;
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
  let allDeadSeconds = 0;
  let blockerImpactCount = 0;
  let actorImpactCount = 0;
  let alarmTriggerCount = 0;
  let pendingPlayerBeamRequests: V2BeamRequest[] = [];
  let pendingPlayerGunFireEvents: V2PlayerGunFireEvent[] = [];
  let playerBlockedNpcIds: readonly string[] = Object.freeze([]);
  let previousBitThreats: readonly V2NpcExternalThreat[] =
    Object.freeze([]);
  let alarmFrame: V2AlarmFrame = alarmSystem.getFrame();
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

  const getPlayerTarget = () => {
    const target = humanTargets.find(
      (candidate) => candidate.id === PLAYER_ID
    );
    if (!target) {
      throw new Error("player snapshotがありません。");
    }
    return target;
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
      executionPlayerRole:
        executionSystem.getFrame().candidate?.playerRole ?? null
    });
  };

  const clearCombatForPhaseTransition = () => {
    releaseStageTraversalForScriptedPhase();
    npcSystem.clearCommands();
    npcSystem.setAiSuspended(true);
    npcSystem.setExternalThreats(Object.freeze([]));
    npcSystem.setPlayerBlockedTargetIds(Object.freeze([]));
    bitSystem.prepareForScriptedPhase();
    bitSystem.setAiSuspended(true);
    beamSystem.clear();
    hitEffectSystem.clear();
    alertCoordinator.clear();
    alarmFrame = EMPTY_ALARM_FRAME;
    pendingPlayerBeamRequests = [];
    pendingPlayerGunFireEvents = [];
    playerBlockedNpcIds = Object.freeze([]);
    previousBitThreats = Object.freeze([]);
    npcSystem.drainBeamRequests();
    bitSystem.takeAlertRequests();
  };

  const placeHumansForAssembly = () => {
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
    rebuildHumanTargets();
  };

  const enterAssembly = () => {
    clearCombatForPhaseTransition();
    executionSystem.reset();
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
    executionFrame: V2PublicExecutionFrame
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
      playerCombat.prepareExecutionShooter();
    } else if (candidate.playerRole === "observer") {
      playerCombat.prepareExecutionAudience();
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
    npcSystem.prepareExecutionRoles(Object.freeze(npcAssignments));
    rebuildHumanTargets();
  };

  const applyExecutionPlacements = (
    executionFrame: V2PublicExecutionFrame
  ) => {
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
      const bitIds = bitSystem
        .getFrameView()
        .actorSpheres
        .map((actor) => actor.id);
      const bitPositions = createV2ExecutionBitPositions(
        assemblyVenue,
        bitIds.length,
        playerPosition
      );
      bitSystem.placeBits(
        bitIds.map((id, index) =>
          Object.freeze({
            id,
            centerPosition: bitPositions[index]
          })
        )
      );
    }
    rebuildHumanTargets();
  };

  const placeHumansForExecution = (
    candidate: V2ExecutionCandidate
  ) => {
    const audienceIds = selectV2ExecutionAudienceIds(
      humanTargets.map((target) => target.id),
      candidate.targets.map((target) => target.id)
    );
    const bitIds = bitSystem
      .getFrameView()
      .actorSpheres
      .map((actor) => actor.id);
    const audienceNpcIds = new Set(
      audienceIds.filter((id) => id !== PLAYER_ID)
    );
    const npcShooterIds = humanTargets
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
      executionFrame
    );
    applyExecutionPlacements(executionFrame);
  };

  const enterExecution = (
    candidate: V2ExecutionCandidate
  ) => {
    clearCombatForPhaseTransition();
    prepareExecutionTargetStates(candidate);
    placeHumansForExecution(candidate);
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
        npcImpacts.push(
          Object.freeze({
            npcId: targetId,
            source
          })
        );
      }
      notificationEntries.push(
        Object.freeze({
          sourceId: event.sourceId,
          targetId,
          originKind: event.originKind,
          target: event.hit.actor,
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

  const buildBitThreats = (): readonly V2NpcExternalThreat[] => {
    const bitPositions = new Map(
      bitSystem
        .getFrameView()
        .actorSpheres
        .map((actor) => [actor.id, actor.center] as const)
    );
    const targetIds = new Set<string>();
    const threats: V2NpcExternalThreat[] = [];
    for (const tracking of bitSystem.getFrameView().targetStates) {
      if (
        tracking.targetId === null ||
        targetIds.has(tracking.targetId)
      ) {
        continue;
      }
      const sourcePosition = bitPositions.get(tracking.bitId);
      if (!sourcePosition) {
        throw new Error(
          `bit脅威元位置がありません: ${tracking.bitId}`
        );
      }
      const target = humanTargets.find(
        (candidate) => candidate.id === tracking.targetId
      );
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
          sourcePosition: sourcePosition.clone(),
          sightClear:
            stage.queries.castSightSegment(
              sourcePosition,
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
    const executionFrame = executionSystem.getFrame();
    return Object.freeze({
      phase,
      assemblyVenueId: assemblyVenue.id,
      playerState: playerStateSnapshot.state,
      playerCompletionUnlocked:
        playerStateSnapshot.playerCompletionUnlocked,
      playerCanMove: canPlayerMove(),
      npcCount: npcFrameView.targets.length,
      brainwashedNpcCount,
      bitCount: bitFrameView.actorSpheres.length,
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

  let frame = buildFrame();

  return {
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
    update: (deltaSeconds, elapsedSeconds) => {
      assertActive();
      assertNonNegativeFiniteNumber(
        "survival deltaSeconds",
        deltaSeconds
      );
      assertNonNegativeFiniteNumber(
        "survival elapsedSeconds",
        elapsedSeconds
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
      targetNavigationAreaFrame = targetNavigationAreaTracker.update(
        humanTargets
      );

      let executionShotEvents:
        | readonly V2ExecutionShotEvent[] = Object.freeze([]);
      if (phase === "playing") {
        alertCoordinator.update(deltaSeconds);
        if (performanceWorkloadScenario) {
          refreshPerformanceCombatAlert(deltaSeconds);
        }
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection("alarm") ?? 0;
        alarmFrame = alarmSystem.update({
          deltaSeconds,
          humans: humanTargets
        });
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
        alarmTriggerCount += alarmFrame.events.length;
        npcSystem.setExternalThreats(previousBitThreats);
        updatePlayerBlockedNpcIds();
        performanceSectionStartedAt =
          performanceDiagnostics?.beginSection("npc") ?? 0;
        npcSystem.update(
          deltaSeconds,
          getPlayerTarget(),
          alarmFrame.events
        );
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
          "npc.pursuit.area",
          npcFrameView.areaPursuitCount
        );
        performanceDiagnostics?.count(
          "npc.pursuit.detail",
          npcFrameView.detailPursuitCount
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
        performanceDiagnostics?.finishSection(
          "bit",
          performanceSectionStartedAt
        );
        if (performanceDiagnostics) {
          const bitDiagnostics =
            bitSystem.getFrameView().diagnostics;
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
        }
        previousBitThreats = buildBitThreats();

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
              bitSystem.getFrameView().actorSpheres.length
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
              bitSystem.getFrameView().actorSpheres.length
          });
        } else {
          allDeadSeconds = 0;
          const candidate = executionSystem.advanceCandidate(
            deltaSeconds,
            {
              survivors,
              blocks: buildExecutionBlocks(),
              bitShooterCount:
                bitSystem.getFrameView().actorSpheres.length
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

        if (phase === "playing") {
          alertCoordinator.publish([
            ...npcSystem.drainAlertRequests(),
            ...bitSystem.takeAlertRequests()
          ]);
          performanceSectionStartedAt =
            performanceDiagnostics?.beginSection("beam") ?? 0;
          const npcBeamRequests =
            npcSystem.drainBeamRequests();
          const bitBeamRequests =
            bitSystem.getFrameView().beamRequests;
          performanceDiagnostics?.count(
            "beam.spawned",
            npcBeamRequests.length + bitBeamRequests.length
          );
          const npcBeamSpawns: V2NpcBeamSpawn[] = [];
          for (const request of npcBeamRequests) {
            npcBeamSpawns.push(
              Object.freeze({
                sourceId: request.sourceId,
                beamId: beamSystem.spawn(request)
              })
            );
          }
          npcSystem.notifyBeamsSpawned(
            Object.freeze(npcBeamSpawns)
          );
          for (const request of bitBeamRequests) {
            beamSystem.spawn(request);
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
          "npc.pursuit.area",
          npcFrameView.areaPursuitCount
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
          beamSystem.spawn(request);
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
          beamSystem.spawn(request);
        }
        for (const event of pendingPlayerGunFireEvents) {
          beamSystem.spawn(event.beamRequest);
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
      hitEffectSystem.update(
        deltaSeconds,
        humanTargets,
        getFrameOrbVisibilityPredicate()
      );
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
    canPlayerMove: () => {
      assertActive();
      return canPlayerMove();
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
      return npcSystem.requestCommand(
        npcId,
        kind,
        createNpcCommandQuery()
      );
    },
    cancelNpcFollow: (npcId) => {
      assertActive();
      if (!allNpcIdSet.has(npcId)) {
        throw new Error(`未登録のV2 NPC IDです: ${npcId}`);
      }
      if (phase !== "playing") {
        return false;
      }
      return npcSystem.cancelFollow(npcId);
    },
    getHumanTargets: () => {
      assertActive();
      return rebuildHumanTargets();
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
      npcSystem.clearCommands();
      beamSystem.clear();
      hitEffectSystem.clear();
      prepareExecutionTargetStates(candidate);
      const replayFrame = executionSystem.replay();
      prepareExecutionParticipantStates(
        candidate,
        replayFrame
      );
      applyExecutionPlacements(replayFrame);
      phase = "execution";
      pendingPlayerBeamRequests = [];
      pendingPlayerGunFireEvents = [];
      rebuildHumanTargets();
      frame = buildFrame();
    },
    dispose: () => {
      assertActive();
      npcSystem.clearCommands();
      hitEffectSystem.dispose();
      beamSystem.dispose();
      executionSystem.reset();
      alarmSystem.dispose();
      bitSystem.dispose();
      npcSystem.dispose();
      targetNavigationAreaTracker.dispose();
      alertCoordinator.clear();
      humanTargets = Object.freeze([]);
      pendingPlayerBeamRequests = [];
      pendingPlayerGunFireEvents = [];
      disposed = true;
    }
  };
};
