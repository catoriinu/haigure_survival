import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";
import { createBitGroundShadowFixture, runBitGroundShadowTests } from "./bitGroundShadow.test";

const results = document.createElement("pre");
document.querySelector("main")!.before(results);
results.textContent = "回帰検証中";
void runBitGroundShadowTests().then((checks) => {
  results.textContent = checks.map((check) => `${check.ok ? "PASS" : "FAIL"}: ${check.name}\n${check.detail}`).join("\n");
});

const views = [
  { label: "出現中の球", height: 0.1, spawn: true },
  { label: "通常・高さ0.1", height: 0.1, spawn: false },
  { label: "通常・高さ0.9", height: 0.9, spawn: false },
  { label: "通常・高さ1.8", height: 1.8, spawn: false },
  { label: "通常・高さ2.7", height: 2.7, spawn: false }
].map(({ label, height, spawn }) => {
  const figure = document.createElement("figure");
  const caption = document.createElement("figcaption");
  caption.textContent = label;
  const canvas = document.createElement("canvas");
  canvas.width = 720; canvas.height = 600;
  figure.append(caption, canvas);
  document.querySelector("main")!.append(figure);
  const engine = new Engine(canvas, true);
  const fixture = createBitGroundShadowFixture(engine, 1);
  if (spawn) fixture.update(0.25);
  else { fixture.bits.prepareForScriptedPhase(); fixture.bits.setAiSuspended(true); fixture.update(); }
  const root = fixture.scene.getTransformNodeByName("v2_bit_0")!;
  const floorY = root.position.y - height;
  fixture.setFloor(floorY);
  if (!spawn) fixture.bits.faceBitsAt([{ id: root.name, aimPosition: root.position.add(new Vector3(0, -0.7, 0.7)) }]);
  fixture.update();
  for (const mesh of fixture.scene.meshes) {
    if (!mesh.name.startsWith("v2_bit_")) mesh.setEnabled(false);
  }
  const floor = MeshBuilder.CreateGround("比較用投射面", { width: 0.65, height: 0.65 }, fixture.scene);
  floor.position.set(root.position.x, floorY, root.position.z);
  const material = new StandardMaterial("比較用床材質", fixture.scene);
  material.diffuseColor = new Color3(0.8, 0.8, 0.8);
  material.specularColor = Color3.Black();
  floor.material = material;
  new HemisphericLight("照明", Vector3.Up(), fixture.scene);
  fixture.scene.clearColor = new Color4(0.94, 0.94, 0.94, 1);
  const camera = new ArcRotateCamera("比較カメラ", -Math.PI / 2, 0.5, 1.05, floor.position.clone(), fixture.scene);
  camera.minZ = 0.01;
  fixture.scene.activeCamera = camera;
  engine.runRenderLoop(() => fixture.scene.render());
  return { camera, engine, fixture };
});
for (const [id, angle] of [["left", -Math.PI * 0.75], ["front", -Math.PI / 2], ["right", -Math.PI * 0.25]] as const) {
  document.getElementById(id)!.addEventListener("click", () => {
    for (const view of views) view.camera.alpha = angle;
  });
}
window.addEventListener("beforeunload", () => {
  for (const view of views) { view.fixture.dispose(); view.engine.dispose(); }
});
