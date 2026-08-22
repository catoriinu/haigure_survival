import {
  Mesh,
  NullEngine,
  Scene,
  Vector3,
  type Nullable
} from "@babylonjs/core";

import type {
  PlayerVerticalState
} from "../../../src/game/playerHeight";
import type {
  NavigationLocation
} from "../../../src/world/navigationWorld";
import {
  createSchoolRoomVariantSelections,
  createSchoolRuntimeRandom,
  createSchoolRuntimeSettings
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicRuntime,
  createSchoolStageDynamicSpatialInitializer,
  type SchoolStageActorPort,
  type SchoolStageDynamicRuntime,
  type SchoolStageDynamicRuntimeSnapshot
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  ELEVATOR_CAPACITY,
  ELEVATOR_DOOR_MOTION_SECONDS,
  ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS,
  ELEVATOR_TRAVEL_SECONDS
} from "../../../src/world/stageElevatorRuntime";
import {
  STAGE_DOOR_TRAVEL_SECONDS,
  intersectsStageDoorClosedPose,
  type DoorState
} from "../../../src/world/stageDoorRuntime";
import type {
  StageDoorAsset,
  StageElevatorAsset
} from "../../../src/world/stageDynamicAssets";
import {
  canStageMoverUseLink,
  type StageMoverKind
} from "../../../src/world/stageLinks";
import {
  SCHOOL_STAGE,
  type StageCatalogEntry
} from "../../../src/world/stageCatalog";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import type {
  DynamicStageSpatialSnapshot
} from "../../../src/world/dynamicStageSpatialVariants";
import type {
  V2CharacterState,
  V2BeamOriginKind,
  V2HumanTargetSnapshot,
  V2PlayerCompletionState,
  V2TargetProvenance,
  V2TargetSelectionPersonality
} from "../../../src/v2/combatTypes";
import {
  castV2SightSegment,
  createV2BeamSystem,
  type V2BeamSystem
} from "../../../src/v2/beamCollision";
import type {
  V2NpcCommandCandidate,
  V2NpcCommandKind,
  V2NpcCommandMode
} from "../../../src/v2/npcSystem";
import {
  cloneV2NpcTraversalState,
  type V2NpcElevatorTraversalRoute,
  type V2NpcTraversalNotification,
  type V2NpcTraversalRequest,
  type V2NpcTraversalResult,
  type V2NpcTraversalState,
  type V2PlayerElevatorTraversalSnapshot
} from "../../../src/v2/npcTraversal";
import type {
  V2PlayerController
} from "../../../src/v2/playerController";
import {
  createSchoolStageActorPort,
  createSchoolStageTraversalCoordinator
} from "../../../src/v2/schoolStageTraversalCoordinator";
import type {
  V2SurvivalRuntime
} from "../../../src/v2/survivalRuntime";
import {
  readV2RuntimeStressScenario
} from "../../../src/v2/runtimeStressScenario";
import {
  runSchoolNpcNavigationPolicyAcceptance
} from "./schoolNpcNavigationPolicyAcceptance";
import {
  runElevatorThresholdPlayerAcceptance
} from "./elevatorThresholdPlayerAcceptance";

export type SchoolIntegrationCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type SceneResourceCounts = Readonly<{
  meshes: number;
  materials: number;
  transformNodes: number;
  textures: number;
  spriteManagers: number;
}>;

type FixtureFaction = "player" | "unbrainwashed" | "brainwashed";

type FixtureActor = {
  readonly id: string;
  readonly faction: FixtureFaction;
  position: Vector3;
  readonly radii: Vector3;
};

type TraversalFixtureActor = {
  readonly id: string;
  state: V2CharacterState;
  position: Vector3;
  readonly radii: Vector3;
  traversalState: V2NpcTraversalState;
  commandMode: V2NpcCommandMode;
  targetId: string | null;
  targetProvenance: V2TargetProvenance | null;
  targetSelectionPersonality: V2TargetSelectionPersonality | null;
  completeTransitionCount: number;
  reservationResultRevision: number;
};

type TraversalFixtureActorInput = Readonly<{
  id: string;
  state: V2CharacterState;
  position: Vector3;
  commandMode?: V2NpcCommandMode;
  targetId?: string | null;
  targetProvenance?: V2TargetProvenance | null;
  targetSelectionPersonality?: V2TargetSelectionPersonality | null;
}>;

type TraversalFixturePlayer = V2PlayerController &
  Readonly<{
    createTargetSnapshot(): V2HumanTargetSnapshot;
    getLastSyncedSnapshot(): DynamicStageSpatialSnapshot | null;
  }>;

const SCHOOL_INTEGRATION_SEED = 0;
const POSITION_EPSILON = 1e-6;
const CURRENT_BEAM_ORIGIN_KINDS = Object.freeze(
  Object.keys({
    "bit-chase": true,
    "bit-fixed": true,
    "bit-random": true,
    "bit-carpet": true,
    "npc-gun": true,
    "player-gun": true,
    "execution-bit": true,
    "execution-npc": true,
    "execution-player": true
  } satisfies Record<V2BeamOriginKind, true>) as V2BeamOriginKind[]
);
const TRAVERSAL_ACTOR_RADII = Object.freeze(
  new Vector3(0.05, 0.15, 0.05)
);

const SCHOOL_VALIDATION_STAGE: StageCatalogEntry = Object.freeze({
  ...SCHOOL_STAGE,
  glbUrl: "b02_school_blockout.glb",
  navmeshUrl: "b02_school_blockout.navmesh.bin",
  bitNavmeshUrl: "b02_school_blockout.bit-flight.navmesh.bin",
  roomVariantNavmesh: Object.freeze({
    mode: "required",
    url: "b02_school_blockout.room-variants.navmesh.bin",
    sha256: "c5d9bd4a021370006a4c9d380ea938720719b2908c2d83ae4509720ccac74c4c"
  })
});

const ACTOR_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "actor-01-player",
    faction: "player" as const
  }),
  Object.freeze({
    id: "actor-02-unbrainwashed",
    faction: "unbrainwashed" as const
  }),
  Object.freeze({
    id: "actor-03-brainwashed",
    faction: "brainwashed" as const
  }),
  Object.freeze({
    id: "actor-04-unbrainwashed",
    faction: "unbrainwashed" as const
  }),
  Object.freeze({
    id: "actor-05-brainwashed",
    faction: "brainwashed" as const
  }),
  Object.freeze({
    id: "actor-06-unbrainwashed",
    faction: "unbrainwashed" as const
  }),
  Object.freeze({
    id: "actor-07-capacity",
    faction: "brainwashed" as const
  }),
  Object.freeze({
    id: "actor-08-occupancy",
    faction: "unbrainwashed" as const
  })
]);

const countSceneResources = (scene: Scene): SceneResourceCounts =>
  Object.freeze({
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    transformNodes: scene.transformNodes.length,
    textures: scene.textures.filter(
      (texture) => texture !== scene.environmentBRDFTexture
    ).length,
    spriteManagers: scene.spriteManagers?.length ?? 0
  });

const sceneResourceCountsEqual = (
  left: SceneResourceCounts,
  right: SceneResourceCounts
) =>
  left.meshes === right.meshes &&
  left.materials === right.materials &&
  left.transformNodes === right.transformNodes &&
  left.textures === right.textures &&
  left.spriteManagers === right.spriteManagers;

const formatSceneResourceCounts = (counts: SceneResourceCounts) =>
  `mesh=${counts.meshes}, material=${counts.materials}, ` +
  `node=${counts.transformNodes}, texture=${counts.textures}, ` +
  `sprite=${counts.spriteManagers}`;

const serializeSelections = (
  selections: ReturnType<typeof createSchoolRoomVariantSelections>
) =>
  selections
    .map((selection) => `${selection.roomId}:${selection.variant}`)
    .sort()
    .join("|");

const countDisorderedSelections = (
  selections: ReturnType<typeof createSchoolRoomVariantSelections>
) =>
  selections.filter((selection) => selection.variant === "disordered").length;

const requireActor = (
  actors: ReadonlyMap<string, FixtureActor>,
  actorId: string
) => {
  const actor = actors.get(actorId);
  if (!actor) {
    throw new Error(`fixture Actorが未登録です: ${actorId}`);
  }
  return actor;
};

const createFixtureActors = () => {
  const actors = new Map<string, FixtureActor>(
    ACTOR_DEFINITIONS.map((definition, index) => [
      definition.id,
      {
        id: definition.id,
        faction: definition.faction,
        position: new Vector3(1_000 + index, 1_000, 1_000),
        radii: new Vector3(0.001, 0.001, 0.001)
      }
    ])
  );
  const port: SchoolStageActorPort = Object.freeze({
    getActorPosition: (actorId: string) =>
      requireActor(actors, actorId).position.clone(),
    setActorPosition: (actorId: string, position: Vector3) => {
      const actor = requireActor(actors, actorId);
      if (
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)
      ) {
        throw new Error(`fixture搬送位置が有限値ではありません: ${actorId}`);
      }
      actor.position.copyFrom(position);
    },
    getActorEllipsoids: () =>
      Object.freeze(
        [...actors.values()].map((actor) =>
          Object.freeze({
            center: actor.position.clone(),
            radii: actor.radii.clone()
          })
        )
      ),
    getDoorActors: () =>
      Object.freeze(
        [...actors.values()].map((actor) =>
          Object.freeze({
            id: actor.id,
            kind: "human" as const,
            position: actor.position.clone(),
            ellipsoid: Object.freeze({
              center: actor.position.clone(),
              radii: actor.radii.clone()
            })
          })
        )
      ),
    relocateDoorActor: (
      actorId: string,
      candidates: readonly Vector3[]
    ) => {
      const candidate = candidates[0];
      if (!candidate) {
        throw new Error(`fixture扉退避候補がありません: ${actorId}`);
      }
      const actor = requireActor(actors, actorId);
      actor.position.copyFrom(candidate);
      return actor.position.clone();
    }
  });
  return Object.freeze({
    actors,
    port
  });
};

const isBrainwashedTraversalState = (state: V2CharacterState) =>
  state.startsWith("brainwash-");

const createTraversalTargetSnapshot = (
  actor: TraversalFixtureActor
): V2HumanTargetSnapshot => {
  const aimPosition = actor.position.add(
    new Vector3(0, actor.radii.y, 0)
  );
  return Object.freeze({
    id: actor.id,
    kind: "npc",
    footPosition: actor.position.clone(),
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: actor.radii.clone()
    }),
    state: actor.state,
    alive: true,
    brainwashed: isBrainwashedTraversalState(actor.state)
  });
};

const createTraversalFixturePlayer = (
  initialPosition: Vector3
): TraversalFixturePlayer => {
  const spawnPosition = initialPosition.clone();
  const position = initialPosition.clone();
  const verticalState: PlayerVerticalState = {
    grounded: true,
    verticalVelocity: 0,
    supportY: initialPosition.y
  };
  let lastSyncedSnapshot: DynamicStageSpatialSnapshot | null = null;
  let disposed = false;
  const assertActive = () => {
    if (disposed) {
      throw new Error("破棄済みfixture playerは使用できません。");
    }
  };
  const getEyePosition = () =>
    position.add(new Vector3(0, 0.3, 0));
  return Object.freeze({
    update: (
      _deltaSeconds: number,
      _allowMove: boolean
    ) => {
      assertActive();
      return Object.freeze({
        footPosition: position.clone(),
        eyePosition: getEyePosition(),
        verticalState: Object.freeze({ ...verticalState })
      });
    },
    getFootPosition: () => {
      assertActive();
      return position.clone();
    },
    getEyePosition: () => {
      assertActive();
      return getEyePosition();
    },
    getVerticalState: () => {
      assertActive();
      return Object.freeze({ ...verticalState });
    },
    setEyeHeightScale: (_scale: number) => {
      assertActive();
    },
    syncStageSpatialSnapshot: (
      snapshot: DynamicStageSpatialSnapshot
    ) => {
      assertActive();
      lastSyncedSnapshot = snapshot;
    },
    setTransportFootPosition: (footPosition: Vector3) => {
      assertActive();
      position.copyFrom(footPosition);
      verticalState.supportY = footPosition.y;
    },
    placeAt: (
      footPosition: Vector3,
      _lookAtPosition: Vector3
    ) => {
      assertActive();
      position.copyFrom(footPosition);
      verticalState.supportY = footPosition.y;
    },
    resetToSpawn: () => {
      assertActive();
      position.copyFrom(spawnPosition);
      verticalState.supportY = spawnPosition.y;
    },
    createTargetSnapshot: () => {
      assertActive();
      const aimPosition = getEyePosition();
      return Object.freeze({
        id: "player",
        kind: "player",
        footPosition: position.clone(),
        aimPosition,
        hitShape: Object.freeze({
          center: position.add(
            new Vector3(0, TRAVERSAL_ACTOR_RADII.y, 0)
          ),
          radii: TRAVERSAL_ACTOR_RADII.clone()
        }),
        state: "normal",
        alive: true,
        brainwashed: false
      });
    },
    getLastSyncedSnapshot: () => lastSyncedSnapshot,
    dispose: () => {
      assertActive();
      lastSyncedSnapshot = null;
      disposed = true;
    }
  });
};

class StrictTraversalSurvivalHarness implements V2SurvivalRuntime {
  private readonly actors = new Map<
    string,
    TraversalFixtureActor
  >();
  private requests: V2NpcTraversalRequest[] = [];
  private readonly appliedResults: V2NpcTraversalResult[] = [];
  private scriptedPhaseTraversalReleaseCount = 0;
  private humanTargetReadCount = 0;
  private active = true;

  constructor(
    private readonly getPlayerTarget:
      () => V2HumanTargetSnapshot
  ) {}

  private assertActive() {
    if (!this.active) {
      throw new Error(
        "破棄済みStrictTraversalSurvivalHarnessは使用できません。"
      );
    }
  }

  private unexpected(operation: string): never {
    throw new Error(
      `traversal fixtureで未使用のV2SurvivalRuntime APIです: ${operation}`
    );
  }

  private requireActor(npcId: string) {
    const actor = this.actors.get(npcId);
    if (!actor) {
      throw new Error(
        `traversal fixture NPCが未登録です: ${npcId}`
      );
    }
    return actor;
  }

  private requireElevatorIdentity(
    actor: TraversalFixtureActor,
    identity: Readonly<{
      linkId: string;
      from: "A" | "B";
      to: "A" | "B";
    }>
  ) {
    const state = actor.traversalState;
    if (
      !("linkId" in state) ||
      state.linkId !== identity.linkId ||
      state.from !== identity.from ||
      state.to !== identity.to
    ) {
      throw new Error(
        `NPCのelevator traversal identityが一致しません: ${actor.id}`
      );
    }
    return state;
  }

  addActor(input: TraversalFixtureActorInput) {
    this.assertActive();
    if (this.actors.has(input.id)) {
      throw new Error(
        `traversal fixture NPC IDが重複しています: ${input.id}`
      );
    }
    const actor: TraversalFixtureActor = {
      id: input.id,
      state: input.state,
      position: input.position.clone(),
      radii: TRAVERSAL_ACTOR_RADII.clone(),
      traversalState: Object.freeze({
        kind: "walking"
      }),
      commandMode: input.commandMode ?? "none",
      targetId: input.targetId ?? null,
      targetProvenance: input.targetProvenance ?? null,
      targetSelectionPersonality:
        input.targetSelectionPersonality ?? null,
      completeTransitionCount: 0,
      reservationResultRevision: 0
    };
    this.actors.set(input.id, actor);
    return actor;
  }

  getActor(npcId: string) {
    this.assertActive();
    return this.requireActor(npcId);
  }

  enqueueDoorOpen(
    npcId: string,
    doorId: string,
    position: Vector3
  ) {
    const actor = this.requireActor(npcId);
    actor.position.copyFrom(position);
    actor.traversalState = Object.freeze({
      kind: "waiting-door-open",
      doorId
    });
    this.requests.push(
      Object.freeze({
        kind: "door-open",
        npcId,
        doorId
      })
    );
  }

  enqueueElevatorCall(
    npcId: string,
    route: V2NpcElevatorTraversalRoute,
    requestedAtSeconds: number
  ) {
    const actor = this.requireActor(npcId);
    actor.traversalState = Object.freeze({
      kind: "waiting-elevator-call-input",
      ...route
    });
    this.requests.push(
      Object.freeze({
        kind: "elevator-call",
        npcId,
        requestedAtSeconds,
        ...route
      })
    );
  }

  completeElevatorCallApproach(npcId: string) {
    const actor = this.requireActor(npcId);
    const state = actor.traversalState;
    if (state.kind !== "moving-to-elevator-wait") {
      throw new Error(
        `待機点到達前のNPC状態が不正です: ${npcId}/${state.kind}`
      );
    }
    actor.traversalState = Object.freeze({
      ...state,
      kind: "waiting-elevator-call"
    });
  }

  completeAllElevatorCallApproaches() {
    const completedIds: string[] = [];
    for (const actor of this.actors.values()) {
      if (
        actor.traversalState.kind !==
        "moving-to-elevator-wait"
      ) {
        continue;
      }
      this.completeElevatorCallApproach(actor.id);
      completedIds.push(actor.id);
    }
    return Object.freeze(completedIds);
  }

  enqueueElevatorBoard(
    npcId: string,
    route: V2NpcElevatorTraversalRoute,
    requestedAtSeconds: number
  ) {
    const actor = this.requireActor(npcId);
    if (
      actor.traversalState.kind !==
      "approaching-elevator-board"
    ) {
      throw new Error(
        `乗車要求前のNPC状態が不正です: ${npcId}/${actor.traversalState.kind}`
      );
    }
    actor.traversalState = Object.freeze({
      kind: "waiting-elevator-board",
      ...route
    });
    this.requests.push(
      Object.freeze({
        kind: "elevator-board",
        npcId,
        requestedAtSeconds,
        ...route
      })
    );
  }

  enqueueElevatorReservationCancel(
    npcId: string,
    route: V2NpcElevatorTraversalRoute
  ) {
    const actor = this.requireActor(npcId);
    if (
      actor.traversalState.kind !==
      "approaching-elevator-board"
    ) {
      throw new Error(
        `予約取消前のNPC状態が不正です: ${npcId}/${actor.traversalState.kind}`
      );
    }
    actor.traversalState = Object.freeze({
      kind: "walking"
    });
    this.requests.push(
      Object.freeze({
        kind: "elevator-reservation-cancel",
        npcId,
        ...route
      })
    );
  }

  enqueueElevatorCallCancel(
    npcId: string,
    route: V2NpcElevatorTraversalRoute
  ) {
    const actor = this.requireActor(npcId);
    if (
      actor.traversalState.kind !==
        "waiting-elevator-call-input" &&
      actor.traversalState.kind !==
        "moving-to-elevator-wait" &&
      actor.traversalState.kind !==
        "waiting-elevator-call"
    ) {
      throw new Error(
        `呼出取消前のNPC状態が不正です: ${npcId}/${actor.traversalState.kind}`
      );
    }
    actor.traversalState = Object.freeze({
      kind: "walking"
    });
    this.requests.push(
      Object.freeze({
        kind: "elevator-call-cancel",
        npcId,
        ...route
      })
    );
  }

  setActorPosition(npcId: string, position: Vector3) {
    this.requireActor(npcId).position.copyFrom(position);
  }

  countAppliedResult(
    kind: V2NpcTraversalResult["kind"],
    npcId: string
  ) {
    return this.appliedResults.filter(
      (result) =>
        result.kind === kind && result.npcId === npcId
    ).length;
  }

  getAppliedResultCount() {
    this.assertActive();
    return this.appliedResults.length;
  }

  getAppliedResultNpcIds(kind: V2NpcTraversalResult["kind"]) {
    this.assertActive();
    return Object.freeze(
      this.appliedResults
        .filter((result) => result.kind === kind)
        .map((result) => result.npcId)
    );
  }

  getScriptedPhaseTraversalReleaseCount() {
    this.assertActive();
    return this.scriptedPhaseTraversalReleaseCount;
  }

  getHumanTargetReadCount() {
    this.assertActive();
    return this.humanTargetReadCount;
  }

  prepareVisualResources(): Promise<void> {
    this.assertActive();
    return Promise.resolve();
  }

  update(
    _deltaSeconds: number,
    _elapsedSeconds: number,
    _playerElevatorTraversal: V2PlayerElevatorTraversalSnapshot | null
  ): never {
    return this.unexpected("update");
  }

  getFrame(): never {
    return this.unexpected("getFrame");
  }

  drainAudioEvents() {
    this.assertActive();
    return Object.freeze([]);
  }

  canPlayerMove() {
    this.assertActive();
    return true;
  }

  selectPlayerCompletion(
    _state: V2PlayerCompletionState
  ): never {
    return this.unexpected("selectPlayerCompletion");
  }

  getNpcCommandCandidates():
    readonly V2NpcCommandCandidate[] {
    this.assertActive();
    return Object.freeze([]);
  }

  requestNpcCommand(
    npcId: string,
    kind: V2NpcCommandKind
  ) {
    const actor = this.requireActor(npcId);
    actor.commandMode = kind;
    return true;
  }

  cancelNpcFollow(npcId: string) {
    const actor = this.requireActor(npcId);
    if (actor.commandMode !== "follow") {
      return false;
    }
    actor.commandMode = "none";
    return true;
  }

  getHumanTargets(): readonly V2HumanTargetSnapshot[] {
    this.assertActive();
    this.humanTargetReadCount += 1;
    return Object.freeze([
      this.getPlayerTarget(),
      ...[...this.actors.values()].map(
        createTraversalTargetSnapshot
      )
    ]);
  }

  getBitActors() {
    this.assertActive();
    return Object.freeze([]);
  }

  getMinimapActors() {
    this.assertActive();
    return Object.freeze(
      [...this.actors.values()].map((actor) =>
        Object.freeze({
          id: actor.id,
          kind: "npc" as const,
          areaPosition: actor.position.clone(),
          sightPosition: createTraversalTargetSnapshot(actor).aimPosition,
          follower: actor.commandMode === "follow"
        })
      )
    );
  }

  releaseNpcTraversalForScriptedPhase() {
    this.assertActive();
    this.requests = [];
    for (const actor of this.actors.values()) {
      actor.traversalState = Object.freeze({
        kind: "walking"
      });
    }
    this.scriptedPhaseTraversalReleaseCount += 1;
  }

  drainNpcTraversalRequests():
    readonly V2NpcTraversalRequest[] {
    this.assertActive();
    const drained = Object.freeze([...this.requests]);
    this.requests = [];
    return drained;
  }

  applyNpcTraversalResults(
    results: readonly V2NpcTraversalResult[]
  ): readonly V2NpcTraversalNotification[] {
    this.assertActive();
    const notifications: V2NpcTraversalNotification[] = [];
    for (const result of results) {
      this.appliedResults.push(result);
      const actor = this.requireActor(result.npcId);
      switch (result.kind) {
        case "door-opened":
          if (
            actor.traversalState.kind !==
              "waiting-door-open" ||
            actor.traversalState.doorId !== result.doorId
          ) {
            throw new Error(
              `door-opened結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.traversalState = Object.freeze({
            kind: "passing-door",
            doorId: result.doorId
          });
          break;
        case "door-pass-detected":
          if (
            actor.traversalState.kind !== "passing-door" ||
            actor.traversalState.doorId !== result.doorId
          ) {
            throw new Error(
              `door-pass-detected結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.traversalState = Object.freeze({
            kind: "walking"
          });
          this.requests.push(
            Object.freeze({
              kind: "door-pass-complete",
              npcId: actor.id,
              doorId: result.doorId
            })
          );
          break;
        case "elevator-call-accepted": {
          const state = this.requireElevatorIdentity(
            actor,
            result
          );
          if (
            state.kind !==
            "waiting-elevator-call-input"
          ) {
            throw new Error(
              `elevator-call-accepted結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.traversalState = Object.freeze({
            ...state,
            kind: "moving-to-elevator-wait"
          });
          break;
        }
        case "elevator-ready-for-boarding": {
          const state = this.requireElevatorIdentity(
            actor,
            result
          );
          if (state.kind !== "waiting-elevator-call") {
            throw new Error(
              `elevator-ready結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.traversalState = Object.freeze({
            ...state,
            kind: "approaching-elevator-board"
          });
          break;
        }
        case "elevator-boarded": {
          const state = this.requireElevatorIdentity(
            actor,
            result
          );
          if (state.kind !== "waiting-elevator-board") {
            throw new Error(
              `elevator-boarded結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.traversalState = Object.freeze({
            ...state,
            kind: "riding-elevator"
          });
          actor.reservationResultRevision += 1;
          break;
        }
        case "elevator-safety-evicted": {
          const state = this.requireElevatorIdentity(
            actor,
            result
          );
          if (state.kind !== "riding-elevator") {
            throw new Error(
              `elevator-safety-evicted結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.position.copyFrom(result.location.position);
          actor.traversalState = Object.freeze({
            kind: "walking"
          });
          break;
        }
        case "elevator-boarding-rejected": {
          const state = this.requireElevatorIdentity(
            actor,
            result
          );
          if (
            state.kind !== "waiting-elevator-call" &&
            state.kind !== "approaching-elevator-board" &&
            state.kind !== "waiting-elevator-board"
          ) {
            throw new Error(
              `elevator-rejected結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.traversalState = Object.freeze({
            kind: "walking"
          });
          actor.reservationResultRevision += 1;
          break;
        }
        case "elevator-arrived": {
          const state = this.requireElevatorIdentity(
            actor,
            result
          );
          if (state.kind !== "riding-elevator") {
            throw new Error(
              `elevator-arrived結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.traversalState = Object.freeze({
            ...state,
            kind: "leaving-elevator"
          });
          break;
        }
        case "elevator-disembarked": {
          const state = this.requireElevatorIdentity(
            actor,
            result
          );
          if (state.kind !== "leaving-elevator") {
            throw new Error(
              `elevator-disembarked結果前のNPC状態が不正です: ${actor.id}`
            );
          }
          actor.completeTransitionCount += 1;
          actor.traversalState = Object.freeze({
            kind: "walking"
          });
          break;
        }
      }
    }
    return Object.freeze(notifications);
  }

  getNpcTraversalState(npcId: string) {
    this.assertActive();
    return cloneV2NpcTraversalState(
      this.requireActor(npcId).traversalState
    );
  }

  getNpcPosition(npcId: string) {
    this.assertActive();
    return this.requireActor(npcId).position.clone();
  }

  setNpcTransportPosition(
    npcId: string,
    position: Vector3
  ) {
    this.assertActive();
    this.requireActor(npcId).position.copyFrom(position);
  }

  relocateBit(_bitId: string, _candidates: readonly Vector3[]): Vector3 {
    return this.unexpected("relocateBit");
  }

  beginTargetNavigationAreaTransport(
    targetId: string,
    _position: Vector3
  ) {
    this.assertActive();
    if (targetId !== "player") {
      this.requireActor(targetId);
    }
  }

  updateTargetNavigationAreaTransportPosition(
    targetId: string,
    _position: Vector3
  ) {
    this.assertActive();
    if (targetId !== "player") {
      this.requireActor(targetId);
    }
  }

  relocateTargetNavigationArea(
    targetId: string,
    _position: Vector3
  ) {
    this.assertActive();
    if (targetId !== "player") {
      this.requireActor(targetId);
    }
  }

  requestPlayerGunFire(_direction: Vector3) {
    this.assertActive();
    return false;
  }

  notifyPlayerElevatorStartedMoving(): void {
    this.unexpected("notifyPlayerElevatorStartedMoving");
  }

  requestBroadcast(
    _command: Parameters<V2SurvivalRuntime["requestBroadcast"]>[0]
  ): boolean {
    return this.unexpected("requestBroadcast");
  }

  getMissions(): ReturnType<V2SurvivalRuntime["getMissions"]> {
    return this.unexpected("getMissions");
  }

  replayExecution(): never {
    return this.unexpected("replayExecution");
  }

  dispose() {
    this.assertActive();
    this.requests = [];
    this.actors.clear();
    this.active = false;
  }
}

const requireWorldCenter = (mesh: Mesh) => {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo();
  return mesh.getBoundingInfo().boundingBox.centerWorld.clone();
};

const getPanelColliders = (door: StageDoorAsset) =>
  Object.freeze(
    door.panels.flatMap((panel) => panel.colliderMeshes)
  );

const isMeshInEveryDynamicSet = (
  snapshot: DynamicStageSpatialSnapshot,
  mesh: Mesh
) =>
  snapshot.movementColliders.player.includes(mesh) &&
  snapshot.movementColliders.npc.includes(mesh) &&
  snapshot.movementColliders.bit.includes(mesh) &&
  snapshot.beamBlockers.includes(mesh) &&
  snapshot.sightBlockers.includes(mesh) &&
  snapshot.bitObstacles.includes(mesh);

const isMeshAbsentFromEveryDynamicSet = (
  snapshot: DynamicStageSpatialSnapshot,
  mesh: Mesh
) =>
  !snapshot.movementColliders.player.includes(mesh) &&
  !snapshot.movementColliders.npc.includes(mesh) &&
  !snapshot.movementColliders.bit.includes(mesh) &&
  !snapshot.beamBlockers.includes(mesh) &&
  !snapshot.sightBlockers.includes(mesh) &&
  !snapshot.bitObstacles.includes(mesh);

const inspectDoorSpatialContract = (
  context: StageSpatialContext,
  snapshot: SchoolStageDynamicRuntimeSnapshot,
  door: StageDoorAsset,
  expectedActive: boolean
) => {
  const colliders = getPanelColliders(door);
  const setStateOk = colliders.every((collider) =>
    expectedActive
      ? isMeshInEveryDynamicSet(snapshot.spatialSnapshot, collider)
      : isMeshAbsentFromEveryDynamicSet(snapshot.spatialSnapshot, collider)
  );
  const blockerContainmentOk = colliders.every((collider) => {
    const center = requireWorldCenter(collider);
    const beamBlocker = context.queries.findContainingBlocker("beam", center);
    const sightBlocker = context.queries.findContainingBlocker("sight", center);
    return expectedActive
      ? beamBlocker !== null && sightBlocker !== null
      : beamBlocker !== collider && sightBlocker !== collider;
  });
  return Object.freeze({
    ok:
      setStateOk &&
      blockerContainmentOk &&
      context.queries.revision === snapshot.revision,
    setStateOk,
    blockerContainmentOk,
    revision: snapshot.revision
  });
};

type DoorRaySegment = Readonly<{
  center: Vector3;
  normal: Vector3;
  from: Vector3;
  to: Vector3;
  length: number;
}>;

type DoorDynamicRaySample = Readonly<{
  revision: number;
  originCount: number;
  originCoverageOk: boolean;
  startContainmentOk: boolean;
  beamSegmentOk: boolean;
  sightStartContainmentOk: boolean;
  sightSegmentOk: boolean;
  singleRevisionOk: boolean;
  queryCount: number;
  staticFallbackAccessCount: number;
}>;

const createDoorRaySegment = (collider: Mesh): DoorRaySegment => {
  collider.computeWorldMatrix(true);
  collider.refreshBoundingInfo();
  const bounds = collider.getBoundingInfo().boundingBox;
  const localExtents = [
    bounds.extendSize.x,
    bounds.extendSize.y,
    bounds.extendSize.z
  ] as const;
  const localAxes = [
    Vector3.Right(),
    Vector3.Up(),
    Vector3.Forward()
  ] as const;
  const worldAxes = localAxes.map((axis, index) => {
    const transformed = Vector3.TransformNormal(
      axis,
      collider.getWorldMatrix()
    );
    return Object.freeze({
      normal: transformed.normalizeToNew(),
      halfExtent: localExtents[index] * transformed.length()
    });
  });
  const thicknessAxis = worldAxes.reduce((smallest, candidate) =>
    candidate.halfExtent < smallest.halfExtent ? candidate : smallest
  );
  const center = bounds.centerWorld.clone();
  const margin = 0.05;
  const halfLength = thicknessAxis.halfExtent + margin;
  const offset = thicknessAxis.normal.scale(halfLength);
  return Object.freeze({
    center,
    normal: thicknessAxis.normal,
    from: center.subtract(offset),
    to: center.add(offset),
    length: halfLength * 2
  });
};

const createDoorDynamicRayProbe = (
  scene: Scene,
  context: StageSpatialContext,
  door: StageDoorAsset,
  closedSegment: DoorRaySegment
) => {
  const doorColliders = new Set(getPanelColliders(door));
  let observedRevisions: number[] = [];
  let queryCount = 0;
  let staticFallbackAccessCount = 0;
  let recording = false;
  const recordRevision = () => {
    if (!recording) {
      return;
    }
    observedRevisions.push(context.queries.revision);
    queryCount += 1;
  };
  const queryProxy: StageSpatialContext["queries"] = {
    get revision() {
      const revision = context.queries.revision;
      if (recording) {
        observedRevisions.push(revision);
      }
      return revision;
    },
    castMovementSegment: (moverKind, from, to) =>
      context.queries.castMovementSegment(moverKind, from, to),
    castMovementSphere: (moverKind, from, to, radius) =>
      context.queries.castMovementSphere(
        moverKind,
        from,
        to,
        radius
      ),
    castBeamSegment: (from, to) => {
      recordRevision();
      return context.queries.castBeamSegment(from, to);
    },
    castSightSegment: (from, to) => {
      recordRevision();
      return context.queries.castSightSegment(from, to);
    },
    sampleGround: (origin, maxDistance) =>
      context.queries.sampleGround(origin, maxDistance),
    containsVolume: (role, point) =>
      context.queries.containsVolume(role, point),
    containsVolumeById: (id, point) =>
      context.queries.containsVolumeById(id, point),
    intersectsVolumeSegmentById: (id, from, to) =>
      context.queries.intersectsVolumeSegmentById(id, from, to),
    intersectsVolumeById: (id, ellipsoid) =>
      context.queries.intersectsVolumeById(id, ellipsoid),
    findContainingBlocker: (kind, point) => {
      recordRevision();
      return context.queries.findContainingBlocker(kind, point);
    },
    dispose: () => context.queries.dispose()
  };
  Object.freeze(queryProxy);
  const resourcesProxy = new Proxy(context.resources, {
    get: (target, property, receiver) => {
      if (
        property === "beamBlockers" ||
        property === "sightBlockers"
      ) {
        staticFallbackAccessCount += 1;
      }
      return Reflect.get(target, property, receiver);
    }
  });
  const stageProxy = new Proxy({
    ...context,
    resources: resourcesProxy,
    queries: queryProxy
  }, {
    get: (target, property, receiver) => {
      if (
        property === "beamBlockers" ||
        property === "sightBlockers"
      ) {
        staticFallbackAccessCount += 1;
      }
      return Reflect.get(target, property, receiver);
    }
  });
  const beamSystem: V2BeamSystem = createV2BeamSystem({
    scene,
    stage: stageProxy,
    getHumanTargets: () => Object.freeze([]),
    random: () => 0.5,
    getOrbVisibilityPredicate: () => () => false
  });

  return Object.freeze({
    sample: (
      snapshot: SchoolStageDynamicRuntimeSnapshot,
      expectedPanelActive: boolean,
      expectedDoorwayBlocked: boolean
    ): DoorDynamicRaySample => {
      beamSystem.clear();
      observedRevisions = [];
      queryCount = 0;
      const fallbackCountBefore = staticFallbackAccessCount;
      const currentCollider = getPanelColliders(door)[0];
      const currentSegment = createDoorRaySegment(currentCollider);
      for (const originKind of CURRENT_BEAM_ORIGIN_KINDS) {
        beamSystem.spawn({
          sourceId: `door-start-${originKind}`,
          originKind,
          targetPolicy: Object.freeze({
            kind: "alive-humans"
          }),
          origin: currentSegment.center,
          direction: currentSegment.normal,
          speed: closedSegment.length * 10,
          maximumLifetime: 1
        });
        beamSystem.spawn({
          sourceId: `door-segment-${originKind}`,
          originKind,
          targetPolicy: Object.freeze({
            kind: "alive-humans"
          }),
          origin: closedSegment.from,
          direction: closedSegment.normal,
          speed: closedSegment.length * 10,
          maximumLifetime: 1
        });
      }
      recording = true;
      const frame = beamSystem.update(0.1);
      recording = false;
      const processedOrigins = new Set([
        ...frame.impacts.map((impact) => impact.originKind),
        ...beamSystem
          .getActiveBeams()
          .map((beam) => beam.originKind)
      ]);
      const startHits = frame.impacts.filter(
        (impact) =>
          impact.sourceId.startsWith("door-start-") &&
          impact.hit.kind === "blocker" &&
          impact.hit.startedInside &&
          doorColliders.has(impact.hit.mesh)
      );
      const segmentHits = frame.impacts.filter(
        (impact) =>
          impact.sourceId.startsWith("door-segment-") &&
          impact.hit.kind === "blocker" &&
          !impact.hit.startedInside &&
          doorColliders.has(impact.hit.mesh)
      );

      recording = true;
      const sightStart = castV2SightSegment(
        stageProxy,
        currentSegment.center,
        currentSegment.center.add(currentSegment.normal.scale(0.01))
      );
      const sightSegment = castV2SightSegment(
        stageProxy,
        closedSegment.from,
        closedSegment.to
      );
      recording = false;
      const allQueryRevisions = Object.freeze([
        ...observedRevisions
      ]);
      const revision = snapshot.revision;
      const isDoorSightHit = (
        result: ReturnType<typeof castV2SightSegment>
      ) =>
        result.occluded &&
        result.mesh !== null &&
        doorColliders.has(result.mesh);
      return Object.freeze({
        revision,
        originCount: CURRENT_BEAM_ORIGIN_KINDS.length,
        originCoverageOk:
          processedOrigins.size ===
            CURRENT_BEAM_ORIGIN_KINDS.length &&
          CURRENT_BEAM_ORIGIN_KINDS.every((originKind) =>
            processedOrigins.has(originKind)
          ),
        startContainmentOk: expectedPanelActive
          ? startHits.length === CURRENT_BEAM_ORIGIN_KINDS.length
          : startHits.length === 0,
        beamSegmentOk: expectedDoorwayBlocked
          ? segmentHits.length === CURRENT_BEAM_ORIGIN_KINDS.length
          : segmentHits.length === 0,
        sightStartContainmentOk: expectedPanelActive
          ? isDoorSightHit(sightStart) && sightStart.startedInside
          : !isDoorSightHit(sightStart),
        sightSegmentOk: expectedDoorwayBlocked
          ? isDoorSightHit(sightSegment) &&
            !sightSegment.startedInside
          : !isDoorSightHit(sightSegment),
        singleRevisionOk:
          allQueryRevisions.length > 0 &&
          allQueryRevisions.every(
            (observedRevision) =>
              observedRevision === revision
          ),
        queryCount,
        staticFallbackAccessCount:
          staticFallbackAccessCount - fallbackCountBefore
      });
    },
    dispose: () => {
      recording = false;
      beamSystem.dispose();
    }
  });
};

const inspectElevatorMotionPanels = (
  snapshot: SchoolStageDynamicRuntimeSnapshot,
  elevator: StageElevatorAsset,
  movingStopId: string,
  expectedMovingPanelsActive: boolean
) => {
  const movingStop = elevator.stops.find((stop) => stop.id === movingStopId);
  if (!movingStop) {
    throw new Error(
      `fixtureエレベーター停止階がありません: ${movingStopId}`
    );
  }
  const stableStop = elevator.stops.find((stop) => stop !== movingStop);
  if (!stableStop) {
    throw new Error("fixtureエレベーターの反対停止階がありません。");
  }
  const movingPanels = [
    ...elevator.car.door.panels.flatMap((panel) => panel.colliderMeshes),
    ...movingStop.landingDoor.panels.flatMap(
      (panel) => panel.colliderMeshes
    )
  ];
  const stablePanels = stableStop.landingDoor.panels.flatMap(
    (panel) => panel.colliderMeshes
  );
  return (
    movingPanels.every((mesh) =>
      expectedMovingPanelsActive
        ? isMeshInEveryDynamicSet(snapshot.spatialSnapshot, mesh)
        : isMeshAbsentFromEveryDynamicSet(snapshot.spatialSnapshot, mesh)
    ) &&
    stablePanels.every((mesh) =>
      isMeshInEveryDynamicSet(snapshot.spatialSnapshot, mesh)
    )
  );
};

const createRuntimeDriver = (
  context: StageSpatialContext,
  runtime: SchoolStageDynamicRuntime
) => {
  let lastPlayerSnapshot: DynamicStageSpatialSnapshot | null = null;
  const syncPlayerSnapshot = (snapshot: DynamicStageSpatialSnapshot) => {
    if (snapshot !== context.dynamicVariants.getSnapshot()) {
      throw new Error("プレイヤー同期対象が現行snapshotではありません。");
    }
    if (
      lastPlayerSnapshot &&
      snapshot.revision < lastPlayerSnapshot.revision
    ) {
      throw new Error("プレイヤーsnapshot revisionが逆行しました。");
    }
    lastPlayerSnapshot = snapshot;
  };
  syncPlayerSnapshot(runtime.getSnapshot().spatialSnapshot);
  return Object.freeze({
    update: (deltaSeconds: number) => {
      const previousRevision = runtime.revision;
      const snapshot = runtime.update(deltaSeconds);
      const revisionDelta = snapshot.revision - previousRevision;
      if (revisionDelta < 0 || revisionDelta > 1) {
        throw new Error(
          `同一更新の原子公開回数が不正です: delta=${revisionDelta}`
        );
      }
      syncPlayerSnapshot(snapshot.spatialSnapshot);
      if (
        snapshot.revision !== context.queries.revision ||
        snapshot.spatialSnapshot !== context.dynamicVariants.getSnapshot()
      ) {
        throw new Error(
          "Runtime、query、プレイヤーのsnapshot revisionが一致しません。"
        );
      }
      return snapshot;
    },
    getLastPlayerRevision: () => lastPlayerSnapshot!.revision
  });
};

const getExteriorBitProjectionCount = (context: StageSpatialContext) => {
  const worldBoundary = context.worldBoundary;
  if (!worldBoundary) {
    throw new Error("実学校にworldBoundaryがありません。");
  }
  const mesh = worldBoundary.mesh;
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo();
  const bounds = mesh.getBoundingInfo().boundingBox;
  const minimum = bounds.minimumWorld;
  const maximum = bounds.maximumWorld;
  const centerX = (minimum.x + maximum.x) * 0.5;
  const centerZ = (minimum.z + maximum.z) * 0.5;
  const inset = 0.25;
  let exteriorSampleCount = 0;
  let projectionCount = 0;
  for (const band of context.bitNavigation.bands) {
    const centerY =
      (band.minimumCenterHeight + band.maximumCenterHeight) * 0.5;
    const samples = [
      new Vector3(minimum.x + inset, centerY, centerZ),
      new Vector3(maximum.x - inset, centerY, centerZ),
      new Vector3(centerX, centerY, minimum.z + inset),
      new Vector3(centerX, centerY, maximum.z - inset)
    ];
    for (const sample of samples) {
      if (
        worldBoundary.contains(sample) &&
        !context.boundary.contains(sample)
      ) {
        exteriorSampleCount += 1;
        const projected = context.bitNavigation.projectPointInBand(
          Object.freeze({
            zoneId: band.zoneId,
            bandId: band.id
          }),
          sample,
          0.05
        );
        if (projected) {
          projectionCount += 1;
        }
      }
    }
  }
  return Object.freeze({
    exteriorSampleCount,
    projectionCount
  });
};

const createTraversalEllipsoid = (
  footPosition: Vector3
) =>
  Object.freeze({
    center: footPosition.add(
      new Vector3(0, TRAVERSAL_ACTOR_RADII.y, 0)
    ),
    radii: TRAVERSAL_ACTOR_RADII.clone()
  });

const requireDoorTraversalPositions = (
  context: StageSpatialContext,
  door: StageDoorAsset
) => {
  const normal = Vector3.TransformNormal(
    Vector3.Forward(),
    door.node.computeWorldMatrix(true)
  );
  normal.y = 0;
  if (normal.lengthSquared() <= POSITION_EPSILON) {
    throw new Error(
      `fixture扉法線を水平面へ投影できません: ${door.id}`
    );
  }
  normal.normalize();
  const sweepCenter = requireWorldCenter(door.sweepMesh);
  const baseFootPosition = sweepCenter.subtract(
    new Vector3(0, TRAVERSAL_ACTOR_RADII.y, 0)
  );
  const findSide = (side: -1 | 1) => {
    for (
      let distance = 0.1;
      distance <= 4;
      distance += 0.1
    ) {
      const candidate = baseFootPosition.add(
        normal.scale(distance * side)
      );
      const ellipsoid = createTraversalEllipsoid(candidate);
      if (
        context.boundary.contains(candidate) &&
        !context.queries.intersectsVolumeById(
          door.sweepId,
          ellipsoid
        ) &&
        !intersectsStageDoorClosedPose(door, ellipsoid)
      ) {
        return candidate;
      }
    }
    throw new Error(
      `fixture扉の通過側位置を確定できません: ${door.id}/${side}`
    );
  };
  return Object.freeze({
    entry: findSide(-1),
    exit: findSide(1)
  });
};

const requireDoorPlanePositionOutsideDoorVolumes = (
  context: StageSpatialContext,
  door: StageDoorAsset
) => {
  const normal = Vector3.TransformNormal(
    Vector3.Forward(),
    door.node.computeWorldMatrix(true)
  );
  normal.y = 0;
  if (normal.lengthSquared() <= POSITION_EPSILON) {
    throw new Error(
      `fixture扉法線を水平面へ投影できません: ${door.id}`
    );
  }
  normal.normalize();
  const tangent = new Vector3(-normal.z, 0, normal.x);
  const doorOrigin = door.node.getAbsolutePosition();
  const footY =
    requireWorldCenter(door.sweepMesh).y - TRAVERSAL_ACTOR_RADII.y;
  const planeOrigin = new Vector3(doorOrigin.x, footY, doorOrigin.z);
  for (let distance = 0.1; distance <= 4; distance += 0.1) {
    for (const direction of [-1, 1] as const) {
      const candidate = planeOrigin.add(
        tangent.scale(distance * direction)
      );
      const ellipsoid = createTraversalEllipsoid(candidate);
      if (
        context.boundary.contains(candidate) &&
        !context.queries.intersectsVolumeById(
          door.sweepId,
          ellipsoid
        ) &&
        !intersectsStageDoorClosedPose(door, ellipsoid)
      ) {
        return candidate;
      }
    }
  }
  throw new Error(
    `fixture扉判定面上の非占有位置を確定できません: ${door.id}`
  );
};

const requireElevatorRoute = (
  context: StageSpatialContext,
  elevator: StageElevatorAsset
): V2NpcElevatorTraversalRoute => {
  const fromStop = elevator.initialStop;
  const destinationStop = elevator.stops.find(
    (stop) => stop !== fromStop
  );
  if (!destinationStop) {
    throw new Error(
      `fixtureエレベーターの反対停止階がありません: ${elevator.id}`
    );
  }
  const fromEndpoint =
    fromStop.endpoint === "A"
      ? elevator.link.endpointA
      : elevator.link.endpointB;
  const destinationEndpoint =
    destinationStop.endpoint === "A"
      ? elevator.link.endpointA
      : elevator.link.endpointB;
  const entryLocation = context.navigation.projectPoint(
    fromEndpoint.position,
    2
  );
  const exitLocation = context.navigation.projectPoint(
    destinationEndpoint.position,
    2
  );
  if (!entryLocation || !exitLocation) {
    throw new Error(
      `実学校エレベーターendpointをNavMeshへ投影できません: ${elevator.id}`
    );
  }
  return Object.freeze({
    linkId: elevator.link.id,
    from: fromStop.endpoint,
    to: destinationStop.endpoint,
    entryLocation,
    exitLocation
  });
};

const captureTraversalActorContract = (
  actor: TraversalFixtureActor
) =>
  Object.freeze({
    reference: actor,
    state: actor.state,
    commandMode: actor.commandMode,
    targetId: actor.targetId,
    targetProvenance: actor.targetProvenance,
    targetSelectionPersonality:
      actor.targetSelectionPersonality
  });

const runTraversalCoordinatorAcceptance = async (
  scene: Scene,
  selections: ReturnType<
    typeof createSchoolRoomVariantSelections
  >,
  checks: SchoolIntegrationCheck[]
) => {
  let context: Nullable<StageSpatialContext> = null;
  let runtime: Nullable<SchoolStageDynamicRuntime> = null;
  let player: Nullable<TraversalFixturePlayer> = null;
  let survival: Nullable<StrictTraversalSurvivalHarness> = null;
  let coordinator: Nullable<
    ReturnType<typeof createSchoolStageTraversalCoordinator>
  > = null;
  try {
    context = await loadStageSpatialContext(
      scene,
      SCHOOL_VALIDATION_STAGE,
      {
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(
            SCHOOL_INTEGRATION_SEED
          ),
        roomVariantSelections: selections
      }
    );
    player = createTraversalFixturePlayer(
      new Vector3(1_500, 1_000, 1_000)
    );
    survival = new StrictTraversalSurvivalHarness(
      () => player!.createTargetSnapshot()
    );
    const farPosition = new Vector3(1_600, 1_000, 1_000);
    survival.addActor({
      id: "door-unbrainwashed",
      state: "normal",
      position: farPosition
    });
    survival.addActor({
      id: "door-brainwashed",
      state: "brainwash-complete-gun",
      position: farPosition
    });
    survival.addActor({
      id: "door-occupancy",
      state: "normal",
      position: farPosition
    });
    survival.addActor({
      id: "door-blocker",
      state: "normal",
      position: farPosition
    });
    survival.addActor({
      id: "door-shared-a",
      state: "normal",
      position: farPosition
    });
    survival.addActor({
      id: "door-shared-b",
      state: "brainwash-complete-gun",
      position: farPosition
    });
    runtime = createSchoolStageDynamicRuntime({
      staticActiveSet: context.staticSpatialActiveSet,
      doorAssets: context.doorAssets,
      elevatorAssets: context.elevatorAssets,
      dynamicVariants: context.dynamicVariants,
      queries: context.queries,
      actors: createSchoolStageActorPort(player, survival, context)
    });
    const doorCloseValues = [0.1, 0.5, 0.1, 0.1, 0.5, 0.5];
    let doorCloseRandomCount = 0;
    coordinator = createSchoolStageTraversalCoordinator({
      stage: context,
      runtime,
      survival,
      player,
      doorCloseRandom: () => {
        const value = doorCloseValues[doorCloseRandomCount];
        if (value === undefined) {
          throw new Error(
            "NPC通過後の閉扉判定が1回制約を超えて再試行されました。"
          );
        }
        doorCloseRandomCount += 1;
        return value;
      }
    });
    let maximumPublishCountPerUpdate = 0;
    const updateCoordinator = (deltaSeconds: number) => {
      const previousRevision = runtime!.revision;
      const frame = coordinator!.update(deltaSeconds);
      const publishCount =
        frame.runtimeSnapshot.revision - previousRevision;
      if (publishCount < 0 || publishCount > 1) {
        throw new Error(
          `Coordinator同一更新の原子公開回数が不正です: ${publishCount}`
        );
      }
      maximumPublishCountPerUpdate = Math.max(
        maximumPublishCountPerUpdate,
        publishCount
      );
      if (
        frame.runtimeSnapshot.spatialSnapshot !==
          context!.dynamicVariants.getSnapshot() ||
        frame.runtimeSnapshot.revision !==
          context!.queries.revision ||
        player!.getLastSyncedSnapshot() !==
          frame.runtimeSnapshot.spatialSnapshot
      ) {
        throw new Error(
          "Coordinator更新のRuntime・query・player snapshotが一致しません。"
        );
      }
      return frame;
    };
    const idleTargetReadCountBefore =
      survival.getHumanTargetReadCount();
    updateCoordinator(0);
    const idleTargetReadCount =
      survival.getHumanTargetReadCount() -
      idleTargetReadCountBefore;
    checks.push(
      Object.freeze({
        name: "エレベーター待機者なし更新で人物snapshot構築を省略",
        ok: idleTargetReadCount === 0,
        detail: `humanTargetReads=${idleTargetReadCount}`
      })
    );

    const closedRoomDoors = context.doorAssets
      .getByClass("room")
      .filter(
        (door) =>
          runtime!.doors.getDoorState(door.id).state ===
          "closed"
      );
    if (closedRoomDoors.length < 4) {
      throw new Error(
        `全陣営扉fixtureに必要な閉室扉が不足しています: ${closedRoomDoors.length}`
      );
    }
    const playerDoor = closedRoomDoors[0];
    const unbrainwashedDoor = closedRoomDoors[1];
    const brainwashedDoor = closedRoomDoors[2];
    const playerPass =
      requireDoorTraversalPositions(context, playerDoor);
    player.placeAt(playerPass.entry, playerPass.exit);
    const playerOpenRequest =
      runtime.doors.requestDoorToggle(playerDoor.id);
    updateCoordinator(0);
    updateCoordinator(STAGE_DOOR_TRAVEL_SECONDS);

    const executeNpcDoorPass = (
      npcId: string,
      door: StageDoorAsset
    ) => {
      const pass = requireDoorTraversalPositions(
        context!,
        door
      );
      survival!.enqueueDoorOpen(
        npcId,
        door.id,
        pass.entry
      );
      updateCoordinator(0);
      updateCoordinator(STAGE_DOOR_TRAVEL_SECONDS);
      const openedState =
        survival!.getNpcTraversalState(npcId);
      survival!.setActorPosition(npcId, pass.exit);
      updateCoordinator(0);
      const passDetectedCount =
        survival!.countAppliedResult(
          "door-pass-detected",
          npcId
        );
      updateCoordinator(0);
      return Object.freeze({
        pass,
        openedState,
        passDetectedCount
      });
    };

    const unbrainwashedPass = executeNpcDoorPass(
      "door-unbrainwashed",
      unbrainwashedDoor
    );
    updateCoordinator(STAGE_DOOR_TRAVEL_SECONDS);
    const unbrainwashedFinalState =
      runtime.doors.getDoorState(unbrainwashedDoor.id);
    const brainwashedPass = executeNpcDoorPass(
      "door-brainwashed",
      brainwashedDoor
    );
    const brainwashedFinalState =
      runtime.doors.getDoorState(brainwashedDoor.id);

    const occupancyDoor =
      context.doorAssets.getByClass("toilet_stall")[0];
    if (!occupancyDoor) {
      throw new Error(
        "占有中閉鎖fixtureのトイレ扉がありません。"
      );
    }
    const occupancyPass = requireDoorTraversalPositions(
      context,
      occupancyDoor
    );
    survival.enqueueDoorOpen(
      "door-occupancy",
      occupancyDoor.id,
      occupancyPass.entry
    );
    updateCoordinator(0);
    survival.setActorPosition(
      "door-occupancy",
      occupancyPass.exit
    );
    survival.setActorPosition(
      "door-blocker",
      requireWorldCenter(occupancyDoor.sweepMesh).subtract(
        new Vector3(0, TRAVERSAL_ACTOR_RADII.y, 0)
      )
    );
    const blockerIntersects =
      context.queries.intersectsVolumeById(
        occupancyDoor.sweepId,
        createTraversalTargetSnapshot(
          survival.getActor("door-blocker")
        ).hitShape
      );
    updateCoordinator(0);
    updateCoordinator(0);
    const occupiedClosingDoorState =
      runtime.doors.getDoorState(occupancyDoor.id);
    survival.setActorPosition(
      "door-blocker",
      farPosition
    );
    updateCoordinator(STAGE_DOOR_TRAVEL_SECONDS * 2);
    const completedDoorState =
      runtime.doors.getDoorState(occupancyDoor.id);

    pushCheck(
      checks,
      "実Coordinator経由の全陣営開扉",
      playerOpenRequest.status === "started" &&
        runtime.doors.getDoorState(playerDoor.id).state ===
          "open" &&
        unbrainwashedPass.openedState.kind ===
          "passing-door" &&
        brainwashedPass.openedState.kind ===
          "passing-door",
      `player=${runtime.doors.getDoorState(playerDoor.id).state} / ` +
        `unbrainwashed=${unbrainwashedPass.openedState.kind} / ` +
        `brainwashed=${brainwashedPass.openedState.kind}`
    );
    pushCheck(
      checks,
      "NPCは記録進入側の反対側・楕円体離脱で通過完了",
      unbrainwashedPass.passDetectedCount === 1 &&
        brainwashedPass.passDetectedCount === 1 &&
        survival.countAppliedResult(
          "door-pass-detected",
          "door-occupancy"
        ) === 1,
      `unbrainwashed=${unbrainwashedPass.passDetectedCount} / ` +
        `brainwashed=${brainwashedPass.passDetectedCount} / ` +
        `occupancy=${survival.countAppliedResult(
          "door-pass-detected",
          "door-occupancy"
        )}`
    );
    pushCheck(
      checks,
      "通過後30%閉扉・占有中も閉鎖開始・再試行不要",
      unbrainwashedFinalState.state === "closed" &&
        brainwashedFinalState.state === "open" &&
        blockerIntersects &&
        occupiedClosingDoorState.state === "closing" &&
        completedDoorState.state === "closed" &&
        doorCloseRandomCount === 3,
      `30%=closed / 70%=open / occupied=${blockerIntersects}/` +
        `${occupiedClosingDoorState.state}->${completedDoorState.state}` +
        ` / retry=${doorCloseRandomCount - 3}`
    );

    const sharedDoor = closedRoomDoors[3];
    const sharedPass = requireDoorTraversalPositions(
      context,
      sharedDoor
    );
    survival.enqueueDoorOpen(
      "door-shared-a",
      sharedDoor.id,
      sharedPass.entry
    );
    survival.enqueueDoorOpen(
      "door-shared-b",
      sharedDoor.id,
      sharedPass.entry
    );
    updateCoordinator(0);
    updateCoordinator(STAGE_DOOR_TRAVEL_SECONDS);
    survival.setActorPosition(
      "door-shared-a",
      sharedPass.exit
    );
    updateCoordinator(0);
    updateCoordinator(0);
    const sharedDoorAfterFirstPass =
      runtime.doors.getDoorState(sharedDoor.id);
    survival.setActorPosition(
      "door-shared-b",
      sharedPass.exit
    );
    updateCoordinator(0);
    updateCoordinator(0);
    const sharedDoorAfterBothPasses =
      runtime.doors.getDoorState(sharedDoor.id);
    pushCheck(
      checks,
      "同一扉の複数NPC通過は個別30%試行・後続通過を妨げない",
      survival.countAppliedResult(
        "door-pass-detected",
        "door-shared-a"
      ) === 1 &&
        survival.countAppliedResult(
          "door-pass-detected",
          "door-shared-b"
        ) === 1 &&
        sharedDoorAfterFirstPass.state === "open" &&
        sharedDoorAfterBothPasses.state === "open" &&
        doorCloseRandomCount === 5,
      `first=${sharedDoorAfterFirstPass.state} / ` +
        `both=${sharedDoorAfterBothPasses.state} / ` +
        `random=${doorCloseRandomCount}`
    );

    const planeDoorId = "room-door-f03-classroom-01-02";
    const planeDoor = context.doorAssets.getById(planeDoorId);
    if (!planeDoor) {
      throw new Error(
        `扉判定面fixtureの対象扉がありません: ${planeDoorId}`
      );
    }
    const planePass = requireDoorTraversalPositions(context, planeDoor);
    const planePosition = requireDoorPlanePositionOutsideDoorVolumes(
      context,
      planeDoor
    );
    survival.enqueueDoorOpen(
      "door-unbrainwashed",
      planeDoor.id,
      planePass.entry
    );
    updateCoordinator(0);
    updateCoordinator(STAGE_DOOR_TRAVEL_SECONDS);
    const planePassCountBefore = survival.countAppliedResult(
      "door-pass-detected",
      "door-unbrainwashed"
    );
    survival.setActorPosition("door-unbrainwashed", planePosition);
    updateCoordinator(0);
    updateCoordinator(0);
    const planeState = survival.getNpcTraversalState(
      "door-unbrainwashed"
    );
    const planePassCountWhileOnSurface = survival.countAppliedResult(
      "door-pass-detected",
      "door-unbrainwashed"
    );
    survival.setActorPosition("door-unbrainwashed", planePass.exit);
    updateCoordinator(0);
    updateCoordinator(0);
    const planePassCountAfter = survival.countAppliedResult(
      "door-pass-detected",
      "door-unbrainwashed"
    );
    pushCheck(
      checks,
      "NPCは扉判定面上で通過待機し、反対側へ離脱した時だけ完了",
      planeState.kind === "passing-door" &&
        planePassCountWhileOnSurface === planePassCountBefore &&
        planePassCountAfter === planePassCountBefore + 1 &&
        doorCloseRandomCount === 6 &&
        survival.getNpcTraversalState("door-unbrainwashed").kind ===
          "walking",
      `state=${planeState.kind} / counts=${planePassCountBefore}->` +
        `${planePassCountWhileOnSurface}->${planePassCountAfter}` +
        ` / random=${doorCloseRandomCount}`
    );

    const elevator = context.elevatorAssets.all[0];
    if (!elevator) {
      throw new Error(
        "Coordinator fixtureのエレベーターがありません。"
      );
    }
    const route = requireElevatorRoute(context, elevator);
    const fromStop = elevator.stops.find(
      (stop) => stop.endpoint === route.from
    );
    const destinationStop = elevator.stops.find(
      (stop) => stop.endpoint === route.to
    );
    if (!fromStop || !destinationStop) {
      throw new Error(
        `Coordinator fixtureの停止階解決に失敗しました: ${elevator.id}`
      );
    }
    const callMatCenter = requireWorldCenter(
      fromStop.callMat.mesh
    );
    const callMatBounds =
      fromStop.callMat.mesh.getBoundingInfo().boundingBox;
    const callMatSweepFrom = new Vector3(
      callMatBounds.minimumWorld.x - 0.25,
      callMatCenter.y,
      callMatCenter.z
    );
    const callMatSweepTo = new Vector3(
      callMatBounds.maximumWorld.x + 0.25,
      callMatCenter.y,
      callMatCenter.z
    );
    pushCheck(
      checks,
      "1更新で呼出マットを飛び越す移動区間も実Volume交差で検出",
      !context.queries.containsVolumeById(
        fromStop.callMat.id,
        callMatSweepFrom
      ) &&
        !context.queries.containsVolumeById(
          fromStop.callMat.id,
          callMatSweepTo
        ) &&
        context.queries.intersectsVolumeSegmentById(
          fromStop.callMat.id,
          callMatSweepFrom,
          callMatSweepTo
        ),
      `from=${callMatSweepFrom.toString()} / to=${callMatSweepTo.toString()}`
    );
    const elevatorActorIds = Array.from(
      { length: 8 },
      (_, index) =>
        `elevator-${String(index + 1).padStart(2, "0")}`
    );
    const elevatorContracts = new Map<
      string,
      ReturnType<typeof captureTraversalActorContract>
    >();
    elevatorActorIds.forEach((actorId, index) => {
      const commandMode: V2NpcCommandMode =
        index === 0 || index === 6
          ? "follow"
          : index === 1 || index === 7
            ? "leave"
            : "none";
      const actor = survival!.addActor({
        id: actorId,
        state:
          index % 2 === 0
            ? "brainwash-complete-gun"
            : "brainwash-complete-no-gun",
        position: callMatCenter,
        commandMode,
        targetId: `combat-target-${index % 2}`,
        targetProvenance:
          index % 2 === 0 ? "visual" : "alert",
        targetSelectionPersonality:
          index % 2 === 0
            ? "persistent"
            : "nearest-visible"
      });
      elevatorContracts.set(
        actorId,
        captureTraversalActorContract(actor)
      );
    });
    const allElevatorActorsOnCallMat =
      elevatorActorIds.every((actorId) =>
        context!.queries.containsVolumeById(
          fromStop.callMat.id,
          survival!.getNpcPosition(actorId)
        )
      );
    survival!.enqueueElevatorCall(
      elevatorActorIds[0],
      route,
      9
    );
    const firstCallAcceptedFrame = updateCoordinator(0);
    const firstCallAcceptedActorIds =
      survival.completeAllElevatorCallApproaches();
    const firstReadyFrame = updateCoordinator(0);
    survival!.enqueueElevatorBoard(
      elevatorActorIds[0],
      route,
      9.5
    );
    const firstBoardingFrame = updateCoordinator(0);
    const firstPassengerSnapshot = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const lateJoinCallMatState = firstPassengerSnapshot.stops.find(
      (stop) => stop.id === fromStop.id
    )?.callMatState;
    elevatorActorIds.slice(1).forEach((actorId) =>
      survival!.enqueueElevatorCall(
        actorId,
        route,
        10
      )
    );
    const lateCallAcceptedFrame = updateCoordinator(0);
    const lateCallAcceptedActorIds =
      survival.completeAllElevatorCallApproaches();
    const callAcceptedActorIds = [
      ...firstCallAcceptedActorIds,
      ...lateCallAcceptedActorIds
    ];
    const readyFrame = updateCoordinator(0);
    const readyActorIds = elevatorActorIds.filter(
      (actorId) =>
        survival!.getNpcTraversalState(actorId).kind ===
        "approaching-elevator-board"
    );
    const allReady =
      readyActorIds.join("|") ===
      elevatorActorIds.slice(1, 6).join("|");
    const reservationSnapshot =
      runtime.getElevator(elevator.id).getSnapshot();
    updateCoordinator(0);
    const heldReservationSnapshot =
      runtime.getElevator(elevator.id).getSnapshot();
    readyActorIds.forEach((actorId) =>
      survival!.enqueueElevatorBoard(
        actorId,
        route,
        11
      )
    );
    const boardingFrame = updateCoordinator(0);
    const acceptedIds = elevatorActorIds.filter(
      (actorId) =>
        survival!.getNpcTraversalState(actorId).kind ===
        "riding-elevator"
    );
    const rejectedIds = elevatorActorIds.filter(
      (actorId) =>
        survival!.countAppliedResult(
          "elevator-boarding-rejected",
          actorId
        ) === 1
    );
    const acceptedSafeSlots = acceptedIds.every(
      (actorId) => {
        const target = createTraversalTargetSnapshot(
          survival!.getActor(actorId)
        );
        return (
          context!.queries.containsVolumeById(
            elevator.car.occupancy.id,
            target.footPosition
          ) &&
          context!.queries.intersectsVolumeById(
            elevator.car.occupancy.id,
            target.hitShape
          ) &&
          !context!.queries.intersectsVolumeById(
            fromStop.callMat.id,
            target.hitShape
          ) &&
          !context!.queries.intersectsVolumeById(
            fromStop.threshold.id,
            target.hitShape
          ) &&
          !context!.queries.intersectsVolumeById(
            fromStop.landingDoor.sweepId,
            target.hitShape
          ) &&
          !context!.queries.intersectsVolumeById(
            elevator.car.door.sweepId,
            target.hitShape
          )
        );
      }
    );
    const uniqueAcceptedSlots = new Set(
      acceptedIds.map((actorId) => {
        const position = survival!.getNpcPosition(actorId);
        return `${position.x.toFixed(6)}|${position.y.toFixed(6)}|${position.z.toFixed(6)}`;
      })
    ).size;
    const traversalNotifications = [
      ...firstCallAcceptedFrame.notifications,
      ...firstReadyFrame.notifications,
      ...firstBoardingFrame.notifications,
      ...lateCallAcceptedFrame.notifications,
      ...readyFrame.notifications,
      ...boardingFrame.notifications
    ];
    const rejectedStayedOnCallMatBeforeDeparture =
      rejectedIds.every((actorId) =>
        context!.queries.containsVolumeById(
          fromStop.callMat.id,
          survival!.getNpcPosition(actorId)
        )
      );
    pushCheck(
      checks,
      "ready時予約保持・実request/result経由の定員6・7人目拒否",
      allElevatorActorsOnCallMat &&
        firstPassengerSnapshot.passengers.length === 1 &&
        lateJoinCallMatState === "departure-countdown" &&
        callAcceptedActorIds.join("|") ===
          elevatorActorIds.join("|") &&
        elevatorActorIds.every(
          (actorId) =>
            survival!.countAppliedResult(
              "elevator-call-accepted",
              actorId
            ) === 1
        ) &&
        allReady &&
        reservationSnapshot.reservations.length ===
          ELEVATOR_CAPACITY - 1 &&
        reservationSnapshot.passengers.length === 1 &&
        heldReservationSnapshot.reservations.length ===
          ELEVATOR_CAPACITY - 1 &&
        heldReservationSnapshot.carDoorState === "open" &&
        acceptedIds.join("|") ===
          elevatorActorIds.slice(0, 6).join("|") &&
        rejectedIds.join("|") ===
          elevatorActorIds.slice(6).join("|") &&
        runtime
          .getElevator(elevator.id)
          .getSnapshot().passengers.length ===
          ELEVATOR_CAPACITY &&
        acceptedSafeSlots &&
        uniqueAcceptedSlots === ELEVATOR_CAPACITY,
      `callMat=${allElevatorActorsOnCallMat} / accepted=` +
        `lateJoin=${firstPassengerSnapshot.passengers.length}@${lateJoinCallMatState}` +
        `->${callAcceptedActorIds.length} / ` +
        `ready=${allReady} / ` +
        `reserved=${reservationSnapshot.reservations.length}->` +
        `${heldReservationSnapshot.reservations.length}@` +
        `${heldReservationSnapshot.carDoorState} / ` +
        `accepted=${acceptedIds.join(",")} / rejected=${rejectedIds.join(",")} / ` +
        `safeSlots=${acceptedSafeSlots}/${uniqueAcceptedSlots}`
    );
    pushCheck(
      checks,
      "定員拒否時もFollowを維持して次便または別経路へ再計画する",
      traversalNotifications.length === 0 &&
        survival.getActor("elevator-07").commandMode ===
          "follow" &&
        survival.getActor("elevator-08").commandMode ===
          "leave" &&
        rejectedIds.every((actorId) => {
          const actor = survival!.getActor(actorId);
          return (
            actor.traversalState.kind === "walking" &&
            actor.reservationResultRevision === 1
          );
        }),
      `notifications=${traversalNotifications.length} / follow=` +
        `${survival.getActor("elevator-07").commandMode} / ` +
        `leave=${survival.getActor("elevator-08").commandMode} / ` +
        `replan=${rejectedIds
          .map((actorId) => {
            const actor = survival!.getActor(actorId);
            return `${actorId}:${actor.traversalState.kind}@${actor.reservationResultRevision}`;
          })
          .join(",")}`
    );
    rejectedIds.forEach((actorId, index) =>
      survival!.setActorPosition(
        actorId,
        new Vector3(1_800 + index, 1_000, 1_000)
      )
    );

    const beforeElevatorMotionRevision = runtime.revision;
    const elevatorMotionRevisions = [
      updateCoordinator(
        ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS
      ).runtimeSnapshot.revision,
      updateCoordinator(
        ELEVATOR_DOOR_MOTION_SECONDS * 0.5
      ).runtimeSnapshot.revision,
      updateCoordinator(
        ELEVATOR_DOOR_MOTION_SECONDS * 0.5
      ).runtimeSnapshot.revision,
      updateCoordinator(
        ELEVATOR_TRAVEL_SECONDS * 0.5
      ).runtimeSnapshot.revision
    ];
    const midTravel =
      runtime.getElevator(elevator.id).getSnapshot();
    const rejectedClearedCallMatBeforeTravel =
      rejectedIds.every((actorId) =>
        !context!.queries.containsVolumeById(
          fromStop.callMat.id,
          survival!.getNpcPosition(actorId)
        )
      );
    const futureReturnEstimate = runtime
      .getElevator(elevator.id)
      .estimateTripSeconds(
        destinationStop.id,
        fromStop.id
      );
    elevatorMotionRevisions.push(
      updateCoordinator(
        ELEVATOR_TRAVEL_SECONDS * 0.5
      ).runtimeSnapshot.revision,
      updateCoordinator(
        ELEVATOR_DOOR_MOTION_SECONDS * 0.5
      ).runtimeSnapshot.revision
    );
    const arrivalFrame = updateCoordinator(
      ELEVATOR_DOOR_MOTION_SECONDS * 0.5
    );
    elevatorMotionRevisions.push(
      arrivalFrame.runtimeSnapshot.revision
    );
    const everyElevatorTransformPublished =
      elevatorMotionRevisions.every(
        (revision, index) =>
          revision ===
          beforeElevatorMotionRevision + index + 1
      );
    pushCheck(
      checks,
      "エレベーターTransform更新ごとにrevisionを1回公開",
      everyElevatorTransformPublished &&
        maximumPublishCountPerUpdate === 1,
      `revisions=${beforeElevatorMotionRevision}→` +
        `${elevatorMotionRevisions.join("→")} / maxPublish=` +
        `${maximumPublishCountPerUpdate}`
    );
    pushCheck(
      checks,
      "満員かご走行中の将来復路は定員6",
        midTravel.carState === "moving" &&
        midTravel.carTravelProgress === 0.5 &&
        rejectedStayedOnCallMatBeforeDeparture &&
        rejectedClearedCallMatBeforeTravel &&
        futureReturnEstimate.capacityAvailable &&
        futureReturnEstimate.availableCapacity ===
          ELEVATOR_CAPACITY,
      `state=${midTravel.carState}@${midTravel.carTravelProgress.toFixed(2)} / ` +
        `rejectedOnCallMat=${rejectedStayedOnCallMatBeforeDeparture}/` +
        `${!rejectedClearedCallMatBeforeTravel} / ` +
        `returnCapacity=${futureReturnEstimate.availableCapacity}`
    );

    const waitingDisembark = acceptedIds.every(
      (actorId) =>
        survival!.getNpcTraversalState(actorId).kind ===
          "leaving-elevator"
    );
    const unloadingSnapshot = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const unloadingCallResult = runtime
      .getElevator(elevator.id)
      .requestCall(fromStop.id);
    const unloadingBoardingResult = runtime
      .getElevator(elevator.id)
      .requestBoarding({
        actorId: rejectedIds[0]!,
        fromStopId: destinationStop.id,
        destinationStopId: fromStop.id,
        requestedAtSeconds:
          unloadingSnapshot.elapsedSeconds
      });
    const unloadingEstimate = runtime
      .getElevator(elevator.id)
      .estimateTripSeconds(
        destinationStop.id,
        fromStop.id
      );
    updateCoordinator(
      ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS +
        ELEVATOR_TRAVEL_SECONDS
    );
    const heldUnloadingSnapshot = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    acceptedIds.forEach((actorId) =>
      survival!.setActorPosition(
        actorId,
        route.exitLocation.position
      )
    );
    updateCoordinator(0);
    const transitionCountsAfterDisembark =
      acceptedIds.map(
        (actorId) =>
          survival!.getActor(actorId)
            .completeTransitionCount
      );
    updateCoordinator(0);
    const transitionCountsAfterExtraUpdate =
      acceptedIds.map(
        (actorId) =>
          survival!.getActor(actorId)
            .completeTransitionCount
      );
    const acceptedContractsPreserved = acceptedIds.every(
      (actorId) => {
        const actor = survival!.getActor(actorId);
        const before = elevatorContracts.get(actorId)!;
        return (
          actor === before.reference &&
          actor.state === before.state &&
          actor.commandMode === before.commandMode &&
          actor.targetId === before.targetId &&
          actor.targetProvenance ===
            before.targetProvenance &&
          actor.targetSelectionPersonality ===
            before.targetSelectionPersonality
        );
      }
    );
    const disembarkPositionsMatch = acceptedIds.every(
      (actorId) =>
        Vector3.Distance(
          survival!.getNpcPosition(actorId),
          route.exitLocation.position
        ) <= POSITION_EPSILON
    );
    pushCheck(
      checks,
      "搬送中のNPC本体・戦闘個性・Follow／Leave状態を保持",
      acceptedContractsPreserved &&
        waitingDisembark &&
        unloadingSnapshot.passengers.length ===
          acceptedIds.length &&
        unloadingSnapshot.passengers.every(
          (passenger) => passenger.state === "arrived"
        ) &&
        unloadingCallResult.status === "not-callable" &&
        unloadingBoardingResult.status === "not-boardable" &&
        !unloadingEstimate.capacityAvailable &&
        unloadingEstimate.availableCapacity === 0 &&
        unloadingEstimate.totalSeconds ===
          Number.POSITIVE_INFINITY &&
        heldUnloadingSnapshot.currentStopId ===
          destinationStop.id &&
        heldUnloadingSnapshot.carDoorState === "open" &&
        heldUnloadingSnapshot.passengers.length ===
          acceptedIds.length &&
        acceptedIds.every(
          (actorId) =>
            survival!.countAppliedResult(
              "elevator-arrived",
              actorId
            ) === 1
        ),
      `identity=${acceptedContractsPreserved} / ` +
        `leaving=${waitingDisembark} / arrived=` +
        `${acceptedIds.length} / held=` +
        `${heldUnloadingSnapshot.currentStopId}/` +
        `${heldUnloadingSnapshot.passengers.length}`
    );
    pushCheck(
      checks,
      "降車は常に許可しcompleteTransitionを1回だけ完了",
      transitionCountsAfterDisembark.every(
        (count) => count === 1
      ) &&
        transitionCountsAfterExtraUpdate.every(
          (count) => count === 1
        ) &&
        disembarkPositionsMatch &&
        runtime
          .getElevator(elevator.id)
          .getSnapshot().passengers.length === 0,
      `counts=${transitionCountsAfterExtraUpdate.join(",")} / ` +
        `positions=${disembarkPositionsMatch} / passengers=` +
        `${runtime
          .getElevator(elevator.id)
          .getSnapshot().passengers.length}`
    );

    const reverseRoute: V2NpcElevatorTraversalRoute =
      Object.freeze({
        linkId: route.linkId,
        from: route.to,
        to: route.from,
        entryLocation: route.exitLocation,
        exitLocation: route.entryLocation
      });
    const safetyCallMatCenter = requireWorldCenter(
      destinationStop.callMat.mesh
    );
    const addSafetyActor = (
      id: string,
      state: V2CharacterState,
      offsetX: number
    ) =>
      survival!.addActor({
        id,
        state,
        position: safetyCallMatCenter.add(
          new Vector3(offsetX, 0, 0)
        )
      });

    const batchHuman = addSafetyActor(
      "safety-batch-01-human",
      "normal",
      -0.01
    );
    const batchBrainwashed = addSafetyActor(
      "safety-batch-02-brainwashed",
      "brainwash-complete-gun",
      0.01
    );
    const batchHumanPosition =
      batchHuman.position.clone();
    survival.enqueueElevatorCall(
      batchHuman.id,
      reverseRoute,
      30
    );
    survival.enqueueElevatorCall(
      batchBrainwashed.id,
      reverseRoute,
      30
    );
    updateCoordinator(0);
    survival.completeAllElevatorCallApproaches();
    updateCoordinator(0);
    const batchSnapshot = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const batchSafetyOk =
      survival.getNpcTraversalState(batchHuman.id).kind ===
        "walking" &&
      survival.getNpcTraversalState(batchBrainwashed.id)
        .kind === "approaching-elevator-board" &&
      survival.countAppliedResult(
        "elevator-boarding-rejected",
        batchHuman.id
      ) === 1 &&
      Vector3.Distance(
        survival.getNpcPosition(batchHuman.id),
        batchHumanPosition
      ) <= POSITION_EPSILON &&
      batchSnapshot.reservations
        .map((reservation) => reservation.actorId)
        .join("|") === batchBrainwashed.id;
    survival.enqueueElevatorReservationCancel(
      batchBrainwashed.id,
      reverseRoute
    );
    updateCoordinator(0);

    const approachHuman = addSafetyActor(
      "safety-approach-human",
      "normal",
      -0.01
    );
    const approachBrainwashed = addSafetyActor(
      "safety-approach-brainwashed",
      "brainwash-complete-no-gun",
      0.01
    );
    survival.enqueueElevatorCall(
      approachHuman.id,
      reverseRoute,
      31
    );
    updateCoordinator(0);
    survival.completeAllElevatorCallApproaches();
    updateCoordinator(0);
    const approachHumanPosition =
      survival.getNpcPosition(approachHuman.id);
    survival.enqueueElevatorCall(
      approachBrainwashed.id,
      reverseRoute,
      32
    );
    updateCoordinator(0);
    survival.completeAllElevatorCallApproaches();
    updateCoordinator(0);
    const approachSnapshot = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const approachSafetyOk =
      survival.getNpcTraversalState(approachHuman.id).kind ===
        "walking" &&
      survival.getNpcTraversalState(approachBrainwashed.id)
        .kind === "approaching-elevator-board" &&
      survival.countAppliedResult(
        "elevator-boarding-rejected",
        approachHuman.id
      ) === 1 &&
      Vector3.Distance(
        survival.getNpcPosition(approachHuman.id),
        approachHumanPosition
      ) <= POSITION_EPSILON &&
      approachSnapshot.reservations
        .map((reservation) => reservation.actorId)
        .join("|") === approachBrainwashed.id;
    survival.enqueueElevatorReservationCancel(
      approachBrainwashed.id,
      reverseRoute
    );
    updateCoordinator(0);

    const passengerHuman = addSafetyActor(
      "safety-passenger-human",
      "normal",
      -0.01
    );
    const passengerBrainwashed = addSafetyActor(
      "safety-passenger-brainwashed",
      "brainwash-complete-gun",
      0.01
    );
    survival.enqueueElevatorCall(
      passengerHuman.id,
      reverseRoute,
      33
    );
    survival.enqueueElevatorCall(
      passengerBrainwashed.id,
      reverseRoute,
      35
    );
    updateCoordinator(0);
    survival.completeElevatorCallApproach(
      passengerHuman.id
    );
    updateCoordinator(0);
    survival.enqueueElevatorBoard(
      passengerHuman.id,
      reverseRoute,
      34
    );
    updateCoordinator(0);
    const passengerTransitionCount =
      passengerHuman.completeTransitionCount;
    survival.completeElevatorCallApproach(
      passengerBrainwashed.id
    );
    updateCoordinator(0);
    const passengerSafetySnapshot = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const passengerSafetyOk =
      survival.getNpcTraversalState(passengerHuman.id).kind ===
        "walking" &&
      survival.getNpcTraversalState(passengerBrainwashed.id)
        .kind === "approaching-elevator-board" &&
      survival.countAppliedResult(
        "elevator-safety-evicted",
        passengerHuman.id
      ) === 1 &&
      Vector3.Distance(
        survival.getNpcPosition(passengerHuman.id),
        reverseRoute.entryLocation.position
      ) <= POSITION_EPSILON &&
      passengerHuman.completeTransitionCount ===
        passengerTransitionCount &&
      passengerSafetySnapshot.passengers.length === 0 &&
      passengerSafetySnapshot.reservations
        .map((reservation) => reservation.actorId)
        .join("|") === passengerBrainwashed.id;
    survival.enqueueElevatorReservationCancel(
      passengerBrainwashed.id,
      reverseRoute
    );
    updateCoordinator(0);
    pushCheck(
      checks,
      "未洗脳予約は位置不変で中止・洗脳済み追跡者は同便優先",
      batchSafetyOk &&
        approachSafetyOk &&
        passengerSafetyOk &&
        runtime
          .getElevator(elevator.id)
          .getSnapshot().reservations.length === 0,
      `batch=${batchSafetyOk} / approach=${approachSafetyOk} / ` +
        `passenger=${passengerSafetyOk}`
    );

    const phasePassengerId = acceptedIds[0];
    const phaseReservationId = acceptedIds[1];
    const phaseWaitingId = acceptedIds[2];
    const phasePendingId = acceptedIds[3];
    if (
      !phasePassengerId ||
      !phaseReservationId ||
      !phaseWaitingId ||
      !phasePendingId
    ) {
      throw new Error(
        "phase解放fixtureに必要なNPCが不足しています。"
      );
    }
    survival.enqueueElevatorCall(
      phasePassengerId,
      reverseRoute,
      20
    );
    survival.setActorPosition(
      phasePassengerId,
      safetyCallMatCenter
    );
    updateCoordinator(0);
    survival.completeAllElevatorCallApproaches();
    updateCoordinator(0);
    survival.enqueueElevatorBoard(
      phasePassengerId,
      reverseRoute,
      21
    );
    updateCoordinator(0);
    const phaseReservation = runtime
      .getElevator(elevator.id)
      .requestBoarding({
        actorId: phaseReservationId,
        fromStopId: destinationStop.id,
        destinationStopId: fromStop.id,
        requestedAtSeconds: 21
      });
    runtime
      .getElevator(elevator.id)
      .requestCall(fromStop.id);
    survival.setActorPosition(
      phaseWaitingId,
      callMatCenter
    );
    survival.enqueueElevatorCall(
      phaseWaitingId,
      route,
      22
    );
    updateCoordinator(0);
    survival.enqueueElevatorCall(
      phasePendingId,
      route,
      23
    );
    const phaseStateBeforeRelease = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const appliedResultCountBeforeRelease =
      survival.getAppliedResultCount();
    const transitionCountsBeforeRelease =
      acceptedIds.map(
        (actorId) =>
          survival!.getActor(actorId)
            .completeTransitionCount
      );

    coordinator.releaseForScriptedPhase();
    const phaseStateAfterRelease = runtime
      .getElevator(elevator.id)
      .getSnapshot();
    const scriptedPlacement = new Vector3(
      1_700,
      1_000,
      1_000
    );
    survival.setActorPosition(
      phasePassengerId,
      scriptedPlacement
    );
    updateCoordinator(ELEVATOR_TRAVEL_SECONDS);
    const transitionCountsAfterRelease =
      acceptedIds.map(
        (actorId) =>
          survival!.getActor(actorId)
            .completeTransitionCount
      );
    const traversalStatesAfterRelease = [
      phasePassengerId,
      phaseReservationId,
      phaseWaitingId,
      phasePendingId
    ].map(
      (actorId) =>
        survival!.getNpcTraversalState(actorId).kind
    );
    pushCheck(
      checks,
      "phase配置前に予約・乗客・呼出・pending traversalを原子解放",
      phaseReservation.status === "accepted" &&
        phaseStateBeforeRelease.passengers.length === 1 &&
        phaseStateBeforeRelease.reservations.length === 1 &&
        phaseStateBeforeRelease.calls.length === 0 &&
        phaseStateAfterRelease.passengers.length === 0 &&
        phaseStateAfterRelease.reservations.length === 0 &&
        phaseStateAfterRelease.calls.length === 0 &&
        phaseStateAfterRelease.dwellRemainingSeconds === null &&
        traversalStatesAfterRelease.every(
          (state) => state === "walking"
        ) &&
        survival.getScriptedPhaseTraversalReleaseCount() === 1 &&
        survival.getAppliedResultCount() ===
          appliedResultCountBeforeRelease &&
        transitionCountsAfterRelease.every(
          (count, index) =>
            count === transitionCountsBeforeRelease[index]
        ) &&
        Vector3.Distance(
          survival.getNpcPosition(phasePassengerId),
          scriptedPlacement
        ) <= POSITION_EPSILON,
      `before=${phaseStateBeforeRelease.calls.length}/` +
        `${phaseStateBeforeRelease.reservations.length}/` +
        `${phaseStateBeforeRelease.passengers.length} / after=` +
        `${phaseStateAfterRelease.calls.length}/` +
        `${phaseStateAfterRelease.reservations.length}/` +
        `${phaseStateAfterRelease.passengers.length} / states=` +
        `${traversalStatesAfterRelease.join(",")} / transitions=` +
        `${transitionCountsBeforeRelease.join(",")}→` +
        `${transitionCountsAfterRelease.join(",")}`
    );

    const callCancelActor = survival.addActor({
      id: "waiting-call-cancel",
      state: "normal",
      position: requireWorldCenter(fromStop.callMat.mesh)
    });
    survival.enqueueElevatorCall(
      callCancelActor.id,
      route,
      40
    );
    updateCoordinator(0);
    survival.completeAllElevatorCallApproaches();
    const waitingBeforeCancel =
      survival.getNpcTraversalState(
        callCancelActor.id
      ).kind;
    survival.enqueueElevatorCallCancel(
      callCancelActor.id,
      route
    );
    updateCoordinator(0);
    updateCoordinator(
      ELEVATOR_DOOR_MOTION_SECONDS * 2 +
        ELEVATOR_TRAVEL_SECONDS
    );
    updateCoordinator(0);
    pushCheck(
      checks,
      "呼出待機中の経路変更は待機登録だけを取消",
      waitingBeforeCancel === "waiting-elevator-call" &&
        survival.getNpcTraversalState(callCancelActor.id)
          .kind === "walking" &&
        survival.countAppliedResult(
          "elevator-ready-for-boarding",
          callCancelActor.id
        ) === 0,
      `before=${waitingBeforeCancel} / after=` +
        `${survival.getNpcTraversalState(callCancelActor.id).kind} / ` +
        `ready=${survival.countAppliedResult(
          "elevator-ready-for-boarding",
          callCancelActor.id
        )}`
    );

    const elevatorRuntime = runtime.getElevator(elevator.id);
    const remoteCall = elevatorRuntime.requestCall(
      destinationStop.id
    );
    updateCoordinator(0);
    const lockedStopSnapshot = elevatorRuntime
      .getSnapshot()
      .stops.find((stop) => stop.id === fromStop.id);
    if (!lockedStopSnapshot) {
      throw new Error(
        `locked呼出fixtureの停止階snapshotがありません: ${fromStop.id}`
      );
    }
    const lockedActor = survival.addActor({
      id: "locked-call-mat-actor",
      state: "brainwash-complete-no-gun",
      position: callMatCenter
    });
    survival.enqueueElevatorCall(
      lockedActor.id,
      route,
      50
    );
    updateCoordinator(0);
    const lockedInputState =
      survival.getNpcTraversalState(lockedActor.id).kind;
    const lockedAcceptedBeforeReady =
      survival.countAppliedResult(
        "elevator-call-accepted",
        lockedActor.id
      );
    updateCoordinator(
      ELEVATOR_DOOR_MOTION_SECONDS +
        ELEVATOR_TRAVEL_SECONDS +
        ELEVATOR_DOOR_MOTION_SECONDS
    );
    const acceptedOnFirstReady =
      survival.countAppliedResult(
        "elevator-call-accepted",
        lockedActor.id
      );
    updateCoordinator(0);
    const acceptedAfterExtraUpdate =
      survival.countAppliedResult(
        "elevator-call-accepted",
        lockedActor.id
      );
    const stayedOnCallMat =
      context.queries.containsVolumeById(
        fromStop.callMat.id,
        survival.getNpcPosition(lockedActor.id)
      );
    pushCheck(
      checks,
      "locked呼出マット滞在者はready初回更新で1回だけ入力",
      remoteCall.status === "accepted" &&
        lockedStopSnapshot.callMatState === "locked" &&
        lockedInputState ===
          "waiting-elevator-call-input" &&
        lockedAcceptedBeforeReady === 0 &&
        acceptedOnFirstReady === 1 &&
        acceptedAfterExtraUpdate === 1 &&
        stayedOnCallMat,
      `locked=${lockedStopSnapshot.callMatState} / state=` +
        `${lockedInputState} / accepted=` +
        `${lockedAcceptedBeforeReady}→${acceptedOnFirstReady}→` +
        `${acceptedAfterExtraUpdate} / stayed=${stayedOnCallMat}`
    );
  } finally {
    coordinator?.dispose();
    runtime?.dispose();
    survival?.dispose();
    player?.dispose();
    context?.dispose();
  }
  return countSceneResources(scene);
};

const runPlayerElevatorTraversalAcceptance = async (
  scene: Scene,
  selections: ReturnType<
    typeof createSchoolRoomVariantSelections
  >,
  checks: SchoolIntegrationCheck[]
) => {
  let context: Nullable<StageSpatialContext> = null;
  let runtime: Nullable<SchoolStageDynamicRuntime> = null;
  let player: Nullable<TraversalFixturePlayer> = null;
  let survival: Nullable<StrictTraversalSurvivalHarness> = null;
  let coordinator: Nullable<
    ReturnType<typeof createSchoolStageTraversalCoordinator>
  > = null;
  try {
    context = await loadStageSpatialContext(
      scene,
      SCHOOL_VALIDATION_STAGE,
      {
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(
            SCHOOL_INTEGRATION_SEED
          ),
        roomVariantSelections: selections
      }
    );
    const elevator = context.elevatorAssets.all[0];
    if (!elevator) {
      throw new Error(
        "実プレイヤー搬送fixtureのエレベーターがありません。"
      );
    }
    const destinationStop = elevator.initialStop;
    const fromStop = elevator.stops.find(
      (stop) => stop.id !== destinationStop.id
    );
    if (!fromStop) {
      throw new Error(
        `実プレイヤー搬送fixtureの反対停止階がありません: ${elevator.id}`
      );
    }
    if (
      fromStop.floorIndex !== 1 ||
      destinationStop.floorIndex !== 4
    ) {
      throw new Error(
        `実プレイヤー搬送fixtureの停止階が1階→4階ではありません: ${fromStop.floorIndex}→${destinationStop.floorIndex}`
      );
    }

    const callMatCenter = requireWorldCenter(
      fromStop.callMat.mesh
    );
    player = createTraversalFixturePlayer(callMatCenter);
    const playerReference = player;
    const verticalStateBeforeRide = player.getVerticalState();
    const eyeOffsetBeforeRide = player
      .getEyePosition()
      .subtract(player.getFootPosition());
    survival = new StrictTraversalSurvivalHarness(
      () => player!.createTargetSnapshot()
    );
    runtime = createSchoolStageDynamicRuntime({
      staticActiveSet: context.staticSpatialActiveSet,
      doorAssets: context.doorAssets,
      elevatorAssets: context.elevatorAssets,
      dynamicVariants: context.dynamicVariants,
      queries: context.queries,
      actors: createSchoolStageActorPort(player, survival, context)
    });
    coordinator = createSchoolStageTraversalCoordinator({
      stage: context,
      runtime,
      survival,
      player,
      doorCloseRandom: () => 0.5
    });
    const updateCoordinator = (deltaSeconds: number) =>
      coordinator!.update(deltaSeconds);
    const elevatorRuntime = runtime.getElevator(elevator.id);

    updateCoordinator(0);
    const firstCallSnapshot = elevatorRuntime.getSnapshot();
    const playerCallingTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    const repeatedPlayerCallingTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    updateCoordinator(0);
    const heldCallSnapshot = elevatorRuntime.getSnapshot();
    const heldPlayerCallingTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    updateCoordinator(ELEVATOR_DOOR_MOTION_SECONDS);
    const departedSnapshot = elevatorRuntime.getSnapshot();
    updateCoordinator(ELEVATOR_TRAVEL_SECONDS);
    const openingSnapshot = elevatorRuntime.getSnapshot();
    const readyFrame = updateCoordinator(
      ELEVATOR_DOOR_MOTION_SECONDS
    );
    const readySnapshot = elevatorRuntime.getSnapshot();
    const playerReservedTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    const repeatedPlayerReservedTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    const readyFrameElevator =
      readyFrame.runtimeSnapshot.elevators.find(
        (snapshot) => snapshot.id === elevator.id
      );
    if (!readyFrameElevator) {
      throw new Error(
        `実プレイヤー搬送fixtureの返却snapshotにエレベーターがありません: ${elevator.id}`
      );
    }
    const playerReservationReady =
      readySnapshot.reservations.some(
        (reservation) => reservation.actorId === "player"
      );
    const returnedPlayerReservationReady =
      readyFrameElevator.reservations.some(
        (reservation) => reservation.actorId === "player"
      );
    pushCheck(
      checks,
      "実プレイヤーが1階呼出マット滞在中は呼出を維持",
      firstCallSnapshot.calls.includes(fromStop.id) &&
        heldCallSnapshot.calls.includes(fromStop.id) &&
        firstCallSnapshot.carDoorState === "closing" &&
        departedSnapshot.carState === "moving" &&
        openingSnapshot.carDoorState === "opening" &&
        readySnapshot.currentStopId === fromStop.id &&
        readySnapshot.carDoorState === "open" &&
        playerReservationReady &&
        returnedPlayerReservationReady,
      `calls=${firstCallSnapshot.calls.includes(fromStop.id)}/` +
        `${heldCallSnapshot.calls.includes(fromStop.id)} / ` +
        `motion=${firstCallSnapshot.carDoorState}→` +
        `${departedSnapshot.carState}→` +
        `${openingSnapshot.carDoorState}→` +
        `${readySnapshot.carDoorState} / reserved=` +
        `${playerReservationReady}/${returnedPlayerReservationReady}`
    );
    pushCheck(
      checks,
      "プレイヤーエレベーターsnapshotを状態遷移まで再利用",
      playerCallingTraversal !== null &&
        playerCallingTraversal === repeatedPlayerCallingTraversal &&
        playerCallingTraversal === heldPlayerCallingTraversal &&
        playerReservedTraversal !== null &&
        playerReservedTraversal === repeatedPlayerReservedTraversal &&
        playerReservedTraversal !== playerCallingTraversal,
      `calling=${playerCallingTraversal === repeatedPlayerCallingTraversal}/` +
        `${playerCallingTraversal === heldPlayerCallingTraversal} / ` +
        `reserved=${playerReservedTraversal === repeatedPlayerReservedTraversal} / ` +
        `transition=${playerReservedTraversal !== playerCallingTraversal}`
    );
    pushCheck(
      checks,
      "プレイヤーエレベーターsnapshotの目的階位置を不変に維持",
      playerCallingTraversal !== null &&
        Object.isFrozen(
          playerCallingTraversal.destinationFloorPosition
        ),
      `snapshot=${playerCallingTraversal !== null} / ` +
        `positionFrozen=${
          playerCallingTraversal !== null &&
          Object.isFrozen(
            playerCallingTraversal.destinationFloorPosition
          )
        }`
    );

    const outsidePosition = new Vector3(1_500, 1_000, 1_000);
    player.setTransportFootPosition(outsidePosition);
    updateCoordinator(0);
    const cancelledSnapshot = elevatorRuntime.getSnapshot();
    const playerCancelledTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    player.setTransportFootPosition(callMatCenter);
    updateCoordinator(0);
    const renewedSnapshot = elevatorRuntime.getSnapshot();
    const thresholdCenter = requireWorldCenter(
      fromStop.threshold.mesh
    );
    player.setTransportFootPosition(thresholdCenter);
    updateCoordinator(0);
    const thresholdSnapshot = elevatorRuntime.getSnapshot();
    const carCenter = requireWorldCenter(
      elevator.car.occupancy.mesh
    );
    player.setTransportFootPosition(carCenter);
    updateCoordinator(0);
    const firstBoardedSnapshot =
      elevatorRuntime.getSnapshot();
    const originExitPosition = fromStop.wait.node
      .getAbsolutePosition()
      .clone();
    player.setTransportFootPosition(originExitPosition);
    const originExitFullyOutside =
      !context.queries.intersectsVolumeById(
        elevator.car.occupancy.id,
        player.createTargetSnapshot().hitShape
      );
    updateCoordinator(0);
    const preDepartureExitSnapshot =
      elevatorRuntime.getSnapshot();
    const playerPreDepartureCancelledTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    updateCoordinator(0);
    const heldPreDepartureExitSnapshot =
      elevatorRuntime.getSnapshot();
    const playerTraversalAfterPreDepartureCancellation =
      coordinator.getPlayerElevatorTraversalSnapshot();
    player.setTransportFootPosition(carCenter);
    updateCoordinator(0);
    const boardedSnapshot = elevatorRuntime.getSnapshot();
    const playerRidingTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    const boardedPlayerPosition = player.getFootPosition();
    const boardedPlayer =
      boardedSnapshot.passengers.some(
        (passenger) => passenger.actorId === "player"
      );
    pushCheck(
      checks,
      "実プレイヤー予約は待機領域離脱で取消し再進入で復帰",
      cancelledSnapshot.reservations.every(
        (reservation) => reservation.actorId !== "player"
      ) &&
        playerCancelledTraversal?.phase === "cancelled" &&
        renewedSnapshot.reservations.some(
          (reservation) => reservation.actorId === "player"
        ) &&
        thresholdSnapshot.reservations.some(
          (reservation) => reservation.actorId === "player"
        ) &&
        firstBoardedSnapshot.passengers.some(
          (passenger) => passenger.actorId === "player"
        ) &&
        originExitFullyOutside &&
        preDepartureExitSnapshot.passengers.every(
          (passenger) => passenger.actorId !== "player"
        ) &&
        playerPreDepartureCancelledTraversal?.phase ===
          "cancelled" &&
        heldPreDepartureExitSnapshot.passengers.every(
          (passenger) => passenger.actorId !== "player"
        ) &&
        playerTraversalAfterPreDepartureCancellation === null &&
        boardedPlayer &&
        context.queries.containsVolumeById(
          elevator.car.occupancy.id,
          boardedPlayerPosition
        ),
      `cancelled=${cancelledSnapshot.reservations.length} / ` +
        `terminal=${playerCancelledTraversal?.phase ?? "none"} / ` +
        `renewed=${renewedSnapshot.reservations.length} / ` +
        `threshold=${thresholdSnapshot.reservations.length} / ` +
        `preExit=${firstBoardedSnapshot.passengers.length}→` +
        `${preDepartureExitSnapshot.passengers.length}→` +
        `${heldPreDepartureExitSnapshot.passengers.length} / ` +
        `reboarded=${boardedPlayer}`
    );

    const rideStartedAtSeconds = boardedSnapshot.elapsedSeconds;
    updateCoordinator(ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS);
    const closingSnapshot = elevatorRuntime.getSnapshot();
    updateCoordinator(ELEVATOR_DOOR_MOTION_SECONDS);
    const movingSnapshot = elevatorRuntime.getSnapshot();
    updateCoordinator(ELEVATOR_TRAVEL_SECONDS);
    const destinationOpeningSnapshot =
      elevatorRuntime.getSnapshot();
    updateCoordinator(ELEVATOR_DOOR_MOTION_SECONDS);
    const destinationOpenSnapshot =
      elevatorRuntime.getSnapshot();
    const rideElapsedSeconds =
      destinationOpenSnapshot.elapsedSeconds -
      rideStartedAtSeconds;
    const playerPositionAtArrival = player.getFootPosition();
    const verticalStateAtArrival = player.getVerticalState();
    const eyeOffsetAtArrival = player
      .getEyePosition()
      .subtract(playerPositionAtArrival);
    const exitPosition = destinationStop.wait.node
      .getAbsolutePosition()
      .clone();
    const exitIsOutsideTraversalVolumes =
      !context.queries.containsVolumeById(
        elevator.car.occupancy.id,
        exitPosition
      ) &&
      !context.queries.containsVolumeById(
        destinationStop.callMat.id,
        exitPosition
      ) &&
      !context.queries.containsVolumeById(
        destinationStop.threshold.id,
        exitPosition
      );
    player.setTransportFootPosition(exitPosition);
    updateCoordinator(0);
    const disembarkedSnapshot = elevatorRuntime.getSnapshot();
    const playerCompletedTraversal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    updateCoordinator(0);
    const playerTraversalAfterCompletedTerminal =
      coordinator.getPlayerElevatorTraversalSnapshot();
    const playerIdentityAndMotionPreserved =
      player === playerReference &&
      verticalStateAtArrival.grounded ===
        verticalStateBeforeRide.grounded &&
      verticalStateAtArrival.verticalVelocity ===
        verticalStateBeforeRide.verticalVelocity &&
      Vector3.Distance(
        eyeOffsetAtArrival,
        eyeOffsetBeforeRide
      ) <= POSITION_EPSILON;
    pushCheck(
      checks,
      "実プレイヤーを4+1+6+1秒で搬送し退出時に降車完了",
      closingSnapshot.carDoorState === "closing" &&
        movingSnapshot.carState === "moving" &&
        destinationOpeningSnapshot.carDoorState ===
          "opening" &&
        destinationOpenSnapshot.currentStopId ===
          destinationStop.id &&
        destinationOpenSnapshot.carDoorState === "open" &&
        Math.abs(
          rideElapsedSeconds -
            (ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS +
              ELEVATOR_DOOR_MOTION_SECONDS +
              ELEVATOR_TRAVEL_SECONDS +
              ELEVATOR_DOOR_MOTION_SECONDS)
        ) <= POSITION_EPSILON &&
        context.queries.containsVolumeById(
          elevator.car.occupancy.id,
          playerPositionAtArrival
        ) &&
        exitIsOutsideTraversalVolumes &&
        disembarkedSnapshot.passengers.every(
          (passenger) => passenger.actorId !== "player"
        ) &&
        Vector3.Distance(
          player.getFootPosition(),
          exitPosition
        ) <= POSITION_EPSILON &&
        playerIdentityAndMotionPreserved,
      `motion=${closingSnapshot.carDoorState}→` +
        `${movingSnapshot.carState}→` +
        `${destinationOpeningSnapshot.carDoorState}→` +
        `${destinationOpenSnapshot.carDoorState} / ` +
        `elapsed=${rideElapsedSeconds.toFixed(1)} / ` +
        `exit=${exitIsOutsideTraversalVolumes} / ` +
        `preserved=${playerIdentityAndMotionPreserved}`
    );
    const expectedDestinationEndpoint =
      destinationStop.endpoint === "A"
        ? elevator.link.endpointA
        : elevator.link.endpointB;
    pushCheck(
      checks,
      "プレイヤー搬送snapshotは呼出・予約・乗車・取消・完了を公開して終端後に消去",
      playerCallingTraversal?.phase === "calling" &&
        playerReservedTraversal?.phase === "reserved" &&
        playerRidingTraversal?.phase === "riding" &&
        playerCallingTraversal.elevatorId === elevator.id &&
        playerCallingTraversal.linkId === elevator.link.id &&
        playerCallingTraversal.from === fromStop.endpoint &&
        playerCallingTraversal.to === destinationStop.endpoint &&
        Vector3.Distance(
          playerCallingTraversal.destinationFloorPosition,
          expectedDestinationEndpoint.position
        ) <= POSITION_EPSILON &&
        playerCancelledTraversal?.phase === "cancelled" &&
        playerPreDepartureCancelledTraversal?.phase ===
          "cancelled" &&
        playerCompletedTraversal?.phase === "completed" &&
        playerTraversalAfterCompletedTerminal === null,
      `phase=${playerCallingTraversal?.phase ?? "none"}→` +
        `${playerReservedTraversal?.phase ?? "none"}→` +
        `${playerRidingTraversal?.phase ?? "none"}→` +
        `${playerCompletedTraversal?.phase ?? "none"}→` +
        `${playerTraversalAfterCompletedTerminal?.phase ?? "none"} / ` +
        `route=${playerCallingTraversal?.from ?? "?"}→` +
        `${playerCallingTraversal?.to ?? "?"}`
    );

    const openCarCenter = requireWorldCenter(
      elevator.car.occupancy.mesh
    );
    const mixedCallMatCenter = requireWorldCenter(
      destinationStop.callMat.mesh
    );
    const mixedRoute = requireElevatorRoute(context, elevator);
    const runMixedCapacityScenario = (
      npcIds: readonly string[],
      npcRequestedAtOffsetSeconds: number
    ) => {
      const playerRequestedAtSeconds =
        elevatorRuntime.getSnapshot().elapsedSeconds;
      npcIds.forEach((npcId) => {
        survival!.addActor({
          id: npcId,
          state: "brainwash-complete-gun",
          position: mixedCallMatCenter
        });
        survival!.enqueueElevatorCall(
          npcId,
          mixedRoute,
          playerRequestedAtSeconds +
            npcRequestedAtOffsetSeconds
        );
      });
      updateCoordinator(0);
      survival!.completeAllElevatorCallApproaches();
      player!.setTransportFootPosition(openCarCenter);
      const frame = updateCoordinator(0);
      const snapshot = elevatorRuntime.getSnapshot();
      const returnedSnapshot =
        frame.runtimeSnapshot.elevators.find(
          (candidate) => candidate.id === elevator.id
        );
      if (!returnedSnapshot) {
        throw new Error(
          `混在定員fixtureの返却snapshotにエレベーターがありません: ${elevator.id}`
        );
      }
      const acceptedActorIds = [
        ...snapshot.reservations.map(
          (reservation) => reservation.actorId
        ),
        ...snapshot.passengers.map(
          (passenger) => passenger.actorId
        )
      ].sort();
      const returnedAcceptedActorIds = [
        ...returnedSnapshot.reservations.map(
          (reservation) => reservation.actorId
        ),
        ...returnedSnapshot.passengers.map(
          (passenger) => passenger.actorId
        )
      ].sort();
      const npcIdSet = new Set(npcIds);
      const rejectedNpcIds =
        survival!.getAppliedResultNpcIds(
          "elevator-boarding-rejected"
        ).filter((npcId) => npcIdSet.has(npcId));
      const playerAccepted = snapshot.passengers.some(
        (passenger) => passenger.actorId === "player"
      );
      const acceptedNpcStatesReady = acceptedActorIds
        .filter((actorId) => actorId !== "player")
        .every(
          (actorId) =>
            survival!.getNpcTraversalState(actorId).kind ===
            "approaching-elevator-board"
        );
      const rejectedNpcStatesWalking = rejectedNpcIds.every(
        (actorId) =>
          survival!.getNpcTraversalState(actorId).kind ===
          "walking"
      );
      coordinator!.releaseForScriptedPhase();
      npcIds.forEach((npcId) =>
        survival!.setActorPosition(npcId, outsidePosition)
      );
      player!.setTransportFootPosition(exitPosition);
      return Object.freeze({
        acceptedActorIds: Object.freeze(acceptedActorIds),
        rejectedNpcIds: Object.freeze(rejectedNpcIds),
        playerAccepted,
        acceptedNpcStatesReady,
        rejectedNpcStatesWalking,
        returnedSnapshotMatches:
          returnedAcceptedActorIds.join("|") ===
          acceptedActorIds.join("|"),
        capacityUsed:
          snapshot.reservations.length +
          snapshot.passengers.length
      });
    };

    const playerEarlierNpcIds = Object.freeze([
      "q-player-earlier-01",
      "q-player-earlier-02",
      "q-player-earlier-03",
      "q-player-earlier-04",
      "q-player-earlier-05",
      "q-player-earlier-06",
      "q-player-earlier-07"
    ]);
    const playerEarlier = runMixedCapacityScenario(
      playerEarlierNpcIds,
      1
    );
    const playerEarlierAccepted = Object.freeze([
      "player",
      ...playerEarlierNpcIds.slice(0, 5)
    ].sort());
    pushCheck(
      checks,
      "player早着時もNPCと同じ要求時刻順で定員6",
      playerEarlier.playerAccepted &&
        playerEarlier.capacityUsed === ELEVATOR_CAPACITY &&
        playerEarlier.acceptedActorIds.join("|") ===
          playerEarlierAccepted.join("|") &&
        playerEarlier.rejectedNpcIds.join("|") ===
          playerEarlierNpcIds.slice(5).join("|") &&
        playerEarlier.acceptedNpcStatesReady &&
        playerEarlier.rejectedNpcStatesWalking &&
        playerEarlier.returnedSnapshotMatches,
      `accepted=${playerEarlier.acceptedActorIds.join(",")} / ` +
        `rejected=${playerEarlier.rejectedNpcIds.join(",")} / ` +
        `returned=${playerEarlier.returnedSnapshotMatches}`
    );

    const playerLaterNpcIds = Object.freeze([
      "a-player-later-01",
      "a-player-later-02",
      "a-player-later-03",
      "a-player-later-04",
      "a-player-later-05",
      "a-player-later-06",
      "a-player-later-07"
    ]);
    const playerLater = runMixedCapacityScenario(
      playerLaterNpcIds,
      -1
    );
    pushCheck(
      checks,
      "player遅着時は優先せず先着NPC6人で満員",
      !playerLater.playerAccepted &&
        playerLater.capacityUsed === ELEVATOR_CAPACITY &&
        playerLater.acceptedActorIds.join("|") ===
          playerLaterNpcIds.slice(0, 6).join("|") &&
        playerLater.rejectedNpcIds.join("|") ===
          playerLaterNpcIds.slice(6).join("|") &&
        playerLater.acceptedNpcStatesReady &&
        playerLater.rejectedNpcStatesWalking &&
        playerLater.returnedSnapshotMatches,
      `accepted=${playerLater.acceptedActorIds.join(",")} / ` +
        `rejected=${playerLater.rejectedNpcIds.join(",")} / ` +
        `player=${playerLater.playerAccepted} / ` +
        `returned=${playerLater.returnedSnapshotMatches}`
    );

    const playerTieNpcIds = Object.freeze([
      "a-player-tie",
      "m-player-tie",
      "n-player-tie",
      "q-player-tie",
      "r-player-tie",
      "y-player-tie",
      "z-player-tie"
    ]);
    const playerTie = runMixedCapacityScenario(
      playerTieNpcIds,
      0
    );
    const playerTieAccepted = Object.freeze([
      "a-player-tie",
      "m-player-tie",
      "n-player-tie",
      "player",
      "q-player-tie",
      "r-player-tie"
    ].sort());
    pushCheck(
      checks,
      "同時刻はplayerを含めActor ID順で予約・拒否",
      playerTie.playerAccepted &&
        playerTie.capacityUsed === ELEVATOR_CAPACITY &&
        playerTie.acceptedActorIds.join("|") ===
          playerTieAccepted.join("|") &&
        playerTie.rejectedNpcIds.join("|") ===
          "y-player-tie|z-player-tie" &&
        playerTie.acceptedNpcStatesReady &&
        playerTie.rejectedNpcStatesWalking &&
        playerTie.returnedSnapshotMatches,
      `accepted=${playerTie.acceptedActorIds.join(",")} / ` +
        `rejected=${playerTie.rejectedNpcIds.join(",")} / ` +
        `returned=${playerTie.returnedSnapshotMatches}`
    );
  } finally {
    coordinator?.dispose();
    runtime?.dispose();
    survival?.dispose();
    player?.dispose();
    context?.dispose();
  }
  return countSceneResources(scene);
};

const waitForEmptyElevatorTrip = (
  runtime: SchoolStageDynamicRuntime,
  update: (deltaSeconds: number) => SchoolStageDynamicRuntimeSnapshot,
  elevatorId: string,
  destinationStopId: string
) => {
  const elevator = runtime.getElevator(elevatorId);
  elevator.requestCall(destinationStopId);
  update(0);
  update(ELEVATOR_DOOR_MOTION_SECONDS);
  update(ELEVATOR_TRAVEL_SECONDS);
  update(ELEVATOR_DOOR_MOTION_SECONDS);
  return elevator.getSnapshot();
};

const pushCheck = (
  checks: SchoolIntegrationCheck[],
  name: string,
  ok: boolean,
  detail: string
) => {
  checks.push(Object.freeze({ name, ok, detail }));
};

export const runSchoolIntegrationAcceptance = async (): Promise<
  readonly SchoolIntegrationCheck[]
> => {
  const checks: SchoolIntegrationCheck[] = [];
  const baselineStress = readV2RuntimeStressScenario(
    "?schoolStress=baseline&seed=20260729"
  );
  const highStress = readV2RuntimeStressScenario(
    "?schoolStress=high&seed=20260729"
  );
  pushCheck(
    checks,
    "Web／Electron実学校stress人口と実行時間",
    baselineStress?.durationSeconds === 600 &&
      baselineStress.population.npcCount === 50 &&
      baselineStress.population.initialBrainwashedNpcCount ===
        10 &&
      baselineStress.population.initialBitCount === 20 &&
      highStress?.durationSeconds === 120 &&
      highStress.population.npcCount === 99 &&
      highStress.population.initialBrainwashedNpcCount === 66 &&
      highStress.population.initialBitCount === 50,
    `baseline=${baselineStress?.population.npcCount}/` +
      `${baselineStress?.population.initialBrainwashedNpcCount}/` +
      `${baselineStress?.population.initialBitCount}@${baselineStress?.durationSeconds}s / ` +
      `high=${highStress?.population.npcCount}/` +
      `${highStress?.population.initialBrainwashedNpcCount}/` +
      `${highStress?.population.initialBitCount}@${highStress?.durationSeconds}s`
  );
  let invalidStressProfileError = "";
  try {
    readV2RuntimeStressScenario("?schoolStress=unknown");
  } catch (error) {
    invalidStressProfileError =
      error instanceof Error ? error.message : String(error);
  }
  pushCheck(
    checks,
    "実学校stressの未知profile拒否",
    invalidStressProfileError ===
      "schoolStressにはbaselineまたはhighが必要です。",
    invalidStressProfileError
  );
  const level0 = createSchoolRoomVariantSelections(
    createSchoolRuntimeSettings(0),
    SCHOOL_INTEGRATION_SEED
  );
  const level2 = createSchoolRoomVariantSelections(
    createSchoolRuntimeSettings(2),
    SCHOOL_INTEGRATION_SEED
  );
  const level2Repeat = createSchoolRoomVariantSelections(
    createSchoolRuntimeSettings(2),
    SCHOOL_INTEGRATION_SEED
  );
  const level10 = createSchoolRoomVariantSelections(
    createSchoolRuntimeSettings(10),
    SCHOOL_INTEGRATION_SEED
  );
  pushCheck(
    checks,
    "20室variantの荒れレベル0／2／10",
    level0.length === 20 &&
      level2.length === 20 &&
      level10.length === 20 &&
      countDisorderedSelections(level0) === 0 &&
      countDisorderedSelections(level2) === 4 &&
      countDisorderedSelections(level10) === 20,
    `level0=${countDisorderedSelections(level0)} / ` +
      `level2=${countDisorderedSelections(level2)} / ` +
      `level10=${countDisorderedSelections(level10)}`
  );
  pushCheck(
    checks,
    "同seedのvariant再現とsession固定",
    serializeSelections(level2) === serializeSelections(level2Repeat) &&
      Object.isFrozen(level2) &&
      level2.every((selection) => Object.isFrozen(selection)),
    `seed=${SCHOOL_INTEGRATION_SEED} / ` +
      `frozen=${Object.isFrozen(level2)} / ` +
      `match=${serializeSelections(level2) === serializeSelections(level2Repeat)}`
  );

  const engine = new NullEngine();
  const scene = new Scene(engine);
  const baseline = countSceneResources(scene);
  let context: Nullable<StageSpatialContext> = null;
  let runtime: Nullable<SchoolStageDynamicRuntime> = null;
  try {
    context = await loadStageSpatialContext(
      scene,
      SCHOOL_VALIDATION_STAGE,
      {
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(
            SCHOOL_INTEGRATION_SEED
          ),
        roomVariantSelections: level2
      }
    );
    const actors = createFixtureActors();
    runtime = createSchoolStageDynamicRuntime({
      staticActiveSet: context.staticSpatialActiveSet,
      doorAssets: context.doorAssets,
      elevatorAssets: context.elevatorAssets,
      dynamicVariants: context.dynamicVariants,
      queries: context.queries,
      actors: actors.port
    });
    const driver = createRuntimeDriver(context, runtime);

    pushCheck(
      checks,
      "選択variantから実学校空間を構築",
      context.roomVariantSelection.length === 20 &&
        countDisorderedSelections(context.roomVariantSelection) === 4 &&
        serializeSelections(context.roomVariantSelection) ===
          serializeSelections(level2),
      `selected=${context.roomVariantSelection.length} / ` +
        `disordered=${countDisorderedSelections(context.roomVariantSelection)}`
    );

    const roomDoors = context.doorAssets.getByClass("room");
    const toiletDoors = context.doorAssets.getByClass("toilet_stall");
    const elevatorLandingDoors =
      context.doorAssets.getByClass("elevator_landing");
    const elevatorCarDoors =
      context.doorAssets.getByClass("elevator_car");
    pushCheck(
      checks,
      "実学校67扉metadata",
      context.doorAssets.all.length === 67 &&
        roomDoors.length === 40 &&
        toiletDoors.length === 24 &&
        elevatorLandingDoors.length === 2 &&
        elevatorCarDoors.length === 1 &&
        context.elevatorAssets.all.length === 1,
      `all=${context.doorAssets.all.length} / room=${roomDoors.length} / ` +
        `toilet=${toiletDoors.length} / elevator=` +
        `${elevatorLandingDoors.length + elevatorCarDoors.length}扉・` +
        `${context.elevatorAssets.all.length}基`
    );

    const initialSnapshot = runtime.getSnapshot();
    const elevatorAsset = context.elevatorAssets.all[0];
    const elevatorRuntime = runtime.getElevator(elevatorAsset.id);
    const initialElevator = elevatorRuntime.getSnapshot();
    const initialStopSnapshot = initialElevator.stops.find(
      (stop) => stop.id === elevatorAsset.initialStop.id
    );
    const nonInitialStopSnapshot = initialElevator.stops.find(
      (stop) => stop.id !== elevatorAsset.initialStop.id
    );
    pushCheck(
      checks,
      "revision 0へ通常扉・4階開放エレベーターを反映",
      initialSnapshot.revision === 0 &&
        context.queries.revision === 0 &&
        driver.getLastPlayerRevision() === 0 &&
        initialElevator.currentStopId === elevatorAsset.initialStop.id &&
        elevatorAsset.initialStop.floorIndex === 4 &&
        initialElevator.carDoorState === "open" &&
        initialStopSnapshot?.landingDoorState === "open" &&
        initialStopSnapshot.humanGateEnabled === false &&
        nonInitialStopSnapshot?.landingDoorState === "closed" &&
        nonInitialStopSnapshot.humanGateEnabled === true,
      `revision=${initialSnapshot.revision} / stop=` +
        `${initialElevator.currentStopId} / carDoor=${initialElevator.carDoorState}`
    );
    checks.push(
      ...runSchoolNpcNavigationPolicyAcceptance({
        stage: context,
        runtime,
        updateRuntime: driver.update,
        trackingActorId: "actor-03-brainwashed"
      })
    );

    const expectedDoorRandom = createSchoolRuntimeRandom(
      SCHOOL_INTEGRATION_SEED,
      "door-initial"
    );
    const expectedRoomStates = roomDoors.map(() =>
      expectedDoorRandom() < 0.2 ? "closed" : "open"
    );
    const actualRoomStates = roomDoors.map(
      (door) => runtime!.doors.getDoorState(door.id).state
    );
    const toiletStates = toiletDoors.map(
      (door) => runtime!.doors.getDoorState(door.id).state
    );
    pushCheck(
      checks,
      "室扉20%乱数とトイレ扉全開の初期状態",
      actualRoomStates.every(
        (state, index) => state === expectedRoomStates[index]
      ) &&
        toiletStates.every((state) => state === "open"),
      `roomClosed=${actualRoomStates.filter((state) => state === "closed").length}/38 / ` +
        `toiletOpen=${toiletStates.filter((state) => state === "open").length}/24`
    );

    const transitionOutsideCount =
      context.bitNavigation.transitions
        .flatMap((transition) => transition.traversalPoints)
        .filter((point) => !context!.boundary.contains(point)).length;
    const exteriorProjection = getExteriorBitProjectionCount(context);
    pushCheck(
      checks,
      "B04 worldBoundaryと外周BIT経路0件",
      context.worldBoundary?.id === "world-limit" &&
        transitionOutsideCount === 0 &&
        exteriorProjection.exteriorSampleCount > 0 &&
        exteriorProjection.projectionCount === 0,
      `worldBoundary=${context.worldBoundary?.id ?? "none"} / ` +
        `outsideTransitions=${transitionOutsideCount} / ` +
        `outsideProjection=${exteriorProjection.projectionCount}/` +
        `${exteriorProjection.exteriorSampleCount}`
    );

    const moverKinds: readonly StageMoverKind[] = Object.freeze([
      "player",
      "npc",
      "bit"
    ]);
    const usableCounts = Object.fromEntries(
      moverKinds.map((moverKind) => [
        moverKind,
        context!.links.all.filter((link) =>
          canStageMoverUseLink(moverKind, link.kind)
        ).length
      ])
    );
    pushCheck(
      checks,
      "BITの全StageLink利用禁止",
      usableCounts.player === context.links.all.length &&
        usableCounts.npc === context.links.all.length &&
        usableCounts.bit === 0,
      `links=${context.links.all.length} / player=${usableCounts.player} / ` +
        `npc=${usableCounts.npc} / bit=${usableCounts.bit}`
    );

    const closedRoomDoor = roomDoors.find(
      (door) => runtime!.doors.getDoorState(door.id).state === "closed"
    );
    if (!closedRoomDoor) {
      throw new Error("seed 0で閉扉開始する実学校室扉がありません。");
    }
    const doorCycleStates: DoorState[] = [];
    const doorCycleSpatial: ReturnType<typeof inspectDoorSpatialContract>[] =
      [];
    const closedDoorCollider = getPanelColliders(closedRoomDoor)[0];
    const closedRoomDoorPanelCenter =
      requireWorldCenter(closedDoorCollider);
    const closedDoorRaySegment =
      createDoorRaySegment(closedDoorCollider);
    const dynamicRayProbe = createDoorDynamicRayProbe(
      scene,
      context,
      closedRoomDoor,
      closedDoorRaySegment
    );
    const doorCycleRays: DoorDynamicRaySample[] = [];
    const recordDoorCycle = (
      expectedActive: boolean,
      expectedDoorwayBlocked: boolean
    ) => {
      const snapshot = runtime!.getSnapshot();
      doorCycleStates.push(
        runtime!.doors.getDoorState(closedRoomDoor.id).state
      );
      doorCycleSpatial.push(
        inspectDoorSpatialContract(
          context!,
          snapshot,
          closedRoomDoor,
          expectedActive
        )
      );
      doorCycleRays.push(
        dynamicRayProbe.sample(
          snapshot,
          expectedActive,
          expectedDoorwayBlocked
        )
      );
    };
    let openStarted:
      ReturnType<typeof runtime.doors.requestDoorToggle>;
    let closeStarted:
      ReturnType<typeof runtime.doors.requestDoorToggle>;
    try {
      recordDoorCycle(true, true);
      openStarted =
        runtime.doors.requestDoorToggle(closedRoomDoor.id);
      driver.update(0);
      recordDoorCycle(false, false);
      driver.update(STAGE_DOOR_TRAVEL_SECONDS * 0.5);
      recordDoorCycle(false, false);
      driver.update(STAGE_DOOR_TRAVEL_SECONDS * 0.5);
      recordDoorCycle(true, false);
      closeStarted =
        runtime.doors.requestDoorToggle(closedRoomDoor.id);
      driver.update(0);
      recordDoorCycle(false, false);
      driver.update(STAGE_DOOR_TRAVEL_SECONDS * 0.5);
      recordDoorCycle(false, false);
      driver.update(STAGE_DOOR_TRAVEL_SECONDS * 0.5);
      recordDoorCycle(true, true);
    } finally {
      dynamicRayProbe.dispose();
    }
    pushCheck(
      checks,
      "通常扉closed→opening→open→closing→closed",
      openStarted.status === "started" &&
        closeStarted.status === "started" &&
        doorCycleStates.join("|") ===
          "closed|opening|opening|open|closing|closing|closed",
      `door=${closedRoomDoor.id} / states=${doorCycleStates.join("→")}`
    );
    pushCheck(
      checks,
      "扉状態ごとの人物・ビーム・視線・BIT動的集合",
      doorCycleSpatial.every(
        (sample, index) =>
          sample.ok &&
          sample.revision ===
            doorCycleSpatial[0].revision +
              ([0, 1, 1, 2, 3, 3, 4] as const)[index]
      ),
      doorCycleSpatial
        .map(
          (sample, index) =>
            `${doorCycleStates[index]}@r${sample.revision}:` +
            `${sample.setStateOk}/${sample.blockerContainmentOk}`
        )
        .join(" / ")
    );
    pushCheck(
      checks,
      "現行9発射originの動的開始点包含・segment遮蔽",
      doorCycleRays.every(
        (sample) =>
          sample.originCount === 9 &&
          sample.originCoverageOk &&
          sample.startContainmentOk &&
          sample.beamSegmentOk
      ),
      doorCycleRays
        .map(
          (sample, index) =>
            `${doorCycleStates[index]}@r${sample.revision}:` +
            `${sample.originCount}/` +
            `${sample.startContainmentOk}/` +
            `${sample.beamSegmentOk}`
        )
        .join(" / ")
    );
    pushCheck(
      checks,
      "実視線castの動的開始点包含・segment遮蔽",
      doorCycleRays.every(
        (sample) =>
          sample.sightStartContainmentOk &&
          sample.sightSegmentOk
      ),
      doorCycleRays
        .map(
          (sample, index) =>
            `${doorCycleStates[index]}@r${sample.revision}:` +
            `${sample.sightStartContainmentOk}/` +
            `${sample.sightSegmentOk}`
        )
        .join(" / ")
    );
    pushCheck(
      checks,
      "光線・視線queryの同一revisionと静的fallback禁止",
      doorCycleRays.every(
        (sample) =>
          sample.singleRevisionOk &&
          sample.queryCount > 0 &&
          sample.staticFallbackAccessCount === 0
      ),
      doorCycleRays
        .map(
          (sample, index) =>
            `${doorCycleStates[index]}@r${sample.revision}:` +
            `queries=${sample.queryCount}/` +
            `fallback=${sample.staticFallbackAccessCount}`
        )
        .join(" / ")
    );

    const occupancyDoor = toiletDoors[3];
    const occupancyActor = requireActor(
      actors.actors,
      "actor-08-occupancy"
    );
    runtime.doors.requestDoorToggle(closedRoomDoor.id);
    runtime.update(STAGE_DOOR_TRAVEL_SECONDS);
    occupancyActor.position.copyFrom(closedRoomDoorPanelCenter);
    occupancyActor.radii.setAll(0.05);
    const roomOccupancyIntersects =
      intersectsStageDoorClosedPose(
        closedRoomDoor,
        Object.freeze({
          center: occupancyActor.position.clone(),
          radii: occupancyActor.radii.clone()
        })
      );
    const roomOccupancyResult =
      runtime.doors.requestDoorToggle(closedRoomDoor.id);
    runtime.update(STAGE_DOOR_TRAVEL_SECONDS);
    const roomOccupancyCleared =
      !intersectsStageDoorClosedPose(
        closedRoomDoor,
        Object.freeze({
          center: occupancyActor.position.clone(),
          radii: occupancyActor.radii.clone()
        })
      );
    pushCheck(
      checks,
      "教室引き戸も人物を最終パネル外へ退避して閉鎖",
      roomOccupancyIntersects &&
        roomOccupancyResult.status === "started" &&
        roomOccupancyResult.state === "closing" &&
        runtime.doors.getDoorState(closedRoomDoor.id).state === "closed" &&
        roomOccupancyCleared,
      `intersects=${roomOccupancyIntersects} / ` +
        `status=${roomOccupancyResult.status} / ` +
        `cleared=${roomOccupancyCleared}`
    );
    occupancyActor.position.copyFrom(requireWorldCenter(occupancyDoor.sweepMesh));
    occupancyActor.radii.setAll(0.05);
    const occupancyIntersects = context.queries.intersectsVolumeById(
      occupancyDoor.sweepId,
      Object.freeze({
        center: occupancyActor.position.clone(),
        radii: occupancyActor.radii.clone()
      })
    );
    const occupancyResult =
      runtime.doors.requestDoorToggle(occupancyDoor.id);
    runtime.update(0.8);
    const occupancyActorAfter = occupancyActor.position.clone();
    const occupancyCleared =
      !intersectsStageDoorClosedPose(
        occupancyDoor,
        Object.freeze({
          center: occupancyActor.position.clone(),
          radii: occupancyActor.radii.clone()
        })
      );
    pushCheck(
      checks,
      "人物楕円体を最終パネル外へ退避して閉鎖",
      occupancyIntersects &&
        occupancyResult.status === "started" &&
        occupancyResult.state === "closing" &&
        runtime.doors.getDoorState(occupancyDoor.id).state === "closed" &&
        occupancyCleared,
      `intersects=${occupancyIntersects} / status=${occupancyResult.status}` +
        ` / actor=${occupancyActorAfter.toString()} / cleared=${occupancyCleared}`
    );
    occupancyActor.position.set(1_100, 1_000, 1_000);
    occupancyActor.radii.setAll(0.001);

    const fromStop = elevatorAsset.initialStop;
    const destinationStop = elevatorAsset.stops.find(
      (stop) => stop !== fromStop
    );
    if (!destinationStop) {
      throw new Error("実学校エレベーターの目的停止階がありません。");
    }
    const estimate = elevatorRuntime.estimateTripSeconds(
      fromStop.id,
      destinationStop.id
    );
    const expectedRideSeconds = 12;
    pushCheck(
      checks,
      "現在状態を含むエレベーター所要時間予測",
      estimate.fromStopId === fromStop.id &&
        estimate.destinationStopId === destinationStop.id &&
        Number(ELEVATOR_FIRST_PASSENGER_WAIT_SECONDS) === 4 &&
        estimate.capacityAvailable &&
        estimate.availableCapacity === ELEVATOR_CAPACITY &&
        estimate.waitSeconds === 0 &&
        estimate.rideSeconds === expectedRideSeconds &&
        estimate.totalSeconds === expectedRideSeconds,
      `wait=${estimate.waitSeconds} / ride=${estimate.rideSeconds} / ` +
        `total=${estimate.totalSeconds} / capacity=${estimate.availableCapacity}`
    );

    elevatorAsset.car.passengerOriginNode.computeWorldMatrix(true);
    const callMatCenter = requireWorldCenter(fromStop.callMat.mesh);
    const boardingActorIds = ACTOR_DEFINITIONS.slice(0, 7).map(
      (definition) => definition.id
    );
    boardingActorIds.forEach((actorId) => {
      requireActor(actors.actors, actorId).position.copyFrom(callMatCenter);
    });
    const allActorsStartedOnCallMat = boardingActorIds.every(
      (actorId) =>
        context!.queries.containsVolumeById(
          fromStop.callMat.id,
          requireActor(actors.actors, actorId).position
        )
    );
    const reservations = boardingActorIds.map((actorId) =>
      Object.freeze({
        actorId,
        fromStopId: fromStop.id,
        destinationStopId: destinationStop.id,
        requestedAtSeconds: 1
      })
    );
    const boardingResults = elevatorRuntime.requestBoarding(reservations);
    const acceptedIds = boardingResults.flatMap((result) =>
      result.status === "accepted" ? [result.reservation.actorId] : []
    );
    const rejectedIds = boardingResults.flatMap((result) =>
      result.status === "capacity-reached" ? [result.actorId] : []
    );
    const fullEstimate = elevatorRuntime.estimateTripSeconds(
      fromStop.id,
      destinationStop.id
    );
    pushCheck(
      checks,
      "予約込み定員6人と同時要求Actor ID順",
      acceptedIds.join("|") === boardingActorIds.slice(0, 6).join("|") &&
        rejectedIds.length === 1 &&
        rejectedIds[0] === boardingActorIds[6] &&
        !fullEstimate.capacityAvailable &&
        fullEstimate.availableCapacity === 0,
      `accepted=${acceptedIds.join(",")} / rejected=${rejectedIds.join(",")} / ` +
        `remaining=${fullEstimate.availableCapacity}`
    );

    const firstAcceptedId = acceptedIds[0];
    if (!firstAcceptedId) {
      throw new Error("実学校エレベーターの先頭乗車Actorがありません。");
    }
    elevatorRuntime.completeBoarding(firstAcceptedId);
    const firstBoardingSnapshot = elevatorRuntime.getSnapshot();
    driver.update(3.999);
    const beforeFourSeconds = elevatorRuntime.getSnapshot();
    acceptedIds.slice(1).forEach((actorId) =>
      elevatorRuntime.completeBoarding(actorId)
    );
    const afterLaterBoarding = elevatorRuntime.getSnapshot();
    pushCheck(
      checks,
      "最初の乗車から3.999秒待機し後続乗車で4秒発車を延長しない",
      firstBoardingSnapshot.carDoorState === "open" &&
        firstBoardingSnapshot.dwellRemainingSeconds === 4 &&
        beforeFourSeconds.carDoorState === "open" &&
        beforeFourSeconds.dwellRemainingSeconds !== null &&
        Math.abs(beforeFourSeconds.dwellRemainingSeconds - 0.001) <=
          POSITION_EPSILON &&
        afterLaterBoarding.carDoorState === "open" &&
        afterLaterBoarding.dwellRemainingSeconds ===
          beforeFourSeconds.dwellRemainingSeconds,
      `first=${firstBoardingSnapshot.dwellRemainingSeconds} / ` +
        `at3.999=${beforeFourSeconds.carDoorState}:` +
        `${beforeFourSeconds.dwellRemainingSeconds} / ` +
        `later=${afterLaterBoarding.carDoorState}:` +
        `${afterLaterBoarding.dwellRemainingSeconds}`
    );
    const boardedIntoSafeSlots = acceptedIds.every((actorId) => {
      const actor = requireActor(actors.actors, actorId);
      const ellipsoid = Object.freeze({
        center: actor.position.clone(),
        radii: actor.radii.clone()
      });
      return (
        context!.queries.containsVolumeById(
          elevatorAsset.car.occupancy.id,
          actor.position
        ) &&
        context!.queries.intersectsVolumeById(
          elevatorAsset.car.occupancy.id,
          ellipsoid
        ) &&
        !context!.queries.intersectsVolumeById(
          fromStop.callMat.id,
          ellipsoid
        ) &&
        !context!.queries.intersectsVolumeById(
          fromStop.threshold.id,
          ellipsoid
        ) &&
        !context!.queries.intersectsVolumeById(
          fromStop.landingDoor.sweepId,
          ellipsoid
        ) &&
        !context!.queries.intersectsVolumeById(
          elevatorAsset.car.door.sweepId,
          ellipsoid
        )
      );
    });
    const boardingSlotKeys = new Set(
      acceptedIds.map((actorId) => {
        const position = requireActor(actors.actors, actorId).position;
        return `${position.x.toFixed(6)}|${position.y.toFixed(6)}|${position.z.toFixed(6)}`;
      })
    );
    pushCheck(
      checks,
      "呼出マットから実かご6slotへ安全に乗車",
      allActorsStartedOnCallMat &&
        boardedIntoSafeSlots &&
        boardingSlotKeys.size === ELEVATOR_CAPACITY,
      `callMat=${allActorsStartedOnCallMat} / safeSlots=${boardedIntoSafeSlots} / ` +
        `uniqueSlots=${boardingSlotKeys.size}`
    );
    const rejectedBoardingActor = requireActor(
      actors.actors,
      boardingActorIds[6]
    );
    const beforeTransportPositions = new Map(
      acceptedIds.map((actorId) => [
        actorId,
        requireActor(actors.actors, actorId).position.clone()
      ])
    );
    const beforePassengerSnapshot =
      elevatorRuntime.getSnapshot().passengers;
    const beforeElevatorMotionRevision = runtime.revision;
    const callMatOccupiedBeforeClosing =
      context.queries.intersectsVolumeById(
        fromStop.callMat.id,
        Object.freeze({
          center: rejectedBoardingActor.position.clone(),
          radii: rejectedBoardingActor.radii.clone()
        })
      );
    const closingStartSnapshot = driver.update(0.001);
    const closingStart = elevatorRuntime.getSnapshot();
    rejectedBoardingActor.position.set(
      1_200,
      1_000,
      1_000
    );
    rejectedBoardingActor.radii.setAll(0.001);
    pushCheck(
      checks,
      "最初の乗車から4秒で呼出マット占有中でもclosingを開始",
      callMatOccupiedBeforeClosing &&
        closingStart.carDoorState === "closing" &&
        closingStart.carState === "stopped" &&
        closingStart.dwellRemainingSeconds === 0 &&
        closingStartSnapshot.revision ===
          beforeElevatorMotionRevision + 1,
      `occupied=${callMatOccupiedBeforeClosing} / ` +
        `motion=${closingStart.carState}:${closingStart.carDoorState} / ` +
        `dwell=${closingStart.dwellRemainingSeconds} / revision=` +
        `${beforeElevatorMotionRevision}→${closingStartSnapshot.revision}`
    );
    const closingPanelsExcluded = inspectElevatorMotionPanels(
      closingStartSnapshot,
      elevatorAsset,
      fromStop.id,
      false
    );
    const closingMiddleSnapshot = driver.update(
      ELEVATOR_DOOR_MOTION_SECONDS * 0.5
    );
    const closingMiddle = elevatorRuntime.getSnapshot();
    const closingMiddlePanelsExcluded = inspectElevatorMotionPanels(
      closingMiddleSnapshot,
      elevatorAsset,
      fromStop.id,
      false
    );
    const movingStartSnapshot = driver.update(
      ELEVATOR_DOOR_MOTION_SECONDS * 0.5
    );
    const movingStart = elevatorRuntime.getSnapshot();
    const movingClosedPanelsActive = [
      ...elevatorAsset.car.door.panels,
      ...elevatorAsset.stops.flatMap((stop) =>
        stop.landingDoor.panels
      )
    ]
      .flatMap((panel) => panel.colliderMeshes)
      .every((mesh) =>
        isMeshInEveryDynamicSet(
          movingStartSnapshot.spatialSnapshot,
          mesh
        )
      );
    const midTravelRuntimeSnapshot = driver.update(
      ELEVATOR_TRAVEL_SECONDS * 0.5
    );
    const midTravel = elevatorRuntime.getSnapshot();
    const futureReturnEstimate =
      elevatorRuntime.estimateTripSeconds(
        destinationStop.id,
        fromStop.id
      );
    const openingOccupancyActor = requireActor(
      actors.actors,
      "actor-08-occupancy"
    );
    openingOccupancyActor.position.copyFrom(
      requireWorldCenter(destinationStop.threshold.mesh)
    );
    openingOccupancyActor.radii.setAll(0.05);
    const thresholdOccupiedBeforeOpening =
      context.queries.intersectsVolumeById(
        destinationStop.threshold.id,
        Object.freeze({
          center: openingOccupancyActor.position.clone(),
          radii: openingOccupancyActor.radii.clone()
        })
      );
    const arrivalBlockedSnapshot = driver.update(
      ELEVATOR_TRAVEL_SECONDS * 0.5
    );
    const arrivalBlocked = elevatorRuntime.getSnapshot();
    openingOccupancyActor.position.set(
      1_300,
      1_000,
      1_000
    );
    openingOccupancyActor.radii.setAll(0.001);
    const arrivalOpeningSnapshot = driver.update(0);
    const arrivalOpening = elevatorRuntime.getSnapshot();
    pushCheck(
      checks,
      "エレベーターopeningは敷居占有中に開始しない",
      thresholdOccupiedBeforeOpening &&
        arrivalBlocked.currentStopId === destinationStop.id &&
        arrivalBlocked.carState === "stopped" &&
        arrivalBlocked.carDoorState === "closed" &&
        arrivalBlockedSnapshot.revision ===
          midTravelRuntimeSnapshot.revision + 1 &&
        arrivalOpening.carDoorState === "opening" &&
        arrivalOpeningSnapshot.revision ===
          arrivalBlockedSnapshot.revision + 1,
      `occupied=${thresholdOccupiedBeforeOpening} / blocked=` +
        `${arrivalBlocked.currentStopId}:` +
        `${arrivalBlocked.carState}:${arrivalBlocked.carDoorState} / ` +
        `released=${arrivalOpening.carDoorState} / revision=` +
        `${midTravelRuntimeSnapshot.revision}→` +
        `${arrivalBlockedSnapshot.revision}→` +
        `${arrivalOpeningSnapshot.revision}`
    );
    const arrivalPanelsExcluded = inspectElevatorMotionPanels(
      arrivalOpeningSnapshot,
      elevatorAsset,
      destinationStop.id,
      false
    );
    const openingMiddleSnapshot = driver.update(
      ELEVATOR_DOOR_MOTION_SECONDS * 0.5
    );
    const openingMiddle = elevatorRuntime.getSnapshot();
    const openingMiddlePanelsExcluded = inspectElevatorMotionPanels(
      openingMiddleSnapshot,
      elevatorAsset,
      destinationStop.id,
      false
    );
    const arrivedSnapshot = driver.update(
      ELEVATOR_DOOR_MOTION_SECONDS * 0.5
    );
    const arrived = elevatorRuntime.getSnapshot();
    const elevatorMotionRevisions = [
      closingStartSnapshot.revision,
      closingMiddleSnapshot.revision,
      movingStartSnapshot.revision,
      midTravelRuntimeSnapshot.revision,
      arrivalBlockedSnapshot.revision,
      arrivalOpeningSnapshot.revision,
      openingMiddleSnapshot.revision,
      arrivedSnapshot.revision
    ];
    const arrivedPanelsActive = [
      ...elevatorAsset.car.door.panels,
      ...elevatorAsset.stops.flatMap((stop) =>
        stop.landingDoor.panels
      )
    ]
      .flatMap((panel) => panel.colliderMeshes)
      .every((mesh) =>
        isMeshInEveryDynamicSet(
          arrivedSnapshot.spatialSnapshot,
          mesh
        )
      );
    pushCheck(
      checks,
      "エレベーター扉・かご更新中の動的集合",
      closingStart.carDoorState === "closing" &&
        closingPanelsExcluded &&
        closingMiddle.carDoorState === "closing" &&
        closingMiddlePanelsExcluded &&
        movingStart.carState === "moving" &&
        movingClosedPanelsActive &&
        midTravel.carState === "moving" &&
        midTravel.carTravelProgress === 0.5 &&
        futureReturnEstimate.capacityAvailable &&
        futureReturnEstimate.availableCapacity ===
          ELEVATOR_CAPACITY &&
        arrivalOpening.carDoorState === "opening" &&
        arrivalPanelsExcluded &&
        openingMiddle.carDoorState === "opening" &&
        openingMiddlePanelsExcluded &&
        arrived.carDoorState === "open" &&
        arrivedPanelsActive,
      `closing=${closingPanelsExcluded}/${closingMiddlePanelsExcluded} / ` +
        `moving=${movingClosedPanelsActive}@${midTravel.carTravelProgress.toFixed(2)} / ` +
        `futureCapacity=${futureReturnEstimate.availableCapacity} / ` +
        `opening=${arrivalPanelsExcluded}/${openingMiddlePanelsExcluded} / ` +
        `open=${arrivedPanelsActive}`
    );
    pushCheck(
      checks,
      "エレベーター開閉・走行Transformのrevision",
      elevatorMotionRevisions.every(
        (revision, index) =>
          revision ===
          beforeElevatorMotionRevision + index + 1
      ),
      `revision=${beforeElevatorMotionRevision}→` +
        elevatorMotionRevisions.join("→")
    );

    const afterPassengerSnapshot = arrived.passengers;
    const passengerRelativePreserved =
      beforePassengerSnapshot.length === ELEVATOR_CAPACITY &&
      afterPassengerSnapshot.length === ELEVATOR_CAPACITY &&
      beforePassengerSnapshot.every((before) => {
        const after = afterPassengerSnapshot.find(
          (passenger) => passenger.actorId === before.actorId
        );
        return (
          after !== undefined &&
          Vector3.Distance(
            before.carLocalPosition,
            after.carLocalPosition
          ) <= POSITION_EPSILON
        );
      });
    const allActorsMoved = acceptedIds.every(
      (actorId) =>
        Vector3.Distance(
          beforeTransportPositions.get(actorId)!,
          requireActor(actors.actors, actorId).position
        ) > POSITION_EPSILON
    );
    pushCheck(
      checks,
      "プレイヤー・両NPC陣営の相対位置保持搬送",
      arrived.currentStopId === destinationStop.id &&
        arrived.carState === "stopped" &&
        arrived.carDoorState === "open" &&
        passengerRelativePreserved &&
        allActorsMoved &&
        acceptedIds.some(
          (actorId) =>
            requireActor(actors.actors, actorId).faction === "player"
        ) &&
        acceptedIds.some(
          (actorId) =>
            requireActor(actors.actors, actorId).faction ===
            "unbrainwashed"
        ) &&
        acceptedIds.some(
          (actorId) =>
            requireActor(actors.actors, actorId).faction === "brainwashed"
        ),
      `stop=${arrived.currentStopId} / passengers=${arrived.passengers.length} / ` +
        `relative=${passengerRelativePreserved} / moved=${allActorsMoved}`
    );

    acceptedIds.forEach((actorId, index) => {
      elevatorRuntime.completeDisembark(actorId);
      requireActor(actors.actors, actorId).position.set(
        1_300 + index,
        1_000,
        1_000
      );
    });
    const disembarked = elevatorRuntime.getSnapshot();
    pushCheck(
      checks,
      "定員到達後も全員の降車を保証",
      disembarked.passengers.length === 0 &&
        disembarked.reservations.length === 0 &&
        disembarked.dwellRemainingSeconds === null,
      `passengers=${disembarked.passengers.length} / ` +
        `reservations=${disembarked.reservations.length} / ` +
        `dwell=${disembarked.dwellRemainingSeconds ?? "none"}`
    );

    const incrementalBoardingIds =
      boardingActorIds.slice(0, 6);
    const incrementalReservations =
      incrementalBoardingIds.map((actorId) =>
        Object.freeze({
          actorId,
          fromStopId: destinationStop.id,
          destinationStopId: fromStop.id,
          requestedAtSeconds: 2
        })
      );
    const incrementalReservationResults =
      elevatorRuntime.requestBoarding(
        incrementalReservations
      );
    incrementalBoardingIds
      .slice(0, 3)
      .forEach((actorId) =>
        elevatorRuntime.completeBoarding(actorId)
      );
    const occupiedBeforeIntermediateDisembark =
      elevatorRuntime.getSnapshot().passengers;
    const intermediateDisembarkId =
      incrementalBoardingIds[1];
    elevatorRuntime.completePreDepartureExit(
      intermediateDisembarkId
    );
    incrementalBoardingIds
      .slice(3)
      .forEach((actorId) =>
        elevatorRuntime.completeBoarding(actorId)
      );
    const replacementActorId = boardingActorIds[6];
    const replacementReservation =
      elevatorRuntime.requestBoarding({
        actorId: replacementActorId,
        fromStopId: destinationStop.id,
        destinationStopId: fromStop.id,
        requestedAtSeconds: 3
      });
    if (replacementReservation.status !== "accepted") {
      throw new Error(
        `途中降車後の置換Actorを予約できません: ${replacementReservation.status}`
      );
    }
    elevatorRuntime.completeBoarding(replacementActorId);
    const afterIncrementalBoarding =
      elevatorRuntime.getSnapshot();
    const incrementalSlotCenters =
      afterIncrementalBoarding.passengers.map(
        (passenger) =>
          requireActor(
            actors.actors,
            passenger.actorId
          ).position
      );
    pushCheck(
      checks,
      "途中降車後も占有中slotを再利用しない",
      incrementalReservationResults.every(
        (result) => result.status === "accepted"
      ) &&
        occupiedBeforeIntermediateDisembark.length === 3 &&
        afterIncrementalBoarding.passengers.length ===
          ELEVATOR_CAPACITY &&
        new Set(
          incrementalSlotCenters.map(
            (position) =>
              `${position.x.toFixed(6)}|${position.y.toFixed(6)}|${position.z.toFixed(6)}`
          )
        ).size === ELEVATOR_CAPACITY,
      `before=${occupiedBeforeIntermediateDisembark
        .map(
          (passenger) =>
            `${passenger.actorId}@${requireActor(
              actors.actors,
              passenger.actorId
            ).position
              .asArray()
              .map((value) => value.toFixed(3))
              .join("/")}`
        )
        .join(",")} / after=${afterIncrementalBoarding.passengers
        .map(
          (passenger) =>
            `${passenger.actorId}@${requireActor(
              actors.actors,
              passenger.actorId
            ).position
              .asArray()
              .map((value) => value.toFixed(3))
              .join("/")}`
        )
        .join(",")}`
    );
    afterIncrementalBoarding.passengers.forEach(
      (passenger) =>
        elevatorRuntime.completePreDepartureExit(
          passenger.actorId
        )
    );

    const returnToInitial = waitForEmptyElevatorTrip(
      runtime,
      driver.update,
      elevatorAsset.id,
      fromStop.id
    );
    const secondOutbound = waitForEmptyElevatorTrip(
      runtime,
      driver.update,
      elevatorAsset.id,
      destinationStop.id
    );
    pushCheck(
      checks,
      "単独呼出・往復",
      returnToInitial.currentStopId === fromStop.id &&
        returnToInitial.carDoorState === "open" &&
        secondOutbound.currentStopId === destinationStop.id &&
        secondOutbound.carDoorState === "open" &&
        returnToInitial.calls.length === 0 &&
        secondOutbound.calls.length === 0,
      `${destinationStop.floorIndex}F→${fromStop.floorIndex}F→` +
        `${destinationStop.floorIndex}F / elapsed=` +
        `${secondOutbound.elapsedSeconds.toFixed(1)}`
    );

    checks.push(
      runElevatorThresholdPlayerAcceptance({
        scene,
        stage: context,
        runtime,
        update: driver.update
      })
    );

    runtime.dispose();
    runtime = null;
    context.dispose();
    context = null;
    const afterFirstDispose = countSceneResources(scene);
    const afterCoordinatorDispose =
      await runTraversalCoordinatorAcceptance(
        scene,
        level2,
        checks
      );
    const afterPlayerCoordinatorDispose =
      await runPlayerElevatorTraversalAcceptance(
        scene,
        level2,
        checks
      );

    const reloadedContext = await loadStageSpatialContext(
      scene,
      SCHOOL_VALIDATION_STAGE,
      {
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(
            SCHOOL_INTEGRATION_SEED
          ),
        roomVariantSelections: level2
      }
    );
    const reloadedActors = createFixtureActors();
    const reloadedRuntime = createSchoolStageDynamicRuntime({
      staticActiveSet: reloadedContext.staticSpatialActiveSet,
      doorAssets: reloadedContext.doorAssets,
      elevatorAssets: reloadedContext.elevatorAssets,
      dynamicVariants: reloadedContext.dynamicVariants,
      queries: reloadedContext.queries,
      actors: reloadedActors.port
    });
    const reloadedSnapshot = reloadedRuntime.getSnapshot();
    const reloadStateClean =
      reloadedSnapshot.revision === 0 &&
      reloadedSnapshot.elevators.every(
        (elevator) =>
          elevator.calls.length === 0 &&
          elevator.reservations.length === 0 &&
          elevator.passengers.length === 0
      );
    reloadedRuntime.dispose();
    reloadedContext.dispose();
    const afterSecondDispose = countSceneResources(scene);
    pushCheck(
      checks,
      "Runtime破棄・実学校再読込の残留0件",
      reloadStateClean &&
        sceneResourceCountsEqual(baseline, afterFirstDispose) &&
        sceneResourceCountsEqual(
          baseline,
          afterCoordinatorDispose
        ) &&
        sceneResourceCountsEqual(
          baseline,
          afterPlayerCoordinatorDispose
        ) &&
        sceneResourceCountsEqual(baseline, afterSecondDispose),
      `clean=${reloadStateClean} / baseline=${formatSceneResourceCounts(baseline)} / ` +
        `first=${formatSceneResourceCounts(afterFirstDispose)} / ` +
        `coordinator=${formatSceneResourceCounts(afterCoordinatorDispose)} / ` +
        `playerCoordinator=${formatSceneResourceCounts(
          afterPlayerCoordinatorDispose
        )} / ` +
        `second=${formatSceneResourceCounts(afterSecondDispose)}`
    );
  } finally {
    runtime?.dispose();
    context?.dispose();
    scene.dispose();
    engine.dispose();
  }
  return Object.freeze(checks);
};
