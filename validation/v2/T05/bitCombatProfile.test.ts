import {
  V2_BIT_CARPET_FIRE_INTERVAL_SECONDS,
  V2_BIT_CARPET_RED_FIRE_RATE_MULTIPLIER,
  V2_BIT_RED_STAT_MULTIPLIER,
  createV2BitCombatProfile,
  randomV2BitFireInterval,
  selectV2BitCombatMode,
  selectV2BitPostAlertMode
} from "../../../src/v2/bitCombatProfile";

export type BitCombatProfileTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => Readonly<{ ok: boolean; detail: string }>
): BitCombatProfileTestResult => {
  try {
    return Object.freeze({ name, ...operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail:
        error instanceof Error
          ? error.stack ?? error.message
          : String(error)
    });
  }
};

const fixedRandom = (value: number) => () => value;

const approximately = (
  actual: number,
  expected: number,
  tolerance = 1e-9
) => Math.abs(actual - expected) <= tolerance;

export const runBitCombatProfileTests =
  (): readonly BitCombatProfileTestResult[] => {
    const results: BitCombatProfileTestResult[] = [];

    results.push(
      executeTest("黒bitのV1戦闘モード境界を再現する", () => {
        const profile = createV2BitCombatProfile(fixedRandom(0.5));
        const rolls = [
          0,
          0.449999,
          0.45,
          0.649999,
          0.65,
          0.799999,
          0.8,
          0.899999,
          0.9,
          0.999999
        ];
        const modes = rolls.map((roll) =>
          selectV2BitCombatMode(profile, fixedRandom(roll))
        );
        const expected = [
          "chase",
          "chase",
          "fixed",
          "fixed",
          "random",
          "random",
          "alert-send",
          "alert-send",
          "carpet-leader",
          "carpet-leader"
        ];
        return {
          ok:
            !profile.isRed &&
            modes.every((mode, index) => mode === expected[index]),
          detail: modes.join(",")
        };
      })
    );

    results.push(
      executeTest("赤bitの倍率と70/20/10抽選を再現する", () => {
        const profile = createV2BitCombatProfile(fixedRandom(0));
        const modes = [0, 0.699999, 0.7, 0.899999, 0.9, 0.999999].map(
          (roll) =>
            selectV2BitCombatMode(profile, fixedRandom(roll))
        );
        return {
          ok:
            profile.isRed &&
            profile.statMultiplier === V2_BIT_RED_STAT_MULTIPLIER &&
            approximately(profile.visionRange, 2.67 * 6) &&
            approximately(profile.searchSpeed, 0.25 * 3) &&
            approximately(profile.chaseSpeed, 0.22 * 3) &&
            approximately(profile.carpetSpeed, 0.75 * 0.45 * 3) &&
            modes.join(",") ===
              "chase,chase,fixed,fixed,carpet-leader,carpet-leader",
          detail:
            `vision=${profile.visionRange} / search=${profile.searchSpeed} / ` +
            `chase=${profile.chaseSpeed} / carpet=${profile.carpetSpeed} / ` +
            `modes=${modes.join(",")}`
        };
      })
    );

    results.push(
      executeTest("警戒集合後の60/20/20抽選を再現する", () => {
        const modes = [0, 0.599999, 0.6, 0.799999, 0.8, 0.999999].map(
          (roll) => selectV2BitPostAlertMode(fixedRandom(roll))
        );
        return {
          ok:
            modes.join(",") ===
            "chase,chase,fixed,fixed,carpet-leader,carpet-leader",
          detail: modes.join(",")
        };
      })
    );

    results.push(
      executeTest("通常・赤bitの発射間隔倍率を再現する", () => {
        const normal = createV2BitCombatProfile(fixedRandom(0.5));
        const red = createV2BitCombatProfile(fixedRandom(0));
        const normalChase = randomV2BitFireInterval(
          "chase",
          normal,
          fixedRandom(0.5)
        );
        const redChase = randomV2BitFireInterval(
          "chase",
          red,
          fixedRandom(0.5)
        );
        const normalCarpet = randomV2BitFireInterval(
          "carpet",
          normal,
          fixedRandom(0)
        );
        const redCarpet = randomV2BitFireInterval(
          "carpet",
          red,
          fixedRandom(0)
        );
        return {
          ok:
            approximately(normalChase, 2.8) &&
            approximately(redChase, 2.8 / 3) &&
            approximately(
              normalCarpet,
              V2_BIT_CARPET_FIRE_INTERVAL_SECONDS
            ) &&
            approximately(
              redCarpet,
              V2_BIT_CARPET_FIRE_INTERVAL_SECONDS /
                V2_BIT_RED_STAT_MULTIPLIER /
                V2_BIT_CARPET_RED_FIRE_RATE_MULTIPLIER
            ),
          detail:
            `normal=${normalChase}/${normalCarpet} / ` +
            `red=${redChase}/${redCarpet}`
        };
      })
    );

    return Object.freeze(results);
  };
