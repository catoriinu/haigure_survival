import { Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { type GamePhase } from "../flow";
import { GridLayout } from "../../world/grid";
import {
  createTrapTelegraphMaterial,
  createTrapTelegraphMesh,
  disposeTrapTelegraphMeshes,
  setTrapTelegraphVisible
} from "../trap/telegraph";
import { TrapFloorCandidate } from "../trap/types";
import { buildDynamicBeamSets } from "./candidates";
import { DynamicBeamPhase, DynamicBeamSet } from "./types";

const dynamicBeamWarningDuration = 5;
const dynamicBeamSustainDuration = 20;
const dynamicBeamSwitchLeadTime = 5;
const dynamicBeamSelectionBaseChance = 0.05;
const dynamicBeamSelectionChanceStep = 0.01;
const dynamicBeamBlinkIntervalStart = 0.8;
const dynamicBeamBlinkIntervalEnd = 0.08;
const dynamicBeamBlinkEaseExponent = 1.35;
const dynamicBeamFloorWarningYOffset = 0.002;
const dynamicBeamSpawnYOffset = 0.001;

type DynamicBeamSystemParams = {
  scene: Scene;
  isDynamicStageSelected: () => boolean;
  spawnDynamicBeam: (position: Vector3, direction: Vector3) => void;
  playDynamicBeamSe: (position: Vector3) => void;
};

type DynamicBeamStageContext = {
  layout: GridLayout;
  zoneMap: string[][] | null;
};

export type DynamicBeamSystem = {
  syncStageContext: (context: DynamicBeamStageContext) => void;
  resetRuntimeState: () => void;
  update: (delta: number, gamePhase: GamePhase) => void;
  dispose: () => void;
};

export const createDynamicBeamSystem = ({
  scene,
  isDynamicStageSelected,
  spawnDynamicBeam,
  playDynamicBeamSe
}: DynamicBeamSystemParams): DynamicBeamSystem => {
  let layout: GridLayout;
  let dynamicBeamSets: DynamicBeamSet[] = [];
  const telegraphMaterial: StandardMaterial = createTrapTelegraphMaterial(scene);
  let telegraphMeshes = [] as ReturnType<typeof createTrapTelegraphMesh>[];
  let phase: DynamicBeamPhase = "inactive";
  let activeElapsed = 0;
  let selectionDrawCount = 0;
  let warningSets: DynamicBeamSet[] = [];
  let warningElapsed = 0;
  let warningRunning = false;
  let warningBlinkTimer = 0;
  let warningBlinkVisible = false;
  let nextCyclePrepared = false;
  let nextCycleReady = false;
  let nextCycleSets: DynamicBeamSet[] = [];

  const pickSetsForDraw = () => {
    selectionDrawCount += 1;
    const chance = Math.min(
      1,
      dynamicBeamSelectionBaseChance +
        (selectionDrawCount - 1) * dynamicBeamSelectionChanceStep
    );
    return dynamicBeamSets.filter(() => Math.random() < chance);
  };

  const clearWarningTelegraphMeshes = () => {
    disposeTrapTelegraphMeshes(telegraphMeshes);
    telegraphMeshes = [];
    warningSets = [];
    warningRunning = false;
    warningElapsed = 0;
    warningBlinkTimer = 0;
    warningBlinkVisible = false;
  };

  const startWarningPhase = (sets: DynamicBeamSet[], preserveActivePhase: boolean) => {
    clearWarningTelegraphMeshes();
    warningSets = sets;
    for (const set of sets) {
      for (const cell of set.cells) {
        const floorCandidate: TrapFloorCandidate = {
          kind: "floor",
          row: cell.row,
          col: cell.col,
          centerX: cell.centerX,
          centerZ: cell.centerZ
        };
        telegraphMeshes.push(
          createTrapTelegraphMesh(scene, layout, floorCandidate, {
            material: telegraphMaterial,
            floorWarningYOffset: dynamicBeamFloorWarningYOffset,
            wallWarningInset: 0,
            wallCellCount: 1
          })
        );
      }
    }
    warningRunning = true;
    warningElapsed = 0;
    warningBlinkTimer = 0;
    warningBlinkVisible = true;
    setTrapTelegraphVisible(telegraphMeshes, true);
    if (!preserveActivePhase) {
      phase = "warning";
    }
  };

  const fireSets = (sets: DynamicBeamSet[]) => {
    for (const set of sets) {
      for (const cell of set.cells) {
        spawnDynamicBeam(
          new Vector3(cell.centerX, dynamicBeamSpawnYOffset, cell.centerZ),
          new Vector3(0, 1, 0)
        );
      }
      playDynamicBeamSe(
        new Vector3(set.centerX, dynamicBeamSpawnYOffset, set.centerZ)
      );
    }
  };

  const updateWarningBlink = (delta: number) => {
    warningElapsed += delta;
    const progress = Math.min(1, warningElapsed / dynamicBeamWarningDuration);
    const blend = Math.pow(progress, dynamicBeamBlinkEaseExponent);
    const blinkInterval =
      dynamicBeamBlinkIntervalStart +
      (dynamicBeamBlinkIntervalEnd - dynamicBeamBlinkIntervalStart) * blend;
    warningBlinkTimer += delta;
    while (warningBlinkTimer >= blinkInterval) {
      warningBlinkTimer -= blinkInterval;
      warningBlinkVisible = !warningBlinkVisible;
      setTrapTelegraphVisible(telegraphMeshes, warningBlinkVisible);
    }
    return warningElapsed >= dynamicBeamWarningDuration;
  };

  const resetRuntimeState = () => {
    clearWarningTelegraphMeshes();
    phase = "inactive";
    activeElapsed = 0;
    selectionDrawCount = 0;
    nextCyclePrepared = false;
    nextCycleReady = false;
    nextCycleSets = [];
  };

  return {
    syncStageContext: (context) => {
      layout = context.layout;
      dynamicBeamSets = buildDynamicBeamSets(layout, context.zoneMap);
    },
    resetRuntimeState,
    update: (delta, gamePhase) => {
      if (gamePhase !== "playing" || !isDynamicStageSelected()) {
        if (phase !== "inactive" || warningRunning || telegraphMeshes.length > 0) {
          resetRuntimeState();
        }
        return;
      }

      if (phase === "inactive") {
        const initialSets = pickSetsForDraw();
        if (initialSets.length === 0) {
          phase = "active";
          activeElapsed = 0;
          return;
        }
        startWarningPhase(initialSets, false);
        return;
      }

      if (phase === "warning") {
        if (updateWarningBlink(delta)) {
          fireSets(warningSets);
          activeElapsed = 0;
          clearWarningTelegraphMeshes();
          phase = "active";
        }
        return;
      }

      activeElapsed += delta;
      const nextWarningStartAt =
        dynamicBeamSustainDuration - dynamicBeamSwitchLeadTime;
      if (!nextCyclePrepared && activeElapsed >= nextWarningStartAt) {
        nextCyclePrepared = true;
        nextCycleSets = pickSetsForDraw();
        if (nextCycleSets.length === 0) {
          nextCycleReady = true;
        } else {
          startWarningPhase(nextCycleSets, true);
          nextCycleReady = false;
        }
      }
      if (warningRunning && updateWarningBlink(delta)) {
        fireSets(nextCycleSets);
        activeElapsed = 0;
        clearWarningTelegraphMeshes();
        nextCyclePrepared = false;
        nextCycleReady = false;
        nextCycleSets = [];
      }
      if (activeElapsed >= dynamicBeamSustainDuration && nextCyclePrepared && nextCycleReady) {
        activeElapsed = 0;
        nextCyclePrepared = false;
        nextCycleReady = false;
        nextCycleSets = [];
      }
    },
    dispose: () => {
      resetRuntimeState();
      telegraphMaterial.dispose();
    }
  };
};
