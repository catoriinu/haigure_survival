import {
  NavMeshQuery,
  QueryFilter,
  Raw,
  type NavMesh
} from "recast-navigation";
import {
  buildTiledNavMeshRcConfig,
  generateTiledNavMesh,
  tiledNavMeshGeneratorConfigDefaults,
  type TiledNavMeshGeneratorConfig
} from "recast-navigation/generators";

import {
  HUMAN_NAV_TILE_BUNDLE_RECAST_VERSION,
  HUMAN_NAV_TILE_BUNDLE_SCHEMA_VERSION,
  assembleHumanNavTileBundle,
  createHumanNavRoomVariantSelections,
  exportHumanNavTileSet,
  type HumanNavRoomVariantSelection,
  type HumanNavTileBundle,
  type HumanNavTileParameters,
  type HumanNavTileSet
} from "../../../src/world/humanNavTileBundle";
import { initializeNavigationRuntime } from "../../../src/world/navigationWorld";

export type HumanNavTileAcceptanceCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type FixtureGeometry = Readonly<{
  positions: readonly number[];
  indices: readonly number[];
}>;

type RepresentativePath = Readonly<{
  success: boolean;
  pointCount: number;
  distance: number;
}>;

const fixtureBounds: TiledNavMeshGeneratorConfig["bounds"] = [
  [0, -0.5, 0],
  [4, 0.5, 4]
];

const fixtureGeneratorConfig = Object.freeze({
  bounds: fixtureBounds,
  tileSize: 20,
  cs: 0.1,
  ch: 0.05,
  walkableSlopeAngle: 45,
  walkableHeight: 8,
  walkableClimb: 2,
  walkableRadius: 1,
  maxEdgeLen: 12,
  maxSimplificationError: 1.3,
  minRegionArea: 1,
  mergeRegionArea: 2,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1
}) satisfies Partial<TiledNavMeshGeneratorConfig>;

const appendWalkableQuad = (
  positions: number[],
  indices: number[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
) => {
  const vertexOffset = positions.length / 3;
  positions.push(
    minX,
    0,
    minZ,
    maxX,
    0,
    minZ,
    maxX,
    0,
    maxZ,
    minX,
    0,
    maxZ
  );
  indices.push(
    vertexOffset,
    vertexOffset + 3,
    vertexOffset + 2,
    vertexOffset,
    vertexOffset + 2,
    vertexOffset + 1
  );
};

const createFixtureGeometry = (
  variant: "normal" | "disordered"
): FixtureGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];
  appendWalkableQuad(positions, indices, 0, 2, 0, 4);

  if (variant === "normal") {
    appendWalkableQuad(positions, indices, 2, 4, 0, 4);
  } else {
    appendWalkableQuad(positions, indices, 2, 2.7, 0, 4);
    appendWalkableQuad(positions, indices, 3.3, 4, 0, 4);
    appendWalkableQuad(positions, indices, 2.7, 3.3, 0, 1.2);
    appendWalkableQuad(positions, indices, 2.7, 3.3, 2.8, 4);
  }

  return Object.freeze({
    positions: Object.freeze(positions),
    indices: Object.freeze(indices)
  });
};

const createFixtureParameters = (): HumanNavTileParameters => {
  const mergedConfig = {
    ...tiledNavMeshGeneratorConfigDefaults,
    ...fixtureGeneratorConfig
  };
  const built = buildTiledNavMeshRcConfig({
    recastConfig: mergedConfig,
    navMeshBounds: fixtureBounds
  });
  try {
    return Object.freeze({
      origin: Object.freeze({ ...built.orig }),
      tileWidth: built.tcs,
      tileHeight: built.tcs,
      maxTiles: built.maxTiles,
      maxPolys: built.maxPolysPerTile
    });
  } finally {
    Raw.destroy(built.config);
    Raw.destroy(built.gridSize);
  }
};

const generateFixtureTileSet = (
  geometry: FixtureGeometry,
  parameters: HumanNavTileParameters
) => {
  const generated = generateTiledNavMesh(
    geometry.positions,
    geometry.indices,
    fixtureGeneratorConfig
  );
  if (!generated.success) {
    throw new Error(generated.error);
  }
  try {
    return exportHumanNavTileSet(generated.navMesh, parameters);
  } finally {
    generated.navMesh.destroy();
  }
};

const selectTiles = (
  source: HumanNavTileSet,
  tileX: number
): HumanNavTileSet =>
  Object.freeze({
    parameters: source.parameters,
    tiles: Object.freeze(
      source.tiles.filter((tile) => tile.coordinate.x === tileX)
    )
  });

const createBundle = (
  parameters: HumanNavTileParameters,
  common: HumanNavTileSet,
  normal: HumanNavTileSet,
  disordered: HumanNavTileSet
): HumanNavTileBundle =>
  Object.freeze({
    schemaVersion: HUMAN_NAV_TILE_BUNDLE_SCHEMA_VERSION,
    recastVersion: HUMAN_NAV_TILE_BUNDLE_RECAST_VERSION,
    navProfileId: "t04-human-nav-tile-fixture",
    parameters,
    common,
    rooms: Object.freeze([
      Object.freeze({
        roomId: "fixture-room",
        normal,
        disordered
      })
    ])
  });

const measurePathDistance = (
  points: readonly Readonly<{ x: number; y: number; z: number }>[]
) => {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distance += Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z
    );
  }
  return distance;
};

const findRepresentativePath = (navMesh: NavMesh): RepresentativePath => {
  const filter = new QueryFilter();
  filter.includeFlags = 0xffff;
  filter.excludeFlags = 0;
  const query = new NavMeshQuery(navMesh, {
    maxNodes: 512,
    defaultQueryFilter: filter
  });
  try {
    const path = query.computePath(
      { x: 0.4, y: 0, z: 2 },
      { x: 3.6, y: 0, z: 2 },
      {
        halfExtents: { x: 0.3, y: 0.3, z: 0.3 },
        maxPathPolys: 128,
        maxStraightPathPoints: 128
      }
    );
    return Object.freeze({
      success: path.success,
      pointCount: path.path.length,
      distance: measurePathDistance(path.path)
    });
  } finally {
    query.destroy();
    Raw.destroy(filter.raw);
  }
};

const captureAssemblyError = async (
  bundle: HumanNavTileBundle,
  selection: readonly HumanNavRoomVariantSelection[]
) => {
  try {
    const assembled = await assembleHumanNavTileBundle(bundle, selection);
    assembled.navMesh.destroy();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

export const runHumanNavTileAcceptance =
  async (): Promise<readonly HumanNavTileAcceptanceCheck[]> => {
    await initializeNavigationRuntime();
    const parameters = createFixtureParameters();
    const normalSource = generateFixtureTileSet(
      createFixtureGeometry("normal"),
      parameters
    );
    const disorderedSource = generateFixtureTileSet(
      createFixtureGeometry("disordered"),
      parameters
    );
    const common = selectTiles(normalSource, 0);
    const normal = selectTiles(normalSource, 1);
    const disordered = selectTiles(disorderedSource, 1);
    const bundle = createBundle(
      parameters,
      common,
      normal,
      disordered
    );
    const normalSelection = createHumanNavRoomVariantSelections(
      ["fixture-room"],
      []
    );
    const disorderedSelection = createHumanNavRoomVariantSelections(
      ["fixture-room"],
      ["fixture-room"]
    );

    const normalAssembly = await assembleHumanNavTileBundle(
      bundle,
      normalSelection
    );
    const disorderedAssembly = await assembleHumanNavTileBundle(
      bundle,
      disorderedSelection
    );
    let normalPath: RepresentativePath;
    let disorderedPath: RepresentativePath;
    try {
      normalPath = findRepresentativePath(normalAssembly.navMesh);
      disorderedPath = findRepresentativePath(disorderedAssembly.navMesh);
    } finally {
      normalAssembly.navMesh.destroy();
      disorderedAssembly.navMesh.destroy();
    }

    const missingVariantBundle = createBundle(
      parameters,
      common,
      normal,
      Object.freeze({
        parameters,
        tiles: Object.freeze([])
      })
    );
    const missingVariantMessage = await captureAssemblyError(
      missingVariantBundle,
      disorderedSelection
    );

    const duplicateTileBundle = createBundle(
      parameters,
      Object.freeze({
        parameters,
        tiles: Object.freeze([common.tiles[0], common.tiles[0]])
      }),
      normal,
      disordered
    );
    const duplicateTileMessage = await captureAssemblyError(
      duplicateTileBundle,
      normalSelection
    );

    const mismatchedParameters = Object.freeze({
      ...parameters,
      tileWidth: parameters.tileWidth + 0.1
    });
    const parameterMismatchBundle = createBundle(
      parameters,
      common,
      Object.freeze({
        parameters: mismatchedParameters,
        tiles: normal.tiles
      }),
      disordered
    );
    const parameterMismatchMessage = await captureAssemblyError(
      parameterMismatchBundle,
      normalSelection
    );

    return Object.freeze([
      Object.freeze({
        name: "commonとroom variantの実tile組立",
        ok:
          common.tiles.length > 0 &&
          normal.tiles.length > 0 &&
          normalAssembly.tileCount ===
            common.tiles.length + normal.tiles.length &&
          disorderedAssembly.tileCount ===
            common.tiles.length + disordered.tiles.length,
        detail: `common=${common.tiles.length} / normal=${normal.tiles.length} / disordered=${disordered.tiles.length}`
      }),
      Object.freeze({
        name: "normalとdisorderedの選択差",
        ok:
          normalAssembly.selectedVariants[0]?.variant === "normal" &&
          disorderedAssembly.selectedVariants[0]?.variant ===
            "disordered" &&
          normalPath.success &&
          disorderedPath.success &&
          disorderedPath.distance > normalPath.distance + 0.2,
        detail: `normal=${normalPath.distance.toFixed(3)}(${normalPath.pointCount}) / disordered=${disorderedPath.distance.toFixed(3)}(${disorderedPath.pointCount})`
      }),
      Object.freeze({
        name: "欠落variant・重複tile・parameters不一致の拒否",
        ok:
          missingVariantMessage?.includes("tileがありません") === true &&
          duplicateTileMessage?.includes("重複") === true &&
          parameterMismatchMessage?.includes("一致しません") === true,
        detail: `missing=${missingVariantMessage ?? "none"} / duplicate=${duplicateTileMessage ?? "none"} / parameters=${parameterMismatchMessage ?? "none"}`
      }),
      Object.freeze({
        name: "組立後NavMeshQueryの代表経路",
        ok:
          normalPath.success &&
          normalPath.pointCount >= 2 &&
          disorderedPath.success &&
          disorderedPath.pointCount >= 3,
        detail: `normal=${normalPath.pointCount}点 / disordered=${disorderedPath.pointCount}点`
      })
    ]);
  };
