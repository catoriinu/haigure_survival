import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  allocCompactHeightfield,
  allocContourSet,
  allocHeightfield,
  allocPolyMesh,
  allocPolyMeshDetail,
  buildCompactHeightfield,
  buildContours,
  buildDistanceField,
  buildPolyMesh,
  buildPolyMeshDetail,
  buildRegions,
  calcGridSize,
  createHeightfield,
  createNavMeshData,
  createRcConfig,
  erodeWalkableArea,
  exportNavMesh,
  filterLedgeSpans,
  filterWalkableLowHeightSpans,
  freeCompactHeightfield,
  freeContourSet,
  freeHeightfield,
  freePolyMesh,
  freePolyMeshDetail,
  getNavMeshPositionsAndIndices,
  importNavMesh,
  init,
  markWalkableTriangles,
  NavMesh,
  NavMeshCreateParams,
  NavMeshQuery,
  rasterizeTriangles,
  Recast,
  RecastBuildContext,
  TriangleAreasArray,
  TrianglesArray,
  VerticesArray
} from "recast-navigation";
import {
  getBoundingBox,
  soloNavMeshGeneratorConfigDefaults
} from "recast-navigation/generators";

import {
  assertArray,
  assertExactKeys,
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
const OUTPUT_RELATIVE_PATH =
  "public/stage-assets/v2/B02/b02_school_blockout.bit-flight.navmesh.bin";
const INPUT_PATH = resolve(REPOSITORY_ROOT, INPUT_RELATIVE_PATH);
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, OUTPUT_RELATIVE_PATH);

const BUNDLE_MAGIC = Uint8Array.of(
  0x48,
  0x53,
  0x42,
  0x46,
  0x4e,
  0x41,
  0x56,
  0x00
);
const BUNDLE_FORMAT_VERSION = 1;
const BUNDLE_HEADER_BYTE_LENGTH = 24;
const MAX_UINT32 = 0xffff_ffff;
const SPACE_KINDS = new Set(["indoor", "outdoor"]);
const BIT_NAV_NODE_PREFIX = "NAV_BitFlight_";

const BIT_FLIGHT_NAV_PROFILE = Object.freeze({
  id: "bit-flight-body-0.44-margin-0.10-v1",
  schemaVersion: 2,
  stageId: "school",
  coordinateSpace: "gltf-right-handed-y-up",
  worldScale: 0.25,
  physicalRadiusMeters: 0.44,
  safetyMarginMeters: 0.10,
  effectiveRadiusMeters: 0.54,
  generator: "solo-per-band",
  recastPackage: "recast-navigation",
  recastVersion: "0.43.1",
  parameters: Object.freeze({
    cs: 0.025,
    ch: 0.0125,
    walkableSlopeAngle: 45,
    walkableHeight: 26,
    walkableClimb: 0,
    walkableRadius: 6,
    maxEdgeLen: 12,
    maxSimplificationError: 1.3,
    minRegionArea: 8,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
    buildBvTree: true
  })
});

const assertProfileRadius = () => {
  if (
    BIT_FLIGHT_NAV_PROFILE.effectiveRadiusMeters !==
    BIT_FLIGHT_NAV_PROFILE.physicalRadiusMeters +
      BIT_FLIGHT_NAV_PROFILE.safetyMarginMeters
  ) {
    fail("ビット飛行Profileの有効半径が身体半径+安全余裕と一致しません。");
  }
  const effectiveRadiusWorld =
    BIT_FLIGHT_NAV_PROFILE.effectiveRadiusMeters *
    BIT_FLIGHT_NAV_PROFILE.worldScale;
  const erodedRadiusWorld =
    BIT_FLIGHT_NAV_PROFILE.parameters.walkableRadius *
    BIT_FLIGHT_NAV_PROFILE.parameters.cs;
  if (erodedRadiusWorld < effectiveRadiusWorld) {
    fail(
      `ビット飛行Recast半径が身体半径+安全余裕を満たしません: ` +
        `${erodedRadiusWorld} < ${effectiveRadiusWorld}`
    );
  }
  const availableHeightWorld =
    BIT_FLIGHT_NAV_PROFILE.parameters.walkableHeight *
    BIT_FLIGHT_NAV_PROFILE.parameters.ch;
  if (availableHeightWorld < effectiveRadiusWorld * 2) {
    fail("ビット飛行Recast高さが安全球の直径を満たしません。");
  }
};

const assertNonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label}には非空stringが必要です。`);
  }
  return value;
};

const assertFiniteNumber = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label}には有限numberが必要です。`);
  }
  return value;
};

const compareOpaqueIds = (left, right) => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

const bandKey = (zoneId, bandId) =>
  `${zoneId.length}:${zoneId}${bandId.length}:${bandId}`;

const arraysEqual = (left, right) =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const validateMetadata = (nodes) => {
  const metadataNodes = nodes.filter((node) => node.name === "META_Stage");
  if (metadataNodes.length !== 1) {
    fail(`META_Stageは1件必要です（実際=${metadataNodes.length}件）。`);
  }
  const metadata = metadataNodes[0];
  if (metadata.mesh !== undefined) {
    fail("META_StageはMeshを参照しないEmptyである必要があります。");
  }
  const extras = assertObject(metadata.extras, "META_Stage.extras");
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
  if (extras.hs_schema_version !== BIT_FLIGHT_NAV_PROFILE.schemaVersion) {
    fail(
      `META_Stage.hs_schema_versionが不一致です: ` +
        `${String(extras.hs_schema_version)} != ${BIT_FLIGHT_NAV_PROFILE.schemaVersion}`
    );
  }
  if (extras.hs_stage_id !== BIT_FLIGHT_NAV_PROFILE.stageId) {
    fail(
      `META_Stage.hs_stage_idが不一致です: ` +
        `${String(extras.hs_stage_id)} != ${BIT_FLIGHT_NAV_PROFILE.stageId}`
    );
  }
  assertNonEmptyString(extras.hs_nav_profile, "META_Stage.hs_nav_profile");
  if (extras.hs_bit_nav_profile !== BIT_FLIGHT_NAV_PROFILE.id) {
    fail(
      `META_Stage.hs_bit_nav_profileが不一致です: ` +
        `${String(extras.hs_bit_nav_profile)} != ${BIT_FLIGHT_NAV_PROFILE.id}`
    );
  }
};

const collectBandGroups = (nodes) => {
  const groupsByKey = new Map();
  nodes.forEach((node, nodeIndex) => {
    if (
      node.name.startsWith("NAV_") &&
      !node.name.startsWith(BIT_NAV_NODE_PREFIX)
    ) {
      const extras = assertObject(node.extras, `${node.name}.extras`);
      if (extras.hs_nav_set === "bit-flight") {
        fail(
          `hs_nav_set=bit-flightのObject名は${BIT_NAV_NODE_PREFIX}*である必要があります: ${node.name}`
        );
      }
    }
    if (!node.name.startsWith(BIT_NAV_NODE_PREFIX)) {
      return;
    }
    if (node.name.length === BIT_NAV_NODE_PREFIX.length) {
      fail(`${BIT_NAV_NODE_PREFIX}の後にObject識別名が必要です。`);
    }
    if (node.mesh === undefined) {
      fail(`${node.name}はMeshを参照する必要があります。`);
    }
    const extras = assertObject(node.extras, `${node.name}.extras`);
    assertExactKeys(
      extras,
      [
        "hs_nav_set",
        "hs_zone_id",
        "hs_band_id",
        "hs_space_kind",
        "hs_center_height_min_m",
        "hs_center_height_max_m",
        "hs_nav_role"
      ],
      `${node.name}.extras`
    );
    if (extras.hs_nav_set !== "bit-flight") {
      fail(`${node.name}.hs_nav_setはbit-flightである必要があります。`);
    }
    if (
      extras.hs_nav_role !== "walkable" &&
      extras.hs_nav_role !== "blocker"
    ) {
      fail(`${node.name}.hs_nav_roleがwalkable/blockerではありません。`);
    }
    const zoneId = assertNonEmptyString(
      extras.hs_zone_id,
      `${node.name}.hs_zone_id`
    );
    const bandId = assertNonEmptyString(
      extras.hs_band_id,
      `${node.name}.hs_band_id`
    );
    const spaceKind = assertNonEmptyString(
      extras.hs_space_kind,
      `${node.name}.hs_space_kind`
    );
    if (!SPACE_KINDS.has(spaceKind)) {
      fail(`${node.name}.hs_space_kindがindoor/outdoorではありません。`);
    }
    const minimumCenterHeight = assertFiniteNumber(
      extras.hs_center_height_min_m,
      `${node.name}.hs_center_height_min_m`
    );
    const maximumCenterHeight = assertFiniteNumber(
      extras.hs_center_height_max_m,
      `${node.name}.hs_center_height_max_m`
    );
    if (minimumCenterHeight > maximumCenterHeight) {
      fail(`${node.name}の中心高度範囲が逆転しています。`);
    }

    const key = bandKey(zoneId, bandId);
    const group = groupsByKey.get(key);
    if (group !== undefined) {
      if (
        group.zoneId !== zoneId ||
        group.bandId !== bandId ||
        group.spaceKind !== spaceKind ||
        group.minimumCenterHeight !== minimumCenterHeight ||
        group.maximumCenterHeight !== maximumCenterHeight
      ) {
        fail(
          `同じzoneId/bandIdの飛行帯metadataが一致しません: ` +
            `zoneId=${JSON.stringify(zoneId)}, bandId=${JSON.stringify(bandId)}`
        );
      }
      group.navigationNodes.push({
        node,
        nodeIndex,
        role: extras.hs_nav_role
      });
      return;
    }
    groupsByKey.set(key, {
      zoneId,
      bandId,
      spaceKind,
      minimumCenterHeight,
      maximumCenterHeight,
      navigationNodes: [{ node, nodeIndex, role: extras.hs_nav_role }]
    });
  });

  if (groupsByKey.size === 0) {
    fail(`${BIT_NAV_NODE_PREFIX}* Meshがありません。`);
  }

  const groups = [...groupsByKey.values()].sort(
    (left, right) =>
      compareOpaqueIds(left.zoneId, right.zoneId) ||
      compareOpaqueIds(left.bandId, right.bandId)
  );
  const seenNodeNames = new Set();
  for (const group of groups) {
    if (!group.navigationNodes.some(({ role }) => role === "walkable")) {
      fail(
        `飛行帯にwalkable sourceがありません: ` +
          `${JSON.stringify(group.zoneId)}/${JSON.stringify(group.bandId)}`
      );
    }
    for (const { node } of group.navigationNodes) {
      if (seenNodeNames.has(node.name)) {
        fail(`ビット飛行NavMesh sourceが重複しています: ${node.name}`);
      }
      seenNodeNames.add(node.name);
    }
  }
  return groups;
};

const encodeBundle = (entries) => {
  if (entries.length === 0) {
    fail("ビット飛行NavMesh bundleには1個以上のentryが必要です。");
  }
  let payloadLength = 0;
  const manifestEntries = entries.map((entry) => {
    if (entry.data.byteLength === 0) {
      fail(
        `空のビット飛行NavMesh payloadです: ` +
          `${JSON.stringify(entry.zoneId)}/${JSON.stringify(entry.bandId)}`
      );
    }
    const offset = payloadLength;
    payloadLength += entry.data.byteLength;
    if (payloadLength > MAX_UINT32) {
      fail("ビット飛行NavMesh bundle payloadがuint32上限を超えています。");
    }
    return {
      zoneId: entry.zoneId,
      bandId: entry.bandId,
      offset,
      length: entry.data.byteLength
    };
  });
  const manifestBytes = new TextEncoder().encode(
    JSON.stringify({ entries: manifestEntries })
  );
  if (manifestBytes.byteLength > MAX_UINT32) {
    fail("ビット飛行NavMesh bundle manifestがuint32上限を超えています。");
  }
  const bundle = new Uint8Array(
    BUNDLE_HEADER_BYTE_LENGTH + manifestBytes.byteLength + payloadLength
  );
  bundle.set(BUNDLE_MAGIC, 0);
  const header = new DataView(bundle.buffer);
  header.setUint16(8, BUNDLE_FORMAT_VERSION, true);
  header.setUint16(10, BUNDLE_HEADER_BYTE_LENGTH, true);
  header.setUint32(12, manifestBytes.byteLength, true);
  header.setUint32(16, payloadLength, true);
  header.setUint32(20, entries.length, true);
  bundle.set(manifestBytes, BUNDLE_HEADER_BYTE_LENGTH);
  const payloadStart = BUNDLE_HEADER_BYTE_LENGTH + manifestBytes.byteLength;
  entries.forEach((entry, index) => {
    bundle.set(entry.data, payloadStart + manifestEntries[index].offset);
  });
  return bundle;
};

const decodeBundleManifest = (bundle) => {
  if (bundle.byteLength < BUNDLE_HEADER_BYTE_LENGTH) {
    fail("ビット飛行NavMesh bundleが固定headerより短いです。");
  }
  BUNDLE_MAGIC.forEach((value, index) => {
    if (bundle[index] !== value) {
      fail("ビット飛行NavMesh bundleのmagicが一致しません。");
    }
  });
  const header = new DataView(
    bundle.buffer,
    bundle.byteOffset,
    bundle.byteLength
  );
  if (header.getUint16(8, true) !== BUNDLE_FORMAT_VERSION) {
    fail("ビット飛行NavMesh bundle versionが一致しません。");
  }
  if (header.getUint16(10, true) !== BUNDLE_HEADER_BYTE_LENGTH) {
    fail("ビット飛行NavMesh bundle header長が一致しません。");
  }
  const manifestLength = header.getUint32(12, true);
  const payloadLength = header.getUint32(16, true);
  const entryCount = header.getUint32(20, true);
  if (
    BUNDLE_HEADER_BYTE_LENGTH + manifestLength + payloadLength !==
    bundle.byteLength
  ) {
    fail("ビット飛行NavMesh bundle全体長が一致しません。");
  }
  const manifestText = new TextDecoder("utf-8", { fatal: true }).decode(
    bundle.subarray(
      BUNDLE_HEADER_BYTE_LENGTH,
      BUNDLE_HEADER_BYTE_LENGTH + manifestLength
    )
  );
  const manifest = assertObject(
    JSON.parse(manifestText),
    "bit flight bundle manifest"
  );
  assertExactKeys(manifest, ["entries"], "bit flight bundle manifest");
  const manifestEntries = assertArray(
    manifest.entries,
    "bit flight bundle manifest.entries"
  );
  if (manifestEntries.length !== entryCount || entryCount === 0) {
    fail("ビット飛行NavMesh bundle entry件数が一致しません。");
  }
  let expectedOffset = 0;
  const keys = new Set();
  const entries = manifestEntries.map((entryValue, index) => {
    const entry = assertObject(
      entryValue,
      `bit flight bundle manifest.entries[${index}]`
    );
    assertExactKeys(
      entry,
      ["zoneId", "bandId", "offset", "length"],
      `bit flight bundle manifest.entries[${index}]`
    );
    const zoneId = assertNonEmptyString(entry.zoneId, `entry[${index}].zoneId`);
    const bandId = assertNonEmptyString(entry.bandId, `entry[${index}].bandId`);
    if (
      !Number.isInteger(entry.offset) ||
      !Number.isInteger(entry.length) ||
      entry.offset !== expectedOffset ||
      entry.length <= 0
    ) {
      fail(`ビット飛行NavMesh bundle entry[${index}]の範囲が不正です。`);
    }
    const key = bandKey(zoneId, bandId);
    if (keys.has(key)) {
      fail(
        `ビット飛行NavMesh bundle entryが重複しています: ` +
          `${JSON.stringify(zoneId)}/${JSON.stringify(bandId)}`
      );
    }
    keys.add(key);
    expectedOffset += entry.length;
    if (expectedOffset > payloadLength) {
      fail(`ビット飛行NavMesh bundle entry[${index}]がpayloadを超えています。`);
    }
    return { zoneId, bandId, offset: entry.offset, length: entry.length };
  });
  if (expectedOffset !== payloadLength) {
    fail("ビット飛行NavMesh bundleに未参照payloadがあります。");
  }
  return entries;
};

const assertBundleMatchesGroups = (bundle, groups) => {
  const manifestEntries = decodeBundleManifest(bundle);
  if (manifestEntries.length !== groups.length) {
    fail(
      `GLB飛行帯とbundle目録の件数が一致しません: ` +
        `${groups.length} != ${manifestEntries.length}`
    );
  }
  groups.forEach((group, index) => {
    const entry = manifestEntries[index];
    if (entry.zoneId !== group.zoneId || entry.bandId !== group.bandId) {
      fail(
        `GLB飛行帯とbundle目録が一致しません: index=${index}, ` +
          `GLB=${JSON.stringify([group.zoneId, group.bandId])}, ` +
          `bundle=${JSON.stringify([entry.zoneId, entry.bandId])}`
      );
    }
  });
  return manifestEntries;
};

const mergeBandGeometry = (
  walkableGeometry,
  blockerGeometry
) => {
  const positions = [
    ...walkableGeometry.positions,
    ...blockerGeometry.positions
  ];
  const blockerVertexOffset = walkableGeometry.positions.length / 3;
  const indices = [
    ...walkableGeometry.indices,
    ...blockerGeometry.indices.map(
      (index) => index + blockerVertexOffset
    )
  ];
  return {
    positions,
    indices,
    walkableTriangleCount: walkableGeometry.indices.length / 3,
    blockerTriangleCount: blockerGeometry.indices.length / 3
  };
};

const generateRoleAwareSoloNavMesh = (
  geometry,
  navMeshGeneratorConfig
) => {
  const buildContext = new RecastBuildContext();
  const config = {
    ...soloNavMeshGeneratorConfigDefaults,
    ...navMeshGeneratorConfig
  };
  const rcConfig = createRcConfig(config);
  rcConfig.minRegionArea *= rcConfig.minRegionArea;
  rcConfig.mergeRegionArea *= rcConfig.mergeRegionArea;
  rcConfig.detailSampleDist =
    rcConfig.detailSampleDist < 0.9
      ? 0
      : rcConfig.cs * rcConfig.detailSampleDist;
  rcConfig.detailSampleMaxError *= rcConfig.ch;

  const { bbMin, bbMax } = getBoundingBox(
    geometry.positions,
    geometry.indices
  );
  const gridSize = calcGridSize(bbMin, bbMax, rcConfig.cs);
  rcConfig.width = gridSize.width;
  rcConfig.height = gridSize.height;

  const verticesArray = new VerticesArray();
  const trianglesArray = new TrianglesArray();
  const walkableTrianglesArray = new TrianglesArray();
  const triangleAreasArray = new TriangleAreasArray();
  let heightfield = null;
  let compactHeightfield = null;
  let contourSet = null;
  let polyMesh = null;
  let polyMeshDetail = null;
  let navMesh = null;
  try {
    verticesArray.copy(geometry.positions);
    trianglesArray.copy(geometry.indices);
    const walkableIndexCount = geometry.walkableTriangleCount * 3;
    walkableTrianglesArray.copy(
      geometry.indices.slice(0, walkableIndexCount)
    );
    triangleAreasArray.resize(
      geometry.walkableTriangleCount + geometry.blockerTriangleCount
    );

    heightfield = allocHeightfield();
    if (
      !createHeightfield(
        buildContext,
        heightfield,
        rcConfig.width,
        rcConfig.height,
        bbMin,
        bbMax,
        rcConfig.cs,
        rcConfig.ch
      )
    ) {
      fail("ビット飛行NavMesh heightfieldを作成できませんでした。");
    }
    markWalkableTriangles(
      buildContext,
      rcConfig.walkableSlopeAngle,
      verticesArray,
      geometry.positions.length / 3,
      walkableTrianglesArray,
      geometry.walkableTriangleCount,
      triangleAreasArray
    );
    for (
      let triangleIndex = geometry.walkableTriangleCount;
      triangleIndex <
      geometry.walkableTriangleCount + geometry.blockerTriangleCount;
      triangleIndex += 1
    ) {
      if (triangleAreasArray.get(triangleIndex) !== Recast.RC_NULL_AREA) {
        fail("blocker triangleがRC_NULL_AREAではありません。");
      }
    }
    if (
      !rasterizeTriangles(
        buildContext,
        verticesArray,
        geometry.positions.length / 3,
        trianglesArray,
        triangleAreasArray,
        geometry.walkableTriangleCount + geometry.blockerTriangleCount,
        heightfield,
        rcConfig.walkableClimb
      )
    ) {
      fail("ビット飛行NavMesh triangleをrasterizeできませんでした。");
    }

    filterLedgeSpans(
      buildContext,
      rcConfig.walkableHeight,
      rcConfig.walkableClimb,
      heightfield
    );
    filterWalkableLowHeightSpans(
      buildContext,
      rcConfig.walkableHeight,
      heightfield
    );

    compactHeightfield = allocCompactHeightfield();
    if (
      !buildCompactHeightfield(
        buildContext,
        rcConfig.walkableHeight,
        rcConfig.walkableClimb,
        heightfield,
        compactHeightfield
      )
    ) {
      fail("ビット飛行NavMesh compact heightfieldを作成できませんでした。");
    }
    freeHeightfield(heightfield);
    heightfield = null;
    if (
      !erodeWalkableArea(
        buildContext,
        rcConfig.walkableRadius,
        compactHeightfield
      )
    ) {
      fail("ビット飛行NavMeshの安全半径erosionに失敗しました。");
    }
    if (!buildDistanceField(buildContext, compactHeightfield)) {
      fail("ビット飛行NavMesh distance fieldを作成できませんでした。");
    }
    if (
      !buildRegions(
        buildContext,
        compactHeightfield,
        rcConfig.borderSize,
        rcConfig.minRegionArea,
        rcConfig.mergeRegionArea
      )
    ) {
      fail("ビット飛行NavMesh regionを作成できませんでした。");
    }

    contourSet = allocContourSet();
    if (
      !buildContours(
        buildContext,
        compactHeightfield,
        rcConfig.maxSimplificationError,
        rcConfig.maxEdgeLen,
        contourSet,
        Recast.RC_CONTOUR_TESS_WALL_EDGES
      )
    ) {
      fail("ビット飛行NavMesh contourを作成できませんでした。");
    }
    polyMesh = allocPolyMesh();
    if (
      !buildPolyMesh(
        buildContext,
        contourSet,
        rcConfig.maxVertsPerPoly,
        polyMesh
      )
    ) {
      fail("ビット飛行NavMesh polygon meshを作成できませんでした。");
    }
    polyMeshDetail = allocPolyMeshDetail();
    if (
      !buildPolyMeshDetail(
        buildContext,
        polyMesh,
        compactHeightfield,
        rcConfig.detailSampleDist,
        rcConfig.detailSampleMaxError,
        polyMeshDetail
      )
    ) {
      fail("ビット飛行NavMesh detail meshを作成できませんでした。");
    }

    for (let polygonIndex = 0; polygonIndex < polyMesh.npolys(); polygonIndex += 1) {
      if (polyMesh.areas(polygonIndex) === Recast.RC_WALKABLE_AREA) {
        polyMesh.setAreas(polygonIndex, 0);
      }
      if (polyMesh.areas(polygonIndex) === 0) {
        polyMesh.setFlags(polygonIndex, 1);
      }
    }

    const createParams = new NavMeshCreateParams();
    createParams.setPolyMeshCreateParams(polyMesh);
    createParams.setPolyMeshDetailCreateParams(polyMeshDetail);
    createParams.setWalkableHeight(
      rcConfig.walkableHeight * rcConfig.ch
    );
    createParams.setWalkableRadius(
      rcConfig.walkableRadius * rcConfig.cs
    );
    createParams.setWalkableClimb(
      rcConfig.walkableClimb * rcConfig.ch
    );
    createParams.setCellSize(rcConfig.cs);
    createParams.setCellHeight(rcConfig.ch);
    createParams.setBuildBvTree(config.buildBvTree);
    const created = createNavMeshData(createParams);
    if (!created.success) {
      fail("ビット飛行Detour NavMesh dataを作成できませんでした。");
    }
    navMesh = new NavMesh();
    if (!navMesh.initSolo(created.navMeshData)) {
      created.navMeshData.destroy();
      fail("ビット飛行Solo NavMeshを初期化できませんでした。");
    }
    return navMesh;
  } catch (error) {
    navMesh?.destroy();
    throw error;
  } finally {
    verticesArray.destroy();
    trianglesArray.destroy();
    walkableTrianglesArray.destroy();
    triangleAreasArray.destroy();
    if (heightfield !== null) {
      freeHeightfield(heightfield);
    }
    if (compactHeightfield !== null) {
      freeCompactHeightfield(compactHeightfield);
    }
    if (contourSet !== null) {
      freeContourSet(contourSet);
    }
    if (polyMesh !== null) {
      freePolyMesh(polyMesh);
    }
    if (polyMeshDetail !== null) {
      freePolyMeshDetail(polyMeshDetail);
    }
  }
};

const validateBlockerTopExclusion = (
  navMesh,
  blockerGeometry
) => {
  if (blockerGeometry.indices.length === 0) {
    return { horizontalSampleCount: 0 };
  }
  const samplesByKey = new Map();
  for (
    let indexOffset = 0;
    indexOffset < blockerGeometry.indices.length;
    indexOffset += 3
  ) {
    const indices = blockerGeometry.indices.slice(indexOffset, indexOffset + 3);
    const points = indices.map((vertexIndex) => ({
      x: blockerGeometry.positions[vertexIndex * 3],
      y: blockerGeometry.positions[vertexIndex * 3 + 1],
      z: blockerGeometry.positions[vertexIndex * 3 + 2]
    }));
    const edgeA = {
      x: points[1].x - points[0].x,
      y: points[1].y - points[0].y,
      z: points[1].z - points[0].z
    };
    const edgeB = {
      x: points[2].x - points[0].x,
      y: points[2].y - points[0].y,
      z: points[2].z - points[0].z
    };
    const normal = {
      x: edgeA.y * edgeB.z - edgeA.z * edgeB.y,
      y: edgeA.z * edgeB.x - edgeA.x * edgeB.z,
      z: edgeA.x * edgeB.y - edgeA.y * edgeB.x
    };
    const normalLength = Math.hypot(normal.x, normal.y, normal.z);
    if (normalLength === 0 || Math.abs(normal.y) / normalLength < 0.9) {
      continue;
    }
    const centroid = {
      x: (points[0].x + points[1].x + points[2].x) / 3,
      y: (points[0].y + points[1].y + points[2].y) / 3,
      z: (points[0].z + points[1].z + points[2].z) / 3
    };
    const key = [centroid.x, centroid.y, centroid.z]
      .map((value) => value.toFixed(6))
      .join("/");
    samplesByKey.set(key, centroid);
  }
  if (samplesByKey.size === 0) {
    fail("blocker sourceに水平面sampleがありません。");
  }

  const query = new NavMeshQuery(navMesh);
  try {
    const halfExtents = {
      x: BIT_FLIGHT_NAV_PROFILE.parameters.cs / 2,
      y:
        BIT_FLIGHT_NAV_PROFILE.parameters.walkableHeight *
        BIT_FLIGHT_NAV_PROFILE.parameters.ch,
      z: BIT_FLIGHT_NAV_PROFILE.parameters.cs / 2
    };
    for (const sample of samplesByKey.values()) {
      const result = query.findNearestPoly(sample, { halfExtents });
      if (
        result.success &&
        result.nearestRef !== 0 &&
        result.isOverPoly
      ) {
        fail(
          `blocker水平面上にwalkable polygonが残っています: ` +
            `${JSON.stringify(sample)}`
        );
      }
    }
    return { horizontalSampleCount: samplesByKey.size };
  } finally {
    query.destroy();
  }
};

const bakeBand = (gltf, binary, worldMatrices, group) => {
  const walkableNodes = group.navigationNodes.filter(
    ({ role }) => role === "walkable"
  );
  const blockerNodes = group.navigationNodes.filter(
    ({ role }) => role === "blocker"
  );
  const walkableGeometry = extractNavigationGeometry(
    gltf,
    binary,
    worldMatrices,
    walkableNodes
  );
  const blockerGeometry =
    blockerNodes.length === 0
      ? {
          positions: [],
          indices: []
        }
      : extractNavigationGeometry(
          gltf,
          binary,
          worldMatrices,
          blockerNodes
        );
  const geometry = mergeBandGeometry(
    walkableGeometry,
    blockerGeometry
  );
  const bakeOnce = () => {
    const navMesh = generateRoleAwareSoloNavMesh(
      geometry,
      BIT_FLIGHT_NAV_PROFILE.parameters
    );
    return navMesh;
  };

  const first = bakeOnce();
  const second = bakeOnce();
  let restored = null;
  try {
    const firstData = exportNavMesh(first);
    const secondData = exportNavMesh(second);
    if (!arraysEqual(firstData, secondData)) {
      fail(
        `同一入力を2回ベイクしたNavMesh binaryが一致しません: ` +
          `${JSON.stringify(group.zoneId)}/${JSON.stringify(group.bandId)}`
      );
    }
    if (firstData.byteLength === 0) {
      fail(
        `exportNavMesh()が空です: ` +
          `${JSON.stringify(group.zoneId)}/${JSON.stringify(group.bandId)}`
      );
    }
    restored = importNavMesh(firstData).navMesh;
    const restoredData = exportNavMesh(restored);
    if (!arraysEqual(firstData, restoredData)) {
      fail(
        `NavMeshのimport/export結果が一致しません: ` +
          `${JSON.stringify(group.zoneId)}/${JSON.stringify(group.bandId)}`
      );
    }
    const [positions, indices] = getNavMeshPositionsAndIndices(restored);
    if (positions.length === 0 || indices.length === 0) {
      fail(
        `復元したNavMeshにpolygon geometryがありません: ` +
          `${JSON.stringify(group.zoneId)}/${JSON.stringify(group.bandId)}`
      );
    }
    const blockerExclusion = validateBlockerTopExclusion(
      restored,
      blockerGeometry
    );
    return {
      entry: {
        zoneId: group.zoneId,
        bandId: group.bandId,
        data: firstData
      },
      report: {
        zoneId: group.zoneId,
        bandId: group.bandId,
        spaceKind: group.spaceKind,
        minimumCenterHeightMeters: group.minimumCenterHeight,
        maximumCenterHeightMeters: group.maximumCenterHeight,
        sources: group.navigationNodes.map(({ node }) => node.name),
        walkableSourceCount: walkableNodes.length,
        blockerSourceCount: blockerNodes.length,
        sourceVertices: geometry.positions.length / 3,
        walkableSourceTriangles: geometry.walkableTriangleCount,
        blockerSourceTriangles: geometry.blockerTriangleCount,
        blockerExclusion,
        navVertices: positions.length / 3,
        navTriangles: indices.length / 3,
        bytes: firstData.byteLength,
        sha256: sha256(firstData)
      }
    };
  } finally {
    restored?.destroy();
    second.destroy();
    first.destroy();
  }
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

const main = async () => {
  const { check } = parseArguments();
  assertProfileRadius();
  await assertInstalledRecastVersion();
  const glbData = await readFile(INPUT_PATH);
  const { gltf, binary } = parseGlb(glbData);
  const { nodes, worldMatrices } = buildSceneGraph(gltf);
  validateMetadata(nodes);
  const groups = collectBandGroups(nodes);

  await init();
  const startedAt = performance.now();
  const bakedBands = groups.map((group) =>
    bakeBand(gltf, binary, worldMatrices, group)
  );
  const bundle = encodeBundle(bakedBands.map(({ entry }) => entry));
  const manifestEntries = assertBundleMatchesGroups(bundle, groups);

  if (check) {
    const current = new Uint8Array(await readFile(OUTPUT_PATH));
    assertBundleMatchesGroups(current, groups);
    if (!arraysEqual(bundle, current)) {
      fail(
        `${OUTPUT_RELATIVE_PATH}が現在のGLB/Profileからの決定的ベイク結果と一致しません。`
      );
    }
  } else {
    await writeFile(OUTPUT_PATH, bundle);
  }

  const profileText = stableStringify(BIT_FLIGHT_NAV_PROFILE);
  const report = {
    stageId: BIT_FLIGHT_NAV_PROFILE.stageId,
    profileId: BIT_FLIGHT_NAV_PROFILE.id,
    profileSha256: createHash("sha256")
      .update(Buffer.from(profileText, "utf8"))
      .digest("hex"),
    mode: check ? "check" : "write",
    input: {
      path: INPUT_RELATIVE_PATH,
      bytes: glbData.byteLength,
      sha256: sha256(glbData),
      bitFlightBandCount: groups.length
    },
    output: {
      path: OUTPUT_RELATIVE_PATH,
      bytes: bundle.byteLength,
      sha256: sha256(bundle),
      format: {
        magic: "HSBFNAV\\0",
        version: BUNDLE_FORMAT_VERSION,
        headerBytes: BUNDLE_HEADER_BYTE_LENGTH,
        entryCount: manifestEntries.length
      }
    },
    profile: BIT_FLIGHT_NAV_PROFILE,
    validation: {
      glbBandSetEqualsBundleManifest: true,
      duplicateOrEmptyBandRejected: true,
      importExportRoundTrip: true,
      deterministicDoubleBake: true,
      bands: bakedBands.map(({ report: bandReport }) => bandReport)
    },
    bakeMilliseconds: Number((performance.now() - startedAt).toFixed(3))
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

export {
  BIT_FLIGHT_NAV_PROFILE,
  encodeBundle,
  generateRoleAwareSoloNavMesh
};

if (
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[学校ビット飛行NavMeshベイク失敗] ${message}\n`);
    process.exitCode = 1;
  });
}
