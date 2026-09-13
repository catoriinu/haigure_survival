import { Engine, Scene, Vector3 } from "@babylonjs/core";
import { createV2BitSystem } from "../../../src/v2/bitSystem";
import { createSyntheticStageFixture } from "../T06-2/runtimeFixture";
import { createSeededRandom } from "../T06-2/testUtils";
import { assert, executeTest, type T06TestResult } from "./testUtils";

export const createBitGroundShadowFixture = (engine: Engine, count: number) => {
  const scene = new Scene(engine);
  const spatial = createSyntheticStageFixture(scene);
  let groundQueries = 0;
  let floorY = 0;
  const stage = {
    ...spatial.stage,
    queries: {
      ...spatial.stage.queries,
      sampleGround: (...args: Parameters<typeof spatial.stage.queries.sampleGround>) => {
        groundQueries += 1;
        const ground = spatial.stage.queries.sampleGround(...args)!;
        return { ...ground, point: new Vector3(args[0].x, floorY, args[0].z) };
      }
    }
  };
  const bits = createV2BitSystem(scene, stage, {
    initialBitCount: count, maximumBitCount: count, reinforcementIntervalSeconds: 10,
    minimumSpawnDistance: 0.2, spawnMaxAttempts: 512, spawnProjectionMaxDistance: 0.75,
    combatEnabled: false, modeMuzzleColorEnabled: false, showGroundShadows: true,
    random: () => 0.5, spawnRandom: createSeededRandom(20260913),
    playerSpawn: spatial.selectedPlayerSpawn,
    resolveTargetNavigationArea: (target) => ({
      targetId: target.id, areaId: "t06-2-area", revision: 0, anchor: target.footPosition.clone()
    })
  });
  bits.setHostileActionsSuspended(true);
  let elapsed = 0;
  return {
    bits, scene,
    update: (delta = 0) => {
      elapsed += delta;
      bits.update({ deltaSeconds: delta, elapsedSeconds: elapsed, targets: [], externalAlerts: [] });
    },
    setFloor: (height: number) => { floorY = height; },
    queryCount: () => groundQueries,
    dispose: () => { bits.dispose(); spatial.dispose(); scene.dispose(); }
  };
};



export const runBitGroundShadowTests = async (): Promise<readonly T06TestResult[]> => {
  const canvas = document.createElement("canvas");
  const engine = new Engine(canvas, false);
  try {
    return [
      await executeTest("BIT出現完了・下向き・強制完了で影が一種類だけになる", () => {
        const fixture = createBitGroundShadowFixture(engine, 1);
        try {
          const shape = fixture.scene.getMeshByName("v2_bit_0_shadow")!;
          const circle = fixture.scene.getMeshByName("v2_bit_0_shadow_circle")!;
          fixture.update(0.25);
          assert(circle.isVisible && !shape.isVisible, "出現中に通常影が重なっています。");
          fixture.update(0.25);
          fixture.update(0.5);
          fixture.update(0.5);
          assert(shape.isVisible && !circle.isVisible, "出現完了後に円形影が残っています。");
          fixture.bits.setAiSuspended(true);
          const root = fixture.scene.getTransformNodeByName("v2_bit_0")!;
          for (const pitch of [0, -0.3, -0.7, -1]) {
            fixture.bits.faceBitsAt([{ id: root.name, aimPosition: root.position.add(new Vector3(0, pitch, Math.sqrt(1 - pitch * pitch))) }]);
            fixture.update();
            assert(shape.isVisible && !circle.isVisible, `下向き${pitch}で影が重なっています。`);
          }
          fixture.bits.setVisible(false);
          assert(!shape.isVisible && !circle.isVisible, "非表示BITの影が残っています。");
          fixture.bits.setVisible(true);
          return "出現→通常、下向き4角度、非表示の切替PASS";
        } finally { fixture.dispose(); }
      }),
      await executeTest("BIT強制出現完了の直後にも円形影が消える", () => {
        const fixture = createBitGroundShadowFixture(engine, 1);
        try {
          fixture.update(0.25);
          fixture.bits.prepareForScriptedPhase();
          assert(!fixture.scene.getMeshByName("v2_bit_0_shadow_circle")!.isVisible,
            "強制完了の直後に出現円形影が残っています。");
          assert(fixture.scene.getMeshByName("v2_bit_0_shadow")!.isVisible,
            "強制完了の直後に通常影がありません。");
          return "次のupdateを待たずに切替PASS";
        } finally { fixture.dispose(); }
      }),
      await executeTest("BIT影は投射床からの高さで薄くなる", () => {
        const fixture = createBitGroundShadowFixture(engine, 1);
        try {
          fixture.bits.prepareForScriptedPhase();
          fixture.bits.setAiSuspended(true);
          const root = fixture.scene.getTransformNodeByName("v2_bit_0")!;
          const shadow = fixture.scene.getMeshByName("v2_bit_0_shadow")!;
          fixture.update();
          const bodyY = root.position.y;
          const alphas = [0.1, 0.9, 1.8, 2.7].map((height) => {
            fixture.setFloor(bodyY - height);
            fixture.update();
            assert(Math.abs(shadow.position.y - (bodyY - height + 0.0015)) < 1e-6, "投射床が一致しません。");
            return shadow.visibility;
          });
          assert(alphas.every((alpha, index) => alpha > 0 && (index === 0 || alpha < alphas[index - 1])),
            `高さで薄くなりません: ${alphas}`);
          assert(alphas[3] < 0.1, "高高度の影が濃いままです。");
          return `高さ0.1/0.9/1.8/2.7の濃さ=${alphas.map((alpha) => alpha.toFixed(3)).join("/")}`;
        } finally { fixture.dispose(); }
      }),
      await executeTest("50 BITの影は床問い合わせ50回・表示50枚で資源数が増えない", () => {
        const fixture = createBitGroundShadowFixture(engine, 50);
        try {
          fixture.bits.prepareForScriptedPhase();
          fixture.bits.setAiSuspended(true);
          const resources = () => [fixture.scene.meshes.length, fixture.scene.materials.length, fixture.scene.textures.length].join("/");
          const before = resources();
          const queries = fixture.queryCount();
          for (let tick = 0; tick < 120; tick += 1) fixture.update(1 / 60);
          const activeShadows = fixture.scene.meshes.filter((mesh) => mesh.name.includes("_shadow") && mesh.isVisible).length;
          assert(fixture.queryCount() - queries === 50 * 120, "床問い合わせ回数が増えています。");
          assert(resources() === before, "影更新中にMesh・Material・Textureが増えています。");
          assert(activeShadows === 50, `影の表示枚数が50ではありません: ${activeShadows}`);
          return `120更新で床問い合わせ6000回、表示影50枚、資源数=${before}を維持`;
        } finally { fixture.dispose(); }
      })
    ];
  } finally { engine.dispose(); canvas.remove(); }
};
