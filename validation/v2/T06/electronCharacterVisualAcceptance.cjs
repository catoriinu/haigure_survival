const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const readArgument = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) {
    throw new Error(`${name}の値が必要です。`);
  }
  return process.argv[index + 1];
};

const applicationUrl = new URL(readArgument("--url"));
if (
  applicationUrl.hostname !== "localhost" &&
  applicationUrl.hostname !== "127.0.0.1"
) {
  throw new Error("--urlにはローカルVite URLが必要です。");
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitFor = async (name, operation, timeoutMilliseconds) => {
  const deadline = Date.now() + timeoutMilliseconds;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await operation();
    if (latest.ready) {
      return latest;
    }
    await wait(100);
  }
  throw new Error(
    `${name}を${timeoutMilliseconds}ms以内に確認できませんでした: ${JSON.stringify(latest)}`,
  );
};

const diagnostics = {
  console: [],
  renderer: [],
  load: [],
  renderProcessGone: [],
  unresponsive: [],
};

ipcMain.on("t06-renderer-diagnostic", (_event, diagnostic) => {
  diagnostics.renderer.push(diagnostic);
});

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

let testWindow = null;

const inspectDom = () =>
  testWindow.webContents.executeJavaScript(
    `(() => {
      const visible = (element) => {
        if (!element || element.hidden) {
          return false;
        }
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };
      const canvas = document.getElementById("renderCanvas");
      const rect = canvas?.getBoundingClientRect() ?? null;
      return {
        titleHint: document.getElementById("titleStartHint")?.textContent ?? "",
        titleVisible: visible(document.getElementById("titleOverlay")),
        pointerLockId: document.pointerLockElement?.id ?? null,
        verticalAngleChecked: document.querySelector('[data-ui="v2-character-sprite-vertical-angle-checkbox"]')?.checked ?? null,
        canvasRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
      };
    })()`,
    true,
  );

const clickCanvas = async () => {
  const snapshot = await inspectDom();
  if (snapshot.canvasRect === null) {
    throw new Error("renderCanvasの領域を取得できません。");
  }
  const x = Math.round(snapshot.canvasRect.x + snapshot.canvasRect.width / 2);
  const y = Math.round(snapshot.canvasRect.y + snapshot.canvasRect.height / 2);
  testWindow.webContents.sendInputEvent({ type: "mouseMove", x, y });
  testWindow.webContents.sendInputEvent({
    type: "mouseDown",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await wait(50);
  testWindow.webContents.sendInputEvent({
    type: "mouseUp",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  return { x, y };
};

const capture = async (name) => {
  const image = await testWindow.capturePage();
  const outputPath = path.join(
    app.getPath("temp"),
    `haigure-t06-character-${process.pid}-${name}.png`,
  );
  fs.writeFileSync(outputPath, image.toPNG());
  return outputPath;
};

const run = async () => {
  await app.whenReady();
  testWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      partition: `t06-character-visual-${process.pid}`,
      preload: path.join(__dirname, "electronAcceptancePreload.cjs"),
    },
  });
  testWindow.setMenuBarVisibility(false);
  const runtimeSession = testWindow.webContents.session;
  runtimeSession.setPermissionCheckHandler((_webContents, permission) =>
    permission === "pointerLock",
  );
  runtimeSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "pointerLock");
    },
  );
  testWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        diagnostics.console.push({ level, message, line, sourceId });
      }
    },
  );
  testWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      diagnostics.load.push({
        errorCode,
        errorDescription,
        validatedUrl,
        isMainFrame,
      });
    },
  );
  testWindow.webContents.on("render-process-gone", (_event, details) => {
    diagnostics.renderProcessGone.push(details);
  });
  testWindow.webContents.on("unresponsive", () => {
    diagnostics.unresponsive.push({ at: new Date().toISOString() });
  });

  await testWindow.loadURL(applicationUrl.toString());
  testWindow.show();
  testWindow.focus();

  const title = await waitFor(
    "地面垂直表示の既定タイトル",
    async () => {
      const snapshot = await inspectDom();
      return {
        ...snapshot,
        ready:
          snapshot.titleHint === "左クリック：開始" &&
          snapshot.titleVisible &&
          snapshot.verticalAngleChecked === true,
      };
    },
    120_000,
  );
  const center = await clickCanvas();
  const started = await waitFor(
    "Canvas開始とPointer Lock",
    async () => {
      const snapshot = await inspectDom();
      return {
        ...snapshot,
        ready:
          !snapshot.titleVisible &&
          snapshot.pointerLockId === "renderCanvas",
      };
    },
    10_000,
  );
  const forwardScreenshot = await capture("forward");

  await testWindow.webContents.executeJavaScript(
    `(() => {
      const canvas = document.getElementById("renderCanvas");
      if (!canvas || document.pointerLockElement !== canvas) {
        throw new Error("足元表示検証にはrenderCanvasのPointer Lockが必要です。");
      }
      for (let index = 0; index < 36; index += 1) {
        const event = new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
          clientX: ${center.x},
          clientY: ${center.y}
        });
        Object.defineProperty(event, "movementX", { value: 0 });
        Object.defineProperty(event, "movementY", { value: 70 });
        canvas.dispatchEvent(event);
      }
    })()`,
    true,
  );
  await wait(500);
  const downwardScreenshot = await capture("downward");
  await testWindow.webContents.executeJavaScript(
    "document.exitPointerLock()",
    true,
  );
  await wait(500);

  if (
    diagnostics.console.length !== 0 ||
    diagnostics.renderer.length !== 0 ||
    diagnostics.load.length !== 0 ||
    diagnostics.renderProcessGone.length !== 0 ||
    diagnostics.unresponsive.length !== 0
  ) {
    throw new Error(`Electron診断が0件ではありません: ${JSON.stringify(diagnostics)}`);
  }

  return {
    status: "passed",
    title: {
      verticalAngleChecked: title.verticalAngleChecked,
    },
    started: {
      pointerLockId: started.pointerLockId,
    },
    screenshots: {
      forward: forwardScreenshot,
      downward: downwardScreenshot,
    },
    diagnostics,
  };
};

run()
  .then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  })
  .catch((error) => {
    process.exitCode = 1;
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
  })
  .finally(async () => {
    if (testWindow && !testWindow.isDestroyed()) {
      await testWindow.loadURL("about:blank");
      await wait(250);
      testWindow.destroy();
    }
    app.quit();
  });
