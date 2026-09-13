import "../style.css";

import {
  initializeV2StartupDiagnostics,
  markV2StartupPhase,
  markV2StartupRunning,
  reportV2StartupFailure
} from "./startupDiagnostics";

const waitForLoadingUiPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });

const startV2Runtime = async () => {
  initializeV2StartupDiagnostics();
  await waitForLoadingUiPaint();
  markV2StartupPhase("loading-ui-painted");
  markV2StartupPhase("runtime-module-loading");
  try {
    await import("./main");
    markV2StartupRunning();
  } catch (error) {
    reportV2StartupFailure(error);
    console.error("V2起動に失敗しました。", error);
  }
};

void startV2Runtime();
