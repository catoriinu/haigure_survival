export const CHARACTER_SPRITE_CELL_SIZE = 128;
export const CHARACTER_SPRITE_FRAME_COUNT = 6;
export const CHARACTER_SPRITE_IMAGE_WIDTH = 330;
export const CHARACTER_SPRITE_IMAGE_HEIGHT = 700;
export const NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT = 16;

export const NPC_SPRITE_WIDTH = 0.2;
export const NPC_SPRITE_HEIGHT =
  (CHARACTER_SPRITE_IMAGE_HEIGHT / CHARACTER_SPRITE_IMAGE_WIDTH) *
  NPC_SPRITE_WIDTH;
export const NPC_SPRITE_CENTER_HEIGHT = NPC_SPRITE_HEIGHT / 2;

export const PLAYER_SPRITE_WIDTH = 0.2;
export const PLAYER_SPRITE_HEIGHT =
  (CHARACTER_SPRITE_IMAGE_HEIGHT / CHARACTER_SPRITE_IMAGE_WIDTH) *
  PLAYER_SPRITE_WIDTH;
export const PLAYER_SPRITE_CENTER_HEIGHT = PLAYER_SPRITE_HEIGHT / 2;

const characterSpriteExtensions = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "avif",
  "svg"
] as const;

export const getCharacterModeImageBaseUrl = (
  characterId: string,
  modeName: string
) => `/character/${characterId}/${modeName}`;

export const NPC_SPRITE_MODES = [
  "normal",
  "hit",
  "brainwash",
  "gun",
  "no-gun",
  "haigure"
] as const;
export const PLAYER_SPRITE_MODES = [
  "normal",
  "hit",
  "brainwash",
  "gun",
  "no-gun",
  "haigure"
] as const;

export const createDefaultCharacterSpritesheet = (
  includeNoGunTouchBlendFrames = false
) => {
  const totalFrameCount = includeNoGunTouchBlendFrames
    ? CHARACTER_SPRITE_FRAME_COUNT +
      NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT +
      1
    : CHARACTER_SPRITE_FRAME_COUNT;
  const canvas = document.createElement("canvas");
  canvas.width = CHARACTER_SPRITE_CELL_SIZE * totalFrameCount;
  canvas.height = CHARACTER_SPRITE_CELL_SIZE;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const drawFrame = (
    index: number,
    color: string,
    accent: string,
    gunDot = false
  ) => {
    const offsetX = index * CHARACTER_SPRITE_CELL_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(offsetX, 0, CHARACTER_SPRITE_CELL_SIZE, CHARACTER_SPRITE_CELL_SIZE);
    ctx.fillStyle = accent;
    ctx.fillRect(offsetX + 24, 22, 80, 84);
    ctx.fillStyle = "#111111";
    ctx.fillRect(offsetX + 42, 44, 12, 12);
    ctx.fillRect(offsetX + 74, 44, 12, 12);
    if (gunDot) {
      ctx.beginPath();
      ctx.arc(offsetX + 96, 86, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawFrame(0, "#3b5fbf", "#f1f1f1");
  drawFrame(1, "#d4a21f", "#f8f2c2");
  drawFrame(2, "#5c5c5c", "#c7c7c7");
  drawFrame(3, "#5c5c5c", "#c7c7c7", true);
  drawFrame(4, "#315f72", "#b9e2ec");
  drawFrame(5, "#713c78", "#ebc7f0");

  if (includeNoGunTouchBlendFrames) {
    const hitASourceX = CHARACTER_SPRITE_CELL_SIZE;
    const hitBSourceX = CHARACTER_SPRITE_CELL_SIZE * 2;
    for (
      let blendIndex = 0;
      blendIndex <= NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT;
      blendIndex += 1
    ) {
      const progress =
        blendIndex / NO_GUN_TOUCH_BRAINWASH_BLEND_STEP_COUNT;
      const destinationX =
        (CHARACTER_SPRITE_FRAME_COUNT + blendIndex) *
        CHARACTER_SPRITE_CELL_SIZE;
      ctx.drawImage(
        canvas,
        hitBSourceX,
        0,
        CHARACTER_SPRITE_CELL_SIZE,
        CHARACTER_SPRITE_CELL_SIZE,
        destinationX,
        0,
        CHARACTER_SPRITE_CELL_SIZE,
        CHARACTER_SPRITE_CELL_SIZE
      );
      const revealedHeight = Math.round(
        CHARACTER_SPRITE_CELL_SIZE * progress
      );
      if (revealedHeight === 0) {
        continue;
      }
      const sourceY = CHARACTER_SPRITE_CELL_SIZE - revealedHeight;
      ctx.clearRect(
        destinationX,
        sourceY,
        CHARACTER_SPRITE_CELL_SIZE,
        revealedHeight
      );
      ctx.drawImage(
        canvas,
        hitASourceX,
        sourceY,
        CHARACTER_SPRITE_CELL_SIZE,
        revealedHeight,
        destinationX,
        sourceY,
        CHARACTER_SPRITE_CELL_SIZE,
        revealedHeight
      );
    }
  }

  return canvas.toDataURL("image/png");
};

export type CharacterSpriteSheet = {
  url: string;
  cellSize: number;
  frameCount: number;
  modeNames: string[];
  source: "default" | "mode-images";
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });

const loadCharacterModeImage = async (
  characterId: string,
  modeName: string
) => {
  const baseUrl = getCharacterModeImageBaseUrl(characterId, modeName);
  for (const extension of characterSpriteExtensions) {
    try {
      return await loadImage(`${baseUrl}.${extension}`);
    } catch (error) {
      continue;
    }
  }
  throw new Error(
    `Failed to load ${baseUrl}.[${characterSpriteExtensions.join(",")}]`
  );
};

const buildSpritesheetFromModeImages = (
  images: HTMLImageElement[],
  cellSize: number
) => {
  const canvas = document.createElement("canvas");
  canvas.width = cellSize * images.length;
  canvas.height = cellSize;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    ctx.drawImage(
      image,
      index * cellSize,
      0,
      cellSize,
      cellSize
    );
  }

  return canvas.toDataURL("image/png");
};

export const loadCharacterSpriteSheet = async (
  characterId: string,
  modeNames: readonly string[],
  fallbackUrl: string
): Promise<CharacterSpriteSheet> => {
  try {
    const images = await Promise.all(
      modeNames.map((modeName) =>
        loadCharacterModeImage(characterId, modeName)
      )
    );
    return {
      url: buildSpritesheetFromModeImages(
        images,
        CHARACTER_SPRITE_CELL_SIZE
      ),
      cellSize: CHARACTER_SPRITE_CELL_SIZE,
      frameCount: modeNames.length,
      modeNames: [...modeNames],
      source: "mode-images"
    };
  } catch (error) {
    return {
      url: fallbackUrl,
      cellSize: CHARACTER_SPRITE_CELL_SIZE,
      frameCount: CHARACTER_SPRITE_FRAME_COUNT,
      modeNames: [...modeNames],
      source: "default"
    };
  }
};
