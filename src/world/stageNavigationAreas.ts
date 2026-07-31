import { Vector3 } from "@babylonjs/core";

import { createStageBoundaryContainsQuery } from "./stageSpatialQueries";
import type { StageVolume } from "./stageSpatialQueries";

export type StageNavigationArea = Readonly<{
  id: string;
  volumes: readonly StageVolume[];
}>;

export type StageNavigationAreaPortal = Readonly<{
  id: string;
  fromAreaId: string;
  toAreaId: string;
  bidirectional: boolean;
  contains(point: Vector3): boolean;
}>;

export type StageNavigationAreaLocation = Readonly<{
  area: StageNavigationArea;
  portal: StageNavigationAreaPortal | null;
}>;

export interface StageNavigationAreaRegistry {
  readonly all: readonly StageNavigationArea[];
  readonly portals: readonly StageNavigationAreaPortal[];
  getById(id: string): StageNavigationArea | null;
  resolve(
    point: Vector3,
    previousAreaId: string | null
  ): StageNavigationAreaLocation;
  dispose(): void;
}

export type AuthoredStageNavigationAreaPortal = Readonly<{
  id: string;
  fromAreaId: string;
  toAreaId: string;
  bidirectional: boolean;
  mesh: import("@babylonjs/core").Mesh;
}>;

export const createStageNavigationAreaRegistry = (
  volumes: readonly StageVolume[],
  authoredPortals: readonly AuthoredStageNavigationAreaPortal[]
): StageNavigationAreaRegistry => {
  const areaVolumes = volumes.filter(
    (volume) => volume.role === "navigation_area"
  );
  const volumesByAreaId = new Map<string, StageVolume[]>();
  for (const volume of areaVolumes) {
    const areaId = volume.navigationAreaId!;
    const entries = volumesByAreaId.get(areaId) ?? [];
    entries.push(volume);
    volumesByAreaId.set(areaId, entries);
  }
  const all = Object.freeze(
    [...volumesByAreaId]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, entries]) =>
        Object.freeze({ id, volumes: Object.freeze([...entries]) })
      )
  );
  const byId = new Map(all.map((area) => [area.id, area]));
  const containsByVolume = new Map(
    areaVolumes.map((volume) => [
      volume,
      createStageBoundaryContainsQuery(volume.mesh)
    ])
  );
  const portals = Object.freeze(
    authoredPortals.map((portal) => {
      if (!byId.has(portal.fromAreaId) || !byId.has(portal.toAreaId)) {
        throw new Error(
          `Navigation Area Portalの参照先がありません: ${portal.id}`
        );
      }
      if (portal.fromAreaId === portal.toAreaId) {
        throw new Error(
          `Navigation Area Portalの接続先は異なる必要があります: ${portal.id}`
        );
      }
      return Object.freeze({
        id: portal.id,
        fromAreaId: portal.fromAreaId,
        toAreaId: portal.toAreaId,
        bidirectional: portal.bidirectional,
        contains: createStageBoundaryContainsQuery(portal.mesh)
      });
    })
  );
  let disposed = false;
  const assertActive = () => {
    if (disposed) {
      throw new Error("StageNavigationAreaRegistryは破棄済みです。");
    }
  };
  return Object.freeze({
    all,
    portals,
    getById: (id: string) => {
      assertActive();
      return byId.get(id) ?? null;
    },
    resolve: (point: Vector3, previousAreaId: string | null) => {
      assertActive();
      const portal = portals.find((candidate) => candidate.contains(point)) ?? null;
      if (portal) {
        if (previousAreaId === null) {
          throw new Error(
            `Navigation Area Portal内の初期位置は禁止されています: ${portal.id}`
          );
        }
        if (
          previousAreaId !== portal.fromAreaId &&
          previousAreaId !== portal.toAreaId
        ) {
          throw new Error(
            `直前AreaとPortal接続が一致しません: ${previousAreaId}/${portal.id}`
          );
        }
        return Object.freeze({
          area: byId.get(previousAreaId)!,
          portal
        });
      }
      const containingAreaIds = new Set<string>();
      for (const volume of areaVolumes) {
        if (containsByVolume.get(volume)!(point)) {
          containingAreaIds.add(volume.navigationAreaId!);
        }
      }
      if (containingAreaIds.size !== 1) {
        throw new Error(
          `Navigation Area包含数が1ではありません: ${containingAreaIds.size}`
        );
      }
      const areaId = containingAreaIds.values().next().value as string;
      return Object.freeze({ area: byId.get(areaId)!, portal: null });
    },
    dispose: () => {
      assertActive();
      disposed = true;
      containsByVolume.clear();
      byId.clear();
      volumesByAreaId.clear();
    }
  });
};
