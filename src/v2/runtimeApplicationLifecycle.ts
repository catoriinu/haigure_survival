export type V2ConstructionOwnerRequest<T> = Readonly<{
  create(): Promise<T>;
  isCancelled(): boolean;
  dispose(owner: T): void;
  label: string;
}>;

export const acquireV2ConstructionOwner = async <T>(
  request: V2ConstructionOwnerRequest<T>
): Promise<T> => {
  const owner = await request.create();
  if (!request.isCancelled()) {
    return owner;
  }
  request.dispose(owner);
  throw new Error(`${request.label}の構築中にアプリケーションが終了しました。`);
};

type SynchronousDynamicSession = Readonly<{
  disposeSynchronously(): void;
}>;

type SynchronousStaticResources = Readonly<{
  cancelSessionConstructionSynchronously(): void;
  dispose(): void;
}>;

export type V2RuntimeApplicationTerminationDependencies = Readonly<{
  eventTarget: Pick<Window, "addEventListener">;
  markTerminated(): void;
  stopRenderLoop(): void;
  markPageUnloading(): void;
  takeConstructionRollback(): (() => void) | null;
  takeDynamicSession(): SynchronousDynamicSession | null;
  disposeApplicationUi(): void;
  takeStaticResources(): SynchronousStaticResources | null;
  disposeAmbientLight(): void;
  disposeScene(): void;
  disposeEngine(): void;
}>;

export type V2RuntimeApplicationTerminationCoordinator = Readonly<{
  isTerminated(): boolean;
  terminate(): void;
}>;

export const installV2RuntimeApplicationTermination = (
  dependencies: V2RuntimeApplicationTerminationDependencies
): V2RuntimeApplicationTerminationCoordinator => {
  let terminated = false;
  const terminate = () => {
    if (terminated) {
      return;
    }
    terminated = true;
    dependencies.markTerminated();
    dependencies.stopRenderLoop();
    dependencies.markPageUnloading();
    const rollback = dependencies.takeConstructionRollback();
    if (rollback !== null) {
      rollback();
    }
    const dynamicSession = dependencies.takeDynamicSession();
    if (dynamicSession !== null) {
      dynamicSession.disposeSynchronously();
    }
    dependencies.disposeApplicationUi();
    const staticResources = dependencies.takeStaticResources();
    if (staticResources !== null) {
      staticResources.cancelSessionConstructionSynchronously();
      staticResources.dispose();
    }
    dependencies.disposeAmbientLight();
    dependencies.disposeScene();
    dependencies.disposeEngine();
  };
  dependencies.eventTarget.addEventListener("beforeunload", terminate, {
    once: true
  });
  return Object.freeze({
    isTerminated: () => terminated,
    terminate
  });
};
