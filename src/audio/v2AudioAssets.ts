import voiceManifest from "./voiceManifest.json";

const V2_VOICE_PROFILE_IDS = new Set(Object.keys(voiceManifest));

export type V2AudioAssetPathInventory = Readonly<{
  baseUrl: string;
  bgmPublicPaths: readonly string[];
  sePublicPaths: readonly string[];
  voicePublicPaths: readonly string[];
}>;

export type V2AudioAssetCatalog = Readonly<{
  bgmUrls: readonly string[];
  voiceDirectories: readonly string[];
  resolveAssetUrl(relativePath: string): string;
  resolveVoiceUrl(relativePath: string): string;
  isSeAvailable(url: string): boolean;
  isVoiceFileAvailable(relativePath: string): boolean;
  selectBgmUrl(stageName: string | null, random: () => number): string | null;
}>;

const PUBLIC_PATH_PREFIX = "/public/";

export const assertV2AudioUnitRandom = (value: number): void => {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `V2音声randomは0以上1未満の有限値を返す必要があります: ${value}`,
    );
  }
};

export const pickV2AudioRandom = <T>(
  values: readonly T[],
  random: () => number,
): T | null => {
  if (values.length === 0) {
    return null;
  }
  const value = random();
  assertV2AudioUnitRandom(value);
  return values[Math.floor(value * values.length)] ?? null;
};

export const createV2AudioAssetCatalogFromPublicPaths = ({
  baseUrl,
  bgmPublicPaths,
  sePublicPaths,
  voicePublicPaths,
}: V2AudioAssetPathInventory): V2AudioAssetCatalog => {
  if (!baseUrl.endsWith("/")) {
    throw new Error(
      `V2音声assetのbaseUrlは/で終える必要があります: ${baseUrl}`,
    );
  }
  const resolvePublicPath = (publicPath: string): string => {
    if (!publicPath.startsWith(PUBLIC_PATH_PREFIX)) {
      throw new Error(
        `V2音声assetは/public/配下である必要があります: ${publicPath}`,
      );
    }
    return `${baseUrl}${publicPath.slice(PUBLIC_PATH_PREFIX.length)}`;
  };
  const resolveAssetUrl = (relativePath: string): string =>
    `${baseUrl}${relativePath}`;
  const resolveVoiceUrl = (relativePath: string): string =>
    resolveAssetUrl(`audio/voice/${relativePath}`);

  const bgmPathSet = new Set(bgmPublicPaths);
  const bgmUrls = Object.freeze(
    [...bgmPublicPaths].sort().map(resolvePublicPath),
  );
  const seUrls = new Set(sePublicPaths.map(resolvePublicPath));
  const voicePathSet = new Set(voicePublicPaths);
  const voiceDirectories = Object.freeze(
    Array.from(
      new Set(
        voicePublicPaths.map((path) => {
          const segments = path.split("/");
          return segments[segments.length - 2] ?? "";
        }),
      ),
    )
      .filter(
        (directory) =>
          directory.length >= 2 &&
          V2_VOICE_PROFILE_IDS.has(directory.slice(0, 2)),
      )
      .sort(),
  );

  return Object.freeze({
    bgmUrls,
    voiceDirectories,
    resolveAssetUrl,
    resolveVoiceUrl,
    isSeAvailable: (url: string) => seUrls.has(url),
    isVoiceFileAvailable: (relativePath: string) =>
      voicePathSet.has(`/public/audio/voice/${relativePath}`),
    selectBgmUrl: (stageName, random) => {
      if (stageName !== null) {
        const stagePath = `/public/audio/bgm/${stageName}.mp3`;
        if (bgmPathSet.has(stagePath)) {
          return resolvePublicPath(stagePath);
        }
      }
      return pickV2AudioRandom(bgmUrls, random);
    },
  });
};

const EMPTY_AUDIO_PUBLIC_PATHS: readonly string[] = Object.freeze([]);
const audioAssetInventory = import.meta.env.DEV
  ? await import("./v2AudioAssetInventory.dev")
  : Object.freeze({
      bgmPublicPaths: EMPTY_AUDIO_PUBLIC_PATHS,
      sePublicPaths: EMPTY_AUDIO_PUBLIC_PATHS,
      voicePublicPaths: EMPTY_AUDIO_PUBLIC_PATHS,
    });

export const V2_AUDIO_ASSET_CATALOG = createV2AudioAssetCatalogFromPublicPaths({
  baseUrl: import.meta.env.BASE_URL,
  bgmPublicPaths: audioAssetInventory.bgmPublicPaths,
  sePublicPaths: audioAssetInventory.sePublicPaths,
  voicePublicPaths: audioAssetInventory.voicePublicPaths,
});

export const getV2VoiceDirectories = (): readonly string[] =>
  V2_AUDIO_ASSET_CATALOG.voiceDirectories;

export const getV2VoiceProfileIdByDirectory = (
  directory: string,
): string | null => {
  const profileId = directory.slice(0, 2);
  return V2_VOICE_PROFILE_IDS.has(profileId) ? profileId : null;
};
