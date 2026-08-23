import type { V2TitleSettingsSnapshot } from "../v2TitleSettingsStore";

export const doV2TitleSettingsSnapshotsMatch = (
  active: V2TitleSettingsSnapshot,
  current: V2TitleSettingsSnapshot
): boolean => JSON.stringify(active) === JSON.stringify(current);
