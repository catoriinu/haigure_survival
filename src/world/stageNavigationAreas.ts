import { Vector3 } from "@babylonjs/core";

import {
  createStageBoundaryContainsQuery,
  createStageVolumeIntersectsSegmentQuery
} from "./stageSpatialQueries";
import type { StageVolume } from "./stageSpatialQueries";
import type { StageSpatialQueryDiagnostics } from "./stageSpatialQueries";

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
  intersects(from: Vector3, to: Vector3): boolean;
}>;

export type StageNavigationAreaCursor = Readonly<{
  areaId: string;
  portalId: string | null;
}>;

export interface StageNavigationAreaRegistry {
  readonly all: readonly StageNavigationArea[];
  readonly portals: readonly StageNavigationAreaPortal[];
  getById(id: string): StageNavigationArea | null;
  locate(point: Vector3): StageNavigationAreaCursor;
  advance(
    cursor: StageNavigationAreaCursor,
    from: Vector3,
    to: Vector3
  ): StageNavigationAreaCursor;
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
  authoredPortals: readonly AuthoredStageNavigationAreaPortal[],
  diagnostics?: StageSpatialQueryDiagnostics
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
        contains: createStageBoundaryContainsQuery(portal.mesh),
        intersects: createStageVolumeIntersectsSegmentQuery(portal.mesh)
      });
    })
  );
  const portalsByAreaId = new Map<string, readonly StageNavigationAreaPortal[]>();
  for (const area of all) {
    portalsByAreaId.set(
      area.id,
      Object.freeze(
        portals.filter(
          (portal) =>
            portal.fromAreaId === area.id ||
            (portal.bidirectional && portal.toAreaId === area.id)
        )
      )
    );
  }
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
    locate: (point: Vector3) => {
      assertActive();
      const startedAt = diagnostics ? performance.now() : 0;
      const portal = portals.find((candidate) => candidate.contains(point)) ?? null;
      if (portal) {
        throw new Error(
          `Navigation Area Portal内の初期位置は禁止されています: ${portal.id}`
        );
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
      diagnostics?.recordNavigationAreaQuery?.(
        "locate",
        portals.length,
        false,
        performance.now() - startedAt
      );
      return Object.freeze({ areaId, portalId: null });
    },
    advance: (
      cursor: StageNavigationAreaCursor,
      from: Vector3,
      to: Vector3
    ) => {
      assertActive();
      const startedAt = diagnostics ? performance.now() : 0;
      const currentArea = byId.get(cursor.areaId);
      if (!currentArea) {
        throw new Error(`Navigation Area cursorが不正です: ${cursor.areaId}`);
      }
      const connectedPortals = portalsByAreaId.get(cursor.areaId)!;
      const crossedPortal = connectedPortals.find(
        (portal) =>
          portal.id === cursor.portalId ||
          portal.intersects(from, to)
      ) ?? null;
      if (!crossedPortal) {
        diagnostics?.recordNavigationAreaQuery?.(
          "advance",
          connectedPortals.length,
          false,
          performance.now() - startedAt
        );
        return cursor.portalId === null
          ? cursor
          : Object.freeze({ areaId: cursor.areaId, portalId: null });
      }
      if (crossedPortal.contains(to)) {
        diagnostics?.recordNavigationAreaQuery?.(
          "advance",
          connectedPortals.length,
          false,
          performance.now() - startedAt
        );
        return Object.freeze({
          areaId: cursor.areaId,
          portalId: crossedPortal.id
        });
      }
      const destinationAreaId =
        crossedPortal.fromAreaId === cursor.areaId
          ? crossedPortal.toAreaId
          : crossedPortal.fromAreaId;
      const destinationArea = byId.get(destinationAreaId)!;
      if (
        destinationArea.volumes.some((volume) =>
          containsByVolume.get(volume)!(to)
        )
      ) {
        diagnostics?.recordNavigationAreaQuery?.(
          "advance",
          connectedPortals.length,
          true,
          performance.now() - startedAt
        );
        return Object.freeze({ areaId: destinationAreaId, portalId: null });
      }
      if (
        currentArea.volumes.some((volume) =>
          containsByVolume.get(volume)!(to)
        )
      ) {
        diagnostics?.recordNavigationAreaQuery?.(
          "advance",
          connectedPortals.length,
          false,
          performance.now() - startedAt
        );
        return Object.freeze({ areaId: cursor.areaId, portalId: null });
      }
      throw new Error(
        `Navigation Area Portal横断後の位置が接続Area外です: ${crossedPortal.id} / ` +
          `area=${cursor.areaId} / from=${from.toString()} / to=${to.toString()}`
      );
    },
    dispose: () => {
      assertActive();
      disposed = true;
      containsByVolume.clear();
      portalsByAreaId.clear();
      byId.clear();
      volumesByAreaId.clear();
    }
  });
};
