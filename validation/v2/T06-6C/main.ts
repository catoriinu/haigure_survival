import "../../../src/style.css";
import { runT06_6CTests } from "./titleResponsive.test";
import type { T06TestResult } from "../T06/testUtils";

type ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly T06TestResult[];
}>;

declare global {
  interface Window {
    __T06_6C_VALIDATION__: ValidationState;
  }
}

const summary = document.getElementById("summary") as HTMLParagraphElement;
const results = document.getElementById("check-results") as HTMLOListElement;
const runButton = document.getElementById("run-validation") as HTMLButtonElement;
const browserIssues: string[] = [];
const recordIssue = (value: unknown): void => {
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

const render = (state: ValidationState): void => {
  window.__T06_6C_VALIDATION__ = state;
  document.documentElement.dataset.validationStatus = state.status;
  const passed = state.checks.filter((check) => check.ok).length;
  summary.textContent = `${passed} / ${state.checks.length} 項目がPASSしました。`;
  results.replaceChildren(...state.checks.map((check) => {
    const item = document.createElement("li");
    item.dataset.state = check.ok ? "passed" : "failed";
    item.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name} — ${check.detail}`;
    return item;
  }));
};

const run = async (): Promise<void> => {
  runButton.disabled = true;
  browserIssues.length = 0;
  const checks = [...await runT06_6CTests()];
  checks.push(Object.freeze({
    name: "ブラウザconsole異常監視",
    ok: browserIssues.length === 0,
    detail: browserIssues.join(" | ") || "warning/error 0件"
  }));
  const frozen = Object.freeze(checks);
  render(Object.freeze({
    status: frozen.every((check) => check.ok) ? "passed" : "failed",
    checks: frozen
  }));
  runButton.disabled = false;
};

runButton.addEventListener("click", () => location.reload());
await run();
