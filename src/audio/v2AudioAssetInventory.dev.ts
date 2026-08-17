const detectedBgmFiles = import.meta.glob("/public/audio/bgm/*.mp3");
const detectedSeFiles = import.meta.glob("/public/audio/se/*.mp3");
const detectedVoiceFiles = import.meta.glob("/public/audio/voice/*/*.wav");

export const bgmPublicPaths = Object.freeze(Object.keys(detectedBgmFiles));
export const sePublicPaths = Object.freeze(Object.keys(detectedSeFiles));
export const voicePublicPaths = Object.freeze(Object.keys(detectedVoiceFiles));
