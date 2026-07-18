import {
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
import { exportNavMesh } from "recast-navigation";
import { generateSoloNavMesh } from "recast-navigation/generators";

import {
  createNavigationWorld,
  initializeNavigationRuntime,
  type NavigationWorld
} from "../../../src/world/navigationWorld";

import "./style.css";

type ValidationCheck = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

type NavigationRuntime = Readonly<{
  navigationWorld: NavigationWorld;
  restoredNavigationWorld: NavigationWorld;
  pathMeshes: readonly Mesh[];
  data: Uint8Array;
}>;

type NavGeometry = Readonly<{
  positions: readonly number[];
  indices: readonly number[];
}>;

const canvas = document.getElementById("render-canvas") as unknown as HTMLCanvasElement;
const summary = document.querySelector<HTMLElement>("#summary");
const metrics = document.querySelector<HTMLDListElement>("#metrics");
const checkResults = document.querySelector<HTMLOListElement>("#check-results");
const runButton = document.querySelector<HTMLButtonElement>("#run-validation");
const downloadButton = document.querySelector<HTMLButtonElement>("#download-navmesh");

if (!canvas || !summary || !metrics || !checkResults || !runButton || !downloadButton) {
  throw new Error("T04検証UIの必須要素がありません。");
}

const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
scene.clearColor.set(0.025, 0.07, 0.052, 1);

const camera = new ArcRotateCamera(
  "T04Camera",
  -Math.PI / 2.4,
  Math.PI / 3.1,
  8,
  new Vector3(1, 0, 0),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 3;
camera.upperRadiusLimit = 14;

const light = new HemisphericLight("T04Light", new Vector3(0.4, 1, -0.2), scene);
light.intensity = 0.9;

const sourceMaterial = new StandardMaterial("NavSourceMaterial", scene);
sourceMaterial.diffuseColor = new Color3(0.16, 0.34, 0.27);
sourceMaterial.specularColor = Color3.Black();

const blockerMaterial = new StandardMaterial("NavBlockerMaterial", scene);
blockerMaterial.diffuseColor = new Color3(0.5, 0.2, 0.18);
blockerMaterial.specularColor = Color3.Black();

const createGround = (name: string, width: number, height: number, position: Vector3) => {
  const mesh = MeshBuilder.CreateGround(name, { width, height }, scene);
  mesh.position.copyFrom(position);
  mesh.material = sourceMaterial;
  return mesh;
};

createGround("NAV_Walkable_LowerSouth", 4, 1.95, new Vector3(2, 0, -1.025));
createGround("NAV_Walkable_LowerNorth", 4, 1.95, new Vector3(2, 0, 1.025));
createGround("NAV_Walkable_Doorway", 0.45, 0.1, new Vector3(0.575, 0, 0));
createGround("NAV_Walkable_DisconnectedIsland", 1, 1, new Vector3(-6.5, 0, -1.5));
createGround("NAV_Walkable_StackedLower", 1, 1, new Vector3(-9.5, 0, -1.5));
createGround("NAV_Walkable_StackedUpper", 1, 1, new Vector3(-9.5, 0.8, -1.5));

const rampLength = Math.hypot(1, 0.25);
const ramp = createGround("NAV_Walkable_Ramp", rampLength, 0.5, new Vector3(-0.5, 0.125, -1.75));
ramp.rotation.z = -Math.atan2(0.25, 1);
createGround("NAV_Walkable_UpperFloor", 1, 0.5, new Vector3(-1.5, 0.25, -1.75));

const createBarrier = (name: string, width: number, centerX: number) => {
  const mesh = MeshBuilder.CreateBox(name, { width, height: 0.6, depth: 0.1 }, scene);
  mesh.position.set(centerX, 0.3, 0);
  mesh.material = blockerMaterial;
};

createBarrier("NAV_Blocker_WallWest", 3.2, 2.4);
createBarrier("NAV_Blocker_WallEast", 0.35, 0.175);

const createNavigationGeometry = (): NavGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];

  const appendWalkableQuad = (
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    minY: number,
    maxY: number
  ) => {
    const vertexOffset = positions.length / 3;
    positions.push(
      minX, minY, minZ,
      maxX, maxY, minZ,
      maxX, maxY, maxZ,
      minX, minY, maxZ
    );
    indices.push(
      vertexOffset, vertexOffset + 3, vertexOffset + 2,
      vertexOffset, vertexOffset + 2, vertexOffset + 1
    );
  };

  appendWalkableQuad(-4, 0, -2, -0.05, 0, 0);
  appendWalkableQuad(-4, 0, 0.05, 2, 0, 0);
  appendWalkableQuad(-0.8, -0.35, -0.05, 0.05, 0, 0);
  appendWalkableQuad(0, 1, -2, -1.5, 0, 0.25);
  appendWalkableQuad(1, 2, -2, -1.5, 0.25, 0.25);
  appendWalkableQuad(6, 7, -2, -1, 0, 0);
  appendWalkableQuad(9, 10, -2, -1, 0, 0);
  appendWalkableQuad(9, 10, -2, -1, 0.8, 0.8);

  return { positions, indices };
};

const navGeometry = createNavigationGeometry();
const navParameters = {
  cs: 0.025,
  ch: 0.0125,
  walkableSlopeAngle: 45,
  walkableHeight: 34,
  walkableClimb: 3,
  walkableRadius: 4,
  maxEdgeLen: 12,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1
};

let navigationRuntime: NavigationRuntime | null = null;

const disposeNavigationRuntime = () => {
  if (!navigationRuntime) {
    return;
  }
  navigationRuntime.pathMeshes.forEach((mesh) => mesh.dispose());
  navigationRuntime.navigationWorld.dispose();
  navigationRuntime.restoredNavigationWorld.dispose();
  navigationRuntime = null;
};

const pathsEqual = (left: readonly Vector3[], right: readonly Vector3[]) =>
  left.length === right.length &&
  left.every((point, index) => Vector3.Distance(point, right[index]) <= 1e-5);

const createPathMesh = (name: string, path: readonly Vector3[], color: Color3) => {
  const elevated = path.map((point) => point.add(new Vector3(0, 0.015, 0)));
  const mesh = MeshBuilder.CreateLines(name, { points: elevated }, scene);
  mesh.color = color;
  return mesh;
};

const renderChecks = (checks: readonly ValidationCheck[]) => {
  checkResults.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.dataset.ok = String(check.ok);
      const title = document.createElement("strong");
      title.textContent = `${check.ok ? "PASS" : "FAIL"} ${check.name}`;
      const detail = document.createElement("span");
      detail.textContent = check.detail;
      item.append(title, detail);
      return item;
    })
  );
};

const setMetric = (label: string, value: string) => {
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  metrics.append(term, description);
};

const runValidation = async () => {
  runButton.disabled = true;
  downloadButton.disabled = true;
  summary.dataset.state = "running";
  summary.textContent = "Recastを初期化し、NavMeshを生成しています。";
  metrics.replaceChildren();
  checkResults.replaceChildren();
  disposeNavigationRuntime();

  const checks: ValidationCheck[] = [];
  const pendingNavigationWorlds: NavigationWorld[] = [];

  try {
    const initializationStartedAt = performance.now();
    await initializeNavigationRuntime();
    const initializationMs = performance.now() - initializationStartedAt;
    checks.push({
      name: "Recast初期化",
      ok: true,
      detail: `recast-navigation 0.43.1 / ${initializationMs.toFixed(2)} ms`
    });

    const bakeStartedAt = performance.now();
    const generationResult = generateSoloNavMesh(
      navGeometry.positions,
      navGeometry.indices,
      navParameters
    );
    const bakeMs = performance.now() - bakeStartedAt;
    if (!generationResult.success) {
      throw new Error(generationResult.error);
    }

    let data: Uint8Array;
    try {
      data = exportNavMesh(generationResult.navMesh);
    } finally {
      generationResult.navMesh.destroy();
    }

    const navigationWorld = await createNavigationWorld(data);
    pendingNavigationWorlds.push(navigationWorld);
    navigationWorld.createDebugMesh(scene);

    const routeStart = new Vector3(3, 0, -1.5);
    const routeEnd = new Vector3(3, 0, 1.5);
    const routeResult = navigationWorld.findPath(routeStart, routeEnd);
    const routePath = routeResult?.points ?? [];
    const routeMinX = Math.min(...routePath.map((point) => point.x));
    checks.push({
      name: "壁を抜けず扉へ迂回",
      ok: routeResult !== null && routePath.length >= 3 && routeMinX < 0.95,
      detail: `${routePath.length}点 / minX=${routeMinX.toFixed(4)} / ${routeResult?.distance.toFixed(4) ?? "--"} wu`
    });

    const rampStart = new Vector3(0.25, 0, -1.75);
    const rampEnd = new Vector3(-1.5, 0.25, -1.75);
    const rampResult = navigationWorld.findPath(rampStart, rampEnd);
    const rampPath = rampResult?.points ?? [];
    const rampHeight =
      rampPath.length > 0
        ? rampPath[rampPath.length - 1].y
        : Number.NEGATIVE_INFINITY;
    checks.push({
      name: "連続ランプの3D経路",
      ok: rampResult !== null && rampPath.length >= 2 && rampHeight >= 0.2,
      detail: `${rampPath.length}点 / endY=${rampHeight.toFixed(4)}`
    });

    const restoreStartedAt = performance.now();
    const restoredNavigationWorld = await createNavigationWorld(data);
    pendingNavigationWorlds.push(restoredNavigationWorld);
    const restoreMs = performance.now() - restoreStartedAt;
    const restoredRoutePath = restoredNavigationWorld.findPath(routeStart, routeEnd)?.points ?? [];
    const restoredRampPath = restoredNavigationWorld.findPath(rampStart, rampEnd)?.points ?? [];
    checks.push({
      name: "NavMeshバイナリ往復",
      ok:
        data.byteLength > 0 &&
        pathsEqual(routePath, restoredRoutePath) &&
        pathsEqual(rampPath, restoredRampPath),
      detail: `${data.byteLength} bytes / 復元 ${restoreMs.toFixed(2)} ms`
    });

    const unreachableResult = navigationWorld.findPath(
      new Vector3(3, 0, -1.5),
      new Vector3(8, 0, 8)
    );
    checks.push({
      name: "NavMesh外の到達不能地点",
      ok: unreachableResult === null,
      detail: `${unreachableResult?.points.length ?? 0}点`
    });

    const disconnectedIslandResult = navigationWorld.findPath(
      new Vector3(3, 0, -1.5),
      new Vector3(-6.5, 0, -1.5)
    );
    checks.push({
      name: "切断されたNavMesh島",
      ok: disconnectedIslandResult === null,
      detail: `${disconnectedIslandResult?.points.length ?? 0}点`
    });

    const stackedLowerStart = new Vector3(-9.2, 0, -1.8);
    const stackedLowerEnd = new Vector3(-9.8, 0, -1.2);
    const stackedUpperStart = new Vector3(-9.2, 0.8, -1.8);
    const stackedUpperEnd = new Vector3(-9.8, 0.8, -1.2);
    const stackedLowerPath = navigationWorld.findPath(stackedLowerStart, stackedLowerEnd);
    const stackedUpperPath = navigationWorld.findPath(stackedUpperStart, stackedUpperEnd);
    const stackedCrossFloorPath = navigationWorld.findPath(stackedLowerStart, stackedUpperEnd);
    const lowerProjected = navigationWorld.projectPoint(stackedLowerStart, 0.1);
    const upperProjected = navigationWorld.projectPoint(stackedUpperStart, 0.1);
    checks.push({
      name: "重複する上下床の分離",
      ok:
        stackedLowerPath !== null &&
        stackedUpperPath !== null &&
        stackedCrossFloorPath === null &&
        lowerProjected !== null &&
        upperProjected !== null &&
        upperProjected.y - lowerProjected.y >= 0.7,
      detail: `lowerY=${lowerProjected?.y.toFixed(4) ?? "--"} / upperY=${upperProjected?.y.toFixed(4) ?? "--"} / cross=${stackedCrossFloorPath?.points.length ?? 0}点`
    });

    const projectedPoint = navigationWorld.projectPoint(new Vector3(3, 0.1, -1.5), 0.2);
    const constrainedPoint = navigationWorld.constrainMovement(
      new Vector3(3, 0, -1.5),
      new Vector3(3, 0, 1.5)
    );
    const randomPoint = navigationWorld.randomPointAround(new Vector3(3, 0, -1.5), 0.5);
    const randomDistance = randomPoint
      ? Vector3.Distance(randomPoint, new Vector3(3, 0, -1.5))
      : Number.POSITIVE_INFINITY;
    checks.push({
      name: "本番NavigationWorld問い合わせ",
      ok:
        projectedPoint !== null &&
        Math.abs(projectedPoint.y) <= 0.02 &&
        constrainedPoint !== null &&
        constrainedPoint.z < 0 &&
        randomPoint !== null &&
        randomDistance <= 0.5 + 1e-5,
      detail: `projectY=${projectedPoint?.y.toFixed(4) ?? "--"} / constrainZ=${constrainedPoint?.z.toFixed(4) ?? "--"} / random=${Number.isFinite(randomDistance) ? randomDistance.toFixed(4) : "--"}`
    });

    const pathMeshes = [
      createPathMesh("DoorRoute", routePath, new Color3(1, 0.82, 0.18)),
      createPathMesh("RampRoute", rampPath, new Color3(0.2, 0.72, 1))
    ];

    navigationRuntime = {
      navigationWorld,
      restoredNavigationWorld,
      pathMeshes,
      data
    };
    pendingNavigationWorlds.length = 0;

    setMetric("初期化", `${initializationMs.toFixed(2)} ms`);
    setMetric("ベイク", `${bakeMs.toFixed(2)} ms`);
    setMetric("復元", `${restoreMs.toFixed(2)} ms`);
    setMetric("バイナリ", `${data.byteLength} bytes`);
    setMetric("入力三角形", `${navGeometry.indices.length / 3}`);

    const passedCount = checks.filter((check) => check.ok).length;
    summary.dataset.state = passedCount === checks.length ? "passed" : "failed";
    summary.textContent = `${passedCount} / ${checks.length} 項目がPASSしました。`;
    downloadButton.disabled = false;
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ name: "検証処理", ok: false, detail: message });
    summary.dataset.state = "failed";
    summary.textContent = "NavMesh技術検証に失敗しました。";
  } finally {
    pendingNavigationWorlds.forEach((navigationWorld) => navigationWorld.dispose());
    renderChecks(checks);
    runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => {
  void runValidation();
});

downloadButton.addEventListener("click", () => {
  if (!navigationRuntime) {
    return;
  }
  const copy = new Uint8Array(navigationRuntime.data);
  const blob = new Blob([copy], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "t04_recast_spike.navmesh.bin";
  anchor.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("resize", () => engine.resize());
window.addEventListener("beforeunload", () => disposeNavigationRuntime());

engine.runRenderLoop(() => scene.render());
void runValidation();
