import {
  MaterialPluginBase,
  PBRBaseMaterial,
  RegisterMaterialPlugin,
  StandardMaterial,
  type Material,
  type Scene
} from "@babylonjs/core";

import { V2DepthPeelingRenderer } from "./v2DepthPeelingRenderer";

// alpha=0の面は色にも深度層にも参加しない。texture・instance・visibilityを
// すべて掛けた後に判定し、透明PNGの矩形や消えた光線を遮蔽物にしない。
class V2TransparentAlphaPlugin extends MaterialPluginBase {
  private readonly colorVariable: string;

  constructor(material: Material, colorVariable: string) {
    super(material, "V2TransparentAlpha", 200, {}, true, true);
    this.colorVariable = colorVariable;
  }

  override getCustomCode(shaderType: string) {
    return shaderType === "fragment"
      ? {
          CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
#ifdef ORDER_INDEPENDENT_TRANSPARENCY
if (${this.colorVariable}.a <= 0.0) { discard; }
#endif
`
        }
      : null;
  }
}

const transparentScenes = new WeakSet<Scene>();
// 材質の生成時に登録する。描画直前の走査では、遅延生成される既定材質や
// 事前コンパイル済みの光線材質に間に合わない。
const createTransparentAlphaPlugin = (material: Material) => {
  if (
    transparentScenes.has(material.getScene()) &&
    (material instanceof StandardMaterial || material instanceof PBRBaseMaterial)
  ) {
    return new V2TransparentAlphaPlugin(
      material,
      material instanceof PBRBaseMaterial ? "finalColor" : "color"
    );
  }
  return null;
};

/** new Scene の直後、材質や Runtime を生成する前に呼ぶ。 */
export const configureV2TransparentDepthComposition = (scene: Scene) => {
  // Babylonは最後のEngine.disposeでfactory一覧を消す。Scene開始時に
  // 同名factoryを登録し、Engineを再生成しても同じshader契約を適用する。
  RegisterMaterialPlugin("V2TransparentAlpha", createTransparentAlphaPlugin);
  transparentScenes.add(scene);
  // 既定rendererを生成して即破棄すると非同期shader compileと競合するため、
  // 最初から専用rendererを登録し、Sceneの破棄通知で所有資源を解放する。
  const renderer = new V2DepthPeelingRenderer(scene);
  scene.depthPeelingRenderer = renderer;
  scene.useOrderIndependentTransparency = true;
  scene.onDisposeObservable.addOnce(() => renderer.dispose());

  return Object.freeze({ renderer });
};
