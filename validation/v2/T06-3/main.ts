import {
  Engine,
  FreeCamera,
  Logger,
  Scene,
  Vector3
} from "@babylonjs/core";

import {
  createV2MinimapController,
  type V2MinimapController
} from "../../../src/ui/v2Minimap";
import type { StageElevatorSnapshot } from "../../../src/world/stageElevatorRuntime";
import { SCHOOL_STAGE } from "../../../src/world/stageCatalog";
import {
  STAGE_LOCATION_FLOOR_IDS,
  type StageLocationAssetRegistry,
  type StageLocationFloorId
} from "../../../src/world/stageLocationAssets";
import {
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
} from "../../../src/world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicSpatialInitializer
} from "../../../src/world/schoolStageDynamicRuntime";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../../../src/world/stageSpatialContext";
import { runV2MinimapTests } from "./minimap.test";
import { createT063Check, type T063TestResult } from "./testUtils";

import "./style.css";

type T063ValidationState = Readonly<{
  status: "running" | "passed" | "failed";
  checks: readonly T063TestResult[];
  activeFloor: StageLocationFloorId;
}>;

declare global {
  interface Window {
    __T06_3_VALIDATION__: T063ValidationState;
  }
}

const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults = document.querySelector<HTMLOListElement>("#check-results");
const runButton = document.querySelector<HTMLButtonElement>("#run-validation");
const floorButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-floor-id]")];
const renderCanvas = document.getElementById(
  "render-canvas"
) as unknown as HTMLCanvasElement | null;
const minimapCanvas = document.getElementById(
  "minimap-canvas"
) as unknown as HTMLCanvasElement | null;
const minimapReadout = document.querySelector<HTMLElement>("#minimap-readout");

if (
  !summary ||
  !metrics ||
  !checkResults ||
  !runButton ||
  !renderCanvas ||
  !minimapCanvas ||
  !minimapReadout ||
  floorButtons.length !== 5
) {
  throw new Error("T06-3検証UIの必須要素がありません。");
}

const engine = new Engine(renderCanvas, true);
const scene = new Scene(engine);
const camera = new FreeCamera("T063Camera", Vector3.Zero(), scene);
camera.minZ = 0.001;
scene.activeCamera = camera;

const browserErrors: string[] = [];
const browserWarnings: string[] = [];
let validationRunning = false;
let validationHasRun = false;
let activeFloor: StageLocationFloorId = "f01";
let activeStage: StageSpatialContext | null = null;
let activeController: V2MinimapController | null = null;
let visualElapsedSeconds = 100;

const formatIssue = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);

const isFloorId = (value: string | undefined): value is StageLocationFloorId =>
  value !== undefined &&
  STAGE_LOCATION_FLOOR_IDS.includes(value as StageLocationFloorId);

const requireLocationAssets = (): StageLocationAssetRegistry => {
  if (activeStage?.locationAssets === null || !activeStage) {
    throw new Error("表示用location assetsがありません。");
  }
  return activeStage.locationAssets;
};

const getNodePosition = (node: {
  computeWorldMatrix(force?: boolean): unknown;
  getAbsolutePosition(): Vector3;
}) => {
  node.computeWorldMatrix(true);
  return node.getAbsolutePosition().clone();
};

const createElevatorSnapshots = (
  locationAssets: StageLocationAssetRegistry
): readonly StageElevatorSnapshot[] =>
  Object.freeze(
    [...new Set(locationAssets.elevatorLandings.map((landing) => landing.elevatorId))]
      .map((elevatorId) => {
        const stopId = locationAssets.elevatorLandings.find(
          (landing) =>
            landing.elevatorId === elevatorId && landing.stop !== null
        )?.stop?.id;
        if (!stopId) {
          throw new Error(`表示用elevator stopがありません: ${elevatorId}`);
        }
        return Object.freeze({ id: elevatorId, displayStopId: stopId }) as StageElevatorSnapshot;
      })
  );

const renderChecks = (checks: readonly T063TestResult[]) => {
  checkResults.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.dataset.state = check.ok ? "passed" : "failed";
      const heading = document.createElement("strong");
      heading.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name}`;
      const detail = document.createElement("span");
      detail.textContent = check.detail;
      item.append(heading, detail);
      return item;
    })
  );
};

const publishState = (
  status: T063ValidationState["status"],
  checks: readonly T063TestResult[]
) => {
  const passed = checks.filter((check) => check.ok).length;
  summary.dataset.state = status;
  summary.textContent =
    status === "running"
      ? "T06-3専用fixtureを検証しています。"
      : `${passed} / ${checks.length} 項目がPASSしました。`;
  metrics.replaceChildren(
    ...[
      ["検証項目", String(checks.length)],
      ["PASS", String(passed)],
      ["表示階", activeFloor]
    ].flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const definition = document.createElement("dd");
      definition.textContent = value;
      return [term, definition];
    })
  );
  renderChecks(checks);
  window.__T06_3_VALIDATION__ = Object.freeze({
    status,
    checks: Object.freeze(checks),
    activeFloor
  });
  document.documentElement.dataset.validationStatus = status;
  document.body.dataset.activeFloor = activeFloor;
};

const failCompletedValidation = (detail: string) => {
  if (document.documentElement.dataset.validationStatus !== "passed") {
    return;
  }
  const checks = Object.freeze([
    ...window.__T06_3_VALIDATION__.checks,
    createT063Check("完了後ブラウザ異常監視", false, detail)
  ]);
  publishState("failed", checks);
};

window.addEventListener("error", (event) => {
  const detail = formatIssue(event.error ?? event.message);
  browserErrors.push(detail);
  failCompletedValidation(`error: ${detail}`);
});
window.addEventListener("unhandledrejection", (event) => {
  const detail = formatIssue(event.reason);
  browserErrors.push(detail);
  failCompletedValidation(`unhandledrejection: ${detail}`);
});
const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  const detail = values.map(formatIssue).join(" ");
  browserErrors.push(detail);
  failCompletedValidation(`console.error: ${detail}`);
  originalConsoleError(...values);
};
const originalConsoleWarn = console.warn.bind(console);
console.warn = (...values: unknown[]) => {
  const detail = values.map(formatIssue).join(" ");
  browserWarnings.push(detail);
  failCompletedValidation(`console.warn: ${detail}`);
  originalConsoleWarn(...values);
};

const selectDisplayPosition = (
  locationAssets: StageLocationAssetRegistry,
  floorId: StageLocationFloorId
): Vector3 => {
  const elevator = locationAssets.elevatorLandings.find(
    (landing) => landing.floorId === floorId
  );
  if (elevator) {
    return getNodePosition(elevator.node);
  }
  const stair = locationAssets.stairLandings.find(
    (landing) => landing.floorId === floorId
  );
  if (stair) {
    return getNodePosition(stair.node);
  }
  const mission = locationAssets.missionLocations.find(
    (location) => location.floorId === floorId
  );
  if (!mission) {
    throw new Error(`表示用位置がありません: ${floorId}`);
  }
  return getNodePosition(mission.anchorNode);
};

const renderActiveFloor = () => {
  if (!activeController) {
    return;
  }
  const locationAssets = requireLocationAssets();
  const position = selectDisplayPosition(locationAssets, activeFloor);
  const eyePosition = position.add(new Vector3(0, 0.12, 0));
  const forward = new Vector3(0, 0, -1);
  camera.position.copyFrom(eyePosition);
  camera.setTarget(eyePosition.add(forward));
  camera.getViewMatrix(true);
  const missionLocation = locationAssets.missionLocations.find(
    (location) =>
      location.floorId === activeFloor &&
      Vector3.DistanceSquared(
        getNodePosition(location.anchorNode),
        position
      ) <= 2.25 * 2.25
  );
  visualElapsedSeconds += 0.2;
  activeController.update({
    active: true,
    elapsedSeconds: visualElapsedSeconds,
    playerFootPosition: position,
    playerEyePosition: eyePosition,
    forward,
    actors: Object.freeze([]),
    elevators: createElevatorSnapshots(locationAssets),
    missionTargetActorIds: Object.freeze([]),
    missionTargetLocationIds: Object.freeze(
      missionLocation ? [missionLocation.id] : []
    )
  });
  for (const button of floorButtons) {
    const selected = button.dataset.floorId === activeFloor;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  const state = window.__T06_3_VALIDATION__;
  if (state) {
    publishState(state.status, state.checks);
  }
};

const disposeFixture = () => {
  activeController?.dispose();
  activeController = null;
  activeStage?.dispose();
  activeStage = null;
};

const runValidation = async () => {
  if (validationRunning) {
    return;
  }
  validationRunning = true;
  if (validationHasRun) {
    browserErrors.length = 0;
    browserWarnings.length = 0;
  }
  validationHasRun = true;
  runButton.disabled = true;
  disposeFixture();
  publishState("running", Object.freeze([]));
  const loggerErrorsAtStart = Logger.errorsCount;
  const checks: T063TestResult[] = [];
  try {
    activeStage = await loadStageSpatialContext(scene, SCHOOL_STAGE, {
      initializeDynamicSpatial:
        createSchoolStageDynamicSpatialInitializer(0x063063),
      roomVariantSelections: SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
    });
    await scene.whenReadyAsync(true);
    checks.push(
      ...runV2MinimapTests({
        scene,
        camera,
        canvas: minimapCanvas,
        readout: minimapReadout,
        stage: activeStage
      })
    );
    const locationAssets = requireLocationAssets();
    activeController = createV2MinimapController({
      canvas: minimapCanvas,
      readout: minimapReadout,
      camera,
      locationAssets,
      queries: activeStage.queries
    });
    renderActiveFloor();
  } catch (error) {
    checks.push(createT063Check("T06-3検証処理", false, formatIssue(error)));
  }
  const loggerErrorCount = Logger.errorsCount - loggerErrorsAtStart;
  checks.push(
    createT063Check(
      "ブラウザ・console・Babylon異常監視",
      browserErrors.length === 0 &&
        browserWarnings.length === 0 &&
        loggerErrorCount === 0,
      `Babylon Logger=${loggerErrorCount} / errors=${browserErrors.join(" | ") || "なし"} / ` +
        `warnings=${browserWarnings.join(" | ") || "なし"}`
    )
  );
  const status = checks.every((check) => check.ok) ? "passed" : "failed";
  publishState(status, Object.freeze(checks));
  validationRunning = false;
  runButton.disabled = false;
};

for (const button of floorButtons) {
  button.addEventListener("click", () => {
    if (!isFloorId(button.dataset.floorId)) {
      throw new Error(`表示階IDが不正です: ${button.dataset.floorId ?? "なし"}`);
    }
    activeFloor = button.dataset.floorId;
    renderActiveFloor();
  });
}
runButton.addEventListener("click", () => void runValidation());
window.addEventListener("beforeunload", () => {
  disposeFixture();
  scene.dispose();
  engine.dispose();
});

publishState("running", Object.freeze([]));
void runValidation();
