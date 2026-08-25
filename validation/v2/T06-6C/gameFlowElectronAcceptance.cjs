const { app, BrowserWindow } = require("electron");

const urlArgument = process.argv.find((argument) => argument.startsWith("--url="));
if (!urlArgument) {
  throw new Error("--urlで実ゲームURLを指定してください。");
}
const targetUrl = urlArgument.slice("--url=".length);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const inspect = (window) => window.webContents.executeJavaScript(`(() => {
  const visible = (element) => element !== null && getComputedStyle(element).display !== "none";
  const status = document.querySelector("#statusInfo")?.textContent ?? "";
  return {
    startupPhase: document.body.dataset.v2StartupPhase ?? null,
    seed: document.body.dataset.v2RuntimeSessionSeed ?? null,
    titleVisible: visible(document.querySelector("#titleOverlay")),
    phase: status.match(/フェーズ ([^\\s]+)/)?.[1] ?? null,
    venue: status.match(/集合地点 ([^\\s]+)/)?.[1] ?? null,
    playerState: status.match(/状態 ([^\\s]+)/)?.[1] ?? null,
    help: document.querySelector("#helpPanel")?.textContent ?? "",
    missionHeading: document.querySelector('[data-v2-mission-hud-role="heading"]')?.textContent ?? null,
    missionResults: [...document.querySelectorAll('[data-v2-mission-hud-role="result-row"]')]
      .map((element) => element.textContent),
    pointerLockId: document.pointerLockElement?.id ?? null,
    roots: {
      settings: document.querySelectorAll('.v2-title-settings').length,
      runtimeHud: document.querySelectorAll('[data-v2-runtime-hud="root"]').length,
      missionHud: document.querySelectorAll('[data-v2-mission-hud="root"]').length
    },
    settings: {
      npcCount: document.querySelector('[data-ui="v2-settings-npc-count"]')?.value ?? null,
      playerBrainwashed: document.querySelector('[data-ui="v2-settings-player-brainwashed"]')?.checked ?? null,
      startModeButton: document.querySelector('[data-ui="title-instant-execution-toggle-button"]')?.textContent ?? null
    }
  };
})()`, true);

const waitFor = async (label, window, predicate, timeoutMilliseconds = 120000) => {
  const deadline = Date.now() + timeoutMilliseconds;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await inspect(window);
    if (predicate(latest)) {
      return latest;
    }
    await wait(100);
  }
  throw new Error(`${label}を確認できませんでした: ${JSON.stringify(latest)}`);
};

const sendKey = async (window, keyCode) => {
  window.webContents.sendInputEvent({ type: "keyDown", keyCode });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode });
  await wait(80);
};

const click = async (window, selector) => {
  const point = await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`, true);
  window.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
  window.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
};

const assertSingleRoots = (snapshot, label) => {
  if (Object.values(snapshot.roots).some((count) => count !== 1)) {
    throw new Error(`${label}でsession rootが重複しています: ${JSON.stringify(snapshot.roots)}`);
  }
};

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  const diagnostics = [];
  const window = new BrowserWindow({
    show: true,
    width: 1280,
    height: 720,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      partition: `t06-6c-game-flow-${process.pid}`
    }
  });
  const session = window.webContents.session;
  session.setPermissionCheckHandler((_contents, permission) => permission === "pointerLock");
  session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === "pointerLock"));
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) diagnostics.push(message);
  });
  window.webContents.on("did-fail-load", (_event, code, description) => diagnostics.push(`${code}:${description}`));
  window.webContents.on("render-process-gone", (_event, details) => diagnostics.push(`render:${details.reason}`));

  await window.loadURL(targetUrl);
  window.show();
  window.focus();
  const title = await waitFor(
    "通常タイトル",
    window,
    (snapshot) => snapshot.startupPhase === "running" && snapshot.titleVisible
  );
  assertSingleRoots(title, "初回タイトル");
  await window.webContents.executeJavaScript(`(() => {
    const npcCount = document.querySelector('[data-ui="v2-settings-npc-count"]');
    const playerBrainwashed = document.querySelector('[data-ui="v2-settings-player-brainwashed"]');
    npcCount.value = "1";
    npcCount.dispatchEvent(new Event("change", { bubbles: true }));
    playerBrainwashed.checked = false;
    playerBrainwashed.dispatchEvent(new Event("change", { bubbles: true }));
  })()`, true);
  await click(window, "#renderCanvas");
  const started = await waitFor(
    "Player未洗脳通常ゲーム",
    window,
    (snapshot) =>
      !snapshot.titleVisible && snapshot.phase === "playing" &&
      !snapshot.playerState?.startsWith("brainwash-complete") &&
      snapshot.help.includes("R: リトライ") && snapshot.help.includes("Enter: タイトルへ戻る")
  );
  assertSingleRoots(started, "通常ゲーム開始");
  const firstSeed = started.seed;

  await sendKey(window, "R");
  const retried = await waitFor(
    "通常ゲームRリトライ",
    window,
    (snapshot) =>
      !snapshot.titleVisible && snapshot.phase === "playing" &&
      snapshot.seed !== firstSeed && snapshot.settings.npcCount === "1" &&
      snapshot.settings.playerBrainwashed === false
  );
  if (retried.pointerLockId !== null) {
    throw new Error("Rリトライ後にPointer Lockが残っています。");
  }
  assertSingleRoots(retried, "Rリトライ");

  await sendKey(window, "Enter");
  const returnedTitle = await waitFor(
    "通常playingからタイトル復帰",
    window,
    (snapshot) =>
      snapshot.titleVisible && snapshot.startupPhase === "running" &&
      Object.values(snapshot.roots).every((count) => count === 1)
  );
  assertSingleRoots(returnedTitle, "通常playingタイトル復帰");

  await window.webContents.executeJavaScript(`(() => {
    const npcCount = document.querySelector('[data-ui="v2-settings-npc-count"]');
    const playerBrainwashed = document.querySelector('[data-ui="v2-settings-player-brainwashed"]');
    npcCount.value = "0";
    npcCount.dispatchEvent(new Event("change", { bubbles: true }));
    playerBrainwashed.checked = true;
    playerBrainwashed.dispatchEvent(new Event("change", { bubbles: true }));
  })()`, true);
  await click(window, "#renderCanvas");
  const epilogue = await waitFor(
    "全human洗脳済み自動epilogue",
    window,
    (snapshot) =>
      snapshot.phase === "assembly" && snapshot.missionHeading === "ミッション結果" &&
      snapshot.missionResults.length === 2 && snapshot.help.includes("Enter: タイトルへ戻る")
  );
  assertSingleRoots(epilogue, "自動epilogue");
  await sendKey(window, "Enter");
  const epilogueReturnedTitle = await waitFor(
    "自動epilogueからタイトル復帰",
    window,
    (snapshot) =>
      snapshot.titleVisible && snapshot.startupPhase === "running" &&
      Object.values(snapshot.roots).every((count) => count === 1)
  );
  assertSingleRoots(epilogueReturnedTitle, "自動epilogueタイトル復帰");

  await click(window, '[data-ui="title-instant-execution-toggle-button"]');
  await waitFor(
    "即時公開処刑モード",
    window,
    (snapshot) => snapshot.settings.startModeButton === "サバイバルモードに変更",
    10000
  );
  await click(window, "#renderCanvas");
  const execution = await waitFor(
    "公開処刑開始",
    window,
    (snapshot) => !snapshot.titleVisible && snapshot.phase === "execution"
  );
  const executionSeed = execution.seed;
  const venue = execution.venue;
  await sendKey(window, "R");
  await sendKey(window, "Enter");
  await wait(300);
  const progressing = await inspect(window);
  if (progressing.seed !== executionSeed || progressing.titleVisible || progressing.phase !== "execution") {
    throw new Error(`公開処刑中にR／Enterが受理されました: ${JSON.stringify(progressing)}`);
  }
  const completed = await waitFor(
    "公開処刑完了",
    window,
    (snapshot) =>
      snapshot.phase === "execution-complete" && snapshot.missionHeading === "ミッション結果" &&
      snapshot.help.includes("R: リプレイ") && snapshot.help.includes("Enter: タイトルへ戻る")
  );
  assertSingleRoots(completed, "公開処刑完了");
  await sendKey(window, "R");
  await waitFor(
    "公開処刑R再演",
    window,
    (snapshot) => snapshot.phase === "execution" && snapshot.venue === venue && snapshot.seed === executionSeed,
    10000
  );
  await waitFor(
    "公開処刑再演完了",
    window,
    (snapshot) => snapshot.phase === "execution-complete"
  );
  await sendKey(window, "Enter");
  const finalTitle = await waitFor(
    "公開処刑からタイトル復帰",
    window,
    (snapshot) =>
      snapshot.titleVisible && snapshot.startupPhase === "running" &&
      Object.values(snapshot.roots).every((count) => count === 1)
  );
  assertSingleRoots(finalTitle, "公開処刑タイトル復帰");

  if (diagnostics.length > 0) {
    throw new Error(`console/load/process異常: ${diagnostics.join(" | ")}`);
  }
  console.log(JSON.stringify({
    normalRetry: { fromSeed: firstSeed, toSeed: retried.seed, settings: retried.settings },
    autoEpilogue: { phase: epilogue.phase, missionResults: epilogue.missionResults },
    execution: { seed: executionSeed, venue, completed: completed.phase },
    finalRoots: finalTitle.roots,
    diagnostics: diagnostics.length
  }));
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
