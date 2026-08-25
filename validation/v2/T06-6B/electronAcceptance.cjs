const { app, BrowserWindow } = require("electron");

const applicationUrl = new URL(
  process.argv[process.argv.indexOf("--url") + 1]
);
if (
  applicationUrl.hostname !== "localhost" &&
  applicationUrl.hostname !== "127.0.0.1"
) {
  throw new Error("--urlにはローカルVite URLが必要です。");
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const diagnostics = {
  console: [],
  load: [],
  renderProcessGone: [],
  unresponsive: []
};

const waitFor = async (label, window, predicate, timeoutMilliseconds) => {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const snapshot = await window.webContents.executeJavaScript(`(() => ({
      startupPhase: document.body.dataset.v2StartupPhase ?? null,
      titleMode: document.querySelector("#titleMode")?.textContent ?? null,
      titleVersion: document.querySelector("#titleVersion")?.textContent ?? null,
      titleMessageText: document.querySelector("#titleMessage")?.textContent ?? null,
      titleOverlayVisible: getComputedStyle(document.querySelector("#titleOverlay")).display !== "none",
      statusText: document.querySelector("#statusInfo")?.textContent ?? "",
      missionHudCount: document.querySelectorAll('[data-v2-mission-hud="root"]').length,
      modeButtonText: document.querySelector('[data-ui="title-instant-execution-toggle-button"]')?.textContent ?? null,
      modeButtonClass: document.querySelector('[data-ui="title-instant-execution-toggle-button"]')?.className ?? null,
      titleSettingsText: document.querySelector('.v2-title-settings')?.textContent ?? null,
      sectionTitleFontSize: (() => {
        const element = document.querySelector('.v2-title-settings__section-title');
        return element === null ? null : getComputedStyle(element).fontSize;
      })(),
      settingsRowFontSize: (() => {
        const element = document.querySelector('.v2-title-settings__row');
        return element === null ? null : getComputedStyle(element).fontSize;
      })(),
      normalNpcVisible: (() => {
        const element = document.querySelector('[data-ui="v2-settings-npc-count"]');
        return element !== null && getComputedStyle(element).display !== "none" && element.getClientRects().length > 0;
      })(),
      executionMethodVisible: (() => {
        const element = document.querySelector('[data-ui="v2-settings-execution-method"]');
        return element !== null && getComputedStyle(element).display !== "none" && element.getClientRects().length > 0;
      })(),
      featureResources: JSON.parse(document.body.dataset.v2FeatureResources ?? "null")
    }))()`);
    lastSnapshot = snapshot;
    if (predicate(snapshot)) {
      return snapshot;
    }
    await wait(100);
  }
  throw new Error(
    `${label}が${timeoutMilliseconds}ms以内に完了しませんでした: ` +
      JSON.stringify({ lastSnapshot, diagnostics })
  );
};

const sendClick = async (window, selector) => {
  const point = await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) {
      throw new Error("操作対象がありません: " + ${JSON.stringify(selector)});
    }
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`);
  window.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
  window.webContents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
};

let testWindow = null;
let failed = false;

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch(
  "disable-features",
  "CalculateNativeWinOcclusion"
);
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  try {
    testWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        partition: `t06-6b-acceptance-${process.pid}`
      }
    });
    testWindow.setMenuBarVisibility(false);
    const runtimeSession = testWindow.webContents.session;
    runtimeSession.setPermissionCheckHandler(
      (_webContents, permission) => permission === "pointerLock"
    );
    runtimeSession.setPermissionRequestHandler(
      (_webContents, permission, callback) =>
        callback(permission === "pointerLock")
    );
    testWindow.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        if (level >= 2) {
          diagnostics.console.push({ level, message, line, sourceId });
        }
      }
    );
    testWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        diagnostics.load.push({
          errorCode,
          errorDescription,
          validatedUrl,
          isMainFrame
        });
      }
    );
    testWindow.webContents.on("render-process-gone", (_event, details) => {
      diagnostics.renderProcessGone.push(details);
    });
    testWindow.webContents.on("unresponsive", () => {
      diagnostics.unresponsive.push({ at: new Date().toISOString() });
    });

    await testWindow.loadURL(applicationUrl.toString());
    testWindow.show();
    testWindow.focus();
    const normalTitle = await waitFor(
      "通常タイトル",
      testWindow,
      (snapshot) =>
        snapshot.startupPhase === "running" &&
        snapshot.modeButtonText === "いきなり公開処刑モードに変更",
      120_000
    );
    if (
      normalTitle.titleMode !== "サバイバルモード" ||
      normalTitle.titleVersion !== "ver.2.0.0" ||
      normalTitle.titleMessageText !== "NOW LOADING" ||
      !normalTitle.normalNpcVisible ||
      normalTitle.executionMethodVisible ||
      !normalTitle.modeButtonClass.includes("v2-title-settings__mode-button--instant") ||
      normalTitle.sectionTitleFontSize !== "15px" ||
      normalTitle.settingsRowFontSize !== "13px" ||
      !normalTitle.titleSettingsText.includes("キャラクター") ||
      !normalTitle.titleSettingsText.includes("ミッション") ||
      !normalTitle.titleSettingsText.includes("アラーム") ||
      !normalTitle.titleSettingsText.includes("音量")
    ) {
      throw new Error("通常タイトルの表示契約が不正です。");
    }
    process.stdout.write("[T06-6B Electron] PASS 通常タイトル\n");

    await sendClick(
      testWindow,
      '[data-ui="title-instant-execution-toggle-button"]'
    );
    const instantTitle = await waitFor(
      "即時公開処刑タイトル",
      testWindow,
      (snapshot) =>
        snapshot.titleMode === "いきなり公開処刑" &&
        snapshot.modeButtonText === "サバイバルモードに変更",
      10_000
    );
    if (
      instantTitle.normalNpcVisible ||
      !instantTitle.executionMethodVisible ||
      !instantTitle.modeButtonClass.includes("v2-title-settings__mode-button--survival") ||
      !instantTitle.titleSettingsText.includes("プレイヤーをビットが処刑")
    ) {
      throw new Error("即時公開処刑タイトルの右側切替が不正です。");
    }
    process.stdout.write("[T06-6B Electron] PASS モード切替\n");

    await sendClick(testWindow, "#renderCanvas");
    const execution = await waitFor(
      "即時公開処刑Runtime",
      testWindow,
      (snapshot) =>
        !snapshot.titleOverlayVisible &&
        snapshot.statusText.includes("フェーズ execution"),
      120_000
    );
    const assemblyVenueId = execution.statusText.match(/集合地点 ([^\s]+)/)?.[1];
    if (
      !/NPC 11\s+BIT 10/.test(execution.statusText) ||
      !execution.statusText.includes("状態 evade") ||
      execution.missionHudCount !== 1 ||
      (assemblyVenueId !== "assembly-courtyard" &&
        assemblyVenueId !== "assembly-gym")
    ) {
      throw new Error(`即時公開処刑Runtime契約が不正です: ${execution.statusText}`);
    }
    process.stdout.write(
      `[T06-6B Electron] PASS 即時公開処刑 ${assemblyVenueId} NPC11 BIT10\n`
    );

    await waitFor(
      "即時公開処刑完了",
      testWindow,
      (snapshot) => snapshot.statusText.includes("フェーズ execution-complete"),
      120_000
    );

    testWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "R" });
    testWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "R" });
    await wait(500);
    const replay = await waitFor(
      "R再演",
      testWindow,
      (snapshot) => snapshot.statusText.includes("フェーズ execution"),
      10_000
    );
    if (!replay.statusText.includes(`集合地点 ${assemblyVenueId}`)) {
      throw new Error("R再演で会場が変わりました。");
    }
    process.stdout.write("[T06-6B Electron] PASS R再演scenario維持\n");
    await waitFor(
      "R再演完了",
      testWindow,
      (snapshot) => snapshot.statusText.includes("フェーズ execution-complete"),
      120_000
    );

    const remainingMethods = [
      { id: "player-npc", npcCount: 11, bitCount: 0, playerState: "evade" },
      { id: "npc-bit", npcCount: 12, bitCount: 10, playerState: "brainwash-complete-haigure-formation" },
      { id: "npc-npc", npcCount: 12, bitCount: 0, playerState: "brainwash-complete-haigure-formation" },
      { id: "npc-player", npcCount: 12, bitCount: 0, playerState: "brainwash-complete-gun" }
    ];
    for (const method of remainingMethods) {
      testWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      testWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      await waitFor(
        `${method.id}タイトル復帰`,
        testWindow,
        (snapshot) =>
          snapshot.startupPhase === "running" &&
          snapshot.titleOverlayVisible &&
          snapshot.modeButtonText === "サバイバルモードに変更",
        120_000
      );
      await testWindow.webContents.executeJavaScript(`(() => {
        const select = document.querySelector('[data-ui="v2-settings-execution-method"]');
        if (!(select instanceof HTMLSelectElement)) {
          throw new Error("公開処刑方式selectがありません。");
        }
        select.value = ${JSON.stringify(method.id)};
        select.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await sendClick(testWindow, "#renderCanvas");
      const methodExecution = await waitFor(
        `${method.id}公開処刑`,
        testWindow,
        (snapshot) =>
          !snapshot.titleOverlayVisible &&
          snapshot.statusText.includes("フェーズ execution") &&
          new RegExp(`NPC ${method.npcCount}\\s+BIT ${method.bitCount}`).test(
            snapshot.statusText
          ) &&
          snapshot.statusText.includes(`状態 ${method.playerState}`),
        120_000
      );
      if (
        !new RegExp(`NPC ${method.npcCount}\\s+BIT ${method.bitCount}`).test(
          methodExecution.statusText
        ) ||
        !methodExecution.statusText.includes(`状態 ${method.playerState}`)
      ) {
        throw new Error(
          `${method.id}の人口またはPlayer roleが不正です: ${methodExecution.statusText}`
        );
      }
      process.stdout.write(
        `[T06-6B Electron] PASS ${method.id} NPC${method.npcCount} BIT${method.bitCount} ${method.playerState}\n`
      );
      if (method.id === "npc-player") {
        for (let shot = 0; shot < 8; shot += 1) {
          await sendClick(testWindow, "#renderCanvas");
          await wait(500);
        }
      }
      await waitFor(
        `${method.id}公開処刑完了`,
        testWindow,
        (snapshot) => snapshot.statusText.includes("フェーズ execution-complete"),
        120_000
      );
    }

    testWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    testWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await waitFor(
      "機能組合せ用タイトル復帰",
      testWindow,
      (snapshot) =>
        snapshot.startupPhase === "running" &&
        snapshot.titleOverlayVisible &&
        snapshot.modeButtonText === "サバイバルモードに変更",
      120_000
    );
    await sendClick(
      testWindow,
      '[data-ui="title-instant-execution-toggle-button"]'
    );
    await waitFor(
      "サバイバルモード切替",
      testWindow,
      (snapshot) =>
        snapshot.titleMode === "サバイバルモード" &&
        snapshot.modeButtonText === "いきなり公開処刑モードに変更",
      10_000
    );

    const featureCombinations = [
      { missionEnabled: false, alarmEnabled: false },
      { missionEnabled: false, alarmEnabled: true },
      { missionEnabled: true, alarmEnabled: false },
      { missionEnabled: true, alarmEnabled: true }
    ];
    for (const combination of featureCombinations) {
      await testWindow.webContents.executeJavaScript(`(() => {
        const mission = document.querySelector('[data-ui="v2-settings-mission-enabled"]');
        const alarm = document.querySelector('[data-ui="v2-settings-alarm-enabled"]');
        const playerBrainwashed = document.querySelector('[data-ui="v2-settings-player-brainwashed"]');
        if (!(mission instanceof HTMLInputElement) || !(alarm instanceof HTMLInputElement) || !(playerBrainwashed instanceof HTMLInputElement)) {
          throw new Error("Mission／Alarm／Player初期洗脳checkboxがありません。");
        }
        mission.checked = ${combination.missionEnabled};
        mission.dispatchEvent(new Event("change", { bubbles: true }));
        alarm.checked = ${combination.alarmEnabled};
        alarm.dispatchEvent(new Event("change", { bubbles: true }));
        playerBrainwashed.checked = true;
        playerBrainwashed.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await sendClick(testWindow, "#renderCanvas");
      const resources = await waitFor(
        `Mission ${combination.missionEnabled}/Alarm ${combination.alarmEnabled}`,
        testWindow,
        (snapshot) =>
          !snapshot.titleOverlayVisible &&
          snapshot.statusText.includes("フェーズ playing") &&
          snapshot.featureResources?.missionRuntime === combination.missionEnabled &&
          snapshot.featureResources?.broadcastRuntime === !combination.missionEnabled &&
          snapshot.featureResources?.alarmSystem === combination.alarmEnabled &&
          snapshot.featureResources?.alarmFloorVisual === combination.alarmEnabled &&
          snapshot.featureResources?.missionHud === combination.missionEnabled,
        120_000
      );
      if (
        resources.missionHudCount !== (combination.missionEnabled ? 1 : 0) ||
        resources.featureResources.alarmCandidateProvider !==
          combination.alarmEnabled
      ) {
        throw new Error(
          `Mission／Alarm組合せの生成資源が不正です: ${JSON.stringify(resources)}`
        );
      }
      process.stdout.write(
        `[T06-6B Electron] PASS Mission ${combination.missionEnabled ? "ON" : "OFF"} / Alarm ${combination.alarmEnabled ? "ON" : "OFF"}\n`
      );
      if (combination !== featureCombinations[featureCombinations.length - 1]) {
        testWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
        testWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
        await waitFor(
          "通常epilogue",
          testWindow,
          (snapshot) => snapshot.statusText.includes("フェーズ assembly"),
          10_000
        );
        testWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
        testWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
        await waitFor(
          "次の機能組合せ用タイトル",
          testWindow,
          (snapshot) =>
            snapshot.startupPhase === "running" &&
            snapshot.titleOverlayVisible &&
            snapshot.modeButtonText === "いきなり公開処刑モードに変更",
          120_000
        );
      }
    }

    if (
      diagnostics.console.length > 0 ||
      diagnostics.load.length > 0 ||
      diagnostics.renderProcessGone.length > 0 ||
      diagnostics.unresponsive.length > 0
    ) {
      throw new Error(`Electron診断が0件ではありません: ${JSON.stringify(diagnostics)}`);
    }
    process.stdout.write("[T06-6B Electron] PASS console/load/process異常 0件\n");
  } catch (error) {
    failed = true;
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  } finally {
    if (testWindow !== null && !testWindow.isDestroyed()) {
      testWindow.hide();
      await testWindow.loadURL("about:blank");
      await wait(500);
      testWindow.destroy();
    }
    app.exit(failed ? 1 : 0);
  }
});
