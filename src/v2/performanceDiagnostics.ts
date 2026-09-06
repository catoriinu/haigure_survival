import {
  EngineInstrumentation,
  SceneInstrumentation,
  type Engine,
  type Scene
} from "@babylonjs/core";

export const V2_PERFORMANCE_COLD_DURATION_SECONDS = 10;
export const V2_PERFORMANCE_STEADY_DURATION_SECONDS = 60;
export const V2_PERFORMANCE_DEFAULT_SEED = 20260725;
export const V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND = 60;
export const V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS =
  1000 / V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND;
export const V2_PERFORMANCE_COLD_FRAME_COUNT =
  V2_PERFORMANCE_COLD_DURATION_SECONDS *
  V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND;
export const V2_PERFORMANCE_STEADY_FRAME_COUNT =
  V2_PERFORMANCE_STEADY_DURATION_SECONDS *
  V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND;
export const V2_PERFORMANCE_STRESS_DURATION_SECONDS = 120;

export type V2PerformanceView = "courtyard" | "away";
export type V2PerformanceProfile = "fixed-4200" | "normal" | "stress";
export type V2PerformanceStatus =
  | "collecting"
  | "draining"
  | "complete"
  | "aborted";

export type V2PerformanceScenario = Readonly<{
  profile: V2PerformanceProfile;
  seed: number;
  view: V2PerformanceView;
}>;

export type V2PerformancePopulation = Readonly<{
  npcCount: number;
  initialBrainwashedNpcCount: number;
  initialBitCount: number;
}>;

export type V2PerformanceSection =
  | "player"
  | "survival"
  | "beam"
  | "hit-effect"
  | "player-combat"
  | "alarm"
  | "npc"
  | "bit"
  | "execution"
  | "frame-build"
  | "render"
  | "traversal"
  | "interaction"
  | "minimap"
  | "runtime-hud"
  | "mission-hud"
  | "audio"
  | "alarm-visual"
  | "diagnostics"
  | "mission";

export type V2PerformanceMetricSummary = Readonly<{
  sampleCount: number;
  positiveSampleCount: number;
  first: number;
  last: number;
  total: number;
  average: number;
  minimum: number;
  p50: number;
  p95: number;
  p99: number;
  maximum: number;
}>;

export type V2PerformanceWindowReport = Readonly<{
  durationSeconds: number;
  firstSampleElapsedSeconds: number | null;
  lastSampleElapsedSeconds: number | null;
  coveredDurationSeconds: number;
  frameIntervalTimeMs: V2PerformanceMetricSummary;
  totalFrameTimeMs: V2PerformanceMetricSummary;
  frameWorkTimeMs: V2PerformanceMetricSummary;
  sectionTimeMs: Readonly<
    Partial<Record<V2PerformanceSection, V2PerformanceMetricSummary>>
  >;
  renderTimeMs: V2PerformanceMetricSummary | null;
  activeMeshEvaluationTimeMs: V2PerformanceMetricSummary;
  gpuFrameTimeMs: V2PerformanceMetricSummary | null;
  drawCalls: V2PerformanceMetricSummary;
  activeMeshes: V2PerformanceMetricSummary;
  totalMeshes: V2PerformanceMetricSummary;
  heapBytes: V2PerformanceMetricSummary | null;
  counters: Readonly<
    Record<string, V2PerformanceMetricSummary>
  >;
  longTaskCount: number;
  longestTaskMs: number;
}>;

export type V2PerformanceSlowWorkFrame = Readonly<{
  // 最初の計測frameを0とする。elapsedSecondsはprofileの計測窓と同じ時間軸。
  frameIndex: number;
  elapsedSeconds: number;
  frameStartedAtMilliseconds: number;
  frameWorkTimeMs: number;
  sectionTimeMs: Readonly<Partial<Record<V2PerformanceSection, number>>>;
  counters: Readonly<Record<string, number>>;
}>;

export type V2PerformanceReport = Readonly<{
  schemaVersion: 2;
  profile: V2PerformanceProfile;
  status: V2PerformanceStatus;
  abortReason: string | null;
  seed: number;
  view: V2PerformanceView;
  targetFramesPerSecond: number;
  population: V2PerformancePopulation;
  renderWidth: number;
  renderHeight: number;
  elapsedSeconds: number;
  wallElapsedSeconds: number;
  simulationElapsedSeconds: number;
  measurementStartedAtMilliseconds: number | null;
  measurementEndedAtMilliseconds: number | null;
  finalFrameCallbackAtMilliseconds: number | null;
  sampledFrameCount: number;
  slowestWorkFrames: readonly V2PerformanceSlowWorkFrame[];
  finalFrameIntervalObserved: boolean;
  longTasksDrained: boolean;
  availability: Readonly<{
    gpuFrameTime: boolean;
    heap: boolean;
    longTask: boolean;
  }>;
  cold: V2PerformanceWindowReport;
  steady: V2PerformanceWindowReport;
  stress: V2PerformanceWindowReport | null;
  acceptance: Readonly<{
    status: "incomplete" | "passed" | "failed" | "external-validation-required";
    sampleWindowsComplete: boolean;
    renderSizeIs1920x1080: boolean;
    populationMatchesProfile: boolean;
    populationStayedAtExpectedCounts: boolean;
    initialBrainwashedNpcCountWasExpected: boolean;
    bitReinforcementObserved: boolean;
    combatWorkloadObserved: boolean;
    p95AtMost16Point7Ms: boolean;
    p99AtMost25Ms: boolean;
    maximumAtMost50Ms: boolean;
    longTaskCountIsZero: boolean;
    passed: boolean | null;
  }>;
}>;

export type V2PerformanceProgress = Readonly<{
  status: V2PerformanceStatus;
  elapsedSeconds: number;
  wallElapsedSeconds: number;
  simulationElapsedSeconds: number;
  renderWidth: number;
  renderHeight: number;
}>;

export interface V2PerformanceDiagnostics {
  readonly scenario: V2PerformanceScenario;
  beginFrame(): void;
  beginSection(section: V2PerformanceSection): number;
  finishSection(
    section: V2PerformanceSection,
    startedAt: number
  ): void;
  measure<T>(
    section: V2PerformanceSection,
    operation: () => T
  ): T;
  count(name: string, value?: number): void;
  finishFrame(simulationElapsedSeconds: number): void;
  finalize(): Promise<V2PerformanceReport>;
  abort(reason: string): void;
  getProgress(): V2PerformanceProgress;
  getReport(): V2PerformanceReport;
  dispose(): void;
}

type MutableWindowSamples = {
  frameIntervalTimeMs: number[];
  totalFrameTimeMs: number[];
  frameWorkTimeMs: number[];
  sectionTimeMs: Map<V2PerformanceSection, number[]>;
  renderTimeMs: number[];
  activeMeshEvaluationTimeMs: number[];
  gpuFrameTimeMs: number[];
  drawCalls: number[];
  activeMeshes: number[];
  totalMeshes: number[];
  heapBytes: number[];
  counters: Map<string, number[]>;
  longTaskDurationsMs: number[];
  firstSampleElapsedSeconds: number | null;
  lastSampleElapsedSeconds: number | null;
  lastIntervalEndElapsedSeconds: number | null;
};

type PerformanceWithMemory = Performance &
  Partial<
    Readonly<{
    memory: Readonly<{
      usedJSHeapSize: number;
    }>;
    }>
  >;

const createWindowSamples = (): MutableWindowSamples => ({
  frameIntervalTimeMs: [],
  totalFrameTimeMs: [],
  frameWorkTimeMs: [],
  sectionTimeMs: new Map(),
  renderTimeMs: [],
  activeMeshEvaluationTimeMs: [],
  gpuFrameTimeMs: [],
  drawCalls: [],
  activeMeshes: [],
  totalMeshes: [],
  heapBytes: [],
  counters: new Map(),
  longTaskDurationsMs: [],
  firstSampleElapsedSeconds: null,
  lastSampleElapsedSeconds: null,
  lastIntervalEndElapsedSeconds: null
});

const percentile = (
  sortedValues: readonly number[],
  fraction: number
) => {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.ceil(sortedValues.length * fraction) - 1;
  return sortedValues[Math.max(0, index)];
};

const summarize = (
  values: readonly number[]
): V2PerformanceMetricSummary => {
  if (values.length === 0) {
    return Object.freeze({
      sampleCount: 0,
      positiveSampleCount: 0,
      first: 0,
      last: 0,
      total: 0,
      average: 0,
      minimum: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      maximum: 0
    });
  }
  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    sampleCount: values.length,
    positiveSampleCount: values.filter((value) => value > 0).length,
    first: values[0],
    last: values[values.length - 1],
    total,
    average: total / values.length,
    minimum: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    maximum: sorted[sorted.length - 1]
  });
};

const summarizeMap = <Key extends string>(
  values: ReadonlyMap<Key, readonly number[]>
): Readonly<Record<Key, V2PerformanceMetricSummary>> => {
  const entries = [...values].map(
    ([key, samples]) => [key, summarize(samples)] as const
  );
  return Object.freeze(
    Object.fromEntries(entries)
  ) as Readonly<Record<Key, V2PerformanceMetricSummary>>;
};

const buildWindowReport = (
  durationSeconds: number,
  samples: MutableWindowSamples
): V2PerformanceWindowReport =>
  Object.freeze({
    durationSeconds,
    firstSampleElapsedSeconds:
      samples.firstSampleElapsedSeconds,
    lastSampleElapsedSeconds:
      samples.lastSampleElapsedSeconds,
    coveredDurationSeconds:
      samples.firstSampleElapsedSeconds === null ||
      samples.lastIntervalEndElapsedSeconds === null
        ? 0
        : samples.lastIntervalEndElapsedSeconds -
          samples.firstSampleElapsedSeconds,
    frameIntervalTimeMs: summarize(samples.frameIntervalTimeMs),
    totalFrameTimeMs: summarize(samples.totalFrameTimeMs),
    frameWorkTimeMs: summarize(samples.frameWorkTimeMs),
    sectionTimeMs: summarizeMap(samples.sectionTimeMs),
    renderTimeMs: samples.renderTimeMs.length > 0
      ? summarize(samples.renderTimeMs)
      : null,
    activeMeshEvaluationTimeMs: summarize(
      samples.activeMeshEvaluationTimeMs
    ),
    gpuFrameTimeMs: samples.gpuFrameTimeMs.length > 0
      ? summarize(samples.gpuFrameTimeMs)
      : null,
    drawCalls: summarize(samples.drawCalls),
    activeMeshes: summarize(samples.activeMeshes),
    totalMeshes: summarize(samples.totalMeshes),
    heapBytes: samples.heapBytes.length > 0
      ? summarize(samples.heapBytes)
      : null,
    counters: summarizeMap(samples.counters),
    longTaskCount: samples.longTaskDurationsMs.length,
    longestTaskMs:
      samples.longTaskDurationsMs.length === 0
        ? 0
      : Math.max(...samples.longTaskDurationsMs)
  });

type V2PerformanceWindowCoverage = Readonly<{
  firstSampleElapsedSeconds: number | null;
  lastSampleElapsedSeconds: number | null;
}>;

export const isV2PerformanceWindowCoverageComplete = (
  cold: V2PerformanceWindowCoverage,
  steady: V2PerformanceWindowCoverage
) =>
  cold.firstSampleElapsedSeconds !== null &&
  cold.firstSampleElapsedSeconds <= 0.5 &&
  cold.lastSampleElapsedSeconds !== null &&
  cold.lastSampleElapsedSeconds >=
    V2_PERFORMANCE_COLD_DURATION_SECONDS - 0.5 &&
  steady.firstSampleElapsedSeconds !== null &&
  steady.firstSampleElapsedSeconds <=
    V2_PERFORMANCE_COLD_DURATION_SECONDS + 0.5 &&
  steady.lastSampleElapsedSeconds !== null &&
  steady.lastSampleElapsedSeconds >=
    V2_PERFORMANCE_COLD_DURATION_SECONDS +
      V2_PERFORMANCE_STEADY_DURATION_SECONDS -
      0.5;

export const selectV2PerformanceWindow = (
  frameStartedElapsedSeconds: number
): "cold" | "steady" | null => {
  if (
    frameStartedElapsedSeconds <
    V2_PERFORMANCE_COLD_DURATION_SECONDS
  ) {
    return "cold";
  }
  if (
    frameStartedElapsedSeconds <
    V2_PERFORMANCE_COLD_DURATION_SECONDS +
      V2_PERFORMANCE_STEADY_DURATION_SECONDS
  ) {
    return "steady";
  }
  return null;
};

const parseSeed = (value: string | null) => {
  if (value === null) {
    return V2_PERFORMANCE_DEFAULT_SEED;
  }
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error(
      "performance seedには0以上の安全な整数が必要です。"
    );
  }
  return seed;
};

export const readV2PerformanceScenario = (
  search: string
): V2PerformanceScenario | null => {
  const parameters = new URLSearchParams(search);
  const requestedProfile = parameters.get("performance");
  if (requestedProfile === null) {
    return null;
  }
  const profile: V2PerformanceProfile =
    requestedProfile === "acceptance"
      ? "fixed-4200"
      : requestedProfile === "normal" || requestedProfile === "stress"
        ? requestedProfile
        : (() => {
            throw new Error(
              "performanceにはacceptance、normal、stressのいずれかが必要です。"
            );
          })();
  if (profile !== "fixed-4200" && !parameters.has("seed")) {
    throw new Error("実時間性能計測にはseedの明示指定が必要です。");
  }
  const requestedView = parameters.get("view");
  const view: V2PerformanceView =
    requestedView === null || requestedView === "courtyard"
      ? "courtyard"
      : requestedView === "away"
        ? "away"
        : (() => {
            throw new Error(
              "performance viewはcourtyardまたはawayが必要です。"
            );
          })();
  return Object.freeze({
    profile,
    seed: parseSeed(parameters.get("seed")),
    view
  });
};

export const createV2SeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export type V2PerformanceFrameMetrics = Readonly<{
  renderWidth: number;
  renderHeight: number;
  renderTimeMs: number | null;
  activeMeshEvaluationTimeMs: number;
  gpuFrameTimeMs: number | null;
  drawCalls: number;
  activeMeshes: number;
  totalMeshes: number;
  heapBytes: number | null;
}>;

export type V2PerformanceLongTaskEntry = Readonly<{
  startTime: number;
  duration: number;
}>;

export interface V2PerformanceSampleCollector {
  beginFrame(startedAtMs: number): void;
  addSectionTime(section: V2PerformanceSection, durationMs: number): void;
  count(name: string, value?: number): void;
  finishFrame(
    finishedAtMs: number,
    simulationElapsedSeconds: number,
    metrics: V2PerformanceFrameMetrics
  ): void;
  recordLongTasks(entries: readonly V2PerformanceLongTaskEntry[]): void;
  finishLongTaskDrain(): V2PerformanceReport;
  abort(reason: string): V2PerformanceReport;
  getStatus(): V2PerformanceStatus;
  getProgress(): V2PerformanceProgress;
  getReport(): V2PerformanceReport;
}

type V2PerformanceWindowName = "cold" | "steady" | "stress";

const selectMeasurementWindow = (
  profile: V2PerformanceProfile,
  elapsedSeconds: number
): V2PerformanceWindowName | null => {
  if (profile === "stress") {
    return elapsedSeconds < V2_PERFORMANCE_STRESS_DURATION_SECONDS
      ? "stress"
      : null;
  }
  return selectV2PerformanceWindow(elapsedSeconds);
};

const clearWindowSamples = (samples: MutableWindowSamples) => {
  samples.frameIntervalTimeMs.length = 0;
  samples.totalFrameTimeMs.length = 0;
  samples.frameWorkTimeMs.length = 0;
  samples.sectionTimeMs.clear();
  samples.renderTimeMs.length = 0;
  samples.activeMeshEvaluationTimeMs.length = 0;
  samples.gpuFrameTimeMs.length = 0;
  samples.drawCalls.length = 0;
  samples.activeMeshes.length = 0;
  samples.totalMeshes.length = 0;
  samples.heapBytes.length = 0;
  samples.counters.clear();
  samples.longTaskDurationsMs.length = 0;
};

// 実clock・Babylonの読取と集計を分け、productionとfixtureが同じ集計器を使う。
export const createV2PerformanceSampleCollector = ({
  scenario,
  population,
  renderWidth: initialRenderWidth,
  renderHeight: initialRenderHeight,
  longTaskAvailable
}: Readonly<{
  scenario: V2PerformanceScenario;
  population: V2PerformancePopulation;
  renderWidth: number;
  renderHeight: number;
  longTaskAvailable: boolean;
}>): V2PerformanceSampleCollector => {
  if (
    scenario.profile !== "fixed-4200" &&
    scenario.profile !== "normal" &&
    scenario.profile !== "stress"
  ) {
    throw new Error("性能計測profileを明示してください。");
  }

  const samplesByWindow = {
    cold: createWindowSamples(),
    steady: createWindowSamples(),
    stress: createWindowSamples()
  };
  const sectionTimeThisFrame = new Map<V2PerformanceSection, number>();
  const countersThisFrame = new Map<string, number>();
  const longTasks: V2PerformanceLongTaskEntry[] = [];
  const slowestWorkFrames: V2PerformanceSlowWorkFrame[] = [];
  let status: V2PerformanceStatus = "collecting";
  let abortReason: string | null = null;
  let measurementStartedAtMs: number | null = null;
  let measurementEndedAtMs: number | null = null;
  let coldEndedAtMs: number | null = null;
  let previousFrameStartedAtMs: number | null = null;
  let activeFrame: Readonly<{
    startedAtMs: number;
    elapsedSeconds: number;
    previousIntervalMs: number | null;
    samples: MutableWindowSamples;
  }> | null = null;
  let pendingInterval: Readonly<{
    startedAtMs: number;
    samples: MutableWindowSamples;
  }> | null = null;
  let elapsedSeconds = 0;
  let wallElapsedSeconds = 0;
  let simulationElapsedSeconds = 0;
  let sampledFrameCount = 0;
  let renderWidth = initialRenderWidth;
  let renderHeight = initialRenderHeight;
  let finalFrameIntervalObserved = false;
  let longTasksDrained = false;
  let finalReport: V2PerformanceReport | null = null;

  const releaseSamples = () => {
    for (const samples of Object.values(samplesByWindow)) {
      clearWindowSamples(samples);
    }
    sectionTimeThisFrame.clear();
    countersThisFrame.clear();
    longTasks.length = 0;
    slowestWorkFrames.length = 0;
    activeFrame = null;
    pendingInterval = null;
  };

  const getLongTaskWindow = (entry: V2PerformanceLongTaskEntry) => {
    const startedAtMs = entry.startTime;
    if (
      measurementStartedAtMs === null ||
      startedAtMs + entry.duration <= measurementStartedAtMs ||
      (measurementEndedAtMs !== null && startedAtMs >= measurementEndedAtMs)
    ) {
      return null;
    }
    // 最初のplaying callbackを含むtaskはcallback入口より前に始まる場合がある。
    if (startedAtMs < measurementStartedAtMs) {
      return scenario.profile === "stress" ? "stress" : "cold";
    }
    if (scenario.profile === "fixed-4200") {
      return coldEndedAtMs === null || startedAtMs < coldEndedAtMs
        ? "cold"
        : "steady";
    }
    return selectMeasurementWindow(
      scenario.profile,
      (startedAtMs - measurementStartedAtMs) / 1000
    );
  };

  const getReport = (): V2PerformanceReport => {
    if (finalReport !== null) {
      return finalReport;
    }
    const longTasksByWindow: Record<V2PerformanceWindowName, number[]> = {
      cold: [],
      steady: [],
      stress: []
    };
    for (const entry of longTasks) {
      const window = getLongTaskWindow(entry);
      if (window !== null) {
        longTasksByWindow[window].push(entry.duration);
      }
    }
    const reportWindow = (
      name: V2PerformanceWindowName,
      durationSeconds: number
    ) => buildWindowReport(durationSeconds, {
      ...samplesByWindow[name],
      longTaskDurationsMs: longTasksByWindow[name]
    });
    const cold = reportWindow("cold", V2_PERFORMANCE_COLD_DURATION_SECONDS);
    const steady = reportWindow("steady", V2_PERFORMANCE_STEADY_DURATION_SECONDS);
    const stress = scenario.profile === "stress"
      ? reportWindow("stress", V2_PERFORMANCE_STRESS_DURATION_SECONDS)
      : null;
    const windows = stress === null ? [cold, steady] : [stress];
    const counterTotal = (report: V2PerformanceWindowReport, name: string) =>
      report.counters[name]?.total ?? 0;
    const counterPositiveRatio = (
      report: V2PerformanceWindowReport,
      name: string
    ) => {
      const summary = report.counters[name];
      return summary && summary.sampleCount > 0
        ? summary.positiveSampleCount / summary.sampleCount
        : 0;
    };
    const sampleWindowsComplete =
      status === "complete" &&
      finalFrameIntervalObserved &&
      longTasksDrained &&
      windows.every((window) =>
        window.frameWorkTimeMs.sampleCount > 0 &&
        window.frameWorkTimeMs.sampleCount === window.frameIntervalTimeMs.sampleCount
      ) &&
      (scenario.profile !== "fixed-4200" ||
        (isV2PerformanceWindowCoverageComplete(cold, steady) &&
          cold.frameWorkTimeMs.sampleCount === V2_PERFORMANCE_COLD_FRAME_COUNT &&
          steady.frameWorkTimeMs.sampleCount === V2_PERFORMANCE_STEADY_FRAME_COUNT));
    const renderSizeIs1920x1080 =
      renderWidth === 1920 &&
      renderHeight === 1080 &&
      windows.every((window) =>
        counterTotal(window, "scenario.render-size-mismatch") === 0
      );
    const populationMatchesProfile = scenario.profile === "normal"
      ? population.npcCount === 50 &&
        population.initialBrainwashedNpcCount === 10 &&
        population.initialBitCount === 1
      : population.npcCount === 99 &&
        population.initialBrainwashedNpcCount === 66 &&
        population.initialBitCount === 50;
    const maximumBitPopulation = scenario.profile === "normal" ? 25 : 50;
    const populationStayedAtExpectedCounts = windows.every((window) => {
      // 出現演出中のBITはactor sphereへ未登録でも、既に実個体を確保している。
      const bitPopulation = window.counters["bit.population-count"];
      return window.counters["scenario.npc-count"]?.minimum === population.npcCount &&
        window.counters["scenario.npc-count"]?.maximum === population.npcCount &&
        bitPopulation !== undefined &&
        bitPopulation.sampleCount === window.frameWorkTimeMs.sampleCount &&
        bitPopulation.minimum >= population.initialBitCount &&
        bitPopulation.maximum <= maximumBitPopulation;
    });
    const initialWindow = stress === null ? cold : stress;
    const initialBrainwashedNpcCountWasExpected =
      initialWindow.counters["scenario.brainwashed-npc-count"]?.first ===
        population.initialBrainwashedNpcCount;
    const bitReinforcementObserved = scenario.profile !== "normal" ||
      windows.some((window) => counterTotal(window, "bit.reinforcement-spawns") > 0);
    const combatWorkloadObserved = scenario.profile === "fixed-4200"
      ? counterTotal(cold, "scenario.alert-injections") >= 1 &&
        counterTotal(cold, "bit.route-plans.chase") >= 1 &&
        counterPositiveRatio(steady, "scenario.active-alerts") >= 0.9 &&
        counterPositiveRatio(steady, "scenario.alive-targets") >= 0.9 &&
        counterPositiveRatio(steady, "scenario.playing") >= 0.9 &&
        (steady.counters["beam.spawned"]?.positiveSampleCount ?? 0) >= 6
      : windows.some((window) => counterTotal(window, "beam.spawned") > 0) &&
        (scenario.profile === "stress" ||
          counterPositiveRatio(steady, "scenario.playing") >= 0.9);
    // 固定4200 frameだけ旧total定義を使う。通常の描画込み時間は次callbackまでの実間隔。
    const thresholdMetrics = windows.map((window) =>
      scenario.profile === "fixed-4200"
        ? window.totalFrameTimeMs
        : window.frameIntervalTimeMs
    );
    const p95AtMost16Point7Ms = thresholdMetrics.every((metric) => metric.p95 <= 16.7);
    const p99AtMost25Ms = thresholdMetrics.every((metric) => metric.p99 <= 25);
    const maximumAtMost50Ms = thresholdMetrics.every((metric) => metric.maximum <= 50);
    const longTaskCountIsZero =
      longTaskAvailable && windows.every((window) => window.longTaskCount === 0);
    const configurationAndPopulationValid =
      renderSizeIs1920x1080 &&
      populationMatchesProfile &&
      populationStayedAtExpectedCounts &&
      initialBrainwashedNpcCountWasExpected;
    const passed = scenario.profile === "stress"
      ? null
      : sampleWindowsComplete &&
        configurationAndPopulationValid &&
        bitReinforcementObserved &&
        combatWorkloadObserved &&
        p95AtMost16Point7Ms &&
        p99AtMost25Ms &&
        maximumAtMost50Ms &&
        longTaskCountIsZero;
    const acceptanceStatus = !sampleWindowsComplete
      ? "incomplete"
      : scenario.profile === "stress"
        ? configurationAndPopulationValid
          ? "external-validation-required"
          : "failed"
        : passed ? "passed" : "failed";
    return Object.freeze({
      schemaVersion: 2,
      profile: scenario.profile,
      status,
      abortReason,
      seed: scenario.seed,
      view: scenario.view,
      targetFramesPerSecond: V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND,
      population,
      renderWidth,
      renderHeight,
      elapsedSeconds,
      wallElapsedSeconds,
      simulationElapsedSeconds,
      measurementStartedAtMilliseconds: measurementStartedAtMs,
      measurementEndedAtMilliseconds: measurementEndedAtMs === null
        ? null
        : scenario.profile === "fixed-4200"
          ? measurementEndedAtMs
          : measurementStartedAtMs! + (
            scenario.profile === "stress"
              ? V2_PERFORMANCE_STRESS_DURATION_SECONDS
              : V2_PERFORMANCE_COLD_DURATION_SECONDS + V2_PERFORMANCE_STEADY_DURATION_SECONDS
          ) * 1000,
      finalFrameCallbackAtMilliseconds: measurementEndedAtMs,
      sampledFrameCount,
      slowestWorkFrames: Object.freeze([...slowestWorkFrames]),
      finalFrameIntervalObserved,
      longTasksDrained,
      availability: Object.freeze({
        gpuFrameTime: windows.every((window) => window.gpuFrameTimeMs !== null),
        heap: windows.every((window) => window.heapBytes !== null),
        longTask: longTaskAvailable
      }),
      cold,
      steady,
      stress,
      acceptance: Object.freeze({
        status: acceptanceStatus,
        sampleWindowsComplete,
        renderSizeIs1920x1080,
        populationMatchesProfile,
        populationStayedAtExpectedCounts,
        initialBrainwashedNpcCountWasExpected,
        bitReinforcementObserved,
        combatWorkloadObserved,
        p95AtMost16Point7Ms,
        p99AtMost25Ms,
        maximumAtMost50Ms,
        longTaskCountIsZero,
        passed
      })
    });
  };

  return Object.freeze<V2PerformanceSampleCollector>({
    beginFrame: (startedAtMs: number) => {
      if (status !== "collecting") {
        return;
      }
      if (activeFrame !== null) {
        throw new Error("前frameのfinishFrameより先にbeginFrameを呼べません。");
      }
      measurementStartedAtMs ??= startedAtMs;
      wallElapsedSeconds = (startedAtMs - measurementStartedAtMs) / 1000;
      elapsedSeconds = scenario.profile === "fixed-4200"
        ? sampledFrameCount / V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND
        : wallElapsedSeconds;
      if (pendingInterval !== null) {
        pendingInterval.samples.frameIntervalTimeMs.push(
          startedAtMs - pendingInterval.startedAtMs
        );
        pendingInterval.samples.lastIntervalEndElapsedSeconds = elapsedSeconds;
        pendingInterval = null;
      }
      if (
        scenario.profile === "fixed-4200" &&
        sampledFrameCount === V2_PERFORMANCE_COLD_FRAME_COUNT
      ) {
        coldEndedAtMs = startedAtMs;
      }
      const window = selectMeasurementWindow(scenario.profile, elapsedSeconds);
      if (window === null) {
        measurementEndedAtMs = startedAtMs;
        finalFrameIntervalObserved = sampledFrameCount > 0;
        status = "draining";
        return;
      }
      activeFrame = {
        startedAtMs,
        elapsedSeconds,
        previousIntervalMs: previousFrameStartedAtMs === null
          ? null
          : startedAtMs - previousFrameStartedAtMs,
        samples: samplesByWindow[window]
      };
      previousFrameStartedAtMs = startedAtMs;
      sectionTimeThisFrame.clear();
      countersThisFrame.clear();
    },
    addSectionTime: (section, durationMs) => {
      if (activeFrame !== null && status === "collecting") {
        sectionTimeThisFrame.set(
          section,
          (sectionTimeThisFrame.get(section) ?? 0) + durationMs
        );
      }
    },
    count: (name, value = 1) => {
      if (activeFrame === null || status !== "collecting") {
        return;
      }
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("V2性能診断counter " + name + "には0以上の有限値が必要です。");
      }
      countersThisFrame.set(name, (countersThisFrame.get(name) ?? 0) + value);
    },
    finishFrame: (finishedAtMs, nextSimulationElapsedSeconds, metrics) => {
      if (status !== "collecting") {
        return;
      }
      if (activeFrame === null) {
        throw new Error("V2性能診断のfinishFrameはbeginFrame後に実行してください。");
      }
      const samples = activeFrame.samples;
      const workTime = finishedAtMs - activeFrame.startedAtMs;
      wallElapsedSeconds = (finishedAtMs - measurementStartedAtMs!) / 1000;
      simulationElapsedSeconds = nextSimulationElapsedSeconds;
      sampledFrameCount += 1;
      elapsedSeconds = scenario.profile === "fixed-4200"
        ? sampledFrameCount / V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND
        : wallElapsedSeconds;
      renderWidth = metrics.renderWidth;
      renderHeight = metrics.renderHeight;
      samples.firstSampleElapsedSeconds ??= activeFrame.elapsedSeconds;
      samples.lastSampleElapsedSeconds = activeFrame.elapsedSeconds;
      samples.frameWorkTimeMs.push(workTime);
      // T06-1の固定baselineと比較する旧式の量。新しい実frame間隔とは別欄へ記録する。
      samples.totalFrameTimeMs.push(Math.max(
        workTime,
        activeFrame.previousIntervalMs === null ? workTime : activeFrame.previousIntervalMs
      ));
      countersThisFrame.set(
        "scenario.render-size-mismatch",
        renderWidth === 1920 && renderHeight === 1080 ? 0 : 1
      );
      for (const [section, duration] of sectionTimeThisFrame) {
        const values = samples.sectionTimeMs.get(section) ?? [];
        values.push(duration);
        samples.sectionTimeMs.set(section, values);
      }
      for (const [name, value] of countersThisFrame) {
        const values = samples.counters.get(name) ?? [];
        values.push(value);
        samples.counters.set(name, values);
      }
      if (metrics.renderTimeMs !== null) {
        samples.renderTimeMs.push(metrics.renderTimeMs);
      }
      samples.activeMeshEvaluationTimeMs.push(metrics.activeMeshEvaluationTimeMs);
      if (metrics.gpuFrameTimeMs !== null) {
        samples.gpuFrameTimeMs.push(metrics.gpuFrameTimeMs);
      }
      samples.drawCalls.push(metrics.drawCalls);
      samples.activeMeshes.push(metrics.activeMeshes);
      samples.totalMeshes.push(metrics.totalMeshes);
      if (metrics.heapBytes !== null) {
        samples.heapBytes.push(metrics.heapBytes);
      }
      if (
        slowestWorkFrames.length < 10 ||
        workTime > slowestWorkFrames[slowestWorkFrames.length - 1].frameWorkTimeMs
      ) {
        // 全frameのMapを複製せず、CPU work上位10件に入る時だけ同時点の値を残す。
        slowestWorkFrames.push(Object.freeze({
          frameIndex: sampledFrameCount - 1,
          elapsedSeconds: activeFrame.elapsedSeconds,
          frameStartedAtMilliseconds: activeFrame.startedAtMs,
          frameWorkTimeMs: workTime,
          sectionTimeMs: Object.freeze(Object.fromEntries(sectionTimeThisFrame)),
          counters: Object.freeze(Object.fromEntries(countersThisFrame))
        }));
        slowestWorkFrames.sort((left, right) =>
          right.frameWorkTimeMs - left.frameWorkTimeMs || left.frameIndex - right.frameIndex
        );
        if (slowestWorkFrames.length > 10) {
          slowestWorkFrames.pop();
        }
      }
      pendingInterval = {
        startedAtMs: activeFrame.startedAtMs,
        samples
      };
      activeFrame = null;
    },
    recordLongTasks: (entries) => {
      if (status !== "collecting" && status !== "draining") {
        return;
      }
      for (const entry of entries) {
        if (entry.duration > 50) {
          longTasks.push(Object.freeze({
            startTime: entry.startTime,
            duration: entry.duration
          }));
        }
      }
    },
    finishLongTaskDrain: () => {
      if (status !== "draining") {
        throw new Error("最終frame間隔を取得してからLong Taskの回収を確定してください。");
      }
      longTasksDrained = true;
      status = "complete";
      finalReport = getReport();
      releaseSamples();
      return finalReport;
    },
    abort: (reason) => {
      if (status === "complete" || status === "aborted") {
        throw new Error("終了済みの性能計測をabortできません。");
      }
      status = "aborted";
      abortReason = reason;
      finalReport = getReport();
      releaseSamples();
      return finalReport;
    },
    getStatus: () => status,
    getProgress: () => Object.freeze({
      status,
      elapsedSeconds,
      wallElapsedSeconds,
      simulationElapsedSeconds,
      renderWidth,
      renderHeight
    }),
    getReport
  });
};

export const createV2PerformanceDiagnostics = (
  engine: Engine,
  scene: Scene,
  scenario: V2PerformanceScenario,
  population: V2PerformancePopulation
): V2PerformanceDiagnostics => {
  const sceneInstrumentation = new SceneInstrumentation(scene);
  const engineInstrumentation = new EngineInstrumentation(engine);
  const gpuFrameTimeAvailable = Boolean(engine.getCaps().timerQuery);
  const longTaskAvailable =
    PerformanceObserver.supportedEntryTypes.includes("longtask");
  const collector = createV2PerformanceSampleCollector({
    scenario,
    population,
    renderWidth: engine.getRenderWidth(),
    renderHeight: engine.getRenderHeight(),
    longTaskAvailable
  });
  const longTaskObserver = new PerformanceObserver((entryList) => {
    collector.recordLongTasks(entryList.getEntries());
  });
  let disposed = false;
  let instrumentationStarted = false;
  let instrumentationStopped = false;
  let frameIsOpen = false;
  let finalizationTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveFinalization: ((report: V2PerformanceReport) => void) | null = null;

  const stopInstrumentation = () => {
    if (!instrumentationStarted || instrumentationStopped) {
      return;
    }
    if (longTaskAvailable) {
      collector.recordLongTasks(longTaskObserver.takeRecords());
      longTaskObserver.disconnect();
    }
    sceneInstrumentation.captureRenderTime = false;
    sceneInstrumentation.captureActiveMeshesEvaluationTime = false;
    if (gpuFrameTimeAvailable) {
      engineInstrumentation.captureGPUFrameTime = false;
    }
    instrumentationStopped = true;
  };
  const settleFinalization = (report: V2PerformanceReport) => {
    if (finalizationTimer !== null) {
      clearTimeout(finalizationTimer);
      finalizationTimer = null;
    }
    const resolve = resolveFinalization;
    resolveFinalization = null;
    resolve?.(report);
  };
  const abort = (reason: string) => {
    stopInstrumentation();
    settleFinalization(collector.abort(reason));
  };
  const assertFrameIsOpen = () => {
    if (collector.getStatus() === "collecting" && !frameIsOpen) {
      throw new Error("V2性能診断のsection計測はbeginFrame後に実行してください。");
    }
  };

  return Object.freeze<V2PerformanceDiagnostics>({
    scenario,
    beginFrame: () => {
      const startedAtMs = performance.now();
      if (disposed) {
        throw new Error("V2性能診断は破棄済みです。");
      }
      if (collector.getStatus() !== "collecting") {
        return;
      }
      if (!instrumentationStarted) {
        sceneInstrumentation.captureRenderTime = true;
        sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
        if (gpuFrameTimeAvailable) {
          engineInstrumentation.captureGPUFrameTime = true;
        }
        if (longTaskAvailable) {
          longTaskObserver.observe({ entryTypes: ["longtask"] });
        }
        instrumentationStarted = true;
      }
      collector.beginFrame(startedAtMs);
      frameIsOpen = true;
    },
    beginSection: (_section) => {
      assertFrameIsOpen();
      return collector.getStatus() === "collecting"
        ? performance.now()
        : 0;
    },
    finishSection: (section, startedAt) => {
      assertFrameIsOpen();
      if (collector.getStatus() === "collecting") {
        collector.addSectionTime(section, performance.now() - startedAt);
      }
    },
    measure: <T>(section: V2PerformanceSection, operation: () => T) => {
      assertFrameIsOpen();
      if (collector.getStatus() !== "collecting") {
        return operation();
      }
      const startedAt = performance.now();
      const result = operation();
      collector.addSectionTime(section, performance.now() - startedAt);
      return result;
    },
    count: collector.count,
    finishFrame: (simulationElapsedSeconds) => {
      const finishedAtMs = performance.now();
      assertFrameIsOpen();
      if (collector.getStatus() !== "collecting") {
        frameIsOpen = false;
        return;
      }
      const gpuNanoseconds = engineInstrumentation.gpuFrameTimeCounter.current;
      const memory = (performance as PerformanceWithMemory).memory;
      collector.finishFrame(finishedAtMs, simulationElapsedSeconds, {
        renderWidth: engine.getRenderWidth(),
        renderHeight: engine.getRenderHeight(),
        renderTimeMs: sceneInstrumentation.renderTimeCounter.current,
        activeMeshEvaluationTimeMs:
          sceneInstrumentation.activeMeshesEvaluationTimeCounter.current,
        gpuFrameTimeMs: gpuFrameTimeAvailable && gpuNanoseconds > 0
          ? gpuNanoseconds / 1_000_000
          : null,
        drawCalls: sceneInstrumentation.drawCallsCounter.current,
        activeMeshes: scene.getActiveMeshes().length,
        totalMeshes: scene.meshes.length,
        heapBytes: memory === undefined ? null : memory.usedJSHeapSize
      });
      frameIsOpen = false;
    },
    finalize: () => {
      if (
        disposed ||
        collector.getStatus() !== "draining" ||
        resolveFinalization !== null
      ) {
        throw new Error("性能計測の最終回収はdraining状態で一度だけ開始してください。");
      }
      return new Promise<V2PerformanceReport>((resolve) => {
        resolveFinalization = resolve;
        // 最終intervalを観測したcallbackが終了してから、そのtaskの通知も回収する。
        finalizationTimer = setTimeout(() => {
          finalizationTimer = null;
          stopInstrumentation();
          settleFinalization(collector.finishLongTaskDrain());
        }, 0);
      });
    },
    abort,
    getProgress: collector.getProgress,
    getReport: collector.getReport,
    dispose: () => {
      if (disposed) {
        throw new Error("V2性能診断は既に破棄済みです。");
      }
      const status = collector.getStatus();
      if (status === "collecting" || status === "draining") {
        abort("session-disposed-before-measurement-complete");
      } else {
        stopInstrumentation();
      }
      engineInstrumentation.dispose();
      sceneInstrumentation.dispose();
      disposed = true;
    }
  });
};

declare global {
  interface Window {
    __v2PerformanceDiagnostics?: V2PerformanceDiagnostics;
  }
}
