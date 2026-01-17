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
const portraitDirectories = Array.from(
  new Set(
    Object.keys(portraitFiles).map((path) => path.split("/").slice(-2, -1)[0])
  )
).sort();

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

const pickLeastUsedDirectory = (
  usage: Map<string, number>,
  directories: string[]
) => {
  let selected = directories[0];
  let minCount = usage.get(selected)!;
  for (let index = 1; index < directories.length; index += 1) {
    const candidate = directories[index];
    const count = usage.get(candidate)!;
    if (count < minCount) {
      selected = candidate;
      minCount = count;
    }
  }
  return selected;
};

export const getPortraitDirectories = () => portraitDirectories;

export const getPortraitCellIndex = (state: CharacterState) =>
  portraitStateIndex[state];

export const assignPortraitDirectories = (voiceIds: string[]) => {
  const uniqueVoiceIds = Array.from(new Set(voiceIds));
  const usage = new Map<string, number>();
  for (const directory of portraitDirectories) {
    usage.set(directory, 0);
  }
  const assignments = new Map<string, string>();

  for (const voiceId of uniqueVoiceIds) {
    const matched = portraitDirectories.find(
      (directory) => getDirectoryId(directory) === voiceId
    );
    if (matched) {
      assignments.set(voiceId, matched);
      usage.set(matched, usage.get(matched)! + 1);
    }
  }

  for (const voiceId of uniqueVoiceIds) {
    if (assignments.has(voiceId)) {
      continue;
    }
    const unused = portraitDirectories.find(
      (directory) => usage.get(directory)! === 0
    );
    const selected = unused ?? pickLeastUsedDirectory(usage, portraitDirectories);
    assignments.set(voiceId, selected);
    usage.set(selected, usage.get(selected)! + 1);
  }

  return assignments;
};

export const loadPortraitSpriteSheet = async (
  directory: string
): Promise<PortraitSpriteSheet> => {
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
