import {
  Color3,
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  V2_NORMAL_BEAM_MAX_BODY_LENGTH,
  castV2BeamSegment,
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
  wallDefinitions: readonly WallDefinition[]
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
    volumes: []
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
          const baselineMeshes = fixture.scene.meshes.length;
          const baselineMaterials = fixture.scene.materials.length;
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
          const cleanBeforeClear =
            fixture.scene.meshes.length === baselineMeshes &&
            system.activeCount === 0;
          system.clear();
          const resourcesCleared =
            fixture.scene.meshes.length === baselineMeshes &&
            fixture.scene.materials.length === baselineMaterials;
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
              cleanBeforeClear &&
              resourcesCleared,
            detail:
              `impact=${impactFrame.impacts.length} / ` +
              `phase=${impactSnapshot?.phase ?? "--"} / ` +
              `length=${impactSnapshot?.bodyLength.toFixed(3) ?? "--"}->` +
              `${retractSnapshot?.bodyLength.toFixed(3) ?? "--"} / ` +
              `active=${system.activeCount} / resources=${resourcesCleared}`
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
          const baselineMaterials = fixture.scene.materials.length;
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
          const impactVisualRemains =
            fixture.scene.meshes.length - baselineMeshes === 1;
          system.clear();
          const meshCountAfterClear = fixture.scene.meshes.length;
          const materialCountAfterClear = fixture.scene.materials.length;
          const resourcesCleared =
            meshCountAfterClear === baselineMeshes &&
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
              resourcesCleared,
            detail:
              `impact=${impactFrame.impacts.length} / ` +
              `x=${impactPosition.x.toFixed(3)} / meshes=${meshCountWithImpact} / ` +
              `active=${activeAfterRetraction} / resources=${resourcesCleared} ` +
              `(meshes=${meshCountAfterClear}/${baselineMeshes}, ` +
              `materials=${materialCountAfterClear}/${baselineMaterials}:` +
              `${fixture.scene.materials.map((item) => item.name).join(",")})`
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

    return Object.freeze(results);
  };
