import {
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import {
  AlertSignal,
  Bit,
  BitMaterials,
  BitMode,
  BitSoundEvents,
  FloorCell,
  StageBounds,
  TargetInfo,
  isHitState
} from "./types";
import {
  cellToWorld,
  pickRandomCell,
  pickRandomHorizontalDirection
} from "./gridUtils";
import { findTargetById } from "./targetUtils";

const bitVisionRange = 80;
const bitBaseSpeed = 2.4;
const bitSearchSpeed = 3;
const bitChaseSpeed = 1.8;
const bitVisionCos = Math.cos((5 * Math.PI) / 6);
const bitChaseFireRange = 10;
const bitChaseLoseRange = 20;
const bitFixedLoseRange = 24;
const bitChaseDuration = 6;
const bitFixedDuration = 5;
const alertGatherTargetCount = 4;
const alertGatherRadius = 6;
const alertGiveUpDuration = 20;
const alertReceiveSpeedMultiplier = 3;
const bitRandomDuration = 5;
const bitInitialFireDelayFactor = 0.35;
const bitWallProximityRadius = 0.9;
const bitWanderVerticalAmplitude = 0.12;
const bitWanderTimerMin = 0.6;
const bitWanderTimerMax = 1.2;
const bitBobAmplitude = 0.25;
const carpetFormationSpacing = 3;
const carpetBombSpeed = 4.5;
const carpetBombSpread = 0.4;
const carpetBombFireIntervalMin = 0.225;
const carpetBombFireIntervalMax = 0.425;
const carpetBombPassDelay = 2.5;
const carpetBombSteerStrength = 0.12;
const carpetBombAimScatter = 0.35;
const carpetBombAimRange = 10;
const carpetBombAimBlend = 0.2;

const pickBitWanderDirection = () => {
  const angle = Math.random() * Math.PI * 2;
  return new Vector3(
    Math.cos(angle),
    Math.random() * (bitWanderVerticalAmplitude * 2) - bitWanderVerticalAmplitude,
    Math.sin(angle)
  );
};

const findVisibleTarget = (bit: Bit, targets: TargetInfo[]) => {
  const forward = bit.root.getDirection(new Vector3(0, 0, 1));
  let bestTarget: TargetInfo | null = null;
  let bestDistanceSq = 0;
  const range = bitVisionRange * bit.statMultiplier;
  const rangeSq = range * range;

  for (const target of targets) {
    if (!target.alive) {
      continue;
    }
    const toTarget = target.position.subtract(bit.root.position);
    const distanceSq = toTarget.lengthSquared();
    if (distanceSq > rangeSq) {
      continue;
    }
    const distance = Math.sqrt(distanceSq);
    const dot =
      (forward.x * toTarget.x + forward.y * toTarget.y + forward.z * toTarget.z) /
      distance;
    if (dot < bitVisionCos) {
      continue;
    }
    if (!bestTarget || distanceSq < bestDistanceSq) {
      bestTarget = target;
      bestDistanceSq = distanceSq;
    }
  }

  return bestTarget;
};

const chooseAttackMode = (bit: Bit): BitMode => {
  const roll = Math.random();
  if (bit.isRed) {
    return roll < 0.95 ? "attack-chase" : "carpet-bomb";
  }
  if (roll < 0.4) {
    return "attack-chase";
  }
  if (roll < 0.6) {
    return "attack-fixed";
  }
  if (roll < 0.75) {
    return "attack-random";
  }
  if (roll < 0.9) {
    return "alert";
  }
  return "carpet-bomb";
};

const chooseAlertFollowMode = (bit: Bit): BitMode => {
  const roll = Math.random();
  if (bit.isRed) {
    return roll < 0.95 ? "attack-chase" : "carpet-bomb";
  }
  const scaled = roll * 0.85;
  if (scaled < 0.4) {
    return "attack-chase";
  }
  if (scaled < 0.6) {
    return "attack-fixed";
  }
  if (scaled < 0.75) {
    return "attack-random";
  }
  return "carpet-bomb";
};

const setBitMode = (
  bit: Bit,
  mode: BitMode,
  target: TargetInfo | null,
  alertSignal: AlertSignal,
  soundEvents: BitSoundEvents
) => {
  if (mode === "alert" && bit.mode !== "alert") {
    soundEvents.onAlert(bit);
  }
  if (target?.id === "player" && bit.targetId !== "player") {
    soundEvents.onTargetPlayer(bit);
  }
  bit.mode = mode;
  bit.targetId = target ? target.id : null;

  if (mode === "attack-chase") {
    bit.fireInterval = (2.0 + Math.random() * 0.8) / bit.statMultiplier;
    bit.fireTimer = bit.fireInterval * bitInitialFireDelayFactor;
    bit.modeTimer = bitChaseDuration;
    return;
  }

  if (mode === "attack-fixed") {
    if (target) {
      const locked = target.position.subtract(bit.root.position);
      locked.y = 0;
      bit.lockedDirection = locked.normalize();
    }
    bit.fireInterval = (1.0 + Math.random() * 0.6) / bit.statMultiplier;
    bit.fireTimer = bit.fireInterval * bitInitialFireDelayFactor;
    bit.modeTimer = bitFixedDuration;
    return;
  }

  if (mode === "attack-random") {
    bit.fireInterval = (0.4 + Math.random() * 0.4) / bit.statMultiplier;
    bit.fireTimer = bit.fireInterval * bitInitialFireDelayFactor;
    bit.modeTimer = bitRandomDuration;
    return;
  }

  if (mode === "alert") {
    bit.fireInterval = 0;
    bit.fireTimer = 0;
    bit.modeTimer = alertGiveUpDuration;
    return;
  }

  bit.fireInterval = 0;
  bit.fireTimer = 0;
  bit.modeTimer = 0;
};

const initializeCarpetBit = (
  bit: Bit,
  leaderId: string,
  targetId: string,
  direction: Vector3,
  offset: Vector3
) => {
  bit.mode = "carpet-bomb";
  bit.targetId = targetId;
  bit.carpetLeaderId = leaderId;
  bit.carpetTargetId = targetId;
  bit.carpetDirection.copyFrom(direction);
  bit.carpetOffset.copyFrom(offset);
  bit.carpetPassTimer = 0;
  bit.fireInterval =
    (carpetBombFireIntervalMin +
      Math.random() * (carpetBombFireIntervalMax - carpetBombFireIntervalMin)) /
    bit.statMultiplier;
  bit.fireTimer = bit.fireInterval * Math.random();
  bit.modeTimer = 0;
};

const clearCarpetState = (bit: Bit) => {
  bit.carpetLeaderId = null;
  bit.carpetTargetId = null;
  bit.carpetPassTimer = 0;
  bit.carpetOffset = new Vector3(0, 0, 0);
  bit.canSpawnCarpet = true;
};

export const createBitMaterials = (scene: Scene): BitMaterials => {
  const body = new StandardMaterial("bitBodyMaterial", scene);
  body.diffuseColor = new Color3(0.2, 0.2, 0.2);
  body.emissiveColor = new Color3(0.04, 0.04, 0.04);

  const nozzle = new StandardMaterial("bitNozzleMaterial", scene);
  nozzle.diffuseColor = new Color3(0.12, 0.12, 0.12);
  nozzle.emissiveColor = new Color3(0.06, 0.06, 0.06);

  return { body, nozzle };
};

const createBitRoot = (
  scene: Scene,
  materials: BitMaterials,
  index: number
) => {
  const root = new TransformNode(`bit_${index}`, scene);
  const bodyHeight = 1.8;
  const body = MeshBuilder.CreateCylinder(
    `bitBody_${index}`,
    {
      diameterTop: 0,
      diameterBottom: 1.4,
      height: bodyHeight,
      tessellation: 24
    },
    scene
  );
  body.parent = root;
  body.material = materials.body;
  body.rotation.x = Math.PI / 2;

  const muzzle = MeshBuilder.CreateSphere(
    `bitMuzzle_${index}`,
    { diameter: 0.45, segments: 16 },
    scene
  );
  muzzle.parent = root;
  muzzle.position.z = bodyHeight / 2 + 0.25;
  muzzle.material = materials.nozzle;

  return { root, muzzle };
};

export const createBit = (
  scene: Scene,
  layout: GridLayout,
  floorCells: FloorCell[],
  materials: BitMaterials,
  index: number
): Bit => {
  const cell = pickRandomCell(floorCells);
  const baseHeight = 3 + Math.random() * 2.5;
  const position = cellToWorld(layout, cell, baseHeight);
  const { root, muzzle } = createBitRoot(scene, materials, index);
  root.position = position;

  const wanderDirection = pickBitWanderDirection();

  return {
    id: root.name,
    root,
    muzzle,
    mode: "search",
    targetId: null,
    isRed: false,
    statMultiplier: 1,
    carpetLeaderId: null,
    carpetOffset: new Vector3(0, 0, 0),
    carpetTargetId: null,
    carpetDirection: new Vector3(0, 0, 1),
    carpetPassTimer: 0,
    lockedDirection: new Vector3(0, 0, 1),
    holdDirection: new Vector3(0, 0, 1),
    modeTimer: 0,
    speed: bitBaseSpeed,
    canSpawnCarpet: true,
    wanderDirection,
    wanderTimer:
      bitWanderTimerMin +
      Math.random() * (bitWanderTimerMax - bitWanderTimerMin),
    fireTimer: 0.6 + Math.random() * 1.2,
    fireInterval: 1.1 + Math.random() * 1.4,
    floatOffset: Math.random() * Math.PI * 2,
    baseHeight,
    isMoving: false
  };
};

export const createBitAt = (
  scene: Scene,
  materials: BitMaterials,
  index: number,
  position: Vector3,
  direction?: Vector3
): Bit => {
  const { root, muzzle } = createBitRoot(scene, materials, index);
  root.position.copyFrom(position);
  const wanderDirection =
    direction && direction.lengthSquared() > 0.0001
      ? direction.normalize()
      : pickRandomHorizontalDirection();

  return {
    id: root.name,
    root,
    muzzle,
    mode: "search",
    targetId: null,
    isRed: false,
    statMultiplier: 1,
    carpetLeaderId: null,
    carpetOffset: new Vector3(0, 0, 0),
    carpetTargetId: null,
    carpetDirection: new Vector3(0, 0, 1),
    carpetPassTimer: 0,
    lockedDirection: new Vector3(0, 0, 1),
    holdDirection: new Vector3(0, 0, 1),
    modeTimer: 0,
    speed: bitBaseSpeed,
    canSpawnCarpet: true,
    wanderDirection,
    wanderTimer:
      bitWanderTimerMin +
      Math.random() * (bitWanderTimerMax - bitWanderTimerMin),
    fireTimer: 0.6 + Math.random() * 1.2,
    fireInterval: 1.1 + Math.random() * 1.4,
    floatOffset: Math.random() * Math.PI * 2,
    baseHeight: position.y,
    isMoving: false
  };
};

export const spawnBits = (
  scene: Scene,
  layout: GridLayout,
  floorCells: FloorCell[],
  materials: BitMaterials,
  count: number
) => {
  const bits: Bit[] = [];
  for (let index = 0; index < count; index += 1) {
    bits.push(createBit(scene, layout, floorCells, materials, index));
  }
  return bits;
};

export const updateBits = (
  layout: GridLayout,
  bits: Bit[],
  delta: number,
  elapsed: number,
  targets: TargetInfo[],
  bounds: StageBounds,
  alertSignal: AlertSignal,
  alertRequests: string[],
  spawnCarpetBit: (position: Vector3, direction: Vector3) => Bit | null,
  spawnBeam: (position: Vector3, direction: Vector3, sourceId: string) => void,
  soundEvents: BitSoundEvents
) => {
  const minX = bounds.minX + layout.cellSize;
  const maxX = bounds.maxX - layout.cellSize;
  const minZ = bounds.minZ + layout.cellSize;
  const maxZ = bounds.maxZ - layout.cellSize;
  const minY = bounds.minY + 1.6;
  const maxY = bounds.maxY - 1.4;
  const halfWidth = (layout.columns * layout.cellSize) / 2;
  const halfDepth = (layout.rows * layout.cellSize) / 2;
  const avoidRadius = 3;
  const avoidRadiusSq = avoidRadius * avoidRadius;
  const wallRadius = bitWallProximityRadius;
  const wallRadiusSq = wallRadius * wallRadius;
  const worldToCell = (position: Vector3) => {
    const row = Math.max(
      0,
      Math.min(
        layout.rows - 1,
        Math.floor((position.z + halfDepth) / layout.cellSize)
      )
    );
    const col = Math.max(
      0,
      Math.min(
        layout.columns - 1,
        Math.floor((position.x + halfWidth) / layout.cellSize)
      )
    );
    return { row, col };
  };
  const isFloorAt = (x: number, z: number) => {
    const col = Math.floor((x + halfWidth) / layout.cellSize);
    const row = Math.floor((z + halfDepth) / layout.cellSize);
    if (row < 0 || row >= layout.rows || col < 0 || col >= layout.columns) {
      return false;
    }
    return layout.cells[row][col] === "floor";
  };
  const isWallNear = (position: Vector3) => {
    const minCol = Math.max(
      0,
      Math.floor((position.x - wallRadius + halfWidth) / layout.cellSize)
    );
    const maxCol = Math.min(
      layout.columns - 1,
      Math.floor((position.x + wallRadius + halfWidth) / layout.cellSize)
    );
    const minRow = Math.max(
      0,
      Math.floor((position.z - wallRadius + halfDepth) / layout.cellSize)
    );
    const maxRow = Math.min(
      layout.rows - 1,
      Math.floor((position.z + wallRadius + halfDepth) / layout.cellSize)
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        if (layout.cells[row][col] !== "wall") {
          continue;
        }
        const cellMinX = -halfWidth + col * layout.cellSize;
        const cellMaxX = cellMinX + layout.cellSize;
        const cellMinZ = -halfDepth + row * layout.cellSize;
        const cellMaxZ = cellMinZ + layout.cellSize;
        let dx = 0;
        if (position.x < cellMinX) {
          dx = cellMinX - position.x;
        } else if (position.x > cellMaxX) {
          dx = position.x - cellMaxX;
        }
        let dz = 0;
        if (position.z < cellMinZ) {
          dz = cellMinZ - position.z;
        } else if (position.z > cellMaxZ) {
          dz = position.z - cellMaxZ;
        }
        if (dx * dx + dz * dz <= wallRadiusSq) {
          return true;
        }
      }
    }
    return false;
  };
  const getChaseDirection = (from: Vector3, to: Vector3) => {
    const start = worldToCell(from);
    const goal = worldToCell(to);
    if (start.row === goal.row && start.col === goal.col) {
      return to.subtract(from).normalize();
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
      return to.subtract(from).normalize();
    }

    let row = goal.row;
    let col = goal.col;
    let prevR = prevRow[row][col];
    let prevC = prevCol[row][col];
    while (
      prevR !== -1 &&
      prevC !== -1 &&
      (prevR !== start.row || prevC !== start.col)
    ) {
      row = prevR;
      col = prevC;
      prevR = prevRow[row][col];
      prevC = prevCol[row][col];
    }

    const nextCell = { row, col };
    const nextPosition = cellToWorld(layout, nextCell, from.y);
    const direction = nextPosition.subtract(from);
    return direction.lengthSquared() > 0.0001
      ? direction.normalize()
      : to.subtract(from).normalize();
  };

  const aliveTargets = targets.filter((target) => target.alive);
  const spawnedBits: Bit[] = [];
  let alertLeader = alertSignal.leaderId
    ? bits.find((candidate) => candidate.id === alertSignal.leaderId) ?? null
    : null;
  let alertTarget = alertSignal.targetId
    ? findTargetById(targets, alertSignal.targetId)
    : null;
  let alertActive =
    alertLeader !== null && alertTarget !== null && alertTarget.alive;
  const clearAlertSignal = () => {
    alertSignal.leaderId = null;
    alertSignal.targetId = null;
    alertSignal.requiredCount = 0;
    alertSignal.receiverIds = [];
    alertSignal.gatheredIds = new Set();
    alertLeader = null;
    alertTarget = null;
    alertActive = false;
  };
  const enterAlert = (bit: Bit, target: TargetInfo, isLeader: boolean) => {
    if (isLeader) {
      soundEvents.onAlert(bit);
    }
    if (target.id === "player" && bit.targetId !== "player") {
      soundEvents.onTargetPlayer(bit);
    }
    if (bit.mode === "carpet-bomb") {
      clearCarpetState(bit);
    }
    bit.mode = "alert";
    bit.targetId = target.id;
    bit.modeTimer = alertGiveUpDuration;
    bit.fireInterval = 0;
    bit.fireTimer = 0;
  };
  const startAlert = (bit: Bit, target: TargetInfo) => {
    if (alertSignal.leaderId) {
      return false;
    }
    const candidates = bits.filter(
      (candidate) => candidate.id !== bit.id && candidate.mode !== "alert"
    );
    candidates.sort((a, b) => {
      const aDistance = Vector3.DistanceSquared(
        a.root.position,
        bit.root.position
      );
      const bDistance = Vector3.DistanceSquared(
        b.root.position,
        bit.root.position
      );
      return aDistance - bDistance;
    });
    const receiverCount = Math.min(
      alertGatherTargetCount,
      candidates.length
    );
    if (receiverCount === 0) {
      return false;
    }
    const receivers = candidates.slice(0, receiverCount);
    alertSignal.leaderId = bit.id;
    alertSignal.targetId = target.id;
    alertSignal.receiverIds = receivers.map((receiver) => receiver.id);
    alertSignal.gatheredIds = new Set();
    alertSignal.requiredCount = receivers.length;
    alertLeader = bit;
    alertTarget = target;
    alertActive = true;
    enterAlert(bit, target, true);
    for (const receiver of receivers) {
      enterAlert(receiver, target, false);
    }
    return true;
  };
  const cancelAlert = () => {
    for (const bit of bits) {
      if (bit.mode === "alert") {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
      }
    }
    clearAlertSignal();
  };
  const startCarpetBomb = (bit: Bit, target: TargetInfo) => {
    if (target.id === "player" && bit.targetId !== "player") {
      soundEvents.onTargetPlayer(bit);
    }
    const toTarget = target.position.subtract(bit.root.position);
    toTarget.y = 0;
    let forward = toTarget;
    if (forward.lengthSquared() <= 0.0001) {
      forward = bit.root.getDirection(new Vector3(0, 0, 1));
    }
    forward.y = 0;
    forward.normalize();
    const scatter = (Math.random() - 0.5) * carpetBombAimScatter;
    const initialRight = new Vector3(-forward.z, 0, forward.x);
    forward = forward.add(initialRight.scale(scatter)).normalize();
    const right = new Vector3(-forward.z, 0, forward.x);

    initializeCarpetBit(
      bit,
      bit.id,
      target.id,
      forward,
      new Vector3(0, 0, 0)
    );
    if (!bit.canSpawnCarpet) {
      return;
    }

    const offsets = [-carpetFormationSpacing, carpetFormationSpacing];
    for (const offset of offsets) {
      const spawnPosition = bit.root.position.add(right.scale(offset));
      const newBit = spawnCarpetBit(spawnPosition, forward);
      if (!newBit) {
        continue;
      }
      newBit.canSpawnCarpet = false;
      initializeCarpetBit(
        newBit,
        bit.id,
        target.id,
        forward,
        new Vector3(offset, 0, 0)
      );
      spawnedBits.push(newBit);
    }
  };

  if (!alertSignal.leaderId && alertRequests.length > 0) {
    for (const requestId of alertRequests) {
      const alertTargetCandidate = findTargetById(aliveTargets, requestId);
      if (!alertTargetCandidate) {
        continue;
      }
      const candidates = bits.filter((candidate) => candidate.mode !== "alert");
      if (candidates.length === 0) {
        break;
      }
      let leader = candidates[0];
      let bestDistanceSq = Vector3.DistanceSquared(
        leader.root.position,
        alertTargetCandidate.position
      );
      for (let index = 1; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const distanceSq = Vector3.DistanceSquared(
          candidate.root.position,
          alertTargetCandidate.position
        );
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          leader = candidate;
        }
      }
      if (startAlert(leader, alertTargetCandidate)) {
        break;
      }
    }
  }

  if (alertSignal.leaderId && (!alertLeader || alertLeader.mode !== "alert")) {
    cancelAlert();
  }
  if (alertSignal.leaderId && (!alertTarget || !alertTarget.alive)) {
    cancelAlert();
  }

  alertActive = alertLeader !== null && alertTarget !== null && alertTarget.alive;

  for (const bit of bits) {
    let moveDirection = bit.wanderDirection;
    let aimDirection = bit.wanderDirection.clone();
    let canFire = false;
    let moveSpeed = bit.speed;
    const hitTarget = targets.find(
      (target) => target.hitById === bit.id && isHitState(target.state)
    );

    if (bit.mode !== "alert") {
      if (hitTarget && bit.mode !== "hold") {
        bit.mode = "hold";
        bit.targetId = hitTarget.id;
        bit.holdDirection = bit.root.getDirection(new Vector3(0, 0, 1));
      } else if (!hitTarget && bit.mode === "hold") {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
      }
    }

    if (bit.mode === "hold") {
      moveDirection = new Vector3(0, 0, 0);
      aimDirection = bit.holdDirection.clone();
      canFire = false;
    } else if (bit.mode === "search") {
      bit.wanderTimer -= delta;
      if (bit.wanderTimer <= 0) {
        bit.wanderDirection = pickBitWanderDirection();
        bit.wanderTimer =
          bitWanderTimerMin +
          Math.random() * (bitWanderTimerMax - bitWanderTimerMin);
      }
      moveDirection = bit.wanderDirection;
      aimDirection = bit.wanderDirection.clone();
      moveSpeed = bitSearchSpeed * bit.statMultiplier;

      const visibleTarget = findVisibleTarget(bit, aliveTargets);
      if (visibleTarget) {
        const nextMode = chooseAttackMode(bit);
        if (nextMode === "alert") {
          if (!startAlert(bit, visibleTarget)) {
            setBitMode(
              bit,
              "attack-chase",
              visibleTarget,
              alertSignal,
              soundEvents
            );
          }
        } else if (nextMode === "carpet-bomb") {
          startCarpetBomb(bit, visibleTarget);
        } else {
          setBitMode(bit, nextMode, visibleTarget, alertSignal, soundEvents);
        }
        continue;
      }
    } else if (bit.mode === "alert") {
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        if (bit.id === alertSignal.leaderId) {
          cancelAlert();
          continue;
        }
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      if (!alertActive || !alertLeader || !alertTarget) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const toLeader = alertLeader.root.position.subtract(bit.root.position);
      toLeader.y = 0;
      const distance = Math.hypot(toLeader.x, toLeader.z);
      if (bit.id === alertLeader.id) {
        moveDirection = new Vector3(0, 0, 0);
        aimDirection = new Vector3(0, 1, 0);
        canFire = false;
      } else {
        const receiveMultiplier = bit.isRed ? 1 : alertReceiveSpeedMultiplier;
        moveSpeed = bitSearchSpeed * bit.statMultiplier * receiveMultiplier;
        if (distance <= alertGatherRadius) {
          if (!alertSignal.gatheredIds.has(bit.id)) {
            alertSignal.gatheredIds.add(bit.id);
          }
          const nextMode = chooseAlertFollowMode(bit);
          if (nextMode === "carpet-bomb") {
            startCarpetBomb(bit, alertTarget);
          } else {
            setBitMode(bit, nextMode, alertTarget, alertSignal, soundEvents);
          }
          continue;
        }
        moveDirection = getChaseDirection(
          bit.root.position,
          alertLeader.root.position
        );
        if (distance > 0.001) {
          aimDirection = toLeader.normalize();
        } else {
          const forward = bit.root.getDirection(new Vector3(0, 0, 1));
          forward.y = 0;
          aimDirection =
            forward.lengthSquared() > 0.0001 ? forward.normalize() : forward;
        }
        canFire = false;
      }
    } else if (bit.mode === "attack-chase") {
      moveSpeed = bitChaseSpeed * bit.statMultiplier;
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const target = findTargetById(aliveTargets, bit.targetId);
      if (!target) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const distanceSq = Vector3.DistanceSquared(
        bit.root.position,
        target.position
      );
      const distance = Math.sqrt(distanceSq);
      if (distance > bitChaseLoseRange) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const targetDirection = target.position
        .subtract(bit.root.position)
        .normalize();
      const chaseDirection = getChaseDirection(
        bit.root.position,
        target.position
      );
      moveDirection = chaseDirection;
      aimDirection = chaseDirection;
      const forward = bit.root.getDirection(new Vector3(0, 0, 1));
      const dot =
        forward.x * targetDirection.x +
        forward.y * targetDirection.y +
        forward.z * targetDirection.z;
      canFire = dot >= bitVisionCos || distance <= bitChaseFireRange;
    } else if (bit.mode === "attack-fixed") {
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const lockedTarget = findTargetById(aliveTargets, bit.targetId);
      if (!lockedTarget) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const distanceSq = Vector3.DistanceSquared(
        bit.root.position,
        lockedTarget.position
      );
      const distance = Math.sqrt(distanceSq);
      if (distance > bitFixedLoseRange || distance < avoidRadius) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      moveDirection = new Vector3(0, 0, 0);
      const targetDirection = lockedTarget.position
        .subtract(bit.root.position)
        .normalize();
      const lockedDirection = bit.lockedDirection.clone();
      lockedDirection.y = 0;
      aimDirection = new Vector3(
        lockedDirection.x,
        targetDirection.y,
        lockedDirection.z
      ).normalize();
      canFire = true;
    } else if (bit.mode === "attack-random") {
      const randomTarget = findTargetById(aliveTargets, bit.targetId);
      if (!randomTarget) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      bit.modeTimer -= delta;
      if (bit.modeTimer <= 0) {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      bit.wanderTimer -= delta;
      if (bit.wanderTimer <= 0) {
        bit.wanderDirection = pickBitWanderDirection();
        bit.wanderTimer =
          bitWanderTimerMin +
          Math.random() * (bitWanderTimerMax - bitWanderTimerMin);
      }
      moveDirection = bit.wanderDirection;
      aimDirection = bit.wanderDirection.clone();
      canFire = true;
    } else if (bit.mode === "carpet-bomb") {
      moveSpeed = carpetBombSpeed * bit.statMultiplier;
      const leaderId = bit.carpetLeaderId ?? bit.id;
      const leader =
        bits.find((candidate) => candidate.id === leaderId) ?? null;
      if (!leader || leader.mode !== "carpet-bomb") {
        clearCarpetState(bit);
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const carpetTarget = findTargetById(
        aliveTargets,
        leader.carpetTargetId
      );
      if (!carpetTarget) {
        clearCarpetState(bit);
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        continue;
      }
      const leaderDirection =
        leader.carpetDirection.lengthSquared() > 0.0001
          ? leader.carpetDirection.normalize()
          : leader.root.getDirection(new Vector3(0, 0, 1));
      const right = new Vector3(-leaderDirection.z, 0, leaderDirection.x);

      if (leader.id === bit.id) {
        if (carpetTarget) {
          const toTarget = carpetTarget.position.subtract(bit.root.position);
          toTarget.y = 0;
          if (toTarget.lengthSquared() > 0.0001) {
            const targetDirection = toTarget.normalize();
            const blended = Vector3.Lerp(
              leaderDirection,
              targetDirection,
              carpetBombSteerStrength
            );
            blended.y = 0;
            if (blended.lengthSquared() > 0.0001) {
              leader.carpetDirection.copyFrom(blended.normalize());
            }
          }
          const passDot =
            leader.carpetDirection.x * toTarget.x +
            leader.carpetDirection.z * toTarget.z;
          if (passDot < 0) {
            leader.carpetPassTimer += delta;
          } else {
            leader.carpetPassTimer = 0;
          }
        } else {
          leader.carpetPassTimer += delta;
        }
        if (leader.carpetPassTimer >= carpetBombPassDelay) {
          clearCarpetState(bit);
          setBitMode(bit, "search", null, alertSignal, soundEvents);
          continue;
        }
        moveDirection = leader.carpetDirection;
      } else {
        if (leader.carpetPassTimer >= carpetBombPassDelay) {
          clearCarpetState(bit);
          setBitMode(bit, "search", null, alertSignal, soundEvents);
          continue;
        }
        const offset = right
          .scale(bit.carpetOffset.x)
          .add(leader.carpetDirection.scale(bit.carpetOffset.z));
        const desiredPosition = leader.root.position.add(offset);
        const toDesired = desiredPosition.subtract(bit.root.position);
        toDesired.y = 0;
        if (toDesired.lengthSquared() > 0.0001) {
          moveDirection = toDesired.normalize();
        } else {
          moveDirection = leader.carpetDirection;
        }
      }
      aimDirection = new Vector3(0, -1, 0);
      if (carpetTarget) {
        const toTarget = carpetTarget.position.subtract(bit.root.position);
        toTarget.y = 0;
        const horizontalDistance = Math.hypot(toTarget.x, toTarget.z);
        if (
          horizontalDistance > 0.001 &&
          horizontalDistance <= carpetBombAimRange
        ) {
          const horizontalDirection = toTarget.normalize();
          const tiltDirection = new Vector3(
            horizontalDirection.x,
            -1,
            horizontalDirection.z
          ).normalize();
          aimDirection = Vector3.Lerp(
            new Vector3(0, -1, 0),
            tiltDirection,
            carpetBombAimBlend
          );
        }
      }
      canFire = true;
    }

    if (
      bit.mode !== "attack-fixed" &&
      bit.mode !== "hold" &&
      bit.mode !== "carpet-bomb" &&
      bit.mode !== "alert"
    ) {
      const avoidVector = new Vector3(0, 0, 0);
      for (const target of aliveTargets) {
        const dx = bit.root.position.x - target.position.x;
        const dz = bit.root.position.z - target.position.z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < avoidRadiusSq) {
          const distance = Math.sqrt(distanceSq);
          const invDistance = distance === 0 ? 1 : 1 / distance;
          const strength = (avoidRadius - distance) / avoidRadius;
          avoidVector.x += dx * invDistance * strength;
          avoidVector.z += dz * invDistance * strength;
        }
      }

      if (avoidVector.length() > 0.001) {
        moveDirection = moveDirection.add(avoidVector).normalize();
        aimDirection = moveDirection.clone();
      }
    }

    const movingNow = moveDirection.length() > 0.001;
    if (movingNow && !bit.isMoving) {
      soundEvents.onMoveStart(bit);
    }
    bit.isMoving = movingNow;

    const moveStep = moveDirection.scale(moveSpeed * delta);
    const nextX = bit.root.position.x + moveStep.x;
    const nextZ = bit.root.position.z + moveStep.z;
    let hitWall = false;

    if (isFloorAt(nextX, bit.root.position.z)) {
      bit.root.position.x = nextX;
    } else {
      bit.wanderDirection.x *= -1;
      hitWall = true;
    }

    if (isFloorAt(bit.root.position.x, nextZ)) {
      bit.root.position.z = nextZ;
    } else {
      bit.wanderDirection.z *= -1;
      hitWall = true;
    }

    bit.baseHeight += moveStep.y;
    if (bit.mode === "carpet-bomb") {
      bit.baseHeight = maxY;
    }

    if (bit.root.position.x < minX) {
      bit.root.position.x = minX;
      bit.wanderDirection.x *= -1;
      hitWall = true;
    }
    if (bit.root.position.x > maxX) {
      bit.root.position.x = maxX;
      bit.wanderDirection.x *= -1;
      hitWall = true;
    }
    if (bit.root.position.z < minZ) {
      bit.root.position.z = minZ;
      bit.wanderDirection.z *= -1;
      hitWall = true;
    }
    if (bit.root.position.z > maxZ) {
      bit.root.position.z = maxZ;
      bit.wanderDirection.z *= -1;
      hitWall = true;
    }

    if (
      bit.mode === "carpet-bomb" &&
      (hitWall || isWallNear(bit.root.position))
    ) {
      clearCarpetState(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      continue;
    }

    for (const target of aliveTargets) {
      const dx = bit.root.position.x - target.position.x;
      const dz = bit.root.position.z - target.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (
        distanceSq < avoidRadiusSq &&
        bit.mode !== "attack-fixed" &&
        bit.mode !== "carpet-bomb"
      ) {
        const distance = Math.sqrt(distanceSq);
        const invDistance = distance === 0 ? 1 : 1 / distance;
        bit.root.position.x = target.position.x + dx * invDistance * avoidRadius;
        bit.root.position.z = target.position.z + dz * invDistance * avoidRadius;
      }
    }

    if (bit.baseHeight < minY) {
      bit.baseHeight = minY;
      bit.wanderDirection.y *= -1;
    }
    if (bit.baseHeight > maxY) {
      bit.baseHeight = maxY;
      if (bit.mode !== "carpet-bomb") {
        bit.wanderDirection.y *= -1;
      }
    }

    const bob = Math.sin(elapsed * 0.9 + bit.floatOffset) * bitBobAmplitude;
    const clampedBase = Math.min(
      Math.max(bit.baseHeight, minY - bob),
      maxY - bob
    );
    bit.baseHeight = clampedBase;
    bit.root.position.y = bit.baseHeight + bob;

    if (aimDirection.length() > 0.001) {
      bit.root.lookAt(bit.root.position.add(aimDirection));
    }

    if (bit.fireInterval > 0) {
      bit.fireTimer -= delta;
      if (bit.fireTimer <= 0 && canFire) {
        const muzzlePosition = bit.muzzle.getAbsolutePosition();
        const beamDirection = bit.root.getDirection(new Vector3(0, 0, 1));
        if (beamDirection.length() > 0.001) {
          soundEvents.onBeamFire(bit, bit.targetId === "player");
          spawnBeam(muzzlePosition, beamDirection.normalize(), bit.id);
        }
        if (bit.mode === "carpet-bomb") {
          bit.fireInterval =
            (carpetBombFireIntervalMin +
              Math.random() *
                (carpetBombFireIntervalMax - carpetBombFireIntervalMin)) /
            bit.statMultiplier;
        }
        bit.fireTimer = bit.fireInterval;
      }
    }

  }

  if (
    alertLeader &&
    alertLeader.mode === "alert" &&
    alertSignal.requiredCount > 0 &&
    alertSignal.gatheredIds.size >= alertSignal.requiredCount
  ) {
    setBitMode(alertLeader, "search", null, alertSignal, soundEvents);
    clearAlertSignal();
  }

  if (spawnedBits.length > 0) {
    bits.push(...spawnedBits);
  }
};
