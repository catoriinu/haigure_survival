import { createV2AlertCoordinator } from "../../../src/v2/alertCoordinator";

export type AlertCoordinatorTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => string
): AlertCoordinatorTestResult => {
  try {
    return Object.freeze({
      name,
      ok: true,
      detail: operation()
    });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail:
        error instanceof Error
          ? error.stack ?? error.message
          : String(error)
    });
  }
};

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const runAlertCoordinatorTests =
  (): readonly AlertCoordinatorTestResult[] => [
    executeTest(
      "同一更新内のAlert Snapshotを共有し過去Snapshotを不変に保つ",
      () => {
        const coordinator = createV2AlertCoordinator({
          alertDuration: 5
        });
        coordinator.publish([
          Object.freeze({
            leaderId: "leader",
            targetId: "target"
          })
        ]);
        const first = coordinator.getActiveAlerts();
        const repeated = coordinator.getActiveAlerts();
        assert(
          first === repeated && coordinator.activeCount === 1,
          "同一状態のAlert Snapshotが共有されていません。"
        );

        coordinator.update(1);
        const next = coordinator.getActiveAlerts();
        assert(
          next !== first &&
            first[0].remainingSeconds === 5 &&
            next[0].remainingSeconds === 4,
          "更新後のSnapshotまたは過去Snapshotの不変契約が不正です。"
        );

        coordinator.clear();
        assert(
          coordinator.activeCount === 0 &&
            coordinator.getActiveAlerts().length === 0,
          "clear後にAlertが残っています。"
        );
        return "同一状態共有、更新後再構築、過去Snapshot不変";
      }
    )
  ];
