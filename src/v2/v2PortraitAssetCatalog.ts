export type V2PortraitFileInventory = ReadonlyMap<
  string,
  ReadonlyMap<string, string>
>;

export type V2PortraitAssetCatalog = Readonly<{
  directories: readonly string[];
  filesByDirectory: V2PortraitFileInventory;
}>;

const PORTRAIT_PUBLIC_PATH_PATTERN =
  /^\/public\/picture\/chara\/([^/]+)\/([^/]+)\.(png|jpg|jpeg|webp|gif|bmp|avif|svg)$/;

export const createV2PortraitAssetCatalogFromPublicPaths = (
  publicPaths: readonly string[]
): V2PortraitAssetCatalog => {
  const mutableDirectories = new Map<string, Map<string, string>>();
  for (const publicPath of publicPaths) {
    const match = PORTRAIT_PUBLIC_PATH_PATTERN.exec(publicPath);
    if (match === null) {
      throw new Error(
        `V2 Character画像pathがportrait契約に一致しません: ${publicPath}`
      );
    }
    const directory = match[1] as string;
    const baseName = match[2] as string;
    const extension = match[3] as string;
    let filesByBaseName = mutableDirectories.get(directory);
    if (filesByBaseName === undefined) {
      filesByBaseName = new Map<string, string>();
      mutableDirectories.set(directory, filesByBaseName);
    }
    const fileName = `${baseName}.${extension}`;
    const existing = filesByBaseName.get(baseName);
    if (existing !== undefined) {
      throw new Error(
        `V2 Character画像が同じ状態名で重複しています: ${directory}/${existing}, ${directory}/${fileName}`
      );
    }
    filesByBaseName.set(baseName, fileName);
  }

  const entries = [...mutableDirectories.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([directory, filesByBaseName]) =>
        [directory, new Map(filesByBaseName)] as const
    );
  return Object.freeze({
    directories: Object.freeze(entries.map(([directory]) => directory)),
    filesByDirectory: new Map(entries)
  });
};

const EMPTY_PORTRAIT_PUBLIC_PATHS: readonly string[] = Object.freeze([]);
const portraitAssetInventory = import.meta.env.DEV
  ? await import("./v2PortraitAssetInventory.dev")
  : Object.freeze({ portraitPublicPaths: EMPTY_PORTRAIT_PUBLIC_PATHS });

export const V2_PORTRAIT_ASSET_CATALOG =
  createV2PortraitAssetCatalogFromPublicPaths(
    portraitAssetInventory.portraitPublicPaths
  );
