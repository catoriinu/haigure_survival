export type TitleStartPreparationStatus =
  | "idle"
  | "scheduled"
  | "loading"
  | "ready";

export type TitleStartPreparationState<TAssignments, TRuntimeSettings> = {
  fingerprint: string | null;
  status: TitleStartPreparationStatus;
  assignments: TAssignments | null;
  runtimeSettings: TRuntimeSettings | null;
};

export type TitleStartPreparationRequest<TAssignments, TRuntimeSettings> = {
  fingerprint: string;
  loadingTotal: number;
  assignments: TAssignments;
  runtimeSettings: TRuntimeSettings;
};

export type TitleStartPreparationLoadingSession = {
  setTotal: (count: number) => void;
  advance: () => void;
  finish: () => void;
};

type TitleStartPreparationOptions<TAssignments, TRuntimeSettings> = {
  debounceMs: number;
  createLoadingSession: (
    initialTotal: number
  ) => TitleStartPreparationLoadingSession | null;
  prepare: (
    request: TitleStartPreparationRequest<TAssignments, TRuntimeSettings>,
    session?: TitleStartPreparationLoadingSession
  ) => Promise<void>;
  onStateChange?: (
    state: TitleStartPreparationState<TAssignments, TRuntimeSettings>
  ) => void;
};

export type TitleStartPreparationController<TAssignments, TRuntimeSettings> = {
  getState: () => TitleStartPreparationState<TAssignments, TRuntimeSettings>;
  markReady: (
    request: TitleStartPreparationRequest<TAssignments, TRuntimeSettings>
  ) => void;
  schedule: (
    request: TitleStartPreparationRequest<TAssignments, TRuntimeSettings>
  ) => void;
  ensureReady: (
    request: TitleStartPreparationRequest<TAssignments, TRuntimeSettings>
  ) => Promise<TitleStartPreparationState<TAssignments, TRuntimeSettings>>;
  flush: () => Promise<void>;
  cancelScheduled: () => void;
  invalidateReady: () => void;
};

export const createTitleStartPreparationController = <
  TAssignments,
  TRuntimeSettings
>({
  debounceMs,
  createLoadingSession,
  prepare,
  onStateChange
}: TitleStartPreparationOptions<TAssignments, TRuntimeSettings>): TitleStartPreparationController<
  TAssignments,
  TRuntimeSettings
> => {
  let state: TitleStartPreparationState<TAssignments, TRuntimeSettings> = {
    fingerprint: null,
    status: "idle",
    assignments: null,
    runtimeSettings: null
  };
  let latestRequest:
    | TitleStartPreparationRequest<TAssignments, TRuntimeSettings>
    | null = null;
  let activeRequest:
    | TitleStartPreparationRequest<TAssignments, TRuntimeSettings>
    | null = null;
  let activePromise: Promise<void> | null = null;
  let debounceTimerId: number | null = null;

  const notifyStateChange = () => {
    onStateChange?.({ ...state });
  };

  const setReadyState = (
    request: TitleStartPreparationRequest<TAssignments, TRuntimeSettings>
  ) => {
    state = {
      fingerprint: request.fingerprint,
      status: "ready",
      assignments: request.assignments,
      runtimeSettings: request.runtimeSettings
    };
    notifyStateChange();
  };

  const clearDebounceTimer = () => {
    if (debounceTimerId === null) {
      return;
    }
    window.clearTimeout(debounceTimerId);
    debounceTimerId = null;
  };

  const runLatestRequest = () => {
    if (activePromise || !latestRequest) {
      return;
    }
    clearDebounceTimer();
    const request = latestRequest;
    activeRequest = request;
    state = {
      ...state,
      status: "loading"
    };
    notifyStateChange();
    const session =
      request.loadingTotal > 0
        ? createLoadingSession(request.loadingTotal)
        : null;
    activePromise = (async () => {
      try {
        await prepare(request, session ?? undefined);
      } finally {
        session?.finish();
      }
    })();
    activePromise.finally(() => {
      activePromise = null;
      activeRequest = null;
      if (latestRequest?.fingerprint === request.fingerprint) {
        setReadyState(request);
      } else if (latestRequest) {
        state = {
          ...state,
          status: "scheduled"
        };
        notifyStateChange();
        runLatestRequest();
      } else if (state.status !== "ready") {
        state = {
          ...state,
          status: "idle"
        };
        notifyStateChange();
      }
    });
  };

  const schedule = (
    request: TitleStartPreparationRequest<TAssignments, TRuntimeSettings>
  ) => {
    latestRequest = request;
    if (
      !activePromise &&
      state.fingerprint === request.fingerprint &&
      state.status === "ready"
    ) {
      setReadyState(request);
      return;
    }
    if (activePromise) {
      state = {
        ...state,
        status: "loading"
      };
      notifyStateChange();
      return;
    }
    clearDebounceTimer();
    state = {
      ...state,
      status: "scheduled"
    };
    notifyStateChange();
    debounceTimerId = window.setTimeout(() => {
      debounceTimerId = null;
      runLatestRequest();
    }, debounceMs);
  };

  const flush = async () => {
    if (debounceTimerId !== null) {
      clearDebounceTimer();
      runLatestRequest();
    }
    if (activePromise) {
      await activePromise;
      if (activePromise) {
        await activePromise;
      }
    }
  };

  return {
    getState: () => ({ ...state }),
    markReady: (request) => {
      clearDebounceTimer();
      latestRequest = request;
      setReadyState(request);
    },
    schedule,
    ensureReady: async (request) => {
      const currentState = state;
      if (
        currentState.status === "ready" &&
        currentState.fingerprint === request.fingerprint
      ) {
        return { ...currentState };
      }
      schedule(request);
      await flush();
      return { ...state };
    },
    flush,
    cancelScheduled: () => {
      clearDebounceTimer();
      if (activePromise) {
        return;
      }
      latestRequest = null;
      if (state.status !== "ready") {
        state = {
          ...state,
          status: "idle"
        };
        notifyStateChange();
      }
    },
    invalidateReady: () => {
      clearDebounceTimer();
      latestRequest = null;
      if (activePromise) {
        return;
      }
      state = {
        fingerprint: null,
        status: "idle",
        assignments: null,
        runtimeSettings: null
      };
      notifyStateChange();
    }
  };
};
