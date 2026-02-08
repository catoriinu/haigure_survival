import { Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { StageBounds, Beam, Npc } from "../entities";
import { type GamePhase } from "../flow";
import { pickWeightedUnique } from "../random/weighted";
import { GridLayout } from "../../world/grid";
import { buildTrapCandidates } from "./candidates";
import {
  createTrapTelegraphMaterial,
  createTrapTelegraphMesh,
  disposeTrapTelegraphMeshes,
  setTrapTelegraphVisible
} from "./telegraph";
import { TrapCandidate, TrapPhase } from "./types";

const trapWarningDuration = 5;
const trapIntervalDuration = 2;
const trapBlinkIntervalStart = 0.8;
const trapBlinkIntervalEnd = 0.08;
const trapBlinkEaseExponent = 1.35;
const trapWallCellCount = 3;
// トラップルームの初回ボレー値。1で初回候補数は1、2で初回候補数は3。デフォルトは1
export const trapInitialVolleyCount = 1;
// トラップルームの発射セル抽選で壁セルに掛ける重み。床セルの重みは常に1。値を小さくするほど壁が選ばれにくくなり、0で壁は抽選対象外。デフォルトは0.5
export const trapWallSelectionWeight = 0.5;
const trapFloorWarningYOffset = 0.002;
const trapWallWarningInset = 0.001;
const trapBeamSpawnInset = 0.01;
const trapNpcStopDelayMax = 6.0;
const trapNpcStopDelayStep = 0.1;

type TrapSystemParams = {
  scene: Scene;
  beams: Beam[];
  npcs: Npc[];
  isTrapStageSelected: () => boolean;
  spawnTrapBeam: (position: Vector3, direction: Vector3) => void;
  playTrapBeamSe: (position: Vector3) => void;
};

type TrapStageContext = {
  layout: GridLayout;
  bounds: StageBounds;
};

export type TrapSystem = {
  syncStageContext: (context: TrapStageContext) => void;
  resetRuntimeState: () => void;
  update: (delta: number, gamePhase: GamePhase) => void;
  updateNpcFreezeControl: (delta: number, gamePhase: GamePhase) => void;
  shouldFreezeNpcMovement: (npc: Npc, npcId: string) => boolean;
  getBeamCount: () => number;
  dispose: () => void;
};

export const createTrapSystem = ({
  scene,
  beams,
  npcs,
  isTrapStageSelected,
  spawnTrapBeam,
  playTrapBeamSe
}: TrapSystemParams): TrapSystem => {
  let layout: GridLayout;
  let bounds: StageBounds;
  const trapTelegraphMaterial: StandardMaterial = createTrapTelegraphMaterial(scene);
  let trapCandidates: TrapCandidate[] = [];
  let trapSelectedCandidates: TrapCandidate[] = [];
  let trapTelegraphMeshes = [] as ReturnType<typeof createTrapTelegraphMesh>[];
  let trapPhase: TrapPhase = "inactive";
  let trapPhaseTimer = 0;
  let trapBlinkTimer = 0;
  let trapBlinkVisible = false;
  let trapVolleyCount = trapInitialVolleyCount;
  let trapNpcFreezeWindowActive = false;
  let trapNpcFreezeElapsed = 0;
  const trapNpcStopDelayById = new Map<string, number>();

  const getTrapCandidateSelectionWeight = (candidate: TrapCandidate) =>
    candidate.kind === "wall" ? trapWallSelectionWeight : 1;

  const pickTrapCandidates = (count: number) =>
    pickWeightedUnique(trapCandidates, count, getTrapCandidateSelectionWeight);

  const clearTrapTelegraphMeshes = () => {
    disposeTrapTelegraphMeshes(trapTelegraphMeshes);
    trapTelegraphMeshes = [];
    trapSelectedCandidates = [];
    trapBlinkVisible = false;
  };

  const countTrapBeamsInFlight = () =>
    beams.filter((beam) => beam.group === "trap").length;

  const isTrapNpcFreezeWindow = () =>
    trapPhase === "charging" || countTrapBeamsInFlight() > 0;

  const assignTrapNpcStopDelays = () => {
    trapNpcStopDelayById.clear();
    const maxStep = Math.floor(trapNpcStopDelayMax / trapNpcStopDelayStep);
    for (const npc of npcs) {
      const step = Math.floor(Math.random() * (maxStep + 1));
      const delay = Number((step * trapNpcStopDelayStep).toFixed(1));
      trapNpcStopDelayById.set(npc.sprite.name, delay);
    }
  };

  const beginTrapNpcFreezeWindow = () => {
    trapNpcFreezeWindowActive = true;
    trapNpcFreezeElapsed = 0;
    assignTrapNpcStopDelays();
  };

  const startTrapChargingPhase = () => {
    clearTrapTelegraphMeshes();
    if (trapCandidates.length === 0) {
      trapPhase = "inactive";
      return;
    }
    const countLimit = (trapVolleyCount * (trapVolleyCount + 1)) / 2;
    const selectionCount = Math.min(trapCandidates.length, countLimit);
    trapSelectedCandidates = pickTrapCandidates(selectionCount);
    for (const candidate of trapSelectedCandidates) {
      trapTelegraphMeshes.push(
        createTrapTelegraphMesh(scene, layout, candidate, {
          material: trapTelegraphMaterial,
          floorWarningYOffset: trapFloorWarningYOffset,
          wallWarningInset: trapWallWarningInset,
          wallCellCount: trapWallCellCount
        })
      );
    }
    trapBlinkVisible = true;
    setTrapTelegraphVisible(trapTelegraphMeshes, true);
    trapBlinkTimer = 0;
    trapPhaseTimer = 0;
    trapPhase = "charging";
    beginTrapNpcFreezeWindow();
  };

  const fireTrapVolley = () => {
    if (trapSelectedCandidates.length === 0) {
      return;
    }
    for (const candidate of trapSelectedCandidates) {
      if (candidate.kind === "floor") {
        const position = new Vector3(
          candidate.centerX,
          bounds.minY + 0.001,
          candidate.centerZ
        );
        spawnTrapBeam(position, new Vector3(0, 1, 0));
        playTrapBeamSe(position);
        continue;
      }
      playTrapBeamSe(
        new Vector3(
          candidate.boundaryX + candidate.direction.x * trapBeamSpawnInset,
          layout.cellSize * (trapWallCellCount / 2),
          candidate.boundaryZ + candidate.direction.z * trapBeamSpawnInset
        )
      );
      for (let level = 0; level < trapWallCellCount; level += 1) {
        spawnTrapBeam(
          new Vector3(
            candidate.boundaryX + candidate.direction.x * trapBeamSpawnInset,
            layout.cellSize * (0.5 + level),
            candidate.boundaryZ + candidate.direction.z * trapBeamSpawnInset
          ),
          candidate.direction
        );
      }
    }
    trapVolleyCount += 1;
  };

  const resetRuntimeState = () => {
    clearTrapTelegraphMeshes();
    trapPhase = "inactive";
    trapPhaseTimer = 0;
    trapBlinkTimer = 0;
    trapBlinkVisible = false;
    trapVolleyCount = trapInitialVolleyCount;
    trapNpcFreezeWindowActive = false;
    trapNpcFreezeElapsed = 0;
    trapNpcStopDelayById.clear();
  };

  return {
    syncStageContext: (context) => {
      layout = context.layout;
      bounds = context.bounds;
      trapCandidates = isTrapStageSelected() ? buildTrapCandidates(layout) : [];
    },
    resetRuntimeState,
    update: (delta, gamePhase) => {
      if (gamePhase !== "playing" || !isTrapStageSelected()) {
        if (trapPhase !== "inactive" || trapTelegraphMeshes.length > 0) {
          resetRuntimeState();
        }
        return;
      }

      if (trapPhase === "inactive") {
        startTrapChargingPhase();
        return;
      }

      if (trapPhase === "charging") {
        trapPhaseTimer += delta;
        const progress = Math.min(1, trapPhaseTimer / trapWarningDuration);
        const blend = Math.pow(progress, trapBlinkEaseExponent);
        const blinkInterval =
          trapBlinkIntervalStart +
          (trapBlinkIntervalEnd - trapBlinkIntervalStart) * blend;
        trapBlinkTimer += delta;
        while (trapBlinkTimer >= blinkInterval) {
          trapBlinkTimer -= blinkInterval;
          trapBlinkVisible = !trapBlinkVisible;
          setTrapTelegraphVisible(trapTelegraphMeshes, trapBlinkVisible);
        }
        if (trapPhaseTimer >= trapWarningDuration) {
          fireTrapVolley();
          clearTrapTelegraphMeshes();
          trapPhase = "waiting_clear";
        }
        return;
      }

      if (trapPhase === "waiting_clear") {
        if (countTrapBeamsInFlight() === 0) {
          trapPhase = "interval";
          trapPhaseTimer = trapIntervalDuration;
        }
        return;
      }

      if (trapPhase === "interval") {
        trapPhaseTimer -= delta;
        if (trapPhaseTimer <= 0) {
          startTrapChargingPhase();
        }
      }
    },
    updateNpcFreezeControl: (delta, gamePhase) => {
      const shouldApply =
        gamePhase === "playing" &&
        isTrapStageSelected() &&
        isTrapNpcFreezeWindow();
      if (!shouldApply) {
        trapNpcFreezeWindowActive = false;
        trapNpcFreezeElapsed = 0;
        trapNpcStopDelayById.clear();
        return;
      }
      if (!trapNpcFreezeWindowActive) {
        beginTrapNpcFreezeWindow();
      }
      trapNpcFreezeElapsed += delta;
    },
    shouldFreezeNpcMovement: (npc, npcId) =>
      trapNpcFreezeWindowActive &&
      (npc.state === "normal" || npc.state === "evade") &&
      trapNpcFreezeElapsed + 0.0001 >= trapNpcStopDelayById.get(npcId)!,
    getBeamCount: () => Math.max(0, trapVolleyCount - 1),
    dispose: () => {
      resetRuntimeState();
      trapTelegraphMaterial.dispose();
    }
  };
};
