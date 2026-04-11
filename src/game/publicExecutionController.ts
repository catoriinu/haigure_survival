import {
  Color3,
  Color4,
  Mesh,
  Scene,
  Sprite,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
import {
  beginBeamRetract,
  bitFireEffectDuration,
  createBeam,
  isAliveState,
  npcHitColorA,
  npcHitColorB,
  npcHitDuration,
  npcHitEffectAlpha,
  npcHitFadeDuration,
  npcHitFadeOrbConfig,
  npcHitFlickerInterval,
  npcHitLightIntensity,
  startBitFireEffect,
  stopBitFireEffect,
  updateBitFireEffect
} from "./entities";
import {
  createBeamHitRadii,
  getBeamImpactPosition,
  isBeamHittingTargetExcludingSource
} from "./beamCollision";
import {
  type ExecutionBlockKind,
  type ExecutionConfig,
  type ExecutionTarget
} from "./flow";
import {
  HitFadeOrbConfig,
  HitSequenceConfig,
  calculateHitEffectDiameter,
  createHitSequenceState,
  resetHitSequenceState,
  startHitSequence,
  updateHitSequence
} from "./hitEffects";
import {
  resolvePlayerBeamHits,
  type BeamHitCandidate
} from "./playerBeamHits";
import {
  publicExecutionBeamDelayMax,
  publicExecutionBeamDelayMin,
  publicExecutionMaxSurvivors,
  publicExecutionSimultaneousChance,
  publicExecutionTransitionDelay
} from "./publicExecutionConfig";
import { getPortraitCellIndex } from "./portraitSprites";
import type { Beam, Bit, BitSoundEvents, CharacterState, Npc } from "./types";
import {
  getEffectiveExecuteBitCount,
  isPlayerExecutionMethod,
  isPlayerShooterExecutionMethod,
  normalizeExecuteSettings,
  type ExecuteSettings
} from "../ui/executeSettings";

type PublicExecutionScenario = ExecutionConfig;
type ExecutionHitEntry = {
  target: ExecutionTarget;
  sequence: ReturnType<typeof createHitSequenceState>;
  completed: boolean;
};
type ExecutionTargetState = {
  target: ExecutionTarget;
  key: string;
  completed: boolean;
  firePending: boolean;
  fireCountdown: number;
  fireEffectActive: boolean;
  fireEffectTimer: number;
  beamTargetPosition: Vector3;
  shooterBitIndices: number[];
  shooterNpcIndices: number[];
};
type HudPhaseState = {
  hudVisible: boolean;
  helpPanelText: string | null;
  crosshairVisible: boolean;
};
type PlayerHitConfig = {
  duration: number;
  fadeDuration: number;
  flickerInterval: number;
  colorA: Color3;
  colorB: Color3;
  effectAlpha: number;
  lightIntensity: number;
  fadeOrbConfig: HitFadeOrbConfig;
};
type PublicExecutionFlow = {
  enterExecution: (scenario: ExecutionConfig) => void;
  updateExecution: () => void;
  isFading: () => boolean;
};

type PublicExecutionControllerOptions = {
  scene: Scene;
  npcs: Npc[];
  bits: Bit[];
  beams: Beam[];
  beamMaterial: StandardMaterial;
  bitSoundEvents: BitSoundEvents;
  getGameFlow: () => PublicExecutionFlow;
  getPlayerAvatar: () => Sprite;
  getPlayerEyeBasePosition: () => Vector3;
  getPlayerState: () => CharacterState;
  setPlayerState: (state: CharacterState) => void;
  getEyeHeight: () => number;
  playerHitConfig: PlayerHitConfig;
  resetPlayerForInstantExecution: (state: CharacterState) => void;
  resetPlayerMovement: () => void;
  updatePlayerMovement: (delta: number) => void;
  rebuildInstantExecutionBits: (count: number) => void;
  updateBeams: (
    delta: number,
    shouldProcessOrb: (position: Vector3) => boolean
  ) => void;
  playBeamNonTarget: (position: Vector3) => void;
  updateHudPhaseOverride: (patch: Partial<HudPhaseState>) => void;
};

export type PublicExecutionController = {
  prepareInstantScenario: (executeSettings: ExecuteSettings) => ExecutionConfig;
  findCandidate: () => ExecutionConfig | null;
  advanceAutoTrigger: (delta: number) => ExecutionConfig | null;
  enter: (scenario: ExecutionConfig) => void;
  update: (
    delta: number,
    shouldProcessOrb: (position: Vector3) => boolean
  ) => void;
  reset: () => void;
  getScenario: () => ExecutionConfig | null;
  getNpcVoiceStateOverride: (npcId: string) => CharacterState | null;
};

const buildCharacterTargetKey = (
  target: { kind: "player" } | { kind: "npc"; npcIndex: number }
) => (target.kind === "player" ? "player" : `npc_${target.npcIndex}`);

const npcSpriteColorNormal = new Color4(1, 1, 1, 1);

export const createPublicExecutionController = ({
  scene,
  npcs,
  bits,
  beams,
  beamMaterial,
  bitSoundEvents,
  getGameFlow,
  getPlayerAvatar,
  getPlayerEyeBasePosition,
  getPlayerState,
  setPlayerState,
  getEyeHeight,
  playerHitConfig,
  resetPlayerForInstantExecution,
  resetPlayerMovement,
  updatePlayerMovement,
  rebuildInstantExecutionBits,
  updateBeams,
  playBeamNonTarget,
  updateHudPhaseOverride
}: PublicExecutionControllerOptions): PublicExecutionController => {
  let publicExecutionTriggerKey: string | null = null;
  let publicExecutionTriggerTimer = 0;
  let executionScenario: PublicExecutionScenario | null = null;
  let executionWaitForFade = false;
  const executionShooterTargetKeys = new Map<string, string>();
  let executionTargetStates: ExecutionTargetState[] = [];
  let executionHitEntries: ExecutionHitEntry[] = [];
  let executionSimultaneousPattern = false;
  let executionResolved = false;
  let executionAllowPlayerMove = false;
  let executionNpcShooterIndices: number[] = [];
  const executionNpcVoiceStateOverrides = new Map<string, CharacterState>();
  const executionCollisionPosition = new Vector3(0, 0, 0);

  const getSpriteBeamHitRadii = (sprite: Sprite) =>
    createBeamHitRadii(sprite.width, sprite.height);

  const disposeExecutionHitEffects = () => {
    for (const entry of executionHitEntries) {
      resetHitSequenceState(entry.sequence);
    }
    executionHitEntries = [];
  };

  const buildExecutionTargetKey = (target: ExecutionTarget) =>
    buildCharacterTargetKey(target);

  const setNpcStateImmediate = (npc: Npc, state: CharacterState) => {
    npc.state = state;
    npc.sprite.cellIndex = getPortraitCellIndex(state);
  };

  const resetNpcForInstantExecution = (npc: Npc) => {
    npc.hitTimer = 0;
    npc.fadeTimer = 0;
    npc.hitById = null;
    npc.brainwashTimer = 0;
    npc.brainwashMode = "search";
    npc.brainwashTargetId = null;
    npc.blockTimer = 0;
    npc.blockTargetId = null;
    npc.breakAwayTimer = 0;
    npc.blockedByPlayer = false;
    npc.alertState = "none";
    npc.noGunTouchBrainwashTimer = 0;
    npc.sprite.color.copyFrom(npcSpriteColorNormal);
  };

  const buildInstantExecutionSurvivorTargets = (
    executeSettings: ExecuteSettings,
    targetNpcIndices: number[]
  ): ExecutionTarget[] => {
    if (!isPlayerExecutionMethod(executeSettings.method)) {
      return targetNpcIndices.map(
        (npcIndex) => ({ kind: "npc", npcIndex }) as const
      );
    }
    const npcTargets = targetNpcIndices.map(
      (npcIndex) => ({ kind: "npc", npcIndex }) as const
    );
    const splitIndex = Math.floor((npcTargets.length + 1) * 0.5);
    return [
      ...npcTargets.slice(0, splitIndex),
      { kind: "player" } as const,
      ...npcTargets.slice(splitIndex)
    ];
  };

  const prepareInstantScenario = (
    executeSettings: ExecuteSettings
  ): PublicExecutionScenario => {
    const normalized = normalizeExecuteSettings(executeSettings);
    const targetNpcIndices = Array.from(
      { length: normalized.targetNpcCount },
      (_, index) => index
    );
    const targetNpcIndexSet = new Set(targetNpcIndices);
    const spectatorNpcIndices = npcs
      .map((_, index) => index)
      .filter((index) => !targetNpcIndexSet.has(index));
    const survivorTargets = buildInstantExecutionSurvivorTargets(
      normalized,
      targetNpcIndices
    );
    const blockKindsByTargetKey: Record<string, ExecutionBlockKind> = {};

    for (const npc of npcs) {
      resetNpcForInstantExecution(npc);
    }

    for (const targetNpcIndex of targetNpcIndices) {
      setNpcStateImmediate(npcs[targetNpcIndex], "normal");
    }

    if (isPlayerExecutionMethod(normalized.method)) {
      resetPlayerForInstantExecution("normal");
      const blockTargetKeys = survivorTargets.map((target) => {
        const key = buildExecutionTargetKey(target);
        blockKindsByTargetKey[key] = "npc";
        return key;
      });
      for (let index = 0; index < spectatorNpcIndices.length; index += 1) {
        const npc = npcs[spectatorNpcIndices[index]];
        if (index < blockTargetKeys.length) {
          setNpcStateImmediate(npc, "brainwash-complete-no-gun");
          npc.blockTargetId = blockTargetKeys[index]!;
          continue;
        }
        setNpcStateImmediate(npc, "brainwash-complete-haigure-formation");
      }
    } else if (isPlayerShooterExecutionMethod(normalized.method)) {
      resetPlayerForInstantExecution("brainwash-complete-gun");
      for (const target of survivorTargets) {
        blockKindsByTargetKey[buildExecutionTargetKey(target)] = "player";
        if (target.kind === "npc") {
          npcs[target.npcIndex].blockedByPlayer = true;
        }
      }
      for (const spectatorNpcIndex of spectatorNpcIndices) {
        setNpcStateImmediate(
          npcs[spectatorNpcIndex],
          "brainwash-complete-haigure-formation"
        );
      }
    } else {
      resetPlayerForInstantExecution("brainwash-complete-haigure-formation");
      const blockTargetKeys = survivorTargets.map((target) => {
        const key = buildExecutionTargetKey(target);
        blockKindsByTargetKey[key] = "npc";
        return key;
      });
      for (let index = 0; index < spectatorNpcIndices.length; index += 1) {
        const npc = npcs[spectatorNpcIndices[index]];
        if (index < blockTargetKeys.length) {
          setNpcStateImmediate(npc, "brainwash-complete-no-gun");
          npc.blockTargetId = blockTargetKeys[index]!;
          continue;
        }
        setNpcStateImmediate(npc, "brainwash-complete-haigure-formation");
      }
    }

    rebuildInstantExecutionBits(getEffectiveExecuteBitCount(normalized));

    return {
      variant: isPlayerExecutionMethod(normalized.method)
        ? "player-survivor"
        : isPlayerShooterExecutionMethod(normalized.method)
          ? "npc-survivor-player-block"
          : "npc-survivor-npc-block",
      survivorTargets,
      blockKindsByTargetKey,
      playerExecutionRole: isPlayerExecutionMethod(normalized.method)
        ? "target"
        : isPlayerShooterExecutionMethod(normalized.method)
          ? "shooter"
          : "observer",
      usesNpcVolley:
        normalized.method === "player-npc" || normalized.method === "npc-npc"
    };
  };

  const setExecutionTargetState = (
    target: ExecutionTarget,
    state: CharacterState
  ) => {
    if (target.kind === "player") {
      setPlayerState(state);
      return;
    }
    const npc = npcs[target.npcIndex];
    npc.state = state;
    npc.sprite.cellIndex = getPortraitCellIndex(state);
  };

  const getExecutionTargetStateEntry = (key: string) =>
    executionTargetStates.find((state) => state.key === key) ?? null;

  const getExecutionTargetEyePosition = (
    target: ExecutionTarget,
    out: Vector3
  ) => {
    const eyeHeight = getEyeHeight();
    if (target.kind === "player") {
      const eyeBasePosition = getPlayerEyeBasePosition();
      out.set(eyeBasePosition.x, eyeHeight, eyeBasePosition.z);
      return;
    }
    const sprite = npcs[target.npcIndex].sprite;
    out.set(sprite.position.x, eyeHeight, sprite.position.z);
  };

  const getExecutionTargetCenterPosition = (
    target: ExecutionTarget,
    out: Vector3
  ) => {
    if (target.kind === "player") {
      const eyeBasePosition = getPlayerEyeBasePosition();
      out.set(
        eyeBasePosition.x,
        getPlayerAvatar().height * 0.5,
        eyeBasePosition.z
      );
      return;
    }
    out.copyFrom(npcs[target.npcIndex].sprite.position);
  };

  const isExecutionTargetInHitSequence = (key: string) =>
    executionHitEntries.some(
      (entry) => !entry.completed && buildExecutionTargetKey(entry.target) === key
    );

  const getRandomExecutionBeamDelay = () =>
    publicExecutionBeamDelayMin +
    Math.random() * (publicExecutionBeamDelayMax - publicExecutionBeamDelayMin);

  const assignExecutionShooters = <T,>(shooters: T[], targetCount: number) => {
    const assignments = Array.from({ length: targetCount }, () => [] as T[]);
    for (let index = 0; index < shooters.length; index += 1) {
      assignments[index % targetCount].push(shooters[index]);
    }
    return assignments;
  };

  const shuffleExecutionShooters = <T,>(shooters: T[]) => {
    const shuffled = [...shooters];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = shuffled[index];
      shuffled[index] = shuffled[swapIndex]!;
      shuffled[swapIndex] = current!;
    }
    return shuffled;
  };

  const buildPlayerHitSequenceConfig = (
    effectName: string,
    hitDuration: number,
    fadeDuration: number
  ): HitSequenceConfig => {
    const playerAvatar = getPlayerAvatar();
    const effectDiameter = calculateHitEffectDiameter(
      playerAvatar.width,
      playerAvatar.height
    );
    return {
      hitDuration,
      fadeDuration,
      flickerInterval: playerHitConfig.flickerInterval,
      colorA: playerHitConfig.colorA,
      colorB: playerHitConfig.colorB,
      effectAlpha: playerHitConfig.effectAlpha,
      effectDiameter,
      lightIntensity: playerHitConfig.lightIntensity,
      lightRange: effectDiameter * 1.2,
      fadeOrbConfig: playerHitConfig.fadeOrbConfig,
      effectName,
      sideOrientation: Mesh.DOUBLESIDE,
      backFaceCulling: false
    };
  };

  const buildNpcHitSequenceConfig = (
    effectName: string,
    hitDuration: number,
    fadeDuration: number,
    sprite: Sprite
  ): HitSequenceConfig => {
    const effectDiameter = calculateHitEffectDiameter(
      sprite.width,
      sprite.height
    );
    return {
      hitDuration,
      fadeDuration,
      flickerInterval: npcHitFlickerInterval,
      colorA: npcHitColorA,
      colorB: npcHitColorB,
      effectAlpha: npcHitEffectAlpha,
      effectDiameter,
      lightIntensity: npcHitLightIntensity,
      lightRange: effectDiameter * 1.2,
      fadeOrbConfig: npcHitFadeOrbConfig,
      effectName
    };
  };

  const beginExecutionHit = (target: ExecutionTarget, hitScale: number) => {
    const key = buildExecutionTargetKey(target);
    if (isExecutionTargetInHitSequence(key)) {
      return;
    }
    const sequence = createHitSequenceState();
    getExecutionTargetCenterPosition(target, executionCollisionPosition);
    if (target.kind === "player") {
      startHitSequence(
        sequence,
        scene,
        executionCollisionPosition,
        buildPlayerHitSequenceConfig(
          `executionHitEffect_${key}`,
          playerHitConfig.duration * hitScale,
          playerHitConfig.fadeDuration * hitScale
        )
      );
      setPlayerState("hit-a");
    } else {
      const sprite = npcs[target.npcIndex].sprite;
      startHitSequence(
        sequence,
        scene,
        executionCollisionPosition,
        buildNpcHitSequenceConfig(
          `executionHitEffect_${key}`,
          npcHitDuration * hitScale,
          npcHitFadeDuration * hitScale,
          sprite
        )
      );
      const npc = npcs[target.npcIndex];
      npc.state = "hit-a";
      npc.sprite.cellIndex = getPortraitCellIndex("hit-a");
    }
    executionHitEntries.push({
      target,
      sequence,
      completed: false
    });
  };

  const finalizeExecutionAfterAllTargetsCompleted = () => {
    if (executionScenario?.variant === "npc-survivor-player-block") {
      setPlayerState("brainwash-complete-haigure-formation");
      updateHudPhaseOverride({ crosshairVisible: false });
    }
    executionResolved = true;
  };

  const updateExecutionHitEntries = (
    delta: number,
    shouldProcessOrb: (position: Vector3) => boolean
  ) => {
    for (const entry of executionHitEntries) {
      const key = buildExecutionTargetKey(entry.target);
      getExecutionTargetCenterPosition(entry.target, executionCollisionPosition);
      if (entry.target.kind === "player") {
        updateHitSequence(
          entry.sequence,
          delta,
          executionCollisionPosition,
          buildPlayerHitSequenceConfig(
            `executionHitEffect_${key}`,
            playerHitConfig.duration,
            playerHitConfig.fadeDuration
          ),
          (isColorA) => {
            setPlayerState(isColorA ? "hit-a" : "hit-b");
          },
          () => {
            setPlayerState("hit-a");
          },
          () => {
            setPlayerState("brainwash-complete-haigure-formation");
            const targetState = getExecutionTargetStateEntry(key);
            if (targetState) {
              targetState.completed = true;
            }
            entry.completed = true;
          },
          shouldProcessOrb
        );
        continue;
      }

      const npc = npcs[entry.target.npcIndex];
      updateHitSequence(
        entry.sequence,
        delta,
        executionCollisionPosition,
        buildNpcHitSequenceConfig(
          `executionHitEffect_${key}`,
          npcHitDuration,
          npcHitFadeDuration,
          npc.sprite
        ),
        (isColorA) => {
          npc.state = isColorA ? "hit-a" : "hit-b";
          npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
        },
        () => {
          npc.state = "hit-a";
          npc.sprite.cellIndex = getPortraitCellIndex("hit-a");
        },
        () => {
          npc.state = "brainwash-complete-haigure-formation";
          npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
          const targetState = getExecutionTargetStateEntry(key);
          if (targetState) {
            targetState.completed = true;
          }
          entry.completed = true;
        },
        shouldProcessOrb
      );
    }
    executionHitEntries = executionHitEntries.filter((entry) => !entry.completed);
    if (
      !executionResolved &&
      executionTargetStates.length > 0 &&
      executionTargetStates.every((state) => state.completed)
    ) {
      finalizeExecutionAfterAllTargetsCompleted();
    }
  };

  const isExecutionAutomaticVolley = (scenario: PublicExecutionScenario) =>
    scenario.variant !== "npc-survivor-player-block";

  const isExecutionBitVolley = (scenario: PublicExecutionScenario) =>
    isExecutionAutomaticVolley(scenario) && !scenario.usesNpcVolley;

  const isExecutionNpcVolley = (scenario: PublicExecutionScenario) =>
    isExecutionAutomaticVolley(scenario) && scenario.usesNpcVolley;

  const getExecutionTriggerKey = (scenario: PublicExecutionScenario) =>
    `${scenario.variant}|${[...scenario.survivorTargets]
      .map((target) => {
        const key = buildExecutionTargetKey(target);
        return `${key}:${scenario.blockKindsByTargetKey[key]}`;
      })
      .sort()
      .join(",")}`;

  const keepExecutionTargetEvadeUntilHit = () => {
    if (executionResolved) {
      return;
    }
    for (const targetState of executionTargetStates) {
      if (
        targetState.completed ||
        isExecutionTargetInHitSequence(targetState.key)
      ) {
        continue;
      }
      setExecutionTargetState(targetState.target, "evade");
    }
  };

  const applyExecutionNpcShooterPresentation = () => {
    for (const index of executionNpcShooterIndices) {
      const npc = npcs[index];
      npc.state = "brainwash-complete-gun";
      npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
      executionNpcVoiceStateOverrides.set(
        npc.sprite.name,
        "brainwash-complete-haigure-formation"
      );
    }
  };

  const findCandidate = () => {
    const aliveNpcTargets: ExecutionTarget[] = [];
    for (let index = 0; index < npcs.length; index += 1) {
      if (isAliveState(npcs[index].state)) {
        aliveNpcTargets.push({ kind: "npc", npcIndex: index });
      }
    }
    const survivorTargets =
      isAliveState(getPlayerState())
        ? [
            ...aliveNpcTargets.slice(
              0,
              Math.floor((aliveNpcTargets.length + 1) * 0.5)
            ),
            { kind: "player" } as const,
            ...aliveNpcTargets.slice(
              Math.floor((aliveNpcTargets.length + 1) * 0.5)
            )
          ]
        : aliveNpcTargets;

    if (
      survivorTargets.length <= 0 ||
      survivorTargets.length > publicExecutionMaxSurvivors
    ) {
      return null;
    }

    const blockKindsByTargetKey: Record<string, ExecutionBlockKind> = {};
    let hasPlayerBlockedSurvivor = false;
    for (const target of survivorTargets) {
      const key = buildExecutionTargetKey(target);
      if (target.kind === "player") {
        let blocked = false;
        for (const npc of npcs) {
          if (
            npc.state === "brainwash-complete-no-gun" &&
            npc.blockTargetId === "player"
          ) {
            blocked = true;
            blockKindsByTargetKey[key] = "npc";
            break;
          }
        }
        if (!blocked) {
          return null;
        }
        continue;
      }

      const survivorNpc = npcs[target.npcIndex];
      if (survivorNpc.blockedByPlayer) {
        blockKindsByTargetKey[key] = "player";
        hasPlayerBlockedSurvivor = true;
        continue;
      }

      let blocked = false;
      for (const npc of npcs) {
        if (
          npc.state === "brainwash-complete-no-gun" &&
          npc.blockTargetId === key
        ) {
          blocked = true;
          blockKindsByTargetKey[key] = "npc";
          break;
        }
      }
      if (!blocked) {
        return null;
      }
    }

    let variant: PublicExecutionScenario["variant"];
    let playerExecutionRole: PublicExecutionScenario["playerExecutionRole"];
    if (survivorTargets.some((target) => target.kind === "player")) {
      variant = "player-survivor";
      playerExecutionRole = "target";
    } else if (hasPlayerBlockedSurvivor) {
      variant = "npc-survivor-player-block";
      playerExecutionRole = "shooter";
    } else {
      variant = "npc-survivor-npc-block";
      playerExecutionRole = "observer";
    }

    return {
      variant,
      survivorTargets,
      blockKindsByTargetKey,
      playerExecutionRole,
      usesNpcVolley:
        variant !== "npc-survivor-player-block" &&
        bits.length < publicExecutionMaxSurvivors
    };
  };

  const buildExecutionTargetStates = (scenario: PublicExecutionScenario) => {
    executionShooterTargetKeys.clear();
    executionTargetStates = scenario.survivorTargets.map((target) => ({
      target,
      key: buildExecutionTargetKey(target),
      completed: false,
      firePending: false,
      fireCountdown: 0,
      fireEffectActive: false,
      fireEffectTimer: 0,
      beamTargetPosition: new Vector3(0, 0, 0),
      shooterBitIndices: [],
      shooterNpcIndices: []
    }));
    executionNpcShooterIndices = [];
    executionNpcVoiceStateOverrides.clear();
    executionSimultaneousPattern =
      isExecutionAutomaticVolley(scenario) &&
      Math.random() < publicExecutionSimultaneousChance;

    if (executionTargetStates.length <= 0) {
      return;
    }

    if (isExecutionBitVolley(scenario)) {
      const shooterBitIndices = bits.map((_, index) => index);
      const assignments = assignExecutionShooters(
        shooterBitIndices,
        executionTargetStates.length
      );
      for (let index = 0; index < executionTargetStates.length; index += 1) {
        const targetState = executionTargetStates[index];
        targetState.shooterBitIndices = assignments[index];
        for (const bitIndex of assignments[index]) {
          executionShooterTargetKeys.set(bits[bitIndex].id, targetState.key);
        }
      }
      return;
    }

    if (!isExecutionNpcVolley(scenario)) {
      return;
    }

    const survivorNpcIndexSet = new Set<number>();
    for (const target of scenario.survivorTargets) {
      if (target.kind === "npc") {
        survivorNpcIndexSet.add(target.npcIndex);
      }
    }
    const shooterNpcIndices = npcs
      .map((_, index) => index)
      .filter((index) => !survivorNpcIndexSet.has(index));
    const assignments = assignExecutionShooters(
      shuffleExecutionShooters(shooterNpcIndices),
      executionTargetStates.length
    );
    for (let index = 0; index < executionTargetStates.length; index += 1) {
      const targetState = executionTargetStates[index];
      targetState.shooterNpcIndices = assignments[index];
      for (const npcIndex of assignments[index]) {
        const shooterId = npcs[npcIndex].sprite.name;
        executionShooterTargetKeys.set(shooterId, targetState.key);
        if (!executionNpcVoiceStateOverrides.has(shooterId)) {
          executionNpcShooterIndices.push(npcIndex);
          executionNpcVoiceStateOverrides.set(
            shooterId,
            "brainwash-complete-haigure-formation"
          );
        }
      }
    }
  };

  const buildExecutionPlayerBeamHitCandidates = (): BeamHitCandidate[] =>
    executionTargetStates.flatMap((targetState) => {
      if (
        targetState.completed ||
        targetState.target.kind !== "npc" ||
        isExecutionTargetInHitSequence(targetState.key)
      ) {
        return [];
      }
      const npc = npcs[targetState.target.npcIndex];
      return [
        {
          targetId: targetState.key,
          targetPosition: npc.sprite.position,
          targetRadii: getSpriteBeamHitRadii(npc.sprite),
          canHit: () =>
            !targetState.completed &&
            !isExecutionTargetInHitSequence(targetState.key),
          onHit: (beam, impactPosition) => {
            beginBeamRetract(beam, impactPosition);
            beginExecutionHit(targetState.target, 1);
          }
        }
      ];
    });

  const enter = (scenario: PublicExecutionScenario) => {
    executionScenario = scenario;
    executionWaitForFade = true;
    executionResolved = false;
    executionAllowPlayerMove =
      scenario.variant === "npc-survivor-player-block" ||
      scenario.variant === "npc-survivor-npc-block";
    buildExecutionTargetStates(scenario);
    disposeExecutionHitEffects();
    if (!executionAllowPlayerMove) {
      resetPlayerMovement();
    }
    getGameFlow().enterExecution(scenario);
    keepExecutionTargetEvadeUntilHit();
    if (isExecutionNpcVolley(scenario)) {
      applyExecutionNpcShooterPresentation();
    }
  };

  const prepareExecutionCountdowns = () => {
    const sharedCountdown = executionSimultaneousPattern
      ? getRandomExecutionBeamDelay()
      : 0;
    for (const targetState of executionTargetStates) {
      if (targetState.completed) {
        continue;
      }
      targetState.firePending = true;
      targetState.fireCountdown = executionSimultaneousPattern
        ? sharedCountdown
        : getRandomExecutionBeamDelay();
      targetState.fireEffectActive = false;
      targetState.fireEffectTimer = 0;
    }
  };

  const startExecutionBitFireEffects = (targetState: ExecutionTargetState) => {
    for (const bitIndex of targetState.shooterBitIndices) {
      const bit = bits[bitIndex];
      bit.root.lookAt(targetState.beamTargetPosition);
      const muzzlePosition = bit.muzzle.getAbsolutePosition();
      const direction = targetState.beamTargetPosition.subtract(muzzlePosition);
      if (direction.lengthSquared() <= 0.0001) {
        continue;
      }
      bit.fireLockDirection.copyFrom(direction.normalize());
      startBitFireEffect(bit);
    }
  };

  const startExecutionNpcFireEffects = (targetState: ExecutionTargetState) => {
    for (const index of targetState.shooterNpcIndices) {
      const npc = npcs[index];
      npc.state = "brainwash-complete-gun";
      npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
    }
  };

  const startExecutionVolleyFireEffects = (
    targetState: ExecutionTargetState
  ) => {
    if (executionScenario && isExecutionNpcVolley(executionScenario)) {
      startExecutionNpcFireEffects(targetState);
      return;
    }
    startExecutionBitFireEffects(targetState);
  };

  const updateExecutionBitFireEffects = (delta: number) => {
    for (const bit of bits) {
      updateBitFireEffect(bit, delta);
    }
  };

  const spawnExecutionNpcBeamVolley = (targetState: ExecutionTargetState) => {
    const eyeHeight = getEyeHeight();
    for (const index of targetState.shooterNpcIndices) {
      const npc = npcs[index];
      npc.state = "brainwash-complete-gun";
      npc.sprite.cellIndex = getPortraitCellIndex(npc.state);
      const muzzlePosition = new Vector3(
        npc.sprite.position.x,
        eyeHeight,
        npc.sprite.position.z
      );
      const direction = targetState.beamTargetPosition.subtract(muzzlePosition);
      if (direction.lengthSquared() <= 0.0001) {
        continue;
      }
      const normalized = direction.normalize();
      beams.push(
        createBeam(
          scene,
          muzzlePosition.clone(),
          normalized,
          beamMaterial,
          npc.sprite.name
        )
      );
      playBeamNonTarget(muzzlePosition.clone());
    }
  };

  const spawnExecutionBitBeamVolley = (targetState: ExecutionTargetState) => {
    const targetingPlayer = targetState.target.kind === "player";
    for (const bitIndex of targetState.shooterBitIndices) {
      const bit = bits[bitIndex];
      const muzzlePosition = bit.muzzle.getAbsolutePosition();
      const direction = targetState.beamTargetPosition.subtract(muzzlePosition);
      if (direction.lengthSquared() <= 0.0001) {
        continue;
      }
      const normalized = direction.normalize();
      beams.push(
        createBeam(
          scene,
          muzzlePosition.clone(),
          normalized,
          beamMaterial,
          bit.id
        )
      );
      bitSoundEvents.onBeamFire(bit, targetingPlayer);
      stopBitFireEffect(bit);
    }
  };

  const spawnExecutionBeamVolley = (targetState: ExecutionTargetState) => {
    if (executionScenario && isExecutionNpcVolley(executionScenario)) {
      spawnExecutionNpcBeamVolley(targetState);
      return;
    }
    spawnExecutionBitBeamVolley(targetState);
  };

  const handleExecutionBeamCollisions = (scenario: PublicExecutionScenario) => {
    if (!isExecutionAutomaticVolley(scenario)) {
      return;
    }
    for (const beam of beams) {
      if (!beam.active || !beam.sourceId) {
        continue;
      }
      const targetKey = executionShooterTargetKeys.get(beam.sourceId);
      if (!targetKey) {
        continue;
      }
      const targetState = getExecutionTargetStateEntry(targetKey);
      if (!targetState || targetState.completed) {
        continue;
      }
      const targetRadii =
        targetState.target.kind === "player"
          ? getSpriteBeamHitRadii(getPlayerAvatar())
          : getSpriteBeamHitRadii(npcs[targetState.target.npcIndex].sprite);
      getExecutionTargetEyePosition(
        targetState.target,
        executionCollisionPosition
      );
      if (
        !isBeamHittingTargetExcludingSource(
          beam,
          beam.sourceId,
          targetKey,
          executionCollisionPosition,
          targetRadii
        )
      ) {
        continue;
      }
      const impactPosition = getBeamImpactPosition(beam);
      beginBeamRetract(beam, impactPosition);
      beginExecutionHit(targetState.target, 1);
    }
  };

  const update = (
    delta: number,
    shouldProcessOrb: (position: Vector3) => boolean
  ) => {
    const scenario = executionScenario;
    if (!scenario) {
      return;
    }
    updateBeams(delta, shouldProcessOrb);
    getGameFlow().updateExecution();
    updateExecutionHitEntries(delta, shouldProcessOrb);

    keepExecutionTargetEvadeUntilHit();
    if (isExecutionBitVolley(scenario)) {
      updateExecutionBitFireEffects(delta);
    }
    for (const targetState of executionTargetStates) {
      if (!targetState.fireEffectActive) {
        continue;
      }
      targetState.fireEffectTimer = Math.max(
        0,
        targetState.fireEffectTimer - delta
      );
      if (targetState.fireEffectTimer <= 0) {
        targetState.fireEffectActive = false;
        spawnExecutionBeamVolley(targetState);
      }
    }
    handleExecutionBeamCollisions(scenario);
    if (executionAllowPlayerMove) {
      updatePlayerMovement(delta);
    }
    if (executionResolved) {
      return;
    }

    if (executionWaitForFade && !getGameFlow().isFading()) {
      executionWaitForFade = false;
      if (isExecutionAutomaticVolley(scenario)) {
        prepareExecutionCountdowns();
      }
    }

    for (const targetState of executionTargetStates) {
      if (
        !targetState.firePending ||
        targetState.completed ||
        targetState.fireEffectActive
      ) {
        continue;
      }
      targetState.fireCountdown -= delta;
      if (targetState.fireCountdown > 0) {
        continue;
      }
      targetState.firePending = false;
      getExecutionTargetEyePosition(
        targetState.target,
        targetState.beamTargetPosition
      );
      if (isExecutionNpcVolley(scenario)) {
        spawnExecutionBeamVolley(targetState);
        continue;
      }
      targetState.fireEffectActive = true;
      targetState.fireEffectTimer = bitFireEffectDuration;
      startExecutionVolleyFireEffects(targetState);
    }

    if (scenario.variant === "npc-survivor-player-block") {
      resolvePlayerBeamHits(beams, buildExecutionPlayerBeamHitCandidates());
    }
  };

  const reset = () => {
    disposeExecutionHitEffects();
    publicExecutionTriggerKey = null;
    publicExecutionTriggerTimer = 0;
    executionScenario = null;
    executionWaitForFade = false;
    executionShooterTargetKeys.clear();
    executionTargetStates = [];
    executionSimultaneousPattern = false;
    executionResolved = false;
    executionAllowPlayerMove = false;
    executionNpcShooterIndices = [];
    executionNpcVoiceStateOverrides.clear();
  };

  const advanceAutoTrigger = (delta: number) => {
    const executionCandidate = findCandidate();
    if (!executionCandidate) {
      publicExecutionTriggerKey = null;
      publicExecutionTriggerTimer = 0;
      return null;
    }
    const candidateKey = getExecutionTriggerKey(executionCandidate);
    if (publicExecutionTriggerKey !== candidateKey) {
      publicExecutionTriggerKey = candidateKey;
      publicExecutionTriggerTimer = 0;
    }
    publicExecutionTriggerTimer += delta;
    if (publicExecutionTriggerTimer < publicExecutionTransitionDelay) {
      return null;
    }
    publicExecutionTriggerKey = null;
    publicExecutionTriggerTimer = 0;
    return executionCandidate;
  };

  return {
    prepareInstantScenario,
    findCandidate,
    advanceAutoTrigger,
    enter,
    update,
    reset,
    getScenario: () => executionScenario,
    getNpcVoiceStateOverride: (npcId) =>
      executionNpcVoiceStateOverrides.get(npcId) ?? null
  };
};
