import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const worldDirectory = resolve(repositoryRoot, "src/world");
const runtimeFiles = [
  ...(await readdir(worldDirectory))
    .filter((name) => /^bitFlight.*\.ts$/u.test(name))
    .sort()
    .map((name) => `src/world/${name}`),
  "src/world/stageLinks.ts",
  "src/world/stageSpatialContext.ts",
  "src/world/stageSpatialQueries.ts",
  "src/v2/bitSystem.ts",
  "src/v2/survivalRuntime.ts"
];
const forbiddenTerms = ["school", "gym", "f01", "roof"];

const violations = [];
for (const relativePath of runtimeFiles) {
  const source = await readFile(resolve(repositoryRoot, relativePath), "utf8");
  for (const term of forbiddenTerms) {
    if (source.toLowerCase().includes(term)) {
      violations.push(`${relativePath}: ${term}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `共通飛行Runtimeにステージ固有文字列があります:\n${violations.join("\n")}`
  );
}

console.log(
  `T05共通飛行Runtime静的検査: ${runtimeFiles.length} files / ${forbiddenTerms.length} terms / PASS`
);
