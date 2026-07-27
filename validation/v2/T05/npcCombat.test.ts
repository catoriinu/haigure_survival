import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  NPC_SPRITE_CENTER_HEIGHT
} from "../../../src/game/characterSprites";
import {
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
  type V2AlarmTriggerEvent
} from "../../../src/v2/alarmSystem";
import {
  V2_HIT_FADE_DURATION_SECONDS,
  V2_HIT_FLICKER_DURATION_SECONDS,
  type V2CharacterImpactSource
} from "../../../src/v2/characterStateSystem";
import {
  V2_NPC_CAPTURE_BREAKAWAY_SPEED,
  V2_NPC_CAPTURE_DURATION_SECONDS,
  V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS,
  V2_NPC_GUN_BEAM_SPEED,
  V2_NPC_MINIMUM_PATH_REPLANS_PER_UPDATE,
  V2_NPC_PATH_REPLAN_DEADLINE_SECONDS,
  createV2NpcSystem,
  type V2NpcSystem
} from "../../../src/v2/npcSystem";
import {
  isV2AliveState,
  isV2BrainwashState,
  type V2CharacterState,
  type V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import { createNavigationAgent } from "../../../src/world/navigationAgent";
import type { NavigationWorld } from "../../../src/world/navigationWorld";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";

export type NpcCombatTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type NpcFixture = Readonly<{
  system: V2NpcSystem;
  navigation: NavigationWorld;
  setSightBlocked(blocked: boolean): void;
  setSightResolver(
    resolver: ((from: Vector3, to: Vector3) => boolean) | null
  ): void;
  getSightCastEnds(): readonly Vector3[];
  getPathfindCount(): number;
  setPathDistanceOverride(distance: number | null): void;
  getSpriteAlpha(npcId: string): number;
  dispose(): void;
}>;

const EMPTY_ALARM_TARGET_EVENTS:
  readonly V2AlarmTriggerEvent[] = Object.freeze([]);

const applyNpcBeamImpact = (
  system: V2NpcSystem,
  npcId: string,
  source: V2CharacterImpactSource
) =>
  system.applyBeamImpacts([
    Object.freeze({
      npcId,
      source
    })
  ])[0].accepted;

const executeTest = (
  name: string,
  operation: () => string
): NpcCombatTestResult => {
  try {
    return Object.freeze({
      name,
      ok: true,
      detail: operation()
    });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (operation: () => void, message: string) => {
  let thrown = false;
  try {
    operation();
  } catch {
    thrown = true;
  }
  assert(thrown, message);
};

const createInitializationRandom = (
  npcCount: number,
  initialBrainwashedNpcCount: number
) => {
  const spawnCoordinates = [
    [0.2, 0.5, 0.2],
    [0.8, 0.5, 0.8],
    [0.2, 0.5, 0.8]
  ] as const;
  const values: number[] = [];
  for (let index = 0; index < npcCount; index += 1) {
    const gridSize = Math.ceil(Math.sqrt(npcCount));
    const coordinate = spawnCoordinates[index] ?? [
      0.05 +
        (0.9 * (index % gridSize)) /
          Math.max(1, gridSize - 1),
      0.5,
      0.05 +
        (0.9 * Math.floor(index / gridSize)) /
          Math.max(1, gridSize - 1)
    ];
    values.push(...coordinate);
  }
  for (let index = 0; index < initialBrainwashedNpcCount; index += 1) {
    values.push(0);
  }
  for (let index = 0; index < npcCount; index += 1) {
    if (index < initialBrainwashedNpcCount) {
      const stateRoll = index === 0 ? 0.1 : index === 1 ? 0.6 : 0.95;
      values.push(stateRoll, 0.5, 0.5);
      if (stateRoll < 0.45) {
        values.push(0.5, 0.5);
      }
    } else {
      values.push(0.5, 0.5);
    }
  }
  let index = 0;
  return () => {
    const value = values[index] ?? 0.5;
    index += 1;
    return value;
  };
};

const createNpcFixture = (
  npcCount: number,
  initialBrainwashedNpcCount: number,
  boundaryExtent = 5
): NpcFixture => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateBox(
    "npc-test-ground",
    {
      width: boundaryExtent * 2,
      height: 1,
      depth: boundaryExtent * 2
    },
    scene
  );
  ground.computeWorldMatrix(true);
  let sightBlocked = false;
  let sightResolver:
    | ((from: Vector3, to: Vector3) => boolean)
    | null = null;
  const sightCastEnds: Vector3[] = [];
  let pathfindCount = 0;
  let pathDistanceOverride: number | null = null;

  const createLocation = (position: Vector3) =>
    Object.freeze({
      position: new Vector3(position.x, 0, position.z),
      polygonRef: 1
    });
  const isInside = (position: Vector3) =>
    Math.abs(position.x) <= boundaryExtent &&
    Math.abs(position.z) <= boundaryExtent;
  const navigation: NavigationWorld = {
    projectPoint: (position, maxDistance) => {
      if (!isInside(position)) {
        return null;
      }
      const projected = createLocation(position);
      return Vector3.Distance(position, projected.position) <= maxDistance
        ? projected
        : null;
    },
    findSurfacePath: (start, destination) =>
      Object.freeze({
        kind: "surface" as const,
        points: Object.freeze([
          createLocation(start.position),
          createLocation(destination.position)
        ]),
        distance: Vector3.Distance(start.position, destination.position)
      }),
    findPath: (start, destination) => {
      pathfindCount += 1;
      const surface = Object.freeze({
        kind: "surface" as const,
        points: Object.freeze([
          createLocation(start.position),
          createLocation(destination.position)
        ]),
        distance: Vector3.Distance(start.position, destination.position)
      });
      return Object.freeze({
        steps: Object.freeze([surface]),
        destination: createLocation(destination.position),
        distance: pathDistanceOverride ?? surface.distance
      });
    },
    constrainMovement: (_start, destination) =>
      isInside(destination) ? createLocation(destination) : null,
    randomPointAround: (origin) => createLocation(origin.position),
    createDebugMesh: () => ground,
    dispose: () => undefined
  };

  const stage = {
    navigation,
    boundary: Object.freeze({
      id: "stage" as const,
      mesh: ground,
      contains: (position: Vector3) =>
        isInside(position) && Math.abs(position.y) <= 0.5
    }),
    worldBoundary: null,
    queries: Object.freeze({
      castMovementSegment: () => null,
      castMovementSphere: () => null,
      castBeamSegment: () => null,
      castSightSegment: (from: Vector3, to: Vector3) => {
        sightCastEnds.push(to.clone());
        return (sightResolver?.(from, to) ?? sightBlocked)
          ? Object.freeze({
              point: Vector3.Zero(),
              normal: Vector3.Up(),
              distance: 0,
              mesh: ground
            })
          : null;
      },
      sampleGround: (origin: Vector3) =>
        Object.freeze({
          point: new Vector3(origin.x, 0, origin.z),
          normal: Vector3.Up(),
          distance: origin.y,
          mesh: ground
        }),
      containsVolume: () => false,
      dispose: () => undefined
    })
  } as unknown as StageSpatialContext;

  const system = createV2NpcSystem({
    scene,
    stage,
    npcCount,
    initialBrainwashedNpcCount,
    diagnosticsEnabled: true,
    random: createInitializationRandom(
      npcCount,
      initialBrainwashedNpcCount
    )
  });

  return Object.freeze({
    system,
    navigation,
    setSightBlocked: (blocked) => {
      sightBlocked = blocked;
    },
    setSightResolver: (resolver) => {
      sightResolver = resolver;
      sightCastEnds.length = 0;
    },
    getSightCastEnds: () =>
      Object.freeze(sightCastEnds.map((position) => position.clone())),
    getPathfindCount: () => pathfindCount,
    setPathDistanceOverride: (distance) => {
      pathDistanceOverride = distance;
    },
    getSpriteAlpha: (npcId) => {
      const spriteManagers = scene.spriteManagers;
      if (!spriteManagers) {
        throw new Error("テスト用sceneにsprite managerがありません。");
      }
      const sprite = spriteManagers
        .flatMap((manager) => manager.sprites)
        .find((candidate) => candidate.name === npcId);
      if (!sprite) {
        throw new Error(`テスト用NPC spriteがありません: ${npcId}`);
      }
      return sprite.color.a;
    },
    dispose: () => {
      system.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
};

const createPlayerTarget = (
  footPosition: Vector3,
  state: V2CharacterState = "normal"
): V2HumanTargetSnapshot => {
  const aimPosition = footPosition.add(new Vector3(0, 0.3, 0));
  return Object.freeze({
    id: "player",
    kind: "player" as const,
    footPosition: footPosition.clone(),
    aimPosition,
    hitShape: Object.freeze({
      center: aimPosition.clone(),
      radii: new Vector3(0.1, 0.3, 0.1)
    }),
    state,
    alive: isV2AliveState(state),
    brainwashed: isV2BrainwashState(state)
  });
};

const createAlarmEvent = (
  candidateId: string,
  targetId: string,
  position = Vector3.Zero()
): V2AlarmTriggerEvent =>
  Object.freeze({
    candidateId,
    targetId,
    position: position.clone()
  });

const placeThreeNpcs = (system: V2NpcSystem) => {
  system.placeNpcs([
    {
      id: "npc_0",
      footPosition: new Vector3(0, 0, 0),
      formation: false
    },
    {
      id: "npc_1",
      footPosition: new Vector3(3, 0, 3),
      formation: false
    },
    {
      id: "npc_2",
      footPosition: new Vector3(0, 0, -0.6),
      formation: false
    }
  ]);
};

const testInitialStatesAndHitShape = () => {
  const fixture = createNpcFixture(3, 3);
  try {
    const snapshots = fixture.system.getFrameView().targets;
    assert(
      snapshots.map((snapshot) => snapshot.state).join("|") ===
        "brainwash-complete-gun|brainwash-complete-no-gun|brainwash-complete-haigure",
      "初期45/45/10の決定的抽選結果が一致しません。"
    );
    assert(
      snapshots.every(
        (snapshot) =>
          snapshot.brainwashed &&
          !snapshot.alive &&
          snapshot.hitShape.center.equals(snapshot.aimPosition) &&
          snapshot.hitShape.radii.x > 0 &&
          snapshot.hitShape.radii.y > 0 &&
          snapshot.hitShape.radii.z > 0 &&
          !("collisionRadius" in snapshot)
      ),
      "state由来フラグまたは楕円体命中形状が不正です。"
    );
    return "抽選=gun/no-gun/haigure、全snapshotがstate由来の楕円体";
  } finally {
    fixture.dispose();
  }
};

const testAlarmReceiverEligibilityAndRange = () => {
  const completedFixture = createNpcFixture(3, 3, 100);
  const inProgressFixture = createNpcFixture(2, 0);
  try {
    completedFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(
          V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
          0,
          0
        ),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(
          V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS + 0.001,
          0,
          0
        ),
        formation: false
      },
      {
        id: "npc_2",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    completedFixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent("alarm-range", "player")
      ])
    );
    const firstTracking =
      completedFixture.system.getFrameView().tracking;
    assert(
      firstTracking[0].targetId === "player" &&
        firstTracking[1].targetId === null &&
        firstTracking[2].targetId === null,
      "発火時のXZ半径またはgun/no-gun完成状態の受信選別が不正です。"
    );

    completedFixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent(
          "alarm-no-gun",
          "player",
          new Vector3(
            V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS + 0.001,
            0,
            0
          )
        )
      ])
    );
    assert(
      completedFixture.system.getFrameView().tracking[1].targetId ===
        "player",
      "発火時半径内のno-gun完成NPCがAlarmを受信しません。"
    );

    inProgressFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(0.5, 0, 0),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(1, 0, 0),
        formation: false
      }
    ]);
    applyNpcBeamImpact(inProgressFixture.system, "npc_0", {
      sourceId: "bit_0",
      originKind: "bit-chase"
    });
    inProgressFixture.system.update(
      V2_HIT_FLICKER_DURATION_SECONDS +
        V2_HIT_FADE_DURATION_SECONDS,
      createPlayerTarget(new Vector3(50, 0, 50)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      inProgressFixture.system.getFrameView().targets[0].state ===
        "brainwash-in-progress",
      "受信除外テストのNPCがbrainwash-in-progressへ到達しません。"
    );
    inProgressFixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent("alarm-in-progress", "player")
      ])
    );
    assert(
      inProgressFixture.system
        .getFrameView()
        .tracking
        .every((tracking) => tracking.targetId === null),
      "brainwash-in-progressまたはalive NPCがAlarmを受信しました。"
    );
    return "50/3 world XZ範囲、gun/no-gunのみ受信、haigure/in-progress除外";
  } finally {
    inProgressFixture.dispose();
    completedFixture.dispose();
  }
};

const testGunAlarmFifoAndEvade = () => {
  const fixture = createNpcFixture(3, 2);
  try {
    placeThreeNpcs(fixture.system);
    const alivePlayer = createPlayerTarget(new Vector3(0, 0, 1));
    fixture.system.update(
      0,
      alivePlayer,
      Object.freeze([
        createAlarmEvent("alarm-0", "player"),
        createAlarmEvent("alarm-0", "npc_2"),
        createAlarmEvent("alarm-1", "player")
      ])
    );
    assert(
      fixture.system.getFrameView().tracking[0].targetId === "player",
      "alarm FIFO先頭が優先されません。"
    );

    fixture.setSightBlocked(true);
    fixture.system.update(1, alivePlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.drainBeamRequests().length === 0,
      "3D遮蔽中にNPC光線が発射されました。"
    );
    fixture.setSightBlocked(false);
    fixture.system.update(1, alivePlayer, EMPTY_ALARM_TARGET_EVENTS);
    const beams = fixture.system.drainBeamRequests();
    assert(beams.length === 1, "射程内のgun NPCが光線を発射しません。");
    assert(
      beams[0].sourceId === "npc_0" &&
        beams[0].originKind === "npc-gun" &&
        beams[0].targetPolicy.kind === "alive-humans" &&
        beams[0].speed === V2_NPC_GUN_BEAM_SPEED &&
        beams[0].maximumLifetime ===
          V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS,
      "NPC光線契約が不正です。"
    );

    fixture.system.update(30, alivePlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().tracking[0].targetId === "player",
      "Alarm FIFOが固定時間で失効しました。"
    );
    fixture.system.drainBeamRequests();
    const hitPlayer = createPlayerTarget(
      new Vector3(0, 0, 1),
      "hit-a"
    );
    fixture.system.update(0, hitPlayer, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().tracking[0].targetId === "player",
      "Alarm FIFOがhit中の対象をbrainwash前に解除しました。"
    );

    const brainwashedPlayer = createPlayerTarget(
      new Vector3(0, 0, 1),
      "brainwash-in-progress"
    );
    fixture.system.update(
      0,
      brainwashedPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const tracking = fixture.system.getFrameView().tracking[0];
    const npcTwo = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_2");
    assert(
      tracking.targetId === "npc_2" &&
        tracking.provenance === "alert",
      "非aliveのFIFO先頭がpruneされません。"
    );
    assert(npcTwo?.state === "evade", "脅威対象NPCがevadeへ遷移しません。");
    assert(
      fixture.system.getFrameView().threatenedTargetIds.includes("npc_2"),
      "追跡対象IDが脅威一覧へ反映されません。"
    );
    return "Alarm FIFO・時間保持・brainwash prune・3D遮蔽・gun光線・evade";
  } finally {
    fixture.dispose();
  }
};

const testNoGunCaptureAndBreakaway = () => {
  const fixture = createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-4, 0, -4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(0.2, 0, 0),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    const capture = fixture.system.getFrameView().captures[0];
    assert(
      capture?.npcId === "npc_1" &&
        capture.targetId === "player" &&
        capture.remainingSeconds === V2_NPC_CAPTURE_DURATION_SECONDS,
      "no-gun NPCが接触captureを開始しません。"
    );
    const threatIds = fixture.system.getFrameView().threatenedTargetIds;
    assert(
      threatIds.includes("npc_1") && threatIds.includes("player"),
      "capture双方のIDが脅威一覧へ入りません。"
    );
    assert(
      fixture.system
        .drainAlertRequests()
        .some(
          (request) =>
            request.leaderId === "npc_1" &&
            request.targetId === "player"
      ),
      "capture初回のAlertRequestがありません。"
    );
    fixture.system.update(
      V2_NPC_CAPTURE_DURATION_SECONDS,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system.getFrameView().captures.length === 0,
      "20秒後にcaptureが解除されません。"
    );
    const releasePosition = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_1")!.footPosition;
    fixture.system.update(1, player, EMPTY_ALARM_TARGET_EVENTS);
    const breakawayPosition = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_1")!.footPosition;
    assert(
      Math.abs(
        breakawayPosition.x -
          releasePosition.x -
          V2_NPC_CAPTURE_BREAKAWAY_SPEED
      ) <= 1e-6,
      "capture解除後の専用速度0.27による離脱になっていません。"
    );
    const distantPlayer = createPlayerTarget(
      new Vector3(-4, 0, 0)
    );
    fixture.system.update(
      0,
      distantPlayer,
      Object.freeze([
        createAlarmEvent(
          "alarm-breakaway-cancel",
          "player",
          breakawayPosition
        )
      ])
    );
    assert(
      fixture.system.getFrameView().tracking[1].targetId === "player",
      "非接触breakaway解除後にAlarm追跡へ復帰しません。"
    );
    fixture.system.update(
      1,
      distantPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const alarmChasePosition = fixture.system
      .getFrameView()
      .targets
      .find((snapshot) => snapshot.id === "npc_1")!.footPosition;
    assert(
      alarmChasePosition.x < breakawayPosition.x,
      "Alarmが非接触breakawayより優先されません。"
    );
    return "接触capture 20秒・離脱0.27・breakawayよりAlarm優先";
  } finally {
    fixture.dispose();
  }
};

const testAlarmInterruptsCapture = () => {
  const fixture = createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-4, 0, -4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(0.2, 0, 0),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().captures[0]?.npcId === "npc_1",
      "Alarm優先テストのcaptureが開始しません。"
    );
    fixture.system.drainAlertRequests();

    fixture.system.update(
      0,
      player,
      Object.freeze([
        createAlarmEvent("alarm-during-capture", "player")
      ])
    );
    const tracking = fixture.system.getFrameView().tracking[1];
    assert(
      tracking.targetId === "player" &&
        tracking.provenance === "alert" &&
        fixture.system.getFrameView().captures.length === 0,
      "Alarm FIFO追跡が接触captureより優先されません。"
    );
    assert(
      fixture.system.drainAlertRequests().length === 0,
      "Alarm専用追跡が共有bit Alertへ混入しました。"
    );
    return "Alarmが既存captureを即中断し、強制追跡中は再captureしない";
  } finally {
    fixture.dispose();
  }
};

const testCaptureEndsWithoutBreakawayWhenTargetIsHit = () => {
  const fixture = createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-4, 0, -4),
        formation: false
      },
      {
        id: "npc_1",
        footPosition: new Vector3(0.2, 0, 0),
        formation: false
      }
    ]);
    const player = createPlayerTarget(Vector3.Zero());
    fixture.system.update(0, player, EMPTY_ALARM_TARGET_EVENTS);
    assert(
      fixture.system.getFrameView().captures[0]?.npcId === "npc_1",
      "命中解除テストのcaptureが開始しません。"
    );

    const beforeHit = fixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    const hitPlayer = createPlayerTarget(Vector3.Zero(), "hit-a");
    fixture.system.update(1, hitPlayer, EMPTY_ALARM_TARGET_EVENTS);
    const afterHit = fixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    const tracking = fixture.system.getFrameView().tracking[1];
    assert(
      fixture.system.getFrameView().captures.length === 0 &&
        tracking.targetId === null,
      "対象命中時にcaptureと追跡を即終了できません。"
    );
    assert(
      afterHit.equals(beforeHit),
      "対象命中時に即終了すべきbreakawayが開始されました。"
    );
    return "対象hitでcapture・追跡を即終了しbreakawayなし";
  } finally {
    fixture.dispose();
  }
};

const startNoGunCaptureOfNpc = (
  fixture: NpcFixture
): V2HumanTargetSnapshot => {
  fixture.system.placeNpcs([
    {
      id: "npc_0",
      footPosition: new Vector3(-4, 0, -4),
      formation: false
    },
    {
      id: "npc_1",
      footPosition: new Vector3(0.2, 0, 0),
      formation: false
    },
    {
      id: "npc_2",
      footPosition: Vector3.Zero(),
      formation: false
    }
  ]);
  const distantPlayer = createPlayerTarget(
    new Vector3(4, 0, 4)
  );
  fixture.system.update(
    0,
    distantPlayer,
    EMPTY_ALARM_TARGET_EVENTS
  );
  assert(
    fixture.system.getFrameView().captures.some(
      (capture) =>
        capture.npcId === "npc_1" &&
        capture.targetId === "npc_2"
    ),
    "no-gun NPCがalive NPC対象のcaptureを開始しません。"
  );
  return distantPlayer;
};

const testNpcCaptureTargetImmediateReleasePaths = () => {
  const impactFixture = createNpcFixture(3, 2);
  const visibilityFixture = createNpcFixture(3, 2);
  try {
    const impactPlayer = startNoGunCaptureOfNpc(impactFixture);
    const impactCapturerBefore = impactFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      applyNpcBeamImpact(impactFixture.system, "npc_2", {
        sourceId: "bit_capture_release",
        originKind: "bit-chase"
      }),
      "capture対象NPCが光線命中を受理しません。"
    );
    assert(
      impactFixture.system.getFrameView().captures.length === 0 &&
        impactFixture.system.getFrameView().tracking[1].targetId ===
          null,
      "capture対象NPCの被弾時にcaptureと現在追跡を即解除できません。"
    );
    impactFixture.system.update(
      1,
      impactPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const impactCapturerAfter = impactFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      impactCapturerAfter.equals(impactCapturerBefore) &&
        impactFixture.system.getFrameView().tracking[1].targetId ===
          null,
      "対象NPC被弾後に不要な追跡またはbreakawayが開始されました。"
    );

    const visibilityPlayer =
      startNoGunCaptureOfNpc(visibilityFixture);
    const visibilityCapturerBefore = visibilityFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    visibilityFixture.system.setVisibleNpcIds([
      "npc_0",
      "npc_1"
    ]);
    assert(
      visibilityFixture.system.getFrameView().captures.length === 0 &&
        visibilityFixture.system.getFrameView().tracking[1].targetId ===
          null,
      "capture対象NPCの非表示化時にcaptureと追跡を即解除できません。"
    );
    visibilityFixture.system.update(
      1,
      visibilityPlayer,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const visibilityCapturerAfter = visibilityFixture.system
      .getFrameView()
      .targets
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      visibilityCapturerAfter.equals(visibilityCapturerBefore),
      "capture対象NPCの非表示化後に不要なbreakawayが開始されました。"
    );
    return "NPC対象被弾・非表示でcapture即解除、breakawayなし";
  } finally {
    visibilityFixture.dispose();
    impactFixture.dispose();
  }
};

const testImpactSuspensionAndStrictPlacement = () => {
  const fixture = createNpcFixture(2, 0);
  try {
    const before = fixture.system.getFrameView().targets[0].footPosition;
    assertThrows(
      () =>
        fixture.system.placeNpcs([
          {
            id: "npc_0",
            footPosition: Vector3.Zero(),
            formation: false
          }
        ]),
      "全NPCを含まない配置指定が拒否されません。"
    );
    assertThrows(
      () =>
        fixture.system.placeNpcs([
          {
            id: "npc_0",
            footPosition: Vector3.Zero(),
            formation: true
          },
          {
            id: "npc_1",
            footPosition: new Vector3(1, 0, 0),
            formation: false
          }
        ]),
      "alive NPCのformation指定が拒否されません。"
    );
    assertThrows(
      () =>
        fixture.system.placeNpcs([
          {
            id: "npc_0",
            footPosition: new Vector3(20, 0, 20),
            formation: false
          },
          {
            id: "npc_1",
            footPosition: new Vector3(1, 0, 0),
            formation: false
          }
        ]),
      "NavMeshへ0.1以内で投影できない配置が拒否されません。"
    );
    assert(
      fixture.system.getFrameView().targets[0].footPosition.equals(before),
      "不正配置の検証中にNPC位置が部分適用されました。"
    );

    assert(
      applyNpcBeamImpact(fixture.system, "npc_0", {
        sourceId: "v2_bit_0",
        originKind: "bit-chase"
      }),
      "alive NPCが光線命中を受理しません。"
    );
    fixture.system.setAiSuspended(true);
    fixture.system.update(
      4,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const after = fixture.system.getFrameView().targets[0];
    assert(
      after.state === "brainwash-in-progress",
      "AI停止中にcharacter state timerが進みません。"
    );
    assert(
      after.footPosition.equals(before) &&
        fixture.system.drainBeamRequests().length === 0,
      "AI停止中に移動または発射しました。"
    );
    return "厳格・原子的配置、beam impact、AI停止中state timer継続";
  } finally {
    fixture.dispose();
  }
};

const testFormationPlacement = () => {
  const fixture = createNpcFixture(2, 2);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: new Vector3(-1, 0.05, 0),
        formation: true
      },
      {
        id: "npc_1",
        footPosition: new Vector3(1, 0.05, 0),
        formation: false
      }
    ]);
    const snapshots = fixture.system.getFrameView().targets;
    assert(
      snapshots[0].state ===
        "brainwash-complete-haigure-formation",
      "brainwash NPCがformation状態へ遷移しません。"
    );
    assert(
      snapshots[0].footPosition.y === 0 &&
        snapshots[1].footPosition.y === 0,
      "配置NPCが物理床へ接地していません。"
    );
    return "全指定をNavMesh 0.1以内へ投影し物理床接地、formation遷移";
  } finally {
    fixture.dispose();
  }
};

const testScriptedExecutionAndFade = () => {
  const fixture = createNpcFixture(2, 0);
  try {
    assert(
      applyNpcBeamImpact(fixture.system, "npc_0", {
        sourceId: "bit_0",
        originKind: "bit-chase"
      }),
      "公開処刑観客用のhit状態を作れません。"
    );
    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "audience" }
    ]);
    assert(
      fixture.system.getFrameView().targets[0].state ===
        "brainwash-complete-haigure-formation",
      "hit途中のNPC観客がformationへ正規化されません。"
    );
    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "shooter" }
    ]);
    assert(
      fixture.system.getFrameView().targets[0].state ===
        "brainwash-complete-gun",
      "NPC射手がgunへ正規化されません。"
    );
    assertThrows(
      () =>
        fixture.system.prepareExecutionRoles([
          { npcId: "npc_1", role: "audience" }
        ]),
      "alive NPCへの観客強制遷移が拒否されません。"
    );
    assertThrows(
      () =>
        fixture.system.prepareExecutionRoles([
          { npcId: "npc_1", role: "shooter" }
        ]),
      "alive NPCへの射手強制遷移が拒否されません。"
    );

    applyNpcBeamImpact(fixture.system, "npc_1", {
      sourceId: "bit_1",
      originKind: "bit-fixed"
    });
    const player = createPlayerTarget(new Vector3(4, 0, 4));
    fixture.system.update(
      V2_HIT_FLICKER_DURATION_SECONDS,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.getSpriteAlpha("npc_1") === 1,
      "fade開始時のNPC alphaが1ではありません。"
    );
    fixture.system.update(
      V2_HIT_FADE_DURATION_SECONDS * 0.5,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      Math.abs(fixture.getSpriteAlpha("npc_1") - 0.5) < 0.000001,
      "fade中間時のNPC alphaが0.5ではありません。"
    );
    fixture.system.update(
      V2_HIT_FADE_DURATION_SECONDS * 0.5,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.getSpriteAlpha("npc_1") === 1,
      "fade以外のNPC alphaが1へ復帰しません。"
    );
    return "hit観客・射手正規化、alive誤用拒否、fade alpha=1→0→1";
  } finally {
    fixture.dispose();
  }
};

const testExternalThreatAndPlayerBlocking = () => {
  const fixture = createNpcFixture(3, 0);
  try {
    placeThreeNpcs(fixture.system);
    const before = new Map(
      fixture.system
        .getFrameView()
        .targets
        .map((snapshot) => [snapshot.id, snapshot.footPosition])
    );
    fixture.system.setExternalThreats([
      {
        targetId: "npc_0",
        sourcePosition: new Vector3(-1, 0, 0)
      }
    ]);
    fixture.system.setPlayerBlockedTargetIds(["npc_1", "npc_2"]);
    fixture.system.update(
      1,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const after = new Map(
      fixture.system
        .getFrameView()
        .targets
        .map((snapshot) => [snapshot.id, snapshot])
    );
    assert(
      after.get("npc_0")?.state === "evade" &&
        after.get("npc_0")!.footPosition.x >
          before.get("npc_0")!.x,
      "外部脅威対象NPCがevadeで発生元から逃走しません。"
    );
    assert(
      after
        .get("npc_1")!
        .footPosition.equals(before.get("npc_1")!) &&
        after
          .get("npc_2")!
          .footPosition.equals(before.get("npc_2")!),
      "プレイヤー接触中の複数NPCが同時停止しません。"
    );
    assert(
      fixture.system.getFrameView().threatenedTargetIds.includes("npc_0"),
      "外部脅威対象が脅威一覧へ統合されません。"
    );

    fixture.system.setExternalThreats([]);
    fixture.system.setPlayerBlockedTargetIds([]);
    fixture.system.update(
      0,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system
        .getFrameView()
        .targets
        .every((snapshot) => snapshot.state === "normal"),
      "空集合を設定した次frameに脅威・停止状態が解除されません。"
    );
    return "外部脅威evade・逃走、複数NPC停止、空集合で次frame解除";
  } finally {
    fixture.dispose();
  }
};

const testStrictNpcVisibility = () => {
  const fixture = createNpcFixture(3, 0);
  try {
    fixture.system.setVisibleNpcIds(["npc_0"]);
    assert(
      fixture.system.getFrameView().targets.map(({ id }) => id).join("|") ===
        "npc_0" &&
        fixture.system.getFrameView().actorSpheres.map(({ id }) => id).join("|") ===
          "npc_0" &&
        fixture.system.getFrameView().tracking.map(({ npcId }) => npcId).join(
          "|"
        ) === "npc_0",
      "非表示NPCが公開snapshotまたは衝突対象に残っています。"
    );
    assertThrows(
      () => fixture.system.setVisibleNpcIds(["npc_0", "npc_0"]),
      "表示NPC IDの重複が拒否されません。"
    );
    assertThrows(
      () => fixture.system.setVisibleNpcIds(["npc_missing"]),
      "未知の表示NPC IDが拒否されません。"
    );
    assert(
      fixture.system.getFrameView().targets.length === 1,
      "不正な表示指定が部分適用されました。"
    );
    fixture.system.setVisibleNpcIds(["npc_0", "npc_1", "npc_2"]);
    assert(
      fixture.system.getFrameView().targets.length === 3 &&
        fixture.system.getFrameView().actorSpheres.length === 3,
      "NPC表示集合を復元できません。"
    );
    return "表示集合でsnapshot/衝突を制御、重複・未知IDは原子的にthrow";
  } finally {
    fixture.dispose();
  }
};

const placeVisionSelectionNpcs = (system: V2NpcSystem) => {
  system.placeNpcs([
    {
      id: "npc_0",
      footPosition: Vector3.Zero(),
      formation: false
    },
    {
      id: "npc_1",
      footPosition: new Vector3(-1, 0, -1),
      formation: false
    },
    {
      id: "npc_2",
      footPosition: new Vector3(0, 0, -2),
      formation: false
    }
  ]);
};

const testNearestVisibleTargetRayEarlyExitAndTieOrder = () => {
  const tieFixture = createNpcFixture(3, 1);
  const blockedFixture = createNpcFixture(3, 1);
  const player = createPlayerTarget(
    new Vector3(1, NPC_SPRITE_CENTER_HEIGHT - 0.3, -1)
  );
  try {
    placeVisionSelectionNpcs(tieFixture.system);
    tieFixture.setSightResolver(() => false);
    tieFixture.system.update(
      0,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const tieTracking = tieFixture.system
      .getFrameView()
      .tracking.find(({ npcId }) => npcId === "npc_0");
    const tieCastEnds = tieFixture.getSightCastEnds();
    assert(
      tieTracking?.targetId === "player" &&
        tieCastEnds.length === 1 &&
        tieCastEnds.every((position) =>
          position.equals(player.aimPosition)
        ),
      "同距離の可視標的で元のframe順、最初の非遮蔽早期終了、射撃との視線共有を維持できません: " +
        `target=${tieTracking?.targetId ?? "none"} / ` +
        `casts=${tieCastEnds.map((position) => position.toString()).join("|")}`
    );

    placeVisionSelectionNpcs(blockedFixture.system);
    blockedFixture.setSightResolver((_from, to) => to.x > 0);
    blockedFixture.system.update(
      0,
      player,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const blockedTracking = blockedFixture.system
      .getFrameView()
      .tracking.find(({ npcId }) => npcId === "npc_0");
    const blockedCastEnds = blockedFixture.getSightCastEnds();
    assert(
      blockedTracking?.targetId === "npc_1" &&
        blockedCastEnds.length === 2 &&
        blockedCastEnds[0].equals(player.aimPosition) &&
        blockedCastEnds
          .slice(1)
          .every(
            (position) =>
              position.x === -1 &&
              position.z === -1
          ),
      "近い遮蔽標的の次の可視標的で停止せず、遠い候補まで視線Rayを実行しました。"
    );
    return (
      `tie=${tieTracking?.targetId}:${tieCastEnds.length} / ` +
      `blocked=${blockedTracking?.targetId}:${blockedCastEnds.length}`
    );
  } finally {
    blockedFixture.dispose();
    tieFixture.dispose();
  }
};

const testGunVisualLockAndLastSeenPath = () => {
  const fixture = createNpcFixture(1, 1);
  const overLimitFixture = createNpcFixture(1, 1);
  try {
    fixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    const initialTarget = createPlayerTarget(
      new Vector3(0, 0, -1)
    );
    fixture.system.update(
      0,
      initialTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const acquired = fixture.system.getFrameView().tracking[0];
    const baselinePathfindCount = fixture.getPathfindCount();

    const outsideFovTarget = createPlayerTarget(
      new Vector3(0, 0, 1)
    );
    fixture.system.update(
      0,
      outsideFovTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const retainedOutsideFov =
      fixture.system.getFrameView().tracking[0];

    fixture.setSightBlocked(true);
    fixture.system.update(
      0.1,
      outsideFovTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const firstLostView = fixture.system.getFrameView();
    const firstLostPathfindCount = fixture.getPathfindCount();
    fixture.system.update(
      0.1,
      outsideFovTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const secondLostPathfindCount = fixture.getPathfindCount();

    overLimitFixture.system.placeNpcs([
      {
        id: "npc_0",
        footPosition: Vector3.Zero(),
        formation: false
      }
    ]);
    overLimitFixture.system.update(
      0,
      initialTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    overLimitFixture.setPathDistanceOverride(5.01);
    overLimitFixture.setSightBlocked(true);
    overLimitFixture.system.update(
      0.1,
      initialTarget,
      EMPTY_ALARM_TARGET_EVENTS
    );
    const overLimitTracking =
      overLimitFixture.system.getFrameView().tracking[0];

    assert(
      acquired.targetId === "player" &&
        acquired.provenance === "visual",
      "銃ありNPCが初回の距離・FOV・視線条件でvisual標的を取得しません。"
    );
    assert(
      retainedOutsideFov.targetId === "player" &&
        retainedOutsideFov.provenance === "visual",
      "銃ありNPCが取得済み標的をFOV外だけで解除しました。"
    );
    assert(
      firstLostView.tracking[0].targetId === "player" &&
        firstLostView.pathRecalculationCount === 1 &&
        firstLostPathfindCount === baselinePathfindCount + 2 &&
        secondLostPathfindCount === firstLostPathfindCount,
      "最終視認位置の経路を公平予算内で一度だけ計画できません。"
    );
    assert(
      overLimitTracking.targetId === null &&
        overLimitTracking.provenance === null,
      "経路長5.0を超える最終視認位置追跡を解除しません。"
    );
    return (
      `fov=${acquired.targetId}->${retainedOutsideFov.targetId} / ` +
      `lastSeenPath=${firstLostPathfindCount}->${secondLostPathfindCount} / ` +
      `overLimit=${overLimitTracking.targetId ?? "none"}`
    );
  } finally {
    overLimitFixture.dispose();
    fixture.dispose();
  }
};

const testNavigationAgentReplanPermission = () => {
  const fixture = createNpcFixture(2, 0);
  const agent = createNavigationAgent(fixture.navigation, "npc", {
    projectionMaxDistance: 0.75,
    targetMoveThreshold: 0.15,
    pathRefreshIntervalSeconds: 0.5,
    waypointTolerance: 0.02,
    stuckDistanceThreshold: 0.005,
    stuckDurationSeconds: 1
  });
  try {
    const start = Object.freeze({
      position: Vector3.Zero(),
      polygonRef: 1
    });
    const firstWaiting = agent.update(
      start,
      new Vector3(2, 0, 0),
      1,
      0.1,
      false
    );
    assert(
      firstWaiting.state === "waiting-for-path" &&
        !firstWaiting.pathRecalculated &&
        fixture.getPathfindCount() === 0,
      "再計画未許可の新規経路要求が待機しません。"
    );

    const planned = agent.update(
      start,
      new Vector3(2, 0, 0),
      1,
      0.1,
      true
    );
    const continued = agent.update(
      planned.location,
      new Vector3(2, 0, 2),
      1,
      0.1,
      false
    );
    assert(
      planned.pathRecalculated &&
        planned.pathDistance === 2 &&
        fixture.getPathfindCount() === 1 &&
        !continued.pathRecalculated &&
        continued.state === "moving" &&
        Vector3.Distance(continued.location.position, planned.location.position) >
          0,
      "再計画未許可時に既存経路を継続できません。"
    );

    agent.clear();
    const waitingAfterClear = agent.update(
      planned.location,
      new Vector3(2, 0, 2),
      1,
      0.1,
      false
    );
    assert(
      waitingAfterClear.state === "waiting-for-path" &&
        fixture.getPathfindCount() === 1,
      "clear後の新規経路要求が許可待ちになりません。"
    );
    return "新規経路は許可待ち、既存経路は未許可frameでも継続";
  } finally {
    agent.clear();
    fixture.dispose();
  }
};

const testNpcActorSpheresAreBuiltLazilyOncePerFrameView = () => {
  const fixture = createNpcFixture(2, 0);
  try {
    const previousView = fixture.system.getFrameView();
    const actorSpheresDescriptor = Object.getOwnPropertyDescriptor(
      previousView,
      "actorSpheres"
    );
    const previousCenters = previousView.targets.map((target) =>
      target.aimPosition.clone()
    );
    assert(
      typeof actorSpheresDescriptor?.get === "function" &&
        actorSpheresDescriptor.value === undefined,
      "NPC actorSpheresが未アクセスでも先行構築されています。"
    );

    fixture.system.placeNpcs(
      previousView.targets.map((target, index) =>
        Object.freeze({
          id: target.id,
          footPosition: new Vector3(index + 1, 0, index + 1),
          formation: false
        })
      )
    );
    const currentView = fixture.system.getFrameView();
    const previousActors = previousView.actorSpheres;
    const repeatedPreviousActors = previousView.actorSpheres;
    const currentActors = currentView.actorSpheres;
    assert(
      previousActors === repeatedPreviousActors,
      "同じNPC Frame View内でactorSpheresが複数回構築されました。"
    );
    assert(
      previousActors.every(
        (actor, index) =>
          Vector3.DistanceSquared(
            actor.center,
            previousCenters[index]
          ) <= 1e-12
      ),
      "次更新後に未アクセスだった旧NPC actorSpheresが変化しました。"
    );
    assert(
      currentView !== previousView &&
        currentActors !== previousActors &&
        currentActors.some(
          (actor, index) =>
            Vector3.DistanceSquared(
              actor.center,
              previousActors[index].center
            ) > 1e-12
        ) &&
        Object.isFrozen(previousActors) &&
        previousActors.every(Object.isFrozen),
      "NPC actorSpheresの更新単位またはimmutable契約が不正です。"
    );
    return "未アクセス時getter・同一View 1回・旧View不変";
  } finally {
    fixture.dispose();
  }
};

const testNpcFrameViewBuildsOncePerBulkChange = () => {
  const fixture = createNpcFixture(3, 0);
  const alarmFixture = createNpcFixture(3, 3);
  try {
    const initialSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    fixture.system.applyBeamImpacts([]);
    fixture.system.prepareExecutionRoles([]);
    fixture.system.enterFormationStates([]);
    assert(
      fixture.system.getFrameView().frameViewBuildSequence ===
        initialSequence,
      "空のNPC一括変更でFrame Viewが再構築されました。"
    );

    const impactResults = fixture.system.applyBeamImpacts([
      {
        npcId: "npc_0",
        source: {
          sourceId: "bit_bulk_0",
          originKind: "bit-chase"
        }
      },
      {
        npcId: "npc_1",
        source: {
          sourceId: "bit_bulk_1",
          originKind: "bit-fixed"
        }
      }
    ]);
    const afterImpactSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    assert(
      impactResults.every((result) => result.accepted) &&
        afterImpactSequence === initialSequence + 1,
      "複数NPCへの光線命中でFrame Viewが1回だけ再構築されません。"
    );

    fixture.system.prepareExecutionRoles([
      { npcId: "npc_0", role: "audience" },
      { npcId: "npc_1", role: "shooter" }
    ]);
    const afterExecutionSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    assert(
      afterExecutionSequence === afterImpactSequence + 1,
      "複数NPCの公開処刑役割変更でFrame Viewが1回だけ再構築されません。"
    );

    const formationResults = fixture.system.enterFormationStates([
      "npc_0",
      "npc_1"
    ]);
    const afterFormationSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    assert(
      formationResults.every((result) => result.accepted) &&
        afterFormationSequence === afterExecutionSequence + 1,
      "複数NPCの集合状態変更でFrame Viewが1回だけ再構築されません。"
    );

    fixture.system.update(
      0,
      createPlayerTarget(new Vector3(4, 0, 4)),
      EMPTY_ALARM_TARGET_EVENTS
    );
    assert(
      fixture.system.getFrameView().frameViewBuildSequence ===
        afterFormationSequence + 1,
      "通常NPC更新でFrame Viewが1回だけ再構築されません。"
    );

    const alarmSequence =
      alarmFixture.system.getFrameView().frameViewBuildSequence;
    alarmFixture.system.update(
      0,
      createPlayerTarget(Vector3.Zero()),
      Object.freeze([
        createAlarmEvent("alarm-frame-view", "player")
      ])
    );
    assert(
      alarmFixture.system.getFrameView().frameViewBuildSequence ===
        alarmSequence + 1,
      "Alarm受信とNPC更新の間でFrame Viewが重複再構築されました。"
    );
    return "空batch=0回、複数命中・処刑役割・集合・Alarm更新=各1回";
  } finally {
    alarmFixture.dispose();
    fixture.dispose();
  }
};

const testZeroNpcUpdate = () => {
  const fixture = createNpcFixture(0, 0);
  try {
    const initialSequence =
      fixture.system.getFrameView().frameViewBuildSequence;
    fixture.system.update(
      1 / 60,
      createPlayerTarget(Vector3.Zero()),
      EMPTY_ALARM_TARGET_EVENTS
    );
    const view = fixture.system.getFrameView();
    assert(
      view.targets.length === 0 &&
        view.pathRecalculationCount === 0 &&
        view.waitingForPathCount === 0 &&
        view.frameViewBuildSequence === initialSequence + 1,
      "NPC 0件更新のFrame Viewまたは経路予算契約が不正です。"
    );
    return "NPC 0件でも再計画indexをNaN化せず1回更新";
  } finally {
    fixture.dispose();
  }
};

const testNpcFairReplanBudgetAndFrameView = () => {
  const npcCount = 99;
  const fixture = createNpcFixture(npcCount, 0, 30);
  try {
    const initialView = fixture.system.getFrameView();
    assert(
      initialView === fixture.system.getFrameView() &&
        initialView.targets === fixture.system.getFrameView().targets &&
        Object.isFrozen(initialView) &&
        Object.isFrozen(initialView.targets),
      "同じ更新内でNPC frame viewが再生成されました。"
    );

    const deltaSeconds = 1 / 60;
    const player = createPlayerTarget(new Vector3(29, 0, 29));
    let firstBudgetView = initialView;
    for (
      let frameIndex = 0;
      frameIndex < 70 &&
      firstBudgetView.pathRecalculationCount === 0;
      frameIndex += 1
    ) {
      fixture.system.update(
        deltaSeconds,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
      firstBudgetView = fixture.system.getFrameView();
    }
    assert(
      firstBudgetView !== initialView &&
        firstBudgetView.pathRecalculationCount ===
          V2_NPC_MINIMUM_PATH_REPLANS_PER_UPDATE &&
        firstBudgetView.waitingForPathCount ===
          npcCount - V2_NPC_MINIMUM_PATH_REPLANS_PER_UPDATE,
      "99件同時要求の初回予算または待機件数が不正です。"
    );

    let elapsedSinceFirstBudget = 0;
    while (
      fixture.getPathfindCount() < npcCount &&
      elapsedSinceFirstBudget <
        V2_NPC_PATH_REPLAN_DEADLINE_SECONDS
    ) {
      fixture.system.update(
        deltaSeconds,
        player,
        EMPTY_ALARM_TARGET_EVENTS
      );
      elapsedSinceFirstBudget += deltaSeconds;
    }
    const completedView = fixture.system.getFrameView();
    assert(
      fixture.getPathfindCount() === npcCount &&
        elapsedSinceFirstBudget <=
          V2_NPC_PATH_REPLAN_DEADLINE_SECONDS &&
        completedView === fixture.system.getFrameView(),
      "公平な全体予算で99件を0.5秒以内に処理できません。"
    );
    return (
      `first=${firstBudgetView.pathRecalculationCount}/` +
      `${firstBudgetView.waitingForPathCount} / ` +
      `completed=${fixture.getPathfindCount()} / ` +
      `elapsed=${elapsedSinceFirstBudget.toFixed(3)}s`
    );
  } finally {
    fixture.dispose();
  }
};

export const runNpcCombatTests = () =>
  Object.freeze([
    executeTest("NPC初期状態・楕円体snapshot", testInitialStatesAndHitShape),
    executeTest(
      "NPC Alarm受信状態・発火時範囲",
      testAlarmReceiverEligibilityAndRange
    ),
    executeTest("NPC gun・alarm FIFO・evade", testGunAlarmFifoAndEvade),
    executeTest("NPC no-gun capture・離脱", testNoGunCaptureAndBreakaway),
    executeTest(
      "NPC Alarmのcapture全面上書き",
      testAlarmInterruptsCapture
    ),
    executeTest(
      "NPC capture対象hit時の即終了",
      testCaptureEndsWithoutBreakawayWhenTargetIsHit
    ),
    executeTest(
      "NPC capture対象の被弾・非表示即解除",
      testNpcCaptureTargetImmediateReleasePaths
    ),
    executeTest(
      "NPC beam impact・AI停止・厳格配置",
      testImpactSuspensionAndStrictPlacement
    ),
    executeTest("NPC集合配置", testFormationPlacement),
    executeTest("NPC公開処刑状態・hit fade", testScriptedExecutionAndFade),
    executeTest(
      "NPC外部脅威・プレイヤー複数停止",
      testExternalThreatAndPlayerBlocking
    ),
    executeTest("NPC厳格表示集合", testStrictNpcVisibility),
    executeTest(
      "NPC最近傍可視Ray早期終了・同距離順",
      testNearestVisibleTargetRayEarlyExitAndTieOrder
    ),
    executeTest(
      "NPC gunのFOV外保持・最終視認位置経路",
      testGunVisualLockAndLastSeenPath
    ),
    executeTest(
      "NavigationAgent再計画許可",
      testNavigationAgentReplanPermission
    ),
    executeTest(
      "NPC actorSpheres遅延Frame View",
      testNpcActorSpheresAreBuiltLazilyOncePerFrameView
    ),
    executeTest(
      "NPC Frame View一括再構築回数",
      testNpcFrameViewBuildsOncePerBulkChange
    ),
    executeTest("NPC 0件更新", testZeroNpcUpdate),
    executeTest(
      "NPC公平再計画予算・frame view",
      testNpcFairReplanBudgetAndFrameView
    )
  ]);
