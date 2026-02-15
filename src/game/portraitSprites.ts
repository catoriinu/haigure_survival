import { CharacterState } from "./types";
import { CHARACTER_SPRITE_CELL_SIZE } from "./characterSprites";

const portraitExtensions = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "avif",
  "svg"
] as const;

const portraitFiles = import.meta.glob(
  "/public/picture/chara/*/*.{png,jpg,jpeg,webp,gif,bmp,avif,svg}"
);
const portraitFilePaths = Object.keys(portraitFiles);
const portraitDirectoriesFromFiles = Array.from(
  new Set(
    portraitFilePaths.map((path) => path.split("/").slice(-2, -1)[0])
  )
).sort();
const hasPortraitAssets = portraitFilePaths.length > 0;
const defaultPortraitDirectory = "00_default";
const portraitDirectories = hasPortraitAssets
  ? portraitDirectoriesFromFiles
  : [defaultPortraitDirectory];

const portraitStateOrder: CharacterState[] = [
  "normal",
  "evade",
  "hit-a",
  "hit-b",
  "brainwash-in-progress",
  "brainwash-complete-gun",
  "brainwash-complete-no-gun",
  "brainwash-complete-haigure",
  "brainwash-complete-haigure-formation"
];

const noGunTouchBrainwashBlendStepCount = 16;
const noGunTouchBrainwashBlendProgresses = Array.from(
  { length: noGunTouchBrainwashBlendStepCount + 1 },
  (_, index) => index / noGunTouchBrainwashBlendStepCount
);

const portraitBaseNameByState: Record<CharacterState, string> = {
  normal: "normal",
  evade: "evade",
  "hit-a": "hit-a",
  "hit-b": "hit-b",
  "brainwash-in-progress": "bw-in-progress",
  "brainwash-complete-gun": "bw-complete-gun",
  "brainwash-complete-no-gun": "bw-complete-no-gun",
  "brainwash-complete-haigure": "bw-complete-pose",
  "brainwash-complete-haigure-formation": "bw-complete-pose"
};

const portraitStateIndex = portraitStateOrder.reduce(
  (map, state, index) => {
    map[state] = index;
    return map;
  },
  {} as Record<CharacterState, number>
);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getNoGunTouchBrainwashBlendStep = (progress: number) =>
  Math.floor(
    clamp(progress, 0, 1) * noGunTouchBrainwashBlendStepCount
  );

const getPortraitFileName = (directory: string, baseName: string) => {
  for (const extension of portraitExtensions) {
    const filePath = `/public/picture/chara/${directory}/${baseName}.${extension}`;
    if (portraitFiles[filePath]) {
      return `${baseName}.${extension}`;
    }
  }
  throw new Error(`Missing portrait image: ${directory}/${baseName}.*`);
};

const getPortraitFileUrl = (directory: string, baseName: string) =>
  `/picture/chara/${directory}/${getPortraitFileName(directory, baseName)}`;

export type PortraitSpriteSheet = {
  url: string;
  cellWidth: number;
  cellHeight: number;
  frameCount: number;
  imageWidth: number;
  imageHeight: number;
};

export type PortraitSize = {
  width: number;
  height: number;
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${url}`));
    image.src = url;
  });

const defaultPortraitFrameByState: Record<CharacterState, number> = {
  normal: 0,
  evade: 0,
  "hit-a": 1,
  "hit-b": 1,
  "brainwash-in-progress": 2,
  "brainwash-complete-gun": 3,
  "brainwash-complete-no-gun": 2,
  "brainwash-complete-haigure": 2,
  "brainwash-complete-haigure-formation": 2
};

const createDefaultPortraitSpriteSheet = (): PortraitSpriteSheet => {
  const heightScale = 1.4;
  const cellWidth = CHARACTER_SPRITE_CELL_SIZE;
  const cellHeight = Math.round(CHARACTER_SPRITE_CELL_SIZE * heightScale);
  const bodyWidth = 80;
  const bodyMargin = Math.round((cellWidth - bodyWidth) / 2);
  const bodyHeight = cellHeight - bodyMargin * 2;
  const bodyTop = bodyMargin;
  const bodyLeft = bodyMargin;
  const eyeOffsetX = 18;
  const eyeOffsetY = 22;
  const eyeSize = 12;
  const gunDotOffsetX = 72;
  const gunDotOffsetY = Math.round(64 * heightScale);
  const gunDotRadius = 6;
  const totalFrameCount =
    portraitStateOrder.length + noGunTouchBrainwashBlendProgresses.length;
  const canvas = document.createElement("canvas");
  canvas.width = cellWidth * totalFrameCount;
  canvas.height = cellHeight;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const drawFrame = (
    index: number,
    color: string,
    accent: string,
    gunDot = false
  ) => {
    const offsetX = index * cellWidth;
    ctx.fillStyle = color;
    ctx.fillRect(offsetX, 0, cellWidth, cellHeight);
    ctx.fillStyle = accent;
    ctx.fillRect(
      offsetX + bodyLeft,
      bodyTop,
      bodyWidth,
      bodyHeight
    );
    ctx.fillStyle = "#111111";
    const eyeY = bodyTop + eyeOffsetY;
    ctx.fillRect(
      offsetX + bodyLeft + eyeOffsetX,
      eyeY,
      eyeSize,
      eyeSize
    );
    ctx.fillRect(
      offsetX + bodyLeft + eyeOffsetX + 32,
      eyeY,
      eyeSize,
      eyeSize
    );
    if (gunDot) {
      ctx.beginPath();
      ctx.arc(
        offsetX + bodyLeft + gunDotOffsetX,
        bodyTop + gunDotOffsetY,
        gunDotRadius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  };

  const drawIndexForState = (state: CharacterState) =>
    defaultPortraitFrameByState[state];
  const drawOrder = portraitStateOrder.map((state) =>
    drawIndexForState(state)
  );

  for (let index = 0; index < drawOrder.length; index += 1) {
    const frameIndex = drawOrder[index];
    if (frameIndex === 0) {
      drawFrame(index, "#3b5fbf", "#f1f1f1");
      continue;
    }
    if (frameIndex === 1) {
      drawFrame(index, "#d4a21f", "#f8f2c2");
      continue;
    }
    if (frameIndex === 2) {
      drawFrame(index, "#5c5c5c", "#c7c7c7");
      continue;
    }
    drawFrame(index, "#5c5c5c", "#c7c7c7", true);
  }

  const hitBSourceX = portraitStateIndex["hit-b"] * cellWidth;
  const hitASourceX = portraitStateIndex["hit-a"] * cellWidth;
  for (
    let blendIndex = 0;
    blendIndex < noGunTouchBrainwashBlendProgresses.length;
    blendIndex += 1
  ) {
    const progress = noGunTouchBrainwashBlendProgresses[blendIndex];
    const destinationX = (portraitStateOrder.length + blendIndex) * cellWidth;
    ctx.drawImage(
      canvas,
      hitBSourceX,
      0,
      cellWidth,
      cellHeight,
      destinationX,
      0,
      cellWidth,
      cellHeight
    );
    const revealedHeight = Math.round(cellHeight * progress);
    if (revealedHeight <= 0) {
      continue;
    }
    const sourceY = cellHeight - revealedHeight;
    // 切り替え済み領域のhit-bを消してからhit-aを描画する
    ctx.clearRect(destinationX, sourceY, cellWidth, revealedHeight);
    ctx.drawImage(
      canvas,
      hitASourceX,
      sourceY,
      cellWidth,
      revealedHeight,
      destinationX,
      sourceY,
      cellWidth,
      revealedHeight
    );
  }

  return {
    url: canvas.toDataURL("image/png"),
    cellWidth,
    cellHeight,
    frameCount: totalFrameCount,
    imageWidth: cellWidth,
    imageHeight: cellHeight
  };
};

const buildSpritesheetFromModeImages = (
  images: (HTMLImageElement | HTMLCanvasElement)[],
  cellWidth: number,
  cellHeight: number
) => {
  const canvas = document.createElement("canvas");
  canvas.width = cellWidth * images.length;
  canvas.height = cellHeight;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    ctx.drawImage(
      image,
      index * cellWidth,
      0,
      cellWidth,
      cellHeight
    );
  }

  return canvas.toDataURL("image/png");
};

const buildNoGunTouchBrainwashBlendFrames = (
  hitBImage: HTMLImageElement,
  hitAImage: HTMLImageElement
) => {
  const cellWidth = hitBImage.naturalWidth;
  const cellHeight = hitBImage.naturalHeight;
  return noGunTouchBrainwashBlendProgresses.map((progress) => {
    const canvas = document.createElement("canvas");
    canvas.width = cellWidth;
    canvas.height = cellHeight;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(hitBImage, 0, 0, cellWidth, cellHeight);
    const revealedHeight = Math.round(cellHeight * progress);
    if (revealedHeight > 0) {
      const sourceY = cellHeight - revealedHeight;
      // 切り替え済み領域のhit-bを消してからhit-aを描画する
      ctx.clearRect(0, sourceY, cellWidth, revealedHeight);
      ctx.drawImage(
        hitAImage,
        0,
        sourceY,
        cellWidth,
        revealedHeight,
        0,
        sourceY,
        cellWidth,
        revealedHeight
      );
    }
    return canvas;
  });
};

const getDirectoryId = (directory: string) => directory.slice(0, 2);

const pickRandomDirectory = (directories: string[]) =>
  directories[Math.floor(Math.random() * directories.length)];

export const getPortraitDirectories = () => portraitDirectories;

export const getPortraitCellIndex = (state: CharacterState) =>
  portraitStateIndex[state];

export const getNoGunTouchBrainwashCellIndex = (progress: number) =>
  portraitStateOrder.length + getNoGunTouchBrainwashBlendStep(progress);

export const assignPortraitDirectories = (voiceIds: string[]) => {
  const assignments: string[] = Array.from(
    { length: voiceIds.length }
  );
  const matchedIds = new Set<string>();

  for (let index = 0; index < voiceIds.length; index += 1) {
    const voiceId = voiceIds[index];
    if (matchedIds.has(voiceId)) {
      continue;
    }
    const matched = portraitDirectories.find(
      (directory) => getDirectoryId(directory) === voiceId
    );
    if (matched) {
      assignments[index] = matched;
      matchedIds.add(voiceId);
    }
  }

  for (let index = 0; index < voiceIds.length; index += 1) {
    if (assignments[index]) {
      continue;
    }
    assignments[index] = pickRandomDirectory(portraitDirectories);
  }

  return assignments;
};

export const loadPortraitSpriteSheet = async (
  directory: string
): Promise<PortraitSpriteSheet> => {
  if (!hasPortraitAssets && directory === defaultPortraitDirectory) {
    return createDefaultPortraitSpriteSheet();
  }
  const modeBaseNames = portraitStateOrder.map(
    (state) => portraitBaseNameByState[state]
  );
  const modeUrls = modeBaseNames.map((baseName) =>
    getPortraitFileUrl(directory, baseName)
  );
  const images = await Promise.all(modeUrls.map((url) => loadImage(url)));
  const hitBImage = images[portraitStateIndex["hit-b"]];
  const hitAImage = images[portraitStateIndex["hit-a"]];
  const noGunTouchBlendFrames = buildNoGunTouchBrainwashBlendFrames(
    hitBImage,
    hitAImage
  );
  const imagesWithNoGunTouchBlend = [...images, ...noGunTouchBlendFrames];
  const cellWidth = images[0].naturalWidth;
  const cellHeight = images[0].naturalHeight;
  return {
    url: buildSpritesheetFromModeImages(
      imagesWithNoGunTouchBlend,
      cellWidth,
      cellHeight
    ),
    cellWidth,
    cellHeight,
    frameCount: imagesWithNoGunTouchBlend.length,
    imageWidth: cellWidth,
    imageHeight: cellHeight
  };
};

export const calculatePortraitSpriteSize = (
  imageWidth: number,
  imageHeight: number,
  cellSize: number,
  maxWidthCells: number,
  maxHeightCells: number
): PortraitSize => {
  const maxWidth = maxWidthCells * cellSize;
  const maxHeight = maxHeightCells * cellSize;
  const scale = Math.min(
    maxWidth / imageWidth,
    maxHeight / imageHeight
  );
  return {
    width: imageWidth * scale,
    height: imageHeight * scale
  };
};
