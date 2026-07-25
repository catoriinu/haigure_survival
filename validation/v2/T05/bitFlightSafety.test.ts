import {
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
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
import {
  createStageSpatialQueries,
  type StageSpatialQueries
} from "../../../src/world/stageSpatialQueries";

export type BitFlightSafetyTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type TestWorld = Readonly<{
  engine: NullEngine;
  scene: Scene;
  colliders: readonly Mesh[];
  queries: readonly StageSpatialQueries[];
  dispose(): void;
}>;

const createTestWorld = (): TestWorld => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const colliders: Mesh[] = [];
  const queries: StageSpatialQueries[] = [];
  return {
    engine,
    scene,
    colliders,
    queries,
    dispose: () => {
      queries.forEach((query) => query.dispose());
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

const createQueries = (world: TestWorld) => {
  const queries = createStageSpatialQueries(world.scene, {
    movementColliders: Object.freeze({
      player: Object.freeze([]),
      npc: Object.freeze([]),
      bit: Object.freeze([...world.colliders])
    }),
    groundColliders: Object.freeze([...world.colliders]),
    beamBlockers: Object.freeze([]),
    sightBlockers: Object.freeze([]),
    volumes: Object.freeze([])
  });
  (world.queries as StageSpatialQueries[]).push(queries);
  return queries;
};

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-5
) => Math.abs(actual - expected) <= tolerance;

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
