import { Color3, Scene, StandardMaterial } from "@babylonjs/core";
import { GridLayout } from "../../world/grid";
import { cellToWorld, worldToCellClamped } from "../gridUtils";
import { type GamePhase } from "../flow";
import { isAliveState, isBrainwashState, type FloorCell, type TargetInfo } from "../types";
import {
  createTrapTelegraphMesh,
  disposeTrapTelegraphMeshes,
  setTrapTelegraphVisible,
} from "../trap/telegraph";
import { TrapFloorCandidate } from "../trap/types";

const alarmBlinkDuration = 5;
const alarmSelectionInterval = 2;
const alarmInfluenceRadiusCells = 50;
const alarmBlinkIntervalStart = 0.8;
const alarmBlinkIntervalEnd = 0.08;
const alarmBlinkEaseExponent = 1.35;
const alarmFloorWarningYOffset = 0.002;

type AlarmSystemParams = {
  scene: Scene;
  isAlarmEnabled: () => boolean;
  onNpcTriggerAlarmCell?: (npcId: string) => void;
};

type AlarmStageContext = {
  layout: GridLayout;
  floorCells: FloorCell[];
};

type AlarmFloorCell = {
  row: number;
  col: number;
  centerX: number;
  centerZ: number;
};

type BlinkState = {
  mesh: ReturnType<typeof createTrapTelegraphMesh>;
  elapsed: number;
  blinkTimer: number;
  blinkVisible: boolean;
};

export type AlarmSystem = {
  syncStageContext: (context: AlarmStageContext) => void;
  resetRuntimeState: () => void;
  update: (delta: number, gamePhase: GamePhase, targets: TargetInfo[]) => void;
  getForcedTargetId: (npcId: string) => string | null;
  dispose: () => void;
};

const isBrainwashedNpcState = (state: TargetInfo["state"]) =>
  state === "brainwash-complete-gun" || state === "brainwash-complete-no-gun";

const toCellKey = (row: number, col: number) => `${row},${col}`;

export const createAlarmSystem = ({
  scene,
  isAlarmEnabled,
  onNpcTriggerAlarmCell,
}: AlarmSystemParams): AlarmSystem => {
  let layout: GridLayout;
  const alarmTelegraphMaterial = new StandardMaterial("alarmTelegraphMaterial", scene);
  alarmTelegraphMaterial.diffuseColor = new Color3(0.2, 0.96, 1);
  alarmTelegraphMaterial.emissiveColor = new Color3(0.2, 0.96, 1);
  alarmTelegraphMaterial.specularColor = Color3.Black();
  alarmTelegraphMaterial.alpha = 0.9;
  alarmTelegraphMaterial.backFaceCulling = false;

  let floorCellByKey = new Map<string, AlarmFloorCell>();
  let activeAlarmKeys = new Set<string>();
  let blinkingByKey = new Map<string, BlinkState>();
  let forcedTargetByNpcId = new Map<string, string>();
  let prevAliveCellByTargetId = new Map<string, string>();
  let selectionTimerSec = 0;

  const clearBlinkingMeshes = () => {
    const meshes = Array.from(blinkingByKey.values()).map((state) => state.mesh);
    disposeTrapTelegraphMeshes(meshes);
    blinkingByKey.clear();
  };

  const clearRuntimeState = () => {
    activeAlarmKeys.clear();
    clearBlinkingMeshes();
    forcedTargetByNpcId.clear();
    prevAliveCellByTargetId.clear();
    selectionTimerSec = 0;
  };

  const pickAndAddOneAlarmCell = () => {
    const candidates: string[] = [];
    for (const key of floorCellByKey.keys()) {
      if (activeAlarmKeys.has(key) || blinkingByKey.has(key)) {
        continue;
      }
      candidates.push(key);
    }
    if (candidates.length <= 0) {
      return;
    }
    const selectedKey = candidates[Math.floor(Math.random() * candidates.length)];
    activeAlarmKeys.add(selectedKey);
  };

  const startBlinkingCell = (cellKey: string) => {
    const floorCell = floorCellByKey.get(cellKey);
    if (!floorCell) {
      return;
    }
    const candidate: TrapFloorCandidate = {
      kind: "floor",
      row: floorCell.row,
      col: floorCell.col,
      centerX: floorCell.centerX,
      centerZ: floorCell.centerZ,
    };
    const mesh = createTrapTelegraphMesh(scene, layout, candidate, {
      material: alarmTelegraphMaterial,
      floorWarningYOffset: alarmFloorWarningYOffset,
      wallWarningInset: 0,
      wallCellCount: 1,
    });
    setTrapTelegraphVisible([mesh], true);
    blinkingByKey.set(cellKey, {
      mesh,
      elapsed: 0,
      blinkTimer: 0,
      blinkVisible: true,
    });
  };

  const applyForcedTargetsByAlarmTrigger = (
    cellKey: string,
    triggerTargetId: string,
    targets: TargetInfo[]
  ) => {
    const floorCell = floorCellByKey.get(cellKey)!;
    const radius = layout.cellSize * alarmInfluenceRadiusCells;
    const radiusSq = radius * radius;
    for (const target of targets) {
      if (!target.id.startsWith("npc_")) {
        continue;
      }
      if (!isBrainwashedNpcState(target.state)) {
        continue;
      }
      const dx = target.position.x - floorCell.centerX;
      const dz = target.position.z - floorCell.centerZ;
      if (dx * dx + dz * dz > radiusSq) {
        continue;
      }
      forcedTargetByNpcId.set(target.id, triggerTargetId);
    }
  };

  const triggerAlarmCell = (
    cellKey: string,
    triggerTargetId: string,
    targets: TargetInfo[]
  ) => {
    if (!activeAlarmKeys.has(cellKey)) {
      return;
    }
    activeAlarmKeys.delete(cellKey);
    startBlinkingCell(cellKey);
    if (triggerTargetId.startsWith("npc_")) {
      onNpcTriggerAlarmCell?.(triggerTargetId);
    }
    applyForcedTargetsByAlarmTrigger(cellKey, triggerTargetId, targets);
  };

  const updateBlinking = (delta: number) => {
    for (const [cellKey, state] of blinkingByKey) {
      state.elapsed += delta;
      const progress = Math.min(1, state.elapsed / alarmBlinkDuration);
      const blend = Math.pow(progress, alarmBlinkEaseExponent);
      const blinkInterval =
        alarmBlinkIntervalStart +
        (alarmBlinkIntervalEnd - alarmBlinkIntervalStart) * blend;
      state.blinkTimer += delta;
      while (state.blinkTimer >= blinkInterval) {
        state.blinkTimer -= blinkInterval;
        state.blinkVisible = !state.blinkVisible;
        setTrapTelegraphVisible([state.mesh], state.blinkVisible);
      }
      if (state.elapsed >= alarmBlinkDuration) {
        state.mesh.dispose();
        blinkingByKey.delete(cellKey);
      }
    }
  };

  const updateForcedTargets = (targets: TargetInfo[]) => {
    const targetById = new Map<string, TargetInfo>();
    for (const target of targets) {
      targetById.set(target.id, target);
    }
    for (const [npcId, targetId] of forcedTargetByNpcId) {
      const npcTarget = targetById.get(npcId);
      if (!npcTarget || !isBrainwashedNpcState(npcTarget.state)) {
        forcedTargetByNpcId.delete(npcId);
        continue;
      }
      const chaseTarget = targetById.get(targetId);
      if (!chaseTarget || isBrainwashState(chaseTarget.state)) {
        forcedTargetByNpcId.delete(npcId);
      }
    }
  };

  const updateAliveCellTracking = (targets: TargetInfo[]) => {
    const aliveTargets = targets.filter((target) => isAliveState(target.state));
    const aliveTargetIds = new Set(aliveTargets.map((target) => target.id));
    for (const targetId of prevAliveCellByTargetId.keys()) {
      if (!aliveTargetIds.has(targetId)) {
        prevAliveCellByTargetId.delete(targetId);
      }
    }
    for (const target of aliveTargets) {
      const currentCell = worldToCellClamped(layout, target.position);
      const currentKey = toCellKey(currentCell.row, currentCell.col);
      const previousKey = prevAliveCellByTargetId.get(target.id);
      prevAliveCellByTargetId.set(target.id, currentKey);
      if (!previousKey || previousKey === currentKey) {
        continue;
      }
      if (!activeAlarmKeys.has(currentKey)) {
        continue;
      }
      triggerAlarmCell(currentKey, target.id, targets);
    }
  };

  const resetRuntimeStateInternal = (selectInitialCell: boolean) => {
    clearRuntimeState();
    if (selectInitialCell) {
      pickAndAddOneAlarmCell();
    }
  };

  return {
    syncStageContext: (context) => {
      layout = context.layout;
      floorCellByKey = new Map<string, AlarmFloorCell>();
      for (const floorCell of context.floorCells) {
        const center = cellToWorld(layout, floorCell, 0);
        floorCellByKey.set(toCellKey(floorCell.row, floorCell.col), {
          row: floorCell.row,
          col: floorCell.col,
          centerX: center.x,
          centerZ: center.z,
        });
      }
    },
    resetRuntimeState: () => {
      resetRuntimeStateInternal(isAlarmEnabled());
    },
    update: (delta, gamePhase, targets) => {
      if (gamePhase !== "playing" || !isAlarmEnabled()) {
        resetRuntimeStateInternal(false);
        return;
      }

      selectionTimerSec += delta;
      while (selectionTimerSec >= alarmSelectionInterval) {
        selectionTimerSec -= alarmSelectionInterval;
        pickAndAddOneAlarmCell();
      }

      updateForcedTargets(targets);
      updateAliveCellTracking(targets);
      updateBlinking(delta);
    },
    getForcedTargetId: (npcId) => forcedTargetByNpcId.get(npcId) ?? null,
    dispose: () => {
      clearRuntimeState();
      alarmTelegraphMaterial.dispose();
    },
  };
};
