const detectedBgmFiles = import.meta.glob("/public/audio/bgm/*.mp3", { query: "?url", import: "default" });
const detectedSeFiles = import.meta.glob("/public/audio/se/*.mp3", { query: "?url", import: "default" });
const detectedVoiceFiles = import.meta.glob("/public/audio/voice/*/*.wav", { query: "?url", import: "default" });

export const bgmPublicPaths = Object.freeze(Object.keys(detectedBgmFiles));
export const sePublicPaths = Object.freeze(Object.keys(detectedSeFiles));
export const voicePublicPaths = Object.freeze(Object.keys(detectedVoiceFiles));
