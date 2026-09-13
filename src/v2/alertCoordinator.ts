import type {
  V2AlertRequest,
  V2ExternalAlert
} from "./combatTypes";

export type V2AlertCoordinatorOptions = Readonly<{
  alertDuration: number;
}>;

export type V2AlertCoordinator = {
  readonly activeCount: number;
  update(delta: number): void;
  publish(requests: readonly V2AlertRequest[]): void;
  getActiveAlerts(): readonly V2ExternalAlert[];
  clear(): void;
};

type ActiveAlert = {
  leaderId: string;
  targetId: string;
  remainingSeconds: number;
};

const assertFiniteNonNegative = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}には0以上の有限値が必要です。`);
  }
};

const assertIdentifier = (name: string, value: string) => {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name}には前後空白のない非空IDが必要です。`);
  }
};

const buildAlertKey = (leaderId: string, targetId: string) =>
  `${leaderId}\u0000${targetId}`;

export const createV2AlertCoordinator = ({
  alertDuration
}: V2AlertCoordinatorOptions): V2AlertCoordinator => {
  if (!Number.isFinite(alertDuration) || alertDuration <= 0) {
    throw new Error("alertDurationには0より大きい有限値が必要です。");
  }

  const alerts = new Map<string, ActiveAlert>();
  let activeSnapshot: readonly V2ExternalAlert[] | null = null;

  return {
    get activeCount() {
      return alerts.size;
    },
    update: (delta) => {
      assertFiniteNonNegative("delta", delta);
      if (alerts.size > 0 && delta > 0) {
        activeSnapshot = null;
      }
      for (const [key, alert] of alerts) {
        alert.remainingSeconds -= delta;
        if (alert.remainingSeconds <= 0) {
          alerts.delete(key);
        }
      }
    },
    publish: (requests) => {
      if (requests.length > 0) {
        activeSnapshot = null;
      }
      for (const request of requests) {
        assertIdentifier("leaderId", request.leaderId);
        assertIdentifier("targetId", request.targetId);
        if (request.leaderId === request.targetId) {
          throw new Error("alertのleaderIdとtargetIdは異なる必要があります。");
        }
        const key = buildAlertKey(request.leaderId, request.targetId);
        alerts.set(key, {
          leaderId: request.leaderId,
          targetId: request.targetId,
          remainingSeconds: alertDuration
        });
      }
    },
    getActiveAlerts: () => {
      activeSnapshot ??= Object.freeze(
        [...alerts.values()].map((alert) =>
          Object.freeze({
            leaderId: alert.leaderId,
            targetId: alert.targetId,
            remainingSeconds: alert.remainingSeconds
          })
        )
      );
      return activeSnapshot;
    },
    clear: () => {
      alerts.clear();
      activeSnapshot = null;
    }
  };
};
