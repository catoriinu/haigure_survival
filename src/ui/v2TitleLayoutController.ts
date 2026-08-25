export type V2TitleLayoutMode = "wide" | "compact" | "stacked";

export type V2TitleLayoutElements = Readonly<{
  overlay: HTMLDivElement;
  center: HTMLDivElement;
  settingsRoot: HTMLDivElement;
  settingsViewport: HTMLDivElement;
  settingsContent: HTMLDivElement;
}>;

export type V2TitleLayoutController = Readonly<{
  getMode(): V2TitleLayoutMode;
  refresh(): void;
  dispose(): void;
}>;

export const resolveV2TitleLayoutMode = (
  width: number,
  height: number
): V2TitleLayoutMode => {
  if (width >= 1180 && height >= 700) {
    return "wide";
  }
  if (width >= 720 && height >= 520) {
    return "compact";
  }
  return "stacked";
};

const NEXT_MODE = Object.freeze({
  wide: "compact",
  compact: "stacked",
  stacked: "stacked"
} satisfies Readonly<Record<V2TitleLayoutMode, V2TitleLayoutMode>>);

const fitsHorizontally = (
  overlay: HTMLDivElement,
  elements: readonly HTMLElement[]
): boolean => {
  const overlayRect = overlay.getBoundingClientRect();
  return elements.every((element) => {
    if (element.hidden || getComputedStyle(element).display === "none") {
      return true;
    }
    const rect = element.getBoundingClientRect();
    return (
      rect.left >= overlayRect.left - 1 &&
      rect.right <= overlayRect.right + 1
    );
  });
};

export const createV2TitleLayoutController = ({
  overlay,
  center,
  settingsRoot,
  settingsViewport,
  settingsContent
}: V2TitleLayoutElements): V2TitleLayoutController => {
  let mode: V2TitleLayoutMode = "wide";
  let disposed = false;
  let refreshFrame: number | null = null;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("破棄済みのV2タイトルlayout controllerは使用できません。");
    }
  };

  const applyMode = (nextMode: V2TitleLayoutMode): void => {
    mode = nextMode;
    overlay.dataset.titleLayout = nextMode;
  };

  const refreshNow = (): void => {
    refreshFrame = null;
    const previousMode = mode;
    const rootScrollTop = settingsRoot.scrollTop;
    const viewportScrollTop = settingsViewport.scrollTop;
    const { width, height } = overlay.getBoundingClientRect();
    applyMode(resolveV2TitleLayoutMode(width, height));
    while (
      mode === "wide" &&
      !fitsHorizontally(overlay, [center, settingsRoot, settingsViewport, settingsContent])
    ) {
      applyMode(NEXT_MODE[mode]);
    }
    if (previousMode === "stacked" && mode !== "stacked") {
      settingsViewport.scrollTop = rootScrollTop;
    } else if (previousMode !== "stacked" && mode === "stacked") {
      settingsRoot.scrollTop = viewportScrollTop;
    } else {
      settingsRoot.scrollTop = rootScrollTop;
      settingsViewport.scrollTop = viewportScrollTop;
    }
  };

  const scheduleRefresh = (): void => {
    if (refreshFrame !== null) {
      cancelAnimationFrame(refreshFrame);
    }
    refreshFrame = requestAnimationFrame(refreshNow);
  };

  const observer = new ResizeObserver(scheduleRefresh);
  observer.observe(overlay);
  observer.observe(center);
  observer.observe(settingsRoot);
  observer.observe(settingsViewport);
  observer.observe(settingsContent);
  refreshNow();

  return Object.freeze({
    getMode: () => {
      assertActive();
      return mode;
    },
    refresh: () => {
      assertActive();
      refreshNow();
    },
    dispose: () => {
      assertActive();
      if (refreshFrame !== null) {
        cancelAnimationFrame(refreshFrame);
      }
      observer.disconnect();
      delete overlay.dataset.titleLayout;
      disposed = true;
    }
  });
};
