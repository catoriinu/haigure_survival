import type { Scene } from "@babylonjs/core";

import {
  createDynamicStageSpatialVariants,
  type DynamicStageSpatialActiveSet,
  type DynamicStageSpatialVariants
} from "../../../src/world/dynamicStageSpatialVariants";
import {
  createStageSpatialQueries,
  type StageSpatialQueries,
  type StageSpatialQueryOptions
} from "../../../src/world/stageSpatialQueries";

export type DynamicStageSpatialQueryFixture = Readonly<{
  dynamicVariants: DynamicStageSpatialVariants;
  queries: StageSpatialQueries;
  dispose(): void;
}>;

export const createDynamicStageSpatialQueryFixture = (
  scene: Scene,
  activeSet: DynamicStageSpatialActiveSet,
  options: StageSpatialQueryOptions
): DynamicStageSpatialQueryFixture => {
  const dynamicVariants = createDynamicStageSpatialVariants(activeSet);
  const queries = createStageSpatialQueries(
    scene,
    dynamicVariants,
    options
  );
  return Object.freeze({
    dynamicVariants,
    queries,
    dispose: () => {
      queries.dispose();
      dynamicVariants.dispose();
    }
  });
};
