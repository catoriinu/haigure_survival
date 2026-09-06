const { app, BrowserWindow } = require("electron");
const { writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const urlArgument = process.argv.find((argument) => argument.startsWith("--url="));
if (!urlArgument) {
  throw new Error("--urlでT06-6C fixture URLを指定してください。");
}
const targetUrl = urlArgument.slice("--url=".length);
const sizes = [
  [1920, 1080, "wide"],
  [1280, 720, "wide"],
  [1024, 600, "compact"],
  [800, 600, "compact"],
  [749, 600, "compact"],
  [720, 600, "stacked"],
  [640, 480, "stacked"],
  [480, 360, "stacked"]
];

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

const readLayout = (window) => window.webContents.executeJavaScript(`(() => {
  const overlay = document.querySelector("#titleOverlay");
  const settings = document.querySelector(".v2-title-settings");
  const main = document.querySelector(".v2-title-settings__main-host");
  const version = document.querySelector("#titleVersion");
  const controls = [...settings.querySelectorAll("input, select, button")]
    .filter((element) => element.getClientRects().length > 0);
  const fonts = [...settings.querySelectorAll(".v2-title-settings__label, .v2-title-settings__section-title, button")]
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => Number(getComputedStyle(element).fontSize.replace("px", "")));
  const overlayRect = overlay.getBoundingClientRect();
  const versionRect = version.getBoundingClientRect();
  const stageRect = document.querySelector(".v2-title-settings__stage-host").getBoundingClientRect();
  const audioRect = document.querySelector(".v2-title-settings__audio-host").getBoundingClientRect();
  const mainRect = main.getBoundingClientRect();
  const focusable = controls.filter((element) => !element.disabled);
  return {
    viewport: [innerWidth, innerHeight],
    layout: overlay.dataset.titleLayout,
    overflow: {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overlay: overlay.scrollWidth - overlay.clientWidth,
      settings: settings.scrollWidth - settings.clientWidth,
      main: main.scrollWidth - main.clientWidth
    },
    minimumControlHeight: Math.min(...controls.map((element) => element.getBoundingClientRect().height)),
    minimumFontSize: Math.min(...fonts),
    versionInside:
      versionRect.left >= overlayRect.left && versionRect.right <= overlayRect.right &&
      versionRect.top >= overlayRect.top && versionRect.bottom <= overlayRect.bottom,
    focusableCount: focusable.length,
    panelWidths: {
      stage: stageRect.width,
      audio: audioRect.width,
      main: mainRect.width
    },
    scroll: {
      settings: [settings.scrollHeight, settings.clientHeight],
      main: [main.scrollHeight, main.clientHeight]
    },
    savedStatusCount: document.querySelectorAll('[data-ui="v2-settings-saved-status"]').length
  };
})()`, true);

const assertSnapshot = (snapshot, expectedLayout) => {
  const overflowValues = Object.values(snapshot.overflow);
  const minimumExpectedControlHeight = expectedLayout === "wide" ? 16 : 32;
  const widePanelWidthsValid = expectedLayout !== "wide" ||
    (snapshot.panelWidths.main <= 405.5 && snapshot.panelWidths.stage <= 330.5 && snapshot.panelWidths.audio <= 250.5);
  const normalDesktopFitsWithoutScroll = snapshot.viewport[0] !== 1920 || snapshot.viewport[1] !== 1080 ||
    snapshot.scroll.main[0] <= snapshot.scroll.main[1] + 1;
  if (
    snapshot.layout !== expectedLayout ||
    overflowValues.some((value) => value > 1) ||
    snapshot.minimumControlHeight < minimumExpectedControlHeight ||
    snapshot.minimumFontSize < 12 ||
    !snapshot.versionInside ||
    snapshot.savedStatusCount !== 0 ||
    !widePanelWidthsValid ||
    !normalDesktopFitsWithoutScroll
  ) {
    throw new Error(`responsive受入失敗: ${JSON.stringify(snapshot)}`);
  }
};

app.whenReady().then(async () => {
  const browserIssues = [];
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
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
    `document.documentElement.dataset.validationStatus === "passed"`
  );

  const results = { instant: [], normal: [], resizeSequence: null, screenshots: [] };
  for (const [width, height, layout] of sizes) {
    window.setContentSize(width, height);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const snapshot = await readLayout(window);
    assertSnapshot(snapshot, layout);
    results.instant.push(snapshot);
    if (width === 640 || width === 480) {
      const image = await window.capturePage();
      const path = join(app.getPath("temp"), `t06-6c-electron-instant-${width}x${height}.png`);
      await writeFile(path, image.toPNG());
      results.screenshots.push(path);
    }
  }

  await window.webContents.executeJavaScript(
    `document.querySelector('[data-ui="title-instant-execution-toggle-button"]').click()`,
    true
  );
  for (const [width, height, layout] of sizes) {
    window.setContentSize(width, height);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const snapshot = await readLayout(window);
    assertSnapshot(snapshot, layout);
    results.normal.push(snapshot);
    if (width === 640 || width === 480) {
      const reachedEnd = await window.webContents.executeJavaScript(`(() => {
        const root = document.querySelector(".v2-title-settings");
        root.scrollTop = root.scrollHeight;
        const last = [...root.querySelectorAll("input, select, button")]
          .filter((element) => element.getClientRects().length > 0 && !element.disabled)
          .at(-1);
        last.focus();
        return root.scrollTop + root.clientHeight >= root.scrollHeight - 1 && document.activeElement === last;
      })()`, true);
      if (!reachedEnd) {
        throw new Error(`${width}x${height}で設定末尾へ到達できません。`);
      }
      const image = await window.capturePage();
      const path = join(app.getPath("temp"), `t06-6c-electron-normal-${width}x${height}.png`);
      await writeFile(path, image.toPNG());
      results.screenshots.push(path);
    }
  }

  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-ui="v2-settings-npc-count"]');
    input.value = "23";
    input.dispatchEvent(new Event("change"));
    input.focus();
    document.querySelector(".v2-title-settings").scrollTop = 40;
  })()`, true);
  const resizeSequence = [];
  for (const [width, height] of [[1920, 1080], [1024, 600], [640, 480], [1280, 720]]) {
    window.setContentSize(width, height);
    await new Promise((resolve) => setTimeout(resolve, 120));
    resizeSequence.push(await window.webContents.executeJavaScript(`(() => ({
      viewport: [innerWidth, innerHeight],
      value: document.querySelector('[data-ui="v2-settings-npc-count"]').value,
      mode: document.querySelector('[data-ui="title-instant-execution-toggle-button"]').textContent,
      version: document.querySelector("#titleVersion").textContent,
      focused: document.activeElement?.dataset.ui ?? null,
      activeScrollTop: document.querySelector("#titleOverlay").dataset.titleLayout === "stacked"
        ? document.querySelector(".v2-title-settings").scrollTop
        : document.querySelector(".v2-title-settings__main-host").scrollTop
    }))()`, true));
  }
  if (resizeSequence.some((entry) =>
    entry.value !== "23" || entry.mode !== "いきなり公開処刑モードに変更" ||
    entry.version !== "ver.2.0.0" || entry.focused !== "v2-settings-npc-count"
  )) {
    throw new Error(`連続resizeで状態が失われました: ${JSON.stringify(resizeSequence)}`);
  }
  results.resizeSequence = resizeSequence;

  if (browserIssues.length > 0) {
    throw new Error(`console/process異常: ${browserIssues.join(" | ")}`);
  }
  console.log(JSON.stringify(results));
  await window.close();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
