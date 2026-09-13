export const V2_RUNTIME_CONSTRUCTION_OWNER_ORDER = Object.freeze([
  "performance",
  "camera",
  "stage",
  "player-input",
  "character-visual",
  "survival",
  "alarm-floor-visual",
  "dynamic-runtime",
  "navigation-policy",
  "traversal"
] as const);

export type V2RuntimeConstructionOwnerLabel =
  (typeof V2_RUNTIME_CONSTRUCTION_OWNER_ORDER)[number];

export type V2RuntimeConstructionRollbackStack = Readonly<{
  register(label: V2RuntimeConstructionOwnerLabel, rollback: () => void): void;
  rollback(): void;
}>;

export const createV2RuntimeConstructionRollbackStack = ():
V2RuntimeConstructionRollbackStack => {
  const entries: Array<Readonly<{
    label: V2RuntimeConstructionOwnerLabel;
    rollback(): void;
  }>> = [];
  let lastOrderIndex = -1;
  let rolledBack = false;

  return Object.freeze({
    register: (label, rollback) => {
      if (rolledBack) {
        throw new Error("rollback済みのV2 Runtime構築へownerを登録できません。");
      }
      const orderIndex = V2_RUNTIME_CONSTRUCTION_OWNER_ORDER.indexOf(label);
      if (orderIndex <= lastOrderIndex) {
        throw new Error(`V2 Runtime構築ownerの登録順が不正です: ${label}`);
      }
      lastOrderIndex = orderIndex;
      entries.push(Object.freeze({ label, rollback }));
    },
    rollback: () => {
      if (rolledBack) {
        return;
      }
      rolledBack = true;
      for (const entry of [...entries].reverse()) {
        entry.rollback();
      }
    }
  });
};
