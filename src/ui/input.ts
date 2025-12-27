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
  onPointerLockRequest: () => void;
  onStartGame: () => void;
  onEnterEpilogue: () => void;
  onReturnToTitle: () => void;
  onSelectBrainwashOption: (state: CharacterState) => void;
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
  onPointerLockRequest,
  onStartGame,
  onEnterEpilogue,
  onReturnToTitle,
  onSelectBrainwashOption,
  onPlayerFire
}: InputHandlerOptions) => {
  canvas.addEventListener("click", () => {
    onPointerLockRequest();
  });

  window.addEventListener("keydown", (event) => {
    const gamePhase = getGamePhase();
    const playerState = getPlayerState();
    if (event.code === "Enter") {
      if (gamePhase === "playing" && isBrainwashState(playerState)) {
        onEnterEpilogue();
        return;
      }
      if (gamePhase === "assemblyMove" || gamePhase === "assemblyHold") {
        onReturnToTitle();
      }
    }

    if (event.code === "KeyR") {
      if (gamePhase === "playing" && getBrainwashChoiceStarted()) {
        onStartGame();
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

  window.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const gamePhase = getGamePhase();
    if (gamePhase === "title") {
      onStartGame();
      return;
    }
    if (gamePhase !== "playing") {
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
    const origin = ray.origin.add(direction.scale(1.2));
    onPlayerFire(origin, direction);
  });
};
