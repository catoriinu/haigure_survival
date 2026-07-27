import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Detour,
  exportNavMesh,
  getNavMeshPositionsAndIndices,
  importNavMesh,
  init,
  NavMesh,
  NavMeshParams,
  NavMeshQuery,
  QueryFilter,
  Raw,
  statusFailed,
  statusToReadableString,
  UnsignedCharArray
} from "recast-navigation";
import { generateTileCache } from "recast-navigation/generators";

import {
  assertArray,
  assertExactKeys,
  assertFiniteNumber,
  assertInstalledRecastVersion,
  assertObject,
  buildSceneGraph,
  extractNavigationGeometry,
  fail,
  parseGlb,
  sha256,
  stableStringify
} from "./bake_school_navmesh.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const INPUT_RELATIVE_PATH =
  "public/stage-assets/v2/B02/b02_school_blockout.glb";
const BASE_OUTPUT_RELATIVE_PATH =
  "public/stage-assets/v2/B02/b02_school_blockout.navmesh.bin";
const BUNDLE_OUTPUT_RELATIVE_PATH =
  "public/stage-assets/v2/B02/b02_school_blockout.room-variants.navmesh.bin";
const INPUT_PATH = resolve(REPOSITORY_ROOT, INPUT_RELATIVE_PATH);
const BASE_OUTPUT_PATH = resolve(REPOSITORY_ROOT, BASE_OUTPUT_RELATIVE_PATH);
const BUNDLE_OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  BUNDLE_OUTPUT_RELATIVE_PATH
);

const BUNDLE_MAGIC = Uint8Array.of(
  0x48,
  0x53,
  0x52,
  0x56,
  0x4e,
  0x41,
  0x56,
  0x00
);
const BUNDLE_FORMAT_VERSION = 1;
const BUNDLE_HEADER_BYTE_LENGTH = 24;
const DETOUR_MESH_HEADER_BYTE_LENGTH = 100;
const DETOUR_POLY_BYTE_LENGTH = 32;
const DETOUR_VERTEX_BYTE_LENGTH = 12;
const MAX_UINT32 = 0xffff_ffff;
const MAX_INT32 = 0x7fff_ffff;
const GRID_ALIGNMENT_TOLERANCE = 1e-5;
const BOUNDS_TOLERANCE = 1e-6;
const RAY_INTERSECTION_TOLERANCE = 1e-8;
const BAND_CLIP_VERTEX_TOLERANCE = 1e-10;
const BAND_CLIP_AREA_ABSOLUTE_TOLERANCE = 1e-10;
const BAND_CLIP_AREA_RELATIVE_TOLERANCE = 1e-8;
const ROUTE_ENDPOINT_TOLERANCE = 1e-5;
const ROUTE_PATH_LIMIT = 4096;
const ROOM_ROUTE_OUTSIDE_DISTANCE = 0.15;
const ROOM_ROUTE_PROJECTION_MAX_DISTANCE = 0.25;
const ROOM_CENTER_MAXIMUM_HORIZONTAL_PROJECTION_DISTANCE = 0.3;
const GROUND_POLYGON_AREA = 0;
const ROOM_ROUTE_QUERY_HALF_EXTENTS = Object.freeze({
  x: 0.3,
  y: 0.45,
  z: 0.3
});
const RAMP_INITIAL_STEP_MAXIMUM = 0.15;
const RAMP_MINIMUM_HEIGHT_GAIN = 0.04;
const RAMP_MINIMUM_TRIANGLE_RISE = 0.1;
const RAMP_MAXIMUM_SLOPE_DEGREES = 45;
const RAMP_ROUTE_PROJECTION_MAX_DISTANCE = 0.08;
const RAMP_ROUTE_QUERY_HALF_EXTENTS = Object.freeze({
  x: 0.08,
  y: 0.08,
  z: 0.08
});
const VARIANT_MARKER_PREFIX = "MRK_RoomVariant_";
const VARIANT_TILE_VOLUME_PREFIX = "VOL_RoomVariantTile_";
const REGISTERED_NAV_AREAS = new Set([
  "ground",
  "stairs",
  "outdoor",
  "door"
]);
const REGISTERED_NAV_ROLES = new Set(["walkable", "blocker", "exclude"]);

const ROOM_IDS = Object.freeze([
  "f02-classroom-01",
  "f02-classroom-02",
  "f02-classroom-03",
  "f03-classroom-01",
  "f03-classroom-02",
  "f03-classroom-03",
  "f04-classroom-01",
  "f04-classroom-02",
  "f04-classroom-03",
  "f01-infirmary",
  "f01-library",
  "f01-staff-room",
  "f01-pc-room",
  "f02-council",
  "f02-broadcast",
  "f02-science",
  "f03-art",
  "f03-home-ec",
  "f04-ll",
  "f04-music"
]);
const ROOM_ID_SET = new Set(ROOM_IDS);
const ROOM_DOOR_COUNTS = Object.freeze({
  "f01-infirmary": 2,
  "f01-library": 2,
  "f01-staff-room": 2,
  "f01-pc-room": 2,
  "f02-classroom-01": 2,
  "f02-classroom-02": 2,
  "f02-classroom-03": 2,
  "f02-council": 1,
  "f02-broadcast": 1,
  "f02-science": 2,
  "f03-classroom-01": 2,
  "f03-classroom-02": 2,
  "f03-classroom-03": 2,
  "f03-art": 2,
  "f03-home-ec": 2,
  "f04-classroom-01": 2,
  "f04-classroom-02": 2,
  "f04-classroom-03": 2,
  "f04-ll": 2,
  "f04-music": 2
});
const ROOM_BOUNDS_BY_ID = Object.freeze({
  "f01-infirmary": Object.freeze([-12.45, -3.65, 2.65, 12.35]),
  "f01-library": Object.freeze([-12.45, -3.65, 12.65, 32.35]),
  "f01-staff-room": Object.freeze([5.55, 23.25, 36.65, 45.35]),
  "f01-pc-room": Object.freeze([23.55, 41.25, 36.65, 45.35]),
  "f02-classroom-01": Object.freeze([-12.45, -3.65, 2.65, 12.35]),
  "f02-classroom-02": Object.freeze([-12.45, -3.65, 12.65, 22.35]),
  "f02-classroom-03": Object.freeze([-12.45, -3.65, 22.65, 32.35]),
  "f02-council": Object.freeze([5.55, 14.25, 36.65, 45.35]),
  "f02-broadcast": Object.freeze([14.55, 23.25, 36.65, 45.35]),
  "f02-science": Object.freeze([23.55, 41.25, 36.65, 45.35]),
  "f03-classroom-01": Object.freeze([-12.45, -3.65, 2.65, 12.35]),
  "f03-classroom-02": Object.freeze([-12.45, -3.65, 12.65, 22.35]),
  "f03-classroom-03": Object.freeze([-12.45, -3.65, 22.65, 32.35]),
  "f03-art": Object.freeze([5.55, 23.25, 36.65, 45.35]),
  "f03-home-ec": Object.freeze([23.55, 41.25, 36.65, 45.35]),
  "f04-classroom-01": Object.freeze([-12.45, -3.65, 2.65, 12.35]),
  "f04-classroom-02": Object.freeze([-12.45, -3.65, 12.65, 22.35]),
  "f04-classroom-03": Object.freeze([-12.45, -3.65, 22.65, 32.35]),
  "f04-ll": Object.freeze([5.55, 23.25, 36.65, 45.35]),
  "f04-music": Object.freeze([23.55, 41.25, 36.65, 45.35])
});
const VARIANT_IDS = Object.freeze(["normal", "disordered"]);
const VARIANT_ID_SET = new Set(VARIANT_IDS);

const SCHOOL_ROOM_VARIANT_NAV_PROFILE = Object.freeze({
  id: "school-humanoid-room-variants-v2",
  schemaVersion: 2,
  stageId: "school",
  bitNavProfileId: "bit-flight-body-0.44-margin-0.10-v1",
  coordinateSpace: "gltf-right-handed-y-up",
  worldScale: 0.25,
  generator: "tile-cache-layered",
  recastPackage: "recast-navigation",
  recastVersion: "0.43.1",
  bounds: Object.freeze([
    Object.freeze([
      -4.9,
      -0.07500000298023224,
      -13.125
    ]),
    Object.freeze([
      16.1,
      4.224999904632568,
      3.875
    ])
  ]),
  grid: Object.freeze({
    tileSize: 10,
    tileCountX: 84,
    tileCountY: 68,
    expectedLayersPerTile: 5
  }),
  navMeshParams: Object.freeze({
    origin: Object.freeze([
      -4.9,
      -0.07500000298023224,
      -13.125
    ]),
    tileWidth: 0.25,
    tileHeight: 0.25,
    maxTiles: 16384,
    maxPolys: 256
  }),
  parameters: Object.freeze({
    cs: 0.025,
    ch: 0.0125,
    walkableSlopeAngle: 45,
    walkableHeight: 34,
    walkableClimb: 3,
    walkableRadius: 4,
    maxEdgeLen: 12,
    maxSimplificationError: 1.3,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
    buildBvTree: true,
    tileSize: 10,
    expectedLayersPerTile: 5,
    maxObstacles: 128
  })
});

const assertNonEmptyString = (value, label) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    fail(`${label}は前後空白のない非空stringである必要があります。`);
  }
  return value;
};

const assertInteger = (value, label, minimum = 0, maximum = MAX_UINT32) => {
  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(
      `${label}は${minimum}以上${maximum}以下のintegerである必要があります。`
    );
  }
  return value;
};

const arraysEqual = (left, right) =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const codeUnitCompare = (left, right) => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const variantIndex = (variantId) => {
  const index = VARIANT_IDS.indexOf(variantId);
  if (index === -1) {
    fail(`未登録のroom variant IDです: ${String(variantId)}`);
  }
  return index;
};

const compareTileCoordinates = (left, right) =>
  left.y - right.y ||
  left.x - right.x ||
  left.layer - right.layer;

const compareBundleEntries = (left, right) =>
  codeUnitCompare(left.roomId, right.roomId) ||
  variantIndex(left.variantId) - variantIndex(right.variantId) ||
  left.tileY - right.tileY ||
  left.tileX - right.tileX ||
  left.layer - right.layer;

const tileKey = (x, y, layer) => `${x}/${y}/${layer}`;
const roomVariantKey = (roomId, variantId) => `${roomId}\u0000${variantId}`;
const bundleEntryKey = (entry) =>
  `${entry.roomId}\u0000${entry.variantId}\u0000${entry.tileX}/${entry.tileY}/${entry.layer}`;

const assertProfileGrid = () => {
  const profile = SCHOOL_ROOM_VARIANT_NAV_PROFILE;
  const [boundsMin, boundsMax] = profile.bounds;
  const expectedTileWidth =
    profile.parameters.cs * profile.grid.tileSize;
  if (
    expectedTileWidth !== profile.navMeshParams.tileWidth ||
    expectedTileWidth !== profile.navMeshParams.tileHeight
  ) {
    fail("固定NavMesh profileのtile実寸がcell sizeと一致しません。");
  }
  if (
    profile.navMeshParams.origin.some(
      (value, index) => value !== boundsMin[index]
    )
  ) {
    fail("固定NavMesh profileのoriginとbounds minimumが一致しません。");
  }
  const cellCountX = Math.floor(
    (boundsMax[0] - boundsMin[0]) / profile.parameters.cs + 0.5
  );
  const cellCountY = Math.floor(
    (boundsMax[2] - boundsMin[2]) / profile.parameters.cs + 0.5
  );
  const tileCountX = Math.floor(
    (cellCountX + profile.grid.tileSize - 1) / profile.grid.tileSize
  );
  const tileCountY = Math.floor(
    (cellCountY + profile.grid.tileSize - 1) / profile.grid.tileSize
  );
  if (
    tileCountX !== profile.grid.tileCountX ||
    tileCountY !== profile.grid.tileCountY
  ) {
    fail(
      `固定NavMesh profileのgrid件数が不一致です: ` +
        `${tileCountX}x${tileCountY}`
    );
  }
  const requestedTileCapacity =
    tileCountX *
    tileCountY *
    profile.grid.expectedLayersPerTile;
  let tileBits = 0;
  let roundedCapacity = 1;
  while (roundedCapacity < requestedTileCapacity) {
    roundedCapacity *= 2;
    tileBits += 1;
  }
  tileBits = Math.min(tileBits, 14);
  const maxTiles = 2 ** tileBits;
  const maxPolys = 2 ** (22 - tileBits);
  if (
    maxTiles !== profile.navMeshParams.maxTiles ||
    maxPolys !== profile.navMeshParams.maxPolys
  ) {
    fail(
      `固定NavMesh profileのDetour容量が不一致です: ` +
        `maxTiles=${maxTiles}, maxPolys=${maxPolys}`
    );
  }
};

const buildParentIndices = (nodes) => {
  const parentIndices = new Int32Array(nodes.length);
  parentIndices.fill(-1);
  nodes.forEach((node, parentIndex) => {
    if (node.children === undefined) {
      return;
    }
    assertArray(
      node.children,
      `${node.name}.children`
    ).forEach((childIndex, childOffset) => {
      const checkedIndex = assertInteger(
        childIndex,
        `${node.name}.children[${childOffset}]`,
        0,
        nodes.length - 1
      );
      if (parentIndices[checkedIndex] !== -1) {
        fail(`${nodes[checkedIndex].name}が複数のparentを持っています。`);
      }
      parentIndices[checkedIndex] = parentIndex;
    });
  });
  return parentIndices;
};

const nearestVariantMarkerIndex = (
  nodeIndex,
  parentIndices,
  variantMarkerIndexSet
) => {
  let current = parentIndices[nodeIndex];
  while (current !== -1) {
    if (variantMarkerIndexSet.has(current)) {
      return current;
    }
    current = parentIndices[current];
  }
  return -1;
};

const validateMetadata = (nodes) => {
  const metadataNodes = nodes.filter((node) => node.name === "META_Stage");
  if (metadataNodes.length !== 1) {
    fail(`META_Stageは1件必要です（実際=${metadataNodes.length}件）。`);
  }
  const metadataNode = metadataNodes[0];
  if (metadataNode.mesh !== undefined) {
    fail("META_StageはMeshを参照しないEmptyである必要があります。");
  }
  const extras = assertObject(metadataNode.extras, "META_Stage.extras");
  assertExactKeys(
    extras,
    [
      "hs_schema_version",
      "hs_stage_id",
      "hs_nav_profile",
      "hs_bit_nav_profile"
    ],
    "META_Stage.extras"
  );
  if (
    extras.hs_schema_version !==
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.schemaVersion
  ) {
    fail(
      `META_Stage.hs_schema_versionが不一致です: ` +
        `${String(extras.hs_schema_version)}`
    );
  }
  if (extras.hs_stage_id !== SCHOOL_ROOM_VARIANT_NAV_PROFILE.stageId) {
    fail(
      `META_Stage.hs_stage_idが不一致です: ` +
        `${String(extras.hs_stage_id)}`
    );
  }
  if (extras.hs_nav_profile !== SCHOOL_ROOM_VARIANT_NAV_PROFILE.id) {
    fail(
      `META_Stage.hs_nav_profileが不一致です: ` +
        `${String(extras.hs_nav_profile)} != ` +
        SCHOOL_ROOM_VARIANT_NAV_PROFILE.id
    );
  }
  if (
    extras.hs_bit_nav_profile !==
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.bitNavProfileId
  ) {
    fail(
      `META_Stage.hs_bit_nav_profileが不一致です: ` +
        `${String(extras.hs_bit_nav_profile)}`
    );
  }
};

const validateHumanNavigationExtras = (node) => {
  if (node.mesh === undefined) {
    fail(`${node.name}はMeshを参照する必要があります。`);
  }
  const extras = assertObject(node.extras, `${node.name}.extras`);
  if (extras.hs_nav_set !== "human") {
    fail(`${node.name}.hs_nav_setがhumanではありません。`);
  }
  if (!REGISTERED_NAV_ROLES.has(extras.hs_nav_role)) {
    fail(
      `${node.name}.hs_nav_roleが未登録です: ` +
        `${String(extras.hs_nav_role)}`
    );
  }
  if (extras.hs_nav_role === "walkable") {
    assertExactKeys(
      extras,
      ["hs_nav_set", "hs_nav_role", "hs_nav_area"],
      `${node.name}.extras`
    );
    if (!REGISTERED_NAV_AREAS.has(extras.hs_nav_area)) {
      fail(
        `${node.name}.hs_nav_areaが未登録です: ` +
          `${String(extras.hs_nav_area)}`
      );
    }
  } else {
    assertExactKeys(
      extras,
      ["hs_nav_set", "hs_nav_role"],
      `${node.name}.extras`
    );
  }
  if (extras.hs_nav_role === "exclude") {
    fail(
      `${SCHOOL_ROOM_VARIANT_NAV_PROFILE.id}は` +
        `hs_nav_role=excludeを使用しません: ${node.name}`
    );
  }
  return extras;
};

const collectAssetContract = (nodes) => {
  validateMetadata(nodes);
  const parentIndices = buildParentIndices(nodes);
  const markerCandidates = nodes
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(({ node }) => {
      const role =
        node.extras !== undefined &&
        node.extras !== null &&
        typeof node.extras === "object" &&
        !Array.isArray(node.extras)
          ? node.extras.hs_role
          : undefined;
      return (
        node.name.startsWith(VARIANT_MARKER_PREFIX) ||
        role === "room_variant"
      );
    });
  if (markerCandidates.length !== ROOM_IDS.length * VARIANT_IDS.length) {
    fail(
      `room_variant markerは${ROOM_IDS.length * VARIANT_IDS.length}件必要です` +
        `（実際=${markerCandidates.length}件）。`
    );
  }

  const variantMarkers = [];
  const markerByPair = new Map();
  markerCandidates.forEach(({ node, nodeIndex }) => {
    if (!node.name.startsWith(VARIANT_MARKER_PREFIX)) {
      fail(
        `hs_role=room_variantのObject名が${VARIANT_MARKER_PREFIX}で始まりません: ` +
          node.name
      );
    }
    if (node.mesh !== undefined) {
      fail(`${node.name}はMeshを参照しないEmptyである必要があります。`);
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    assertExactKeys(
      extras,
      ["hs_id", "hs_role", "hs_room_id", "hs_variant_id"],
      `${node.name}.extras`
    );
    if (extras.hs_role !== "room_variant") {
      fail(`${node.name}.hs_roleはroom_variantである必要があります。`);
    }
    const roomId = assertNonEmptyString(
      extras.hs_room_id,
      `${node.name}.hs_room_id`
    );
    const variantId = assertNonEmptyString(
      extras.hs_variant_id,
      `${node.name}.hs_variant_id`
    );
    const id = assertNonEmptyString(extras.hs_id, `${node.name}.hs_id`);
    if (!ROOM_ID_SET.has(roomId)) {
      fail(`${node.name}.hs_room_idが固定20室IDに含まれません: ${roomId}`);
    }
    if (!VARIANT_ID_SET.has(variantId)) {
      fail(
        `${node.name}.hs_variant_idがnormal/disorderedではありません: ` +
          variantId
      );
    }
    const expectedId = `room-variant-${roomId}-${variantId}`;
    if (id !== expectedId) {
      fail(`${node.name}.hs_idが不一致です: ${id} != ${expectedId}`);
    }
    const pairKey = roomVariantKey(roomId, variantId);
    if (markerByPair.has(pairKey)) {
      fail(`room_variant markerが重複しています: ${roomId}/${variantId}`);
    }
    const entry = {
      node,
      nodeIndex,
      roomId,
      variantId,
      navigationNodes: []
    };
    markerByPair.set(pairKey, entry);
    variantMarkers.push(entry);
  });

  ROOM_IDS.forEach((roomId) => {
    VARIANT_IDS.forEach((variantId) => {
      if (!markerByPair.has(roomVariantKey(roomId, variantId))) {
        fail(`room_variant markerがありません: ${roomId}/${variantId}`);
      }
    });
  });

  const variantMarkerIndexSet = new Set(
    variantMarkers.map(({ nodeIndex }) => nodeIndex)
  );
  variantMarkers.forEach(({ node, nodeIndex }) => {
    if (
      nearestVariantMarkerIndex(
        nodeIndex,
        parentIndices,
        variantMarkerIndexSet
      ) !== -1
    ) {
      fail(`room_variant markerを入れ子にできません: ${node.name}`);
    }
  });

  const volumeCandidates = nodes
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(({ node }) => {
      const role =
        node.extras !== undefined &&
        node.extras !== null &&
        typeof node.extras === "object" &&
        !Array.isArray(node.extras)
          ? node.extras.hs_role
          : undefined;
      return (
        node.name.startsWith(VARIANT_TILE_VOLUME_PREFIX) ||
        role === "room_variant_tile"
      );
    });
  if (volumeCandidates.length !== ROOM_IDS.length) {
    fail(
      `room_variant_tile Volumeは${ROOM_IDS.length}件必要です` +
        `（実際=${volumeCandidates.length}件）。`
    );
  }
  const volumeByRoom = new Map();
  const volumes = volumeCandidates.map(({ node, nodeIndex }) => {
    if (!node.name.startsWith(VARIANT_TILE_VOLUME_PREFIX)) {
      fail(
        `hs_role=room_variant_tileのObject名が` +
          `${VARIANT_TILE_VOLUME_PREFIX}で始まりません: ${node.name}`
      );
    }
    if (node.mesh === undefined) {
      fail(`${node.name}は閉じたMeshを参照する必要があります。`);
    }
    if (
      nearestVariantMarkerIndex(
        nodeIndex,
        parentIndices,
        variantMarkerIndexSet
      ) !== -1
    ) {
      fail(`${node.name}をroom_variant marker配下へ置けません。`);
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    assertExactKeys(
      extras,
      ["hs_id", "hs_role", "hs_room_id"],
      `${node.name}.extras`
    );
    if (extras.hs_role !== "room_variant_tile") {
      fail(`${node.name}.hs_roleはroom_variant_tileである必要があります。`);
    }
    const roomId = assertNonEmptyString(
      extras.hs_room_id,
      `${node.name}.hs_room_id`
    );
    const id = assertNonEmptyString(extras.hs_id, `${node.name}.hs_id`);
    if (!ROOM_ID_SET.has(roomId)) {
      fail(`${node.name}.hs_room_idが固定20室IDに含まれません: ${roomId}`);
    }
    const expectedId = `room-variant-tile-${roomId}`;
    if (id !== expectedId) {
      fail(`${node.name}.hs_idが不一致です: ${id} != ${expectedId}`);
    }
    if (volumeByRoom.has(roomId)) {
      fail(`room_variant_tile Volumeが重複しています: ${roomId}`);
    }
    const entry = { node, nodeIndex, roomId };
    volumeByRoom.set(roomId, entry);
    return entry;
  });
  ROOM_IDS.forEach((roomId) => {
    if (!volumeByRoom.has(roomId)) {
      fail(`room_variant_tile Volumeがありません: ${roomId}`);
    }
  });

  const staticNavigationNodes = [];
  let staticWalkableCount = 0;
  let staticBlockerCount = 0;
  nodes.forEach((node, nodeIndex) => {
    if (!node.name.startsWith("NAV_")) {
      return;
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    const markerIndex = nearestVariantMarkerIndex(
      nodeIndex,
      parentIndices,
      variantMarkerIndexSet
    );
    if (extras.hs_nav_set === "bit-flight") {
      if (markerIndex !== -1) {
        fail(`ビット用NAV_*をroom_variant配下へ置けません: ${node.name}`);
      }
      return;
    }
    const checkedExtras = validateHumanNavigationExtras(node);
    const navigationEntry = { node, nodeIndex };
    if (markerIndex === -1) {
      staticNavigationNodes.push(navigationEntry);
      if (checkedExtras.hs_nav_role === "walkable") {
        staticWalkableCount += 1;
      }
      if (checkedExtras.hs_nav_role === "blocker") {
        staticBlockerCount += 1;
      }
      return;
    }
    const marker = variantMarkers.find(
      ({ nodeIndex: candidateIndex }) => candidateIndex === markerIndex
    );
    if (marker === undefined) {
      fail(`${node.name}のroom_variant ancestorを解決できません。`);
    }
    marker.navigationNodes.push(navigationEntry);
  });

  if (staticNavigationNodes.length === 0 || staticWalkableCount === 0) {
    fail("静的な人間用walkable NAV_*が必要です。");
  }
  if (staticBlockerCount === 0) {
    fail("静的な人間用blocker NAV_*が必要です。");
  }
  variantMarkers.forEach((marker) => {
    if (marker.navigationNodes.length === 0) {
      fail(
        `room_variant配下に人間用NAV_*がありません: ` +
          `${marker.roomId}/${marker.variantId}`
      );
    }
  });

  variantMarkers.sort(
    (left, right) =>
      codeUnitCompare(left.roomId, right.roomId) ||
      variantIndex(left.variantId) - variantIndex(right.variantId)
  );
  volumes.sort((left, right) =>
    codeUnitCompare(left.roomId, right.roomId)
  );

  return {
    staticNavigationNodes,
    variantMarkers,
    volumes
  };
};

const collectRoomDoorContract = (nodes, worldMatrices) => {
  const configuredRoomIds = Object.keys(ROOM_DOOR_COUNTS);
  const configuredBoundsRoomIds = Object.keys(ROOM_BOUNDS_BY_ID);
  if (
    configuredRoomIds.length !== ROOM_IDS.length ||
    configuredRoomIds.some((roomId) => !ROOM_ID_SET.has(roomId)) ||
    configuredBoundsRoomIds.length !== ROOM_IDS.length ||
    configuredBoundsRoomIds.some((roomId) => !ROOM_ID_SET.has(roomId))
  ) {
    fail("固定room door・roomBounds仕様表のroom ID集合が固定20室と一致しません。");
  }
  const expectedDoorToRoom = new Map();
  ROOM_IDS.forEach((roomId) => {
    const doorCount = assertInteger(
      ROOM_DOOR_COUNTS[roomId],
      `${roomId}の固定door件数`,
      1,
      2
    );
    for (let doorIndex = 1; doorIndex <= doorCount; doorIndex += 1) {
      expectedDoorToRoom.set(
        `room-door-${roomId}-${String(doorIndex).padStart(2, "0")}`,
        roomId
      );
    }
  });
  const doorCandidates = nodes
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(
      ({ node }) =>
        node.extras !== undefined &&
        node.extras !== null &&
        typeof node.extras === "object" &&
        !Array.isArray(node.extras) &&
        node.extras.hs_role === "door" &&
        node.extras.hs_door_class === "room"
    );
  if (doorCandidates.length !== expectedDoorToRoom.size) {
    fail(
      `固定20室のroom doorは${expectedDoorToRoom.size}件必要です` +
        `（実際=${doorCandidates.length}件）。`
    );
  }
  const doorsByRoom = new Map(
    ROOM_IDS.map((roomId) => [roomId, []])
  );
  const actualDoorIds = new Set();
  doorCandidates.forEach(({ node, nodeIndex }) => {
    if (node.mesh !== undefined) {
      fail(`${node.name}はMeshを参照しないdoor rootである必要があります。`);
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    assertExactKeys(
      extras,
      ["hs_door_class", "hs_id", "hs_role", "hs_sweep_id"],
      `${node.name}.extras`
    );
    const doorId = assertNonEmptyString(
      extras.hs_id,
      `${node.name}.hs_id`
    );
    const roomId = expectedDoorToRoom.get(doorId);
    if (roomId === undefined) {
      fail(`${node.name}.hs_idが固定room door仕様表にありません: ${doorId}`);
    }
    if (actualDoorIds.has(doorId)) {
      fail(`room door IDが重複しています: ${doorId}`);
    }
    actualDoorIds.add(doorId);
    if (extras.hs_role !== "door" || extras.hs_door_class !== "room") {
      fail(`${node.name}がroom door契約と一致しません。`);
    }
    if (extras.hs_sweep_id !== `${doorId}-sweep`) {
      fail(
        `${node.name}.hs_sweep_idが固定door IDと一致しません: ` +
          `${String(extras.hs_sweep_id)}`
      );
    }
    const worldMatrix = worldMatrices[nodeIndex];
    if (!Array.isArray(worldMatrix) || worldMatrix.length !== 16) {
      fail(`${node.name}のworld matrixを解決できません。`);
    }
    const position = [12, 13, 14].map((matrixIndex, axis) =>
      assertFiniteNumber(
        worldMatrix[matrixIndex] *
          SCHOOL_ROOM_VARIANT_NAV_PROFILE.worldScale,
        `${node.name}.worldPosition[${axis}]`
      )
    );
    doorsByRoom.get(roomId).push({
      doorId,
      nodeName: node.name,
      position
    });
  });
  expectedDoorToRoom.forEach((roomId, doorId) => {
    if (!actualDoorIds.has(doorId)) {
      fail(`固定room doorがありません: ${doorId}`);
    }
  });
  doorsByRoom.forEach((doors, roomId) => {
    doors.sort((left, right) =>
      codeUnitCompare(left.doorId, right.doorId)
    );
    if (doors.length !== ROOM_DOOR_COUNTS[roomId]) {
      fail(
        `${roomId}のroom door件数が仕様表と一致しません: ${doors.length}`
      );
    }
    const floorY = doors[0].position[1];
    if (
      doors.some(
        ({ position }) =>
          Math.abs(position[1] - floorY) > BOUNDS_TOLERANCE
      )
    ) {
      fail(`${roomId}のroom door floor高さが一致しません。`);
    }
  });
  return doorsByRoom;
};

const assertGeometryInsideFixedBounds = (geometry, label) => {
  const [boundsMin, boundsMax] = SCHOOL_ROOM_VARIANT_NAV_PROFILE.bounds;
  geometry.boundsMin.forEach((value, axis) => {
    if (value < boundsMin[axis] - BOUNDS_TOLERANCE) {
      fail(
        `${label}のminimumが固定NavMesh bounds外です: ` +
          `axis=${axis}, ${value} < ${boundsMin[axis]}`
      );
    }
  });
  geometry.boundsMax.forEach((value, axis) => {
    if (value > boundsMax[axis] + BOUNDS_TOLERANCE) {
      fail(
        `${label}のmaximumが固定NavMesh bounds外です: ` +
          `axis=${axis}, ${value} > ${boundsMax[axis]}`
      );
    }
  });
};

const collectPhysicalBands = (volumes) => {
  const globalMinimumY =
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.bounds[0][1];
  const globalMaximumY =
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.bounds[1][1];
  const candidates = [globalMinimumY, globalMaximumY];
  volumes.forEach(({ geometry }) => {
    [geometry.boundsMin[1], geometry.boundsMax[1]].forEach((value) => {
      if (
        value > globalMinimumY + BOUNDS_TOLERANCE &&
        value < globalMaximumY - BOUNDS_TOLERANCE
      ) {
        candidates.push(value);
      }
    });
  });
  candidates.sort((left, right) => left - right);
  const boundaries = [];
  candidates.forEach((value) => {
    const previous = boundaries.at(-1);
    if (
      previous === undefined ||
      Math.abs(value - previous) > BOUNDS_TOLERANCE
    ) {
      boundaries.push(value);
    }
  });
  if (
    boundaries.length < 2 ||
    boundaries[0] !== globalMinimumY ||
    boundaries.at(-1) !== globalMaximumY
  ) {
    fail("static common用の物理Y band境界を固定bounds内で構成できません。");
  }
  return boundaries.slice(0, -1).map((minimumY, index) => ({
    id: `physical-y-band-${String(index).padStart(2, "0")}`,
    index,
    minimumY,
    maximumY: boundaries[index + 1],
    final: index === boundaries.length - 2
  }));
};

const bandForHeight = (height, bands, label) => {
  const band = bands.find(
    ({ minimumY, maximumY, final }) =>
      height >= minimumY - BOUNDS_TOLERANCE &&
      (final
        ? height <= maximumY + BOUNDS_TOLERANCE
        : height < maximumY)
  );
  if (band === undefined) {
    fail(`${label}の物理Y=${height}をbandへ割り当てられません。`);
  }
  return band;
};

const squaredPointDistance = (left, right) =>
  (left[0] - right[0]) ** 2 +
  (left[1] - right[1]) ** 2 +
  (left[2] - right[2]) ** 2;

const deduplicatePolygonVertices = (vertices) => {
  const filtered = [];
  vertices.forEach((vertex) => {
    const previous = filtered.at(-1);
    if (
      previous === undefined ||
      squaredPointDistance(previous, vertex) >
        BAND_CLIP_VERTEX_TOLERANCE ** 2
    ) {
      filtered.push(vertex);
    }
  });
  if (
    filtered.length > 1 &&
    squaredPointDistance(filtered[0], filtered.at(-1)) <=
      BAND_CLIP_VERTEX_TOLERANCE ** 2
  ) {
    filtered.pop();
  }
  return filtered;
};

const clipPolygonByHorizontalPlane = (
  sourceVertices,
  boundaryY,
  keepAbove
) => {
  if (sourceVertices.length < 3) {
    return [];
  }
  const inside = (vertex) =>
    keepAbove
      ? vertex[1] >= boundaryY
      : vertex[1] <= boundaryY;
  const intersection = (left, right) => {
    const denominator = right[1] - left[1];
    if (Math.abs(denominator) <= BAND_CLIP_VERTEX_TOLERANCE) {
      fail(
        `physical-Y band clipの交差辺が水平です: ` +
          `${JSON.stringify(left)} -> ${JSON.stringify(right)}, ` +
          `boundaryY=${boundaryY}`
      );
    }
    const interpolation = Math.max(
      0,
      Math.min(1, (boundaryY - left[1]) / denominator)
    );
    return [
      left[0] + (right[0] - left[0]) * interpolation,
      boundaryY,
      left[2] + (right[2] - left[2]) * interpolation
    ];
  };
  const clipped = [];
  for (let index = 0; index < sourceVertices.length; index += 1) {
    const current = sourceVertices[index];
    const previous =
      sourceVertices[
        (index + sourceVertices.length - 1) %
          sourceVertices.length
      ];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside && !previousInside) {
      clipped.push(intersection(previous, current));
    }
    if (currentInside) {
      clipped.push(current);
    } else if (previousInside) {
      clipped.push(intersection(previous, current));
    }
  }
  return deduplicatePolygonVertices(clipped);
};

const triangleNormalAndArea = (vertices) => {
  const edgeA = [
    vertices[1][0] - vertices[0][0],
    vertices[1][1] - vertices[0][1],
    vertices[1][2] - vertices[0][2]
  ];
  const edgeB = [
    vertices[2][0] - vertices[0][0],
    vertices[2][1] - vertices[0][1],
    vertices[2][2] - vertices[0][2]
  ];
  const normal = [
    edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
    edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
    edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]
  ];
  return {
    normal,
    area: Math.hypot(...normal) / 2
  };
};

const snapVertexToBandBoundaries = (vertex, bands) => {
  const boundaries = [
    bands[0].minimumY,
    ...bands.map(({ maximumY }) => maximumY)
  ];
  const matchingBoundary = boundaries.find(
    (boundary) =>
      Math.abs(vertex[1] - boundary) <= BOUNDS_TOLERANCE
  );
  return matchingBoundary === undefined
    ? [...vertex]
    : [vertex[0], matchingBoundary, vertex[2]];
};

const buildClippedBandGeometry = (builder, label) => {
  if (builder.indices.length === 0 || builder.positions.length === 0) {
    fail(`${label}にpositive-area fragmentがありません。`);
  }
  const boundsMin = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  ];
  const boundsMax = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  ];
  for (let offset = 0; offset < builder.positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(
        boundsMin[axis],
        builder.positions[offset + axis]
      );
      boundsMax[axis] = Math.max(
        boundsMax[axis],
        builder.positions[offset + axis]
      );
    }
  }
  return {
    positions: builder.positions,
    indices: builder.indices,
    boundsMin,
    boundsMax
  };
};

const partitionGeometryByPhysicalBands = (
  geometry,
  bands,
  label
) => {
  const builders = new Map(
    bands.map((band) => [
      band.index,
      {
        band,
        positions: [],
        indices: [],
        sourceTriangleIndices: new Set(),
        fragmentPolygons: 0,
        fragmentTriangles: 0,
        fragmentArea: 0
      }
    ])
  );
  const fragmentKeys = new Set();
  let sourceTriangleCount = 0;
  let sourceArea = 0;
  let fragmentArea = 0;
  let splitSourceTriangles = 0;
  let coplanarBoundarySourceTriangles = 0;
  let maximumFragmentsPerSource = 0;
  let maximumAreaDelta = 0;
  let windingMismatchCount = 0;
  let degenerateSourceTriangleCount = 0;
  let degenerateFragmentTriangleCount = 0;

  for (
    let indexOffset = 0;
    indexOffset < geometry.indices.length;
    indexOffset += 3
  ) {
    const sourceTriangleIndex = indexOffset / 3;
    const sourceIndices = geometry.indices.slice(
      indexOffset,
      indexOffset + 3
    );
    const sourceVertices = sourceIndices.map((vertexIndex) =>
      snapVertexToBandBoundaries(
        [
          geometry.positions[vertexIndex * 3],
          geometry.positions[vertexIndex * 3 + 1],
          geometry.positions[vertexIndex * 3 + 2]
        ],
        bands
      )
    );
    const sourceMeasurement = triangleNormalAndArea(sourceVertices);
    if (
      sourceMeasurement.area <=
      BAND_CLIP_AREA_ABSOLUTE_TOLERANCE
    ) {
      degenerateSourceTriangleCount += 1;
      fail(`${label}.triangle[${sourceTriangleIndex}]がdegenerateです。`);
    }
    sourceTriangleCount += 1;
    sourceArea += sourceMeasurement.area;

    const minimumY = Math.min(
      ...sourceVertices.map((vertex) => vertex[1])
    );
    const maximumY = Math.max(
      ...sourceVertices.map((vertex) => vertex[1])
    );
    const polygonsByBand = [];
    if (maximumY - minimumY <= BOUNDS_TOLERANCE) {
      const height =
        sourceVertices.reduce((sum, vertex) => sum + vertex[1], 0) /
        sourceVertices.length;
      const band = bandForHeight(
        height,
        bands,
        `${label}.triangle[${sourceTriangleIndex}]`
      );
      const internalBoundaries = bands
        .slice(1)
        .map(({ minimumY: boundary }) => boundary);
      if (
        internalBoundaries.some(
          (boundary) =>
            Math.abs(height - boundary) <= BOUNDS_TOLERANCE
        )
      ) {
        coplanarBoundarySourceTriangles += 1;
      }
      polygonsByBand.push({
        band,
        vertices: sourceVertices
      });
    } else {
      bands.forEach((band) => {
        if (
          maximumY < band.minimumY ||
          minimumY > band.maximumY
        ) {
          return;
        }
        const aboveMinimum = clipPolygonByHorizontalPlane(
          sourceVertices,
          band.minimumY,
          true
        );
        const withinBand = clipPolygonByHorizontalPlane(
          aboveMinimum,
          band.maximumY,
          false
        );
        if (withinBand.length >= 3) {
          polygonsByBand.push({ band, vertices: withinBand });
        }
      });
    }

    let sourceFragmentArea = 0;
    let sourceFragmentTriangleCount = 0;
    const sourceBands = new Set();
    polygonsByBand.forEach(({ band, vertices }, polygonIndex) => {
      const builder = builders.get(band.index);
      let polygonHasPositiveArea = false;
      for (
        let fanIndex = 1;
        fanIndex < vertices.length - 1;
        fanIndex += 1
      ) {
        const fragmentVertices = [
          vertices[0],
          vertices[fanIndex],
          vertices[fanIndex + 1]
        ];
        const fragmentMeasurement =
          triangleNormalAndArea(fragmentVertices);
        if (
          fragmentMeasurement.area <=
          BAND_CLIP_AREA_ABSOLUTE_TOLERANCE
        ) {
          degenerateFragmentTriangleCount += 1;
          continue;
        }
        const windingDot =
          sourceMeasurement.normal[0] *
            fragmentMeasurement.normal[0] +
          sourceMeasurement.normal[1] *
            fragmentMeasurement.normal[1] +
          sourceMeasurement.normal[2] *
            fragmentMeasurement.normal[2];
        if (windingDot <= 0) {
          windingMismatchCount += 1;
          fail(
            `${label}.triangle[${sourceTriangleIndex}]の` +
              `${band.id}/fan[${fanIndex - 1}]でwindingが反転しました。`
          );
        }
        const fragmentKey =
          `${sourceTriangleIndex}/${band.index}/` +
          `${polygonIndex}/${fanIndex - 1}`;
        if (fragmentKeys.has(fragmentKey)) {
          fail(`${label}のfragment assignmentが重複しました: ${fragmentKey}`);
        }
        fragmentKeys.add(fragmentKey);
        const vertexBase = builder.positions.length / 3;
        fragmentVertices.forEach((vertex) =>
          builder.positions.push(...vertex)
        );
        builder.indices.push(
          vertexBase,
          vertexBase + 1,
          vertexBase + 2
        );
        builder.fragmentTriangles += 1;
        builder.fragmentArea += fragmentMeasurement.area;
        builder.sourceTriangleIndices.add(sourceTriangleIndex);
        sourceFragmentArea += fragmentMeasurement.area;
        sourceFragmentTriangleCount += 1;
        polygonHasPositiveArea = true;
        sourceBands.add(band.index);
      }
      if (polygonHasPositiveArea) {
        builder.fragmentPolygons += 1;
      }
    });

    const areaDelta = sourceFragmentArea - sourceMeasurement.area;
    const areaTolerance = Math.max(
      BAND_CLIP_AREA_ABSOLUTE_TOLERANCE,
      sourceMeasurement.area * BAND_CLIP_AREA_RELATIVE_TOLERANCE
    );
    maximumAreaDelta = Math.max(maximumAreaDelta, Math.abs(areaDelta));
    if (Math.abs(areaDelta) > areaTolerance) {
      fail(
        `${label}.triangle[${sourceTriangleIndex}]のclip面積が一致しません: ` +
          `source=${sourceMeasurement.area}, ` +
          `fragments=${sourceFragmentArea}, ` +
          `delta=${areaDelta}, tolerance=${areaTolerance}`
      );
    }
    if (sourceBands.size > 1) {
      splitSourceTriangles += 1;
    }
    maximumFragmentsPerSource = Math.max(
      maximumFragmentsPerSource,
      sourceFragmentTriangleCount
    );
    fragmentArea += sourceFragmentArea;
  }

  const totalAreaDelta = fragmentArea - sourceArea;
  const totalAreaTolerance = Math.max(
    BAND_CLIP_AREA_ABSOLUTE_TOLERANCE,
    sourceArea * BAND_CLIP_AREA_RELATIVE_TOLERANCE
  );
  if (Math.abs(totalAreaDelta) > totalAreaTolerance) {
    fail(
      `${label}のclip総面積が一致しません: ` +
        `source=${sourceArea}, fragments=${fragmentArea}, ` +
        `delta=${totalAreaDelta}, tolerance=${totalAreaTolerance}`
    );
  }
  if (
    sourceTriangleCount !== geometry.indices.length / 3 ||
    fragmentKeys.size === 0
  ) {
    fail(
      `${label}のclip処理件数が一致しません: ` +
        `source=${sourceTriangleCount}, ` +
        `expected=${geometry.indices.length / 3}, ` +
        `fragments=${fragmentKeys.size}`
    );
  }

  const assignments = bands.map((band) => {
    const builder = builders.get(band.index);
    return {
      band,
      geometry: buildClippedBandGeometry(
        builder,
        `${label}/${band.id}`
      ),
      sourceTriangleContributions:
        builder.sourceTriangleIndices.size,
      fragmentPolygons: builder.fragmentPolygons,
      fragmentTriangles: builder.fragmentTriangles,
      fragmentArea: builder.fragmentArea
    };
  });
  return {
    assignments,
    method: "horizontal-plane-clip-stable-winding-fan",
    sourceTriangleCount,
    processedSourceTriangleCount: sourceTriangleCount,
    splitSourceTriangles,
    coplanarBoundarySourceTriangles,
    fragmentTriangleCount: fragmentKeys.size,
    maximumFragmentsPerSource,
    sourceArea,
    fragmentArea,
    totalAreaDelta,
    maximumAreaDelta,
    positiveAreaOverlap: 0,
    missingArea: 0,
    duplicateFragmentAssignments: 0,
    windingMismatchCount,
    degenerateSourceTriangleCount,
    degenerateFragmentTriangleCount,
    areaAbsoluteTolerance: BAND_CLIP_AREA_ABSOLUTE_TOLERANCE,
    areaRelativeTolerance: BAND_CLIP_AREA_RELATIVE_TOLERANCE
  };
};

const mergeNavigationGeometry = (staticGeometry, variantGeometry) => {
  const vertexOffset = staticGeometry.positions.length / 3;
  return {
    positions: [
      ...staticGeometry.positions,
      ...variantGeometry.positions
    ],
    indices: [
      ...staticGeometry.indices,
      ...variantGeometry.indices.map((index) => index + vertexOffset)
    ],
    boundsMin: staticGeometry.boundsMin.map((value, axis) =>
      Math.min(value, variantGeometry.boundsMin[axis])
    ),
    boundsMax: staticGeometry.boundsMax.map((value, axis) =>
      Math.max(value, variantGeometry.boundsMax[axis])
    )
  };
};

const auditClosedManifoldGeometry = (geometry, label) => {
  if (
    geometry.positions.length === 0 ||
    geometry.positions.length % 3 !== 0 ||
    geometry.indices.length === 0 ||
    geometry.indices.length % 3 !== 0
  ) {
    fail(`${label}のmanifold監査入力geometryが不正です。`);
  }
  const weldedVertices = [];
  const weldedIndexByKey = new Map();
  const weldedIndexBySourceVertex = [];
  for (
    let sourceVertexIndex = 0;
    sourceVertexIndex < geometry.positions.length / 3;
    sourceVertexIndex += 1
  ) {
    const vertex = [0, 1, 2].map(
      (axis) => geometry.positions[sourceVertexIndex * 3 + axis]
    );
    const key = vertex
      .map((value) => Math.round(value / BOUNDS_TOLERANCE))
      .join("/");
    let weldedIndex = weldedIndexByKey.get(key);
    if (weldedIndex === undefined) {
      weldedIndex = weldedVertices.length;
      weldedIndexByKey.set(key, weldedIndex);
      weldedVertices.push(vertex);
    } else if (
      squaredPointDistance(weldedVertices[weldedIndex], vertex) >
      BOUNDS_TOLERANCE ** 2 * 3
    ) {
      fail(`${label}のvertex weld keyが許容距離を超えて衝突しました: ${key}`);
    }
    weldedIndexBySourceVertex.push(weldedIndex);
  }

  const componentParents = weldedVertices.map((_, index) => index);
  const findComponent = (index) => {
    let root = index;
    while (componentParents[root] !== root) {
      root = componentParents[root];
    }
    let current = index;
    while (componentParents[current] !== current) {
      const next = componentParents[current];
      componentParents[current] = root;
      current = next;
    }
    return root;
  };
  const unionComponents = (left, right) => {
    const leftRoot = findComponent(left);
    const rightRoot = findComponent(right);
    if (leftRoot !== rightRoot) {
      componentParents[Math.max(leftRoot, rightRoot)] =
        Math.min(leftRoot, rightRoot);
    }
  };

  const edges = new Map();
  let signedVolume = 0;
  for (
    let indexOffset = 0;
    indexOffset < geometry.indices.length;
    indexOffset += 3
  ) {
    const sourceIndices = geometry.indices.slice(
      indexOffset,
      indexOffset + 3
    );
    const weldedIndices = sourceIndices.map(
      (sourceIndex) => weldedIndexBySourceVertex[sourceIndex]
    );
    if (new Set(weldedIndices).size !== 3) {
      fail(`${label}.triangle[${indexOffset / 3}]がweld後にdegenerateです。`);
    }
    const vertices = sourceIndices.map((sourceIndex) =>
      [0, 1, 2].map(
        (axis) => geometry.positions[sourceIndex * 3 + axis]
      )
    );
    signedVolume +=
      (vertices[0][0] *
          (vertices[1][1] * vertices[2][2] -
            vertices[1][2] * vertices[2][1]) -
        vertices[0][1] *
          (vertices[1][0] * vertices[2][2] -
            vertices[1][2] * vertices[2][0]) +
        vertices[0][2] *
          (vertices[1][0] * vertices[2][1] -
            vertices[1][1] * vertices[2][0])) /
      6;
    [
      [weldedIndices[0], weldedIndices[1]],
      [weldedIndices[1], weldedIndices[2]],
      [weldedIndices[2], weldedIndices[0]]
    ].forEach(([from, to]) => {
      unionComponents(from, to);
      const minimum = Math.min(from, to);
      const maximum = Math.max(from, to);
      const key = `${minimum}/${maximum}`;
      const record = edges.get(key) ?? {
        key,
        count: 0,
        orientationBalance: 0
      };
      record.count += 1;
      record.orientationBalance += from === minimum ? 1 : -1;
      edges.set(key, record);
    });
  }

  const boundaryEdges = [];
  const nonManifoldEdges = [];
  const inconsistentOrientationEdges = [];
  edges.forEach((edge) => {
    if (edge.count === 1) {
      boundaryEdges.push(edge.key);
    } else if (edge.count !== 2) {
      nonManifoldEdges.push({ key: edge.key, count: edge.count });
    }
    if (edge.count === 2 && edge.orientationBalance !== 0) {
      inconsistentOrientationEdges.push(edge.key);
    }
  });
  const connectedComponents = new Set(
    weldedVertices.map((_, index) => findComponent(index))
  ).size;
  if (
    boundaryEdges.length !== 0 ||
    nonManifoldEdges.length !== 0 ||
    inconsistentOrientationEdges.length !== 0 ||
    connectedComponents !== 1 ||
    Math.abs(signedVolume) <= BAND_CLIP_AREA_ABSOLUTE_TOLERANCE
  ) {
    fail(
      `${label}がwatertight oriented 2-manifoldではありません: ` +
        JSON.stringify({
          boundaryEdgeCount: boundaryEdges.length,
          nonManifoldEdgeCount: nonManifoldEdges.length,
          inconsistentOrientationEdgeCount:
            inconsistentOrientationEdges.length,
          connectedComponents,
          absoluteSignedVolume: Math.abs(signedVolume),
          firstBoundaryEdges: boundaryEdges.slice(0, 12),
          firstNonManifoldEdges: nonManifoldEdges.slice(0, 12),
          firstInconsistentOrientationEdges:
            inconsistentOrientationEdges.slice(0, 12)
        })
    );
  }
  return {
    sourceVertices: geometry.positions.length / 3,
    weldedVertices: weldedVertices.length,
    triangles: geometry.indices.length / 3,
    undirectedEdges: edges.size,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    inconsistentOrientationEdges: 0,
    connectedComponents,
    absoluteSignedVolume: Math.abs(signedVolume)
  };
};

const extractPreparedGeometry = (
  gltf,
  binary,
  worldMatrices,
  contract
) => {
  const staticGeometry = extractNavigationGeometry(
    gltf,
    binary,
    worldMatrices,
    contract.staticNavigationNodes
  );
  assertGeometryInsideFixedBounds(staticGeometry, "静的NAV_*");

  const variantGeometryByPair = new Map();
  const disorderedWalkableGeometryByRoom = new Map();
  contract.variantMarkers.forEach((marker) => {
    const geometry = extractNavigationGeometry(
      gltf,
      binary,
      worldMatrices,
      marker.navigationNodes
    );
    assertGeometryInsideFixedBounds(
      geometry,
      `${marker.roomId}/${marker.variantId}のNAV_*`
    );
    variantGeometryByPair.set(
      roomVariantKey(marker.roomId, marker.variantId),
      geometry
    );
    if (marker.variantId === "disordered") {
      const walkableNodes = marker.navigationNodes.filter(
        ({ node }) => node.extras.hs_nav_role === "walkable"
      );
      if (walkableNodes.length !== 1) {
        fail(
          `${marker.roomId}/disorderedの専用walkable NAV_*は1件必要です` +
            `（実際=${walkableNodes.length}件）。`
        );
      }
      const walkableGeometry = extractNavigationGeometry(
        gltf,
        binary,
        worldMatrices,
        walkableNodes
      );
      assertGeometryInsideFixedBounds(
        walkableGeometry,
        `${marker.roomId}/disorderedのwalkable NAV_*`
      );
      disorderedWalkableGeometryByRoom.set(
        marker.roomId,
        walkableGeometry
      );
    }
  });

  const volumes = contract.volumes.map((volume) => {
    const geometry = extractNavigationGeometry(
      gltf,
      binary,
      worldMatrices,
      [{ node: volume.node, nodeIndex: volume.nodeIndex }]
    );
    return {
      ...volume,
      geometry,
      manifoldAudit: auditClosedManifoldGeometry(
        geometry,
        `${volume.node.name}/room_variant_tile`
      )
    };
  });
  return {
    staticGeometry,
    variantGeometryByPair,
    disorderedWalkableGeometryByRoom,
    volumes
  };
};

const averagePoints = (points) =>
  [0, 1, 2].map(
    (axis) =>
      points.reduce((sum, point) => sum + point[axis], 0) /
      points.length
  );

const interpolatePoints = (start, end, factor) =>
  start.map(
    (component, axis) =>
      component + (end[axis] - component) * factor
  );

const collectDisorderedRampProbes = (prepared, doorsByRoom) => {
  const maximumSlopeCosine =
    Math.cos((RAMP_MAXIMUM_SLOPE_DEGREES * Math.PI) / 180);
  const probesByRoom = new Map();
  ROOM_IDS.forEach((roomId) => {
    const geometry =
      prepared.disorderedWalkableGeometryByRoom.get(roomId);
    const doors = doorsByRoom.get(roomId);
    const volume = prepared.volumes.find(
      (candidate) => candidate.roomId === roomId
    );
    if (
      geometry === undefined ||
      doors === undefined ||
      doors.length === 0 ||
      volume === undefined
    ) {
      fail(`荒れ家具ramp監査対象を解決できません: ${roomId}`);
    }
    const floorY = doors[0].position[1];
    const candidates = [];
    for (
      let indexOffset = 0;
      indexOffset < geometry.indices.length;
      indexOffset += 3
    ) {
      const vertices = geometry.indices
        .slice(indexOffset, indexOffset + 3)
        .map((vertexIndex) => [
          geometry.positions[vertexIndex * 3],
          geometry.positions[vertexIndex * 3 + 1],
          geometry.positions[vertexIndex * 3 + 2]
        ]);
      const edgeA = vertices[1].map(
        (value, axis) => value - vertices[0][axis]
      );
      const edgeB = vertices[2].map(
        (value, axis) => value - vertices[0][axis]
      );
      const normal = [
        edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
        edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
        edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]
      ];
      const doubledArea = Math.hypot(...normal);
      if (doubledArea <= RAY_INTERSECTION_TOLERANCE) {
        continue;
      }
      const upwardNormal = normal[1] / doubledArea;
      const heights = vertices.map((vertex) => vertex[1]);
      const minimumY = Math.min(...heights);
      const maximumY = Math.max(...heights);
      const rise = maximumY - minimumY;
      const initialStep = minimumY - floorY;
      if (
        upwardNormal + GRID_ALIGNMENT_TOLERANCE <
          maximumSlopeCosine ||
        rise + GRID_ALIGNMENT_TOLERANCE <
          RAMP_MINIMUM_TRIANGLE_RISE ||
        initialStep < -BOUNDS_TOLERANCE ||
        initialStep >
          RAMP_INITIAL_STEP_MAXIMUM + GRID_ALIGNMENT_TOLERANCE
      ) {
        continue;
      }
      const slopeDegrees =
        (Math.acos(Math.max(-1, Math.min(1, upwardNormal))) * 180) /
        Math.PI;
      candidates.push({
        triangleIndex: indexOffset / 3,
        vertices,
        minimumY,
        maximumY,
        rise,
        initialStep,
        slopeDegrees,
        area: doubledArea / 2
      });
    }
    candidates.sort(
      (left, right) =>
        right.rise - left.rise ||
        right.area - left.area ||
        left.triangleIndex - right.triangleIndex
    );
    const candidate = candidates[0];
    if (candidate === undefined) {
      fail(
        `${roomId}/disorderedに初段差${RAMP_INITIAL_STEP_MAXIMUM}m以下、` +
          `傾斜${RAMP_MAXIMUM_SLOPE_DEGREES}度以下の荒れ家具歩行面がありません。`
      );
    }
    const surfaceCandidates = candidates.filter(
      (other) =>
        Math.abs(other.minimumY - candidate.minimumY) <=
          BOUNDS_TOLERANCE &&
        Math.abs(other.maximumY - candidate.maximumY) <=
          BOUNDS_TOLERANCE &&
        Math.abs(other.slopeDegrees - candidate.slopeDegrees) <=
          GRID_ALIGNMENT_TOLERANCE
    );
    const surfaceVertexByKey = new Map();
    surfaceCandidates.forEach(({ vertices }) => {
      vertices.forEach((vertex) => {
        surfaceVertexByKey.set(
          vertex.map((value) => value.toPrecision(17)).join("/"),
          vertex
        );
      });
    });
    const surfaceVertices = [...surfaceVertexByKey.values()];
    const lowVertices = surfaceVertices.filter(
      (vertex) =>
        Math.abs(vertex[1] - candidate.minimumY) <= BOUNDS_TOLERANCE
    );
    const highVertices = surfaceVertices.filter(
      (vertex) =>
        Math.abs(vertex[1] - candidate.maximumY) <= BOUNDS_TOLERANCE
    );
    const lowEdgeCenter = averagePoints(lowVertices);
    const highEdgeCenter = averagePoints(highVertices);
    const edgeToEdgeHorizontalRun = Math.hypot(
      highEdgeCenter[0] - lowEdgeCenter[0],
      highEdgeCenter[2] - lowEdgeCenter[2]
    );
    const probeInsetDistance =
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.walkableRadius *
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.cs;
    if (
      edgeToEdgeHorizontalRun <
      probeInsetDistance * 2 - BOUNDS_TOLERANCE
    ) {
      fail(
        `${roomId}/disorderedの荒れ家具ramp水平長が両辺からのprobe insetに` +
          `不足しています: ${edgeToEdgeHorizontalRun} < ` +
          `${probeInsetDistance * 2}`
      );
    }
    const probeInsetFactor =
      probeInsetDistance / edgeToEdgeHorizontalRun;
    const lowToHighHorizontalDirection = [
      (highEdgeCenter[0] - lowEdgeCenter[0]) /
        edgeToEdgeHorizontalRun,
      (highEdgeCenter[2] - lowEdgeCenter[2]) /
        edgeToEdgeHorizontalRun
    ];
    const floorProbe = [
      lowEdgeCenter[0] -
        lowToHighHorizontalDirection[0] * probeInsetDistance,
      floorY,
      lowEdgeCenter[2] -
        lowToHighHorizontalDirection[1] * probeInsetDistance
    ];
    const lowProbe = interpolatePoints(
      lowEdgeCenter,
      highEdgeCenter,
      probeInsetFactor
    );
    const highProbe = interpolatePoints(
      highEdgeCenter,
      lowEdgeCenter,
      probeInsetFactor
    );
    if (
      !pointInsideClosedMesh(floorProbe, volume.geometry) ||
      !pointInsideClosedMesh(lowProbe, volume.geometry) ||
      !pointInsideClosedMesh(highProbe, volume.geometry)
    ) {
      fail(`${roomId}/disorderedの荒れ家具ramp probeが所有Volume外です。`);
    }
    probesByRoom.set(roomId, {
      roomId,
      sourceNames: geometry.sourceStatistics.map(({ name }) => name),
      triangleIndices: surfaceCandidates.map(
        ({ triangleIndex }) => triangleIndex
      ),
      slopeDegrees: candidate.slopeDegrees,
      initialStep: candidate.initialStep,
      sourceRise: candidate.rise,
      edgeToEdgeHorizontalRun,
      probeInsetDistance,
      floorProbe,
      lowProbe,
      highProbe,
      expectedProbeHeightGain: highProbe[1] - lowProbe[1]
    });
  });
  return probesByRoom;
};

const collectVariantSourceBoundsAudit = (prepared) =>
  [...ROOM_IDS]
    .sort(codeUnitCompare)
    .flatMap((roomId) =>
      VARIANT_IDS.map((variantId) => {
        const geometry = prepared.variantGeometryByPair.get(
          roomVariantKey(roomId, variantId)
        );
        const volume = prepared.volumes.find(
          (candidate) => candidate.roomId === roomId
        );
        if (geometry === undefined || volume === undefined) {
          fail(
            `variant source bounds監査対象を解決できません: ` +
              `${roomId}/${variantId}`
          );
        }
        const outsideAxes = [0, 1, 2].filter(
          (axis) =>
            geometry.boundsMin[axis] <
              volume.geometry.boundsMin[axis] - BOUNDS_TOLERANCE ||
            geometry.boundsMax[axis] >
              volume.geometry.boundsMax[axis] + BOUNDS_TOLERANCE
        );
        return {
          roomId,
          variantId,
          sourceBounds: {
            minimum: geometry.boundsMin,
            maximum: geometry.boundsMax
          },
          volumeBounds: {
            minimum: volume.geometry.boundsMin,
            maximum: volume.geometry.boundsMax
          },
          containedByVolumeBounds: outsideAxes.length === 0,
          outsideAxes
        };
      })
    );

const inspectGridAlignedCoordinate = (value, origin, tileSize, label) => {
  const gridCoordinate = (value - origin) / tileSize;
  const nearest = Math.round(gridCoordinate);
  const difference = Math.abs(gridCoordinate - nearest);
  return {
    label,
    value,
    gridCoordinate,
    nearest,
    difference,
    aligned: difference <= GRID_ALIGNMENT_TOLERANCE
  };
};

const validateVolumeGridAlignment = (volume) => {
  const { origin, tileWidth, tileHeight } =
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams;
  const { geometry } = volume;
  const minimumX = inspectGridAlignedCoordinate(
    geometry.boundsMin[0],
    origin[0],
    tileWidth,
    `${volume.node.name}.boundsMin.x`
  );
  const maximumX = inspectGridAlignedCoordinate(
    geometry.boundsMax[0],
    origin[0],
    tileWidth,
    `${volume.node.name}.boundsMax.x`
  );
  const minimumY = inspectGridAlignedCoordinate(
    geometry.boundsMin[2],
    origin[2],
    tileHeight,
    `${volume.node.name}.boundsMin.z`
  );
  const maximumY = inspectGridAlignedCoordinate(
    geometry.boundsMax[2],
    origin[2],
    tileHeight,
    `${volume.node.name}.boundsMax.z`
  );
  const minimumTileX = minimumX.nearest;
  const maximumTileX = maximumX.nearest;
  const minimumTileY = minimumY.nearest;
  const maximumTileY = maximumY.nearest;
  const alignmentProblems = [
    minimumX,
    maximumX,
    minimumY,
    maximumY
  ].filter((entry) => !entry.aligned);
  if (
    minimumTileX < 0 ||
    maximumTileX > SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountX ||
    minimumTileY < 0 ||
    maximumTileY > SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountY ||
    minimumTileX >= maximumTileX ||
    minimumTileY >= maximumTileY
  ) {
    alignmentProblems.push({
      label: volume.node.name,
      value: null,
      gridCoordinate: null,
      nearest: null,
      difference: null,
      aligned: false,
      reason: "固定grid範囲が不正です。"
    });
  }
  if (
    !Number.isFinite(geometry.boundsMin[1]) ||
    !Number.isFinite(geometry.boundsMax[1]) ||
    geometry.boundsMin[1] >= geometry.boundsMax[1]
  ) {
    alignmentProblems.push({
      label: volume.node.name,
      value: null,
      gridCoordinate: null,
      nearest: null,
      difference: null,
      aligned: false,
      reason: "高さ範囲が不正です。"
    });
  }
  return {
    roomId: volume.roomId,
    minimumTileX,
    maximumTileX,
    minimumTileY,
    maximumTileY,
    aligned: alignmentProblems.length === 0,
    problems: alignmentProblems
  };
};

const rayTriangleIntersectionDistance = (
  point,
  direction,
  vertexA,
  vertexB,
  vertexC
) => {
  const edgeA = [
    vertexB[0] - vertexA[0],
    vertexB[1] - vertexA[1],
    vertexB[2] - vertexA[2]
  ];
  const edgeB = [
    vertexC[0] - vertexA[0],
    vertexC[1] - vertexA[1],
    vertexC[2] - vertexA[2]
  ];
  const perpendicular = [
    direction[1] * edgeB[2] - direction[2] * edgeB[1],
    direction[2] * edgeB[0] - direction[0] * edgeB[2],
    direction[0] * edgeB[1] - direction[1] * edgeB[0]
  ];
  const determinant =
    edgeA[0] * perpendicular[0] +
    edgeA[1] * perpendicular[1] +
    edgeA[2] * perpendicular[2];
  if (Math.abs(determinant) <= RAY_INTERSECTION_TOLERANCE) {
    return null;
  }
  const inverseDeterminant = 1 / determinant;
  const fromA = [
    point[0] - vertexA[0],
    point[1] - vertexA[1],
    point[2] - vertexA[2]
  ];
  const u =
    (fromA[0] * perpendicular[0] +
      fromA[1] * perpendicular[1] +
      fromA[2] * perpendicular[2]) *
    inverseDeterminant;
  if (
    u < -RAY_INTERSECTION_TOLERANCE ||
    u > 1 + RAY_INTERSECTION_TOLERANCE
  ) {
    return null;
  }
  const cross = [
    fromA[1] * edgeA[2] - fromA[2] * edgeA[1],
    fromA[2] * edgeA[0] - fromA[0] * edgeA[2],
    fromA[0] * edgeA[1] - fromA[1] * edgeA[0]
  ];
  const v =
    (direction[0] * cross[0] +
      direction[1] * cross[1] +
      direction[2] * cross[2]) *
    inverseDeterminant;
  if (
    v < -RAY_INTERSECTION_TOLERANCE ||
    u + v > 1 + RAY_INTERSECTION_TOLERANCE
  ) {
    return null;
  }
  const distance =
    (edgeB[0] * cross[0] +
      edgeB[1] * cross[1] +
      edgeB[2] * cross[2]) *
    inverseDeterminant;
  return distance > RAY_INTERSECTION_TOLERANCE ? distance : null;
};

const pointInsideClosedMesh = (point, geometry) => {
  if (
    point.some(
      (value, axis) =>
        value < geometry.boundsMin[axis] - BOUNDS_TOLERANCE ||
        value > geometry.boundsMax[axis] + BOUNDS_TOLERANCE
    )
  ) {
    return false;
  }
  const direction = [0.8728715609439696, 0.4364357804719848, 0.2182178902359924];
  const distances = [];
  for (
    let indexOffset = 0;
    indexOffset < geometry.indices.length;
    indexOffset += 3
  ) {
    const vertices = geometry.indices
      .slice(indexOffset, indexOffset + 3)
      .map((vertexIndex) => [
        geometry.positions[vertexIndex * 3],
        geometry.positions[vertexIndex * 3 + 1],
        geometry.positions[vertexIndex * 3 + 2]
      ]);
    const distance = rayTriangleIntersectionDistance(
      point,
      direction,
      vertices[0],
      vertices[1],
      vertices[2]
    );
    if (distance !== null) {
      distances.push(distance);
    }
  }
  distances.sort((left, right) => left - right);
  const uniqueDistances = [];
  distances.forEach((distance) => {
    const previous = uniqueDistances.at(-1);
    if (
      previous === undefined ||
      Math.abs(distance - previous) >
        RAY_INTERSECTION_TOLERANCE *
          Math.max(1, Math.abs(distance), Math.abs(previous))
    ) {
      uniqueDistances.push(distance);
    }
  });
  return uniqueDistances.length % 2 === 1;
};

const tileOwnershipProbe = (tile) => {
  const { origin, tileWidth, tileHeight } =
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams;
  return [
    origin[0] + (tile.x + 0.5) * tileWidth,
    (tile.boundsMin[1] + tile.boundsMax[1]) / 2,
    origin[2] + (tile.y + 0.5) * tileHeight
  ];
};

const physicalBandContainsTile = (band, tile) =>
  tile.boundsMin[1] >= band.minimumY - BOUNDS_TOLERANCE &&
  (band.final
    ? tile.boundsMin[1] <= band.maximumY + BOUNDS_TOLERANCE
    : tile.boundsMin[1] < band.maximumY);

const physicalBandForVolume = (volume, bands) =>
  bandForHeight(
    (volume.geometry.boundsMin[1] + volume.geometry.boundsMax[1]) / 2,
    bands,
    volume.node.name
  );

const volumeContainsTile = (volume, tile) =>
  pointInsideClosedMesh(tileOwnershipProbe(tile), volume.geometry);

const vectorToArray = (value) => [value.x, value.y, value.z];

const canonicalizeConnectedTile = (tile, header, stableLayer) => {
  const vertices = [];
  for (
    let vertexIndex = 0;
    vertexIndex < header.vertCount() * 3;
    vertexIndex += 1
  ) {
    vertices.push(tile.verts(vertexIndex));
  }
  const polygons = [];
  for (
    let polygonIndex = 0;
    polygonIndex < header.polyCount();
    polygonIndex += 1
  ) {
    const polygon = tile.polys(polygonIndex);
    const polygonVertexCount = polygon.vertCount();
    const vertexIndices = [];
    const neighborIndices = [];
    for (
      let polygonVertexIndex = 0;
      polygonVertexIndex < polygonVertexCount;
      polygonVertexIndex += 1
    ) {
      vertexIndices.push(polygon.verts(polygonVertexIndex));
      neighborIndices.push(polygon.neis(polygonVertexIndex));
    }
    polygons.push({
      vertexIndices,
      neighborIndices,
      flags: polygon.flags(),
      areaAndType: polygon.areaAndType()
    });
  }
  const detailMeshes = [];
  for (
    let detailIndex = 0;
    detailIndex < header.detailMeshCount();
    detailIndex += 1
  ) {
    const detail = tile.detailMeshes(detailIndex);
    detailMeshes.push({
      vertBase: detail.vertBase(),
      triBase: detail.triBase(),
      vertCount: detail.vertCount(),
      triCount: detail.triCount()
    });
  }
  const detailVertices = [];
  for (
    let detailVertexIndex = 0;
    detailVertexIndex < header.detailVertCount() * 3;
    detailVertexIndex += 1
  ) {
    detailVertices.push(tile.detailVerts(detailVertexIndex));
  }
  const detailTriangles = [];
  for (
    let detailTriangleIndex = 0;
    detailTriangleIndex < header.detailTriCount() * 4;
    detailTriangleIndex += 1
  ) {
    detailTriangles.push(tile.detailTris(detailTriangleIndex));
  }
  const boundingVolumeNodes = [];
  for (
    let nodeIndex = 0;
    nodeIndex < header.bvNodeCount();
    nodeIndex += 1
  ) {
    const node = tile.bvTree(nodeIndex);
    boundingVolumeNodes.push({
      minimum: vectorToArray(node.bmin()),
      maximum: vectorToArray(node.bmax()),
      index: node.i()
    });
  }
  const offMeshConnections = [];
  for (
    let connectionIndex = 0;
    connectionIndex < header.offMeshConCount();
    connectionIndex += 1
  ) {
    const connection = tile.offMeshCons(connectionIndex);
    const positions = [];
    for (let positionIndex = 0; positionIndex < 6; positionIndex += 1) {
      positions.push(connection.pos(positionIndex));
    }
    offMeshConnections.push({
      positions,
      radius: connection.rad(),
      polygon: connection.poly(),
      flags: connection.flags(),
      side: connection.side(),
      userId: connection.userId()
    });
  }
  return stableStringify({
    header: {
      magic: header.magic(),
      version: header.version(),
      x: header.x(),
      y: header.y(),
      layer: stableLayer,
      userId: header.userId(),
      polyCount: header.polyCount(),
      vertCount: header.vertCount(),
      maxLinkCount: header.maxLinkCount(),
      detailMeshCount: header.detailMeshCount(),
      detailVertCount: header.detailVertCount(),
      detailTriCount: header.detailTriCount(),
      bvNodeCount: header.bvNodeCount(),
      offMeshConCount: header.offMeshConCount(),
      offMeshBase: header.offMeshBase(),
      walkableHeight: header.walkableHeight(),
      walkableRadius: header.walkableRadius(),
      walkableClimb: header.walkableClimb(),
      boundsMin: [0, 1, 2].map((axis) => header.bmin(axis)),
      boundsMax: [0, 1, 2].map((axis) => header.bmax(axis)),
      bvQuantFactor: header.bvQuantFactor()
    },
    vertices,
    polygons,
    detailMeshes,
    detailVertices,
    detailTriangles,
    boundingVolumeNodes,
    offMeshConnections
  });
};

const stableLayerForHeight = (minimumY, label) => {
  const verticalCell =
    (minimumY - SCHOOL_ROOM_VARIANT_NAV_PROFILE.bounds[0][1]) /
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.ch;
  const stableLayer = Math.round(verticalCell);
  if (
    Math.abs(verticalCell - stableLayer) > GRID_ALIGNMENT_TOLERANCE ||
    stableLayer < 0 ||
    stableLayer > MAX_INT32
  ) {
    fail(
      `${label}の物理Y下限を安定layer IDへ量子化できません: ` +
        `${minimumY} -> ${verticalCell}`
    );
  }
  return stableLayer;
};

const patchRawTileLayer = (
  data,
  tile,
  header,
  stableLayer,
  label
) => {
  if (data.byteLength < 20) {
    fail(`${label}のraw Detour tileがheaderより短いです。`);
  }
  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength
  );
  const sourceFields = {
    magic: view.getInt32(0, true),
    version: view.getInt32(4, true),
    x: view.getInt32(8, true),
    y: view.getInt32(12, true),
    layer: view.getInt32(16, true)
  };
  if (
    sourceFields.magic !== header.magic() ||
    sourceFields.version !== header.version() ||
    sourceFields.x !== header.x() ||
    sourceFields.y !== header.y() ||
    sourceFields.layer !== header.layer()
  ) {
    fail(
      `${label}のraw dtMeshHeader layoutがRecast wrapperと一致しません: ` +
        JSON.stringify(sourceFields)
    );
  }
  view.setInt32(16, stableLayer, true);
  const polygonStart =
    DETOUR_MESH_HEADER_BYTE_LENGTH +
    header.vertCount() * DETOUR_VERTEX_BYTE_LENGTH;
  const polygonEnd =
    polygonStart + header.polyCount() * DETOUR_POLY_BYTE_LENGTH;
  if (polygonEnd > data.byteLength) {
    fail(`${label}のraw dtPoly領域がtile dataを超えています。`);
  }
  for (
    let polygonIndex = 0;
    polygonIndex < header.polyCount();
    polygonIndex += 1
  ) {
    const firstLinkOffset =
      polygonStart + polygonIndex * DETOUR_POLY_BYTE_LENGTH;
    const rawFirstLink = view.getUint32(firstLinkOffset, true);
    const wrapperFirstLink =
      tile.polys(polygonIndex).firstLink() >>> 0;
    if (rawFirstLink !== wrapperFirstLink) {
      fail(
        `${label}.poly[${polygonIndex}]のraw firstLink layoutが` +
          `Recast wrapperと一致しません: ` +
          `${rawFirstLink} != ${wrapperFirstLink}`
      );
    }
    view.setUint32(
      firstLinkOffset,
      Detour.DT_NULL_LINK,
      true
    );
  }
};

const extractNavMeshTiles = (navMesh, label) => {
  if (
    navMesh.getMaxTiles() !==
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.maxTiles
  ) {
    fail(
      `${label}のmaxTilesが固定profileと一致しません: ` +
        `${navMesh.getMaxTiles()}`
    );
  }
  const tiles = [];
  const keys = new Set();
  for (
    let tileIndex = 0;
    tileIndex < navMesh.getMaxTiles();
    tileIndex += 1
  ) {
    const tile = navMesh.getTile(tileIndex);
    const header = tile.header();
    if (header === null) {
      continue;
    }
    const x = assertInteger(
      header.x(),
      `${label}.tile[${tileIndex}].x`,
      0,
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountX - 1
    );
    const y = assertInteger(
      header.y(),
      `${label}.tile[${tileIndex}].y`,
      0,
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountY - 1
    );
    const sourceLayer = assertInteger(
      header.layer(),
      `${label}.tile[${tileIndex}].layer`,
      0,
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.expectedLayersPerTile - 1
    );
    const layer = stableLayerForHeight(
      header.bmin(1),
      `${label}.tile[${tileIndex}]`
    );
    const key = tileKey(x, y, layer);
    if (keys.has(key)) {
      fail(`${label}のDetour tile keyが重複しています: ${key}`);
    }
    keys.add(key);
    const polyCount = assertInteger(
      header.polyCount(),
      `${label}.tile[${tileIndex}].polyCount`,
      1,
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.maxPolys
    );
    const dataSize = assertInteger(
      tile.dataSize(),
      `${label}.tile[${tileIndex}].dataSize`,
      1,
      MAX_UINT32
    );
    const data = new Uint8Array(dataSize);
    for (let byteIndex = 0; byteIndex < dataSize; byteIndex += 1) {
      data[byteIndex] = tile.data(byteIndex);
    }
    patchRawTileLayer(
      data,
      tile,
      header,
      layer,
      `${label}.tile[${tileIndex}]`
    );
    const boundsMin = [0, 1, 2].map((axis) =>
      assertFiniteNumber(
        header.bmin(axis),
        `${label}.tile[${tileIndex}].boundsMin[${axis}]`
      )
    );
    const boundsMax = [0, 1, 2].map((axis) =>
      assertFiniteNumber(
        header.bmax(axis),
        `${label}.tile[${tileIndex}].boundsMax[${axis}]`
      )
    );
    tiles.push({
      x,
      y,
      layer,
      sourceLayer,
      polyCount,
      boundsMin,
      boundsMax,
      canonical: canonicalizeConnectedTile(tile, header, layer),
      data
    });
  }
  if (tiles.length === 0) {
    fail(`${label}にDetour tileがありません。`);
  }
  tiles.sort(compareTileCoordinates);
  return tiles;
};

const summarizeTileStatistics = (tiles) => {
  if (tiles.length === 0) {
    fail("tile統計の対象が空です。");
  }
  const layerCountsByCoordinate = new Map();
  tiles.forEach((tile) => {
    const coordinateKey = `${tile.x}/${tile.y}`;
    layerCountsByCoordinate.set(
      coordinateKey,
      (layerCountsByCoordinate.get(coordinateKey) ?? 0) + 1
    );
  });
  return {
    tileCount: tiles.length,
    occupiedCoordinateCount: layerCountsByCoordinate.size,
    maximumLayersAtCoordinate: Math.max(
      ...layerCountsByCoordinate.values()
    ),
    maximumSourceLayer: Math.max(
      ...tiles.map(({ sourceLayer }) => sourceLayer)
    ),
    maximumStableLayer: Math.max(
      ...tiles.map(({ layer }) => layer)
    ),
    maximumPolygonsPerTile: Math.max(
      ...tiles.map(({ polyCount }) => polyCount)
    ),
    maximumPayloadBytes: Math.max(
      ...tiles.map(({ data }) => data.byteLength)
    )
  };
};

const summarizeGenerationPeak = (common, variants) => {
  const all = [common, ...variants.map(({ statistics }) => statistics)];
  return {
    maximumTileCountPerGeneration: Math.max(
      ...all.map(({ tileCount }) => tileCount)
    ),
    maximumOccupiedCoordinateCount: Math.max(
      ...all.map(({ occupiedCoordinateCount }) => occupiedCoordinateCount)
    ),
    maximumLayersAtCoordinate: Math.max(
      ...all.map(({ maximumLayersAtCoordinate }) =>
        maximumLayersAtCoordinate
      )
    ),
    maximumSourceLayer: Math.max(
      ...all.map(({ maximumSourceLayer }) => maximumSourceLayer)
    ),
    maximumStableLayer: Math.max(
      ...all.map(({ maximumStableLayer }) => maximumStableLayer)
    ),
    maximumPolygonsPerTile: Math.max(
      ...all.map(({ maximumPolygonsPerTile }) =>
        maximumPolygonsPerTile
      )
    ),
    maximumPayloadBytes: Math.max(
      ...all.map(({ maximumPayloadBytes }) => maximumPayloadBytes)
    )
  };
};

const generateLayeredTiles = (geometry, label) => {
  assertGeometryInsideFixedBounds(geometry, label);
  const generation = generateTileCache(
    geometry.positions,
    geometry.indices,
    {
      ...SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters,
      bounds: SCHOOL_ROOM_VARIANT_NAV_PROFILE.bounds
    }
  );
  if (!generation.success) {
    fail(
      `${label}のlayer付きNavMesh生成に失敗しました: ` +
        `${String(generation.error)}`
    );
  }
  try {
    return extractNavMeshTiles(generation.navMesh, label);
  } finally {
    generation.tileCache.destroy();
    generation.navMesh.destroy();
  }
};

const generateBandPartitionedStaticTiles = (partition) => {
  const tiles = [];
  const tileByKey = new Map();
  const bandReports = [];
  partition.assignments.forEach(
    ({
      band,
      geometry,
      sourceTriangleContributions,
      fragmentPolygons,
      fragmentTriangles,
      fragmentArea
    }) => {
      const generatedTiles = generateLayeredTiles(
        geometry,
        `静的common/${band.id}`
      );
      generatedTiles.forEach((tile) => {
        const key = tileKey(tile.x, tile.y, tile.layer);
        const previous = tileByKey.get(key);
        if (previous !== undefined) {
          fail(
            `static commonのband再結合でDetour tile keyが重複しました: ` +
              `${key}, ${previous.bandId}, ${band.id}`
          );
        }
        tileByKey.set(key, { bandId: band.id, tile });
        tiles.push(tile);
      });
      bandReports.push({
        bandId: band.id,
        minimumY: band.minimumY,
        maximumY: band.maximumY,
        sourceTriangleContributions,
        fragmentPolygons,
        fragmentTriangles,
        fragmentArea,
        sourceVertices: geometry.positions.length / 3,
        generatedTiles: generatedTiles.length,
        tileStatistics: summarizeTileStatistics(generatedTiles)
      });
    }
  );
  if (
    partition.processedSourceTriangleCount !==
      partition.sourceTriangleCount ||
    partition.positiveAreaOverlap !== 0 ||
    partition.missingArea !== 0 ||
    partition.duplicateFragmentAssignments !== 0 ||
    partition.windingMismatchCount !== 0
  ) {
    fail("static commonのband triangle clip監査が一致しません。");
  }
  if (
    tiles.length === 0 ||
    tiles.length > SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.maxTiles
  ) {
    fail(
      `static commonのband再結合tile件数がDetour容量外です: ${tiles.length}`
    );
  }
  tiles.sort(compareTileCoordinates);
  const statistics = summarizeTileStatistics(tiles);
  if (
    statistics.maximumLayersAtCoordinate >
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.expectedLayersPerTile
  ) {
    fail(
      `static commonの同一座標layer数がprofile上限を超えました: ` +
        `${statistics.maximumLayersAtCoordinate} > ` +
        SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.expectedLayersPerTile
    );
  }
  return {
    tiles,
    bandReports,
    statistics,
    uniqueTileKeyCount: tileByKey.size
  };
};

const classifyCommonTileOwnership = (commonTiles, volumes) => {
  const ownedKeysByRoom = new Map(
    ROOM_IDS.map((roomId) => [roomId, new Set()])
  );
  const ownerByKey = new Map();
  commonTiles.forEach((tile) => {
    const owners = volumes.filter((volume) =>
      volumeContainsTile(volume, tile)
    );
    if (owners.length > 1) {
      fail(
        `Detour tileを複数室が所有しています: ` +
          `${tileKey(tile.x, tile.y, tile.layer)} / ` +
          owners.map(({ roomId }) => roomId).join(",")
      );
    }
    if (owners.length === 0) {
      return;
    }
    const key = tileKey(tile.x, tile.y, tile.layer);
    ownerByKey.set(key, owners[0].roomId);
    ownedKeysByRoom.get(owners[0].roomId).add(key);
  });
  ROOM_IDS.forEach((roomId) => {
    if (ownedKeysByRoom.get(roomId).size === 0) {
      fail(`room_variant_tileがDetour tileを所有していません: ${roomId}`);
    }
  });
  return { ownedKeysByRoom, ownerByKey };
};

const summarizeCanonicalDifference = (leftText, rightText) => {
  const left = JSON.parse(leftText);
  const right = JSON.parse(rightText);
  const differences = [];
  let totalDifferenceCount = 0;
  const visit = (leftValue, rightValue, path) => {
    if (Object.is(leftValue, rightValue)) {
      return;
    }
    const leftIsObject =
      leftValue !== null && typeof leftValue === "object";
    const rightIsObject =
      rightValue !== null && typeof rightValue === "object";
    if (
      leftIsObject &&
      rightIsObject &&
      Array.isArray(leftValue) === Array.isArray(rightValue)
    ) {
      const keys = new Set([
        ...Object.keys(leftValue),
        ...Object.keys(rightValue)
      ]);
      keys.forEach((key) =>
        visit(leftValue[key], rightValue[key], `${path}/${key}`)
      );
      return;
    }
    totalDifferenceCount += 1;
    if (differences.length < 12) {
      differences.push({
        path,
        common: leftValue ?? null,
        variant: rightValue ?? null
      });
    }
  };
  visit(left, right, "");
  return { totalDifferenceCount, firstDifferences: differences };
};

const assertSameKeySet = (left, right, label) => {
  if (left.size !== right.size) {
    fail(
      `${label}のtile key件数が一致しません: ${left.size} != ${right.size}`
    );
  }
  for (const key of left) {
    if (!right.has(key)) {
      fail(`${label}のtile keyが一致しません: ${key}`);
    }
  }
};

const collectOutsideOwnedRegionChanges = (
  commonTiles,
  variantTiles,
  ownedKeys
) => {
  const commonByKey = new Map(
    commonTiles.map((tile) => [tileKey(tile.x, tile.y, tile.layer), tile])
  );
  const variantByKey = new Map(
    variantTiles.map((tile) => [tileKey(tile.x, tile.y, tile.layer), tile])
  );
  const comparedKeys = new Set([
    ...commonByKey.keys(),
    ...variantByKey.keys()
  ]);
  const changes = [];
  for (const key of comparedKeys) {
    if (ownedKeys.has(key)) {
      continue;
    }
    const commonTile = commonByKey.get(key);
    const variantTile = variantByKey.get(key);
    if (commonTile === undefined || variantTile === undefined) {
      const source = commonTile ?? variantTile;
      changes.push({
        key,
        tileX: source.x,
        tileY: source.y,
        layer: source.layer,
        kind:
          commonTile === undefined
            ? "variant-only"
            : "common-only"
      });
      continue;
    }
    if (commonTile.canonical !== variantTile.canonical) {
      changes.push({
        key,
        tileX: commonTile.x,
        tileY: commonTile.y,
        layer: commonTile.layer,
        kind: "structure-changed",
        canonicalDifference: summarizeCanonicalDifference(
          commonTile.canonical,
          variantTile.canonical
        )
      });
    }
  }
  changes.sort(
    (left, right) =>
      left.tileY - right.tileY ||
      left.tileX - right.tileX ||
      left.layer - right.layer ||
      codeUnitCompare(left.kind, right.kind)
  );
  return changes;
};

const keySetDifference = (left, right) =>
  [...left].filter((key) => !right.has(key)).sort(codeUnitCompare);

const tileCoordinatesFromKey = (key) => {
  const components = key.split("/").map(Number);
  if (
    components.length !== 3 ||
    components.some((component) => !Number.isInteger(component))
  ) {
    fail(`Detour tile keyを解析できません: ${key}`);
  }
  return components;
};

const collectExternalBoundaryKeys = (ownedKeys) => {
  const boundaryKeys = new Set();
  ownedKeys.forEach((key) => {
    const [tileX, tileY, layer] = tileCoordinatesFromKey(key);
    [
      [tileX - 1, tileY],
      [tileX + 1, tileY],
      [tileX, tileY - 1],
      [tileX, tileY + 1]
    ].forEach(([neighborX, neighborY]) => {
      if (
        neighborX < 0 ||
        neighborX >= SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountX ||
        neighborY < 0 ||
        neighborY >= SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountY
      ) {
        return;
      }
      const neighborKey = tileKey(neighborX, neighborY, layer);
      if (!ownedKeys.has(neighborKey)) {
        boundaryKeys.add(neighborKey);
      }
    });
  });
  return boundaryKeys;
};

const tileRangeForKeys = (keys) => {
  if (keys.length === 0) {
    return null;
  }
  const coordinates = keys.map((key) => {
    const [tileX, tileY] = tileCoordinatesFromKey(key);
    return { tileX, tileY };
  });
  const minimumTileX = Math.min(
    ...coordinates.map(({ tileX }) => tileX)
  );
  const maximumTileX = Math.max(
    ...coordinates.map(({ tileX }) => tileX)
  );
  const minimumTileY = Math.min(
    ...coordinates.map(({ tileY }) => tileY)
  );
  const maximumTileY = Math.max(
    ...coordinates.map(({ tileY }) => tileY)
  );
  return {
    minimumTileX,
    maximumTileX,
    minimumTileY,
    maximumTileY,
    gridBoundaryMinimum: [minimumTileX, minimumTileY],
    gridBoundaryMaximumExclusive: [
      maximumTileX + 1,
      maximumTileY + 1
    ]
  };
};

const createNavMeshParams = () => {
  const { origin, tileWidth, tileHeight, maxTiles, maxPolys } =
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams;
  return NavMeshParams.create({
    orig: {
      x: origin[0],
      y: origin[1],
      z: origin[2]
    },
    tileWidth,
    tileHeight,
    maxTiles,
    maxPolys
  });
};

const assertAddedTileHeader = (navMesh, tileRef, expected, label) => {
  const tile = navMesh.getTileByRef(tileRef);
  if (tile === null) {
    fail(`${label}の追加済みDetour tileを参照できません。`);
  }
  const header = tile.header();
  if (header === null) {
    fail(`${label}の追加済みDetour tileにheaderがありません。`);
  }
  if (
    header.x() !== expected.x ||
    header.y() !== expected.y ||
    header.layer() !== expected.layer
  ) {
    fail(
      `${label}のmanifest座標とDetour headerが一致しません: ` +
        `期待=${expected.x}/${expected.y}/${expected.layer}, ` +
        `実際=${header.x()}/${header.y()}/${header.layer()}`
    );
  }
  if (tile.dataSize() !== expected.data.byteLength) {
    fail(
      `${label}のpayload長とDetour tile dataSizeが一致しません: ` +
        `${expected.data.byteLength} != ${tile.dataSize()}`
    );
  }
};

const assembleTiledNavMesh = (tiles, label) => {
  const sortedTiles = [...tiles].sort(compareTileCoordinates);
  const navMesh = new NavMesh();
  const navMeshParams = createNavMeshParams();
  let initialized;
  try {
    initialized = navMesh.initTiled(navMeshParams);
  } finally {
    Raw.destroy(navMeshParams.raw);
  }
  if (!initialized) {
    navMesh.destroy();
    fail(`${label}のtiled NavMeshを初期化できませんでした。`);
  }
  try {
    const keys = new Set();
    sortedTiles.forEach((tile, index) => {
      const key = tileKey(tile.x, tile.y, tile.layer);
      if (keys.has(key) || navMesh.getTileAt(tile.x, tile.y, tile.layer)) {
        fail(`${label}へ重複tileを追加できません: ${key}`);
      }
      keys.add(key);
      const data = new UnsignedCharArray();
      data.copy(tile.data);
      const added = navMesh.addTile(
        data,
        Detour.DT_TILE_FREE_DATA,
        0
      );
      if (statusFailed(added.status)) {
        data.destroy();
        fail(
          `${label}.tile[${index}]を追加できません: ` +
            `${statusToReadableString(added.status)} (${added.status})`
        );
      }
      assertAddedTileHeader(
        navMesh,
        added.tileRef,
        tile,
        `${label}.tile[${index}]`
      );
    });
    return navMesh;
  } catch (error) {
    navMesh.destroy();
    throw error;
  }
};

const createStaticBase = (staticTiles) => {
  if (staticTiles.length === 0) {
    fail("静的基盤へ格納するDetour tileがありません。");
  }
  const navMesh = assembleTiledNavMesh(staticTiles, "静的基盤");
  let restoredNavMesh = null;
  try {
    const data = exportNavMesh(navMesh);
    if (data.byteLength === 0) {
      fail("静的基盤のexportNavMesh()が空バイナリを返しました。");
    }
    const restored = importNavMesh(data);
    restoredNavMesh = restored.navMesh;
    const restoredData = exportNavMesh(restoredNavMesh);
    if (!arraysEqual(data, restoredData)) {
      fail("静的基盤をimport/exportしたbytesが一致しません。");
    }
    const [positions, indices] =
      getNavMeshPositionsAndIndices(restoredNavMesh);
    if (positions.length === 0 || indices.length === 0) {
      fail("静的基盤にpolygon geometryがありません。");
    }
    return {
      data,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3
    };
  } finally {
    restoredNavMesh?.destroy();
    navMesh.destroy();
  }
};

const validateTileSetReassembly = (tiles, label) => {
  const navMesh = assembleTiledNavMesh(tiles, label);
  try {
    const [positions, indices] = getNavMeshPositionsAndIndices(navMesh);
    if (positions.length === 0 || indices.length === 0) {
      fail(`${label}にpolygon geometryがありません。`);
    }
    return {
      tiles: tiles.length,
      vertices: positions.length / 3,
      triangles: indices.length / 3
    };
  } finally {
    navMesh.destroy();
  }
};

const publicNavMeshParams = () => ({
  origin: [...SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.origin],
  tileWidth: SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.tileWidth,
  tileHeight: SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.tileHeight,
  maxTiles: SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.maxTiles,
  maxPolys: SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.maxPolys
});

const encodeBundle = (sourceEntries) => {
  const entries = [...sourceEntries].sort(compareBundleEntries);
  if (entries.length === 0) {
    fail("room variant NavMesh bundle entryがありません。");
  }
  let payloadLength = 0;
  const manifestEntries = entries.map((entry, index) => {
    if (entry.data.byteLength === 0) {
      fail(`room variant bundle entry[${index}]のpayloadが空です。`);
    }
    const offset = payloadLength;
    payloadLength += entry.data.byteLength;
    if (payloadLength > MAX_UINT32) {
      fail("room variant bundle payloadがuint32範囲を超えました。");
    }
    return {
      roomId: entry.roomId,
      variantId: entry.variantId,
      tileX: entry.tileX,
      tileY: entry.tileY,
      layer: entry.layer,
      offset,
      length: entry.data.byteLength
    };
  });
  const manifest = {
    stageId: SCHOOL_ROOM_VARIANT_NAV_PROFILE.stageId,
    navProfileId: SCHOOL_ROOM_VARIANT_NAV_PROFILE.id,
    navMeshParams: publicNavMeshParams(),
    entries: manifestEntries
  };
  const manifestData = new TextEncoder().encode(stableStringify(manifest));
  if (
    manifestData.byteLength > MAX_UINT32 ||
    entries.length > MAX_UINT32
  ) {
    fail("room variant bundle manifestがuint32範囲を超えました。");
  }
  const bundle = new Uint8Array(
    BUNDLE_HEADER_BYTE_LENGTH +
      manifestData.byteLength +
      payloadLength
  );
  bundle.set(BUNDLE_MAGIC, 0);
  const header = new DataView(bundle.buffer);
  header.setUint16(8, BUNDLE_FORMAT_VERSION, true);
  header.setUint16(10, BUNDLE_HEADER_BYTE_LENGTH, true);
  header.setUint32(12, manifestData.byteLength, true);
  header.setUint32(16, payloadLength, true);
  header.setUint32(20, entries.length, true);
  bundle.set(manifestData, BUNDLE_HEADER_BYTE_LENGTH);
  let payloadOffset =
    BUNDLE_HEADER_BYTE_LENGTH + manifestData.byteLength;
  entries.forEach((entry) => {
    bundle.set(entry.data, payloadOffset);
    payloadOffset += entry.data.byteLength;
  });
  return bundle;
};

const assertPublicNavMeshParams = (value, label) => {
  const params = assertObject(value, label);
  assertExactKeys(
    params,
    ["origin", "tileWidth", "tileHeight", "maxTiles", "maxPolys"],
    label
  );
  const origin = assertArray(params.origin, `${label}.origin`);
  if (origin.length !== 3) {
    fail(`${label}.originは3要素である必要があります。`);
  }
  origin.forEach((component, axis) => {
    const checked = assertFiniteNumber(
      component,
      `${label}.origin[${axis}]`
    );
    if (
      checked !==
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams.origin[axis]
    ) {
      fail(`${label}.origin[${axis}]が固定profileと一致しません。`);
    }
  });
  ["tileWidth", "tileHeight"].forEach((property) => {
    const checked = assertFiniteNumber(params[property], `${label}.${property}`);
    if (
      checked !==
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams[property]
    ) {
      fail(`${label}.${property}が固定profileと一致しません。`);
    }
  });
  ["maxTiles", "maxPolys"].forEach((property) => {
    const checked = assertInteger(params[property], `${label}.${property}`, 1);
    if (
      checked !==
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.navMeshParams[property]
    ) {
      fail(`${label}.${property}が固定profileと一致しません。`);
    }
  });
};

const decodeBundle = (bundle) => {
  if (bundle.byteLength < BUNDLE_HEADER_BYTE_LENGTH) {
    fail("room variant NavMesh bundleが固定headerより短いです。");
  }
  BUNDLE_MAGIC.forEach((value, index) => {
    if (bundle[index] !== value) {
      fail("room variant NavMesh bundleのmagicが一致しません。");
    }
  });
  const header = new DataView(
    bundle.buffer,
    bundle.byteOffset,
    bundle.byteLength
  );
  if (header.getUint16(8, true) !== BUNDLE_FORMAT_VERSION) {
    fail("room variant NavMesh bundle versionが一致しません。");
  }
  if (header.getUint16(10, true) !== BUNDLE_HEADER_BYTE_LENGTH) {
    fail("room variant NavMesh bundle header長が一致しません。");
  }
  const manifestLength = header.getUint32(12, true);
  const payloadLength = header.getUint32(16, true);
  const entryCount = header.getUint32(20, true);
  if (
    BUNDLE_HEADER_BYTE_LENGTH + manifestLength + payloadLength !==
    bundle.byteLength
  ) {
    fail("room variant NavMesh bundle全体長が一致しません。");
  }
  const manifestBytes = bundle.subarray(
    BUNDLE_HEADER_BYTE_LENGTH,
    BUNDLE_HEADER_BYTE_LENGTH + manifestLength
  );
  if (
    manifestBytes.byteLength >= 3 &&
    manifestBytes[0] === 0xef &&
    manifestBytes[1] === 0xbb &&
    manifestBytes[2] === 0xbf
  ) {
    fail("room variant NavMesh bundle manifestにUTF-8 BOMがあります。");
  }
  let manifestText;
  try {
    manifestText = new TextDecoder("utf-8", { fatal: true }).decode(
      manifestBytes
    );
  } catch (error) {
    fail(
      `room variant NavMesh bundle manifestがUTF-8ではありません: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
  let parsedManifest;
  try {
    parsedManifest = JSON.parse(manifestText);
  } catch (error) {
    fail(
      `room variant NavMesh bundle manifestがJSONではありません: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
  const manifest = assertObject(
    parsedManifest,
    "room variant bundle manifest"
  );
  assertExactKeys(
    manifest,
    ["stageId", "navProfileId", "navMeshParams", "entries"],
    "room variant bundle manifest"
  );
  if (stableStringify(manifest) !== manifestText) {
    fail(
      "room variant NavMesh bundle manifestが安定順minified JSONではありません。"
    );
  }
  if (manifest.stageId !== SCHOOL_ROOM_VARIANT_NAV_PROFILE.stageId) {
    fail("room variant bundle manifest.stageIdが一致しません。");
  }
  if (manifest.navProfileId !== SCHOOL_ROOM_VARIANT_NAV_PROFILE.id) {
    fail("room variant bundle manifest.navProfileIdが一致しません。");
  }
  assertPublicNavMeshParams(
    manifest.navMeshParams,
    "room variant bundle manifest.navMeshParams"
  );
  const manifestEntries = assertArray(
    manifest.entries,
    "room variant bundle manifest.entries"
  );
  if (manifestEntries.length !== entryCount || entryCount === 0) {
    fail("room variant NavMesh bundle entry件数が一致しません。");
  }

  const payloadStart = BUNDLE_HEADER_BYTE_LENGTH + manifestLength;
  const keys = new Set();
  let expectedOffset = 0;
  let previous = null;
  const entries = manifestEntries.map((entryValue, index) => {
    const entry = assertObject(
      entryValue,
      `room variant bundle manifest.entries[${index}]`
    );
    assertExactKeys(
      entry,
      [
        "roomId",
        "variantId",
        "tileX",
        "tileY",
        "layer",
        "offset",
        "length"
      ],
      `room variant bundle manifest.entries[${index}]`
    );
    const roomId = assertNonEmptyString(
      entry.roomId,
      `entry[${index}].roomId`
    );
    const variantId = assertNonEmptyString(
      entry.variantId,
      `entry[${index}].variantId`
    );
    if (!ROOM_ID_SET.has(roomId)) {
      fail(`entry[${index}].roomIdが固定20室IDではありません。`);
    }
    if (!VARIANT_ID_SET.has(variantId)) {
      fail(`entry[${index}].variantIdがnormal/disorderedではありません。`);
    }
    const tileX = assertInteger(
      entry.tileX,
      `entry[${index}].tileX`,
      0,
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountX - 1
    );
    const tileY = assertInteger(
      entry.tileY,
      `entry[${index}].tileY`,
      0,
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.grid.tileCountY - 1
    );
    const layer = assertInteger(
      entry.layer,
      `entry[${index}].layer`,
      0,
      MAX_INT32
    );
    const offset = assertInteger(entry.offset, `entry[${index}].offset`);
    const length = assertInteger(
      entry.length,
      `entry[${index}].length`,
      1
    );
    if (offset !== expectedOffset) {
      fail(`entry[${index}]のoffsetに隙間または重複があります。`);
    }
    expectedOffset += length;
    if (expectedOffset > payloadLength) {
      fail(`entry[${index}]がbundle payloadを超えています。`);
    }
    const decoded = {
      roomId,
      variantId,
      tileX,
      tileY,
      layer,
      x: tileX,
      y: tileY,
      offset,
      length,
      data: bundle.subarray(
        payloadStart + offset,
        payloadStart + offset + length
      )
    };
    const key = bundleEntryKey(decoded);
    if (keys.has(key)) {
      fail(`room variant bundle entryが重複しています: ${key}`);
    }
    keys.add(key);
    if (previous !== null && compareBundleEntries(previous, decoded) >= 0) {
      fail(`room variant bundle entry順が不安定です: index=${index}`);
    }
    previous = decoded;
    return decoded;
  });
  if (expectedOffset !== payloadLength) {
    fail("room variant NavMesh bundleに未参照payloadがあります。");
  }
  return { manifest, entries };
};

const validateBundleTileHeaders = (decoded, ownedKeysByVariant) => {
  const entriesByPair = new Map();
  decoded.entries.forEach((entry) => {
    const pair = roomVariantKey(entry.roomId, entry.variantId);
    const group = entriesByPair.get(pair) ?? [];
    group.push(entry);
    entriesByPair.set(pair, group);
  });

  ROOM_IDS.forEach((roomId) => {
    VARIANT_IDS.forEach((variantId) => {
      const pair = roomVariantKey(roomId, variantId);
      const entries = entriesByPair.get(pair);
      if (entries === undefined || entries.length === 0) {
        fail(`bundle entryがありません: ${roomId}/${variantId}`);
      }
      const keys = new Set(
        entries.map((entry) =>
          tileKey(entry.tileX, entry.tileY, entry.layer)
        )
      );
      assertSameKeySet(
        ownedKeysByVariant.get(pair),
        keys,
        `${roomId}/${variantId}とroom_variant_tile`
      );
      const navMesh = assembleTiledNavMesh(
        entries.map((entry) => ({
          x: entry.tileX,
          y: entry.tileY,
          layer: entry.layer,
          data: entry.data
        })),
        `bundle header監査 ${roomId}/${variantId}`
      );
      navMesh.destroy();
    });
  });
};

const portalPointKey = (point) =>
  point
    .map((value) =>
      Math.round(value / GRID_ALIGNMENT_TOLERANCE)
    )
    .join("/");

const portalKeyForLink = (tile, polygon, link, label) => {
  const edgeIndex = assertInteger(
    link.edge(),
    `${label}.edge`,
    0,
    polygon.vertCount() - 1
  );
  const edgeStartIndex = polygon.verts(edgeIndex);
  const edgeEndIndex = polygon.verts(
    (edgeIndex + 1) % polygon.vertCount()
  );
  const edgeStart = [0, 1, 2].map((axis) =>
    tile.verts(edgeStartIndex * 3 + axis)
  );
  const edgeEnd = [0, 1, 2].map((axis) =>
    tile.verts(edgeEndIndex * 3 + axis)
  );
  const external = link.side() !== 0xff;
  const minimum = external
    ? assertInteger(link.bmin(), `${label}.bmin`, 0, 255) / 255
    : 0;
  const maximum = external
    ? assertInteger(link.bmax(), `${label}.bmax`, 0, 255) / 255
    : 1;
  if (minimum > maximum) {
    fail(`${label}のDetour portal intervalが逆転しています。`);
  }
  const interpolate = (factor) =>
    edgeStart.map(
      (value, axis) =>
        value + (edgeEnd[axis] - value) * factor
    );
  const endpointKeys = [
    portalPointKey(interpolate(minimum)),
    portalPointKey(interpolate(maximum))
  ].sort(codeUnitCompare);
  if (endpointKeys[0] === endpointKeys[1]) {
    fail(`${label}のDetour portalがzero-lengthです。`);
  }
  return endpointKeys.join("|");
};

const collectPolygonOwnershipAndLinks = (navMesh, ownerByKey) => {
  const ownerByPolygonRef = new Map();
  const unresolvedDirectedLinks = [];
  for (
    let tileIndex = 0;
    tileIndex < navMesh.getMaxTiles();
    tileIndex += 1
  ) {
    const tile = navMesh.getTile(tileIndex);
    const header = tile.header();
    if (header === null) {
      continue;
    }
    const key = tileKey(header.x(), header.y(), header.layer());
    const owner = ownerByKey.get(key) ?? null;
    const polygonRefBase = navMesh.getPolyRefBase(tile);
    for (
      let polygonIndex = 0;
      polygonIndex < header.polyCount();
      polygonIndex += 1
    ) {
      const polygonRef = polygonRefBase + polygonIndex;
      const polygon = tile.polys(polygonIndex);
      let linkIndex = polygon.firstLink();
      let visitedLinks = 0;
      while (linkIndex !== Detour.DT_NULL_LINK) {
        if (visitedLinks > header.maxLinkCount()) {
          fail(`Detour link listにcycleがあります: polygonRef=${polygonRef}`);
        }
        const link = tile.links(linkIndex);
        if (link.ref() !== 0) {
          unresolvedDirectedLinks.push({
            fromPolygonRef: polygonRef,
            toPolygonRef: link.ref(),
            portalKey: portalKeyForLink(
              tile,
              polygon,
              link,
              `polygonRef=${polygonRef}/link[${linkIndex}]`
            )
          });
        }
        linkIndex = link.next();
        visitedLinks += 1;
      }
      ownerByPolygonRef.set(polygonRef, owner);
    }
  }
  const directedLinks = unresolvedDirectedLinks.map((link) => {
    if (!ownerByPolygonRef.has(link.toPolygonRef)) {
      fail(
        `Detour linkの接続先polygonを解決できません: ` +
          `${link.fromPolygonRef} -> ${link.toPolygonRef}`
      );
    }
    return {
      ...link,
      fromOwner:
        ownerByPolygonRef.get(link.fromPolygonRef) ?? null,
      toOwner:
        ownerByPolygonRef.get(link.toPolygonRef) ?? null
    };
  });
  return { ownerByPolygonRef, directedLinks };
};

const pointObject = (point) => ({
  x: point[0],
  y: point[1],
  z: point[2]
});

const pointArray = (point) => [point.x, point.y, point.z];

const pointDistance = (left, right) =>
  Math.hypot(
    left.x - right.x,
    left.y - right.y,
    left.z - right.z
  );

const projectRoutePoint = (
  query,
  sourcePoint,
  halfExtents,
  maximumDistance,
  label
) => {
  const source = pointObject(sourcePoint);
  const result = query.findClosestPoint(source, { halfExtents });
  if (!result.success || result.polyRef === 0) {
    const diagnostic = query.findClosestPoint(source, {
      halfExtents: { x: 0.5, y: 0.5, z: 0.5 }
    });
    fail(
      `${label}をNavMeshへ投影できません: ` +
        `source=${JSON.stringify(source)}, ` +
        `nearest=${JSON.stringify(diagnostic)}`
    );
  }
  const projectionDistance = pointDistance(source, result.point);
  if (projectionDistance > maximumDistance) {
    fail(
      `${label}のNavMesh投影距離が上限を超えました: ` +
        `${projectionDistance} > ${maximumDistance}, ` +
        `source=${JSON.stringify(source)}, ` +
        `projected=${JSON.stringify(result.point)}`
    );
  }
  return {
    point: result.point,
    polygonRef: result.polyRef,
    projectionDistance
  };
};

const assertProjectedPointOwner = (
  ownerByPolygonRef,
  projected,
  expectedRoomId,
  label
) => {
  const actualOwner =
    ownerByPolygonRef.get(projected.polygonRef) ?? null;
  if (actualOwner !== expectedRoomId) {
    fail(
      `${label}が期待する所有者のactive NavMesh polygonへ` +
        `投影されていません: ` +
        `期待=${expectedRoomId ?? "static"}, ` +
        `実際=${actualOwner ?? "static"}, ` +
        `polygonRef=${projected.polygonRef}`
    );
  }
  return actualOwner;
};

const projectRoomCenterPoint = (
  query,
  navMesh,
  ownerByPolygonRef,
  sourcePoint,
  volume,
  roomId,
  label
) => {
  const source = pointObject(sourcePoint);
  const walkableClimb =
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.walkableClimb *
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.ch;
  const horizontalSearchHalfExtents = {
    x:
      (volume.geometry.boundsMax[0] -
        volume.geometry.boundsMin[0]) /
      2,
    z:
      (volume.geometry.boundsMax[2] -
        volume.geometry.boundsMin[2]) /
      2
  };
  const queried = query.queryPolygons(
    source,
    {
      x: horizontalSearchHalfExtents.x,
      y: walkableClimb,
      z: horizontalSearchHalfExtents.z
    },
    { maxPolys: ROUTE_PATH_LIMIT }
  );
  if (!queried.success) {
    fail(
      `${label}のground polygon候補を列挙できません: ` +
        `${statusToReadableString(queried.status)} (${queried.status})`
    );
  }
  const candidates = [];
  const rejectedCounts = {
    foreignOwner: 0,
    nonGroundArea: 0,
    closestPointFailure: 0,
    height: 0,
    outsideVolume: 0
  };
  [...new Set(queried.polyRefs)]
    .sort((left, right) => left - right)
    .forEach((polygonRef) => {
      if ((ownerByPolygonRef.get(polygonRef) ?? null) !== roomId) {
        rejectedCounts.foreignOwner += 1;
        return;
      }
      const area = navMesh.getPolyArea(polygonRef);
      if (statusFailed(area.status) || area.area !== GROUND_POLYGON_AREA) {
        rejectedCounts.nonGroundArea += 1;
        return;
      }
      const closest = query.closestPointOnPoly(polygonRef, source);
      if (!closest.success) {
        rejectedCounts.closestPointFailure += 1;
        return;
      }
      const point = closest.closestPoint;
      const heightDelta = Math.abs(point.y - source.y);
      if (heightDelta > walkableClimb + BOUNDS_TOLERANCE) {
        rejectedCounts.height += 1;
        return;
      }
      const horizontalDistance = Math.hypot(
        point.x - source.x,
        point.z - source.z
      );
      if (!pointInsideClosedMesh(pointArray(point), volume.geometry)) {
        rejectedCounts.outsideVolume += 1;
        return;
      }
      candidates.push({
        point,
        polygonRef,
        area: area.area,
        horizontalDistance,
        heightDelta,
        projectionDistance: pointDistance(source, point)
      });
    });
  candidates.sort(
    (left, right) => {
      const distanceDifference =
        left.horizontalDistance - right.horizontalDistance;
      return Math.abs(distanceDifference) > BOUNDS_TOLERANCE
        ? distanceDifference
        : left.polygonRef - right.polygonRef;
    }
  );
  const selected = candidates[0];
  if (selected === undefined) {
    fail(
      `${label}を対象室所有のground polygonへ投影できません: ` +
        `source=${JSON.stringify(source)}, ` +
        `walkableClimb=${walkableClimb}, ` +
        `horizontalSearchHalfExtents=` +
        `${JSON.stringify(horizontalSearchHalfExtents)}, ` +
        `queriedPolygons=${queried.polyRefs.length}, ` +
        `rejected=${JSON.stringify(rejectedCounts)}`
    );
  }
  if (
    selected.horizontalDistance >
    ROOM_CENTER_MAXIMUM_HORIZONTAL_PROJECTION_DISTANCE +
      BOUNDS_TOLERANCE
  ) {
    fail(
      `${label}のground polygon水平投影距離が上限を超えました: ` +
        `${selected.horizontalDistance} > ` +
        `${ROOM_CENTER_MAXIMUM_HORIZONTAL_PROJECTION_DISTANCE}, ` +
        `source=${JSON.stringify(source)}, ` +
        `projected=${JSON.stringify(pointArray(selected.point))}, ` +
        `heightDelta=${selected.heightDelta}, ` +
        `polygonRef=${selected.polygonRef}, ` +
        `candidateCount=${candidates.length}`
    );
  }
  return {
    ...selected,
    walkableClimb,
    candidateCount: candidates.length
  };
};

const findValidatedRoute = (
  query,
  projectedStart,
  projectedEnd,
  label
) => {
  const corridor = query.findPath(
    projectedStart.polygonRef,
    projectedEnd.polygonRef,
    projectedStart.point,
    projectedEnd.point,
    { maxPathPolys: ROUTE_PATH_LIMIT }
  );
  try {
    if (!corridor.success || corridor.polys.size === 0) {
      fail(`${label}のpolygon corridorを計算できません。`);
    }
    const straight = query.findStraightPath(
      projectedStart.point,
      projectedEnd.point,
      corridor.polys,
      {
        maxStraightPathPoints: ROUTE_PATH_LIMIT,
        straightPathOptions: Detour.DT_STRAIGHTPATH_ALL_CROSSINGS
      }
    );
    try {
      if (!straight.success || straight.straightPathCount === 0) {
        fail(`${label}のstraight pathを計算できません。`);
      }
      const coordinates = straight.straightPath.toTypedArray();
      const points = Array.from(
        { length: straight.straightPathCount },
        (_, index) => ({
          x: coordinates[index * 3],
          y: coordinates[index * 3 + 1],
          z: coordinates[index * 3 + 2]
        })
      );
      const startError = pointDistance(
        points[0],
        projectedStart.point
      );
      const endError = pointDistance(
        points.at(-1),
        projectedEnd.point
      );
      if (
        startError > ROUTE_ENDPOINT_TOLERANCE ||
        endError > ROUTE_ENDPOINT_TOLERANCE
      ) {
        fail(
          `${label}が投影済み両端へ到達していません: ` +
            `startError=${startError}, endError=${endError}, ` +
            `projectedStart=${JSON.stringify(
              pointArray(projectedStart.point)
            )}, actualStart=${JSON.stringify(pointArray(points[0]))}, ` +
            `projectedEnd=${JSON.stringify(
              pointArray(projectedEnd.point)
            )}, actualEnd=${JSON.stringify(pointArray(points.at(-1)))}, ` +
            `corridorPolygons=${corridor.polys.size}, ` +
            `straightPathPoints=${points.length}`
        );
      }
      let distance = 0;
      for (let index = 1; index < points.length; index += 1) {
        distance += pointDistance(points[index - 1], points[index]);
      }
      return {
        pointCount: points.length,
        distance,
        start: pointArray(points[0]),
        end: pointArray(points.at(-1)),
        startError,
        endError
      };
    } finally {
      straight.straightPath.destroy();
      straight.straightPathFlags.destroy();
      straight.straightPathRefs.destroy();
    }
  } finally {
    corridor.polys.destroy();
  }
};

const validateRoomDoorRoute = (
  query,
  navMesh,
  roomId,
  variantId,
  volume,
  doors,
  ownerByPolygonRef
) => {
  const roomBounds = ROOM_BOUNDS_BY_ID[roomId];
  if (roomBounds === undefined) {
    fail(`${roomId}/${variantId}の固定roomBoundsがありません。`);
  }
  const center = [
    ((roomBounds[0] + roomBounds[1]) / 2) *
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.worldScale,
    doors[0].position[1],
    -((roomBounds[2] + roomBounds[3]) / 2) *
      SCHOOL_ROOM_VARIANT_NAV_PROFILE.worldScale
  ];
  if (!pointInsideClosedMesh(center, volume.geometry)) {
    fail(`${roomId}/${variantId}の室内中央が所有Volume内ではありません。`);
  }
  if (
    doors.some(
      ({ position }) =>
        Math.abs(position[1] - center[1]) > BOUNDS_TOLERANCE
    )
  ) {
    fail(`${roomId}/${variantId}のroom door床高が一致しません。`);
  }
  const projectedCenter = projectRoomCenterPoint(
    query,
    navMesh,
    ownerByPolygonRef,
    center,
    volume,
    roomId,
    `${roomId}/${variantId}の室内中央`
  );
  const centerOwnerRoomId = assertProjectedPointOwner(
    ownerByPolygonRef,
    projectedCenter,
    roomId,
    `${roomId}/${variantId}の室内中央`
  );
  const attempts = doors.map((door) => {
    try {
      const outwardX = door.position[0] - center[0];
      const outwardZ = door.position[2] - center[2];
      const outwardLength = Math.hypot(outwardX, outwardZ);
      if (outwardLength <= BOUNDS_TOLERANCE) {
        fail(`${door.doorId}の室外方向を決定できません。`);
      }
      const outside = [
        door.position[0] +
          (outwardX / outwardLength) * ROOM_ROUTE_OUTSIDE_DISTANCE,
        door.position[1],
        door.position[2] +
          (outwardZ / outwardLength) * ROOM_ROUTE_OUTSIDE_DISTANCE
      ];
      if (pointInsideClosedMesh(outside, volume.geometry)) {
        fail(`${door.doorId}の室外probeが所有Volume内です。`);
      }
      const projectedOutside = projectRoutePoint(
        query,
        outside,
        ROOM_ROUTE_QUERY_HALF_EXTENTS,
        ROOM_ROUTE_PROJECTION_MAX_DISTANCE,
        `${roomId}/${variantId}/${door.doorId}の室外点`
      );
      if (
        pointInsideClosedMesh(
          pointArray(projectedOutside.point),
          volume.geometry
        )
      ) {
        fail(`${door.doorId}の投影済み室外点が所有Volume内です。`);
      }
      assertProjectedPointOwner(
        ownerByPolygonRef,
        projectedOutside,
        null,
        `${roomId}/${variantId}/${door.doorId}の室外点`
      );
      if (
        !pointInsideClosedMesh(
          pointArray(projectedCenter.point),
          volume.geometry
        )
      ) {
        fail(`${roomId}/${variantId}の投影済み室内中央が所有Volume外です。`);
      }
      const route = findValidatedRoute(
        query,
        projectedOutside,
        projectedCenter,
        `${roomId}/${variantId}/${door.doorId}から室内中央`
      );
      return {
        doorId: door.doorId,
        success: true,
        outside,
        center,
        projectedOutside: pointArray(projectedOutside.point),
        projectedCenter: pointArray(projectedCenter.point),
        outsideProjectionDistance:
          projectedOutside.projectionDistance,
        centerProjectionDistance: projectedCenter.projectionDistance,
        centerHorizontalProjectionDistance:
          projectedCenter.horizontalDistance,
        centerProjectionHeight: projectedCenter.point.y,
        centerProjectionHeightDelta: projectedCenter.heightDelta,
        centerProjectionCandidateCount:
          projectedCenter.candidateCount,
        centerProjectionPolygonRef:
          projectedCenter.polygonRef,
        centerOwnerRoomId,
        route
      };
    } catch (error) {
      return {
        doorId: door.doorId,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  const successful = attempts.find(({ success }) => success);
  if (successful === undefined) {
    fail(
      `${roomId}/${variantId}でdoor外から室内中央へ到達できません: ` +
        JSON.stringify(attempts)
    );
  }
  return {
    requiredSuccessfulDoorCount: 1,
    successfulDoorCount: attempts.filter(({ success }) => success).length,
    selectedDoorId: successful.doorId,
    attempts
  };
};

const validateDisorderedRampRoute = (
  query,
  roomId,
  volume,
  rampProbe,
  ownerByPolygonRef
) => {
  if (rampProbe === undefined) {
    fail(`${roomId}/disorderedの荒れ家具ramp probeがありません。`);
  }
  const projectedFloor = projectRoutePoint(
    query,
    rampProbe.floorProbe,
    RAMP_ROUTE_QUERY_HALF_EXTENTS,
    RAMP_ROUTE_PROJECTION_MAX_DISTANCE,
    `${roomId}/disorderedの荒れ家具ramp床側点`
  );
  const projectedLow = projectRoutePoint(
    query,
    rampProbe.lowProbe,
    RAMP_ROUTE_QUERY_HALF_EXTENTS,
    RAMP_ROUTE_PROJECTION_MAX_DISTANCE,
    `${roomId}/disorderedの荒れ家具ramp低点`
  );
  const projectedHigh = projectRoutePoint(
    query,
    rampProbe.highProbe,
    RAMP_ROUTE_QUERY_HALF_EXTENTS,
    RAMP_ROUTE_PROJECTION_MAX_DISTANCE,
    `${roomId}/disorderedの荒れ家具ramp高点`
  );
  const projectedFloorArray = pointArray(projectedFloor.point);
  const projectedLowArray = pointArray(projectedLow.point);
  const projectedHighArray = pointArray(projectedHigh.point);
  if (
    !pointInsideClosedMesh(projectedFloorArray, volume.geometry) ||
    !pointInsideClosedMesh(projectedLowArray, volume.geometry) ||
    !pointInsideClosedMesh(projectedHighArray, volume.geometry)
  ) {
    fail(`${roomId}/disorderedの投影済み荒れ家具probeが所有Volume外です。`);
  }
  const floorOwnerRoomId = assertProjectedPointOwner(
    ownerByPolygonRef,
    projectedFloor,
    roomId,
    `${roomId}/disorderedの荒れ家具ramp床側点`
  );
  const lowOwnerRoomId = assertProjectedPointOwner(
    ownerByPolygonRef,
    projectedLow,
    roomId,
    `${roomId}/disorderedの荒れ家具ramp低点`
  );
  const highOwnerRoomId = assertProjectedPointOwner(
    ownerByPolygonRef,
    projectedHigh,
    roomId,
    `${roomId}/disorderedの荒れ家具ramp高点`
  );
  const walkableClimb =
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.walkableClimb *
    SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.ch;
  const floorHeightDelta = Math.abs(
    projectedFloor.point.y - rampProbe.floorProbe[1]
  );
  if (floorHeightDelta > walkableClimb + BOUNDS_TOLERANCE) {
    fail(
      `${roomId}/disorderedの荒れ家具ramp床側点が床高から` +
        `walkableClimbを超えています: ` +
        `${floorHeightDelta} > ${walkableClimb}, ` +
        `source=${JSON.stringify(rampProbe.floorProbe)}, ` +
        `projected=${JSON.stringify(projectedFloorArray)}`
    );
  }
  const heightGain = projectedHigh.point.y - projectedLow.point.y;
  if (heightGain < RAMP_MINIMUM_HEIGHT_GAIN) {
    fail(
      `${roomId}/disorderedの荒れ家具ramp高低差が不足しています: ` +
        `${heightGain} < ${RAMP_MINIMUM_HEIGHT_GAIN}, ` +
        `sourceExpected=${rampProbe.expectedProbeHeightGain}, ` +
        `sourceLow=${JSON.stringify(rampProbe.lowProbe)}, ` +
        `projectedLow=${JSON.stringify(projectedLowArray)}, ` +
        `lowProjectionDistance=${projectedLow.projectionDistance}, ` +
        `sourceHigh=${JSON.stringify(rampProbe.highProbe)}, ` +
        `projectedHigh=${JSON.stringify(projectedHighArray)}, ` +
        `highProjectionDistance=${projectedHigh.projectionDistance}`
    );
  }
  const floorToLowRoute = findValidatedRoute(
    query,
    projectedFloor,
    projectedLow,
    `${roomId}/disorderedの荒れ家具ramp床側点から低点`
  );
  const lowToHighRoute = findValidatedRoute(
    query,
    projectedLow,
    projectedHigh,
    `${roomId}/disorderedの荒れ家具ramp低点から高点`
  );
  return {
    ...rampProbe,
    projectedFloor: projectedFloorArray,
    projectedLow: projectedLowArray,
    projectedHigh: projectedHighArray,
    floorProjectionDistance: projectedFloor.projectionDistance,
    lowProjectionDistance: projectedLow.projectionDistance,
    highProjectionDistance: projectedHigh.projectionDistance,
    floorOwnerRoomId,
    lowOwnerRoomId,
    highOwnerRoomId,
    floorHeightDelta,
    heightGain,
    routes: {
      floorToLow: floorToLowRoute,
      lowToHigh: lowToHighRoute
    }
  };
};

const validateRoomVariantAssembly = (
  staticTiles,
  decodedEntries,
  ownerByKey,
  prepared,
  targetRoomId,
  targetVariantId
) => {
  const selectedEntries = decodedEntries
    .filter(
      (entry) =>
        entry.variantId ===
        (entry.roomId === targetRoomId ? targetVariantId : "normal")
    )
    .map((entry) => ({
      x: entry.tileX,
      y: entry.tileY,
      layer: entry.layer,
      data: entry.data
    }));
  const navMesh = assembleTiledNavMesh(
    [...staticTiles, ...selectedEntries],
    `${targetRoomId}だけ${targetVariantId}、他19室normal構成`
  );
  let query = null;
  let queryFilter = null;
  try {
    const [positions, indices] = getNavMeshPositionsAndIndices(navMesh);
    if (positions.length === 0 || indices.length === 0) {
      fail(
        `${targetRoomId}/${targetVariantId}構成にpolygon geometryがありません。`
      );
    }
    const { ownerByPolygonRef, directedLinks } =
      collectPolygonOwnershipAndLinks(navMesh, ownerByKey);
    const staticPolygonRefs = new Set(
      [...ownerByPolygonRef]
        .filter(([, owner]) => owner === null)
        .map(([polygonRef]) => polygonRef)
    );
    if (staticPolygonRefs.size === 0) {
      fail(`${targetRoomId}/${targetVariantId}構成に静的polygonがありません。`);
    }
    const polygonRefs = [...ownerByPolygonRef]
      .filter(([, owner]) => owner === targetRoomId)
      .map(([polygonRef]) => polygonRef);
    if (polygonRefs.length === 0) {
      fail(
        `${targetRoomId}/${targetVariantId}構成で対象室polygonがありません。`
      );
    }
    const crossOwnerDirectedLinks = directedLinks.filter(
      ({ fromOwner, toOwner }) =>
        (fromOwner === targetRoomId && toOwner === null) ||
        (fromOwner === null && toOwner === targetRoomId)
    );
    if (crossOwnerDirectedLinks.length === 0) {
      fail(
        `room/static境界の双方向接続がありません: ` +
          `${targetRoomId}/${targetVariantId}`
      );
    }
    const directedLinkKeys = new Set();
    crossOwnerDirectedLinks.forEach(
      ({ fromPolygonRef, toPolygonRef, portalKey }) => {
        const key =
          `${fromPolygonRef}>${toPolygonRef}|${portalKey}`;
        if (directedLinkKeys.has(key)) {
          fail(
            `room/static境界のdirected linkが重複しています: ` +
              `${targetRoomId}/${targetVariantId}, ${key}`
          );
        }
        directedLinkKeys.add(key);
      }
    );
    crossOwnerDirectedLinks.forEach(
      ({ fromPolygonRef, toPolygonRef, portalKey }) => {
        const reverseKey =
          `${toPolygonRef}>${fromPolygonRef}|${portalKey}`;
        if (!directedLinkKeys.has(reverseKey)) {
          fail(
            `room/static境界の観測linkに逆向きlinkがありません: ` +
              `${targetRoomId}/${targetVariantId}, ` +
              `${fromPolygonRef} -> ${toPolygonRef}, ` +
              `portal=${portalKey}`
          );
        }
      }
    );
    const roomStaticPortalKeys = [
      ...new Set(
        crossOwnerDirectedLinks.map(({ portalKey }) => portalKey)
      )
    ].sort(codeUnitCompare);
    const bidirectionalStaticBoundaryLinks =
      crossOwnerDirectedLinks.length;
    const volume = prepared.volumes.find(
      (candidate) => candidate.roomId === targetRoomId
    );
    const doors = prepared.roomDoorsByRoom.get(targetRoomId);
    if (volume === undefined || doors === undefined) {
      fail(
        `${targetRoomId}/${targetVariantId}の経路監査契約を解決できません。`
      );
    }
    queryFilter = new QueryFilter();
    queryFilter.includeFlags = 0xffff;
    queryFilter.excludeFlags = 0;
    query = new NavMeshQuery(navMesh, {
      maxNodes: ROUTE_PATH_LIMIT,
      defaultQueryFilter: queryFilter
    });
    const doorToCenter = validateRoomDoorRoute(
      query,
      navMesh,
      targetRoomId,
      targetVariantId,
      volume,
      doors,
      ownerByPolygonRef
    );
    const disorderedRamp =
      targetVariantId === "disordered"
        ? validateDisorderedRampRoute(
            query,
            targetRoomId,
            volume,
            prepared.disorderedRampProbesByRoom.get(targetRoomId),
            ownerByPolygonRef
          )
        : null;
    return {
      targetRoomId,
      targetVariantId,
      otherRoomVariantId: "normal",
      selectedVariantEntries: selectedEntries.length,
      vertices: positions.length / 3,
      triangles: indices.length / 3,
      targetRoomPolygons: polygonRefs.length,
      bidirectionalStaticBoundaryLinks,
      roomStaticCrossOwnerDirectedLinks:
        crossOwnerDirectedLinks.length,
      roomStaticBidirectionalPortalCount:
        roomStaticPortalKeys.length,
      roomStaticPortalKeys,
      doorToCenter,
      disorderedRamp
    };
  } finally {
    query?.destroy();
    if (queryFilter !== null) {
      Raw.destroy(queryFilter.raw);
    }
    navMesh.destroy();
  }
};

const validateAllRoomVariantAssemblies = (
  staticTiles,
  decodedEntries,
  ownerByKey,
  prepared
) => {
  const reports = [];
  const failures = [];
  [...ROOM_IDS].sort(codeUnitCompare).forEach((roomId) => {
    VARIANT_IDS.forEach((variantId) => {
      try {
        reports.push(
          validateRoomVariantAssembly(
            staticTiles,
            decodedEntries,
            ownerByKey,
            prepared,
            roomId,
            variantId
          )
        );
      } catch (error) {
        failures.push({
          roomId,
          variantId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
  });
  if (failures.length > 0) {
    fail(
      `room/variant 40構成の受入監査に失敗しました: ` +
        JSON.stringify(failures)
    );
  }
  if (reports.length !== ROOM_IDS.length * VARIANT_IDS.length) {
    fail(`room/variant構成の受入件数が40件ではありません: ${reports.length}`);
  }
  [...ROOM_IDS].sort(codeUnitCompare).forEach((roomId) => {
    const normal = reports.find(
      ({ targetRoomId, targetVariantId }) =>
        targetRoomId === roomId && targetVariantId === "normal"
    );
    if (normal === undefined) {
      fail(`${roomId}/normalのroom/static portal集合がありません。`);
    }
    const normalPortalKeys = new Set(normal.roomStaticPortalKeys);
    VARIANT_IDS.forEach((variantId) => {
      const report = reports.find(
        ({ targetRoomId, targetVariantId }) =>
          targetRoomId === roomId &&
          targetVariantId === variantId
      );
      if (report === undefined) {
        fail(`${roomId}/${variantId}のroom/static portal集合がありません。`);
      }
      assertSameKeySet(
        normalPortalKeys,
        new Set(report.roomStaticPortalKeys),
        `${roomId}/${variantId}とnormalのroom/static portal集合`
      );
      report.normalRoomStaticPortalSetMatched = true;
      report.normalRoomStaticPortalCount = normalPortalKeys.size;
    });
  });
  return reports;
};

const bakeOnce = (prepared, validateAcceptance) => {
  const staticBandGeneration = generateBandPartitionedStaticTiles(
    prepared.staticBandPartition
  );
  const commonTiles = staticBandGeneration.tiles;
  const commonTileStatistics = staticBandGeneration.statistics;
  const commonReassembly = validateTileSetReassembly(
    commonTiles,
    "static common物理Y band再結合"
  );
  const {
    ownedKeysByRoom: commonOwnedKeysByRoom,
    ownerByKey: commonOwnerByKey
  } =
    classifyCommonTileOwnership(commonTiles, prepared.volumes);
  const commonByKey = new Map(
    commonTiles.map((tile) => [tileKey(tile.x, tile.y, tile.layer), tile])
  );
  const bundleEntries = [];
  const variantReports = [];
  const variantTileStatistics = [];
  const ownedKeysByRoom = new Map();
  const ownedKeysByVariant = new Map();
  const variantKeyDifferences = [];
  const discardedVariantTileReports = [];
  const preflightProblems = {
    volumeGridMisalignments: prepared.volumeGridAudit.filter(
      (entry) => !entry.aligned
    ),
    variantSourceBoundsOutsideVolumes:
      prepared.variantSourceBoundsAudit.filter(
        (entry) => !entry.containedByVolumeBounds
      ),
    emptyOwnership: [],
    ownershipLeaks: [],
    exclusiveOwnershipConflicts: [],
    layerCollisions: []
  };

  for (const roomId of [...ROOM_IDS].sort(codeUnitCompare)) {
    const volume = prepared.volumes.find(
      (candidate) => candidate.roomId === roomId
    );
    if (volume === undefined) {
      fail(`room_variant_tile Volumeを解決できません: ${roomId}`);
    }
    const physicalBand = physicalBandForVolume(
      volume,
      prepared.physicalBands
    );
    const staticBandAssignment =
      prepared.staticBandPartition.assignments.find(
        ({ band }) => band.index === physicalBand.index
      );
    if (staticBandAssignment === undefined) {
      fail(`${roomId}のstatic common band geometryを解決できません。`);
    }
    const bandStaticGeometry = staticBandAssignment.geometry;
    const commonBandTiles = commonTiles.filter((tile) =>
      physicalBandContainsTile(physicalBand, tile)
    );
    if (commonBandTiles.length === 0) {
      fail(`${roomId}の物理Y帯に共通Detour tileがありません。`);
    }
    const commonOwnedKeys = commonOwnedKeysByRoom.get(roomId);
    let normalKeys = null;
    const generatedVariants = [];
    for (const variantId of VARIANT_IDS) {
      const pair = roomVariantKey(roomId, variantId);
      const variantGeometry = prepared.variantGeometryByPair.get(pair);
      if (variantGeometry === undefined) {
        fail(`variant NAV_* geometryを解決できません: ${roomId}/${variantId}`);
      }
      const combinedGeometry = mergeNavigationGeometry(
        bandStaticGeometry,
        variantGeometry
      );
      const generatedVariantTiles = generateLayeredTiles(
        combinedGeometry,
        `${roomId}/${variantId}`
      );
      const generatedTileStatistics =
        summarizeTileStatistics(generatedVariantTiles);
      const variantTiles = generatedVariantTiles.filter((tile) =>
        physicalBandContainsTile(physicalBand, tile)
      );
      if (variantTiles.length === 0) {
        fail(`${roomId}/${variantId}の物理Y帯にDetour tileがありません。`);
      }
      const bandTileStatistics = summarizeTileStatistics(variantTiles);
      const discardedTiles =
        generatedVariantTiles.length - variantTiles.length;
      discardedVariantTileReports.push({
        roomId,
        variantId,
        generatedTiles: generatedVariantTiles.length,
        bandTiles: variantTiles.length,
        discardedOutsideBandTiles: discardedTiles
      });
      variantTileStatistics.push({
        roomId,
        variantId,
        statistics: generatedTileStatistics
      });
      const variantByKey = new Map(
        variantTiles.map((tile) => [
          tileKey(tile.x, tile.y, tile.layer),
          tile
        ])
      );
      const actualOwnedKeys = new Set();
      variantTiles.forEach((tile) => {
        const key = tileKey(tile.x, tile.y, tile.layer);
        if (volumeContainsTile(volume, tile)) {
          actualOwnedKeys.add(key);
        }
      });
      if (actualOwnedKeys.size === 0) {
        preflightProblems.emptyOwnership.push({ roomId, variantId });
      }
      ownedKeysByVariant.set(pair, new Set(actualOwnedKeys));
      if (normalKeys === null) {
        normalKeys = actualOwnedKeys;
        ownedKeysByRoom.set(roomId, new Set(actualOwnedKeys));
      } else {
        const normalOnly = keySetDifference(normalKeys, actualOwnedKeys);
        const disorderedOnly = keySetDifference(actualOwnedKeys, normalKeys);
        if (normalOnly.length > 0 || disorderedOnly.length > 0) {
          variantKeyDifferences.push({
            roomId,
            normalOnly,
            disorderedOnly
          });
        }
        actualOwnedKeys.forEach((key) =>
          ownedKeysByRoom.get(roomId).add(key)
        );
      }
      generatedVariants.push({
        variantId,
        variantGeometry,
        variantTiles
      });
      const sortedOwnedKeys = [...actualOwnedKeys].sort((left, right) => {
        const leftTile = variantByKey.get(left);
        const rightTile = variantByKey.get(right);
        return compareTileCoordinates(leftTile, rightTile);
      });
      sortedOwnedKeys.forEach((key) => {
        const tile = variantByKey.get(key);
        bundleEntries.push({
          roomId,
          variantId,
          tileX: tile.x,
          tileY: tile.y,
          layer: tile.layer,
          boundsMin: tile.boundsMin,
          boundsMax: tile.boundsMax,
          data: tile.data
        });
      });
      variantReports.push({
        roomId,
        variantId,
        variantSourceBounds: {
          minimum: variantGeometry.boundsMin,
          maximum: variantGeometry.boundsMax
        },
        volumeBounds: {
          minimum: volume.geometry.boundsMin,
          maximum: volume.geometry.boundsMax
        },
        sourceVertices: combinedGeometry.positions.length / 3,
        sourceTriangles: combinedGeometry.indices.length / 3,
        generatedTiles: generatedVariantTiles.length,
        bandTiles: variantTiles.length,
        discardedOutsideBandTiles: discardedTiles,
        ownedTiles: actualOwnedKeys.size,
        staticBand: {
          bandId: physicalBand.id,
          minimumY: physicalBand.minimumY,
          maximumY: physicalBand.maximumY,
          sourceTriangles:
            prepared.staticBandPartition.sourceTriangleCount,
          sourceTriangleContributions:
            staticBandAssignment.sourceTriangleContributions,
          fragmentPolygons:
            staticBandAssignment.fragmentPolygons,
          fragmentTriangles:
            staticBandAssignment.fragmentTriangles,
          fragmentArea: staticBandAssignment.fragmentArea,
          commonTiles: commonBandTiles.length
        },
        tileStatistics: {
          generated: generatedTileStatistics,
          band: bandTileStatistics
        }
      });
    }
    const roomOwnedUnion = ownedKeysByRoom.get(roomId);
    const ignoredOwnedRegionKeys = new Set([
      ...commonOwnedKeys,
      ...roomOwnedUnion
    ]);
    const boundaryKeys = collectExternalBoundaryKeys(
      ignoredOwnedRegionKeys
    );
    const commonBoundaryTiles = commonBandTiles.filter((tile) =>
      boundaryKeys.has(tileKey(tile.x, tile.y, tile.layer))
    );
    if (commonBoundaryTiles.length === 0) {
      fail(`${roomId}のroom/static境界に共通Detour tileがありません。`);
    }
    generatedVariants.forEach(
      ({ variantId, variantGeometry, variantTiles }) => {
        const variantBoundaryTiles = variantTiles.filter((tile) =>
          boundaryKeys.has(tileKey(tile.x, tile.y, tile.layer))
        );
        const outsideChanges = collectOutsideOwnedRegionChanges(
          commonBoundaryTiles,
          variantBoundaryTiles,
          new Set()
        );
        if (outsideChanges.length === 0) {
          return;
        }
        const currentKeys = [...ignoredOwnedRegionKeys];
        const requiredKeys = [...new Set([
          ...currentKeys,
          ...outsideChanges.map(({ key }) => key)
        ])];
        const changedTileKeysByKind = Object.fromEntries(
          ["structure-changed", "common-only", "variant-only"].map((kind) => [
            kind,
            outsideChanges
              .filter((change) => change.kind === kind)
              .map(({ key }) => key)
          ])
        );
        preflightProblems.ownershipLeaks.push({
          roomId,
          variantId,
          variantSourceBounds: {
            minimum: variantGeometry.boundsMin,
            maximum: variantGeometry.boundsMax
          },
          currentTileRange: tileRangeForKeys(currentKeys),
          requiredMinimumTileRange: tileRangeForKeys(requiredKeys),
          changedTileCount: outsideChanges.length,
          changedTiles: outsideChanges,
          changedTileKeysByKind
        });
      }
    );
  }

  const ownerByKey = new Map();
  for (const [roomId, ownedKeys] of ownedKeysByRoom) {
    for (const key of ownedKeys) {
      const previousOwner = ownerByKey.get(key);
      if (previousOwner !== undefined) {
        preflightProblems.exclusiveOwnershipConflicts.push({
          key,
          firstRoomId: previousOwner,
          secondRoomId: roomId
        });
        continue;
      }
      ownerByKey.set(key, roomId);
      const commonTile = commonByKey.get(key);
      if (
        commonTile !== undefined &&
        commonOwnerByKey.get(key) !== roomId
      ) {
        const variantTile = bundleEntries.find(
          (entry) =>
            entry.roomId === roomId &&
            entry.variantId === "normal" &&
            tileKey(entry.tileX, entry.tileY, entry.layer) === key
        );
        preflightProblems.layerCollisions.push({
          roomId,
          key,
          commonOwnerRoomId: commonOwnerByKey.get(key) ?? null,
          variantYBounds:
            variantTile === undefined
              ? null
              : [variantTile.boundsMin[1], variantTile.boundsMax[1]],
          commonYBounds: [
            commonTile.boundsMin[1],
            commonTile.boundsMax[1]
          ]
        });
      }
    }
  }

  const generationStatistics = {
    common: commonTileStatistics,
    staticBands: staticBandGeneration.bandReports,
    variants: variantTileStatistics,
    peak: summarizeGenerationPeak(
      commonTileStatistics,
      variantTileStatistics
    )
  };

  if (
    Object.values(preflightProblems).some(
      (problems) => problems.length > 0
    )
  ) {
    const problemSummary = {
      volumeGridMisalignmentCount:
        preflightProblems.volumeGridMisalignments.length,
      variantSourceBoundsOutsideVolumeCount:
        preflightProblems.variantSourceBoundsOutsideVolumes.length,
      emptyOwnershipCount: preflightProblems.emptyOwnership.length,
      variantKeyDifferenceCount: variantKeyDifferences.length,
      ownershipLeakPairCount:
        preflightProblems.ownershipLeaks.length,
      exclusiveOwnershipConflictCount:
        preflightProblems.exclusiveOwnershipConflicts.length,
      layerCollisionCount:
        preflightProblems.layerCollisions.length,
      volumeGridAudit: prepared.volumeGridAudit,
      variantSourceBounds: prepared.variantSourceBoundsAudit,
      variantKeyDifferences,
      discardedVariantTileReports,
      generationStatistics,
      ownershipLeaks: preflightProblems.ownershipLeaks.map((problem) => ({
        roomId: problem.roomId,
        variantId: problem.variantId,
        changedTileCount: problem.changedTileCount,
        currentTileRange: problem.currentTileRange,
        requiredMinimumTileRange: problem.requiredMinimumTileRange
      }))
    };
    fail(
      "room variant NavMeshの所有・layer事前監査に失敗しました。\n" +
        `要約=${JSON.stringify(problemSummary)}\n` +
        `詳細=${JSON.stringify(preflightProblems)}`
    );
  }

  const staticTiles = commonTiles.filter(
    (tile) =>
      !commonOwnerByKey.has(tileKey(tile.x, tile.y, tile.layer))
  );
  const base = createStaticBase(staticTiles);
  const bundle = encodeBundle(bundleEntries);
  const decoded = decodeBundle(bundle);
  validateBundleTileHeaders(decoded, ownedKeysByVariant);
  const connectivity = validateAcceptance
    ? validateAllRoomVariantAssemblies(
        staticTiles,
        decoded.entries,
        ownerByKey,
        prepared
      )
    : [];
  const disorderedRampAcceptance = connectivity
    .filter(
      ({ targetVariantId }) => targetVariantId === "disordered"
    )
    .map(({ targetRoomId, disorderedRamp }) => {
      if (disorderedRamp === null) {
        fail(
          `${targetRoomId}/disorderedの荒れ家具ramp受入結果がありません。`
        );
      }
      return {
        roomId: targetRoomId,
        ...disorderedRamp
      };
    });
  if (
    validateAcceptance &&
    disorderedRampAcceptance.length !== ROOM_IDS.length
  ) {
    fail(
      `disordered ramp受入件数が20件ではありません: ` +
        `${disorderedRampAcceptance.length}`
    );
  }
  return {
    base,
    bundle,
    staticTileCount: staticTiles.length,
    commonTileCount: commonTiles.length,
    commonReassembly,
    staticBandPartition: {
      method: prepared.staticBandPartition.method,
      bandCount: prepared.physicalBands.length,
      sourceTriangles:
        prepared.staticBandPartition.sourceTriangleCount,
      processedSourceTriangles:
        prepared.staticBandPartition.processedSourceTriangleCount,
      splitSourceTriangles:
        prepared.staticBandPartition.splitSourceTriangles,
      coplanarBoundarySourceTriangles:
        prepared.staticBandPartition.coplanarBoundarySourceTriangles,
      fragmentTriangles:
        prepared.staticBandPartition.fragmentTriangleCount,
      maximumFragmentsPerSource:
        prepared.staticBandPartition.maximumFragmentsPerSource,
      sourceArea: prepared.staticBandPartition.sourceArea,
      fragmentArea: prepared.staticBandPartition.fragmentArea,
      totalAreaDelta:
        prepared.staticBandPartition.totalAreaDelta,
      maximumAreaDelta:
        prepared.staticBandPartition.maximumAreaDelta,
      positiveAreaOverlap:
        prepared.staticBandPartition.positiveAreaOverlap,
      missingArea: prepared.staticBandPartition.missingArea,
      duplicateFragmentAssignments:
        prepared.staticBandPartition.duplicateFragmentAssignments,
      windingMismatchCount:
        prepared.staticBandPartition.windingMismatchCount,
      degenerateSourceTriangleCount:
        prepared.staticBandPartition.degenerateSourceTriangleCount,
      degenerateFragmentTriangleCount:
        prepared.staticBandPartition.degenerateFragmentTriangleCount,
      areaAbsoluteTolerance:
        prepared.staticBandPartition.areaAbsoluteTolerance,
      areaRelativeTolerance:
        prepared.staticBandPartition.areaRelativeTolerance,
      uniqueTileKeys: staticBandGeneration.uniqueTileKeyCount,
      bands: staticBandGeneration.bandReports
    },
    bundleEntryCount: decoded.entries.length,
    ownedTileCounts: Object.fromEntries(
      [...ROOM_IDS]
        .sort(codeUnitCompare)
        .map((roomId) => [roomId, ownedKeysByRoom.get(roomId).size])
    ),
    variantKeyDifferences,
    discardedVariantTileReports,
    variantReports,
    generationStatistics,
    connectivity,
    disorderedRampAcceptance
  };
};

const parseArguments = () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return { check: false };
  }
  if (args.length === 1 && args[0] === "--check") {
    return { check: true };
  }
  fail(`未対応の引数です: ${args.join(" ")}`);
};

const readRequiredFile = async (path, label) => {
  try {
    return await readFile(path);
  } catch (error) {
    fail(
      `${label}を読み込めません: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const writeOutputFile = async (path, data, label) => {
  try {
    await writeFile(path, data);
  } catch (error) {
    fail(
      `${label}を書き込めません: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const main = async () => {
  const { check } = parseArguments();
  assertProfileGrid();
  await assertInstalledRecastVersion();
  const glbData = await readRequiredFile(INPUT_PATH, INPUT_RELATIVE_PATH);
  const { gltf, binary } = parseGlb(glbData);
  const { nodes, worldMatrices } = buildSceneGraph(gltf);
  const contract = collectAssetContract(nodes);
  const roomDoorsByRoom = collectRoomDoorContract(nodes, worldMatrices);
  const prepared = extractPreparedGeometry(
    gltf,
    binary,
    worldMatrices,
    contract
  );
  prepared.roomDoorsByRoom = roomDoorsByRoom;
  prepared.physicalBands = collectPhysicalBands(prepared.volumes);
  prepared.staticBandPartition = partitionGeometryByPhysicalBands(
    prepared.staticGeometry,
    prepared.physicalBands,
    "静的common"
  );
  prepared.disorderedRampProbesByRoom =
    collectDisorderedRampProbes(prepared, roomDoorsByRoom);
  prepared.volumes.forEach((volume) => {
    volume.grid = validateVolumeGridAlignment(volume);
  });
  prepared.volumeGridAudit = prepared.volumes.map(({ grid }) => grid);
  prepared.variantSourceBoundsAudit =
    collectVariantSourceBoundsAudit(prepared);

  await init();
  const startedAt = performance.now();
  const first = bakeOnce(prepared, true);
  const second = bakeOnce(prepared, false);
  if (!arraysEqual(first.base.data, second.base.data)) {
    fail("静的基盤の二重生成bytesが一致しません。");
  }
  if (!arraysEqual(first.bundle, second.bundle)) {
    fail("room variant bundleの二重生成bytesが一致しません。");
  }

  if (check) {
    const currentBase = new Uint8Array(
      await readRequiredFile(
        BASE_OUTPUT_PATH,
        BASE_OUTPUT_RELATIVE_PATH
      )
    );
    const currentBundle = new Uint8Array(
      await readRequiredFile(
        BUNDLE_OUTPUT_PATH,
        BUNDLE_OUTPUT_RELATIVE_PATH
      )
    );
    decodeBundle(currentBundle);
    if (!arraysEqual(first.base.data, currentBase)) {
      fail(
        `${BASE_OUTPUT_RELATIVE_PATH}が現在のGLB/Profileからの` +
          `決定的ベイク結果と一致しません。`
      );
    }
    if (!arraysEqual(first.bundle, currentBundle)) {
      fail(
        `${BUNDLE_OUTPUT_RELATIVE_PATH}が現在のGLB/Profileからの` +
          `決定的ベイク結果と一致しません。`
      );
    }
  } else {
    await writeOutputFile(
      BASE_OUTPUT_PATH,
      first.base.data,
      BASE_OUTPUT_RELATIVE_PATH
    );
    await writeOutputFile(
      BUNDLE_OUTPUT_PATH,
      first.bundle,
      BUNDLE_OUTPUT_RELATIVE_PATH
    );
  }

  const report = {
    stageId: SCHOOL_ROOM_VARIANT_NAV_PROFILE.stageId,
    profileId: SCHOOL_ROOM_VARIANT_NAV_PROFILE.id,
    profileSha256: sha256(
      Buffer.from(
        stableStringify(SCHOOL_ROOM_VARIANT_NAV_PROFILE),
        "utf8"
      )
    ),
    mode: check ? "check" : "write",
    input: {
      path: INPUT_RELATIVE_PATH,
      bytes: glbData.byteLength,
      sha256: sha256(glbData),
      roomVariantMarkers: contract.variantMarkers.length,
      roomVariantTileVolumes: prepared.volumes.length,
      roomDoors: [...roomDoorsByRoom.values()].reduce(
        (sum, doors) => sum + doors.length,
        0
      )
    },
    outputs: {
      staticBase: {
        path: BASE_OUTPUT_RELATIVE_PATH,
        bytes: first.base.data.byteLength,
        sha256: sha256(first.base.data),
        tiles: first.staticTileCount,
        vertices: first.base.vertexCount,
        triangles: first.base.triangleCount
      },
      roomVariants: {
        path: BUNDLE_OUTPUT_RELATIVE_PATH,
        bytes: first.bundle.byteLength,
        sha256: sha256(first.bundle),
        format: {
          magic: "HSRVNAV\\0",
          version: BUNDLE_FORMAT_VERSION,
          headerBytes: BUNDLE_HEADER_BYTE_LENGTH,
          entries: first.bundleEntryCount
        }
      }
    },
    profile: SCHOOL_ROOM_VARIANT_NAV_PROFILE,
    validation: {
      commonTiles: first.commonTileCount,
      ownedTileCounts: first.ownedTileCounts,
      variantKeySetsMayDifferWithinRoom: true,
      variantKeyDifferences: first.variantKeyDifferences,
      discardedVariantTileReports:
        first.discardedVariantTileReports,
      variantKeyUnionOwnedBySingleRoom: true,
      exclusiveRoomOwnership: true,
      variantBakeUsesRoomPhysicalYBandStaticClippedFragments: true,
      variantBakeUsesMatchingStaticCommonBand: true,
      fixedGlobalBoundsAndParametersForBandLocalBake: true,
      staticCommonBandPartition:
        first.staticBandPartition,
      staticCommonBandReassembly: first.commonReassembly,
      staticCommonTriangleClipComplete:
        first.staticBandPartition.sourceTriangles ===
          first.staticBandPartition.processedSourceTriangles &&
        first.staticBandPartition.positiveAreaOverlap === 0 &&
        first.staticBandPartition.missingArea === 0 &&
        first.staticBandPartition.duplicateFragmentAssignments === 0 &&
        first.staticBandPartition.windingMismatchCount === 0,
      staticCommonTileKeysUnique:
        first.staticBandPartition.uniqueTileKeys ===
        first.commonTileCount,
      staticBaseExcludesOnlyOwnedPhysicalYBands: true,
      outsideOwnedRegionCanonicalStable: true,
      rawTileHeadersMatchManifest: true,
      staticBaseImportExportRoundTrip: true,
      roomStaticBoundaryBidirectional: true,
      roomStaticAllObservedCrossOwnerLinksHaveReverse: true,
      roomStaticNormalVariantPortalSetsMatch:
        first.connectivity.every(
          ({ normalRoomStaticPortalSetMatched }) =>
            normalRoomStaticPortalSetMatched === true
        ),
      roomStaticPortalSetComparisonCount:
        first.connectivity.filter(
          ({ normalRoomStaticPortalSetMatched }) =>
            normalRoomStaticPortalSetMatched === true
        ).length,
      roomVariantTileManifold: {
        volumeCount: prepared.volumes.length,
        boundaryEdges: prepared.volumes.reduce(
          (sum, { manifoldAudit }) =>
            sum + manifoldAudit.boundaryEdges,
          0
        ),
        nonManifoldEdges: prepared.volumes.reduce(
          (sum, { manifoldAudit }) =>
            sum + manifoldAudit.nonManifoldEdges,
          0
        ),
        inconsistentOrientationEdges:
          prepared.volumes.reduce(
            (sum, { manifoldAudit }) =>
              sum + manifoldAudit.inconsistentOrientationEdges,
            0
          ),
        connectedComponents: prepared.volumes.reduce(
          (sum, { manifoldAudit }) =>
            sum + manifoldAudit.connectedComponents,
          0
        ),
        volumes: prepared.volumes
          .map(({ roomId, manifoldAudit }) => ({
            roomId,
            ...manifoldAudit
          }))
          .sort((left, right) =>
            codeUnitCompare(left.roomId, right.roomId)
          )
      },
      navMeshParamsRawReleasedAfterInitialization: true,
      navMeshQueryFilterRawReleasedAfterQuery: true,
      roomVariantAssemblyCount: first.connectivity.length,
      roomVariantAssemblyPolicy:
        "target-room-selected-variant-other-19-rooms-normal",
      roomCenterProjectionPolicy: {
        horizontalSource: "fixed-room-bounds-table-center",
        heightSource: "room-door-root-floor",
        groundArea: GROUND_POLYGON_AREA,
        maximumHeightDelta:
          SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.walkableClimb *
          SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.ch,
        maximumHorizontalDistance:
          ROOM_CENTER_MAXIMUM_HORIZONTAL_PROJECTION_DISTANCE,
        equalDistanceTieBreak: "polygon-ref-ascending"
      },
      roomCenterProjectedToOwnedActiveNavmesh: true,
      roomCenterProjectionDistanceAndHeightReportedPerAssembly: true,
      roomDoorOutsideProjectedToStaticNavmesh: true,
      roomDoorOutsideToCenterReachable: true,
      disorderedRampProbePolicy: {
        edgeInsetDistance:
          SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.walkableRadius *
          SCHOOL_ROOM_VARIANT_NAV_PROFILE.parameters.cs,
        minimumProjectedHeightGain: RAMP_MINIMUM_HEIGHT_GAIN,
        maximumEndpointProjectionDistance:
          RAMP_ROUTE_PROJECTION_MAX_DISTANCE,
        requiredRouteSequence: "floor-to-low-to-high"
      },
      disorderedRampEndpointsProjectedToOwnedActiveNavmesh: true,
      disorderedFurnitureRampLowToHighReachable: true,
      disorderedRampAcceptanceCount:
        first.disorderedRampAcceptance.length,
      disorderedRampAcceptance:
        first.disorderedRampAcceptance,
      deterministicDoubleBake: true,
      generationStatistics: first.generationStatistics,
      connectivity: first.connectivity,
      variants: first.variantReports
    },
    bakeMilliseconds: Number((performance.now() - startedAt).toFixed(3))
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

export {
  BUNDLE_FORMAT_VERSION,
  BUNDLE_HEADER_BYTE_LENGTH,
  decodeBundle,
  encodeBundle,
  SCHOOL_ROOM_VARIANT_NAV_PROFILE
};

if (
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[学校room variant NavMeshベイク失敗] ${message}\n`
    );
    process.exitCode = 1;
  });
}
