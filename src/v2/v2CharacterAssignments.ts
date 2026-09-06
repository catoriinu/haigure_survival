export const V2_DEFAULT_PORTRAIT_DIRECTORY = "00_default";

export type V2CharacterAssignment = Readonly<{
  actorId: string;
  voiceProfileId: string;
  portraitDirectory: string;
}>;

export type V2CharacterAssignments = readonly V2CharacterAssignment[];

export type V2CharacterAssignmentOptions = Readonly<{
  actorIds: readonly string[];
  playerActorId: string;
  voiceProfileIds: readonly string[];
  portraitDirectories: readonly string[];
  playerVoiceDirectory: string | null;
  playerPortraitDirectory: string | null;
  random: () => number;
}>;

const compareId = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const assertUniqueNonEmptyValues = (
  label: string,
  values: readonly string[],
): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (value.length === 0) {
      throw new Error(`${label}に空文字は指定できません。`);
    }
    if (seen.has(value)) {
      throw new Error(`${label}が重複しています: ${value}`);
    }
    seen.add(value);
  }
};

const nextUnitRandom = (random: () => number): number => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `V2 Character割当randomは0以上1未満の有限値が必要です: ${value}`,
    );
  }
  return value;
};

const shuffleInPlace = (values: string[], random: () => number): void => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextUnitRandom(random) * (index + 1));
    const value = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = value;
  }
};

const pickRandom = (
  values: readonly string[],
  random: () => number,
): string => {
  if (values.length === 0) {
    throw new Error("V2 Character割当の抽選候補がありません。");
  }
  const selected = values[Math.floor(nextUnitRandom(random) * values.length)];
  if (selected === undefined) {
    throw new Error("V2 Character割当の抽選結果がありません。");
  }
  return selected;
};

const getDirectoryProfileId = (directory: string): string =>
  directory.slice(0, 2);

const createActorOrder = (
  actorIds: readonly string[],
  playerActorId: string,
): readonly string[] => {
  if (playerActorId.length === 0) {
    throw new Error("V2 Character割当のplayer actor IDがありません。");
  }
  assertUniqueNonEmptyValues("V2 Character割当のactor ID", actorIds);
  if (!actorIds.includes(playerActorId)) {
    throw new Error(
      `V2 Character割当にplayer actorが含まれていません: ${playerActorId}`,
    );
  }
  return Object.freeze([
    playerActorId,
    ...actorIds.filter((actorId) => actorId !== playerActorId).sort(compareId),
  ]);
};

const assignVoiceProfileIds = (
  actorCount: number,
  voiceProfileIds: readonly string[],
  playerVoiceDirectory: string | null,
  random: () => number,
): readonly string[] => {
  if (voiceProfileIds.length === 0) {
    throw new Error("V2 Character割当にVOICE profileが必要です。");
  }
  assertUniqueNonEmptyValues(
    "V2 Character割当のVOICE profile ID",
    voiceProfileIds,
  );

  const allProfileIds = [...voiceProfileIds].sort(compareId);
  const remainingProfileIds = [...allProfileIds];
  shuffleInPlace(remainingProfileIds, random);
  const fixedPlayerProfileId =
    playerVoiceDirectory === null
      ? null
      : getDirectoryProfileId(playerVoiceDirectory);
  if (
    fixedPlayerProfileId !== null &&
    !allProfileIds.includes(fixedPlayerProfileId)
  ) {
    throw new Error(
      `自ボイスに対応するVOICE profileがありません: ${playerVoiceDirectory}`,
    );
  }

  const playerProfileId =
    fixedPlayerProfileId ?? remainingProfileIds.shift();
  if (playerProfileId === undefined) {
    throw new Error("プレイヤーへ割り当てるVOICE profileがありません。");
  }
  const npcSourceProfileIds =
    fixedPlayerProfileId === null
      ? remainingProfileIds
      : remainingProfileIds.filter(
          (profileId) => profileId !== fixedPlayerProfileId,
        );
  const npcRandomProfileIds =
    fixedPlayerProfileId === null
      ? allProfileIds
      : allProfileIds.filter(
          (profileId) => profileId !== fixedPlayerProfileId,
        );
  const assigned = [playerProfileId];
  for (let index = 1; index < actorCount; index += 1) {
    assigned.push(
      npcSourceProfileIds.length > 0
        ? (npcSourceProfileIds.shift() as string)
        : pickRandom(npcRandomProfileIds, random),
    );
  }
  return Object.freeze(assigned);
};

const assignPortraitDirectories = (
  voiceProfileIds: readonly string[],
  portraitDirectories: readonly string[],
  playerPortraitDirectory: string | null,
  random: () => number,
): readonly string[] => {
  assertUniqueNonEmptyValues(
    "V2 Character割当のportrait directory",
    portraitDirectories,
  );
  const availableDirectories =
    portraitDirectories.length === 0
      ? [V2_DEFAULT_PORTRAIT_DIRECTORY]
      : [...portraitDirectories].sort(compareId);
  if (
    playerPortraitDirectory !== null &&
    playerPortraitDirectory !== V2_DEFAULT_PORTRAIT_DIRECTORY &&
    !portraitDirectories.includes(playerPortraitDirectory)
  ) {
    throw new Error(
      `自キャラのportrait directoryがありません: ${playerPortraitDirectory}`,
    );
  }

  const assigned: Array<string | undefined> = Array.from({
    length: voiceProfileIds.length,
  });
  const matchedProfileIds = new Set<string>();
  for (let index = 0; index < voiceProfileIds.length; index += 1) {
    const profileId = voiceProfileIds[index];
    if (matchedProfileIds.has(profileId)) {
      continue;
    }
    const matchedDirectory = availableDirectories.find(
      (directory) => getDirectoryProfileId(directory) === profileId,
    );
    if (matchedDirectory !== undefined) {
      assigned[index] = matchedDirectory;
      matchedProfileIds.add(profileId);
    }
  }
  for (let index = 0; index < assigned.length; index += 1) {
    if (assigned[index] === undefined) {
      assigned[index] = pickRandom(availableDirectories, random);
    }
  }
  if (playerPortraitDirectory !== null) {
    assigned[0] = playerPortraitDirectory;
  }
  return Object.freeze(assigned as string[]);
};

export const createV2CharacterAssignments = ({
  actorIds,
  playerActorId,
  voiceProfileIds,
  portraitDirectories,
  playerVoiceDirectory,
  playerPortraitDirectory,
  random,
}: V2CharacterAssignmentOptions): V2CharacterAssignments => {
  const actorOrder = createActorOrder(actorIds, playerActorId);
  const assignedVoiceProfileIds = assignVoiceProfileIds(
    actorOrder.length,
    voiceProfileIds,
    playerVoiceDirectory,
    random,
  );
  const assignedPortraitDirectories = assignPortraitDirectories(
    assignedVoiceProfileIds,
    portraitDirectories,
    playerPortraitDirectory,
    random,
  );
  return Object.freeze(
    actorOrder.map((actorId, index) =>
      Object.freeze({
        actorId,
        voiceProfileId: assignedVoiceProfileIds[index] as string,
        portraitDirectory: assignedPortraitDirectories[index] as string,
      }),
    ),
  );
};
