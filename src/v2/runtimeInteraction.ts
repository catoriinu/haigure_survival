import { Vector3, type Camera } from "@babylonjs/core";

import type {
  StageDoorInteractionCandidate,
  StageDoorRuntime
} from "../world/stageDoorRuntime";
import type { StageBroadcastConsole } from "../world/stageLocationAssets";
import type { StageSpatialContext } from "../world/stageSpatialContext";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../world/worldUnits";
import type { V2PlayerCompletionState } from "./combatTypes";
import {
  resolveV2BroadcastCommands,
  type V2BroadcastCommand
} from "./missionRuntime";
import type {
  V2NpcCommandCandidate,
  V2NpcCommandMode
} from "./npcSystem";
import type { V2PlayerAction } from "./playerInput";
import type { V2SurvivalFrame, V2SurvivalRuntime } from "./survivalRuntime";

export const V2_NORMAL_HORIZONTAL_SPEED_SCALE = 1 as const;
export const V2_WATER_HORIZONTAL_SPEED_SCALE = 0.5 as const;
export const V2_BROADCAST_INTERACTION_DISTANCE =
  3 * BLENDER_METERS_TO_WORLD_UNITS;

export const resolveV2HorizontalSpeedScale = (
  inWater: boolean
):
  | typeof V2_NORMAL_HORIZONTAL_SPEED_SCALE
  | typeof V2_WATER_HORIZONTAL_SPEED_SCALE =>
  inWater
    ? V2_WATER_HORIZONTAL_SPEED_SCALE
    : V2_NORMAL_HORIZONTAL_SPEED_SCALE;

export type V2RuntimeInteractionFrame = Pick<
  V2SurvivalFrame,
  "phase" | "playerCompletionUnlocked"
>;

export type V2RuntimeInteractionSurvivalPort = Pick<
  V2SurvivalRuntime,
  "requestBroadcast" | "requestNpcCommand" | "selectPlayerCompletion"
>;

export type V2BroadcastInteractionOption = Readonly<{
  command: V2BroadcastCommand;
  label: string;
}>;

export type V2BroadcastInteractionCandidate = Readonly<{
  consoleId: string;
  aimPosition: Vector3;
  primary: V2BroadcastInteractionOption;
  secondary: V2BroadcastInteractionOption | null;
}>;

export type V2BroadcastInteractionQuery = Readonly<{
  phase: V2SurvivalFrame["phase"];
  playerState: V2SurvivalFrame["playerState"];
  playerFootPosition: Vector3;
  camera: Camera;
  broadcastConsole: StageBroadcastConsole;
  queries: StageSpatialContext["queries"];
}>;

export const resolveV2BroadcastInteractionCandidate = ({
  phase,
  playerState,
  playerFootPosition,
  camera,
  broadcastConsole,
  queries
}: V2BroadcastInteractionQuery): V2BroadcastInteractionCandidate | null => {
  if (
    phase !== "playing" ||
    Vector3.Distance(
      playerFootPosition,
      broadcastConsole.markerNode.getAbsolutePosition()
    ) > V2_BROADCAST_INTERACTION_DISTANCE
  ) {
    return null;
  }
  const intersection = camera
    .getForwardRay()
    .intersectsMesh(broadcastConsole.targetMesh, false);
  if (!intersection.hit || intersection.pickedPoint === null) {
    return null;
  }
  const aimPosition = intersection.pickedPoint;
  if (
    queries.castSightSegment(
      camera.globalPosition,
      aimPosition
    ) !== null
  ) {
    return null;
  }
  const commands = resolveV2BroadcastCommands(playerState);
  return Object.freeze({
    consoleId: broadcastConsole.id,
    aimPosition: aimPosition.clone(),
    primary: Object.freeze({
      command: commands.primary,
      label: "体育館に集まって"
    }),
    secondary:
      commands.secondary === null
        ? null
        : Object.freeze({
            command: commands.secondary,
            label:
              commands.secondary === "flee"
                ? "みんな逃げて"
                : "みんなハイグレ人間になろう"
          })
  });
};

export type V2RuntimeInteractionDoorPort = Pick<
  StageDoorRuntime,
  "requestDoorToggle"
>;

export type V2RuntimeInteractionDispatch = Readonly<{
  actions: readonly V2PlayerAction[];
  frame: V2RuntimeInteractionFrame;
  broadcastCandidate: V2BroadcastInteractionCandidate | null;
  npcCandidates: readonly V2NpcCommandCandidate[];
  doorCandidates: readonly StageDoorInteractionCandidate[];
  survival: V2RuntimeInteractionSurvivalPort;
  doors: V2RuntimeInteractionDoorPort;
}>;

export type V2RuntimeInteractionFeedback =
  | Readonly<{
      kind: "npc-command-changed";
      npcId: string;
      commandMode: V2NpcCommandMode;
    }>
  | Readonly<{
      kind: "door-toggle-started";
      doorId: string;
      state: "opening" | "closing";
    }>
  | Readonly<{
      kind: "broadcast-command-started";
      consoleId: string;
      command: V2BroadcastCommand;
      option: "primary" | "secondary";
    }>;

const PLAYER_COMPLETION_BY_ACTION = Object.freeze({
  "select-gun": "brainwash-complete-gun",
  "select-no-gun": "brainwash-complete-no-gun",
  "select-haigure": "brainwash-complete-haigure"
} satisfies Readonly<
  Record<
    Extract<V2PlayerAction, `select-${string}`>,
    V2PlayerCompletionState
  >
>);

export const dispatchV2RuntimeInteractions = ({
  actions,
  frame,
  broadcastCandidate,
  npcCandidates,
  doorCandidates,
  survival,
  doors
}: V2RuntimeInteractionDispatch): readonly V2RuntimeInteractionFeedback[] => {
  const npcCandidate = npcCandidates[0];
  const doorCandidate = doorCandidates[0];
  const feedback: V2RuntimeInteractionFeedback[] = [];
  let effectiveNpcCommandMode = npcCandidate?.commandMode ?? null;
  let doorToggleStarted = false;

  for (const action of actions) {
    if (
      action === "release-assembly-control" ||
      action === "retry" ||
      action === "advance-end-flow"
    ) {
      continue;
    }
    if (action === "interaction-primary") {
      if (broadcastCandidate) {
        if (survival.requestBroadcast(broadcastCandidate.primary.command)) {
          feedback.push(
            Object.freeze({
              kind: "broadcast-command-started",
              consoleId: broadcastCandidate.consoleId,
              command: broadcastCandidate.primary.command,
              option: "primary"
            })
          );
        }
        continue;
      }
      if (
        npcCandidate &&
        effectiveNpcCommandMode !== "follow" &&
        survival.requestNpcCommand(npcCandidate.npcId, "follow")
      ) {
        effectiveNpcCommandMode = "follow";
        feedback.push(
          Object.freeze({
            kind: "npc-command-changed",
            npcId: npcCandidate.npcId,
            commandMode: "follow"
          })
        );
      }
      continue;
    }
    if (action === "interaction-secondary") {
      if (broadcastCandidate) {
        if (broadcastCandidate.secondary) {
          if (survival.requestBroadcast(broadcastCandidate.secondary.command)) {
            feedback.push(
              Object.freeze({
                kind: "broadcast-command-started",
                consoleId: broadcastCandidate.consoleId,
                command: broadcastCandidate.secondary.command,
                option: "secondary"
              })
            );
          }
        }
        continue;
      }
      if (
        npcCandidate &&
        effectiveNpcCommandMode !== "leave" &&
        survival.requestNpcCommand(npcCandidate.npcId, "leave")
      ) {
        effectiveNpcCommandMode = "leave";
        feedback.push(
          Object.freeze({
            kind: "npc-command-changed",
            npcId: npcCandidate.npcId,
            commandMode: "leave"
          })
        );
      }
      continue;
    }
    if (action === "door-toggle") {
      if (doorCandidate && !doorToggleStarted) {
        const result = doors.requestDoorToggle(
          doorCandidate.door.id
        );
        if (result.status === "started") {
          doorToggleStarted = true;
          feedback.push(
            Object.freeze({
              kind: "door-toggle-started",
              doorId: doorCandidate.door.id,
              state: result.state
            })
          );
        }
      }
      continue;
    }
    if (
      (action === "select-gun" ||
        action === "select-no-gun" ||
        action === "select-haigure") &&
      frame.phase === "playing" &&
      frame.playerCompletionUnlocked
    ) {
      survival.selectPlayerCompletion(
        PLAYER_COMPLETION_BY_ACTION[action]
      );
    }
  }
  return Object.freeze(feedback);
};
