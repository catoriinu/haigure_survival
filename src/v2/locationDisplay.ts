const FLOOR_RANGE_DISPLAY_NAME_PATTERN = /^\d+F-(?:\d+F|屋上)(?:\s|$)/;

export const formatV2LocationDisplayName = (
  floorDisplayName: string,
  locationDisplayName: string
) =>
  FLOOR_RANGE_DISPLAY_NAME_PATTERN.test(locationDisplayName) ||
  locationDisplayName.startsWith(floorDisplayName) ||
  locationDisplayName.endsWith(floorDisplayName)
    ? locationDisplayName
    : `${floorDisplayName} ${locationDisplayName}`;
