import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  createNavigationSurfaceVolumeSampler
} from "../../../src/world/navigationSurfaceVolumeSampler";
import type {
  NavigationLocation,
  NavigationSurfaceTriangle,
  NavigationWorld
} from "../../../src/world/navigationWorld";
import {
  createStageVolumeSpawnSampler
} from "../../../src/world/stageSpawnSampler";
import {
  createStageBoundaryContainsQuery,
  type StageVolume
} from "../../../src/world/stageSpatialQueries";
import {
  assert,
  createSequenceRandom,
  executeTest
} from "./testUtils";

const createTriangle = (
  a: Vector3,
  b: Vector3,
  c: Vector3
): NavigationSurfaceTriangle =>
  Object.freeze({
    a,
    b,
    c,
    area: Vector3.Cross(b.subtract(a), c.subtract(a)).length() / 2
  });

const createRectangleTriangles = (
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number
) => {
  const southwest = new Vector3(minimumX, 0, minimumZ);
  const southeast = new Vector3(maximumX, 0, minimumZ);
  const northeast = new Vector3(maximumX, 0, maximumZ);
  const northwest = new Vector3(minimumX, 0, maximumZ);
  return Object.freeze([
    createTriangle(southwest, southeast, northeast),
    createTriangle(southwest.clone(), northeast.clone(), northwest)
  ]);
};

const createVolume = (
  scene: Scene,
  id: string,
  role: StageVolume["role"],
  centerX: number,
  width: number
): StageVolume => {
  const mesh = MeshBuilder.CreateBox(
    `${id}-mesh`,
    { width, height: 2, depth: 2 },
    scene
  );
  mesh.position.x = centerX;
  mesh.computeWorldMatrix(true);
  return Object.freeze({
    id,
    role,
    bitFlightBand: null,
    playerSpawnId: null,
    navigationAreaId: null,
    mesh
  });
};

const testNavMeshIntersectionAreaWeighting = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const npcSmall = createVolume(scene, "npc-small", "npc_spawn", -2, 2);
    const npcLarge = createVolume(scene, "npc-large", "npc_spawn", 2, 4);
    const bitSmall = createVolume(scene, "bit-small", "bit_spawn", -2, 2);
    const bitLarge = createVolume(scene, "bit-large", "bit_spawn", 2, 4);
    const triangles = createRectangleTriangles(-3, 4, -1, 1);
    const projectPoint = (position: Vector3): NavigationLocation =>
      Object.freeze({
        position: new Vector3(position.x, 0, position.z),
        polygonRef: 1
      });
    const navigation: NavigationWorld = Object.freeze({
      getSurfaceTriangles: () => triangles,
      projectPoint,
      findSurfacePath: () => {
        throw new Error("面積抽選fixtureではfindSurfacePathを呼び出しません。");
      },
      findPath: () => {
        throw new Error("面積抽選fixtureではfindPathを呼び出しません。");
      },
      constrainMovement: () => {
        throw new Error("面積抽選fixtureではconstrainMovementを呼び出しません。");
      },
      randomPointAround: () => {
        throw new Error("面積抽選fixtureではrandomPointAroundを呼び出しません。");
      },
      createDebugMesh: () => {
        throw new Error("面積抽選fixtureではcreateDebugMeshを呼び出しません。");
      },
      dispose: () => {}
    });

    const npcSampler = createStageVolumeSpawnSampler(
      Object.freeze([npcSmall, npcLarge]),
      navigation,
      {
        maxAttempts: 16,
        projectionMaxDistance: 1,
        random: () => 0.5
      }
    );
    const bitSampler = createNavigationSurfaceVolumeSampler(
      Object.freeze([
        Object.freeze({ volume: bitSmall, triangles }),
        Object.freeze({ volume: bitLarge, triangles })
      ])
    );

    const expectedAreas = Object.freeze([4, 8]);
    for (const areas of [npcSampler.areas, bitSampler.areas]) {
      assert(areas.length === 2, `交差面積件数が不正です: ${areas.length}`);
      areas.forEach((area, index) => {
        assert(
          Math.abs(area.area - expectedAreas[index]) <= 1e-6,
          `NavMesh交差面積が不正です: ${area.volumeId}=${area.area}`
        );
      });
    }

    const counts = new Map<string, number>();
    for (let index = 0; index < 300; index += 1) {
      const random = createSequenceRandom([
        (index + 0.5) / 300,
        0.25,
        0.5
      ]);
      const sample = bitSampler.sample(random.random);
      counts.set(sample.volumeId, (counts.get(sample.volumeId) ?? 0) + 1);
    }
    assert(
      counts.get(bitSmall.id) === 100 && counts.get(bitLarge.id) === 200,
      `面積比1:2の抽選境界が不正です: ${JSON.stringify(Object.fromEntries(counts))}`
    );

    const npcRandom = createSequenceRandom([0.1, 0.25, 0.5]);
    const npcPoint = createStageVolumeSpawnSampler(
      Object.freeze([npcSmall, npcLarge]),
      navigation,
      {
        maxAttempts: 1,
        projectionMaxDistance: 1,
        random: npcRandom.random
      }
    ).samplePoints(1, 0, Object.freeze([]), () => false)[0];
    assert(
      npcPoint.position.x >= -3 && npcPoint.position.x <= -1,
      `NPCの面積抽選点が小Volume外です: ${npcPoint.position.x}`
    );

    return (
      `NPC=${npcSampler.areas.map((area) => `${area.volumeId}:${area.area}`).join(",")} / ` +
      `BIT=${counts.get(bitSmall.id)}:${counts.get(bitLarge.id)}`
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
};

const testRotatedVolumeUsesTrueIntersection = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const mesh = MeshBuilder.CreateBox(
      "rotated-spawn-volume-mesh",
      { width: 2, height: 2, depth: 2 },
      scene
    );
    mesh.rotation.y = Math.PI / 4;
    mesh.computeWorldMatrix(true);
    const volume: StageVolume = Object.freeze({
      id: "rotated-spawn-volume",
      role: "npc_spawn",
      bitFlightBand: null,
      playerSpawnId: null,
      navigationAreaId: null,
      mesh
    });
    const triangles = createRectangleTriangles(-3, 3, -3, 3);
    const sampler = createNavigationSurfaceVolumeSampler(
      Object.freeze([Object.freeze({ volume, triangles })])
    );
    assert(
      Math.abs(sampler.totalArea - 4) <= 1e-6,
      `45度回転Volumeの実交差面積が4ではありません: ${sampler.totalArea}`
    );
    const contains = createStageBoundaryContainsQuery(mesh);
    for (let index = 0; index < 64; index += 1) {
      const random = createSequenceRandom([
        (index + 0.5) / 64,
        ((index * 17) % 64 + 0.5) / 64,
        ((index * 29) % 64 + 0.5) / 64
      ]);
      const sample = sampler.sample(random.random);
      assert(
        contains(sample.point),
        `45度回転Volume外の点を抽選しました: (${sample.point.x}, ${sample.point.y}, ${sample.point.z})`
      );
    }
    return `area=${sampler.totalArea} / samples=64`;
  } finally {
    scene.dispose();
    engine.dispose();
  }
};

export const runSurfaceSpawnTests = async () =>
  Object.freeze([
    await executeTest(
      "NPC/BIT Volumeのbaked NavMesh交差面積比例抽選",
      testNavMeshIntersectionAreaWeighting
    ),
    await executeTest(
      "回転Volumeの実形状NavMesh交差面積と全sample内包",
      testRotatedVolumeUsesTrueIntersection
    )
  ]);
