import {
  createV2RuntimeSessionEventScope,
  transitionV2RuntimeSession,
  type V2ManagedRuntimeSession
} from "../../../src/v2/runtimeSessionLifecycle";

import { assert, assertThrows, executeTest } from "./testUtils";

export const runRuntimeSessionLifecycleTests = async () => {
  const results = await Promise.all([
    executeTest("Runtime session再生成の購読残留0", () => {
      const target = new EventTarget();
      let firstSessionCalls = 0;
      let secondSessionCalls = 0;

      const first = createV2RuntimeSessionEventScope();
      first.listen(target, "runtime-frame", () => {
        firstSessionCalls += 1;
      });
      first.listen(target, "runtime-input", () => {
        firstSessionCalls += 1;
      });
      assert(
        first.getSubscriptionCount() === 2,
        "最初のsession購読数が2件ではありません。"
      );
      target.dispatchEvent(new Event("runtime-frame"));
      target.dispatchEvent(new Event("runtime-input"));
      first.dispose();
      assert(
        first.getSubscriptionCount() === 0,
        "最初のsession破棄後に購読が残っています。"
      );

      const second = createV2RuntimeSessionEventScope();
      second.listen(target, "runtime-frame", () => {
        secondSessionCalls += 1;
      });
      second.listen(target, "runtime-input", () => {
        secondSessionCalls += 1;
      });
      target.dispatchEvent(new Event("runtime-frame"));
      target.dispatchEvent(new Event("runtime-input"));
      assert(
        firstSessionCalls === 2 && secondSessionCalls === 2,
        `再生成後に旧購読が発火しました: first=${firstSessionCalls}, second=${secondSessionCalls}`
      );
      second.dispose();
      target.dispatchEvent(new Event("runtime-frame"));
      assert(
        second.getSubscriptionCount() === 0 && secondSessionCalls === 2,
        "2回目のsession破棄後に購読または発火が残っています。"
      );
      return "session A/Bとも破棄後0件、再生成時は現行sessionだけ発火";
    }),
    executeTest("破棄済み購読scopeの再利用拒否", () => {
      const target = new EventTarget();
      const scope = createV2RuntimeSessionEventScope();
      scope.dispose();
      assertThrows(
        () => scope.listen(target, "runtime-frame", () => {}),
        "破棄済みscopeへのlistenが拒否されません。"
      );
      assertThrows(
        () => scope.dispose(),
        "破棄済みscopeの二重disposeが拒否されません。"
      );
      return "listenと二重disposeを例外として拒否";
    }),
    executeTest("タイトル復帰はPointer Lock解除後に停止状態で再生成する", async () => {
      const events: string[] = [];
      const previousSession: V2ManagedRuntimeSession = Object.freeze({
        dispose: async () => {
          events.push("dispose-old");
        }
      });
      const nextSession: V2ManagedRuntimeSession = Object.freeze({
        dispose: async () => {
          events.push("dispose-new");
        }
      });
      const transitioned = await transitionV2RuntimeSession({
        currentSession: previousSession,
        nextRuntimeSeed: () => 0x5430_0601,
        isCancelled: () => false,
        exitPointerLock: () => {
          events.push("exit-pointer-lock");
        },
        showLoading: () => {
          events.push("show-loading");
        },
        createSession: async () => {
          events.push("create-new");
          return nextSession;
        }
      });
      assert(
        transitioned === nextSession &&
          events.join("|") ===
            "exit-pointer-lock|show-loading|dispose-old|create-new",
        `タイトル復帰のsession順序が不正です: ${events.join("|")}`
      );
      return `order=${events.join("|")} / 自動開始なし`;
    }),
    executeTest("連続再生成後も現行sessionの購読だけを1件残す", async () => {
      const target = new EventTarget();
      let subscriptionCount = 0;
      let dispatchCount = 0;
      const getSubscriptionCount = (): number => subscriptionCount;

      const createSession = async (
        _runtimeSeed: number
      ): Promise<V2ManagedRuntimeSession> => {
        const scope = createV2RuntimeSessionEventScope();
        scope.listen(target, "runtime-frame", () => {
          dispatchCount += 1;
        });
        subscriptionCount += 1;
        return Object.freeze({
          dispose: async () => {
            scope.dispose();
            subscriptionCount -= 1;
          }
        });
      };

      let session = await createSession(0x5430_0601);
      for (let index = 0; index < 3; index += 1) {
        const nextSession = await transitionV2RuntimeSession({
          currentSession: session,
          nextRuntimeSeed: () => 0x5430_0601,
          isCancelled: () => false,
          exitPointerLock: () => {},
          showLoading: () => {},
          createSession
        });
        assert(
          nextSession !== null,
          "終了していない連続再生成が中止されました。"
        );
        session = nextSession;
        target.dispatchEvent(new Event("runtime-frame"));
      }
      assert(
        getSubscriptionCount() === 1 && dispatchCount === 3,
        `再生成中に購読が残留しました: subscriptions=${getSubscriptionCount()}, dispatch=${dispatchCount}`
      );
      await session.dispose();
      target.dispatchEvent(new Event("runtime-frame"));
      assert(
        getSubscriptionCount() === 0 && dispatchCount === 3,
        `最終破棄後に購読が残留しました: subscriptions=${getSubscriptionCount()}, dispatch=${dispatchCount}`
      );
      return "3回再生成後1件、最終破棄後0件";
    }),
    executeTest(
      "beforeunloadは旧session破棄後の再生成を中止する",
      async () => {
        const events: string[] = [];
        let terminated = false;
        const transitioned = await transitionV2RuntimeSession({
          currentSession: Object.freeze({
            dispose: async () => {
              events.push("dispose-old");
              terminated = true;
            }
          }),
          nextRuntimeSeed: () => 0x5430_0601,
          isCancelled: () => terminated,
          exitPointerLock: () => {},
          showLoading: () => {
            events.push("show-loading");
          },
          createSession: async () => {
            events.push("create-new");
            throw new Error(
              "終了後に新sessionを生成してはいけません。"
            );
          }
        });
        assert(
          transitioned === null &&
            events.join("|") === "show-loading|dispose-old",
          `旧session破棄後の終了判定が不正です: ${events.join("|")}`
        );
        return "旧session破棄完了時に終了済みならfactoryを呼ばずnullを返す";
      }
    ),
    executeTest(
      "beforeunloadは生成済み新sessionを即時破棄する",
      async () => {
        const events: string[] = [];
        let terminated = false;
        const nextSession: V2ManagedRuntimeSession = Object.freeze({
          dispose: async () => {
            events.push("dispose-new");
          }
        });
        const transitioned = await transitionV2RuntimeSession({
          currentSession: null,
          nextRuntimeSeed: () => 0x5430_0601,
          isCancelled: () => terminated,
          exitPointerLock: () => {},
          showLoading: () => {
            events.push("show-loading");
          },
          createSession: async () => {
            events.push("create-new");
            terminated = true;
            return nextSession;
          }
        });
        assert(
          transitioned === null &&
            events.join("|") ===
              "show-loading|create-new|dispose-new",
          `新session生成後の終了判定が不正です: ${events.join("|")}`
        );
        return "新session生成中に終了した場合は即dispose";
      }
    ),
    executeTest(
      "再生成ごとに開始地点用session seedを1件だけ採番する",
      async () => {
        const availableSeeds = [0x5430_0601, 0x5430_0602];
        const createdSeeds: number[] = [];
        const createSession = async (
          runtimeSeed: number
        ): Promise<V2ManagedRuntimeSession> => {
          createdSeeds.push(runtimeSeed);
          return Object.freeze({ dispose: async () => {} });
        };
        let session = await createSession(availableSeeds.shift()!);
        const nextSession = await transitionV2RuntimeSession({
          currentSession: session,
          nextRuntimeSeed: () => availableSeeds.shift()!,
          isCancelled: () => false,
          exitPointerLock: () => {},
          showLoading: () => {},
          createSession
        });
        assert(
          nextSession !== null &&
            availableSeeds.length === 0 &&
            createdSeeds.join("|") ===
              `${0x5430_0601}|${0x5430_0602}`,
          `session seedの採番が不正です: created=${createdSeeds.join("|")}, remaining=${availableSeeds.length}`
        );
        session = nextSession;
        await session.dispose();
        return `初回=${createdSeeds[0]} / 再生成=${createdSeeds[1]}`;
      }
    )
  ]);

  return results;
};
