import {
  createV2RuntimeSessionEventScope
} from "../../../src/v2/runtimeSessionLifecycle";

import { assert, assertThrows, executeTest } from "./testUtils";

export const runRuntimeSessionLifecycleTests = async () =>
  Promise.all([
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
    })
  ]);
