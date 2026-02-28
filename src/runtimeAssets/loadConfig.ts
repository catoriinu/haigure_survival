import type { GameConfig, VoiceManifest } from "./types";

const trimSlash = (value: string) => value.replace(/^\/+|\/+$/g, "");

const joinAssetPath = (...segments: string[]) =>
  segments
    .map((segment) => trimSlash(segment))
    .filter((segment) => segment.length > 0)
    .join("/");

export const buildAssetUrl = (...segments: string[]) =>
  `/${joinAssetPath(...segments)}`;

const loadJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load asset config: ${url}`);
  }
  return (await response.json()) as T;
};

export const loadGameConfig = () =>
  loadJson<GameConfig>(buildAssetUrl("config", "game-config.json"));

export const loadVoiceManifest = (gameConfig: GameConfig) =>
  loadJson<VoiceManifest>(buildAssetUrl(gameConfig.audio.voiceManifest));

export const loadBgmFileNames = () =>
  loadJson<string[]>(buildAssetUrl("config", "bgm-files.json"));

export const loadSeFileNames = () =>
  loadJson<string[]>(buildAssetUrl("config", "se-files.json"));

export const loadPortraitDirectories = () =>
  loadJson<string[]>(buildAssetUrl("config", "portrait-directories.json"));
