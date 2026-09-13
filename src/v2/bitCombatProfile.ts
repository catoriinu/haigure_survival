export const V2_BIT_RED_CHANCE = 0.05;
export const V2_BIT_RED_STAT_MULTIPLIER = 3;
export const V2_BIT_RED_VISION_DISTANCE_MULTIPLIER = 2;
export const V2_BIT_RED_VISION_ANGLE_MULTIPLIER = 1.5;

export const V2_BIT_CHASE_DURATION_SECONDS = 18;
export const V2_BIT_FIXED_DURATION_SECONDS = 10;
export const V2_BIT_RANDOM_DURATION_SECONDS = 10;
export const V2_BIT_ALERT_DURATION_SECONDS = 15;
export const V2_BIT_ATTACK_COOLDOWN_SECONDS = 3;
export const V2_BIT_FIRE_TELEGRAPH_SECONDS = 0.32;
export const V2_BIT_CARPET_FIRE_INTERVAL_SECONDS = 0.25;
export const V2_BIT_CARPET_RED_FIRE_RATE_MULTIPLIER = 3.2;
export const V2_BIT_CARPET_PASS_DURATION_SECONDS = 3;
export const V2_BIT_RED_HOLD_SECONDS = 1;

export type V2BitCombatMode =
  | "chase"
  | "fixed"
  | "random"
  | "alert-send"
  | "carpet-leader";

export type V2BitPostAlertMode =
  | "chase"
  | "fixed"
  | "carpet-leader";

export type V2BitCombatProfile = Readonly<{
  isRed: boolean;
  statMultiplier: number;
  visionRange: number;
  visionCosine: number;
  searchSpeed: number;
  chaseSpeed: number;
  randomAttackSpeed: number;
  carpetSpeed: number;
}>;

const BASE_VISION_RANGE = 2.67;
const BASE_VISION_ANGLE_DEGREES = 100;
const BASE_SEARCH_SPEED = 0.25;
const BASE_CHASE_SPEED = 0.22;
const BASE_RANDOM_ATTACK_SPEED = 0.28;
const BASE_CARPET_SPEED = 0.75;
const RED_CARPET_SPEED_MULTIPLIER = 0.45;

export const V2_STANDARD_BIT_COMBAT_PROFILE: V2BitCombatProfile =
  Object.freeze({
    isRed: false,
    statMultiplier: 1,
    visionRange: BASE_VISION_RANGE,
    visionCosine: Math.cos(
      (BASE_VISION_ANGLE_DEGREES * Math.PI) / 180
    ),
    searchSpeed: BASE_SEARCH_SPEED,
    chaseSpeed: BASE_CHASE_SPEED,
    randomAttackSpeed: BASE_RANDOM_ATTACK_SPEED,
    carpetSpeed: BASE_CARPET_SPEED
  });

const assertRandomValue = (value: number): void => {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(
      `bit combat randomは0以上1未満の有限値が必要です: ${value}`
    );
  }
};

const takeRandom = (random: () => number): number => {
  const value = random();
  assertRandomValue(value);
  return value;
};

export const createV2BitCombatProfile = (
  random: () => number
): V2BitCombatProfile => {
  const isRed = takeRandom(random) < V2_BIT_RED_CHANCE;
  if (!isRed) {
    return V2_STANDARD_BIT_COMBAT_PROFILE;
  }
  const statMultiplier = isRed ? V2_BIT_RED_STAT_MULTIPLIER : 1;
  const visionAngleDegrees =
    BASE_VISION_ANGLE_DEGREES *
    (isRed ? V2_BIT_RED_VISION_ANGLE_MULTIPLIER : 1);
  return Object.freeze({
    isRed,
    statMultiplier,
    visionRange:
      BASE_VISION_RANGE *
      statMultiplier *
      (isRed ? V2_BIT_RED_VISION_DISTANCE_MULTIPLIER : 1),
    visionCosine: Math.cos((visionAngleDegrees * Math.PI) / 180),
    searchSpeed: BASE_SEARCH_SPEED * statMultiplier,
    chaseSpeed: BASE_CHASE_SPEED * statMultiplier,
    randomAttackSpeed: BASE_RANDOM_ATTACK_SPEED * statMultiplier,
    carpetSpeed:
      BASE_CARPET_SPEED *
      statMultiplier *
      (isRed ? RED_CARPET_SPEED_MULTIPLIER : 1)
  });
};

export const selectV2BitCombatMode = (
  profile: V2BitCombatProfile,
  random: () => number
): V2BitCombatMode => {
  const roll = takeRandom(random);
  if (profile.isRed) {
    if (roll < 0.7) {
      return "chase";
    }
    if (roll < 0.9) {
      return "fixed";
    }
    return "carpet-leader";
  }
  if (roll < 0.45) {
    return "chase";
  }
  if (roll < 0.65) {
    return "fixed";
  }
  if (roll < 0.8) {
    return "random";
  }
  if (roll < 0.9) {
    return "alert-send";
  }
  return "carpet-leader";
};

export const selectV2BitPostAlertMode = (
  random: () => number
): V2BitPostAlertMode => {
  const roll = takeRandom(random);
  if (roll < 0.6) {
    return "chase";
  }
  if (roll < 0.8) {
    return "fixed";
  }
  return "carpet-leader";
};

export const randomV2BitFireInterval = (
  mode: "chase" | "fixed" | "random" | "carpet",
  profile: V2BitCombatProfile,
  random: () => number
): number => {
  const roll = takeRandom(random);
  if (mode === "carpet") {
    return (
      V2_BIT_CARPET_FIRE_INTERVAL_SECONDS /
      profile.statMultiplier /
      (profile.isRed ? V2_BIT_CARPET_RED_FIRE_RATE_MULTIPLIER : 1)
    );
  }
  const [minimum, maximum] =
    mode === "chase"
      ? ([2.4, 3.2] as const)
      : mode === "fixed"
        ? ([1, 1.6] as const)
        : ([0.8, 1.4] as const);
  return (
    (minimum + (maximum - minimum) * roll) /
    profile.statMultiplier
  );
};
