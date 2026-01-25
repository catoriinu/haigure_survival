import { CharacterState } from "./types";

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
const fallbackPortraitDirectory = "00_placeholder";
const portraitDirectories = hasPortraitAssets
  ? portraitDirectoriesFromFiles
  : [fallbackPortraitDirectory];

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

const placeholderCellWidth = 256;
const placeholderCellHeight = 512;
const createPlaceholderPortraitSpriteSheet = (): PortraitSpriteSheet => {
  const canvas = document.createElement("canvas");
  canvas.width = placeholderCellWidth * portraitStateOrder.length;
  canvas.height = placeholderCellHeight;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 32px sans-serif";
  ctx.fillStyle = "#f0f0f0";
  ctx.strokeStyle = "#1f1f1f";
  ctx.lineWidth = 6;

  for (let index = 0; index < portraitStateOrder.length; index += 1) {
    const state = portraitStateOrder[index];
    const label = portraitBaseNameByState[state].toUpperCase();
    const x = index * placeholderCellWidth;
    ctx.fillStyle = index % 2 === 0 ? "#2b2b2b" : "#3b3b3b";
    ctx.fillRect(x, 0, placeholderCellWidth, placeholderCellHeight);
    ctx.strokeRect(x + 6, 6, placeholderCellWidth - 12, placeholderCellHeight - 12);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillText("NO IMAGE", x + placeholderCellWidth / 2, placeholderCellHeight / 2 - 22);
    ctx.fillText(label, x + placeholderCellWidth / 2, placeholderCellHeight / 2 + 22);
  }

  return {
    url: canvas.toDataURL("image/png"),
    cellWidth: placeholderCellWidth,
    cellHeight: placeholderCellHeight,
    frameCount: portraitStateOrder.length,
    imageWidth: placeholderCellWidth,
    imageHeight: placeholderCellHeight
  };
};

const portraitStateIndex = portraitStateOrder.reduce(
  (map, state, index) => {
    map[state] = index;
    return map;
  },
  {} as Record<CharacterState, number>
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

const buildSpritesheetFromModeImages = (
  images: HTMLImageElement[],
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

const getDirectoryId = (directory: string) => directory.slice(0, 2);

const pickRandomDirectory = (directories: string[]) =>
  directories[Math.floor(Math.random() * directories.length)];

export const getPortraitDirectories = () => portraitDirectories;

export const getPortraitCellIndex = (state: CharacterState) =>
  portraitStateIndex[state];

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
  if (!hasPortraitAssets && directory === fallbackPortraitDirectory) {
    return createPlaceholderPortraitSpriteSheet();
  }
  const modeBaseNames = portraitStateOrder.map(
    (state) => portraitBaseNameByState[state]
  );
  const modeUrls = modeBaseNames.map((baseName) =>
    getPortraitFileUrl(directory, baseName)
  );
  const images = await Promise.all(modeUrls.map((url) => loadImage(url)));
  const cellWidth = images[0].naturalWidth;
  const cellHeight = images[0].naturalHeight;
  return {
    url: buildSpritesheetFromModeImages(
      images,
      cellWidth,
      cellHeight
    ),
    cellWidth,
    cellHeight,
    frameCount: modeUrls.length,
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
