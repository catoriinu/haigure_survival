import "../style.css";

import {
  Color3,
  Color4,
  Engine,
  Frustum,
  FreeCamera,
  HemisphericLight,
  Scene,
  Vector3
} from "@babylonjs/core";

import { SCHOOL_STAGE } from "../world/stageCatalog";
import {
  SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
} from "../world/schoolRuntimeSettings";
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

const performanceScenario =
  readV2PerformanceScenario(location.search);
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
  let ownedInput: V2PlayerInput | null = null;
  let ownedPlayer: V2PlayerController | null = null;
  let ownedSurvival: V2SurvivalRuntime | null = null;

  try {
    ownedStage = await loadStageSpatialContext(
      scene,
      SCHOOL_STAGE,
      {
        queryDiagnostics: stageQueryDiagnostics,
        roomVariantSelections:
          SCHOOL_ALL_NORMAL_ROOM_VARIANT_SELECTIONS
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
      random: performanceScenario
        ? createV2SeededRandom(performanceScenario.seed)
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
      population: performanceScenario
        ? V2_PERFORMANCE_ACCEPTANCE_POPULATION
        : V2_TEST_SURVIVAL_POPULATION,
      performanceDiagnostics,
      performanceWorkloadScenario: performanceScenario
    });
    await scene.whenReadyAsync();
    const visualPreparation =
      ownedSurvival.prepareVisualResources();
    scene.render();
    await visualPreparation;
    return {
      stage: ownedStage,
      player: ownedPlayer,
      survival: ownedSurvival
    };
  } catch (error) {
    console.error("V2実行環境の初期化に失敗しました。", error);
    titleStartHint.textContent = "読込エラー";
    titleMessage.textContent = formatLoadError(error);
    ownedSurvival?.dispose();
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

const { stage, player, survival } = await initializeRuntime();

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
        `視認 ${survivalFrame.visualTargetCount}  ` +
        `警戒対象 ${survivalFrame.alertTargetCount}  ` +
        `共有 ${survivalFrame.activeAlertCount}\n` +
        `警報 稼働 ${survivalFrame.activeAlarmCount}  ` +
        `点滅 ${survivalFrame.alarmBlinkCount}  ` +
        `発報 ${survivalFrame.alarmTriggerCount}\n` +
        `着弾 壁 ${survivalFrame.blockerImpactCount}  ` +
        `標的 ${survivalFrame.actorImpactCount}` +
        performanceText;
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
  survival.dispose();
  player.dispose();
  stage.dispose();
  scene.dispose();
  engine.dispose();
};

window.addEventListener("beforeunload", disposeRuntime, { once: true });
