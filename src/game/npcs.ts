import { Color3, Scene, Sprite, SpriteManager, Vector3 } from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import {
  Beam,
  BeamImpactOrb,
  AlertRequest,
  FloorCell,
  MovementBlocker,
  Npc,
  TargetInfo,
  isAliveState,
  isHitState
} from "./types";
import {
  cellToWorld,
  pickRandomCell,
  pickRandomHorizontalDirection
} from "./gridUtils";
import { findTargetById } from "./targetUtils";
import { isBeamHittingTarget } from "./beamCollision";
import {
  createHitEffectMesh,
  createHitFadeOrbs,
  HitFadeOrbConfig,
  updateHitFadeOrbs
} from "./hitEffects";
import { beginBeamRetract } from "./beams";

const npcCellSize = 128;
const npcFrameCount = 4;
const npcSpriteWidth = 2.2;
const npcSpriteHeight = 3.3;
const npcSpriteCenterHeight = npcSpriteHeight / 2;
const npcSearchSpeed = 2.4;
const npcEvadeSpeed = 3.0;
const npcChaseSpeed = 3.6;
const redHitDurationScale = 0.25;
const npcHitDuration = 3;
const npcHitFadeDuration = 1;
const npcHitRadius = npcSpriteWidth * 0.5;
const npcHitEffectDiameter = npcSpriteHeight * 1.2;
const npcHitFlickerInterval = 0.12;
const npcHitColorA = new Color3(1, 0.18, 0.74);
const npcHitColorB = new Color3(0.2, 0.96, 1);
const npcHitEffectAlpha = 0.45;
const npcBrainwashDecisionDelay = 10;
const npcBrainwashStayChance = 0.5;
const npcBrainwashVisionRange = 36;
const npcBrainwashVisionRangeSq = npcBrainwashVisionRange * npcBrainwashVisionRange;
const npcBrainwashVisionCos = Math.cos((95 * Math.PI) / 180);
const npcBrainwashLoseRange = 30;
const npcBrainwashLoseRangeSq = npcBrainwashLoseRange * npcBrainwashLoseRange;
const npcBrainwashFireRange = 18;
const npcBrainwashFireRangeSq = npcBrainwashFireRange * npcBrainwashFireRange;
const npcBrainwashFireIntervalMin = 1.4;
const npcBrainwashFireIntervalMax = 2.2;
const npcBrainwashBlockRadius = npcSpriteWidth * 0.7;
const npcBrainwashBlockDuration = 20;
const npcBrainwashBreakAwayDuration = 2.5;
const npcBrainwashBreakAwaySpeed = 3.2;
const npcTargetArrivalDistance = 0.3;
const hitFadeOrbMinCount = 5;
const hitFadeOrbMaxCount = 20;
const hitFadeOrbDiameter = 0.22;
const hitFadeOrbSurfaceOffsetMin = 0.05;
const hitFadeOrbSurfaceOffsetMax = 0.4;
const hitFadeOrbSpeedMin = 0.25;
const hitFadeOrbSpeedMax = 0.65;
const npcHitFadeOrbConfig: HitFadeOrbConfig = {
  minCount: hitFadeOrbMinCount,
  maxCount: hitFadeOrbMaxCount,
  diameter: hitFadeOrbDiameter,
  surfaceOffsetMin: hitFadeOrbSurfaceOffsetMin,
  surfaceOffsetMax: hitFadeOrbSurfaceOffsetMax,
  speedMin: hitFadeOrbSpeedMin,
  speedMax: hitFadeOrbSpeedMax
};

const createNpcSpritesheet = () => {
  const canvas = document.createElement("canvas");
  canvas.width = npcCellSize * npcFrameCount;
  canvas.height = npcCellSize;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const drawFrame = (
    index: number,
    color: string,
    accent: string,
    gunDot = false
  ) => {
    const offsetX = index * npcCellSize;
    ctx.fillStyle = color;
    ctx.fillRect(offsetX, 0, npcCellSize, npcCellSize);
    ctx.fillStyle = accent;
    ctx.fillRect(offsetX + 24, 22, 80, 84);
    ctx.fillStyle = "#111111";
    ctx.fillRect(offsetX + 42, 44, 12, 12);
    ctx.fillRect(offsetX + 74, 44, 12, 12);
    if (gunDot) {
      ctx.beginPath();
      ctx.arc(offsetX + 96, 86, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawFrame(0, "#3b5fbf", "#f1f1f1");
  drawFrame(1, "#d4a21f", "#f8f2c2");
  drawFrame(2, "#5c5c5c", "#c7c7c7");
  drawFrame(3, "#5c5c5c", "#c7c7c7", true);

  return canvas.toDataURL("image/png");
};

const getNeighborCells = (layout: GridLayout, cell: FloorCell) => {
  const neighbors: FloorCell[] = [];
  const candidates = [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 }
  ];

  for (const candidate of candidates) {
    if (
      candidate.row >= 0 &&
      candidate.row < layout.rows &&
      candidate.col >= 0 &&
      candidate.col < layout.columns &&
      layout.cells[candidate.row][candidate.col] === "floor"
    ) {
      neighbors.push(candidate);
    }
  }

  return neighbors;
};

const pickRandomNeighborCell = (layout: GridLayout, cell: FloorCell) => {
  const neighbors = getNeighborCells(layout, cell);
  return neighbors[Math.floor(Math.random() * neighbors.length)];
};

const pickNeighborCellClosestTo = (
  layout: GridLayout,
  cell: FloorCell,
  targetPosition: Vector3
) => {
  const neighbors = getNeighborCells(layout, cell);
  let bestCell = neighbors[0];
  let bestDistanceSq = Vector3.DistanceSquared(
    cellToWorld(layout, bestCell, npcSpriteCenterHeight),
    targetPosition
  );

  for (let index = 1; index < neighbors.length; index += 1) {
    const candidate = neighbors[index];
    const distanceSq = Vector3.DistanceSquared(
      cellToWorld(layout, candidate, npcSpriteCenterHeight),
      targetPosition
    );
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestCell = candidate;
    }
  }

  return bestCell;
};

const worldToCell = (layout: GridLayout, position: Vector3): FloorCell => {
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  return {
    row: Math.floor((position.z + halfDepth) / layout.cellSize),
    col: Math.floor((position.x + halfWidth) / layout.cellSize)
  };
};

const pickNeighborCellClosestToAvoid = (
  layout: GridLayout,
  cell: FloorCell,
  targetPosition: Vector3,
  avoidCell: FloorCell
) => {
  const neighbors = getNeighborCells(layout, cell).filter(
    (candidate) => candidate.row !== avoidCell.row || candidate.col !== avoidCell.col
  );
  if (neighbors.length === 0) {
    return cell;
  }
  let bestCell = neighbors[0];
  let bestDistanceSq = Vector3.DistanceSquared(
    cellToWorld(layout, bestCell, npcSpriteCenterHeight),
    targetPosition
  );

  for (let index = 1; index < neighbors.length; index += 1) {
    const candidate = neighbors[index];
    const distanceSq = Vector3.DistanceSquared(
      cellToWorld(layout, candidate, npcSpriteCenterHeight),
      targetPosition
    );
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestCell = candidate;
    }
  }

  return bestCell;
};

const pickNeighborCellInDirection = (
  layout: GridLayout,
  cell: FloorCell,
  direction: Vector3
) => {
  const neighbors = getNeighborCells(layout, cell);
  const base = cellToWorld(layout, cell, npcSpriteCenterHeight);
  let bestCell = neighbors[0];
  let bestDot = -Infinity;

  for (const candidate of neighbors) {
    const candidatePosition = cellToWorld(
      layout,
      candidate,
      npcSpriteCenterHeight
    );
    const toCandidate = candidatePosition.subtract(base);
    toCandidate.y = 0;
    const length = toCandidate.length();
    if (length > 0) {
      const dot =
        (toCandidate.x * direction.x + toCandidate.z * direction.z) / length;
      if (dot > bestDot) {
        bestDot = dot;
        bestCell = candidate;
      }
    }
  }

  return bestCell;
};

export const promoteHaigureNpc = (npc: Npc) => {
  const toGun = Math.random() < 0.5;
  npc.state = toGun
    ? "brainwash-complete-gun"
    : "brainwash-complete-no-gun";
  npc.brainwashTimer = 0;
  npc.brainwashMode = "search";
  npc.brainwashTargetId = null;
  npc.wanderTimer = 1 + Math.random() * 2;
  npc.wanderDirection = pickRandomHorizontalDirection();
  npc.moveDirection.copyFrom(npc.wanderDirection);
  npc.blockTimer = 0;
  npc.blockTargetId = null;
  npc.breakAwayTimer = 0;
  npc.breakAwayDirection = pickRandomHorizontalDirection();
  if (npc.state === "brainwash-complete-gun") {
    npc.fireInterval =
      npcBrainwashFireIntervalMin +
      Math.random() *
        (npcBrainwashFireIntervalMax - npcBrainwashFireIntervalMin);
    npc.fireTimer = npc.fireInterval * Math.random();
  }
};

const findVisibleNpcTarget = (npc: Npc, targets: TargetInfo[]) => {
  const forward =
    npc.moveDirection.lengthSquared() > 0.0001
      ? npc.moveDirection
      : npc.wanderDirection;
  let bestTarget: TargetInfo | null = null;
  let bestDistanceSq = 0;

  for (const target of targets) {
    if (!target.alive) {
      continue;
    }
    const toTarget = target.position.subtract(npc.sprite.position);
    const distanceSq = toTarget.lengthSquared();
    if (distanceSq > npcBrainwashVisionRangeSq) {
      continue;
    }
    const distance = Math.sqrt(distanceSq);
    const dot =
      (forward.x * toTarget.x +
        forward.y * toTarget.y +
        forward.z * toTarget.z) /
      distance;
    if (dot < npcBrainwashVisionCos) {
      continue;
    }
    if (!bestTarget || distanceSq < bestDistanceSq) {
      bestTarget = target;
      bestDistanceSq = distanceSq;
    }
  }

  return bestTarget;
};

export const createNpcManager = (
  scene: Scene,
  capacity: number,
  spriteSheetUrl?: string
) =>
  new SpriteManager(
    "npcManager",
    spriteSheetUrl ?? createNpcSpritesheet(),
    capacity,
    { width: npcCellSize, height: npcCellSize },
    scene
  );

export const spawnNpcs = (
  layout: GridLayout,
  floorCells: FloorCell[],
  manager: SpriteManager,
  count: number
) => {
  const npcs: Npc[] = [];

  for (let index = 0; index < count; index += 1) {
    const cell = pickRandomCell(floorCells);
    const position = cellToWorld(layout, cell, npcSpriteCenterHeight);
    const sprite = new Sprite(`npc_${index}`, manager);
    sprite.position = position;
    sprite.width = npcSpriteWidth;
    sprite.height = npcSpriteHeight;
    sprite.isPickable = false;
    sprite.cellIndex = 0;
    const wanderDirection = pickRandomHorizontalDirection();
    const fireInterval =
      npcBrainwashFireIntervalMin +
      Math.random() * (npcBrainwashFireIntervalMax - npcBrainwashFireIntervalMin);

    npcs.push({
      sprite,
      state: "normal",
      voiceId: "00",
      cell,
      target: position.clone(),
      speed: npcSearchSpeed,
      hitTimer: 0,
      fadeTimer: 0,
      hitFadeDuration: npcHitFadeDuration,
      hitById: null,
      hitEffect: null,
      hitEffectMaterial: null,
      fadeOrbs: [],
      brainwashTimer: 0,
      brainwashMode: "search",
      brainwashTargetId: null,
      wanderDirection,
      wanderTimer: 1 + Math.random() * 2,
      moveDirection: wanderDirection.clone(),
      fireTimer: fireInterval * Math.random(),
      fireInterval,
      blockTimer: 0,
      blockTargetId: null,
      breakAwayTimer: 0,
      breakAwayDirection: pickRandomHorizontalDirection(),
      blockedByPlayer: false,
      alertState: "none",
      alertReturnBrainwashMode: null,
      alertReturnTargetId: null
    });
  }

  return npcs;
};

export const updateNpcs = (
  layout: GridLayout,
  floorCells: FloorCell[],
  npcs: Npc[],
  beams: Beam[],
  delta: number,
  elapsed: number,
  targets: TargetInfo[],
  onNpcHit: (position: Vector3) => void,
  spawnNpcBeam: (position: Vector3, direction: Vector3, sourceId: string) => void,
  isRedSource: (sourceId: string | null) => boolean,
  impactOrbs: BeamImpactOrb[],
  blockers: MovementBlocker[]
) => {
  const aliveTargets = targets.filter((target) => target.alive);
  const activeBlockers: MovementBlocker[] = [...blockers];
  let playerBlocked = false;
  const targetedIds = new Set<string>();
  const alertRequests: AlertRequest[] = [];
  const restoreNpcFromAlert = (npc: Npc) => {
    const returnMode = npc.alertReturnBrainwashMode;
    const returnTargetId = npc.alertReturnTargetId;
    npc.alertReturnBrainwashMode = null;
    npc.alertReturnTargetId = null;
    npc.alertState = "none";
    if (returnMode) {
      const target = returnTargetId
        ? findTargetById(aliveTargets, returnTargetId)
        : null;
      if (target || returnMode === "search") {
        npc.brainwashMode = returnMode;
        npc.brainwashTargetId = target ? target.id : null;
        return;
      }
    }
    npc.brainwashMode = "search";
    npc.brainwashTargetId = null;
  };

  for (const npc of npcs) {
    if (npc.state !== "brainwash-complete-no-gun") {
      continue;
    }
    if (npc.breakAwayTimer > 0) {
      continue;
    }
    if (!npc.blockTargetId) {
      continue;
    }
    const blockedTarget = findTargetById(targets, npc.blockTargetId);
    if (!blockedTarget || !blockedTarget.alive) {
      npc.blockTargetId = null;
      npc.blockTimer = 0;
      continue;
    }
    activeBlockers.push({
      position: blockedTarget.position,
      radius: npcBrainwashBlockRadius,
      sourceId: npc.sprite.name
    });
    if (blockedTarget.id === "player") {
      playerBlocked = true;
    }
  }

  for (const npc of npcs) {
    const npcId = npc.sprite.name;
    npc.sprite.position.y = npcSpriteCenterHeight;
    if (npc.state === "brainwash-complete-gun") {
      npc.sprite.cellIndex = 3;
    }
    if (
      (npc.state === "brainwash-complete-gun" ||
        npc.state === "brainwash-complete-no-gun") &&
      npc.alertState === "receive" &&
      npc.brainwashTargetId
    ) {
      const alertTarget = findTargetById(targets, npc.brainwashTargetId);
      if (!alertTarget || !alertTarget.alive) {
        restoreNpcFromAlert(npc);
        continue;
      }
    }

    if (isAliveState(npc.state)) {
      for (const beam of beams) {
        if (!beam.active) {
          continue;
        }
          if (beam.sourceId === npcId) {
            continue;
          }
          if (isBeamHittingTarget(beam, npc.sprite.position, npcHitRadius)) {
            const hitScale = isRedSource(beam.sourceId)
              ? redHitDurationScale
              : 1;
          const impactPosition = beam.tip.position.add(
            Vector3.Normalize(beam.velocity).scale(beam.tipRadius)
          );
          beginBeamRetract(beam, impactPosition);
          npc.state = "hit-a";
          npc.sprite.cellIndex = 1;
          npc.hitTimer = npcHitDuration * hitScale;
            npc.hitFadeDuration = npcHitFadeDuration * hitScale;
            npc.fadeTimer = 0;
            npc.hitById = beam.sourceId;
            const scene = npc.sprite.manager.scene;
            const { mesh: effect, material } = createHitEffectMesh(scene, {
              name: `npcHit_${npc.sprite.name}`,
              diameter: npcHitEffectDiameter,
              color: npcHitColorA,
              alpha: npcHitEffectAlpha
            });
            effect.position.copyFrom(npc.sprite.position);
            npc.hitEffect = effect;
            npc.hitEffectMaterial = material;
            onNpcHit(npc.sprite.position);
            break;
          }
      }
    }

    if (isHitState(npc.state)) {
      npc.hitTimer -= delta;
      if (npc.hitTimer > 0) {
        if (npc.hitEffect) {
          npc.hitEffect.position.copyFrom(npc.sprite.position);
          if (npc.hitEffectMaterial) {
            const phase =
              Math.floor(elapsed / npcHitFlickerInterval) % 2 === 0;
            const color = phase ? npcHitColorA : npcHitColorB;
            npc.hitEffectMaterial.emissiveColor.copyFrom(color);
            npc.hitEffectMaterial.diffuseColor.copyFrom(color);
            npc.hitEffectMaterial.alpha = npcHitEffectAlpha;
            npc.state = phase ? "hit-a" : "hit-b";
          }
        }
        continue;
      }

        if (npc.fadeTimer === 0) {
          npc.fadeTimer = npc.hitFadeDuration;
          npc.sprite.cellIndex = 2;
          npc.fadeOrbs = createHitFadeOrbs(
            npc.sprite.manager.scene,
            npc.sprite.position.clone(),
            npc.hitEffectMaterial!,
            npcHitEffectDiameter / 2,
            npcHitFadeOrbConfig
          );
        }
      npc.state = "hit-a";

      npc.fadeTimer = Math.max(0, npc.fadeTimer - delta);
      if (npc.hitEffect) {
        npc.hitEffect.position.copyFrom(npc.sprite.position);
      }
        if (npc.hitEffectMaterial) {
          npc.hitEffectMaterial.emissiveColor.copyFrom(npcHitColorA);
          npc.hitEffectMaterial.diffuseColor.copyFrom(npcHitColorA);
          npc.hitEffectMaterial.alpha =
            npcHitEffectAlpha * (npc.fadeTimer / npc.hitFadeDuration);
        }
        const fadeScale = npc.fadeTimer / npc.hitFadeDuration;
        updateHitFadeOrbs(npc.fadeOrbs, delta, fadeScale);
        if (npc.fadeTimer <= 0) {
          npc.state = "brainwash-in-progress";
        npc.brainwashTimer = 0;
        npc.brainwashMode = "search";
        npc.brainwashTargetId = null;
        npc.blockTimer = 0;
        npc.blockTargetId = null;
        npc.breakAwayTimer = 0;
        npc.alertState = "none";
        npc.alertReturnBrainwashMode = null;
        npc.alertReturnTargetId = null;
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
      continue;
    }

    if (npc.state === "brainwash-in-progress") {
      npc.brainwashTimer += delta;
      if (npc.brainwashTimer >= npcBrainwashDecisionDelay) {
        if (Math.random() < npcBrainwashStayChance) {
          npc.brainwashTimer = 0;
        } else {
          npc.state = "brainwash-complete-haigure";
          npc.brainwashTimer = 0;
        }
      }
      continue;
    }

    if (npc.state === "brainwash-complete-haigure") {
      npc.brainwashTimer += delta;
      if (npc.brainwashTimer >= npcBrainwashDecisionDelay) {
        promoteHaigureNpc(npc);
      }
      continue;
    }

    if (npc.state === "brainwash-complete-haigure-formation") {
      continue;
    }

    if (isAliveState(npc.state)) {
      let blocked = false;
      let blockedByPlayer = false;
      for (const blocker of activeBlockers) {
        const dx = npc.sprite.position.x - blocker.position.x;
        const dz = npc.sprite.position.z - blocker.position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq <= blocker.radius * blocker.radius) {
          blocked = true;
          blockedByPlayer = blocker.sourceId === "player";
          break;
        }
      }
      if (blockedByPlayer && !npc.blockedByPlayer) {
        alertRequests.push({ targetId: npcId, blockerId: "player" });
      }
      if (npc.alertState !== "receive") {
        npc.alertState = blockedByPlayer ? "send" : "none";
      }
      npc.blockedByPlayer = blockedByPlayer;
      if (blocked) {
        continue;
      }

      const toTarget = npc.target.subtract(npc.sprite.position);
      toTarget.y = 0;
      const distance = Math.hypot(toTarget.x, toTarget.z);

      if (distance < npcTargetArrivalDistance) {
        npc.cell = pickRandomNeighborCell(layout, npc.cell);
        npc.target = cellToWorld(layout, npc.cell, npcSpriteCenterHeight);
        continue;
      }

      const direction = toTarget.normalize();
      npc.moveDirection.copyFrom(direction);
      const moveSpeed = npc.state === "evade" ? npcEvadeSpeed : npc.speed;
      const move = direction.scale(moveSpeed * delta);
      npc.sprite.position.addInPlace(move);
      continue;
    }

    const brainwashTargets = aliveTargets.filter(
      (target) => target.id !== npcId
    );

    if (npc.state === "brainwash-complete-no-gun") {
      if (npc.blockTargetId) {
        if (npc.alertState !== "receive") {
          npc.alertState = "send";
        }
        const blockedTarget = findTargetById(targets, npc.blockTargetId);
        if (!blockedTarget || !blockedTarget.alive) {
          npc.blockTargetId = null;
          npc.blockTimer = 0;
          if (npc.alertState === "send") {
            npc.alertState = "none";
          }
        } else {
          npc.blockTimer += delta;
          if (npc.blockTimer >= npcBrainwashBlockDuration) {
            const away = npc.sprite.position.subtract(blockedTarget.position);
            away.y = 0;
            npc.breakAwayDirection =
              away.lengthSquared() > 0.0001
                ? away.normalize()
                : pickRandomHorizontalDirection();
            npc.breakAwayTimer = npcBrainwashBreakAwayDuration;
            npc.blockTimer = 0;
            npc.blockTargetId = null;
            if (npc.alertState === "send") {
              npc.alertState = "none";
            }
            npc.brainwashMode = "search";
            npc.brainwashTargetId = null;
            npc.cell = pickNeighborCellInDirection(
              layout,
              npc.cell,
              npc.breakAwayDirection
            );
            npc.target = cellToWorld(layout, npc.cell, npcSpriteCenterHeight);
          }
        }
        continue;
      }

      if (npc.breakAwayTimer > 0) {
        if (npc.alertState === "send") {
          npc.alertState = "none";
        }
        npc.breakAwayTimer = Math.max(0, npc.breakAwayTimer - delta);
        let toTarget = npc.target.subtract(npc.sprite.position);
        toTarget.y = 0;
        let distance = Math.hypot(toTarget.x, toTarget.z);
        if (distance < npcTargetArrivalDistance) {
          npc.cell = pickNeighborCellInDirection(
            layout,
            npc.cell,
            npc.breakAwayDirection
          );
          npc.target = cellToWorld(layout, npc.cell, npcSpriteCenterHeight);
          toTarget = npc.target.subtract(npc.sprite.position);
          toTarget.y = 0;
          distance = Math.hypot(toTarget.x, toTarget.z);
        }
        if (distance >= 0.001) {
          const direction = toTarget.normalize();
          npc.moveDirection.copyFrom(direction);
          npc.sprite.position.addInPlace(
            direction.scale(npcBrainwashBreakAwaySpeed * delta)
          );
        }
        if (npc.breakAwayTimer <= 0) {
          npc.brainwashMode = "search";
          npc.brainwashTargetId = null;
        }
        continue;
      }
    }

    let currentTarget = findTargetById(targets, npc.brainwashTargetId);
    if (!currentTarget || !currentTarget.alive || currentTarget.id === npcId) {
      currentTarget = null;
    }

    if (npc.brainwashMode === "search") {
      if (brainwashTargets.length > 0) {
        const visibleTarget = findVisibleNpcTarget(npc, brainwashTargets);
        if (visibleTarget) {
          npc.brainwashMode = "chase";
          npc.brainwashTargetId = visibleTarget.id;
          currentTarget = visibleTarget;
        }
      }
    } else if (!currentTarget) {
      npc.brainwashMode = "search";
      npc.brainwashTargetId = null;
    } else {
      const distanceSq = Vector3.DistanceSquared(
        npc.sprite.position,
        currentTarget.position
      );
      if (distanceSq > npcBrainwashLoseRangeSq) {
        npc.brainwashMode = "search";
        npc.brainwashTargetId = null;
        currentTarget = null;
      }
    }

    if (
      (npc.state === "brainwash-complete-gun" ||
        npc.state === "brainwash-complete-no-gun") &&
      npc.brainwashMode === "chase" &&
      currentTarget
    ) {
      targetedIds.add(currentTarget.id);
    }

    let toTarget = npc.target.subtract(npc.sprite.position);
    toTarget.y = 0;
    let distance = Math.hypot(toTarget.x, toTarget.z);

    if (distance < npcTargetArrivalDistance) {
      if (npc.brainwashMode === "chase" && currentTarget) {
        if (npc.state === "brainwash-complete-gun") {
          const targetCell = worldToCell(layout, currentTarget.position);
          npc.cell = pickNeighborCellClosestToAvoid(
            layout,
            npc.cell,
            currentTarget.position,
            targetCell
          );
        } else {
          npc.cell = pickNeighborCellClosestTo(
            layout,
            npc.cell,
            currentTarget.position
          );
        }
      } else {
        npc.cell = pickRandomNeighborCell(layout, npc.cell);
      }
      npc.target = cellToWorld(layout, npc.cell, npcSpriteCenterHeight);
      toTarget = npc.target.subtract(npc.sprite.position);
      toTarget.y = 0;
      distance = Math.hypot(toTarget.x, toTarget.z);
    }

    if (distance >= 0.001) {
      const direction = toTarget.normalize();
      npc.moveDirection.copyFrom(direction);
      const moveSpeed =
        npc.brainwashMode === "chase" ? npcChaseSpeed : npc.speed;
      const move = direction.scale(moveSpeed * delta);
      npc.sprite.position.addInPlace(move);
    }

    if (npc.state === "brainwash-complete-gun") {
      if (npc.brainwashMode === "chase" && currentTarget) {
        const distanceSq = Vector3.DistanceSquared(
          npc.sprite.position,
          currentTarget.position
        );
        if (distanceSq <= npcBrainwashFireRangeSq) {
          npc.fireTimer -= delta;
          if (npc.fireTimer <= 0) {
            const fireDirection = currentTarget.position.subtract(
              npc.sprite.position
            );
            if (fireDirection.lengthSquared() > 0.0001) {
              spawnNpcBeam(
                npc.sprite.position.clone(),
                fireDirection.normalize(),
                npcId
              );
            }
            npc.fireInterval =
              npcBrainwashFireIntervalMin +
              Math.random() *
                (npcBrainwashFireIntervalMax - npcBrainwashFireIntervalMin);
            npc.fireTimer = npc.fireInterval;
          }
        }
      }
      continue;
    }

    if (npc.state === "brainwash-complete-no-gun") {
      if (npc.brainwashMode === "chase" && currentTarget) {
        const distanceSq = Vector3.DistanceSquared(
          npc.sprite.position,
          currentTarget.position
        );
        if (distanceSq <= npcBrainwashBlockRadius * npcBrainwashBlockRadius) {
          if (npc.alertState !== "receive") {
            npc.alertState = "send";
          }
          npc.blockTargetId = currentTarget.id;
          npc.blockTimer = 0;
          alertRequests.push({
            targetId: currentTarget.id,
            blockerId: npcId
          });
        }
      }
    }
  }

  return { playerBlocked, targetedIds, alertRequests };
};
