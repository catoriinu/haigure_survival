const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: true,
    width: 1920,
    height: 1080,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      partition: `t07-performance-${process.pid}`
    }
  });
  window.webContents.session.setPermissionCheckHandler(
    (_contents, permission) => permission === "pointerLock"
  );
  window.webContents.session.setPermissionRequestHandler(
    (_contents, permission, callback) => callback(permission === "pointerLock")
  );
  window.setContentSize(1920, 1080);
  // runnerがconsole監視とreport退避を登録してから実ゲームへ移動する。
  const waitingDocument = '<!doctype html><meta charset="UTF-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; object-src \'none\'; base-uri \'none\'">';
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(waitingDocument)}`);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

app.on("window-all-closed", () => app.quit());
