import {
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  Logger,
  Mesh,
  MeshBuilder,
  Scene,
  Vector3
} from "@babylonjs/core";
import {
  buildStageContext,
  disposeStageContext,
  type StageContext
} from "../../../src/world/stageContext";
import {
  createPlayerHeightController,
  type PlayerVerticalState
} from "../../../src/game/playerHeight";
import { cellToWorld } from "../../../src/game/gridUtils";
import {
  loadStageDefinition,
  type StageSelection
} from "../../../src/world/stageSelection";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type ValidationState = {
  status: "running" | "passed" | "failed";
  checks: CheckResult[];
};

declare global {
  interface Window {
    __T03_VALIDATION__: ValidationState;
  }
}

const flatSelection: StageSelection = {
  id: "t03_flat_procedural",
  label: "T03 平面回帰検証",
  definitionPath: `${import.meta.env.BASE_URL}fixtures/flat_procedural.json`
};
const glbSelection: StageSelection = {
  id: "t01_glb_collision_course",
  label: "T01 立体テストコース",
  definitionPath: `${import.meta.env.BASE_URL}fixtures/t01_glb_collision_course.json`
};

const playerWidth = 0.2;
const playerHeight = (700 / 330) * playerWidth;
const eyeHeight = 0.25;
const gravity = 2.4525;
const maxStepHeight = 0.0375;
const groundTolerance = 0.004;
const groundSnapDistance = 0.0415;
const minGroundNormalY = Math.SQRT1_2;
const fixedDelta = 1 / 60;
const fixedHorizontalStep = 0.0015;

const browserErrors: string[] = [];
const formatError = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);
window.addEventListener("error", (event) => {
  browserErrors.push(formatError(event.error ?? event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  browserErrors.push(`unhandledrejection: ${formatError(event.reason)}`);
});
const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  browserErrors.push(values.map(formatError).join(" "));
  originalConsoleError(...values);
};

const canvas = document.getElementById(
  "render-canvas"
) as unknown as HTMLCanvasElement;
const summary = document.getElementById("summary") as HTMLElement;
const metrics = document.getElementById("metrics") as HTMLElement;
const results = document.getElementById("results") as HTMLOListElement;
const runButton = document.getElementById("run-validation") as HTMLButtonElement;
const loadFlatButton = document.getElementById("load-flat") as HTMLButtonElement;
const loadGlbButton = document.getElementById("load-glb") as HTMLButtonElement;
const allButtons = Array.from(document.querySelectorAll("button"));

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true
});
const scene = new Scene(engine);
scene.collisionsEnabled = true;
scene.clearColor = new Color4(0.025, 0.045, 0.07, 1);
const camera = new FreeCamera("T03Camera", new Vector3(0, eyeHeight, 0), scene);
camera.minZ = 0.02;
camera.angularSensibility = 1500;
camera.inputs.removeByType("FreeCameraKeyboardMoveInput");
camera.attachControl(canvas, true);
const light = new HemisphericLight("T03Light", new Vector3(-0.4, 1, -0.2), scene);
light.intensity = 1.25;

const playerCollisionMesh = new Mesh("T03PlayerCollision", scene);
playerCollisionMesh.isVisible = false;
playerCollisionMesh.isPickable = false;
playerCollisionMesh.checkCollisions = true;
playerCollisionMesh.ellipsoid = new Vector3(
  playerWidth * 0.5,
  playerHeight * 0.5,
  playerWidth * 0.5
);
playerCollisionMesh.ellipsoidOffset = new Vector3(0, playerHeight * 0.5, 0);
const playerHeightMotion = createPlayerHeightController(scene, {
  gravity,
  maxStepHeight,
  groundTolerance,
  groundSnapDistance,
  minGroundNormalY
});

let currentContext: StageContext | null = null;
let currentSelection: StageSelection | null = null;
let running = false;
const pressedKeys = new Set<string>();
const manualDisplacement = Vector3.Zero();

const createCheck = (name: string, ok: boolean, detail: string): CheckResult => ({
  name,
  ok,
  detail
});

const nearlyEqual = (actual: number, expected: number, tolerance = groundTolerance) =>
  Math.abs(actual - expected) <= tolerance;

const blenderToBabylon = (x: number, y: number, z: number) =>
  new Vector3(-x * 0.25, z * 0.25, -y * 0.25);

const getColliderSet = () =>
  new Set(currentContext?.resources.colliders ?? []);

const addValidationCollider = (mesh: Mesh) => {
  mesh.checkCollisions = true;
  mesh.visibility = 0;
  mesh.computeWorldMatrix(true);
  currentContext!.resources.colliders.push(mesh);
  playerCollisionMesh.surroundingMeshes = currentContext!.resources.colliders;
};

const removeValidationCollider = (mesh: Mesh) => {
  const colliderIndex = currentContext!.resources.colliders.indexOf(mesh);
  currentContext!.resources.colliders.splice(colliderIndex, 1);
  playerCollisionMesh.surroundingMeshes = currentContext!.resources.colliders;
  mesh.dispose();
};

const syncCamera = () => {
  camera.position.set(
    playerCollisionMesh.position.x,
    playerCollisionMesh.position.y + eyeHeight,
    playerCollisionMesh.position.z
  );
};

const teleport = (position: Vector3) => {
  playerCollisionMesh.position.copyFrom(position);
  playerHeightMotion.resync(playerCollisionMesh, getColliderSet());
  syncCamera();
};

const loadStage = async (selection: StageSelection) => {
  const definition = await loadStageDefinition(selection);
  const nextContext = await buildStageContext(scene, definition);
  const previousContext = currentContext;
  currentContext = nextContext;
  currentSelection = selection;
  playerCollisionMesh.surroundingMeshes = nextContext.resources.colliders;
  const spawn = cellToWorld(nextContext.layout, nextContext.layout.spawn, 0);
  teleport(spawn);
  if (previousContext) {
    disposeStageContext(previousContext);
  }
  scene.clearColor =
    nextContext.environment.skyColor ?? new Color4(0.025, 0.045, 0.07, 1);
  await scene.whenReadyAsync(true);
  scene.render();
};

const renderMetrics = () => {
  const state = playerHeightMotion.getState();
  const values: Array<[string, string]> = [
    ["ステージ", currentSelection?.id ?? "なし"],
    ["足元", `(${playerCollisionMesh.position.x.toFixed(4)}, ${playerCollisionMesh.position.y.toFixed(4)}, ${playerCollisionMesh.position.z.toFixed(4)})`],
    ["接地", String(state.grounded)],
    ["支持面Y", state.supportY === null ? "なし" : state.supportY.toFixed(6)],
    ["垂直速度", state.verticalVelocity.toFixed(6)],
    ["支持Mesh", playerHeightMotion.getSupportMeshName() ?? "なし"]
  ];
  metrics.replaceChildren();
  for (const [term, description] of values) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = description;
    metrics.append(dt, dd);
  }
};

const renderResults = (checks: CheckResult[]) => {
  results.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.className = check.ok ? "pass" : "fail";
      item.textContent = `${check.ok ? "PASS" : "FAIL"}: ${check.name} — ${check.detail}`;
      return item;
    })
  );
  const failed = checks.filter((check) => !check.ok).length;
  summary.textContent = `全${checks.length}項目 / PASS ${checks.length - failed} / FAIL ${failed}`;
};

const runStationaryFrames = (frameCount: number) => {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let airborneFrames = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const result = playerHeightMotion.move(
      playerCollisionMesh,
      Vector3.Zero(),
      fixedDelta,
      getColliderSet()
    );
    minY = Math.min(minY, playerCollisionMesh.position.y);
    maxY = Math.max(maxY, playerCollisionMesh.position.y);
    if (!result.state.grounded) {
      airborneFrames += 1;
    }
  }
  return { minY, maxY, airborneFrames };
};

const runLinearMotion = (direction: Vector3, distance: number) => {
  const normalized = direction.normalizeToNew();
  const frames = Math.ceil(distance / fixedHorizontalStep);
  let airborneFrames = 0;
  let firstAirbornePosition: string | null = null;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let frame = 0; frame < frames; frame += 1) {
    const remaining = distance - fixedHorizontalStep * frame;
    const displacement = normalized.scale(
      Math.min(fixedHorizontalStep, remaining)
    );
    const result = playerHeightMotion.move(
      playerCollisionMesh,
      displacement,
      fixedDelta,
      getColliderSet()
    );
    minY = Math.min(minY, playerCollisionMesh.position.y);
    maxY = Math.max(maxY, playerCollisionMesh.position.y);
    if (!result.state.grounded) {
      airborneFrames += 1;
      firstAirbornePosition ??=
        `(${playerCollisionMesh.position.y.toFixed(6)}, ${playerCollisionMesh.position.z.toFixed(6)})`;
    }
  }
  syncCamera();
  scene.render();
  return { frames, airborneFrames, firstAirbornePosition, minY, maxY };
};

const runValidation = async () => {
  if (running) {
    return;
  }
  running = true;
  allButtons.forEach((button) => {
    button.disabled = true;
  });
  browserErrors.length = 0;
  const loggerErrorsAtStart = Logger.errorsCount;
  const checks: CheckResult[] = [];
  window.__T03_VALIDATION__ = { status: "running", checks };
  summary.textContent = "検証中";
  results.replaceChildren();

  try {
    await loadStage(flatSelection);
    const flatFloorCount = currentContext!.resources.colliders.filter((mesh) =>
      mesh.name.startsWith("floor_")
    ).length;
    const flatStable = runStationaryFrames(120);
    const flatState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "procedural-grid床衝突",
        flatFloorCount > 0 && flatState.grounded,
        `floorCollider=${flatFloorCount}, grounded=${flatState.grounded}, support=${playerHeightMotion.getSupportMeshName()}`
      ),
      createCheck(
        "procedural-grid平面静止",
        flatStable.airborneFrames === 0 && flatStable.maxY - flatStable.minY <= groundTolerance,
        `Y=${flatStable.minY.toFixed(6)}..${flatStable.maxY.toFixed(6)}, airborne=${flatStable.airborneFrames}`
      )
    );

    await loadStage(glbSelection);
    teleport(blenderToBabylon(0, -1, 0));
    const floorStable = runStationaryFrames(180);
    checks.push(
      createCheck(
        "T01 GLB床静止",
        floorStable.airborneFrames === 0 && floorStable.maxY - floorStable.minY <= groundTolerance,
        `Y=${floorStable.minY.toFixed(6)}..${floorStable.maxY.toFixed(6)}, support=${playerHeightMotion.getSupportMeshName()}`
      )
    );

    const fallStart = blenderToBabylon(0, -1, 0);
    fallStart.y = 0.1;
    teleport(fallStart);
    let landingFrame = -1;
    let landingY = Number.NaN;
    for (let frame = 0; frame < 120; frame += 1) {
      const result = playerHeightMotion.move(
        playerCollisionMesh,
        Vector3.Zero(),
        fixedDelta,
        getColliderSet()
      );
      if (result.state.grounded) {
        landingFrame = frame;
        landingY = playerCollisionMesh.position.y;
        break;
      }
    }
    const landingState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "空中からの着地フレーム同期",
        landingFrame >= 0 &&
          landingState.grounded &&
          landingState.supportY !== null &&
          nearlyEqual(landingState.supportY, 0) &&
          landingY - landingState.supportY <= groundTolerance,
        `frame=${landingFrame}, footY=${landingY.toFixed(6)}, supportY=${landingState.supportY?.toFixed(6)}, velocity=${landingState.verticalVelocity.toFixed(6)}`
      )
    );

    const discontinuousSlopeAngle = Math.PI / 9;
    const discontinuousSlopeDepth = 0.4;
    const discontinuousSlopeThickness = 0.02;
    const discontinuousSlope = MeshBuilder.CreateBox(
      "T03_DiscontinuousSlope",
      {
        width: 0.4,
        height: discontinuousSlopeThickness,
        depth: discontinuousSlopeDepth
      },
      scene
    );
    discontinuousSlope.rotation.x = discontinuousSlopeAngle;
    discontinuousSlope.position.set(
      0.35,
      0.08 -
        (discontinuousSlopeThickness * 0.5) *
          Math.cos(discontinuousSlopeAngle) +
        (discontinuousSlopeDepth * 0.5) *
          Math.sin(discontinuousSlopeAngle),
      -0.1
    );
    addValidationCollider(discontinuousSlope);
    teleport(new Vector3(0.35, 0, 0.25));
    const discontinuousStartZ = playerCollisionMesh.position.z;
    const discontinuousMotion = runLinearMotion(
      new Vector3(0, 0, -1),
      0.45
    );
    const discontinuousState = playerHeightMotion.getState();
    const discontinuousAdvance =
      discontinuousStartZ - playerCollisionMesh.position.z;
    checks.push(
      createCheck(
        "不連続斜面の最大段差拒否",
        discontinuousState.grounded &&
          discontinuousState.supportY !== null &&
          nearlyEqual(discontinuousState.supportY, 0) &&
          discontinuousMotion.maxY <= groundTolerance &&
          discontinuousAdvance < 0.45 - groundTolerance,
        `advance=${discontinuousAdvance.toFixed(6)}, footY=${playerCollisionMesh.position.y.toFixed(6)}, maxY=${discontinuousMotion.maxY.toFixed(6)}, supportY=${discontinuousState.supportY?.toFixed(6)}, mesh=${playerHeightMotion.getSupportMeshName()}`
      )
    );
    removeValidationCollider(discontinuousSlope);

    teleport(blenderToBabylon(0, 0.6, 0));
    const stepUp = runLinearMotion(new Vector3(0, 0, -1), 0.35);
    const stepState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "0.15m段差上昇",
        stepState.grounded &&
          stepState.supportY !== null &&
          nearlyEqual(stepState.supportY, 0.0375) &&
          stepUp.airborneFrames === 0 &&
          playerHeightMotion.getSupportMeshName() === "COL_Step015",
        `foot=(${playerCollisionMesh.position.y.toFixed(6)}, ${playerCollisionMesh.position.z.toFixed(6)}), Y=${stepUp.minY.toFixed(6)}..${stepUp.maxY.toFixed(6)}, supportY=${stepState.supportY?.toFixed(6)}, airborne=${stepUp.airborneFrames}, firstAir=${stepUp.firstAirbornePosition}, mesh=${playerHeightMotion.getSupportMeshName()}`
      )
    );
    const stepDown = runLinearMotion(new Vector3(0, 0, 1), 0.35);
    const stepDownState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "0.15m段差下降",
        stepDownState.grounded &&
          stepDownState.supportY !== null &&
          nearlyEqual(stepDownState.supportY, 0) &&
          stepDown.airborneFrames === 0,
        `foot=(${playerCollisionMesh.position.y.toFixed(6)}, ${playerCollisionMesh.position.z.toFixed(6)}), supportY=${stepDownState.supportY?.toFixed(6)}, airborne=${stepDown.airborneFrames}, mesh=${playerHeightMotion.getSupportMeshName()}`
      )
    );

    teleport(blenderToBabylon(-3, 0.6, 0));
    const slopeUp = runLinearMotion(new Vector3(0, 0, -1), 1.22);
    const slopeTopState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "左斜面上昇と踊り場移行",
        slopeTopState.grounded &&
          slopeTopState.supportY !== null &&
          nearlyEqual(slopeTopState.supportY, 0.2) &&
          slopeUp.airborneFrames === 0,
        `foot=(${playerCollisionMesh.position.y.toFixed(6)}, ${playerCollisionMesh.position.z.toFixed(6)}), Y=${slopeUp.minY.toFixed(6)}..${slopeUp.maxY.toFixed(6)}, supportY=${slopeTopState.supportY?.toFixed(6)}, airborne=${slopeUp.airborneFrames}, mesh=${playerHeightMotion.getSupportMeshName()}`
      )
    );
    const slopeLandingStable = runStationaryFrames(120);
    checks.push(
      createCheck(
        "斜面踊り場静止",
        slopeLandingStable.airborneFrames === 0 &&
          slopeLandingStable.maxY - slopeLandingStable.minY <= groundTolerance,
        `Y=${slopeLandingStable.minY.toFixed(6)}..${slopeLandingStable.maxY.toFixed(6)}`
      )
    );
    const slopeDown = runLinearMotion(new Vector3(0, 0, 1), 1.22);
    const slopeBottomState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "左斜面下降",
        slopeBottomState.grounded &&
          slopeBottomState.supportY !== null &&
          nearlyEqual(slopeBottomState.supportY, 0) &&
          slopeDown.airborneFrames === 0,
        `footY=${playerCollisionMesh.position.y.toFixed(6)}, supportY=${slopeBottomState.supportY?.toFixed(6)}, airborne=${slopeDown.airborneFrames}`
      )
    );

    teleport(blenderToBabylon(3, 0.6, 0));
    const stairUp = runLinearMotion(new Vector3(0, 0, -1), 1.05);
    const stairTopState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "COL_StairRamp上昇と踊り場移行",
        stairTopState.grounded &&
          stairTopState.supportY !== null &&
          nearlyEqual(stairTopState.supportY, 0.225) &&
          stairUp.airborneFrames === 0,
        `foot=(${playerCollisionMesh.position.y.toFixed(6)}, ${playerCollisionMesh.position.z.toFixed(6)}), Y=${stairUp.minY.toFixed(6)}..${stairUp.maxY.toFixed(6)}, supportY=${stairTopState.supportY?.toFixed(6)}, airborne=${stairUp.airborneFrames}, firstAir=${stairUp.firstAirbornePosition}, mesh=${playerHeightMotion.getSupportMeshName()}`
      )
    );
    const stairLandingStable = runStationaryFrames(120);
    checks.push(
      createCheck(
        "階段踊り場静止",
        stairLandingStable.airborneFrames === 0 &&
          stairLandingStable.maxY - stairLandingStable.minY <= groundTolerance,
        `Y=${stairLandingStable.minY.toFixed(6)}..${stairLandingStable.maxY.toFixed(6)}`
      )
    );
    const stairDown = runLinearMotion(new Vector3(0, 0, 1), 1.05);
    const stairBottomState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "COL_StairRamp下降",
        stairBottomState.grounded &&
          stairBottomState.supportY !== null &&
          nearlyEqual(stairBottomState.supportY, 0) &&
          stairDown.airborneFrames === 0,
        `footY=${playerCollisionMesh.position.y.toFixed(6)}, supportY=${stairBottomState.supportY?.toFixed(6)}, airborne=${stairDown.airborneFrames}`
      )
    );

    teleport(blenderToBabylon(0, 6, 0));
    runLinearMotion(new Vector3(0, 0, -1), 0.5);
    checks.push(
      createCheck(
        "壁停止",
        playerCollisionMesh.position.z >= -1.604,
        `stopZ=${playerCollisionMesh.position.z.toFixed(6)}, expected>=-1.604`
      )
    );

    const lowCeilingUnderside = playerHeight + 0.03;
    const lowCeiling = MeshBuilder.CreateBox(
      "T03_LowCeilingStepGuard",
      { width: 0.6, height: 0.05, depth: 0.4 },
      scene
    );
    lowCeiling.position.set(0, lowCeilingUnderside + 0.025, -0.35);
    addValidationCollider(lowCeiling);
    teleport(blenderToBabylon(0, 0.6, 0));
    const lowCeilingStartZ = playerCollisionMesh.position.z;
    runLinearMotion(new Vector3(0, 0, -1), 0.35);
    const lowCeilingState = playerHeightMotion.getState();
    const lowCeilingAdvance =
      lowCeilingStartZ - playerCollisionMesh.position.z;
    checks.push(
      createCheck(
        "低天井下の段差再試行停止",
        lowCeilingState.grounded &&
          lowCeilingState.supportY !== null &&
          nearlyEqual(lowCeilingState.supportY, 0) &&
          playerCollisionMesh.position.y <= groundTolerance &&
          playerCollisionMesh.position.y + playerHeight <=
            lowCeilingUnderside + groundTolerance &&
          lowCeilingAdvance < 0.35 - groundTolerance,
        `advance=${lowCeilingAdvance.toFixed(6)}, footY=${playerCollisionMesh.position.y.toFixed(6)}, topY=${(playerCollisionMesh.position.y + playerHeight).toFixed(6)}, ceilingY=${lowCeilingUnderside.toFixed(6)}, grounded=${lowCeilingState.grounded}, supportY=${lowCeilingState.supportY?.toFixed(6)}`
      )
    );
    removeValidationCollider(lowCeiling);

    await loadStage(flatSelection);
    const finalFlatState = playerHeightMotion.getState();
    checks.push(
      createCheck(
        "JSON→GLB→JSON切替後の接地",
        finalFlatState.grounded &&
          finalFlatState.supportY !== null &&
          nearlyEqual(finalFlatState.supportY, 0),
        `grounded=${finalFlatState.grounded}, supportY=${finalFlatState.supportY?.toFixed(6)}, mesh=${playerHeightMotion.getSupportMeshName()}`
      )
    );

    await loadStage(glbSelection);
    teleport(blenderToBabylon(0, -1, 0));
  } catch (error) {
    checks.push(createCheck("検証処理", false, formatError(error)));
  } finally {
    await scene.whenReadyAsync(true);
    const loggerErrors = Logger.errorsCount - loggerErrorsAtStart;
    checks.push(
      createCheck(
        "ブラウザ・Babylonエラー監視",
        browserErrors.length === 0 && loggerErrors === 0,
        `Babylon Logger=${loggerErrors}, browser=${browserErrors.join(" | ") || "なし"}`
      )
    );
    const failed = checks.some((check) => !check.ok);
    window.__T03_VALIDATION__ = {
      status: failed ? "failed" : "passed",
      checks
    };
    renderResults(checks);
    renderMetrics();
    running = false;
    allButtons.forEach((button) => {
      button.disabled = false;
    });
  }
};

const manualPositions: Record<string, Vector3> = {
  spawn: blenderToBabylon(0, -1, 0),
  step: blenderToBabylon(0, 0.6, 0),
  "slope-low": blenderToBabylon(-3, 0.6, 0),
  "slope-high": blenderToBabylon(-3, 5.2, 0.8),
  "stair-low": blenderToBabylon(3, 0.6, 0),
  "stair-high": blenderToBabylon(3, 4.2, 0.9),
  wall: blenderToBabylon(0, 6, 0)
};

runButton.addEventListener("click", () => void runValidation());
loadFlatButton.addEventListener("click", () => void loadStage(flatSelection));
loadGlbButton.addEventListener("click", () => void loadStage(glbSelection));
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-position]"
)) {
  button.addEventListener("click", () => {
    if (currentSelection?.id !== glbSelection.id) {
      return;
    }
    teleport(manualPositions[button.dataset.position!]);
    renderMetrics();
  });
}
window.addEventListener("keydown", (event) => {
  pressedKeys.add(event.code);
});
window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
});
window.addEventListener("resize", () => engine.resize());

engine.runRenderLoop(() => {
  if (!running && currentContext) {
    let moveX = 0;
    let moveZ = 0;
    if (pressedKeys.has("KeyW")) {
      moveZ += 1;
    }
    if (pressedKeys.has("KeyS")) {
      moveZ -= 1;
    }
    if (pressedKeys.has("KeyD")) {
      moveX += 1;
    }
    if (pressedKeys.has("KeyA")) {
      moveX -= 1;
    }
    manualDisplacement.set(0, 0, 0);
    if (moveX !== 0 || moveZ !== 0) {
      const yaw = camera.rotation.y;
      const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      manualDisplacement.addInPlace(forward.scale(moveZ));
      manualDisplacement.addInPlace(right.scale(moveX));
      manualDisplacement.normalize();
      manualDisplacement.scaleInPlace(
        0.0632455532 * (engine.getDeltaTime() / 1000)
      );
    }
    playerHeightMotion.move(
      playerCollisionMesh,
      manualDisplacement,
      engine.getDeltaTime() / 1000,
      getColliderSet()
    );
    syncCamera();
    renderMetrics();
  }
  scene.render();
});

void runValidation();
