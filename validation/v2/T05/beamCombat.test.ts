import {
  InstancedMesh,
  Material,
  Mesh,
  MeshBuilder,
  NullEngine,
  Ray,
  Scene,
  StandardMaterial,
  VertexBuffer,
  Vector3
} from "@babylonjs/core";

import {
  V2_NORMAL_BEAM_BACK_DIAMETER,
  V2_NORMAL_BEAM_BODY_DIAMETER,
  V2_NORMAL_BEAM_FRONT_DIAMETER,
  V2_NORMAL_BEAM_MAX_BODY_LENGTH,
  V2_NORMAL_BEAM_TIP_DIAMETER,
  V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS,
  castV2BeamSegment,
  castV2SightSegment,
  createV2BeamSystem
} from "../../../src/v2/beamCollision";
import type {
  V2BeamOriginKind,
  V2BeamTargetPolicy,
  V2CharacterState,
  V2HumanKind,
  V2HumanTargetSnapshot
} from "../../../src/v2/combatTypes";
import {
  V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR,
  V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH
} from "../../../src/v2/v2TransparentRenderingOrder";
import type { StageSpatialContext } from "../../../src/world/stageSpatialContext";
import type { StageSpatialQueryDiagnostics } from "../../../src/world/stageSpatialQueries";
import { createStageWorldBoundary } from "../../../src/world/stageWorldBoundary";
import { createDynamicStageSpatialQueryFixture } from "./stageSpatialQueryFixture";

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
  diagnostics?: StageSpatialQueryDiagnostics,
  worldBoundarySize: number | null = null
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
  const spatialFixture = createDynamicStageSpatialQueryFixture(
    scene,
    {
      movementColliders,
      groundColliders: blockers,
      beamBlockers: blockers,
      sightBlockers: blockers,
      bitObstacles: movementColliders.bit
    },
    {
      volumes: [],
      diagnostics
    }
  );
  const queries = spatialFixture.queries;
  const stageBoundaryMesh =
    worldBoundarySize === null
      ? null
      : MeshBuilder.CreateBox(
          "BND_Stage",
          { size: worldBoundarySize / 2 },
          scene
        );
  const worldBoundaryMesh =
    worldBoundarySize === null
      ? null
      : MeshBuilder.CreateBox(
          "BND_WorldLimit",
          { size: worldBoundarySize },
          scene
        );
  stageBoundaryMesh?.computeWorldMatrix(true);
  worldBoundaryMesh?.computeWorldMatrix(true);
  const worldBoundary =
    stageBoundaryMesh && worldBoundaryMesh
      ? createStageWorldBoundary(
          worldBoundaryMesh,
          stageBoundaryMesh
        )
      : null;
  const stage = Object.freeze({
    resources: Object.freeze({
      beamBlockers: Object.freeze([...blockers]),
      sightBlockers: Object.freeze([...blockers])
    }),
    worldBoundary,
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
      spatialFixture.dispose();
      worldBoundary?.dispose();
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
          random: () => 0.5,
          getOrbVisibilityPredicate: () => () => true
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
            clearedPool.trail.inUse === 0 &&
            clearedPool["blocker-impact"].inUse === 0;
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
          random: () => 0.5,
          getOrbVisibilityPredicate: () => () => true
        });
        try {
          const baselineMeshes = fixture.scene.meshes.length;
          const beamId = system.spawn({
            sourceId: "npc-wall",
            originKind: "npc-gun",
            targetPolicy: createAliveHumansPolicy(),
            origin: Vector3.Zero(),
            direction: Vector3.Right(),
            speed: 100,
            maximumLifetime: 2
          });
          const impactFrame = system.update(0.1);
          const impactSnapshot = system.getActiveBeams()[0];
          const impactPosition = impactSnapshot.position.clone();
          const body = fixture.scene.getMeshByName(
            `${beamId}-body`
          ) as InstancedMesh | null;
          const bodyPositionAtImpact = body?.position.x ?? Number.NaN;
          const expectedBodyPositionAtImpact =
            impactPosition.x -
            V2_NORMAL_BEAM_TIP_DIAMETER -
            impactSnapshot.bodyLength / 2;
          const meshCountWithImpact =
            fixture.scene.meshes.length - baselineMeshes;
          const shortRetractFrame = system.update(0.0001);
          const bodyPositionAfterShortRetract =
            body?.position.x ?? Number.NaN;
          const retractFrame = system.update(0.01);
          const activeAfterRetraction = system.activeCount;
          const poolBeforeClear = system.getVisualPoolSnapshot();
          const impactVisualRemains =
            poolBeforeClear.body.inUse === 0 &&
            poolBeforeClear.tip.inUse === 0 &&
            poolBeforeClear["blocker-impact"].inUse === 4;
          const activeImpactMeshes = fixture.scene.meshes.filter(
            (mesh) =>
              mesh.name === `${beamId}-blocker-impact` && mesh.isEnabled()
          );
          const impactAlphaIndexMatches =
            activeImpactMeshes.length === 4 &&
            activeImpactMeshes.every(
              (mesh) =>
                mesh.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR
            );
          system.clear();
          const poolAfterClear = system.getVisualPoolSnapshot();
          const resourcesCleared =
            poolAfterClear.body.inUse === 0 &&
            poolAfterClear.tip.inUse === 0 &&
            poolAfterClear.trail.inUse === 0 &&
            poolAfterClear["blocker-impact"].inUse === 0;
          const pooledMeshCount = fixture.scene.meshes.length;
          const reuseBeamId = system.spawn({
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
          const reusedActiveImpactMeshes = fixture.scene.meshes.filter(
            (mesh) =>
              mesh.name === `${reuseBeamId}-blocker-impact` &&
              mesh.isEnabled()
          );
          const reusedImpactAlphaIndexMatches =
            reusedActiveImpactMeshes.length === 4 &&
            reusedActiveImpactMeshes.every(
              (mesh) =>
                mesh.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR
            );
          const resourcesReused =
            reuseImpactFrame.impacts.length === 1 &&
            reusedImpactAlphaIndexMatches &&
            reusedPool.body.capacity === poolAfterClear.body.capacity &&
            reusedPool.tip.capacity === poolAfterClear.tip.capacity &&
            reusedPool["blocker-impact"].capacity ===
              poolAfterClear["blocker-impact"].capacity &&
            fixture.scene.meshes.length === pooledMeshCount;
          system.clear();
          system.dispose();
          const resourcesDisposed =
            fixture.scene.meshes.length === fixtureMeshCount &&
            !fixture.scene.materials.some((item) =>
              item.name.startsWith("v2NormalBeam")
            );
          return {
            ok:
              impactFrame.impacts.length === 1 &&
              impactFrame.impacts[0].hit.kind === "blocker" &&
              approximately(impactPosition.x, 1.9, 1e-6) &&
              approximately(
                bodyPositionAtImpact,
                expectedBodyPositionAtImpact,
                1e-6
              ) &&
              shortRetractFrame.impacts.length === 0 &&
              approximately(
                bodyPositionAfterShortRetract -
                  bodyPositionAtImpact,
                0.015,
                1e-6
              ) &&
              meshCountWithImpact === 12 &&
              retractFrame.impacts.length === 0 &&
              activeAfterRetraction === 0 &&
              impactVisualRemains &&
              impactAlphaIndexMatches &&
              resourcesCleared &&
              resourcesReused &&
              resourcesDisposed,
            detail:
              `impact=${impactFrame.impacts.length} / ` +
              `x=${impactPosition.x.toFixed(3)} / meshes=${meshCountWithImpact} / ` +
              `body=${bodyPositionAtImpact.toFixed(3)}->` +
              `${bodyPositionAfterShortRetract.toFixed(3)} / ` +
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
          random: () => 0.5,
          getOrbVisibilityPredicate: () => () => true
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
          random: () => 0.5,
          getOrbVisibilityPredicate: () => () => true
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
            fixture.scene.meshes.length === fixtureMeshCount + 8 &&
            fixture.scene.materials.length === fixtureMaterialCount + 2;
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
        const movementColliderSets = Object.freeze({
          player: movementColliders,
          npc: movementColliders,
          bit: movementColliders
        });
        const spatialFixture = createDynamicStageSpatialQueryFixture(
          scene,
          {
            movementColliders: movementColliderSets,
            groundColliders: Object.freeze([floor]),
            beamBlockers: rayBlockers,
            sightBlockers: rayBlockers,
            bitObstacles: movementColliderSets.bit
          },
          { volumes: [] }
        );
        const queries = spatialFixture.queries;
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
          spatialFixture.dispose();
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
        const movementColliderSets = Object.freeze({
          player: blockers,
          npc: blockers,
          bit: blockers
        });
        const spatialFixture = createDynamicStageSpatialQueryFixture(
          scene,
          {
            movementColliders: movementColliderSets,
            groundColliders: blockers,
            beamBlockers: blockers,
            sightBlockers: blockers,
            bitObstacles: movementColliderSets.bit
          },
          { volumes: [] }
        );
        const queries = spatialFixture.queries;
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
          spatialFixture.dispose();
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
        const movementColliderSets = Object.freeze({
          player: reverseOptionOrder,
          npc: reverseOptionOrder,
          bit: reverseOptionOrder
        });
        const spatialFixture = createDynamicStageSpatialQueryFixture(
          scene,
          {
            movementColliders: movementColliderSets,
            groundColliders: reverseOptionOrder,
            beamBlockers: reverseOptionOrder,
            sightBlockers: reverseOptionOrder,
            bitObstacles: movementColliderSets.bit
          },
          { volumes: [] }
        );
        const queries = spatialFixture.queries;
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
          spatialFixture.dispose();
          scene.dispose();
          engine.dispose();
        }
      })
    );

    results.push(
      executeTest("開始点包含は動的空間queryへ委譲する", () => {
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
            random: () => 0.5,
            getOrbVisibilityPredicate: () => () => true,
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
              triangulatedMeshes === 0,
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
      executeTest("視線開始点包含はsight queryへ委譲する", () => {
        const fixture = createBeamFixture([
          Object.freeze({
            id: "sight-containing-blocker",
            center: new Vector3(3, 0, 0),
            size: new Vector3(2, 2, 2)
          })
        ]);
        const baseQueries = fixture.stage.queries;
        const queriedKinds: string[] = [];
        const dynamicStage = {
          worldBoundary: fixture.stage.worldBoundary,
          queries: Object.freeze({
            ...baseQueries,
            findContainingBlocker: (
              kind: "beam" | "sight",
              point: Vector3
            ) => {
              queriedKinds.push(kind);
              return baseQueries.findContainingBlocker(kind, point);
            }
          })
        } as unknown as StageSpatialContext;
        try {
          const origin = new Vector3(3, 0, 0);
          const hit = castV2SightSegment(
            dynamicStage,
            origin,
            new Vector3(5, 0, 0)
          );
          return {
            ok:
              hit.occluded &&
              hit.mesh.name === "sight-containing-blocker" &&
              hit.startedInside &&
              hit.distance === 0 &&
              hit.point.equals(origin) &&
              queriedKinds.length === 1 &&
              queriedKinds[0] === "sight",
            detail:
              `hit=${hit.occluded ? hit.mesh.name : "none"} / ` +
              `inside=${hit.occluded ? hit.startedInside : false} / ` +
              `query=${queriedKinds.join(",") || "none"}`
          };
        } finally {
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest("ActiveBeamは初回とrevision変更後だけ開始点包含を再確認", () => {
        const fixture = createBeamFixture([]);
        let revision = fixture.stage.queries.revision;
        let containmentQueryCount = 0;
        let containmentDiagnosticCount = 0;
        const baseQueries = fixture.stage.queries;
        const countingStage = {
          worldBoundary: fixture.stage.worldBoundary,
          queries: {
            ...baseQueries,
            get revision() {
              return revision;
            },
            findContainingBlocker: (
              kind: "beam" | "sight",
              point: Vector3
            ) => {
              containmentQueryCount += 1;
              return baseQueries.findContainingBlocker(kind, point);
            }
          }
        } as unknown as StageSpatialContext;
        const system = createV2BeamSystem({
          scene: fixture.scene,
          stage: countingStage,
          getHumanTargets: () => [],
          random: () => 0.5,
          getOrbVisibilityPredicate: () => () => true,
          collisionDiagnostics: {
            recordStartContainment: () => {
              containmentDiagnosticCount += 1;
            }
          }
        });
        try {
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
          const oneShotQueries = containmentQueryCount;
          containmentQueryCount = 0;
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
          const stableRevisionQueries = containmentQueryCount;
          revision += 1;
          system.update(0.1);
          system.update(0.1);
          const revisedQueries = containmentQueryCount;
          return {
            ok:
              oneShotQueries === 2 &&
              stableRevisionQueries === 1 &&
              revisedQueries === 2 &&
              containmentDiagnosticCount === 2,
            detail:
              `oneShotQueries=${oneShotQueries} / ` +
              `stableRevisionQueries=${stableRevisionQueries} / ` +
              `revisedQueries=${revisedQueries} / ` +
              `diagnostics=${containmentDiagnosticCount}`
          };
        } finally {
          system.dispose();
          fixture.dispose();
        }
      })
    );

    results.push(
      executeTest(
        "全9 origin kindを境界交点で停止し副作用なしで0.2秒fadeする",
        () => {
          const fixture = createBeamFixture([], undefined, 4);
          const originKinds: readonly V2BeamOriginKind[] =
            Object.freeze([
              "bit-chase",
              "bit-fixed",
              "bit-random",
              "bit-carpet",
              "npc-gun",
              "player-gun",
              "execution-bit",
              "execution-npc",
              "execution-player"
            ]);
          const system = createV2BeamSystem({
            scene: fixture.scene,
            stage: fixture.stage,
            getHumanTargets: () => [],
            random: () => 0.5,
            getOrbVisibilityPredicate: () => () => true
          });
          const details: string[] = [];
          let allPassed = true;
          try {
            for (const originKind of originKinds) {
              const beamId = system.spawn({
                sourceId: `boundary-${originKind}`,
                originKind,
                targetPolicy: createAliveHumansPolicy(),
                origin: Vector3.Zero(),
                direction: Vector3.Right(),
                speed: 10,
                maximumLifetime: 1
              });
              system.update(0.1);
              const exitFrame = system.update(0.15);
              const snapshot = system.getActiveBeams()[0];
              const body = fixture.scene.meshes.find(
                (mesh) => mesh.name === `${beamId}-body`
              );
              const tip = fixture.scene.meshes.find(
                (mesh) => mesh.name === `${beamId}-tip`
              );
              const poolAtExit = system.getVisualPoolSnapshot();
              const trails = fixture.scene.meshes.filter(
                (mesh) =>
                  mesh.name === `${beamId}-trail` &&
                  mesh.isEnabled()
              ) as InstancedMesh[];
              const getMaximumTrailAlpha = () =>
                Math.max(
                  -1,
                  ...trails
                    .filter((trail) => trail.isEnabled())
                    .map((trail) =>
                      Number(
                        trail.instancedBuffers.instanceColor?.a ?? -1
                      )
                    )
                );
              const bodyVisibilityAtExit = Number(
                (body as InstancedMesh | undefined)?.instancedBuffers
                  .instanceColor?.a ?? -1
              );
              const tipVisibilityAtExit = Number(
                (tip as InstancedMesh | undefined)?.instancedBuffers
                  .instanceColor?.a ?? -1
              );
              const trailVisibilityAtExit =
                getMaximumTrailAlpha();
              const exitPassed =
                exitFrame.worldBoundaryExits.length === 1 &&
                exitFrame.worldBoundaryExits[0].beamId === beamId &&
                exitFrame.worldBoundaryExits[0].originKind ===
                  originKind &&
                approximately(
                  exitFrame.worldBoundaryExits[0].position.x,
                  2,
                  1e-6
                ) &&
                exitFrame.impacts.length === 0 &&
                exitFrame.expirations.length === 0 &&
                snapshot.phase === "world-boundary-fading" &&
                approximately(snapshot.position.x, 2, 1e-6) &&
                approximately(snapshot.velocity.length(), 0, 1e-9) &&
                approximately(bodyVisibilityAtExit, 0.75, 1e-6) &&
                approximately(tipVisibilityAtExit, 0.75, 1e-6) &&
                approximately(trailVisibilityAtExit, 0.75, 1e-6) &&
                poolAtExit.trail.inUse === trails.length &&
                trails.length > 0 &&
                poolAtExit["blocker-impact"].inUse === 0;
              const fadingFrame = system.update(0.1);
              const trailVisibilityWhileFading =
                getMaximumTrailAlpha();
              const stillFading =
                fadingFrame.worldBoundaryExits.length === 0 &&
                system.activeCount === 1 &&
                trails.some((trail) => trail.isEnabled()) &&
                approximately(
                  trailVisibilityWhileFading,
                  0.25,
                  1e-6
                ) &&
                trailVisibilityWhileFading <
                  trailVisibilityAtExit;
              system.update(0.049);
              const completedFrame = system.update(0.001);
              const completed =
                completedFrame.worldBoundaryExits.length === 0 &&
                completedFrame.impacts.length === 0 &&
                completedFrame.expirations.length === 0 &&
                system.activeCount === 0 &&
                system.getVisualPoolSnapshot().trail.inUse === 0;
              allPassed =
                allPassed && exitPassed && stillFading && completed;
              details.push(
                `${originKind}=${exitPassed && stillFading && completed}` +
                  `[${exitPassed}/${stillFading}/${completed}]` +
                  `(events=${exitFrame.worldBoundaryExits.length}/` +
                  `${exitFrame.impacts.length}/${exitFrame.expirations.length},` +
                  `phase=${snapshot?.phase ?? "none"},` +
                  `x=${snapshot?.position.x ?? "none"},` +
                  `alpha=${bodyVisibilityAtExit}/` +
                  `${tipVisibilityAtExit}/` +
                  `${trailVisibilityAtExit}->` +
                  `${trailVisibilityWhileFading},` +
                  `trail=${poolAtExit.trail.inUse}/${trails.length},` +
                  `active=${system.activeCount})`
              );
              system.clear();
            }
            return {
              ok:
                allPassed &&
                V2_WORLD_BOUNDARY_FADE_DURATION_SECONDS === 0.2,
              detail: details.join(" / ")
            };
          } finally {
            system.dispose();
            fixture.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "退出フレームのtrailを交点時刻まで進めて残時間込みで分割非依存fadeする",
        () => {
          const runCase = (
            label: string,
            frameDurations: readonly number[]
          ) => {
            const fixture = createBeamFixture([], undefined, 4);
            const system = createV2BeamSystem({
              scene: fixture.scene,
              stage: fixture.stage,
              getHumanTargets: () => [],
              random: () => 0.5,
              getOrbVisibilityPredicate: () => () => true
            });
            try {
              const beamId = system.spawn({
                sourceId: `trail-boundary-${label}`,
                originKind: "bit-fixed",
                targetPolicy: createAliveHumansPolicy(),
                origin: Vector3.Zero(),
                direction: Vector3.Right(),
                speed: 10,
                maximumLifetime: 1
              });
              let exits = 0;
              for (const frameDuration of frameDurations) {
                exits +=
                  system.update(frameDuration).worldBoundaryExits.length;
              }
              const trails = fixture.scene.meshes.filter(
                (mesh) =>
                  mesh.name === `${beamId}-trail` &&
                  mesh.isEnabled()
              ) as InstancedMesh[];
              if (trails.length === 0) {
                throw new Error("境界fade比較用trailがありません");
              }
              const profile = trails
                .map((trail) =>
                  Object.freeze({
                    alpha: Number(
                      trail.instancedBuffers.instanceColor?.a ?? -1
                    ),
                    scale: trail.scaling.x,
                    positionX: trail.position.x
                  })
                )
                .sort((left, right) => left.scale - right.scale);
              return Object.freeze({
                exits,
                profile,
                phase: system.getActiveBeams()[0]?.phase ?? "none"
              });
            } finally {
              system.dispose();
              fixture.dispose();
            }
          };
          const coarse = runCase("coarse", [0.2]);
          const split = runCase("split", [0.1, 0.1]);
          const sameProfile =
            coarse.profile.length === split.profile.length &&
            coarse.profile.every(
              (trail, index) =>
                approximately(
                  trail.alpha,
                  split.profile[index].alpha,
                  1e-6
                ) &&
                approximately(
                  trail.scale,
                  split.profile[index].scale,
                  1e-6
                ) &&
                approximately(
                  trail.positionX,
                  split.profile[index].positionX,
                  1e-6
                )
            );
          return {
            ok:
              sameProfile &&
              coarse.profile.length === 3 &&
              coarse.profile.some((trail) => trail.alpha > 0) &&
              coarse.exits === 1 &&
              split.exits === 1 &&
              coarse.phase === "world-boundary-fading" &&
              split.phase === "world-boundary-fading",
            detail:
              `coarse=${JSON.stringify(coarse)} / ` +
              `split=${JSON.stringify(split)}`
          };
        }
      )
    );

    results.push(
      executeTest(
        "境界より明確に手前のactor・blockerだけ命中し同距離は境界を優先する",
        () => {
          const runActorCase = (centerX: number) => {
            const fixture = createBeamFixture([], undefined, 4);
            const target = createHuman(
              `actor-${centerX}`,
              "npc",
              new Vector3(centerX, 0, 0),
              new Vector3(0.1, 0.4, 0.1),
              "normal",
              true,
              false
            );
            const system = createV2BeamSystem({
              scene: fixture.scene,
              stage: fixture.stage,
              getHumanTargets: () => [target],
              random: () => 0.5,
              getOrbVisibilityPredicate: () => () => true
            });
            try {
              system.spawn({
                sourceId: `actor-source-${centerX}`,
                originKind: "player-gun",
                targetPolicy: createAliveHumansPolicy(),
                origin: Vector3.Zero(),
                direction: Vector3.Right(),
                speed: 10,
                maximumLifetime: 1
              });
              const frame = system.update(0.3);
              return Object.freeze({
                impacts: frame.impacts.length,
                exits: frame.worldBoundaryExits.length
              });
            } finally {
              system.dispose();
              fixture.dispose();
            }
          };
          const runBlockerCase = (centerX: number) => {
            const fixture = createBeamFixture(
              [
                Object.freeze({
                  id: `blocker-${centerX}`,
                  center: new Vector3(centerX, 0, 0),
                  size: new Vector3(0.2, 2, 2)
                })
              ],
              undefined,
              4
            );
            const system = createV2BeamSystem({
              scene: fixture.scene,
              stage: fixture.stage,
              getHumanTargets: () => [],
              random: () => 0.5,
              getOrbVisibilityPredicate: () => () => true
            });
            try {
              system.spawn({
                sourceId: `blocker-source-${centerX}`,
                originKind: "npc-gun",
                targetPolicy: createAliveHumansPolicy(),
                origin: Vector3.Zero(),
                direction: Vector3.Right(),
                speed: 10,
                maximumLifetime: 1
              });
              const frame = system.update(0.3);
              return Object.freeze({
                impacts: frame.impacts.length,
                exits: frame.worldBoundaryExits.length,
                impactOrbs:
                  system.getVisualPoolSnapshot()["blocker-impact"].inUse
              });
            } finally {
              system.dispose();
              fixture.dispose();
            }
          };
          const actorBefore = runActorCase(1.5);
          const actorTie = runActorCase(2.1);
          const actorAfter = runActorCase(2.5);
          const blockerBefore = runBlockerCase(1.5);
          const blockerTie = runBlockerCase(2.1);
          const blockerAfter = runBlockerCase(2.5);
          const ok =
            actorBefore.impacts === 1 &&
            actorBefore.exits === 0 &&
            actorTie.impacts === 0 &&
            actorTie.exits === 1 &&
            actorAfter.impacts === 0 &&
            actorAfter.exits === 1 &&
            blockerBefore.impacts === 1 &&
            blockerBefore.exits === 0 &&
            blockerBefore.impactOrbs === 4 &&
            blockerTie.impacts === 0 &&
            blockerTie.exits === 1 &&
            blockerTie.impactOrbs === 0 &&
            blockerAfter.impacts === 0 &&
            blockerAfter.exits === 1 &&
            blockerAfter.impactOrbs === 0;
          return {
            ok,
            detail:
              `actor=${JSON.stringify([
                actorBefore,
                actorTie,
                actorAfter
              ])} / blocker=${JSON.stringify([
                blockerBefore,
                blockerTie,
                blockerAfter
              ])}`
          };
        }
      )
    );

    results.push(
      executeTest(
        "最大寿命が境界より手前なら従来終了し同距離・境界後なら境界終了する",
        () => {
          const runCase = (maximumLifetime: number) => {
            const fixture = createBeamFixture([], undefined, 4);
            const system = createV2BeamSystem({
              scene: fixture.scene,
              stage: fixture.stage,
              getHumanTargets: () => [],
              random: () => 0.5,
              getOrbVisibilityPredicate: () => () => true
            });
            try {
              system.spawn({
                sourceId: `lifetime-${maximumLifetime}`,
                originKind: "execution-bit",
                targetPolicy: createAliveHumansPolicy(),
                origin: Vector3.Zero(),
                direction: Vector3.Right(),
                speed: 10,
                maximumLifetime
              });
              const frame = system.update(0.3);
              return Object.freeze({
                expirations: frame.expirations.length,
                exits: frame.worldBoundaryExits.length,
                position:
                  frame.expirations[0]?.position.x ??
                  frame.worldBoundaryExits[0]?.position.x ??
                  Number.NaN
              });
            } finally {
              system.dispose();
              fixture.dispose();
            }
          };
          const before = runCase(0.1);
          const tie = runCase(0.2);
          const after = runCase(0.3);
          return {
            ok:
              before.expirations === 1 &&
              before.exits === 0 &&
              approximately(before.position, 1, 1e-6) &&
              tie.expirations === 0 &&
              tie.exits === 1 &&
              approximately(tie.position, 2, 1e-6) &&
              after.expirations === 0 &&
              after.exits === 1 &&
              approximately(after.position, 2, 1e-6),
            detail:
              `before=${JSON.stringify(before)} / ` +
              `tie=${JSON.stringify(tie)} / after=${JSON.stringify(after)}`
          };
        }
      )
    );

    results.push(
      executeTest(
        "V1相当のテーパ本体・後端alpha・発射点を包む先端・trail・反射球profileを共有する",
        () => {
          const fixture = createBeamFixture([]);
          const system = createV2BeamSystem({
            scene: fixture.scene,
            stage: fixture.stage,
            getHumanTargets: () => [],
            random: () => 0.5,
            getOrbVisibilityPredicate: () => () => true
          });
          try {
            const bodySource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolSource-body"
            );
            const tipSource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolSource-tip"
            );
            const impactSource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolSource-blocker-impact"
            );
            const trailSource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolSource-trail"
            );
            const bodyDepthSource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolDepthSource-body"
            );
            const tipDepthSource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolDepthSource-tip"
            );
            const trailDepthSource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolDepthSource-trail"
            );
            const impactDepthSource = fixture.scene.getMeshByName(
              "v2NormalBeamPoolDepthSource-blocker-impact"
            );
            if (
              !bodySource ||
              !tipSource ||
              !trailSource ||
              !impactSource ||
              !bodyDepthSource ||
              !tipDepthSource ||
              !trailDepthSource ||
              !impactDepthSource
            ) {
              throw new Error("光線Pool sourceがありません");
            }
            const positions = bodySource.getVerticesData(
              VertexBuffer.PositionKind
            );
            const colors = bodySource.getVerticesData(
              VertexBuffer.ColorKind
            );
            if (!positions || !colors) {
              throw new Error("光線本体の位置・色頂点dataがありません");
            }
            let frontRadius = 0;
            let backRadius = 0;
            let rearFade = false;
            let frontOpaque = true;
            let minimumFrontAlpha = 1;
            for (let index = 0; index < positions.length; index += 3) {
              const x = positions[index];
              const y = positions[index + 1];
              const z = positions[index + 2];
              const radius = Math.hypot(x, z);
              if (approximately(y, 0.5, 1e-6)) {
                frontRadius = Math.max(frontRadius, radius);
              }
              if (approximately(y, -0.5, 1e-6)) {
                backRadius = Math.max(backRadius, radius);
              }
              const alpha = colors[(index / 3) * 4 + 3];
              if (y < -1 / 6 && alpha < 1) {
                rearFade = true;
              }
              if (y >= -1 / 6 && !approximately(alpha, 1, 1e-6)) {
                frontOpaque = false;
              }
              if (y >= -1 / 6) {
                minimumFrontAlpha = Math.min(
                  minimumFrontAlpha,
                  alpha
                );
              }
            }
            const visualMaterial =
              bodySource.material as StandardMaterial;
            const depthMaterial =
              bodyDepthSource.material as StandardMaterial;
            const tipBounds = tipSource.getBoundingInfo().boundingBox;
            const impactBounds =
              impactSource.getBoundingInfo().boundingBox;
            const beamId = system.spawn({
              sourceId: "v1-profile",
              originKind: "bit-carpet",
              targetPolicy: createAliveHumansPolicy(),
              origin: Vector3.Zero(),
              direction: Vector3.Right(),
              speed: 10,
              maximumLifetime: 10
            });
            system.update(0.0425);
            const activeBeam = system.getActiveBeams()[0];
            const bodyInstance = fixture.scene.getMeshByName(
              `${beamId}-body`
            ) as InstancedMesh | null;
            const tipInstance = fixture.scene.getMeshByName(
              `${beamId}-tip`
            ) as InstancedMesh | null;
            const bodyDepthInstance = fixture.scene.getMeshByName(
              `${beamId}-body-depth`
            ) as InstancedMesh | null;
            const tipDepthInstance = fixture.scene.getMeshByName(
              `${beamId}-tip-depth`
            ) as InstancedMesh | null;
            const trail = fixture.scene.meshes.find(
              (mesh) => mesh.name === `${beamId}-trail`
            );
            const trailDepth = fixture.scene.meshes.find(
              (mesh) => mesh.name === `${beamId}-trail-depth`
            ) as InstancedMesh | undefined;
            const tipRadius = V2_NORMAL_BEAM_TIP_DIAMETER / 2;
            const bodyFrontX =
              (bodyInstance?.position.x ?? Number.NaN) +
              activeBeam.bodyLength / 2;
            const tipBackX =
              (tipInstance?.position.x ?? Number.NaN) - tipRadius;
            const tipFrontX =
              (tipInstance?.position.x ?? Number.NaN) + tipRadius;
            const profileOk =
              V2_NORMAL_BEAM_BODY_DIAMETER === 0.018 &&
              V2_NORMAL_BEAM_MAX_BODY_LENGTH === 0.75 &&
              bodySource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
              tipSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
              trailSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
              impactSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
              bodyDepthSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
              tipDepthSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
              trailDepthSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
              impactDepthSource.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
              bodySource.material === tipSource.material &&
              bodySource.material === trailSource.material &&
              bodySource.material === impactSource.material &&
              bodyDepthSource.material === tipDepthSource.material &&
              bodyDepthSource.material === trailDepthSource.material &&
              bodyDepthSource.material === impactDepthSource.material &&
              bodySource.material !== bodyDepthSource.material &&
              approximately(
                frontRadius * 2,
                V2_NORMAL_BEAM_FRONT_DIAMETER,
                1e-6
              ) &&
              approximately(
                backRadius * 2,
                V2_NORMAL_BEAM_BACK_DIAMETER,
                1e-6
              ) &&
              rearFade &&
              frontOpaque &&
              approximately(
                tipBounds.maximum.x - tipBounds.minimum.x,
                V2_NORMAL_BEAM_TIP_DIAMETER,
                1e-6
              ) &&
              approximately(
                impactBounds.maximum.x - impactBounds.minimum.x,
                0.02,
                1e-6
              ) &&
              visualMaterial.alpha === 0.55 &&
              visualMaterial.transparencyMode ===
                Material.MATERIAL_ALPHABLEND &&
              !visualMaterial.needDepthPrePass &&
              !visualMaterial.forceDepthWrite &&
              !visualMaterial.disableColorWrite &&
              approximately(visualMaterial.emissiveColor.r, 1, 1e-6) &&
              approximately(visualMaterial.emissiveColor.g, 0.18, 1e-6) &&
              approximately(visualMaterial.emissiveColor.b, 0.74, 1e-6) &&
              depthMaterial.alpha === 0.55 &&
              depthMaterial.transparencyMode ===
                Material.MATERIAL_ALPHATESTANDBLEND &&
              depthMaterial.needAlphaTesting() &&
              !depthMaterial.needDepthPrePass &&
              depthMaterial.forceDepthWrite &&
              depthMaterial.disableColorWrite &&
              approximately(depthMaterial.alphaCutOff, 0.1, 1e-6) &&
              bodyInstance !== null &&
              tipInstance !== null &&
              bodyInstance.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
              tipInstance.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
              trail?.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_COLOR &&
              bodyDepthInstance !== null &&
              tipDepthInstance !== null &&
              bodyDepthInstance.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
              tipDepthInstance.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
              trailDepth?.alphaIndex ===
                V2_TRANSPARENT_ALPHA_INDEX_BEAM_DEPTH &&
              bodyDepthInstance.parent === bodyInstance &&
              tipDepthInstance.parent === tipInstance &&
              trailDepth?.parent === trail &&
              approximately(
                Number(
                  trailDepth?.instancedBuffers.instanceColor?.a ?? -1
                ),
                Number(trail?.instancedBuffers.instanceColor?.a ?? -2),
                1e-6
              ) &&
              approximately(bodyFrontX, tipBackX, 1e-6) &&
              approximately(
                tipInstance.position.x,
                activeBeam.position.x,
                1e-6
              ) &&
              approximately(trail?.scaling.x ?? -1, 0.03, 1e-6);
            return {
              ok: profileOk,
              detail:
                `diameter=${V2_NORMAL_BEAM_BODY_DIAMETER} / ` +
                `front=${(frontRadius * 2).toFixed(4)} / ` +
                `back=${(backRadius * 2).toFixed(4)} / ` +
                 `rearFade=${rearFade} / frontOpaque=${frontOpaque} / ` +
                 `minFrontAlpha=${minimumFrontAlpha} / ` +
                 `tip=${(tipBounds.maximum.x - tipBounds.minimum.x).toFixed(4)} / ` +
                 `placement=${bodyFrontX.toFixed(4)}/` +
                 `${tipBackX.toFixed(4)}/${tipFrontX.toFixed(4)} / ` +
                 `trail=${trail?.scaling.x.toFixed(4) ?? "none"}`
             };
          } finally {
            system.dispose();
            fixture.dispose();
          }
        }
      )
    );

    return Object.freeze(results);
  };
