import { Logger } from "@babylonjs/core";

import { runPopulationIntegrationTests } from "./populationIntegration.test";
import { runSpawnSelectionTests } from "./spawnSelection.test";
import { runSurfaceSpawnTests } from "./surfaceSpawn.test";
import type { T062TestResult } from "./testUtils";

import "./style.css";

type T062ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly T062TestResult[];
}>;

declare global {
  interface Window {
    __T06_2_VALIDATION__: T062ValidationState;
  }
}

const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults =
  document.querySelector<HTMLOListElement>("#check-results");
const runButton =
  document.querySelector<HTMLButtonElement>("#run-validation");

if (!summary || !metrics || !checkResults || !runButton) {
  throw new Error("T06-2検証UIの必須要素がありません。");
}

const browserErrors: string[] = [];
const browserWarnings: string[] = [];
let validationRunning = false;
let validationHasRun = false;

const formatIssue = (value: unknown) =>
  value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value);

const renderChecks = (checks: readonly T062TestResult[]) => {
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

const renderMetrics = (
  checks: readonly T062TestResult[],
  elapsedMilliseconds: number
) => {
  const passed = checks.filter((check) => check.ok).length;
  const entries = [
    ["検証項目", String(checks.length)],
    ["PASS", String(passed)],
    ["実行時間", `${elapsedMilliseconds.toFixed(1)} ms`]
  ] as const;
  metrics.replaceChildren(
    ...entries.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const definition = document.createElement("dd");
      definition.textContent = value;
      return [term, definition];
    })
  );
};

const failCompletedValidation = (detail: string) => {
  if (document.documentElement.dataset.validationStatus !== "passed") {
    return;
  }
  const check = Object.freeze({
    name: "完了後ブラウザ異常監視",
    ok: false,
    detail
  });
  const checks = Object.freeze([
    ...window.__T06_2_VALIDATION__.checks,
    check
  ]);
  window.__T06_2_VALIDATION__ = Object.freeze({
    status: "failed",
    checks
  });
  document.documentElement.dataset.validationStatus = "failed";
  summary.dataset.state = "failed";
  summary.textContent =
    `${checks.filter((entry) => entry.ok).length} / ` +
    `${checks.length} 項目がPASSしました。`;
  renderChecks(checks);
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
  summary.dataset.state = "running";
  summary.textContent = "T06-2専用fixtureを検証しています。";
  document.documentElement.dataset.validationStatus = "running";
  window.__T06_2_VALIDATION__ = Object.freeze({
    status: "running",
    checks: Object.freeze([])
  });
  checkResults.replaceChildren();
  metrics.replaceChildren();

  const loggerErrorsAtStart = Logger.errorsCount;
  const startedAt = performance.now();
  const checks = [
    ...(await runSpawnSelectionTests()),
    ...(await runSurfaceSpawnTests()),
    ...(await runPopulationIntegrationTests())
  ];
  const elapsedMilliseconds = performance.now() - startedAt;
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

  const frozenChecks = Object.freeze(checks);
  renderChecks(frozenChecks);
  renderMetrics(frozenChecks, elapsedMilliseconds);
  const passed = frozenChecks.filter((check) => check.ok).length;
  const status = passed === frozenChecks.length ? "passed" : "failed";
  summary.dataset.state = status;
  summary.textContent = `${passed} / ${frozenChecks.length} 項目がPASSしました。`;
  document.documentElement.dataset.validationStatus = status;
  window.__T06_2_VALIDATION__ = Object.freeze({
    status,
    checks: frozenChecks
  });
  validationRunning = false;
  runButton.disabled = false;
};

runButton.addEventListener("click", () => {
  void runValidation();
});

void runValidation();
