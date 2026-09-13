import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, StandardMaterial, Vector3 } from "@babylonjs/core";
import { createBitGroundShadowFixture } from "./bitGroundShadow.test";
import { configureV2TransparentDepthComposition } from "../../../src/v2/v2TransparentDepthComposition";

const views: { dispose(): void }[] = [];
for (const [label, angle, intensity] of [
  ["正面", -Math.PI / 2, 0.9], ["背面", Math.PI / 2, 0.9],
  ["暗い条件の正面", -Math.PI / 2, 0.2]
] as const) {
  for (const before of [true, false]) {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    caption.textContent = `${label}・${before ? "変更前" : "変更後"}`;
    const canvas = document.createElement("canvas");
    canvas.width = 720; canvas.height = 480;
    figure.append(caption, canvas); document.querySelector("main")!.append(figure);
    const engine = new Engine(canvas, true);
    const fixture = createBitGroundShadowFixture(engine, 1);
    configureV2TransparentDepthComposition(fixture.scene);
    fixture.bits.prepareForScriptedPhase(); fixture.bits.setAiSuspended(true); fixture.update();
    const root = fixture.scene.getTransformNodeByName("v2_bit_0")!;
    fixture.bits.faceBitsAt([{ id: root.name, aimPosition: root.position.add(new Vector3(0, 0, -1)) }]);
    for (const mesh of fixture.scene.meshes) {
      if ((!mesh.name.startsWith("v2_bit_") && !mesh.name.startsWith("v2Bit") && !mesh.name.startsWith("v2RedBit")) || mesh.name.includes("shadow")) mesh.setEnabled(false);
    }
    if (before) {
      fixture.scene.getMeshByName("v2_bit_0_muzzle")!.scaling.setAll(0.03 / 0.033);
      const body = fixture.scene.getMaterialByName("v2BitBodyMaterial") as StandardMaterial;
      body.specularColor.set(0.35, 0.35, 0.4); body.specularPower = 64;
      const muzzle = fixture.scene.getMaterialByName("v2BitMuzzleMaterial") as StandardMaterial;
      muzzle.specularColor.set(0, 0, 0);
    }
    const light = new HemisphericLight("通常ゲーム照明", new Vector3(0.35, 1, -0.25), fixture.scene);
    light.intensity = intensity; light.groundColor = new Color3(0.16, 0.2, 0.22);
    fixture.scene.clearColor = new Color4(0.48, 0.72, 0.92, 1);
    const camera = new ArcRotateCamera("比較カメラ", angle, Math.PI / 2, 0.35, root.position.clone(), fixture.scene);
    camera.minZ = 0.01; fixture.scene.activeCamera = camera;
    engine.runRenderLoop(() => fixture.scene.render());
    views.push({ dispose: () => { fixture.dispose(); engine.dispose(); } });
  }
}
window.addEventListener("beforeunload", () => { for (const view of views) view.dispose(); });
