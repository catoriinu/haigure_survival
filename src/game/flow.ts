import { FreeCamera, Sprite, Vector3 } from "@babylonjs/core";
import { CELL_SCALE, GridLayout } from "../world/grid";
import { type StageArea } from "../world/stageJson";
import { Hud } from "../ui/hud";
import { Bit, CharacterState, FloorCell, Npc } from "./types";
import { finalizeBitVisuals } from "./bits";
import { cellToWorld, worldToCellClamped } from "./gridUtils";
import { alignSpriteToGround } from "./spriteUtils";
import { createFadeController } from "./flowFade";

export type GamePhase =
  | "title"
  | "playing"
  | "roulette"
  | "transition"
  | "assemblyMove"
  | "assemblyHold"
  | "execution";

export type AssemblyMode = "move" | "instant";

export type ExecutionConfig =
  | { variant: "player-survivor" }
  | { variant: "npc-survivor-player-block"; survivorNpcIndex: number }
  | { variant: "npc-survivor-npc-block"; survivorNpcIndex: number };

type AssemblyRoute = {
  waypoints: Vector3[];
  index: number;
};

type GameFlowOptions = {
  layout: GridLayout;
  assemblyArea: StageArea;
  camera: FreeCamera;
  bits: Bit[];
  npcs: Npc[];
  playerAvatar: Sprite;
  playerCenterHeight: number;
  eyeHeight: number;
  hud: Hud;
  getGamePhase: () => GamePhase;
  setGamePhase: (phase: GamePhase) => void;
  setPlayerState: (state: CharacterState) => void;
  clearBeams: () => void;
  stopAlertLoop: () => void;
  setBitSpawnEnabled: (enabled: boolean) => void;
  disposePlayerHitEffects: () => void;
};

export const createGameFlow = ({
  layout,
  assemblyArea,
  camera,
  bits,
  npcs,
  playerAvatar,
  playerCenterHeight,
  eyeHeight,
  hud,
  getGamePhase,
  setGamePhase,
  setPlayerState,
  clearBeams,
  stopAlertLoop,
  setBitSpawnEnabled,
  disposePlayerHitEffects
}: GameFlowOptions) => {
  const stageArea = assemblyArea;
  const assemblyMoveSpeed = 0.27;
  const assemblyArriveDistance = 0.02;
  const assemblyOrbitRadius = 1.17;
  const assemblyOrbitSpeed = 0.4;
  const assemblyOrbitHeight = 0.33;
  const executionOrbitRadius = assemblyOrbitRadius;
  const executionOrbitHeight = eyeHeight;
  const executionNpcRingPadding = layout.cellSize * 0.4 * CELL_SCALE;
  const executionNpcRingMaxRadius = Math.min(
    ((stageArea.width - CELL_SCALE) * layout.cellSize) / 2,
    ((stageArea.height - CELL_SCALE) * layout.cellSize) / 2
  );
  const executionNpcRingRadius = Math.min(
    executionNpcRingMaxRadius,
    executionOrbitRadius + executionNpcRingPadding
  );
  const fadeDuration = 0.8;
  const { beginFadeOut, updateFade, resetFade, isFading } =
    createFadeController(hud, fadeDuration);
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const stageCenter = new Vector3(
    -halfWidth +
      layout.cellSize * (stageArea.startCol + stageArea.width / 2),
    playerCenterHeight,
    -halfDepth +
      layout.cellSize * (stageArea.startRow + stageArea.height / 2)
  );
  const stageRows = Array.from(
    { length: stageArea.height },
    (_, index) => stageArea.startRow + index
  );
  const stageCols = Array.from(
    { length: stageArea.width },
    (_, index) => stageArea.startCol + index
  );
  const isCellInBounds = (cell: FloorCell) =>
    cell.row >= 0 &&
    cell.row < layout.rows &&
    cell.col >= 0 &&
    cell.col < layout.columns;
  const isFloorCell = (cell: FloorCell) =>
    isCellInBounds(cell) && layout.cells[cell.row][cell.col] === "floor";
  const collectAssemblyAreaFloorCells = () => {
    const cells: FloorCell[] = [];
    for (const row of stageRows) {
      for (const col of stageCols) {
        const cell = { row, col };
        if (isFloorCell(cell)) {
          cells.push(cell);
        }
      }
    }
    return cells;
  };
  const collectAllFloorCells = () => {
    const cells: FloorCell[] = [];
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.columns; col += 1) {
        if (layout.cells[row][col] === "floor") {
          cells.push({ row, col });
        }
      }
    }
    return cells;
  };
  const toStageCenterDistanceSq = (cell: FloorCell) => {
    const position = cellToWorld(layout, cell, playerCenterHeight);
    const dx = position.x - stageCenter.x;
    const dz = position.z - stageCenter.z;
    return dx * dx + dz * dz;
  };
  const assemblyFloorCellsBase = collectAssemblyAreaFloorCells();
  const assemblyFloorCells =
    assemblyFloorCellsBase.length > 0
      ? assemblyFloorCellsBase
      : collectAllFloorCells();
  if (assemblyFloorCells.length === 0) {
    assemblyFloorCells.push({
      row: layout.spawn.row,
      col: layout.spawn.col
    });
  }
  const orderedAssemblyFloorCells = [...assemblyFloorCells].sort((a, b) => {
    const distanceDiff = toStageCenterDistanceSq(a) - toStageCenterDistanceSq(b);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    const rowDiff = a.row - b.row;
    if (rowDiff !== 0) {
      return rowDiff;
    }
    return a.col - b.col;
  });

  let assemblyPlayerTarget = stageCenter.clone();
  let assemblyNpcTargets: Vector3[] = [];
  let assemblyPlayerRoute: AssemblyRoute | null = null;
  let assemblyNpcRoutes: AssemblyRoute[] = [];
  let assemblyElapsed = 0;
  let executionCameraFollowAvatar = false;
  const followCameraOffset = playerAvatar.width * 0.9;

  const buildReachableFloorMap = (start: FloorCell) => {
    const reachable = Array.from({ length: layout.rows }, () =>
      Array.from({ length: layout.columns }, () => false)
    );
    if (!isFloorCell(start)) {
      return reachable;
    }
    const queueRow: number[] = [start.row];
    const queueCol: number[] = [start.col];
    let head = 0;
    reachable[start.row][start.col] = true;
    while (head < queueRow.length) {
      const row = queueRow[head];
      const col = queueCol[head];
      head += 1;
      const neighbors = [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 }
      ];
      for (const neighbor of neighbors) {
        if (!isFloorCell(neighbor)) {
          continue;
        }
        if (reachable[neighbor.row][neighbor.col]) {
          continue;
        }
        reachable[neighbor.row][neighbor.col] = true;
        queueRow.push(neighbor.row);
        queueCol.push(neighbor.col);
      }
    }
    return reachable;
  };
  const pickAssemblyTargetCell = (start: FloorCell, preferredIndex: number) => {
    const reachable = buildReachableFloorMap(start);
    for (let offset = 0; offset < orderedAssemblyFloorCells.length; offset += 1) {
      const index = (preferredIndex + offset) % orderedAssemblyFloorCells.length;
      const candidate = orderedAssemblyFloorCells[index];
      if (reachable[candidate.row][candidate.col]) {
        return candidate;
      }
    }
    return isFloorCell(start)
      ? start
      : { row: layout.spawn.row, col: layout.spawn.col };
  };
  const createAssemblyTargets = (startPositions: Vector3[]) => {
    const targetCells = startPositions.map((start, index) => {
      const startCell = worldToCellClamped(layout, start);
      return pickAssemblyTargetCell(startCell, index);
    });
    const playerTarget = cellToWorld(layout, targetCells[0], playerCenterHeight);
    const npcTargets = targetCells
      .slice(1)
      .map((cell) => cellToWorld(layout, cell, playerCenterHeight));
    return { playerTarget, npcTargets };
  };

  const buildShortestPath = (start: FloorCell, goal: FloorCell) => {
    if (!isFloorCell(start) || !isFloorCell(goal)) {
      return null;
    }
    const visited = Array.from({ length: layout.rows }, () =>
      Array.from({ length: layout.columns }, () => false)
    );
    const prevRow = Array.from({ length: layout.rows }, () =>
      Array.from({ length: layout.columns }, () => -1)
    );
    const prevCol = Array.from({ length: layout.rows }, () =>
      Array.from({ length: layout.columns }, () => -1)
    );
    const queueRow: number[] = [];
    const queueCol: number[] = [];
    let head = 0;

    visited[start.row][start.col] = true;
    queueRow.push(start.row);
    queueCol.push(start.col);

    while (head < queueRow.length) {
      const row = queueRow[head];
      const col = queueCol[head];
      head += 1;
      if (row === goal.row && col === goal.col) {
        break;
      }

      const neighbors = [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 }
      ];
      for (const neighbor of neighbors) {
        if (
          neighbor.row < 0 ||
          neighbor.row >= layout.rows ||
          neighbor.col < 0 ||
          neighbor.col >= layout.columns
        ) {
          continue;
        }
        if (layout.cells[neighbor.row][neighbor.col] !== "floor") {
          continue;
        }
        if (visited[neighbor.row][neighbor.col]) {
          continue;
        }
        visited[neighbor.row][neighbor.col] = true;
        prevRow[neighbor.row][neighbor.col] = row;
        prevCol[neighbor.row][neighbor.col] = col;
        queueRow.push(neighbor.row);
        queueCol.push(neighbor.col);
      }
    }
    if (!visited[goal.row][goal.col]) {
      return null;
    }

    const path: FloorCell[] = [];
    let row = goal.row;
    let col = goal.col;
    path.push({ row, col });
    while (row !== start.row || col !== start.col) {
      const prevR = prevRow[row][col];
      const prevC = prevCol[row][col];
      if (prevR < 0 || prevC < 0) {
        return null;
      }
      row = prevR;
      col = prevC;
      path.push({ row, col });
    }
    path.reverse();
    return path;
  };

  const buildAssemblyRoute = (start: Vector3, goal: Vector3): AssemblyRoute => {
    const startCell = worldToCellClamped(layout, start);
    const goalCell = worldToCellClamped(layout, goal);
    const cellPath = buildShortestPath(startCell, goalCell);
    if (!cellPath) {
      return {
        waypoints: [new Vector3(start.x, playerCenterHeight, start.z)],
        index: 0
      };
    }
    const waypoints: Vector3[] = [
      new Vector3(start.x, playerCenterHeight, start.z)
    ];
    for (let index = 1; index < cellPath.length; index += 1) {
      waypoints.push(
        cellToWorld(layout, cellPath[index], playerCenterHeight)
      );
    }
    waypoints.push(new Vector3(goal.x, playerCenterHeight, goal.z));
    return { waypoints, index: 0 };
  };

  const createStageSlots = (rowOrder: number[]) => {
    const slots: Vector3[] = [];
    for (const row of rowOrder) {
      for (const col of stageCols) {
        slots.push(
          cellToWorld(layout, { row, col }, playerCenterHeight)
        );
      }
    }
    return slots;
  };

  const createExecutionRingSlots = (center: Vector3, count: number) => {
    if (count <= 0) {
      return [];
    }
    const slots: Vector3[] = [];
    const angleStep = (Math.PI * 2) / count;
    for (let index = 0; index < count; index += 1) {
      const angle = angleStep * index;
      slots.push(
        new Vector3(
          center.x + Math.cos(angle) * executionNpcRingRadius,
          playerCenterHeight,
          center.z + Math.sin(angle) * executionNpcRingRadius
        )
      );
    }
    return slots;
  };

  const moveSpriteToTarget = (
    sprite: Sprite,
    target: Vector3,
    speed: number,
    delta: number
  ) => {
    const toTarget = target.subtract(sprite.position);
    toTarget.y = 0;
    const distance = Math.hypot(toTarget.x, toTarget.z);
    if (distance <= assemblyArriveDistance) {
      sprite.position.x = target.x;
      sprite.position.z = target.z;
      alignSpriteToGround(sprite);
      return true;
    }
    const step = Math.min(distance, speed * delta);
    sprite.position.x += (toTarget.x / distance) * step;
    sprite.position.z += (toTarget.z / distance) * step;
    alignSpriteToGround(sprite);
    return false;
  };

  const moveSpriteAlongRoute = (
    sprite: Sprite,
    route: AssemblyRoute,
    speed: number,
    delta: number
  ) => {
    while (route.index < route.waypoints.length) {
      const arrived = moveSpriteToTarget(
        sprite,
        route.waypoints[route.index],
        speed,
        delta
      );
      if (!arrived) {
        return false;
      }
      route.index += 1;
    }
    return true;
  };

  const finalizeNpcEffects = (npc: Npc) => {
    if (npc.hitEffect) {
      npc.hitEffect.dispose();
      npc.hitEffect = null;
      npc.hitEffectMaterial = null;
    }
    if (npc.hitLight) {
      npc.hitLight.dispose();
      npc.hitLight = null;
    }
    for (const orb of npc.fadeOrbs) {
      orb.mesh.dispose();
    }
    npc.fadeOrbs = [];
  };

  const updateBitsOrbit = (delta: number) => {
    if (bits.length === 0) {
      return;
    }
    assemblyElapsed += delta;
    const angleStep = (Math.PI * 2) / bits.length;
    const bobSpeed = 1.2;
    for (let index = 0; index < bits.length; index += 1) {
      const bit = bits[index];
      const angle = assemblyElapsed * assemblyOrbitSpeed + angleStep * index;
      const x = stageCenter.x + Math.cos(angle) * assemblyOrbitRadius;
      const z = stageCenter.z + Math.sin(angle) * assemblyOrbitRadius;
      const bob =
        Math.sin(assemblyElapsed * bobSpeed + bit.floatOffset) * 0.03;
      bit.root.position.x = x;
      bit.root.position.y = assemblyOrbitHeight + bob;
      bit.root.position.z = z;
      bit.baseHeight = assemblyOrbitHeight;
      bit.root.lookAt(stageCenter);
    }
  };

  const placeBitsAround = (center: Vector3) => {
    if (bits.length === 0) {
      return;
    }
    const angleStep = (Math.PI * 2) / bits.length;
    for (let index = 0; index < bits.length; index += 1) {
      const bit = bits[index];
      const angle = angleStep * index;
      bit.root.setEnabled(true);
      bit.root.position.x = center.x + Math.cos(angle) * executionOrbitRadius;
      bit.root.position.z = center.z + Math.sin(angle) * executionOrbitRadius;
      bit.root.position.y = executionOrbitHeight;
      bit.baseHeight = executionOrbitHeight;
      bit.root.lookAt(center);
    }
  };

  const setBitsEnabled = (enabled: boolean) => {
    for (const bit of bits) {
      bit.root.setEnabled(enabled);
    }
  };

  const updateCameraFollowAvatar = () => {
    const forward = camera.getDirection(new Vector3(0, 0, 1));
    camera.position.x = playerAvatar.position.x + forward.x * followCameraOffset;
    camera.position.z = playerAvatar.position.z + forward.z * followCameraOffset;
    camera.position.y = eyeHeight;
  };

  const enterAssembly = (mode: AssemblyMode) => {
    stopAlertLoop();
    setBitSpawnEnabled(false);
    clearBeams();
    assemblyElapsed = 0;
    hud.setHudVisible(false);
    hud.setTitleVisible(false);
    hud.setStateInfo("操作説明\nEnter: タイトルへ");
    hud.setCrosshairVisible(false);
    setPlayerState("brainwash-complete-haigure-formation");
    const playerStartPosition = new Vector3(
      camera.position.x,
      playerCenterHeight,
      camera.position.z
    );
    playerAvatar.isVisible = true;
    playerAvatar.cellIndex = 2;
    playerAvatar.position.copyFrom(playerStartPosition);
    alignSpriteToGround(playerAvatar);

    const assemblyTargets = createAssemblyTargets([
      playerAvatar.position,
      ...npcs.map((npc) => npc.sprite.position)
    ]);
    assemblyPlayerTarget = assemblyTargets.playerTarget;
    assemblyNpcTargets = assemblyTargets.npcTargets;

    for (const npc of npcs) {
      npc.state = "brainwash-complete-haigure-formation";
      npc.sprite.cellIndex = 2;
      alignSpriteToGround(npc.sprite);
      finalizeNpcEffects(npc);
    }

    disposePlayerHitEffects();
    for (const bit of bits) {
      finalizeBitVisuals(bit);
    }

    if (mode === "instant") {
      assemblyPlayerRoute = null;
      assemblyNpcRoutes = [];
      playerAvatar.position.copyFrom(assemblyPlayerTarget);
      alignSpriteToGround(playerAvatar);
      for (let index = 0; index < npcs.length; index += 1) {
        npcs[index].sprite.position.copyFrom(assemblyNpcTargets[index]);
        alignSpriteToGround(npcs[index].sprite);
      }
      setGamePhase("assemblyHold");
      return;
    }

    assemblyPlayerRoute = buildAssemblyRoute(
      playerAvatar.position,
      assemblyPlayerTarget
    );
    assemblyNpcRoutes = npcs.map((npc, index) =>
      buildAssemblyRoute(npc.sprite.position, assemblyNpcTargets[index])
    );
    setGamePhase("assemblyMove");
  };

  const enterExecution = (config: ExecutionConfig) => {
    stopAlertLoop();
    setBitSpawnEnabled(false);
    clearBeams();
    assemblyElapsed = 0;
    hud.setHudVisible(false);
    hud.setTitleVisible(false);
    if (config.variant === "npc-survivor-player-block") {
      hud.setStateInfo(
        "操作説明\nWASD: 移動\nEnter: タイトルへ\nR: リプレイ"
      );
    } else {
      hud.setStateInfo("操作説明\nEnter: タイトルへ\nR: リプレイ");
    }
    hud.setCrosshairVisible(config.variant === "npc-survivor-player-block");

    disposePlayerHitEffects();
    for (const bit of bits) {
      finalizeBitVisuals(bit);
    }

    for (const npc of npcs) {
      alignSpriteToGround(npc.sprite);
      finalizeNpcEffects(npc);
    }

    const executionCenter = new Vector3(
      stageCenter.x,
      playerCenterHeight,
      stageCenter.z
    );
    const frontRowOrder = [...stageRows];
    const frontRowCenterIndex = Math.floor((stageCols.length - 1) / 2);
    const frontSlots = createStageSlots(frontRowOrder);
    const placeNpcRing = (npcIndices: number[]) => {
      const ringSlots = createExecutionRingSlots(
        executionCenter,
        npcIndices.length
      );
      for (let index = 0; index < npcIndices.length; index += 1) {
        const npc = npcs[npcIndices[index]];
        npc.state = "brainwash-complete-haigure-formation";
        npc.sprite.cellIndex = 2;
        npc.sprite.position.copyFrom(ringSlots[index]);
        alignSpriteToGround(npc.sprite);
      }
    };

    if (config.variant === "player-survivor") {
      executionCameraFollowAvatar = false;
      setPlayerState("evade");
      playerAvatar.isVisible = false;
      camera.position.set(
        executionCenter.x,
        eyeHeight,
        executionCenter.z
      );
      camera.setTarget(
        new Vector3(executionCenter.x, eyeHeight, executionCenter.z + 1)
      );

      placeNpcRing(npcs.map((_, index) => index));
      setBitsEnabled(true);
      placeBitsAround(executionCenter);
      setGamePhase("execution");
      return;
    }

    const survivorNpc = npcs[config.survivorNpcIndex];
    survivorNpc.state = "evade";
    survivorNpc.sprite.cellIndex = 0;
    survivorNpc.sprite.position.copyFrom(executionCenter);
    alignSpriteToGround(survivorNpc.sprite);

    if (config.variant === "npc-survivor-player-block") {
      executionCameraFollowAvatar = false;
      setPlayerState("brainwash-complete-gun");
      playerAvatar.isVisible = false;
      const playerTarget = frontSlots[frontRowCenterIndex];
      camera.position.set(playerTarget.x, eyeHeight, playerTarget.z);
      camera.setTarget(executionCenter);

      const npcIndices = npcs
        .map((_, index) => index)
        .filter((index) => index !== config.survivorNpcIndex);
      placeNpcRing(npcIndices);
      setBitsEnabled(false);
      setGamePhase("execution");
      return;
    }

    executionCameraFollowAvatar = true;
    setPlayerState("brainwash-complete-haigure-formation");
    playerAvatar.isVisible = true;
    playerAvatar.cellIndex = 2;
    playerAvatar.position.copyFrom(frontSlots[frontRowCenterIndex]);
    alignSpriteToGround(playerAvatar);
    camera.position.set(
      playerAvatar.position.x,
      eyeHeight,
      playerAvatar.position.z
    );
    camera.setTarget(executionCenter);

    const npcIndices = npcs
      .map((_, index) => index)
      .filter((index) => index !== config.survivorNpcIndex);
    placeNpcRing(npcIndices);
    setBitsEnabled(true);
    placeBitsAround(executionCenter);
    setGamePhase("execution");
  };

  const updateAssembly = (delta: number) => {
    updateBitsOrbit(delta);
    if (getGamePhase() !== "assemblyMove") {
      updateCameraFollowAvatar();
      return;
    }
    const playerRoute = assemblyPlayerRoute!;
    let allArrived = moveSpriteAlongRoute(
      playerAvatar,
      playerRoute,
      assemblyMoveSpeed,
      delta
    );
    for (let index = 0; index < npcs.length; index += 1) {
      const npcRoute = assemblyNpcRoutes[index];
      const arrived = moveSpriteAlongRoute(
        npcs[index].sprite,
        npcRoute,
        assemblyMoveSpeed,
        delta
      );
      allArrived = allArrived && arrived;
    }
    if (allArrived) {
      setGamePhase("assemblyHold");
    }
    updateCameraFollowAvatar();
  };

  const updateExecution = () => {
    if (!executionCameraFollowAvatar) {
      return;
    }
    updateCameraFollowAvatar();
  };

  return {
    enterAssembly,
    enterExecution,
    updateAssembly,
    updateExecution,
    beginFadeOut,
    updateFade,
    resetFade,
    isFading
  };
};
