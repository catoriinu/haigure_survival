import {
  runSchoolIntegrationAcceptance,
  type SchoolIntegrationCheck
} from "./schoolIntegrationAcceptance";

import "./style.css";

const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults = document.querySelector<HTMLOListElement>("#check-results");
const runButton = document.querySelector<HTMLButtonElement>("#run-validation");

if (!summary || !metrics || !checkResults || !runButton) {
  throw new Error("T04-3B実学校fixtureの必須UI要素がありません。");
}

const renderChecks = (checks: readonly SchoolIntegrationCheck[]) => {
  checkResults.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.dataset.ok = String(check.ok);
      const name = document.createElement("strong");
      name.textContent = check.name;
      const detail = document.createElement("span");
      detail.textContent = check.detail;
      item.append(name, detail);
      return item;
    })
  );
};

const renderMetrics = (
  durationMs: number,
  checks: readonly SchoolIntegrationCheck[]
) => {
  const passed = checks.filter((check) => check.ok).length;
  const entries = [
    ["検証件数", `${passed}/${checks.length}`],
    ["実行時間", `${durationMs.toFixed(1)} ms`]
  ];
  metrics.replaceChildren(
    ...entries.flatMap(([name, value]) => {
      const term = document.createElement("dt");
      term.textContent = name;
      const description = document.createElement("dd");
      description.textContent = value;
      return [term, description];
    })
  );
};

const run = async () => {
  document.documentElement.dataset.validationStatus = "running";
  summary.dataset.state = "running";
  summary.textContent = "実学校資産を読み込み、動的統合を検証しています。";
  runButton.disabled = true;
  checkResults.replaceChildren();
  metrics.replaceChildren();
  const startedAt = performance.now();
  try {
    const checks = await runSchoolIntegrationAcceptance();
    const durationMs = performance.now() - startedAt;
    renderChecks(checks);
    renderMetrics(durationMs, checks);
    const failed = checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      throw new Error(
        `T04-3B実学校fixtureが${failed.length}件失敗しました: ` +
          failed.map((check) => check.name).join("、")
      );
    }
    document.documentElement.dataset.validationStatus = "passed";
    summary.dataset.state = "passed";
    summary.textContent = `実学校動的統合 ${checks.length}/${checks.length}件がPASSしました。`;
  } catch (error) {
    document.documentElement.dataset.validationStatus = "failed";
    summary.dataset.state = "failed";
    summary.textContent =
      error instanceof Error
        ? `検証失敗: ${error.message}`
        : `検証失敗: ${String(error)}`;
    throw error;
  } finally {
    runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => {
  void run();
});

void run();
