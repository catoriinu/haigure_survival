import { FreeCamera, Vector3 } from "@babylonjs/core";
import { CharacterState } from "../game/types";
import type { GamePhase } from "../game/flow";

export type InputHandlerOptions = {
  canvas: HTMLCanvasElement;
  camera: FreeCamera;
  getGamePhase: () => GamePhase;
  getPlayerState: () => CharacterState;
  isBrainwashState: (state: CharacterState) => boolean;
  getBrainwashChoiceStarted: () => boolean;
  getBrainwashChoiceUnlocked: () => boolean;
  isUiPointerTarget: (target: EventTarget | null) => boolean;
  onPointerLockRequest: () => void;
  onStartGame: () => void;
  onEnterEpilogue: () => void;
  onReturnToTitle: () => void;
  onUndoRoulette: () => void;
  onReplayExecution: () => void;
  onSelectBrainwashOption: (state: CharacterState) => void;
  onMoveKey: (
    key: "forward" | "back" | "left" | "right",
    pressed: boolean
  ) => void;
  onPlayerFire: (origin: Vector3, direction: Vector3) => void;
};

export const setupInputHandlers = ({
  canvas,
  camera,
  getGamePhase,
  getPlayerState,
  isBrainwashState,
  getBrainwashChoiceStarted,
  getBrainwashChoiceUnlocked,
  isUiPointerTarget,
  onPointerLockRequest,
  onStartGame,
  onEnterEpilogue,
  onReturnToTitle,
  onUndoRoulette,
  onReplayExecution,
  onSelectBrainwashOption,
  onMoveKey,
  onPlayerFire
}: InputHandlerOptions) => {
  const handleMoveKey = (code: string, pressed: boolean) => {
    if (code === "KeyW") {
      onMoveKey("forward", pressed);
      return;
    }
    if (code === "KeyS") {
      onMoveKey("back", pressed);
      return;
    }
    if (code === "KeyA") {
      onMoveKey("left", pressed);
      return;
    }
    if (code === "KeyD") {
      onMoveKey("right", pressed);
    }
  };
  const releaseMoveKeys = () => {
    onMoveKey("forward", false);
    onMoveKey("back", false);
    onMoveKey("left", false);
    onMoveKey("right", false);
  };

  canvas.addEventListener("click", () => {
    onPointerLockRequest();
  });
  window.addEventListener("contextmenu", (event) => {
    if (isUiPointerTarget(event.target)) {
      return;
    }
    const gamePhase = getGamePhase();
    if (gamePhase === "title") {
      event.preventDefault();
      return;
    }
    if (
      gamePhase === "assemblyMove" ||
      gamePhase === "assemblyHold" ||
      gamePhase === "execution"
    ) {
      event.preventDefault();
    }
  });

  window.addEventListener("keydown", (event) => {
    handleMoveKey(event.code, true);
    const gamePhase = getGamePhase();
    const playerState = getPlayerState();
    if (event.code === "Enter") {
      if (gamePhase === "playing" && isBrainwashState(playerState)) {
        onEnterEpilogue();
        return;
      }
      if (
        gamePhase === "assemblyMove" ||
        gamePhase === "assemblyHold" ||
        gamePhase === "execution" ||
        gamePhase === "roulette"
      ) {
        onReturnToTitle();
      }
    }

    if (event.code === "KeyR") {
      if (gamePhase === "roulette") {
        onUndoRoulette();
        return;
      }
      if (gamePhase === "playing" && getBrainwashChoiceStarted()) {
        onStartGame();
        return;
      }
      if (gamePhase === "execution") {
        onReplayExecution();
      }
    }

    if (gamePhase === "playing" && getBrainwashChoiceUnlocked()) {
      if (event.code === "KeyG") {
        onSelectBrainwashOption("brainwash-complete-gun");
        return;
      }
      if (event.code === "KeyN") {
        onSelectBrainwashOption("brainwash-complete-no-gun");
        return;
      }
      if (event.code === "KeyH") {
        onSelectBrainwashOption("brainwash-complete-haigure");
      }
    }

  });

  window.addEventListener("keyup", (event) => {
    handleMoveKey(event.code, false);
  });
  window.addEventListener("blur", () => {
    releaseMoveKeys();
  });

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (isUiPointerTarget(event.target)) {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      const gamePhase = getGamePhase();
      if (gamePhase === "title") {
        onStartGame();
        return;
      }
      if (gamePhase !== "playing" && gamePhase !== "execution") {
        return;
      }
      if (getPlayerState() !== "brainwash-complete-gun") {
        return;
      }
      const ray = camera.getForwardRay();
      const direction = ray.direction.normalize();
      if (direction.length() < 0.001) {
        return;
      }
      const origin = ray.origin.add(direction.scale(0.1));
      onPlayerFire(origin, direction);
    },
    { capture: true }
  );
};
