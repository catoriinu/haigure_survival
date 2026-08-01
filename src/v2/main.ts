import "../style.css";

import {
  Color3,
  Color4,
  Engine,
  Frustum,
  FreeCamera,
  HemisphericLight,
  Ray,
  Scene,
  Vector3
} from "@babylonjs/core";

import { SCHOOL_STAGE } from "../world/stageCatalog";
import {
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS,
  createSchoolRoomVariantSelections,
  createSchoolRuntimeRandom,
  createSchoolRuntimeSettings
} from "../world/schoolRuntimeSettings";
import {
  createSchoolStageDynamicRuntime,
  createSchoolStageDynamicSpatialInitializer,
  type SchoolStageDynamicRuntime
} from "../world/schoolStageDynamicRuntime";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../world/stageSpatialContext";
import {
  createV2PerformanceDiagnostics,
  createV2SeededRandom,
  readV2PerformanceScenario,
  V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS
} from "./performanceDiagnostics";
import {
  createV2AlarmFloorVisualSystem,
  V2_ALARM_FLOOR_VISUALIZATION_ENABLED,
  type V2AlarmFloorVisualSystem
} from "./alarmFloorVisualSystem";
import {
  createV2PlayerController,
  type V2PlayerController
} from "./playerController";
import {
  createV2PlayerInput,
  type V2PlayerInput
} from "./playerInput";
import {
  createV2SurvivalRuntime,
  V2_PERFORMANCE_ACCEPTANCE_POPULATION,
  V2_TEST_SURVIVAL_POPULATION,
  type V2SurvivalRuntime
} from "./survivalRuntime";
import {
  createSchoolStageActorPort,
  createSchoolStageTraversalCoordinator,
  type SchoolStageTraversalCoordinator
} from "./schoolStageTraversalCoordinator";
import {
  createSchoolNpcNavigationPolicy,
  type SchoolNpcNavigationPolicy
} from "./schoolNpcNavigationPolicy";
import {
  readV2RuntimeStressScenario,
  type V2RuntimeStressReport
} from "./runtimeStressScenario";

const performanceScenario =
  readV2PerformanceScenario(location.search);
const runtimeStressScenario =
  readV2RuntimeStressScenario(location.search);
const rampValidationTarget = (() => {
  const requested = new URLSearchParams(location.search).get(
    "rampValidation"
  );
  if (requested === null || requested === "gym" || requested === "school") {
    return requested;
  }
  throw new Error("rampValidationにはgymまたはschoolが必要です。");
})();
if (
  [performanceScenario, runtimeStressScenario, rampValidationTarget].filter(
    (scenario) => scenario !== null
  ).length > 1
) {
  throw new Error(
    "performance、schoolStress、rampValidationは同時に実行できません。"
  );
}
const runtimeSeed =
  performanceScenario?.seed ?? runtimeStressScenario?.seed ?? 0;
const runtimePopulation = performanceScenario
  ? V2_PERFORMANCE_ACCEPTANCE_POPULATION
  : rampValidationTarget
    ? Object.freeze({
        npcCount: 0,
        initialBrainwashedNpcCount: 0,
        bitCount: 0
      })
    : runtimeStressScenario?.population ??
      V2_TEST_SURVIVAL_POPULATION;
const roomVariantSelections = runtimeStressScenario
  ? createSchoolRoomVariantSelections(
      createSchoolRuntimeSettings(2),
      runtimeStressScenario.seed
    )
  : SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS;
const canvas = document.getElementById("renderCanvas") as unknown as HTMLCanvasElement;
const minimapCanvas = document.getElementById(
  "minimapCanvas"
) as unknown as HTMLCanvasElement;
const minimapReadout = document.getElementById("minimapReadout") as HTMLDivElement;
const statusInfo = document.getElementById("statusInfo") as HTMLDivElement;
const helpPanel = document.getElementById("helpPanel") as HTMLDivElement;
const staminaGauge = document.getElementById("staminaGauge") as HTMLDivElement;
const titleOverlay = document.getElementById("titleOverlay") as HTMLDivElement;
const titleHeading = document.getElementById("titleHeading") as HTMLDivElement;
const titleStartHint = document.getElementById("titleStartHint") as HTMLDivElement;
const titleMessage = document.getElementById("titleMessage") as HTMLDivElement;
const titleMode = document.getElementById("titleMode") as HTMLDivElement;
const titleVersion = document.getElementById("titleVersion") as HTMLDivElement;

if (performanceScenario) {
  canvas.style.width = "1920px";
  canvas.style.height = "1080px";
}
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const performanceDiagnostics = performanceScenario
  ? createV2PerformanceDiagnostics(
      engine,
      scene,
      performanceScenario,
      V2_PERFORMANCE_ACCEPTANCE_POPULATION
    )
  : null;
if (performanceDiagnostics) {
  window.__v2PerformanceDiagnostics =
    performanceDiagnostics;
}
const stageRayQueryKinds = [
  "movement",
  "beam",
  "sight",
  "ground"
] as const;
const stageQueryDiagnostics = performanceDiagnostics
  ? Object.freeze({
      recordRayQuery: (
        kind: "movement" | "beam" | "sight" | "ground",
        candidateMeshCount: number,
        directIntersectionCount: number
      ) => {
        performanceDiagnostics.count(`ray.${kind}.queries`);
        performanceDiagnostics.count(
          `ray.${kind}.candidates`,
          candidateMeshCount
        );
        performanceDiagnostics.count(
          `ray.${kind}.intersections`,
          directIntersectionCount
        );
      },
      recordRayTriangleQuery: (
        kind: "movement" | "beam" | "sight" | "ground",
        indexedTriangleCount: number,
        exactTriangleTestCount: number
      ) => {
        performanceDiagnostics.count(
          `ray.${kind}.indexed-triangles`,
          indexedTriangleCount
        );
        performanceDiagnostics.count(
          `ray.${kind}.exact-triangle-tests`,
          exactTriangleTestCount
        );
      },
      recordNavigationAreaQuery: (
        kind: "locate" | "advance",
        testedPortalCount: number,
        transitioned: boolean,
        durationMilliseconds: number
      ) => {
        performanceDiagnostics.count(`area.${kind}.queries`);
        performanceDiagnostics.count(
          `area.${kind}.portal-tests`,
          testedPortalCount
        );
        performanceDiagnostics.count(
          `area.${kind}.transitions`,
          transitioned ? 1 : 0
        );
        performanceDiagnostics.count(
          `area.${kind}.milliseconds`,
          durationMilliseconds
        );
      }
    })
  : undefined;
scene.collisionsEnabled = true;
scene.clearColor = new Color4(0.48, 0.72, 0.92, 1);

const camera = new FreeCamera("V2PlayerCamera", Vector3.Zero(), scene);
camera.minZ = 0.02;
camera.angularSensibility = 1500;
camera.speed = 0;
scene.activeCamera = camera;

const ambientLight = new HemisphericLight(
  "V2SchoolAmbientLight",
  new Vector3(0.35, 1, -0.25),
  scene
);
ambientLight.intensity = 0.9;
ambientLight.groundColor = new Color3(0.16, 0.2, 0.22);

titleHeading.textContent = "HAIGURE SURVIVAL V2";
titleStartHint.textContent = "";
titleMessage.textContent = "学校3D空間を読み込んでいます";
titleMode.textContent = "学校3Dサバイバル基盤";
titleVersion.textContent = "V2 3D SPATIAL RUNTIME";
titleOverlay.style.display = "flex";
minimapCanvas.style.display = "none";
minimapReadout.style.display = "none";
staminaGauge.style.display = "none";
statusInfo.style.display = "none";
helpPanel.style.display = "none";

const formatLoadError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const initializeRuntime = async () => {
  let ownedStage: StageSpatialContext | null = null;
  let ownedDynamicRuntime: SchoolStageDynamicRuntime | null =
    null;
  let ownedTraversalCoordinator:
    | SchoolStageTraversalCoordinator
    | null = null;
  let ownedInput: V2PlayerInput | null = null;
  let ownedPlayer: V2PlayerController | null = null;
  let ownedSurvival: V2SurvivalRuntime | null = null;
  let ownedAlarmFloorVisual: V2AlarmFloorVisualSystem | null =
    null;
  let selectNavigationRoute: SchoolNpcNavigationPolicy | null =
    null;

  try {
    ownedStage = await loadStageSpatialContext(
      scene,
      SCHOOL_STAGE,
      {
        queryDiagnostics: stageQueryDiagnostics,
        initializeDynamicSpatial:
          createSchoolStageDynamicSpatialInitializer(
            runtimeSeed
          ),
        roomVariantSelections
      }
    );
    ownedInput = createV2PlayerInput(window);
    ownedPlayer = createV2PlayerController({
      scene,
      camera,
      stage: ownedStage,
      input: ownedInput
    });
    const playerController = ownedPlayer;
    ownedInput = null;
    ownedSurvival = createV2SurvivalRuntime({
      scene,
      stage: ownedStage,
      player: playerController,
      random: performanceScenario || runtimeStressScenario
        ? createV2SeededRandom(runtimeSeed)
        : Math.random,
      getOrbVisibilityPredicate: () => {
        const playerCenter = playerController
          .getFootPosition()
          .add(playerController.getEyePosition())
          .scale(0.5);
        const activeCamera = scene.activeCamera;
        if (!activeCamera) {
          throw new Error(
            "オーブ表示判定にはSceneのactive cameraが必要です"
          );
        }
        const frustumPlanes = Frustum.GetPlanes(
          activeCamera.getTransformationMatrix()
        );
        return (position: Vector3) =>
          Vector3.DistanceSquared(position, playerCenter) <= 25 &&
          Frustum.IsPointInFrustum(position, frustumPlanes);
      },
      population: runtimePopulation,
      performanceDiagnostics,
      performanceWorkloadScenario: performanceScenario,
      releaseStageTraversalForScriptedPhase: () => {
        if (ownedTraversalCoordinator === null) {
          throw new Error(
            "実学校traversal coordinatorの初期化前にphase解放が要求されました。"
          );
        }
        ownedTraversalCoordinator.releaseForScriptedPhase();
      },
      selectNavigationRoute: (context, candidates) => {
        if (selectNavigationRoute === null) {
          throw new Error(
            "実学校NPC経路policyの初期化前に経路選択が要求されました。"
          );
        }
        return selectNavigationRoute(context, candidates);
      }
    });
    const survivalRuntime = ownedSurvival;
    if (V2_ALARM_FLOOR_VISUALIZATION_ENABLED) {
      ownedAlarmFloorVisual =
        createV2AlarmFloorVisualSystem(scene);
    }
    ownedDynamicRuntime = createSchoolStageDynamicRuntime({
      staticActiveSet: ownedStage.staticSpatialActiveSet,
      doorAssets: ownedStage.doorAssets,
      elevatorAssets: ownedStage.elevatorAssets,
      dynamicVariants: ownedStage.dynamicVariants,
      queries: ownedStage.queries,
      actors: createSchoolStageActorPort(
        playerController,
        survivalRuntime
      )
    });
    selectNavigationRoute = createSchoolNpcNavigationPolicy({
      seed: runtimeSeed,
      elevatorAssets: ownedStage.elevatorAssets,
      dynamicRuntime: ownedDynamicRuntime,
      queries: ownedStage.queries,
      getHumanTargets: () =>
        survivalRuntime.getHumanTargets()
    });
    ownedTraversalCoordinator =
      createSchoolStageTraversalCoordinator({
        stage: ownedStage,
        runtime: ownedDynamicRuntime,
        survival: survivalRuntime,
        player: playerController,
        doorCloseRandom: createSchoolRuntimeRandom(
          runtimeSeed,
          "door-behavior"
        )
      });
    if (runtimeStressScenario) {
      const initialFrame = survivalRuntime.getFrame();
      if (
        initialFrame.npcCount !==
          runtimeStressScenario.population.npcCount ||
        initialFrame.brainwashedNpcCount !==
          runtimeStressScenario.population
            .initialBrainwashedNpcCount ||
        initialFrame.bitCount !==
          runtimeStressScenario.population.bitCount
      ) {
        throw new Error(
          "実学校stressの初期人口が要求値と一致しません。"
        );
      }
    }
    await scene.whenReadyAsync();
    const visualPreparation =
      ownedSurvival.prepareVisualResources();
    scene.render();
    await visualPreparation;
    return {
      stage: ownedStage,
      dynamicRuntime: ownedDynamicRuntime,
      traversalCoordinator: ownedTraversalCoordinator,
      player: ownedPlayer,
      survival: ownedSurvival,
      alarmFloorVisual: ownedAlarmFloorVisual,
      navigationPolicy: selectNavigationRoute
    };
  } catch (error) {
    console.error("V2実行環境の初期化に失敗しました。", error);
    titleStartHint.textContent = "読込エラー";
    titleMessage.textContent = formatLoadError(error);
    ownedTraversalCoordinator?.dispose();
    ownedDynamicRuntime?.dispose();
    ownedAlarmFloorVisual?.dispose();
    ownedSurvival?.dispose();
    selectNavigationRoute?.dispose();
    ownedPlayer?.dispose();
    ownedInput?.dispose();
    ownedStage?.dispose();
    performanceDiagnostics?.dispose();
    delete window.__v2PerformanceDiagnostics;
    scene.dispose();
    engine.dispose();
    throw error;
  }
};

const {
  stage,
  dynamicRuntime,
  traversalCoordinator,
  player,
  survival,
  alarmFloorVisual,
  navigationPolicy
} =
  await initializeRuntime();

camera.attachControl(canvas, true);
canvas.tabIndex = 0;
titleMessage.textContent = "学校3D空間 読込完了";
titleStartHint.textContent = "左クリック：開始";
titleStartHint.style.display = "block";
titleMessage.style.display = "none";

let started = false;
let statusTimer = 0;
let elapsedSeconds = 0;
let performanceReportPublished = false;
const runtimeStressStartedAt = runtimeStressScenario
  ? performance.now()
  : null;
const runtimeStressInitialFrame = runtimeStressScenario
  ? survival.getFrame()
  : null;
const runtimeStressInitialBrainwashedNpcCount =
  runtimeStressInitialFrame?.brainwashedNpcCount ?? 0;
let runtimeStressFrameCount = 0;
let runtimeStressStatus: V2RuntimeStressReport["status"] =
  "running";

if (rampValidationTarget) {
  const colliderName =
    rampValidationTarget === "gym"
      ? "COL_B03_GymRoofEscapeCrateRamp"
      : "COL_B03_SchoolRoofEscapeCrateRamp";
  const rampCollider = stage.resources.normalColliders.find(
    (mesh) => mesh.name === colliderName
  );
  if (!rampCollider) {
    throw new Error(`箱山登坂検証対象がありません: ${colliderName}`);
  }
  rampCollider.computeWorldMatrix(true);
  const bounds = rampCollider.getBoundingInfo().boundingBox;
  const placement =
    rampValidationTarget === "gym"
      ? Object.freeze({
          start: new Vector3(
            bounds.minimumWorld.x - 0.05,
            bounds.minimumWorld.y + 0.005,
            bounds.centerWorld.z
          ),
          end: new Vector3(
            bounds.maximumWorld.x - 0.025,
            bounds.maximumWorld.y,
            bounds.centerWorld.z
          )
        })
      : Object.freeze({
          start: new Vector3(
            bounds.maximumWorld.x + 0.05,
            bounds.minimumWorld.y - 0.02,
            bounds.centerWorld.z
          ),
          end: new Vector3(
            bounds.minimumWorld.x + 0.025,
            bounds.maximumWorld.y,
            bounds.centerWorld.z
          )
        });
  document.body.dataset.rampValidationPlacement = JSON.stringify({
    target: rampValidationTarget,
    bounds: {
      minimum: bounds.minimumWorld.asArray(),
      maximum: bounds.maximumWorld.asArray()
    },
    start: placement.start.asArray(),
    end: placement.end.asArray(),
    supportHits: scene
      .multiPickWithRay(
        new Ray(
          placement.start.add(new Vector3(0, 0.2, 0)),
          Vector3.Down(),
          0.4
        ),
        (mesh) =>
          stage.resources.normalColliders.some(
            (collider) => collider === mesh
          )
      )
      ?.map((hit) => ({
        mesh: hit.pickedMesh?.name ?? null,
        point: hit.pickedPoint?.asArray() ?? null,
        normal: hit.getNormal(true, false)?.asArray() ?? null
      })) ?? []
  });
  player.placeAt(placement.start, placement.end);
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = "block";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `箱山登坂検証 ${rampValidationTarget}\n` +
    "W: 登坂  Shift: ダッシュ";
}

const publishRuntimeStressReport = (
  status: V2RuntimeStressReport["status"],
  error: string | null
) => {
  if (
    runtimeStressScenario === null ||
    runtimeStressStartedAt === null
  ) {
    return;
  }
  const currentFrame = survival.getFrame();
  const report: V2RuntimeStressReport = Object.freeze({
    status,
    profile: runtimeStressScenario.profile,
    seed: runtimeStressScenario.seed,
    durationSeconds: runtimeStressScenario.durationSeconds,
    wallElapsedSeconds:
      (performance.now() - runtimeStressStartedAt) / 1000,
    simulationElapsedSeconds: elapsedSeconds,
    frameCount: runtimeStressFrameCount,
    population: runtimeStressScenario.population,
    initialNpcCount:
      runtimeStressInitialFrame?.npcCount ?? 0,
    initialBrainwashedNpcCount:
      runtimeStressInitialBrainwashedNpcCount,
    initialBitCount:
      runtimeStressInitialFrame?.bitCount ?? 0,
    currentNpcCount: currentFrame.npcCount,
    currentBrainwashedNpcCount:
      currentFrame.brainwashedNpcCount,
    currentBitCount: currentFrame.bitCount,
    phase: currentFrame.phase,
    spatialRevision: stage.queries.revision,
    error
  });
  document.body.dataset.v2RuntimeStressReport =
    JSON.stringify(report);
  document.documentElement.dataset.validationStatus =
    status;
};

const configurePerformanceView = () => {
  if (!performanceScenario) {
    return;
  }
  const courtyardVenue = stage.assemblyVenues.all.find(
    (venue) =>
      venue.anchor.node.name ===
      "MRK_AssemblyAnchor_Courtyard"
  );
  if (!courtyardVenue) {
    throw new Error(
      "性能シナリオ用の校庭集合会場がありません。"
    );
  }
  const footPosition = player.getFootPosition();
  const courtyardDirection =
    courtyardVenue.center.subtract(footPosition);
  courtyardDirection.y = 0;
  if (courtyardDirection.lengthSquared() === 0) {
    throw new Error(
      "性能シナリオの校庭方向を決定できません。"
    );
  }
  const lookAtPosition =
    performanceScenario.view === "courtyard"
      ? footPosition.add(courtyardDirection)
      : footPosition.subtract(courtyardDirection);
  player.placeAt(footPosition, lookAtPosition);
};

const startPlay = () => {
  if (!started) {
    started = true;
    titleOverlay.style.display = "none";
    statusInfo.style.display = "block";
    helpPanel.style.display = "block";
    helpPanel.textContent = "操作説明\nWASD: 移動\nShift: ダッシュ";
  }
  canvas.focus();
  void (canvas as unknown as Element)
    .requestPointerLock()
    .catch((error: unknown) => {
      console.error("ポインターロックの要求に失敗しました。", error);
    });
};

const handleCanvasClick = () => {
  const wasStarted = started;
  const hadPointerLock =
    document.pointerLockElement ===
    (canvas as unknown as Element);
  startPlay();
  if (wasStarted && hadPointerLock) {
    const direction = camera.getDirection(
      Vector3.Forward(scene.useRightHandedSystem)
    );
    survival.requestPlayerGunFire(direction);
  }
};

canvas.addEventListener("click", handleCanvasClick);

if (performanceScenario) {
  configurePerformanceView();
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = "block";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `性能受入計測\nseed ${performanceScenario.seed}\n` +
    `view ${performanceScenario.view}`;
}
if (runtimeStressScenario) {
  started = true;
  titleOverlay.style.display = "none";
  statusInfo.style.display = "block";
  helpPanel.style.display = "block";
  helpPanel.textContent =
    `実学校stress ${runtimeStressScenario.profile}\n` +
    `seed ${runtimeStressScenario.seed}\n` +
    `NPC ${runtimeStressScenario.population.npcCount} / ` +
    `初期洗脳 ${runtimeStressScenario.population.initialBrainwashedNpcCount} / ` +
    `BIT ${runtimeStressScenario.population.bitCount}`;
  publishRuntimeStressReport("running", null);
}

engine.runRenderLoop(() => {
  try {
    performanceDiagnostics?.beginFrame();
    if (performanceDiagnostics) {
      for (const kind of stageRayQueryKinds) {
        performanceDiagnostics.count(`ray.${kind}.queries`, 0);
        performanceDiagnostics.count(
          `ray.${kind}.candidates`,
          0
        );
        performanceDiagnostics.count(
          `ray.${kind}.intersections`,
          0
        );
        performanceDiagnostics.count(
          `ray.${kind}.indexed-triangles`,
          0
        );
        performanceDiagnostics.count(
          `ray.${kind}.exact-triangle-tests`,
          0
        );
      }
    }
    const delta = performanceScenario
      ? V2_PERFORMANCE_TARGET_FRAME_INTERVAL_MS / 1000
      : Math.min(engine.getDeltaTime() / 1000, 0.05);
    traversalCoordinator.update(delta);
    const playerFrame = performanceDiagnostics
      ? performanceDiagnostics.measure("player", () =>
          player.update(
            delta,
            started && survival.canPlayerMove()
          )
        )
      : player.update(
          delta,
          started && survival.canPlayerMove()
        );
    let survivalFrame = survival.getFrame();
    if (started) {
      elapsedSeconds += delta;
      survivalFrame = performanceDiagnostics
        ? performanceDiagnostics.measure(
            "survival",
            () => survival.update(delta, elapsedSeconds)
          )
        : survival.update(delta, elapsedSeconds);
    }
    alarmFloorVisual?.update({
      frame: survivalFrame.alarm,
      playerFootPosition: playerFrame.footPosition,
      elapsedSeconds
    });
    if (runtimeStressScenario) {
      runtimeStressFrameCount += 1;
      if (
        runtimeStressStatus === "running" &&
        runtimeStressStartedAt !== null &&
        (performance.now() - runtimeStressStartedAt) / 1000 >=
          runtimeStressScenario.durationSeconds
      ) {
        runtimeStressStatus = "passed";
        publishRuntimeStressReport(runtimeStressStatus, null);
      }
    }
    statusTimer += delta;
    if (statusTimer >= 0.1) {
      statusTimer = 0;
      const foot = playerFrame.footPosition;
      const performanceProgress =
        performanceDiagnostics?.getProgress();
      if (
        performanceDiagnostics &&
        performanceProgress?.status === "complete" &&
        !performanceReportPublished
      ) {
        document.body.dataset.v2PerformanceReport =
          JSON.stringify(performanceDiagnostics.getReport());
        performanceReportPublished = true;
      }
      const performanceText = performanceProgress
        ? `\nPERF ${performanceProgress.status} ` +
          `${performanceProgress.elapsedSeconds.toFixed(1)}s  ` +
          `${performanceProgress.renderWidth}x` +
          `${performanceProgress.renderHeight}`
        : "";
      statusInfo.textContent =
        `学校3D空間\n` +
        `X ${foot.x.toFixed(3)}  Y ${foot.y.toFixed(3)}  Z ${foot.z.toFixed(3)}\n` +
        `${playerFrame.verticalState.grounded ? "接地" : "空中"}\n` +
        `フェーズ ${survivalFrame.phase}  ` +
        `状態 ${survivalFrame.playerState}\n` +
        `集合地点 ${survivalFrame.assemblyVenueId}\n` +
        `NPC ${survivalFrame.npcCount}  BIT ${survivalFrame.bitCount}  ` +
        `BEAM ${survivalFrame.activeBeamCount}\n` +
        `NPC内訳 未洗脳 ${survivalFrame.npcHudCounts.unbrainwashed}  ` +
        `ハイグレ ${survivalFrame.npcHudCounts.haigure}  ` +
        `gun ${survivalFrame.npcHudCounts.gun}  ` +
        `no-gun ${survivalFrame.npcHudCounts.noGun}\n` +
        `視認 ${survivalFrame.visualTargetCount}  ` +
        `警戒対象 ${survivalFrame.alertTargetCount}  ` +
        `共有 ${survivalFrame.activeAlertCount}\n` +
        `プレイヤー標的 NPC ${survivalFrame.npcPlayerTargetCount}  ` +
        `BIT ${survivalFrame.bitPlayerTargetCount}\n` +
        `警報 稼働 ${survivalFrame.activeAlarmCount}  ` +
        `点滅 ${survivalFrame.alarmBlinkCount}  ` +
        `発報 ${survivalFrame.alarmTriggerCount}\n` +
        `着弾 壁 ${survivalFrame.blockerImpactCount}  ` +
        `標的 ${survivalFrame.actorImpactCount}` +
        performanceText;
      if (runtimeStressScenario) {
        publishRuntimeStressReport(runtimeStressStatus, null);
      }
    }
    if (performanceDiagnostics) {
      performanceDiagnostics.measure("render", () => {
        scene.render();
      });
      performanceDiagnostics.finishFrame();
    } else {
      scene.render();
    }
  } catch (error) {
    engine.stopRenderLoop();
    runtimeStressStatus = "failed";
    publishRuntimeStressReport(
      runtimeStressStatus,
      formatLoadError(error)
    );
    console.error("V2ゲーム更新中に例外が発生したため、更新を停止しました。", error);
    throw error;
  }
});

const resize = () => engine.resize();
window.addEventListener("resize", resize);

let disposed = false;
const disposeRuntime = () => {
  if (disposed) {
    return;
  }
  disposed = true;
  engine.stopRenderLoop();
  window.removeEventListener("resize", resize);
  canvas.removeEventListener("click", handleCanvasClick);
  performanceDiagnostics?.dispose();
  delete window.__v2PerformanceDiagnostics;
  delete document.body.dataset.v2PerformanceReport;
  delete document.body.dataset.v2RuntimeStressReport;
  if (runtimeStressScenario) {
    delete document.documentElement.dataset.validationStatus;
  }
  traversalCoordinator.dispose();
  dynamicRuntime.dispose();
  alarmFloorVisual?.dispose();
  survival.dispose();
  navigationPolicy.dispose();
  player.dispose();
  stage.dispose();
  scene.dispose();
  engine.dispose();
};

window.addEventListener("beforeunload", disposeRuntime, { once: true });
