import { Ray, Vector3, type Engine, type Mesh, type Scene } from "@babylonjs/core";
import type { StageSpatialSession } from "../world/stageSpatialContext";
import type { V2SurvivalRuntime } from "./survivalRuntime";
import type { V2DepthPeelingRenderer } from "./v2DepthPeelingRenderer";
import { V2_STAGE_WINDOW_GLASS_MATERIAL_NAME } from "./v2StageTransparentRenderingOrder";

type Pose = Readonly<{
  footPosition: readonly [number, number, number];
  lookAtPosition: readonly [number, number, number];
  fov: number;
}>;
type Snapshot = Readonly<{
  footPosition: readonly [number, number, number];
  eyePosition: readonly [number, number, number];
  forward: readonly [number, number, number];
}>;
type WindowView = Readonly<{
  mesh: Mesh;
  center: Vector3;
  normal: Vector3;
  feet: readonly [Vector3, Vector3];
}>;
const coordinates = (position: Vector3): readonly [number, number, number] =>
  [position.x, position.y, position.z];

/** DEVの学校受入セッションだけで生成する。通常の設定保存値は変更しない。 */
export const createV2TransparentDepthAcceptance = ({
  scene, engine, stage, survival, setPose, getSnapshot
}: Readonly<{
  scene: Scene;
  engine: Engine;
  stage: StageSpatialSession;
  survival: V2SurvivalRuntime;
  setPose(pose: Pose): Snapshot;
  getSnapshot(): Snapshot;
}>) => {
  const initial = getSnapshot();
  const eyeHeight = initial.eyePosition[1] - initial.footPosition[1];
  const visualMeshes = new Set(stage.resources.visualMeshes);
  const windows: WindowView[] = [];
  for (const mesh of stage.resources.visualMeshes) {
    if (mesh.material?.name !== V2_STAGE_WINDOW_GLASS_MATERIAL_NAME) continue;
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo().boundingBox;
    const center = bounds.centerWorld.clone();
    const extent = bounds.extendSizeWorld;
    const normal = extent.x < extent.z ? Vector3.Right() : Vector3.Forward();
    const feet = [-1, 1].map((side) => {
      const desired = center.add(normal.scale(side * 0.8));
      desired.y -= eyeHeight;
      const location = stage.navigation.projectPoint(desired, 0.5);
      if (location === null) return null;
      const eye = location.position.add(new Vector3(0, eyeHeight, 0));
      const direction = center.subtract(eye);
      const hit = scene.pickWithRay(
        new Ray(eye, direction.normalize(), Vector3.Distance(eye, center) + 0.01),
        (candidate) => visualMeshes.has(candidate as Mesh)
      );
      return hit?.pickedMesh === mesh ? location.position : null;
    });
    if (feet[0] !== null && feet[1] !== null) {
      windows.push({ mesh, center, normal, feet: [feet[0], feet[1]] });
    }
  }
  windows.sort((left, right) =>
    Vector3.DistanceSquared(left.center, Vector3.FromArray(initial.footPosition)) -
    Vector3.DistanceSquared(right.center, Vector3.FromArray(initial.footPosition))
  );

  const panel = document.createElement("section");
  panel.id = "v2TransparentDepthAcceptance";
  panel.setAttribute("aria-label", "透明合成確認");
  panel.style.cssText = "position:fixed;left:12px;top:90px;z-index:10000;width:350px;padding:10px;background:#111e;color:white;font:13px sans-serif;pointer-events:auto";
  const title = document.createElement("strong");
  title.textContent = "透明合成確認（DEV）";
  const status = document.createElement("p");
  status.textContent = "初期BITの出現演出を待っています。";
  const controls = document.createElement("div");
  controls.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
  const instructions = document.createElement("p");
  instructions.textContent = "Canvasをクリックして操作開始、もう一度クリックして射撃。WASD・マウスで確認し、Escでボタンへ戻れます。";
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "位置・窓・描画pass・FPSの確認データ";
  const evidence = document.createElement("pre");
  evidence.id = "v2TransparentDepthAcceptanceEvidence";
  evidence.style.cssText = "max-height:180px;overflow:auto;white-space:pre-wrap;font-size:11px";
  details.append(summary, evidence);
  panel.append(title, status, controls, instructions, details);
  document.body.append(panel);

  let ready = false;
  let bitId = "";
  let selectedWindow = 0;
  let side = 0;
  let bitPosition: Vector3 | null = null;
  let lastEvidenceTime = 0;
  let requestedShots = 0;
  let observedMaximumBeams = 0;
  const buttons: HTMLButtonElement[] = [];
  survival.setHostileActionsSuspended(true);

  const report = () => {
    const renderer = scene.depthPeelingRenderer as V2DepthPeelingRenderer;
    evidence.textContent = JSON.stringify({
      ready,
      windowCount: windows.length,
      window: windows[selectedWindow]?.mesh.name ?? null,
      windowCenter: windows[selectedWindow] === undefined ? null : coordinates(windows[selectedWindow].center),
      side,
      bitId,
      bitPosition: bitPosition === null ? null : coordinates(bitPosition),
      player: getSnapshot(),
      playerState: survival.getFrame().playerState,
      activeBeamCount: survival.getFrame().activeBeamCount,
      requestedShots,
      observedMaximumBeams,
      peelingPasses: renderer.lastPassCount,
      reductionPasses: renderer.lastReductionCount,
      fps: Number(engine.getFps().toFixed(1))
    }, null, 2);
  };
  const showView = (lateral: number) => {
    const view = windows[selectedWindow];
    const tangent = new Vector3(view.normal.z, 0, -view.normal.x);
    const desiredFoot = view.feet[side].add(tangent.scale(lateral));
    const location = stage.navigation.projectPoint(desiredFoot, 0.3);
    if (location === null) {
      status.textContent = "この斜め視点には立てません。正面か別の窓を選んでください。";
      return;
    }
    const sign = side === 0 ? -1 : 1;
    bitPosition = survival.relocateBit(bitId, [
      view.center.subtract(view.normal.scale(sign * 0.45)),
      view.center.subtract(view.normal.scale(sign * 0.8))
    ]);
    setPose({
      footPosition: coordinates(location.position),
      lookAtPosition: coordinates(bitPosition),
      fov: 0.8
    });
    status.textContent = `窓 ${selectedWindow + 1}/${windows.length}：${view.mesh.name}／側${side + 1}／BIT静止・Player銃あり`;
    report();
  };
  const addButton = (label: string, action: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = true;
    button.addEventListener("click", action);
    buttons.push(button);
    controls.append(button);
  };
  addButton("透明合成確認", () => showView(0));
  addButton("窓の反対側", () => { side = 1 - side; showView(0); });
  addButton("左斜め", () => showView(-0.35));
  addButton("右斜め", () => showView(0.35));
  addButton("次の窓", () => { selectedWindow = (selectedWindow + 1) % windows.length; showView(0); });
  addButton("射撃（Player）", () => {
    survival.requestPlayerGunFire(Vector3.FromArray(getSnapshot().forward));
    requestedShots += 1;
    report();
  });
  addButton("通常操作へ", () => {
    status.textContent = "BITを固定したまま、Canvasをクリックして移動・射撃できます。";
    details.open = false;
  });

  const observer = scene.onAfterRenderObservable.add(() => {
    observedMaximumBeams = Math.max(observedMaximumBeams, survival.getFrame().activeBeamCount);
    // getBitActorsは出現演出を終えた通常BITだけを返す。
    if (!ready && survival.getBitActors().length === 1) {
      bitId = survival.getBitActors()[0].id;
      survival.setBitAiSuspended(true);
      ready = true;
      status.textContent = windows.length > 0
        ? "BITを静止しました。「透明合成確認」で窓前へ移動します。"
        : "窓の両側に立てる視点が見つかりませんでした。";
      for (const button of buttons) button.disabled = windows.length === 0;
    }
    if (performance.now() - lastEvidenceTime >= 500) {
      lastEvidenceTime = performance.now();
      report();
    }
  });
  return Object.freeze({
    dispose: () => {
      scene.onAfterRenderObservable.remove(observer);
      panel.remove();
    }
  });
};
