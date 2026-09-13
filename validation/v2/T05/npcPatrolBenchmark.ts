import { Vector3 } from "@babylonjs/core";
import { createNpcFixture, createPlayerTarget } from "./npcCombat.test";
import { BLENDER_METERS_TO_WORLD_UNITS } from "../../../src/world/worldUnits";

// 描画・実NavMeshとは分けた論理更新比較。同じ固定時間・配置・乱数で測る。
export const runNpcPatrolBenchmark = async () => {
  const reports = [];
  for (const count of [50, 99]) {
    for (const scenario of ["patrol", "visible"] as const) {
      const fixture = await createNpcFixture(count, count, 100, false, null, 0.1);
      let randomState = 20260912;
      const access = fixture.system as unknown as {
        random: () => number;
        npcs: Array<{ footPosition: Vector3; navigationAgentCleared: boolean; navigationBehavior: string }>;
      };
      access.random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState / 4294967296;
      };
      fixture.system.placeNpcs(access.npcs.map((_, index) => ({
        id: `npc_${index}`, formation: false,
        footPosition: scenario === "visible"
          ? new Vector3(Math.sin(index * 2.4) * 1.5, 0, Math.cos(index * 2.4) * 1.5)
          : new Vector3((index % 10) * 4 - 18, 0, Math.floor(index / 10) * 4 - 18)
      })));
      const times: number[] = [];
      const waits: number[] = [];
      const still = new Float64Array(count);
      const distance = new Float64Array(count);
      let maximumStillSeconds = 0;
      let stationaryMovingFrames = 0;
      let pathCalls = 0;
      let queries = 0;
      let rays = 0;
      const before = access.npcs.map(npc => npc.footPosition.clone());
      try {
        for (let frame = 0; frame < 7200; frame += 1) {
          const player = createPlayerTarget(scenario === "visible"
            ? new Vector3(Math.sin(frame / 90) * 1.5, 0, Math.cos(frame / 90) * 1.5)
            : new Vector3(99, 0, 99));
          const start = performance.now();
          fixture.system.update(1 / 60, player, []);
          times.push(performance.now() - start);
          const view = fixture.system.getFrameView();
          pathCalls += view.pathRecalculationCount;
          waits.push(view.replanMaximumWaitSeconds);
          queries += view.personalityRetargetQueryCount;
          rays += view.sightRayCount;
          for (let index = 0; index < count; index += 1) {
            const npc = access.npcs[index];
            const step = Vector3.Distance(before[index], npc.footPosition);
            distance[index] += step / BLENDER_METERS_TO_WORLD_UNITS;
            if (!npc.navigationAgentCleared && step < 1e-8) {
              stationaryMovingFrames += 1;
              still[index] += 1 / 60;
              maximumStillSeconds = Math.max(maximumStillSeconds, still[index]);
            } else { still[index] = 0; }
            before[index].copyFrom(npc.footPosition);
          }
          if (frame % 600 === 599) await new Promise(resolve => setTimeout(resolve, 0));
        }
        times.sort((a, b) => a - b);
        waits.sort((a, b) => a - b);
        reports.push({ count, scenario, simulatedSeconds: 120, frames: times.length,
          updateMeanMs: times.reduce((a, b) => a + b, 0) / times.length,
          updateP95Ms: times[Math.floor(times.length * 0.95)],
          updateP99Ms: times[Math.floor(times.length * 0.99)],
          updateMaximumMs: times[times.length - 1], pathCalls, queries, rays,
          waitP95Seconds: waits[Math.floor(waits.length * 0.95)],
          waitMaximumSeconds: waits[waits.length - 1], maximumStillSeconds,
          stationaryMovingFrames, movedMeters: Array.from(distance)
        });
      } finally { fixture.dispose(); }
    }
  }
  return reports;
};
