import { TargetInfo } from "./types";

export const findTargetById = (targets: TargetInfo[], id: string | null) =>
  id ? targets.find((target) => target.id === id) ?? null : null;
