import type { Vector3 } from "@babylonjs/core";

export type V2ActorKind = "player" | "npc" | "bit";

export type V2ActorSphere = Readonly<{
  id: string;
  kind: V2ActorKind;
  center: Vector3;
  radius: number;
}>;

export type V2HumanTargetSnapshot = Readonly<{
  id: string;
  kind: "player" | "npc";
  footPosition: Vector3;
  aimPosition: Vector3;
  collisionRadius: number;
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

export type V2BeamRequest = Readonly<{
  sourceId: string;
  origin: Vector3;
  direction: Vector3;
  speed: number;
  maximumLifetime: number;
}>;
