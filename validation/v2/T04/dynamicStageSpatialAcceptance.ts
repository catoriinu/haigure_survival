import {
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import { createDynamicStageSpatialVariants } from "../../../src/world/dynamicStageSpatialVariants";
import {
  createStageSpatialQueries,
  type StageVolume
} from "../../../src/world/stageSpatialQueries";

export type DynamicStageSpatialAcceptanceCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const captureMessage = (action: () => void) => {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

export const runDynamicStageSpatialAcceptance =
  (): readonly DynamicStageSpatialAcceptanceCheck[] => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const blocker = MeshBuilder.CreateBox(
      "COL_DynamicSpatialAcceptance",
      { size: 1 },
      scene
    );
    const occupancyMesh = MeshBuilder.CreateBox(
      "VOL_ElevatorCarOccupancy_DynamicSpatialAcceptance",
      { size: 1 },
      scene
    );
    blocker.computeWorldMatrix(true);
    occupancyMesh.computeWorldMatrix(true);
    const occupancyVolume: StageVolume = Object.freeze({
      id: "VOL_ElevatorCarOccupancy_DynamicSpatialAcceptance",
      role: "elevator_car_occupancy",
      playerSpawnId: null,
      bitFlightBand: null,
      navigationAreaId: null,
      mesh: occupancyMesh
    });
    const movementColliders = Object.freeze({
      player: Object.freeze([blocker]),
      npc: Object.freeze([blocker]),
      bit: Object.freeze([blocker])
    });
    const activeSet = Object.freeze({
      movementColliders,
      groundColliders: Object.freeze([blocker]),
      beamBlockers: Object.freeze([blocker]),
      sightBlockers: Object.freeze([blocker]),
      bitObstacles: Object.freeze([blocker])
    });
    const variants = createDynamicStageSpatialVariants(activeSet);
    let replaceDuringQuery = false;
    const queries = createStageSpatialQueries(scene, variants, {
      volumes: [occupancyVolume],
      diagnostics: {
        recordRayQuery: () => {
          if (replaceDuringQuery) {
            replaceDuringQuery = false;
            variants.replaceActiveSet({
              movementColliders: {
                player: [],
                npc: [],
                bit: []
              },
              groundColliders: [],
              beamBlockers: [],
              sightBlockers: [],
              bitObstacles: []
            });
          }
        }
      }
    });
    const checks: DynamicStageSpatialAcceptanceCheck[] = [];
    const from = new Vector3(-2, 0, 0);
    const to = new Vector3(2, 0, 0);
    try {
      const initialHit = queries.castBeamSegment(from, to);
      checks.push({
        name: "動的空間snapshotの初期revision",
        ok:
          variants.revision === 0 &&
          queries.revision === 0 &&
          initialHit?.mesh === blocker &&
          queries.containsVolume(
            "elevator_car_occupancy",
            Vector3.Zero()
          ),
        detail: `variants=${variants.revision} / queries=${queries.revision} / hit=${initialHit?.mesh.name ?? "none"} / occupancy=${queries.containsVolume("elevator_car_occupancy", Vector3.Zero())}`
      });

      blocker.position.x = 5;
      blocker.computeWorldMatrix(true);
      variants.replaceActiveSet(activeSet);
      const movedHit = queries.castBeamSegment(from, to);
      checks.push({
        name: "Transform変更後のrevisionとworld三角形再構築",
        ok:
          variants.revision === 1 &&
          queries.revision === 1 &&
          movedHit === null,
        detail: `revision=${variants.revision} / hit=${movedHit?.mesh.name ?? "none"}`
      });

      blocker.position.x = 0;
      blocker.computeWorldMatrix(true);
      variants.replaceActiveSet(activeSet);
      replaceDuringQuery = true;
      const leasedHit = queries.castSightSegment(from, to);
      const afterSwapHit = queries.castSightSegment(from, to);
      checks.push({
        name: "問い合わせ開始snapshotの原子的保持",
        ok:
          leasedHit?.mesh === blocker &&
          afterSwapHit === null &&
          variants.revision === 3 &&
          queries.revision === 3,
        detail: `leased=${leasedHit?.mesh.name ?? "none"} / current=${afterSwapHit?.mesh.name ?? "none"} / revision=${queries.revision}`
      });

      const beforeFailedReplacement = variants.getSnapshot();
      const invalidMesh = new Mesh(
        "COL_DynamicSpatialInvalidAcceptance",
        scene
      );
      const failedReplacementMessage = captureMessage(() =>
        variants.replaceActiveSet({
          movementColliders: {
            player: [invalidMesh],
            npc: [invalidMesh],
            bit: [invalidMesh]
          },
          groundColliders: [invalidMesh],
          beamBlockers: [invalidMesh],
          sightBlockers: [invalidMesh],
          bitObstacles: [invalidMesh]
        })
      );
      const afterFailedReplacement = variants.getSnapshot();
      checks.push({
        name: "次revision構築失敗時のsnapshot維持",
        ok:
          failedReplacementMessage?.includes("三角形Mesh") === true &&
          afterFailedReplacement === beforeFailedReplacement &&
          afterFailedReplacement.revision === 3 &&
          queries.castBeamSegment(from, to) === null,
        detail: `revision=${afterFailedReplacement.revision} / same=${afterFailedReplacement === beforeFailedReplacement} / error=${failedReplacementMessage ?? "none"}`
      });

      checks.push({
        name: "動的空間snapshotの5集合",
        ok:
          variants.getSnapshot().movementColliders.player.length === 0 &&
          variants.getSnapshot().groundColliders.length === 0 &&
          variants.getSnapshot().beamBlockers.length === 0 &&
          variants.getSnapshot().sightBlockers.length === 0 &&
          variants.getSnapshot().bitObstacles.length === 0,
        detail: JSON.stringify({
          movement:
            variants.getSnapshot().movementColliders.player.length,
          ground: variants.getSnapshot().groundColliders.length,
          beam: variants.getSnapshot().beamBlockers.length,
          sight: variants.getSnapshot().sightBlockers.length,
          bit: variants.getSnapshot().bitObstacles.length
        })
      });

      occupancyMesh.position.x = 5;
      occupancyMesh.computeWorldMatrix(true);
      const currentSnapshot = variants.getSnapshot();
      variants.replaceActiveSet({
        movementColliders: currentSnapshot.movementColliders,
        groundColliders: currentSnapshot.groundColliders,
        beamBlockers: currentSnapshot.beamBlockers,
        sightBlockers: currentSnapshot.sightBlockers,
        bitObstacles: currentSnapshot.bitObstacles
      });
      const containsOldOccupancyPosition = queries.containsVolume(
        "elevator_car_occupancy",
        Vector3.Zero()
      );
      const containsNewOccupancyPosition = queries.containsVolume(
        "elevator_car_occupancy",
        new Vector3(5, 0, 0)
      );
      checks.push({
        name: "移動するエレベーター占有Volumeのrevision追従",
        ok:
          variants.revision === 4 &&
          queries.revision === 4 &&
          !containsOldOccupancyPosition &&
          containsNewOccupancyPosition,
        detail: `revision=${queries.revision} / old=${containsOldOccupancyPosition} / new=${containsNewOccupancyPosition}`
      });
    } finally {
      queries.dispose();
      variants.dispose();
      scene.dispose();
      engine.dispose();
    }
    const disposedQueryMessage = captureMessage(() =>
      queries.castBeamSegment(from, to)
    );
    const disposedVariantsMessage = captureMessage(() =>
      variants.getSnapshot()
    );
    checks.push({
      name: "動的空間queryとvariantの破棄後利用拒否",
      ok:
        disposedQueryMessage?.includes("破棄済み") === true &&
        disposedVariantsMessage?.includes("破棄済み") === true,
      detail: `${disposedQueryMessage ?? "none"} / ${disposedVariantsMessage ?? "none"}`
    });
    return Object.freeze(checks);
  };
