import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const requiredViewports = Object.freeze([
  Object.freeze({ width: 1920, height: 1080 }),
  Object.freeze({ width: 1280, height: 720 }),
  Object.freeze({ width: 1024, height: 600 }),
  Object.freeze({ width: 800, height: 600 }),
  Object.freeze({ width: 640, height: 480 }),
  Object.freeze({ width: 480, height: 360 })
]);
const sourcePaths = Object.freeze([
  "index.html",
  "src/style.css",
  "src/v2/bootstrap.ts",
  "src/v2/startupDiagnostics.ts",
  "src/v2/main.ts"
]);

const parseArguments = () => {
  const allowedNames = new Set([
    "url",
    "output-dir",
    "playwright-module",
    "browser-executable"
  ]);
  const values = new Map();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/u.exec(argument);
    if (!match || !allowedNames.has(match[1])) {
      throw new Error("未対応の引数です: " + argument);
    }
    if (values.has(match[1]) || match[2].length === 0) {
      throw new Error("引数が重複または空です: --" + match[1]);
    }
    values.set(match[1], match[2]);
  }
  for (const name of allowedNames) {
    if (!values.has(name)) {
      throw new Error("--" + name + "=で値を指定してください。");
    }
  }

  const url = new URL(values.get("url"));
  if (
    url.protocol !== "http:" ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  ) {
    throw new Error("urlにはローカルHTTP URLを指定してください。");
  }
  const outputDirectory = values.get("output-dir");
  if (!isAbsolute(outputDirectory)) {
    throw new Error("output-dirには絶対pathを指定してください。");
  }
  const playwrightModule = values.get("playwright-module");
  if (
    !isAbsolute(playwrightModule) ||
    basename(playwrightModule).toLowerCase() !== "index.mjs"
  ) {
    throw new Error(
      "playwright-moduleにはPlaywrightの絶対pathのindex.mjsを指定してください。"
    );
  }
  const browserExecutable = values.get("browser-executable");
  if (
    !isAbsolute(browserExecutable) ||
    extname(browserExecutable).toLowerCase() !== ".exe"
  ) {
    throw new Error(
      "browser-executableにはChromium実行ファイルの絶対pathを指定してください。"
    );
  }
  return Object.freeze({
    url,
    outputDirectory,
    playwrightModule,
    browserExecutable
  });
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const readSourceIdentity = async () => {
  const entries = [];
  for (const relativePath of sourcePaths) {
    const content = await readFile(resolve(repositoryRoot, relativePath));
    entries.push(Object.freeze({
      path: relativePath,
      bytes: content.length,
      sha256: sha256(content)
    }));
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    aggregateSha256: sha256(
      JSON.stringify(entries.map((entry) => [entry.path, entry.sha256]))
    )
  });
};

const waitForMainRequest = async (readIntercepted) => {
  const deadline = Date.now() + 10_000;
  while (!readIntercepted()) {
    if (Date.now() >= deadline) {
      throw new Error("main.tsのdynamic import requestを確認できませんでした。");
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
};

const inspectUi = (page) => page.evaluate(() => {
  const required = (selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      throw new Error("必須要素がありません: " + selector);
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      selector,
      text: element.textContent ?? "",
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      style: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        color: style.color,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        textAlign: style.textAlign
      }
    };
  };
  const intersects = (left, right) =>
    Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.5 &&
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.5;
  const titleOverlay = required("#titleOverlay");
  const statusSlot = required("#titleStatusSlot");
  const startupMessage = required("#startupDiagnosticsMessage");
  const titleMessage = required("#titleMessage");
  const startHint = required("#titleStartHint");
  const heading = required("#titleHeading");
  const mode = required("#titleMode");
  const version = required("#titleVersion");
  const elementVisible = (element) =>
    element.style.display !== "none" &&
    element.style.visibility !== "hidden" &&
    Number(element.style.opacity) > 0 &&
    element.rect.width > 0.5 &&
    element.rect.height > 0.5;
  const startupVisible =
    elementVisible(startupMessage);
  const titleMessageVisible = elementVisible(titleMessage);
  const startHintVisible = elementVisible(startHint);
  const activeStatus = startupVisible
    ? startupMessage
    : titleMessageVisible
      ? titleMessage
      : startHint;
  return {
    viewport: { width: innerWidth, height: innerHeight },
    startup: window.__v2StartupDiagnostics ?? null,
    diagnosticsState:
      document.querySelector("#titleStatusSlot")?.dataset
        .startupDiagnosticsState ?? null,
    layout: document.querySelector("#titleOverlay")?.dataset.titleLayout ?? null,
    elements: {
      startupMessage,
      titleMessage,
      startHint,
      heading,
      mode,
      version
    },
    visibility: {
      startupMessage: startupVisible,
      titleMessage: titleMessageVisible,
      startHint: startHintVisible
    },
    overflow: {
      document:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      overlay:
        document.querySelector("#titleOverlay").scrollWidth -
        document.querySelector("#titleOverlay").clientWidth,
      statusSlot:
        document.querySelector("#titleStatusSlot").scrollWidth -
        document.querySelector("#titleStatusSlot").clientWidth
    },
    geometry: {
      activeStatusSelector: activeStatus.selector,
      centerDeltaX: Math.abs(
        (activeStatus.rect.left + activeStatus.rect.right) / 2 -
        (statusSlot.rect.left + statusSlot.rect.right) / 2
      ),
      activeStatusInsideViewport:
        activeStatus.rect.left >= -0.5 &&
        activeStatus.rect.right <= innerWidth + 0.5 &&
        activeStatus.rect.top >= -0.5 &&
        activeStatus.rect.bottom <= innerHeight + 0.5,
      activeStatusIntersectsHeading:
        intersects(activeStatus.rect, heading.rect),
      activeStatusIntersectsMode:
        intersects(activeStatus.rect, mode.rect),
      activeStatusIntersectsVersion:
        intersects(activeStatus.rect, version.rect),
      intersectsTitleMessage:
        startupVisible && intersects(startupMessage.rect, titleMessage.rect),
      intersectsStartHint:
        startupVisible && intersects(startupMessage.rect, startHint.rect),
      intersectsHeading:
        startupVisible && intersects(startupMessage.rect, heading.rect),
      intersectsMode:
        startupVisible && intersects(startupMessage.rect, mode.rect),
      intersectsVersion:
        startupVisible && intersects(startupMessage.rect, version.rect)
    }
  };
});

const validateSnapshot = (snapshot, expectedState) => {
  const errors = [];
  const activeElement =
    snapshot.geometry.activeStatusSelector === "#startupDiagnosticsMessage"
      ? snapshot.elements.startupMessage
      : snapshot.geometry.activeStatusSelector === "#titleMessage"
        ? snapshot.elements.titleMessage
        : snapshot.elements.startHint;
  if (
    snapshot.viewport.width <= 0 ||
    snapshot.viewport.height <= 0 ||
    Object.values(snapshot.overflow).some((value) => value > 1)
  ) {
    errors.push("横overflowまたはviewportが不正");
  }
  if (expectedState === "loading") {
    if (snapshot.startup?.status !== "loading") {
      errors.push("startup statusがloadingではない");
    }
    if (
      snapshot.diagnosticsState !== null ||
      snapshot.visibility.startupMessage ||
      !snapshot.visibility.titleMessage
    ) {
      errors.push("通常loading表示の可視性が不正");
    }
    if (!snapshot.elements.titleMessage.text.includes("NOW LOADING")) {
      errors.push("通常loading文言がない");
    }
    if (
      snapshot.geometry.activeStatusSelector !== "#titleMessage" ||
      snapshot.geometry.centerDeltaX > 2 ||
      !snapshot.geometry.activeStatusInsideViewport ||
      snapshot.geometry.activeStatusIntersectsHeading ||
      snapshot.geometry.activeStatusIntersectsMode ||
      snapshot.geometry.activeStatusIntersectsVersion ||
      activeElement.style.textAlign !== "center" ||
      activeElement.style.fontSize < 12 ||
      activeElement.style.lineHeight < activeElement.style.fontSize
    ) {
      errors.push("通常loadingの中央配置、非重複、可読性が不正");
    }
    return errors;
  }
  if (expectedState === "running") {
    if (snapshot.startup?.status !== "running") {
      errors.push("startup statusがrunningではない");
    }
    if (
      snapshot.diagnosticsState !== null ||
      snapshot.visibility.startupMessage ||
      !snapshot.visibility.startHint
    ) {
      errors.push("resume後の表示状態が不正");
    }
    if (
      snapshot.elements.startHint.text !==
      "左クリック：開始\n（開始前に設定反映を行います）"
    ) {
      errors.push("resume後の通常2行start hintが不正");
    }
    if (
      snapshot.geometry.activeStatusSelector !== "#titleStartHint" ||
      snapshot.geometry.centerDeltaX > 2 ||
      !snapshot.geometry.activeStatusInsideViewport ||
      snapshot.geometry.activeStatusIntersectsHeading ||
      snapshot.geometry.activeStatusIntersectsMode ||
      snapshot.geometry.activeStatusIntersectsVersion ||
      activeElement.style.textAlign !== "center" ||
      activeElement.style.fontSize < 12 ||
      activeElement.style.lineHeight < activeElement.style.fontSize
    ) {
      errors.push("resume後hintの中央配置、非重複、可読性が不正");
    }
    return errors;
  }
  if (snapshot.startup?.status !== (expectedState === "failed" ? "failed" : "loading")) {
    errors.push("startup statusが期待値と異なる");
  }
  if (
    snapshot.diagnosticsState !== expectedState ||
    !snapshot.visibility.startupMessage ||
    snapshot.visibility.titleMessage ||
    snapshot.visibility.startHint
  ) {
    errors.push("専用診断表示と通常表示の排他が不正");
  }
  if (
    snapshot.geometry.intersectsTitleMessage ||
    snapshot.geometry.intersectsStartHint ||
    snapshot.geometry.intersectsHeading ||
    snapshot.geometry.intersectsMode ||
    snapshot.geometry.intersectsVersion
  ) {
    errors.push("専用診断表示が他のtitle要素と重なる");
  }
  if (
    snapshot.geometry.centerDeltaX > 2 ||
    !snapshot.geometry.activeStatusInsideViewport ||
    snapshot.geometry.activeStatusIntersectsHeading ||
    snapshot.geometry.activeStatusIntersectsMode ||
    snapshot.geometry.activeStatusIntersectsVersion ||
    snapshot.elements.startupMessage.style.textAlign !== "center" ||
    snapshot.elements.startupMessage.style.fontSize < 12 ||
    snapshot.elements.startupMessage.style.lineHeight <
      snapshot.elements.startupMessage.style.fontSize
  ) {
    errors.push("専用診断表示の中央配置または可読性が不正");
  }
  if (
    expectedState === "stalled" &&
    !snapshot.elements.startupMessage.text.includes("起動処理が長時間継続しています")
  ) {
    errors.push("stalled文言がない");
  }
  if (
    expectedState === "failed" &&
    !snapshot.elements.startupMessage.text.includes("読込エラー")
  ) {
    errors.push("failed文言がない");
  }
  return errors;
};

const captureState = async (page, outputDirectory, state) => {
  const snapshots = [];
  for (const viewport of requiredViewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const snapshot = await inspectUi(page);
    const errors = validateSnapshot(snapshot, state);
    const stem =
      state + "-" + viewport.width + "x" + viewport.height;
    await page.screenshot({
      path: resolve(outputDirectory, stem + ".png")
    });
    snapshots.push(Object.freeze({
      state,
      viewport,
      snapshot,
      errors,
      screenshot: stem + ".png"
    }));
  }
  return Object.freeze(snapshots);
};

const installDiagnostics = (page, diagnostics) => {
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      diagnostics.console.push({
        type: message.type(),
        text: message.text()
      });
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    });
  });
  page.on("crash", () => {
    diagnostics.crashes += 1;
  });
};

const runStallAndResume = async (browser, options) => {
  const diagnostics = { console: [], pageErrors: [], crashes: 0 };
  const context = await browser.newContext({
    viewport: requiredViewports[0]
  });
  const page = await context.newPage();
  installDiagnostics(page, diagnostics);
  let intercepted = false;
  let releaseRequest;
  const releaseGate = new Promise((resolveRelease) => {
    releaseRequest = resolveRelease;
  });
  await page.route(/\/src\/v2\/main\.ts(?:\?.*)?$/u, async (route) => {
    intercepted = true;
    await releaseGate;
    await route.continue();
  });
  await page.goto(options.url.href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await waitForMainRequest(() => intercepted);
  await page.waitForFunction(
    () => window.__v2StartupDiagnostics?.status === "loading",
    null,
    { timeout: 10_000 }
  );
  const loading = await captureState(
    page,
    options.outputDirectory,
    "loading"
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#titleStatusSlot")?.dataset
        .startupDiagnosticsState === "stalled" &&
      window.__v2StartupDiagnostics?.elapsedMilliseconds >= 15_000,
    null,
    { timeout: 25_000 }
  );
  const stalled = await captureState(
    page,
    options.outputDirectory,
    "stalled"
  );
  releaseRequest();
  await page.waitForFunction(
    () => window.__v2StartupDiagnostics?.status === "running",
    null,
    { timeout: 180_000 }
  );
  await page.evaluate(() => {
    const input = document.querySelector(
      '[data-ui="v2-settings-npc-count"]'
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("NPC数設定inputがありません。");
    }
    input.value = input.value === "23" ? "24" : "23";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#titleStartHint")?.textContent ===
      "左クリック：開始\n（開始前に設定反映を行います）",
    null,
    { timeout: 10_000 }
  );
  const running = await captureState(
    page,
    options.outputDirectory,
    "running"
  );
  await context.close();
  return Object.freeze({ loading, stalled, running, diagnostics });
};

const runFailure = async (browser, options) => {
  const diagnostics = { console: [], pageErrors: [], crashes: 0 };
  const context = await browser.newContext({
    viewport: requiredViewports[0]
  });
  const page = await context.newPage();
  installDiagnostics(page, diagnostics);
  let intercepted = false;
  await page.route(/\/src\/v2\/main\.ts(?:\?.*)?$/u, async (route) => {
    intercepted = true;
    await route.abort("failed");
  });
  await page.goto(options.url.href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  await waitForMainRequest(() => intercepted);
  await page.waitForFunction(
    () =>
      window.__v2StartupDiagnostics?.status === "failed" &&
      document.querySelector("#titleStatusSlot")?.dataset
        .startupDiagnosticsState === "failed",
    null,
    { timeout: 10_000 }
  );
  const failed = await captureState(
    page,
    options.outputDirectory,
    "failed"
  );
  await context.close();
  return Object.freeze({ failed, diagnostics });
};

const options = parseArguments();
const artifact = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  sourceBefore: null,
  sourceAfter: null,
  sourceUnchanged: false,
  stallAndResume: null,
  failure: null,
  outcome: { status: "running", errors: [] }
};
let browser = null;

try {
  await Promise.all([
    access(options.playwrightModule),
    access(options.browserExecutable),
    ...sourcePaths.map((relativePath) =>
      access(resolve(repositoryRoot, relativePath))
    )
  ]);
  await mkdir(options.outputDirectory, { recursive: true });
  artifact.sourceBefore = await readSourceIdentity();
  const playwright = await import(
    pathToFileURL(options.playwrightModule).href
  );
  if (!playwright.chromium || typeof playwright.chromium.launch !== "function") {
    throw new Error("Playwright chromium APIを利用できません。");
  }
  browser = await playwright.chromium.launch({
    executablePath: options.browserExecutable,
    headless: true
  });
  artifact.stallAndResume = await runStallAndResume(browser, options);
  artifact.failure = await runFailure(browser, options);
} catch (error) {
  artifact.outcome.errors.push(
    error instanceof Error ? error.stack ?? error.message : String(error)
  );
} finally {
  if (browser !== null) {
    try {
      await browser.close();
    } catch (error) {
      artifact.outcome.errors.push(
        error instanceof Error ? error.stack ?? error.message : String(error)
      );
    }
  }
  try {
    artifact.sourceAfter = await readSourceIdentity();
    artifact.sourceUnchanged =
      artifact.sourceBefore !== null &&
      artifact.sourceBefore.aggregateSha256 ===
        artifact.sourceAfter.aggregateSha256;
  } catch (error) {
    artifact.outcome.errors.push(
      error instanceof Error ? error.stack ?? error.message : String(error)
    );
  }
  const stateEntries = [
    ...(artifact.stallAndResume?.loading ?? []),
    ...(artifact.stallAndResume?.stalled ?? []),
    ...(artifact.stallAndResume?.running ?? []),
    ...(artifact.failure?.failed ?? [])
  ];
  const snapshotErrors = stateEntries.flatMap((entry) =>
    entry.errors.map((error) =>
      entry.state +
      " " +
      entry.viewport.width +
      "x" +
      entry.viewport.height +
      ": " +
      error
    )
  );
  const runtimeDiagnostics = artifact.stallAndResume?.diagnostics;
  if (
    runtimeDiagnostics &&
    (runtimeDiagnostics.console.length > 0 ||
      runtimeDiagnostics.pageErrors.length > 0 ||
      runtimeDiagnostics.crashes > 0)
  ) {
    artifact.outcome.errors.push(
      "stall/resume contextにconsole/page/process異常があります。"
    );
  }
  artifact.outcome.errors.push(...snapshotErrors);
  if (!artifact.sourceUnchanged) {
    artifact.outcome.errors.push("観測前後で対象source hashが変化しました。");
  }
  artifact.outcome.status =
    artifact.outcome.errors.length === 0 ? "passed" : "failed";
  artifact.finishedAt = new Date().toISOString();
  await mkdir(options.outputDirectory, { recursive: true });
  await writeFile(
    resolve(options.outputDirectory, "result.json"),
    JSON.stringify(artifact, null, 2) + "\n",
    "utf8"
  );
}

process.stdout.write(
  "P2-U01 startup UI: " +
    artifact.outcome.status +
    " / " +
    resolve(options.outputDirectory, "result.json") +
    "\n"
);
if (artifact.outcome.status !== "passed") {
  process.exitCode = 1;
}
