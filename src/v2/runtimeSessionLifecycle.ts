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
