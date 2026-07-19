import type { TransformNode, Vector3 } from "@babylonjs/core";

export const STAGE_MOVER_KINDS = ["player", "npc", "bit"] as const;

export type StageMoverKind = (typeof STAGE_MOVER_KINDS)[number];

export const STAGE_LINK_KINDS = [
  "ladder",
  "elevator",
  "teleport",
  "bit_window",
  "bit_roof"
] as const;

export type StageLinkKind = (typeof STAGE_LINK_KINDS)[number];

export type StageLinkEndpointName = "A" | "B";

export type StageLinkEndpoint = Readonly<{
  endpoint: StageLinkEndpointName;
  position: Vector3;
  node: TransformNode;
}>;

export type StageLinkPair = Readonly<{
  id: string;
  kind: StageLinkKind;
  bidirectional: boolean;
  radiusMeters: number;
  endpointA: StageLinkEndpoint;
  endpointB: StageLinkEndpoint;
}>;

export interface StageLinkRegistry {
  readonly all: readonly StageLinkPair[];
  getById(id: string): StageLinkPair | null;
  getByKind(kind: StageLinkKind): readonly StageLinkPair[];
}

export const canStageMoverUseLink = (
  moverKind: StageMoverKind,
  linkKind: StageLinkKind
) =>
  linkKind === "bit_window" || linkKind === "bit_roof"
    ? moverKind === "bit"
    : true;

export const createStageLinkRegistry = (
  pairs: readonly StageLinkPair[]
): StageLinkRegistry => {
  const all = Object.freeze([...pairs]);
  const byId = new Map(all.map((pair) => [pair.id, pair]));
  const byKind = new Map<StageLinkKind, readonly StageLinkPair[]>();
  for (const kind of STAGE_LINK_KINDS) {
    byKind.set(
      kind,
      Object.freeze(all.filter((pair) => pair.kind === kind))
    );
  }
  return Object.freeze({
    all,
    getById: (id: string) => byId.get(id) ?? null,
    getByKind: (kind: StageLinkKind) => byKind.get(kind)!
  });
};
