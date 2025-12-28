import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  VertexBuffer,
  Vector3
} from "@babylonjs/core";
import { GridLayout } from "../world/grid";
import {
  AlertSignal,
  Bit,
  BitMaterials,
  BitMode,
  BitSoundEvents,
  BitWanderMode,
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
import { beamTipDiameter } from "./beams";

const bitVisionRangeBase = 32;
const bitVisionRangeRedMultiplier = 2;
const bitVisionRangeBoostMultiplier = 1;
const bitBaseSpeed = 2.4;
const bitSearchSpeed = 3;
const bitChaseSpeed = 1.8;
const bitVisionAngleBase = 100;
const bitVisionAngleRedMultiplier = 1.5;
const bitVisionAngleBoostMultiplier = 1;
const bitChaseFireRange = 12;
const bitChaseLoseRange = 24;
const bitChaseDuration = 15;
const bitChaseFireIntervalMin = 3.0;
const bitChaseFireIntervalMax = 4.0;
const bitFixedDuration = 10;
const alertGatherTargetCount = 4;
const alertGatherRadius = 6;
const alertGiveUpDuration = 15;
const alertReceiveSpeedMultiplier = 5;
const alertSpawnRadius = 2.4;
const bitRandomDuration = 10;
const bitRandomFireIntervalMin = 0.8;
const bitRandomFireIntervalMax = 1.4;
const bitRandomSpeed = 3.4;
const bitRandomTurnSpeedMultiplier = 1.35;
const bitRandomWanderTimerMin = 0.35;
const bitRandomWanderTimerMax = 0.8;
const bitInitialFireDelayFactor = 0.35;
const bitWallProximityRadius = 0.9;
const bitWanderVerticalAmplitude = 0.18;
const bitWanderVerticalChance = 0.2;
const bitWanderDiagonalChance = 0.25;
const bitWanderVerticalSpeed = 0.75;
const bitWanderDiagonalMin = 0.2;
const bitWanderDiagonalMax = 0.45;
const bitWanderTimerMin = 1.2;
const bitWanderTimerMax = 2.4;
const bitBobAmplitudeNormal = 0.35;
const bitBobAmplitudeUrgent = 0;
const bitScanIntervalMin = 4.2;
const bitScanIntervalMax = 7.2;
const bitScanDurationMin = 0.7;
const bitScanDurationMax = 1.1;
const bitScanYawRange = Math.PI * 0.55;
const bitScanPitchDown = Math.PI * 0.22;
const bitScanPitchHeightThreshold = 0.6;
const alertRecoverPitchThreshold = 0.12;
const attackModeCooldownDuration = 3;
const bitChaseDescendSpeed = 2.1;
const carpetFormationSpacing = 3;
const carpetBombSpeed = 9;
const carpetBombSpeedRedMultiplier = 0.92;
const carpetBombSpread = 0.4;
const carpetBombFireIntervalMin = 0.25;
const carpetBombFireIntervalMax = 0.25;
const carpetBombFireRateRedDivisor = 1.3;
const carpetBombPassDelay = 3.0;
const carpetBombAscendSpeed = 4.2;
const carpetBombTurnRate = Math.PI * 0.35;
const carpetBombWallCooldown = 2.5;
const carpetBombSteerStrength = 0.18;
const carpetBombAimScatter = 0.35;
const carpetBombAimBlend = 0.2;
const carpetAimTurnDuration = 1;
const carpetDespawnDuration = 1;
const bitTurnSpeed = Math.PI * 1.2;
const redBitTurnSpeed = Math.PI * 1.6;
const spawnFadeDuration = 0.5;
const spawnHoldDuration = 0.5;
const spawnShrinkDuration = 0.5;
const spawnSphereStartDiameter = 2.6;
const spawnSphereEndDiameter = 0.45;
const spawnSphereEndScale = spawnSphereEndDiameter / spawnSphereStartDiameter;
const bitBodyHeight = 1.8;
const bitMuzzleDiameter = 0.35;
const bitMuzzleOffsetZ = bitBodyHeight / 2 + 0.25;
const bitFireEffectDuration = 0.32;
const bitFireConeSweepDuration = 0.07;
const bitFireConeFadeDuration = 0.06;
const bitFireConeBandWidth = 0.22;
const bitFireConeFadeSoftness = 0.1;
const bitFireMuzzleLensDuration = 0.09;
const bitFireMuzzleInflateDuration = 0.04;
const bitFireMuzzleHoldDuration = 0.02;
const bitFireShotGrowDuration = 0.1;
const bitFireShotTravelDistance = 1.1;
const bitFireMuzzleSphereScale = 2.1;
const bitFireLensScale = new Vector3(2.1, 2.1, 1.0);
const bitFireColor = new Color3(1, 0.18, 0.74);
const bitFireEffectAlpha = 0.9;
const bitFireMuzzleSequenceDuration =
  bitFireMuzzleLensDuration +
  bitFireMuzzleInflateDuration +
  bitFireMuzzleHoldDuration;
const bitFireShotStart =
  bitFireConeSweepDuration + bitFireMuzzleSequenceDuration;
const bitFireShotMaxScale = beamTipDiameter / bitMuzzleDiameter;

type AttackModeId = "attack-chase" | "attack-fixed" | "attack-random";

type AttackModeConfig = {
  duration: number;
  fireIntervalMin: number;
  fireIntervalMax: number;
};

const attackModeConfigs: Record<AttackModeId, AttackModeConfig> = {
  "attack-chase": {
    duration: bitChaseDuration,
    fireIntervalMin: bitChaseFireIntervalMin,
    fireIntervalMax: bitChaseFireIntervalMax
  },
  "attack-fixed": {
    duration: bitFixedDuration,
    fireIntervalMin: 1.0,
    fireIntervalMax: 1.6
  },
  "attack-random": {
    duration: bitRandomDuration,
    fireIntervalMin: bitRandomFireIntervalMin,
    fireIntervalMax: bitRandomFireIntervalMax
  }
};

type ModeFrame = {
  moveDirection: Vector3;
  aimDirection: Vector3;
  moveSpeed: number;
  turnSpeedScale: number;
  canFire: boolean;
  extraHeightStep: number;
  lockMovement: boolean;
};

const pickBitWanderDirection = () => {
  const angle = Math.random() * Math.PI * 2;
  return new Vector3(
    Math.cos(angle),
    Math.random() * (bitWanderVerticalAmplitude * 2) - bitWanderVerticalAmplitude,
    Math.sin(angle)
  );
};

const pickBitWanderMode = (): BitWanderMode => {
  const roll = Math.random();
  if (roll < bitWanderVerticalChance) {
    return "vertical";
  }
  if (roll < bitWanderVerticalChance + bitWanderDiagonalChance) {
    return "diagonal";
  }
  return "forward";
};

const pickBitVerticalDirection = () =>
  new Vector3(0, Math.random() < 0.5 ? -1 : 1, 0);

const pickBitDiagonalDirection = () => {
  const horizontal = pickRandomHorizontalDirection();
  const vertical =
    (Math.random() < 0.5 ? -1 : 1) *
    (bitWanderDiagonalMin +
      Math.random() * (bitWanderDiagonalMax - bitWanderDiagonalMin));
  return new Vector3(horizontal.x, vertical, horizontal.z).normalize();
};

const resetBitWander = (
  bit: Bit,
  timerMin: number,
  timerMax: number
) => {
  bit.wanderMode = pickBitWanderMode();
  if (bit.wanderMode === "vertical") {
    bit.wanderDirection = pickBitVerticalDirection();
  } else if (bit.wanderMode === "diagonal") {
    bit.wanderDirection = pickBitDiagonalDirection();
  } else {
    bit.wanderDirection = pickBitWanderDirection();
  }
  bit.wanderTimer = timerMin + Math.random() * (timerMax - timerMin);
};

const getHorizontalForward = (bit: Bit) => {
  const forward = bit.root.getDirection(new Vector3(0, 0, 1));
  forward.y = 0;
  return forward.lengthSquared() > 0.0001 ? forward.normalize() : forward;
};

const getYawFromDirection = (direction: Vector3) =>
  Math.atan2(direction.z, direction.x);

const getDirectionFromYaw = (yaw: number) =>
  new Vector3(Math.cos(yaw), 0, Math.sin(yaw));

const createModeFrame = (bit: Bit): ModeFrame => ({
  moveDirection: bit.wanderDirection,
  aimDirection: bit.wanderDirection.clone(),
  moveSpeed: bit.speed,
  turnSpeedScale: 1,
  canFire: false,
  extraHeightStep: 0,
  lockMovement: false
});

const startAttackCooldown = (bit: Bit) => {
  bit.attackCooldown = attackModeCooldownDuration;
};

const applyAttackModeTimers = (bit: Bit, mode: AttackModeId) => {
  const config = attackModeConfigs[mode];
  bit.fireInterval =
    (config.fireIntervalMin +
      Math.random() * (config.fireIntervalMax - config.fireIntervalMin)) /
    bit.statMultiplier;
  bit.fireTimer = bit.fireInterval * bitInitialFireDelayFactor;
  bit.modeTimer = config.duration;
};

const getCarpetBombSpeed = (bit: Bit) =>
  (bit.isRed
    ? carpetBombSpeed * carpetBombSpeedRedMultiplier
    : carpetBombSpeed) * bit.statMultiplier;

const getCarpetBombFireInterval = (bit: Bit) => {
  const base =
    carpetBombFireIntervalMin +
    Math.random() * (carpetBombFireIntervalMax - carpetBombFireIntervalMin);
  const rateDivisor = bit.isRed ? carpetBombFireRateRedDivisor : 1;
  return base / (rateDivisor * bit.statMultiplier);
};

const getBitVisionRange = (bit: Bit, rangeBoost: number) =>
  bitVisionRangeBase *
  (bit.isRed ? bitVisionRangeRedMultiplier : 1) *
  rangeBoost *
  bit.statMultiplier;

const getBitVisionCos = (bit: Bit, angleBoost: number) => {
  const angle =
    bitVisionAngleBase *
    (bit.isRed ? bitVisionAngleRedMultiplier : 1) *
    angleBoost;
  return Math.cos((angle * Math.PI) / 180);
};

const findVisibleTarget = (
  bit: Bit,
  targets: TargetInfo[],
  rangeBoost: number,
  angleBoost: number
) => {
  const forward = bit.root.getDirection(new Vector3(0, 0, 1));
  let bestTarget: TargetInfo | null = null;
  let bestDistanceSq = 0;
  const range = getBitVisionRange(bit, rangeBoost);
  const rangeSq = range * range;
  const visionCos = getBitVisionCos(bit, angleBoost);

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
    if (dot < visionCos) {
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
    if (roll < 0.7) {
      return "attack-chase";
    }
    if (roll < 0.9) {
      return "attack-fixed";
    }
    return "attack-carpet-bomb";
  }
  if (roll < 0.45) {
    return "attack-chase";
  }
  if (roll < 0.65) {
    return "attack-fixed";
  }
  if (roll < 0.8) {
    return "attack-random";
  }
  if (roll < 0.9) {
    return "alert";
  }
  return "attack-carpet-bomb";
};

const chooseAlertFollowMode = (bit: Bit): BitMode => {
  const roll = Math.random();
  if (roll < 0.6) {
    return "attack-chase";
  }
  if (roll < 0.8) {
    return "attack-fixed";
  }
  return "attack-carpet-bomb";
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
    bit.alertRecovering = false;
    bit.alertRecoverYaw = getYawFromDirection(getHorizontalForward(bit));
    bit.alertCooldownPending = false;
  }
  if (target?.id === "player" && bit.targetId !== "player") {
    soundEvents.onTargetPlayer(bit);
  }
  bit.mode = mode;
  bit.targetId = target ? target.id : null;

  if (mode === "attack-chase") {
    applyAttackModeTimers(bit, mode);
    return;
  }

  if (mode === "attack-fixed") {
    if (target) {
      const locked = target.position.subtract(bit.root.position);
      bit.lockedDirection = locked.normalize();
    }
    applyAttackModeTimers(bit, mode);
    return;
  }

  if (mode === "attack-random") {
    applyAttackModeTimers(bit, mode);
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
  bit.mode = "attack-carpet-bomb";
  bit.targetId = targetId;
  bit.carpetLeaderId = leaderId;
  bit.carpetTargetId = targetId;
  bit.carpetDirection.copyFrom(direction);
  bit.carpetOffset.copyFrom(offset);
  bit.carpetPassTimer = 0;
  bit.carpetAimTimer = 0;
  bit.carpetAimStart.copyFrom(bit.root.getDirection(new Vector3(0, 0, 1)));
  if (leaderId !== bit.id) {
    bit.root.lookAt(bit.root.position.add(new Vector3(0, -1, 0)));
  }
  bit.fireInterval = getCarpetBombFireInterval(bit);
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

const isCarpetFollower = (bit: Bit) =>
  bit.carpetLeaderId !== null && bit.carpetLeaderId !== bit.id;

const startCarpetFollowerDespawn = (bit: Bit) => {
  if (bit.despawnTimer > 0) {
    return;
  }
  stopBitFireEffect(bit);
  bit.despawnTimer = carpetDespawnDuration;
};

const updateCarpetFollowerDespawn = (bit: Bit, delta: number) => {
  bit.despawnTimer = Math.max(0, bit.despawnTimer - delta);
  const alpha = bit.despawnTimer / carpetDespawnDuration;
  bit.body.visibility = alpha;
  bit.muzzle.visibility = alpha;
  if (bit.spawnEffectMaterial) {
    bit.spawnEffectMaterial.alpha = alpha;
  }
  return bit.despawnTimer <= 0;
};

const updateBitRotation = (
  bit: Bit,
  desiredDirection: Vector3,
  delta: number,
  turnSpeedScale: number
) => {
  const desired = desiredDirection.normalize();
  const current = bit.root.getDirection(new Vector3(0, 0, 1));
  const dot = Math.min(1, Math.max(-1, Vector3.Dot(current, desired)));
  const angle = Math.acos(dot);
  if (angle <= 0.0001) {
    bit.root.lookAt(bit.root.position.add(desired));
    return;
  }
  const turnSpeed =
    (bit.isRed ? redBitTurnSpeed : bitTurnSpeed) * turnSpeedScale;
  const maxStep = turnSpeed * delta;
  const t = Math.min(1, maxStep / angle);
  const sin = Math.sin(angle);
  const startScale = Math.sin((1 - t) * angle) / sin;
  const endScale = Math.sin(t * angle) / sin;
  const next = current.scale(startScale).add(desired.scale(endScale));
  bit.root.lookAt(bit.root.position.add(next));
};

const steerCarpetDirection = (
  current: Vector3,
  desired: Vector3,
  delta: number
) => {
  const dot = Math.min(1, Math.max(-1, Vector3.Dot(current, desired)));
  if (dot <= 0) {
    return current;
  }
  const angle = Math.acos(dot);
  if (angle <= 0.0001) {
    return current;
  }
  const maxStep = carpetBombTurnRate * delta;
  const t = Math.min(1, maxStep / angle);
  const sin = Math.sin(angle);
  const startScale = Math.sin((1 - t) * angle) / sin;
  const endScale = Math.sin(t * angle) / sin;
  const next = current.scale(startScale).add(desired.scale(endScale));
  const blended = Vector3.Lerp(current, next, carpetBombSteerStrength);
  blended.y = 0;
  return blended.lengthSquared() > 0.0001 ? blended.normalize() : current;
};

const updateSpawnEffect = (bit: Bit, delta: number) => {
  if (bit.spawnPhase === "done") {
    return;
  }
  bit.spawnTimer += delta;
  if (bit.spawnPhase === "fade-in") {
    const progress = Math.min(1, bit.spawnTimer / spawnFadeDuration);
    bit.spawnEffectMaterial!.alpha = progress;
    if (progress >= 1) {
      bit.spawnPhase = "hold";
      bit.spawnTimer = 0;
      bit.body.isVisible = true;
      bit.body.scaling = new Vector3(1, 1, 1);
    }
    return;
  }
  if (bit.spawnPhase === "hold") {
    if (bit.spawnTimer >= spawnHoldDuration) {
      bit.spawnPhase = "shrink";
      bit.spawnTimer = 0;
    }
    return;
  }
  const progress = Math.min(1, bit.spawnTimer / spawnShrinkDuration);
  const sphereScale = 1 - (1 - spawnSphereEndScale) * progress;
  bit.spawnEffect!.scaling = new Vector3(
    sphereScale,
    sphereScale,
    sphereScale
  );
  bit.spawnEffect!.position.z = bit.muzzle.position.z * progress;
  if (progress >= 1) {
    bit.muzzle.isVisible = true;
    bit.muzzle.scaling = new Vector3(1, 1, 1);
    bit.spawnPhase = "done";
    bit.spawnEffect!.dispose();
    bit.spawnEffectMaterial!.dispose();
    bit.spawnEffect = null;
    bit.spawnEffectMaterial = null;
  }
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

const createBitFireMaterial = (scene: Scene, name: string) => {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = bitFireColor.clone();
  material.emissiveColor = bitFireColor.clone();
  material.alpha = bitFireEffectAlpha;
  material.backFaceCulling = false;
  return material;
};

const createBitFireEffect = (
  scene: Scene,
  root: TransformNode,
  id: string
) => {
  const cone = MeshBuilder.CreateCylinder(
    `bitFireCone_${id}`,
    {
      diameterTop: 0,
      diameterBottom: 1.4,
      height: bitBodyHeight,
      tessellation: 24,
      sideOrientation: Mesh.DOUBLESIDE
    },
    scene
  );
  const coneMaterial = createBitFireMaterial(scene, `bitFireConeMat_${id}`);
  cone.parent = root;
  cone.rotation.x = Math.PI / 2;
  cone.material = coneMaterial;
  cone.isPickable = false;
  cone.setEnabled(false);

  const positions = cone.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Array((positions.length / 3) * 4).fill(0);
  cone.setVerticesData(VertexBuffer.ColorKind, colors, true);
  cone.useVertexColors = true;
  cone.hasVertexAlpha = true;

  const muzzle = MeshBuilder.CreateSphere(
    `bitFireMuzzle_${id}`,
    { diameter: bitMuzzleDiameter, segments: 16 },
    scene
  );
  const muzzleMaterial = createBitFireMaterial(
    scene,
    `bitFireMuzzleMat_${id}`
  );
  muzzle.parent = root;
  muzzle.position.z = bitMuzzleOffsetZ;
  muzzle.material = muzzleMaterial;
  muzzle.isPickable = false;
  muzzle.setEnabled(false);

  const shot = MeshBuilder.CreateSphere(
    `bitFireShot_${id}`,
    { diameter: bitMuzzleDiameter, segments: 16 },
    scene
  );
  const shotMaterial = createBitFireMaterial(scene, `bitFireShotMat_${id}`);
  shot.parent = root;
  shot.position.z = bitMuzzleOffsetZ;
  shot.material = shotMaterial;
  shot.isPickable = false;
  shot.setEnabled(false);

  return {
    cone,
    coneMaterial,
    conePositions: positions,
    coneColors: colors,
    muzzle,
    muzzleMaterial,
    shot,
    shotMaterial
  };
};

const updateBitFireCone = (bit: Bit, time: number) => {
  if (!bit.fireEffect) {
    return;
  }
  const { cone, conePositions, coneColors } = bit.fireEffect;
  if (time > bitFireConeSweepDuration + bitFireConeFadeDuration) {
    cone.setEnabled(false);
    return;
  }

  cone.setEnabled(true);
  const halfHeight = bitBodyHeight / 2;
  const getProfileAlpha = (t: number) => {
    if (t >= 0.5) {
      return 1;
    }
    if (t >= 0.25) {
      return (t - 0.25) / 0.25;
    }
    return 0;
  };
  if (time <= bitFireConeSweepDuration) {
    const sweep = time / bitFireConeSweepDuration;
    const center = sweep;
    const halfBand = bitFireConeBandWidth / 2;
    for (let index = 0, colorIndex = 0; index < conePositions.length; index += 3, colorIndex += 4) {
      const y = conePositions[index + 1];
      const t = (y + halfHeight) / bitBodyHeight;
      const distance = Math.abs(t - center);
      const bandAlpha = distance <= halfBand ? 1 - distance / halfBand : 0;
      const alpha = bandAlpha * getProfileAlpha(t);
      coneColors[colorIndex] = 1;
      coneColors[colorIndex + 1] = 1;
      coneColors[colorIndex + 2] = 1;
      coneColors[colorIndex + 3] = alpha;
    }
    cone.updateVerticesData(VertexBuffer.ColorKind, coneColors);
    return;
  }

  const fadeTime = time - bitFireConeSweepDuration;
  const fade = fadeTime / bitFireConeFadeDuration;
  const cutoff = fade;
  for (let index = 0, colorIndex = 0; index < conePositions.length; index += 3, colorIndex += 4) {
    const y = conePositions[index + 1];
    const t = (y + halfHeight) / bitBodyHeight;
    const fadeAlpha = Math.min(
      1,
      Math.max(0, (t - cutoff) / bitFireConeFadeSoftness)
    );
    const alpha = fadeAlpha * getProfileAlpha(t);
    coneColors[colorIndex] = 1;
    coneColors[colorIndex + 1] = 1;
    coneColors[colorIndex + 2] = 1;
    coneColors[colorIndex + 3] = alpha;
  }
  cone.updateVerticesData(VertexBuffer.ColorKind, coneColors);
};

const updateBitFireMuzzle = (bit: Bit, time: number) => {
  if (!bit.fireEffect) {
    return;
  }
  const { muzzle, muzzleMaterial } = bit.fireEffect;
  if (time < bitFireConeSweepDuration) {
    muzzle.setEnabled(false);
    return;
  }

  muzzle.setEnabled(true);
  const muzzleTime = time - bitFireConeSweepDuration;
  if (muzzleTime < bitFireMuzzleLensDuration) {
    muzzle.scaling.copyFrom(bitFireLensScale);
    muzzleMaterial.alpha = bitFireEffectAlpha;
    return;
  }
  const inflateTime = muzzleTime - bitFireMuzzleLensDuration;
  if (inflateTime < bitFireMuzzleInflateDuration) {
    const progress = inflateTime / bitFireMuzzleInflateDuration;
    const targetScale = Vector3.Lerp(
      bitFireLensScale,
      new Vector3(
        bitFireMuzzleSphereScale,
        bitFireMuzzleSphereScale,
        bitFireMuzzleSphereScale
      ),
      progress
    );
    muzzle.scaling.copyFrom(targetScale);
    muzzleMaterial.alpha = bitFireEffectAlpha;
    return;
  }
  const holdTime = inflateTime - bitFireMuzzleInflateDuration;
  if (holdTime < bitFireMuzzleHoldDuration) {
    muzzle.scaling.set(
      bitFireMuzzleSphereScale,
      bitFireMuzzleSphereScale,
      bitFireMuzzleSphereScale
    );
    muzzleMaterial.alpha = bitFireEffectAlpha;
    return;
  }

  const fadeProgress = Math.min(
    1,
    (time - bitFireShotStart) / (bitFireEffectDuration - bitFireShotStart)
  );
  const scale = bitFireMuzzleSphereScale * (1 - fadeProgress);
  muzzle.scaling.set(scale, scale, scale);
  muzzleMaterial.alpha = bitFireEffectAlpha * (1 - fadeProgress);
  if (fadeProgress >= 1) {
    muzzle.setEnabled(false);
  }
};

const updateBitFireShot = (bit: Bit, time: number) => {
  if (!bit.fireEffect) {
    return;
  }
  const { shot } = bit.fireEffect;
  if (time < bitFireShotStart) {
    shot.setEnabled(false);
    return;
  }

  const shotProgress = Math.min(
    1,
    (time - bitFireShotStart) / bitFireShotGrowDuration
  );
  const travelProgress = Math.min(
    1,
    (time - bitFireShotStart) / (bitFireEffectDuration - bitFireShotStart)
  );
  const scale = 1 + (bitFireShotMaxScale - 1) * shotProgress;
  shot.scaling.set(scale, scale, scale);
  shot.position.z = bitMuzzleOffsetZ + bitFireShotTravelDistance * travelProgress;
  shot.setEnabled(true);
  if (time >= bitFireEffectDuration) {
    shot.setEnabled(false);
  }
};

const updateBitFireEffect = (bit: Bit, delta: number) => {
  if (!bit.fireEffectActive || !bit.fireEffect) {
    return;
  }
  bit.fireEffectTimer = Math.min(
    bitFireEffectDuration,
    bit.fireEffectTimer + delta
  );
  const time = bit.fireEffectTimer;
  updateBitFireCone(bit, time);
  updateBitFireMuzzle(bit, time);
  updateBitFireShot(bit, time);
};

const startBitFireEffect = (bit: Bit) => {
  if (!bit.fireEffect) {
    bit.fireEffect = createBitFireEffect(
      bit.root.getScene(),
      bit.root,
      bit.id
    );
  }
  bit.fireEffectActive = true;
  bit.fireEffectTimer = 0;
  bit.fireEffect.cone.setEnabled(true);
  bit.fireEffect.muzzle.setEnabled(true);
  bit.fireEffect.shot.setEnabled(false);
};

const stopBitFireEffect = (bit: Bit) => {
  bit.fireEffectActive = false;
  bit.fireEffectTimer = 0;
  if (bit.fireEffect) {
    bit.fireEffect.cone.setEnabled(false);
    bit.fireEffect.muzzle.setEnabled(false);
    bit.fireEffect.shot.setEnabled(false);
  }
};

export const finalizeBitVisuals = (bit: Bit) => {
  stopBitFireEffect(bit);
  if (bit.spawnEffect) {
    bit.spawnEffect.dispose();
    bit.spawnEffect = null;
  }
  if (bit.spawnEffectMaterial) {
    bit.spawnEffectMaterial.dispose();
    bit.spawnEffectMaterial = null;
  }
  bit.spawnPhase = "done";
  bit.spawnTimer = 0;
  bit.body.isVisible = true;
  bit.body.scaling.set(1, 1, 1);
  bit.muzzle.isVisible = true;
  bit.muzzle.scaling.set(1, 1, 1);
};

const createBitRoot = (
  scene: Scene,
  materials: BitMaterials,
  index: number
) => {
  const root = new TransformNode(`bit_${index}`, scene);
  const body = MeshBuilder.CreateCylinder(
    `bitBody_${index}`,
    {
      diameterTop: 0,
      diameterBottom: 1.4,
      height: bitBodyHeight,
      tessellation: 24
    },
    scene
  );
  body.parent = root;
  body.material = materials.body;
  body.rotation.x = Math.PI / 2;

  const muzzle = MeshBuilder.CreateSphere(
    `bitMuzzle_${index}`,
    { diameter: bitMuzzleDiameter, segments: 16 },
    scene
  );
  muzzle.parent = root;
  muzzle.position.z = bitMuzzleOffsetZ;
  muzzle.material = materials.nozzle;

  return { root, body, muzzle };
};

const createSpawnEffect = (
  scene: Scene,
  bodyMaterial: StandardMaterial,
  index: number,
  root: TransformNode
) => {
  const effect = MeshBuilder.CreateSphere(
    `bitSpawn_${index}`,
    { diameter: spawnSphereStartDiameter, segments: 24 },
    scene
  );
  effect.parent = root;
  const material = new StandardMaterial(`bitSpawnMaterial_${index}`, scene);
  material.diffuseColor.copyFrom(bodyMaterial.diffuseColor);
  material.emissiveColor.copyFrom(bodyMaterial.emissiveColor);
  material.alpha = 0;
  effect.material = material;
  return { effect, material };
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
  const { root, body, muzzle } = createBitRoot(scene, materials, index);
  root.position = position;
  body.isVisible = false;
  muzzle.isVisible = false;
  body.scaling = new Vector3(0, 0, 0);
  muzzle.scaling = new Vector3(0, 0, 0);
  const spawnEffect = createSpawnEffect(
    scene,
    body.material as StandardMaterial,
    index,
    root
  );

  const wanderMode = pickBitWanderMode();
  const wanderDirection =
    wanderMode === "vertical"
      ? pickBitVerticalDirection()
      : wanderMode === "diagonal"
        ? pickBitDiagonalDirection()
        : pickBitWanderDirection();

  return {
    id: root.name,
    root,
    body,
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
    carpetAimTimer: 0,
    carpetAimStart: new Vector3(0, 0, 1),
    carpetCooldown: 0,
    lockedDirection: new Vector3(0, 0, 1),
    holdDirection: new Vector3(0, 0, 1),
    modeTimer: 0,
    speed: bitBaseSpeed,
    canSpawnCarpet: true,
    wanderMode,
    wanderDirection,
    wanderTimer:
      bitWanderTimerMin +
      Math.random() * (bitWanderTimerMax - bitWanderTimerMin),
    scanTimer: 0,
    scanDuration: 0,
    scanCooldown:
      bitScanIntervalMin +
      Math.random() * (bitScanIntervalMax - bitScanIntervalMin),
    scanBaseYaw: 0,
    scanYawOffset: 0,
    scanPitch: 0,
    alertRecovering: false,
    alertRecoverYaw: 0,
    alertCooldownPending: false,
    attackCooldown: 0,
    fireTimer: 0.6 + Math.random() * 1.2,
    fireInterval: 1.1 + Math.random() * 1.4,
    floatOffset: Math.random() * Math.PI * 2,
    baseHeight,
    isMoving: false,
    despawnTimer: 0,
      spawnPhase: "fade-in",
      spawnTimer: 0,
      spawnEffect: spawnEffect.effect,
      spawnEffectMaterial: spawnEffect.material,
      fireEffect: null,
      fireEffectActive: false,
      fireEffectTimer: 0,
      fireLockDirection: new Vector3(0, 0, 1)
    };
  };

export const createBitAt = (
  scene: Scene,
  materials: BitMaterials,
  index: number,
  position: Vector3,
  direction?: Vector3
): Bit => {
  const { root, body, muzzle } = createBitRoot(scene, materials, index);
  root.position.copyFrom(position);
  body.isVisible = false;
  muzzle.isVisible = false;
  body.scaling = new Vector3(0, 0, 0);
  muzzle.scaling = new Vector3(0, 0, 0);
  const spawnEffect = createSpawnEffect(
    scene,
    body.material as StandardMaterial,
    index,
    root
  );
  const hasDirection = direction && direction.lengthSquared() > 0.0001;
  const wanderMode: BitWanderMode = hasDirection
    ? "forward"
    : pickBitWanderMode();
  const wanderDirection = hasDirection
    ? direction.normalize()
    : wanderMode === "vertical"
      ? pickBitVerticalDirection()
      : wanderMode === "diagonal"
        ? pickBitDiagonalDirection()
        : pickRandomHorizontalDirection();

  return {
    id: root.name,
    root,
    body,
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
    carpetAimTimer: 0,
    carpetAimStart: new Vector3(0, 0, 1),
    carpetCooldown: 0,
    lockedDirection: new Vector3(0, 0, 1),
    holdDirection: new Vector3(0, 0, 1),
    modeTimer: 0,
    speed: bitBaseSpeed,
    canSpawnCarpet: true,
    wanderMode,
    wanderDirection,
    wanderTimer:
      bitWanderTimerMin +
      Math.random() * (bitWanderTimerMax - bitWanderTimerMin),
    scanTimer: 0,
    scanDuration: 0,
    scanCooldown:
      bitScanIntervalMin +
      Math.random() * (bitScanIntervalMax - bitScanIntervalMin),
    scanBaseYaw: 0,
    scanYawOffset: 0,
    scanPitch: 0,
    alertRecovering: false,
    alertRecoverYaw: 0,
    alertCooldownPending: false,
    attackCooldown: 0,
    fireTimer: 0.6 + Math.random() * 1.2,
    fireInterval: 1.1 + Math.random() * 1.4,
    floatOffset: Math.random() * Math.PI * 2,
    baseHeight: position.y,
    isMoving: false,
    despawnTimer: 0,
      spawnPhase: "fade-in",
      spawnTimer: 0,
      spawnEffect: spawnEffect.effect,
      spawnEffectMaterial: spawnEffect.material,
      fireEffect: null,
      fireEffectActive: false,
      fireEffectTimer: 0,
      fireLockDirection: new Vector3(0, 0, 1)
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
  spawnAlertBit: (position: Vector3, direction: Vector3) => Bit | null,
  spawnCarpetBit: (position: Vector3, direction: Vector3) => Bit,
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
  const visionRangeBoost = bitVisionRangeBoostMultiplier;
  const visionAngleBoost = bitVisionAngleBoostMultiplier;
  const averageTargetY =
    aliveTargets.length > 0
      ? aliveTargets.reduce((sum, target) => sum + target.position.y, 0) /
        aliveTargets.length
      : 0;
  const spawnedBits: Bit[] = [];
  const bitsToRemove: Bit[] = [];
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
    if (bit.mode === "attack-carpet-bomb") {
      clearCarpetState(bit);
    }
    bit.mode = "alert";
    bit.targetId = target.id;
    bit.alertRecovering = false;
    bit.alertRecoverYaw = getYawFromDirection(getHorizontalForward(bit));
    bit.alertCooldownPending = false;
    bit.modeTimer = alertGiveUpDuration;
    bit.fireInterval = 0;
    bit.fireTimer = 0;
  };
  const startAlert = (bit: Bit, target: TargetInfo) => {
    if (alertSignal.leaderId) {
      return false;
    }
    const candidates = bits.filter(
      (candidate) =>
        candidate.id !== bit.id &&
        candidate.mode !== "alert" &&
        !isCarpetFollower(candidate) &&
        candidate.attackCooldown <= 0
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
    const spawnDirection = bit.root.getDirection(new Vector3(0, 0, 1));
    const spawnOffset = new Vector3(
      (Math.random() - 0.5) * alertSpawnRadius * 2,
      0,
      (Math.random() - 0.5) * alertSpawnRadius * 2
    );
    const spawnPosition = bit.root.position.add(spawnOffset);
    const spawned = spawnAlertBit(spawnPosition, spawnDirection);
    const receiverLimit = spawned
      ? alertGatherTargetCount - 1
      : alertGatherTargetCount;
    const receiverCount = Math.min(receiverLimit, candidates.length);
    const receivers = candidates.slice(0, receiverCount);
    if (spawned) {
      spawnedBits.push(spawned);
      receivers.unshift(spawned);
    }
    if (receivers.length === 0) {
      return false;
    }
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
    if (bit.carpetCooldown > 0 || isWallNear(bit.root.position)) {
      setBitMode(bit, "attack-chase", target, alertSignal, soundEvents);
      return;
    }
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
      newBit.canSpawnCarpet = false;
      newBit.isRed = bit.isRed;
      newBit.statMultiplier = bit.statMultiplier;
      newBit.speed = bit.speed;
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
      const candidates = bits.filter(
        (candidate) =>
          candidate.mode !== "alert" &&
          !isCarpetFollower(candidate) &&
          candidate.attackCooldown <= 0
      );
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

  alertActive = alertLeader !== null && alertTarget !== null && alertTarget.alive;
  const alertReadyToResolve =
    alertLeader !== null &&
    alertLeader.mode === "alert" &&
    alertSignal.requiredCount > 0 &&
    alertSignal.gatheredIds.size >= alertSignal.requiredCount;
  if (alertLeader && alertTarget && alertLeader.mode === "alert") {
    const maxDistance = getBitVisionRange(alertLeader, visionRangeBoost) * 1.5;
    const maxDistanceSq = maxDistance * maxDistance;
    const distanceSq = Vector3.DistanceSquared(
      alertLeader.root.position,
      alertTarget.position
    );
    if (distanceSq > maxDistanceSq) {
      alertActive = false;
    }
  }

  const updateAttackChaseMode = (bit: Bit, frame: ModeFrame) => {
    bit.modeTimer -= delta;
    if (bit.modeTimer <= 0) {
      startAttackCooldown(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      return true;
    }
    const target = findTargetById(aliveTargets, bit.targetId);
    if (!target) {
      startAttackCooldown(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      return true;
    }
    const distanceSq = Vector3.DistanceSquared(
      bit.root.position,
      target.position
    );
    const distance = Math.sqrt(distanceSq);
    const withinFireRange = distance <= bitChaseFireRange;
    frame.moveSpeed = withinFireRange
      ? bitChaseSpeed * bit.statMultiplier
      : bitSearchSpeed * bit.statMultiplier;
    if (distance > bitChaseLoseRange) {
      startAttackCooldown(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      return true;
    }
    const targetDirection = target.position
      .subtract(bit.root.position)
      .normalize();
    const chaseDirection = getChaseDirection(
      bit.root.position,
      target.position
    );
    const heightDelta = target.position.y - bit.root.position.y;
    if (heightDelta < 0) {
      frame.extraHeightStep = Math.max(
        -bitChaseDescendSpeed * bit.statMultiplier * delta,
        heightDelta
      );
    }
    frame.moveDirection = chaseDirection;
    frame.aimDirection = targetDirection;
    const forward = bit.root.getDirection(new Vector3(0, 0, 1));
    const dot =
      forward.x * targetDirection.x +
      forward.y * targetDirection.y +
      forward.z * targetDirection.z;
    const visionCos = getBitVisionCos(bit, visionAngleBoost);
    frame.canFire = dot >= visionCos && withinFireRange;
    return false;
  };

  const updateAttackFixedMode = (bit: Bit, frame: ModeFrame) => {
    bit.modeTimer -= delta;
    if (bit.modeTimer <= 0) {
      startAttackCooldown(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      return true;
    }
    const lockedTarget = findTargetById(aliveTargets, bit.targetId);
    if (
      lockedTarget &&
      bit.isRed &&
      (bit.fireEffectActive ||
        bit.fireTimer - delta <= bitFireEffectDuration)
    ) {
      bit.lockedDirection = lockedTarget.position
        .subtract(bit.root.position)
        .normalize();
    }
    frame.moveDirection = new Vector3(0, 0, 0);
    frame.aimDirection = bit.lockedDirection.clone();
    frame.canFire = true;
    return false;
  };

  const updateAttackRandomMode = (bit: Bit, frame: ModeFrame) => {
    bit.modeTimer -= delta;
    if (bit.modeTimer <= 0) {
      startAttackCooldown(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      return true;
    }
    const randomFireLock =
      bit.fireEffectActive ||
      (bit.fireInterval > 0 &&
        bit.fireTimer - delta <= bitFireEffectDuration);
    if (randomFireLock) {
      frame.lockMovement = true;
      frame.moveDirection = new Vector3(0, 0, 0);
      frame.aimDirection = bit.root.getDirection(new Vector3(0, 0, 1));
    } else {
      bit.wanderTimer -= delta;
      if (bit.wanderTimer <= 0) {
        resetBitWander(bit, bitRandomWanderTimerMin, bitRandomWanderTimerMax);
      }
      if (bit.wanderMode === "vertical") {
        frame.moveSpeed =
          bitWanderVerticalSpeed *
          (bitRandomSpeed / bitSearchSpeed) *
          bit.statMultiplier;
        frame.moveDirection = bit.wanderDirection;
        frame.aimDirection = getHorizontalForward(bit);
      } else {
        frame.moveSpeed = bitRandomSpeed * bit.statMultiplier;
        frame.moveDirection = bit.wanderDirection;
        frame.aimDirection = bit.wanderDirection.clone();
      }
    }
    frame.turnSpeedScale = bitRandomTurnSpeedMultiplier;
    frame.canFire = true;
    return false;
  };

  const updateSearchMode = (bit: Bit, frame: ModeFrame) => {
    if (bit.scanDuration > 0) {
      bit.scanTimer = Math.min(
        bit.scanDuration,
        bit.scanTimer + delta
      );
      const progress = bit.scanTimer / bit.scanDuration;
      const sweep =
        Math.sin(progress * Math.PI * 2 + bit.scanYawOffset) * bitScanYawRange;
      const yaw = bit.scanBaseYaw + sweep;
      const pitch = bit.scanPitch;
      const horizontal = Math.cos(pitch);
      frame.moveDirection = new Vector3(0, 0, 0);
      frame.aimDirection = new Vector3(
        Math.cos(yaw) * horizontal,
        -Math.sin(pitch),
        Math.sin(yaw) * horizontal
      );
      if (bit.scanTimer >= bit.scanDuration) {
        bit.scanDuration = 0;
        bit.scanTimer = 0;
      }
    } else {
      bit.scanCooldown -= delta;
      if (bit.scanCooldown <= 0) {
        const forward = getHorizontalForward(bit);
        bit.scanBaseYaw = getYawFromDirection(forward);
        const heightDelta = bit.root.position.y - averageTargetY;
        bit.scanPitch =
          heightDelta > bitScanPitchHeightThreshold ? bitScanPitchDown : 0;
        bit.scanYawOffset = Math.random() * Math.PI * 2;
        bit.scanDuration =
          bitScanDurationMin +
          Math.random() * (bitScanDurationMax - bitScanDurationMin);
        bit.scanTimer = 0;
        bit.scanCooldown =
          bitScanIntervalMin +
          Math.random() * (bitScanIntervalMax - bitScanIntervalMin);
      }

      bit.wanderTimer -= delta;
      if (bit.wanderTimer <= 0) {
        resetBitWander(bit, bitWanderTimerMin, bitWanderTimerMax);
      }
      if (bit.wanderMode === "vertical") {
        frame.moveSpeed = bitWanderVerticalSpeed * bit.statMultiplier;
        frame.moveDirection = bit.wanderDirection;
        frame.aimDirection = getHorizontalForward(bit);
      } else {
        frame.moveDirection = bit.wanderDirection;
        frame.aimDirection = bit.wanderDirection.clone();
        frame.moveSpeed = bitSearchSpeed * bit.statMultiplier;
      }
    }

    const visibleTarget = findVisibleTarget(
      bit,
      aliveTargets,
      visionRangeBoost,
      visionAngleBoost
    );
    if (visibleTarget && bit.attackCooldown <= 0) {
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
      } else if (nextMode === "attack-carpet-bomb") {
        startCarpetBomb(bit, visibleTarget);
      } else {
        setBitMode(bit, nextMode, visibleTarget, alertSignal, soundEvents);
      }
      return true;
    }
    return false;
  };

  const updateAlertMode = (bit: Bit, frame: ModeFrame) => {
    bit.modeTimer -= delta;
    const isAlertLeader =
      alertSignal.leaderId !== null && bit.id === alertSignal.leaderId;
    const shouldRecover =
      bit.alertRecovering ||
      bit.modeTimer <= 0 ||
      !alertActive ||
      !alertLeader ||
      !alertTarget ||
      (alertReadyToResolve && isAlertLeader);
    if (shouldRecover) {
      if (!bit.alertRecovering) {
        bit.alertCooldownPending =
          bit.modeTimer <= 0 || !alertActive || !alertLeader || !alertTarget;
      }
      bit.alertRecovering = true;
      frame.moveDirection = new Vector3(0, 0, 0);
      frame.aimDirection = getDirectionFromYaw(bit.alertRecoverYaw);
      frame.canFire = false;
      const forward = bit.root.getDirection(new Vector3(0, 0, 1));
      if (Math.abs(forward.y) <= alertRecoverPitchThreshold) {
        bit.alertRecovering = false;
        if (bit.alertCooldownPending) {
          startAttackCooldown(bit);
          bit.alertCooldownPending = false;
        }
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        if (isAlertLeader) {
          clearAlertSignal();
        }
      }
      return true;
    }
    const toLeader = alertLeader.root.position.subtract(bit.root.position);
    toLeader.y = 0;
    const distance = Math.hypot(toLeader.x, toLeader.z);
    if (bit.id === alertLeader.id) {
      frame.moveDirection = new Vector3(0, 0, 0);
      frame.aimDirection = new Vector3(0, 1, 0);
      frame.canFire = false;
      return false;
    }
    const spottedTarget = findVisibleTarget(
      bit,
      aliveTargets,
      visionRangeBoost,
      visionAngleBoost
    );
    if (spottedTarget) {
      if (!alertSignal.gatheredIds.has(bit.id)) {
        alertSignal.gatheredIds.add(bit.id);
      }
      const nextMode = chooseAlertFollowMode(bit);
      if (nextMode === "attack-carpet-bomb") {
        startCarpetBomb(bit, spottedTarget);
      } else {
        setBitMode(bit, nextMode, spottedTarget, alertSignal, soundEvents);
      }
      return true;
    }
    frame.moveSpeed =
      bitSearchSpeed * bit.statMultiplier * alertReceiveSpeedMultiplier;
    if (distance <= alertGatherRadius) {
      if (!alertSignal.gatheredIds.has(bit.id)) {
        alertSignal.gatheredIds.add(bit.id);
      }
      const nextMode = chooseAlertFollowMode(bit);
      if (nextMode === "attack-carpet-bomb") {
        startCarpetBomb(bit, alertTarget);
      } else {
        setBitMode(bit, nextMode, alertTarget, alertSignal, soundEvents);
      }
      return true;
    }
    frame.moveDirection = getChaseDirection(
      bit.root.position,
      alertLeader.root.position
    );
    if (distance > 0.001) {
      frame.aimDirection = toLeader.normalize();
    } else {
      const forward = bit.root.getDirection(new Vector3(0, 0, 1));
      forward.y = 0;
      frame.aimDirection =
        forward.lengthSquared() > 0.0001 ? forward.normalize() : forward;
    }
    frame.canFire = false;
    return false;
  };

  const updateCarpetBombMode = (
    bit: Bit,
    frame: ModeFrame,
    carpetFollower: boolean
  ) => {
    frame.moveSpeed = getCarpetBombSpeed(bit);
    const leaderId = bit.carpetLeaderId ?? bit.id;
    const leader =
      bits.find((candidate) => candidate.id === leaderId) ?? null;
    if (!leader || leader.mode !== "attack-carpet-bomb") {
      if (carpetFollower) {
        startCarpetFollowerDespawn(bit);
        return true;
      }
      clearCarpetState(bit);
      startAttackCooldown(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      return true;
    }
    const leaderPending =
      bits.some(
        (candidate) =>
          isCarpetFollower(candidate) &&
          candidate.carpetLeaderId === leader.id &&
          candidate.spawnPhase !== "done"
      ) ||
      spawnedBits.some(
        (candidate) =>
          isCarpetFollower(candidate) &&
          candidate.carpetLeaderId === leader.id &&
          candidate.spawnPhase !== "done"
      );
    if (leaderPending) {
      frame.moveDirection = new Vector3(0, 0, 0);
      if (leader.id === bit.id) {
        const aimBase = new Vector3(0, -1, 0);
        if (bit.carpetAimTimer < carpetAimTurnDuration) {
          bit.carpetAimTimer = Math.min(
            carpetAimTurnDuration,
            bit.carpetAimTimer + delta
          );
          const progress = bit.carpetAimTimer / carpetAimTurnDuration;
          const blended = Vector3.Lerp(bit.carpetAimStart, aimBase, progress);
          frame.aimDirection = blended.normalize();
        } else {
          frame.aimDirection = aimBase;
        }
      } else {
        frame.aimDirection = new Vector3(0, -1, 0);
      }
      frame.canFire = false;
      return false;
    }
    const carpetTarget = findTargetById(aliveTargets, leader.carpetTargetId);
    if (!carpetTarget) {
      if (carpetFollower) {
        startCarpetFollowerDespawn(bit);
        return true;
      }
      clearCarpetState(bit);
      startAttackCooldown(bit);
      setBitMode(bit, "search", null, alertSignal, soundEvents);
      return true;
    }
    let leaderDirection =
      leader.carpetDirection.lengthSquared() > 0.0001
        ? leader.carpetDirection.normalize()
        : leader.root.getDirection(new Vector3(0, 0, 1));

    if (leader.id === bit.id) {
      const toTarget = carpetTarget.position.subtract(bit.root.position);
      toTarget.y = 0;
      let passDot = 0;
      if (toTarget.lengthSquared() > 0.0001) {
        const targetDirection = toTarget.normalize();
        passDot =
          leaderDirection.x * toTarget.x + leaderDirection.z * toTarget.z;
        if (passDot >= 0) {
          const steered = steerCarpetDirection(
            leaderDirection,
            targetDirection,
            delta
          );
          leader.carpetDirection.copyFrom(steered);
          leaderDirection = leader.carpetDirection.normalize();
          passDot =
            leader.carpetDirection.x * toTarget.x +
            leader.carpetDirection.z * toTarget.z;
        }
      }
      if (passDot < 0) {
        leader.carpetPassTimer += delta;
      } else {
        leader.carpetPassTimer = 0;
      }
      if (leader.carpetPassTimer >= carpetBombPassDelay) {
        clearCarpetState(bit);
        startAttackCooldown(bit);
        setBitMode(bit, "search", null, alertSignal, soundEvents);
        return true;
      }
    }
    const right = new Vector3(-leaderDirection.z, 0, leaderDirection.x);

    if (leader.id === bit.id) {
      frame.moveDirection = leader.carpetDirection;
    } else {
      if (leader.carpetPassTimer >= carpetBombPassDelay) {
        startCarpetFollowerDespawn(bit);
        return true;
      }
      const offset = right
        .scale(bit.carpetOffset.x)
        .add(leader.carpetDirection.scale(bit.carpetOffset.z));
      const desiredPosition = leader.root.position.add(offset);
      const toDesired = desiredPosition.subtract(bit.root.position);
      toDesired.y = 0;
      if (toDesired.lengthSquared() > 0.0001) {
        frame.moveDirection = toDesired.normalize();
      } else {
        frame.moveDirection = leader.carpetDirection;
      }
    }
    const tiltDirection = new Vector3(
      leaderDirection.x,
      -1,
      leaderDirection.z
    ).normalize();
    const aimBase = Vector3.Lerp(
      new Vector3(0, -1, 0),
      tiltDirection,
      carpetBombAimBlend
    );
    if (leader.id === bit.id && bit.carpetAimTimer < carpetAimTurnDuration) {
      bit.carpetAimTimer = Math.min(
        carpetAimTurnDuration,
        bit.carpetAimTimer + delta
      );
      const progress = bit.carpetAimTimer / carpetAimTurnDuration;
      const blended = Vector3.Lerp(bit.carpetAimStart, aimBase, progress);
      frame.aimDirection = blended.normalize();
    } else {
      frame.aimDirection = aimBase;
    }
    frame.canFire = true;
    return false;
  };

  for (const bit of bits) {
    const frame = createModeFrame(bit);
    const carpetFollower = isCarpetFollower(bit);
    const hitTarget = targets.find(
      (target) => target.hitById === bit.id && isHitState(target.state)
    );
    if (bit.carpetCooldown > 0) {
      bit.carpetCooldown = Math.max(0, bit.carpetCooldown - delta);
    }
    if (bit.attackCooldown > 0) {
      bit.attackCooldown = Math.max(0, bit.attackCooldown - delta);
    }
    if (bit.despawnTimer > 0) {
      if (updateCarpetFollowerDespawn(bit, delta)) {
        bitsToRemove.push(bit);
      }
      continue;
    }
    const spawnActive = bit.spawnPhase !== "done";
    if (spawnActive) {
      updateSpawnEffect(bit, delta);
      if (bit.mode === "attack-carpet-bomb" && carpetFollower) {
        const leaderId = bit.carpetLeaderId ?? bit.id;
        const leader =
          bits.find((candidate) => candidate.id === leaderId) ?? null;
        if (!leader || leader.mode !== "attack-carpet-bomb") {
          startCarpetFollowerDespawn(bit);
          continue;
        }
      }
    }

    if (carpetFollower && bit.mode !== "attack-carpet-bomb") {
      startCarpetFollowerDespawn(bit);
      continue;
    }

    if (spawnActive) {
      frame.moveDirection = new Vector3(0, 0, 0);
      frame.aimDirection =
        bit.mode === "attack-carpet-bomb"
          ? new Vector3(0, -1, 0)
          : bit.root.getDirection(new Vector3(0, 0, 1));
      frame.canFire = false;
    } else if (bit.mode !== "alert") {
      if (hitTarget && bit.mode !== "hold") {
        if (carpetFollower && bit.mode === "attack-carpet-bomb") {
          startCarpetFollowerDespawn(bit);
          continue;
        }
        bit.mode = "hold";
        bit.targetId = hitTarget.id;
        bit.holdDirection = bit.root.getDirection(new Vector3(0, 0, 1));
      } else if (!hitTarget && bit.mode === "hold") {
        setBitMode(bit, "search", null, alertSignal, soundEvents);
      }
    }

    if (!spawnActive) {
      if (bit.mode === "hold") {
        frame.moveDirection = new Vector3(0, 0, 0);
        frame.aimDirection = bit.holdDirection.clone();
        frame.canFire = false;
      } else if (bit.mode === "search") {
        if (updateSearchMode(bit, frame)) {
          continue;
        }
      } else if (bit.mode === "alert") {
        if (updateAlertMode(bit, frame)) {
          continue;
        }
      } else if (bit.mode === "attack-chase") {
        if (updateAttackChaseMode(bit, frame)) {
          continue;
        }
      } else if (bit.mode === "attack-fixed") {
        if (updateAttackFixedMode(bit, frame)) {
          continue;
        }
      } else if (bit.mode === "attack-random") {
        if (updateAttackRandomMode(bit, frame)) {
          continue;
        }
      } else if (bit.mode === "attack-carpet-bomb") {
        if (updateCarpetBombMode(bit, frame, carpetFollower)) {
          continue;
        }
      }
    }

    if (bit.fireEffectActive && !frame.canFire) {
      stopBitFireEffect(bit);
    }

    if (
      !spawnActive &&
      bit.mode !== "attack-fixed" &&
      bit.mode !== "hold" &&
      bit.mode !== "attack-carpet-bomb" &&
      bit.mode !== "alert" &&
      !frame.lockMovement
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
        frame.moveDirection = frame.moveDirection.add(avoidVector).normalize();
        frame.aimDirection = frame.moveDirection.clone();
      }
    }

    const movingNow = frame.moveDirection.length() > 0.001;
    if (movingNow && !bit.isMoving) {
      soundEvents.onMoveStart(bit);
    }
    bit.isMoving = movingNow;

    const moveStep = frame.moveDirection.scale(frame.moveSpeed * delta);
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

    if (bit.mode === "attack-carpet-bomb") {
      const heightStep = carpetBombAscendSpeed * delta;
      if (bit.baseHeight < maxY) {
        bit.baseHeight = Math.min(maxY, bit.baseHeight + heightStep);
      } else if (bit.baseHeight > maxY) {
        bit.baseHeight = Math.max(maxY, bit.baseHeight - heightStep);
      }
    } else {
      bit.baseHeight += moveStep.y + frame.extraHeightStep;
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
      bit.mode === "attack-carpet-bomb" &&
      (hitWall || isWallNear(bit.root.position))
    ) {
      if (carpetFollower) {
        startCarpetFollowerDespawn(bit);
        continue;
      }
      bit.carpetCooldown = carpetBombWallCooldown;
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
        bit.mode !== "attack-carpet-bomb"
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
      if (bit.mode !== "attack-carpet-bomb") {
        bit.wanderDirection.y *= -1;
      }
    }

    const bobAmplitude =
      bit.mode === "alert" || bit.mode === "attack-carpet-bomb"
        ? bitBobAmplitudeUrgent
        : bitBobAmplitudeNormal;
    const bob = Math.sin(elapsed * 0.9 + bit.floatOffset) * bobAmplitude;
    const clampedBase = Math.min(
      Math.max(bit.baseHeight, minY - bob),
      maxY - bob
    );
    bit.baseHeight = clampedBase;
    bit.root.position.y = bit.baseHeight + bob;

    if (bit.fireEffectActive) {
      frame.aimDirection = bit.fireLockDirection;
    }

    if (frame.aimDirection.length() > 0.001) {
      updateBitRotation(bit, frame.aimDirection, delta, frame.turnSpeedScale);
    }

    if (!spawnActive && bit.fireInterval > 0) {
      bit.fireTimer -= delta;
      if (bit.fireEffectActive) {
        updateBitFireEffect(bit, delta);
      }
      if (
        frame.canFire &&
        !bit.fireEffectActive &&
        bit.fireTimer <= bitFireEffectDuration
      ) {
        const lockDirection = bit.root.getDirection(new Vector3(0, 0, 1));
        if (lockDirection.length() > 0.001) {
          bit.fireLockDirection.copyFrom(lockDirection.normalize());
          startBitFireEffect(bit);
        }
      }
      const effectReady =
        !bit.fireEffectActive ||
        bit.fireEffectTimer >= bitFireEffectDuration;
      if (bit.fireTimer <= 0 && frame.canFire && effectReady) {
        const muzzlePosition = bit.muzzle.getAbsolutePosition();
        const beamDirection = bit.fireEffectActive
          ? bit.fireLockDirection
          : bit.root.getDirection(new Vector3(0, 0, 1)).normalize();
        if (beamDirection.length() > 0.001) {
          soundEvents.onBeamFire(bit, bit.targetId === "player");
          spawnBeam(muzzlePosition, beamDirection, bit.id);
        }
        stopBitFireEffect(bit);
        if (bit.mode === "attack-carpet-bomb") {
          bit.fireInterval = getCarpetBombFireInterval(bit);
        }
        bit.fireTimer = bit.fireInterval;
      }
    }

  }

  if (alertSignal.leaderId && bits.every((bit) => bit.mode !== "alert")) {
    clearAlertSignal();
  }

  if (bitsToRemove.length > 0) {
    const removeIds = new Set(bitsToRemove.map((bit) => bit.id));
      for (const bit of bitsToRemove) {
        if (bit.spawnEffect) {
          bit.spawnEffect.dispose();
        }
        if (bit.spawnEffectMaterial) {
          bit.spawnEffectMaterial.dispose();
        }
        if (bit.fireEffect) {
          bit.fireEffect.cone.dispose();
          bit.fireEffect.coneMaterial.dispose();
          bit.fireEffect.muzzle.dispose();
          bit.fireEffect.muzzleMaterial.dispose();
          bit.fireEffect.shot.dispose();
          bit.fireEffect.shotMaterial.dispose();
          bit.fireEffect = null;
        }
        bit.root.dispose();
      }
    for (let index = bits.length - 1; index >= 0; index -= 1) {
      if (removeIds.has(bits[index].id)) {
        bits.splice(index, 1);
      }
    }
  }

  if (spawnedBits.length > 0) {
    bits.push(...spawnedBits);
  }
};
