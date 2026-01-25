import { Hud } from "../ui/hud";

type FadePhase = "none" | "out" | "in";

export const createFadeController = (hud: Hud, duration: number) => {
  let fadeOpacity = 0;
  let fadePhase: FadePhase = "none";
  let fadeNext: (() => void) | null = null;

  const beginFadeOut = (next: () => void) => {
    fadePhase = "out";
    fadeOpacity = 0;
    fadeNext = next;
    hud.setFadeOpacity(fadeOpacity);
  };

  const updateFade = (delta: number) => {
    if (fadePhase === "none") {
      return;
    }
    const step = delta / duration;
    if (fadePhase === "out") {
      fadeOpacity = Math.min(1, fadeOpacity + step);
      hud.setFadeOpacity(fadeOpacity);
      if (fadeOpacity >= 1) {
        if (fadeNext) {
          const next = fadeNext;
          fadeNext = null;
          next();
        }
        fadePhase = "in";
      }
      return;
    }
    fadeOpacity = Math.max(0, fadeOpacity - step);
    hud.setFadeOpacity(fadeOpacity);
    if (fadeOpacity <= 0) {
      fadePhase = "none";
    }
  };

  const resetFade = () => {
    fadePhase = "none";
    fadeOpacity = 0;
    fadeNext = null;
    hud.setFadeOpacity(0);
  };

  return {
    beginFadeOut,
    updateFade,
    resetFade,
    isFading: () => fadePhase !== "none"
  };
};
