export type T062TestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

export const assert: (
  condition: boolean,
  message: string
) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const captureThrownMessage = (operation: () => unknown) => {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

export const createSequenceRandom = (
  values: readonly number[],
  fallback = 0.5
) => {
  let index = 0;
  return Object.freeze({
    random: () => {
      const value = values[index] ?? fallback;
      index += 1;
      return value;
    },
    getCallCount: () => index
  });
};

export const createSeededRandom = (initialState = 0x6d2b_79f5) => {
  let state = initialState >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

export const executeTest = async (
  name: string,
  operation: () => string | Promise<string>
): Promise<T062TestResult> => {
  try {
    return Object.freeze({
      name,
      ok: true,
      detail: await operation()
    });
  } catch (error) {
    return Object.freeze({
      name,
      ok: false,
      detail:
        error instanceof Error
          ? error.stack ?? error.message
          : String(error)
    });
  }
};
