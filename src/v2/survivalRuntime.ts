import { Color3, type Scene } from "@babylonjs/core";

import { PLAYER_SPRITE_WIDTH } from "../game/characterSprites";
import type { StageSpatialContext } from "../world/stageSpatialContext";
import {
  createV2AlertCoordinator,
  type V2AlertCoordinator
} from "./alertCoordinator";
import {
  createV2BeamSystem,
  type V2BeamSystem
} from "./beamCollision";
import {
  createV2BitSystem,
  type V2BitSystem
} from "./bitSystem";
import type {
  V2ActorSphere,
  V2HumanTargetSnapshot
} from "./combatTypes";
import {
  createV2NpcSystem,
  type V2NpcSystem
} from "./npcSystem";
import type { V2PlayerController } from "./playerController";

const NPC_COUNT = 10;
const INITIAL_BRAINWASHED_NPC_COUNT = 2;
const BIT_COUNT = 6;
const ALERT_DURATION_SECONDS = 15;

export type V2SurvivalFrame = Readonly<{
  npcCount: number;
  bitCount: number;
  activeBeamCount: number;
  activeAlertCount: number;
  visualTargetCount: number;
  alertTargetCount: number;
  blockerImpactCount: number;
  actorImpactCount: number;
}>;

export interface V2SurvivalRuntime {
  update(deltaSeconds: number, elapsedSeconds: number): V2SurvivalFrame;
  getFrame(): V2SurvivalFrame;
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

const createPlayerTarget = (
  player: V2PlayerController
): V2HumanTargetSnapshot =>
  Object.freeze({
    id: "player",
    kind: "player" as const,
    footPosition: player.getFootPosition(),
    aimPosition: player.getEyePosition(),
    collisionRadius: PLAYER_SPRITE_WIDTH * 0.5,
    alive: true,
    brainwashed: false
  });

const createPlayerActorSphere = (
  target: V2HumanTargetSnapshot
): V2ActorSphere =>
  Object.freeze({
    id: target.id,
    kind: "player" as const,
    center: target.aimPosition.clone(),
    radius: target.collisionRadius
  });

export const createV2SurvivalRuntime = ({
  scene,
  stage,
  player,
  random
}: V2SurvivalRuntimeOptions): V2SurvivalRuntime => {
  if (typeof random !== "function") {
    throw new Error("V2SurvivalRuntimeのrandomには関数が必要です。");
  }

  let beamActors: readonly V2ActorSphere[] = Object.freeze([]);

  const initializeSystems = () => {
    let ownedNpcSystem: V2NpcSystem | null = null;
    let ownedBitSystem: V2BitSystem | null = null;
    let ownedAlertCoordinator: V2AlertCoordinator | null = null;
    let ownedBeamSystem: V2BeamSystem | null = null;

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
        minimumFlightHeight: 0.25,
        maximumFlightHeight: 0.45,
        random
      });
      ownedAlertCoordinator = createV2AlertCoordinator({
        alertDuration: ALERT_DURATION_SECONDS
      });
      ownedBeamSystem = createV2BeamSystem({
        scene,
        stage,
        getActorSpheres: () => beamActors,
        visual: {
          diameter: 0.025,
          color: new Color3(1, 0.16, 0.72),
          alpha: 0.95
        }
      });
      const initialFrame: V2SurvivalFrame = Object.freeze({
        npcCount: NPC_COUNT,
        bitCount: ownedBitSystem.getActorSpheres().length,
        activeBeamCount: 0,
        activeAlertCount: 0,
        visualTargetCount: 0,
        alertTargetCount: 0,
        blockerImpactCount: 0,
        actorImpactCount: 0
      });
      return {
        npcSystem: ownedNpcSystem,
        bitSystem: ownedBitSystem,
        alertCoordinator: ownedAlertCoordinator,
        beamSystem: ownedBeamSystem,
        initialFrame
      };
    } catch (error) {
      ownedBeamSystem?.dispose();
      ownedAlertCoordinator?.clear();
      ownedBitSystem?.dispose();
      ownedNpcSystem?.dispose();
      beamActors = Object.freeze([]);
      throw error;
    }
  };

  const {
    npcSystem,
    bitSystem,
    alertCoordinator,
    beamSystem,
    initialFrame
  } = initializeSystems();

  let disposed = false;
  let frame = initialFrame;

  const assertActive = () => {
    if (disposed) {
      throw new Error("V2SurvivalRuntimeは破棄済みです。");
    }
  };

  const buildBeamActors = (playerTarget: V2HumanTargetSnapshot) =>
    Object.freeze([
      createPlayerActorSphere(playerTarget),
      ...npcSystem.getActorSpheres(),
      ...bitSystem.getActorSpheres()
    ]);

  return {
    update: (deltaSeconds, elapsedSeconds) => {
      assertActive();
      assertNonNegativeFiniteNumber("survival deltaSeconds", deltaSeconds);
      assertNonNegativeFiniteNumber("survival elapsedSeconds", elapsedSeconds);

      alertCoordinator.update(deltaSeconds);
      const activeAlerts = alertCoordinator.getActiveAlerts();
      const playerTarget = createPlayerTarget(player);

      npcSystem.applyAlerts(activeAlerts);
      npcSystem.update(deltaSeconds, playerTarget);
      const humanTargets = Object.freeze([
        playerTarget,
        ...npcSystem.getTargetSnapshots()
      ]);
      bitSystem.update({
        deltaSeconds,
        elapsedSeconds,
        targets: humanTargets,
        externalAlerts: activeAlerts
      });

      alertCoordinator.publish([
        ...npcSystem.drainAlertRequests(),
        ...bitSystem.takeAlertRequests()
      ]);
      for (const request of bitSystem.getBeamRequests()) {
        beamSystem.spawn(request);
      }

      beamActors = buildBeamActors(playerTarget);
      const beamEvents = beamSystem.update(deltaSeconds);
      const npcTracking = npcSystem.getTrackingSnapshots();
      const bitTracking = bitSystem.getTargetStates();
      const allTracking = [...npcTracking, ...bitTracking];
      frame = Object.freeze({
        npcCount: npcSystem.getActorSpheres().length,
        bitCount: bitSystem.getActorSpheres().length,
        activeBeamCount: beamSystem.activeCount,
        activeAlertCount: alertCoordinator.getActiveAlerts().length,
        visualTargetCount: allTracking.filter(
          (tracking) => tracking.provenance === "visual"
        ).length,
        alertTargetCount: allTracking.filter(
          (tracking) => tracking.provenance === "alert"
        ).length,
        blockerImpactCount: beamEvents.impacts.filter(
          (event) => event.hit.kind === "blocker"
        ).length,
        actorImpactCount: beamEvents.impacts.filter(
          (event) => event.hit.kind === "actor"
        ).length
      });
      return frame;
    },
    getFrame: () => {
      assertActive();
      return frame;
    },
    dispose: () => {
      assertActive();
      beamSystem.dispose();
      bitSystem.dispose();
      npcSystem.dispose();
      alertCoordinator.clear();
      beamActors = Object.freeze([]);
      disposed = true;
    }
  };
};
