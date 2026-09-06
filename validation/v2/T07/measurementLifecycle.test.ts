import { NullEngine, Scene } from "@babylonjs/core";
import {
  createV2PerformanceDiagnostics,
  type V2PerformanceDiagnostics,
  type V2PerformanceLongTaskEntry,
  type V2PerformanceReport
} from "../../../src/v2/performanceDiagnostics";
import { assertMeasurement, type MeasurementTestResult } from "./measurement.test";

class MeasurementObserver {
  static readonly supportedEntryTypes = ["longtask"];
  static instances: MeasurementObserver[] = [];
  readonly queued: V2PerformanceLongTaskEntry[] = [];
  observing = false;
  drainCount = 0;
  disconnectCount = 0;

  constructor(
    private readonly callback: (entries: Pick<PerformanceObserverEntryList, "getEntries">) => void
  ) {
    MeasurementObserver.instances.push(this);
  }

  observe(): void {
    this.observing = true;
  }

  takeRecords(): PerformanceEntry[] {
    this.drainCount += 1;
    return this.queued.splice(0) as PerformanceEntry[];
  }

  disconnect(): void {
    this.observing = false;
    this.disconnectCount += 1;
    this.queued.length = 0;
  }

  deliver(entries: readonly V2PerformanceLongTaskEntry[]): void {
    this.callback({
      getEntries: () => entries as PerformanceEntry[]
    });
  }
}

const runLifecycleTest = async (
  name: string,
  operation: (fixture: Readonly<{
    createDiagnostics(): V2PerformanceDiagnostics;
    setTime(now: number): void;
  }>) => Promise<string>
): Promise<MeasurementTestResult> => {
  const observerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "PerformanceObserver");
  const clockDescriptor = Object.getOwnPropertyDescriptor(performance, "now");
  const engine = new NullEngine({
    renderWidth: 1920,
    renderHeight: 1080,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4
  });
  const scene = new Scene(engine);
  let now = 1000;
  const created: V2PerformanceDiagnostics[] = [];
  MeasurementObserver.instances = [];
  Object.defineProperty(globalThis, "PerformanceObserver", {
    configurable: true,
    value: MeasurementObserver
  });
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => now
  });
  try {
    const detail = await operation({
      createDiagnostics: () => {
        const diagnostics = createV2PerformanceDiagnostics(
          engine,
          scene,
          Object.freeze({ profile: "normal", seed: 20260725, view: "courtyard" }),
          Object.freeze({
            npcCount: 50,
            initialBrainwashedNpcCount: 10,
            initialBitCount: 1
          })
        );
        created.push(diagnostics);
        return diagnostics;
      },
      setTime: (next) => { now = next; }
    });
    return Object.freeze({ name, ok: true, detail });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  } finally {
    // テストの成功・失敗にかかわらず、公開APIで各sessionのobserverを回収する。
    for (const diagnostics of created) {
      diagnostics.dispose();
    }
    scene.dispose();
    engine.dispose();
    if (clockDescriptor === undefined) {
      Reflect.deleteProperty(performance, "now");
    } else {
      Object.defineProperty(performance, "now", clockDescriptor);
    }
    if (observerDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, "PerformanceObserver");
    } else {
      Object.defineProperty(globalThis, "PerformanceObserver", observerDescriptor);
    }
  }
};

const finishTestFrame = (
  diagnostics: V2PerformanceDiagnostics,
  setTime: (now: number) => void,
  startedAtMs: number,
  simulationElapsedSeconds: number
) => {
  setTime(startedAtMs);
  diagnostics.beginFrame();
  setTime(startedAtMs + 1);
  diagnostics.finishFrame(simulationElapsedSeconds);
};

export const runMeasurementLifecycleTests = async (): Promise<readonly MeasurementTestResult[]> => [
  await runLifecycleTest("最終callback終了後に通知をdrainしてobserverを一度だけ停止", async ({
    createDiagnostics,
    setTime
  }) => {
    const diagnostics = createDiagnostics();
    finishTestFrame(diagnostics, setTime, 1000, 0.016);
    finishTestFrame(diagnostics, setTime, 11000, 10);
    finishTestFrame(diagnostics, setTime, 70999, 69.999);
    setTime(71000);
    diagnostics.beginFrame();
    const observer = MeasurementObserver.instances[0];
    observer.queued.push({ startTime: 10999, duration: 60 });
    const snapshot = diagnostics.getReport();
    assertMeasurement(
      snapshot.status === "draining" &&
      snapshot.cold.longTaskCount === 0 &&
      observer.drainCount === 0,
      "getReportがobserverの状態を変更しています。"
    );
    const completion = diagnostics.finalize();
    // finalizeを呼んだcallbackの終了前に通知対象がqueueへ入る状況を再現する。
    observer.queued.push({ startTime: 70999, duration: 75 });
    const report = await completion;
    assertMeasurement(
      report.status === "complete" &&
      report.cold.longTaskCount === 1 &&
      report.steady.longTaskCount === 1 &&
      report.longTasksDrained &&
      !observer.observing &&
      observer.drainCount === 1 &&
      observer.disconnectCount === 1,
      "末尾taskの回収またはobserver停止が不正です。"
    );
    assertMeasurement(report.steady.gpuFrameTimeMs === null, "未取得GPU値を0で補っています。");
    return "getReportは純粋、setTimeout境界後のtakeRecordsとdisconnectを各1回";
  }),
  await runLifecycleTest("finalize待機中のabortもPromiseを解決し末尾不足を保持", async ({
    createDiagnostics,
    setTime
  }) => {
    const diagnostics = createDiagnostics();
    finishTestFrame(diagnostics, setTime, 1000, 0.016);
    finishTestFrame(diagnostics, setTime, 11000, 10);
    setTime(71000);
    diagnostics.beginFrame();
    const completion = diagnostics.finalize();
    diagnostics.abort("再開始による計測中断");
    const report = await completion;
    const observer = MeasurementObserver.instances[0];
    assertMeasurement(
      report.status === "aborted" &&
      report.abortReason === "再開始による計測中断" &&
      !report.longTasksDrained &&
      report.acceptance.status === "incomplete" &&
      observer.disconnectCount === 1,
      "finalize中断でPromiseが未解決または合格へ変わっています。"
    );
    return "finalize timerを解除し、aborted reportで待機元へ返す";
  }),
  await runLifecycleTest("収集終了後もRuntime処理を継続しreportを変更しない", async ({
    createDiagnostics,
    setTime
  }) => {
    const diagnostics = createDiagnostics();
    finishTestFrame(diagnostics, setTime, 1000, 0.016);
    finishTestFrame(diagnostics, setTime, 11000, 10);
    setTime(71000);
    diagnostics.beginFrame();
    const report = await diagnostics.finalize();
    let operationCount = 0;
    const result = diagnostics.measure("survival", () => {
      operationCount += 1;
      return 17;
    });
    const section = diagnostics.beginSection("mission");
    diagnostics.finishSection("mission", section);
    diagnostics.count("beam.spawned", 5);
    diagnostics.finishFrame(71);
    setTime(72000);
    diagnostics.beginFrame();
    diagnostics.measure("render", () => { operationCount += 1; });
    diagnostics.finishFrame(72);
    assertMeasurement(
      operationCount === 2 && result === 17 &&
      diagnostics.getReport() === report &&
      report.sampledFrameCount === 2,
      "収集終了後のRuntime処理を拒否またはreportへ追加しました。"
    );
    return "beginなしのsectionも無計測とし、Runtimeのoperationは実行";
  }),
  await runLifecycleTest("旧sessionの遅延通知が新sessionへ混入しない", async ({
    createDiagnostics,
    setTime
  }) => {
    const previous = createDiagnostics();
    finishTestFrame(previous, setTime, 1000, 0.016);
    previous.abort("session交換");
    const previousReport: V2PerformanceReport = previous.getReport();
    const next = createDiagnostics();
    finishTestFrame(next, setTime, 2000, 0.016);
    MeasurementObserver.instances[0].deliver([{ startTime: 2001, duration: 70 }]);
    MeasurementObserver.instances[1].deliver([{ startTime: 2001, duration: 55 }]);
    assertMeasurement(
      previous.getReport() === previousReport &&
      previousReport.cold.longTaskCount === 0 &&
      next.getReport().cold.longTaskCount === 1 &&
      !MeasurementObserver.instances[0].observing &&
      MeasurementObserver.instances[1].observing,
      "session所有のobserverとreportが分離されていません。"
    );
    next.abort("fixture完了");
    return "旧observer停止と新observer独立、旧report identity不変";
  })
];
