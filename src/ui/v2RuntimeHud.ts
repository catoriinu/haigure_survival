import {
  Matrix,
  Vector3,
  Viewport,
  type Camera
} from "@babylonjs/core";

import type { StageDoorInteractionCandidate } from "../world/stageDoorRuntime";
import type {
  V2NpcCommandCandidate,
  V2NpcCommandMode
} from "../v2/npcSystem";
import type {
  V2BroadcastInteractionCandidate,
  V2RuntimeInteractionFeedback
} from "../v2/runtimeInteraction";
import type { V2SurvivalFrame } from "../v2/survivalRuntime";

export type V2RuntimeHudFrame = Pick<
  V2SurvivalFrame,
  | "phase"
  | "playerState"
  | "playerCompletionUnlocked"
  | "executionPlayerRole"
>;

export const canV2RuntimePlayerFire = (
  frame: V2RuntimeHudFrame
): boolean =>
  (frame.phase === "playing" &&
    frame.playerState === "brainwash-complete-gun") ||
  (frame.phase === "execution" &&
    frame.executionPlayerRole === "shooter");

export type V2RuntimeHudUpdate = Readonly<{
  active: boolean;
  frame: V2RuntimeHudFrame;
  broadcastCandidate: V2BroadcastInteractionCandidate | null;
  npcCandidates: readonly V2NpcCommandCandidate[];
  doorCandidates: readonly StageDoorInteractionCandidate[];
  feedback: readonly V2RuntimeInteractionFeedback[];
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
const NPC_IDLE_COLOR = "#61e8ff";
const NPC_FOLLOW_COLOR = "#9cff57";
const DOOR_COLOR = "#ffd166";
const BROADCAST_COLOR = "#d98cff";
const BROADCAST_PRIMARY_COLOR = NPC_FOLLOW_COLOR;
const BROADCAST_SECONDARY_COLOR = NPC_IDLE_COLOR;
const FEEDBACK_ANIMATION_DURATION_MS = 180;
const GUIDE_INACTIVE_COLOR = "#f5f5f5";
const PLAYER_MODE_COLORS = Object.freeze({
  gun: NPC_FOLLOW_COLOR,
  "no-gun": NPC_IDLE_COLOR,
  haigure: DOOR_COLOR
});
type PlayerMode = keyof typeof PLAYER_MODE_COLORS;

const resolvePlayerMode = (
  state: V2RuntimeHudFrame["playerState"]
): PlayerMode | null => {
  switch (state) {
    case "brainwash-complete-gun":
      return "gun";
    case "brainwash-complete-no-gun":
      return "no-gun";
    case "brainwash-in-progress":
    case "brainwash-complete-haigure":
    case "brainwash-complete-haigure-formation":
      return "haigure";
    case "normal":
    case "evade":
    case "hit-a":
    case "hit-b":
      return null;
  }
};

const applyStyles = (
  element: HTMLElement,
  styles: Readonly<Partial<CSSStyleDeclaration>>
): void => {
  Object.assign(element.style, styles);
};

const createTargetMarker = (
  document: Document,
  kind: "npc" | "door" | "broadcast",
  color: string,
  prompt: string
): TargetMarker => {
  const root = document.createElement("div");
  root.dataset.v2RuntimeHudRole = `${kind}-target`;
  root.dataset.v2RuntimeHudColor = color;
  root.hidden = true;
  applyStyles(root, {
    position: "fixed",
    width: `${TARGET_MARKER_SIZE_PX}px`,
    height: `${TARGET_MARKER_SIZE_PX}px`,
    boxSizing: "border-box",
    border: `2px solid ${color}`,
    borderRadius: kind === "npc" ? "50%" : "4px",
    boxShadow: `0 0 8px ${color}`,
    color,
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

const applyTargetMarkerColor = (
  marker: TargetMarker,
  color: string
): void => {
  if (marker.root.dataset.v2RuntimeHudColor === color) {
    return;
  }
  marker.root.style.borderColor = color;
  marker.root.style.boxShadow = `0 0 8px ${color}`;
  marker.root.style.color = color;
  marker.label.style.borderColor = color;
  marker.label.style.color = color;
  marker.root.dataset.v2RuntimeHudColor = color;
};

const setElementHidden = (
  element: HTMLElement,
  hidden: boolean
): void => {
  if (element.hidden !== hidden) {
    element.hidden = hidden;
  }
};

const setStylePixelValue = (
  style: CSSStyleDeclaration,
  property: "left" | "top",
  value: number
): void => {
  const nextValue = `${value}px`;
  if (style[property] !== nextValue) {
    style[property] = nextValue;
  }
};

const resolveNpcMarkerColor = (
  commandMode: V2NpcCommandMode
): string =>
  commandMode === "follow" ? NPC_FOLLOW_COLOR : NPC_IDLE_COLOR;

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
    translate: "-50% 0",
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
    NPC_IDLE_COLOR,
    "F: 同行 / E: 離脱"
  );
  const doorMarker = createTargetMarker(
    document,
    "door",
    DOOR_COLOR,
    "C: 扉を開閉"
  );
  const broadcastMarker = createTargetMarker(
    document,
    "broadcast",
    BROADCAST_COLOR,
    "F: 体育館に集まって"
  );
  const completionGuide = createGuide(
    document,
    "completion-guide",
    ""
  );
  completionGuide.style.whiteSpace = "pre";
  const completionOptions = ([
    ["gun", "G：銃あり 左クリック：発射"],
    ["no-gun", "N：銃なし"],
    ["haigure", "H：ハイグレポーズ"]
  ] as const).map(([mode, text]) => {
    const label = document.createElement("span");
    label.dataset.v2RuntimeHudMode = mode;
    label.textContent = text;
    label.style.color = GUIDE_INACTIVE_COLOR;
    return { mode, label };
  });
  completionGuide.append(
    completionOptions[0].label,
    document.createTextNode("  "),
    completionOptions[1].label,
    document.createTextNode("  "),
    completionOptions[2].label
  );

  const crosshair = createCrosshair(document);
  const fireGuide = createGuide(
    document,
    "fire-guide",
    "左クリック：発射"
  );
  root.append(
    npcMarker.root,
    broadcastMarker.root,
    doorMarker.root,
    completionGuide,
    crosshair,
    fireGuide
  );
  host.appendChild(root);

  let disposed = false;
  let currentNpcTargetId: string | null = null;
  let currentBroadcastTargetId: string | null = null;
  let currentBroadcastOption: "primary" | "secondary" | null = null;
  let currentDoorTargetId: string | null = null;
  let currentPlayerMode: PlayerMode | null = null;
  let feedbackAnimationRevision = 0;
  const globalViewport = new Viewport(0, 0, 0, 0);
  const projectedPosition = Vector3.Zero();

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2RuntimeHudControllerは使用できません。");
    }
  };

  const hideElements = (): void => {
    setElementHidden(npcMarker.root, true);
    setElementHidden(broadcastMarker.root, true);
    setElementHidden(doorMarker.root, true);
    setElementHidden(completionGuide, true);
    setElementHidden(crosshair, true);
    setElementHidden(fireGuide, true);
  };

  const clearElementFeedback = (element: HTMLElement): void => {
    if (element.style.animation.length > 0) {
      element.style.removeProperty("animation");
    }
    if (element.dataset.v2RuntimeHudFeedback !== undefined) {
      delete element.dataset.v2RuntimeHudFeedback;
    }
  };

  const clearTargetState = (): void => {
    currentNpcTargetId = null;
    currentBroadcastTargetId = null;
    currentBroadcastOption = null;
    currentDoorTargetId = null;
    currentPlayerMode = null;
    clearElementFeedback(npcMarker.root);
    clearElementFeedback(broadcastMarker.root);
    clearElementFeedback(doorMarker.root);
    clearElementFeedback(completionGuide);
  };

  const pulseElement = (element: HTMLElement): void => {
    feedbackAnimationRevision += 1;
    const animationName =
      feedbackAnimationRevision % 2 === 0
        ? "v2-runtime-target-feedback-even"
        : "v2-runtime-target-feedback-odd";
    element.style.animation = "none";
    void element.offsetWidth;
    element.style.animation =
      `${animationName} ${FEEDBACK_ANIMATION_DURATION_MS}ms linear 1`;
    element.dataset.v2RuntimeHudFeedback =
      String(feedbackAnimationRevision);
  };

  const updatePlayerMode = (frame: V2RuntimeHudFrame): void => {
    const nextMode = resolvePlayerMode(frame.playerState);
    if (nextMode === currentPlayerMode) {
      return;
    }
    if (nextMode !== null) {
      const color = PLAYER_MODE_COLORS[nextMode];
      completionGuide.style.color = color;
      completionGuide.style.borderColor = color;
      completionGuide.dataset.v2RuntimeHudMode = nextMode;
      for (const option of completionOptions) {
        option.label.style.color = option.mode === nextMode
          ? color
          : GUIDE_INACTIVE_COLOR;
      }
      if (currentPlayerMode !== null) {
        pulseElement(completionGuide);
      }
    }
    currentPlayerMode = nextMode;
  };

  const projectTarget = (
    marker: TargetMarker,
    position: Vector3,
    canvasRect: DOMRect,
    transformationMatrix: Matrix
  ): void => {
    Vector3.ProjectToRef(
      position,
      WORLD_MATRIX,
      transformationMatrix,
      globalViewport,
      projectedPosition
    );
    if (
      projectedPosition.z < 0 ||
      projectedPosition.z > 1 ||
      projectedPosition.x < globalViewport.x ||
      projectedPosition.x > globalViewport.x + globalViewport.width ||
      projectedPosition.y < globalViewport.y ||
      projectedPosition.y > globalViewport.y + globalViewport.height
    ) {
      setElementHidden(marker.root, true);
      return;
    }
    setStylePixelValue(
      marker.root.style,
      "left",
      canvasRect.left + projectedPosition.x - TARGET_MARKER_OFFSET_PX
    );
    setStylePixelValue(
      marker.root.style,
      "top",
      canvasRect.top + projectedPosition.y - TARGET_MARKER_OFFSET_PX
    );
    setElementHidden(marker.root, false);
  };

  const updateCenteredGuides = (canvasRect: DOMRect): void => {
    const centerX =
      canvasRect.left + globalViewport.x + globalViewport.width / 2;
    const centerY =
      canvasRect.top + globalViewport.y + globalViewport.height / 2;
    setStylePixelValue(crosshair.style, "left", centerX);
    setStylePixelValue(crosshair.style, "top", centerY);
    setStylePixelValue(fireGuide.style, "left", centerX);
    setStylePixelValue(
      fireGuide.style,
      "top",
      canvasRect.top +
        globalViewport.y +
        globalViewport.height -
        48
    );
    setStylePixelValue(completionGuide.style, "left", centerX);
    setStylePixelValue(
      completionGuide.style,
      "top",
      canvasRect.top +
        globalViewport.y +
        globalViewport.height -
        48
    );
  };

  return {
    update: ({
      active,
      frame,
      broadcastCandidate,
      npcCandidates,
      doorCandidates,
      feedback
    }) => {
      assertActive();
      if (!active) {
        hideElements();
        clearTargetState();
        return;
      }

      const canvasRect = canvas.getBoundingClientRect();
      camera.viewport.toGlobalToRef(
        canvasRect.width,
        canvasRect.height,
        globalViewport
      );
      updateCenteredGuides(canvasRect);
      const playerCanFire = canV2RuntimePlayerFire(frame);
      if (frame.phase !== "playing") {
        setElementHidden(npcMarker.root, true);
        setElementHidden(broadcastMarker.root, true);
        setElementHidden(doorMarker.root, true);
        setElementHidden(completionGuide, true);
        setElementHidden(crosshair, !playerCanFire);
        setElementHidden(fireGuide, !playerCanFire);
        clearTargetState();
        return;
      }
      const transformationMatrix = camera.getTransformationMatrix();
      const npcCandidate = npcCandidates[0];
      const nextNpcTargetId =
        broadcastCandidate === null ? npcCandidate?.npcId ?? null : null;
      if (nextNpcTargetId !== currentNpcTargetId) {
        clearElementFeedback(npcMarker.root);
        currentNpcTargetId = nextNpcTargetId;
      }
      if (npcCandidate && broadcastCandidate === null) {
        const commandFeedback = feedback.find(
          (event) =>
            event.kind === "npc-command-changed" &&
            event.npcId === npcCandidate.npcId
        );
        const commandMode =
          commandFeedback?.kind === "npc-command-changed"
            ? commandFeedback.commandMode
            : npcCandidate.commandMode;
        applyTargetMarkerColor(
          npcMarker,
          resolveNpcMarkerColor(commandMode)
        );
        projectTarget(
          npcMarker,
          npcCandidate.aimPosition,
          canvasRect,
          transformationMatrix
        );
        if (commandFeedback) {
          pulseElement(npcMarker.root);
        }
      } else {
        setElementHidden(npcMarker.root, true);
      }
      const nextBroadcastTargetId =
        broadcastCandidate?.consoleId ?? null;
      if (nextBroadcastTargetId !== currentBroadcastTargetId) {
        clearElementFeedback(broadcastMarker.root);
        currentBroadcastTargetId = nextBroadcastTargetId;
        currentBroadcastOption = null;
      }
      if (broadcastCandidate) {
        const broadcastFeedback = feedback.find(
          (event) =>
            event.kind === "broadcast-command-started" &&
            event.consoleId === broadcastCandidate.consoleId
        );
        if (broadcastFeedback?.kind === "broadcast-command-started") {
          currentBroadcastOption = broadcastFeedback.option;
        }
        applyTargetMarkerColor(
          broadcastMarker,
          currentBroadcastOption === "primary"
            ? BROADCAST_PRIMARY_COLOR
            : currentBroadcastOption === "secondary"
              ? BROADCAST_SECONDARY_COLOR
              : BROADCAST_COLOR
        );
        broadcastMarker.label.textContent =
          broadcastCandidate.secondary === null
            ? `F: ${broadcastCandidate.primary.label}`
            : `F: ${broadcastCandidate.primary.label} / E: ${broadcastCandidate.secondary.label}`;
        projectTarget(
          broadcastMarker,
          broadcastCandidate.aimPosition,
          canvasRect,
          transformationMatrix
        );
        if (broadcastFeedback) {
          pulseElement(broadcastMarker.root);
        }
      } else {
        setElementHidden(broadcastMarker.root, true);
      }
      const doorCandidate = doorCandidates[0];
      const nextDoorTargetId = doorCandidate?.door.id ?? null;
      if (nextDoorTargetId !== currentDoorTargetId) {
        clearElementFeedback(doorMarker.root);
        currentDoorTargetId = nextDoorTargetId;
      }
      if (doorCandidate) {
        projectTarget(
          doorMarker,
          doorCandidate.interactionPosition,
          canvasRect,
          transformationMatrix
        );
        if (
          feedback.some(
            (event) =>
              event.kind === "door-toggle-started" &&
              event.doorId === doorCandidate.door.id
          )
        ) {
          pulseElement(doorMarker.root);
        }
      } else {
        setElementHidden(doorMarker.root, true);
      }

      updatePlayerMode(frame);
      setElementHidden(
        completionGuide,
        !frame.playerCompletionUnlocked
      );
      setElementHidden(crosshair, !playerCanFire);
      setElementHidden(fireGuide, true);
    },
    clear: () => {
      assertActive();
      hideElements();
      clearTargetState();
    },
    dispose: () => {
      assertActive();
      hideElements();
      clearTargetState();
      disposed = true;
      root.remove();
    }
  };
};
