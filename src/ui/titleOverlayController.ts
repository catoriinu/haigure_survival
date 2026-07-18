export type TitleOverlayLoadingSession = {
  setTotal: (count: number) => void;
  advance: () => void;
  finish: () => void;
};

type TitleOverlayControllerOptions = {
  defaultModeMessage: string;
  instantModeMessage: string;
  startHintMessage: string;
  loadingMessageBase: string;
  loadingDotIntervalMs: number;
};

export type TitleOverlayController = {
  setInstantExecutionMode: (enabled: boolean) => void;
  setError: (message: string) => void;
  clearError: () => void;
  createLoadingSession: (initialTotal?: number) => TitleOverlayLoadingSession;
};

const getRequiredElement = <TElement extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing title overlay element: ${id}`);
  }
  return element as TElement;
};

export const createTitleOverlayController = ({
  defaultModeMessage,
  instantModeMessage,
  startHintMessage,
  loadingMessageBase,
  loadingDotIntervalMs
}: TitleOverlayControllerOptions): TitleOverlayController => {
  const titleModeElement = getRequiredElement<HTMLDivElement>("titleMode");
  const titleMessageElement = getRequiredElement<HTMLDivElement>("titleMessage");
  const titleStartHintElement =
    getRequiredElement<HTMLDivElement>("titleStartHint");
  const titleMessageStatusElement = document.createElement("span");
  const titleMessageLabelElement = document.createElement("span");
  const titleMessageDotsElement = document.createElement("span");
  const titleMessageProgressElement = document.createElement("span");

  let instantExecutionMode = false;
  let activeLoadingSessionCount = 0;
  let loadingCompleted = 0;
  let loadingTotal = 0;
  let loadingDotCount = 0;
  let loadingDotTimerId: number | null = null;
  let errorMessage: string | null = null;

  const buildTitleDots = () => ".".repeat(loadingDotCount);
  const buildTitleProgress = () => `${loadingCompleted} / ${loadingTotal}`;
  const syncModeMessage = () => {
    titleModeElement.textContent = instantExecutionMode
      ? instantModeMessage
      : defaultModeMessage;
  };
  const syncMessage = () => {
    titleMessageElement.classList.toggle(
      "title-message--error",
      errorMessage !== null
    );
    if (activeLoadingSessionCount > 0) {
      titleMessageElement.style.display = "flex";
      titleStartHintElement.style.display = "none";
      titleMessageLabelElement.textContent = loadingMessageBase;
      titleMessageDotsElement.textContent = buildTitleDots();
      titleMessageDotsElement.style.display = "";
      titleMessageProgressElement.textContent = buildTitleProgress();
      titleMessageProgressElement.style.display = "";
      return;
    }
    if (errorMessage !== null) {
      titleMessageElement.style.display = "flex";
      titleStartHintElement.style.display = "none";
      titleMessageLabelElement.textContent = errorMessage;
      titleMessageDotsElement.textContent = "";
      titleMessageDotsElement.style.display = "none";
      titleMessageProgressElement.textContent = "";
      titleMessageProgressElement.style.display = "none";
      return;
    }
    titleMessageElement.style.display = "none";
    titleStartHintElement.style.display = "block";
    titleMessageLabelElement.textContent = loadingMessageBase;
    titleMessageDotsElement.textContent = "";
    titleMessageDotsElement.style.display = "none";
    titleMessageProgressElement.textContent = "";
    titleMessageProgressElement.style.display = "none";
  };
  const startLoadingDots = () => {
    if (loadingDotTimerId !== null) {
      return;
    }
    loadingDotCount = 0;
    loadingDotTimerId = window.setInterval(() => {
      loadingDotCount = (loadingDotCount + 1) % 4;
      syncMessage();
    }, loadingDotIntervalMs);
  };
  const stopLoadingDots = () => {
    if (loadingDotTimerId !== null) {
      window.clearInterval(loadingDotTimerId);
      loadingDotTimerId = null;
    }
    loadingDotCount = 0;
  };

  titleStartHintElement.textContent = startHintMessage;
  titleMessageStatusElement.className = "title-message__status";
  titleMessageDotsElement.className = "title-message__dots";
  titleMessageProgressElement.className = "title-message__progress";
  titleMessageLabelElement.textContent = loadingMessageBase;
  titleMessageProgressElement.style.display = "none";
  titleMessageStatusElement.append(
    titleMessageLabelElement,
    titleMessageDotsElement
  );
  titleMessageElement.replaceChildren(
    titleMessageStatusElement,
    titleMessageProgressElement
  );
  syncModeMessage();
  syncMessage();

  return {
    setInstantExecutionMode: (enabled) => {
      instantExecutionMode = enabled;
      syncModeMessage();
      syncMessage();
    },
    setError: (message) => {
      errorMessage = message;
      syncMessage();
    },
    clearError: () => {
      errorMessage = null;
      syncMessage();
    },
    createLoadingSession: (initialTotal = 0) => {
      const wasInactive = activeLoadingSessionCount === 0;
      activeLoadingSessionCount += 1;
      loadingCompleted = 0;
      loadingTotal = initialTotal;
      if (wasInactive) {
        startLoadingDots();
      }
      syncMessage();
      let finished = false;
      return {
        setTotal: (count) => {
          if (finished || count < 0) {
            return;
          }
          loadingTotal = count;
          loadingCompleted = Math.min(loadingCompleted, loadingTotal);
          syncMessage();
        },
        advance: () => {
          if (finished) {
            return;
          }
          loadingCompleted = Math.min(loadingCompleted + 1, loadingTotal);
          syncMessage();
        },
        finish: () => {
          if (finished) {
            return;
          }
          finished = true;
          activeLoadingSessionCount = Math.max(activeLoadingSessionCount - 1, 0);
          if (activeLoadingSessionCount === 0) {
            stopLoadingDots();
            loadingCompleted = 0;
            loadingTotal = 0;
          }
          syncMessage();
        }
      };
    }
  };
};
