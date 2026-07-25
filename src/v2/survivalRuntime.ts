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

const NPC_COUNT = 99;
const INITIAL_BRAINWASHED_NPC_COUNT = 66;
const BIT_COUNT = 99;
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
  let blockerImpactCount = 0;
  let actorImpactCount = 0;

  const assertActive = () => {
    if (disposed) {
      throw new Error("V2SurvivalRuntimeは破棄済みです。");
    }
  };

  const buildBeamActors = (
    playerTarget: V2HumanTargetSnapshot,
    npcActors: readonly V2ActorSphere[],
    bitActors: readonly V2ActorSphere[]
  ) =>
    Object.freeze([
      createPlayerActorSphere(playerTarget),
      ...npcActors,
      ...bitActors
    ]);

  return {
    update: (deltaSeconds, elapsedSeconds) => {
      assertActive();
      assertNonNegativeFiniteNumber("survival deltaSeconds", deltaSeconds);
      assertNonNegativeFiniteNumber("survival elapsedSeconds", elapsedSeconds);

      const activeAlerts = alertCoordinator.getActiveAlerts();
      const playerTarget = createPlayerTarget(player);

      npcSystem.applyAlerts(activeAlerts);
      npcSystem.update(deltaSeconds, playerTarget);
      const npcTargets = npcSystem.getTargetSnapshots();
      const humanTargets = Object.freeze([
        playerTarget,
        ...npcTargets
      ]);
      bitSystem.update({
        deltaSeconds,
        elapsedSeconds,
        targets: humanTargets,
        externalAlerts: activeAlerts
      });

      alertCoordinator.update(deltaSeconds);
      alertCoordinator.publish([
        ...npcSystem.drainAlertRequests(),
        ...bitSystem.takeAlertRequests()
      ]);
      for (const request of bitSystem.getBeamRequests()) {
        beamSystem.spawn(request);
      }

      const npcActors = npcSystem.getActorSpheres();
      const bitActors = bitSystem.getActorSpheres();
      beamActors = buildBeamActors(playerTarget, npcActors, bitActors);
      const beamEvents = beamSystem.update(deltaSeconds);
      for (const event of beamEvents.impacts) {
        if (event.hit.kind === "blocker") {
          blockerImpactCount += 1;
        } else {
          actorImpactCount += 1;
        }
      }
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
      const currentAlerts = alertCoordinator.getActiveAlerts();
      frame = Object.freeze({
        npcCount: npcActors.length,
        bitCount: bitActors.length,
        activeBeamCount: beamSystem.activeCount,
        activeAlertCount: currentAlerts.length,
        visualTargetCount,
        alertTargetCount,
        blockerImpactCount,
        actorImpactCount
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
