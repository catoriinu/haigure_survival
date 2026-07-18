import {
  ArcRotateCamera,
  type BaseTexture,
  Color4,
  Engine,
  HemisphericLight,
  Logger,
  Mesh,
  Scene,
  Vector3
} from "@babylonjs/core";
import {
  buildStageContext,
  disposeStageContext,
  type StageContext
} from "../../../src/world/stageContext";
import {
  cellToWorld,
  gridAreaCenterToWorld,
  worldToCell
} from "../../../src/game/gridUtils";
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
    __T02_VALIDATION__: ValidationState;
  }
}

const stageFiles = [
  ["laboratory", "laboratory.json", 17, 56],
  ["city_center", "city_center.json", 112, 116],
  ["arena", "arena.json", 27, 27],
  ["arena_trap_room", "arena_trap_room.json", 27, 27],
  ["arena_roulette", "arena_roulette.json", 27, 27],
  ["arena_mirror_house", "arena_mirror_house.json", 27, 27],
  ["labyrinth", "labyrinth.json", 76, 64],
  ["labyrinth_dynamic", "labyrinth_dynamic.json", 76, 64]
] as const;

const stageSelections = stageFiles.map(
  ([id, filename]): StageSelection => ({
    id,
    label: id,
    definitionPath: `${import.meta.env.BASE_URL}stage/${filename}`
  })
);
const glbSelection: StageSelection = {
  id: "t01_glb_collision_course",
  label: "T01 立体テストコース",
  definitionPath: `${import.meta.env.BASE_URL}fixtures/t01_glb_collision_course.json`
};

const browserErrors: string[] = [];
const formatBrowserError = (value: unknown) =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value);
window.addEventListener("error", (event) => {
  browserErrors.push(formatBrowserError(event.error ?? event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  browserErrors.push(`unhandledrejection: ${formatBrowserError(event.reason)}`);
});
const originalConsoleError = console.error.bind(console);
console.error = (...values: unknown[]) => {
  browserErrors.push(values.map(formatBrowserError).join(" "));
  originalConsoleError(...values);
};

const canvas = document.getElementById(
  "render-canvas"
) as unknown as HTMLCanvasElement;
const summary = document.getElementById("summary") as HTMLElement;
const results = document.getElementById("results") as HTMLOListElement;
const runButton = document.getElementById("run-validation") as HTMLButtonElement;
const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.025, 0.045, 0.07, 1);
const camera = new ArcRotateCamera(
  "T02Camera",
  -1.02,
  1.02,
  3.9,
  new Vector3(0, 0.18, -1.1),
  scene
);
camera.attachControl(canvas, true);
const light = new HemisphericLight(
  "T02Light",
  new Vector3(-0.4, 1, -0.2),
  scene
);
light.intensity = 1.25;

let displayedContext: StageContext | null = null;
let running = false;

const createCheck = (name: string, ok: boolean, detail: string): CheckResult => ({
  name,
  ok,
  detail
});

const nearlyEqual = (actual: number, expected: number, tolerance = 1e-4) =>
  Math.abs(actual - expected) <= tolerance;

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

const sceneSignature = () => ({
  meshes: new Set(scene.meshes),
  materials: new Set(scene.materials),
  textures: new Set(scene.textures),
  transformNodes: new Set(scene.transformNodes)
});

const signatureMatches = (
  baseline: ReturnType<typeof sceneSignature>,
  ignoredTextures = new Set<BaseTexture>()
) => {
  const currentTextures = scene.textures.filter(
    (item) => !ignoredTextures.has(item)
  );
  const baselineTextures = [...baseline.textures].filter(
    (item) => !ignoredTextures.has(item)
  );
  return (
    scene.meshes.every((item) => baseline.meshes.has(item)) &&
    scene.meshes.length === baseline.meshes.size &&
    scene.materials.every((item) => baseline.materials.has(item)) &&
    scene.materials.length === baseline.materials.size &&
    currentTextures.every((item) => baseline.textures.has(item)) &&
    currentTextures.length === baselineTextures.length &&
    scene.transformNodes.every((item) => baseline.transformNodes.has(item)) &&
    scene.transformNodes.length === baseline.transformNodes.size
  );
};

const waitForSceneResources = async () => {
  await scene.whenReadyAsync(true);
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await scene.whenReadyAsync(true);
};

const captureGlbResources = (context: StageContext) => ({
  nodes: [
    ...(context.resources.assetContainer?.meshes ?? []),
    ...(context.resources.assetContainer?.transformNodes ?? [])
  ],
  materials: [...(context.resources.assetContainer?.materials ?? [])],
  textures: [...(context.resources.assetContainer?.textures ?? [])]
});

const inspectDisposedGlbResources = (
  captured: ReturnType<typeof captureGlbResources>
) => {
  const liveNodes = captured.nodes.filter((item) => !item.isDisposed());
  const liveMaterials = captured.materials.filter((item) =>
    scene.materials.includes(item)
  );
  const liveTextures = captured.textures.filter(
    (item) => scene.textures.includes(item) || item.getInternalTexture() !== null
  );
  return { liveNodes, liveMaterials, liveTextures };
};

const readBounds = (mesh: Mesh) => {
  mesh.computeWorldMatrix(true);
  const box = mesh.getBoundingInfo().boundingBox;
  return {
    center: box.centerWorld,
    size: box.maximumWorld.subtract(box.minimumWorld)
  };
};

const validateProceduralStages = async (
  baseline: ReturnType<typeof sceneSignature>,
  checks: CheckResult[]
) => {
  for (let index = 0; index < stageSelections.length; index += 1) {
    const selection = stageSelections[index];
    const [, , expectedColumns, expectedRows] = stageFiles[index];
    const definition = await loadStageDefinition(selection);
    checks.push(
      createCheck(
        `${selection.id}: v2定義`,
        definition.schemaVersion === 2 && definition.kind === "procedural-grid",
        `schemaVersion=${definition.schemaVersion}, kind=${definition.kind}`
      )
    );
    const context = await buildStageContext(scene, definition);
    checks.push(
      createCheck(
        `${selection.id}: グリッド寸法`,
        context.layout.columns === expectedColumns &&
          context.layout.rows === expectedRows,
        `${context.layout.columns}×${context.layout.rows}`
      )
    );
    checks.push(
      createCheck(
        `${selection.id}: procedural-grid構築`,
        context.resources.authoredMeshes.length > 0 &&
          context.resources.colliders.length > 0,
        `mesh=${context.resources.authoredMeshes.length}, collider=${context.resources.colliders.length}`
      )
    );
    disposeStageContext(context);
    checks.push(
      createCheck(
        `${selection.id}: コンテキスト破棄`,
        signatureMatches(baseline),
        `scene mesh=${scene.meshes.length}, material=${scene.materials.length}, texture=${scene.textures.length}`
      )
    );
  }
};

const validateGlbStage = async (
  baseline: ReturnType<typeof sceneSignature>,
  checks: CheckResult[]
) => {
  const definition = await loadStageDefinition(glbSelection);
  checks.push(
    createCheck(
      "T01 GLB: v2定義",
      definition.schemaVersion === 2 && definition.kind === "glb",
      `schemaVersion=${definition.schemaVersion}, kind=${definition.kind}`
    )
  );
  const context = await buildStageContext(scene, definition);
  const visMeshes = context.resources.authoredMeshes.filter((mesh) =>
    mesh.name.startsWith("VIS_")
  );
  const colMeshes = context.resources.authoredMeshes.filter((mesh) =>
    mesh.name.startsWith("COL_")
  );
  checks.push(
    createCheck(
      "T01 GLB: VIS/COL設定",
      visMeshes.length === 8 &&
        colMeshes.length === 8 &&
        visMeshes.every((mesh) => mesh.isVisible && !mesh.checkCollisions) &&
        colMeshes.every((mesh) => !mesh.isVisible && mesh.checkCollisions),
      `VIS=${visMeshes.length}, COL=${colMeshes.length}`
    )
  );
  const floor = readBounds(
    context.resources.authoredMeshes.find(
      (mesh) => mesh.name === "VIS_FloorBase"
    ) as Mesh
  );
  const step = readBounds(
    context.resources.authoredMeshes.find(
      (mesh) => mesh.name === "VIS_Step015"
    ) as Mesh
  );
  checks.push(
    createCheck(
      "T01 GLB: 1m→0.25縮尺",
      nearlyEqual(floor.size.x, 2.25) &&
        nearlyEqual(floor.size.z, 2.5) &&
        nearlyEqual(step.size.y, 0.0375),
      `floor=${floor.size.x.toFixed(4)}×${floor.size.z.toFixed(4)}, step=${step.size.y.toFixed(4)}`
    )
  );
  const slopeLanding = readBounds(
    context.resources.authoredMeshes.find(
      (mesh) => mesh.name === "VIS_SlopeLanding"
    ) as Mesh
  ).center;
  const stairLanding = readBounds(
    context.resources.authoredMeshes.find(
      (mesh) => mesh.name === "VIS_StairLanding"
    ) as Mesh
  ).center;
  const wall = readBounds(
    context.resources.authoredMeshes.find(
      (mesh) => mesh.name === "VIS_WallStop"
    ) as Mesh
  ).center;
  checks.push(
    createCheck(
      "T01 GLB: Babylon最終軸",
      nearlyEqual(slopeLanding.x, 0.75) &&
        nearlyEqual(stairLanding.x, -0.75) &&
        wall.z < step.center.z,
      `slopeX=${slopeLanding.x.toFixed(3)}, stairX=${stairLanding.x.toFixed(3)}, wallZ=${wall.z.toFixed(3)}, stepZ=${step.center.z.toFixed(3)}`
    )
  );
  const spawn = cellToWorld(context.layout, context.layout.spawn, 0);
  checks.push(
    createCheck(
      "T01 GLB: Blender原点グリッド",
      nearlyEqual(spawn.x, 0) &&
        nearlyEqual(spawn.z, -0.125) &&
        context.layout.columnDirection.x === -1 &&
        context.layout.rowDirection.z === -1,
      `spawn=(${spawn.x.toFixed(3)},${spawn.z.toFixed(3)}), colX=${context.layout.columnDirection.x}, rowZ=${context.layout.rowDirection.z}`
    )
  );
  const roundTripCell = { col: 1, row: 8 };
  const roundTripWorld = cellToWorld(context.layout, roundTripCell, 0);
  const roundTripResult = worldToCell(context.layout, roundTripWorld);
  checks.push(
    createCheck(
      "T01 GLB: 非対称セル往復",
      roundTripResult.col === roundTripCell.col &&
        roundTripResult.row === roundTripCell.row,
      `cell=(${roundTripCell.col},${roundTripCell.row}) → world=(${roundTripWorld.x.toFixed(3)},${roundTripWorld.z.toFixed(3)}) → cell=(${roundTripResult.col},${roundTripResult.row})`
    )
  );
  const assemblyCenter = gridAreaCenterToWorld(
    context.layout,
    context.assemblyArea,
    0
  );
  checks.push(
    createCheck(
      "T01 GLB: assembly_area中心",
      nearlyEqual(assemblyCenter.x, 0) && nearlyEqual(assemblyCenter.z, -0.25),
      `center=(${assemblyCenter.x.toFixed(3)},${assemblyCenter.z.toFixed(3)})`
    )
  );
  const managedResources = captureGlbResources(context);
  const replacementContext = await buildStageContext(scene, definition);
  const replacementResources = captureGlbResources(replacementContext);
  const sharedBrdfTexture = scene.environmentBRDFTexture;
  disposeStageContext(context);
  const liveManagedResources = inspectDisposedGlbResources(managedResources);
  checks.push(
    createCheck(
      "T01 GLB: 先行ロード後の旧破棄",
      liveManagedResources.liveNodes.length === 0 &&
        liveManagedResources.liveMaterials.length === 0 &&
        liveManagedResources.liveTextures.length === 0 &&
        replacementContext.resources.authoredMeshes.every(
          (mesh) => !mesh.isDisposed()
        ),
      `node=${liveManagedResources.liveNodes.length}, material=${liveManagedResources.liveMaterials.length}, texture=${liveManagedResources.liveTextures.length}, replacementMesh=${replacementContext.resources.authoredMeshes.length}`
    )
  );
  disposeStageContext(replacementContext);
  await waitForSceneResources();
  const liveReplacementResources =
    inspectDisposedGlbResources(replacementResources);
  const ignoredTextures = new Set(
    sharedBrdfTexture ? [sharedBrdfTexture] : []
  );
  checks.push(
    createCheck(
      "T01 GLB: AssetContainer破棄",
      liveReplacementResources.liveNodes.length === 0 &&
        liveReplacementResources.liveMaterials.length === 0 &&
        liveReplacementResources.liveTextures.length === 0 &&
        signatureMatches(baseline, ignoredTextures),
      `node=${liveReplacementResources.liveNodes.length}, material=${liveReplacementResources.liveMaterials.length}, texture=${liveReplacementResources.liveTextures.length}, scene mesh=${scene.meshes.length}, transform=${scene.transformNodes.length}`
    )
  );
  checks.push(
    createCheck(
      "T01 GLB: Scene共有BRDF Texture",
      sharedBrdfTexture !== null &&
        scene.environmentBRDFTexture === sharedBrdfTexture &&
        scene.textures.includes(sharedBrdfTexture) &&
        sharedBrdfTexture.getInternalTexture() !== null &&
        sharedBrdfTexture.isReady(),
      `name=${sharedBrdfTexture?.name ?? "なし"}, ready=${sharedBrdfTexture?.isReady() ?? false}`
    )
  );

  const readyContext = await buildStageContext(scene, definition);
  const readyResources = captureGlbResources(readyContext);
  await waitForSceneResources();
  disposeStageContext(readyContext);
  const liveReadyResources = inspectDisposedGlbResources(readyResources);
  checks.push(
    createCheck(
      "T01 GLB: 描画準備後の資源実体破棄",
      liveReadyResources.liveNodes.length === 0 &&
        liveReadyResources.liveMaterials.length === 0 &&
        liveReadyResources.liveTextures.length === 0 &&
        signatureMatches(baseline, ignoredTextures),
      `node=${liveReadyResources.liveNodes.length}, material=${liveReadyResources.liveMaterials.length}, texture=${liveReadyResources.liveTextures.length}`
    )
  );
};

const runValidation = async () => {
  if (running) {
    return;
  }
  browserErrors.length = 0;
  const loggerErrorsAtStart = Logger.errorsCount;
  running = true;
  runButton.disabled = true;
  if (displayedContext) {
    disposeStageContext(displayedContext);
    displayedContext = null;
  }
  const checks: CheckResult[] = [];
  window.__T02_VALIDATION__ = { status: "running", checks };
  summary.textContent = "検証中";
  results.replaceChildren();
  const baseline = sceneSignature();
  try {
    await validateProceduralStages(baseline, checks);
    await validateGlbStage(baseline, checks);
    const finalDefinition = await loadStageDefinition(stageSelections[2]);
    const finalProceduralContext = await buildStageContext(scene, finalDefinition);
    disposeStageContext(finalProceduralContext);
    checks.push(
      createCheck(
        "JSON→GLB→JSON切り替え",
        signatureMatches(
          baseline,
          new Set(
            scene.environmentBRDFTexture
              ? [scene.environmentBRDFTexture]
              : []
          )
        ),
        `最終破棄後 mesh=${scene.meshes.length}, material=${scene.materials.length}, texture=${scene.textures.length}, transform=${scene.transformNodes.length}`
      )
    );
    displayedContext = await buildStageContext(
      scene,
      await loadStageDefinition(glbSelection)
    );
    await waitForSceneResources();
  } catch (error) {
    checks.push(
      createCheck(
        "検証処理",
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  } finally {
    await waitForSceneResources();
    const loggerErrorCount = Logger.errorsCount - loggerErrorsAtStart;
    checks.push(
      createCheck(
        "非同期エラー監視",
        loggerErrorCount === 0 && browserErrors.length === 0,
        `Babylon Logger=${loggerErrorCount}, browser=${browserErrors.join(" | ") || "なし"}`
      )
    );
    const failed = checks.some((check) => !check.ok);
    window.__T02_VALIDATION__ = {
      status: failed ? "failed" : "passed",
      checks
    };
    renderResults(checks);
    running = false;
    runButton.disabled = false;
  }
};

runButton.addEventListener("click", () => void runValidation());
window.addEventListener("resize", () => engine.resize());
engine.runRenderLoop(() => scene.render());
void runValidation();
