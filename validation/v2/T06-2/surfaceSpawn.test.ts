import {
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  createNavigationSurfaceVolumeChannelSampler,
  createNavigationSurfaceVolumeSampler
} from "../../../src/world/navigationSurfaceVolumeSampler";
import type {
  NavigationLocation,
  NavigationSurfaceTriangle,
  NavigationWorld
} from "../../../src/world/navigationWorld";
import {
  createStageNpcSpawnSampler,
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
  width: number,
  centerY = 0,
  height = 2
): StageVolume => {
  const mesh = MeshBuilder.CreateBox(
    `${id}-mesh`,
    { width, height, depth: 2 },
    scene
  );
  mesh.position.x = centerX;
  mesh.position.y = centerY;
  mesh.computeWorldMatrix(true);
  return Object.freeze({
    id,
    role,
    bitFlightBand: null,
    playerSpawnId: null,
    npcSpawnBiasWeight: role === "npc_spawn_bias" ? 0.5 : null,
    navigationAreaId: null,
    mesh
  });
};

const createNpcBiasVolume = (
  scene: Scene,
  id: string,
  playerSpawnId: string,
  centerX: number,
  width: number,
  weight: number,
  centerY = 0,
  height = 2
): StageVolume => {
  const mesh = MeshBuilder.CreateBox(
    `${id}-mesh`,
    { width, height, depth: 2 },
    scene
  );
  mesh.position.x = centerX;
  mesh.position.y = centerY;
  mesh.computeWorldMatrix(true);
  return Object.freeze({
    id,
    role: "npc_spawn_bias",
    bitFlightBand: null,
    playerSpawnId,
    npcSpawnBiasWeight: weight,
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
      npcSpawnBiasWeight: null,
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

const testNpcSpawnBiasChannelWeighting = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const base = createVolume(scene, "npc-base", "npc_spawn", 0, 4);
    const bias = createVolume(scene, "npc-bias", "npc_spawn_bias", -1.5, 1);
    const triangles = createRectangleTriangles(-2, 2, -1, 1);
    const sampler = createNavigationSurfaceVolumeChannelSampler(
      Object.freeze([
        Object.freeze({
          id: "npc-spawn-base",
          weight: 1,
          sources: Object.freeze([
            Object.freeze({ volume: base, triangles })
          ])
        }),
        Object.freeze({
          id: "npc-spawn-bias:npc-bias",
          weight: 0.5,
          sources: Object.freeze([
            Object.freeze({ volume: bias, triangles })
          ])
        })
      ])
    );
    assert(
      sampler.channels.length === 2 &&
        sampler.channels[0].channelId === "npc-spawn-base" &&
        Math.abs(sampler.channels[0].area - 8) <= 1e-5 &&
        sampler.channels[0].weight === 1 &&
        sampler.channels[1].channelId === "npc-spawn-bias:npc-bias" &&
        Math.abs(sampler.channels[1].area - 2) <= 1e-5 &&
        sampler.channels[1].weight === 0.5 &&
        Math.abs(sampler.totalWeight - 1.5) <= 1e-10,
      `NPC bias channelの面積・weightが不正です: ${JSON.stringify(sampler.channels)} / total=${sampler.totalWeight}`
    );

    const baseProbability = 1 / 1.5;
    const biasProbability = 0.5 / 1.5;
    const biasAreaRatio = 2 / 8;
    const biasedSurfaceProbability =
      baseProbability * biasAreaRatio + biasProbability;
    const outsideSurfaceProbability =
      baseProbability * (1 - biasAreaRatio);
    assert(
      Math.abs(biasedSurfaceProbability - 0.5) <= 1e-10 &&
        Math.abs(outsideSurfaceProbability - 0.5) <= 1e-10 &&
        outsideSurfaceProbability > 0,
      `全許可面の非ゼロ可能性またはbias実確率が不正です: bias=${biasedSurfaceProbability} / outside=${outsideSurfaceProbability}`
    );

    const beforeBoundary = sampler.sample(
      createSequenceRandom([2 / 3 - 1e-8, 0.25, 0.5]).random
    );
    const atBoundary = sampler.sample(
      createSequenceRandom([2 / 3, 0.25, 0.5]).random
    );
    assert(
      beforeBoundary.channelId === "npc-spawn-base" &&
        atBoundary.channelId === "npc-spawn-bias:npc-bias",
      `base/bias channel境界が2/3ではありません: before=${beforeBoundary.channelId} / at=${atBoundary.channelId}`
    );

    const sequence = [0.8, 0.36, 0.75] as const;
    const first = sampler.sample(createSequenceRandom(sequence).random);
    const repeated = sampler.sample(createSequenceRandom(sequence).random);
    assert(
      first.channelId === repeated.channelId &&
        first.volumeId === repeated.volumeId &&
        Vector3.DistanceSquared(first.point, repeated.point) <= 1e-12,
      "同じ乱数列でNPC bias channelまたは抽選点が再現されません。"
    );
    return (
      `base=8/w1 / bias=2/w0.5 / ` +
      `channelBoundary=2/3 / biased=1/2 / outside=1/2`
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
};

const testSelectedPlayerNpcSpawnBiasSwitch = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const base = createVolume(scene, "npc-base", "npc_spawn", 0, 4);
    const biasA = createNpcBiasVolume(
      scene,
      "npc-bias-a",
      "player-a",
      -1.5,
      1,
      0.5
    );
    const biasB = createNpcBiasVolume(
      scene,
      "npc-bias-b",
      "player-b",
      1.5,
      1,
      100
    );
    const triangles = createRectangleTriangles(-2, 2, -1, 1);
    const navigation: NavigationWorld = Object.freeze({
      getSurfaceTriangles: () => triangles,
      projectPoint: (position: Vector3) =>
        Object.freeze({
          position: new Vector3(position.x, 0, position.z),
          polygonRef: 1
        }),
      findSurfacePath: () => {
        throw new Error("NPC bias fixtureではfindSurfacePathを呼び出しません。");
      },
      findPath: () => {
        throw new Error("NPC bias fixtureではfindPathを呼び出しません。");
      },
      constrainMovement: () => {
        throw new Error("NPC bias fixtureではconstrainMovementを呼び出しません。");
      },
      randomPointAround: () => {
        throw new Error("NPC bias fixtureではrandomPointAroundを呼び出しません。");
      },
      createDebugMesh: () => {
        throw new Error("NPC bias fixtureではcreateDebugMeshを呼び出しません。");
      },
      dispose: () => {}
    });
    const createSampler = (
      playerSpawnId: string,
      bias: StageVolume,
      random: () => number
    ) =>
      createStageNpcSpawnSampler(
        Object.freeze([base]),
        Object.freeze([bias]),
        playerSpawnId,
        navigation,
        {
          maxAttempts: 1,
          projectionMaxDistance: 1,
          random
        }
      );

    const randomA = createSequenceRandom([0.8, 0.25, 0.5]);
    const samplerA = createSampler("player-a", biasA, randomA.random);
    const pointA = samplerA.samplePoints(
      1,
      0,
      Object.freeze([]),
      () => false
    )[0];
    const randomARepeated = createSequenceRandom([0.8, 0.25, 0.5]);
    const repeatedA = createSampler(
      "player-a",
      biasA,
      randomARepeated.random
    ).samplePoints(1, 0, Object.freeze([]), () => false)[0];
    const randomB = createSequenceRandom([0.999, 0.25, 0.5]);
    const samplerB = createSampler("player-b", biasB, randomB.random);
    const pointB = samplerB.samplePoints(
      1,
      0,
      Object.freeze([]),
      () => false
    )[0];

    assert(
      samplerA.channels.map((channel) => channel.channelId).join("|") ===
        "npc-spawn-base|npc-spawn-bias:npc-bias-a" &&
        !samplerA.channels.some((channel) =>
          channel.channelId.includes("npc-bias-b")
        ) &&
        Math.abs(samplerA.totalWeight - 1.5) <= 1e-10 &&
        randomA.getCallCount() === 3,
      `非選択biasがA候補または乱数消費へ混入しました: channels=${samplerA.channels.map((channel) => channel.channelId).join(",")} / total=${samplerA.totalWeight} / calls=${randomA.getCallCount()}`
    );
    assert(
      createStageBoundaryContainsQuery(biasA.mesh)(pointA.position) &&
        createStageBoundaryContainsQuery(biasB.mesh)(pointB.position),
      `Player開始IDで対応biasへ切り替わりません: A=${pointA.position.asArray()} / B=${pointB.position.asArray()}`
    );
    assert(
      Vector3.DistanceSquared(pointA.position, repeatedA.position) <= 1e-12 &&
        randomARepeated.getCallCount() === 3,
      "同じPlayer開始IDと乱数列でbias抽選点が再現されません。"
    );
    return (
      `A=${pointA.position.x.toFixed(3)} / ` +
      `B=${pointB.position.x.toFixed(3)} / ` +
      `A channels=${samplerA.channels.length} / calls=3`
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
};

const testSamePlayerNpcSpawnBiasContactAndOverlap = () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const base = createVolume(scene, "npc-base", "npc_spawn", 0, 4, 0, 6);
    const left = createNpcBiasVolume(
      scene,
      "npc-bias-left",
      "player-a",
      -1,
      1,
      0.5
    );
    const faceTouching = createNpcBiasVolume(
      scene,
      "npc-bias-face-touching",
      "player-a",
      0,
      1,
      0.25
    );
    const overlapping = createNpcBiasVolume(
      scene,
      "npc-bias-overlapping",
      "player-a",
      -0.75,
      1,
      0.25
    );
    const horizontalLower = createNpcBiasVolume(
      scene,
      "npc-bias-horizontal-lower",
      "player-a",
      1,
      0.5,
      0.2,
      -1,
      2
    );
    const horizontalUpper = createNpcBiasVolume(
      scene,
      "npc-bias-horizontal-upper",
      "player-a",
      1,
      0.5,
      0.3,
      1,
      2
    );
    const triangles = createRectangleTriangles(-2, 2, -1, 1);
    const navigation: NavigationWorld = Object.freeze({
      getSurfaceTriangles: () => triangles,
      projectPoint: (position: Vector3) =>
        Object.freeze({
          position: new Vector3(position.x, 0, position.z),
          polygonRef: 1
        }),
      findSurfacePath: () => {
        throw new Error("NPC bias接触fixtureではfindSurfacePathを呼び出しません。");
      },
      findPath: () => {
        throw new Error("NPC bias接触fixtureではfindPathを呼び出しません。");
      },
      constrainMovement: () => {
        throw new Error("NPC bias接触fixtureではconstrainMovementを呼び出しません。");
      },
      randomPointAround: () => {
        throw new Error("NPC bias接触fixtureではrandomPointAroundを呼び出しません。");
      },
      createDebugMesh: () => {
        throw new Error("NPC bias接触fixtureではcreateDebugMeshを呼び出しません。");
      },
      dispose: () => {}
    });
    const config = Object.freeze({
      maxAttempts: 1,
      projectionMaxDistance: 1,
      random: () => 0.5
    });

    const faceTouchingSampler = createStageNpcSpawnSampler(
      Object.freeze([base]),
      Object.freeze([left, faceTouching]),
      "player-a",
      navigation,
      config
    );
    assert(
      faceTouchingSampler.channels.length === 3 &&
        Math.abs(faceTouchingSampler.channels[1].area - 2) <= 1e-5 &&
        Math.abs(faceTouchingSampler.channels[2].area - 2) <= 1e-5 &&
        Math.abs(faceTouchingSampler.totalWeight - 1.75) <= 1e-10,
      `同一Playerの面接触biasが許可されません: ${JSON.stringify(faceTouchingSampler.channels)}`
    );
    const horizontalFaceTouchingSampler = createStageNpcSpawnSampler(
      Object.freeze([base]),
      Object.freeze([horizontalLower, horizontalUpper]),
      "player-a",
      navigation,
      config
    );
    assert(
      horizontalFaceTouchingSampler.channels.length === 3 &&
        Math.abs(horizontalFaceTouchingSampler.channels[1].area - 1) <=
          1e-5 &&
        Math.abs(horizontalFaceTouchingSampler.channels[2].area - 1) <=
          1e-5 &&
        Math.abs(horizontalFaceTouchingSampler.totalWeight - 1.5) <= 1e-10,
      `同一Playerの水平面接触biasが許可されません: ${JSON.stringify(horizontalFaceTouchingSampler.channels)}`
    );

    let overlapMessage = "";
    try {
      createStageNpcSpawnSampler(
        Object.freeze([base]),
        Object.freeze([left, overlapping]),
        "player-a",
        navigation,
        config
      );
    } catch (error) {
      overlapMessage = error instanceof Error ? error.message : String(error);
    }
    assert(
      overlapMessage.includes("正面積重複"),
      `同一Playerの正面積overlapが拒否されません: ${overlapMessage || "no-error"}`
    );
    return "vertical/horizontal face-touch area=0 accepted / positive-area overlap rejected";
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
    ),
    await executeTest(
      "NPC bias source weight・境界・全許可面の非ゼロ可能性",
      testNpcSpawnBiasChannelWeighting
    ),
    await executeTest(
      "Player開始IDによるbias切替・非選択候補0・同乱数再現",
      testSelectedPlayerNpcSpawnBiasSwitch
    ),
    await executeTest(
      "同一Player biasの垂直・水平面接触許可・正面積overlap拒否",
      testSamePlayerNpcSpawnBiasContactAndOverlap
    )
  ]);
