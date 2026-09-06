import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { get } from "node:http";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const windowResult = (globalName, extraFields = []) =>
  Object.freeze({
    kind: "window",
    statusDataset: "validationStatus",
    globalName,
    checksField: "checks",
    extraFields: Object.freeze(extraFields)
  });

const domResult = Object.freeze({
  kind: "dom",
  statusDataset: "validationStatus",
  checksSelector: "#check-results > li",
  checkOkDataset: "ok",
  checkNameSelector: "strong",
  checkDetailSelector: "span",
  acceptedCheckValues: Object.freeze(["true", "false"])
});

const suites = Object.freeze({
  t04: Object.freeze({
    configPath: "vite.t04.config.mts",
    entryPath: "validation/v2/T04/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 360_000,
    result: domResult
  }),
  "t04-school": Object.freeze({
    configPath: "vite.t04.config.mts",
    entryPath: "validation/v2/T04/school-integration.html",
    urlPath: "/school-integration.html",
    timeoutMilliseconds: 300_000,
    result: domResult
  }),
  b05: Object.freeze({
    configPath: "vite.b05.config.mts",
    entryPath: "validation/v2/B05/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 300_000,
    result: windowResult("__B05_VALIDATION__", ["inventory", "activeFloor"])
  }),
  t05: Object.freeze({
    configPath: "vite.t05.config.mts",
    entryPath: "validation/v2/T05/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 360_000,
    result: windowResult("__T05_VALIDATION__"),
    knownRecord:
      "非学校fixtureの既存記録上の残1件は除外せず、正式statusと失敗checkをそのまま保存する。"
  }),
  "t05-npc-command": Object.freeze({
    configPath: "vite.t05.config.mts",
    entryPath: "validation/v2/T05/npc-command.html",
    urlPath: "/npc-command.html",
    timeoutMilliseconds: 240_000,
    result: windowResult("__T05_3_VALIDATION__")
  }),
  t06: Object.freeze({
    configPath: "vite.t06.config.mts",
    entryPath: "validation/v2/T06/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 240_000,
    result: windowResult("__T06_VALIDATION__")
  }),
  "t06-2": Object.freeze({
    configPath: "vite.t06-2.config.mts",
    entryPath: "validation/v2/T06-2/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 240_000,
    result: windowResult("__T06_2_VALIDATION__")
  }),
  "t06-3": Object.freeze({
    configPath: "vite.t06-3.config.mts",
    entryPath: "validation/v2/T06-3/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 300_000,
    result: windowResult("__T06_3_VALIDATION__", ["activeFloor"])
  }),
  "t06-4": Object.freeze({
    configPath: "vite.t06-4.config.mts",
    entryPath: "validation/v2/T06-4/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 240_000,
    result: windowResult("__T06_4_VALIDATION__")
  }),
  "t06-6a": Object.freeze({
    configPath: "vite.t06-6a.config.mts",
    entryPath: "validation/v2/T06-6A/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 180_000,
    result: windowResult("__T06_6A_VALIDATION__")
  }),
  "t06-6b": Object.freeze({
    configPath: "vite.t06-6b.config.mts",
    entryPath: "validation/v2/T06-6B/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 180_000,
    result: windowResult("__T06_6B_VALIDATION__")
  }),
  "t06-6c": Object.freeze({
    configPath: "vite.t06-6c.config.mts",
    entryPath: "validation/v2/T06-6C/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 180_000,
    result: windowResult("__T06_6C_VALIDATION__")
  }),
  "t06-6d": Object.freeze({
    configPath: "vite.t06-6d.config.mts",
    entryPath: "validation/v2/T06-6D/index.html",
    urlPath: "/index.html",
    timeoutMilliseconds: 240_000,
    result: windowResult("__T06_6D_VALIDATION__")
  })
});

const parseArguments = () => {
  const allowedNames = new Set([
    "suite",
    "output",
    "playwright-module",
    "browser-executable",
    "port"
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
  for (const name of allowedNames) {
    if (!values.has(name)) {
      throw new Error(`--${name}=で値を指定してください。`);
    }
  }

  const suiteName = values.get("suite").toLowerCase();
  const suite = suites[suiteName];
  if (!suite) {
    throw new Error(
      `suiteが不正です: ${values.get("suite")} / ` +
        `選択肢=${Object.keys(suites).join(",")}`
    );
  }

  const outputValue = values.get("output");
  const outputPath = isAbsolute(outputValue)
    ? outputValue
    : resolve(repositoryRoot, outputValue);
  if (extname(outputPath).toLowerCase() !== ".json") {
    throw new Error("outputにはJSONファイルを指定してください。");
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

  const port = Number(values.get("port"));
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("portは1024～65535の整数で指定してください。");
  }
  if (port === 5_175) {
    throw new Error("通常ゲームの5175はfixture runnerに使用できません。");
  }

  return Object.freeze({
    suiteName,
    suite,
    outputPath,
    playwrightModule,
    browserExecutable,
    port
  });
};

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const requestStatus = (url) =>
  new Promise((resolveRequest, rejectRequest) => {
    const request = get(url, (response) => {
      const statusCode = response.statusCode ?? 0;
      response.resume();
      resolveRequest(statusCode);
    });
    request.setTimeout(2_000, () => {
      request.destroy(new Error("Vite応答待機が2秒を超えました。"));
    });
    request.on("error", rejectRequest);
  });

const startVite = (suite, port, logs) => {
  const viteCliPath = resolve(repositoryRoot, "node_modules/vite/bin/vite.js");
  const child = spawn(
    process.execPath,
    [
      viteCliPath,
      "--config",
      resolve(repositoryRoot, suite.configPath),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort"
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (text) => {
    logs.push({ at: new Date().toISOString(), stream: "stdout", text });
  });
  child.stderr.on("data", (text) => {
    logs.push({ at: new Date().toISOString(), stream: "stderr", text });
  });
  return child;
};

const observeChild = (child) => {
  const state = {
    exit: null,
    spawnError: null
  };
  const exited = new Promise((resolveExit) => {
    child.once("error", (error) => {
      state.spawnError = {
        name: error.name,
        message: error.message,
        stack: error.stack ?? null
      };
      resolveExit(state);
    });
    child.once("exit", (code, signal) => {
      state.exit = { code, signal };
      resolveExit(state);
    });
  });
  return { state, exited };
};

const waitForVite = async (url, childState) => {
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (childState.spawnError) {
      throw new Error(
        `Viteを起動できませんでした: ${childState.spawnError.message}`
      );
    }
    if (childState.exit) {
      throw new Error(
        `Viteが応答前に終了しました: ${JSON.stringify(childState.exit)}`
      );
    }
    try {
      const statusCode = await requestStatus(url);
      if (statusCode === 200) {
        return;
      }
      throw new Error(`fixture入口のHTTP statusが${statusCode}です。`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(
    `Viteが60秒以内に応答しませんでした: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
};

const stopChild = async (child, observation) => {
  if (observation.state.exit || observation.state.spawnError) {
    await observation.exited;
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([observation.exited, delay(5_000)]);
  if (!observation.state.exit && !observation.state.spawnError) {
    child.kill("SIGKILL");
    await observation.exited;
  }
};

const readFixtureResult = async (page, resultContract) =>
  page.evaluate((contract) => {
    const summary = document.querySelector("#summary")?.textContent?.trim() ?? null;
    const metrics = [...document.querySelectorAll("#metrics dt")].map((term) => ({
      name: term.textContent?.trim() ?? "",
      value: term.nextElementSibling?.matches("dd")
        ? term.nextElementSibling.textContent?.trim() ?? ""
        : null
    }));
    const datasetStatus =
      document.documentElement.dataset[contract.statusDataset] ?? null;

    if (contract.kind === "window") {
      const state = window[contract.globalName] ?? null;
      return {
        datasetStatus,
        summary,
        metrics,
        state,
        checks: Array.isArray(state?.[contract.checksField])
          ? state[contract.checksField]
          : null,
        extras: Object.fromEntries(
          contract.extraFields.map((field) => [field, state?.[field] ?? null])
        )
      };
    }

    const checks = [...document.querySelectorAll(contract.checksSelector)].map(
      (item) => ({
        okValue: item.dataset[contract.checkOkDataset] ?? null,
        name:
          item.querySelector(contract.checkNameSelector)?.textContent?.trim() ??
          "",
        detail:
          item.querySelector(contract.checkDetailSelector)?.textContent?.trim() ??
          "",
        text: item.textContent?.trim() ?? ""
      })
    );
    return {
      datasetStatus,
      summary,
      metrics,
      state: null,
      checks,
      extras: {}
    };
  }, resultContract);

const validateFixtureResult = (raw, resultContract) => {
  if (!['passed', 'failed'].includes(raw.datasetStatus)) {
    throw new Error(
      `正式statusがpassed/failedではありません: ${String(raw.datasetStatus)}`
    );
  }
  if (!Array.isArray(raw.checks)) {
    throw new Error("正式なchecks配列を取得できませんでした。");
  }

  if (resultContract.kind === "window") {
    if (!raw.state || typeof raw.state !== "object") {
      throw new Error(`window.${resultContract.globalName}がありません。`);
    }
    if (raw.state.status !== raw.datasetStatus) {
      throw new Error(
        `datasetとwindow状態が一致しません: ` +
          `${raw.datasetStatus}/${String(raw.state.status)}`
      );
    }
  }

  const checks = raw.checks.map((check, index) => {
    if (!check || typeof check !== "object") {
      throw new Error(`check[${index}]がObjectではありません。`);
    }
    if (resultContract.kind === "window") {
      if (
        typeof check.ok !== "boolean" ||
        typeof check.name !== "string" ||
        typeof check.detail !== "string"
      ) {
        throw new Error(`check[${index}]のname/ok/detail契約が不正です。`);
      }
      return {
        name: check.name,
        ok: check.ok,
        detail: check.detail
      };
    }

    if (!resultContract.acceptedCheckValues.includes(check.okValue)) {
      throw new Error(
        `check[${index}]のdata-${resultContract.checkOkDataset}が不正です: ` +
          String(check.okValue)
      );
    }
    if (check.name.length === 0 || check.detail.length === 0) {
      throw new Error(`check[${index}]のname/detailがありません。`);
    }
    return {
      name: check.name,
      ok: check.okValue === "true",
      detail: check.detail,
      text: check.text
    };
  });

  if (raw.datasetStatus === "passed" && checks.length === 0) {
    throw new Error("passed状態ですがcheckが0件です。");
  }
  if (
    raw.datasetStatus === "passed" &&
    checks.some((check) => !check.ok)
  ) {
    throw new Error("passed状態に失敗checkが含まれています。");
  }
  if (
    raw.datasetStatus === "failed" &&
    checks.length > 0 &&
    checks.every((check) => check.ok)
  ) {
    throw new Error("failed状態ですが失敗checkがありません。");
  }
  return checks;
};

const errorRecord = (error) => ({
  name: error instanceof Error ? error.name : "Error",
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack ?? null : null
});

const argumentsValue = parseArguments();
const {
  suiteName,
  suite,
  outputPath,
  playwrightModule,
  browserExecutable,
  port
} = argumentsValue;
const startedAt = new Date();
const serverLogs = [];
const browserDiagnostics = {
  console: [],
  pageErrors: [],
  crashes: [],
  requestFailures: [],
  httpFailures: []
};
const artifact = {
  schemaVersion: 1,
  suite: suiteName,
  definition: {
    configPath: suite.configPath,
    entryPath: suite.entryPath,
    urlPath: suite.urlPath,
    timeoutMilliseconds: suite.timeoutMilliseconds,
    result: suite.result,
    knownRecord: suite.knownRecord ?? null
  },
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  elapsedMilliseconds: null,
  server: {
    host: "127.0.0.1",
    port,
    logs: serverLogs,
    exit: null,
    spawnError: null
  },
  page: null,
  diagnostics: browserDiagnostics,
  outcome: null,
  failure: null,
  cleanupErrors: []
};

let child = null;
let childObservation = null;
let browser = null;
let stage = "入力検証";

try {
  const configPath = resolve(repositoryRoot, suite.configPath);
  const entryPath = resolve(repositoryRoot, suite.entryPath);
  const viteCliPath = resolve(repositoryRoot, "node_modules/vite/bin/vite.js");
  await Promise.all([
    access(configPath),
    access(entryPath),
    access(viteCliPath),
    access(playwrightModule),
    access(browserExecutable)
  ]);

  stage = "Playwright読込";
  const playwright = await import(pathToFileURL(playwrightModule).href);
  if (!playwright.chromium || typeof playwright.chromium.launch !== "function") {
    throw new Error("指定moduleにPlaywright Chromiumがありません。");
  }

  const fixtureUrl = new URL(`http://127.0.0.1:${port}${suite.urlPath}`);
  stage = "Vite起動";
  child = startVite(suite, port, serverLogs);
  childObservation = observeChild(child);
  await waitForVite(fixtureUrl, childObservation.state);

  stage = "Chromium起動";
  browser = await playwright.chromium.launch({
    headless: true,
    executablePath: browserExecutable
  });
  const context = await browser.newContext({
    viewport: { width: 1_920, height: 1_080 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      browserDiagnostics.console.push({
        at: new Date().toISOString(),
        type: message.type(),
        text: message.text(),
        location: message.location()
      });
    }
  });
  page.on("pageerror", (error) => {
    browserDiagnostics.pageErrors.push({
      at: new Date().toISOString(),
      ...errorRecord(error)
    });
  });
  page.on("crash", () => {
    browserDiagnostics.crashes.push({ at: new Date().toISOString() });
  });
  page.on("requestfailed", (request) => {
    browserDiagnostics.requestFailures.push({
      at: new Date().toISOString(),
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
      failure: request.failure()
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const request = response.request();
      browserDiagnostics.httpFailures.push({
        at: new Date().toISOString(),
        status: response.status(),
        statusText: response.statusText(),
        method: request.method(),
        resourceType: request.resourceType(),
        url: response.url()
      });
    }
  });

  stage = "fixture読込";
  const navigationResponse = await page.goto(fixtureUrl.href, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  if (!navigationResponse || navigationResponse.status() !== 200) {
    throw new Error(
      `fixture documentのHTTP statusが${
        navigationResponse?.status() ?? "取得不能"
      }です。`
    );
  }

  stage = "fixture完了待機";
  await page.waitForFunction(
    (statusDataset) => {
      const status = document.documentElement.dataset[statusDataset];
      return typeof status === "string" && status !== "running";
    },
    suite.result.statusDataset,
    { timeout: suite.timeoutMilliseconds }
  );
  await page.waitForTimeout(250);

  stage = "fixture結果読取";
  const raw = await readFixtureResult(page, suite.result);
  artifact.page = {
    url: fixtureUrl.href,
    title: await page.title(),
    raw
  };
  const checks = validateFixtureResult(raw, suite.result);
  const failedChecks = checks.filter((check) => !check.ok);
  const externalIssueCount =
    browserDiagnostics.console.length +
    browserDiagnostics.pageErrors.length +
    browserDiagnostics.crashes.length +
    browserDiagnostics.requestFailures.length +
    browserDiagnostics.httpFailures.length;
  const passed =
    raw.datasetStatus === "passed" &&
    failedChecks.length === 0 &&
    externalIssueCount === 0;
  artifact.outcome = {
    status: passed ? "passed" : "failed",
    fixtureStatus: raw.datasetStatus,
    checks: checks.length,
    passedChecks: checks.length - failedChecks.length,
    failedChecks,
    externalIssueCount
  };
} catch (error) {
  artifact.failure = {
    stage,
    ...errorRecord(error)
  };
  artifact.outcome = {
    status: "runner-error",
    fixtureStatus: artifact.page?.raw?.datasetStatus ?? null,
    checks: artifact.page?.raw?.checks?.length ?? 0,
    passedChecks: null,
    failedChecks: null,
    externalIssueCount:
      browserDiagnostics.console.length +
      browserDiagnostics.pageErrors.length +
      browserDiagnostics.crashes.length +
      browserDiagnostics.requestFailures.length +
      browserDiagnostics.httpFailures.length
  };
} finally {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      artifact.cleanupErrors.push({ target: "chromium", ...errorRecord(error) });
    }
  }
  if (child && childObservation) {
    try {
      await stopChild(child, childObservation);
    } catch (error) {
      artifact.cleanupErrors.push({ target: "vite", ...errorRecord(error) });
    }
    artifact.server.exit = childObservation.state.exit;
    artifact.server.spawnError = childObservation.state.spawnError;
  }
  const finishedAt = new Date();
  artifact.finishedAt = finishedAt.toISOString();
  artifact.elapsedMilliseconds = finishedAt.getTime() - startedAt.getTime();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

if (
  artifact.outcome.status !== "passed" ||
  artifact.cleanupErrors.length > 0
) {
  process.exitCode = 1;
}

process.stdout.write(
  `${suiteName}: ${artifact.outcome.status} / ${outputPath}\n`
);
