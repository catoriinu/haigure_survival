const { app, BrowserWindow } = require("electron");

const urlArgument = process.argv.find((argument) => argument.startsWith("--url="));
if (!urlArgument) throw new Error("--urlで実ゲームURLを指定してください。");
const targetUrl = urlArgument.slice("--url=".length);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const inspect = (window) => window.webContents.executeJavaScript(`(() => {
  const visible = (element) => element && getComputedStyle(element).display !== "none";
  const status = document.querySelector("#statusInfo")?.textContent ?? "";
  return {
    startup: document.body.dataset.v2StartupPhase ?? null,
    title: visible(document.querySelector("#titleOverlay")),
    phase: status.match(/フェーズ ([^\\s]+)/)?.[1] ?? null,
    help: document.querySelector("#helpPanel")?.textContent ?? "",
    mode: document.querySelector('[data-ui="title-instant-execution-toggle-button"]')?.textContent ?? null,
    pointerLocked: document.pointerLockElement === document.querySelector("#renderCanvas"),
    diagnostics: window.__v2StaticReuseDiagnostics?.() ?? null
  };
})()`, true);

const waitFor = async (window, label, predicate, timeout = 120000) => {
  const deadline = Date.now() + timeout;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await inspect(window);
    if (predicate(latest)) return latest;
    await wait(100);
  }
  throw new Error(`${label}を確認できませんでした: ${JSON.stringify(latest)}`);
};

const sendKey = async (window, keyCode) => {
  window.show();
  window.moveTop();
  window.focus();
  window.webContents.focus();
  await wait(100);
  window.webContents.sendInputEvent({ type: "keyDown", keyCode });
  await wait(70);
  window.webContents.sendInputEvent({ type: "keyUp", keyCode });
};

const click = async (window, selector) => {
  window.show();
  window.moveTop();
  window.focus();
  window.webContents.focus();
  const focusDeadline = Date.now() + 2000;
  while (!window.isFocused() && Date.now() < focusDeadline) {
    window.moveTop();
    window.focus();
    window.webContents.focus();
    await wait(100);
  }
  if (!window.isFocused()) throw new Error("Electron受入windowへfocusできません。");
  await wait(250);
  const point = await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) throw new Error("操作対象がありません: " + ${JSON.stringify(selector)});
    const rect = element.getBoundingClientRect();
    const fractions = [0.5, 0.1, 0.9, 0.3, 0.7];
    for (const yFraction of fractions) {
      for (const xFraction of fractions) {
        const x = Math.round(rect.left + rect.width * xFraction);
        const y = Math.round(rect.top + rect.height * yFraction);
        const hit = document.elementFromPoint(x, y);
        if (hit === element || element.contains(hit)) return { x, y };
      }
    }
    throw new Error("操作対象が最前面になる座標がありません: " + ${JSON.stringify(selector)});
  })()`, true);
  window.webContents.sendInputEvent({ type: "mouseMove", ...point });
  window.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  await wait(50);
  window.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
};

const assertReuse = (snapshots) => {
  const diagnostics = snapshots.map((snapshot) => snapshot.diagnostics);
  if (diagnostics.some((entry) => !entry)) throw new Error("実アプリ診断hookがありません。");
  if (diagnostics.some((entry) => entry.staticLoadCount !== 1 || entry.glbParseCount !== 1)) {
    throw new Error(`静的load/GLB parseが1回ではありません: ${JSON.stringify(diagnostics)}`);
  }
  if (new Set(diagnostics.map((entry) => entry.staticIdentity)).size !== 1) {
    throw new Error(`static identityが変化しました: ${JSON.stringify(diagnostics)}`);
  }
  if (new Set(diagnostics.map((entry) => entry.dynamicIdentity)).size !== diagnostics.length) {
    throw new Error(`dynamic identityが更新されません: ${JSON.stringify(diagnostics)}`);
  }
  if (diagnostics[0].sessionSeed === diagnostics[1].sessionSeed ||
      diagnostics[0].sessionStartSnapshot !== diagnostics[1].sessionStartSnapshot) {
    throw new Error(`通常Rの新seed/元snapshot規則が不正です: ${JSON.stringify(diagnostics)}`);
  }
  if (diagnostics[2].sessionSeed !== diagnostics[3].sessionSeed ||
      diagnostics[2].sessionStartSnapshot !== diagnostics[3].sessionStartSnapshot) {
    throw new Error(`公開処刑Rの同seed/同snapshot規則が不正です: ${JSON.stringify(diagnostics)}`);
  }
  const last = diagnostics.at(-1);
  const old = diagnostics.slice(0, -1).map((entry) => entry.dynamicIdentity);
  if (old.some((identity) => last.disposedDynamicIdentities.filter((value) => value === identity).length !== 1)) {
    throw new Error(`旧sessionが各1回破棄されていません: ${JSON.stringify(diagnostics)}`);
  }
  if (old.some((identity) => last.dynamicDisposeInvocationIdentities.filter((value) => value === identity).length !== 1)) {
    throw new Error(`旧sessionのdispose呼出しが各1回ではありません: ${JSON.stringify(diagnostics)}`);
  }
  if (diagnostics.some((entry) => entry.humanNavigationWorldCount !== 1 ||
      entry.staticDecodedHumanBundleOwnerCount !== 1 ||
      entry.staticBitNavigationOwnerCount !== 1 || entry.scene.cameras !== 1) ||
      diagnostics.at(-1).staticOnlyBaselineMismatchCount !== 0 ||
      diagnostics.at(-1).staticOnlyBaselineMatchCount < 3) {
    throw new Error(`動的NavigationWorld/Camera所有数が不正です: ${JSON.stringify(diagnostics)}`);
  }
  const expectedOwners = ["actor", "room-active-set", "mission", "timer", "reservation", "passenger", "input", "hud", "audio", "observer", "subscription", "query", "human-navigation-world"];
  if (diagnostics.some((entry) =>
    JSON.stringify([...entry.dynamicOwners.active].sort()) !== JSON.stringify([...expectedOwners].sort()) ||
    entry.dynamicOwners.disposedResiduals.some((disposed) => disposed.residual.length !== 0)
  )) {
    throw new Error(`実動的owner ledgerに旧世代残留があります: ${JSON.stringify(diagnostics)}`);
  }
};

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.on("window-all-closed", () => {});
app.whenReady().then(async () => {
  const issues = [];
  const window = new BrowserWindow({
    show: true,
    width: 1280,
    height: 720,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
      partition: `t06-6d-game-flow-${process.pid}` }
  });
  const session = window.webContents.session;
  session.setPermissionCheckHandler(
    (_contents, permission) => permission === "pointerLock"
  );
  session.setPermissionRequestHandler(
    (_contents, permission, callback) =>
      callback(permission === "pointerLock")
  );
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) issues.push(`console:${level}:${message}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => issues.push(`render:${details.reason}`));
  await window.loadURL(targetUrl);
  window.show();
  window.focus();
  const title = await waitFor(window, "初回タイトル", (value) => value.startup === "running" && value.title);
  await window.webContents.executeJavaScript(`window.addEventListener("unhandledrejection", event => console.error("unhandledrejection", event.reason));`, true);
  await window.webContents.executeJavaScript(`(() => {
    const npcCount = document.querySelector('[data-ui="v2-settings-npc-count"]');
    const playerBrainwashed = document.querySelector('[data-ui="v2-settings-player-brainwashed"]');
    npcCount.value = "1";
    npcCount.dispatchEvent(new Event("change", { bubbles: true }));
    playerBrainwashed.checked = false;
    playerBrainwashed.dispatchEvent(new Event("change", { bubbles: true }));
  })()`, true);
  await click(window, "#renderCanvas");
  const first = await waitFor(
    window,
    "通常開始",
    (value) => !value.title && value.phase === "playing" && value.pointerLocked
  );
  await sendKey(window, "R");
  const second = await waitFor(window, "通常R", (value) => !value.title && value.phase === "playing" && value.diagnostics?.dynamicIdentity !== first.diagnostics?.dynamicIdentity);
  await sendKey(window, "Enter");
  const returnedTitle = await waitFor(
    window,
    "通常Enter後の新タイトルsession公開",
    (value) => value.title && !value.diagnostics?.transitionInProgress &&
      value.diagnostics?.dynamicIdentity !== second.diagnostics?.dynamicIdentity
  );
  await window.webContents.executeJavaScript(`(() => {
    const npcCount = document.querySelector('[data-ui="v2-settings-npc-count"]');
    const playerBrainwashed = document.querySelector('[data-ui="v2-settings-player-brainwashed"]');
    npcCount.value = "0";
    npcCount.dispatchEvent(new Event("change", { bubbles: true }));
    playerBrainwashed.checked = true;
    playerBrainwashed.dispatchEvent(new Event("change", { bubbles: true }));
  })()`, true);
  await click(window, '[data-ui="title-instant-execution-toggle-button"]');
  await waitFor(window, "公開処刑mode", (value) => value.mode === "サバイバルモードに変更", 10000);
  await click(window, "#renderCanvas");
  const execution = await waitFor(
    window,
    "公開処刑",
    (value) => value.phase === "execution-complete"
  );
  await sendKey(window, "R");
  const replay = await waitFor(
    window,
    "公開処刑R",
    (value) => value.phase === "execution-complete" &&
      value.help.includes("Enter: タイトルへ戻る") &&
      !value.diagnostics?.transitionInProgress &&
      value.diagnostics?.dynamicIdentity !== execution.diagnostics?.dynamicIdentity
  );
  window.focus();
  await sendKey(window, "Enter");
  const finalTitle = await waitFor(
    window,
    "公開処刑Enter後の新タイトルsession公開",
    (value) => value.title && !value.diagnostics?.transitionInProgress &&
      value.diagnostics?.dynamicIdentity !== replay.diagnostics?.dynamicIdentity
  );
  assertReuse([first, second, execution, replay, returnedTitle, finalTitle]);
  const finalIdentity = finalTitle.diagnostics?.dynamicIdentity;
  const termination = await window.webContents.executeJavaScript(`(() => {
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("beforeunload"));
    return window.__v2StaticReuseDiagnostics?.() ?? null;
  })()`, true);
  const finalResiduals = termination?.dynamicOwners.disposedResiduals.filter(
    (entry) => entry.generation === finalIdentity
  ) ?? [];
  if (
    termination === null ||
    !termination.runtimeTerminated ||
    termination.dynamicIdentity !== null ||
    termination.disposedDynamicIdentities.filter((value) => value === finalIdentity).length !== 1 ||
    termination.dynamicDisposeInvocationIdentities.filter((value) => value === finalIdentity).length !== 1 ||
    termination.humanNavigationWorldCount !== 0 ||
    termination.staticDecodedHumanBundleOwnerCount !== 0 ||
    termination.staticBitNavigationOwnerCount !== 0 ||
    termination.dynamicOwners.active.length !== 0 ||
    finalResiduals.length !== 1 ||
    finalResiduals[0].residual.length !== 0
  ) {
    throw new Error(`beforeunloadの各owner 1回破棄が不正です: ${JSON.stringify(termination)}`);
  }
  await wait(0);
  if (issues.length > 0) throw new Error(`console/unhandled異常: ${issues.join(" | ")}`);
  console.log(`T06-6D実ゲームElectron PASS: ${JSON.stringify({ title: title.diagnostics, first: first.diagnostics, second: second.diagnostics, execution: execution.diagnostics, replay: replay.diagnostics, termination })}`);
  window.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
