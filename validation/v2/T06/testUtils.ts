export type T06TestResult = Readonly<{
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

export const assertThrows = (
  operation: () => unknown,
  message: string
) => {
  let thrown = false;
  try {
    operation();
  } catch {
    thrown = true;
  }
  assert(thrown, message);
};

export const executeTest = async (
  name: string,
  operation: () => string | Promise<string>
): Promise<T06TestResult> => {
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
