import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const v2SourceRoot = path.join(repositoryRoot, "src/v2");
const indexHtmlPath = path.join(repositoryRoot, "index.html");

const bannedFiles = new Set(
  [
    "src/world/grid.ts",
    "src/world/stageContext.ts",
    "src/world/stageDefinition.ts",
    "src/world/stageSelection.ts",
    "src/game/gridUtils.ts",
    "src/game/npcNavigation.ts",
    "src/game/types.ts"
  ].map((relativePath) => path.join(repositoryRoot, relativePath))
);
const bannedIdentifiers = ["GridLayout", "FloorCell", "NavCellRef"];
const moduleSpecifierPattern =
  /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

const assertFileExists = async (filePath) => {
  await access(filePath);
  return filePath;
};

const collectV2TypeScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectV2TypeScriptFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }
  return files;
};

const resolveRelativeTypeScriptImport = async (ownerPath, specifier) => {
  const basePath = path.resolve(path.dirname(ownerPath), specifier);
  const candidates = specifier.endsWith(".ts")
    ? [basePath]
    : [basePath + ".ts", path.join(basePath, "index.ts")];
  for (const candidate of candidates) {
    try {
      return await assertFileExists(candidate);
    } catch {
      continue;
    }
  }
  return null;
};

const formatRepositoryPath = (filePath) =>
  path.relative(repositoryRoot, filePath).replaceAll(path.sep, "/");

const seeds = await collectV2TypeScriptFiles(v2SourceRoot);
const pending = [...seeds];
const visited = new Set();

const indexHtml = await readFile(indexHtmlPath, "utf8");
if (
  !indexHtml.includes('src="/src/v2/main.ts"') ||
  indexHtml.includes('src="/src/main.ts"')
) {
  throw new Error("通常Web入口は/src/v2/main.tsだけを参照する必要があります。");
}

while (pending.length > 0) {
  const filePath = pending.pop();
  if (visited.has(filePath)) {
    continue;
  }
  visited.add(filePath);

  if (bannedFiles.has(filePath)) {
    throw new Error(
      `V2実行依存へ旧セル実装が含まれています: ${formatRepositoryPath(filePath)}`
    );
  }

  const source = await readFile(filePath, "utf8");
  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error(`UTF-8 BOMを検出しました: ${formatRepositoryPath(filePath)}`);
  }
  if (source.toLowerCase().includes(".json")) {
    throw new Error(
      `V2実行依存でJSONファイルを参照しています: ${formatRepositoryPath(filePath)}`
    );
  }
  for (const identifier of bannedIdentifiers) {
    if (new RegExp(`\\b${identifier}\\b`).test(source)) {
      throw new Error(
        `V2実行依存へ旧セル識別子${identifier}が含まれています: ${formatRepositoryPath(filePath)}`
      );
    }
  }

  for (const match of source.matchAll(moduleSpecifierPattern)) {
    const specifier = match[1];
    if (specifier.endsWith(".json")) {
      throw new Error(
        `V2実行依存でJSON moduleを参照しています: ${formatRepositoryPath(filePath)} -> ${specifier}`
      );
    }
    if (!specifier.startsWith(".")) {
      continue;
    }
    const dependency = await resolveRelativeTypeScriptImport(
      filePath,
      specifier
    );
    if (dependency) {
      pending.push(dependency);
    }
  }
}

console.log(
  `V2依存監査 PASS: ${seeds.length}個のV2モジュール、${visited.size}個のTypeScript依存にJSONファイル・セル型・旧セル実装なし`
);
