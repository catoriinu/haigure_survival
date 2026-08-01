import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronExecutable = require("electron");
const repositoryRoot = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".."
);

const readArgument = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) {
    throw new Error(`${name}の値が必要です。`);
  }
  return process.argv[index + 1];
};

const profile = readArgument("--profile");
if (
  profile !== "baseline" &&
  profile !== "high" &&
  profile !== "interaction" &&
  profile !== "fixture" &&
  profile !== "hud" &&
  profile !== "ramp-school" &&
  profile !== "ramp-gym"
) {
  throw new Error(
    "--profileにはbaseline、high、interaction、fixture、hud、ramp-school、ramp-gymのいずれかが必要です。"
  );
}
const devServerUrl = readArgument("--url");
const parsedDevServerUrl = new URL(devServerUrl);
if (
  parsedDevServerUrl.hostname !== "127.0.0.1" &&
  parsedDevServerUrl.hostname !== "localhost"
) {
  throw new Error("--urlにはローカルVite URLが必要です。");
}
if (profile === "baseline" || profile === "high") {
  parsedDevServerUrl.searchParams.set(
    "schoolStress",
    profile
  );
  parsedDevServerUrl.searchParams.set("seed", "20260729");
}
if (profile === "ramp-school" || profile === "ramp-gym") {
  parsedDevServerUrl.searchParams.set(
    "rampValidation",
    profile === "ramp-school" ? "school" : "gym"
  );
}
const applicationUrl = parsedDevServerUrl.toString();
const expectedDurationSeconds =
  profile === "baseline"
    ? 600
    : profile === "high"
      ? 120
      : 0;
const CDP_COMMAND_TIMEOUT_MILLISECONDS =
  profile === "fixture" ? 60_000 : 10_000;

const wait = (milliseconds) =>
  new Promise((resolveWait) =>
    setTimeout(resolveWait, milliseconds)
  );

const acquirePort = () =>
  new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        rejectPort(
          new Error("Electron CDP用portを取得できません。")
        );
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          rejectPort(error);
          return;
        }
        resolvePort(port);
      });
    });
  });

const waitForDebuggerTarget = async (port, child) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Electronがrenderer接続前に終了しました: ${child.exitCode}`
      );
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/json/list`
      );
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(
          (candidate) =>
            candidate.type === "page" &&
            (profile === "interaction" ||
            profile === "fixture" ||
            profile === "hud" ||
            profile === "ramp-school" ||
            profile === "ramp-gym"
              ? candidate.url === applicationUrl
              : candidate.url.includes(
                  `schoolStress=${profile}`
                ))
        );
        if (target) {
          return target;
        }
      }
    } catch {
      // Chromiumのremote debugging起動完了まで再試行する。
    }
    await wait(500);
  }
  throw new Error(
    "Electron rendererのCDP targetを120秒以内に取得できませんでした。"
  );
};

const connectCdp = async (webSocketDebuggerUrl) => {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, {
      once: true
    });
    socket.addEventListener(
      "error",
      () =>
        rejectOpen(
          new Error("Electron rendererのCDP接続に失敗しました。")
        ),
      { once: true }
    );
  });

  let nextCommandId = 1;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id === "number") {
      const request = pending.get(message.id);
      if (!request) {
        return;
      }
      pending.delete(message.id);
      clearTimeout(request.timeoutId);
      if (message.error) {
        request.reject(
          new Error(
            `${request.method}: ${message.error.message}`
          )
        );
        return;
      }
      request.resolve(message.result);
      return;
    }
    listeners.forEach((listener) => listener(message));
  });
  socket.addEventListener("close", () => {
    const error = new Error(
      "Electron rendererのCDP接続が閉じました。"
    );
    pending.forEach((request) => {
      clearTimeout(request.timeoutId);
      request.reject(error);
    });
    pending.clear();
  });

  const send = (method, params = {}) =>
    new Promise((resolveCommand, rejectCommand) => {
      const id = nextCommandId;
      nextCommandId += 1;
      const timeoutId = setTimeout(() => {
        pending.delete(id);
        rejectCommand(
          new Error(
            `${method}: CDP commandが${CDP_COMMAND_TIMEOUT_MILLISECONDS}ms以内に完了しませんでした。`
          )
        );
      }, CDP_COMMAND_TIMEOUT_MILLISECONDS);
      pending.set(id, {
        method,
        timeoutId,
        resolve: resolveCommand,
        reject: rejectCommand
      });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return Object.freeze({
    socket,
    send,
    addListener: (listener) => listeners.add(listener)
  });
};

const evaluate = async (cdp, expression) => {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text
    );
  }
  return result.result.value;
};

const stopElectron = async (child) => {
  if (child.exitCode !== null) {
    return;
  }
  child.kill();
  const exited = await Promise.race([
    new Promise((resolveExit) =>
      child.once("exit", () => resolveExit(true))
    ),
    wait(5_000).then(() => false)
  ]);
  if (exited) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync(
      "taskkill",
      ["/PID", String(child.pid), "/T", "/F"],
      { stdio: "ignore" }
    );
    return;
  }
  child.kill("SIGKILL");
};

const remoteDebuggingPort = await acquirePort();
const electronUserDataDirectory = await mkdtemp(
  join(tmpdir(), "haigure-t04-electron-")
);
const electronOutput = [];
const child = spawn(
  electronExecutable,
  [
    `--remote-debugging-port=${remoteDebuggingPort}`,
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion",
    `--user-data-dir=${electronUserDataDirectory}`,
    "."
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: applicationUrl,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => electronOutput.push(chunk));
child.stderr.on("data", (chunk) => electronOutput.push(chunk));

let cdp = null;
const rendererDiagnostics = [];
let finalReport = null;
let outputPayload = null;
try {
  const target = await waitForDebuggerTarget(
    remoteDebuggingPort,
    child
  );
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  cdp.addListener((message) => {
    if (
      message.method === "Runtime.consoleAPICalled" &&
      ["warning", "error", "assert"].includes(
        message.params.type
      )
    ) {
      rendererDiagnostics.push({
        source: "console",
        level: message.params.type,
        text: message.params.args
          .map(
            (argument) =>
              argument.value ??
              argument.description ??
              argument.type
          )
          .join(" ")
      });
    }
    if (message.method === "Runtime.exceptionThrown") {
      rendererDiagnostics.push({
        source: "exception",
        level: "error",
        text:
          message.params.exceptionDetails.exception
            ?.description ??
          message.params.exceptionDetails.text
      });
    }
    if (
      message.method === "Log.entryAdded" &&
      ["warning", "error"].includes(
        message.params.entry.level
      )
    ) {
      rendererDiagnostics.push({
        source: "log",
        level: message.params.entry.level,
        text: message.params.entry.text
      });
    }
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");

  if (profile === "interaction" || profile === "hud") {
    const readinessDeadline = Date.now() + 120_000;
    let ready = false;
    while (Date.now() < readinessDeadline) {
      const state = await evaluate(
        cdp,
        `(() => ({
          hint: document.querySelector("#titleStartHint")?.textContent ?? "",
          overlayDisplay: document.querySelector("#titleOverlay")?.style.display ?? "",
          canvas: (() => {
            const canvas = document.querySelector("#renderCanvas");
            if (!(canvas instanceof HTMLCanvasElement)) {
              return null;
            }
            const bounds = canvas.getBoundingClientRect();
            return {
              x: bounds.left + bounds.width * 0.5,
              y: bounds.top + bounds.height * 0.5
            };
          })()
        }))()`
      );
      if (
        state.hint === "左クリック：開始" &&
        state.overlayDisplay === "flex" &&
        state.canvas
      ) {
        ready = true;
        break;
      }
      await wait(500);
    }
    if (!ready) {
      throw new Error(
        "Electron通常ゲームが120秒以内に開始可能状態へ到達しませんでした。"
      );
    }
    await wait(1_000);
    let beforeMove = await evaluate(
      cdp,
      `(() => ({
        pointerLockElementId:
          document.pointerLockElement?.id ?? null,
        overlayDisplay:
          document.querySelector("#titleOverlay")?.style.display ?? "",
        statusText:
          document.querySelector("#statusInfo")?.textContent ?? ""
      }))()`
    );
    if (beforeMove.pointerLockElementId !== "renderCanvas") {
      process.stdout.write(
        "Electron interaction: 実画面クリックによるPointer Lockを待機します。\n"
      );
      const pointerLockDeadline = Date.now() + 60_000;
      while (
        beforeMove.pointerLockElementId !== "renderCanvas" &&
        Date.now() < pointerLockDeadline
      ) {
        await wait(500);
        beforeMove = await evaluate(
          cdp,
          `(() => ({
            pointerLockElementId:
              document.pointerLockElement?.id ?? null,
            overlayDisplay:
              document.querySelector("#titleOverlay")?.style.display ?? "",
            statusText:
              document.querySelector("#statusInfo")?.textContent ?? ""
          }))()`
        );
      }
    }
    const hudLayout = await evaluate(
      cdp,
      `(() => {
        const status = document.querySelector("#statusInfo");
        const help = document.querySelector("#helpPanel");
        const minimap = document.querySelector("#minimapCanvas");
        const minimapReadout = document.querySelector("#minimapReadout");
        if (
          !(status instanceof HTMLElement) ||
          !(help instanceof HTMLElement) ||
          !(minimap instanceof HTMLElement) ||
          !(minimapReadout instanceof HTMLElement)
        ) {
          return null;
        }
        const statusBounds = status.getBoundingClientRect();
        const helpBounds = help.getBoundingClientRect();
        return {
          statusDisplay: getComputedStyle(status).display,
          statusTop: statusBounds.top,
          statusLeft: statusBounds.left,
          statusBottom: statusBounds.bottom,
          helpDisplay: getComputedStyle(help).display,
          helpTop: helpBounds.top,
          minimapDisplay: getComputedStyle(minimap).display,
          minimapReadoutDisplay:
            getComputedStyle(minimapReadout).display,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        };
      })()`
    );
    if (profile === "hud") {
      const targetCounterLine = beforeMove.statusText
        .split("\n")
        .find((line) => line.startsWith("プレイヤー標的"));
      if (
        beforeMove.pointerLockElementId !== "renderCanvas" ||
        beforeMove.overlayDisplay !== "none" ||
        !beforeMove.statusText.includes("フェーズ playing") ||
        !/プレイヤー標的 NPC \d+\s+BIT \d+/.test(
          beforeMove.statusText
        ) ||
        !hudLayout ||
        hudLayout.statusDisplay !== "block" ||
        Math.abs(hudLayout.statusTop - 12) > 0.5 ||
        Math.abs(hudLayout.statusLeft - 12) > 0.5 ||
        hudLayout.helpDisplay !== "block" ||
        hudLayout.statusBottom > hudLayout.helpTop ||
        hudLayout.minimapDisplay !== "none" ||
        hudLayout.minimapReadoutDisplay !== "none"
      ) {
        throw new Error(
          "Electron通常ゲームのHUD配置を確認できませんでした: " +
            JSON.stringify({
              beforeMove,
              hudLayout
            })
        );
      }
      outputPayload = Object.freeze({
        hud: Object.freeze({
          pointerLockElementId:
            beforeMove.pointerLockElementId,
          phase: "playing",
          targetCounterLine,
          layout: hudLayout
        })
      });
    }
    if (profile === "interaction") {
    const parseFootPosition = (statusText) => {
      const match =
        /X (-?\d+(?:\.\d+)?)\s+Y (-?\d+(?:\.\d+)?)\s+Z (-?\d+(?:\.\d+)?)/.exec(
          statusText
        );
      if (!match) {
        throw new Error(
          "Electron通常ゲームの足元座標をHUDから取得できません。"
        );
      }
      return Object.freeze({
        x: Number(match[1]),
        y: Number(match[2]),
        z: Number(match[3])
      });
    };
    const beforePosition = parseFootPosition(
      beforeMove.statusText
    );
    process.stdout.write(
      "Electron interaction: 実OSキーWによる移動を20秒間待機します。\n"
    );
    const readMovementState = async () => {
      const state = await evaluate(
        cdp,
        `(() => ({
          pointerLockElementId:
            document.pointerLockElement?.id ?? null,
          statusText:
            document.querySelector("#statusInfo")?.textContent ?? ""
        }))()`
      );
      const position = parseFootPosition(state.statusText);
      return Object.freeze({
        state,
        position,
        distance: Math.hypot(
          position.x - beforePosition.x,
          position.z - beforePosition.z
        )
      });
    };
    const realInputDeadline = Date.now() + 20_000;
    let movement = await readMovementState();
    while (
      movement.distance <= 0.001 &&
      Date.now() < realInputDeadline
    ) {
      await wait(250);
      movement = await readMovementState();
    }
    if (movement.distance <= 0.001) {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key: "w",
        code: "KeyW",
        windowsVirtualKeyCode: 87,
        nativeVirtualKeyCode: 87
      });
      await wait(1_500);
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "w",
        code: "KeyW",
        windowsVirtualKeyCode: 87,
        nativeVirtualKeyCode: 87
      });
      await wait(500);
      movement = await readMovementState();
    }
    const afterMove = movement.state;
    const afterPosition = movement.position;
    const movementDistance = movement.distance;
    if (
      beforeMove.pointerLockElementId !== "renderCanvas" ||
      afterMove.pointerLockElementId !== "renderCanvas" ||
      beforeMove.overlayDisplay !== "none" ||
      !afterMove.statusText.includes("フェーズ playing") ||
      !/プレイヤー標的 NPC \d+\s+BIT \d+/.test(
        afterMove.statusText
      ) ||
      !hudLayout ||
      hudLayout.statusDisplay !== "block" ||
      Math.abs(hudLayout.statusTop - 12) > 0.5 ||
      Math.abs(hudLayout.statusLeft - 12) > 0.5 ||
      hudLayout.helpDisplay !== "block" ||
      hudLayout.statusBottom > hudLayout.helpTop ||
      hudLayout.minimapDisplay !== "none" ||
      hudLayout.minimapReadoutDisplay !== "none" ||
      movementDistance <= 0.001
    ) {
      throw new Error(
        "Electron通常ゲームの開始、HUD配置、Pointer Lock、W移動を確認できませんでした: " +
          JSON.stringify({
            beforeMove,
            afterMove,
            hudLayout,
            movementDistance
          })
      );
    }
    outputPayload = Object.freeze({
      interaction: Object.freeze({
        pointerLockElementId:
          afterMove.pointerLockElementId,
        phase: "playing",
        beforePosition,
        afterPosition,
        movementDistance,
        hudLayout
      })
    });
    }
  } else if (
    profile === "ramp-school" ||
    profile === "ramp-gym"
  ) {
    const target = profile === "ramp-school" ? "school" : "gym";
    const parseFootPosition = (statusText) => {
      const match =
        /X (-?\d+(?:\.\d+)?)\s+Y (-?\d+(?:\.\d+)?)\s+Z (-?\d+(?:\.\d+)?)/.exec(
          statusText
        );
      if (!match) {
        throw new Error(
          "Electron箱山登坂検証の足元座標をHUDから取得できません。"
        );
      }
      return Object.freeze({
        x: Number(match[1]),
        y: Number(match[2]),
        z: Number(match[3])
      });
    };
    const readinessDeadline = Date.now() + 120_000;
    let beforeState = null;
    while (Date.now() < readinessDeadline) {
      beforeState = await evaluate(
        cdp,
        `(() => ({
          statusText:
            document.querySelector("#statusInfo")?.textContent ?? "",
          helpText:
            document.querySelector("#helpPanel")?.textContent ?? ""
        }))()`
      );
      if (
        beforeState.statusText.includes("フェーズ playing") &&
        beforeState.helpText.includes(`箱山登坂検証 ${target}`)
      ) {
        break;
      }
      await wait(500);
    }
    if (
      !beforeState?.statusText.includes("フェーズ playing") ||
      !beforeState.helpText.includes(`箱山登坂検証 ${target}`)
    ) {
      throw new Error(
        "Electron箱山登坂検証が120秒以内に開始しませんでした。"
      );
    }
    const beforePosition = parseFootPosition(
      beforeState.statusText
    );
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Shift",
      code: "ShiftLeft",
      windowsVirtualKeyCode: 16,
      nativeVirtualKeyCode: 16
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "w",
      code: "KeyW",
      windowsVirtualKeyCode: 87,
      nativeVirtualKeyCode: 87,
      modifiers: 8
    });
    const samples = [];
    for (let index = 0; index < 40; index += 1) {
      await wait(250);
      const statusText = await evaluate(
        cdp,
        `document.querySelector("#statusInfo")?.textContent ?? ""`
      );
      samples.push(parseFootPosition(statusText));
    }
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "w",
      code: "KeyW",
      windowsVirtualKeyCode: 87,
      nativeVirtualKeyCode: 87
    });
    await cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Shift",
      code: "ShiftLeft",
      windowsVirtualKeyCode: 16,
      nativeVirtualKeyCode: 16
    });
    await wait(500);
    const afterState = await evaluate(
      cdp,
      `(() => ({
        statusText:
          document.querySelector("#statusInfo")?.textContent ?? "",
        placement:
          JSON.parse(document.body.dataset.rampValidationPlacement ?? "null")
      }))()`
    );
    const afterPosition = parseFootPosition(afterState.statusText);
    const progress = (position) =>
      target === "school"
        ? beforePosition.x - position.x
        : position.x - beforePosition.x;
    const progressSamples = samples.map(progress);
    const minimumProgressDelta = Math.min(
      ...progressSamples.slice(1).map(
        (value, index) => value - progressSamples[index]
      )
    );
    const horizontalProgress = progress(afterPosition);
    const heightGain = afterPosition.y - beforePosition.y;
    const maximumProgress = Math.max(...progressSamples);
    const peakHeightGain = Math.max(
      ...samples.map((position) => position.y - beforePosition.y)
    );
    const completedDrop = afterPosition.y < beforePosition.y - 1.0;
    if (
      maximumProgress < 1.2 ||
      peakHeightGain < 0.2 ||
      !completedDrop ||
      minimumProgressDelta < -0.01
    ) {
      throw new Error(
        "Electron箱山登坂検証で登坂から柵外への落下まで安定して移動できませんでした: " +
          JSON.stringify({
            target,
            beforePosition,
            afterPosition,
            horizontalProgress,
            heightGain,
            maximumProgress,
            peakHeightGain,
            completedDrop,
            minimumProgressDelta,
            placement: afterState.placement
          })
      );
    }
    outputPayload = Object.freeze({
      ramp: Object.freeze({
        target,
        beforePosition,
        afterPosition,
        horizontalProgress,
        heightGain,
        maximumProgress,
        peakHeightGain,
        completedDrop,
        minimumProgressDelta,
        samples: samples.length,
        placement: afterState.placement
      })
    });
  } else if (profile === "fixture") {
    const fixtureDeadline = Date.now() + 120_000;
    let fixtureState = null;
    while (Date.now() < fixtureDeadline) {
      fixtureState = await evaluate(
        cdp,
        `(() => ({
          status:
            document.documentElement?.dataset.validationStatus ??
            null,
          summary:
            document.querySelector("#summary")?.textContent ?? "",
          failures: Array.from(
            document.querySelectorAll("li")
          )
            .map((item) => item.textContent ?? "")
            .filter((text) => text.includes("FAIL"))
            .slice(-3)
        }))()`
      );
      if (
        fixtureState.status === "passed" ||
        fixtureState.status === "failed"
      ) {
        break;
      }
      await wait(500);
    }
    if (fixtureState?.status !== "passed") {
      throw new Error(
        "Electron fixtureが120秒以内にPASSしませんでした: " +
          JSON.stringify(fixtureState)
      );
    }
    outputPayload = Object.freeze({
      fixture: Object.freeze(fixtureState)
    });
  } else {
    const deadline =
      Date.now() + (expectedDurationSeconds + 120) * 1000;
    let lastProgressSecond = -30;
    let firstReport = null;
    let previousFrameCount = -1;
    let previousSimulationElapsedSeconds = -1;
    let lastFrameProgressAt = Date.now();
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          `Electronがstress完了前に終了しました: ${child.exitCode}`
        );
      }
      const report = await evaluate(
        cdp,
        `JSON.parse(document.body.dataset.v2RuntimeStressReport ?? "null")`
      );
      if (report) {
        finalReport = report;
        firstReport ??= report;
        if (
          report.frameCount > previousFrameCount &&
          report.simulationElapsedSeconds >
            previousSimulationElapsedSeconds
        ) {
          previousFrameCount = report.frameCount;
          previousSimulationElapsedSeconds =
            report.simulationElapsedSeconds;
          lastFrameProgressAt = Date.now();
        } else if (
          Date.now() - lastFrameProgressAt > 15_000
        ) {
          throw new Error(
            "Electron rendererのframe更新が15秒以上停止しました。"
          );
        }
        const progressSecond = Math.floor(
          report.wallElapsedSeconds
        );
        if (progressSecond - lastProgressSecond >= 30) {
          lastProgressSecond = progressSecond;
          process.stdout.write(
            `Electron ${profile}: ${progressSecond}/${expectedDurationSeconds}s ` +
              `frames=${report.frameCount} revision=${report.spatialRevision}\n`
          );
        }
        if (report.status === "failed") {
          throw new Error(
            `Electron renderer stress失敗: ${report.error}`
          );
        }
        if (report.status === "passed") {
          break;
        }
      }
      await wait(5_000);
    }
    if (
      finalReport?.status !== "passed" ||
      firstReport === null ||
      finalReport.frameCount <= firstReport.frameCount ||
      finalReport.simulationElapsedSeconds <=
        firstReport.simulationElapsedSeconds
    ) {
      throw new Error(
        `Electron ${profile} stressが更新を継続した状態で期限内に完了しませんでした。`
      );
    }
    outputPayload = Object.freeze({
      report: finalReport
    });
  }
  if (rendererDiagnostics.length > 0) {
    throw new Error(
      `Electron rendererにwarning／errorが${rendererDiagnostics.length}件あります。`
    );
  }
  process.stdout.write(
    `${JSON.stringify({
      application: "electron",
      profile,
      url: applicationUrl,
      ...outputPayload,
      rendererDiagnostics,
      processOutput: electronOutput.join("").slice(-4_000)
    })}\n`
  );
} finally {
  if (
    cdp &&
    cdp.socket.readyState === WebSocket.OPEN
  ) {
    try {
      await evaluate(
        cdp,
        "setTimeout(() => window.close(), 0); true"
      );
      await wait(500);
    } catch {
      // target終了後はprocess側の終了確認へ進む。
    }
    cdp.socket.close();
  }
  await stopElectron(child);
  await rm(electronUserDataDirectory, {
    recursive: true,
    force: true
  });
}
