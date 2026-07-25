import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS,
  type V2AlarmTriggerEvent
} from "../../../src/v2/alarmSystem";
import {
  V2_HIT_FADE_DURATION_SECONDS,
  V2_HIT_FLICKER_DURATION_SECONDS
} from "../../../src/v2/characterStateSystem";
import {
  V2_NPC_CAPTURE_BREAKAWAY_SPEED,
  V2_NPC_CAPTURE_DURATION_SECONDS,
  V2_NPC_GUN_BEAM_MAXIMUM_LIFETIME_SECONDS,
  V2_NPC_GUN_BEAM_SPEED,
  createV2NpcSystem,
  type V2NpcSystem
} from "../../../src/v2/npcSystem";
import {
  isV2AliveState,
  isV2BrainwashState,
  type V2CharacterState,
  type V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import type { NavigationWorld } from "../../../src/world/navigationWorld";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";

export type NpcCombatTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type NpcFixture = Readonly<{
  system: V2NpcSystem;
  setSightBlocked(blocked: boolean): void;
  getSpriteAlpha(npcId: string): number;
  dispose(): void;
}>;

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
    values.push(...spawnCoordinates[index]);
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
  npcCount: 2 | 3,
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
        distance: surface.distance
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
    queries: Object.freeze({
      castMovementSegment: () => null,
      castMovementSphere: () => null,
      castBeamSegment: () => null,
      castSightSegment: () =>
        sightBlocked
          ? Object.freeze({
              point: Vector3.Zero(),
              normal: Vector3.Up(),
              distance: 0,
              mesh: ground
            })
          : null,
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
    random: createInitializationRandom(
      npcCount,
      initialBrainwashedNpcCount
    )
  });

  return Object.freeze({
    system,
    setSightBlocked: (blocked) => {
      sightBlocked = blocked;
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
    const snapshots = fixture.system.getTargetSnapshots();
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
    completedFixture.system.applyAlarmTargetEvents([
      createAlarmEvent("alarm-range", "player")
    ]);
    completedFixture.system.update(0, player);
    const firstTracking =
      completedFixture.system.getTrackingSnapshots();
    assert(
      firstTracking[0].targetId === "player" &&
        firstTracking[1].targetId === null &&
        firstTracking[2].targetId === null,
      "発火時のXZ半径またはgun/no-gun完成状態の受信選別が不正です。"
    );

    completedFixture.system.applyAlarmTargetEvents([
      createAlarmEvent(
        "alarm-no-gun",
        "player",
        new Vector3(
          V2_ALARM_INFLUENCE_RADIUS_WORLD_UNITS + 0.001,
          0,
          0
        )
      )
    ]);
    completedFixture.system.update(0, player);
    assert(
      completedFixture.system.getTrackingSnapshots()[1].targetId ===
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
    inProgressFixture.system.applyBeamImpact("npc_0", {
      sourceId: "bit_0",
      originKind: "bit-chase"
    });
    inProgressFixture.system.update(
      V2_HIT_FLICKER_DURATION_SECONDS +
        V2_HIT_FADE_DURATION_SECONDS,
      createPlayerTarget(new Vector3(50, 0, 50))
    );
    assert(
      inProgressFixture.system.getTargetSnapshots()[0].state ===
        "brainwash-in-progress",
      "受信除外テストのNPCがbrainwash-in-progressへ到達しません。"
    );
    inProgressFixture.system.applyAlarmTargetEvents([
      createAlarmEvent("alarm-in-progress", "player")
    ]);
    inProgressFixture.system.update(0, player);
    assert(
      inProgressFixture.system
        .getTrackingSnapshots()
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
    fixture.system.applyAlarmTargetEvents([
      createAlarmEvent("alarm-0", "player"),
      createAlarmEvent("alarm-0", "npc_2"),
      createAlarmEvent("alarm-1", "player")
    ]);
    fixture.system.update(0, alivePlayer);
    assert(
      fixture.system.getTrackingSnapshots()[0].targetId === "player",
      "alarm FIFO先頭が優先されません。"
    );

    fixture.setSightBlocked(true);
    fixture.system.update(1, alivePlayer);
    assert(
      fixture.system.drainBeamRequests().length === 0,
      "3D遮蔽中にNPC光線が発射されました。"
    );
    fixture.setSightBlocked(false);
    fixture.system.update(1, alivePlayer);
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

    fixture.system.update(30, alivePlayer);
    assert(
      fixture.system.getTrackingSnapshots()[0].targetId === "player",
      "Alarm FIFOが固定時間で失効しました。"
    );
    fixture.system.drainBeamRequests();
    const hitPlayer = createPlayerTarget(
      new Vector3(0, 0, 1),
      "hit-a"
    );
    fixture.system.update(0, hitPlayer);
    assert(
      fixture.system.getTrackingSnapshots()[0].targetId === "player",
      "Alarm FIFOがhit中の対象をbrainwash前に解除しました。"
    );

    const brainwashedPlayer = createPlayerTarget(
      new Vector3(0, 0, 1),
      "brainwash-in-progress"
    );
    fixture.system.update(0, brainwashedPlayer);
    const tracking = fixture.system.getTrackingSnapshots()[0];
    const npcTwo = fixture.system
      .getTargetSnapshots()
      .find((snapshot) => snapshot.id === "npc_2");
    assert(
      tracking.targetId === "npc_2" &&
        tracking.provenance === "alert",
      "非aliveのFIFO先頭がpruneされません。"
    );
    assert(npcTwo?.state === "evade", "脅威対象NPCがevadeへ遷移しません。");
    assert(
      fixture.system.getThreatenedTargetIds().includes("npc_2"),
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
    fixture.system.update(0, player);
    const capture = fixture.system.getCaptureSnapshots()[0];
    assert(
      capture?.npcId === "npc_1" &&
        capture.targetId === "player" &&
        capture.remainingSeconds === V2_NPC_CAPTURE_DURATION_SECONDS,
      "no-gun NPCが接触captureを開始しません。"
    );
    const threatIds = fixture.system.getThreatenedTargetIds();
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
    fixture.system.update(V2_NPC_CAPTURE_DURATION_SECONDS, player);
    assert(
      fixture.system.getCaptureSnapshots().length === 0,
      "20秒後にcaptureが解除されません。"
    );
    const releasePosition = fixture.system
      .getTargetSnapshots()
      .find((snapshot) => snapshot.id === "npc_1")!.footPosition;
    fixture.system.update(1, player);
    const breakawayPosition = fixture.system
      .getTargetSnapshots()
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
    fixture.system.applyAlarmTargetEvents([
      createAlarmEvent(
        "alarm-breakaway-cancel",
        "player",
        breakawayPosition
      )
    ]);
    fixture.system.update(0, distantPlayer);
    assert(
      fixture.system.getTrackingSnapshots()[1].targetId === "player",
      "非接触breakaway解除後にAlarm追跡へ復帰しません。"
    );
    fixture.system.update(1, distantPlayer);
    const alarmChasePosition = fixture.system
      .getTargetSnapshots()
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
    fixture.system.update(0, player);
    assert(
      fixture.system.getCaptureSnapshots()[0]?.npcId === "npc_1",
      "Alarm優先テストのcaptureが開始しません。"
    );
    fixture.system.drainAlertRequests();

    fixture.system.applyAlarmTargetEvents([
      createAlarmEvent("alarm-during-capture", "player")
    ]);
    assert(
      fixture.system.getCaptureSnapshots().length === 0,
      "Alarm受信時に既存captureを即中断できません。"
    );
    fixture.system.update(0, player);
    const tracking = fixture.system.getTrackingSnapshots()[1];
    assert(
      tracking.targetId === "player" &&
        tracking.provenance === "alert" &&
        fixture.system.getCaptureSnapshots().length === 0,
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
    fixture.system.update(0, player);
    assert(
      fixture.system.getCaptureSnapshots()[0]?.npcId === "npc_1",
      "命中解除テストのcaptureが開始しません。"
    );

    const beforeHit = fixture.system
      .getTargetSnapshots()
      .find((target) => target.id === "npc_1")!.footPosition;
    const hitPlayer = createPlayerTarget(Vector3.Zero(), "hit-a");
    fixture.system.update(1, hitPlayer);
    const afterHit = fixture.system
      .getTargetSnapshots()
      .find((target) => target.id === "npc_1")!.footPosition;
    const tracking = fixture.system.getTrackingSnapshots()[1];
    assert(
      fixture.system.getCaptureSnapshots().length === 0 &&
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
  fixture.system.update(0, distantPlayer);
  assert(
    fixture.system.getCaptureSnapshots().some(
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
      .getTargetSnapshots()
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      impactFixture.system.applyBeamImpact("npc_2", {
        sourceId: "bit_capture_release",
        originKind: "bit-chase"
      }),
      "capture対象NPCが光線命中を受理しません。"
    );
    assert(
      impactFixture.system.getCaptureSnapshots().length === 0 &&
        impactFixture.system.getTrackingSnapshots()[1].targetId ===
          null,
      "capture対象NPCの被弾時にcaptureと現在追跡を即解除できません。"
    );
    impactFixture.system.update(1, impactPlayer);
    const impactCapturerAfter = impactFixture.system
      .getTargetSnapshots()
      .find((target) => target.id === "npc_1")!.footPosition;
    assert(
      impactCapturerAfter.equals(impactCapturerBefore) &&
        impactFixture.system.getTrackingSnapshots()[1].targetId ===
          null,
      "対象NPC被弾後に不要な追跡またはbreakawayが開始されました。"
    );

    const visibilityPlayer =
      startNoGunCaptureOfNpc(visibilityFixture);
    const visibilityCapturerBefore = visibilityFixture.system
      .getTargetSnapshots()
      .find((target) => target.id === "npc_1")!.footPosition;
    visibilityFixture.system.setVisibleNpcIds([
      "npc_0",
      "npc_1"
    ]);
    assert(
      visibilityFixture.system.getCaptureSnapshots().length === 0 &&
        visibilityFixture.system.getTrackingSnapshots()[1].targetId ===
          null,
      "capture対象NPCの非表示化時にcaptureと追跡を即解除できません。"
    );
    visibilityFixture.system.update(1, visibilityPlayer);
    const visibilityCapturerAfter = visibilityFixture.system
      .getTargetSnapshots()
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
    const before = fixture.system.getTargetSnapshots()[0].footPosition;
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
      fixture.system.getTargetSnapshots()[0].footPosition.equals(before),
      "不正配置の検証中にNPC位置が部分適用されました。"
    );

    assert(
      fixture.system.applyBeamImpact("npc_0", {
        sourceId: "v2_bit_0",
        originKind: "bit-chase"
      }),
      "alive NPCが光線命中を受理しません。"
    );
    fixture.system.setAiSuspended(true);
    fixture.system.update(4, createPlayerTarget(new Vector3(4, 0, 4)));
    const after = fixture.system.getTargetSnapshots()[0];
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
    const snapshots = fixture.system.getTargetSnapshots();
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
      fixture.system.applyBeamImpact("npc_0", {
        sourceId: "bit_0",
        originKind: "bit-chase"
      }),
      "公開処刑観客用のhit状態を作れません。"
    );
    fixture.system.prepareExecutionAudience("npc_0");
    assert(
      fixture.system.getTargetSnapshots()[0].state ===
        "brainwash-complete-haigure-formation",
      "hit途中のNPC観客がformationへ正規化されません。"
    );
    fixture.system.prepareExecutionShooter("npc_0");
    assert(
      fixture.system.getTargetSnapshots()[0].state ===
        "brainwash-complete-gun",
      "NPC射手がgunへ正規化されません。"
    );
    assertThrows(
      () => fixture.system.prepareExecutionAudience("npc_1"),
      "alive NPCへの観客強制遷移が拒否されません。"
    );
    assertThrows(
      () => fixture.system.prepareExecutionShooter("npc_1"),
      "alive NPCへの射手強制遷移が拒否されません。"
    );

    fixture.system.applyBeamImpact("npc_1", {
      sourceId: "bit_1",
      originKind: "bit-fixed"
    });
    const player = createPlayerTarget(new Vector3(4, 0, 4));
    fixture.system.update(V2_HIT_FLICKER_DURATION_SECONDS, player);
    assert(
      fixture.getSpriteAlpha("npc_1") === 1,
      "fade開始時のNPC alphaが1ではありません。"
    );
    fixture.system.update(V2_HIT_FADE_DURATION_SECONDS * 0.5, player);
    assert(
      Math.abs(fixture.getSpriteAlpha("npc_1") - 0.5) < 0.000001,
      "fade中間時のNPC alphaが0.5ではありません。"
    );
    fixture.system.update(V2_HIT_FADE_DURATION_SECONDS * 0.5, player);
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
        .getTargetSnapshots()
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
      createPlayerTarget(new Vector3(4, 0, 4))
    );
    const after = new Map(
      fixture.system
        .getTargetSnapshots()
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
      fixture.system.getThreatenedTargetIds().includes("npc_0"),
      "外部脅威対象が脅威一覧へ統合されません。"
    );

    fixture.system.setExternalThreats([]);
    fixture.system.setPlayerBlockedTargetIds([]);
    fixture.system.update(
      0,
      createPlayerTarget(new Vector3(4, 0, 4))
    );
    assert(
      fixture.system
        .getTargetSnapshots()
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
      fixture.system.getTargetSnapshots().map(({ id }) => id).join("|") ===
        "npc_0" &&
        fixture.system.getActorSpheres().map(({ id }) => id).join("|") ===
          "npc_0" &&
        fixture.system.getTrackingSnapshots().map(({ npcId }) => npcId).join(
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
      fixture.system.getTargetSnapshots().length === 1,
      "不正な表示指定が部分適用されました。"
    );
    fixture.system.setVisibleNpcIds(["npc_0", "npc_1", "npc_2"]);
    assert(
      fixture.system.getTargetSnapshots().length === 3 &&
        fixture.system.getActorSpheres().length === 3,
      "NPC表示集合を復元できません。"
    );
    return "表示集合でsnapshot/衝突を制御、重複・未知IDは原子的にthrow";
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
    executeTest("NPC厳格表示集合", testStrictNpcVisibility)
  ]);
