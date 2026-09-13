import { Vector3 } from "@babylonjs/core";

import type { StageLocationAssetRegistry } from "../world/stageLocationAssets";
import type { V2CharacterState } from "./combatTypes";
import {
  resolveV2BroadcastCommands,
  type V2BroadcastCommand,
  type V2MissionNpcPort,
  type V2MissionNpcSnapshot,
  type V2SchoolInstruction
} from "./missionRuntime";

const GYM_LOCATION_ID = "gym";
const BROADCAST_ROOM_LOCATION_ID = "f02-broadcast";

export type V2BroadcastRuntimeOptions = Readonly<{
  locations: StageLocationAssetRegistry;
  random: () => number;
  completedBrainwashedState:
    | "brainwash-complete-gun"
    | "brainwash-complete-no-gun";
  npcPort: V2MissionNpcPort;
}>;

export type V2BroadcastUpdate = Readonly<{
  playerState: V2CharacterState;
  playerFootPosition: Vector3;
  npcs: readonly V2MissionNpcSnapshot[];
}>;

export interface V2BroadcastRuntime {
  execute(command: V2BroadcastCommand, update: V2BroadcastUpdate): void;
  getAssemblyVenueId(): "assembly-courtyard" | "assembly-gym";
  dispose(): void;
}

const isMovementCapableState = (state: V2CharacterState): boolean =>
  state === "normal" ||
  state === "evade" ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun";

const isCompletedBrainwashState = (state: V2CharacterState): boolean =>
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun" ||
  state === "brainwash-complete-haigure";

export const createV2BroadcastRuntime = ({
  locations,
  random,
  completedBrainwashedState,
  npcPort
}: V2BroadcastRuntimeOptions): V2BroadcastRuntime => {
  const gym = locations.getMissionLocationById(GYM_LOCATION_ID);
  const broadcastRoom = locations.getMissionLocationById(
    BROADCAST_ROOM_LOCATION_ID
  );
  if (gym === null || broadcastRoom === null) {
    throw new Error("校内放送Runtimeに必要なMission Locationがありません。");
  }
  let sequence = 0;
  let lastSchoolInstruction: V2SchoolInstruction = "courtyard";
  let disposed = false;
  const nextRandom = (): number => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error(`校内放送乱数は0以上1未満が必要です: ${value}`);
    }
    return value;
  };
  const assertActive = (): void => {
    if (disposed) {
      throw new Error("校内放送Runtimeは破棄済みです。");
    }
  };
  const cancelCurrentBroadcastAssignments = (
    npcs: readonly V2MissionNpcSnapshot[]
  ): void => {
    for (const npc of npcs) {
      if (npc.locationMission?.source === "broadcast") {
        npcPort.cancelLocationMission(npc.id, npc.locationMission.missionId);
      }
    }
  };
  const assign = (
    npc: V2MissionNpcSnapshot,
    location: NonNullable<typeof gym>
  ): void => {
    sequence += 1;
    npcPort.assignLocationMission(
      npc.id,
      Object.freeze({
        missionId: `broadcast_${sequence}`,
        source: "broadcast",
        locationId: location.id,
        destination: Object.freeze({
          position: location.navigationLocation.position.clone(),
          polygonRef: location.navigationLocation.polygonRef
        })
      })
    );
  };
  return Object.freeze({
    execute: (
      command: V2BroadcastCommand,
      update: V2BroadcastUpdate
    ) => {
      assertActive();
      const allowed = resolveV2BroadcastCommands(update.playerState);
      if (command !== allowed.primary && command !== allowed.secondary) {
        throw new Error(
          `現在のPlayer状態では校内放送を実行できません: ${update.playerState}/${command}`
        );
      }
      cancelCurrentBroadcastAssignments(update.npcs);
      if (command === "gather-gym") {
        lastSchoolInstruction = "gym";
        for (const npc of [...update.npcs].sort((left, right) =>
          left.id.localeCompare(right.id)
        )) {
          if (isMovementCapableState(npc.state) && nextRandom() < 0.5) {
            assign(npc, gym);
          }
        }
      } else if (command === "flee") {
        lastSchoolInstruction = "courtyard";
        const targets = update.npcs
          .filter(
            (npc) =>
              isMovementCapableState(npc.state) &&
              isCompletedBrainwashState(npc.state)
          )
          .map((npc) =>
            Object.freeze({
              npc,
              distanceSquared: Vector3.DistanceSquared(
                npc.footPosition,
                update.playerFootPosition
              )
            })
          )
          .sort(
            (left, right) =>
              left.distanceSquared - right.distanceSquared ||
              left.npc.id.localeCompare(right.npc.id)
          )
          .slice(0, 5);
        for (const target of targets) {
          assign(target.npc, broadcastRoom);
        }
      } else {
        lastSchoolInstruction = "courtyard";
        npcPort.setCompletedBrainwashedNpcsState(completedBrainwashedState);
      }
    },
    getAssemblyVenueId: () => {
      assertActive();
      return lastSchoolInstruction === "gym"
        ? "assembly-gym"
        : "assembly-courtyard";
    },
    dispose: () => {
      assertActive();
      disposed = true;
    }
  });
};
