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

export type V2PerformanceView = "courtyard" | "away";

export type V2PerformanceScenario = Readonly<{
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
  | "render";

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
  totalFrameTimeMs: V2PerformanceMetricSummary;
  frameWorkTimeMs: V2PerformanceMetricSummary;
  sectionTimeMs: Readonly<
    Partial<Record<V2PerformanceSection, V2PerformanceMetricSummary>>
  >;
  renderTimeMs: V2PerformanceMetricSummary;
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

export type V2PerformanceReport = Readonly<{
  status: "collecting" | "complete";
  seed: number;
  view: V2PerformanceView;
  targetFramesPerSecond: number;
  population: V2PerformancePopulation;
  renderWidth: number;
  renderHeight: number;
  elapsedSeconds: number;
  availability: Readonly<{
    gpuFrameTime: boolean;
    heap: boolean;
    longTask: boolean;
  }>;
  cold: V2PerformanceWindowReport;
  steady: V2PerformanceWindowReport;
  acceptance: Readonly<{
    sampleWindowsComplete: boolean;
    renderSizeIs1920x1080: boolean;
    populationIs99x66x50: boolean;
    populationStayedAtExpectedCounts: boolean;
    initialBrainwashedNpcCountWasExpected: boolean;
    combatWorkloadObserved: boolean;
    p95AtMost16Point7Ms: boolean;
    p99AtMost25Ms: boolean;
    maximumAtMost50Ms: boolean;
    longTaskCountIsZero: boolean;
    passed: boolean;
  }>;
}>;

export type V2PerformanceProgress = Readonly<{
  status: "collecting" | "complete";
  elapsedSeconds: number;
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
  finishFrame(): void;
  getProgress(): V2PerformanceProgress;
  getReport(): V2PerformanceReport;
  dispose(): void;
}

type MutableWindowSamples = {
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
  lastSampleElapsedSeconds: null
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
      samples.lastSampleElapsedSeconds === null
        ? 0
        : samples.lastSampleElapsedSeconds -
          samples.firstSampleElapsedSeconds,
    totalFrameTimeMs: summarize(samples.totalFrameTimeMs),
    frameWorkTimeMs: summarize(samples.frameWorkTimeMs),
    sectionTimeMs: summarizeMap(samples.sectionTimeMs),
    renderTimeMs: summarize(samples.renderTimeMs),
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
  if (parameters.get("performance") !== "acceptance") {
    return null;
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

export const createV2PerformanceDiagnostics = (
  engine: Engine,
  scene: Scene,
  scenario: V2PerformanceScenario,
  population: V2PerformancePopulation
): V2PerformanceDiagnostics => {
  const sceneInstrumentation = new SceneInstrumentation(scene);
  const engineInstrumentation = new EngineInstrumentation(engine);
  const gpuFrameTimeAvailable = Boolean(
    engine.getCaps().timerQuery
  );
  const longTaskAvailable =
    PerformanceObserver.supportedEntryTypes.includes("longtask");

  const cold = createWindowSamples();
  const steady = createWindowSamples();
  const sectionTimeThisFrame = new Map<
    V2PerformanceSection,
    number
  >();
  const countersThisFrame = new Map<string, number>();
  let frameStartTime = 0;
  let previousFrameStartTime = 0;
  let frameIndex = 0;
  let frameStartedElapsedSeconds = 0;
  let elapsedSeconds = 0;
  let disposed = false;
  let instrumentationStarted = false;
  let currentLongTaskSamples: MutableWindowSamples | null = null;

  const getWindow = (elapsed: number) => {
    const window = selectV2PerformanceWindow(elapsed);
    return window === "cold"
      ? cold
      : window === "steady"
        ? steady
        : null;
  };

  const recordLongTasks = (
    entries: readonly PerformanceEntry[]
  ) => {
    for (const entry of entries) {
      if (entry.duration > 50) {
        currentLongTaskSamples?.longTaskDurationsMs.push(
          entry.duration
        );
      }
    }
  };
  const longTaskObserver = new PerformanceObserver((entryList) => {
    recordLongTasks(entryList.getEntries());
  });

  const beginFrame = () => {
    if (disposed) {
      throw new Error("V2性能診断は破棄済みです。");
    }
    const now = performance.now();
    if (!instrumentationStarted) {
      sceneInstrumentation.captureRenderTime = true;
      sceneInstrumentation.captureActiveMeshesEvaluationTime =
        true;
      if (gpuFrameTimeAvailable) {
        engineInstrumentation.captureGPUFrameTime = true;
      }
      if (longTaskAvailable) {
        longTaskObserver.observe({ entryTypes: ["longtask"] });
      }
      instrumentationStarted = true;
    }
    frameStartTime = now;
    frameStartedElapsedSeconds =
      (frameIndex * V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS) /
      1000;
    currentLongTaskSamples = getWindow(
      frameStartedElapsedSeconds
    );
    sectionTimeThisFrame.clear();
    countersThisFrame.clear();
  };

  const measure = <T>(
    section: V2PerformanceSection,
    operation: () => T
  ) => {
    if (frameStartTime === 0) {
      throw new Error(
        "V2性能診断のmeasureはbeginFrame後に実行してください。"
      );
    }
    const startedAt = performance.now();
    const result = operation();
    const duration = performance.now() - startedAt;
    sectionTimeThisFrame.set(
      section,
      (sectionTimeThisFrame.get(section) ?? 0) + duration
    );
    return result;
  };

  const beginSection = (_section: V2PerformanceSection) => {
    if (frameStartTime === 0) {
      throw new Error(
        "V2性能診断のbeginSectionはbeginFrame後に実行してください。"
      );
    }
    return performance.now();
  };

  const finishSection = (
    section: V2PerformanceSection,
    startedAt: number
  ) => {
    const duration = performance.now() - startedAt;
    sectionTimeThisFrame.set(
      section,
      (sectionTimeThisFrame.get(section) ?? 0) + duration
    );
  };

  const count = (name: string, value = 1) => {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `V2性能診断counter ${name}には0以上の有限値が必要です。`
      );
    }
    countersThisFrame.set(
      name,
      (countersThisFrame.get(name) ?? 0) + value
    );
  };

  const finishFrame = () => {
    if (frameStartTime === 0) {
      throw new Error(
        "V2性能診断のfinishFrameはbeginFrame後に実行してください。"
      );
    }
    const now = performance.now();
    elapsedSeconds =
      ((frameIndex + 1) *
        V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS) /
      1000;
    const samples = currentLongTaskSamples;
    if (samples) {
      samples.firstSampleElapsedSeconds ??= elapsedSeconds;
      samples.lastSampleElapsedSeconds = elapsedSeconds;
      const workTime = now - frameStartTime;
      const intervalTime =
        previousFrameStartTime === 0
          ? workTime
          : frameStartTime - previousFrameStartTime;
      samples.frameWorkTimeMs.push(workTime);
      samples.totalFrameTimeMs.push(
        Math.max(workTime, intervalTime)
      );
      countersThisFrame.set(
        "scenario.render-size-mismatch",
        engine.getRenderWidth() === 1920 &&
          engine.getRenderHeight() === 1080
          ? 0
          : 1
      );
      for (const [section, duration] of sectionTimeThisFrame) {
        const sectionSamples =
          samples.sectionTimeMs.get(section) ?? [];
        sectionSamples.push(duration);
        samples.sectionTimeMs.set(section, sectionSamples);
      }
      for (const [name, value] of countersThisFrame) {
        const counterSamples = samples.counters.get(name) ?? [];
        counterSamples.push(value);
        samples.counters.set(name, counterSamples);
      }
      samples.renderTimeMs.push(
        sceneInstrumentation.renderTimeCounter.current
      );
      samples.activeMeshEvaluationTimeMs.push(
        sceneInstrumentation.activeMeshesEvaluationTimeCounter
          .current
      );
      const gpuNanoseconds =
        engineInstrumentation.gpuFrameTimeCounter.current;
      if (gpuNanoseconds > 0) {
        samples.gpuFrameTimeMs.push(
          gpuNanoseconds / 1_000_000
        );
      }
      samples.drawCalls.push(
        sceneInstrumentation.drawCallsCounter.current
      );
      samples.activeMeshes.push(
        scene.getActiveMeshes().length
      );
      samples.totalMeshes.push(scene.meshes.length);
      const performanceMemory =
        (performance as PerformanceWithMemory).memory;
      if (performanceMemory) {
        samples.heapBytes.push(
          performanceMemory.usedJSHeapSize
        );
      }
    }
    previousFrameStartTime = frameStartTime;
    frameStartTime = 0;
    frameIndex += 1;
  };

  const getReport = (): V2PerformanceReport => {
    if (instrumentationStarted && longTaskAvailable) {
      recordLongTasks(longTaskObserver.takeRecords());
    }
    const coldReport = buildWindowReport(
      V2_PERFORMANCE_COLD_DURATION_SECONDS,
      cold
    );
    const steadyReport = buildWindowReport(
      V2_PERFORMANCE_STEADY_DURATION_SECONDS,
      steady
    );
    const windows = [coldReport, steadyReport];
    const sampleWindowsComplete =
      isV2PerformanceWindowCoverageComplete(
        coldReport,
        steadyReport
      );
    const counterTotal = (
      report: V2PerformanceWindowReport,
      name: string
    ) => report.counters[name]?.total ?? 0;
    const counterPositiveRatio = (
      report: V2PerformanceWindowReport,
      name: string
    ) => {
      const summary = report.counters[name];
      return summary && summary.sampleCount > 0
        ? summary.positiveSampleCount / summary.sampleCount
        : 0;
    };
    const renderSizeIs1920x1080 =
      engine.getRenderWidth() === 1920 &&
      engine.getRenderHeight() === 1080 &&
      windows.every(
        (report) =>
          counterTotal(
            report,
            "scenario.render-size-mismatch"
          ) === 0
      );
    const populationIs99x66x50 =
      population.npcCount === 99 &&
      population.initialBrainwashedNpcCount === 66 &&
      population.initialBitCount === 50;
    const populationStayedAtExpectedCounts = windows.every(
      (report) =>
        report.counters["scenario.npc-count"]?.minimum ===
          population.npcCount &&
        report.counters["scenario.npc-count"]?.maximum ===
          population.npcCount &&
        (report.counters["scenario.bit-count"]?.minimum ?? 0) >=
          population.initialBitCount
    );
    const initialBrainwashedNpcCountWasExpected =
      coldReport.counters[
        "scenario.brainwashed-npc-count"
      ]?.first === population.initialBrainwashedNpcCount;
    const steadyBeamSamples =
      steadyReport.counters["beam.spawned"];
    const combatWorkloadObserved =
      counterTotal(
        coldReport,
        "scenario.alert-injections"
      ) >= 1 &&
      counterTotal(
        coldReport,
        "bit.route-plans.chase"
      ) >= 1 &&
      counterPositiveRatio(
        steadyReport,
        "scenario.active-alerts"
      ) >= 0.9 &&
      counterPositiveRatio(
        steadyReport,
        "scenario.alive-targets"
      ) >= 0.9 &&
      counterPositiveRatio(
        steadyReport,
        "scenario.playing"
      ) >= 0.9 &&
      (steadyBeamSamples?.positiveSampleCount ?? 0) >= 6;
    const p95AtMost16Point7Ms = windows.every(
      (report) => report.totalFrameTimeMs.p95 <= 16.7
    );
    const p99AtMost25Ms = windows.every(
      (report) => report.totalFrameTimeMs.p99 <= 25
    );
    const maximumAtMost50Ms = windows.every(
      (report) => report.totalFrameTimeMs.maximum <= 50
    );
    const longTaskCountIsZero =
      longTaskAvailable &&
      windows.every((report) => report.longTaskCount === 0);
    const complete =
      elapsedSeconds >=
      V2_PERFORMANCE_COLD_DURATION_SECONDS +
        V2_PERFORMANCE_STEADY_DURATION_SECONDS;
    return Object.freeze({
      status: complete ? "complete" : "collecting",
      seed: scenario.seed,
      view: scenario.view,
      targetFramesPerSecond:
        V2_PERFORMANCE_TARGET_FRAMES_PER_SECOND,
      population,
      renderWidth: engine.getRenderWidth(),
      renderHeight: engine.getRenderHeight(),
      elapsedSeconds,
      availability: Object.freeze({
        gpuFrameTime:
          coldReport.gpuFrameTimeMs !== null &&
          steadyReport.gpuFrameTimeMs !== null,
        heap:
          coldReport.heapBytes !== null &&
          steadyReport.heapBytes !== null,
        longTask: longTaskAvailable
      }),
      cold: coldReport,
      steady: steadyReport,
      acceptance: Object.freeze({
        sampleWindowsComplete,
        renderSizeIs1920x1080,
        populationIs99x66x50,
        populationStayedAtExpectedCounts,
        initialBrainwashedNpcCountWasExpected,
        combatWorkloadObserved,
        p95AtMost16Point7Ms,
        p99AtMost25Ms,
        maximumAtMost50Ms,
        longTaskCountIsZero,
        passed:
          complete &&
          sampleWindowsComplete &&
          renderSizeIs1920x1080 &&
          populationIs99x66x50 &&
          populationStayedAtExpectedCounts &&
          initialBrainwashedNpcCountWasExpected &&
          combatWorkloadObserved &&
          p95AtMost16Point7Ms &&
          p99AtMost25Ms &&
          maximumAtMost50Ms &&
          longTaskCountIsZero
      })
    });
  };

  return Object.freeze({
    scenario,
    beginFrame,
    beginSection,
    finishSection,
    measure,
    count,
    finishFrame,
    getProgress: () =>
      Object.freeze({
        status:
          elapsedSeconds >=
          V2_PERFORMANCE_COLD_DURATION_SECONDS +
            V2_PERFORMANCE_STEADY_DURATION_SECONDS
            ? "complete"
            : "collecting",
        elapsedSeconds,
        renderWidth: engine.getRenderWidth(),
        renderHeight: engine.getRenderHeight()
      }),
    getReport,
    dispose: () => {
      if (disposed) {
        throw new Error("V2性能診断は既に破棄済みです。");
      }
      if (instrumentationStarted) {
        sceneInstrumentation.captureRenderTime = false;
        sceneInstrumentation.captureActiveMeshesEvaluationTime =
          false;
        if (gpuFrameTimeAvailable) {
          engineInstrumentation.captureGPUFrameTime = false;
        }
        if (longTaskAvailable) {
          recordLongTasks(longTaskObserver.takeRecords());
          longTaskObserver.disconnect();
        }
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
