import {
  Color3,
  Mesh,
  MeshBuilder,
  NullEngine,
  Ray,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  V2_NORMAL_BEAM_MAX_BODY_LENGTH,
  castV2BeamSegment,
  castV2SightSegment,
  createV2BeamSystem
} from "../../../src/v2/beamCollision";
import type {
  V2BeamTargetPolicy,
  V2CharacterState,
  V2HumanKind,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import { createStageSpatialQueries } from "../../../src/world/stageSpatialQueries";
import type { StageSpatialQueryDiagnostics } from "../../../src/world/stageSpatialQueries";

export type BeamCombatTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type WallDefinition = Readonly<{
  id: string;
  center: Vector3;
  size: Vector3;
}>;

type BeamFixture = Readonly<{
  scene: Scene;
  stage: StageSpatialContext;
  blockers: readonly Mesh[];
  dispose(): void;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): BeamCombatTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const approximately = (
  actual: number,
  expected: number,
  tolerance: number
) => Math.abs(actual - expected) <= tolerance;

const createHuman = (
  id: string,
  kind: V2HumanKind,
  center: Vector3,
  radii: Vector3,
  state: V2CharacterState,
  alive: boolean,
  brainwashed: boolean
): V2HumanTargetSnapshot =>
  Object.freeze({
    id,
    kind,
    footPosition: center.subtract(new Vector3(0, radii.y, 0)),
    aimPosition: center.clone(),
    hitShape: Object.freeze({
      center: center.clone(),
      radii: radii.clone()
    }),
    state,
    alive,
    brainwashed
  });

const createAliveHumansPolicy = (): V2BeamTargetPolicy =>
  Object.freeze({ kind: "alive-humans" });

const createExecutionPolicy = (
  kind: "execution-assigned" | "execution-manual",
  targetIds: readonly string[]
): V2BeamTargetPolicy =>
  Object.freeze({
    kind,
    targetIds
  });

const createBeamFixture = (
  wallDefinitions: readonly WallDefinition[],
  diagnostics?: StageSpatialQueryDiagnostics
): BeamFixture => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const blockers = wallDefinitions.map((definition) => {
    const blocker = MeshBuilder.CreateBox(
      definition.id,
      {
        width: definition.size.x,
        height: definition.size.y,
        depth: definition.size.z
      },
      scene
    );
    blocker.position.copyFrom(definition.center);
    blocker.computeWorldMatrix(true);
    return blocker;
  });
  const movementColliders = Object.freeze({
    player: Object.freeze([...blockers]),
    npc: Object.freeze([...blockers]),
    bit: Object.freeze([...blockers])
  });
  const queries = createStageSpatialQueries(scene, {
    movementColliders,
    groundColliders: blockers,
    beamBlockers: blockers,
    sightBlockers: blockers,
    volumes: [],
    diagnostics
  });
  const stage = Object.freeze({
    resources: Object.freeze({
      beamBlockers: Object.freeze([...blockers]),
      sightBlockers: Object.freeze([...blockers])
    }),
    queries
  }) as unknown as StageSpatialContext;

  let disposed = false;
  return Object.freeze({
    scene,
    stage,
    blockers: Object.freeze(blockers),
    dispose: () => {
      if (disposed) {
        throw new Error("BeamFixtureは破棄済みです");
      }
      queries.dispose();
      scene.dispose();
      engine.dispose();
      disposed = true;
    }
  });
};

export const runBeamCombatTests =
  (): readonly BeamCombatTestResult[] => {
    const results: BeamCombatTestResult[] = [];

    results.push(
      executeTest("楕円体を単位球へscaleして最初の交差位置を返す", () => {
        const fixture = createBeamFixture([]);
        try {
          const target = createHuman(
            "ellipsoid-target",
            "npc",
            new Vector3(1, 0, 0),
            new Vector3(0.2, 0.8, 0.2),
            "normal",
            true,
            false
          );
          const hit = castV2BeamSegment(
            fixture.stage,
            new Vector3(0, 0.4, 0),
            new Vector3(2, 0.4, 0),
            [target],
            "beam-source",
            createAliveHumansPolicy()
          );
          const miss = castV2BeamSegment(
            fixture.stage,
            new Vector3(0, 0, 0.3),
            new Vector3(2, 0, 0.3),
            [target],
            "beam-source",
            createAliveHumansPolicy()
          );
          const expectedX = 1 - 0.2 * Math.sqrt(1 - (0.4 / 0.8) ** 2);
          return {
            ok:
              hit?.kind === "actor" &&
              hit.actor.id === target.id &&
              approximately(hit.point.x, expectedX, 1e-6) &&
              miss === null,
            detail:
              `hit=${hit?.kind ?? "none"} / ` +
              `x=${hit?.point.x.toFixed(6) ?? "--"} / ` +
              `expected=${expectedX.toFixed(6)} / miss=${miss?.kind ?? "none"}`
          };
        } finally {
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("壁と人間の最近傍を比較し同距離では壁を優先する", () => {
        const fixture = createBeamFixture([
          Object.freeze({
            id: "beam-wall",
            center: new Vector3(2, 0, 0),
            size: new Vector3(0.2, 4, 4)
          })
        ]);
        try {
          const actorBeforeWall = createHuman(
            "actor-before-wall",
            "npc",
            new Vector3(1, 0, 0),
            new Vector3(0.2, 0.5, 0.2),
            "normal",
            true,
            false
          );
          const actorAfterWall = createHuman(
            "actor-after-wall",
            "npc",
            new Vector3(3, 0, 0),
            new Vector3(0.2, 0.5, 0.2),
            "normal",
            true,
            false
          );
          const actorAtEqualDistance = createHuman(
            "actor-equal-wall",
            "npc",
            new Vector3(2.2, 0, 0),
            new Vector3(0.3, 0.5, 0.3),
            "normal",
            true,
            false
          );
          const from = Vector3.Zero();
          const to = new Vector3(4, 0, 0);
          const actorFirst = castV2BeamSegment(
            fixture.stage,
            from,
            to,
            [actorBeforeWall],
            "beam-source",
            createAliveHumansPolicy()
          );
          const wallFirst = castV2BeamSegment(
            fixture.stage,
            from,
            to,
            [actorAfterWall],
            "beam-source",
            createAliveHumansPolicy()
          );
          const equalDistance = castV2BeamSegment(
            fixture.stage,
            from,
            to,
            [actorAtEqualDistance],
            "beam-source",
            createAliveHumansPolicy()
          );
          return {
            ok:
              actorFirst?.kind === "actor" &&
              actorFirst.actor.id === actorBeforeWall.id &&
              wallFirst?.kind === "blocker" &&
              wallFirst.mesh === fixture.blockers[0] &&
              equalDistance?.kind === "blocker" &&
              equalDistance.mesh === fixture.blockers[0],
            detail:
              `before=${actorFirst?.kind ?? "none"} / ` +
              `after=${wallFirst?.kind ?? "none"} / ` +
              `equal=${equalDistance?.kind ?? "none"}`
          };
        } finally {
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("source・非生存者・policy対象外・bitを標的にしない", () => {
        const fixture = createBeamFixture([]);
        try {
          const source = createHuman(
            "source",
            "player",
            new Vector3(0.4, 0, 0),
            new Vector3(0.1, 0.4, 0.1),
            "normal",
            true,
            false
          );
          const dead = createHuman(
            "dead",
            "npc",
            new Vector3(0.8, 0, 0),
            new Vector3(0.1, 0.4, 0.1),
            "hit-a",
            false,
            false
          );
          const unassigned = createHuman(
            "unassigned",
            "npc",
            new Vector3(1.2, 0, 0),
            new Vector3(0.1, 0.4, 0.1),
            "normal",
            true,
            false
          );
          const assigned = createHuman(
            "assigned",
            "npc",
            new Vector3(1.6, 0, 0),
            new Vector3(0.1, 0.4, 0.1),
            "normal",
            true,
            false
          );
          const manual = createHuman(
            "manual",
            "npc",
            new Vector3(2, 0, 0),
            new Vector3(0.1, 0.4, 0.1),
            "normal",
            true,
            false
          );
          const targets = [source, dead, unassigned, assigned, manual];
          const from = Vector3.Zero();
          const to = new Vector3(3, 0, 0);
          const aliveHit = castV2BeamSegment(
            fixture.stage,
            from,
            to,
            targets,
            source.id,
            createAliveHumansPolicy()
          );
          const assignedHit = castV2BeamSegment(
            fixture.stage,
            from,
            to,
            targets,
            source.id,
            createExecutionPolicy("execution-assigned", [assigned.id])
          );
          const manualHit = castV2BeamSegment(
            fixture.stage,
            from,
            to,
            targets,
            source.id,
            createExecutionPolicy("execution-manual", [manual.id])
          );
          const bitLikeTarget = Object.freeze({
            ...unassigned,
            id: "bit-target",
            kind: "bit"
          }) as unknown as V2HumanTargetSnapshot;
          let bitRejected = false;
          let duplicatePolicyRejected = false;
          try {
            castV2BeamSegment(
              fixture.stage,
              from,
              to,
              [bitLikeTarget],
              source.id,
              createAliveHumansPolicy()
            );
          } catch {
            bitRejected = true;
          }
          try {
            castV2BeamSegment(
              fixture.stage,
              from,
              to,
              targets,
              source.id,
              createExecutionPolicy("execution-assigned", [
                assigned.id,
                assigned.id
              ])
            );
          } catch {
            duplicatePolicyRejected = true;
          }
          return {
            ok:
              aliveHit?.kind === "actor" &&
              aliveHit.actor.id === unassigned.id &&
              assignedHit?.kind === "actor" &&
              assignedHit.actor.id === assigned.id &&
              manualHit?.kind === "actor" &&
              manualHit.actor.id === manual.id &&
              bitRejected &&
              duplicatePolicyRejected,
            detail:
              `alive=${aliveHit?.kind === "actor" ? aliveHit.actor.id : "none"} / ` +
              `assigned=${assignedHit?.kind === "actor" ? assignedHit.actor.id : "none"} / ` +
              `manual=${manualHit?.kind === "actor" ? manualHit.actor.id : "none"} / ` +
              `bit=${bitRejected} / duplicate=${duplicatePolicyRejected}`
          };
        } finally {
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("高速移動で命中しprovenanceを保持して1回だけimpactを発行する", () => {
        const fixture = createBeamFixture([]);
        const target = createHuman(
          "fast-target",
          "npc",
          new Vector3(2, 0, 0),
          new Vector3(0.2, 0.5, 0.2),
          "normal",
          true,
          false
        );
        const mutableTargetIds = [target.id];
        const fixtureMeshCount = fixture.scene.meshes.length;
        const fixtureMaterialCount = fixture.scene.materials.length;
        const system = createV2BeamSystem({
          scene: fixture.scene,
          stage: fixture.stage,
          getHumanTargets: () => [target],
          visual: Object.freeze({
            diameter: 0.04,
            color: new Color3(1, 0.2, 0.6),
            alpha: 0.9
          })
        });
        try {
          const beamId = system.spawn({
            sourceId: "bit-fast",
            originKind: "bit-fixed",
            targetPolicy: createExecutionPolicy(
              "execution-assigned",
              mutableTargetIds
            ),
            origin: Vector3.Zero(),
            direction: Vector3.Right(),
            speed: 100,
            maximumLifetime: 2
          });
          mutableTargetIds[0] = "mutated-after-spawn";
          const impactFrame = system.update(0.05);
          const impact = impactFrame.impacts[0];
          const impactSnapshot = system.getActiveBeams()[0];
          const retractFrame = system.update(0.001);
          const retractSnapshot = system.getActiveBeams()[0];
          const completedFrame = system.update(0.01);
          const impactPolicyIds =
            impact?.targetPolicy.kind === "execution-assigned"
              ? impact.targetPolicy.targetIds
              : [];
          const releasedBeforeClear = system.getVisualPoolSnapshot();
          system.clear();
          const clearedPool = system.getVisualPoolSnapshot();
          const clearReturnedAll =
            releasedBeforeClear.body.inUse === 0 &&
            releasedBeforeClear.tip.inUse === 0 &&
            clearedPool.body.inUse === 0 &&
            clearedPool.tip.inUse === 0 &&
            clearedPool.impact.inUse === 0;
          system.dispose();
          const resourcesDisposed =
            fixture.scene.meshes.length === fixtureMeshCount &&
            fixture.scene.materials.length === fixtureMaterialCount;
          return {
            ok:
              beamId === impact?.beamId &&
              impact.originKind === "bit-fixed" &&
              impactPolicyIds.length === 1 &&
              impactPolicyIds[0] === target.id &&
              impact.hit.kind === "actor" &&
              impact.hit.actor.id === target.id &&
              impactSnapshot.phase === "retracting" &&
              approximately(
                impactSnapshot.bodyLength,
                V2_NORMAL_BEAM_MAX_BODY_LENGTH,
                1e-6
              ) &&
              approximately(impactSnapshot.velocity.length(), 0, 1e-9) &&
              retractFrame.impacts.length === 0 &&
              retractSnapshot.bodyLength < impactSnapshot.bodyLength &&
              completedFrame.impacts.length === 0 &&
              system.activeCount === 0 &&
              clearReturnedAll &&
              resourcesDisposed,
            detail:
              `impact=${impactFrame.impacts.length} / ` +
              `phase=${impactSnapshot?.phase ?? "--"} / ` +
              `length=${impactSnapshot?.bodyLength.toFixed(3) ?? "--"}->` +
              `${retractSnapshot?.bodyLength.toFixed(3) ?? "--"} / ` +
              `active=${system.activeCount} / ` +
              `pool=${clearedPool.body.capacity}:${clearedPool.tip.capacity} / ` +
              `disposed=${resourcesDisposed}`
          };
        } finally {
          system.dispose();
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("壁命中で先端固定・光球生成後も再衝突せずclearで破棄する", () => {
        const fixture = createBeamFixture([
          Object.freeze({
            id: "impact-wall",
            center: new Vector3(2, 0, 0),
            size: new Vector3(0.2, 4, 4)
          })
        ]);
        const fixtureMeshCount = fixture.scene.meshes.length;
        const system = createV2BeamSystem({
          scene: fixture.scene,
          stage: fixture.stage,
          getHumanTargets: () => [],
          visual: Object.freeze({
            diameter: 0.04,
            color: new Color3(0.2, 0.8, 1),
            alpha: 1
          })
        });
        try {
          const baselineMeshes = fixture.scene.meshes.length;
          system.spawn({
            sourceId: "npc-wall",
            originKind: "npc-gun",
            targetPolicy: createAliveHumansPolicy(),
            origin: Vector3.Zero(),
            direction: Vector3.Right(),
            speed: 100,
            maximumLifetime: 2
          });
          const impactFrame = system.update(0.1);
          const impactPosition = system.getActiveBeams()[0].position.clone();
          const meshCountWithImpact =
            fixture.scene.meshes.length - baselineMeshes;
          const retractFrame = system.update(0.01);
          const activeAfterRetraction = system.activeCount;
          const poolBeforeClear = system.getVisualPoolSnapshot();
          const impactVisualRemains =
            poolBeforeClear.body.inUse === 0 &&
            poolBeforeClear.tip.inUse === 0 &&
            poolBeforeClear.impact.inUse === 1;
          system.clear();
          const poolAfterClear = system.getVisualPoolSnapshot();
          const resourcesCleared =
            poolAfterClear.body.inUse === 0 &&
            poolAfterClear.tip.inUse === 0 &&
            poolAfterClear.impact.inUse === 0;
          const pooledMeshCount = fixture.scene.meshes.length;
          system.spawn({
            sourceId: "npc-wall-reuse",
            originKind: "npc-gun",
            targetPolicy: createAliveHumansPolicy(),
            origin: Vector3.Zero(),
            direction: Vector3.Right(),
            speed: 100,
            maximumLifetime: 2
          });
          const reuseImpactFrame = system.update(0.1);
          const reusedPool = system.getVisualPoolSnapshot();
          const resourcesReused =
            reuseImpactFrame.impacts.length === 1 &&
            reusedPool.body.capacity === poolAfterClear.body.capacity &&
            reusedPool.tip.capacity === poolAfterClear.tip.capacity &&
            reusedPool.impact.capacity === poolAfterClear.impact.capacity &&
            fixture.scene.meshes.length === pooledMeshCount;
          system.clear();
          system.dispose();
          const resourcesDisposed =
            fixture.scene.meshes.length === fixtureMeshCount &&
            !fixture.scene.materials.some(
              (item) => item.name === "v2NormalBeamMaterial"
            );
          return {
            ok:
              impactFrame.impacts.length === 1 &&
              impactFrame.impacts[0].hit.kind === "blocker" &&
              approximately(impactPosition.x, 1.9, 1e-6) &&
              meshCountWithImpact === 3 &&
              retractFrame.impacts.length === 0 &&
              activeAfterRetraction === 0 &&
              impactVisualRemains &&
              resourcesCleared &&
              resourcesReused &&
              resourcesDisposed,
            detail:
              `impact=${impactFrame.impacts.length} / ` +
              `x=${impactPosition.x.toFixed(3)} / meshes=${meshCountWithImpact} / ` +
              `active=${activeAfterRetraction} / clear=${resourcesCleared} / ` +
              `reused=${resourcesReused} / disposed=${resourcesDisposed}`
          };
        } finally {
          system.dispose();
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("寿命終了イベント後に先端を固定して後端だけを引き戻す", () => {
        const fixture = createBeamFixture([]);
        const system = createV2BeamSystem({
          scene: fixture.scene,
          stage: fixture.stage,
          getHumanTargets: () => [],
          visual: Object.freeze({
            diameter: 0.025,
            color: new Color3(1, 0.16, 0.72),
            alpha: 0.95
          })
        });
        try {
          const beamId = system.spawn({
            sourceId: "expiration-source",
            originKind: "execution-player",
            targetPolicy: createExecutionPolicy("execution-manual", [
              "manual-target"
            ]),
            origin: Vector3.Zero(),
            direction: Vector3.Right(),
            speed: 4,
            maximumLifetime: 0.25
          });
          const expirationFrame = system.update(1);
          const expiration = expirationFrame.expirations[0];
          const expirationSnapshot = system.getActiveBeams()[0];
          const firstRetraction = system.update(0.1);
          const retractionSnapshot = system.getActiveBeams()[0];
          const completed = system.update(0.1);
          const expirationPolicyIds =
            expiration?.targetPolicy.kind === "execution-manual"
              ? expiration.targetPolicy.targetIds
              : [];
          return {
            ok:
              expirationFrame.impacts.length === 0 &&
              expirationFrame.expirations.length === 1 &&
              expiration.beamId === beamId &&
              expiration.originKind === "execution-player" &&
              expirationPolicyIds.length === 1 &&
              expirationPolicyIds[0] === "manual-target" &&
              approximately(expiration.position.x, 1, 1e-6) &&
              expirationSnapshot.phase === "retracting" &&
              approximately(expirationSnapshot.position.x, 1, 1e-6) &&
              firstRetraction.expirations.length === 0 &&
              approximately(retractionSnapshot.position.x, 1, 1e-6) &&
              retractionSnapshot.bodyLength <
                expirationSnapshot.bodyLength &&
              completed.expirations.length === 0 &&
              system.activeCount === 0,
            detail:
              `expiration=${expirationFrame.expirations.length} / ` +
              `x=${expiration?.position.x.toFixed(3) ?? "--"} / ` +
              `length=${expirationSnapshot?.bodyLength.toFixed(3) ?? "--"}->` +
              `${retractionSnapshot?.bodyLength.toFixed(3) ?? "--"} / ` +
              `active=${system.activeCount}`
          };
        } finally {
          system.dispose();
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("光線Poolは高水位まで拡張しclear後に再利用する", () => {
        const fixture = createBeamFixture([]);
        const fixtureMeshCount = fixture.scene.meshes.length;
        const fixtureMaterialCount = fixture.scene.materials.length;
        const system = createV2BeamSystem({
          scene: fixture.scene,
          stage: fixture.stage,
          getHumanTargets: () => [],
          visual: Object.freeze({
            diameter: 0.04,
            color: new Color3(1, 0.2, 0.6),
            alpha: 1
          })
        });
        const spawnBeam = (serial: number) =>
          system.spawn({
            sourceId: `pool-source-${serial}`,
            originKind: "bit-fixed",
            targetPolicy: createAliveHumansPolicy(),
            origin: new Vector3(serial, 0, 0),
            direction: Vector3.Right(),
            speed: 1,
            maximumLifetime: 10
          });
        try {
          const templatesPrepared =
            fixture.scene.meshes.length === fixtureMeshCount + 3 &&
            fixture.scene.materials.length === fixtureMaterialCount + 1;
          for (let serial = 0; serial < 3; serial += 1) {
            spawnBeam(serial);
          }
          const firstHighWater = system.getVisualPoolSnapshot();
          const firstMeshCount = fixture.scene.meshes.length;
          system.clear();
          const firstClear = system.getVisualPoolSnapshot();
          for (let serial = 0; serial < 2; serial += 1) {
            spawnBeam(10 + serial);
          }
          const reuseSnapshot = system.getVisualPoolSnapshot();
          const reusedWithoutGrowth =
            fixture.scene.meshes.length === firstMeshCount &&
            reuseSnapshot.body.capacity === 3 &&
            reuseSnapshot.tip.capacity === 3;
          system.clear();
          for (let serial = 0; serial < 5; serial += 1) {
            spawnBeam(20 + serial);
          }
          const expandedSnapshot = system.getVisualPoolSnapshot();
          system.clear();
          const expandedClear = system.getVisualPoolSnapshot();
          const expandedWithoutCap =
            expandedSnapshot.body.capacity === 5 &&
            expandedSnapshot.body.inUse === 5 &&
            expandedSnapshot.tip.capacity === 5 &&
            expandedSnapshot.tip.inUse === 5;
          const allReturned =
            firstClear.body.inUse === 0 &&
            firstClear.body.available === 3 &&
            firstClear.tip.inUse === 0 &&
            firstClear.tip.available === 3 &&
            expandedClear.body.inUse === 0 &&
            expandedClear.body.available === 5 &&
            expandedClear.tip.inUse === 0 &&
            expandedClear.tip.available === 5 &&
            system.activeCount === 0;
          system.dispose();
          const resourcesDisposed =
            fixture.scene.meshes.length === fixtureMeshCount &&
            fixture.scene.materials.length === fixtureMaterialCount;
          return {
            ok:
              templatesPrepared &&
              firstHighWater.body.capacity === 3 &&
              firstHighWater.body.inUse === 3 &&
              firstHighWater.tip.capacity === 3 &&
              firstHighWater.tip.inUse === 3 &&
              reusedWithoutGrowth &&
              expandedWithoutCap &&
              allReturned &&
              resourcesDisposed,
            detail:
              `prepared=${templatesPrepared} / ` +
              `highWater=${firstHighWater.body.capacity}->` +
              `${expandedSnapshot.body.capacity} / ` +
              `reuse=${reusedWithoutGrowth} / returned=${allReturned} / ` +
              `disposed=${resourcesDisposed}`
          };
        } finally {
          system.dispose();
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("空間索引候補へ直接Ray判定しScene全体pickを呼ばない", () => {
        const rayDiagnostics: Array<
          Readonly<{
            kind: string;
            candidateMeshCount: number;
            directIntersectionCount: number;
          }>
        > = [];
        const triangleDiagnostics: Array<
          Readonly<{
            kind: string;
            indexedTriangleCount: number;
            exactTriangleTestCount: number;
          }>
        > = [];
        const fixture = createBeamFixture(
          [
            Object.freeze({
              id: "direct-ray-lower-floor",
              center: new Vector3(0, -1.1, 0),
              size: new Vector3(8, 0.2, 8)
            }),
            Object.freeze({
              id: "direct-ray-floor",
              center: new Vector3(0, -0.1, 0),
              size: new Vector3(8, 0.2, 8)
            }),
            Object.freeze({
              id: "direct-ray-far-wall",
              center: new Vector3(3, 1, 0),
              size: new Vector3(0.2, 2, 2)
            }),
            Object.freeze({
              id: "direct-ray-wall",
              center: new Vector3(2, 1, 0),
              size: new Vector3(0.2, 2, 2)
            }),
            Object.freeze({
              id: "direct-ray-coarse-cell-miss",
              center: new Vector3(1, 1.6, 0),
              size: new Vector3(0.2, 0.2, 0.2)
            })
          ],
          {
            recordRayQuery: (
              kind,
              candidateMeshCount,
              directIntersectionCount
            ) => {
              rayDiagnostics.push({
                kind,
                candidateMeshCount,
                directIntersectionCount
              });
            },
            recordRayTriangleQuery: (
              kind,
              indexedTriangleCount,
              exactTriangleTestCount
            ) => {
              triangleDiagnostics.push({
                kind,
                indexedTriangleCount,
                exactTriangleTestCount
              });
            }
          }
        );
        try {
          fixture.scene.pickWithRay = () => {
            throw new Error("Scene.pickWithRayを呼び出しました");
          };
          fixture.scene.multiPickWithRay = () => {
            throw new Error("Scene.multiPickWithRayを呼び出しました");
          };
          const from = new Vector3(0, 1, 0);
          const to = new Vector3(4, 1, 0);
          const beamHit = fixture.stage.queries.castBeamSegment(from, to);
          const sightHit = castV2SightSegment(fixture.stage, from, to);
          const movementHit = fixture.stage.queries.castMovementSegment(
            "npc",
            from,
            to
          );
          const groundHit = fixture.stage.queries.sampleGround(
            new Vector3(0, 2, 0),
            4
          );
          const diagnosticKinds = rayDiagnostics
            .map(({ kind }) => kind)
            .join("|");
          const diagnosticsMatch =
            diagnosticKinds === "beam|sight|movement|ground" &&
            rayDiagnostics.length === 4 &&
            rayDiagnostics.every(
              (
                { candidateMeshCount, directIntersectionCount },
                index
              ) =>
                candidateMeshCount === 2 &&
                directIntersectionCount === 0
            ) &&
            triangleDiagnostics.length === 4 &&
            triangleDiagnostics
              .map(({ kind }) => kind)
              .join("|") === diagnosticKinds &&
            triangleDiagnostics.every(
              ({ indexedTriangleCount, exactTriangleTestCount }) =>
                indexedTriangleCount > 0 &&
                indexedTriangleCount < 60 &&
                exactTriangleTestCount > 0 &&
                exactTriangleTestCount <= indexedTriangleCount
            );
          return {
            ok:
              beamHit?.mesh.name === "direct-ray-wall" &&
              sightHit.occluded &&
              sightHit.mesh.name === "direct-ray-wall" &&
              movementHit?.mesh.name === "direct-ray-wall" &&
              approximately(beamHit.distance, 1.9, 1e-6) &&
              approximately(sightHit.distance, 1.9, 1e-6) &&
              groundHit?.mesh.name === "direct-ray-floor" &&
              approximately(groundHit.point.y, 0, 1e-6) &&
              groundHit.normal.y > 0 &&
              diagnosticsMatch,
            detail:
              `beam=${beamHit?.mesh.name ?? "none"}:` +
              `${beamHit?.distance.toFixed(3) ?? "--"} / ` +
              `sight=${sightHit.mesh?.name ?? "none"}:` +
              `${sightHit.distance?.toFixed(3) ?? "--"} / ` +
              `ground=${groundHit?.mesh.name ?? "none"}:` +
              `${groundHit?.point.y.toFixed(3) ?? "--"} / ` +
              `diagnostics=${diagnosticKinds} / counts=` +
              rayDiagnostics
                .map(
                  ({ candidateMeshCount, directIntersectionCount }) =>
                    `${candidateMeshCount}:${directIntersectionCount}`
                )
                .join("|") +
              ` / triangles=` +
              triangleDiagnostics
                .map(
                  ({ indexedTriangleCount, exactTriangleTestCount }) =>
                    `${indexedTriangleCount}:${exactTriangleTestCount}`
                )
                .join("|")
          };
        } finally {
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("直接Rayは旧pickと壁・床・天井・開閉窓の結果が一致", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const floor = MeshBuilder.CreateBox(
          "legacy-floor",
          { width: 6, height: 0.2, depth: 6 },
          scene
        );
        floor.position.y = -0.1;
        const ceiling = MeshBuilder.CreateBox(
          "legacy-ceiling",
          { width: 6, height: 0.2, depth: 6 },
          scene
        );
        ceiling.position.y = 2.1;
        const openWindow = MeshBuilder.CreateBox(
          "legacy-open-window",
          { width: 0.2, height: 2, depth: 2 },
          scene
        );
        openWindow.position.set(1.5, 1, 0);
        const wall = MeshBuilder.CreateBox(
          "legacy-wall",
          { width: 0.2, height: 2, depth: 4 },
          scene
        );
        wall.position.set(3, 1, 0);
        const staircaseSlope = MeshBuilder.CreateBox(
          "legacy-staircase-slope",
          { width: 2, height: 0.2, depth: 2 },
          scene
        );
        staircaseSlope.position.set(-2, 0.5, 0);
        staircaseSlope.rotation.z = Math.PI / 6;
        staircaseSlope.scaling.z = 0.75;
        const movementColliders = Object.freeze([
          floor,
          ceiling,
          openWindow,
          wall,
          staircaseSlope
        ]);
        const rayBlockers = Object.freeze([floor, ceiling, wall]);
        for (const mesh of movementColliders) {
          mesh.computeWorldMatrix(true);
        }
        const queries = createStageSpatialQueries(scene, {
          movementColliders: Object.freeze({
            player: movementColliders,
            npc: movementColliders,
            bit: movementColliders
          }),
          groundColliders: Object.freeze([floor]),
          beamBlockers: rayBlockers,
          sightBlockers: rayBlockers,
          volumes: []
        });
        const legacyPick = (
          from: Vector3,
          to: Vector3,
          allowedMeshes: ReadonlySet<Mesh>
        ) => {
          const distance = Vector3.Distance(from, to);
          const ray = new Ray(
            from,
            to.subtract(from).scaleInPlace(1 / distance),
            distance
          );
          return scene.pickWithRay(
            ray,
            (mesh) => mesh instanceof Mesh && allowedMeshes.has(mesh),
            false
          );
        };
        const matchesLegacyPick = (
          hit: ReturnType<typeof queries.castBeamSegment>,
          pick: ReturnType<typeof legacyPick>
        ) => {
          if (
            !hit ||
            !pick?.hit ||
            pick.pickedMesh !== hit.mesh ||
            !pick.pickedPoint
          ) {
            return false;
          }
          const legacyNormal = pick.getNormal(true, true);
          return Boolean(
            legacyNormal &&
              approximately(hit.distance, pick.distance, 1e-6) &&
              Vector3.Distance(hit.point, pick.pickedPoint) <= 1e-6 &&
              Vector3.Distance(hit.normal, legacyNormal) <= 1e-6
          );
        };
        try {
          const movementSet = new Set(movementColliders);
          const blockerSet = new Set(rayBlockers);
          const floorSet = new Set([floor]);
          const wallFrom = new Vector3(0, 1, 1);
          const wallTo = new Vector3(5, 1, 1);
          const ceilingFrom = new Vector3(0, 1, 1);
          const ceilingTo = new Vector3(0, 3, 1);
          const floorFrom = new Vector3(0, 1, 1);
          const floorTo = new Vector3(0, -1, 1);
          const windowFrom = new Vector3(0, 1, 0);
          const windowTo = new Vector3(5, 1, 0);
          const staircaseFrom = new Vector3(-2, 2, 0);
          const staircaseTo = new Vector3(-2, -1, 0);
          const insideWallFrom = new Vector3(3, 1, 0);
          const insideWallTo = new Vector3(5, 1, 0);
          const wallSurfaceFrom = new Vector3(2.9, 1, 0);
          const wallSurfaceTo = new Vector3(5, 1, 0);
          const wallHit = queries.castMovementSegment(
            "npc",
            wallFrom,
            wallTo
          );
          const ceilingHit = queries.castMovementSegment(
            "npc",
            ceilingFrom,
            ceilingTo
          );
          const floorHit = queries.sampleGround(floorFrom, 2);
          const beamHit = queries.castBeamSegment(windowFrom, windowTo);
          const sightHit = queries.castSightSegment(windowFrom, windowTo);
          const staircaseHit = queries.castMovementSegment(
            "npc",
            staircaseFrom,
            staircaseTo
          );
          const insideWallHit = queries.castMovementSegment(
            "npc",
            insideWallFrom,
            insideWallTo
          );
          const wallSurfaceHit = queries.castMovementSegment(
            "npc",
            wallSurfaceFrom,
            wallSurfaceTo
          );
          const wallMatches = matchesLegacyPick(
            wallHit,
            legacyPick(wallFrom, wallTo, movementSet)
          );
          const ceilingMatches = matchesLegacyPick(
            ceilingHit,
            legacyPick(ceilingFrom, ceilingTo, movementSet)
          );
          const floorMatches = matchesLegacyPick(
            floorHit,
            legacyPick(floorFrom, floorTo, floorSet)
          );
          const beamMatches = matchesLegacyPick(
            beamHit,
            legacyPick(windowFrom, windowTo, blockerSet)
          );
          const sightMatches = matchesLegacyPick(
            sightHit,
            legacyPick(windowFrom, windowTo, blockerSet)
          );
          const staircaseMatches = matchesLegacyPick(
            staircaseHit,
            legacyPick(
              staircaseFrom,
              staircaseTo,
              movementSet
            )
          );
          const insideWallMatches = matchesLegacyPick(
            insideWallHit,
            legacyPick(
              insideWallFrom,
              insideWallTo,
              movementSet
            )
          );
          const wallSurfaceMatches = matchesLegacyPick(
            wallSurfaceHit,
            legacyPick(
              wallSurfaceFrom,
              wallSurfaceTo,
              movementSet
            )
          );
          return {
            ok:
              wallMatches &&
              ceilingMatches &&
              floorMatches &&
              beamMatches &&
              sightMatches &&
              staircaseMatches &&
              insideWallMatches &&
              wallSurfaceMatches &&
              beamHit?.mesh === wall &&
              sightHit?.mesh === wall,
            detail:
              `wall=${wallMatches} / ceiling=${ceilingMatches} / ` +
              `floor=${floorMatches} / openWindowBeam=${beamMatches} / ` +
              `openWindowSight=${sightMatches} / ` +
              `staircase=${staircaseMatches} / ` +
              `inside=${insideWallMatches} / surface=${wallSurfaceMatches}`
          };
        } finally {
          queries.dispose();
          scene.dispose();
          engine.dispose();
        }
      })
    );

    results.push(
      executeTest("直接Rayの両面命中法線は旧pick同様に入射側を向く", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const blocker = MeshBuilder.CreatePlane(
          "double-sided-normal-blocker",
          {
            size: 2,
            sideOrientation: Mesh.DOUBLESIDE
          },
          scene
        );
        blocker.computeWorldMatrix(true);
        const blockers = Object.freeze([blocker]);
        const queries = createStageSpatialQueries(scene, {
          movementColliders: Object.freeze({
            player: blockers,
            npc: blockers,
            bit: blockers
          }),
          groundColliders: blockers,
          beamBlockers: blockers,
          sightBlockers: blockers,
          volumes: []
        });
        try {
          const positiveToNegativeDirection = new Vector3(0, 0, -1);
          const negativeToPositiveDirection = new Vector3(0, 0, 1);
          const positiveToNegative = queries.castBeamSegment(
            new Vector3(0, 0, 1),
            new Vector3(0, 0, -1)
          );
          const negativeToPositive = queries.castBeamSegment(
            new Vector3(0, 0, -1),
            new Vector3(0, 0, 1)
          );
          const firstDot = positiveToNegative
            ? Vector3.Dot(
                positiveToNegative.normal,
                positiveToNegativeDirection
              )
            : Number.POSITIVE_INFINITY;
          const secondDot = negativeToPositive
            ? Vector3.Dot(
                negativeToPositive.normal,
                negativeToPositiveDirection
              )
            : Number.POSITIVE_INFINITY;
          return {
            ok:
              positiveToNegative?.mesh === blocker &&
              negativeToPositive?.mesh === blocker &&
              firstDot < 0 &&
              secondDot < 0,
            detail:
              `positiveToNegative=${firstDot.toFixed(3)} / ` +
              `negativeToPositive=${secondDot.toFixed(3)}`
          };
        } finally {
          queries.dispose();
          scene.dispose();
          engine.dispose();
        }
      })
    );

    results.push(
      executeTest("直接Rayの同距離命中は旧pick同様にScene登録順を優先", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const firstInScene = MeshBuilder.CreateBox(
          "same-distance-first-in-scene",
          { size: 2 },
          scene
        );
        const secondInScene = MeshBuilder.CreateBox(
          "same-distance-second-in-scene",
          { size: 2 },
          scene
        );
        firstInScene.position.x = 2;
        secondInScene.position.x = 2;
        firstInScene.computeWorldMatrix(true);
        secondInScene.computeWorldMatrix(true);
        const reverseOptionOrder = Object.freeze([
          secondInScene,
          firstInScene
        ]);
        const queries = createStageSpatialQueries(scene, {
          movementColliders: Object.freeze({
            player: reverseOptionOrder,
            npc: reverseOptionOrder,
            bit: reverseOptionOrder
          }),
          groundColliders: reverseOptionOrder,
          beamBlockers: reverseOptionOrder,
          sightBlockers: reverseOptionOrder,
          volumes: []
        });
        try {
          const hit = queries.castMovementSegment(
            "npc",
            Vector3.Zero(),
            new Vector3(4, 0, 0)
          );
          return {
            ok: hit?.mesh === firstInScene,
            detail: hit?.mesh.name ?? "none"
          };
        } finally {
          queries.dispose();
          scene.dispose();
          engine.dispose();
        }
      })
    );

    results.push(
      executeTest("開始点包含は空間索引とAABBで絞ってから三角形を読む", () => {
        const fixture = createBeamFixture([
          Object.freeze({
            id: "far-blocker",
            center: new Vector3(100, 0, 0),
            size: new Vector3(2, 2, 2)
          }),
          Object.freeze({
            id: "containing-blocker",
            center: Vector3.Zero(),
            size: new Vector3(2, 2, 2)
          })
        ]);
        let containmentCandidates = -1;
        let triangulatedMeshes = -1;
        let system: ReturnType<typeof createV2BeamSystem> | null = null;
        try {
          const farBlocker = fixture.blockers[0];
          const originalGetVerticesData =
            farBlocker.getVerticesData.bind(farBlocker);
          let farGeometryRead = false;
          farBlocker.getVerticesData = (kind, copyWhenShared, forceCopy) => {
            farGeometryRead = true;
            return originalGetVerticesData(
              kind,
              copyWhenShared,
              forceCopy
            );
          };
          system = createV2BeamSystem({
            scene: fixture.scene,
            stage: fixture.stage,
            getHumanTargets: () => [],
            visual: Object.freeze({
              diameter: 0.04,
              color: new Color3(1, 0.2, 0.6),
              alpha: 1
            }),
            collisionDiagnostics: {
              recordStartContainment: (
                candidateMeshCount,
                triangulatedMeshCount
              ) => {
                containmentCandidates = candidateMeshCount;
                triangulatedMeshes = triangulatedMeshCount;
              }
            }
          });
          system.spawn({
            sourceId: "inside-source",
            originKind: "bit-fixed",
            targetPolicy: createAliveHumansPolicy(),
            origin: Vector3.Zero(),
            direction: Vector3.Right(),
            speed: 1,
            maximumLifetime: 1
          });
          const hit = system.update(0.1).impacts[0]?.hit ?? null;
          return {
            ok:
              hit?.kind === "blocker" &&
              hit.mesh.name === "containing-blocker" &&
              hit.startedInside &&
              hit.distance === 0 &&
              !farGeometryRead &&
              containmentCandidates === 1 &&
              triangulatedMeshes === 1,
            detail:
              `hit=${hit?.kind === "blocker" ? hit.mesh.name : "none"} / ` +
              `inside=${hit?.kind === "blocker" ? hit.startedInside : false} / ` +
              `farGeometryRead=${farGeometryRead} / ` +
              `diagnostics=${containmentCandidates}:${triangulatedMeshes}`
          };
        } finally {
          system?.dispose();
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("開始点包含はAABB面の外側ε以内でも旧判定と一致", () => {
        const fixture = createBeamFixture([
          Object.freeze({
            id: "surface-epsilon-blocker",
            center: new Vector3(3, 0, 0),
            size: new Vector3(2, 2, 2)
          })
        ]);
        const system = createV2BeamSystem({
          scene: fixture.scene,
          stage: fixture.stage,
          getHumanTargets: () => [],
          visual: Object.freeze({
            diameter: 0.04,
            color: new Color3(1, 0.2, 0.6),
            alpha: 1
          })
        });
        try {
          const origin = new Vector3(2 - 0.5e-6, 0, 0);
          system.spawn({
            sourceId: "surface-epsilon-source",
            originKind: "bit-fixed",
            targetPolicy: createAliveHumansPolicy(),
            origin,
            direction: Vector3.Left(),
            speed: 1,
            maximumLifetime: 1
          });
          const hit = system.update(0.1).impacts[0]?.hit ?? null;
          return {
            ok:
              hit?.kind === "blocker" &&
              hit.mesh.name === "surface-epsilon-blocker" &&
              hit.startedInside &&
              hit.distance === 0 &&
              hit.point.equals(origin),
            detail:
              `hit=${hit?.kind === "blocker" ? hit.mesh.name : "none"} / ` +
              `inside=${hit?.kind === "blocker" ? hit.startedInside : false} / ` +
              `distance=${hit?.distance ?? "none"}`
          };
        } finally {
          system.dispose();
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("ActiveBeamだけ開始点包含を初回区間に限定する", () => {
        const fixture = createBeamFixture([]);
        let beamBlockerReads = 0;
        let containmentDiagnosticCount = 0;
        const countingStage = {
          resources: {
            get beamBlockers() {
              beamBlockerReads += 1;
              return fixture.blockers;
            },
            sightBlockers: fixture.blockers
          },
          queries: fixture.stage.queries
        } as unknown as StageSpatialContext;
        const system = createV2BeamSystem({
          scene: fixture.scene,
          stage: countingStage,
          getHumanTargets: () => [],
          visual: Object.freeze({
            diameter: 0.04,
            color: new Color3(1, 0.2, 0.6),
            alpha: 1
          }),
          collisionDiagnostics: {
            recordStartContainment: () => {
              containmentDiagnosticCount += 1;
            }
          }
        });
        try {
          beamBlockerReads = 0;
          castV2BeamSegment(
            countingStage,
            Vector3.Zero(),
            Vector3.Right(),
            [],
            "one-shot-a",
            createAliveHumansPolicy()
          );
          castV2BeamSegment(
            countingStage,
            Vector3.Zero(),
            Vector3.Right(),
            [],
            "one-shot-b",
            createAliveHumansPolicy()
          );
          const oneShotReads = beamBlockerReads;
          beamBlockerReads = 0;
          system.spawn({
            sourceId: "active-beam-source",
            originKind: "bit-fixed",
            targetPolicy: createAliveHumansPolicy(),
            origin: Vector3.Zero(),
            direction: Vector3.Right(),
            speed: 1,
            maximumLifetime: 10
          });
          system.update(0.1);
          system.update(0.1);
          const activeBeamReads = beamBlockerReads;
          return {
            ok:
              oneShotReads === 2 &&
              activeBeamReads === 1 &&
              containmentDiagnosticCount === 1,
            detail:
              `oneShotReads=${oneShotReads} / ` +
              `activeBeamReads=${activeBeamReads} / ` +
              `diagnostics=${containmentDiagnosticCount}`
          };
        } finally {
          system.dispose();
          fixture.dispose();
        }
      })
    );

    return Object.freeze(results);
  };
