import { runTitleSettingsTests } from "./titleSettings.test";
import type { T06TestResult } from "../T06/testUtils";
import "../T06/style.css";
import "../../../src/style.css";

type ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly T06TestResult[];
}>;

declare global {
  interface Window {
    __T06_6A_VALIDATION__: ValidationState;
  }
}

const summary = document.querySelector<HTMLElement>("#summary")!;
const metrics = document.querySelector<HTMLDListElement>("#metrics")!;
const results = document.querySelector<HTMLOListElement>("#check-results")!;
const runButton = document.querySelector<HTMLButtonElement>("#run-validation")!;
const browserIssues: string[] = [];

const recordIssue = (value: unknown) => {
  browserIssues.push(value instanceof Error ? value.message : String(value));
};
window.addEventListener("error", (event) => recordIssue(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => recordIssue(event.reason));
const originalError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  recordIssue(values.join(" "));
  originalError(...values);
};
const originalWarn = console.warn.bind(console);
console.warn = (...values: unknown[]) => {
  recordIssue(values.join(" "));
  originalWarn(...values);
};

const render = (state: ValidationState) => {
  window.__T06_6A_VALIDATION__ = state;
  document.documentElement.dataset.validationStatus = state.status;
  const passed = state.checks.filter((check) => check.ok).length;
  summary.dataset.state = state.status;
  summary.textContent = `${passed} / ${state.checks.length} 項目がPASSしました。`;
  metrics.replaceChildren();
  for (const [label, value] of [["検証項目", state.checks.length], ["PASS", passed]]) {
    const term = document.createElement("dt");
    term.textContent = String(label);
    const definition = document.createElement("dd");
    definition.textContent = String(value);
    metrics.append(term, definition);
  }
  results.replaceChildren(...state.checks.map((check) => {
    const item = document.createElement("li");
    item.dataset.state = check.ok ? "passed" : "failed";
    item.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name} — ${check.detail}`;
    return item;
  }));
};

const run = async () => {
  runButton.disabled = true;
  browserIssues.length = 0;
  document.querySelector(".v2-title-settings")?.remove();
  const checks = [...await runTitleSettingsTests()];
  checks.push(Object.freeze({
    name: "ブラウザconsole異常監視",
    ok: browserIssues.length === 0,
    detail: browserIssues.join(" | ") || "warning/error 0件"
  }));
  const frozenChecks = Object.freeze(checks);
  render(Object.freeze({
    status: frozenChecks.every((check) => check.ok) ? "passed" : "failed",
    checks: frozenChecks
  }));
  runButton.disabled = false;
};

runButton.addEventListener("click", () => void run());
await run();
