export const V2_TITLE_SETTINGS_STORAGE_KEY =
  "haigure-survival.title-settings";

export type V2TitleSettingsStorage = Pick<
  Storage,
  "getItem" | "setItem"
>;

export type V2TitleSettingsRootSnapshot = Readonly<{
  root: Record<string, unknown>;
  stored: boolean;
  changed: boolean;
}>;

export const isV2TitleSettingsRecord = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readV2TitleSettingsRoot = (
  storage: V2TitleSettingsStorage
): V2TitleSettingsRootSnapshot => {
  const serialized = storage.getItem(V2_TITLE_SETTINGS_STORAGE_KEY);
  if (serialized === null) {
    return Object.freeze({ root: {}, stored: false, changed: false });
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isV2TitleSettingsRecord(parsed)) {
      return Object.freeze({ root: parsed, stored: true, changed: false });
    }
    return Object.freeze({ root: {}, stored: true, changed: true });
  } catch {
    return Object.freeze({ root: {}, stored: true, changed: true });
  }
};

export const writeV2TitleSettingsSection = (
  storage: V2TitleSettingsStorage,
  root: Record<string, unknown>,
  sectionName: string,
  values: Readonly<Record<string, unknown>>
): void => {
  const currentSection = isV2TitleSettingsRecord(root[sectionName])
    ? root[sectionName]
    : {};
  storage.setItem(
    V2_TITLE_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...root,
      [sectionName]: {
        ...currentSection,
        ...values
      }
    })
  );
};
