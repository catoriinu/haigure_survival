import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  classifyMediaRequestFailures,
  installMediaObservation
} from "./mediaObservation.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const EXPECTED_DYNAMIC_OWNERS = Object.freeze([
  "actor",
  "room-active-set",
  "mission",
  "timer",
  "reservation",
  "passenger",
  "input",
  "hud",
  "audio",
  "observer",
  "subscription",
  "query",
  "human-navigation-world"
]);

const parseArguments = () => {
  const allowedNames = new Set([
    "runtime",
    "cycles",
    "output",
    "playwright-module",
    "browser-executable",
    "url"
  ]);
  const values = new Map();
  for (const argument of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/u.exec(argument);
    if (!match || !allowedNames.has(match[1])) {
      throw new Error(`未対応の引数です: ${argument}`);
    }
    if (values.has(match[1])) {
      throw new Error(`引数が重複しています: --${match[1]}`);
    }
    if (match[2].length === 0) {
      throw new Error(`--${match[1]}=で値を指定してください。`);
    }
    values.set(match[1], match[2]);
  }
  for (const name of [
    "runtime",
    "cycles",
    "output",
    "playwright-module",
    "url"
  ]) {
    if (!values.has(name)) {
      throw new Error(`--${name}=で値を指定してください。`);
    }
  }

  const runtime = values.get("runtime").toLowerCase();
  if (runtime !== "web" && runtime !== "electron") {
    throw new Error("runtimeはwebまたはelectronです。");
  }
  const cycles = Number(values.get("cycles"));
  if (!Number.isSafeInteger(cycles) || cycles < 3) {
    throw new Error("cyclesは3以上の整数で指定してください。");
  }
  const outputValue = values.get("output");
  const outputPath = isAbsolute(outputValue)
    ? outputValue
    : resolve(repositoryRoot, outputValue);
  if (extname(outputPath).toLowerCase() !== ".json") {
    throw new Error("outputにはJSONファイルを指定してください。");
  }
  const playwrightModule = values.get("playwright-module");
  if (!isAbsolute(playwrightModule)) {
    throw new Error("playwright-moduleには絶対pathを指定してください。");
  }
  const browserExecutable = values.get("browser-executable") ?? null;
  if (
    runtime === "web" &&
    (
      browserExecutable === null ||
      !isAbsolute(browserExecutable) ||
      extname(browserExecutable).toLowerCase() !== ".exe"
    )
  ) {
    throw new Error(
      "Webではbrowser-executableにChromium実行ファイルの絶対pathを指定してください。"
    );
  }

  const url = new URL(values.get("url"));
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("計測対象はローカルHTTP URLに限ります。");
  }
  const conflictingParameters = [
    "schoolStress",
    "missionAcceptance",
    "elevatorAcceptance",
    "rampValidation",
    "schoolVisualAcceptance"
  ].filter((name) => url.searchParams.has(name));
  if (conflictingParameters.length > 0) {
    throw new Error(
      `通常性能profileと併用できないqueryです: ${conflictingParameters.join(",")}`
    );
  }
  url.searchParams.set("performance", "normal");
  url.searchParams.set("seed", "20260725");
  url.searchParams.set("view", "courtyard");

  return Object.freeze({
    runtime,
    cycles,
    outputPath,
    playwrightModule,
    browserExecutable,
    url
  });
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const git = (...argumentsValue) =>
  execFileSync("git", argumentsValue, {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();

const readSourceIdentity = async () => {
  const files = git(
    "ls-files",
    "-c",
    "-o",
    "--exclude-standard",
    "--",
    "src",
    "validation/v2/T07/runRetainedHeap.mjs",
    "validation/v2/T07/performanceElectron.cjs",
    "validation/v2/T07/mediaObservation.mjs",
    "package.json",
    "package-lock.json",
    "vite.config.mts"
  )
    .split(/\r?\n/u)
    .filter(Boolean)
    .sort();
  const hashes = await Promise.all(
    files.map(async (path) => ({
      path,
      sha256: sha256(await readFile(resolve(repositoryRoot, path)))
    }))
  );
  return Object.freeze({
    head: git("rev-parse", "HEAD"),
    treeHash: sha256(JSON.stringify(hashes)),
    files: hashes
  });
};

const errorRecord = (error) => ({
  name: error instanceof Error ? error.name : "Error",
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack ?? null : null
});

const inspectPage = (page) =>
  page.evaluate(() => {
    const titleOverlay = document.querySelector("#titleOverlay");
    const titleVisible =
      titleOverlay instanceof HTMLElement &&
      getComputedStyle(titleOverlay).display !== "none" &&
      getComputedStyle(titleOverlay).visibility !== "hidden";
    const diagnostics = window.__v2StaticReuseDiagnostics?.() ?? null;
    const progress = window.__v2PerformanceDiagnostics?.getProgress() ?? null;
    const reportText = document.body.dataset.v2PerformanceReport ?? null;
    const contextText = document.body.dataset.v2PerformanceContext ?? null;
    return {
      startup: document.body.dataset.v2StartupPhase ?? null,
      titleVisible,
      pointerLocked:
        document.pointerLockElement === document.querySelector("#renderCanvas"),
      diagnostics,
      progress,
      report: reportText === null ? null : JSON.parse(reportText),
      performanceContext:
        contextText === null ? null : JSON.parse(contextText)
    };
  });

const waitForInitialTitle = async (page) => {
  await page.waitForFunction(
    () => {
      const titleOverlay = document.querySelector("#titleOverlay");
      return (
        document.body.dataset.v2StartupPhase === "running" &&
        titleOverlay instanceof HTMLElement &&
        getComputedStyle(titleOverlay).display !== "none" &&
        !window.__v2StaticReuseDiagnostics?.().transitionInProgress
      );
    },
    null,
    { timeout: 180_000 }
  );
  const state = await inspectPage(page);
  if (state.diagnostics === null) {
    throw new Error("実アプリのstatic/dynamic owner診断hookがありません。");
  }
  return state;
};

const findCanvasPoint = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("#renderCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("#renderCanvasがありません。");
    }
    const rect = canvas.getBoundingClientRect();
    for (const yFraction of [0.5, 0.9, 0.1, 0.3, 0.7]) {
      for (const xFraction of [0.5, 0.1, 0.9, 0.3, 0.7]) {
        const x = Math.round(rect.left + rect.width * xFraction);
        const y = Math.round(rect.top + rect.height * yFraction);
        if (document.elementFromPoint(x, y) === canvas) {
          return { x, y };
        }
      }
    }
    throw new Error("Canvasを直接クリックできる座標がありません。");
  });

const startFromTitle = async (page) => {
  await page.bringToFront();
  const point = await findCanvasPoint(page);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(
    () => {
      const titleOverlay = document.querySelector("#titleOverlay");
      const progress = window.__v2PerformanceDiagnostics?.getProgress();
      return (
        titleOverlay instanceof HTMLElement &&
        getComputedStyle(titleOverlay).display === "none" &&
        progress !== undefined &&
        ["collecting", "draining", "complete"].includes(progress.status)
      );
    },
    null,
    { timeout: 30_000 }
  );
};

const waitForMeasurementCompletion = async (page, dynamicIdentity) => {
  await page.waitForFunction(
    (expectedIdentity) => {
      const diagnostics = window.__v2StaticReuseDiagnostics?.();
      const progress = window.__v2PerformanceDiagnostics?.getProgress();
      const reportText = document.body.dataset.v2PerformanceReport;
      const report = reportText === undefined ? null : JSON.parse(reportText);
      return (
        diagnostics?.dynamicIdentity === expectedIdentity &&
        diagnostics.transitionInProgress === false &&
        progress?.status === "complete" &&
        report?.status === "complete"
      );
    },
    dynamicIdentity,
    { timeout: 240_000 }
  );
};

const waitForNewSession = async (page, previousIdentity, expectedTitle) => {
  await page.waitForFunction(
    ({ oldIdentity, title }) => {
      const titleOverlay = document.querySelector("#titleOverlay");
      const diagnostics = window.__v2StaticReuseDiagnostics?.();
      if (!(titleOverlay instanceof HTMLElement) || diagnostics === undefined) {
        return false;
      }
      const titleVisible = getComputedStyle(titleOverlay).display !== "none";
      return (
        diagnostics.dynamicIdentity !== null &&
        diagnostics.dynamicIdentity !== oldIdentity &&
        diagnostics.transitionInProgress === false &&
        titleVisible === title
      );
    },
    { oldIdentity: previousIdentity, title: expectedTitle },
    { timeout: 180_000 }
  );
  return inspectPage(page);
};

const collectPostGcSample = async ({
  page,
  cdp,
  cycle,
  transitionIntoSession
}) => {
  await page.evaluate(
    () =>
      new Promise((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
      })
  );
  const gate = await inspectPage(page);
  if (
    gate.progress?.status !== "complete" ||
    gate.report?.status !== "complete" ||
    gate.diagnostics?.transitionInProgress !== false
  ) {
    throw new Error(
      `GC前に性能計測区間が完了していません: ${JSON.stringify({
        progress: gate.progress,
        reportStatus: gate.report?.status ?? null,
        transitionInProgress: gate.diagnostics?.transitionInProgress ?? null
      })}`
    );
  }
  const nowMilliseconds = await page.evaluate(() => performance.now());
  if (
    gate.report.measurementEndedAtMilliseconds === null ||
    nowMilliseconds < gate.report.measurementEndedAtMilliseconds
  ) {
    throw new Error(
      `GC時刻が性能計測終了より前です: ${JSON.stringify({
        nowMilliseconds,
        measurementEndedAtMilliseconds:
          gate.report.measurementEndedAtMilliseconds
      })}`
    );
  }

  await drainMediaObservation(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const heapUsage = await cdp.send("Runtime.getHeapUsage");
  const protocolDom = await cdp.send("Memory.getDOMCounters");
  const renderer = await page.evaluate(() => {
    let connectedNodeCount = 0;
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
    while (walker.nextNode()) {
      connectedNodeCount += 1;
    }
    return {
      dom: {
        connectedNodeCount,
        connectedElementCount: document.querySelectorAll("*").length,
        canvasCount: document.querySelectorAll("canvas").length,
        styleElementCount: document.querySelectorAll("style").length,
        styleSheetCount: document.styleSheets.length,
        scriptElementCount: document.scripts.length
      },
      performanceMemory:
        performance.memory === undefined
          ? null
          : {
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
              jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            },
      observedAtPerformanceMilliseconds: performance.now(),
      diagnostics: window.__v2StaticReuseDiagnostics(),
      progress: window.__v2PerformanceDiagnostics.getProgress(),
      report: JSON.parse(document.body.dataset.v2PerformanceReport),
      performanceContext: JSON.parse(
        document.body.dataset.v2PerformanceContext
      )
    };
  });

  return Object.freeze({
    cycle,
    transitionIntoSession,
    collectedAt: new Date().toISOString(),
    gc: {
      protocolMethod: "HeapProfiler.collectGarbage",
      invocationOrdinal: cycle,
      outsidePerformanceMeasurement: true,
      measurementLogTransferredBeforeGc: true,
      measurementStatusAtGate: gate.progress.status,
      measurementStartedAtMilliseconds:
        gate.report.measurementStartedAtMilliseconds,
      measurementEndedAtMilliseconds:
        gate.report.measurementEndedAtMilliseconds,
      gcGateObservedAtPerformanceMilliseconds: nowMilliseconds
    },
    heapUsage,
    protocolDom,
    renderer
  });
};

const countIdentity = (identities, identity) =>
  identities.filter((value) => value === identity).length;

const evaluateSessionChecks = (samples) => {
  const diagnostics = samples.map((sample) => sample.renderer.diagnostics);
  const reports = samples.map((sample) => sample.renderer.report);
  const expectedOwners = JSON.stringify([...EXPECTED_DYNAMIC_OWNERS].sort());
  const settingsSnapshots = diagnostics.map(
    (entry) => entry.sessionStartSnapshot
  );
  const dynamicIdentities = diagnostics.map(
    (entry) => entry.dynamicIdentity
  );
  const latest = diagnostics.at(-1);
  return Object.freeze({
    allMeasurementsCompleted: reports.every(
      (report) => report.profile === "normal" && report.status === "complete"
    ),
    normalPopulationKept: reports.every(
      (report) =>
        report.seed === 20260725 &&
        report.view === "courtyard" &&
        report.population.npcCount === 50 &&
        report.population.initialBrainwashedNpcCount === 10 &&
        report.population.initialBitCount === 1 &&
        report.renderWidth === 1920 &&
        report.renderHeight === 1080
    ),
    sameNormalSettingsSnapshot:
      settingsSnapshots[0] !== null &&
      new Set(settingsSnapshots).size === 1,
    fixedSessionSeedKept: diagnostics.every(
      (entry) => entry.sessionSeed === 20260725
    ),
    staticLoadedOnce: diagnostics.every(
      (entry) => entry.staticLoadCount === 1 && entry.glbParseCount === 1
    ),
    staticIdentityKept:
      new Set(diagnostics.map((entry) => entry.staticIdentity)).size === 1,
    dynamicIdentityChangedEachSession:
      dynamicIdentities.every((identity) => identity !== null) &&
      new Set(dynamicIdentities).size === samples.length,
    priorSessionsDisposedExactlyOnce: dynamicIdentities
      .slice(0, -1)
      .every(
        (identity) =>
          countIdentity(latest.disposedDynamicIdentities, identity) === 1 &&
          countIdentity(
            latest.dynamicDisposeInvocationIdentities,
            identity
          ) === 1
      ),
    activeOwnerLedgerExact: diagnostics.every(
      (entry) =>
        JSON.stringify([...entry.dynamicOwners.active].sort()) ===
          expectedOwners &&
        entry.dynamicOwners.disposedResiduals.every(
          (disposed) => disposed.residual.length === 0
        )
    ),
    spatialOwnersAndCameraExact: diagnostics.every(
      (entry) =>
        entry.humanNavigationWorldCount === 1 &&
        entry.staticDecodedHumanBundleOwnerCount === 1 &&
        entry.staticBitNavigationOwnerCount === 1 &&
        entry.scene.cameras === 1
    ),
    staticOnlyBaselineStable:
      latest.staticOnlyBaselineMismatchCount === 0 &&
      latest.staticOnlyBaselineMatchCount >= samples.length - 1
  });
};

const evaluateTerminationChecks = (termination, finalIdentity) => {
  const finalResiduals = termination.dynamicOwners.disposedResiduals.filter(
    (entry) => entry.generation === finalIdentity
  );
  return Object.freeze({
    runtimeTerminated: termination.runtimeTerminated === true,
    activeDynamicIdentityCleared: termination.dynamicIdentity === null,
    finalSessionDisposedExactlyOnce:
      countIdentity(termination.disposedDynamicIdentities, finalIdentity) === 1 &&
      countIdentity(
        termination.dynamicDisposeInvocationIdentities,
        finalIdentity
      ) === 1,
    allOwnersReleased:
      termination.humanNavigationWorldCount === 0 &&
      termination.staticDecodedHumanBundleOwnerCount === 0 &&
      termination.staticBitNavigationOwnerCount === 0 &&
      termination.dynamicOwners.active.length === 0,
    finalOwnerLedgerHasNoResidual:
      finalResiduals.length === 1 && finalResiduals[0].residual.length === 0
  });
};

const createHeapObservations = (samples, terminationSample) => {
  const usedSizes = samples.map((sample) => sample.heapUsage.usedSize);
  const adjacentDeltas = usedSizes.slice(1).map((value, index) => ({
    fromCycle: index + 1,
    toCycle: index + 2,
    bytes: value - usedSizes[index]
  }));
  return Object.freeze({
    activeSessionPostGcUsedSizes: usedSizes,
    adjacentDeltas,
    firstToLastDeltaBytes: usedSizes.at(-1) - usedSizes[0],
    minimumBytes: Math.min(...usedSizes),
    maximumBytes: Math.max(...usedSizes),
    terminatedPostGcUsedSize: terminationSample.heapUsage.usedSize,
    classification: "manual-baseline-comparison-required",
    leakConclusion: null,
    interpretation:
      "各値は同じrendererで個別に強制GCした観測値です。単純な初回・最終差分だけでは保持リーク0件またはリーク有無を判定しません。複数runの分布、owner残留、DOM傾向、同条件baselineと併せて評価してください。"
  });
};

const argumentsValue = parseArguments();
const {
  runtime,
  cycles,
  outputPath,
  playwrightModule,
  browserExecutable,
  url
} = argumentsValue;
const startedAt = new Date();
const issues = [];
const resourceErrors = [];
const processLog = [];
const inputLog = [];
const artifact = {
  schemaVersion: 1,
  purpose: "T07-retained-heap-observation",
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  elapsedMilliseconds: null,
  environment: {
    platform: platform(),
    release: release(),
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytesAtStart: freemem(),
    node: process.version,
    runtime,
    cycles,
    url: url.href,
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    browserExecutable,
    sessionIsolation:
      "1 run内は同一renderer、run間は独立contextまたはElectron partition"
  },
  sourceBefore: null,
  sourceAfter: null,
  sourceUnchanged: null,
  browserVersion: null,
  sessions: [],
  termination: null,
  heapObservations: null,
  mediaObservation: { assignments: [], replacements: [], events: [] },
  measurementBufferPolicy: "各GC前に媒体ログをNode側へ退避し、rendererの履歴配列を空にする。性能report履歴は最新1件だけ保持する。",
  classifiedResourceFailures: [],
  checks: null,
  diagnostics: { issues, resourceErrors, processLog },
  inputLog,
  outcome: null,
  failure: null,
  cleanupErrors: []
};

const drainMediaObservation = async (targetPage) => {
  const chunk = await targetPage.evaluate(() => {
    const observation = window.__t07MediaObservation;
    const result = {
      assignments: observation.assignments.slice(),
      replacements: observation.replacements.slice(),
      events: observation.events.slice()
    };
    observation.assignments.length = 0;
    observation.replacements.length = 0;
    observation.events.length = 0;
    return result;
  });
  for (const key of ["assignments", "replacements", "events"]) {
    artifact.mediaObservation[key].push(...chunk[key]);
  }
};

let browser = null;
let electron = null;
let cdp = null;
let page = null;
let stage = "入力検証";

try {
  const electronHelperPath = resolve(
    repositoryRoot,
    "validation/v2/T07/performanceElectron.cjs"
  );
  await Promise.all([
    access(playwrightModule),
    access(electronHelperPath),
    ...(browserExecutable === null ? [] : [access(browserExecutable)])
  ]);
  artifact.sourceBefore = await readSourceIdentity();

  stage = "Playwright読込";
  const playwright = await import(pathToFileURL(playwrightModule).href);
  if (
    runtime === "web" &&
    (!playwright.chromium || typeof playwright.chromium.launch !== "function")
  ) {
    throw new Error("指定moduleにPlaywright Chromiumがありません。");
  }
  if (
    runtime === "electron" &&
    (!playwright._electron || typeof playwright._electron.launch !== "function")
  ) {
    throw new Error("指定moduleにPlaywright Electronがありません。");
  }

  stage = `${runtime}起動`;
  if (runtime === "web") {
    browser = await playwright.chromium.launch({
      executablePath: browserExecutable,
      headless: false,
      args: ["--window-size=1920,1080", "--force-device-scale-factor=1"]
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1
    });
    page = await context.newPage();
    artifact.browserVersion = await browser.version();
  } else {
    electron = await playwright._electron.launch({
      executablePath: require("electron"),
      args: [electronHelperPath, "--force-device-scale-factor=1"],
      env: { ...process.env, T07_PERFORMANCE_URL: url.href },
      timeout: 120_000
    });
    electron.process().stdout?.on("data", (data) => {
      processLog.push({
        at: new Date().toISOString(),
        stream: "stdout",
        text: data.toString()
      });
    });
    electron.process().stderr?.on("data", (data) => {
      processLog.push({
        at: new Date().toISOString(),
        stream: "stderr",
        text: data.toString()
      });
    });
    page = await electron.firstWindow({ timeout: 120_000 });
    artifact.browserVersion = await page.evaluate(() => navigator.userAgent);
  }

  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      issues.push({
        at: new Date().toISOString(),
        stage,
        type: message.type(),
        text: message.text(),
        location: message.location()
      });
    }
  });
  page.on("pageerror", (error) => {
    issues.push({
      at: new Date().toISOString(),
      stage,
      type: "pageerror",
      ...errorRecord(error)
    });
  });
  page.on("crash", () => {
    issues.push({
      at: new Date().toISOString(),
      stage,
      type: "renderer-crash"
    });
  });
  page.on("requestfailed", (request) => {
    resourceErrors.push({
      stage,
      at: Date.now(),
      url: request.url(),
      method: request.method(),
      requestStartedAt: request.timing().startTime,
      resourceType: request.resourceType(),
      failure: request.failure()
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      resourceErrors.push({
        stage,
        at: Date.now(),
        url: response.url(),
        status: response.status()
      });
    }
  });

  await page.addInitScript(() => {
    window.__t07RetainedHeapReports = [];
    window.addEventListener("v2-performance-report", (event) => {
      window.__t07RetainedHeapReports.length = 0;
      window.__t07RetainedHeapReports.push({
        atPerformanceMilliseconds: performance.now(),
        dynamicIdentity:
          window.__v2StaticReuseDiagnostics?.().dynamicIdentity ?? null,
        detail: event.detail
      });
    });
  });
  await page.addInitScript(installMediaObservation);

  stage = "通常profile読込";
  const navigationResponse = await page.goto(url.href, {
    waitUntil: "domcontentloaded",
    timeout: 120_000
  });
  if (!navigationResponse || navigationResponse.status() !== 200) {
    throw new Error(
      `通常ゲームdocumentのHTTP statusが${
        navigationResponse?.status() ?? "取得不能"
      }です。`
    );
  }
  await waitForInitialTitle(page);
  cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");

  stage = "session-1開始";
  await startFromTitle(page);
  let currentState = await inspectPage(page);
  let currentIdentity = currentState.diagnostics.dynamicIdentity;
  if (currentIdentity === null) {
    throw new Error("session-1のdynamic identityがありません。");
  }

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    stage = `session-${cycle}性能計測`;
    await waitForMeasurementCompletion(page, currentIdentity);
    stage = `session-${cycle}計測区間外GC`;
    const transitionIntoSession =
      cycle === 1 ? "initial-canvas" : inputLog.at(-1).action;
    const sample = await collectPostGcSample({
      page,
      cdp,
      cycle,
      transitionIntoSession
    });
    artifact.sessions.push(sample);
    process.stdout.write(
      `session-${cycle}: post-GC usedSize=${sample.heapUsage.usedSize} ` +
        `nodes=${sample.protocolDom.nodes} listeners=${sample.protocolDom.jsEventListeners}\n`
    );

    if (cycle === cycles) {
      break;
    }
    const key = cycle % 2 === 1 ? "KeyR" : "Enter";
    const action = key === "KeyR" ? "normal-R" : "normal-Enter-title-canvas";
    stage = `session-${cycle}から${action}`;
    await page.bringToFront();
    await page.keyboard.press(key);
    inputLog.push({
      at: new Date().toISOString(),
      afterCycle: cycle,
      key,
      action
    });
    currentState = await waitForNewSession(
      page,
      currentIdentity,
      key === "Enter"
    );
    currentIdentity = currentState.diagnostics.dynamicIdentity;
    if (key === "Enter") {
      await startFromTitle(page);
    }
  }

  stage = "session所有検証";
  const sessionChecks = evaluateSessionChecks(artifact.sessions);
  const finalIdentity = artifact.sessions.at(-1).renderer.diagnostics.dynamicIdentity;

  stage = "beforeunload終了";
  const terminationDiagnostics = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("beforeunload"));
    return window.__v2StaticReuseDiagnostics();
  });
  await page.waitForTimeout(250);
  const terminationGate = await page.evaluate(() => ({
    latestReport:
      window.__t07RetainedHeapReports.at(-1)?.detail?.report ?? null,
    diagnostics: window.__v2StaticReuseDiagnostics()
  }));
  if (
    terminationGate.latestReport?.status !== "complete" ||
    terminationGate.diagnostics.runtimeTerminated !== true
  ) {
    throw new Error(
      `終了後GCの前提が成立しません: ${JSON.stringify(terminationGate)}`
    );
  }

  stage = "終了後計測区間外GC";
  await drainMediaObservation(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const terminationHeapUsage = await cdp.send("Runtime.getHeapUsage");
  const terminationProtocolDom = await cdp.send("Memory.getDOMCounters");
  const terminationRenderer = await page.evaluate(() => {
    let connectedNodeCount = 0;
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
    while (walker.nextNode()) {
      connectedNodeCount += 1;
    }
    return {
      dom: {
        connectedNodeCount,
        connectedElementCount: document.querySelectorAll("*").length,
        canvasCount: document.querySelectorAll("canvas").length,
        styleElementCount: document.querySelectorAll("style").length,
        styleSheetCount: document.styleSheets.length,
        scriptElementCount: document.scripts.length
      },
      diagnostics: window.__v2StaticReuseDiagnostics()
    };
  });
  const terminationSample = {
    collectedAt: new Date().toISOString(),
    gc: {
      protocolMethod: "HeapProfiler.collectGarbage",
      invocationOrdinal: cycles + 1,
      outsidePerformanceMeasurement: true,
      measurementStatusAtGate: "complete-before-termination"
    },
    heapUsage: terminationHeapUsage,
    protocolDom: terminationProtocolDom,
    rendererDom: terminationRenderer.dom,
    diagnosticsBeforeGc: terminationDiagnostics,
    diagnostics: terminationRenderer.diagnostics
  };
  const terminationChecks = evaluateTerminationChecks(
    terminationRenderer.diagnostics,
    finalIdentity
  );
  await drainMediaObservation(page);
  artifact.classifiedResourceFailures = classifyMediaRequestFailures(
    resourceErrors,
    artifact.mediaObservation
  );
  const diagnosticChecks = {
    consoleAndPageErrorsClear: issues.length === 0,
    resourceFailuresResolved: artifact.classifiedResourceFailures.every(
      (failure) =>
        [
          "observed-media-source-replacement",
          "observed-complete-media-buffer"
        ].includes(failure.classification)
    ),
    mediaElementErrorsClear: !artifact.mediaObservation.events.some(
      (event) => event.type === "error"
    )
  };
  artifact.termination = terminationSample;
  artifact.heapObservations = createHeapObservations(
    artifact.sessions,
    terminationSample
  );
  artifact.checks = {
    sessions: sessionChecks,
    termination: terminationChecks,
    diagnostics: diagnosticChecks
  };

  artifact.sourceAfter = await readSourceIdentity();
  artifact.sourceUnchanged =
    artifact.sourceBefore.treeHash === artifact.sourceAfter.treeHash;
  const structuralChecks = [
    ...Object.values(sessionChecks),
    ...Object.values(terminationChecks),
    ...Object.values(diagnosticChecks),
    artifact.sourceUnchanged
  ];
  artifact.outcome = {
    status: structuralChecks.every(Boolean) ? "collected" : "failed",
    retainedHeapAssessment: "manual-baseline-comparison-required",
    numericalPerformanceAcceptance: artifact.sessions.map((sample) => ({
      cycle: sample.cycle,
      status: sample.renderer.report.acceptance.status,
      passed: sample.renderer.report.acceptance.passed
    })),
    note:
      "本runnerは既存の型・性能・機能受入を置換しません。heap差分単独では保持リーク0件と判定しません。"
  };
} catch (error) {
  artifact.failure = { stage, ...errorRecord(error) };
  artifact.outcome = {
    status: "runner-error",
    retainedHeapAssessment: "not-evaluated"
  };
} finally {
  if (cdp) {
    try {
      await cdp.detach();
    } catch (error) {
      artifact.cleanupErrors.push({ target: "cdp", ...errorRecord(error) });
    }
  }
  if (electron) {
    try {
      await electron.close();
    } catch (error) {
      artifact.cleanupErrors.push({ target: "electron", ...errorRecord(error) });
    }
  }
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      artifact.cleanupErrors.push({ target: "chromium", ...errorRecord(error) });
    }
  }
  const finishedAt = new Date();
  artifact.finishedAt = finishedAt.toISOString();
  artifact.elapsedMilliseconds = finishedAt.getTime() - startedAt.getTime();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

if (
  artifact.outcome.status !== "collected" ||
  artifact.cleanupErrors.length > 0
) {
  process.exitCode = 1;
}

process.stdout.write(
  `${runtime}: ${artifact.outcome.status} / ${artifact.sessions.length}/${cycles} sessions / ${outputPath}\n`
);
