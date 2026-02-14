export type DynamicBeamPhase = "inactive" | "warning" | "active";

export type DynamicBeamCell = {
  row: number;
  col: number;
  centerX: number;
  centerZ: number;
};

export type DynamicBeamSet = {
  cells: DynamicBeamCell[];
  centerX: number;
  centerZ: number;
};
