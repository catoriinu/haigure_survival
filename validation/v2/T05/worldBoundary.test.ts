import {
  Mesh,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
  VertexBuffer
} from "@babylonjs/core";

import { createStageWorldBoundary } from "../../../src/world/stageWorldBoundary";

export type WorldBoundaryTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): WorldBoundaryTestResult => {
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

const captureThrownMessage = (operation: () => unknown): string | null => {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

const vectorApproximately = (
  actual: Vector3 | null,
  expected: Vector3,
  tolerance = 1e-6
) =>
  actual !== null &&
  Vector3.DistanceSquared(actual, expected) <= tolerance * tolerance;

const createBox = (
  scene: Scene,
  name: string,
  size: number
): Mesh => {
  const mesh = MeshBuilder.CreateBox(name, { size }, scene);
  mesh.computeWorldMatrix(true);
  return mesh;
};

export const runWorldBoundaryTests =
  (): readonly WorldBoundaryTestResult[] => {
    const results: WorldBoundaryTestResult[] = [];

    results.push(
      executeTest(
        "containsとslab退出点を面・辺・隅・境界始点で判定する",
        () => {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const stage = createBox(scene, "BND_Stage", 2);
          const world = createBox(scene, "BND_WorldLimit", 4);
          const boundary = createStageWorldBoundary(world, stage);
          try {
            const containsCases =
              boundary.contains(Vector3.Zero()) &&
              boundary.contains(new Vector3(2, 0, 0)) &&
              boundary.contains(new Vector3(2, 2, 0)) &&
              boundary.contains(new Vector3(2, 2, 2)) &&
              !boundary.contains(new Vector3(2.01, 0, 0));
            const exits =
              vectorApproximately(
                boundary.findExitPoint(
                  Vector3.Zero(),
                  new Vector3(3, 0, 0)
                ),
                new Vector3(2, 0, 0)
              ) &&
              vectorApproximately(
                boundary.findExitPoint(
                  Vector3.Zero(),
                  new Vector3(3, 3, 0)
                ),
                new Vector3(2, 2, 0)
              ) &&
              vectorApproximately(
                boundary.findExitPoint(
                  Vector3.Zero(),
                  new Vector3(3, 3, 3)
                ),
                new Vector3(2, 2, 2)
              ) &&
              vectorApproximately(
                boundary.findExitPoint(
                  new Vector3(2, 0, 0),
                  new Vector3(3, 0, 0)
                ),
                new Vector3(2, 0, 0)
              ) &&
              vectorApproximately(
                boundary.findExitPoint(
                  Vector3.Zero(),
                  new Vector3(-3, 0, 0)
                ),
                new Vector3(-2, 0, 0)
              );
            const misses =
              boundary.findExitPoint(
                Vector3.Zero(),
                new Vector3(1, 1, 1)
              ) === null &&
              boundary.findExitPoint(
                Vector3.Zero(),
                new Vector3(1.9999985, 0, 0)
              ) === null &&
              boundary.findExitPoint(
                new Vector3(2, 0, 0),
                Vector3.Zero()
              ) === null &&
              boundary.findExitPoint(
                new Vector3(3, 0, 0),
                new Vector3(4, 0, 0)
              ) === null;
            boundary.dispose();
            const disposedContains = captureThrownMessage(() =>
              boundary.contains(Vector3.Zero())
            );
            const disposedExit = captureThrownMessage(() =>
              boundary.findExitPoint(
                Vector3.Zero(),
                Vector3.Right()
              )
            );
            return {
              ok:
                containsCases &&
                exits &&
                misses &&
                disposedContains?.includes("破棄済み") === true &&
                disposedExit?.includes("破棄済み") === true,
              detail:
                `contains=${containsCases} / exits=${exits} / ` +
                `misses=${misses} / oldRef=${disposedContains ?? "none"}`
            };
          } finally {
            scene.dispose();
            engine.dispose();
          }
        }
      )
    );

    results.push(
      executeTest(
        "開放・退化・非軸平行・ベベル形状を拒否する",
        () => {
          const engine = new NullEngine();
          const scene = new Scene(engine);
          const stage = createBox(scene, "BND_Stage", 1);
          const open = createBox(scene, "WorldOpen", 4);
          const openIndices = open.getIndices();
          if (!openIndices) {
            throw new Error("開放形状用indexがありません");
          }
          open.setIndices(openIndices.slice(0, -3));
          const openMessage = captureThrownMessage(() =>
            createStageWorldBoundary(open, stage)
          );

          const duplicateHalfFaces = new Mesh(
            "WorldDuplicateHalfFaces",
            scene
          );
          duplicateHalfFaces.setVerticesData(
            VertexBuffer.PositionKind,
            [
              -2, -2, -2, -2, -2, 2, -2, 2, -2, -2, 2, 2,
              2, -2, -2, 2, -2, 2, 2, 2, -2, 2, 2, 2
            ]
          );
          duplicateHalfFaces.setIndices([
            0, 1, 3, 0, 1, 3,
            4, 5, 7, 4, 5, 7,
            0, 1, 5, 0, 1, 5,
            2, 3, 7, 2, 3, 7,
            0, 2, 6, 0, 2, 6,
            1, 3, 7, 1, 3, 7
          ]);
          duplicateHalfFaces.computeWorldMatrix(true);
          const duplicateHalfFacesMessage = captureThrownMessage(() =>
            createStageWorldBoundary(duplicateHalfFaces, stage)
          );

          const degenerate = createBox(scene, "WorldDegenerate", 4);
          degenerate.scaling.x = 0;
          degenerate.computeWorldMatrix(true);
          const degenerateMessage = captureThrownMessage(() =>
            createStageWorldBoundary(degenerate, stage)
          );

          const rotated = createBox(scene, "WorldRotated", 4);
          rotated.rotation.y = Math.PI / 8;
          rotated.computeWorldMatrix(true);
          const rotatedMessage = captureThrownMessage(() =>
            createStageWorldBoundary(rotated, stage)
          );

          const beveled = MeshBuilder.CreateCylinder(
            "WorldBeveled",
            {
              height: 4,
              diameter: 4,
              tessellation: 8
            },
            scene
          );
          beveled.computeWorldMatrix(true);
          const beveledMessage = captureThrownMessage(() =>
            createStageWorldBoundary(beveled, stage)
          );
          const ok =
            openMessage !== null &&
            duplicateHalfFacesMessage !== null &&
            degenerateMessage !== null &&
            rotatedMessage !== null &&
            beveledMessage !== null;
          scene.dispose();
          engine.dispose();
          return {
            ok,
            detail:
              `open=${openMessage ?? "none"} / ` +
              `duplicateHalf=${duplicateHalfFacesMessage ?? "none"} / ` +
              `degenerate=${degenerateMessage ?? "none"} / ` +
              `rotated=${rotatedMessage ?? "none"} / ` +
              `beveled=${beveledMessage ?? "none"}`
          };
        }
      )
    );

    results.push(
      executeTest("BND_Stageのはみ出しを拒否する", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const stage = createBox(scene, "BND_Stage", 5);
        const world = createBox(scene, "BND_WorldLimit", 4);
        const message = captureThrownMessage(() =>
          createStageWorldBoundary(world, stage)
        );
        scene.dispose();
        engine.dispose();
        return {
          ok: message?.includes("BND_Stage全体") === true,
          detail: message ?? "例外なし"
        };
      })
    );

    return Object.freeze(results);
  };
