import {
  Matrix,
  Vector3,
  type Camera
} from "@babylonjs/core";

import type { StageDoorInteractionCandidate } from "../world/stageDoorRuntime";
import type { V2NpcCommandCandidate } from "../v2/npcSystem";
import { isV2PlayerCompletionState } from "../v2/combatTypes";
import type { V2SurvivalFrame } from "../v2/survivalRuntime";

export type V2RuntimeHudFrame = Pick<
  V2SurvivalFrame,
  | "phase"
  | "playerState"
  | "playerCompletionUnlocked"
>;

export type V2RuntimeHudUpdate = Readonly<{
  active: boolean;
  frame: V2RuntimeHudFrame;
  npcCandidates: readonly V2NpcCommandCandidate[];
  doorCandidates: readonly StageDoorInteractionCandidate[];
}>;

export type V2RuntimeHudControllerOptions = Readonly<{
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: Camera;
}>;

export interface V2RuntimeHudController {
  update(update: V2RuntimeHudUpdate): void;
  clear(): void;
  dispose(): void;
}

type TargetMarker = Readonly<{
  root: HTMLDivElement;
  label: HTMLDivElement;
}>;

const HUD_Z_INDEX = "25";
const TARGET_MARKER_SIZE_PX = 34;
const TARGET_MARKER_OFFSET_PX = TARGET_MARKER_SIZE_PX / 2;
const WORLD_MATRIX = Matrix.Identity();

const applyStyles = (
  element: HTMLElement,
  styles: Readonly<Partial<CSSStyleDeclaration>>
): void => {
  Object.assign(element.style, styles);
};

const createTargetMarker = (
  document: Document,
  kind: "npc" | "door",
  color: string,
  prompt: string
): TargetMarker => {
  const root = document.createElement("div");
  root.dataset.v2RuntimeHudRole = `${kind}-target`;
  root.hidden = true;
  applyStyles(root, {
    position: "fixed",
    width: `${TARGET_MARKER_SIZE_PX}px`,
    height: `${TARGET_MARKER_SIZE_PX}px`,
    boxSizing: "border-box",
    border: `2px solid ${color}`,
    borderRadius: kind === "npc" ? "50%" : "4px",
    boxShadow: `0 0 8px ${color}`,
    pointerEvents: "none",
    zIndex: HUD_Z_INDEX
  });

  const label = document.createElement("div");
  label.dataset.v2RuntimeHudRole = `${kind}-prompt`;
  label.textContent = prompt;
  applyStyles(label, {
    position: "absolute",
    left: "50%",
    top: `${TARGET_MARKER_SIZE_PX + 6}px`,
    transform: "translateX(-50%)",
    padding: "4px 7px",
    border: `1px solid ${color}`,
    borderRadius: "3px",
    background: "rgba(0, 0, 0, 0.72)",
    color,
    fontFamily:
      '"IBM Plex Mono", "Fira Code", ui-monospace, monospace',
    fontSize: "13px",
    letterSpacing: "0.04em",
    lineHeight: "1.2",
    whiteSpace: "nowrap"
  });
  root.appendChild(label);
  return Object.freeze({ root, label });
};

const createGuide = (
  document: Document,
  role: string,
  text: string
): HTMLDivElement => {
  const guide = document.createElement("div");
  guide.dataset.v2RuntimeHudRole = role;
  guide.textContent = text;
  guide.hidden = true;
  applyStyles(guide, {
    position: "fixed",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "5px 8px",
    border: "1px solid rgba(245, 245, 245, 0.82)",
    borderRadius: "3px",
    background: "rgba(0, 0, 0, 0.72)",
    color: "#f5f5f5",
    fontFamily:
      '"IBM Plex Mono", "Fira Code", ui-monospace, monospace',
    fontSize: "13px",
    letterSpacing: "0.04em",
    lineHeight: "1.2",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    zIndex: HUD_Z_INDEX
  });
  return guide;
};

const createCrosshair = (document: Document): HTMLDivElement => {
  const crosshair = document.createElement("div");
  crosshair.dataset.v2RuntimeHudRole = "crosshair";
  crosshair.hidden = true;
  applyStyles(crosshair, {
    position: "fixed",
    width: "18px",
    height: "18px",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
    zIndex: HUD_Z_INDEX
  });

  const horizontal = document.createElement("span");
  applyStyles(horizontal, {
    position: "absolute",
    left: "0",
    top: "8px",
    width: "18px",
    height: "2px",
    background: "#f5f5f5"
  });
  const vertical = document.createElement("span");
  applyStyles(vertical, {
    position: "absolute",
    left: "8px",
    top: "0",
    width: "2px",
    height: "18px",
    background: "#f5f5f5"
  });
  crosshair.append(horizontal, vertical);
  return crosshair;
};

export const createV2RuntimeHudController = ({
  host,
  canvas,
  camera
}: V2RuntimeHudControllerOptions): V2RuntimeHudController => {
  const document = host.ownerDocument;
  const root = document.createElement("div");
  root.dataset.v2RuntimeHud = "root";
  applyStyles(root, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: HUD_Z_INDEX
  });

  const npcMarker = createTargetMarker(
    document,
    "npc",
    "#61e8ff",
    "F: 追従 / E: 離脱"
  );
  const doorMarker = createTargetMarker(
    document,
    "door",
    "#ffd166",
    "C: 扉を開閉"
  );
  const completionGuide = createGuide(
    document,
    "completion-guide",
    "G: 銃 / N: 非武装 / H: ハイグレ"
  );

  const crosshair = createCrosshair(document);
  const fireGuide = createGuide(
    document,
    "fire-guide",
    "左クリック: 射撃"
  );
  const retryGuide = createGuide(
    document,
    "retry-guide",
    "R: リトライ"
  );

  root.append(
    npcMarker.root,
    doorMarker.root,
    completionGuide,
    crosshair,
    fireGuide,
    retryGuide
  );
  host.appendChild(root);

  let disposed = false;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2RuntimeHudControllerは使用できません。");
    }
  };

  const clearElements = (): void => {
    npcMarker.root.hidden = true;
    doorMarker.root.hidden = true;
    completionGuide.hidden = true;
    crosshair.hidden = true;
    fireGuide.hidden = true;
    retryGuide.hidden = true;
  };

  const projectTarget = (
    marker: TargetMarker,
    position: Vector3,
    canvasRect: DOMRect
  ): void => {
    const viewport = camera.viewport.toGlobal(
      canvasRect.width,
      canvasRect.height
    );
    const projected = Vector3.Project(
      position,
      WORLD_MATRIX,
      camera.getTransformationMatrix(),
      viewport
    );
    if (
      projected.z < 0 ||
      projected.z > 1 ||
      projected.x < viewport.x ||
      projected.x > viewport.x + viewport.width ||
      projected.y < viewport.y ||
      projected.y > viewport.y + viewport.height
    ) {
      marker.root.hidden = true;
      return;
    }
    marker.root.style.left =
      `${canvasRect.left + projected.x - TARGET_MARKER_OFFSET_PX}px`;
    marker.root.style.top =
      `${canvasRect.top + projected.y - TARGET_MARKER_OFFSET_PX}px`;
    marker.root.hidden = false;
  };

  const updateCenteredGuides = (canvasRect: DOMRect): void => {
    const viewport = camera.viewport.toGlobal(
      canvasRect.width,
      canvasRect.height
    );
    const centerX =
      canvasRect.left + viewport.x + viewport.width / 2;
    const centerY =
      canvasRect.top + viewport.y + viewport.height / 2;
    crosshair.style.left = `${centerX}px`;
    crosshair.style.top = `${centerY}px`;
    fireGuide.style.left = `${centerX}px`;
    fireGuide.style.top = `${centerY + 24}px`;
    completionGuide.style.left = `${centerX}px`;
    completionGuide.style.top =
      `${canvasRect.top + viewport.y + viewport.height - 48}px`;
    retryGuide.style.left = `${centerX}px`;
    retryGuide.style.top =
      `${canvasRect.top + viewport.y + viewport.height - 82}px`;
  };

  return {
    update: ({
      active,
      frame,
      npcCandidates,
      doorCandidates
    }) => {
      assertActive();
      clearElements();
      const retryLabel =
        frame.phase === "execution-complete"
          ? "R: リプレイ"
          : frame.phase === "playing" &&
              isV2PlayerCompletionState(frame.playerState)
            ? "R: リトライ"
            : null;
      if (retryLabel !== null) {
        const canvasRect = canvas.getBoundingClientRect();
        updateCenteredGuides(canvasRect);
        retryGuide.textContent = retryLabel;
        retryGuide.hidden = false;
      }
      if (!active || frame.phase !== "playing") {
        return;
      }

      const canvasRect = canvas.getBoundingClientRect();
      updateCenteredGuides(canvasRect);
      const npcCandidate = npcCandidates[0];
      if (npcCandidate) {
        projectTarget(
          npcMarker,
          npcCandidate.aimPosition,
          canvasRect
        );
      }
      const doorCandidate = doorCandidates[0];
      if (doorCandidate) {
        projectTarget(
          doorMarker,
          doorCandidate.interactionPosition,
          canvasRect
        );
      }

      completionGuide.hidden =
        !frame.playerCompletionUnlocked;
      if (frame.playerState === "brainwash-complete-gun") {
        crosshair.hidden = false;
        fireGuide.hidden = false;
      }
    },
    clear: () => {
      assertActive();
      clearElements();
    },
    dispose: () => {
      assertActive();
      clearElements();
      disposed = true;
      root.remove();
    }
  };
};
