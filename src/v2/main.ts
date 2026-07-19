import "../style.css";

import {
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  Scene,
  Vector3
} from "@babylonjs/core";

import { SCHOOL_STAGE } from "../world/stageCatalog";
import {
  loadStageSpatialContext,
  type StageSpatialContext
} from "../world/stageSpatialContext";
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
  type V2SurvivalRuntime
} from "./survivalRuntime";

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

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.collisionsEnabled = true;
scene.clearColor = new Color4(0.035, 0.045, 0.065, 1);

const camera = new FreeCamera("V2PlayerCamera", Vector3.Zero(), scene);
camera.minZ = 0.02;
camera.angularSensibility = 1500;
camera.speed = 0;
scene.activeCamera = camera;

const ambientLight = new HemisphericLight(
  "V2SchoolAmbientLight",
  Vector3.Up(),
  scene
);
ambientLight.intensity = 0.8;

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
    ownedStage = await loadStageSpatialContext(scene, SCHOOL_STAGE);
    ownedInput = createV2PlayerInput(window);
    ownedPlayer = createV2PlayerController({
      scene,
      camera,
      stage: ownedStage,
      input: ownedInput
    });
    ownedInput = null;
    ownedSurvival = createV2SurvivalRuntime({
      scene,
      stage: ownedStage,
      player: ownedPlayer,
      random: Math.random
    });
    return {
      stage: ownedStage,
      player: ownedPlayer,
      survival: ownedSurvival
    };
  } catch (error) {
    titleStartHint.textContent = "読込エラー";
    titleMessage.textContent = formatLoadError(error);
    ownedSurvival?.dispose();
    ownedPlayer?.dispose();
    ownedInput?.dispose();
    ownedStage?.dispose();
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

const startPlay = () => {
  if (!started) {
    started = true;
    titleOverlay.style.display = "none";
    statusInfo.style.display = "block";
    helpPanel.style.display = "block";
    helpPanel.textContent = "操作説明\nWASD: 移動\nShift: ダッシュ";
  }
  canvas.focus();
  void (canvas as unknown as Element).requestPointerLock().catch(() => {});
};

canvas.addEventListener("click", startPlay);

engine.runRenderLoop(() => {
  const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
  const playerFrame = player.update(delta, started);
  let survivalFrame = survival.getFrame();
  if (started) {
    elapsedSeconds += delta;
    survivalFrame = survival.update(delta, elapsedSeconds);
  }
  statusTimer += delta;
  if (statusTimer >= 0.1) {
    statusTimer = 0;
    const foot = playerFrame.footPosition;
    statusInfo.textContent =
      `学校3D空間\n` +
      `X ${foot.x.toFixed(3)}  Y ${foot.y.toFixed(3)}  Z ${foot.z.toFixed(3)}\n` +
      `${playerFrame.verticalState.grounded ? "接地" : "空中"}\n` +
      `NPC ${survivalFrame.npcCount}  BIT ${survivalFrame.bitCount}  ` +
      `BEAM ${survivalFrame.activeBeamCount}\n` +
      `視認 ${survivalFrame.visualTargetCount}  ` +
      `警報 ${survivalFrame.alertTargetCount}  ` +
      `共有 ${survivalFrame.activeAlertCount}\n` +
      `着弾 壁 ${survivalFrame.blockerImpactCount}  ` +
      `標的 ${survivalFrame.actorImpactCount}`;
  }
  scene.render();
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
  canvas.removeEventListener("click", startPlay);
  survival.dispose();
  player.dispose();
  stage.dispose();
  scene.dispose();
  engine.dispose();
};

window.addEventListener("beforeunload", disposeRuntime, { once: true });
