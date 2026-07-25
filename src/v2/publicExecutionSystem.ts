import { Vector3 } from "@babylonjs/core";

import type { StageAssemblyVenue } from "../world/stageSpatialContext";
import {
  createExecutionAudiencePositions,
  createExecutionTargetPositions
} from "./assemblyLayout";
import type {
  V2BeamOriginKind,
  V2HumanKind,
  V2HumanTargetSnapshot
} from "./combatTypes";

export const V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS = 6;
export const V2_PUBLIC_EXECUTION_TRIGGER_SECONDS = 1;
export const V2_PUBLIC_EXECUTION_SIMULTANEOUS_CHANCE = 0.3;
export const V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS = 2;
export const V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS = 8;

export type V2ExecutionBlockKind = "player" | "npc";

export type V2ExecutionVariant =
  | "player-survivor"
  | "npc-survivor-player-block"
  | "npc-survivor-npc-block";

export type V2ExecutionPlayerRole =
  | "target"
  | "shooter"
  | "observer";

export type V2ExecutionBlock = Readonly<{
  targetId: string;
  blockerId: string;
  blockerKind: V2ExecutionBlockKind;
}>;

export type V2ExecutionCandidate = Readonly<{
  key: string;
  variant: V2ExecutionVariant;
  targets: readonly Readonly<{
    id: string;
    kind: V2HumanKind;
  }>[];
  blockKindsByTargetId: Readonly<Record<string, V2ExecutionBlockKind>>;
  playerRole: V2ExecutionPlayerRole;
  usesNpcVolley: boolean;
}>;

export type V2ExecutionCandidateInput = Readonly<{
  survivors: readonly V2HumanTargetSnapshot[];
  blocks: readonly V2ExecutionBlock[];
  bitShooterCount: number;
}>;

export type V2ExecutionShooterPools = Readonly<{
  bitShooterIds: readonly string[];
  npcShooterIds: readonly string[];
  playerShooterId: string;
}>;

export type V2ExecutionPlacement = Readonly<{
  id: string;
  role: "target" | "audience";
  position: Vector3;
}>;

export type V2ExecutionAssignment = Readonly<{
  targetId: string;
  shooterIds: readonly string[];
  originKind:
    | "execution-bit"
    | "execution-npc"
    | "execution-player";
}>;

export type V2ExecutionShotEvent = Readonly<{
  targetId: string;
  shooterIds: readonly string[];
  originKind:
    | "execution-bit"
    | "execution-npc"
    | "execution-player";
}>;

export type V2PublicExecutionPhase =
  | "idle"
  | "execution"
  | "complete";

export type V2PublicExecutionFrame = Readonly<{
  phase: V2PublicExecutionPhase;
  venueId: string | null;
  candidate: V2ExecutionCandidate | null;
  simultaneous: boolean;
  placements: readonly V2ExecutionPlacement[];
  assignments: readonly V2ExecutionAssignment[];
  pendingTargetIds: readonly string[];
  completedTargetIds: readonly string[];
}>;

export interface V2PublicExecutionSystem {
  findCandidate(input: V2ExecutionCandidateInput): V2ExecutionCandidate | null;
  advanceCandidate(
    deltaSeconds: number,
    input: V2ExecutionCandidateInput
  ): V2ExecutionCandidate | null;
  enter(
    candidate: V2ExecutionCandidate,
    venue: StageAssemblyVenue,
    audienceIds: readonly string[],
    shooters: V2ExecutionShooterPools
  ): V2PublicExecutionFrame;
  update(deltaSeconds: number): readonly V2ExecutionShotEvent[];
  notifyTargetCompleted(targetId: string): boolean;
  replay(): V2PublicExecutionFrame;
  reset(): void;
  getFrame(): V2PublicExecutionFrame;
}

type MutableExecutionTarget = {
  targetId: string;
  shooterIds: readonly string[];
  originKind:
    | "execution-bit"
    | "execution-npc"
    | "execution-player";
  remainingSeconds: number;
  emitted: boolean;
  completed: boolean;
};

type ExecutionSession = Readonly<{
  candidate: V2ExecutionCandidate;
  venue: StageAssemblyVenue;
  audienceIds: readonly string[];
  shooters: V2ExecutionShooterPools;
}>;

const assertNonNegativeFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です: ${value}`);
  }
};

const requireRandom = (random: () => number): number => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`公開処刑randomは0以上1未満が必要です: ${value}`);
  }
  return value;
};

const buildCandidateKey = (
  variant: V2ExecutionVariant,
  targets: V2ExecutionCandidate["targets"],
  blockKindsByTargetId: V2ExecutionCandidate["blockKindsByTargetId"]
) =>
  `${variant}|${targets
    .map(
      (target) =>
        `${target.id}:${blockKindsByTargetId[target.id]}`
    )
    .sort()
    .join(",")}`;

const freezeCandidate = (
  variant: V2ExecutionVariant,
  targets: V2ExecutionCandidate["targets"],
  blockKindsByTargetId: Record<string, V2ExecutionBlockKind>,
  playerRole: V2ExecutionPlayerRole,
  usesNpcVolley: boolean
): V2ExecutionCandidate => {
  const frozenTargets = Object.freeze(
    targets.map((target) => Object.freeze({ ...target }))
  );
  const frozenBlocks = Object.freeze({ ...blockKindsByTargetId });
  return Object.freeze({
    key: buildCandidateKey(variant, frozenTargets, frozenBlocks),
    variant,
    targets: frozenTargets,
    blockKindsByTargetId: frozenBlocks,
    playerRole,
    usesNpcVolley
  });
};

const clonePlacement = (
  placement: V2ExecutionPlacement
): V2ExecutionPlacement =>
  Object.freeze({
    ...placement,
    position: placement.position.clone()
  });

const freezeAssignment = (
  targetId: string,
  shooterIds: readonly string[],
  originKind: V2ExecutionAssignment["originKind"]
): V2ExecutionAssignment =>
  Object.freeze({
    targetId,
    shooterIds: Object.freeze([...shooterIds]),
    originKind
  });

const assignRoundRobin = (
  shooterIds: readonly string[],
  targetCount: number
): readonly (readonly string[])[] => {
  if (shooterIds.length < targetCount) {
    throw new Error(
      `公開処刑の射手数が対象数を下回っています: ${shooterIds.length}/${targetCount}`
    );
  }
  const assignments = Array.from(
    { length: targetCount },
    () => [] as string[]
  );
  for (let index = 0; index < shooterIds.length; index += 1) {
    assignments[index % targetCount].push(shooterIds[index]);
  }
  return Object.freeze(
    assignments.map((assignment) => Object.freeze(assignment))
  );
};

export const createV2PublicExecutionSystem = (
  random: () => number
): V2PublicExecutionSystem => {
  if (typeof random !== "function") {
    throw new Error("公開処刑randomには関数が必要です");
  }

  let triggerKey: string | null = null;
  let triggerSeconds = 0;
  let session: ExecutionSession | null = null;
  let targets: MutableExecutionTarget[] = [];
  let placements: readonly V2ExecutionPlacement[] = Object.freeze([]);
  let simultaneous = false;
  let phase: V2PublicExecutionPhase = "idle";

  const findCandidate = ({
    survivors,
    blocks,
    bitShooterCount
  }: V2ExecutionCandidateInput): V2ExecutionCandidate | null => {
    if (
      survivors.length === 0 ||
      survivors.length > V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS
    ) {
      return null;
    }
    if (
      !Number.isInteger(bitShooterCount) ||
      bitShooterCount < 0
    ) {
      throw new Error(
        `公開処刑bit射手数には0以上の整数が必要です: ${bitShooterCount}`
      );
    }

    const targetIds = new Set<string>();
    for (const survivor of survivors) {
      if (targetIds.has(survivor.id)) {
        throw new Error(
          `公開処刑候補の生存者IDが重複しています: ${survivor.id}`
        );
      }
      targetIds.add(survivor.id);
    }

    const blockKindsByTargetId: Record<
      string,
      V2ExecutionBlockKind
    > = {};
    let hasPlayerBlockedSurvivor = false;
    for (const survivor of survivors) {
      const targetBlocks = blocks.filter(
        (block) => block.targetId === survivor.id
      );
      const playerBlock = targetBlocks.find(
        (block) => block.blockerKind === "player"
      );
      const npcBlock = targetBlocks.find(
        (block) => block.blockerKind === "npc"
      );
      if (survivor.kind === "player") {
        if (!npcBlock) {
          return null;
        }
        blockKindsByTargetId[survivor.id] = "npc";
      } else if (playerBlock) {
        blockKindsByTargetId[survivor.id] = "player";
        hasPlayerBlockedSurvivor = true;
      } else if (npcBlock) {
        blockKindsByTargetId[survivor.id] = "npc";
      } else {
        return null;
      }
    }

    const hasPlayerSurvivor = survivors.some(
      (survivor) => survivor.kind === "player"
    );
    const variant: V2ExecutionVariant = hasPlayerSurvivor
      ? "player-survivor"
      : hasPlayerBlockedSurvivor
        ? "npc-survivor-player-block"
        : "npc-survivor-npc-block";
    const playerRole: V2ExecutionPlayerRole = hasPlayerSurvivor
      ? "target"
      : hasPlayerBlockedSurvivor
        ? "shooter"
        : "observer";

    return freezeCandidate(
      variant,
      survivors.map((survivor) =>
        Object.freeze({
          id: survivor.id,
          kind: survivor.kind
        })
      ),
      blockKindsByTargetId,
      playerRole,
      variant !== "npc-survivor-player-block" &&
        bitShooterCount < V2_PUBLIC_EXECUTION_MAXIMUM_TARGETS
    );
  };

  const shuffle = (ids: readonly string[]): readonly string[] => {
    const shuffled = [...ids];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(requireRandom(random) * (index + 1));
      const current = shuffled[index];
      shuffled[index] = shuffled[swapIndex];
      shuffled[swapIndex] = current;
    }
    return Object.freeze(shuffled);
  };

  const randomDelaySeconds = () =>
    V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS +
    requireRandom(random) *
      (V2_PUBLIC_EXECUTION_DELAY_MAXIMUM_SECONDS -
        V2_PUBLIC_EXECUTION_DELAY_MINIMUM_SECONDS);

  const prepareTargets = () => {
    if (!session) {
      throw new Error("公開処刑sessionがありません");
    }
    simultaneous =
      session.candidate.variant !== "npc-survivor-player-block" &&
      requireRandom(random) <
        V2_PUBLIC_EXECUTION_SIMULTANEOUS_CHANCE;

    let originKind: V2ExecutionAssignment["originKind"];
    let assignments: readonly (readonly string[])[];
    if (
      session.candidate.variant ===
      "npc-survivor-player-block"
    ) {
      originKind = "execution-player";
      assignments = Object.freeze(
        session.candidate.targets.map(() =>
          Object.freeze([session!.shooters.playerShooterId])
        )
      );
    } else if (session.candidate.usesNpcVolley) {
      originKind = "execution-npc";
      assignments = assignRoundRobin(
        shuffle(session.shooters.npcShooterIds),
        session.candidate.targets.length
      );
    } else {
      originKind = "execution-bit";
      assignments = assignRoundRobin(
        session.shooters.bitShooterIds,
        session.candidate.targets.length
      );
    }

    const sharedDelay = simultaneous ? randomDelaySeconds() : 0;
    targets = session.candidate.targets.map((target, index) => ({
      targetId: target.id,
      shooterIds: assignments[index],
      originKind,
      remainingSeconds:
        originKind === "execution-player"
          ? 0
          : simultaneous
            ? sharedDelay
            : randomDelaySeconds(),
      emitted: false,
      completed: false
    }));
    phase = "execution";
  };

  const buildFrame = (): V2PublicExecutionFrame =>
    Object.freeze({
      phase,
      venueId: session?.venue.id ?? null,
      candidate: session?.candidate ?? null,
      simultaneous,
      placements: Object.freeze(placements.map(clonePlacement)),
      assignments: Object.freeze(
        targets.map((target) =>
          freezeAssignment(
            target.targetId,
            target.shooterIds,
            target.originKind
          )
        )
      ),
      pendingTargetIds: Object.freeze(
        targets
          .filter(
            (target) => !target.emitted && !target.completed
          )
          .map((target) => target.targetId)
      ),
      completedTargetIds: Object.freeze(
        targets
          .filter((target) => target.completed)
          .map((target) => target.targetId)
      )
    });

  return {
    findCandidate,
    advanceCandidate: (deltaSeconds, input) => {
      assertNonNegativeFiniteNumber(
        "公開処刑候補deltaSeconds",
        deltaSeconds
      );
      const candidate = findCandidate(input);
      if (!candidate) {
        triggerKey = null;
        triggerSeconds = 0;
        return null;
      }
      if (triggerKey !== candidate.key) {
        triggerKey = candidate.key;
        triggerSeconds = 0;
      }
      triggerSeconds += deltaSeconds;
      if (
        triggerSeconds < V2_PUBLIC_EXECUTION_TRIGGER_SECONDS
      ) {
        return null;
      }
      triggerKey = null;
      triggerSeconds = 0;
      return candidate;
    },
    enter: (candidate, venue, audienceIds, shooters) => {
      const targetIdSet = new Set(
        candidate.targets.map((target) => target.id)
      );
      const uniqueAudienceIds = new Set(audienceIds);
      if (uniqueAudienceIds.size !== audienceIds.length) {
        throw new Error("公開処刑観客IDが重複しています");
      }
      for (const audienceId of audienceIds) {
        if (targetIdSet.has(audienceId)) {
          throw new Error(
            `公開処刑対象が観客にも含まれています: ${audienceId}`
          );
        }
      }
      if (
        candidate.targets.length + audienceIds.length >
        venue.assemblyPositions.length
      ) {
        throw new Error(
          "公開処刑の対象と観客が会場の集合最大人数を超えています"
        );
      }

      const targetPositions = createExecutionTargetPositions(
        venue,
        candidate.targets.length
      );
      const audiencePositions =
        audienceIds.length === 0
          ? Object.freeze([] as Vector3[])
          : createExecutionAudiencePositions(
              venue,
              audienceIds.length
            );
      placements = Object.freeze([
        ...candidate.targets.map((target, index) =>
          Object.freeze({
            id: target.id,
            role: "target" as const,
            position: targetPositions[index].clone()
          })
        ),
        ...audienceIds.map((id, index) =>
          Object.freeze({
            id,
            role: "audience" as const,
            position: audiencePositions[index].clone()
          })
        )
      ]);
      session = Object.freeze({
        candidate,
        venue,
        audienceIds: Object.freeze([...audienceIds]),
        shooters: Object.freeze({
          bitShooterIds: Object.freeze([
            ...shooters.bitShooterIds
          ]),
          npcShooterIds: Object.freeze([
            ...shooters.npcShooterIds
          ]),
          playerShooterId: shooters.playerShooterId
        })
      });
      prepareTargets();
      return buildFrame();
    },
    update: (deltaSeconds) => {
      assertNonNegativeFiniteNumber(
        "公開処刑deltaSeconds",
        deltaSeconds
      );
      if (phase !== "execution") {
        return Object.freeze([]);
      }
      const shotEvents: V2ExecutionShotEvent[] = [];
      for (const target of targets) {
        if (
          target.emitted ||
          target.originKind === "execution-player"
        ) {
          continue;
        }
        target.remainingSeconds = Math.max(
          0,
          target.remainingSeconds - deltaSeconds
        );
        if (target.remainingSeconds > 0) {
          continue;
        }
        target.emitted = true;
        shotEvents.push(
          Object.freeze({
            targetId: target.targetId,
            shooterIds: Object.freeze([...target.shooterIds]),
            originKind: target.originKind
          })
        );
      }
      return Object.freeze(shotEvents);
    },
    notifyTargetCompleted: (targetId) => {
      if (phase !== "execution") {
        return false;
      }
      const target = targets.find(
        (candidate) => candidate.targetId === targetId
      );
      if (!target || target.completed) {
        return false;
      }
      target.completed = true;
      if (targets.every((candidate) => candidate.completed)) {
        phase = "complete";
      }
      return true;
    },
    replay: () => {
      if (phase !== "complete") {
        throw new Error(
          "公開処刑リプレイは完了後にだけ開始できます"
        );
      }
      prepareTargets();
      return buildFrame();
    },
    reset: () => {
      triggerKey = null;
      triggerSeconds = 0;
      session = null;
      targets = [];
      placements = Object.freeze([]);
      simultaneous = false;
      phase = "idle";
    },
    getFrame: buildFrame
  };
};
