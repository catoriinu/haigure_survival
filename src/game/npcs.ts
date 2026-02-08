import {
  Color3,
  Color4,
  PointLight,
  Scene,
  Sprite,
  SpriteManager,
  Vector3
} from "@babylonjs/core";
import { CELL_SCALE, GridLayout } from "../world/grid";
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
  pickRandomHorizontalDirection,
  worldToCell
} from "./gridUtils";
import {
  buildReachableMap,
  collectReachableCells,
  isNpcAtDestination,
  moveNpcAlongPath,
  npcTargetArrivalDistance,
  pickEvadeCell,
  pickNeighborCellClosestTo,
  pickNeighborCellClosestToAvoid,
  pickNeighborCellInDirection,
  pickRandomNeighborCell,
  pickWeightedCell,
  setNpcDestination
} from "./npcNavigation";
import { alignSpriteToGround } from "./spriteUtils";
import { findTargetById } from "./targetUtils";
import { isBeamHittingTargetExcludingSource } from "./beamCollision";
import {
  createHitEffectMesh,
  createHitFadeOrbs,
  calculateHitEffectDiameter,
  HitFadeOrbConfig,
  updateHitFadeOrbs
} from "./hitEffects";
import { beginBeamRetract } from "./beams";
import {
  CHARACTER_SPRITE_CELL_SIZE,
  NPC_SPRITE_CENTER_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_WIDTH,
  createDefaultCharacterSpritesheet
} from "./characterSprites";
const npcSearchSpeed = 0.2;
const npcEvadeSpeed = 0.25;
const npcChaseSpeed = 0.3;
const npcMovePower = 12 * CELL_SCALE;
const npcEvadeRetargetInterval = 1;
const redHitDurationScale = 1;
// NPCが光線命中後に点滅状態を繰り返す継続時間（秒）。デフォルトは3
export const npcHitDuration = 3;
// NPCの点滅状態後、`hit-a`（光線命中：ハイレグ姿）のまま光がフェードする時間（秒）。デフォルトは1
export const npcHitFadeDuration = 1;
export const npcHitRadius = NPC_SPRITE_WIDTH * 0.5;
// NPC光線命中時の光の点滅の切り替え間隔（秒）。小さくしすぎると光の刺激が強いため要注意。デフォルトは0.12
export const npcHitFlickerInterval = 0.12;
export const npcHitColorA = new Color3(1, 0.18, 0.74);
export const npcHitColorB = new Color3(0.2, 0.96, 1);
export const npcHitEffectAlpha = 0.45;
const npcHitSpriteColorMix = 0.6;
const toSpriteFlickerColor = (color: Color3) =>
  new Color4(
    color.r + (1 - color.r) * npcHitSpriteColorMix,
    color.g + (1 - color.g) * npcHitSpriteColorMix,
    color.b + (1 - color.b) * npcHitSpriteColorMix,
    1
  );
const npcHitColorA4 = toSpriteFlickerColor(npcHitColorA);
const npcHitColorB4 = toSpriteFlickerColor(npcHitColorB);
const npcSpriteColorNormal = new Color4(1, 1, 1, 1);
export const npcHitLightIntensity = 1.1;
const getNpcHitEffectDiameter = (sprite: Sprite) =>
  calculateHitEffectDiameter(sprite.width, sprite.height);
export type NpcBrainwashInProgressTransitionConfig = {
  decisionDelay: number;
  stayChance: number;
};
const defaultNpcBrainwashInProgressTransitionConfig: NpcBrainwashInProgressTransitionConfig =
  {
    // `brainwash-in-progress` の遷移判定を行う間隔（秒）。デフォルトは10
    decisionDelay: 10,
    // `brainwash-in-progress` の判定時に同状態を継続する確率。`1 - stayChance` の確率で `brainwash-complete-haigure` へ遷移。デフォルトは0.5
    stayChance: 0.5
  };
let npcBrainwashInProgressTransitionConfig: NpcBrainwashInProgressTransitionConfig =
  { ...defaultNpcBrainwashInProgressTransitionConfig };
// `brainwash-complete-haigure` から次状態への遷移判定間隔（秒）。デフォルトは10
const npcBrainwashCompleteHaigureDecisionDelay = 10;
export type NpcBrainwashCompleteTransitionConfig = {
  stayChance: number;
  toGunChance: number;
};
const defaultNpcBrainwashCompleteTransitionConfig: NpcBrainwashCompleteTransitionConfig =
  {
    // `brainwash-complete-haigure` の判定時に同状態を継続する確率。`1 - stayChance` の確率で次状態分岐の抽選へ進む。デフォルトは0.1
    stayChance: 0.1,
    // `brainwash-complete-haigure` の判定で継続しなかったときに、`brainwash-complete-gun`に遷移する確率。外れた場合は`brainwash-complete-no-gun`に遷移する。デフォルトは0.5
    toGunChance: 0.5
  };
let npcBrainwashCompleteTransitionConfig: NpcBrainwashCompleteTransitionConfig =
  { ...defaultNpcBrainwashCompleteTransitionConfig };
const npcBrainwashVisionRange = 3;
const npcBrainwashVisionRangeSq = npcBrainwashVisionRange * npcBrainwashVisionRange;
const npcBrainwashVisionCos = Math.cos((95 * Math.PI) / 180);
const npcBrainwashLoseRange = 2.5;
const npcBrainwashLoseRangeSq = npcBrainwashLoseRange * npcBrainwashLoseRange;
const npcBrainwashFireRange = 1.5;
const npcBrainwashFireRangeSq = npcBrainwashFireRange * npcBrainwashFireRange;
const npcBrainwashFireIntervalMin = 1.4;
const npcBrainwashFireIntervalMax = 2.2;
const npcBrainwashBlockRadius = NPC_SPRITE_WIDTH * 0.7;
const npcBrainwashBlockDuration = 20;
const npcBrainwashBreakAwayDuration = 2.5;
const npcBrainwashBreakAwaySpeed = 0.27;
const hitFadeOrbMinCount = 5;
const hitFadeOrbMaxCount = 20;
const hitFadeOrbDiameter = 0.02;
const hitFadeOrbSurfaceOffsetMin = 0.005;
const hitFadeOrbSurfaceOffsetMax = 0.03;
const hitFadeOrbSpeedMin = 0.02;
const hitFadeOrbSpeedMax = 0.05;
export const npcHitFadeOrbConfig: HitFadeOrbConfig = {
  minCount: hitFadeOrbMinCount,
  maxCount: hitFadeOrbMaxCount,
  diameter: hitFadeOrbDiameter,
  surfaceOffsetMin: hitFadeOrbSurfaceOffsetMin,
  surfaceOffsetMax: hitFadeOrbSurfaceOffsetMax,
  speedMin: hitFadeOrbSpeedMin,
  speedMax: hitFadeOrbSpeedMax
};

export const setNpcBrainwashCompleteTransitionConfig = (
  config: NpcBrainwashCompleteTransitionConfig
) => {
  npcBrainwashCompleteTransitionConfig = { ...config };
};

export const setNpcBrainwashInProgressTransitionConfig = (
  config: NpcBrainwashInProgressTransitionConfig
) => {
  npcBrainwashInProgressTransitionConfig = { ...config };
};

export const promoteHaigureNpc = (npc: Npc) => {
  const toGun = Math.random() < npcBrainwashCompleteTransitionConfig.toGunChance;
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

export const applyNpcDefaultHaigureState = (npc: Npc) => {
  if (Math.random() < npcBrainwashCompleteTransitionConfig.stayChance) {
    npc.state = "brainwash-complete-haigure";
    npc.brainwashTimer = 0;
    return;
  }
  promoteHaigureNpc(npc);
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
    spriteSheetUrl ?? createDefaultCharacterSpritesheet(),
    capacity,
    { width: CHARACTER_SPRITE_CELL_SIZE, height: CHARACTER_SPRITE_CELL_SIZE },
    scene
  );

export const spawnNpcs = (
  layout: GridLayout,
  floorCells: FloorCell[],
  getManager: (portraitDirectory: string, index: number) => SpriteManager,
  voiceIds: string[],
  portraitDirectories: string[]
) => {
  const npcs: Npc[] = [];
  const count = voiceIds.length;

  for (let index = 0; index < count; index += 1) {
    const cell = pickRandomCell(floorCells);
    const position = cellToWorld(layout, cell, NPC_SPRITE_CENTER_HEIGHT);
    const voiceId = voiceIds[index];
    const portraitDirectory = portraitDirectories[index];
    const sprite = new Sprite(
      `npc_${index}`,
      getManager(portraitDirectory, index)
    );
    sprite.position = position;
    sprite.width = NPC_SPRITE_WIDTH;
    sprite.height = NPC_SPRITE_HEIGHT;
    sprite.isPickable = false;
    sprite.cellIndex = 0;
    const wanderDirection = pickRandomHorizontalDirection();
    const fireInterval =
      npcBrainwashFireIntervalMin +
      Math.random() * (npcBrainwashFireIntervalMax - npcBrainwashFireIntervalMin);

    npcs.push({
      sprite,
      state: "normal",
      voiceId,
      portraitDirectory,
      cell,
      goalCell: cell,
      target: position.clone(),
      speed: npcSearchSpeed,
      hitTimer: 0,
      fadeTimer: 0,
      hitFadeDuration: npcHitFadeDuration,
      hitById: null,
      hitEffect: null,
      hitEffectMaterial: null,
      hitLight: null,
      fadeOrbs: [],
      brainwashTimer: 0,
      brainwashMode: "search",
      brainwashTargetId: null,
      wanderDirection,
      wanderTimer: 1 + Math.random() * 2,
      moveDirection: wanderDirection.clone(),
      path: [],
      pathIndex: 0,
      evadeTimer: 0,
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
  blockers: MovementBlocker[],
  evadeThreats: Vector3[][],
  cameraPosition: Vector3,
  shouldProcessOrb: (position: Vector3) => boolean
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
  const npcThreatsFromNpcs = npcs.map(() => [] as Vector3[]);
  for (const npc of npcs) {
    if (npc.brainwashMode !== "chase" || !npc.brainwashTargetId) {
      continue;
    }
    const target = findTargetById(aliveTargets, npc.brainwashTargetId);
    if (!target || !target.id.startsWith("npc_")) {
      continue;
    }
    const targetIndex = Number(target.id.slice(4));
    npcThreatsFromNpcs[targetIndex].push(npc.sprite.position);
  }

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

  const applyNpcBeamHits = (npc: Npc, npcId: string) => {
    for (const beam of beams) {
      if (!beam.active) {
        continue;
      }
      if (
        isBeamHittingTargetExcludingSource(
          beam,
          beam.sourceId,
          npcId,
          npc.sprite.position,
          npcHitRadius
        )
      ) {
        const hitScale = isRedSource(beam.sourceId) ? redHitDurationScale : 1;
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
        const hitEffectDiameter = getNpcHitEffectDiameter(npc.sprite);
        const { mesh: effect, material } = createHitEffectMesh(scene, {
          name: `npcHit_${npc.sprite.name}`,
          diameter: hitEffectDiameter,
          color: npcHitColorA,
          alpha: npcHitEffectAlpha
        });
        effect.position.copyFrom(npc.sprite.position);
        npc.hitEffect = effect;
        npc.hitEffectMaterial = material;
        const hitLight = new PointLight(
          `npcHitLight_${npc.sprite.name}`,
          npc.sprite.position.clone(),
          scene
        );
        hitLight.diffuse = npcHitColorA.clone();
        hitLight.specular = npcHitColorA.clone();
        hitLight.intensity = npcHitLightIntensity;
        hitLight.range = hitEffectDiameter * 1.2;
        npc.hitLight = hitLight;
        onNpcHit(npc.sprite.position);
        break;
      }
    }
  };

  const handleNpcHitState = (npc: Npc) => {
    if (!isHitState(npc.state)) {
      return false;
    }
    npc.hitTimer -= delta;
    if (npc.hitTimer > 0) {
      const dx = cameraPosition.x - npc.sprite.position.x;
      const dy = cameraPosition.y - npc.sprite.position.y;
      const dz = cameraPosition.z - npc.sprite.position.z;
      const hitEffectRadius =
        getNpcHitEffectDiameter(npc.sprite) / 2;
      const hitEffectRadiusSq = hitEffectRadius * hitEffectRadius;
      const isCameraInside =
        dx * dx + dy * dy + dz * dz <= hitEffectRadiusSq;
      if (npc.hitEffect) {
        npc.hitEffect.position.copyFrom(npc.sprite.position);
      }
      if (npc.hitLight) {
        npc.hitLight.position.copyFrom(npc.sprite.position);
      }
      const phase = Math.floor(elapsed / npcHitFlickerInterval) % 2 === 0;
      const color = phase ? npcHitColorA : npcHitColorB;
      const spriteColor = isCameraInside
        ? phase
          ? npcHitColorA4
          : npcHitColorB4
        : npcSpriteColorNormal;
      npc.sprite.color.copyFrom(spriteColor);
      if (npc.hitEffectMaterial) {
        npc.hitEffectMaterial.emissiveColor.copyFrom(color);
        npc.hitEffectMaterial.diffuseColor.copyFrom(color);
        npc.hitEffectMaterial.alpha = npcHitEffectAlpha;
      }
      if (npc.hitLight) {
        npc.hitLight.diffuse.copyFrom(color);
        npc.hitLight.specular.copyFrom(color);
        npc.hitLight.intensity = npcHitLightIntensity;
      }
      npc.state = phase ? "hit-a" : "hit-b";
      return true;
    }

    if (npc.fadeTimer === 0) {
      npc.fadeTimer = npc.hitFadeDuration;
      npc.sprite.cellIndex = 2;
      npc.sprite.color.copyFrom(npcSpriteColorNormal);
      const hitEffectRadius =
        getNpcHitEffectDiameter(npc.sprite) / 2;
      if (shouldProcessOrb(npc.sprite.position)) {
        npc.fadeOrbs = createHitFadeOrbs(
          npc.sprite.manager.scene,
          npc.sprite.position.clone(),
          npc.hitEffectMaterial!,
          hitEffectRadius,
          npcHitFadeOrbConfig
        );
      } else {
        npc.fadeOrbs = [];
      }
    }
    npc.state = "hit-a";

    npc.fadeTimer = Math.max(0, npc.fadeTimer - delta);
    if (npc.hitEffect) {
      npc.hitEffect.position.copyFrom(npc.sprite.position);
    }
    if (npc.hitLight) {
      npc.hitLight.position.copyFrom(npc.sprite.position);
    }
    if (npc.hitEffectMaterial) {
      npc.hitEffectMaterial.emissiveColor.copyFrom(npcHitColorA);
      npc.hitEffectMaterial.diffuseColor.copyFrom(npcHitColorA);
      npc.hitEffectMaterial.alpha =
        npcHitEffectAlpha * (npc.fadeTimer / npc.hitFadeDuration);
    }
    const fadeScale = npc.fadeTimer / npc.hitFadeDuration;
    if (npc.hitLight) {
      npc.hitLight.diffuse.copyFrom(npcHitColorA);
      npc.hitLight.specular.copyFrom(npcHitColorA);
      npc.hitLight.intensity = npcHitLightIntensity * fadeScale;
    }
    updateHitFadeOrbs(npc.fadeOrbs, delta, fadeScale, shouldProcessOrb);
    if (npc.fadeTimer <= 0) {
      npc.state = "brainwash-in-progress";
      npc.brainwashTimer = 0;
      npc.brainwashMode = "search";
      npc.brainwashTargetId = null;
      npc.goalCell = npc.cell;
      npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
      npc.path = [];
      npc.pathIndex = 0;
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
      if (npc.hitLight) {
        npc.hitLight.dispose();
        npc.hitLight = null;
      }
      npc.sprite.color.copyFrom(npcSpriteColorNormal);
      for (const orb of npc.fadeOrbs) {
        orb.mesh.dispose();
      }
      npc.fadeOrbs = [];
    }
    return true;
  };

  const handleNpcBrainwashTransition = (npc: Npc) => {
    if (npc.state === "brainwash-in-progress") {
      npc.brainwashTimer += delta;
      if (
        npc.brainwashTimer >=
        npcBrainwashInProgressTransitionConfig.decisionDelay
      ) {
        if (Math.random() < npcBrainwashInProgressTransitionConfig.stayChance) {
          npc.brainwashTimer = 0;
        } else {
          npc.state = "brainwash-complete-haigure";
          npc.brainwashTimer = 0;
        }
      }
      return true;
    }

    if (npc.state === "brainwash-complete-haigure") {
      npc.brainwashTimer += delta;
      if (npc.brainwashTimer >= npcBrainwashCompleteHaigureDecisionDelay) {
        if (Math.random() < npcBrainwashCompleteTransitionConfig.stayChance) {
          npc.brainwashTimer = 0;
        } else {
          promoteHaigureNpc(npc);
        }
      }
      return true;
    }

    if (npc.state === "brainwash-complete-haigure-formation") {
      return true;
    }

    return false;
  };

  const handleNpcAliveMovement = (
    npc: Npc,
    npcId: string,
    npcIndex: number
  ) => {
    if (!isAliveState(npc.state)) {
      return false;
    }
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
      return true;
    }

    const moveSpeed = npc.state === "evade" ? npcEvadeSpeed : npc.speed;
    const originCell = npc.cell;
    const destinationArrived = isNpcAtDestination(npc);
    if (npc.state === "evade") {
      npc.evadeTimer = Math.max(0, npc.evadeTimer - delta);
      if (npc.evadeTimer <= 0 || destinationArrived) {
        const reachableMap = buildReachableMap(layout, originCell, npcMovePower);
        const candidates = collectReachableCells(
          layout,
          reachableMap.distances
        );
        const threats = [
          ...npcThreatsFromNpcs[npcIndex],
          ...evadeThreats[npcIndex]
        ];
        const destination =
          threats.length > 0
            ? pickEvadeCell(layout, candidates, threats)
            : pickWeightedCell(candidates, npcMovePower);
        setNpcDestination(
          layout,
          npc,
          originCell,
          destination,
          reachableMap.prevRow,
          reachableMap.prevCol
        );
        npc.evadeTimer = npcEvadeRetargetInterval;
        if (destinationArrived) {
          return true;
        }
      }
    } else if (destinationArrived) {
      const reachableMap = buildReachableMap(layout, originCell, npcMovePower);
      const candidates = collectReachableCells(layout, reachableMap.distances);
      const destination = pickWeightedCell(candidates, npcMovePower);
      setNpcDestination(
        layout,
        npc,
        originCell,
        destination,
        reachableMap.prevRow,
        reachableMap.prevCol
      );
      return true;
    }

    moveNpcAlongPath(npc, moveSpeed, delta);
    return true;
  };

  const handleNpcBrainwashComplete = (npc: Npc, npcId: string) => {
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
            npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
          }
        }
        return;
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
          npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
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
        return;
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
      npc.target = cellToWorld(layout, npc.cell, NPC_SPRITE_CENTER_HEIGHT);
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
      return;
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
  };

  for (const npc of npcs) {
    const npcId = npc.sprite.name;
    alignSpriteToGround(npc.sprite);
    npc.cell = worldToCell(layout, npc.sprite.position);
    const npcIndex = Number(npcId.slice(4));
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
      applyNpcBeamHits(npc, npcId);
    }

    if (handleNpcHitState(npc)) {
      continue;
    }

    if (handleNpcBrainwashTransition(npc)) {
      continue;
    }

    if (handleNpcAliveMovement(npc, npcId, npcIndex)) {
      continue;
    }

    handleNpcBrainwashComplete(npc, npcId);
  }

  return { playerBlocked, targetedIds, alertRequests };
};
