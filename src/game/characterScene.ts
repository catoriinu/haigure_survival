import {
  Color4,
  Scene,
  Sprite,
  SpriteManager,
  Vector3
} from "@babylonjs/core";
import {
  createVoiceActor,
  stopVoiceActor,
  updateVoiceActor,
  voiceProfiles,
  type VoiceActor,
  type VoiceAudio
} from "../audio/voice";
import type { SpatialPlayOptions } from "../audio/audio";
import {
  applyNpcDefaultHaigureState,
  spawnNpcs
} from "./entities";
import {
  createCharacterBillboardMeshManager,
  type CharacterBillboardMeshHandle
} from "./characterBillboardMeshes";
import {
  createGroundShadowManager,
  type GroundShadowHandle
} from "./groundShadows";
import { alignSpriteToGround } from "./spriteUtils";
import {
  calculatePortraitSpriteSize,
  loadPortraitSpriteSheet,
  type PortraitSpriteSheet
} from "./portraitSprites";
import type { GridLayout } from "../world/grid";
import type { CharacterState, FloorCell, Npc } from "./types";
import type { TitleStartPreparationLoadingSession } from "./titleStartPreparation";

type CharacterSceneAssignments = {
  playerVoiceId: string;
  npcVoiceIds: string[];
  playerPortraitDirectory: string;
  npcPortraitDirectories: string[];
};

type CharacterSceneControllerOptions = {
  scene: Scene;
  spriteManagerCapacity: number;
  playerWidth: number;
  playerHeight: number;
  portraitMaxWidthCells: number;
  portraitMaxHeightCells: number;
  loadPortraitIncludeNoGunTouch: () => boolean;
};

type PrepareCharactersArgs = {
  assignments: CharacterSceneAssignments;
  playerAvatar: Sprite | null;
  npcs: Npc[];
  session?: TitleStartPreparationLoadingSession;
  spawnPosition: Vector3;
  layout: GridLayout;
  spawnableCells: FloorCell[];
  initialNpcCount: number;
  initialBrainwashedNpcPercent: number;
  portraitCellSize: number;
};

type SyncBillboardsArgs = {
  playerAvatar: Sprite;
  npcs: Npc[];
  playerLayerMask: number;
  worldLayerMask: number;
  enabled: boolean;
  yaw: number;
};

type SyncCharacterGroundShadowsArgs = {
  playerAvatar: Sprite;
  npcs: Npc[];
  showGroundShadows: boolean;
  yaw: number;
  visibility: number;
  worldLayerMask: number;
  widthRatio: number;
  depthRatio: number;
};

type RebindVoicesArgs = {
  playerPosition: () => Vector3;
  getPlayerState: () => CharacterState;
  npcs: Npc[];
  getNpcState: (npc: Npc) => CharacterState;
};

type UpdateVoicesArgs = RebindVoicesArgs & {
  delta: number;
  allowIdle: boolean;
  audioManager: VoiceAudio;
  baseOptions: SpatialPlayOptions;
  loopOptions: SpatialPlayOptions;
};

export type CharacterSceneController = {
  countUnloadedPortraitDirectories: (directories: string[]) => number;
  ensurePortraitManagersIfNeeded: (
    directories: string[],
    session?: TitleStartPreparationLoadingSession
  ) => Promise<void>;
  getPortraitSpriteSheet: (directory: string) => PortraitSpriteSheet;
  getPlayerPortraitDirectory: () => string;
  prepareCharacters: (args: PrepareCharactersArgs) => Promise<Sprite>;
  refreshPortraitSizes: (
    playerAvatar: Sprite,
    npcs: Npc[],
    portraitCellSize: number
  ) => void;
  syncBillboards: (args: SyncBillboardsArgs) => void;
  syncCharacterGroundShadows: (args: SyncCharacterGroundShadowsArgs) => void;
  applyFacingYaw: (yaw: number) => void;
  applyMirrorFlip: (
    mirrored: boolean,
    playerAvatar: Sprite,
    npcs: Npc[]
  ) => void;
  disposeCharacterGroundShadows: () => void;
  stopAllVoices: () => void;
  rebindVoices: (args: RebindVoicesArgs) => void;
  updateVoices: (args: UpdateVoicesArgs) => void;
};

const npcSpriteColorNormal = new Color4(1, 1, 1, 1);

export const createCharacterSceneController = ({
  scene,
  spriteManagerCapacity,
  playerWidth,
  playerHeight,
  portraitMaxWidthCells,
  portraitMaxHeightCells,
  loadPortraitIncludeNoGunTouch
}: CharacterSceneControllerOptions): CharacterSceneController => {
  const portraitSpriteSheets = new Map<string, PortraitSpriteSheet>();
  const portraitSpriteSheetPromises = new Map<
    string,
    Promise<PortraitSpriteSheet>
  >();
  const portraitManagers = new Map<string, SpriteManager>();
  const portraitManagerPromises = new Map<string, Promise<SpriteManager>>();
  const portraitScaleCache = new Map<string, { width: number; height: number }>();
  const characterBillboardMeshManager = createCharacterBillboardMeshManager(
    scene,
    (directory) => portraitSpriteSheets.get(directory)!
  );
  const groundShadowManager = createGroundShadowManager(scene);
  let playerPortraitManager: SpriteManager | null = null;
  let playerBillboardMesh: CharacterBillboardMeshHandle | null = null;
  let playerBillboardDirectory: string | null = null;
  const npcBillboardMeshes: (CharacterBillboardMeshHandle | null)[] = [];
  const npcBillboardDirectories: (string | null)[] = [];
  let playerGroundShadow: GroundShadowHandle | null = null;
  const npcGroundShadows: GroundShadowHandle[] = [];
  let playerVoiceActor: VoiceActor | null = null;
  let npcVoiceActors: VoiceActor[] = [];
  let playerVoiceId = "00";
  let npcVoiceIds: string[] = [];
  let playerPortraitDirectory = "";
  let npcPortraitDirectories: string[] = [];
  let lastVerticalAngleEnabled: boolean | null = null;
  let lastPlayerLayerMask = -1;
  let lastWorldLayerMask = -1;

  const pickVoiceProfileById = (id: string) =>
    voiceProfiles.find((profile) => profile.id === id)!;

  const loadPortraitSpriteSheetOnce = (directory: string) => {
    const cachedPromise = portraitSpriteSheetPromises.get(directory);
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = loadPortraitSpriteSheet(
      directory,
      loadPortraitIncludeNoGunTouch()
    ).then((sheet) => {
      portraitSpriteSheets.set(directory, sheet);
      return sheet;
    });
    portraitSpriteSheetPromises.set(directory, promise);
    return promise;
  };

  const ensurePortraitManager = async (directory: string) => {
    const cachedManager = portraitManagers.get(directory);
    if (cachedManager) {
      return cachedManager;
    }
    const cachedPromise = portraitManagerPromises.get(directory);
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = (async () => {
      const sheet = await loadPortraitSpriteSheetOnce(directory);
      const manager = new SpriteManager(
        `portrait_${directory}`,
        sheet.url,
        spriteManagerCapacity,
        { width: sheet.cellWidth, height: sheet.cellHeight },
        scene
      );
      portraitManagers.set(directory, manager);
      return manager;
    })();
    portraitManagerPromises.set(directory, promise);
    try {
      return await promise;
    } finally {
      portraitManagerPromises.delete(directory);
    }
  };

  const countUnloadedPortraitDirectories = (directories: string[]) =>
    Array.from(new Set(directories)).filter(
      (directory) => !portraitManagers.has(directory)
    ).length;

  const ensurePortraitManagersIfNeeded = async (
    directories: string[],
    session?: TitleStartPreparationLoadingSession
  ) => {
    const unloadedDirectories = Array.from(new Set(directories)).filter(
      (directory) => !portraitManagers.has(directory)
    );
    if (unloadedDirectories.length === 0) {
      return;
    }
    if (!session) {
      await Promise.all(
        unloadedDirectories.map(async (directory) => {
          await ensurePortraitManager(directory);
        })
      );
      return;
    }
    await Promise.all(
      unloadedDirectories.map(async (directory) => {
        try {
          await ensurePortraitManager(directory);
        } finally {
          session.advance();
        }
      })
    );
  };

  const computePortraitSpriteSize = (
    directory: string,
    portraitCellSize: number
  ) => {
    const cacheKey = `${directory}:${portraitCellSize}`;
    const cached = portraitScaleCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const sheet = portraitSpriteSheets.get(directory)!;
    const size = calculatePortraitSpriteSize(
      sheet.imageWidth,
      sheet.imageHeight,
      portraitCellSize,
      portraitMaxWidthCells,
      portraitMaxHeightCells
    );
    portraitScaleCache.set(cacheKey, size);
    return size;
  };

  const applyPortraitSize = (
    sprite: Sprite,
    directory: string,
    portraitCellSize: number
  ) => {
    const size = computePortraitSpriteSize(directory, portraitCellSize);
    sprite.width = size.width;
    sprite.height = size.height;
  };

  const setAssignments = (assignments: CharacterSceneAssignments) => {
    playerVoiceId = assignments.playerVoiceId;
    npcVoiceIds = [...assignments.npcVoiceIds];
    playerPortraitDirectory = assignments.playerPortraitDirectory;
    npcPortraitDirectories = [...assignments.npcPortraitDirectories];
    portraitScaleCache.clear();
  };

  const createPlayerPortraitManager = (directory: string) => {
    playerPortraitManager?.dispose();
    const sheet = portraitSpriteSheets.get(directory)!;
    playerPortraitManager = new SpriteManager(
      `player_portrait_${directory}`,
      sheet.url,
      1,
      { width: sheet.cellWidth, height: sheet.cellHeight },
      scene
    );
    return playerPortraitManager;
  };

  const createPlayerAvatar = (manager: SpriteManager) => {
    const avatar = new Sprite("playerAvatar", manager);
    avatar.width = playerWidth;
    avatar.height = playerHeight;
    avatar.isPickable = false;
    avatar.cellIndex = 0;
    avatar.isVisible = false;
    return avatar;
  };

  const ensureBillboardHandles = (playerAvatar: Sprite, npcs: Npc[]) => {
    if (!playerBillboardMesh) {
      playerBillboardMesh =
        characterBillboardMeshManager.createCharacterBillboardMesh(
          `${playerAvatar.name}_billboard`,
          playerPortraitDirectory
        );
      playerBillboardDirectory = playerPortraitDirectory;
    } else if (playerBillboardDirectory !== playerPortraitDirectory) {
      characterBillboardMeshManager.disposeCharacterBillboardMesh(
        playerBillboardMesh
      );
      playerBillboardMesh =
        characterBillboardMeshManager.createCharacterBillboardMesh(
          `${playerAvatar.name}_billboard`,
          playerPortraitDirectory
        );
      playerBillboardDirectory = playerPortraitDirectory;
    }
    for (let index = 0; index < npcs.length; index += 1) {
      const directory = npcs[index].portraitDirectory;
      const cachedHandle = npcBillboardMeshes[index];
      if (cachedHandle && npcBillboardDirectories[index] === directory) {
        continue;
      }
      if (cachedHandle) {
        characterBillboardMeshManager.disposeCharacterBillboardMesh(cachedHandle);
      }
      npcBillboardMeshes[index] =
        characterBillboardMeshManager.createCharacterBillboardMesh(
          `${npcs[index].sprite.name}_billboard`,
          directory
        );
      npcBillboardDirectories[index] = directory;
    }
    for (let index = npcs.length; index < npcBillboardMeshes.length; index += 1) {
      npcBillboardMeshes[index]?.mesh.setEnabled(false);
    }
  };

  const ensureCharacterGroundShadowHandles = (npcs: Npc[]) => {
    if (!playerGroundShadow) {
      playerGroundShadow = groundShadowManager.createGroundShadow(
        "playerAvatar_shadow",
        "ellipse"
      );
    }
    for (let index = npcGroundShadows.length; index < npcs.length; index += 1) {
      npcGroundShadows.push(
        groundShadowManager.createGroundShadow(
          `npc_${index}_shadow`,
          "ellipse"
        )
      );
    }
    for (let index = npcs.length; index < npcGroundShadows.length; index += 1) {
      npcGroundShadows[index].mesh.isVisible = false;
    }
  };

  const disposeCharacterGroundShadows = () => {
    groundShadowManager.disposeGroundShadow(playerGroundShadow);
    playerGroundShadow = null;
    for (const groundShadow of npcGroundShadows) {
      groundShadowManager.disposeGroundShadow(groundShadow);
    }
    npcGroundShadows.length = 0;
  };

  const stopAllVoices = () => {
    if (playerVoiceActor) {
      stopVoiceActor(playerVoiceActor);
    }
    for (const actor of npcVoiceActors) {
      stopVoiceActor(actor);
    }
    playerVoiceActor = null;
    npcVoiceActors = [];
  };

  return {
    countUnloadedPortraitDirectories,
    ensurePortraitManagersIfNeeded,
    getPortraitSpriteSheet: (directory) => portraitSpriteSheets.get(directory)!,
    getPlayerPortraitDirectory: () => playerPortraitDirectory,
    prepareCharacters: async ({
      assignments,
      playerAvatar,
      npcs,
      session,
      spawnPosition,
      layout,
      spawnableCells,
      initialNpcCount,
      initialBrainwashedNpcPercent,
      portraitCellSize
    }) => {
      setAssignments(assignments);
      await ensurePortraitManagersIfNeeded(
        [playerPortraitDirectory, ...npcPortraitDirectories],
        session
      );
      playerAvatar?.dispose();
      playerPortraitManager?.dispose();
      playerPortraitManager = null;
      const nextPlayerAvatar = createPlayerAvatar(
        createPlayerPortraitManager(playerPortraitDirectory)
      );
      nextPlayerAvatar.position = new Vector3(
        spawnPosition.x,
        nextPlayerAvatar.height * 0.5,
        spawnPosition.z
      );
      npcs.length = 0;
      npcs.push(
        ...spawnNpcs(
          layout,
          spawnableCells,
          (directory) => portraitManagers.get(directory)!,
          npcVoiceIds,
          npcPortraitDirectories
        )
      );
      const initialBrainwashedNpcCount = Math.floor(
        initialNpcCount * initialBrainwashedNpcPercent * 0.01
      );
      const shuffledNpcs = [...npcs];
      for (let index = shuffledNpcs.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        const temp = shuffledNpcs[index];
        shuffledNpcs[index] = shuffledNpcs[swap];
        shuffledNpcs[swap] = temp;
      }
      for (let index = 0; index < initialBrainwashedNpcCount; index += 1) {
        applyNpcDefaultHaigureState(shuffledNpcs[index]);
      }
      applyPortraitSize(
        nextPlayerAvatar,
        playerPortraitDirectory,
        portraitCellSize
      );
      alignSpriteToGround(nextPlayerAvatar);
      for (const npc of npcs) {
        applyPortraitSize(npc.sprite, npc.portraitDirectory, portraitCellSize);
        alignSpriteToGround(npc.sprite);
        npc.sprite.color.copyFrom(npcSpriteColorNormal);
      }
      ensureBillboardHandles(nextPlayerAvatar, npcs);
      ensureCharacterGroundShadowHandles(npcs);
      lastVerticalAngleEnabled = null;
      lastPlayerLayerMask = -1;
      lastWorldLayerMask = -1;
      return nextPlayerAvatar;
    },
    refreshPortraitSizes: (playerAvatar, npcs, portraitCellSize) => {
      portraitScaleCache.clear();
      applyPortraitSize(playerAvatar, playerPortraitDirectory, portraitCellSize);
      alignSpriteToGround(playerAvatar);
      for (const npc of npcs) {
        applyPortraitSize(npc.sprite, npc.portraitDirectory, portraitCellSize);
        alignSpriteToGround(npc.sprite);
      }
    },
    syncBillboards: ({
      playerAvatar,
      npcs,
      playerLayerMask,
      worldLayerMask,
      enabled,
      yaw
    }) => {
      if (
        lastVerticalAngleEnabled !== enabled ||
        lastPlayerLayerMask !== playerLayerMask ||
        lastWorldLayerMask !== worldLayerMask
      ) {
        for (const portraitManager of portraitManagers.values()) {
          portraitManager.layerMask = enabled ? 0 : worldLayerMask;
        }
        if (playerPortraitManager) {
          playerPortraitManager.layerMask = enabled ? 0 : playerLayerMask;
        }
        lastVerticalAngleEnabled = enabled;
        lastPlayerLayerMask = playerLayerMask;
        lastWorldLayerMask = worldLayerMask;
      }
      if (playerBillboardMesh) {
        characterBillboardMeshManager.syncCharacterBillboardMesh(
          playerBillboardMesh,
          playerAvatar,
          enabled,
          playerLayerMask,
          yaw
        );
      }
      for (let index = 0; index < npcs.length; index += 1) {
        const billboardMesh = npcBillboardMeshes[index];
        if (!billboardMesh) {
          continue;
        }
        billboardMesh.mesh.setEnabled(true);
        characterBillboardMeshManager.syncCharacterBillboardMesh(
          billboardMesh,
          npcs[index].sprite,
          enabled,
          worldLayerMask,
          yaw
        );
      }
      for (let index = npcs.length; index < npcBillboardMeshes.length; index += 1) {
        const billboardMesh = npcBillboardMeshes[index];
        if (!billboardMesh) {
          continue;
        }
        billboardMesh.mesh.isVisible = false;
      }
    },
    syncCharacterGroundShadows: ({
      playerAvatar,
      npcs,
      showGroundShadows,
      yaw,
      visibility,
      worldLayerMask,
      widthRatio,
      depthRatio
    }) => {
      if (playerGroundShadow) {
        groundShadowManager.syncGroundShadow(playerGroundShadow, {
          positionX: playerAvatar.position.x,
          positionZ: playerAvatar.position.z,
          width: playerAvatar.width * widthRatio,
          depth: playerAvatar.width * depthRatio,
          yaw,
          visibility,
          visible: showGroundShadows && playerAvatar.isVisible,
          layerMask: worldLayerMask
        });
      }
      for (let index = 0; index < npcs.length; index += 1) {
        const groundShadow = npcGroundShadows[index];
        if (!groundShadow) {
          continue;
        }
        const npcSprite = npcs[index].sprite;
        groundShadow.mesh.setEnabled(true);
        groundShadowManager.syncGroundShadow(groundShadow, {
          positionX: npcSprite.position.x,
          positionZ: npcSprite.position.z,
          width: npcSprite.width * widthRatio,
          depth: npcSprite.width * depthRatio,
          yaw,
          visibility,
          visible: showGroundShadows && npcSprite.isVisible,
          layerMask: worldLayerMask
        });
      }
      for (let index = npcs.length; index < npcGroundShadows.length; index += 1) {
        npcGroundShadows[index].mesh.isVisible = false;
      }
    },
    applyFacingYaw: (yaw) => {
      if (playerBillboardMesh) {
        playerBillboardMesh.mesh.rotation.y = yaw;
      }
      for (const billboardMesh of npcBillboardMeshes) {
        billboardMesh?.mesh.rotation.set(0, yaw, 0);
      }
      if (playerGroundShadow) {
        playerGroundShadow.mesh.rotation.y = yaw;
      }
      for (const groundShadow of npcGroundShadows) {
        groundShadow.mesh.rotation.y = yaw;
      }
    },
    applyMirrorFlip: (mirrored, playerAvatar, npcs) => {
      playerAvatar.invertU = mirrored;
      for (const npc of npcs) {
        npc.sprite.invertU = mirrored;
      }
      const applyMirroredScaleX = (value: number) =>
        mirrored ? -Math.abs(value) : Math.abs(value);
      if (playerBillboardMesh) {
        playerBillboardMesh.mesh.scaling.x = applyMirroredScaleX(
          playerBillboardMesh.mesh.scaling.x
        );
      }
      for (const billboardMesh of npcBillboardMeshes) {
        if (!billboardMesh) {
          continue;
        }
        billboardMesh.mesh.scaling.x = applyMirroredScaleX(
          billboardMesh.mesh.scaling.x
        );
      }
      if (playerGroundShadow) {
        playerGroundShadow.mesh.scaling.x = applyMirroredScaleX(
          playerGroundShadow.mesh.scaling.x
        );
      }
      for (const groundShadow of npcGroundShadows) {
        groundShadow.mesh.scaling.x = applyMirroredScaleX(
          groundShadow.mesh.scaling.x
        );
      }
    },
    disposeCharacterGroundShadows,
    stopAllVoices,
    rebindVoices: ({ playerPosition, getPlayerState, npcs, getNpcState }) => {
      stopAllVoices();
      const playerProfile = pickVoiceProfileById(playerVoiceId);
      playerVoiceActor = createVoiceActor(
        playerProfile,
        playerPosition,
        getPlayerState
      );
      npcVoiceActors = npcs.map((npc) => {
        const profile = pickVoiceProfileById(npc.voiceId);
        return createVoiceActor(
          profile,
          () => npc.sprite.position,
          () => getNpcState(npc)
        );
      });
    },
    updateVoices: ({
      delta,
      allowIdle,
      playerPosition,
      getPlayerState,
      npcs,
      getNpcState,
      audioManager,
      baseOptions,
      loopOptions
    }) => {
      if (playerVoiceActor) {
        playerVoiceActor.getPosition = playerPosition;
        playerVoiceActor.getState = getPlayerState;
        updateVoiceActor(
          playerVoiceActor,
          audioManager,
          delta,
          allowIdle,
          baseOptions,
          loopOptions
        );
      }
      for (let index = 0; index < npcVoiceActors.length; index += 1) {
        const actor = npcVoiceActors[index];
        const npc = npcs[index];
        if (!npc) {
          stopVoiceActor(actor);
          continue;
        }
        actor.getPosition = () => npc.sprite.position;
        actor.getState = () => getNpcState(npc);
        updateVoiceActor(
          actor,
          audioManager,
          delta,
          allowIdle,
          baseOptions,
          loopOptions
        );
      }
    }
  };
};
