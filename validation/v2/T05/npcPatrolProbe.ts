import type { V2NpcSystem } from "../../../src/v2/npcSystem";
import type { Vector3 } from "@babylonjs/core";

// 比較用Viteだけで装着する。通常ゲームの更新・経路・描画を変更しない。
export const attachNpcPatrolProbe = (system: V2NpcSystem): V2NpcSystem => {
  const npcs = (system as unknown as { npcs: Array<{
    footPosition: Vector3; navigationAgentCleared: boolean;
  }> }).npcs;
  const before = npcs.map(npc => npc.footPosition.clone());
  const still = new Float64Array(npcs.length);
  const times: number[] = [];
  let elapsed = 0;
  let calls = 0;
  let waitingFrames = 0;
  let maxWait = 0;
  let maxStill = 0;
  let stationaryMovingFrames = 0;
  let movedMeters = 0;
  const original = system.update.bind(system);
  system.update = (...args) => {
    const start = performance.now();
    original(...args);
    const time = performance.now() - start;
    if (args[0] === 0 || elapsed >= 120) return;
    elapsed += args[0];
    times.push(time);
    const frame = system.getFrameView();
    calls += frame.pathRecalculationCount;
    waitingFrames += frame.waitingForPathCount;
    maxWait = Math.max(maxWait, frame.replanMaximumWaitSeconds);
    for (let index = 0; index < npcs.length; index += 1) {
      const npc = npcs[index];
      const previous = before[index];
      const distance = Math.hypot(npc.footPosition.x - previous.x, npc.footPosition.z - previous.z);
      movedMeters += distance / 0.25;
      if (!npc.navigationAgentCleared && distance < 1e-8) {
        still[index] += args[0];
        maxStill = Math.max(maxStill, still[index]);
        stationaryMovingFrames += 1;
      } else { still[index] = 0; }
      previous.copyFrom(npc.footPosition);
    }
    if (times.length % 60 === 0 || elapsed >= 120) {
      document.body.dataset.npcPatrolProbe = JSON.stringify({
        count: npcs.length, elapsed, frames: times.length,
        cpuMeanMs: times.reduce((a, b) => a + b, 0) / times.length,
        pathCalls: calls, waitingFrames, maxWait, maxStill, stationaryMovingFrames, movedMeters
      });
    }
  };
  return system;
};
