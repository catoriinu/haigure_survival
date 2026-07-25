import type { Vector3 } from "@babylonjs/core";

export type V2ActorKind = "player" | "npc" | "bit";

export type V2HumanKind = "player" | "npc";

export type V2CharacterState =
  | "normal"
  | "evade"
  | "hit-a"
  | "hit-b"
  | "brainwash-in-progress"
  | "brainwash-complete-gun"
  | "brainwash-complete-no-gun"
  | "brainwash-complete-haigure"
  | "brainwash-complete-haigure-formation";

export const isV2AliveState = (state: V2CharacterState) =>
  state === "normal" || state === "evade";

export const isV2HitState = (state: V2CharacterState) =>
  state === "hit-a" || state === "hit-b";

export const isV2BrainwashState = (state: V2CharacterState) =>
  state === "brainwash-in-progress" ||
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun" ||
  state === "brainwash-complete-haigure" ||
  state === "brainwash-complete-haigure-formation";

export type V2PlayerCompletionState =
  | "brainwash-complete-gun"
  | "brainwash-complete-no-gun"
  | "brainwash-complete-haigure";

export const isV2PlayerCompletionState = (
  state: V2CharacterState
): state is V2PlayerCompletionState =>
  state === "brainwash-complete-gun" ||
  state === "brainwash-complete-no-gun" ||
  state === "brainwash-complete-haigure";

export type V2ActorSphere = Readonly<{
  id: string;
  kind: V2ActorKind;
  center: Vector3;
  radius: number;
}>;

export type V2EllipsoidHitShape = Readonly<{
  center: Vector3;
  radii: Vector3;
}>;

export type V2HumanTargetSnapshot = Readonly<{
  id: string;
  kind: V2HumanKind;
  footPosition: Vector3;
  aimPosition: Vector3;
  hitShape: V2EllipsoidHitShape;
  state: V2CharacterState;
  alive: boolean;
  brainwashed: boolean;
}>;

export type V2TargetProvenance = "visual" | "alert";

export type V2AlertRequest = Readonly<{
  leaderId: string;
  targetId: string;
}>;

export type V2ExternalAlert = Readonly<{
  leaderId: string;
  targetId: string;
  remainingSeconds: number;
}>;

export type V2BeamOriginKind =
  | "bit-chase"
  | "bit-fixed"
  | "bit-random"
  | "bit-carpet"
  | "npc-gun"
  | "player-gun"
  | "execution-bit"
  | "execution-npc"
  | "execution-player";

export type V2BeamTargetPolicy =
  | Readonly<{
      kind: "alive-humans";
    }>
  | Readonly<{
      kind: "execution-assigned";
      targetIds: readonly string[];
    }>
  | Readonly<{
      kind: "execution-manual";
      targetIds: readonly string[];
    }>;

export type V2BeamRequest = Readonly<{
  sourceId: string;
  originKind: V2BeamOriginKind;
  targetPolicy: V2BeamTargetPolicy;
  origin: Vector3;
  direction: Vector3;
  speed: number;
  maximumLifetime: number;
}>;
