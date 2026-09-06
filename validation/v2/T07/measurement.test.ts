import {
  createV2PerformanceSampleCollector,
  readV2PerformanceScenario,
  type V2PerformanceFrameMetrics,
  type V2PerformanceProfile,
  type V2PerformanceSampleCollector
} from "../../../src/v2/performanceDiagnostics";

export type MeasurementTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

export const assertMeasurement = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertNear = (actual: number, expected: number, message: string) => {
  assertMeasurement(Math.abs(actual - expected) < 0.000001, message);
};

export const measurementMetrics: V2PerformanceFrameMetrics = Object.freeze({
  renderWidth: 1920,
  renderHeight: 1080,
  renderTimeMs: 1,
  activeMeshEvaluationTimeMs: 0.25,
  gpuFrameTimeMs: null,
  drawCalls: 12,
  activeMeshes: 20,
  totalMeshes: 30,
  heapBytes: null
});

export const createMeasurementCollector = (
  profile: V2PerformanceProfile,
  longTaskAvailable = true
) => createV2PerformanceSampleCollector({
  scenario: Object.freeze({ profile, seed: 20260725, view: "courtyard" }),
  population: profile === "normal"
    ? Object.freeze({ npcCount: 50, initialBrainwashedNpcCount: 10, initialBitCount: 1 })
    : Object.freeze({ npcCount: 99, initialBrainwashedNpcCount: 66, initialBitCount: 50 }),
  renderWidth: 1920,
  renderHeight: 1080,
  longTaskAvailable
});

const sample = (
  collector: V2PerformanceSampleCollector,
  startedAtMs: number,
  workTimeMs = 1,
  simulationElapsedSeconds = startedAtMs / 1000,
  metrics = measurementMetrics
) => {
  collector.beginFrame(startedAtMs);
  collector.finishFrame(startedAtMs + workTimeMs, simulationElapsedSeconds, metrics);
};

const runTest = (name: string, operation: () => string): MeasurementTestResult => {
  try {
    return Object.freeze({ name, ok: true, detail: operation() });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  }
};

const collectNormalRun = (
  withReinforcement: boolean,
  populationAtFrame: (index: number) => number | null =
    (index) => 1 + Math.floor(index / 600)
) => {
  const collector = createMeasurementCollector("normal");
  for (let index = 0; index < 4200; index += 1) {
    const startedAtMs = index * 1000 / 60;
    collector.beginFrame(startedAtMs);
    collector.count("scenario.npc-count", 50);
    collector.count("scenario.bit-count", index < 90 ? 0 : 1 + Math.floor(index / 600));
    const bitPopulation = populationAtFrame(index);
    if (bitPopulation !== null) {
      collector.count("bit.population-count", bitPopulation);
    }
    collector.count("scenario.brainwashed-npc-count", index === 0 ? 10 : 12);
    collector.count("scenario.playing", 1);
    collector.count("scenario.alert-injections", 0);
    collector.count("beam.spawned", index % 600 === 0 ? 1 : 0);
    collector.count("bit.reinforcement-spawns", withReinforcement && index === 600 ? 1 : 0);
    collector.finishFrame(startedAtMs + 1, (index + 1) / 60, measurementMetrics);
  }
  collector.beginFrame(70000);
  return collector.finishLongTaskDrain();
};

export const runMeasurementTests = (): readonly MeasurementTestResult[] => [
  runTest("通常・stressを明示し旧固定4200 frameを保持", () => {
    const fixed = readV2PerformanceScenario("?performance=acceptance");
    const normal = readV2PerformanceScenario("?performance=normal&seed=12&view=courtyard");
    const stress = readV2PerformanceScenario("?performance=stress&seed=34&view=away");
    assertMeasurement(
      fixed?.profile === "fixed-4200" && fixed.seed === 20260725 &&
      normal?.profile === "normal" && normal.seed === 12 &&
      stress?.profile === "stress" && stress.seed === 34 && stress.view === "away" &&
      readV2PerformanceScenario("") === null,
      "profileまたは固定baselineの既定seedが不正です。"
    );
    let rejected = 0;
    for (const search of [
      "?performance=normal",
      "?performance=stress",
      "?performance=unknown&seed=12",
      "?performance=normal&seed=12&view=unknown"
    ]) {
      try {
        readV2PerformanceScenario(search);
      } catch {
        rejected += 1;
      }
    }
    assertMeasurement(rejected === 4, "不足・未知設定を暗黙に補っています。");
    return "通常・stressのseed不足と未知値を拒否";
  }),
  runTest("通常窓は実時間0～10秒と10～70秒でframe開始を帰属", () => {
    const collector = createMeasurementCollector("normal");
    sample(collector, 0);
    sample(collector, 9999, 0.5);
    sample(collector, 10000);
    sample(collector, 69999, 0.5);
    collector.beginFrame(70000);
    const report = collector.finishLongTaskDrain();
    assertMeasurement(
      report.cold.frameWorkTimeMs.sampleCount === 2 &&
      report.steady.frameWorkTimeMs.sampleCount === 2 &&
      report.sampledFrameCount === 4 &&
      report.status === "complete",
      "実時間窓をframe数で代用しています。"
    );
    assertNear(report.cold.lastSampleElapsedSeconds!, 9.999, "cold末尾の所属が不正です。");
    assertNear(report.steady.firstSampleElapsedSeconds!, 10, "steady先頭の所属が不正です。");
    assertNear(report.wallElapsedSeconds, 70, "wall時間が不正です。");
    return "4 frameでも実時間70秒で窓を閉じる";
  }),
  runTest("next callback間隔を直前frameの窓へ記録", () => {
    const collector = createMeasurementCollector("normal");
    sample(collector, 0, 2);
    sample(collector, 9999, 0.25);
    sample(collector, 10001, 3);
    sample(collector, 69990, 2);
    collector.beginFrame(70005);
    const report = collector.finishLongTaskDrain();
    assertNear(report.cold.frameIntervalTimeMs.last, 2, "境界の間隔を次窓へ誤帰属しました。");
    assertNear(report.steady.frameIntervalTimeMs.last, 15, "最終frame間隔が欠落しました。");
    assertNear(report.steady.frameWorkTimeMs.last, 2, "CPU時間とframe間隔を混同しました。");
    assertMeasurement(report.finalFrameIntervalObserved, "最終callback観測が記録されません。");
    return "9.999秒開始frameの2msはcold、最終15msはsteady";
  }),
  runTest("Long Taskは通知時刻でなくstartTimeで窓へ帰属", () => {
    const collector = createMeasurementCollector("normal");
    sample(collector, 1000);
    sample(collector, 11000);
    sample(collector, 70999, 0.5);
    collector.beginFrame(71000);
    collector.recordLongTasks([
      { startTime: 900, duration: 60 },
      { startTime: 999, duration: 60 },
      { startTime: 1001, duration: 51 },
      { startTime: 10999, duration: 80 },
      { startTime: 11000, duration: 55 },
      { startTime: 70999, duration: 100 },
      { startTime: 71000, duration: 70 },
      { startTime: 70000, duration: 50 }
    ]);
    assertMeasurement(
      collector.getReport().status === "draining" &&
      !collector.getReport().longTasksDrained,
      "回収確定前に完了を公表しています。"
    );
    const report = collector.finishLongTaskDrain();
    assertMeasurement(
      report.cold.longTaskCount === 3 &&
      report.steady.longTaskCount === 2 &&
      report.steady.longestTaskMs === 100,
      "遅延通知・50ms境界・期間外taskの扱いが不正です。"
    );
    return "10秒・70秒をまたぐtask、通知遅延、50msちょうどを検証";
  }),
  runTest("最終frameのfinishだけでは完了せず末尾drainを要求", () => {
    const collector = createMeasurementCollector("normal");
    sample(collector, 0);
    sample(collector, 10000);
    sample(collector, 69999, 2);
    assertMeasurement(
      collector.getProgress().status === "collecting" &&
      !collector.getReport().finalFrameIntervalObserved,
      "末尾の次callbackがないのに完了しています。"
    );
    let rejected = false;
    try {
      collector.finishLongTaskDrain();
    } catch {
      rejected = true;
    }
    assertMeasurement(rejected, "frame末尾欠落をdrain完了で隠せます。");
    collector.beginFrame(70002);
    assertMeasurement(collector.getProgress().status === "draining", "回収待ちになりません。");
    assertMeasurement(
      collector.finishLongTaskDrain().acceptance.sampleWindowsComplete,
      "最終間隔と通知回収後もsampling未完了です。"
    );
    return "finish→next callback→drainの順序を固定";
  }),
  runTest("停止によるabortedと計測窓不足によるincompleteを区別", () => {
    const aborted = createMeasurementCollector("normal");
    sample(aborted, 0);
    const stopped = aborted.abort("fixtureによるsession中断");
    assertMeasurement(
      stopped.status === "aborted" &&
      stopped.abortReason === "fixtureによるsession中断" &&
      stopped.acceptance.status === "incomplete" &&
      !stopped.finalFrameIntervalObserved,
      "中断が成功または完全な計測として扱われました。"
    );
    const incomplete = createMeasurementCollector("normal");
    sample(incomplete, 0, 71000);
    incomplete.beginFrame(71001);
    const completedCollection = incomplete.finishLongTaskDrain();
    assertMeasurement(
      completedCollection.status === "complete" &&
      completedCollection.acceptance.status === "incomplete" &&
      completedCollection.abortReason === null,
      "steady窓のsample不足を合格させています。"
    );
    return "中断理由を保持し、空のsteady窓は合格させない";
  }),
  runTest("固定4200 frameの実時間とsimulation時間を分離", () => {
    const collector = createMeasurementCollector("fixed-4200");
    for (let index = 0; index < 4200; index += 1) {
      sample(collector, index * 33, 3, (index + 1) / 60);
    }
    assertMeasurement(
      collector.getProgress().status === "collecting",
      "固定計測も最終間隔確定前に終了しています。"
    );
    collector.beginFrame(4200 * 33);
    const report = collector.finishLongTaskDrain();
    assertMeasurement(
      report.cold.frameWorkTimeMs.sampleCount === 600 &&
      report.steady.frameWorkTimeMs.sampleCount === 3600,
      "旧600＋3600 frameの計測窓が変わりました。"
    );
    assertNear(report.elapsedSeconds, 70, "固定時間が不正です。");
    assertNear(report.simulationElapsedSeconds, 70, "simulation時間が不正です。");
    assertNear(report.wallElapsedSeconds, 138.6, "実時間を70秒へ置換しています。");
    assertNear(report.steady.totalFrameTimeMs.p95, 33, "旧total量が変わりました。");
    assertNear(report.steady.frameWorkTimeMs.p95, 3, "work量が不正です。");
    return "4200 frame=wall138.6秒／simulation70秒、旧total33ms";
  }),
  runTest("固定frameのLong Taskも600frame境界の実時刻へ帰属", () => {
    const collector = createMeasurementCollector("fixed-4200");
    for (let index = 0; index < 4200; index += 1) {
      sample(collector, 1000 + index * 20, 1, (index + 1) / 60);
    }
    collector.beginFrame(85000);
    collector.recordLongTasks([
      { startTime: 12999, duration: 70 },
      { startTime: 13000, duration: 70 },
      { startTime: 84999, duration: 70 },
      { startTime: 85000, duration: 70 }
    ]);
    const report = collector.finishLongTaskDrain();
    assertMeasurement(
      report.cold.longTaskCount === 1 && report.steady.longTaskCount === 2,
      "固定frame窓のLong Taskを疑似10秒のwall時刻へ帰属しています。"
    );
    return "実時間13秒の600frame境界と85秒の最終境界を検証";
  }),
  runTest("stress120秒は60fps単独合格を出さない", () => {
    const collector = createMeasurementCollector("stress", false);
    for (const time of [0, 60000, 119999]) {
      collector.beginFrame(time);
      collector.count("scenario.npc-count", 99);
      collector.count("scenario.bit-count", 50);
      collector.count("bit.population-count", 50);
      collector.count("scenario.brainwashed-npc-count", 66);
      collector.finishFrame(time + 0.5, time / 1000, measurementMetrics);
    }
    collector.beginFrame(120000);
    const report = collector.finishLongTaskDrain();
    assertMeasurement(
      report.stress?.durationSeconds === 120 &&
      report.stress.frameIntervalTimeMs.sampleCount === 3 &&
      report.acceptance.passed === null &&
      report.acceptance.status === "external-validation-required" &&
      !report.acceptance.p95AtMost16Point7Ms,
      "stressに通常60fpsの合否を適用しています。"
    );
    return "負荷・診断・所有・baselineの外部判定を要求";
  }),
  runTest("初回taskの重なりを含め、callback遅延でも120秒後のtaskを除外", () => {
    const collector = createMeasurementCollector("stress");
    sample(collector, 1000);
    sample(collector, 120999, 0.5);
    collector.beginFrame(122000);
    collector.recordLongTasks([
      { startTime: 900, duration: 60 },
      { startTime: 999, duration: 60 },
      { startTime: 120999, duration: 70 },
      { startTime: 121000, duration: 70 },
      { startTime: 121500, duration: 70 }
    ]);
    const report = collector.finishLongTaskDrain();
    assertMeasurement(
      report.stress?.longTaskCount === 2 && report.wallElapsedSeconds === 121 &&
      report.measurementStartedAtMilliseconds === 1000 &&
      report.measurementEndedAtMilliseconds === 121000 &&
      report.finalFrameCallbackAtMilliseconds === 122000,
      "初回callbackのtaskを落とすか、callback遅延分までLong Task窓を延長しています。"
    );
    return "originをまたぐtaskを含め、実120秒cutoff以後を除外";
  }),
  runTest("取得できないGPU・heap・render値はnullのまま保持", () => {
    const collector = createMeasurementCollector("normal", false);
    const unavailable = { ...measurementMetrics, renderTimeMs: null };
    sample(collector, 0, 1, 0, unavailable);
    sample(collector, 10000, 1, 10, unavailable);
    collector.beginFrame(70000);
    const report = collector.finishLongTaskDrain();
    assertMeasurement(
      report.cold.gpuFrameTimeMs === null &&
      report.steady.heapBytes === null &&
      report.cold.renderTimeMs === null &&
      !report.availability.gpuFrameTime &&
      !report.availability.heap &&
      !report.acceptance.longTaskCountIsZero,
      "取得不可を0または別指標へ置換しています。"
    );
    return "GPU／heap／renderの未取得と0を区別";
  }),
  runTest("終了済みreportへ遅延通知や次sessionのsampleを混入させない", () => {
    const previous = createMeasurementCollector("normal");
    sample(previous, 0);
    const report = previous.abort("再開始");
    const next = createMeasurementCollector("normal");
    sample(next, 1000);
    previous.recordLongTasks([{ startTime: 1001, duration: 60 }]);
    previous.beginFrame(1002);
    previous.finishFrame(1003, 1, measurementMetrics);
    assertMeasurement(
      previous.getReport() === report &&
      report.sampledFrameCount === 1 &&
      report.cold.longTaskCount === 0 &&
      next.getReport().sampledFrameCount === 1,
      "旧collectorの終了reportが再開後に変化しました。"
    );
    next.abort("fixture終了");
    return "終了reportを固定し、新collectorのsampleを独立させる";
  }),
  runTest("通常受入は出現演出中の実個体と実増援を確認", () => {
    const report = collectNormalRun(true);
    assertMeasurement(
      report.acceptance.passed === true &&
      report.acceptance.populationStayedAtExpectedCounts &&
      report.acceptance.bitReinforcementObserved &&
      report.cold.counters["scenario.bit-count"].minimum === 0 &&
      report.cold.counters["bit.population-count"].first === 1 &&
      report.cold.counters["scenario.alert-injections"].total === 0 &&
      report.steady.counters["scenario.alert-injections"].total === 0,
      "通常受入へ固定負荷の警戒注入条件が混入しました。"
    );
    return "最初1.5秒のactive sphere0と実個体1を分け、自然な増援を判定";
  }),
  runTest("実BIT個体0・上限超過・counter欠測を通常受入へ通さない", () => {
    for (const invalidPopulation of [0, 26, null]) {
      const report = collectNormalRun(true, (index) =>
        index === 600 ? invalidPopulation : 1 + Math.floor(index / 600)
      );
      assertMeasurement(
        !report.acceptance.populationStayedAtExpectedCounts &&
        report.acceptance.status === "failed" &&
        report.acceptance.passed === false,
        `実個体の不正値をactive sphereで補っています: ${invalidPopulation}`
      );
    }
    return "実個体0・26・1frame欠測をそれぞれ失敗にする";
  }),
  runTest("normal上限25とstress・固定上限50を独立に検証", () => {
    const normal = collectNormalRun(true, (index) => index === 0 ? 1 : 25);
    assertMeasurement(
      normal.acceptance.populationStayedAtExpectedCounts,
      "normalの実個体25を上限超過と判定しています。"
    );
    for (const profile of ["stress", "fixed-4200"] as const) {
      for (const bitPopulation of [0, 50, 51]) {
        const collector = createMeasurementCollector(profile);
        const totalFrames = profile === "stress" ? 7200 : 4200;
        for (let index = 0; index < totalFrames; index += 1) {
          const time = index * 1000 / 60;
          collector.beginFrame(time);
          collector.count("scenario.npc-count", 99);
          collector.count("scenario.bit-count", 50);
          collector.count("bit.population-count", index === 600 ? bitPopulation : 50);
          collector.count("scenario.brainwashed-npc-count", 66);
          collector.finishFrame(time + 1, (index + 1) / 60, measurementMetrics);
        }
        collector.beginFrame(totalFrames * 1000 / 60);
        const report = collector.finishLongTaskDrain();
        assertMeasurement(
          report.acceptance.populationStayedAtExpectedCounts === (bitPopulation === 50),
          `${profile}の実個体境界が不正です: ${bitPopulation}`
        );
        if (bitPopulation !== 50) {
          assertMeasurement(
            report.acceptance.status === "failed",
            `${profile}の実個体不足・超過を受入可能としています。`
          );
        }
      }
    }
    return "normal25は許容、stress・固定は50のみ許容し0・51を失敗にする";
  }),
  runTest("増援の未観測を通常人口設定だけで合格させない", () => {
    const report = collectNormalRun(false);
    assertMeasurement(
      report.acceptance.status === "failed" &&
      !report.acceptance.bitReinforcementObserved &&
      report.acceptance.passed === false,
      "増援の実counterがないrunを合格させています。"
    );
    return "設定上の最大25と実際の増援を分ける";
  }),
  runTest("CPU work上位10frameのsectionとcounterを同時点で固定", () => {
    const collector = createMeasurementCollector("normal");
    for (let index = 0; index < 16; index += 1) {
      const time = index * 1000;
      collector.beginFrame(time);
      collector.addSectionTime("npc", index / 2);
      collector.addSectionTime("bit", index / 4);
      collector.count("bit.route-plans.chase", index);
      collector.count("bit.route-plan-ms.chase", index / 4);
      // 最後は直前と同じ最大値。同値のframeもframeIndex順で保持する。
      collector.finishFrame(time + Math.min(index, 14), index, measurementMetrics);
    }
    const before = collector.getReport().slowestWorkFrames;
    collector.beginFrame(69000);
    collector.addSectionTime("npc", 0.01);
    collector.count("bit.route-plans.chase", 1000);
    collector.finishFrame(69000.01, 69, measurementMetrics);
    collector.beginFrame(70000);
    const report = collector.finishLongTaskDrain();
    const expectedIndices = [14, 15, 13, 12, 11, 10, 9, 8, 7, 6];
    assertMeasurement(
      report.slowestWorkFrames.length === 10 &&
      report.slowestWorkFrames.every((frame, position) =>
        frame.frameIndex === expectedIndices[position] &&
        frame.elapsedSeconds === frame.frameIndex &&
        frame.frameStartedAtMilliseconds === frame.frameIndex * 1000 &&
        frame.frameWorkTimeMs === Math.min(frame.frameIndex, 14) &&
        frame.sectionTimeMs.npc === frame.frameIndex / 2 &&
        frame.counters["bit.route-plans.chase"] === frame.frameIndex &&
        frame.counters["bit.route-plan-ms.chase"] === frame.frameIndex / 4 &&
        Object.isFrozen(frame) && Object.isFrozen(frame.sectionTimeMs) &&
        Object.isFrozen(frame.counters)
      ) &&
      report.slowestWorkFrames.every((frame, index) => frame === before[index]) &&
      Object.isFrozen(report.slowestWorkFrames) &&
      report.sampledFrameCount === 17,
      "上位10件の選択・同値順序・時刻・同時点counterの固定が不正です。"
    );
    return "cold／steady共通のtop10、同値時のframe順、後続frameと回収後の不変性";
  }),
  runTest("UI・音声・Mission等のsectionをframe内で独立集計", () => {
    const collector = createMeasurementCollector("normal");
    collector.beginFrame(0);
    collector.addSectionTime("minimap", 0.25);
    collector.addSectionTime("minimap", 0.5);
    collector.addSectionTime("audio", 0.1);
    collector.addSectionTime("mission", 0.2);
    collector.addSectionTime("diagnostics", 0.05);
    collector.finishFrame(2, 0.016, measurementMetrics);
    const report = collector.abort("section fixture完了");
    assertNear(report.cold.sectionTimeMs.minimap!.first, 0.75, "minimapが加算されません。");
    assertNear(report.cold.sectionTimeMs.audio!.first, 0.1, "audioが分離されません。");
    assertNear(report.cold.sectionTimeMs.mission!.first, 0.2, "Missionが分離されません。");
    assertNear(report.cold.sectionTimeMs.diagnostics!.first, 0.05, "計測自身が分離されません。");
    return "minimap・audio・mission・diagnosticsを個別に保持";
  })
];
