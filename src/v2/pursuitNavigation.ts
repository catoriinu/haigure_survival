import { Vector3 } from "@babylonjs/core";

import type {
  StageNavigationAreaCursor,
  StageNavigationAreaRegistry
} from "../world/stageNavigationAreas";
import type { V2HumanTargetSnapshot } from "./combatTypes";

export type V2PursuitPhase = "area" | "coarse" | "detail";

export type V2TargetNavigationAreaSnapshot = Readonly<{
  targetId: string;
  areaId: string;
  revision: number;
  anchor: Vector3;
}>;

export interface V2TargetNavigationAreaTracker {
  beginFrame(targets: readonly V2HumanTargetSnapshot[]): void;
  resolve(targetId: string): V2TargetNavigationAreaSnapshot;
  beginTransport(targetId: string, position: Vector3): void;
  updateTransportPosition(targetId: string, position: Vector3): void;
  relocate(targetId: string, position: Vector3): void;
  dispose(): void;
}

type MutableTrackedTarget = {
  cursor: StageNavigationAreaCursor;
  revision: number;
  anchor: Vector3;
  position: Vector3;
};

export const createV2TargetNavigationAreaTracker = (
  areas: StageNavigationAreaRegistry
): V2TargetNavigationAreaTracker => {
  const tracked = new Map<string, MutableTrackedTarget>();
  const transportingTargetIds = new Set<string>();
  const frameTargets = new Map<string, V2HumanTargetSnapshot>();
  const frameSnapshots = new Map<string, V2TargetNavigationAreaSnapshot>();
  let disposed = false;
  const assertActive = () => {
    if (disposed) {
      throw new Error("V2TargetNavigationAreaTrackerは破棄済みです。");
    }
  };
  return Object.freeze({
    beginFrame: (targets: readonly V2HumanTargetSnapshot[]) => {
      assertActive();
      frameTargets.clear();
      for (const target of targets) {
        frameTargets.set(target.id, target);
      }
      for (const targetId of tracked.keys()) {
        if (!frameTargets.has(targetId)) {
          tracked.delete(targetId);
          transportingTargetIds.delete(targetId);
          continue;
        }
        if (
          !frameSnapshots.has(targetId) &&
          !transportingTargetIds.has(targetId)
        ) {
          tracked.delete(targetId);
        }
      }
      frameSnapshots.clear();
    },
    resolve: (targetId: string) => {
      assertActive();
      const cached = frameSnapshots.get(targetId);
      if (cached) {
        return cached;
      }
      const target = frameTargets.get(targetId);
      if (!target) {
        throw new Error(
          `追跡標的のNavigation Area入力がありません: ${targetId}`
        );
      }
      let current = tracked.get(targetId) ?? null;
      if (!current) {
        current = {
          cursor: areas.locate(target.footPosition),
          revision: 0,
          anchor: target.footPosition.clone(),
          position: target.footPosition.clone()
        };
        tracked.set(targetId, current);
      } else if (
        !transportingTargetIds.has(targetId) &&
        !current.position.equals(target.footPosition)
      ) {
        const nextCursor = areas.advance(
          current.cursor,
          current.position,
          target.footPosition
        );
        if (nextCursor.areaId !== current.cursor.areaId) {
          current.revision += 1;
          current.anchor.copyFrom(target.footPosition);
        }
        current.cursor = nextCursor;
        current.position.copyFrom(target.footPosition);
      }
      const snapshot = Object.freeze({
        targetId,
        areaId: current.cursor.areaId,
        revision: current.revision,
        anchor: current.anchor.clone()
      });
      frameSnapshots.set(targetId, snapshot);
      return snapshot;
    },
    beginTransport: (targetId: string, position: Vector3) => {
      assertActive();
      const previous = tracked.get(targetId) ?? null;
      const cursor = areas.locate(position);
      const areaChanged =
        previous !== null &&
        previous.cursor.areaId !== cursor.areaId;
      tracked.set(targetId, {
        cursor,
        revision:
          previous === null
            ? 0
            : previous.revision + (areaChanged ? 1 : 0),
        anchor:
          previous === null || areaChanged
            ? position.clone()
            : previous.anchor.clone(),
        position: position.clone()
      });
      transportingTargetIds.add(targetId);
      frameSnapshots.delete(targetId);
    },
    updateTransportPosition: (targetId: string, position: Vector3) => {
      assertActive();
      if (!transportingTargetIds.has(targetId)) {
        throw new Error(
          `搬送開始前の標的Area位置更新です: ${targetId}`
        );
      }
      tracked.get(targetId)!.position.copyFrom(position);
      frameSnapshots.delete(targetId);
    },
    relocate: (targetId: string, position: Vector3) => {
      assertActive();
      const cursor = areas.locate(position);
      const previous = tracked.get(targetId) ?? null;
      tracked.set(targetId, {
        cursor,
        revision: previous === null ? 0 : previous.revision + 1,
        anchor: position.clone(),
        position: position.clone()
      });
      transportingTargetIds.delete(targetId);
      frameSnapshots.delete(targetId);
    },
    dispose: () => {
      assertActive();
      disposed = true;
      tracked.clear();
      transportingTargetIds.clear();
      frameTargets.clear();
      frameSnapshots.clear();
    }
  });
};
