import type { Scene } from "@babylonjs/core";

import {
  createV2CharacterVisualRuntime,
  type V2CharacterVisualRuntime
} from "../../src/v2/v2CharacterVisualRuntime";
import {
  V2_DEFAULT_PORTRAIT_DIRECTORY,
  type V2CharacterAssignments
} from "../../src/v2/v2CharacterAssignments";

export const createDefaultV2CharacterVisualRuntime = async (
  scene: Scene,
  actorIds: readonly string[]
): Promise<V2CharacterVisualRuntime> => {
  const assignments: V2CharacterAssignments = Object.freeze(
    actorIds.map((actorId) =>
      Object.freeze({
        actorId,
        voiceProfileId: "01",
        portraitDirectory: V2_DEFAULT_PORTRAIT_DIRECTORY
      })
    )
  );
  return createV2CharacterVisualRuntime({
    scene,
    assignments,
    orientationMode: "camera-facing"
  });
};
