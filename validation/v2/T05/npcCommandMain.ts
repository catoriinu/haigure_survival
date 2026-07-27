import { Logger } from "@babylonjs/core";

import {
  runNpcCommandTests,
  type NpcCommandTestResult
} from "./npcCommand.test";

import "./style.css";

type T05NpcCommandValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly NpcCommandTestResult[];
}>;

declare global {
  interface Window {
    __T05_3_VALIDATION__: T05NpcCommandValidationState;
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

if (
  !summary ||
  !metrics ||
  !checkResults ||
  !runButton ||
  !canvas
) {
  throw new Error("T05-3検証UIの必須要素がありません。");
}

const browserErrors: string[] = [];
const browserWarnings: string[] = [];
let validationRunning = false;
let validationHasRun = false;

const formatIssue = (value: unknown) =>
  value instanceof Error
    ? `${value.name}: ${value.message}`
    : String(value);

const renderChecks = (
  checks: readonly NpcCommandTestResult[]
) => {
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
  checks: readonly NpcCommandTestResult[],
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

const renderFixtureMap = () => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const width = (canvas.width = Math.max(
    640,
    Math.floor(canvas.clientWidth * devicePixelRatio)
  ));
  const height = (canvas.height = Math.max(
    360,
    Math.floor(canvas.clientHeight * devicePixelRatio)
  ));
  context.fillStyle = "#07131d";
  context.fillRect(0, 0, width, height);
  const playerX = width * 0.5;
  const playerY = height * 0.68;
  context.strokeStyle = "#68d7ff";
  context.lineWidth = 3 * devicePixelRatio;
  context.beginPath();
  context.moveTo(playerX, playerY);
  context.lineTo(playerX, height * 0.2);
  context.stroke();
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(
    playerX,
    playerY,
    11 * devicePixelRatio,
    0,
    Math.PI * 2
  );
  context.fill();
  const colors = ["#4ee1a0", "#ffcf5a", "#ff83ba"];
  [-0.2, 0, 0.2].forEach((offset, index) => {
    const x = playerX + width * offset;
    const y = height * 0.38;
    context.strokeStyle = colors[index];
    context.setLineDash([
      7 * devicePixelRatio,
      5 * devicePixelRatio
    ]);
    context.beginPath();
    context.moveTo(playerX, playerY);
    context.lineTo(x, y);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = colors[index];
    context.beginPath();
    context.arc(
      x,
      y,
      13 * devicePixelRatio,
      0,
      Math.PI * 2
    );
    context.fill();
  });
  context.fillStyle = "#a9c8da";
  context.font = `${16 * devicePixelRatio}px sans-serif`;
  context.textAlign = "center";
  context.fillText(
    "Follow / local separation / synchronized fire",
    playerX,
    height * 0.12
  );
};

const failCompletedValidation = (detail: string) => {
  if (
    document.documentElement.dataset.validationStatus !==
    "passed"
  ) {
    return;
  }
  const check = Object.freeze({
    name: "完了後ブラウザ異常監視",
    ok: false,
    detail
  });
  const checks = Object.freeze([
    ...window.__T05_3_VALIDATION__.checks,
    check
  ]);
  window.__T05_3_VALIDATION__ = Object.freeze({
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

const runValidation = () => {
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
  summary.textContent = "T05-3専用fixtureを検証しています。";
  document.documentElement.dataset.validationStatus = "running";
  window.__T05_3_VALIDATION__ = Object.freeze({
    status: "running",
    checks: Object.freeze([])
  });
  checkResults.replaceChildren();
  metrics.replaceChildren();

  const loggerErrorsAtStart = Logger.errorsCount;
  const startedAt = performance.now();
  const checks = [...runNpcCommandTests()];
  const elapsedMilliseconds = performance.now() - startedAt;
  const loggerErrorCount =
    Logger.errorsCount - loggerErrorsAtStart;
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
  const status =
    passed === frozenChecks.length ? "passed" : "failed";
  summary.dataset.state = status;
  summary.textContent =
    `${passed} / ${frozenChecks.length} 項目がPASSしました。`;
  document.documentElement.dataset.validationStatus = status;
  window.__T05_3_VALIDATION__ = Object.freeze({
    status,
    checks: frozenChecks
  });
  validationRunning = false;
  runButton.disabled = false;
};

runButton.addEventListener("click", runValidation);
window.addEventListener("resize", renderFixtureMap);

renderFixtureMap();
runValidation();
