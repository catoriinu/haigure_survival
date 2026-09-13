const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targetUrl = process.argv.find((value) => value.startsWith("--url=")).slice(6);
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: true, width: 1280, height: 720,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      partition: `t06-6d-retry-${process.pid}` }
  });
  let rejectLoad = true;
  let requests = 0;
  const issues = [];
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) { issues.push(message); console.log(`画面診断: ${message}`); }
  });
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ["*://*/*b02_school_blockout.glb*"] },
    (_details, callback) => { requests += 1; callback({ cancel: rejectLoad }); }
  );
  const evaluate = (source) => window.webContents.executeJavaScript(source, true);
  const waitFor = async (source) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (await evaluate(source)) return;
      await wait(100);
    }
    throw new Error(`条件未成立: ${source}; requests=${requests}; issues=${JSON.stringify(issues)}; title=${await evaluate("document.querySelector('#titleMessage').textContent")}`);
  };
  const click = async (selector) => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const rect = element.getBoundingClientRect();
      for (const fy of [0.5, 0.3, 0.7, 0.1, 0.9]) {
        for (const fx of [0.5, 0.3, 0.7, 0.1, 0.9]) {
          const x = Math.round(rect.left + rect.width * fx);
          const y = Math.round(rect.top + rect.height * fy);
          if (document.elementFromPoint(x, y) === element) return { x, y };
        }
      }
      throw new Error("クリック可能な座標がありません");
    })()`);
    window.focus();
    window.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
    window.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
  };
  await window.loadURL(targetUrl);
  console.log("通常ページ読み込み済み。初回失敗表示を待機します。");
  await waitFor(`document.querySelector('#titleMessage').textContent.includes('クリックすると再試行') && !!window.__v2StaticReuseDiagnostics`);
  assert.equal(requests, 1, "初回ロード失敗を1回注入する");
  await evaluate(`window.addEventListener('unhandledrejection', event => console.error('unhandledrejection', event.reason))`);
  issues.length = 0; // 意図した初回ロード失敗のログだけを除外する。
  await click('[data-ui="v2-settings-ground-shadows"]');
  await wait(500);
  assert.equal(requests, 1, "設定操作では再試行しない");
  assert.equal(await evaluate(`document.querySelector('#titleMessage').textContent.includes('クリックすると再試行')`), true);
  rejectLoad = false;
  await click('#renderCanvas');
  await waitFor(`window.__v2StaticReuseDiagnostics().dynamicOwners.active.length === 13 && !window.__v2StaticReuseDiagnostics().transitionInProgress && getComputedStyle(document.querySelector('#titleOverlay')).display === 'none'`);
  assert.equal(requests, 2, "Canvasクリックで1回だけ再ロードする");
  const state = await evaluate(`window.__v2StaticReuseDiagnostics()`);
  assert.equal(JSON.parse(state.sessionStartSnapshot).settings.display.showGroundShadows, false, "修正した設定を再試行へ反映する");
  assert.deepEqual(issues, [], "再試行時のconsole／unhandled異常なし");
  console.log("T06-6D再試行Electron PASS: 初回失敗、設定操作による再試行なし、Canvas実クリックで復旧、現在設定を反映");
  window.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
