import { build } from "esbuild";
import { resolve } from "node:path";

// 計測器・負荷driverのfixtureをメモリ上で変換し、ゲームのbuild出力は作成しない。
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const bundle = await build({
  stdin: {
    contents: [
      'import { runMeasurementTests } from "./validation/v2/T07/measurement.test.ts";',
      'import { runMeasurementLifecycleTests } from "./validation/v2/T07/measurementLifecycle.test.ts";',
      'import { runStressWorkloadTests } from "./validation/v2/T07/stressWorkload.test.ts";',
      "export const results = [...runMeasurementTests(), ...await runMeasurementLifecycleTests(), ...await runStressWorkloadTests()];"
    ].join("\n"),
    resolveDir: repositoryRoot,
    sourcefile: "measurement-fixture-entry.ts"
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent"
});
const moduleUrl = "data:text/javascript;base64," +
  Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64");
const { results } = await import(moduleUrl);
const failures = results.filter((result) => !result.ok);
for (const result of results) {
  process.stdout.write((result.ok ? "PASS " : "FAIL ") + result.name + "\n");
  if (!result.ok) {
    process.stderr.write(result.detail + "\n");
  }
}
process.stdout.write("計測器・負荷driver fixture: " + (results.length - failures.length) + "/" + results.length + " PASS\n");
process.exitCode = failures.length === 0 ? 0 : 1;
