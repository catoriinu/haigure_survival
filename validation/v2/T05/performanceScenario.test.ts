import {
  V2_PERFORMANCE_COLD_DURATION_SECONDS,
  V2_PERFORMANCE_COLD_FRAME_COUNT,
  V2_PERFORMANCE_DEFAULT_SEED,
  V2_PERFORMANCE_STEADY_DURATION_SECONDS,
  V2_PERFORMANCE_STEADY_FRAME_COUNT,
  V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS,
  V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND,
  createV2SeededRandom,
  isV2PerformanceWindowCoverageComplete,
  readV2PerformanceScenario,
  selectV2PerformanceWindow
} from "../../../src/v2/performanceDiagnostics";
import {
  V2_PERFORMANCE_ACCEPTANCE_POPULATION,
  V2_TEST_SURVIVAL_POPULATION
} from "../../../src/v2/survivalRuntime";

export type PerformanceScenarioTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => string
): PerformanceScenarioTestResult => {
  try {
    return Object.freeze({
      name,
      ok: true,
      detail: operation()
    });
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

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const runPerformanceScenarioTests =
  (): readonly PerformanceScenarioTestResult[] => [
    executeTest(
      "通常起動と性能受入人口を同じRuntime契約で切り替える",
      () => {
        assert(
          V2_TEST_SURVIVAL_POPULATION.npcCount === 50 &&
            V2_TEST_SURVIVAL_POPULATION
              .initialBrainwashedNpcCount === 10 &&
            V2_TEST_SURVIVAL_POPULATION.initialBitCount === 1 &&
            V2_TEST_SURVIVAL_POPULATION
              .bitReinforcementIntervalSeconds === 10 &&
            V2_TEST_SURVIVAL_POPULATION.maximumBitCount === 25,
          "通常人口が50／10／BIT初期1／最大25ではありません。"
        );
        assert(
          V2_PERFORMANCE_ACCEPTANCE_POPULATION.npcCount === 99 &&
            V2_PERFORMANCE_ACCEPTANCE_POPULATION
              .initialBrainwashedNpcCount === 66 &&
            V2_PERFORMANCE_ACCEPTANCE_POPULATION.initialBitCount === 50 &&
            V2_PERFORMANCE_ACCEPTANCE_POPULATION
              .bitReinforcementIntervalSeconds === 10 &&
            V2_PERFORMANCE_ACCEPTANCE_POPULATION.maximumBitCount === 50,
          "性能受入人口が99／66／初期50／最大50ではありません。"
        );
        return "通常50／10／BIT初期1／最大25、性能99／66／BIT初期50／最大50";
      }
    ),
    executeTest(
      "性能モードだけ同一seedと校庭内外視点を有効にする",
      () => {
        const normal = readV2PerformanceScenario("");
        const courtyard = readV2PerformanceScenario(
          "?performance=acceptance&view=courtyard&seed=12345"
        );
        const away = readV2PerformanceScenario(
          "?performance=acceptance&view=away&seed=12345"
        );
        assert(normal === null, "通常起動で性能モードが有効です。");
        assert(
          courtyard?.seed === 12345 &&
            courtyard.view === "courtyard" &&
            away?.seed === 12345 &&
            away.view === "away",
          "同一seedの校庭内外条件を構築できません。"
        );
        return "seed 12345、courtyard／away";
      }
    ),
    executeTest(
      "既定seedの乱数列を再現し10秒と60秒の窓を固定する",
      () => {
        const left = createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED
        );
        const right = createV2SeededRandom(
          V2_PERFORMANCE_DEFAULT_SEED
        );
        const leftValues = Array.from(
          { length: 32 },
          () => left()
        );
        const rightValues = Array.from(
          { length: 32 },
          () => right()
        );
        const expectedPrefix = [
          0.2109803317580372,
          0.36682258918881416,
          0.30007779435254633,
          0.6296548177488148,
          0.6665892452001572
        ];
        assert(
          leftValues.every(
            (value, index) => value === rightValues[index]
          ),
          "同一seedの乱数列が一致しません。"
        );
        assert(
          expectedPrefix.every(
            (value, index) => leftValues[index] === value
          ),
          "既定seedの既知の乱数列が変化しました。"
        );
        assert(
          V2_PERFORMANCE_COLD_DURATION_SECONDS === 10 &&
            V2_PERFORMANCE_STEADY_DURATION_SECONDS === 60 &&
            V2_PERFORMANCE_COLD_FRAME_COUNT === 600 &&
            V2_PERFORMANCE_STEADY_FRAME_COUNT === 3600,
          "性能計測窓が10秒／60秒ではありません。"
        );
        return (
          "32乱数一致、cold 10秒／600 frame、" +
          "steady 60秒／3600 frame"
        );
      }
    ),
    executeTest(
      "10秒と60秒の計測窓の先頭・末尾欠落を検出する",
      () => {
        assert(
          isV2PerformanceWindowCoverageComplete(
            {
              firstSampleElapsedSeconds: 0.01,
              lastSampleElapsedSeconds: 9.99
            },
            {
              firstSampleElapsedSeconds: 10.01,
              lastSampleElapsedSeconds: 69.99
            }
          ),
          "全計測窓を完走しても完了になりません。"
        );
        assert(
          !isV2PerformanceWindowCoverageComplete(
            {
              firstSampleElapsedSeconds: 0.01,
              lastSampleElapsedSeconds: 8
            },
            {
              firstSampleElapsedSeconds: 20,
              lastSampleElapsedSeconds: 69.99
            }
          ),
          "計測窓の欠落を完了として扱っています。"
        );
        return "cold／steadyの先頭・末尾を検証";
      }
    ),
    executeTest(
      "境界をまたいで終了するframeを開始時刻の計測窓へ含める",
      () => {
        assert(
          selectV2PerformanceWindow(9.999) === "cold" &&
            selectV2PerformanceWindow(10) === "steady" &&
            selectV2PerformanceWindow(69.999) === "steady" &&
            selectV2PerformanceWindow(70) === null,
          "frame開始時刻による計測窓の境界が不正です。"
        );
        return "9.999／10／69.999／70秒境界を検証";
      }
    ),
    executeTest(
      "性能受入の固定stepを60fps相当へ固定する",
      () => {
        assert(
          V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND === 60 &&
            Math.abs(
              V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS -
                1000 / 60
            ) <= Number.EPSILON,
          "固定stepが60fps相当ではありません。"
        );
        return `${V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS.toFixed(6)}ms`;
      }
    )
  ];
