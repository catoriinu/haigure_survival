import { FreeCamera, Sprite, Vector3 } from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import { Hud } from "../ui/hud";
import { Bit, CharacterState, Npc } from "./types";
import { finalizeBitVisuals } from "./bits";

export type GamePhase =
  | "title"
  | "playing"
  | "transition"
  | "assemblyMove"
  | "assemblyHold";

export type AssemblyMode = "move" | "instant";

type AssemblyRoute = {
  waypoints: Vector3[];
  index: number;
};

type GameFlowOptions = {
  layout: GridLayout;
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
  const unitScale = 0.5;
  const assemblyRoom = {
    startCol: 8,
    startRow: 8,
    width: 4,
    height: 4
  };
  const assemblyMaxColumns = 5;
  const assemblySpacingX = 6 * unitScale;
  const assemblySpacingZ = 4 * unitScale;
  const assemblyMoveSpeed = 3.2 * unitScale;
  const assemblyArriveDistance = 0.2 * unitScale;
  const assemblyOrbitRadius = 14 * unitScale;
  const assemblyOrbitSpeed = 0.4;
  const assemblyOrbitHeight = 4 * unitScale;
  const fadeDuration = 0.8;
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const assemblyCenter = new Vector3(
    -halfWidth +
      layout.cellSize * (assemblyRoom.startCol + assemblyRoom.width / 2),
    playerCenterHeight,
    -halfDepth +
      layout.cellSize * (assemblyRoom.startRow + assemblyRoom.height / 2)
  );

  let assemblyPlayerTarget = assemblyCenter.clone();
  let assemblyNpcTargets: Vector3[] = [];
  let assemblyPlayerRoute: AssemblyRoute | null = null;
  let assemblyNpcRoutes: AssemblyRoute[] = [];
  let assemblyElapsed = 0;
  let fadeOpacity = 0;
  let fadePhase: "none" | "out" | "in" = "none";
  let fadeNext: (() => void) | null = null;

  type GridCell = {
    row: number;
    col: number;
  };

  const cellToWorld = (cell: GridCell, y: number) =>
    new Vector3(
      -halfWidth + layout.cellSize / 2 + cell.col * layout.cellSize,
      y,
      -halfDepth + layout.cellSize / 2 + cell.row * layout.cellSize
    );

  const worldToCell = (position: Vector3): GridCell => ({
    row: Math.floor((position.z + halfDepth) / layout.cellSize),
    col: Math.floor((position.x + halfWidth) / layout.cellSize)
  });

  const createAssemblyTargets = (totalCount: number) => {
    const columns = Math.min(assemblyMaxColumns, totalCount);
    const rows = Math.ceil(totalCount / columns);
    const totalWidth = (columns - 1) * assemblySpacingX;
    const totalDepth = (rows - 1) * assemblySpacingZ;
    const slots: Vector3[] = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        if (slots.length >= totalCount) {
          break;
        }
        slots.push(
          new Vector3(
            assemblyCenter.x - totalWidth / 2 + col * assemblySpacingX,
            playerCenterHeight,
            assemblyCenter.z - totalDepth / 2 + row * assemblySpacingZ
          )
        );
      }
    }

    const playerIndex = Math.floor((columns - 1) / 2);
    const playerTarget = slots[playerIndex];
    const npcTargets = slots.filter((_, index) => index !== playerIndex);
    return { playerTarget, npcTargets };
  };

  const buildShortestPath = (start: GridCell, goal: GridCell) => {
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

    const path: GridCell[] = [];
    let row = goal.row;
    let col = goal.col;
    path.push({ row, col });
    while (row !== start.row || col !== start.col) {
      const prevR = prevRow[row][col];
      const prevC = prevCol[row][col];
      row = prevR;
      col = prevC;
      path.push({ row, col });
    }
    path.reverse();
    return path;
  };

  const buildAssemblyRoute = (start: Vector3, goal: Vector3): AssemblyRoute => {
    const startCell = worldToCell(start);
    const goalCell = worldToCell(goal);
    const cellPath = buildShortestPath(startCell, goalCell);
    const waypoints: Vector3[] = [
      new Vector3(start.x, playerCenterHeight, start.z)
    ];
    for (let index = 1; index < cellPath.length; index += 1) {
      waypoints.push(cellToWorld(cellPath[index], playerCenterHeight));
    }
    waypoints.push(new Vector3(goal.x, playerCenterHeight, goal.z));
    return { waypoints, index: 0 };
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
      sprite.position.y = target.y;
      sprite.position.z = target.z;
      return true;
    }
    const step = Math.min(distance, speed * delta);
    sprite.position.x += (toTarget.x / distance) * step;
    sprite.position.z += (toTarget.z / distance) * step;
    sprite.position.y = target.y;
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
      const x = assemblyCenter.x + Math.cos(angle) * assemblyOrbitRadius;
      const z = assemblyCenter.z + Math.sin(angle) * assemblyOrbitRadius;
      const bob =
        Math.sin(assemblyElapsed * bobSpeed + bit.floatOffset) * 0.4 * unitScale;
      bit.root.position.x = x;
      bit.root.position.y = assemblyOrbitHeight + bob;
      bit.root.position.z = z;
      bit.baseHeight = assemblyOrbitHeight;
      bit.root.lookAt(assemblyCenter);
    }
  };

  const enterAssembly = (mode: AssemblyMode) => {
    stopAlertLoop();
    setBitSpawnEnabled(false);
    clearBeams();
    assemblyElapsed = 0;
    hud.setHudVisible(false);
    hud.setTitleVisible(false);
    hud.setStateInfo("press Enter to title");
    setPlayerState("brainwash-complete-haigure-formation");
    const playerStartPosition = new Vector3(
      camera.position.x,
      playerCenterHeight,
      camera.position.z
    );
    playerAvatar.isVisible = true;
    playerAvatar.cellIndex = 2;
    playerAvatar.position.copyFrom(playerStartPosition);

    const assemblyTargets = createAssemblyTargets(npcs.length + 1);
    assemblyPlayerTarget = assemblyTargets.playerTarget;
    assemblyNpcTargets = assemblyTargets.npcTargets;

    for (const npc of npcs) {
      npc.state = "brainwash-complete-haigure-formation";
      npc.sprite.cellIndex = 2;
      npc.sprite.position.y = playerCenterHeight;
      if (npc.hitEffect) {
        npc.hitEffect.dispose();
        npc.hitEffect = null;
        npc.hitEffectMaterial = null;
      }
      for (const orb of npc.fadeOrbs) {
        orb.mesh.dispose();
      }
      npc.fadeOrbs = [];
    }

    disposePlayerHitEffects();
    for (const bit of bits) {
      finalizeBitVisuals(bit);
    }

    if (mode === "instant") {
      assemblyPlayerRoute = null;
      assemblyNpcRoutes = [];
      playerAvatar.position.copyFrom(assemblyPlayerTarget);
      for (let index = 0; index < npcs.length; index += 1) {
        npcs[index].sprite.position.copyFrom(assemblyNpcTargets[index]);
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

  const updateAssembly = (delta: number) => {
    updateBitsOrbit(delta);
    camera.position.x = playerAvatar.position.x;
    camera.position.z = playerAvatar.position.z;
    camera.position.y = eyeHeight;
    if (getGamePhase() !== "assemblyMove") {
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
  };

  const beginFadeOut = (next: () => void) => {
    fadePhase = "out";
    fadeOpacity = 0;
    fadeNext = next;
    hud.setFadeOpacity(fadeOpacity);
  };

  const updateFade = (delta: number) => {
    if (fadePhase === "none") {
      return;
    }
    const step = delta / fadeDuration;
    if (fadePhase === "out") {
      fadeOpacity = Math.min(1, fadeOpacity + step);
      hud.setFadeOpacity(fadeOpacity);
      if (fadeOpacity >= 1) {
        if (fadeNext) {
          const next = fadeNext;
          fadeNext = null;
          next();
        }
        fadePhase = "in";
      }
      return;
    }
    fadeOpacity = Math.max(0, fadeOpacity - step);
    hud.setFadeOpacity(fadeOpacity);
    if (fadeOpacity <= 0) {
      fadePhase = "none";
    }
  };

  const resetFade = () => {
    fadePhase = "none";
    fadeOpacity = 0;
    fadeNext = null;
    hud.setFadeOpacity(0);
  };

  return {
    enterAssembly,
    updateAssembly,
    beginFadeOut,
    updateFade,
    resetFade
  };
};
