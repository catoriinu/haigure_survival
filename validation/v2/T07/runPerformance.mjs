import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { installMediaObservation, classifyMediaRequestFailures } from "./mediaObservation.mjs";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readArgument = (name) => {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (!argument) throw new Error(`${prefix}で値を指定してください。`);
  return argument.slice(prefix.length);
};
const runtime = readArgument("runtime");
const browserExecutable = runtime === "web" ? readArgument("browser-executable") : null;
const profile = readArgument("profile");
const label = readArgument("label");
const runCount = Number(readArgument("runs"));
const stressInputSource = profile === "stress" ? readArgument("stress-inputs") : null;
const stressReplayInputs = stressInputSource !== null && stressInputSource !== "record"
  ? JSON.parse(await readFile(resolve(stressInputSource), "utf8")) : null;
const outputDirectory = resolve(readArgument("output"));
const playwrightModule = readArgument("playwright-module");
const url = new URL(readArgument("url"));
if (!["web", "electron"].includes(runtime)) throw new Error("runtimeはwebまたはelectronです。");
if (!["normal", "stress", "fixed-4200"].includes(profile)) throw new Error("profileが不正です。");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("計測対象はローカルURLに限ります。");
if (!Number.isSafeInteger(runCount) || runCount < 1) throw new Error("runsは1以上の整数です。");
if (stressInputSource === "record" && runCount !== 1) throw new Error("入力記録は1回ずつ実施し、比較計測では保存入力を再生してください。");
if (stressReplayInputs !== null && !Array.isArray(stressReplayInputs)) throw new Error("stress入力ファイルは記録済み入力の配列です。");
url.searchParams.set("performance", profile === "fixed-4200" ? "acceptance" : profile);
url.searchParams.set("seed", "20260725");
url.searchParams.set("view", "courtyard");
const { chromium, _electron } = await import(pathToFileURL(resolve(playwrightModule)).href);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const sourceIdentity = async () => {
  const files = git("ls-files", "-c", "-o", "--exclude-standard", "src", "index.html", "validation/v2/T07/runPerformance.mjs", "validation/v2/T07/performanceElectron.cjs", "validation/v2/T07/mediaObservation.mjs", "package.json", "package-lock.json", "vite.config.mts")
    .split("\n").filter(Boolean).sort();
  const hashes = await Promise.all(files.map(async (path) => [path, sha256(await readFile(resolve(root, path)))]));
  return { head: git("rev-parse", "HEAD"), treeHash: sha256(JSON.stringify(hashes)), files: hashes };
};
const source = await sourceIdentity();
const instrumentHash = sha256(await readFile(resolve(root, "src/v2/performanceDiagnostics.ts")));
const materialFiles = [];
const hashMaterials = async (relativeDirectory) => {
  const entries = await readdir(resolve(root, relativeDirectory), { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      await hashMaterials(path);
    } else if (entry.isFile()) {
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of createReadStream(resolve(root, path))) { hash.update(chunk); bytes += chunk.length; }
      materialFiles.push({ path, bytes, sha256: hash.digest("hex") });
    }
  }
};
await hashMaterials("public/audio");
await hashMaterials("public/picture/chara");
const materialManifest = { sha256: sha256(JSON.stringify(materialFiles)), files: materialFiles };
const environment = {
  platform: platform(), release: release(), cpu: cpus()[0].model,
  logicalCpus: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytesAtStart: freemem(),
  node: process.version, runtime, profile, url: url.href, instrumentHash, browserExecutable,
  materialFingerprint: materialManifest.sha256,
  powerSchemeGuid: platform() === "win32" ? execFileSync("powercfg", ["/getactivescheme"], { encoding: "utf8" }).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)[0] : null,
  stressInputMode: profile !== "stress" ? null : stressReplayInputs === null ? "record" : "replay",
  stressInputRequestHash: stressReplayInputs === null ? null : sha256(JSON.stringify(stressReplayInputs.map((input) => input.request))),
  gc: "計測中の強制GCなし", cache: "各回の独立context/partition、Vite server cacheは維持"
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, `${label}-${runtime}-${profile}-materials.json`), JSON.stringify(materialManifest, null, 2), "utf8");
await writeFile(resolve(outputDirectory, `${label}-${runtime}-${profile}-source.json`), JSON.stringify(source, null, 2), "utf8");

const summaries = [];
for (let run = 1; run <= runCount; run += 1) {
  const stem = `${label}-${runtime}-${profile}-${run}`;
  let browser = null;
  let electron = null;
  let page = null;
  const issues = [];
  const resourceErrors = [];
  const inputLog = [];
  let result = null;
  let stage = "launch";
  const processLog = [];
  const runStarted = Date.now();
  try {
    if (runtime === "web") {
      browser = await chromium.launch({ executablePath: browserExecutable, headless: false, args: ["--window-size=1920,1080", "--force-device-scale-factor=1"] });
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      page = await context.newPage();
    } else {
      electron = await _electron.launch({
        executablePath: require("electron"),
        args: [resolve(root, "validation/v2/T07/performanceElectron.cjs"), "--force-device-scale-factor=1"],
        env: { ...process.env, T07_PERFORMANCE_URL: url.href },
        timeout: 120000
      });
      electron.process().stdout?.on("data", (data) => processLog.push({ at: Date.now(), stream: "stdout", text: data.toString() }));
      electron.process().stderr?.on("data", (data) => processLog.push({ at: Date.now(), stream: "stderr", text: data.toString() }));
      page = await electron.firstWindow({ timeout: 120000 });
    }
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) issues.push({ stage, type: message.type(), text: message.text(), at: Date.now() });
    });
    page.on("pageerror", (error) => issues.push({ stage, type: "pageerror", text: error.stack, at: Date.now() }));
    page.on("crash", () => issues.push({ stage, type: "renderer-crash", at: Date.now() }));
    page.on("requestfailed", (request) => resourceErrors.push({ stage, at: Date.now(), url: request.url(),
      method: request.method(), requestStartedAt: request.timing().startTime,
      resourceType: request.resourceType(), failure: request.failure() }));
    page.on("response", (response) => {
      if (response.status() >= 400) resourceErrors.push({ stage, at: Date.now(), url: response.url(), status: response.status() });
    });
    await page.addInitScript(() => {
      window.__t07LastPerformanceSnapshot = null;
      window.addEventListener("v2-performance-report", (event) => { window.__t07LastPerformanceSnapshot = event.detail; });
      window.__t07PointerLockEvents = [];
      window.__t07VisibilityEvents = [];
      const recordVisibility = (event) => window.__t07VisibilityEvents.push({
        at: performance.now(), type: event.type, focused: document.hasFocus(), visibility: document.visibilityState
      });
      window.addEventListener("focus", recordVisibility);
      window.addEventListener("blur", recordVisibility);
      document.addEventListener("visibilitychange", recordVisibility);
      document.addEventListener("pointerlockchange", () => {
        window.__t07PointerLockEvents.push({ at: performance.now(), locked: document.pointerLockElement?.id === "renderCanvas" });
      });
    });
    await page.addInitScript((inputs) => { window.__v2PerformanceStressReplayInputs = inputs; }, stressReplayInputs);
    await page.addInitScript(installMediaObservation);
    stage = "startup";
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => document.body.dataset.v2StartupPhase === "running", null, { timeout: 180000 });
    const context = await page.evaluate(() => {
      const canvas = document.querySelector("#renderCanvas");
      const gl = canvas.getContext("webgl2");
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        measurement: JSON.parse(document.body.dataset.v2PerformanceContext),
        startup: window.__v2StartupDiagnostics,
        reuse: window.__v2StaticReuseDiagnostics(),
        display: { innerWidth, innerHeight, dpr: devicePixelRatio, canvasWidth: canvas.width, canvasHeight: canvas.height },
        graphics: { vendor: info === null ? null : gl.getParameter(info.UNMASKED_VENDOR_WEBGL), renderer: info === null ? null : gl.getParameter(info.UNMASKED_RENDERER_WEBGL) },
        userAgent: navigator.userAgent
      };
    });
    await writeFile(resolve(outputDirectory, `${stem}-context.json`), JSON.stringify(context, null, 2), "utf8");
    result = { environment, source: { head: source.head, treeHash: source.treeHash }, context, inputLog };
    await page.bringToFront();
    stage = "measurement";
    const point = await page.evaluate(() => {
      const canvas = document.querySelector("#renderCanvas");
      const rect = canvas.getBoundingClientRect();
      for (const yFraction of [0.5, 0.9, 0.1, 0.3, 0.7]) {
        for (const xFraction of [0.5, 0.1, 0.9, 0.3, 0.7]) {
          const x = Math.round(rect.left + rect.width * xFraction);
          const y = Math.round(rect.top + rect.height * yFraction);
          if (document.elementFromPoint(x, y) === canvas) return { x, y };
        }
      }
      throw new Error("Canvasを直接クリックできる座標がありません。");
    });
    await page.mouse.click(point.x, point.y);
    inputLog.push({ action: "Canvas開始クリック", at: Date.now() - runStarted });
    await page.waitForFunction(() => document.pointerLockElement?.id === "renderCanvas", null, { timeout: 10000 });
    const deadline = Date.now() + (profile === "fixed-4200" ? 480000 : 180000);
    let lastProgressAt = Date.now();
    let latest = null;
    while (Date.now() < deadline) {
      latest = await page.evaluate(() => ({
        progress: window.__v2PerformanceDiagnostics?.getProgress() ?? null,
        report: window.__t07LastPerformanceSnapshot?.report ?? null,
        workload: window.__t07LastPerformanceSnapshot?.workload ?? null
      }));
      if (latest.report && ["complete", "aborted"].includes(latest.report.status)) break;
      if (Date.now() - lastProgressAt >= 15000) {
        lastProgressAt = Date.now();
        process.stdout.write(`${stem}: ${JSON.stringify(latest.progress)}\n`);
      }
      await page.waitForTimeout(500);
    }
    if (!latest?.report) throw new Error(`計測が完了しませんでした: ${JSON.stringify(latest)}`);
    result = { ...result, ...latest };
    if (result.workload !== null) {
      result.stressInputRequestHash = sha256(JSON.stringify(result.workload.inputs.map((input) => input.request)));
      await writeFile(resolve(outputDirectory, `${stem}-inputs.json`), JSON.stringify(result.workload.inputs, null, 2), "utf8");
    }
    await writeFile(resolve(outputDirectory, `${stem}-collected.json`), JSON.stringify(result, null, 2), "utf8");
    stage = "post-measurement";
    await page.screenshot({ path: resolve(outputDirectory, `${stem}.png`) });
    const finalState = await page.evaluate(() => ({
      reuse: window.__v2StaticReuseDiagnostics(),
      features: document.body.dataset.v2FeatureResources ? JSON.parse(document.body.dataset.v2FeatureResources) : null,
      status: document.querySelector("#statusInfo").textContent,
      pointerLocked: document.pointerLockElement?.id === "renderCanvas",
      pointerLockEvents: window.__t07PointerLockEvents,
      visibilityEvents: window.__t07VisibilityEvents
    }));
    result.finalState = finalState;
    const cdp = await page.context().newCDPSession(page);
    if (result.report.status === "complete") {
      stage = "retained-heap";
      const observedAt = await page.evaluate(() => performance.now());
      if (observedAt < result.report.measurementEndedAtMilliseconds) throw new Error("計測区間内にGCを要求できません。");
      await cdp.send("HeapProfiler.collectGarbage");
      result.retainedHeap = { observedAt, outsideMeasurement: true,
        heap: await cdp.send("Runtime.getHeapUsage"), dom: await cdp.send("Memory.getDOMCounters") };
    }
    stage = "shutdown";
    result.termination = await page.evaluate(() => {
      window.dispatchEvent(new Event("beforeunload"));
      return window.__v2StaticReuseDiagnostics();
    });
    await page.waitForTimeout(250);
    await cdp.send("HeapProfiler.collectGarbage");
    result.terminatedHeap = { heap: await cdp.send("Runtime.getHeapUsage"),
      dom: await cdp.send("Memory.getDOMCounters") };
    await cdp.detach();
    result.mediaObservation = await page.evaluate(() => window.__t07MediaObservation);
  } catch (error) {
    result = { ...result, environment, source: { head: source.head, treeHash: source.treeHash }, failure: { stage, message: error.stack }, inputLog };
    if (page && !page.isClosed()) await page.screenshot({ path: resolve(outputDirectory, `${stem}-failed.png`) }).catch(() => {});
  } finally {
    if (electron) await electron.close();
    if (browser) await browser.close();
  }
  result.issues = issues;
  result.resourceErrors = resourceErrors;
  result.classifiedResourceFailures = classifyMediaRequestFailures(resourceErrors,
    result.mediaObservation ?? { assignments: [], replacements: [], events: [] });
  result.processLog = processLog;
  result.elapsedMilliseconds = Date.now() - runStarted;
  result.instrumentationUnchanged = (await sourceIdentity()).treeHash === source.treeHash;
  const windows = result.report?.stress ? [result.report.stress] : result.report ? [result.report.cold, result.report.steady] : [];
  const owner = result.termination;
  const checks = {
    collectionCompleted: result.report?.status === "complete",
    measurementConfiguration: result.report?.acceptance.sampleWindowsComplete === true &&
      result.report.acceptance.renderSizeIs1920x1080 && result.report.acceptance.populationMatchesProfile &&
      result.report.acceptance.populationStayedAtExpectedCounts && result.report.acceptance.initialBrainwashedNpcCountWasExpected,
    instrumentationUnchanged: result.instrumentationUnchanged,
    runtimeDiagnosticsClear: issues.length === 0 && result.classifiedResourceFailures.every((failure) =>
      ["observed-media-source-replacement", "observed-complete-media-buffer"].includes(failure.classification)) &&
      !result.mediaObservation?.events.some((entry) => entry.type === "error"),
    localMaterialsPresent: Boolean(result.context?.measurement.bgmCount > 0 &&
      result.context.measurement.voiceDirectoryCount > 0 && result.context.measurement.portraitFileCount > 0 &&
      result.context.measurement.defaultPortraitActorCount === 0 &&
      materialFiles.some((file) => file.path.startsWith("public/audio/se/") && file.path.endsWith(".mp3"))),
    audioActive: profile === "fixed-4200" ? null : windows.length > 0 && windows.every((window) => {
      const sample = window.counters["scenario.audio-active"];
      return sample && sample.sampleCount > 0 && sample.minimum === 1;
    }),
    pointerLockKept: result.finalState?.pointerLocked === true && result.finalState.pointerLockEvents.every((event) =>
      event.locked || event.at < result.report.measurementStartedAtMilliseconds || event.at >= result.report.measurementEndedAtMilliseconds),
    finalOwnersReleased: Boolean(owner?.runtimeTerminated && owner.dynamicIdentity === null &&
      owner.humanNavigationWorldCount === 0 && owner.staticDecodedHumanBundleOwnerCount === 0 &&
      owner.staticBitNavigationOwnerCount === 0 && owner.dynamicOwners.active.length === 0 &&
      owner.dynamicOwners.disposedResiduals.every((entry) => entry.residual.length === 0)),
    numericalPerformance: profile === "normal" ? result.report?.acceptance.passed === true : null,
    stressWorkload: profile === "stress" ? result.workload?.status === "completed" : null
  };
  checks.stressInputRequestsMatch = profile !== "stress" || stressReplayInputs === null ? null :
    result.stressInputRequestHash === environment.stressInputRequestHash;
  result.checks = checks;
  result.localAcceptance = result.failure || Object.values(checks).some((value) => value === false)
    ? "failed"
    : profile === "normal" ? "passed" : "comparison-and-retained-heap-required";
  await writeFile(resolve(outputDirectory, `${stem}.json`), JSON.stringify(result, null, 2), "utf8");
  const summary = { run, status: result.report?.status ?? "failed", acceptance: result.report?.acceptance ?? null,
    checks, localAcceptance: result.localAcceptance,
    issues: issues.length, resourceErrors: resourceErrors.length, unchanged: result.instrumentationUnchanged, failure: result.failure ?? null };
  summaries.push(summary);
  process.stdout.write(`${stem}: ${JSON.stringify(summary)}\n`);
  if (result.failure || !result.instrumentationUnchanged) break;
}
await writeFile(resolve(outputDirectory, `${label}-${runtime}-${profile}-summary.json`), JSON.stringify({ environment, summaries }, null, 2), "utf8");
if (summaries.length !== runCount || summaries.some((entry) => entry.localAcceptance === "failed" || entry.failure)) process.exitCode = 1;
