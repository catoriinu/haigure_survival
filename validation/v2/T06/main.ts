import { Logger } from "@babylonjs/core";

import { runAudioRuntimeTests } from "./audioRuntime.test";
import { runCharacterAssignmentTests } from "./characterAssignments.test";
import { runCharacterVisualTests } from "./characterVisual.test";
import { runRoomVariantTests } from "./roomVariant.test";
import { runRuntimeHudTests } from "./runtimeHud.test";
import { runRuntimeInteractionTests } from "./runtimeInteraction.test";
import { runStageTransparentRenderingOrderTests } from "./stageTransparentRenderingOrder.test";
import {
  runRuntimeSessionLifecycleTests
} from "./runtimeSessionLifecycle.test";
import type { T06TestResult } from "./testUtils";

import "./style.css";

type T06ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly T06TestResult[];
}>;

declare global {
  interface Window {
    __T06_VALIDATION__: T06ValidationState;
  }
}

const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults =
  document.querySelector<HTMLOListElement>("#check-results");
const runButton =
  document.querySelector<HTMLButtonElement>("#run-validation");
const canvas = document.getElementById(
  "render-canvas"
) as unknown as HTMLCanvasElement | null;

if (!summary || !metrics || !checkResults || !runButton || !canvas) {
  throw new Error("T06-1検証UIの必須要素がありません。");
}

const browserErrors: string[] = [];
const browserWarnings: string[] = [];
let validationRunning = false;
let validationHasRun = false;

const formatIssue = (value: unknown) =>
  value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value);

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

const renderMetrics = (
  checks: readonly T06TestResult[],
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

const renderFixture = () => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const scale = devicePixelRatio;
  const width = (canvas.width = Math.max(
    720,
    Math.floor(canvas.clientWidth * scale)
  ));
  const height = (canvas.height = Math.max(
    420,
    Math.floor(canvas.clientHeight * scale)
  ));
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07131d");
  gradient.addColorStop(1, "#123047");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#68d7ff";
  context.lineWidth = 3 * scale;
  context.setLineDash([8 * scale, 6 * scale]);
  context.strokeRect(
    width * 0.1,
    height * 0.18,
    width * 0.46,
    height * 0.64
  );
  context.setLineDash([]);
  const labels = ["F / E", "C", "G / N / H", "AUDIO", "WATER 50%"];
  labels.forEach((label, index) => {
    const x = width * (0.18 + (index % 3) * 0.17);
    const y = height * (0.34 + Math.floor(index / 3) * 0.25);
    context.fillStyle = index < 3 ? "#4ee1a0" : "#ffcf5a";
    context.beginPath();
    context.arc(x, y, 15 * scale, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#dcedf8";
    context.font = `${14 * scale}px Consolas, monospace`;
    context.textAlign = "center";
    context.fillText(label, x, y + 34 * scale);
  });
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
    ...window.__T06_VALIDATION__.checks,
    check
  ]);
  window.__T06_VALIDATION__ = Object.freeze({
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
  summary.textContent = "T06-1専用fixtureを検証しています。";
  document.documentElement.dataset.validationStatus = "running";
  window.__T06_VALIDATION__ = Object.freeze({
    status: "running",
    checks: Object.freeze([])
  });
  checkResults.replaceChildren();
  metrics.replaceChildren();

  const loggerErrorsAtStart = Logger.errorsCount;
  const startedAt = performance.now();
  const checks = [
    ...(await runRuntimeInteractionTests()),
    ...(await runRuntimeHudTests()),
    ...(await runRoomVariantTests()),
    ...(await runAudioRuntimeTests()),
    ...(await runCharacterAssignmentTests()),
    ...(await runCharacterVisualTests()),
    ...(await runStageTransparentRenderingOrderTests()),
    ...(await runRuntimeSessionLifecycleTests())
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
  summary.textContent =
    `${passed} / ${frozenChecks.length} 項目がPASSしました。`;
  document.documentElement.dataset.validationStatus = status;
  window.__T06_VALIDATION__ = Object.freeze({
    status,
    checks: frozenChecks
  });
  validationRunning = false;
  runButton.disabled = false;
};

runButton.addEventListener("click", () => {
  void runValidation();
});
window.addEventListener("resize", renderFixture);

renderFixture();
void runValidation();
