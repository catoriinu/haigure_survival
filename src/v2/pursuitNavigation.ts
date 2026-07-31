import { Vector3 } from "@babylonjs/core";

import type { StageNavigationAreaRegistry } from "../world/stageNavigationAreas";
import type { V2HumanTargetSnapshot } from "./combatTypes";

export type V2PursuitPhase = "area" | "detail";

export type V2TargetNavigationAreaSnapshot = Readonly<{
  targetId: string;
  areaId: string;
  revision: number;
  anchor: Vector3;
}>;

export type V2TargetNavigationAreaFrame = ReadonlyMap<
  string,
  V2TargetNavigationAreaSnapshot
>;

export interface V2TargetNavigationAreaTracker {
  update(
    targets: readonly V2HumanTargetSnapshot[]
  ): V2TargetNavigationAreaFrame;
  dispose(): void;
}

type MutableTrackedTarget = {
  areaId: string;
  revision: number;
  anchor: Vector3;
};

export const createV2TargetNavigationAreaTracker = (
  areas: StageNavigationAreaRegistry
): V2TargetNavigationAreaTracker => {
  const tracked = new Map<string, MutableTrackedTarget>();
  let disposed = false;
  const assertActive = () => {
    if (disposed) {
      throw new Error("V2TargetNavigationAreaTrackerは破棄済みです。");
    }
  };
  return Object.freeze({
    update: (targets: readonly V2HumanTargetSnapshot[]) => {
      assertActive();
      const activeIds = new Set(targets.map((target) => target.id));
      for (const targetId of tracked.keys()) {
        if (!activeIds.has(targetId)) {
          tracked.delete(targetId);
        }
      }
      const frame = new Map<string, V2TargetNavigationAreaSnapshot>();
      for (const target of targets) {
        const previous = tracked.get(target.id) ?? null;
        const location = areas.resolve(
          target.footPosition,
          previous?.areaId ?? null
        );
        let current = previous;
        if (!current) {
          current = {
            areaId: location.area.id,
            revision: 0,
            anchor: target.footPosition.clone()
          };
          tracked.set(target.id, current);
        } else if (current.areaId !== location.area.id) {
          current.areaId = location.area.id;
          current.revision += 1;
          current.anchor.copyFrom(target.footPosition);
        }
        frame.set(
          target.id,
          Object.freeze({
            targetId: target.id,
            areaId: current.areaId,
            revision: current.revision,
            anchor: current.anchor.clone()
          })
        );
      }
      return frame;
    },
    dispose: () => {
      assertActive();
      disposed = true;
      tracked.clear();
    }
  });
};
