import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const v2SourceRoot = path.join(repositoryRoot, "src/v2");
const indexHtmlPath = path.join(repositoryRoot, "index.html");

const retiredSourceRelativePaths = [
  "src/main.ts",
  "src/world/grid.ts",
  "src/world/room.ts",
  "src/world/stage.ts",
  "src/world/stageContext.ts",
  "src/world/stageJson.ts",
  "src/world/stageSelection.ts",
  "src/game/types.ts",
  "src/game/gridUtils.ts",
  "src/game/npcNavigation.ts",
  "src/game/alarm/system.ts",
  "src/game/beams.ts",
  "src/game/bits.ts",
  "src/game/characterBillboardMeshes.ts",
  "src/game/characterScene.ts",
  "src/game/dynamicBeam/candidates.ts",
  "src/game/dynamicBeam/system.ts",
  "src/game/dynamicBeam/types.ts",
  "src/game/entities.ts",
  "src/game/flow.ts",
  "src/game/flowFade.ts",
  "src/game/npcs.ts",
  "src/game/playerAbility.ts",
  "src/game/playerBeamHits.ts",
  "src/game/portraitSprites.ts",
  "src/game/publicExecutionController.ts",
  "src/game/roulette/spinProfile.ts",
  "src/game/roulette/system.ts",
  "src/game/roulette/types.ts",
  "src/game/runtimeFrame.ts",
  "src/game/targetUtils.ts",
  "src/game/trap/candidates.ts",
  "src/game/trap/system.ts",
  "src/game/trap/telegraph.ts",
  "src/game/trap/types.ts",
  "src/audio/voice.ts",
  "src/ui/hud.ts",
  "src/ui/input.ts",
  "src/ui/stageSelectControl.ts"
];
const retiredSourcePaths = new Set(
  retiredSourceRelativePaths.map((relativePath) =>
    path.join(repositoryRoot, relativePath)
  )
);
const validationSeedRelativePaths = [
  "validation/v2/T01/main.ts",
  "validation/v2/T02/main.ts",
  "validation/v2/T03/main.ts",
  "validation/v2/T04/main.ts",
  "vite.t01.config.mts",
  "vite.t02.config.mts",
  "vite.t03.config.mts",
  "vite.t04.config.mts"
];
const bannedIdentifiers = [
  "GridLayout",
  "FloorCell",
  "NavCellRef",
  "CellType",
  "StageSelection",
  "StageDefinitionV2",
  "ProceduralGridStageDefinitionV2",
  "GlbStageDefinitionV2",
  "cellToWorld",
  "worldToCell",
  "worldToCellClamped",
  "collectFloorCells",
  "mainMap",
  "cellPhysics"
];
const bannedPhrases = ["procedural-grid", "public/stage/"];
const staticModuleSpecifierPattern =
  /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const dynamicModuleSpecifierPattern = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
const jsonReferencePattern = /["'`]([^"'`]*?\.json(?:[?#][^"'`]*)?)["'`]/gi;

const formatRepositoryPath = (filePath) =>
  path.relative(repositoryRoot, filePath).replaceAll(path.sep, "/");

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const assertRetiredArtifactsAbsent = async () => {
  const existingSources = [];
  for (const filePath of retiredSourcePaths) {
    if (await fileExists(filePath)) {
      existingSources.push(formatRepositoryPath(filePath));
    }
  }
  if (existingSources.length > 0) {
    throw new Error(
      `撤去済みであるべき旧JSON・セル実装が残っています: ${existingSources.join(", ")}`
    );
  }

  const stageDirectory = path.join(repositoryRoot, "public/stage");
  let stageJsonFiles = [];
  try {
    stageJsonFiles = (await readdir(stageDirectory)).filter((name) =>
      name.toLowerCase().endsWith(".json")
    );
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  if (stageJsonFiles.length > 0) {
    throw new Error(
      `public/stageに旧マップJSONが残っています: ${stageJsonFiles.join(", ")}`
    );
  }
};

const collectTypeScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".mts"))
    ) {
      files.push(entryPath);
    }
  }
  return files;
};

const resolveRelativeTypeScriptImport = async (ownerPath, specifier) => {
  const basePath = path.resolve(path.dirname(ownerPath), specifier);
  const candidates = /\.(?:ts|mts)$/.test(specifier)
    ? [basePath]
    : [
        basePath + ".ts",
        basePath + ".mts",
        path.join(basePath, "index.ts"),
        path.join(basePath, "index.mts")
      ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
};

const collectModuleSpecifiers = (source) => [
  ...Array.from(source.matchAll(staticModuleSpecifierPattern), (match) => match[1]),
  ...Array.from(source.matchAll(dynamicModuleSpecifierPattern), (match) => match[1])
];

const refersToRetiredSource = (ownerPath, specifier) => {
  if (!specifier.startsWith(".")) {
    return false;
  }
  const basePath = path.resolve(path.dirname(ownerPath), specifier);
  const candidates = /\.(?:ts|mts)$/.test(specifier)
    ? [basePath]
    : [basePath + ".ts", path.join(basePath, "index.ts")];
  return candidates.some((candidate) => retiredSourcePaths.has(candidate));
};

const isAllowedNonMapJsonReference = (reference) => {
  const normalized = reference.replaceAll("\\", "/").toLowerCase();
  const withoutQuery = normalized.split(/[?#]/, 1)[0];
  const basename = path.posix.basename(withoutQuery);
  return (
    basename === "voicemanifest.json" ||
    basename.includes("setting") ||
    withoutQuery.includes("/settings/")
  );
};

const assertSourcePolicy = (filePath, source) => {
  const repositoryPath = formatRepositoryPath(filePath);
  if (source.charCodeAt(0) === 0xfeff) {
    throw new Error(`UTF-8 BOMを検出しました: ${repositoryPath}`);
  }

  for (const match of source.matchAll(jsonReferencePattern)) {
    const reference = match[1];
    if (!isAllowedNonMapJsonReference(reference)) {
      throw new Error(
        `V2へマップJSON参照が再流入しています: ${repositoryPath} -> ${reference}`
      );
    }
  }
  for (const identifier of bannedIdentifiers) {
    if (new RegExp(`\\b${identifier}\\b`).test(source)) {
      throw new Error(
        `V2へ旧セル識別子${identifier}が再流入しています: ${repositoryPath}`
      );
    }
  }
  for (const phrase of bannedPhrases) {
    if (source.includes(phrase)) {
      throw new Error(
        `V2へ旧マップ表現${phrase}が再流入しています: ${repositoryPath}`
      );
    }
  }

  const specifiers = collectModuleSpecifiers(source);
  for (const specifier of specifiers) {
    if (
      specifier.toLowerCase().endsWith(".json") &&
      !isAllowedNonMapJsonReference(specifier)
    ) {
      throw new Error(
        `V2へマップJSON moduleが再流入しています: ${repositoryPath} -> ${specifier}`
      );
    }
    if (refersToRetiredSource(filePath, specifier)) {
      throw new Error(
        `V2から撤去済みsourceを参照しています: ${repositoryPath} -> ${specifier}`
      );
    }
  }
  return specifiers;
};

const auditDependencyGraph = async (seeds) => {
  const pending = [...seeds];
  const visited = new Set();
  while (pending.length > 0) {
    const filePath = pending.pop();
    if (visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);

    if (retiredSourcePaths.has(filePath)) {
      throw new Error(
        `V2実行依存へ撤去済みsourceが含まれています: ${formatRepositoryPath(filePath)}`
      );
    }
    const source = await readFile(filePath, "utf8");
    const specifiers = assertSourcePolicy(filePath, source);
    for (const specifier of specifiers) {
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
  return visited;
};

await assertRetiredArtifactsAbsent();

const indexHtml = await readFile(indexHtmlPath, "utf8");
if (
  !indexHtml.includes('src="/src/v2/main.ts"') ||
  indexHtml.includes('src="/src/main.ts"')
) {
  throw new Error("通常Web入口は/src/v2/main.tsだけを参照する必要があります。");
}

const v2Seeds = await collectTypeScriptFiles(v2SourceRoot);
const v2Visited = await auditDependencyGraph(v2Seeds);
const validationSeeds = validationSeedRelativePaths.map((relativePath) =>
  path.join(repositoryRoot, relativePath)
);
for (const seed of validationSeeds) {
  if (!(await fileExists(seed))) {
    throw new Error(`T01〜T04監査入口がありません: ${formatRepositoryPath(seed)}`);
  }
}
const validationVisited = await auditDependencyGraph(validationSeeds);

console.log(
  `V2依存監査 PASS: 旧source ${retiredSourceRelativePaths.length}件・public/stageマップJSONなし、` +
    `${v2Seeds.length}個のV2モジュール／${v2Visited.size}個の実行依存、` +
    `T01〜T04 main・viteと${validationVisited.size}個の検証依存にマップJSON・旧セル識別子・旧source importなし`
);
