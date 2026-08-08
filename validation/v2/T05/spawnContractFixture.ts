import { Vector3, type Mesh } from "@babylonjs/core";

import type { NavigationSurfaceTriangle } from "../../../src/world/navigationWorld";
import type {
  StagePlayerSpawn,
  StagePlayerSpawnRegistry,
  StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import type { StageVolume } from "../../../src/world/stageSpatialQueries";

export const createFixtureSurfaceSpawnRandom = (
  initialState = 0x6d2b_79f5
): (() => number) => {
  let state = initialState >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

export const createFixtureBitSpawnRandom = (
  initialState = 0x6d2b_79f5
): (() => number) => {
  const surfaceRandom = createFixtureSurfaceSpawnRandom(initialState);
  let drawIndex = 0;
  return () => {
    const drawKind = drawIndex % 4;
    drawIndex += 1;
    return drawKind === 3 ? 0.5 : surfaceRandom();
  };
};

const createFixtureSurfacePointDraws = (
  xRatio: number,
  zRatio: number
): readonly number[] => {
  if (
    !Number.isFinite(xRatio) ||
    !Number.isFinite(zRatio) ||
    xRatio <= 0 ||
    xRatio >= 1 ||
    zRatio <= 0 ||
    zRatio >= 1
  ) {
    throw new Error(
      `fixture出現座標比率は0より大きく1未満が必要です: ${xRatio}/${zRatio}`
    );
  }
  if (zRatio < xRatio) {
    return Object.freeze([0.25, xRatio * xRatio, zRatio / xRatio]);
  }
  return Object.freeze([
    0.75,
    zRatio * zRatio,
    1 - xRatio / zRatio
  ]);
};

export const createFixtureSurfacePointSpawnRandom = (
  points: readonly Readonly<{ xRatio: number; zRatio: number }>[],
  fallbackState = 0x6d2b_79f5
): (() => number) => {
  const values = points.flatMap(({ xRatio, zRatio }) =>
    createFixtureSurfacePointDraws(xRatio, zRatio)
  );
  const fallback = createFixtureSurfaceSpawnRandom(fallbackState);
  let drawIndex = 0;
  return () => {
    const value = values[drawIndex];
    drawIndex += 1;
    return value ?? fallback();
  };
};

export const createFixtureBitLineSpawnRandom = (
  count: number,
  fallbackState = 0x6d2b_79f5
): (() => number) => {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`fixtureのBIT数には1以上の整数が必要です: ${count}`);
  }
  const values = Array.from({ length: count }, (_, index) => [
    ...createFixtureSurfacePointDraws(
      (index + 1) / (count + 1),
      0.5
    ),
    0.5
  ]).flat();
  const fallback = createFixtureBitSpawnRandom(fallbackState);
  let drawIndex = 0;
  return () => {
    const value = values[drawIndex];
    drawIndex += 1;
    return value ?? fallback();
  };
};

export const createFixtureCenteredBitSpawnRandom = (): (() => number) => {
  return createFixtureBitLineSpawnRandom(1);
};

export const createFixturePlayerSpawn = (
  id: string,
  mesh: Mesh
): StagePlayerSpawn => {
  const exclusionVolume = Object.freeze({
    id: `${id}-exclusion`,
    role: "player_spawn_exclusion" as const,
    bitFlightBand: null,
    playerSpawnId: id,
    npcSpawnBiasWeight: null,
    navigationAreaId: null,
    mesh
  });
  const npcSpawnBiasVolume: StageVolume = Object.freeze({
    id: `${id}-npc-spawn-bias`,
    role: "npc_spawn_bias",
    bitFlightBand: null,
    playerSpawnId: id,
    npcSpawnBiasWeight: 0.5,
    navigationAreaId: null,
    mesh
  });
  return Object.freeze({
    id,
    marker: Object.freeze({
      id,
      role: "player_spawn" as const,
      node: mesh
    }),
    exclusionVolume,
    npcSpawnBiasVolumes: Object.freeze([npcSpawnBiasVolume])
  });
};

export const createFixturePlayerSpawnRegistry = (
  playerSpawn: StagePlayerSpawn
): StagePlayerSpawnRegistry =>
  Object.freeze({
    all: Object.freeze([playerSpawn]),
    getById: (id: string) => (id === playerSpawn.id ? playerSpawn : null)
  });

export const createFixturePlayerSpawnStage = (
  stage: StageSpatialContext,
  playerSpawnId: string
): StageSpatialContext => {
  const playerSpawn = stage.playerSpawns.getById(playerSpawnId);
  if (!playerSpawn) {
    throw new Error(
      `T05 fixtureのplayer_spawnがありません: ${playerSpawnId}`
    );
  }
  return Object.freeze({
    ...stage,
    playerSpawns: createFixturePlayerSpawnRegistry(playerSpawn)
  });
};

export const requireFirstFixturePlayerSpawn = (
  stage: StageSpatialContext
): StagePlayerSpawn => {
  const playerSpawn = stage.playerSpawns.all[0];
  if (!playerSpawn) {
    throw new Error("T05 fixtureにPlayer開始地点がありません。");
  }
  return playerSpawn;
};

export const createFixtureSpawnRoleStage = (
  stage: StageSpatialContext,
  role: StageVolume["role"],
  volumeIds: readonly string[]
): StageSpatialContext => {
  const selectedVolumes = volumeIds.map((volumeId) => {
    const volume = stage.volumes.getById(volumeId);
    if (!volume || volume.role !== role) {
      throw new Error(
        `T05 fixtureの${role} Volumeがありません: ${volumeId}`
      );
    }
    return volume;
  });
  return Object.freeze({
    ...stage,
    volumes: Object.freeze({
      all: stage.volumes.all,
      getById: (id: string) => stage.volumes.getById(id),
      getByRole: (requestedRole: StageVolume["role"]) =>
        requestedRole === role
          ? Object.freeze(selectedVolumes)
          : stage.volumes.getByRole(requestedRole)
    })
  });
};

export const createFixtureSurfaceTriangles = (
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number,
  y = 0
): readonly NavigationSurfaceTriangle[] => {
  const createTriangle = (
    a: Vector3,
    b: Vector3,
    c: Vector3
  ): NavigationSurfaceTriangle =>
    Object.freeze({
      a,
      b,
      c,
      area: Vector3.Cross(b.subtract(a), c.subtract(a)).length() / 2
    });
  const southwest = new Vector3(minimumX, y, minimumZ);
  const southeast = new Vector3(maximumX, y, minimumZ);
  const northeast = new Vector3(maximumX, y, maximumZ);
  const northwest = new Vector3(minimumX, y, maximumZ);
  return Object.freeze([
    createTriangle(southwest, southeast, northeast),
    createTriangle(southwest.clone(), northeast.clone(), northwest)
  ]);
};
