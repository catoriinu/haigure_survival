import {
  Detour,
  importNavMesh,
  NavMesh,
  NavMeshParams,
  Raw,
  UnsignedCharArray,
  statusFailed,
  statusToReadableString
} from "recast-navigation";

import { initializeNavigationRuntime } from "./navigationWorld";

export const HUMAN_NAV_TILE_BUNDLE_SCHEMA_VERSION = 1;
export const HUMAN_NAV_TILE_BUNDLE_RECAST_VERSION = "0.43.1";
export const HUMAN_NAV_TILE_BINARY_FORMAT_VERSION = 1;

const HUMAN_NAV_TILE_BINARY_HEADER_LENGTH = 24;
const HUMAN_NAV_TILE_BINARY_MAGIC = Object.freeze([
  0x48,
  0x53,
  0x52,
  0x56,
  0x4e,
  0x41,
  0x56,
  0x00
]);
const STATIC_NAVMESH_BINARY_HEADER_LENGTH = 40;
const STATIC_NAVMESH_BINARY_MAGIC = Object.freeze([
  0x54,
  0x45,
  0x53,
  0x4d
]);
const STATIC_NAVMESH_BINARY_VERSION = 1;
const UINT32_MAX = 0xffff_ffff;

export type HumanNavTileVariant = "normal" | "disordered";

export type HumanNavTileCoordinate = Readonly<{
  x: number;
  y: number;
  layer: number;
}>;

export type HumanNavTileParameters = Readonly<{
  origin: Readonly<{
    x: number;
    y: number;
    z: number;
  }>;
  tileWidth: number;
  tileHeight: number;
  maxTiles: number;
  maxPolys: number;
}>;

export type HumanNavTilePayload = Readonly<{
  coordinate: HumanNavTileCoordinate;
  data: Uint8Array;
}>;

export type HumanNavTileSet = Readonly<{
  parameters: HumanNavTileParameters;
  tiles: readonly HumanNavTilePayload[];
}>;

export type HumanNavRoomTileVariants = Readonly<{
  roomId: string;
  normal: HumanNavTileSet;
  disordered: HumanNavTileSet;
}>;

export type HumanNavTileBundle = Readonly<{
  schemaVersion: typeof HUMAN_NAV_TILE_BUNDLE_SCHEMA_VERSION;
  recastVersion: typeof HUMAN_NAV_TILE_BUNDLE_RECAST_VERSION;
  navProfileId: string;
  parameters: HumanNavTileParameters;
  common: HumanNavTileSet;
  rooms: readonly HumanNavRoomTileVariants[];
}>;

export type HumanNavRoomVariantSelection = Readonly<{
  roomId: string;
  variant: HumanNavTileVariant;
}>;

export type HumanNavTileAssembly = Readonly<{
  navMesh: NavMesh;
  selectedVariants: readonly HumanNavRoomVariantSelection[];
  tileCount: number;
}>;

type HumanNavTileBinaryEntry = Readonly<{
  roomId: string;
  variantId: HumanNavTileVariant;
  tileX: number;
  tileY: number;
  layer: number;
  offset: number;
  length: number;
}>;

type HumanNavTileBinaryManifest = Readonly<{
  stageId: string;
  navProfileId: string;
  navMeshParams: Readonly<{
    origin: readonly [number, number, number];
    tileWidth: number;
    tileHeight: number;
    maxTiles: number;
    maxPolys: number;
  }>;
  entries: readonly HumanNavTileBinaryEntry[];
}>;

const assertFiniteNumber = (name: string, value: number) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${name}には有限値が必要です。`);
  }
};

const assertPositiveFiniteNumber = (name: string, value: number) => {
  assertFiniteNumber(name, value);
  if (value <= 0) {
    throw new Error(`${name}には正の値が必要です。`);
  }
};

const assertPositiveInteger = (name: string, value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}には正の整数が必要です。`);
  }
};

const assertParameters = (
  name: string,
  parameters: HumanNavTileParameters
) => {
  assertFiniteNumber(`${name}.origin.x`, parameters.origin.x);
  assertFiniteNumber(`${name}.origin.y`, parameters.origin.y);
  assertFiniteNumber(`${name}.origin.z`, parameters.origin.z);
  assertPositiveFiniteNumber(`${name}.tileWidth`, parameters.tileWidth);
  assertPositiveFiniteNumber(`${name}.tileHeight`, parameters.tileHeight);
  assertPositiveInteger(`${name}.maxTiles`, parameters.maxTiles);
  assertPositiveInteger(`${name}.maxPolys`, parameters.maxPolys);
};

const parametersEqual = (
  left: HumanNavTileParameters,
  right: HumanNavTileParameters
) =>
  Math.fround(left.origin.x) === Math.fround(right.origin.x) &&
  Math.fround(left.origin.y) === Math.fround(right.origin.y) &&
  Math.fround(left.origin.z) === Math.fround(right.origin.z) &&
  Math.fround(left.tileWidth) === Math.fround(right.tileWidth) &&
  Math.fround(left.tileHeight) === Math.fround(right.tileHeight) &&
  left.maxTiles === right.maxTiles &&
  left.maxPolys === right.maxPolys;

const assertParametersMatch = (
  name: string,
  actual: HumanNavTileParameters,
  expected: HumanNavTileParameters
) => {
  assertParameters(name, actual);
  if (!parametersEqual(actual, expected)) {
    throw new Error(`${name}のNavMesh parametersがbundleと一致しません。`);
  }
};

const assertOpaqueId = (name: string, value: string) => {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name}には前後空白のない非空文字列が必要です。`);
  }
};

const assertCoordinate = (
  name: string,
  coordinate: HumanNavTileCoordinate
) => {
  if (
    !Number.isInteger(coordinate.x) ||
    !Number.isInteger(coordinate.y) ||
    !Number.isInteger(coordinate.layer)
  ) {
    throw new Error(`${name}のtile座標には整数が必要です。`);
  }
};

const coordinateKey = (coordinate: HumanNavTileCoordinate) =>
  `${coordinate.x}:${coordinate.y}:${coordinate.layer}`;

const validateTileSet = (
  name: string,
  tileSet: HumanNavTileSet,
  expectedParameters: HumanNavTileParameters
) => {
  assertParametersMatch(
    `${name}.parameters`,
    tileSet.parameters,
    expectedParameters
  );
  if (tileSet.tiles.length === 0) {
    throw new Error(`${name}にNavMesh tileがありません。`);
  }

  const coordinates = new Set<string>();
  tileSet.tiles.forEach((tile, tileIndex) => {
    assertCoordinate(
      `${name}.tiles[${tileIndex}]`,
      tile.coordinate
    );
    if (!(tile.data instanceof Uint8Array) || tile.data.byteLength === 0) {
      throw new Error(`${name}.tiles[${tileIndex}]のpayloadが空です。`);
    }
    const key = coordinateKey(tile.coordinate);
    if (coordinates.has(key)) {
      throw new Error(`${name}内でtile座標が重複しています: ${key}`);
    }
    coordinates.add(key);
  });
  return coordinates;
};

const validateBundle = (bundle: HumanNavTileBundle) => {
  if (bundle.schemaVersion !== HUMAN_NAV_TILE_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `人間用NavMesh tile bundle schemaが不一致です: ${bundle.schemaVersion}`
    );
  }
  if (bundle.recastVersion !== HUMAN_NAV_TILE_BUNDLE_RECAST_VERSION) {
    throw new Error(
      `人間用NavMesh tile bundleのRecast版が不一致です: ${bundle.recastVersion}`
    );
  }
  assertOpaqueId("navProfileId", bundle.navProfileId);
  assertParameters("bundle.parameters", bundle.parameters);

  const commonCoordinates = validateTileSet(
    "bundle.common",
    bundle.common,
    bundle.parameters
  );
  const coordinateOwners = new Map(
    [...commonCoordinates].map((coordinate) => [coordinate, "common"])
  );
  const roomIds = new Set<string>();

  bundle.rooms.forEach((room, roomIndex) => {
    assertOpaqueId(`bundle.rooms[${roomIndex}].roomId`, room.roomId);
    if (roomIds.has(room.roomId)) {
      throw new Error(`部屋IDが重複しています: ${room.roomId}`);
    }
    roomIds.add(room.roomId);

    const normalCoordinates = validateTileSet(
      `bundle.rooms[${roomIndex}].normal`,
      room.normal,
      bundle.parameters
    );
    const disorderedCoordinates = validateTileSet(
      `bundle.rooms[${roomIndex}].disordered`,
      room.disordered,
      bundle.parameters
    );
    const ownedCoordinates = new Set([
      ...normalCoordinates,
      ...disorderedCoordinates
    ]);
    ownedCoordinates.forEach((coordinate) => {
      const existingOwner = coordinateOwners.get(coordinate);
      if (existingOwner) {
        throw new Error(
          `NavMesh tile座標 ${coordinate} を${existingOwner}と${room.roomId}が重複所有しています。`
        );
      }
      coordinateOwners.set(coordinate, room.roomId);
    });
  });
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertJsonObject = (
  value: unknown,
  label: string
): Record<string, unknown> => {
  if (!isJsonObject(value)) {
    throw new Error(`${label}にはobjectが必要です。`);
  }
  return value;
};

const assertExactJsonKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string
) => {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      `${label}のkey集合が不正です: expected=${expected.join(",")}, actual=${actual.join(",")}`
    );
  }
};

const decodeStaticNavmeshParameters = (
  data: Uint8Array
): Readonly<{
  parameters: HumanNavTileParameters;
  tileCount: number;
}> => {
  if (data.byteLength < STATIC_NAVMESH_BINARY_HEADER_LENGTH) {
    throw new Error("静的人間用NavMeshバイナリがheaderより短いです。");
  }
  const invalidMagicIndex = STATIC_NAVMESH_BINARY_MAGIC.findIndex(
    (expected, index) => data[index] !== expected
  );
  if (invalidMagicIndex !== -1) {
    throw new Error("静的人間用NavMeshバイナリのmagicが一致しません。");
  }
  const view = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength
  );
  const version = view.getUint32(4, true);
  if (version !== STATIC_NAVMESH_BINARY_VERSION) {
    throw new Error(
      `静的人間用NavMeshバイナリのversionが不正です: ${version}`
    );
  }
  const tileCount = view.getUint32(8, true);
  assertPositiveInteger("静的人間用NavMesh tile数", tileCount);
  const parameters: HumanNavTileParameters = Object.freeze({
    origin: Object.freeze({
      x: view.getFloat32(12, true),
      y: view.getFloat32(16, true),
      z: view.getFloat32(20, true)
    }),
    tileWidth: view.getFloat32(24, true),
    tileHeight: view.getFloat32(28, true),
    maxTiles: view.getUint32(32, true),
    maxPolys: view.getUint32(36, true)
  });
  assertParameters("静的人間用NavMesh", parameters);
  if (tileCount > parameters.maxTiles) {
    throw new Error(
      `静的人間用NavMesh tile数がmaxTilesを超えています: ${tileCount}`
    );
  }
  return Object.freeze({ parameters, tileCount });
};

const assertJsonString = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${label}には前後空白のない非空stringが必要です。`);
  }
  return value;
};

const assertJsonInteger = (
  value: unknown,
  label: string,
  minimum: number,
  maximum = UINT32_MAX
): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${label}には${minimum}以上${maximum}以下のintegerが必要です。`
    );
  }
  return value;
};

const assertJsonFiniteNumber = (
  value: unknown,
  label: string
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}には有限数が必要です。`);
  }
  return value;
};

const stableJsonStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`
      )
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new Error("room variant NavMesh manifestにJSON化できない値があります。");
  }
  return encoded;
};

const compareBinaryEntries = (
  left: HumanNavTileBinaryEntry,
  right: HumanNavTileBinaryEntry
) =>
  (left.roomId < right.roomId
    ? -1
    : left.roomId > right.roomId
      ? 1
      : 0) ||
  (left.variantId === right.variantId
    ? 0
    : left.variantId === "normal"
      ? -1
      : 1) ||
  left.tileY - right.tileY ||
  left.tileX - right.tileX ||
  left.layer - right.layer;

const parseBinaryParameters = (
  value: unknown
): HumanNavTileBinaryManifest["navMeshParams"] => {
  const parameters = assertJsonObject(
    value,
    "room variant NavMesh manifest.navMeshParams"
  );
  assertExactJsonKeys(
    parameters,
    ["origin", "tileWidth", "tileHeight", "maxTiles", "maxPolys"],
    "room variant NavMesh manifest.navMeshParams"
  );
  if (!Array.isArray(parameters.origin) || parameters.origin.length !== 3) {
    throw new Error(
      "room variant NavMesh manifest.navMeshParams.originには3要素配列が必要です。"
    );
  }
  const origin = parameters.origin.map((component, index) =>
    assertJsonFiniteNumber(
      component,
      `room variant NavMesh manifest.navMeshParams.origin[${index}]`
    )
  ) as [number, number, number];
  const tileWidth = assertJsonFiniteNumber(
    parameters.tileWidth,
    "room variant NavMesh manifest.navMeshParams.tileWidth"
  );
  const tileHeight = assertJsonFiniteNumber(
    parameters.tileHeight,
    "room variant NavMesh manifest.navMeshParams.tileHeight"
  );
  if (tileWidth <= 0 || tileHeight <= 0) {
    throw new Error(
      "room variant NavMesh manifestのtileWidth／tileHeightには正数が必要です。"
    );
  }
  return Object.freeze({
    origin: Object.freeze(origin),
    tileWidth,
    tileHeight,
    maxTiles: assertJsonInteger(
      parameters.maxTiles,
      "room variant NavMesh manifest.navMeshParams.maxTiles",
      1
    ),
    maxPolys: assertJsonInteger(
      parameters.maxPolys,
      "room variant NavMesh manifest.navMeshParams.maxPolys",
      1
    )
  });
};

const assertRawTileCoordinate = (
  data: Uint8Array,
  entry: HumanNavTileBinaryEntry
) => {
  if (data.byteLength < 20) {
    throw new Error(
      `room variant NavMesh tile payloadがdtMeshHeaderより短いです: ${entry.roomId}/${entry.variantId}/${entry.tileX}:${entry.tileY}:${entry.layer}`
    );
  }
  const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    header.getInt32(8, true) !== entry.tileX ||
    header.getInt32(12, true) !== entry.tileY ||
    header.getInt32(16, true) !== entry.layer
  ) {
    throw new Error(
      `room variant NavMesh tile payload座標がmanifestと一致しません: ${entry.roomId}/${entry.variantId}/${entry.tileX}:${entry.tileY}:${entry.layer}`
    );
  }
};

const decodeHumanNavTileBinaryManifest = (
  bundleData: Uint8Array,
  expectedStageId: string,
  expectedNavProfileId: string
): Readonly<{
  manifest: HumanNavTileBinaryManifest;
  payloadStart: number;
  payloadLength: number;
}> => {
  if (bundleData.byteLength < HUMAN_NAV_TILE_BINARY_HEADER_LENGTH) {
    throw new Error("room variant NavMesh bundleが24-byte headerより短いです。");
  }
  HUMAN_NAV_TILE_BINARY_MAGIC.forEach((value, index) => {
    if (bundleData[index] !== value) {
      throw new Error("room variant NavMesh bundleのmagicが一致しません。");
    }
  });
  const header = new DataView(
    bundleData.buffer,
    bundleData.byteOffset,
    bundleData.byteLength
  );
  if (header.getUint16(8, true) !== HUMAN_NAV_TILE_BINARY_FORMAT_VERSION) {
    throw new Error("room variant NavMesh bundleのformat versionが一致しません。");
  }
  if (
    header.getUint16(10, true) !== HUMAN_NAV_TILE_BINARY_HEADER_LENGTH
  ) {
    throw new Error("room variant NavMesh bundleのheader長が一致しません。");
  }
  const manifestLength = header.getUint32(12, true);
  const payloadLength = header.getUint32(16, true);
  const entryCount = header.getUint32(20, true);
  if (
    HUMAN_NAV_TILE_BINARY_HEADER_LENGTH +
      manifestLength +
      payloadLength !==
    bundleData.byteLength
  ) {
    throw new Error("room variant NavMesh bundleの全体長が一致しません。");
  }
  if (manifestLength === 0 || payloadLength === 0 || entryCount === 0) {
    throw new Error(
      "room variant NavMesh bundleには非空manifest・payload・entryが必要です。"
    );
  }
  const manifestBytes = bundleData.subarray(
    HUMAN_NAV_TILE_BINARY_HEADER_LENGTH,
    HUMAN_NAV_TILE_BINARY_HEADER_LENGTH + manifestLength
  );
  if (
    manifestBytes.byteLength >= 3 &&
    manifestBytes[0] === 0xef &&
    manifestBytes[1] === 0xbb &&
    manifestBytes[2] === 0xbf
  ) {
    throw new Error("room variant NavMesh manifestにUTF-8 BOMがあります。");
  }
  let manifestText: string;
  try {
    manifestText = new TextDecoder("utf-8", { fatal: true }).decode(
      manifestBytes
    );
  } catch (error) {
    throw new Error(
      `room variant NavMesh manifestがUTF-8ではありません: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(manifestText) as unknown;
  } catch (error) {
    throw new Error(
      `room variant NavMesh manifestがJSONではありません: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const source = assertJsonObject(
    parsedManifest,
    "room variant NavMesh manifest"
  );
  assertExactJsonKeys(
    source,
    ["stageId", "navProfileId", "navMeshParams", "entries"],
    "room variant NavMesh manifest"
  );
  if (stableJsonStringify(source) !== manifestText) {
    throw new Error(
      "room variant NavMesh manifestが安定順minified JSONではありません。"
    );
  }
  const stageId = assertJsonString(
    source.stageId,
    "room variant NavMesh manifest.stageId"
  );
  const navProfileId = assertJsonString(
    source.navProfileId,
    "room variant NavMesh manifest.navProfileId"
  );
  if (stageId !== expectedStageId) {
    throw new Error(
      `room variant NavMesh bundleのstageIdがカタログと一致しません: ${stageId}`
    );
  }
  if (navProfileId !== expectedNavProfileId) {
    throw new Error(
      `room variant NavMesh bundleのnavProfileIdがカタログと一致しません: ${navProfileId}`
    );
  }
  const navMeshParams = parseBinaryParameters(source.navMeshParams);
  if (!Array.isArray(source.entries) || source.entries.length !== entryCount) {
    throw new Error(
      "room variant NavMesh bundleのmanifest entry件数がheaderと一致しません。"
    );
  }

  let expectedOffset = 0;
  let previous: HumanNavTileBinaryEntry | null = null;
  const keys = new Set<string>();
  const entries = source.entries.map((entryValue, index) => {
    const entry = assertJsonObject(
      entryValue,
      `room variant NavMesh manifest.entries[${index}]`
    );
    assertExactJsonKeys(
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
      `room variant NavMesh manifest.entries[${index}]`
    );
    const variantId = assertJsonString(
      entry.variantId,
      `room variant NavMesh manifest.entries[${index}].variantId`
    );
    if (variantId !== "normal" && variantId !== "disordered") {
      throw new Error(
        `room variant NavMesh entryのvariantIdが不正です: ${variantId}`
      );
    }
    const decoded: HumanNavTileBinaryEntry = Object.freeze({
      roomId: assertJsonString(
        entry.roomId,
        `room variant NavMesh manifest.entries[${index}].roomId`
      ),
      variantId,
      tileX: assertJsonInteger(
        entry.tileX,
        `room variant NavMesh manifest.entries[${index}].tileX`,
        0,
        0x7fff_ffff
      ),
      tileY: assertJsonInteger(
        entry.tileY,
        `room variant NavMesh manifest.entries[${index}].tileY`,
        0,
        0x7fff_ffff
      ),
      layer: assertJsonInteger(
        entry.layer,
        `room variant NavMesh manifest.entries[${index}].layer`,
        0,
        0x7fff_ffff
      ),
      offset: assertJsonInteger(
        entry.offset,
        `room variant NavMesh manifest.entries[${index}].offset`,
        0
      ),
      length: assertJsonInteger(
        entry.length,
        `room variant NavMesh manifest.entries[${index}].length`,
        1
      )
    });
    if (decoded.offset !== expectedOffset) {
      throw new Error(
        `room variant NavMesh entryのoffsetに隙間または重複があります: index=${index}`
      );
    }
    expectedOffset += decoded.length;
    if (expectedOffset > payloadLength) {
      throw new Error(
        `room variant NavMesh entryがpayload範囲を超えています: index=${index}`
      );
    }
    const key = `${decoded.roomId}\u0000${decoded.variantId}\u0000${decoded.tileX}:${decoded.tileY}:${decoded.layer}`;
    if (keys.has(key)) {
      throw new Error(`room variant NavMesh entryが重複しています: ${key}`);
    }
    keys.add(key);
    if (previous && compareBinaryEntries(previous, decoded) >= 0) {
      throw new Error(
        `room variant NavMesh entry順が不安定です: index=${index}`
      );
    }
    previous = decoded;
    return decoded;
  });
  if (expectedOffset !== payloadLength) {
    throw new Error(
      "room variant NavMesh bundleのpayloadに未参照byteがあります。"
    );
  }
  return Object.freeze({
    manifest: Object.freeze({
      stageId,
      navProfileId,
      navMeshParams,
      entries: Object.freeze(entries)
    }),
    payloadStart:
      HUMAN_NAV_TILE_BINARY_HEADER_LENGTH + manifestLength,
    payloadLength
  });
};

export const decodeHumanNavTileBundle = async (
  bundleData: Uint8Array,
  staticNavmeshData: Uint8Array,
  expectedStageId: string,
  expectedNavProfileId: string
): Promise<HumanNavTileBundle> => {
  if (!(bundleData instanceof Uint8Array) || bundleData.byteLength === 0) {
    throw new Error("room variant NavMesh bundleが空です。");
  }
  if (
    !(staticNavmeshData instanceof Uint8Array) ||
    staticNavmeshData.byteLength === 0
  ) {
    throw new Error("静的人間用NavMeshバイナリが空です。");
  }
  assertOpaqueId("expectedStageId", expectedStageId);
  assertOpaqueId("expectedNavProfileId", expectedNavProfileId);
  const decoded = decodeHumanNavTileBinaryManifest(
    bundleData,
    expectedStageId,
    expectedNavProfileId
  );
  const parameters: HumanNavTileParameters = Object.freeze({
    origin: Object.freeze({
      x: decoded.manifest.navMeshParams.origin[0],
      y: decoded.manifest.navMeshParams.origin[1],
      z: decoded.manifest.navMeshParams.origin[2]
    }),
    tileWidth: decoded.manifest.navMeshParams.tileWidth,
    tileHeight: decoded.manifest.navMeshParams.tileHeight,
    maxTiles: decoded.manifest.navMeshParams.maxTiles,
    maxPolys: decoded.manifest.navMeshParams.maxPolys
  });
  const staticHeader = decodeStaticNavmeshParameters(staticNavmeshData);
  assertParametersMatch(
    "静的人間用NavMesh",
    staticHeader.parameters,
    parameters
  );
  const payloadStart = decoded.payloadStart;
  const roomEntries = new Map<
    string,
    {
      normal: HumanNavTilePayload[];
      disordered: HumanNavTilePayload[];
    }
  >();
  decoded.manifest.entries.forEach((entry) => {
    const data = bundleData.subarray(
      payloadStart + entry.offset,
      payloadStart + entry.offset + entry.length
    );
    assertRawTileCoordinate(data, entry);
    const variants = roomEntries.get(entry.roomId) ?? {
      normal: [],
      disordered: []
    };
    variants[entry.variantId].push(
      Object.freeze({
        coordinate: Object.freeze({
          x: entry.tileX,
          y: entry.tileY,
          layer: entry.layer
        }),
        data
      })
    );
    roomEntries.set(entry.roomId, variants);
  });

  await initializeNavigationRuntime();
  const imported = importNavMesh(staticNavmeshData);
  let common: HumanNavTileSet;
  try {
    if (imported.navMesh.getMaxTiles() !== parameters.maxTiles) {
      throw new Error(
        `静的人間用NavMeshのmaxTilesがbundleと一致しません: ${imported.navMesh.getMaxTiles()}`
      );
    }
    common = exportHumanNavTileSet(imported.navMesh, parameters);
    if (common.tiles.length !== staticHeader.tileCount) {
      throw new Error(
        `静的人間用NavMeshのheader tile数と実tile数が一致しません: ` +
          `${staticHeader.tileCount} != ${common.tiles.length}`
      );
    }
  } finally {
    imported.navMesh.destroy();
  }

  const bundle: HumanNavTileBundle = Object.freeze({
    schemaVersion: HUMAN_NAV_TILE_BUNDLE_SCHEMA_VERSION,
    recastVersion: HUMAN_NAV_TILE_BUNDLE_RECAST_VERSION,
    navProfileId: decoded.manifest.navProfileId,
    parameters,
    common,
    rooms: Object.freeze(
      [...roomEntries.entries()].map(([roomId, variants]) =>
        Object.freeze({
          roomId,
          normal: Object.freeze({
            parameters,
            tiles: Object.freeze(variants.normal)
          }),
          disordered: Object.freeze({
            parameters,
            tiles: Object.freeze(variants.disordered)
          })
        })
      )
    )
  });
  validateBundle(bundle);
  return bundle;
};

const resolveSelections = (
  bundle: HumanNavTileBundle,
  selections: readonly HumanNavRoomVariantSelection[]
) => {
  const selectionByRoomId = new Map<string, HumanNavTileVariant>();
  selections.forEach((selection, selectionIndex) => {
    assertOpaqueId(
      `selections[${selectionIndex}].roomId`,
      selection.roomId
    );
    if (
      selection.variant !== "normal" &&
      selection.variant !== "disordered"
    ) {
      throw new Error(
        `未登録の部屋NavMesh variantです: ${String(selection.variant)}`
      );
    }
    if (selectionByRoomId.has(selection.roomId)) {
      throw new Error(
        `部屋variant選択が重複しています: ${selection.roomId}`
      );
    }
    selectionByRoomId.set(selection.roomId, selection.variant);
  });

  if (selectionByRoomId.size !== bundle.rooms.length) {
    throw new Error("全ての部屋にNavMesh variantを1件ずつ指定してください。");
  }

  const resolved = bundle.rooms.map((room) => {
    const variant = selectionByRoomId.get(room.roomId);
    if (!variant) {
      throw new Error(`部屋variant選択がありません: ${room.roomId}`);
    }
    selectionByRoomId.delete(room.roomId);
    return Object.freeze({
      roomId: room.roomId,
      variant
    });
  });
  if (selectionByRoomId.size > 0) {
    throw new Error(
      `bundleに存在しない部屋が選択されています: ${[
        ...selectionByRoomId.keys()
      ].join(", ")}`
    );
  }
  return Object.freeze(resolved);
};

const collectSelectedTiles = (
  bundle: HumanNavTileBundle,
  selections: readonly HumanNavRoomVariantSelection[]
) => {
  const selectedVariantByRoomId = new Map(
    selections.map((selection) => [selection.roomId, selection.variant])
  );
  return [
    ...bundle.common.tiles,
    ...bundle.rooms.flatMap(
      (room) => room[selectedVariantByRoomId.get(room.roomId)!].tiles
    )
  ];
};

const assertPayloadCoordinate = (
  navMesh: NavMesh,
  tileRef: number,
  expected: HumanNavTileCoordinate
) => {
  const tile = navMesh.getTileByRef(tileRef);
  const header = tile?.header();
  if (
    !header ||
    header.x() !== expected.x ||
    header.y() !== expected.y ||
    header.layer() !== expected.layer
  ) {
    throw new Error(
      `NavMesh tile payloadの座標が目録と一致しません: ${coordinateKey(
        expected
      )}`
    );
  }
};

export const createHumanNavRoomVariantSelections = (
  roomIds: readonly string[],
  disorderedRoomIds: readonly string[]
): readonly HumanNavRoomVariantSelection[] => {
  const disordered = new Set(disorderedRoomIds);
  if (disordered.size !== disorderedRoomIds.length) {
    throw new Error("荒れ部屋IDが重複しています。");
  }
  roomIds.forEach((roomId) => assertOpaqueId("部屋ID", roomId));
  if (new Set(roomIds).size !== roomIds.length) {
    throw new Error("部屋IDが重複しています。");
  }
  disordered.forEach((roomId) => {
    if (!roomIds.includes(roomId)) {
      throw new Error(`荒れ部屋IDが部屋一覧に存在しません: ${roomId}`);
    }
  });

  return Object.freeze(
    roomIds.map((roomId) =>
      Object.freeze({
        roomId,
        variant: disordered.has(roomId)
          ? ("disordered" as const)
          : ("normal" as const)
      })
    )
  );
};

export const exportHumanNavTileSet = (
  navMesh: NavMesh,
  parameters: HumanNavTileParameters
): HumanNavTileSet => {
  assertParameters("export parameters", parameters);
  const tiles: HumanNavTilePayload[] = [];
  for (let tileIndex = 0; tileIndex < navMesh.getMaxTiles(); tileIndex += 1) {
    const tile = navMesh.getTile(tileIndex);
    const header = tile.header();
    if (!header) {
      continue;
    }
    const dataSize = tile.dataSize();
    if (!Number.isInteger(dataSize) || dataSize <= 0) {
      throw new Error(
        `NavMesh tile ${header.x()}:${header.y()}:${header.layer()} のpayloadが空です。`
      );
    }
    const data = new Uint8Array(dataSize);
    for (let dataIndex = 0; dataIndex < dataSize; dataIndex += 1) {
      data[dataIndex] = tile.data(dataIndex);
    }
    tiles.push(
      Object.freeze({
        coordinate: Object.freeze({
          x: header.x(),
          y: header.y(),
          layer: header.layer()
        }),
        data
      })
    );
  }
  if (tiles.length === 0) {
    throw new Error("export対象のNavMesh tileがありません。");
  }
  return Object.freeze({
    parameters: Object.freeze({
      origin: Object.freeze({ ...parameters.origin }),
      tileWidth: parameters.tileWidth,
      tileHeight: parameters.tileHeight,
      maxTiles: parameters.maxTiles,
      maxPolys: parameters.maxPolys
    }),
    tiles: Object.freeze(tiles)
  });
};

export const assembleHumanNavTileBundle = async (
  bundle: HumanNavTileBundle,
  selections: readonly HumanNavRoomVariantSelection[]
): Promise<HumanNavTileAssembly> => {
  validateBundle(bundle);
  const resolvedSelections = resolveSelections(bundle, selections);
  const selectedTiles = collectSelectedTiles(bundle, resolvedSelections);
  if (selectedTiles.length > bundle.parameters.maxTiles) {
    throw new Error(
      `選択NavMesh tile数がmaxTilesを超えています: ${selectedTiles.length} > ${bundle.parameters.maxTiles}`
    );
  }

  const selectedCoordinates = new Set<string>();
  selectedTiles.forEach((tile) => {
    const key = coordinateKey(tile.coordinate);
    if (selectedCoordinates.has(key)) {
      throw new Error(`選択NavMesh tile座標が重複しています: ${key}`);
    }
    selectedCoordinates.add(key);
  });

  await initializeNavigationRuntime();
  const navMesh = new NavMesh();
  try {
    let parameters: NavMeshParams | null = null;
    try {
      parameters = NavMeshParams.create({
        orig: { ...bundle.parameters.origin },
        tileWidth: bundle.parameters.tileWidth,
        tileHeight: bundle.parameters.tileHeight,
        maxTiles: bundle.parameters.maxTiles,
        maxPolys: bundle.parameters.maxPolys
      });
      const initialized = navMesh.initTiled(parameters);
      if (!initialized) {
        throw new Error("NavMesh.initTiled()に失敗しました。");
      }
    } finally {
      if (parameters) {
        Raw.destroy(parameters.raw);
      }
    }

    for (const tile of selectedTiles) {
      const tileData = new UnsignedCharArray();
      tileData.copy(tile.data);
      const added = navMesh.addTile(
        tileData,
        Detour.DT_TILE_FREE_DATA,
        0
      );
      if (statusFailed(added.status)) {
        tileData.destroy();
        throw new Error(
          `NavMesh.addTile()に失敗しました: ${coordinateKey(
            tile.coordinate
          )} / ${statusToReadableString(added.status)}`
        );
      }
      assertPayloadCoordinate(navMesh, added.tileRef, tile.coordinate);
    }
    return Object.freeze({
      navMesh,
      selectedVariants: resolvedSelections,
      tileCount: selectedTiles.length
    });
  } catch (error) {
    navMesh.destroy();
    throw error;
  }
};
