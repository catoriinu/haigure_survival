export type V2StartupPhase =
  | "bootstrap-ready"
  | "loading-ui-painted"
  | "runtime-module-loading"
  | "engine-created"
  | "runtime-session-creating"
  | "school-stage-loading"
  | "school-stage-loaded"
  | "character-visuals-loading"
  | "character-visuals-loaded"
  | "survival-runtime-created"
  | "scene-ready"
  | "visual-resources-ready"
  | "runtime-session-ready"
  | "running"
  | "failed"
  | "page-unloading";

type V2StartupStatus = "loading" | "running" | "failed" | "unloading";

export type V2StartupEvent = Readonly<{
  phase: V2StartupPhase;
  elapsedMilliseconds: number;
}>;

export type V2StartupFailure = Readonly<{
  name: string;
  message: string;
  stack: string | null;
}>;

export type V2StartupDiagnosticsSnapshot = Readonly<{
  status: V2StartupStatus;
  phase: V2StartupPhase;
  startedAtUnixMilliseconds: number;
  elapsedMilliseconds: number;
  events: readonly V2StartupEvent[];
  failure: V2StartupFailure | null;
}>;

type MutableV2StartupDiagnostics = {
  status: V2StartupStatus;
  phase: V2StartupPhase;
  startedAtUnixMilliseconds: number;
  startedAtPerformanceMilliseconds: number;
  events: V2StartupEvent[];
  failure: V2StartupFailure | null;
};

const V2_STARTUP_STALL_THRESHOLD_MILLISECONDS = 15_000;
const V2_STARTUP_WATCHDOG_INTERVAL_MILLISECONDS = 1_000;

let startupDiagnostics: MutableV2StartupDiagnostics | null = null;
let startupWatchdogId: number | null = null;

const getElapsedMilliseconds = () => {
  if (startupDiagnostics === null) {
    throw new Error("V2起動診断が初期化されていません。");
  }
  return Math.round(
    performance.now() - startupDiagnostics.startedAtPerformanceMilliseconds
  );
};

const publishStartupDiagnostics = () => {
  if (startupDiagnostics === null) {
    throw new Error("V2起動診断が初期化されていません。");
  }
  const snapshot: V2StartupDiagnosticsSnapshot = Object.freeze({
    status: startupDiagnostics.status,
    phase: startupDiagnostics.phase,
    startedAtUnixMilliseconds: startupDiagnostics.startedAtUnixMilliseconds,
    elapsedMilliseconds: getElapsedMilliseconds(),
    events: Object.freeze([...startupDiagnostics.events]),
    failure: startupDiagnostics.failure
  });
  window.__v2StartupDiagnostics = snapshot;
  document.documentElement.dataset.v2StartupStatus = snapshot.status;
  document.body.dataset.v2StartupPhase = snapshot.phase;
  document.body.dataset.v2StartupReport = JSON.stringify(snapshot);
};

const stopStartupWatchdog = () => {
  if (startupWatchdogId !== null) {
    window.clearInterval(startupWatchdogId);
    startupWatchdogId = null;
  }
};

const updateStalledStartupMessage = () => {
  if (
    startupDiagnostics === null ||
    startupDiagnostics.status !== "loading"
  ) {
    stopStartupWatchdog();
    return;
  }
  const elapsedMilliseconds = getElapsedMilliseconds();
  publishStartupDiagnostics();
  if (elapsedMilliseconds < V2_STARTUP_STALL_THRESHOLD_MILLISECONDS) {
    return;
  }
  const titleStartHint = document.getElementById(
    "titleStartHint"
  ) as HTMLDivElement;
  const titleMessage = document.getElementById(
    "titleMessage"
  ) as HTMLDivElement;
  titleStartHint.style.display = "block";
  titleStartHint.textContent = "読込継続中";
  titleMessage.textContent =
    `起動処理が長時間継続しています\n` +
    `停止位置: ${startupDiagnostics.phase}\n` +
    `経過: ${Math.floor(elapsedMilliseconds / 1_000)}秒`;
};

const appendStartupEvent = (phase: V2StartupPhase) => {
  if (startupDiagnostics === null) {
    throw new Error("V2起動診断が初期化されていません。");
  }
  startupDiagnostics.phase = phase;
  startupDiagnostics.events.push(
    Object.freeze({
      phase,
      elapsedMilliseconds: getElapsedMilliseconds()
    })
  );
};

export const initializeV2StartupDiagnostics = () => {
  if (startupDiagnostics !== null) {
    throw new Error("V2起動診断は既に初期化されています。");
  }
  startupDiagnostics = {
    status: "loading",
    phase: "bootstrap-ready",
    startedAtUnixMilliseconds: Date.now(),
    startedAtPerformanceMilliseconds: performance.now(),
    events: [],
    failure: null
  };
  appendStartupEvent("bootstrap-ready");
  publishStartupDiagnostics();
  startupWatchdogId = window.setInterval(
    updateStalledStartupMessage,
    V2_STARTUP_WATCHDOG_INTERVAL_MILLISECONDS
  );
};

export const markV2StartupPhase = (phase: V2StartupPhase) => {
  if (startupDiagnostics === null) {
    throw new Error("V2起動診断が初期化されていません。");
  }
  if (startupDiagnostics.status !== "loading") {
    return;
  }
  appendStartupEvent(phase);
  publishStartupDiagnostics();
};

export const markV2StartupRunning = () => {
  if (startupDiagnostics === null) {
    throw new Error("V2起動診断が初期化されていません。");
  }
  startupDiagnostics.status = "running";
  appendStartupEvent("running");
  publishStartupDiagnostics();
  stopStartupWatchdog();
};

export const reportV2StartupFailure = (error: unknown) => {
  if (startupDiagnostics === null) {
    throw new Error("V2起動診断が初期化されていません。");
  }
  const failureError =
    error instanceof Error ? error : new Error(String(error));
  startupDiagnostics.status = "failed";
  startupDiagnostics.failure = Object.freeze({
    name: failureError.name,
    message: failureError.message,
    stack: failureError.stack ?? null
  });
  appendStartupEvent("failed");
  publishStartupDiagnostics();
  stopStartupWatchdog();

  const titleOverlay = document.getElementById(
    "titleOverlay"
  ) as HTMLDivElement;
  const titleStartHint = document.getElementById(
    "titleStartHint"
  ) as HTMLDivElement;
  const titleMessage = document.getElementById(
    "titleMessage"
  ) as HTMLDivElement;
  titleOverlay.style.display = "grid";
  titleStartHint.style.display = "block";
  titleStartHint.textContent = "読込エラー";
  titleMessage.style.display = "block";
  titleMessage.textContent = failureError.message;
};

export const markV2PageUnloading = () => {
  if (startupDiagnostics === null) {
    throw new Error("V2起動診断が初期化されていません。");
  }
  startupDiagnostics.status = "unloading";
  appendStartupEvent("page-unloading");
  publishStartupDiagnostics();
  stopStartupWatchdog();
};

declare global {
  interface Window {
    __v2StartupDiagnostics: V2StartupDiagnosticsSnapshot;
  }
}
