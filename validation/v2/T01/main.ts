import {
  ArcRotateCamera,
  AssetContainer,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  Node,
  Ray,
  Scene,
  SceneLoader,
  StandardMaterial,
  Vector3
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

const blenderMetersToBabylonUnits = 0.25;
const dimensionTolerance = 0.0001;
const collisionTolerance = 0.004;
const playerProbeWidth = 0.2;
const playerProbeHeight = (700 / 330) * playerProbeWidth;

const expectedVisNames = [
  "VIS_CeilingLow",
  "VIS_FloorBase",
  "VIS_Slope",
  "VIS_SlopeLanding",
  "VIS_StairLanding",
  "VIS_Stairs",
  "VIS_Step015",
  "VIS_WallStop"
] as const;

const expectedColNames = [
  "COL_CeilingLow",
  "COL_FloorBase",
  "COL_Slope",
  "COL_SlopeLanding",
  "COL_StairLanding",
  "COL_StairRamp",
  "COL_Step015",
  "COL_WallStop"
] as const;

const expectedAuthoredNames = [...expectedVisNames, ...expectedColNames].sort();
const assetRootUrl = import.meta.env.BASE_URL;
const assetFilename = "t01_glb_collision_course.glb";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type MeshBounds = {
  center: [number, number, number];
  size: [number, number, number];
};

type CourseSignature = Record<string, MeshBounds>;

type LoadedCourse = {
  container: AssetContainer;
  root: Mesh;
  managedNodes: Node[];
  authoredMeshes: Mesh[];
  visMeshes: Mesh[];
  colMeshes: Mesh[];
  importedMaterialNames: string[];
  importedTextureNames: string[];
  signature: CourseSignature;
};

type CollisionProbeResult = {
  collidedNames: string[];
  endPosition: Vector3;
};

type ValidationWindowState = {
  status: "running" | "passed" | "failed";
  checks: CheckResult[];
  axisMapping: string;
};

const canvas = document.getElementById("render-canvas") as unknown as HTMLCanvasElement;
const summary = document.getElementById("summary") as HTMLElement;
const metrics = document.getElementById("metrics") as HTMLElement;
const checkResults = document.getElementById("check-results") as HTMLOListElement;
const runButton = document.getElementById("run-validation") as HTMLButtonElement;
const disposeButton = document.getElementById("dispose-course") as HTMLButtonElement;
const reloadButton = document.getElementById("reload-course") as HTMLButtonElement;
const toggleCollidersButton = document.getElementById(
  "toggle-colliders"
) as HTMLButtonElement;
const controlButtons = [runButton, disposeButton, reloadButton, toggleCollidersButton];

const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true
});
const scene = new Scene(engine);
scene.useRightHandedSystem = false;
scene.collisionsEnabled = true;
scene.clearColor = new Color4(0.025, 0.045, 0.07, 1);

const camera = new ArcRotateCamera(
  "T01Camera",
  -1.02,
  1.02,
  3.9,
  new Vector3(0, 0.18, -0.75),
  scene
);
camera.lowerRadiusLimit = 1.4;
camera.upperRadiusLimit = 7;
camera.wheelPrecision = 45;
camera.attachControl(canvas, true);

const light = new HemisphericLight("T01Light", new Vector3(-0.4, 1, -0.2), scene);
light.intensity = 1.25;

const colliderDebugMaterial = new StandardMaterial("T01ColliderDebug", scene);
colliderDebugMaterial.diffuseColor = new Color3(1, 0.08, 0.03);
colliderDebugMaterial.emissiveColor = new Color3(0.45, 0.015, 0.005);
colliderDebugMaterial.alpha = 0.42;
colliderDebugMaterial.wireframe = true;
colliderDebugMaterial.disableDepthWrite = true;

let currentCourse: LoadedCourse | null = null;
let collidersVisible = false;
let busy = false;
let axisMapping = "未計測";

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const vectorTuple = (value: Vector3): [number, number, number] => [
  round(value.x),
  round(value.y),
  round(value.z)
];

const nearlyEqual = (
  actual: number,
  expected: number,
  tolerance = dimensionTolerance
) => Math.abs(actual - expected) <= tolerance;

const arraysEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const createCheck = (name: string, ok: boolean, detail: string): CheckResult => ({
  name,
  ok,
  detail
});

const blenderToBabylon = (x: number, y: number, z: number) =>
  new Vector3(
    -x * blenderMetersToBabylonUnits,
    z * blenderMetersToBabylonUnits,
    -y * blenderMetersToBabylonUnits
  );

const readMeshBounds = (mesh: Mesh): MeshBounds => {
  mesh.computeWorldMatrix(true);
  const box = mesh.getBoundingInfo().boundingBox;
  const minimum = box.minimumWorld;
  const maximum = box.maximumWorld;
  const center = minimum.add(maximum).scale(0.5);
  const size = maximum.subtract(minimum);
  return {
    center: vectorTuple(center),
    size: vectorTuple(size)
  };
};

const buildSignature = (meshes: Mesh[]): CourseSignature =>
  Object.fromEntries(
    [...meshes]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((mesh) => [mesh.name, readMeshBounds(mesh)])
  );

const setColliderVisibility = (visible: boolean) => {
  collidersVisible = visible;
  if (currentCourse) {
    for (const collider of currentCourse.colMeshes) {
      collider.isVisible = visible;
    }
  }
  toggleCollidersButton.textContent = visible ? "COL_を非表示" : "COL_を表示";
};

const loadCourse = async (): Promise<LoadedCourse> => {
  const container = await SceneLoader.LoadAssetContainerAsync(
    assetRootUrl,
    assetFilename,
    scene
  );
  const root = container.createRootMesh();
  root.name = "T01AssetRoot";
  root.scaling.setAll(blenderMetersToBabylonUnits);
  root.isVisible = false;
  root.checkCollisions = false;
  container.addAllToScene();

  const managedNodes = Array.from(
    new Set<Node>([...container.meshes, ...container.transformNodes])
  );

  const authoredMeshes = container.meshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
  );
  const visMeshes = authoredMeshes.filter((mesh) => mesh.name.startsWith("VIS_"));
  const colMeshes = authoredMeshes.filter((mesh) => mesh.name.startsWith("COL_"));

  for (const mesh of visMeshes) {
    mesh.setEnabled(true);
    mesh.isVisible = true;
    mesh.visibility = 1;
    mesh.checkCollisions = false;
    mesh.isPickable = false;
  }
  for (const mesh of colMeshes) {
    mesh.setEnabled(true);
    mesh.isVisible = collidersVisible;
    mesh.visibility = 0.42;
    mesh.checkCollisions = true;
    mesh.isPickable = false;
    mesh.material = colliderDebugMaterial;
  }

  root.computeWorldMatrix(true);
  for (const mesh of authoredMeshes) {
    mesh.computeWorldMatrix(true);
  }
  scene.render();

  return {
    container,
    root,
    managedNodes,
    authoredMeshes,
    visMeshes,
    colMeshes,
    importedMaterialNames: container.materials.map((material) => material.name).sort(),
    importedTextureNames: container.textures.map((texture) => texture.name).sort(),
    signature: buildSignature(authoredMeshes)
  };
};

const runCollisionProbe = (
  startPosition: Vector3,
  displacement: Vector3
): CollisionProbeResult => {
  const probe = new Mesh("T01CollisionProbe", scene);
  probe.position.copyFrom(startPosition);
  probe.ellipsoid = new Vector3(
    playerProbeWidth * 0.5,
    playerProbeHeight * 0.5,
    playerProbeWidth * 0.5
  );
  probe.ellipsoidOffset = new Vector3(0, playerProbeHeight * 0.5, 0);
  probe.checkCollisions = true;
  probe.collisionRetryCount = 5;
  const collidedNames: string[] = [];
  probe.onCollide = (mesh) => {
    if (mesh) {
      collidedNames.push(mesh.name);
    }
  };
  probe.computeWorldMatrix(true);
  probe.moveWithCollisions(displacement);
  const endPosition = probe.position.clone();
  probe.dispose();
  return { collidedNames, endPosition };
};

const runVerticalCollisionChecks = (): CheckResult[] => {
  const cases = [
    {
      label: "平面床",
      start: blenderToBabylon(0, -1, 3),
      expectedHeight: 0,
      expectedProbeY: 0.002121,
      expectedCollider: "COL_FloorBase"
    },
    {
      label: "15cm段差",
      start: blenderToBabylon(0, 2, 3),
      expectedHeight: 0.0375,
      expectedProbeY: 0.039621,
      expectedCollider: "COL_Step015"
    },
    {
      label: "斜面",
      start: blenderToBabylon(-3, 2.6, 3),
      expectedHeight: 0.1,
      expectedProbeY: 0.09876,
      expectedCollider: "COL_Slope"
    },
    {
      label: "斜面踊り場",
      start: blenderToBabylon(-3, 5.3, 3),
      expectedHeight: 0.2,
      expectedProbeY: 0.202121,
      expectedCollider: "COL_SlopeLanding"
    },
    {
      label: "階段用ランプ",
      start: blenderToBabylon(3, 1.9, 3),
      expectedHeight: 0.1125,
      expectedProbeY: 0.100991,
      expectedCollider: "COL_StairRamp"
    },
    {
      label: "階段踊り場",
      start: blenderToBabylon(3, 4.6, 3),
      expectedHeight: 0.225,
      expectedProbeY: 0.227121,
      expectedCollider: "COL_StairLanding"
    }
  ];

  return cases.map((testCase) => {
    const result = runCollisionProbe(testCase.start, new Vector3(0, -1, 0));
    const surfaceHit = scene.pickWithRay(
      new Ray(testCase.start, new Vector3(0, -1, 0), 2),
      (mesh) => mesh.name === testCase.expectedCollider,
      false
    );
    const surfaceHeight = surfaceHit?.pickedPoint?.y;
    const colliderMatched = result.collidedNames.includes(testCase.expectedCollider);
    const heightMatched =
      surfaceHit?.hit === true &&
      surfaceHeight !== undefined &&
      nearlyEqual(surfaceHeight, testCase.expectedHeight, dimensionTolerance);
    const probePositionMatched = nearlyEqual(
      result.endPosition.y,
      testCase.expectedProbeY,
      collisionTolerance
    );
    return createCheck(
      `${testCase.label}の衝突`,
      colliderMatched && heightMatched && probePositionMatched,
      `hit=${result.collidedNames.join(",") || "なし"}, probeY=${round(result.endPosition.y)}, expectedProbeY=${testCase.expectedProbeY}, surfaceY=${surfaceHeight === undefined ? "なし" : round(surfaceHeight)}, expectedSurfaceY=${testCase.expectedHeight}`
    );
  });
};

const runWallAndCeilingChecks = (): CheckResult[] => {
  const wallResult = runCollisionProbe(
    blenderToBabylon(0, 6, 0.2),
    new Vector3(0, 0, -0.5)
  );
  const expectedWallStopZ =
    -6.8 * blenderMetersToBabylonUnits + playerProbeWidth * 0.5;
  const wallCheck = createCheck(
    "壁の衝突",
    wallResult.collidedNames.includes("COL_WallStop") &&
      nearlyEqual(wallResult.endPosition.z, expectedWallStopZ, collisionTolerance),
    `hit=${wallResult.collidedNames.join(",") || "なし"}, stopZ=${round(wallResult.endPosition.z)}, expected=${round(expectedWallStopZ)}`
  );

  const ceilingResult = runCollisionProbe(
    blenderToBabylon(0, 5.3, 0.02),
    new Vector3(0, 0.3, 0)
  );
  const expectedCeilingStopY = 2.1 * blenderMetersToBabylonUnits - playerProbeHeight;
  const ceilingCheck = createCheck(
    "天井の衝突",
    ceilingResult.collidedNames.includes("COL_CeilingLow") &&
      nearlyEqual(
        ceilingResult.endPosition.y,
        expectedCeilingStopY,
        collisionTolerance
      ),
    `hit=${ceilingResult.collidedNames.join(",") || "なし"}, stopY=${round(ceilingResult.endPosition.y)}, expected=${round(expectedCeilingStopY)}`
  );

  return [wallCheck, ceilingCheck];
};

const runCourseChecks = (course: LoadedCourse, phase: string): CheckResult[] => {
  const results: CheckResult[] = [];
  const actualNames = course.authoredMeshes.map((mesh) => mesh.name).sort();
  results.push(
    createCheck(
      `${phase}: 作者メッシュ命名`,
      arraysEqual(actualNames, expectedAuthoredNames),
      `${actualNames.length}件 / VIS=${course.visMeshes.length} / COL=${course.colMeshes.length}`
    )
  );

  const prefixContractValid = course.authoredMeshes.every(
    (mesh) => mesh.name.startsWith("VIS_") || mesh.name.startsWith("COL_")
  );
  results.push(
    createCheck(
      `${phase}: VIS_/COL_接頭辞`,
      prefixContractValid,
      "頂点を持つ作者メッシュだけを検査し、管理ルートは除外"
    )
  );

  const visConfigurationValid = course.visMeshes.every(
    (mesh) => mesh.isEnabled() && mesh.isVisible && !mesh.checkCollisions
  );
  const colConfigurationValid = course.colMeshes.every(
    (mesh) => mesh.isEnabled() && !mesh.isVisible && mesh.checkCollisions
  );
  results.push(
    createCheck(
      `${phase}: 表示・衝突設定`,
      visConfigurationValid && colConfigurationValid,
      "VIS=表示/衝突無効、COL=有効/非表示/衝突有効"
    )
  );

  const floorBounds = course.signature.VIS_FloorBase;
  const stepBounds = course.signature.VIS_Step015;
  const rampBounds = course.signature.COL_StairRamp;
  const scaleValid =
    nearlyEqual(floorBounds.size[0], 2.25) &&
    nearlyEqual(floorBounds.size[1], 0.05) &&
    nearlyEqual(floorBounds.size[2], 2.5) &&
    nearlyEqual(stepBounds.size[1], 0.0375) &&
    nearlyEqual(rampBounds.size[0], 0.6) &&
    nearlyEqual(rampBounds.size[1], 0.25) &&
    nearlyEqual(rampBounds.size[2], 0.45);
  results.push(
    createCheck(
      `${phase}: 1m→0.25縮尺`,
      scaleValid,
      `floor=${floorBounds.size.join("×")}, stepHeight=${stepBounds.size[1]}, ramp=${rampBounds.size.join("×")}`
    )
  );

  const slopeLanding = course.signature.VIS_SlopeLanding.center;
  const stairLanding = course.signature.VIS_StairLanding.center;
  const wall = course.signature.VIS_WallStop.center;
  const step = course.signature.VIS_Step015.center;
  const blenderForwardSign = Math.sign(wall[2] - step[2]);
  axisMapping = blenderForwardSign > 0
    ? "Blender +X→Babylon -X / +Y→+Z / +Z→+Y"
    : "Blender +X→Babylon -X / +Y→-Z / +Z→+Y";
  const axisValid =
    nearlyEqual(slopeLanding[0], 0.75) &&
    nearlyEqual(stairLanding[0], -0.75) &&
    nearlyEqual(wall[1], 0.3) &&
    blenderForwardSign === -1;
  results.push(
    createCheck(
      `${phase}: Babylon最終軸`,
      axisValid,
      `${axisMapping}, wallZ=${wall[2]}, stepZ=${step[2]}`
    )
  );

  results.push(...runVerticalCollisionChecks());
  results.push(...runWallAndCeilingChecks());
  return results;
};

const disposeCourse = (course: LoadedCourse, phase: string): CheckResult => {
  const authoredNames = course.authoredMeshes.map((mesh) => mesh.name);
  const materialNames = course.importedMaterialNames;
  const textureNames = course.importedTextureNames;
  const managedNodes = course.managedNodes;
  course.container.removeAllFromScene();
  course.container.dispose();

  const undisposedManagedNodes = managedNodes.filter((node) => !node.isDisposed());
  const remainingManagedNodes = [...scene.meshes, ...scene.transformNodes].filter((node) =>
    managedNodes.includes(node)
  );
  const remainingMeshes = scene.meshes.filter((mesh) => authoredNames.includes(mesh.name));
  const remainingMaterials = scene.materials.filter((material) =>
    materialNames.includes(material.name)
  );
  const remainingTextures = scene.textures.filter((texture) =>
    textureNames.includes(texture.name)
  );
  return createCheck(
    `${phase}: AssetContainer破棄`,
    remainingMeshes.length === 0 &&
      undisposedManagedNodes.length === 0 &&
      remainingManagedNodes.length === 0 &&
      remainingMaterials.length === 0 &&
      remainingTextures.length === 0,
    `managedNode=${remainingManagedNodes.length}, undisposedNode=${undisposedManagedNodes.map((node) => node.name).join(",") || "なし"}, mesh=${remainingMeshes.length}, material=${remainingMaterials.length}, texture=${remainingTextures.length}`
  );
};

const renderMetrics = (course: LoadedCourse | null) => {
  const values: Array<[string, string]> = [
    ["GLB", `${assetRootUrl}${assetFilename}`],
    ["変換", "1m → 0.25 unit"],
    ["軸", axisMapping]
  ];
  if (course) {
    values.push(
      ["作者メッシュ", `${course.authoredMeshes.length}（VIS 8 / COL 8）`],
      ["床寸法", course.signature.VIS_FloorBase.size.join(" × ")],
      ["段差高", `${course.signature.VIS_Step015.size[1]}`]
    );
  }
  metrics.replaceChildren();
  for (const [term, description] of values) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = description;
    metrics.append(dt, dd);
  }
};

const publishResults = (checks: CheckResult[], course: LoadedCourse | null) => {
  checkResults.replaceChildren();
  for (const result of checks) {
    const item = document.createElement("li");
    item.dataset.ok = String(result.ok);
    const title = document.createElement("strong");
    title.textContent = `${result.ok ? "PASS" : "FAIL"} — ${result.name}`;
    const detail = document.createElement("span");
    detail.textContent = result.detail;
    item.append(title, detail);
    checkResults.append(item);
  }

  const passed = checks.length > 0 && checks.every((result) => result.ok);
  const state: ValidationWindowState = {
    status: passed ? "passed" : "failed",
    checks,
    axisMapping
  };
  summary.dataset.state = state.status;
  summary.textContent = passed
    ? course
      ? `全${checks.length}項目がPASSしました。再読込後のコースを表示しています。`
      : `全${checks.length}項目がPASSし、GLBをシーンから破棄しました。`
    : `${checks.filter((result) => !result.ok).length}項目がFAILしました。`;
  document.documentElement.dataset.validationStatus = state.status;
  (window as Window & { __t01Validation?: ValidationWindowState }).__t01Validation = state;
  renderMetrics(course);
};

const setBusy = (value: boolean) => {
  busy = value;
  for (const button of controlButtons) {
    button.disabled = value;
  }
};

const beginValidation = () => {
  summary.dataset.state = "running";
  summary.textContent = "検証を実行しています。";
  document.documentElement.dataset.validationStatus = "running";
  (window as Window & { __t01Validation?: ValidationWindowState }).__t01Validation = {
    status: "running",
    checks: [],
    axisMapping
  };
};

const runFullValidation = async () => {
  if (busy) {
    return;
  }
  setBusy(true);
  beginValidation();
  setColliderVisibility(false);
  const checks: CheckResult[] = [];

  try {
    if (currentCourse) {
      disposeCourse(currentCourse, "前回状態");
      currentCourse = null;
    }

    const firstCourse = await loadCourse();
    checks.push(...runCourseChecks(firstCourse, "初回読込"));
    const firstSignature = JSON.stringify(firstCourse.signature);
    checks.push(disposeCourse(firstCourse, "初回読込"));

    const reloadedCourse = await loadCourse();
    checks.push(...runCourseChecks(reloadedCourse, "再読込"));
    checks.push(
      createCheck(
        "初回と再読込の同一性",
        firstSignature === JSON.stringify(reloadedCourse.signature),
        "名前・件数・world boundsの署名を比較"
      )
    );
    currentCourse = reloadedCourse;
    publishResults(checks, currentCourse);
  } catch (error) {
    checks.push(
      createCheck(
        "検証処理",
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
    publishResults(checks, currentCourse);
  } finally {
    setBusy(false);
  }
};

const disposeCurrentCourse = async () => {
  if (busy || !currentCourse) {
    return;
  }
  setBusy(true);
  const check = disposeCourse(currentCourse, "手動操作");
  currentCourse = null;
  publishResults([check], null);
  setBusy(false);
};

const reloadCurrentCourse = async () => {
  if (busy) {
    return;
  }
  setBusy(true);
  beginValidation();
  const checks: CheckResult[] = [];
  try {
    if (currentCourse) {
      checks.push(disposeCourse(currentCourse, "手動再読込前"));
    }
    setColliderVisibility(false);
    currentCourse = await loadCourse();
    checks.push(...runCourseChecks(currentCourse, "手動再読込"));
    publishResults(checks, currentCourse);
  } catch (error) {
    checks.push(
      createCheck(
        "手動再読込",
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
    publishResults(checks, currentCourse);
  } finally {
    setBusy(false);
  }
};

runButton.addEventListener("click", () => void runFullValidation());
disposeButton.addEventListener("click", () => void disposeCurrentCourse());
reloadButton.addEventListener("click", () => void reloadCurrentCourse());
toggleCollidersButton.addEventListener("click", () =>
  setColliderVisibility(!collidersVisible)
);

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

void runFullValidation();
