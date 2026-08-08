export type V2RuntimeEventTarget = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
>;

export interface V2RuntimeSessionEventScope {
  listen(
    target: V2RuntimeEventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void;
  getSubscriptionCount(): number;
  dispose(): void;
}

export type V2ManagedRuntimeSession = Readonly<{
  dispose(): Promise<void>;
}>;

export type V2RuntimeSessionTransitionOptions<
  TSession extends V2ManagedRuntimeSession
> = Readonly<{
  currentSession: TSession | null;
  nextRuntimeSeed(): number;
  isCancelled(): boolean;
  exitPointerLock(): void;
  showLoading(): void;
  createSession(runtimeSeed: number): Promise<TSession>;
}>;

export const transitionV2RuntimeSession = async <
  TSession extends V2ManagedRuntimeSession
>({
  currentSession,
  nextRuntimeSeed,
  isCancelled,
  exitPointerLock,
  showLoading,
  createSession
}: V2RuntimeSessionTransitionOptions<TSession>): Promise<TSession | null> => {
  exitPointerLock();
  showLoading();
  await currentSession?.dispose();
  if (isCancelled()) {
    return null;
  }
  const nextSession = await createSession(nextRuntimeSeed());
  if (isCancelled()) {
    await nextSession.dispose();
    return null;
  }
  return nextSession;
};

type V2RuntimeEventSubscription = Readonly<{
  target: V2RuntimeEventTarget;
  type: string;
  listener: EventListener;
  options: boolean | AddEventListenerOptions | undefined;
}>;

export const createV2RuntimeSessionEventScope =
  (): V2RuntimeSessionEventScope => {
    const subscriptions: V2RuntimeEventSubscription[] = [];
    let disposed = false;

    const assertActive = (): void => {
      if (disposed) {
        throw new Error(
          "破棄済みのV2 Runtime session購読scopeは使用できません。"
        );
      }
    };

    return Object.freeze({
      listen: (
        target: V2RuntimeEventTarget,
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions
      ) => {
        assertActive();
        target.addEventListener(type, listener, options);
        subscriptions.push(
          Object.freeze({ target, type, listener, options })
        );
      },
      getSubscriptionCount: () => subscriptions.length,
      dispose: () => {
        assertActive();
        for (let index = subscriptions.length - 1; index >= 0; index -= 1) {
          const subscription = subscriptions[index];
          subscription.target.removeEventListener(
            subscription.type,
            subscription.listener,
            subscription.options
          );
        }
        subscriptions.length = 0;
        disposed = true;
      }
    });
  };
