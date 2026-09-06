import {
  Mesh,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  createV2AlarmFloorVisualSystem,
  V2_ALARM_FLOOR_VISUALIZATION_ENABLED,
  V2_ALARM_FLOOR_VISUAL_RANGE_WORLD_UNITS
} from "../../../src/v2/alarmFloorVisualSystem";
import type {
  V2AlarmBlinkSnapshot,
  V2AlarmFloorSnapshot,
  V2AlarmFrame
} from "../../../src/v2/alarmSystem";

export type AlarmFloorVisualSystemTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): AlarmFloorVisualSystemTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail:
        error instanceof Error
          ? error.stack ?? error.message
          : String(error)
    });
  }
};

const createFloor = (
  candidateId: string,
  position: Vector3
): V2AlarmFloorSnapshot =>
  Object.freeze({
    candidateId,
    position,
    supportNormal: Vector3.Up(),
    tangent: Vector3.Right(),
    radius: 0.25
  });

const createBlink = (
  candidateId: string,
  position: Vector3,
  visible: boolean
): V2AlarmBlinkSnapshot =>
  Object.freeze({
    ...createFloor(candidateId, position),
    elapsedSeconds: 1,
    remainingSeconds: 4,
    blinkIntervalSeconds: 0.4,
    visible
  });

const createFrame = (
  activeFloors: readonly V2AlarmFloorSnapshot[],
  blinks: readonly V2AlarmBlinkSnapshot[]
): V2AlarmFrame =>
  Object.freeze({
    events: Object.freeze([]),
    activeCandidateIds: Object.freeze(
      activeFloors.map((floor) => floor.candidateId)
    ),
    activeFloors: Object.freeze(activeFloors),
    usedCandidateIds: Object.freeze([]),
    blinks: Object.freeze(blinks)
  });

export const runAlarmFloorVisualSystemTests =
  (): readonly AlarmFloorVisualSystemTestResult[] => [
    executeTest(
      "案1の可視化は明示定数で有効化されている",
      () => ({
        ok:
          V2_ALARM_FLOOR_VISUALIZATION_ENABLED === true &&
          V2_ALARM_FLOOR_VISUAL_RANGE_WORLD_UNITS === 3,
        detail:
          `enabled=${V2_ALARM_FLOOR_VISUALIZATION_ENABLED} / ` +
          `range=${V2_ALARM_FLOOR_VISUAL_RANGE_WORLD_UNITS}`
      })
    ),
    executeTest(
      "近距離の稼働床だけを水色ring instanceへ配置する",
      () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const visual = createV2AlarmFloorVisualSystem(scene);
        try {
          visual.update({
            frame: createFrame(
              [
                createFloor("near", new Vector3(1, 0, 0)),
                createFloor(
                  "far",
                  new Vector3(
                    V2_ALARM_FLOOR_VISUAL_RANGE_WORLD_UNITS + 0.01,
                    0,
                    0
                  )
                )
              ],
              []
            ),
            playerFootPosition: Vector3.Zero(),
            elapsedSeconds: 0
          });
          const diagnostics = visual.getDiagnostics();
          const mesh = scene.getMeshByName(
            "v2AlarmFloorActiveInstances"
          ) as Mesh;
          const matrices = mesh.thinInstanceGetWorldMatrices();
          return {
            ok:
              diagnostics.activeInstanceCount === 1 &&
              diagnostics.triggeredCyanInstanceCount === 0 &&
              diagnostics.triggeredBlackInstanceCount === 0 &&
              matrices.length === 1 &&
              Math.abs(matrices[0].getTranslation().x - 1) < 1e-6 &&
              mesh.isPickable === false &&
              mesh.checkCollisions === false,
            detail:
              `active=${diagnostics.activeInstanceCount} / ` +
              `matrices=${matrices.length} / alpha=${diagnostics.activeAlpha}`
          };
        } finally {
          visual.dispose();
          scene.dispose();
          engine.dispose();
        }
      }
    ),
    executeTest(
      "発報点滅を水色群と黒群へ切り替え、稼働ringを低速明滅する",
      () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const visual = createV2AlarmFloorVisualSystem(scene);
        try {
          const floor = createFloor("active", Vector3.Zero());
          visual.update({
            frame: createFrame(
              [floor],
              [createBlink("triggered", new Vector3(1, 0, 0), true)]
            ),
            playerFootPosition: Vector3.Zero(),
            elapsedSeconds: 0
          });
          const cyan = visual.getDiagnostics();
          visual.update({
            frame: createFrame(
              [floor],
              [createBlink("triggered", new Vector3(1, 0, 0), false)]
            ),
            playerFootPosition: Vector3.Zero(),
            elapsedSeconds: 0.625
          });
          const black = visual.getDiagnostics();
          return {
            ok:
              cyan.triggeredCyanInstanceCount === 1 &&
              cyan.triggeredBlackInstanceCount === 0 &&
              black.triggeredCyanInstanceCount === 0 &&
              black.triggeredBlackInstanceCount === 1 &&
              black.activeAlpha > cyan.activeAlpha,
            detail:
              `cyan=${cyan.triggeredCyanInstanceCount}/` +
              `${cyan.triggeredBlackInstanceCount} / ` +
              `black=${black.triggeredCyanInstanceCount}/` +
              `${black.triggeredBlackInstanceCount} / ` +
              `alpha=${cyan.activeAlpha.toFixed(3)}->` +
              black.activeAlpha.toFixed(3)
          };
        } finally {
          visual.dispose();
          scene.dispose();
          engine.dispose();
        }
      }
    ),
    executeTest(
      "破棄時に3ringと3materialを残さない",
      () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const meshCount = scene.meshes.length;
        const materialCount = scene.materials.length;
        const visual = createV2AlarmFloorVisualSystem(scene);
        const createdMeshCount = scene.meshes.length - meshCount;
        const createdMaterialCount =
          scene.materials.length - materialCount;
        visual.dispose();
        const remainingMeshCount = scene.meshes.length - meshCount;
        const remainingMaterialCount =
          scene.materials.length - materialCount;
        scene.dispose();
        engine.dispose();
        return {
          ok:
            createdMeshCount === 3 &&
            createdMaterialCount === 3 &&
            remainingMeshCount === 0 &&
            remainingMaterialCount === 0,
          detail:
            `created=${createdMeshCount}/${createdMaterialCount} / ` +
            `remaining=${remainingMeshCount}/${remainingMaterialCount}`
        };
      }
    )
  ];
