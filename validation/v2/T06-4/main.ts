import { Logger } from "@babylonjs/core";

import { runBroadcastRuntimeTests } from "./broadcastRuntime.test";
import { runMissionRuntimeTests } from "./missionRuntime.test";
import { runNpcMissionTests } from "./npcMission.test";
import type { T06TestResult } from "../T06/testUtils";

import "../T06/style.css";

type T064ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly T06TestResult[];
}>;

declare global {
  interface Window {
    __T06_4_VALIDATION__: T064ValidationState;
  }
}

const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults = document.querySelector<HTMLOListElement>("#check-results");
const runButton = document.querySelector<HTMLButtonElement>("#run-validation");
if (!summary || !metrics || !checkResults || !runButton) {
  throw new Error("T06-4検証UIの必須要素がありません。");
}

const browserErrors: string[] = [];
const browserWarnings: string[] = [];
let validationRunning = false;
let validationHasRun = false;

const formatIssue = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);

const renderChecks = (checks: readonly T06TestResult[]) => {
  checkResults.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.dataset.state = check.ok ? "passed" : "failed";
      const heading = document.createElement("strong");
      heading.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name}`;
      const detail = document.createElement("span");
      detail.textContent = check.detail;
      item.append(heading, detail);
      return item;
    })
  );
};

const publishState = (
  status: T064ValidationState["status"],
  checks: readonly T06TestResult[],
  elapsedMilliseconds: number
) => {
  const passed = checks.filter((check) => check.ok).length;
  summary.dataset.state = status;
  summary.textContent =
    status === "running"
      ? "T06-4専用fixtureを検証しています。"
      : `${passed} / ${checks.length} 項目がPASSしました。`;
  metrics.replaceChildren(
    ...[
      ["検証項目", String(checks.length)],
      ["PASS", String(passed)],
      ["実行時間", `${elapsedMilliseconds.toFixed(1)} ms`]
    ].flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const definition = document.createElement("dd");
      definition.textContent = value;
      return [term, definition];
    })
  );
  renderChecks(checks);
  window.__T06_4_VALIDATION__ = Object.freeze({
    status,
    checks: Object.freeze(checks)
  });
  document.documentElement.dataset.validationStatus = status;
};

const failCompletedValidation = (detail: string) => {
  if (document.documentElement.dataset.validationStatus !== "passed") {
    return;
  }
  const checks = Object.freeze([
    ...window.__T06_4_VALIDATION__.checks,
    Object.freeze({
      name: "完了後ブラウザ異常監視",
      ok: false,
      detail
    })
  ]);
  publishState("failed", checks, 0);
};

window.addEventListener("error", (event) => {
  const detail = formatIssue(event.error ?? event.message);
  browserErrors.push(detail);
  failCompletedValidation(`error: ${detail}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const detail = formatIssue(event.reason);
  browserErrors.push(detail);
  failCompletedValidation(`unhandledrejection: ${detail}`);
});
const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  const detail = values.map(formatIssue).join(" ");
  browserErrors.push(detail);
  failCompletedValidation(`console.error: ${detail}`);
  originalConsoleError(...values);
};
const originalConsoleWarn = console.warn.bind(console);
console.warn = (...values: unknown[]) => {
  const detail = values.map(formatIssue).join(" ");
  browserWarnings.push(detail);
  failCompletedValidation(`console.warn: ${detail}`);
  originalConsoleWarn(...values);
};

const runValidation = async () => {
  if (validationRunning) {
    return;
  }
  validationRunning = true;
  if (validationHasRun) {
    browserErrors.length = 0;
    browserWarnings.length = 0;
  }
  validationHasRun = true;
  runButton.disabled = true;
  publishState("running", Object.freeze([]), 0);
  const loggerErrorsAtStart = Logger.errorsCount;
  const startedAt = performance.now();
  const checks = [
    ...(await runMissionRuntimeTests()),
    ...(await runNpcMissionTests()),
    ...(await runBroadcastRuntimeTests())
  ];
  const loggerErrorCount = Logger.errorsCount - loggerErrorsAtStart;
  checks.push(
    Object.freeze({
      name: "ブラウザ・console・Babylon異常監視",
      ok:
        browserErrors.length === 0 &&
        browserWarnings.length === 0 &&
        loggerErrorCount === 0,
      detail:
        `Babylon Logger=${loggerErrorCount} / ` +
        `errors=${browserErrors.join(" | ") || "なし"} / ` +
        `warnings=${browserWarnings.join(" | ") || "なし"}`
    })
  );
  const elapsedMilliseconds = performance.now() - startedAt;
  const frozenChecks = Object.freeze(checks);
  const status = frozenChecks.every((check) => check.ok)
    ? "passed"
    : "failed";
  publishState(status, frozenChecks, elapsedMilliseconds);
  validationRunning = false;
  runButton.disabled = false;
};

runButton.addEventListener("click", () => {
  void runValidation();
});

void runValidation();
