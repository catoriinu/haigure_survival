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
const reportPath = process.env.T06_ELECTRON_REPORT_FILE ?? null;
const audioOnly = process.env.T06_ELECTRON_AUDIO_ONLY === "1";
const poolStartOnly = process.env.T06_ELECTRON_POOL_START_ONLY === "1";
if (
  applicationUrl.hostname !== "localhost" &&
  applicationUrl.hostname !== "127.0.0.1"
) {
  throw new Error("--urlにはローカルVite URLが必要です。");
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const assertCondition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const report = {
  status: "running",
  url: applicationUrl.toString(),
  startedAt: new Date().toISOString(),
  checks: [],
  stateTimeline: [],
  audioResources: {
    completed: [],
    failed: []
  },
  diagnostics: {
    console: [],
    renderer: [],
    load: [],
    renderProcessGone: [],
    unresponsive: []
  },
  supplemental: {
    fec: "候補位置に依存するためElectron連続操作には含めない。T06専用fixtureで検証する。",
    water: poolStartOnly
      ? "固定seedの実プール開始地点から水中移動を専用受入で検証する。"
      : "水Volumeまでの安定した実入力経路を定義していないため通常のElectron連続操作には含めない。固定プール開始専用受入で検証する。"
  }
};

const addCheck = (name, evidence) => {
  report.checks.push({ name, evidence });
  process.stdout.write(`[T06 Electron] PASS ${name}\n`);
};

const getAudioCategory = (url) => {
  const pathname = decodeURIComponent(new URL(url).pathname).toLowerCase();
  if (!/\.(mp3|wav|ogg|m4a)$/.test(pathname)) {
    return null;
  }
  if (pathname.includes("/audio/bgm/")) {
    return "BGM";
  }
  if (pathname.includes("/audio/voice/")) {
    return "VOICE";
  }
  if (pathname.includes("/audio/se/")) {
    return "SE";
  }
  return null;
};

const parseState = (text) =>
  text.match(/状態 ([^\s]+)/)?.[1] ?? null;

const parsePosition = (text) => {
  const match = text.match(
    /X (-?\d+(?:\.\d+)?)\s+Y (-?\d+(?:\.\d+)?)\s+Z (-?\d+(?:\.\d+)?)/
  );
  return match
    ? { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) }
    : null;
};

const parseBeamCount = (text) =>
  Number(text.match(/BEAM (\d+)/)?.[1] ?? 0);

const parseBitPlayerTargetCount = (text) =>
  Number(text.match(/プレイヤー標的 NPC \d+\s+BIT (\d+)/)?.[1] ?? 0);

const assertNpcSpawnReport = (snapshot, label) => {
  const report = snapshot.npcSpawnReport;
  assertCondition(report !== null, `${label}のNPC spawn reportがありません。`);
  assertCondition(
    String(report.sessionSeed) === snapshot.runtimeSessionSeed &&
      report.playerSpawnId === snapshot.playerSpawnId,
    `${label}のseedまたはPlayer開始IDがDOM診断と一致しません。`
  );
  assertCondition(
    report.npcCount === 50 &&
      report.initialBrainwashedNpcCount === 10 &&
      report.signature.length === 50 &&
      new Set(report.signature.map((entry) => entry.id)).size === 50,
    `${label}のNPC 50/初期洗脳10またはsignatureが不正です。`
  );
  assertCondition(
    report.activeBiases.length === 1 &&
      typeof report.activeBiases[0].id === "string" &&
      report.activeBiases[0].id.length > 0 &&
      report.activeBiases[0].playerSpawnId === report.playerSpawnId &&
      report.activeBiases[0].weight === 0.5 &&
      report.npcInsideActiveBiasCount >= 0 &&
      report.npcInsideActiveBiasCount <= report.npcCount &&
      report.initialBrainwashedInsideActiveBiasCount >= 0 &&
      report.initialBrainwashedInsideActiveBiasCount <=
        report.initialBrainwashedNpcCount &&
      report.npcInsideActiveBiasCount -
        report.initialBrainwashedInsideActiveBiasCount >=
        0 &&
      report.npcInsideActiveBiasCount -
        report.initialBrainwashedInsideActiveBiasCount <=
        report.npcCount - report.initialBrainwashedNpcCount,
    `${label}の選択Player対応bias診断が不正です。`
  );
  return report;
};

const horizontalDistance = (left, right) =>
  Math.hypot(right.x - left.x, right.z - left.z);

const inspectDom = (window) =>
  window.webContents.executeJavaScript(
    `(() => {
      const visible = (element) => {
        if (!element || element.hidden) {
          return false;
        }
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };
      const roleVisible = (role) => visible(document.querySelector('[data-v2-runtime-hud-role="' + role + '"]'));
      const canvas = document.getElementById("renderCanvas");
      const rect = canvas?.getBoundingClientRect() ?? null;
      const npcSpawnReportText = document.body.dataset.v2NpcSpawnReport ?? null;
      return {
        titleHint: document.getElementById("titleStartHint")?.textContent ?? "",
        titleVisible: visible(document.getElementById("titleOverlay")),
        titleMessage: document.getElementById("titleMessage")?.textContent ?? "",
        helpText: document.getElementById("helpPanel")?.textContent ?? "",
        status: document.getElementById("statusInfo")?.textContent ?? "",
        pointerLockId: document.pointerLockElement?.id ?? null,
        hudRootCount: document.querySelectorAll('[data-v2-runtime-hud="root"]').length,
        volumeRootCount: document.querySelectorAll('[data-ui="volume-panel"]').length,
        volumeValues: Array.from(document.querySelectorAll('.volume-value')).map(
          (element) => element.textContent ?? ""
        ),
        characterSettingsRootCount: document.querySelectorAll('[data-ui="v2-character-settings"]').length,
        portraitSelectCount: document.querySelectorAll('[data-ui="v2-player-portrait-select"]').length,
        portraitSelection: document.querySelector('[data-ui="v2-player-portrait-select"]')?.value ?? null,
        voiceSelectCount: document.querySelectorAll('[data-ui="v2-player-voice-select"]').length,
        voiceSelection: document.querySelector('[data-ui="v2-player-voice-select"]')?.value ?? null,
        runtimeSessionSeed: document.body.dataset.v2RuntimeSessionSeed ?? null,
        playerSpawnId: document.body.dataset.v2PlayerSpawnId ?? null,
        npcSpawnReport: npcSpawnReportText === null ? null : JSON.parse(npcSpawnReportText),
        completionGuideVisible: roleVisible("completion-guide"),
        crosshairVisible: roleVisible("crosshair"),
        fireGuideVisible: roleVisible("fire-guide"),
        npcPromptVisible: roleVisible("npc-prompt"),
        doorPromptVisible: roleVisible("door-prompt"),
        canvasRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
      };
    })()`,
    true
  );

const waitFor = async (name, window, predicate, timeoutMilliseconds) => {
  const deadline = Date.now() + timeoutMilliseconds;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await inspectDom(window);
    if (predicate(latest)) {
      return latest;
    }
    await wait(100);
  }
  throw new Error(`${name}を${timeoutMilliseconds}ms以内に確認できませんでした: ${JSON.stringify(latest)}`);
};

const sendKey = async (window, keyCode, holdMilliseconds = 70) => {
  window.webContents.sendInputEvent({ type: "keyDown", keyCode });
  await wait(holdMilliseconds);
  window.webContents.sendInputEvent({ type: "keyUp", keyCode });
};

const sendCanvasClick = async (window) => {
  const snapshot = await inspectDom(window);
  assertCondition(snapshot.canvasRect !== null, "renderCanvasの領域を取得できません。");
  const x = Math.round(snapshot.canvasRect.x + snapshot.canvasRect.width / 2);
  const y = Math.round(snapshot.canvasRect.y + snapshot.canvasRect.height / 2);
  window.webContents.sendInputEvent({ type: "mouseMove", x, y });
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x,
    y,
    button: "left",
    clickCount: 1
  });
  await wait(50);
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x,
    y,
    button: "left",
    clickCount: 1
  });
};

const measureMovement = async (window, keyCode, holdMilliseconds) => {
  const beforeSnapshot = await inspectDom(window);
  const before = parsePosition(beforeSnapshot.status);
  assertCondition(before !== null, "移動前のプレイヤー座標を取得できません。");
  window.webContents.sendInputEvent({ type: "keyDown", keyCode });
  await wait(holdMilliseconds);
  window.webContents.sendInputEvent({ type: "keyUp", keyCode });
  await wait(250);
  const afterSnapshot = await inspectDom(window);
  const after = parsePosition(afterSnapshot.status);
  assertCondition(after !== null, "移動後のプレイヤー座標を取得できません。");
  return {
    keyCode,
    before,
    after,
    horizontalDistance: horizontalDistance(before, after)
  };
};

const waitForBrainwashSelection = async (window) => {
  const deadline = Date.now() + 420_000;
  const patrolKeys = ["W", "D", "S", "A"];
  let patrolIndex = 0;
  let nextPatrolAt = Date.now() + 8_000;
  let nextProgressAt = Date.now();
  let previousState = null;
  while (Date.now() < deadline) {
    const snapshot = await inspectDom(window);
    const state = parseState(snapshot.status);
    if (state !== null && state !== previousState) {
      report.stateTimeline.push({
        elapsedMilliseconds: Date.now() - Date.parse(report.startedAt),
        state
      });
      previousState = state;
    }
    if (state === "brainwash-in-progress") {
      return snapshot;
    }
    if (Date.now() >= nextProgressAt) {
      process.stdout.write(
        `[T06 Electron] 洗脳待機 state=${state} BIT-targets=${parseBitPlayerTargetCount(snapshot.status)}\n`
      );
      nextProgressAt = Date.now() + 15_000;
    }
    if (
      Date.now() >= nextPatrolAt &&
      (state === "normal" || state === "evade") &&
      parseBitPlayerTargetCount(snapshot.status) === 0
    ) {
      const keyCode = patrolKeys[patrolIndex % patrolKeys.length];
      patrolIndex += 1;
      await sendKey(window, keyCode, 1_200);
      nextPatrolAt = Date.now() + 6_000;
    }
    await wait(100);
  }
  throw new Error("通常Runtimeでbrainwash-in-progressへ420秒以内に到達できませんでした。");
};

const waitForAudioCategories = async (timeoutMilliseconds) => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const completedCategories = new Set(
      report.audioResources.completed
        .filter((resource) => resource.statusCode >= 200 && resource.statusCode < 300)
        .map((resource) => resource.category)
    );
    if (["BGM", "SE", "VOICE"].every((category) => completedCategories.has(category))) {
      return;
    }
    await wait(100);
  }
  throw new Error("BGM／SE／VOICEのresource load完了を確認できませんでした。");
};

const selectCompletionState = async (window, keyCode, expectedState) => {
  await sendKey(window, keyCode);
  return waitFor(
    `${keyCode}による${expectedState}選択`,
    window,
    (snapshot) => parseState(snapshot.status) === expectedState,
    5_000
  );
};

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

let testWindow = null;

ipcMain.on("t06-renderer-diagnostic", (_event, diagnostic) => {
  report.diagnostics.renderer.push(diagnostic);
});

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
      partition: `t06-acceptance-${process.pid}`,
      preload: path.join(__dirname, "electronAcceptancePreload.cjs")
    }
  });
  testWindow.setMenuBarVisibility(false);

  const runtimeSession = testWindow.webContents.session;
  runtimeSession.setPermissionCheckHandler((_webContents, permission) =>
    permission === "pointerLock"
  );
  runtimeSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "pointerLock");
  });
  runtimeSession.webRequest.onCompleted({ urls: ["<all_urls>"] }, (details) => {
    const category = getAudioCategory(details.url);
    if (category !== null) {
      report.audioResources.completed.push({
        category,
        url: decodeURIComponent(details.url),
        statusCode: details.statusCode,
        fromCache: details.fromCache,
        resourceType: details.resourceType
      });
    }
  });
  runtimeSession.webRequest.onErrorOccurred({ urls: ["<all_urls>"] }, (details) => {
    const category = getAudioCategory(details.url);
    if (category !== null) {
      report.audioResources.failed.push({
        category,
        url: decodeURIComponent(details.url),
        error: details.error,
        resourceType: details.resourceType
      });
    }
  });

  testWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      report.diagnostics.console.push({ level, message, line, sourceId });
    }
  });
  testWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    report.diagnostics.load.push({ errorCode, errorDescription, validatedUrl, isMainFrame });
  });
  testWindow.webContents.on("render-process-gone", (_event, details) => {
    report.diagnostics.renderProcessGone.push(details);
  });
  testWindow.webContents.on("unresponsive", () => {
    report.diagnostics.unresponsive.push({ at: new Date().toISOString() });
  });

  await testWindow.loadURL(applicationUrl.toString());
  testWindow.show();
  testWindow.focus();

  if (poolStartOnly) {
    const autoStartedPool = await waitFor(
      "固定プール開始専用Runtime",
      testWindow,
      (snapshot) =>
        !snapshot.titleVisible &&
        snapshot.runtimeSessionSeed === "11" &&
        snapshot.playerSpawnId ===
          "player-spawn-roof-pool-west-stairs" &&
        parsePosition(snapshot.status) !== null,
      120_000
    );
    const poolNpcSpawnReport = assertNpcSpawnReport(
      autoStartedPool,
      "固定プール開始session"
    );
    await sendCanvasClick(testWindow);
    const startedForPool = await waitFor(
      "Pointer Lock（固定プール開始専用）",
      testWindow,
      (snapshot) => snapshot.pointerLockId === "renderCanvas",
      10_000
    );
    const poolMovement = await measureMovement(testWindow, "W", 700);
    assertCondition(
      poolMovement.horizontalDistance > 0.02,
      `屋上プール開始地点からWで移動できません: ${poolMovement.horizontalDistance}`
    );
    assertCondition(
      report.diagnostics.console.length === 0,
      "固定プール開始専用受入でconsole warning/errorがあります。"
    );
    assertCondition(
      report.diagnostics.renderer.length === 0,
      "固定プール開始専用受入でrenderer error/unhandledrejectionがあります。"
    );
    assertCondition(
      report.diagnostics.load.length === 0,
      "固定プール開始専用受入でrenderer load errorがあります。"
    );
    assertCondition(
      report.diagnostics.renderProcessGone.length === 0,
      "固定プール開始専用受入でrender-process-goneがあります。"
    );
    assertCondition(
      report.diagnostics.unresponsive.length === 0,
      "固定プール開始専用受入でrenderer unresponsiveがあります。"
    );
    addCheck("固定プール開始地点からW実入力移動", {
      seed: poolNpcSpawnReport.sessionSeed,
      playerSpawnId: poolNpcSpawnReport.playerSpawnId,
      pointerLockId: startedForPool.pointerLockId,
      movement: poolMovement,
      diagnostics: {
        console: report.diagnostics.console.length,
        renderer: report.diagnostics.renderer.length,
        load: report.diagnostics.load.length,
        renderProcessGone: report.diagnostics.renderProcessGone.length,
        unresponsive: report.diagnostics.unresponsive.length
      }
    });
    report.status = "passed";
    return;
  }

  const initialTitle = await waitFor(
    "初回タイトル読込完了",
    testWindow,
    (snapshot) =>
      snapshot.titleHint === "左クリック：開始" &&
      snapshot.titleVisible &&
      snapshot.hudRootCount === 1 &&
      snapshot.volumeRootCount === 1 &&
      snapshot.characterSettingsRootCount === 1,
    120_000
  );
  assertCondition(
    JSON.stringify(initialTitle.volumeValues) === JSON.stringify(["5", "5", "5"]),
    `VOICE／BGM／SEの既定表示が5ではありません: ${JSON.stringify(initialTitle.volumeValues)}`
  );
  const initialNpcSpawnReport = assertNpcSpawnReport(
    initialTitle,
    "初回session"
  );
  addCheck("初回session所有root", {
    hudRootCount: initialTitle.hudRootCount,
    volumeRootCount: initialTitle.volumeRootCount,
    volumeValues: initialTitle.volumeValues,
    characterSettingsRootCount: initialTitle.characterSettingsRootCount,
    portraitSelectCount: initialTitle.portraitSelectCount,
    portraitSelection: initialTitle.portraitSelection,
    voiceSelectCount: initialTitle.voiceSelectCount,
    voiceSelection: initialTitle.voiceSelection,
    npcSpawn: {
      seed: initialNpcSpawnReport.sessionSeed,
      playerSpawnId: initialNpcSpawnReport.playerSpawnId,
      activeBiases: initialNpcSpawnReport.activeBiases,
      npcCount: initialNpcSpawnReport.npcCount,
      initialBrainwashedNpcCount:
        initialNpcSpawnReport.initialBrainwashedNpcCount,
      npcInsideActiveBiasCount:
        initialNpcSpawnReport.npcInsideActiveBiasCount,
      initialBrainwashedInsideActiveBiasCount:
        initialNpcSpawnReport.initialBrainwashedInsideActiveBiasCount
    }
  });

  await sendCanvasClick(testWindow);
  if (audioOnly) {
    const startedForAudio = await waitFor(
      "Canvas開始（音声専用）",
      testWindow,
      (snapshot) => !snapshot.titleVisible,
      10_000
    );
    await waitForAudioCategories(30_000);
    const successfulAudioResources = report.audioResources.completed.filter(
      (resource) => resource.statusCode >= 200 && resource.statusCode < 300
    );
    const successfulAudioUrls = new Set(
      successfulAudioResources.map((resource) => resource.url)
    );
    const unrecoveredAudioFailures = report.audioResources.failed.filter(
      (resource) =>
        resource.error !== "net::ERR_ABORTED" ||
        !successfulAudioUrls.has(resource.url)
    );
    const audioConsoleDiagnostics = report.diagnostics.console.filter(
      (diagnostic) =>
        /BGM audio play\(\) failed|Spatial audio play\(\) failed|audio media error/i.test(
          diagnostic.message
        )
    );
    assertCondition(
      unrecoveredAudioFailures.length === 0,
      "音声resource load失敗があります。"
    );
    assertCondition(
      audioConsoleDiagnostics.length === 0,
      "音声再生のconsole errorがあります。"
    );
    assertCondition(report.diagnostics.renderer.length === 0, "renderer error/unhandledrejectionがあります。");
    assertCondition(report.diagnostics.load.length === 0, "renderer load errorがあります。");
    assertCondition(report.diagnostics.renderProcessGone.length === 0, "render-process-goneがあります。");
    assertCondition(report.diagnostics.unresponsive.length === 0, "renderer unresponsiveがあります。");
    addCheck("既定音量5のBGM／SE／VOICE実再生", {
      titleVisible: startedForAudio.titleVisible,
      pointerLockId: startedForAudio.pointerLockId,
      volumeValues: startedForAudio.volumeValues,
      completedCounts: Object.fromEntries(
        ["BGM", "SE", "VOICE"].map((category) => [
          category,
          successfulAudioResources.filter(
            (resource) => resource.category === category
          ).length
        ])
      ),
      failedCount: unrecoveredAudioFailures.length,
      audioConsoleErrorCount: audioConsoleDiagnostics.length
    });
    report.status = "passed";
    return;
  }
  const started = await waitFor(
    "Canvas開始とPointer Lock",
    testWindow,
    (snapshot) =>
      !snapshot.titleVisible && snapshot.pointerLockId === "renderCanvas",
    10_000
  );
  addCheck("Canvas開始とPointer Lock", {
    titleVisible: started.titleVisible,
    pointerLockId: started.pointerLockId
  });

  const selectionSnapshot = await waitForBrainwashSelection(testWindow);
  assertCondition(selectionSnapshot.completionGuideVisible, "選択解放時にG/N/H案内が表示されていません。");
  assertCondition(!selectionSnapshot.crosshairVisible, "brainwash-in-progressで照準が表示されています。");
  addCheck("brainwash-in-progress選択解放HUD", {
    state: parseState(selectionSnapshot.status),
    completionGuideVisible: selectionSnapshot.completionGuideVisible,
    crosshairVisible: selectionSnapshot.crosshairVisible
  });

  const gunSnapshot = await selectCompletionState(
    testWindow,
    "G",
    "brainwash-complete-gun"
  );
  assertCondition(gunSnapshot.crosshairVisible, "gun状態で照準が表示されていません。");
  assertCondition(gunSnapshot.fireGuideVisible, "gun状態で左クリック案内が表示されていません。");
  addCheck("G gun HUD", {
    crosshairVisible: gunSnapshot.crosshairVisible,
    fireGuideVisible: gunSnapshot.fireGuideVisible
  });

  await sendCanvasClick(testWindow);
  let maximumBeamCount = 0;
  const gunFireDeadline = Date.now() + 3_000;
  while (Date.now() < gunFireDeadline) {
    const snapshot = await inspectDom(testWindow);
    maximumBeamCount = Math.max(maximumBeamCount, parseBeamCount(snapshot.status));
    await wait(25);
  }
  assertCondition(maximumBeamCount > 0, "gun状態の左クリックでBEAM生成を確認できません。");
  addCheck("gun左クリック実射撃", { maximumBeamCount });

  const noGunSnapshot = await selectCompletionState(
    testWindow,
    "N",
    "brainwash-complete-no-gun"
  );
  assertCondition(!noGunSnapshot.crosshairVisible, "no-gun状態で照準が表示されています。");
  assertCondition(!noGunSnapshot.fireGuideVisible, "no-gun状態で左クリック案内が表示されています。");
  let noGunMovement = null;
  for (const keyCode of ["W", "D", "S", "A"]) {
    const measured = await measureMovement(testWindow, keyCode, 700);
    if (measured.horizontalDistance > 0.02) {
      noGunMovement = measured;
      break;
    }
  }
  assertCondition(noGunMovement !== null, "no-gun状態で水平移動を確認できません。");
  addCheck("N no-gun移動可とHUD", {
    crosshairVisible: noGunSnapshot.crosshairVisible,
    fireGuideVisible: noGunSnapshot.fireGuideVisible,
    movement: noGunMovement
  });

  const haigureSnapshot = await selectCompletionState(
    testWindow,
    "H",
    "brainwash-complete-haigure"
  );
  assertCondition(!haigureSnapshot.crosshairVisible, "haigure状態で照準が表示されています。");
  assertCondition(!haigureSnapshot.fireGuideVisible, "haigure状態で左クリック案内が表示されています。");
  const haigureMovement = await measureMovement(
    testWindow,
    noGunMovement.keyCode,
    700
  );
  assertCondition(
    haigureMovement.horizontalDistance <= 0.005,
    `haigure状態で水平移動しました: ${haigureMovement.horizontalDistance}`
  );
  addCheck("H haigure移動停止とHUD", {
    crosshairVisible: haigureSnapshot.crosshairVisible,
    fireGuideVisible: haigureSnapshot.fireGuideVisible,
    movement: haigureMovement
  });

  const gunAgainSnapshot = await selectCompletionState(
    testWindow,
    "G",
    "brainwash-complete-gun"
  );
  assertCondition(gunAgainSnapshot.crosshairVisible, "H→G後に照準が再表示されていません。");
  assertCondition(!gunAgainSnapshot.helpText.includes("R:"), "通常状態の左HUDにR案内が表示されています。");
  addCheck("G→N→H→G連続再選択", {
    finalState: parseState(gunAgainSnapshot.status),
    crosshairVisible: gunAgainSnapshot.crosshairVisible,
    helpText: gunAgainSnapshot.helpText
  });

  await sendKey(testWindow, "R");
  await wait(250);
  const ignoredNormalR = await inspectDom(testWindow);
  assertCondition(!ignoredNormalR.titleVisible, "通常状態のRでタイトルへ遷移しました。");
  assertCondition(ignoredNormalR.pointerLockId === "renderCanvas", "通常状態のRでPointer Lockが解除されました。");
  assertCondition(parseState(ignoredNormalR.status) === "brainwash-complete-gun", "通常状態のRでsessionが再生成されました。");
  addCheck("通常状態のR無効とsession維持", {
    state: parseState(ignoredNormalR.status),
    pointerLockId: ignoredNormalR.pointerLockId,
    hudRootCount: ignoredNormalR.hudRootCount,
    volumeRootCount: ignoredNormalR.volumeRootCount
  });

  await sendKey(testWindow, "Enter");
  const returnedTitle = await waitFor(
    "Enterタイトル復帰とsession再生成",
    testWindow,
    (snapshot) =>
      snapshot.titleHint === "左クリック：開始" &&
      snapshot.titleVisible &&
      snapshot.pointerLockId === null &&
      snapshot.hudRootCount === 1 &&
      snapshot.volumeRootCount === 1 &&
      snapshot.characterSettingsRootCount === 1,
    120_000
  );
  const restartedNpcSpawnReport = assertNpcSpawnReport(
    returnedTitle,
    "Enter再生成session"
  );
  addCheck("Enterタイトル復帰とroot重複0", {
    pointerLockId: returnedTitle.pointerLockId,
    hudRootCount: returnedTitle.hudRootCount,
    volumeRootCount: returnedTitle.volumeRootCount,
    characterSettingsRootCount: returnedTitle.characterSettingsRootCount,
    npcSpawn: {
      seed: restartedNpcSpawnReport.sessionSeed,
      playerSpawnId: restartedNpcSpawnReport.playerSpawnId,
      activeBiases: restartedNpcSpawnReport.activeBiases,
      npcCount: restartedNpcSpawnReport.npcCount,
      initialBrainwashedNpcCount:
        restartedNpcSpawnReport.initialBrainwashedNpcCount,
      npcInsideActiveBiasCount:
        restartedNpcSpawnReport.npcInsideActiveBiasCount,
      initialBrainwashedInsideActiveBiasCount:
        restartedNpcSpawnReport.initialBrainwashedInsideActiveBiasCount
    }
  });

  await sendCanvasClick(testWindow);
  const restarted = await waitFor(
    "再開始Pointer Lock",
    testWindow,
    (snapshot) =>
      !snapshot.titleVisible &&
      snapshot.pointerLockId === "renderCanvas" &&
      snapshot.hudRootCount === 1 &&
      snapshot.volumeRootCount === 1 &&
      snapshot.characterSettingsRootCount === 1,
    10_000
  );
  addCheck("再開始とsession root維持", {
    pointerLockId: restarted.pointerLockId,
    hudRootCount: restarted.hudRootCount,
    volumeRootCount: restarted.volumeRootCount,
    characterSettingsRootCount: restarted.characterSettingsRootCount
  });

  await wait(2_000);
  const successfulAudioResources = report.audioResources.completed.filter(
    (resource) => resource.statusCode >= 200 && resource.statusCode < 300
  );
  const completedByCategory = new Set(
    successfulAudioResources.map((resource) => resource.category)
  );
  for (const category of ["BGM", "SE", "VOICE"]) {
    assertCondition(
      completedByCategory.has(category),
      `${category}のresource load完了を確認できません。`
    );
  }
  const successfulAudioUrls = new Set(
    successfulAudioResources.map((resource) => resource.url)
  );
  const unrecoveredAudioFailures = report.audioResources.failed.filter(
    (resource) =>
      resource.error !== "net::ERR_ABORTED" ||
      !successfulAudioUrls.has(resource.url)
  );
  assertCondition(
    unrecoveredAudioFailures.length === 0,
    "音声resource load失敗があります。"
  );
  addCheck("BGM/SE/VOICE resource load", {
    completedCounts: Object.fromEntries(
      ["BGM", "SE", "VOICE"].map((category) => [
        category,
        successfulAudioResources.filter(
          (resource) => resource.category === category
        ).length
      ])
    ),
    ignoredCompletedAbortCount:
      report.audioResources.failed.length - unrecoveredAudioFailures.length,
    failedCount: unrecoveredAudioFailures.length
  });

  assertCondition(report.diagnostics.console.length === 0, "console warning/errorがあります。");
  assertCondition(report.diagnostics.renderer.length === 0, "renderer error/unhandledrejectionがあります。");
  assertCondition(report.diagnostics.load.length === 0, "renderer load errorがあります。");
  assertCondition(report.diagnostics.renderProcessGone.length === 0, "render-process-goneがあります。");
  assertCondition(report.diagnostics.unresponsive.length === 0, "renderer unresponsiveがあります。");
  addCheck("Electron診断0件", {
    console: report.diagnostics.console.length,
    renderer: report.diagnostics.renderer.length,
    load: report.diagnostics.load.length,
    renderProcessGone: report.diagnostics.renderProcessGone.length,
    unresponsive: report.diagnostics.unresponsive.length
  });

  report.status = "passed";
};

run()
  .catch((error) => {
    report.status = "failed";
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  })
  .finally(async () => {
    report.finishedAt = new Date().toISOString();
    process.exitCode = report.status === "passed" ? 0 : 1;
    if (testWindow && !testWindow.isDestroyed()) {
      testWindow.destroy();
    }
    const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
    if (reportPath !== null) {
      fs.writeFileSync(reportPath, serializedReport, "utf8");
    }
    process.stdout.write(serializedReport);
    app.quit();
  });
