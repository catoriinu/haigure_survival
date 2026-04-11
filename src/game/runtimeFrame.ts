import { Vector3 } from "@babylonjs/core";
import {
  isAliveState,
  type CharacterState,
  type Npc,
  type TargetInfo
} from "./types";
import {
  isAssemblyPhase,
  usesPlayerEyeHeight,
  type GamePhase
} from "./phases";

type SyncNpcTargetBufferArgs = {
  buffer: TargetInfo[];
  playerPosition: Vector3;
  playerState: CharacterState;
  playerHitById: string | null;
  npcs: Npc[];
};

type SyncNpcTargetBufferStatesArgs = {
  buffer: TargetInfo[];
  playerState: CharacterState;
  playerHitById: string | null;
  npcs: Npc[];
};

type RuntimeFramePhaseCallbacks = {
  onPlaying: () => void;
  onRoulette: () => void;
  onNonPlaying: () => void;
  onExecution: () => void;
  onAssembly: () => void;
  onAssemblyFree: () => void;
  onUsesPlayerEyeHeight: () => void;
};

export const syncNpcTargetBuffer = ({
  buffer,
  playerPosition,
  playerState,
  playerHitById,
  npcs
}: SyncNpcTargetBufferArgs) => {
  const requiredLength = npcs.length + 1;
  if (buffer.length < requiredLength) {
    for (let index = buffer.length; index < requiredLength; index += 1) {
      buffer.push({
        id: index === 0 ? "player" : `npc_${index - 1}`,
        position:
          index === 0 ? playerPosition : npcs[index - 1]!.sprite.position,
        alive: false,
        state: "normal",
        hitById: null
      });
    }
  }
  buffer.length = requiredLength;
  buffer[0]!.position = playerPosition;
  buffer[0]!.alive = isAliveState(playerState);
  buffer[0]!.state = playerState;
  buffer[0]!.hitById = playerHitById;
  for (let index = 0; index < npcs.length; index += 1) {
    const target = buffer[index + 1]!;
    const npc = npcs[index]!;
    target.id = `npc_${index}`;
    target.position = npc.sprite.position;
    target.alive = isAliveState(npc.state);
    target.state = npc.state;
    target.hitById = npc.hitById;
  }
  return buffer;
};

export const syncNpcTargetBufferStates = ({
  buffer,
  playerState,
  playerHitById,
  npcs
}: SyncNpcTargetBufferStatesArgs) => {
  buffer[0]!.alive = isAliveState(playerState);
  buffer[0]!.state = playerState;
  buffer[0]!.hitById = playerHitById;
  for (let index = 0; index < npcs.length; index += 1) {
    const target = buffer[index + 1]!;
    const npc = npcs[index]!;
    target.alive = isAliveState(npc.state);
    target.state = npc.state;
    target.hitById = npc.hitById;
  }
};

export const ensureVectorListBufferSize = (
  buffer: Vector3[][],
  count: number
) => {
  while (buffer.length < count) {
    buffer.push([]);
  }
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index]!.length = 0;
  }
  buffer.length = count;
  return buffer;
};

export const buildGridCellKey = (
  columnCount: number,
  row: number,
  col: number
) => row * columnCount + col;

export const runRuntimeFramePhases = (
  gamePhase: GamePhase,
  callbacks: RuntimeFramePhaseCallbacks
) => {
  if (gamePhase === "playing") {
    callbacks.onPlaying();
  }
  if (gamePhase === "roulette") {
    callbacks.onRoulette();
  }
  if (gamePhase !== "playing") {
    callbacks.onNonPlaying();
  }
  if (gamePhase === "execution") {
    callbacks.onExecution();
  }
  if (isAssemblyPhase(gamePhase)) {
    callbacks.onAssembly();
  }
  if (gamePhase === "assemblyFree") {
    callbacks.onAssemblyFree();
  }
  if (usesPlayerEyeHeight(gamePhase)) {
    callbacks.onUsesPlayerEyeHeight();
  }
};
