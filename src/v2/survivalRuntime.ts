import { Color3, Vector3, type Scene } from "@babylonjs/core";

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
  type V2BeamFrameEvents,
  type V2BeamSystem
} from "./beamCollision";
import {
  createV2BitSystem,
  type V2BitSystem
} from "./bitSystem";
import {
  type V2BeamRequest,
  type V2CharacterState,
  type V2HumanTargetSnapshot,
  type V2PlayerCompletionState
} from "./combatTypes";
import {
  createV2NpcSystem,
  type V2NpcExternalThreat,
  type V2NpcSystem
} from "./npcSystem";
import {
  V2_PLAYER_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS,
  V2_PLAYER_GUN_BEAM_ORIGIN_OFFSET,
  V2_PLAYER_GUN_BEAM_SPEED,
  createV2PlayerCombatSystem,
  type V2PlayerCombatSystem
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
  cloneV2AlarmFrame,
  createV2ExecutionBitPositions,
  selectV2ExecutionAudienceIds,
  selectV2PlayerBlockedNpcIds
} from "./survivalRules";

const NPC_COUNT = 99;
const INITIAL_BRAINWASHED_NPC_COUNT = 66;
const BIT_COUNT = 99;
const ALERT_DURATION_SECONDS = 15;
const ALL_DEAD_ASSEMBLY_DELAY_SECONDS = 3;
const PLAYER_ID = "player";
const EMPTY_ALARM_FRAME: V2AlarmFrame = Object.freeze({
  events: Object.freeze([]),
  activeCandidateIds: Object.freeze([]),
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
  playerCanMove: boolean;
  npcCount: number;
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
  blockerImpactCount: number;
  actorImpactCount: number;
}>;

export interface V2SurvivalRuntime {
  update(deltaSeconds: number, elapsedSeconds: number): V2SurvivalFrame;
  getFrame(): V2SurvivalFrame;
  canPlayerMove(): boolean;
  selectPlayerCompletion(state: V2PlayerCompletionState): void;
  requestPlayerGunFire(direction: Vector3): boolean;
  replayExecution(): void;
  dispose(): void;
}

export type V2SurvivalRuntimeOptions = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  player: V2PlayerController;
  random: () => number;
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
  random
}: V2SurvivalRuntimeOptions): V2SurvivalRuntime => {
  if (typeof random !== "function") {
    throw new Error("V2SurvivalRuntimeのrandomには関数が必要です。");
  }

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
  let humanTargets: readonly V2HumanTargetSnapshot[] =
    Object.freeze([]);

  try {
    ownedNpcSystem = createV2NpcSystem({
      scene,
      stage,
      npcCount: NPC_COUNT,
      initialBrainwashedNpcCount: INITIAL_BRAINWASHED_NPC_COUNT,
      random
    });
    ownedBitSystem = createV2BitSystem(scene, stage, {
      initialBitCount: BIT_COUNT,
      minimumSpawnDistance: 0.2,
      spawnMaxAttempts: 512,
      spawnProjectionMaxDistance: 0.75,
      combatEnabled: true,
      random
    });
    ownedAlertCoordinator = createV2AlertCoordinator({
      alertDuration: ALERT_DURATION_SECONDS
    });
    ownedAlarmSystem = createV2AlarmSystem({
      candidateProvider:
        createV2NavigationAlarmCandidateProvider(stage),
      random
    });
    ownedExecutionSystem =
      createV2PublicExecutionSystem(random);
    humanTargets = Object.freeze([
      playerCombat.createTargetSnapshot(
        player.getFootPosition(),
        player.getEyePosition()
      ),
      ...ownedNpcSystem.getTargetSnapshots()
    ]);
    ownedBeamSystem = createV2BeamSystem({
      scene,
      stage,
      getHumanTargets: () => humanTargets,
      visual: {
        diameter: 0.025,
        color: new Color3(1, 0.16, 0.72),
        alpha: 0.95
      }
    });
  } catch (error) {
    ownedBeamSystem?.dispose();
    ownedExecutionSystem?.reset();
    ownedAlarmSystem?.dispose();
    ownedAlertCoordinator?.clear();
    ownedBitSystem?.dispose();
    ownedNpcSystem?.dispose();
    throw error;
  }

  const npcSystem = ownedNpcSystem;
  const bitSystem = ownedBitSystem;
  const alertCoordinator = ownedAlertCoordinator;
  const alarmSystem = ownedAlarmSystem;
  const executionSystem = ownedExecutionSystem;
  const beamSystem = ownedBeamSystem;
  const allNpcIds = Object.freeze(
    npcSystem.getTargetSnapshots().map((target) => target.id)
  );

  let disposed = false;
  let phase: V2SurvivalPhase = "playing";
  let allDeadSeconds = 0;
  let blockerImpactCount = 0;
  let actorImpactCount = 0;
  let alarmTriggerCount = 0;
  let pendingPlayerBeamRequests: V2BeamRequest[] = [];
  let playerBlockedNpcIds: readonly string[] = Object.freeze([]);
  let previousBitThreats: readonly V2NpcExternalThreat[] =
    Object.freeze([]);
  let alarmFrame: V2AlarmFrame = alarmSystem.getFrame();

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
      ...npcSystem.getTargetSnapshots()
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

  const canPlayerMove = () => {
    return canV2SurvivalPlayerMove({
      phase,
      playerState: playerCombat.getStateSnapshot().state,
      playerCaptured: npcSystem
        .getCaptureSnapshots()
        .some((capture) => capture.targetId === PLAYER_ID),
      executionPlayerRole:
        executionSystem.getFrame().candidate?.playerRole ?? null
    });
  };

  const clearCombatForPhaseTransition = () => {
    npcSystem.setAiSuspended(true);
    npcSystem.setExternalThreats(Object.freeze([]));
    npcSystem.setPlayerBlockedTargetIds(Object.freeze([]));
    bitSystem.prepareForScriptedPhase();
    bitSystem.setAiSuspended(true);
    beamSystem.clear();
    alertCoordinator.clear();
    alarmFrame = EMPTY_ALARM_FRAME;
    pendingPlayerBeamRequests = [];
    playerBlockedNpcIds = Object.freeze([]);
    previousBitThreats = Object.freeze([]);
    npcSystem.drainBeamRequests();
    bitSystem.takeAlertRequests();
  };

  const placeHumansForAssembly = () => {
    const npcTargets = npcSystem.getTargetSnapshots();
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
    for (const target of candidate.targets) {
      if (target.kind === "player") {
        playerCombat.prepareExecutionTarget();
      } else {
        npcSystem.prepareExecutionTarget(target.id);
      }
    }
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
    for (const target of npcSystem.getTargetSnapshots()) {
      if (targetIds.has(target.id)) {
        continue;
      }
      if (shooterIds.has(target.id)) {
        npcSystem.prepareExecutionShooter(target.id);
      } else {
        npcSystem.prepareExecutionAudience(target.id);
      }
    }
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
      npcSystem.getTargetSnapshots().map((target) => {
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
        .getActorSpheres()
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
      .getActorSpheres()
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
    const impactedTargetIds = new Set<string>();
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
      const accepted =
        targetId === PLAYER_ID
          ? playerCombat.applyImpact(source)
          : npcSystem.applyBeamImpact(targetId, source);
      if (
        accepted &&
        (event.originKind === "bit-chase" ||
          event.originKind === "bit-fixed" ||
          event.originKind === "bit-random" ||
          event.originKind === "bit-carpet")
      ) {
        bitSystem.notifyBeamImpact(event.sourceId, targetId);
      }
    }
  };

  const buildBitThreats = (): readonly V2NpcExternalThreat[] => {
    const bitPositions = new Map(
      bitSystem
        .getActorSpheres()
        .map((actor) => [actor.id, actor.center] as const)
    );
    const targetIds = new Set<string>();
    const threats: V2NpcExternalThreat[] = [];
    for (const tracking of bitSystem.getTargetStates()) {
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
      targetIds.add(tracking.targetId);
      threats.push(
        Object.freeze({
          targetId: tracking.targetId,
          sourcePosition: sourcePosition.clone()
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
      npcSystem.getTargetSnapshots()
    );
    npcSystem.setPlayerBlockedTargetIds(
      playerBlockedNpcIds
    );
  };

  const buildExecutionBlocks = () => {
    const blocks: V2ExecutionBlock[] = npcSystem
      .getCaptureSnapshots()
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
        npcSystem.enterFormationState(target.id);
      }
      executionSystem.notifyTargetCompleted(target.id);
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
        .getActorSpheres()
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
    const npcTracking = npcSystem.getTrackingSnapshots();
    const bitTracking = bitSystem.getTargetStates();
    let visualTargetCount = 0;
    let alertTargetCount = 0;
    for (const tracking of [...npcTracking, ...bitTracking]) {
      if (tracking.provenance === "visual") {
        visualTargetCount += 1;
      } else if (tracking.provenance === "alert") {
        alertTargetCount += 1;
      }
    }
    const executionFrame = executionSystem.getFrame();
    return Object.freeze({
      phase,
      assemblyVenueId: assemblyVenue.id,
      playerState: playerCombat.getStateSnapshot().state,
      playerCanMove: canPlayerMove(),
      npcCount: npcSystem.getTargetSnapshots().length,
      bitCount: bitSystem.getActorSpheres().length,
      activeBeamCount: beamSystem.activeCount,
      activeAlertCount:
        alertCoordinator.getActiveAlerts().length,
      activeAlarmCount: alarmFrame.activeCandidateIds.length,
      alarmBlinkCount: alarmFrame.blinks.length,
      alarmTriggerCount,
      alarm: cloneV2AlarmFrame(alarmFrame),
      captureCount: npcSystem.getCaptureSnapshots().length,
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
      visualTargetCount,
      alertTargetCount,
      blockerImpactCount,
      actorImpactCount
    });
  };

  let frame = buildFrame();

  return {
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

      rebuildHumanTargets();
      applyBeamImpacts(beamSystem.update(deltaSeconds));
      playerCombat.update(deltaSeconds);
      rebuildHumanTargets();

      let executionShotEvents:
        | readonly V2ExecutionShotEvent[] = Object.freeze([]);
      if (phase === "playing") {
        alertCoordinator.update(deltaSeconds);
        alarmFrame = alarmSystem.update({
          deltaSeconds,
          humans: humanTargets.map((target) =>
            Object.freeze({
              id: target.id,
              footPosition: target.footPosition,
              alive: target.alive
            })
          )
        });
        alarmTriggerCount += alarmFrame.events.length;
        npcSystem.applyAlarmTargetEvents(alarmFrame.events);
        npcSystem.setExternalThreats(previousBitThreats);
        updatePlayerBlockedNpcIds();
        npcSystem.update(deltaSeconds, getPlayerTarget());
        playerCombat.setAliveBehaviorState(
          npcSystem
            .getThreatenedTargetIds()
            .includes(PLAYER_ID)
            ? "evade"
            : "normal"
        );
        rebuildHumanTargets();

        const activeAlerts =
          alertCoordinator.getActiveAlerts();
        bitSystem.update({
          deltaSeconds,
          elapsedSeconds,
          targets: humanTargets,
          externalAlerts: activeAlerts
        });
        previousBitThreats = buildBitThreats();

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
              bitSystem.getActorSpheres().length
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
              bitSystem.getActorSpheres().length
          });
        } else {
          allDeadSeconds = 0;
          const candidate = executionSystem.advanceCandidate(
            deltaSeconds,
            {
              survivors,
              blocks: buildExecutionBlocks(),
              bitShooterCount:
                bitSystem.getActorSpheres().length
            }
          );
          if (candidate) {
            enterExecution(candidate);
          }
        }

        if (phase === "playing") {
          alertCoordinator.publish([
            ...npcSystem.drainAlertRequests(),
            ...bitSystem.takeAlertRequests()
          ]);
          for (const request of npcSystem.drainBeamRequests()) {
            beamSystem.spawn(request);
          }
          for (const request of bitSystem.getBeamRequests()) {
            beamSystem.spawn(request);
          }
        }
      } else {
        npcSystem.update(deltaSeconds, getPlayerTarget());
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
          for (const target of npcSystem.getTargetSnapshots()) {
            if (
              target.brainwashed &&
              target.state !==
                "brainwash-complete-haigure-formation"
            ) {
              npcSystem.enterFormationState(target.id);
            }
          }
          rebuildHumanTargets();
        } else if (phase === "execution") {
          completeExecutionTargets();
          if (phase === "execution") {
            executionShotEvents =
              executionSystem.update(deltaSeconds);
          }
        }
        npcSystem.drainBeamRequests();
        npcSystem.drainAlertRequests();
      }

      if (phase === "execution") {
        for (const request of createExecutionBeamRequests(
          executionShotEvents
        )) {
          beamSystem.spawn(request);
        }
      }
      if (
        phase === "playing" ||
        phase === "execution"
      ) {
        for (const request of pendingPlayerBeamRequests) {
          beamSystem.spawn(request);
        }
      }
      pendingPlayerBeamRequests = [];

      frame = buildFrame();
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
    requestPlayerGunFire: (direction) => {
      assertActive();
      assertFiniteVector("プレイヤー射撃方向", direction);
      if (direction.lengthSquared() === 0) {
        throw new Error(
          "プレイヤー射撃方向をゼロベクトルにできません。"
        );
      }
      if (phase === "playing") {
        const request = playerCombat.requestGunFire(
          player.getEyePosition(),
          direction
        );
        if (!request) {
          return false;
        }
        pendingPlayerBeamRequests.push(request);
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
      beamSystem.clear();
      prepareExecutionTargetStates(candidate);
      const replayFrame = executionSystem.replay();
      prepareExecutionParticipantStates(
        candidate,
        replayFrame
      );
      applyExecutionPlacements(replayFrame);
      phase = "execution";
      pendingPlayerBeamRequests = [];
      rebuildHumanTargets();
      frame = buildFrame();
    },
    dispose: () => {
      assertActive();
      beamSystem.dispose();
      executionSystem.reset();
      alarmSystem.dispose();
      bitSystem.dispose();
      npcSystem.dispose();
      alertCoordinator.clear();
      humanTargets = Object.freeze([]);
      pendingPlayerBeamRequests = [];
      disposed = true;
    }
  };
};
