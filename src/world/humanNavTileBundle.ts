import {
  Detour,
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
  left.origin.x === right.origin.x &&
  left.origin.y === right.origin.y &&
  left.origin.z === right.origin.z &&
  left.tileWidth === right.tileWidth &&
  left.tileHeight === right.tileHeight &&
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

const assertSameCoordinateSet = (
  roomId: string,
  normal: ReadonlySet<string>,
  disordered: ReadonlySet<string>
) => {
  if (
    normal.size !== disordered.size ||
    [...normal].some((coordinate) => !disordered.has(coordinate))
  ) {
    throw new Error(
      `部屋 ${roomId} のnormalとdisorderedで所有tile座標が一致しません。`
    );
  }
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
    assertSameCoordinateSet(
      room.roomId,
      normalCoordinates,
      disorderedCoordinates
    );

    normalCoordinates.forEach((coordinate) => {
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
  const parameters = NavMeshParams.create({
    orig: { ...bundle.parameters.origin },
    tileWidth: bundle.parameters.tileWidth,
    tileHeight: bundle.parameters.tileHeight,
    maxTiles: bundle.parameters.maxTiles,
    maxPolys: bundle.parameters.maxPolys
  });

  try {
    const initialized = navMesh.initTiled(parameters);
    if (!initialized) {
      throw new Error("NavMesh.initTiled()に失敗しました。");
    }
  } finally {
    Raw.destroy(parameters.raw);
  }

  try {
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
