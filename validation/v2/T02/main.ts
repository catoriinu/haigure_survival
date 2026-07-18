import {
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  Scene,
  Vector3
} from "@babylonjs/core";
import {
  buildStageContext,
  disposeStageContext,
  type StageContext
} from "../../../src/world/stageContext";
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

const signatureMatches = (baseline: ReturnType<typeof sceneSignature>) =>
  scene.meshes.every((item) => baseline.meshes.has(item)) &&
  scene.meshes.length === baseline.meshes.size &&
  scene.materials.every((item) => baseline.materials.has(item)) &&
  scene.materials.length === baseline.materials.size &&
  scene.textures.every((item) => baseline.textures.has(item)) &&
  scene.textures.length === baseline.textures.size &&
  scene.transformNodes.every((item) => baseline.transformNodes.has(item)) &&
  scene.transformNodes.length === baseline.transformNodes.size;

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
  const managedNodes = [
    ...(context.resources.assetContainer?.meshes ?? []),
    ...(context.resources.assetContainer?.transformNodes ?? [])
  ];
  const replacementContext = await buildStageContext(scene, definition);
  const replacementNodes = [
    ...(replacementContext.resources.assetContainer?.meshes ?? []),
    ...(replacementContext.resources.assetContainer?.transformNodes ?? [])
  ];
  disposeStageContext(context);
  const undisposedNodes = managedNodes.filter((node) => !node.isDisposed());
  checks.push(
    createCheck(
      "T01 GLB: 先行ロード後の旧破棄",
      undisposedNodes.length === 0 &&
        replacementContext.resources.authoredMeshes.every(
          (mesh) => !mesh.isDisposed()
        ),
      `oldUndisposed=${undisposedNodes.map((node) => node.name).join(",") || "なし"}, replacementMesh=${replacementContext.resources.authoredMeshes.length}`
    )
  );
  disposeStageContext(replacementContext);
  const undisposedReplacementNodes = replacementNodes.filter(
    (node) => !node.isDisposed()
  );
  checks.push(
    createCheck(
      "T01 GLB: AssetContainer破棄",
      undisposedReplacementNodes.length === 0 && signatureMatches(baseline),
      `managed=${replacementNodes.length}, undisposed=${undisposedReplacementNodes.map((node) => node.name).join(",") || "なし"}, scene mesh=${scene.meshes.length}, material=${scene.materials.length}, texture=${scene.textures.map((texture) => texture.name).join(",") || "なし"}, transform=${scene.transformNodes.length}`
    )
  );
};

const runValidation = async () => {
  if (running) {
    return;
  }
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
        signatureMatches(baseline),
        `最終破棄後 mesh=${scene.meshes.length}, material=${scene.materials.length}, texture=${scene.textures.length}, transform=${scene.transformNodes.length}`
      )
    );
    displayedContext = await buildStageContext(
      scene,
      await loadStageDefinition(glbSelection)
    );
  } catch (error) {
    checks.push(
      createCheck(
        "検証処理",
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
  } finally {
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
