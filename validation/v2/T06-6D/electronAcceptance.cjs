const { app, BrowserWindow } = require("electron");

const urlArgument = process.argv.find((argument) => argument.startsWith("--url="));
if (!urlArgument) {
  throw new Error("--urlでT06-6D fixture URLを指定してください。");
}
const targetUrl = urlArgument.slice("--url=".length);

const waitFor = async (window, predicate, timeoutMilliseconds = 15000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    if (await window.webContents.executeJavaScript(predicate, true)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`待機条件が${timeoutMilliseconds}ms以内に成立しませんでした。`);
};

app.whenReady().then(async () => {
  const browserIssues = [];
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) {
      browserIssues.push(message);
    }
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    browserIssues.push(`render-process-gone:${details.reason}`);
  });
  await window.loadURL(targetUrl);
  await waitFor(
    window,
    `document.documentElement.dataset.validationStatus === "passed" || document.documentElement.dataset.validationStatus === "failed"`
  );
  const state = await window.webContents.executeJavaScript(
    `JSON.parse(JSON.stringify(window.__T06_6D_VALIDATION__))`,
    true
  );
  if (state.status !== "passed" || browserIssues.length > 0) {
    throw new Error(
      `T06-6D Electron受入失敗: ${JSON.stringify({ state, browserIssues })}`
    );
  }
  console.log(
    `T06-6D Electron受入 PASS: ${state.checks.filter((check) => check.ok).length}/${state.checks.length}`
  );
  window.close();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
