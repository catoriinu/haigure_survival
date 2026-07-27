import {
  Mesh,
  MeshBuilder,
  NullEngine,
  Ray,
  Scene,
  Vector3,
  VertexData
} from "@babylonjs/core";

import {
  BIT_FLIGHT_BODY_RADIUS_METERS,
  BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS,
  BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS,
  BIT_FLIGHT_ENVELOPE_RADIUS_METERS,
  BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
  BIT_FLIGHT_SAFETY_MARGIN_METERS,
  createBitFlightSafety
} from "../../../src/world/bitFlightSafety";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";
import {
  toBitFlightBandId,
  toBitFlightZoneId,
  type BitFlightBand
} from "../../../src/world/bitFlightNavigation";
import type { DynamicStageSpatialActiveSet } from "../../../src/world/dynamicStageSpatialVariants";
import {
  createStageBoundaryContainsQuery,
  type StageSpatialQueryOptions
} from "../../../src/world/stageSpatialQueries";
import {
  createDynamicStageSpatialQueryFixture,
  type DynamicStageSpatialQueryFixture
} from "./stageSpatialQueryFixture";

export type BitFlightSafetyTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type TestWorld = Readonly<{
  engine: NullEngine;
  scene: Scene;
  colliders: readonly Mesh[];
  spatialFixtures: readonly DynamicStageSpatialQueryFixture[];
  dispose(): void;
}>;

const createTestWorld = (): TestWorld => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const colliders: Mesh[] = [];
  const spatialFixtures: DynamicStageSpatialQueryFixture[] = [];
  return {
    engine,
    scene,
    colliders,
    spatialFixtures,
    dispose: () => {
      spatialFixtures.forEach((fixture) => fixture.dispose());
      scene.dispose();
      engine.dispose();
    }
  };
};

const createBox = (
  world: TestWorld,
  name: string,
  width: number,
  height: number,
  depth: number,
  position: Vector3
) => {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width, height, depth },
    world.scene
  );
  mesh.position.copyFrom(position);
  mesh.computeWorldMatrix(true);
  (world.colliders as Mesh[]).push(mesh);
  return mesh;
};

const createTriangleMesh = (
  world: TestWorld,
  name: string,
  vertices: readonly [Vector3, Vector3, Vector3]
) => {
  const mesh = new Mesh(name, world.scene);
  const vertexData = new VertexData();
  vertexData.positions = vertices.flatMap((vertex) => vertex.asArray());
  vertexData.indices = [0, 1, 2];
  vertexData.applyToMesh(mesh);
  mesh.computeWorldMatrix(true);
  (world.colliders as Mesh[]).push(mesh);
  return mesh;
};

const createTrackedSpatialQueries = (
  world: TestWorld,
  activeSet: DynamicStageSpatialActiveSet,
  options: StageSpatialQueryOptions
) => {
  const fixture = createDynamicStageSpatialQueryFixture(
    world.scene,
    activeSet,
    options
  );
  (world.spatialFixtures as DynamicStageSpatialQueryFixture[]).push(
    fixture
  );
  return fixture.queries;
};

const createQueries = (world: TestWorld) => {
  const movementColliders = Object.freeze({
    player: Object.freeze([]),
    npc: Object.freeze([]),
    bit: Object.freeze([...world.colliders])
  });
  return createTrackedSpatialQueries(
    world,
    {
      movementColliders,
      groundColliders: Object.freeze([...world.colliders]),
      beamBlockers: Object.freeze([]),
      sightBlockers: Object.freeze([]),
      bitObstacles: movementColliders.bit
    },
    { volumes: Object.freeze([]) }
  );
};

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-5
) => Math.abs(actual - expected) <= tolerance;

const vectorApproximately = (
  actual: Vector3,
  expected: readonly [number, number, number],
  tolerance = 1e-12
) =>
  approximately(actual.x, expected[0], tolerance) &&
  approximately(actual.y, expected[1], tolerance) &&
  approximately(actual.z, expected[2], tolerance);

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): BitFlightSafetyTestResult => {
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

export const runBitFlightSafetyTests =
  (): readonly BitFlightSafetyTestResult[] => {
    const results: BitFlightSafetyTestResult[] = [];

    results.push(
      executeTest(
        "物理0.44mと安全余裕0.10mから安全包絡0.54mを構成する",
        () => ({
          ok:
            approximately(BIT_FLIGHT_BODY_RADIUS_METERS, 0.44) &&
            approximately(BIT_FLIGHT_SAFETY_MARGIN_METERS, 0.1) &&
            approximately(BIT_FLIGHT_ENVELOPE_RADIUS_METERS, 0.54) &&
            approximately(
              BIT_FLIGHT_BODY_RADIUS_WORLD_UNITS,
              0.44 * BLENDER_METERS_TO_WORLD_UNITS
            ) &&
            approximately(
              BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
              0.54 * BLENDER_METERS_TO_WORLD_UNITS
            ),
          detail:
            `body=${BIT_FLIGHT_BODY_RADIUS_METERS.toFixed(2)}m / ` +
            `margin=${BIT_FLIGHT_SAFETY_MARGIN_METERS.toFixed(2)}m / ` +
            `envelope=${BIT_FLIGHT_ENVELOPE_RADIUS_METERS.toFixed(2)}m`
        })
      )
    );

    results.push(
      executeTest("壁際では中心線が通っても0.54m包絡が衝突する", () => {
        const world = createTestWorld();
        try {
          createBox(
            world,
            "OffsetWall",
            0.1,
            1,
            0.1,
            new Vector3(0, 0.5, 0.17)
          );
          const queries = createQueries(world);
          const from = new Vector3(-0.5, 0.5, 0);
          const to = new Vector3(0.5, 0.5, 0);
          const centerRayHit = queries.castMovementSegment("bit", from, to);
          const sphereHit = queries.castMovementSphere(
            "bit",
            from,
            to,
            BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS
          );
          return {
            ok: centerRayHit === null && sphereHit !== null,
            detail: `ray=${centerRayHit?.mesh.name ?? "none"} / sphere=${sphereHit?.mesh.name ?? "none"}`
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("床と天井の安全中心高度を球包絡で取得する", () => {
        const world = createTestWorld();
        try {
          createBox(
            world,
            "Floor",
            4,
            0.1,
            4,
            new Vector3(0, -0.05, 0)
          );
          createBox(
            world,
            "Ceiling",
            4,
            0.1,
            4,
            new Vector3(0, 0.85, 0)
          );
          const safety = createBitFlightSafety(createQueries(world));
          const clearance = safety.inspectVerticalClearance(
            new Vector3(0, 0.4, 0),
            1
          );
          const expectedMinimum =
            BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS +
            BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS;
          const expectedMaximum =
            0.8 -
            BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS -
            BIT_FLIGHT_CONTACT_CLEARANCE_WORLD_UNITS;
          return {
            ok:
              clearance.floor?.mesh.name === "Floor" &&
              clearance.ceiling?.mesh.name === "Ceiling" &&
              clearance.minimumSafeCenterHeight !== null &&
              clearance.maximumSafeCenterHeight !== null &&
              approximately(
                clearance.minimumSafeCenterHeight,
                expectedMinimum
              ) &&
              approximately(
                clearance.maximumSafeCenterHeight,
                expectedMaximum
              ),
            detail: `min=${clearance.minimumSafeCenterHeight} / max=${clearance.maximumSafeCenterHeight}`
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("斜め移動でも面・辺・頂点への連続衝突を検出する", () => {
        const world = createTestWorld();
        try {
          createBox(
            world,
            "DiagonalObstacle",
            0.2,
            0.4,
            0.2,
            new Vector3(0, 0.4, 0)
          );
          const safety = createBitFlightSafety(createQueries(world));
          const hit = safety.findMovementCollision(
            new Vector3(-0.6, 0.2, -0.6),
            new Vector3(0.6, 0.7, 0.6)
          );
          return {
            ok:
              hit?.mesh.name === "DiagonalObstacle" &&
              hit.fraction > 0 &&
              hit.fraction < 1,
            detail: hit
              ? `fraction=${hit.fraction.toFixed(6)} / normal=${hit.normal.toString()}`
              : "衝突なし"
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("旧Sweepの面・辺・頂点goldenと完全一致する", () => {
        const fixtures = [
          Object.freeze({
            name: "LegacyFace",
            vertices: Object.freeze([
              new Vector3(0, -2, -2),
              new Vector3(0, 2, -2),
              new Vector3(0, 0, 2)
            ]) as readonly [Vector3, Vector3, Vector3],
            from: new Vector3(-2, 0, 0),
            to: new Vector3(2, 0, 0),
            expectedFraction: 0.365,
            expectedPoint: [0, 0, 0] as const,
            expectedNormal: [-1, 0, 0] as const,
            expectedCenter: [-0.54, 0, 0] as const
          }),
          Object.freeze({
            name: "LegacyEdge",
            vertices: Object.freeze([
              new Vector3(0, 0, 0),
              new Vector3(0, 2, 0),
              new Vector3(0, 0, 2)
            ]) as readonly [Vector3, Vector3, Vector3],
            from: new Vector3(-2, 1, -0.25),
            to: new Vector3(2, 1, -0.25),
            expectedFraction: 0.3803390205622568,
            expectedPoint: [0, 1, 0] as const,
            expectedNormal: [
              -0.8863776254647644,
              0,
              -0.462962962962963
            ] as const,
            expectedCenter: [
              -0.4786439177509727,
              1,
              -0.25
            ] as const
          }),
          Object.freeze({
            name: "LegacyVertex",
            vertices: Object.freeze([
              new Vector3(0, 0, 0),
              new Vector3(0, 2, 0),
              new Vector3(0, 0, 2)
            ]) as readonly [Vector3, Vector3, Vector3],
            from: new Vector3(-2, -0.3, -0.3),
            to: new Vector3(2, -0.3, -0.3),
            expectedFraction: 0.4164835345575496,
            expectedPoint: [0, 0, 0] as const,
            expectedNormal: [
              -0.6186404847588917,
              -0.5555555555555554,
              -0.5555555555555554
            ] as const,
            expectedCenter: [
              -0.3340658617698016,
              -0.3,
              -0.3
            ] as const
          })
        ] as const;
        const details: string[] = [];
        let allMatched = true;
        for (const fixture of fixtures) {
          const world = createTestWorld();
          try {
            createTriangleMesh(world, fixture.name, fixture.vertices);
            const hit = createQueries(world).castMovementSphere(
              "bit",
              fixture.from,
              fixture.to,
              0.54
            );
            const matched =
              hit?.mesh.name === fixture.name &&
              approximately(
                hit.fraction,
                fixture.expectedFraction,
                1e-12
              ) &&
              vectorApproximately(hit.point, fixture.expectedPoint) &&
              vectorApproximately(hit.normal, fixture.expectedNormal) &&
              vectorApproximately(hit.center, fixture.expectedCenter);
            allMatched = allMatched && matched;
            details.push(
              `${fixture.name}=${hit?.fraction ?? "none"}`
            );
          } finally {
            world.dispose();
          }
        }
        return {
          ok: allMatched,
          detail: details.join(" / ")
        };
      })
    );

    results.push(
      executeTest(
        "known-safe Sweepは平面slab外の候補をexact前に除外する",
        () => {
          const world = createTestWorld();
          try {
            const mesh = createTriangleMesh(
              world,
              "PlaneSlabRejectedTriangle",
              [
                new Vector3(-2, 2, -2),
                new Vector3(2, -2, -2),
                new Vector3(-2, 2, 2)
              ]
            );
            let knownSafeCenterHit = false;
            let indexedTriangleCount = -1;
            let exactTriangleTestCount = -1;
            const movementColliders = Object.freeze({
              player: Object.freeze([]),
              npc: Object.freeze([]),
              bit: Object.freeze([mesh])
            });
            const queries = createTrackedSpatialQueries(
              world,
              {
                movementColliders,
                groundColliders: Object.freeze([]),
                beamBlockers: Object.freeze([]),
                sightBlockers: Object.freeze([]),
                bitObstacles: movementColliders.bit
              },
              {
                volumes: Object.freeze([]),
                diagnostics: Object.freeze({
                  recordRayQuery: () => {},
                  recordSphereSweep: (
                    _moverKind,
                    _visitedNodeCount,
                    indexedCount,
                    exactCount,
                    knownSafe
                  ) => {
                    knownSafeCenterHit = knownSafe;
                    indexedTriangleCount = indexedCount;
                    exactTriangleTestCount = exactCount;
                  }
                })
              }
            );
            queries.castMovementSphere(
              "bit",
              new Vector3(1, 1, -1.5),
              new Vector3(1, 1, -1),
              0.54
            );
            const hit = queries.castMovementSphere(
              "bit",
              new Vector3(1, 1, -1),
              new Vector3(1, 1, 1),
              0.54
            );
            return {
              ok:
                hit === null &&
                knownSafeCenterHit &&
                indexedTriangleCount === 1 &&
                exactTriangleTestCount === 0,
              detail:
                `knownSafe=${knownSafeCenterHit} / ` +
                `indexed=${indexedTriangleCount} / ` +
                `exact=${exactTriangleTestCount}`
            };
          } finally {
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "known-safe平面slabは接触境界をexact判定へ通す",
        () => {
          const world = createTestWorld();
          try {
            createTriangleMesh(world, "PlaneSlabContactBoundary", [
              new Vector3(0, -2, -2),
              new Vector3(0, 2, -2),
              new Vector3(0, 0, 2)
            ]);
            const queries = createQueries(world);
            queries.castMovementSphere(
              "bit",
              new Vector3(-2, 0, 0),
              new Vector3(-1, 0, 0),
              0.54
            );
            const hit = queries.castMovementSphere(
              "bit",
              new Vector3(-1, 0, 0),
              new Vector3(-0.54, 0, 0),
              0.54
            );
            return {
              ok:
                hit?.mesh.name === "PlaneSlabContactBoundary" &&
                approximately(hit.fraction, 1, 1e-12) &&
                vectorApproximately(hit.point, [0, 0, 0]) &&
                vectorApproximately(hit.center, [-0.54, 0, 0]),
              detail: hit
                ? `fraction=${hit.fraction} / center=${hit.center.toString()}`
                : "接触境界を検出できませんでした"
            };
          } finally {
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "known-safe平面slabは辺・頂点接近を除外しない",
        () => {
          const fixtures = [
            Object.freeze({
              name: "PlaneSlabEdge",
              from: new Vector3(-2, 1, -0.25),
              to: new Vector3(2, 1, -0.25),
              expectedFraction: 0.3803390205622568
            }),
            Object.freeze({
              name: "PlaneSlabVertex",
              from: new Vector3(-2, -0.3, -0.3),
              to: new Vector3(2, -0.3, -0.3),
              expectedFraction: 0.4164835345575496
            })
          ] as const;
          const details: string[] = [];
          let allMatched = true;
          for (const fixture of fixtures) {
            const world = createTestWorld();
            try {
              createTriangleMesh(world, fixture.name, [
                new Vector3(0, 0, 0),
                new Vector3(0, 2, 0),
                new Vector3(0, 0, 2)
              ]);
              const queries = createQueries(world);
              queries.castMovementSphere(
                "bit",
                new Vector3(
                  -3,
                  fixture.from.y,
                  fixture.from.z
                ),
                fixture.from,
                0.54
              );
              const hit = queries.castMovementSphere(
                "bit",
                fixture.from,
                fixture.to,
                0.54
              );
              const matched =
                hit?.mesh.name === fixture.name &&
                approximately(
                  hit.fraction,
                  fixture.expectedFraction,
                  1e-12
                );
              allMatched = allMatched && matched;
              details.push(
                `${fixture.name}=${hit?.fraction ?? "none"}`
              );
            } finally {
              world.dispose();
            }
          }
          return {
            ok: allMatched,
            detail: details.join(" / ")
          };
        }
      )
    );

    results.push(
      executeTest("安全包絡の接触境界を安全扱いしない", () => {
        const world = createTestWorld();
        try {
          createBox(
            world,
            "ContactWall",
            0.1,
            1,
            2,
            new Vector3(0, 0.5, 0)
          );
          const safety = createBitFlightSafety(createQueries(world));
          const center = new Vector3(
            -0.05 - BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS,
            0.5,
            0
          );
          const hit = safety.findMovementCollision(center, center);
          return {
            ok: hit !== null && hit.fraction === 0 && !safety.isCenterSafe(center),
            detail: hit
              ? `distance=${hit.distance} / fraction=${hit.fraction}`
              : "接触を検出できませんでした"
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("未知始点がCollider深部でもfraction 0を維持する", () => {
        const world = createTestWorld();
        try {
          const box = createBox(
            world,
            "DeepInsideBox",
            4,
            4,
            4,
            Vector3.Zero()
          );
          const center = Vector3.Zero();
          const hit = createQueries(world).castMovementSphere(
            "bit",
            center,
            center,
            0.54
          );
          return {
            ok:
              hit?.mesh === box &&
              hit.fraction === 0 &&
              hit.distance === 0 &&
              hit.center.equals(center),
            detail: hit
              ? `fraction=${hit.fraction} / point=${hit.point.toString()}`
              : "深部包含を検出できませんでした"
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest(
        "unknown-safe AABB外はsolid-angle triangleを走査しない",
        () => {
          const world = createTestWorld();
          const originalProjectOnTriangleToRef =
            Vector3.ProjectOnTriangleToRef;
          let projectionCount = 0;
          let knownSafeCenterHit = true;
          try {
            const box = createBox(
              world,
              "OutsideBoundsBox",
              0.2,
              0.2,
              0.2,
              Vector3.Zero()
            );
            const movementColliders = Object.freeze({
              player: Object.freeze([]),
              npc: Object.freeze([]),
              bit: Object.freeze([box])
            });
            const queries = createTrackedSpatialQueries(
              world,
              {
                movementColliders,
                groundColliders: Object.freeze([]),
                beamBlockers: Object.freeze([]),
                sightBlockers: Object.freeze([]),
                bitObstacles: movementColliders.bit
              },
              {
                volumes: Object.freeze([]),
                diagnostics: Object.freeze({
                  recordRayQuery: () => {},
                  recordSphereSweep: (
                    _moverKind,
                    _visitedNodeCount,
                    _indexedTriangleCount,
                    _exactTriangleTestCount,
                    knownSafe
                  ) => {
                    knownSafeCenterHit = knownSafe;
                  }
                })
              }
            );
            Vector3.ProjectOnTriangleToRef = (
              vector,
              p0,
              p1,
              p2,
              ref
            ) => {
              projectionCount += 1;
              return originalProjectOnTriangleToRef(
                vector,
                p0,
                p1,
                p2,
                ref
              );
            };
            const point = new Vector3(1.5, 1.5, 1.5);
            const hit = queries.castMovementSphere(
              "bit",
              point,
              point,
              0.1
            );
            return {
              ok:
                hit === null &&
                !knownSafeCenterHit &&
                projectionCount === 0,
              detail:
                `hit=${hit?.mesh.name ?? "none"} / ` +
                `knownSafe=${knownSafeCenterHit} / ` +
                `projections=${projectionCount}`
            };
          } finally {
            Vector3.ProjectOnTriangleToRef =
              originalProjectOnTriangleToRef;
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest("AABB各面の外側ε以内は従来どおり表面扱いする", () => {
        const world = createTestWorld();
        try {
          const box = createBox(
            world,
            "SurfaceEpsilonBox",
            2,
            2,
            2,
            new Vector3(3, 4, 5)
          );
          const contains = createStageBoundaryContainsQuery(box);
          const nearOutsidePoints = [
            new Vector3(2 - 0.5e-6, 4, 5),
            new Vector3(4 + 0.5e-6, 4, 5),
            new Vector3(3, 3 - 0.5e-6, 5),
            new Vector3(3, 5 + 0.5e-6, 5),
            new Vector3(3, 4, 4 - 0.5e-6),
            new Vector3(3, 4, 6 + 0.5e-6)
          ];
          const farOutsidePoints = [
            new Vector3(2 - 2e-6, 4, 5),
            new Vector3(4 + 2e-6, 4, 5),
            new Vector3(3, 3 - 2e-6, 5),
            new Vector3(3, 5 + 2e-6, 5),
            new Vector3(3, 4, 4 - 2e-6),
            new Vector3(3, 4, 6 + 2e-6)
          ];
          const nearResults = nearOutsidePoints.map(contains);
          const farResults = farOutsidePoints.map(contains);
          return {
            ok:
              nearResults.every((result) => result) &&
              farResults.every((result) => !result),
            detail:
              `near=${nearResults.join(",")} / ` +
              `far=${farResults.join(",")}`
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest(
        "変換済みworld triangleのAABBと包含結果を維持する",
        () => {
          const world = createTestWorld();
          try {
            const box = createBox(
              world,
              "TransformedContainsBox",
              2,
              2,
              2,
              Vector3.Zero()
            );
            box.position.set(2.5, -1.25, 4);
            box.rotation.set(0.35, -0.6, 0.2);
            box.scaling.set(-1.5, 0.75, 2);
            const worldMatrix = box.computeWorldMatrix(true).clone();
            const contains = createStageBoundaryContainsQuery(box);
            const inside = Vector3.TransformCoordinates(
              Vector3.Zero(),
              worldMatrix
            );
            const surface = Vector3.TransformCoordinates(
              new Vector3(1, 0, 0),
              worldMatrix
            );
            const outside = Vector3.TransformCoordinates(
              new Vector3(1.01, 0, 0),
              worldMatrix
            );
            const farOutside = Vector3.TransformCoordinates(
              new Vector3(4, 4, 4),
              worldMatrix
            );
            return {
              ok:
                contains(inside) &&
                contains(surface) &&
                !contains(outside) &&
                !contains(farOutside),
              detail:
                `inside=${contains(inside)} / ` +
                `surface=${contains(surface)} / ` +
                `outside=${contains(outside)} / ` +
                `far=${contains(farOutside)}`
            };
          } finally {
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "Sweepはmover別候補だけを検査し既知safe始点を再利用する",
        () => {
          const world = createTestWorld();
          try {
            const bitMesh = createTriangleMesh(
              world,
              "BitOnlyTriangle",
              [
                new Vector3(0, -2, -2),
                new Vector3(0, 2, -2),
                new Vector3(0, 0, 2)
              ]
            );
            const groundOnlyMesh = new Mesh(
              "GroundOnlyTriangle",
              world.scene
            );
            const groundVertexData = new VertexData();
            groundVertexData.positions = [
              0, -2, -2,
              0, 2, -2,
              0, 0, 2
            ];
            groundVertexData.indices = [0, 1, 2];
            groundVertexData.applyToMesh(groundOnlyMesh);
            groundOnlyMesh.computeWorldMatrix(true);
            const sphereDiagnostics: Array<
              Readonly<{
                indexedTriangleCount: number;
                exactTriangleTestCount: number;
                knownSafeCenterHit: boolean;
                initialContactProjectionCount: number;
                contactCandidateMaterializationCount: number;
              }>
            > = [];
            const movementColliders = Object.freeze({
              player: Object.freeze([]),
              npc: Object.freeze([]),
              bit: Object.freeze([bitMesh])
            });
            const queries = createTrackedSpatialQueries(
              world,
              {
                movementColliders,
                groundColliders: Object.freeze([groundOnlyMesh]),
                beamBlockers: Object.freeze([groundOnlyMesh]),
                sightBlockers: Object.freeze([groundOnlyMesh]),
                bitObstacles: movementColliders.bit
              },
              {
                volumes: Object.freeze([]),
                diagnostics: Object.freeze({
                  recordRayQuery: () => {},
                  recordSphereSweep: (
                    _moverKind,
                    _visitedNodeCount,
                    indexedTriangleCount,
                    exactTriangleTestCount,
                    knownSafeCenterHit,
                    initialContactProjectionCount,
                    contactCandidateMaterializationCount
                  ) => {
                    sphereDiagnostics.push(
                      Object.freeze({
                        indexedTriangleCount,
                        exactTriangleTestCount,
                        knownSafeCenterHit,
                        initialContactProjectionCount,
                        contactCandidateMaterializationCount
                      })
                    );
                  }
                })
              }
            );
            queries.castMovementSphere(
              "bit",
              new Vector3(-3, 0, 0),
              new Vector3(-2, 0, 0),
              0.54
            );
            const hit = queries.castMovementSphere(
              "bit",
              new Vector3(-2, 0, 0),
              new Vector3(2, 0, 0),
              0.54
            );
            queries.castMovementSphere(
              "bit",
              new Vector3(10, 10, 10),
              new Vector3(11, 10, 10),
              0.54
            );
            queries.castMovementSphere(
              "bit",
              new Vector3(11, 10, 10),
              new Vector3(12, 10, 10),
              0.54
            );
            return {
              ok:
                hit?.mesh === bitMesh &&
                sphereDiagnostics[1]?.indexedTriangleCount === 1 &&
                sphereDiagnostics[1]?.exactTriangleTestCount === 1 &&
                sphereDiagnostics[1]?.knownSafeCenterHit === true &&
                sphereDiagnostics[1]?.initialContactProjectionCount === 0 &&
                sphereDiagnostics[1]?.contactCandidateMaterializationCount ===
                  1 &&
                sphereDiagnostics[3]?.indexedTriangleCount === 0 &&
                sphereDiagnostics[3]?.exactTriangleTestCount === 0 &&
                sphereDiagnostics[3]?.knownSafeCenterHit === true &&
                sphereDiagnostics[3]?.initialContactProjectionCount === 0,
              detail: sphereDiagnostics
                .map(
                  (entry) =>
                    `${entry.indexedTriangleCount}/` +
                    `${entry.exactTriangleTestCount}/` +
                    `${entry.knownSafeCenterHit}/` +
                    `${entry.initialContactProjectionCount}/` +
                    `${entry.contactCandidateMaterializationCount}`
                )
                .join(" | ")
            };
          } finally {
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "known-safe Sweep microbenchはmover候補を1回だけ検査する",
        () => {
          const world = createTestWorld();
          try {
            const vertices = Object.freeze([
              new Vector3(0, -2, -2),
              new Vector3(0, 2, -2),
              new Vector3(0, -2, 2)
            ]) as readonly [Vector3, Vector3, Vector3];
            const bitMesh = createTriangleMesh(
              world,
              "SweepMicrobenchBitTriangle",
              vertices
            );
            const groundOnlyMesh = new Mesh(
              "SweepMicrobenchGroundTriangle",
              world.scene
            );
            const groundVertexData = new VertexData();
            groundVertexData.positions = vertices.flatMap((vertex) =>
              vertex.asArray()
            );
            groundVertexData.indices = [0, 1, 2];
            groundVertexData.applyToMesh(groundOnlyMesh);
            groundOnlyMesh.computeWorldMatrix(true);
            const iterationCount = 1_000;
            let measuring = false;
            let recordedSweeps = 0;
            let indexedTriangles = 0;
            let exactTriangleTests = 0;
            let knownSafeSweeps = 0;
            let initialContactProjections = 0;
            let contactCandidateMaterializations = 0;
            const movementColliders = Object.freeze({
              player: Object.freeze([]),
              npc: Object.freeze([]),
              bit: Object.freeze([bitMesh])
            });
            const queries = createTrackedSpatialQueries(
              world,
              {
                movementColliders,
                groundColliders: Object.freeze([groundOnlyMesh]),
                beamBlockers: Object.freeze([groundOnlyMesh]),
                sightBlockers: Object.freeze([groundOnlyMesh]),
                bitObstacles: movementColliders.bit
              },
              {
                volumes: Object.freeze([]),
                diagnostics: Object.freeze({
                  recordRayQuery: () => {},
                  recordSphereSweep: (
                    _moverKind,
                    _visitedNodeCount,
                    indexedTriangleCount,
                    exactTriangleTestCount,
                    knownSafeCenterHit,
                    initialContactProjectionCount,
                    contactCandidateMaterializationCount
                  ) => {
                    if (!measuring) {
                      return;
                    }
                    recordedSweeps += 1;
                    indexedTriangles += indexedTriangleCount;
                    exactTriangleTests += exactTriangleTestCount;
                    knownSafeSweeps += knownSafeCenterHit ? 1 : 0;
                    initialContactProjections +=
                      initialContactProjectionCount;
                    contactCandidateMaterializations +=
                      contactCandidateMaterializationCount;
                  }
                })
              }
            );
            const left = new Vector3(-2, 1.9, 1.9);
            const right = new Vector3(2, 1.9, 1.9);
            queries.castMovementSphere(
              "bit",
              new Vector3(-3, 1.9, 1.9),
              left,
              0.54
            );
            measuring = true;
            const startedAt = performance.now();
            let from = left;
            let to = right;
            let unexpectedHit = false;
            for (let index = 0; index < iterationCount; index += 1) {
              unexpectedHit =
                queries.castMovementSphere("bit", from, to, 0.54) !==
                  null || unexpectedHit;
              const previousFrom = from;
              from = to;
              to = previousFrom;
            }
            const durationMilliseconds = performance.now() - startedAt;
            return {
              ok:
                !unexpectedHit &&
                recordedSweeps === iterationCount &&
                knownSafeSweeps === iterationCount &&
                indexedTriangles === iterationCount &&
                exactTriangleTests === iterationCount &&
                initialContactProjections === 0 &&
                contactCandidateMaterializations === 0 &&
                Number.isFinite(durationMilliseconds),
              detail:
                `${iterationCount} sweeps / ` +
                `${durationMilliseconds.toFixed(3)}ms / ` +
                `indexed=${indexedTriangles} / exact=${exactTriangleTests} / ` +
                `initial=${initialContactProjections} / ` +
                `materialized=${contactCandidateMaterializations}`
            };
          } finally {
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "固定seedのRayと半径0.54 Sweepは旧pick／解析goldenと一致する",
        () => {
          const world = createTestWorld();
          try {
            let randomState = 0x5eed_1234;
            const nextRandom = () => {
              randomState =
                (Math.imul(randomState, 1_664_525) +
                  1_013_904_223) >>>
                0;
              return randomState / 0x1_0000_0000;
            };
            const wallCount = 24;
            const walls = Array.from(
              { length: wallCount },
              (_, index) =>
                createBox(
                  world,
                  `BvhGoldenWall-${index}`,
                  0.1,
                  4,
                  2,
                  new Vector3(
                    2 + nextRandom() * 6,
                    1,
                    index * 4
                  )
                )
            );
            const wallSet = new Set(walls);
            const movementColliders = Object.freeze({
              player: Object.freeze([...walls]),
              npc: Object.freeze([...walls]),
              bit: Object.freeze([...walls])
            });
            const queries = createTrackedSpatialQueries(
              world,
              {
                movementColliders,
                groundColliders: Object.freeze([]),
                beamBlockers: Object.freeze([...walls]),
                sightBlockers: Object.freeze([...walls]),
                bitObstacles: movementColliders.bit
              },
              { volumes: Object.freeze([]) }
            );
            const radius = 0.54;
            const pathLength = 11;
            let matchedCount = 0;
            const mismatches: string[] = [];
            walls.forEach((wall, index) => {
              const laneZ = index * 4;
              const from = new Vector3(-1, 1, laneZ);
              const to = new Vector3(10, 1, laneZ);
              const ray = new Ray(from, Vector3.Right(), pathLength);
              const legacyPick = world.scene.pickWithRay(
                ray,
                (mesh) => mesh instanceof Mesh && wallSet.has(mesh),
                false
              );
              const rayHit = queries.castBeamSegment(from, to);
              const sphereHit = queries.castMovementSphere(
                "bit",
                from,
                to,
                radius
              );
              const faceX =
                wall.getBoundingInfo().boundingBox.minimumWorld.x;
              const expectedRayDistance = faceX - from.x;
              const expectedSphereFraction =
                (faceX - radius - from.x) / pathLength;
              const legacyNormal = legacyPick?.getNormal(true, true);
              const matched =
                legacyPick?.hit === true &&
                legacyPick.pickedMesh === wall &&
                rayHit?.mesh === wall &&
                sphereHit?.mesh === wall &&
                legacyPick.pickedPoint !== null &&
                legacyNormal !== null &&
                legacyNormal !== undefined &&
                approximately(
                  rayHit.distance,
                  legacyPick.distance,
                  1e-6
                ) &&
                approximately(
                  rayHit.distance,
                  expectedRayDistance,
                  1e-6
                ) &&
                Vector3.Distance(
                  rayHit.point,
                  legacyPick.pickedPoint
                ) <= 1e-6 &&
                Vector3.Distance(rayHit.normal, legacyNormal) <= 1e-6 &&
                approximately(
                  sphereHit.fraction,
                  expectedSphereFraction,
                  1e-6
                ) &&
                approximately(sphereHit.center.x, faceX - radius, 1e-6) &&
                approximately(sphereHit.point.x, faceX, 1e-6) &&
                approximately(sphereHit.center.y, 1, 1e-6) &&
                approximately(sphereHit.center.z, laneZ, 1e-6);
              if (matched) {
                matchedCount += 1;
              } else {
                mismatches.push(
                  `${index}:ray=${rayHit?.mesh.name ?? "none"}` +
                    `/sphere=${sphereHit?.mesh.name ?? "none"}`
                );
              }
            });
            return {
              ok: matchedCount === wallCount,
              detail:
                `${matchedCount}/${wallCount} fixtures` +
                (mismatches.length > 0
                  ? ` / ${mismatches.join(",")}`
                  : "")
            };
          } finally {
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "長い対角線Sweepは0.5m直方体走査よりBVH訪問を削減する",
        () => {
          const world = createTestWorld();
          try {
            const triangleCount = 128;
            for (let index = 0; index < triangleCount; index += 1) {
              const offset =
                -40 + (80 * index) / (triangleCount - 1);
              createTriangleMesh(
                world,
                `BvhDiagonalTriangle-${index}`,
                [
                  new Vector3(offset, offset + 20, offset - 20),
                  new Vector3(offset + 0.4, offset + 20, offset - 20),
                  new Vector3(offset, offset + 20.4, offset - 20)
                ]
              );
            }
            let visitedNodeCount = -1;
            let indexedTriangleCount = -1;
            let exactTriangleTestCount = -1;
            let knownSafeCenterHit = false;
            const movementColliders = Object.freeze({
              player: Object.freeze([]),
              npc: Object.freeze([]),
              bit: Object.freeze([...world.colliders])
            });
            const queries = createTrackedSpatialQueries(
              world,
              {
                movementColliders,
                groundColliders: Object.freeze([]),
                beamBlockers: Object.freeze([]),
                sightBlockers: Object.freeze([]),
                bitObstacles: movementColliders.bit
              },
              {
                volumes: Object.freeze([]),
                diagnostics: Object.freeze({
                  recordRayQuery: () => {},
                  recordSphereSweep: (
                    _moverKind,
                    visitedCount,
                    indexedCount,
                    exactCount,
                    knownSafe
                  ) => {
                    if (!knownSafe) {
                      return;
                    }
                    visitedNodeCount = visitedCount;
                    indexedTriangleCount = indexedCount;
                    exactTriangleTestCount = exactCount;
                    knownSafeCenterHit = true;
                  }
                })
              }
            );
            const from = new Vector3(-50, -50, -50);
            const to = new Vector3(50, 50, 50);
            queries.castMovementSphere("bit", from, from, 0.54);
            const hit = queries.castMovementSphere(
              "bit",
              from,
              to,
              0.54
            );
            const minimumCell = Math.floor((-50 - 0.54 - 1e-9) / 0.5);
            const maximumCell = Math.floor((50 + 0.54 + 1e-9) / 0.5);
            const axisCellCount = maximumCell - minimumCell + 1;
            const legacyVisitedCellCount = axisCellCount ** 3;
            return {
              ok:
                hit === null &&
                knownSafeCenterHit &&
                visitedNodeCount > 0 &&
                visitedNodeCount * 1_000 < legacyVisitedCellCount &&
                indexedTriangleCount === 0 &&
                exactTriangleTestCount === 0,
              detail:
                `nodes=${visitedNodeCount} / ` +
                `legacyCells=${legacyVisitedCellCount} / ` +
                `indexed=${indexedTriangleCount} / ` +
                `exact=${exactTriangleTestCount}`
            };
          } finally {
            world.dispose();
          }
        }
      )
    );

    results.push(
      executeTest("同fractionはscene先行Meshを維持する", () => {
        const world = createTestWorld();
        try {
          const first = createTriangleMesh(world, "FirstTieTriangle", [
            new Vector3(0, -2, -2),
            new Vector3(0, 2, -2),
            new Vector3(0, 0, 2)
          ]);
          createTriangleMesh(world, "SecondTieTriangle", [
            new Vector3(0, -2, -2),
            new Vector3(0, 2, -2),
            new Vector3(0, 0, 2)
          ]);
          const hit = createQueries(world).castMovementSphere(
            "bit",
            new Vector3(-2, 0, 0),
            new Vector3(2, 0, 0),
            0.54
          );
          return {
            ok: hit?.mesh === first && hit.fraction === 0.365,
            detail: `${hit?.mesh.name ?? "none"} / ${hit?.fraction ?? "none"}`
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("同fractionは同一Meshの先行triangleを維持する", () => {
        const world = createTestWorld();
        try {
          const mesh = new Mesh("TriangleIndexTie", world.scene);
          const positions = [
            0, -2, -2,
            0, 2, -2,
            0, 0, 2,
            0, -2, -2,
            0, 2, -2,
            0, 0, 2
          ];
          const vertexData = new VertexData();
          vertexData.positions = positions;
          vertexData.indices = [0, 1, 2, 3, 4, 5];
          vertexData.applyToMesh(mesh);
          mesh.computeWorldMatrix(true);
          (world.colliders as Mesh[]).push(mesh);
          let selectedTriangleIndex = -1;
          const movementColliders = Object.freeze({
            player: Object.freeze([]),
            npc: Object.freeze([]),
            bit: Object.freeze([mesh])
          });
          const queries = createTrackedSpatialQueries(
            world,
            {
              movementColliders,
              groundColliders: Object.freeze([]),
              beamBlockers: Object.freeze([]),
              sightBlockers: Object.freeze([]),
              bitObstacles: movementColliders.bit
            },
            {
              volumes: Object.freeze([]),
              diagnostics: Object.freeze({
                recordRayQuery: () => {},
                recordSphereSweep: (
                  _moverKind,
                  _visitedNodeCount,
                  _indexedTriangleCount,
                  _exactTriangleTestCount,
                  knownSafeCenterHit,
                  _initialContactProjectionCount,
                  _contactCandidateMaterializationCount,
                  _selectedSceneOrder,
                  triangleIndex
                ) => {
                  if (knownSafeCenterHit) {
                    selectedTriangleIndex = triangleIndex;
                  }
                }
              })
            }
          );
          queries.castMovementSphere(
            "bit",
            new Vector3(-3, 0, 0),
            new Vector3(-2, 0, 0),
            0.54
          );
          const hit = queries.castMovementSphere(
            "bit",
            new Vector3(-2, 0, 0),
            new Vector3(2, 0, 0),
            0.54
          );
          return {
            ok:
              hit?.mesh === mesh &&
              hit.fraction === 0.365 &&
              selectedTriangleIndex === 0,
            detail:
              `${hit?.mesh.name ?? "none"} / ` +
              `${hit?.fraction ?? "none"} / triangle=${selectedTriangleIndex}`
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("通常高度選択を飛行帯の中心高度範囲内に制限する", () => {
        const world = createTestWorld();
        try {
          createBox(
            world,
            "BandFloor",
            4,
            0.1,
            4,
            new Vector3(0, -0.05, 0)
          );
          createBox(
            world,
            "BandCeiling",
            4,
            0.1,
            4,
            new Vector3(0, 0.85, 0)
          );
          const safety = createBitFlightSafety(createQueries(world));
          const band: BitFlightBand = Object.freeze({
            zoneId: toBitFlightZoneId("multi-purpose-interior"),
            id: toBitFlightBandId("main-air-volume"),
            minimumCenterHeight: 0.25,
            maximumCenterHeight: 0.45
          });
          const selected = safety.selectBandCenterHeight(
            band,
            new Vector3(0, 0.35, 0),
            1,
            1
          );
          return {
            ok:
              selected !== null &&
              approximately(selected.center.y, band.maximumCenterHeight) &&
              !selected.usedLowCeilingAllowance &&
              safety.isCenterSafe(selected.center),
            detail: selected
              ? `selected=${selected.center.y.toFixed(6)} / range=${band.minimumCenterHeight}..${band.maximumCenterHeight}`
              : "高度を選択できませんでした"
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("包絡が収まる低天井だけ通常帯下限未満を明示許可する", () => {
        const world = createTestWorld();
        try {
          createBox(
            world,
            "LowFloor",
            4,
            0.1,
            4,
            new Vector3(0, -0.05, 0)
          );
          createBox(
            world,
            "LowCeiling",
            4,
            0.1,
            4,
            new Vector3(0, 0.4, 0)
          );
          const safety = createBitFlightSafety(createQueries(world));
          const band: BitFlightBand = Object.freeze({
            zoneId: toBitFlightZoneId("compact-interior"),
            id: toBitFlightBandId("low-clearance"),
            minimumCenterHeight: 0.25,
            maximumCenterHeight: 0.45
          });
          const selected = safety.selectLowCeilingCenterHeight(
            band,
            new Vector3(0, 0.175, 0),
            0.18,
            1
          );
          return {
            ok:
              selected !== null &&
              selected.usedLowCeilingAllowance &&
              selected.heightMode === "low-ceiling" &&
              selected.center.y < band.minimumCenterHeight &&
              safety.isCenterSafe(selected.center),
            detail: selected
              ? `selected=${selected.center.y.toFixed(6)} / below=${selected.usedLowCeilingAllowance}`
              : "高度を選択できませんでした"
          };
        } finally {
          world.dispose();
        }
      })
    );

    results.push(
      executeTest("直径未満の低天井には安全中心位置が存在しない", () => {
        const world = createTestWorld();
        try {
          createBox(
            world,
            "TooTightFloor",
            4,
            0.1,
            4,
            new Vector3(0, -0.05, 0)
          );
          createBox(
            world,
            "TooTightCeiling",
            4,
            0.1,
            4,
            new Vector3(0, 0.3, 0)
          );
          const safety = createBitFlightSafety(createQueries(world));
          const middle = new Vector3(0, 0.125, 0);
          return {
            ok: !safety.isCenterSafe(middle),
            detail: `gap=0.25 / envelopeDiameter=${(
              BIT_FLIGHT_ENVELOPE_RADIUS_WORLD_UNITS * 2
            ).toFixed(3)}`
          };
        } finally {
          world.dispose();
        }
      })
    );

    return Object.freeze(results);
  };
