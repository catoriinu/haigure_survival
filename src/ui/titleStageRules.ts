import { type BitSpawnSettings } from "./bitSpawnPanel";
import { type BrainwashSettings } from "./brainwashSettingsPanel";
import { type DefaultStartSettings } from "./defaultSettingsPanel";
import { ROULETTE_STAGE_ID } from "../world/stageIds";

export type TitleSettingsAvailability = {
  npcCountOnly: boolean;
  brainwashEnabled: boolean;
  bitSpawnEnabled: boolean;
  alarmTrapEditable: boolean;
};

export type RuntimeSettingsByStage = {
  rouletteSelected: boolean;
  runtimeDefaultStartSettings: DefaultStartSettings;
  runtimeBrainwashSettings: BrainwashSettings;
  runtimeBitSpawnInterval: number;
  runtimeMaxBitCount: number;
  runtimeAlarmTrapEnabled: boolean;
};

type NormalizeRuntimeSettingsForStageArgs = {
  stageId: string;
  titleDefaultStartSettings: DefaultStartSettings;
  titleBrainwashSettings: BrainwashSettings;
  titleBitSpawnSettings: BitSpawnSettings;
  titleAlarmTrapEnabled: boolean;
  defaultBrainwashSettings: BrainwashSettings;
  defaultBitSpawnSettings: BitSpawnSettings;
};

export const isRouletteStageId = (stageId: string) =>
  stageId === ROULETTE_STAGE_ID;

export const getTitleSettingsAvailability = (
  stageId: string
): TitleSettingsAvailability => {
  const rouletteSelected = isRouletteStageId(stageId);
  return {
    npcCountOnly: rouletteSelected,
    brainwashEnabled: !rouletteSelected,
    bitSpawnEnabled: !rouletteSelected,
    alarmTrapEditable: !rouletteSelected
  };
};

export const normalizeRuntimeSettingsForStage = ({
  stageId,
  titleDefaultStartSettings,
  titleBrainwashSettings,
  titleBitSpawnSettings,
  titleAlarmTrapEnabled,
  defaultBrainwashSettings,
  defaultBitSpawnSettings
}: NormalizeRuntimeSettingsForStageArgs): RuntimeSettingsByStage => {
  const rouletteSelected = isRouletteStageId(stageId);
  const runtimeDefaultStartSettings: DefaultStartSettings = rouletteSelected
    ? {
        ...titleDefaultStartSettings,
        startPlayerAsBrainwashCompleteGun: false,
        initialBrainwashedNpcPercent: 0
      }
    : { ...titleDefaultStartSettings };
  const runtimeBrainwashSettings: BrainwashSettings = rouletteSelected
    ? { ...defaultBrainwashSettings }
    : { ...titleBrainwashSettings };
  const runtimeAlarmTrapEnabled = rouletteSelected ? false : titleAlarmTrapEnabled;
  const runtimeBitSpawnInterval = rouletteSelected
    ? defaultBitSpawnSettings.bitSpawnInterval
    : titleBitSpawnSettings.bitSpawnInterval;
  const runtimeMaxBitCount = rouletteSelected
    ? defaultBitSpawnSettings.maxBitCount
    : titleBitSpawnSettings.disableBitSpawn
      ? 0
      : titleBitSpawnSettings.maxBitCount;
  return {
    rouletteSelected,
    runtimeDefaultStartSettings,
    runtimeBrainwashSettings,
    runtimeBitSpawnInterval,
    runtimeMaxBitCount,
    runtimeAlarmTrapEnabled
  };
};
