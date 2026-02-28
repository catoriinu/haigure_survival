export type StageCatalogEntryConfig = {
  id: string;
  label: string;
  jsonFile: string;
};

export type SeConfig = {
  bitMove: string;
  bitAlert: string;
  bitTarget: string;
  alarm: string;
  beamNonTarget: string[];
  beamTarget: string[];
  hit: string[];
};

export type PortraitStateBaseNames = {
  normal: string;
  evade: string;
  "hit-a": string;
  "hit-b": string;
  "brainwash-in-progress": string;
  "brainwash-complete-gun": string;
  "brainwash-complete-no-gun": string;
  "brainwash-complete-haigure": string;
  "brainwash-complete-haigure-formation": string;
};

export type GameConfig = {
  version: string;
  stageCatalog: StageCatalogEntryConfig[];
  audio: {
    bgm: {
      byStage: Record<string, string>;
      fallback: string[];
    };
    se: SeConfig;
    voiceManifest: string;
  };
  portraits: {
    directories: string[];
    extensions: string[];
    stateBaseNames: PortraitStateBaseNames;
  };
};

export type VoiceHaigureState = {
  enter: string[];
  loop: string[];
};

export type VoiceStates = {
  normal: string[];
  evade: string[];
  "hit-a": string[];
  "hit-b": string[];
  "brainwash-in-progress": string[];
  "brainwash-complete-gun": string[];
  "brainwash-complete-no-gun": string[];
  "brainwash-complete-haigure": VoiceHaigureState;
  "brainwash-complete-haigure-formation": string[];
};

export type VoiceManifest = Record<string, VoiceStates>;
