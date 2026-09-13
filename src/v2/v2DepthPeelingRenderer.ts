import {
  Constants,
  DepthPeelingRenderer,
  EffectWrapper,
  Material,
  RenderTargetTexture,
  Texture,
  type Color4,
  type EffectRenderer,
  type Engine,
  type MultiRenderTarget,
  type Scene,
  type SmartArray,
  type SubMesh,
  type ThinTexture,
} from "@babylonjs/core";

/**
 * Babylon 6.49 の DepthPeelingRenderer 内部契約への接続はこの型と関数に集約する。
 * texture 作成・bind・不透明 prepass との共有・最終合成は基底実装を再利用する。
 * 更新時は透明合成 fixture で材質状態、端の残層、resize/dispose も確認する。
 */
type BabylonDepthPeelingInternals = {
  _scene: Scene;
  _engine: Engine;
  _depthMrts: MultiRenderTarget[];
  _colorMrts: MultiRenderTarget[];
  _blendBackMrt: MultiRenderTarget;
  _thinTextures: ThinTexture[];
  _effectRenderer: EffectRenderer;
  _blendBackEffectWrapper: EffectWrapper;
  _currentPingPongState: number;
  _layoutCache: number[][];
  _colorCache: Color4[];
  _candidateSubMeshes: SmartArray<SubMesh>;
  _excludedSubMeshes: SmartArray<SubMesh>;
  _excludedMeshes: number[];
  _finalCompose(writeId: number): void;
};

const internalsOf = (
  renderer: DepthPeelingRenderer
) => {
  const state = renderer as unknown as BabylonDepthPeelingInternals;
  return {
    state,
    prePassRenderer: state._scene.prePassRenderer as unknown as {
      _enabled: boolean;
    },
  };
};

type ReductionLevel = {
  sourceWidth: number;
  sourceHeight: number;
  target: RenderTargetTexture;
};

const REMAINING_DEPTH_FRAGMENT_SHADER = `
precision highp float;
precision highp int;
uniform sampler2D sourceTexture;
uniform ivec2 sourceSize;
uniform bool sourceIsDepth;
void main() {
  ivec2 first = ivec2(gl_FragCoord.xy) * 4;
  float occupied = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      ivec2 point = first + ivec2(x, y);
      if (all(lessThan(point, sourceSize))) {
        vec4 value = texelFetch(sourceTexture, point, 0);
        // 未処理層の depth は (-z, z)、空領域は (-99999, -99999)。
        // 近遠面の z=0/1 と画面端の単独 pixel も残層として保持する。
        float present = sourceIsDepth ? (value.g >= 0.0 ? 1.0 : 0.0) : value.r;
        occupied = max(occupied, present);
      }
    }
  }
  gl_FragColor = vec4(occupied, 0.0, 0.0, 1.0);
}
`;

/**
 * 透明面を前後 2 層ずつ合成し、残層がなくなるまで継続する。
 * passCount は同期確認を挟む batch の大きさであり、描画層数の上限ではない。
 * WebGL2 の同期 render 用。基底の useRenderPasses は既定の false を使用する。
 */
export class V2DepthPeelingRenderer extends DepthPeelingRenderer {
  private readonly reductionEffect: EffectWrapper;
  private readonly reductionLevels: ReductionLevel[] = [];
  private readonly reductionPixel = new Uint8Array(4);
  private reductionWidth = 0;
  private reductionHeight = 0;

  /** 直前の描画で実行した dual peeling 回数。実画面での負荷検証にも使う。 */
  public lastPassCount = 0;
  public lastReductionCount = 0;

  public constructor(scene: Scene) {
    super(scene, 4);
    this.reductionEffect = new EffectWrapper({
      engine: scene.getEngine(),
      name: "v2RemainingTransparentDepth",
      fragmentShader: REMAINING_DEPTH_FRAGMENT_SHADER,
      samplerNames: ["sourceTexture"],
      uniformNames: ["sourceSize", "sourceIsDepth"],
    });
  }

  public override isReady(): boolean {
    if (!super.isReady() || !this.reductionEffect.effect.isReady()) {
      return false;
    }
    this.updateReductionTargets();
    return true;
  }

  public override render(
    transparentSubMeshes: SmartArray<SubMesh>
  ): SmartArray<SubMesh> {
    const { state, prePassRenderer } = internalsOf(this);
    const engine = state._engine;
    const scene = state._scene;
    state._candidateSubMeshes.length = 0;
    state._excludedSubMeshes.length = 0;
    this.lastPassCount = 0;
    this.lastReductionCount = 0;
    if (!this.isReady()) {
      return state._excludedSubMeshes;
    }

    for (let i = 0; i < transparentSubMeshes.length; i++) {
      const subMesh = transparentSubMeshes.data[i];
      const material = subMesh.getMaterial();
      const fillMode =
        material && subMesh.getRenderingMesh()._getRenderingFillMode(material.fillMode);
      if (
        material &&
        (fillMode === Material.TriangleFanDrawMode ||
          fillMode === Material.TriangleFillMode ||
          fillMode === Material.TriangleStripDrawMode) &&
        !state._excludedMeshes.includes(subMesh.getMesh().uniqueId)
      ) {
        state._candidateSubMeshes.push(subMesh);
      } else {
        state._excludedSubMeshes.push(subMesh);
      }
    }

    const savedViewport = engine.currentViewport;
    const savedDepthMask = engine.getDepthWrite();
    const savedDepthTest = engine.getDepthBuffer();
    const savedAlphaMode = engine.getAlphaMode();
    const savedAlphaEquation = engine.getAlphaEquation();
    const savedPrePassEnabled = prePassRenderer._enabled;
    try {
      this.useCameraViewport();
      if (state._candidateSubMeshes.length === 0) {
        this.clearColorTarget(1);
        state._finalCompose(1);
        return state._excludedSubMeshes;
      }

      prePassRenderer._enabled = false;
      this.clearDepthTarget(0, state._colorCache[0]);
      this.clearDepthTarget(1, state._colorCache[1]);
      this.clearColorTarget(0);
      this.clearColorTarget(1);

      engine.bindFramebuffer(state._depthMrts[0].renderTarget!);
      engine.bindAttachments(state._layoutCache[0]);
      this.setDepthCollectionState(true);
      state._currentPingPongState = 1;
      this.renderCandidates();
      engine.unBindFramebuffer(state._depthMrts[0].renderTarget!);
      scene.resetCachedMaterial();

      let writeId = 0;
      let hasRemainingDepth: boolean;
      do {
        for (let batchPass = 0; batchPass < this.passCount; batchPass++) {
          const readId = this.lastPassCount % 2;
          writeId = 1 - readId;
          state._currentPingPongState = readId;
          this.useCameraViewport();
          this.clearDepthTarget(writeId, state._colorCache[0]);
          this.clearColorTarget(writeId);
          engine.bindFramebuffer(state._depthMrts[writeId].renderTarget!);
          engine.bindAttachments(state._layoutCache[2]);
          this.setDepthCollectionState(false);
          this.renderCandidates();
          engine.unBindFramebuffer(state._depthMrts[writeId].renderTarget!);
          scene.resetCachedMaterial();

          engine.bindFramebuffer(state._blendBackMrt.renderTarget!);
          engine.bindAttachments(state._layoutCache[0]);
          engine.setAlphaEquation(Constants.ALPHA_EQUATION_ADD);
          engine.setAlphaMode(Constants.ALPHA_LAYER_ACCUMULATE);
          engine.applyStates();
          engine.enableEffect(state._blendBackEffectWrapper._drawWrapper);
          state._blendBackEffectWrapper.effect.setTexture(
            "uBackColor",
            state._thinTextures[writeId * 3 + 2]
          );
          state._effectRenderer.render(state._blendBackEffectWrapper);
          engine.unBindFramebuffer(state._blendBackMrt.renderTarget!);
          this.lastPassCount++;
        }
        hasRemainingDepth = this.hasRemainingDepth(writeId);
      } while (hasRemainingDepth);

      state._finalCompose(writeId);
      return state._excludedSubMeshes;
    } finally {
      prePassRenderer._enabled = savedPrePassEnabled;
      engine.setAlphaEquation(savedAlphaEquation);
      engine.setAlphaMode(savedAlphaMode);
      engine.setDepthWrite(savedDepthMask);
      engine.setDepthBuffer(savedDepthTest);
      if (savedViewport !== null) {
        engine.setViewport(savedViewport);
      }
      scene.resetCachedMaterial();
    }
  }

  private useCameraViewport(): void {
    const { state } = internalsOf(this);
    if (state._scene.activeCamera) {
      state._engine.setViewport(state._scene.activeCamera.viewport);
    }
  }

  private clearDepthTarget(index: number, color: Color4): void {
    const { state } = internalsOf(this);
    const target = state._depthMrts[index].renderTarget!;
    state._engine.bindFramebuffer(target);
    state._engine.bindAttachments(state._layoutCache[0]);
    state._engine.clear(color, true, false, false);
    state._engine.unBindFramebuffer(target);
  }

  private clearColorTarget(index: number): void {
    const { state } = internalsOf(this);
    const target = state._colorMrts[index].renderTarget!;
    state._engine.bindFramebuffer(target);
    state._engine.bindAttachments(state._layoutCache[1]);
    state._engine.clear(state._colorCache[2], true, false, false);
    state._engine.unBindFramebuffer(target);
  }

  private setDepthCollectionState(depthTest: boolean): void {
    const engine = internalsOf(this).state._engine;
    engine.setAlphaMode(Constants.ALPHA_ONEONE_ONEONE);
    engine.setAlphaEquation(Constants.ALPHA_EQUATION_MAX);
    engine.setDepthWrite(false);
    engine.setDepthBuffer(depthTest);
    engine.applyStates();
  }

  private renderCandidates(): void {
    const { state } = internalsOf(this);
    for (let i = 0; i < state._candidateSubMeshes.length; i++) {
      const subMesh = state._candidateSubMeshes.data[i];
      const material = subMesh.getMaterial()!;
      const savedHotSwapping = material.allowShaderHotSwapping;
      const savedForceDepthWrite = material.forceDepthWrite;
      material.allowShaderHotSwapping = false;
      material.forceDepthWrite = false;
      state._engine.setDepthWrite(false);
      try {
        // backFaceCulling は変更しない。各 mesh の本来の表裏設定を使う。
        subMesh.render(false);
      } finally {
        material.allowShaderHotSwapping = savedHotSwapping;
        material.forceDepthWrite = savedForceDepthWrite;
      }
    }
  }

  private updateReductionTargets(): void {
    const { state } = internalsOf(this);
    const width = state._engine.getRenderWidth();
    const height = state._engine.getRenderHeight();
    if (width === this.reductionWidth && height === this.reductionHeight) {
      return;
    }
    this.disposeReductionTargets();
    this.reductionWidth = width;
    this.reductionHeight = height;
    let sourceWidth = width;
    let sourceHeight = height;
    do {
      const targetWidth = Math.ceil(sourceWidth / 4);
      const targetHeight = Math.ceil(sourceHeight / 4);
      const target = new RenderTargetTexture(
        `v2RemainingTransparentDepth_${this.reductionLevels.length}`,
        { width: targetWidth, height: targetHeight },
        state._scene,
        {
          generateMipMaps: false,
          type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
          samplingMode: Texture.NEAREST_SAMPLINGMODE,
          generateDepthBuffer: false,
          generateStencilBuffer: false,
          format: Constants.TEXTUREFORMAT_RGBA,
        }
      );
      this.reductionLevels.push({ sourceWidth, sourceHeight, target });
      sourceWidth = targetWidth;
      sourceHeight = targetHeight;
    } while (sourceWidth > 1 || sourceHeight > 1);
  }

  private hasRemainingDepth(writeId: number): boolean {
    const { state } = internalsOf(this);
    const engine = state._engine;
    engine.setAlphaEquation(Constants.ALPHA_EQUATION_ADD);
    engine.setAlphaMode(Constants.ALPHA_DISABLE);
    engine.setDepthWrite(false);
    let source = state._thinTextures[writeId * 3];
    for (let i = 0; i < this.reductionLevels.length; i++) {
      const level = this.reductionLevels[i];
      engine.enableEffect(this.reductionEffect._drawWrapper);
      this.reductionEffect.effect.setTexture("sourceTexture", source);
      this.reductionEffect.effect.setInt2(
        "sourceSize",
        level.sourceWidth,
        level.sourceHeight
      );
      this.reductionEffect.effect.setBool("sourceIsDepth", i === 0);
      state._effectRenderer.render(this.reductionEffect, level.target);
      source = level.target;
    }
    // occlusion query は同一フレームに結果を取得できないため、縮約した
    // 1 pixel だけを同期取得する。層の欠落を前フレームの推測で判定しない。
    engine._readTexturePixelsSync(
      source.getInternalTexture()!,
      1,
      1,
      -1,
      0,
      this.reductionPixel
    );
    this.lastReductionCount++;
    return this.reductionPixel[0] !== 0;
  }

  private disposeReductionTargets(): void {
    for (const level of this.reductionLevels) {
      level.target.dispose();
    }
    this.reductionLevels.length = 0;
  }

  public override dispose(): void {
    this.disposeReductionTargets();
    this.reductionEffect.dispose();
    super.dispose();
  }
}
