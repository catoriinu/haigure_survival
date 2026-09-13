import { Vector3 } from "@babylonjs/core";

import {
  createFixtureNpc,
  createMissionFixture,
  updateFixture
} from "./missionRuntime.test";
import { assert, executeTest, type T06TestResult } from "../T06/testUtils";

export const runNpcMissionTests = async (): Promise<
  readonly T06TestResult[]
> =>
  Promise.all([
    executeTest("NPC通常Missionは1tick最大2・同時最大8・Follow除外", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: () => 0.1
      });
      const npcs = Object.freeze(
        Array.from({ length: 12 }, (_, index) =>
          createFixtureNpc(
            `npc-${String(index).padStart(2, "0")}`,
            index,
            index < 6 ? "normal" : "brainwash-complete-gun",
            index === 0 ? "follow" : "none"
          )
        )
      );
      const assignmentCount = () => fixture.port.assignments.size;
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      assert(
        assignmentCount() === 2,
        `1tickのNPC Mission数が2件ではありません: ${assignmentCount()}`
      );
      assert(
        !fixture.port.assignments.has("npc-00"),
        "Follow中NPCへ通常Missionを付与しました。"
      );
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      assert(
        assignmentCount() === 8,
        `NPC通常Missionが同時8件になりません: ${assignmentCount()}`
      );
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      assert(
        assignmentCount() === 8,
        "NPC通常Missionが同時8件を超えました。"
      );
      fixture.runtime.dispose();
      return "両陣営から2件/tick、Followを除外し同時8件で停止";
    }),
    executeTest("危険回避pause中も180秒期限が進む", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: () => 0.1
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 0),
        createFixtureNpc("npc-b", 1)
      ]);
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      const pausedNpcId = [...fixture.port.assignments.keys()][0];
      const paused = fixture.port.assignments.get(pausedNpcId)!;
      paused.state = "paused";
      updateFixture(fixture, { deltaSeconds: 179, npcs });
      assert(
        fixture.port.assignments.has(pausedNpcId),
        "180秒直前にpause Missionが終了しました。"
      );
      updateFixture(fixture, { deltaSeconds: 1, npcs });
      assert(
        !fixture.port.assignments.has(pausedNpcId),
        "pause中に期限が停止しました。"
      );
      assert(
        fixture.runtime.getMissions().some(
          (mission) =>
            mission.kind === "npc-location" &&
            mission.assignee.npcId === pausedNpcId &&
            mission.state === "failed" &&
            mission.terminalReason === "deadline"
        ),
        "pause Missionの期限失敗履歴がありません。"
      );
      fixture.runtime.dispose();
      return "移動pause状態でもdeadlineを停止せず180秒で失敗";
    }),
    executeTest("正本Volume包含だけでNPC到着完了", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: () => 0.1
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 0),
        createFixtureNpc("npc-b", 1)
      ]);
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      const npcId = [...fixture.port.assignments.keys()][0];
      const stored = fixture.port.assignments.get(npcId)!;
      stored.state = "arrived";
      updateFixture(fixture, { deltaSeconds: 0, npcs });
      assert(
        fixture.port.assignments.has(npcId),
        "Volume外でNPC移動状態だけを見て完了しました。"
      );
      const npc = npcs.find((candidate) => candidate.id === npcId)!;
      npc.footPosition = new Vector3(
        stored.assignment.destination.position.x,
        stored.assignment.destination.position.y,
        stored.assignment.destination.position.z
      );
      updateFixture(fixture, { deltaSeconds: 0, npcs });
      assert(
        !fixture.port.assignments.has(npcId),
        "正本Volumeへ入ってもNPC Missionが完了しません。"
      );
      assert(
        fixture.runtime.getMissions().some(
          (mission) =>
            mission.kind === "npc-location" &&
            mission.assignee.npcId === npcId &&
            mission.state === "completed" &&
            mission.terminalReason === "arrived"
        ),
        "NPC Volume到着の完了履歴がありません。"
      );
      fixture.runtime.dispose();
      return "navigation arrivedだけでは未完了、Volume包含で完了";
    }),
    executeTest("phase離脱でNPC割当を失敗ではなく取消", () => {
      const fixture = createMissionFixture({
        playerRandom: () => 0.9,
        npcRandom: () => 0.1
      });
      const npcs = Object.freeze([
        createFixtureNpc("npc-a", 0),
        createFixtureNpc("npc-b", 1)
      ]);
      updateFixture(fixture, { deltaSeconds: 20, npcs });
      updateFixture(fixture, {
        deltaSeconds: 0,
        phase: "execution",
        npcs
      });
      assert(fixture.port.assignments.size === 0, "phase離脱後も割当が残りました。");
      assert(
        fixture.runtime.getMissions().filter(
          (mission) => mission.kind === "npc-location"
        ).every(
          (mission) =>
            mission.state === "cancelled" &&
            mission.terminalReason === "phase-ended"
        ),
        "NPC Missionをphase離脱で失敗扱いしました。"
      );
      fixture.runtime.dispose();
      return "全NPC Location Missionをphase-ended取消し、割当0件";
    })
  ]);
