import type {
  FloatArray,
  Mesh,
  PointLight,
  Sprite,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import type { HitFadeOrb } from "./hitEffects";

export type FloorCell = {
  row: number;
  col: number;
};

export type CharacterState =
  | "normal"
  | "evade"
  | "hit-a"
  | "hit-b"
  | "brainwash-in-progress"
  | "brainwash-complete-gun"
  | "brainwash-complete-no-gun"
  | "brainwash-complete-haigure"
  | "brainwash-complete-haigure-formation";

export type NpcState = CharacterState;

export const isAliveState = (state: CharacterState) =>
  state === "normal" || state === "evade";

export const isHitState = (state: CharacterState) =>
  state === "hit-a" || state === "hit-b";

export const isBrainwashState = (state: CharacterState) =>
  state === "brainwash-in-progress" ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun" ||
  state === "brainwash-complete-haigure" ||
  state === "brainwash-complete-haigure-formation";

export type NpcBrainwashMode = "search" | "chase";

export type NpcAlertState = "none" | "send" | "receive";

export type Npc = {
  sprite: Sprite;
  state: NpcState;
  voiceId: string;
  portraitDirectory: string;
  cell: FloorCell;
  goalCell: FloorCell;
  target: Vector3;
  speed: number;
  hitTimer: number;
  fadeTimer: number;
  hitFadeDuration: number;
  hitById: string | null;
  hitEffect: Mesh | null;
  hitEffectMaterial: StandardMaterial | null;
  hitLight: PointLight | null;
  fadeOrbs: HitFadeOrb[];
  brainwashTimer: number;
  brainwashMode: NpcBrainwashMode;
  brainwashTargetId: string | null;
  wanderDirection: Vector3;
  wanderTimer: number;
  moveDirection: Vector3;
  path: Vector3[];
  pathIndex: number;
  evadeTimer: number;
  fireTimer: number;
  fireInterval: number;
  blockTimer: number;
  blockTargetId: string | null;
  breakAwayTimer: number;
  breakAwayDirection: Vector3;
  blockedByPlayer: boolean;
  alertState: NpcAlertState;
  alertReturnBrainwashMode: NpcBrainwashMode | null;
  alertReturnTargetId: string | null;
  noGunTouchBrainwashTimer: number;
};

export type BitMode =
  | "search"
  | "search-bruteforce"
  | "attack-chase"
  | "attack-fixed"
  | "attack-random"
  | "alert-send"
  | "alert-receive"
  | "attack-carpet-bomb"
  | "hold";

export type BitWanderMode = "forward" | "vertical" | "diagonal";

export type BitSpawnPhase = "fade-in" | "hold" | "shrink" | "done";

export type BitFireEffect = {
  cone: Mesh;
  coneMaterial: StandardMaterial;
  conePositions: FloatArray;
  coneColors: number[];
  muzzle: Mesh;
  muzzleMaterial: StandardMaterial;
  shot: Mesh;
  shotMaterial: StandardMaterial;
};

export type Bit = {
  id: string;
  root: TransformNode;
  body: Mesh;
  muzzle: Mesh;
  mode: BitMode;
  targetId: string | null;
  isRed: boolean;
  statMultiplier: number;
  carpetLeaderId: string | null;
  carpetOffset: Vector3;
  carpetTargetId: string | null;
  carpetDirection: Vector3;
  carpetPassTimer: number;
  carpetAimTimer: number;
  carpetAimStart: Vector3;
  carpetTargetHeight: number;
  carpetReturnHeight: number;
  carpetReturnActive: boolean;
  carpetCooldown: number;
  lockedDirection: Vector3;
  holdDirection: Vector3;
  holdTimer: number;
  lastHoldTargetId: string | null;
  modeTimer: number;
  speed: number;
  canSpawnCarpet: boolean;
  wanderMode: BitWanderMode;
  wanderDirection: Vector3;
  wanderTimer: number;
  scanTimer: number;
  scanDuration: number;
  scanCooldown: number;
  scanBaseYaw: number;
  scanYawOffset: number;
  scanPitch: number;
  alertRecovering: boolean;
  alertRecoverYaw: number;
  alertCooldownPending: boolean;
  alertReturnMode: BitMode | null;
  alertReturnTargetId: string | null;
  attackCooldown: number;
  fireTimer: number;
  fireInterval: number;
  floatOffset: number;
  baseHeight: number;
  isMoving: boolean;
  despawnTimer: number;
  spawnPhase: BitSpawnPhase;
  spawnTimer: number;
  spawnEffect: Mesh | null;
  spawnEffectMaterial: StandardMaterial | null;
  fireEffect: BitFireEffect | null;
  fireEffectActive: boolean;
  fireEffectTimer: number;
  fireLockDirection: Vector3;
  bruteforceActive: boolean;
  bruteforceCheckTimer: number;
  bruteforcePath: FloorCell[];
  bruteforcePathIndex: number;
};

export type BitSoundEvents = {
  onMoveStart: (bit: Bit) => void;
  onAlert: (bit: Bit) => void;
  onTargetPlayer: (bit: Bit) => void;
  onBeamFire: (bit: Bit, targetingPlayer: boolean) => void;
};

export type Beam = {
  mesh: Mesh;
  group: "normal" | "trap";
  persistent: boolean;
  persistentTimer: number;
  velocity: Vector3;
  bodyRadius: number;
  startPosition: Vector3;
  travelDistance: number;
  length: number;
  currentLength: number;
  retracting: boolean;
  retractLeadRemaining: number;
  impactPosition: Vector3;
  active: boolean;
  sourceId: string | null;
  tip: Mesh;
  tipRadius: number;
  trailTimer: number;
  trailEnabled: boolean;
  impactEnabled: boolean;
};

export type BeamTrail = {
  mesh: Mesh;
  timer: number;
  velocity: Vector3;
  age: number;
};

export type BeamImpactOrb = {
  mesh: Mesh;
  velocity: Vector3;
  timer: number;
};

export type TargetInfo = {
  id: string;
  position: Vector3;
  alive: boolean;
  state: CharacterState;
  hitById: string | null;
};

export type AlertSignal = {
  leaderId: string | null;
  targetId: string | null;
  requiredCount: number;
  receiverIds: string[];
  gatheredIds: Set<string>;
};

export type AlertRequest = {
  targetId: string;
  blockerId: string;
};

export type ExternalAlert = {
  leaderId: string;
  targetId: string;
  receiverIds: string[];
};

export type BitMaterials = {
  body: StandardMaterial;
  nozzle: StandardMaterial;
};

export type StageBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
};

export type MovementBlocker = {
  position: Vector3;
  radius: number;
  sourceId: string;
};
