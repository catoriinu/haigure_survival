import { Vector3 } from "@babylonjs/core";

export type TrapWallSide = "north" | "south" | "west" | "east";

export type TrapFloorCandidate = {
  kind: "floor";
  row: number;
  col: number;
  centerX: number;
  centerZ: number;
};

export type TrapWallCandidate = {
  kind: "wall";
  row: number;
  col: number;
  side: TrapWallSide;
  boundaryX: number;
  boundaryZ: number;
  direction: Vector3;
  rotationY: number;
};

export type TrapCandidate = TrapFloorCandidate | TrapWallCandidate;

export type TrapPhase = "inactive" | "charging" | "waiting_clear" | "interval";
