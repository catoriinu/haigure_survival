import { Vector3 } from "@babylonjs/core";
import {
  selectNpcEvadeDestination, selectV2NpcEvadePersonality,
  npcEvadeSegmentDistanceSquared, type V2NpcEvadeEvaluation
} from "../../../src/v2/npcEvadePolicy";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

export const testNpcEvadePolicy = () => {
  const position = Vector3.Zero();
  const primaryPosition = new Vector3(0, 0, -1);
  const candidates = Array.from({ length: 16 }, (_, index) => ({
    position: new Vector3(Math.cos(index * Math.PI / 8) * 2, 0, Math.sin(index * Math.PI / 8) * 2), polygonRef: 1
  }));
  const input: V2NpcEvadeEvaluation = {
    personality: "cautious", ordinal: 0, position, aimPosition: position,
    forward: new Vector3(0, 0, -1), previousDirection: null,
    primaryPosition, threats: [{ sourceAimPosition: primaryPosition }], candidates,
    currentDestination: null, elapsedSinceSelection: 0, emergency: true, arrivalTolerance: 0.02
  };
  const cautious = selectNpcEvadeDestination(input).destination!;
  const breakthrough = selectNpcEvadeDestination({ ...input, ordinal: 2, personality: "breakthrough" }).destination!;
  assert(cautious.position.z > 1.9, "慎重型が単独敵から離れません");
  assert(Math.abs(breakthrough.position.x) > 1 && breakthrough.position.z > 1, "突破型が通常逃走で斜め方向を選びません");
  assert(selectNpcEvadeDestination({ ...input, candidates: [{ position, polygonRef: 1 }, cautious] }).destination === cautious,
    "移動可能なのに現在位置を目的地にしました");
  assert(selectNpcEvadeDestination({ ...input, candidates: [{ position, polygonRef: 1 }] }).destination === null,
    "移動不能を脱出先ありと扱いました");
  const current = { position: new Vector3(2, 0, 0), polygonRef: 1 };
  assert(selectNpcEvadeDestination({ ...input, currentDestination: current, emergency: false, elapsedSinceSelection: 0.1 }).destination === current,
    "最低継続時間を待たずに切り替えました");
  assert(selectNpcEvadeDestination({ ...input, currentDestination: current, emergency: true }).destination !== current,
    "緊急時にも危険な旧方向を固定しました");
  const held = selectNpcEvadeDestination({ ...input, currentDestination: cautious, emergency: false, elapsedSinceSelection: 10 });
  assert(held.destination === cautious, "同点で現在の目的地を捨てました");
  const exactCollision = npcEvadeSegmentDistanceSquared(position, new Vector3(2, 0, 0), new Vector3(1, 0, 0));
  assert(exactCollision === 0, "目的地までの途中の接近を見落としました");
  for (let ordinal = 0; ordinal < 99; ordinal += 1) {
    assert(selectV2NpcEvadePersonality(ordinal) === selectV2NpcEvadePersonality(ordinal + 99), "IDの循環割当が不安定です");
  }
  return "単独敵の斜め逃走、停止候補排除、最低継続、緊急解除、同点維持、途中の接近、決定的割当を確認";
};
