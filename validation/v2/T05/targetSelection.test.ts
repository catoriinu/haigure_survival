import {
  selectV2TargetSelectionPersonality,
  type V2TargetSelectionActorKind,
  type V2TargetSelectionPersonality
} from "../../../src/v2/combatTypes";

export type TargetSelectionTestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

const executeTest = (
  name: string,
  operation: () => string
): TargetSelectionTestResult => {
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

const testStablePersonalityVectors = () => {
  const vectors: readonly Readonly<{
    actorKind: V2TargetSelectionActorKind;
    actorId: string;
    expected: V2TargetSelectionPersonality;
  }>[] = Object.freeze([
    Object.freeze({
      actorKind: "npc",
      actorId: "npc_0",
      expected: "nearest-visible"
    }),
    Object.freeze({
      actorKind: "npc",
      actorId: "npc_1",
      expected: "persistent"
    }),
    Object.freeze({
      actorKind: "bit",
      actorId: "v2_bit_0",
      expected: "persistent"
    }),
    Object.freeze({
      actorKind: "bit",
      actorId: "v2_bit_1",
      expected: "nearest-visible"
    })
  ]);
  for (const vector of vectors) {
    const first = selectV2TargetSelectionPersonality(
      vector.actorKind,
      vector.actorId
    );
    const second = selectV2TargetSelectionPersonality(
      vector.actorKind,
      vector.actorId
    );
    assert(
      first === vector.expected && second === vector.expected,
      `${vector.actorKind}:${vector.actorId}の個性が固定vectorと一致しません。`
    );
  }
  return vectors
    .map(
      ({ actorKind, actorId, expected }) =>
        `${actorKind}:${actorId}=${expected}`
    )
    .join(" / ");
};

const testIndependentBalancedActorKinds = () => {
  const sampleCount = 4_096;
  const nearestCounts = new Map<V2TargetSelectionActorKind, number>();
  for (const actorKind of ["npc", "bit"] as const) {
    let nearestCount = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      if (
        selectV2TargetSelectionPersonality(
          actorKind,
          `${actorKind}-${index}`
        ) === "nearest-visible"
      ) {
        nearestCount += 1;
      }
    }
    nearestCounts.set(actorKind, nearestCount);
    assert(
      nearestCount >= sampleCount * 0.48 &&
        nearestCount <= sampleCount * 0.52,
      `${actorKind}の個性分布が50%許容範囲外です: ${nearestCount}/${sampleCount}`
    );
  }
  assert(
    selectV2TargetSelectionPersonality("npc", "v2_bit_0") !==
      selectV2TargetSelectionPersonality("bit", "v2_bit_0"),
    "同じIDを持つNPCとBITがactor種別を区別していません。"
  );
  return `npc=${nearestCounts.get("npc")}/${sampleCount} / bit=${nearestCounts.get("bit")}/${sampleCount}`;
};

export const runTargetSelectionTests = () =>
  Object.freeze([
    executeTest(
      "個体ID固定ハッシュvector",
      testStablePersonalityVectors
    ),
    executeTest(
      "NPC・BIT独立50%分布",
      testIndependentBalancedActorKinds
    )
  ]);
