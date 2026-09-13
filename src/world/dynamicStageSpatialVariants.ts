import type { Mesh } from "@babylonjs/core";

import type { StageMovementColliderSets } from "./stageSpatialQueries";

export type DynamicStageSpatialActiveSet = Readonly<{
  movementColliders: StageMovementColliderSets;
  groundColliders: readonly Mesh[];
  beamBlockers: readonly Mesh[];
  sightBlockers: readonly Mesh[];
  bitObstacles: readonly Mesh[];
}>;

export type DynamicStageSpatialSnapshot =
  DynamicStageSpatialActiveSet &
    Readonly<{
      revision: number;
    }>;

export interface DynamicStageSpatialVariants {
  readonly revision: number;
  getSnapshot(): DynamicStageSpatialSnapshot;
  replaceActiveSet(
    next: DynamicStageSpatialActiveSet
  ): DynamicStageSpatialSnapshot;
  dispose(): void;
}

export type DynamicStageSpatialSnapshotResource<T> = Readonly<{
  value: T;
  dispose(): void;
}>;

export type DynamicStageSpatialSnapshotResourceHandle<T> = Readonly<{
  use<TResult>(
    snapshot: DynamicStageSpatialSnapshot,
    callback: (value: T) => TResult
  ): TResult;
  dispose(): void;
}>;

type SnapshotResourceEntry = {
  prepare(
    snapshot: DynamicStageSpatialSnapshot
  ): DynamicStageSpatialSnapshotResource<unknown>;
  active: boolean;
};

type OwnedSnapshotResource = {
  resource: DynamicStageSpatialSnapshotResource<unknown> | null;
  leaseCount: number;
  retired: boolean;
};

type PreparedSnapshot = Readonly<{
  snapshot: DynamicStageSpatialSnapshot;
  resources: ReadonlyMap<SnapshotResourceEntry, OwnedSnapshotResource>;
}>;

type DynamicStageSpatialVariantsState = {
  active: boolean;
  current: PreparedSnapshot;
  entries: Set<SnapshotResourceEntry>;
};

const variantsState = new WeakMap<
  DynamicStageSpatialVariants,
  DynamicStageSpatialVariantsState
>();

const freezeMeshes = (meshes: readonly Mesh[]): readonly Mesh[] =>
  Object.freeze([...meshes]);

const createSnapshot = (
  activeSet: DynamicStageSpatialActiveSet,
  revision: number
): DynamicStageSpatialSnapshot =>
  Object.freeze({
    revision,
    movementColliders: Object.freeze({
      player: freezeMeshes(activeSet.movementColliders.player),
      npc: freezeMeshes(activeSet.movementColliders.npc),
      bit: freezeMeshes(activeSet.movementColliders.bit)
    }),
    groundColliders: freezeMeshes(activeSet.groundColliders),
    beamBlockers: freezeMeshes(activeSet.beamBlockers),
    sightBlockers: freezeMeshes(activeSet.sightBlockers),
    bitObstacles: freezeMeshes(activeSet.bitObstacles)
  });

const requireActiveState = (
  variants: DynamicStageSpatialVariants
): DynamicStageSpatialVariantsState => {
  const state = variantsState.get(variants);
  if (!state?.active) {
    throw new Error(
      "破棄済みのDynamicStageSpatialVariantsは使用できません。"
    );
  }
  return state;
};

const disposeOwnedResource = (owned: OwnedSnapshotResource) => {
  const resource = owned.resource;
  if (resource) {
    owned.resource = null;
    resource.dispose();
  }
};

const retireOwnedResources = (
  resources: Iterable<OwnedSnapshotResource>
) => {
  for (const owned of resources) {
    owned.retired = true;
    if (owned.leaseCount === 0) {
      disposeOwnedResource(owned);
    }
  }
};

export const createDynamicStageSpatialVariants = (
  initialActiveSet: DynamicStageSpatialActiveSet
): DynamicStageSpatialVariants => {
  const initialSnapshot = createSnapshot(initialActiveSet, 0);
  const state: DynamicStageSpatialVariantsState = {
    active: true,
    current: Object.freeze({
      snapshot: initialSnapshot,
      resources: new Map()
    }),
    entries: new Set()
  };
  const variants: DynamicStageSpatialVariants = Object.freeze({
    get revision() {
      return requireActiveState(variants).current.snapshot.revision;
    },
    getSnapshot: () => requireActiveState(variants).current.snapshot,
    replaceActiveSet: (next: DynamicStageSpatialActiveSet) => {
      const activeState = requireActiveState(variants);
      const nextSnapshot = createSnapshot(
        next,
        activeState.current.snapshot.revision + 1
      );
      const nextResources = new Map<
        SnapshotResourceEntry,
        OwnedSnapshotResource
      >();
      try {
        for (const entry of activeState.entries) {
          nextResources.set(entry, {
            resource: entry.prepare(nextSnapshot),
            leaseCount: 0,
            retired: false
          });
        }
      } catch (error) {
        retireOwnedResources(nextResources.values());
        throw error;
      }

      const previous = activeState.current;
      activeState.current = Object.freeze({
        snapshot: nextSnapshot,
        resources: nextResources
      });
      retireOwnedResources(previous.resources.values());
      return nextSnapshot;
    },
    dispose: () => {
      const activeState = requireActiveState(variants);
      activeState.active = false;
      const currentResources = activeState.current.resources;
      activeState.entries.clear();
      retireOwnedResources(currentResources.values());
    }
  });
  variantsState.set(variants, state);
  return variants;
};

export const registerDynamicStageSpatialSnapshotResource = <T>(
  variants: DynamicStageSpatialVariants,
  prepare: (
    snapshot: DynamicStageSpatialSnapshot
  ) => DynamicStageSpatialSnapshotResource<T>
): DynamicStageSpatialSnapshotResourceHandle<T> => {
  const state = requireActiveState(variants);
  const entry: SnapshotResourceEntry = {
    prepare: prepare as (
      snapshot: DynamicStageSpatialSnapshot
    ) => DynamicStageSpatialSnapshotResource<unknown>,
    active: true
  };
  const initialResource = prepare(state.current.snapshot);
  const resources = new Map(state.current.resources);
  resources.set(entry, {
    resource:
      initialResource as DynamicStageSpatialSnapshotResource<unknown>,
    leaseCount: 0,
    retired: false
  });
  state.entries.add(entry);
  state.current = Object.freeze({
    snapshot: state.current.snapshot,
    resources
  });

  const handle: DynamicStageSpatialSnapshotResourceHandle<T> =
    Object.freeze({
      use: <TResult>(
        snapshot: DynamicStageSpatialSnapshot,
        callback: (value: T) => TResult
      ): TResult => {
        const activeState = requireActiveState(variants);
        if (!entry.active) {
          throw new Error(
            "破棄済みの動的空間snapshot resourceは使用できません。"
          );
        }
        if (activeState.current.snapshot !== snapshot) {
          throw new Error(
            "DynamicStageSpatialSnapshotとresourceのrevisionが一致しません。"
          );
        }
        const resource = activeState.current.resources.get(entry);
        if (!resource) {
          throw new Error(
            "DynamicStageSpatialSnapshotのresourceがありません。"
          );
        }
        if (!resource.resource) {
          throw new Error(
            "DynamicStageSpatialSnapshotのresourceは破棄済みです。"
          );
        }
        resource.leaseCount += 1;
        try {
          return callback(resource.resource.value as T);
        } finally {
          resource.leaseCount -= 1;
          if (resource.retired && resource.leaseCount === 0) {
            disposeOwnedResource(resource);
          }
        }
      },
      dispose: () => {
        const activeState = requireActiveState(variants);
        if (!entry.active) {
          throw new Error(
            "動的空間snapshot resourceは既に破棄されています。"
          );
        }
        entry.active = false;
        activeState.entries.delete(entry);
        const currentResource = activeState.current.resources.get(entry);
        if (!currentResource) {
          throw new Error(
            "DynamicStageSpatialSnapshotのresourceがありません。"
          );
        }
        const resources = new Map(activeState.current.resources);
        resources.delete(entry);
        activeState.current = Object.freeze({
          snapshot: activeState.current.snapshot,
          resources
        });
        retireOwnedResources([currentResource]);
      }
    });
  return handle;
};
