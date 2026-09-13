export type T063TestResult = Readonly<{
  name: string;
  ok: boolean;
  detail: string;
}>;

export const createT063Check = (
  name: string,
  ok: boolean,
  detail: string
): T063TestResult => Object.freeze({ name, ok, detail });
